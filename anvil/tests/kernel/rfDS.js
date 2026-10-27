  // --- rfDS (2026-10-27, lane DS: sketch leftovers) --- Sketch Text as cut outlines (QUEUE 2026-10-07T12 / T16): the
  // font is single-stroke (sketch-font.js); Cut text offsets every stroke into a capsule and unites them
  // (Kernel.textOutline), so each letter is a closed outline and every counter (A, B ×2, 8 ×2, 0, D, O, P, Q, R, 4,
  // 6, 9) is a hole of it: cut through a plate, the islands stay. Stencil bridges every island to its letter (no
  // holes left), and Dissolve keeps the same loops.
  (function () {
    group('rfDS: Sketch Text outlines — counters as islands, stencil, cut through');
    function rfDSArea(pts) { var a = 0; for (var i = 0; i < pts.length; i++) { var q = pts[(i + 1) % pts.length]; a += pts[i][0] * q[1] - q[0] * pts[i][1]; } return a / 2; }
    function rfDSLoops(str, extra) {
      var e = { t: 'text', x: 0, y: 0, str: str, h: 1, mode: 'outline', strokeWidth: 0.12 };
      Object.keys(extra || {}).forEach(function (k) { e[k] = extra[k]; });
      var o = Kernel.textOutline(e), ar = o.loops.map(function (l) { return rfDSArea(l.pts); });
      return { o: o, outer: ar.filter(function (a) { return a > 0; }), holes: ar.filter(function (a) { return a < 0; }) };
    }
    test('rfDS: Cut text "AB80" is four closed outlines with six counters (A 1, B 2, 8 2, 0 1); every letter with a counter keeps it', function () {
      var r = rfDSLoops('AB80');
      assert(r.outer.length === 4 && r.holes.length === 6, '4 outlines, 6 holes: ' + r.outer.length + ' / ' + r.holes.length);
      var want = { A: 1, B: 2, 8: 2, 0: 1, D: 1, O: 1, P: 1, Q: 1, R: 1, 4: 1, 6: 1, 9: 1, H: 0, 1: 0, E: 0 };
      Object.keys(want).forEach(function (ch) {
        var g = rfDSLoops(ch);
        assert(g.outer.length === 1 && g.holes.length === want[ch], ch + ': one outline and ' + want[ch] + ' counter(s), got ' + g.outer.length + ' / ' + g.holes.length);
      });
      return '4 outlines, 6 counters';
    });
    test('rfDS: Stencil "AB80" bridges every counter (6 bridges, no holes left: A and 0 in two pieces, B and 8 likewise)', function () {
      var r = rfDSLoops('AB80', { stencil: true });
      assert(r.o.bridges.length === 6, '6 bridges: ' + r.o.bridges.length);
      assert(r.holes.length === 0, 'no holes: ' + r.holes.length);
      assert(r.outer.length === 8, '8 pieces: ' + r.outer.length);
      return r.outer.length + ' pieces';
    });
    test('rfDS: "AB80" (h 1 in, stroke .12) cut through a 4 × 2 × .25 plate removes the letters\' net area × .25 — the six islands stay in the plate', function () {
      var m = K.newModel('t');
      K.runScript(m, 'p.units("in"); p.sketch("Front").rect(-0.5, -0.5, 4, 2).extrude(0.25); p.sketch("Front", 0.25).text(0, 0, "AB80", { h: 1, mode: "outline", strokeWidth: 0.12 }).cut("through", { reverse: true });');
      var b = K.rebuild(m);
      assert(!Object.keys(b.errors).length, 'rebuild errors: ' + JSON.stringify(b.errors));
      var removed = 4 * 2 * 0.25 - K.massProps(K.meshFromBody(b.body), m.density).volume;
      var r = rfDSLoops('AB80'), sum = function (a) { return a.reduce(function (s, x) { return s + x; }, 0); };
      var net = sum(r.outer) + sum(r.holes), whole = sum(r.outer);
      assert(removed > 0, 'something was cut: ' + removed);
      nearRel(removed, net * 0.25, 2e-2, 'the letters\' net area (the loops are chords, the cut takes true arcs: within 2 %)');
      assert(removed < whole * 0.25 - 0.5 * Math.abs(sum(r.holes)) * 0.25, 'the counters were not cut away: ' + removed + ' vs ' + whole * 0.25);
      var sk = m.features.filter(function (f) { return f.type === 'sketch'; })[1], prof = K.sketchProfile(sk);
      assert(prof && prof.loops.length === 10, 'the profile has the 10 loops: ' + (prof && prof.loops.length));
      return 'removed ' + removed.toFixed(5) + ' in³ (net ' + (net * 0.25).toFixed(5) + ')';
    });
    test('rfDS: Dissolve Sketch Text on a Cut "AB80" gives lines / arcs with the same 10 loops', function () {
      var e = { t: 'text', x: 0, y: 0, str: 'AB80', h: 1, mode: 'outline', strokeWidth: 0.12 };
      var ents = Kernel.dissolveText(e);
      assert(ents.length > 10 && ents.every(function (x) { return x.t === 'line' || x.t === 'arc' || x.t === 'circle'; }), 'lines and arcs: ' + ents.length);
      var prof = K.sketchProfile({ id: 9, type: 'sketch', plane: { ref: 'Front' }, entities: ents });
      assert(prof && prof.loops.length === 10, '10 loops: ' + (prof && prof.loops.length));
      return ents.length + ' entities';
    });
  })();
