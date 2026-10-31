// rfFT corpus runner (lane FT, 2026-10-30): builds every part of the rfFT table (anvil/tests/kernel/rfFT.js, between
// the rfFT-TABLE markers) on Anvil's engine, or with --occt on OpenCascade, and prints one JSON line per part.
//   node anvil/tests/fixtures/rfFT/compare.js [--root <checkout>] [--occt] [--only S01,M03]
//   node anvil/tests/fixtures/rfFT/compare.js --fuzz 1000 [--seed 1]      (Anvil only)
// --root picks the checkout whose engine is loaded (default: this one); vendor/occt is not in worktrees, so run
// --occt with the main checkout as --root (the table is always read from this file's checkout).
'use strict';
const fs = require('fs'), path = require('path');
const here = path.resolve(__dirname, '../../../..');
const args = process.argv.slice(2), flag = (k) => { const i = args.indexOf(k); return i < 0 ? null : (args[i + 1] || true); };
const root = path.resolve(flag('--root') || here);
const occt = args.indexOf('--occt') >= 0;
const only = flag('--only') ? String(flag('--only')).split(',') : null;
const g = require(path.join(root, 'anvil/headless/load.js')).load({ occt });
const K = g.Kernel, Ev = g.Evaluate;

const src = fs.readFileSync(path.join(here, 'anvil/tests/kernel/rfFT.js'), 'utf8');
const table = src.slice(src.indexOf('// rfFT-TABLE-BEGIN'), src.indexOf('// rfFT-TABLE-END'));
const lib = new Function(table + '\nreturn { parts: rfFTparts, fuzz: rfFTfuzz };')(), parts = lib.parts;
const r6 = (x) => (x == null ? x : Math.round(x * 1e9) / 1e9);

function anvilRow(p) {
  const t0 = Date.now(), m = K.newModel(p.id);
  let b;
  try { K.runScript(m, p.code); b = K.rebuild(m); } catch (e) { return { id: p.id, threw: String(e && e.stack || e).slice(0, 300) }; }
  const mesh = K.meshFromBody(b.body), mp = K.massProps(mesh, m.density);
  let open = 0, nm = 0;
  (b.bodies || []).forEach((x) => { const c = Ev.checkBody(x); open += c.openEdges.length; nm += c.nonManifoldEdges.length; });
  const errs = Object.keys(b.errors || {}).map((id) => b.errors[id]);
  const row = { id: p.id, vol: r6(mp.volume), poly: r6(mp.polygonal ? mp.polygonal.volume : mp.volume), bodyVol: r6(b.body ? b.body.volume() : 0),
    bbox: mp.bbox ? [mp.bbox.min.map(r6), mp.bbox.max.map(r6)] : null, bodies: (b.bodies || []).length, open, nm,
    errors: errs, refused: errs.filter((e) => K.isRefusal(e)).length, warnings: Object.keys(b.warnings || {}).map((id) => b.warnings[id]), ms: Date.now() - t0 };
  if (p.sheet) {
    try {
      const f = K.flatPattern(m, b, mesh), fbo = K.flatBody(m, b, f), fb = fbo && fbo.body;
      const c = fb ? Ev.checkBody(fb) : null;
      row.flat = { size: f.size.map(r6), loops: f.loops.length, bends: f.bends.length, warnings: f.warnings || [],
        open: c ? c.openEdges.length + c.nonManifoldEdges.length : null, vol: fb ? r6(fb.volume()) : null,
        areaT: r6(f.loops.reduce((s, l, i) => s + (i ? -1 : 1) * Math.abs(K.signedArea(l)), 0) * K.sheetParams(m).thickness) };
    } catch (e) { row.flat = { error: String(e && e.message || e) }; }
  }
  return row;
}

async function occtRows() {
  const { oc } = await require(path.join(root, 'anvil/headless/occt.js')).loadOpenCascade();
  parts.forEach((p) => {
    if (only && only.indexOf(p.id) < 0) return;
    const m = K.newModel(p.id), t0 = Date.now();
    let row;
    try {
      K.runScript(m, p.code);
      const o = g.OcctKernel.build(oc, K, m, {});
      const failed = Object.keys(o.status || {}).filter((k) => /^error/.test(o.status[k])).map((k) => o.status[k]);
      row = { id: p.id, vol: r6(o.volume), bbox: o.bbox ? o.bbox.map((q) => q.map(r6)) : null, bodies: o.bodies, valid: !!o.valid, ok: !!o.ok,
        unsupported: o.unsupported || null, failed, ms: Date.now() - t0 };
    } catch (e) { row = { id: p.id, threw: String(e && e.message || e).slice(0, 300) }; }
    console.log(JSON.stringify(row));
  });
}

// --fuzz: every failure (exception, a message that is not a plain sentence, an open / non-manifold result, an open
// flat) is printed with its seed, ops and script, then the counts per kind and status
const PLAIN = /^[A-Z][^]*\.$/, JSERR = /TypeError|ReferenceError|Cannot read|is not a function|undefined|NaN|Infinity|\bnull\b/;
function fuzzOne(kind, seed) {
  const c = lib.fuzz(kind, seed), m = K.newModel(kind + seed), out = { kind, seed, ops: c.ops.join(' '), status: 'ok' };
  let b;
  try { K.runScript(m, c.code); b = K.rebuild(m); } catch (e) { out.status = 'threw'; out.msg = String(e && e.message || e).slice(0, 200); out.code = c.code; return out; }
  const errs = Object.keys(b.errors || {}).map((id) => b.errors[id]), bad = errs.filter((e) => !PLAIN.test(e) || JSERR.test(e));
  let open = 0, nm = 0;
  (b.bodies || []).forEach((x) => { const ck = Ev.checkBody(x); open += ck.openEdges.length; nm += ck.nonManifoldEdges.length; });
  if (bad.length) { out.status = 'badMessage'; out.msg = bad[0].slice(0, 200); }
  else if (open || nm) { out.status = 'open'; out.msg = open + ' open, ' + nm + ' non-manifold'; }
  else if (errs.length) { out.status = 'refused'; out.msg = errs[0].slice(0, 160); }
  if (kind === 'sheet' && b.body) {
    try {
      const f = K.flatPattern(m, b, K.meshFromBody(b.body)), fb = K.flatBody(m, b, f), ck = Ev.checkBody(fb.body);
      if (ck.openEdges.length + ck.nonManifoldEdges.length && out.status === 'ok') { out.status = 'flatOpen'; out.msg = ck.openEdges.length + ' open edges in the flat'; }
    } catch (e) { if (out.status === 'ok') { out.status = 'flatThrew'; out.msg = String(e && e.message || e).slice(0, 200); } }
  }
  if (out.status !== 'ok' && out.status !== 'refused') out.code = c.code;
  return out;
}

if (flag('--fuzz')) {
  const N = +flag('--fuzz'), S = +(flag('--seed') || 1), counts = {}, t0 = Date.now();
  ['sheet', 'round'].forEach((kind) => {
    for (let s = S; s < S + N; s++) {
      const o = fuzzOne(kind, s), key = kind + ' ' + o.status;
      counts[key] = (counts[key] || 0) + 1;
      if (o.status !== 'ok') console.log(JSON.stringify(o));
    }
  });
  console.log(JSON.stringify({ counts, ms: Date.now() - t0 }));
} else if (occt) occtRows().catch((e) => { console.error(e); process.exit(1); });
else parts.forEach((p) => { if (!only || only.indexOf(p.id) >= 0) console.log(JSON.stringify(anvilRow(p))); });
