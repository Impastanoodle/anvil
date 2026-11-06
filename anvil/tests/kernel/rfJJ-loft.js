  // --- rfJJ (2026-11-06, lane dxfout-2: audit row 17) --- Lofted-Bend (Bent / Formed) between two open profiles: the
  // strip of least total diagonal length, the flat developed facet by facet (every edge its true length), bend lines on
  // the diagonals between facets that are not coplanar, the solid T thick about the profiles (the mid-surface).
  (function () {
    group('rfJJ: Lofted-Bend (Bent with bend lines, Formed), faceting by count / length / chord, flat, DXF, round trip');
    var T = 0.0598, HEAD = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\n';
    // a square hopper 4 × 4 at y 0 to 2 × 2 at y 3 (Top plane: x = X, y = −Z), seam at the middle of the front side
    var SQ4 = 'var a = p.sketch("Top").polyline([[0, -2], [2, -2], [2, 2], [-2, 2], [-2, -2], [-0.001, -2]], false).id();\n';
    var SQ2 = 'var b = p.sketch("Top", 3).polyline([[0, -1], [1, -1], [1, 1], [-1, 1], [-1, -1], [-0.0005, -1]], false).id();\n';
    // square 4 × 4 to round Ø2 (four quarter arcs, a small gap at the front)
    var RND = 'var b = p.sketch("Top", 3).arc(0, 0, 1, 270.03, 360).arc(0, 0, 1, 0, 90).arc(0, 0, 1, 90, 180).arc(0, 0, 1, 180, 270).id();\n';
    function rfJJLB(code) {
      var r = build(HEAD + code);
      noErrors(r);
      r.flat = K.flatPattern(r.model, r.build, r.mesh);
      return r;
    }
    function rfJJArea2(l) { return Math.abs(K.signedArea(l)); }
    function rfJJLayVol(r) {
      var f = r.model.features.filter(function (q) { return q.type === 'loftedBend'; })[0];
      var lay = K.loftedBendLayout(f, r.model, { planes: r.build.planes, sketches: {} });
      var A = 0;
      lay.tris.forEach(function (t) { var u = K.vec.sub(t.p[1], t.p[0]), w = K.vec.sub(t.p[2], t.p[0]); A += K.vec.len(K.vec.cross(u, w)) / 2; });
      return { lay: lay, area: A };
    }

    test('rfJJ: square hopper 4 → 2 over 3: flat area = the four trapezoids 12√10 exactly, 4 bend lines at the corners, each acos(.1) = 84.26° between the sides; volume = area × T; one closed DXF contour', function () {
      var r = rfJJLB(SQ4 + SQ2 + 'p.loftedBend([a, b]);\n');
      near(rfJJArea2(r.flat.loops[0]), (12 - 0.00075) * Math.sqrt(10), 1e-9, 'flat area = 12√10 less the seam gap (.001 / .0005 wide, √10 slant)');
      var L = rfJJLayVol(r);
      near(rfJJArea2(r.flat.loops[0]), L.area, 1e-9, 'flat area = mid-surface area exactly');
      assert(r.flat.bends.length === 4, '4 bend lines, got ' + r.flat.bends.length);
      r.flat.bends.forEach(function (b) {
        near(b.angle, Math.acos(0.1) * 180 / Math.PI, 1e-9, 'bend angle');
        near(Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]), Math.sqrt(1 + 1 + 9), 1e-9, 'corner line true length √11');
      });
      var ups = r.flat.bends.filter(function (b) { return b.up; }).length;
      assert(ups === 0 || ups === 4, 'all four bends the same way: ' + ups);
      nearRel(r.mp.volume, L.area * T, 1e-4, 'volume = area × T');
      var q = K.meshQuality(r.mesh);
      assert(q.closed && !q.openEdges && !q.nonManifoldEdges, 'closed solid');
      var dxf = K.exportDXFFlat(r.flat, 'in'), c = DxfCheck.check(dxf, { units: 'in' });
      assert(c.ok && c.loops.length === 1 && c.loops[0].closed, 'DXF: ' + c.errors.join('; '));
      assert((c.counts['LINE@BEND'] || 0) === 4, 'DXF: 4 BEND lines ' + JSON.stringify(c.counts));
      return 'flat ' + fmt(r.flat.size[0]) + ' × ' + fmt(r.flat.size[1]) + ', ' + r.flat.bends.length + ' bends';
    });

    test('rfJJ: square to round (Bent, 4 facets per quarter arc): each corner fans to its quarter, the flat keeps every profile edge\'s true length, bend lines between facets, volume ≈ area × T', function () {
      var r = rfJJLB(SQ4 + RND + 'p.loftedBend([a, b]);\n'), L = rfJJLayVol(r);
      near(rfJJArea2(r.flat.loops[0]), L.area, 1e-9, 'flat area = mid-surface area');
      // the outline: A's edges then B's, each its 3D length
      var o = r.flat.loops[0], k = 0;
      L.lay.A.forEach(function (p, i) { if (i) { near(Math.hypot(o[i][0] - o[i - 1][0], o[i][1] - o[i - 1][1]), K.vec.len(K.vec.sub(p, L.lay.A[i - 1])), 1e-9, 'A edge ' + i); k++; } });
      assert(L.lay.B.length === 17, 'round: 16 chords, got ' + (L.lay.B.length - 1));
      assert(r.flat.bends.length >= 16, 'bend lines ' + r.flat.bends.length);
      nearRel(r.mp.volume, L.area * T, 2e-3, 'volume ≈ area × T');
      var q = K.meshQuality(r.mesh);
      assert(q.closed && !q.openEdges && !q.nonManifoldEdges, 'closed solid');
      var c = DxfCheck.check(K.exportDXFFlat(r.flat, 'in', { version: 'R2000' }), { units: 'in' });
      assert(c.ok && c.loops.length === 1, 'DXF R2000: ' + c.errors.join('; '));
      return r.flat.bends.length + ' bends, area ' + fmt(L.area);
    });

    test('rfJJ: faceting — Number of bends, Segment length, Chord tolerance set the chords per arc; Formed has no bend lines and a finer strip', function () {
      function chords(opts) { return rfJJLayVol(rfJJLB(SQ4 + RND + 'p.loftedBend([a, b], ' + opts + ');\n')).lay.B.length - 1; }
      assert(chords('{ facetValue: 2 }') === 8, 'count 2 per arc');
      // a quarter arc of r 1: length π/2 → ceil(1.5708 / 0.5) = 4 chords; chord .01 → ceil((π/2) / (2 acos .99)) = 6
      assert(chords('{ faceting: "length", facetValue: 0.5 }') === 16, 'length .5');
      assert(chords('{ faceting: "chord", facetValue: 0.01 }') === 24, 'chord .01');
      var fm = rfJJLB(SQ4 + RND + 'p.loftedBend([a, b], { method: "formed" });\n');
      assert(!fm.flat.bends.length, 'Formed: no bend lines');
      var bt = rfJJLB(SQ4 + RND + 'p.loftedBend([a, b], { facetValue: 8 });\n');
      nearRel(rfJJArea2(fm.flat.loops[0]), rfJJArea2(bt.flat.loops[0]), 5e-3, 'Formed area ≈ the fine Bent one');
    });

    test('rfJJ: refusals — a closed profile, a full circle, one sketch, no sheet; script round trip keeps method and faceting', function () {
      function err(code) { var r = build(HEAD + code); var ids = Object.keys(r.errors || {}); return ids.length ? r.errors[ids[ids.length - 1]] : ''; }
      assert(/open/.test(err('var a = p.sketch("Top").polyline([[0, 0], [2, 0], [2, 2]], true).id();\n' + SQ2 + 'p.loftedBend([a, b]);')), 'closed polyline');
      assert(/open/.test(err(SQ4 + 'var b = p.sketch("Top", 3).circle(0, 0, 1).id();\np.loftedBend([a, b]);')), 'circle');
      var t1 = false; try { build(HEAD + SQ4 + 'p.loftedBend([a]);'); } catch (e) { t1 = /two profile/.test(e.message); }
      assert(t1, 'one sketch refused');
      var t2 = false; try { build('p.units("in");\n' + SQ4 + SQ2 + 'p.loftedBend([a, b]);'); } catch (e) { t2 = /sheet/.test(e.message); }
      assert(t2, 'no sheet refused');
      var r = build(HEAD + SQ4 + RND + 'p.loftedBend([a, b], { faceting: "chord", facetValue: 0.01, method: "bent", name: "Transition" });\n');
      noErrors(r);
      var s = K.generateScript(r.model), r2 = build(s);
      noErrors(r2);
      near(r2.mp.volume, r.mp.volume, 1e-12, 'same volume');
      var f2 = r2.model.features.filter(function (q) { return q.type === 'loftedBend'; })[0];
      assert(f2.faceting === 'chord' && +f2.facetValue === 0.01 && f2.name === 'Transition', 'fields: ' + JSON.stringify(f2));
    });
  })();
