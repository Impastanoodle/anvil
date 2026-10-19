  // --- rfCO (2026-10-19, lane CO: Selected Contours) --- a sketch with several regions drives a feature from only
  // some of them, as SolidWorks' Selected Contours: Kernel.sketchRegions (the faces of the sketch's planar
  // arrangement), Kernel.regionAt, feature JSON `contours: [[u, v], …]` (a point inside each picked region; the
  // profile is their union; no contours = the whole sketch as before), a pick that falls in no region errors the
  // feature, the script writes `contours` and the JSON round-trips it. Volumes are exact (chords split at the true
  // circle crossings keep their curve records).
  (function () {
    group('rfCO: Selected Contours (sketch regions, contour picks, exact volumes)');
    var S1 = 'p.sketch("Front").rect(0, -2, 4, 2).line(1, -2, 1, 0).end()';            // 4 × 2 split by a line at x = 1
    var S2 = 'p.sketch("Front").rect(0, -2, 4, 2).circle(2, -1, 0.5).end()';          // Ø1 circle inside 4 × 2
    var S3 = 'p.sketch("Front").circle(0, 0, 1).circle(1, 0, 1).end()';               // two R1 circles 1 apart
    var LENS = 2 * (Math.acos(0.5) - 0.5 * Math.sqrt(0.75));                           // lens area of S3 (r = 1, d = 1)
    function rfCOSketch(code) { var m = K.newModel('t'); K.runScript(m, code); return { model: m, sketch: m.features.filter(function (f) { return f.type === 'sketch'; })[0] }; }
    function rfCOVol(code) { var r = build(code); noErrors(r); return r; }
    function rfCOErr(code) { var r = build(code); var ids = Object.keys(r.errors); assert(ids.length === 1, 'one feature error, got ' + JSON.stringify(r.errors)); return r.errors[ids[0]]; }

    test('rfCO: sketchRegions — a 4 × 2 rect split by a line at x = 1 has two regions (areas 2 and 6, each with a point inside it and no holes); the rect alone has one; a line that ends inside the rect (dangling) splits nothing', function () {
      var R = K.sketchRegions(rfCOSketch(S1).sketch);
      assert(R.length === 2, '2 regions, got ' + R.length);
      near(R[0].area, 2, 1e-9, 'left region area'); near(R[1].area, 6, 1e-9, 'right region area');
      R.forEach(function (r, i) {
        assert(r.index === i && r.loops.length === 1 && !r.loops[0].hole, 'region ' + i + ': one outer loop');
        assert(K.regionAt(rfCOSketch(S1).sketch, r.p) === r, 'region ' + i + ': its point p lies inside it');
      });
      assert(R[0].p[0] > 0 && R[0].p[0] < 1 && R[1].p[0] > 1 && R[1].p[0] < 4, 'points on the right sides of the line: ' + JSON.stringify([R[0].p, R[1].p]));
      assert(K.sketchRegions(rfCOSketch('p.sketch("Front").rect(0, -2, 4, 2).end()').sketch).length === 1, 'the rect alone: one region');
      var D = K.sketchRegions(rfCOSketch('p.sketch("Front").rect(0, -2, 4, 2).line(1, -2, 1, -1).end()').sketch);
      assert(D.length === 1 && Math.abs(D[0].area - 8) < 1e-9, 'a dangling line splits nothing: ' + JSON.stringify(D.map(function (r) { return r.area; })));
      assert(K.regionAt(rfCOSketch(S1).sketch, [9, 9]) === null, 'a point outside every region: null');
      return '2 regions (2 + 6), dangling line ignored';
    });

    test('rfCO: regions of a circle inside a rect are the annulus (outer loop + a hole, area 8 − π/4) and the disk (area π/4, its chords tagged with the circle); two overlapping circles give three regions (crescent, lens, crescent) with the lens area exact', function () {
      var R = K.sketchRegions(rfCOSketch(S2).sketch);
      assert(R.length === 2, '2 regions, got ' + R.length);
      var ann = R.filter(function (r) { return r.loops.length === 2; })[0], disk = R.filter(function (r) { return r.loops.length === 1; })[0];
      assert(ann && disk, 'one region with a hole, one without: ' + JSON.stringify(R.map(function (r) { return r.loops.length; })));
      assert(ann.loops[1].hole && ann.loops[1].seg, 'the hole loop is marked and keeps its curve');
      assert(disk.loops[0].seg && disk.loops[0].seg.every(function (k) { return k >= 0; }), 'every chord of the disk is on the circle');
      near(ann.area + disk.area, 8, 1e-9, 'the two regions make the rect');
      assert(K.regionAt(rfCOSketch(S2).sketch, [2, -1]) === disk && K.regionAt(rfCOSketch(S2).sketch, [0.2, -0.2]) === ann, 'regionAt tells the disk from the annulus');
      var T = K.sketchRegions(rfCOSketch(S3).sketch);
      assert(T.length === 3, '3 regions for two overlapping circles, got ' + T.length);
      var lens = K.regionAt(rfCOSketch(S3).sketch, [0.5, 0]);
      assert(lens && lens.loops.length === 1, 'the lens is a region');
      assert(T.filter(function (r) { return r !== lens; }).every(function (r) { return Math.abs(r.area - T.filter(function (q) { return q !== lens; })[0].area) < 1e-9; }), 'the two crescents are alike');
      return 'annulus + disk, crescent + lens + crescent';
    });

    test('rfCO: Boss-Extrude 0.5 with the left region only → volume 1 · 2 · 0.5 = 1; both regions → 4; no contours → 4 as before (the open line is ignored); the same pick twice counts once', function () {
      nearRel(rfCOVol(S1 + '.extrude(0.5, { contours: [[0.5, -1]] });').mp.volume, 1, 1e-9, 'left region');
      nearRel(rfCOVol(S1 + '.extrude(0.5, { contours: [[0.5, -1], [3, -1]] });').mp.volume, 4, 1e-9, 'both regions');
      nearRel(rfCOVol(S1 + '.extrude(0.5, { contours: [[3, -1], [3.5, -0.5]] });').mp.volume, 3, 1e-9, 'the right region picked twice');
      nearRel(rfCOVol(S1 + '.extrude(0.5);').mp.volume, 4, 1e-9, 'plain extrude unchanged');
      var r = rfCOVol(S1 + '.extrude(0.5, { contours: [[0.5, -1], [3, -1]] });');
      assert(r.mesh.faces.length === 6, 'both regions make one box of 6 faces (the shared edge is gone), got ' + r.mesh.faces.length);
      return 'volumes 1 / 4 / 3 / 4';
    });

    test('rfCO: circle Ø1 in a 4 × 2 rect, depth d = 0.5 — annulus only → (8 − π/4)·d exact, disk only → π/4·d exact; two overlapping R1 circles — the lens only → analytic lens area · d (exact, 1e-6), all three → (2π − lens)·d', function () {
      var d = 0.5;
      var a = rfCOVol(S2 + '.extrude(' + d + ', { contours: [[0.2, -0.2]] });');
      nearRel(a.mp.volume, (8 - Math.PI / 4) * d, 1e-6, 'annulus'); consistentVolume(a);
      var b = rfCOVol(S2 + '.extrude(' + d + ', { contours: [[2, -1]] });');
      nearRel(b.mp.volume, Math.PI / 4 * d, 1e-6, 'disk'); consistentVolume(b);
      var c = rfCOVol(S3 + '.extrude(' + d + ', { contours: [[0.5, 0]] });');
      nearRel(c.mp.volume, LENS * d, 1e-6, 'lens'); consistentVolume(c);
      var e = rfCOVol(S3 + '.extrude(' + d + ', { contours: [[-0.5, 0]] });');
      nearRel(e.mp.volume, (Math.PI - LENS) * d, 1e-6, 'left crescent');
      var f = rfCOVol(S3 + '.extrude(' + d + ', { contours: [[-0.5, 0], [0.5, 0], [1.5, 0]] });');
      nearRel(f.mp.volume, (2 * Math.PI - LENS) * d, 1e-6, 'all three regions');
      // a line through a circle at 30°: its ends sit on the true circle, off the chords — still a T-junction, two halves
      var h = rfCOVol('p.sketch("Front").circle(0, 0, 1).line(-Math.cos(Math.PI / 6), -0.5, Math.cos(Math.PI / 6), 0.5).end().extrude(1, { contours: [[0, 0.5]] });');
      nearRel(h.mp.volume, Math.PI / 2, 1e-6, 'half disk (line ends on the true circle between chord vertices)');
      return 'annulus, disk, lens, crescent, half disk exact';
    });

    test('rfCO: a Cut-Extrude through all with one region cuts only that region (4 × 2 × 1 block − the right 3 × 2 → 2); Revolve with one region of a split rect gives π(2² − 1²)·1', function () {
      var r = rfCOVol('p.sketch("Front").rect(0, -2, 4, 2).end().extrude(1);\np.sketch("Front", 1).rect(0, -2, 4, 2).line(1, -2, 1, 0).end().cut("through", { contours: [[3, -1]], reverse: true });');
      nearRel(r.mp.volume, 2, 1e-9, 'block minus the right region');
      var v = rfCOVol('p.sketch("Front").rect(1, 0, 2, 1).line(2, 0, 2, 1).end().revolve(360, { contours: [[1.5, 0.5]] });');
      nearRel(v.mp.volume, Math.PI * 3, 1e-6, 'revolved inner region');
      return 'cut 2, revolve 3π';
    });

    test('rfCO: a pick that falls in no region errors the feature (red, never a silent full-sketch extrude): outside the sketch, and after a sketch edit moved the region away; an edit that keeps the pick inside its region rebuilds that region', function () {
      var msg = rfCOErr(S1 + '.extrude(0.5, { contours: [[9, 9]] });');
      assert(/no longer inside a closed sketch region/.test(msg), 'error text: ' + msg);
      var r = rfCOVol(S1 + '.extrude(0.5, { contours: [[0.5, -1]] });'), m = r.model, sk = m.features[0], line = sk.entities[1];
      line.x1 = 1.5; line.x2 = 1.5;   // the line moves right: the pick at u = 0.5 is still in the left region, now 1.5 wide
      var b2 = K.rebuild(m);
      assert(!Object.keys(b2.errors).length, 'no error after the edit: ' + JSON.stringify(b2.errors));
      nearRel(K.massProps(K.meshFromBody(b2.body), m.density).volume, 1.5, 1e-9, 'the left region, now 1.5 × 2 × 0.5');
      sk.entities[0].x = 1; sk.entities[0].w = 3; line.x1 = 2; line.x2 = 2;   // the rect now starts at x = 1: the pick at 0.5 is outside everything
      var b3 = K.rebuild(m);
      assert(b3.errors[m.features[1].id] && /no longer inside/.test(b3.errors[m.features[1].id]), 'the feature errors: ' + JSON.stringify(b3.errors));
      assert(!b3.body || K.massProps(K.meshFromBody(b3.body), m.density).volume < 1e-9, 'no silent full-sketch extrude');
      return 'errors outside, follows the region, errors when the region leaves the pick';
    });

    test('rfCO: generateScript writes the option (`contours: [[0.5,-1]]`, 1e-4 rounding) for extrude, cut and revolve, the script rebuilds to the same volume, and the model JSON keeps it', function () {
      var r = rfCOVol(S1 + '.extrude(0.5, { contours: [[0.5, -1.00004]] });'), s = K.generateScript(r.model);
      assert(s.indexOf('p.extrude(0.5, { sketch: f1, name: "Boss-Extrude1", contours: [[0.5,-1]] })') >= 0, 'script line: ' + s.split('\n').pop());
      var m2 = K.newModel('t2'); K.runScript(m2, s);
      var b2 = K.rebuild(m2);
      nearRel(K.massProps(K.meshFromBody(b2.body), m2.density).volume, 1, 1e-9, 'the regenerated script builds the same region');
      var m3 = JSON.parse(JSON.stringify(r.model)), b3 = K.rebuild(m3);
      assert(JSON.stringify(m3.features[1].contours) === '[[0.5,-1.00004]]', 'JSON keeps the picks as saved: ' + JSON.stringify(m3.features[1].contours));
      nearRel(K.massProps(K.meshFromBody(b3.body), m3.density).volume, 1, 1e-9, 'the JSON copy builds the same region');
      var c = rfCOVol('p.sketch("Front").rect(0, -2, 4, 2).end().extrude(1);\np.sketch("Front", 1).rect(0, -2, 4, 2).line(1, -2, 1, 0).end().cut("through", { contours: [[3, -1]], reverse: true });');
      assert(/p\.cut\(0, \{ [^\n]*contours: \[\[3,-1\]\] \}\)/.test(K.generateScript(c.model)), 'cut script carries contours');
      var v = rfCOVol('p.sketch("Front").rect(1, 0, 2, 1).line(2, 0, 2, 1).end().revolve(360, { contours: [[1.5, 0.5]] });');
      assert(/p\.revolve\(360, \{ [^\n]*contours: \[\[1.5,0.5\]\] \}\)/.test(K.generateScript(v.model)), 'revolve script carries contours');
      assert(K.generateScript(rfCOVol(S1 + '.extrude(0.5);').model).indexOf('contours') < 0, 'no option without picks');
      return 'script and JSON round-trip';
    });

    test('rfCO: regionsAmbiguous — true for the split rect (an open line bounds regions) and for two crossing circles, false for a plain rect, a rect with a hole and two separate rects', function () {
      assert(K.regionsAmbiguous(rfCOSketch(S1).sketch) === true, 'split rect');
      assert(K.regionsAmbiguous(rfCOSketch(S3).sketch) === true, 'overlapping circles');
      assert(K.regionsAmbiguous(rfCOSketch('p.sketch("Front").line(0, 0, 4, 0).line(4, 0, 4, 2).line(4, 2, 0, 2).line(0, 2, 0, 0).line(1, 0, 1, 2).end()').sketch) === true, 'four lines + a splitter');
      assert(K.regionsAmbiguous(rfCOSketch('p.sketch("Front").rect(0, -2, 4, 2).end()').sketch) === false, 'plain rect');
      assert(K.regionsAmbiguous(rfCOSketch(S2).sketch) === false, 'rect with a hole');
      assert(K.regionsAmbiguous(rfCOSketch('p.sketch("Front").rect(0, 0, 1, 1).rect(2, 0, 1, 1).end()').sketch) === false, 'two separate rects');
      return 'ambiguous only when a plain extrude would not take every region';
    });
  })();
