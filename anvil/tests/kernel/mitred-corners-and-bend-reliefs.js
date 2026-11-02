  // ------------------------------------------------------------------ mitred corners and bend reliefs
  group('miter & relief');
  // The o >= 0 part of the profile loop buildFlange extrudes along an edge (o = outward across the edge, up = along
  // the fold). buildFlange also prepends/appends an overlap strip at o in [-ov, 0] that lies inside the sheet and so
  // adds nothing to the union; it is left out here so area and moment describe the material actually added.
  function flangeProfile(A, R, T, L) {
    var segs = Math.max(4, Math.round(8 * A / (Math.PI / 2)));
    var inner = [], outer = [];
    for (var s = 0; s <= segs; s++) {
      var th = A * s / segs;
      inner.push([R * Math.sin(th), R - R * Math.cos(th)]);
      outer.push([(R + T) * Math.sin(th), R - (R + T) * Math.cos(th)]);
    }
    var tx = Math.cos(A), ty = Math.sin(A);
    var iEnd = [inner[segs][0] + tx * L, inner[segs][1] + ty * L], oEnd = [outer[segs][0] + tx * L, outer[segs][1] + ty * L];
    return inner.concat([iEnd, oEnd], outer.slice().reverse()); // inner[0] = [0, 0], outer[0] = [0, -T]: closed at o = 0
  }
  // shoelace area and first moment about o = 0 (mx = ∫∫ o dA), made positive whatever the loop orientation
  function polyMoments(pts) {
    var a = 0, mx = 0;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length];
      var c = p[0] * q[1] - q[0] * p[1];
      a += c; mx += (p[0] + q[0]) * c;
    }
    a /= 2; mx /= 6;
    return a < 0 ? { area: -a, mx: -mx } : { area: a, mx: mx };
  }
  function mitreFaceIndex(mesh, n) { // a mesh face whose normal is ±n (n unit)
    for (var i = 0; i < mesh.faces.length; i++) {
      var f = mesh.faces[i].normal, d = f[0] * n[0] + f[1] * n[1] + f[2] * n[2];
      if (Math.abs(Math.abs(d) - 1) < 1e-3) return i;
    }
    return -1;
  }
  var PROF = polyMoments(flangeProfile(Math.PI / 2, 2, 2, 20)); // { area, mx } of the 90° R2 T2 L20 profile
  // lane flanges: SolidWorks' auto miter (M03, M24; its gap, default 0.25 mm here, none = default) stops both walls
  // square, gap/√2 short of the other's inside face; here (Bend Outside, R = T = 2) that is d = R − gap/√2 past the corner.
  // Each bend tapers from the base corner at its start to the wall's end at its end, so it gains d/2 of its section.
  // These tests held the old bisector mitre (2 × the first moment of the section, 45° faces), which SolidWorks does not make.
  var MITER_S = Math.PI / 4 * 12, MITER_W = 20 * 2;   // exact bend section, wall section
  function miterAdds(g) { return (MITER_S / 2 + MITER_W) * (2 - g / Math.SQRT2); }
  test('mitred square corner: each wall runs R − gap/√2 past the corner and its bend tapers to it (SolidWorks: Butt, bend closed)', function () {
    var one = build(SHEET + '\np.flange(20, [[0, 2, 30]]);');
    noErrors(one);
    nearRel(polyVol(one.mp) - 12000, PROF.area * 60, 1e-6, 'one flange = profile area × edge length');
    var two = build(SHEET + '\np.flange(20, [[0, 2, 30], [50, 2, 0]]);');
    var mit = build(SHEET + '\np.flange(20, [[0, 2, 30], [50, 2, 0]], { miter: true });');
    noErrors(two); noErrors(mit);
    var f = mit.model.features[mit.model.features.length - 1];
    assert(f.type === 'flange' && f.miter === true, 'miter flag stored: ' + JSON.stringify(f));
    nearRel(mit.mp.volume - two.mp.volume, 2 * miterAdds(0.25), 1e-6, 'both flanges run on past the corner');
    nearVec(mit.mp.bbox.min, two.mp.bbox.min, 1e-6, 'bbox.min unchanged'); nearVec(mit.mp.bbox.max, two.mp.bbox.max, 1e-6, 'bbox.max unchanged');
    consistentVolume(mit);
    var rev = build(SHEET + '\np.flange(20, [[50, 2, 0], [0, 2, 30]], { miter: true });');
    noErrors(rev);
    nearRel(rev.mp.volume, mit.mp.volume, 1e-9, 'pick order does not matter');
    return 'corner adds ' + fmt(mit.mp.volume - two.mp.volume);
  });
  test('a mitre gap of its own: both walls stop square gap/√2 short of the other\'s inside face, no 45° face', function () {
    var mit = build(SHEET + '\np.flange(20, [[0, 2, 30], [50, 2, 0]], { miter: true });');
    var gap = build(SHEET + '\np.flange(20, [[0, 2, 30], [50, 2, 0]], { miter: true, miterGap: 1 });');
    noErrors(mit); noErrors(gap);
    var removed = mit.mp.volume - gap.mp.volume;
    nearRel(removed, 2 * (miterAdds(0.25) - miterAdds(1)), 1e-6, 'the gap removes material');
    var s = Math.SQRT1_2, ins = gap.body.pointTester(), d = 2 - Math.SQRT1_2;
    assert(mitreFaceIndex(gap.mesh, [s, 0, -s]) < 0, 'no face on the bisector plane x = z');
    assert(ins([-3, 12, 0.01 - d]) && !ins([-3, 12, -0.01 - d]), 'the x = −3 wall stops at z = ' + (-d));
    consistentVolume(gap);
    return 'gap removed ' + fmt(removed);
  });
  test('three mitred edges around the sheet: two closed corners, one feature', function () {
    var plain = build(SHEET + '\np.flange(20, [[50, 2, 0], [100, 2, 30], [50, 2, 60]]);');
    var mit = build(SHEET + '\np.flange(20, [[50, 2, 0], [100, 2, 30], [50, 2, 60]], { miter: true });');
    noErrors(plain); noErrors(mit);
    nearRel(polyVol(plain.mp) - 12000, PROF.area * (100 + 60 + 100), 1e-6, 'three plain flanges');
    nearRel(mit.mp.volume - plain.mp.volume, 4 * miterAdds(0.25), 1e-6, 'two corners, two walls each');
    consistentVolume(mit);
  });
  // L-shaped sheet on Top (v → −z): x ∈ [0,100] for z ∈ [−30, 0] plus x ∈ [0,60] for z ∈ [−60, −30]; area 4800
  var LSHEET = 'p.sheet(2, 2, 0.71);\np.sketch("Top").polyline([[0, 0], [100, 0], [100, 30], [60, 30], [60, 60], [0, 60]], true).end().baseFlange(2);';
  test('bend relief at a concave corner is a full-thickness slot cut from the base before the flange', function () {
    var base = build(LSHEET);
    noErrors(base);
    near(base.mp.volume, 9600, 1e-6, 'L plate volume');
    // flange on the notch edge x = 60, z ∈ [−60, −30]: the z = −60 end is a convex corner (no relief), the z = −30 end
    // runs into the wider part of the plate (relief). Slot: 2 along the edge beyond the end, o ∈ [−1, R + T + 1] = 6 across → 24
    var none = build(LSHEET + '\np.flange(10, [[60, 2, -45]]);');
    var rect = build(LSHEET + '\np.flange(10, [[60, 2, -45]], { relief: "rect", reliefWidth: 2, reliefDepth: 1 });');
    noErrors(none); noErrors(rect);
    var F = polyVol(none.mp) - 9600;   // the faceted section (flangeProfile); mp.volume is the exact one (lane FX)
    nearRel(F, polyMoments(flangeProfile(Math.PI / 2, 2, 2, 10)).area * 30, 1e-6, 'flange volume without relief');
    var f = rect.model.features[rect.model.features.length - 1];
    assert(f.relief === 'rect' && f.reliefWidth === 2 && f.reliefDepth === 1, 'relief fields stored: ' + JSON.stringify(f));
    nearRel(polyVol(rect.mp), 9600 - 24 + F, 1e-6, 'volume = plate − slot + flange');
    consistentVolume(rect);
    var ob = build(LSHEET + '\np.flange(10, [[60, 2, -45]], { relief: "obround", reliefWidth: 2, reliefDepth: 1 });');
    noErrors(ob);
    var removedOb = 9600 + F - ob.mp.volume;
    // rounding the inner end of a 2-wide slot trades a 2 × 1 end for a semicircle of radius 1 (or both ends): between
    // 24 − 2·(2 − π/2)·2 (both ends) and 24, with a 5 % margin on the low side
    assert(removedOb < 24 - 1e-6, 'obround removes less than the rectangle: ' + removedOb);
    assert(removedOb > (24 - 2 * 2 * (2 - Math.PI / 2)) * 0.95, 'obround removes too little: ' + removedOb);
    consistentVolume(ob);
    var flat = K.flatPattern(rect.model, rect.build, rect.mesh), BA = K.bendAllowance(Math.PI / 2, 2, 2, 0.71);
    assert(flat.bends.length === 1, 'bends = ' + flat.bends.length);
    // the relief shows in the blank either as a notch in the outline or as a slot loop touching the strip
    assert(flat.loops[0].length >= 10 || flat.loops.length >= 2, 'relief missing from the flat: ' + flat.loops.length + ' loops, outer ' + flat.loops[0].length + ' points');
    var blank = flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? K.signedArea(l) : -Math.abs(K.signedArea(l))); }, 0);
    // (2026-10-07: the flat's relief clears the whole bend allowance, o ∈ [−1, max(BA, R + T) + 1], not just the solid's
    // slot to R + T + 1: BA = 5.372 > R + T = 4 here, so the blank's notch is 2 × (BA + 2) instead of 2 × 6)
    near(blank, 4800 - 2 * (1 + Math.max(BA, 4) + 1) + 30 * (BA + 10), 1e-6, 'blank area = plate − relief + strip');
    return 'rect slot ' + fmt(9600 + F - rect.mp.volume) + ', obround ' + fmt(removedOb) + ', blank ' + fmt(blank);
  });
  test('no relief is cut at a convex sheet corner', function () {
    var plain = build(SHEET + '\np.flange(20, [[0, 2, 30]]);');
    var rel = build(SHEET + '\np.flange(20, [[0, 2, 30]], { relief: "rect" });');
    noErrors(plain); noErrors(rel);
    nearRel(rel.mp.volume, plain.mp.volume, 1e-9, 'volume unchanged');
    nearVec(rel.mp.bbox.min, plain.mp.bbox.min, 1e-9, 'bbox.min'); nearVec(rel.mp.bbox.max, plain.mp.bbox.max, 1e-9, 'bbox.max');
  });
  test('miter and relief options survive a script round-trip and only non-defaults are emitted', function () {
    var code = SHEET + '\np.flange(20, [[0, 2, 30], [50, 2, 0]], { miter: true, miterGap: 0.5, relief: "obround", reliefWidth: 3 });';
    var lines = roundTrip(code);
    var script = K.generateScript(build(code).model), last = script.split('\n').pop();
    assert(/miter: true/.test(last), 'miter emitted: ' + last);
    assert(/miterGap: 0\.5/.test(last), 'miterGap emitted: ' + last);
    assert(/relief: ["']obround["']/.test(last), 'relief emitted: ' + last);
    assert(/reliefWidth: 3/.test(last), 'reliefWidth emitted: ' + last);
    assert(last.indexOf('reliefDepth') < 0, 'default reliefDepth must not be emitted: ' + last);
    assert(K.generateScript(build(script).model) === script, 'round-trip fixed point');
    var plain = K.generateScript(build(SHEET + '\np.flange(20, [[0, 2, 30]]);').model).split('\n').pop();
    assert(!/miter|relief/.test(plain), 'defaults are silent: ' + plain);
    return lines;
  });
  test('flat pattern of a mitred corner: a square notch at the wall ends, as SolidWorks (M03): every strip stays square out to its wall\'s end line', function () {
    // Top frame: sketch x = X, sketch y = -Z. The x = 0 edge (z in [0, 60]) unfolds to sketch x < 0, the z = 0 edge
    // (x in [0, 100]) unfolds to sketch y > 0; the shared corner (0, 2, 0) is sketch (0, 0). The walls end d past it, so the
    // notch's corner is (−d, d) and the old mitre's trapezoid strips (base corner (0, 0) a vertex of the outline) are gone.
    var r = build(SHEET + '\np.flange(20, [[0, 2, 30], [50, 2, 0]], { miter: true });');
    noErrors(r);
    var L = 20, BA = K.bendAllowance(Math.PI / 2, 2, 2, 0.71), d = 2 - 0.25 / Math.SQRT2;
    var flat = K.flatPattern(r.model, r.build, r.mesh);
    assert(flat.loops.length === 1, 'one outline loop, got ' + flat.loops.length);
    assert(flat.bends.length === 2, 'two bends, got ' + flat.bends.length);
    var outer = flat.loops[0];
    assert(K.signedArea(outer) > 0, 'outer loop is CCW');
    function hasVertex(loop, p, tol) { return loop.some(function (q) { return Math.hypot(q[0] - p[0], q[1] - p[1]) <= tol; }); }
    function show(loop) { return loop.map(function (q) { return '(' + fmt(q[0]) + ', ' + fmt(q[1]) + ')'; }).join(' '); }
    assert(outer.length === 6, 'six corners: ' + show(outer));
    [[-d, d], [-d, BA + L], [-(BA + L), d], [100, BA + L], [100, -60], [-(BA + L), -60]].forEach(function (p) { assert(hasVertex(outer, p, 1e-6), 'corner ' + p + ' of ' + show(outer)); });
    near(K.signedArea(outer), (100 + BA + L) * (60 + BA + L) - (BA + L - d) * (BA + L - d), 1e-6, 'blank area');
    near(flat.bbox.max[0] - flat.bbox.min[0], 100 + BA + L, 1e-6, 'flat width');
    near(flat.bbox.max[1] - flat.bbox.min[1], 60 + BA + L, 1e-6, 'flat height');
    return 'blank ' + fmt(K.signedArea(outer)) + ', ' + outer.length + ' outline points';
  });
  test('Material Outside flanges on two edges that share a corner unfold into one blank with two bends', function () {
    // Sheet on Top: rect(0, 0, 100, 60) → x ∈ [0,100], y ∈ [0,2], z ∈ [−60,0] (Top sketch v maps to −z). Flange 1 on the
    // x = 100 edge, flange 2 on the z = 0 edge, both Material Outside (the wall's inner face at the edge), so each one
    // trims the base back by R = 2 before its bend takes that strip's place. Two separate features, no mitre.
    var r = build('p.sheet(2, 2, 0.71);\np.sketch("Top").rect(0, 0, 100, 60);\np.baseFlange(2);\n' +
      'p.flange(20, [[100, 2, -30]], { position: "outside" });\np.flange(20, [[50, 2, 0]], { position: "outside" });');
    noErrors(r);
    var R = 2, T = 2, L = 20, BA = K.bendAllowance(Math.PI / 2, R, T, 0.71);
    // envelope: Material Outside keeps the base dimensions, the walls' outer faces are T beyond the edges
    near(r.mp.bbox.max[0], 100 + T, 1e-6, 'wall 1 outer face at x = 100 + T');
    near(r.mp.bbox.max[2], 0 + T, 1e-6, 'wall 2 outer face at z = 0 + T');
    near(r.mp.bbox.max[1], 2 + R + L, 1e-6, 'wall tops at edge + R + L');
    assert(r.mp.volume > 12000, 'two 20 mm walls add far more than the two R-wide trims remove: ' + fmt(r.mp.volume));
    var flat = K.flatPattern(r.model, r.build, r.mesh);
    assert(flat.bends.length === 2, 'two bends expected, got ' + flat.bends.length + ': ' + JSON.stringify(flat.bends.map(function (b) { return b.label; })));
    assert(flat.loops.length === 1, 'one outline loop, got ' + flat.loops.length);
    var area = K.signedArea(flat.loops[0]);
    assert(area > 6000, 'the blank (' + fmt(area) + ') must be larger than the 100 × 60 base');
    // Derivation. Flange 1 trims x ∈ [98,100] off the base along its whole edge (z ∈ [−60,0]); flange 2 is placed on
    // the z = 0 edge of the flat face that is left, which now runs x ∈ [0,98], and trims z ∈ [−2,0] there. Flat face
    // after both trims: 98 × 58 = 5684. Flange 1 unfolds along its 60 mm edge as a strip BA + L wide, flange 2 along
    // its 98 mm edge: 60·(BA + L) + 98·(BA + L) with BA = π/2·(R + K·T) = π/2·3.42 = 5.3721. Total 9692.79. The two
    // strips do not overlap (flange 2's region stops at x = 98 where flange 1's strip begins). The kernel lane reports
    // its own number for this corner; the head reconciles the constant if the derivations differ (tolerance 1e-3).
    var expected = 98 * 58 + 60 * (BA + L) + 98 * (BA + L);   // = 9692.7955, the kernel lane's measured value
    nearRel(area, expected, 1e-4, 'blank area');
    // envelope: each strip starts at its trimmed edge (x = 98, and z = −2 which is sketch y = 2 since y = −z) and runs
    // BA + L outward: x up to 98 + 25.372 = 123.372, y down to 2 − 25.372 = −23.372 (kernel lane: [0, −23.3721] .. [123.3721, 60])
    nearVec([flat.bbox.min[0], flat.bbox.min[1], 0], [0, 2 - (BA + L), 0], 1e-6, 'flat bbox.min');
    nearVec([flat.bbox.max[0], flat.bbox.max[1], 0], [98 + BA + L, 60, 0], 1e-6, 'flat bbox.max');
    var labels = flat.bends.map(function (b) { return b.label; }).sort().join(' | ');
    assert(/UP 90° R2/.test(labels) && !/DOWN/.test(labels), 'both bends fold up: ' + labels);
    return 'blank ' + fmt(area) + ' (derived ' + fmt(expected) + '), ' + labels;
  });

