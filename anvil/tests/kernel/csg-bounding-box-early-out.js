  // ------------------------------------------------------------------ CSG bounding-box early-out
  // csg.js skips BSP clipping for polygons whose bounding box cannot touch the other operand (kept as they are for
  // union and for A in subtract, dropped for B in subtract and for both in intersect) and short-circuits fully
  // disjoint operands. None of that may change a volume; these tests pin the numbers the old kernel produced.
  group('csg early-out');
  test('getBounds() of a cube is its axis-aligned box', function () {
    var c = cube(0, 0, 0, 5);
    assert(typeof c.getBounds === 'function', 'CSG.prototype.getBounds is missing');
    var bb = c.getBounds();
    assert(bb && bb.min && bb.max && bb.min.length === 3 && bb.max.length === 3, 'getBounds() must return { min: [x, y, z], max: [x, y, z] }, got ' + JSON.stringify(bb));
    nearVec(bb.min, [-5, -5, -5], 1e-9, 'min'); nearVec(bb.max, [5, 5, 5], 1e-9, 'max');
    return bboxStr(bb);
  });
  test('disjoint cubes: union 2000, subtract 1000, intersect 0, union keeps all 12 quads unsplit', function () {
    var a = cube(0, 0, 0, 5), b = cube(50, 0, 0, 5);
    var u = a.union(b);
    near(u.volume(), 2000, 1e-9, 'union volume');
    near(a.subtract(b).volume(), 1000, 1e-9, 'subtract volume');
    near(a.intersect(b).volume(), 0, 1e-9, 'intersect volume');
    near(b.subtract(a).volume(), 1000, 1e-9, 'subtract the other way');
    assert(u.polygons.length === 12, 'union of two far-apart cubes should keep 6 + 6 quads, got ' + u.polygons.length);
    var bb = u.getBounds();
    nearVec(bb.min, [-5, -5, -5], 1e-9, 'union bounds min'); nearVec(bb.max, [55, 5, 5], 1e-9, 'union bounds max');
    // the union is a proper solid: the mesh agrees with the polygon volume
    near(K.massProps(K.meshFromBody(u), 1).volume, 2000, 1e-6, 'mesh volume');
    return u.polygons.length + ' polygons, bounds ' + bboxStr(bb);
  });
  test('far boss on a plate with a distant hole: volume and centroid are analytic', function () {
    // plate x ∈ [0,100], y ∈ [0,60], z ∈ [0,2]; Ø5 hole at (10,10) through; 10×10×10 boss at (80,40) on the top face
    var r = build('p.sketch("Front").rect(0, 0, 100, 60).extrude(2);\n' +
      'p.hole("Front", 10, 10, 5, { offset: 2 });\n' +
      'p.sketch("Front", 2).rect(80, 40, 10, 10).extrude(10);');
    noErrors(r);
    var A = circleArea(2.5), V = 12000 - 2 * A + 1000;
    nearRel(r.body.volume(), 12000 - 2 * polyCircleArea(2.5) + 1000, 1e-9, 'polygon volume');
    nearRel(r.mp.volume, V, 1e-9, 'mesh volume (exact hole)');
    var cx = (50 * 12000 - 10 * 2 * A + 85 * 1000) / V, cy = (30 * 12000 - 10 * 2 * A + 45 * 1000) / V, cz = (1 * 12000 - 1 * 2 * A + 7 * 1000) / V;
    nearVec(r.mp.centroid, [cx, cy, cz], 1e-6, 'centroid');
    nearVec(r.mp.bbox.min, [0, 0, 0], 1e-6, 'bbox.min'); nearVec(r.mp.bbox.max, [100, 60, 12], 1e-6, 'bbox.max');
    return 'volume ' + fmt(V) + ', centroid ' + r.mp.centroid.map(fmt).join(', ');
  });
  test('cubes sharing a face (touching bboxes) still union to 2000', function () {
    var a = cube(0, 0, 0, 5), b = cube(10, 0, 0, 5);
    near(a.union(b).volume(), 2000, 1e-9, 'union');
    near(a.subtract(b).volume(), 1000, 1e-9, 'subtract');
    near(a.intersect(b).volume(), 0, 1e-9, 'intersect');
    near(K.massProps(K.meshFromBody(a.union(b)), 1).volume, 2000, 1e-6, 'mesh volume of the union');
  });
  test('cubes overlapping by 1: union 1900, intersect 100, subtract 900', function () {
    var a = cube(0, 0, 0, 5), b = cube(9, 0, 0, 5);
    near(a.union(b).volume(), 1900, 1e-9, 'union');
    near(a.intersect(b).volume(), 100, 1e-9, 'intersect');
    near(a.subtract(b).volume(), 900, 1e-9, 'subtract');
    near(b.subtract(a).volume(), 900, 1e-9, 'subtract the other way');
  });
  test('early-out where one operand is entirely inside the other', function () {
    var big = cube(0, 0, 0, 10), small = cube(0, 0, 0, 2);
    near(big.union(small).volume(), 8000, 1e-9, 'union');
    near(big.subtract(small).volume(), 8000 - 64, 1e-9, 'subtract (cavity)');
    near(big.intersect(small).volume(), 64, 1e-9, 'intersect');
    near(small.subtract(big).volume(), 0, 1e-9, 'small minus big');
  });
  test('early-out result packs and unpacks: volume identical, pointTester works in both cubes', function () {
    var u = cube(0, 0, 0, 5).union(cube(50, 0, 0, 5));
    var back = CSG.unpack(u.pack());
    near(back.volume(), u.volume(), 1e-12, 'volume after pack/unpack');
    assert(back.polygons.length === u.polygons.length, 'polygon count ' + back.polygons.length + ' vs ' + u.polygons.length);
    var inside = back.pointTester();
    assert(inside([0, 0, 0]) === true, '(0,0,0) should be inside the first cube');
    assert(inside([50, 1, 1]) === true, '(50,1,1) should be inside the second cube');
    assert(inside([25, 0, 0]) === false, '(25,0,0) is between the cubes');
    assert(inside([0, 0, 20]) === false, '(0,0,20) is outside');
    var t2 = u.pointTester();
    assert(t2([0, 0, 0]) && t2([50, 0, 0]) && !t2([25, 0, 0]), 'pointTester on the un-packed union');
  });
  test('a subtract whose tool misses the body leaves the body polygons intact', function () {
    var r = build('p.box(20, 20, 10);\np.sketch("Top", 10).rect(100, -100, 5, 5).cut("through", { reverse: true });');
    // the kernel warns about the empty cut; the body must be unchanged
    near(r.body.volume(), 4000, 1e-9, 'volume');
    var r0 = build('p.box(20, 20, 10);'); // the tool box is disjoint, so the subtract short-circuits and nothing is split
    assert(r.body.polygons.length === r0.body.polygons.length, 'box should keep its ' + r0.body.polygons.length + ' polygons, got ' + r.body.polygons.length);
  });
  // Every Design Library part must build to exactly the volume it had before the early-out. Values are pinned
  // where they are analytic (polygonal circles use polyCircleArea, as the kernel does); entries at null are
  // recorded under window.__anvilVolumes; the numbers below were measured by the head with the old (pre-early-out) csg.js at commit 3b5f6d6:
  // copy the output of window.__anvilVolumesJS() into EXPECTED_VOLUMES.
  function legacyCircleArea(r) { var n = legacySegs(r); return n / 2 * r * r * Math.sin(2 * Math.PI / n); }
  var EXPECTED_VOLUMES = {
    'Plate with bolt holes': 100 * 60 * 8 - 4 * legacyCircleArea(4) * 8,
    'L-bracket': 20510.16520657268,
    'Bushing': 11029.985347363243,
    'Flange': 12 * legacyCircleArea(60) + 4 * legacyCircleArea(35) - 16 * legacyCircleArea(25) - 6 * 12 * legacyCircleArea(5.5),
    'Hex nut': 2311.7861132622634,
    'Shaft with keyway': 40081.63430437458,
    'Pulley': 82472.75250921662,
    'Enclosure lid': 31747.799209639525,
    'Mirrored clevis': 40109.90683139952,
    'Sheet-metal U-bracket': 23862.694338157933,
    'Tray': 35750.4546182302,
    'Normal Cut Bracket': 15780.118294909678,
    'Chamfered block': 96398.42743159662,   // rfFM (2026-10-29): exact; the old pin counted the chamfer-notched R6 facets as full cylinder
    'Rounded handle': 30673.638463025945,   // rfFF: the root fillet is a revolved torus patch (a chain of cylinder pieces gave 30674.73950036209)
    'Mug': 84806.88290263337,
    'Funnel': 12160.516094319566, // run cloud-2026-09-25g: hull loft; equals the independent slice integral of the 1.5 mm offset in group "mesh quality" (was 12268.395 on the resampled loft)
    'Handlebar': 46838.66040500728,
    'Moulded cap': 13443.22758936501,
    'Parametric plate': 120 * 80 * 8 - 8 * (4 * legacyCircleArea(4) + 3 * legacyCircleArea(2)), // equations example (run 2026-09-25T15): plate − 4 Ø8 − 3 Ø4 through holes
    'Two-body clamp': 28348.648367502657, // multi-body example (run 2026-09-22T20b): base + cap − two Ø6 holes in the cap − R3 fillet on the base
    'Configured spacer': 80 * 40 * 10 - 3 * 10 * 20 * 5, // configurations example (run 2026-09-25): Medium, the scripted active configuration; every configuration is checked in group "configurations"
    'Spur gear (12 teeth)': 18877.16891755744,
    // assembly example (run cloud-2026-09-25c): plate + two Ø8 × 20 pins + a 30 × 20 × 5 cap; bodies are kept apart, so the volumes add
    'Pinned plate assembly': 100 * 60 * 8 - 4 * legacyCircleArea(4) * 8 + 2 * legacyCircleArea(4) * 20 + 30 * 20 * 5,
    // assembly examples (run cloud-2026-09-25e): Distance / Angle mates (nothing overlaps) and the Interference check
    // (overlapping components, whose volumes still add)
    'Distance and angle mates': 100 * 60 * 10 + 20 * 20 * 20 + 40 * 4 * 10,
    'Interference check': 60 * 40 * 10 + 20 * 20 * 20 + 2 * legacyCircleArea(4) * 20
  };
  // per-part tolerance where the pinned value is a large union of slabs (default 1e-6)
  var EXPECTED_TOL = {};
  window.__anvilVolumes = {};
  window.__anvilVolumesJS = function () {
    return Object.keys(window.__anvilVolumes).map(function (k) { return '    ' + JSON.stringify(k) + ': ' + window.__anvilVolumes[k]; }).join(',\n');
  };
  if (typeof AnvilExamples !== 'undefined') {
    AnvilExamples.forEach(function (ex) {
      // The pins are polygonal volumes: since true curves (cloud-2026-09-25p) they are checked on the legacy
      // tessellation, where every example must still rebuild to exactly the same mesh volume.
      test('same volume as before the early-out: ' + ex.name, function () {
        return withLegacy(function () {
          var r = buildExample(ex);
          noErrors(r);
          var v = r.body.volume();
          window.__anvilVolumes[ex.name] = v;
          assert(isFinite(v) && v > 0, 'volume must be finite and positive, got ' + v);
          nearRel(polyVol(r.mp), v, 1e-6, 'mesh volume vs polygon volume');
          var expected = EXPECTED_VOLUMES[ex.name];
          if (expected == null) return 'volume ' + v + ' (not pinned yet; add it to EXPECTED_VOLUMES)';
          nearRel(v, expected, EXPECTED_TOL[ex.name] || 1e-6, 'volume vs the pinned value');
          return 'legacy volume ' + fmt(v) + ' = pinned';
        });
      });
    });
    // True curves: every example made only of extrudes, revolves, holes, patterns, mirrors, sheet metal and chamfers
    // has an exact volume, independent of the tessellation (default chord tolerance vs 0.01 mm vs legacy, 1e-11);
    // where the part is a plate with round holes the value is the formula itself (1e-12). Fillets, sweeps, lofts and
    // shells of round faces are still polygonal: those examples only have to stay within 1 % of their legacy pin.
    var EXACT_VOLUMES = {
      'Plate with bolt holes': 100 * 60 * 8 - 4 * circleArea(4) * 8,
      // rfFF: plate − mitred 1 mm chamfers (centroid path 4 × (40 − 2/3)) + post + R3 root fillet ring (Pappus) + grip
      'Rounded handle': 9600 - 0.5 * (160 - 8 / 3) + 30 * circleArea(8) + 2 * Math.PI * (8 + (10 - 3 * Math.PI) / (4 - Math.PI)) * 9 * (1 - Math.PI / 4) + 12 * circleArea(18) + 2 * Math.PI * (18 + 4 / 3) * 24,
      'Flange': 12 * circleArea(60) + 4 * circleArea(35) - 16 * circleArea(25) - 6 * 12 * circleArea(5.5),
      'Parametric plate': 120 * 80 * 8 - 8 * (4 * circleArea(4) + 3 * circleArea(2)),
      'Configured spacer': 80 * 40 * 10 - 3 * 10 * 20 * 5,
      'Pinned plate assembly': 100 * 60 * 8 - 4 * circleArea(4) * 8 + 2 * circleArea(4) * 20 + 30 * 20 * 5,
      'Distance and angle mates': 100 * 60 * 10 + 20 * 20 * 20 + 40 * 4 * 10,
      'Interference check': 60 * 40 * 10 + 20 * 20 * 20 + 2 * circleArea(4) * 20
    };
    var POLYGONAL_FEATURES = { 'Hex nut': 1, 'Shaft with keyway': 1,'Mug': 1, 'Funnel': 1, 'Handlebar': 1, 'Moulded cap': 1, 'Spur gear (12 teeth)': 1 };
    AnvilExamples.forEach(function (ex) {
      test('exact volume of the true curves: ' + ex.name, function () {
        var r = buildExample(ex);
        noErrors(r);
        var v = r.mp.volume, legacy = withLegacy(function () { return buildExample(ex).body.volume(); });
        if (EXACT_VOLUMES[ex.name] != null) nearRel(v, EXACT_VOLUMES[ex.name], 1e-12, 'volume vs the formula');
        if (POLYGONAL_FEATURES[ex.name]) {
          nearRel(v, legacy, 0.01, 'volume vs the legacy polygonal volume');
          return 'volume ' + fmt(v) + ' (polygonal features: ' + ((v - legacy) / legacy * 100).toFixed(3) + ' % from the legacy mesh)';
        }
        var fine = K.setTessellation({ chordTol: 0.01 }), vf;
        try { vf = buildExample(ex).mp.volume; } finally { K.setTessellation('default'); }
        var vl = withLegacy(function () { return buildExample(ex).mp.volume; });
        nearRel(vf, v, 1e-11, 'volume at chord tolerance 0.01');
        nearRel(vl, v, 1e-11, 'volume on the legacy mesh');
        return 'volume ' + fmt(v) + ', the same on three tessellations';
      });
    });
  }

