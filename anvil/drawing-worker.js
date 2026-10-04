// drawing-worker.js — works out drawing views off the main thread (r12/drawui12). Opening a drawing used to block the
// page for 100–200 ms while projectView removed hidden lines for the four standard views; the sheet now shows at once
// (border, title block, a placeholder frame where each view goes) and each view's linework drops in as this worker
// finishes it. No DOM: only csg.js, kernel.js and drawing.js (its `Drawing` half) are loaded.
//
// Messages in (from drawing.js, the UI half):
//   { type: 'mesh', id, mesh }   the part / assembly mesh the jobs that follow are about (a structured clone of App.mesh
//                                without its _drawing* caches); the worker keeps the last one only
//   { type: 'project', id, job, frame: { name, e, u, v }, display, tangent }
// Messages out:
//   { type: 'projected', id, job, proj, ms }   Drawing.projectView(mesh, frame, { display, tangent })
//   { type: 'failed', id, job, message }      the main thread then works that view out itself
importScripts('csg.js', 'kernel.js', 'drawing.js');

var current = { id: null, mesh: null };
self.onmessage = function (ev) {
  var m = ev.data || {};
  if (m.type === 'mesh') { current = { id: m.id, mesh: m.mesh }; return; }
  if (m.type !== 'project') return;
  if (m.id !== current.id || !current.mesh) { self.postMessage({ type: 'failed', id: m.id, job: m.job, message: 'no mesh' }); return; }
  var t0 = Date.now();
  try {
    var proj = Drawing.projectView(current.mesh, m.frame, { display: m.display, tangent: m.tangent });
    self.postMessage({ type: 'projected', id: m.id, job: m.job, proj: proj, ms: Date.now() - t0 });
  } catch (e) {
    self.postMessage({ type: 'failed', id: m.id, job: m.job, message: String(e && e.message || e) });
  }
};
