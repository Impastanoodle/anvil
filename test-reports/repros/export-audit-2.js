// lane exportaudit2 (2026-11-19, test-reports/2026-11-19-export-audit-2.md): this round's sheet-metal features out as
// flat DXF R12 / R2000, DWG (Anvil's writer, read back by LibreDWG's dwg2dxf) and STEP (read back by Anvil and by
// OpenCascade), every file compared with the part. 58 parts: 29 variants x inch / mm, 20 / 16 / 11 ga rotated.
//   node test-reports/repros/export-audit-2.js [--only text] [--no-occt] [--no-dwg] [--json out] [--list]
// Needs anvil/vendor/libredwg (dwg2dxf.exe) and anvil/vendor/occt (copied from the main checkout, untracked).
'use strict';
const fs = require('fs'), path = require('path');
const here = path.resolve(__dirname, '../..');
const args = process.argv.slice(2), flag = (k) => { const i = args.indexOf(k); return i < 0 ? null : (args[i + 1] || true); };
const g = require(path.join(here, 'anvil/headless/load.js')).load({});
const K = g.Kernel, Ev = g.Evaluate, X = g.Exchange, DI = globalThis.DxfImport, DWG = globalThis.DWG;
const DxfCheck = require(path.join(here, 'anvil/headless/dxf-check.js'));
const dwgTool = require(path.join(here, 'anvil/headless/dwg.js'));

// ---------------------------------------------------------------- the corpus
const GA = { in: { '20 ga': [0.0359, 0.03, 0.5], '16 ga': [0.0598, 0.06, 0.44], '11 ga': [0.1196, 0.12, 0.33] },
  mm: { '20 ga': [0.9, 0.8, 0.5], '16 ga': [1.5, 1.5, 0.44], '11 ga': [3, 3, 0.33] } };
const GAUGES = ['20 ga', '16 ga', '11 ga'];
function line(p, q) { return { t: 'line', x1: p[0], y1: p[1], x2: q[0], y2: q[1] }; }
function poly(pts) { return pts.map((p, i) => line(p, pts[(i + 1) % pts.length])); }
const t30 = Math.tan(Math.PI / 6);
// every variant: (S scale, T, R, K, unitsHeader) -> { code, forms (expected form copies), opts (DXF options) }
const V = [];
function v(name, fn, gauges) { V.push({ name, fn, gauges }); }
const head = (c) => 'p.units("' + c.u + '");\np.sheet(' + c.T + ', ' + c.R + ', ' + c.K + ');\n';
const n = (c, x) => +(x * c.S).toFixed(6);
const P = (c, a) => '[' + a.map((x) => typeof x === 'string' ? x : n(c, x)).join(', ') + ']';
const plate = (c, w, d) => head(c) + 'p.sketch("Top").rect(0, ' + n(c, -d) + ', ' + n(c, w) + ', ' + n(c, d) + ').end().baseFlange();\n';
const trayCode = (c, extra) => plate(c, 8, 6) + [[4, 0], [4, 6], [0, 3], [8, 3]].map((e) => 'p.flange(' + n(c, 1) + ', [[' + n(c, e[0]) + ', ' + c.T + ', ' + n(c, e[1]) + ']], { position: "inside", lengthRef: "outer"' + (extra || '') + ' });\n').join('');

// Edge-Flange with a length per edge
v('lengths', (c) => ({ code: plate(c, 6, 4) + 'p.flange(' + n(c, 1) + ', [[' + n(c, 3) + ', ' + c.T + ', 0], [' + n(c, 6) + ', ' + c.T + ', ' + n(c, 2) + '], [' + n(c, 3) + ', ' + c.T + ', ' + n(c, 4) + ']], { lengths: { 1: ' + n(c, 1.5) + ', 2: ' + n(c, 0.75) + ' } });\n' }));
v('lengths-inside', (c) => ({ code: plate(c, 6, 4) + 'p.flange(' + n(c, 1) + ', [[' + n(c, 3) + ', ' + c.T + ', 0], [' + n(c, 6) + ', ' + c.T + ', ' + n(c, 2) + '], [' + n(c, 3) + ', ' + c.T + ', ' + n(c, 4) + ']], { position: "inside", lengthRef: "outer", relief: "rect", lengths: { 1: ' + n(c, 1.5) + ', 2: ' + n(c, 0.75) + ' } });\n', opts: { reliefLayer: true } }));
// Edge-Flange with its own profile
const PROF = {
  trapezoid: (c) => ({ entities: poly([[0, 0], [6, 0], [6 - 1.5 * t30, 1.5], [1.5 * t30, 1.5]].map((p) => p.map((x) => n(c, x)))) }),
  notch: (c) => ({ entities: poly([[0, 0], [6, 0], [6, 1.5], [4, 1.5], [4, 1], [2, 1], [2, 1.5], [0, 1.5]].map((p) => p.map((x) => n(c, x)))) }),
  hole: (c) => ({ entities: poly([[0, 0], [6, 0], [6, 1.5], [0, 1.5]].map((p) => p.map((x) => n(c, x)))).concat([{ t: 'circle', cx: n(c, 3), cy: n(c, 0.75), r: n(c, 0.25) }]) })
};
const profCode = (c, name, pos) => plate(c, 6, 4) + 'p.flange(' + n(c, 1) + ', [[' + n(c, 3) + ', ' + c.T + ', 0]], { position: "' + (pos || 'inside') + '", relief: "rect", startPoint: [0, ' + c.T + ', 0], profile: ' + JSON.stringify(PROF[name](c)) + ' });\n';
['trapezoid', 'notch', 'hole'].forEach((nm) => v('profile-' + nm, (c) => ({ code: profCode(c, nm, nm === 'notch' ? 'bendOutside' : 'inside') })));
// bend reliefs next to a neighbouring bend
['rect', 'obround', 'tear'].forEach((rl) => v('relief-' + rl, (c) => ({ code: trayCode(c, ', relief: "' + rl + '"'), opts: { reliefLayer: true, bendLayers: 'split' } })));
// Corner-Trim in the flat
[['circular', '{ relief: "circular", size: S125 }'], ['square', '{ relief: "square", size: S2 }'], ['bendWaist', '{ relief: "bendWaist" }'],
  ['chamfer', '{ breakCorner: "chamfer", breakSize: S1 }'], ['fillet', '{ breakCorner: "fillet", breakSize: S1 }']].forEach((t) =>
  v('cornertrim-' + t[0], (c) => ({ code: trayCode(c) + 'p.cornerTrim(' + t[1].replace('S125', n(c, 0.125)).replace('S2', n(c, 0.2)).replace('S1', n(c, 0.1)) + ');\n', opts: { boundaryBox: t[0] === 'fillet' } })));
