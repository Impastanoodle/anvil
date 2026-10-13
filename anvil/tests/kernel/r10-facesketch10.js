  // --- r10/facesketch10 ---
  (function () {
    group('Sketches on faces follow the face (face references, r10/facesketch10)');
    // a 60 × 40 base (Top, depth D), a Ø10 × 5 boss sketched on its top face and two blind Ø9 × 6 M8 holes placed on
    // the same face with the Hole Wizard
    var HOLES = 2 * Math.PI * 4.5 * 4.5 * 6;
    function baseCode(D) {
      return 'var base = p.sketch("Top").rect(0, -40, 60, 40).extrude(' + D + ', { name: "Base" }).last();\n' +
        'p.sketch({ face: base, normal: [0, 1, 0] }, 0, "Top sketch").circle(30, -20, 5).extrude(5, { name: "Boss" });\n' +
        'p.holeWizard({ face: { face: base, normal: [0, 1, 0] }, points: [[10, -10], [50, -30]], type: "hole", size: "M8", depth: 6 });';
    }
    function vBase(D) { return 60 * 40 * D + Math.PI * 25 * 5 - HOLES; }
    function byName(m, n) { return m.features.filter(function (f) { return f.name === n; })[0]; }
    function maxY(r) { return r.body.getBounds().max[1]; }

    test('tidyPlane(planeFromFace(...)) cleans float noise: 9.999999999999998 -> 10, 1e-17 -> 0 (the stored frame is exact)', function () {
      var pl = K.tidyPlane(K.planeFromFace([1e-17, 0.9999999999999999, -2e-16], [3, 9.999999999999998, 4]));
      assert(pl.offset === 10, 'offset ' + pl.offset);
      assert(JSON.stringify(pl.n) === '[0,1,0]' && JSON.stringify(pl.origin) === '[0,10,0]', JSON.stringify(pl));
      assert(JSON.stringify(pl.x) === '[1,0,0]' && JSON.stringify(pl.y) === '[0,0,-1]', JSON.stringify(pl));
      var sl = K.tidyPlane(K.planeFromFace([0.6, 0.8, 0], [0, 0, 0]));
      near(sl.n[0] * sl.n[0] + sl.n[1] * sl.n[1], 1, 1e-15, 'a slanted normal stays unit length');
    });

    test('thicken the base 10 -> 15: the face sketch, its boss and the Hole Wizard holes move up with the face', function () {
      var r = build(baseCode(10));
      noErrors(r);
      nearRel(r.mp.volume, vBase(10), 1e-9, 'volume at 10');
      near(maxY(r), 15, 1e-9, 'boss top at 10 + 5');
      var sk = byName(r.model, 'Top sketch');
      assert(sk.plane.face && sk.plane.face.role === 'cap' && sk.plane.offset === 10, JSON.stringify(sk.plane));
      byName(r.model, 'Base').depth = 15;
      var b2 = K.rebuild(r.model, r.build.cache), m2 = K.meshFromBody(b2.body), v2 = K.massProps(m2, 1).volume;
      assert(!Object.keys(b2.errors).length, JSON.stringify(b2.errors));
      assert(!Object.keys(b2.warnings).length, JSON.stringify(b2.warnings));
      nearRel(v2, vBase(15), 1e-9, 'volume at 15 (the boss and both holes are still whole)');
      near(b2.body.getBounds().max[1], 20, 1e-9, 'boss top at 15 + 5');
      assert(sk.plane.offset === 15 && JSON.stringify(sk.plane.origin) === '[0,15,0]', 'sketch plane ' + JSON.stringify(sk.plane));
      assert(JSON.stringify(sk.plane.x) === '[1,0,0]' && JSON.stringify(sk.plane.y) === '[0,0,-1]', 'in-plane orientation kept');
      var hs = r.model.features.filter(function (f) { return f.type === 'sketch' && f.id !== sk.id && f.plane.custom; })[0];
      assert(hs && hs.plane.offset === 15, 'hole positions sketch ' + JSON.stringify(hs && hs.plane));
      // the next rebuild reuses everything (the resolved plane is part of the cache key)
      var b3 = K.rebuild(r.model, b2.cache);
      assert(b3.reused === r.model.features.length, 'reused ' + b3.reused + ' of ' + r.model.features.length);
      // thinner again: the holes still start at the face (no hole floating above the part)
      byName(r.model, 'Base').depth = 8;
      var b4 = K.rebuild(r.model, b3.cache);
      nearRel(K.massProps(K.meshFromBody(b4.body), 1).volume, vBase(8), 1e-9, 'volume at 8');
      return 'volume ' + v2.toFixed(3) + ', sketch offset ' + sk.plane.offset;
    });

    test('a face sketch on a reversed / mid-plane extrude, and on the floor of a pocket, follows the right face', function () {
      // bottom face of a mid-plane block (normal -y): a downward boss hangs from y = -D/2
      var r = build('var b = p.sketch("Top").rect(0, -20, 20, 20).extrude(10, { midplane: true }).last();\n' +
        'p.sketch({ face: b, normal: [0, -1, 0] }, 0, "Under").circle(-10, -10, 3).extrude(4);');
      noErrors(r);
      near(r.body.getBounds().min[1], -9, 1e-9, 'hangs to -5 - 4');
      r.model.features[1].depth = 16;
      var b2 = K.rebuild(r.model);
      near(b2.body.getBounds().min[1], -12, 1e-9, 'hangs to -8 - 4');
      // pocket floor: a 6 deep cut from the top of a 20 block, a boss of 3 on its floor (normal +y)
      var c = build('p.box(40, 40, 20);\nvar pk = p.sketch("Top", 20).rect(10, -30, 20, 20).cut(6, { reverse: true }).last();\n' +
        'p.sketch({ face: pk, normal: [0, 1, 0] }, 0, "Floor").circle(20, -20, 4).extrude(3);');
      noErrors(c);
      nearRel(c.mp.volume, 40 * 40 * 20 - 20 * 20 * 6 + Math.PI * 16 * 3, 1e-9, 'pin on the floor at 14');
      assert(c.model.features.filter(function (f) { return f.name === 'Floor'; })[0].plane.offset === 14, 'floor at 14');
      c.model.features.filter(function (f) { return f.type === 'extrude' && f.cut; })[0].depth = 10;
      var c2 = K.rebuild(c.model);
      nearRel(K.massProps(K.meshFromBody(c2.body), 1).volume, 40 * 40 * 20 - 20 * 20 * 10 + Math.PI * 16 * 3, 1e-9, 'pin on the floor at 10');
    });

    test('faceRef: an extrude cap is a "cap" reference; a face the cap formula does not give (revolve step) is "geom" and follows the nearest face of that feature', function () {
      var r = build('p.sketch("Front").polyline([[0,0],[20,0],[20,10],[10,10],[10,20],[0,20]], true).revolve(360, { axis: { x1: 0, y1: 0, x2: 0, y2: 1 }, name: "Rev" });');
      noErrors(r);
      var rev = r.model.features[1], pl = K.planeFromFace([0, 1, 0], [0, 20, 0]);
      var fr = K.faceRef(r.model, rev.id, pl, r.build.planes);
      assert(fr && fr.role === 'geom' && fr.feature === rev.id, JSON.stringify(fr));
      pl.face = fr;
      r.model.features.push({ id: r.model.nextId++, type: 'sketch', name: 'OnTop', plane: pl, entities: [{ t: 'circle', cx: 0, cy: 0, r: 4 }] });
      r.model.features.push({ id: r.model.nextId++, type: 'extrude', sketch: r.model.nextId - 2, depth: 5, end: 'blind' });
      var b = K.rebuild(r.model);
      near(b.body.getBounds().max[1], 25, 1e-9, 'pin on top at 20');
      var poly = r.model.features[0].entities[0];
      poly.pts[4][1] = 24; poly.pts[5][1] = 24;   // the top step 20 -> 24
      var b2 = K.rebuild(r.model);
      assert(!Object.keys(b2.errors).length, JSON.stringify(b2.errors));
      near(b2.body.getBounds().max[1], 29, 1e-9, 'pin follows the top to 24');
      assert(r.model.features[2].plane.offset === 24 && r.model.features[2].plane.face.role === 'geom', JSON.stringify(r.model.features[2].plane));
    });

    test('delete the face\'s feature: the sketch keeps its plane with a "dangling" warning, no error, no crash', function () {
      var r = build('var base = p.sketch("Top").rect(0, -40, 60, 40).extrude(10).last();\n' +
        'var blk = p.sketch({ face: base, normal: [0, 1, 0] }).rect(10, -30, 20, 20).extrude(5, { name: "Block" }).last();\n' +
        'p.sketch({ face: blk, normal: [0, 1, 0] }, 0, "On block").circle(20, -20, 3).extrude(4);');
      noErrors(r);
      nearRel(r.mp.volume, 24000 + 2000 + Math.PI * 9 * 4, 1e-9, 'before');
      var blk = byName(r.model, 'Block'), sk = byName(r.model, 'On block');
      assert(sk.plane.offset === 15, 'on the block at 15');
      r.model.features = r.model.features.filter(function (f) { return f !== blk; });
      var b = K.rebuild(r.model);
      assert(!Object.keys(b.errors).length, 'errors ' + JSON.stringify(b.errors));
      assert(/Dangling/.test(b.warnings[sk.id] || ''), 'warning: ' + JSON.stringify(b.warnings));
      assert(sk.plane.offset === 15 && sk.plane.face.feature === blk.id, 'stored plane kept ' + JSON.stringify(sk.plane));
      nearRel(K.massProps(K.meshFromBody(b.body), 1).volume, 24000 + Math.PI * 9 * 4, 1e-9, 'the pin stays where it was');
      // a face reference to a feature after the sketch is dangling too
      sk.plane.face.feature = r.model.features[r.model.features.length - 1].id;
      assert(/Dangling/.test(K.rebuild(r.model).warnings[sk.id] || ''), 'later feature');
      return b.warnings[sk.id];
    });

    test('old models: a frozen custom plane (no face reference) stays exactly where it was', function () {
      var r = build('p.sketch("Top").rect(0, -40, 60, 40).extrude(10, { name: "Base" });\n' +
        'p.sketch({ custom: true, origin: [0, 10, 0], x: [1, 0, 0], y: [0, 0, -1], n: [0, 1, 0], offset: 10 }).circle(30, -20, 5).extrude(5);');
      noErrors(r);
      byName(r.model, 'Base').depth = 15;
      var b = K.rebuild(r.model);
      assert(JSON.stringify(r.model.features[2].plane) === JSON.stringify({ custom: true, origin: [0, 10, 0], x: [1, 0, 0], y: [0, 0, -1], n: [0, 1, 0], offset: 10 }), JSON.stringify(r.model.features[2].plane));
      nearRel(K.massProps(K.meshFromBody(b.body), 1).volume, 60 * 40 * 15, 1e-9, 'the buried boss adds nothing');
    });

    test('script round trip: generateScript writes the face reference by variable; runScript gives the same model and it still follows the face', function () {
      var r = build('p.sketch("Front").rect(0, 0, 5, 5).extrude(1, { name: "Spacer" });\n' + baseCode(10));
      noErrors(r);
      r.model.features = r.model.features.filter(function (f) { return f.name !== 'Spacer' && f.id !== 1; });   // ids no longer start at 1
      var b0 = K.rebuild(r.model), v0 = K.massProps(K.meshFromBody(b0.body), 1).volume;
      var s1 = K.generateScript(r.model);
      assert(/"face":\{"feature":f\d+,"role":"cap","cap":"far"\}/.test(s1), s1);   // r11/faceref11: the cap is written too
      var m2 = K.newModel('RT'); K.runScript(m2, s1);
      var b2 = K.rebuild(m2), v2 = K.massProps(K.meshFromBody(b2.body), 1).volume;
      nearRel(v2, v0, 1e-12, 'same volume');
      var sk2 = byName(m2, 'Top sketch');
      assert(K.findFeature(m2, sk2.plane.face.feature).name === 'Base', 'references Base');
      function norm(s) { return s.replace(/\bf\d+\b/g, 'f#'); }
      assert(norm(K.generateScript(m2)) === norm(s1), 'second generation identical (up to variable names)');
      byName(m2, 'Base').depth = 15;
      nearRel(K.massProps(K.meshFromBody(K.rebuild(m2).body), 1).volume, vBase(15), 1e-9, 'round-tripped model follows the face');
    });

    test('worker builds: packBuild / unpackBuild carry build.facePlanes and applyProfiles writes them onto the model', function () {
      var r = build(baseCode(10));
      var copy = JSON.parse(JSON.stringify(r.model));
      byName(copy, 'Base').depth = 12; byName(r.model, 'Base').depth = 12;
      var u = K.unpackBuild(K.packBuild(K.rebuild(copy)));
      var sk = byName(r.model, 'Top sketch');
      assert(sk.plane.offset === 10, 'not yet applied');
      K.applyProfiles(r.model, u.profiles, u.facePlanes);
      assert(sk.plane.offset === 12 && sk.plane.face, JSON.stringify(sk.plane));
      var c = K.cacheFromBuild(r.model, u), b = K.rebuild(r.model, c);
      assert(b.reused === r.model.features.length, 'cache keys agree after applying: reused ' + b.reused);
    });
  })();
  // --- end r10/facesketch10 ---

