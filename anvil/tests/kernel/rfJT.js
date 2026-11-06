  // --- rfJT (2026-11-06, lane sketchtext): Stencil Cut text for laser-cut part numbers in inch sheet (the PM's
  // .06 in bridge): "B0" cut through a plate and through a Base Flange keeps every island attached (one body, a flat
  // with no loose pieces), its area exact against the bridges; Sketch Text needs no font from the network. ---
  (function () {
    group('rfJT: Stencil "B0" through an inch plate and a Base Flange (.06 in bridges), built-in outline font');
    // the stroke font is sketch-font.js (built in): cap height 12 grid units; "B" bars y = 0, 6, 12 for x 0..5, its
    // arcs from x = 5; "0" arcs R3.5 at (4, 3.5) and (4, 8.5) with sides at x = 0.5 / 7.5
    var H = 0.5, SW = 0.06, BW = 0.06, T = 0.06, s = H / 12;
    function rfJTText(stencil) { return '.text(0.25, 0.25, "B0", { h: ' + H + ', mode: "outline", strokeWidth: ' + SW + (stencil ? ', stencil: true, bridge: ' + BW : '') + ' })'; }
    function rfJTPlate(stencil) {
      return build('p.units("in");\np.sketch("Front").rect(0, 0, 3, 1.5).extrude(' + T + ');\np.sketch("Front", ' + T + ')' + rfJTText(stencil) + '.cut("through", { reverse: true });');
    }
    function rfJTFlange(stencil) {
      return build('p.units("in");\np.sketch("Front").rect(0, 0, 3, 1.5).baseFlange(' + T + ');\np.sketch("Front", ' + T + ')' + rfJTText(stencil) + '.cut("through", { reverse: true });');
    }
    // ∫ from −b to b of √(R² − x²) dx
    function rfJTChordArea(R, b) { return b * Math.sqrt(R * R - b * b) + R * R * Math.asin(b / R); }
    // what the stencil puts back: the B's two bridges (one x, the counters being mirror images) cross its three bars,
    // BW × SW each; the 0's one bridge (BW wide, through its centre) crosses its two R3.5 ring arcs at their tops
    function rfJTBridgeArea() {
      var R1 = 3.5 * s + SW / 2, R0 = 3.5 * s - SW / 2, b = BW / 2;
      return 3 * BW * SW + 2 * (rfJTChordArea(R1, b) - rfJTChordArea(R0, b));
    }
    function rfJTIslands(e) { return K.textOutline(e).loops.filter(function (l) { return K.signedArea(l.pts) < 0; }).length; }
    // pieces of material: connected components of the mesh's triangles (vertices welded at 1e-7 in), so loose centres
    // that rebuild keeps in one body still count apart
    function rfJTBodies(r) {
      var P = r.mesh.positions64 || r.mesh.positions, n = P.length / 9, par = [], key = {}, i, k;
      function find(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
      for (i = 0; i < n; i++) par.push(i);
      for (i = 0; i < n; i++) for (k = 0; k < 3; k++) {
        var o = 9 * i + 3 * k, id = Math.round(P[o] * 1e7) + ',' + Math.round(P[o + 1] * 1e7) + ',' + Math.round(P[o + 2] * 1e7);
        if (key[id] == null) key[id] = i; else par[find(i)] = find(key[id]);
      }
      var roots = {};
      for (i = 0; i < n; i++) roots[find(i)] = true;
      return Object.keys(roots).length;
    }

    test('rfJT: Sketch Text uses the built-in stroke font (SketchFont, no font file, nothing fetched): every letter and digit is there, and Cut text of "B0" makes closed outlines with three counters', function () {
      assert(typeof SketchFont !== 'undefined' && SketchFont.layout && SketchFont.chars, 'SketchFont is loaded with the engine');
      var need = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-#./';
      need.split('').forEach(function (ch) { assert(SketchFont.chars.indexOf(ch) >= 0, 'the font has "' + ch + '"'); });
      var e = { t: 'text', x: 0, y: 0, str: 'B0', h: H, mode: 'outline', strokeWidth: SW };
      assert(rfJTIslands(e) === 3, 'B0 plain: 3 counters (islands), got ' + rfJTIslands(e));
      e.stencil = true; e.bridge = BW;
      assert(rfJTIslands(e) === 0 && K.textOutline(e).bridges.length === 3, 'stencil: no island, 3 bridges: ' + rfJTIslands(e) + ' / ' + K.textOutline(e).bridges.length);
      K.textOutline(e).bridges.forEach(function (b, i) { near(Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1]), BW, 1e-12, 'bridge ' + i + ' is .06 wide'); });
      return need.length + ' characters, 3 bridges .06 wide';
    });

    test('rfJT: "B0" (h .5, stroke .06) cut through a 3 × 1.5 × .06 plate: plain, its three centres fall out (4 bodies); Stencil (.06 bridges) leaves one body whose volume is the plain one plus exactly the bridges\' 3 bars of the B and 2 ring bands of the 0 (× .06 thick)', function () {
      var plain = rfJTPlate(false), st = rfJTPlate(true);
      noErrors(plain); noErrors(st);
      assert(rfJTBodies(plain) === 4, 'plain: plate + 3 loose centres, got ' + rfJTBodies(plain));
      assert(rfJTBodies(st) === 1, 'stencil: one body, got ' + rfJTBodies(st));
      nearRel(st.mp.volume - plain.mp.volume, T * rfJTBridgeArea(), 1e-6, 'stencil − plain (plate + its three loose centres) = the bridges × .06');
      return 'bridges ' + fmt(rfJTBridgeArea()) + ' in², stencil ' + fmt(st.mp.volume) + ' in³';
    });

    test('rfJT: the same Stencil "B0" cut through a .06 Base Flange: one body, and the flat pattern (and its DXF) has the blank plus only the text cut-outs, none inside another (no loose island), its area exactly the stencil body\'s volume / .06', function () {
      var r = rfJTFlange(true);
      noErrors(r);
      assert(rfJTBodies(r) === 1, 'one body: ' + rfJTBodies(r));
      var flat = K.flatPattern(r.model, r.build, r.mesh);
      assert(flat && flat.loops && flat.loops.length > 1, 'a flat with cut-outs');
      var areas = flat.loops.map(function (l) { return Math.abs(K.signedArea(l)); }), outer = areas.indexOf(Math.max.apply(null, areas));
      function inside(p, poly) {
        var c = false;
        for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          var a = poly[i], b = poly[j];
          if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
        }
        return c;
      }
      flat.loops.forEach(function (l, i) {
        if (i === outer) return;
        assert(inside(l[0], flat.loops[outer]), 'cut-out ' + i + ' inside the blank');
        flat.loops.forEach(function (m, j) { if (j !== i && j !== outer) assert(!inside(l[0], m), 'loop ' + i + ' lies inside cut-out ' + j + ': a loose island'); });
      });
      var net = areas.reduce(function (sum, a, i) { return sum + (i === outer ? a : -a); }, 0);
      nearRel(net, r.mp.volume / T, 2e-4, 'flat area = body volume / thickness (the flat loops are chords of the true arcs)');
      nearRel(areas[outer], 3 * 1.5, 1e-9, 'the blank 3 × 1.5');
      var dxf = K.exportDXFFlat(flat, 'in'), c = typeof DxfCheck !== 'undefined' ? DxfCheck.check(dxf, { units: 'in' }) : null;
      if (c) assert(c.ok && c.loops.length === flat.loops.length && c.loops.every(function (l) { return l.closed; }), 'DXF loops closed: ' + (c.errors || []).join('; ') + ' ' + c.loops.length);
      return flat.loops.length + ' loops, net area ' + fmt(net);
    });
  })();