// forming tools patterned / mirrored, a rib
const ft = (c, tool, x, z, ang) => 'p.formingTool("' + tool + '", [' + n(c, x) + ', ' + c.T + ', ' + n(c, z) + '], { angle: ' + ang + ' });\n';
v('louver-lpattern', (c) => ({ code: plate(c, 10, 10) + ft(c, 'louver', 2, 2, 0) + 'p.linearPattern({ dir: "z", spacing: ' + n(c, 1.5) + ', count: 4 });\n', forms: 4, opts: { hiddenEdges: true } }), ['20 ga', '16 ga']);
v('dimple-cpattern', (c) => ({ code: plate(c, 10, 10) + ft(c, 'dimple', 8, 5, 0) + 'p.circularPattern({ axis: "y", center: ' + P(c, [5, 0, 5]) + ', count: 4 });\n', forms: 4 }));
v('louver-mirror', (c) => ({ code: plate(c, 10, 10) + ft(c, 'louver', 3, 5, 90) + 'p.mirror("Right", { offset: ' + n(c, 5) + ' });\n', forms: 2 }));
v('rib', (c) => ({ code: plate(c, 6, 4) + ft(c, 'rib', 3, 2, 0), forms: 1, opts: { bendLayers: 'split' } }));
// Tab and Slot: two bodies, one body
v('tabslot-two', (c) => ({ code: plate(c, 6, 4) + 'p.sketch("Front", ' + n(c, 2) + ').rect(' + n(c, 1) + ', ' + c.T + ', ' + n(c, 4) + ', ' + n(c, 2) + ').end().extrude(' + c.T + ', { merge: false });\n' +
  'p.tabSlot([[' + n(c, 3) + ', ' + c.T + ', ' + n(c, 2) + ']], { count: 3, tabLength: ' + n(c, 0.5) + ', slotLengthOffset: ' + n(c, 0.01) + ', slotWidthOffset: ' + n(c, 0.005) + ' });\n' }));
