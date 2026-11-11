  // --- rfKV (2026-11-11, lane occtperf) --- perforated panels: OpenCascade lays the holes in without a Boolean and
  // triangulates their walls itself in Kernel.segsForRadius facets (occt-kernel.js "rfKV"; rows "rfKV" of
  // tests/occt-tests.html hold it to the Boolean build). Here Anvil's own engine is held to the same panels: the
  // analytic volume and the facet count OpenCascade's mesh copies (a Ø.25 in wall: 32 facets at the inch default),
  // for a Cut-Extrude of the circles, the outline sketched with its holes, and a cut patterned by LPattern.
  (function () {
    group('rfKV: perforated 16 ga panels (OpenCascade\'s plate path benchmarks) on Anvil\'s engine');
    var T = 0.0598, R = 0.125;
    function code(mode, cols, rows) {
      var sx = 22 / cols, sy = 46 / rows, s = '', c = 'p.units("in");\n';
      for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) s += '.circle(' + (1 + sx / 2 + i * sx) + ', ' + (1 + sy / 2 + j * sy) + ', ' + R + ')';
      if (mode === 'boss') return c + 'p.sketch("Top").rect(0, 0, 24, 48)' + s + '.end().extrude(' + T + ');\n';
      c += 'p.sketch("Top").rect(0, 0, 24, 48).end().extrude(' + T + ');\n';
      if (mode === 'feature') return c + 'p.sketch("Top", ' + T + ').circle(' + (1 + sx / 2) + ', ' + (1 + sy / 2) + ', ' + R + ').end().cut("through", { reverse: true });\n' +
        'p.linearPattern({ dir: "x", spacing: ' + sx + ', count: ' + cols + ', dir2: "z", spacing2: ' + sy + ', count2: ' + rows + ', reverse2: true });\n';
      return c + 'p.sketch("Top", ' + T + ')' + s + '.end().cut("through", { reverse: true });\n';
    }
    // the walls' facets: distinct facet planes per hole axis (a facet may be split in several polygons)
    function wallFacets(r) {
      var holes = {}, n = 0;
      r.build.body.polygons.forEach(function (p) {
        var q = p.surf && (p.surf.s || p.surf);
        if (!q || q.t !== 'cyl' || Math.abs(q.r - R) > 1e-9) return;
        var hk = q.o.map(function (x) { return Math.round(x * 1e4); }).join(), pn = p.plane.normal, nk = [pn.x, pn.y, pn.z].map(function (x) { return Math.round(x * 1e6); }).join();
        var h = holes[hk] || (holes[hk] = {});
        if (!h[nk]) { h[nk] = true; n++; }
      });
      return n;
    }
    [['cut', 20, 30], ['boss', 10, 20], ['feature', 8, 8]].forEach(function (cs) {
      test('rfKV: 24 x 48 16 ga panel, ' + cs[1] * cs[2] + ' Ø.25 holes (' + cs[0] + '): volume (24·48 − n π r²) T to 1e-9, every wall in 32 facets', function () {
        var n = cs[1] * cs[2], r = build(code(cs[0], cs[1], cs[2]));
        noErrors(r);
        assert(r.build.bodies.length === 1, r.build.bodies.length + ' bodies');
        nearRel(r.mp.volume, (24 * 48 - n * Math.PI * R * R) * T, 1e-9, 'volume');
        var f = wallFacets(r);
        assert(f === 32 * n, f + ' wall facets for ' + n + ' holes, want 32 each');
      });
    });
  })();
