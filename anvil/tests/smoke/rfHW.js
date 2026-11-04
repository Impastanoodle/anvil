  // --- rfHW (2026-11-04, lane sketchdims): automatic dimension placements step out until their labels are clear of
  // the other dimensions' lines and labels (Fully Define, Autodimension, Slot / Offset Add dimensions, typed values);
  // the Slot PM's Overall Length dimension is driving and round-trips through the script. ---
  // every setting the steps rely on, set at the start of each step and put back after it (earlier groups leave the
  // grid on, which snaps the slot's width click, driven dimensions shown, a Quick Snap, numeric input, slot options)
  var rfHWSaved = null;
  function rfHWSet() {
    var V = UI.App.view;
    if (!rfHWSaved) rfHWSaved = { grid: V.showGrid, dims: V.showDims, i2d: V.instant2D, regions: V.sketchRegions, qs: UI.App.quickSnap, num: UI.sketchNumericInput(), curves: JSON.parse(JSON.stringify(UI.sketchCurveOptions())) };
    V.showGrid = false; V.showDims = false; V.instant2D = false; V.sketchRegions = false;
    UI.App.quickSnap = null;
    UI.sketchNumericInput(false);
    UI.sketchCurveOptions({ sides: 6, ins: true, slotDims: false, overall: false });
  }
  function rfHWRestore() {
    var s = rfHWSaved, V = UI.App.view;
    if (!s) return;
    rfHWSaved = null;
    V.showGrid = s.grid; V.showDims = s.dims; V.instant2D = s.i2d; V.sketchRegions = s.regions;
    UI.App.quickSnap = s.qs;
    UI.sketchNumericInput(s.num);
    UI.sketchCurveOptions(s.curves);
    UI.App.gridStale = true; UI.App.dimsStale = true;
  }
  function rfHWStep(name, fn) { step(name, async function () { try { return await fn(); } finally { try { UI.setTool('select'); } catch (e) { /* no sketch */ } rfHWRestore(); } }); }
  async function rfHWNew(ents) {
    await anvil.newPart(); await idle();
    rfHWSet();
    UI.App.model.units = 'in';
    await UI.newSketchOnPlane('Front'); await idle();
    if (ents && ents.length) fxSk(ents);
    UI.zoomToFit && UI.zoomToFit(); await idle();
    UI.zoomView(1.6); await idle();   // (k > 1 zooms out) zoomed out, where the labels crowd
    return UI.activeSketchFeature();
  }
  // the drawn dimension layer, measured from the DOM: every dimension's text box and its drawn line segments
  function rfHWLayer() {
    UI.drawDims(true);
    var out = [];
    D.querySelectorAll('#dim-layer g.dim').forEach(function (g) {
      if (/\btemp\b/.test(g.getAttribute('class'))) return;
      var t = g.querySelector('text'), p = g.querySelector('path.dl');
      if (!t || !t.textContent) return;
      var bb = t.getBBox(), segs = [], d = p ? p.getAttribute('d') || '' : '', last = null;
      // the text's ink: the capitals' height (getBBox also holds the line gap above and the descent below)
      var box = [bb.x + 1, bb.y + bb.height * 0.2, bb.x + bb.width - 1, bb.y + bb.height * 0.8];
      d.replace(/([ML])\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/g, function (m, c, x, y) { var q = [+x, +y]; if (c === 'L' && last) segs.push([last, q]); last = q; return m; });
      out.push({ label: t.textContent, box: box, segs: segs });
    });
    return out;
  }
  function rfHWHits(p, q, b) {
    var dx = q[0] - p[0], dy = q[1] - p[1], t0 = 0, t1 = 1, P4 = [-dx, dx, -dy, dy], Q4 = [p[0] - b[0], b[2] - p[0], p[1] - b[1], b[3] - p[1]];
    for (var k = 0; k < 4; k++) {
      if (Math.abs(P4[k]) < 1e-12) { if (Q4[k] < 0) return false; continue; }
      var r = Q4[k] / P4[k];
      if (P4[k] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return t1 - t0 > 1e-9;
  }
  // every clash: a label on another dimension's line, two labels overlapping, a label on the sketch geometry (geo)
  function rfHWClashes(geo) {
    var L = rfHWLayer(), out = [];
    L.forEach(function (a, i) {
      L.forEach(function (b, j) {
        if (i === j) return;
        if (j > i && a.box[0] < b.box[2] && a.box[2] > b.box[0] && a.box[1] < b.box[3] && a.box[3] > b.box[1]) out.push(a.label + ' overlaps ' + b.label);
        if (b.segs.some(function (s) { return rfHWHits(s[0], s[1], a.box); })) out.push(a.label + ' on a line of ' + b.label);
      });
      if (geo && UI.sketchGeometryAt(a.box)) out.push(a.label + ' on the sketch');
    });
    return { n: L.length, clashes: out };
  }
  function rfHWFD() { UI.cmdFullyDefineSketch(); clickPmButton('Calculate'); UI.pmOK(); }
  function rfHWSlot(a, b, w) { rskClick(a); rskClick(b); selEv('mousemove', rskScr(w)); rskClick(w); }
  function rfHWOlen(f) { return (f.rels || []).map(function (r, i) { return { r: r, i: i }; }).filter(function (x) { return x.r.type === 'distance' && x.r.ac; }); }
  rfHWStep('rfHW: a plate fully defined, then two slots with Add dimensions (Overall Length) and Fully Define again, zoomed out: every label is clear of the other dimensions\' lines and labels and of the sketch (the slot by the top edge steps its length dimension out past the edge)', async function () {
    try {
      var f = await rfHWNew([{ t: 'rect', x: 0, y: 0, w: 4, h: 2 }]);
      rfHWFD(); await idle();
      UI.sketchCurveOptions({ slotDims: true, overall: true });
      UI.setTool('slot'); await idle();
      rfHWSlot([1, 1.7], [3, 1.7], [2, 1.85]); await idle();
      f = UI.activeSketchFeature();
      var top = rfHWOlen(f)[0], step0 = Math.max(6 / 25.4, 34 * UI.cam.scale), off14 = Math.round((0.15 + 14 * UI.cam.scale) * 1e4) / 1e4;
      assert(top && Math.abs(top.r.v - 2.3) < 1e-9, 'overall length 2.300: ' + JSON.stringify(f.rels));
      // its label at w/2 + 14 px sat on the plate's top edge and on the 2.000 dimension's extension line along it
      var k = (top.r.off - off14) / step0;
      assert(k > 0.99 && Math.abs(k - Math.round(k)) < 0.01, 'stepped out whole spacings: ' + top.r.off + ' from ' + off14 + ' by ' + step0.toFixed(4));
      var c1 = rfHWClashes(true);
      assert(!c1.clashes.length, 'after the first slot: ' + c1.clashes.join('; '));
      rfHWSlot([0.5, 0.4], [0.5, 1.2], [0.65, 0.8]); await idle();
      UI.setTool('select'); await idle();
      var c2 = rfHWClashes(true);
      assert(!c2.clashes.length, 'after the second slot: ' + c2.clashes.join('; '));
      rfHWFD(); await idle();
      f = UI.activeSketchFeature();
      assert(W.SketchSolver.analyze(f).status === 'full', 'fully defined: ' + W.SketchSolver.analyze(f).status);
      var c3 = rfHWClashes(true);
      assert(c3.n >= 10 && !c3.clashes.length, 'after Fully Define (' + c3.n + ' labels): ' + c3.clashes.join('; '));
      await UI.exitSketch(); await idle();
      return c3.n + ' labels clear; top slot length at ' + top.r.off + ' (was ' + off14 + ')';
    } finally { UI.sketchCurveOptions({ slotDims: false, overall: false }); UI.setTool('select'); }
  });
  rfHWStep('rfHW: Fully Define on a stepped plate and Autodimension on a plate with holes and a slot: no label on another dimension\'s lines or labels, none on the sketch', async function () {
    var pts = [[0, 0], [4, 0], [4, 1], [3, 1], [3, 1.5], [2, 1.5], [2, 2.5], [1, 2.5], [1, 3], [0, 3]], ents = [];
    for (var k = 0; k < pts.length; k++) { var a = pts[k], b = pts[(k + 1) % pts.length]; ents.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }); }
    await rfHWNew(ents);
    rfHWFD(); await idle();
    var c1 = rfHWClashes(true);
    assert(c1.n >= 8 && !c1.clashes.length, 'stepped plate (' + c1.n + ' labels): ' + c1.clashes.join('; '));
    await UI.exitSketch(); await idle();
    await rfHWNew([{ t: 'rect', x: 0, y: 0, w: 4, h: 2 }, { t: 'circle', cx: 1, cy: 1, r: 0.125 }, { t: 'circle', cx: 1.4, cy: 1, r: 0.125 }, { t: 'circle', cx: 3, cy: 1.5, r: 0.125 }, { t: 'slot', x1: 2, y1: 0.4, x2: 3.2, y2: 0.4, w: 0.25 }]);
    UI.cmdAutodimension(); await idle(); clickPmButton('Apply'); await idle(); UI.pmOK(); await idle();
    var c2 = rfHWClashes(false);
    assert(c2.n >= 8 && !c2.clashes.length, 'holes and slot (' + c2.n + ' labels): ' + c2.clashes.join('; '));
    await UI.exitSketch(); await idle();
    return c1.n + ' and ' + c2.n + ' labels clear';
  });
  rfHWStep('rfHW: a dimension the user moved keeps its place when a later slot\'s Add dimensions land by it (only the new ones step out)', async function () {
    try {
      var f = await rfHWNew([{ t: 'rect', x: 0, y: 0, w: 4, h: 2 }]);
      rfHWFD(); await idle();
      f = UI.activeSketchFeature();
      var wDim = f.rels.filter(function (r) { return r.type === 'distance' && r.dir === 'h' && Math.abs(r.v - 4) < 1e-9; })[0];
      wDim.off = 0.35; UI.App.dimsStale = true; await idle();   // dragged up into the plate, across where the slot goes
      UI.sketchCurveOptions({ slotDims: true, overall: false });
      UI.setTool('slot'); await idle();
      rfHWSlot([1, 0.2], [3, 0.2], [2, 0.3]); await idle();
      UI.setTool('select'); await idle();
      assert(wDim.off === 0.35, 'the moved dimension stays: ' + wDim.off);
      var c = rfHWClashes(false);
      assert(!c.clashes.length, c.clashes.join('; '));
      await UI.exitSketch(); await idle();
      return 'kept at .35; ' + c.n + ' labels clear';
    } finally { UI.sketchCurveOptions({ slotDims: false, overall: false }); UI.setTool('select'); }
  });
  rfHWStep('rfHW: Slot PM Overall Length: the length dimension spans the arc ends (extension lines tangent to them); Modify to 3.000 makes the slot 3.000 overall, width unchanged; the script round-trips it', async function () {
    try {
      var f = await rfHWNew([{ t: 'line', x1: 0, y1: -0.5, x2: 4, y2: -0.5 }]);   // a line that sizes the view
      UI.sketchCurveOptions({ slotDims: true, overall: true });
      UI.setTool('slot'); await idle();
      rfHWSlot([1, 1], [3, 1], [2, 1.15]); await idle();
      UI.setTool('select'); await idle();
      f = UI.activeSketchFeature();
      var o = rfHWOlen(f)[0];
      assert(o && Math.abs(o.r.v - 2.3) < 1e-9 && !o.r.driven, 'driving overall length 2.300: ' + JSON.stringify(f.rels) + JSON.stringify(f.entities) + UI.cam.scale);
      // the drawn dimension: its extension lines at the arcs' far sides (x .85 and 3.15)
      var g = rfHWLayer().filter(function (x) { return x.label === '2.300'; })[0];
      assert(g, 'drawn 2.300');
      var xs = g.segs.filter(function (sg) { return Math.abs(sg[0][0] - sg[1][0]) < 0.5; }).map(function (sg) { return sg[0][0]; }).sort(function (a, b) { return a - b; });
      near(xs[0], rskScr([0.85, 1])[0], 1, 'left extension line at the arc end');
      near(xs[xs.length - 1], rskScr([3.15, 1])[0], 1, 'right extension line at the arc end');
      assert(UI.openRelDimEdit(o.i), 'Modify box');
      var inp = D.querySelector('#dim-edit input');
      inp.value = '3'; inp.dispatchEvent(new W.Event('input', { bubbles: true }));
      pressEnter(inp); await idle();
      f = UI.activeSketchFeature();
      var arcs = f.entities.filter(function (e) { return e.t === 'arc'; }), cl = f.entities.slice(1).filter(function (e) { return e.t === 'line' && e.construction; })[0];
      near(Math.hypot(cl.x2 - cl.x1, cl.y2 - cl.y1) + 2 * arcs[0].r, 3, 1e-9, 'overall 3.000');
      near(2 * arcs[0].r, 0.3, 1e-9, 'width .300 unchanged');
      near(rfHWOlen(f)[0].r.v, 3, 1e-12, 'dimension 3.000');
      await UI.exitSketch(); await idle();
      var script = anvil.script();
      await anvil.run(script); await idle();
      var sk = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0], o2 = rfHWOlen(sk)[0];
      assert(o2 && Math.abs(o2.r.v - 3) < 1e-9 && !o2.r.driven, 'round trip: ' + JSON.stringify(sk && sk.rels) + ' ' + UI.App.model.features.map(function (x) { return x.type; }));
      var a2 = sk.entities.filter(function (e) { return e.t === 'arc'; }), c2 = sk.entities.slice(1).filter(function (e) { return e.t === 'line' && e.construction; })[0];
      near(Math.hypot(c2.x2 - c2.x1, c2.y2 - c2.y1) + 2 * a2[0].r, 3, 1e-9, 'round-trip overall');
      near(2 * a2[0].r, 0.3, 1e-9, 'round-trip width');
      return 'overall 3.000, width .300, the script keeps the overall dimension';
    } finally { UI.sketchCurveOptions({ slotDims: false, overall: false }); UI.setTool('select'); }
  });
  rfHWStep('rfHW: Sketch Fillet\'s status reads the radius as the dimensions do (R.250 in), not R0.25', async function () {
    var f = await rfHWNew([{ t: 'line', x1: 0, y1: 0, x2: 2, y2: 0 }, { t: 'line', x1: 2, y1: 0, x2: 2, y2: 1 }]);
    f.rels = [{ type: 'coincident', refs: ['0.p2', '1.p1'] }];
    UI.setTool('select');
    UI.cmdSketchFillet(); UI.pmSetField('r', '.25');
    rskClick([2, 0]); await idle();
    var st = statusText();
    assert(/Fillet R\.250 in made/.test(st) && !/R0\.25/.test(st), 'status: ' + st);
    UI.pmOK(); await idle();
    await UI.exitSketch(); await idle();
    return st;
  });
