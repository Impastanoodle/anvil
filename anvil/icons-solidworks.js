// icons-solidworks.js — the icon set of the SolidWorks interface profile, the default (rfMD, 2026-11-12). Loaded after
// icons.js. Original artwork in the visual language of the user's own SOLIDWORKS 2024 screenshots (never traced):
//   bodies               white to light-grey shaded solids with a 1 px near-black outline
//   what a command makes the feature's own faces in three blues (lit, front, side) with a navy outline; a cut shows
//                        its blue inner walls
//   sketch entities      a blue line (1 px at 16, 2 px at 24 and 32) with small white square points outlined dark;
//                        the other entity a command refers to is mid grey
//   sheet metal          white plates with the new flange / bend in blue
//   documents            the part and the assembly are yellow blocks; paper is white with a dark outline
//   state                green and red for OK / Cancel, the rebuild light and the arrow of Open; the Options gear and
//                        annotation marks in dark grey; yellow for the ruler of Instant3D and the pencil
// The palette was sampled from the screenshots (GetPixel). Two layers, as in icons-mastercam.js:
//   OWN[name]            a drawing made for this set (a string, or [small, large] when 16 px needs a simpler drawing)
//   restyle(body)        every other icon: Anvil's drawing re-inked with the same palette and rules (grey solids ->
//                        white bodies, the feature yellow -> blue with a navy outline, ink entities -> the sketch blue,
//                        grey sketch points -> white squares), so a tab reads as one family
// icons.js asks the set through Icons.sets; ui-profiles.js turns it on for a profile whose `icons` section names it.
// How to add or change an icon: docs/areas/ui-core.md *Look: the SolidWorks icon set (rfMD)*.
(function () {
  'use strict';
  if (typeof Icons === 'undefined' || !Icons.sets) return;

  // ---- palette (sampled from the screenshots)
  var OL = '#323232';                                                    // the outline of a body, of paper, of a point
  var W1 = '#fefefe', W2 = '#f0f0f0', W3 = '#d6d6d6', W4 = '#b9babc';     // body faces: lit (top), front, side, deep shade
  var NV = '#003755';                                                    // the outline of a blue feature
  var B1 = '#95daf4', B2 = '#69acca', B3 = '#3e87a8', B4 = '#0b6186';     // feature faces: lit, front, side, deep
  var SK = '@SK';                                                        // the sketch line: #2f7ca3 with a little of the ink mixed in
  var SKF = '#2f87ac';                                                   // the same blue as a fixed colour (edges on a body)
  var Y1 = '#fdef94', Y2 = '#f9e35e', Y3 = '#f7cb20', YO = '#8b6420';     // the part / assembly block, rulers, the pencil
  var G1 = '#58c858', G2 = '#18a808', GO = '#1e5500';                     // OK, the arrow of Open, the rebuild light
  var R1 = '#fd2424', R2 = '#d83828', RO = '#811917';                     // Cancel, errors, the rebuild light
  var OR = '#983808';                                                    // the outline of a lightning bolt / spark
  var GR = '#a8a9aa', GD = '#787878', GL = '#ced0d3';                     // neutral: the gear, the other entity, light metal
  var PAPER = '#ffffff';                                                 // paper (icons.js maps it to the panel colour)
  var INK = 'currentColor';                                              // dimension lines, arrows, glyphs (the theme's icon ink)
  var DASH = 'stroke-dasharray="2 1.4"', DASHDOT = 'stroke-dasharray="3 1.2 1 1.2"';

  function r2(v) { return String(Math.round(v * 100) / 100); }
  // one stroke attribute per element; BUTT (as `x`) gives square ends (a tube's cut face, an edge on a body)
  var BUTT = '@butt';
  function st(c, w, x) {
    var butt = x && x.indexOf(BUTT) >= 0;
    if (butt) x = x.replace(BUTT, '').trim();
    return 'stroke="' + c + '" stroke-width="' + w + '" stroke-linejoin="round" stroke-linecap="' + (butt ? 'butt' : 'round') + '"' + (x ? ' ' + x : '');
  }
  function P(d, fill, c, w, x) { return '<path d="' + d + '" fill="' + (fill || 'none') + '" ' + st(c || OL, w || 1, x) + '/>'; }
  // a sketch entity (1.5 = 1 px at 16, 2 px at 24 / 32); c / w for the other entity (GD, 1.1) or an ink line
  function L(d, c, w, x) { return '<path d="' + d + '" fill="none" ' + st(c || SK, w || 1.5, x) + '/>'; }
  // a thin ink line (dimension, axis, leader)
  function T(d, x) { return '<path d="' + d + '" fill="none" ' + st(INK, 0.9, x) + '/>'; }
  // a face of a body (white family, dark outline) and a face of the feature (blue family, navy outline)
  function W(d, fill) { return P(d, fill || W1, OL, 1); }
  function U(d, fill) { return P(d, fill || B2, NV, 1); }
  // a fill with no outline (a highlight, a shade on a face)
  function F(d, fill) { return '<path d="' + d + '" fill="' + fill + '" stroke="none"/>'; }
  function R(x, y, w, h, fill, c, sw, x2) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + (fill || 'none') + '" ' + st(c || OL, sw || 1, x2) + '/>'; }
  function C(cx, cy, r, fill, c, w, x) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + (fill || 'none') + '" ' + (c === 'none' ? 'stroke="none"' : st(c || SK, w || 1.5, x)) + '/>'; }
  function E(cx, cy, rx, ry, fill, c, w, x) { return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + (fill || 'none') + '" ' + (!c || c === 'none' ? 'stroke="none"' : st(c, w || 1)) + (x ? ' ' + x : '') + '/>'; }
  // a sketch point: a white square outlined dark (3 px at 16, 5 px at 32); put it on half units
  function pt(x, y) { return '<rect x="' + r2(x - 1) + '" y="' + r2(y - 1) + '" width="2" height="2" fill="' + W1 + '" ' + st(OL, 1) + '/>'; }
  // the centre mark of an arc or a circle: a small grey x
  function cx(x, y) { return '<path d="M' + r2(x - 1) + ' ' + r2(y - 1) + ' l2 2 M' + r2(x + 1) + ' ' + r2(y - 1) + ' l-2 2" fill="none" ' + st(GR, 0.8) + '/>'; }
  // an oblique block: the front face w x h at (x, y + d), the top and the right side receding by d
  function box(x, y, w, h, d, front, top, side, ol) {
    var y0 = y + d;
    return P('M' + x + ' ' + y0 + ' h' + w + ' v' + h + ' h-' + w + ' z', front, ol, 1) +
      P('M' + x + ' ' + y0 + ' l' + d + ' -' + d + ' h' + w + ' l-' + d + ' ' + d + ' z', top, ol, 1) +
      P('M' + (x + w) + ' ' + y0 + ' l' + d + ' -' + d + ' v' + h + ' l-' + d + ' ' + d + ' z', side, ol, 1);
  }
  function wbox(x, y, w, h, d) { return box(x, y, w, h, d, W2, W1, W3, OL); }
  function ubox(x, y, w, h, d) { return box(x, y, w, h, d, B2, B1, B3, NV); }
  // an arrow from (x1, y1) to its point at (x2, y2)
  function head(x2, y2, ux, uy, c, hs) { hs = hs || 2.4; var bx = x2 - ux * hs, by = y2 - uy * hs, nx = -uy * hs * 0.55, ny = ux * hs * 0.55; c = c || INK; return '<path d="M' + r2(x2) + ' ' + r2(y2) + ' L' + r2(bx + nx) + ' ' + r2(by + ny) + ' L' + r2(bx - nx) + ' ' + r2(by - ny) + ' z" fill="' + c + '" stroke="' + c + '" stroke-width="0.3" stroke-linejoin="round"/>'; }
  function ar(x1, y1, x2, y2, c, w, hs) {
    c = c || INK; hs = hs || 2.4;
    var dx = x2 - x1, dy = y2 - y1, l = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / l, uy = dy / l;
    return '<path d="M' + r2(x1) + ' ' + r2(y1) + ' L' + r2(x2 - ux * hs) + ' ' + r2(y2 - uy * hs) + '" fill="none" ' + st(c, w || 1.1) + '/>' + head(x2, y2, ux, uy, c, hs);
  }
  // a block arrow with an outline (the blue arrow of Instant3D, the green arrow of Open): from the tail (x1, y1) to the point (x2, y2)
  function barrow(x1, y1, x2, y2, sw, hw, hl, fill, ol) {
    var dx = x2 - x1, dy = y2 - y1, l = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux, bx = x2 - ux * hl, by = y2 - uy * hl;
    function q(px, py) { return r2(px) + ' ' + r2(py); }
    return P('M' + q(x1 + nx * sw, y1 + ny * sw) + ' L' + q(bx + nx * sw, by + ny * sw) + ' L' + q(bx + nx * hw, by + ny * hw) + ' L' + q(x2, y2) + ' L' + q(bx - nx * hw, by - ny * hw) + ' L' + q(bx - nx * sw, by - ny * sw) + ' L' + q(x1 - nx * sw, y1 - ny * sw) + ' z', fill, ol, 1);
  }
  // part of a ring (a revolved body): centre, outer and inner radius, from angle a0 to a1 in degrees, clockwise on screen
  function ring(cx0, cy0, ro, ri, a0, a1, fill, ol) {
    var t0 = a0 * Math.PI / 180, t1 = a1 * Math.PI / 180, big = ((a1 - a0) % 360 + 360) % 360 > 180 ? 1 : 0;
    function q(r, t) { return r2(cx0 + r * Math.cos(t)) + ' ' + r2(cy0 + r * Math.sin(t)); }
    return P('M' + q(ro, t0) + ' A' + ro + ' ' + ro + ' 0 ' + big + ' 1 ' + q(ro, t1) + ' L' + q(ri, t1) + ' A' + ri + ' ' + ri + ' 0 ' + big + ' 0 ' + q(ri, t0) + ' z', fill, ol, 1);
  }
  // an upright cylinder: the side, the top ellipse
  function cyl(cx0, y0, y1, rx, ry, side, top, ol) {
    return P('M' + (cx0 - rx) + ' ' + y0 + ' V' + y1 + ' A' + rx + ' ' + ry + ' 0 0 0 ' + (cx0 + rx) + ' ' + y1 + ' V' + y0 + ' z', side, ol, 1) + E(cx0, y0, rx, ry, top, ol, 1);
  }
  function txt(x, y, size, s, fill, weight, family) { return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" font-weight="' + (weight || 700) + '" font-family="' + (family || 'Segoe UI, Arial, sans-serif') + '" fill="' + (fill || INK) + '" text-anchor="middle">' + s + '</text>'; }
  // a sheet of paper with its corner folded (paper takes the panel colour on the dark theme, so its outline is the ink); a magnifier (light-blue glass, dark ring, blue handle); a gear
  function page(x, y, w, h, c) { c = c || 3; return P('M' + x + ' ' + y + ' h' + (w - c) + ' l' + c + ' ' + c + ' v' + (h - c) + ' h-' + w + ' z', PAPER, INK, 1) + P('M' + (x + w - c) + ' ' + y + ' v' + c + ' h' + c, 'none', INK, 1); }
  function mag(mx, my, r) { return L('M' + r2(mx - r * 0.7) + ' ' + r2(my + r * 0.7) + ' L' + r2(mx - r - 2.4) + ' ' + r2(my + r + 2.4), B3, 2.4) + C(mx, my, r, '#e4f1f7', GD, 1); }
  function gear(gx, gy, r, fill, ol) {
    var n = 8, d = '', i, a, ro = r + 1.5, ri = r, k = Math.PI / n;
    for (i = 0; i < n; i++) {
      a = i * 2 * k;
      d += (i ? ' L' : 'M') + r2(gx + ri * Math.cos(a - k * 0.55)) + ' ' + r2(gy + ri * Math.sin(a - k * 0.55)) + ' L' + r2(gx + ro * Math.cos(a - k * 0.3)) + ' ' + r2(gy + ro * Math.sin(a - k * 0.3)) +
        ' L' + r2(gx + ro * Math.cos(a + k * 0.3)) + ' ' + r2(gy + ro * Math.sin(a + k * 0.3)) + ' L' + r2(gx + ri * Math.cos(a + k * 0.55)) + ' ' + r2(gy + ri * Math.sin(a + k * 0.55));
    }
    return '<path d="' + d + ' z M' + r2(gx + r * 0.45) + ' ' + gy + ' A' + r2(r * 0.45) + ' ' + r2(r * 0.45) + ' 0 1 0 ' + r2(gx - r * 0.45) + ' ' + gy + ' A' + r2(r * 0.45) + ' ' + r2(r * 0.45) + ' 0 1 0 ' + r2(gx + r * 0.45) + ' ' + gy + ' z" fill="' + (fill || GL) + '" fill-rule="evenodd" ' + st(ol || OL, 1) + '/>';
  }
  // the four-colour ball of appearances (the DisplayManager, Edit Appearance, the Task Pane)
  function ball(bx, by, r) {
    function q(a) { return r2(bx + r * Math.cos(a * Math.PI / 180)) + ' ' + r2(by + r * Math.sin(a * Math.PI / 180)); }
    function w(a0, a1, c) { return '<path d="M' + bx + ' ' + by + ' L' + q(a0) + ' A' + r + ' ' + r + ' 0 0 1 ' + q(a1) + ' z" fill="' + c + '" stroke="none"/>'; }
    return w(180, 280, '#3f7fd6') + w(280, 20, '#d82323') + w(20, 110, '#f0c416') + w(110, 180, '#18b012') +
      '<circle cx="' + r2(bx - r * 0.35) + '" cy="' + r2(by - r * 0.4) + '" r="' + r2(r * 0.28) + '" fill="#bcd6f6" stroke="none"/>' + C(bx, by, r, 'none', '#4a4a4a', 1);
  }
  // the block of a part: an L-shaped step seen from above its corner (the tall end at the back left)
  function partBlock(c1, c2, c3, ol) {
    return P('M3 3.25 L6.5 5 V9 L10 10.75 V14 L3 10.5 z', c2, ol, 1) + P('M3 3.25 L6.5 5 L10 3.25 L6.5 1.5 z', c1, ol, 1) + P('M6.5 5 L10 3.25 V7.25 L6.5 9 z', c3, ol, 1) +
      P('M6.5 9 L10 10.75 L13.5 9 L10 7.25 z', c1, ol, 1) + P('M10 10.75 L13.5 9 V12.25 L10 14 z', c3, ol, 1);
  }
  // a folder (the tree's History / Sensors / Annotations rows are a folder with a mark on it)
  function folder(mark) { return P('M1.5 2.5 h4.5 l1.5 1.5 h7 v10.5 h-13 z', W3, OL, 1) + P('M1.5 5.5 h13 v9 h-13 z', PAPER, INK, 1) + (mark || ''); }

  var OWN = {};

  // ================================================================== Features
  OWN.extrude = wbox(6.5, 0.5, 7, 10, 1) + ubox(1.5, 5.5, 6, 6, 3) + F('M2.5 9.5 h2.5 v1 h-2.5 z', B1);
  OWN.cut = wbox(1.5, 1.5, 10, 10, 3) + R(4.5, 7.5, 4, 4, B3, NV, 1) + F('M6 8 H8 V10 H6 z', B1) + L('M6 8 V10 H8', NV, 0.7);
  OWN.revolve = T('M8 0.5 V15.5', DASHDOT) + ring(8, 8, 6.5, 3, 25, 300, B2, NV) + L('M2.9 7 A5.2 5.2 0 0 1 9 2.9', B1, 1);
  OWN.revolveCut = cyl(8, 4, 12, 6.5, 2.2, W2, W1, OL) + U('M8 5.5 L4.5 6.6 V13.6 L8 12.5 z', B2) + U('M8 5.5 L11.5 6.6 V13.6 L8 12.5 z', B3);
  var SWP = 'M3.5 11.5 C10.5 12.5 5 4.5 11.5 4';
  OWN.sweep = L(SWP, NV, 5.2, BUTT) + L(SWP, B2, 3.2, BUTT) + L('M4 10.6 C9.5 11 4.8 3.9 11 3.2', B1, 0.9) + C(3.4, 11.5, 2.3, B2, NV, 1) + E(11.8, 4, 1.6, 2.4, B1, NV, 1);
  OWN.loft = U('M5.5 3.5 V7.5 L2.5 11.5 L8 14.5 L13.5 11.5 L10.5 7.5 V3.5 z', B2) + F('M8 4.6 H10.4 V7.6 L13.2 11.4 L8 14.2 z', B3) + P('M8 4.6 V14.5', 'none', NV, 0.7) + E(8, 3.5, 2.5, 1.1, W1, NV, 1);
  var BND_TOP = 'M1.5 8.5 Q4 5.5 7 8 Q8.5 9.2 10.5 8.5 L14.5 4.5 Q12.5 5.2 11 4 Q8.5 2 5.5 4.5 z', BND_FRONT = 'M1.5 8.5 Q4 5.5 7 8 Q8.5 9.2 10.5 8.5 V13.5 H1.5 z', BND_SIDE = 'M10.5 8.5 L14.5 4.5 V9.5 L10.5 13.5 z';
  var BND_GRID = P('M6 6 L10.5 2.9 M3.5 6.5 Q6 3.6 8.8 6.2 Q10.3 7.4 12.5 6.5', 'none', GD, 0.7);
  OWN.boundary = U(BND_FRONT, B2) + U(BND_SIDE, B3) + U(BND_TOP, B1) + P('M6 6 L10.5 2.9 M3.5 6.5 Q6 3.6 8.8 6.2 Q10.3 7.4 12.5 6.5', 'none', NV, 0.7);   // swparticons: the body it makes is blue (it read as a plain white body)
  OWN.boundaryCut = W(BND_FRONT, W2) + W(BND_SIDE, W3) + U(BND_TOP, B1) + P('M6 6 L10.5 2.9 M3.5 6.5 Q6 3.6 8.8 6.2 Q10.3 7.4 12.5 6.5', 'none', NV, 0.7);
  function wand(x1, y1, x2, y2) {
    return L('M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2, '#1c1c1c', 2.2, BUTT) + L('M' + r2(x2 - (x2 - x1) * 0.25) + ' ' + r2(y2 - (y2 - y1) * 0.25) + ' L' + x2 + ' ' + y2, '#f6f6f6', 1.2, BUTT) +
      P('M' + r2(x2 + 1.5) + ' ' + r2(y2 - 3.5) + ' l0.6 1.3 1.3 0.6 -1.3 0.6 -0.6 1.3 -0.6 -1.3 -1.3 -0.6 1.3 -0.6 z', Y3, OR, 0.6) + P('M' + r2(x2 - 3) + ' ' + r2(y2 - 2.2) + ' l0.5 0.9 0.9 0.5 -0.9 0.5 -0.5 0.9 -0.5 -0.9 -0.9 -0.5 0.9 -0.5 z', Y3, OR, 0.6);
  }
  OWN.holeWizard = wbox(1.5, 3.5, 9, 9, 2) + C(6, 10, 2.8, B2, NV, 1) + F('M4 9.2 A2.6 2.6 0 0 1 8 8.3 A3.4 3.4 0 0 0 4 9.2 z', B4) + wand(8.5, 8, 13, 3.5);
  OWN.hole = wbox(1.5, 2.5, 10, 10, 2) + C(6.5, 9.5, 3, B2, NV, 1) + F('M4.3 8.6 A2.8 2.8 0 0 1 8.7 7.7 A3.7 3.7 0 0 0 4.3 8.6 z', B4);
  OWN.sweptCut = wbox(1.5, 1.5, 10, 10, 3) + U('M4.5 14.5 Q4.5 7.5 11.5 7.5 V10.5 Q7.5 10.5 7.5 14.5 z', B2) + F('M11.5 7.5 L13 6 V9 L11.5 10.5 z', B4);
  OWN.loftedCut = wbox(1.5, 1.5, 10, 10, 3) + U('M4.5 4.5 H9.5 L7.5 9.5 L8.5 14.5 H4.5 L5.5 9.5 z', B2) + F('M4.5 4.5 L6 3 H11 L9.5 4.5 z', B4);
  // swparticons (rfNE): Fillet and Chamfer take the block's whole near top edge (4 high, 3 deep), so the edge is the
  // first thing seen at 16 px: Fillet a quarter round shaded like a cylinder (lit band at the top, shade at the
  // bottom) with the round profile on the side face; Chamfer one flat lit bevel with straight edges
  var SWP_BLK_FRONT = 'M1.5 10 V14.5 H10 V10 z', SWP_BLK_TOP = 'M4.5 3 L6 1.5 H14.5 L13 3 z', SWP_ROUND = 'M1.5 10 C1.5 7.8 2.85 4.65 4.5 3 H13 C11.35 4.65 10 7.8 10 10 z';
  OWN.fillet = W(SWP_BLK_FRONT, W2) + W('M10 14.5 V10 C10 7.8 11.35 4.65 13 3 L14.5 1.5 V10 z', W3) + W(SWP_BLK_TOP, W1) +
    U(SWP_ROUND, B2) + F('M1.5 10 Q1.5 8.3 2.08 7.06 H10.58 Q10 8.3 10 10 z', B3) + F('M3.12 4.82 Q3.7 3.8 4.5 3 H13 Q12.2 3.8 11.62 4.82 z', B1) + P(SWP_ROUND, 'none', NV, 1);
  OWN.chamfer = W(SWP_BLK_FRONT, W2) + W('M10 14.5 V10 L13 3 L14.5 1.5 V10 z', W3) + W(SWP_BLK_TOP, W1) + U('M1.5 10 L4.5 3 H13 L10 10 z', B1);
  // swparticons (rfNE): the Fillet / Chamfer PropertyManagers' type buttons (16 px, lane pmsense asks for these names):
  // an end view of the block's corner, the new face a heavy blue line, what the type takes in ink or blue
  var SWP_CH = W('M1.5 14.5 V4.5 H8.5 L12.5 8.5 V14.5 z', W2), SWP_CHB = P('M8.5 4.5 L12.5 8.5', 'none', B3, 2, BUTT);
  OWN.chamferAngleDistance = SWP_CH + F('M12.5 8.5 L10.03 6.03 A3.5 3.5 0 0 0 12.5 12 z', B1) + SWP_CHB + T('M8.5 1.5 V3.5 M12.5 1.5 V3.5 M8.5 2.5 H12.5');
  OWN.chamferDistanceDistance = SWP_CH + SWP_CHB + T('M8.5 4.5 H12.5 V8.5', DASH) + T('M8.5 1.5 V3.5 M12.5 1.5 V3.5 M8.5 2.5 H12.5 M13.5 4.5 H15.5 M13.5 8.5 H15.5 M14.5 4.5 V8.5');
  OWN.chamferVertex = box(1.5, 3.5, 9, 9, 3, W2, W1, W3, OL) + U('M7 6.5 L12.5 4.5 L10.5 10.5 z', B1);
  OWN.chamferOffsetFace = SWP_CH + SWP_CHB + P('M1.5 8.5 H12.5 M8.5 4.5 V14.5', 'none', GD, 1.1, DASH);
  OWN.chamferFaceFace = SWP_CH + P('M8.5 4.5 L12.5 8.5', 'none', OL, 1) + P('M1.5 4.5 H8.5 M12.5 8.5 V14.5', 'none', B3, 2.2, BUTT);
  var SWP_FR = W('M1.5 14.5 V4.5 H7.5 A5 5 0 0 1 12.5 9.5 V14.5 z', W2);
  OWN.filletConstant = SWP_FR + P('M7.5 4.5 A5 5 0 0 1 12.5 9.5', 'none', B3, 2, BUTT) + ar(7.5, 9.5, 10.6, 6.4, INK, 1.1, 2.2);
  OWN.filletVariable = box(1.5, 3.5, 10, 9, 3, W2, W1, W3, OL) + U('M1.5 6.5 H11.5 V11 Q6 7.5 1.5 7.5 z', B2) + U('M1.5 6.5 L4.5 3.5 H14.5 L11.5 6.5 z', B1);
  OWN.filletFace = SWP_FR + P('M7.5 4.5 A5 5 0 0 1 12.5 9.5', 'none', OL, 1) + P('M1.5 4.5 H7.5 M12.5 9.5 V14.5', 'none', B3, 2.2, BUTT);
  OWN.filletFullRound = W('M3.5 14.5 V8 A4.5 4.5 0 0 1 12.5 8 V14.5 z', W2) + P('M3.5 8 A4.5 4.5 0 0 1 12.5 8', 'none', B3, 2, BUTT) + T('M1.5 14.5 H14.5');
  function tab(x, y, fill, ol) { return P('M' + x + ' ' + y + ' h3 v1.5 h1.5 v2 h-1.5 v1.5 h-3 z', fill, ol, 1); }
  function tabL(x, y, fill, ol) { return P('M' + x + ' ' + y + ' h-3 v1.5 h-1.5 v2 h1.5 v1.5 h3 z', fill, ol, 1); }
  OWN.lpattern = tab(2.5, 1.5, B2, NV) + tab(9.5, 1.5, W1, OL) + tab(2.5, 9.5, W1, OL) + tab(9.5, 9.5, W1, OL);
  OWN.cpattern = C(8, 8, 5, 'none', GD, 0.9) + R(6, 0.5, 4, 4, B2, NV, 1) + R(11.5, 6, 4, 4, W1, OL, 1) + R(6, 11.5, 4, 4, W1, OL, 1) + R(0.5, 6, 4, 4, W1, OL, 1);
  OWN.mirror = tab(1.5, 5.5, B2, NV) + tabL(14.5, 5.5, W1, OL) + T('M8 1.5 V14.5');
  OWN.shell = wbox(1.5, 1.5, 10, 10, 3) + U('M3.5 6.5 H9.5 V12.5 H3.5 z', B2) + F('M3.5 6.5 H5.5 V10.5 L3.5 12.5 z', B3) + F('M3.5 12.5 L5.5 10.5 H9.5 V12.5 z', B1) + P('M5.5 6.5 V10.5 H9.5 M5.5 10.5 L3.5 12.5', 'none', NV, 0.7) + R(3.5, 6.5, 6, 6, 'none', NV, 1);
  OWN.draft = U('M1.5 4.5 L6.5 1.5 L14.5 6.5 L9.5 9.5 z', B1) + U('M1.5 4.5 L9.5 9.5 V14.5 H1.5 z', B2) + W('M9.5 9.5 L14.5 6.5 V11.5 L9.5 14.5 z', W1);
  OWN.rib = W('M9.5 3.5 L11.5 1.5 H14.5 V11.5 L12.5 13.5 V3.5 z', W3) + W('M9.5 3.5 H12.5 V13.5 H9.5 z', W1) + W('M1.5 11.5 H9.5 V14.5 H1.5 z', W2) + W('M1.5 11.5 L3.5 9.5 H9.5 V11.5 z', W1) + U('M9.5 4.5 L3.5 11.5 H9.5 z', B2) + F('M9 6 L4.8 11 H6 L9 7.5 z', B1);
  // swparticons (rfNE): Rib thickness side (PM buttons): the sketch line and the thickness on one side, both, the other
  OWN.ribFirstSide = R(3.5, 2.5, 4.5, 11, B2, NV, 1) + L('M8 1 V15');
  OWN.ribBothSides = R(5.5, 2.5, 5, 11, B2, NV, 1) + L('M8 1 V15');
  OWN.ribSecondSide = R(8, 2.5, 4.5, 11, B2, NV, 1) + L('M8 1 V15');
  OWN.wrap = cyl(8, 4, 12, 6.5, 2.2, W2, W1, OL) + U('M1.5 7 A6.5 2.2 0 0 0 14.5 7 V10 A6.5 2.2 0 0 1 1.5 10 z', B2) + P('M5 8.6 V11.5 M11 8.6 V11.5', 'none', NV, 0.7) + F('M2 7.9 A6.5 2.2 0 0 0 7.5 9.2 V10 A6.5 2.2 0 0 1 2 8.8 z', B1);
  OWN.intersect = U('M1.5 8.5 Q5 5.5 8.5 7.5 L11.5 13 Q7 11.5 2.5 14.5 z', B2) + wbox(6.5, 1.5, 5.5, 5.5, 2.5);
  // reference geometry: a blue plane; in the tree a plane is white with its centre line
  var PLANE = 'M3.5 4.5 L12.5 2.5 V11.5 L3.5 13.5 z';
  OWN.plane = U(PLANE, B1) + F('M4 9 L12 7 V11.1 L4 13 z', B2) + P(PLANE, 'none', NV, 1);
  OWN.planeSmall = W(PLANE, '#eceef0') + T('M8 1.5 V14.5', DASHDOT);
  OWN.refgeo = U('M5.5 5.5 L13.5 3.5 V11.5 L5.5 13.5 z', B1) + T('M9.5 1.5 V15', DASHDOT) + C(3, 3, 1.8, B2, NV, 1);
  OWN.refAxis = cyl(8, 4.5, 11.5, 4.5, 1.6, B2, B1, NV) + F('M10 5.8 H12.5 V11.5 A4.5 1.6 0 0 1 10 12.9 z', B3) + P('M8 0.5 V15.5', 'none', INK, 1.5, DASHDOT);   // swparticons: an axis through a cylinder (it was the Plane with a line)
  OWN.refPoint = U(PLANE, B1) + C(8, 8, 2, W1, OL, 1) + C(8, 8, 0.7, OL, 'none');
  OWN.csys = ar(4.5, 11.5, 4.5, 1.5, INK, 1.5, 2.8) + ar(4.5, 11.5, 14.5, 11.5, INK, 1.5, 2.8) + ar(4.5, 11.5, 1, 15, INK, 1.5, 2.6);
  OWN.origin = ar(3.5, 12.5, 3.5, 1.5, INK, 1.5, 3) + ar(3.5, 12.5, 14.5, 12.5, INK, 1.5, 3);
  OWN.curves = L('M2.5 3.5 C9 2.5 3 12.5 8 12.5 S7 2.5 13.5 3.5');
  // Instant3D: the yellow ruler and the blue arrow dragging down from it
  function ruler(d, ticks) { return P(d, Y2, YO, 1) + P(ticks, 'none', YO, 0.7); }
  OWN.instant = ruler('M4.5 1.5 L14.5 4.5 V8.5 L4.5 5.5 z', 'M6.5 2.1 V4 M8.5 2.7 V4.2 M10.5 3.3 V5.2 M12.5 3.9 V5.4') + barrow(2.5, 6.5, 13.5, 14, 1, 2.6, 4.2, B2, NV);
  OWN.instant2D = L('M12.5 1.5 H3.5 V9.5 A4 4 0 0 0 7.5 13.5 H13.5') + ruler('M5.5 3.5 L13.5 5.5 V8.5 L5.5 6.5 z', 'M7.5 4 V5.4 M9.5 4.5 V5.9 M11.5 5 V6.4') + barrow(5.5, 8, 13, 12.8, 0.8, 2.2, 3.4, B2, NV);

  // ================================================================== Sketch
  var SKFRAME = 'M12.5 2.5 H3.5 V9.5 A4 4 0 0 0 7.5 13.5 H13.5';
  var SKGRID = F('M4 3 H14 V13 H7.5 A3.5 3.5 0 0 1 4 9.5 z', '#f1f3f5') + P('M7 3 V13 M10 3 V13 M13 3 V13 M4 6 H14 M4 9 H14 M5.5 12 H14', 'none', '#c5c9ce', 0.5);
  OWN.sketch = SKGRID + L(SKFRAME);
  function bolt(x, y) { return P('M' + r2(x + 3.5) + ' ' + y + ' L' + x + ' ' + r2(y + 4) + ' H' + r2(x + 2.2) + ' L' + r2(x + 0.8) + ' ' + r2(y + 7.5) + ' L' + r2(x + 5.5) + ' ' + r2(y + 2.8) + ' H' + r2(x + 3) + ' L' + r2(x + 5) + ' ' + y + ' z', Y2, OR, 1); }
  OWN.rapidSketch = SKGRID + L(SKFRAME) + bolt(8.5, 0.5);
  OWN.dim = L('M9.5 2.5 L13.5 6.5 M9.5 2.5 L8.5 3.5 M3.5 8.5 L8.5 13.5 M3.5 8.5 L4.5 7.5') + ar(6.6, 5.6, 4.3, 7.9, INK, 1.5, 2.8) + ar(6.4, 5.8, 8.7, 3.5, INK, 1.5, 2.8);
  OWN.line = L('M2.5 13.5 L13.5 2.5') + pt(2.5, 13.5) + pt(13.5, 2.5);
  // swsketchicons (rfND): a centerline's dash-dot has square ends and long gaps, so it reads as dashed at 16 px
  OWN.centerline = L('M2.5 13.5 L13.5 2.5', SK, 1.5, BUTT + ' stroke-dasharray="3 2.4 1 2.4"') + pt(2.5, 13.5) + pt(13.5, 2.5);
  OWN.midline = L('M2.5 13.5 L13.5 2.5') + T('M3.7 9.7 L6.3 12.3 M9.7 3.7 L12.3 6.3') + pt(2.5, 13.5) + pt(13.5, 2.5) + pt(8, 8);   // swsketchicons: equal halves marked
  // swsketchicons (rfND): Circle = its centre point and a radius out to the rim; Perimeter Circle = three points on the
  // rim and no centre; Tangent Circle = a circle touching two lines (the old Circle and Perimeter Circle differed by a
  // centre mark too small to see at 16 px)
  OWN.circle = C(7.5, 8.5, 5.66) + L('M7.5 8.5 L11.5 4.5', GD, 1.1) + pt(7.5, 8.5) + pt(11.5, 4.5);
  OWN.pcircle = C(8, 8, 5.6) + pt(2.5, 8.5) + pt(12, 4) + pt(11.5, 12.5);
  OWN.tangentCircle = L('M1.5 0.5 V15 M1 14.5 H15.5', GD, 1.1) + C(7.5, 8.5, 6) + pt(1.5, 8.5) + pt(7.5, 14.5);
  OWN.spline = L('M2.5 13.5 C4.5 -3 8 19 13.5 2.5');
  // swsketchicons (rfND): Corner Rectangle = two opposite corners; Center Rectangle = the centre and its construction
  // diagonals; the 3 Point ones are tilted (three corners / centre, side and corner); Parallelogram leans
  OWN.rect = R(2.5, 3.5, 11, 9, 'none', SK, 1.5) + pt(2.5, 12.5) + pt(13.5, 3.5);
  OWN.crect = L('M2.5 3.5 L13.5 12.5 M13.5 3.5 L2.5 12.5', GD, 1, DASH) + R(2.5, 3.5, 11, 9, 'none', SK, 1.5) + pt(8, 8) + pt(13.5, 3.5);
  OWN.rect3 = L('M1.5 9.5 L9.5 2.5 L14.5 8.5 L6.5 15 z') + pt(1.5, 9.5) + pt(9.5, 2.5) + pt(14.5, 8.5);
  OWN.crect3 = L('M1.5 9.5 L14.5 8.5 M9.5 2.5 L6.5 15', GD, 1, DASH) + L('M1.5 9.5 L9.5 2.5 L14.5 8.5 L6.5 15 z') + pt(8, 8.5) + pt(12, 5.5) + pt(14.5, 8.5);
  OWN.parallelogram = L('M1.5 12.5 L5.5 3.5 H14.5 L10.5 12.5 z') + pt(1.5, 12.5) + pt(5.5, 3.5) + pt(14.5, 3.5);
  // Centerpoint Arc = its centre point and two radii; 3 Point Arc = three points on it and no centre
  OWN.arc = L('M2.5 11.5 H13.5', GD, 1, DASH) + L('M2.5 11.5 A5.5 5.5 0 0 1 13.5 11.5') + pt(8, 11.5) + pt(2.5, 11.5) + pt(13.5, 11.5);
  OWN.arc3 = L('M2.5 12.5 A7 7 0 0 1 13.5 12.5') + pt(2.5, 12.5) + pt(13.5, 12.5) + pt(8, 5.5);
  OWN.tarc = L('M1.5 12.5 H6.5', GD, 1.1) + L('M6.5 12.5 A6 6 0 0 0 12.5 6.5 V3.5') + pt(6.5, 12.5) + pt(12.5, 3.5);
  OWN.ellipse = '<ellipse cx="8" cy="8" rx="6.3" ry="4" fill="none" transform="rotate(-28 8 8)" ' + st(SK, 1.5) + '/>' + pt(8, 8);
  OWN.pellipse = '<path d="M13.6 5 A6.3 4 -28 1 0 11 12.6" fill="none" ' + st(SK, 1.5) + '/>' + pt(8, 8) + pt(13.5, 5) + pt(11, 12.5);
  // swsketchicons (rfND): Straight Slot = its two end centres joined; Centerpoint Straight Slot = its centre and one end;
  // the arc slots bend (3 points on the centre arc / the arc's centre and the two ends)
  var SWSK_SLOT = 'M5 4.5 H11 A3.5 3.5 0 0 1 11 11.5 H5 A3.5 3.5 0 0 1 5 4.5 z', SWSK_ASLOT = 'M1.69 9.08 A7.7 7.7 0 0 1 14.31 9.08 A1.7 1.7 0 0 1 11.52 11.03 A4.3 4.3 0 0 0 4.48 11.03 A1.7 1.7 0 0 1 1.69 9.08 z';
  OWN.slot = L('M5 8 H11', GD, 1.1) + P(SWSK_SLOT, 'none', SK, 1.5) + pt(5, 8) + pt(11, 8);
  OWN.cslot = L('M8 8 H14.5', GD, 1.1) + P(SWSK_SLOT, 'none', SK, 1.5) + pt(8, 8) + pt(14.5, 8);
  OWN.aslot3 = L('M3.09 10.06 A6 6 0 0 1 12.91 10.06', GD, 1, DASH) + P(SWSK_ASLOT, 'none', SK, 1.5) + pt(3, 10) + pt(8, 7.5) + pt(13, 10);
  OWN.aslot = L('M3.09 10.06 L8 13.5 L12.91 10.06', GD, 1, DASH) + P(SWSK_ASLOT, 'none', SK, 1.5) + pt(8, 13.5) + pt(3, 10) + pt(13, 10);
  OWN.polygon = P('M4.5 2.5 H11.5 L14.5 8 L11.5 13.5 H4.5 L1.5 8 z', 'none', SK, 1.5) + pt(8, 8);
  OWN.skFillet = L('M2.5 2.5 H8', GD, 1.1) + L('M13.5 8 V13.5', GD, 1.1) + L('M8 2.5 A5.5 5.5 0 0 1 13.5 8') + cx(8, 8);
  OWN.skChamfer = L('M2.5 2.5 H8', GD, 1.1) + L('M13.5 8 V13.5', GD, 1.1) + L('M8 2.5 L13.5 8');
  OWN.text = [L('M3.5 13.5 L8 2.5 L12.5 13.5 M5.5 9.5 H10.5 M2 13.5 H5 M11 13.5 H14', SK, 1.5), P('M2.5 13.5 H5.5 M10.5 13.5 H13.5', 'none', NV, 1) + P('M3.5 13.5 L7.5 2.5 H8.5 L12.5 13.5 H10.8 L9.9 10.5 H6.1 L5.2 13.5 z M6.6 9 H9.4 L8 4.6 z', B1, NV, 1, 'fill-rule="evenodd"')];
  OWN.point = R(5.5, 5.5, 5, 5, B2, NV, 1) + F('M6.2 6.2 H10 L6.2 10 z', B1);
  // scissors over two entities
  OWN.trim = L('M8.5 14.5 V8.5 M1.5 12.5 H14.5', SK, 1.5) + C(3, 2.8, 1.6, 'none', GD, 1.1) + C(3, 7.2, 1.6, 'none', GD, 1.1) + P('M4.3 3.6 L13.5 7.5 L11.5 7.9 L4.2 6.2 z', GL, GD, 0.8) + P('M4.3 6.4 L13.5 2.5 L11.5 2.1 L4.2 3.8 z', W1, GD, 0.8);
  OWN.extend = L('M2.5 11.5 H8') + L('M8 11.5 H12', SK, 1.5, 'stroke-dasharray="1.2 1.4"') + L('M13.5 3 V14', GD, 1.1) + ar(6.5, 7, 12.5, 7, INK, 1.1, 2.4);
  OWN.convert = wbox(2.5, 2.5, 8, 8, 3) + P('M10.5 5.5 V13.5', 'none', SKF, 2, BUTT);
  OWN.offset = L('M13.5 6.5 H9.5 A3 3 0 0 0 6.5 9.5 V13.5', GD, 1.1) + L('M13.5 2.5 H7.5 A5 5 0 0 0 2.5 7.5 V13.5');
  function tabO(x, y, c, w) { return P('M' + x + ' ' + y + ' h3 v1.5 h1.5 v2 h-1.5 v1.5 h-3 z', 'none', c, w); }
  function tabOL(x, y, c, w) { return P('M' + x + ' ' + y + ' h-3 v1.5 h-1.5 v2 h1.5 v1.5 h3 z', 'none', c, w); }
  OWN.mirrorEnt = tabO(1.5, 5.5, GD, 1.1) + tabOL(14.5, 5.5, SK, 1.5) + T('M8 1.5 V14.5', DASHDOT);
  OWN.sketchPattern = tabO(2.5, 1.5, SK, 1.5) + tabO(9.5, 1.5, GD, 1.1) + tabO(2.5, 9.5, GD, 1.1) + tabO(9.5, 9.5, GD, 1.1);
  OWN.cSketchPattern = C(8, 8, 5, 'none', GD, 0.9, DASH) + R(6.5, 1, 3, 3, 'none', SK, 1.5) + R(12, 6.5, 3, 3, 'none', GD, 1.1) + R(6.5, 12, 3, 3, 'none', GD, 1.1) + R(1, 6.5, 3, 3, 'none', GD, 1.1);
  // swsketchicons (rfND): Move leaves a dashed ghost behind; Copy keeps the original (two solid squares, a green plus)
  OWN.moveEnt = R(1.5, 9.5, 5, 5, 'none', GD, 1, DASH) + R(9.5, 1.5, 5, 5, 'none', SK, 1.5) + ar(5, 11, 10, 6, INK, 1.1, 2.6);
  OWN.copyEnt = R(1.5, 6.5, 6, 6, 'none', SK, 1.5) + R(7.5, 1.5, 6, 6, W1, SK, 1.5) + P('M12 10 V15 M9.5 12.5 H14.5', 'none', G2, 1.9);
  function eye(ex, ey) { return P('M' + r2(ex - 3.5) + ' ' + ey + ' Q' + ex + ' ' + r2(ey - 3.4) + ' ' + r2(ex + 3.5) + ' ' + ey + ' Q' + ex + ' ' + r2(ey + 3.4) + ' ' + r2(ex - 3.5) + ' ' + ey + ' z', W1, OL, 1) + C(ex, ey, 1.3, OL, 'none'); }
  OWN.relations = P('M1.5 10.5 H9.5 M5.5 10.5 V1.5', 'none', INK, 1.5) + eye(11, 11.5);
  OWN.quickSnaps = L('M12.5 1.5 H2.5 V13.5', GD, 1.1) + C(9, 9, 4.5, 'none', SK, 1.5) + C(9, 9, 1.3, W1, OL, 1);
  OWN.construction = L('M2.5 13.5 L13.5 2.5', GD, 1.1, DASHDOT) + L('M2.5 8.5 L8.5 2.5');
  OWN.shadedContours = P('M9.5 2.5 L14.5 12.5 H4.5 z', B1, SKF, 1) + C(5.5, 10, 3.5, B1, SKF, 1);
  OWN.repairSketch = L(SKFRAME) + P('M6.5 11 L11 6.5', 'none', GD, 2.4) + '<path d="M13.9 4.3 A2.4 2.4 0 1 1 11.7 2.1 L11.2 4 L12 4.8 z" fill="' + GL + '" ' + st(GD, 1) + '/>';
  // ---------------------------------------------------------------- swsketchicons (rfND, 2026-11-16): every sketch tool
  // its own picture. Line family: the reference entity grey, the new line blue with its points
  OWN.parallelLine = L('M1.5 9.5 L9.5 1.5', GD, 1.1) + L('M5.5 14.5 L14.5 5.5') + pt(5.5, 14.5) + pt(14.5, 5.5);
  OWN.tangentLine = C(4.5, 10.5, 3, 'none', GD, 1.1) + C(12, 10.5, 2.5, 'none', GD, 1.1) + L('M1 7.5 H15') + pt(4.5, 7.5) + pt(12, 8);
  OWN.perpLine = L('M1 13.5 H15', GD, 1.1) + L('M7.5 13.5 V2') + T('M7.5 10.5 H10.5 V13.5') + pt(7.5, 2.5);
  OWN.bisectorLine = L('M2.5 13.5 H15 M2.5 13.5 L9 2', GD, 1.1) + L('M2.5 13.5 L14 6.5') + T('M7.5 13.5 A5 5 0 0 0 5 9.2') + pt(2.5, 13.5) + pt(14, 6.5);
  // Style Spline: its control polygon; Equation Driven Curve: a sine on axes
  OWN.styleSpline = L('M2.5 13.5 L5 3 L11 13 L13.5 2.5', GD, 1, DASH) + L('M2.5 13.5 C4.8 4 10.8 12 13.5 2.5') + pt(2.5, 13.5) + pt(5, 3) + pt(11, 13) + pt(13.5, 2.5);
  OWN.eqnCurve = T('M1.5 8.5 H15 M2.5 2 V15') + L('M2.5 8.5 C4.5 1 6.5 1 8.5 8.5 C10.5 16 12.5 16 14.5 8.5');
  // Parabola: its apex and focus; Conic: the ends, the apex and its tangent lines
  OWN.parabola = L('M2 2.5 Q8 21 14 2.5') + cx(8, 6.5) + pt(8, 11.7);
  OWN.conic = L('M2.5 13.5 L8 2.5 L13.5 13.5', GD, 1, DASH) + L('M2.5 13.5 Q8 1 13.5 13.5') + pt(2.5, 13.5) + pt(13.5, 13.5) + pt(8, 7.5);
  // Trim family: Split = one line cut at a point; Join = two lines and arrows meeting
  OWN.splitEnt = L('M1.5 14.5 L6.5 9.5 M9.5 6.5 L14.5 1.5') + pt(8, 8) + T('M3.5 3.5 L6.5 6.5 M9.5 9.5 L12.5 12.5', DASH);
  OWN.joinEnt = L('M1.5 11.5 H14.5') + pt(1.5, 11.5) + pt(14.5, 11.5) + ar(2.5, 3.5, 6.5, 8.5, INK, 1.1, 2.4) + ar(13.5, 3.5, 9.5, 8.5, INK, 1.1, 2.4);
  // Intersection Curve: a plane cutting a body, the cut line blue
  OWN.intersectCurve = wbox(1.5, 4.5, 9, 7, 3) + F('M0.5 9.5 L4 6 H15.5 L12 9.5 z', 'rgba(149,218,244,0.55)') + P('M0.5 9.5 L4 6 H15.5 L12 9.5 z', 'none', NV, 0.8) + L('M1.5 9.5 H10.5 L13.5 6.5', SKF, 1.5);
  // Offset On Surface: a curved face with its edge offset across it
  OWN.offsetSurface = U('M1.5 12.5 C4 9 6 9 8.5 11.5 L14.5 5.5 C12 3 10 3 7.5 5.5 z', B1) + L('M4.5 10.5 C6 8.5 7.5 8.5 9 9.5 L12.5 6', SK, 1.5);
  // Mirror: Dynamic Mirror = a centerline with its equal marks and the mirrored side still being drawn (dashed)
  OWN.dynMirror = T('M8 0.5 V15.5', DASHDOT) + L('M6 3.5 L2.5 12.5') + L('M10 3.5 L13.5 12.5', SK, 1.5, BUTT + ' ' + DASH) + P('M6.5 7 H9.5 M6.5 9 H9.5', 'none', G2, 1.2) + pt(2.5, 12.5);
  // Rotate / Scale / Stretch Entities
  OWN.rotateEnt = L('M3.5 12.5 H14', GD, 1, DASH) + L('M3.5 12.5 L12 4') + P('M10 12.5 A6.5 6.5 0 0 0 8.1 7.9', 'none', INK, 1.1) + head(8.2, 7.6, -0.6, -0.8, INK, 2.4) + pt(3.5, 12.5);
  OWN.scaleEnt = R(1.5, 9.5, 5, 5, 'none', GD, 1, DASH) + R(1.5, 1.5, 13, 13, 'none', SK, 1.5) + ar(5.5, 10.5, 12, 4, INK, 1.1, 2.6) + pt(1.5, 14.5);
  OWN.stretchEnt = L('M1.5 13.5 H6.5 L9.5 4.5', GD, 1, DASH) + L('M1.5 13.5 H10.5 L13.5 4.5') + ar(7, 8.5, 12, 8.5, INK, 1.1, 2.4) + pt(13.5, 4.5);
  // Close Arc: three quarters drawn, the rest closing dashed
  OWN.closeArc = L('M8 2.5 A5.5 5.5 0 1 1 2.5 8') + L('M2.5 8 A5.5 5.5 0 0 1 8 2.5', SK, 1.5, BUTT + ' ' + DASH) + pt(8, 2.5) + pt(2.5, 8) + cx(8, 8);
  // Relations: Display/Delete = the corner and an eye (OWN.relations); Add = the corner and a green plus; Fully Define =
  // a sketch with its dimension and a green check
  OWN.addRelation = P('M1.5 13.5 H9.5 M1.5 13.5 V4.5', 'none', INK, 1.5) + P('M12 3 V12 M7.5 7.5 H16', 'none', G2, 2.2);
  OWN.fullyDefine = R(1.5, 5.5, 9, 8, 'none', SK, 1.5) + T('M1.5 3 H10.5 M1.5 2 V4 M10.5 2 V4') + P('M8 11 L10.5 13.5 L15 7', 'none', G2, 2);
  // 3D Sketch: a polyline in space over its three axes; 3D Sketch On Plane: the same on a blue plane
  OWN.sketch3d = T('M5.5 10.5 V1.5 M5.5 10.5 H15 M5.5 10.5 L1 15') + L('M2.5 13.5 L8.5 12.5 L12.5 6.5 L9 2.5') + pt(2.5, 13.5) + pt(12.5, 6.5) + pt(9, 2.5);
  OWN.sketch3dPlane = U('M1.5 11.5 L5.5 6.5 H14.5 L10.5 11.5 z', B1) + L('M3.5 10 L8 8 L12 9.5 L9 3') + pt(3.5, 10) + pt(12, 9.5) + pt(9, 3);
  // Ordinate Dimension: values from one zero both ways (Horizontal / Vertical Ordinate keep one direction each)
  OWN.ordinateDim = L('M4.5 11.5 H13.5 V3.5', SK, 1.5) + T('M4.5 14.5 V12.5 M9 14.5 V12.5 M13.5 14.5 V12.5 M1.5 11.5 H3.5 M1.5 7.5 H3.5 M1.5 3.5 H3.5') + pt(4.5, 11.5);
  // Relations whose old glyphs looked alike: Coincident = two lines meeting at one point; Coradial = one circle over
  // another with its radius; Collinear = two pieces on one slanted line
  OWN.relHorizontal = P('M2.5 8.5 H13.5', 'none', '#2e9e48', 2);
  OWN.relVertical = P('M8.5 2.5 V13.5', 'none', '#2e9e48', 2);
  OWN.relEqual = P('M2.5 5.5 H13.5 M2.5 10.5 H13.5', 'none', '#2e9e48', 1.8);   // also Tools > Relations > Scan Equal
  OWN.relCoincident = P('M1.5 13.5 L8 8 M8 8 L14.5 11', 'none', '#2e9e48', 1.6) + C(8, 8, 2.2, '#2e9e48', 'none');
  OWN.relCoradial = C(8, 8, 5.5, 'none', '#2e9e48', 1.3) + C(8, 8, 4.3, 'none', '#2e9e48', 0.9, DASH) + P('M8 8 L12 4.2', 'none', '#2e9e48', 1.1) + C(8, 8, 1.2, '#2e9e48', 'none');
  OWN.relCollinear = P('M1.5 14.5 L6 10 M10 6 L14.5 1.5', 'none', '#2e9e48', 1.8) + P('M6.8 9.2 L9.2 6.8', 'none', '#2e9e48', 1, 'stroke-dasharray="0.8 1"');
  // Quick Snaps: one picture per snap, the yellow dot is where the point lands (names qs + the snap's id, capitalised)
  function swskSnap(x, y) { return C(x, y, 1.7, Y3, YO, 0.8); }
  OWN.qsPoint = L('M2.5 13.5 L8 8', GD, 1.1) + swskSnap(8, 8) + T('M8 2 V4.5 M8 11.5 V14 M2 8 H4.5 M11.5 8 H14');
  OWN.qsCenter = C(8, 8, 5.5) + swskSnap(8, 8);
  OWN.qsMidpoint = L('M1.5 12.5 L14.5 3.5') + pt(1.5, 12.5) + pt(14.5, 3.5) + swskSnap(8, 8);
  OWN.qsQuadrant = C(8, 9, 5.5) + T('M8 1 V15 M1 9 H15', DASH) + swskSnap(8, 3.5);
  OWN.qsIntersection = L('M1.5 13.5 L14.5 2.5 M1.5 2.5 L14.5 13.5') + swskSnap(8, 8);
  OWN.qsNearest = L('M1.5 11.5 H14.5') + swskSnap(9.5, 11.5) + ar(4.5, 3, 8.5, 9, INK, 1.1, 2.4);
  OWN.qsTangent = C(6, 9.5, 4.5) + L('M1 5 H15', GD, 1.1) + swskSnap(6, 5);
  OWN.qsPerpendicular = L('M1 13.5 H15') + L('M8 13.5 V2.5', GD, 1.1, DASH) + T('M8 11 H10.5 V13.5') + swskSnap(8, 13.5);
  OWN.qsParallel = L('M1.5 9.5 L9.5 1.5') + L('M5.5 14.5 L14.5 5.5', GD, 1.1, DASH) + swskSnap(5.5, 14.5);
  OWN.qsHvLines = L('M8 1 V15', GD, 1.1, DASH) + L('M1 8 H15', GD, 1.1, DASH) + pt(8, 13.5) + swskSnap(8, 8);
  OWN.qsHvPoints = pt(2.5, 4.5) + pt(13.5, 12.5) + L('M2.5 4.5 V12.5 H13.5', GD, 1.1, DASH) + swskSnap(2.5, 12.5);
  OWN.qsLength = L('M1.5 9.5 H11.5') + T('M1.5 6.5 V3.5 M11.5 6.5 V3.5 M1.5 5 H11.5') + swskSnap(11.5, 9.5);
  OWN.qsGrid = P('M2.5 2.5 V13.5 M6.5 2.5 V13.5 M10.5 2.5 V13.5 M2.5 2.5 H13.5 M2.5 6.5 H13.5 M2.5 10.5 H13.5', 'none', GD, 0.7) + swskSnap(10.5, 6.5);
  OWN.qsAngle = L('M2.5 13.5 H14.5', GD, 1.1) + L('M2.5 13.5 L11.5 4.5') + T('M8 13.5 A5.5 5.5 0 0 0 6.4 9.6') + swskSnap(11.5, 4.5);
  // Spline Tools (Tools menu): the spline and what each command does to it
  var SWSK_SPL = 'M1.5 12.5 C4 1 9 17 14.5 3.5';
  function swskPlus(x, y) { return P('M' + x + ' ' + r2(y - 2.5) + ' v5 M' + r2(x - 2.5) + ' ' + y + ' h5', 'none', G2, 1.6); }
  OWN.splInsertPt = L(SWSK_SPL) + pt(8, 8) + swskPlus(12.5, 12.5);
  OWN.splSimplify = L(SWSK_SPL) + pt(1.5, 12.5) + pt(14.5, 3.5) + P('M10 12.5 h5', 'none', R2, 1.6);
  OWN.splFit = L('M1.5 12.5 L4.5 5 L8 9.5 L11.5 9 L14.5 3.5', GD, 1, DASH) + L(SWSK_SPL);
  OWN.splHandles = L(SWSK_SPL) + T('M4 13 L10 3') + C(4, 13, 1.1, INK, 'none') + C(10, 3, 1.1, INK, 'none') + pt(7, 8);
  OWN.splCurvature = T('M3 8.5 L1.5 6 M4.5 6.5 L4 3.5 M6.5 6.5 L7.5 3 M9 8.5 L10.5 6.5 M11.5 9 L14.5 9 M13.5 6 L15.5 7') + L(SWSK_SPL);
  OWN.splRelax = L('M1.5 12.5 C3 4 4.5 14 6 7 C7.5 1 9 13 10.5 7', GD, 1, DASH) + L('M1.5 12.5 C5 3 10 3 14.5 9.5');
  OWN.splTangency = L(SWSK_SPL) + ar(7.5, 8.5, 12.5, 12.5, INK, 1.1, 2.4) + ar(7.5, 8.5, 2.5, 4.5, INK, 1.1, 2.4) + pt(7.5, 8.5);
  OWN.splCurvCtrl = L(SWSK_SPL) + C(7, 4.5, 3.5, 'none', INK, 0.9, DASH) + pt(7, 8);
  OWN.splInflection = L('M1.5 13.5 C4 13.5 6 8 8 8 C10 8 12 2.5 14.5 2.5') + P('M6 6 L10 10 M10 6 L6 10', 'none', R2, 1.3);
  OWN.splMinRadius = L(SWSK_SPL) + C(11.5, 9.5, 2.6, 'none', INK, 0.9, DASH) + T('M11.5 9.5 L13.3 11.3') + C(11.5, 9.5, 0.7, INK, 'none');
  // Blocks (Tools menu): a dashed block frame round entities, its insertion point, and the command's mark
  function swskBlock(x, y, w, h) { return R(x, y, w, h, 'none', GD, 1, DASH) + L('M' + (x + 2) + ' ' + (y + h - 2) + ' L' + (x + w - 2) + ' ' + (y + 2)) + C(x + w - 3, y + h - 3, 1.2, 'none', SK, 1) + pt(x + 2, y + h - 2); }
  OWN.blockMake = swskBlock(1.5, 1.5, 10, 10) + swskPlus(12.5, 12.5);
  OWN.blockEdit = swskBlock(1.5, 1.5, 10, 10) + P('M9 15 L15 9 L13.5 7.5 L7.5 13.5 z', Y2, YO, 0.8);
  OWN.blockInsert = swskBlock(5.5, 1.5, 10, 10) + ar(0.5, 14.5, 6.5, 10, INK, 1.2, 2.6);
  OWN.blockAddRemove = swskBlock(1.5, 1.5, 9, 9) + swskPlus(12.5, 9.5) + P('M10 14.5 h5', 'none', R2, 1.6);
  OWN.blockRebuild = swskBlock(1.5, 1.5, 10, 10) + P('M15 11.5 A3 3 0 1 1 13.8 9.1', 'none', G2, 1.4) + head(14.4, 9.6, 0.5, 0.8, G2, 2.2);
  OWN.blockExplode = R(5, 5, 6, 6, 'none', GD, 1, DASH) + L('M1.5 14.5 L4.5 11.5 M11.5 4.5 L14.5 1.5') + C(12.5, 12.5, 1.8, 'none', SK, 1.2) + pt(3.5, 3.5) + T('M8 2 V3.5 M8 12.5 V14 M2 8 H3.5 M12.5 8 H14');
  OWN.blockSave = swskBlock(1.5, 1.5, 9, 9) + R(9.5, 9.5, 6, 6, B2, NV, 1) + F('M11 9.5 H14 V12 H11 z', W1);
  // Sketch Tools rows that had a borrowed picture: SketchXpert, Modify, Align, Replace Entity, Close Sketch to Model,
  // Make Path, Segment
  OWN.sketchXpert = P('M1.5 13.5 H9.5 M1.5 13.5 V4.5', 'none', INK, 1.5) + gear(11, 5, 2.7, GL, OL);
  OWN.modifySketch = L('M3.5 12.5 H12.5 L8 4.5 z') + T('M8 0.5 V3 M8 14 V15.5 M0.5 8.5 H2.5 M13.5 8.5 H15.5') + P('M12.5 1.5 A5 5 0 0 1 15 6', 'none', INK, 1.1) + head(15.1, 6.3, 0.2, 1, INK, 2.2);
  OWN.alignGrid = P('M2.5 1.5 V14.5 M7.5 1.5 V14.5 M12.5 1.5 V14.5 M1.5 2.5 H14.5 M1.5 7.5 H14.5 M1.5 12.5 H14.5', 'none', GD, 0.6) + L('M2.5 12.5 L12.5 2.5') + pt(2.5, 12.5);
  OWN.replaceEnt = L('M1.5 5.5 H9.5', GD, 1.1, DASH) + L('M6.5 12.5 A4 4 0 0 1 14.5 12.5') + ar(11.5, 4, 13.5, 8, INK, 1.1, 2.2) + ar(4.5, 12, 3, 8, INK, 1.1, 2.2);
  OWN.closeToModel = wbox(1.5, 4.5, 10, 7, 3) + L('M1.5 7.5 V2.5 H11.5 V7.5', SK, 1.5) + pt(1.5, 7.5) + pt(11.5, 7.5);
  OWN.makePath = L('M1.5 13.5 V7.5 A4 4 0 0 1 9.5 7.5 H14.5') + ar(4, 4.5, 7, 2.5, INK, 1, 2.2) + ar(10.5, 10.5, 13.5, 10.5, INK, 1, 2.2) + pt(1.5, 13.5) + pt(14.5, 7.5);
  OWN.segment = L('M1.5 12.5 L14.5 3.5') + pt(1.5, 12.5) + pt(5.8, 9.5) + pt(10.2, 6.5) + pt(14.5, 3.5);

  // ================================================================== Sheet Metal (white plates, the new flange in blue)
  // an L bracket seen from the front left: the base plate lying flat and the wall standing on its far edge, each with
  // its thickness; base / wall = 'w' (white) or 'u' (blue, what the command makes)
  function plateBase(k) {
    var f = k === 'u' ? U : W, c = k === 'u' ? [B1, B2, B3] : [W1, W2, W3];
    return f('M1.5 12.5 L5.5 8.5 H13.5 L9.5 12.5 z', c[0]) + f('M1.5 12.5 H9.5 V14.5 H1.5 z', c[1]) + f('M9.5 12.5 L13.5 8.5 V10.5 L9.5 14.5 z', c[2]);
  }
  function plateWall(k) {
    var f = k === 'u' ? U : W, c = k === 'u' ? [B1, B2, B3] : [W1, W2, W3];
    return f('M5.5 2.5 H13.5 V8.5 H5.5 z', c[1]) + f('M5.5 2.5 L6.5 1.5 H14.5 L13.5 2.5 z', c[0]) + f('M13.5 2.5 L14.5 1.5 V7.5 L13.5 8.5 z', c[2]);
  }
  // Base Flange/Tab: a U-shaped white strip with its blue base tab
  OWN.flange = W('M1.5 2.5 L3.5 1.5 V8 L8 11.5 L12.5 8 V1.5 L14.5 2.5 V9.5 L8 14.5 L1.5 9.5 z', W2) + W('M1.5 2.5 L3.5 1.5 V8 L1.5 9.5 z', W3) + W('M12.5 1.5 L14.5 2.5 V9.5 L12.5 8 z', W1) + U('M5.5 9.5 L8 7.5 L10.5 9.5 L8 11.5 z', B2);
  // Edge Flange: a white base with the blue flange standing on its edge
  // swparticons (rfNE): Edge Flange = the blue flange standing on the base plate's left edge (as SolidWorks draws it),
  // so it is not the Fold (blue wall at the back, an arrow) nor Sketched Bend / Insert Bends
  OWN.bend = W('M3 12.5 L7 8.5 H14.5 L10.5 12.5 z', W1) + W('M1.5 12.5 H10.5 V14.5 H1.5 z', W2) + W('M10.5 12.5 L14.5 8.5 V10.5 L10.5 14.5 z', W3) +
    U('M3 12.5 V4.5 L7 0.5 V8.5 z', B3) + U('M1.5 14.5 V4.5 H3 V12.5 L1.5 14.5 z', B2) + U('M1.5 4.5 L5.5 0.5 H7 L3 4.5 z', B1);
  // swparticons (rfNE): flange position (Edge / Miter Flange PM buttons): an end view of the base plate and the new
  // flange (blue) against the dashed line of the edge it was made on: material inside, material outside, bend outside
  function swpFlangePos(x0) { return W('M1.5 12 H' + x0 + ' V14 H1.5 z', W2) + U('M' + x0 + ' 14 V5.5 H' + (x0 + 2) + ' V14 z', B2); }
  OWN.flangePosMaterialInside = swpFlangePos(9) + P('M11 0.5 V15.5', 'none', INK, 1.5, DASH);
  OWN.flangePosMaterialOutside = swpFlangePos(11) + P('M11 0.5 V15.5', 'none', INK, 1.5, DASH);
  OWN.flangePosBendOutside = W('M1.5 12 H11 V14 H1.5 z', W2) + U('M11 12 Q13 12 13 10 V5.5 H15 V10 Q15 14 11 14 z', B2) + P('M11 0.5 V15.5', 'none', INK, 1.5, DASH);
  OWN.miter = U('M1.5 1.5 H14.5 V14.5 H1.5 z', B1) + W('M5.5 5.5 H14.5 V14.5 H5.5 z', W1) + P('M1.5 1.5 L5.5 5.5', 'none', NV, 1) + F('M1.9 1.9 L5.5 5.5 V14.1 H1.9 z', B2);
  OWN.hem = W('M2.5 9.5 H10.5 L12.5 11.5 V12.5 L10.5 14.5 H2.5 L4.5 12.5 z', W2) + U('M2.5 3.5 L4.5 1.5 H11.5 Q14.5 4.5 14.5 7 Q14.5 10 11.5 11.5 L10.5 9.5 Q12 8.5 12 7 Q12 5.5 10.5 3.5 z', B2) + F('M3.6 3 L4.8 2 H11.2 L11.8 3 z', B1);
  OWN.jog = W('M1.5 12.5 L4.5 9.5 H11.5 L8.5 12.5 z', W1) + W('M1.5 12.5 H8.5 V14 H1.5 z', W2) + W('M8.5 12.5 L11.5 9.5 V11 L8.5 14 z', W3) + U('M4.5 5.5 H11.5 V9.5 H4.5 z', B2) + F('M5 6 H11 V7.2 H5 z', B1) + W('M4.5 5.5 L7.5 2.5 H14.5 L11.5 5.5 z', W1) + W('M11.5 5.5 L14.5 2.5 V4 L11.5 7 z', W3);
  OWN.sketchedBend = plateBase('w') + plateWall('w') + L('M0.5 10.5 L15.5 10.5', SK, 1.5, BUTT) + pt(3.5, 10.5) + pt(12.5, 10.5);   // swparticons: the sketch line across the plate is what the command takes
  OWN.crossBreak = W('M1.5 8 L8 4.5 L14.5 8 L8 11.5 z', W1) + W('M1.5 8 L8 11.5 V13.5 L1.5 10 z', W3) + W('M8 11.5 L14.5 8 V10 L8 13.5 z', W2) + P('M1.5 8 H14.5 M8 4.5 V11.5', 'none', SKF, 1);
  OWN.convertSM = wbox(1.5, 2.5, 9, 9, 3) + U('M8.5 5.5 H10.5 L12 4 V13 L10.5 14.5 H8.5 z', B2) + F('M10.5 5.5 L12 4 V13 L10.5 14.5 z', B3) + U('M1.5 5.5 L4.5 2.5 H13.5 L12 4 L10.5 5.5 z', B1) + P('M3.5 5.5 L6.5 2.5', 'none', NV, 0.7);
  OWN.sweptFlange = W('M3.5 9.5 H11.5 L13.5 11.5 V13 H5.5 L3.5 11 z', W2) + U('M2.5 3.5 L5.5 1.5 H12.5 Q14.5 2 14.5 4.5 V8.5 L12.5 9.5 V5.5 Q12.5 4 11.5 4 H6 L4.5 5 V9 L2.5 8 z', B2) + F('M3 3.8 L5.6 2 H12 L10.6 3.5 H5.5 z', B1);
  OWN.loftedBend = U('M5.5 3.5 V7.5 L2.5 11.5 L8 14.5 L13.5 11.5 L10.5 7.5 V3.5 z', B2) + F('M8 4.6 H10.4 V7.6 L13.2 11.4 L8 14.2 z', B3) + P('M8 4.6 V14.5', 'none', NV, 1) + E(8, 3.5, 2.5, 1.1, W1, OL, 1);
  // the Corners flyout: an L bracket with its corner in blue
  // swparticons (rfNE): the Corners flyout on one open box corner (a base, the back wall and the left wall meeting at
  // the back left), each command's change in blue and big enough to tell apart at 16 px
  var SWP_CBASE = W('M1.5 11.5 L5.5 7.5 H14.5 L10.5 11.5 z', W1) + W('M1.5 11.5 H10.5 V13.5 H1.5 z', W2) + W('M10.5 11.5 L14.5 7.5 V9.5 L10.5 13.5 z', W3);
  function swpCorner(back, left) { return SWP_CBASE + (back || W('M5.5 7.5 V1.5 H14.5 V7.5 z', W2)) + (left || W('M1.5 11.5 V5.5 L5.5 1.5 V7.5 z', W3)); }
  var CORNER = swpCorner();
  OWN.breakCorner = swpCorner(W('M5.5 7.5 V1.5 H9.5 A5 5 0 0 1 14.5 6.5 V7.5 z', W2) + U('M9.5 1.5 L10.5 0.5 A5 5 0 0 1 15.5 5.5 L14.5 6.5 A5 5 0 0 0 9.5 1.5 z', B2));
  OWN.closedCorner = swpCorner(null, U('M1.5 11.5 V5.5 L5.5 1.5 V7.5 z', B2) + U('M5.5 1.5 H7.5 V7.5 H5.5 z', B3));
  OWN.weldedCorner = CORNER + C(5.5, 2.6, 1.3, B2, NV, 1) + C(5.5, 5, 1.3, B2, NV, 1) + C(5.5, 7.4, 1.3, B2, NV, 1);
  OWN.cornerRelief = CORNER + C(5.5, 7.5, 2.4, B3, NV, 1) + F('M4 7.1 A1.7 1.7 0 0 1 7 6.4 A2.5 2.5 0 0 0 4 7.1 z', B1);
  OWN.formingTool = W('M6.5 8.5 H9.5 V13 Q8 14.5 6.5 13 z', W2) + W('M1.5 5.5 H5 Q5.5 3.5 8 3.5 Q10.5 3.5 11 5.5 H14.5 V7.5 H10.5 Q10 8.5 8 8.5 Q6 8.5 5.5 7.5 H1.5 z', W1) + U('M4.5 5.5 Q5 2 8 2 Q11 2 11.5 5.5 Q10.5 3.6 8 3.6 Q5.5 3.6 4.5 5.5 z', B1);
  OWN.forming = OWN.formingTool;
  OWN.vent = R(2.5, 2.5, 11, 11, W1, OL, 1) + C(8, 8, 4, 'none', OL, 0.9) + C(8, 8, 1.8, 'none', OL, 0.9) + P('M8 3 V13 M3 8 H13 M4.5 4.5 L11.5 11.5 M11.5 4.5 L4.5 11.5', 'none', OL, 0.7);
  // swparticons (rfNE): the Forming Tool flyout on a plate that fills the icon (they were specks on a small plate at 16 px)
  var SWP_FPLATE = W('M0.5 13.5 L4.5 8.5 H15.5 L11.5 13.5 z', W1) + W('M0.5 13.5 H11.5 V15 H0.5 z', W2) + W('M11.5 13.5 L15.5 8.5 V10 L11.5 15 z', W3);
  OWN.ftDimple = SWP_FPLATE + U('M3.5 12 C3.5 5 12.5 5 12.5 12 z', B2) + F('M5.2 9.6 C5.6 7.4 7.4 6.6 9 6.8 C7.2 7.4 6.2 8.4 5.2 9.6 z', B1);
  OWN.ftExtrudedHole = SWP_FPLATE + U('M4.5 11.5 V4.5 H11.5 V11.5 A3.5 1.2 0 0 1 4.5 11.5 z', B2) + F('M9.5 5 H11.5 V11.4 A3.5 1.2 0 0 1 9.5 12.4 z', B3) + E(8, 4.5, 3.5, 1.4, B1, NV, 1) + E(8, 4.6, 2, 0.75, B4, NV, 0.8);
  OWN.ftLouver = SWP_FPLATE + U('M3 12.5 L5.5 4.5 H14 L11.5 12.5 z', B1) + U('M5.5 4.5 H14 L13.2 7 H4.7 z', '#1f3a4a');
  OWN.ftLance = SWP_FPLATE + U('M2 12.5 L4.5 5.5 H11.5 L14 12.5 H11.6 L10 8.5 H6 L4.4 12.5 z', B2) + F('M4.8 6 H11.2 L11.5 6.9 H4.5 z', B1);
  OWN.ftRib = SWP_FPLATE + U('M2.6 11.2 L10.6 4.4 A1.9 1.9 0 0 1 13.4 6.9 L5.4 13.7 A1.9 1.9 0 0 1 2.6 11.2 z', B2) + F('M3.4 10.8 L10.8 4.9 A1.2 1.2 0 0 1 12.2 5.3 L4.6 11.5 z', B1);
  OWN.unfold = plateWall('w') + plateBase('u') + P('M4.5 2.5 Q0.5 3.5 1.8 8.2', 'none', INK, 1.9) + head(2.2, 10.2, 0.2, 1, INK, 3.2);
  OWN.fold = plateBase('w') + plateWall('u') + P('M2 10 Q0.6 5.5 3.6 3', 'none', INK, 1.9) + head(5.4, 1.8, 1, -0.65, INK, 3.2);
  OWN.flatten = W('M1.5 8 L7.5 4.5 L14.5 8.5 L8.5 12 z', W1) + W('M1.5 8 L8.5 12 V13.5 L1.5 9.5 z', W3) + W('M8.5 12 L14.5 8.5 V10 L8.5 13.5 z', W2) + P('M3.5 6.8 L10.5 10.8 M5.5 5.7 L12.5 9.7', 'none', GD, 0.7);
  OWN.noBends = plateBase('w') + plateWall('w') + C(11.5, 11.5, 3, W1, R2, 1.5) + P('M9.4 13.6 L13.6 9.4', 'none', R2, 1.5);
  OWN.insertBends = plateBase('w') + plateWall('w') + U('M5.5 6 H13.5 V8 Q13.5 9.8 11.8 10.5 H3.8 Q5.5 9.8 5.5 8 z', B2) + F('M6 6.5 H13 V7.4 H6 z', B1);   // swparticons: a blue rounded bend where the plates meet
  OWN.rip = SWP_CBASE + W('M7 7.5 V1.5 H14.5 V7.5 z', W2) + W('M1.5 11.5 V5.5 L4.5 2.5 V8.5 z', W3) + U('M4.5 2.5 L5.5 1.5 V7.5 L4.5 8.5 z', B2) + U('M7 1.5 H8 V7.5 H7 z', B3);   // swparticons: the box corner ripped open, the cut faces blue

  // ================================================================== Evaluate
  // Measure: a yellow tape rule
  OWN.measure = P('M1.5 9.5 L10.5 1.5 L14.5 5.5 L5.5 14.5 z', Y2, YO, 1) + P('M4 10.3 L5.3 11.6 M6 8.5 L8 10.5 M8 6.7 L9.3 8 M10 4.9 L12 6.9', 'none', YO, 0.8);
  OWN.mass = wbox(1.5, 4.5, 8, 7, 3) + P('M8.5 2.5 V6.5 M6.5 4.5 H10.5', 'none', R2, 1.1) + C(8.5, 4.5, 1.6, 'none', R2, 0.9);
  OWN.section = [
    cyl(8, 4.5, 12, 5.5, 2, W2, W1, OL) + U('M2.5 4.5 H5.5 V13.3 Q3.5 13 2.5 12 z', B2) + U('M10.5 4.5 H13.5 V12 Q12.5 13 10.5 13.3 z', B2),
    P('M2.5 5 A5.5 2.2 0 0 1 13.5 5 V11.5 A5.5 2.2 0 0 1 2.5 11.5 z', W2, OL, 1) + P('M5.5 5.5 A2.5 1.2 0 0 1 10.5 5.5 V13 H5.5 z', W3, OL, 1) + U('M2.5 5 H5.5 V13.2 Q3.5 13 2.5 11.5 z', B2) + U('M10.5 5 H13.5 V11.5 Q12.5 13 10.5 13.2 z', B2) + P('M3.2 7.5 L5 5.6 M3.2 10 L5 8.1 M3.4 12.2 L5 10.6 M11 7.5 L12.8 5.6 M11 10 L12.8 8.1 M11 12.5 L12.8 10.6', 'none', NV, 0.6)];

  // ================================================================== View: the Heads-up View toolbar
  function arrows4(mx, my, a) { return F('M' + mx + ' ' + r2(my - a) + ' l1 1.3 h-2 z M' + mx + ' ' + r2(my + a) + ' l1 -1.3 h-2 z M' + r2(mx - a) + ' ' + my + ' l1.3 -1 v2 z M' + r2(mx + a) + ' ' + my + ' l-1.3 -1 v2 z', GD); }
  OWN.vZoomFit = mag(9.5, 6.5, 5) + arrows4(9.5, 6.5, 3.2);
  OWN.fit = OWN.vZoomFit;
  OWN.zoomArea = R(8.5, 1.5, 6, 6, 'none', GD, 0.8, 'stroke-dasharray="1.2 1"') + mag(9, 7, 4.5);
  OWN.prevView = mag(10, 5.5, 4) + barrow(15, 11.5, 8.5, 11.5, 1, 2.5, 3, B2, NV);
  OWN.orient = P('M2.5 5.5 H10.5 V13.5 H2.5 z', B1, NV, 1) + P('M2.5 5.5 L5.5 2.5 H13.5 L10.5 5.5 M13.5 2.5 V10.5 L10.5 13.5', 'none', OL, 0.9) + ar(8, 0.5, 8, 4.4, INK, 0.9, 1.8) + ar(15.5, 8, 11.6, 8, INK, 0.9, 1.8);
  var DCUBE = 'M2.5 4.5 L8 6.5 V14.5 L2.5 12 z', DCUBE2 = 'M8 6.5 L13.5 4.5 V12 L8 14.5 z', DTOP = 'M2.5 4.5 L8 2.5 L13.5 4.5 L8 6.5 z';
  OWN.display = U(DCUBE, B2) + W(DCUBE2, W1) + P(DTOP, B1, GD, 1);
  OWN.dsShadedEdges = OWN.display;
  OWN.dsShaded = F(DCUBE, B2) + F(DCUBE2, B3) + F(DTOP, B1);
  OWN.dsHLR = P(DCUBE, W1, OL, 1) + P(DCUBE2, W1, OL, 1) + P(DTOP, W1, OL, 1);
  OWN.dsHLV = OWN.dsHLR + P('M2.5 12 L8 10 L13.5 12 M8 10 V2.5', 'none', GD, 1.5, 'stroke-dasharray="2 1.2"');   // swparticons: hidden edges dashed and as heavy as the outline
  OWN.dsWireframe = P(DCUBE, 'none', INK, 1) + P(DCUBE2, 'none', INK, 1) + P(DTOP, 'none', INK, 1) + P('M2.5 12 L8 10 L13.5 12 M8 10 V2.5', 'none', INK, 1);
  OWN.hideshow = P('M1.5 8 Q8 1.5 14.5 8 Q8 14.5 1.5 8 z', W1, OL, 1) + C(8, 8, 2.8, GR, OL, 1) + F('M8 5.2 A2.8 2.8 0 0 1 8 10.8 z', '#1c1c1c');
  function pencil(x, y) { return P('M' + x + ' ' + y + ' l4 -4 l2 2 l-4 4 z', Y3, YO, 1) + P('M' + x + ' ' + y + ' l-0.8 2.8 l2.8 -0.8 z', '#e9c3a4', YO, 1); }
  OWN.appearance = ball(7, 7, 5.5) + pencil(9.5, 12.5);
  OWN.scene = ball(8, 6, 4.5) + R(1.5, 10.5, 13, 4, W1, OL, 1) + F('M1.5 10.5 h3.25 v2 h-3.25 z M8 10.5 h3.25 v2 h-3.25 z M4.75 12.5 h3.25 v2 h-3.25 z M11.25 12.5 h3.25 v2 h-3.25 z', '#2a2a2a');
  OWN.settings = P('M5.5 14 H10.5 L9.5 11.5 H6.5 z', GR, OL, 1) + R(1.5, 2.5, 13, 9, GD, OL, 1) + F('M2.6 3.6 h10.8 v6.8 h-10.8 z', '#eef0f2') + F('M2.6 3.6 h10.8 l-10.8 5 z', '#fefefe');
  // swparticons (rfNE): the three backgrounds (one drawing before): gradient bands, plain white, dark
  function swpBg(fill) { return fill + R(1.5, 2.5, 13, 11, 'none', INK, 1); }
  OWN.vBgGradient = swpBg(F('M1.5 2.5 H14.5 V6.5 H1.5 z', '#fefefe') + F('M1.5 6.5 H14.5 V10 H1.5 z', '#d3dce6') + F('M1.5 10 H14.5 V13.5 H1.5 z', '#9fb2c6'));
  OWN.vBgPlain = swpBg(F('M1.5 2.5 H14.5 V13.5 H1.5 z', '#fefefe'));
  OWN.vBgDark = swpBg(F('M1.5 2.5 H14.5 V13.5 H1.5 z', '#3a3d42') + F('M3 4 H8 V5 H3 z', '#6b7078'));

  // ================================================================== the chrome: Quick Access toolbar, managers, tree, Task Pane
  OWN.home = P('M3.5 8 V14.5 H12.5 V8', W1, OL, 1) + P('M1.5 8.5 L8 2.5 L14.5 8.5', 'none', B3, 1.9) + R(7, 10.5, 2.5, 4, W3, OL, 1);
  OWN.newDoc = page(3.5, 1.5, 9, 13, 3.5);
  OWN.openDoc = P('M1.5 4.5 h4 l1.5 1.5 h6.5 v8 h-12 z', W3, OL, 1) + P('M1.5 14 L4 8.5 H15.5 L13 14 z', W1, OL, 1) + barrow(6.5, 1.5, 9.5, 7, 0.9, 2.4, 2.8, G2, GO);
  OWN.saveDoc = P('M1.5 1.5 H12.5 L14.5 3.5 V14.5 H1.5 z', B2, NV, 1) + R(4.5, 1.5, 7, 5, W1, NV, 1) + R(4.5, 9.5, 7, 5, B3, NV, 1) + F('M6 10.5 h2 v3 h-2 z', W1);
  OWN.printDoc = R(4.5, 1.5, 7, 5, W1, OL, 1) + P('M1.5 6.5 H14.5 V12.5 H1.5 z', W3, OL, 1) + R(4.5, 10.5, 7, 4, B2, NV, 1) + F('M2.5 7.5 h11 v1 h-11 z', W1);
  function turn(d, hx, hy, ux, uy) { return L(d, NV, 4, BUTT) + L(d, B2, 2, BUTT) + P('M' + hx + ' ' + hy + ' l' + r2(-ux * 4.5 - uy * 3.4) + ' ' + r2(-uy * 4.5 + ux * 3.4) + ' l' + r2(uy * 6.8) + ' ' + r2(-ux * 6.8) + ' z', B2, NV, 1); }
  OWN.undo = turn('M5 6 H9.5 A4 4 0 0 1 9.5 14 H7', 1, 6, -1, 0);
  OWN.redo = turn('M11 6 H6.5 A4 4 0 0 0 6.5 14 H9', 15, 6, 1, 0);
  OWN.select = P('M4.5 1.5 V13 L7.3 10.5 L9.3 15 L11.3 14.1 L9.3 9.8 H13 z', W1, OL, 1);
  OWN.rebuild = P('M5 0.5 h6 a2 2 0 0 1 2 2 v11 a2 2 0 0 1 -2 2 h-6 a2 2 0 0 1 -2 -2 v-11 a2 2 0 0 1 2 -2 z', '#2b2b2b', '#111111', 1) + C(8, 4.5, 2.4, R2, RO, 0.8) + C(8, 11.5, 2.4, G2, GO, 0.8) + F('M6.6 3.6 a1.2 1 0 0 1 1.8 -0.6 z', '#ff9a8a') + F('M6.6 10.6 a1.2 1 0 0 1 1.8 -0.6 z', '#9af08a');
  OWN.fileProps = R(1.5, 1.5, 13, 13, W1, OL, 1) + R(3.5, 3.5, 2.5, 2, B2, NV, 1) + R(3.5, 7, 2.5, 2, B2, NV, 1) + R(3.5, 10.5, 2.5, 2, B2, NV, 1) + T('M7.5 4.5 H12.5 M7.5 8 H12.5 M7.5 11.5 H12.5');
  OWN.options = ['<circle cx="8" cy="8" r="5.4" fill="none" stroke="' + INK + '" stroke-width="2.2" stroke-dasharray="2.12 2.12" stroke-dashoffset="1.06"/>' + C(8, 8, 4.5, GL, INK, 1) + C(8, 8, 1.8, W2, INK, 1), gear(8, 8, 5, GL, OL)];
  OWN.search = P('M10.5 10.5 L14.5 14.5', 'none', INK, 1.9) + C(6.5, 6.5, 4.5, 'none', INK, 1.5);
  OWN.help = C(8, 8, 6.5, 'none', INK, 1.1) + '<path d="M6 6.2 a2 2 0 1 1 3.1 1.7 q-1.1 0.7 -1.1 1.9" fill="none" ' + st(INK, 1.5) + '/><circle cx="8" cy="12" r="0.9" fill="' + INK + '" stroke="none"/>';
  // the FeatureManager's tab row
  OWN.part = partBlock(Y1, Y2, Y3, YO);
  OWN.tree = OWN.part;
  OWN.pm = R(1.5, 2.5, 13, 11, W1, OL, 1) + F('M2 3 h12 v2 h-12 z', B3) + R(3.5, 6.5, 2.5, 1.5, B2, NV, 0.8) + R(3.5, 9, 2.5, 1.5, B2, NV, 0.8) + R(3.5, 11.5, 2.5, 1.5, B2, NV, 0.8) + T('M7.5 7.2 H12.5 M7.5 9.7 H12.5 M7.5 12.2 H12.5');
  OWN.config = P('M3.5 1.5 V14.5 M3.5 4.5 H7 M3.5 11 H7', 'none', INK, 1.5) + R(7.5, 2.5, 5, 4.5, W1, OL, 1) + R(7.5, 9, 5, 4.5, W1, OL, 1);
  OWN.dimx = C(8, 8, 4.5, 'none', INK, 1.9) + P('M8 1 V15 M1 8 H15', 'none', INK, 1.5);
  OWN.dispman = ball(8, 8, 6);
  // the tree's rows
  OWN.folderHistory = folder(C(8, 10, 3, W1, B3, 1) + P('M8 8.2 V10.1 L9.5 10.9', 'none', B3, 0.9));
  OWN.sensor = folder(C(8, 10, 3, W1, OL, 1) + P('M8 10 L9.8 8.3', 'none', R2, 1.3));
  OWN.annotations = folder(txt(8, 13.6, 9, 'A', B3, 700, 'Georgia, Times New Roman, serif'));
  OWN.equations = folder(txt(8, 13.4, 8.5, '&#931;', INK, 700));
  OWN.folder = P('M1.5 2.5 h4.5 l1.5 1.5 h7 v10.5 h-13 z', W3, OL, 1) + P('M1.5 5.5 h13 v9 h-13 z', W1, OL, 1);
  OWN.folderCut = R(1.5, 1.5, 9, 7, W1, OL, 1) + F('M2 2 h8 v1.6 h-8 z', B2) + T('M1.5 6 H10.5 M4.5 3.5 V8.5 M7.5 3.5 V8.5') + P('M4.5 10.5 V14.5 H14.5 V6.5 H12.5', 'none', OL, 1) + C(9.5, 10.5, 2, Y3, OR, 1);
  OWN.folderSolid = folder(P('M5 9 l3 -1.3 l3 1.3 v3.2 l-3 1.3 l-3 -1.3 z', B2, NV, 0.9) + P('M5 9 l3 1.3 l3 -1.3 M8 10.3 V13.5', 'none', NV, 0.6));
  OWN.material = P('M5.5 3.5 H14.5 M5.5 8 H14.5 M5.5 12.5 H9.5', 'none', INK, 1.5) + C(2.5, 3.5, 1.3, W1, GD, 0.9) + C(2.5, 8, 1.3, B2, NV, 0.9) + C(2.5, 12.5, 1.3, Y3, YO, 0.9) + C(12.5, 12.5, 2.2, GD, OL, 1) + C(12.5, 12.5, 0.8, W1, 'none');
  OWN.body = ubox(2.5, 2.5, 8, 8, 3);
  OWN.folderFlat = folder(P('M3.5 10.5 L8 8 L12.5 10.5 L8 13 z', W2, OL, 0.8) + P('M5.7 9.3 L10.2 11.8', 'none', GD, 0.6));
  OWN.filter = P('M1.5 1.5 H14.5 V3 L9.5 8.5 V14.5 L6.5 13 V8.5 L1.5 3 z', W1, OL, 1) + F('M2 2 h12 v1 h-12 z', B2);
  OWN.imported = wbox(4.5, 4.5, 7, 7, 3) + barrow(0.5, 4.5, 6.5, 4.5, 0.9, 2.3, 2.6, G2, GO);
  // the Task Pane tabs
  OWN.library = P('M2.5 2.5 h3 v11 h-3 z', B2, NV, 1) + P('M6.5 2.5 h3 v11 h-3 z', W1, OL, 1) + P('M10.6 3.4 l2.8 -0.8 l2 10 l-2.8 0.8 z', Y2, YO, 1);
  OWN.explorer = P('M1.5 3.5 h4.5 l1.5 1.5 h7 v9 h-13 z', W3, OL, 1) + P('M1.5 14 L4 7.5 H15.5 L13 14 z', W1, OL, 1);
  OWN.palette = R(1.5, 1.5, 5.5, 5.5, B1, NV, 1) + R(9, 1.5, 5.5, 5.5, W1, OL, 1) + R(1.5, 9, 5.5, 5.5, W1, OL, 1) + R(9, 9, 5.5, 5.5, W1, OL, 1);
  OWN.props = R(2.5, 1.5, 11, 13, W1, OL, 1) + R(4.5, 4, 2, 2, B2, NV, 0.8) + R(4.5, 7.5, 2, 2, B2, NV, 0.8) + R(4.5, 11, 2, 2, B2, NV, 0.8) + T('M8 5 H11.5 M8 8.5 H11.5 M8 12 H11.5');
  // PropertyManager: OK, Cancel, OK and repeat, the pushpin; marks
  OWN.ok = P('M2 8.5 L6 12.5 L14 3.5', 'none', GO, 4.2) + P('M2 8.5 L6 12.5 L14 3.5', 'none', G2, 2.4);
  OWN.cancel = P('M3 3 L13 13 M13 3 L3 13', 'none', RO, 4.2) + P('M3 3 L13 13 M13 3 L3 13', 'none', '#de4a3c', 2.4);   // a red that keeps 3 : 1 on the dark panel
  OWN.error = C(8, 8, 6.5, R2, RO, 1) + '<path d="M5.5 5.5 L10.5 10.5 M10.5 5.5 L5.5 10.5" fill="none" ' + st('#fefefe', 1.9) + '/>';
  OWN.warn = P('M8 1.5 L15 14 H1 z', Y3, YO, 1) + P('M8 6 V10', 'none', '#1c1c1c', 1.5) + C(8, 12, 0.8, '#1c1c1c', 'none');
  // assemblies: the assembly document, a component
  OWN.assembly = box(1.5, 5.5, 7, 6, 3, Y2, Y1, Y3, YO) + box(8.5, 1.5, 4, 5, 2, W2, W1, W3, OL);
  OWN.component = partBlock(W1, W2, W3, OL);
  // swparticons (rfNE): drawing tables and sheet rows that looked alike at 16 px: one table with the thing it lists
  function swpTable() { return R(1.5, 1.5, 11, 9, PAPER, INK, 1) + T('M1.5 4.5 H12.5 M1.5 7.5 H12.5 M5.5 1.5 V10.5'); }
  OWN.holeTable = swpTable() + C(11.5, 11.5, 3.6, W1, OL, 1) + C(11.5, 11.5, 2, B3, NV, 1);
  OWN.punchTable = swpTable() + U('M7.5 15 C7.5 8 15.5 8 15.5 15 z', B2) + F('M9.2 12.6 C9.6 10.6 11.2 9.9 12.6 10 C11 10.6 10 11.4 9.2 12.6 z', B1);
  OWN.bendNote = swpTable() + U('M8.5 15 V9.5 Q8.5 8 10 8 H15.5 V10 H11 Q10.5 10 10.5 10.5 V15 z', B2);
  OWN.sheet = R(1.5, 2.5, 13, 11, PAPER, INK, 1) + R(3.5, 4.5, 6, 5, '#8fc3dc', NV, 1) + T('M10.5 10.5 H14.5 M10.5 10.5 V13.5');   // a view in VIEWB (defined below): fills stay under 200 on the dark tree (rfGZ)
  OWN.sheetFormat = R(1.5, 2.5, 13, 11, PAPER, INK, 1) + R(3, 4, 10, 8, 'none', INK, 0.8) + R(7.5, 9, 5.5, 3, B2, NV, 1) + P('M10 9 V12 M7.5 10.5 H13', 'none', NV, 0.7);

  // @@MORE

  // ================================================================== the restyle: Anvil's drawing in this palette
  // grey solids -> white bodies with the dark outline; the feature yellow -> blue faces with a navy outline; an
  // unfilled main stroke in the ink -> the sketch blue (thin ink lines, dimensions and axes, stay dark); a grey sketch
  // point -> the white square; the Shell cavity's dark grey -> the deep blue. Paper, green, red and the pencil stay.
  var VIEWB = '#8fc3dc';   // a drawing view (Anvil's #c4c4c4)
  var FMAP = {
    '#ffe57a': B1, '#f5c400': B2, '#c08f00': B3, '#a07600': B3, '#f6d77a': B1, '#f9e3a0': B1, '#f3cf6b': B1, '#b48a1c': B3, '#e8a23a': B2,
    '#6e6e6e': B4, '#5a5a5a': B4,
    'rgba(245,196,0,0.72)': 'rgba(105,172,202,0.6)',   // the far face of a standard-view cube
    '#f0c987': B2, '#f8e2b8': B1, '#d9a95a': B3, '#fbeed6': B1, '#e8c58c': B2, '#e8d3a8': B1, '#c4c4c4': VIEWB
  };
  var BLUE = {}; Object.keys(FMAP).forEach(function (k) { BLUE[FMAP[k]] = 1; });
  var SMAP = { '#f5c400': SKF, '#ffe57a': B2, '#c08f00': NV, '#a07600': SKF, '#b48a1c': NV };
  var KEEP = { '#fff': 1, '#ffffff': 1, '#f4f4f4': 1, '#f6f6f6': 1 };
  var SHAPE = /<(path|rect|circle|ellipse|polygon|polyline|line)\b([^>]*?)\s*(\/?)>/g;
  function attr(a, n) { var m = new RegExp('(?:^|\\s)' + n + '="([^"]*)"').exec(a); return m ? m[1] : null; }
  function setAttr(a, n, v) { var re = new RegExp('(^|\\s)' + n + '="[^"]*"'); return re.test(a) ? a.replace(re, '$1' + n + '="' + v + '"') : a + ' ' + n + '="' + v + '"'; }
  // a neutral grey's level (0-255), or null for a colour
  function grey(hex) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(hex);
    if (!m) return null;
    var r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return Math.abs(r - g) <= 6 && Math.abs(g - b) <= 6 ? g : null;
  }
  function lighten(v) { var n = Math.round(255 - (255 - v) * 0.4), h = (n < 16 ? '0' : '') + n.toString(16); if (n >= 0xf3) h = n >= 0xfa ? 'fe' : 'f1'; return '#' + h + h + h; }
  function restyleShape(all, tag, a, close) {
    var fill = (attr(a, 'fill') || '').toLowerCase(), stroke = (attr(a, 'stroke') || '').toLowerCase(), w = parseFloat(attr(a, 'stroke-width') || '1');
    var filled = !!fill && fill !== 'none', stroked = !!stroke && stroke !== 'none', ink = stroke === 'currentcolor', g;
    if (tag === 'path' && !attr(a, 'fill')) filled = false;
    if (filled && !stroked && fill === '#6d6d6d') {
      if (tag === 'rect' && parseFloat(attr(a, 'width')) <= 2.6 && parseFloat(attr(a, 'height')) <= 2.6) return pt(parseFloat(attr(a, 'x')) + parseFloat(attr(a, 'width')) / 2, parseFloat(attr(a, 'y')) + parseFloat(attr(a, 'height')) / 2);
    }
    if (filled) {
      if (KEEP[fill]) { /* paper, a drawing view: as they are */ }
      else if (FMAP[fill]) {
        a = setAttr(a, 'fill', FMAP[fill]);
        if (stroked && (ink || SMAP[stroke] || stroke === fill)) a = setAttr(a, 'stroke', stroke === fill && !ink ? FMAP[fill] : NV);
      } else if ((g = grey(fill)) != null && g >= 0x70 && fill !== '#6d6d6d') {
        a = setAttr(a, 'fill', lighten(g));
        if (ink) a = setAttr(a, 'stroke', OL);
        else if (stroked && stroke === fill) a = setAttr(a, 'stroke', lighten(g));
        else if (stroked && grey(stroke) != null) a = setAttr(a, 'stroke', OL);
      } else if (stroked && SMAP[stroke]) a = setAttr(a, 'stroke', SMAP[stroke]);
    } else if (stroked) {
      if (ink) { if (w >= 1.3 && !attr(a, 'stroke-dasharray')) a = setAttr(a, 'stroke', SK); }
      else if (SMAP[stroke]) a = setAttr(a, 'stroke', SMAP[stroke]);
    }
    return '<' + tag + a + (close ? '/' : '') + '>';
  }
  // the size icons.js really draws at (an 18 px box holds a 16 px drawing)
  function drawn(size) {
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1, k = size / 16 * dpr, n = Math.floor(k + 1e-6);
    return (n >= 1 && k - n > 0.01 && k / n - 1 <= 0.13 ? n : k) * 16 / dpr;
  }
  // the sketch blue follows the theme a little: darker on the light chrome, lighter on the dark one
  function finish(body) {
    return body.replace(/(fill|stroke)="@SK"/g, '$1="#2f7ca3" style="$1:color-mix(in srgb, currentColor 16%, #2c84b2)"');
  }
  function restyle(body, size) { return finish(String(body).replace(SHAPE, restyleShape)); }
  function body(name, size) {
    var d = OWN[name];
    if (d == null) return null;
    if (typeof d !== 'string') d = d[drawn(size || 32) >= 24 ? 1 : 0];
    return finish(d);
  }

  Icons.sets.register('solidworks', {
    body: body, restyle: restyle, has: function (name) { return OWN[name] != null; }, own: function () { return Object.keys(OWN); }, slots: [],
    palette: { outline: OL, body: [W1, W2, W3], navy: NV, blue: [B1, B2, B3], line: '#2f7ca3', yellow: [Y1, Y2, Y3], green: G2, red: R2, grey: GR }
  });
})();
