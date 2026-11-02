  // ------------------------------------------------------------------ Hole Wizard (holewizard.js)
  (function () {
    group('Hole Wizard (holewizard.js): ISO counterbore / countersink / hole / straight tap');
    if (typeof HoleWizard === 'undefined') { test('holewizard.js loaded', function () { fail('HoleWizard is undefined'); }); return; }
    var HW = HoleWizard, BLOCK = 'p.box(60, 60, 30, { centered: true });', V0 = 60 * 60 * 30;
    function hw(opts) { return build(BLOCK + 'p.holeWizard(' + JSON.stringify(Object.assign({ face: 'Top', offset: 30, points: [[0, 0]] }, opts)) + ');'); }
    function lastHole(r) { return r.model.features.filter(function (f) { return f.type === 'hole'; }).pop(); }
    // analytic volume of one blind hole of depth D (flat bottom, depth from the face)
    function holeVol(s, D) {
      var R = s.dia / 2;
      if (s.cbore) { var Rc = s.cbore.dia / 2, dc = s.cbore.depth; return Math.PI * Rc * Rc * dc + Math.PI * R * R * (D - dc); }
      if (s.csk) { var Rs = s.csk.dia / 2, h = Rs - R; return Math.PI * h / 3 * (Rs * Rs + Rs * R + R * R) + Math.PI * R * R * (D - h); }
      return Math.PI * R * R * D;
    }

    test('ISO table: M8 normal clearance Ø9, close 8.4, loose 10; tap drill 6.8 (≈ D − P); CBORE Ø15 ↧ 8.6; CSK Ø17.92 × 90°', function () {
      var n = HW.spec({ holeType: 'hole', size: 'M8', fit: 'normal' }), c = HW.spec({ holeType: 'cbore', size: 'M8', fit: 'close' }), l = HW.spec({ holeType: 'csk', size: 'M8', fit: 'loose' }), t = HW.spec({ holeType: 'tap', size: 'M8' });
      near(n.dia, 9, 0); near(c.dia, 8.4, 0); near(l.dia, 10, 0); near(t.dia, 6.8, 1e-12);
      near(c.cbore.dia, 15, 0); near(c.cbore.depth, 8.6, 0); near(l.csk.dia, 17.92, 0); near(l.csk.angle, 90, 0);
      assert(t.thread.label === 'M8x1.25', t.thread.label);
      HW.ISO.forEach(function (r) { near(r.tap, r.d - r.pitch, 0.051, r.size + ' tap drill (standard drill sizes: M8 6.8, M12 10.2)'); assert(r.clr[0] < r.clr[1] && r.clr[1] < r.clr[2] && r.cb[0] > r.clr[2] && r.csk > r.clr[2], r.size); });
      assert(HW.ISO[0].size === 'M2' && HW.ISO[HW.ISO.length - 1].size === 'M20', 'M2..M20');
      return HW.ISO.length + ' sizes';
    });

    test('Volume removed by each type (blind, M8, depth 20; tap depth 16) equals its formula to 1e-9', function () {
      var out = [];
      [['hole', 20], ['cbore', 20], ['csk', 20], ['tap', 16]].forEach(function (t) {
        var r = hw({ type: t[0], size: 'M8', depth: t[1] });
        noErrors(r);
        var s = HW.spec(lastHole(r)), ex = holeVol(s, t[1]);
        nearRel(V0 - r.mp.volume, ex, 1e-9, t[0]);
        out.push(t[0] + ' ' + ex.toFixed(4));
      });
      return out.join(', ');
    });

    test('Through All and several positions: three M6 counterbores through the 30 mm block', function () {
      var r = hw({ type: 'cbore', size: 'M6', end: 'through', points: [[-15, 0], [0, 10], [15, 0]] });
      noErrors(r);
      var s = HW.spec(lastHole(r));
      nearRel(V0 - r.mp.volume, 3 * holeVol(s, 30), 1e-9, 'volume');
      assert(lastHole(r).end === 'through', 'end');
      return (V0 - r.mp.volume).toFixed(4);
    });

    // lane FH2 (2026-10-29): the M6 counterbore depth is SolidWorks 2022's Hole Wizard value, 6.4 (was ISO 4762's 6.5);
    // source: head-tools/sw-reference/sw-holewizard.json (solids_holes.py)
    test('Counterbore depth and countersink angle read from the solid: CBORE ↧ 6.4 (M6, as SolidWorks), cone half-angle 45° (90° countersink)', function () {
      var r = hw({ type: 'cbore', size: 'M6', depth: 16 }), cb = [];
      r.body.polygons.forEach(function (p) { if (p.surf && p.surf.s.t === 'cyl' && Math.abs(p.surf.s.r - 5.5) < 1e-9) p.vertices.forEach(function (v) { cb.push(v.pos.y); }); });
      assert(cb.length, 'no Ø11 cylinder records');
      near(Math.max.apply(null, cb) - Math.min.apply(null, cb), 6.4, 1e-9, 'counterbore wall height');
      near(Math.min.apply(null, cb), 30 - 6.4, 1e-9, 'counterbore floor');
      var c = hw({ type: 'csk', size: 'M6', depth: 16 }), pts = [];
      c.body.polygons.forEach(function (p) { if (p.surf && p.surf.s.t === 'cone') p.vertices.forEach(function (v) { pts.push([Math.hypot(v.pos.x, v.pos.z), v.pos.y]); }); });
      assert(pts.length, 'no cone records');
      pts.forEach(function (q) { near(q[0] - (13.44 / 2 - (30 - q[1])), 0, 1e-9, 'r = Rcsk − (face − y) at ' + q); });
      var zs = pts.map(function (q) { return q[1]; }), rs = pts.map(function (q) { return q[0]; });
      var ang = 2 * Math.atan2(Math.max.apply(null, rs) - Math.min.apply(null, rs), Math.max.apply(null, zs) - Math.min.apply(null, zs)) * 180 / Math.PI;
      near(ang, 90, 1e-9, 'included angle');
      return 'cbore 6.4, csk ' + ang + '°';
    });

    test('Script round trip: generateScript writes p.holeWizard({ sketch, type, size, fit, depth, threadDepth }) and rebuilds the same part', function () {
      var r = hw({ type: 'tap', size: 'M5', depth: 14, threadDepth: 10, points: [[-10, -10], [10, 10]] });
      noErrors(r);
      var code = K.generateScript(r.model);
      assert(/p\.holeWizard\(\{ sketch: f3, type: "tap", size: "M5", fit: "normal", depth: 14, threadDepth: 10, name: "M5x0\.8 Tapped Hole1" \}\)/.test(code), code);
      var r2 = build(code);
      noErrors(r2);
      near(r2.mp.volume, r.mp.volume, 1e-9, 'volume');
      var a = lastHole(r), b = lastHole(r2);
      ['holeType', 'size', 'fit', 'end', 'depth', 'threadDepth', 'name'].forEach(function (k) { assert(a[k] === b[k], k + ': ' + a[k] + ' vs ' + b[k]); });
      assert(K.generateScript(r2.model) === code, 'second generation identical');
      return 'ok';
    });

    test('Errors: an unknown size and a positions sketch without points fail the feature, not the rebuild', function () {
      var m = K.newModel('T');
      K.runScript(m, BLOCK + 'var s = p.sketch("Top", 30).point(0, 0).id();');
      m.features.push({ id: m.nextId++, type: 'hole', holeType: 'hole', size: 'M7', fit: 'normal', end: 'blind', depth: 5, sketch: 3, name: 'H1' });
      var e1 = K.rebuild(m).errors[m.nextId - 1];
      assert(/Unknown ISO size M7/.test(e1), e1);
      m.features[m.features.length - 1].size = 'M6';
      m.features[2].entities = [];
      var e2 = K.rebuild(m).errors[m.nextId - 1];
      assert(/at least one point/.test(e2), e2);
      return e1 + ' / ' + e2;
    });

    test('Drawing: Straight Tap callout reads "Ø6.8 ↧ 16" + "M8x1.25 ↧ 12" and the Top view shows a dashed Ø8 cosmetic thread', function () {
      if (!DW) fail('drawing.js is not loaded');
      var r = annDrawingHW(BLOCK + 'p.holeWizard({ face: "Top", offset: 30, points: [[10, -5]], type: "tap", size: "M8", depth: 16, threadDepth: 12 });');
      var T = r.view('Top');
      DW.addHoleCallout(r.doc, T.view.id, { c: [10, -5], r: 3.4 });   // Top view: u = x, v = −z; the sketch point (10, −5) is z = 5
      r.recompute();
      var an = r.sheet.annotations.filter(function (a) { return a.type === 'holeCallout'; })[0];
      assert(an && an.text === 'Ø 6.8 ↧ 16 M8x1.25 ↧ 12', an && an.text);
      T = r.view('Top');
      var c = T.toSheet([10, -5]), th = r.sheet.prims.filter(function (p) { return p.k === 'circle' && p.thread; });
      assert(th.length === 1 && th[0].style === 'hidden' && th[0].thread === 'M8x1.25', JSON.stringify(th));
      near(th[0].r, 4 * T.scale, 1e-9, 'major radius'); near(th[0].c[0], c[0], 1e-9, 'x'); near(th[0].c[1], c[1], 1e-9, 'y');
      // a counterbore is not a thread: plain callout, no thread circle
      var q = annDrawingHW(BLOCK + 'p.holeWizard({ face: "Top", offset: 30, points: [[0, 0]], type: "cbore", size: "M6", depth: 16 });');
      DW.addHoleCallout(q.doc, q.view('Top').view.id, { c: [0, 0], r: 3.3 });
      q.recompute();
      var aq = q.sheet.annotations.filter(function (a) { return a.type === 'holeCallout'; })[0];
      assert(aq.text === 'Ø 6.6 ↧ 16 ⌴ Ø 11 ↧ 6.4', aq.text);
      assert(!q.sheet.prims.some(function (p) { return p.thread; }), 'no thread');
      return an.text + ' | ' + aq.text;
    });
    function annDrawingHW(code) {
      var r = build(code);
      noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-09-26' });
      DW.standard3View(doc, r.mesh, r.model.units);
      r.doc = doc;
      r.recompute = function () { r.sheet = DW.compute(r.doc, r.mesh, r.model, { build: r.build }); return r.sheet; };
      r.recompute();
      r.view = function (orient) { return r.sheet.views.filter(function (w) { return w.view.orient === orient; })[0]; };
      return r;
    }
  })();

