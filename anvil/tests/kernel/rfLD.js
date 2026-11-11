  // --- rfLD (2026-11-11, lane curveperf) --- big perforated panels quick after the build: Kernel.meshCurveInfo is
  // linear in the mesh's faces (polysOf concatenated the whole list per face: 75 s at 1800 holes), and a feature
  // pattern / mirror of a through hole in a plate takes the plate path (kernel-curves.js plateCutParts on the tool's
  // parts, CSG.unionApart) instead of a running union of the copies and a boolean (LPattern of 600: 67 s). Fallbacks to
  // the boolean (instances overlapping, leaving the plate, blind) are held to the boolean-only build.
  (function () {
    group('rfLD: perforated panels quick from end to end (meshCurveInfo linear, feature patterns of holes on the plate path)');
    var T = 0.0598, R = 0.125;
    function rfLDplate(extra) { return 'p.units("in");\np.sketch("Top").rect(0, 0, 24, 48).end().extrude(' + T + ');\n' + extra; }
    function rfLDhole(x, y, r) { return 'p.sketch("Top", ' + T + ').circle(' + x + ', ' + y + ', ' + (r || R) + ').end().cut("through", { reverse: true });\n'; }
    function rfLDpattern(cols, rows, sx, sy) {
      return rfLDplate(rfLDhole(1 + sx / 2, 1 + sy / 2) + 'p.linearPattern({ dir: "x", spacing: ' + sx + ', count: ' + cols + ', dir2: "z", spacing2: ' + sy + ', count2: ' + rows + ', reverse2: true });\n');
    }
    // the walls' facets: distinct facet planes per hole axis (rfKV's count)
    function rfLDwallFacets(r) {
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
    // build with the plate path on (K.plateOptions.last says whether it ran) and, when asked, off: the boolean build
    function rfLDbuild(code, off) {
      var po = K.plateOptions, keep = po.on;
      po.last = null;
      var r = build(code);
      r.plate = po.last;
      if (off) { po.on = false; try { r.off = build(code); } finally { po.on = keep; } }
      return r;
    }
    function rfLDsame(r, label) {
      noErrors(r); noErrors(r.off);
      nearRel(r.mp.volume, r.off.mp.volume, 1e-9, label + ': volume = the boolean build');
      assert(r.build.bodies.length === r.off.build.bodies.length, label + ': ' + r.build.bodies.length + ' bodies, boolean ' + r.off.build.bodies.length);
    }

    test('rfLD: Kernel.meshCurveInfo is linear in the faces (40 000 one-polygon faces in well under 1.5 s; the old concat took seconds)', function () {
      var faces = [];
      for (var i = 0; i < 40000; i++) faces.push({ polys: [{ vertices: [], surf: null }] });
      var t0 = performance.now(), ci = K.meshCurveInfo({ faces: faces }), ms = performance.now() - t0;
      assert(ci.faces === 40000 && ci.faceSurfs.length === 40000 && ci.key0.length === 40000 && ci.curves.length === 0, 'shape');
      assert(ms < 1500, ms.toFixed(0) + ' ms');
    });

    test('rfLD: meshCurveInfo of a 600-hole panel: one surface key per hole wall, 1200 true circles (rims), under 3 s', function () {
      var cols = 30, rows = 20, sx = 22 / cols, sy = 46 / rows, s = '';
      for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) s += '.circle(' + (1 + sx / 2 + i * sx) + ', ' + (1 + sy / 2 + j * sy) + ', ' + R + ')';
      var r = build(rfLDplate('p.sketch("Top", ' + T + ')' + s + '.end().cut("through", { reverse: true });\n'));
      noErrors(r);
      var t0 = performance.now(), ci = K.meshCurveInfo(r.mesh), ms = performance.now() - t0, keys = {};
      ci.faceSurfs.forEach(function (ks) { (ks || []).forEach(function (k) { keys[k] = 1; }); });
      assert(ci.faces === r.mesh.faces.length, 'faces');
      assert(Object.keys(keys).length === 600, Object.keys(keys).length + ' surface keys');
      assert(ci.curves.length === 1200 && ci.curves.every(function (c) { return c.kind === 'circle' && Math.abs(c.radius - R) < 1e-9; }), ci.curves.length + ' curves');
      assert(ms < 3000, ms.toFixed(0) + ' ms');
    });

    test('rfLD: LPattern 30 x 20 of a Ø.25 through cut in a 24 x 48 16 ga panel: plate path, volume (24·48 − 600 π r²) T to 1e-9, 32 facets per wall, quick', function () {
      var t0 = performance.now(), r = rfLDbuild(rfLDpattern(30, 20, 22 / 30, 46 / 20)), ms = performance.now() - t0;
      noErrors(r);
      assert(r.plate && r.plate.holes === 599, 'plate path: ' + JSON.stringify(r.plate));
      assert(r.build.bodies.length === 1, r.build.bodies.length + ' bodies');
      nearRel(r.mp.volume, (24 * 48 - 600 * Math.PI * R * R) * T, 1e-9, 'volume');
      var f = rfLDwallFacets(r);
      assert(f === 32 * 600, f + ' wall facets');
      assert(ms < 20000, ms.toFixed(0) + ' ms (was 67 s)');
    });

    test('rfLD: LPattern 8 x 10 on the plate path = the boolean build (volume 1e-9, bodies, faces with records)', function () {
      var r = rfLDbuild(rfLDpattern(8, 10, 2.75, 4.6), true);
      assert(r.plate && r.plate.holes === 79, 'plate path: ' + JSON.stringify(r.plate));
      rfLDsame(r, 'LPattern');
      nearRel(r.mp.volume, (24 * 48 - 80 * Math.PI * R * R) * T, 1e-9, 'volume');
      assert(rfLDwallFacets(r) === rfLDwallFacets(r.off), rfLDwallFacets(r) + ' vs ' + rfLDwallFacets(r.off) + ' wall facets');
      var cs = K.curveSurfaces(r.mesh).length, co = K.curveSurfaces(r.off.mesh).length;
      assert(cs === 80 && co === 80, cs + ' / ' + co + ' curved surfaces');
    });

    test('rfLD: pattern of a pattern (a row of 10, patterned 8 times) and a Mirror of it take the plate path; volumes exact', function () {
      var code = rfLDplate(rfLDhole(1.5, 2) + 'p.linearPattern({ dir: "z", spacing: 2.2, count: 10, reverse: true });\np.linearPattern({ dir: "x", spacing: 1.2, count: 8 });\n');
      var r = rfLDbuild(code);
      noErrors(r);
      assert(r.plate && r.plate.holes === 70, 'pattern of a pattern: ' + JSON.stringify(r.plate));
      nearRel(r.mp.volume, (24 * 48 - 80 * Math.PI * R * R) * T, 1e-9, 'volume');
      var m = rfLDbuild(code + 'p.mirror("Right", { offset: 12 });\n', true);
      assert(m.plate && m.plate.holes === 80, 'mirror: ' + JSON.stringify(m.plate));
      rfLDsame(m, 'Mirror');
      nearRel(m.mp.volume, (24 * 48 - 160 * Math.PI * R * R) * T, 1e-9, 'mirrored volume');
    });

    test('rfLD: CirPattern of 72 holes on a ring takes the plate path = the boolean build', function () {
      var r = rfLDbuild(rfLDplate(rfLDhole(20, 24) + 'p.circularPattern({ axis: "y", center: [12, 0, -24], count: 72 });\n'), true);
      assert(r.plate && r.plate.holes === 71, 'plate path: ' + JSON.stringify(r.plate));
      rfLDsame(r, 'CirPattern');
      nearRel(r.mp.volume, (24 * 48 - 72 * Math.PI * R * R) * T, 1e-9, 'volume');
    });

    test('rfLD: fallbacks to the boolean: instances overlapping, leaving the plate, a blind cut — each = the boolean build', function () {
      // overlapping: Ø.5 holes at .4 pitch
      var a = rfLDbuild(rfLDplate(rfLDhole(1, 2, 0.25) + 'p.linearPattern({ dir: "x", spacing: 0.4, count: 10, dir2: "z", spacing2: 2, count2: 8, reverse2: true });\n'), true);
      assert(!a.plate, 'overlapping: plate path ran ' + JSON.stringify(a.plate));
      rfLDsame(a, 'overlapping');
      // leaving the plate: the last column hangs over the edge at x = 24
      var b = rfLDbuild(rfLDpattern(9, 10, 2.875, 4.6), true);
      assert(!b.plate, 'leaving: plate path ran ' + JSON.stringify(b.plate));
      rfLDsame(b, 'leaving the plate');
      // blind: holes .03 deep in the .0598 plate
      var c = rfLDbuild(rfLDplate('p.sketch("Top", ' + T + ').circle(2, 2, ' + R + ').end().cut(0.03, { reverse: true });\np.linearPattern({ dir: "x", spacing: 2.4, count: 8, dir2: "z", spacing2: 4.4, count2: 10, reverse2: true });\n'), true);
      assert(!c.plate, 'blind: plate path ran ' + JSON.stringify(c.plate));
      rfLDsame(c, 'blind');
      nearRel(c.mp.volume, 24 * 48 * T - 80 * Math.PI * R * R * 0.03, 1e-9, 'blind volume');
    });
  })();
