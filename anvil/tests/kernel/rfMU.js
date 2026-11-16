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
  })();
