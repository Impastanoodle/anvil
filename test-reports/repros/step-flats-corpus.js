'use strict';
// STEP-to-flat corpus (lane stepflats, rfQR; report test-reports/2026-11-19-step-flats.md): 20 folded parts built by
// script, written to STEP by Anvil's writer, read back as dumb solids, Insert Bends at the original Base Flange's face
// with the same T / K: bends found (count, angle, R) and the blank against the part's own flat (area, loops, outline).
//   node test-reports/repros/step-flats-corpus.js [root] [--only id,id] [--json out.json]
const path = require('path'), fs = require('fs');
const argv = process.argv.slice(2), root = path.resolve(argv[0] && argv[0][0] !== '-' ? argv[0] : path.join(__dirname, '../..'));
const onlyArg = argv.indexOf('--only') >= 0 ? argv[argv.indexOf('--only') + 1].split(',') : null;
const jsonArg = argv.indexOf('--json') >= 0 ? argv[argv.indexOf('--json') + 1] : null;
const g = require(path.join(root, 'anvil/headless/load.js')).load({});
const K = g.Kernel, X = g.Exchange;
const corpus = require(path.join(__dirname, 'step-flats-parts.js'));

function area(fl) { return fl.loops.reduce((s, l, i) => s + (i ? -1 : 1) * Math.abs(K.signedArea(l)), 0); }
function sides(l) { return l.map((p, i) => { const q = l[(i + 1) % l.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]); }).sort((a, b) => a - b); }
function bendSig(fl) { return fl.bends.map((b) => [+(+b.angle).toFixed(3), +(+b.R).toFixed(5)]).sort((a, b) => a[0] - b[0] || a[1] - b[1]); }

function trip(p) {
  const row = { id: p.id, name: p.name };
  const m = K.newModel(p.id);
  K.runScript(m, p.code);
  const b = K.rebuild(m), errs = Object.values(b.errors || {});
  if (errs.length) { row.status = 'build error'; row.msg = errs[0]; return row; }
  const mesh = K.meshFromBody(b.body), own = K.flatPattern(m, b, mesh), sh = K.sheetParams(m);
  row.own = { bends: own.bends.length, loops: own.loops.length, area: area(own) };
  const step = X.exportSTEP(m, b, p.faceted ? { faceted: true } : undefined);
  const imp = X.importFile(p.id + '.step', step, { units: m.units || 'in' });
  row.readOpen = imp.stats && imp.stats.openEdges;
  const m2 = X.newPartFromImport(imp);
  try { new K.Builder(m2).insertBends(p.fixed, Object.assign({ kFactor: sh.kFactor, thickness: sh.thickness }, process.env.IBOPT ? JSON.parse(process.env.IBOPT) : {})); } catch (e) { row.status = 'insertBends threw'; row.msg = e.message; return row; }
  const b2 = K.rebuild(m2), e2 = Object.values(b2.errors || {});
  if (e2.length) { row.status = 'refused'; row.msg = String(e2[0]).slice(0, 200); return row; }
  let ib;
  try { ib = K.flatPattern(m2, b2, K.meshFromBody(b2.body)); } catch (e) { row.status = 'flat threw'; row.msg = e.message; return row; }
  row.ib = { bends: ib.bends.length, loops: ib.loops.length, area: area(ib), warnings: ib.warnings || [] };
  row.dArea = row.ib.area - row.own.area;
  const so = sides(own.loops[0]), si = sides(ib.loops[0]);
  row.outline = si.length === so.length ? Math.max.apply(null, so.map((d, k) => Math.abs(si[k] - d))) : 'corners ' + si.length + ' vs ' + so.length;
  row.bendsOwn = bendSig(own); row.bendsIb = bendSig(ib);
  const bendsOk = JSON.stringify(row.bendsOwn) === JSON.stringify(row.bendsIb);
  row.status = bendsOk && row.ib.loops === row.own.loops && Math.abs(row.dArea) <= 1e-6 && typeof row.outline === 'number' && row.outline <= 1e-6 ? 'ok' : 'differs';
  return row;
}

const rows = [];
corpus.parts.filter((p) => !onlyArg || onlyArg.indexOf(p.id) >= 0).forEach((p) => {
  const t = Date.now(); let r;
  try { r = trip(p); } catch (e) { r = { id: p.id, name: p.name, status: 'threw', msg: e.stack.split('\n').slice(0, 3).join(' | ') }; }
  r.ms = Date.now() - t;
  rows.push(r);
  console.log([r.id, r.status, r.own ? 'own ' + r.own.bends + 'b ' + r.own.loops + 'L' : '', r.ib ? 'ib ' + r.ib.bends + 'b ' + r.ib.loops + 'L dA ' + r.dArea.toExponential(2) + ' side ' + (typeof r.outline === 'number' ? r.outline.toExponential(1) : r.outline) : '',
    r.bendsOwn && JSON.stringify(r.bendsOwn) !== JSON.stringify(r.bendsIb) ? 'bends own ' + JSON.stringify(r.bendsOwn) + ' ib ' + JSON.stringify(r.bendsIb) : '', r.msg || '', r.ms + 'ms'].filter(Boolean).join('  '));
});
if (jsonArg) fs.writeFileSync(jsonArg, JSON.stringify(rows, null, 1));
