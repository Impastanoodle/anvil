// lane open-base: Base Flange from an open profile (SolidWorks: an open chain of lines, T to one side, Blind depth)
// flat length = sum of the flats + BA of each bend by K-factor; volume = flat area x T at K 0.5
(function () {
  group('rfGL: Base Flange from an open profile: U and Z sections, closed bodies, flat length and volume by hand');
  var T = 0.0598, R = 0.0598, Rt = R + T, HP = Math.PI / 2;
  function rfGLba(A, r, k) { return A * (r + k * T); }
  function rfGLbuild(code) {
    var r = build('p.units("in");\n' + code);
    noErrors(r);
    return r;
  }
  function rfGLflat(r) { return K.flatPattern(r.model, r.build, K.meshFromBody(r.build.body)); }
  function rfGLclosed(r) {
    var q = K.meshQuality(r.mesh);
    assert(!q.openEdges && !q.nonManifoldEdges && q.closed, 'open ' + q.openEdges + ', non-manifold ' + q.nonManifoldEdges);
  }
  function rfGLarea(l) { var a = 0; for (var i = 0; i < l.length; i++) { var p = l[i], q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; }
  function rfGLnet(flat) { var a = rfGLarea(flat.loops[0]); flat.loops.slice(1).forEach(function (l) { a -= rfGLarea(l); }); return a; }

  // U: sketch lines are the outside faces: 2 up, 3 across, 2 up, 4 deep (the thickness goes on the right of the chain, rfGW)
  var U = function (k) { return 'p.sheet(' + T + ', ' + R + ', ' + k + ');\np.sketch("Front").polyline([[3, 2], [3, 0], [0, 0], [0, 2]], false).end().baseFlange(null, { depth: 4 });\n'; };
  test('rfGL: U channel, K 0.5: closed, flat length = flats + 2 BA, volume = flat area x T', function () {
    var r = rfGLbuild(U(0.5)), f = rfGLflat(r), flats = (2 - Rt) + (3 - 2 * Rt) + (2 - Rt), L = flats + 2 * rfGLba(HP, R, 0.5);
    rfGLclosed(r);
    nearRel(f.size[0], L, 1e-9);
    nearRel(f.size[1], 4, 1e-9);
    assert(f.bends.length === 2 && f.loops.length === 1, 'bends ' + f.bends.length + ', loops ' + f.loops.length);
    nearRel(r.mp.volume, rfGLnet(f) * T, 1e-9);
    nearRel(r.mp.volume, L * 4 * T, 1e-9);
    return 'flat ' + f.size.map(function (x) { return x.toFixed(4); }).join(' x ') + ', ' + f.bends.map(function (b) { return b.label; }).join(', ');
  });
  test('rfGL: U channel, K 0.33: flat length follows the K-factor, the solid does not', function () {
    var r = rfGLbuild(U(0.33)), f = rfGLflat(r), flats = (2 - Rt) + (3 - 2 * Rt) + (2 - Rt);
    nearRel(f.size[0], flats + 2 * rfGLba(HP, R, 0.33), 1e-9);
    nearRel(r.mp.volume, rfGLbuild(U(0.5)).mp.volume, 1e-12);
  });
  test('rfGL: U drawn the other way round puts the thickness outside the lines: the sketch is the inside faces', function () {
    var r = rfGLbuild('p.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Front").polyline([[0, 2], [0, 0], [3, 0], [3, 2]], false).end().baseFlange(null, { depth: 4 });\n');
    near(r.mp.bbox.max[0], 3 + T, 1e-9);
    nearRel(rfGLflat(r).size[0], (2 - R) + (3 - 2 * R) + (2 - R) + 2 * rfGLba(HP, R, 0.5), 1e-9);
  });
  // Z: three legs, 45 deg-free square steps: 2, 1.5, 2
  var Z = 'p.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Front").polyline([[0, 0], [2, 0], [2, 1.5], [4, 1.5]], false).end().baseFlange(null, { depth: 3 });\n';
  test('rfGL: Z profile, K 0.5: closed, one bend up and one down, flat = flats + 2 BA', function () {
    var r = rfGLbuild(Z), f = rfGLflat(r);
    rfGLclosed(r);
    // the sketch is one face: each corner's setback on it is R + T on the outside of a bend, R on the inside
    var flats = (2 - Rt) + (1.5 - Rt - R) + (2 - R), L = flats + 2 * rfGLba(HP, R, 0.5);
    nearRel(f.size[0], L, 1e-9);
    nearRel(f.size[1], 3, 1e-9);
    nearRel(r.mp.volume, rfGLnet(f) * T, 1e-9);
    assert(f.bends.length === 2, 'bends ' + f.bends.length);
    var up = f.bends.filter(function (b) { return b.up; }).length;
    assert(up === 1, 'one bend each way, up: ' + up);
    return f.bends.map(function (b) { return b.label; }).join(', ');
  });
  test('rfGL: 45 degree legs, flip thickness side, Mid Plane, round trip', function () {
    var c = 'p.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Front").polyline([[0, 0], [3, 0], [5, 2]], false).end().baseFlange(null, { depth: 2, flip: true, midplane: true });\n';
    var r = rfGLbuild(c), f = rfGLflat(r), A = Math.PI / 4, s2 = Math.SQRT2;
    rfGLclosed(r);
    nearRel(f.size[0], (3 - Rt * Math.tan(A / 2)) + (2 * s2 - Rt * Math.tan(A / 2)) + rfGLba(A, R, 0.5), 1e-9);
    nearRel(r.mp.volume, rfGLnet(f) * T, 1e-9);
    var s = K.generateScript(r.model), r2 = build(s);
    noErrors(r2);
    nearRel(r2.mp.volume, r.mp.volume, 1e-12);
    assert(/p\.baseFlange\(null/.test(s), s);
  });
  test('rfGL: DXF of the flat, a straight line, an arc as the joint radius, errors in plain sentences', function () {
    var r = rfGLbuild(U(0.5)), dxf = K.exportDXFFlat(rfGLflat(r), 'in');
    assert(/BEND/.test(dxf), 'bend layer');
    var one = rfGLbuild('p.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Front").polyline([[0, 0], [3, 0]], false).end().baseFlange(null, { depth: 2 });\n');
    nearRel(one.mp.volume, 6 * T, 1e-9);
    nearRel(rfGLflat(one).size[0], 3, 1e-9);
    var bad = build('p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Front").polyline([[3, 0], [0, 0], [0, 0.1]], false).end().baseFlange(null, { depth: 2 });\n');
    var e = Object.keys(bad.build.errors).map(function (k) { return bad.build.errors[k]; });
    assert(e.length && /too short/.test(e[0]), 'error: ' + e.join(' | '));
    return e[0];
  });
  test('rfGL: a hole through the fixed plate keeps the flat; an edge flange goes on', function () {
    var r = rfGLbuild(U(0.5) + 'p.sketch("Top", -1).circle(1.5, -2, 0.25).end().cut(1.5);\n');
    var f = rfGLflat(r);
    assert(f.loops.length === 2, 'loops ' + f.loops.length);
    var r2 = rfGLbuild(U(0.5) + 'p.flange(1, [[1.5, 0, 4]], { position: "inside", lengthRef: "outer" });\n');
    assert(rfGLflat(r2).bends.length === 3, 'bends ' + rfGLflat(r2).bends.length);
  });
  test('rfGL: a sketched arc between two lines is that joint\'s radius (outside face: r - T inside)', function () {
    var r0 = 0.25;
    var r = rfGLbuild('p.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Front").line(3, 0, ' + r0 + ', 0).arc(' + r0 + ', ' + r0 + ', ' + r0 + ', 180, 270).line(0, ' + r0 + ', 0, 2).end().baseFlange(null, { depth: 2 });\n');
    var f = rfGLflat(r);
    rfGLclosed(r);
    assert(f.bends.length === 1, 'bends ' + f.bends.length);
    near(f.bends[0].R, r0 - T, 1e-9);
    nearRel(f.size[0], (2 - r0) + (3 - r0) + rfGLba(HP, r0 - T, 0.5), 1e-9);
  });
})();