v('tabslot-one', (c) => {
  const T = c.T, R = c.R, G = n(c, 0.01), H = n(c, 4) - 2 * T - R - G;
  return { code: plate(c, 6, 4) + 'p.flange(' + n(c, 2) + ', [[' + n(c, 3) + ', ' + T + ', 0]], { position: "inside", lengthRef: "outer" });\np.flange(' + n(c, 2.5) + ', [[' + n(c, 3) + ', ' + T + ', ' + n(c, 4) + ']], { position: "inside", lengthRef: "outer" });\n' +
    'p.flange(' + n(c, 1) + ', [[' + n(c, 3) + ', ' + n(c, 2) + ', ' + T + ']], { position: "inside", relief: "rect", startPoint: [0, ' + n(c, 2) + ', ' + T + '], profile: ' + JSON.stringify({ entities: poly([[n(c, 1), 0], [n(c, 5), 0], [n(c, 5), H], [n(c, 1), H]]) }) + ' });\n' +
    'p.tabSlot([[' + n(c, 3) + ', ' + n(c, 2) + ', ' + (n(c, 4) - T - G) + ']], { count: 2, tabLength: ' + n(c, 1) + ', slotLengthOffset: ' + G + ', slotWidthOffset: ' + G + ' });\n' };
});
// Mirror / Pattern of Edge Flanges, Hems, Jogs (base x -3..3, z 0..4: sketch 1, base 2, the feature 3)
const cbase = (c) => head(c) + 'p.sketch("Top").rect(' + n(c, -3) + ', ' + n(c, -4) + ', ' + n(c, 6) + ', ' + n(c, 4) + ').end().baseFlange();\n';
v('mirror-flange', (c) => ({ code: cbase(c) + 'p.flange(' + n(c, 1.5) + ', [[' + n(c, 3) + ', ' + c.T + ', ' + n(c, 2) + ']], { position: "inside", lengthRef: "outer" });\np.mirror("Right", { feature: 3 });\n' }));
v('mirror-hem', (c) => ({ code: cbase(c) + 'p.hem(' + n(c, 0.4) + ', [[' + n(c, 3) + ', ' + c.T + ', ' + n(c, 2) + ']], { hemType: "closed" });\np.mirror("Right", { feature: 3 });\n' }));
v('mirror-jog', (c) => ({ code: cbase(c) + 'p.jog(' + n(c, 0.5) + ', ' + n(c, 1) + ', [[' + n(c, 3) + ', ' + c.T + ', ' + n(c, 2) + ']]);\np.mirror("Right", { feature: 3 });\n' }));
v('cpattern-flange', (c) => ({ code: head(c) + 'p.sketch("Top").rect(' + n(c, -2) + ', ' + n(c, -2) + ', ' + n(c, 4) + ', ' + n(c, 4) + ').end().baseFlange();\np.flange(' + n(c, 1) + ', [[0, ' + c.T + ', ' + n(c, 2) + ']], { position: "inside", lengthRef: "outer", relief: "rect" });\np.circularPattern({ feature: 3, axis: "y", center: [0, 0, 0], count: 4 });\n', opts: { reliefLayer: true } }));
// a Cross-Break, a hem on a flange, Hole Wizard Up To Next
v('crossbreak', (c) => ({ code: plate(c, 6, 4) + 'p.crossBreak([' + n(c, 3) + ', ' + c.T + ', ' + n(c, 2) + '], { angle: 2 });\n', cross: 1 }));
v('hem-on-flange', (c) => ({ code: plate(c, 6, 4) + 'p.flange(' + n(c, 1) + ', [[' + n(c, 3) + ', ' + c.T + ', 0]], { position: "inside", lengthRef: "outer" });\np.hem(' + n(c, 0.3) + ', [[' + n(c, 3) + ', ' + n(c, 1) + ', 0]], { hemType: "open", gap: ' + n(c, 0.05) + ' });\n' }));
v('hole-uptonext', (c) => {
  const C60 = 6 + 2 * Math.cos(Math.PI / 3), S60 = 2 * Math.sin(Math.PI / 3), inch = c.u === 'in';
  return { code: head(c) + 'p.sketch("Front").polyline([[0, ' + n(c, 2) + '], [0, 0], [' + n(c, 6) + ', 0], [' + n(c, C60) + ', ' + n(c, S60) + ']], false).end().baseFlange(null, { depth: ' + n(c, 10) + ' });\n' +
    'p.holeWizard({ face: "Right", offset: 0, points: [' + [2, 4, 6, 8].map((z) => '[' + n(c, -z) + ', ' + n(c, 1) + ']').join(', ') + '], standard: "' + (inch ? 'ANSI Inch' : 'ISO') + '", type: "csk", size: "' + (inch ? '#10' : 'M5') + '", end: "next" });\n' };
});
// combinations
v('combo-tray-relief-trim-dimples', (c) => ({ code: trayCode(c, ', relief: "obround"') + ft(c, 'dimple', 2, 2, 0) + 'p.linearPattern({ dir: "x", spacing: ' + n(c, 2) + ', count: 3 });\np.cornerTrim({ relief: "circular", size: ' + n(c, 0.125) + ' });\n', forms: 3, opts: { reliefLayer: true } }));
v('combo-lengths-hem-crossbreak', (c) => ({ code: plate(c, 6, 4) + 'p.flange(' + n(c, 1) + ', [[' + n(c, 3) + ', ' + c.T + ', 0], [' + n(c, 6) + ', ' + c.T + ', ' + n(c, 2) + ']], { position: "inside", lengthRef: "outer", relief: "tear", lengths: { 1: ' + n(c, 1.5) + ' } });\n' +
  'p.hem(' + n(c, 0.3) + ', [[' + n(c, 3) + ', ' + n(c, 1) + ', 0]], { hemType: "closed" });\np.crossBreak(' + '[' + n(c, 3) + ', ' + c.T + ', ' + n(c, 2) + ']' + ', { angle: 2 });\n', cross: 1 }));
v('combo-profile-mirror-dimples', (c) => ({ code: head(c) + 'p.sketch("Top").rect(' + n(c, -3) + ', ' + n(c, -4) + ', ' + n(c, 6) + ', ' + n(c, 4) + ').end().baseFlange();\n' +
  'p.flange(' + n(c, 1) + ', [[0, ' + c.T + ', 0]], { position: "inside", relief: "rect", startPoint: [' + n(c, -3) + ', ' + c.T + ', 0], profile: ' + JSON.stringify(PROF.hole(c)) + ' });\n' +
  'p.mirror("Front", { feature: 3, offset: ' + n(c, 2) + ' });\n' + 'p.formingTool("dimple", [' + n(c, -1.5) + ', ' + c.T + ', ' + n(c, 2) + '], {});\np.mirror("Right", {});\n', forms: 2 }));

