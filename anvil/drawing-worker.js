// drawing-worker.js — works out drawing views off the main thread (r12/drawui12). Opening a drawing used to block the
// page for 100–200 ms while projectView removed hidden lines for the four standard views; the sheet now shows at once
// (border, title block, a placeholder frame where each view goes) and each view's linework drops in as this worker
// finishes it. No DOM: only csg.js, kernel.js and drawing.js (its `Drawing` half) are loaded.
//
// Messages in (from drawing.js, the UI half):
//   { type: 'mesh', id, mesh }   the part / assembly mesh the jobs that follow are about (a structured clone of App.mesh
//                                without its _drawing* caches); the worker keeps the last one only
//   { type: 'project', id, job, frame: { name, e, u, v }, display, tangent }
//   { type: 'section', id, job, section: { e, w }, frame, display, tangent }   (r13/drawings13) a section view: the CSG
//                                cut, its projection and cap loops (Drawing.sectionJob)
// Messages out:
//   { type: 'projected', id, job, proj, ms }   Drawing.projectView(mesh, frame, { display, tangent })
//   { type: 'sectioned', id, job, result, ms } Drawing.sectionJob(mesh, section, frame, display, tangent)
//   { type: 'failed', id, job, message }      the main thread then works that view out itself
importScripts('csg.js', 'kernel.js', 'sketch-font.js', 'kernel-sketch.js', 'kernel-curves.js', 'kernel-equations.js', 'kernel-mesh.js', 'kernel-rebuild.js', 'kernel-features.js', 'kernel-sheetmetal.js', 'kernel-script.js', 'drawing.js', 'drawing-curves.js', 'drawing-hlr.js', 'drawing-views.js', 'drawing-sheet.js', 'drawing-annotations.js', 'drawing-render.js');

var current = { id: null, mesh: null };
// a structured clone has plain objects for the CSG polygons; the section cut (CSG intersect) needs real ones
function revive(mesh) {
  if (mesh._revived) return mesh;
  mesh.faces.forEach(function (f) {
    f.polys = (f.polys || []).map(function (p) {
      var vs = p.vertices.map(function (v) { return new CSG.Vertex(new CSG.Vector(v.pos.x, v.pos.y, v.pos.z)); });
      var n = p.plane.normal, q = new CSG.Polygon(vs, p.shared, new CSG.Plane(new CSG.Vector(n.x, n.y, n.z), p.plane.w));
      q.surf = p.surf || null;
      if (p.face != null) q.face = p.face;
      if (p.part != null) q.part = p.part;
      if (p.body != null) q.body = p.body;
      return q;
    });
  });
  Object.defineProperty(mesh, '_revived', { value: true, enumerable: false });
  return mesh;
}
self.onmessage = function (ev) {
  var m = ev.data || {};
  if (m.type === 'mesh') { current = { id: m.id, mesh: m.mesh }; return; }
  if (m.type !== 'project' && m.type !== 'section') return;
  if (m.id !== current.id || !current.mesh) { self.postMessage({ type: 'failed', id: m.id, job: m.job, message: 'no mesh' }); return; }
  var t0 = Date.now();
  try {
    if (m.type === 'section') {
      var r = Drawing.sectionJob(revive(current.mesh), m.section, m.frame, m.display, m.tangent);
      self.postMessage({ type: 'sectioned', id: m.id, job: m.job, result: r, ms: Date.now() - t0 });
      return;
    }
    var proj = Drawing.projectView(current.mesh, m.frame, { display: m.display, tangent: m.tangent });
    self.postMessage({ type: 'projected', id: m.id, job: m.job, proj: proj, ms: Date.now() - t0 });
  } catch (e) {
    self.postMessage({ type: 'failed', id: m.id, job: m.job, message: String(e && e.message || e) });
  }
};
