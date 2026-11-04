  // --- rfHV (2026-11-04, lane bigpanel) --- big perforated panels: K.bodyEdges (face outlines) and Exchange.bodyMesh /
  // exportSTEP were string-keyed and partly quadratic (7.0 s / 8.5 s / 10.9 s on a 48 x 96 x .075 in panel with 1000
  // holes on one machine; 16 s / 26 s / 27 s with 1800). Same algorithms with numbered vertices and grids: the output
  // must not change by one edge or one STEP entity. The reference numbers below were taken from the code before the
  // change (commit e8daca0). Time bounds: 6 s for edges and for the STEP mesh, 10 s for the STEP file, below what the old
  // code took on an idle machine (7.0 / 8.5 / 10.9 s) and well above the new code on a machine busy with the whole suite
  // (0.6-0.8 / 0.5-0.9 / 1.2-1.9 s idle, up to 2.5 times that under load).
  (function () {
    group('rfHV: big perforated panels: body edges, STEP mesh and STEP file fast and unchanged');
    function rfHVcode(n, slots) {
      var c = 'p.units("in");\np.sketch("Front").rect(0, 0, 48, 96).extrude(0.075);\nvar s = p.sketch("Front", 0.075);\n', k = 0;
      for (var j = 0; k < n; j++) for (var i = 0; i < 40 && k < n; i++, k++) {
        var x = 1 + 1.1 * i, y = 1 + 1.1 * j;
        if (slots) c += 's.slot(' + (x - 0.2) + ', ' + y + ', ' + (x + 0.2) + ', ' + y + ', 0.25);\n';
        else c += 's.circle(' + x + ', ' + y + ', 0.125);\n';
      }
      return c + 's.cut("through", { reverse: true });\n';
    }
    function rfHVbuild(n, slots) {
      var m = Kernel.newModel('b');   // the name the reference STEP texts were written with
      Kernel.runScript(m, rfHVcode(n, slots));
      var b = Kernel.rebuild(m);
      assert(!Object.keys(b.errors).length, 'no errors: ' + JSON.stringify(b.errors));
      return { m: m, b: b, mesh: Kernel.meshFromBody(b.body) };
    }
    function rfHVtime(fn) { var t0 = Date.now(), r = fn(); return { r: r, s: (Date.now() - t0) / 1000 }; }
    // the edges' ends summed in their order (the same edges in the same order give the same number)
    function rfHVsig(edges) { var s = 0; edges.forEach(function (x) { s += x.a[0] * 1.3 + x.a[1] * 1.7 + x.a[2] * 2.1 + x.b[0] * 1.31 + x.b[1] * 1.71 + x.b[2] * 2.11; }); return s; }
    // FNV-1a over the STEP text without its FILE_NAME line (the time stamp)
    function rfHVhash(text) {
      text = text.replace(/FILE_NAME\([^\n]*/, '');
      var h = 0x811c9dc5;
      for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      return h;
    }
    function rfHVents(text) { var o = {}; text.replace(/=\s*([A-Z_]+)\s*\(/g, function (_, k) { o[k] = (o[k] || 0) + 1; }); return o; }
    function eq(a, b, msg) { assert(a === b, msg + ': ' + a + ' (reference ' + b + ')'); }
    var REF = {
      round1000: { faces: 32006, edges: 96012, smooth: 32000, sig: 10291446.485249983, positions: 549066, triangles: 1110120, bmFaces: 32006, triPoly: 370040,
        stepLen: 1551297, hash: 586903549, ADVANCED_FACE: 1006, EDGE_CURVE: 3012, VERTEX_POINT: 2008, CYLINDRICAL_SURFACE: 1000, PLANE: 6, CIRCLE: 2000, LINE: 1012 },
      slots300: { faces: 9622, edges: 30612, smooth: 10200, sig: 2221264.589250002, positions: 173640, triangles: 350868, bmFaces: 9622, triPoly: 116956,
        stepLen: 1690638, hash: 3795378343, ADVANCED_FACE: 1206, EDGE_CURVE: 3612, VERTEX_POINT: 2408, CYLINDRICAL_SURFACE: 600, PLANE: 606, CIRCLE: 1200, LINE: 2412 }
    };
    function rfHVcheck(r, R, name, bound) {
      var te = rfHVtime(function () { return Kernel.bodyEdges(r.mesh); }), e = te.r;
      eq(e.length, R.edges, name + ': edge count');
      eq(e.filter(function (x) { return x.smooth; }).length, R.smooth, name + ': smooth (tangent) edges');
      nearRel(rfHVsig(e), R.sig, 1e-12, name + ': edge ends, in order');
      var tm = rfHVtime(function () { return Exchange.bodyMesh(r.b.body); }), bm = tm.r;
      eq(bm.openEdges, 0, name + ': STEP mesh closed');
      eq(bm.positions.length, R.positions, name + ': STEP mesh positions');
      eq(bm.triangles.length, R.triangles, name + ': STEP mesh triangles');
      eq(bm.faces.length, R.bmFaces, name + ': STEP mesh faces');
      var ts = rfHVtime(function () { return Exchange.exportSTEP(r.m, r.b); }), step = ts.r;
      eq(step.length, R.stepLen, name + ': STEP length');
      eq(rfHVhash(step), R.hash, name + ': STEP text (hash)');
      var ents = rfHVents(step);
      ['ADVANCED_FACE', 'EDGE_CURVE', 'VERTEX_POINT', 'CYLINDRICAL_SURFACE', 'PLANE', 'CIRCLE', 'LINE'].forEach(function (k) { eq(ents[k] || 0, R[k], name + ': STEP ' + k); });
      if (bound) {
        assert(te.s < bound, name + ': bodyEdges took ' + te.s + ' s');
        assert(tm.s < bound, name + ': bodyMesh took ' + tm.s + ' s');
        assert(ts.s < bound * 10 / 6, name + ': exportSTEP took ' + ts.s + ' s');
      }
      return 'edges ' + te.s.toFixed(2) + ' s, STEP mesh ' + tm.s.toFixed(2) + ' s, STEP ' + ts.s.toFixed(2) + ' s';
    }
    test('rfHV: 1000 round holes in a 48 x 96 x .075 in sheet: same edges, STEP mesh and STEP text as before, each step well under the old times', function () {
      var r = rfHVbuild(1000, false);
      eq(r.mesh.faces.length, REF.round1000.faces, 'mesh faces');
      return rfHVcheck(r, REF.round1000, '1000 holes', 6);
    });
    test('rfHV: 300 slots: same edges, STEP mesh and STEP text as before', function () {
      var r = rfHVbuild(300, true);
      eq(r.mesh.faces.length, REF.slots300.faces, 'mesh faces');
      return rfHVcheck(r, REF.slots300, '300 slots', 0);
    });
    test('rfHV: faceOutline welds as before: two copies of a corner a hair apart, a corner on a rounding midpoint, a T-junction', function () {
      // a 2 x 1 plate whose top face is split into three polygons: the middle edge carries a T-junction, one copy of a
      // corner is moved 3e-5 (welded) and the plate sits at x = .57025 (a 1e-4 rounding midpoint)
      var x0 = 0.57025, P = function (x, y, z) { return new CSG.Vertex(new CSG.Vector(x, y, z), new CSG.Vector(0, 0, 1)); };
      var top = [
        new CSG.Polygon([P(x0, 0, 1), P(x0 + 1, 0, 1), P(x0 + 1, 1, 1), P(x0, 1, 1)]),
        new CSG.Polygon([P(x0 + 1, 0, 1), P(x0 + 2, 0, 1), P(x0 + 2, 0.5, 1)]),
        new CSG.Polygon([P(x0 + 1, 3e-5, 1), P(x0 + 2, 0.5, 1), P(x0 + 2, 1, 1), P(x0 + 1, 1, 1)])
      ];
      var mesh = { faces: [{ normal: [0, 0, 1], w: 1, polys: top }] };
      var o = Kernel.faceOutline(mesh, 0);
      eq(o.loops.length, 1, 'one loop');
      eq(o.loops[0].length, 4, 'four corners (the T-junction and the welded copy gone)');
      var xs = o.loops[0].map(function (q) { return q.p3[0]; }).sort(function (a, b) { return a - b; });
      near(xs[0], x0, 1e-12, 'left side on the midpoint');
      near(xs[3], x0 + 2, 1e-12, 'right side');
    });
  })();
