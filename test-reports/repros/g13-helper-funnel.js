var WT = process.cwd();   // the repo root (was lane GC's worktree path)
var E = require(WT + '/anvil/headless/load.js').load({});
var K = E.Kernel;
global.E = E; global.K = K;
function build(code) { var model = K.newModel('T'); K.runScript(model, code); var b = K.rebuild(model); var mesh = K.meshFromBody(b.body); var mp = K.massProps(mesh, model.density); return { model: model, body: b.body, mesh: mesh, mp: mp, errors: b.errors, warnings: b.warnings }; }
module.exports = { build: build, E: E, K: K };
if (require.main === module) {
  var code = E.AnvilExamples.filter(function (e) { return e.name === 'Funnel'; })[0].code;
  if (process.argv[2]) code = code.replace(/p\.shell\([^\n]*/, process.argv[2] === 'noshell' ? '' : process.argv[2]);
  var t0 = Date.now();
  var r = build(code);
  console.log('errors', JSON.stringify(r.errors), 'warn', JSON.stringify(r.warnings));
  var q = K.meshQuality(r.mesh); console.log('q', JSON.stringify(q));
  console.log('polys', r.body.polygons ? r.body.polygons.length : '?', 'bodyvol', r.body.volume(), 'mp', r.mp.volume, 'poly', r.mp.polygonal && r.mp.polygonal.volume);
  if (E.Drawing) { var f = E.Drawing.projectView(r.mesh, 'Front'), tp = E.Drawing.projectView(r.mesh, 'Top'); console.log('Front', f.lines.visible.length, f.lines.hidden.length, 'Top', tp.lines.visible.length, tp.lines.hidden.length); }
  K.setTessellation({ legacy: true }); var rl = build(code); console.log('legacy err', JSON.stringify(rl.errors), 'legacy bodyvol', rl.body.volume(), 'mp', rl.mp.volume, 'q', JSON.stringify(K.meshQuality(rl.mesh))); K.setTessellation('default');
  console.log('ms', Date.now() - t0);
}
