  // --- rfLW (lane sketchref2) --- sketch references to the model, the rest: a model snap adds only the relation
  // (Coincident / Midpoint to the model vertex / edge itself: refs [point, 'M'], rel.ext + rel.mref, no reference
  // entity); Intersection Curve pieces (mref k 'xsect'), a tilted model circle seen as an ellipse and a snap on a partial
  // arc keep their reference and follow the model; a file saved this morning (reference entity + Fix with mref) still
  // opens and follows
  (function () {
    if (typeof Kernel === 'undefined' || typeof SketchSolver === 'undefined' || !Kernel.resolveSketchRefs || !SketchSolver.isExtRel) return;
    var K = Kernel, S = SketchSolver;
    group('rfLW: sketch references to the model, the rest');
    function rfLWplane(m, sk, b) { return K.resolvePlane(sk.plane, m, b.planes); }
    function rfLWfids(m, sk) { return m.features.slice(0, m.features.indexOf(sk)).map(function (x) { return x.id; }); }
    function rfLWvol(b) { return K.massProps(K.meshFromBody(b.body), 1).volume; }
    function rfLW2(pl, p) { var q = K.to2D(pl, p); return [Math.round(q[0] * 1e9) / 1e9, Math.round(q[1] * 1e9) / 1e9]; }
    // block 4 x 3 x .5 (x 0..4, y 0..0.5, z 0..3) and a sketch on its top face
    function rfLWblock(extra) {
      var m = K.newModel('rfLW');
      K.runScript(m, 'p.units("in");\np.sketch("Top").rect(0, -3, 4, 3).extrude(0.5);\n' + (extra || '') + 'p.sketch({ face: 2, normal: [0, 1, 0] });');
      var b = K.rebuild(m), sk = m.features[m.features.length - 1];
      sk.entities = []; sk.rels = [];
      return { m: m, b: b, sk: sk, pl: rfLWplane(m, sk, b) };
    }
    // a relation from sketch ref `ref` to model geometry g (3D, as the UI's snaps carry it), as UI.modelSnapRelations makes it
    function rfLWext(t, type, ref, g, ext) {
      var mref = K.modelRefFor(t.b.bodies, g, { fids: rfLWfids(t.m, t.sk) });
      assert(mref, 'named on the model: ' + JSON.stringify(g));
      if (g.mid) mref.mid = true;
      var r = S.addRelation(t.sk, type, [ref, 'M'], { ext: ext, mref: mref, rejectOver: true });
      assert(r.ok, type + ': ' + r.error);
      return r.rels[0];
    }
    function rfLWsnapLine() {
      var t = rfLWblock(), pl = t.pl, a = rfLW2(pl, [4, 0.5, 3]), c = rfLW2(pl, [2, 0.5, 0]);
      t.sk.entities.push({ t: 'line', x1: a[0], y1: a[1], x2: c[0], y2: c[1] });
      var e0 = rfLW2(pl, [0, 0.5, 0]), e1 = rfLW2(pl, [4, 0.5, 0]);
      rfLWext(t, 'coincident', '0.p1', { k: 'vertex', p: [4, 0.5, 3] }, { t: 'point', x: a[0], y: a[1] });
      rfLWext(t, 'midpoint', '0.p2', { k: 'edge', a: [0, 0.5, 0], b: [4, 0.5, 0] }, { t: 'line', x1: e0[0], y1: e0[1], x2: e1[0], y2: e1[1] });
      return t;
    }
    test('rfLW: a line from a model corner to an edge\'s midpoint (as snapped) has Coincident / Midpoint to the model itself, no reference entity, is Fully Defined, and follows the block from 4 to 5 wide', function () {
      var t = rfLWsnapLine(), sk = t.sk, pl = t.pl;
      assert(sk.entities.length === 1, 'only the line: ' + JSON.stringify(sk.entities));
      assert(sk.rels.length === 2 && sk.rels.every(function (r) { return S.isExtRel(r) && r.mref; }), JSON.stringify(sk.rels));
      assert(S.analyze(sk).status === 'full', 'fully defined: ' + S.analyze(sk).status);
      assert(/Coincident: Line1 start, Vertex<1>/.test(S.describe(sk, sk.rels[0])) && /Midpoint: Line1 end, Edge<1>/.test(S.describe(sk, sk.rels[1])), S.describe(sk, sk.rels[0]) + ' / ' + S.describe(sk, sk.rels[1]));
      t.m.features[0].entities[0].w = 5;
      var b = K.rebuild(t.m);
      assert(!Object.keys(b.errors).length && !/Dangling/.test(b.warnings[sk.id] || ''), JSON.stringify([b.errors, b.warnings]));
      var L = sk.entities[0], p = K.to3D(pl, L.x1, L.y1), q = K.to3D(pl, L.x2, L.y2);
      near(p[0], 5, 1e-9, 'start on the moved corner'); near(p[2], 3, 1e-9, 'corner z');
      near(q[0], 2.5, 1e-9, 'end at the new midpoint'); near(q[2], 0, 1e-9, 'midpoint z');
      near(K.to3D(pl, sk.rels[1].ext.x2, sk.rels[1].ext.y2)[0], 5, 1e-9, 'the model edge in the relation moved too');
      assert(S.analyze(sk).status === 'full', 'still fully defined');
      return S.describe(sk, sk.rels[0]);
    });
    test('rfLW: generateScript / runScript keep a relation to the model (ext, mref) and the copy follows; deleting the feature leaves it Dangling (warning, the line stays)', function () {
      var t = rfLWsnapLine(), m = t.m;
      K.rebuild(m);
      var code = K.generateScript(m);
      assert(/\.rel\("coincident", \["0\.p1","M"\], \{"ext":\{"t":"point"/.test(code), 'script line: ' + code.split('\n').filter(function (l) { return /"M"/.test(l); }).join(' | '));
      var m2 = K.newModel('x');
      K.runScript(m2, code);
      var s2 = m2.features[m2.features.length - 1];
      assert(s2.entities.length === 1 && s2.rels.filter(function (r) { return S.isExtRel(r) && r.mref; }).length === 2, JSON.stringify(s2.rels));
      m2.features[0].entities[0].w = 5;
      var b2 = K.rebuild(m2), pl2 = rfLWplane(m2, s2, b2);
      near(K.to3D(pl2, s2.entities[0].x1, s2.entities[0].y1)[0], 5, 1e-9, 'the copy follows');
      // the sketch moved onto a new base: its model geometry is gone
      var m3 = K.newModel('y');
      K.runScript(m3, code);
      var s3 = m3.features[m3.features.length - 1], before = JSON.stringify(s3.entities);
      m3.features[1].depth = 0.25;   // the top face moves: the face sketch moves with it, the references with it
      var b3 = K.rebuild(m3);
      assert(!/Dangling/.test(b3.warnings[s3.id] || ''), 'still attached: ' + b3.warnings[s3.id]);
      s3.rels[0].mref.sigs[0].fid = 999;   // as if the feature that made the corner were deleted
      b3 = K.rebuild(m3);
      assert(/^Dangling: 1 sketch relation .*Coincident Line1 start/.test(b3.warnings[s3.id] || ''), 'warning: ' + b3.warnings[s3.id]);
      assert(s3.rels[0].dangling && !s3.rels[1].dangling, 'the vertex one dangles');
      assert(JSON.stringify(s3.entities) === before, 'the line stays');
      assert(/"dangling":true/.test(K.generateScript(m3)), 'scripts keep dangling');
      return code.split('\n').length + ' lines';
    });
    test('rfLW: a sketch saved this morning (a construction point Fixed with mref, the line\'s end Coincident with it) opens and follows exactly as it did', function () {
      var t = rfLWblock(), sk = t.sk, pl = t.pl, a = rfLW2(pl, [4, 0.5, 3]), c = rfLW2(pl, [2, 0.5, 1]);
      sk.entities.push({ t: 'line', x1: a[0], y1: a[1], x2: c[0], y2: c[1] }, { t: 'point', x: a[0], y: a[1], construction: true });
      var fr = S.addRelation(sk, 'fix', ['1']);
      sk.rels[fr.rels[0]].mref = K.modelRefFor(t.b.bodies, { k: 'vertex', p: [4, 0.5, 3] }, { fids: rfLWfids(t.m, sk) });
      assert(S.addRelation(sk, 'coincident', ['0.p1', '1']).ok, 'coincident');
      var code = K.generateScript(t.m), m2 = K.newModel('old');
      assert(/"fix", \["1"\], \{"at":\[[^\]]*\],"mref":\{"k":"vertex"/.test(code), 'the old form in the script');
      K.runScript(m2, code);
      var s2 = m2.features[m2.features.length - 1];
      assert(s2.entities.length === 2 && !s2.rels.some(S.isExtRel), 'kept as it was: ' + JSON.stringify(s2.rels));
      m2.features[0].entities[0].w = 5;
      var b2 = K.rebuild(m2), p = K.to3D(rfLWplane(m2, s2, b2), s2.entities[0].x1, s2.entities[0].y1);
      assert(!Object.keys(b2.errors).length && !/Dangling/.test(b2.warnings[s2.id] || ''), JSON.stringify([b2.errors, b2.warnings]));
      near(p[0], 5, 1e-9, 'line start follows the corner'); near(p[2], 3, 1e-9, 'z');
      return 'ok';
    });
    test('rfLW: Intersection Curve pieces (a plane through a block with a hole along z: four lines of the outline and the hole\'s circle, On Edge with xsect references) follow the block to 5 wide and the hole to x 3', function () {
      var m = K.newModel('rfLW-x');
      K.runScript(m, 'p.units("in");\np.sketch("Top").rect(0, -3, 4, 3).extrude(0.5);\np.sketch("Front").circle(2, 0.25, 0.1).cut("through");\np.sketch({ custom: true, origin: [0, 0, 1.5], x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1] });');
      var b = K.rebuild(m), sk = m.features[m.features.length - 1], pl = rfLWplane(m, sk, b), fids = rfLWfids(m, sk), base = m.features[1].id, hole = m.features[3].id;
      sk.entities = []; sk.rels = [];
      function piece(ent, g) {
        sk.entities.push(ent);
        var r = S.addRelation(sk, 'onEdge', [String(sk.entities.length - 1)]), mref = K.modelRefFor(b.bodies, g, { fids: fids });
        assert(r.ok && mref && mref.k === 'xsect', 'named: ' + JSON.stringify([g, mref]));
        sk.rels[r.rels[0]].mref = mref;
      }
      piece({ t: 'line', x1: 0, y1: 0.5, x2: 4, y2: 0.5 }, { k: 'xsect', fid: base, n: [0, 1, 0], form: 'line', at: [2, 0.5, 1.5] });
      piece({ t: 'line', x1: 4, y1: 0, x2: 4, y2: 0.5 }, { k: 'xsect', fid: base, n: [1, 0, 0], form: 'line', at: [4, 0.25, 1.5] });
      piece({ t: 'circle', cx: 2, cy: 0.25, r: 0.1 }, { k: 'xsect', fid: hole, n: null, form: 'circle', at: [2, 0.25, 1.5], full: true });
      sk.entities.push({ t: 'point', x: 3, y: 0.3 });
      assert(S.addRelation(sk, 'distance', ['3', '1'], { value: 1, dir: 'h' }).ok, 'a point 1 from the right side');
      m.features[0].entities[0].w = 5;
      m.features[2].entities[0].cx = 3;
      b = K.rebuild(m);
      assert(!Object.keys(b.errors).length && !/Dangling/.test(b.warnings[sk.id] || ''), JSON.stringify([b.errors, b.warnings]));
      var L0 = sk.entities[0], L1 = sk.entities[1], C = sk.entities[2];
      near(Math.max(L0.x1, L0.x2), 5, 1e-9, 'top line to x 5'); near(L0.y1, 0.5, 1e-9, 'top line y');
      near(L1.x1, 5, 1e-9, 'right side at x 5'); near(L1.x2, 5, 1e-9, 'right side at x 5 (2)');
      near(C.cx, 3, 1e-9, 'hole circle x 3'); near(C.cy, 0.25, 1e-9, 'hole circle y'); near(C.r, 0.1, 1e-9, 'r');
      near(sk.entities[3].x, 4, 1e-9, 'the point 1 from the right side');
      // the hole deleted: the circle is Dangling, the rest still follows
      m.features = m.features.filter(function (x) { return x.id !== hole && x.id !== hole - 1; });
      b = K.rebuild(m);
      assert(/^Dangling: 1 /.test(b.warnings[sk.id] || ''), 'circle dangling: ' + b.warnings[sk.id]);
      return 'ok';
    });
    test('rfLW: a hole\'s rim seen from a tilted sketch is an ellipse that follows the hole (Fix with a circle reference, ellipse parameters projected again)', function () {
      var m = K.newModel('rfLW-t');
      var ang = 30 * Math.PI / 180, n = [0, Math.sin(ang), Math.cos(ang)], y = [0, Math.cos(ang), -Math.sin(ang)];
      K.runScript(m, 'p.units("in");\np.sketch("Top").rect(0, -3, 4, 3).extrude(0.5);\np.sketch("Front").circle(2, 0.25, 0.2).cut("through");\np.sketch({ custom: true, origin: [0, 0, -1], x: [1, 0, 0], y: ' + JSON.stringify(y) + ', n: ' + JSON.stringify(n) + ' });');
      var b = K.rebuild(m), sk = m.features[m.features.length - 1], pl = rfLWplane(m, sk, b);
      var g = { k: 'circle', c: [2, 0.25, 0], n: [0, 0, 1], r: 0.2, full: true };
      var mref = K.modelRefFor(b.bodies, g, { fids: rfLWfids(m, sk) });
      assert(mref && mref.k === 'circle', 'rim named: ' + JSON.stringify(mref));
      var c = K.to2D(pl, g.c);
      sk.entities = [{ t: 'ellipse', cx: c[0], cy: c[1], rx: 0.2, ry: 0.2 * Math.cos(ang), rot: 0, construction: true }];
      sk.rels = [];
      S.addRelation(sk, 'fix', ['0']);
      sk.rels[0].mref = mref;
      m.features[2].entities[0].cx = 3;
      b = K.rebuild(m);
      assert(!Object.keys(b.errors).length && !/Dangling/.test(b.warnings[sk.id] || ''), JSON.stringify([b.errors, b.warnings]));
      var e = sk.entities[0], c2 = K.to2D(pl, [3, 0.25, 0]);
      near(e.cx, c2[0], 1e-9, 'centre x follows'); near(e.cy, c2[1], 1e-9, 'centre y');
      near(e.rx, 0.2, 1e-9, 'major = r'); near(e.ry, 0.2 * Math.cos(ang), 1e-9, 'minor = r cos 30');
      assert(Math.abs(e.rot) < 1e-6 || Math.abs(e.rot - 180) < 1e-6, 'major axis along x: ' + e.rot);
      return 'rot ' + e.rot;
    });
    test('rfLW: snaps on a slot\'s round end (its middle and on the arc) keep a reference: the points follow when the slot is made longer', function () {
      var t, m = K.newModel('rfLW-s');
      K.runScript(m, 'p.units("in");\np.sketch("Top").slot(1, -1.5, 3, -1.5, 1).extrude(0.5);\np.sketch({ face: 2, normal: [0, 1, 0] });');
      var b = K.rebuild(m), sk = m.features[m.features.length - 1], pl = rfLWplane(m, sk, b);
      t = { m: m, b: b, sk: sk, pl: pl };
      sk.entities = []; sk.rels = [];
      var mid = rfLW2(pl, [3.5, 0.5, 1.5]), on = [3 + 0.5 * Math.cos(Math.PI / 4), 0.5, 1.5 - 0.5 * Math.sin(Math.PI / 4)], on2 = rfLW2(pl, on), cc = rfLW2(pl, [3, 0.5, 1.5]);
      sk.entities.push({ t: 'point', x: mid[0], y: mid[1] }, { t: 'point', x: on2[0], y: on2[1] });
      var arc = { k: 'circle', c: [3, 0.5, 1.5], n: [0, 1, 0], r: 0.5, full: false };
      rfLWext(t, 'coincident', '0', Object.assign({ mid: true }, arc), { t: 'point', x: mid[0], y: mid[1] });
      var a0 = Math.atan2(on2[1] - cc[1], on2[0] - cc[0]) * 180 / Math.PI;
      rfLWext(t, 'coincident', '1', arc, { t: 'arc', cx: cc[0], cy: cc[1], r: 0.5, a0: a0 - 80, a1: a0 + 80 });
      m.features[0].entities[0].x2 = 4;
      b = K.rebuild(m);
      assert(!Object.keys(b.errors).length && !/Dangling/.test(b.warnings[sk.id] || ''), JSON.stringify([b.errors, b.warnings]));
      var p = K.to3D(pl, sk.entities[0].x, sk.entities[0].y), q = K.to3D(pl, sk.entities[1].x, sk.entities[1].y);
      near(p[0], 4.5, 1e-9, 'arc middle x'); near(p[2], 1.5, 1e-9, 'arc middle z');
      near(Math.hypot(q[0] - 4, q[2] - 1.5), 0.5, 1e-9, 'the point still on the round end');
      return 'ok';
    });
  })();
