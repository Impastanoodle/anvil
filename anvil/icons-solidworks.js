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
  OWN.boundary = W(BND_FRONT, W2) + W(BND_SIDE, W3) + W(BND_TOP, W1) + BND_GRID;
  OWN.boundaryCut = W(BND_FRONT, W2) + W(BND_SIDE, W3) + U(BND_TOP, B1) + P('M6 6 L10.5 2.9 M3.5 6.5 Q6 3.6 8.8 6.2 Q10.3 7.4 12.5 6.5', 'none', NV, 0.7);
  function wand(x1, y1, x2, y2) {
    return L('M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2, '#1c1c1c', 2.2, BUTT) + L('M' + r2(x2 - (x2 - x1) * 0.25) + ' ' + r2(y2 - (y2 - y1) * 0.25) + ' L' + x2 + ' ' + y2, '#f6f6f6', 1.2, BUTT) +
      P('M' + r2(x2 + 1.5) + ' ' + r2(y2 - 3.5) + ' l0.6 1.3 1.3 0.6 -1.3 0.6 -0.6 1.3 -0.6 -1.3 -1.3 -0.6 1.3 -0.6 z', Y3, OR, 0.6) + P('M' + r2(x2 - 3) + ' ' + r2(y2 - 2.2) + ' l0.5 0.9 0.9 0.5 -0.9 0.5 -0.5 0.9 -0.5 -0.9 -0.9 -0.5 0.9 -0.5 z', Y3, OR, 0.6);
  }
  OWN.holeWizard = wbox(1.5, 3.5, 9, 9, 2) + C(6, 10, 2.8, B2, NV, 1) + F('M4 9.2 A2.6 2.6 0 0 1 8 8.3 A3.4 3.4 0 0 0 4 9.2 z', B4) + wand(8.5, 8, 13, 3.5);
  OWN.hole = wbox(1.5, 2.5, 10, 10, 2) + C(6.5, 9.5, 3, B2, NV, 1) + F('M4.3 8.6 A2.8 2.8 0 0 1 8.7 7.7 A3.7 3.7 0 0 0 4.3 8.6 z', B4);
  OWN.sweptCut = wbox(1.5, 1.5, 10, 10, 3) + U('M4.5 14.5 Q4.5 7.5 11.5 7.5 V10.5 Q7.5 10.5 7.5 14.5 z', B2) + F('M11.5 7.5 L13 6 V9 L11.5 10.5 z', B4);
  OWN.loftedCut = wbox(1.5, 1.5, 10, 10, 3) + U('M4.5 4.5 H9.5 L7.5 9.5 L8.5 14.5 H4.5 L5.5 9.5 z', B2) + F('M4.5 4.5 L6 3 H11 L9.5 4.5 z', B4);
  OWN.fillet = W('M1.5 8.5 H10.5 V14.5 H1.5 z', W2) + W('M10.5 8.5 C10.5 7 11.5 6.5 12.5 6.5 L14.5 4.5 V10.5 L10.5 14.5 z', W3) + W('M3.5 6.5 L5.5 4.5 H14.5 L12.5 6.5 z', W1) +
    U('M1.5 8.5 C1.5 7 2.5 6.5 3.5 6.5 H12.5 C11.5 6.5 10.5 7 10.5 8.5 z', B2) + F('M3 7 H11.4 L11 7.6 H2.4 z', B1);
  OWN.chamfer = W('M1.5 8.5 H10.5 V14.5 H1.5 z', W2) + W('M10.5 8.5 L12.5 6.5 L14.5 4.5 V10.5 L10.5 14.5 z', W3) + W('M3.5 6.5 L5.5 4.5 H14.5 L12.5 6.5 z', W1) + U('M1.5 8.5 L3.5 6.5 H12.5 L10.5 8.5 z', B2);
  function tab(x, y, fill, ol) { return P('M' + x + ' ' + y + ' h3 v1.5 h1.5 v2 h-1.5 v1.5 h-3 z', fill, ol, 1); }
  function tabL(x, y, fill, ol) { return P('M' + x + ' ' + y + ' h-3 v1.5 h-1.5 v2 h1.5 v1.5 h3 z', fill, ol, 1); }
  OWN.lpattern = tab(2.5, 1.5, B2, NV) + tab(9.5, 1.5, W1, OL) + tab(2.5, 9.5, W1, OL) + tab(9.5, 9.5, W1, OL);
  OWN.cpattern = C(8, 8, 5, 'none', GD, 0.9) + R(6, 0.5, 4, 4, B2, NV, 1) + R(11.5, 6, 4, 4, W1, OL, 1) + R(6, 11.5, 4, 4, W1, OL, 1) + R(0.5, 6, 4, 4, W1, OL, 1);
  OWN.mirror = tab(1.5, 5.5, B2, NV) + tabL(14.5, 5.5, W1, OL) + T('M8 1.5 V14.5');
  OWN.shell = wbox(1.5, 1.5, 10, 10, 3) + U('M3.5 6.5 H9.5 V12.5 H3.5 z', B2) + F('M3.5 6.5 H5.5 V10.5 L3.5 12.5 z', B3) + F('M3.5 12.5 L5.5 10.5 H9.5 V12.5 z', B1) + P('M5.5 6.5 V10.5 H9.5 M5.5 10.5 L3.5 12.5', 'none', NV, 0.7) + R(3.5, 6.5, 6, 6, 'none', NV, 1);
  OWN.draft = U('M1.5 4.5 L6.5 1.5 L14.5 6.5 L9.5 9.5 z', B1) + U('M1.5 4.5 L9.5 9.5 V14.5 H1.5 z', B2) + W('M9.5 9.5 L14.5 6.5 V11.5 L9.5 14.5 z', W1);
  OWN.rib = W('M9.5 3.5 L11.5 1.5 H14.5 V11.5 L12.5 13.5 V3.5 z', W3) + W('M9.5 3.5 H12.5 V13.5 H9.5 z', W1) + W('M1.5 11.5 H9.5 V14.5 H1.5 z', W2) + W('M1.5 11.5 L3.5 9.5 H9.5 V11.5 z', W1) + U('M9.5 4.5 L3.5 11.5 H9.5 z', B2) + F('M9 6 L4.8 11 H6 L9 7.5 z', B1);
  OWN.wrap = cyl(8, 4, 12, 6.5, 2.2, W2, W1, OL) + U('M1.5 7 A6.5 2.2 0 0 0 14.5 7 V10 A6.5 2.2 0 0 1 1.5 10 z', B2) + P('M5 8.6 V11.5 M11 8.6 V11.5', 'none', NV, 0.7) + F('M2 7.9 A6.5 2.2 0 0 0 7.5 9.2 V10 A6.5 2.2 0 0 1 2 8.8 z', B1);
  OWN.intersect = U('M1.5 8.5 Q5 5.5 8.5 7.5 L11.5 13 Q7 11.5 2.5 14.5 z', B2) + wbox(6.5, 1.5, 5.5, 5.5, 2.5);
  // reference geometry: a blue plane; in the tree a plane is white with its centre line
  var PLANE = 'M3.5 4.5 L12.5 2.5 V11.5 L3.5 13.5 z';
  OWN.plane = U(PLANE, B1) + F('M4 9 L12 7 V11.1 L4 13 z', B2) + P(PLANE, 'none', NV, 1);
  OWN.planeSmall = W(PLANE, '#eceef0') + T('M8 1.5 V14.5', DASHDOT);
  OWN.refgeo = U('M5.5 5.5 L13.5 3.5 V11.5 L5.5 13.5 z', B1) + T('M9.5 1.5 V15', DASHDOT) + C(3, 3, 1.8, B2, NV, 1);
  OWN.refAxis = U(PLANE, B1) + P('M8 0.5 V15.5', 'none', INK, 1.5, DASHDOT);
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
  OWN.centerline = L('M2.5 13.5 L13.5 2.5', SK, 1.5, DASHDOT) + pt(2.5, 13.5) + pt(13.5, 2.5);
  OWN.midline = L('M2.5 13.5 L13.5 2.5') + pt(2.5, 13.5) + pt(13.5, 2.5) + pt(8, 8);
  OWN.circle = C(8, 8, 5.5) + cx(8, 8) + pt(12.5, 4.5) + pt(2.5, 8.5) + pt(10.5, 13);
  OWN.pcircle = C(8, 8, 5.5) + pt(12.5, 4.5) + pt(2.5, 8.5) + pt(10.5, 13);
  OWN.spline = L('M2.5 13.5 C4.5 -3 8 19 13.5 2.5');
  OWN.rect = R(2.5, 4.5, 11, 8, 'none', SK, 1.5) + pt(8, 8.5) + pt(13.5, 4.5);
  OWN.crect = R(2.5, 4.5, 11, 8, 'none', SK, 1.5) + T('M2.5 4.5 L13.5 12.5 M13.5 4.5 L2.5 12.5', DASH) + pt(8, 8.5) + pt(13.5, 4.5);
  OWN.arc = L('M2.5 11.5 A5.6 5.6 0 0 1 13.5 11.5') + cx(8, 11.5) + pt(2.5, 11.5) + pt(13.5, 11.5) + pt(8, 6);
  OWN.arc3 = L('M2.5 12.5 A7 7 0 0 1 13.5 12.5') + pt(2.5, 12.5) + pt(13.5, 12.5) + pt(8, 5.5);
  OWN.tarc = L('M1.5 12.5 H6.5', GD, 1.1) + L('M6.5 12.5 A6 6 0 0 0 12.5 6.5 V3.5') + pt(6.5, 12.5) + pt(12.5, 3.5);
  OWN.ellipse = '<ellipse cx="8" cy="8" rx="6.3" ry="4" fill="none" transform="rotate(-28 8 8)" ' + st(SK, 1.5) + '/>' + pt(8, 8);
  OWN.pellipse = '<path d="M13.6 5 A6.3 4 -28 1 0 11 12.6" fill="none" ' + st(SK, 1.5) + '/>' + pt(8, 8) + pt(13.5, 5) + pt(11, 12.5);
  OWN.slot = P('M5 4.5 H11 A3.5 3.5 0 0 1 11 11.5 H5 A3.5 3.5 0 0 1 5 4.5 z', 'none', SK, 1.5) + pt(5, 8) + pt(11, 8);
  OWN.cslot = P('M5 4.5 H11 A3.5 3.5 0 0 1 11 11.5 H5 A3.5 3.5 0 0 1 5 4.5 z', 'none', SK, 1.5) + pt(8, 8) + pt(11.5, 8);
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
  OWN.moveEnt = R(1.5, 9.5, 5, 5, 'none', GD, 1.1, 'stroke-dasharray="1 1"') + R(9.5, 1.5, 5, 5, 'none', SK, 1.5) + ar(4.5, 11.5, 9, 7, INK, 1.1, 2.4);
  OWN.copyEnt = R(1.5, 9.5, 5, 5, 'none', GD, 1.1) + R(9.5, 1.5, 5, 5, 'none', SK, 1.5) + ar(4.5, 11.5, 9, 7, INK, 1.1, 2.4);
  function eye(ex, ey) { return P('M' + r2(ex - 3.5) + ' ' + ey + ' Q' + ex + ' ' + r2(ey - 3.4) + ' ' + r2(ex + 3.5) + ' ' + ey + ' Q' + ex + ' ' + r2(ey + 3.4) + ' ' + r2(ex - 3.5) + ' ' + ey + ' z', W1, OL, 1) + C(ex, ey, 1.3, OL, 'none'); }
  OWN.relations = P('M1.5 10.5 H9.5 M5.5 10.5 V1.5', 'none', INK, 1.5) + eye(11, 11.5);
  OWN.quickSnaps = L('M12.5 1.5 H2.5 V13.5', GD, 1.1) + C(9, 9, 4.5, 'none', SK, 1.5) + C(9, 9, 1.3, W1, OL, 1);
  OWN.construction = L('M2.5 13.5 L13.5 2.5', GD, 1.1, DASHDOT) + L('M2.5 8.5 L8.5 2.5');
  OWN.shadedContours = P('M9.5 2.5 L14.5 12.5 H4.5 z', B1, SKF, 1) + C(5.5, 10, 3.5, B1, SKF, 1);
  OWN.repairSketch = L(SKFRAME) + P('M6.5 11 L11 6.5', 'none', GD, 2.4) + '<path d="M13.9 4.3 A2.4 2.4 0 1 1 11.7 2.1 L11.2 4 L12 4.8 z" fill="' + GL + '" ' + st(GD, 1) + '/>';

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
  OWN.bend = plateBase('w') + plateWall('u') + F('M6 3 H13 V4.4 H6 z', B1);
  OWN.miter = U('M1.5 1.5 H14.5 V14.5 H1.5 z', B1) + W('M5.5 5.5 H14.5 V14.5 H5.5 z', W1) + P('M1.5 1.5 L5.5 5.5', 'none', NV, 1) + F('M1.9 1.9 L5.5 5.5 V14.1 H1.9 z', B2);
  OWN.hem = W('M2.5 9.5 H10.5 L12.5 11.5 V12.5 L10.5 14.5 H2.5 L4.5 12.5 z', W2) + U('M2.5 3.5 L4.5 1.5 H11.5 Q14.5 4.5 14.5 7 Q14.5 10 11.5 11.5 L10.5 9.5 Q12 8.5 12 7 Q12 5.5 10.5 3.5 z', B2) + F('M3.6 3 L4.8 2 H11.2 L11.8 3 z', B1);
  OWN.jog = W('M1.5 12.5 L4.5 9.5 H11.5 L8.5 12.5 z', W1) + W('M1.5 12.5 H8.5 V14 H1.5 z', W2) + W('M8.5 12.5 L11.5 9.5 V11 L8.5 14 z', W3) + U('M4.5 5.5 H11.5 V9.5 H4.5 z', B2) + F('M5 6 H11 V7.2 H5 z', B1) + W('M4.5 5.5 L7.5 2.5 H14.5 L11.5 5.5 z', W1) + W('M11.5 5.5 L14.5 2.5 V4 L11.5 7 z', W3);
  OWN.sketchedBend = plateBase('w') + plateWall('w') + U('M4.5 9.5 L5.5 8.5 H13.5 L12.5 9.5 z', B2) + P('M2.5 9.5 H15', 'none', SKF, 1);
  OWN.crossBreak = W('M1.5 8 L8 4.5 L14.5 8 L8 11.5 z', W1) + W('M1.5 8 L8 11.5 V13.5 L1.5 10 z', W3) + W('M8 11.5 L14.5 8 V10 L8 13.5 z', W2) + P('M1.5 8 H14.5 M8 4.5 V11.5', 'none', SKF, 1);
  OWN.convertSM = wbox(1.5, 2.5, 9, 9, 3) + U('M8.5 5.5 H10.5 L12 4 V13 L10.5 14.5 H8.5 z', B2) + F('M10.5 5.5 L12 4 V13 L10.5 14.5 z', B3) + U('M1.5 5.5 L4.5 2.5 H13.5 L12 4 L10.5 5.5 z', B1) + P('M3.5 5.5 L6.5 2.5', 'none', NV, 0.7);
  OWN.sweptFlange = W('M3.5 9.5 H11.5 L13.5 11.5 V13 H5.5 L3.5 11 z', W2) + U('M2.5 3.5 L5.5 1.5 H12.5 Q14.5 2 14.5 4.5 V8.5 L12.5 9.5 V5.5 Q12.5 4 11.5 4 H6 L4.5 5 V9 L2.5 8 z', B2) + F('M3 3.8 L5.6 2 H12 L10.6 3.5 H5.5 z', B1);
  OWN.loftedBend = U('M5.5 3.5 V7.5 L2.5 11.5 L8 14.5 L13.5 11.5 L10.5 7.5 V3.5 z', B2) + F('M8 4.6 H10.4 V7.6 L13.2 11.4 L8 14.2 z', B3) + P('M8 4.6 V14.5', 'none', NV, 1) + E(8, 3.5, 2.5, 1.1, W1, OL, 1);
  // the Corners flyout: an L bracket with its corner in blue
  var CORNER = W('M3.5 4.5 Q3.5 2.5 5.5 2.5 H8.5 V9 L13.5 11.5 V13.5 L9.5 14.5 L3.5 11.5 z', W2) + P('M8.5 9 L3.5 11.5 M8.5 9 V2.5', 'none', GD, 0.7);
  OWN.breakCorner = CORNER + U('M3.5 4.5 Q3.5 2.5 5.5 2.5 H6.5 L3.5 5.5 z', B1);
  OWN.closedCorner = CORNER + U('M8.5 2.5 H10.5 V10 L8.5 9 z', B2);
  OWN.weldedCorner = CORNER + P('M8.5 3 V9', 'none', SKF, 2);
  OWN.cornerRelief = CORNER + C(8.5, 9, 1.8, B1, NV, 1);
  OWN.formingTool = W('M6.5 8.5 H9.5 V13 Q8 14.5 6.5 13 z', W2) + W('M1.5 5.5 H5 Q5.5 3.5 8 3.5 Q10.5 3.5 11 5.5 H14.5 V7.5 H10.5 Q10 8.5 8 8.5 Q6 8.5 5.5 7.5 H1.5 z', W1) + U('M4.5 5.5 Q5 2 8 2 Q11 2 11.5 5.5 Q10.5 3.6 8 3.6 Q5.5 3.6 4.5 5.5 z', B1);
  OWN.forming = OWN.formingTool;
  OWN.vent = R(2.5, 2.5, 11, 11, W1, OL, 1) + C(8, 8, 4, 'none', OL, 0.9) + C(8, 8, 1.8, 'none', OL, 0.9) + P('M8 3 V13 M3 8 H13 M4.5 4.5 L11.5 11.5 M11.5 4.5 L4.5 11.5', 'none', OL, 0.7);
  OWN.unfold = plateWall('w') + plateBase('u') + P('M5 2.5 Q1.5 3.5 2.5 8', 'none', INK, 1.5) + head(2.9, 9.6, 0.25, 1, INK, 2.8);
  OWN.fold = plateBase('w') + plateWall('u') + P('M2.5 9 Q1 5 4 2.8', 'none', INK, 1.5) + head(5.2, 2, 1, -0.7, INK, 2.8);
  OWN.flatten = W('M1.5 8 L7.5 4.5 L14.5 8.5 L8.5 12 z', W1) + W('M1.5 8 L8.5 12 V13.5 L1.5 9.5 z', W3) + W('M8.5 12 L14.5 8.5 V10 L8.5 13.5 z', W2) + P('M3.5 6.8 L10.5 10.8 M5.5 5.7 L12.5 9.7', 'none', GD, 0.7);
  OWN.noBends = plateBase('w') + plateWall('w') + C(11.5, 11.5, 3, W1, R2, 1.5) + P('M9.4 13.6 L13.6 9.4', 'none', R2, 1.5);
  OWN.insertBends = plateBase('w') + plateWall('w') + P('M5.5 8.5 H13.5', 'none', SKF, 2, BUTT);
  OWN.rip = W('M1.5 4.5 L5.5 2.5 L8 6 L11.5 2.5 L14.5 5 V11 L8 14.5 L1.5 10.5 z', W2) + W('M1.5 4.5 L5.5 2.5 L8 6 V14.5 L1.5 10.5 z', W1) + U('M8 6 L11.5 2.5 L14.5 5 V11 Q10.5 9.5 8 14.5 z', B2) + F('M8.6 6.4 L11.6 3.3 L12.8 4.3 L8.6 9 z', B1);

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
  OWN.dsHLV = OWN.dsHLR + P('M2.5 12 L8 10 L13.5 12 M8 10 V6.5', 'none', GD, 0.7, 'stroke-dasharray="1.2 1"');
  OWN.dsWireframe = P(DCUBE, 'none', INK, 1) + P(DCUBE2, 'none', INK, 1) + P(DTOP, 'none', INK, 1) + P('M2.5 12 L8 10 L13.5 12 M8 10 V2.5', 'none', INK, 0.8);
  OWN.hideshow = P('M1.5 8 Q8 1.5 14.5 8 Q8 14.5 1.5 8 z', W1, OL, 1) + C(8, 8, 2.8, GR, OL, 1) + F('M8 5.2 A2.8 2.8 0 0 1 8 10.8 z', '#1c1c1c');
  function pencil(x, y) { return P('M' + x + ' ' + y + ' l4 -4 l2 2 l-4 4 z', Y3, YO, 1) + P('M' + x + ' ' + y + ' l-0.8 2.8 l2.8 -0.8 z', '#e9c3a4', YO, 1); }
  OWN.appearance = ball(7, 7, 5.5) + pencil(9.5, 12.5);
  OWN.scene = ball(8, 6, 4.5) + R(1.5, 10.5, 13, 4, W1, OL, 1) + F('M1.5 10.5 h3.25 v2 h-3.25 z M8 10.5 h3.25 v2 h-3.25 z M4.75 12.5 h3.25 v2 h-3.25 z M11.25 12.5 h3.25 v2 h-3.25 z', '#2a2a2a');
  OWN.settings = P('M5.5 14 H10.5 L9.5 11.5 H6.5 z', GR, OL, 1) + R(1.5, 2.5, 13, 9, GD, OL, 1) + F('M2.6 3.6 h10.8 v6.8 h-10.8 z', '#eef0f2') + F('M2.6 3.6 h10.8 l-10.8 5 z', '#fefefe');

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
