// bench.js — the native engine against opencascade.js (WebAssembly), same machine, same occt-kernel.js:
//   node desktop/native/bench.js run wasm|native [--parallel] [--repeat 3] [--panel 60x30] [--only text] [--json out]
//   node desktop/native/bench.js compare a.json b.json [c.json ...]                         the table
// Per example part: OpenCascade's build and mesh time (OcctKernel.build's ms.build / ms.mesh, best of --repeat),
// volume, B-rep faces, mesh triangles and bounding box; then the STEP of each part (built once more, untimed) for its
// B-rep edge and face counts (EDGE_CURVE / ADVANCED_FACE entities). Plus a 610 × 310 × 2 mm panel with 1800 Ø6 holes.
// --parallel: OpenCascade's own threads (Boolean parallel mode, parallel BRepMesh); native only.
'use strict';
const fs = require('fs');
const path = require('path');
const HEADLESS = path.join(__dirname, '..', '..', 'anvil', 'headless');

function panelCode(cols, rows) {
  let code = 'p.units("mm");\np.sketch("Front").rect(0, 0, ' + (cols * 10 + 10) + ', ' + (rows * 10 + 10) + ').extrude(2);\nvar s = p.sketch("Front", 2);\n';
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) code += 's.circle(' + (10 + 10 * i) + ', ' + (10 + 10 * j) + ', 3);\n';
  return code + 's.cut("through", { reverse: true });\n';
}

