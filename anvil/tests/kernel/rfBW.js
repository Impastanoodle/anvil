  // --- rfBW (2026-10-13, lane BW: sheet metal used the way the shop does) --- the flats of a hemmed panel, a pan with
  // two lips, a slot and a drilled hole across a bend made after the flange, the side the flat is drawn from, and the
  // gauge table named the short way. 16 ga steel, T = R = 0.0598, K = 0.5.
  (function () {
    group('rfBW: hemmed panel, pan lips, cuts across a bend made after the flange, flat side, gauge table names');
    var T = 0.0598, R = 0.0598, BA90 = Math.PI / 2 * (R + 0.5 * T), BD90 = 2 * (R + T) - BA90;
    var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n';
    function flatOf(code) { var r = build(code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function blankArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? K.signedArea(l) : -Math.abs(K.signedArea(l))); }, 0); }
    function inLoop(flat, i, p) { return K.pointInPoly ? K.pointInPoly(p, flat.loops[i]) : flat.loops[i].some(function (q) { return Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-3; }); }
    test('rfBW: a panel hemmed on both long edges (two open hems, the same gap, folded the same way) unfolds to one loop 6 × (4 + 2·(L + BA − R − T)); both bends UP (was: the second hem laid down by the first, an island of scrap, blank 6 × 11.8)', function () {
      var gap = 0.06, r = gap / 2, BA = Math.PI * (r + 0.5 * T), each = 0.5 - (r + T) + BA - (r + T);   // lane DI2: the hem length is overall from the fold's outer face
      var h = flatOf(HEAD + 'p.hem(0.5, [[3, ' + T + ', 0]], { hemType: "open", gap: ' + gap + ', hemPosition: "inside" });\np.hem(0.5, [[3, ' + T + ', 4]], { hemType: "open", gap: ' + gap + ', hemPosition: "inside" });');
      assert(h.flat.loops.length === 1, 'one loop, got ' + h.flat.loops.length);
      near(h.flat.size[0], 6, 1e-9, 'flat width'); near(h.flat.size[1], 4 + 2 * each, 1e-9, 'flat height');
      assert(h.flat.bends.length === 2 && h.flat.bends.every(function (b) { return b.up; }), 'two UP bends: ' + h.flat.bends.map(function (b) { return b.label; }).join(', '));
      nearRel(blankArea(h.flat) * T, h.mp.volume, 2e-3, 'blank area × T ≈ volume (K = 0.5; the solid\'s bends are 8-facet arcs)');
      return 'flat 6 × ' + fmt(h.flat.size[1]);
    });
    test('rfBW: a pan (four Material Inside walls) with a 0.5 inward lip on two opposite walls, both lips at one height, unfolds to one loop 6 × (4 + 2·(1 − BD) + 2·(0.5 + R + T − BD)) (was: a stray 6 × 0.38 island of the second lip)', function () {
      var p = flatOf(HEAD + 'p.flange(1.0, [[3, ' + T + ', 0], [3, ' + T + ', 4]], { position: "inside", lengthRef: "outer" });\np.flange(0.5, [[3, 1.0, 0.03]], { lengthRef: "outer" });\np.flange(0.5, [[3, 1.0, 3.97]], { lengthRef: "outer" });');
      assert(p.flat.loops.length === 1, 'one loop, got ' + p.flat.loops.length);
      near(p.flat.size[0], 6, 1e-9, 'flat width'); near(p.flat.size[1], 4 + 2 * (1 - BD90) + 2 * (0.5 + R + T - BD90), 1e-9, 'flat height');
      assert(p.flat.bends.length === 4, '4 bends');
      nearRel(blankArea(p.flat) * T, p.mp.volume, 2e-3, 'blank area × T ≈ volume');
      return 'flat 6 × ' + fmt(p.flat.size[1]);
    });
    test('rfBW: a 0.25 slot cut from above through the base, the bend and the whole 1.5 wall (after the flange) is an open notch of the blank from the wall end to 0.2 into the base: 8 corners, no inner loop, area 6 × F − 0.25 × (F − 3.8) (was: the bend strip bridged the slot)', function () {
      var F = 4 + 1.5 - BD90;
      var s = flatOf(HEAD + 'p.flange(1.5, [[3, ' + T + ', 0]], { position: "inside", lengthRef: "outer" });\np.sketch("Top", 2).rect(4, -0.2, 0.25, 0.4).cut("through", { reverse: true, normalCut: false });');
      near(s.flat.size[1], F, 1e-9, 'flat height');
      assert(s.flat.loops.length === 1, 'one loop (an open notch), got ' + s.flat.loops.length);
      assert(s.flat.loops[0].length === 8, '8 corners, got ' + s.flat.loops[0].length);
      near(blankArea(s.flat), 6 * F - 0.25 * (F - 4 + 0.2), 1e-9, 'blank area');
      var dxf = K.exportDXFFlat(s.flat, 'in', { style: 'entities' }), c = DxfCheck.check(dxf, { units: 'in' });
      assert(c.ok, 'DXF check: ' + c.errors.join('; '));
      assert((dxf.match(/\n0\nLINE\n8\nOUTLINE\n/g) || []).length === 8 && !/\n8\nHOLES\n/.test(dxf), 'DXF: 8 outline lines, nothing on HOLES');
      return 'blank area ' + fmt(blankArea(s.flat));
    });
    test('rfBW: a Ø.300 hole drilled square to the wall (Normal Cut from the Front plane) through the wall and its bend reaches the flat as one hole loop running from the wall across the bend strip (was: the strip stayed solid)', function () {
      var edge = -(R + T), wall = edge + BA90;   // the trimmed edge line and the wall's start in the flat
      var h = flatOf(HEAD + 'p.flange(1.5, [[3, ' + T + ', 0]], { position: "inside", lengthRef: "outer" });\np.sketch("Front").circle(2, 0.06, 0.15).cut(0.3, { normalCut: true });');
      assert(h.flat.loops.length === 2, 'outline + one hole, got ' + h.flat.loops.length);
      var lo = Infinity, hi = -Infinity, xs = [Infinity, -Infinity];
      h.flat.loops[1].forEach(function (p) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); xs[0] = Math.min(xs[0], p[0]); xs[1] = Math.max(xs[1], p[0]); });
      assert(lo < wall - 0.05 && hi > wall + 0.01, 'the hole crosses the wall start line ' + fmt(wall) + ': y ' + fmt(lo) + '..' + fmt(hi));
      near((xs[0] + xs[1]) / 2, 2, 1e-6, 'centred on x = 2 (the flat is drawn from the sketch side)'); near(xs[1] - xs[0], 0.3, 1e-6, 'Ø.300 wide');
      assert(h.flat.bends[0].up, 'the bend reads UP');
      var a = Math.abs(K.signedArea(h.flat.loops[1]));
      assert(a > 0.03 && a < 0.071, 'hole area ' + fmt(a) + ' (below the full circle 0.0707)');
      var dxf = K.exportDXFFlat(h.flat, 'in', { style: 'entities' }), c = DxfCheck.check(dxf, { units: 'in' });
      assert(c.ok && c.loops.filter(function (l) { return l.layer === 'HOLES'; }).length === 1, 'DXF: one closed HOLES loop: ' + c.errors.join('; '));
      return 'hole y ' + fmt(lo) + '..' + fmt(hi) + ', area ' + fmt(a);
    });
    test('rfBW: the flat is drawn from the base sketch\'s side: a hole that makes the bottom face a little larger than the top no longer flips the blank over (mirrored, every UP read DOWN); a bottom face a tenth larger still wins', function () {
      var h = flatOf(HEAD + 'p.flange(1.5, [[3, ' + T + ', 0]], { position: "inside", lengthRef: "outer" });\np.sketch("Front").circle(2, 0.06, 0.15).cut(0.3, { normalCut: true });');
      var top = h.mesh.faces.filter(function (f) { return Math.abs(f.normal[1] - 1) < 1e-6 && Math.abs(f.w - T) < 1e-6; })[0], bot = h.mesh.faces.filter(function (f) { return Math.abs(f.normal[1] + 1) < 1e-6 && Math.abs(f.w) < 1e-6; })[0];
      assert(top && bot && bot.area > top.area, 'the hole made the bottom face larger: ' + fmt(bot.area) + ' vs ' + fmt(top.area));
      assert(h.flat.bends[0].up && h.flat.bends[0].label.indexOf('UP') === 0, 'UP: ' + h.flat.bends[0].label);
      // the same part with the base's top pocketed: the top face is far smaller, the flat follows the bottom
      var g = flatOf(HEAD + 'p.sketch("Top", ' + T + ').rect(0.5, -3.5, 5, 3).cut(' + (T / 2) + ', { reverse: true });\np.flange(1.5, [[3, ' + T + ', 0]], { position: "inside", lengthRef: "outer" });');
      assert(g.flat.bends[0].label.indexOf('DOWN') === 0, 'a bottom face a tenth larger wins: ' + g.flat.bends[0].label);
      return h.flat.bends[0].label + ' / ' + g.flat.bends[0].label;
    });
    test('rfBW: gauge tables by their short name in a script: "steel" 16 ga, "aluminium" 12 ga, "Stainless" 14 ga; the sheet stores the full table name so the PropertyManager finds it; an unknown name still fails', function () {
      var s = build('p.units("in");\np.sheet(null, null, null, { gaugeTable: "steel", gauge: "16 ga" });\np.sketch("Top").rect(0, -1, 1, 1).end().baseFlange();');
      assert(s.model.sheet.gaugeTable === K.DEFAULT_GAUGE_TABLE && s.model.sheet.gauge === '16', JSON.stringify(s.model.sheet));
      near(s.model.sheet.thickness, 0.0598, 1e-12, '16 ga steel');
      var a = build('p.units("in");\np.sheet(null, null, null, { gaugeTable: "aluminium", gauge: 12 });\np.sketch("Top").rect(0, -1, 1, 1).end().baseFlange();');
      assert(/^Aluminum/.test(a.model.sheet.gaugeTable), a.model.sheet.gaugeTable); near(a.model.sheet.thickness, 0.0808, 1e-12, '12 ga aluminium');
      var st = build('p.units("in");\np.sheet(null, null, null, { gaugeTable: "Stainless", gauge: "14" });\np.sketch("Top").rect(0, -1, 1, 1).end().baseFlange();');
      assert(/^Stainless/.test(st.model.sheet.gaugeTable), st.model.sheet.gaugeTable); near(st.model.sheet.thickness, 0.0781, 1e-12, '14 ga stainless');
      assert(K.gaugeTable('Steel (Manufacturers\' Standard Gauge)') === K.gaugeTables[K.DEFAULT_GAUGE_TABLE] && K.gaugeTable(null) === K.gaugeTables[K.DEFAULT_GAUGE_TABLE], 'full names and the default still work');
      assert(K.gaugeTable('brass') === null && K.gaugeTable('s') === null, 'unknown or ambiguous names are null');
      var thr = '';
      try { build('p.units("in");\np.sheet(null, null, null, { gaugeTable: "brass", gauge: "16" });'); } catch (e) { thr = e.message; }
      assert(/not in the gauge table/.test(thr), 'unknown table refused: ' + thr);
      return s.model.sheet.gaugeTable;
    });
  })();
