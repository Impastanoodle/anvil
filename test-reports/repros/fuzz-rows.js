// lane NI (2026-11-16) fuzz harness: every seed of a corpus, one JSON line with status, message, errors and volumes at
// full precision (compare.js prints only the seeds that are not ok, and no volume): diff two runs seed for seed
//   node test-reports/repros/fuzz-rows.js --root <checkout> --table rfFT|rfGA --kind sheet|round|stack --from 1 --to 250 --out file
'use strict';
const fs = require('fs'), path = require('path');
const here = path.resolve(__dirname, '../..');
const args = process.argv.slice(2), flag = (k) => { const i = args.indexOf(k); return i < 0 ? null : (args[i + 1] || true); };
const root = path.resolve(flag('--root') || here);
const g = require(path.join(root, 'anvil/headless/load.js')).load({});
const K = g.Kernel, Ev = g.Evaluate;
const T = String(flag('--table') || 'rfFT');
const src = fs.readFileSync(path.join(here, 'anvil/tests/kernel/' + T + '.js'), 'utf8');
const table = src.slice(src.indexOf('// ' + T + '-TABLE-BEGIN'), src.indexOf('// ' + T + '-TABLE-END'));
const lib = new Function(table + '\nreturn { parts: ' + T + 'parts, fuzz: ' + T + 'fuzz };')();
const PLAIN = /^[A-Z][^]*\.$/, JSERR = /TypeError|ReferenceError|Cannot read|is not a function|undefined|NaN|Infinity|\bnull\b/;
function one(kind, seed) {
  const c = lib.fuzz(kind, seed), m = K.newModel(kind + seed), out = { kind, seed, status: 'ok' };
  const t0 = Date.now();
  let b;
  try { K.runScript(m, c.code); b = K.rebuild(m); } catch (e) { out.status = 'threw'; out.msg = String(e && e.message || e).slice(0, 200); return out; }
  const errs = Object.keys(b.errors || {}).map((id) => b.errors[id]), bad = errs.filter((e) => !PLAIN.test(e) || JSERR.test(e));
  let open = 0, nm = 0, cv = 0;
  (b.bodies || []).forEach((x) => { const ck = Ev.checkBody(x); open += ck.openEdges.length; nm += ck.nonManifoldEdges.length; });
  if (b.body) {
    try { const mp = K.massProps(K.meshFromBody(b.body), 1), pv = b.body.volume(), mv = mp.polygonal ? mp.polygonal.volume : mp.volume; out.vol = mp.volume; out.pv = pv; cv = Math.abs(mv - pv) / Math.max(Math.abs(pv), 1e-12); } catch (e) { cv = Infinity; }
  }
  out.errs = errs.map((e) => e.slice(0, 120));
  out.n = b.body ? b.body.polygons.length : 0;
  if (bad.length) { out.status = 'badMessage'; out.msg = bad[0].slice(0, 200); }
  else if (open || nm) { out.status = 'open'; out.msg = open + ' open, ' + nm + ' non-manifold'; }
  else if (cv > 1e-6) { out.status = 'inconsistent'; out.msg = 'rel ' + cv.toExponential(2); }
  else if (errs.length) { out.status = 'refused'; out.msg = errs[0].slice(0, 160); }
  if (kind === 'sheet' && b.body) {
    try {
      const f = K.flatPattern(m, b, K.meshFromBody(b.body)), fb = K.flatBody(m, b, f), ck = Ev.checkBody(fb.body);
      if (ck.openEdges.length + ck.nonManifoldEdges.length && out.status === 'ok') { out.status = 'flatOpen'; out.msg = ck.openEdges.length + ' open edges in the flat'; }
    } catch (e) { if (out.status === 'ok') { out.status = 'flatThrew'; out.msg = String(e && e.message || e).slice(0, 200); } }
  }
  out.ms = Date.now() - t0;
  return out;
}
const kind = String(flag('--kind')), A = +flag('--from'), B = +flag('--to'), outF = flag('--out');
const fd = fs.openSync(outF, 'w');
for (let s = A; s <= B; s++) fs.writeSync(fd, JSON.stringify(one(kind, s)) + '\n');
fs.closeSync(fd);
