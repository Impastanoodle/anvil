// sketch-font.js — Anvil's built-in single-stroke engraving font for Sketch Text (kernel-sketch.js, entity 'text').
// No DOM: loaded by the page, the rebuild worker, the OpenCascade worker and the Node runner, before kernel-sketch.js
// uses it. The font is Anvil's own (drawn here on a grid, like a CNC engraving font; no outside font data): every glyph
// is a few strokes — straight lines and true circular arcs — so a laser etches each letter in one pass and a DXF of it
// holds LINE / ARC entities, not TEXT.
//
// Grid units: cap height 12 (the letter height h maps to 12 units), x-height 8, descenders to -4, the baseline at 0.
// A glyph is [width, strokes]: its ink runs from x = 0 to x = width and the advance to the next letter is width + GAP.
// Strokes are separated by ';': a polyline 'x,y x,y …' (one line stroke per segment) or an arc '@cx,cy,r,a0,a1'
// (degrees, counter-clockwise from a0 to a1, a0 < a1; a sweep of 360 is a full circle).
//
//   SketchFont.layout(str, opts) -> { strokes, glyphs, lines, width, height }
//     opts: height (cap height, default 1), widthFactor (1 = 100 %), charSpacing (1 = the normal gap between letters;
//     0.5 halves it), lineSpacing (baseline-to-baseline pitch in cap heights, default 1.6), align ('left' | 'center' |
//     'right': where x = 0 is on each line), valign ('baseline' | 'middle' | 'top': where y = 0 is on the block).
//     strokes: [{ t: 'line', x1, y1, x2, y2 } | { t: 'arc', cx, cy, r, a0, a1 } | { t: 'poly', pts }] in text
//     coordinates (x along the baseline, y up). An arc stretched by a widthFactor other than 1 is no longer circular:
//     it becomes a 'poly' stroke (32 chords per turn).
//     glyphs: [{ ch, line, x, y, w, adv, strokes }] — each letter's box from x to x + w on the baseline y, its strokes
//     relative to (x, y) (kernel-sketch.js places them one by one along a curve). width: the widest line's ink width
//     (the last letter's trailing gap not counted); height: cap height + the line pitch for each further line.
//   SketchFont.glyph(ch) -> { ch, w, adv, strokes } in cap heights (w: ink width, adv: advance), '?' for a character
//     the font does not have; SketchFont.chars: every character it has; SketchFont.strokeBox(s) -> [x0, y0, x1, y1].
var SketchFont = (function () {
  'use strict';
  var CAP = 12, GAP = 3, D2R = Math.PI / 180;
  var DATA = {
    'A': [8, '0,0 4,12 8,0; 1.5,4.5 6.5,4.5'],
    'B': [8, '5,12 0,12 0,0 5,0; 0,6 5,6; @5,9,3,-90,90; @5,3,3,-90,90'],
    'C': [8, '@4,8,4,30,180; 0,8 0,4; @4,4,4,180,330'],
    'D': [8, '4,12 0,12 0,0 4,0; @4,8,4,0,90; 8,8 8,4; @4,4,4,270,360'],
    'E': [8, '8,12 0,12 0,0 8,0; 0,6 6,6'],
    'F': [8, '8,12 0,12 0,0; 0,6 6,6'],
    'G': [8, '@4,8,4,30,180; 0,8 0,4; @4,4,4,180,360; 8,4 8,6 5,6'],
    'H': [8, '0,0 0,12; 8,0 8,12; 0,6 8,6'],
    'I': [2, '1,0 1,12'],
    'J': [8, '8,12 8,4; @4,4,4,180,360'],
    'K': [8, '0,0 0,12; 8,12 0,4; 3,7 8,0'],
    'L': [7, '0,12 0,0 7,0'],
    'M': [10, '0,0 0,12 5,4 10,12 10,0'],
    'N': [8, '0,0 0,12 8,0 8,12'],
    'O': [8, '@4,8,4,0,180; 0,8 0,4; @4,4,4,180,360; 8,4 8,8'],
    'P': [8, '0,0 0,12 5,12; @5,9,3,-90,90; 5,6 0,6'],
    'Q': [8, '@4,8,4,0,180; 0,8 0,4; @4,4,4,180,360; 8,4 8,8; 5,3 8,0'],
    'R': [8, '0,0 0,12 5,12; @5,9,3,-90,90; 5,6 0,6; 4,6 8,0'],
    'S': [8, '@4,9,3,30,270; @4,3,3,-150,90'],
    'T': [8, '0,12 8,12; 4,12 4,0'],
    'U': [8, '0,12 0,4; @4,4,4,180,360; 8,4 8,12'],
    'V': [8, '0,12 4,0 8,12'],
    'W': [12, '0,12 3,0 6,8 9,0 12,12'],
    'X': [8, '0,0 8,12; 0,12 8,0'],
    'Y': [8, '0,12 4,6 8,12; 4,6 4,0'],
    'Z': [8, '0,12 8,12 0,0 8,0'],
    'a': [8, '@4,4,4,0,360; 8,8 8,0'],
    'b': [8, '0,12 0,0; @4,4,4,0,360'],
    'c': [8, '@4,4,4,45,315'],
    'd': [8, '8,12 8,0; @4,4,4,0,360'],
    'e': [8, '0,4 8,4; @4,4,4,0,315'],
    'f': [6, '2,0 2,9; @5,9,3,90,180; 0,8 5,8'],
    'g': [8, '@4,4,4,0,360; 8,8 8,-1; @5,-1,3,180,360'],
    'h': [8, '0,12 0,0; @4,4,4,0,180; 8,4 8,0'],
    'i': [2, '1,0 1,8; 1,10.5 1,11.5'],
    'j': [4, '3,8 3,-1; @0,-1,3,270,360; 3,10.5 3,11.5'],
    'k': [7, '0,12 0,0; 7,8 0,3; 2.8,5 7,0'],
    'l': [2, '1,12 1,0'],
    'm': [12, '0,8 0,0; @3,5,3,0,180; 6,5 6,0; @9,5,3,0,180; 12,5 12,0'],
    'n': [8, '0,8 0,0; @4,4,4,0,180; 8,4 8,0'],
    'o': [8, '@4,4,4,0,360'],
    'p': [8, '0,8 0,-4; @4,4,4,0,360'],
    'q': [8, '8,8 8,-4; @4,4,4,0,360'],
    'r': [5, '0,8 0,0; @4,4,4,90,180'],
    's': [6, '@3,6,2,30,270; @3,2,2,-150,90'],
    't': [6, '2,11 2,2; @4,2,2,180,270; 0,8 5,8'],
    'u': [8, '0,8 0,4; @4,4,4,180,360; 8,8 8,0'],
    'v': [8, '0,8 4,0 8,8'],
    'w': [10, '0,8 2.5,0 5,6 7.5,0 10,8'],
    'x': [8, '0,0 8,8; 0,8 8,0'],
    'y': [8, '0,8 4,0; 8,8 2,-4'],
    'z': [8, '0,8 8,8 0,0 8,0'],
    '0': [8, '@4,8.5,3.5,0,180; 0.5,8.5 0.5,3.5; @4,3.5,3.5,180,360; 7.5,3.5 7.5,8.5'],
    '1': [8, '1.5,9.5 4.5,12 4.5,0'],
    '2': [8, '@4,8,4,-40,180; 7.0642,5.4288 0,0 8,0'],
    '3': [8, '@4,9,3,-90,150; @4,3,3,-150,90'],
    '4': [8, '6,0 6,12 0,4 8,4'],
    '5': [8, '7,12 1,12 1,7 4,7; @4,3.5,3.5,-140,90'],
    '6': [8, '@4,4,4,0,360; 0,4 0,8; @4,8,4,60,180'],
    '7': [8, '0,12 8,12 2.5,0'],
    '8': [8, '@4,9.2,2.8,0,360; @4,3.3,3.3,0,360'],
    '9': [8, '@4,8,4,0,360; 8,8 8,4; @4,4,4,240,360'],
    '-': [6, '1,5 5,5'],
    '.': [2, '1,0 1,1'],
    ',': [3, '1.5,1 1.5,0 0.5,-2'],
    '/': [6, '0,0 6,12'],
    '\\': [6, '0,12 6,0'],
    '(': [4, '@8.5,6,8,131.40962211,228.59037789'],
    ')': [4, '@-4.5,6,8,-48.59037789,48.59037789'],
    '#': [8, '2.5,1 3.5,11; 5.5,1 6.5,11; 0.5,4 8,4; 0,8 7.5,8'],
    '+': [8, '4,2 4,10; 0,6 8,6'],
    '=': [8, '0,4 8,4; 0,8 8,8'],
    ':': [2, '1,0 1,1; 1,6 1,7'],
    '_': [8, '0,-1.5 8,-1.5'],
    '\'': [2, '1,12 1,9'],
    '"': [5, '1,12 1,9; 4,12 4,9'],
    '°': [4, '@2,10,2,0,360'],
    'Ø': [9, '@4.5,6,4.5,0,360; 0,0 9,12'],
    '±': [8, '4,5 4,11; 1,8 7,8; 1,2 7,2'],
    '&': [8, '@3.5,9.5,2.5,-30,210; 5.6651,8.25 1.3019,4.9284; @3.6,3,3,140,330; 6.1981,1.5 8,3.5; 1.3349,8.25 8,0'],
    '@': [10, '@5,6,2,0,360; 7,8 7,4.5; @8.25,4.5,1.25,180,360; @5,6,4.7434,-18.4349,300'],
    '?': [8, '@4,9,3,-90,160; 4,6 4,3.5; 4,0 4,1'],
    '!': [2, '1,12 1,3.5; 1,0 1,1'],
    '%': [8, '0,0 8,12; @1.5,10.5,1.5,0,360; @6.5,1.5,1.5,0,360'],
    ' ': [5, '']
  };

  // ------------------------------------------------------------------ glyphs (parsed once, in cap heights)
  var parsed = {};
  function parseGlyph(ch) {
    var d = DATA[ch], strokes = [];
    String(d[1]).split(';').forEach(function (part) {
      part = part.trim();
      if (!part) return;
      if (part.charAt(0) === '@') {
        var a = part.slice(1).split(',').map(Number);
        strokes.push({ t: 'arc', cx: a[0] / CAP, cy: a[1] / CAP, r: a[2] / CAP, a0: a[3], a1: a[4] });
        return;
      }
      var pts = part.split(/\s+/).map(function (q) { var c = q.split(',').map(Number); return [c[0] / CAP, c[1] / CAP]; });
      for (var i = 0; i + 1 < pts.length; i++) strokes.push({ t: 'line', x1: pts[i][0], y1: pts[i][1], x2: pts[i + 1][0], y2: pts[i + 1][1] });
    });
    return { ch: ch, w: d[0] / CAP, adv: (d[0] + GAP) / CAP, strokes: strokes };
  }
  function glyph(ch) {
    if (!DATA[ch]) ch = '?';
    return parsed[ch] || (parsed[ch] = parseGlyph(ch));
  }
  function has(ch) { return !!DATA[ch]; }

  // the extents of a stroke: [x0, y0, x1, y1] (an arc's through every quadrant point it passes)
  function strokeBox(s) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    function grow(x, y) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
    if (s.t === 'line') { grow(s.x1, s.y1); grow(s.x2, s.y2); }
    else if (s.t === 'poly') s.pts.forEach(function (p) { grow(p[0], p[1]); });
    else {
      grow(s.cx + s.r * Math.cos(s.a0 * D2R), s.cy + s.r * Math.sin(s.a0 * D2R));
      grow(s.cx + s.r * Math.cos(s.a1 * D2R), s.cy + s.r * Math.sin(s.a1 * D2R));
      for (var q = Math.ceil(s.a0 / 90); q * 90 <= s.a1; q++) grow(s.cx + s.r * Math.cos(q * Math.PI / 2), s.cy + s.r * Math.sin(q * Math.PI / 2));
    }
    return b;
  }

  // ------------------------------------------------------------------ layout
  // a glyph stroke scaled by (sx, sy) and moved by (dx, dy); an arc under unequal scales becomes a polyline
  function place(s, sx, sy, dx, dy) {
    if (s.t === 'line') return { t: 'line', x1: dx + s.x1 * sx, y1: dy + s.y1 * sy, x2: dx + s.x2 * sx, y2: dy + s.y2 * sy };
    if (Math.abs(sx - sy) <= 1e-12 * Math.max(sx, sy)) return { t: 'arc', cx: dx + s.cx * sx, cy: dy + s.cy * sy, r: s.r * sx, a0: s.a0, a1: s.a1 };
    var sweep = s.a1 - s.a0, n = Math.max(4, Math.ceil(32 * sweep / 360)), pts = [];
    for (var i = 0; i <= n; i++) {
      var a = (s.a0 + sweep * i / n) * D2R;
      pts.push([dx + (s.cx + s.r * Math.cos(a)) * sx, dy + (s.cy + s.r * Math.sin(a)) * sy]);
    }
    return { t: 'poly', pts: pts, closed: sweep >= 360 - 1e-9 };
  }
  function layout(str, opts) {
    opts = opts || {};
    var h = opts.height > 0 ? +opts.height : 1, wf = opts.widthFactor > 0 ? +opts.widthFactor : 1;
    var cs = opts.charSpacing != null && isFinite(+opts.charSpacing) ? Math.max(0, +opts.charSpacing) : 1;
    var pitch = (opts.lineSpacing > 0 ? +opts.lineSpacing : 1.6) * h;
    var sx = h * wf, sy = h, gap = GAP / CAP;
    var rows = String(str == null ? '' : str).replace(/\r\n?/g, '\n').replace(/\t/g, ' ').split('\n');
    var lines = [], glyphs = [], strokes = [], width = 0;
    rows.forEach(function (row, li) {
      // the letters of the line from x = 0: each advances by its width plus the (scaled) gap
      var x = 0, list = [];
      Array.prototype.forEach.call(row, function (ch) {
        var g = glyph(ch);
        list.push({ g: g, x: x });
        x += (g.w + gap * cs) * sx;
      });
      var lw = list.length ? x - gap * cs * sx : 0;
      lines.push({ width: lw, list: list, y: -li * pitch });
      width = Math.max(width, lw);
    });
    var n = lines.length, dy = 0;
    if (opts.valign === 'top') dy = -h;
    else if (opts.valign === 'middle') dy = -(h - (n - 1) * pitch) / 2;
    lines.forEach(function (L, li) {
      var x0 = opts.align === 'center' ? -L.width / 2 : opts.align === 'right' ? -L.width : 0, y = L.y + dy;
      L.x0 = x0; L.y = y;
      L.list.forEach(function (it) {
        var gx = x0 + it.x, own = it.g.strokes.map(function (s) { return place(s, sx, sy, 0, 0); });
        glyphs.push({ ch: it.g.ch, line: li, x: gx, y: y, w: it.g.w * sx, adv: (it.g.w + gap * cs) * sx, strokes: own });
        it.g.strokes.forEach(function (s) { strokes.push(place(s, sx, sy, gx, y)); });
      });
      delete L.list;
    });
    return { strokes: strokes, glyphs: glyphs, lines: lines, width: width, height: h + (n - 1) * pitch };
  }

  return {
    CAP: CAP, GAP: GAP, DESCENT: 4 / CAP, XHEIGHT: 8 / CAP,
    chars: Object.keys(DATA).join(''),
    has: has, glyph: glyph, layout: layout, strokeBox: strokeBox
  };
})();