async function run(engine, opts) {
  if (opts.parallel) process.env.ANVIL_OCCT_PARALLEL = '1';
  const { load } = require(path.join(HEADLESS, 'load.js'));
  const { Kernel, OcctKernel, AnvilExamples } = load({ occt: true });
  const { loadOpenCascade } = require(path.join(HEADLESS, 'occt.js'));
  const t0 = performance.now();
  const { oc, loadMs } = await loadOpenCascade({ native: engine === 'native' ? (opts.dir || true) : null });
  const startMs = performance.now() - t0;
  const out = { engine, parallel: !!opts.parallel, loadMs: Math.round(loadMs), startMs: Math.round(startMs), version: oc.occtVersion || '7.6 (opencascade.js)', parts: [] };
  let parts = AnvilExamples.filter((e) => e.kind !== 'assembly').map((e) => ({ name: e.name, code: e.code }));
  const pc = opts.panel ? opts.panel.split('x').map(Number) : [60, 30];
  parts.push({ name: 'Perforated panel, ' + pc[0] * pc[1] + ' holes', code: panelCode(pc[0], pc[1]), repeat: 1 });
  if (opts.only) parts = parts.filter((p) => p.name.indexOf(opts.only) >= 0);
  for (const p of parts) {
    const model = Kernel.newModel('B');
    Kernel.runScript(model, p.code);
    Kernel.rebuild(model);
    const row = { name: p.name };
    let best = null;
    const n = p.repeat || opts.repeat;
    for (let k = 0; k < n; k++) {
      const o = OcctKernel.build(oc, Kernel, JSON.parse(JSON.stringify(model)), {});
      if (!best || o.ms.build + o.ms.mesh < best.ms.build + best.ms.mesh) best = o;
      row.ok = o.ok; row.valid = o.valid;
      row.failed = Object.keys(o.status || {}).filter((id) => /^error/.test(o.status[id])).map((id) => id + ': ' + o.status[id]);
    }
    row.buildMs = +best.ms.build.toFixed(1); row.meshMs = +(best.ms.mesh || 0).toFixed(1);
    row.volume = best.volume; row.faces = (best.faces || []).length; row.bodies = best.bodies;
    row.triangles = best.mesh ? best.mesh.positions.length / 9 : 0; row.bbox = best.bbox;
    if (p.name.indexOf('Perforated') < 0) {
      const x = OcctKernel.build(oc, Kernel, JSON.parse(JSON.stringify(model)), { exports: true, mesh: false });
      const step = x.step || '';
      row.stepEdges = (step.match(/EDGE_CURVE\(/g) || []).length;
      row.stepFaces = (step.match(/ADVANCED_FACE\(/g) || []).length;
      row.stepBytes = step.length;
      row.exportError = x.exportError || null;
    }
    out.parts.push(row);
    process.stderr.write(engine + (opts.parallel ? ' parallel' : '') + '  ' + p.name + '  build ' + row.buildMs + ' ms, mesh ' + row.meshMs + ' ms\n');
  }
  return out;
}

function compare(files) {
  const R = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const label = (r) => r.engine + (r.parallel ? '+par' : '');
  const base = R[0];
  const lines = [];
  lines.push('engine start-up (load ms): ' + R.map((r) => label(r) + ' ' + r.loadMs).join(', '));
  lines.push('');
  lines.push('part'.padEnd(34) + R.map((r) => (label(r) + ' build+mesh').padStart(26)).join('') + '   same result');
  const tot = R.map(() => ({ b: 0, m: 0 }));
  base.parts.forEach((p, i) => {
    let same = [];
    const cells = R.map((r, k) => {
      const q = r.parts[i];
      if (q.name.indexOf('Perforated') < 0) { tot[k].b += q.buildMs; tot[k].m += q.meshMs; }
      if (k > 0) {
        const dv = Math.abs(q.volume - p.volume) / Math.abs(p.volume);
        const ok = dv <= 1e-9 && q.faces === p.faces && q.triangles === p.triangles && q.stepEdges === p.stepEdges && q.stepFaces === p.stepFaces && q.valid === p.valid;
        same.push(label(r) + (ok ? ' yes' : ' NO (dV ' + dv.toExponential(1) + ', faces ' + q.faces + '/' + p.faces + ', tris ' + q.triangles + '/' + p.triangles + ', edges ' + q.stepEdges + '/' + p.stepEdges + ')'));
      }
      return (q.buildMs.toFixed(1) + ' + ' + q.meshMs.toFixed(1)).padStart(26);
    });
    lines.push(p.name.slice(0, 33).padEnd(34) + cells.join('') + '   ' + same.join('; '));
  });
  lines.push('total (examples)'.padEnd(34) + tot.map((t) => (t.b.toFixed(0) + ' + ' + t.m.toFixed(0) + ' = ' + (t.b + t.m).toFixed(0)).padStart(26)).join(''));
  return lines.join('\n');
}

// two occt-tests.js --json results (wasm, native): every row's status and its detail with the timings taken out
function compareTests(fa, fb) {
  const A = JSON.parse(fs.readFileSync(fa, 'utf8')), B = JSON.parse(fs.readFileSync(fb, 'utf8'));
  const strip = (s) => String(s).replace(/build \d+ \+ mesh \d+ ms/g, '').replace(/-?\d+(\.\d+)?\s*(ms|s)\b/g, 'T').replace(/took [^,;\n]*/g, 'took T');
  const out = [], n = Math.max(A.rows.length, B.rows.length);
  let same = 0, sameDetail = 0;
  for (let i = 0; i < n; i++) {
    const a = A.rows[i] || {}, b = B.rows[i] || {};
    if (a.name === b.name && a.status === b.status) same++; else out.push('status differs: ' + a.name + ' ' + a.status + ' / ' + b.status);
    if (strip(a.detail) === strip(b.detail)) sameDetail++; else out.push('detail differs: ' + a.name + '\n   ' + A.engine + ': ' + strip(a.detail).replace(/\n/g, ' | ') + '\n   ' + B.engine + ': ' + strip(b.detail).replace(/\n/g, ' | '));
  }
  out.unshift(n + ' rows: ' + same + ' same status, ' + sameDetail + ' same detail (timings removed); ' + A.engine + ' ' + (A.ms / 1000).toFixed(1) + ' s (engine load ' + Math.round(A.loadMs) + ' ms), ' + B.engine + ' ' + (B.ms / 1000).toFixed(1) + ' s (engine load ' + Math.round(B.loadMs) + ' ms)');
  return out.join('\n');
}

async function main() {
  const a = process.argv.slice(2);
  if (a[0] === 'compare') { process.stdout.write(compare(a.slice(1)) + '\n'); return; }
  if (a[0] === 'compare-tests') { process.stdout.write(compareTests(a[1], a[2]) + '\n'); return; }
  if (a[0] !== 'run' || !/^(wasm|native)$/.test(a[1] || '')) { process.stdout.write('usage: bench.js run wasm|native [--parallel] [--repeat 3] [--dir addonDir] [--json out] | compare a.json b.json ...\n'); process.exitCode = 2; return; }
  const opts = { parallel: a.includes('--parallel'), repeat: 3, json: null, dir: null };
  const r = a.indexOf('--repeat'); if (r > 0) opts.repeat = +a[r + 1];
  const j = a.indexOf('--json'); if (j > 0) opts.json = a[j + 1];
  const d = a.indexOf('--dir'); if (d > 0) opts.dir = a[d + 1];
  const pa = a.indexOf('--panel'); if (pa > 0) opts.panel = a[pa + 1];   // cols x rows of 10 mm pitch, default 60x30
  const on = a.indexOf('--only'); if (on > 0) opts.only = a[on + 1];
  const res = await run(a[1], opts);
  const text = JSON.stringify(res, null, 1) + '\n';
  if (opts.json) fs.writeFileSync(opts.json, text); else process.stdout.write(text);
}
main().catch((e) => { process.stderr.write((e && e.stack || e) + '\n'); process.exitCode = 1; });
