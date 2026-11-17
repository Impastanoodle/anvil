  // --- rfNM (2026-11-16, lane smcuts: a cut across a bend develops exactly into the flat) ---
  // A Normal Cut (SolidWorks' default for a sheet-metal Cut-Extrude) across an edge flange's bend takes the tool's
  // footprint on the surface it enters through, pushed through the thickness: in the bend's developed (s, t) the
  // footprint of a round hole is the tool cylinder's trace on the bend's inside surface, not a circle. Mass Properties
  // count that true trace (wrapRegion opts.exactFoot), and the flat draws it (flatFootLoop on the cut's 'normalCutFoot'
  // records): the folded part, the flat × T and OpenCascade agree to 1e-6, and the hole's place in the flat follows the
  // bend allowance in use (K-factor, Bend Deduction value, Bend Table).
  // A plain (not Normal) Cut-Extrude from the base's top face reaches only the bend metal below that face (a wedge: the
  // outside surface is cut to 60° of the bend, the inside not at all), so no outline × T can equal it: the folded solid
  // (= OpenCascade to 1e-10, the same boolean) is the reference, and the flat shows the cut on the face it enters
  // through, developed by angle (what the flat seen from the base's face shows).
  (function () {
    group('rfNM: cuts across a bend develop exactly: Normal Cut hole / slot / rectangle folded = flat × T = closed form (1e-6), the flat follows K-factor / BD / bend table, plain cuts = OpenCascade');
    var T = 0.0598, R = 0.0598, P = R + T, A = Math.PI / 2;
    function rfNMhead(opts) {
      return 'p.units("in");\np.sheet(' + T + ', ' + R + ', ' + (opts && opts.k != null ? opts.k : 0.5) + (opts && opts.o ? ', ' + JSON.stringify(opts.o) : '') + ');\n' +
        'p.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1.5, [[3, ' + T + ', 0]], { position: "inside", lengthRef: "outer" });\n';
    }
    // a flat loop's area with its true arcs (the DXF writer's curves: the base's 32-gon read back as the hole's ARC; no
    // merging of straight runs, so the trace across the bend counts as sampled, 1e-6·(1 + r) sagitta)
    function rfNMarea(l) {
      var cv = K.dxfLoopCurves(l, { weld: 1e-3, onLine: 1e-9, merge: 1e-12, maxStep: 25 * Math.PI / 180, minChords: 3 });
      if (!cv) return Math.abs(K.signedArea(l));
      if (cv.circle) return Math.PI * cv.circle.r * cv.circle.r;
      var a = 0;
      cv.segs.forEach(function (s) {
        a += (s.a[0] * s.b[1] - s.b[0] * s.a[1]) / 2;
        if (s.t === 'arc') { var th = Math.abs(s.sweep); a += (s.ccw ? 1 : -1) * s.r * s.r / 2 * (th - Math.sin(th)); }
      });
      return Math.abs(a);
    }
    function rfNMblank(fl) { return fl.loops.reduce(function (s, l, i) { return s + (i === 0 ? 1 : -1) * rfNMarea(l); }, 0); }
    // a plan shape centred on the bend line z = P (half height h(x) for x in [x0, x1]): the base part (z > P) has area
    // ∫ h dx; on the bend's inside surface (z = P − R sin θ) it reaches θm(x) = asin(min(1, h / R)): metal removed
    // ((R + T)² − R²) / 2 · ∫ θm dx, developed area BA / A · ∫ θm dx (the wall's inside face is parallel to the cut: not cut)
    function rfNMform(x0, x1, h, BA) {
      var N = 200000, dx = (x1 - x0) / N, base = 0, th = 0;
      for (var i = 0; i < N; i++) { var hx = h(x0 + (i + 0.5) * dx); base += hx * dx; th += Math.asin(Math.min(1, hx / R)) * dx; }
      return { removed: T * base + ((R + T) * (R + T) - R * R) / 2 * th, flatHole: base + BA / A * th, reach: BA * Math.asin(Math.min(1, h((x0 + x1) / 2) / R)) / A };
    }
    var SHAPES = [
      ['Ø.5 hole', '.circle(2, ' + (-P) + ', 0.25)', 1.75, 2.25, function (x) { return Math.sqrt(Math.max(0, 0.0625 - (x - 2) * (x - 2))); }],
      ['slot .6 x .1', '.slot(1, ' + (-P) + ', 1.6, ' + (-P) + ', 0.1)', 0.95, 1.65, function (x) { var d = x < 1 ? 1 - x : x > 1.6 ? x - 1.6 : 0; return Math.sqrt(Math.max(0, 0.0025 - d * d)); }],
      ['rectangle .5 x .3', '.rect(4, ' + (-(P + 0.15)) + ', 0.5, 0.3)', 4, 4.5, function () { return 0.15; }]
    ];
    var BA5 = A * (R + T / 2);
    SHAPES.forEach(function (sh) {
      test('rfNM: Normal Cut ' + sh[0] + ' across a 16 ga bend (K 0.5): folded = closed form, flat × T = folded (1e-6), one hole in the flat', function () {
        var r0 = build(rfNMhead()), r = build(rfNMhead() + 'p.sketch("Top", ' + T + ')' + sh[1] + '.end().cut("through", { reverse: true, normalCut: true });\n');
        assert(!Object.keys(r.errors).length, JSON.stringify(r.errors));
        var c = Evaluate.checkBody(r.body, { maxPairs: 1 });
        assert(!c.openEdges.length && !c.nonManifoldEdges.length, c.openEdges.length + ' open, ' + c.nonManifoldEdges.length + ' non-manifold edges');
        var cf = rfNMform(sh[2], sh[3], sh[4], BA5), ex = r0.mp.volume - cf.removed, fl = K.flatPattern(r.model, r.build, r.mesh), fa = rfNMblank(fl) * T;
        assert(fl.loops.length === 2, fl.loops.length + ' flat loops');
        nearRel(r.mp.volume, ex, 1e-6, 'folded vs closed form ' + ex.toFixed(9));
        nearRel(fa, r.mp.volume, 1e-6, 'flat × T vs folded');
        return 'folded ' + ((r.mp.volume - ex) / ex).toExponential(2) + ', flat × T ' + ((fa - ex) / ex).toExponential(2);
      });
    });
    // OpenCascade's volume of the Ø.5 Normal Cut (headless OcctKernel.build, 2026-11-16; Anvil's was 6e-6 light before)
    test('rfNM: the Ø.5 Normal Cut across the bend = OpenCascade (1e-8)', function () {
      var r = build(rfNMhead() + 'p.sketch("Top", ' + T + ').circle(2, ' + (-P) + ', 0.25).cut("through", { reverse: true, normalCut: true });\n');
      nearRel(r.mp.volume, 1.928107265, 1e-8, 'vs OpenCascade');
    });
    // (c) the same hole under three bend allowances: the folded part is the same; the flat's hole follows the BA in use
    [['K-factor 0.5', null, BA5], ['K-factor 0.33', { k: 0.33 }, A * (R + 0.33 * T)],
      ['Bend Deduction .100', { o: { bendAllowanceType: 'deduction', bendDeduction: 0.1 } }, 2 * (R + T) - 0.1],
      ['Bend Table (BD .105)', { o: { bendAllowanceType: 'table', bendTable: { kind: 'BD', rows: [{ thickness: 0.0598, radius: 0.0598, angle: 90, value: 0.105 }] } } }, 2 * (R + T) - 0.105]].forEach(function (m) {
      test('rfNM: Ø.5 Normal Cut across the bend, ' + m[0] + ': folded unchanged, the flat hole = base half circle + BA / A × the bend lobe (1e-6), reaching BA·θ/A into the bend', function () {
        var head = rfNMhead(m[1]), r0 = build(head), r = build(head + 'p.sketch("Top", ' + T + ').circle(2, ' + (-P) + ', 0.25).cut("through", { reverse: true, normalCut: true });\n');
        assert(!Object.keys(r.errors).length, JSON.stringify(r.errors));
        var sh = SHAPES[0], cf = rfNMform(sh[2], sh[3], sh[4], m[2]);
        nearRel(r.mp.volume, r0.mp.volume - cf.removed, 1e-6, 'folded');
        var fl = K.flatPattern(r.model, r.build, r.mesh), b0 = K.flatPattern(r0.model, r0.build, r0.mesh), hole = rfNMarea(fl.loops[1]);
        near(fl.bends[0].ba, m[2], 1e-9, 'bend allowance in use');
        nearRel(rfNMblank(b0) - rfNMblank(fl), cf.flatHole, 1e-6, 'blank less the hole');
        nearRel(hole, cf.flatHole, 1e-6, 'flat hole area');
        // the base half circle ends at the bend line (flat y = −P from the base's edge at y = 0 of the sketch: the flat
        // keeps the base where it is); the lobe runs to BA·θm/A past it (θm = 90° at x = 2: the whole bend)
        var ymax = Math.max.apply(null, fl.loops[1].map(function (p) { return p[1]; })), y0 = fl.bends[0].a[1] - m[2] / 2;
        near(ymax - y0, cf.reach, 1e-6, 'lobe reach');
        return 'BA ' + m[2].toFixed(5) + ', hole ' + hole.toFixed(7) + ' (closed form ' + cf.flatHole.toFixed(7) + ')';
      });
    });
    // (a) plain cuts: the folded solid is the boolean OpenCascade makes too
    var OCC = { 'Ø.5 hole': 1.930104423, 'slot .6 x .1': 1.934190387 };
    [['Ø.5 hole', '.circle(2, ' + (-P) + ', 0.25)'], ['slot .6 x .1', '.slot(1, ' + (-P) + ', 1.6, ' + (-P) + ', 0.1)']].forEach(function (c) {
      test('rfNM: plain cut ' + c[0] + ' across the bend: folded = OpenCascade (1e-8); the flat shows its outline on the base\'s face, no larger than the Normal Cut\'s', function () {
        var r = build(rfNMhead() + 'p.sketch("Top", ' + T + ')' + c[1] + '.end().cut("through", { reverse: true });\n');
        assert(!Object.keys(r.errors).length, JSON.stringify(r.errors));
        nearRel(r.mp.volume, OCC[c[0]], 1e-8, 'vs OpenCascade');
        var fl = K.flatPattern(r.model, r.build, r.mesh);
        assert(fl.loops.length === 2, fl.loops.length + ' flat loops');
        var sh = SHAPES.filter(function (s) { return s[0] === c[0]; })[0];
        assert(rfNMarea(fl.loops[1]) < rfNMform(sh[2], sh[3], sh[4], BA5).flatHole, 'plain cut hole larger than the Normal Cut\'s');
        return 'folded ' + r.mp.volume.toFixed(9) + ', flat hole ' + rfNMarea(fl.loops[1]).toFixed(7);
      });
    });
  })();
  // --- end rfNM ---
