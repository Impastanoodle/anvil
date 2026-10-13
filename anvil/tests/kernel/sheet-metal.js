  // ------------------------------------------------------------------ sheet metal
  group('sheet metal');
  var SHEET = 'p.sheet(2, 2, 0.71);\np.sketch("Top").rect(0, -60, 100, 60).end().baseFlange(2);';
  test('bendAllowance is the neutral-axis arc length', function () {
    near(K.bendAllowance(Math.PI / 2, 2, 2, 0.71), Math.PI / 2 * (2 + 0.71 * 2), 1e-12, 'BA');
    near(K.bendAllowance(Math.PI, 1, 1, 0.5), Math.PI * 1.5, 1e-12, 'BA 180°');
  });
  test('baseFlange records sheet parameters and flags the feature', function () {
    var r = build(SHEET);
    noErrors(r);
    assert(r.model.sheet && r.model.sheet.thickness === 2 && r.model.sheet.bendRadius === 2 && r.model.sheet.kFactor === 0.71, 'sheet: ' + JSON.stringify(r.model.sheet));
    var base = r.model.features.filter(function (f) { return f.sheetBase; })[0];
    assert(base && base.type === 'extrude' && base.depth === 2, 'base flange feature: ' + JSON.stringify(base));
    near(r.mp.volume, 100 * 60 * 2, 1e-6, 'volume');
    var d = build('p.sketch("Top").rect(0, 0, 10, 10).end().baseFlange(1.5);');
    assert(d.model.sheet.thickness === 1.5 && d.model.sheet.bendRadius === 1.5 && d.model.sheet.kFactor === K.DEFAULT_K_FACTOR && K.DEFAULT_K_FACTOR === 0.5, 'defaults (K 0.5 for a new part since p9-bend): ' + JSON.stringify(d.model.sheet));
  });
  test('edge flange adds a bend plus a wall along the whole edge', function () {
    var r = build(SHEET + '\np.flange(20, [[0, 2, 30]]);');
    noErrors(r);
    var bend = Math.PI / 4 * (16 - 4) * 60, wall = 20 * 2 * 60;
    nearRel(r.mp.volume, 12000 + bend + wall, 0.01, 'volume');
    // flange goes up (+y) from the x=0 edge and sits beyond it (bend outside); L is the straight wall after the bend,
    // so the flange reaches edge y + R + L
    near(r.mp.bbox.max[1], 2 + 2 + 20, 1e-6, 'top of wall = edge + R + L');
    near(r.mp.bbox.min[0], -(2 + 2), 1e-6, 'wall outer face at -(R+T)');
    assert(r.build.flanges && r.build.flanges[r.model.features[r.model.features.length - 1].id].length === 1, 'flange info recorded');
    consistentVolume(r);
  });
  test('reverse flange goes down; custom angle and radius are honoured', function () {
    var down = build(SHEET + '\np.flange(15, [[50, 2, 0]], { reverse: true });');
    noErrors(down);
    // folding away from the flat face, the inside of the bend starts at the far (bottom, y = 0) face
    near(down.mp.bbox.min[1], 0 - (2 + 15), 1e-6, 'bottom of the down wall = bottom face - (R + L)');
    near(down.mp.bbox.min[2], -(2 + 2), 1e-6, 'wall outer face at -(R+T) beyond the z=0 edge');
    near(down.mp.bbox.max[1], 2, 1e-6, 'nothing above the sheet');
    // folding down, the top face is the outside of the bend: no overlap strip may stick out above the sheet
    nearRel(down.mp.volume, 12000 + Math.PI / 4 * (16 - 4) * 100 + 15 * 2 * 100, 0.01, 'down flange volume');
    var ang = build(SHEET + '\np.flange(10, [[0, 2, 30]], { angle: 45, radius: 3 });');
    noErrors(ang);
    var info = ang.build.flanges[ang.model.features[ang.model.features.length - 1].id][0];
    near(info.angle, Math.PI / 4, 1e-9, 'angle'); near(info.R, 3, 1e-9, 'radius'); near(info.L, 10, 1e-9, 'length');
    assert(ang.mp.volume < down.mp.volume, 'a 45° 10 mm flange is smaller than a 90° 15 mm one');
  });
  test('flange errors: before a base, without edges, on a non-square edge', function () {
    expectError('p.flange(10, [[0, 0, 0]]);', /base flange/i);
    expectError(SHEET + '\np.flange(10, []);', /no edge selected/i);
    expectError(SHEET + '\np.flange(10, [[500, 500, 500]]);', /no edge selected/i);
  });
  test('flatPattern unfolds two flanges with bend lines and keeps holes', function () {
    var r = build(SHEET + '\np.hole("Top", 50, -30, 10, { offset: 2 });\np.flange(20, [[0, 2, 30]]);\np.flange(15, [[50, 2, 0]], { reverse: true });');
    noErrors(r);
    var flat = K.flatPattern(r.model, r.build, r.mesh);
    var BA = K.bendAllowance(Math.PI / 2, 2, 2, 0.71);
    assert(flat.loops.length === 2, 'loops = ' + flat.loops.length + ' (outline + hole)');
    assert(flat.loops[0].length === 6, 'outer loop points = ' + flat.loops[0].length + ' (collinear points are simplified away)');
    assert(K.signedArea(flat.loops[0]) > 0, 'outer loop is CCW');
    near(flat.bbox.max[0] - flat.bbox.min[0], 100 + 20 + BA, 1e-6, 'flat width');
    near(flat.bbox.max[1] - flat.bbox.min[1], 60 + 15 + BA, 1e-6, 'flat height');
    assert(flat.bends.length === 2, 'bends = ' + flat.bends.length);
    var labels = flat.bends.map(function (b) { return b.label; }).sort().join(' | ');
    assert(/UP 90° R2/.test(labels) && /DOWN 90° R2/.test(labels), 'labels: ' + labels);
    flat.bends.forEach(function (b) { near(Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]), b.label.indexOf('UP') === 0 ? 60 : 100, 1e-6, 'bend line length'); });
    var holeArea = Math.abs(K.signedArea(flat.loops[1]));
    nearRel(holeArea, polyCircleArea(5), 1e-6, 'hole loop area');
    near(K.signedArea(flat.loops[0]), 100 * 60 + 60 * (20 + BA) + 100 * (15 + BA), 1e-6, 'flat outline area');
    return 'flat ' + fmt(flat.bbox.max[0] - flat.bbox.min[0]) + ' × ' + fmt(flat.bbox.max[1] - flat.bbox.min[1]);
  });
  test('flatPattern carries a hole on a flange wall into the blank', function () {
    var r = build(SHEET + '\np.flange(20, [[0, 2, 30]]);\np.sketch("Right", -30).circle(-30, 12, 3).cut(40);');
    noErrors(r);
    var flat = K.flatPattern(r.model, r.build, r.mesh), BA = K.bendAllowance(Math.PI / 2, 2, 2, 0.71);
    assert(flat.loops.length === 2, 'outline + wall hole, got ' + flat.loops.length + ' loops');
    nearRel(Math.abs(K.signedArea(flat.loops[1])), polyCircleArea(3), 1e-6, 'hole area');
    near(flat.bbox.max[0] - flat.bbox.min[0], 100 + 20 + BA, 1e-6, 'flat width');
    // the hole sits 12 − 2 − 2 = 8 mm up the wall's inner face, i.e. BA + 8 beyond the edge, at z = 30
    var c = flat.loops[1].reduce(function (s, p) { return [s[0] + p[0] / flat.loops[1].length, s[1] + p[1] / flat.loops[1].length]; }, [0, 0]);
    near(c[0], -(BA + 8), 1e-3, 'hole centre along the unfold'); near(c[1], -30, 1e-3, 'hole centre along the edge');
  });
  test('flatPattern unfolds a flange on a flange (Z bracket)', function () {
    var r = build(SHEET + '\np.flange(30, [[0, 2, 30]]);\np.flange(25, [[-3, 34, 30]]);');
    noErrors(r);
    var flat = K.flatPattern(r.model, r.build, r.mesh), BA = K.bendAllowance(Math.PI / 2, 2, 2, 0.71);
    near(flat.bbox.max[0] - flat.bbox.min[0], 100 + BA + 30 + BA + 25, 1e-6, 'flat width');
    near(flat.bbox.max[1] - flat.bbox.min[1], 60, 1e-6, 'flat height');
    assert(flat.loops.length === 1 && flat.loops[0].length === 4, 'a plain rectangle blank');
    assert(flat.bends.length === 2 && flat.bends.every(function (b) { return b.up; }), 'two UP bends: ' + JSON.stringify(flat.bends.map(function (b) { return b.label; })));
    var xs = flat.bends.map(function (b) { return b.a[0]; }).sort(function (a, b) { return b - a; });
    near(xs[0], -BA / 2, 1e-6, 'first bend line'); near(xs[1], -(BA + 30 + BA / 2), 1e-6, 'second bend line');
  });
  test('flange placement: Bend Outside / Material Outside / Material Inside envelopes and blanks', function () {
    var BA = K.bendAllowance(Math.PI / 2, 2, 2, 0.71);
    var bo = build(SHEET + '\np.flange(20, [[0, 2, 30]]);');
    var mo = build(SHEET + '\np.flange(20, [[0, 2, 30]], { position: "outside" });');
    var mi = build(SHEET + '\np.flange(20, [[0, 2, 30]], { position: "inside" });');
    [bo, mo, mi].forEach(noErrors);
    near(bo.mp.bbox.min[0], -4, 1e-6, 'bend outside: wall beyond the edge by R + T');
    near(mo.mp.bbox.min[0], -2, 1e-6, 'material outside: inner face at the edge');
    near(mi.mp.bbox.min[0], 0, 1e-6, 'material inside: outer face flush with the edge');
    near(bo.mp.volume - mo.mp.volume, 2 * 2 * 60, 1e-6, 'material outside removes an R-wide strip of base');
    near(bo.mp.volume - mi.mp.volume, 4 * 2 * 60, 1e-6, 'material inside removes an (R + T)-wide strip');
    near(K.flatPattern(bo.model, bo.build, bo.mesh).bbox.max[0] - K.flatPattern(bo.model, bo.build, bo.mesh).bbox.min[0], 120 + BA, 1e-6, 'bend outside blank');
    near(K.flatPattern(mo.model, mo.build, mo.mesh).bbox.max[0] - K.flatPattern(mo.model, mo.build, mo.mesh).bbox.min[0], 118 + BA, 1e-6, 'material outside blank');
    near(K.flatPattern(mi.model, mi.build, mi.mesh).bbox.max[0] - K.flatPattern(mi.model, mi.build, mi.mesh).bbox.min[0], 116 + BA, 1e-6, 'material inside blank');
    var script = K.generateScript(mi.model);
    assert(/position: "inside"/.test(script), 'position emitted: ' + script.split('\n').pop());
    assert(K.generateScript(build(script).model) === script, 'round-trip fixed point');
  });
  test('hem: a 180° flange folded back over the sheet', function () {
    var r = build(SHEET + '\np.hem(15, [[0, 2, 30]]);');
    noErrors(r);
    var f = r.model.features[r.model.features.length - 1];
    assert(f.type === 'flange' && f.hem && f.angle === 180 && Math.abs(f.radius - 0.5) < 1e-9 && /^Hem1$/.test(f.name), 'hem feature: ' + JSON.stringify(f));
    nearVec(r.mp.bbox.max, [100, 2 + 1 + 2, 60], 1e-6, 'return lies gap + T above the sheet');
    near(r.mp.bbox.min[0], -(0.5 + 2), 1e-6, 'hem loop extends R + T beyond the edge');
    var flat = K.flatPattern(r.model, r.build, r.mesh), BA = K.bendAllowance(Math.PI, 0.5, 2, 0.71);
    near(flat.bbox.max[0] - flat.bbox.min[0], 100 + BA + 15, 1e-6, 'flat width');
    assert(flat.bends.length === 1 && /UP 180°/.test(flat.bends[0].label), 'one 180° bend: ' + JSON.stringify(flat.bends.map(function (b) { return b.label; })));
    var script = K.generateScript(r.model);
    assert(/p\.hem\(15, \[\[0,2,30\]\], \{ gap: 1, name: "Hem1" \}\)/.test(script), 'hem emitted: ' + script.split('\n').pop());
    assert(K.generateScript(build(script).model) === script, 'round-trip fixed point');
  });
  test('jog: two bends in one feature, unfolded as UP + DOWN', function () {
    var r = build(SHEET + '\np.jog(10, 30, [[0, 2, 30]]);');
    noErrors(r);
    nearVec(r.mp.bbox.max, [100, 2 + 10 + 2, 60], 1e-6, 'jogged flat sits 10 above the base (face to face)');
    near(r.mp.bbox.min[0], -(2 * 2 + 2 + 30), 1e-6, 'flat extends 2R + T + length beyond the edge');
    var flat = K.flatPattern(r.model, r.build, r.mesh), BA = K.bendAllowance(Math.PI / 2, 2, 2, 0.71);
    near(flat.bbox.max[0] - flat.bbox.min[0], 100 + 2 * BA + (10 - 4) + 30, 1e-6, 'flat width = base + 2 BA + wall + length');
    assert(flat.loops.length === 1 && flat.loops[0].length === 4, 'plain rectangular blank');
    var labels = flat.bends.map(function (b) { return b.label; }).sort().join(' | ');
    assert(/UP 90° R2/.test(labels) && /DOWN 90° R2/.test(labels), 'bends: ' + labels);
    var script = K.generateScript(r.model);
    assert(/p\.jog\(10, 30, \[\[0,2,30\]\], \{ angle: 90, name: "Jog1" \}\)/.test(script), 'jog emitted: ' + script.split('\n').pop());
    assert(K.generateScript(build(script).model) === script, 'round-trip fixed point');
    var down = build(SHEET + '\np.jog(10, 30, [[0, 2, 30]], { reverse: true, angle: 60 });');
    noErrors(down);
    near(down.mp.bbox.min[1], -12, 1e-6, 'reversed 60° jog drops the flat 10 below the base');
    assert(K.flatPattern(down.model, down.build, down.mesh).bends.length === 2, 'two bends unfolded');
  });
  test('flange `toward` picks the fold side from a world direction', function () {
    var up = build(SHEET + '\np.flange(20, [[0, 2, 30]], { toward: [0, 1, 0] });');
    var dn = build(SHEET + '\np.flange(20, [[0, 2, 30]], { toward: [0, -1, 0] });');
    noErrors(up); noErrors(dn);
    near(up.mp.bbox.max[1], 24, 1e-6, 'toward +y folds up'); near(dn.mp.bbox.min[1], -22, 1e-6, 'toward −y folds down');
    near(up.mp.volume, dn.mp.volume, 1e-6, 'same material either way');
  });
  test('flatPattern of a bare base flange is just the outline', function () {
    var r = build(SHEET);
    var flat = K.flatPattern(r.model, r.build, r.mesh);
    assert(flat.loops.length === 1 && flat.loops[0].length === 4 && flat.bends.length === 0, 'plain rectangle expected');
    near(flat.bbox.max[0] - flat.bbox.min[0], 100, 1e-6, 'width');
  });
  test('flatPattern refuses a part without sheet parameters', function () {
    var r = build('p.box(10, 10, 2);');
    var threw = false;
    try { K.flatPattern(r.model, r.build, r.mesh); } catch (e) { threw = /base flange/i.test(e.message); }
    assert(threw, 'expected a "Base Flange" error');
  });
  test('exportDXFFlat writes OUTLINE, HOLES circle, BEND lines and NOTES text', function () {
    var r = build(SHEET + '\np.hole("Top", 50, -30, 10, { offset: 2 });\np.flange(20, [[0, 2, 30]]);\np.flange(15, [[50, 2, 0]], { reverse: true });');
    var dxf = K.exportDXFFlat(K.flatPattern(r.model, r.build, r.mesh), 'mm');
    assert((dxf.match(/\nPOLYLINE\n8\nOUTLINE\n/g) || []).length === 1, 'one OUTLINE polyline');
    assert((dxf.match(/\nCIRCLE\n8\nHOLES\n/g) || []).length === 1, 'one HOLES circle');
    assert((dxf.match(/\nLINE\n8\nBEND\n/g) || []).length === 2, 'two BEND lines');
    assert((dxf.match(/\nTEXT\n8\nNOTES\n/g) || []).length === 3, 'three NOTES texts (2 bend labels + sheet params)');
    assert(dxf.indexOf('T=2 R=2 K=0.71') > 0, 'sheet parameter note');
    assert(dxf.indexOf('UP 90') > 0 && dxf.indexOf('DOWN 90') > 0, 'bend labels');
    assert(/\nEOF$/.test(dxf), 'EOF');
  });
  test('sheet metal parts survive a script round-trip', function () {
    var a = build(SHEET + '\np.flange(20, [[0, 2, 30]], { name: "Lip" });\np.flange(15, [[50, 2, 0]], { reverse: true, angle: 60 });');
    noErrors(a);
    var script = K.generateScript(a.model);
    assert(script.indexOf('p.sheet(') >= 0, 'p.sheet emitted');
    assert(script.indexOf('sheetBase') >= 0, 'sheetBase emitted');
    var b = build(script);
    noErrors(b);
    nearRel(b.mp.volume, a.mp.volume, 1e-9, 'volume');
    assert(JSON.stringify(b.model.sheet) === JSON.stringify(a.model.sheet), 'sheet params');
    assert(K.generateScript(b.model) === script, 'generator is a fixed point');
  });

