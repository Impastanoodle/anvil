  // --- rfQF (2026-11-18, lane smrelief): sheet-metal reliefs. A rectangular / obround / tear bend relief at a tray's corner
  // is folded with the neighbouring bend (it was a straight prism in the sheet's plane, so that bend's metal above the
  // plane stayed in the relief: 6.8e-5 in3 more in the flat than folded on an 8 x 6 tray at 16 ga) ---
  function rfQFtray(units, T, W, H, L, reliefs, extra) {
    var s = 'p.units("' + units + '"); p.sheet(' + T + ', ' + T + ', 0.5); p.sketch("Top").rect(0, -' + H + ', ' + W + ', ' + H + ').end().baseFlange();\n';
    [[W / 2, T, 0], [W / 2, T, H], [0, T, H / 2], [W, T, H / 2]].forEach(function (e, i) {
      if (reliefs[i]) s += 'p.flange(' + L + ', [[' + e.join(', ') + ']], { position: "inside", lengthRef: "outer", relief: "' + reliefs[i] + '" });\n';
    });
    return s + (extra || '');
  }
  // the flat's area (loop 0 less the others, as polygons: the reliefs' outlines are polygons in the solid too)
  function rfQFarea(flat) { return flat.loops.reduce(function (s, l, i) { return s + Math.abs(K.signedArea(l)) * (i ? -1 : 1); }, 0); }
  function rfQFcheck(code, tol, what) {
    var r = build(code); noErrors(r);
    var q = K.meshQuality(r.mesh);
    assert(q.closed, what + ': the body is not closed (' + q.openEdges + ' open, ' + q.nonManifoldEdges + ' non-manifold edges)');
    var flat = K.flatPattern(r.model, r.build, r.mesh), T = K.sheetParams(r.model).thickness, aT = rfQFarea(flat) * T;
    near(r.mp.volume, aT, tol, what + ': folded volume vs flat area x T');
    return { r: r, flat: flat, aT: aT };
  }
  (function () {
    group('rfQF: sheet-metal reliefs: a bend relief folded with the neighbouring bend');
    var IN = function (rl, extra) { return rfQFtray('in', 0.06, 8, 6, 1, rl, extra); };
    var MM = function (rl, extra) { return rfQFtray('mm', 1.5, 93.5775, 113.9542, 36.2558, rl, extra); };
    test('rfQF: inch tray (8 x 6, .06, R .06, K .5), Material Inside, rect / obround / tear bend reliefs at all four corners: folded volume = flat area x T to 1e-7 (rect was 6.8e-5 short of the flat), the body closed, the flat as before', function () {
      var a = rfQFcheck(IN(['rect', 'rect', 'rect', 'rect']), 1e-9, 'rect');
      near(a.aT, 4.364456900532336, 1e-12, 'rect: flat area x T unchanged');
      near(a.flat.size[0], 9.802743, 1e-6, 'flat x'); near(a.flat.size[1], 7.802743, 1e-6, 'flat y');
      var o = rfQFcheck(IN(['obround', 'obround', 'obround', 'obround']), 1e-7, 'obround');
      near(o.aT, 4.364553471049884, 1e-12, 'obround: flat area x T unchanged');
      var t = rfQFcheck(IN(['tear', 'tear', 'tear', 'tear']), 1e-9, 'tear');
      near(t.aT, 4.368110660532335, 1e-12, 'tear: flat area x T unchanged');
      var m = rfQFcheck(IN(['rect', 'tear', 'obround', 'rect']), 1e-7, 'mixed (rfQB\'s inch tray)');
      return 'rect ' + a.r.mp.volume.toFixed(9) + ', obround ' + o.r.mp.volume.toFixed(9) + ', tear ' + t.r.mp.volume.toFixed(9) + ', mixed ' + m.r.mp.volume.toFixed(9);
    });
    test('rfQF: mm tray (rfQB\'s, 1.5 / R 1.5): rect and obround bend reliefs folded, volume = flat area x T to 1e-9 relative (rect was 4.9 mm3 over); with rfQB\'s Tear corner relief on two corners too', function () {
      var a = rfQFcheck(MM(['rect', 'rect', 'rect', 'rect']), 1e-9 * 36364, 'rect');
      near(a.aT, 36363.89761745594, 1e-8, 'rect: flat area x T unchanged');
      var o = rfQFcheck(MM(['obround', 'obround', 'obround', 'obround']), 1e-9 * 36364, 'obround');
      var c = rfQFcheck(MM(['rect', 'rect', 'rect', 'rect'], 'p.cornerRelief([[90.5775, 1.5, 110.9542], [3, 1.5, 3]], null, { reliefType: "tear" });\n'), 1e-9 * 36364, 'with Tear corner reliefs');
      return 'rect ' + a.r.mp.volume.toFixed(6) + ', obround ' + o.r.mp.volume.toFixed(6) + ', with corner reliefs ' + c.r.mp.volume.toFixed(6);
    });
    test('rfQF: rfQB\'s inch tray with a Circular corner relief on two corners: with the circle as its polygon (K.crExact.on = false) folded = flat x T to 1e-7, the body closed (it was open before the reliefs were folded)', function () {
      K.crExact.on = false;
      try { var c = rfQFcheck(IN(['rect', 'tear', 'obround', 'rect'], 'p.cornerRelief([[7.88, 0.06, 5.88], [0.12, 0.06, 0.12]], null, { reliefType: "circular" });\n'), 1e-7, 'circular corner reliefs'); }
      finally { K.crExact.on = true; }
      var r = build(IN(['rect', 'tear', 'obround', 'rect'], 'p.cornerRelief([[7.88, 0.06, 5.88], [0.12, 0.06, 0.12]], null, { reliefType: "circular" });\n'));
      noErrors(r);
      assert(K.meshQuality(r.mesh).closed, 'with the exact circle: closed');
      return 'volume ' + c.r.mp.volume.toFixed(9);
    });
    test('rfQF: no neighbouring bend, nothing changes: no relief, one flange, two opposite flanges, a partial flange (offsets 1 / 1) keep their volumes to 1e-12', function () {
      [[IN(['none', 'none', 'none', 'none']), 4.368344900532350],
        [IN(['rect', null, null, null]), 3.312658401317538],
        [IN(['rect', 'rect', null, null]), 3.745316802635079]].forEach(function (c, i) {
        var r = build(c[0]); noErrors(r);
        near(r.mp.volume, c[1], 1e-12, 'case ' + i);
      });
      var p = build('p.units("in"); p.sheet(0.06, 0.06, 0.5); p.sketch("Top").rect(0, -6, 8, 6).end().baseFlange();\np.flange(1, [[4, 0.06, 0]], { position: "inside", lengthRef: "outer", relief: "rect", startOffset: 1, endOffset: 1 });\n');
      noErrors(p);
      var fp = K.flatPattern(p.model, p.build, p.mesh);
      near(p.mp.volume, rfQFarea(fp) * 0.06, 1e-12, 'partial flange: folded = flat x T');
      return 'ok';
    });
  })();

  // --- rfQF (3) Corner-Trim in the flat (test-reports/2026-11-18-shop-flow-7.md H2): SolidWorks' Break-Corner/Corner-Trim
  // on the flattened part, a feature under Flat-Pattern1 that the folded part does not show ---
  // the flat's exact area: each loop's true curves (K.dxfLoopCurves, what the DXF writes), as rfNA
  function rfQFexact(flat) {
    var A = 0;
    flat.loops.forEach(function (loop, i) {
      var lc = K.dxfLoopCurves(loop), a = 0;
      if (!lc) return;
      if (lc.circle) a = Math.PI * lc.circle.r * lc.circle.r;
      else {
        var s = 0;
        lc.segs.forEach(function (g) { s += (g.a[0] * g.b[1] - g.b[0] * g.a[1]) / 2; if (g.t === 'arc') s += g.r * g.r / 2 * (g.sweep - Math.sin(g.sweep)); });
        a = Math.abs(s);
      }
      A += i ? -a : a;
    });
    return A;
  }
  // the area of a circle (C, r) inside a polygon, exactly: per edge the signed area of triangle (C, p, q) ∩ the circle
  function rfQFcircleIn(C, r, loop) {
    var s = 0;
    loop.forEach(function (p0, k) {
      var q0 = loop[(k + 1) % loop.length], a = [p0[0] - C[0], p0[1] - C[1]], b = [q0[0] - C[0], q0[1] - C[1]], d = [b[0] - a[0], b[1] - a[1]];
      var AA = d[0] * d[0] + d[1] * d[1], BB = 2 * (a[0] * d[0] + a[1] * d[1]), CC = a[0] * a[0] + a[1] * a[1] - r * r, D = BB * BB - 4 * AA * CC, ts = [0];
      if (AA > 0 && D > 0) [(-BB - Math.sqrt(D)) / (2 * AA), (-BB + Math.sqrt(D)) / (2 * AA)].forEach(function (t) { if (t > 0 && t < 1) ts.push(t); });
      ts.push(1);
      for (var i = 0; i + 1 < ts.length; i++) {
        var p = [a[0] + d[0] * ts[i], a[1] + d[1] * ts[i]], q = [a[0] + d[0] * ts[i + 1], a[1] + d[1] * ts[i + 1]], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        var cr = p[0] * q[1] - p[1] * q[0];
        s += Math.hypot(m[0], m[1]) <= r ? cr / 2 : r * r / 2 * Math.atan2(cr, p[0] * q[0] + p[1] * q[1]);
      }
    });
    return Math.abs(s);
  }
  function rfQFin(p, loop) {
    var c = false;
    for (var i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      var a = loop[i], b = loop[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function rfQFdxfCount(text, type) {
    var L = text.replace(/\r\n/g, '\n').split('\n'), n = 0;
    for (var i = 0; i + 1 < L.length; i += 2) if (L[i].trim() === '0' && L[i + 1].trim() === type) n++;
    return n;
  }
  (function () {
    group('rfQF: Corner-Trim in the flat (reliefs where bend lines meet, break corners on the blank)');
    var TRAY = 'p.units("in"); p.sheet(0.06, 0.06, 0.5); p.sketch("Top").rect(0, -6, 8, 6).end().baseFlange();\n' +
      [[4, 0.06, 0], [4, 0.06, 6], [0, 0.06, 3], [8, 0.06, 3]].map(function (e) { return 'p.flange(1, [[' + e.join(', ') + ']], { position: "inside", lengthRef: "outer" });\n'; }).join('');
    var plain = null;
    function base() { if (!plain) { plain = build(TRAY); noErrors(plain); plain.flat = K.flatPattern(plain.model, plain.build, plain.mesh); } return plain; }
    test('rfQF: Corner-Trim, Circular R .125 on a 4-flange tray: the four corners where bend lines meet, each removes the circle\'s area inside the blank (exact, to 1e-9); the folded part unchanged (1e-12); the DXF draws the cuts as arcs; the script round-trips', function () {
      var b = base(), cs = K.cornerTrimCorners(b.flat);
      assert(cs.length === 4, 'corners where bend lines meet: ' + cs.length);
      var want = 0;
      cs.forEach(function (c) { b.flat.loops.forEach(function (l, i) { want += (i ? -1 : 1) * rfQFcircleIn(c.at, 0.125, l); }); });
      var r = build(TRAY + 'p.cornerTrim({ relief: "circular", size: 0.125 });\n'); noErrors(r);
      near(r.mp.volume, b.mp.volume, 1e-12, 'the folded part is not trimmed');
      var f = K.flatPattern(r.model, r.build, r.mesh);
      near(rfQFexact(b.flat) - rfQFexact(f), want, 1e-9, 'area removed = 4 x (circle inside the blank)');
      assert(f.trims && f.trims.length === 1 && f.trims[0].reliefs.length === 4, 'flat.trims: ' + JSON.stringify(f.trims));
      near(f.size[0], b.flat.size[0], 1e-12, 'blank x'); near(f.size[1], b.flat.size[1], 1e-12, 'blank y');
      var ents = K.exportDXFFlat(f, 'in', { style: 'entities' }), arcs = rfQFdxfCount(ents, 'ARC'), arcs0 = rfQFdxfCount(K.exportDXFFlat(b.flat, 'in', { style: 'entities' }), 'ARC');
      assert(arcs - arcs0 === 4, 'DXF ARC entities: ' + arcs + ' (without the trim ' + arcs0 + ')');
      var scr = K.generateScript(r.model);
      assert(/p\.cornerTrim\(\{ relief: "circular", size: 0\.125, name: "Corner-Trim1" \}\)/.test(scr), 'script: ' + (scr.match(/p\.cornerTrim\([^\n]*/) || [''])[0]);
      var again = build(scr); noErrors(again);
      near(rfQFexact(K.flatPattern(again.model, again.build, again.mesh)), rfQFexact(f), 1e-12, 'rebuilt from the generated script');
      return 'removed ' + want.toFixed(9) + ', ' + arcs + ' ARCs';
    });
    test('rfQF: Corner-Trim Break Corner on the blank\'s outer corners: chamfer .1 takes 8 x .1 x .1 / 2 (the 8 square tips of the walls), fillet R .1 takes 8 x (1 - pi/4) x .01 (exact arcs); with the circular relief too both add; the folded part unchanged', function () {
      var b = base(), a0 = rfQFexact(b.flat);
      var c = build(TRAY + 'p.cornerTrim({ breakCorner: "chamfer", breakSize: 0.1 });\n'); noErrors(c);
      var fc = K.flatPattern(c.model, c.build, c.mesh);
      assert(fc.trims[0].breaks === 8, 'chamfered corners: ' + fc.trims[0].breaks);
      near(a0 - rfQFexact(fc), 8 * 0.005, 1e-9, 'chamfers');
      var g = build(TRAY + 'p.cornerTrim({ breakCorner: "fillet", breakSize: 0.1 });\n'); noErrors(g);
      var fg = K.flatPattern(g.model, g.build, g.mesh);
      near(a0 - rfQFexact(fg), 8 * (1 - Math.PI / 4) * 0.01, 1e-9, 'fillets');
      near(g.mp.volume, b.mp.volume, 1e-12, 'folded volume');
      var both = build(TRAY + 'p.cornerTrim({ relief: "circular", size: 0.125, breakCorner: "chamfer", breakSize: 0.1 });\n'); noErrors(both);
      var fb = K.flatPattern(both.model, both.build, both.mesh), one = build(TRAY + 'p.cornerTrim({ relief: "circular", size: 0.125 });\n');
      near(a0 - rfQFexact(fb), (a0 - rfQFexact(K.flatPattern(one.model, one.build, one.mesh))) + 0.04, 1e-9, 'relief + chamfers');
      return 'chamfer ' + (a0 - rfQFexact(fc)).toFixed(9) + ', fillet ' + (a0 - rfQFexact(fg)).toFixed(9);
    });
    test('rfQF: Corner-Trim Square (side .2) and Bend Waist reliefs cut the four corners and keep every bend line on metal; picked corners only take those; a relief of size 0 and a trim with nothing to do are refused with the reason', function () {
      var b = base(), a0 = rfQFexact(b.flat), out = [];
      ['p.cornerTrim({ relief: "square", size: 0.2 });', 'p.cornerTrim({ relief: "bendWaist" });'].forEach(function (s) {
        var r = build(TRAY + s + '\n'); noErrors(r);
        var f = K.flatPattern(r.model, r.build, r.mesh);
        assert(f.trims[0].reliefs.length === 4, s + ': ' + f.trims[0].reliefs.length + ' corners');
        assert(a0 - rfQFexact(f) > 1e-3, s + ': removed ' + (a0 - rfQFexact(f)));
        f.bends.forEach(function (bd, k) { [0.02, 0.98].forEach(function (t) { var P = [bd.a[0] + (bd.b[0] - bd.a[0]) * t, bd.a[1] + (bd.b[1] - bd.a[1]) * t]; assert(rfQFin(P, f.loops[0]), s + ': bend ' + k + ' off the metal at ' + t); }); });
        out.push(s.replace(/p\.cornerTrim\(\{ relief: "(\w+)".*/, '$1') + ' ' + (a0 - rfQFexact(f)).toFixed(6));
      });
      var at = K.cornerTrimCorners(b.flat)[0].at;
      var one = build(TRAY + 'p.cornerTrim({ relief: "circular", size: 0.125, corners: [[' + at[0] + ', ' + at[1] + ']] });\n'); noErrors(one);
      assert(K.flatPattern(one.model, one.build, one.mesh).trims[0].reliefs.length === 1, 'one picked corner');
      var bad = build(TRAY + 'p.cornerTrim({ relief: "square", size: 0.2 });\n');
      bad.model.features[bad.model.features.length - 1].size = 0;
      var rb = K.rebuild(bad.model), id = bad.model.features[bad.model.features.length - 1].id;
      assert(/relief size must be greater than zero/.test(rb.errors[id] || ''), 'size 0: ' + JSON.stringify(rb.errors));
      var threw = null; try { build(TRAY + 'p.cornerTrim({});\n'); } catch (e) { threw = e.message; }
      assert(/choose a relief or a break corner/.test(threw || ''), 'nothing to do: ' + threw);
      return out.join(', ');
    });
  })();
