  // ------------------------------------------------------------------ rfDZ: Wrap (Insert ▸ Features ▸ Wrap, Analytical)
  // A Ø2 × 3 in cylinder (axis Y) with a 1 × .5 rectangle sketched on the plane tangent to it (Front, offset 1): deboss
  // / emboss .05 remove / add exactly (s / R)·(R² − (R ∓ d)²) / 2 · L; scribe keeps the volume and adds the 4 edges of
  // the wrapped rectangle (the face inside is a face of its own, owned by Wrap1); Sketch Text "A1" debosses; a bore
  // (concave), a flat face (with a hole in the contour) and a cone; generateScript round trip; errors.
  (function () {
    group('rfDZ: Wrap (emboss / deboss / scribe)');
    var CYL = 'p.units("in"); p.sketch("Top").circle(0, 0, 1).end().extrude(3); ';
    var RECT = 'p.sketch("Front", 1).rect(-0.5, 1, 1, 0.5)';
    var R = 1, d = 0.05, s = 1, L = 0.5, V0 = Math.PI * 3;
    function rfDZWrap(mode, extra) { return CYL + RECT + '.end().wrap({ face: [0, 1.25, 1], mode: "' + mode + '"' + (mode === 'scribe' ? '' : ', thickness: ' + d) + (extra || '') + ' });'; }
    function rfDZSharp(r) { return K.bodyEdges(r.mesh).filter(function (e) { return !e.smooth; }); }

    test('deboss .05: removed volume = (s/R)·(R² − (R−d)²)/2·L exactly', function () {
      var r = build(rfDZWrap('deboss'));
      noErrors(r);
      nearRel(V0 - r.mp.volume, (s / R) * (R * R - (R - d) * (R - d)) / 2 * L, 1e-6, 'removed');
      var f = r.model.features[r.model.features.length - 1];
      assert(f.type === 'wrap' && f.name === 'Wrap1' && K.isCut(f, r.model), 'feature: ' + JSON.stringify(f));
    });
    test('emboss .05: added volume = (s/R)·((R+d)² − R²)/2·L exactly', function () {
      var r = build(rfDZWrap('emboss'));
      noErrors(r);
      nearRel(r.mp.volume - V0, (s / R) * ((R + d) * (R + d) - R * R) / 2 * L, 1e-6, 'added');
      assert(!K.isCut(r.model.features[3], r.model), 'emboss is no cut');
    });
    test('scribe: volume unchanged, 4 new edges (2 lines along the axis, 2 arcs round it), the face inside belongs to Wrap1', function () {
      var r0 = build(CYL), r = build(rfDZWrap('scribe'));
      noErrors(r);
      nearRel(r.mp.volume, V0, 1e-9, 'volume');
      var e0 = rfDZSharp(r0).length, es = rfDZSharp(r).filter(function (e) {
        // the new edges: on the cylinder (not on the caps at y = 0, 3)
        return Math.abs(e.a[1]) > 1e-6 && Math.abs(e.a[1] - 3) > 1e-6 && Math.abs(e.b[1]) > 1e-6 && Math.abs(e.b[1] - 3) > 1e-6;
      });
      assert(rfDZSharp(r).length === e0 + es.length && es.length >= 4, 'new edges ' + es.length + ' (' + e0 + ' before)');
      // group the pieces into model edges: along the axis at θ = ±s/2R, round it at y = 1 and y = 1.5
      var keys = {};
      es.forEach(function (e) {
        var k;
        if (Math.abs(e.a[1] - e.b[1]) < 1e-9) { k = 'arc y=' + e.a[1].toFixed(6); assert(Math.abs(e.a[1] - 1) < 1e-9 || Math.abs(e.a[1] - 1.5) < 1e-9, 'arc at ' + e.a[1]); }
        else { var th = Math.atan2(e.a[0], e.a[2]); k = 'line θ=' + th.toFixed(6); near(Math.abs(th), s / R / 2, 1e-9, 'line angle'); near(Math.atan2(e.b[0], e.b[2]), th, 1e-9, 'straight along the axis'); }
        keys[k] = 1;
      });
      assert(Object.keys(keys).length === 4, 'edges: ' + Object.keys(keys).join(', '));
      // the face inside is its own face (owned by the Wrap feature) on the same surface
      var wid = r.model.features[3].id, inside = r.mesh.faces.filter(function (f) { return f.polys[0].shared === wid; });
      assert(inside.length > 0 && inside.every(function (f) { return f.polys[0].surf && f.polys[0].surf.s.w === wid && Math.abs(f.polys[0].surf.s.r - R) < 1e-12; }), 'scribed faces: ' + inside.length);
      var area = 0; inside.forEach(function (f) { area += f.area; });
      nearRel(area, s * L, 2e-3, 'scribed (faceted) area');
    });
    test('scribe edges reach the drawing view as visible edges (default tangent setting): the wrapped rectangle in the Front view', function () {
      if (typeof Drawing === 'undefined') return 'skipped (no Drawing)';
      var pr = Drawing.projectView(build(rfDZWrap('scribe')).mesh, 'Front', { display: 'hlr' });
      // head 2026-10-29a: drawing.js draws a Wrap scribe edge (Kernel.wrapSplit) as a real edge, not a tangent one
      var t = (pr.lines.visible || []).filter(function (l) { return l[1] > 1 - 1e-6 && l[3] > 1 - 1e-6 && l[1] < 1.5 + 1e-6 && l[3] < 1.5 + 1e-6 && Math.abs(l[0]) < Math.sin(0.5) + 1e-6 && Math.abs(l[2]) < Math.sin(0.5) + 1e-6; });
      assert(t.length === 4, 'scribe lines: ' + JSON.stringify(t));
      var ys = t.map(function (l) { return [l[1], l[3]]; }), xs = t.map(function (l) { return [l[0], l[2]]; });
      assert(ys.every(function (y) { return y.every(function (v) { return v > 1 - 1e-6 && v < 1.5 + 1e-6; }); }), 'between y 1 and 1.5: ' + JSON.stringify(ys));
      assert(xs.every(function (x) { return x.every(function (v) { return Math.abs(v) < Math.sin(0.5) + 1e-6; }); }), 'within ±sin(s/2R): ' + JSON.stringify(xs));
    });
    test('Sketch Text "A1" (outline) debossed .05 builds and removes material', function () {
      var r = build(CYL + 'p.sketch("Front", 1).text(-0.4, 1.1, "A1", { h: 0.4, mode: "outline" }).end().wrap({ face: [0, 1.25, 1], mode: "deboss", thickness: 0.05 });');
      noErrors(r);
      var cut = V0 - r.mp.volume;
      assert(cut > 0.001 && cut < 0.4 * 0.8 * 0.05, 'removed ' + cut);
      consistentVolume(r);
    });
    test('a bore (concave face): deboss goes into the material, exact', function () {
      var r0 = build('p.units("in"); p.sketch("Top").rect(-2, -2, 4, 4).circle(0, 0, 1).end().extrude(3);');
      var r = build('p.units("in"); p.sketch("Top").rect(-2, -2, 4, 4).circle(0, 0, 1).end().extrude(3); p.sketch("Front", 0).rect(-0.5, 1, 1, 0.5).end().wrap({ face: [0, 1.25, 1], mode: "deboss", thickness: 0.05 });');
      noErrors(r);
      nearRel(r0.mp.volume - r.mp.volume, (s / R) * ((R + d) * (R + d) - R * R) / 2 * L, 1e-6, 'removed');
    });
    test('a flat face: deboss a rectangle with a round hole in it (exact), emboss a circle (exact)', function () {
      var r = build(CYL + 'p.sketch("Top", 3).rect(-0.5, -0.25, 1, 0.5).circle(0, 0, 0.1).end().wrap({ face: [0, 3, 0], mode: "deboss", thickness: 0.05 });');
      noErrors(r);
      nearRel(V0 - r.mp.volume, (0.5 - Math.PI * 0.01) * 0.05, 1e-6, 'removed');
      r = build(CYL + 'p.sketch("Top", 3).circle(0, 0, 0.3).end().wrap({ face: [0, 3, 0], mode: "emboss", thickness: 0.05 });');
      noErrors(r);
      nearRel(r.mp.volume - V0, Math.PI * 0.09 * 0.05, 1e-6, 'added');
    });
    test('a cone (drafted extrude): deboss on a tangent plane builds, about area × depth', function () {
      var t = Math.tan(10 * Math.PI / 180), q = Math.hypot(1, t);
      var r0 = build('p.units("in"); p.sketch("Top").circle(0, 0, 1).end().extrude(3, { draft: 10 });');
      var m = r0.model;
      m.features.push({ id: m.nextId++, type: 'sketch', name: 'Sketch2', plane: { custom: true, origin: [0, 0, 1], x: [1, 0, 0], y: [0, 1 / q, -t / q], n: [0, t / q, 1 / q] }, entities: [{ t: 'rect', x: -0.3, y: 0.5, w: 0.6, h: 0.8 }] });
      m.features.push({ id: m.nextId++, type: 'wrap', name: 'Wrap1', sketch: m.nextId - 2, face: [0, 1, 1 - t], mode: 'deboss', thickness: 0.05 });
      var b = K.rebuild(m), v = K.massProps(K.meshFromBody(b.body)).volume;
      assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
      nearRel(r0.mp.volume - v, 0.6 * 0.8 * 0.05, 0.05, 'removed');
    });
    test('generateScript round trip (p.wrap) gives the same part', function () {
      ['deboss', 'scribe'].forEach(function (mode) {
        var r = build(rfDZWrap(mode, ', reverse: false')), code = K.generateScript(r.model);
        assert(/p\.wrap\(\{ sketch: f\d+, face: \[0,1\.25,1\], mode: "/.test(code), 'script: ' + code.split('\n').slice(-2).join(' / '));
        var r2 = build(code);
        noErrors(r2);
        nearRel(r2.mp.volume, r.mp.volume, 1e-12, mode + ' volume');
        var canon = function (f) { var o = {}; Object.keys(f).sort().forEach(function (k) { o[k] = f[k]; }); return JSON.stringify(o); };
        assert(canon(r2.model.features[3]) === canon(r.model.features[3]), mode + ' feature: ' + canon(r2.model.features[3]));
      });
    });
    test('errors: no face, a sketch plane across the cylinder\'s axis, zero thickness; Reverse direction turns a deboss outward (only the overlap skin goes)', function () {
      var m = K.newModel('t');
      K.runScript(m, CYL + RECT + '.end();');
      m.features.push({ id: m.nextId++, type: 'wrap', sketch: 3, mode: 'deboss', thickness: 0.05 });
      assert(/pick the face/.test(K.rebuild(m).errors[4] || ''), 'no face');
      var r = build(CYL + 'p.sketch("Top", 3).rect(-0.5, -0.25, 1, 0.5).end().wrap({ face: [0, 1.25, 1], mode: "deboss", thickness: 0.05 });');
      assert(/parallel to the cylinder/.test(r.errors[4] || ''), 'across the axis: ' + r.errors[4]);
      r = build(rfDZWrap('deboss').replace('thickness: 0.05', 'thickness: 0'));
      assert(/Thickness must be greater/.test(r.errors[4] || ''), 'zero thickness: ' + r.errors[4]);
      r = build(rfDZWrap('deboss', ', reverse: true'));
      noErrors(r);
      // the thickness goes outward (air); only the boolean overlap skin (ε, past the facets) stays on the face's side
      assert(V0 - r.mp.volume >= 0 && V0 - r.mp.volume < 0.1 * (s / R) * (R * R - (R - d) * (R - d)) / 2 * L, 'reversed removes ' + (V0 - r.mp.volume));
    });
  })();
