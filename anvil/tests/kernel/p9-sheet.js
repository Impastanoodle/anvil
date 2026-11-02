  // --- p9-sheet: relief notches in the flat, flange length reference, hem types and positions, shop bend notes,
  // sketch DXF layers (the 2026-10-07 hand tests: 16 ga channel and 8 × 5 mounting plate) ---
  (function () {
    group('p9-sheet: relief notches in the flat, flange length reference, hem types, bend notes, sketch DXF layers');
    var T = 0.0598, R = 0.0598, BA90 = Math.PI / 2 * (R + 0.5 * T);
    var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n';
    function flatOf(code) { var r = build(code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function blankArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? K.signedArea(l) : -Math.abs(K.signedArea(l))); }, 0); }
    function hasVertex(loop, p) { return loop.some(function (q) { return Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6; }); }
    // the bent-channel part: both long edges 1.5 Material Inside, then a 1.0 end flange Material Inside on a short edge
    function channel(relief) {
      return HEAD + 'p.flange(1.5, [[3, ' + T + ', 0], [3, ' + T + ', 4]], { position: "inside" });\np.flange(1, [[0, ' + T + ', 2]], { position: "inside"' + (relief ? ', relief: "' + relief + '"' : '') + ' });';
    }
    test('p9-sheet: a Rectangle relief on the channel end flange reaches the flat: two T × 4.5T notches, blank size unchanged', function () {
      var none = flatOf(channel(null)), rect = flatOf(channel('rect'));
      near(rect.flat.size[0], none.flat.size[0], 1e-9, 'flat width'); near(rect.flat.size[1], none.flat.size[1], 1e-9, 'flat height');
      near(none.flat.size[0], 6 + 1 - 2 * (R + T) + BA90 + (R + T), 1e-9, 'flat width = 6 − (R+T) + BA + 1');
      assert(none.flat.loops.length === 1 && rect.flat.loops.length === 1, 'one loop each');
      // the notch: w = T past each end of the end flange (sketch y in [−2T, −T] and [−4 + T, −4 + 2T]), from d0 = (R+T) + T/2
      // inside the trimmed edge line x = 2T (x up to 4.5T) out past the side flange's edge x = 0: area 4.5T · T each
      near(blankArea(none.flat) - blankArea(rect.flat), 2 * 4.5 * T * T, 1e-9, 'notch area');
      [[4.5 * T, -T], [4.5 * T, -2 * T], [0, -T], [4.5 * T, -4 + T], [4.5 * T, -4 + 2 * T], [0, -4 + T]].forEach(function (p) {
        assert(hasVertex(rect.flat.loops[0], p), 'notch corner (' + p.map(fmt) + ') in the outline');
      });
      var cv = K.dxfLoopCurves(rect.flat.loops[0]);
      assert(cv.segs.length === 12 && cv.segs.every(function (s) { return s.t === 'line'; }), 'outline: 12 lines, got ' + cv.segs.length);
      var ob = flatOf(channel('obround')), cvo = K.dxfLoopCurves(ob.flat.loops[0]);
      var arcs = cvo.segs.filter(function (s) { return s.t === 'arc'; });
      assert(cvo.segs.length === 12 && arcs.length === 2, 'obround: 10 lines + 2 arcs, got ' + cvo.segs.length + ' / ' + arcs.length);
      arcs.forEach(function (a) { near(a.r, T / 2, 1e-6, 'obround end radius T/2'); });
      // the rounded end (a 12-chord half circle of radius T/2) trades T/2 × T of the rectangle for 6·(T/2)²·sin(π/12)
      var obArea = T * (4.5 * T - T / 2) + 6 * (T / 2) * (T / 2) * Math.sin(Math.PI / 12);
      near(blankArea(none.flat) - blankArea(ob.flat), 2 * obArea, 1e-9, 'obround notch area');
      var dxf = K.exportDXFFlat(rect.flat, 'in', { style: 'entities' });
      assert((dxf.match(/\n0\nLINE\n8\nOUTLINE\n/g) || []).length === 12, 'flat DXF: 12 outline LINEs');
      return 'blank ' + fmt(rect.flat.size[0]) + ' × ' + fmt(rect.flat.size[1]) + ', notches ' + (2 * 4.5 * T * T).toFixed(6) + ' in²';
    });
    test('p9-sheet: flange length reference at 90°: Outer Virtual Sharp 1.5 tall outside (= Tangent Bend), Inner Virtual Sharp, straight wall = legacy (L + R + T)', function () {
      function br(opts) { return flatOf(HEAD + 'p.flange(1.5, [[3, ' + T + ', 0]]' + (opts ? ', ' + opts : '') + ');'); }
      var leg = br(null), wall = br('{ lengthRef: "wall" }'), out = br('{ lengthRef: "outer" }'), inn = br('{ lengthRef: "inner" }'), tan = br('{ lengthRef: "tangent" }');
      nearRel(wall.mp.volume, leg.mp.volume, 1e-12, 'wall = legacy volume'); near(wall.flat.size[1], leg.flat.size[1], 1e-12, 'wall = legacy flat');
      nearRel(tan.mp.volume, out.mp.volume, 1e-12, 'tangent = outer at 90°'); near(tan.flat.size[1], out.flat.size[1], 1e-12, 'tangent = outer flat at 90°');
      near(leg.mp.bbox.max[1], 1.5 + R + T, 1e-9, 'legacy height L + R + T');
      near(leg.flat.size[1], 4 + BA90 + 1.5, 1e-9, 'legacy flat');
      near(out.mp.bbox.max[1], 1.5, 1e-9, 'outer virtual sharp: 1.5 outside');
      var BD = K.bendDeduction(Math.PI / 2, R, T, BA90);
      // bend outside: the base's outside dimension runs to the sharp, 4 + R + T
      near(out.flat.size[1], (4 + R + T) + 1.5 - BD, 1e-9, 'outer: A + B − BD');
      near(inn.mp.bbox.max[1], T + 1.5, 1e-9, 'inner virtual sharp: 1.5 above the inside face');
      near(inn.flat.size[1], 4 + BA90 + 1.5 - R, 1e-9, 'inner: straight wall L − R');
      var mi = br('{ position: "inside", lengthRef: "outer" }');
      near(mi.mp.bbox.max[1], 1.5, 1e-9, 'Material Inside + outer: 1.5 tall'); near(mi.mp.bbox.min[2], 0, 1e-9, 'flush with the edge');
      near(mi.flat.size[1], 4 + 1.5 - BD, 1e-9, 'Material Inside + outer: 4 + 1.5 − BD');
      consistentVolume(out); consistentVolume(inn);
      return 'outer flat ' + mi.flat.size[1].toFixed(4) + ' (BD ' + BD.toFixed(4) + ')';
    });
    test('p9-sheet: flange length reference at 45° and 135° (measured along the wall from the virtual sharp, the sharp of 135° beyond the bend)', function () {
      [45, 135].forEach(function (deg) {
        var A = deg * Math.PI / 180, BA = A * (R + 0.5 * T), toSharp = (R + T) * Math.tan(A / 2);
        var o = flatOf(HEAD + 'p.flange(1.5, [[3, ' + T + ', 0]], { angle: ' + deg + ', lengthRef: "outer" });');
        near(o.flat.size[1], 4 + BA + 1.5 - toSharp, 1e-9, deg + '°: flat = base + BA + (L − (R+T)·tan(A/2))');
        // the wall's outer end is L from the sharp on the base's outside face (y = 0): height L·sin A (+ T·cos A for the inside corner)
        near(o.mp.bbox.max[1], 1.5 * Math.sin(A) + Math.max(0, T * Math.cos(A)), 1e-9, deg + '°: height');
        var i = flatOf(HEAD + 'p.flange(1.5, [[3, ' + T + ', 0]], { angle: ' + deg + ', lengthRef: "inner" });');
        near(i.flat.size[1], 4 + BA + 1.5 - R * Math.tan(A / 2), 1e-9, deg + '°: inner flat');
        var w = flatOf(HEAD + 'p.flange(1.5, [[3, ' + T + ', 0]], { angle: ' + deg + ', lengthRef: "wall" });');
        near(w.flat.size[1], 4 + BA + 1.5, 1e-9, deg + '°: straight-wall flat');
        // Tangent Bend: up to 90° the outer virtual sharp; beyond, the tangent to the outer bend surface square to the wall
        var t = flatOf(HEAD + 'p.flange(1.5, [[3, ' + T + ', 0]], { angle: ' + deg + ', lengthRef: "tangent" });');
        near(t.flat.size[1], 4 + BA + 1.5 - (deg <= 90 ? toSharp : R + T), 1e-9, deg + '°: tangent flat');
        if (deg > 90) {
          // hand calc at 135°: the outer face leaves the bend at y = T + R − (R+T)·cos A (the base's outside face y = 0,
          // the bend centre at y = T + R) and runs 1.5 − (R+T) up the wall at sin A: 0.1196 + 0.084570 + 0.976090 = 1.180260
          var hT = T + R - (R + T) * Math.cos(A) + (1.5 - R - T) * Math.sin(A);
          near(hT, 1.180260, 1e-6, 'hand-calculated 135° tangent height');
          near(t.mp.bbox.max[1], hT, 1e-9, '135°: tangent height');
        }
      });
      var r = build(HEAD + 'p.flange(0.1, [[3, ' + T + ', 0]], { angle: 135, lengthRef: "outer" });');
      var err = Object.keys(r.errors).map(function (k) { return r.errors[k]; }).join(' ');
      assert(/longer than/.test(err), 'a length shorter than the bend to the sharp fails the feature: ' + err);
      var thr = ''; try { build(HEAD + 'p.flange(1, [[3, ' + T + ', 0]], { lengthRef: "middle" });'); } catch (e) { thr = e.message; }
      assert(/lengthRef must be one of/.test(thr), 'unknown reference refused: ' + thr);
    });
    test('p9-sheet: Bend from Virtual Sharp: the outer sharp stays on the edge (90° = Material Inside; 45°: flat = 4 + 1.5 − BD)', function () {
      var vs = flatOf(HEAD + 'p.flange(1.5, [[3, ' + T + ', 0]], { position: "virtualSharp", lengthRef: "outer" });');
      var mi = flatOf(HEAD + 'p.flange(1.5, [[3, ' + T + ', 0]], { position: "inside", lengthRef: "outer" });');
      nearRel(vs.mp.volume, mi.mp.volume, 1e-12, '90°: same solid as Material Inside'); near(vs.flat.size[1], mi.flat.size[1], 1e-12, '90°: same flat');
      var A = Math.PI / 4, BA = A * (R + 0.5 * T), BD = K.bendDeduction(A, R, T, BA);
      var v45 = flatOf(HEAD + 'p.flange(1.5, [[3, ' + T + ', 0]], { angle: 45, position: "virtualSharp", lengthRef: "outer" });');
      near(v45.flat.size[1], 4 + 1.5 - BD, 1e-9, '45°: outside dimensions 4 and 1.5 to the sharp');
      near(v45.mp.bbox.min[2], -1.5 * Math.cos(A), 1e-9, '45°: the wall ends 1.5 from the sharp at the original edge');
      consistentVolume(v45);
      var r = build(HEAD + 'p.flange(1, [[3, ' + T + ', 0]], { angle: 180, position: "virtualSharp" });');
      assert(/Virtual Sharp/.test(Object.keys(r.errors).map(function (k) { return r.errors[k]; }).join(' ')), 'no virtual sharp at 180°');
      return '45° flat ' + v45.flat.size[1].toFixed(4);
    });
    test('p9-sheet: hem types and positions on a 1.5 Outer Virtual Sharp wall: height, flat length (180° for open / closed, the swept angle for tear drop / rolled) and volume', function () {
      var WALL = HEAD + 'p.flange(1.5, [[3, ' + T + ', 0]], { position: "inside", lengthRef: "outer" });\n';
      var F0 = 4 + 1.5 - K.bendDeduction(Math.PI / 2, R, T, BA90);
      function polyBend(A, r) { var n = Math.max(4, Math.round(8 * A / (Math.PI / 2))); return n / 2 * ((r + T) * (r + T) - r * r) * Math.sin(A / n); }
      var cases = [
        { opts: '', A: Math.PI, r: T / 4, L: 0.375 - (T / 4 + T) },                          // legacy: open, gap T/2; lane DI2: 0.375 overall from the fold's outer face
        { opts: 'hemType: "open", hemPosition: "outside"', A: Math.PI, r: T / 4, L: 0.375 - (T / 4 + T) },
        { opts: 'hemType: "open", hemPosition: "inside"', A: Math.PI, r: T / 4, L: 0.375 - (T / 4 + T), inside: true },
        { opts: 'hemType: "closed"', A: Math.PI, r: 0.05 / 25.4, L: 0.375 - (0.05 / 25.4 + T) },   // lane DI2: SolidWorks' 0.1 mm closed gap
        { opts: 'hemType: "closed", hemPosition: "inside"', A: Math.PI, r: 0.05 / 25.4, L: 0.375 - (0.05 / 25.4 + T), inside: true },
        { opts: 'hemType: "teardrop", hemAngle: 225', A: 1.25 * Math.PI, r: R },                // tail back down, stopping 0.2 mm short (along it) of the wall (DI2); 270° is refused, as SolidWorks
        { opts: 'hemType: "teardrop", hemPosition: "inside", hemRadius: 0.08, hemAngle: 225', A: 1.25 * Math.PI, r: 0.08, inside: true },
        { opts: 'hemType: "rolled", hemPosition: "inside", hemRadius: 0.1, hemAngle: 225', A: 1.25 * Math.PI, r: 0.1, L: 0, inside: true },
        { opts: 'hemType: "rolled", hemPosition: "outside"', A: 1.5 * Math.PI, r: R, L: 0 }
      ];
      var base = flatOf(WALL), out = [];
      cases.forEach(function (c) {
        if (c.L == null) { var s = Math.sin(c.A), cs = Math.cos(c.A); c.L = Math.min(c.r - c.r * cs, c.r - (c.r + T) * cs) / -s - 0.2 / 25.4; }
        var h = flatOf(WALL + 'p.hem(0.375, [[3, 1.5, ' + T + ']]' + (c.opts ? ', { ' + c.opts + ' }' : '') + ');');
        var lab = c.opts || 'legacy', BA = c.A * (c.r + 0.5 * T), trim = c.inside ? c.r + T : 0;
        near(h.mp.bbox.max[1], c.inside ? 1.5 : 1.5 + c.r + T, 1e-9, lab + ': height');
        near(h.flat.size[1], F0 - trim + BA + c.L, 1e-9, lab + ': flat length');
        assert(h.flat.bends.length === 2 && h.flat.loops.length === 1, lab + ': 2 bends, 1 loop');
        near(h.flat.bends[1].ba, BA, 1e-12, lab + ': hem BA');
        near(polyVol(h.mp) - polyVol(base.mp), (polyBend(c.A, c.r) + T * c.L - trim * T) * 6, 1e-9, lab + ': hem volume');
        consistentVolume(h);
        out.push(fmt(h.flat.size[1]));
      });
      var bad = build(WALL + 'p.hem(0.375, [[3, 1.5, ' + T + ']], { hemType: "teardrop", hemAngle: 150 });');
      assert(/more than 180° and less than 270°/.test(Object.keys(bad.errors).map(function (k) { return bad.errors[k]; }).join(' ')), 'tear drop angle checked');
      var thr = ''; try { build(WALL + 'p.hem(0.375, [[3, 1.5, ' + T + ']], { hemType: "crimp" });'); } catch (e) { thr = e.message; }
      assert(/hemType must be one of/.test(thr), 'unknown hem type refused: ' + thr);
      return 'flats ' + out.join(', ');
    });
    test('p9-sheet: new flange / hem fields round-trip through generateScript; legacy features emit none of them', function () {
      var code = HEAD + 'p.flange(1.5, [[3, ' + T + ', 0]], { position: "virtualSharp", lengthRef: "outer", angle: 60 });\n' +
        'p.flange(1, [[0, ' + T + ', 2]], { lengthRef: "inner" });\n' +
        'p.hem(0.25, [[6, ' + T + ', 2]], { hemType: "closed", hemPosition: "inside" });\n';
      roundTrip(code);
      var script = K.generateScript(build(code).model);
      assert(/position: "virtualSharp", lengthRef: "outer"/.test(script) && /lengthRef: "inner"/.test(script), 'lengthRef emitted: ' + script);
      assert(/hemType: "closed", hemPosition: "inside"/.test(script) && !/p\.hem\([^)]*gap/.test(script), 'closed hem: type and position, no gap');
      assert(K.generateScript(build(script).model) === script, 'fixed point');
      var td = HEAD + 'p.flange(1.5, [[3, ' + T + ', 0]]);\np.hem(0, [[3, ' + (1.5 + R + T) + ', ' + (-R) + ']], { hemType: "rolled", hemRadius: 0.1, hemAngle: 240 });';
      var s2 = K.generateScript(build(td).model);
      assert(/hemType: "rolled", hemRadius: 0\.1, hemAngle: 240/.test(s2), 'rolled fields: ' + s2);
      assert(K.generateScript(build(s2).model) === s2, 'rolled fixed point');
      var legacy = K.generateScript(build(HEAD + 'p.flange(1.5, [[3, ' + T + ', 0]]);\np.hem(0.375, [[3, ' + (1.5 + R + T) + ', ' + (-R) + ']]);').model);
      assert(!/lengthRef|hemType|hemPosition|hemRadius|hemAngle/.test(legacy) && /p\.hem\(0\.375, .*gap: 0\.0299/.test(legacy), 'legacy is silent: ' + legacy);
      return 'ok';
    });
    test('p9-sheet: Kernel.bendNoteText reads like the drawing dimensions (inch .060, mm 1.5) and the flat DXF uses it along the bend line', function () {
      assert(K.bendNoteText({ up: true, angle: 90, R: 0.0598 }, 'in') === 'UP 90° R.060', K.bendNoteText({ up: true, angle: 90, R: 0.0598 }, 'in'));
      assert(K.bendNoteText({ up: true, angle: 180, R: 0.01495 }, 'in') === 'UP 180° R.015', 'hem');
      assert(K.bendNoteText({ up: false, angle: 90.00000001, R: 1.25 }, 'in') === 'DOWN 90° R1.250', 'inch over 1');
      assert(K.bendNoteText({ up: false, angle: 90, R: 1.5 }, 'mm') === 'DOWN 90° R1.5', 'mm');
      assert(K.bendNoteText({ up: true, angle: 37.5, R: 2 }, 'mm') === 'UP 37.5° R2', 'mm whole, half degree');
      assert(K.bendNoteText({ up: true, angle: 90, R: 0.76 }, 'mm') === 'UP 90° R0.76', 'mm keeps the leading zero');
      assert(K.bendNoteText({ up: true, angle: 90, R: 0.0598 }, 'in', { prec: 4 }) === 'UP 90° R.0598', 'prec');
      var r = flatOf(channel('rect'));
      assert(r.flat.bends.every(function (b) { return b.label === 'UP 90° R.060'; }), 'flat labels: ' + r.flat.bends.map(function (b) { return b.label; }).join(' | '));
      var dxf = K.exportDXFFlat(r.flat, 'in');
      assert((dxf.match(/\n1\nUP 90%%d R\.060\n/g) || []).length === 3, 'three shop notes in the DXF');
      // each note is centred on its bend line (horizontal justification 1) and runs along it: the end flange's
      // vertical line gets a 90° note, the side flanges' notes stay horizontal
      var ents = dxf.split('\n0\nTEXT\n').slice(1, 4).map(function (s) { return s.split(/\n0\n(?=[A-Z])/)[0]; });
      assert(ents.every(function (s) { return /\n72\n1\n/.test(s); }), 'centred');
      assert(ents.filter(function (s) { return /\n50\n90\n/.test(s); }).length === 1 && ents.filter(function (s) { return !/\n50\n/.test(s); }).length === 2, 'one vertical note');
      var b = r.flat.bends.filter(function (q) { return Math.abs(q.a[0] - q.b[0]) < 1e-9; })[0], pl = K.bendNotePlace(b, 0.08);
      near(pl.rot, 90, 1e-12, 'rot'); near(pl.p[0], b.a[0] - 0.02, 1e-12, 'a quarter height beside the line'); near(pl.p[1], (b.a[1] + b.b[1]) / 2, 1e-12, 'centred');
      var d2 = K.exportDXFFlat(r.flat, 'in', { version: 'R2000' });
      assert(/\n1\nUP 90%%d R\.060\n50\n90\n7\nStandard\n72\n1\n11\n/.test(d2), 'R2000 TEXT order');
      return 'ok';
    });
    test('p9-sheet: sketch DXF puts nested loops (holes, slots, cutouts) on HOLES; the outer loops and open geometry stay on OUTLINE', function () {
      var s = { entities: [
        { t: 'polyline', pts: [[0, 0], [8, 0], [8, 3], [6, 5], [2, 5], [0, 3]], closed: true },
        { t: 'circle', cx: 1, cy: 1, r: 0.133 },
        { t: 'slot', x1: 1.9, y1: 2, x2: 1.9, y2: 3, w: 0.37 },
        { t: 'poly', cx: 4, cy: 2.5, r: 0.5, n: 6 },
        { t: 'rect', x: 5, y: 1, w: 1, h: 0.5 },
        { t: 'line', x1: 10, y1: 0, x2: 12, y2: 0 },
        { t: 'line', x1: 4, y1: 0, x2: 4, y2: 5, construction: true },
        { t: 'rect', x: 20, y: 0, w: 2, h: 2 }] };
      var ents = sketchDxfLayers(K.exportDXFSketch(s, 'in', { construction: true }));
      function count(layer, type) { return ents.filter(function (e) { return e.layer === layer && (!type || e.t === type); }).length; }
      assert(count('OUTLINE') === 6 + 1 + 4 && count('OUTLINE', 'LINE') === 11, 'OUTLINE: plate, open line, second plate: ' + count('OUTLINE'));
      assert(count('HOLES', 'CIRCLE') === 1 && count('HOLES', 'ARC') === 2 && count('HOLES', 'LINE') === 2 + 6 + 4 && count('HOLES') === 15, 'HOLES: hole, slot, hexagon, cutout: ' + count('HOLES'));
      assert(count('CONSTRUCTION') === 1, 'centerline on CONSTRUCTION');
      // an outline chained from lines and an arc notch (the trimmed R.75 half round) stays OUTLINE; a triangle of lines inside is HOLES
      var c = { entities: [
        { t: 'line', x1: 0, y1: 0, x2: 8, y2: 0 }, { t: 'line', x1: 8, y1: 0, x2: 8, y2: 5 }, { t: 'line', x1: 8, y1: 5, x2: 5, y2: 5 },
        { t: 'arc', cx: 4, cy: 5, r: 1, a0: 180, a1: 360 }, { t: 'line', x1: 3, y1: 5, x2: 0, y2: 5 }, { t: 'line', x1: 0, y1: 5, x2: 0, y2: 0 },
        { t: 'line', x1: 2, y1: 1, x2: 3, y2: 1 }, { t: 'line', x1: 3, y1: 1, x2: 2.5, y2: 2 }, { t: 'line', x1: 2.5, y1: 2, x2: 2, y2: 1 }] };
      var e2 = sketchDxfLayers(K.exportDXFSketch(c, 'in'));
      assert(e2.filter(function (e) { return e.layer === 'OUTLINE'; }).length === 6 && e2.filter(function (e) { return e.layer === 'OUTLINE' && e.t === 'ARC'; }).length === 1, 'chained outline with its arc notch on OUTLINE');
      assert(e2.filter(function (e) { return e.layer === 'HOLES' && e.t === 'LINE'; }).length === 3, 'triangle of lines on HOLES');
      return ents.length + ' + ' + e2.length + ' entities';
    });
    function sketchDxfLayers(dxf) {
      var L = dxf.split('\n'), out = [], cur = null, inE = false;
      for (var i = 0; i + 1 < L.length; i += 2) {
        var c = L[i].trim(), v = L[i + 1].trim();
        if (c === '2' && v === 'ENTITIES') { inE = true; continue; }
        if (!inE) continue;
        if (c === '0') { if (cur) out.push(cur); if (v === 'ENDSEC') break; cur = { t: v }; continue; }
        if (cur && c === '8') cur.layer = v;
      }
      return out;
    }
  })();
  // --- end p9-sheet ---

