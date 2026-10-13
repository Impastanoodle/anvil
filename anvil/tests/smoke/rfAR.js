  // ---- rfAR (2026-10-13): Sketch Settings, Quick Snaps, SketchXpert, Scan Equal
  async function rfARNew(ents, rels, dims) {
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    var f = UI.activeSketchFeature();
    ents.forEach(function (e) { f.entities.push(e); });
    if (rels) f.rels = rels;
    if (dims) f.dims = dims;
    UI.updateSketches(); await wait(20);
    return f;
  }
  function rfARScr(u, v) { return UI.worldToScreen(K.to3D(UI.activePlane(), u, v)); }
  function rfAREv(type, p, target, button) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: button || 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfARClick(u, v) { var p = rfARScr(u, v); rfAREv('mousemove', p); rfAREv('mousedown', p, $('viewport')); rfAREv('mouseup', p); }
  function rfARMenu(label) { var li = Array.prototype.filter.call(D.querySelectorAll('#menus > li'), function (l) { return l.textContent === label; })[0]; li.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, view: W, detail: 1, button: 0 })); return li; }
  function rfARRow(re) { return Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return re.test(m.textContent); })[0]; }
  function rfARPmButton(label) { return Array.prototype.filter.call(D.querySelectorAll('#pm .pm-btns button'), function (b) { return b.textContent === label; })[0]; }
  async function rfARDrag(fromUV, toUV) {
    var a = rfARScr(fromUV[0], fromUV[1]), b = rfARScr(toUV[0], toUV[1]), h = UI.sketchDragHook(a, { shiftKey: false });
    assert(h, 'nothing to drag at ' + fromUV);
    h.start();
    for (var k = 1; k <= 4; k++) h.move([a[0] + (b[0] - a[0]) * k / 4, a[1] + (b[1] - a[1]) * k / 4]);
    h.end(b); await idle();
  }
  step('rfAR: Tools ▸ Sketch Settings — six checkable settings, kept per browser; Automatic Relations off draws a Line chain with only its shared ends (no Horizontal / Vertical, no origin); Enable Snapping off lands beside an end point', async function () {
    try {
      var f = await rfARNew([]);
      rfARMenu('Tools');
      ['Automatic Relations', 'Automatic Solve', 'No Solve Move', 'Enable Snapping', 'Detach Segment on Drag', 'Override Dims on Drag/Move'].forEach(function (n) {
        assert(rfARRow(new RegExp('Sketch Settings ▸ ' + n.replace('/', '\\/'))), 'Tools lacks ' + n);
      });
      var ar = rfARRow(/Sketch Settings ▸ Automatic Relations/);
      assert(ar.querySelector('.chk').textContent === '✓', 'on by default');
      ar.click(); await idle();
      assert(UI.sketchSettings.get('autoRelations') === false, 'turned off');
      var stored = JSON.parse(W.localStorage.getItem('anvil.sketchSettings') || '{}');
      assert(stored.autoRelations === false, 'kept: ' + JSON.stringify(stored));
      UI.setTool('line');
      rfARClick(0, 0); rfARClick(30, 0); rfARClick(30, 20); await idle();
      UI.setTool('select'); await idle();
      f = UI.activeSketchFeature();
      var types = (f.rels || []).map(function (r) { return r.type + ' ' + r.refs.join('/'); });
      assert(f.entities.length === 2 && types.length === 1 && /^coincident 0\.p2\/1\.p1$/.test(types[0]), 'relations: ' + types.join(', '));
      UI.sketchSettings.set('autoRelations', true);
      UI.setTool('line');
      rfARClick(0, 40); rfARClick(30, 40); rfARClick(30, 60); await idle();
      UI.setTool('select'); await idle();
      var types2 = (UI.activeSketchFeature().rels || []).map(function (r) { return r.type; });
      assert(types2.indexOf('horizontal') >= 0 && types2.indexOf('vertical') >= 0, 'on again infers H / V: ' + types2.join(', '));
      // Enable Snapping: 3 px off the end point snaps to it; with snapping off it stays where the cursor is
      UI.setTool('line');
      var s = rfARScr(30, 0), raw = UI.screenToPlane(s[0] + 3, s[1], UI.activePlane());
      var on = UI.sketchInferPoint(raw);
      assert(on.snap && Math.abs(on.p[0] - 30) < 1e-9 && Math.abs(on.p[1]) < 1e-9, 'snaps: ' + JSON.stringify(on.p));
      UI.sketchSettings.set('snapping', false);
      var off = UI.sketchInferPoint(raw);
      assert(!off.snap && Math.abs(off.p[0] - 30) > 1e-6, 'snapping off: ' + JSON.stringify(off.p));
      UI.setTool('select');
      await UI.exitSketch(); await idle();
      return types.length + ' relation with Automatic Relations off, ' + types2.length + ' on';
    } finally { UI.sketchSettings.reset(); if (UI.closeMenus) UI.closeMenus(); }
  });
  step('rfAR: Quick Snaps — the Sketch tab flyout lists 14 snaps; Midpoint puts the next point on a line\'s middle and then reverts; Tangent from the right-click chain menu ends the line tangent to a circle', async function () {
    try {
      var f = await rfARNew([{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'circle', cx: 60, cy: 30, r: 10 }]);
      UI.setRibbonTab('Sketch'); await idle();
      var fly = Array.prototype.filter.call(D.querySelectorAll('.rb-fly'), function (w) { return w._fly && w._fly.fly === 'quickSnaps'; })[0];
      assert(fly, 'Quick Snaps flyout on the Sketch tab');
      UI.setTool('line'); await idle();
      fly.querySelector('.rb-caret').dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true }));
      fly.querySelector('.rb-caret').click(); await idle();
      var rows = Array.prototype.slice.call(D.querySelectorAll('body > .menu .mi')).map(function (r) { return r.textContent; });
      assert(rows.filter(function (r) { return / Snap$/.test(r); }).length === 14, 'snaps: ' + rows.join(' | '));
      rfARRow(/^Midpoint Snap$/).click(); await idle();
      UI.ribbonFlyFace('quickSnaps', 0);
      assert(UI.quickSnap() === 'midpoint' && UI.App.tool === 'line', 'midpoint on: ' + UI.quickSnap());
      rfARClick(8, 0.4); await idle();
      var p0 = UI.App.toolState.pts[0];
      assert(p0 && Math.abs(p0[0] - 20) < 1e-9 && Math.abs(p0[1]) < 1e-9, 'first point at the midpoint: ' + JSON.stringify(p0));
      assert(UI.quickSnap() === null, 'one pick only');
      // right-click chain menu ▸ Quick Snaps ▸ Tangent
      var c = rfARScr(52, 30);
      assert(UI.chainMenu(c[0], c[1]), 'chain menu');
      rfARRow(/Quick Snaps ▸ Tangent$/).click(); await idle();
      assert(UI.quickSnap() === 'tangent', 'tangent on');
      var q = rfARScr(52, 36);   // near the circle's left side
      var raw = UI.screenToPlane(q[0], q[1], UI.activePlane()), info = UI.sketchInferPoint(raw);
      var P = info.p, d = Math.hypot(P[0] - 60, P[1] - 30), dot = (P[0] - 20) * (P[0] - 60) + (P[1] - 0) * (P[1] - 30);
      assert(Math.abs(d - 10) < 1e-9 && Math.abs(dot) < 1e-6, 'tangent point ' + JSON.stringify(P) + ' d ' + d + ' dot ' + dot);
      rfARClick(52, 36); await idle();
      f = UI.activeSketchFeature();
      var L = f.entities[f.entities.length - 1];
      assert(L.t === 'line' && Math.abs(Math.hypot(L.x2 - 60, L.y2 - 30) - 10) < 1e-6, 'line ends on the circle: ' + JSON.stringify(L));
      assert(UI.quickSnap() === null, 'reverted');
      UI.setTool('select');
      await UI.exitSketch(); await idle();
      return 'midpoint ' + JSON.stringify(p0) + ', tangent ' + JSON.stringify([+P[0].toFixed(3), +P[1].toFixed(3)]);
    } finally { if (UI.closeMenus) UI.closeMenus(); UI.App.quickSnap = null; }
  });
  step('rfAR: drags — Detach Segment on Drag pulls a line off its neighbour (Coincident gone); No Solve Move leaves a Horizontal line tilted (not solved); Override Dims on Drag stretches a dimensioned line and the dimension reads the new length', async function () {
    try {
      var f = await rfARNew([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }, { t: 'line', x1: 20, y1: 0, x2: 20, y2: 15 }], [{ type: 'coincident', refs: ['0.p2', '1.p1'] }]);
      UI.setTool('select'); await idle();
      UI.sketchSettings.set('detachOnDrag', true);
      await rfARDrag([20, 4], [30, 4]);
      f = UI.activeSketchFeature();
      assert(!(f.rels || []).some(function (r) { return r.type === 'coincident'; }), 'coincident removed: ' + JSON.stringify(f.rels));
      assert(Math.abs(f.entities[0].x2 - 20) < 1e-9 && f.entities[1].x1 > 25, 'detached: ' + JSON.stringify(f.entities));
      UI.sketchSettings.set('detachOnDrag', false);
      await UI.exitSketch(); await idle();
      // No Solve Move
      f = await rfARNew([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }], [{ type: 'horizontal', refs: ['0'] }]);
      UI.setTool('select'); await idle();
      UI.sketchSettings.set('noSolveMove', true);
      await rfARDrag([20, 0], [20, 6]);
      f = UI.activeSketchFeature();
      assert(Math.abs(f.entities[0].y2 - 6) < 0.5 && Math.abs(f.entities[0].y1) < 1e-9, 'end moved alone: ' + JSON.stringify(f.entities[0]));
      assert(W.SketchSolver.analyze(f).conflicts === 1, 'the Horizontal is left unsolved');
      UI.sketchSettings.set('noSolveMove', false);
      await UI.exitSketch(); await idle();
      // Override Dims on Drag/Move
      f = await rfARNew([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }], [{ type: 'horizontal', refs: ['0'] }, { type: 'coincident', refs: ['0.p1', 'O'] }], [{ e: 0, k: 'len', off: 3 }]);
      UI.setTool('select'); await idle();
      await rfARDrag([20, 0], [30, 0]);
      f = UI.activeSketchFeature();
      assert(Math.abs(f.entities[0].x2 - 20) < 1e-6, 'held by its dimension: ' + f.entities[0].x2);
      UI.sketchSettings.set('overrideDims', true);
      await rfARDrag([20, 0], [30, 0]);
      f = UI.activeSketchFeature();
      var len = K.dimValue(f.entities[0], f.dims[0]);
      assert(Math.abs(len - 30) < 0.5 && !f.dims[0].driven, 'stretched, dimension driving at ' + len);
      assert(W.SketchSolver.analyze(f).status === 'full', 'still fully defined');
      await UI.exitSketch(); await idle();
      return 'detached, unsolved, ' + len.toFixed(3);
    } finally { UI.sketchSettings.reset(); }
  });
  step('rfAR: SketchXpert — Diagnose Equal between lines dimensioned 10 and 20: three solutions, ▶ steps to the next, Accept deletes it and the sketch solves; Manual Repair deletes one by one; Make Dimension Driven? offers SketchXpert', async function () {
    var f = await rfARNew([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 0, y1: 5, x2: 20, y2: 5 }], [{ type: 'equal', refs: ['0', '1'] }], [{ e: 0, k: 'len', off: 2 }, { e: 1, k: 'len', off: 2 }]);
    rfARMenu('Tools');
    var row = rfARRow(/Sketch Tools ▸ SketchXpert/);
    assert(row && !row.classList.contains('disabled'), 'Tools ▸ Sketch Tools ▸ SketchXpert');
    row.click(); await idle();
    assert(UI.pmTitle() === 'SketchXpert', 'PM ' + UI.pmTitle());
    var st = UI.sketchXpertState();
    assert(st.mode === 'diagnose' && st.solutions === 3, 'diagnosis ' + JSON.stringify(st));
    var first = st.names.join();
    rfARPmButton('▶').click(); await idle();
    st = UI.sketchXpertState();
    assert(st.solution === 1 && st.names.join() !== first, 'second solution ' + JSON.stringify(st));
    var gone = st.names[0];
    rfARPmButton('Accept').click(); await idle();
    f = UI.activeSketchFeature();
    assert((f.rels || []).length + (f.dims || []).length === 2 && W.SketchSolver.analyze(f).status !== 'over', 'repaired: ' + JSON.stringify([f.rels, f.dims]));
    UI.pmCancel(); await idle();
    await UI.exitSketch(); await idle();
    // Manual Repair: a line dimensioned twice
    f = await rfARNew([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }], null, [{ e: 0, k: 'len', off: 3 }, { e: 0, k: 'len', off: 6 }]);
    UI.cmdSketchXpert(); await idle();
    rfARPmButton('Manual Repair').click(); await idle();
    var dels = D.querySelectorAll('#xp-manual .xp-del');
    assert(dels.length === 2, 'two conflicting items: ' + dels.length);
    dels[0].click(); await idle();
    assert(UI.activeSketchFeature().dims.length === 1 && W.SketchSolver.analyze(UI.activeSketchFeature()).status !== 'over', 'deleted one');
    UI.pmCancel(); await idle();
    await UI.exitSketch(); await idle();
    // an over-defining dimension: the question offers SketchXpert
    f = await rfARNew([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }], null, [{ e: 0, k: 'len', off: 3 }, { e: 0, k: 'len', off: 6 }]);
    assert(UI.askDrivenIfOver(f, 'dim', 1), 'asked');
    clickModalButton('SketchXpert…'); await idle();
    assert(UI.pmTitle() === 'SketchXpert' && UI.sketchXpertState().solutions >= 2, 'SketchXpert from the question: ' + JSON.stringify(UI.sketchXpertState()));
    UI.pmCancel(); await idle();
    await UI.exitSketch(); await idle();
    return 'deleted ' + gone;
  });
  step('rfAR: Tools ▸ Relations ▸ Scan Equal — two lines 10 and 10.005 and two R3 circles found at 0.01; with only the lines checked, Set Equal ties them', async function () {
    var f = await rfARNew([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 0, y1: 5, x2: 10.005, y2: 5 }, { t: 'line', x1: 0, y1: 10, x2: 15, y2: 10 },
      { t: 'circle', cx: 30, cy: 0, r: 3 }, { t: 'circle', cx: 40, cy: 0, r: 3 }]);
    rfARMenu('Tools');
    rfARRow(/Relations ▸ Scan Equal/).click(); await idle();
    assert(UI.pmTitle() === 'Scan Equal', 'PM ' + UI.pmTitle());
    var tol = D.querySelector('#pm input[data-key="tol"]');
    assert(tol, 'tolerance box');
    tol.value = '0.01'; tol.dispatchEvent(new W.Event('input', { bubbles: true })); tol.dispatchEvent(new W.Event('change', { bubbles: true }));
    rfARPmButton('Find').click(); await idle();
    var boxes = D.querySelectorAll('#scan-equal input[type=checkbox]');
    assert(boxes.length === 2, 'two sets: ' + boxes.length);
    boxes[1].click();
    rfARPmButton('Set Equal').click(); await idle();
    f = UI.activeSketchFeature();
    var eq = (f.rels || []).filter(function (r) { return r.type === 'equal'; });
    assert(eq.length === 1 && eq[0].refs.join() === '0,1', 'equal: ' + JSON.stringify(f.rels));
    assert(Math.abs((f.entities[1].x2 - f.entities[1].x1) - (f.entities[0].x2 - f.entities[0].x1)) < 1e-7, 'equal lengths');
    await UI.pmOK(); await idle();
    await UI.exitSketch(); await idle();
    return eq.length + ' Equal';
  });
  // --- end rfAR ---
