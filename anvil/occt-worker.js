// occt-worker.js — the OpenCascade kernel's worker (a module worker: opencascade.js is an ES module). Started by
// ui-core.js only while Tools ▸ OpenCascade kernel is on, so the 50 MB engine never loads otherwise. Loads csg.js,
// kernel.js, holewizard.js, exchange.js and occt-kernel.js as classic scripts (their top-level `var`s become
// globals through an indirect eval), then OpenCascade from vendor/occt (fetched by vendor/get-occt.ps1).
//
// Messages in:   { type: 'build', seq, model, exports? }  model: a structured clone of App.model; exports adds STEP / IGES text
//                { type: 'import', seq, format, text }    a STEP / IGES file read and tessellated (-> 'imported' / 'importError')
// Messages out:  { type: 'ready', loadMs }                once, when OpenCascade has loaded
//                { type: 'built', seq, result }           OcctKernel.build's result (mesh arrays transferred)
//                { type: 'error', seq, message }          the build itself threw, or the engine could not load
import opencascade from './vendor/occt/opencascade.full.js';

async function classic(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ': HTTP ' + res.status);
  (0, eval)((await res.text()) + '\n//# sourceURL=' + new URL(url, self.location.href).href);
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
    const r = OcctKernel.build(oc, self.Kernel, m.model, { chord: m.chord, exports: !!m.exports });
    const transfer = r.mesh ? [r.mesh.positions.buffer, r.mesh.faceOf.buffer] : [];
    self.postMessage({ type: 'built', seq: m.seq, result: r }, transfer);
  } catch (err) {
    self.postMessage({ type: 'error', seq: m.seq, message: (err && err.message) || String(err) });
  }
};
