// SolidWorks reference, second pass (lane swref, 2026-11-02): the Anvil side.
//   node ref2_anvil.js record <cases.json> <out.json>   every script's Builder calls as plain chains (no engine: a Proxy
//                                                        records them, so ref2_script.py can replay them in SolidWorks)
//   node ref2_anvil.js eval <cases.json> <out.json>      each script on Anvil's engine: volume, bbox, bodies, errors, flat
//   node ref2_anvil.js table rfFT|rfGA <ids> <out.json>  writes { id, code } rows of a corpus table
// cases.json = [{ id, code }]. A worktree has no vendor/occt: this tool never needs it.
'use strict';
const fs = require('fs'), path = require('path');
const here = path.resolve(__dirname, '../..');
const [, , cmd, a1, a2, a3] = process.argv;

function record(code) {
  const chains = [], lets = [];
  function chain(first) {
    const c = [first], idx = chains.length; chains.push(c);
    const px = new Proxy({}, { get: (_, name) => (name === 'id' ? () => ({ __chain: idx }) : (...args) => { c.push([String(name)].concat(args)); return px; }) });
    return px;
  }
  const p = new Proxy({}, { get: (_, name) => (...args) => chain([String(name)].concat(args)) });
  new Function('p', code)(p);
  return chains;
}

function evalAll(cases) {
  const g = require(path.join(here, 'anvil/headless/load.js')).load({ occt: false });
  const K = g.Kernel, Ev = g.Evaluate, r9 = (x) => (x == null ? x : Math.round(x * 1e9) / 1e9), out = [];
  cases.forEach((c) => {
    const t0 = Date.now(), m = K.newModel(c.id), row = { id: c.id };
    try {
      K.runScript(m, c.code);
      const b = K.rebuild(m);
      row.errors = Object.keys(b.errors || {}).map((id) => b.errors[id]);
      row.warnings = Object.keys(b.warnings || {}).map((id) => b.warnings[id]);
      row.refused = row.errors.filter((e) => K.isRefusal(e)).length;
      if (b.body) {
        const mesh = K.meshFromBody(b.body), mp = K.massProps(mesh, m.density);
        row.volume = r9(mp.volume); row.poly = r9(mp.polygonal ? mp.polygonal.volume : mp.volume); row.area = r9(mp.area);
        row.bbox = mp.bbox ? mp.bbox.min.concat(mp.bbox.max).map(r9) : null; row.bodies = (b.bodies || []).length;
        let open = 0, nm = 0;
        (b.bodies || []).forEach((x) => { const k = Ev.checkBody(x); open += k.openEdges.length; nm += k.nonManifoldEdges.length; });
        row.open = open; row.nm = nm;
        if (m.sheet) {
          try {
            const f = K.flatPattern(m, b, mesh), T = K.sheetParams(m).thickness;
            row.flat = { size: f.size.map(r9), loops: f.loops.length, bends: f.bends.length,
              areaT: r9(f.loops.reduce((s, l, i) => s + (i ? -1 : 1) * Math.abs(K.signedArea(l)), 0) * T),
              ba: f.bends.map((q) => r9(q.ba)), bd: f.bends.map((q) => r9(q.bd)) };
            if (c.outline) row.flat.loopsXY = f.loops.map((l) => l.map((q) => [r9(q[0]), r9(q[1])]));
          } catch (e) { row.flat = { error: String(e && e.message || e) }; }
        }
        if (c.verts) { const vs = {}; b.body.polygons.forEach((q) => q.vertices.forEach((v) => { vs[[r9(v.pos.x), r9(v.pos.y), r9(v.pos.z)].join(',')] = 1; })); row.verts = Object.keys(vs).map((s) => s.split(',').map(Number)); }
      } else { row.volume = 0; row.bodies = 0; }
    } catch (e) { row.threw = String(e && e.message || e).slice(0, 300); }
    row.ms = Date.now() - t0;
    out.push(row);
  });
  return out;
}

if (cmd === 'record') {
  const cases = JSON.parse(fs.readFileSync(a1, 'utf8'));
  fs.writeFileSync(a2, JSON.stringify(cases.map((c) => ({ id: c.id, chains: c.code ? record(c.code) : null }))));
} else if (cmd === 'eval') {
  fs.writeFileSync(a2, JSON.stringify(evalAll(JSON.parse(fs.readFileSync(a1, 'utf8')))));
} else if (cmd === 'table') {
  const src = fs.readFileSync(path.join(here, 'anvil/tests/kernel/' + a1 + '.js'), 'utf8');
  const table = src.slice(src.indexOf('// ' + a1 + '-TABLE-BEGIN'), src.indexOf('// ' + a1 + '-TABLE-END'));
  const parts = new Function(table + '\nreturn ' + a1 + 'parts;')(), want = a2 === 'all' ? null : new RegExp(a2);
  fs.writeFileSync(a3, JSON.stringify(parts.filter((q) => q.code && (!want || want.test(q.id))).map((q) => ({ id: q.id, d: q.d, code: q.code, flat: q.flat }))));
} else if (cmd === 'fuzz') {   // node ref2_anvil.js fuzz rfFT round 104 <out.json>: one generated stack
  const [, , , tbl, kind, seed, out] = process.argv;
  const src = fs.readFileSync(path.join(here, 'anvil/tests/kernel/' + tbl + '.js'), 'utf8');
  const table = src.slice(src.indexOf('// ' + tbl + '-TABLE-BEGIN'), src.indexOf('// ' + tbl + '-TABLE-END'));
  const fz = new Function(table + '\nreturn ' + tbl + 'fuzz;')(), c = fz(kind, +seed);
  fs.writeFileSync(out, JSON.stringify({ code: c.code, ops: c.ops.join(' ') }));
} else { console.error('usage: see the head of this file'); process.exit(2); }