// harder combinations: copies of flanges with reliefs, Corner-Trim on a relief tray, forms on a wall, a hem on a profile
v('mirror-relief-flange', (c) => ({ code: cbase(c) + 'p.flange(' + n(c, 1) + ', [[0, ' + c.T + ', 0]], { position: "inside", lengthRef: "outer" });\np.flange(' + n(c, 1) + ', [[' + n(c, 3) + ', ' + c.T + ', ' + n(c, 2) + ']], { position: "inside", lengthRef: "outer", relief: "obround" });\np.mirror("Right", { feature: 4 });\n', opts: { reliefLayer: true } }));
v('cornertrim-on-relief-tray', (c) => ({ code: trayCode(c, ', relief: "rect"') + 'p.cornerTrim({ relief: "square", size: ' + n(c, 0.2) + ', breakCorner: "fillet", breakSize: ' + n(c, 0.1) + ' });\n', opts: { bendLayers: 'split' } }));
v('lengths-tear-cornertrim', (c) => ({ code: plate(c, 6, 4) + 'p.flange(' + n(c, 1) + ', [[' + n(c, 3) + ', ' + c.T + ', 0], [' + n(c, 6) + ', ' + c.T + ', ' + n(c, 2) + '], [' + n(c, 3) + ', ' + c.T + ', ' + n(c, 4) + '], [0, ' + c.T + ', ' + n(c, 2) + ']], { position: "inside", lengthRef: "outer", relief: "tear", lengths: { 1: ' + n(c, 1.5) + ', 3: ' + n(c, 0.75) + ' } });\np.cornerTrim({ relief: "circular", size: ' + n(c, 0.1) + ' });\n' }));
v('wall-louvers', (c) => ({ code: plate(c, 10, 4) + 'p.flange(' + n(c, 3) + ', [[' + n(c, 5) + ', ' + c.T + ', 0]], { position: "inside", lengthRef: "outer" });\np.formingTool("louver", [' + n(c, 2.5) + ', ' + n(c, 1.6) + ', 0], { angle: 0 });\np.linearPattern({ dir: "x", spacing: ' + n(c, 2.5) + ', count: 3 });\n', forms: 3 }), ['20 ga', '16 ga']);
v('profile-hole-hem', (c) => ({ code: profCode(c, 'hole', 'bendOutside') + 'p.hem(' + n(c, 0.25) + ', [[' + n(c, 3) + ', ' + n(c, 1.5) + ' + ' + c.R + ' + ' + c.T + ', ' + (-(c.R + c.T)) + ']], { hemType: "closed", hemPosition: "outside" });\n' }));
v('tray-uptonext', (c) => ({ code: trayCode(c, ', relief: "rect"') + 'p.holeWizard({ face: "Front", offset: ' + n(c, 6) + ', points: [[' + n(c, 2) + ', ' + n(c, 0.5) + '], [' + n(c, 6) + ', ' + n(c, 0.5) + ']], standard: "' + (c.u === 'in' ? 'ANSI Inch' : 'ISO') + '", type: "hole", size: "' + (c.u === 'in' ? '1/4' : 'M6') + '", end: "next" });\n' }));
v('crossbreak-on-tray-with-trim', (c) => ({ code: trayCode(c) + 'p.crossBreak([' + n(c, 4) + ', ' + c.T + ', ' + n(c, 3) + '], {});\np.cornerTrim({ breakCorner: "chamfer", breakSize: ' + n(c, 0.1) + ' });\n', cross: 1 }));
v('lpattern-hem-flange', (c) => ({ code: plate(c, 9, 4) + 'p.sketch("Top", ' + c.T + ').rect(' + n(c, 2.9) + ', ' + n(c, -4) + ', ' + n(c, 0.2) + ', ' + n(c, 0.5) + ').rect(' + n(c, 5.9) + ', ' + n(c, -4) + ', ' + n(c, 0.2) + ', ' + n(c, 0.5) + ').end().cut("through", { both: true });\n' +
  'p.flange(' + n(c, 1) + ', [[' + n(c, 1.5) + ', ' + c.T + ', ' + n(c, 4) + ']], { position: "inside", lengthRef: "outer" });\np.linearPattern({ feature: 5, dir: "x", spacing: ' + n(c, 3) + ', count: 3 });\n' }));

v('relief-tray-bendOutside-120', (c) => ({ code: plate(c, 8, 6) + [[4, 0], [4, 6], [0, 3], [8, 3]].map((e) => 'p.flange(' + n(c, 1) + ', [[' + n(c, e[0]) + ', ' + c.T + ', ' + n(c, e[1]) + ']], { angle: 120, position: "bendOutside", relief: "obround" });\n').join(''), opts: { reliefLayer: true } }));
v('relief-tray-outside-60', (c) => ({ code: plate(c, 8, 6) + [[4, 0], [4, 6], [0, 3], [8, 3]].map((e) => 'p.flange(' + n(c, 1) + ', [[' + n(c, e[0]) + ', ' + c.T + ', ' + n(c, e[1]) + ']], { angle: 60, position: "outside", relief: "tear" });\n').join('') }));
v('mirror-hem-rolled', (c) => ({ code: cbase(c) + 'p.hem(' + n(c, 0.4) + ', [[' + n(c, 3) + ', ' + c.T + ', ' + n(c, 2) + ']], { hemType: "rolled", hemRadius: ' + n(c, 0.1) + ', hemAngle: 270 });\np.mirror("Right", { feature: 3 });\n' }));
v('mirror-hem-teardrop', (c) => ({ code: cbase(c) + 'p.hem(' + n(c, 0.4) + ', [[' + n(c, 3) + ', ' + c.T + ', ' + n(c, 2) + ']], { hemType: "teardrop", hemRadius: ' + n(c, 0.1) + ' });\np.mirror("Right", { feature: 3 });\n' }));

v('tray-inside-135', (c) => ({ code: plate(c, 8, 6) + [[4, 0], [4, 6], [0, 3], [8, 3]].map((e) => 'p.flange(' + n(c, 1) + ', [[' + n(c, e[0]) + ', ' + c.T + ', ' + n(c, e[1]) + ']], { angle: 135, position: "inside", relief: "obround" });\n').join('') }));
v('tray-outside-120', (c) => ({ code: plate(c, 8, 6) + [[4, 0], [4, 6], [0, 3], [8, 3]].map((e) => 'p.flange(' + n(c, 1) + ', [[' + n(c, e[0]) + ', ' + c.T + ', ' + n(c, e[1]) + ']], { angle: 120, position: "outside" });\n').join(''), opts: { bendLayers: 'split' } }));

