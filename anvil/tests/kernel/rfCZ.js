  // --- rfCZ (2026-10-20, lane CZ: Reference Geometry) --- the Axis, Point and Coordinate System features (types
  // refaxis / refpoint / csys): no body change; rebuild resolves each into build.planes[id] ({ refgeo: 'axis', o, d,
  // a, b } / { refgeo: 'point', p } / { refgeo: 'csys', origin, x, y, z }); a Circular Pattern or Revolve turns about
  // one with `axisRef`; refs to faces / edges are picked points that follow the model; script and JSON round trips.
  (function () {
    group('rfCZ: Reference Geometry (Axis, Point, Coordinate System)');
    var BLOCK = 'p.sketch("Front").rect(0, 0, 40, 30).end().extrude(10);\np.sketch("Front").circle(12, 15, 4).end().cut("through");\n';
    function rfCZRef(r, name) { var f = r.model.features.filter(function (x) { return x.name === name; })[0]; assert(f, 'feature ' + name); return r.build.planes[f.id]; }
    function rfCZVec(a, b, tol, what) { nearVec(a, b, tol || 1e-9, what); }
    function rfCZRound(r) {
      var s = K.generateScript(r.model), m2 = K.newModel('rt');
      K.runScript(m2, s);
      var b2 = K.rebuild(m2);
      assert(!Object.keys(b2.errors).length, 'round trip errors ' + JSON.stringify(b2.errors));
      var j = JSON.parse(JSON.stringify(r.model)), b3 = K.rebuild(j);
      assert(!Object.keys(b3.errors).length, 'JSON round trip errors ' + JSON.stringify(b3.errors));
      return { script: s, build: b2, model: m2, jsonBuild: b3 };
    }

    test('rfCZ: Circular Pattern about an Axis made from two planes (Right offset 50 ∩ Front) gives 4 × the Ø10 × 10 boss; the script and JSON round trips keep it', function () {
      var r = build('var pl = p.plane("Right", 50);\np.sketch("Top").circle(80, 0, 5).end().extrude(10);\nvar ax = p.axis("planes", [{ plane: pl }, "Front"]);\np.circularPattern({ axisRef: ax, count: 4 });');
      noErrors(r);
      var A = rfCZRef(r, 'Axis1');
      assert(A && A.refgeo === 'axis', 'axis record');
      rfCZVec(A.o, [50, 0, 0], 1e-9, 'axis point'); assert(Math.abs(Math.abs(A.d[1]) - 1) < 1e-12, 'axis along Y: ' + JSON.stringify(A.d));
      nearRel(r.mp.volume, 4 * Math.PI * 25 * 10, 1e-6, 'pattern volume');
      var b = r.build.body.getBounds();
      near(b.min[0], 15, 1e-6, 'copy at x = 20 − 5'); near(b.max[0], 85, 1e-6, 'seed at x = 80 + 5');
      var rt = rfCZRound(r);
      assert(/p\.axis\("planes", \[\{ plane: f1 \}, \{ plane: "Front" \}\]/.test(rt.script) && /axisRef: f4/.test(rt.script), 'script: ' + rt.script);
      nearRel(K.massProps(K.meshFromBody(rt.build.body)).volume, 4 * Math.PI * 250, 1e-6, 'round-trip volume');
      return 'V = ' + fmt(r.mp.volume);
    });

    test('rfCZ: Revolve about a reference Axis through two points (origin → (0, 10, 0)) makes the exact ring; an axis off the sketch plane is an error', function () {
      var r = build('var a = p.axis("points", ["origin", [0, 10, 0]]);\np.sketch("Front").rect(10, 0, 10, 10).end().revolve(360, { axisRef: a });');
      noErrors(r);
      nearRel(r.mp.volume, Math.PI * (400 - 100) * 10, 1e-6, 'ring volume');
      var e = build('var a = p.axis("points", [[0, 0, 5], [0, 10, 5]]);\np.sketch("Front").rect(10, 0, 10, 10).end().revolve(360, { axisRef: a });');
      var msg = e.errors[e.model.features[2].id];
      assert(msg && /sketch plane/.test(msg), 'off-plane axis error: ' + JSON.stringify(e.errors));
      var rt = rfCZRound(r);
      assert(/axisRef: f1/.test(rt.script), 'revolve script keeps axisRef');
      return 'V = ' + fmt(r.mp.volume);
    });

    test('rfCZ: Point at the centre of a hole edge lands on the hole centre; Axis of the hole face is the hole axis; both follow the hole when its sketch moves', function () {
      var r = build(BLOCK + 'var c = p.point("arc", [{ edge: [16, 15, 10] }]);\nvar ax = p.axis("cyl", [{ face: [8, 15, 5] }]);');
      noErrors(r);
      rfCZVec(rfCZRef(r, 'Point1').p, [12, 15, 10], 1e-9, 'arc centre');
      var A = rfCZRef(r, 'Axis1');
      rfCZVec(A.o, [12, 15, 0], 1e-9, 'axis start'); rfCZVec(A.b, [12, 15, 10], 1e-9, 'axis end'); rfCZVec(A.d, [0, 0, 1], 1e-12, 'axis direction');
      // move the hole 0.3 to the right: the picks (still on the hole within pickTol) follow it
      r.model.features[2].entities[0].cx = 12.3;
      var b2 = K.rebuild(r.model);
      assert(!Object.keys(b2.errors).length, 'errors after the move ' + JSON.stringify(b2.errors));
      rfCZVec(b2.planes[r.model.features[4].id].p, [12.3, 15, 10], 1e-9, 'point followed');
      rfCZVec(b2.planes[r.model.features[5].id].o, [12.3, 15, 0], 1e-9, 'axis followed');
      return 'centre (12, 15, 10) → (12.3, 15, 10)';
    });

    test('rfCZ: Point types — centre of face (area centroid), intersection of two edges, projection onto a plane, on a vertex, along an edge (25 %, and 5 from the start of a sketch arc)', function () {
      var r = build(BLOCK + 'var c = p.point("arc", [{ edge: [16, 15, 10] }]);\n' +
        'p.point("face", [{ face: [30, 15, 0] }]);\n' +
        'p.point("intersect", [{ edge: [20, 0, 10] }, { edge: [0, 15, 10] }]);\n' +
        'p.point("project", [{ point: c }, "Front"]);\n' +
        'p.point("on", [{ vertex: [39.8, 30.1, 10] }]);\n' +
        'p.point("along", [{ edge: [20, 30, 10] }], { distance: 25, percent: true });\n' +
        'var sk = p.sketch("Top").arc(0, 0, 10, 0, 90).id();\n' +
        'p.point("along", [{ sketch: sk, entity: 0 }], { distance: 5 });');
      noErrors(r);
      var faceArea = 1200 - 16 * Math.PI, poly = r.build.planes[r.model.features[5].id].p;
      // the faceted hole (chords) gives a centroid within 0.01 of the exact one
      near(poly[0], (1200 * 20 - 16 * Math.PI * 12) / faceArea, 0.01, 'face centroid x'); near(poly[1], 15, 1e-9, 'face centroid y'); near(poly[2], 0, 1e-12, 'face centroid z');
      rfCZVec(rfCZRef(r, 'Point3').p, [0, 0, 10], 1e-9, 'intersection');
      rfCZVec(rfCZRef(r, 'Point4').p, [12, 15, 0], 1e-9, 'projection');
      rfCZVec(rfCZRef(r, 'Point5').p, [40, 30, 10], 1e-9, 'vertex snapped');
      rfCZVec(rfCZRef(r, 'Point6').p, [10, 30, 10], 1e-9, '25 % along the top edge from its −X end');
      var t = 5 / 10, T = K.makePlane('Top', 0);
      rfCZVec(rfCZRef(r, 'Point7').p, K.to3D(T, 10 * Math.cos(t), 10 * Math.sin(t)), 1e-9, '5 along the R10 arc');
      rfCZRound(r);
      return 'face centroid x ' + fmt(poly[0]);
    });

    test('rfCZ: Coordinate System from a point, an X edge and a Z face normal is right-handed; flips; an empty one is the world frame; its XY plane works as a sketch plane', function () {
      var r = build(BLOCK + 'var c = p.point("arc", [{ edge: [16, 15, 10] }]);\n' +
        'var cs = p.csys({ origin: { point: c }, x: { edge: [20, 0, 10] }, z: { face: [20, 15, 10] } });\n' +
        'p.csys({ x: "y", flipX: true });\n' +
        'p.csys({});\n' +
        'p.sketch(cs, 0).rect(-2, -2, 4, 4).end().extrude(3);');
      noErrors(r);
      var C = rfCZRef(r, 'Coordinate System1');
      rfCZVec(C.origin, [12, 15, 10], 1e-9, 'origin'); rfCZVec(C.x, [1, 0, 0], 1e-12, 'x'); rfCZVec(C.y, [0, 1, 0], 1e-12, 'y'); rfCZVec(C.z, [0, 0, 1], 1e-12, 'z');
      var C2 = rfCZRef(r, 'Coordinate System2');
      rfCZVec(C2.x, [0, -1, 0], 1e-12, 'flipped x'); near(K.vec.dot(K.vec.cross(C2.x, C2.y), C2.z), 1, 1e-12, 'right-handed');
      var C3 = rfCZRef(r, 'Coordinate System3');
      rfCZVec(C3.origin, [0, 0, 0], 0, 'world origin'); rfCZVec(C3.z, [0, 0, 1], 0, 'world z');
      rfCZVec(K.toCsys(C, [13, 17, 12]), [1, 2, 2], 1e-12, 'toCsys');
      nearRel(r.mp.volume, 1200 * 10 - 160 * Math.PI + 16 * 3, 1e-6, 'block with hole + a 4 × 4 × 3 boss on the csys XY plane');
      rfCZRound(r);
      return 'frame ok';
    });

    test('rfCZ: reference geometry is no pattern source (Builder), is not a cut, names Axis1 / Point1 / Coordinate System1, and a missing reference is an error on that feature only', function () {
      // rfFN: was rect(0, 0, …): the three blocks met only along the Y axis (zero thickness, refused as in SolidWorks)
      var r = build('p.sketch("Front").rect(1, 0, 10, 10).end().extrude(5);\np.axis("line", ["y"]);\np.point("on", ["origin"]);\np.csys({});\np.circularPattern({ axis: "y", count: 3 });');
      noErrors(r);
      var F = r.model.features;
      assert(F[5].type === 'cpattern' && F[5].feature === F[1].id, 'pattern source is the extrude, not the reference geometry');
      assert(F[2].name === 'Axis1' && F[3].name === 'Point1' && F[4].name === 'Coordinate System1', 'names ' + F.map(function (f) { return f.name; }).join(', '));
      assert(!K.isCut(F[2], r.model) && !K.isCut(F[4], r.model), 'not cuts');
      var e = build('p.sketch("Front").rect(0, 0, 10, 10).end().extrude(5);\np.point("arc", [{ edge: [50, 50, 50] }]);\np.sketch("Front").circle(30, 0, 2).end().extrude(1);');
      var ids = Object.keys(e.errors);
      assert(ids.length === 1 && /edge is gone/.test(e.errors[ids[0]]), 'one error on the point: ' + JSON.stringify(e.errors));
      nearRel(e.mp.volume, 500 + 4 * Math.PI, 1e-6, 'the rest still builds');
      return 'ok';
    });

    test('rfCZ: the axis record travels through packBuild / unpackBuild and cacheFromBuild (a worker rebuild), and an appended pattern reuses the cache', function () {
      var r = build('var pl = p.plane("Right", 50);\np.sketch("Top").circle(80, 0, 5).end().extrude(10);\nvar ax = p.axis("planes", [{ plane: pl }, "Front"]);');
      noErrors(r);
      var u = K.unpackBuild(K.packBuild(r.build, r.model));
      var axId = r.model.features[3].id;
      assert(u.planes[axId] && u.planes[axId].refgeo === 'axis', 'axis survives packing');
      var cache = K.cacheFromBuild(r.model, r.build);
      K.runScript(r.model, 'p.circularPattern({ feature: 3, axisRef: ' + axId + ', count: 2 });');
      var b2 = K.rebuild(r.model, cache);
      assert(!Object.keys(b2.errors).length && b2.reused === 4, 'reused ' + b2.reused + ' errors ' + JSON.stringify(b2.errors));
      nearRel(K.massProps(K.meshFromBody(b2.body)).volume, 2 * Math.PI * 250, 1e-6, 'two bosses');
      return 'reused ' + b2.reused;
    });

    test('rfCZ: a side / corner of a sketch rectangle is a line / point ref (Axis on side 2, Point on corner 3, Along Curve on side 1 driven by an equation); a Revolve about an axis on a rectangle side of the profile sketch', function () {
      var r = build('p.equations({ D: 10 });\nvar sk = p.sketch("Front").rect(0, 0, 40, 30).id();\n' +
        'var a = p.axis("line", [{ sketch: sk, entity: 0, seg: 1 }]);\n' +
        'p.point("on", [{ sketch: sk, entity: 0, pt: 2 }]);\n' +
        'p.point("along", [{ sketch: sk, entity: 0, seg: 0 }], { distance: "=D*1.5" });\n' +
        'var s2 = p.sketch("Front").rect(40, 0, 5, 30).end().revolve(90, { axisRef: a });');
      noErrors(r);
      var A = rfCZRef(r, 'Axis1');
      rfCZVec(A.o, [40, 0, 0], 1e-12, 'side 2 starts at (40, 0)'); rfCZVec(A.d, [0, 1, 0], 1e-12, 'along Y');
      rfCZVec(rfCZRef(r, 'Point1').p, [40, 30, 0], 1e-12, 'corner 3');
      rfCZVec(rfCZRef(r, 'Point2').p, [15, 0, 0], 1e-12, '15 along side 1 (= D·1.5)');
      nearRel(r.mp.volume, Math.PI * 25 / 4 * 30, 1e-6, 'quarter turn of a 5 × 30 strip about its own edge');
      var rt = rfCZRound(r);
      assert(/seg: 1/.test(rt.script) && /pt: 2/.test(rt.script) && /distance: "=D\*1\.5"/.test(rt.script), 'script keeps seg / pt / the equation: ' + rt.script);
      return 'ok';
    });

    test('rfCZ: an Axis made from a plane follows the plane: editing the plane offset moves the axis and the pattern about it (incremental rebuild)', function () {
      var r = build('var pl = p.plane("Right", 50);\np.sketch("Top").circle(80, 0, 5).end().extrude(10);\nvar ax = p.axis("planes", [{ plane: pl }, "Front"]);\np.circularPattern({ axisRef: ax, count: 2 });');
      noErrors(r);
      near(r.build.body.getBounds().min[0], 15, 1e-6, 'copy at x = 20 about x = 50');
      r.model.features[0].offset = 60;
      var b2 = K.rebuild(r.model, r.build.cache);
      assert(!Object.keys(b2.errors).length, 'errors ' + JSON.stringify(b2.errors));
      rfCZVec(b2.planes[r.model.features[3].id].o, [60, 0, 0], 1e-9, 'axis moved');
      near(b2.body.getBounds().min[0], 35, 1e-6, 'copy now at x = 40 about x = 60');
      return 'ok';
    });
  })();
