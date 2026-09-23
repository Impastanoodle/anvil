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
    fillet: p('M2 14 V7.5 a4.5 4.5 0 0 1 4.5 -4.5 H14 V14 z', F2, S) + ln('M2 7.5 a4.5 4.5 0 0 1 4.5 -4.5', G, 2.2),
    chamfer: p('M2 14 V7.5 l4.5 -4.5 H14 V14 z', F2, S) + ln('M2 7.5 l4.5 -4.5', G, 2.2),
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
    curves: ln('M2 12 C5 2 11 14 14 4', B, 1.5),
    instant: ln('M8 2.5 v11 M2.5 8 h11', S) + ln('M8 2.5 l-2 2 M8 2.5 l2 2 M13.5 8 l-2 -2 M13.5 8 l-2 2', B, 1.25),
    // ---- sketch (yellow pencil, blue entities)
    sketch: SHEET + PENCIL,
    exitSketch: SHEET + ln('M3.5 9 h6.5 M7.5 6.5 l2.5 2.5 -2.5 2.5', G, 1.7) + ln('M10.5 13 L14 9.5', S, 3.4) + ln('M10.5 13 L14 9.5', Y, 2.2),
    dim: ln('M2 11.5 h12 M2 9 v5 M14 9 v5', S, 1.1) + ln('M2 11.5 l2.5 -1.4 M2 11.5 l2.5 1.4 M14 11.5 l-2.5 -1.4 M14 11.5 l-2.5 1.4', B, 1.2) + txt(8, 7.5, 6, '10'),
    line: ln('M2.5 13 L13.5 3', B, 1.5) + circ(2.5, 13, 1.2, S, 'none') + circ(13.5, 3, 1.2, S, 'none'),
    rect: rect(2.5, 4, 11, 8, 'none', B, 1.5) + circ(2.5, 4, 1.2, S, 'none') + circ(13.5, 12, 1.2, S, 'none'),
    crect: rect(2.5, 4, 11, 8, 'none', B, 1.5) + ln('M6.5 8 h3 M8 6.5 v3', S, 1.1),
    circle: circ(8, 8, 5.5, 'none', B, 1.5) + ln('M6.5 8 h3 M8 6.5 v3', S, 1.1),
    arc: ln('M5 3 A8 8 0 0 1 13 11', B, 1.5) + ln('M3.5 11 h3 M5 9.5 v3', S, 1.1),
    polygon: ln('M8 2 l5.2 3 v6 l-5.2 3 l-5.2 -3 v-6 z', B, 1.5),
    slot: ln('M5 5 h6 a3 3 0 0 1 0 6 h-6 a3 3 0 0 1 0 -6 z', B, 1.5) + ln('M5 8 h6', S, 0.9, DASH),
    spline: ln('M2 12.5 C5 1 10 15 14 3.5', B, 1.5) + circ(2, 12.5, 1.1, S, 'none') + circ(14, 3.5, 1.1, S, 'none'),
    ellipse: ell(8, 8, 6, 3.8, 'none', B, 1.5),
    point: circ(8, 8, 1.6, B, 'none') + ln('M8 3 v2.5 M8 10.5 v2.5 M3 8 h2.5 M10.5 8 h2.5', S, 1.1),
    text: txt(8, 12.5, 12, 'A', S, 'Georgia, serif', 600),
    trim: ln('M2 5 h12 M2 11 h12', B, 1.5) + ln('M8 2 v12', S, 0.9, DASH) + ln('M6 9.5 l2 -3 2 3', R, 1.5),
    convert: rect(2.5, 2.5, 11, 11, F2, S) + rect(5, 5, 6, 6, 'none', B, 1.5),
    offset: rect(4, 4, 8, 8, 'none', B, 1.5) + rect(1.5, 1.5, 13, 13, 'none', S, 1, DASH),
    mirrorEnt: ln('M8 2 v12', S, 0.9, DASH) + ln('M6 4.5 L2.5 11.5 h3.5 z', B, 1.4) + ln('M10 4.5 L13.5 11.5 h-3.5 z', B, 1.4, 'stroke-dasharray="1.5 1.5"'),
    sketchPattern: circ(3.5, 8, 1.8, 'none', B, 1.4) + circ(8, 8, 1.8, 'none', B, 1.4) + circ(12.5, 8, 1.8, 'none', B, 1.4) + ln('M2 12.5 h12', S, 0.9, DASH),
    relations: ln('M2.5 4.5 h11 M2.5 11.5 h11', B, 1.5) + ln('M5.5 6.5 v3 M10.5 6.5 v3', S, 1.25),
    // ---- sheet metal (green sheet)
    flange: p(FLANGE_L, G, S) + ln('M2 12 h6.5 a3.5 3.5 0 0 0 3.5 -3.5 V2.5', Y, 1, 'stroke-dasharray="1.6 1.2"'),
    bend: p('M2 10.5 h6.5 v3 H2 z', F2, S) + p('M8.5 10.5 a2 2 0 0 0 2 -2 V2.5 h3 V8.5 a5 5 0 0 1 -5 5 v-3 z', G, S) + ln('M8.5 10.5 v3', B, 1.2),
    miter: p('M1.5 12.5 L5.5 9.5 h8 l-4 3 z', F2, S) + p('M5.5 9.5 v-5 h8 v5 z', G, S) + p('M13.5 9.5 l-4 3 v-5 l4 -3 z', GD, S) + ln('M13.5 4.5 v5', B, 1.2, DASH),
    hem: p('M2 9 h9 a2.5 2.5 0 0 1 0 5 h-5 v-2 h5 a0.5 0.5 0 0 0 0 -1 H2 z', G, S),
    jog: p('M1.5 12.5 h4 l4 -6 h5 v-2.5 h-6 l-4 6 h-3 z', G, S),
    flatten: p('M1.5 12 l3 -8 h10 l-3 8 z', GL, S) + ln('M5.5 12 l3 -8 M9 12 l3 -8', B, 1, DASH),
    // ---- evaluate
    measure: p('M2 12 L12 2 l2 2 L4 14 z', Y, S) + ln('M4.5 9.5 l1 1 M6.5 7.5 l1 1 M8.5 5.5 l1 1 M10.5 3.5 l1 1', S, 1),
    mass: p('M8 2.5 l5.5 3.2 -2 7.3 h-7 l-2 -7.3 z', F2, S) + circ(8, 8, 1.3, R, 'none') + ln('M8 4.5 v7 M4.5 8 h7', B, 0.9),
    section: blk(1.5, 4.5, 9, 7, 3.5) + ln('M1.5 2.5 L14.5 14', R, 1.5),
    sensor: circ(8, 8, 5, 'none', S) + ln('M8 8 l3 -3', R, 1.5) + circ(8, 8, 0.9, S, 'none'),
    check: ln('M2.5 8.5 l3.5 3.5 L13.5 4.5', G, 2.2),
    zebra: circ(8, 8, 5.5, F2, S) + ln('M3.5 5.5 c3 1.2 6 1.2 9 0 M3 8 c3 1.2 7 1.2 10 0 M3.5 10.5 c3 1.2 6 1.2 9 0', S, 1),
    dxf: rect(2.5, 1.5, 11, 13, W, S, 1.1, 'rx="0.8"') + ln('M5 4.5 h6 M5 6.5 h6 M5 8.5 h4', L, 0.9) + txt(8, 12.8, 4.2, 'DXF', B, null, 700),
    // ---- view (heads-up toolbar)
    fit: ln('M2.5 5.5 V2.5 h3 M10.5 2.5 h3 v3 M13.5 10.5 v3 h-3 M5.5 13.5 h-3 v-3', S, 1.25) + rect(5.5, 5.5, 5, 5, PL, B, 1.2),
    zoomArea: circ(7, 7, 4, 'none', S) + ln('M10 10 l3.5 3.5', S, 2) + rect(5, 5, 4, 4, 'none', B, 1, 'stroke-dasharray="1.2 1.2"'),
    prevView: ln('M10 3 L5 8 l5 5', S, 1.8),
    orient: blk(2, 3.5, 6, 5, 2.5) + circ(11.5, 11.5, 3, W, B, 1.1) + ln('M11.5 9.8 v1.7 l1.2 0.7', B, 1.1),
    display: blk(1.5, 4.5, 9, 7, 3.5, '#b3bfcc', '#dbe2ea', '#8d9bac'),
    hideshow: ln('M1.5 8 c3 -5 10 -5 13 0 c-3 5 -10 5 -13 0 z', S, 1.25) + circ(8, 8, 2.2, B, 'none'),
    appearance: circ(8, 8, 6, F2, S) + circ(6, 6.3, 1.2, R, 'none') + circ(9.6, 5.4, 1.2, B, 'none') + circ(10.2, 9.2, 1.2, G, 'none') + circ(6.4, 10.3, 1.2, Y, 'none'),
    scene: rect(2, 3, 12, 10, W, S, 1.1, 'rx="0.6"') + ln('M2 11 l4 -3.5 3 2.5 2 -1.5 3 2.5', B, 1.2) + circ(11, 5.5, 1.1, Y, 'none'),
    settings: circ(8, 8, 2, 'none', S) + ln('M8 2 v2 M8 12 v2 M2 8 h2 M12 8 h2 M3.8 3.8 l1.4 1.4 M10.8 10.8 l1.4 1.4 M3.8 12.2 l1.4 -1.4 M10.8 5.2 l1.4 -1.4', S, 1.25),
    // ---- FeatureManager tabs, task pane, misc
    tree: ln('M3 3 h3 M3 6 h2 M5 6 h5 M3 9 h2 M5 9 h5 M5 12 h2 M7 12 h4', B, 1.2) + ln('M4 3 v9', S, 1.2),
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
    material: p('M3 13 l5 -9 h5 l-5 9 z', '#f0c987', S, 1),
    folder: p('M2 4 h4 l1.5 1.5 H14 v8 H2 z', '#f3cf6b', S, 1),
    annotations: p('M3 13 V3.5 h6 l3 3 V13 z', W, S, 1) + ln('M5 7.5 h5 M5 9.5 h4', B, 1)
  };
  function icon(name, size, cls) {
    var body = I[name] || I.generic;
    size = size || 32;
    return '<svg class="ico ' + (cls || '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 16 16" aria-hidden="true">' + body + '</svg>';
  }
  icon.has = function (name) { return !!I[name]; };
  return icon;
})();
