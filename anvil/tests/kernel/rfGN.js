  // --- rfGN (2026-11-02, lane shell-fuzz): shells the feature-stack fuzz left open or refused. buildShell: edge lookups on
  // an inch fraction's rounding boundary (edgeKey), a torus / sphere round as one closed solid (ringSolid). Volumes:
  // closed forms by Pappus (the wall section of a ring whose bore rim is rounded R > T, top open).
  (function () {
    group('rfGN: shells with rounds on a bore or outer rim, thinner than the round; fuzz stacks 202, 565, 601');
    var PI = Math.PI, U = 'p.units("in");\n';
    function rfGNbuild(code) {
      var m = Kernel.newModel('rfGN');
      Kernel.runScript(m, U + code);
      var b = Kernel.rebuild(m), open = 0, nm = 0;
      (b.bodies || []).forEach(function (x) { var c = Evaluate.checkBody(x); open += c.openEdges.length; nm += c.nonManifoldEdges.length; });
      var errs = Object.keys(b.errors || {}).map(function (id) { return b.errors[id]; });
      assert(!errs.length, 'no errors: ' + errs.join(' ; '));
      assert(!open && !nm, 'closed: ' + open + ' open, ' + nm + ' non-manifold');
      return Kernel.massProps(Kernel.meshFromBody(b.body), 1).volume;
    }
    // ring bore a, OD b, height H, bore rim round R (convex), shell T < R, top open: the wall ends straight up from the
    // tangent circle, the cavity wall under it is the offset arc R − T
    function rfGNboreRim(a, b, H, R, T) {
      var A = (1 - PI / 4) * R * R, c = R * (10 - 3 * PI) / (3 * (4 - PI)), base = PI * (b * b - a * a) * H - 2 * PI * (a + c) * A;
      var q = R - T, wall = PI * (Math.pow(a + R, 2) - Math.pow(a + T, 2)) * R - 2 * PI * (a + R - 4 * q / (3 * PI)) * (PI * q * q / 4);
      return base - (PI * (Math.pow(b - T, 2) - Math.pow(a + T, 2)) * (H - T) - wall);
    }
    function rfGNring(rim) { return 'p.sketch("Front").polyline([[0.25, 0], [1, 0], [1, 1], [0.25, 1]]).end().revolve(360);\np.fillet(' + rim + ');\n'; }
    [[0.1, 0.05], [0.0625, 0.05], [0.1, 0.0625], [0.0625, 0.0625]].forEach(function (c) {
      test('ring Ø.5 bore, R ' + c[0] + ' on the bore rim, shell ' + c[1] + ' open top: closed, the closed form', function () {
        var v = rfGNbuild(rfGNring(c[0] + ', [[0.25,1,0]]') + 'p.shell(' + c[1] + ', [[0.6,1,0]]);\n');
        nearRel(v, rfGNboreRim(0.25, 1, 1, c[0], c[1]), 1e-9);
        return 'volume ' + v.toFixed(7);
      });
    });
    test('the same ring, R .1 / R .0625 on the OUTER rim, shell .05: closed', function () {
      rfGNbuild(rfGNring('0.1, [[1,1,0]]') + 'p.shell(0.05, [[0.6,1,0]]);\n');
      rfGNbuild(rfGNring('0.0625, [[1,1,0]]') + 'p.shell(0.05, [[0.6,1,0]]);\n');
    });
    test('fuzz 601: plate, boss, hole with a rim round, a third body added, shell .05: closed', function () {
      rfGNbuild('p.sketch("Top").centerRect(0, 0, 3.5, 2.75).end().extrude(0.5);\np.sketch("Top", 0.5).circle(0.6859, -1.0468, 0.125).end().extrude(0.25);\n' +
        'p.sketch("Top", 2.5).circle(1.1755, -0.4841, 0.125).end().cut("through", { reverse: true });\np.fillet(0.1125, [[1.3005,0.5,0.4841]]);\n' +
        'p.sketch("Top", 0.25).circle(0.4255, 0.1656, 0.5).end().extrude(0.5, { merge: false });\np.intersect({ regions: [true,true,true] });\np.shell(0.05, [[1.65,0.5,1.275]]);\n');
    });
    test('fuzz 202: hole rim round on a mirrored plate, shell .0625 (was refused): closed', function () {
      rfGNbuild('p.sketch("Top").centerRect(0, 0, 4, 2.5).end().extrude(0.5);\np.mirror("Top", { body: true });\np.sketch("Top", 0.5).centerRect(0.405, -0.9355, 0.375, 0.1875).end().extrude(0.5);\n' +
        'p.mirror("Right");\np.sketch("Top", 2.5).circle(0.4912, 0.6782, 0.375).end().cut("through", { reverse: true });\np.linearPattern({ dir: "x", spacing: -1, count: 3 });\n' +
        'p.fillet(0.125, [[0.8662,0.5,-0.6782]]);\np.shell(0.0625, [[1.9,0.5,1.15]]);\n');
    });
  })();
