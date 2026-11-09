  // --- rfJV (2026-11-05, lane smcorner-2) --- Corner Relief ▸ 3 Bend corner (cornerType '3bend': kernel-sheetmetal.js
  // bend3Corners, corner3Layout) on a U channel (open-profile Base Flange 3 × 2 × 4, T = R = .06, K .5) with Edge
  // Flanges on the end edges of the base and of both walls: at each end of the U's bends the U bend runs on past the
  // end bends' start line (R + T for Material Inside, R for Outside, 0 for Bend Outside) between them. Rectangular
  // (centred on the bend lines' crossing, or on the start lines' corner P) and Tear (the U bend's stub between the end
  // bends) cut the face, the three bends (exact radial planes), the U wall and both end-flange walls: folded = blank × T
  // exactly, the blank loses T × the relief's area less the corner notch, the relief's corners are on the outline.
  // Also Unfold / Fold of a part with a Welded Corner.
  (function () {
    group('rfJV: Corner Relief 3 Bend corner (rect, tear; Inside / Outside / Bend Outside; end flanges out or base up) and Unfold / Fold with a Welded Corner');
    var T = 0.06, R = 0.06, BA = Math.PI / 2 * (R + T / 2);
    var U = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Front").polyline([[0, 2], [0, 0], [3, 0], [3, 2]], false).end().baseFlange(null, { depth: 4 });\n';
    function fl(at, o) { return 'p.flange(1, [' + JSON.stringify(at) + '], ' + JSON.stringify(o) + ');\n'; }
    // the U with its three end flanges: the base's (down, or up with baseUp) and both walls' (outward)
    function part(pos, baseUp) { return U + fl([1.5, 0, 0], { position: pos, lengthRef: 'outer', reverse: !baseUp }) + fl([0, 1, 0], { position: pos, lengthRef: 'outer', reverse: true }) + fl([3, 1, 0], { position: pos, lengthRef: 'outer', reverse: true }); }
    var STUB = { inside: R + T, outside: R, bendOutside: 0 };   // how far the U bend runs past the end bends' start line
    function blankArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? Math.abs(K.signedArea(l)) : -Math.abs(K.signedArea(l))); }, 0); }
    function make(code) { var r = build(code); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function exact(r, label) {
      noErrors(r);
      var c = Evaluate.checkBody(r.body, { maxPairs: 1 });
      assert(!c.openEdges.length && !c.nonManifoldEdges.length, label + ': closed solid (' + c.openEdges.length + ' open, ' + c.nonManifoldEdges.length + ' non-manifold)');
      assert(r.flat.loops.length === 1, label + ': one blank loop, got ' + r.flat.loops.length);
      nearRel(r.mp.volume, blankArea(r.flat) * T, 1e-12, label + ': folded volume = blank area × T');
    }
    function errOf(r) { var ids = Object.keys(r.errors || {}); return ids.length ? r.errors[ids[ids.length - 1]] : ''; }
    function cr(at, size, opts) { return 'p.cornerRelief(' + JSON.stringify(at) + ', ' + size + ', ' + JSON.stringify(opts) + ');\n'; }
    // the relief's area in the blank, per corner: the square [c − h, c + h]² less its part over the notch [0, BA] × [stub, ∞)
    function relief(size, centred, stub) {
      var c = centred ? BA / 2 : 0, h = size / 2, x0 = Math.max(c - h, 0), x1 = Math.min(c + h, BA), y0 = Math.max(c - h, stub), y1 = c + h;
      return size * size - (x1 > x0 && y1 > y0 ? (x1 - x0) * (y1 - y0) : 0);
    }
    var cache = {};
    function plain(pos, baseUp) { var k = pos + baseUp; return cache[k] || (cache[k] = make(part(pos, baseUp))); }

    test('rfJV: 3 Bend corner candidates: the two ends of the U\'s bends at the flanged end, on the U bends\' start lines at the end bends\' start line; no 2 Bend corner there; none without the wall flanges', function () {
      var a = plain('inside', false), c3 = K.cornerReliefCandidates(a.model, a.build, '3bend');
      exact(a, 'plain');
      assert(c3.length === 2, 'two corners: ' + JSON.stringify(c3));
      var xs = c3.map(function (c) { return c.at[0]; }).sort(function (p, q) { return p - q; });
      near(xs[0], R, 1e-9, 'left corner x'); near(xs[1], 3 - R, 1e-9, 'right corner x');
      c3.forEach(function (c) { near(c.at[1], 0, 1e-9, 'y: the U bends\' origin face'); near(c.at[2], R + T, 1e-9, 'z: the end bends\' start line'); });
      assert(K.cornerReliefCandidates(a.model, a.build).length === 0, 'not offered as 2 Bend corners');
      var b = make(U + fl([1.5, 0, 0], { position: 'inside', lengthRef: 'outer', reverse: true }));
      assert(K.cornerReliefCandidates(b.model, b.build, '3bend').length === 0, 'base end flange only: none');
    });

    test('rfJV: Rectangular .25 centred on the bend lines at both corners, Material Inside / Outside / Bend Outside, end flanges out or the base\'s up: exact, the blank loses T × (.25² less the notch) per corner', function () {
      ['inside', 'outside', 'bendOutside'].forEach(function (pos) {
        [false, true].forEach(function (up) {
          var a = plain(pos, up), at = K.cornerReliefCandidates(a.model, a.build, '3bend').map(function (c) { return c.at; });
          var b = make(part(pos, up) + cr(at, 0.25, { cornerType: '3bend' })), label = pos + (up ? ' base up' : '');
          exact(b, label);
          near(a.mp.volume - b.mp.volume, 2 * T * relief(0.25, true, STUB[pos]), 1e-12, label + ': removed');
          near(blankArea(a.flat) - blankArea(b.flat), 2 * relief(0.25, true, STUB[pos]), 1e-10, label + ': blank');
        });
      });
    });

    test('rfJV: the flat outline has the relief\'s corners (Inside: P at the U\'s start line, the end bends\' start line); on P (not centred) and sizes .1 / .5: exact', function () {
      var a = plain('inside', false), at = K.cornerReliefCandidates(a.model, a.build, '3bend').map(function (c) { return c.at; });
      var b = make(part('inside', false) + cr(at, 0.25, { cornerType: '3bend' })), o = b.flat.loops[0];
      // the left corner in the flat: P = (−1.44, 1.88), x across the U bend toward −X, y toward the end (+Y)
      var P = [-(1.5 - R), 2 - (R + T)], lo = BA / 2 - 0.125, hi = BA / 2 + 0.125;
      [[P[0] - lo, P[1] + lo], [P[0] - hi, P[1] + lo], [P[0] - hi, P[1] + hi], [-P[0] + lo, P[1] + lo]].forEach(function (q) {
        assert(o.some(function (p) { return Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6; }), 'outline has the relief corner ' + q.map(function (x) { return x.toFixed(4); }) + ': ' + JSON.stringify(o.map(function (p) { return p.map(function (x) { return +x.toFixed(4); }); })));
      });
      [[0.25, false], [0.1, true], [0.5, true], [0.5, false]].forEach(function (q) {
        var c = make(part('inside', false) + cr(at, q[0], q[1] ? { cornerType: '3bend' } : { cornerType: '3bend', centeredOnBend: false }));
        exact(c, 'size ' + q[0] + (q[1] ? '' : ' on P'));
        near(a.mp.volume - c.mp.volume, 2 * T * relief(q[0], q[1], STUB.inside), 1e-12, 'size ' + q[0] + (q[1] ? '' : ' on P') + ': removed');
      });
      var dxf = K.exportDXFFlat(b.flat, 'in', { version: 'R2000', style: 'entities' }), chk = DxfCheck.check(dxf, { units: 'in' });
      assert(chk.ok && chk.loops.filter(function (l) { return l.layer === 'OUTLINE'; }).length === 1, 'one clean OUTLINE loop: ' + chk.errors.join('; '));
    });

    test('rfJV: Tear: the U bend\'s stub between the end bends, BA × (R + T) × T per corner (Inside), BA × R × T (Outside); Bend Outside has no stub: nothing to cut', function () {
      [['inside', R + T], ['outside', R], ['bendOutside', 0]].forEach(function (q) {
        var a = plain(q[0], false), at = K.cornerReliefCandidates(a.model, a.build, '3bend').map(function (c) { return c.at; });
        var b = make(part(q[0], false) + cr(at, null, { cornerType: '3bend', reliefType: 'tear' }));
        exact(b, 'tear ' + q[0]);
        near(a.mp.volume - b.mp.volume, 2 * BA * q[1] * T, 1e-12, 'tear ' + q[0] + ': removed');
      });
    });

    test('rfJV: one corner only, errors (no 3 Bend corner, far pick, Constant Width refused) and round trip', function () {
      var a = plain('inside', false), at = K.cornerReliefCandidates(a.model, a.build, '3bend').map(function (c) { return c.at; });
      var one = make(part('inside', false) + cr([at[0]], 0.25, { cornerType: '3bend' }));
      exact(one, 'one corner');
      near(a.mp.volume - one.mp.volume, T * relief(0.25, true, STUB.inside), 1e-12, 'one corner: removed');
      assert(/no corner where three bends meet/.test(errOf(make(U + fl([1.5, 0, 0], { position: 'inside', lengthRef: 'outer', reverse: true }) + cr([[0.06, 0, 0.12]], 0.25, { cornerType: '3bend' })))), 'no 3 Bend corner');
      assert(/no corner of three bends near/.test(errOf(make(part('inside', false) + cr([[1.5, 0, 3]], 0.25, { cornerType: '3bend' })))), 'far pick');
      // lane smflat (rfKG): Circular and Obround are built on a 3 Bend corner now; Constant Width is still refused
      var bad = ''; try { make(part('inside', false) + cr(at, 0.25, { cornerType: '3bend', reliefType: 'constantWidth' })); } catch (e) { bad = e.message; }
      assert(/rect, tear, circular, obround on a 3 Bend corner/.test(bad), 'constant width refused on a 3 Bend corner: ' + bad);
      var r = make(part('inside', false) + cr(at, 0.2, { cornerType: '3bend', centeredOnBend: false }));
      var f = r.model.features[r.model.features.length - 1];
      assert(f.type === 'cornerRelief' && f.cornerType === '3bend' && f.reliefType === 'rect' && f.size === 0.2 && f.centeredOnBend === false, 'feature JSON: ' + JSON.stringify(f));
      var s = K.generateScript(r.model);
      assert(/p\.cornerRelief\([^\n]*\{ cornerType: "3bend", reliefType: "rect", centeredOnBend: false, name: "Corner-Relief1" \}\)/.test(s), 'script: ' + s);
      near(make(s).mp.volume, r.mp.volume, 1e-12, 'same volume');
    });

    test('rfJV: Unfold / Fold of a tray with a Welded Corner: unfolded it is the plain tray blank (the weld left out), folded back the welded part; the flat is the unwelded tray\'s', function () {
      var t = 0.0598, HEAD = 'p.units("in");\np.sheet(' + t + ', ' + t + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
        [[2, t, 0], [4, t, 1.5], [2, t, 3], [0, t, 1.5]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer" });\n'; }).join('');
      var W = 'p.weldedCorner([[' + t / 2 + ', 0.6, ' + 2 * t + ']]);\n';
      var a = make(HEAD), w = make(HEAD + W);
      noErrors(w);
      var uf = build(HEAD + W + 'p.unfold([2, ' + t + ', 1.5], null);\n');
      noErrors(uf);
      near(uf.mp.volume, a.mp.volume, 1e-9, 'unfolded: the weld is not in the flat sheet (SolidWorks suppresses it while unfolded): the tray\'s blank × T');
      var cu = Evaluate.checkBody(uf.body, { maxPairs: 1 });
      assert(!cu.openEdges.length && !cu.nonManifoldEdges.length, 'unfolded: closed');
      var ff = make(HEAD + W + 'p.unfold([2, ' + t + ', 1.5], null);\np.fold();\n');
      noErrors(ff);
      near(ff.mp.volume, w.mp.volume, 1e-9, 'folded back: the welded part\'s volume');
      near(blankArea(ff.flat), blankArea(a.flat), 1e-9, 'the flat is the tray\'s');
      return 'unfolded volume ' + fmt(uf.mp.volume) + ', welded ' + fmt(w.mp.volume) + ', tray ' + fmt(a.mp.volume);
    });
  })();
