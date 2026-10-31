  // --- rfFX (2026-10-30, lane FX: exact Mass Properties for bent sheet metal) --- every bent part on Anvil's engine
  // read 1.4e-4 to 7e-4 light (rfFT FACET rows): the bend's inner and outer surfaces are chords. Each bend facet now
  // carries the cylinder record of its surface ({ t: 'cyl', o, d, r }: radius R inside, R + T outside, axis the bend
  // line), from flangeProfile's section (edge flange, hems of every type, jog, Miter Flange stages), the Sketched Bend,
  // Insert Bends' wedges and Fold's rebuilt bend (wrapRegion, whose points inside a zone now sit at the true angle on
  // the chord), so massProps integrates the chords out to the true arcs. At K 0.5 the neutral surface is the
  // mid-surface and a bend keeps its flat area: folded volume = flat area × T exactly (rfFT's rule), checked to 1e-9.
  // mp.polygonal stays the faceted volume (consistentVolume). A loft through coaxial full circles carries its cone.
  (function () {
    group('rfFX: exact Mass Properties for bent sheet metal (cylinder records on bend faces), loft cone record');
    var U = 'p.units("in");\n', T = 0.0598, R = 0.0598, PI = Math.PI, BA = PI / 2 * (R + T / 2), BD = 2 * (R + T) - BA;
    function rfFXhead(w, d, t, r, k) { return U + 'p.sheet(' + (t || T) + ', ' + (r || R) + ', ' + (k || 0.5) + ');\np.sketch("Top").rect(0, -' + d + ', ' + w + ', ' + d + ').end().baseFlange();\n'; }
    function rfFXfl(L, e) { return 'p.flange(' + L + ', ' + JSON.stringify(e) + ', { position: "inside", lengthRef: "outer" });\n'; }
    function rfFXok(r) {
      var e = Object.keys(r.errors).map(function (k) { return r.errors[k]; });
      assert(!e.length, 'errors: ' + e.join(' | '));
      var c = Evaluate.checkBody(r.body, { maxPairs: 1 });
      assert(!c.openEdges.length && !c.nonManifoldEdges.length, c.openEdges.length + ' open, ' + c.nonManifoldEdges.length + ' non-manifold edges');
      consistentVolume(r);
    }
    function rfFXareaT(r, t) {
      var fl = K.flatPattern(r.model, r.build, r.mesh);
      return fl.loops.reduce(function (s, l, i) { return s + (i ? -1 : 1) * Math.abs(K.signedArea(l)); }, 0) * (t || T);
    }
    // the cylinder records on the part's facets: { radius: facet count }
    function rfFXcyl(r) {
      var out = {};
      r.body.polygons.forEach(function (p) { var s = p.surf && p.surf.s; if (s && s.t === 'cyl') { var k = s.r.toFixed(6); out[k] = (out[k] || 0) + 1; } });
      return out;
    }
    function rfFXexact(code, want, label, t, tol) {
      var r = build(code);
      rfFXok(r);
      nearRel(r.mp.volume, want, tol || 1e-9, label + ' volume');
      assert(polyVol(r.mp) < r.mp.volume, 'the faceted volume ' + polyVol(r.mp) + ' is the lighter one');
      return r;
    }

    test('rfFX: 16 ga L bracket 6 × 4 + 1.5: volume = 6·(5.5 − BD)·T to 1e-9, bend facets on cylinders R and R + T', function () {
      var r = rfFXexact(rfFXhead(6, 4) + rfFXfl(1.5, [[3, T, 0]]), 6 * (5.5 - BD) * T, 'L bracket');
      var c = rfFXcyl(r);
      assert(c[R.toFixed(6)] >= 8 && c[(R + T).toFixed(6)] >= 8, 'cylinder records ' + JSON.stringify(c));
      nearRel(rfFXareaT(r), r.mp.volume, 1e-9, 'flat area × T');
      return 'volume ' + r.mp.volume.toFixed(9) + ' (faceted ' + polyVol(r.mp).toFixed(9) + ')';
    });
    test('rfFX: aluminium 0.125 / R 0.125 / K 0.5 U channel: volume = flat area × T to 1e-9', function () {
      var t = 0.125, rr = 0.125, ba = PI / 2 * (rr + t / 2), bd = 2 * (rr + t) - ba;
      var r = rfFXexact(rfFXhead(5, 3, t, rr) + 'p.flange(2, [[2.5, ' + t + ', 0], [2.5, ' + t + ', 3]], { position: "inside", lengthRef: "outer" });\n', 5 * (7 - 2 * bd) * t, 'U channel', t);
      return 'volume ' + r.mp.volume.toFixed(9);
    });
    ['open', 'closed', 'teardrop', 'rolled'].forEach(function (ht) {
      test('rfFX: ' + ht + ' hem on a 6 × 4 plate: volume = flat area × T to 1e-9', function () {
        var r = build(rfFXhead(6, 4) + 'p.hem(0.5, [[3, ' + T + ', 0]], { hemType: "' + ht + '" });\n');
        rfFXok(r);
        nearRel(r.mp.volume, rfFXareaT(r), 1e-9, ht + ' hem volume vs flat area × T');
        assert(Object.keys(rfFXcyl(r)).length >= 2, 'cylinder records ' + JSON.stringify(rfFXcyl(r)));
        return 'volume ' + r.mp.volume.toFixed(9) + ' (faceted ' + polyVol(r.mp).toFixed(9) + ')';
      });
    });
    test('rfFX: open hem on an L bracket flange and a 120° flange: volume = flat area × T to 1e-9', function () {
      var r = build(rfFXhead(6, 4) + rfFXfl(1.5, [[3, T, 0]]) + 'p.hem(0.375, [[3, 1.5, ' + T / 2 + ']]);\n' + 'p.flange(1, [[3, ' + T + ', 4]], { angle: 120 });\n');
      rfFXok(r);
      nearRel(r.mp.volume, rfFXareaT(r), 1e-9, 'volume vs flat area × T');
    });
    test('rfFX: edge jog 0.5 × 1: volume = flat area × T to 1e-9', function () {
      var r = build(rfFXhead(6, 4) + 'p.jog(0.5, 1, [[3, ' + T + ', 0]]);\n');
      rfFXok(r);
      nearRel(r.mp.volume, rfFXareaT(r), 1e-9, 'jog volume vs flat area × T');
    });
    test('rfFX: two Sketched Bends (a channel from a flat 6 × 4): volume = 24·T to 1e-9; sketch jog too', function () {
      rfFXexact(rfFXhead(6, 4) + 'p.sketch("Top", ' + T + ').line(1.5, 0, 1.5, -4).line(4.5, 0, 4.5, -4).sketchedBend(90);\n', 24 * T, 'sketched bends');
      rfFXexact(rfFXhead(6, 4) + 'p.sketch("Top", ' + T + ').line(3, 0, 3, -4).end().jog(0.375, { fixed: [1, ' + T + ', 2] });\n', 24 * T, 'sketch jog');
    });
    test('rfFX: Miter Flange 1 high along two edges: OpenCascade\'s exact volume 0.822546049 to 1e-7 (was 3.9e-4 light)', function () {
      var r = build(rfFXhead(4, 2, 0.06, 0.06) + 'p.sketch("Right").line(0, 0.06, 0, 1.06).end();\np.miterFlange([[2, 0.06, 0], [0, 0.06, 1]], {});\n');
      rfFXok(r);
      nearRel(r.mp.volume, 0.822546049, 1e-7, 'Miter Flange volume');
      return 'volume ' + r.mp.volume.toFixed(9);
    });
    test('rfFX: Insert Bends on a ripped shelled box: OpenCascade\'s exact volume 0.646338936 to 1e-8', function () {
      var r = build(U + 'p.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\np.shell(0.06, [[1, 1, -1]]);\np.rip([[2, 0.5, 0], [2, 0.5, -2], [0, 0.5, -2], [0, 0.5, 0]], 0.03);\np.insertBends([1, 0, -1], { radius: 0.06 });\n');
      rfFXok(r);
      nearRel(r.mp.volume, 0.646338936, 1e-8, 'Insert Bends volume');
    });
    test('rfFX: 1 × 0.25 slot across the bend (Unfold, Cut, Fold): volume = L bracket − 0.25·T to 1e-9', function () {
      var r = rfFXexact(rfFXhead(6, 4) + rfFXfl(1.5, [[3, T, 0]]) + 'p.unfold([1, ' + T + ', 2], null);\np.sketch("Top", ' + T + ').rect(2.5, 0, 1, 0.25).end().cut("through", { reverse: true });\np.fold(null);\n',
        6 * (5.5 - BD) * T - 0.25 * T, 'slot across the bend');
      nearRel(rfFXareaT(r), r.mp.volume, 1e-9, 'flat area × T');
    });
    test('rfFX: Ø0.5 holes straddling both bends of a U channel (Unfold, Cut, Fold): closed form to 2e-5 (the hole\'s wall inside the bend is the void\'s polygon)', function () {
      var want = (6 * (7 - 2 * BD) - 2 * PI * 0.0625) * T;
      var r = build(rfFXhead(6, 4) + rfFXfl(1.5, [[3, T, 0], [3, T, 4]]) + 'p.unfold([3, ' + T + ', 2], null);\np.sketch("Top", ' + T + ').circle(3, 0.05, 0.25).circle(3, -3.95, 0.25).end().cut("through", { reverse: true });\np.fold(null);\n');
      rfFXok(r);
      nearRel(r.mp.volume, want, 2e-5, 'holes across the bends');
      return 'rel ' + ((r.mp.volume - want) / want).toExponential(2) + ' (was 2.4e-4)';
    });
    test('rfFX: a window cut down through a folded bend (Cut-Extrude on the part) keeps the records on the split facets', function () {
      // plan view: the bend spans z 0 … R + T; the wall's inside face is at z = T: the window z 0.07 … 0.11 cuts the bend only
      var r = build(rfFXhead(6, 4) + rfFXfl(1.5, [[3, T, 0]]) + 'p.sketch("Top", 0.2).rect(2, -0.11, 1, 0.04).end().cut("through", { reverse: true });\n');
      rfFXok(r);
      var c = rfFXcyl(r);
      assert(c[R.toFixed(6)] >= 8 && c[(R + T).toFixed(6)] >= 8, 'cylinder records ' + JSON.stringify(c));
      assert(polyVol(r.mp) < r.mp.volume, 'faceted is lighter');
      // what the window takes: the quarter annulus (radii R, R + T about the axis at y = z = R + T) between the planes
      // z = 0.07 and 0.11, i.e. x = R + T − z from 0.0096 to 0.0496 off the axis, × 1 along the bend
      function F(x, a) { return (x * Math.sqrt(a * a - x * x) + a * a * Math.asin(x / a)) / 2; }
      var x0 = R + T - 0.11, x1 = R + T - 0.07, cutA = F(x1, R + T) - F(x0, R + T) - (F(x1, R) - F(x0, R));
      var want = 6 * (5.5 - BD) * T - cutA;
      nearRel(r.mp.volume, want, 1e-7, 'bracket less the window');
      return 'rel ' + ((r.mp.volume - want) / want).toExponential(2) + ' (faceted ' + ((polyVol(r.mp) - want) / want).toExponential(2) + ')';
    });
    test('rfFX: loft between coaxial circles Ø80 → Ø14 (40 apart) is a cone: volume = π h (R² + R r + r²) / 3 to 1e-8', function () {
      var r = build('p.units("mm");\nvar a = p.sketch("Top", 60).circle(0, 0, 40).id();\nvar b = p.sketch("Top", 20).circle(0, 0, 7).id();\np.loft([a, b]);\n');
      rfFXok(r);
      nearRel(r.mp.volume, PI * 40 / 3 * (1600 + 280 + 49), 1e-8, 'cone volume');
      var cone = r.body.polygons.filter(function (p) { return p.surf && p.surf.s && p.surf.s.t === 'cone'; }).length;
      assert(cone > 20, cone + ' cone facets');
      var cyl = build('p.units("mm");\nvar a = p.sketch("Top", 30).circle(0, 0, 10).id();\nvar b = p.sketch("Top", 0).circle(0, 0, 10).id();\np.loft([a, b]);\n');
      nearRel(cyl.mp.volume, PI * 100 * 30, 1e-8, 'equal circles: cylinder');
      return 'cone ' + r.mp.volume.toFixed(6) + ' (faceted ' + polyVol(r.mp).toFixed(6) + ')';
    });
    test('rfFX: the Funnel example (cone loft + spout, shelled 1.5 open both ends) = its closed form to 1e-7', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Funnel'; })[0];
      var r = build(ex.code);
      rfFXok(r);
      var k = 33 / 40, off = 1.5 * Math.sqrt(1 + k * k), ri = 7 - off, ya = 20 + (5.5 - ri) / k, r60 = ri + k * 40;
      function fr(h, a, b) { return PI * h / 3 * (a * a + a * b + b * b); }
      var want = fr(40, 40, 7) + PI * 49 * 20 - fr(60 - ya, 5.5, r60) - PI * 5.5 * 5.5 * ya;
      nearRel(r.mp.volume, want, 1e-7, 'Funnel volume');
      return 'Funnel ' + r.mp.volume.toFixed(6) + ' mm³ (closed form ' + want.toFixed(6) + ')';
    });
  })();
