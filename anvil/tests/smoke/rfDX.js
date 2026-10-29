  // --- rfDX (2026-10-29, lane DX): Features ▸ Draft (Neutral Plane) with real mouse / key events. A 2 × 2 × 1 in
  // block in the Isometric view: the ribbon's Draft opens the PM with the Neutral Plane box active and ✓+ offered; the
  // top face clicked goes to Neutral Plane, the front and right faces to Faces to Draft; Draft angle 5 typed, Enter
  // Enter (✓): the bottom shrinks by tan 5° on those two sides (exact volume), Draft1 in the tree, one undo step; Edit
  // Feature, Reverse direction clicked, ✓: the bottom grows instead; Esc on a fresh Draft leaves the part alone. ---
  function rfDXEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfDXClick(P) { var S = UI.worldToScreen(P); rfDXEv('mousemove', S); rfDXEv('mousedown', S, $('viewport')); rfDXEv('mouseup', S); }
  function rfDXVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
  function rfDXRibbon() {
    return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return (b.getAttribute('aria-label') || '').trim() === 'Draft'; })[0];
  }
  function rfDXEsc() { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); }

  step('rfDX: Draft — ribbon button, top face to Neutral Plane, front and right faces to Faces to Draft, 5° Enter Enter: exact volume, Draft1, one undo step; Edit Feature, Reverse direction: the bottom grows', async function () {
    var t = Math.tan(5 * Math.PI / 180);
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sketch("Top").rect(-1, -1, 2, 2).end().extrude(1);'); await idle();
    UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
    near(rfDXVol(), 4, 1e-12, 'block');
    var n0 = UI.App.model.features.length, undo0 = UI.App.undo.length;
    UI.setRibbonTab('Features'); await wait(20);
    var btn = rfDXRibbon();
    assert(btn && !btn.disabled && !btn.classList.contains('disabled'), 'Draft on the Features ribbon');
    btn.click(); await idle(); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Draft', 'Draft PM: ' + (UI.hasPM() && UI.pmTitle()));
    assert(D.querySelector('#pm .pm-actions .pm-okplus'), '✓+ offered');
    var boxes = D.querySelectorAll('#pm .pm-pick.clickable');
    assert(boxes.length >= 2, 'Neutral Plane and Faces to Draft boxes: ' + boxes.length);
    rfDXClick([0.3, 1, 0.3]); await idle(); await wait(30);
    var vals = UI.pmSpec().values;
    assert(vals.neutral && vals.neutral.face && Math.abs(vals.neutral.face[1] - 1) < 1e-3, 'top face is the neutral plane: ' + JSON.stringify(vals.neutral));
    rfDXClick([0.3, 0.5, 1]); await idle(); await wait(30);
    rfDXClick([1, 0.5, 0.3]); await idle(); await wait(30);
    vals = UI.pmSpec().values;
    assert(vals.faces.length === 2, 'two faces to draft: ' + JSON.stringify(vals.faces));
    var rows = D.querySelectorAll('#pm .pm-list .pm-item');
    assert(rows.length === 2 && /Face<2>/.test(rows[1].textContent), 'face rows');
    var a = pmField('Draft angle');
    assert(a && +a.value === 1, 'Draft angle 1° to start: ' + (a && a.value));
    a.focus(); a.select(); a.value = '5'; a.dispatchEvent(new W.Event('input', { bubbles: true }));
    var ev = pressEnter(a);
    assert(ev.defaultPrevented && UI.hasPM(), 'the first Enter applied and kept the PM');
    await UI.previewIdle();
    assert(UI.groups.preview.children.length > 0, 'the drafted part is previewed');
    pressEnter(pmField('Draft angle')); await idle(); await wait(30);
    assert(!UI.hasPM(), 'the second Enter is ✓');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(UI.App.model.features.length === n0 + 1 && f.type === 'draft' && f.name === 'Draft1' && f.angle === 5, 'Draft1: ' + JSON.stringify(f));
    assert(UI.App.undo.length === undo0 + 1, 'one undo step: ' + (UI.App.undo.length - undo0));
    var want = 4 - 2 * t + t * t / 3;
    near(rfDXVol(), want, 1e-9, 'bottom shrinks by tan 5° on two sides');
    var row = Array.prototype.filter.call(D.querySelectorAll('#tree [data-fid]'), function (n) { return /Draft1/.test(n.textContent); })[0];
    assert(row, 'Draft1 in the FeatureManager');
    UI.editFeature(f); await idle(); await UI.previewIdle();
    assert(UI.hasPM() && UI.pmTitle() === 'Draft1', 'Edit Feature: ' + (UI.hasPM() && UI.pmTitle()));
    var box = D.querySelector('#pm input[type="checkbox"][data-key="reverse"]');
    assert(box, 'Reverse direction check box');
    box.click(); await idle(); await UI.previewIdle();
    assert(UI.pmSpec().values.reverse === true, 'reversed');
    await UI.pmOK(); await idle();
    near(rfDXVol(), 4 + 2 * t + t * t / 3, 1e-9, 'reversed: the bottom grows');
    // Esc on a new Draft changes nothing
    UI.cmdDraft(); await idle();
    assert(UI.hasPM() && UI.pmTitle() === 'Draft', 'a second Draft');
    rfDXEsc(); await idle();
    assert(!UI.hasPM() && UI.App.model.features.length === n0 + 1, 'Esc closed it, nothing added');
    return 'volume ' + rfDXVol().toFixed(6) + ' in³';
  });
