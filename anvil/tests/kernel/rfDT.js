  // --- rfDT (2026-10-27, lane DT: sheet metal Vent) --- Vent (a cut of a sketch's boundary less its ribs, spars and
  // fill-in, through the sheet) on a 4 × 4 × 0.06 Base Flange: the acceptance case (Ø2 boundary, two ribs .1 wide
  // through the centre, a Ø1 spar .1 wide) removes T × the exact open area (every circle is broken where the strips
  // cross it, so the kept chords are whole chords of true circles); fill-in, rectangle boundary, sketch on the far face,
  // the flat and its DXF, flow area, errors, round trip.
  (function () {
    group('rfDT: Vent (exact open area, ribs / spars / fill-in, flat and DXF, flow area, errors, round trip)');
    var T = 0.06, H = 0.05;   // H: half the rib width
    var BASE = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(-2, -2, 4, 4).end().baseFlange();\n';
    var SK = 'p.sketch("Top").circle(0, 0, 1).line(-1, 0, 1, 0).line(0, -1, 0, 1).circle(0, 0, 0.5)';
    // the area of a disk of radius r less a centred cross of two strips 2H wide
    function rfDTS(r) { return 2 * (H * Math.sqrt(r * r - H * H) + r * r * Math.asin(H / r)); }
    function rfDTD(r) { return Math.PI * r * r - 2 * rfDTS(r) + 4 * H * H; }
    var OPEN = rfDTD(0.45) + rfDTD(1) - rfDTD(0.55);
    var memo = {};
    function rfDTB(code) { if (!memo[code]) memo[code] = build(code); return memo[code]; }
    function rfDTErr(r) { var ids = Object.keys(r.errors); return ids.length ? r.errors[ids[ids.length - 1]] : ''; }
    function rfDTCut(code) { var r = rfDTB(BASE + code); noErrors(r); return 16 * T - r.mp.volume; }

    test('rfDT: the acceptance case: Ø2 boundary, two ribs .1 wide through the centre, a Ø1 spar .1 wide, radius 0: removed volume = T × (π − ribs − spar + overlaps) exactly; named Vent1; auto groups = picked groups', function () {
      var r = rfDTB(BASE + SK + '.end().vent({ ribWidth: 0.1, sparWidth: 0.1 });\n');
      noErrors(r);
      near(16 * T - r.mp.volume, T * OPEN, 1e-12, 'removed');
      consistentVolume(r);
      var f = r.model.features[r.model.features.length - 1];
      assert(f.type === 'vent' && f.name === 'Vent1', 'name ' + f.name);
      near(rfDTCut(SK + '.end().vent({ boundary: [0], ribs: [1, 2], spars: [3], ribWidth: 0.1, sparWidth: 0.1 });\n'), T * OPEN, 1e-12, 'picked groups');
      var g = K.ventAutoGroups(r.model.features[r.model.features.length - 2]);
      assert(JSON.stringify(g) === JSON.stringify({ boundary: [0], ribs: [1, 2], spars: [3], fill: [] }), 'auto groups ' + JSON.stringify(g));
      return 'open area ' + fmt(OPEN);
    });

    test('rfDT: Flow Area: open area and its percentage of the boundary (π)', function () {
      var r = rfDTB(BASE + SK + '.end().vent({ ribWidth: 0.1, sparWidth: 0.1 });\n'), f = r.model.features[r.model.features.length - 1];
      var b0 = build(BASE).build.body, fa = K.ventFlowArea(f, r.model, { body: b0 });
      near(fa.open, OPEN, 1e-9, 'open'); near(fa.boundary, Math.PI, 1e-9, 'boundary'); near(fa.percent, 100 * OPEN / Math.PI, 1e-7, 'percent');
      return fmt(fa.percent) + ' %';
    });

    test('rfDT: the flat keeps the vent: 8 holes, blank 4 × 4; the DXF (entities) has the vent as 12 ARCs + 16 LINEs on HOLES and reads back clean', function () {
      var r = rfDTB(BASE + SK + '.end().vent({ ribWidth: 0.1, sparWidth: 0.1 });\n'), fl = K.flatPattern(r.model, r.build, r.mesh);
      assert(fl.loops.length === 9, 'loops ' + fl.loops.length);
      near(fl.size[0], 4, 1e-9, 'w'); near(fl.size[1], 4, 1e-9, 'h');
      var dxf = K.exportDXFFlat(fl, 'in', { style: 'entities' }), c = DxfCheck.check(dxf, { units: 'in' });
      assert(c.ok, 'DXF: ' + c.errors.join('; '));
      var ents = dxf.split(/\r?\n/), arcs = 0, lines = 0;
      for (var i = 0; i + 3 < ents.length; i++) if (ents[i].trim() === '0' && (ents[i + 1].trim() === 'ARC' || ents[i + 1].trim() === 'LINE')) {
        var lay = ''; for (var j = i + 2; j < i + 8 && j + 1 < ents.length; j += 2) if (ents[j].trim() === '8') lay = ents[j + 1].trim();
        if (lay === 'HOLES') { if (ents[i + 1].trim() === 'ARC') arcs++; else lines++; }
      }
      assert(arcs === 12 && lines === 16, 'HOLES: ' + arcs + ' ARCs, ' + lines + ' LINEs');
      return arcs + ' arcs';
    });

    test('rfDT: a Ø.6 fill-in boundary keeps the middle: removed = T × (open − (cross-less disk .45 − cross-less disk .3)); fill width .1 grows it to Ø.7', function () {
      var c0 = 'p.sketch("Top").circle(0, 0, 1).line(-1, 0, 1, 0).line(0, -1, 0, 1).circle(0, 0, 0.5).circle(0, 0, 0.3).end()';
      near(rfDTCut(c0 + '.vent({ boundary: [0], ribs: [1, 2], spars: [3], fill: [4], ribWidth: 0.1, sparWidth: 0.1 });\n'), T * (OPEN - rfDTD(0.3)), 1e-12, 'fill 0');
      near(rfDTCut(c0 + '.vent({ boundary: [0], ribs: [1, 2], spars: [3], fill: [4], ribWidth: 0.1, sparWidth: 0.1, fillWidth: 0.1 });\n'), T * (OPEN - rfDTD(0.35)), 1e-12, 'fill .1');
    });

    test('rfDT: a 2 × 1 rectangle boundary with three vertical ribs .1 wide (lines end on the boundary): removed = T × (2 − 3 × .1 × 1)', function () {
      near(rfDTCut('p.sketch("Top").rect(-1, -0.5, 2, 1).line(-0.5, -0.5, -0.5, 0.5).line(0, -0.5, 0, 0.5).line(0.5, -0.5, 0.5, 0.5).end().vent({ ribWidth: 0.1 });\n'), T * (2 - 0.3), 1e-12, 'removed');
    });

    test('rfDT: sketched on the far face (Top plane offset T) it cuts the same; a later flange still unfolds with the vent in the flat', function () {
      var r = build(BASE + 'p.sketch("Top", ' + T + ').circle(0, 0, 1).line(-1, 0, 1, 0).line(0, -1, 0, 1).circle(0, 0, 0.5).end().vent({ ribWidth: 0.1, sparWidth: 0.1 });\n');
      noErrors(r); near(16 * T - r.mp.volume, T * OPEN, 1e-12, 'far face');
      var f = build(BASE + SK + '.end().vent({ ribWidth: 0.1, sparWidth: 0.1 });\np.flange(1, [[0, ' + T + ', 2]], { position: "inside", lengthRef: "outer" });\n');
      noErrors(f);
      var fl = K.flatPattern(f.model, f.build, f.mesh);
      assert(fl.loops.length === 9 && fl.bends.length === 1, 'loops ' + fl.loops.length + ', bends ' + fl.bends.length);
    });

    test('rfDT: errors: no closed boundary, a zero rib width, a sketch off the sheet, a spar wider than its circle', function () {
      var e1 = build(BASE + 'p.sketch("Top").line(-1, 0, 1, 0).end().vent({ ribWidth: 0.1 });\n');
      assert(/closed boundary/.test(rfDTErr(e1)), 'no boundary: ' + rfDTErr(e1));
      var e2 = build(BASE + SK + '.end().vent({ ribWidth: 0, sparWidth: 0.1 });\n');
      assert(/rib width/.test(rfDTErr(e2)), 'rib width: ' + rfDTErr(e2));
      var e3 = build(BASE + 'p.sketch("Top", 1).circle(0, 0, 1).end().vent({});\n');
      assert(/flat face of the sheet/.test(rfDTErr(e3)), 'off the sheet: ' + rfDTErr(e3));
      var e4 = build(BASE + 'p.sketch("Top").circle(0, 0, 1).circle(0, 0, 0.1).end().vent({ sparWidth: 0.3 });\n');
      assert(/does not fit/.test(rfDTErr(e4)), 'spar: ' + rfDTErr(e4));
    });

    test('rfDT: round trip: generateScript writes p.vent({ sketch, boundary?, ribs?, ribWidth, sparWidth, name }) and rebuilds the same volume', function () {
      var r = rfDTB(BASE + SK + '.end().vent({ boundary: [0], ribs: [1, 2], spars: [3], ribWidth: 0.1, sparWidth: 0.1, radius: 0 });\n');
      var s = K.generateScript(r.model);
      assert(/p\.vent\(\{ sketch: f\d+, boundary: \[0\], ribs: \[1,2\], spars: \[3\], ribWidth: 0\.1, sparWidth: 0\.1, name: "Vent1" \}\)/.test(s), s.split('\n').filter(function (l) { return /vent/.test(l); }).join(' | '));
      var r2 = build(s);
      noErrors(r2); near(r2.mp.volume, r.mp.volume, 1e-12, 'same volume');
    });

    // partial Unfold of a part with a Tab folded across a bend (lane DJ's leftover): 16 ga U-channel 6 × 4, 1.5 flanges
    var ST = 0.0598, BA = Math.PI / 2 * (ST + 0.5 * ST), ZB = 2 * ST - BA / 2;
    var U = 'p.units("in");\np.sheet(' + ST + ', ' + ST + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1.5, [[3, ' + ST + ', 0], [3, ' + ST + ', 4]], { position: "inside", lengthRef: "outer" });\n';
    var TABF = 'p.unfold([1, ' + ST + ', 2], null);\np.sketch("Top").rect(6, ' + (-(ZB + 0.25)) + ', 0.5, 0.5).extrude(' + ST + ');\np.fold();\n';
    function rfDTBends() { var f = rfDTB(U + TABF), bs = K.sheetBends(f.model, f.build, f.mesh); return { A: bs.filter(function (x) { return x.at[2] < 1; })[0].at, B: bs.filter(function (x) { return x.at[2] > 1; })[0].at }; }

    test('rfDT: a Tab folded across the front bend (Unfold all, Tab past the side, Fold), then Unfold of the front bend only: the tab\'s part over the bend unfolds with the strip (volume = that Unfold of the plain channel + the tab\'s, exactly; metal across the whole strip), the flat blank keeps the tab', function () {
      var bd = rfDTBends(), u0 = rfDTB(U), fo = rfDTB(U + TABF), tabV = fo.mp.volume - u0.mp.volume;
      var pa = build(U + TABF + 'p.unfold([1, ' + ST + ', 2], [' + JSON.stringify(bd.A) + ']);\n'), p0 = build(U + 'p.unfold([1, ' + ST + ', 2], [' + JSON.stringify(bd.A) + ']);\n');
      var open = rfDTB(U + 'p.unfold([1, ' + ST + ', 2], null);\np.sketch("Top").rect(6, ' + (-(ZB + 0.25)) + ', 0.5, 0.5).extrude(' + ST + ');\n'), open0 = rfDTB(U + 'p.unfold([1, ' + ST + ', 2], null);\n');
      noErrors(pa); noErrors(p0);
      near(pa.mp.volume - p0.mp.volume, open.mp.volume - open0.mp.volume, 1e-12, 'the flat tab (0.5 × 0.5 × T) added');
      near(pa.mp.volume - p0.mp.volume, 0.25 * ST, 1e-12, '0.25·T');
      var tst = pa.build.body.pointTester();
      [ZB - BA / 2 + 0.005, ZB, ZB + BA / 2 - 0.005].forEach(function (z) { assert(tst([6.25, ST / 2, z]), 'metal in the tab over the strip at z = ' + fmt(z)); });
      var fl = K.flatPattern(pa.model, pa.build, pa.mesh), fl0 = K.flatPattern(fo.model, fo.build, fo.mesh);
      assert(fl.loops.length === 1, 'one outline'); near(K.signedArea(fl.loops[0]), K.signedArea(fl0.loops[0]), 1e-9, 'same blank as folded');
      var rf = build(U + TABF + 'p.unfold([1, ' + ST + ', 2], [' + JSON.stringify(bd.A) + ']);\np.fold();\n');
      noErrors(rf); near(rf.mp.volume, fo.mp.volume, 1e-12, 'Fold puts it back');
      return 'tab ' + fmt(tabV);
    });

    test('rfDT: the same part, Unfold of the back bend only: the tab stays folded round the front bend, whole (volume = that Unfold of the plain channel + the folded tab\'s)', function () {
      var bd = rfDTBends(), u0 = rfDTB(U), fo = rfDTB(U + TABF);
      var pb = build(U + TABF + 'p.unfold([1, ' + ST + ', 2], [' + JSON.stringify(bd.B) + ']);\n'), p0 = build(U + 'p.unfold([1, ' + ST + ', 2], [' + JSON.stringify(bd.B) + ']);\n');
      noErrors(pb); noErrors(p0);
      near(pb.mp.volume - p0.mp.volume, fo.mp.volume - u0.mp.volume, 1e-12, 'the folded tab kept');
    });

    // lane DT2: Geometry Properties radius (fillets in every convex corner of the open region), r = .05
    var R5 = 0.05;
    function rfDTSeg(p, q) { return (p[0] * q[1] - q[0] * p[1]) / 2; }
    function rfDTArc(c, rho, t0, sw) { var t1 = t0 + sw; return (rho * rho * sw + rho * (c[0] * (Math.sin(t1) - Math.sin(t0)) - c[1] * (Math.cos(t1) - Math.cos(t0)))) / 2; }
    // the corner piece between the rib edge y = H (open above) and a circle of radius R about 0 (open inside or outside),
    // by Green's theorem: V -> T2 along the circle, T2 -> T1 along the fillet (the side facing V), T1 -> V along the edge
    function rfDTCorner(R, inside) {
      var Rc = inside ? R - R5 : R + R5, xc = Math.sqrt(Rc * Rc - (H + R5) * (H + R5)), C = [xc, H + R5], T1 = [xc, H], T2 = [C[0] * R / Rc, C[1] * R / Rc], V = [Math.sqrt(R * R - H * H), H];
      var aV = Math.atan2(V[1], V[0]), aT2 = Math.atan2(T2[1], T2[0]), f0 = Math.atan2(T2[1] - C[1], T2[0] - C[0]), sw = -Math.PI / 2 - f0;
      if (inside) { while (sw > 0) sw -= 2 * Math.PI; } else { while (sw < 0) sw += 2 * Math.PI; }
      return Math.abs(rfDTArc([0, 0], R, aV, aT2 - aV) + rfDTArc(C, R5, f0, sw) + rfDTSeg(T1, V));
    }
    // per quadrant: the inner hole has the rib-rib corner (90°: r²(1 − π/4)) and two rib / Ø.9 corners, the outer hole
    // two rib / Ø1.1 (open outside) and two rib / Ø2 corners
    var LOST = 4 * (R5 * R5 * (1 - Math.PI / 4) + 2 * rfDTCorner(0.45, true)) + 4 * (2 * rfDTCorner(0.55, false) + 2 * rfDTCorner(1, true));

    test('rfDT2: radius .05 on the acceptance vent: removed = T × (open area − the 28 corner pieces, each by its angle) exactly; the flat DXF has 40 ARCs (12 + 28 fillets) and 16 LINEs on HOLES; round trip keeps radius', function () {
      var r = rfDTB(BASE + SK + '.end().vent({ ribWidth: 0.1, sparWidth: 0.1, radius: ' + R5 + ' });\n');
      noErrors(r);
      // rfFE2: 1e-8 (was 1e-9): the fillet arcs meet the spar circles' chords at their tangent points, and the curve
      // correction's columns there leave a residual that follows the chord count (1.6e-9 at the 12° angular limit,
      // 2.5e-7 at 10°, 1e-14 before the limit): a known limit of the column correction at tangent chord meetings
      // rfFL: 1e-7: csg.js healCracks closes the 4 open edges this vent had; the BSP split order it implies moves the same
      // residual to 7e-8 in² (a rotation of the tool's polygon list alone gives 1e-14 or 7e-8)
      near((16 * T - r.mp.volume) / T, OPEN - LOST, 1e-7, 'open area with fillets');
      consistentVolume(r);
      var fl = K.flatPattern(r.model, r.build, r.mesh), dxf = K.exportDXFFlat(fl, 'in', { style: 'entities' }), c = DxfCheck.check(dxf, { units: 'in' });
      assert(fl.loops.length === 9 && c.ok, 'loops ' + fl.loops.length + ' ' + c.errors.join('; '));
      var ents = dxf.split(/\r?\n/), arcs = 0, lines = 0;
      for (var i = 0; i + 3 < ents.length; i++) if (ents[i].trim() === '0' && (ents[i + 1].trim() === 'ARC' || ents[i + 1].trim() === 'LINE')) {
        var lay = ''; for (var j = i + 2; j < i + 8 && j + 1 < ents.length; j += 2) if (ents[j].trim() === '8') lay = ents[j + 1].trim();
        if (lay === 'HOLES') { if (ents[i + 1].trim() === 'ARC') arcs++; else lines++; }
      }
      assert(arcs === 40 && lines === 16, 'HOLES: ' + arcs + ' ARCs, ' + lines + ' LINEs');
      var s = K.generateScript(r.model);
      assert(/radius: 0\.05/.test(s), 'script keeps the radius');
      var r2 = build(s); noErrors(r2); near(r2.mp.volume, r.mp.volume, 1e-12, 'round trip');
      return 'lost ' + fmt(LOST);
    });

    test('rfDT2: a 2 × 1 rectangle boundary, three ribs .1, radius .05: every hole corner is 90°, removed = T × (1.7 − 16·r²(1 − π/4)); a radius too large for the corner is an error', function () {
      var RS = 'p.sketch("Top").rect(-1, -0.5, 2, 1).line(-0.5, -0.5, -0.5, 0.5).line(0, -0.5, 0, 0.5).line(0.5, -0.5, 0.5, 0.5).end()';
      near(rfDTCut(RS + '.vent({ ribWidth: 0.1, radius: 0.05 });\n'), T * (1.7 - 16 * 0.0025 * (1 - Math.PI / 4)), 1e-12, 'removed');
      var e = build(BASE + SK + '.end().vent({ ribWidth: 0.1, sparWidth: 0.1, radius: 0.6 });\n');
      assert(/does not fit/.test(rfDTErr(e)), 'too large: ' + rfDTErr(e));
    });
  })();
