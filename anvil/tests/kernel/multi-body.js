  // ------------------------------------------------------------------ multi-body parts
  // A part is a list of separate solid bodies in creation order: build.bodies (CSG each), build.bodyFeatures (the id
  // of the feature that started each body), build.body = Kernel.combineBodies(bodies) with polygon.body / face.body
  // tags. Merge rule: a boss unions with every body whose bounding box its own overlaps or touches (merged bodies
  // collapse into the first one's slot), otherwise it starts a new body; `merge: false` always starts one. A cut
  // subtracts from every body in its scope (`bodies: [i, …]`, absent = all), drops a body it empties and warns
  // "removed no material" only when no scoped body changed. Shell, fillet, chamfer, flange and jog act on the body
  // nearest their first pick point.
  group('multi-body');
  // two 10 mm cubes: body 0 at x ∈ [0,10], body 1 at x ∈ [20,30] (both y ∈ [0,10], z ∈ [0,10]); features 1..4
  var TWO = 'p.box(10, 10, 10);\np.box(10, 10, 10, { at: [20, 0, 0], merge: false });\n';
  // the cut used below: x ∈ [0,30], y ∈ [0,20], z ∈ [3,7], so it takes a 10 × 4 × 10 = 400 slab out of each cube
  var SLAB = 'p.box(30, 4, 20, { at: [0, 0, 3], cut: true';
  function bodyVols(r) { return r.build.bodies.map(function (b) { return b.volume(); }); }
  function faceTags(mesh) { var m = {}; mesh.faces.forEach(function (f) { var k = f.body == null ? 'untagged' : f.body; m[k] = (m[k] || 0) + 1; }); return m; }
  function warningText(r) { return Object.keys(r.warnings).map(function (id) { return r.warnings[id]; }).join(' | '); }
  test('Kernel exposes combineBodies, bodyInfo and bodyNearPoint; a rebuild result carries bodies and bodyFeatures', function () {
    assert(typeof K.combineBodies === 'function', 'Kernel.combineBodies is missing');
    assert(typeof K.bodyInfo === 'function', 'Kernel.bodyInfo is missing');
    assert(typeof K.bodyNearPoint === 'function', 'Kernel.bodyNearPoint is missing');
    var r = build('p.box(10, 10, 10);');
    noErrors(r);
    assert(Array.isArray(r.build.bodies), 'build.bodies should be an array, got ' + Object.prototype.toString.call(r.build.bodies));
    assert(Array.isArray(r.build.bodyFeatures), 'build.bodyFeatures should be an array');
    assert(r.build.bodies.length === r.build.bodyFeatures.length, 'bodies and bodyFeatures must have the same length');
  });
  test('two boxes, the second with merge: false: two bodies of 1000 made by the two extrudes, combined body 2000', function () {
    var r = build(TWO);
    noErrors(r);
    assert(r.build.bodies.length === 2, 'bodies: ' + r.build.bodies.length);
    var ext = r.model.features.filter(function (f) { return f.type === 'extrude'; }).map(function (f) { return f.id; });
    assert(JSON.stringify(r.build.bodyFeatures) === JSON.stringify(ext), 'bodyFeatures ' + JSON.stringify(r.build.bodyFeatures) + ' vs the extrude ids ' + JSON.stringify(ext));
    var v = bodyVols(r);
    near(v[0], 1000, 1e-9, 'body 0'); near(v[1], 1000, 1e-9, 'body 1');
    near(r.body.volume(), 2000, 1e-9, 'combined body');
    near(r.mp.volume, 2000, 1e-6, 'mesh volume');
    var f2 = r.model.features[3];
    assert(f2.merge === false, 'the second extrude should carry merge: false, got ' + JSON.stringify(f2.merge));
    assert(r.model.features[1].merge !== false, 'the first extrude should not carry merge: false');
    return 'bodies ' + v.map(fmt).join(' + ') + ', features ' + JSON.stringify(r.build.bodyFeatures);
  });
  test('meshFromBody tags faces by body: 12 faces, six of body 0 (x ≤ 10) and six of body 1 (x ≥ 20)', function () {
    var r = build(TWO);
    noErrors(r);
    assert(r.mesh.faces.length === 12, 'faces: ' + r.mesh.faces.length);
    var tags = faceTags(r.mesh);
    assert(tags[0] === 6 && tags[1] === 6 && !tags.untagged, 'face tags: ' + JSON.stringify(tags));
    r.mesh.faces.forEach(function (f, i) {
      if (f.body === 0) assert(f.centroid[0] <= 10 + 1e-6, 'face ' + i + ' tagged 0 but its centroid x = ' + f.centroid[0]);
      else assert(f.centroid[0] >= 20 - 1e-6, 'face ' + i + ' tagged 1 but its centroid x = ' + f.centroid[0]);
    });
    // the polygons of the combined solid carry the same tag
    var polyTags = {};
    r.body.polygons.forEach(function (p) { polyTags[p.body] = (polyTags[p.body] || 0) + 1; });
    assert(polyTags[0] > 0 && polyTags[1] > 0 && Object.keys(polyTags).length === 2, 'polygon tags: ' + JSON.stringify(polyTags));
    return 'face tags ' + JSON.stringify(tags);
  });
  test('bodyInfo names the bodies after their creating feature: Boss-Extrude1 and Boss-Extrude2', function () {
    var r = build(TWO);
    var info = K.bodyInfo(r.build, r.model);
    assert(Array.isArray(info) && info.length === 2, 'bodyInfo length ' + (info && info.length));
    assert(info[0].index === 0 && info[1].index === 1, 'indices ' + JSON.stringify(info.map(function (b) { return b.index; })));
    assert(info[0].name === 'Boss-Extrude1' && info[1].name === 'Boss-Extrude2', 'names ' + JSON.stringify(info.map(function (b) { return b.name; })));
    assert(info[0].featureId === r.build.bodyFeatures[0] && info[1].featureId === r.build.bodyFeatures[1], 'featureIds ' + JSON.stringify(info.map(function (b) { return b.featureId; })));
    near(info[0].volume, 1000, 1e-9, 'volume 0'); near(info[1].volume, 1000, 1e-9, 'volume 1');
    return info.map(function (b) { return b.name + ' ' + fmt(b.volume); }).join(', ');
  });
  test('a cut through both bodies (no scope) takes 10 × 4 × 10 from each: 600 + 600, no warning', function () {
    var r = build(TWO + SLAB + ' });');
    noErrors(r);
    var v = bodyVols(r);
    assert(v.length === 2, 'bodies: ' + v.length);
    near(v[0], 600, 1e-9, 'body 0'); near(v[1], 600, 1e-9, 'body 1');
    near(r.body.volume(), 1200, 1e-9, 'combined');
    assert(Object.keys(r.warnings).length === 0, 'warnings: ' + warningText(r));
    var cut = r.model.features[r.model.features.length - 1];
    assert(cut.cut === true && cut.bodies == null, 'an unscoped cut should carry no bodies field: ' + JSON.stringify(cut.bodies));
  });
  test('a cut scoped with bodies: [1] cuts body 1 only (1000 + 600); bodies: [0] the other way round', function () {
    var r = build(TWO + SLAB + ', bodies: [1] });');
    noErrors(r);
    var v = bodyVols(r);
    assert(v.length === 2, 'bodies: ' + v.length);
    near(v[0], 1000, 1e-9, 'body 0 untouched'); near(v[1], 600, 1e-9, 'body 1 cut');
    var cut = r.model.features[r.model.features.length - 1];
    assert(JSON.stringify(cut.bodies) === '[1]', 'feature bodies: ' + JSON.stringify(cut.bodies));
    assert(Object.keys(r.warnings).length === 0, 'warnings: ' + warningText(r));
    var r0 = build(TWO + SLAB + ', bodies: [0] });');
    noErrors(r0);
    var v0 = bodyVols(r0);
    near(v0[0], 600, 1e-9, 'body 0 cut'); near(v0[1], 1000, 1e-9, 'body 1 untouched');
    return 'scope [1]: ' + v.map(fmt).join(' + ') + '; scope [0]: ' + v0.map(fmt).join(' + ');
  });
  test('a boss touching body 0 only merges into it: still two bodies, 1500 and 1000, same creating features', function () {
    var r = build(TWO + 'p.box(5, 10, 10, { at: [10, 0, 0] });'); // x ∈ [10,15]: shares the x = 10 face of body 0, 5 mm short of body 1
    noErrors(r);
    var before = build(TWO).build.bodyFeatures;
    var v = bodyVols(r);
    assert(v.length === 2, 'bodies: ' + v.length + ' (' + v.map(fmt).join(', ') + ')');
    near(v[0], 1500, 1e-9, 'body 0 grew'); near(v[1], 1000, 1e-9, 'body 1 untouched');
    assert(JSON.stringify(r.build.bodyFeatures) === JSON.stringify(before), 'bodyFeatures ' + JSON.stringify(r.build.bodyFeatures) + ' vs ' + JSON.stringify(before));
    near(r.mp.volume, 2500, 1e-6, 'mesh volume');
  });
  test('a boss bridging both bodies collapses them into slot 0: one body of 3000 made by Boss-Extrude1', function () {
    var r = build(TWO + 'p.box(10, 10, 10, { at: [10, 0, 0] });'); // x ∈ [10,20]: touches body 0 at x = 10 and body 1 at x = 20
    noErrors(r);
    var v = bodyVols(r);
    assert(v.length === 1, 'bodies: ' + v.length + ' (' + v.map(fmt).join(', ') + ')');
    near(v[0], 3000, 1e-9, 'the one body');
    assert(r.build.bodyFeatures[0] === r.model.features[1].id, 'the surviving slot should be the first extrude, got feature ' + r.build.bodyFeatures[0]);
    assert(K.bodyInfo(r.build, r.model)[0].name === 'Boss-Extrude1', 'name');
    assert(faceTags(r.mesh)[0] === r.mesh.faces.length, 'every face tagged 0: ' + JSON.stringify(faceTags(r.mesh)));
  });
  test('a disjoint boss with the default merge becomes a third body of 125', function () {
    var r = build(TWO + 'p.box(5, 5, 5, { at: [40, 0, 0] });');
    noErrors(r);
    var v = bodyVols(r);
    assert(v.length === 3, 'bodies: ' + v.length);
    near(v[0], 1000, 1e-9, 'body 0'); near(v[1], 1000, 1e-9, 'body 1'); near(v[2], 125, 1e-9, 'body 2');
    assert(r.build.bodyFeatures[2] === r.model.features[5].id, 'body 2 made by the third extrude');
    assert(r.model.features[5].merge !== false, 'the third extrude has the default merge');
    assert(K.bodyInfo(r.build, r.model)[2].name === 'Boss-Extrude3', 'name ' + K.bodyInfo(r.build, r.model)[2].name);
  });
  test('a cut that empties a body removes it: back to two bodies, no warning', function () {
    var r = build(TWO + 'p.box(5, 5, 5, { at: [40, 0, 0] });\np.box(10, 10, 10, { at: [40, 0, 0], cut: true });');
    noErrors(r);
    var v = bodyVols(r);
    assert(v.length === 2, 'bodies: ' + v.length + ' (' + v.map(fmt).join(', ') + ')');
    near(v[0], 1000, 1e-9, 'body 0'); near(v[1], 1000, 1e-9, 'body 1');
    assert(r.build.bodyFeatures.length === 2 && r.build.bodyFeatures[1] === r.model.features[3].id, 'bodyFeatures ' + JSON.stringify(r.build.bodyFeatures));
    assert(Object.keys(r.warnings).length === 0, 'the cut removed material, so no warning expected: ' + warningText(r));
    near(r.mp.volume, 2000, 1e-6, 'mesh volume');
  });
  test('merge: false keeps an overlapping boss separate: two bodies of 1000 sharing the same space', function () {
    var r = build('p.box(10, 10, 10);\np.box(10, 10, 10, { at: [5, 0, 0], merge: false });');
    noErrors(r);
    var v = bodyVols(r);
    assert(v.length === 2, 'bodies: ' + v.length);
    near(v[0], 1000, 1e-9, 'body 0'); near(v[1], 1000, 1e-9, 'body 1');
    var same = build('p.box(10, 10, 10);\np.box(10, 10, 10, { at: [5, 0, 0] });');
    assert(same.build.bodies.length === 1, 'with the default merge the overlapping boss joins body 0');
    near(same.body.volume(), 1500, 1e-9, 'merged volume');
  });
  test('a cylinder and a revolve with merge: false start their own bodies', function () {
    var r = build('p.box(10, 10, 10);\np.cylinder(5, 10, { at: [5, 10, 5], merge: false });\np.sketch("Front").rect(20, 0, 5, 10).revolve(360, { merge: false });');
    noErrors(r);
    var v = bodyVols(r);
    assert(v.length === 3, 'bodies: ' + v.length + ' (' + v.map(fmt).join(', ') + ')');
    near(v[0], 1000, 1e-9, 'the box');
    nearRel(v[1], polyCircleArea(5) * 10, 1e-9, 'the cylinder (sits on the box but stays separate)');
    var ring = Math.PI * (25 * 25 - 20 * 20) * 10;
    assert(v[2] > 0.9 * ring && v[2] <= ring + 1e-6, 'the ring should be a polygonal ' + fmt(ring) + ', got ' + fmt(v[2]));
    assert(r.model.features[3].merge === false && r.model.features[5].merge === false, 'both features carry merge: false');
    return v.map(fmt).join(', ');
  });
  test('a linear pattern with merge: false is a new body holding its copies (1000 + 2000)', function () {
    var r = build('p.box(10, 10, 10);\np.linearPattern({ dir: "x", spacing: 20, count: 3, merge: false });');
    noErrors(r);
    var v = bodyVols(r);
    assert(v.length === 2, 'bodies: ' + v.length + ' (' + v.map(fmt).join(', ') + ')');
    near(v[0], 1000, 1e-9, 'the seed'); near(v[1], 2000, 1e-9, 'the two copies');
    assert(r.model.features[2].merge === false, 'lpattern carries merge: false');
    near(r.mp.volume, 3000, 1e-6, 'mesh volume');
    var plain = build('p.box(10, 10, 10);\np.linearPattern({ dir: "x", spacing: 20, count: 3 });');
    assert(plain.build.bodies.length === 2, 'with the default merge the disjoint copies still form one new body: ' + plain.build.bodies.length + ' bodies');
    near(plain.body.volume(), 3000, 1e-9, 'plain pattern volume');
  });
  test('a fillet picked on body 1 rounds body 1 only: body 0 stays exactly 1000', function () {
    var r = build(TWO + 'p.fillet(2, [[25, 10, 0]]);'); // the y = 10, z = 0 edge of body 1
    noErrors(r);
    var v = bodyVols(r);
    assert(v.length === 2, 'bodies: ' + v.length);
    near(v[0], 1000, 1e-9, 'body 0 untouched');
    assert(v[1] < 1000 - 1 && v[1] > 990, 'body 1 should lose about (1 − π/4)·4·10 = ' + fmt((1 - Math.PI / 4) * 40) + ', got ' + fmt(1000 - v[1]));
    nearRel(v[1], 1000 - (1 - Math.PI / 4) * 4 * 10, 0.01, 'body 1 (polygonal arc)');
    return 'body 1 = ' + fmt(v[1]);
  });
  test('a chamfer picked on body 0 breaks body 0 only: 980 and 1000', function () {
    var r = build(TWO + 'p.chamfer(2, [[5, 10, 0]]);'); // the y = 10, z = 0 edge of body 0
    noErrors(r);
    var v = bodyVols(r);
    assert(v.length === 2, 'bodies: ' + v.length);
    nearRel(v[0], 1000 - 2 * 2 / 2 * 10, 1e-6, 'body 0 minus the triangular prism');
    near(v[1], 1000, 1e-9, 'body 1 untouched');
    assert(r.mesh.faces.length === 13, 'faces: ' + r.mesh.faces.length + ' (two boxes + one chamfer face)');
  });
  test('a shell picked on the top face of body 0 hollows body 0 only: 424 and 1000', function () {
    var r = build(TWO + 'p.shell(1, [[5, 10, 5]]);');
    noErrors(r);
    var v = bodyVols(r);
    assert(v.length === 2, 'bodies: ' + v.length);
    near(v[0], 1000 - 8 * 8 * 9, 1e-6, 'body 0: 1000 − 8·8·9');
    near(v[1], 1000, 1e-9, 'body 1 untouched');
    near(r.mp.volume, 424 + 1000, 1e-6, 'mesh volume');
    // a shell with no face picked acts on body 0 (closed hollow: 1000 − 8·8·8)
    var closed = build(TWO + 'p.shell(1, []);');
    noErrors(closed);
    var vc = bodyVols(closed);
    near(vc[0], 1000 - 512, 1e-6, 'closed shell of body 0'); near(vc[1], 1000, 1e-9, 'body 1 untouched by the closed shell');
  });
  // rfFS: an empty cut is a rebuild error now (was the "removed no material" warning); the bodies are kept
  test('a cut that misses every body is an error; one that hits only body 1 with the default scope neither fails nor warns', function () {
    var miss = build(TWO + 'p.box(5, 5, 5, { at: [50, 0, 0], cut: true });');
    assert(/does not intersect the model/.test(JSON.stringify(miss.errors)), 'expected the empty-cut error, got: ' + JSON.stringify(miss.errors));
    near(miss.body.volume(), 2000, 1e-9, 'nothing removed');
    assert(miss.build.bodies.length === 2, 'both bodies kept');
    var one = build(TWO + 'p.box(5, 5, 5, { at: [22, 5, 2], cut: true });'); // inside body 1 only
    noErrors(one);
    assert(Object.keys(one.warnings).length === 0, 'a cut that changed one of the bodies must not warn: ' + warningText(one));
    var v = bodyVols(one);
    near(v[0], 1000, 1e-9, 'body 0'); near(v[1], 1000 - 125, 1e-9, 'body 1');
  });
  test('a cut whose scope excludes the only body it touches is an error and changes nothing', function () {
    var r = build(TWO + 'p.box(5, 5, 5, { at: [22, 5, 2], cut: true, bodies: [0] });'); // the tool lies in body 1, the scope says body 0
    assert(/does not intersect the model/.test(JSON.stringify(r.errors)), 'expected the empty-cut error (rfFS), got: ' + JSON.stringify(r.errors));
    var v = bodyVols(r);
    assert(v.length === 2, 'bodies: ' + v.length);
    near(v[0], 1000, 1e-9, 'body 0'); near(v[1], 1000, 1e-9, 'body 1 (out of scope)');
  });
  test('mirror body across Right at offset −5 with merge: false: two bodies of 1000', function () {
    // Right plane: n = +X, origin (−5, 0, 0); x ∈ [0,10] mirrors to x ∈ [−20,−10], clear of the original
    var r = build('p.box(10, 10, 10);\np.mirror("Right", { body: true, offset: -5, merge: false });');
    noErrors(r);
    var v = bodyVols(r);
    assert(v.length === 2, 'bodies: ' + v.length + ' (' + v.map(fmt).join(', ') + ')');
    near(v[0], 1000, 1e-9, 'original'); near(v[1], 1000, 1e-9, 'mirrored copy');
    nearVec(r.mp.bbox.min, [-20, 0, 0], 1e-6, 'bbox.min'); nearVec(r.mp.bbox.max, [10, 10, 10], 1e-6, 'bbox.max');
    var mf = r.model.features[r.model.features.length - 1];
    assert(mf.type === 'mirror' && mf.body === true && mf.merge === false, 'mirror feature: ' + JSON.stringify(mf));
    assert(r.build.bodyFeatures[1] === mf.id, 'the copy is credited to the mirror feature');
    assert(K.bodyInfo(r.build, r.model)[1].name === 'Mirror1', 'body 1 named after the mirror, got ' + K.bodyInfo(r.build, r.model)[1].name);
  });
  test('mirror body with the default merge: a disjoint copy is a new body, a touching copy (offset 0) merges into one body of 2000', function () {
    var apart = build('p.box(10, 10, 10);\np.mirror("Right", { body: true, offset: -5 });');
    noErrors(apart);
    var v = bodyVols(apart);
    assert(v.length === 2, 'disjoint copy: ' + v.length + ' bodies');
    near(v[0], 1000, 1e-9, 'original'); near(v[1], 1000, 1e-9, 'copy');
    var touching = build('p.box(10, 10, 10);\np.mirror("Right", { body: true });'); // x ∈ [−10,0] shares the x = 0 face
    noErrors(touching);
    assert(touching.build.bodies.length === 1, 'touching copy: ' + touching.build.bodies.length + ' bodies');
    near(touching.body.volume(), 2000, 1e-9, 'merged volume');
    assert(touching.mesh.faces.length === 6, 'the merged block has 6 faces, got ' + touching.mesh.faces.length);
  });
  test('generateScript emits merge: false and bodies: [1], and the script rebuilds the same bodies', function () {
    var a = build(TWO + SLAB + ', bodies: [1] });\np.fillet(2, [[25, 10, 0]]);');
    noErrors(a);
    var script = K.generateScript(a.model);
    assert(/merge: false/.test(script), 'script lacks "merge: false":\n' + script);
    assert(/bodies: \[1\]/.test(script), 'script lacks "bodies: [1]":\n' + script);
    assert((script.match(/merge: false/g) || []).length === 1, '"merge: false" should appear once (only the second box), got ' + (script.match(/merge: false/g) || []).length);
    var b = build(script);
    noErrors(b);
    var va = bodyVols(a), vb = bodyVols(b);
    assert(vb.length === va.length, 'bodies ' + vb.length + ' vs ' + va.length);
    va.forEach(function (x, i) { nearRel(vb[i], x, 1e-9, 'body ' + i); });
    assert(JSON.stringify(b.build.bodyFeatures) === JSON.stringify(a.build.bodyFeatures), 'bodyFeatures after the round trip');
    assert(K.generateScript(b.model) === script, 'generateScript is not a fixed point across the round trip');
    return script.split('\n').filter(function (l) { return /merge|bodies/.test(l); }).join(' / ');
  });
  test('generateScript emits neither merge nor bodies for a plain part', function () {
    var r = build('p.box(10, 10, 10);\np.box(10, 10, 10, { at: [20, 0, 0] });\np.box(5, 5, 5, { at: [2, 5, 2], cut: true });');
    noErrors(r);
    var script = K.generateScript(r.model);
    assert(!/merge/.test(script), 'script should not mention merge:\n' + script);
    assert(!/bodies/.test(script), 'script should not mention bodies:\n' + script);
    assert(r.build.bodies.length === 2, 'the disjoint second box is still a second body: ' + r.build.bodies.length);
  });
  test('packBuild / unpackBuild carry the bodies: same count, volumes, creating features and face tags', function () {
    var r = build(TWO + SLAB + ', bodies: [1] });');
    noErrors(r);
    var packed = K.packBuild(r.build);
    assert(Array.isArray(packed.bodies) && packed.bodies.length === 2, 'packed.bodies: ' + JSON.stringify(packed.bodies && packed.bodies.length));
    assert(JSON.stringify(packed.bodyFeatures) === JSON.stringify(r.build.bodyFeatures), 'packed.bodyFeatures ' + JSON.stringify(packed.bodyFeatures));
    var u = K.unpackBuild(packed);
    assert(Array.isArray(u.bodies) && u.bodies.length === 2, 'unpacked bodies: ' + (u.bodies && u.bodies.length));
    u.bodies.forEach(function (b, i) { assert(b instanceof CSG, 'body ' + i + ' is a CSG'); assert(b.volume() === r.build.bodies[i].volume(), 'body ' + i + ' volume exact: ' + b.volume() + ' vs ' + r.build.bodies[i].volume()); });
    assert(JSON.stringify(u.bodyFeatures) === JSON.stringify(r.build.bodyFeatures), 'unpacked bodyFeatures ' + JSON.stringify(u.bodyFeatures));
    assert(u.body instanceof CSG, 'unpacked combined body');
    near(u.body.volume(), 1600, 1e-9, 'combined volume');
    var mesh = K.meshFromBody(u.body);
    var tags = faceTags(mesh), tags0 = faceTags(r.mesh);
    assert(JSON.stringify(tags) === JSON.stringify(tags0), 'face tags after unpack ' + JSON.stringify(tags) + ' vs ' + JSON.stringify(tags0));
    assert(mesh.faces.length === r.mesh.faces.length, 'faces ' + mesh.faces.length + ' vs ' + r.mesh.faces.length);
    // the transfer list covers every body
    var bufs = K.packTransferables(packed);
    assert(bufs.length >= 2, 'packTransferables should list the buffers of both bodies, got ' + bufs.length);
    return 'tags ' + JSON.stringify(tags) + ', ' + bufs.length + ' transferables';
  });
  test('unpackBuild of a legacy packed build (a body but no bodies field) still yields one body', function () {
    var r = build(TWO);
    var legacy = K.packBuild(r.build);
    delete legacy.bodies; delete legacy.bodyFeatures;
    legacy.body = r.body.pack(); // what a worker from before the body list would have sent
    var u = K.unpackBuild(legacy);
    assert(u.body instanceof CSG, 'body unpacked');
    near(u.body.volume(), 2000, 1e-9, 'combined volume');
    assert(Array.isArray(u.bodies) && u.bodies.length === 1, 'bodies: ' + (u.bodies && u.bodies.length) + ', expected the one combined solid');
    near(u.bodies[0].volume(), 2000, 1e-9, 'the one body');
    assert(Array.isArray(u.bodyFeatures) && u.bodyFeatures.length === 1, 'bodyFeatures: ' + JSON.stringify(u.bodyFeatures));
    assert(K.bodyInfo(u, r.model).length === 1, 'bodyInfo of a legacy build has one entry');
  });
  test('rebuild with the cache: an unchanged two-body model reuses every feature and returns the same bodies; an appended boss keeps the first two', function () {
    var model = K.newModel('MB');
    K.runScript(model, TWO + SLAB + ', bodies: [1] });');
    var b1 = K.rebuild(model), n = model.features.length;
    noErrors({ errors: b1.errors });
    var b2 = K.rebuild(model, b1.cache);
    assert(b2.reused === n, 'unchanged: reused ' + b2.reused + ' of ' + n);
    assert(b2.bodies.length === 2, 'bodies after the cached rebuild: ' + b2.bodies.length);
    near(b2.bodies[0].volume(), 1000, 1e-9, 'body 0'); near(b2.bodies[1].volume(), 600, 1e-9, 'body 1');
    assert(JSON.stringify(b2.bodyFeatures) === JSON.stringify(b1.bodyFeatures), 'bodyFeatures restored from the cache');
    near(b2.body.volume(), 1600, 1e-9, 'combined body from the cache');
    var ct = faceTags(K.meshFromBody(b2.body)); // the slab splits cube 1 into two lumps: coplanar faces merge per plane, so 8 faces
    assert(ct[0] === 6 && ct[1] >= 8 && !ct.untagged, 'face tags from the cached build: ' + JSON.stringify(ct));
    // append a disjoint boss: the prefix comes from the cache, the new body is appended
    K.runScript(model, 'p.box(5, 5, 5, { at: [40, 0, 0] });');
    var b3 = K.rebuild(model, b2.cache);
    assert(b3.reused === n, 'appended: reused ' + b3.reused + ' of ' + n);
    assert(b3.bodies.length === 3, 'bodies after the append: ' + b3.bodies.length);
    near(b3.bodies[0].volume(), 1000, 1e-9, 'body 0 kept'); near(b3.bodies[1].volume(), 600, 1e-9, 'body 1 kept'); near(b3.bodies[2].volume(), 125, 1e-9, 'body 2 new');
    assert(b3.bodyFeatures[0] === b1.bodyFeatures[0] && b3.bodyFeatures[1] === b1.bodyFeatures[1], 'the first two creating features are unchanged');
    // the cache must not alias: the earlier build's bodies are untouched by the later one
    assert(b1.bodies.length === 2 && b2.bodies.length === 2, 'earlier builds keep their own body lists');
    return 'reused ' + b2.reused + '/' + n + ', then ' + b3.reused + '/' + (n + 2);
  });
  test('cacheFromBuild after a pack / unpack round trip keeps the bodies apart', function () {
    var model = K.newModel('MB');
    K.runScript(model, TWO + SLAB + ', bodies: [1] });');
    var b = K.rebuild(model), n = model.features.length;
    var u = K.unpackBuild(K.packBuild(b));
    K.applyProfiles(model, u.profiles);
    var b2 = K.rebuild(model, K.cacheFromBuild(model, u));
    assert(b2.reused === n, 'worker-style cache: reused ' + b2.reused + ' of ' + n);
    assert(b2.bodies.length === 2, 'bodies: ' + b2.bodies.length);
    near(b2.bodies[0].volume(), 1000, 1e-9, 'body 0'); near(b2.bodies[1].volume(), 600, 1e-9, 'body 1');
    assert(JSON.stringify(b2.bodyFeatures) === JSON.stringify(b.bodyFeatures), 'bodyFeatures ' + JSON.stringify(b2.bodyFeatures) + ' vs ' + JSON.stringify(b.bodyFeatures));
    // and a fresh feature after that still sees two bodies to scope
    K.runScript(model, SLAB.replace('at: [0, 0, 3]', 'at: [0, 0, 0]') + ', bodies: [0] });'); // x ∈ [0,30], y ∈ [0,20], z ∈ [0,4]: 400 out of body 0
    var b3 = K.rebuild(model, b2.cache);
    assert(b3.reused === n, 'appended scoped cut: reused ' + b3.reused);
    noErrors({ errors: b3.errors });
    near(b3.bodies[0].volume(), 600, 1e-9, 'body 0 after the scoped cut'); near(b3.bodies[1].volume(), 600, 1e-9, 'body 1 unchanged');
  });
  test('a single-body part is unchanged: one body that is build.body itself, every face tagged 0', function () {
    var r = build('p.box(10, 10, 10);\np.hole("Top", 5, -5, 3, { offset: 10 });');
    noErrors(r);
    assert(r.build.bodies.length === 1, 'bodies: ' + r.build.bodies.length);
    assert(r.build.bodies[0] === r.body, 'bodies[0] should be the very same CSG as build.body');
    assert(r.build.bodyFeatures[0] === r.model.features[1].id, 'made by the first extrude');
    var tags = faceTags(r.mesh);
    assert(tags[0] === r.mesh.faces.length && Object.keys(tags).length === 1, 'face tags: ' + JSON.stringify(tags));
    var info = K.bodyInfo(r.build, r.model);
    assert(info.length === 1 && info[0].name === 'Boss-Extrude1', 'bodyInfo: ' + JSON.stringify(info));
    nearRel(info[0].volume, 1000 - polyCircleArea(1.5) * 10, 1e-9, 'volume'); // Ø3 hole through the 10 mm cube
    assert(r.mesh.faces.length === 6 + segsForRadius(1.5), 'faces: ' + r.mesh.faces.length + ' (6 box faces + one per hole segment)');
    return 'volume ' + fmt(info[0].volume) + ', faces ' + r.mesh.faces.length;
  });
  test('bodyNearPoint picks the body nearest a point: [5,5,5] → 0, [25,5,5] → 1; no bodies → −1', function () {
    var r = build(TWO);
    assert(K.bodyNearPoint(r.build.bodies, [5, 5, 5]) === 0, '[5,5,5]');
    assert(K.bodyNearPoint(r.build.bodies, [25, 5, 5]) === 1, '[25,5,5]');
    assert(K.bodyNearPoint(r.build.bodies, [12, 10, 0]) === 0, '[12,10,0] is nearer body 0');
    assert(K.bodyNearPoint(r.build.bodies, [18, 10, 0]) === 1, '[18,10,0] is nearer body 1');
    assert(K.bodyNearPoint(r.build.bodies, [100, 0, 0]) === 1, 'far to the right: body 1');
    assert(K.bodyNearPoint([], [0, 0, 0]) === -1, 'no bodies');
  });
  test('an empty model builds no bodies and a null body', function () {
    var b = K.rebuild(K.newModel('Empty'));
    assert(b.body === null || b.body === undefined, 'body should be null, got ' + b.body);
    assert(Array.isArray(b.bodies) && b.bodies.length === 0, 'bodies: ' + JSON.stringify(b.bodies && b.bodies.length));
    assert(Array.isArray(b.bodyFeatures) && b.bodyFeatures.length === 0, 'bodyFeatures: ' + JSON.stringify(b.bodyFeatures));
    assert(K.combineBodies([]) === null, 'combineBodies([]) should be null');
    assert(K.bodyInfo(b, K.newModel('Empty')).length === 0, 'bodyInfo of an empty build');
    var one = build('p.box(10, 10, 10);');
    assert(K.combineBodies([one.body]) === one.body, 'combineBodies of one body returns that body');
    var two = K.combineBodies(build(TWO).build.bodies);
    assert(two instanceof CSG, 'combineBodies of two bodies returns a CSG');
    near(two.volume(), 2000, 1e-9, 'combined volume');
  });


