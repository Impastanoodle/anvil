// library.js — the Design Library's own content, no DOM (loaded after examples/examples.js by index.html and the kernel
// test page). Global AnvilLibrary:
//   hardware   inch shop hardware as parametric part scripts (same script API as examples.js): hex bolts, hex nuts,
//              flat washers (USS / SAE) and PEM self-clinching nuts (S), flush-head studs (FH) and standoffs (SO).
//              One family per tile; its size / length is chosen when it is opened (AnvilLibrary.part).
//   features   library features dropped on a planar face: a sketch on the face plus a Cut-Extrude Through All
//              (slot, keyhole, D-hole, double-D, rectangular cutout, clearance-hole pattern, PEM mounting hole).
//              AnvilLibrary.featureEntities / featureArea / addFeature; the PropertyManager is in ui-app.js.
//   icons      16-grid SVG bodies for the tiles (drawn with Icons.svg, so they are weighed like every other icon).
// Threads are cosmetic: a threaded hole or shank is a plain cylinder at the nominal (major) diameter, so a bolt and its
// nut mate concentric without interference. Dimensions are the basic (nominal) values of the published tables named on
// each family; PEM values are the catalogue's nominal sizes — check the current PEM bulletin before release.
var AnvilLibrary = (function () {
  'use strict';
  var HEX = Math.sqrt(3) / 2;   // hexagon area = HEX * F^2 (F = across flats)
  function r6(x) { return Math.round(x * 1e6) / 1e6; }
  function n(x) { return String(r6(x)); }
  // 1.25 -> "1-1/4", 0.75 -> "3/4", 2 -> "2" (sixty-fourths)
  function frac(x) {
    var w = Math.floor(x + 1e-9), k = Math.round((x - w) * 64), d = 64;
    if (!k) return String(w);
    while (k % 2 === 0) { k /= 2; d /= 2; }
    return (w ? w + '-' : '') + k + '/' + d;
  }
  function circA(d) { return Math.PI * d * d / 4; }
  function lens(list) { return list.map(function (x) { return { label: frac(x), value: x }; }); }

  // ------------------------------------------------------------------ hardware
  // Hex cap screws, ASME B18.2.1 (basic): F across flats, H head height
  var BOLTS = [
    { label: '1/4-20', d: 0.25, F: 7 / 16, H: 5 / 32 },
    { label: '5/16-18', d: 5 / 16, F: 1 / 2, H: 13 / 64 },
    { label: '3/8-16', d: 3 / 8, F: 9 / 16, H: 15 / 64 },
    { label: '1/2-13', d: 0.5, F: 3 / 4, H: 5 / 16 }
  ];
  // Finished hex nuts, ASME B18.2.2 (basic)
  var NUTS = [
    { label: '1/4-20', d: 0.25, F: 7 / 16, H: 7 / 32 },
    { label: '5/16-18', d: 5 / 16, F: 1 / 2, H: 17 / 64 },
    { label: '3/8-16', d: 3 / 8, F: 9 / 16, H: 21 / 64 },
    { label: '1/2-13', d: 0.5, F: 3 / 4, H: 7 / 16 }
  ];
  // Plain flat washers, ASME B18.22.1 Type A: USS (wide) and SAE (narrow) series. id, od, t
  var WASHERS = [
    { label: '1/4 USS', id: 0.3125, od: 0.734, t: 0.065 },
    { label: '5/16 USS', id: 0.375, od: 0.875, t: 0.083 },
    { label: '3/8 USS', id: 0.4375, od: 1.0, t: 0.083 },
    { label: '1/2 USS', id: 0.5625, od: 1.375, t: 0.109 },
    { label: '1/4 SAE', id: 0.281, od: 0.625, t: 0.065 },
    { label: '5/16 SAE', id: 0.344, od: 0.688, t: 0.065 },
    { label: '3/8 SAE', id: 0.406, od: 0.812, t: 0.065 },
    { label: '1/2 SAE', id: 0.531, od: 1.062, t: 0.095 }
  ];
  // PEM self-clinching nuts, type S (steel): thread d, mounting hole, C shank Ø, E head Ø, T head height; A shank
  // length by shank code
  var PEM_S = [
    { label: 'S-440', thread: '4-40', d: 0.112, hole: 0.166, C: 0.165, E: 0.250, T: 0.060, A: { 1: 0.038, 2: 0.054 } },
    { label: 'S-632', thread: '6-32', d: 0.138, hole: 0.187, C: 0.186, E: 0.280, T: 0.060, A: { 1: 0.038, 2: 0.054 } },
    { label: 'S-832', thread: '8-32', d: 0.164, hole: 0.213, C: 0.212, E: 0.310, T: 0.060, A: { 1: 0.038, 2: 0.054 } },
    { label: 'S-1024', thread: '10-24', d: 0.190, hole: 0.250, C: 0.249, E: 0.340, T: 0.060, A: { 1: 0.038, 2: 0.054 } },
    { label: 'S-0420', thread: '1/4-20', d: 0.250, hole: 0.344, C: 0.343, E: 0.440, T: 0.080, A: { 1: 0.054, 2: 0.087 } }
  ];
  // PEM flush-head studs, type FH: thread d, mounting hole, H head Ø, Th head thickness; length code = length in 1/16
  var PEM_FH = [
    { label: 'FH-440', thread: '4-40', d: 0.112, hole: 0.111, H: 0.213, Th: 0.045 },
    { label: 'FH-632', thread: '6-32', d: 0.138, hole: 0.137, H: 0.250, Th: 0.050 },
    { label: 'FH-832', thread: '8-32', d: 0.164, hole: 0.163, H: 0.280, Th: 0.055 },
    { label: 'FH-1024', thread: '10-24', d: 0.190, hole: 0.189, H: 0.310, Th: 0.060 },
    { label: 'FH-0420', thread: '1/4-20', d: 0.250, hole: 0.250, H: 0.375, Th: 0.075 }
  ];
  // PEM thru-threaded standoffs, type SO (hex body): thread d, mounting hole, C shank Ø, A shank length, Fh hex across flats
  var PEM_SO = [
    { label: 'SO-440', thread: '4-40', d: 0.112, hole: 0.213, C: 0.212, A: 0.077, Fh: 0.250 },
    { label: 'SO-632', thread: '6-32', d: 0.138, hole: 0.213, C: 0.212, A: 0.077, Fh: 0.250 },
    { label: 'SO-832', thread: '8-32', d: 0.164, hole: 0.250, C: 0.249, A: 0.077, Fh: 0.312 },
    { label: 'SO-1024', thread: '10-24', d: 0.190, hole: 0.281, C: 0.280, A: 0.077, Fh: 0.312 },
    { label: 'SO-0420', thread: '1/4-20', d: 0.250, hole: 0.413, C: 0.412, A: 0.090, Fh: 0.437 }
  ];
  var BOLT_POINT = 1 / 32;   // 45° chamfer on the shank end

  var hardware = [
    { id: 'hexBolt', name: 'Hex Bolts', folder: 'Bolts and Screws', icon: 'bolt', standard: 'ASME B18.2.1 hex cap screw',
      choices: [{ key: 'size', label: 'Size', items: BOLTS }, { key: 'len', label: 'Length', items: lens([0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4]), def: '1' }],
      make: function (s) {
        var b = s.size, L = s.len.value, c = BOLT_POINT;
        return { name: 'Hex Bolt ' + b.label + ' x ' + s.len.label,
          note: 'Head ' + frac(b.F) + ' across flats x ' + frac(b.H) + ', thread cosmetic',
          volume: HEX * b.F * b.F * b.H + circA(b.d) * L - Math.PI * c * c * (b.d / 2 - c / 3),
          code: ['p.name("Hex Bolt ' + b.label + ' x ' + s.len.label + '").units("in");',
            '// head: hex ' + frac(b.F) + ' across flats, ' + frac(b.H) + ' high, on the Top plane; shank down -Y',
            'p.sketch("Top").polygon(0, 0, ' + n(b.F / Math.sqrt(3)) + ', 6, 0).extrude(' + n(b.H) + ');',
            'p.sketch("Top").circle(0, 0, ' + n(b.d / 2) + ').extrude(' + n(L) + ', { reverse: true });',
            'p.chamfer(' + n(c) + ', [[' + n(b.d / 2) + ', ' + n(-L) + ', 0]]);'].join('\n') };
      } },
    { id: 'hexNut', name: 'Hex Nuts', folder: 'Nuts', icon: 'nut', standard: 'ASME B18.2.2 finished hex nut',
      choices: [{ key: 'size', label: 'Size', items: NUTS }],
      make: function (s) {
        var b = s.size;
        return { name: 'Hex Nut ' + b.label, note: frac(b.F) + ' across flats x ' + frac(b.H) + ', thread cosmetic',
          volume: (HEX * b.F * b.F - circA(b.d)) * b.H,
          code: ['p.name("Hex Nut ' + b.label + '").units("in");',
            'p.sketch("Top").polygon(0, 0, ' + n(b.F / Math.sqrt(3)) + ', 6, 0).circle(0, 0, ' + n(b.d / 2) + ').extrude(' + n(b.H) + ');'].join('\n') };
      } },
    { id: 'washer', name: 'Flat Washers', folder: 'Washers', icon: 'washer', standard: 'ASME B18.22.1 Type A (USS wide / SAE narrow)',
      choices: [{ key: 'size', label: 'Size', items: WASHERS }],
      make: function (s) {
        var w = s.size;
        return { name: 'Flat Washer ' + w.label, note: 'ID ' + w.id.toFixed(3) + ', OD ' + w.od.toFixed(3) + ', ' + w.t.toFixed(3) + ' thick',
          volume: (circA(w.od) - circA(w.id)) * w.t,
          code: ['p.name("Flat Washer ' + w.label + '").units("in");',
            'p.sketch("Top").circle(0, 0, ' + n(w.od / 2) + ').circle(0, 0, ' + n(w.id / 2) + ').extrude(' + n(w.t) + ');'].join('\n') };
      } },
    { id: 'pemNut', name: 'PEM Nuts (S)', folder: 'PEM Self-Clinching', icon: 'pemNut', standard: 'PEM type S self-clinching nut',
      choices: [{ key: 'size', label: 'Thread', items: PEM_S }, { key: 'len', label: 'Shank code', items: [{ label: '1', value: 1 }, { label: '2', value: 2 }], def: '1' }],
      make: function (s) {
        var b = s.size, A = b.A[s.len.value], nm = b.label + '-' + s.len.label;
        return { name: 'PEM ' + nm, note: b.thread + ', mounting hole ' + b.hole.toFixed(3) + ', shank ' + A.toFixed(3),
          hole: b.hole, volume: (circA(b.E) - circA(b.d)) * b.T + (circA(b.C) - circA(b.d)) * A,
          code: ['p.name("PEM ' + nm + '").units("in");',
            '// head on the sheet (Top plane, +Y), shank into the ' + b.hole.toFixed(3) + ' mounting hole (-Y)',
            'p.sketch("Top").circle(0, 0, ' + n(b.E / 2) + ').circle(0, 0, ' + n(b.d / 2) + ').extrude(' + n(b.T) + ');',
            'p.sketch("Top").circle(0, 0, ' + n(b.C / 2) + ').circle(0, 0, ' + n(b.d / 2) + ').extrude(' + n(A) + ', { reverse: true });'].join('\n') };
      } },
    { id: 'pemStud', name: 'PEM Studs (FH)', folder: 'PEM Self-Clinching', icon: 'pemStud', standard: 'PEM type FH flush-head stud',
      choices: [{ key: 'size', label: 'Thread', items: PEM_FH }, { key: 'len', label: 'Length', items: lens([0.25, 0.375, 0.5, 0.625, 0.75, 1]), def: '1/2' }],
      make: function (s) {
        var b = s.size, L = s.len.value, nm = b.label + '-' + Math.round(L * 16);
        return { name: 'PEM ' + nm, note: b.thread + ' x ' + s.len.label + ', mounting hole ' + b.hole.toFixed(3),
          hole: b.hole, volume: circA(b.H) * b.Th + circA(b.d) * L,
          code: ['p.name("PEM ' + nm + '").units("in");',
            '// flush head on the Top plane (in the sheet), stud up +Y, length under the head',
            'p.sketch("Top").circle(0, 0, ' + n(b.H / 2) + ').extrude(' + n(b.Th) + ');',
            'p.sketch("Top", ' + n(b.Th) + ').circle(0, 0, ' + n(b.d / 2) + ').extrude(' + n(L) + ');'].join('\n') };
      } },
    { id: 'pemStandoff', name: 'PEM Standoffs (SO)', folder: 'PEM Self-Clinching', icon: 'pemStandoff', standard: 'PEM type SO thru-threaded standoff',
      choices: [{ key: 'size', label: 'Thread', items: PEM_SO }, { key: 'len', label: 'Length', items: lens([0.25, 0.375, 0.5, 0.625, 0.75, 1]), def: '1/2' }],
      make: function (s) {
        var b = s.size, L = s.len.value, nm = b.label + ' x ' + s.len.label;
        return { name: 'PEM ' + nm, note: b.thread + ' thru, hex ' + b.Fh.toFixed(3) + ', mounting hole ' + b.hole.toFixed(3),
          hole: b.hole, volume: (HEX * b.Fh * b.Fh - circA(b.d)) * L + (circA(b.C) - circA(b.d)) * b.A,
          code: ['p.name("PEM ' + nm + '").units("in");',
            '// hex body up from the sheet (Top plane), shank down into the mounting hole',
            'p.sketch("Top").polygon(0, 0, ' + n(b.Fh / Math.sqrt(3)) + ', 6, 0).circle(0, 0, ' + n(b.d / 2) + ').extrude(' + n(L) + ');',
            'p.sketch("Top").circle(0, 0, ' + n(b.C / 2) + ').circle(0, 0, ' + n(b.d / 2) + ').extrude(' + n(b.A) + ', { reverse: true });'].join('\n') };
      } }
  ];
  function family(id) { return hardware.filter(function (f) { return f.id === id || f.name === id; })[0] || null; }
  function pick(ch, label) {
    var want = label != null ? String(label) : ch.def;
    return ch.items.filter(function (it) { return it.label === want; })[0] || ch.items[0];
  }
  // part(familyId, sizeLabel?, lenLabel?) -> { family, name, note, code, volume, hole?, size, len }
  function part(id, size, len) {
    var f = family(id);
    if (!f) throw new Error('Unknown Design Library hardware "' + id + '"');
    var sel = {};
    f.choices.forEach(function (ch) { sel[ch.key] = pick(ch, ch.key === 'size' ? size : len); });
    var out = f.make(sel);
    out.family = f.id; out.size = sel.size.label; out.len = sel.len ? sel.len.label : null;
    return out;
  }
  // every size and length of every family (tests)
  function allParts() {
    var out = [];
    hardware.forEach(function (f) {
      var lensCh = f.choices[1];
      f.choices[0].items.forEach(function (s) {
        (lensCh ? lensCh.items : [null]).forEach(function (l) { out.push(part(f.id, s.label, l ? l.label : null)); });
      });
    });
    return out;
  }

  // ------------------------------------------------------------------ library features
  // Clearance holes for inch fasteners (ASME B18.2.8): close and normal fit, inch diameters
  var CLEARANCE = [
    { label: '#4', close: 0.116, normal: 0.1285 }, { label: '#6', close: 0.144, normal: 0.1495 },
    { label: '#8', close: 0.1695, normal: 0.177 }, { label: '#10', close: 0.196, normal: 0.201 },
    { label: '1/4', close: 0.257, normal: 0.266 }, { label: '5/16', close: 0.323, normal: 0.332 },
    { label: '3/8', close: 0.386, normal: 0.397 }, { label: '1/2', close: 0.5156, normal: 0.5312 }
  ];
  var PEM_HOLES = [];
  PEM_S.forEach(function (b) { PEM_HOLES.push({ label: b.label + ' nut', hole: b.hole }); });
  PEM_FH.forEach(function (b) { PEM_HOLES.push({ label: b.label + ' stud', hole: b.hole }); });
  PEM_SO.forEach(function (b) { PEM_HOLES.push({ label: b.label + ' standoff', hole: b.hole }); });
  function opt(list, label) { return list.filter(function (o) { return o.label === label; })[0] || list[0]; }

  // Entities are built centred on (0, 0) in the feature's own frame and then placed at (x, y), turned by `angle`.
  // Lengths are in the document's units; `s` scales the inch tables (1 in an inch part, 25.4 in mm).
  function L(x1, y1, x2, y2) { return { t: 'line', x1: x1, y1: y1, x2: x2, y2: y2 }; }
  function A(cx, cy, r, a0, a1) { return { t: 'arc', cx: cx, cy: cy, r: r, a0: a0, a1: a1 }; }
  function C(cx, cy, r) { return { t: 'circle', cx: cx, cy: cy, r: r }; }
  var DEG = 180 / Math.PI;
  var features = [
    { id: 'slot', name: 'Obround Slot', folder: 'Slots and Keyholes', icon: 'fSlot', help: 'A straight slot with round ends: overall length and width.',
      fields: [{ key: 'length', label: 'Overall length', def: 0.75 }, { key: 'width', label: 'Width', def: 0.25 }, { key: 'angle', label: 'Angle', deg: true, def: 0 }],
      check: function (v) { return v.width > 0 && v.length >= v.width ? null : 'The length must be at least the width.'; },
      entities: function (v) { var h = (v.length - v.width) / 2; return h > 1e-9 ? [{ t: 'slot', x1: -h, y1: 0, x2: h, y2: 0, w: v.width }] : [C(0, 0, v.width / 2)]; },
      area: function (v) { return (v.length - v.width) * v.width + Math.PI * v.width * v.width / 4; } },
    { id: 'keyhole', name: 'Keyhole', folder: 'Slots and Keyholes', icon: 'fKeyhole', help: 'A round hole for the head with a narrow slot for the shank (along +Y before the angle).',
      fields: [{ key: 'dia', label: 'Head hole Ø', def: 0.375 }, { key: 'width', label: 'Slot width', def: 0.1875 }, { key: 'length', label: 'Slot length (centres)', def: 0.375 }, { key: 'angle', label: 'Angle', deg: true, def: 0 }],
      check: function (v) {
        var R = v.dia / 2, a = v.width / 2;
        if (!(a > 0 && a < R)) return 'The slot must be narrower than the head hole.';
        return v.length > Math.sqrt(R * R - a * a) + 1e-6 ? null : 'The slot must reach out of the head hole.';
      },
      entities: function (v) {
        var R = v.dia / 2, a = v.width / 2, h = v.length, y0 = Math.sqrt(R * R - a * a), t1 = Math.atan2(y0, a) * DEG, t2 = 180 - t1;
        return [L(a, y0, a, h), A(0, h, a, 0, 180), L(-a, h, -a, y0), A(0, 0, R, t2, t1 + 360)];
      },
      area: function (v) {
        var R = v.dia / 2, a = v.width / 2, h = v.length, y0 = Math.sqrt(R * R - a * a);
        return Math.PI * R * R + 2 * a * (h - y0) + Math.PI * a * a / 2 - (R * R * Math.asin(a / R) - a * y0);
      } },
    { id: 'dhole', name: 'D-Hole', folder: 'Holes', icon: 'fDHole', help: 'A round hole with one flat; "Across flat" is from the flat to the far side.',
      fields: [{ key: 'dia', label: 'Diameter', def: 0.5 }, { key: 'flat', label: 'Across flat', def: 0.4375 }, { key: 'angle', label: 'Angle', deg: true, def: 0 }],
      check: function (v) { return v.dia > 0 && v.flat > 0 && v.flat < v.dia ? null : 'Across flat must be less than the diameter.'; },
      entities: function (v) {
        var R = v.dia / 2, f = v.flat - R, b = Math.sqrt(R * R - f * f), t1 = Math.atan2(f, b) * DEG, t2 = 180 - t1;
        return [L(b, f, -b, f), A(0, 0, R, t2, t1 + 360)];
      },
      area: function (v) { var R = v.dia / 2, f = v.flat - R; return Math.PI * R * R - (R * R * Math.acos(f / R) - f * Math.sqrt(R * R - f * f)); } },
    { id: 'doubleD', name: 'Double-D Hole', folder: 'Holes', icon: 'fDoubleD', help: 'A round hole with two parallel flats (the flats run along X before the angle).',
      fields: [{ key: 'dia', label: 'Diameter', def: 0.5 }, { key: 'flat', label: 'Across flats', def: 0.375 }, { key: 'angle', label: 'Angle', deg: true, def: 0 }],
      check: function (v) { return v.dia > 0 && v.flat > 0 && v.flat < v.dia ? null : 'Across flats must be less than the diameter.'; },
      entities: function (v) {
        var R = v.dia / 2, f = v.flat / 2, b = Math.sqrt(R * R - f * f), t1 = Math.atan2(f, b) * DEG;
        return [L(b, f, -b, f), A(0, 0, R, 180 - t1, 180 + t1), L(-b, -f, b, -f), A(0, 0, R, -t1, t1)];
      },
      area: function (v) { var R = v.dia / 2, f = v.flat / 2; return Math.PI * R * R - 2 * (R * R * Math.acos(f / R) - f * Math.sqrt(R * R - f * f)); } },
    { id: 'rectCut', name: 'Rectangular Cutout', folder: 'Cutouts', icon: 'fRect', help: 'A rectangular window with a corner radius (0 for sharp corners), centred on the location.',
      fields: [{ key: 'width', label: 'Width', def: 1 }, { key: 'height', label: 'Height', def: 0.5 }, { key: 'radius', label: 'Corner radius', def: 0.0625 }, { key: 'angle', label: 'Angle', deg: true, def: 0 }],
      check: function (v) { return v.width > 0 && v.height > 0 && v.radius >= 0 && 2 * v.radius <= Math.min(v.width, v.height) + 1e-9 ? null : 'The corner radius must be at most half the shorter side.'; },
      entities: function (v) {
        var w = v.width / 2, h = v.height / 2, r = Math.min(v.radius, w, h);
        if (r <= 1e-9) return [L(-w, -h, w, -h), L(w, -h, w, h), L(w, h, -w, h), L(-w, h, -w, -h)];
        var out = [];
        if (h - r > 1e-9) { out.push(L(w, -h + r, w, h - r)); out.push(L(-w, h - r, -w, -h + r)); }
        if (w - r > 1e-9) { out.push(L(w - r, h, -w + r, h)); out.push(L(-w + r, -h, w - r, -h)); }
        out.push(A(w - r, h - r, r, 0, 90), A(-w + r, h - r, r, 90, 180), A(-w + r, -h + r, r, 180, 270), A(w - r, -h + r, r, 270, 360));
        return out;
      },
      area: function (v) { var r = Math.min(v.radius, v.width / 2, v.height / 2); return v.width * v.height - (4 - Math.PI) * r * r; } },
    { id: 'holePattern', name: 'Clearance Hole Pattern', folder: 'Holes', icon: 'fHoles', help: 'Inch fastener clearance holes (ASME B18.2.8) on a grid centred on the location.',
      fields: [{ key: 'size', label: 'Fastener', type: 'select', options: CLEARANCE.map(function (c) { return c.label; }), def: '1/4' },
        { key: 'fit', label: 'Fit', type: 'select', options: ['Normal', 'Close'], def: 'Normal' },
        { key: 'cols', label: 'Holes along X', count: true, def: 2 }, { key: 'rows', label: 'Holes along Y', count: true, def: 2 },
        { key: 'sx', label: 'Spacing X', def: 1 }, { key: 'sy', label: 'Spacing Y', def: 1 }, { key: 'angle', label: 'Angle', deg: true, def: 0 }],
      dia: function (v, s) { var c = opt(CLEARANCE, v.size); return (v.fit === 'Close' ? c.close : c.normal) * (s || 1); },
      check: function (v) { return v.cols >= 1 && v.rows >= 1 && (v.cols < 2 || v.sx > 0) && (v.rows < 2 || v.sy > 0) ? null : 'Give at least one hole and a spacing for each direction with two or more.'; },
      entities: function (v, s) {
        var r = this.dia(v, s) / 2, out = [], nx = Math.max(1, Math.round(v.cols)), ny = Math.max(1, Math.round(v.rows));
        for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) out.push(C((i - (nx - 1) / 2) * v.sx, (j - (ny - 1) / 2) * v.sy, r));
        return out;
      },
      area: function (v, s) { return Math.max(1, Math.round(v.cols)) * Math.max(1, Math.round(v.rows)) * circA(this.dia(v, s)); } },
    { id: 'pemHole', name: 'PEM Mounting Hole', folder: 'Holes', icon: 'fPem', help: 'The mounting hole for a PEM nut, stud or standoff from the Hardware folder.',
      fields: [{ key: 'pem', label: 'PEM part', type: 'select', options: PEM_HOLES.map(function (p) { return p.label; }), def: 'S-632 nut' }],
      dia: function (v, s) { return opt(PEM_HOLES, v.pem).hole * (s || 1); },
      check: function () { return null; },
      entities: function (v, s) { return [C(0, 0, this.dia(v, s) / 2)]; },
      area: function (v, s) { return circA(this.dia(v, s)); } }
  ];
  function feature(id) { return features.filter(function (f) { return f.id === id || f.name === id; })[0] || null; }
  // default values of a feature, lengths scaled to the document (s = 25.4 in a mm part)
  function featureDefaults(id, s) {
    var f = feature(id), v = { x: 0, y: 0 };
    f.fields.forEach(function (fd) { v[fd.key] = fd.type === 'select' || fd.deg || fd.count ? fd.def : r6(fd.def * (s || 1)); });
    return v;
  }
  function place(e, x, y, ang) {
    var c = Math.cos(ang / DEG), sn = Math.sin(ang / DEG);
    function P(u, v) { return [r6(x + u * c - v * sn), r6(y + u * sn + v * c)]; }
    var o = { t: e.t }, a, b;
    if (e.t === 'line' || e.t === 'slot') { a = P(e.x1, e.y1); b = P(e.x2, e.y2); o.x1 = a[0]; o.y1 = a[1]; o.x2 = b[0]; o.y2 = b[1]; if (e.t === 'slot') o.w = r6(e.w); return o; }
    a = P(e.cx, e.cy); o.cx = a[0]; o.cy = a[1]; o.r = r6(e.r);
    if (e.t === 'arc') { o.a0 = r6(e.a0 + ang); o.a1 = r6(e.a1 + ang); }
    return o;
  }
  // featureEntities(id, values, s) -> sketch entities at (values.x, values.y) turned by values.angle; throws the
  // feature's own sentence when the values do not make a shape
  function featureEntities(id, v, s) {
    var f = feature(id);
    if (!f) throw new Error('Unknown library feature "' + id + '"');
    var why = f.check(v, s || 1);
    if (why) throw new Error(why);
    return f.entities(v, s || 1).map(function (e) { return place(e, +v.x || 0, +v.y || 0, +v.angle || 0); });
  }
  function featureArea(id, v, s) { return feature(id).area(v, s || 1); }
  // addFeature(model, plane, id, values, opts) -> { sketch, cut }: pushes a sketch on `plane` (a face frame from
  // UI.facePlane / Kernel.planeFromFace) holding the feature's entities and a Cut-Extrude Through All of it (into the
  // material: no direction given, the rebuild picks it as SolidWorks does). The caller pushes undo and rebuilds.
  function addFeature(model, plane, id, v, opts) {
    var K = typeof Kernel !== 'undefined' ? Kernel : null, s = model.units === 'mm' ? 25.4 : 1;
    var ents = featureEntities(id, v, s), f = feature(id);
    var sk = { type: 'sketch', plane: plane, entities: ents };
    sk.id = model.nextId++; sk.name = K && K.featureName ? K.featureName(model, 'sketch') : 'Sketch' + sk.id;
    model.features.push(sk);
    var cut = { type: 'extrude', sketch: sk.id, depth: 0, end: 'through', cut: true, dir2: false, depth2: 0, end2: 'blind' };
    if (model.sheet || (opts && opts.normalCut)) cut.normalCut = true;
    cut.id = model.nextId++;
    cut.name = (opts && opts.name) || (K && K.featureName ? K.featureName(model, 'extrude', true) : 'Cut-Extrude' + cut.id);
    cut.library = f.id;
    model.features.push(cut);
    return { sketch: sk, cut: cut };
  }

  // ------------------------------------------------------------------ curved parts (folder Parts)
  // Parts that show big radii, sweeps, lofts and revolves. `volume`: exact where the geometry is (sweeps of a
  // section along lines and tangent arcs, revolves of lines and arcs), else `range` [min, max] for a sanity check.
  var PI = Math.PI;
  var shapes = [
    { name: 'D-Handle', folder: 'Bent and Swept', icon: 'sHandle', note: 'Ø3/8 round bar swept along legs and an R3/4 bend each side, 4 in centres',
      volume: circA(0.375) * (2 * 0.25 + 2.5 + 2 * (PI / 2) * 0.75),
      code: ['p.name("D-Handle").units("in");',
        '// Ø3/8 bar: the section sits on the Top plane at the start of the path',
        'var bar = p.sketch("Top").circle(-2, 0, 0.1875).id();',
        '// path on the Front plane: legs .25, R.75 bends, 2.5 straight grip',
        'var path = p.sketch("Front")',
        '  .line(-2, 0, -2, 0.25).arc(-1.25, 0.25, 0.75, 90, 180).line(-1.25, 1, 1.25, 1)',
        '  .arc(1.25, 0.25, 0.75, 0, 90).line(2, 0.25, 2, 0).id();',
        'p.sweep({ profile: bar, path: path, name: "Grip" });'].join('\n') },
    { name: 'Handrail Tube', folder: 'Bent and Swept', icon: 'sRail', note: '1-1/2 OD x .120 wall tube, two R6 bends, 40 in wide x 36 in high',
      volume: (circA(1.5) - circA(1.26)) * (30 + 28 + 30 + 2 * (PI / 2) * 6),
      code: ['p.name("Handrail Tube").units("in");',
        'var tube = p.sketch("Top").circle(0, 0, 0.75).circle(0, 0, 0.63).id();   // 1-1/2 OD x .120 wall',
        'var path = p.sketch("Front")',
        '  .line(0, 0, 0, 30).arc(6, 30, 6, 90, 180).line(6, 36, 34, 36)',
        '  .arc(34, 30, 6, 0, 90).line(40, 30, 40, 0).id();',
        'p.sweep({ profile: tube, path: path, name: "Rail" });'].join('\n') },
    { name: 'Compression Spring', folder: 'Bent and Swept', icon: 'sSpring', note: 'Ø.0625 wire on a Ø1 helix, .25 pitch, 8 turns (Helix + Sweep)',
      volume: circA(0.0625) * 8 * Math.sqrt(Math.pow(2 * PI * 0.5, 2) + 0.25 * 0.25), tolerance: 0.01,
      code: ['p.name("Compression Spring").units("in");',
        'var s = p.sketch("Top").circle(0, 0, 0.5).id();',
        'var h = p.helix(s, { pitch: 0.25, revolutions: 8 });',
        'var wire = p.sketch("Front").circle(0.5, 0, 0.03125).id();',
        'p.sweep({ profile: wire, path: h, name: "Coil" });'].join('\n') },
    { name: 'Rolled Cover', folder: 'Rounded and Revolved', icon: 'sRolled', note: '16 ga (.0598) cover rolled to R10 through 90°, 4 in straight legs, 12 in wide',
      volume: 12 * ((PI / 4) * (Math.pow(10.0598, 2) - 100) + 2 * 4 * 0.0598),
      code: ['p.name("Rolled Cover").units("in");',
        '// the section on the Front plane: R10 inside, .0598 thick, a 4 in tangent leg at each end; 12 in deep',
        'p.sketch("Front")',
        '  .line(10, -4, 10.0598, -4).line(10.0598, -4, 10.0598, 0).arc(0, 0, 10.0598, 0, 90)',
        '  .line(0, 10.0598, -4, 10.0598).line(-4, 10.0598, -4, 10).line(-4, 10, 0, 10)',
        '  .arc(0, 0, 10, 0, 90).line(10, 0, 10, -4)',
        '  .extrude(12);'].join('\n') },
    { name: 'Rounded Plate', folder: 'Rounded and Revolved', icon: 'sPlate', note: '6 x 4 x 1/2 plate, R1 corners, Ø1 centre hole, every top edge rounded R1/8',
      range: [6 * 4 * 0.5 - 4 * (1 - PI / 4) * 0.5 - circA(1) * 0.5 - 0.2, 6 * 4 * 0.5 - 4 * (1 - PI / 4) * 0.5 - circA(1) * 0.5],
      code: ['p.name("Rounded Plate").units("in");',
        'p.sketch("Top").rect(-3, -2, 6, 4).extrude(0.5);',
        'p.fillet(1, [[3, 0.25, 2], [-3, 0.25, 2], [3, 0.25, -2], [-3, 0.25, -2]]);   // R1 corners',
        'p.sketch("Top", 0.5).circle(0, 0, 0.5).cut("through");',
        'p.fillet(0.125, [[0, 0.5, 2]]);                                              // the top edge, chained round the corners'].join('\n') },
    { name: 'Domed Knob', folder: 'Rounded and Revolved', icon: 'sKnob', note: 'Ø2 knob revolved from a line-and-arc profile: R1 dome, Ø1/4 x 1/2 deep bore',
      volume: PI * 0.6 + (2 / 3) * PI - circA(0.25) * 0.5,
      code: ['p.name("Domed Knob").units("in");',
        'p.sketch("Front").line(0, 0, 1, 0).line(1, 0, 1, 0.6).arc(0, 0.6, 1, 0, 90).line(0, 1.6, 0, 0)',
        '  .revolve(360);',
        'p.sketch("Top").circle(0, 0, 0.125).cut(0.5);'].join('\n') },
    { name: 'Trumpet Funnel', folder: 'Rounded and Revolved', icon: 'sFunnel', note: 'Three-section loft Ø4 > Ø1.8 > Ø1 over 4 in: a smooth spline flare',
      range: [PI * (0.25 + 0.81) * 2 * 0.9, PI * 4 * 4],
      code: ['p.name("Trumpet Funnel").units("in");',
        'var a = p.sketch("Top").circle(0, 0, 2).id();',
        'var b = p.sketch("Top", 2).circle(0, 0, 0.9).id();',
        'var c = p.sketch("Top", 4).circle(0, 0, 0.5).id();',
        'p.loft([a, b, c]);'].join('\n') }
  ];
  function shape(name) { return shapes.filter(function (s) { return s.name === name; })[0] || null; }

  // ------------------------------------------------------------------ tile icons (16 grid; Icons.svg weighs them)
  var S = 'currentColor', E = '#464646', F1 = '#e8e8e8', F2 = '#b8b8b8', F3 = '#8e8e8e', W = '#ffffff', FY = '#f5c400', FYL = '#ffe57a', FYD = '#c08f00';
  function pa(d, fill, stroke, w) { return '<path d="' + d + '" fill="' + (fill || 'none') + '" stroke="' + (stroke || 'none') + '"' + (w ? ' stroke-width="' + w + '"' : '') + ' stroke-linejoin="round" stroke-linecap="round"/>'; }
  function ci(cx, cy, r, fill, stroke, w) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + (fill || 'none') + '" stroke="' + (stroke || 'none') + '"' + (w ? ' stroke-width="' + w + '"' : '') + '/>'; }
  var hexPts = 'M14.5 8 L11.25 13.63 L4.75 13.63 L1.5 8 L4.75 2.37 L11.25 2.37 Z';
  var plate = pa('M1.5 3.5 h13 v9 h-13 z', F1, E, 1);
  var icons = {
    bolt: pa('M3.5 1.5 h9 v3 h-9 z', F2, E, 1) + pa('M6.5 1.5 v3 M9.5 1.5 v3', null, E, 1) + pa('M6 4.5 h4 v8.5 l-1 1.5 h-2 l-1 -1.5 z', F1, E, 1) + pa('M6 7 h4 M6 9 h4 M6 11 h4', null, S, 0.6),
    nut: pa(hexPts, F1, E, 1) + ci(8, 8, 2.8, W, E, 1) + pa('M5.2 8 a2.8 2.8 0 0 1 5.6 0', null, F3, 0.6),
    washer: ci(8, 8, 6.5, F1, E, 1) + ci(8, 8, 3, W, E, 1),
    pemNut: pa('M2.5 3.5 h11 v3 h-11 z', F2, E, 1) + pa('M4.5 6.5 h7 v6 h-7 z', F1, E, 1) + pa('M6.5 3.5 v9 M9.5 3.5 v9', null, S, 0.6) + pa('M1 9.5 h3.5 M11.5 9.5 h3.5', null, S, 1),
    pemStud: pa('M3.5 12.5 h9 v2 h-9 z', F2, E, 1) + pa('M6.5 1.5 h3 v11 h-3 z', F1, E, 1) + pa('M6.5 4 h3 M6.5 6.5 h3 M6.5 9 h3', null, S, 0.6),
    pemStandoff: pa('M3.5 1.5 h9 v10 h-9 z', F1, E, 1) + pa('M6.5 1.5 v10 M9.5 1.5 v10', null, F3, 1) + pa('M5 11.5 h6 v3 h-6 z', F2, E, 1),
    fSlot: plate + pa('M5.5 6 h5 a2 2 0 0 1 0 4 h-5 a2 2 0 0 1 0 -4 z', FYL, FYD, 1),
    fKeyhole: plate + pa('M7 5.5 a1 1 0 0 1 2 0 v3.3 a2.6 2.6 0 1 1 -2 0 z', FYL, FYD, 1),
    fDHole: plate + pa('M5.4 6 h5.2 a3.3 3.3 0 1 1 -5.2 0 z', FYL, FYD, 1),
    fDoubleD: plate + pa('M5.4 6 h5.2 a3.3 3.3 0 0 1 0 4 h-5.2 a3.3 3.3 0 0 1 0 -4 z', FYL, FYD, 1),
    fRect: plate + pa('M5 6 h6 a1 1 0 0 1 1 1 v2 a1 1 0 0 1 -1 1 h-6 a1 1 0 0 1 -1 -1 v-2 a1 1 0 0 1 1 -1 z', FYL, FYD, 1),
    fHoles: plate + ci(5, 6, 1.3, FYL, FYD, 1) + ci(11, 6, 1.3, FYL, FYD, 1) + ci(5, 10, 1.3, FYL, FYD, 1) + ci(11, 10, 1.3, FYL, FYD, 1),
    fPem: plate + ci(8, 8, 2.5, FYL, FYD, 1) + ci(8, 8, 1, FY, 'none')
  };

  return {
    hardware: hardware, family: family, part: part, allParts: allParts, frac: frac,
    shapes: shapes, shape: shape,
    features: features, feature: feature, featureDefaults: featureDefaults, featureEntities: featureEntities, featureArea: featureArea, addFeature: addFeature,
    clearance: CLEARANCE, pemHoles: PEM_HOLES, icons: icons,
    // the Design Library folders in SolidWorks' order (Examples are the AnvilExamples / built-in samples; Forming
    // Tools list Kernel.FORMING_TOOLS when the kernel has them)
    folders: [
      { id: 'examples', name: 'Examples' },
      { id: 'hardware', name: 'Hardware', subs: ['Bolts and Screws', 'Nuts', 'Washers', 'PEM Self-Clinching'] },
      { id: 'features', name: 'Features', subs: ['Holes', 'Slots and Keyholes', 'Cutouts'] },
      { id: 'forming', name: 'Forming Tools' }
    ]
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = AnvilLibrary;
