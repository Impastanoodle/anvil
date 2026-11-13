// lane MJ (2026-11-13): the union of two closed shell halves that cracks (rfGA G13's top union, number 223), in situ,
// under each CSG.options switch. On main the shell no longer makes these two halves (G13 closes on the first attempt),
// so this runs on the kernel of commit 1f42c07 with the csg.js under test:
//   git archive --format=tar --output=old.tar 1f42c07 anvil test-reports/repros ; unpack into an empty folder ;
//   copy today's anvil/csg.js and this file in (this file to the folder's root) ; node g13-union-options.js
// Result 2026-11-13: 10 open + 2 non-manifold edges by default AND with restoreFar off (two needle holes whose short
// edge is 7e-6, two needle flaps); heal off 28 + 3; restoreWhole off 9 + 4. The exact retry gives a 6-edge hole.
var H = require('./test-reports/repros/g13-helper-funnel.js'), K = H.K, E = H.E, CSG = E.CSG, fs = require('fs');
var pre = 'p.units("in"); p.sketch("Top").centerRect(0, 0, 4, 3).end().extrude(2); p.fillet(0.5, [[2, 1, 1.5], [2, 1, -1.5], [-2, 1, 1.5], [-2, 1, -1.5]]); p.fillet(0.25, [[0, 0, 1.5]]);';
var r0 = H.build(pre);
function chk(b) { var c = E.Evaluate.checkBody(b); return c; }
function nOpen(b) { var c = chk(b); return c.openEdges.length + (c.nonManifoldEdges || []).length; }
K.shellGuard.on = false;
var m = K.newModel('T'); K.runScript(m, pre + ' p.shell(0.1, [[0, 2, 0]]);');
var sf = m.features.filter(function (f) { return f.type === 'shell'; })[0];
var ou = CSG.prototype.union, calls = [], depth = 0;
CSG.prototype.union = function (b) { depth++; var r = ou.call(this, b); depth--; if (depth === 0) calls.push({ a: this, b: b, r: r }); return r; };
var out = K.buildShell(sf, { body: r0.body, units: m.units });
CSG.prototype.union = ou;
var c = calls[223];
console.log('in situ: a', nOpen(c.a), 'b', nOpen(c.b), 'r', nOpen(c.r), 'polys', c.a.polygons.length, c.b.polygons.length, c.r.polygons.length);
module.exports = { a: c.a, b: c.b, CSG: CSG, E: E, K: K, nOpen: nOpen, chk: chk };
if (require.main === module) {
  var o = CSG.options;
  function run(label, set) {
    var save = {}; Object.keys(set).forEach(function (k) { save[k] = o[k]; o[k] = set[k]; });
    var t0 = Date.now(), r = c.a.union(c.b), cc = chk(r);
    console.log(label, 'open', cc.openEdges.length, 'nm', (cc.nonManifoldEdges || []).length, 'polys', r.polygons.length, 'vol', r.volume().toFixed(9), (Date.now() - t0) + 'ms', 'retry', JSON.stringify(CSG.retryStats || {}).slice(0, 120));
    Object.keys(save).forEach(function (k) { o[k] = save[k]; });
    return r;
  }
  run('default', {});
  run('restoreFar off', { restoreFar: false });
  run('retryExact off', { retryExact: false });
  run('retryExact off, restoreFar off', { retryExact: false, restoreFar: false });
  run('heal off', { heal: false });
  run('heal off, retry off', { heal: false, retryExact: false });
  run('heal off, retry off, far off', { heal: false, retryExact: false, restoreFar: false });
  run('fatten off', { fatten: false });
  run('nearTrees off', { nearTrees: false });
  run('restoreWhole off', { restoreWhole: false });
  run('snapTwins off', { snapTwins: false });
  run('recap off', { recap: false });
  var r = c.b.union(c.a), cc = chk(r); console.log('b ∪ a', cc.openEdges.length, (cc.nonManifoldEdges || []).length);
}
