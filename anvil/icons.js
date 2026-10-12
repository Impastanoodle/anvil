// icons.js — inline SVG icon set for Anvil's ribbon, tree and panels.
// Drawn on a 16×16 grid in the SolidWorks colour language: blue-grey base solids, a green accent for boss/add
// features, a red-orange accent for cut/remove features, yellow for sketch tools, grey-blue for reference geometry.
// Original artwork; the slate ink is currentColor so the stylesheet picks it per theme (.ico { color: var(--icon-ink) }).
var Icons = (function () {
  'use strict';
  var S = 'currentColor';                                   // ink
  var B = '#2f7fd6';                                        // sketch entities, selection blue
  var G = '#3ba776', GL = '#9bdcbd', GD = '#2b8a5f';        // boss / add
  var R = '#e0553c', RL = '#f4a795', RD = '#b33d2a';        // cut / remove
  var Y = '#f2c230', YD = '#c9961a';                        // sketch
  var P = '#7d98bd', PL = '#d5e0ef';                        // reference geometry
  var F1 = '#e2eaf3', F2 = '#bfcfe0', F3 = '#98adc6';       // base solid: top, front, side faces
  var L = '#9aa3ad', W = '#ffffff';
  var DASH = 'stroke-dasharray="2 1.4"';

  // one stroke attribute per element (color defaults to the ink, width to 1.25)
  function st(color, w, extra) { return 'stroke="' + (color || S) + '" stroke-width="' + (w || 1.25) + '" stroke-linejoin="round" stroke-linecap="round"' + (extra ? ' ' + extra : ''); }
  function p(d, fill, color, w, extra) { return '<path d="' + d + '" fill="' + (fill || 'none') + '" ' + st(color, w, extra) + '/>'; }
  function ln(d, color, w, extra) { return p(d, 'none', color, w, extra); }
  function circ(cx, cy, r, fill, color, w) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + (fill || 'none') + '" ' + (color === 'none' ? 'stroke="none"' : st(color, w)) + '/>'; }
  function ell(cx, cy, rx, ry, fill, color, w) { return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + (fill || 'none') + '" ' + (color === 'none' ? 'stroke="none"' : st(color, w)) + '/>'; }
  function rect(x, y, w, h, fill, color, sw, extra) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + (fill || 'none') + '" ' + st(color, sw, extra) + '/>'; }
  function txt(x, y, size, s, fill, family, weight) { return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" font-weight="' + (weight || 600) + '" font-family="' + (family || 'Segoe UI, Arial, sans-serif') + '" fill="' + (fill || S) + '" text-anchor="middle">' + s + '</text>'; }
  // isometric block: front face w×h at (x, y+d), top and right faces receding by d
  function blk(x, y, w, h, d, front, top, side, color, sw) {
    var y0 = y + d;
    return p('M' + x + ' ' + y0 + ' h' + w + ' v' + h + ' h-' + w + ' z', front || F2, color, sw) +
      p('M' + x + ' ' + y0 + ' l' + d + ' -' + d + ' h' + w + ' l-' + d + ' ' + d + ' z', top || F1, color, sw) +
      p('M' + (x + w) + ' ' + y0 + ' l' + d + ' -' + d + ' v' + h + ' l-' + d + ' ' + d + ' z', side || F3, color, sw);
  }
  var SHEET = rect(1.5, 4.5, 9, 9, W, P, 1.1);                                  // the sketch sheet behind the pencil
  var PENCIL = p('M6.5 11.5 L12.5 5.5 l2 2 L8.5 13.5 z', Y, YD, 1) + p('M6.5 11.5 L5.3 14.7 L8.5 13.5 z', '#e9c3a4', YD, 1) + ln('M12.5 5.5 l2 2', S, 0.9);
  var SPOOL = 'M4 3 h8 l-2 3.5 v3 l2 3.5 h-8 l2 -3.5 v-3 z';                  // revolved body profile (spool)
  var AXIS = ln('M8 1 v14', S, 0.9, DASH);
  var SWEEP_PATH = 'M3.5 13 C3.5 6 12.5 10 12.5 3';
  var FLANGE_L = 'M2 10.5 h6.5 a2 2 0 0 0 2 -2 V2.5 h3 V8.5 a5 5 0 0 1 -5 5 H2 z'; // L-bent sheet, 3 thick

  var I = {
    // ---- features: boss (green) / cut (red)
    extrude: blk(1.5, 5, 8, 6, 3.5) + blk(4, 1.5, 3.5, 3.5, 2, G, GL, GD),
    cut: blk(1.5, 5, 8, 6, 3.5) + p('M4 7.6 l2 -2 h4.5 l-2 2 z', R, RD, 1),
    revolve: p(SPOOL, G, S) + ell(8, 3, 4, 1.3, GL, S) + AXIS,
    revolveCut: p(SPOOL, F2, S) + ell(8, 3, 4, 1.3, F1, S) + p('M6 6.5 h4 v3 h-4 z', R, RD, 1) + AXIS,
    sweep: ln(SWEEP_PATH, S, 4.2) + ln(SWEEP_PATH, G, 2.6) + circ(3.5, 13, 2.2, GL, S, 1.1),
    loft: p('M5.5 3.5 L2.5 13 h11 L10.5 3.5 z', G, S) + ell(8, 13, 5.5, 1.6, GL, S) + ell(8, 3.5, 2.5, 0.9, GL, S),
    hole: blk(1.5, 5, 10, 4, 3.5) + ell(7.5, 7.2, 2.8, 1.2, RL, RD, 1) + ell(7.5, 7.2, 1.5, 0.65, RD, 'none'),
    holeWizard: blk(1.5, 5, 10, 4, 3.5) + ell(7.5, 7.2, 3.4, 1.4, RL, RD, 1) + ell(7.5, 7.8, 1.6, 0.6, RD, 'none') + ln('M5.9 7.8 v1.6 M9.1 7.8 v1.6', RD, 0.8),
    fillet: p('M2 14 V7.5 a4.5 4.5 0 0 1 4.5 -4.5 H14 V14 z', F2, S) + ln('M2 7.5 a4.5 4.5 0 0 1 4.5 -4.5', G, 2.2),
    chamfer: p('M2 14 V7.5 l4.5 -4.5 H14 V14 z', F2, S) + ln('M2 7.5 l4.5 -4.5', G, 2.2),
    imported: blk(5.5, 5.5, 8, 7, 3) + ln('M0.8 4.2 H6.2', G, 1.5) + ln('M4.2 2 L6.4 4.2 L4.2 6.4', G, 1.5),
    shell: blk(1.5, 4.5, 9, 7, 3.5) + p('M3.4 7.1 L5.5 5 H11.6 L9.5 7.1 z', '#5f7189', S, 1),
    draft: p('M3 14 L5.5 2.5 h5 L13 14 z', F2, S) + ln('M5.5 2.5 L3 14', G, 1.6),
    rib: blk(1.5, 4.5, 9, 7, 3.5) + p('M4 13 l5 -5.5 v5.5 z', G, S, 1),
    wrap: p('M3 4 a5 2 0 0 1 10 0 v8 a5 2 0 0 1 -10 0 z', F2, S) + ell(8, 4, 5, 2, F1, S) + ln('M4 9 c1.5 1.2 6.5 1.2 8 0', G, 1.6),
    intersect: circ(6, 8, 4.5, F2, S) + circ(10, 8, 4.5, F2, S) + p('M8 3.97 A4.5 4.5 0 0 1 8 12.03 A4.5 4.5 0 0 1 8 3.97 z', G, S, 1),
    // ---- patterns and mirror: the seed is solid green, the instances a lighter tint
    lpattern: rect(1.5, 3, 3, 3, G, S, 1) + rect(6.5, 3, 3, 3, GL, S, 1) + rect(11.5, 3, 3, 3, GL, S, 1) + rect(1.5, 9.5, 3, 3, GL, S, 1) + rect(6.5, 9.5, 3, 3, GL, S, 1) + rect(11.5, 9.5, 3, 3, GL, S, 1),
    cpattern: circ(8, 8, 5.5, 'none', S, 0.9) + circ(8, 8, 0.8, S, 'none') + rect(6.7, 1.2, 2.6, 2.6, G, S, 1) + rect(12.2, 6.7, 2.6, 2.6, GL, S, 1) + rect(6.7, 12.2, 2.6, 2.6, GL, S, 1) + rect(1.2, 6.7, 2.6, 2.6, GL, S, 1),
    mirror: p('M6.5 3 L2 6 v7 h4.5 z', G, S) + p('M9.5 3 L14 6 v7 h-4.5 z', GL, S) + ln('M8 1.5 v13', S, 1, DASH),
    // ---- reference geometry (grey-blue)
    refgeo: p('M1.5 12.5 l3.5 -6 h9 l-3.5 6 z', PL, P) + ln('M8 14.5 V5 M8 5 l-2 2 M8 5 l2 2', S, 1.25),
    plane: p('M1.5 12.5 l4 -7 h9 l-4 7 z', PL, P),
    planeSmall: p('M1 12 l4 -6 h8 l-4 6 z', PL, P, 1.1),
    origin: ln('M3.5 12.5 h9 M3.5 12.5 v-9', R, 1.5) + ln('M3.5 12.5 l4 3', B, 1.5) + circ(3.5, 12.5, 1.4, S, 'none'),
    // r14/commands14: the Reference Geometry flyout's Axis, Coordinate System and Point
    refAxis: p('M1.5 12.5 l3.5 -6 h9 l-3.5 6 z', PL, P, 1) + ln('M8 1.5 v13.5', S, 1.2, 'stroke-dasharray="3 1.4 0.6 1.4"'),
    csys: ln('M4 12 h9.5 M4 12 V2.5', P, 1.5) + ln('M4 12 l-2.5 2.5', P, 1.5) + ln('M11.5 10 l2 2 -2 2 M2 4.5 l2 -2 2 2', P, 1.1) + circ(4, 12, 1.4, S, 'none'),
    refPoint: p('M1.5 12.5 l3.5 -6 h9 l-3.5 6 z', PL, P, 1) + ln('M8 6.5 v6 M5 9.5 h6', S, 1.1) + circ(8, 9.5, 1.5, P, 'none'),
    curves: ln('M2 12 C5 2 11 14 14 4', B, 1.5),
    // r12/chrome12: Instant3D, a block with the blue drag handle standing on its top face
    instant: blk(1.5, 6.5, 8, 5.5, 3) + ln('M7.25 8 V3', B, 1.5) + p('M5.1 3.9 L7.25 1 9.4 3.9 z', B, B, 0.8) + circ(7.25, 8, 1.3, W, B, 1.1),
    // ---- sketch (yellow pencil, blue entities)
    sketch: SHEET + PENCIL,
    exitSketch: SHEET + ln('M3.5 9 h6.5 M7.5 6.5 l2.5 2.5 -2.5 2.5', G, 1.7) + ln('M10.5 13 L14 9.5', S, 3.4) + ln('M10.5 13 L14 9.5', Y, 2.2),
    dim: ln('M2 11.5 h12 M2 9 v5 M14 9 v5', S, 1.1) + ln('M2 11.5 l2.5 -1.4 M2 11.5 l2.5 1.4 M14 11.5 l-2.5 -1.4 M14 11.5 l-2.5 1.4', B, 1.2) + txt(8, 7.5, 6, '10'),
    line: ln('M2.5 13 L13.5 3', B, 1.5) + circ(2.5, 13, 1.2, S, 'none') + circ(13.5, 3, 1.2, S, 'none'),
    rect: rect(2.5, 4, 11, 8, 'none', B, 1.5) + circ(2.5, 4, 1.2, S, 'none') + circ(13.5, 12, 1.2, S, 'none'),
    crect: rect(2.5, 4, 11, 8, 'none', B, 1.5) + ln('M6.5 8 h3 M8 6.5 v3', S, 1.1),
    // p9-sketchtab: Midpoint Line and the 3 Point / Parallelogram rectangle types
    midline: ln('M2.5 13 L13.5 3', B, 1.5) + circ(8, 8, 1.5, S, 'none') + circ(2.5, 13, 1.1, S, 'none') + circ(13.5, 3, 1.1, S, 'none'),
    // Parallel Line: the reference (ink), the new line (blue) and the distance between them
    parallelLine: ln('M1.5 9.5 L9.5 1.5', S, 1.3) + ln('M6.5 14.5 L14.5 6.5', B, 1.5) + ln('M6.2 6.2 L9.8 9.8', S, 1, 'stroke-dasharray="1.3 1"') + circ(6.5, 14.5, 1.1, S, 'none') + circ(14.5, 6.5, 1.1, S, 'none'),
    // ui-sketch-construct.js: Tangent Line, Perpendicular Line, Bisector, Tangent Circle, Split / Join Entities
    tangentLine: circ(4, 10.5, 3, 'none', S, 1.1) + circ(12, 10.5, 3, 'none', S, 1.1) + ln('M1 7.5 H15', B, 1.5) + circ(4, 7.5, 1.1, S, 'none') + circ(12, 7.5, 1.1, S, 'none'),
    perpLine: ln('M1.5 13.5 H14.5', S, 1.3) + ln('M8 13.5 V2.5', B, 1.5) + ln('M8 10.5 H11 V13.5', S, 0.9) + circ(8, 2.5, 1.1, S, 'none'),
    bisectorLine: ln('M2 14 H14.5 M2 14 V1.5', S, 1.3) + ln('M2 14 L12.5 3.5', B, 1.5, 'stroke-dasharray="2 1.4"') + ln('M7 14 A5 5 0 0 0 5.5 10.5 M5.5 10.5 A5 5 0 0 0 2 9', S, 0.9),
    tangentCircle: ln('M1.5 14.5 H14.5 M1.5 14.5 V1.5', S, 1.3) + circ(6.5, 9.5, 5, 'none', B, 1.5) + circ(6.5, 14.5, 1, S, 'none') + circ(1.5, 9.5, 1, S, 'none'),
    splitEnt: ln('M2 13 L6.8 8.2', B, 1.5) + ln('M9.2 5.8 L14 1', B, 1.5) + circ(8, 7, 1.5, Y, YD, 0.9) + ln('M4.5 4.5 l2 2 M11.5 11.5 l-2 -2', S, 0.9),
    joinEnt: ln('M1.5 8 H6 M10 8 H14.5', B, 1.5) + ln('M6 8 H10', G, 2) + ln('M8 4 v2.2 M8 9.8 v2.2', G, 1.1),
    rect3: ln('M2 9.5 L8.5 3 L14 8.5 L7.5 15 z', B, 1.5) + circ(2, 9.5, 1.2, S, 'none') + circ(8.5, 3, 1.2, S, 'none') + circ(14, 8.5, 1.2, S, 'none'),
    crect3: ln('M2 9.5 L8.5 3 L14 8.5 L7.5 15 z', B, 1.5) + ln('M7 9 h2 M8 8 v2', S, 1.1) + circ(11.25, 5.75, 1.2, S, 'none'),
    parallelogram: ln('M1.5 12.5 L5.5 3.5 H14.5 L10.5 12.5 z', B, 1.5) + circ(1.5, 12.5, 1.2, S, 'none') + circ(10.5, 12.5, 1.2, S, 'none') + circ(14.5, 3.5, 1.2, S, 'none'),
    circle: circ(8, 8, 5.5, 'none', B, 1.5) + ln('M6.5 8 h3 M8 6.5 v3', S, 1.1),
    arc: ln('M5 3 A8 8 0 0 1 13 11', B, 1.5) + ln('M3.5 11 h3 M5 9.5 v3', S, 1.1),
    arc3: ln('M2.5 12.5 A7 7 0 0 1 13.5 12.5', B, 1.5) + circ(2.5, 12.5, 1.2, S, 'none') + circ(8, 5.5, 1.2, S, 'none') + circ(13.5, 12.5, 1.2, S, 'none'),
    polygon: ln('M8 2 l5.2 3 v6 l-5.2 3 l-5.2 -3 v-6 z', B, 1.5),
    slot: ln('M5 5 h6 a3 3 0 0 1 0 6 h-6 a3 3 0 0 1 0 -6 z', B, 1.5) + ln('M5 8 h6', S, 0.9, DASH),
    // p9-sketch-curves: Perimeter Circle, Tangent Arc, the slot types and the slot length types
    pcircle: circ(8, 8, 5.5, 'none', B, 1.5) + circ(2.5, 8, 1.2, S, 'none') + circ(10.75, 3.25, 1.2, S, 'none') + circ(10.75, 12.75, 1.2, S, 'none'),
    tarc: ln('M1.5 12.5 h6', S, 1.3) + ln('M7.5 12.5 A5 5 0 0 0 12.5 7.5', B, 1.5) + circ(7.5, 12.5, 1.2, S, 'none'),
    cslot: ln('M5 5 h6 a3 3 0 0 1 0 6 h-6 a3 3 0 0 1 0 -6 z', B, 1.5) + circ(8, 8, 1.2, S, 'none'),
    aslot3: ln('M2 11.5 A7 7 0 0 1 14 11.5 A2 2 0 0 1 10.6 11.5 A3.6 3.6 0 0 0 5.4 11.5 A2 2 0 0 1 2 11.5 z', B, 1.4) + circ(3.7, 11.5, 1, S, 'none') + circ(8, 6.2, 1, S, 'none') + circ(12.3, 11.5, 1, S, 'none'),
    aslot: ln('M2 11.5 A7 7 0 0 1 14 11.5 A2 2 0 0 1 10.6 11.5 A3.6 3.6 0 0 0 5.4 11.5 A2 2 0 0 1 2 11.5 z', B, 1.4) + circ(8, 12.5, 1.1, S, 'none'),
    slotLenCC: ln('M5 6 h6 a2 2 0 0 1 0 4 h-6 a2 2 0 0 1 0 -4 z', B, 1.2) + ln('M5 13.5 h6 M5 12 v3 M11 12 v3', S, 1.1),
    slotLenAll: ln('M5 6 h6 a2 2 0 0 1 0 4 h-6 a2 2 0 0 1 0 -4 z', B, 1.2) + ln('M3 13.5 h10 M3 12 v3 M13 12 v3', S, 1.1),
    spline: ln('M2 12.5 C5 1 10 15 14 3.5', B, 1.5) + circ(2, 12.5, 1.1, S, 'none') + circ(14, 3.5, 1.1, S, 'none'),
    ellipse: ell(8, 8, 6, 3.8, 'none', B, 1.5),
    pellipse: ln('M2 9 A6 3.8 0 0 0 14 9', S, 0.8, DASH) + ln('M2 9 A6 3.8 0 0 1 14 9', B, 1.5) + circ(2, 9, 1.1, S, 'none') + circ(14, 9, 1.1, S, 'none') + circ(8, 9, 0.9, S, 'none'),   // ui-sketch-spline: Partial Ellipse
    point: circ(8, 8, 1.6, B, 'none') + ln('M8 3 v2.5 M8 10.5 v2.5 M3 8 h2.5 M10.5 8 h2.5', S, 1.1),
    text: txt(8, 12.5, 12, 'A', S, 'Georgia, serif', 600),
    trim: ln('M2 8 H8 M8 2 V14', B, 1.5) + ln('M9.6 8 H14.5', R, 1.8, 'stroke-dasharray="1.6 1.3"') + circ(8, 8, 1.2, S, 'none') + ln('M11.2 4 l2.6 -2.6 M11.2 1.4 l2.6 2.6', R, 1.2),   // r12/chrome12: the trimmed piece red, dashed
    extend: ln('M2 8 h7', B, 1.5) + ln('M9 8 h3.5', B, 1.5, DASH) + ln('M13.5 2 v12', S, 1.2) + ln('M9.5 5.5 l2.5 2.5 -2.5 2.5', G, 1.4),
    convert: rect(2.5, 2.5, 11, 11, F2, S) + rect(5, 5, 6, 6, 'none', B, 1.5),
    offset: rect(4, 4, 8, 8, 'none', B, 1.5) + rect(1.5, 1.5, 13, 13, 'none', S, 1, DASH),
    mirrorEnt: ln('M8 2 v12', S, 0.9, DASH) + ln('M6 4.5 L2.5 11.5 h3.5 z', B, 1.4) + ln('M10 4.5 L13.5 11.5 h-3.5 z', B, 1.4, 'stroke-dasharray="1.5 1.5"'),
    sketchPattern: circ(3.5, 8, 1.8, 'none', B, 1.4) + circ(8, 8, 1.8, 'none', B, 1.4) + circ(12.5, 8, 1.8, 'none', B, 1.4) + ln('M2 12.5 h12', S, 0.9, DASH),
    // sketch tools (ui-sketch-tools.js): Sketch Chamfer, Circular Sketch Pattern, the Move Entities flyout, Intersection
    // Curve, Dynamic Mirror, and the On Edge / Pattern relation glyphs
    skChamfer: ln('M2 14 V7.5 l4.5 -4.5 H14', B, 1.5) + ln('M2 7.5 l4.5 -4.5', Y, 2.2),
    cSketchPattern: circ(8, 8, 5, 'none', S, 0.9, DASH) + circ(8, 3, 1.6, 'none', B, 1.4) + circ(12.5, 10.5, 1.6, 'none', B, 1.4) + circ(3.5, 10.5, 1.6, 'none', B, 1.4),
    moveEnt: ln('M2 12 L7 7', B, 1.5) + ln('M9 2 v12 M7 4 l2 -2 2 2 M7 12 l2 2 2 -2 M3 8 h12 M5 6 l-2 2 2 2 M13 6 l2 2 -2 2', G, 1.1),
    copyEnt: ln('M2 13 L7 8', B, 1.5, 'stroke-dasharray="1.6 1.3"') + ln('M8 9 L13 4', B, 1.5) + ln('M6 3.5 h4 M8 1.5 v4', G, 1.3),
    rotateEnt: ln('M8 8 L13.5 4', B, 1.5) + ln('M8 8 H14', S, 0.9, DASH) + p('M3 9 a5 5 0 0 1 8.5 -4.5', 'none', G, 1.2) + ln('M11.8 1.8 l-0.3 2.7 -2.6 -0.6', G, 1.1) + circ(8, 8, 1.2, W, S, 1),
    scaleEnt: rect(2, 8, 6, 6, 'none', B, 1.2, DASH) + rect(2, 2, 12, 12, 'none', B, 1.4) + ln('M8 8 L13 3 M10 3 h3 v3', G, 1.2),
    stretchEnt: ln('M2 13 H9 L13 4', B, 1.5) + ln('M9 13 L14 7', B, 1.2, 'stroke-dasharray="1.6 1.3"') + ln('M11 13 h3.5 M12.8 11.5 l1.7 1.5 -1.7 1.5', G, 1.1),
    intersectCurve: blk(1.5, 6, 9, 5, 3.5) + ln('M1 10 L15 6', B, 1.5),
    dynMirror: ln('M8 2 v12', S, 0.9, DASH) + ln('M6.5 4 L3 12', B, 1.4) + ln('M9.5 4 L13 12', B, 1.4, 'stroke-dasharray="1.5 1.5"') + circ(13, 12, 1.3, Y, YD, 0.8),
    relOnEdge: ln('M2 12.5 h12', G, 1.8) + rect(5, 4, 6, 6, 'none', G, 1.2),
    relPattern: circ(3.5, 8, 1.6, G, 'none') + circ(8, 8, 1.6, G, 'none') + circ(12.5, 8, 1.6, G, 'none') + ln('M2 12 h12', G, 1),
    // r12/chrome12: a sketch corner with its green relation badge (Display/Delete: perpendicular; Add: plus)
    relations: ln('M2 13.5 H11 M2 13.5 V5', B, 1.5) + rect(8, 1.5, 6.5, 6.5, '#e3f4df', G, 1, 'rx="1"') + ln('M9.6 6.3 h3.3 M11.25 6.3 V3.1', GD, 1.2),
    addRelation: ln('M2 13.5 H11 M2 13.5 V5', B, 1.5) + rect(8, 1.5, 6.5, 6.5, '#e3f4df', G, 1, 'rx="1"') + ln('M11.25 2.9 v3.7 M9.4 4.75 h3.7', GD, 1.4),
    // relation glyphs drawn next to sketch entities (small, on a 16 grid, like SolidWorks' relation icons)
    relHorizontal: ln('M3 8 h10', G, 2), relVertical: ln('M8 3 v10', G, 2),
    relCoincident: circ(8, 8, 3, G, 'none') + circ(8, 8, 5.5, 'none', G, 1.2),
    relParallel: ln('M5 13 L9 3 M8 13 L12 3', G, 1.6), relPerpendicular: ln('M3 13 h10 M8 13 V3', G, 1.6),
    relTangent: circ(8, 6.5, 4, 'none', G, 1.3) + ln('M2 12.5 h12', G, 1.6), relConcentric: circ(8, 8, 2.5, 'none', G, 1.3) + circ(8, 8, 5.5, 'none', G, 1.3),
    relEqual: ln('M3 6 h10 M3 10 h10', G, 1.7), relMidpoint: ln('M2 11 h12', G, 1.4) + circ(8, 11, 2.2, G, 'none') + ln('M8 3 v5', G, 1.2),
    relSymmetric: ln('M8 2 v12', G, 1, 'stroke-dasharray="2 1.5"') + ln('M3 5 v6 M13 5 v6', G, 1.6) + ln('M4.5 8 h2 M11.5 8 h-2', G, 1.1),
    construction: ln('M2 13 L14 3', YD, 1.6, 'stroke-dasharray="2.5 1.6"') + circ(2.5, 12.5, 1.2, W, B) + circ(13.5, 3.5, 1.2, W, B),
    centerline: ln('M2 13 L14 3', B, 1.4, 'stroke-dasharray="4 1.5 1 1.5"'),
    relCollinear: ln('M2 8 h5 M9 8 h5', G, 1.8) + circ(8, 8, 0.8, G, 'none'), relFix: ln('M8 2.5 v8 M4 7 a4 4 0 0 0 8 0 M6 4.5 h4', G, 1.4),
    // sketchdims: Coradial, Intersection, Merge relations; the arc length dimension; Fully Define Sketch
    relCoradial: circ(8, 8, 5.5, 'none', G, 1.3) + circ(8, 8, 1.4, G, 'none') + ln('M8 8 L12 4.2', G, 1.1),
    relIntersection: ln('M3 3 L13 13 M13 3 L3 13', G, 1.5) + circ(8, 8, 1.8, G, 'none'),
    relMerge: circ(6, 8, 3, 'none', G, 1.2) + circ(10, 8, 3, 'none', G, 1.2) + circ(8, 8, 1.2, G, 'none'),
    arclength: ln('M2.5 12 A6.5 6.5 0 0 1 13.5 12', B, 1.3) + ln('M3 6.5 A6 6 0 0 1 13 6.5', S, 1.1) + ln('M3 6.5 l1.9 -0.4 M3 6.5 l0.6 1.8 M13 6.5 l-1.9 -0.4 M13 6.5 l-0.6 1.8', S, 1.1),
    fullyDefine: rect(2, 5, 9, 8, 'none', S, 1.3) + ln('M2 2.5 h9 M2 1.5 v2 M11 1.5 v2', B, 1) + ln('M13.5 5 v8 M12.5 5 h2 M12.5 13 h2', B, 1) + ln('M4.5 9.5 l2 2 l3.5 -4', G, 1.6),
    // sketch-ordinate: the Smart Dimension flyout's Horizontal / Vertical Dimension and Horizontal / Vertical Ordinate
    horizDim: ln('M3 6 v8 M13 6 v8', S, 1.1) + ln('M3 10 h10', S, 1.1) + ln('M3 10 l2.3 -1.3 M3 10 l2.3 1.3 M13 10 l-2.3 -1.3 M13 10 l-2.3 1.3', B, 1.2) + ln('M5 3 h6', B, 1.4) + circ(3, 14, 1, B, 'none') + circ(13, 14, 1, B, 'none'),
    vertDim: ln('M6 3 h8 M6 13 h8', S, 1.1) + ln('M10 3 v10', S, 1.1) + ln('M10 3 l-1.3 2.3 M10 3 l1.3 2.3 M10 13 l-1.3 -2.3 M10 13 l1.3 -2.3', B, 1.2) + ln('M3 5 v6', B, 1.4) + circ(14, 3, 1, B, 'none') + circ(14, 13, 1, B, 'none'),
    ordinateH: ln('M1.5 14 h13', S, 1.1) + ln('M3 13.5 V5.5 M7.5 13.5 V5.5 M12.5 13.5 V8 L11.5 6.2 V5.5', B, 1) + txt(3, 4.4, 3.6, '0') + txt(7.5, 4.4, 3.6, '5') + txt(11.5, 4.4, 3.6, '9'),
    ordinateV: ln('M2 1.5 v13', S, 1.1) + ln('M2.5 13 H10.5 M2.5 8.5 H10.5 M2.5 3.5 H8 L9.8 2.5 H10.5', B, 1) + txt(13, 14.2, 3.6, '0') + txt(13, 9.7, 3.6, '5') + txt(13, 3.7, 3.6, '9'),
    // ---- sheet metal (green sheet)
    flange: p(FLANGE_L, G, S) + ln('M2 12 h6.5 a3.5 3.5 0 0 0 3.5 -3.5 V2.5', Y, 1, 'stroke-dasharray="1.6 1.2"'),
    bend: p('M2 10.5 h6.5 v3 H2 z', F2, S) + p('M8.5 10.5 a2 2 0 0 0 2 -2 V2.5 h3 V8.5 a5 5 0 0 1 -5 5 v-3 z', G, S) + ln('M8.5 10.5 v3', B, 1.2),
    miter: p('M1.5 12.5 L5.5 9.5 h8 l-4 3 z', F2, S) + p('M5.5 9.5 v-5 h8 v5 z', G, S) + p('M13.5 9.5 l-4 3 v-5 l4 -3 z', GD, S) + ln('M13.5 4.5 v5', B, 1.2, DASH),
    hem: p('M2 9 h9 a2.5 2.5 0 0 1 0 5 h-5 v-2 h5 a0.5 0.5 0 0 0 0 -1 H2 z', G, S),
    jog: p('M1.5 12.5 h4 l4 -6 h5 v-2.5 h-6 l-4 6 h-3 z', G, S),
    sketchedBend: p('M1.5 12 h5.5 a2 2 0 0 0 2 -2 V2.5 h2.5 V10 a4.5 4.5 0 0 1 -4.5 4.5 H1.5 z', G, S) + ln('M7.2 15 l5.6 -5.6', B, 1.2, DASH),
    flatten: p('M1.5 12 l3 -8 h10 l-3 8 z', GL, S) + ln('M5.5 12 l3 -8 M9 12 l3 -8', B, 1, DASH),
    // p9-pm: Edge Flange ▸ Flange Length reference: the bent sheet with the length dimension (blue) measured from the
    // top of the flange to the outer virtual sharp, the inner virtual sharp, or the tangent where the bend starts
    lenOuter: p(FLANGE_L, F2, S, 1) + ln('M13.5 8.5 V13.5 H8.5', R, 0.8, DASH) + ln('M15 2.5 V13.5 M14 2.5 h2 M14 13.5 h2', B, 1.1),
    lenInner: p(FLANGE_L, F2, S, 1) + ln('M8.5 10.5 H10.5 V8.5 M10.5 10.5 H14', R, 0.8, DASH) + ln('M15 2.5 V10.5 M14 2.5 h2 M14 10.5 h2', B, 1.1),
    lenTangent: p(FLANGE_L, F2, S, 1) + ln('M13.5 8.5 H14', R, 0.8, DASH) + ln('M15 2.5 V8.5 M14 2.5 h2 M14 8.5 h2', B, 1.1),
    // Hem Type, side view of the sheet edge: Closed (flat on the sheet), Open (a gap), Tear Drop, Rolled
    hemClosed: ln('M1.5 7 H11.5 a1 1 0 0 1 0 2 H5', GD, 1.8),
    hemOpen: ln('M1.5 5.5 H11 a2.5 2.5 0 0 1 0 5 H5', GD, 1.8),
    hemTeardrop: ln('M1.5 5.5 H9.5 a3 3 0 0 1 0 6 L5 7', GD, 1.8),
    hemRolled: ln('M1.5 4.5 H9 a4 4 0 1 1 -4 4', GD, 1.8),
    // Hem position against the edge the hem was made on (red dashes): Material Inside / Bend Outside
    hemInside: ln('M12 2 v12', R, 1, DASH) + ln('M1.5 6 H8.5 a2 2 0 0 1 0 4 H4', GD, 1.8),
    hemOutside: ln('M8.5 2 v12', R, 1, DASH) + ln('M1.5 6 H11 a2 2 0 0 1 0 4 H6.5', GD, 1.8),
    // ---- evaluate
    measure: p('M2 12 L12 2 l2 2 L4 14 z', Y, S) + ln('M4.5 9.5 l1 1 M6.5 7.5 l1 1 M8.5 5.5 l1 1 M10.5 3.5 l1 1', S, 1),
    mass: p('M4.5 6 h7 l2.5 8 h-12 z', F2, S) + circ(8, 3.9, 1.8, 'none', S, 1.2) + circ(8, 10.3, 2.3, W, S, 0.9) + p('M8 10.3 V8 A2.3 2.3 0 0 1 10.3 10.3 z M8 10.3 V12.6 A2.3 2.3 0 0 1 5.7 10.3 z', S, 'none'),   // r12/chrome12: a weight with the centre-of-mass mark
    section: blk(1.5, 3, 5.5, 8, 3.5, F2, F1, RL) + ln('M7 9.6 l3.5 -3.5 M7 12.6 l3.5 -3.5', RD, 0.9) + p('M5.8 15.3 V5.3 l5.9 -4.6 v10 z', 'rgba(47,127,214,0.16)', B, 1),   // r12/chrome12: half a block, the cut face hatched, the blue section plane
    sensor: circ(8, 8, 5, 'none', S) + ln('M8 8 l3 -3', R, 1.5) + circ(8, 8, 0.9, S, 'none'),
    check: ln('M2.5 8.5 l3.5 3.5 L13.5 4.5', G, 2.2),
    // Section Properties: a hatched I-section with the centroid axes
    sectionProps: p('M3 2.5 h10 v2.5 h-3.5 v6 H13 v2.5 H3 V11 h3.5 V5 H3 z', F2, S, 1) + ln('M1.5 8 h13 M8 1 v14', R, 0.9, DASH) + circ(8, 8, 1, R, 'none'),
    // Draft Analysis: a tapered block with its faces coloured positive / requires / negative, pull arrow on top
    draftAnalysis: p('M3 14 L5 6 h6 L13 14 z', G, S, 1) + p('M5 6 h6 l-1 -1.5 h-4 z', Y, S, 0.9) + ln('M8 4 V1 M6.6 2.4 L8 1 l1.4 1.4', B, 1.1) + ln('M3 14 h10', R, 1.5),
    // Clearance Verification: two blocks with a dimension arrow across the gap
    clearance: rect(1.5, 4.5, 5, 9, F2, S, 1) + rect(10.5, 2.5, 4, 9, '#f8e2b8', S, 1) + ln('M6.5 8 h4 M8 6.8 L6.6 8 8 9.2 M9 6.8 L10.4 8 9 9.2', B, 1),
    zebra: circ(8, 8, 5.5, F2, S) + ln('M3.5 5.5 c3 1.2 6 1.2 9 0 M3 8 c3 1.2 7 1.2 10 0 M3.5 10.5 c3 1.2 6 1.2 9 0', S, 1),
    dxf: rect(2.5, 1.5, 11, 13, W, S, 1.1, 'rx="0.8"') + ln('M5 4.5 h6 M5 6.5 h6 M5 8.5 h4', L, 0.9) + txt(8, 12.8, 4.2, 'DXF', B, null, 700),
    // dxf-import: Insert DXF (a DXF sheet poured into a sketch outline), Check Sketch for Feature (an outline with a
    // gap ringed in red), Repair Sketch (the gap bridged, with a wrench)
    importDxf: rect(1.5, 1.5, 8, 10, W, S, 1, 'rx="0.7"') + txt(5.5, 8.6, 3.6, 'DXF', B, null, 700) + p('M7 14.5 h7.5 v-6', 'none', B, 1.4) + ln('M10.5 5.5 l2.5 2.5 2.5 -2.5 M13 8 V2.5', Y, 1.3),
    checkSketch: p('M7 3 H2.5 V13.5 H13.5 V9', 'none', B, 1.4) + p('M10 3 H13.5 V6', 'none', B, 1.4) + circ(8.5, 3, 2.4, 'none', R, 1.2) + circ(13.5, 7.5, 2.4, 'none', R, 1.2),
    repairSketch: p('M2.5 3 V13.5 H13.5 V9', 'none', B, 1.4) + p('M2.5 3 H8', 'none', G, 1.6) + ln('M9 9.5 l4.5 -4.5', S, 1.6) + circ(13.6, 4.1, 1.7, 'none', S, 1.2) + ln('M9 9.5 l-1.2 1.2', S, 2.2),
    // ---- view (heads-up toolbar)
    fit: ln('M2.5 5.5 V2.5 h3 M10.5 2.5 h3 v3 M13.5 10.5 v3 h-3 M5.5 13.5 h-3 v-3', S, 1.25) + rect(5.5, 5.5, 5, 5, PL, B, 1.2),
    // Standard toolbar (next to the menus): curved arrows, SolidWorks' Undo / Redo
    undo: ln('M4.5 5.5 h5.5 a3.5 3.5 0 0 1 0 7 H6', B, 1.6) + p('M5 5.5 l3 -2.8 v5.6 z', B, B, 1),
    redo: ln('M11.5 5.5 H6 a3.5 3.5 0 0 0 0 7 h4', B, 1.6) + p('M11 5.5 l-3 -2.8 v5.6 z', B, B, 1),
    zoomArea: circ(7, 7, 4, 'none', S) + ln('M10 10 l3.5 3.5', S, 2) + rect(5, 5, 4, 4, 'none', B, 1, 'stroke-dasharray="1.2 1.2"'),
    prevView: ln('M10 3 L5 8 l5 5', S, 1.8),
    orient: blk(2, 3.5, 6, 5, 2.5) + circ(11.5, 11.5, 3, W, B, 1.1) + ln('M11.5 9.8 v1.7 l1.2 0.7', B, 1.1),
    display: blk(1.5, 4.5, 9, 7, 3.5, '#b3bfcc', '#dbe2ea', '#8d9bac'),
    hideshow: ln('M1.5 8 c3 -5 10 -5 13 0 c-3 5 -10 5 -13 0 z', S, 1.25) + circ(8, 8, 2.2, B, 'none'),
    appearance: circ(8, 8, 6, F2, S) + circ(6, 6.3, 1.2, R, 'none') + circ(9.6, 5.4, 1.2, B, 'none') + circ(10.2, 9.2, 1.2, G, 'none') + circ(6.4, 10.3, 1.2, Y, 'none'),
    scene: rect(2, 3, 12, 10, W, S, 1.1, 'rx="0.6"') + ln('M2 11 l4 -3.5 3 2.5 2 -1.5 3 2.5', B, 1.2) + circ(11, 5.5, 1.1, Y, 'none'),
    settings: circ(8, 8, 2, 'none', S) + ln('M8 2 v2 M8 12 v2 M2 8 h2 M12 8 h2 M3.8 3.8 l1.4 1.4 M10.8 10.8 l1.4 1.4 M3.8 12.2 l1.4 -1.4 M10.8 5.2 l1.4 -1.4', S, 1.25),
    // ---- FeatureManager tabs, task pane, misc
    tree: rect(1.5, 1.5, 5, 4, F2, S, 1) + ln('M4 5.5 V12.5 M4 8.5 h3 M4 12.5 h3', S, 1) + rect(7.5, 6.8, 6.5, 3.4, PL, P, 1) + rect(7.5, 10.8, 6.5, 3.4, GL, GD, 1),   // r12/chrome12: a part with two child rows
    pm: rect(3, 2.5, 10, 11, W, S, 1.1, 'rx="0.6"') + ln('M4.5 5 h7 M4.5 7.5 h7 M4.5 10 h4', B, 1.1),
    config: rect(2.5, 3.5, 4, 4, F2, S, 1) + rect(9.5, 3.5, 4, 4, F2, S, 1) + rect(6, 9.5, 4, 4, PL, B, 1),
    dimx: ln('M3 12 h10', S, 1.1) + ln('M3 12 l1.5 -1 M3 12 l1.5 1 M13 12 l-1.5 -1 M13 12 l-1.5 1', B, 1.1) + circ(8, 6, 2.5, G, S, 1),
    dispman: '<defs><radialGradient id="anvil-ico-dm" cx="35%" cy="35%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="' + B + '"/></radialGradient></defs>' + circ(8, 8, 5.5, 'url(#anvil-ico-dm)', S),
    home: ln('M2 8 L8 2.5 l6 5.5', B, 1.4) + p('M4 7 v6.5 h8 V7', F2, S),
    library: p('M2.5 3 h3 v10 h-3 z M6.5 3 h3 v10 h-3 z M10 4 l3 -0.5 2 9 -3 0.5 z', F2, S, 1),
    explorer: p('M2 4.5 h4.5 l1.5 1.5 h6 v7 h-12 z', Y, S, 1),
    palette: rect(2.5, 2.5, 4.5, 4.5, F2, S, 1) + rect(9, 2.5, 4.5, 4.5, F2, S, 1) + rect(2.5, 9, 4.5, 4.5, F2, S, 1) + rect(9, 9, 4.5, 4.5, PL, B, 1),
    props: rect(3, 2.5, 10, 11, W, S, 1.1, 'rx="0.6"') + ln('M5 5.5 h6 M5 8 h6 M5 10.5 h3.5', S, 1) + ln('M10 10 l1 1 2 -2', G, 1.2),
    macro: '<rect x="2" y="3" width="12" height="10" rx="1" fill="#2b3340" stroke="none"/>' + ln('M4 6 l2 2 -2 2', '#7ee787', 1.3) + ln('M7.5 10 h4', '#dfe6ee', 1.3),
    warn: p('M8 2 L14.5 13.5 H1.5 z', '#e8a23a', S) + ln('M8 6 v4 M8 11.5 v0.5', S, 1.6),
    error: circ(8, 8, 5.5, R, S) + ln('M5.5 5.5 l5 5 M10.5 5.5 l-5 5', W, 1.6),
    ok: ln('M2.5 8.5 l3.5 3.5 L13.5 4', G, 2.6),
    cancel: ln('M4 4 l8 8 M12 4 L4 12', R, 2.6),
    generic: rect(3.5, 3.5, 9, 9, F2, S, 1.1, 'rx="1"'),
    search: circ(7, 7, 3.5, 'none', S) + ln('M9.5 9.5 l3.5 3.5', S, 1.6),
    filter: p('M2 3 h12 l-4.5 5 v4.5 l-3 1.5 v-6 z', F2, S),
    part: blk(2, 3, 7, 8, 4, F2, F1, F3, S, 1),
    body: blk(2, 3, 7, 8, 4, '#a9c6ea', '#d3e3f7', '#7fa2cc', S, 1),
    material: rect(1.5, 3, 13, 10, '#e7b98f', S, 1, 'rx="0.8"') + ln('M1.5 6.3 h13 M1.5 9.7 h13 M6 3 v3.3 M11 3 v3.3 M3.6 6.3 v3.4 M8.5 6.3 v3.4 M13 6.3 v3.4 M6 9.7 v3.3 M11 9.7 v3.3', '#a8673a', 0.9),   // r12/chrome12: bricks
    folder: p('M2 4 h4 l1.5 1.5 H14 v8 H2 z', '#f3cf6b', S, 1),
    // Equations (global variables): a sigma on a sheet
    equations: rect(2, 2, 12, 12, W, S, 1, 'rx="1"') + ln('M11 4.5 H5 L8 8 L5 11.5 H11', R, 1.5),
    annotations: p('M3 13 V3.5 h6 l3 3 V13 z', W, S, 1) + ln('M5 7.5 h5 M5 9.5 h4', B, 1),

    // ---- assemblies: component blocks in two tones, mates in purple, fix = pin
    // Assembly document: a tall block and a short one stacked against it
    assembly: blk(1.5, 5, 6, 7, 3, F2, F1, F3, S, 1) + blk(7, 2, 5, 5, 3, '#f0c987', '#f8e2b8', '#d9a95a', S, 1),
    // Insert Components: a component block with a green plus
    insertComponent: blk(1.5, 5, 7, 6, 3, '#f0c987', '#f8e2b8', '#d9a95a', S, 1) + circ(12, 11.5, 3, G, GD, 1) + ln('M12 9.8 v3.4 M10.3 11.5 h3.4', W, 1.3),
    // Mate: a paper clip holding two blocks together
    mate: blk(1, 7, 6, 5, 2.5, F2, F1, F3, S, 1) + blk(8.5, 3, 5, 5, 2.5, '#f0c987', '#f8e2b8', '#d9a95a', S, 1) + p('M6.5 5.5 v-3 a1.5 1.5 0 0 1 3 0 v7 a2.5 2.5 0 0 1 -5 0 v-4', 'none', '#8a5cc2', 1.3),
    // Coincident: two faces pressed flat together
    coincident: p('M1.5 9 l3 -3 h10 l-3 3 z', '#c9b6e6', '#8a5cc2', 1) + p('M1.5 10.5 l3 -3 h10 l-3 3 z', 'none', S, 0.9) + ln('M8 1.5 v3.5 M6.5 3.5 l1.5 1.5 1.5 -1.5 M8 14.5 v-2.5', '#8a5cc2', 1.2),
    // Concentric: two circles on one centre with the shared axis
    concentric: circ(8, 8, 5.5, 'none', S, 1.2) + circ(8, 8, 3, '#c9b6e6', '#8a5cc2', 1.2) + ln('M8 0.8 v14.4 M0.8 8 h14.4', '#8a5cc2', 0.8, DASH),
    // a component row in the FeatureManager: a two-tone part block
    component: blk(2, 3, 7, 8, 4, '#f0c987', '#f8e2b8', '#d9a95a', S, 1),
    // the Mates folder: a folder with the paper clip
    matesFolder: p('M2 4 h4 l1.5 1.5 H14 v8 H2 z', '#f3cf6b', S, 1) + p('M8 11.5 v-5 a1.2 1.2 0 0 1 2.4 0 v4 a2 2 0 0 1 -4 0 v-2.5', 'none', '#8a5cc2', 1.1),
    // Distance: two parallel faces with a dimension arrow between them
    distance: p('M1.5 4 l3 -2.5 h10 l-3 2.5 z', '#c9b6e6', '#8a5cc2', 1) + p('M1.5 14 l3 -2.5 h10 l-3 2.5 z', 'none', S, 0.9) + ln('M8 4.5 v6.5 M6.6 6 l1.4 -1.5 1.4 1.5 M6.6 9.5 l1.4 1.5 1.4 -1.5', '#8a5cc2', 1.1),
    // Angle: two faces meeting at a hinge with an arc between them
    angle: ln('M2 13.5 h12.5', S, 1.3) + ln('M2 13.5 L11 3', '#8a5cc2', 1.3) + p('M8 13.5 a6 6 0 0 0 -1.9 -4.4', 'none', '#8a5cc2', 1.1),
    // Move Component: a component block with a four-way move arrow
    moveComponent: blk(1.5, 6, 7, 6, 3, '#f0c987', '#f8e2b8', '#d9a95a', S, 1) + ln('M12 2 v7 M10.6 3.4 l1.4 -1.4 1.4 1.4 M8.5 5.5 h7 M14.1 4.1 l1.4 1.4 -1.4 1.4', B, 1.1),
    // Rotate Component: a component block with a curved arrow around it
    rotateComponent: blk(3, 6, 7, 6, 3, '#f0c987', '#f8e2b8', '#d9a95a', S, 1) + p('M2 6 a6.5 6.5 0 0 1 11.5 -2', 'none', B, 1.2) + ln('M13.8 1.3 l-0.3 2.7 -2.6 -0.6', B, 1.1),
    // Interference Detection: two overlapping blocks with the shared volume in red
    interference: rect(1.5, 5.5, 8, 8, F2, S, 1) + rect(6.5, 2.5, 8, 8, '#f8e2b8', S, 1) + rect(6.5, 5.5, 3, 5, R, RD, 0.9),
    // Parallel: two faces one above the other, with the parallel bars
    parallel: p('M1.5 5 l3 -3 h10 l-3 3 z', '#c9b6e6', '#8a5cc2', 1) + p('M1.5 13.5 l3 -3 h10 l-3 3 z', 'none', S, 0.9) + ln('M6.5 6.5 l-1.5 3 M10 6.5 l-1.5 3', '#8a5cc2', 1.2),
    // Perpendicular: a face with a face standing square on it
    perpendicular: p('M1.5 13 l3 -3 h10 l-3 3 z', 'none', S, 0.9) + p('M6 11.5 V2.5 h4 v9 z', '#c9b6e6', '#8a5cc2', 1) + ln('M10 9 h2 v2.5', '#8a5cc2', 0.9),
    // Tangent: a cylinder resting on a face
    tangent: p('M1 13.5 l2.5 -2 h11.5 l-2.5 2 z', 'none', S, 0.9) + circ(8, 7, 4.2, '#c9b6e6', '#8a5cc2', 1.2) + circ(8, 7, 0.9, '#8a5cc2', 'none'),
    // Width: a tab centred between two walls
    width: ln('M2 2 v12 M14 2 v12', S, 1.4) + rect(5.5, 4, 5, 8, '#c9b6e6', '#8a5cc2', 1) + ln('M8 1.5 v13', '#8a5cc2', 0.8, DASH),
    // Gear: two meshing gear wheels
    gear: circ(5.5, 9.5, 3.8, '#c9b6e6', '#8a5cc2', 1.1) + circ(5.5, 9.5, 1, W, '#8a5cc2', 0.8) + circ(11.5, 5, 2.6, F2, S, 1.1) + circ(11.5, 5, 0.7, W, S, 0.8) + ln('M5.5 4.8 v1 M1 9.5 h1 M5.5 14.2 v-1 M9.3 11.8 l-0.8 -0.6 M11.5 1.6 v0.8 M14.9 5 h-0.8', '#8a5cc2', 1.1),
    // Limit Distance: two faces with a dimension between two stops
    limitDistance: p('M1.5 4 l3 -2.5 h10 l-3 2.5 z', '#c9b6e6', '#8a5cc2', 1) + p('M1.5 14 l3 -2.5 h10 l-3 2.5 z', 'none', S, 0.9) + ln('M8 4.5 v6.5 M6 7 h4 M6 9 h4', '#8a5cc2', 1.1),
    // Limit Angle: a hinge with an arc between two stops
    limitAngle: ln('M2 13.5 h12.5', S, 1.3) + ln('M2 13.5 L11 3', '#8a5cc2', 1.3) + p('M8 13.5 a6 6 0 0 0 -1.9 -4.4', 'none', '#8a5cc2', 1.1) + ln('M9.6 12 l1.6 -0.4 M7.8 9.4 l1.1 -1.2', '#8a5cc2', 1),
    // Linear / Circular Component Pattern, Mirror Components: component blocks in a row, round a centre, across a plane
    lpatternComp: blk(1, 8, 4.5, 4.5, 2, '#f0c987', '#f8e2b8', '#d9a95a', S, 0.9) + blk(6, 8, 4.5, 4.5, 2, '#f8e2b8', '#fbeed6', '#e8c58c', S, 0.9) + blk(11, 8, 4.5, 4.5, 2, '#f8e2b8', '#fbeed6', '#e8c58c', S, 0.9) + ln('M2 3.5 h12 M12.5 2 l1.5 1.5 -1.5 1.5', G, 1.1),
    cpatternComp: circ(8, 8, 5, 'none', S, 0.8, DASH) + rect(6, 1, 4, 4, '#f0c987', S, 0.9) + rect(11, 6, 4, 4, '#f8e2b8', S, 0.9) + rect(6, 11, 4, 4, '#f8e2b8', S, 0.9) + rect(1, 6, 4, 4, '#f8e2b8', S, 0.9),
    mirrorComp: ln('M8 1 v14', P, 1.1, DASH) + blk(1, 5, 5, 6, 2, '#f0c987', '#f8e2b8', '#d9a95a', S, 0.9) + blk(10, 5, 5, 6, 2, '#f8e2b8', '#fbeed6', '#e8c58c', S, 0.9),
    // Exploded View: a block lifted off another along a dashed explode line; an explode step: the arrow alone
    explode: blk(2, 10, 8, 4, 2.5, F2, F1, F3, S, 1) + blk(5, 1.5, 6, 4, 2.5, '#f0c987', '#f8e2b8', '#d9a95a', S, 1) + ln('M13.5 9.5 v-6 M12.2 4.8 l1.3 -1.3 1.3 1.3', '#e07b1a', 1.2) + ln('M8 6 v4', '#e07b1a', 0.9, DASH),
    explodeStep: ln('M8 14 V3 M5 6 l3 -3 3 3', '#e07b1a', 1.4) + ln('M3 14 h10', S, 1.2),
    // Fix: a push pin
    fix: p('M6 2 h5 l-1 1.5 v3.5 l2 2 h-7 l2 -2 V3.5 z', R, RD, 1) + ln('M8.5 9 v5.5', S, 1.3),
    // Float: a block with four arrows around it
    float: rect(5.5, 5.5, 5, 5, F2, S, 1) + ln('M8 1.5 v2.5 M6.8 2.7 l1.2 -1.2 1.2 1.2 M8 14.5 V12 M6.8 13.3 l1.2 1.2 1.2 -1.2 M1.5 8 H4 M2.7 6.8 l-1.2 1.2 1.2 1.2 M14.5 8 H12 M13.3 6.8 l1.2 1.2 -1.2 1.2', B, 1),
    // sketch-layers: Layers (three stacked sheets: cut, etch, bend), Paste sketch entities (a clipboard with a sketch on it)
    layers: p('M8 9.5 L14.5 12 L8 14.5 L1.5 12 z', RL, RD, 1) + p('M8 6 L14.5 8.5 L8 11 L1.5 8.5 z', GL, GD, 1) + p('M8 2.5 L14.5 5 L8 7.5 L1.5 5 z', '#bcd6f5', B, 1),
    pasteSketch: rect(2.5, 2.5, 9, 12, '#e8d3a8', YD, 1) + rect(4.5, 1.5, 5, 2.5, F2, S, 0.9) + rect(6.5, 6, 8, 8.5, W, B, 1) + ln('M8.5 9 h4 M8.5 11.5 h2.5', B, 0.9),
    // levels (ui-levels.js): Levels Manager, a table of numbered levels with the main level's row in yellow
    levels: rect(1.5, 1.5, 4.5, 3.5, Y, YD, 0.9) + ln('M8 3.25 h6.5', S, 1.3) + rect(1.5, 6.25, 4.5, 3.5, F1, S, 0.9) + ln('M8 8 h6.5', S, 1.3) + rect(1.5, 11, 4.5, 3.5, F1, S, 0.9) + ln('M8 12.75 h6.5', S, 1.3),
    // rfC: the rest of SolidWorks 2024's Sketch tab, in the sketch-entity style above (blue entity 1.5, ink points 1.1,
    // yellow for the part a tool makes): Sketch Fillet (the round in yellow, as Sketch Chamfer), 3D Sketch, 3D Sketch On
    // Plane, Style Spline, Equation Driven Curve, Parabola, Conic, Quick Snaps, Rapid Sketch, Shaded Sketch Contours,
    // Sketch Picture
    skFillet: ln('M2 14 V8 a5 5 0 0 1 5 -5 H14', B, 1.5) + ln('M2 8 a5 5 0 0 1 5 -5', Y, 2.2) + ln('M2 8 V3 H7', S, 0.9, DASH),
    sketch3d: ln('M1.5 14.5 h6 M1.5 14.5 V8 M1.5 14.5 l3.4 -3.4', P, 1.2) + ln('M3 6 L7.5 2 L12.5 4.5', B, 1.5) + circ(3, 6, 1.1, S, 'none') + circ(12.5, 4.5, 1.1, S, 'none') + PENCIL,
    sketch3dPlane: p('M1.5 10.5 l3.5 -6 h9 l-3.5 6 z', PL, P, 1.1) + ln('M4.5 8.5 L10 6', B, 1.5) + PENCIL,
    styleSpline: ln('M2 13 L5 3 L11 13 L14 3', S, 0.9, DASH) + ln('M2 13 C5 1 11 15 14 3', B, 1.5) + circ(5, 3, 1, S, 'none') + circ(11, 13, 1, S, 'none'),
    eqnCurve: ln('M1.5 9.5 C4 2 6.5 2 8.5 7 S12.5 12.5 14.5 4.5', B, 1.5) + txt(5, 15, 5, 'f(x)', S, 'Georgia, serif', 600),
    parabola: ln('M2 2 Q8 22 14 2', B, 1.5) + circ(8, 8.5, 1.1, S, 'none') + ln('M5 12 h6', S, 0.9, DASH),
    conic: ln('M2 13 L4.5 3 L14 3.5', S, 0.9, DASH) + ln('M2 13 Q4.5 3 14 3.5', B, 1.5) + circ(2, 13, 1.1, S, 'none') + circ(14, 3.5, 1.1, S, 'none'),
    quickSnaps: circ(8, 8, 4.5, 'none', S, 1.1) + ln('M8 1.5 v3 M8 11.5 v3 M1.5 8 h3 M11.5 8 h3', S, 1.1) + circ(8, 8, 1.7, Y, YD, 0.9),
    rapidSketch: blk(1.5, 6.5, 8, 6, 3) + ln('M3 13.5 L6 10.5', B, 1.4) + PENCIL,
    shadedContours: p('M2.5 13 V3.5 h6 l5 4.5 V13 z', '#bcd6f5', B, 1.5) + rect(5, 6, 3, 3, W, B, 1.1),
    sketchPicture: rect(1.5, 2.5, 13, 11, W, S, 1.1, 'rx="0.6"') + p('M2.2 12.8 l3.8 -4.8 3 3 2 -2 3.3 3.8 z', GL, GD, 0.9) + circ(11, 5.5, 1.3, Y, 'none') + ln('M3.5 5 h4', B, 1.3),
    // selection lists (ui-commands.js pickList): the kind of each listed item, as SolidWorks' selection boxes show it
    edgeSel: blk(2, 4.5, 9, 7, 3.5) + ln('M2 8 h9', B, 2),
    faceSel: blk(2, 4.5, 9, 7, 3.5, '#9ec5f0'),
    vertexSel: blk(2, 4.5, 9, 7, 3.5) + circ(11, 8, 1.8, B, W, 0.9),
    // drawing views (rfN): Auxiliary View, Crop View, Break
    auxView: rect(1.5, 8.5, 6.5, 6, W, S, 1.1) + p('M9.5 1.5 l5 3 -2.2 3.7 -5 -3 z', '#bcd6f5', B, 1.1) + ln('M6.5 8.5 L9.2 4.6', B, 1.2) + p('M9.9 3.6 l-0.2 2.1 -1.7 -1.2 z', B, B, 0.6),
    cropView: rect(4, 4, 8, 8, '#bcd6f5', 'none', 0) + ln('M4 1 V12 H15 M1 4 H12 V15', B, 1.4),
    breakView: rect(1, 5, 5, 6, '#bcd6f5', B, 1) + rect(10, 5, 5, 6, '#bcd6f5', B, 1) + ln('M7 2.5 l1 1.5 -1 1.5 1 1.5 -1 1.5 1 1.5 -1 1.5 1 1.5 -1 1.5 M9 2.5 l1 1.5 -1 1.5 1 1.5 -1 1.5 1 1.5 -1 1.5 1 1.5 -1 1.5', S, 0.9),
    // (rfAD) Broken-out Section, Area Hatch/Fill
    brokenOut: rect(1.5, 2.5, 13, 11, '#bcd6f5', B, 1.1) + p('M5 5.5 C7.5 4 11.5 5 11 8 C10.5 11 6 11.5 4.5 9.5 C3.5 8 4 6.3 5 5.5 z', W, B, 0.9) + ln('M5.5 9.5 L8.5 6.5 M7 10.3 L10 7.3', S, 0.7),
    areaHatch: p('M2 13.5 V5 L7 2 H14 V13.5 z', W, B, 1.1) + ln('M3 12.5 L12.5 3 M6 13 L13.5 5.5 M2.5 9 L8 3.5 M9.5 13 L13.5 9', S, 0.8),
    // (rfAG) Magnetic Line: a dashed line with two balloons on it
    magLine: ln('M0.5 8 H15.5', B, 1.1, DASH) + circ(4.5, 8, 2.8, W, S, 1) + circ(11.5, 8, 2.8, W, S, 1)
  };
  function icon(name, size, cls) {
    var body = I[name] || I.generic;
    size = size || 32;
    return '<svg class="ico ' + (cls || '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 16 16" aria-hidden="true">' + body + '</svg>';
  }
  icon.has = function (name) { return !!I[name]; };
  // icon.node(name, size) -> a fresh <svg> element cloned from a parsed template (a long FeatureManager tree builds
  // hundreds of icons per refresh; cloning is about four times cheaper than parsing the markup every time)
  var nodeCache = {};
  icon.node = function (name, size, cls) {
    var key = name + '|' + (size || 32) + '|' + (cls || '');
    var t = nodeCache[key];
    if (!t) {
      var box = document.createElement('div');
      box.innerHTML = icon(name, size, cls);
      t = nodeCache[key] = box.firstChild;
    }
    return t.cloneNode(true);
  };
  return icon;
})();
