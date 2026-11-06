// icons.js — inline SVG icon set for Anvil's ribbon, tree and panels.
// rfBF: drawn on a 16×16 grid in a SolidWorks-2024-like visual language (original artwork): parts are grey shaded
// solids with the feature's own faces in yellow (boss and cut alike, a cut shows as a yellow pocket); sketch entities
// are dark strokes with mid-grey square points; reference lines and construction are a lighter grey; green and red are
// kept for OK / cancel, the rebuild light, relations and errors. The dark ink is currentColor so the stylesheet picks
// it per theme (.ico { color: var(--icon-ink) }); every other colour reads on both the light and the dark panel.
// rfGZ (2026-11-03): one drawing serves every size; `weigh` (after the artwork) maps the drawn stroke widths to quiet
// 1 px outlines, 1.25 / 2 px main lines and pixel-snapped positions per size and devicePixelRatio, `CENTRE` centres the
// older drawings, and the global `Icons` is an accessor (end of file) so the drawing wrappers' icons are weighed too.
// The rules for new icons: docs/areas/ui-core.md *Look: icons (rfGZ)*.
var IconsLib = (function () {
  'use strict';
  var S = 'currentColor';                                   // ink: sketch entities and outlines
  var M = '#939393';                                        // reference / construction grey
  var B = '#6d6d6d';                                        // sketch points and entities, selection (lane BQ: grey, no blue)
  var G = '#2e9e48', GL = '#a6dcb3', GD = '#1f7a35';        // OK, relations, add
  var R = '#d9453b', RL = '#f4a795', RD = '#a8322a';        // cancel, errors, removed pieces
  var FY = '#f5c400', FYL = '#ffe57a', FYD = '#c08f00';     // feature faces (yellow highlight)
  var FYI = '#a07600';                                      // rfIL: yellow drawn as a line alone (hems, Costing): 3:1 on both panels
  var Y = '#f2c230', YD = '#c9961a';                        // pencil, sketch accents
  var P = '#8a8a8a', PL = '#dedede';                        // reference geometry
  var F1 = '#e8e8e8', F2 = '#b8b8b8', F3 = '#8e8e8e';       // base solid: top, front, side faces
  var L = '#a2a2a2', W = '#ffffff';
  var DASH = 'stroke-dasharray="2 1.4"';

  // one stroke attribute per element (color defaults to the ink, width to 1.25)
  function st(color, w, extra) { return 'stroke="' + (color || S) + '" stroke-width="' + (w || 1.25) + '" stroke-linejoin="round" stroke-linecap="round"' + (extra ? ' ' + extra : ''); }
  function p(d, fill, color, w, extra) { return '<path d="' + d + '" fill="' + (fill || 'none') + '" ' + st(color, w, extra) + '/>'; }
  function ln(d, color, w, extra) { return p(d, 'none', color, w, extra); }
  function circ(cx, cy, r, fill, color, w) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + (fill || 'none') + '" ' + (color === 'none' ? 'stroke="none"' : st(color, w)) + '/>'; }
  function ell(cx, cy, rx, ry, fill, color, w) { return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + (fill || 'none') + '" ' + (color === 'none' ? 'stroke="none"' : st(color, w)) + '/>'; }
  function rect(x, y, w, h, fill, color, sw, extra) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + (fill || 'none') + '" ' + st(color, sw, extra) + '/>'; }
  function pt(x, y) { return '<rect x="' + (Math.round(x * 100) - 115) / 100 + '" y="' + (Math.round(y * 100) - 115) / 100 + '" width="2.3" height="2.3" fill="' + B + '" stroke="none"/>'; }
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
    extrude: blk(1.5, 5, 8, 6, 3.5) + blk(4, 1.5, 3.5, 3.5, 2, FY, FYL, FYD),
    cut: blk(1.5, 5, 8, 6, 3.5) + p('M4 7.6 l2 -2 h4.5 l-2 2 z', FY, FYD, 1),
    revolve: p(SPOOL, FY, S) + ell(8, 3, 4, 1.3, FYL, S) + AXIS,
    revolveCut: p(SPOOL, F2, S) + ell(8, 3, 4, 1.3, F1, S) + p('M6 6.5 h4 v3 h-4 z', FY, FYD, 1) + AXIS,
    sweep: ln(SWEEP_PATH, S, 4.2) + ln(SWEEP_PATH, FY, 2.6) + circ(3.5, 13, 2.2, FYL, S, 1.1),
    loft: p('M5.5 3.5 L2.5 13 h11 L10.5 3.5 z', FY, S) + ell(8, 13, 5.5, 1.6, FYL, S) + ell(8, 3.5, 2.5, 0.9, FYL, S),
    hole: blk(1.5, 5, 10, 4, 3.5) + ell(7.5, 7.2, 2.8, 1.2, FYL, FYD, 1) + ell(7.5, 7.2, 1.5, 0.65, FYD, 'none'),
    holeWizard: blk(1.5, 5, 10, 4, 3.5) + ell(7.5, 7.2, 3.4, 1.4, FYL, FYD, 1) + ell(7.5, 7.8, 1.6, 0.6, FYD, 'none') + ln('M5.9 7.8 v1.6 M9.1 7.8 v1.6', FYD, 0.8),
    fillet: p('M2 14 V7.5 a4.5 4.5 0 0 1 4.5 -4.5 H14 V14 z', F2, S) + ln('M2 7.5 a4.5 4.5 0 0 1 4.5 -4.5', FY, 2.2),
    chamfer: p('M2 14 V7.5 l4.5 -4.5 H14 V14 z', F2, S) + ln('M2 7.5 l4.5 -4.5', FY, 2.2),
    imported: blk(4.5, 5.5, 8, 7, 3) + ln('M0.8 4.2 H6.2', FY, 1.5) + ln('M4.2 2 L6.4 4.2 L4.2 6.4', FY, 1.5),
    shell: blk(1.5, 4.5, 9, 7, 3.5) + p('M3.4 7.1 L5.5 5 H11.6 L9.5 7.1 z', '#6e6e6e', S, 1),
    draft: p('M3 14 L5.5 2.5 h5 L13 14 z', F2, S) + ln('M5.5 2.5 L3 14', FY, 1.6),
    rib: blk(1.5, 4.5, 9, 7, 3.5) + p('M4 13 l5 -5.5 v5.5 z', FY, S, 1),
    wrap: p('M3 4 a5 2 0 0 1 10 0 v8 a5 2 0 0 1 -10 0 z', F2, S) + ell(8, 4, 5, 2, F1, S) + ln('M4 9 c1.5 1.2 6.5 1.2 8 0', FY, 1.6),
    intersect: circ(6, 8, 4.5, F2, S) + circ(10, 8, 4.5, F2, S) + p('M8 3.97 A4.5 4.5 0 0 1 8 12.03 A4.5 4.5 0 0 1 8 3.97 z', FY, S, 1),
    deleteBody: blk(1.5, 5.5, 7, 7, 3) + ln('M10 1.5 L14.5 6 M14.5 1.5 L10 6', R, 1.8),   // rfHT: Delete/Keep Body (a solid and a red cross)
    // ---- patterns and mirror: the seed is solid green, the instances a lighter tint
    lpattern: rect(1.5, 3, 3, 3, FY, S, 1) + rect(6.5, 3, 3, 3, FYL, S, 1) + rect(11.5, 3, 3, 3, FYL, S, 1) + rect(1.5, 9.5, 3, 3, FYL, S, 1) + rect(6.5, 9.5, 3, 3, FYL, S, 1) + rect(11.5, 9.5, 3, 3, FYL, S, 1),
    cpattern: circ(8, 8, 5.5, 'none', S, 0.9) + circ(8, 8, 0.8, S, 'none') + rect(6.7, 1.2, 2.6, 2.6, FY, S, 1) + rect(12.2, 6.7, 2.6, 2.6, FYL, S, 1) + rect(6.7, 12.2, 2.6, 2.6, FYL, S, 1) + rect(1.2, 6.7, 2.6, 2.6, FYL, S, 1),
    mirror: p('M6.5 3 L2 6 v7 h4.5 z', FY, S) + p('M9.5 3 L14 6 v7 h-4.5 z', FYL, S) + ln('M8 1.5 v13', S, 1, DASH),
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
    // rfAV: Instant2D, a dimension with the ball handle at its arrow end
    instant2D: ln('M1.5 4 v9 M1.5 8.5 H11', S, 1.1) + ln('M1.5 8.5 l2.5 -1.4 M1.5 8.5 l2.5 1.4', B, 1.2) + circ(12.5, 8.5, 2.3, B, W, 0.9),
    // ---- sketch (yellow pencil, blue entities)
    sketch: SHEET + ln('M3 12 V6.5 h5', S, 1.2) + pt(3, 12) + pt(8, 6.5) + PENCIL,
    exitSketch: SHEET + ln('M3.5 9 h6.5 M7.5 6.5 l2.5 2.5 -2.5 2.5', G, 1.7) + ln('M10.5 13 L14 9.5', S, 3.4) + ln('M10.5 13 L14 9.5', Y, 2.2),
    dim: ln('M2 11.5 h12 M2 9 v5 M14 9 v5', S, 1.1) + ln('M2 11.5 l2.5 -1.4 M2 11.5 l2.5 1.4 M14 11.5 l-2.5 -1.4 M14 11.5 l-2.5 1.4', B, 1.2) + txt(8, 7.5, 6, '10'),
    line: ln('M2.5 13 L13.5 3', S, 1.5) + pt(2.5, 13) + pt(13.5, 3),
    rect: rect(2.5, 4, 11, 8, 'none', S, 1.5) + pt(2.5, 4) + pt(13.5, 12),
    crect: rect(2.5, 4, 11, 8, 'none', S, 1.5) + ln('M6.5 8 h3 M8 6.5 v3', M, 1.1),
    // p9-sketchtab: Midpoint Line and the 3 Point / Parallelogram rectangle types
    midline: ln('M2.5 13 L13.5 3', S, 1.5) + pt(8, 8) + pt(2.5, 13) + pt(13.5, 3),
    // Parallel Line: the reference (ink), the new line (blue) and the distance between them
    parallelLine: ln('M1.5 9.5 L9.5 1.5', M, 1.3) + ln('M6.5 14.5 L14.5 6.5', S, 1.5) + ln('M6.2 6.2 L9.8 9.8', M, 1, 'stroke-dasharray="1.3 1"') + pt(6.5, 14.5) + pt(14.5, 6.5),
    // ui-sketch-construct.js: Tangent Line, Perpendicular Line, Bisector, Tangent Circle, Split / Join Entities
    tangentLine: circ(4, 10.5, 3, 'none', M, 1.1) + circ(12, 10.5, 3, 'none', M, 1.1) + ln('M1 7.5 H15', S, 1.5) + pt(4, 7.5) + pt(12, 7.5),
    perpLine: ln('M1.5 13.5 H14.5', M, 1.3) + ln('M8 13.5 V2.5', S, 1.5) + ln('M8 10.5 H11 V13.5', M, 0.9) + pt(8, 2.5),
    bisectorLine: ln('M2 14 H14.5 M2 14 V1.5', M, 1.3) + ln('M2 14 L12.5 3.5', S, 1.5, 'stroke-dasharray="2 1.4"') + ln('M7 14 A5 5 0 0 0 5.5 10.5 M5.5 10.5 A5 5 0 0 0 2 9', M, 0.9),
    tangentCircle: ln('M1.5 14.5 H14.5 M1.5 14.5 V1.5', M, 1.3) + circ(6.5, 9.5, 5, 'none', S, 1.5) + pt(6.5, 14.5) + pt(1.5, 9.5),
    splitEnt: ln('M2 13 L6.8 8.2', S, 1.5) + ln('M9.2 5.8 L14 1', S, 1.5) + circ(8, 7, 1.5, Y, YD, 0.9) + ln('M4.5 4.5 l2 2 M11.5 11.5 l-2 -2', M, 0.9),
    joinEnt: ln('M1.5 8 H6 M10 8 H14.5', S, 1.5) + ln('M6 8 H10', G, 2) + ln('M8 4 v2.2 M8 9.8 v2.2', G, 1.1),
    rect3: ln('M2 9.5 L8.5 3 L14 8.5 L7.5 15 z', S, 1.5) + pt(2, 9.5) + pt(8.5, 3) + pt(14, 8.5),
    crect3: ln('M2 9.5 L8.5 3 L14 8.5 L7.5 15 z', S, 1.5) + ln('M7 9 h2 M8 8 v2', M, 1.1) + pt(11.25, 5.75),
    parallelogram: ln('M1.5 12.5 L5.5 3.5 H14.5 L10.5 12.5 z', S, 1.5) + pt(1.5, 12.5) + pt(10.5, 12.5) + pt(14.5, 3.5),
    circle: circ(8, 8, 5.5, 'none', S, 1.5) + ln('M6.5 8 h3 M8 6.5 v3', M, 1.1),
    arc: ln('M5 3 A8 8 0 0 1 13 11', S, 1.5) + ln('M3.5 11 h3 M5 9.5 v3', M, 1.1),
    arc3: ln('M2.5 12.5 A7 7 0 0 1 13.5 12.5', S, 1.5) + pt(2.5, 12.5) + pt(8, 5.5) + pt(13.5, 12.5),
    polygon: ln('M8 2 l5.2 3 v6 l-5.2 3 l-5.2 -3 v-6 z', S, 1.5),
    slot: ln('M5 5 h6 a3 3 0 0 1 0 6 h-6 a3 3 0 0 1 0 -6 z', S, 1.5) + ln('M5 8 h6', M, 0.9, DASH),
    // p9-sketch-curves: Perimeter Circle, Tangent Arc, the slot types and the slot length types
    pcircle: circ(8, 8, 5.5, 'none', S, 1.5) + pt(2.5, 8) + pt(10.75, 3.25) + pt(10.75, 12.75),
    tarc: ln('M1.5 12.5 h6', M, 1.3) + ln('M7.5 12.5 A5 5 0 0 0 12.5 7.5', S, 1.5) + pt(7.5, 12.5),
    cslot: ln('M5 5 h6 a3 3 0 0 1 0 6 h-6 a3 3 0 0 1 0 -6 z', S, 1.5) + pt(8, 8),
    aslot3: ln('M2 11.5 A7 7 0 0 1 14 11.5 A2 2 0 0 1 10.6 11.5 A3.6 3.6 0 0 0 5.4 11.5 A2 2 0 0 1 2 11.5 z', S, 1.4) + pt(3.7, 11.5) + pt(8, 6.2) + pt(12.3, 11.5),
    aslot: ln('M2 11.5 A7 7 0 0 1 14 11.5 A2 2 0 0 1 10.6 11.5 A3.6 3.6 0 0 0 5.4 11.5 A2 2 0 0 1 2 11.5 z', S, 1.4) + pt(8, 12.5),
    slotLenCC: ln('M5 6 h6 a2 2 0 0 1 0 4 h-6 a2 2 0 0 1 0 -4 z', S, 1.2) + ln('M5 13.5 h6 M5 12 v3 M11 12 v3', M, 1.1),
    slotLenAll: ln('M5 6 h6 a2 2 0 0 1 0 4 h-6 a2 2 0 0 1 0 -4 z', S, 1.2) + ln('M3 13.5 h10 M3 12 v3 M13 12 v3', M, 1.1),
    spline: ln('M2 12.5 C5 1 10 15 14 3.5', S, 1.5) + pt(2, 12.5) + pt(14, 3.5),
    ellipse: ell(8, 8, 6, 3.8, 'none', S, 1.5),
    pellipse: ln('M2 9 A6 3.8 0 0 0 14 9', M, 0.8, DASH) + ln('M2 9 A6 3.8 0 0 1 14 9', S, 1.5) + pt(2, 9) + pt(14, 9) + pt(8, 9),   // ui-sketch-spline: Partial Ellipse
    point: circ(8, 8, 1.6, B, 'none') + ln('M8 3 v2.5 M8 10.5 v2.5 M3 8 h2.5 M10.5 8 h2.5', S, 1.1),
    text: txt(8, 12.5, 12, 'A', S, 'Georgia, serif', 600),
    trim: ln('M2 8 H8 M8 2 V14', S, 1.5) + ln('M9.6 8 H14.5', R, 1.8, 'stroke-dasharray="1.6 1.3"') + pt(8, 8) + ln('M11.2 4 l2.6 -2.6 M11.2 1.4 l2.6 2.6', R, 1.2),   // r12/chrome12: the trimmed piece red, dashed
    extend: ln('M2 8 h7', S, 1.5) + ln('M9 8 h3.5', S, 1.5, DASH) + ln('M13.5 2 v12', M, 1.2) + ln('M9.5 5.5 l2.5 2.5 -2.5 2.5', G, 1.4),
    convert: blk(1.5, 3, 10, 9.5, 3) + rect(3.5, 8, 6, 5, 'none', S, 1.5) + pt(3.5, 8) + pt(9.5, 13),
    offset: rect(4.5, 4.5, 7, 7, 'none', M, 1.1) + rect(1.5, 1.5, 13, 13, 'none', S, 1.5) + pt(1.5, 1.5) + pt(14.5, 14.5),
    mirrorEnt: ln('M8 2 v12', M, 0.9, DASH) + ln('M6 4.5 L2.5 11.5 h3.5 z', S, 1.4) + ln('M10 4.5 L13.5 11.5 h-3.5 z', S, 1.4, 'stroke-dasharray="1.5 1.5"'),
    sketchPattern: circ(3.5, 8, 1.8, 'none', S, 1.4) + circ(8, 8, 1.8, 'none', S, 1.4) + circ(12.5, 8, 1.8, 'none', S, 1.4) + ln('M2 12.5 h12', M, 0.9, DASH),
    // sketch tools (ui-sketch-tools.js): Sketch Chamfer, Circular Sketch Pattern, the Move Entities flyout, Intersection
    // Curve, Dynamic Mirror, and the On Edge / Pattern relation glyphs
    skChamfer: ln('M2 14 V7.5 l4.5 -4.5 H14', S, 1.5) + ln('M2 7.5 l4.5 -4.5', Y, 2.2),
    cSketchPattern: circ(8, 8, 5, 'none', M, 0.9, DASH) + circ(8, 3, 1.6, 'none', S, 1.4) + circ(12.5, 10.5, 1.6, 'none', S, 1.4) + circ(3.5, 10.5, 1.6, 'none', S, 1.4),
    moveEnt: ln('M2 12 L7 7', S, 1.5) + ln('M9 2 v12 M7 4 l2 -2 2 2 M7 12 l2 2 2 -2 M3 8 h12 M5 6 l-2 2 2 2 M13 6 l2 2 -2 2', G, 1.1),
    copyEnt: ln('M2 13 L7 8', S, 1.5, 'stroke-dasharray="1.6 1.3"') + ln('M8 9 L13 4', S, 1.5) + ln('M6 3.5 h4 M8 1.5 v4', G, 1.3),
    rotateEnt: ln('M8 8 L13.5 4', S, 1.5) + ln('M8 8 H14', M, 0.9, DASH) + p('M3 9 a5 5 0 0 1 8.5 -4.5', 'none', G, 1.2) + ln('M11.8 1.8 l-0.3 2.7 -2.6 -0.6', G, 1.1) + circ(8, 8, 1.2, W, M, 1),
    scaleEnt: rect(2, 8, 6, 6, 'none', S, 1.2, DASH) + rect(2, 2, 12, 12, 'none', S, 1.4) + ln('M8 8 L13 3 M10 3 h3 v3', G, 1.2),
    stretchEnt: ln('M2 13 H9 L13 4', S, 1.5) + ln('M9 13 L14 7', S, 1.2, 'stroke-dasharray="1.6 1.3"') + ln('M11 13 h3.5 M12.8 11.5 l1.7 1.5 -1.7 1.5', G, 1.1),
    intersectCurve: blk(1.5, 6, 9, 5, 3.5) + ln('M1 10 L15 6', S, 1.5),
    dynMirror: ln('M8 2 v12', M, 0.9, DASH) + ln('M6.5 4 L3 12', S, 1.4) + ln('M9.5 4 L13 12', S, 1.4, 'stroke-dasharray="1.5 1.5"') + circ(13, 12, 1.3, Y, YD, 0.8),
    relOnEdge: ln('M2 12.5 h12', G, 1.8) + rect(5, 4, 6, 6, 'none', G, 1.2),
    relPattern: circ(3.5, 8, 1.6, G, 'none') + circ(8, 8, 1.6, G, 'none') + circ(12.5, 8, 1.6, G, 'none') + ln('M2 12 h12', G, 1),
    // r12/chrome12: a sketch corner with its green relation badge (Display/Delete: perpendicular; Add: plus)
    relations: ln('M2 13.5 H11 M2 13.5 V5', S, 1.5) + pt(2, 13.5) + rect(8, 1.5, 6.5, 6.5, '#e3f4df', G, 1, 'rx="1"') + ln('M9.6 6.3 h3.3 M11.25 6.3 V3.1', GD, 1.2),
    addRelation: ln('M2 13.5 H11 M2 13.5 V5', S, 1.5) + pt(2, 13.5) + rect(8, 1.5, 6.5, 6.5, '#e3f4df', G, 1, 'rx="1"') + ln('M11.25 2.9 v3.7 M9.4 4.75 h3.7', GD, 1.4),
    // relation glyphs drawn next to sketch entities (small, on a 16 grid, like SolidWorks' relation icons)
    relHorizontal: ln('M3 8 h10', G, 2), relVertical: ln('M8 3 v10', G, 2),
    relCoincident: circ(8, 8, 3, G, 'none') + circ(8, 8, 5.5, 'none', G, 1.2),
    relParallel: ln('M5 13 L9 3 M8 13 L12 3', G, 1.6), relPerpendicular: ln('M3 13 h10 M8 13 V3', G, 1.6),
    relTangent: circ(8, 6.5, 4, 'none', G, 1.3) + ln('M2 12.5 h12', G, 1.6), relConcentric: circ(8, 8, 2.5, 'none', G, 1.3) + circ(8, 8, 5.5, 'none', G, 1.3),
    relEqual: ln('M3 6 h10 M3 10 h10', G, 1.7), relMidpoint: ln('M2 11 h12', G, 1.4) + circ(8, 11, 2.2, G, 'none') + ln('M8 3 v5', G, 1.2),
    relSymmetric: ln('M8 2 v12', G, 1, 'stroke-dasharray="2 1.5"') + ln('M3 5 v6 M13 5 v6', G, 1.6) + ln('M4.5 8 h2 M11.5 8 h-2', G, 1.1),
    construction: ln('M2 13 L14 3', YD, 1.6, 'stroke-dasharray="2.5 1.6"') + circ(2.5, 12.5, 1.2, W, B) + circ(13.5, 3.5, 1.2, W, B),
    centerline: ln('M2 13 L14 3', S, 1.4, 'stroke-dasharray="4 1.5 1 1.5"'),
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
    flange: p(FLANGE_L, F2, S) + p('M10.5 2.5 h3 V8.5 a5 5 0 0 1 -5 5 v-3 a2 2 0 0 0 2 -2 z', FY, S),
    bend: p('M2 10.5 h6.5 v3 H2 z', F2, S) + p('M8.5 10.5 a2 2 0 0 0 2 -2 V2.5 h3 V8.5 a5 5 0 0 1 -5 5 v-3 z', FY, S) + ln('M8.5 10.5 v3', B, 1.2),
    miter: p('M1.5 12.5 L5.5 9.5 h8 l-4 3 z', F2, S) + p('M5.5 9.5 v-5 h8 v5 z', FY, S) + p('M13.5 9.5 l-4 3 v-5 l4 -3 z', FYD, S) + ln('M13.5 4.5 v5', B, 1.2, DASH),
    hem: p('M2 9 h9 v2 H2 z', F2, S) + p('M11 9 a2.5 2.5 0 0 1 0 5 h-5 v-2 h5 a0.5 0.5 0 0 0 0 -1 z', FY, S),
    jog: p('M1.5 12.5 h4 v2 h-4 z M10 4.5 h4.5 v2 H10 z', F2, S) + p('M5.5 12.5 l4.5 -8 v2 l-4.5 8 z', FY, S),
    sketchedBend: p('M1.5 12 h5.5 a2 2 0 0 0 2 -2 V2.5 h2.5 V10 a4.5 4.5 0 0 1 -4.5 4.5 H1.5 z', F2, S) + p('M7 12 a2 2 0 0 0 2 -2 h2.5 a4.5 4.5 0 0 1 -4.5 4.5 z', FY, S, 1) + ln('M7.2 15 l5.6 -5.6', B, 1.2, DASH),
    // lane CP: Break-Corner/Corner-Trim — a sheet with one corner chamfered and one rounded, the breaks in yellow
    breakCorner: p('M1.5 14 V7.5 L4.5 4.5 H9.5 a4.5 4.5 0 0 1 4.5 4.5 V14 z', F2, S) + p('M1.5 14 h12.5 v1 H1.5 z', FYD, S, 0.8) + ln('M1.5 7.5 L4.5 4.5 M9.5 4.5 a4.5 4.5 0 0 1 4.5 4.5', FY, 2.2),
    // lane CS: Closed Corner (top view of a box corner: the far wall grey, the near wall's extension closing the gap in
    // yellow) and its corner types (the extended flange yellow, the matching flange grey)
    closedCorner: p('M1.5 1.5 h13 v3 h-13 z', F2, S) + p('M1.5 7.5 h3 v7 h-3 z', F2, S) + p('M1.5 5.2 h3 v2.3 h-3 z', FY, S),
    ccButt: p('M2 2 h12.5 v3 H2 z', F2, S) + p('M2 6 h3 v8.5 H2 z', FY, S),
    ccOverlap: p('M2 2 h3 v12.5 H2 z', FY, S) + p('M6 2 h8.5 v3 H6 z', F2, S),
    ccUnderlap: p('M3.5 2 h11 v3 h-11 z', F2, S) + p('M2 6 h3 v8.5 H2 z', FY, S),
    flatten: p('M1.5 12 l3 -8 h10 l-3 8 z', FYL, S) + ln('M5.5 12 l3 -8 M9 12 l3 -8', B, 1, DASH),
    // p9-pm: Edge Flange ▸ Flange Length reference: the bent sheet with the length dimension (blue) measured from the
    // top of the flange to the outer virtual sharp, the inner virtual sharp, or the tangent where the bend starts
    lenOuter: p(FLANGE_L, F2, S, 1) + ln('M13.5 8.5 V13.5 H8.5', R, 0.8, DASH) + ln('M15 2.5 V13.5 M14 2.5 h2 M14 13.5 h2', B, 1.1),
    lenInner: p(FLANGE_L, F2, S, 1) + ln('M8.5 10.5 H10.5 V8.5 M10.5 10.5 H14', R, 0.8, DASH) + ln('M15 2.5 V10.5 M14 2.5 h2 M14 10.5 h2', B, 1.1),
    lenTangent: p(FLANGE_L, F2, S, 1) + ln('M13.5 8.5 H14', R, 0.8, DASH) + ln('M15 2.5 V8.5 M14 2.5 h2 M14 8.5 h2', B, 1.1),
    // Hem Type, side view of the sheet edge: Closed (flat on the sheet), Open (a gap), Tear Drop, Rolled
    hemClosed: ln('M1.5 7 H11.5 a1 1 0 0 1 0 2 H5', FYI, 1.8),
    hemOpen: ln('M1.5 5.5 H11 a2.5 2.5 0 0 1 0 5 H5', FYI, 1.8),
    hemTeardrop: ln('M1.5 5.5 H9.5 a3 3 0 0 1 0 6 L5 7', FYI, 1.8),
    hemRolled: ln('M1.5 4.5 H9 a4 4 0 1 1 -4 4', FYI, 1.8),
    // Hem position against the edge the hem was made on (red dashes): Material Inside / Bend Outside
    hemInside: ln('M12 2 v12', R, 1, DASH) + ln('M1.5 6 H8.5 a2 2 0 0 1 0 4 H4', FYD, 1.8),
    hemOutside: ln('M8.5 2 v12', R, 1, DASH) + ln('M1.5 6 H11 a2 2 0 0 1 0 4 H6.5', FYD, 1.8),
    // rfBF: commands SolidWorks shows on the Part tabs that Anvil greys (Evaluate, Sheet Metal), so none is a blank square
    undercut: blk(1.5, 3, 9, 6, 3.5) + p('M1.5 12.5 h9 l-2 3 h-5 z', RL, RD, 1) + ln('M6 12.5 v-1', RD, 1),
    thickness: rect(2, 4, 4, 8, '#e2463b', 'none') + rect(6, 4, 4, 8, FY, 'none') + rect(10, 4, 4, 8, '#3ec25a', 'none') + rect(2, 4, 12, 8, 'none', S, 1.1),
    compareDocs: rect(1.5, 1.5, 8, 10, W, S, 1, 'rx="0.6"') + rect(6.5, 4.5, 8, 10, W, S, 1, 'rx="0.6"') + ln('M8.5 8 h4 M8.5 10.5 h4 M8.5 13 h2.5', B, 1),
    perfEval: p('M2 12 a6 6 0 0 1 12 0', 'none', S, 1.3) + ln('M3.5 12 h1 M11.5 12 h1 M8 6 v1', S, 1) + ln('M8 12 L11.5 7', R, 1.4) + circ(8, 12, 1.2, S, 'none'),
    costing: circ(8, 8, 6, FYL, FYI, 1.1) + txt(8, 11.6, 9.5, '$', FYI, null, 700),
    convertSM: blk(1, 6.5, 7, 6, 3) + p('M10 14.5 h5 v-1.4 h-3.6 V4 H10 z', FY, S, 1),
    crossBreak: p('M1.5 4 h13 v8 h-13 z', F2, S, 1.1) + ln('M1.5 4 L14.5 12 M14.5 4 L1.5 12', FYD, 1.3),
    corners: p('M2 2 h3 v9 h-3 z', F2, S, 1) + p('M5 11 h9 v3 H5 z', F2, S, 1) + circ(5, 11, 1.8, FY, FYD, 1),
    formingTool: p('M1 12.5 l3 -5 h11 l-3 5 z', F2, S, 1) + p('M5.5 10.3 a2.5 2.5 0 0 1 5 0 z', FY, FYD, 1),
    vent: rect(1.5, 2.5, 13, 11, F2, S, 1.1, 'rx="1"') + ln('M4 5.5 h8 M4 8 h8 M4 10.5 h8', '#424242', 1.4),
    unfold: p(FLANGE_L, F2, S, 1) + ln('M3 7 C3 4 5 2.5 8.5 2.5', B, 1.2) + ln('M3 7.2 l-1.5 -1.6 M3 7.2 l1.6 -1.4', B, 1.2),
    fold: p('M1.5 11 h8 v3 h-8 z', F2, S, 1) + p('M9.5 11 h5 v3 h-5 z', FY, S, 1) + ln('M12 9 C12 5.5 10 3.5 6.5 3.5', B, 1.2) + ln('M12 9.2 l-1.5 -1.6 M12 9.2 l1.5 -1.6', B, 1.2),
    rip: blk(1.5, 5, 9, 7, 3.5) + ln('M10.5 9 v6.5', R, 1.8) + ln('M10.5 8.5 l3.5 -3.5', R, 1.8),
    // lane DQ: Insert Bends (a sharp L whose corner turns into a yellow bend) and No Bends (the same L, sharp, struck)
    insertBends: p('M2 3 h3 v7.5 h8.5 v3 H5 a3 3 0 0 1 -3 -3 z', F2, S, 1) + p('M2 10.5 a3 3 0 0 0 3 3 v-3 z', FY, FYD, 1),
    noBends: p('M2 3 h3 v7.5 h8.5 v3 H2 z', F2, S, 1) + ln('M3 2 L14 14', R, 1.4),
    // ---- evaluate
    measure: p('M2 12 L12 2 l2 2 L4 14 z', Y, S) + ln('M4.5 9.5 l1 1 M6.5 7.5 l1 1 M8.5 5.5 l1 1 M10.5 3.5 l1 1', S, 1),
    mass: p('M4.5 6 h7 l2.5 8 h-12 z', F2, S) + circ(8, 3.9, 1.8, 'none', S, 1.2) + circ(8, 10.3, 2.3, W, S, 0.9) + p('M8 10.3 V8 A2.3 2.3 0 0 1 10.3 10.3 z M8 10.3 V12.6 A2.3 2.3 0 0 1 5.7 10.3 z', S, 'none'),   // r12/chrome12: a weight with the centre-of-mass mark
    section: blk(1.5, 3, 5.5, 8, 3.5, F2, F1, RL) + ln('M7 9.6 l3.5 -3.5 M7 12.6 l3.5 -3.5', RD, 0.9) + p('M5.8 15.3 V5.3 l5.9 -4.6 v10 z', 'rgba(109,109,109,0.16)', B, 1),   // r12/chrome12: half a block, the cut face hatched, the blue section plane
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
    checkSketch: p('M7 3 H2.5 V13.5 H13.5 V9', 'none', S, 1.4) + p('M10 3 H13.5 V6', 'none', S, 1.4) + circ(8.5, 3, 2.4, 'none', R, 1.2) + circ(13.5, 7.5, 2.4, 'none', R, 1.2),
    repairSketch: p('M2.5 3 V13.5 H13.5 V9', 'none', S, 1.4) + p('M2.5 3 H8', 'none', G, 1.6) + ln('M9 9.5 l4.5 -4.5', S, 1.6) + circ(13.6, 4.1, 1.7, 'none', M, 1.2) + ln('M9 9.5 l-1.2 1.2', S, 2.2),
    // ---- view (heads-up toolbar)
    fit: ln('M2.5 5.5 V2.5 h3 M10.5 2.5 h3 v3 M13.5 10.5 v3 h-3 M5.5 13.5 h-3 v-3', S, 1.25) + rect(5.5, 5.5, 5, 5, PL, B, 1.2),
    // Standard toolbar (next to the menus): curved arrows, SolidWorks' Undo / Redo
    undo: ln('M4.5 5.5 h5.5 a3.5 3.5 0 0 1 0 7 H6', B, 1.6) + p('M5 5.5 l3 -2.8 v5.6 z', B, B, 1),
    redo: ln('M11.5 5.5 H6 a3.5 3.5 0 0 0 0 7 h4', B, 1.6) + p('M11 5.5 l-3 -2.8 v5.6 z', B, B, 1),
    zoomArea: circ(7, 7, 4, 'none', S) + ln('M10 10 l3.5 3.5', S, 2) + rect(5, 5, 4, 4, 'none', B, 1, 'stroke-dasharray="1.2 1.2"'),
    prevView: ln('M10 3 L5 8 l5 5', S, 1.8),
    orient: blk(2, 3.5, 6, 5, 2.5) + circ(11.5, 11.5, 3, W, B, 1.1) + ln('M11.5 9.8 v1.7 l1.2 0.7', B, 1.1),
    display: blk(1.5, 4.5, 9, 7, 3.5, '#bdbdbd', '#e1e1e1', '#979797'),
    hideshow: ln('M1.5 8 c3 -5 10 -5 13 0 c-3 5 -10 5 -13 0 z', S, 1.25) + circ(8, 8, 2.2, B, 'none'),
    appearance: circ(8, 8, 6, F2, S) + circ(6, 6.3, 1.2, R, 'none') + circ(9.6, 5.4, 1.2, B, 'none') + circ(10.2, 9.2, 1.2, G, 'none') + circ(6.4, 10.3, 1.2, Y, 'none'),
    scene: rect(2, 3, 12, 10, W, S, 1.1, 'rx="0.6"') + ln('M2 11 l4 -3.5 3 2.5 2 -1.5 3 2.5', B, 1.2) + circ(11, 5.5, 1.1, Y, 'none'),
    settings: circ(8, 8, 2, 'none', S) + ln('M8 2 v2 M8 12 v2 M2 8 h2 M12 8 h2 M3.8 3.8 l1.4 1.4 M10.8 10.8 l1.4 1.4 M3.8 12.2 l1.4 -1.4 M10.8 5.2 l1.4 -1.4', S, 1.25),
    // rfBF: the quick-access toolbar (New, Open, Save, Print, Select, Rebuild, File Properties) in the menu bar
    newDoc: p('M3.5 1.5 h6 l3 3 v10 h-9 z', W, S, 1.1) + p('M9.5 1.5 v3 h3', W, S, 1) + ln('M5.5 8 h5 M5.5 10.5 h5', M, 0.9),
    openDoc: p('M1.5 4 h4.5 l1.5 1.5 h5.5 v2', '#f6d77a', '#b48a1c', 1) + p('M1.5 4 V13.5 h10.5 l2.5 -6 H4 l-2.5 6', '#f9e3a0', '#b48a1c', 1) + ln('M11 1 l2.2 2.2 -2.2 2.2 M13.2 3.2 H8.5', G, 1.3),
    saveDoc: p('M2 2 h10 l2 2 v10 H2 z', '#6d6d6d', '#3a3a3a', 1) + rect(4.5, 2.5, 6, 4, W, '#3a3a3a', 0.8) + rect(8.2, 3.2, 1.4, 2.5, '#3a3a3a', 'none') + rect(4, 9, 8, 5, '#e4e4e4', '#3a3a3a', 0.8),
    printDoc: rect(4.5, 1.5, 7, 4, W, S, 1) + p('M1.5 5.5 h13 v6 h-13 z', F2, S, 1) + rect(4.5, 9.5, 7, 5, W, S, 1) + ln('M6 11.5 h4 M6 13 h4', M, 0.8) + circ(12.5, 7.3, 0.7, G, 'none'),
    select: p('M4 1.5 V13 l3 -2.8 2 4.3 2 -0.9 -2 -4.3 4 -0.3 z', W, S, 1.1),
    rebuild: rect(5, 1, 6, 14, '#3e3e3e', '#262626', 0.8, 'rx="1.6"') + circ(8, 3.6, 1.6, '#e2463b', 'none') + circ(8, 8, 1.6, '#f5c400', 'none') + circ(8, 12.4, 1.6, '#3ec25a', 'none'),
    fileProps: rect(2.5, 1.5, 11, 13, W, S, 1.1, 'rx="0.6"') + ln('M4.5 4.5 h7 M4.5 7 h7 M4.5 9.5 h7 M4.5 12 h4', M, 1) + rect(2.5, 1.5, 11, 1.8, B, 'none'),
    options: circ(8, 8, 4.4, F2, S, 1.1) + ln('M8 1.2 v2.4 M8 12.4 v2.4 M1.2 8 h2.4 M12.4 8 h2.4 M3.2 3.2 l1.7 1.7 M11.1 11.1 l1.7 1.7 M3.2 12.8 l1.7 -1.7 M11.1 4.9 l1.7 -1.7', S, 2.2) + circ(8, 8, 1.7, W, S, 1),
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
    macro: '<rect x="2" y="3" width="12" height="10" rx="1" fill="#2e2e2e" stroke="none"/>' + ln('M4 6 l2 2 -2 2', '#7ee787', 1.3) + ln('M7.5 10 h4', '#e4e4e4', 1.3),
    warn: p('M8 2 L14.5 13.5 H1.5 z', '#e8a23a', S) + ln('M8 6 v4 M8 11.5 v0.5', S, 1.6),
    error: circ(8, 8, 5.5, R, S) + ln('M5.5 5.5 l5 5 M10.5 5.5 l-5 5', W, 1.6),
    ok: ln('M2.5 8.5 l3.5 3.5 L13.5 4', G, 2.6),
    cancel: ln('M4 4 l8 8 M12 4 L4 12', R, 2.6),
    generic: rect(3.5, 3.5, 9, 9, F2, S, 1.1, 'rx="1"'),
    search: circ(7, 7, 3.5, 'none', S) + ln('M9.5 9.5 l3.5 3.5', S, 1.6),
    filter: p('M2 3 h12 l-4.5 5 v4.5 l-3 1.5 v-6 z', F2, S),
    part: blk(2, 3, 7, 8, 4, F2, F1, F3, S, 1),
    body: blk(2, 3, 7, 8, 4, '#b8b8b8', '#e0e0e0', '#8e8e8e', S, 1),
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
    lpatternComp: blk(0.5, 8, 3, 4.5, 1.5, '#f0c987', '#f8e2b8', '#d9a95a', S, 0.9) + blk(5.5, 8, 3, 4.5, 1.5, '#f8e2b8', '#fbeed6', '#e8c58c', S, 0.9) + blk(10.5, 8, 3, 4.5, 1.5, '#f8e2b8', '#fbeed6', '#e8c58c', S, 0.9) + ln('M2 3.5 h12 M12.5 2 l1.5 1.5 -1.5 1.5', G, 1.1),
    cpatternComp: circ(8, 8, 5, 'none', S, 0.8, DASH) + rect(6, 1, 4, 4, '#f0c987', S, 0.9) + rect(11, 6, 4, 4, '#f8e2b8', S, 0.9) + rect(6, 11, 4, 4, '#f8e2b8', S, 0.9) + rect(1, 6, 4, 4, '#f8e2b8', S, 0.9),
    mirrorComp: ln('M8 1 v14', P, 1.1, DASH) + blk(1.5, 5, 4, 6, 2, '#f0c987', '#f8e2b8', '#d9a95a', S, 0.9) + blk(9.5, 5, 4, 6, 2, '#f8e2b8', '#fbeed6', '#e8c58c', S, 0.9),
    // Exploded View: a block lifted off another along a dashed explode line; an explode step: the arrow alone
    explode: blk(2, 9.5, 8, 3.5, 2.5, F2, F1, F3, S, 1) + blk(5, 1.5, 6, 4, 2.5, '#f0c987', '#f8e2b8', '#d9a95a', S, 1) + ln('M13.5 9.5 v-6 M12.2 4.8 l1.3 -1.3 1.3 1.3', '#e07b1a', 1.2) + ln('M8 6 v4', '#e07b1a', 0.9, DASH),
    explodeStep: ln('M8 14 V3 M5 6 l3 -3 3 3', '#e07b1a', 1.4) + ln('M3 14 h10', S, 1.2),
    // Fix: a push pin
    fix: p('M6 2 h5 l-1 1.5 v3.5 l2 2 h-7 l2 -2 V3.5 z', R, RD, 1) + ln('M8.5 9 v5.5', S, 1.3),
    // Float: a block with four arrows around it
    float: rect(5.5, 5.5, 5, 5, F2, S, 1) + ln('M8 1.5 v2.5 M6.8 2.7 l1.2 -1.2 1.2 1.2 M8 14.5 V12 M6.8 13.3 l1.2 1.2 1.2 -1.2 M1.5 8 H4 M2.7 6.8 l-1.2 1.2 1.2 1.2 M14.5 8 H12 M13.3 6.8 l1.2 1.2 -1.2 1.2', B, 1),
    // sketch-layers: Layers (three stacked sheets: cut, etch, bend), Paste sketch entities (a clipboard with a sketch on it)
    layers: p('M8 9.5 L14.5 12 L8 14.5 L1.5 12 z', RL, RD, 1) + p('M8 6 L14.5 8.5 L8 11 L1.5 8.5 z', GL, GD, 1) + p('M8 2.5 L14.5 5 L8 7.5 L1.5 5 z', '#d0d0d0', B, 1),
    pasteSketch: rect(2.5, 2.5, 9, 12, '#e8d3a8', YD, 1) + rect(4.5, 1.5, 5, 2.5, F2, S, 0.9) + rect(6.5, 6, 8, 8.5, W, B, 1) + ln('M8.5 9 h4 M8.5 11.5 h2.5', B, 0.9),
    // levels (ui-levels.js): Levels Manager, a table of numbered levels with the main level's row in yellow
    levels: rect(1.5, 1.5, 4.5, 3.5, Y, YD, 0.9) + ln('M8 3.25 h6.5', S, 1.3) + rect(1.5, 6.25, 4.5, 3.5, F1, S, 0.9) + ln('M8 8 h6.5', S, 1.3) + rect(1.5, 11, 4.5, 3.5, F1, S, 0.9) + ln('M8 12.75 h6.5', S, 1.3),
    // rfC: the rest of SolidWorks 2024's Sketch tab, in the sketch-entity style above (blue entity 1.5, ink points 1.1,
    // yellow for the part a tool makes): Sketch Fillet (the round in yellow, as Sketch Chamfer), 3D Sketch, 3D Sketch On
    // Plane, Style Spline, Equation Driven Curve, Parabola, Conic, Quick Snaps, Rapid Sketch, Shaded Sketch Contours,
    // Sketch Picture
    skFillet: ln('M2 14 V8 a5 5 0 0 1 5 -5 H14', S, 1.5) + ln('M2 8 a5 5 0 0 1 5 -5', Y, 2.2) + ln('M2 8 V3 H7', M, 0.9, DASH),
    sketch3d: ln('M1.5 14.5 h6 M1.5 14.5 V8 M1.5 14.5 l3.4 -3.4', P, 1.2) + ln('M3 6 L7.5 2 L12.5 4.5', S, 1.5) + pt(3, 6) + pt(12.5, 4.5) + PENCIL,
    sketch3dPlane: p('M1.5 10.5 l3.5 -6 h9 l-3.5 6 z', PL, P, 1.1) + ln('M4.5 8.5 L10 6', S, 1.5) + PENCIL,
    styleSpline: ln('M2 13 L5 3 L11 13 L14 3', M, 0.9, DASH) + ln('M2 13 C5 1 11 15 14 3', S, 1.5) + pt(5, 3) + pt(11, 13),
    eqnCurve: ln('M1.5 9.5 C4 2 6.5 2 8.5 7 S12.5 12.5 14.5 4.5', S, 1.5) + txt(5.8, 15, 4.6, 'f(x)', S, 'Georgia, serif', 600),
    parabola: ln('M2 2 Q8 22 14 2', S, 1.5) + pt(8, 8.5) + ln('M5 12 h6', M, 0.9, DASH),
    conic: ln('M2 13 L4.5 3 L14 3.5', M, 0.9, DASH) + ln('M2 13 Q4.5 3 14 3.5', S, 1.5) + pt(2, 13) + pt(14, 3.5),
    quickSnaps: circ(8, 8, 4.5, 'none', S, 1.1) + ln('M8 1.5 v3 M8 11.5 v3 M1.5 8 h3 M11.5 8 h3', S, 1.1) + circ(8, 8, 1.7, Y, YD, 0.9),
    rapidSketch: blk(1.5, 6.5, 8, 6, 3) + ln('M3 13.5 L6 10.5', B, 1.4) + PENCIL,
    shadedContours: p('M2.5 13 V3.5 h6 l5 4.5 V13 z', '#d0d0d0', B, 1.5) + rect(5, 6, 3, 3, W, B, 1.1),
    sketchPicture: rect(1.5, 2.5, 13, 11, W, S, 1.1, 'rx="0.6"') + p('M2.2 12.8 l3.8 -4.8 3 3 2 -2 3.3 3.8 z', GL, GD, 0.9) + circ(11, 5.5, 1.3, Y, 'none') + ln('M3.5 5 h4', B, 1.3),
    // selection lists (ui-commands.js pickList): the kind of each listed item, as SolidWorks' selection boxes show it
    edgeSel: blk(2, 4.5, 9, 7, 3.5) + ln('M2 8 h9', B, 2),
    faceSel: blk(2, 4.5, 9, 7, 3.5, '#a6a6a6'),
    vertexSel: blk(2, 4.5, 9, 7, 3.5) + circ(11, 8, 1.8, B, W, 0.9),
    // drawing views (rfN): Auxiliary View, Crop View, Break
    auxView: rect(1.5, 8.5, 6.5, 6, W, S, 1.1) + p('M9.5 1.5 l5 3 -2.2 3.7 -5 -3 z', '#d0d0d0', B, 1.1) + ln('M6.5 8.5 L9.2 4.6', B, 1.2) + p('M9.9 3.6 l-0.2 2.1 -1.7 -1.2 z', B, B, 0.6),
    cropView: rect(4, 4, 8, 8, '#d0d0d0', 'none', 0) + ln('M4 1 V12 H15 M1 4 H12 V15', B, 1.4),
    breakView: rect(1, 5, 5, 6, '#d0d0d0', B, 1) + rect(10, 5, 5, 6, '#d0d0d0', B, 1) + ln('M7 2.5 l1 1.5 -1 1.5 1 1.5 -1 1.5 1 1.5 -1 1.5 1 1.5 -1 1.5 M9 2.5 l1 1.5 -1 1.5 1 1.5 -1 1.5 1 1.5 -1 1.5 1 1.5 -1 1.5', S, 0.9),
    // (rfAD) Broken-out Section, Area Hatch/Fill
    brokenOut: rect(1.5, 2.5, 13, 11, '#d0d0d0', B, 1.1) + p('M5 5.5 C7.5 4 11.5 5 11 8 C10.5 11 6 11.5 4.5 9.5 C3.5 8 4 6.3 5 5.5 z', W, B, 0.9) + ln('M5.5 9.5 L8.5 6.5 M7 10.3 L10 7.3', S, 0.7),
    areaHatch: p('M2 13.5 V5 L7 2 H14 V13.5 z', W, B, 1.1) + ln('M3 12.5 L12.5 3 M6 13 L13.5 5.5 M2.5 9 L8 3.5 M9.5 13 L13.5 9', S, 0.8),
    // (rfAG) Magnetic Line: a dashed line with two balloons on it
    magLine: ln('M0.5 8 H15.5', B, 1.1, DASH) + circ(4.5, 8, 2.8, W, S, 1) + circ(11.5, 8, 2.8, W, S, 1),
    // (rfAN) Hole Table (a table and a tagged hole), Weld Symbol (arrow, reference line, fillet), Revision Symbol
    // (the triangle), Revision Cloud (scallops)
    holeTable: rect(1.5, 1.5, 9, 8, W, S, 1) + ln('M1.5 4 h9 M5 1.5 v8', S, 0.8) + circ(12, 12, 2.5, W, B, 1.1) + ln('M12 10.5 v3 M10.5 12 h3', B, 0.7),
    // (rfJG) Punch Table: the table and a punched form (a louver hood)
    punchTable: rect(1.5, 1.5, 9, 8, W, S, 1) + ln('M1.5 4 h9 M5 1.5 v8', S, 0.8) + p('M9.5 13.5 h5 a2.5 2.5 0 0 0 -5 0 z', W, B, 1.1),
    weldSymbol: ln('M1.5 13.5 L6 8 H15', S, 1.1) + p('M1.5 13.5 l0.6 -2.2 1.6 1.6 z', S, S, 0.6) + p('M9 8 v4 l4 -4 z', W, B, 1.1),
    revisionSymbol: p('M8 1.8 L14.5 13.5 H1.5 z', W, S, 1.1) + txt(8, 12, 6.5, 'A', B, 'Arial', 700),
    revisionCloud: ln('M3 5 a2 2 0 0 1 3.5 -1.5 a2 2 0 0 1 3.5 0 a2 2 0 0 1 3 2 a2 2 0 0 1 0.5 3.5 a2 2 0 0 1 -2 3.5 a2 2 0 0 1 -3.5 0.5 a2 2 0 0 1 -3.5 -0.5 a2 2 0 0 1 -1.5 -3.5 a2 2 0 0 1 1.5 -3.5', B, 1.1),
    // (rfAQ) sketch Ordinate Dimension (values both ways), Chamfer Dimension (a chamfered corner, a leader), Angular Running
    // (rays from a vertex, an arc), Path Length (a chain with a dimension along it), Autodimension (a part with baseline dims)
    ordinateDim: ln('M2 14 h12 M2 14 V2', S, 1.1) + ln('M5 13.5 V9 M9 13.5 V9 M2.5 6 H6', B, 1) + txt(5, 8, 3.4, '0') + txt(9, 8, 3.4, '4') + txt(8.5, 7.2, 3.4, '3'),
    chamferDim: ln('M2 14 V7 l4 -4 H14', S, 1.3) + ln('M4 5 L9.5 9.5 H14', B, 1) + p('M4 5 l2.2 0.6 -1.6 1.6 z', B, B, 0.5) + ln('M2 7 l4 -4', G, 1.8),
    angRunDim: ln('M3 13 H14 M3 13 L12 5 M3 13 L5 3', S, 1.1) + ln('M10 13 A7 7 0 0 0 4.6 6.2', B, 1) + txt(13, 11.5, 3.4, '0'),
    pathLengthDim: ln('M2 12 L6 12 A3 3 0 0 0 9 9 L9 4 L14 4', S, 1.3) + ln('M3 15 h3 M2 14.2 l1 0.8 -1 0.8', B, 1) + txt(11, 15, 4, 'L'),
    autodim: rect(3, 4, 10, 7, 'none', S, 1.2) + ln('M3 1.5 h10 M3 2.5 v-2 M13 2.5 v-2 M1.5 4 v7 M0.5 4 h2 M0.5 11 h2', B, 1) + circ(8, 7.5, 1.4, 'none', B, 1),
    // (rfAT) Block (a dashed frame round a punch symbol with its insertion point), Jog Line (a line with a square jog)
    block: rect(1.5, 1.5, 13, 13, W, S, 0.9) + circ(8, 8, 3.2, W, B, 1.1) + ln('M3.5 8 h9 M8 3.5 v9', B, 0.7) + circ(8, 8, 1, S, S, 0.5),
    jogLine: ln('M0.5 11 H5 V5 H11 V11 H15.5', S, 1.3),
    // lane BJ: Mastercam's Transform tab (ui-transform.js): the original dashed, the result solid on a yellow face, the
    // motion in green; ✓+ (OK and keep open)
    tDynamic: p('M10 12.5 A6 6 0 0 0 4 6.5', 'none', B, 1.1, DASH) + ln('M4 12.5 H13', R, 1.4) + p('M14.8 12.5 l-3 -1.7 v3.4 z', R, R, 0.6) + ln('M4 12.5 V3.5', G, 1.4) + p('M4 1.7 l-1.7 3 h3.4 z', G, G, 0.6) + circ(4, 12.5, 1.4, W, B, 1),
    tTranslate: rect(1.5, 8.5, 6, 5, 'none', S, 1, DASH) + rect(8.5, 2.5, 6, 5, FYL, S, 1.2) + ln('M5.5 8 L10 5', G, 1.2) + p('M11.4 4 l-3.1 0.3 1.3 2.2 z', G, G, 0.6),
    tTranslatePlane: p('M1 12 l3 -3 h6 l-3 3 z', PL, P, 1) + p('M6 6 l3 -3 h6 l-3 3 z', PL, P, 1) + circ(5.5, 10.5, 1.1, FY, S, 0.9) + circ(10.5, 4.5, 1.1, FY, S, 0.9) + ln('M6.3 9.6 L9.3 5.8', G, 1.1) + p('M10 4.9 l-2.4 0.9 1.6 1.3 z', G, G, 0.5),
    tRotate: rect(7, 9, 7, 4, 'none', S, 1, DASH) + p('M3.2 9.4 L6.7 3.3 L10.2 5.3 L6.7 11.4 z', FYL, S, 1.2) + circ(3.2, 13, 1.3, W, B, 1) + p('M13.5 8 A8 8 0 0 0 9.8 2.4', 'none', G, 1.1) + p('M8.4 1.6 l2.9 -0.4 -0.6 2.6 z', G, G, 0.5),
    tProject: p('M5 3 h7 l-2 3 h-7 z', FYL, S, 1.2) + ln('M3 6 V11 M10 6 V11 M12 3 V8', M, 0.9, DASH) + p('M1 13.5 l2.5 -3 h12 l-2.5 3 z', PL, P, 1) + ln('M3 11 h7 l1.5 -1.5', S, 1.2),
    tMoveOrigin: ln('M2 14 H8 M2 14 V8', M, 1, DASH) + circ(2, 14, 1.4, W, B, 1) + rect(8.5, 2.5, 6, 5, FYL, S, 1.2) + pt(8.5, 7.5) + ln('M7.5 8.5 L4 12', G, 1.2) + p('M3 13 l0.6 -3 2.3 1.9 z', G, G, 0.5),
    tMirror: ln('M8 1.5 v13', M, 0.9, DASH) + p('M6 4 L2 12 h4 z', 'none', S, 1.2, 'stroke-dasharray="1.6 1.2"') + p('M10 4 L14 12 h-4 z', FYL, S, 1.3) + ln('M4.5 2.5 h7 M10 1 l1.5 1.5 -1.5 1.5', G, 1),
    tRoll: ell(4, 8, 2, 6, PL, P, 1) + p('M4 2 H12 M4 14 H12', 'none', P, 1) + p('M12 2 A2 6 0 0 1 12 14', 'none', P, 1) + p('M2.3 5 Q8 7 13.6 5.5', 'none', S, 1.3) + p('M2.3 10 Q8 12 13.6 10.5', 'none', S, 1.3, DASH),
    tOffsetEntity: ln('M2 12.5 L12 3', S, 1.4) + ln('M5 14 L15 4.5', S, 1.2, DASH) + ln('M6.5 8.2 l2.4 2.4', G, 1.1) + p('M9.6 11.3 l-0.6 -2.3 -1.7 1.7 z', G, G, 0.5),
    tOffsetChains: p('M2 14 V5 a3 3 0 0 1 3 -3 H14', 'none', S, 1.4) + p('M5 14 V6.5 a1.5 1.5 0 0 1 1.5 -1.5 H14', 'none', S, 1.2, DASH) + pt(2, 14) + pt(14, 2),
    tNesting: rect(1, 1.5, 14, 13, W, P, 1) + rect(2.5, 3, 5, 4, FYL, S, 0.9) + rect(8.5, 3, 5, 4, FYL, S, 0.9) + p('M2.5 9 h5 v4 h-2 a1.5 1.5 0 0 1 -3 0 z', FYL, S, 0.9) + circ(11, 11, 2, FYL, S, 0.9),
    tRectArray: rect(1.5, 2, 3.5, 3.5, FYL, S, 1) + rect(6.25, 2, 3.5, 3.5, 'none', S, 1) + rect(11, 2, 3.5, 3.5, 'none', S, 1) + rect(1.5, 10, 3.5, 3.5, 'none', S, 1) + rect(6.25, 10, 3.5, 3.5, 'none', S, 1) + rect(11, 10, 3.5, 3.5, 'none', S, 1) + ln('M3.25 7 v1.6 M8 7 v1.6 M12.75 7 v1.6', G, 1),
    tDistribute: circ(2.8, 6, 1.8, FYL, S, 1) + circ(8, 6, 1.8, 'none', S, 1) + circ(13.2, 6, 1.8, 'none', S, 1) + ln('M2.8 10 v3.5 M8 10 v3.5 M13.2 10 v3.5 M2.8 12 H13.2', G, 1),
    tStretch: p('M2 13 H8 L9.5 6 H13', 'none', S, 1.4) + rect(7.5, 3.5, 7, 6, 'none', B, 0.9, DASH) + ln('M11 12 h3.5 M12.8 10.5 l1.7 1.5 -1.7 1.5', G, 1.1),
    tScale: rect(1.5, 9, 5, 5, 'none', S, 1, DASH) + rect(1.5, 2, 12, 12, 'none', S, 1.3) + circ(1.5, 14, 1.2, W, B, 1) + ln('M6 9.5 L12 3.5', G, 1.2) + p('M13 2.5 l-3 0.6 2.4 2.4 z', G, G, 0.5),
    okPlus: circ(8, 8, 7.3, '#2f7ad6', '#1f5fae', 0.8) + ln('M5.6 9 l2.2 2.2 L12 6.4', '#fff', 1.8) + ln('M4.6 2.9 v3.6 M2.8 4.7 h3.6', '#fff', 1.4)   // user 2026-10-27: Mastercam's blue round OK-and-new
  };
  // lane BS: Close Arc (Mastercam's: an arc, its blue end points, the closing piece dotted green) and Show Endpoints
  // (the heads-up toggle: a line with its two end dots)
  I.closeArc = ln('M8 13.5 A5.5 5.5 0 1 1 13.5 8', S, 1.5) + ln('M13.5 8 A5.5 5.5 0 0 1 8 13.5', G, 1.4, 'stroke-dasharray="1.3 1.3"') + pt(8, 13.5) + pt(13.5, 8) + ln('M7 8 h2 M8 7 v2', M, 0.9);
  // rfIF: the Dimension PM's Tolerance/Precision icons, as SolidWorks draws them: tolerance type "1.50" with its "+.01"
  // over "-.01" stack, unit precision ".01" over ".01". The figures are a 3 × 5 pixel font of whole-unit squares
  // (filled, no stroke, so weigh leaves them alone): sharp at 16 px 1x and 32 px / 2x.
  var PXF = { '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#', '##', '.#', '.#', '.#'], '5': ['###', '#..', '###', '..#', '###'],
    '.': ['.', '.', '.', '.', '#'], '+': ['...', '.#.', '###', '.#.', '...'], '-': ['...', '...', '###', '...', '...'] };
  function pxText(x, y, s, fill) {
    var d = '';
    s.split('').forEach(function (ch) {
      var g = PXF[ch];
      g.forEach(function (row, r) { for (var c = 0; c < row.length; c++) if (row.charAt(c) === '#') d += 'M' + (x + c) + ' ' + (y + r) + 'h1v1h-1z'; });
      x += g[0].length + 1;
    });
    return '<path d="' + d + '" fill="' + (fill || S) + '" stroke="none"/>';
  }
  I.dimTolType = pxText(3, 0, '+.01', B) + pxText(1, 5, '1.50') + pxText(3, 10, '-.01', B);
  I.dimPrecision = pxText(2, 2, '.01') + ln('M1.5 8.5 h13', M, 1) + pxText(6, 10, '.01', B);
  I.showEndpoints = ln('M3.5 12.5 L12.5 3.5', S, 1.4) + circ(3.5, 12.5, 2, B, 'none') + circ(12.5, 3.5, 2, B, 'none');
  // lane CD: the View ribbon tab (Mastercam-style, built by lane CC). Standard views: SolidWorks' wire cube with the
  // named face in yellow (a face at the back shows through paler, behind the dashed hidden edges); Isometric a true iso
  // cube with its three faces shaded. Display styles: one cube drawn in each style. Show toggles (planes, origins,
  // sketches, sketch dimensions): the item with a small eye at the bottom right. No blue anywhere (rfCD checks it).
  (function () {
    var CUBE_OUT = 'M2 6 L6 2 H14 V10 L10 14 H2 Z M2 6 H10 V14 M10 6 L14 2';      // visible edges of blk(2, 2, 8, 8, 4)
    var CUBE_HID = 'M6 10 V2 M6 10 H14 M6 10 L2 14';                            // its three hidden edges
    var FACE = { front: 'M2 6 h8 v8 h-8 z', top: 'M2 6 l4 -4 h8 l-4 4 z', right: 'M10 6 l4 -4 v8 l-4 4 z',
      back: 'M6 2 h8 v8 h-8 z', left: 'M2 6 l4 -4 v8 l-4 4 z', bottom: 'M2 14 l4 -4 h8 l-4 4 z' };
    var HDASH = 'stroke-dasharray="1.4 1.1"';
    var SH_F = '#a3a3a3', SH_T = '#cbcbcb', SH_S = '#7d7d7d';                     // shaded cube: front, top, side
    var EYE = p('M8.3 12.4 c1.9 -3 5.4 -3 7.3 0 c-1.9 3 -5.4 3 -7.3 0 z', W, S, 1) + circ(11.95, 12.4, 1.35, B, 'none');
    function viewCube(face) {
      var hidden = face === 'back' || face === 'left' || face === 'bottom';
      return (hidden ? p(FACE[face], 'rgba(245,196,0,0.72)', 'none') : '') + ln(CUBE_HID, M, 0.9, HDASH) +
        (hidden ? '' : p(FACE[face], FY, 'none')) + ln(CUBE_OUT, S, 1.1);
    }
    function shadedCube(color, w) {
      return p(FACE.front, SH_F, color || SH_F, w || 0.4) + p(FACE.top, SH_T, color || SH_T, w || 0.4) + p(FACE.right, SH_S, color || SH_S, w || 0.4);
    }
    I.vZoomFit = I.fit;
    I.vFront = viewCube('front');
    I.vBack = viewCube('back');
    I.vLeft = viewCube('left');
    I.vRight = viewCube('right');
    I.vTop = viewCube('top');
    I.vBottom = viewCube('bottom');
    I.vIso = p('M8 1.5 L14 5 L8 8.5 L2 5 z', FYL, S, 1.1) + p('M2 5 L8 8.5 V15 L2 11.5 z', FY, S, 1.1) + p('M14 5 L8 8.5 V15 L14 11.5 z', FYD, S, 1.1);
    // Normal To: a yellow face with the view arrow square to it (the right-angle mark at its foot)
    I.vNormalTo = p('M1 14.5 l3 -4.5 h11 l-3 4.5 z', FY, S, 1.1) + ln('M8 12.2 V4', S, 1.4) + p('M8 1.2 l-2.4 3.4 h4.8 z', S, S, 0.6) + ln('M8 10.4 h1.7 v1.8', S, 0.8);
    // display styles
    I.dsShadedEdges = shadedCube(S, 1.1);
    I.dsShaded = shadedCube();
    I.dsHLR = ln(CUBE_OUT, S, 1.2);
    I.dsHLV = ln(CUBE_HID, M, 1, HDASH) + ln(CUBE_OUT, S, 1.2);
    I.dsWireframe = ln(CUBE_HID + ' ' + CUBE_OUT, S, 1.1);
    // Background (a gradient frame), Theme (a circle half light, half dark)
    I.vBackground = '<defs><linearGradient id="anvil-ico-bgv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#7a7a7a"/></linearGradient></defs>' +
      p('M2.3 2.5 h11.4 a0.8 0.8 0 0 1 0.8 0.8 v9.4 a0.8 0.8 0 0 1 -0.8 0.8 h-11.4 a0.8 0.8 0 0 1 -0.8 -0.8 v-9.4 a0.8 0.8 0 0 1 0.8 -0.8 z', 'url(#anvil-ico-bgv)', S, 1.2);
    I.vTheme = p('M8 2 A6 6 0 0 0 8 14 z', '#f6f6f6', 'none') + p('M8 2 A6 6 0 0 1 8 14 z', '#3a3a3a', 'none') + circ(8, 8, 6, 'none', S, 1.2);
    // show toggles: planes, origins, sketches, sketch dimensions (each with the eye); grid, closed regions, snap to model
    I.vPlanes = p('M1 10.5 l4 -7.5 h10 l-4 7.5 z', PL, P, 1.2) + EYE;
    I.vOrigins = ln('M3 11 H11 M3 11 V2.5', R, 1.5) + ln('M3 11 l2.8 2.8', B, 1.5) + circ(3, 11, 1.4, S, 'none') + EYE;
    I.vSketches = ln('M2 11.5 V5.5 a2.5 2.5 0 0 1 2.5 -2.5 H13 V8.5 M2 11.5 H7', S, 1.4) + pt(2, 11.5) + pt(13, 3) + EYE;
    I.vSketchDims = ln('M2 1.5 V8.5 M14 1.5 V8.5', M, 0.9) + ln('M2 4.5 H14', S, 1.1) + p('M2 4.5 l2.6 -1.4 v2.8 z M14 4.5 l-2.6 -1.4 v2.8 z', S, S, 0.5) + ln('M1 8.5 H15', S, 1.4) + EYE;
    I.vGrid = ln('M5 2 V14 M8 2 V14 M11 2 V14 M2 5 H14 M2 8 H14 M2 11 H14', M, 0.8) + rect(2, 2, 12, 12, 'none', S, 1.2);
    I.vRegions = p('M2 13.5 V5 a2.5 2.5 0 0 1 2.5 -2.5 H13.5 V13.5 z M10 8 a2 2 0 1 0 -4 0 a2 2 0 1 0 4 0 z', FYL, S, 1.3, 'fill-rule="evenodd"') + pt(2, 13.5) + pt(13.5, 2.5);
    I.vSnapModel = p('M1 12 H15 V15.5 H1 z', F2, 'none') + ln('M1 12 H15', S, 1.4) + ln('M4.5 9.2 V6 a3.5 3.5 0 0 1 7 0 V9.2', R, 2.6) + ln('M4.5 8.2 V9.4 M11.5 8.2 V9.4', M, 2.6) + circ(8, 12, 1.6, FY, FYD, 0.9);
    I.vFeatureTree = I.tree;
  })();
  // rfGZ: Smart Fasteners (a hex-head bolt) and Hole Alignment (two plates whose holes miss the shared axis), for the
  // greyed assembly buttons (ui-panels.js passes them as icon: 'smartFasteners' / 'holeAlignment')
  // rfIL: redrawn so they read as the SolidWorks commands at 16 px: Smart Fasteners = a yellow hex bolt (the inserted
  // fastener, feature yellow) through a grey plate's hole, Hole Alignment = two plates whose hole axes (grey above, red
  // below) miss each other
  I.smartFasteners = rect(1.5, 8.5, 4, 4, F2, S, 1) + rect(10.5, 8.5, 4, 4, F2, S, 1) +
    rect(5.5, 5.5, 5, 9, FYL, S, 1) + ln('M5.5 8 l5 -1 M5.5 10.5 l5 -1 M5.5 13 l5 -1', FYD, 0.9) +
    p('M3.5 1.5 h9 v4 h-9 z', FY, S, 1) + ln('M6.5 1.5 v4 M9.5 1.5 v4', FYD, 0.9);
  I.holeAlignment = p('M1.5 2.5 h5 v4 h-5 z M9.5 2.5 h5 v4 h-5 z', F2, S, 1) + p('M1.5 9.5 h6 v4 h-6 z M10.5 9.5 h4 v4 h-4 z', F1, S, 1) +
    ln('M8 0.5 v8', P, 1, DASH) + ln('M9 7.5 v8', R, 1.5) + ln('M8 8 h1', R, 1);
  // rfFB: Boundary Boss/Base (a yellow body between two profiles, its sides shaped by Direction 2 curves) and Boundary Cut
  I.boundary = p('M2.5 12.5 C2.5 8.5 5.5 7 5.5 3.5 H10.5 C10.5 7 13.5 8.5 13.5 12.5 z', FY, S, 1.1) + ell(8, 12.5, 5.5, 1.7, FYL, S, 1.1) + ell(8, 3.5, 2.5, 0.9, FYL, S, 1.1) + ln('M8 4.4 C8 7.5 8 9 8 14.2', B, 1.1, DASH);
  I.boundaryCut = blk(1.5, 5, 8, 6, 3.5) + p('M3.6 8.4 C4.4 7.6 5.6 7.4 6 5.6 H9.6 C9.4 7 8.8 7.8 8.4 8.4 z', FY, FYD, 1) + ln('M5.5 7.2 C6.8 7 8 6.6 8.2 5.6', B, 0.9, DASH);
  // rfFA: the Curves flyout (SolidWorks' order: Split Line, Projected Curve, Composite Curve, Curve Through XYZ Points,
  // Curve Through Reference Points, Helix and Spiral)
  I.splitLine = p('M1.5 12.5 l3.5 -6 h9 l-3.5 6 z', F1, P, 1) + ln('M3.2 9.5 C6 8 9 11 12.8 9.5', S, 1.4);
  I.projCurve = p('M1.5 14 C5 10 11 10 14.5 14', F2, P, 1) + ln('M3 3 C6 1 10 5 13 3', S, 1.3) + ln('M4 4 V11 M12 4 V11', M, 0.9, DASH) + ln('M3 12.4 C6 10.8 10 10.8 13 12.4', FYD, 1.5);
  I.compositeCurve = ln('M1.5 13 L5.5 6', S, 1.5) + ln('M5.5 6 C7 2.5 10 2.5 11 6', FYD, 1.5) + ln('M11 6 L14.5 12', S, 1.5) + pt(5.5, 6) + pt(11, 6);
  I.xyzCurve = ln('M1.5 12.5 C4 3 8 13 14.5 3.5', S, 1.4) + pt(1.5, 12.5) + pt(5.6, 8) + pt(10, 8.4) + pt(14.5, 3.5) + ln('M10.5 14.5 h4 M10.5 14.5 v-4 M10.5 14.5 l-1.8 1', M, 0.9);
  I.refPtCurve = ln('M1.5 12.5 C4 3 8 13 14.5 3.5', S, 1.4) + [[1.5, 12.5], [7.5, 8.5], [14.5, 3.5]].map(function (q) { return ln('M' + (q[0] - 1.6) + ' ' + q[1] + ' h3.2 M' + q[0] + ' ' + (q[1] - 1.6) + ' v3.2', P, 1); }).join('');
  I.helix = ln('M4 2.5 C13 2.5 13 5 8 5.2 C3 5.4 3 7.8 8 8 C13 8.2 13 10.6 8 10.8 C3 11 3 13.5 12 13.5', S, 1.4) + ln('M8 1 V15', M, 0.8, 'stroke-dasharray="3 1.4 0.6 1.4"');
  // lane forming: the Forming Tool flyout (a grey plate seen at an angle with the yellow form): Dimple, Extruded Hole,
  // Louver (a hood with its dark opening), Lance (a bridge on two legs), Rib (a long rounded ridge)
  I.ftDimple = p('M1 13 l3 -5 h11 l-3 5 z', F2, S, 1) + p('M4.5 10.8 C5 7.2 11 7.2 11.5 10.8 z', FY, FYD, 1);
  I.ftExtrudedHole = p('M1 13 l3 -5 h11 l-3 5 z', F2, S, 1) + p('M5.5 10.6 V5.5 h5 v5.1 z', FY, FYD, 1) + ell(8, 5.5, 2.5, 0.9, W, FYD, 1);
  I.ftLouver = p('M1 13 l3 -5 h11 l-3 5 z', F2, S, 1) + p('M4.5 11 L6 7.5 h6.5 L11 11 z', FY, FYD, 1) + p('M6 7.5 h6.5 l-1 1.6 h-5 z', '#424242', 'none');
  I.ftLance = p('M1 13 l3 -5 h11 l-3 5 z', F2, S, 1) + p('M3.5 11 L5.5 7 h5 L12.5 11 h-1.6 L9.6 8.4 h-3.2 L5.1 11 z', FY, FYD, 1);
  I.ftRib = p('M1 13 l3 -5 h11 l-3 5 z', F2, S, 1) + p('M4.2 11.4 L9.6 7.4 a1 1 0 0 1 2.2 1.2 L6.4 12.6 a1 1 0 0 1 -2.2 -1.2 z', FY, FYD, 1);
  // ---- rfGZ: one weight system for every size. The artwork above is drawn once on the 16 grid; `weigh` re-weights
  // each stroked element for the size it is shown at and the screen's devicePixelRatio, so a 32 px ribbon icon no
  // longer doubles every outline (2.5 px black borders) and a 16 px tree icon keeps 1 px lines. Classes, by the drawn
  // width w (16-grid units) and whether the element is filled:
  //   outline  filled shape with a stroke  -> 1 CSS px at 16-20 px, 1.2 CSS px at 24-32 px, in EDGE (a fixed dark grey,
  //            not the ink: the fills are fixed colours, so a theme-coloured outline vanished into them on dark panels)
  //   self     filled with its own colour as the stroke (arrow heads, dots) -> unchanged
  //   bold     w >= 1.9 (accent strokes: the yellow edge of Fillet, a check mark, a sweep path) -> w at 16, 0.7 w at 32
  //   hero     1.3 <= w < 1.9 (the main sketch entity) -> 1.25 CSS px at 16-20 px, 2 CSS px at 24-32 px
  //   fine     0.85 <= w < 1.3 (secondary lines, dimensions) -> 1 CSS px at 16-20 px, 1.5 CSS px at 24-32 px
  //   hair     w < 0.85 (hatching, thin details) -> as drawn, never above 1 CSS px
  // The result is rounded to whole device pixels (half rounds down), then nudged by under half a device pixel so a
  // 1 px line on a half-unit coordinate lands on a pixel row instead of straddling two (only when the scale from the
  // 16 grid to device pixels is a whole number: 16 px at 1x / 2x, 32 px at 1x / 1.5x / 2x). The viewBox stays 0 0 16 16.
  var EDGE = '#464646', INK2 = '0.7';
  // paper (white sheets, documents, balloons) takes the panel colour, so on a dark panel a sheet is an inked outline
  // instead of a glaring white box; a drawing view's grey (#c4c4c4, drawing icons) is the ink at 35 %. Both keep the
  // ink outline (not EDGE), which is what shows on the dark panel.
  var PAPER = /^#(fff|ffffff|f4f4f4)$/i, VIEW = /^#c4c4c4$/i;
  var WEIGHT = { outline: [1, 1.2], hero: [1.25, 2], fine: [1, 1.5], boldLarge: 0.7 };
  var SHAPE_RE = /<(path|rect|circle|ellipse|line|polyline|polygon)\b([^>]*?)\s*(\/?)>/g;
  function attr(a, n) { var m = new RegExp('(?:^|\\s)' + n + '="([^"]*)"').exec(a); return m ? m[1] : null; }
  function setAttr(a, n, v) {
    var re = new RegExp('(^|\\s)' + n + '="[^"]*"');
    return re.test(a) ? a.replace(re, '$1' + n + '="' + v + '"') : a + ' ' + n + '="' + v + '"';
  }
  function num(v) { return String(Math.round(v * 1000) / 1000); }
  // the class and target width (CSS px) of one stroke drawn w wide on the 16 grid, shown at size px
  function strokeClass(w, filled, self, size) {
    // rfIA: above 32 px (an enlarged CommandManager) every class grows with the size, so a 64 px icon is the 32 px one
    // scaled up (2.5 / 4 px lines), not the same 1-2 px hairlines on a bigger drawing
    var s = size / 16, big = size >= 24 ? 1 : 0, up = size > 32 ? size / 32 : 1;
    if (filled && self) return ['self', w * s];
    if (filled) return ['outline', WEIGHT.outline[big] * up];
    if (w >= 1.9) return ['bold', w * s * (big ? WEIGHT.boldLarge : 1)];
    if (w >= 1.3) return ['hero', WEIGHT.hero[big] * up];
    if (w >= 0.85) return ['fine', WEIGHT.fine[big] * up];
    return ['hair', Math.min(w * s, up)];
  }
  function ratio() { return (typeof window !== 'undefined' && window.devicePixelRatio) || 1; }
  // the offset (16-grid units) that puts a line of dw device px at coordinate c on whole pixels, at k device px per unit
  function nudge(c, dw, k) {
    if (c == null || isNaN(c)) return 0;
    var want = Math.round(dw) % 2 ? 0.5 : 0, at = c * k - Math.floor(c * k), d = want - at;
    if (d > 0.5) d -= 1; if (d <= -0.5) d += 1;
    return Math.abs(d) < 0.02 ? 0 : d / k;
  }
  // rfIL: pixel hinting. One translate per element (the nudge above) only works when every vertex shares one fraction
  // and the scale is a whole number of device px per grid unit; at 24 px on a 100 % screen (1.5 px a unit) or 16 px at
  // 125 % a rectangle's far edge lands half a pixel off whatever the shift. snapper(k, want, off) moves one coordinate
  // (grid units, `off` = the CENTRE shift around the body) to the nearest device position whose fraction is `want`
  // (0.5 centres an odd-width stroke on a pixel row, 0 puts an even one or a fill edge between rows).
  function snapper(k, want, off) {
    return function (c, axis) { var o = off[axis]; return (Math.floor((c + o) * k - want + 0.5) + want) / k - o; };
  }
  var PATH_TOK = /[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g, PATH_N = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  // the path's d rewritten in absolute coordinates with every vertex snapped (curve handles follow their end points,
  // arcs keep their radii); null when the d does not parse, so the element is left as drawn
  function hintD(d, snap) {
    var t = String(d).match(PATH_TOK), out = [], i = 0, cmd = null, x = 0, y = 0, sx = 0, sy = 0, px = 0, py = 0;
    if (!t || !/^[Mm]$/.test(t[0])) return null;
    function n() { var v = parseFloat(t[i++]); if (isNaN(v)) throw 0; return v; }
    function pair(rel) { var a = n(), b = n(); return rel ? [x + a, y + b] : [a, b]; }
    try {
      while (i < t.length) {
        if (/[a-zA-Z]/.test(t[i])) cmd = t[i++];
        else if (!cmd || PATH_N[cmd.toUpperCase()] === 0) return null;
        var U = cmd.toUpperCase(), rel = cmd !== U, e, c1, c2, dx0, dy0;
        if (PATH_N[U] == null) return null;
        // the snapped current point's shift, for the first handle of a curve
        dx0 = px - x; dy0 = py - y;
        if (U === 'Z') { out.push('Z'); x = sx; y = sy; px = snap(x, 0); py = snap(y, 1); continue; }
        if (U === 'H') { x = rel ? x + n() : n(); px = snap(x, 0); out.push('H' + num(px)); continue; }
        if (U === 'V') { y = rel ? y + n() : n(); py = snap(y, 1); out.push('V' + num(py)); continue; }
        if (U === 'A') {
          var ar = [n(), n(), n(), n(), n()]; e = pair(rel);
          x = e[0]; y = e[1]; px = snap(x, 0); py = snap(y, 1);
          out.push('A' + ar.map(num).join(' ') + ' ' + num(px) + ' ' + num(py)); continue;
        }
        if (U === 'C') { c1 = pair(rel); c2 = pair(rel); }
        else if (U === 'S' || U === 'Q') c2 = pair(rel);
        e = pair(rel);
        x = e[0]; y = e[1]; px = snap(x, 0); py = snap(y, 1);
        var ex = px - x, ey = py - y, s2 = [];
        if (c1) s2.push(num(c1[0] + dx0), num(c1[1] + dy0));
        if (c2) s2.push(num(c2[0] + (U === 'Q' ? (dx0 + ex) / 2 : ex)), num(c2[1] + (U === 'Q' ? (dy0 + ey) / 2 : ey)));
        s2.push(num(px), num(py));
        out.push(U + s2.join(' '));
        if (U === 'M') { sx = x; sy = y; cmd = rel ? 'l' : 'L'; }
        c1 = c2 = null;
      }
    } catch (err) { return null; }
    return out.join(' ');
  }
  function hint(tag, a, snap) {
    if (tag === 'path') { var d = hintD(attr(a, 'd'), snap); return d ? setAttr(a, 'd', d) : null; }
    var x = parseFloat(attr(a, 'x')), y = parseFloat(attr(a, 'y')), w = parseFloat(attr(a, 'width')), h = parseFloat(attr(a, 'height'));
    if ([x, y, w, h].some(isNaN) || attr(a, 'rx')) return null;
    var x0 = snap(x, 0), y0 = snap(y, 1), x1 = snap(x + w, 0), y1 = snap(y + h, 1);
    if (x1 <= x0 || y1 <= y0) return null;
    return setAttr(setAttr(setAttr(setAttr(a, 'x', num(x0)), 'y', num(y0)), 'width', num(x1 - x0)), 'height', num(y1 - y0));
  }
  function weigh(body, size, dpr) {
    var s = size / 16, k = s * dpr, whole = Math.abs(k - Math.round(k)) < 0.01;
    // the CENTRE shift wrapped around the body (icon `body()`), which moves every vertex by whole grid units
    var g0 = /^<g transform="translate\((-?[\d.]+) (-?[\d.]+)\)">/.exec(body), off = g0 ? [+g0[1], +g0[2]] : [0, 0];
    return body.replace(SHAPE_RE, function (all, tag, a, close) {
      var stroke = attr(a, 'stroke');
      if (!stroke || stroke === 'none') {
        // a filled rect with no stroke (sketch points): its edges between device pixels
        var hf = tag === 'rect' && attr(a, 'fill') && attr(a, 'fill') !== 'none' && !attr(a, 'transform') ? hint(tag, a, snapper(k, 0, off)) : null;
        return hf ? '<' + tag + hf + (close ? '/' : '') + '>' : all;
      }
      var fill = attr(a, 'fill'), filled = fill != null && fill !== 'none';
      var w = parseFloat(attr(a, 'stroke-width') || '1');
      var c = strokeClass(w, filled, fill === stroke, size);
      var dw = c[1] * dpr;
      if (c[0] !== 'self' && c[0] !== 'hair') dw = Math.max(1, Math.ceil(dw - 0.5));
      a = setAttr(a, 'stroke-width', num(dw / dpr / s));
      if (c[0] === 'outline' && stroke === 'currentColor' && !PAPER.test(fill) && !VIEW.test(fill)) a = setAttr(a, 'stroke', EDGE);
      var crisp = dw >= 1 && Math.abs(dw - Math.round(dw)) < 0.01 && !attr(a, 'transform');
      // rfIL: paths and rects are hinted vertex by vertex at every scale (24 px at 1x, 16 px at 125 / 150 %, …)
      if (crisp && (tag === 'path' || tag === 'rect')) {
        var hinted = hint(tag, a, snapper(k, Math.round(dw) % 2 ? 0.5 : 0, off));
        if (hinted) return '<' + tag + hinted + (close ? '/' : '') + '>';
      }
      if (whole && crisp && tag !== 'circle' && tag !== 'ellipse') {
        var x = null, y = null;
        if (tag === 'rect') { x = parseFloat(attr(a, 'x')); y = parseFloat(attr(a, 'y')); }
        else { var m = /^\s*M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(attr(a, 'd') || ''); if (m) { x = parseFloat(m[1]); y = parseFloat(m[2]); } }
        var tx = nudge(x, dw, k), ty = nudge(y, dw, k);
        if (tx || ty) a += ' transform="translate(' + num(tx) + ' ' + num(ty) + ')"';
      }
      return '<' + tag + a + (close ? '/' : '') + '>';
    });
  }
  // icon.svg(body, size, cls): the <svg> for any 16-grid body (the drawing documents' own icons come through here)
  // A size just above a whole multiple of 16 device px (18 px small ribbon buttons at 1x: 1.125 px per unit, every line
  // blurred) is drawn at that multiple and centred on whole pixels instead (16 px inside the 18 px box).
  function svg(body, size, cls) {
    size = size || 32;
    var dpr = ratio(), k = size / 16 * dpr, n = Math.floor(k + 1e-6), inner;
    if (n >= 1 && k - n > 0.01 && k / n - 1 <= 0.13) {
      var off = Math.floor((size * dpr - 16 * n) / 2) / k;
      inner = '<g transform="translate(' + num(off) + ' ' + num(off) + ') scale(' + num(n / k) + ')">' + weigh(body, size * n / k, dpr) + '</g>';
    } else inner = weigh(body, size, dpr);
    // the secondary ink (B: sketch points, dimension arrows, a drawing icon's second colour) follows the theme too:
    // the ink at 70 % (#737373 on the light ribbon, #a5a5a5 on the dark one; a fixed #6d6d6d all but vanished on dark)
    inner = inner.replace(/(\s)(fill|stroke)="#6d6d6d"/g, '$1$2="currentColor" $2-opacity="' + INK2 + '"')
      .replace(/(\s)fill="(#fff|#ffffff|#f4f4f4)"/gi, '$1fill="$2" style="fill:var(--icon-paper, var(--panel, #fff))"')
      .replace(/(\s)fill="#c4c4c4"/gi, '$1fill="currentColor" fill-opacity="0.35"');
    return '<svg class="ico ' + (cls || '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 16 16" aria-hidden="true" data-wt="1">' + inner + '</svg>';
  }
  // rfGZ: optical centring. Whole-unit shifts (so the pixel snapping above still holds) that put each drawing's box
  // within a unit of the grid's centre: blocks drawn sitting low, strips drawn at the bottom, glyphs drawn to one side.
  // Measured with getBBox over every icon (the lane's audit); a new icon should be drawn centred instead of added here.
  var CENTRE = {"cut":[0,-2],"sweep":[0,-1],"fillet":[0,-1],"chamfer":[0,-1],"imported":[0,-1],"shell":[0,-2],"rib":[0,-2],"refgeo":[0,-2],"plane":[0,-1],"planeSmall":[0,-1],"origin":[0,-1],"csys":[0,-1],"refPoint":[0,-1],"instant":[1,0],"instant2D":[0,-1],"sketch":[0,-2],"exitSketch":[0,-1],"parallelLine":[-1,-1],"tangentLine":[0,-2],"tangentCircle":[1,-1],"crect3":[0,-1],"arc3":[0,-1],"tarc":[1,-3],"aslot":[0,-3],"slotLenCC":[0,-3],"slotLenAll":[0,-3],"pellipse":[0,-1],"convert":[0,-2],"sketchPattern":[0,-1],"skChamfer":[0,-1],"moveEnt":[-1,0],"rotateEnt":[-1,3],"stretchEnt":[0,-2],"intersectCurve":[0,-2],"relPattern":[0,-1],"relParallel":[-1,0],"relFix":[0,1],"horizDim":[0,-1],"vertDim":[-1,0],"hem":[0,-4],"jog":[0,-1],"sketchedBend":[0,-1],"breakCorner":[0,-2],"lenOuter":[-1,0],"lenInner":[-1,0],"lenTangent":[-1,0],"hemClosed":[1,0],"hemTeardrop":[1,0],"hemInside":[1,0],"undercut":[0,-1],"perfEval":[0,-2],"convertSM":[0,-2],"formingTool":[0,-2],"fold":[0,-1],"rip":[0,-2],"section":[2,0],"checkSketch":[-1,0],"repairSketch":[-1,0],"undo":[-1,0],"redo":[1,0],"orient":[0,-1],"display":[0,-2],"select":[-1,0],"filter":[0,-1],"part":[0,-1],"body":[0,-1],"folder":[0,-1],"assembly":[0,-1],"insertComponent":[0,-2],"mate":[-1,0],"component":[0,-1],"matesFolder":[0,-1],"moveComponent":[-1,-1],"explode":[0,-1],"explodeStep":[0,-1],"fix":[-1,0],"sketch3dPlane":[0,-2],"eqnCurve":[1,-2],"rapidSketch":[0,-2],"edgeSel":[0,-2],"faceSel":[0,-2],"vertexSel":[0,-2],"weldSymbol":[0,-3],"revisionCloud":[-1,0],"angRunDim":[-1,0],"pathLengthDim":[0,-2],"autodim":[0,2],"tProject":[-1,0],"tMoveOrigin":[0,-1],"tOffsetEntity":[-1,0],"tDistribute":[0,-1],"tScale":[1,0],"vPlanes":[-1,0],"vOrigins":[-1,0],"vSketchDims":[-1,0],"vSnapModel":[0,-1],"boundaryCut":[0,-2],"splitLine":[0,-1],"xyzCurve":[0,-1]};
  function body(name) {
    var b = I[name] || I.generic, c = CENTRE[name];
    return c ? '<g transform="translate(' + c[0] + ' ' + c[1] + ')">' + b + '</g>' : b;
  }
  function icon(name, size, cls) { return svg(body(name), size, cls); }
  icon.has = function (name) { return !!I[name]; };
  icon.svg = svg;
  icon.weigh = weigh;
  icon.strokeClass = strokeClass;
  icon.names = function () { return Object.keys(I); };
  icon.raw = function (name) { return I[name] ? body(name) : null; };
  // node(name, size) -> a fresh <svg> element cloned from a parsed template (a long FeatureManager tree builds
  // hundreds of icons per refresh; cloning is about four times cheaper than parsing the markup every time)
  function nodeOf(fn) {
    var cache = {};
    return function (name, size, cls) {
      var key = name + '|' + (size || 32) + '|' + (cls || '') + '|' + ratio();
      var t = cache[key];
      if (!t) {
        var box = document.createElement('div');
        box.innerHTML = fn(name, size, cls);
        t = cache[key] = box.firstChild;
      }
      return t.cloneNode(true);
    };
  }
  icon.node = nodeOf(icon);
  // rfGZ: drawing-ui.js and drawing-ui-sketch.js wrap the global (`var base = Icons; Icons = function (n, s, c) { …
  // own icons … else base(n, s, c) }`). `Icons` is an accessor on window: reading it gives a front for the latest
  // wrapper that weighs any <svg> the wrapper drew itself (not marked data-wt) and keeps has / node / svg / names.
  var fronts = [];
  function frontFor(fn) {
    for (var i = 0; i < fronts.length; i++) if (fronts[i][0] === fn) return fronts[i][1];
    var f = fn === icon ? icon : function (name, size, cls) {
      var out = fn(name, size, cls);
      if (typeof out !== 'string' || out.indexOf('data-wt="1"') >= 0) return out;
      var m = /^(<svg\b[^>]*?)>([\s\S]*)<\/svg>$/.exec(out);
      if (!m || m[1].indexOf('viewBox="0 0 16 16"') < 0) return out;
      var sz = parseFloat((/\swidth="([\d.]+)"/.exec(m[1]) || [])[1]) || 32;
      return svg(m[2], sz, ((/\sclass="ico ?([^"]*)"/.exec(m[1]) || [])[1] || '').trim());
    };
    if (f !== icon) {
      f.has = function (name) { return fn.has ? fn.has(name) : icon.has(name); };
      f.svg = svg; f.weigh = weigh; f.strokeClass = strokeClass; f.names = icon.names; f.raw = icon.raw;
      f.node = nodeOf(f);
    }
    fronts.push([fn, f]);
    return f;
  }
  return { icon: icon, frontFor: frontFor };
})();
(function (lib) {
  var current = lib.icon;
  var g = typeof window !== 'undefined' ? window : this;
  Object.defineProperty(g, 'Icons', {
    configurable: true, enumerable: true,
    get: function () { return lib.frontFor(current); },
    set: function (fn) { if (typeof fn === 'function') current = fn; }
  });
})(IconsLib);
