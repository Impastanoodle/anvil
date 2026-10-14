  // --- rfCM (2026-10-14, lane CM: Enter / Esc / Undo with a command open, the verified defects) --- the browser's own
  // text undo in a command's box (Ctrl+Z after typing) left the box pending for good; Edit ▸ Undo released over the row
  // with text typed in the box undid the previous step under the open command; the Circle / Arc / Polygon / Slot tool PM
  // counted as a command (Ctrl+Z said "Circle cancelled." and kept the circle); after an arrow-key spin or "=" in the
  // box Ctrl+Z did nothing (pending, with nothing for the browser to undo). Real key and mouse events throughout; the
  // browser's own insertText / undo where headless Chrome takes them, the events they fire otherwise.
  function rfCMKey(el, key, mods) { el.dispatchEvent(new W.KeyboardEvent('keydown', Object.assign({ key: key, bubbles: true, cancelable: true }, mods || {}))); }
  async function rfCMCtrlZ(el) { rfCMKey(el || D.body, 'z', { ctrlKey: true }); await idle(); await wait(20); }
  // a part with one sketch and Boss-Extrude open, the cursor in its Depth box (armed at the default)
  async function rfCMExtrude() {
    UI.cmdExtrude(); await idle(); await wait(30);
    assert(UI.pmTitle() === 'Boss-Extrude', 'Boss-Extrude open: ' + UI.pmTitle());
    var inp = D.querySelector('#pm input[data-key="depth"]');
    assert(inp, 'the Depth box');
    inp.focus(); await wait(10);
    assert(D.activeElement === inp && !UI.pmPending(inp), 'the Depth box focused and clean');
    return inp;
  }
  // text typed in a box: the browser's own insertText (a real undo entry) when it takes it, else the event it fires
  function rfCMType(inp, text) {
    var before = inp.value, ok = false;
    try { inp.select(); ok = D.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (ok && inp.value !== before) return true;
    inp.value = text; inp.dispatchEvent(new W.InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    return false;
  }
  // the browser's text undo: real when it has the entry, else the input event it fires on the way back
  function rfCMBrowserUndo(inp, back) {
    var before = inp.value, ok = false;
    try { ok = D.execCommand('undo'); } catch (e) { ok = false; }
    if (ok && inp.value !== before) return true;
    inp.value = back; inp.dispatchEvent(new W.InputEvent('input', { bubbles: true, inputType: 'historyUndo' }));
    return false;
  }

  step('rfCM: the browser\'s own text undo in Boss-Extrude\'s Depth box (7 typed, Ctrl+Z puts the default back) leaves the box clean: the next Ctrl+Z cancels the command and Enter is ✓ (the box stayed pending for good)', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Top").rect(-20, -10, 40, 20);'); await idle();
    var inp = await rfCMExtrude(), armed = inp.value;
    var real = rfCMType(inp, '7');
    assert(inp.value === '7' && UI.pmPending(inp), '7 typed: pending (' + inp.value + ')');
    var realUndo = rfCMBrowserUndo(inp, armed);
    assert(inp.value === armed, 'the browser put ' + armed + ' back: ' + inp.value);
    assert(!UI.pmPending(inp), 'back on the armed text the box is clean, not "typed again"');
    await rfCMCtrlZ(inp);
    assert(!UI.hasPM() && statusText() === 'Boss-Extrude cancelled.', 'the next Ctrl+Z cancels the command: ' + UI.pmTitle() + ' / ' + statusText());
    // the same, then Enter: ✓ (it committed "again" and kept the command open)
    var nf = UI.App.model.features.length;
    inp = await rfCMExtrude(); armed = inp.value;
    rfCMType(inp, '7'); rfCMBrowserUndo(inp, armed);
    assert(inp.value === armed && !UI.pmPending(inp), 'clean again: ' + inp.value);
    rfCMKey(inp, 'Enter'); await idle(); await wait(30);
    assert(!UI.hasPM() && UI.App.model.features.length === nf + 1, 'Enter is ✓: ' + UI.pmTitle() + ' / ' + UI.App.model.features.length + ' features');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return (real ? 'real insertText' : 'insertText event') + ', ' + (realUndo ? 'real undo' : 'historyUndo event');
  });

  step('rfCM: Edit ▸ Undo pressed on the menu bar and released over the row, with 7 typed in Boss-Extrude\'s Depth box, cancels the command and leaves the previous step alone (it undid that step under the open command)', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Top").rect(-20, -10, 40, 20);'); await idle();
    UI.pushUndo();
    var u0 = UI.App.undo.length;
    var inp = await rfCMExtrude();
    inp.value = '7'; inp.dispatchEvent(new W.Event('input', { bubbles: true }));
    assert(UI.pmPending(inp), '7 typed: pending');
    var li = Array.prototype.filter.call(D.querySelectorAll('#menus > li'), function (l) { return l.textContent === 'Edit'; })[0];
    assert(li, 'the Edit menu');
    li.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    await wait(10);
    var row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (r) { return /^Undo/.test(r.textContent); })[0];
    assert(row && !row.classList.contains('disabled'), 'the Undo row, live');
    assert(D.activeElement === inp, 'the focus stayed in the Depth box: ' + (D.activeElement && D.activeElement.tagName));
    row.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    await idle(); await wait(20);
    assert(!UI.hasPM(), 'the command closed: ' + UI.pmTitle());
    assert(UI.App.undo.length === u0, 'nothing undone: ' + UI.App.undo.length + ' of ' + u0);
    assert(statusText() === 'Boss-Extrude cancelled.', 'status: ' + statusText());
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'the menu cancels, the typed-text exception is the keyboard\'s';
  });

  step('rfCM: Ctrl+Z with the Circle tool on undoes the circle just placed and the tool keeps its Circle PM, as Line does (it said "Circle cancelled.", put the tool down and kept the circle); Polygon and the Centerpoint Arc the same', async function () {
    var errs0 = errors.length;
    var f = await rfBJNew(rfBJSquare(0, 0, 10));
    var n0 = f.entities.length, u0 = UI.App.undo.length;
    var cases = [
      { tool: 'circle', title: 'Circle', clicks: [[20, 20], [25, 20]] },
      { tool: 'polygon', title: 'Polygon', clicks: [[40, 20], [45, 20]] },
      { tool: 'arc', title: 'Arc', clicks: [[20, 40], [25, 40], [20, 45]] }
    ];
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      UI.setTool(c.tool); await idle();
      assert(UI.pmTitle() === c.title && UI.App.tool === c.tool, c.tool + ': the tool PM is open: ' + UI.pmTitle());
      for (var k = 0; k < c.clicks.length; k++) await rfBJClick(rfBJScr(c.clicks[k]));
      var ents = UI.activeSketchFeature().entities;
      assert(ents.length > n0 && UI.App.undo.length === u0 + 1, c.tool + ' placed, one undo step: ' + ents.length + ' entities, ' + UI.App.undo.length + ' undo');
      assert(UI.pmTitle() === c.title, c.tool + ': the tool PM stays after the entity: ' + UI.pmTitle());
      await rfCMCtrlZ(D.body);
      ents = UI.activeSketchFeature().entities;
      assert(ents.length === n0 && UI.App.undo.length === u0, c.tool + ': Ctrl+Z undid the entity: ' + ents.length + ' entities, ' + UI.App.undo.length + ' undo');
      assert(UI.App.mode === 'sketch' && UI.App.tool === c.tool && UI.pmTitle() === c.title, c.tool + ': the tool and its PM stay: ' + UI.App.tool + ' / ' + UI.pmTitle());
      assert(!/cancelled/.test(statusText()), c.tool + ': not cancelled: ' + statusText());
      UI.setTool('select'); await idle();
    }
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'the curve tools undo at once';
  });

  step('rfCM: after an arrow-key spin in Boss-Extrude\'s Depth box the box is clean and Ctrl+Z cancels the command; after "=" (or a shop entry\'s letter) with nothing else typed Ctrl+Z cancels too (it did nothing: pending, nothing for the browser to undo); text typed after the "=" keeps Ctrl+Z for the box', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Top").rect(-20, -10, 40, 20);'); await idle();
    // the spin
    var inp = await rfCMExtrude(), v0 = UI.pmSpec().values.depth;
    rfCMKey(inp, 'ArrowUp'); await wait(10);
    assert(UI.pmSpec().values.depth > v0, 'ArrowUp spun the depth: ' + UI.pmSpec().values.depth);
    assert(!UI.pmPending(inp), 'a spin is applied, the box is clean (' + inp.value + ')');
    await rfCMCtrlZ(inp);
    assert(!UI.hasPM() && statusText() === 'Boss-Extrude cancelled.', 'Ctrl+Z after the spin cancels: ' + UI.pmTitle() + ' / ' + statusText());
    // "=" alone
    inp = await rfCMExtrude();
    rfCMKey(inp, '='); await wait(10);
    assert(inp.type === 'text' && inp.value === '=' && UI.pmPending(inp), '"=" switched the box to text: ' + inp.type + ' "' + inp.value + '"');
    await rfCMCtrlZ(inp);
    assert(!UI.hasPM() && statusText() === 'Boss-Extrude cancelled.', 'Ctrl+Z after "=" cancels: ' + UI.pmTitle() + ' / ' + statusText());
    // a shop entry's letter
    inp = await rfCMExtrude();
    rfCMKey(inp, '/'); await wait(10);
    assert(inp.type === 'text' && /\/$/.test(inp.value) && UI.pmPending(inp), '"/" switched the box to text: ' + inp.type + ' "' + inp.value + '"');
    await rfCMCtrlZ(inp);
    assert(!UI.hasPM() && statusText() === 'Boss-Extrude cancelled.', 'Ctrl+Z after "/" cancels: ' + UI.pmTitle() + ' / ' + statusText());
    // "=" then "2" typed: the browser's turn, the command stays
    inp = await rfCMExtrude();
    rfCMKey(inp, '='); await wait(10);
    inp.value = '=2'; inp.dispatchEvent(new W.InputEvent('input', { bubbles: true, inputType: 'insertText', data: '2' }));
    await rfCMCtrlZ(inp);
    assert(UI.pmTitle() === 'Boss-Extrude' && inp.value === '=2', 'typed after the "=": the command stays: ' + UI.pmTitle() + ' "' + inp.value + '"');
    UI.pmCancel(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'spin / "=" / shop letter cancel, typed text keeps the box';
  });
