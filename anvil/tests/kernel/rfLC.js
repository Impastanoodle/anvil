  // --- rfLC (lane sketchref) --- sketch reference geometry follows the model (SolidWorks external references): a
  // fix / onEdge relation with `mref` (kernel-sketch.js modelRefFor / resolveModelRef / resolveSketchRefs) is re-found
  // on the bodies before the sketch at every rebuild; one that is gone is Dangling and the part still builds
  (function () {
    if (typeof Kernel === 'undefined' || typeof SketchSolver === 'undefined' || !Kernel.resolveSketchRefs) return;
    var K = Kernel, S = SketchSolver;
    group('rfLC: sketch references to the model follow it');
    function rfLCvol(b) { return K.massProps(K.meshFromBody(b.body), 1).volume; }
    function rfLCsk(m, id) { return m.features.filter(function (x) { return x.id === id; })[0]; }
    function rfLCplane(m, sk, b) { return K.resolvePlane(sk.plane, m, b.planes); }
    function rfLCfids(m, sk) { return m.features.slice(0, m.features.indexOf(sk)).map(function (x) { return x.id; }); }
    // a construction line on model edge a-b (3D), held Fixed / On Edge and named to the edge
    function rfLCref(m, sk, b, a3, b3, type) {
      var pl = rfLCplane(m, sk, b), a = K.to2D(pl, a3), c = K.to2D(pl, b3);
      sk.entities.push({ t: 'line', x1: a[0], y1: a[1], x2: c[0], y2: c[1], construction: true });
      var i = sk.entities.length - 1, r = S.addRelation(sk, type || 'fix', [String(i)]);
      assert(r.ok, r.error);
      var mref = K.modelRefFor(b.bodies, { k: 'edge', a: a3, b: b3 }, { fids: rfLCfids(m, sk) });
      assert(mref && mref.k === 'edge' && mref.sig.length === 2, 'edge named: ' + JSON.stringify(mref));
      sk.rels[r.rels[0]].mref = mref;
      return i;
    }
    // (a) base 4 x 3, Edge Flange 1.5 on the x = 0 edge; a Ø.25 hole on the flange's outer face, .5 from its free edge
    // and .75 from its side edge, Cut-Extrude through; the flange made 2.5 long
    function rfLCflange() {
      var m = K.newModel('rfLC-a');
      K.runScript(m, 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1.5, [[0, 0.06, 1.5]]);\np.sketch({ face: 3, normal: [-1, 0, 0], role: "geom", offset: 0.12 });');
      var b = K.rebuild(m), sk = m.features[m.features.length - 1], pl = rfLCplane(m, sk, b);
      sk.entities = []; sk.rels = [];
      var free = rfLCref(m, sk, b, [-0.12, 1.62, 0], [-0.12, 1.62, 3]), side = rfLCref(m, sk, b, [-0.12, 0.2, 0], [-0.12, 1.62, 0]);
      var hc = K.to2D(pl, [-0.12, 1.1, 0.7]);
      sk.entities.push({ t: 'circle', cx: hc[0], cy: hc[1], r: 0.125 });
      var h = String(sk.entities.length - 1);
      assert(S.addRelation(sk, 'distance', [h, String(free)], { value: 0.5 }).ok && S.addRelation(sk, 'distance', [h, String(side)], { value: 0.75 }).ok, 'dimensions to the model edges');
      sk.dims = [{ e: +h, k: 'dia' }];
      m.features.push({ type: 'extrude', sketch: sk.id, depth: 0, end: 'through', cut: true, name: 'Cut-Extrude1', id: m.nextId++ });
      return { m: m, sk: sk, h: +h, pl: pl };
    }
    test('rfLC: a hole dimensioned .5 from an Edge Flange\'s free edge stays .5 from it when the flange goes from 1.5 to 2.5 long (folded and in the flat pattern)', function () {
      var t = rfLCflange(), m = t.m, b = K.rebuild(m);
      assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
      var c0 = K.to3D(t.pl, t.sk.entities[t.h].cx, t.sk.entities[t.h].cy);
      near(c0[1], 1.12, 1e-9, 'hole .5 below the free edge (y 1.62)'); near(c0[2], 0.75, 1e-9, 'hole .75 from the side edge');
      m.features.filter(function (x) { return x.type === 'flange'; })[0].length = 2.5;
      b = K.rebuild(m);
      assert(!Object.keys(b.errors).length && !b.warnings[t.sk.id], JSON.stringify([b.errors, b.warnings]));
      var e = t.sk.entities[t.h], c = K.to3D(t.pl, e.cx, e.cy);
      near(c[1], 2.12, 1e-9, 'hole .5 below the new free edge (y 2.62)'); near(c[2], 0.75, 1e-9, 'still .75 from the side edge');
      near(t.sk.entities[0].y1, t.sk.entities[0].y2, 1e-12, 'free edge line level');
      var fp = K.flatPattern(m, b, K.meshFromBody(b.body)), outer = fp.loops[0].pts || fp.loops[0], hole = fp.loops[1] && (fp.loops[1].pts || fp.loops[1]);
      assert(fp.loops.length === 2 && hole, 'outline and hole in the flat: ' + fp.loops.length);
      var lo = Math.min.apply(null, outer.map(function (q) { return q[0]; })), hx = hole.map(function (q) { return q[0]; }), hy = hole.map(function (q) { return q[1]; });
      near((Math.min.apply(null, hx) + Math.max.apply(null, hx)) / 2 - lo, 0.5, 2e-3, 'flat: hole centre .5 from the flange end');
      near(-(Math.min.apply(null, hy) + Math.max.apply(null, hy)) / 2, 0.75, 2e-3, 'flat: .75 from the side');
      return 'hole at y ' + c[1].toFixed(4) + ', flat ' + fp.size.map(function (x) { return x.toFixed(3); }).join(' x ');
    });
    // (b) block 4 x 3 x .5; on its top face the face outline converted (On Edge, named), offset .25 inward (Offset
    // relation + dimension), Cut-Extrude .1 deep: a pocket 3.5 x 2.5; the block made 5 wide: the pocket 4.5 x 2.5
    function rfLCpocket(named) {
      var m = K.newModel('rfLC-b');
      K.runScript(m, 'p.units("in");\np.sketch("Top").rect(0, -3, 4, 3).extrude(0.5);\np.sketch({ face: 2, normal: [0, 1, 0] });');
      var b = K.rebuild(m), sk = m.features[m.features.length - 1];
      sk.entities = []; sk.rels = [];
      var P = [[0, 0.5, 0], [4, 0.5, 0], [4, 0.5, 3], [0, 0.5, 3]];
      for (var k = 0; k < 4; k++) rfLCref(m, sk, b, P[k], P[(k + 1) % 4], 'onEdge');
      if (!named) sk.rels.forEach(function (r) { delete r.mref; });
      var pl = rfLCplane(m, sk, b), tryIt = JSON.parse(JSON.stringify(sk)), r0 = S.offsetSelection(tryIt, [0, 1, 2, 3], { d: 0.25, chain: true, dims: true, reverse: false });
      var inside = r0.ok && r0.added.every(function (i) { var e = tryIt.entities[i], q = K.to3D(pl, e.x1, e.y1); return q[0] > 0.1 && q[0] < 3.9; });
      var r = S.offsetSelection(sk, [0, 1, 2, 3], { d: 0.25, chain: true, dims: true, reverse: !inside });
      assert(r.ok && r.added.length === 4, r.error);
      m.features.push({ type: 'extrude', sketch: sk.id, depth: 0.1, end: 'blind', cut: true, name: 'Cut-Extrude1', id: m.nextId++ });
      return { m: m, sk: sk };
    }
    test('rfLC: Convert Entities of a face outline + Offset .25 inward + Cut-Extrude .1: the pocket follows the block from 4 x 3 to 5 x 3 (volume 6 - .875 -> 7.5 - 1.125)', function () {
      var t = rfLCpocket(true), m = t.m, b = K.rebuild(m);
      assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
      nearRel(rfLCvol(b), 6 - 3.5 * 2.5 * 0.1, 1e-9, 'pocket 3.5 x 2.5 x .1');
      m.features[0].entities[0].w = 5;
      b = K.rebuild(m);
      assert(!Object.keys(b.errors).length && !b.warnings[t.sk.id], JSON.stringify([b.errors, b.warnings]));
      nearRel(rfLCvol(b), 7.5 - 4.5 * 2.5 * 0.1, 1e-9, 'pocket 4.5 x 2.5 x .1');
      assert(S.analyze(t.sk).status === 'full', 'still fully defined: ' + S.analyze(t.sk).status);
      return 'volume ' + rfLCvol(b).toFixed(6);
    });
    test('rfLC: a sketch from before (Fix / On Edge with no model reference) builds exactly as before: the pocket stays where it was drawn', function () {
      var t = rfLCpocket(false), m = t.m, b = K.rebuild(m), before = JSON.stringify(t.sk.entities);
      m.features[0].entities[0].w = 5;
      b = K.rebuild(m);
      assert(!Object.keys(b.errors).length && !b.warnings[t.sk.id], JSON.stringify([b.errors, b.warnings]));
      assert(JSON.stringify(t.sk.entities) === before, 'entities unchanged');
      nearRel(rfLCvol(b), 7.5 - 3.5 * 2.5 * 0.1, 1e-9, 'pocket still 3.5 x 2.5');
      return 'ok';
    });
    test('rfLC: generateScript / runScript keep the model references (mref) and the copy follows the model too; packBuild / unpackBuild / applyProfiles carry the moved sketch', function () {
      var t = rfLCpocket(true), m = t.m;
      K.rebuild(m);
      var code = K.generateScript(m);
      assert(/"mref":\{"k":"edge"/.test(code), 'script carries mref');
      var m2 = K.newModel('x');
      K.runScript(m2, code);
      var s2 = m2.features.filter(function (x) { return x.type === 'sketch'; })[1];
      assert(s2.rels.filter(function (r) { return r.mref; }).length === 4, 'four named refs: ' + JSON.stringify(s2.rels));
      m2.features[0].entities[0].w = 5;
      var b2 = K.rebuild(m2);
      nearRel(rfLCvol(b2), 7.5 - 4.5 * 2.5 * 0.1, 1e-9, 'the copy follows');
      // a worker build: the original model gets the moved sketch from the packed result
      var m3 = JSON.parse(JSON.stringify(m)), copy = JSON.parse(JSON.stringify(m));
      m3.features[0].entities[0].w = 5; copy.features[0].entities[0].w = 5;
      var u = K.unpackBuild(K.packBuild(K.rebuild(copy), copy));
      K.applyProfiles(m3, u.profiles, u.facePlanes);
      var xs = m3.features[2].entities.map(function (e) { return Math.max(e.x1, e.x2); });
      near(Math.max.apply(null, xs), 5, 1e-9, 'applied: the converted outline reaches x 5');
      return code.split('\n').length + ' lines';
    });
    test('rfLC: a round edge (a hole\'s rim) and a block corner as references: a boss circle concentric with the hole and a point on the corner follow when the hole moves and the block grows', function () {
      var m = K.newModel('rfLC-r');
      K.runScript(m, 'p.units("in");\np.sketch("Top").rect(0, -3, 4, 3).extrude(0.5);\np.sketch("Top").circle(1, -1, 0.25).cut("through");\np.sketch({ face: 2, normal: [0, 1, 0] });');
      var b = K.rebuild(m), sk = m.features[m.features.length - 1], pl = rfLCplane(m, sk, b), fids = rfLCfids(m, sk);
      var rim = K.modelRefFor(b.bodies, { k: 'circle', c: [1, 0.5, 1], n: [0, 1, 0], r: 0.25, full: true }, { fids: fids });
      var corner = K.modelRefFor(b.bodies, { k: 'vertex', p: [4, 0.5, 3] }, { fids: fids });
      assert(rim && rim.k === 'circle' && corner && corner.k === 'vertex' && corner.sigs.length === 3, JSON.stringify([rim, corner]));
      var c = K.to2D(pl, [1, 0.5, 1]), q = K.to2D(pl, [4, 0.5, 3]);
      sk.entities = [{ t: 'circle', cx: c[0], cy: c[1], r: 0.25, construction: true }, { t: 'point', x: q[0], y: q[1], construction: true }, { t: 'circle', cx: c[0], cy: c[1], r: 0.5 }];
      sk.rels = [];
      S.addRelation(sk, 'fix', ['0']); S.addRelation(sk, 'fix', ['1']);
      sk.rels[0].mref = rim; sk.rels[1].mref = corner;
      assert(S.addRelation(sk, 'concentric', ['2', '0']).ok, 'concentric');
      m.features[2].entities[0].cx = 2; m.features[2].entities[0].cy = -1.5;
      m.features[0].entities[0].w = 5;
      b = K.rebuild(m);
      assert(!Object.keys(b.errors).length && !b.warnings[sk.id], JSON.stringify([b.errors, b.warnings]));
      var c3 = K.to3D(pl, sk.entities[2].cx, sk.entities[2].cy), p3 = K.to3D(pl, sk.entities[1].x, sk.entities[1].y);
      near(c3[0], 2, 1e-9, 'boss circle x'); near(c3[2], 1.5, 1e-9, 'boss circle z'); near(sk.entities[2].r, 0.5, 1e-12, 'r kept');
      near(p3[0], 5, 1e-9, 'corner x'); near(p3[2], 3, 1e-9, 'corner z');
      return 'ok';
    });
    test('rfLC: the feature that made a referenced edge deleted: the reference is Dangling (warning, rel.dangling), the hole stays where it was and the part still builds', function () {
      var m = K.newModel('rfLC-c');
      K.runScript(m, 'p.units("in");\np.sketch("Top").rect(0, -3, 4, 3).extrude(0.5);\np.sketch("Top").rect(3, -1, 1, 1).cut("through");\np.sketch({ face: 2, normal: [0, 1, 0] });');
      var b = K.rebuild(m), sk = m.features[m.features.length - 1], pl = rfLCplane(m, sk, b);
      assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
      sk.entities = []; sk.rels = [];
      var notch = rfLCref(m, sk, b, [3, 0.5, 0], [3, 0.5, 1]);
      var hc = K.to2D(pl, [2, 0.5, 0.5]);
      sk.entities.push({ t: 'circle', cx: hc[0], cy: hc[1], r: 0.125 });
      assert(S.addRelation(sk, 'distance', ['1', String(notch)], { value: 1 }).ok, 'dimension to the notch edge');
      m.features.push({ type: 'extrude', sketch: sk.id, depth: 0, end: 'through', cut: true, name: 'Cut-Extrude2', id: m.nextId++ });
      b = K.rebuild(m);
      assert(!Object.keys(b.errors).length && !b.warnings[sk.id], JSON.stringify([b.errors, b.warnings]));
      var v0 = rfLCvol(b);
      m.features = m.features.filter(function (x) { return x.id !== 3 && x.id !== 4; });
      b = K.rebuild(m);
      assert(!Object.keys(b.errors).length, 'still builds: ' + JSON.stringify(b.errors));
      assert(/^Dangling: 1 sketch relation/.test(b.warnings[sk.id] || ''), 'warning: ' + b.warnings[sk.id]);
      assert(sk.rels.some(function (r) { return r.dangling; }), 'rel.dangling');
      var c = K.to3D(pl, sk.entities[1].cx, sk.entities[1].cy);
      near(c[0], 2, 1e-9, 'hole stays at x 2'); near(c[2], 0.5, 1e-9, 'z .5');
      nearRel(rfLCvol(b), 6 - Math.PI * 0.125 * 0.125 * 0.5, 1e-6, 'block with the hole');
      return 'before ' + v0.toFixed(5) + ', now ' + rfLCvol(b).toFixed(5);
    });
  })();
