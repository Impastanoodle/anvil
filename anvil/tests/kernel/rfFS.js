  // --- rfFS (2026-10-30, lane FS: cuts that miss) --- a script Cut-Extrude given no direction goes into the material
  // as SolidWorks' does (+n, or −n when +n removes nothing) and the direction found is written onto the feature; a
  // cut that removes no material is a rebuild error (an on-purpose refusal, K.isRefusal) and the part before it is
  // kept (kernel-rebuild.js rebuildModel / cutTrial / commitCut, kernel-script.js Builder.extrude).
  (function () {
    group('rfFS: cut direction into the material, an empty cut is an error');
    var PI = Math.PI, BLOCK = 'p.box(40, 30, 20);\nvar blk = p.last();\n';   // x 0..40, y 0..20, z 0..30
    function rfFSlast(r) { return r.model.features[r.model.features.length - 1]; }
    function rfFSbyName(r, name) { return r.model.features.filter(function (x) { return x.name === name; })[0]; }
    test('rfFS: a Cut-Extrude sketched on the top face with no direction cuts down into the block; its feature JSON says reverse: true', function () {
      var r = build(BLOCK + 'p.sketch({ face: blk, normal: [0, 1, 0] }).circle(10, -10, 3).end().cut(5);');
      noErrors(r);
      assert(Object.keys(r.warnings).length === 0, 'no warning: ' + JSON.stringify(r.warnings));
      assert(rfFSlast(r).reverse === true, 'reverse written: ' + rfFSlast(r).reverse);
      nearRel(r.mp.volume, 24000 - 9 * PI * 5, 1e-9, 'block − Ø6 × 5 deep');
      var inside = r.body.pointTester();
      assert(!inside([10, 17, 10]) && inside([10, 14, 10]), 'the hole runs from the top face 5 deep');
      consistentVolume(r);
      return 'volume ' + fmt(r.mp.volume);
    });
    test('rfFS: a cut with no direction whose +n already enters the part keeps +n and says reverse: false', function () {
      var r = build(BLOCK + 'p.sketch("Top", 0).circle(10, -10, 3).end().cut(5);');
      noErrors(r);
      assert(rfFSlast(r).reverse === false, 'reverse written as false: ' + rfFSlast(r).reverse);
      nearRel(r.mp.volume, 24000 - 9 * PI * 5, 1e-9, 'block − Ø6 × 5 deep from the bottom');
      assert(!r.body.pointTester()([10, 3, 10]), 'the hole starts at the bottom face');
    });
    test('rfFS: generateScript writes the direction found and the script rebuilds the same solid; a second rebuild with the cache reuses every feature', function () {
      var r = build(BLOCK + 'p.sketch({ face: blk, normal: [0, 1, 0] }).circle(10, -10, 3).end().cut(5);\np.sketch("Top", 20).rect(25, -20, 10, 10).end().cut("through");');
      noErrors(r);
      var script = K.generateScript(r.model);
      assert((script.match(/reverse: true/g) || []).length === 2, 'two cuts written with reverse: true:\n' + script);
      var b = build(script);
      noErrors(b);
      nearRel(b.mp.volume, r.mp.volume, 1e-12, 'round trip');
      nearRel(r.mp.volume, 24000 - 9 * PI * 5 - 100 * 20, 1e-9, 'block − hole − Through All window');
      assert(b.model.features.filter(function (f) { return f.type === 'extrude' && f.cut && f.reverse === true; }).length === 2, 'both cuts reversed after the round trip');
      var again = K.rebuild(r.model, r.build.cache);
      assert(again.reused === r.model.features.length, 'cache reused after the direction was written: ' + again.reused + ' / ' + r.model.features.length);
    });
    test('rfFS: a build made on a copy (the worker) hands the direction back: packBuild / unpackBuild / applyProfiles write reverse onto the page\'s model', function () {
      var page = K.newModel('W');
      K.runScript(page, BLOCK + 'p.sketch({ face: blk, normal: [0, 1, 0] }).circle(10, -10, 3).end().cut(5);');
      var cutF = page.features[page.features.length - 1];
      assert(cutF.reverse == null, 'no direction before the build: ' + cutF.reverse);
      var copy = JSON.parse(JSON.stringify(page)), built = K.rebuild(copy);
      var back = K.unpackBuild(JSON.parse(JSON.stringify(K.packBuild(built, copy))));
      assert(Object.keys(back.facePlanes).length === Object.keys(built.facePlanes).length, 'facePlanes keys unchanged (the directions ride non-enumerable)');
      K.applyProfiles(page, back.profiles, back.facePlanes);
      assert(cutF.reverse === true, 'reverse written back: ' + cutF.reverse);
    });
    test('rfFS: an explicit reverse: false cut that misses is an error in SolidWorks\' style, an on-purpose refusal, the block kept and the rest built', function () {
      var r = build(BLOCK + 'p.sketch("Top", 20).circle(10, -10, 3).end().cut(5, { reverse: false });\np.sketch("Top", 20).circle(30, -20, 2).end().cut("through", { reverse: true });');
      var c1 = rfFSbyName(r, 'Cut-Extrude1'), e = r.errors[c1.id] || '';
      assert(Object.keys(r.errors).length === 1 && /The cut does not intersect the model/.test(e), 'errors: ' + JSON.stringify(r.errors));
      assert(K.isRefusal(e), 'K.isRefusal counts it (ui-occt.js keeps OpenCascade from building it)');
      assert(c1.reverse === false, 'the explicit direction is kept: ' + c1.reverse);
      nearRel(r.mp.volume, 24000 - 4 * PI * 20, 1e-9, 'block − the later hole only');
      return e;
    });
    test('rfFS: a cut with no direction that misses on both sides is the same error and stays without a direction', function () {
      var r = build(BLOCK + 'p.sketch("Top", 20).circle(100, -10, 3).end().cut(5);');
      var f = rfFSlast(r);
      assert(/does not intersect the model/.test(r.errors[f.id] || ''), 'errors: ' + JSON.stringify(r.errors));
      assert(f.reverse == null, 'no direction written: ' + f.reverse);
      near(r.mp.volume, 24000, 1e-9, 'block kept');
    });
    test('rfFS: Through All with no direction: from a mid-plane it keeps +n (the upper half); from the top face it turns into the block', function () {
      var mid = build(BLOCK + 'p.sketch("Top", 10).circle(10, -10, 3).end().cut("through");');
      noErrors(mid);
      assert(rfFSlast(mid).reverse === false, 'mid-plane: +n kept');
      nearRel(mid.mp.volume, 24000 - 9 * PI * 10, 1e-9, 'block − the upper half of a Ø6 hole');
      var top = build(BLOCK + 'p.sketch("Top", 20).circle(10, -10, 3).end().cut("through");');
      noErrors(top);
      assert(rfFSlast(top).reverse === true, 'top face: reversed');
      nearRel(top.mp.volume, 24000 - 9 * PI * 20, 1e-9, 'block − a Ø6 hole through');
      var two = build(BLOCK + 'p.sketch("Top", 20).circle(10, -10, 3).end().cut(5, { both: true });');
      noErrors(two);
      assert(rfFSlast(two).reverse === false, 'a two-direction cut is left alone');
      nearRel(two.mp.volume, 24000 - 9 * PI * 5, 1e-9, 'its lower half cuts');
    });
    test('rfFS: box / cylinder cuts stay where `at` puts them; a hole keeps its own direction', function () {
      var r = build(BLOCK + 'p.box(5, 5, 5, { at: [10, 25, 10], cut: true });');
      assert(/does not intersect the model/.test(r.errors[rfFSlast(r).id] || ''), 'a box above the block misses: ' + JSON.stringify(r.errors));
      var h = build(BLOCK + 'p.hole("Top", 10, -10, 6, { offset: 20 });');
      noErrors(h);
      nearRel(h.mp.volume, 24000 - 9 * PI * 20, 1e-9, 'hole through');
    });
    // feature-stack fuzz outliers (lane FS's own 400-part fuzz, seeds 12345 / 777: FN's generator was not kept)
    function rfFScracks(r) {
      var n = 0;
      (r.build.bodies || []).forEach(function (b) { var c = Evaluate.checkBody(b); n += c.openEdges.length + c.nonManifoldEdges.length; });
      return n;
    }
    test('rfFS: fuzz #146: a shell after a fillet, a revolved groove and its pattern is watertight (was 13 open edges: a hole outline offset onto itself left a zero-width spike, now dropped)', function () {
      var code = 'p.box(29, 28, 26);\np.fillet(4, [[14.5, 26, 28]]);\np.sketch("Front").rect(27, 2, 5, 2).end().revolveCut(360, { axis: "y" });\np.linearPattern({ dir: "x", spacing: 13, count: 4 });\n';
      var before = build(code), r = build(code + 'p.shell(1, [[14.5, 26, 14]]);\np.sketch("Right", 29).circle(-18, 15, 1).end().cut("through");');
      noErrors(r);
      assert(rfFScracks(r) === 0, 'open / non-manifold edges: ' + rfFScracks(r));
      assert(K.shellGuard.last && K.shellGuard.last.tries === 1, 'built on the first try: ' + JSON.stringify(K.shellGuard.last));
      assert(r.mp.volume < 0.25 * before.mp.volume && r.mp.volume > 0.2 * before.mp.volume, 'a 1 mm shell of the part: ' + fmt(r.mp.volume) + ' of ' + fmt(before.mp.volume));
      var sp = K._.dropSpikes([[0, 0], [10, 0], [10, 1], [5, 1], [2, 1 + 1e-15], [5, 1], [0, 1]], 1e-9);
      assert(sp.length === 5 && !sp.some(function (q) { return q[0] === 2; }), 'a spike out and back along one line is dropped: ' + JSON.stringify(sp));
      return 'volume ' + fmt(r.mp.volume);
    });
    test('rfFS: fuzz #82 / #114: a shell whose walls would offset into a neighbouring face (a slot cut by a hole, a shell of a shell) is refused with a plain message, the part kept, not an on-purpose refusal (OpenCascade may build it); the rest builds', function () {
      var pre = 'p.box(44, 24, 26);\np.sketch("Top", 26).slot(3, -16, 35, -13, 4).end().cut(8);\np.sketch("Top", 26).circle(21, -14, 5).end().cut(9, { reverse: true });\n';
      var before = build(pre), r = build(pre + 'p.shell(2, [[22, 26, 12]]);\np.hole("Top", 12, -21, 3, { offset: 26 });');
      var e = r.errors[rfFSbyName(r, 'Shell1').id] || '';
      assert(Object.keys(r.errors).length === 1 && /^Failed to shell the part/.test(e) && /\.$/.test(e), 'errors: ' + JSON.stringify(r.errors));
      assert(!K.isRefusal(e), 'Anvil\'s own limit, not a refusal');
      nearRel(r.mp.volume, before.mp.volume - 1.5 * 1.5 * PI * 26, 1e-9, 'the part before the shell − the later hole');
      assert(rfFScracks(r) === 0, 'watertight');
      var s = build('p.box(36, 26, 26);\np.sketch("Top", 26).slot(15, -5, 31, -21, 2).end().cut(20);\np.sketch("Front", 26).rect(28, 13, 3, 8).end().cut(9);\np.sketch("Top", 26).circle(31, -19, 4).end().cut(4, { reverse: true });\np.shell(3, [[18, 26, 13]]);\np.shell(1, [[18, 26, 13]]);');
      assert(/^Failed to shell the part/.test(s.errors[rfFSbyName(s, 'Shell2').id] || ''), 'shell of a shell: ' + JSON.stringify(s.errors));
      assert(rfFScracks(s) === 0, 'watertight after the refused shell');
      return e;
    });
    test('rfFS: Mirrored clevis: the cross hole goes through both arms, 37440 + 648π', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Mirrored clevis'; })[0];
      var r = buildExample(ex);
      noErrors(r);
      assert(Object.keys(r.warnings).length === 0, 'no warning: ' + JSON.stringify(r.warnings));
      nearRel(r.mp.volume, 37440 + 648 * PI, 1e-9, 'block + arm − hole, mirrored');
      var inside = r.body.pointTester();
      assert(!inside([24, 24, -6]) && !inside([-24, 24, -6]) && inside([24, 28, -6]), 'the hole is in both arms at y 24, z −6');
      consistentVolume(r);
    });
  })();
