'use strict';
// The STEP-to-flat corpus (lane stepflats, rfQR): 20 folded parts as Anvil scripts, each with `fixed`, a point on the
// original Base Flange's face (the face Insert Bends keeps fixed). Used by step-flats-corpus.js.
function IN(T, R, K) { return 'p.units("in");\np.sheet(' + T + ', ' + R + ', ' + K + ');\n'; }
function MM(T, R, K) { return 'p.units("mm");\np.sheet(' + T + ', ' + R + ', ' + K + ');\n'; }
function rect(W, H) { return 'p.sketch("Top").rect(0, -' + H + ', ' + W + ', ' + H + ').end().baseFlange();\n'; }
function holes(list, r) { return 'p.sketch("Top")' + list.map((c) => '.circle(' + c[0] + ', ' + (-c[1]) + ', ' + r + ')').join('') + '.end().extrude(1, { cut: true, through: true, both: true });\n'; }
function tray(T, W, H, L, opts) { return [[W / 2, T, 0], [W, T, H / 2], [W / 2, T, H], [0, T, H / 2]].map((e) => 'p.flange(' + L + ', [' + JSON.stringify(e) + '], ' + JSON.stringify(opts) + ');\n').join(''); }
function open(pts, depth) { return 'p.sketch("Front").polyline(' + JSON.stringify(pts) + ', false).end().baseFlange(null, { depth: ' + depth + ' });\n'; }
function line(p, q) { return { t: 'line', x1: p[0], y1: p[1], x2: q[0], y2: q[1] }; }
function poly(pts) { return pts.map((p, i) => line(p, pts[(i + 1) % pts.length])); }

