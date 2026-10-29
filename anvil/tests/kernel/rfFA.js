  // --- rfFA (2026-10-29, lane FA: Curves) --- Helix and Spiral, Projected Curve, Composite Curve, Curve Through XYZ
  // Points and Curve Through Reference Points: reference curve features (no body) whose record lands in
  // build.planes[id] ({ refgeo: 'curve', pts, edges, runs, length, t0, t1 }); a curve is a Sweep path. Exact checks:
  // the helix lies on its cylinder and its length is n·√((2πr)² + P²); a circle swept along it has the volume
  // π r² L (the sweep path's chords are as long as the true arcs and the circle is area-true); projections lie on
  // their faces exactly; script and JSON round trips. OpenCascade's exact helix is checked in occt-tests.html.
  (function () {
    group('rfFA: Curves (helix / spiral, projected, composite, through points; sweep paths)');
    function rfFACurve(r, name) { var f = r.model.features.filter(function (x) { return x.name === name; })[0]; assert(f, 'feature ' + name); var g = r.build.planes[f.id]; assert(g && g.refgeo === 'curve', 'curve record for ' + name + ': ' + JSON.stringify(r.errors)); return g; }
    function rfFARound(r) {
      var s = K.generateScript(r.model), m2 = K.newModel('rt');
      K.runScript(m2, s);
      var b2 = K.rebuild(m2);
      assert(!Object.keys(b2.errors).length, 'round trip errors ' + JSON.stringify(b2.errors));
      assert(K.generateScript(m2) === s, 'the regenerated script is the same');
      var b3 = K.rebuild(JSON.parse(JSON.stringify(r.model)));
      assert(!Object.keys(b3.errors).length, 'JSON round trip errors ' + JSON.stringify(b3.errors));
      return { script: s, build: b2 };
    }
    var SPRING = 'p.units("in");\nvar s = p.sketch("Top").circle(0, 0, 0.5).id();\nvar h = p.helix(s, { pitch: 0.25, revolutions: 4 });\nvar pr = p.sketch("Front").circle(0.5, 0, 0.05).id();\np.sweep({ profile: pr, path: h });';

    test('rfFA: a spring (Ø0.1 circle swept along a helix R 0.5, pitch 0.25, 4 revolutions) has the exact volume π·0.05²·4·√(π² + 0.25²)', function () {
      var r = build(SPRING), L = 4 * Math.hypot(Math.PI, 0.25);
      noErrors(r);
      var g = rfFACurve(r, 'Helix/Spiral1');
      nearRel(g.length, L, 1e-12, 'helix length');
      nearRel(r.mp.volume, Math.PI * 0.0025 * L, 1e-9, 'spring volume');
      assert(r.model.features.filter(function (f) { return f.type === 'sweep'; })[0].name === 'Sweep1', 'Sweep1');
      g.pts.forEach(function (p, i) { near(Math.hypot(p[0], p[2]), 0.5, 1e-12, 'radius at sample ' + i); });
      nearVec(g.pts[0], [0.5, 0, 0], 1e-12, 'start at the start angle 0 (sketch x)');
      nearVec(g.pts[g.pts.length - 1], [0.5, 1, 0], 1e-9, 'end after 4 turns, 1 in up (Top normal = +Y)');
      return 'V ' + fmt(r.mp.volume) + ', L ' + fmt(L);
    });

    test('rfFA: helix definitions (Height and Revolution, Height and Pitch), start angle, clockwise, reverse and taper', function () {
      var base = 'var s = p.sketch("Front").circle(0, 0, 10).id();\n';
      var a = build(base + 'p.helix(s, { defineBy: "heightRev", height: 30, revolutions: 3 });'), ga = rfFACurve(a, 'Helix/Spiral1');
      nearRel(ga.length, 3 * Math.hypot(20 * Math.PI, 10), 1e-12, 'height and revolution: pitch 10');
      var b = build(base + 'p.helix(s, { defineBy: "heightPitch", height: 25, pitch: 10 });'), gb = rfFACurve(b, 'Helix/Spiral1');
      nearRel(gb.length, 2.5 * Math.hypot(20 * Math.PI, 10), 1e-12, 'height and pitch: 2.5 revolutions');
      nearVec(gb.pts[gb.pts.length - 1], [-10, 0, 25], 1e-9, 'half a turn on: the far side');
      var c = build(base + 'p.helix(s, { pitch: 8, revolutions: 0.25, startAngle: 90 });'), gc = rfFACurve(c, 'Helix/Spiral1');
      nearVec(gc.pts[0], [0, 10, 0], 1e-9, 'start angle 90: on the sketch y');
      nearVec(gc.pts[gc.pts.length - 1], [-10, 0, 2], 1e-9, 'counterclockwise about +Z (right hand)');
      var d = build(base + 'p.helix(s, { pitch: 8, revolutions: 0.25, clockwise: true, reverse: true });'), gd = rfFACurve(d, 'Helix/Spiral1');
      nearVec(gd.pts[gd.pts.length - 1], [0, 10, -2], 1e-9, 'reversed (-Z) and clockwise: counterclockwise seen from +Z');
      var e = build(base + 'p.helix(s, { pitch: 10, revolutions: 2, taper: 10 });'), ge = rfFACurve(e, 'Helix/Spiral1');
      var pe = ge.pts[ge.pts.length - 1];
      near(Math.hypot(pe[0], pe[1]), 10 - 20 * Math.tan(10 * Math.PI / 180), 1e-9, 'tapered in: radius at the top');
      var e2 = build(base + 'p.helix(s, { pitch: 10, revolutions: 2, taper: 10, taperOut: true });'), pe2 = rfFACurve(e2, 'Helix/Spiral1').pts.slice(-1)[0];
      near(Math.hypot(pe2[0], pe2[1]), 10 + 20 * Math.tan(10 * Math.PI / 180), 1e-9, 'tapered out');
      var bad = build(base + 'p.helix(s, { pitch: 10, revolutions: 10, taper: 30 });');
      assert(/taper closes/.test(JSON.stringify(bad.errors)), 'a taper past the axis is an error: ' + JSON.stringify(bad.errors));
      var none = build('var s = p.sketch("Front").rect(0, 0, 5, 5).id();\np.helix(s, { pitch: 1, revolutions: 2 });');
      assert(/no circle/.test(JSON.stringify(none.errors)), 'no circle: ' + JSON.stringify(none.errors));
      return 'taper r ' + fmt(Math.hypot(pe[0], pe[1]));
    });

    test('rfFA: Spiral in the sketch plane (outward; Reverse direction: inward), length by Simpson within 1e-9 of the closed form', function () {
      var r = build('var s = p.sketch("Front").circle(0, 0, 10).id();\np.helix(s, { defineBy: "spiral", pitch: 5, revolutions: 2 });'), g = rfFACurve(r, 'Helix/Spiral1');
      g.pts.forEach(function (p) { near(p[2], 0, 1e-12, 'in the sketch plane'); });
      nearVec(g.pts[g.pts.length - 1], [20, 0, 0], 1e-9, 'r = 10 + 2·5');
      // archimedean spiral r = a + bθ: L = ∫ √(r² + b²) dθ
      var b = 5 / (2 * Math.PI), F = function (t) { var rr = 10 + b * t; return (rr * Math.sqrt(rr * rr + b * b) + b * b * Math.log(rr + Math.sqrt(rr * rr + b * b))) / (2 * b); };
      nearRel(g.length, F(4 * Math.PI) - F(0), 1e-9, 'spiral length');
      var inw = build('var s = p.sketch("Front").circle(0, 0, 10).id();\np.helix(s, { defineBy: "spiral", pitch: 3, revolutions: 2, reverse: true });');
      nearVec(rfFACurve(inw, 'Helix/Spiral1').pts.slice(-1)[0], [4, 0, 0], 1e-9, 'inward');
      var thru = build('var s = p.sketch("Front").circle(0, 0, 10).id();\np.helix(s, { defineBy: "spiral", pitch: 6, revolutions: 2, reverse: true });');
      assert(/centre/.test(JSON.stringify(thru.errors)), 'a spiral through its centre is an error');
      return 'L ' + fmt(g.length);
    });

    test('rfFA: Projected Curve, sketch on faces: a line projected onto a cylinder lies on it exactly (and splits where it leaves the face)', function () {
      var r = build('p.sketch("Front").circle(0, 0, 10).end().extrude(40);\nvar a = p.sketch("Top").line(-20, -5, 20, -30).id();\np.projectedCurve(a, { faces: [[0, 10, 20]] });');
      noErrors(r);
      var g = rfFACurve(r, 'Curve1');
      g.pts.forEach(function (p, i) { near(Math.hypot(p[0], p[1]), 10, 1e-9, 'on the cylinder at ' + i); assert(p[1] >= -1e-9, 'on the +Y side'); near(p[2], 5 + (p[0] + 20) / 40 * 25, 1e-9, 'under the line'); });
      nearVec(g.pts[0], [-10, 0, 11.25], 1e-9, 'enters at x = -10');
      var rev = build('p.sketch("Front").circle(0, 0, 10).end().extrude(40);\nvar a = p.sketch("Top").line(-20, -5, 20, -30).id();\np.projectedCurve(a, { faces: [[0, -10, 20]], reverse: true });');
      noErrors(rev);
      rfFACurve(rev, 'Curve1').pts.forEach(function (p) { assert(p[1] <= 1e-9, 'reverse: the -Y side'); });
      var plane = build('p.sketch("Front").rect(-20, -20, 40, 40).end().extrude(5);\nvar a = p.sketch("Front", 20).circle(0, 0, 8).id();\np.projectedCurve(a, { faces: [[0, 0, 5]], reverse: true });');
      noErrors(plane);
      var gp = rfFACurve(plane, 'Curve1');
      assert(gp.closed, 'a projected circle is closed');
      gp.pts.forEach(function (p) { near(p[2], 5, 1e-12, 'on the top face'); });
      var miss = build('p.sketch("Front").circle(0, 0, 10).end().extrude(40);\nvar a = p.sketch("Top").line(30, -5, 40, -30).id();\np.projectedCurve(a, { faces: [[0, 10, 20]] });');
      assert(/does not project/.test(JSON.stringify(miss.errors)), 'a sketch off the face is an error: ' + JSON.stringify(miss.errors));
      return g.pts.length + ' points';
    });

    test('rfFA: Projected Curve, sketch on sketch: two lines give their exact 3D line; a line against an arc is exact on the arc', function () {
      var r = build('var a = p.sketch("Front").line(0, 0, 10, 5).id();\nvar b = p.sketch("Top").line(-5, 5, 15, -15).id();\np.projectedCurve(a, { mode: "sketchOnSketch", sketch2: b });');
      noErrors(r);
      var g = rfFACurve(r, 'Curve1');
      g.pts.forEach(function (p) { near(p[1], p[0] / 2, 1e-12, 'y = x/2'); near(p[2], p[0], 1e-12, 'z = x'); });
      nearRel(g.length, 15, 1e-12, 'length √(10² + 5² + 10²)');
      var c = build('var a = p.sketch("Front").line(-5, 2, 5, 8).id();\nvar b = p.sketch("Top").arc(0, 0, 10, 180, 360).id();\np.projectedCurve(a, { mode: "sketchOnSketch", sketch2: b });');
      noErrors(c);
      rfFACurve(c, 'Curve1').pts.forEach(function (p) { near(Math.hypot(p[0], p[2]), 10, 1e-9, 'on the arc\'s cylinder'); });
      var par = build('var a = p.sketch("Front").line(0, 0, 10, 5).id();\nvar b = p.sketch("Front", 5).line(0, 0, 10, 0).id();\np.projectedCurve(a, { mode: "sketchOnSketch", sketch2: b });');
      assert(/parallel/.test(JSON.stringify(par.errors)), 'parallel sketches: ' + JSON.stringify(par.errors));
      return 'L ' + fmt(g.length);
    });

    test('rfFA: Composite Curve joins sketch lines / arcs and model edges in any order (exact pieces), refuses a gap, and is a sweep path', function () {
      var r = build('var a = p.sketch("Right").line(0, 0, 0, 20).arc(5, 20, 5, 90, 180).line(5, 25, 40, 25).id();\nvar c = p.compositeCurve([{ sketch: a, entity: 2 }, { sketch: a, entity: 0 }, { sketch: a, entity: 1 }]);\nvar pr = p.sketch("Top").circle(0, 0, 1.5).id();\np.sweep({ profile: pr, path: c });');
      noErrors(r);
      var g = rfFACurve(r, 'CompCurve1');
      assert(g.edges.map(function (e) { return e.t; }).join() === 'line,arc,line', 'pieces: ' + g.edges.map(function (e) { return e.t; }).join());
      nearRel(r.mp.volume, Math.PI * 2.25 * (55 + 2.5 * Math.PI), 2e-3, 'swept tube (faceted arc)');
      var gap = build('var a = p.sketch("Front").line(0, 0, 10, 0).line(10, 1, 0, 10).id();\np.compositeCurve([{ sketch: a, entity: 0 }, { sketch: a, entity: 1 }]);');
      assert(/gap of 1/.test(JSON.stringify(gap.errors)), 'gap: ' + JSON.stringify(gap.errors));
      var e = build('p.sketch("Front").rect(0, 0, 40, 30).end().extrude(10);\np.compositeCurve([{ edge: [20, 0, 10] }, { edge: [40, 15, 10] }, { edge: [20, 30, 10] }]);');
      noErrors(e);
      var ge = rfFACurve(e, 'CompCurve1');
      nearRel(ge.length, 110, 1e-12, 'three top edges (40 + 30 + 40)');
      var h = build('p.sketch("Front").rect(-20, -20, 40, 40).end().extrude(5);\np.sketch("Front").circle(0, 0, 6).end().cut("through");\np.compositeCurve([{ edge: [6, 0, 5] }]);');
      noErrors(h);
      var gh = rfFACurve(h, 'CompCurve1');
      assert(gh.closed && gh.edges[0].t === 'circle', 'a hole edge is a closed circle: ' + gh.edges[0].t);
      near(gh.edges[0].r, 6, 1e-9, 'circle radius');
      return 'L ' + fmt(g.length);
    });

    test('rfFA: Curve Through XYZ Points (open and closed) and Through Reference Points pass through every point; .sldcrv text parses with units', function () {
      var P = [[0, 0, 0], [10, 0, 0], [20, 5, 0], [30, 5, 10]];
      var r = build('p.xyzCurve(' + JSON.stringify(P) + ');\np.xyzCurve([[0, 0, 0], [10, 0, 0], [10, 10, 5], [0, 10, 0]], { closed: true });'), g = rfFACurve(r, 'Curve1'), g2 = rfFACurve(r, 'Curve2');
      noErrors(r);
      P.forEach(function (q) { assert(g.pts.some(function (p) { return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-12; }), 'passes through ' + q); });
      assert(g2.closed && Math.hypot.apply(null, K.vec.sub(g2.pts[0], g2.pts[g2.pts.length - 1])) < 1e-12, 'closed');
      var rp = build('var a = p.sketch("Front").point(0, 0).point(10, 5).point(20, 0).id();\np.refPointCurve([{ sketch: a, entity: 0 }, { sketch: a, entity: 1 }, { sketch: a, entity: 2 }]);');
      noErrors(rp);
      var gp = rfFACurve(rp, 'Curve1');
      assert(gp.pts.some(function (p) { return Math.hypot(p[0] - 10, p[1] - 5) < 1e-12; }), 'through the middle point');
      var pts = K.parseCurveFile('# a curve\n1in 2in 0in\n10 20 30mm\n0.5, 0.25, 0', 'in');
      nearVec(pts[0], [1, 2, 0], 1e-12, 'inches'); nearVec(pts[1], [10, 20, 30 / 25.4], 1e-12, 'mixed units'); nearVec(pts[2], [0.5, 0.25, 0], 1e-12, 'commas');
      var back = K.parseCurveFile(K.formatCurveFile(P, 'mm'), 'mm');
      assert(JSON.stringify(back) === JSON.stringify(P), 'Save → Browse round trip');
      var bad = build('p.xyzCurve([[0, 0, 0]]);');
      assert(/at least two/.test(JSON.stringify(bad.errors)), 'one point is an error');
      return g.pts.length + ' samples';
    });

    test('rfFA: curves are reference geometry: no body, not a pattern source, names Helix/Spiral1 / Curve1 / CompCurve1; script, JSON and the worker pack round-trip', function () {
      var r = build(SPRING + '\nvar x = p.xyzCurve([[0, 2, 0], [1, 2, 1]]);\nvar a = p.sketch("Front").line(0, 0, 1, 0).line(1, 0, 1, 1).id();\np.compositeCurve([{ sketch: a, entity: 0 }, { sketch: a, entity: 1 }]);');
      noErrors(r);
      assert(r.build.bodies.length === 1, 'one body (the spring)');
      var rt = rfFARound(r);
      assert(/p\.helix\(f1, \{ defineBy: "pitchRev"/.test(rt.script) && /p\.xyzCurve\(/.test(rt.script) && /p\.compositeCurve\(\[\{ sketch: f\d+, entity: 0 \}/.test(rt.script), 'script:\n' + rt.script);
      var k1 = K.massProps(K.meshFromBody(rt.build.body)).volume;
      nearRel(k1, r.mp.volume, 1e-12, 'round-trip volume');
      var pk = K.packBuild(r.build, r.model);
      assert(pk.planes && Object.keys(pk.planes).filter(function (id) { return pk.planes[id] && pk.planes[id].refgeo === 'curve'; }).length === 3, 'the worker pack carries the three curve records');
      var p = new K.Builder(K.newModel('t')), s = p.sketch('Front').circle(0, 0, 5).id();
      p.sketch('Front').rect(0, 0, 2, 2).end().extrude(3);
      var solid = p.lastSolidId;
      p.helix(s, { pitch: 1, revolutions: 1 });
      assert(p.lastSolidId === solid, 'a curve is not the pattern source');
      assert(K.isCurveFeature('helix') && !K.isCurveFeature('sweep'), 'isCurveFeature');
      return 'ok';
    });
  })();
