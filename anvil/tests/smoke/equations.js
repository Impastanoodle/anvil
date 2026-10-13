  // ---- equations (Tools ▸ Equations, "=" fields in the PropertyManager and the sketch Modify box)
  function need(obj, name, where) { assert(obj && typeof obj[name] === 'function', (where || 'UI') + '.' + name + ' is missing (equations hook not wired)'); }
  function eqRows() { return Array.prototype.slice.call(D.querySelectorAll('#eq-table tr.eq-row')); }
  function eqRow(name) { return eqRows().filter(function (tr) { return tr.querySelector('.eq-name').value === name; })[0]; }
  function eqType(name, text) {
    var tr = eqRow(name);
    assert(tr, 'no row "' + name + '" in the Equations dialog');
    setInput(tr.querySelector('.eq-expr'), text);
    return tr;
  }
  function eqClick(sel) { var b = D.querySelector(sel); assert(b, sel + ' missing'); b.click(); }
  var EQ_PART = 'p.equations({ T: 10, W: "=T*2" });\np.sketch("Front").rect(0, 0, 10, 10).extrude("=W");';
  step('equations: anvil.equations() get / set rebuilds; summary().equations; Equations folder and rows in the FeatureManager', async function () {
    need(anvil, 'equations', 'anvil');
    var s = await anvil.run(EQ_PART);
    await idle();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    near(s.volume, 2000, 1e-6, 'volume at T = 10');
    assert(s.equations && s.equations.T === 10 && s.equations.W === 20, 'summary().equations: ' + JSON.stringify(s.equations));
    var list = anvil.equations();
    assert(JSON.stringify(list) === JSON.stringify([{ name: 'T', expr: '10' }, { name: 'W', expr: 'T*2' }]), 'anvil.equations(): ' + JSON.stringify(list));
    list[0].expr = '999';
    assert(UI.App.model.equations[0].expr === '10', 'anvil.equations() must return a copy');
    var folder = D.querySelector('#tree .eq-folder');
    assert(folder && /Equations/.test(folder.textContent), 'no Equations folder in the tree');
    assert(D.querySelector('#tree .eq-row[data-eq="T"]') && D.querySelector('#tree .eq-row[data-eq="W"]'), 'tree rows for T and W missing');
    var p = anvil.equations({ T: 5, W: '=T*2' });
    assert(p && typeof p.then === 'function', 'anvil.equations(spec) should return a Promise');
    var s2 = await p;
    await idle();
    near(s2.volume, 1000, 1e-6, 'volume at T = 5');
    assert(s2.equations.W === 10, 'W = ' + s2.equations.W);
    assert(UI.App.model.features[1].depth === '=W', 'the feature keeps "=W": ' + JSON.stringify(UI.App.model.features[1].depth));
    UI.undo(); await idle();
    near(anvil.summary().volume, 2000, 1e-6, 'undo restores T = 10');
    UI.redo(); await idle();
    near(anvil.summary().volume, 1000, 1e-6, 'redo');
    return 'tree: ' + folder.textContent.trim() + ' · ' + D.querySelector('#tree .eq-row[data-eq="W"]').textContent.trim();
  });
  step('Tools ▸ Equations… opens the dialog; editing T re-evaluates W live; OK applies and rebuilds', async function () {
    need(UI, 'showEquations');
    await anvil.run(EQ_PART);
    await idle();
    var rowsFound = menuRows('Equations');
    assert(rowsFound.length, 'no menu row "Equations…"');
    assert(/Tools/.test(rowsFound[0].menu), 'Equations… should be in the Tools menu, found in ' + rowsFound[0].menu);
    rowsFound[0].row.click();
    if (UI.closeMenus) UI.closeMenus();
    assert(modalOpen() && $('eq-dialog'), 'Equations dialog did not open');
    assert(eqRows().length === 2, 'rows: ' + eqRows().length);
    assert(/^20\b/.test(eqRow('W').querySelector('.eq-val').textContent.trim()), 'W evaluates to ' + eqRow('W').querySelector('.eq-val').textContent);
    eqType('T', '= 3');
    assert(/^6\b/.test(eqRow('W').querySelector('.eq-val').textContent.trim()), 'after T = 3, W shows ' + eqRow('W').querySelector('.eq-val').textContent);
    eqClick('#eq-ok');
    await anvil.idle();
    await idle();
    assert(!modalOpen(), 'dialog still open after OK');
    near(anvil.summary().volume, 600, 1e-6, 'volume at T = 3');
    assert(anvil.equations()[0].expr === '3', 'T stored as "3": ' + JSON.stringify(anvil.equations()));
    return 'T = 3 → W = 6 → ' + anvil.summary().volume;
  });
  step('Equations dialog: an error row is red and OK is refused; add, reorder and delete rows; Cancel changes nothing', async function () {
    await anvil.run(EQ_PART);
    await idle();
    UI.showEquations();
    assert(modalOpen() && $('eq-dialog'), 'dialog not open');
    eqType('W', '= Q*2');
    var val = eqRow('W').querySelector('.eq-val');
    assert(val.classList.contains('err') && /Q/.test(val.textContent), 'W should show an error naming Q: "' + val.textContent + '"');
    assert($('eq-msg') && $('eq-msg').classList.contains('err'), '#eq-msg should flag the error');
    eqClick('#eq-ok');
    await wait(50);
    assert(modalOpen() && $('eq-dialog'), 'OK must be refused while a row has an error');
    assert(UI.App.model.equations[1].expr === 'T*2', 'model changed: ' + JSON.stringify(UI.App.model.equations));
    eqType('W', '= T*2');
    assert(!eqRow('W').querySelector('.eq-val').classList.contains('err'), 'W error should clear');
    eqClick('#eq-add');
    assert(eqRows().length === 3, 'after + Add: ' + eqRows().length + ' rows');
    // move T below W: W now refers to a later variable and turns red
    eqRow('T').querySelector('.eq-down').click();
    assert(eqRows()[0].querySelector('.eq-name').value === 'W' && eqRows()[1].querySelector('.eq-name').value === 'T', 'order after ▼: ' + eqRows().map(function (r) { return r.querySelector('.eq-name').value; }).join(','));
    assert(eqRow('W').querySelector('.eq-val').classList.contains('err'), 'W above T should be an error (evaluated top to bottom)');
    eqRow('T').querySelector('.eq-up').click();
    assert(!eqRow('W').querySelector('.eq-val').classList.contains('err'), 'W below T again is fine');
    eqRows()[2].querySelector('.eq-del').click();
    assert(eqRows().length === 2, 'after ✕: ' + eqRows().length + ' rows');
    eqClick('#eq-cancel');
    assert(!modalOpen(), 'Cancel should close the dialog');
    assert(JSON.stringify(anvil.equations()) === JSON.stringify([{ name: 'T', expr: '10' }, { name: 'W', expr: 'T*2' }]), 'Cancel changed the model: ' + JSON.stringify(anvil.equations()));
    near(anvil.summary().volume, 2000, 1e-6, 'volume unchanged');
  });
  step('Boss-Extrude PM: "=W+1" in Depth shows the value hint, commits the expression, follows T; a broken one disables OK', async function () {
    need(UI, 'pmSetField'); need(UI, 'pmExpressions');
    await anvil.run('p.equations({ T: 10, W: "=T*2" });\np.sketch("Front").rect(0, 0, 10, 10);');
    await idle();
    UI.cmdExtrude(false);
    assert(UI.hasPM(), 'Extrude PM not open');
    assert(D.querySelector('#pm input.pm-num[data-key="depth"]'), 'depth field #pm input.pm-num[data-key=depth] missing');
    assert(UI.pmSetField('depth', '=W+1'), 'pmSetField(depth) returned false');
    var hint = D.querySelector('#pm .pm-expr-hint[data-key="depth"]');
    assert(hint && !hint.hidden && /21/.test(hint.textContent) && !hint.classList.contains('err'), 'hint: ' + (hint && hint.textContent));
    assert(/W\+1/.test(UI.pmExpressions().exprs.depth || ''), 'pmExpressions: ' + JSON.stringify(UI.pmExpressions()));
    var ok = D.querySelector('#pm .pm-ok');
    assert(ok && !ok.classList.contains('disabled'), 'OK should be enabled');
    await pmAccept();
    assert(!UI.hasPM(), 'PM still open');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'extrude' && typeof f.depth === 'string' && /^=\s*W\s*\+\s*1$/.test(f.depth), 'committed depth: ' + JSON.stringify(f.depth));
    near(anvil.summary().volume, 2100, 1e-6, 'volume with depth W+1 = 21');
    assert(/"=\s*W\s*\+\s*1"/.test(anvil.script()), 'script lacks the "=W+1" depth');
    // editing shows the equation text; a broken equation marks the hint and refuses OK
    UI.editFeature(f);
    assert(UI.hasPM(), 'edit PM not open');
    var inp = D.querySelector('#pm input.pm-num[data-key="depth"]');
    assert(inp && /W\s*\+\s*1/.test(inp.value), 'edit PM depth field shows "' + (inp && inp.value) + '"');
    UI.pmSetField('depth', '=Nope*2');
    hint = D.querySelector('#pm .pm-expr-hint[data-key="depth"]');
    assert(hint && hint.classList.contains('err'), 'hint should be red: ' + (hint && hint.className));
    assert(D.querySelector('#pm .pm-ok').classList.contains('disabled'), 'OK should be disabled');
    await UI.pmOK();
    assert(UI.hasPM(), 'OK with a broken equation should keep the PM open');
    UI.pmCancel();
    await idle();
    assert(f.depth.replace(/\s/g, '') === '=W+1', 'cancel kept the depth: ' + f.depth);
    var s = await anvil.equations({ T: 20, W: '=T*2' });
    await idle();
    near(s.volume, 10 * 10 * 41, 1e-6, 'T = 20 → depth 41');
    return 'depth ' + f.depth + ' → volume ' + s.volume;
  });
  step('equation errors reach the status bar ("Equation W: …") and summary().equationErrors', async function () {
    await anvil.run(EQ_PART);
    await idle();
    var s = await anvil.equations([{ name: 'T', expr: '10' }, { name: 'W', expr: 'Q*2' }]);
    await idle();
    assert(s.equationErrors && s.equationErrors.W, 'summary().equationErrors: ' + JSON.stringify(s.equationErrors));
    assert(/^Equation W: /.test(statusText()), 'status: "' + statusText() + '"');
    var row = D.querySelector('#tree .eq-row[data-eq="W"]');
    assert(row && row.classList.contains('err'), 'tree row W should be marked as an error');
    var s2 = await anvil.equations({ T: 10, W: '=T*2' });
    await idle();
    assert(!Object.keys(s2.equationErrors || {}).length, 'errors after the fix: ' + JSON.stringify(s2.equationErrors));
    near(s2.volume, 2000, 1e-6, 'volume after the fix');
    return statusText().slice(0, 80);
  });
  step('sketch: UI.evalInput and the Modify box accept "=T*3"; an unknown name keeps the box open with the error', async function () {
    need(UI, 'evalInput'); need(UI, 'equationVars'); need(UI, 'editDim'); need(UI, 'isDimEditOpen'); need(UI, 'cancelDimEdit');
    await anvil.run('p.equations({ T: 10 });\np.sketch("Front").rect(0, 0, 20, 10).dim(0, "w", { i: 0 }).extrude(5);');
    await idle();
    assert(UI.equationVars().T === 10, 'equationVars: ' + JSON.stringify(UI.equationVars()));
    near(UI.evalInput('=T*3').value, 30, 1e-12, 'evalInput("=T*3")');
    near(UI.evalInput('25.4*2').value, 50.8, 1e-12, 'evalInput("25.4*2")');
    near(UI.evalInput('12').value, 12, 0, 'evalInput("12")');
    assert(UI.evalInput('=Nope').error, 'evalInput("=Nope") should be an error');
    var sk = UI.App.model.features[0];
    UI.enterSketch(sk.id);
    await idle();
    assert(UI.App.mode === 'sketch' && UI.App.activeSketch === sk.id, 'not in the sketch');
    var r = UI.editDim(0, '=T*3');
    assert(r.ok, 'editDim("=T*3"): ' + JSON.stringify(r));
    near(r.value, 30, 1e-9, 'dimension value');
    near(K.findFeature(UI.App.model, sk.id).entities[0].w, 30, 1e-9, 'rect width');
    var bad = UI.editDim(0, '=Nope*2');
    assert(!bad.ok && bad.error, 'editDim("=Nope*2") should fail: ' + JSON.stringify(bad));
    assert(UI.isDimEditOpen(), 'the Modify box should stay open on an error');
    assert($('dim-edit').getAttribute('data-error'), '#dim-edit[data-error] should hold the message');
    near(K.findFeature(UI.App.model, sk.id).entities[0].w, 30, 1e-9, 'width unchanged by the bad entry');
    UI.cancelDimEdit();
    assert(!UI.isDimEditOpen(), 'cancelDimEdit should close the box');
    UI.exitSketch();
    await idle();
    near(anvil.summary().volume, 30 * 10 * 5, 1e-6, 'the rebuilt part follows the new width');
    return 'w = 30 · error: ' + bad.error;
  });
  step('UI.bodyBounds(i) and UI.zoomToBody(i) frame one body of a two-body part; a missing body gives null / false', async function () {
    need(UI, 'bodyBounds'); need(UI, 'zoomToBody');
    await anvil.run(TWO_BODIES);
    await idle();
    var b = UI.bodyBounds(1);
    assert(b && b.min && b.max, 'bodyBounds(1): ' + JSON.stringify(b));
    for (var k = 0; k < 3; k++) { near(b.min[k], [20, 0, 0][k], 1e-6, 'min[' + k + ']'); near(b.max[k], [30, 10, 10][k], 1e-6, 'max[' + k + ']'); }
    var b0 = UI.bodyBounds(0);
    near(b0.max[0], 10, 1e-6, 'body 0 max x');
    assert(UI.zoomToBody(1) === true, 'zoomToBody(1) should return true');
    near(UI.cam.target.x, 25, 1e-6, 'target x'); near(UI.cam.target.y, 5, 1e-6, 'target y'); near(UI.cam.target.z, 5, 1e-6, 'target z');
    assert(UI.bodyBounds(7) === null, 'bodyBounds(7) should be null');
    assert(UI.zoomToBody(7) === false, 'zoomToBody(7) should be false');
    UI.zoomToFit();
  });

