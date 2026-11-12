// icons-mastercam.js — the icon set of the Mastercam interface profile (rfLX, 2026-11-12). Loaded after icons.js.
// Original artwork in Mastercam's visual language, matched against the user's own screenshots (never traced):
//   wireframe commands   thin steel-blue line art; a small grey "+" marks each defined point; a second entity the
//                        command refers to is neutral grey; what the command does is a dark arrow
//   simple solids        flat shaded faces in three blues, no outline
//   solid operations     a tan body with the operation's own face or tool in blue
//   delete / cancel      orange-red X; new / regenerate / OK   teal green; Analyze   a dark-slate question mark
//   documents, frames    white paper with a slate-blue outline; neutral objects grey
// The palette was sampled from the screenshots (GetPixel). Two layers:
//   OWN[name]            a drawing made for this set (a string, or [small, large] when 16 px needs a simpler drawing)
//   restyle(body)        every other icon (Anvil's own commands, sheet metal, drawing documents, the Design Library):
//                        Anvil's drawing re-inked with the same palette and rules, so a tab reads as one family
// icons.js asks the set through Icons.sets (register / use); ui-profiles.js turns it on for a profile whose `icons`
// section names it. How to add or change an icon: docs/areas/ui-core.md *Look: icon sets (rfLX)*.
(function () {
  'use strict';
  if (typeof Icons === 'undefined' || !Icons.sets) return;

  // ---- palette (sampled from the screenshots; every colour reads on the white ribbon and on the dark one)
  var LB = '#5683AD';                                   // the wireframe line
  var SL = '#62799A';                                   // slate outline: frames, paper, rectangles
  var B1 = '#82B0E4', B2 = '#4C82B4', B3 = '#3A6A9A', B4 = '#2F567D', B0 = '#BCD2EA';   // blue faces: lit, front, side, lines on them, pale
  var T1 = '#E8C384', T2 = '#BA9254', T3 = '#9A7A3C', T4 = '#5E4C22';                   // tan faces: lit, front, side, deep shadow
  var RD = '#D15433', RL = '#F3B9A6', RDD = '#A83E22';  // delete, cancel
  var GN = '#5C9282', GL = '#A9CFC2', GND = '#3F7566';  // new, regenerate, OK
  var YL = '#E2C230', YD = '#B89A1E';                   // the bulb, a pencil
  var NG = '#9A9A9A';                                   // the other entity, neutral lines
  var G1 = '#E4E4E4', G2 = '#C8C8C8', G3 = '#A0A0A0', G4 = '#7C7C7C';                   // neutral faces
  var W = '#ffffff';                                    // paper (icons.js maps it to the panel colour)
  var INK = 'currentColor';                             // arrows, dark marks (the theme's icon ink)
  var DS = '@DS';                                       // dark slate (question marks): the ink mixed into the line blue
  var SI = '@SI';                                       // slate ink (the display-style globes): more ink, so it is light on the blue status bar
  var DASH = 'stroke-dasharray="2 1.4"';

  function r2(v) { return String(Math.round(v * 100) / 100); }
  function st(c, w, x) { return 'stroke="' + c + '" stroke-width="' + w + '" stroke-linejoin="round" stroke-linecap="round"' + (x ? ' ' + x : ''); }
  // a line (not filled): the wireframe blue, 1.5 = the main entity (1 px at 16, 2 px at 32), 1 = a secondary line
  function L(d, c, w, x) { return '<path d="' + d + '" fill="none" ' + st(c || LB, w || 2, x) + '/>'; }
  // a thin dark line (dimension, axis, leader)
  function T(d, x) { return '<path d="' + d + '" fill="none" ' + st(INK, 0.9, 'stroke-opacity="0.75"' + (x ? ' ' + x : '')) + '/>'; }
  // a face: flat fill, stroked in its own colour exactly one device pixel wide (@FW), which icons.js then snaps to the
  // pixel grid: a crisp edge at every size and display scale, and no outline (Mastercam's solids have none)
  function F(d, fill) { return '<path d="' + d + '" fill="' + fill + '" ' + st(fill, '@FW') + '/>'; }
  function Fr(x, y, w, h, fill) { return F('M' + (x + 0.5) + ' ' + (y + 0.5) + ' h' + (w - 1) + ' v' + (h - 1) + ' h-' + (w - 1) + ' z', fill); }
  // an outlined shape (paper with a slate outline, a framed square)
  function P(d, fill, c, w, x) { return '<path d="' + d + '" fill="' + (fill || 'none') + '" ' + st(c || SL, w || 1, x) + '/>'; }
  function R(x, y, w, h, fill, c, sw, x2) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + (fill || 'none') + '" ' + st(c || SL, sw || 1, x2) + '/>'; }
  function C(cx, cy, r, fill, c, w, x) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + (fill || 'none') + '" ' + (c === 'none' ? 'stroke="none"' : st(c || LB, w || 2, x)) + '/>'; }
  function E(cx, cy, rx, ry, fill, c, w) { return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + (fill || 'none') + '" ' + (!c || c === 'none' ? 'stroke="none"' : st(c, w || 1)) + '/>'; }
  // the mark of a defined point: a small grey plus
  function mk(x, y, a) { a = a || 1.5; return '<path d="M' + r2(x - a) + ' ' + r2(y) + ' h' + r2(2 * a) + ' M' + r2(x) + ' ' + r2(y - a) + ' v' + r2(2 * a) + '" fill="none" stroke="' + INK + '" stroke-opacity="0.72" stroke-width="0.9" stroke-linecap="butt"/>'; }
  // an arrow from (x1, y1) to its point at (x2, y2): what the command does
  function ar(x1, y1, x2, y2, c, w, hs) {
    c = c || INK; hs = hs || 2.4;
    var dx = x2 - x1, dy = y2 - y1, l = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / l, uy = dy / l, bx = x2 - ux * hs, by = y2 - uy * hs, nx = -uy * hs * 0.55, ny = ux * hs * 0.55;
    return '<path d="M' + r2(x1) + ' ' + r2(y1) + ' L' + r2(bx) + ' ' + r2(by) + '" fill="none" ' + st(c, w || 1.1) + '/>' +
      '<path d="M' + r2(x2) + ' ' + r2(y2) + ' L' + r2(bx + nx) + ' ' + r2(by + ny) + ' L' + r2(bx - nx) + ' ' + r2(by - ny) + ' z" fill="' + c + '" stroke="' + c + '" stroke-width="0.3" stroke-linejoin="round"/>';
  }
  function head(x2, y2, ux, uy, c, hs) { hs = hs || 2.4; var bx = x2 - ux * hs, by = y2 - uy * hs, nx = -uy * hs * 0.55, ny = ux * hs * 0.55; c = c || INK; return '<path d="M' + r2(x2) + ' ' + r2(y2) + ' L' + r2(bx + nx) + ' ' + r2(by + ny) + ' L' + r2(bx - nx) + ' ' + r2(by - ny) + ' z" fill="' + c + '" stroke="' + c + '" stroke-width="0.3" stroke-linejoin="round"/>'; }
  // a fat block arrow pointing up from (x, y1) to (x, y0) (Extrude, Thicken)
  function up(x, y0, y1, c) { return F('M' + x + ' ' + y0 + ' l2.5 3 h-1.5 V' + y1 + ' h-2 V' + (y0 + 3) + ' h-1.5 z', c || INK); }
  function down(x, y0, y1, c) { return F('M' + x + ' ' + y1 + ' l2.5 -3 h-1.5 V' + y0 + ' h-2 V' + (y1 - 3) + ' h-1.5 z', c || INK); }
  // the Analyze question mark, about 3.5 wide and 7 high from (x, y)
  function Q(x, y) {
    return '<path d="M' + r2(x + 0.4) + ' ' + r2(y + 1.9) + ' a1.7 1.7 0 1 1 2.5 1.5 q-0.8 0.5 -0.8 1.6" fill="none" ' + st(DS, 1.9) + '/>' +
      '<circle cx="' + r2(x + 2.1) + '" cy="' + r2(y + 6.7) + '" r="0.9" fill="' + DS + '" stroke="none"/>';
  }
  // a block seen from above its corner (2 : 1 slopes): the top rhombus is centred on (cx, cy), dx to each side, h high
  function cube(cx, cy, dx, h, top, left, right) {
    var dy = dx / 2;
    return F('M' + (cx - dx) + ' ' + cy + ' L' + cx + ' ' + (cy + dy) + ' V' + (cy + dy + h) + ' L' + (cx - dx) + ' ' + (cy + h) + ' z', left) +
      F('M' + cx + ' ' + (cy + dy) + ' L' + (cx + dx) + ' ' + cy + ' V' + (cy + h) + ' L' + cx + ' ' + (cy + dy + h) + ' z', right) +
      F('M' + cx + ' ' + (cy - dy) + ' L' + (cx + dx) + ' ' + cy + ' L' + cx + ' ' + (cy + dy) + ' L' + (cx - dx) + ' ' + cy + ' z', top);
  }
  function wcube(cx, cy, dx, h, c, w, fill) {
    var dy = dx / 2;
    return '<path d="M' + cx + ' ' + (cy - dy) + ' L' + (cx + dx) + ' ' + cy + ' V' + (cy + h) + ' L' + cx + ' ' + (cy + dy + h) + ' L' + (cx - dx) + ' ' + (cy + h) + ' V' + cy + ' z" fill="' + (fill || 'none') + '" ' + st(c || G4, w || 1) + '/>' +
      '<path d="M' + (cx - dx) + ' ' + cy + ' L' + cx + ' ' + (cy + dy) + ' L' + (cx + dx) + ' ' + cy + ' M' + cx + ' ' + (cy + dy) + ' V' + (cy + dy + h) + '" fill="none" ' + st(c || G4, w || 1) + '/>';
  }
  var TANBOX = cube(8, 4.5, 7, 7, T1, T2, T3), BLUEBOX = cube(8, 4.5, 7, 7, B1, B2, B3);
  // an upright cylinder: side, a darker band down its right, the top ellipse
  function cyl(cx, y0, y1, rx, ry, side, band, top) {
    return F('M' + (cx - rx) + ' ' + y0 + ' V' + y1 + ' A' + rx + ' ' + ry + ' 0 0 0 ' + (cx + rx) + ' ' + y1 + ' V' + y0 + ' z', side) +
      (band ? '<path d="M' + r2(cx + rx * 0.3) + ' ' + y0 + ' V' + r2(y1 + ry * 0.95) + ' A' + rx + ' ' + ry + ' 0 0 0 ' + (cx + rx) + ' ' + y1 + ' V' + y0 + ' z" fill="' + band + '" stroke="none"/>' : '') +
      E(cx, y0, rx, ry, top, top, '@FW');
  }
  function txt(x, y, size, s, fill, weight) { return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" font-weight="' + (weight || 700) + '" font-family="Segoe UI, Arial, sans-serif" fill="' + (fill || INK) + '" text-anchor="middle">' + s + '</text>'; }
  // a sheet of paper with a slate outline; a magnifier (grey ring, dark handle); a gear (ring with teeth)
  function page(x, y, w, h) { return R(x, y, w, h, W, SL, 1); }
  function mag(cx, cy, r) { return C(cx, cy, r, 'none', G4, 1.5) + L('M' + r2(cx + r * 0.75) + ' ' + r2(cy + r * 0.75) + ' L' + r2(cx + r + 2.6) + ' ' + r2(cy + r + 2.6), INK, 2.2); }
  function gear(cx, cy, r, c) {
    var R0 = r + 0.7, u = Math.PI * R0 / 8;
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r2(R0) + '" fill="none" stroke="' + c + '" stroke-width="1.7" stroke-dasharray="' + r2(u * 0.9) + ' ' + r2(u * 1.1) + '" stroke-dashoffset="' + r2(u * 0.45) + '"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r2(r - 0.7) + '" fill="none" stroke="' + c + '" stroke-width="2"/>';
  }
  // a curved arrow (regenerate, undo): an arc with a head
  function arc(d, c, w) { return L(d, c, w || 1.5); }

  var OWN = {};

  // ================================================================== Wireframe
  OWN.point = F('M6.5 3.5 h3 v3 h3 v3 h-3 v3 h-3 v-3 h-3 v-3 h3 z', LB);
  OWN.line = L('M4.5 11.5 L11.5 4.5') + mk(3, 13) + mk(13, 3);
  OWN.circle = C(7.5, 8.5, 5.5) + mk(7.5, 8.5) + mk(11.5, 4.5);
  OWN.parallelLine = L('M2.5 10.5 L9.5 3.5') + L('M6.5 13.5 L13.5 6.5', NG, 1.1);
  OWN.perpLine = L('M2.5 13.5 H13.5', NG, 1.5) + L('M6.5 13 V2.5') + L('M6.5 10.5 H9.5 V13.5', NG, 1);
  OWN.arc3 = L('M3 4.5 A9 9 0 0 1 12 13.5') + mk(3, 4.5) + mk(9.4, 7.1) + mk(12, 13.5);
  OWN.tarc = L('M2 3.5 H13.5 V14', NG, 1.1) + L('M4 3.5 A9.5 9.5 0 0 1 13.5 13');
  OWN.pcircle = C(8, 8, 5.5, 'none', LB, 1.5, 'stroke-dasharray="6.2 2.44"') + mk(13.5, 8) + mk(5.25, 3.24) + mk(5.25, 12.76);
  OWN.spline = L('M3 13.5 C3 6.5 6.5 9.5 8 8 S13 9.5 13 2.5');
  OWN.rect = R(3, 4, 10, 8, 'none', SL, 2);
  OWN.text = L('M3 13.5 L8 2.5 L13 13.5 M5 9.5 H11', LB, 2.2);
  OWN.trim = [
    L('M2.5 13.5 L13.5 5.5', GN, 1.5) + L('M3.5 6.5 L10.5 13.5', RD, 1.5) + F('M2.5 1.5 h2 l2 3 -1.5 1 z', T2) + F('M5.5 5.5 l1.5 -1 3 5 z', G3),
    L('M2.5 13.5 L12.5 6.5', GN, 1.5) + L('M3.5 7.5 L10 14', RD, 1.5) + F('M2 1.5 h2 l2 3 -1.5 1 z', T2) + F('M5 5.5 l1.5 -1 3.5 5.5 z', G3) + ar(11, 4.5, 14.5, 1)];
  OWN.skFillet = T('M3.5 14 V8.5 M8.5 3.5 H14') + L('M3.5 8.5 A5 5 0 0 1 8.5 3.5');
  OWN.skChamfer = T('M3.5 14 V8.5 M8.5 3.5 H14') + L('M3.5 8.5 L8.5 3.5');
  OWN.offset = L('M3.5 2.5 V13.5', NG, 1.5) + ar(5.5, 8, 11, 8) + L('M12.5 2.5 V13.5');
  OWN.convert = L('M2.5 2.5 Q6 2.5 8 5 Q10 2.5 13.5 2.5', NG, 1.1) + ar(8, 6, 8, 11.5) + L('M2.5 13.5 H13.5');
  OWN.splitEnt = L('M2.5 13.5 L7 9', GN, 1.5) + L('M9 7 L13.5 2.5', RD, 1.5) + T('M5.5 5.5 L10.5 10.5');
  OWN.joinEnt = L('M2.5 13.5 L7.5 8.5', LB, 1.5) + L('M8.5 7.5 L13.5 2.5', LB, 1.5) + mk(8, 8, 2);
  OWN.extend = L('M2.5 12.5 H8.5') + L('M8.5 12.5 H12', LB, 1.5, 'stroke-dasharray="1.2 1.4"') + L('M13.5 2.5 V14', NG, 1.5) + ar(7, 8.5, 12, 8.5);
  OWN.closeArc = C(8, 8, 5.5, 'none', NG, 1.1, DASH) + L('M8 2.5 A5.5 5.5 0 1 0 13.5 8') + head(13.5, 8, 0, 1, INK, 2.6);
  OWN.mirrorEnt = L('M5.5 3.5 H2.5 V12.5 H5.5', NG, 1.5) + L('M10.5 3.5 H13.5 V12.5 H10.5') + T('M8 1.5 V14.5', 'stroke-dasharray="3 1.2 1 1.2"');
  OWN.polygon = L('M8 2.5 L13 5.5 V10.5 L8 13.5 L3 10.5 V5.5 z') + mk(8, 8);
  OWN.ellipse = '<ellipse cx="8" cy="8" rx="6" ry="3.8" fill="none" ' + st(LB, 2) + '/>' + mk(8, 8);
  OWN.arc = L('M3 12.5 A7 7 0 0 1 12.5 5') + mk(10, 12) + T('M10 12 L3 12.5 M10 12 L12.5 5', DASH);
  OWN.centerline = L('M2.5 13.5 L13.5 2.5', LB, 1, 'stroke-dasharray="3.2 1.2 1 1.2"') + mk(2.5, 13.5) + mk(13.5, 2.5);
  OWN.construction = L('M2.5 12.5 L13.5 3.5', NG, 1.1, DASH) + L('M2.5 7.5 L9 2.5');

  // ================================================================== Solids
  OWN.extrude = [
    cyl(6, 9.5, 12.5, 4, 1.5, T1, T2, T1) + cyl(6, 3.5, 9.5, 4, 1.5, B1, B2, B2) + up(13, 2.5, 10.5),
    cyl(6.5, 9.5, 12.5, 4.5, 1.5, T1, T2, T1) + cyl(6.5, 3.5, 9.5, 4.5, 1.5, B1, B2, B2) + up(13, 1.5, 9.5)];
  OWN.cut = cube(7, 6.5, 5.5, 5, T1, T2, T3) + F('M7 5.5 l3 1.5 -3 1.5 -3 -1.5 z', B3) + down(13.5, 1.5, 8.5);
  OWN.revolve = T('M8 1 V15', DASH) + F('M8 4.5 A4.5 1.6 0 0 1 12.5 4.5 V10.5 A4.5 1.6 0 0 1 8 12 z', B1) + F('M8 4.5 A4.5 1.6 0 0 0 3.5 4.5 V10.5 A4.5 1.6 0 0 0 8 12 z', T1) + L('M3.5 13 A5 1.8 0 0 0 11.5 13.6', INK, 1.1) + head(12.5, 12.6, 0.75, -0.66, INK, 2.4);
  OWN.loft = F('M8 10.5 l5.5 2 -5.5 2 -5.5 -2 z', T2) + F('M5.5 4.5 h5 l2.5 8 h-10 z', B1) + F('M8 4.5 h2.5 l2.5 8 h-5 z', B2) + E(8, 4.5, 2.5, 1, B3, B3, '@FW');
  OWN.sweep = L('M4 12.5 C4 6 12 10 12 3.5', B2, 3.6) + L('M4 12.5 C4 6 12 10 12 3.5', B1, 1.6) + C(4, 12.5, 2, T2, T2, '@FW') + head(13.6, 1.4, 0.45, -0.89, INK, 3);
  OWN.revolveCut = T('M8 1 V15', DASH) + F('M3.5 4.5 A4.5 1.6 0 0 1 12.5 4.5 V10.5 A4.5 1.6 0 0 1 3.5 10.5 z', T1) + F('M8 6 A4.5 1.6 0 0 1 12.5 4.5 V10.5 A4.5 1.6 0 0 1 8 12 z', T2) + F('M5.5 6.5 h5 v3 h-5 z', B3);
  OWN.holeWizard = [
    cube(8, 5, 7, 6, T1, T2, T3) + E(8, 5, 3, 1.5, T4, T4, '@FW'),
    cube(8, 5, 7, 6, T1, T2, T3) + E(8, 5, 3.5, 1.7, T4, T4, '@FW') + '<path d="M5 5.7 A3.5 1.7 0 0 0 11 5.7 A3.9 1.2 0 0 1 5 5.7 z" fill="' + T3 + '" stroke="none"/>'];
  OWN.hole = OWN.holeWizard;
  OWN.lpattern = T('M4 4 H12 V12 H4 z') + Fr(2, 2, 4, 4, T2) + Fr(10, 2, 4, 4, B2) + Fr(2, 10, 4, 4, B2) + Fr(10, 10, 4, 4, B2);
  OWN.cpattern = C(8, 8, 4.5, 'none', INK, 0.9, 'stroke-opacity="0.6"') + C(8, 3.5, 2, T2, T2, '@FW') + C(12.5, 8, 2, B2, B2, '@FW') + C(8, 12.5, 2, B2, B2, '@FW') + C(3.5, 8, 2, B2, B2, '@FW');
  OWN.mirror = F('M2.5 5.5 l4 -2 v8 l-4 2 z', T2) + F('M13.5 5.5 l-4 -2 v8 l4 2 z', B2) + T('M8 1.5 V14.5', 'stroke-dasharray="3 1.2 1 1.2"');
  OWN.fillet = F('M2.5 13.5 V8 A5.5 5.5 0 0 1 8 2.5 H13.5 V13.5 z', T2) + L('M2.5 8 A5.5 5.5 0 0 1 8 2.5', B2, 2.4);
  OWN.chamfer = F('M2.5 13.5 V8 L8 2.5 H13.5 V13.5 z', T2) + L('M2.5 8 L8 2.5', B2, 2.4);
  OWN.shell = cube(8, 5.5, 6, 6, T1, T2, T3) + F('M8 4 l4 2 -4 2 -4 -2 z', B3) + F('M8 5.5 l2.5 1.2 -2.5 1.3 -2.5 -1.3 z', B2);
  OWN.draft = F('M4.5 3.5 h4 l3 10 h-9 z', T2) + F('M8.5 3.5 l3 10 h2.5 z', B2) + T('M8.5 2 V14.5', DASH);
  OWN.rib = F('M2.5 12.5 h11 v2 h-11 z', T3) + F('M2.5 3.5 h2 v9 h-2 z', T2) + F('M4.5 5.5 L11.5 12.5 H4.5 z', B2);
  OWN.intersect = cube(6.5, 5, 4.5, 5, T1, T2, T3) + cube(10, 8, 4, 4, B1, B2, B3);
  OWN.wrap = cyl(8, 3.5, 12, 5, 1.6, T1, T2, T1) + L('M4.5 8 Q8 10.5 11.5 8', B2, 2.6);
  OWN.boundary = F('M2.5 11.5 Q8 6 13.5 11.5 L11.5 13.5 Q8 9.5 4.5 13.5 z', T2) + F('M2.5 5 Q8 0.5 13.5 5 L13.5 11.5 Q8 6 2.5 11.5 z', B1);
  OWN.boundaryCut = cube(8, 5.5, 6, 6, T1, T2, T3) + F('M4.5 5.5 Q8 3 11.5 5.5 Q8 9 4.5 5.5 z', B3);
  OWN.plane = F('M1.5 9.5 L6.5 4.5 H14.5 L9.5 9.5 z', B0) + P('M1.5 9.5 L6.5 4.5 H14.5 L9.5 9.5 z', 'none', SL, 1) + ar(8, 9, 8, 2, INK, 1.1, 2.2) + T('M8 9.5 V13.5', DASH);
  OWN.planeSmall = OWN.plane;
  OWN.refAxis = T('M1.5 14.5 L14.5 1.5', 'stroke-dasharray="3.4 1.2 1 1.2"') + cyl(8, 6, 10.5, 3, 1.1, T1, T2, T1);
  OWN.csys = ar(5, 11, 5, 2, B3, 1.5, 2.6) + ar(5, 11, 14, 11, RD, 1.5, 2.6) + ar(5, 11, 1.5, 14.5, GN, 1.5, 2.6);
  OWN.refPoint = mk(8, 8, 5) + C(8, 8, 2, B2, B2, '@FW');
  OWN.origin = ar(4.5, 11.5, 4.5, 2, B3, 1.1, 2.2) + ar(4.5, 11.5, 14, 11.5, RD, 1.1, 2.2) + C(4.5, 11.5, 1.5, W, SL, 1);
  // the simple solids (offered where a profile places them)
  OWN.cylinder = cyl(8, 3, 13, 5.5, 2, B1, B2, B3);
  OWN.block = BLUEBOX;
  OWN.sphere = C(8, 8, 6.5, B2, B2, '@FW') + '<circle cx="6" cy="6" r="3" fill="' + B1 + '" stroke="none"/>';
  OWN.cone = F('M8 1.5 L13.5 12.5 A5.5 1.8 0 0 1 2.5 12.5 z', B1) + '<path d="M8 1.5 L13.5 12.5 A5.5 1.8 0 0 1 9.5 14.2 z" fill="' + B2 + '" stroke="none"/>';
  OWN.torus = C(8, 8, 4.25, 'none', B2, 3) + C(8, 8, 4.9, 'none', B1, 1);

  // ================================================================== Home
  OWN.pasteSketch = Fr(2, 3, 9, 11, T2) + Fr(4, 1, 5, 3, G3) + page(7.5, 6.5, 6, 8);
  OWN.cutEnt = L('M4.5 2.5 L10.5 10.5 M11.5 2.5 L5.5 10.5', G4, 1.5) + C(4.5, 12, 2, 'none', LB, 1.5) + C(11.5, 12, 2, 'none', LB, 1.5);
  OWN.copyEnt = page(2.5, 1.5, 7, 9) + page(6.5, 5.5, 7, 9);
  OWN.copyImage = Fr(1, 4, 14, 10, G3) + Fr(5, 2, 6, 3, G3) + C(8, 9, 3, W, B2, 1.5) + '<circle cx="8" cy="9" r="1" fill="' + B2 + '" stroke="none"/>';
  OWN.levels = F('M8 7.5 l6 3 -6 3 -6 -3 z', B3) + F('M8 4.5 l6 3 -6 3 -6 -3 z', B2) + F('M8 1.5 l6 3 -6 3 -6 -3 z', B1);
  OWN.layers = OWN.levels;
  OWN.deleteEnt = L('M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5', RD, 3);
  OWN.undeleteEnt = L('M3 3 L10 10 M10 3 L3 10', RL, 2.4) + L('M7.5 12.5 H11.5 A2.5 2.5 0 0 0 11.5 7.5 H10', LB, 1.5) + head(6, 12.5, -1, 0, LB, 2.6);
  OWN.hideUnhide = R(2.5, 2.5, 4, 4, 'none', T2, 1.5) + R(9.5, 2.5, 4, 4, 'none', GN, 1.5) + R(2.5, 9.5, 4, 4, 'none', LB, 1.5) + R(9.5, 9.5, 4, 4, G1, G2, 1.5);
  OWN.showEndpoints = R(3.5, 3.5, 9, 9, 'none', SL, 1, 'stroke-dasharray="1.5 1.5"') + Fr(2, 2, 3, 3, B2) + Fr(11, 2, 3, 3, B2) + Fr(2, 11, 3, 3, B2) + Fr(11, 11, 3, 3, B2);
  OWN.blankEnt = R(2.5, 2.5, 11, 11, 'none', T2, 1, 'stroke-dasharray="1 1"') + R(5.5, 5.5, 5, 5, 'none', T2, 1, 'stroke-dasharray="1 1"');
  OWN.unblankEnt = R(2.5, 2.5, 11, 11, 'none', T2, 1, 'stroke-dasharray="1 1"') + Fr(5, 5, 6, 6, T1);
  OWN.measure = [
    F('M1.5 5.5 l3 -3 9 9 -3 3 z', T2) + T('M5 5 l1 -1 M7 7 l1.5 -1.5 M9 9 l1 -1') + Q(10.5, 0.5),
    F('M1.5 5.5 l3 -3 9.5 9.5 -3 3 z', T2) + T('M4.5 5.5 l1.5 -1.5 M6.5 7.5 l1 -1 M8.5 9.5 l1.5 -1.5 M10.5 11.5 l1 -1') + Q(10.5, 0.5)];
  OWN.check = cube(6.5, 8, 5, 4.5, T1, T2, T3) + Q(10.5, 0.5);
  OWN.sectionProps = R(1.5, 6.5, 8, 8, W, SL, 1) + T('M3.5 10.5 h4 M5.5 8.5 v4') + Q(10.5, 0.5);
  OWN.mass = cube(6.5, 8, 5, 4.5, B1, B2, B3) + Q(10.5, 0.5);
  OWN.macro = gear(10.5, 5, 2.4, B2) + gear(5, 10.5, 2.6, GN);
  OWN.search = mag(9, 6.5, 4) + L('M1.5 4.5 H4 M1.5 7.5 H3.5 M1.5 10.5 H5', LB, 1.5);
  OWN.appearance = C(8, 8, 5.5, G3, G3, '@FW') + '<circle cx="6.2" cy="6.2" r="2.8" fill="' + G1 + '" stroke="none"/>' + Fr(9, 10, 6, 5, T1) + Fr(9, 13, 6, 2, B2);
  OWN.zDepth = txt(5, 12.5, 11, 'Z', DS) + ar(12, 13, 12, 2.5, INK, 1.1, 2.4);
  OWN.mode3d = txt(8, 12, 9.5, '3D', DS);

  // ================================================================== View
  function frame() { return R(2.5, 2.5, 11, 11, 'none', SL, 1); }
  OWN.vZoomFit = [
    frame() + ar(6.5, 6.5, 3.2, 3.2, INK, 1.1, 2.2) + ar(9.5, 6.5, 12.8, 3.2, INK, 1.1, 2.2) + ar(6.5, 9.5, 3.2, 12.8, INK, 1.1, 2.2) + ar(9.5, 9.5, 12.8, 12.8, INK, 1.1, 2.2),
    R(1.5, 1.5, 13, 13, 'none', SL, 1) + ar(6.5, 6.5, 2.6, 2.6, INK, 1.5, 3) + ar(9.5, 6.5, 13.4, 2.6, INK, 1.5, 3) + ar(6.5, 9.5, 2.6, 13.4, INK, 1.5, 3) + ar(9.5, 9.5, 13.4, 13.4, INK, 1.5, 3)];
  OWN.fit = OWN.vZoomFit;
  OWN.zoomArea = R(2.5, 1.5, 10, 10, 'none', SL, 1) + mag(8, 6.5, 3.6);
  function unzoom(extra) { return mag(6.5, 6.5, 4.2) + L('M4.5 6.5 H8.5', RD, 1.5) + extra; }
  OWN.unzoom50 = unzoom(F('M10.5 1.5 h4 v2 h-2 v2 h-2 z', GN));
  OWN.unzoom80 = unzoom('');
  OWN.prevView = mag(9.5, 6, 3.8) + ar(7, 13, 1.5, 13, LB, 1.5, 3);
  // the view cube: grey wire block, the face the view looks at in teal
  // (Top, Front, Right: the block seen from above; Bottom, Back, Left: the same block seen from below)
  var VC = { top: 'M8 2.5 L14 5.5 L8 8.5 L2 5.5 z', left: 'M2 5.5 L8 8.5 V14.5 L2 11.5 z', right: 'M8 8.5 L14 5.5 V11.5 L8 14.5 z',
    bottom: 'M8 8.5 L14 11.5 L8 14.5 L2 11.5 z', uleft: 'M2 5.5 L8 2.5 V8.5 L2 11.5 z', uright: 'M8 2.5 L14 5.5 V11.5 L8 8.5 z' };
  var HEX = 'M8 2.5 L14 5.5 V11.5 L8 14.5 L2 11.5 V5.5 z';
  function vcube(face) {
    var under = face === 'bottom' || face === 'uleft' || face === 'uright';
    return '<path d="' + HEX + '" fill="' + G1 + '" stroke="none"/><path d="' + VC[face] + '" fill="' + GN + '" stroke="none"/>' +
      P(HEX, 'none', G4, 1) + L(under ? 'M2 11.5 L8 8.5 L14 11.5 M8 8.5 V2.5' : 'M2 5.5 L8 8.5 L14 5.5 M8 8.5 V14.5', G4, 1);
  }
  OWN.vTop = vcube('top'); OWN.vFront = vcube('left'); OWN.vRight = vcube('right');
  OWN.vBottom = vcube('bottom'); OWN.vBack = vcube('uright'); OWN.vLeft = vcube('uleft');
  OWN.vIso = '<path d="' + VC.top + '" fill="' + GL + '" stroke="none"/><path d="' + VC.left + '" fill="' + GN + '" stroke="none"/><path d="' + VC.right + '" fill="' + GND + '" stroke="none"/>' + wcube(8, 5.5, 6, 6, G4, 1);
  OWN.vNormalTo = F('M2.5 9.5 L6.5 5.5 H14.5 L10.5 9.5 z', GL) + P('M2.5 9.5 L6.5 5.5 H14.5 L10.5 9.5 z', 'none', GND, 1) + ar(8.5, 1.5, 8.5, 7.5, INK, 1.1, 2.4) + T('M8.5 9.5 V14', DASH);
  OWN.orient = OWN.vIso;
  OWN.section = F('M8.5 4 l5 2.5 v6 l-5 2.5 z', T3) + F('M8.5 4 l5 2.5 -2.5 1.2 -5 -2.5 z', T1) + F('M3.5 1.5 l5 2.5 v11 l-5 -2.5 z', G2) + P('M3.5 1.5 l5 2.5 v11 l-5 -2.5 z', 'none', G4, 1);
  // the display styles: drawn in the slate ink (@SI follows the ink), so they are slate blue on the ribbon and light on
  // the blue status bar, where the same five sit
  function globe(extra) { return C(8, 8, 5.5, 'none', SI, 1) + extra; }
  OWN.dsWireframe = globe('<ellipse cx="8" cy="8" rx="2.5" ry="5.5" fill="none" ' + st(SI, 1) + '/>' + L('M2.5 8 H13.5', SI, 1));
  OWN.dsHLV = globe(L('M2.5 8 A5.5 2 0 0 0 13.5 8', SI, 1) + L('M2.5 8 A5.5 2 0 0 1 13.5 8', SI, 1, 'stroke-dasharray="1.4 1.3"') + L('M8 2.5 A2.5 5.5 0 0 0 8 13.5', SI, 1));
  OWN.dsHLR = globe(L('M2.5 8 A5.5 2 0 0 0 13.5 8', SI, 1) + L('M8 2.5 A2.5 5.5 0 0 0 8 13.5', SI, 1));
  OWN.dsShadedEdges = '<circle cx="8" cy="8" r="5.5" fill="' + B0 + '" stroke="none"/>' + C(8, 8, 5.5, 'none', SI, 1);
  OWN.dsShaded = C(8, 8, 5.5, B1, B1, '@FW') + '<circle cx="6.2" cy="6.2" r="2.8" fill="#C9DEF5" stroke="none"/>';
  OWN.dsMaterial = C(8, 8, 5.5, G4, G4, '@FW') + '<circle cx="6.6" cy="6.4" r="3.4" fill="' + G3 + '" stroke="none"/><circle cx="5.8" cy="5.6" r="1.7" fill="' + G1 + '" stroke="none"/>';
  OWN.display = OWN.dsShadedEdges;
  OWN.translucency = '<path d="M4.1 11.9 A5.5 5.5 0 0 1 11.9 4.1 z" fill="' + B2 + '" stroke="none"/>' + C(8, 8, 5.5, 'none', SI, 1) + L('M3 13 L13 3', INK, 1.1);
  OWN.worldAxes = L('M8 1.5 V14.5', NG, 1.5) + L('M2.5 4.5 L13.5 11.5', GN, 1.5) + L('M13.5 4.5 L2.5 11.5', NG, 1.5);
  OWN.gnomon = ar(5.5, 10.5, 5.5, 1.5, B3, 1.5, 2.6) + ar(5.5, 10.5, 13.5, 3.5, GN, 1.5, 2.6) + ar(5.5, 10.5, 14, 14, RD, 1.5, 2.6);
  function grid() { return L('M3.5 1.5 V14.5 M8.5 1.5 V14.5 M13.5 1.5 V14.5 M1.5 3.5 H14.5 M1.5 8.5 H14.5 M1.5 13.5 H14.5', SL, 0.9, 'stroke-opacity="0.5" stroke-dasharray="1 1"'); }
  OWN.vGrid = grid() + L('M2 14 L14 2', INK, 1.5);
  OWN.snapGrid = grid() + F('M7.5 6.5 l6.5 2.5 -3 1 2.5 3 -1.5 1.2 -2.5 -3 -2 2.5 z', GN);
  // the manager toggles: a pane with its rows
  function pane(a, b) { return R(2.5, 1.5, 11, 13, W, SL, 1) + L('M5 5 V11 M5 5.5 H7 M5 8.5 H7 M5 11 H7', G4, 1) + Fr(8, 4, 4, 2, a) + Fr(8, 7, 4, 2, b || a) + Fr(8, 10, 4, 2, b || a); }
  OWN.tree = pane(T2, B2);
  OWN.vFeatureTree = OWN.tree;
  OWN.recentFns = R(2.5, 1.5, 11, 13, W, SL, 1) + C(8, 8, 3.5, 'none', GN, 1.1) + L('M8 6 V8 L9.5 9', INK, 1);
  OWN.viewsheetOn = Fr(2, 2, 12, 8, B1) + Fr(2, 10, 6, 3, T1) + Fr(8, 10, 6, 3, G2);
  OWN.viewsheetNew = Fr(1, 2, 10, 6, B1) + Fr(1, 8, 5, 3, T1) + Fr(6, 8, 5, 3, G2) + L('M11.5 9 V14 M9 11.5 H14', GN, 2.2);
  function bookmark() { return F('M2.5 1.5 h6 v10 l-3 -2.5 -3 2.5 z', B3); }
  OWN.bookmarkSave = bookmark() + Fr(9, 9, 6, 6, B2) + Fr(10, 9, 4, 2, W) + Fr(10, 12, 4, 3, B0);
  OWN.bookmarkRestore = bookmark() + L('M14 7.5 A4 4 0 0 0 9.5 12', GN, 1.5) + head(9.2, 14.2, -0.2, 1, GN, 2.8);
  OWN.vPlanes = F('M1.5 10.5 L5.5 6.5 H14.5 L10.5 10.5 z', B0) + P('M1.5 10.5 L5.5 6.5 H14.5 L10.5 10.5 z', 'none', SL, 1) + F('M6.5 2.5 h3 l0 9 h-3 z', GL) + P('M6.5 2.5 h3 v9 h-3 z', 'none', GND, 1);
  OWN.vOrigins = ar(4.5, 11.5, 4.5, 2, B3, 1.1, 2.2) + ar(4.5, 11.5, 14, 11.5, RD, 1.1, 2.2) + ar(4.5, 11.5, 1.2, 14.8, GN, 1.1, 2) + C(4.5, 11.5, 1.5, W, SL, 1);

  // ================================================================== Drafting
  OWN.dim = [
    ar(4, 8, 4, 1.5, INK, 1.1, 2.4) + ar(4, 8, 4, 14.5, INK, 1.1, 2.4) + C(10.5, 6, 3.5, YL, YL, '@FW') + Fr(9, 10, 3, 2, G4) + Fr(9, 12, 3, 1, G3),
    ar(3.5, 8, 3.5, 1, INK, 1.5, 3) + ar(3.5, 8, 3.5, 15, INK, 1.5, 3) + C(10.5, 5.5, 4, YL, YL, '@FW') + F('M8.5 8.5 h4 l-0.5 2 h-3 z', YL) + Fr(9, 11, 3, 2, G4) + Fr(9.5, 13, 2, 1, G3) + '<circle cx="9.2" cy="4.2" r="1.3" fill="#F4E38A" stroke="none"/>'];
  function ext(d) { return T(d); }
  OWN.horizDim = ext('M2.5 3 V13 M13.5 3 V13') + ar(8, 8, 2.9, 8, INK, 1, 2.2) + ar(8, 8, 13.1, 8, INK, 1, 2.2);
  OWN.vertDim = ext('M3 2.5 H13 M3 13.5 H13') + ar(8, 8, 8, 2.9, INK, 1, 2.2) + ar(8, 8, 8, 13.1, INK, 1, 2.2);

  // ================================================================== Transform (the arrow says what moves; grey = before, tan = after)
  function sq(x, y, s, fill, line) { return R(x, y, s, s, fill, line, 1); }
  OWN.tTranslate = sq(1.5, 9.5, 5, G1, G3) + sq(9.5, 1.5, 5, T1, T3) + ar(5, 11, 10, 6, INK, 1.5, 2.8);
  OWN.tDynamic = sq(1.5, 9.5, 5, G1, G3) + sq(9.5, 1.5, 5, T1, T3) + ar(6, 10, 10, 6, INK, 1.5, 2.8) + F('M4.5 1 L1.5 5.5 H3.5 L2.5 8.5 L6.5 4 H4.5 L6 1 z', YL);
  OWN.tTranslatePlane = F('M1.5 5.5 l5 -3 v8 l-5 3 z', G1) + P('M1.5 5.5 l5 -3 v8 l-5 3 z', 'none', G3, 1) + F('M9.5 5.5 l5 -3 v8 l-5 3 z', T1) + P('M9.5 5.5 l5 -3 v8 l-5 3 z', 'none', T3, 1) + ar(4, 8, 11.5, 8, INK, 1.5, 2.8);
  OWN.tRotate = sq(2.5, 7.5, 6, 'none', NG) + P('M5.5 6.5 L10 2.5 L14 7 L9.5 11 z', 'none', LB, 1.5) + L('M10.5 13.5 A6 6 0 0 0 14 9.5', INK, 1.1) + head(14.3, 8, 0.2, -1, INK, 2.4);
  OWN.tProject = OWN.convert;
  OWN.tMoveOrigin = sq(1.5, 8.5, 6, T1, T3) + ar(5, 10.5, 10.5, 5, INK, 1.5, 2.8) + mk(12.5, 3, 2);
  OWN.tMirror = L('M5.5 3.5 H2.5 V12.5 H5.5', NG, 1.5) + L('M10.5 3.5 H13.5 V12.5 H10.5') + T('M8 1 V15') + L('M5 14 Q8 16 10.5 14.2', INK, 1) + head(11.6, 13.4, 0.8, -0.6, INK, 2);
  OWN.tRoll = C(5, 8, 3, 'none', LB, 1.5) + ar(10.5, 8, 8.2, 8, INK, 1.1, 2) + ar(10, 8, 13, 8, INK, 1.1, 2) + L('M14.5 3.5 V12.5', NG, 1.5);
  OWN.tOffsetEntity = OWN.offset;
  OWN.tOffsetChains = L('M5.5 1.5 Q5.5 5 2.5 5', NG, 1.5) + ar(6, 6.5, 10, 10.5, INK, 1.5, 2.8) + L('M13.5 1.5 V10 Q13.5 13.5 9.5 13.5 H7');
  OWN.tNesting = R(1.5, 2.5, 13, 11, 'none', SL, 1) + Fr(3, 4, 4, 8, GN) + Fr(8, 4, 5, 3, GL) + Fr(8, 8, 5, 4, GN);
  OWN.tRectArray = Fr(2, 2, 5, 5, T2) + Fr(9, 2, 5, 5, G2) + Fr(2, 9, 5, 5, G2) + Fr(9, 9, 5, 5, G2);
  OWN.tDistribute = T('M1.5 8 H14.5') + Fr(1, 3, 3, 10, T2) + Fr(6.5, 3, 3, 10, G2) + Fr(12, 3, 3, 10, T2);
  OWN.tStretch = sq(1.5, 4.5, 5, G1, G3) + R(6.5, 4.5, 8, 5, T1, T3, 1) + ar(8, 7, 13, 7, INK, 1.5, 2.8);
  OWN.tScale = R(1.5, 1.5, 13, 13, T1, B2, 1) + sq(1.5, 8.5, 6, G1, G3) + ar(8, 8, 13, 3, INK, 1.5, 2.8);

  // ================================================================== the chrome: Quick Access Toolbar, backstage, managers, function panel
  OWN.newDoc = P('M3.5 1.5 h6 l3 3 v10 h-9 z', W, SL, 1) + L('M9.5 1.5 v3 h3', SL, 1) + L('M11.5 9 V15 M8.5 12 H14.5', GN, 2.2);
  OWN.openDoc = F('M1.5 3.5 h4.5 l1.5 2 h6 v8 h-12 z', T3) + F('M1.5 13.5 l2.5 -6 h11 l-2.5 6 z', T1);
  OWN.saveDoc = F('M2.5 2.5 h9 l2 2 v9 h-11 z', B2) + Fr(5, 2, 5, 4, W) + Fr(4, 9, 8, 5, B0);
  OWN.printDoc = Fr(4, 1, 8, 5, W) + P('M4.5 1.5 h7 v4 h-7 z', 'none', SL, 1) + Fr(1, 6, 14, 6, G3) + Fr(4, 10, 8, 5, W) + P('M4.5 10.5 h7 v4 h-7 z', 'none', SL, 1) + T('M6 12.5 h4');
  OWN.undo = L('M4.5 6.5 H10 A3.5 3.5 0 0 1 10 13.5 H6', B1, 2.4) + head(1.5, 6.5, -1, 0, B1, 4.2);
  OWN.redo = L('M11.5 6.5 H6 A3.5 3.5 0 0 0 6 13.5 H10', B1, 2.4) + head(14.5, 6.5, 1, 0, B1, 4.2);
  OWN.select = '<path d="M4.5 1.5 V12.5 L7.2 10.2 L9.2 14.5 L11 13.7 L9 9.5 H12.5 z" fill="' + INK + '" stroke="' + INK + '" stroke-width="0.3" stroke-linejoin="round"/>';
  function regen() { return L('M12.5 6 A5 5 0 0 0 3.5 6', GN, 2.2) + head(2.2, 8.4, -0.35, 0.94, GN, 3.4) + L('M3.5 10 A5 5 0 0 0 12.5 10', GL, 2.2) + head(13.8, 7.6, 0.35, -0.94, GL, 3.4); }
  OWN.rebuild = regen();
  OWN.rebuildSel = L('M13 9.5 A4 4 0 0 0 6 9.5', GN, 2) + head(5, 11.6, -0.35, 0.94, GN, 3) + L('M6 12.5 A4 4 0 0 0 13 12.5', GL, 2) + head(14, 10.4, 0.35, -0.94, GL, 3) + L('M4 1.5 V6.5 M1.8 2.8 L6.2 5.2 M6.2 2.8 L1.8 5.2', DS, 1.1);
  function rows() { return L('M2.5 3.5 H4 M2.5 6.5 H4 M2.5 9.5 H4 M2.5 12.5 H4', GN, 1.5) + T('M6 3.5 H8 M6 6.5 H8 M6 9.5 H8 M6 12.5 H8'); }
  OWN.moveUp = rows() + ar(12, 14, 12, 2, LB, 1.5, 3.2);
  OWN.moveDown = rows() + ar(12, 2, 12, 14, LB, 1.5, 3.2);
  OWN.options = gear(8, 8, 3.4, T2);
  OWN.settings = OWN.options;
  OWN.help = C(8, 8, 6, B2, B3, 1) + '<path d="M6.3 6.4 a1.7 1.7 0 1 1 2.6 1.5 q-0.9 0.5 -0.9 1.5" fill="none" ' + st(W, 1.5) + ' style="stroke:#fff"/><circle cx="8" cy="11.6" r="0.8" fill="#fefefe" stroke="none"/>';
  OWN.back = L('M5 6.5 H10.5 A3.5 3.5 0 0 1 10.5 13.5 H7', GN, 2.2) + head(2, 6.5, -1, 0, GN, 4);
  OWN.cancel = C(8, 8, 6, RD, RDD, 1) + '<path d="M5.5 5.5 L10.5 10.5 M10.5 5.5 L5.5 10.5" fill="none" ' + st('#fefefe', 1.9) + '/>';
  OWN.ok = C(8, 8, 6, GN, GND, 1) + '<path d="M4.8 8.2 L7 10.5 L11.2 5.6" fill="none" ' + st('#fefefe', 1.9) + '/>';
  OWN.okPlus = C(7, 8.5, 5.5, GN, GND, 1) + '<path d="M4.2 8.7 L6.2 10.8 L9.8 6.4" fill="none" ' + st('#fefefe', 1.9) + '/>' + L('M13 1.5 V6.5 M10.5 4 H15.5', B2, 1.9);
  OWN.planeView = F('M1.5 10.5 L5.5 6.5 H13.5 L9.5 10.5 z', B0) + P('M1.5 10.5 L5.5 6.5 H13.5 L9.5 10.5 z', 'none', SL, 1) + C(11.5, 4, 2.2, W, G4, 1.1) + '<circle cx="11.5" cy="4" r="0.9" fill="' + INK + '" stroke="none"/>' + T('M11.5 6.5 L8.5 8.5', DASH);
  OWN.home = F('M8 1.5 L14.5 7.5 H12.5 V13.5 H3.5 V7.5 H1.5 z', B2) + Fr(7, 9, 3, 5, W);
  OWN.palette = Fr(2, 2, 5, 5, B2) + Fr(9, 2, 5, 5, T2) + Fr(2, 9, 5, 5, GN) + Fr(9, 9, 5, 5, RD);
  OWN.fileProps = P('M3.5 1.5 h6 l3 3 v10 h-9 z', W, SL, 1) + L('M9.5 1.5 v3 h3', SL, 1) + T('M5.5 7.5 h5 M5.5 9.5 h5 M5.5 11.5 h3');
  OWN.filter = F('M1.5 2.5 h13 l-5 6 v5 l-3 -1.5 v-3.5 z', B1) + P('M1.5 2.5 h13 l-5 6 v5 l-3 -1.5 v-3.5 z', 'none', B3, 1);
  // the Solids history: the solid, a folder, the tree's other rows
  OWN.body = TANBOX;
  OWN.part = TANBOX;
  OWN.folder = F('M1.5 3.5 h4.5 l1.5 2 h7 v8 h-13 z', T2) + Fr(1, 6, 14, 1, T1);
  OWN.error = C(8, 8, 6, RD, RDD, 1) + '<path d="M8 4.5 V8.8" fill="none" ' + st('#fefefe', 1.9) + '/><circle cx="8" cy="11.3" r="0.9" fill="#fefefe" stroke="none"/>';
  OWN.warn = F('M8 1.5 L14.5 13.5 H1.5 z', YL) + P('M8 1.5 L14.5 13.5 H1.5 z', 'none', YD, 1) + T('M8 6 V9.8') + '<circle cx="8" cy="11.7" r="0.7" fill="' + INK + '" stroke="none"/>';
  OWN.config = R(2.5, 2.5, 11, 11, W, SL, 1) + Fr(4, 4, 3, 3, T2) + Fr(9, 4, 3, 3, B2) + Fr(4, 9, 3, 3, B2) + Fr(9, 9, 3, 3, G2);
  // the Quick Masks (ui-select.js draws these buttons itself; the set's `slots` put these in)
  OWN.qmPoints = OWN.point;
  OWN.qmLines = OWN.line;
  OWN.qmArcs = C(8, 8, 5, 'none', LB, 1.5) + L('M3.5 12.5 L12.5 3.5', INK, 0.9, 'stroke-opacity="0.45"');
  OWN.qmSplines = OWN.spline;
  OWN.qmDims = T('M2.5 3.5 V12.5 M13.5 3.5 V12.5') + ar(8, 8, 2.9, 8, LB, 1.5, 2.4) + ar(8, 8, 13.1, 8, LB, 1.5, 2.4);
  OWN.qmFaces = cube(8, 5.5, 6, 6, B1, T2, T3);
  OWN.qmEdges = wcube(8, 5.5, 6, 6, T3, 1, T1) + L('M8 8.5 V14.5', B2, 2.4);
  OWN.qmBodies = TANBOX;
  // the Levels manager's tool row (ui-levels.js asks for these three)
  OWN.lvlNew = L('M8 2.5 V13.5 M2.5 8 H13.5', GN, 3);
  OWN.lvlAllOn = OWN.levels;
  OWN.lvlAllOff = F('M8 7.5 l6 3 -6 3 -6 -3 z', G4) + F('M8 4.5 l6 3 -6 3 -6 -3 z', G3) + F('M8 1.5 l6 3 -6 3 -6 -3 z', G2);
  OWN.qmClear =C(8, 8, 5.5, 'none', RD, 1.9) + L('M4.2 11.8 L11.8 4.2', RD, 1.9);

  // ================================================================== the restyle: Anvil's drawing in this palette
  // solid greys -> tan, the feature yellow -> blue (the operation's own faces), green -> teal, red -> orange-red; a
  // solid's ink outline goes (faces carry no outline); an unfilled main stroke in the ink becomes the wireframe blue,
  // thin ink lines (dimensions, axes) stay dark; a sketch point becomes the grey plus; paper takes a slate outline.
  var FMAP = {
    '#e8e8e8': T1, '#b8b8b8': T2, '#8e8e8e': T3, '#d0d0d0': '#DDB877', '#cbcbcb': '#CFA868', '#c9c9c9': '#CFA868', '#bdbdbd': '#C59C5C', '#a3a3a3': '#A98548', '#a2a2a2': '#A98548',
    '#a6a6a6': '#A98548', '#979797': '#A07E42', '#7d7d7d': '#876A32', '#e4e4e4': '#F0D5A4', '#e1e1e1': '#F0D5A4', '#e0e0e0': '#F0D5A4', '#6e6e6e': T4, '#5a5a5a': T4,
    '#ffe57a': B1, '#f5c400': B2, '#c08f00': B3, '#a07600': B3, '#f6d77a': B1, '#f9e3a0': B0, '#f3cf6b': B1, '#b48a1c': B3, '#e8a23a': B2,
    '#2e9e48': GN, '#a6dcb3': GL, '#1f7a35': GND, '#3ec25a': '#6FB09C', '#7ee787': '#8CC4B2', '#e3f4df': '#DCEDE6',
    '#d9453b': RD, '#f4a795': RL, '#a8322a': RDD, '#e2463b': RD, '#e0553c': RD, '#e07b1a': RD,
    '#f2c230': YL, '#c9961a': YD, '#2f7ad6': B2, '#1f5fae': B3
  };
  var SOLID = {}; Object.keys(FMAP).forEach(function (k) { SOLID[FMAP[k]] = 1; });
  delete SOLID[YL]; delete SOLID[YD];
  var SMAP = {
    '#f5c400': B2, '#ffe57a': B1, '#c08f00': B3, '#a07600': B2, '#2e9e48': GN, '#1f7a35': GND, '#a6dcb3': GL, '#3ec25a': GN, '#d9453b': RD, '#a8322a': RDD, '#f4a795': RL, '#e2463b': RD, '#e0553c': RD,
    '#e07b1a': RD, '#939393': NG, '#8a8a8a': NG, '#a2a2a2': NG, '#a4a4a4': NG, '#f2c230': YL, '#c9961a': YD, '#2f7ad6': B2, '#1f5fae': B3, '#b8b8b8': NG, '#8e8e8e': NG
  };
  var PAPERISH = { '#fff': 1, '#ffffff': 1, '#f4f4f4': 1, '#f6f6f6': 1, '#dedede': 1 };
  var SHAPE = /<(path|rect|circle|ellipse|polygon|polyline|line)\b([^>]*?)\s*(\/?)>/g;
  function attr(a, n) { var m = new RegExp('(?:^|\\s)' + n + '="([^"]*)"').exec(a); return m ? m[1] : null; }
  function setAttr(a, n, v) { var re = new RegExp('(^|\\s)' + n + '="[^"]*"'); return re.test(a) ? a.replace(re, '$1' + n + '="' + v + '"') : a + ' ' + n + '="' + v + '"'; }
  function restyleShape(all, tag, a, close) {
    var fill = (attr(a, 'fill') || '').toLowerCase(), stroke = (attr(a, 'stroke') || '').toLowerCase(), w = parseFloat(attr(a, 'stroke-width') || '1');
    var filled = !!fill && fill !== 'none', stroked = !!stroke && stroke !== 'none', ink = stroke === 'currentcolor';
    if (tag === 'path' && !attr(a, 'fill')) filled = false;
    if (filled && !stroked && fill === '#6d6d6d') {
      // a sketch point: the grey plus of a defined point
      if (tag === 'rect' && parseFloat(attr(a, 'width')) <= 2.6 && parseFloat(attr(a, 'height')) <= 2.6) return mk(parseFloat(attr(a, 'x')) + parseFloat(attr(a, 'width')) / 2, parseFloat(attr(a, 'y')) + parseFloat(attr(a, 'height')) / 2);
      if (tag === 'circle' && parseFloat(attr(a, 'r')) <= 1.7) return mk(parseFloat(attr(a, 'cx')), parseFloat(attr(a, 'cy')));
    }
    if (filled) {
      if (fill === '#c4c4c4') { a = setAttr(a, 'fill', B0); if (ink) a = setAttr(a, 'stroke', SL); }
      else if (PAPERISH[fill]) { if (ink) a = setAttr(a, 'stroke', SL); else if (stroked && SMAP[stroke]) a = setAttr(a, 'stroke', SMAP[stroke]); }
      else if (FMAP[fill]) {
        var nf = FMAP[fill];
        a = setAttr(a, 'fill', nf);
        if (stroked && SOLID[nf] && !attr(a, 'stroke-dasharray')) a = setAttr(setAttr(a, 'stroke', nf), 'stroke-width', '@FW');
        else if (stroked && SMAP[stroke]) a = setAttr(a, 'stroke', SMAP[stroke]);
      } else if (stroked && SMAP[stroke]) a = setAttr(a, 'stroke', SMAP[stroke]);
    } else if (stroked) {
      if (ink) { if (w >= 1.3 && !attr(a, 'stroke-dasharray')) a = setAttr(setAttr(a, 'stroke', LB), 'stroke-width', '2'); }
      else if (SMAP[stroke]) a = setAttr(a, 'stroke', SMAP[stroke]);
    }
    return '<' + tag + a + (close ? '/' : '') + '>';
  }
  // the size icons.js really draws at (an 18 px box holds a 16 px drawing), for the one-device-pixel face stroke
  function drawn(size) {
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1, k = size / 16 * dpr, n = Math.floor(k + 1e-6);
    return (n >= 1 && k - n > 0.01 && k / n - 1 <= 0.13 ? n : k) * 16 / dpr;
  }
  function finish(body, size) {
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1, s = drawn(size || 32);
    return body.replace(/@FW/g, String(Math.round(16 / (s * dpr) * 10000) / 10000))
      .replace(/(fill|stroke)="@DS"/g, '$1="#46627F" style="$1:color-mix(in srgb, currentColor 42%, ' + LB + ')"')
      .replace(/(fill|stroke)="@SI"/g, '$1="' + SL + '" style="$1:color-mix(in srgb, currentColor 58%, ' + LB + ')"');
  }
  function restyle(body, size) { return finish(String(body).replace(SHAPE, restyleShape), size); }
  function body(name, size) {
    var d = OWN[name];
    if (d == null) return null;
    if (typeof d !== 'string') d = d[drawn(size || 32) >= 24 ? 1 : 0];
    return finish(d, size);
  }
  // places whose buttons are not drawn through Icons(): { sel, attr, prefix, size } -> Icons(prefix + Attr value, size)
  var SLOTS = [{ sel: '#vp-qmask button[data-qmask]', attr: 'data-qmask', prefix: 'qm', size: 18 }];

  Icons.sets.register('mastercam', {
    body: body, restyle: restyle, has: function (name) { return OWN[name] != null; }, own: function () { return Object.keys(OWN); }, slots: SLOTS,
    palette: { line: LB, slate: SL, blue: [B1, B2, B3], tan: [T1, T2, T3], red: RD, green: GN, yellow: YL, grey: NG }
  });
})();