const T16 = 0.0598, T11 = 0.1196, T20 = 0.0359;
const parts = [
  { id: 'L16', name: 'L bracket 16 ga, K .44, holes .2 from the bend', code: IN(T16, T16, 0.44) + rect(4, 2) + 'p.flange(1.5, [[2, ' + T16 + ', 0]], {});\n' + holes([[1, 0.3], [3, 0.3], [2, 1.5]], 0.125), fixed: [2, T16, 1.2] },
  { id: 'Lmm3', name: 'L bracket 3 mm, R 3, K .5, mm', code: MM(3, 3, 0.5) + rect(100, 50) + 'p.flange(40, [[50, 3, 0]], { position: "inside" });\n' + holes([[25, 8], [75, 8]], 4), fixed: [50, 3, 30] },
  { id: 'U15', name: 'U channel 1.5 mm, R 1.5, K .4, holes near both bends', code: MM(1.5, 1.5, 0.4) + rect(100, 60) + 'p.flange(30, [[50, 1.5, 0], [50, 1.5, 60]], {});\n' + holes([[25, 6], [75, 54], [50, 30]], 3), fixed: [50, 1.5, 30] },
  { id: 'U11', name: 'U channel 11 ga, R .12, K .33, inside', code: IN(T11, 0.12, 0.33) + rect(6, 3) + 'p.flange(1.25, [[3, ' + T11 + ', 0], [3, ' + T11 + ', 3]], { position: "inside" });\n', fixed: [3, T11, 1.5] },
  { id: 'Z135', name: 'Z with a 135 and a 45 degree bend, 11 ga, K .33', code: IN(T11, 0.12, 0.33) + open([[0, 0], [2, 0], [1, 1], [1, 2.5]], 3), fixed: [1, 0, 1.5] },
  { id: 'hat', name: 'hat channel 20 ga, K .5', code: IN(T20, T20, 0.5) + open([[0, 0], [1, 0], [1, 1.5], [3, 1.5], [3, 0], [4, 0]], 3), fixed: [0.5, 0, 1.5] },
  { id: 'trayR', name: 'tray 16 ga, Material Inside, rect relief', code: IN(T16, T16, 0.44) + rect(6, 4) + tray(T16, 6, 4, 1, { position: 'inside', relief: 'rect' }), fixed: [3, T16, 2] },
  { id: 'trayT', name: 'tray 16 ga, Material Inside, tear relief', code: IN(T16, T16, 0.44) + rect(6, 4) + tray(T16, 6, 4, 1, { position: 'inside', relief: 'tear' }), fixed: [3, T16, 2] },
  { id: 'trayO', name: 'tray 1 mm, R 1, K .45, obround relief', code: MM(1, 1, 0.45) + rect(150, 100) + tray(1, 150, 100, 25, { position: 'inside', relief: 'obround' }), fixed: [75, 1, 50] },
  { id: 'trayCC', name: 'tray 16 ga with four butt Closed Corners', code: IN(T16, T16, 0.5) + rect(4, 3) + tray(T16, 4, 3, 1, { position: 'inside', lengthRef: 'outer' }) +
    'p.closedCorner(' + JSON.stringify([[T16 / 2, 0.6, 2 * T16], [4 - T16 / 2, 0.6, 2 * T16], [4 - 2 * T16, 0.6, 3 - T16 / 2], [T16 / 2, 0.6, 3 - 2 * T16]]) + ', { cornerType: "butt", gap: 0.01, coplanar: false });\n', fixed: [2, T16, 1.5] },
  { id: 'hems', name: 'two Hems, closed and open, 20 ga', code: IN(T20, T20, 0.5) + rect(4, 3) + 'p.hem(0.375, [[2, ' + T20 + ', 0]], { hemType: "closed" });\np.hem(0.375, [[2, ' + T20 + ', 3]], { gap: 0.03 });\n', fixed: [2, T20, 1.5] },
  { id: 'jog', name: 'Jog .5 x 1, 16 ga', code: IN(T16, T16, 0.5) + rect(4, 3) + 'p.jog(0.5, 1, [[0, ' + T16 + ', 1.5]]);\n', fixed: [3, T16, 1.5] },
  { id: 'miter', name: 'Miter Flange L profile round two edges', code: IN(T16, T16, 0.5) + rect(4, 2) + 'p.sketch("Right").line(0, ' + T16 + ', 0, ' + (T16 + 1) + ').line(0, ' + (T16 + 1) + ', 0.5, ' + (T16 + 1) + ').end();\np.miterFlange([[2, ' + T16 + ', 0], [0, ' + T16 + ', 1]], {});\n', fixed: [1, T16, 1.3] },
  { id: 'partial', name: 'flange on part of an edge (offsets 1 / 1.5), rect relief', code: IN(T16, T16, 0.5) + rect(6, 3) + 'p.flange(1, [[3, ' + T16 + ', 0]], { position: "inside", relief: "rect", startOffset: 1, endOffset: 1.5 });\n', fixed: [3, T16, 1.5] },
  { id: 'profile', name: 'flange with a custom profile (gusset end)', code: IN(T16, T16, 0.5) + rect(6, 3) + 'p.flange(1, [[3, ' + T16 + ', 0]], { position: "inside", relief: "rect", startPoint: [0, ' + T16 + ', 0], profile: ' + JSON.stringify({ entities: poly([[0, 0], [5, 0], [3.5, 1.5], [0, 1.5]]) }) + ' });\n', fixed: [3, T16, 1.5] },
  { id: 'slant', name: 'bracket with a flange on a slanted edge, 11 ga', code: IN(T11, 0.12, 0.4) + 'p.sketch("Top").polyline([[0, 0], [4, 0], [3, -2], [0, -2]], true).end().baseFlange();\np.flange(1, [[3.5, ' + T11 + ', 1]], {});\n', fixed: [1.5, T11, 1] },
  { id: 'flare', name: 'flared lip (Miter Flange, lip 37 degrees out)', code: IN(T16, T16, 0.5) + rect(4, 2) + 'p.sketch("Right").line(0, ' + T16 + ', 0, ' + (T16 + 1) + ').line(0, ' + (T16 + 1) + ', ' + (0.5 * Math.cos(37 * Math.PI / 180)) + ', ' + (T16 + 1 + 0.5 * Math.sin(37 * Math.PI / 180)) + ').end();\np.miterFlange([[2, ' + T16 + ', 0], [0, ' + T16 + ', 1]], {});\n', fixed: [1, T16, 1.3] },
  { id: 'xbreak', name: 'panel with a Cross-Break and two flanges', code: IN(T20, T20, 0.5) + rect(4, 2) + 'p.flange(0.75, [[2, ' + T20 + ', 0]], {});\np.crossBreak([1, ' + T20 + ', 1], { radius: 0.25, angle: 2 });\n', fixed: [1, T20, 1] },
  { id: 'forms', name: 'plate with a louver and two dimples, mm', code: 'p.units("mm");\np.sheet(1.9, 1.9, 0.5);\np.sketch("Top").rect(0, -80, 100, 80).end().baseFlange();\np.flange(20, [[50, 1.9, 0]], {});\np.formingTool("louver", [50, 1.9, 45]);\np.formingTool("dimple", [20, 1.9, 60]);\np.formingTool("dimple", [80, 1.9, 60]);\n', fixed: [50, 1.9, 30] },
  { id: 'tray135', name: 'tray 11 ga at 135 degrees, Material Inside, obround relief (task 1)', code: IN(T11, 0.12, 0.33) + rect(8, 6) + [[4, T11, 0], [4, T11, 6], [0, T11, 3], [8, T11, 3]].map((e) => 'p.flange(1, [' + JSON.stringify(e) + '], { angle: 135, position: "inside", relief: "obround" });\n').join(''), fixed: [4, T11, 3] }
];
module.exports = { parts };