function corpus() {
  const out = [];
  V.forEach((vv, i) => ['in', 'mm'].forEach((u, k) => {
    const gl = vv.gauges || GAUGES, ga = gl[(i + k) % gl.length], s = GA[u][ga], c = { u, T: s[0], R: s[1], K: s[2], S: u === 'in' ? 1 : 25.4 };
    const r = vv.fn(c);
    out.push({ name: vv.name + '-' + u + '-' + ga.replace(' ', ''), code: r.code, forms: r.forms || 0, cross: r.cross || 0, opts: r.opts || {}, units: u });
  }));
  return out;
}

// ---------------------------------------------------------------- checks
const LAYERS = { OUTLINE: 7, HOLES: 1, BEND: 3, NOTES: 5, BEND_UP: 3, BEND_DOWN: 30, FORM: 6, HIDDEN: 8, BOUNDARY: 4, RELIEF: 2 };
function cross2(a, b) { return a[0] * b[1] - a[1] * b[0]; }
// the kernel's own loop areas, from dxfLoopCurves (lines and true arcs)
function kernelLoops(flat) {
  return flat.loops.map((l) => {
    const cv = K.dxfLoopCurves(l);
    if (!cv) return null;
    if (cv.circle) return { area: Math.PI * cv.circle.r * cv.circle.r, arcs: 0, circle: 1 };
    let a = 0, arcs = 0;
    cv.segs.forEach((s) => {
      if (s.t === 'line') a += cross2(s.a, s.b) / 2;
      else { arcs++; a += (cross2(s.c, [s.b[0] - s.a[0], s.b[1] - s.a[1]]) + s.r * s.r * s.sweep) / 2; }
    });
    return { area: Math.abs(a), arcs, circle: 0 };
  }).filter(Boolean);
}
// imported cut entities -> loops with true-arc areas (as rfOM)
function regions(ents) {
  const pr = K.sketchProfile({ entities: ents }), loops = [];
  pr.loops.forEach((l) => {
    const A = K.signedArea(l.pts), s = A < 0 ? -1 : 1, nn = l.pts.length;
    let a = Math.abs(A);
    (l.seg || []).forEach((ci, i) => {
      const cv = (pr.curves || [])[ci];
      if (ci < 0 || !cv) return;
      const p = l.pts[i], q = l.pts[(i + 1) % nn], h = Math.hypot(q[0] - p[0], q[1] - p[1]) / 2;
      if (!(h > 0) || !(cv.r > 0)) return;
      const th = 2 * Math.asin(Math.min(1, h / cv.r)), seg = cv.r * cv.r / 2 * (th - Math.sin(th));
      const cr = (q[0] - p[0]) * (cv.c[1] - p[1]) - (q[1] - p[1]) * (cv.c[0] - p[0]);
      a += cr * s > 0 ? seg : -seg;
    });
    loops.push({ area: a, hole: !!l.hole, open: !!l.open });
  });
  return loops;
}
function box(ents) {
  const mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
  const gr = (x, y) => { mn[0] = Math.min(mn[0], x); mn[1] = Math.min(mn[1], y); mx[0] = Math.max(mx[0], x); mx[1] = Math.max(mx[1], y); };
  ents.forEach((e) => {
    if (e.t === 'line') { gr(e.x1, e.y1); gr(e.x2, e.y2); }
    else if (e.t === 'circle') { gr(e.cx - e.r, e.cy - e.r); gr(e.cx + e.r, e.cy + e.r); }
    else if (e.t === 'arc') {
      let a1 = e.a1; while (a1 < e.a0) a1 += 360;
      [e.a0, a1].forEach((a) => gr(e.cx + e.r * Math.cos(a * Math.PI / 180), e.cy + e.r * Math.sin(a * Math.PI / 180)));
      for (let k = Math.ceil(e.a0 / 90); k * 90 <= a1; k++) gr(e.cx + e.r * Math.cos(k * Math.PI / 2), e.cy + e.r * Math.sin(k * Math.PI / 2));
    }
  });
  return [mn, mx];
}
function inPoly(P, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > P[1]) !== (b[1] > P[1]) && P[0] < (b[0] - a[0]) * (P[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
const dxfText = (t) => String(t).replace(/°/g, '%%d').replace(/[Ø⌀]/g, '%%c').replace(/±/g, '%%p');
// the LAYER table: name -> { color, ltype }
function layerTable(text) {
  const L = text.replace(/\r\n/g, '\n').split('\n'), out = {};
  let inLayer = false, cur = null;
  for (let i = 0; i + 1 < L.length; i += 2) {
    const c = L[i].trim(), val = L[i + 1].trim();
    if (c === '0') { cur = null; if (val === 'LAYER' && inLayer) cur = {}; if (val === 'TABLE') inLayer = false; if (val === 'ENDTAB') inLayer = false; continue; }
    if (c === '2' && !cur && val === 'LAYER') inLayer = true;
    if (!cur) continue;
    if (c === '2') { cur.name = val; out[val] = cur; } else if (c === '62') cur.color = +val; else if (c === '6') cur.ltype = val.toUpperCase();
  }
  return out;
}
const LTYPE = { BEND: 'CENTER', BEND_UP: 'CENTER', BEND_DOWN: 'CENTER', HIDDEN: 'HIDDEN', OUTLINE: 'CONTINUOUS', HOLES: 'CONTINUOUS', NOTES: 'CONTINUOUS', FORM: 'CONTINUOUS', RELIEF: 'CONTINUOUS', BOUNDARY: 'CONTINUOUS' };
// entity signature per layer and type (LWPOLYLINE vertex count), texts: DWG read back vs the DXF it was made from
function entSig(text) {
  const d = DxfCheck.parse(text), c = {};
  d.entities.forEach((e) => { const k = e.layer + ':' + e.type + (e.type === 'LWPOLYLINE' ? '/' + e.pts.length : '') + (e.type === 'TEXT' ? '=' + e.text : ''); c[k] = (c[k] || 0) + 1; });
  return c;
}
function sigDiff(a, b) { const out = []; new Set(Object.keys(a).concat(Object.keys(b))).forEach((k) => { if (a[k] !== b[k]) out.push(k + ' ' + (a[k] || 0) + ' -> ' + (b[k] || 0)); }); return out; }const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);

// one flat file: issues found (empty = exact)
function checkFlatFile(text, part, P, kind) {
  const iss = [], u = part.units, fl = P.flat;
  if (kind !== 'DWG') {
    const chk = DxfCheck.check(text, { units: u, layers: ['OUTLINE', 'HOLES', 'RELIEF'] });
    if (!chk.ok) iss.push('DxfCheck: ' + chk.errors.slice(0, 3).join(' | '));
  }
  const dp = DxfCheck.parse(text), hd = dp.header;
  if (+hd.$INSUNITS !== (u === 'in' ? 1 : 4)) iss.push('$INSUNITS ' + hd.$INSUNITS);
  if (kind === 'R12' && dp.entities.some((e) => /^(LWPOLYLINE|SPLINE|ELLIPSE|HATCH)$/.test(e.type))) iss.push('R12 holds an R2000 entity');
  const p = DI.parse(text), cut = p.entities.filter((e) => e.layer === 'OUTLINE' || e.layer === 'HOLES' || e.layer === 'RELIEF');
  if (p.units !== u) iss.push('import units ' + p.units);
  if (p.warnings.length) iss.push('import warnings: ' + p.warnings.slice(0, 2).join(' | '));
  const rg = regions(cut), kl = P.kloops;
  const open = rg.filter((l) => l.open).length;
  if (rg.length !== kl.length || open) iss.push('loops ' + rg.length + ' (' + open + ' open) vs ' + kl.length);
  const ra = rg.filter((l) => !l.open).map((l) => l.area).sort((a, b) => a - b), ka = kl.map((l) => l.area).sort((a, b) => a - b);
  if (ra.length === ka.length) {
    let worst = 0; ra.forEach((a, i) => { worst = Math.max(worst, rel(a, ka[i])); });
    if (worst > 1e-9) iss.push('loop area off ' + worst.toExponential(2));
    P.worst = Math.max(P.worst || 0, worst);
  }
  const tot = rg.reduce((s, l) => s + (l.hole ? -1 : 1) * l.area, 0), want = P.cl['Bounding Box Area-Blank'];
  if (want != null && rel(tot, want) > 1e-9) iss.push('area ' + tot + ' vs cut list ' + want + ' (' + rel(tot, want).toExponential(2) + ')');
  const nc = cut.filter((e) => e.t === 'circle').length, na = cut.filter((e) => e.t === 'arc').length;
  const kc = kl.reduce((s, l) => s + l.circle, 0), ka2 = kl.reduce((s, l) => s + l.arcs, 0);
  if (nc !== kc) iss.push(nc + ' CIRCLEs for ' + kc + ' round holes');
  if (na !== ka2 && !(part.opts.reliefLayer)) iss.push(na + ' arcs for ' + ka2);
  // extents = the blank's (skipped with a boundary box / hidden edges, which may lie outside... they do not; kept)
  if (hd.$EXTMIN && hd.$EXTMAX) {
    const bx = box(cut), mn = hd.$EXTMIN.map(Number), mx = hd.$EXTMAX.map(Number);
    const d = Math.max(Math.abs(mn[0] - bx[0][0]), Math.abs(mn[1] - bx[0][1]), Math.abs(mx[0] - bx[1][0]), Math.abs(mx[1] - bx[1][1]));
    if (d > 1e-9 * Math.max(1, fl.size[0]) && !part.opts.hiddenEdges && kind !== 'DWG') iss.push('extents off the blank by ' + d.toExponential(2));
    P['ext' + kind] = d;
  } else if (kind !== 'DWG') iss.push('no $EXTMIN / $EXTMAX');
  // layers: colour and line type as the README documents
  const lt = layerTable(text);
  Object.keys(lt).forEach((nm) => { if (LTYPE[nm] && lt[nm].ltype && lt[nm].ltype !== LTYPE[nm]) iss.push('layer ' + nm + ' line type ' + lt[nm].ltype); if (LTYPE[nm] && !lt[nm].ltype) iss.push('layer ' + nm + ' has no line type'); });
  p.layers.forEach((l) => { if (LAYERS[l.name] != null && Math.abs(l.color) !== LAYERS[l.name]) iss.push('layer ' + l.name + ' colour ' + l.color); });
  // bend lines: count, layer, on metal; a note per bend
  const bl = dp.entities.filter((e) => e.type === 'LINE' && /^BEND/.test(e.layer));
  const wantBends = fl.bends.length + part.crossLines;
  if (bl.length !== wantBends) iss.push(bl.length + ' bend lines for ' + wantBends);
  const split = part.opts.bendLayers === 'split';
  if (!bl.every((e) => split ? e.layer !== 'BEND' : e.layer === 'BEND')) iss.push('bend layer');
  const notes = dp.entities.filter((e) => (e.type === 'TEXT' || e.type === 'MTEXT') && e.layer === 'NOTES').map((e) => dxfText(String(e.text).replace(/\\U\+00B0/gi, '°')));
  fl.bends.forEach((b) => { const s = dxfText(K.bendNoteText(b, u)); if (notes.indexOf(s) < 0) iss.push('no bend note ' + s); });
  // forming tools: one note per copy (each copy's mark on FORM)
  if (part.forms) {
    const fn = P.formNotes;
    const got = notes.filter((t) => fn.indexOf(t) >= 0).length;
    if (got !== part.forms) iss.push(got + ' form notes for ' + part.forms + ' copies');
    if (!dp.entities.some((e) => e.layer === 'FORM')) iss.push('no FORM marks');
  }
  if (part.crossLines && !notes.some((t) => /^CROSS BREAK/.test(t))) iss.push('no CROSS BREAK note');
  return iss;
}

let oc = null;
async function occtRead(stepText) {
  if (!oc) oc = (await require(path.join(here, 'anvil/headless/occt.js')).loadOpenCascade({})).oc;
  const f = '/audit.step';
  oc.FS.writeFile(f, stepText);
  const rd = new oc.STEPControl_Reader_1();
  if (rd.ReadFile(f) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) return { error: 'not read' };
  rd.TransferRoots(new oc.Message_ProgressRange_1());
  const sh = rd.OneShape(), E = oc.TopAbs_ShapeEnum;
  let vol = 0, solids = 0, valid = true;
  for (let x = new oc.TopExp_Explorer_2(sh, E.TopAbs_SOLID, E.TopAbs_SHAPE); x.More(); x.Next()) {
    const s = oc.TopoDS.Solid_1(x.Current()); solids++;
    const gp = new oc.GProp_GProps_1(); oc.BRepGProp.VolumeProperties_1(s, gp, false, false, false); vol += gp.Mass();
    if (!new oc.BRepCheck_Analyzer(s, true, false).IsValid_2()) valid = false;
  }
  try { oc.FS.unlink(f); } catch (e) { }
  return { vol, solids, valid };
}

async function runPart(part, o) {
  const res = { name: part.name, formats: {} };
  Object.defineProperty(res, 'P', { value: null, writable: true, enumerable: false });
  const m = K.newModel('A');
  let b, mesh, mp;
  try { K.runScript(m, part.code); b = K.rebuild(m); mesh = K.meshFromBody(b.body); mp = K.massProps(mesh, 1); } catch (e) { res.refused = 'threw: ' + e.message; return res; }
  const errs = Object.keys(b.errors || {}).map((id) => id + ': ' + b.errors[id]);
  if (errs.length) { res.refused = errs.join(' | ').slice(0, 300); return res; }
  const ck = Ev.checkBody(b.body);
  res.closed = !ck.openEdges.length && !ck.nonManifoldEdges.length;
  res.volume = mp.volume;
  let flat;
  try { flat = K.flatPattern(m, b, mesh); } catch (e) { res.refused = 'flat threw: ' + e.message; return res; }
  if (!flat || !flat.loops) { res.refused = 'no flat: ' + (flat && flat.error); return res; }
  const P = res.P = { flat, cl: K.sheetCutList(m, b, mesh, flat).values, kloops: kernelLoops(flat) };
  const fitems = (flat.etch || []).filter((it) => it.form != null);
  P.formNotes = fitems.filter((it) => it.kind === 'note').map((it) => dxfText(it.text));
  P.formCopies = P.formNotes.length;   // one note per copy (copies share the feature id in it.form)
  part.crossLines = (flat.etch || []).filter((it) => it.crossBreak).length;
  res.flat = { circles: P.kloops.reduce((q, l) => q + l.circle, 0), arcs: P.kloops.reduce((q, l) => q + l.arcs, 0), loops: flat.loops.length, bends: flat.bends.length, size: flat.size, formCopies: P.formCopies, crossLines: part.crossLines };
  if (part.forms && P.formCopies !== part.forms) res.formCopiesOff = P.formCopies + ' form copies in the flat for ' + part.forms;
  if (part.cross && part.crossLines !== 2 * part.cross) res.crossOff = part.crossLines + ' cross-break lines';
  // bend lines on metal (flat coordinates)
  const outer = flat.loops[0], holes = flat.loops.slice(1), off = [];
  flat.bends.forEach((bd, k) => [1e-4, 0.02, 0.5, 0.98, 1 - 1e-4].forEach((t) => {
    const Q = [bd.a[0] + (bd.b[0] - bd.a[0]) * t, bd.a[1] + (bd.b[1] - bd.a[1]) * t];
    if (!inPoly(Q, outer) || holes.some((h) => inPoly(Q, h))) off.push('bend ' + k + ' at ' + t);
  }));
  if (off.length) res.bendOffMetal = off.slice(0, 4).join(', ');
  const files = {};
  [['R12', { version: 'R12' }], ['R2000', { version: 'R2000' }], ['R2000e', { version: 'R2000', style: 'entities' }]].forEach((f) => {
    try { files[f[0]] = K.exportDXFFlat(flat, part.units, Object.assign({}, part.opts, f[1])); if (o.mutate) files[f[0]] = files[f[0]].replace(/(\nOUTLINE\r?\n[\s\S]*?\n10\r?\n)([-\d.]+)/, (q, a, x) => a + (+x + 1e-5)); res.formats[f[0]] = checkFlatFile(files[f[0]], part, P, f[0]); }
    catch (e) { res.formats[f[0]] = ['threw: ' + e.message]; }
  });
  if (!o.noDwg) {
    try {
      const bytes = DWG.fromDXF(files.R2000), back = dwgTool.toDxf(bytes, dwgTool.which('dwg2dxf')).toString('latin1');
      res.formats.DWG = checkFlatFile(back, part, P, 'DWG').concat(sigDiff(entSig(files.R2000), entSig(back)).slice(0, 4).map((x) => 'entity ' + x));
      const back12 = dwgTool.toDxf(DWG.fromDXF(files.R12), dwgTool.which('dwg2dxf')).toString('latin1');
      res.formats.DWG12 = checkFlatFile(back12, part, P, 'DWG');
      res.dwgExt = [P.extDWG];
    } catch (e) { res.formats.DWG = ['threw: ' + e.message]; }
  }
  // STEP
  try {
    const st = X.exportSTEP(m, b), ib = K.rebuild(X.newPartFromImport(X.importFile('a.step', st, { units: part.units })));
    const ick = Ev.checkBody(ib.body), iv = K.massProps(K.meshFromBody(ib.body), 1).volume, iss = [];
    if (ick.openEdges.length + ick.nonManifoldEdges.length) iss.push('read back open: ' + ick.openEdges.length + ' open, ' + ick.nonManifoldEdges.length + ' non-manifold');
    if (rel(iv, mp.volume) > 1e-6) iss.push('read back volume ' + rel(iv, mp.volume).toExponential(2));
    res.formats.STEP = iss; res.stepRel = rel(iv, mp.volume);
    if (!o.noOcct) {
      const r = await occtRead(st), sc = part.units === 'in' ? Math.pow(25.4, 3) : 1, io = [];
      if (r.error) io.push(r.error);
      else {
        if (!r.valid) io.push('OpenCascade: not valid (' + r.solids + ' solids)');
        res.occtRel = rel(r.vol / sc, mp.volume);
        if (rel(r.vol / sc, mp.volume) > 1e-6) io.push('OpenCascade volume ' + rel(r.vol / sc, mp.volume).toExponential(2));
      }
      res.formats.OCCT = io;
    }
  } catch (e) { res.formats.STEP = ['threw: ' + e.message]; }
  return res;
}

async function main() {
  const o = { mutate: args.includes('--mutate'), noDwg: args.includes('--no-dwg'), noOcct: args.includes('--no-occt') };
  let parts = corpus();
  if (args.includes('--list')) { parts.forEach((p) => console.log(p.name)); return; }
  if (flag('--dump')) { const w = String(flag('--dump')).split(','); fs.writeFileSync(path.resolve(String(flag('--out'))), JSON.stringify(parts.filter((p) => w.indexOf(p.name) >= 0).map((p) => [p.name, p.code, p.opts, p.forms, p.cross]))); return; }
  const only = flag('--only');
  if (only) parts = parts.filter((p) => only.split(',').some((w) => p.name.indexOf(w) >= 0));
  const all = [], tally = {};
  for (const part of parts) {
    const t0 = Date.now(), r = await runPart(part, o);
    r.ms = Date.now() - t0; r.areaRel = r.P ? r.P.worst : null;
    all.push(r);
    const bad = Object.keys(r.formats).filter((k) => r.formats[k].length);
    const extra = ['refused', 'formCopiesOff', 'crossOff', 'bendOffMetal'].filter((k) => r[k]).map((k) => k + ': ' + r[k]);
    if (r.closed === false) extra.push('part open');
    console.log((r.refused ? 'REFUSED ' : bad.length || extra.length ? 'OFF     ' : 'exact   ') + r.name + ' (' + r.ms + ' ms)' + (r.flat ? ' loops ' + r.flat.loops + ' (circles ' + r.flat.circles + ', arcs ' + r.flat.arcs + ') bends ' + r.flat.bends + (r.dwgExt ? ' dwgExt ' + r.dwgExt : '') : ''));
    extra.forEach((x) => console.log('    ' + x));
    bad.forEach((k) => console.log('    ' + k + ': ' + r.formats[k].join(' | ')));
    ['R12', 'R2000', 'R2000e', 'DWG', 'DWG12', 'STEP', 'OCCT'].forEach((k) => {
      const t = tally[k] = tally[k] || { exact: 0, off: 0, refused: 0 };
      if (r.refused) t.refused++; else if (r.formats[k]) t[r.formats[k].length ? 'off' : 'exact']++;
    });
  }
  const mx = (k) => all.reduce((q, r) => Math.max(q, r[k] || 0), 0);
  console.log('\nworst: loop area ' + mx('areaRel').toExponential(2) + ', STEP read back by Anvil ' + mx('stepRel').toExponential(2) + ', by OpenCascade ' + mx('occtRel').toExponential(2));
  console.log('\n| format | exact | off | refused |\n|---|---|---|---|');
  Object.keys(tally).forEach((k) => console.log('| ' + k + ' | ' + tally[k].exact + ' | ' + tally[k].off + ' | ' + tally[k].refused + ' |'));
  if (flag('--json')) fs.writeFileSync(path.resolve(flag('--json')), JSON.stringify(all, null, 1));
}
main().then(() => process.exit(0), (e) => { console.error(e.stack || e); process.exit(1); });
