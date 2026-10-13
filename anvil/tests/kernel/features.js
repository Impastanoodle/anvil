  // ------------------------------------------------------------------ features
  group('features');
  test('box 20×30×10 has the exact volume and bbox', function () {
    var r = build('p.box(20, 30, 10);');
    noErrors(r);
    near(r.mp.volume, 6000, 1e-6, 'volume');
    near(r.mp.area, 2 * (20 * 30 + 20 * 10 + 30 * 10), 1e-6, 'area');
    // p.box sketches on Top with v in [-d, 0]; Top maps v -> -z, so the box occupies z in [0, d]
    nearVec(r.mp.bbox.min, [0, 0, 0], 1e-9, 'bbox.min');
    nearVec(r.mp.bbox.max, [20, 10, 30], 1e-9, 'bbox.max');
    assert(r.mesh.faces.length === 6, 'faces = ' + r.mesh.faces.length);
    consistentVolume(r);
    return 'bbox ' + bboxStr(r.mp.bbox);
  });
  test('centred box is symmetric about the origin in x and z', function () {
    var r = build('p.box(20, 30, 10, { centered: true });');
    noErrors(r);
    nearVec(r.mp.bbox.min, [-10, 0, -15], 1e-9, 'bbox.min');
    nearVec(r.mp.bbox.max, [10, 10, 15], 1e-9, 'bbox.max');
    nearVec(r.mp.centroid, [0, 5, 0], 1e-6, 'centroid');
  });
  test('cylinder r=10 h=5 on Top has the exact volume πr²h (its mesh the polygonal one)', function () {
    var r = build('p.cylinder(10, 5);');
    noErrors(r);
    nearRel(r.mp.volume, Math.PI * 100 * 5, 1e-9, 'volume vs true cylinder');
    nearRel(r.mp.polygonal.volume, polyCircleArea(10) * 5, 1e-9, 'polygonal mesh volume');
    near(r.mp.bbox.min[1], 0, 1e-9, 'y min'); near(r.mp.bbox.max[1], 5, 1e-9, 'y max');
  });
  test('cylinder along z and along x land on the right axes', function () {
    var rz = build('p.cylinder(4, 9, { axis: "z" });');
    noErrors(rz);
    near(rz.mp.bbox.max[2] - rz.mp.bbox.min[2], 9, 1e-9, 'z extent');
    var rx = build('p.cylinder(4, 9, { axis: "x" });');
    noErrors(rx);
    near(rx.mp.bbox.max[0] - rx.mp.bbox.min[0], 9, 1e-9, 'x extent');
  });
  test('through-all hole removes a full cylinder from a box', function () {
    var r = build('p.box(40, 40, 10, { centered: true });\np.hole("Top", 0, 0, 6, { offset: 10 });');
    noErrors(r);
    nearRel(r.mp.volume, 16000 - circleArea(3) * 10, 1e-9, 'volume');
    assert(r.mesh.faces.length > 6, 'hole should add faces (got ' + r.mesh.faces.length + ')');
    consistentVolume(r);
  });
  test('blind cut stops at the given depth', function () {
    // the sketch plane sits on the top face, so the cut must go against the plane normal (down into the part)
    var r = build('p.box(40, 40, 10, { centered: true });\np.sketch("Top", 10).circle(0, 0, 3).cut(4, { reverse: true });');
    noErrors(r);
    nearRel(r.mp.volume, 16000 - circleArea(3) * 4, 1e-9, 'volume');
    var fwd = build('p.box(40, 40, 10, { centered: true });\np.sketch("Top", 10).circle(0, 0, 3).cut(4);');
    noErrors(fwd);
    // a tool touching the face only along a coplanar disc leaves a ~1e-5 sliver from BSP clipping; that is fine
    near(fwd.mp.volume, 16000, 1e-3, 'a forward cut from the top face removes nothing');
  });
  test('extrude with a hole in the profile leaves a tube', function () {
    var r = build('p.sketch("Front").circle(0, 0, 10).circle(0, 0, 6).extrude(8);');
    noErrors(r);
    nearRel(r.mp.volume, (circleArea(10) - circleArea(6)) * 8, 1e-9, 'volume');
    consistentVolume(r);
  });
  test('midplane extrude straddles the sketch plane', function () {
    var r = build('p.sketch("Front").rect(0, 0, 4, 4).extrude(10, { midplane: true });');
    noErrors(r);
    near(r.mp.bbox.min[2], -5, 1e-9, 'z min'); near(r.mp.bbox.max[2], 5, 1e-9, 'z max');
    near(r.mp.volume, 160, 1e-6, 'volume');
  });
  test('reverse extrude goes against the plane normal', function () {
    var r = build('p.sketch("Front").rect(0, 0, 4, 4).extrude(10, { reverse: true });');
    noErrors(r);
    near(r.mp.bbox.min[2], -10, 1e-9, 'z min'); near(r.mp.bbox.max[2], 0, 1e-9, 'z max');
  });
  test('two-direction extrude adds depth2 on the other side', function () {
    var r = build('p.sketch("Front").rect(0, 0, 4, 4).extrude(10, { depth2: 3 });');
    noErrors(r);
    near(r.mp.bbox.min[2], -3, 1e-9, 'z min'); near(r.mp.bbox.max[2], 10, 1e-9, 'z max');
    near(r.mp.volume, 16 * 13, 1e-6, 'volume');
  });
  test('extrude "both" mirrors the depth', function () {
    var r = build('p.sketch("Front").rect(0, 0, 4, 4).extrude(6, { both: true });');
    noErrors(r);
    near(r.mp.bbox.min[2], -6, 1e-9, 'z min'); near(r.mp.bbox.max[2], 6, 1e-9, 'z max');
  });
  test('sketch on an offset reference plane feature', function () {
    var r = build('var pl = p.plane("Top", 12, "Shelf");\np.sketch(pl).rect(0, -5, 5, 5).extrude(3);');
    noErrors(r);
    near(r.mp.bbox.min[1], 12, 1e-9, 'y min'); near(r.mp.bbox.max[1], 15, 1e-9, 'y max');
    near(r.mp.volume, 75, 1e-6, 'volume');
  });
  test('full revolve of an offset rectangle is a ring', function () {
    var r = build('p.sketch("Front").rect(10, 0, 10, 5).revolve(360);');
    noErrors(r);
    nearRel(r.mp.volume, Math.PI * (400 - 100) * 5, 1e-9, 'volume vs true ring');
    // the old 48-ring mesh (legacy tessellation) still has the chorded ring's volume
    var n = 48, ringFactor = n / (2 * Math.PI) * Math.sin(2 * Math.PI / n);
    withLegacy(function () { nearRel(build('p.sketch("Front").rect(10, 0, 10, 5).revolve(360);').body.volume(), Math.PI * (400 - 100) * 5 * ringFactor, 1e-6, 'legacy polygonal volume'); });
    consistentVolume(r);
  });
  test('90° revolve is a quarter of the full one', function () {
    var full = build('p.sketch("Front").rect(10, 0, 10, 5).revolve(360);');
    var q = build('p.sketch("Front").rect(10, 0, 10, 5).revolve(90);');
    noErrors(q);
    nearRel(q.mp.volume, full.mp.volume / 4, 1e-9, 'quarter volume');
    consistentVolume(q);
  });
  test('revolve about the x axis and about a sketch line', function () {
    var rx = build('p.sketch("Front").rect(0, 10, 5, 10).revolve(360, { axis: "x" });');
    noErrors(rx);
    nearRel(rx.mp.volume, Math.PI * (400 - 100) * 5, 1e-9, 'x-axis volume');
    var rl = build('var s = p.sketch("Front").line(0, -20, 0, 20).rect(10, 0, 10, 5).id();\np.revolve(360, { axis: 0, sketch: s });');
    noErrors(rl);
    nearRel(rl.mp.volume, Math.PI * (400 - 100) * 5, 1e-9, 'sketch-line axis volume');
  });
  test('revolve of a profile with a hole makes a ring with a toroidal void', function () {
    var r = build('p.sketch("Front").rect(10, 0, 10, 10).circle(15, 5, 2).revolve(360);');
    noErrors(r);
    // exact: the ring minus the torus 2π·15·π·2² (Pappus)
    var ring = Math.PI * (400 - 100) * 10, torus = 2 * Math.PI * 15 * circleArea(2);
    nearRel(r.mp.volume, ring - torus, 1e-9, 'volume');
    consistentVolume(r);
  });
  test('partial (90°) revolve of a profile with a hole', function () {
    var full = build('p.sketch("Front").rect(10, 0, 10, 10).circle(15, 5, 2).revolve(360);');
    var q = build('p.sketch("Front").rect(10, 0, 10, 10).circle(15, 5, 2).revolve(90);');
    noErrors(q);
    nearRel(q.mp.volume, full.mp.volume / 4, 1e-9, 'quarter volume');
    consistentVolume(q);
    // the end caps must be flat faces at 0° and 90°: exactly one face with normal -z (start cap) and one with +x... (end cap)
    var caps = q.mesh.faces.filter(function (f) { return Math.abs(Math.abs(f.normal[2]) - 1) < 1e-6 || Math.abs(Math.abs(f.normal[0]) - 1) < 1e-6; });
    assert(caps.length >= 2, 'end caps missing (found ' + caps.length + ')');
    caps.forEach(function (f) { nearRel(f.area, 100 - polyCircleArea(2), 1e-6, 'cap area (profile minus hole)'); });
  });
  test('revolve cut hollows a cylinder', function () {
    var r = build('p.cylinder(10, 20, { axis: "y" });\np.sketch("Front").rect(0, 5, 6, 10).revolveCut(360);');
    noErrors(r);
    // exact: the cylinder minus the revolved 6 × 10 rectangle, a Ø12 × 10 cylinder (π·10²·20 − π·6²·10)
    nearRel(r.mp.volume, Math.PI * 100 * 20 - Math.PI * 36 * 10, 1e-9, 'volume');
    consistentVolume(r);
  });
  test('linear pattern triples a boss', function () {
    var r = build('p.box(100, 20, 2);\np.cylinder(3, 8, { at: [10, 2, -10] });\np.linearPattern({ dir: "x", spacing: 30, count: 3 });');
    noErrors(r);
    nearRel(r.mp.volume, 4000 + 3 * circleArea(3) * 8, 1e-9, 'volume');
    consistentVolume(r);
  });
  test('2D linear pattern of holes (2×3)', function () {
    // box occupies z in [0, 40]; the hole's sketch v=-10 is world z=+10, so the second direction steps toward +z
    var r = build('p.box(60, 40, 5);\np.hole("Top", 10, -10, 4, { offset: 5 });\np.linearPattern({ dir: "x", spacing: 20, count: 2, dir2: "z", spacing2: 10, count2: 3 });');
    noErrors(r);
    nearRel(r.mp.volume, 12000 - 6 * circleArea(2) * 5, 1e-9, 'volume');
  });
  test('circular pattern of holes on a flange', function () {
    var r = build('p.cylinder(30, 6);\np.hole("Top", 20, 0, 5, { offset: 6 });\np.circularPattern({ axis: "y", count: 6 });');
    noErrors(r);
    nearRel(r.mp.volume, circleArea(30) * 6 - 6 * circleArea(2.5) * 6, 1e-9, 'volume');
    consistentVolume(r);
  });
  test('circular pattern with a partial angle spaces evenly', function () {
    var r = build('p.cylinder(30, 6);\np.hole("Top", 20, 0, 5, { offset: 6 });\np.circularPattern({ axis: "y", count: 3, angle: 90 });');
    noErrors(r);
    nearRel(r.mp.volume, circleArea(30) * 6 - 3 * circleArea(2.5) * 6, 1e-9, 'volume');
  });
  test('mirror of a feature doubles it', function () {
    var r = build('p.box(20, 20, 5, { at: [5, 0, 0] });\np.mirror("Right");');
    noErrors(r);
    near(r.mp.volume, 4000, 1e-6, 'volume');
    near(r.mp.bbox.min[0], -25, 1e-9, 'x min'); near(r.mp.bbox.max[0], 25, 1e-9, 'x max');
  });
  test('mirror of the whole body', function () {
    var r = build('p.box(20, 20, 5, { at: [5, 0, 0] });\np.hole("Top", 15, -10, 4, { offset: 5 });\np.mirror("Right", { body: true });');
    noErrors(r);
    nearRel(r.mp.volume, 2 * (2000 - circleArea(2) * 5), 1e-9, 'volume');
    consistentVolume(r);
  });
  test('mirrored cut stays a cut', function () {
    var r = build('p.box(40, 20, 5, { centered: true });\np.hole("Top", 10, 0, 4, { offset: 5 });\np.mirror("Right");');
    noErrors(r);
    nearRel(r.mp.volume, 4000 - 2 * circleArea(2) * 5, 1e-9, 'volume');
  });
  test('a pattern of a pattern of a cut stays a cut', function () {
    var r = build('p.box(100, 40, 5);\np.hole("Top", 10, -10, 4, { offset: 5 });\np.linearPattern({ dir: "x", spacing: 20, count: 2 });\np.linearPattern({ dir: "z", spacing: 20, count: 2 });');
    noErrors(r);
    nearRel(r.mp.volume, 20000 - 4 * circleArea(2) * 5, 1e-9, 'volume (4 holes)');
    consistentVolume(r);
  });
  test('a circular pattern of a linear pattern of a cut', function () {
    var r = build('p.cylinder(40, 5);\np.hole("Top", 10, 0, 4, { offset: 5 });\np.linearPattern({ dir: "x", spacing: 12, count: 2 });\np.circularPattern({ axis: "y", count: 3 });');
    noErrors(r);
    nearRel(r.mp.volume, circleArea(40) * 5 - 6 * circleArea(2) * 5, 1e-9, 'volume (6 holes)');
  });
  test('a mirror of a pattern of a cut stays a cut', function () {
    var r = build('p.box(100, 40, 5, { centered: true });\np.hole("Top", 10, -10, 4, { offset: 5 });\np.linearPattern({ dir: "x", spacing: 20, count: 2 });\np.mirror("Front");');
    noErrors(r);
    nearRel(r.mp.volume, 20000 - 4 * circleArea(2) * 5, 1e-9, 'volume (4 holes)');
  });
  test('a pattern of a boss on a face keeps its faces separate', function () {
    var r = build('p.box(100, 40, 5);\np.cylinder(3, 6, { at: [10, 5, 10] });\np.linearPattern({ dir: "x", spacing: 20, count: 4 });');
    noErrors(r);
    nearRel(r.mp.volume, 20000 + 4 * circleArea(3) * 6, 1e-9, 'volume');
    var tops = r.mesh.faces.filter(function (f) { return f.normal[1] > 0.99 && Math.abs(f.w - 11) < 1e-6; });
    assert(tops.length === 1, 'the 4 boss tops are coplanar and share one plane group (got ' + tops.length + ')');
    nearRel(tops[0].area, 4 * polyCircleArea(3), 1e-6, 'boss top area');
  });
  test('union of two overlapping boxes', function () {
    var r = build('p.box(10, 10, 10);\np.box(10, 10, 10, { at: [5, 5, 0] });');
    noErrors(r);
    near(r.mp.volume, 2000 - 250, 1e-6, 'volume');
    consistentVolume(r);
  });
  test('massProps centroid of an L-bracket', function () {
    var r = build('p.box(10, 10, 2);\np.box(2, 10, 10, { at: [0, 0, 0] });');
    noErrors(r);
    // volume = 200 + 200 - overlap(2*10*2=40) = 360
    near(r.mp.volume, 360, 1e-6, 'volume');
    var cx = (200 * 5 + 200 * 1 - 40 * 1) / 360, cy = (200 * 1 + 200 * 5 - 40 * 1) / 360;
    near(r.mp.centroid[0], cx, 1e-6, 'centroid x'); near(r.mp.centroid[1], cy, 1e-6, 'centroid y');
    near(r.mp.mass, 360 * 7850, 1e-3, 'mass');
  });
  test('hole with a depth stops short; p.last() is the cut feature id', function () {
    var r = build('p.box(20, 20, 10);\np.hole("Top", 10, -10, 4, { offset: 10, depth: 6 });\nvar id = p.last();\nif (id !== 4) throw new Error("last() = " + id);');
    noErrors(r);
    nearRel(r.mp.volume, 4000 - circleArea(2) * 6, 1e-9, 'volume');
    var last = r.model.features[r.model.features.length - 1];
    assert(last.type === 'extrude' && last.cut && last.reverse, 'hole cut should be a reversed cut-extrude');
  });
  test('hole with forward:true goes along the plane normal', function () {
    var r = build('p.box(20, 20, 10);\np.hole("Top", 10, -10, 4, { offset: 0, forward: true });');
    noErrors(r);
    nearRel(r.mp.volume, 4000 - circleArea(2) * 10, 1e-9, 'volume');
  });
  test('sketch on a custom plane frame (planeFromFace) extrudes along its normal', function () {
    var pl = K.planeFromFace([0, 0, 1], [0, 0, 4]);
    var r = build('p.sketch(' + JSON.stringify(pl) + ').rect(0, 0, 3, 3).extrude(2);');
    noErrors(r);
    near(r.mp.bbox.min[2], 4, 1e-9, 'z min'); near(r.mp.bbox.max[2], 6, 1e-9, 'z max');
    near(r.mp.volume, 18, 1e-6, 'volume');
  });
  test('feature names auto-number per type', function () {
    var r = build('p.box(1,1,1);\np.box(1,1,1,{at:[5,0,0]});\np.hole("Top", 0.5, -0.5, 0.5, { offset: 1 });');
    var names = r.model.features.map(function (f) { return f.name; });
    assert(names.indexOf('Sketch1') >= 0 && names.indexOf('Sketch2') >= 0 && names.indexOf('Sketch3') >= 0, names.join(','));
    assert(names.indexOf('Boss-Extrude1') >= 0 && names.indexOf('Boss-Extrude2') >= 0, names.join(','));
    assert(names.indexOf('Cut-Extrude1') >= 0, names.join(','));
  });
  test('rebuild of an empty model is a null body with an empty mesh', function () {
    var r = build('');
    assert(r.body === null, 'body should be null');
    assert(r.mesh.triCount === 0 && r.mesh.faces.length === 0, 'empty mesh');
    near(r.mp.volume, 0, 1e-12, 'volume');
  });

