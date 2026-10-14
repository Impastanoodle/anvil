  // ---- rfCE (2026-10-14): Sketch Fillet / Chamfer picks stay live — every corner picked while the PropertyManager is
  // open stays listed and highlighted, a new Radius (Distance) typed + Enter re-makes all of them at once, the whole
  // session is one undo step, ✗ restores the sketch as the command found it, a row's Delete drops that corner only
  function rfCEArcs() { return UI.activeSketchFeature().entities.filter(function (e) { return e.t === 'arc'; }); }
  function rfCERows() { return Array.prototype.map.call(D.querySelectorAll('#pm .pm-list .pm-item'), function (x) { return x.textContent.trim(); }); }
  function rfCEMarks() { return D.querySelectorAll('polyline.sk-fillet-made').length; }
  function rfCEBox(key) { return D.querySelector('#pm input.pm-num[data-key="' + key + '"]'); }
  // the box typed into as a user does: focus (arms the two-Enter rule), the text replaced, the input event
  function rfCEType(label, text) { var inp = pmField(label); assert(inp, 'no box ' + label); inp.focus(); inp.select(); r3sType(inp, text); return inp; }
  function rfCEEnter(inp) { inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); }
  function rfCEAt(arcs, cx, cy) { return arcs.some(function (a) { return Math.abs(a.cx - cx) < 1e-6 && Math.abs(a.cy - cy) < 1e-6; }); }
  function rfCEAllR(arcs, r) { return arcs.every(function (a) { return Math.abs(a.r - r) < 1e-9; }); }
  // an inch sketch: a 4 × 3 rectangle at the origin (the Corner Rectangle tool: four lines) and an L of two lines at its left
  async function rfCENew() {
    await rskNew();
    UI.App.model.units = 'in';
    UI.App.view.showGrid = false;
    UI.zoomView(0.02 / UI.cam.scale);   // 0.02 in per pixel: the 7 in of geometry fill the view
    UI.App.gridStale = true;
    UI.setTool('rect'); rskClick([0, 0]); rskClick([4, 3]);
    UI.setTool('line'); rskClick([-1, 0]); rskClick([-3, 0]); rskDbl([-3, 2]);
    UI.setTool('select'); await wait(20);
    if (UI.setSelection) UI.setSelection([]);
    UI.App.sel = null;
    var f = UI.activeSketchFeature();
    assert(f.entities.length === 6 && f.entities.every(function (e) { return e.t === 'line'; }), 'four lines and an L: ' + JSON.stringify(f.entities));
    return f;
  }
  step('rfCE: Sketch Fillet keeps its corners live — three corners clicked at R.125 (two of a 4 × 3 rectangle, the L\'s) are listed and highlighted; .25 typed in Radius + Enter re-makes all three at R.25 with the PM still open, the three still listed (one R dimension, two Equal), the two-Enter status; the second Enter closes; one Ctrl+Z puts the sharp corners back', async function () {
    var errs0 = errors.length;
    await rfCENew();
    try {
      var f = UI.activeSketchFeature(), lines0 = JSON.stringify(f.entities), undo0 = UI.App.undo.length;
      UI.cmdSketchFillet(); await wait(20);
      var rf = rfCEType('Radius', '.125'); rfCEEnter(rf); await wait(10);
      near(UI.pmSpec().values.r, 0.125, 0, 'R.125 typed');
      assert(UI.hasPM() && UI.App.undo.length === undo0, 'nothing made yet: the PM waits for picks');
      rskClick([4, 3]); rskClick([0, 3]); rskClick([-3, 0]); await wait(20);
      f = UI.activeSketchFeature();
      var arcs = rfCEArcs();
      assert(arcs.length === 3 && rfCEAllR(arcs, 0.125), 'three R.125 fillets: ' + JSON.stringify(arcs));
      assert(rfCEAt(arcs, 3.875, 2.875) && rfCEAt(arcs, 0.125, 2.875) && rfCEAt(arcs, -2.875, 0.125), 'in their corners: ' + JSON.stringify(arcs));
      assert(rfCERows().length === 3 && rfCERows().every(function (t) { return /^Vertex \(/.test(t); }), 'three corners listed: ' + rfCERows().join(' | '));
      assert(rfCEMarks() === 3, 'the three fillets highlighted: ' + rfCEMarks());
      assert(UI.App.undo.length === undo0 + 1, 'one undo step for the three picks: ' + (UI.App.undo.length - undo0));
      // .25 typed + Enter: all three re-made, the PM open, the entry committed (press Enter again to finish)
      rf = rfCEType('Radius', '.25'); rfCEEnter(rf); await wait(20);
      f = UI.activeSketchFeature(); arcs = rfCEArcs();
      assert(UI.hasPM() && UI.pmTitle() === 'Sketch Fillet', 'the PM stays open after the first Enter');
      assert(arcs.length === 3 && rfCEAllR(arcs, 0.25), 'all three re-made at R.25: ' + JSON.stringify(arcs));
      assert(rfCEAt(arcs, 3.75, 2.75) && rfCEAt(arcs, 0.25, 2.75) && rfCEAt(arcs, -2.75, 0.25), 'still in their corners: ' + JSON.stringify(arcs));
      assert((f.dims || []).filter(function (d) { return d.k === 'r'; }).length === 1 && stToolRels().filter(function (r) { return /^equal:/.test(r); }).length === 2, 'one R dimension, two Equal: ' + JSON.stringify(f.dims) + ' ' + stToolRels().join(' '));
      assert(rfCERows().length === 3 && rfCEMarks() === 3, 'still three listed and highlighted: ' + rfCERows().length + ' ' + rfCEMarks());
      assert(/Radius .*press Enter again to finish/.test(statusText()), 'the two-Enter status: ' + statusText());
      assert(UI.App.undo.length === undo0 + 1, 'still one undo step: ' + (UI.App.undo.length - undo0));
      assert(f.entities.filter(function (e) { return e.t === 'line' && !e.sharp; }).length === 6 && arcs.length === 3, 'six lines and three arcs, nothing doubled by the re-make: ' + JSON.stringify(f.entities.map(function (e) { return e.t; })));
      rfCEEnter(rfCEBox('r')); await wait(20);
      assert(!UI.hasPM(), 'the second Enter closes the command');
      assert(rfCEArcs().length === 3 && rfCEAllR(rfCEArcs(), 0.25) && rfCEMarks() === 0, 'the R.25 fillets kept, the highlight gone');
      D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); await idle();
      f = UI.activeSketchFeature();
      assert(JSON.stringify(f.entities) === lines0 && UI.App.undo.length === undo0, 'one Ctrl+Z: the sharp corners back: ' + JSON.stringify(f.entities));
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    } finally { UI.App.model.units = 'mm'; }
    return 'R.125 → R.25 on three corners, one undo step';
  });
  step('rfCE: ✗ after a radius change restores the sketch as the command found it; Delete on a listed corner\'s row drops that corner and re-makes the other two (the dropped one sharp again); Clear Selections takes every fillet back and the PM waits for picks', async function () {
    var errs0 = errors.length;
    await rfCENew();
    try {
      var f = UI.activeSketchFeature(), lines0 = JSON.stringify(f.entities), rels0 = JSON.stringify(f.rels || null), undo0 = UI.App.undo.length;
      UI.cmdSketchFillet(); await wait(20);
      rfCEType('Radius', '.125');
      rskClick([4, 3]); rskClick([0, 3]); await wait(20);
      var rf = rfCEType('Radius', '.25'); rfCEEnter(rf); await wait(20);
      assert(rfCEArcs().length === 2 && rfCEAllR(rfCEArcs(), 0.25), 'two R.25 fillets: ' + JSON.stringify(rfCEArcs()));
      UI.pmCancel(); await wait(20);
      f = UI.activeSketchFeature();
      assert(!UI.hasPM() && JSON.stringify(f.entities) === lines0 && JSON.stringify(f.rels || null) === rels0 && UI.App.undo.length === undo0, '✗ restores the original: ' + JSON.stringify(f.entities));
      // three corners; Delete on the second row: the (0, 3) corner is sharp again, the other two stay R.125
      UI.cmdSketchFillet(); await wait(20);
      rfCEType('Radius', '.125');
      rskClick([4, 3]); rskClick([0, 3]); rskClick([-3, 0]); await wait(20);
      assert(rfCEArcs().length === 3 && rfCERows().length === 3, 'three fillets listed');
      var row = D.querySelectorAll('#pm .pm-list .pm-item')[1];
      row.focus(); row.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })); await wait(20);
      f = UI.activeSketchFeature();
      var arcs = rfCEArcs();
      assert(arcs.length === 2 && rfCERows().length === 2 && rfCEMarks() === 2, 'two left: ' + JSON.stringify(arcs) + ' ' + rfCERows().join(' | '));
      assert(rfCEAllR(arcs, 0.125) && rfCEAt(arcs, 3.875, 2.875) && rfCEAt(arcs, -2.875, 0.125) && !rfCEAt(arcs, 0.125, 2.875), 'the (0, 3) corner dropped, the other two kept: ' + JSON.stringify(arcs));
      assert(W.SketchSolver.curveCorner(f, [0, 3], 1e-6), 'the corner at (0, 3) is sharp again');
      assert(UI.App.undo.length === undo0 + 1 && UI.hasPM(), 'still one undo step, the PM open');
      // a new radius after the removal re-makes the two that are left
      rf = rfCEType('Radius', '.5'); rfCEEnter(rf); await wait(20);
      arcs = rfCEArcs();
      assert(arcs.length === 2 && rfCEAllR(arcs, 0.5) && rfCERows().length === 2, 'the two re-made at R.5: ' + JSON.stringify(arcs));
      // Clear Selections (the row menu's): nothing left, the sketch as it was, no undo step, the PM waits
      var pickField = UI.pmSpec().groups[0].fields[0];
      pickField.onClear(UI.pmSpec().values); await wait(20);
      f = UI.activeSketchFeature();
      assert(UI.hasPM() && !rfCEArcs().length && rfCERows().length === 0 && JSON.stringify(f.entities) === lines0 && UI.App.undo.length === undo0, 'Clear Selections: the sketch as it was, the PM waits: ' + statusText());
      rskClick([4, 0]); await wait(20);
      assert(rfCEArcs().length === 1 && rfCEAllR(rfCEArcs(), 0.5) && UI.App.undo.length === undo0 + 1, 'a pick after it starts the session again (R.5): ' + JSON.stringify(rfCEArcs()));
      UI.pmCancel(); await wait(20);
      assert(JSON.stringify(UI.activeSketchFeature().entities) === lines0 && UI.App.undo.length === undo0, '✗ at the end: untouched');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    } finally { UI.App.model.units = 'mm'; }
    return '✗ restores; Delete drops one; Clear Selections drops all';
  });
  step('rfCE: Sketch Chamfer the same way — two corners at .1 (Distance-distance, equal), Distance 1 .2 + Enter re-makes both chamfers at .2 with the PM open and both listed; Angle-distance at 30° re-makes them with the angle; Enter closes, one undo step', async function () {
    var errs0 = errors.length;
    await rfCENew();
    try {
      var undo0 = UI.App.undo.length;
      function chLines() { return UI.activeSketchFeature().entities.slice(6).filter(function (e) { return e.t === 'line' && !e.sharp; }); }
      function at45(e, d) { return Math.abs(Math.abs(e.x2 - e.x1) - d) < 1e-9 && Math.abs(Math.abs(e.y2 - e.y1) - d) < 1e-9; }
      UI.cmdSketchChamfer(); await wait(20);
      var d1 = rfCEType('Distance 1', '.1'); rfCEEnter(d1); await wait(10);
      rskClick([4, 3]); rskClick([0, 3]); await wait(20);
      assert(chLines().length === 2 && chLines().every(function (e) { return at45(e, 0.1); }), 'two .1 × .1 chamfers: ' + JSON.stringify(chLines()));
      assert(rfCERows().length === 2 && rfCEMarks() === 2, 'both listed and highlighted: ' + rfCERows().join(' | '));
      d1 = rfCEType('Distance 1', '.2'); rfCEEnter(d1); await wait(20);
      assert(UI.hasPM() && UI.pmTitle() === 'Sketch Chamfer', 'the PM stays open');
      assert(chLines().length === 2 && chLines().every(function (e) { return at45(e, 0.2); }), 'both re-made at .2 × .2: ' + JSON.stringify(chLines()));
      assert(rfCERows().length === 2 && UI.App.undo.length === undo0 + 1, 'both still listed, one undo step: ' + rfCERows().length + ' ' + (UI.App.undo.length - undo0));
      // Angle-distance, 30°: both re-made with the angle driving them
      D.querySelector('#pm input[type=radio][value="angle"]').click(); await wait(20);
      var ang = rfCEType('Direction 1 Angle', '30'); rfCEEnter(ang); await wait(20);
      var f = UI.activeSketchFeature();
      assert(chLines().length === 2 && f.rels.filter(function (r) { return r.type === 'angle' && Math.abs(r.v - 30) < 1e-9; }).length === 2, 'two chamfers at 30°: ' + JSON.stringify(f.rels));
      assert(chLines().every(function (e) { return Math.abs(Math.abs(Math.atan2(e.y2 - e.y1, e.x2 - e.x1)) % (Math.PI / 2) - Math.PI / 6) < 1e-6 || Math.abs(Math.abs(Math.atan2(e.y2 - e.y1, e.x2 - e.x1)) % (Math.PI / 2) - Math.PI / 3) < 1e-6; }), 'the chamfer lines at 30° to a side: ' + JSON.stringify(chLines()));
      rfCEEnter(rfCEBox('angle')); await wait(20);
      assert(!UI.hasPM() && chLines().length === 2 && UI.App.undo.length === undo0 + 1, 'the second Enter closes, one undo step');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    } finally { UI.App.model.units = 'mm'; }
    return '.1 → .2 on two corners, then 30°';
  });
  step('rfCE: a radius that no longer fits is refused — R5 typed over three R.125 fillets keeps them at R.125, says why in the status line and marks the Radius box; ✓ is refused while it stands; .25 typed re-makes them and ✓ closes', async function () {
    var errs0 = errors.length;
    await rfCENew();
    try {
      var undo0 = UI.App.undo.length;
      UI.cmdSketchFillet(); await wait(20);
      rfCEType('Radius', '.125');
      rskClick([4, 3]); rskClick([0, 3]); rskClick([-3, 0]); await wait(20);
      assert(rfCEArcs().length === 3, 'three fillets');
      var rf = rfCEType('Radius', '5'); await wait(20);
      var arcs = rfCEArcs();
      assert(arcs.length === 3 && rfCEAllR(arcs, 0.125), 'the R.125 fillets kept: ' + JSON.stringify(arcs));
      assert(/at most R/.test(statusText()), 'the reason in the status line: ' + statusText());
      assert(rfCEBox('r') && rfCEBox('r').classList.contains('expr-err'), 'the Radius box marked bad');
      assert(rfCERows().length === 3 && rfCEMarks() === 3, 'the three still listed and highlighted');
      rfCEEnter(rfCEBox('r')); await wait(10);
      await UI.pmOK(); await wait(20);
      assert(UI.hasPM() && rfCEArcs().length === 3 && rfCEAllR(rfCEArcs(), 0.125), '✓ refused while the value is bad: ' + statusText());
      rf = rfCEType('Radius', '.25'); rfCEEnter(rf); await wait(20);
      arcs = rfCEArcs();
      assert(arcs.length === 3 && rfCEAllR(arcs, 0.25) && !rfCEBox('r').classList.contains('expr-err'), 'R.25 re-made, the mark gone: ' + JSON.stringify(arcs));
      await UI.pmOK(); await wait(20);
      assert(!UI.hasPM() && rfCEArcs().length === 3 && rfCEAllR(rfCEArcs(), 0.25) && UI.App.undo.length === undo0 + 1, 'closed with the three R.25 fillets, one undo step');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    } finally { UI.App.model.units = 'mm'; }
    return 'R5 refused, R.25 made';
  });
  // rfCE 2: a keystroke as the browser sends it (an InputEvent with its inputType), unlike a test's set value
  function rfCEKey(inp, text) { inp.value = text; inp.dispatchEvent(new W.InputEvent('input', { bubbles: true, inputType: 'insertText', data: text.slice(-1) })); }
  step('rfCE 2: Enter completes a typed value — over three R.25 fillets, "1" then "/" then "8" typed in Radius re-makes nothing (no R1 flash, the status says Press Enter to apply, the box reads 1/8); the first Enter re-makes all three at R.125 exactly once; a typed .5 is applied when the box loses focus; a typed .3 is applied by the next corner pick (four at R.3); the second Enter closes', async function () {
    var errs0 = errors.length, calls = 0, S = W.SketchSolver, fp = S.filletPair;
    S.filletPair = function () { calls++; return fp.apply(this, arguments); };
    await rfCENew();
    try {
      var undo0 = UI.App.undo.length;
      UI.cmdSketchFillet(); await wait(20);
      var rf = rfCEType('Radius', '.25'); rfCEEnter(rf); await wait(10);
      rskClick([4, 3]); rskClick([0, 3]); rskClick([-3, 0]); await wait(20);
      assert(rfCEArcs().length === 3 && rfCEAllR(rfCEArcs(), 0.25) && calls === 3, 'three R.25 fillets: ' + JSON.stringify(rfCEArcs()) + ' calls ' + calls);
      calls = 0;
      rf = rfCEBox('r'); rf.focus(); rf.select();
      rfCEKey(rf, '1'); await wait(10);
      assert(rfCEAllR(rfCEArcs(), 0.25) && calls === 0 && UI.pmSpec().values.r === 0.25, 'a typed 1 re-makes nothing (no R1 flash): calls ' + calls + ' ' + JSON.stringify(rfCEArcs()));
      assert(/^Press Enter to apply R1\.000 in\./.test(statusText()), 'the status waits for Enter: ' + statusText());
      r3sKey(rf, '/'); await wait(10);   // the box becomes a text box reading "1/"
      assert(rf.type === 'text' && rf.value === '1/', 'the box reads 1/: ' + rf.type + ' ' + rf.value);
      rfCEKey(rf, '1/8'); await wait(10);
      assert(rfCEAllR(rfCEArcs(), 0.25) && calls === 0 && UI.pmSpec().values.r === 0.25 && rf.value === '1/8', 'still R.25 with 1/8 typed: calls ' + calls);
      assert(/^Press Enter to apply R\.125 in\./.test(statusText()), 'the status names the typed value: ' + statusText());
      rfCEEnter(rf); await wait(20);
      assert(UI.hasPM() && rfCEArcs().length === 3 && rfCEAllR(rfCEArcs(), 0.125) && calls === 3, 'the first Enter re-makes all three at R.125, once: calls ' + calls + ' ' + JSON.stringify(rfCEArcs()));
      assert(UI.pmSpec().values.r === 0.125 && rfCEBox('r').type === 'number' && /Radius \.125 in .*press Enter again to finish/.test(statusText()), 'the box committed: ' + rfCEBox('r').value + ' ' + statusText());
      assert(UI.App.undo.length === undo0 + 1, 'one undo step: ' + (UI.App.undo.length - undo0));
      // the box left with .5 typed: applied on the way out
      calls = 0;
      rf = rfCEBox('r'); rf.focus(); rf.select(); rfCEKey(rf, '.5'); await wait(10);
      assert(rfCEAllR(rfCEArcs(), 0.125) && calls === 0, 'typed .5 waits');
      rf.blur(); await wait(30);
      assert(rfCEAllR(rfCEArcs(), 0.5) && calls === 3 && UI.pmSpec().values.r === 0.5, 'leaving the box applies .5: calls ' + calls + ' ' + JSON.stringify(rfCEArcs()));
      // .3 typed, then the fourth corner picked: the pick applies it first, four fillets at R.3
      calls = 0;
      rf = rfCEBox('r'); rf.focus(); rf.select(); rfCEKey(rf, '.3'); await wait(10);
      assert(rfCEAllR(rfCEArcs(), 0.5) && calls === 0, 'typed .3 waits');
      rskClick([4, 0]); await wait(20);
      assert(rfCEArcs().length === 4 && rfCEAllR(rfCEArcs(), 0.3) && calls === 4 && rfCERows().length === 4, 'the pick applies .3 then adds the fourth: calls ' + calls + ' ' + JSON.stringify(rfCEArcs()));
      rfCEEnter(rfCEBox('r')); await wait(20);
      assert(!UI.hasPM() && rfCEArcs().length === 4 && rfCEAllR(rfCEArcs(), 0.3) && UI.App.undo.length === undo0 + 1, 'Enter with nothing typed closes, one undo step');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    } finally { UI.App.model.units = 'mm'; S.filletPair = fp; }
    return '1/8 applied on Enter, once';
  });
