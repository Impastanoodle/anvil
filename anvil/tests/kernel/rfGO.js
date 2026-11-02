  // --- rfGO (2026-11-02, lane step-size) --- a body that is one loft through 3+ sections goes to STEP as its bicubic patches
  // (exchange.js splineLoftOf / writeLoftBrep, the patches of kernel-features.js loftPatches): 15 KB to 40 KB, was 15 MB of
  // planar facets. Anvil's reader takes the same faces back (splineFace). G18's limit is 2e-5, not 1e-5: the file holds the
  // true surface, 1.2e-5 over the part's mesh, whose rows lose area next to the arcs' ends (splineLoftGrid has no end
  // correction); the surface is the nearer one to SolidWorks (patches -2.4e-5, mesh -3.6e-5).
  (function () {
    group('rfGO: 3+ section lofts go to STEP as B-spline faces, under 1 MB, and read back closed at the part\'s volume');
    var U = 'p.units("in");\n', ABC = 'p.loft([a, b, c]);\n';
    var PARTS = {
      L1: ['var a = p.sketch("Top").centerRect(0, 0, 4, 4).id();\nvar b = p.sketch("Top", 1.5).centerRect(0, 0, 2, 2).id();\nvar c = p.sketch("Top", 3).centerRect(0, 0, 4, 4).id();\n', 4, 1e-5],
      S29: ['var a = p.sketch("Top").centerRect(0, 0, 2, 2).id();\nvar b = p.sketch("Top", 1).polygon(0, 0, 1.1, 8, 22.5).id();\nvar c = p.sketch("Top", 2.5).circle(0, 0, 0.75).id();\n', 8, 1e-5],
      G18: ['var a = p.sketch("Top").circle(0, 0, 1.5).id();\nvar b = p.sketch("Top", 1.5).centerRect(0, 0, 2, 2).id();\nvar c = p.sketch("Top", 3).circle(0, 0, 0.75).id();\n', 4, 2e-5]
    };
    function rfGOvolume(s) {
      var P = s.positions, T = s.triangles, v = 0;
      for (var i = 0; i < T.length; i += 3) {
        var a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3;
        v += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
      }
      return v;
    }
    // edges used other than once each way, on points rounded to 1e-7
    function rfGOopen(s) {
      var P = s.positions, T = s.triangles, use = {}, bad = 0;
      function key(i) { return Math.round(P[i * 3] * 1e7) + ',' + Math.round(P[i * 3 + 1] * 1e7) + ',' + Math.round(P[i * 3 + 2] * 1e7); }
      for (var t = 0; t < T.length; t += 3) for (var e = 0; e < 3; e++) {
        var a = key(T[t + e]), b = key(T[t + (e + 1) % 3]);
        if (a === b) continue;
        use[a + '>' + b] = (use[a + '>' + b] || 0) + 1;
      }
      Object.keys(use).forEach(function (k) { var ab = k.split('>'); if (use[k] !== 1 || use[ab[1] + '>' + ab[0]] !== 1) bad++; });
      return bad;
    }
    Object.keys(PARTS).forEach(function (id) {
      test('rfGO: ' + id + ' is ' + PARTS[id][1] + ' B-spline faces and two planes, under 1 MB; it reads back as one closed solid', function () {
        var r = build(U + PARTS[id][0] + ABC), step = Exchange.exportSTEP(r.model, r.build), back = Exchange.importFile(id + '.step', step, { units: 'in' });
        assert(step.length < 1e6, 'bytes ' + step.length);
        assert((step.match(/B_SPLINE_SURFACE_WITH_KNOTS/g) || []).length === PARTS[id][1], 'B-spline faces');
        assert((step.match(/=ADVANCED_FACE/g) || []).length === PARTS[id][1] + 2, 'faces');
        assert((step.match(/=PLANE\(/g) || []).length === 2, 'planes');
        assert(back.solids.length === 1 && !back.warnings.length, 'solids ' + back.solids.length + ' ' + back.warnings);
        assert(rfGOopen(back.solids[0]) === 0, 'open edges ' + rfGOopen(back.solids[0]));
        nearRel(rfGOvolume(back.solids[0]), r.mp.volume, PARTS[id][2], 'volume read back');
      });
    });
    test('rfGO: a loft a later feature cut keeps its facets, and so does a two-section loft', function () {
      var r = build(U + PARTS.S29[0] + ABC + 'p.sketch("Top", 3).circle(0, 0, 0.25).end().cut("through");\n'), s = Exchange.exportSTEP(r.model, r.build);
      assert(!/B_SPLINE/.test(s), 'cut loft');
      var q = build(U + 'var a = p.sketch("Top").centerRect(0, 0, 2, 2).id();\nvar b = p.sketch("Top", 2).centerRect(0, 0, 1, 1).id();\np.loft([a, b]);\n');
      assert(!/B_SPLINE/.test(Exchange.exportSTEP(q.model, q.build)), 'two sections');
    });
  })();
