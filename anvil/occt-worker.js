// occt-worker.js — the OpenCascade kernel's worker (a module worker: opencascade.js is an ES module). Started by
// ui-core.js only while Tools ▸ OpenCascade kernel is on, so the 50 MB engine never loads otherwise. Loads csg.js,
// kernel.js, holewizard.js, exchange.js and occt-kernel.js as classic scripts (their top-level `var`s become
// globals through an indirect eval), then OpenCascade from vendor/occt (fetched by vendor/get-occt.ps1).
//
// Messages in:   { type: 'build', seq, model, exports?, cacheKey?, noCache? }  model: a clone of App.model (or an assembly's
//                  part); exports adds STEP / IGES text; cacheKey picks a per-part rebuild cache
//                { type: 'import', seq, format, text }    a STEP / IGES file read and tessellated (-> 'imported' / 'importError')
// Messages out:  { type: 'ready', loadMs }                once, when OpenCascade has loaded
//                { type: 'built', seq, result }           OcctKernel.build's result (mesh arrays transferred)
//                                                         result.edges: Kernel.bodyEdges of the mesh it makes (parts)
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
    // the edges of the mesh the main thread will make from this result (OcctKernel.toBuild -> Kernel.meshFromBody; the
    // faces group by plane, body and B-rep face only, so no Anvil build is needed for it): ui-occt.js hands them to
    // applyBuild, which then skips Kernel.bodyEdges (tens to hundreds of ms on the main thread) (smooth/responsive)
    if (r.mesh && r.valid && m.part == null) {
      try { const tb = OcctKernel.toBuild(r, {}, null, null, self.CSG, self.Kernel); r.edges = tb.body ? self.Kernel.bodyEdges(self.Kernel.meshFromBody(tb.body)) : null; } catch (e) { r.edges = null; }
    }
    const transfer = r.mesh ? [r.mesh.positions.buffer, r.mesh.faceOf.buffer] : [];
    self.postMessage({ type: 'built', seq: m.seq, part: m.part, result: r }, transfer);
  } catch (err) {
    if (m.cacheKey) caches.delete(m.cacheKey); else cache = {};   // a build that threw may have left the snapshots half-updated
    self.postMessage({ type: 'error', seq: m.seq, part: m.part, message: (err && err.message) || String(err) });
  }
};
