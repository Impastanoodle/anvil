  // ---- multi-body parts: Solid Bodies folder, Merge result, Feature Scope, hide/show, anvil.bodies()
  // two 10 mm cubes: body 0 at x ∈ [0,10], body 1 at x ∈ [20,30] (both y ∈ [0,10], z ∈ [0,10]); features 1..4
  var TWO_BODIES = 'p.box(10, 10, 10);\np.box(10, 10, 10, { at: [20, 0, 0], merge: false });';
  function bodyRows() { return Array.prototype.slice.call(D.querySelectorAll('#tree .ti.body-row')); }
  function rowName(row) { var nm = row.querySelector('.nm'); return (nm ? nm.textContent : row.textContent).trim(); }
  // the <option> of a PM select whose text contains `text`
  function selectOption(sel, text) {
    for (var i = 0; i < sel.options.length; i++) if (sel.options[i].textContent.indexOf(text) >= 0) return sel.options[i];
    return null;
  }
  step('multi-body: two boxes with merge: false show Solid Bodies(2) with rows Boss-Extrude1 / Boss-Extrude2; anvil.bodies() and summary().bodies agree', async function () {
    var s = await anvil.run(TWO_BODIES);
    await idle();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    near(s.volume, 2000, 1e-6, 'total volume');
    assert(s.bodies === 2, 'summary().bodies = ' + JSON.stringify(s.bodies));
    assert(typeof anvil.bodies === 'function', 'anvil.bodies() is missing');
    var bs = anvil.bodies();
    assert(Array.isArray(bs) && bs.length === 2, 'anvil.bodies(): ' + JSON.stringify(bs));
    near(bs[0].volume, 1000, 1e-3, 'body 0 volume'); near(bs[1].volume, 1000, 1e-3, 'body 1 volume');
    assert(bs[0].index === 0 && bs[1].index === 1, 'indices ' + JSON.stringify(bs.map(function (b) { return b.index; })));
    assert(bs[0].name === 'Boss-Extrude1' && bs[1].name === 'Boss-Extrude2', 'names ' + JSON.stringify(bs.map(function (b) { return b.name; })));
    var folder = D.querySelector('#tree .ti.bodies-folder');
    assert(folder, 'tree has no .ti.bodies-folder row');
    assert(/Solid Bodies\(2\)/.test(folder.textContent), 'folder row text: ' + folder.textContent.trim());
    var rows = bodyRows();
    assert(rows.length === 2, 'body rows: ' + rows.length + ' (folder open by default when there are two bodies?)');
    assert(rows[0].getAttribute('data-body') === '0' && rows[1].getAttribute('data-body') === '1', 'data-body: ' + rows.map(function (r) { return r.getAttribute('data-body'); }).join(', '));
    assert(rowName(rows[0]).indexOf('Boss-Extrude1') === 0 && rowName(rows[1]).indexOf('Boss-Extrude2') === 0, 'row names: ' + rows.map(rowName).join(', '));
    return folder.textContent.trim() + ' · ' + rows.map(rowName).join(', ');
  });
  step('multi-body: anvil.selectBody(1), UI.selectBody(0) and a click on a body row set App.sel = { kind: "body", index }', async function () {
    assert(typeof anvil.selectBody === 'function', 'anvil.selectBody is missing');
    assert(typeof UI.selectBody === 'function', 'UI.selectBody is missing');
    anvil.selectBody(1);
    assert(UI.App.sel && UI.App.sel.kind === 'body' && UI.App.sel.index === 1, 'after anvil.selectBody(1): ' + JSON.stringify(UI.App.sel));
    UI.selectBody(0);
    assert(UI.App.sel && UI.App.sel.kind === 'body' && UI.App.sel.index === 0, 'after UI.selectBody(0): ' + JSON.stringify(UI.App.sel));
    var rows = bodyRows();
    assert(rows.length === 2, 'body rows: ' + rows.length);
    rows[1].click();
    assert(UI.App.sel && UI.App.sel.kind === 'body' && UI.App.sel.index === 1, 'after clicking the second body row: ' + JSON.stringify(UI.App.sel));
    var selRow = D.querySelector('#tree .ti.body-row.selected');
    assert(!selRow || selRow.getAttribute('data-body') === '1', 'the selected row should be body 1, got ' + (selRow && selRow.getAttribute('data-body')));
    UI.App.sel = null; UI.updateHighlights();
    return 'selection ' + JSON.stringify({ kind: 'body', index: 1 });
  });
  step('multi-body: UI.setBodyHidden(1, true) hides body 1 from the viewport only; the mesh and mass properties keep both bodies', async function () {
    assert(typeof UI.setBodyHidden === 'function' && typeof UI.isBodyHidden === 'function', 'UI.setBodyHidden / UI.isBodyHidden are missing');
    assert(!UI.isBodyHidden(1) && !UI.isBodyHidden(0), 'nothing should be hidden at the start');
    UI.setBodyHidden(1, true);
    assert(UI.isBodyHidden(1) === true, 'isBodyHidden(1) after hiding');
    assert(UI.App.hiddenBodies && UI.App.hiddenBodies[1], 'App.hiddenBodies should record body 1: ' + JSON.stringify(UI.App.hiddenBodies));
    assert(!UI.isBodyHidden(0), 'body 0 stays visible');
    near(anvil.mass().volume, 2000, 1e-6, 'mass properties still cover both bodies');
    assert(UI.App.mesh.faces.length === 12, 'App.mesh keeps its 12 faces, got ' + UI.App.mesh.faces.length);
    assert(anvil.bodies().length === 2, 'anvil.bodies() still lists two bodies');
    UI.setBodyHidden(1, false);
    assert(!UI.isBodyHidden(1), 'isBodyHidden(1) after showing again');
    assert(!UI.App.hiddenBodies[1], 'App.hiddenBodies cleared: ' + JSON.stringify(UI.App.hiddenBodies));
    await idle();
    return 'hidden then shown; volume ' + anvil.mass().volume;
  });
  step('Boss-Extrude PM: "Merge result" is checked by default; unchecked, a touching boss commits merge: false and becomes a second body', async function () {
    // the new sketch touches the cube along its x = 10 face: with Merge result on it would join body 0 (one body of 2000)
    await anvil.run('p.box(10, 10, 10);\np.sketch("Top", 0).rect(10, -10, 10, 10);');
    await idle();
    assert(anvil.summary().bodies === 1, 'one body to start: ' + anvil.summary().bodies);
    UI.cmdExtrude(false);
    assert(UI.hasPM(), 'Extrude PM not open');
    var cb = pmField('Merge result');
    assert(cb && cb.type === 'checkbox', 'Merge result checkbox missing');
    assert(cb.checked, 'Merge result should be checked by default');
    setInput(pmNumber(0), 10);
    cb.click();
    cb = pmField('Merge result');
    assert(cb && !cb.checked, 'Merge result should be unchecked after the click');
    await pmAccept();
    assert(!UI.hasPM(), 'PM still open');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'extrude' && !f.cut && f.merge === false, 'committed feature: ' + JSON.stringify(f));
    var s = anvil.summary();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    near(s.volume, 2000, 1e-6, 'volume');
    assert(s.bodies === 2, 'summary().bodies = ' + JSON.stringify(s.bodies));
    var folder = D.querySelector('#tree .ti.bodies-folder');
    assert(folder && /Solid Bodies\(2\)/.test(folder.textContent), 'folder: ' + (folder && folder.textContent.trim()));
    assert(/merge: false/.test(anvil.script()), 'script lacks merge: false: ' + anvil.script().split('\n').pop());
    // editing shows the stored state; the same boss with Merge result on joins body 0
    UI.editFeature(f);
    assert(UI.hasPM(), 'edit PM not open');
    var cb2 = pmField('Merge result');
    assert(cb2 && !cb2.checked, 'edit PM should show Merge result unchecked');
    cb2.click();
    await pmAccept();
    var f2 = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f2.merge !== false, 'merge: false should be gone after re-checking the box: ' + JSON.stringify(f2));
    assert(anvil.summary().bodies === 1, 'with Merge result on the touching boss joins body 0: ' + anvil.summary().bodies + ' bodies');
    near(anvil.summary().volume, 2000, 1e-6, 'volume unchanged by merging');
    return 'merge: false → 2 bodies, merged again → 1 body';
  });
  step('Cut-Extrude PM on a two-body part: Feature Scope ▸ Selected bodies ▸ Boss-Extrude2 commits bodies: [1] and cuts body 1 only', async function () {
    // the sketch sits on the top faces (Top plane, offset 10): x ∈ [0,30], z ∈ [3,7]; cut through all, reversed into the cubes
    await anvil.run(TWO_BODIES + '\np.sketch("Top", 10).rect(0, -7, 30, 4);');
    await idle();
    assert(anvil.summary().bodies === 2, 'two bodies to start');
    UI.cmdExtrude(true);
    assert(UI.hasPM(), 'Cut-Extrude PM not open');
    assert(/Feature Scope/.test($('pm').innerText), 'PM has no Feature Scope group: ' + $('pm').innerText.replace(/\s+/g, ' ').slice(0, 200));
    var sel = pmField('Bodies');
    assert(sel && sel.tagName === 'SELECT', 'Bodies select missing');
    assert(selectOption(sel, 'All bodies') && selectOption(sel, 'Selected bodies'), 'options: ' + Array.prototype.map.call(sel.options, function (o) { return o.textContent; }).join(' | '));
    assert(sel.options[sel.selectedIndex].textContent.indexOf('All bodies') >= 0, 'All bodies should be the default, got ' + sel.options[sel.selectedIndex].textContent);
    assert(!pmField('Boss-Extrude2'), 'body checkboxes should only appear for Selected bodies');
    setInput(sel, selectOption(sel, 'Selected bodies').value);
    var b2 = pmField('Boss-Extrude2');
    assert(b2 && b2.type === 'checkbox', 'Boss-Extrude2 checkbox missing after choosing Selected bodies');
    if (!b2.checked) b2.click();
    var b1 = pmField('Boss-Extrude1');
    assert(b1 && b1.type === 'checkbox' && !b1.checked, 'Boss-Extrude1 should be listed and unchecked');
    assert(pmField('Boss-Extrude2').checked, 'Boss-Extrude2 should be checked');
    // the cut PM opens as Through All (no depth field); reversed, it runs down through both cubes
    var rev = pmField('Reverse direction');
    assert(rev && rev.type === 'checkbox', 'Reverse direction checkbox missing');
    if (!rev.checked) rev.click(); // the sketch is on the top faces: the cut must go down into the cubes
    await pmAccept();
    assert(!UI.hasPM(), 'PM still open');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'extrude' && f.cut === true && JSON.stringify(f.bodies) === '[1]', 'committed feature: ' + JSON.stringify(f));
    var s = anvil.summary();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    var bs = anvil.bodies();
    assert(bs.length === 2, 'bodies after the cut: ' + bs.length);
    near(bs[0].volume, 1000, 1e-3, 'body 0 untouched'); near(bs[1].volume, 600, 1e-3, 'body 1 lost 10 × 4 × 10');
    near(s.volume, 1600, 1e-6, 'total volume');
    var warn = UI.App.build && UI.App.build.warnings && UI.App.build.warnings[f.id];
    assert(!warn, 'the scoped cut warned: ' + warn);
    assert(/bodies: \[1\]/.test(anvil.script()), 'script lacks bodies: [1]: ' + anvil.script().split('\n').pop());
    // editing the cut reopens the PM on Selected bodies with Boss-Extrude2 checked
    UI.editFeature(f);
    assert(UI.hasPM(), 'edit PM not open');
    var sel2 = pmField('Bodies');
    assert(sel2 && sel2.options[sel2.selectedIndex].textContent.indexOf('Selected bodies') >= 0, 'edit PM scope: ' + (sel2 && sel2.options[sel2.selectedIndex].textContent));
    var e2 = pmField('Boss-Extrude2'), e1 = pmField('Boss-Extrude1');
    assert(e2 && e2.checked && e1 && !e1.checked, 'edit PM body checks: Boss-Extrude1 ' + (e1 && e1.checked) + ', Boss-Extrude2 ' + (e2 && e2.checked));
    UI.pmCancel();
    await idle();
    return 'bodies ' + bs.map(function (b) { return b.name + ' ' + b.volume; }).join(', ') + ', feature ' + f.name + ' bodies=' + JSON.stringify(f.bodies);
  });
  step('Cut-Extrude PM on a single-body part has no Feature Scope group', async function () {
    await anvil.run('p.box(20, 20, 10);\np.sketch("Top", 10).rect(5, -15, 5, 5);');
    await idle();
    assert(anvil.summary().bodies === 1, 'one body: ' + anvil.summary().bodies);
    UI.cmdExtrude(true);
    assert(UI.hasPM(), 'Cut-Extrude PM not open');
    assert(!/Feature Scope/.test($('pm').innerText), 'Feature Scope should not be offered on a single-body part');
    assert(!pmField('Selected bodies') && !pmField('Boss-Extrude1'), 'no body scope fields expected');
    UI.pmCancel();
    await idle();
    // and a plain part's tree says Solid Bodies(1) with one row
    var folder = D.querySelector('#tree .ti.bodies-folder');
    assert(folder && /Solid Bodies\(1\)/.test(folder.textContent), 'folder: ' + (folder && folder.textContent.trim()));
    return folder.textContent.trim();
  });
  step('Mass Properties on a two-body part lists each body with its own volume', async function () {
    await anvil.run(TWO_BODIES);
    await idle();
    UI.showMassProperties();
    assert(modalOpen(), 'Mass Properties modal expected');
    var text = $('modal-body').innerText;
    assert(/Boss-Extrude1/.test(text) && /Boss-Extrude2/.test(text), 'modal should list both bodies by name: ' + text.replace(/\s+/g, ' ').slice(0, 240));
    assert(/2000/.test(text), 'modal should show the total volume 2000: ' + text.replace(/\s+/g, ' ').slice(0, 240));
    assert((text.match(/\b1000\b/g) || []).length >= 2, 'modal should show 1000 for each body: ' + text.replace(/\s+/g, ' ').slice(0, 240));
    UI.closeModal();
    assert(!modalOpen(), 'modal still open');
    return text.replace(/\s+/g, ' ').slice(0, 160);
  });

