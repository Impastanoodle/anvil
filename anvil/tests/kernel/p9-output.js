  // ------------------------------------------------------------------ p9-output: shop output (laser DXF, STEP units, ANSI Inch Hole Wizard)
  (function () {
    group('p9-output: laser-ready flat / face DXF (R12 / R2000), DXF read back, STEP units, ANSI Inch Hole Wizard');
    if (typeof DxfCheck === 'undefined') { test('headless/dxf-check.js loaded', function () { fail('DxfCheck is undefined'); }); return; }
    var HW = typeof HoleWizard !== 'undefined' ? HoleWizard : null;
    var INCH_BRACKET = 'p.name("Inch Bracket").units("in");\np.sheet(0.06, 0.06, 0.71);\n' +
      'p.sketch("Top").line(0, 0, 5.75, 0).arc(5.75, -0.25, 0.25, 0, 90).line(6, -0.25, 6, -2.75).arc(5.75, -2.75, 0.25, 270, 360)' +
      '.line(5.75, -3, 0, -3).line(0, -3, 0, 0).end().baseFlange(0.06);\n' +
      'p.hole("Top", 4.5, -1.5, 0.28125, { offset: 0.06 });\np.hole("Top", 3, -0.75, 0.201, { offset: 0.06 });\np.flange(1, [[0, 0.06, 1.5]]);';
    function uBracket() {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Sheet-metal U-bracket'; })[0];
      if (!ex) fail('no "Sheet-metal U-bracket" example');
      var r = build(ex.code);
      noErrors(r);
      return { r: r, flat: K.flatPattern(r.model, r.build, r.mesh) };
    }
    function radii(c) { return c.circles.map(function (q) { return q.r; }).sort(function (a, b) { return a - b; }); }
    function count(c, key) { return c.counts[key] || 0; }

    test('p9-output: U-bracket flat DXF in R12 and R2000, as polylines and as lines / arcs: read back, every loop closed, 6 CIRCLEs of exactly R3 / R4, the slot as 2 arcs + 2 lines, lower-left at 0,0, units header', function () {
      var u = uBracket(), out = [];
      var W = u.flat.bbox.max[0] - u.flat.bbox.min[0], H = u.flat.bbox.max[1] - u.flat.bbox.min[1];
      ['R12', 'R2000'].forEach(function (ver) {
        ['polyline', 'entities'].forEach(function (style) {
          var dxf = K.exportDXFFlat(u.flat, 'mm', { version: ver, style: style }), c = DxfCheck.check(dxf, { units: 'mm' }), tag = ver + '/' + style;
          assert(c.ok, tag + ': ' + c.errors.join('; '));
          assert(c.version === (ver === 'R12' ? 'AC1009' : 'AC1015'), tag + ' version ' + c.version);
          assert(c.insunits === 4 && c.measurement === 1, tag + ' units header');
          assert(JSON.stringify(radii(c)) === '[3,3,3,3,4,4]', tag + ' radii ' + JSON.stringify(radii(c)));
          assert(c.loops.length === 8 && c.loops.every(function (l) { return l.closed; }), tag + ' loops ' + JSON.stringify(c.loops));
          near(c.extents.min[0], 0, 0, tag + ' min x'); near(c.extents.min[1], 0, 0, tag + ' min y');
          near(c.extents.max[0], W, 1e-6, tag + ' blank width'); near(c.extents.max[1], H, 1e-6, tag + ' blank height');
          assert(count(c, 'LINE@BEND') === 2 && count(c, 'TEXT@NOTES') === 3, tag + ' bend lines / notes ' + JSON.stringify(c.counts));
          if (ver === 'R12') assert(dxf.indexOf('LWPOLYLINE') < 0, 'R12 has no LWPOLYLINE');
          else assert(/\n\$HANDSEED\n5\n[0-9A-F]+\n/.test(dxf) && /\nOBJECTS\n/.test(dxf) && /\n\*Model_Space\n/.test(dxf), 'R2000 structure');
          if (style === 'entities') {
            assert(count(c, 'LINE@OUTLINE') === 4 && count(c, 'ARC@HOLES') === 2 && count(c, 'LINE@HOLES') === 2, tag + ' ' + JSON.stringify(c.counts));
            var arcs = DxfCheck.parse(dxf).entities.filter(function (e) { return e.type === 'ARC'; });
            assert(arcs.every(function (a) { return a.r === 4.5 && Math.abs(((a.a1 - a.a0) % 360 + 360) % 360 - 180) < 1e-6; }), 'slot ends: R4.5 half circles');
          } else {
            var polyKey = ver === 'R12' ? 'POLYLINE' : 'LWPOLYLINE';
            assert(count(c, polyKey + '@OUTLINE') === 1 && count(c, polyKey + '@HOLES') === 1, tag + ' ' + JSON.stringify(c.counts));
            var pl = DxfCheck.parse(dxf).entities.filter(function (e) { return e.type === polyKey && e.layer === 'OUTLINE'; })[0];
            assert(pl.pts.length === 4, 'the blank is 4 vertices: ' + pl.pts.length);
          }
          out.push(tag + ' ' + dxf.length);
        });
      });
      var bare = DxfCheck.check(K.exportDXFFlat(u.flat, 'mm', { bendLines: false, notes: false }));
      assert(bare.ok && !count(bare, 'LINE@BEND') && !count(bare, 'TEXT@NOTES'), 'bend lines / notes off: ' + JSON.stringify(bare.counts));
      var kept = DxfCheck.check(K.exportDXFFlat(u.flat, 'mm', { origin: false }));
      near(kept.extents.min[0], u.flat.bbox.min[0], 1e-6, 'origin: false keeps the flat frame');
      return out.join(', ');
    });

    test('p9-output: an inch flat (0.06 sheet, R.25 rounded corners, Ø.28125 and Ø.201 holes, one 1" flange): $INSUNITS 1, $MEASUREMENT 0, inch coordinates, exact hole radii, R.25 ARCs, 7.161164 × 3 blank at 0,0', function () {
      var r = build(INCH_BRACKET);
      noErrors(r);
      assert(r.model.units === 'in', 'inch part');
      var flat = K.flatPattern(r.model, r.build, r.mesh);
      var BA = Math.PI / 2 * (0.06 + 0.71 * 0.06);
      ['R12', 'R2000'].forEach(function (ver) {
        var dxf = K.exportDXFFlat(flat, 'in', { version: ver, style: 'entities' }), c = DxfCheck.check(dxf, { units: 'in' });
        assert(c.ok, ver + ': ' + c.errors.join('; '));
        assert(c.insunits === 1 && c.measurement === 0, ver + ' inch header');
        assert(JSON.stringify(radii(c)) === '[0.1005,0.140625]', ver + ' hole radii ' + JSON.stringify(radii(c)));
        var arcs = DxfCheck.parse(dxf).entities.filter(function (e) { return e.type === 'ARC' && e.layer === 'OUTLINE'; });
        assert(arcs.length === 2 && arcs.every(function (a) { return a.r === 0.25; }), 'two R.25 corner arcs: ' + JSON.stringify(arcs));
        assert(count(c, 'LINE@OUTLINE') === 4, 'four straight outline edges: ' + JSON.stringify(c.counts));
        near(c.extents.min[0], 0, 0, 'min x'); near(c.extents.min[1], 0, 0, 'min y');
        near(c.extents.max[0], 6 + BA + 1, 1e-6, 'blank length 6 + BA + 1');
        near(c.extents.max[1], 3, 1e-9, 'blank width');
        assert(/BLANK 7\.1612 X 3 IN/.test(dxf), 'the sheet note names the blank in inches');
      });
      var poly = DxfCheck.check(K.exportDXFFlat(flat, 'in', { version: 'R2000' }), { units: 'in' });
      assert(poly.ok && count(poly, 'LWPOLYLINE@OUTLINE') === 1, 'R2000 polyline: ' + JSON.stringify(poly.counts));
      return 'blank ' + (6 + BA + 1).toFixed(6) + ' × 3 in';
    });

    test('p9-output: dxfLoopCurves — a 24-chord loop is one circle (exact centre and radius), a hexagon stays six lines, CSG split points and a 3.7e-4 sliver go, a slot is 2 arcs + 2 lines', function () {
      var circ = [], i;
      for (i = 0; i < 24; i++) circ.push([10 + 3 * Math.cos(i * Math.PI / 12), -5 + 3 * Math.sin(i * Math.PI / 12)]);
      var c = K.dxfLoopCurves(circ);
      assert(c && c.circle, 'circle: ' + JSON.stringify(c));
      near(c.circle.r, 3, 1e-12, 'r'); near(c.circle.c[0], 10, 1e-12, 'cx'); near(c.circle.c[1], -5, 1e-12, 'cy');
      var hex = [];
      for (i = 0; i < 6; i++) hex.push([Math.cos(i * Math.PI / 3), Math.sin(i * Math.PI / 3)]);
      var h = K.dxfLoopCurves(hex);
      assert(h.segs && h.segs.length === 6 && h.segs.every(function (s) { return s.t === 'line'; }), 'hexagon: ' + JSON.stringify(h));
      // a square with split points along its edges and a 3.7e-4 sliver at one corner (an unfolded seam)
      var sq = [[0, 0], [5, 0], [10, 0], [10, 3], [10, 10], [0.00037, 10], [0, 10], [0, 4]];
      var q = K.dxfLoopCurves(sq);
      assert(q.segs.length === 4 && q.segs.every(function (s) { return s.t === 'line'; }), 'square: ' + JSON.stringify(q.segs));
      // slot: two half circles of 8 chords and two straight sides
      var slot = [];
      for (i = 0; i <= 8; i++) slot.push([20 + 2 * Math.cos(-Math.PI / 2 + i * Math.PI / 8), 2 * Math.sin(-Math.PI / 2 + i * Math.PI / 8)]);
      for (i = 0; i <= 8; i++) slot.push([2 * Math.cos(Math.PI / 2 + i * Math.PI / 8), 2 * Math.sin(Math.PI / 2 + i * Math.PI / 8)]);
      var s = K.dxfLoopCurves(slot), kinds = s.segs.map(function (x) { return x.t; }).join(',');
      assert(s.segs.length === 4 && (kinds === 'arc,line,arc,line' || kinds === 'line,arc,line,arc'), 'slot: ' + kinds);
      s.segs.forEach(function (x) { if (x.t === 'arc') { near(x.r, 2, 1e-12, 'slot radius'); near(Math.abs(x.sweep), Math.PI, 1e-12, 'half circle'); } });
      return 'ok';
    });

    test('p9-output: face DXF — the top face of a plate with a Ø6 hole and a R5 rounded corner: CIRCLE r 3, ARC r 5 (lines / arcs) or one bulged polyline, closed; origin: true moves it to 0,0', function () {
      var r = build('p.sketch("Top").line(0, 0, 35, 0).arc(35, -5, 5, 0, 90).line(40, -5, 40, -20).line(40, -20, 0, -20).line(0, -20, 0, 0).extrude(4);\np.hole("Top", 10, -10, 6, { offset: 4 });');
      noErrors(r);
      var top = -1;
      r.mesh.faces.forEach(function (f, i) { if (f.normal[1] > 0.99) top = i; });
      var e = K.exportDXFFace(r.mesh, top, 'mm', { style: 'entities', version: 'R2000' }), c = DxfCheck.check(e, { units: 'mm' });
      assert(c.ok, c.errors.join('; '));
      assert(JSON.stringify(radii(c)) === '[3]' && count(c, 'ARC@OUTLINE') === 1 && count(c, 'LINE@OUTLINE') === 4, JSON.stringify(c.counts) + ' ' + JSON.stringify(radii(c)));
      assert(DxfCheck.parse(e).entities.filter(function (x) { return x.type === 'ARC'; })[0].r === 5, 'R5 corner');
      var p = DxfCheck.check(K.exportDXFFace(r.mesh, top, 'mm'), { units: 'mm' });
      assert(p.ok && count(p, 'POLYLINE@OUTLINE') === 1 && p.circles.length === 1, 'R12 polyline: ' + JSON.stringify(p.counts));
      var o = DxfCheck.check(K.exportDXFFace(r.mesh, top, 'mm', { origin: true }));
      near(o.extents.min[0], 0, 0, 'origin x'); near(o.extents.min[1], 0, 0, 'origin y'); near(o.extents.max[0], 40, 1e-6, 'width'); near(o.extents.max[1], 20, 1e-6, 'height');
      return 'ok';
    });

    test('p9-output: DxfCheck finds what a laser import would choke on: an open chain, a zero-length LINE, a duplicate, LWPOLYLINE in R12, no $INSUNITS', function () {
      function dxf(ver, ents, units) {
        return ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', ver].concat(units === false ? [] : ['9', '$INSUNITS', '70', '4'], ['0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'], ents, ['0', 'ENDSEC', '0', 'EOF']).join('\n');
      }
      function line(a, b) { return ['0', 'LINE', '8', 'OUTLINE', '10', a[0], '20', a[1], '30', 0, '11', b[0], '21', b[1], '31', 0]; }
      var sq = [].concat(line([0, 0], [1, 0]), line([1, 0], [1, 1]), line([1, 1], [0, 1]), line([0, 1], [0, 0]));
      assert(DxfCheck.check(dxf('AC1009', sq)).ok, 'a closed square passes');
      var open = DxfCheck.check(dxf('AC1009', [].concat(line([0, 0], [1, 0]), line([1, 0], [1, 1]), line([1, 1], [0, 1]))));
      assert(!open.ok && open.errors.some(function (e) { return /does not close|loose end/.test(e); }), 'open chain: ' + open.errors);
      var zero = DxfCheck.check(dxf('AC1009', sq.concat(line([2, 2], [2, 2]))));
      assert(zero.errors.some(function (e) { return /zero-length/.test(e); }), 'zero length: ' + zero.errors);
      var dup = DxfCheck.check(dxf('AC1009', sq.concat(line([0, 0], [1, 0]))));
      assert(dup.errors.some(function (e) { return /duplicate/.test(e); }), 'duplicate: ' + dup.errors);
      var lw = DxfCheck.check(dxf('AC1009', ['0', 'LWPOLYLINE', '8', 'OUTLINE', '90', 3, '70', 1, '10', 0, '20', 0, '10', 1, '20', 0, '10', 0, '20', 1]));
      assert(lw.errors.some(function (e) { return /LWPOLYLINE in an R12/.test(e); }), 'LWPOLYLINE in R12: ' + lw.errors);
      var nu = DxfCheck.check(dxf('AC1009', sq, false));
      assert(nu.errors.some(function (e) { return /INSUNITS/.test(e); }), 'no units: ' + nu.errors);
      assert(!DxfCheck.check(dxf('AC1009', sq), { units: 'in' }).ok, 'mm header for an inch part is an error');
      return 'ok';
    });

    test('p9-output: STEP of the inch sheet-metal part (Anvil\'s writer): CONVERSION_BASED_UNIT INCH = 25.4 mm, coordinates in inches; read back in mm it is 25.4× the part, in inches the part itself', function () {
      var r = build(INCH_BRACKET);
      noErrors(r);
      var step = Exchange.exportSTEP(r.model, r.build);
      assert(/CONVERSION_BASED_UNIT\('INCH',#\d+\)/.test(step) && /LENGTH_MEASURE_WITH_UNIT\(LENGTH_MEASURE\(25\.4\),#\d+\)/.test(step), 'INCH unit of 25.4 mm');
      assert(/GLOBAL_UNIT_ASSIGNED_CONTEXT\(\(#(\d+),/.test(step), 'unit context');
      function box(res) {
        var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        res.solids.forEach(function (s) { for (var i = 0; i < s.positions.length; i += 3) for (var k = 0; k < 3; k++) { min[k] = Math.min(min[k], s.positions[i + k]); max[k] = Math.max(max[k], s.positions[i + k]); } });
        return { min: min, max: max };
      }
      var mm = box(Exchange.importFile('bracket.step', step, { units: 'mm' })), inch = box(Exchange.importFile('bracket.step', step, { units: 'in' }));
      var b = r.mp.bbox;
      for (var k = 0; k < 3; k++) {
        near(mm.max[k] - mm.min[k], 25.4 * (b.max[k] - b.min[k]), 1e-6, 'mm extent ' + k);
        near(inch.max[k] - inch.min[k], b.max[k] - b.min[k], 1e-9, 'inch extent ' + k);
      }
      var mstep = Exchange.exportSTEP(uBracket().r.model, uBracket().r.build);
      assert(/SI_UNIT\(\.MILLI\.,\.METRE\.\)/.test(mstep) && mstep.indexOf("CONVERSION_BASED_UNIT('INCH'") < 0, 'a mm part is in millimetres');
      return 'mm extents ' + (mm.max[0] - mm.min[0]).toFixed(4) + ' × ' + (mm.max[2] - mm.min[2]).toFixed(4);
    });

    if (!HW) { test('holewizard.js loaded', function () { fail('HoleWizard is undefined'); }); return; }
    // lane FH2 (2026-10-29): the ANSI Inch clearance drills below are SolidWorks 2022's Hole Wizard values (the same
    // drill for a Hole, a Counterbore and a Countersink of a size), read over its API; source:
    // head-tools/sw-reference/sw-holewizard.json (solids_holes.py). They replaced ASME B18.2.8 / B18.3's drills.
    test('p9-output: ANSI Inch tables — 1/4 clearance close F .257 / normal H .266 / loose 9/32 (SolidWorks\' Hole Wizard since lane FH2), 1/4-20 tap drill #7 = .201, 1/4 counterbore Ø.4375 ↧ .25 (B18.3), #10 countersink Ø.385 × 82°', function () {
      var A = HW.ANSI;
      function sp(o) { o.standard = A; return HW.spec(o, 'in'); }
      near(sp({ holeType: 'hole', size: '1/4', fit: 'normal' }).dia, 0.266, 1e-12, '1/4 normal');
      near(sp({ holeType: 'hole', size: '1/4', fit: 'close' }).dia, 0.257, 1e-12, '1/4 close');
      near(sp({ holeType: 'hole', size: '1/4', fit: 'loose' }).dia, 9 / 32, 1e-12, '1/4 loose');
      near(sp({ holeType: 'hole', size: '#10', fit: 'normal' }).dia, 0.201, 1e-12, '#10 normal (#7 drill)');
      var t = sp({ holeType: 'tap', size: '1/4-20 UNC' });
      near(t.dia, 0.201, 1e-12, '1/4-20 tap drill'); assert(t.drillName === '#7' && t.thread.label === '1/4-20 UNC - 2B', t.drillName + ' ' + t.thread.label);
      near(t.thread.pitch, 0.05, 1e-12, 'pitch');
      near(sp({ holeType: 'tap', size: '3/8-16 UNC' }).dia, 0.3125, 1e-12, '3/8-16 tap drill 5/16');
      near(sp({ holeType: 'tap', size: '#10-32 UNF' }).dia, 0.159, 1e-12, '#10-32 tap drill #21');
      var cb = sp({ holeType: 'cbore', size: '1/4', fit: 'normal' });
      near(cb.dia, 0.266, 1e-12, 'cbore thru'); near(cb.cbore.dia, 0.4375, 1e-12, 'cbore Ø'); near(cb.cbore.depth, 0.25, 1e-12, 'cbore depth');
      var cs = sp({ holeType: 'csk', size: '#10', fit: 'normal' });
      near(cs.csk.dia, 0.385, 1e-12, 'csk Ø'); assert(cs.csk.angle === 82, 'csk angle');
      near(sp({ holeType: 'hole', sizeType: 'drill', size: 'F' }).dia, 0.257, 1e-12, 'F drill');
      near(sp({ holeType: 'hole', sizeType: 'drill', size: '#36' }).dia, 0.1065, 1e-12, '#36 drill');
      assert(HW.DRILLS.filter(function (d) { return d.kind === 'number'; }).length === 60 && HW.DRILLS.filter(function (d) { return d.kind === 'letter'; }).length === 26, 'number / letter drills');
      HW.ANSI_SCREWS.forEach(function (s) {
        var c = s.clr.map(HW.drill);
        assert(c[0] > s.d && c[0] < c[1] && c[1] < c[2], s.size + ' clearances ' + c);
        if (s.cb) assert(HW.drill(s.cb.dia) > c[2], s.size + ' counterbore');
        if (s.csk) assert(s.csk > c[2], s.size + ' countersink');
      });
      HW.ANSI_THREADS.forEach(function (th) { assert(th.tap < th.d && th.tap > th.d - 1.3 / th.tpi, th.size + ' tap drill ' + th.tap); });
      // ANSI in a metric part and ISO in an inch part come out the right size
      near(HW.spec({ standard: A, holeType: 'hole', size: '1/4', fit: 'normal' }, 'mm').dia, 0.266 * 25.4, 1e-12, 'ANSI in mm');
      near(HW.spec({ standard: 'ISO', holeType: 'hole', size: 'M8', fit: 'normal' }, 'in').dia, 9 / 25.4, 1e-12, 'ISO in inches');
      return HW.ANSI_SCREWS.length + ' screw sizes, ' + HW.ANSI_THREADS.length + ' threads, ' + HW.DRILLS.length + ' drills';
    });

    test('p9-output: ANSI Inch callouts — "Ø.266 THRU", "Ø.266 THRU" + "⌴ Ø.438 ↧ .250", "Ø.201 ↧ .750" + "1/4-20 UNC - 2B ↧ .500", "Ø.201 THRU" + "⌵ Ø.385 X 82°"', function () {
      function co(o) { return HW.callout(HW.newFeature(o, 'in'), 'in').join(' | '); }
      var a = co({ type: 'hole', size: '1/4', fit: 'normal', end: 'through' }), b = co({ type: 'cbore', size: '1/4', end: 'through' });
      var c = co({ type: 'tap', size: '1/4-20 UNC', depth: 0.75, threadDepth: 0.5 }), d = co({ type: 'csk', size: '#10', end: 'through' });
      assert(a === 'Ø.266 THRU', a); assert(b === 'Ø.266 THRU | ⌴ Ø.438 ↧ .250', b);
      assert(c === 'Ø.201 ↧ .750 | 1/4-20 UNC - 2B ↧ .500', c); assert(d === 'Ø.201 THRU | ⌵ Ø.385 X 82°', d);
      var iso = HW.callout(HW.newFeature({ type: 'tap', size: 'M8', depth: 16, threadDepth: 12 }, 'mm'), 'mm').join(' | ');
      assert(iso === 'Ø6.8 ↧ 16 | M8x1.25 ↧ 12', iso);
      return [a, b, c, d].join(' / ');
    });

    test('p9-output: ANSI Inch holes in an inch block (2 × 2 × 1 in): counterbore and tap volumes equal their formulas; the feature stores standard and size; script round trip rebuilds the same part', function () {
      var BLOCK = 'p.units("in");\np.box(2, 2, 1, { centered: true });\n';
      var code = BLOCK + 'p.holeWizard({ face: "Top", offset: 1, points: [[-0.5, 0]], standard: "ANSI Inch", type: "cbore", size: "1/4", fit: "normal", depth: 0.75 });\n' +
        'p.holeWizard({ face: "Top", offset: 1, points: [[0.5, 0.5], [0.5, -0.5]], type: "tap", size: "1/4-20 UNC", depth: 0.6, threadDepth: 0.5 });\n' +
        'p.holeWizard({ face: "Top", offset: 1, points: [[0, -0.6]], type: "hole", sizeType: "drill", size: "F", end: "through" });';
      var r = build(code);
      noErrors(r);
      var holes = r.model.features.filter(function (f) { return f.type === 'hole'; });
      assert(holes.length === 3 && holes.every(function (f) { return f.standard === HW.ANSI; }), 'standard stored: ' + holes.map(function (f) { return f.standard; }));
      assert(holes[0].size === '1/4' && holes[1].size === '1/4-20 UNC' && holes[2].size === 'F' && holes[2].sizeType === 'drill', 'sizes stored');
      assert(holes[0].name === 'CBORE for 1/4 Socket Head Cap Screw1' && holes[1].name === '1/4-20 UNC Tapped Hole2' && holes[2].name === 'F Drill Hole3', holes.map(function (f) { return f.name; }).join(' / '));
      var Rc = 0.4375 / 2, R = 0.266 / 2, Rt = 0.201 / 2, Rf = 0.257 / 2;
      var cut = Math.PI * Rc * Rc * 0.25 + Math.PI * R * R * (0.75 - 0.25) + 2 * Math.PI * Rt * Rt * 0.6 + Math.PI * Rf * Rf * 1;
      nearRel(4 - r.mp.volume, cut, 1e-9, 'removed volume');
      var script = K.generateScript(r.model);
      assert(/p\.holeWizard\(\{ sketch: f\d+, standard: "ANSI Inch", type: "cbore", size: "1\/4", fit: "normal", depth: 0\.75, name: "CBORE for 1\/4 Socket Head Cap Screw1" \}\)/.test(script), script);
      assert(/sizeType: "drill", size: "F"/.test(script) && /size: "1\/4-20 UNC", fit: "normal", depth: 0\.6, threadDepth: 0\.5/.test(script), 'drill / tap emitted');
      var r2 = build(script);
      noErrors(r2);
      nearRel(r2.mp.volume, r.mp.volume, 1e-12, 'round trip volume');
      assert(K.generateScript(r2.model) === script, 'generator is a fixed point');
      var th = HW.threads(r.model);
      assert(th.length === 2 && th[0].label === '1/4-20 UNC - 2B' && Math.abs(th[0].r - 0.125) < 1e-12 && Math.abs(th[0].drill - 0.201) < 1e-12 && th[0].depth === 0.5, 'cosmetic threads: ' + JSON.stringify(th[0]));
      return 'removed ' + cut.toFixed(6) + ' in³';
    });

    test('p9-output: Hole Wizard standard defaults — no standard: an "M" size is ISO, any other ANSI Inch, none at all follows the part (ANSI Inch in inches, ISO in mm); unknown sizes fail the feature', function () {
      assert(HW.newFeature({ size: 'M6' }, 'in').standard === 'ISO', 'M6');
      assert(HW.newFeature({ size: '#10' }, 'mm').standard === HW.ANSI, '#10');
      assert(HW.newFeature({}, 'in').standard === HW.ANSI && HW.newFeature({}, 'in').size === '1/4', 'inch part default');
      assert(HW.newFeature({}, 'mm').standard === 'ISO' && HW.newFeature({}, 'mm').size === 'M6', 'mm part default');
      near(HW.newFeature({ type: 'tap', size: '1/4-20 UNC' }, 'in').depth, 0.75, 1e-12, 'default tap depth 2·D + .25');
      var threw = '';
      try { build('p.units("in");\np.box(2, 2, 1, { centered: true });\np.holeWizard({ face: "Top", offset: 1, points: [[0, 0]], standard: "ANSI Inch", type: "cbore", size: "#12" });'); } catch (e) { threw = e.message; }
      assert(/No counterbore size for a #12 socket head cap screw/.test(threw), 'no #12 counterbore (no B18.3 socket head cap screw): ' + threw);
      try { build('p.units("in");\np.box(2, 2, 1, { centered: true });\np.holeWizard({ face: "Top", offset: 1, points: [[0, 0]], type: "tap", size: "1/4-21 UNC" });'); threw = ''; } catch (e) { threw = e.message; }
      assert(/Unknown ANSI Inch thread/.test(threw), threw);
      return 'ok';
    });

    // --- hw-ansi-sizes: the ANSI Inch sizes that were missing (#12, 9/16, countersinks for #2, #3, #5 and 7/16 – 1,
    // #12-28 UNF) resolve to their table values, show in the PropertyManager size lists and cut their analytic volume ---
    test('hw-ansi-sizes: #12 and 9/16 clearances (SolidWorks\' since lane FH2), #12-28 UNF tap #14, 82° countersinks #2 / #3 / #5 / #12 / 7/16 – 1 (B18.6.3; 7/8, 1 B18.6.2); no #12 / 9/16 counterbore; existing rows unchanged', function () {
      var A = HW.ANSI;
      function sp(o) { o.standard = A; return HW.spec(o, 'in'); }
      var FITS = ['close', 'normal', 'loose'];
      var CLR = { '#12': [0.221, 0.228, 0.246], '9/16': [37 / 64, 19 / 32, 39 / 64] };
      Object.keys(CLR).forEach(function (size) {
        FITS.forEach(function (fit, i) {
          near(sp({ holeType: 'hole', size: size, fit: fit }).dia, CLR[size][i], 1e-12, size + ' ' + fit);
          near(sp({ holeType: 'csk', size: size, fit: fit }).dia, CLR[size][i], 1e-12, size + ' csk ' + fit + ' thru hole');
        });
        var threw = '';
        try { sp({ holeType: 'cbore', size: size }); } catch (e) { threw = e.message; }
        assert(/No counterbore size for a/.test(threw), size + ' counterbore: ' + threw);
      });
      assert(sp({ holeType: 'hole', size: '#12', fit: 'close' }).drillName === '#2' && sp({ holeType: 'hole', size: '9/16', fit: 'loose' }).drillName === '39/64', 'drill names');
      var CSK = { '#2': 0.172, '#3': 0.199, '#4': 0.225, '#5': 0.252, '#6': 0.279, '#8': 0.332, '#10': 0.385, '#12': 0.438, '1/4': 0.507, '5/16': 0.635, '3/8': 0.762,
        '7/16': 0.812, '1/2': 0.875, '9/16': 1.000, '5/8': 1.125, '3/4': 1.375, '7/8': 1.625, '1': 1.875 };
      Object.keys(CSK).forEach(function (size) {
        var c = sp({ holeType: 'csk', size: size, fit: 'normal' });
        near(c.csk.dia, CSK[size], 1e-12, size + ' csk Ø'); assert(c.csk.angle === 82, size + ' csk angle');
        near(HW.spec({ standard: A, holeType: 'csk', size: size }, 'mm').csk.dia, CSK[size] * 25.4, 1e-9, size + ' csk Ø in mm');
      });
      var TAP = { '#12-24 UNC': ['#16', 0.177, 24], '#12-28 UNF': ['#14', 0.182, 28], '7/16-14 UNC': ['U', 0.368, 14], '7/16-20 UNF': ['25/64', 25 / 64, 20],
        '1/2-13 UNC': ['27/64', 27 / 64, 13], '1/2-20 UNF': ['29/64', 29 / 64, 20], '9/16-12 UNC': ['31/64', 31 / 64, 12], '9/16-18 UNF': ['33/64', 33 / 64, 18],
        '5/8-11 UNC': ['17/32', 17 / 32, 11], '5/8-18 UNF': ['37/64', 37 / 64, 18], '3/4-10 UNC': ['21/32', 21 / 32, 10], '3/4-16 UNF': ['11/16', 11 / 16, 16],
        '7/8-9 UNC': ['49/64', 49 / 64, 9], '7/8-14 UNF': ['13/16', 13 / 16, 14], '1-8 UNC': ['7/8', 7 / 8, 8], '1-12 UNF': ['59/64', 59 / 64, 12] };
      Object.keys(TAP).forEach(function (size) {
        var t = sp({ holeType: 'tap', size: size });
        assert(t.drillName === TAP[size][0] && t.thread.tpi === TAP[size][2] && t.thread.label === size + ' - 2B', size + ': ' + t.drillName + ' ' + t.thread.label);
        near(t.dia, TAP[size][1], 1e-12, size + ' tap drill');
      });
      near(sp({ holeType: 'tap', size: '#12-28 unf' }).thread.major, 0.216, 1e-12, '#12 major');
      // existing rows unchanged (spot checks)
      var r8 = HW.screwRow('#8'), r1 = HW.screwRow('1'), r716 = HW.screwRow('7/16'), r2 = HW.screwRow('#2');
      assert(r8.clr.join() === '#18,#16,#10' && r8.cb.dia === '5/16' && r8.csk === 0.332, '#8 row');
      assert(r1.clr.join() === '1-1/64,1-1/32,1-3/64' && r1.cb.dia === '1-5/8', '1 row');
      assert(r716.clr.join() === '29/64,15/32,31/64' && r716.cb.dia === '23/32' && r2.clr.join() === '#43,#41,#36' && r2.cb.dia === '3/16', '7/16, #2 rows');
      var cb38 = sp({ holeType: 'cbore', size: '3/8', fit: 'close' });
      near(cb38.dia, 0.386, 1e-12, '3/8 cbore close drill W'); near(cb38.cbore.dia, 0.625, 1e-12, '3/8 cbore Ø'); near(cb38.cbore.depth, 0.375, 1e-12, '3/8 cbore depth');
      var cb34 = sp({ holeType: 'cbore', size: '3/4', fit: 'loose' });
      near(cb34.dia, 51 / 64, 1e-12, '3/4 cbore loose = SolidWorks loose'); near(cb34.cbore.dia, 1.1875, 1e-12, '3/4 cbore Ø');
      near(sp({ holeType: 'hole', size: '5/16', fit: 'loose' }).dia, 11 / 32, 1e-12, '5/16 loose');
      near(sp({ holeType: 'tap', size: '5/16-18 UNC' }).dia, 0.257, 1e-12, '5/16-18 tap F');
      // the PropertyManager's Size lists (ui-holewizard.js reads HW.sizeOptions)
      function opts(t) { return HW.sizeOptions(A, t, 'clearance').map(function (o) { return o[0]; }); }
      var all = ['#2', '#3', '#4', '#5', '#6', '#8', '#10', '#12', '1/4', '5/16', '3/8', '7/16', '1/2', '9/16', '5/8', '3/4', '7/8', '1'];
      assert(opts('hole').join() === all.join(), 'hole list ' + opts('hole'));
      assert(opts('csk').join() === all.join(), 'csk list ' + opts('csk'));
      assert(opts('cbore').join() === all.filter(function (s) { return s !== '#12' && s !== '9/16'; }).join(), 'cbore list ' + opts('cbore'));
      var taps = HW.sizeOptions(A, 'tap').map(function (o) { return o[0]; });
      assert(taps.indexOf('#12-28 UNF') === taps.indexOf('#12-24 UNC') + 1 && taps.length === 36, 'tap list ' + taps.length);
      assert(HW.validSize(A, 'csk', 'clearance', '#2') && HW.validSize(A, 'csk', 'clearance', '1') && !HW.validSize(A, 'cbore', 'clearance', '#12'), 'validSize');
      var co = HW.callout(HW.newFeature({ type: 'csk', size: '1', end: 'through' }, 'in'), 'in').join(' | ');
      assert(co === 'Ø1.031 THRU | ⌵ Ø1.875 X 82°', co);
      var co12 = HW.callout(HW.newFeature({ type: 'tap', size: '#12-28 UNF', depth: 0.5, threadDepth: 0.4 }, 'in'), 'in').join(' | ');
      assert(co12 === 'Ø.182 ↧ .500 | #12-28 UNF - 2B ↧ .400', co12);
      return HW.ANSI_SCREWS.length + ' screw sizes, ' + taps.length + ' threads; ' + co;
    });

    test('hw-ansi-sizes: the new sizes cut their analytic volumes in an inch block (8 × 4 × 2 in high): 82° countersinks 1 / 9/16 / #12 / #5 / #3 / #2, #12 clearance, #12-28 UNF and 9/16-12 UNC taps; script round trip', function () {
      var A = HW.ANSI;
      function vol(s, D) {   // one hole of depth D from the face, flat bottom; countersink cone at its own angle
        var R = s.dia / 2;
        if (s.cbore) { var Rc = s.cbore.dia / 2, dc = s.cbore.depth; return Math.PI * Rc * Rc * dc + Math.PI * R * R * (D - dc); }
        if (s.csk) { var Rs = s.csk.dia / 2, h = (Rs - R) / Math.tan(s.csk.angle / 2 * Math.PI / 180); return Math.PI * h / 3 * (Rs * Rs + Rs * R + R * R) + Math.PI * R * R * (D - h); }
        return Math.PI * R * R * D;
      }
      var HOLES = [
        { at: [-2.8, 0], o: { type: 'csk', size: '1', fit: 'normal', depth: 1 } },
        { at: [-0.5, 0], o: { type: 'csk', size: '9/16', fit: 'close', depth: 0.75 } },
        { at: [1, 1], o: { type: 'csk', size: '#12', fit: 'loose', end: 'through' } },
        { at: [1, -1], o: { type: 'hole', size: '#12', fit: 'normal', end: 'through' } },
        { at: [2.2, 1], o: { type: 'tap', size: '#12-28 UNF', depth: 0.5, threadDepth: 0.4 } },
        { at: [2.2, -1], o: { type: 'tap', size: '9/16-12 UNC', depth: 0.9, threadDepth: 0.75 } },
        { at: [3.4, 0], o: { type: 'csk', size: '#5', fit: 'normal', depth: 0.4 } },
        { at: [3.4, 1.2], o: { type: 'csk', size: '#2', fit: 'close', depth: 0.3 } },
        { at: [3.4, -1.2], o: { type: 'csk', size: '#3', fit: 'loose', depth: 0.3 } }
      ];
      var code = 'p.units("in");\np.box(8, 4, 2, { centered: true });\n', cut = 0;
      HOLES.forEach(function (h) {
        var o = Object.assign({ face: 'Top', offset: 2, points: [h.at], standard: A }, h.o);
        code += 'p.holeWizard(' + JSON.stringify(o) + ');\n';
        var f = HW.newFeature(o, 'in'), s = HW.spec(f, 'in');
        cut += vol(s, f.end === 'through' ? 2 : f.depth);
      });
      var r = build(code);
      noErrors(r);
      var holes = r.model.features.filter(function (f) { return f.type === 'hole'; });
      assert(holes.length === HOLES.length && holes[0].name === 'CSK for 1 Flat Head Screw1' && holes[4].name === '#12-28 UNF Tapped Hole5', holes.map(function (f) { return f.name; }).join(' / '));
      nearRel(64 - r.mp.volume, cut, 1e-9, 'removed volume');
      var th = HW.threads(r.model);
      assert(th.length === 2 && Math.abs(th[0].r - 0.108) < 1e-12 && th[0].label === '#12-28 UNF - 2B' && Math.abs(th[1].r - 0.28125) < 1e-12, 'cosmetic threads');
      var script = K.generateScript(r.model), r2 = build(script);
      noErrors(r2);
      nearRel(r2.mp.volume, r.mp.volume, 1e-12, 'round trip volume');
      return 'removed ' + cut.toFixed(6) + ' in³ by ' + HOLES.length + ' holes';
    });
  })();
  // --- end p9-output ---

