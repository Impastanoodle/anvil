  // --- rfOH (2026-11-17, lane cleanlines; user: "line & dimension cleanliness"): the lines, dimensions and marks of the
  // graphics area measured, not looked at: sketch dimensions by the drafting rules (extension-line gap and overshoot,
  // slim filled arrows that flip outside when cramped, text centred in a break of the line, nothing on another
  // dimension's text), every square-to-screen dimension line and its arrows on a device pixel's centre at 100 % and
  // 125 %, one stroke width per kind, one weight for a line, an arc, a circle and a spline, dashes of one screen length
  // at any zoom, curves drawn within half a pixel of the true curve at any zoom, and no far-side edge of a 14 gauge
  // bracket inside its near face. ---
  var rfOHSaved = null;
  function rfOHSet() {
    var V = UI.App.view;
    if (!rfOHSaved) rfOHSaved = { grid: V.showGrid, regions: V.sketchRegions, dims: V.showDims, i2d: V.instant2D, style: V.style, qs: UI.App.quickSnap, num: UI.sketchNumericInput() };
    V.showGrid = false; V.sketchRegions = false; V.showDims = false; V.instant2D = false;
    UI.App.quickSnap = null;
    UI.sketchNumericInput(false);
  }
  function rfOHRestore() {
    var s = rfOHSaved, V = UI.App.view;
    if (!s) return;
    rfOHSaved = null;
    try { delete W.devicePixelRatio; } catch (e) { /* not overridden */ }
    V.showGrid = s.grid; V.sketchRegions = s.regions; V.showDims = s.dims; V.instant2D = s.i2d;
    if (V.style !== s.style) UI.setStyle(s.style);
    UI.App.quickSnap = s.qs;
    UI.sketchNumericInput(s.num);
    UI.App.gridStale = true; UI.App.dimsStale = true;
  }
  function rfOHStep(name, fn) { step(name, async function () { try { return await fn(); } finally { try { UI.setTool('select'); } catch (e) { /* no sketch */ } rfOHRestore(); } }); }
  async function rfOHLand() { for (var i = 0; i < 50 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(20); if (UI.finishViewAnimation) UI.finishViewAnimation(); await idle(); }
  // a new part with a sketch on Front holding ents (and dims / rels), zoomed to fit
  async function rfOHSketch(ents, dims, rels) {
    await anvil.newPart(); await idle();
    rfOHSet();
    UI.App.model.units = 'in';
    await UI.newSketchOnPlane('Front'); await idle();
    var f = UI.activeSketchFeature();
    ents.forEach(function (e) { f.entities.push(JSON.parse(JSON.stringify(e))); });
    if (dims) f.dims = JSON.parse(JSON.stringify(dims));
    if (rels) f.rels = JSON.parse(JSON.stringify(rels));
    UI.updateSketches(); UI.App.dimsStale = true;
    UI.zoomToFit(); await rfOHLand();
    return f;
  }
  // the shop sketch: a 12 x 8 plate with corner arcs, a hole grid, two slots, a centerline, a construction line, an
  // arc and a spline, dimensioned with linear, aligned, radius (with a tolerance), 4X diameter, between two lines, to
  // a midpoint, angle (short: its arrows flip outside), a driven one and an ordinate set
  var RFOH_SHOP = ['p.units("in");',
    'p.sketch("Front", 0, "Sketch1")',
    '  .line(0.5, 0, 11.5, 0).line(12, 0.5, 12, 7.5).line(11.5, 8, 0.5, 8).line(0, 7.5, 0, 0.5)',
    '  .arc(11.5, 0.5, 0.5, -90, 0).arc(11.5, 7.5, 0.5, 0, 90).arc(0.5, 7.5, 0.5, 90, 180).arc(0.5, 0.5, 0.5, 180, 270)',
    '  .circle(2, 1.5, 0.1405).circle(4, 1.5, 0.1405).circle(6, 1.5, 0.1405).circle(2, 3, 0.1405).circle(4, 3, 0.1405).circle(6, 3, 0.1405)',
    '  .slot(8, 2, 10, 2, 0.5).slot(10.5, 4.5, 10.5, 6.5, 0.375)',
    '  .line(0, 4, 12, 4).line(1, 6.8, 3.5, 7.4).arc(6, 5.5, 1, 20, 160).spline([[2, 4.8], [3, 5.8], [4, 4.9], [5, 6.2]])',
    '  .construction([16, 17])',
    '  .dim(0, "len", { off: -0.6 }).dim(1, "len", { off: -0.6 }).dim(17, "len", { off: 0.4 })',
    '  .dim(5, "r", { ang: 45, off: 1.2 }).dim(8, "dia", { ang: 225, off: 0.8 }).dim(18, "r", { ang: 60, off: 1.6 })',
    '  .dim(14, "w").dim(14, "len")',
    '  .rel("distance", ["0", "2"], 8, { off: 0.9 })',
    '  .rel("distance", ["2.mid", "14.c"], 3)',
    '  .rel("angle", ["16", "17"], 13.5)',
    '  .driven([2]);'].join('\n');
  async function rfOHShop() {
    await anvil.newPart(); await idle();
    rfOHSet();
    await anvil.run(RFOH_SHOP); await idle();
    var f = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    f.dims[3].tol = { type: 'symmetric', plus: 0.005, minus: 0.005 };
    f.dims[4].prefix = '4X';
    UI.editSketch(f.id); await idle();
    rfOHSet();
    anvil.ordinate('x', '3', ['11.c', '12.c', '13.c'], -1.8);
    UI.App.sel = null;
    UI.zoomToFit(); await rfOHLand();
    return UI.activeSketchFeature();
  }
  // the dimension layer from the DOM: per dimension its label, the text's ink box, its line segments and arrowheads
  function rfOHLayer() {
    UI.drawDims(true);
    return Array.prototype.map.call(D.querySelectorAll('#dim-layer g.dim'), function (g) {
      var t = g.querySelector('text'), dl = g.querySelector('path.dl'), da = g.querySelector('path.da'), segs = [], arrows = [], last = null;
      var bb = t && t.textContent ? t.getBBox() : null;
      (dl ? dl.getAttribute('d') || '' : '').replace(/([ML])\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/g, function (m, c, x, y) { var q = [+x, +y]; if (c === 'L' && last) segs.push([last, q]); last = q; return m; });
      (da ? da.getAttribute('d') || '' : '').replace(/M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)L\s*(-?[\d.]+)[ ,]+(-?[\d.]+)L\s*(-?[\d.]+)[ ,]+(-?[\d.]+)Z/g, function (m, a, b, c, d, e, f) { arrows.push([[+a, +b], [+c, +d], [+e, +f]]); return m; });
      var yb = t ? +t.getAttribute('y') : 0;   // the ink: the font's own width, the capitals' height above the baseline, 1 px round
      return { g: g, t: t, label: t ? t.textContent : '', box: bb ? [bb.x - 1, yb - UI.DIM_CAP - 1, bb.x + bb.width + 1, yb + 1] : null, segs: segs, arrows: arrows, temp: /\btemp\b/.test(g.getAttribute('class')) };
    }).filter(function (x) { return !x.temp && x.label; });
  }
  function rfOHMeet(a, b) { return !!a && !!b && a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }
  function rfOHTriBox(tr) { var xs = tr.map(function (p) { return p[0]; }), ys = tr.map(function (p) { return p[1]; }); return [Math.min.apply(0, xs), Math.min.apply(0, ys), Math.max.apply(0, xs), Math.max.apply(0, ys)]; }
  // an arrowhead's length (tip to the middle of its base), base width and unit direction (base -> tip)
  function rfOHArrow(tr) {
    var b = [(tr[1][0] + tr[2][0]) / 2, (tr[1][1] + tr[2][1]) / 2], L = Math.hypot(tr[0][0] - b[0], tr[0][1] - b[1]);
    return { tip: tr[0], len: L, w: Math.hypot(tr[1][0] - tr[2][0], tr[1][1] - tr[2][1]), dir: [(tr[0][0] - b[0]) / L, (tr[0][1] - b[1]) / L] };
  }
  function rfOHHits(p, q, b) {
    var dx = q[0] - p[0], dy = q[1] - p[1], t0 = 0, t1 = 1, P4 = [-dx, dx, -dy, dy], Q4 = [p[0] - b[0], b[2] - p[0], p[1] - b[1], b[3] - p[1]];
    for (var k = 0; k < 4; k++) {
      if (Math.abs(P4[k]) < 1e-12) { if (Q4[k] < 0) return false; continue; }
      var r = Q4[k] / P4[k];
      if (P4[k] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return t1 - t0 > 1e-9;
  }
  function rfOHScr(uv) { return UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])); }
  // a picture of only some of the scene's groups (faces / edges / sketches), at the canvas' device size:
  // { w, h, pr, px (RGBA, bottom row first) }; the ground is transparent
  function rfOHRender(groups) {
    var T = W.THREE, R = UI.renderer, S = UI.scene, cam = UI.camera, pr = R.getPixelRatio();
    var w = Math.round(UI.size.w * pr), h = Math.round(UI.size.h * pr);
    if (UI.render) UI.render();
    var restore = [];
    S.children.forEach(function (c) { if (c !== cam && c.visible && groups.indexOf(c) < 0 && !c.isLight) { restore.push(c); c.visible = false; } });
    var rt = new T.WebGLRenderTarget(w, h, { stencilBuffer: true });
    try {
      R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(); R.render(S, cam);
      var px = new Uint8Array(w * h * 4); R.readRenderTargetPixels(rt, 0, 0, w, h, px);
      return { w: w, h: h, pr: pr, px: px };
    } finally {
      R.setRenderTarget(null); R.setClearColor(0x000000, 0);
      restore.forEach(function (c) { c.visible = true; });
      rt.dispose(); UI.requestRender();
    }
  }
  function rfOHAt(img, x, y) { var i = ((img.h - 1 - y) * img.w + x) * 4; return [img.px[i], img.px[i + 1], img.px[i + 2], img.px[i + 3]]; }
  // device pixels of ink (alpha over 100) in the column through screen x, from screen y0 to y1
  function rfOHColumn(img, sx, sy0, sy1) {
    var x = Math.floor(sx * img.pr), n = 0;
    for (var y = Math.floor(sy0 * img.pr); y <= Math.ceil(sy1 * img.pr); y++) { if (y >= 0 && y < img.h && rfOHAt(img, x, y)[3] > 100) n++; }
    return n;
  }

  rfOHStep('rfOH: a linear dimension by the drafting rules: extension lines start 2 px off the geometry and run 4 px past the dimension line at any zoom; slim filled arrows (10 x 3.4 px, about 3 : 1) point out to the extension lines, the text is centred in a break of the dimension line; when cramped the arrows point in from outside and the text goes past the far one', async function () {
    var f = await rfOHSketch([{ t: 'line', x1: 0, y1: 0, x2: 6, y2: 0 }, { t: 'line', x1: 0, y1: 2, x2: 0.12, y2: 2 }],
      [{ e: 0, k: 'len', off: -0.6 }, { e: 1, k: 'len', off: 0.4 }]);
    var out = [], gaps = [];
    for (var z = 0; z < 2; z++) {
      if (z) { UI.zoomView(0.5); await idle(); }
      var L = rfOHLayer(), big = L.filter(function (x) { return x.label === '6.000'; })[0], small = L.filter(function (x) { return x.label === '.120'; })[0];
      assert(big && small, 'both dimensions drawn: ' + L.map(function (x) { return x.label; }).join(' '));
      var P = rfOHScr([0, 0]), Q = rfOHScr([6, 0]);
      // extension lines: the vertical segments at the two points' x
      [P, Q].forEach(function (pt) {
        var ext = big.segs.filter(function (s) { return Math.abs(s[0][0] - s[1][0]) < 0.01 && Math.abs(s[0][0] - pt[0]) < 0.8; })[0];
        assert(ext, 'an extension line at x ' + pt[0].toFixed(1) + ': ' + JSON.stringify(big.segs));
        var near = Math.min(Math.abs(ext[0][1] - pt[1]), Math.abs(ext[1][1] - pt[1]));
        assert(near > 1.95, 'gap at the geometry ' + near.toFixed(2) + ' px (want 2, or clear of the end point dot)');
        gaps.push(near);
        var far = Math.max(ext[0][1], ext[1][1]), arrowY = big.arrows[0][0][1];
        assert(Math.abs(far - arrowY - 4) < 0.6, 'runs past the dimension line by ' + (far - arrowY).toFixed(2) + ' px (want 4)');
      });
      // arrows: two, one size, slim, pointing outwards (away from the text) on to the extension lines
      assert(big.arrows.length === 2 && small.arrows.length === 2, 'two arrowheads each');
      var A = big.arrows.map(rfOHArrow), mid = (P[0] + Q[0]) / 2;
      A.forEach(function (a) {
        assert(Math.abs(a.len - 10) < 0.05 && Math.abs(a.w - 3.4) < 0.05, 'arrow ' + a.len.toFixed(2) + ' x ' + a.w.toFixed(2) + ' px');
        assert(a.dir[0] * (a.tip[0] - mid) > 0, 'a roomy dimension\'s arrow points out to its extension line');
      });
      var bx = big.box, tx = (bx[0] + bx[2]) / 2;
      assert(Math.abs(tx - mid) < 1, 'text centred on the dimension line: ' + tx.toFixed(1) + ' vs ' + mid.toFixed(1));
      assert(!big.segs.some(function (s) { return rfOHHits(s[0], s[1], bx); }), 'the dimension line breaks around its text');
      // cramped: arrows from outside, pointing in; the text past the far arrow, clear of both
      var p1 = rfOHScr([0, 2]), q1 = rfOHScr([0.12, 2]), m1 = (p1[0] + q1[0]) / 2;
      small.arrows.map(rfOHArrow).forEach(function (a) { assert(a.dir[0] * (a.tip[0] - m1) < 0, 'a cramped dimension\'s arrow points in from outside'); });
      assert(!small.arrows.some(function (tr) { return rfOHMeet(rfOHTriBox(tr), small.box); }), 'the cramped dimension\'s text clear of its arrows');
      out.push((big.arrows.map(rfOHArrow)[0].len).toFixed(1) + ' px arrows at scale ' + UI.cam.scale.toPrecision(3));
    }
    assert(Math.max.apply(0, gaps) - Math.min.apply(0, gaps) < 0.1, 'one gap in pixels at every point and zoom: ' + gaps.map(function (g) { return g.toFixed(2); }).join(' '));
    return out.join('; ') + '; extension-line gap ' + gaps[0].toFixed(1) + ' px';
  });

  rfOHStep('rfOH: an angle dimension too short for its arrows draws them outside, tangent to the arc, with the text past them (it drew both arrowheads over its digits); a roomy one keeps them inside and tangent', async function () {
    var f = await rfOHSketch([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 10, y2: 2.4 }], null,
      [{ type: 'angle', refs: ['0', '1'], v: 13.5, off: 0.6 }]);
    var res = [];
    for (var pass = 0; pass < 2; pass++) {
      if (pass) { f.rels[0].off = 6; UI.App.dimsStale = true; }
      var L = rfOHLayer(), a = L.filter(function (x) { return /°/.test(x.label); })[0];
      assert(a && a.arrows.length === 2, 'angle dimension with two arrows: ' + L.map(function (x) { return x.label; }).join(' '));
      assert(!a.arrows.some(function (tr) { return rfOHMeet(rfOHTriBox(tr), a.box); }), 'arrows clear of the text ' + JSON.stringify(a.box));
      var X = rfOHScr([0, 0]), R = Math.hypot(rfOHScr([f.rels[0].off, 0])[0] - X[0], rfOHScr([f.rels[0].off, 0])[1] - X[1]);
      var A = a.arrows.map(rfOHArrow), arcPx = R * 13.5 * Math.PI / 180;
      A.forEach(function (ar) {
        var rx = ar.tip[0] - X[0], ry = ar.tip[1] - X[1], rl = Math.hypot(rx, ry);
        assert(Math.abs(rl - R) < 0.6, 'tip on the arc');
        assert(Math.abs((rx * ar.dir[0] + ry * ar.dir[1]) / rl) < 0.03, 'arrow tangent to the arc (radial part ' + ((rx * ar.dir[0] + ry * ar.dir[1]) / rl).toFixed(3) + ')');
      });
      // the arc runs between angles 0 and 13.5 (screen y down): an outside arrow's body lies outside that range
      var bodies = A.map(function (ar) { var b = [ar.tip[0] - ar.dir[0] * 5, ar.tip[1] - ar.dir[1] * 5]; return Math.atan2(-(b[1] - X[1]), b[0] - X[0]) * 180 / Math.PI; });
      var outside = bodies.every(function (d) { return d < 0 || d > 13.5; }), inside = bodies.every(function (d) { return d > 0 && d < 13.5; });
      assert(pass ? inside : outside, (pass ? 'roomy (' : 'cramped (') + arcPx.toFixed(0) + ' px of arc): arrow bodies at ' + bodies.map(function (d) { return d.toFixed(1); }).join(', ') + '°');
      res.push(arcPx.toFixed(0) + ' px arc: ' + (pass ? 'inside' : 'outside'));
    }
    return res.join('; ');
  });

  rfOHStep('rfOH: the shop sketch (12 x 8 plate, holes, slots, centerline, arc, spline; linear, aligned, R with a tolerance, 4X Ø, between lines, to a midpoint, angle, driven, ordinates) draws no text on another dimension\'s text, no arrow on any text and no label on another dimension\'s lines; one stroke width per kind of mark', async function () {
    await rfOHShop();
    var L = rfOHLayer(), tt = [], at = [];
    assert(L.length >= 13, 'the dimensions are drawn: ' + L.map(function (x) { return x.label; }).join(' '));
    L.forEach(function (a, i) {
      L.forEach(function (b, j) {
        if (j > i && rfOHMeet(a.box, b.box)) tt.push(a.label + ' / ' + b.label);
        b.arrows.forEach(function (tr) { if (rfOHMeet(a.box, rfOHTriBox(tr))) at.push(b.label + ' arrow on ' + a.label); });
      });
    });
    assert(!tt.length, 'text on text: ' + tt.join(', '));
    assert(!at.length, at.join(', '));
    assert(UI.dimLabelClashes() === 0, 'labels on other dimensions\' lines: ' + UI.dimLabelClashes(true).join(', '));
    var widths = {};
    ['path.dl', 'path.da', 'path.dlh'].forEach(function (sel) {
      var set = {};
      D.querySelectorAll('#dim-layer ' + sel).forEach(function (p) { if (!p.closest('g.temp')) set[W.getComputedStyle(p).strokeWidth] = true; });
      widths[sel] = Object.keys(set);
      assert(widths[sel].length === 1, sel + ' stroke widths ' + widths[sel].join(' / '));
    });
    return L.length + ' dimensions; widths ' + JSON.stringify(widths);
  });

  rfOHStep('rfOH: every square-to-screen dimension and extension line and the arrows on it sit on a device pixel\'s centre at 100 %, 125 % and 150 % display scaling (no two-pixel grey smear)', async function () {
    await rfOHShop();
    var res = [];
    [1, 1.25, 1.5].forEach(function (dpr) {
      W.devicePixelRatio = dpr;
      var L = rfOHLayer(), bad = [], n = 0;
      function off(v) { var t = v * dpr - (Math.max(1, Math.round(dpr)) % 2) * 0.5; return Math.abs(t - Math.round(t)); }   // centres at k + 0.5 for an odd device width, on k for an even one (1.5: 2 px)
      L.forEach(function (x) {
        x.segs.forEach(function (s) {
          var hz = Math.abs(s[0][1] - s[1][1]) < 1e-9 && Math.abs(s[0][0] - s[1][0]) > 0.5, vt = Math.abs(s[0][0] - s[1][0]) < 1e-9 && Math.abs(s[0][1] - s[1][1]) > 0.5;
          if (hz) { n++; if (off(s[0][1]) > 0.02) bad.push(x.label + ' y ' + s[0][1]); }
          if (vt) { n++; if (off(s[0][0]) > 0.02) bad.push(x.label + ' x ' + s[0][0]); }
        });
        // an arrow on such a line (its tip on the line): on the same pixel centre
        x.arrows.map(rfOHArrow).forEach(function (a) {
          var onH = x.segs.some(function (s) { return Math.abs(s[0][1] - s[1][1]) < 1e-9 && Math.abs(s[0][0] - s[1][0]) > 0.5 && Math.abs(s[0][1] - a.tip[1]) < 0.6; });
          var onV = x.segs.some(function (s) { return Math.abs(s[0][0] - s[1][0]) < 1e-9 && Math.abs(s[0][1] - s[1][1]) > 0.5 && Math.abs(s[0][0] - a.tip[0]) < 0.6; });
          if (Math.abs(a.dir[1]) < 1e-3 && onH) { n++; if (off(a.tip[1]) > 0.02) bad.push(x.label + ' arrow y ' + a.tip[1]); }
          else if (Math.abs(a.dir[0]) < 1e-3 && onV) { n++; if (off(a.tip[0]) > 0.02) bad.push(x.label + ' arrow x ' + a.tip[0]); }
        });
      });
      assert(n > 20, 'square lines found: ' + n);
      assert(!bad.length, 'at ' + dpr * 100 + ' %: off the pixel grid: ' + bad.slice(0, 6).join(', '));
      res.push(dpr * 100 + ' %: ' + n + ' lines / arrows on centres');
    });
    try { delete W.devicePixelRatio; } catch (e) { /* restored */ }
    UI.App.dimsStale = true;
    return res.join('; ');
  });

  rfOHStep('rfOH: a sketch line, arc, circle and spline draw with one weight (within one device pixel of each other) at three zooms', async function () {
    var f = await rfOHSketch([{ t: 'line', x1: 0, y1: 0, x2: 4, y2: 0 }, { t: 'arc', cx: 6, cy: 0, r: 1, a0: 0, a1: 180 },
      { t: 'circle', cx: 9, cy: 0, r: 1 }, { t: 'spline', pts: [[11, 0], [11.6, 1], [12.4, 1], [13, 0]] }]);
    var out = [], S = W.SketchSolver, fc = S.freeCurve(f.entities[3]), top = null;
    for (var k = 0; k <= 400; k++) { var p = fc.pt(fc.t0 + (fc.t1 - fc.t0) * k / 400); if (!top || p[1] > top[1]) top = p; }
    // columns through each entity where it runs level: the line's middle, the arc's / circle's top, the spline's top
    var at = [['line', [2, 0]], ['arc', [6, 1]], ['circle', [9, 1]], ['spline', top]];
    for (var z = 0; z < 3; z++) {
      var w = {};
      for (var q = 0; q < at.length; q++) {
        UI.zoomToFit(); await rfOHLand();
        var s0 = rfOHScr(at[q][1]);
        if (z) UI.zoomView(z === 1 ? 0.1 : 3, s0[0], s0[1]);
        UI.updateSketches(); await idle();
        var img = rfOHRender([UI.groups.sketches]), s = rfOHScr(at[q][1]);
        w[at[q][0]] = rfOHColumn(img, s[0], s[1] - 8, s[1] + 8);
      }
      var vals = Object.keys(w).map(function (k) { return w[k]; }), lo = Math.min.apply(0, vals), hi = Math.max.apply(0, vals);
      assert(lo > 0, 'every entity drawn: ' + JSON.stringify(w));
      assert(hi - lo <= 1, 'one weight: ' + JSON.stringify(w) + ' device px');
      out.push('scale ' + UI.cam.scale.toPrecision(2) + ' ' + JSON.stringify(w));
    }
    return out.join(' ');
  });

  rfOHStep('rfOH: a construction line\'s dashes keep one screen length when zooming (period within 10 %); circles, arcs, splines and ellipses are drawn within half a pixel of the true curve at three zooms (splines and ellipses were cut by the model\'s chord tolerance: chords several pixels deep zoomed in)', async function () {
    var f = await rfOHSketch([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0, construction: true }, { t: 'circle', cx: 3, cy: 3, r: 2 },
      { t: 'arc', cx: 8, cy: 3, r: 1.5, a0: 10, a1: 170 }, { t: 'spline', pts: [[0, 6], [2, 8], [4, 6.5], [6, 8.2]] }, { t: 'ellipse', cx: 8, cy: 7, rx: 1.6, ry: 0.7, rot: 20 }]);
    var periods = [], sag = [];
    for (var z = 0; z < 3; z++) {
      if (z) { var cm = rfOHScr([5, 0]); UI.zoomView(z === 1 ? 0.6 : 0.01, cm[0], cm[1]); await idle(); UI.updateSketches(); await idle(); }
      // dash period: the row through the construction line, near the screen's middle
      if (z < 2) {
        var img = rfOHRender([UI.groups.sketches]), a = rfOHScr([0, 0]), b = rfOHScr([10, 0]), y = Math.floor(a[1] * img.pr), starts = [], on = false;
        var x0 = Math.max(0, Math.floor(Math.max(a[0], 0) * img.pr)), x1 = Math.min(img.w - 1, Math.floor(Math.min(b[0], UI.size.w) * img.pr));
        for (var x = x0; x <= x1; x++) {
          var ink = Math.max(rfOHAt(img, x, y)[3], rfOHAt(img, x, y - 1)[3], rfOHAt(img, x, y + 1)[3]) > 100;
          if (ink && !on) starts.push(x);
          on = ink;
        }
        var gaps = []; for (var i = 2; i < starts.length - 1; i++) gaps.push(starts[i] - starts[i - 1]);
        gaps.sort(function (p, q) { return p - q; });
        assert(gaps.length >= 4, 'dashes counted: ' + starts.length + ' in row ' + y + ' from ' + x0 + ' to ' + x1 + ' (' + a + ' / ' + b + ') column ' + [-3, -2, -1, 0, 1, 2, 3].map(function (d) { return rfOHAt(img, Math.floor((a[0] + 40) * img.pr), y + d)[3]; }).join(','));
        periods.push(gaps[gaps.length >> 1] / img.pr);
      }
      // the drawn polylines against the true curves, in screen pixels
      var worst = 0, sc = UI.cam.scale, S = W.SketchSolver;
      f.entities.forEach(function (e) {
        if (e.t === 'line') return;
        var pls = UI.screenPolylines(e), fc = e.t === 'spline' || e.t === 'ellipse' ? S.freeCurve(e) : null;
        pls.forEach(function (pl) {
          var P = pl.pts, n = pl.closed ? P.length : P.length - 1;
          for (var j = 0; j < n; j++) {
            var p = P[j], q = P[(j + 1) % P.length], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], d;
            if (fc) d = S.freeClosest(fc, m).d;
            else d = Math.abs(Math.hypot(m[0] - e.cx, m[1] - e.cy) - e.r);
            worst = Math.max(worst, d / sc);
          }
        });
      });
      sag.push(worst);
      assert(worst < 0.5, 'curves within half a pixel at scale ' + sc.toPrecision(3) + ': worst ' + worst.toFixed(3) + ' px');
    }
    assert(Math.abs(periods[1] / periods[0] - 1) < 0.1, 'dash period ' + periods.map(function (p) { return p.toFixed(2); }).join(' -> ') + ' px');
    return 'dash period ' + periods.map(function (p) { return p.toFixed(2); }).join(' / ') + ' px; worst sagitta ' + sag.map(function (s) { return s.toFixed(3); }).join(' / ') + ' px';
  });

  rfOHStep('rfOH: a 14 gauge bracket in Shaded With Edges shows no edge of its far side inside the near face (Top, Isometric and a 21 degree view)', async function () {
    await anvil.newPart(); await idle();
    rfOHSet();
    var T = 0.0747;
    await anvil.run(['p.units("in");', 'p.sheet(' + T + ', ' + T + ', 0.5);',
      'var f1 = p.sketch("Top", 0, "Sketch1").rect(0, 0, 6, 4).circle(1.5, 2, 0.1405).circle(3, 2, 0.25).circle(4.5, 2, 0.1405).id();',
      'p.extrude(' + T + ', { sketch: f1, name: "Base-Flange1", sheetBase: true });',
      'p.flange(1.5, [[0, ' + T + ', -2]], { angle: 90, name: "Edge-Flange1" });',
      'p.flange(1.5, [[6, ' + T + ', -2]], { angle: 90, name: "Edge-Flange2" });'].join('\n'));
    await idle();
    UI.setStyle('shadedEdges'); await idle();
    var holes = [[1.5, 2, 0.1405], [3, 2, 0.25], [4.5, 2, 0.1405]], res = [];
    function P(x, z, y) { var v = new W.THREE.Vector3(x, y, z); return UI.worldToScreen([v.x, v.y, v.z]); }
    function segDist(p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
    var views = [['Top'], ['Isometric'], [null, { n: [0.34, 0.36, 0.87], y: [0, 1, 0] }]];
    for (var v = 0; v < views.length; v++) {
      if (views[v][0]) UI.setView(views[v][0]); else { UI.viewNormalTo(views[v][1]); UI.zoomToFit(); }
      await rfOHLand();
      var img = rfOHRender([UI.groups.body, UI.groups.edges]), bad = 0, n = 0, badAt = [];
      // the drawn model edges that are not on the far (bottom) side, in screen: a sample within 5 px of one may touch
      // a real edge (the near face's outline, a hole's rim, a flange standing in front)
      var outl = [];
      (UI.App.edges || []).forEach(function (e) { if (e.smooth || e.seam || (Math.abs(e.a[1]) < 1e-4 && Math.abs(e.b[1]) < 1e-4)) return; outl.push([UI.worldToScreen(e.a), UI.worldToScreen(e.b)]); });
      var cam = UI.camera, rc = new W.THREE.Raycaster(), bodyMeshes = [];
      UI.groups.body.traverse(function (o) { if (o.isMesh && o.visible) bodyMeshes.push(o); });
      for (var gx = 0; gx <= 60; gx++) for (var gz = 0; gz <= 40; gz++) {
        var wx = 0.2 + 5.6 * gx / 60, wz = -(0.2 + 3.6 * gz / 40), s = P(wx, wz, T);
        if (s[0] < 2 || s[1] < 2 || s[0] > UI.size.w - 2 || s[1] > UI.size.h - 2) continue;
        if (outl.some(function (o) { return segDist(s, o[0], o[1]) < 5; })) continue;
        if (holes.some(function (h) { return Math.hypot(wx - h[0], wz + h[1]) < h[2]; })) continue;
        // only where the near face is what the camera sees there (a flange in front hides it)
        var ndc = new W.THREE.Vector3(wx, T, wz).project(cam);
        rc.setFromCamera({ x: ndc.x, y: ndc.y }, cam);
        var hit = rc.intersectObjects(bodyMeshes, false)[0];
        if (!hit || Math.abs(hit.point.y - T) > 1e-3 || Math.abs(hit.point.x - wx) > 0.02 || Math.abs(hit.point.z - wz) > 0.02) continue;
        n++;
        var c = rfOHAt(img, Math.floor(s[0] * img.pr), Math.floor(s[1] * img.pr));
        if (c[3] > 0 && (c[0] + c[1] + c[2]) / 3 < 100) { bad++; if (badAt.length < 6) badAt.push([wx.toFixed(2), wz.toFixed(2), Math.round(s[0]), Math.round(s[1])].join(',')); }
      }
      assert(n > 200, (views[v][0] || 'tilted') + ': near-face samples ' + n);
      assert(bad === 0, (views[v][0] || 'tilted') + ': ' + bad + ' of ' + n + ' near-face samples show an edge colour: ' + badAt.join(' / '));
      res.push((views[v][0] || '21 deg') + ' ' + n + ' samples clear');
    }
    return res.join('; ');
  });

  // ---- second pass (head, 2026-11-17): texts at three zooms, dots against their curves, highlights, 150 %, rotated
  // view, Mastercam profile, hidden-line dashes along chords, fixed marks ----
  // the dots drawn for the sketch being edited: [{ p: screen [x, y], d: diameter px }]
  function rfOHDots() {
    var out = [];
    if (UI.render) UI.render();   // the dot sizes follow the zoom at each frame
    UI.groups.sketches.children.forEach(function (o) {
      if (!o.userData || !o.userData.sketchPoints || !o.visible) return;
      var a = o.geometry.getAttribute('position'), d = o.material.size;
      for (var k = 0; k < a.count; k++) out.push({ p: UI.worldToScreen([a.getX(k), a.getY(k), a.getZ(k)]), d: d });
    });
    return out;
  }
  function rfOHDiscBox(c, r, b) { var x = Math.max(b[0], Math.min(c[0], b[2])), y = Math.max(b[1], Math.min(c[1], b[3])); return Math.hypot(c[0] - x, c[1] - y) < r; }
  // every text against every other text and every arrow; every dot against the texts (the ordinate zero "0" too)
  function rfOHCrowd() {
    var L = rfOHLayer(), bad = [];
    var zero = Array.prototype.map.call(D.querySelectorAll('#ord-layer text'), function (t) { var bb = t.getBBox(), y = +t.getAttribute('y'); return { label: '0', box: [bb.x - 1, y - UI.DIM_CAP - 1, bb.x + bb.width + 1, y + 1], arrows: [] }; });
    var all = L.concat(zero);
    all.forEach(function (a, i) {
      all.forEach(function (b, j) {
        if (j > i && rfOHMeet(a.box, b.box)) bad.push(a.label + ' text on ' + b.label);
        b.arrows.forEach(function (tr) { if (rfOHMeet(a.box, rfOHTriBox(tr))) bad.push(b.label + ' arrow on ' + a.label); });
      });
    });
    rfOHDots().forEach(function (dt) { all.forEach(function (a) { if (rfOHDiscBox(dt.p, dt.d / 2 - 0.5, a.box)) bad.push('dot under ' + a.label + ' (dot ' + dt.p.map(Math.round) + ' ' + dt.d + ' px, text ' + a.box.map(Math.round) + ')'); }); });
    return { n: L.length, bad: bad };
  }
  function rfOHEv(type, p, tg) { var r = $('viewport').getBoundingClientRect(); (tg || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mousedown' ? 1 : 0, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) })); }

  rfOHStep('rfOH: the shop sketch at the fitted zoom, zoomed out 3x and in 3x: no dimension text shares pixels with another (an ordinate value printed over a linear dimension\'s 11.000 at the fitted zoom; three values on 8.000 zoomed out), no arrowhead on a text, no point dot under a text; the later text steps along its own line or out along its leader', async function () {
    await rfOHShop();
    var res = [], steps = [[1, 'fit'], [3, 'out 3x'], [1 / 9, 'in 3x']];
    for (var k = 0; k < steps.length; k++) {
      UI.zoomView(steps[k][0]); await idle(); UI.updateSketches(); await idle();
      var c = rfOHCrowd();
      assert(c.n >= 13, steps[k][1] + ': dimensions drawn ' + c.n);
      assert(!c.bad.length, steps[k][1] + ': ' + c.bad.slice(0, 6).join(', '));
      res.push(steps[k][1] + ' clear');
    }
    return res.join('; ');
  });

  rfOHStep('rfOH: a point dot never covers more than a third of the screen diameter of the circle, arc or slot end it belongs to (shrinks to 3 px, then is not drawn); a line\'s end dot keeps its 10 px', async function () {
    await rfOHSketch([{ t: 'circle', cx: 1, cy: 1, r: 0.1405 }, { t: 'arc', cx: 4, cy: 1, r: 0.5, a0: 0, a1: 180 }, { t: 'line', x1: 6, y1: 1, x2: 9, y2: 1 }, { t: 'slot', x1: 1, y1: 3, x2: 3, y2: 3, w: 0.375 }]);
    var res = [];
    for (var z = 0; z < 3; z++) {
      if (z) { UI.zoomView(z === 1 ? 4 : 1 / 20); await idle(); UI.updateSketches(); await idle(); }
      var dots = rfOHDots(), sc = UI.cam.scale;
      var dotAt = function (uv) { var p = rfOHScr(uv); return dots.filter(function (d) { return Math.hypot(d.p[0] - p[0], d.p[1] - p[1]) < 0.5; })[0] || null; };
      [[[1, 1], 0.1405], [[4, 1], 0.5], [[4.5, 1], 0.5], [[1, 3], 0.1875]].forEach(function (x) {
        var d = dotAt(x[0]), lim = 2 * x[1] / sc / 3, on = rfOHScr(x[0]);
        if (on[0] < 0 || on[1] < 0 || on[0] > UI.size.w || on[1] > UI.size.h) return;
        if (lim < 3) assert(!d, 'no dot when a third of the curve is under 3 px (' + lim.toFixed(1) + ')');
        else assert(d && d.d <= lim + 1e-9 && d.d >= 3 && d.d === Math.floor(d.d), 'dot at ' + x[0] + ': ' + (d ? d.d : 'none') + ' px, curve diameter ' + (3 * lim).toFixed(1) + ' px; at ' + rfOHScr(x[0]).map(Math.round) + ' dots ' + JSON.stringify(dots.map(function (q) { return q.p.map(Math.round).concat(q.d); })));
      });
      var le = dotAt([9, 1]), lp = rfOHScr([9, 1]);
      if (lp[0] > 0 && lp[0] < UI.size.w) assert(le && le.d === 10, 'a line end keeps the 10 px dot: ' + (le && le.d));
      res.push('scale ' + sc.toPrecision(2) + ': hole dot ' + ((dotAt([1, 1]) || {}).d || 'none'));
    }
    return res.join('; ');
  });

  rfOHStep('rfOH: highlights are clean and leave nothing behind: a selected dimension (text, lines and arrows one colour), a selected face and a hovered flange of the bracket; all gone once the mouse leaves and the selection is cleared', async function () {
    await rfOHSketch([{ t: 'line', x1: 0, y1: 0, x2: 6, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 0, y2: 3 }], [{ e: 0, k: 'len', off: -0.6 }]);
    UI.App.sel = { kind: 'dim', index: 0 }; UI.drawDims(true);
    var g = D.querySelector('#dim-layer g.dim.sel');
    assert(g, 'selected dimension drawn as selected');
    var cs = function (sel, pr) { return W.getComputedStyle(g.querySelector(sel)).getPropertyValue(pr); };
    var col = [cs('text', 'fill'), cs('path.dl', 'stroke'), cs('path.da', 'fill')];
    assert(col[0] === col[1] && col[1] === col[2], 'one colour: text ' + col[0] + ', lines ' + col[1] + ', arrows ' + col[2]);
    rfOHEv('mousemove', [UI.size.w - 20, 40]); await idle(); await wait(30);
    UI.App.sel = null; UI.drawDims(true);
    assert(!D.querySelector('#dim-layer g.dim.sel'), 'no dimension left selected');
    UI.setTool('select');
    await anvil.newPart(); await idle();
    await anvil.run(['p.units("in");', 'p.sheet(0.0747, 0.0747, 0.5);', 'var f1 = p.sketch("Top", 0, "Sketch1").rect(0, 0, 6, 4).id();', 'p.extrude(0.0747, { sketch: f1, sheetBase: true });', 'p.flange(1.5, [[6, 0.0747, -2]], { angle: 90 });'].join('\n')); await idle();
    UI.setStyle('shadedEdges'); UI.setView('Isometric'); await rfOHLand();
    var top = UI.worldToScreen([3, 0.0747, -2]);
    rfOHEv('mousemove', top); rfOHEv('mousedown', top, $('viewport')); rfOHEv('mouseup', top); await idle(); await wait(30);
    assert(UI.selection().some(function (s) { return s.kind === 'face'; }), 'a face selected: ' + JSON.stringify(UI.selection()));
    rfOHEv('mousemove', UI.worldToScreen([6.1, 1, -2])); await idle(); await wait(30); UI.render();
    var tinted = 0; UI.groups.highlight.traverse(function (o) { if (o.isMesh && o.visible) tinted++; });
    assert(tinted >= 1, 'selection / hover tints drawn: ' + tinted);
    rfOHEv('mousemove', [UI.size.w - 20, 40]); await idle();
    UI.setSelection([]); await idle(); UI.render();
    var left = 0; UI.groups.highlight.traverse(function (o) { if ((o.isMesh || o.isLine) && o.visible) left++; });
    assert(left === 0 && !UI.App.hover, 'nothing left highlighted: ' + left + ' objects, hover ' + JSON.stringify(UI.App.hover));
    return 'selected dimension one colour (' + col[0] + '), face + flange tints ' + tinted + ', all cleared';
  });

  rfOHStep('rfOH: the shop sketch seen at an angle: every dimension still drawn, texts readable (no text on text or arrow on text), the extension lines starting at their own geometry', async function () {
    await rfOHShop();
    UI.viewNormalTo({ n: [0.45, 0.35, 0.82], y: [0, 1, 0] }); UI.zoomToFit(); await rfOHLand(); UI.updateSketches(); await idle();
    var c = rfOHCrowd();
    assert(c.n >= 13, 'dimensions drawn ' + c.n);
    assert(!c.bad.length, c.bad.slice(0, 6).join(', '));
    var f = UI.activeSketchFeature(), e = f.entities[0], d = rfOHLayer().filter(function (x) { return x.label === '11.000'; })[0];
    assert(d, '11.000 drawn');
    [[e.x1, e.y1], [e.x2, e.y2]].forEach(function (pt) {
      var s = rfOHScr(pt), near = Math.min.apply(0, d.segs.map(function (g) { return Math.min(Math.hypot(g[0][0] - s[0], g[0][1] - s[1]), Math.hypot(g[1][0] - s[0], g[1][1] - s[1])); }));
      assert(near < 8, 'an extension line starts at its point (' + near.toFixed(1) + ' px)');
    });
    return c.n + ' dimensions clear at an angle';
  });

  rfOHStep('rfOH: the Mastercam profile draws the shop sketch as clean (no text on text, no arrow on text, no dot under text) and its dots follow the same third-of-the-circle rule', async function () {
    var prof = anvil.profile();
    try {
      anvil.profile('mastercam'); await idle(); await wait(50);
      await rfOHShop();
      var c = rfOHCrowd();
      assert(c.n >= 13 && !c.bad.length, 'Mastercam: ' + c.n + ' dimensions; ' + c.bad.slice(0, 6).join(', '));
      var f = UI.activeSketchFeature(), hole = f.entities[8], p = rfOHScr([hole.cx, hole.cy]);
      var d = rfOHDots().filter(function (x) { return Math.hypot(x.p[0] - p[0], x.p[1] - p[1]) < 0.5; })[0], lim = 2 * hole.r / UI.cam.scale / 3;
      assert(lim < 3 ? !d : d && d.d <= lim, 'hole dot ' + (d ? d.d : 'none') + ' px for a ' + (3 * lim).toFixed(1) + ' px hole');
      return c.n + ' dimensions clear; hole dot ' + (d ? d.d : 'none') + ' px';
    } finally { try { UI.setTool('select'); } catch (e) { /* none */ } anvil.profile(prof); await idle(); }
  });

  rfOHStep('rfOH: Hidden Lines Visible on the bracket: the dashes run on along every chain of chords (a hole rim, a bend) instead of starting again at each chord; Wireframe draws each shared edge once', async function () {
    await anvil.newPart(); await idle();
    rfOHSet();
    await anvil.run(['p.units("in");', 'p.sheet(0.0747, 0.0747, 0.5);', 'var f1 = p.sketch("Top", 0, "Sketch1").rect(0, 0, 6, 4).circle(3, 2, 0.25).id();', 'p.extrude(0.0747, { sketch: f1, sheetBase: true });', 'p.flange(1.5, [[0, 0.0747, -2]], { angle: 90 });'].join('\n')); await idle();
    UI.setStyle('hlv'); UI.setView('Isometric'); await rfOHLand(); UI.render(); await idle(); UI.render();
    var joins = 0, cont = 0;
    UI.groups.edges.traverse(function (o) {
      var fat = o.userData && o.userData.fat, m = o.material;
      if (!fat || !fat.g || !fat.g.db || !o.isLineSegments) return;
      var pos = o.geometry.attributes.position.array, dist = fat.g.db.array;
      for (var i = 1; i < pos.length / 6; i++) {
        var a = (i - 1) * 6 + 3, b = i * 6;
        if (Math.abs(pos[a] - pos[b]) + Math.abs(pos[a + 1] - pos[b + 1]) + Math.abs(pos[a + 2] - pos[b + 2]) > 1e-6) continue;   // not joined
        joins++;
        if (Math.abs(dist[(i - 1) * 2 + 1] - dist[i * 2]) < 1e-6) cont++;
      }
    });
    assert(joins > 20, 'joined chords found: ' + joins);
    assert(cont === joins, 'dash distance carried on at ' + cont + ' of ' + joins + ' joins');
    UI.setStyle('wireframe'); await idle();
    var keys = {}, dup = 0, n = 0;
    (UI.App.edges || []).forEach(function (e) {
      if (e.smooth || e.seam) return;
      n++;
      var k1 = e.a.map(function (v) { return v.toFixed(5); }).join(), k2 = e.b.map(function (v) { return v.toFixed(5); }).join(), k = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
      if (keys[k]) dup++;
      keys[k] = true;
    });
    assert(n > 20 && dup === 0, 'wireframe edges ' + n + ', drawn twice ' + dup);
    return 'HLV dashes carried on at ' + cont + ' / ' + joins + ' joins; wireframe ' + n + ' edges, none doubled';
  });

  rfOHStep('rfOH: the fixed marks on whole pixels: the scale bar\'s line, the triad canvas at the screen\'s density, every sketch dot a whole number of pixels; the cursor readout of a drawing tool reads in the dimension text colour (it was light grey on the light ground)', async function () {
    await rfOHSketch([{ t: 'circle', cx: 0, cy: 0, r: 1 }, { t: 'line', x1: 2, y1: 0, x2: 5, y2: 0 }]);
    var dpr = W.devicePixelRatio || 1, sb = $('scale-bar-line'), r = sb && sb.getBoundingClientRect();
    assert(r && Math.abs(r.left * dpr - Math.round(r.left * dpr)) < 0.02 && Math.abs(r.top * dpr - Math.round(r.top * dpr)) < 0.02, 'scale bar on whole device px: ' + (r && [r.left, r.top]));
    var tri = D.querySelector('#triad');
    if (tri && tri.tagName === 'CANVAS') assert(tri.width === Math.round(96 * dpr), 'triad canvas ' + tri.width + ' for dpr ' + dpr);
    rfOHDots().forEach(function (d) { assert(d.d === Math.floor(d.d), 'dot ' + d.d + ' px'); });
    UI.setTool('line'); await idle();
    var a = rfOHScr([1.5, 0.6]), b = rfOHScr([3, 0.9]);
    rfOHEv('mousemove', a); rfOHEv('mousedown', a, $('viewport')); rfOHEv('mouseup', a); await idle();
    rfOHEv('mousemove', b); await idle(); await wait(30);
    var t = D.querySelector('#dim-layer text.sk-readout');
    assert(t && t.textContent, 'the readout is drawn: tool ' + UI.App.tool + ' pts ' + JSON.stringify(UI.App.toolState && UI.App.toolState.pts) + ' texts ' + D.querySelectorAll('#dim-layer text').length);
    var want = W.getComputedStyle(t).getPropertyValue('--dim-text').trim(), got = W.getComputedStyle(t).fill;
    var probe = D.createElement('span'); probe.style.color = want; D.body.appendChild(probe); var wantRgb = W.getComputedStyle(probe).color; probe.remove();
    assert(got === wantRgb, 'readout fill ' + got + ' = the dimension text colour ' + wantRgb);
    UI.cancelTool && UI.cancelTool(); UI.setTool('select');
    return 'scale bar, triad ' + (tri ? tri.tagName + ' ' + tri.width : '(none)') + ', dots whole; readout ' + got;
  });
