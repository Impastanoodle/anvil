  // --- rfGI (2026-11-02, lane lofts) --- lofts through three or more sections on Anvil's engine against SolidWorks 2022 SP5,
  // measured by head-tools/sw-reference/ref2_loft.py (raw JSON in Output\SolidWorks Models\Anvil reference\2026-11-02\json\loft):
  // the volume of each part, and the outline of the cut face at each height, as radii along 16 rays at 5° + k·22.5° in the
  // world XZ plane. The rule (kernel-features.js matchLoftSections, loftKnots, splineLoftGrid): a natural cubic spline through
  // corresponding points of the sections, chord-length knots from the points at u = 0 and 0.5 of each piece, arcs treated as
  // equal-ripple cubics. Two-section lofts stay ruled. Out-of-order profiles are refused as SolidWorks refuses them (R07b).
  (function () {
    group('rfGI: lofts through 3+ sections = SolidWorks\' natural spline; two-section lofts stay ruled; out-of-order refused');
    var U = 'p.units("in");\n';
    var L1 = 'var a = p.sketch("Top").centerRect(0, 0, 4, 4).id();\nvar b = p.sketch("Top", 1.5).centerRect(0, 0, 2, 2).id();\nvar c = p.sketch("Top", 3).centerRect(0, 0, 4, 4).id();\n';
    var S29 = 'var a = p.sketch("Top").centerRect(0, 0, 2, 2).id();\nvar b = p.sketch("Top", 1).polygon(0, 0, 1.1, 8, 22.5).id();\nvar c = p.sketch("Top", 2.5).circle(0, 0, 0.75).id();\n';
    var G18 = 'var a = p.sketch("Top").circle(0, 0, 1.5).id();\nvar b = p.sketch("Top", 1.5).centerRect(0, 0, 2, 2).id();\nvar c = p.sketch("Top", 3).circle(0, 0, 0.75).id();\n';
    var ABC = 'p.loft([a, b, c]);\n';
    // id: code, SolidWorks volume, relative tolerance, SolidWorks bbox half-width, measured sections [h, radii along the rays]
    var PARTS = {
      L1: [L1, 23.828711098, 1e-5, 2, [
        [0.375, [1.63905, 1.8408, 2.13149, 1.71205, 1.63905, 1.8408, 2.13149, 1.71205, 1.63905, 1.8408, 2.13149, 1.71205, 1.63905, 1.8408, 2.13149, 1.71205]],
        [0.75, [1.31751, 1.47969, 1.71335, 1.37619, 1.31751, 1.47969, 1.71335, 1.37619, 1.31751, 1.47969, 1.71335, 1.37619, 1.31751, 1.47969, 1.71335, 1.37619]],
        [1.125, [1.09009, 1.22427, 1.41759, 1.13864, 1.09009, 1.22427, 1.41759, 1.13864, 1.09009, 1.22427, 1.41759, 1.13864, 1.09009, 1.22427, 1.41759, 1.13864]],
        [1.5, [1.00382, 1.12738, 1.30541, 1.04853, 1.00382, 1.12738, 1.30541, 1.04853, 1.00382, 1.12738, 1.30541, 1.04853, 1.00382, 1.12738, 1.30541, 1.04853]],
        [2.25, [1.31751, 1.47969, 1.71335, 1.37619, 1.31751, 1.47969, 1.71335, 1.37619, 1.31751, 1.47969, 1.71335, 1.37619, 1.31751, 1.47969, 1.71335, 1.37619]]
      ]],
      S29: [S29, 7.672999045, 1e-5, 1.029483613, [
        [0.25, [1.01804, 1.09809, 1.29991, 1.06327, 1.01956, 1.05885, 1.29809, 1.06327, 1.01956, 1.05885, 1.29809, 1.06357, 1.01795, 1.14412, 1.17778, 1.06485]],
        [0.5, [1.02808, 1.08614, 1.16018, 1.0739, 1.02923, 1.03724, 1.1465, 1.0739, 1.02923, 1.03724, 1.1465, 1.07446, 1.02798, 1.15668, 1.1035, 1.07594]],
        [0.75, [1.02999, 1.079, 1.07691, 1.07653, 1.03031, 1.04789, 1.06506, 1.07653, 1.03031, 1.04789, 1.06506, 1.07679, 1.02994, 1.15579, 1.05663, 1.07749]],
        [1, [1.02015, 1.06559, 1.02015, 1.06559, 1.02015, 1.06559, 1.02015, 1.06559, 1.02015, 1.06559, 1.02015, 1.06559, 1.02015, 1.06559, 1.02015, 1.06559]],
        [1.375, [0.979852, 1.01924, 0.951458, 1.01515, 0.980223, 1.05338, 0.967507, 1.01515, 0.980223, 1.05338, 0.967507, 1.01529, 0.979597, 0.973598, 0.963725, 1.01869]],
        [1.75, [0.915838, 0.944129, 0.884928, 0.932126, 0.916821, 0.980891, 0.903803, 0.932308, 0.916821, 0.980891, 0.903803, 0.932308, 0.914977, 0.89779, 0.897634, 0.944586]],
        [2.125, [0.836676, 0.850586, 0.817254, 0.839978, 0.838237, 0.869456, 0.828252, 0.839978, 0.838237, 0.869456, 0.828252, 0.840804, 0.835744, 0.825237, 0.824466, 0.852386]]
      ]],
      // not 1e-5: the arcs' cubic is a little off in G18's outline (2.5e-5), and SolidWorks' own Mass Properties scatter by
      // 3e-5 here (L1's lower half measures 11.914682 by cut, 11.914286 by the closed form, 11.914356 by half the whole)
      G18: [G18, 12.47522741, 5e-5, 1.5, [
        [0.375, [1.36264, 1.41888, 1.48102, 1.3845, 1.36264, 1.41888, 1.48102, 1.3845, 1.36264, 1.41888, 1.48102, 1.3845, 1.36264, 1.41888, 1.48102, 1.3845]],
        [0.75, [1.23049, 1.32664, 1.44605, 1.26662, 1.23049, 1.32664, 1.44605, 1.26662, 1.23049, 1.32664, 1.44605, 1.26662, 1.23049, 1.32664, 1.44605, 1.26662]],
        [1.125, [1.10886, 1.22722, 1.38849, 1.15228, 1.10886, 1.22722, 1.38849, 1.15228, 1.10886, 1.22722, 1.38849, 1.15228, 1.10886, 1.22722, 1.38849, 1.15228]],
        [1.5, [1.00382, 1.12738, 1.30541, 1.04853, 1.00382, 1.12738, 1.30541, 1.04853, 1.00382, 1.12738, 1.30541, 1.04853, 1.00382, 1.12738, 1.30541, 1.04853]],
        [1.875, [0.919817, 1.03332, 1.19702, 0.960875, 0.919817, 1.03332, 1.19702, 0.960875, 0.919817, 1.03332, 1.19702, 0.960875, 0.919817, 1.03332, 1.19702, 0.960875]],
        [2.25, [0.853471, 0.944126, 1.06743, 0.886738, 0.853471, 0.944126, 1.06743, 0.886738, 0.853471, 0.944126, 1.06743, 0.886738, 0.853471, 0.944126, 1.06743, 0.886738]],
        [2.625, [0.798918, 0.852974, 0.917977, 0.81941, 0.798918, 0.852974, 0.917977, 0.81941, 0.798918, 0.852974, 0.917977, 0.81941, 0.798918, 0.852974, 0.917977, 0.81941]]
      ]]
    };
    var built = {};
    function part(id) { return built[id] || (built[id] = build(U + PARTS[id][0] + ABC)); }
    function closed(r, what) {
      assert(!Object.keys(r.errors).length, what + ' errors ' + JSON.stringify(r.errors));
      (r.build.bodies || []).forEach(function (b) { var c = Evaluate.checkBody(b); assert(!c.openEdges.length && !c.nonManifoldEdges.length, what + ': open ' + c.openEdges.length + ', non-manifold ' + c.nonManifoldEdges.length); });
    }
    // the mesh's outline at height y as radii along the rays: the farthest crossing of each ray from the Y axis
    function radiiAt(mesh, y) {
      var p = mesh.positions64 || mesh.positions, ix = mesh.indices, tri = ix ? ix.length / 3 : p.length / 9, segs = [];
      for (var t = 0; t < tri; t++) {
        var c = [];
        for (var e = 0; e < 3; e++) {
          var i = ix ? ix[3 * t + e] : 3 * t + e, j = ix ? ix[3 * t + (e + 1) % 3] : 3 * t + (e + 1) % 3, ya = p[3 * i + 1] - y, yb = p[3 * j + 1] - y;
          if (ya * yb < 0) { var s = ya / (ya - yb); c.push([p[3 * i] + (p[3 * j] - p[3 * i]) * s, p[3 * i + 2] + (p[3 * j + 2] - p[3 * i + 2]) * s]); }
        }
        if (c.length === 2) segs.push(c);
      }
      var out = [];
      for (var k = 0; k < 16; k++) {
        var th = (5 + 22.5 * k) * Math.PI / 180, cx = Math.cos(th), cz = Math.sin(th), best = 0;
        segs.forEach(function (g) {
          var a = g[0], b = g[1], dx = b[0] - a[0], dz = b[1] - a[1], den = cx * dz - cz * dx;
          if (Math.abs(den) < 1e-14) return;
          var r = (a[0] * dz - a[1] * dx) / den, w = (cz * a[0] - cx * a[1]) / den;
          if (r > best && w >= -1e-9 && w <= 1 + 1e-9) best = r;
        });
        out.push(best);
      }
      return out;
    }
    function worstSection(r, table) {
      var w = 0;
      table.forEach(function (row) {
        // 1e-9 above the height: a mesh row can lie exactly on it (the row at a section)
        var got = radiiAt(r.mesh, row[0] + 1e-9);
        row[1].forEach(function (q, k) { w = Math.max(w, Math.abs(got[k] - q)); });
      });
      return w;
    }
    function sectionsOf(r) {
      var f = r.model.features.filter(function (q) { return q.type === 'loft'; })[0];
      return f.sketches.map(function (id) {
        var s = K.findFeature(r.model, id), pl = K.resolvePlane(s.plane, r.model, r.build.planes || {}), prof = s.profile || K.sketchProfile(s), o = prof.loops.filter(function (l) { return !l.hole; })[0];
        return { plane: pl, loop: o, prof: prof, pts: o.pts.map(function (p) { return K.to3D(pl, p[0], p[1]); }) };
      });
    }

    Object.keys(PARTS).forEach(function (id) {
      var row = PARTS[id];
      test('rfGI: ' + id + ' volume = SolidWorks ' + row[1] + ' within ' + row[2] + ', closed, bounding box within 1e-4', function () {
        var r = part(id);
        closed(r, id);
        nearRel(r.mp.volume, row[1], row[2], id + ' volume');
        near(r.mp.bbox.max[0], row[3], 1e-4, id + ' half width');
        near(r.mp.bbox.min[2], -row[3], 1e-4, id + ' half depth');
      });
      test('rfGI: ' + id + ': every measured section outline within 1e-3 of SolidWorks\'', function () {
        var w = worstSection(part(id), row[4]);
        assert(w <= 1e-3, id + ' worst section ' + w);
      });
    });
    test('rfGI: the knots are chord lengths from u = 0 and 0.5 of each piece: S29 0.4129463, G18 0.4937882 (fits of SolidWorks\' vertex paths)', function () {
      near(K._.loftPatches(sectionsOf(part('S29'))).faces[0].vKnots[1], 0.412946323, 1e-7, 'S29');
      near(K._.loftPatches(sectionsOf(part('G18'))).faces[0].vKnots[1], 0.493788213, 1e-7, 'G18');
    });
    test('rfGI: L1 follows 1 + (1 − 1.5t + 0.5t³) exactly, the closed form of the natural spline, and its side faces stay flat', function () {
      var r = part('L1');
      [0.375, 0.75, 1.125].forEach(function (h) {
        var t = h / 1.5, a = 1 + 1 - 1.5 * t + 0.5 * t * t * t, got = radiiAt(r.mesh, h + 1e-9)[0];
        near(got * Math.cos(5 * Math.PI / 180), a, 3e-4, 'half side at ' + h);
      });
      assert(r.build.body.polygons.length < 2000, 'flat sides stay one strip per row: ' + r.build.body.polygons.length);
    });
    test('rfGI: S29: the square\'s corners take the octagon\'s vertices as SolidWorks does; its sides split at 1/2, 1/2, 1/3 and 2/3', function () {
      var pa = K._.loftPatches(sectionsOf(part('S29')));
      assert(pa.faces.length === 8, 'eight side faces, as SolidWorks: ' + pa.faces.length);
      // world (X, Z) of the point on the square that each of the octagon's vertices (22.5° + k·45°, world) comes from
      var want = { 22.5: [1, 1 / 3], 67.5: [1, 1], 112.5: [0, 1], 157.5: [-1, 1], 202.5: [-1, 0], 247.5: [-1, -1], 292.5: [1, -1], 337.5: [1, -1 / 3] };
      pa.faces.forEach(function (f) {
        var row = f.poles[0], s = row[0], o = row[3], th = Math.atan2(o[2], o[0]) * 180 / Math.PI;   // v poles 0 and 3: the square, the octagon
        if (th < 0) th += 360;
        var w = want[Math.round(th * 2) / 2];
        assert(w, 'an octagon vertex at ' + th);
        near(s[0], w[0], 1e-9, 'X at ' + th);
        near(s[2], w[1], 1e-9, 'Z at ' + th);
      });
    });
    test('rfGI: two-section lofts stay ruled: S28 9.218309, G17 17.518329 (SolidWorks), hopper frustum exact', function () {
      var r = build(U + 'var a = p.sketch("Top").centerRect(0, 0, 3, 2).id();\nvar b = p.sketch("Top", 2.5).circle(0, 0, 0.75).id();\np.loft([a, b]);\n');
      nearRel(r.mp.volume, 9.218308893, 5e-5, 'S28');
      r = build(U + 'var a = p.sketch("Top").centerRect(0, 0, 3, 3).id();\nvar b = p.sketch("Top", 3).circle(0, 0, 1).id();\np.loft([a, b]);\n');
      nearRel(r.mp.volume, 17.51832923, 5e-5, 'G17');
      r = build(U + 'var a = p.sketch("Top").centerRect(0, 0, 4, 4).id();\nvar b = p.sketch("Top", 3).centerRect(0, 0, 2, 2).id();\np.loft([a, b]);\n');
      nearRel(r.mp.volume, 28, 1e-12, 'S27');
    });
    test('rfGI: profiles out of order (R07b: heights 0, 2, 1) are refused as SolidWorks refuses them; in order the same three build', function () {
      var T = 'var a = p.sketch("Top").centerRect(0, 0, 2, 2).id();\nvar b = p.sketch("Top", 2).centerRect(0, 0, 2, 2).id();\nvar c = p.sketch("Top", 1).centerRect(0, 0, 1, 1).id();\n';
      var r = build(U + T + ABC), e = Object.keys(r.errors).map(function (k) { return r.errors[k]; }).join(' ');
      assert(/loft would intersect itself/.test(e) && /profile 2 does not lie between profiles 1 and 3/.test(e), e);
      assert(K.isRefusal(e), 'an on-purpose refusal: ' + e);
      closed(build(U + T + 'p.loft([a, c, b]);\n'), 'in order');
    });
    test('rfGI: the same loft in the other order, or on another plane, is the same solid', function () {
      nearRel(build(U + G18 + 'p.loft([c, b, a]);\n').mp.volume, part('G18').mp.volume, 1e-9, 'G18 from the top down');
      var fr = S29.replace(/"Top"/g, '"Front"'), r = build(U + fr + ABC);
      closed(r, 'S29 on Front');
      nearRel(r.mp.volume, part('S29').mp.volume, 1e-9, 'S29 on Front');
    });
    test('rfGI: every kind of section stays closed: stacked circles, a slot, a tilted last profile, a spline, four sections', function () {
      var r = build(U + 'var a = p.sketch("Top").circle(0, 0, 2).id();\nvar b = p.sketch("Top", 2).circle(0, 0, 1).id();\nvar c = p.sketch("Top", 4).circle(0, 0, 2).id();\n' + ABC);
      closed(r, 'circles');
      nearRel(r.mp.volume, 12 * Math.PI * 139 / 210 * 2 / 2, 2e-4, 'solid of revolution of the spline r = 2 − 1.5t + 0.5t³');
      closed(build(U + 'var a = p.sketch("Top").centerRect(0, 0, 4, 2).id();\nvar b = p.sketch("Top", 2).slot(-1, 0, 1, 0, 0.5).id();\nvar c = p.sketch("Top", 4).polygon(0, 0, 1, 6).id();\n' + ABC), 'slot');
      closed(build(U + 'var a = p.sketch("Top").centerRect(0, 0, 4, 4).id();\nvar b = p.sketch("Top", 3).circle(0.5, 0, 1).id();\nvar c = p.sketch("Front", 4).rect(-1, 5, 2, 2).id();\n' + ABC), 'tilted');
      closed(build(U + 'var a = p.sketch("Top").spline([[-2, 0], [0, 2], [2, 0], [0, -2]], { closed: true }).id();\nvar b = p.sketch("Top", 2).centerRect(0, 0, 2, 2).id();\nvar c = p.sketch("Top", 4).circle(0, 0, 1).id();\n' + ABC), 'spline');
      closed(build(U + 'var a = p.sketch("Top").centerRect(0, 0, 4, 4).id();\nvar b = p.sketch("Top", 1).circle(0, 0, 1.5).id();\nvar c = p.sketch("Top", 2).centerRect(0, 0, 2, 2).id();\nvar d = p.sketch("Top", 4).polygon(0, 0, 1, 5).id();\np.loft([a, b, c, d]);\n'), 'four sections');
    });
    // lane lofts2: a flat cut across a loft, the part below kept. Before csg.js rebuildCaps these came out cracked (S29 at
    // 2.125: 5 bodies; G18 at 2.625: 6 bodies) or falsely refused (S29 at 0.25: zero-thickness), the cap shredded into
    // wedges under the mesh weld by the nearly collinear traces of nearly coplanar facets.
    var CUTCODE = {
      S28: 'var a = p.sketch("Top").centerRect(0, 0, 3, 2).id();\nvar b = p.sketch("Top", 2.5).circle(0, 0, 0.75).id();\np.loft([a, b]);\n',
      S29: PARTS.S29[0] + ABC, G17: 'var a = p.sketch("Top").centerRect(0, 0, 3, 3).id();\nvar b = p.sketch("Top", 3).circle(0, 0, 1).id();\np.loft([a, b]);\n',
      G18: PARTS.G18[0] + ABC, L1: PARTS.L1[0] + ABC,
      P11: 'var a = p.sketch("Top").centerRect(0, 0, 2, 2).id();\nvar b = p.sketch("Top", 2).circle(0, 0, 1).id();\np.loft([a, b]);\n'
    };
    var CUTH = { S28: 2.5, S29: 2.5, G17: 3, G18: 3, L1: 3, P11: 2 };
    function cutAt(id, h) { return build(U + CUTCODE[id] + 'p.sketch("Top", ' + h + ').centerRect(0, 0, 12, 12).end().cut("through", { reverse: false });\n'); }
    // pieces of the mesh: triangles joined through welded corners
    function meshParts(mesh) {
      var p = mesh.positions64 || mesh.positions, ix = mesh.indices, tri = ix ? ix.length / 3 : p.length / 9, id = new Map(), up = [];
      function root(x) { while (up[x] !== x) { up[x] = up[up[x]]; x = up[x]; } return x; }
      function vid(i) { var k = Math.round(p[3 * i] * 1e6) + ',' + Math.round(p[3 * i + 1] * 1e6) + ',' + Math.round(p[3 * i + 2] * 1e6), v = id.get(k); if (v == null) { v = up.length; id.set(k, v); up.push(v); } return v; }
      for (var t = 0; t < tri; t++) {
        var a = vid(ix ? ix[3 * t] : 3 * t), b = vid(ix ? ix[3 * t + 1] : 3 * t + 1), c = vid(ix ? ix[3 * t + 2] : 3 * t + 2);
        up[root(a)] = root(b); up[root(c)] = root(b);
      }
      var n = 0;
      for (var q = 0; q < up.length; q++) if (root(q) === q) n++;
      return n;
    }
    function oneBody(id, h) {
      var r = cutAt(id, h), what = id + ' cut at ' + h;
      closed(r, what);
      assert(r.build.bodies.length === 1, what + ': ' + r.build.bodies.length + ' bodies');
      assert(meshParts(r.mesh) === 1, what + ': ' + meshParts(r.mesh) + ' mesh pieces');
      return r;
    }
    Object.keys(CUTCODE).forEach(function (id) {
      test('rfGI: ' + id + ' cut flat at 20 heights: one closed body, one mesh piece, no error, each time', function () {
        var seen = [];
        for (var i = 1; i <= 20; i++) { var h = Math.round(CUTH[id] * i / 21 * 1e6) / 1e6; seen.push(oneBody(id, h).mp.volume); }
        for (i = 1; i < seen.length; i++) assert(seen[i] > seen[i - 1], id + ': the volume grows with the height');
      });
    });
    test('rfGI: cuts at SolidWorks\' measured heights are one body of SolidWorks\' volume (G18 within 1.2e-4, the others 5e-5)', function () {
      var SW = { S29: [[0.25, 0.9783485], [0.5, 1.919968], [0.75, 2.829996], [1, 3.705745], [1.375, 4.931035], [1.75, 6.013386], [2.125, 6.928431]],
        G18: [[0.375, 2.501114], [0.75, 4.703501], [1.125, 6.613234], [1.5, 8.244851], [1.875, 9.622642], [2.25, 10.773813], [2.625, 11.720175]],
        L1: [[0.375, 4.955286], [0.75, 8.195424], [1.125, 10.324143], [1.5, 11.914682], [2.25, 15.633002]] };
      Object.keys(SW).forEach(function (id) {
        SW[id].forEach(function (q) { nearRel(oneBody(id, q[0]).mp.volume, q[1], id === 'G18' ? 1.2e-4 : 5e-5, id + ' below ' + q[0]); });
      });
    });
    test('rfGI: a later cut and a shell work on the spline side; the STEP export reads back as one closed solid of the same volume', function () {
      var r = build(U + S29 + ABC + 'p.sketch("Top", 3).circle(0, 0, 0.25).end().cut("through");\n');
      closed(r, 'cut');
      assert(r.mp.volume < part('S29').mp.volume && r.mp.volume > part('S29').mp.volume - 1.3, 'a hole of about π·0.25²·2.5: ' + r.mp.volume);
      var X = Exchange, g = part('G18'), step = X.exportSTEP(g.model, g.build), back = X.importFile('g18.step', step, { units: 'in' });
      assert(/MANIFOLD_SOLID_BREP/.test(step), 'solid in the STEP file');
      assert(back.solids.length === 1, 'one solid read back: ' + back.solids.length);
      var P = back.solids[0].positions, T = back.solids[0].triangles, v = 0;
      for (var i = 0; i < T.length; i += 3) {
        var a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3;
        v += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
      }
      nearRel(v, g.build.body.volume(), 1e-6, 'volume of the STEP file');
    });
  })();
