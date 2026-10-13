  // ---- Close Drawing asks to save; Mirror Entities starts with Mirror about empty (QUEUE follow-ups of 2026-10-07T09)
  step('close-drawing: Close Drawing on a changed drawing asks "Save changes to Draw1?" — Cancel keeps it open, Don\'t Save (Window ▸ part) closes it and puts the drawing back, Save saves then closes; an unchanged drawing closes without asking', async function () {
    await anvil.run(plateCode()); await idle();
    anvil.drawing.make(); await UI.drawing.ready(); await wait(30);
    UI.markClean();   // (as if saved)
    // (rfW) Close Drawing is in the File menu (SolidWorks), no longer on the View Layout tab
    var closeBtn = { run: function () { dwMenu('Close Drawing'); } };
    assert(closeBtn && !anvil.drawing.isDirty(), 'a drawing just opened is not dirty');
    closeBtn.run();
    assert(!modalOpen() && !UI.drawingActive(), 'an unchanged drawing closed without asking');
    anvil.drawing.open(0); await UI.drawing.ready(); await wait(30);
    var n0 = anvil.drawing.summary().views.length, last = anvil.drawing.summary().views[n0 - 1];
    anvil.drawing.deleteView(last.id);
    assert(anvil.drawing.summary().views.length === n0 - 1 && anvil.drawing.isDirty() && UI.isDirty(), 'the deleted view makes the drawing dirty');
    // File ▸ Close Drawing ▸ Cancel
    var rows = menuRows('Close Drawing');
    assert(rows.length && rows[0].menu === 'File', 'File ▸ Close Drawing');
    rows[0].row.click();
    assert(modalOpen() && /Save changes to Draw\d+\?/.test($('modal-body').textContent), 'no save prompt: ' + $('modal-body').textContent);
    var btns = Array.prototype.map.call(D.querySelectorAll('#modal-buttons button'), function (b) { return b.textContent; }).join('|');
    assert(btns === "Save|Don't Save|Cancel", 'buttons ' + btns);
    clickModalButton('Cancel');
    assert(!modalOpen() && UI.drawingActive() && anvil.drawing.summary().views.length === n0 - 1 && anvil.drawing.isDirty(), 'Cancel kept the drawing open with its change');
    // Window ▸ <part> ▸ Don't Save
    rows = menuRows('(part)');
    assert(rows.length && rows[0].menu === 'Window', 'Window lists the part');
    rows[0].row.click();
    assert(modalOpen() && /Save changes to/.test($('modal-body').textContent), 'Window ▸ part did not ask');
    clickModalButton("Don't Save");
    assert(!modalOpen() && !UI.drawingActive() && !UI.isDirty(), "Don't Save closed the drawing and left the part as saved");
    assert(anvil.drawing.summary().views.length === n0, "Don't Save put the deleted view back: " + anvil.drawing.summary().views.length);
    // Close Drawing (ribbon) ▸ Save
    anvil.drawing.open(0); await UI.drawing.ready(); await wait(30);
    anvil.drawing.deleteView(last.id);
    closeBtn.run();
    assert(modalOpen() && /Save changes to/.test($('modal-body').textContent), 'ribbon Close Drawing did not ask');
    clickModalButton('Save');
    if (modalOpen()) { D.querySelector('#modal-body input').value = 'SmokeCloseDrawing'; clickModalButton('OK'); }
    var saved = UI.App.fileName;
    assert(!modalOpen() && !UI.drawingActive() && !UI.isDirty() && anvil.drawing.summary().views.length === n0 - 1, 'Save saved the change and closed the drawing');
    forgetDocs([saved]);
    return n0 + ' views; Cancel / Don\'t Save / Save';
  });
  step('mirror-axis: Mirror Entities starts with Mirror about empty (no Sketch Y default) — no preview copy and ✓ refused until a centerline is picked; a preselected centerline goes straight into Mirror about', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'circle', cx: 20, cy: 10, r: 4 }, { t: 'line', x1: 0, y1: -20, x2: 0, y2: 30, construction: true });
    UI.updateSketches(); UI.setTool('select'); UI.setSelection([]); UI.App.sel = { kind: 'entity', index: 0 };
    UI.cmdMirrorEntities(); await wait(20);
    var v = UI.pmSpec().values, boxes = D.querySelectorAll('#pm .pm-pick'), ok = D.querySelector('#pm .pm-ok');
    assert(v.axis === '' && v.entities.join() === '0', 'Mirror about empty, the circle in Entities to Mirror: ' + JSON.stringify({ axis: v.axis, ents: v.entities }));
    assert(boxes[1].classList.contains('active') && /Select a line or centerline/.test(boxes[1].textContent), 'Mirror about is the active, empty box: ' + boxes[1].textContent);
    assert(!(UI.App.tempEntities || []).length, 'a preview copy with no mirror line');
    assert(ok.classList.contains('disabled'), '✓ available with no mirror line');
    await UI.pmOK();
    assert(UI.hasPM() && rskEnts().length === 2, '✓ mirrored with no mirror line');
    rskClick([0, 5]); await wait(20);
    ok = D.querySelector('#pm .pm-ok');
    assert(UI.pmSpec().values.axis === '1' && UI.App.tempEntities.length === 1 && !ok.classList.contains('disabled'), 'centerline picked: preview and ✓: ' + UI.pmSpec().values.axis);
    await UI.pmOK();
    var e = rskEnts();
    assert(e.length === 3 && e[2].t === 'circle' && Math.abs(e[2].cx + 20) < 1e-9, 'mirrored about the centerline: ' + JSON.stringify(e[2]));
    // the circle and the centerline preselected: the centerline is Mirror about, the copy previews at once
    UI.App.sel = null; UI.setSelection([{ kind: 'entity', index: 0 }, { kind: 'entity', index: 1 }]);
    UI.cmdMirrorEntities(); await wait(20);
    v = UI.pmSpec().values;
    assert(v.axis === '1' && v.entities.join() === '0' && UI.App.tempEntities.length === 1, 'preselected centerline: ' + JSON.stringify({ axis: v.axis, ents: v.entities }));
    UI.pmCancel();
    return 'Mirror about picked, then preselected';
  });
