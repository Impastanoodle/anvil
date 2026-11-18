  // --- rfOL (2026-11-18, lane flangeprofile; OpenCascade side tests/occt/rfOL.js) --- (1) an Edge Flange with its own
  // profile (SolidWorks' Edit Flange Profile, any shape: kernel flangeWallProfile / flangeLayout part.wallProfile): the
  // bend over the profile's base only, the wall the profile T thick. On a 6 x 4 sheet with K = 0.5 the folded volume is
  // T x the blank exactly (BA = A (R + T/2) = the bend's area / T), and both equal the closed form
  // T (24 - wb shift - reliefs) + wb A ((R + T)^2 - R^2) / 2 + T x the profile's area (wb the base's width, shift the
  // placement's trim-back: Material Inside ((R + T) - R cos A) / sin A, Material Outside R tan(A/2), Bend Outside 0).
  (function () {
    group('rfOL: Edge Flange profiles (Edit Flange Profile) and Tab and Slot in one body');
    var GA = { '16 ga': [0.0598, 0.06], '11 ga': [0.1196, 0.12] };
    function rfOLline(p, q) { return { t: 'line', x1: p[0], y1: p[1], x2: q[0], y2: q[1] }; }
    function rfOLpoly(pts) { return pts.map(function (p, i) { return rfOLline(p, pts[(i + 1) % pts.length]); }); }
    var t30 = Math.tan(Math.PI / 6);
    // the profiles on the 6 in edge (u along the edge from x = 0, v up the wall from the bend's end)
    var PROF = {
      trapezoid: { entities: rfOLpoly([[0, 0], [6, 0], [6 - 1.5 * t30, 1.5], [1.5 * t30, 1.5]]) },   // both ends slanted 30 degrees
      gusset: { entities: rfOLpoly([[0, 0], [5, 0], [3.5, 1.5], [0, 1.5]]) },                         // 1 in short of the end, a 45 degree gusset end
      stepped: { entities: rfOLpoly([[0, 0], [6, 0], [6, 0.75], [3, 0.75], [3, 1.5], [0, 1.5]]) },    // two heights
      rounded: { entities: [rfOLline([0, 0], [6, 0]), rfOLline([6, 0], [6, 1]), { t: 'arc', cx: 5.5, cy: 1, r: 0.5, a0: 0, a1: 90 }, rfOLline([5.5, 1.5], [0, 1.5]), rfOLline([0, 1.5], [0, 0])] },   // a R.5 corner
      notch: { entities: rfOLpoly([[0, 0], [6, 0], [6, 1.5], [4, 1.5], [4, 1], [2, 1], [2, 1.5], [0, 1.5]]) },   // a 2 x .5 notch in the top
      hole: { entities: rfOLpoly([[0, 0], [6, 0], [6, 1.5], [0, 1.5]]).concat([{ t: 'circle', cx: 3, cy: 0.75, r: 0.25 }]) }   // a hole in the wall
    };
    var AREA = { trapezoid: 1.5 * (6 + 6 - 3 * t30) / 2, gusset: 1.5 * (5 + 3.5) / 2, stepped: 6 * 0.75 + 3 * 0.75, rounded: 9 - 0.25 + Math.PI * 0.25 / 4, notch: 9 - 1, hole: 9 - Math.PI * 0.0625 };
    var WB = { gusset: 5 };   // the base's width (6: the whole edge)
    function rfOLcode(g, pos, ang, name, extra) {
      var s = GA[g];
      return 'p.units("in");\np.sheet(' + s[0] + ', ' + s[1] + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
        'p.flange(1, [[3, ' + s[0] + ', 0]], { angle: ' + ang + ', position: "' + pos + '", relief: "rect", startPoint: [0, ' + s[0] + ', 0], profile: ' + JSON.stringify(PROF[name]) + (extra || '') + ' });\n';
    }
    function rfOLshift(pos, A, R, T) { return pos === 'inside' ? ((R + T) - R * Math.cos(A)) / Math.sin(A) : pos === 'outside' ? R * Math.tan(A / 2) : 0; }
    function rfOLarea(loop) { var a = 0; for (var i = 0; i < loop.length; i++) { var p = loop[i], q = loop[(i + 1) % loop.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
    function rfOLdxf(flat) {
      var L = K.exportDXFFlat(flat, 'in').replace(/\r\n/g, '\n').split('\n'), cnt = {}, ent = null, lay = null;
      for (var i = 0; i + 1 < L.length; i += 2) { var c = L[i].trim(), v = L[i + 1].trim(); if (c === '0') ent = v; else if (c === '8') { lay = v; cnt[ent + '@' + v] = (cnt[ent + '@' + v] || 0) + 1; } else if (c === '42' && ent === 'VERTEX' && lay === 'OUTLINE' && Math.abs(+v) > 1e-9) cnt.bulge = (cnt.bulge || 0) + 1; }
      return cnt;
    }
    // one case: the closed form, T x blank (polygon profiles; arcs and circles: the blank's chords, so to 1e-4), one bend
    // line over the base only, the blank's height = sheet - shift + BA + the profile's height
    function rfOLcase(g, pos, deg, name) {
      var r = build(rfOLcode(g, pos, deg, name));
      noErrors(r);
      var T = GA[g][0], R = GA[g][1], A = deg * Math.PI / 180, sh = rfOLshift(pos, A, R, T), wb = WB[name] || 6, BA = A * (R + T / 2);
      var rec = r.build.flanges[r.model.features[r.model.features.length - 1].id][0];
      // a relief: w wide past the base's end, from d0 inside the trimmed edge line out through the sheet's own edge (sh)
      var rel = (rec.reliefs || []).filter(Boolean).reduce(function (s, x) { return s + x.w * (sh + x.d0); }, 0);
      var V = T * (24 - wb * sh - rel) + wb * A * ((R + T) * (R + T) - R * R) / 2 + T * AREA[name];
      nearRel(r.mp.volume, V, 1e-9, name + ' ' + g + ' ' + pos + ' ' + deg + ': closed form');
      var flat = K.flatPattern(r.model, r.build, r.mesh), blank = flat.loops.reduce(function (s, l) { return s + rfOLarea(l.pts || l); }, 0);
      var curved = name === 'rounded' || name === 'hole';
      near(Math.abs(blank) * T, V, curved ? 2e-4 : 1e-9, name + ' ' + g + ' ' + pos + ' ' + deg + ': T x blank');
      assert(flat.bends.length === 1, flat.bends.length + ' bends');
      var b = flat.bends[0], xs = [b.a[0], b.b[0]].sort(function (p, q) { return p - q; });
      near(xs[1] - xs[0], wb, 1e-9, 'the bend line over the base only');
      near(flat.size[1], 4 - sh + BA + 1.5, 1e-9, name + ' ' + g + ' ' + pos + ' ' + deg + ': blank height');
      return { r: r, flat: flat, V: V };
    }

    test('rfOL: a trapezoid profile (both ends slanted 30 degrees, 1.5 high) on 16 ga and 11 ga, Material Inside / Outside / Bend Outside, 90 / 60 / 120 degrees: volume = the closed form and T x blank to 1e-9, one bend line 6 long', function () {
      var n = 0;
      Object.keys(GA).forEach(function (g) { ['inside', 'outside', 'bendOutside'].forEach(function (pos) { [90, 60, 120].forEach(function (deg) { rfOLcase(g, pos, deg, 'trapezoid'); n++; }); }); });
      return n + ' cases';
    });

    test('rfOL: a flange 1 in short of its edge with a 45 degree gusset end, every gauge / position / angle: the bend line 5 long, a relief at the short end only, closed form and T x blank to 1e-9', function () {
      var n = 0;
      Object.keys(GA).forEach(function (g) { ['inside', 'outside', 'bendOutside'].forEach(function (pos) { [90, 60, 120].forEach(function (deg) {
        var c = rfOLcase(g, pos, deg, 'gusset'), rec = c.r.build.flanges[c.r.model.features[c.r.model.features.length - 1].id][0];
        assert(rec.reliefs && !rec.reliefs[0] !== !rec.reliefs[1], 'one relief: ' + JSON.stringify(rec.reliefs));
        near(rec.len, 5, 1e-12, 'the bend 5 long');
        n++;
      }); }); });
      return n + ' cases';
    });

    test('rfOL: a stepped top, a R.5 corner, a notch and a hole in the wall (16 ga, 90 degrees, three positions): closed forms (true arcs) and T x blank; the DXF keeps the R.5 as an arc (a bulge) and the hole as a CIRCLE', function () {
      var out = [];
      ['stepped', 'rounded', 'notch', 'hole'].forEach(function (name) {
        ['inside', 'outside', 'bendOutside'].forEach(function (pos) { rfOLcase('16 ga', pos, 90, name); });
        var c = rfOLcase('11 ga', 'inside', 90, name), d = rfOLdxf(c.flat);
        if (name === 'rounded') assert(d.bulge === 1 && d['VERTEX@OUTLINE'] === 5, 'the R.5 corner one arc (a bulge) on a 5 vertex outline: ' + JSON.stringify(d));
        if (name === 'hole') assert(d['CIRCLE@HOLES'] === 1, 'the hole a CIRCLE: ' + JSON.stringify(d));
        out.push(name + ' ' + c.r.mp.volume.toFixed(6));
      });
      return out.join(', ');
    });

    test('rfOL: a profiled flange writes its profile in the script and builds the same part back; refusals with the reason: open, crossing itself, base off the edge, two lines on the edge, below the edge, two edges', function () {
      var a = build(rfOLcode('16 ga', 'inside', 90, 'rounded'));
      noErrors(a);
      var sc = K.generateScript(a.model), line = sc.split('\n').filter(function (l) { return /p\.flange\(/.test(l); })[0] || '';
      assert(/profile: \{/.test(line) && /"arc"|t: "arc"|'arc'/.test(line) && /startPoint/.test(line) && !/startOffset/.test(line), 'written: ' + line.slice(0, 200));
      var b = build(sc);
      noErrors(b);
      nearRel(b.mp.volume, a.mp.volume, 1e-12, 'round trip volume');
      var fid = a.model.features[a.model.features.length - 1].id;
      function bad(ents, re, what, extra) {
        var c = build('p.units("in");\np.sheet(0.0598, 0.06, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1, ' + (extra || '[[3, 0.0598, 0]]') + ', { startPoint: [0, 0.0598, 0], profile: ' + JSON.stringify({ entities: ents }) + ' });\n');
        var e = c.errors[fid] || '';
        assert(re.test(e), what + ': ' + e);
      }
      bad([rfOLline([0, 0], [6, 0]), rfOLline([6, 0], [6, 1]), rfOLline([6, 1], [0, 1])], /is open/, 'open');
      bad(rfOLpoly([[0, 0], [6, 0], [0, 1], [6, 1]]), /crosses itself/, 'bow tie');
      bad(rfOLpoly([[-1, 0], [5, 0], [5, 1], [-1, 1]]), /base leaves the edge/, 'past the start');
      bad(rfOLpoly([[1, 0], [7, 0], [7, 1], [1, 1]]), /base leaves the edge/, 'past the end');
      bad(rfOLpoly([[0, 0], [2, 0], [2, 1], [4, 1], [4, 0], [6, 0], [6, 2], [0, 2]]), /one line only/, 'two bases');
      bad(rfOLpoly([[0, 0.5], [6, 0.5], [6, 1], [0, 1]]), /line on the edge/, 'off the edge');
      bad(rfOLpoly([[0, 0], [6, 0], [6, 1], [3, -0.5], [0, 1]]), /below the edge|crosses itself/, 'below');
      var two = build('p.units("in");\np.sheet(0.0598, 0.06, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1, [[3, 0.0598, 0], [6, 0.0598, 2]], { profile: ' + JSON.stringify(PROF.trapezoid) + ' });\n');
      assert(/on one edge/.test(two.errors[fid] || ''), 'two edges: ' + two.errors[fid]);
      return line.trim().slice(0, 120) + '...';
    });

    test('rfOL: Mirror of a gusset-profile flange (lane smmirror\'s rebuild on copied edges) is the same flange built on the mirrored edge (startPoint mapped too), to 1e-9', function () {
      var base = 'p.units("in");\np.sheet(0.0598, 0.06, 0.5);\np.sketch("Top").rect(-3, -4, 6, 4).end().baseFlange();\n';
      var fl = function (z) { return 'p.flange(1, [[0, 0.0598, ' + z + ']], { position: "inside", relief: "rect", startPoint: [-3, 0.0598, ' + z + '], profile: ' + JSON.stringify(PROF.gusset) + ' });\n'; };
      var m = build(base + fl(0) + 'p.mirror("Front", { feature: 3, offset: 2 });\n'), d = build(base + fl(0) + fl(4));
      noErrors(m); noErrors(d);
      nearRel(m.mp.volume, d.mp.volume, 1e-9, 'mirror = both built');
      var fm = K.flatPattern(m.model, m.build, m.mesh), fd = K.flatPattern(d.model, d.build, d.mesh);
      near(fm.size[0], fd.size[0], 1e-9, 'blank x'); near(fm.size[1], fd.size[1], 1e-9, 'blank y');
      assert(fm.bends.length === 2, fm.bends.length + ' bends');
      return 'volume ' + m.mp.volume.toFixed(6);
    });

    test('rfOL: a Hem and an Edge Flange on the top edge of a trapezoid profile (16 ga, Bend Outside): each adds its closed form over the top edge\'s length (6 - 2 x 1.5 tan 30)', function () {
      var T = 0.0598, R = 0.06, top = 6 - 3 * t30, yTop = T + R + 1.5;
      var a = build(rfOLcode('16 ga', 'bendOutside', 90, 'trapezoid'));
      noErrors(a);
      var f2 = build(rfOLcode('16 ga', 'bendOutside', 90, 'trapezoid') + 'p.flange(0.5, [[3, ' + yTop + ', ' + (-(R + T)) + ']], { relief: "none" });\n');
      noErrors(f2);
      nearRel(f2.mp.volume - a.mp.volume, top * (Math.PI / 4 * ((R + T) * (R + T) - R * R) + 0.5 * T), 1e-9, 'second flange: bend + 0.5 wall over the top edge');
      var h = build(rfOLcode('16 ga', 'bendOutside', 90, 'trapezoid') + 'p.hem(0.25, [[3, ' + yTop + ', ' + (-(R + T)) + ']], { hemType: "closed", hemPosition: "outside" });\n');
      noErrors(h);
      assert(h.mp.volume > a.mp.volume, 'the hem adds metal');
      var fl = K.flatPattern(h.model, h.build, h.mesh);
      assert(fl.bends.length === 2, fl.bends.length + ' bends in the flat');
      return 'flange +' + (f2.mp.volume - a.mp.volume).toFixed(6) + ', hem +' + (h.mp.volume - a.mp.volume).toFixed(6);
    });

    test('rfOL: a partial flange at 120 degrees Material Inside: the relief runs out through the sheet\'s edge (it was a closed slot with a sliver of sheet across its end: the trim-back R + T + ... past R + T + rd)', function () {
      var T = 0.0598, R = 0.06, A = 2 * Math.PI / 3, sh = ((R + T) - R * Math.cos(A)) / Math.sin(A);
      var r = build('p.units("in");\np.sheet(0.0598, 0.06, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1.5, [[3, 0.0598, 0]], { angle: 120, position: "inside", relief: "rect", lengthRef: "wall", startOffset: 1, endOffset: 1, startPoint: [0, 0.0598, 0] });\n');
      noErrors(r);
      var rec = r.build.flanges[3][0];
      assert(sh > R + T + rec.reliefs[0].d1, 'the trim-back ' + sh + ' is past R + T + rd');
      // a point of the sheet beside the relief, between the relief and the edge, is gone
      var inside = r.body.pointTester(), tB = rec.reliefs[0].w / 2;
      assert(!inside([1 - tB, T / 2, 0.01]), 'no sheet left across the relief at the edge');
      var flat = K.flatPattern(r.model, r.build, r.mesh), blank = flat.loops.reduce(function (s, l) { return s + rfOLarea(l.pts || l); }, 0);
      near(Math.abs(blank) * T, r.mp.volume, 1e-9, 'T x blank = volume');
      return 'relief d0 ' + rec.reliefs[0].d0.toFixed(4) + ', shift ' + sh.toFixed(4);
    });
  })();

  // (2) Tab and Slot in one body (lane flangeprofile): a folded box (16 ga .06, R .06): front and back walls Material
  // Inside, a lid flange on the front wall's top edge (a profile 4 wide, so the base stays the largest face) folded over
  // to 0.01 short of the back wall's inside face; 2 tabs 1 long on the lid's free edge through slots in the back wall
  // (clearance .01 each way). Closed forms, the flat (tabs on the outline, slots as holes, T x blank = volume), the DXF
  // entity by entity; zero clearance refused. And the flat of a two-body part (a flange's tabs into a lid) placed to 1e-9.
  (function () {
    var T = 0.06, R = 0.06, G = 0.01, H = 4 - 2 * T - R - G;
    function rfOLtsPoly(pts) { return pts.map(function (p, i) { var q = pts[(i + 1) % pts.length]; return { t: 'line', x1: p[0], y1: p[1], x2: q[0], y2: q[1] }; }); }
    var BOX = 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
      'p.flange(2, [[3, 0.06, 0]], { position: "inside", lengthRef: "outer" });\np.flange(2.5, [[3, 0.06, 4]], { position: "inside", lengthRef: "outer" });\n' +
      'p.flange(1, [[3, 2, 0.06]], { position: "inside", relief: "rect", startPoint: [0, 2, 0.06], profile: ' + JSON.stringify({ entities: rfOLtsPoly([[1, 0], [5, 0], [5, H], [1, H]]) }) + ' });\n';
    var EDGE = '[[3, 2, ' + (4 - T - G) + ']]';
    function rfOLtsArea(l) { var a = 0; for (var i = 0; i < l.length; i++) { var p = l[i], q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
    function rfOLtsBox(l) { var xs = l.map(function (p) { return p[0]; }), ys = l.map(function (p) { return p[1]; }); return [Math.min.apply(null, xs), Math.max.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, ys)]; }
    // the DXF's polylines, layer by layer, as lists of [x, y]
    function rfOLtsDxf(flat) {
      var L = K.exportDXFFlat(flat, 'in').replace(/\r\n/g, '\n').split('\n'), out = { OUTLINE: [], HOLES: [], BEND: 0 }, ent = null, cur = null, x = null;
      for (var i = 0; i + 1 < L.length; i += 2) {
        var c = L[i].trim(), v = L[i + 1].trim();
        if (c === '0') { ent = v; if (v === 'POLYLINE' || v === 'SEQEND') cur = null; }
        else if (c === '8') { if (ent === 'POLYLINE') { cur = []; (out[v] = out[v] || []).push(cur); } if (ent === 'LINE' && v === 'BEND') out.BEND++; }
        else if (c === '10' && ent === 'VERTEX' && cur) x = +v;
        else if (c === '20' && ent === 'VERTEX' && cur) cur.push([x, +v]);
      }
      return out;
    }
    // the DXF's points (the blank moved to the origin: its box's low corner at 0, 0) against the flat's, to 1e-6 (the DXF's digits)
    function rfOLtsSame(a, b, what, lo) {
      assert(a.length === b.length, what + ': ' + a.length + ' vs ' + b.length + ' points');
      a.forEach(function (p) { assert(b.some(function (q) { return Math.abs(p[0] - (q[0] - lo[0])) < 1e-6 && Math.abs(p[1] - (q[1] - lo[1])) < 1e-6; }), what + ': DXF point ' + p + ' not in the flat'); });
    }

    test('rfOL: Tab and Slot in one body (a folded box, the lid flange 0.01 from the back wall): 2 tabs through slots with .01 clearance; volume = box - 2 slots + 2 tabs to 1e-9; the flat has the tabs on its outline and the slots as holes (T x blank = volume), the DXF the same points; no clearance refused', function () {
      var a = build(BOX), r = build(BOX + 'p.tabSlot(' + EDGE + ', { count: 2, tabLength: 1, slotLengthOffset: 0.01, slotWidthOffset: 0.01 });\n');
      noErrors(a); noErrors(r);
      assert(r.build.bodies.length === 1, r.build.bodies.length + ' bodies');
      var f = r.model.features[r.model.features.length - 1], lay = K.tabSlotLayout(f, r.model, a.build.bodies), inf = lay.info[0];
      assert(inf.oneBody && Math.abs(inf.gap - G) < 1e-9, 'one body, the gap 0.01: ' + JSON.stringify(inf));
      near(inf.centres[0], 1, 1e-12, 'tab 1 centred in its half of the 4 in edge'); near(inf.centres[1], 3, 1e-12, 'tab 2');
      nearRel(r.mp.volume - a.mp.volume, 2 * (1 * (G + T) * T - 1.02 * (T + 0.02) * T), 1e-9, 'tabs across the gap and through the wall, less the slots');
      var fa = K.flatPattern(a.model, a.build, a.mesh), fl = K.flatPattern(r.model, r.build, r.mesh);
      var blank = fl.loops.reduce(function (s, l) { return s + rfOLtsArea(l.pts || l); }, 0);
      near(Math.abs(blank) * T, r.mp.volume, 1e-9, 'T x blank = volume');
      assert(fl.loops.length === 3 && (fl.loops[0].pts || fl.loops[0]).length === (fa.loops[0].pts || fa.loops[0]).length + 8, 'the outline with 2 tabs (8 more corners) and 2 holes: ' + fl.loops.map(function (l) { return (l.pts || l).length; }));
      assert(fl.bends.length === 3, fl.bends.length + ' bends');
      near(fl.size[1] - fa.size[1], G + T, 1e-9, 'the tabs reach G + T past the lid end in the flat');
      var ob = rfOLtsBox(fl.loops[0].pts || fl.loops[0]), holes = fl.loops.slice(1).map(function (l) { return rfOLtsBox(l.pts || l); }).sort(function (p, q) { return p[0] - q[0]; });
      holes.forEach(function (h, i) {
        near((h[0] + h[1]) / 2, 2 + 2 * i, 1e-9, 'slot ' + (i + 1) + ' under its tab (x)'); near(h[1] - h[0], 1.02, 1e-9, 'slot length'); near(h[3] - h[2], T + 0.02, 1e-9, 'slot width');
      });
      // the back wall's free end is the blank's edge on that side: the slots' centres 2.5 - (2 - T/2) from it
      var endY = Math.abs(ob[2] - holes[0][2]) < Math.abs(ob[3] - holes[0][3]) ? ob[2] : ob[3];
      near(Math.abs((holes[0][2] + holes[0][3]) / 2 - endY), 2.5 - (2 - T / 2), 1e-9, 'the slots 0.53 from the back wall free end');
      var d = rfOLtsDxf(fl);
      assert(d.OUTLINE.length === 1 && d.HOLES.length === 2 && d.BEND === 3, 'DXF: ' + d.OUTLINE.length + ' outline, ' + d.HOLES.length + ' holes, ' + d.BEND + ' bend lines');
      var lo = [ob[0], ob[2]];
      rfOLtsSame(d.OUTLINE[0], fl.loops[0].pts || fl.loops[0], 'outline', lo);
      d.HOLES.forEach(function (h, i) { rfOLtsSame(h, fl.loops[1 + i].pts || fl.loops[1 + i], 'hole ' + (i + 1), lo); });
      var z = build(BOX + 'p.tabSlot(' + EDGE + ', { count: 2, tabLength: 1 });\n');
      assert(/one body: set a slot length offset and a slot width offset/.test(z.errors[f.id] || ''), 'no clearance: ' + z.errors[f.id]);
      return 'volume ' + r.mp.volume.toFixed(6) + ', blank ' + fl.size.map(function (x) { return x.toFixed(4); }).join(' x ');
    });

    test('rfOL: the flat of a two-body Tab and Slot part (a flange with 2 tabs into a lid): the tabs on the sheet outline at x 1..2 and 4..5, 0.25 past the wall, the DXF outline the same points', function () {
      var r = build('p.units("in");\np.sheet(0.1, 0.1, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(2, [[3, 0.1, 0]], { position: "inside", lengthRef: "outer" });\np.sketch("Top", 2).rect(-0.5, -4.5, 7, 5).end().extrude(0.25, { merge: false });\n' +
        'p.tabSlot([[3, 2, 0]], { count: 2, tabLength: 1, slotLengthOffset: 0.01, slotWidthOffset: 0.01 });\n');
      noErrors(r);
      var fl = K.flatPattern(r.model, r.build, r.mesh), out = fl.loops[0].pts || fl.loops[0], b = rfOLtsBox(out);
      var at = function (y) { return out.filter(function (p) { return Math.abs(p[1] - y) < 1e-9; }).map(function (p) { return p[0]; }).sort(function (p, q) { return p - q; }); };
      var far = at(b[2]).length === 4 && at(b[2])[0] > 0.5 ? b[2] : b[3], tip = at(far);   // the wall's end, where the tabs stand out
      assert(tip.length === 4, 'four corners at the tab ends: ' + tip);
      near(tip[0], 1, 1e-9, 'tab 1 from 1'); near(tip[1], 2, 1e-9, 'to 2'); near(tip[2], 4, 1e-9, 'tab 2 from 4'); near(tip[3], 5, 1e-9, 'to 5');
      var root = out.filter(function (p) { return Math.abs(Math.abs(p[1] - far) - 0.25) < 1e-9; });
      assert(root.length >= 4, 'the tabs 0.25 tall in the flat: ' + root.length + ' corners at their roots');
      rfOLtsSame(rfOLtsDxf(fl).OUTLINE[0], out, 'outline', [b[0], b[2]]);
      return 'tabs at ' + tip.join(', ');
    });
  })();
