// worker.js — Anvil's rebuild worker. Runs Kernel.rebuild off the main thread so the UI stays responsive while a
// heavy feature tree builds. No DOM, no three.js: only csg.js, kernel.js, holewizard.js and exchange.js are loaded (paths relative to
// this file).
//
// Messages in (from ui-core.js):
//   { type: 'rebuild', seq: <number>, model: <model JSON> }
//     `model` is a structured clone of App.model; Kernel.rebuild writes sketch profiles onto this copy, which is
//     harmless here and is how the reply's `profiles` are produced.
//   { type: 'preview', seq, model, upto: <feature count | null>, op: 'tool' | 'shell' | 'edge' | 'flange' | 'jog', feature, throughLimit, sketches? }
//     a PropertyManager live preview (ui-core.js UI.previewInWorker): the model (its first `upto` features when set) is
//     built with the rebuild cache, then the feature being edited is built on it without joining the part:
//     'tool' Kernel.buildTool (extrude, revolve, sweep, loft, patterns, mirror, base flange), 'shell' Kernel.buildShell's
//     cavity, 'edge' Kernel.buildEdgeFeature's cut / add, 'flange' Kernel.buildFlange (edge flange, hem), 'jog' Kernel.buildJog.
// Messages out:
//   { type: 'built', seq, build: <Kernel.packBuild result>, edges: <Kernel.bodyEdges of its mesh> | null,
//     curves: <Kernel.meshCurveInfo of it> | null, normals: <Kernel.analyticNormals of it> | null }   (r3/engine3)
//                                                              with the packed solids' ArrayBuffers transferred
//   { type: 'volume', seq, volume }                            right after 'built': Kernel.massProps(mesh).volume
//   { type: 'error', seq, message: <string> }                  when the rebuild itself threw (feature errors never do;
//                                                              they are reported inside build.errors)
//   { type: 'previewed', seq, tools: [packedCSG | null], info: { count?, removed? }, ms, base? }   (buffers transferred)
//     base (r10/editpreview10, when the message asked for `base: <feature count>`): the part rolled back to its first
//     `base` features, for Edit Feature's rollback (ui-core.js rollbackTo): { upto, build: <packBuild>, edges, curves, normals }.
//     op 'base' builds only that (tools: []).
//   { type: 'previewError', seq, message }
// The worker keeps the rebuild cache between messages, so only the features after the first change are rebuilt.
// Previews of a truncated model (editing a feature in the middle of the tree) keep a cache of their own, so the main
// cache is not thrown away and repeated previews reuse the whole prefix.
importScripts('csg.js', 'kernel.js', 'holewizard.js', 'exchange.js'); // holewizard.js and exchange.js register the Hole and Imported features

var cache = null, previewCache = null;

// the extras ui-core.js applyBuild takes from a worker build: the edges, curved faces and normals of its mesh
function meshExtras(packed) {
  var out = { edges: null, curves: null, normals: null };
  try {
    var mirror = Kernel.unpackBuild(packed), mesh = mirror.body ? Kernel.meshFromBody(mirror.body) : null;
    if (mesh) out.edges = Kernel.bodyEdges(mesh);
    if (mesh && Kernel.meshCurveInfo) { try { out.curves = Kernel.meshCurveInfo(mesh); } catch (e) { } }
    if (mesh && Kernel.analyticNormals) { try { out.normals = Kernel.analyticNormals(mesh); } catch (e2) { } }
  } catch (e3) { }
  return out;
}

function preview(m) {
  var t0 = performance.now(), model = m.model, all = model.features, full = m.upto == null || m.upto >= model.features.length;
  if (!full) model.features = model.features.slice(0, m.upto);
  var b = Kernel.rebuild(model, full ? cache : (previewCache || cache));
  if (full) cache = b.cache; else previewCache = b.cache;
  var f = m.feature, tools = [], info = {}, base = null, transfer = [];
  if (m.base != null) {
    // r10/editpreview10: the rolled-back part (usually the same truncated build the feature is previewed on)
    var bb = b, bm = model;
    if (full || m.base !== m.upto) {
      bm = {}; Object.keys(model).forEach(function (k) { bm[k] = model[k]; });
      bm.features = all.slice(0, m.base);
      bb = Kernel.rebuild(bm, previewCache || cache); previewCache = bb.cache;
    }
    var pb = Kernel.packBuild(bb, bm), ex = meshExtras(pb);
    base = { upto: m.base, build: pb, edges: ex.edges, curves: ex.curves, normals: ex.normals };
    transfer = Kernel.packTransferables(pb);
    if (ex.normals) transfer.push(ex.normals.buffer);
  }
  if (m.op === 'base') {
    // r10/editpreview10: only the rolled-back part
  } else if (m.op === 'shell') {
    var sh = Kernel.buildShell(f, { body: b.body });
    tools = [sh.inner]; info.removed = sh.removed.length;
  } else if (m.op === 'edge') {
    var r = Kernel.buildEdgeFeature(f, { body: b.body });
    tools = [r.cut || null, r.add || null]; info.count = r.count;
  } else if (m.op === 'flange') {
    tools = [Kernel.buildFlange(f, Kernel.resolvedModel(model).model, { body: b.body, flanges: {} })];
  } else if (m.op === 'jog') {
    var jg = Kernel.buildJog(f, Kernel.resolvedModel(model).model, { body: b.body, flanges: {}, tools: {} });
    tools = [jg.first.union(jg.second)];
  } else {
    // m.sketches: sketches the previewed feature uses that are not in the model yet (the Hole Wizard's points, r3/engine3)
    var ctx = { tools: b.tools, planes: b.planes, sketches: m.sketches || {}, body: b.body, throughLimit: m.throughLimit };
    tools = [Kernel.buildTool(f, Kernel.resolvedModel(model).model, ctx) || null];
  }
  var packed = tools.map(function (t) { return t ? t.pack() : null; });
  packed.forEach(function (p) { if (p) transfer = transfer.concat(CSG.packTransferables(p)); });
  self.postMessage({ type: 'previewed', seq: m.seq, tools: packed, info: info, ms: performance.now() - t0, base: base }, transfer);
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
    var edges = null, mesh = null, curves = null, normals = null;
    try {
      var mirror = Kernel.unpackBuild(packed), mesh = mirror.body ? Kernel.meshFromBody(mirror.body) : null;
      if (mesh) edges = Kernel.bodyEdges(mesh);
      // and its curved faces and true circles (Kernel.meshCurveInfo: ui-core.js annotateCurveEdges, faceGroups) (r3/engine3)
      if (mesh && Kernel.meshCurveInfo) { try { curves = Kernel.meshCurveInfo(mesh); } catch (e4) { curves = null; } }
      if (mesh && Kernel.analyticNormals) { try { normals = Kernel.analyticNormals(mesh); } catch (e5) { normals = null; } }
    } catch (e2) { edges = null; mesh = null; }
    var transfer = Kernel.packTransferables(packed);
    if (normals) transfer.push(normals.buffer);
    self.postMessage({ type: 'built', seq: m.seq, build: packed, edges: edges, curves: curves, normals: normals }, transfer);
    // then the mesh's volume, which ui-occt.js compares OpenCascade's with (massProps of a large mesh: tens of ms)
    if (mesh) { try { self.postMessage({ type: 'volume', seq: m.seq, volume: mesh.triCount ? Kernel.massProps(mesh, 1).volume : 0 }); } catch (e3) { } }
  } catch (err) {
    cache = null;
    self.postMessage({ type: 'error', seq: m.seq, message: (err && err.message) || String(err) });
  }
};
