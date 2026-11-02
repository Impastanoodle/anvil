  // --- rfGU (2026-11-02, lane thickness) --- Thickness Analysis (evaluate.js thickness): exact wall on a plate, a shelled box,
  // a tube and a bend, rims and hole walls read the wall too, corner samples leave the statistics or count as zero.
  (function () {
    group('rfGU: Thickness Analysis: min / max / histogram exact on a plate, a shell, a tube; corners; thin regions');
    function rfGUbody(code) {
      var r = build(code);
      assert(!r.errors.length, 'build: ' + JSON.stringify(r.errors));
      return r.build.bodies && r.build.bodies.length ? r.build.bodies : [r.body];
    }
    function rfGUeq(r, t, label) {
      assert(Math.abs(r.min - t) < 1e-6 * Math.max(t, 1) && Math.abs(r.max - t) < 1e-6 * Math.max(t, 1), label + ': min ' + r.min + ' max ' + r.max + ', want ' + t);
    }
    test('rfGU: a 4 x 2 x .25 plate is .25 everywhere, rim faces included; the histogram is one bin of the whole area', function () {
      var r = Evaluate.thickness(rfGUbody('p.box(4, 2, 0.25);'), { samples: 1500 });
      rfGUeq(r, 0.25, 'plate');
      assert(r.cornerArea === 0, 'no corner samples: ' + r.cornerArea);
      assert(r.histogram.length === 1 && Math.abs(r.histogram[0].fraction - 1) < 1e-12, 'one bin');
      near(r.area, 2 * (4 * 2 + 4 * 0.25 + 2 * 0.25), 1e-9);
      near(r.mean, 0.25, 1e-6);
    });
    test('rfGU: a 2 x 2 x 3 block reads its smallest size on every face', function () {
      rfGUeq(Evaluate.thickness(rfGUbody('p.box(2, 2, 3);'), { samples: 1500 }), 2, 'block');
    });
    test('rfGU: an open shelled box and a closed one read the wall; corners on: min 0 and the corner area counted', function () {
      var open = Evaluate.thickness(rfGUbody('p.box(6, 5, 4);\np.shell(0.125, [[3, 4, 2]]);'), { samples: 6000 });
      rfGUeq(open, 0.125, 'open shell');
      assert(open.cornerArea > 0 && open.cornerArea < 0.1 * open.area, 'corner area ' + open.cornerArea + ' of ' + open.area);
      var closed = Evaluate.thickness(rfGUbody('p.box(6, 5, 4);\np.shell(0.125, []);'), { samples: 6000 });
      rfGUeq(closed, 0.125, 'closed shell');
      var z = Evaluate.thickness(rfGUbody('p.box(6, 5, 4);\np.shell(0.125, [[3, 4, 2]]);'), { samples: 6000, treatCorners: true });
      assert(z.min === 0 && Math.abs(z.max - 0.125) < 1e-6, 'corners as zero: ' + z.min + ' .. ' + z.max);
      assert(z.histogram[0].area > 0 && z.histogram[z.histogram.length - 1].area > z.histogram[0].area, 'zero bin and wall bin');
    });
    test('rfGU: a tube reads its wall exactly on both cylinders and both end rings (true surfaces, not the facets)', function () {
      var r = Evaluate.thickness(rfGUbody('p.sketch("Top").circle(0, 0, 1).circle(0, 0, 0.75).extrude(3);'), { samples: 4000 });
      rfGUeq(r, 0.25, 'tube');
    });
    test('rfGU: a solid cylinder reads the smaller of its diameter and length; a plate with a hole stays the plate', function () {
      rfGUeq(Evaluate.thickness(rfGUbody('p.sketch("Top").circle(0, 0, 1).extrude(5);'), { samples: 2000 }), 2, 'bar');
      rfGUeq(Evaluate.thickness(rfGUbody('p.sketch("Top").circle(0, 0, 3).extrude(0.5);'), { samples: 2000 }), 0.5, 'disc');
      rfGUeq(Evaluate.thickness(rfGUbody('p.box(4, 4, 0.25);\np.sketch("Top", 0.25).circle(2, -2, 0.5).cut(1, { reverse: true });'), { samples: 3000 }), 0.25, 'plate with hole');
    });
    test('rfGU: a stepped plate reports both walls, the histogram sums to the area, target splits it', function () {
      var r = Evaluate.thickness(rfGUbody('p.box(4, 4, 0.5);\np.sketch("Top", 0.5).centerRect(1, -2, 2, 4).cut(0.25, { reverse: true });'), { samples: 6000, target: 0.3 });
      near(r.min, 0.25, 1e-6);
      near(r.max, 0.5, 1e-6);
      var s = 0;
      r.histogram.forEach(function (b) { s += b.area; });
      near(s, r.wallArea, 1e-9);
      assert(r.below > 0 && r.above > 0 && Math.abs(r.below + r.above - r.wallArea) < 1e-6, 'below + above = area');
    });
    test('rfGU: a 16 ga bracket reads the sheet on the flats, across the bend and on every rim', function () {
      rfGUeq(Evaluate.thickness(rfGUbody('p.units("in"); p.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1.5, [[3, 0.0598, 0]], { position: "inside", lengthRef: "outer" });'), { samples: 4000 }), 0.0598, 'bracket');
    });
    test('rfGU: thicknessStats on the same field follows the options without casting again', function () {
      var r = Evaluate.thickness(rfGUbody('p.box(6, 5, 4);\np.shell(0.125, [[3, 4, 2]]);'), { samples: 3000 });
      var z = Evaluate.thicknessStats(r.field, { treatCorners: true });
      assert(z.min === 0 && r.min > 0, 'zero with corners on');
    });
  })();
