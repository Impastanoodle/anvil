'use strict';
// rim sweep: rounds / chamfers on the rims of 7 inch tubes (bore and outer rim) and 3 discs, 50 % to 100 % of the face
//   node test-reports/repros/rim-sweep.js <root> [out.jsonl]
const path = require('path'), fs = require('fs');
const root = path.resolve(process.argv[2] || path.join(__dirname, '../..'));
const g = require(path.join(root, 'anvil/headless/load.js')).load({});
const K = g.Kernel, Ev = g.Evaluate, PI = Math.PI;
const tubes = [[1, 0.75, 1], [0.5, 0.375, 0.75], [3, 2.5, 2], [2, 1.75, 0.5], [0.75, 0.25, 1], [1.5, 1, 1], [1, 0.5, 1]], discs = [[0.5, 1], [1, 1.5], [2, 2.5]];
const fr = [0.5, 0.625, 0.75, 0.9, 0.999, 1];
const rows = [];
function one(id, code, want) {
  const m = K.newModel('x'); let b;
  try { K.runScript(m, code); b = K.rebuild(m); } catch (e) { rows.push({ id, status: 'threw', msg: String(e.message).slice(0, 80) }); return; }
  const errs = Object.keys(b.errors || {}).map((k) => b.errors[k]);
  let open = 0; (b.bodies || []).forEach((x) => { const c = Ev.checkBody(x); open += c.openEdges.length + c.nonManifoldEdges.length; });
  const vol = K.massProps(K.meshFromBody(b.body), 1).volume, rel = (vol - want) / want;
  rows.push({ id, status: errs.length ? 'refused' : open ? 'open' : Math.abs(rel) <= 1e-6 ? 'ok' : 'off', vol, rel, msg: errs[0] ? errs[0].slice(0, 70) : undefined });
}
const sec = (kind, r) => kind === 'fillet' ? [r * r * (1 - PI / 4), r * (5 / 6 - PI / 4) / (1 - PI / 4)] : [r * r / 2, r / 3];
tubes.forEach((t) => {
  const [Ro, Ri, H] = t, w = Ro - Ri;
  ['bore', 'outer'].forEach((rim) => ['fillet', 'chamfer'].forEach((kind) => fr.forEach((f) => {
    const s = +(w * f).toFixed(6), [A, xb] = sec(kind, s), rc = rim === 'bore' ? Ri + xb : Ro - xb;
    one('tube ' + Ro + '/' + Ri + ' ' + rim + ' ' + kind + ' ' + s, 'p.units("in");\np.sketch("Top").circle(0,0,' + Ro + ').circle(0,0,' + Ri + ').end().extrude(' + H + ');\np.' + kind + '(' + s + ', [[' + (rim === 'bore' ? Ri : Ro) + ',' + H + ',0]]);', PI * (Ro * Ro - Ri * Ri) * H - 2 * PI * rc * A);
  })));
});
discs.forEach((d) => {
  const [R, H] = d;
  ['fillet', 'chamfer'].forEach((kind) => fr.forEach((f) => {
    const s = +(Math.min(R, H) * f).toFixed(6), [A, xb] = sec(kind, s);
    one('disc ' + R + ' x ' + H + ' ' + kind + ' ' + s, 'p.units("in");\np.sketch("Top").circle(0,0,' + R + ').end().extrude(' + H + ');\np.' + kind + '(' + s + ', [[' + R + ',' + H + ',0]]);', PI * R * R * H - 2 * PI * (R - xb) * A);
  }));
});
const cnt = {}; rows.forEach((r) => { cnt[r.status] = (cnt[r.status] || 0) + 1; });
console.log(rows.length, 'rim rounds / chamfers:', JSON.stringify(cnt));
rows.filter((r) => r.status !== 'ok').forEach((r) => console.log('  ', r.status, r.id, r.rel != null ? 'rel ' + r.rel.toExponential(2) : '', r.msg || ''));
if (process.argv[3]) fs.writeFileSync(process.argv[3], rows.map((r) => JSON.stringify(r)).join('\n'));
