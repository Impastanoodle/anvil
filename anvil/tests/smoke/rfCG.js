  // --- rfCG ---
  // (2026-10-14, lane CG) The user: "Pressing Esc should end any function." One Esc cancels the active command
  // completely, whatever has the keyboard (the unit request box, a PropertyManager box, the Modify box, the graphics
  // area): previews and floating geometry go, nothing the command was about to make is left, the PropertyManager and
  // the box close, the sketch tool goes down (a Line chain's pulled segment goes, the placed segments stay), a
  // Transform command is cancelled. All through ui-commands.js UI.escapeCommand. The key is dispatched where a real one
  // would land: on the focused element. Uses the helpers of refine-sketcher, selection, r3-sketch3, sketch-tools,
  // rfBJ, rfBP, drawings and rfW (the group files share one scope).
  async function rfCGEsc(el) {
    var t = el || D.activeElement || D.body;
    var ev = new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    t.dispatchEvent(ev); await idle(); await wait(20);
    return ev;
  }
  function rfCGPreview() { return D.querySelectorAll('.sk-preview, .sk-trim-pick, .sk-trim-span').length + UI.App.tempEntities.length; }
  function rfCGToolClean() { var st = UI.App.toolState; return UI.App.tool === 'select' && !(st && st.pts && st.pts.length); }

  step('rfCG: Parallel Line — a line picked, a click places the floating preview and opens the distance box; ONE Esc in the box removes the preview, makes no line, closes the box and the PropertyManager (the user\'s report); Esc from the PM\'s Distance box and from the graphics area does the same', async function () {
    var errs0 = errors.length;
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 });
    UI.updateSketches();
    var undo0 = UI.App.undo.length;
    // through a point (the default): the click floats the line at the clicked distance, the box has the keyboard
    UI.cmdParallelLine(); await wait(20);
    stRadio('place', 'point');
    rskClick([20, 0]); await wait(20);
    selEv('mousemove', rskScr([20, 6])); rskClick([20, 6]); await wait(20);
    var ub = UI.sketchNumBox();
    assert(ub && D.activeElement === ub[0] && UI.App.tempEntities.length === 1 && UI.parallelLineActive(), 'the preview floats and the distance box has the keyboard: ' + JSON.stringify(UI.App.tempEntities));
    var ev = await rfCGEsc(ub[0]);
    assert(ev.defaultPrevented, 'the box took the Esc');
    assert(!UI.sketchNumBox(), 'one Esc: the distance box is gone');
    assert(!UI.hasPM() && !UI.parallelLineActive(), 'one Esc: the Parallel Line PropertyManager is closed');
    assert(rfCGPreview() === 0, 'one Esc: no preview or temp entity left: ' + rfCGPreview());
    assert(f.entities.length === 1 && UI.App.undo.length === undo0, 'no line made, no undo step: ' + f.entities.length);
    assert(rfCGToolClean() && UI.App.mode === 'sketch', 'tool state clean, still in the sketch');
    // Distance: the PM's own Distance box has the keyboard
    UI.App.sel = { kind: 'entity', index: 0 }; UI.cmdParallelLine(); await wait(20);
    stRadio('place', 'distance');
    rskClick([20, 4]); await wait(20);
    var pd = D.querySelector('#pm input.pm-num[data-key="d"]');
    assert(pd && UI.App.tempEntities.length === 1, 'previewed at the distance');
    pd.focus(); pd.select(); r3sType(pd, '12');
    await rfCGEsc(pd);
    assert(!UI.hasPM() && !UI.sketchNumBox() && rfCGPreview() === 0 && f.entities.length === 1, 'Esc in the PM box: all gone, nothing made');
    // the reference picked, nothing placed, the keyboard on the graphics area
    UI.App.sel = { kind: 'entity', index: 0 }; UI.cmdParallelLine(); await wait(20);
    selEv('mousemove', rskScr([20, 8])); await wait(10);
    await rfCGEsc(D.body);
    assert(!UI.hasPM() && rfCGPreview() === 0 && f.entities.length === 1 && UI.App.undo.length === undo0, 'Esc from the graphics area: closed, nothing made');
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'one Esc ends Parallel Line from the unit box, the PM box and the graphics area';
  });

  step('rfCG: Circle — the centre clicked, the unit box open with a typed size; one Esc makes no circle, closes the box and puts the tool down; Line — a chain A, B then the pulled segment: one Esc keeps A–B, drops the pulled segment and puts the tool down', async function () {
    await rskNew();
    var f = UI.activeSketchFeature(), undo0 = UI.App.undo.length;
    UI.setTool('circle'); await wait(10);
    rskClick([10, 10]); selEv('mousemove', rskScr([14, 10])); await wait(20);
    var box = UI.sketchNumBox();
    assert(box && UI.App.toolState.pts.length === 1, 'centre placed, the unit box open');
    box[0].focus(); r3sType(box[0], '4');
    await rfCGEsc(box[0]);
    assert(!UI.sketchNumBox() && f.entities.length === 0 && UI.App.undo.length === undo0, 'no circle: ' + JSON.stringify(f.entities));
    assert(rfCGToolClean() && !UI.hasPM() && rfCGPreview() === 0, 'tool down, its PM closed, no preview: ' + UI.App.tool + ' ' + UI.pmTitle());
    // Line chain
    UI.setTool('line'); await wait(10);
    rskClick([0, 0]); rskClick([30, 0]); selEv('mousemove', rskScr([30, 20])); await wait(20);
    assert(f.entities.length === 1 && UI.App.tempEntities.length >= 1, 'A–B placed, the next segment pulled');
    await rfCGEsc();
    var e = f.entities[0];
    assert(f.entities.length === 1 && e.t === 'line' && Math.abs(e.x1) < 1e-9 && Math.abs(e.y1) < 1e-9 && Math.abs(e.x2 - 30) < 1e-9 && Math.abs(e.y2) < 1e-9, 'A–B kept, nothing else: ' + JSON.stringify(f.entities));
    assert(rfCGToolClean() && !UI.hasPM() && rfCGPreview() === 0, 'pulled segment gone, tool down, Insert Line closed');
    // the on-screen box of a chain (numeric input on) with a typed length: still one Esc
    var was = UI.sketchNumericInput();
    try {
      UI.sketchNumericInput(true);
      UI.setTool('line'); await wait(10);
      rskClick([0, 10]); selEv('mousemove', rskScr([20, 10])); await wait(20);
      var nb = UI.sketchNumBox();
      assert(nb, 'the on-screen box opened by itself');
      r3sType(nb[0], '15');
      await rfCGEsc(nb[0]);
      assert(!UI.sketchNumBox() && f.entities.length === 1 && rfCGToolClean() && rfCGPreview() === 0, 'one Esc in the on-screen box: no segment, tool down');
    } finally { UI.sketchNumericInput(was); }
    return 'circle and line chain end in one Esc';
  });

  step('rfCG: Smart Dimension — the Modify box of a placed dimension with a typed value: one Esc closes it unapplied (the dimension stays at its measured value) and puts Smart Dimension down', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }); UI.updateSketches();
    UI.setTool('dimension'); await wait(10);
    rskClick([15, 0]); selEv('mousemove', rskScr([15, 6])); rskClick([15, 6]); await wait(20);
    assert(UI.isDimEditOpen() && f.dims && f.dims.length === 1, 'placed, the Modify box open');
    var inp = $('dim-edit').querySelector('input');
    r3sType(inp, '50');
    await rfCGEsc(inp);
    assert(!UI.isDimEditOpen() && Math.abs(f.entities[0].x2 - 30) < 1e-9 && f.dims.length === 1, 'closed unapplied, the dimension kept: ' + JSON.stringify(f.entities[0]));
    assert(rfCGToolClean(), 'Smart Dimension put down: ' + UI.App.tool);
    return 'Modify box and Smart Dimension end in one Esc';
  });

  step('rfCG: Sketch Fillet with a picked corner (the fillet made live) — one Esc puts the sketch back as it was and closes the PropertyManager; Boss-Extrude with a typed depth — one Esc in the Depth box closes it and makes no feature', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    [[0, 0, 40, 0], [40, 0, 40, 20], [40, 20, 0, 20], [0, 20, 0, 0]].forEach(function (q) { f.entities.push({ t: 'line', x1: q[0], y1: q[1], x2: q[2], y2: q[3] }); });
    ['0.p2|1.p1', '1.p2|2.p1', '2.p2|3.p1', '3.p2|0.p1'].forEach(function (r) { W.SketchSolver.addRelation(f, 'coincident', r.split('|')); });
    UI.updateSketches(); UI.setTool('select');
    var snap = JSON.stringify({ e: f.entities, r: f.rels || null, d: f.dims || null }), undo0 = UI.App.undo.length;
    UI.cmdSketchFillet(); UI.pmSetField('r', '5'); await wait(10);
    rskClick([39, 1]); await wait(20);
    assert(UI.activeSketchFeature().entities.some(function (e) { return e.t === 'arc'; }), 'the corner is filleted live');
    await rfCGEsc(D.body);
    var g = UI.activeSketchFeature();
    assert(!UI.hasPM(), 'Sketch Fillet closed');
    assert(JSON.stringify({ e: g.entities, r: g.rels || null, d: g.dims || null }) === snap && UI.App.undo.length === undo0, 'the sketch as it was, no undo step left');
    // Boss-Extrude
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Top").circle(0, 0, 5);'); await idle();
    var n0 = UI.App.model.features.length;
    UI.cmdExtrude(false); await wait(30);
    var dep = rfBPDepthBox();
    assert(dep && UI.pmTitle() === 'Boss-Extrude', 'Boss-Extrude PM');
    dep.focus(); dep.select(); r3sType(dep, '12');
    await rfCGEsc(dep);
    assert(!UI.hasPM() && UI.App.model.features.length === n0, 'closed, no feature: ' + UI.App.model.features.map(function (x) { return x.type; }).join(','));
    return 'Fillet restored, Boss-Extrude cancelled';
  });

  step('rfCG: Translate with its preview — one Esc in the Delta X box (and one from the graphics area) cancels it: the geometry unchanged, the preview gone, "Translate cancelled."', async function () {
    var f = await rfBJNew(rfBJSquare(0, 0, 10).concat([{ t: 'circle', cx: 30, cy: 30, r: 2 }]));
    var snap = JSON.stringify(f.entities);
    UI.setSelection([{ kind: 'entity', index: 4 }]);
    await rfBJRun('Translate');
    UI.pmSetField('dx', '10'); await wait(30);
    assert(UI.App.tempEntities.length >= 1, 'previewed: ' + UI.App.tempEntities.length);
    var dx = D.querySelector('#pm input.pm-num[data-key="dx"]');
    dx.focus();
    await rfCGEsc(dx);
    assert(!UI.hasPM() && JSON.stringify(UI.activeSketchFeature().entities) === snap && UI.App.tempEntities.length === 0, 'cancelled, nothing moved, no preview');
    assert(statusText() === 'Translate cancelled.', 'status: ' + statusText());
    UI.setSelection([{ kind: 'entity', index: 4 }]);
    await rfBJRun('Translate');
    UI.pmSetField('dx', '5'); await wait(30);
    await rfCGEsc(D.body);
    assert(!UI.hasPM() && JSON.stringify(UI.activeSketchFeature().entities) === snap && UI.App.tempEntities.length === 0, 'from the graphics area too');
    return 'Translate cancelled by one Esc';
  });

  step('rfCG: a drawing — Note clicked on the sheet, text typed, one Esc drops the note and ends the Note tool', async function () {
    await rfWDrawing();
    try {
      ribbonButton('Note').click(); await wait(10);
      assert(UI.drawing.state.tool === 'note', 'Note tool');
      sheetMouse('mousedown', [1.4, 9.8]); await wait(10);
      var ta = D.querySelector('#dw-edit.note textarea');
      assert(ta, 'note text box');
      ta.focus(); ta.value = 'DEBURR';
      await rfCGEsc(ta);
      assert(!D.querySelector('#dw-edit') && anvil.drawing.notes().length === 0 && UI.drawing.state.tool === null, 'no note, Note ended: ' + JSON.stringify(anvil.drawing.notes()) + ' tool ' + UI.drawing.state.tool);
    } finally {
      anvil.drawing.close(); await wait(20);
      if (modalOpen() && /Save changes to/.test($('modal-body').textContent)) clickModalButton("Don't Save");
      await idle();
    }
    return 'Note ended by one Esc';
  });
