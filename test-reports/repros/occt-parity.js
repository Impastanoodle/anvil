// lane QP (2026-11-19) engine parity sweep: every rfON fuzz stack built by Anvil's kernel and by OpenCascade
// (OcctKernel.build of the same model, features Anvil refused suppressed as the app does: ui-occt.js withoutRefused).
// One JSON line per stack: Anvil's volume and errors, OpenCascade's volume / valid / first failed feature, rel diff.
//   node test-reports/repros/occt-parity.js --kinds plate,block,turned,multi,step --out .scratch/parity.jsonl
//   node test-reports/repros/occt-parity.js --kinds plate --from 6022 --to 6022          (one stack, printed)
//   node test-reports/repros/occt-parity.js --summary .scratch/parity.jsonl              (the table of a run)
// Ranges (fidelity-6): plate 6001-6200, block 6001-6120, turned 6001-6100, multi 6001-6060, step 6001-6060.
'use strict';
const fs = require('fs'), path = require('path');
const here = path.resolve(__dirname, '../..');
const args = process.argv.slice(2), flag = (k) => { const i = args.indexOf(k); return i < 0 ? null : (args[i + 1] || true); };

function summary(files) {
  const rows = [];
  files.split(',').forEach((file) => fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split('\n').filter((l) => l.trim()).forEach((l) => rows.push(JSON.parse(l))));
  const t = { stacks: rows.length, anvilNoBody: 0, agree9: 0, agree6: 0, differ: 0, occtFails: 0, occtInvalid: 0, unsupported: 0 };
  const lists = { differ: [], occtFails: [], occtInvalid: [], agree6: [] };
  rows.forEach((r) => {
    const id = r.kind[0] + r.seed;
    // rows written before ofail existed: drop a failure on a feature Anvil failed too
    if (r.failed && !r.ofail) { const fid = r.failed.split(' ')[0]; if ((r.aerr || []).some((e) => e.split(':')[0] === fid)) r.failed = null; }
    if (!r.av) { t.anvilNoBody++; return; }
    if (r.unsupported) { t.unsupported++; return; }
    if (r.failed) { t.occtFails++; lists.occtFails.push(id + ' ' + r.failed); return; }
    if (!r.valid) { t.occtInvalid++; lists.occtInvalid.push(id); }
    if (r.rel != null && r.rel <= 1e-9) t.agree9++;
    else if (r.rel != null && r.rel <= 1e-6) { t.agree6++; lists.agree6.push(id + ' ' + r.rel.toExponential(1)); }
    else { t.differ++; lists.differ.push(id + ' ' + (r.rel == null ? '-' : r.rel.toExponential(1))); }
  });
  console.log(JSON.stringify(t, null, 1));
  Object.keys(lists).forEach((k) => console.log(k + ': ' + lists[k].join(', ')));
}
if (flag('--summary')) { summary(flag('--summary')); return; }

const g = require(path.join(here, 'anvil/headless/load.js')).load({ occt: true });
const K = g.Kernel, X = g.Exchange, OK = g.OcctKernel;
const src = fs.readFileSync(path.join(here, 'anvil/tests/kernel/rfON.js'), 'utf8');
const fuzz = new Function(src.slice(src.indexOf('// rfON-TABLE-BEGIN'), src.indexOf('// rfON-TABLE-END')) + '\nreturn rfONfuzz;')();
const RANGE = { plate: [6001, 6200], block: [6001, 6120], turned: [6001, 6100], multi: [6001, 6060], step: [6001, 6060] };

function anvilModel(c) {
  let m = K.newModel('P');
  if (c.base) {
    K.runScript(m, c.base); const b0 = K.rebuild(m), st = X.exportSTEP(m, b0);
    m = X.newPartFromImport(X.importFile('b.step', st, { units: 'in' }));
    // the app keeps the file's text on the Imported feature (OpenCascade rebuilds it exactly from that)
    m.features.forEach((f) => { if (f.type === 'import' && !f.brep) f.brep = { format: 'step', text: st }; });
  }
  K.runScript(m, c.code);
  return m;
}
function withoutRefused(model, build) {
  const errs = (build && build.errors) || {};
  model.features.forEach((f) => { if (errs[f.id] && K.isRefusal(errs[f.id])) f.suppressed = true; });
  return model;
}
function one(oc, kind, seed) {
  const c = fuzz(kind, seed), out = { kind, seed, ops: c.ops.join(' ') };
  let m, b;
  try { m = anvilModel(c); b = K.rebuild(m); } catch (e) { out.anvilThrew = String(e && e.message || e).slice(0, 160); return out; }
  out.aerr = Object.keys(b.errors || {}).map((id) => id + ': ' + String(b.errors[id]).slice(0, 100));
  if (b.body) out.av = K.massProps(K.meshFromBody(b.body), 1).volume;
  if (!out.av) return out;
  const t0 = Date.now();
  let o;
  try { o = OK.build(oc, K, withoutRefused(JSON.parse(JSON.stringify(m)), b)); } catch (e) { out.failed = 'threw: ' + String(e && e.message || e).slice(0, 160); return out; }
  out.ms = Date.now() - t0;
  out.ov = o.volume; out.valid = !!o.valid; out.bodies = o.bodies; out.abodies = (b.bodies || []).length;
  if (o.unsupported) out.unsupported = o.unsupported;
  const types = {}; m.features.forEach((f) => { types[f.id] = f.type; });
  const bad = Object.keys(o.status || {}).filter((k) => /^error/.test(o.status[k]));
  // OpenCascade's errors on features Anvil built (an error on a feature Anvil also failed is agreement: both refuse)
  const aIds = Object.keys(b.errors || {});
  out.ofail = bad.map((id) => id + ' (' + types[id] + ') ' + String(o.status[id]).slice(0, 140));
  const own = bad.filter((id) => aIds.indexOf(id) < 0);
  if (own.length) out.failed = own[0] + ' (' + types[own[0]] + ') ' + String(o.status[own[0]]).slice(0, 140);
  if (o.volume != null) out.rel = Math.abs(o.volume - out.av) / out.av;
  return out;
}

(async () => {
  const { oc } = await require(path.join(here, 'anvil/headless/occt.js')).loadOpenCascade({});
  const kinds = String(flag('--kinds') || 'plate,block,turned,multi,step').split(',');
  const outFile = flag('--out');
  if (outFile && !flag('--append')) fs.writeFileSync(outFile, '');
  kinds.forEach((kind) => {
    const from = +(flag('--from') || RANGE[kind][0]), to = +(flag('--to') || RANGE[kind][1]);
    for (let s = from; s <= to; s++) {
      let r;
      try { r = one(oc, kind, s); } catch (e) { r = { kind, seed: s, harnessThrew: String(e && e.stack || e).slice(0, 300) }; }
      if (outFile) fs.appendFileSync(outFile, JSON.stringify(r) + '\n'); else console.log(JSON.stringify(r, null, 1));
    }
  });
})();
