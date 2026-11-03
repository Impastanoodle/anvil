  // ---- rfHH (2026-11-03, lane library): the Design Library task pane (ui-app.js tpLibrary) — folder tree with Back /
  // Up / search, Examples unchanged, Hardware opened or inserted through the size dialog, curved Parts, library
  // features dropped on a picked planar face (sketch + Cut-Extrude Through All), Forming Tools from the kernel.
  function rfHHEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mousedown' ? 1 : 0, clientX: r.left + p[0], clientY: r.top + p[1], detail: 1 }));
  }
  function rfHHClick(p) { rfHHEv('mousemove', p, $('viewport')); rfHHEv('mousedown', p, $('viewport')); rfHHEv('mouseup', p, null); }
  async function rfHHView(name) { UI.setView(name); for (var i = 0; i < 50 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(20); if (UI.finishViewAnimation) UI.finishViewAnimation(); UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation(); await wait(30); }
  function rfHHDontSave() { if (modalOpen() && /Save changes to/.test($('modal-body').textContent)) clickModalButton("Don't Save"); }
  function rfHHRow(name) { return Array.prototype.filter.call(D.querySelectorAll('#tp-body .dl-row'), function (r) { return r.querySelector('.dl-name').textContent === name; })[0]; }
  function rfHHTile(name) { return Array.prototype.filter.call(D.querySelectorAll('#tp-body .dl-tile'), function (t) { return t.querySelector('.dl-name').textContent === name; })[0]; }
  function rfHHShown() { return Array.prototype.filter.call(D.querySelectorAll('#tp-body .dl-tile'), function (t) { return !t.hidden; }).map(function (t) { return t.querySelector('.dl-name').textContent; }); }
  function rfHHOpen() { UI.designLibrary.reset(); UI.openTaskPane('library'); }
  function rfHHSelect(key, value) { var s = D.querySelector('#dl-hw select[data-key="' + key + '"]'); assert(s, 'no ' + key + ' list'); setInput(s, value); }
  var RFHH_PLATE = 'p.units("in"); p.box(4, 3, 0.25);';

  step('rfHH: the Design Library shows its folder tree (Examples, Hardware, Parts, Features, Forming Tools) and opens on Examples with every example', async function () {
    rfHHOpen();
    ['Design Library', 'Examples', 'Hardware', 'Parts', 'Features', 'Forming Tools'].forEach(function (n) { assert(rfHHRow(n), 'tree row ' + n + ' missing'); assert(!rfHHRow(n).hidden, n + ' hidden'); });
    assert(UI.designLibrary.state().folder === 'examples', 'opens on ' + UI.designLibrary.state().folder);
    var shown = rfHHShown();
    anvil.examples.forEach(function (ex) { assert(shown.indexOf(ex.name) >= 0, 'example ' + ex.name + ' not shown'); });
    assert(shown.length === anvil.examples.length, shown.length + ' tiles shown for ' + anvil.examples.length + ' examples');
    assert(/Design Library\s+›\s+Examples/.test(D.querySelector('#tp-body .dl-path').textContent), 'path ' + D.querySelector('#tp-body .dl-path').textContent);
    // the task pane keeps its outer size
    var w = $('tp-panel').getBoundingClientRect().width;
    UI.closeTaskPane(); UI.openTaskPane('home'); var w0 = $('tp-panel').getBoundingClientRect().width; UI.openTaskPane('library');
    near(w, w0, 0.5, 'task pane width');
    return shown.length + ' examples, pane ' + Math.round(w) + ' px';
  });

  step('rfHH: folders open from the tree and from folder tiles; Back, Up and the search box work; Esc in the box clears it', async function () {
    rfHHOpen();
    rfHHRow('Hardware').click(); await wait(10);
    assert(rfHHShown().join() === 'Bolts and Screws,Nuts,Washers,PEM Self-Clinching', 'Hardware shows ' + rfHHShown());
    rfHHTile('Nuts').click(); await wait(10);
    assert(rfHHShown().join() === 'Hex Nuts', 'Nuts shows ' + rfHHShown());
    $('dl-back').click(); await wait(10);
    assert(UI.designLibrary.state().folder === 'hardware', 'Back -> ' + UI.designLibrary.state().folder);
    $('dl-up').click(); await wait(10);
    assert(UI.designLibrary.state().folder === 'lib' && $('dl-up').disabled, 'Up -> ' + UI.designLibrary.state().folder);
    var box = $('dl-search');
    setInput(box, 'washer'); await wait(10);
    assert(rfHHShown().join() === 'Flat Washers', 'search washer: ' + rfHHShown());
    setInput(box, 'PEM'); await wait(10);
    var pem = rfHHShown();
    assert(pem.length === 4 && pem.indexOf('PEM Mounting Hole') >= 0 && pem.indexOf('PEM Studs (FH)') >= 0, 'search PEM: ' + pem);
    setInput(box, 'zzz'); await wait(10);
    assert(!rfHHShown().length && !D.querySelector('#tp-body .dl-empty').hidden, 'no match note');
    box.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await wait(10);
    assert(box.value === '' && UI.designLibrary.state().query === '' && rfHHShown().length === 5, 'Esc clears the search: ' + rfHHShown());
    return pem.join(', ');
  });

  step('rfHH: Hex Bolts opens the size dialog; 1/2-13 x 2 opens as a new inch part of the hand volume', async function () {
    await anvil.newPart(); await idle();
    rfHHOpen();
    rfHHRow('Bolts and Screws').click(); await wait(10);
    rfHHTile('Hex Bolts').click(); await wait(10);
    assert(modalOpen() && $('dl-hw'), 'size dialog');
    rfHHSelect('size', '1/2-13'); rfHHSelect('len', '2');
    assert(/Hex Bolt 1\/2-13 x 2/.test($('dl-hw-info').textContent), $('dl-hw-info').textContent);
    clickModalButton('Open'); rfHHDontSave();
    for (var i = 0; i < 100 && anvil.summary().name !== 'Hex Bolt 1/2-13 x 2'; i++) await wait(50);
    await idle();
    var s = anvil.summary(), want = anvil.library.part('hexBolt', '1/2-13', '2').volume;
    assert(s.name === 'Hex Bolt 1/2-13 x 2' && UI.App.model.units === 'in', s.name + ' ' + UI.App.model.units);
    assert(!Object.keys(s.errors).length, JSON.stringify(s.errors));
    near(s.volume, want, want * 2e-3, 'bolt volume');
    return s.volume + ' in³';
  });

  step('rfHH: in an assembly the size dialog says Insert and puts the washer in as a component', async function () {
    await anvil.newAssembly(); await idle();
    rfHHOpen();
    rfHHRow('Washers').click(); await wait(10);
    rfHHTile('Flat Washers').click(); await wait(10);
    rfHHSelect('size', '3/8 SAE');
    clickModalButton('Insert');
    for (var i = 0; i < 100 && anvil.components().length < 1; i++) await wait(50);
    await idle();
    var c = anvil.components();
    assert(c.length === 1 && c[0].name.indexOf('Flat Washer 3/8 SAE') === 0, JSON.stringify(c.map(function (x) { return x.name; })));
    var want = anvil.library.part('washer', '3/8 SAE').volume;
    near(c[0].volume, want, 6e-4, 'washer volume');   // components() rounds to 3 places
    return c[0].name + ' ' + c[0].volume;
  });

  step('rfHH: select the top face of a plate, click Obround Slot: one undo adds Sketch + Cut-Extrude (Through All) removing slot area × thickness', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(RFHH_PLATE); await idle();
    await rfHHView('Isometric');
    var p = UI.worldToScreen([2, 0.25, 1.5]), hit = UI.pickFace(p[0], p[1]);
    assert(hit && UI.App.mesh.faces[hit.index].normal[1] > 0.99, 'top face under the point');
    rfHHClick(p); await wait(20);
    rfHHOpen();
    rfHHRow('Slots and Keyholes').click(); await wait(10);
    var nBefore = UI.App.model.features.length, undoBefore = UI.App.undo.length;
    rfHHTile('Obround Slot').click(); await wait(20);
    assert(UI.hasPM() && UI.pmTitle() === 'Obround Slot', 'PM ' + (UI.hasPM() && UI.pmTitle()));
    near(+pmField('X').value, 2, 0.03, 'X from the click'); near(+pmField('Y').value, -1.5, 0.03, 'Y from the click');
    setInput(pmField('X'), '1.5'); setInput(pmField('Y'), '-1');
    setInput(pmField('Overall length'), '1'); setInput(pmField('Width'), '0.25'); setInput(pmField('Angle'), '45');
    await pmAccept();
    var f = UI.App.model.features.slice(nBefore);
    assert(f.length === 2 && f[0].type === 'sketch' && f[1].type === 'extrude' && f[1].cut && f[1].end === 'through', 'added ' + JSON.stringify(f.map(function (x) { return x.type; })));
    assert(names().indexOf(f[1].name) >= 0 && Array.prototype.some.call(D.querySelectorAll('#fm-tree *'), function (e) { return e.children.length === 0 && e.textContent === f[1].name; }), 'tree row ' + f[1].name);
    var s = anvil.summary(), area = 0.75 * 0.25 + Math.PI * 0.25 * 0.25 / 4;
    assert(!Object.keys(s.errors).length, JSON.stringify(s.errors));
    near(s.volume, 3 - area * 0.25, 1e-3, 'plate volume');   // summary rounds to 3 places
    near(anvil.mass().volume, 3 - area * 0.25, 1e-7, 'exact volume');   // sketch coordinates kept to 6 places
    assert(UI.App.undo.length === undoBefore + 1, 'one undo step: ' + (UI.App.undo.length - undoBefore));
    UI.undoCommand(); await idle();
    assert(UI.App.model.features.length === nBefore, 'undo removes both');
    return (3 - area * 0.25).toFixed(6);
  });

  step('rfHH: click Keyhole first, then pick the face: ✓ is refused until a face is picked; the cut removes the keyhole area', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(RFHH_PLATE); await idle();
    await rfHHView('Isometric');
    if (UI.setSelection) UI.setSelection([]);
    rfHHOpen();
    rfHHRow('Slots and Keyholes').click(); await wait(10);
    var n0 = UI.App.model.features.length;
    rfHHTile('Keyhole').click(); await wait(20);
    assert(UI.hasPM() && UI.pmTitle() === 'Keyhole', 'PM');
    await UI.pmOK(); await idle();
    assert(UI.hasPM() && UI.App.model.features.length === n0, 'refused without a face');
    var p = UI.worldToScreen([1, 0.25, 2]);
    rfHHClick(p); await wait(20);
    near(+pmField('X').value, 1, 0.03, 'X'); near(+pmField('Y').value, -2, 0.03, 'Y');   // the pixel under the click
    await pmAccept();
    var v = anvil.library.featureDefaults('keyhole', 1), area = anvil.library.featureArea('keyhole', v, 1);
    assert(UI.App.model.features.length === n0 + 2, 'two features');
    near(anvil.mass().volume, 3 - area * 0.25, area * 0.25 * 1e-3, 'keyhole removed');
    return (area * 0.25).toFixed(6);
  });

  step('rfHH: Forming Tools lists the kernel\'s forming tools (or says none are installed); a curved part opens from Parts', async function () {
    rfHHOpen();
    rfHHRow('Forming Tools').click(); await wait(10);
    var ft = (W.Kernel && W.Kernel.FORMING_TOOLS) || null, shown = rfHHShown(), msg;
    if (ft && ft.length) {
      assert(shown.length === ft.length, shown.length + ' tiles for ' + ft.length + ' tools');
      msg = shown.join(', ');
    } else {
      assert(!shown.length && /No forming tools/.test(D.querySelector('#tp-body .dl-empty').textContent), 'empty note');
      msg = 'none installed';
    }
    await anvil.newPart(); await idle();
    rfHHRow('Bent and Swept').click(); await wait(10);
    rfHHTile('D-Handle').click(); rfHHDontSave();
    for (var i = 0; i < 100 && anvil.summary().name !== 'D-Handle'; i++) await wait(50);
    await idle();
    var want = anvil.library.shape('D-Handle').volume;
    near(anvil.mass().volume, want, want * 1e-6, 'D-Handle volume');
    UI.designLibrary.reset(); UI.closeTaskPane();
    return msg;
  });
