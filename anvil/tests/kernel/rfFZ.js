  // --- rfFZ (2026-10-30, lane FZ: parts OpenCascade could not build or built wrong, that Anvil's engine builds) ---
  // The same scripts are rows of tests/occt-tests.html ("rfFZ"), where OpenCascade must match the closed form to 1e-9;
  // here Anvil's own engine is held to the same closed forms (its bend facets and overlapping-circle corrections leave
  // the tolerances noted on each test).
  var rfFZ = (function () {
    var PI = Math.PI, T = 0.0598, R = 0.0598;
    function lens(r, d) { return 2 * r * r * Math.acos(d / (2 * r)) - (d / 2) * Math.sqrt(4 * r * r - d * d); }
    var r2 = 0.75 - Math.tan(3 * PI / 180);
    return {
      // rfFT pin 2 / corpus M26 (smallest): an L bracket unfolded, a Ø0.5 hole cut across the bend, folded back
      PIN2: 'p.units("in"); p.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1.5, [[3, 0.0598, 0]], { position: "inside", lengthRef: "outer" });\np.unfold([3, 0.0598, 2], null);\np.sketch("Top", 0.0598).circle(3, 0.05, 0.25).end().cut("through", { reverse: true });\np.fold(null);\n',
      // K = 0.5: the bend keeps the flat's volume, so the hole takes π r² T wherever it lies
      pin2: 6 * (T * (4 - R - T + 1.5 - R - T) + PI / 4 * ((R + T) * (R + T) - R * R)) - PI * 0.0625 * T,
      // corpus S20 (the boss alone): Ø1.5 × 1 with 3° draft, a cone frustum
      S20: 'p.units("in"); p.sketch("Top").circle(0, 0, 0.75).end().extrude(1, { draft: 3 });',
      s20: PI / 3 * (0.5625 + 0.75 * r2 + r2 * r2),
      // Ø1 bosses at 0.8 pitch (four, overlapping) and Ø0.5 holes at 0.4 pitch (five, overlapping) on a 4 × 3 × .25 plate
      PAT: 'p.units("in");\np.sketch("Top").rect(-1, -1.5, 4, 3).end().extrude(0.25);\np.sketch("Top", 0.25).circle(0, 0, 0.5).end().extrude(0.5);\np.linearPattern({ dir: "x", spacing: 0.8, count: 4 });\np.sketch("Top", 0.25).circle(0, 0.95, 0.25).end().cut("through", { reverse: true });\np.linearPattern({ dir: "x", spacing: 0.4, count: 5 });\n',
      pat: 3 + 0.5 * (4 * PI * 0.25 - 3 * lens(0.5, 0.8)) - 0.25 * (5 * PI * 0.0625 - 4 * lens(0.25, 0.4)),
      // six Ø1 × .5 bosses round a circle of radius 0.6 (each overlaps both neighbours and the far ones): the union's
      // volume from OpenCascade (exact circles; a 4·10⁶-strip integration of the union gives 1.685251663)
      CPAT: 'p.units("in");\np.sketch("Top").circle(3, 3, 0.5).end().extrude(0.5);\np.circularPattern({ axis: "y", center: [3, 0, -3.6], count: 6 });\n',
      cpat: 1.6852516631899304
    };
  })();
  (function () {
    group('rfFZ: parts OpenCascade now builds too (cut across a bend after Unfold / Fold, drafted round boss, overlapping pattern instances)');
    function rfFZtight(r) {
      (r.build.bodies || []).forEach(function (b, i) {
        var c = Evaluate.checkBody(b);
        assert(!c.openEdges.length && !c.nonManifoldEdges.length, 'body ' + i + ': ' + c.openEdges.length + ' open, ' + c.nonManifoldEdges.length + ' non-manifold edges');
      });
    }
    test('rfFZ: hole cut across a bend after Unfold, then Fold (rfFT pin 2): closed, one body, π r² T out of the bent bracket (Anvil within 3e-4: bend facets)', function () {
      var r = build(rfFZ.PIN2);
      noErrors(r); rfFZtight(r);
      assert(r.build.bodies.length === 1, r.build.bodies.length + ' bodies');
      nearRel(r.mp.volume, rfFZ.pin2, 3e-4, 'volume');
      nearVec(r.mp.bbox.max, [6, 1.5, 4], 1e-6, 'bbox max');
    });
    test('rfFZ: Ø1.5 × 1 boss with 3° draft is the cone frustum π h (r₁² + r₁ r₂ + r₂²) / 3 (1e-9)', function () {
      var r = build(rfFZ.S20);
      noErrors(r); rfFZtight(r);
      nearRel(r.mp.volume, rfFZ.s20, 1e-9, 'volume');
    });
    test('rfFZ: overlapping linear-pattern bosses (Ø1 at 0.8) and holes (Ø0.5 at 0.4) are one solid: plate + union of discs − union of holes (1e-6)', function () {
      var r = build(rfFZ.PAT);
      noErrors(r); rfFZtight(r);
      assert(r.build.bodies.length === 1, r.build.bodies.length + ' bodies');
      nearRel(r.mp.volume, rfFZ.pat, 1e-6, 'volume');
    });
    test('rfFZ2: overlapping pattern instances of the rfGA corpus (G30 blocks, G31 holes, G32 crossing bars) are one solid of the closed-form volume (Anvil 1e-5)', function () {
      function lens(r, d) { return 2 * r * r * Math.acos(d / (2 * r)) - (d / 2) * Math.sqrt(4 * r * r - d * d); }
      [['p.sketch("Top").rect(0, -1, 5, 1).end().extrude(0.25);\np.sketch("Top", 0.25).rect(0.5, -1, 1, 1).end().extrude(0.5);\np.linearPattern({ dir: "x", spacing: 0.75, count: 4 });\n', 1.25 + 3.25 * 0.5],
       ['p.sketch("Top").circle(0, 0, 2).end().extrude(0.25);\np.sketch("Top", 0.25).circle(0.6, 0, 0.4).end().cut("through", { reverse: true });\np.circularPattern({ axis: "y", center: [0, 0, 0], count: 6 });\n', 0.25 * (4 * Math.PI - 6 * Math.PI * 0.16 + 6 * lens(0.4, 0.6))],
       ['p.sketch("Top").circle(0, 0, 2.5).end().extrude(0.25);\np.sketch("Top", 0.25).rect(0, -0.125, 2, 0.25).end().extrude(0.5);\np.circularPattern({ axis: "y", center: [0, 0, 0], count: 4 });\n', Math.PI * 6.25 * 0.25 + 0.5 * (0.0625 + 4 * 1.875 * 0.25)]].forEach(function (c, i) {
        var r = build('p.units("in");\n' + c[0]);
        noErrors(r); rfFZtight(r);
        assert(r.build.bodies.length === 1, 'case ' + i + ': ' + r.build.bodies.length + ' bodies');
        nearRel(r.mp.volume, c[1], 1e-5, 'case ' + i + ' volume');
      });
    });
    test('rfFZ: six overlapping circular-pattern bosses are one solid of the union\'s volume (Anvil within 1e-5)', function () {
      var r = build(rfFZ.CPAT);
      noErrors(r); rfFZtight(r);
      assert(r.build.bodies.length === 1, r.build.bodies.length + ' bodies');
      nearRel(r.mp.volume, rfFZ.cpat, 1e-5, 'volume');
    });
  })();
