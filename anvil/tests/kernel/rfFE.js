  // --- rfFE (2026-10-29, lane FE): curved faces shade smooth on Anvil's own engine. Kernel.analyticNormals (the one
  // copy; UI.analyticNormals and the worker call it): record facets take their surface's normal (tori with their
  // axial part), other curved faces (a fillet on a round edge, revolved / extruded splines and ellipses, lofts) are
  // smoothed over their facets with a crease angle while planes stay flat; a revolve closes at the axis with the true
  // pole normal; Image Quality has a 10° angular limit next to the chord tolerance (Kernel.setTessellation maxAngle). ---
  (function () {
    group('rfFE: smooth shading normals, revolve poles, angular tessellation limit');
    var RFFE_REPRO = 'p.units("mm"); p.sketch("Top").circle(0,0,50).extrude(20); p.fillet(6, [[50,20,0]]); p.sketch("Front").circle(22,20,8).revolveCut(360);';
    var RFFE_ELL = 'p.units("mm"); p.sketch("Front").partialEllipse(0, 0, 30, 20, 0, -90, 90).line(0, 20, 0, -20).end().revolve(360);';
    var RFFE_SPL = 'p.units("mm"); p.sketch("Front").spline([[0,0],[20,5],[30,25],[15,45],[0,50]]).line(0,50,0,0).end().revolve(360);';
    function rfFEDeg(a, b) { return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI; }
    // corners: [{ t (triangle), k, face, p: [x,y,z], n: smooth normal }], grouped by welded position
    function rfFECorners(mesh, normals) {
      var P = mesh.positions64, faceOf = new Int32Array(mesh.triCount), by = {}, list = [];
      mesh.faces.forEach(function (f, fi) { for (var t = f.start; t < f.start + f.count; t++) faceOf[t] = fi; });
      for (var i = 0; i < mesh.triCount * 3; i++) {
        var p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], c = { t: (i / 3) | 0, face: faceOf[(i / 3) | 0], p: p, n: [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]] };
        var key = p.map(function (x) { return Math.round(x * 1e5); }).join(',');
        (by[key] || (by[key] = [])).push(c);
        list.push(c);
      }
      return { by: by, list: list };
    }
    function rfFEFlat(mesh, c) { var fn = mesh.faces[c.face].normal; return rfFEDeg(fn, c.n) < 0.05; }   // Float32 normals: ~0.01° of noise
    // the largest normal jump at a vertex between two smooth corners of faces less than `crease` degrees apart
    function rfFEJump(mesh, C, skip) {
      var worst = 0, at = null;
      Object.keys(C.by).forEach(function (k) {
        var L = C.by[k];
        if (skip && skip(L[0].p)) return;
        for (var a = 0; a < L.length; a++) for (var b = a + 1; b < L.length; b++) {
          if (L[a].face === L[b].face || rfFEFlat(mesh, L[a]) || rfFEFlat(mesh, L[b])) continue;
          if (rfFEDeg(mesh.faces[L[a].face].normal, mesh.faces[L[b].face].normal) > K.smoothOptions.crease) continue;
          var j = rfFEDeg(L[a].n, L[b].n);
          if (j > worst) { worst = j; at = k; }
        }
      });
      return { worst: worst, at: at };
    }
    function rfFEMaxTurn(pl) { var w = 0; for (var i = 1; i + 1 < pl.length; i++) { var a = [pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1], 0], b = [pl[i + 1][0] - pl[i][0], pl[i + 1][1] - pl[i][1], 0], la = Math.hypot(a[0], a[1]), lb = Math.hypot(b[0], b[1]); if (la > 1e-12 && lb > 1e-12) w = Math.max(w, rfFEDeg([a[0] / la, a[1] / la, 0], [b[0] / lb, b[1] / lb, 0])); } return w; }

    test('rfFE: the reported part (R6 fillet on a Ø100 rim, a revolved groove) — no normal jump over 2° inside a curved face, record corners within 1° of their surface, the top and bottom planes flat', function () {
      var r = build(RFFE_REPRO); noErrors(r);
      var n = K.analyticNormals(r.mesh), C = rfFECorners(r.mesh, n), J = rfFEJump(r.mesh, C);
      assert(J.worst <= 2, 'worst jump ' + J.worst.toFixed(3) + '° at ' + J.at);
      var rec = 0, worstRec = 0;
      C.list.forEach(function (c) {
        var f = r.mesh.faces[c.face], k = c.t - f.start, poly = null, acc = 0;
        for (var i = 0; i < f.polys.length; i++) { var nt = f.polys[i].vertices.length - 2; if (k < acc + nt) { poly = f.polys[i]; break; } acc += nt; }
        if (!poly || !poly.surf || !poly.surf.s || poly.surf.fc) return;
        var s = K.surfNormalAt(poly.surf.s, c.p);
        if (!s) return;
        if (s[0] * f.normal[0] + s[1] * f.normal[1] + s[2] * f.normal[2] < 0) s = [-s[0], -s[1], -s[2]];
        rec++; worstRec = Math.max(worstRec, rfFEDeg(s, c.n));
      });
      assert(rec > 100 && worstRec <= 1, rec + ' record corners, worst ' + worstRec.toFixed(4) + '°');
      var planes = r.mesh.faces.filter(function (f) { return Math.abs(f.normal[1]) > 1 - 1e-9 && f.area > 1000; });
      assert(planes.length === 2, 'two big planes: ' + planes.length);
      planes.forEach(function (f) { for (var i = f.start * 9; i < (f.start + f.count) * 9; i += 3) assert(Math.abs(n[i + 1] - f.normal[1]) < 1e-6 && Math.abs(n[i]) < 1e-6, 'plane corners flat'); });
      // the fillet facets (no record on Anvil's fillet of a round edge) are smoothed, not flat
      var smooth = C.list.filter(function (c) { return c.p[1] > 14.5 && c.p[1] < 19.5 && Math.hypot(c.p[0], c.p[2]) > 44.5 && !rfFEFlat(r.mesh, c); }).length;
      assert(smooth > 100, 'fillet corners smoothed: ' + smooth);
      return 'worst jump ' + J.worst.toFixed(3) + '°, records ' + worstRec.toFixed(4) + '°';
    });

    test('rfFE: torus records carry their axial part — the top of a revolved Ø16 ring shades with the axis normal, the outer equator radial', function () {
      var r = build('p.units("mm"); p.sketch("Front").circle(30, 0, 8).end().revolve(360);'); noErrors(r);
      var n = K.analyticNormals(r.mesh), C = rfFECorners(r.mesh, n), top = 0, eq = 0;
      C.list.forEach(function (c) {
        var rho = Math.hypot(c.p[0], c.p[2]);
        if (Math.abs(c.p[1] - 8) < 1e-6) { top++; assert(rfFEDeg(c.n, [0, 1, 0]) < 0.05, 'top normal ' + c.n); }
        if (Math.abs(c.p[1]) < 1e-6 && rho > 37.9) { eq++; assert(rfFEDeg(c.n, [c.p[0] / rho, 0, c.p[2] / rho]) < 0.05, 'equator normal'); }
      });
      assert(top > 10 && eq > 10, top + ' top / ' + eq + ' equator corners');
      assert(rfFEJump(r.mesh, C).worst < 0.05, 'smooth');
      nearRel(r.mp.volume, 2 * Math.PI * Math.PI * 30 * 64, 1e-9, 'torus volume exact');
    });

    test('rfFE: a revolved half ellipse (free-curve chords, surf.fc) is one smooth surface; both poles close at one point with the axis normal, no zero-area triangle; a revolved spline smooth away from its pointed ends', function () {
      var r = build(RFFE_ELL); noErrors(r);
      var fc = 0; r.mesh.faces.forEach(function (f) { f.polys.forEach(function (p) { if (p.surf && p.surf.fc && p.surf.s && p.surf.s.t) fc++; }); });
      assert(fc > 100, 'free-curve chords keep their cone records, flagged: ' + fc);
      var n = K.analyticNormals(r.mesh), C = rfFECorners(r.mesh, n), J = rfFEJump(r.mesh, C);
      assert(J.worst <= 2, 'worst jump ' + J.worst.toFixed(3) + '° at ' + J.at);
      var poles = 0;
      C.list.forEach(function (c) {
        if (Math.hypot(c.p[0], c.p[2]) > 1e-9) return;
        poles++;
        assert(rfFEDeg(c.n, [0, c.p[1] > 0 ? 1 : -1, 0]) <= 1, 'pole normal ' + c.n.map(function (x) { return x.toFixed(4); }) + ' at y ' + c.p[1]);
      });
      assert(poles >= 20, 'pole corners ' + poles);
      var P = r.mesh.positions64, minA = Infinity;
      for (var t = 0; t < r.mesh.triCount; t++) {
        var a = [P[t * 9 + 3] - P[t * 9], P[t * 9 + 4] - P[t * 9 + 1], P[t * 9 + 5] - P[t * 9 + 2]], b = [P[t * 9 + 6] - P[t * 9], P[t * 9 + 7] - P[t * 9 + 1], P[t * 9 + 8] - P[t * 9 + 2]];
        minA = Math.min(minA, Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]) / 2);
      }
      assert(minA > 1e-9, 'smallest triangle ' + minA);
      nearRel(r.mp.volume, 4 / 3 * Math.PI * 30 * 30 * 20, 2e-3, 'ellipsoid volume (faceted profile)');
      var s = build(RFFE_SPL); noErrors(s);
      var Js = rfFEJump(s.mesh, rfFECorners(s.mesh, K.analyticNormals(s.mesh)), function (p) { return Math.hypot(p[0], p[2]) < 1e-9; });
      assert(Js.worst <= 2, 'spline worst jump ' + Js.worst.toFixed(3) + '° at ' + Js.at);
      return 'ellipsoid ' + J.worst.toFixed(3) + '°, spline ' + Js.worst.toFixed(3) + '°, smallest triangle ' + minA.toExponential(2);
    });

    test('rfFE: a cone apex (revolved triangle) shades with each facet\'s own meridian normal there, never NaN; a 12-gon prism, a 2° drafted block and a 5° kinked plate keep every face flat', function () {
      var r = build('p.units("mm"); p.sketch("Front").polyline([[0, 0], [20, 0], [0, 30]]).end().revolve(360);'); noErrors(r);
      var n = K.analyticNormals(r.mesh), k = 20 / 30, apex = 0;
      for (var i = 0; i < n.length; i++) assert(isFinite(n[i]), 'finite');
      rfFECorners(r.mesh, n).list.forEach(function (c) {
        if (Math.abs(c.p[1] - 30) > 1e-9) return;
        apex++;
        var f = r.mesh.faces[c.face].centroid, rho = Math.hypot(f[0], f[2]), want = [f[0] / rho, k, f[2] / rho], l = Math.hypot(want[0], want[1], want[2]);
        assert(rfFEDeg(c.n, [want[0] / l, want[1] / l, want[2] / l]) < 0.5, 'apex normal');
      });
      assert(apex > 10, 'apex corners ' + apex);
      ['p.units("mm"); p.sketch("Top").polygon(0,0,20,12).end().extrude(10);',
        'p.units("mm"); p.sketch("Top").rect(0,0,40,30).end().extrude(10, { draft: 2 });',
        'p.units("mm"); p.sketch("Front").polyline([[0,0],[40,0],[40,2],[20,2],[0,2 + 20 * Math.tan(5 * Math.PI / 180)]]).end().extrude(30);'].forEach(function (code, ci) {
        var b = build(code); noErrors(b);
        var m = K.analyticNormals(b.mesh), C = rfFECorners(b.mesh, m);
        C.list.forEach(function (c) { assert(rfFEFlat(b.mesh, c), 'case ' + ci + ': a corner of face ' + c.face + ' smoothed'); });
      });
    });

    test('rfFE: a fillet on a straight block edge — its corners on the tangent edges take the plane\'s normal (within 1°), the planes stay flat; the worker path is the same function (UI.analyticNormals delegates)', function () {
      var r = build('p.units("mm"); p.sketch("Top").rect(0,0,40,30).end().extrude(10); p.fillet(3, [[40,10,-15]]);'); noErrors(r);
      var n = K.analyticNormals(r.mesh), C = rfFECorners(r.mesh, n), tang = 0;
      Object.keys(C.by).forEach(function (key) {
        var L = C.by[key], flat = L.filter(function (c) { return rfFEFlat(r.mesh, c); }), sm = L.filter(function (c) { return !rfFEFlat(r.mesh, c); });
        if (!sm.length) return;
        flat.forEach(function (fc) {
          var fn = r.mesh.faces[fc.face].normal;
          sm.forEach(function (c) { if (rfFEDeg(r.mesh.faces[c.face].normal, fn) < K.smoothOptions.exact) { tang++; assert(rfFEDeg(c.n, fn) < 1, 'tangent edge corner ' + rfFEDeg(c.n, fn).toFixed(3) + '°'); } });
        });
      });
      assert(tang > 4, 'tangent-edge corners checked: ' + tang);
      assert(rfFEJump(r.mesh, C).worst <= 2, 'fillet smooth');
      assert(typeof K.surfNormalAt === 'function' && K.smoothOptions && K.smoothOptions.crease > 0, 'Kernel.surfNormalAt / smoothOptions');
    });

    test('rfFE: Image Quality angular limit (default 12° since rfFE2: at least 32 chords per circle; maxAngle 10: at least 40) at any chord tolerance, 0 keeps the chord-only count, the setting is in the cache key; spline chords turn ≤ ~10°; legacy and exact volumes unchanged', function () {
      var saved = K.setTessellation({}), hole = 'p.units("in"); p.sketch("Top").rect(0,0,4,3).end().extrude(0.25); p.sketch("Top", 0.25).circle(2, 1.5, 0.125).end().cut(1, { reverse: true });';
      function cylFacets(r) { var n = 0; r.mesh.faces.forEach(function (f) { f.polys.forEach(function (p) { if (p.surf && p.surf.s && p.surf.s.t === 'cyl') n++; }); }); return n; }
      assert(saved.maxAngle === 12 && K.setTessellation('default').maxAngle === 12 && K.segsForRadius(0.1) === 32, 'on by default at 12°: ' + saved.maxAngle);
      var k0 = null, k1 = null, c, c0 = build(hole);
      try {
        k0 = K._.tessKey ? K._.tessKey() : null;
        K.setTessellation({ maxAngle: 10 });
        k1 = K._.tessKey ? K._.tessKey() : null;
        assert(segsForRadius(1) >= 40 && segsForRadius(0.1) >= 40, 'small circles ' + segsForRadius(1) + ' / ' + segsForRadius(0.1));
        K.setTessellation({ chordTol: 1 });
        assert(segsForRadius(10) === 40, 'coarse chord tolerance still 40: ' + segsForRadius(10));
        K.setTessellation({ maxAngle: 0 });
        assert(segsForRadius(10) === 16, 'without the angular limit: ' + segsForRadius(10));
        assert(K.setTessellation({ maxAngle: 10 }).maxAngle === 10, 'settings report maxAngle');
        assert_throws(function () { K.setTessellation({ maxAngle: -1 }); });
        K.setTessellation({ chordTol: saved.chordTol });
        var pl = K.entityPolylines({ t: 'spline', pts: [[0, 0], [10, 8], [20, 0], [30, 8], [40, 0]] })[0].pts;
        assert(rfFEMaxTurn(pl) <= 12, 'spline chord turn ' + rfFEMaxTurn(pl).toFixed(2) + '°');
        c = build(hole);
      } finally { K.setTessellation('default'); K.setTessellation(saved); }
      if (k0 != null) assert(k0 !== k1, 'cache key follows maxAngle: ' + k0 + ' / ' + k1);
      withLegacy(function () { assert(segsForRadius(10) === legacySegs(10), 'legacy unchanged'); });
      noErrors(c); noErrors(c0);
      var exact = 4 * 3 * 0.25 - Math.PI * 0.125 * 0.125 * 0.25;
      nearRel(c.mp.volume, exact, 1e-9, 'plate with a Ø.25 hole at 10°: exact');
      nearRel(c0.mp.volume, exact, 1e-9, 'and without the limit');
      assert(cylFacets(c) >= 40 && cylFacets(c0) < cylFacets(c), 'hole facets ' + cylFacets(c0) + ' -> ' + cylFacets(c));
      return 'hole facets ' + cylFacets(c0) + ' -> ' + cylFacets(c);
    });
    function assert_throws(fn) { var ok = false; try { fn(); } catch (e) { ok = true; } assert(ok, 'throws'); }
  })();
