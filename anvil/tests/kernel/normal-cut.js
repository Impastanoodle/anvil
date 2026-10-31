  // ------------------------------------------------------------------ normal cut (sheet metal)
  group('normal cut');
  // Sheet on Top: rect(0, 0, 100, 60) → x ∈ [0,100], y ∈ [0,2], z ∈ [−60,0] (Top sketch v maps to −z); volume 12000.
  var NSHEET = 'p.sheet(2, 2, 0.71);\np.sketch("Top").rect(0, 0, 100, 60);\np.baseFlange(2);';
  function lastFeature(r) { return r.model.features[r.model.features.length - 1]; }
  // every mesh face normal is parallel to a world axis
  function tiltedFaces(mesh) {
    return mesh.faces.filter(function (f) {
      var n = f.normal;
      return !(Math.abs(n[0]) > 0.999999 || Math.abs(n[1]) > 0.999999 || Math.abs(n[2]) > 0.999999);
    });
  }
  function hasFace(mesh, n, w, tol) {
    return mesh.faces.some(function (f) {
      return Math.abs(f.normal[0] - n[0]) < 1e-6 && Math.abs(f.normal[1] - n[1]) < 1e-6 && Math.abs(f.normal[2] - n[2]) < 1e-6 && Math.abs(f.w - w) < tol;
    });
  }
  test('normal cut parallel to the sheet is the plain cut; the flag is stored, emitted and round-trips', function () {
    assert(typeof K.normalCutTool === 'function', 'Kernel.normalCutTool is missing');
    // 10 × 10 through the 2 mm sheet from the top face: 12000 − 200 = 11800
    var plain = build(NSHEET + '\np.sketch("Top", 2).rect(20, 20, 10, 10);\np.cut("through", { reverse: true });');
    var nc = build(NSHEET + '\np.sketch("Top", 2).rect(20, 20, 10, 10);\np.cut("through", { reverse: true, normalCut: true });');
    noErrors(plain); noErrors(nc);
    nearRel(plain.mp.volume, 11800, 1e-6, 'plain cut volume');
    nearRel(nc.mp.volume, 11800, 1e-6, 'normal cut volume');
    nearVec(nc.mp.centroid, plain.mp.centroid, 1e-6, 'centroid');
    assert(Object.keys(nc.warnings).length === 0, 'no warning: ' + JSON.stringify(nc.warnings));
    var f = lastFeature(nc);
    assert(f.type === 'extrude' && f.cut === true && f.normalCut === true, 'feature: ' + JSON.stringify(f));
    assert(lastFeature(plain).normalCut !== true, 'the plain cut has no normalCut flag');
    var script = K.generateScript(nc.model);
    assert(/normalCut: true/.test(script), 'generateScript emits normalCut: ' + script.split('\n').pop());
    assert(!/normalCut/.test(K.generateScript(plain.model)), 'the plain cut script has no normalCut');
    var rt = build(script);
    noErrors(rt);
    assert(lastFeature(rt).normalCut === true, 'round-trip keeps normalCut');
    nearRel(rt.mp.volume, 11800, 1e-6, 'round-trip volume');
    assert(K.generateScript(rt.model) === script, 'generateScript is a fixed point with normalCut');
    // p.extrude(d, { cut: true, normalCut: true }) is the same feature; a blind 5 mm cut still goes through the 2 mm sheet
    var ex = build(NSHEET + '\np.sketch("Top", 2).rect(20, 20, 10, 10);\np.extrude(5, { cut: true, reverse: true, normalCut: true });');
    noErrors(ex);
    nearRel(ex.mp.volume, 11800, 1e-6, 'extrude(cut, normalCut) volume');
    assert(lastFeature(ex).normalCut === true && lastFeature(ex).cut === true, 'extrude() stores normalCut: ' + JSON.stringify(lastFeature(ex)));
    // a blind normal cut shallower than the sheet still goes through: the prism is re-extruded through the thickness
    var shallow = build(NSHEET + '\np.sketch("Top", 2).rect(20, 20, 10, 10);\np.cut(1, { reverse: true, normalCut: true });');
    noErrors(shallow);
    nearRel(shallow.mp.volume, 11800, 1e-6, 'a 1 mm blind normal cut removes the full 10 × 10 × 2');
    var shallowPlain = build(NSHEET + '\np.sketch("Top", 2).rect(20, 20, 10, 10);\np.cut(1, { reverse: true });');
    nearRel(shallowPlain.mp.volume, 11900, 1e-6, 'sanity: the plain 1 mm cut removes half');
  });
  test('normal cut from a 45° sketch removes a straight prism (axis-aligned faces), not the oblique slab', function () {
    // Custom frame tilted 45° about X: x = X, y = (0, c, −c), n = (0, c, c), c = 1/√2; origin (50, 10, −30) is 8 above the
    // sheet. A tool point is origin + u·x + v·y − t·n (the cut runs along −n, "reverse"). On the top face y = 2:
    // c·v − c·t = −8 → z = −30 − c·v − c·t = −38 − √2·v, so the 10 × 10 sketch (u, v ∈ [−5, 5]) enters through
    // x ∈ [45, 55], z ∈ [−45.071, −30.929] (10√2 = 14.142 long); on the bottom face y = 0 the footprint is shifted by −2 in z.
    // Plain oblique cut: a parallelogram slab, removed volume 10 · 14.142 · 2 = 282.843 with centroid z = −39.
    // Normal cut: the top footprint extruded straight through the thickness: the same volume, centroid z = −38.
    var c = Math.SQRT1_2;
    var TILT = 'p.sketch({ custom: true, origin: [50, 10, -30], x: [1, 0, 0], y: [0, ' + c + ', ' + (-c) + '], n: [0, ' + c + ', ' + c + '] }, 0).rect(-5, -5, 10, 10);';
    var plain = build(NSHEET + '\n' + TILT + '\np.cut("through", { reverse: true });');
    var nc = build(NSHEET + '\n' + TILT + '\np.cut("through", { reverse: true, normalCut: true });');
    noErrors(plain); noErrors(nc);
    var removed = 10 * 10 * Math.SQRT2 * 2, vol = 12000 - removed;
    nearRel(plain.mp.volume, vol, 1e-6, 'plain oblique cut volume');
    nearRel(nc.mp.volume, vol, 1e-6, 'normal cut volume');
    assert(Object.keys(nc.warnings).length === 0, 'no warning: ' + JSON.stringify(nc.warnings));
    // body centroid z = (12000·(−30) − removed·zRemoved) / vol with zRemoved = −39 (oblique) or −38 (normal)
    var zPlain = (12000 * -30 - removed * -39) / vol;   // −29.782750
    var zNc = (12000 * -30 - removed * -38) / vol;      // −29.806890
    nearRel(plain.mp.centroid[2], zPlain, 1e-6, 'plain cut centroid z');
    nearRel(nc.mp.centroid[2], zNc, 1e-6, 'normal cut centroid z');
    near(nc.mp.centroid[0], 50, 1e-6, 'normal cut centroid x');
    near(nc.mp.centroid[1], 1, 1e-6, 'normal cut centroid y (symmetric through the thickness)');
    nearVec(nc.mp.bbox.min, [0, 0, -60], 1e-6, 'bbox.min unchanged'); nearVec(nc.mp.bbox.max, [100, 2, 0], 1e-6, 'bbox.max unchanged');
    // the window's walls are square to the sheet: its z walls sit at the top footprint z = −38 ∓ 5√2
    var z0 = -38 - 5 * Math.SQRT2, z1 = -38 + 5 * Math.SQRT2;
    assert(hasFace(nc.mesh, [0, 0, 1], z0, 1e-3), 'window wall facing +z at z = ' + fmt(z0));
    assert(hasFace(nc.mesh, [0, 0, -1], -z1, 1e-3), 'window wall facing −z at z = ' + fmt(z1));
    assert(hasFace(nc.mesh, [1, 0, 0], 45, 1e-6) && hasFace(nc.mesh, [-1, 0, 0], -55, 1e-6), 'window walls at x = 45 and 55');
    var tilted = tiltedFaces(nc.mesh);
    assert(tilted.length === 0, tilted.length + ' tilted faces after the normal cut, e.g. normal ' + (tilted[0] ? tilted[0].normal.map(fmt).join(', ') : ''));
    assert(tiltedFaces(plain.mesh).length > 0, 'sanity: the plain oblique cut does leave tilted faces');
    consistentVolume(nc);
    return 'centroid z ' + fmt(nc.mp.centroid[2]) + ' (oblique ' + fmt(plain.mp.centroid[2]) + '), ' + nc.mesh.faces.length + ' faces';
  });
  test('normal cut through a flange wall removes outline area × T, from outside or from inside the wall, both directions', function () {
    // bend-outside flange up on the x = 100 edge: wall x ∈ [102,104], y ∈ [4,24], z ∈ [−60,0]
    var WALL = NSHEET + '\np.flange(20, [[100, 2, -30]]);';
    var base = build(WALL);
    noErrors(base);
    near(base.mp.bbox.max[0], 104, 1e-6, 'wall outer face at x = 104'); near(base.mp.bbox.max[1], 24, 1e-6, 'wall top at y = 24');
    var V = base.mp.volume;
    // Right plane (u = −z, v = y) at x = 110, outside the wall: rect(20, 10, 20, 6) → z ∈ [−40,−20], y ∈ [10,16], in the
    // flat part of the wall (the bend ends at y = 4). Cut along −x through all: 20 × 6 × T = 240 removed.
    var one = build(WALL + '\np.sketch("Right", 110).rect(20, 10, 20, 6);\np.cut("through", { reverse: true, normalCut: true });');
    noErrors(one);
    nearRel(one.mp.volume, V - 240, 1e-6, 'from outside, one direction');
    assert(!one.warnings[lastFeature(one).id], 'no warning: ' + JSON.stringify(one.warnings));
    assert(hasFace(one.mesh, [0, 0, 1], -40, 1e-6) && hasFace(one.mesh, [0, 0, -1], 20, 1e-6), 'window walls at z = −40 and −20');
    assert(hasFace(one.mesh, [0, 1, 0], 10, 1e-6) && hasFace(one.mesh, [0, -1, 0], -16, 1e-6), 'window walls at y = 10 and 16');
    // the same with a second (+x, 50 mm blind) direction that meets nothing
    var both = build(WALL + '\np.sketch("Right", 110).rect(20, 10, 20, 6);\np.cut("through", { reverse: true, normalCut: true, depth2: 50 });');
    noErrors(both);
    nearRel(both.mp.volume, V - 240, 1e-6, 'from outside, both directions');
    // sketch plane inside the wall (x = 103): direction 1 (−x, through) takes x ∈ [102,103], direction 2 (+x, 50) takes
    // x ∈ [103,104]; each side enters through its own sheet face, so both caps are used
    var mid = build(WALL + '\np.sketch("Right", 103).rect(20, 10, 20, 6);\np.cut("through", { reverse: true, normalCut: true, depth2: 50 });');
    noErrors(mid);
    nearRel(mid.mp.volume, V - 240, 1e-6, 'from inside the wall, both directions');
    assert(tiltedFaces(mid.mesh).length === tiltedFaces(base.mesh).length, 'no new tilted faces');
    return 'wall part ' + fmt(V) + ' → ' + fmt(one.mp.volume);
  });
  test('normalCut on a part without sheet metal parameters is a plain cut', function () {
    // 10 × 10 × 10 block (Front sketch extruded +z), a 2 × 2 window cut down from the top face: 1000 − 2·2·10 = 960
    var r = build('p.sketch("Front").rect(0, 0, 10, 10).extrude(10);\np.sketch("Top", 10).rect(2, -4, 2, 2);\np.cut("through", { reverse: true, normalCut: true });');
    noErrors(r);
    assert(!r.model.sheet, 'the model has no sheet parameters: ' + JSON.stringify(r.model.sheet));
    near(r.mp.volume, 960, 1e-6, 'volume');
    assert(lastFeature(r).normalCut === true, 'the flag is kept on the feature');
    assert(Object.keys(r.warnings).length === 0, 'no warning: ' + JSON.stringify(r.warnings));
    consistentVolume(r);
  });
  // rfFS: a cut that removes no material is a rebuild error now (it was a warning); the body is kept
  test('normal cut whose tool crosses no sheet face and misses the part is an error and leaves the body alone', function () {
    var r = build(NSHEET + '\np.sketch("Top", 2).rect(200, 200, 10, 10);\np.cut("through", { reverse: true, normalCut: true });');
    var id = lastFeature(r).id;
    assert(/does not intersect the model/.test(r.errors[id] || ''), 'expected the empty-cut error on feature ' + id + ': ' + JSON.stringify(r.errors));
    near(r.mp.volume, 12000, 1e-6, 'volume unchanged');
    return r.errors[id];
  });

