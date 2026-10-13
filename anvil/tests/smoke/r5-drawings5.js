  // --- r5/drawings5 ---
  step('r5/drawings5: a double-click on a title block cell edits it in place (Enter applies, one undo step; Esc cancels; an empty box restores the property link)', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(plateCode()); await idle();
    anvil.drawing.make(); await idle(); await wait(60);
    var S = anvil.drawing.summary().sheet.size, cell = [S[0] - 10 - 180 + 50, 10 + 40 - 6];   // the TITLE cell (A3, mm)
    sheetMouse('dblclick', cell);
    var inp = D.querySelector('#dw-edit input');
    assert(inp && D.activeElement === inp && inp.value === anvil.drawing.summary().titleBlock.title, 'box with the title: ' + (inp && inp.value));
    inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert(!D.getElementById('dw-edit'), 'Esc closes');
    var u0 = UI.App.undo.length;
    sheetMouse('dblclick', cell);
    inp = D.querySelector('#dw-edit input'); inp.value = 'Base plate';
    inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await wait(60);
    assert(anvil.drawing.summary().titleBlock.title === 'BASE PLATE' && UI.App.undo.length === u0 + 1, 'applied, one undo step: ' + anvil.drawing.summary().titleBlock.title);
    sheetMouse('dblclick', cell);
    inp = D.querySelector('#dw-edit input'); inp.value = '';
    inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await wait(60);
    assert(!(anvil.drawing.doc().titleBlock || {}).title, 'empty restores the link');
    anvil.drawing.close();
    return 'edit, Esc, restore';
  });
  // --- end r5/drawings5 ---
