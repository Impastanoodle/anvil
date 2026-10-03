// occt-worker.js — the OpenCascade kernel's worker (a module worker: opencascade.js is an ES module). Started by
// ui-core.js only while Tools ▸ OpenCascade kernel is on, so the 50 MB engine never loads otherwise. Loads csg.js,
// kernel.js, holewizard.js, exchange.js and occt-kernel.js as classic scripts (their top-level `var`s become
// globals through an indirect eval), then OpenCascade from vendor/occt (fetched by vendor/get-occt.ps1).
//
// Messages in:   { type: 'build', seq, model, exports?, cacheKey?, noCache?, anvil? }  model: a clone of App.model (or an assembly's
//                  part); exports adds STEP / IGES text; cacheKey picks a per-part rebuild cache
//                { type: 'import', seq, format, text }    a STEP / IGES file read and tessellated (-> 'imported' / 'importError')
// Messages out:  { type: 'ready', loadMs }                once, when OpenCascade has loaded
//                { type: 'built', seq, result }           OcctKernel.build's result (mesh arrays transferred)
//                                                         result.edges: Kernel.bodyEdges of the mesh it makes (parts),
//                                                         result.curves / normals: its Kernel.meshCurveInfo / analyticNormals,
//                                                         result.packed: its bodies (OcctKernel.toBodies) packed, when
//                                                         anvil { key, positions, triShared } (the Anvil mesh) came along
//                { type: 'error', seq, message }          the build itself threw, or the engine could not load
import opencascade from './vendor/occt/opencascade.full.js';

async function classic(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ': HTTP ' + res.status);
  (0, eval)((await res.text()) + '\n//# sourceURL=' + new URL(url, self.location.href).href);
}

// the rebuild cache (OcctKernel.build opts.cache): snapshots after each feature, reused while the prefix is unchanged
let cache = {};
// assemblies: one cache per part (message cacheKey), the most recent 32 kept
const caches = new Map();
// an evicted cache frees its snapshot handles (OpenCascade objects are not garbage collected)
function freeCache(c) {
  (c.states || []).forEach((S) => S.bodies.forEach((b) => { try { b.delete(); } catch (e) { } }));
  Object.values(c.tools || {}).forEach((t) => { try { t.delete(); } catch (e) { } });
}
function cacheFor(key) {
  if (!key) return cache;
  let c = caches.get(key);
  if (!c) {
    c = {}; caches.set(key, c);
    if (caches.size > 32) { const old = caches.keys().next().value; freeCache(caches.get(old)); caches.delete(old); }
  }
  return c;
}

const ready = (async () => {
  for (const f of ['csg.js', 'kernel.js', 'holewizard.js', 'exchange.js', 'occt-kernel.js']) await classic(f);
  const t0 = performance.now();
  const oc = await new opencascade({ locateFile: (p) => './vendor/occt/' + p });
  const loadMs = performance.now() - t0;
  self.postMessage({ type: 'ready', loadMs });
  return oc;
})();
ready.catch((e) => self.postMessage({ type: 'error', seq: -1, message: 'OpenCascade did not load: ' + ((e && e.message) || e) + ' (run vendor/get-occt.ps1)' }));

self.onmessage = async (e) => {
  const m = e.data || {};
  let oc;
  try { oc = await ready; } catch (err) { if (m.type === 'import') self.postMessage({ type: 'importError', seq: m.seq, message: 'OpenCascade is not installed (run vendor/get-occt.ps1).' }); return; }
  // { type: 'import', seq, format: 'step' | 'iges', text } -> { type: 'imported', seq, result: OcctKernel.importFile(...) }
  if (m.type === 'import') {
    try { self.postMessage({ type: 'imported', seq: m.seq, result: OcctKernel.importFile(oc, m.format, m.text) }); }
    catch (err) { self.postMessage({ type: 'importError', seq: m.seq, message: (err && err.message) || String(err) }); }
    return;
  }
  if (m.type !== 'build') return;
  try {
    const r = OcctKernel.build(oc, self.Kernel, m.model, { chord: m.chord, exports: !!m.exports, cache: m.noCache ? null : cacheFor(m.cacheKey) });
    // the main thread's work on the result is done here too (r3/engine3; the edges since smooth/responsive): the solids
    // as Anvil bodies (OcctKernel.toBodies, tagged with the features of m.anvil, the Anvil mesh on screen: positions and
    // triShared), packed for ui-occt.js to unpack (OcctKernel.fromPacked) instead of running toBuild; and on the mesh the
    // main thread will make from them (Kernel.meshFromBody), its edges, curved faces / true circles and smooth normals,
    // which applyBuild then uses instead of computing them
    const transfer = r.mesh ? [r.mesh.positions.buffer, r.mesh.faceOf.buffer] : [];
    if (r.mesh && r.valid && m.part == null) {
      try {
        const K = self.Kernel, A = m.anvil || null;
        const bodies = OcctKernel.toBodies(r, A && A.positions ? { positions: A.positions } : null, A ? A.triShared : null, self.CSG);
        const body = K.combineBodies(bodies);
        const mesh = body ? K.meshFromBody(body) : null;
        r.edges = mesh ? K.bodyEdges(mesh) : null;
        try { r.curves = mesh && K.meshCurveInfo ? K.meshCurveInfo(mesh) : null; } catch (e2) { r.curves = null; }
        try { r.normals = mesh && K.analyticNormals ? K.analyticNormals(mesh) : null; } catch (e3) { r.normals = null; }
        if (r.normals) transfer.push(r.normals.buffer);
        if (A) {
          r.packed = bodies.map((b) => b.pack());
          r.packed.forEach((p) => { for (const buf of self.CSG.packTransferables(p)) transfer.push(buf); });
          r.anvilKey = A.key;
        }
      } catch (e) { r.edges = null; r.curves = null; r.normals = null; r.packed = null; }
    }
    self.postMessage({ type: 'built', seq: m.seq, part: m.part, result: r }, transfer);
  } catch (err) {
    if (m.cacheKey) caches.delete(m.cacheKey); else cache = {};   // a build that threw may have left the snapshots half-updated
    self.postMessage({ type: 'error', seq: m.seq, part: m.part, message: (err && err.message) || String(err) });
  }
};
