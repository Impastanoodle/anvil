// worker.js — Anvil's rebuild worker. Runs Kernel.rebuild off the main thread so the UI stays responsive while a
// heavy feature tree builds. No DOM, no three.js: only csg.js, kernel.js, holewizard.js and exchange.js are loaded (paths relative to
// this file).
//
// Messages in (from ui-core.js):
//   { type: 'rebuild', seq: <number>, model: <model JSON> }
//     `model` is a structured clone of App.model; Kernel.rebuild writes sketch profiles onto this copy, which is
//     harmless here and is how the reply's `profiles` are produced.
//   { type: 'preview', seq, model, upto: <feature count | null>, op: 'tool' | 'shell' | 'edge', feature, throughLimit }
//     a PropertyManager live preview (ui-core.js UI.previewInWorker): the model (its first `upto` features when set) is
//     built with the rebuild cache, then the feature being edited is built on it without joining the part:
//     'tool' Kernel.buildTool (extrude, revolve, sweep, loft, patterns, mirror, base flange), 'shell' Kernel.buildShell's
//     cavity, 'edge' Kernel.buildEdgeFeature's cut / add.
// Messages out:
//   { type: 'built', seq, build: <Kernel.packBuild result>, edges: <Kernel.bodyEdges of its mesh> | null }
//                                                              with the packed solids' ArrayBuffers transferred
//   { type: 'volume', seq, volume }                            right after 'built': Kernel.massProps(mesh).volume
//   { type: 'error', seq, message: <string> }                  when the rebuild itself threw (feature errors never do;
//                                                              they are reported inside build.errors)
//   { type: 'previewed', seq, tools: [packedCSG | null], info: { count?, removed? }, ms }   (buffers transferred)
//   { type: 'previewError', seq, message }
// The worker keeps the rebuild cache between messages, so only the features after the first change are rebuilt.
// Previews of a truncated model (editing a feature in the middle of the tree) keep a cache of their own, so the main
// cache is not thrown away and repeated previews reuse the whole prefix.
importScripts('csg.js', 'kernel.js', 'holewizard.js', 'exchange.js'); // holewizard.js and exchange.js register the Hole and Imported features

var cache = null, previewCache = null;

function preview(m) {
  var t0 = performance.now(), model = m.model, full = m.upto == null || m.upto >= model.features.length;
  if (!full) model.features = model.features.slice(0, m.upto);
  var b = Kernel.rebuild(model, full ? cache : (previewCache || cache));
  if (full) cache = b.cache; else previewCache = b.cache;
  var f = m.feature, tools = [], info = {};
  if (m.op === 'shell') {
    var sh = Kernel.buildShell(f, { body: b.body });
    tools = [sh.inner]; info.removed = sh.removed.length;
  } else if (m.op === 'edge') {
    var r = Kernel.buildEdgeFeature(f, { body: b.body });
    tools = [r.cut || null, r.add || null]; info.count = r.count;
  } else {
    var ctx = { tools: b.tools, planes: b.planes, sketches: {}, body: b.body, throughLimit: m.throughLimit };
    tools = [Kernel.buildTool(f, Kernel.resolvedModel(model).model, ctx) || null];
  }
  var packed = tools.map(function (t) { return t ? t.pack() : null; }), transfer = [];
  packed.forEach(function (p) { if (p) transfer = transfer.concat(CSG.packTransferables(p)); });
  self.postMessage({ type: 'previewed', seq: m.seq, tools: packed, info: info, ms: performance.now() - t0 }, transfer);
}

self.onmessage = function (e) {
  var m = e.data || {};
  if (m.type === 'preview') {
    try { preview(m); }
    catch (err) { self.postMessage({ type: 'previewError', seq: m.seq, message: (err && err.message) || String(err) }); }
    return;
  }
  if (m.type !== 'rebuild') return;
  try {
    var b = Kernel.rebuild(m.model, cache);
    cache = b.cache;
    var packed = Kernel.packBuild(b, m.model);
    // the body's edges (Kernel.bodyEdges, hundreds of ms on a large part) are found here too, on exactly the mesh the
    // main thread will make from the packed bodies, so applyBuild does not have to
    var edges = null, mesh = null;
    try {
      var mirror = Kernel.unpackBuild(packed), mesh = mirror.body ? Kernel.meshFromBody(mirror.body) : null;
      if (mesh) edges = Kernel.bodyEdges(mesh);
    } catch (e2) { edges = null; mesh = null; }
    self.postMessage({ type: 'built', seq: m.seq, build: packed, edges: edges }, Kernel.packTransferables(packed));
    // then the mesh's volume, which ui-occt.js compares OpenCascade's with (massProps of a large mesh: tens of ms)
    if (mesh) { try { self.postMessage({ type: 'volume', seq: m.seq, volume: mesh.triCount ? Kernel.massProps(mesh, 1).volume : 0 }); } catch (e3) { } }
  } catch (err) {
    cache = null;
    self.postMessage({ type: 'error', seq: m.seq, message: (err && err.message) || String(err) });
  }
};
