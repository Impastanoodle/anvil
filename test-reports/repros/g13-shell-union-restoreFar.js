// lane GC (local-2026-10-30b): rfGA G13 (box, R0.5 vertical rounds, R0.25 bottom round, shell 0.1) with the shell guard off: the top-level
// union of two closed shell halves comes back with 12 open edges with CSG.options.restoreFar on (closes with it off). Run from
// this folder with the repo root as cwd: node test-reports/repros/g13-shell-union-restoreFar.js (the helper g13-helper-funnel.js
// loads the engine; fix its require path if it points at a worktree). Owner: csg.js.
var H = require('./g13-helper-funnel.js'), K = H.K, E = H.E, CSG = E.CSG, fs = require('fs');
var pre = 'p.units("in"); p.sketch("Top").centerRect(0, 0, 4, 3).end().extrude(2); p.fillet(0.5, [[2, 1, 1.5], [2, 1, -1.5], [-2, 1, 1.5], [-2, 1, -1.5]]); p.fillet(0.25, [[0, 0, 1.5]]);';
var r0 = H.build(pre);
function nOpen(b) { var c = E.Evaluate.checkBody(b); return c.openEdges.length + (c.nonManifoldEdges || []).length; }
K.shellGuard.on = false;
var m = K.newModel('T'); K.runScript(m, pre + ' p.shell(0.1, [[0, 2, 0]]);');
var sf = m.features.filter(function (f) { return f.type === 'shell'; })[0];
var ou = CSG.prototype.union, calls = [], depth = 0;
CSG.prototype.union = function (b) {
  depth++;
  var r = ou.call(this, b);
  depth--;
  if (depth === 0) calls.push({ a: this, b: b, r: r });
  return r;
};
var out = K.buildShell(sf, { body: r0.body, units: m.units });
CSG.prototype.union = ou;
console.log('unions', calls.length, 'shell open', nOpen(out.body));
var P = [-1.811, 0.166, 1.207];
function near(c) { return c.polygons.some(function (p) { return p.vertices.some(function (v) { return Math.hypot(v.pos.x - P[0], v.pos.y - P[1], v.pos.z - P[2]) < 0.05; }); }); }
var firstBad = null;
calls.forEach(function (c, i) {
  var oa = nOpen(c.a), ob = nOpen(c.b), orr = nOpen(c.r);
  if (orr > oa + ob && near(c.r)) {
    console.log('union', i, 'open a', oa, 'b', ob, '-> r', orr, 'polys', c.a.polygons.length, c.b.polygons.length, '->', c.r.polygons.length);
    if (!firstBad && oa === 0 && ob === 0) firstBad = c;
  }
});
function dump(c) { return c.polygons.map(function (p) { return p.vertices.map(function (v) { return [v.pos.x, v.pos.y, v.pos.z]; }); }); }
if (firstBad) {
  fs.writeFileSync('g13_repro.json', JSON.stringify({ A: dump(firstBad.a), B: dump(firstBad.b) }));
  // replay from the dump (fresh CSG from plain polygons)
  function mk(list) { return CSG.fromPolygons(list.map(function (pts) { return new CSG.Polygon(pts.map(function (q) { return new CSG.Vertex(new CSG.Vector(q[0], q[1], q[2]), new CSG.Vector(0, 0, 1)); })); })); }
  var A = mk(dump(firstBad.a)), B = mk(dump(firstBad.b)), R = A.union(B);
  console.log('replay: open a', nOpen(A), 'b', nOpen(B), 'union', nOpen(R));
  CSG.options.restoreFar = false; var R2 = mk(dump(firstBad.a)).union(mk(dump(firstBad.b))); CSG.options.restoreFar = true;
  console.log('replay restoreFar off: union', nOpen(R2));
}
