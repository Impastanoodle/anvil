  // --- r4/drawings4 ---
  step('r4/drawings4: a selected dimension shows arrow handles and a click on an arrowhead flips its arrows (one undo step); a dragged dimension snaps in line with another (dotted guide, Alt turns it off); a double-click edits the value in place (Enter rebuilds the part, Esc cancels) and a reference dimension\'s text', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(plateCode()); await idle();
    anvil.drawing.make(); await idle(); await wait(60);
    var st = UI.drawing.state, sd = function (i) { return st.sheet.dims[i]; }, tmid = function (d) { return [(d.tbox.x0 + d.tbox.x1) / 2, (d.tbox.y0 + d.tbox.y1) / 2]; };
    var i0 = anvil.drawing.summary().dimDetails.findIndex(function (x) { return x.kind === 'h' && x.text === '100'; });
    assert(i0 >= 0, 'the 100 model item');
    // select, then click an arrowhead
    sheetMouse('mousedown', tmid(sd(i0))); W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true }));
    assert(D.querySelectorAll('#dw-overlay .dw-handle').length === 2, 'two arrow handles');
    var u0 = UI.App.undo.length;
    sheetMouse('mousedown', sd(i0).arrows[0]); W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true }));
    assert(anvil.drawing.summary().dimDetails[i0].flip === true && UI.App.undo.length === u0 + 1, 'flipped, one undo step');
    sheetMouse('mousedown', sd(i0).arrows[1]); W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true }));
    assert(anvil.drawing.summary().dimDetails[i0].flip === false, 'flipped back');
    // snap: the Front view's vertical dimension dragged a few pixels off the Top view's one lands back in line
    var dv = anvil.drawing.summary().dimDetails, iF = dv.findIndex(function (x) { return x.kind === 'v' && x.view === dwView('Front').id; }), iT = dv.findIndex(function (x) { return x.kind === 'v' && x.view === dwView('Top').id; });
    assert(iF >= 0 && iT >= 0, 'two vertical dimensions');
    var px = 1 / D.querySelector('#drawing-sheet svg').getScreenCTM().a, xT = st.sheet.views.filter(function (w) { return w.view.id === sd(iT).view; })[0].toSheet([sd(iT).lineAt, 0])[0];
    var m0 = tmid(sd(iF));
    sheetMouse('mousedown', m0);
    var c1 = paperToClient([m0[0] - 5 * px, m0[1]]);
    W.dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: c1.clientX, clientY: c1.clientY }));
    assert(st.snapGuide && D.querySelector('#dw-overlay .dw-guide'), 'alignment guide shown');
    W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, clientX: c1.clientX, clientY: c1.clientY }));
    await wait(30);
    var wF = st.sheet.views.filter(function (w) { return w.view.id === sd(iF).view; })[0];
    near(wF.toSheet([sd(iF).lineAt, 0])[0], xT, 1e-6, 'in line with the Top view\'s');
    assert(!D.querySelector('#dw-overlay .dw-guide'), 'guide gone after release');
    // Alt: free placement
    var m1 = tmid(sd(iF)), c2 = paperToClient([m1[0] - 5 * px, m1[1]]);
    sheetMouse('mousedown', m1);
    W.dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, altKey: true, clientX: c2.clientX, clientY: c2.clientY }));
    W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, clientX: c2.clientX, clientY: c2.clientY }));
    await wait(30);
    wF = st.sheet.views.filter(function (w) { return w.view.id === sd(iF).view; })[0];
    assert(Math.abs(wF.toSheet([sd(iF).lineAt, 0])[0] - xT) > px, 'Alt places it freely');
    // in-place Modify box: a model item's value drives the part
    var t0 = tmid(sd(i0));
    sheetMouse('mousedown', t0); W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true })); sheetMouse('dblclick', t0);
    var box = D.getElementById('dw-edit'), inp = box && box.querySelector('input');
    assert(inp && inp.value === '100' && D.activeElement === inp, 'Modify box with the value, focused');
    inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert(!D.getElementById('dw-edit') && anvil.drawing.summary().dims[i0] === '100', 'Esc cancels');
    sheetMouse('dblclick', t0);
    inp = D.querySelector('#dw-edit input'); inp.value = '110';
    inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await idle(); await wait(60);
    assert(anvil.drawing.summary().dims[i0] === '110' && !UI.hasPM() && !D.getElementById('dw-edit'), 'drove the part: ' + anvil.drawing.summary().dims.join(' | '));
    UI.undo(); await idle(); await wait(60);
    assert(anvil.drawing.summary().dims[i0] === '100', 'undo');
    // a reference dimension: its text, <DIM> standing for the value
    var F = dwView('Front'), ent = UI.drawing.entityAt([(F.box[0] + F.box[2]) / 2 + 5, F.box[3]]);
    UI.drawing.addDimension(ent); await wait(30);
    var ir = anvil.drawing.summary().dimDetails.findIndex(function (x) { return !x.auto; }), tr = tmid(sd(ir));
    sheetMouse('mousedown', tr); W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true })); sheetMouse('dblclick', tr);
    inp = D.querySelector('#dw-edit input');
    assert(inp && inp.value === '<DIM>', 'text box');
    inp.value = '<DIM> TYP';
    inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    assert(anvil.drawing.summary().dimDetails[ir].text === '100 TYP', 'reference text ' + anvil.drawing.summary().dimDetails[ir].text);
    if (UI.hasPM()) UI.pmCancel();
    anvil.drawing.close();
    return 'flip, snap, Alt, Modify box, text';
  });
  // --- end r4/drawings4 ---
