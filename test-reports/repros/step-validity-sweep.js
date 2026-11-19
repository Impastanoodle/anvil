// lane QS (2026-11-19): Anvil's STEP of every rfON fuzz stack read back by Anvil's reader (open / non-manifold edges,
// volume) and by OpenCascade (solids, BRepCheck valid, shell closed, volume). One JSON line per stack.
//   node test-reports/repros/step-validity-sweep.js --kinds plate,block --out .scratch/sweep.jsonl [--off circleCuts]
//   node test-reports/repros/step-validity-sweep.js --kinds turned --from 6028 --to 6028      (one stack, printed)
//   node test-reports/repros/step-validity-sweep.js --summary a.jsonl[,b.jsonl]
// --off <name>: switch an Exchange option off (circleCuts, pinchSplit) to measure before / after in one checkout.
'use strict';
const fs = require('fs'), path = require('path');
const here = path.resolve(__dirname, '../..');
const args = process.argv.slice(2), flag = (k) => { const i = args.indexOf(k); return i < 0 ? null : (args[i + 1] || true); };
const RANGE = { plate: [6001, 6200], block: [6001, 6120], turned: [6001, 6100], multi: [6001, 6060], step: [6001, 6060] };

if (flag('--summary')) {
  const rows = [];
  String(flag('--summary')).split(',').forEach((f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).forEach((l) => rows.push(JSON.parse(l))));
  const t = { stacks: rows.length, noBody: 0, anvilOpen: 0, occtValid: 0, occtInvalid: 0, occtNotClosed: 0, occtNotOneSolid: 0, occtVolOff: 0 };
  const L = { anvilOpen: [], occtInvalid: [], occtNotClosed: [], occtNotOneSolid: [], occtVolOff: [] };
  rows.forEach((r) => {
    const id = r.kind[0] + r.seed;
    if (!r.av) { t.noBody++; return; }
    if (r.aopen) { t.anvilOpen++; L.anvilOpen.push(id + ' ' + r.aopen); }
    if (r.ovalid === true && r.oclosed === 0 && r.osolids === 1) t.occtValid++;
    else t.occtInvalid++;
    if (r.ovalid !== true) L.occtInvalid.push(id);
    if (r.oclosed) { t.occtNotClosed++; L.occtNotClosed.push(id + ' ' + r.oclosed); }
    if (r.osolids !== 1) { t.occtNotOneSolid++; L.occtNotOneSolid.push(id + ' ' + r.osolids); }
    if (r.orel == null || r.orel > 1e-6) { t.occtVolOff++; L.occtVolOff.push(id + ' ' + (r.orel == null ? '-' : r.orel.toExponential(1))); }
  });
  console.log(JSON.stringify(t));
  Object.keys(L).forEach((k) => console.log(k + ': ' + L[k].join(', ')));
  return;
}

const g = require(path.join(here, 'anvil/headless/load.js')).load({});
const K = g.Kernel, X = g.Exchange, Ev = g.Evaluate;
if (flag('--off')) String(flag('--off')).split(',').forEach((k) => { X[k].on = false; });
const src = fs.readFileSync(path.join(here, 'anvil/tests/kernel/rfON.js'), 'utf8');
const fuzz = new Function(src.slice(src.indexOf('// rfON-TABLE-BEGIN'), src.indexOf('// rfON-TABLE-END')) + '\nreturn rfONfuzz;')();

function anvilModel(c) {
  let m = K.newModel('P');
  if (c.base) { K.runScript(m, c.base); const b0 = K.rebuild(m); m = X.newPartFromImport(X.importFile('b.step', X.exportSTEP(m, b0), { units: 'in' })); }
  K.runScript(m, c.code);
  return m;
}
function one(oc, kind, seed) {
  const c = fuzz(kind, seed), out = { kind, seed };
  let m, b, text;
  try { m = anvilModel(c); b = K.rebuild(m); } catch (e) { out.threw = String(e && e.message || e).slice(0, 120); return out; }
  if (!b.body) return out;
  out.av = K.massProps(K.meshFromBody(b.body), 1).volume;
  try { text = X.exportSTEP(m, b); } catch (e) { out.wthrew = String(e && e.message || e).slice(0, 120); return out; }
  try {   // Anvil's reader
    const m2 = X.newPartFromImport(X.importFile('r.step', text, { units: 'in' })), b2 = K.rebuild(m2);
    let open = 0; (b2.bodies || []).forEach((x) => { const ck = Ev.checkBody(x); open += ck.openEdges.length + ck.nonManifoldEdges.length; });
    out.aopen = open;
    out.arel = b2.body ? Math.abs(K.massProps(K.meshFromBody(b2.body), 1).volume - out.av) / out.av : null;
  } catch (e) { out.athrew = String(e && e.message || e).slice(0, 120); }
  try {   // OpenCascade
    oc.FS.writeFile('/s.step', text);
    const rd = new oc.STEPControl_Reader_1();
    rd.ReadFile('/s.step'); rd.TransferRoots(new oc.Message_ProgressRange_1());
    const sh = rd.OneShape(), E = oc.TopAbs_ShapeEnum, st = (v) => (v && v.value != null ? v.value : v);
    let ns = 0, closed = 0;
    for (const x = new oc.TopExp_Explorer_2(sh, E.TopAbs_SOLID, E.TopAbs_SHAPE); x.More(); x.Next()) ns++;
    for (const x = new oc.TopExp_Explorer_2(sh, E.TopAbs_SHELL, E.TopAbs_SHAPE); x.More(); x.Next()) { const s = st(new oc.BRepCheck_Shell(oc.TopoDS.Shell_1(x.Current())).Closed(false)); if (s) closed = s; }
    out.osolids = ns; out.oclosed = closed;
    try { out.ovalid = new oc.BRepCheck_Analyzer(sh, true, false).IsValid_2(); } catch (e) { out.ovalid = 'threw'; }
    const pr = new oc.GProp_GProps_1(); oc.BRepGProp.VolumeProperties_1(sh, pr, false, false, false);
    const ov = pr.Mass() / 16387.064;   // the file is in mm
    out.orel = Math.abs(Math.abs(ov) - out.av) / out.av;
  } catch (e) { out.othrew = String(e && e.message || e).slice(0, 120); }
  return out;
}
(async () => {
  const { oc } = await require(path.join(here, 'anvil/headless/occt.js')).loadOpenCascade({});
  const kinds = String(flag('--kinds') || 'plate,block,turned,multi,step').split(','), outF = flag('--out');
  if (outF) fs.writeFileSync(outF, '');
  kinds.forEach((kind) => {
    const r = RANGE[kind], from = +(flag('--from') || r[0]), to = +(flag('--to') || r[1]);
    for (let s = from; s <= to; s++) {
      const row = one(oc, kind, s);
      if (outF) fs.appendFileSync(outF, JSON.stringify(row) + '\n'); else console.log(JSON.stringify(row));
    }
  });
})();
