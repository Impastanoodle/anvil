  // --- rfGB (2026-10-30, lane GB: wrong solids with no error in the feature stack) --- Mirror / pattern of a Fillet or
  // Chamfer re-applies it to the copied edges (kernel-rebuild.js edgeFamily); Intersect keeps regions that touch only
  // along an edge as separate bodies and refuses a region that touches itself (kernel-features.js ixJoin /
  // applyIntersect); Shell offsets curved facets exactly (faceDepth, offsetRevRecord; a thickness above a convex round's
  // radius gives a sharp inner corner, rfGH); Draft refuses a face tangent to a round it would leave behind.
  (function () {
    group('rfGB: mirror of a fillet, Intersect along an edge, shell of rounded parts, draft beside a round');
    var PI = Math.PI, U = 'p.units("in");\n';
    var PLAIN = /^[A-Z][^]*\.$/, JSERR = /TypeError|ReferenceError|Cannot read|is not a function|undefined|NaN|Infinity|\bnull\b/;
    function rfGBplate(w, d, t) { return 'p.sketch("Top").centerRect(0, 0, ' + w + ', ' + d + ').end().extrude(' + t + ');\n'; }
    // open / non-manifold edges over every body
    function rfGBcracks(r) {
      var n = 0;
      (r.build.bodies || []).forEach(function (b) { var c = Evaluate.checkBody(b); n += c.openEdges.length + c.nonManifoldEdges.length; });
      return n;
    }
    function rfGBclosed(r) { var n = rfGBcracks(r); assert(!n, n + ' open / non-manifold edges'); }
    function rfGBerrs(r) { return Object.keys(r.errors).map(function (k) { return r.errors[k]; }); }
    function rfGBrefused(r, re) {
      var e = rfGBerrs(r);
      assert(e.length === 1, 'one feature refused: ' + JSON.stringify(e));
      assert(PLAIN.test(e[0]) && !JSERR.test(e[0]), 'plain sentence: ' + e[0]);
      if (re) assert(re.test(e[0]), 'message: ' + e[0]);
      rfGBclosed(r);
      return e[0];
    }
    function rfGBbbox(r, lo, hi) {
      var bb = r.mp.bbox;
      for (var i = 0; i < 3; i++) assert(Math.abs(bb.min[i] - lo[i]) < 1e-6 && Math.abs(bb.max[i] - hi[i]) < 1e-6, 'bbox ' + bboxStr(bb));
    }
    var Q = (1 - PI / 4);   // a round of radius r on a straight edge of length L removes Q·r²·L

    // ------------------------------------------------------------ Mirror / pattern of an edge feature
    test('rfGB: Mirror (feature) of a R 0.25 round on the right top edge of a 4 × 2 × 0.5 plate rounds the left top edge (G10): exact, closed, bbox unchanged', function () {
      var r = build(U + rfGBplate(4, 2, 0.5) + 'p.fillet(0.25, [[2, 0.5, 0]]);\np.mirror("Right");\n');
      noErrors(r); rfGBclosed(r);
      nearRel(r.mp.volume, 4 - 2 * Q * 0.0625 * 2, 1e-9, 'plate − two rounds');
      rfGBbbox(r, [-2, 0, -1], [2, 0.5, 1]);
      return 'volume ' + r.mp.volume.toFixed(9);
    });
    test('rfGB: Mirror (feature) of a 0.25 chamfer on the right top edge chamfers the left one', function () {
      var r = build(U + rfGBplate(4, 2, 0.5) + 'p.chamfer(0.25, [[2, 0.5, 0]]);\np.mirror("Right");\n');
      noErrors(r); rfGBclosed(r);
      nearRel(r.mp.volume, 4 - 2 * 0.03125 * 2, 1e-9, 'plate − two chamfers');
      rfGBbbox(r, [-2, 0, -1], [2, 0.5, 1]);
      return 'volume ' + r.mp.volume.toFixed(9);
    });
    test('rfGB: CirPattern ×4 of a R 0.25 vertical corner round on a 2 × 2 × 1 block rounds all four corners', function () {
      var r = build(U + rfGBplate(2, 2, 1) + 'p.fillet(0.25, [[1, 0.5, 1]]);\np.circularPattern({ axis: "y", center: [0, 0, 0], count: 4 });\n');
      noErrors(r); rfGBclosed(r);
      nearRel(r.mp.volume, 4 - 4 * Q * 0.0625, 1e-9, 'block − four corner rounds');
      rfGBbbox(r, [-1, 0, -1], [1, 1, 1]);
      return 'volume ' + r.mp.volume.toFixed(9);
    });
    test('rfGB: Mirror of a Mirror of a corner round (Right, then Front) rounds the four vertical corners of a 4 × 2 × 0.5 plate', function () {
      var r = build(U + rfGBplate(4, 2, 0.5) + 'p.fillet(0.25, [[2, 0.25, 1]]);\np.mirror("Right");\np.mirror("Front");\n');
      noErrors(r); rfGBclosed(r);
      nearRel(r.mp.volume, 4 - 4 * Q * 0.0625 * 0.5, 1e-9, 'plate − four corner rounds');
      return 'volume ' + r.mp.volume.toFixed(9);
    });
    test('rfGB: Mirror of a round whose mirrored edge is not on the part is refused in a plain sentence; the part before it stays', function () {
      var r = build(U + 'p.sketch("Top").rect(1, -1, 3, 2).end().extrude(0.5);\np.fillet(0.25, [[4, 0.5, 0]]);\np.mirror("Right");\n');
      var m = rfGBrefused(r, /^Mirror: the mirrored edges of Fillet1 are not on the part/);
      nearRel(r.mp.volume, 3 - Q * 0.0625 * 2, 1e-9, 'plate with its one round');
      return m;
    });
    test('rfGB: Mirror (feature) of a cut still subtracts the mirrored slot (G09)', function () {
      var r = build(U + rfGBplate(4, 3, 0.5) + 'p.sketch("Top", 0.5).slot(1, 0, 1.5, 0, 0.25).end().cut("through", { reverse: true });\np.mirror("Right");\n');
      noErrors(r); rfGBclosed(r);
      nearRel(r.mp.volume, 6 - 2 * 0.5 * (0.5 * 0.25 + PI * 0.015625), 1e-9, 'plate − two slots');
      return 'volume ' + r.mp.volume.toFixed(9);
    });

    // ------------------------------------------------------------ Intersect
    test('rfGB: Intersect keeping A only and B only (no A∩B) of a ring and a rod that meet only along an edge: two closed bodies, not one non-manifold solid (fuzz pin 4)', function () {
      var r = build(U + 'p.sketch("Front").polyline([[0.25, 0], [1, 0], [1, 1], [0.25, 1]]).end().revolve(360);\np.sketch("Top", 0.5).circle(-0.0406, 0.6288, 0.25).end().extrude(1, { merge: false });\np.intersect({ regions: [true, true, false] });\n');
      noErrors(r); rfGBclosed(r);
      assert(r.build.bodies.length === 2, r.build.bodies.length + ' bodies');
      // the rod (y 0.5 … 1.5) lies inside the ring's annulus: A∩B is its lower half, B only its upper half
      var half = PI * 0.0625 * 0.5, vols = r.build.bodies.map(function (b) { return K.massProps(K.meshFromBody(b), 1).volume; }).sort(function (a, b) { return a - b; });
      nearRel(vols[0], half, 1e-6, 'B only: the rod above the ring');
      nearRel(vols[1], PI * 0.9375 - half, 1e-6, 'A only: the ring less the rod');
      return 'bodies ' + vols.map(function (v) { return v.toFixed(6); }).join(' + ');
    });
    test('rfGB: Intersect keeping a region that touches itself along an edge (two diagonal quarters of a block) is refused in a plain sentence', function () {
      var r = build(U + rfGBplate(2, 2, 1) + 'p.sketch("Top").rect(0, 0, 2, 2).end().extrude(1, { merge: false });\np.sketch("Top").rect(-2, -2, 2, 2).end().extrude(1, { merge: false });\np.intersect({ regions: [true, false, false, false, false, false, false, false, false, false] });\n');
      var m = rfGBrefused(r, /^Intersect: a region kept would touch itself/);
      assert(r.build.bodies.length === 3, 'the three bodies before it stay');
      return m;
    });

    // ------------------------------------------------------------ Shell of rounded parts
    // a W × D box H tall with vertical edges rounded r and the bottom loop rounded rho (rfGA's roundedBox)
    function rfGBroundedBox(W, D, r, rho, H) { return (W * D - (4 - PI) * r * r) * H - 2 * (W + D - (4 - PI) * r) * rho * rho * (1 - PI / 4) + PI * Math.pow(rho, 3) * (5 / 3 - PI / 2); }
    test('rfGB: shell 0.1 after R 0.5 vertical and R 0.25 bottom rounds on a 4 × 3 × 2 box equals the closed form (the inside is the offset: r 0.4, rho 0.15; G13, was 8e-4 heavy)', function () {
      var r = build(U + rfGBplate(4, 3, 2) + 'p.fillet(0.5, [[2, 1, 1.5], [2, 1, -1.5], [-2, 1, 1.5], [-2, 1, -1.5]]);\np.fillet(0.25, [[0, 0, 1.5]]);\np.shell(0.1, [[0, 2, 0]]);\n');
      noErrors(r); rfGBclosed(r);
      nearRel(r.mp.volume, rfGBroundedBox(4, 3, 0.5, 0.25, 2) - rfGBroundedBox(3.8, 2.8, 0.4, 0.15, 1.9), 1e-7, 'rounded box − its offset');
      return 'volume ' + r.mp.volume.toFixed(9);
    });
    test('rfGB: shell 0.1 after R 0.5 vertical rounds on a 4 × 3 × 2 box equals the closed form', function () {
      var r = build(U + rfGBplate(4, 3, 2) + 'p.fillet(0.5, [[2, 1, 1.5], [2, 1, -1.5], [-2, 1, 1.5], [-2, 1, -1.5]]);\np.shell(0.1, [[0, 2, 0]]);\n');
      noErrors(r); rfGBclosed(r);
      nearRel(r.mp.volume, (12 - (4 - PI) * 0.25) * 2 - (3.8 * 2.8 - (4 - PI) * 0.16) * 1.9, 1e-7, 'rounded box − its offset');
      return 'volume ' + r.mp.volume.toFixed(9);
    });
    test('rfGB: a shell thicker than a convex rim round builds: 0.692314, SolidWorks rfGD R09a (Ø3 × 0.5 disk, R 0.03 rim, shell 0.0625; fuzz pin 2; was a refusal claimed from SolidWorks)', function () {
      var r = build(U + 'p.sketch("Front").polyline([[0, 0], [1.5, 0], [1.5, 0.5], [0, 0.5]]).end().revolve(360);\np.fillet(0.03, [[1.5, 0.5, 0]]);\np.shell(0.0625, [[1.4, 0.5, 0]]);\n');
      noErrors(r); rfGBclosed(r);
      nearRel(r.mp.volume, 0.6923141, 1e-6, 'SolidWorks');
      return 'volume ' + r.mp.volume.toFixed(7);
    });
    // Ø3 × 0.5 disk, R 0.1 rim round, shell 0.0625 open top (T < r): the inside is the offset (tube 0.0375 round the
    // round's centre circle at radius 1.4, y 0.4); the wall ends straight up from the offset edge (OpenCascade's)
    function rfGBcorner(r, rc) { return 2 * PI * r * r * Q * (rc + r / (6 * Q)); }   // the ring a convex rim round r (centre at radius rc) removes
    function rfGBquarter(a, rc) { return 2 * PI * (PI * a * a / 4) * (rc + 4 * a / (3 * PI)); }   // a quarter disk a outward of radius rc, revolved
    var DISK = U + 'p.sketch("Front").polyline([[0, 0], [1.5, 0], [1.5, 0.5], [0, 0.5]]).end().revolve(360);\np.fillet(0.1, [[1.5, 0.5, 0]]);\n';
    test('rfGB: shell 0.0625 of a Ø3 × 0.5 disk with a R 0.1 rim round, top closed, equals the closed form', function () {
      var r = build(DISK + 'p.shell(0.0625, []);\n');
      noErrors(r); rfGBclosed(r);
      var outer = PI * 2.25 * 0.5 - rfGBcorner(0.1, 1.4), cav = PI * 1.4375 * 1.4375 * 0.3375 + PI * 1.96 * 0.0375 + rfGBquarter(0.0375, 1.4);
      nearRel(r.mp.volume, outer - cav, 1e-7, 'disk − its offset');
      return 'volume ' + r.mp.volume.toFixed(9);
    });
    var rfGBopenDisk = null;
    function rfGBdiskOpen() { return rfGBopenDisk || (rfGBopenDisk = build(DISK + 'p.shell(0.0625, [[1.0, 0.5, 0]]);\n')); }
    test('rfGB: shell 0.0625 open top of a Ø3 × 0.5 disk with a R 0.1 rim round is closed (21 open edges before)', function () {
      var r = rfGBdiskOpen();
      noErrors(r); rfGBclosed(r);
      return 'volume ' + r.mp.volume.toFixed(6);
    });
    test('rfGB: shell open top of a disk with a rim round tangent to the opening = closed form = SolidWorks 0.697804 (rfGD R09d; the wall ends straight down from the tangent edge, rfGH)', function () {
      var r = rfGBdiskOpen();
      var want = PI * 2.25 * 0.5 - rfGBcorner(0.1, 1.4) - (PI * 1.4375 * 1.4375 * 0.3375 + PI * 1.96 * 0.1 + rfGBquarter(0.0375, 1.4));
      nearRel(want, 0.6978044, 1e-6, 'SolidWorks');
      nearRel(r.mp.volume, want, 1e-7, 'closed form');
      return 'volume ' + r.mp.volume.toFixed(7);
    });
    test('rfGB: shell 0.1 open top of a ring OD 3 / ID 1 × 1 with a R 0.15 outer rim round is closed (4 open edges before)', function () {
      var r = build(U + 'p.sketch("Front").polyline([[0.5, 0], [1.5, 0], [1.5, 1], [0.5, 1]]).end().revolve(360);\np.fillet(0.15, [[1.5, 1, 0]]);\np.shell(0.1, [[1.0, 1, 0]]);\n');
      noErrors(r); rfGBclosed(r);
      return 'volume ' + r.mp.volume.toFixed(6);
    });

    // ------------------------------------------------------------ Draft beside a round
    test('rfGB: a Draft on a face tangent to a corner round that is not drafted is refused in a plain sentence (fuzz pin 6 built 18 open edges and a 60 in bbox)', function () {
      var r = build(U + rfGBplate(5.5, 3.25, 0.5) + 'p.fillet(0.25, [[2.75, 0.25, 1.625]]);\np.draft(1, [0, 0, 0], [[0, 0.25, -1.625], [0, 0.25, 1.625]]);\n');
      var m = rfGBrefused(r, /is tangent to a round that is not drafted with it/);
      nearRel(r.mp.volume, 8.9375 - Q * 0.0625 * 0.5, 1e-9, 'the rounded plate stays');
      return m;
    });
    test('rfGB: a Draft on a face away from the round still drafts (−z side of the same plate, 1° about the bottom)', function () {
      var r = build(U + rfGBplate(5.5, 3.25, 0.5) + 'p.fillet(0.25, [[2.75, 0.25, 1.625]]);\np.draft(1, [0, 0, 0], [[0, 0.25, -1.625]]);\n');
      noErrors(r); rfGBclosed(r);
      nearRel(r.mp.volume, 8.9375 - Q * 0.0625 * 0.5 - 5.5 * 0.125 * Math.tan(PI / 180), 1e-6, 'the −z wall tapers 1°');
      return 'volume ' + r.mp.volume.toFixed(9);
    });
  })();
