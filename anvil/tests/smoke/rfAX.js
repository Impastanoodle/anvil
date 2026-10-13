  // ---- rfAX (2026-10-13): sweep of the old sketch follow-ups — Sketch Fillet on a box-selected rectangle / contour
  // (every corner at one R), a fillet whose line misses the spline (the spline is carried on, as SolidWorks)
  function rfAXSel() { return anvil.selection().map(function (s) { return s.kind + ':' + s.index; }).join(' '); }
  function rfAXArcs() { return UI.activeSketchFeature().entities.filter(function (e) { return e.t === 'arc'; }); }
  async function rfAXNew() { await rskNew(); UI.App.view.showGrid = false; anvil.selectionFilter({ faces: false, edges: false, vertices: false, bodies: false, components: false, sketch: false, suspended: false }); }
  step('rfAX: Sketch Fillet with a box-selected rectangle rounds all four corners (rfAZ: previewed, made on ✓: R 10, one R dimension, 3 Equal, one undo step); a script rectangle selected and ✗ leaves it as it was; a box over a closed triangle of lines too; with nothing selected it waits for picks', async function () {
    await rfAXNew();
    UI.setTool('rect'); rskClick([0, 0]); rskClick([60, 40]); UI.setTool('select'); await wait(20);
    var f = UI.activeSketchFeature(), lines0 = JSON.stringify(f.entities);
    assert(rfAXSel() === '', 'nothing selected after drawing: ' + rfAXSel());
    assert(f.entities.length === 4 && f.entities.every(function (e) { return e.t === 'line'; }), 'a rectangle of four lines: ' + lines0);
    await selDrag(rskScr([-6, -6]), rskScr([66, 46]));
    assert(rfAXSel() === 'entity:0 entity:1 entity:2 entity:3', 'the window box selects the four lines: ' + rfAXSel());
    var undo0 = UI.App.undo.length;
    UI.cmdSketchFillet(); await wait(20);
    f = UI.activeSketchFeature();
    assert(UI.pmTitle() === 'Sketch Fillet' && !rfAXArcs().length && UI.App.tempEntities.filter(function (a) { return a.t === 'arc' && Math.abs(a.r - 10) < 1e-9; }).length === 4 && D.querySelectorAll('#pm .pm-list .pm-item').length === 4, 'four R10 fillets previewed, four corners listed: ' + JSON.stringify(UI.App.tempEntities));
    await UI.pmOK(); await wait(20);
    var arcs = rfAXArcs();
    f = UI.activeSketchFeature();
    assert(!UI.hasPM() && arcs.length === 4 && arcs.every(function (a) { return Math.abs(a.r - 10) < 1e-9; }), 'four R10 fillets on ✓: ' + JSON.stringify(f.entities));
    assert((f.dims || []).filter(function (d) { return d.k === 'r'; }).length === 1 && stToolRels().filter(function (r) { return /^equal:/.test(r); }).length === 3, 'one R dimension and 3 Equal: ' + stToolRels().join(' '));
    stNoRedundant('rectangle fillets');
    assert(UI.App.undo.length === undo0 + 1, 'one undo step: ' + (UI.App.undo.length - undo0));
    UI.undo(); await idle();
    f = UI.activeSketchFeature();
    assert(JSON.stringify(f.entities) === lines0 && !rfAXArcs().length, 'undo puts the rectangle back: ' + JSON.stringify(f.entities));
    // a rectangle entity (a script's), selected by a click on its side: made into lines and every corner rounded
    await rfAXNew();
    fxSk([{ t: 'rect', x: 0, y: 0, w: 60, h: 40 }]);
    UI.setTool('select');
    rskClick([30, 0]); await wait(20);
    assert(rfAXSel() === 'entity:0', 'the rectangle selected: ' + rfAXSel());
    var rect0 = JSON.stringify(UI.activeSketchFeature().entities);
    UI.cmdSketchFillet(); await wait(20);
    assert(UI.App.tempEntities.filter(function (a) { return a.t === 'arc'; }).length === 4 && UI.activeSketchFeature().entities.length === 1 && UI.activeSketchFeature().entities[0].t === 'rect', 'four corners previewed, the rectangle untouched: ' + JSON.stringify(UI.activeSketchFeature().entities));
    UI.pmCancel(); await wait(20);
    assert(JSON.stringify(UI.activeSketchFeature().entities) === rect0 && !UI.App.tempEntities.length, '✗: the rectangle entity as it was');
    // a closed triangle of three lines (Coincident ends), boxed: three corners
    await rfAXNew();
    fxSk([{ t: 'line', x1: 0, y1: 0, x2: 60, y2: 0 }, { t: 'line', x1: 60, y1: 0, x2: 30, y2: 40 }, { t: 'line', x1: 30, y1: 40, x2: 0, y2: 0 }],
      [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'coincident', refs: ['2.p2', '0.p1'] }]);
    UI.setTool('select');
    await selDrag(rskScr([-6, -6]), rskScr([66, 46]));
    assert(rfAXSel() === 'entity:0 entity:1 entity:2', 'the box takes the three lines: ' + rfAXSel());
    UI.cmdSketchFillet(); await wait(20);
    assert(UI.App.tempEntities.length === 3 && !rfAXArcs().length, 'three corners previewed: ' + JSON.stringify(UI.App.tempEntities));
    UI.pmOK(); await wait(20);
    assert(!UI.hasPM() && rfAXArcs().length === 3, '✓ keeps them');
    // nothing selected: the PM waits for a vertex or two picks
    if (UI.setSelection) UI.setSelection([]);
    UI.App.sel = null;
    UI.cmdSketchFillet(); await wait(20);
    assert(rfAXArcs().length === 3 && UI.pmTitle() === 'Sketch Fillet', 'nothing made with nothing selected');
    UI.pmCancel();
    return '4 + 3 corners';
  });
  step('rfAX: Sketch Fillet between a line and a spline the line\'s extension misses — two clicks with R 2 carry the spline back past its first point to the fillet and run the line to it (SolidWorks fillets it; it used to be refused)', async function () {
    await rfAXNew();
    fxSk([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'spline', pts: [[15, 3], [20, 6], [25, 12]] }]);
    UI.setTool('select');
    if (UI.setSelection) UI.setSelection([]);
    UI.App.sel = null;
    var onSp = W.SketchSolver.freeCurve(UI.activeSketchFeature().entities[1]).pt(1.5), undo0 = UI.App.undo.length;
    UI.cmdSketchFillet(); await wait(20);
    UI.pmSetField('r', '2');
    rskClick([5, 0]); await wait(20);
    rskClick(onSp); await wait(20);
    var f = UI.activeSketchFeature(), arcs = rfAXArcs(), sp = f.entities[1], ln = f.entities[0];
    assert(arcs.length === 1 && Math.abs(arcs[0].r - 2) < 1e-9, 'an R2 fillet: ' + JSON.stringify(f.entities) + ' ' + (UI.lastToast ? UI.lastToast() : ''));
    assert(sp.t === 'spline' && sp.pts[0][0] < 15 && sp.pts[0][1] < 3 && Math.abs(Math.hypot(sp.pts[0][0] - arcs[0].cx, sp.pts[0][1] - arcs[0].cy) - 2) < 1e-4, 'the spline is carried back to the fillet: ' + JSON.stringify(sp.pts));
    assert(Math.abs(ln.x2 - arcs[0].cx) < 1e-4 && ln.x2 > 5, 'the line runs to the fillet: ' + JSON.stringify(ln));
    assert(UI.App.undo.length === undo0 + 1, 'one undo step');
    UI.pmOK(); await wait(20);
    assert(!UI.hasPM() && rfAXArcs().length === 1, '✓ keeps it');
    return 'spline from (' + sp.pts[0].map(function (v) { return v.toFixed(2); }).join(', ') + ')';
  });
  // --- end rfAX ---
