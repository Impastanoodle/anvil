  // --- rfFU (2026-10-30, lane FU: sheet-metal solids that came out open) --- a hole cut across a bend through Unfold →
  // Cut-Extrude → Fold left the folded part open and non-manifold (rfFT finding 1, pin 2: a Ø0.5 hole on a 16 ga L
  // bracket, 61 open / 3 non-manifold edges; 192 of 192 fuzz stacks). Fold now rebuilds the bend's metal from the flat
  // (Kernel wrapRegion: the band less every void, mapped round the bend, no boolean inside the bend) and cuts only the
  // flat faces; its booleans run at a scale matched to T (smBool). Expected volumes are analytic on Anvil's faceted
  // bend: the bend is 8 chords per 90° (δ = A / 8); one zone of flat strip, BA / 8 = δ (R + T/2) long at K = 0.5, maps
  // onto the trapezoid between the inner and outer chords, area (R + T/2) T sin δ, so a through void of flat area a
  // inside the bend zone takes a·T·sin δ / δ out of the folded part, and a void on a flat face takes a·T. Hence
  //   folded = bracket − (unfolded − unfolded with the cut) − T·a_band·(sin δ / δ − 1)
  // with a_band the void's area inside the band (the Fold record's foldCutouts loops). Closed = Evaluate.checkBody: no
  // open, non-manifold or zero-area faces.
  (function () {
    group('rfFU: sheet metal that never cracks (hole across a bend: Unfold, cut, Fold)');
    var U = 'p.units("in");\n';
    function rfFUbracket(T, R, w, d, L) {
      return U + 'p.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -' + d + ', ' + w + ', ' + d + ').end().baseFlange();\n' +
        'p.flange(' + L + ', [[' + (w / 2) + ', ' + T + ', 0]], { position: "inside", lengthRef: "outer" });\n';
    }
    function rfFUclosed(r, label) {
      var c = Evaluate.checkBody(r.body, { maxPairs: 1 });
      assert(c.openEdges.length === 0, label + ': open edges ' + c.openEdges.length);
      assert(c.nonManifoldEdges.length === 0, label + ': non-manifold edges ' + c.nonManifoldEdges.length);
      assert(c.zeroAreaFaces.length === 0, label + ': zero-area faces ' + c.zeroAreaFaces.length);
    }
    // the band area of every void a Fold wrapped (its foldCutouts records, (s, t) in the strip)
    function rfFUband(r) {
      var a = 0;
      r.model.features.forEach(function (f) {
        if (f.type !== 'fold') return;
        (r.build.flanges[f.id] || []).forEach(function (rec) {
          if (rec && rec.kind === 'foldCutouts') rec.cutouts.forEach(function (l) { a += Math.abs(K.signedArea(l)); });
        });
      });
      return a;
    }
    // bracket + each [unfold, cut, fold] cycle: the folded volume by the formula above (δ = 90° / 8, K = 0.5)
    function rfFUcheck(base, T, unf, cuts, label, tol) {
      var dl = Math.PI / 16, f = Math.sin(dl) / dl, code = base, want = build(base).body.volume();
      cuts.forEach(function (c, i) {
        var F0 = build(code + unf).body.volume(), Uc = build(code + unf + c).body.volume();
        code += unf + c + 'p.fold(null);\n';
        var r = build(code);
        noErrors(r);
        var ab = rfFUband(r) - (i ? rfFUband(build(code.slice(0, code.lastIndexOf(unf)))) : 0);
        assert(ab > 1e-4, label + ' cycle ' + (i + 1) + ': the Fold wrapped a void (band area ' + fmt(ab) + ')');
        want -= (F0 - Uc) + T * ab * (f - 1);
        rfFUclosed(r, label + ' cycle ' + (i + 1));
        nearRel(r.body.volume(), want, tol || 1e-9, label + ' cycle ' + (i + 1) + ': folded volume');
      });
      return build(code);
    }
    var T16 = 0.0598, L16 = rfFUbracket(T16, T16, 6, 4, 1.5), UF16 = 'p.unfold([3, ' + T16 + ', 2], null);\n';
    function hole(T, x, z, r) { return 'p.sketch("Top", ' + T + ').circle(' + x + ', ' + z + ', ' + r + ').end().cut("through", { reverse: true });\n'; }

    test('rfFU: a Ø0.5 hole cut flat across the bend of a 16 ga L bracket (rfFT pin 2) folds back closed, volume = bracket − the hole developed round the bend, to 1e-9', function () {
      rfFUcheck(L16, T16, UF16, [hole(T16, 3, 0.05, 0.25)], 'Ø0.5');
    });

    test('rfFU: holes of Ø0.3 and Ø1.0, a slanted slot (twisted walls in every bend zone) and a square slot across the 16 ga bend: each folds closed with its exact volume', function () {
      rfFUcheck(L16, T16, UF16, [hole(T16, 2, 0.05, 0.15)], 'Ø0.3');
      rfFUcheck(L16, T16, UF16, [hole(T16, 3, 0.05, 0.5)], 'Ø1.0');
      rfFUcheck(L16, T16, UF16, ['p.sketch("Top", ' + T16 + ').line(2.5, -0.3, 2.6, -0.3).line(2.6, -0.3, 3.6, 0.3).line(3.6, 0.3, 3.5, 0.3).line(3.5, 0.3, 2.5, -0.3).end().cut("through", { reverse: true });\n'], 'slanted slot');
      rfFUcheck(L16, T16, UF16, ['p.sketch("Top", ' + T16 + ').rect(2.5, -0.3, 1, 0.6).end().cut("through", { reverse: true });\n'], 'square slot');
    });

    test('rfFU: 14 ga and 0.125 brackets (R = T, R = 2T), a hole across the bend each: closed, exact (fuzz sheet 92, 81)', function () {
      var T14 = 0.0747;
      rfFUcheck(rfFUbracket(T14, T14, 6.25, 5.5, 1.875), T14, 'p.unfold([3.125, ' + T14 + ', 2.75], null);\n', [hole(T14, 4.6687, 0.05, 0.25)], '14 ga');
      // R = 2T: δ is still 90° / 8 and K = 0.5, so the same formula holds
      rfFUcheck(U + 'p.sheet(0.125, 0.25, 0.5);\np.sketch("Top").rect(0, -2.25, 3, 2.25).end().baseFlange();\np.flange(0.625, [[3, 0.125, 1.125]], { position: "inside", lengthRef: "outer" });\n',
        0.125, 'p.unfold([1.5, 0.125, 1.125], null);\n', [hole(0.125, 3.05, -0.666, 0.25)], '0.125 R .25');
    });

    test('rfFU: two Unfold / cut / Fold cycles on the same bend (the second hole overlaps nothing): each Fold keeps the first hole and adds the second, closed, exact', function () {
      rfFUcheck(L16, T16, UF16, [hole(T16, 2, 0.05, 0.25), hole(T16, 4, 0.05, 0.2)], 'two cycles');
    });

    test('rfFU: the folded part\'s flat pattern holds the drilled hole exactly: one 32-point loop of radius 0.25 at the drilled centre (the bend no longer adds facet points), blank area × T = bracket blank − the polygon', function () {
      var r = build(L16 + UF16 + hole(T16, 3, 0.05, 0.25) + 'p.fold(null);\n'), b0 = build(L16);
      var f = K.flatPattern(r.model, r.build, r.mesh), f0 = K.flatPattern(b0.model, b0.build, b0.mesh);
      assert(f.loops.length === 2, 'loops ' + f.loops.length);
      var h = f.loops[1], n = h.length, c = [0, 0];
      h.forEach(function (p) { c[0] += p[0] / n; c[1] += p[1] / n; });
      h.forEach(function (p, i) { near(Math.hypot(p[0] - c[0], p[1] - c[1]), 0.25, 1e-6, 'hole point ' + i + ' on the drilled circle'); });
      var poly = n / 2 * 0.0625 * Math.sin(2 * Math.PI / n);
      near(Math.abs(K.signedArea(h)), poly, 1e-9, 'hole area = the ' + n + '-gon');
      near(Math.abs(K.signedArea(f.loops[0])), Math.abs(K.signedArea(f0.loops[0])), 1e-9, 'same blank');
      return n + ' points';
    });

    test('rfFU: Kernel.wrapRegion of a band with no voids is the faceted bend itself: volume = 8 trapezoids × length, closed', function () {
      var R = 0.0598, T = 0.0598, A = Math.PI / 2, BA = A * (R + T / 2), L = 2;
      var plane = { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1] };
      var w = K.wrapRegion([], { A: A, R: R, T: T }, BA, plane, 0, L);
      var c = Evaluate.checkBody(w, { maxPairs: 1 });
      assert(!c.openEdges.length && !c.nonManifoldEdges.length, 'closed: ' + c.openEdges.length + ' / ' + c.nonManifoldEdges.length);
      near(w.volume(), 8 * (R + T / 2) * T * Math.sin(A / 8) * L, 1e-12, 'volume');
    });
  })();
