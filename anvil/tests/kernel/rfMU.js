  // --- rfMU (2026-11-15, lane occtpanel) --- a fillet / chamfer along a circular edge whose size uses up the face
  // beside it: a tube's 0.25 wide top annulus rounded R.25 at either rim, a disc 0.25 thick chamfered / rounded .25 at
  // its top rim. OpenCascade builds these now (occt-kernel.js widenedEdgeOp, circle case; occt-tests rows "rfMU");
  // here Anvil's own engine is held to the same analytic volumes (Pappus: the corner region revolved about the axis)
  (function () {
    group('rfMU: rounds and chamfers that use up the face beside a circular edge (Anvil\'s engine, analytic volumes)');
    var tube = 'p.units("in");\np.sketch("Top").circle(0, 0, 1).circle(0, 0, 0.75).end().extrude(1);\n', disc = 'p.units("in");\np.sketch("Top").circle(0, 0, 1).end().extrude(0.25);\n';
    var r = 0.25, A = r * r * (1 - Math.PI / 4), xb = r * (5 / 6 - Math.PI / 4) / (1 - Math.PI / 4), tubeV = Math.PI * (1 - 0.5625);
    [['tube R.25 at the outer top rim', tube + 'p.fillet(0.25, [[1, 1, 0]]);\n', tubeV - 2 * Math.PI * (1 - xb) * A],
      ['tube R.25 at the inner top rim', tube + 'p.fillet(0.25, [[0.75, 1, 0]]);\n', tubeV - 2 * Math.PI * (0.75 + xb) * A],
      ['disc .25 thick, chamfer .25 at the top rim', disc + 'p.chamfer(0.25, [[1, 0.25, 0]]);\n', Math.PI * 0.25 - 2 * Math.PI * (1 - r / 3) * (r * r / 2)],
      ['disc .25 thick, R.25 at the top rim', disc + 'p.fillet(0.25, [[1, 0.25, 0]]);\n', Math.PI * 0.25 - 2 * Math.PI * (1 - xb) * A]].forEach(function (c) {
      test('rfMU: ' + c[0] + ': one body, the analytic volume to 1e-6', function () {
        var b = build(c[1]);
        noErrors(b);
        assert(b.build.bodies.length === 1, b.build.bodies.length + ' bodies');
        nearRel(b.mp.volume, c[2], 1e-6, 'volume');
      });
    });
    // lane MU2: coplanarBody (every Edge Flange meshes the sheet through it) binned its planes by offset; it compared
    // each polygon with every distinct plane before (7 of 16 s on a 1800-hole panel with four flanges). Work count: a
    // 400-hole 8 x 8 panel with four Edge Flanges makes a few comparisons per polygon, not one per wall facet plane
    test('rfMU: Edge Flanges on a 400-hole sheet: coplanarBody compares each polygon with a few planes, not all 12 800 wall facet planes', function () {
      var T = 0.0598, c = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\nvar s = p.sketch("Top").rect(0, 0, 8, 8);\n' +
        'for (var i = 0; i < 20; i++) for (var j = 0; j < 20; j++) s.circle(0.5 + i * 0.36, 0.5 + j * 0.36, 0.0625);\n' +
        's.end().baseFlange(' + T + ');\np.flange(1, [[4, ' + T + ', 0], [8, ' + T + ', -4], [4, ' + T + ', -8], [0, ' + T + ', -4]]);\n';
      var st = K.coplanarStats, c0 = st.compares, t0 = Date.now(), b = build(c), ms = Date.now() - t0;
      noErrors(b);
      var n = b.build.body.polygons.length, made = st.compares - c0;
      assert(made > 0, 'coplanarBody not called');
      assert(made < 8 * n, made + ' plane comparisons for a body of ' + n + ' polygons');
      assert(ms < 60000, 'rebuild took ' + ms + ' ms');
    });
  })();
