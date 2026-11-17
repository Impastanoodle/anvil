  // ---- rfNP (local-2026-11-16b, lane sketchbig): big sketches stay quick (test-reports/2026-11-16-big-sketches.md).
  // Three big INCH sketches driven by real mouse / key events: (A) a 24 x 48 plate with 1,600 holes from Linear Sketch
  // Pattern, (B) a customer DXF of 2,600 entities with its 1,100 Coincidents (Insert DXF), (C) 150 dimensioned
  // rectangles (2,400 unknowns, Fully Defined). Every action is counted in work, never milliseconds (the PC is shared):
  // solves and their unknowns, analyses and their size, redraws, inference candidates tested, DOM nodes touched.
  function rfNPScr(uv) { var s = UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])), r = $('viewport').getBoundingClientRect(); return [Math.round(r.left + s[0]), Math.round(r.top + s[1])]; }
  function rfNPEv(type, c, mods) {
    (type === 'mousedown' || type === 'wheel' ? $('viewport') : W).dispatchEvent(new W[type === 'wheel' ? 'WheelEvent' : 'MouseEvent'](type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: c[0], clientY: c[1] }, mods || {})));
  }
  async function rfNPClick(uv, mods) { var c = rfNPScr(uv); rfNPEv('mousemove', [c[0] + 3, c[1] + 2], mods); await wait(15); rfNPEv('mousemove', c, mods); await wait(15); rfNPEv('mousedown', c, mods); rfNPEv('mouseup', c, mods); await wait(25); }
  async function rfNPDrag(a, b, n, mods) {
    var A = rfNPScr(a), B = rfNPScr(b);
    rfNPEv('mousemove', A, mods); await wait(20); rfNPEv('mousedown', A, mods); await wait(20);
    for (var k = 1; k <= (n || 6); k++) { rfNPEv('mousemove', [A[0] + (B[0] - A[0]) * k / (n || 6), A[1] + (B[1] - A[1]) * k / (n || 6)], mods); await wait(20); }
    rfNPEv('mouseup', B, mods); await idle(); await wait(30);
  }
  function rfNPKey(k, mods) { var ev = new W.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {})); D.dispatchEvent(ev); return ev; }
  function rfNPF() { return UI.activeSketchFeature(); }
  function rfNPFrame(w, h, ox, oy) {
    var a = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0)), b = UI.worldToScreen(K.to3D(UI.activePlane(), 1, 0));
    UI.zoomView(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.min(UI.size.w / w, UI.size.h / h));
    var o = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0));
    UI.panView(UI.size.w * ox - o[0], UI.size.h * oy - o[1]);
    UI.updateSketches();
  }
  function rfNPLabel(re) { if (UI.drawDims) UI.drawDims(true); return Array.prototype.filter.call(D.querySelectorAll('#dim-layer text'), function (x) { return re.test(x.textContent); })[0]; }
  async function rfNPEditDim(re, value) {
    UI.setTool('select'); await wait(20);
    var t = rfNPLabel(re);
    assert(t, 'no label ' + re);
    var b = t.getBoundingClientRect(), c = [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)];
    for (var k = 0; k < 2; k++) {
      if (k) t = Array.prototype.filter.call(D.querySelectorAll('#dim-layer text'), function (x) { return x._d && x._d === t._d; })[0] || t;   // (the first click redraws the labels; the second press follows at once: 450 ms make a double-click)
      t.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: c[0], clientY: c[1] }));
      W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, clientX: c[0], clientY: c[1] }));
      if (k) await wait(40);
    }
    var inp = D.querySelector('#dim-edit input');
    assert(inp && !$('dim-edit').hidden, 'Modify box open on ' + t.textContent + ' (' + statusText() + '; ' + t.outerHTML.slice(0, 200) + '; ' + JSON.stringify(b) + ')');
    setInput(inp, value); pressEnter(inp); await idle(); await wait(40);
    if (!$('dim-edit').hidden) { rfNPKey('Escape'); await wait(20); }
  }
  async function rfNPDim(picks, place, value) {
    UI.setTool('dimension'); await wait(20);
    for (var k = 0; k < picks.length; k++) await rfNPClick(picks[k]);
    await rfNPClick(place); await wait(40);
    var inp = D.querySelector('#dim-edit input');
    assert(inp && !$('dim-edit').hidden, 'Modify box open after dimensioning ' + JSON.stringify(picks) + ' (' + statusText() + ')');
    if (value != null) { setInput(inp, value); pressEnter(inp); await idle(); await wait(40); }
    if (!$('dim-edit').hidden) { rfNPKey('Escape'); await wait(20); }
    UI.setTool('select'); await wait(20);
  }
  // the meter: solver work from SketchSolver.stats (counted inside the solver), redraws, dimension redraws, inference
  // candidates, DOM nodes added / removed / changed
  function rfNPMeter() {
    var S = W.SketchSolver, m = { redraws: 0, dims: 0, dom: 0 }, ou = UI.updateSketches, od = UI.drawDims, inf0 = 0, all0 = 0;
    UI.updateSketches = function () { m.redraws++; return ou.apply(this, arguments); };
    UI.drawDims = function () { m.dims++; return od.apply(this, arguments); };
    var mo = new W.MutationObserver(function (list) { list.forEach(function (r) { m.dom += r.type === 'childList' ? r.addedNodes.length + r.removedNodes.length : 1; }); });
    mo.observe(D.body, { childList: true, subtree: true, attributes: true, characterData: true });
    m.reset = function () { mo.takeRecords(); S.resetStats(); m.redraws = m.dims = m.dom = 0; inf0 = UI.sketchPerf.inferTested; all0 = UI.sketchPerf.inferAll; m.t0 = W.performance.now(); };
    m.read = function () {
      mo.takeRecords().forEach(function (r) { m.dom += r.type === 'childList' ? r.addedNodes.length + r.removedNodes.length : 1; });
      var s = S.stats;
      return { ms: Math.round(W.performance.now() - m.t0), solves: s.solves, unknowns: s.unknowns, analyses: s.analyses, size: s.analysisSize, hits: s.analysisHits, redraws: m.redraws, dims: m.dims, infer: UI.sketchPerf.inferTested - inf0, inferAll: UI.sketchPerf.inferAll - all0, dom: m.dom };
    };
    m.off = function () { UI.updateSketches = ou; UI.drawDims = od; mo.disconnect(); };
    return m;
  }
  // solves s / unknowns, analyses a / size + kept, redraws r, label redraws l, inference tested / of all, DOM nodes, ms
  function rfNPRow(name, r) { return name + ': s' + r.solves + '/' + r.unknowns + ' a' + r.analyses + '/' + r.size + '+' + r.hits + ' r' + r.redraws + ' l' + r.dims + ' i' + r.infer + '/' + r.inferAll + ' d' + r.dom + ' ' + r.ms + 'ms'; }
  var rfNPGrid = null;
  async function rfNPNew() {
    var du = UI.defaultUnits();
    UI.setDefaultUnits('in');
    try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
    assert(UI.App.model.units === 'in', 'an inch part');
    if (rfNPGrid == null) rfNPGrid = UI.App.view.showGrid;
    UI.App.view.showGrid = false; UI.App.gridStale = true;
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    return rfNPF();
  }
  async function rfNPEnd() {
    if (rfNPGrid != null) { UI.App.view.showGrid = rfNPGrid; rfNPGrid = null; UI.App.gridStale = true; }
    if (UI.App.mode === 'sketch') { UI.setTool('select'); if (UI.closePM) UI.closePM(); if (UI.cancelSketch) UI.cancelSketch(); await idle(); }
  }
  // Every action of the brief on the open sketch; spec gives the places. Returns the rows; each is { name, ...counts }.
  async function rfNPActions(spec, log, part) {
    var m = rfNPMeter(), rows = [], tStart = W.performance.now();
    async function act(name, fn) {
      if (W.performance.now() - tStart > 24000) throw new Error('over 24 s before ' + name);
      m.reset();
      await fn(); await idle();
      var r = m.read(); r.name = name; rows.push(r); log.push(rfNPRow(name, r));
      return r;
    }
    // a headless frame of a 2,000-entity sketch takes most of a second (software GL), so the actions run in three parts,
    // each on a freshly built sketch: 1 open .. drag, 2 dimensions .. delete, 3 undo / redo .. the feature
    async function drawLine(a, b, moves) {
      UI.setTool('line'); await wait(20);
      await rfNPClick(a);
      var A = rfNPScr(a), B = rfNPScr(b);
      for (var k = 1; k <= moves; k++) { rfNPEv('mousemove', [A[0] + (B[0] - A[0]) * k / moves, A[1] + (B[1] - A[1]) * k / moves], { buttons: 0 }); await wait(15); }
      await rfNPClick(b); rfNPKey('Escape'); await wait(20); rfNPKey('Escape'); await wait(20);
      UI.setTool('select'); await wait(20);
    }
    function frame(fr) { rfNPFrame(fr[0], fr[1], fr[2], fr[3]); }
    try {
      var f = rfNPF(), id = f.id;
      UI.setTool('select'); await wait(20);
      if (part === 1) {
        await act('exit + open the sketch', async function () { UI.exitSketch(); await idle(); UI.enterSketch(id); await idle(); frame(spec.frame); });
        await act('zoom (3 wheel steps)', async function () { var c = rfNPScr(spec.hover); for (var k = 0; k < 3; k++) { rfNPEv('wheel', c, { deltaY: k < 2 ? -100 : 100 }); await wait(30); } });
        frame(spec.frame);
        await act('pan (Ctrl + middle drag)', async function () { var c = rfNPScr(spec.hover); rfNPEv('mousedown', c, { button: 1, buttons: 4, ctrlKey: true }); for (var k = 1; k <= 4; k++) { rfNPEv('mousemove', [c[0] + 10 * k, c[1] + 5 * k], { button: 1, buttons: 4, ctrlKey: true }); await wait(20); } rfNPEv('mouseup', [c[0] + 40, c[1] + 20], { button: 1, buttons: 0, ctrlKey: true }); await wait(20); });
        frame(spec.frame);
        await act('hover (8 moves)', async function () { var c = rfNPScr(spec.hover); for (var k = 0; k < 8; k++) { rfNPEv('mousemove', [c[0] + k, c[1]], { buttons: 0 }); await wait(15); } });
        await act('click-select', async function () { await rfNPClick(spec.hover); });
        assert(UI.selection().length === 1, 'a click selects one item at ' + JSON.stringify(spec.hover) + ': ' + JSON.stringify(UI.selection()));
        await act('add a relation (' + spec.rel + ')', async function () { UI.cmdAddRelations(); await idle(); clickPmButton(spec.rel); await idle(); if (UI.pmOK) await UI.pmOK(); await idle(); });
        rfNPKey('Escape'); await wait(20);
        await act('box-select', async function () { await rfNPDrag(spec.box[0], spec.box[1], 4); });
        assert(UI.selection().length >= 1, 'the box selects something');
        rfNPKey('Escape'); await wait(20);
        await act('drag one entity', async function () { await rfNPDrag(spec.drag[0], spec.drag[1], 4); });
      } else if (part === 2) {
        frame(spec.dimFrame || spec.frame);
        if (spec.dim) await act('edit a dimension', async function () { await rfNPEditDim(spec.dim[0], spec.dim[1]); });
        frame(spec.frame);
        await act('add a dimension', async function () { await rfNPDim(spec.newDim[0], spec.newDim[1], spec.newDim[2]); });
        var n0 = rfNPF().entities.length;
        await act('draw a line (inference on, 6 moves)', async function () { await drawLine(spec.line[0], spec.line[1], 6); });
        assert(rfNPF().entities.length === n0 + 1, 'one line drawn: ' + (rfNPF().entities.length - n0));
        await act('box-select + delete', async function () { await rfNPDrag(spec.del[0], spec.del[1], 4); rfNPKey('Delete'); await idle(); });
        var nDel = n0 + 1 - rfNPF().entities.length;
        log.push('deleted ' + nDel + ' entities');
        assert(nDel >= spec.delMin, 'the window deletes at least ' + spec.delMin + ': ' + nDel);
      } else {
        frame(spec.frame);
        await drawLine(spec.line[0], spec.line[1], 1);
        var n1 = rfNPF().entities.length;
        await act('undo + redo', async function () { rfNPKey('z', { ctrlKey: true }); await idle(); rfNPKey('y', { ctrlKey: true }); await idle(); });
        assert(rfNPF().entities.length === n1, 'undo + redo: the same entities');
        await act('trim one entity', async function () { UI.cmdTrimEntities(); await idle(); await rfNPClick(spec.trim); await idle(); if (UI.pmOK) await UI.pmOK(); await idle(); UI.setTool('select'); });
        assert(rfNPF().entities.length === n1 - 1, 'the trimmed line is gone: ' + (n1 - rfNPF().entities.length));
        if (spec.fully) await act('Fully Define Sketch', async function () { UI.cmdFullyDefineSketch(); await idle(); clickPmButton('Calculate'); await idle(); await UI.pmOK(); await idle(); });
        if (spec.build === false) { await act('exit the sketch', async function () { UI.exitSketch(); await idle(); }); return rows; }
        await act('exit + ' + (spec.flange ? 'Base Flange' : 'Boss-Extrude'), async function () {
          UI.exitSketch(); await idle();
          UI.App.sel = { kind: 'feature', id: id };
          if (spec.flange) { UI.cmdBaseFlange(); await idle(); } else { UI.cmdExtrude(); await wait(40); setInput(pmNumber(0), '0.125'); await wait(20); }
          await UI.pmOK(); await idle();
        });
        var s = anvil.summary();
        assert(!Object.keys(s.errors || {}).length, 'built without errors: ' + JSON.stringify(s.errors));
      }
    } finally { m.off(); }
    return rows;
  }
  // the targets: a hover, a zoom, a pan, a box select: no solve, no analysis; every other action at most one solve of
  // the part it changes and one analysis (Fully Define and the feature build excepted)
  function rfNPCheck(rows) {
    rows.forEach(function (r) {
      if (/^(zoom|pan|hover|box-select$|click-select)/.test(r.name)) assert(r.solves === 0 && r.analyses === 0, r.name + ' solves / analyses nothing: ' + rfNPRow(r.name, r));
      // (Smart Dimension asks whether the new dimension over-defines: the sketch with it driven, then driving)
      else if (!/Fully Define|exit|undo/.test(r.name)) assert(r.analyses <= (/add a dimension/.test(r.name) ? 3 : 2), r.name + ': at most two analyses (three for a new dimension): ' + rfNPRow(r.name, r));
      if (/^(zoom|pan|hover)/.test(r.name)) assert(r.redraws === 0, r.name + ' redraws no geometry: ' + rfNPRow(r.name, r));
      if (!/exit|undo|delete|open/.test(r.name)) assert(r.solves <= 3, r.name + ': a few solves of its piece at most: ' + rfNPRow(r.name, r));
    });
  }

  // (A) the plate drawn and its hole dimensioned by mouse, then Linear Sketch Pattern 40 x 40 with both spacings
  async function rfNPBuildA() {
    var f = await rfNPNew(), S = W.SketchSolver;
    rfNPFrame(54, 30, 0.04, 0.9);
    UI.setTool('rect'); await wait(20); await rfNPClick([0, 0]); await rfNPClick([48, 24]); rfNPKey('Escape'); await wait(20); rfNPKey('Escape'); await wait(20);
    rfNPFrame(10, 6.5, 0.08, 0.72); await wait(20);
    UI.setTool('circle'); await wait(20); await rfNPClick([1, 1]); await rfNPClick([1.6, 1]); rfNPKey('Escape'); await wait(20);
    assert(f.entities.length === 5 && f.entities[4].t === 'circle', 'plate and hole: ' + f.entities.map(function (e) { return e.t; }));
    await rfNPDim([[1.6, 1]], [3, 3], '1/4');
    UI.pushUndo();
    var r = S.linearPattern(f, [4], { angle1: 0, spacing1: 1.15, count1: 40, angle2: 90, spacing2: 0.55, count2: 40, dimX: true, dimY: true });
    assert(r.ok, r.error);
    UI.App.sketchDirty = true; UI.updateSketches(); await idle();
    assert(f.entities.filter(function (e) { return e.t === 'circle'; }).length === 1600, '1,600 holes');
    return f;
  }
  var rfNPSpecA = { frame: [54, 30, 0.04, 0.9], hover: [24.3, 24], rel: 'Fix', box: [[46.5, -1], [49, 25]], drag: [[0, 12], [-0.6, 12]],
    dim: [/^1\.150$/, '1.125'], dimFrame: [10, 6.5, 0.08, 0.72], newDim: [[[24, 0]], [24, -2], '48'], line: [[50, 2], [50, 20]], del: [[30.325, -1], [36.1, 6.225]], delMin: 50, trim: [50, 10], flange: true, build: false };
  // (B) a customer DXF (as kernel rfNP: a 60 x 30 outline of 296 lines and 4 arcs, 1,500 holes, 200 slots of 2 lines and
  // 2 arcs) through Insert DXF with Add Coincident relations checked (1,100 of them)
  function rfNPDxfText() {
    var out = ['0', 'SECTION', '2', 'ENTITIES'], Wd = 60, H = 30, n = 74, rr = 1, i;
    function line(a, b) { out.push('0', 'LINE', '8', '0', '10', a[0], '20', a[1], '30', 0, '11', b[0], '21', b[1], '31', 0); }
    function arc(c, r, a0, a1) { out.push('0', 'ARC', '8', '0', '10', c[0], '20', c[1], '30', 0, '40', r, '50', a0, '51', a1); }
    function side(p, q) { for (var k = 0; k < n; k++) line([p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n], [p[0] + (q[0] - p[0]) * (k + 1) / n, p[1] + (q[1] - p[1]) * (k + 1) / n]); }
    side([rr, 0], [Wd - rr, 0]); arc([Wd - rr, rr], rr, 270, 360);
    side([Wd, rr], [Wd, H - rr]); arc([Wd - rr, H - rr], rr, 0, 90);
    side([Wd - rr, H], [rr, H]); arc([rr, H - rr], rr, 90, 180);
    side([0, H - rr], [0, rr]); arc([rr, rr], rr, 180, 270);
    for (i = 0; i < 1500; i++) out.push('0', 'CIRCLE', '8', '0', '10', 3 + (i % 50) * 1.08, '20', 3 + Math.floor(i / 50) * 0.6, '30', 0, '40', 0.1);
    for (i = 0; i < 200; i++) { var x = 3 + (i % 40) * 1.35, y = 22 + Math.floor(i / 40) * 1.2, L = 0.6, r = 0.15; line([x, y - r], [x + L, y - r]); arc([x + L, y], r, 270, 90); line([x + L, y + r], [x, y + r]); arc([x, y], r, 90, 270); }
    out.push('0', 'ENDSEC', '0', 'EOF');
    return out.join('\n');
  }
  async function rfNPBuildB() {
    var f = await rfNPNew();
    UI.importDXFText(rfNPDxfText(), { name: 'customer.dxf', repair: false, tol: 0, ok: true, blocks: false, relations: true }); await idle();
    f = rfNPF();
    assert(f && f.entities.length === 2600 && (f.rels || []).length === 1100, 'the DXF in the sketch: ' + (f && f.entities.length) + ' entities, ' + (f && (f.rels || []).length) + ' relations');
    return f;
  }
  // holes at (3 + 1.08 i, 3 + 0.6 j); slots from y 22; the outline's bottom edge is 74 lines from x 1 to 59
  var rfNPSpecB = { frame: [66, 34, 0.04, 0.92], hover: [30.2, 0], rel: 'Fix', box: [[56.5, 2.4], [61, 12.2]], drag: [[0, 15], [-0.4, 15.3]],
    dim: null, newDim: [[[3.1, 3]], [2, 1.5], '0.25'], line: [[62, 2], [62, 26]], del: [[-1, -1], [8, 6.7]], delMin: 45, trim: [62, 14], flange: false, build: false };
  // (C) 150 rectangles of 4 lines with their Coincident / Horizontal / Vertical, width and height, each placed by two
  // distances from its neighbour (2,400 unknowns, Fully Defined), put into the sketch as one undo step
  async function rfNPBuildC() {
    var f = await rfNPNew(), E = [], R = [], D = [];
    for (var q = 0; q < 150; q++) {
      var x = (q % 15) * 3, y = Math.floor(q / 15) * 2, w = 2, h = 1.2, b = E.length, k;
      E.push({ t: 'line', x1: x, y1: y, x2: x + w, y2: y }, { t: 'line', x1: x + w, y1: y, x2: x + w, y2: y + h }, { t: 'line', x1: x + w, y1: y + h, x2: x, y2: y + h }, { t: 'line', x1: x, y1: y + h, x2: x, y2: y });
      for (k = 0; k < 4; k++) R.push({ type: 'coincident', refs: [(b + k) + '.p2', (b + (k + 1) % 4) + '.p1'] });
      R.push({ type: 'horizontal', refs: [String(b)] }, { type: 'horizontal', refs: [String(b + 2)] }, { type: 'vertical', refs: [String(b + 1)] }, { type: 'vertical', refs: [String(b + 3)] });
      D.push({ e: b, k: 'len' });
      if (q < 149) D.push({ e: b + 1, k: 'len' });   // (the last height is left free: Add Relations / Smart Dimension define it)
      if (!q) R.push({ type: 'coincident', refs: ['O', b + '.p1'] });
      else if (q % 15) R.push({ type: 'distance', refs: [(b - 4) + '.p1', b + '.p1'], v: 3, dir: 'h' }, { type: 'distance', refs: [(b - 4) + '.p1', b + '.p1'], v: 0, dir: 'v' });
      else R.push({ type: 'distance', refs: [(b - 60) + '.p1', b + '.p1'], v: 2, dir: 'v' }, { type: 'distance', refs: [(b - 60) + '.p1', b + '.p1'], v: 0, dir: 'h' });
    }
    UI.pushUndo();
    f.entities = E; f.rels = R; f.dims = D;
    UI.App.sketchDirty = true; UI.updateSketches(); await idle();
    assert(UI.sketchStatus().status === 'under', 'one height free: ' + JSON.stringify(UI.sketchStatus()));
    return f;
  }
  // rectangle q at ((q % 15) 3, floor(q / 15) 2), 2 x 1.2
  var rfNPSpecC = { frame: [48, 22, 0.03, 0.95], hover: [44, 18.6], rel: 'Fix', box: [[41.5, 17.5], [44.5, 19.5]], drag: [[9, 0.6], [9.3, 0.9]],
    dim: [/^3(\.000)?$/, '3.25'], newDim: [[[44, 18.6]], [45.5, 18.6], '1.2'], line: [[46, 1], [46, 17]], del: [[-0.5, 13.5], [44.5, 15.5]], delMin: 50, trim: [46, 9], flange: false, fully: false };
  [['A', '1,600 holes', rfNPBuildA, rfNPSpecA], ['B', 'a 2,600-entity customer DXF', rfNPBuildB, rfNPSpecB], ['C', '150 dimensioned rectangles', rfNPBuildC, rfNPSpecC]].forEach(function (k) {
    [[1, 'open, zoom, pan, hover, click-select, a relation, box select, drag one entity'], [2, 'edit a dimension, add a dimension, a line with inference, box select and delete'], [3, 'undo / redo, trim, exit and build the feature']].forEach(function (p) {
      step('rfNP (' + k[0] + ' ' + p[0] + '/3): ' + k[1] + ': ' + p[1] + ': each action counted (solves, analyses, redraws, inference tests, DOM nodes)', async function () {
        var log = [];
        try {
          await k[2]();
          var spec = k[3];
          if (p[0] === 2 && !spec.dim) spec = Object.assign({}, spec, { dim: null });
          rfNPCheck(await rfNPActions(spec, log, p[0]));
        } catch (e) { throw new Error(e.message + ' || ' + log.join(' | ')); } finally { await rfNPEnd(); }
        return log.join(' | ');
      });
    });
  });