  // ---- p9-pm: sheet-metal PropertyManagers, ribbon tab, section default, menu click-through
  function pmIconBtn(key, val) { return D.querySelector('#pm button[data-key="' + key + ':' + val + '"]'); }
  function lastFeature() { var fs = UI.App.model.features; return fs[fs.length - 1]; }
  step('p9-pm: Edge Flange Flange Length reference (new: Outer Virtual Sharp, old: Tangent Bend), Bend from Virtual Sharp, last values remembered', async function () {
    await anvil.run(P9_LB);
    await idle();
    UI.sheetMetalMemory(null);
    UI.cmdEdgeFlange();
    assert(UI.hasPM(), 'Edge-Flange PM not open');
    var titles = ['outer', 'inner', 'tangent'].map(function (r) { var b = pmIconBtn('lengthRef', r); return b ? b.title : '-'; });
    assert(titles.join() === 'Outer Virtual Sharp,Inner Virtual Sharp,Tangent Bend', 'length reference buttons: ' + titles.join());
    assert(pmIconBtn('lengthRef', 'outer').classList.contains('on') && !pmIconBtn('lengthRef', 'tangent').classList.contains('on'), 'a new flange defaults to Outer Virtual Sharp');
    var pos = pmField('Position');
    assert(pos && Array.prototype.some.call(pos.options, function (o) { return o.value === 'virtualSharp' && o.textContent === 'Bend from Virtual Sharp'; }), 'Position lacks Bend from Virtual Sharp');
    assert(UI.App.command.onPick({ kind: 'edge', edge: edgeNear([0, 0.06, 1.5]) }) !== false, 'edge pick rejected');
    setInput(pmField('Length'), 1.25);
    setInput(pmField('Flange angle'), 80);
    setInput(pmField('Position'), 'inside');
    await pmAccept();
    var f = lastFeature(), s = anvil.summary();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    assert(f.type === 'flange' && f.lengthRef === 'outer' && f.length === 1.25 && f.angle === 80 && f.position === 'inside', JSON.stringify(f));
    // the next Edge Flange starts with the values just used (SolidWorks); Cancel does not change them
    UI.cmdEdgeFlange();
    assert(+pmField('Length').value === 1.25 && +pmField('Flange angle').value === 80 && pmField('Position').value === 'inside', 'not remembered: ' + JSON.stringify(UI.sheetMetalMemory()));
    pmIconBtn('lengthRef', 'inner').click();
    assert(pmIconBtn('lengthRef', 'inner').classList.contains('on') && !pmIconBtn('lengthRef', 'outer').classList.contains('on'), 'Inner Virtual Sharp not pressed');
    assert(/Inner Virtual Sharp/.test($('pm').innerText), 'the chosen reference is named in the PM');
    UI.pmCancel();
    UI.cmdEdgeFlange();
    assert(pmIconBtn('lengthRef', 'outer').classList.contains('on'), 'Cancel should not be remembered');
    UI.pmCancel();
    // a flange from before the field: Wall Length (today's geometry, an extra choice only it gets), its own length, and it keeps 'wall' on OK
    await anvil.run(P9_LB + '\np.flange(1.5, [[0, 0.06, 1.5]]);');
    await idle();
    var old = lastFeature();
    assert(!('lengthRef' in old), 'scripted flange has lengthRef: ' + JSON.stringify(old));
    UI.editFeature(old);
    assert(UI.hasPM() && pmIconBtn('lengthRef', 'wall').classList.contains('on'), 'an old flange should show Wall Length');
    assert(+pmField('Length').value === 1.5 && pmField('Position').value === 'bendOutside', 'editing shows the feature, not the remembered values');
    await pmAccept();
    assert(lastFeature().lengthRef === 'wall', 'edited: ' + JSON.stringify(lastFeature()));
    // a millimetre part is not offered the remembered inch length
    await anvil.run('p.sheet(2, 2, 0.71);\np.sketch("Top").rect(0, -60, 100, 60).end().baseFlange(2);');
    await idle();
    UI.cmdEdgeFlange();
    assert(+pmField('Length').value !== 1.25 && pmIconBtn('lengthRef', 'outer').classList.contains('on'), 'inch values offered to a mm part: ' + pmField('Length').value);
    UI.pmCancel();
    return 'flange ' + JSON.stringify({ lengthRef: f.lengthRef, length: f.length, angle: f.angle, position: f.position });
  });
  step('p9-pm: Hem PM Type (Closed, Open, Tear Drop, Rolled) and Position (Material Inside, Bend Outside), size fields per type, remembered', async function () {
    await anvil.run(P9_LB);
    await idle();
    UI.sheetMetalMemory(null);
    UI.cmdHem();
    assert(UI.hasPM(), 'Hem PM not open');
    var types = Array.prototype.map.call(D.querySelectorAll('#pm button[data-key^="hemType:"]'), function (b) { return b.title; });
    assert(types.join() === 'Closed,Open,Tear Drop,Rolled', 'hem types: ' + types.join());
    var posns = Array.prototype.map.call(D.querySelectorAll('#pm button[data-key^="hemPosition:"]'), function (b) { return b.title; });
    assert(posns.join() === 'Material Inside,Bend Outside', 'hem positions: ' + posns.join());
    assert(pmIconBtn('hemType', 'open').classList.contains('on') && pmIconBtn('hemPosition', 'inside').classList.contains('on'), 'a new hem defaults to Open, Material Inside');
    assert(pmField('Hem length') && pmField('Gap distance') && !pmField('Radius') && !pmField('Angle'), 'Open: length and gap');
    pmIconBtn('hemType', 'closed').click();
    assert(pmField('Hem length') && !pmField('Gap distance') && !pmField('Radius'), 'Closed: length only');
    pmIconBtn('hemType', 'teardrop').click();
    assert(pmField('Angle') && pmField('Radius') && !pmField('Hem length') && +pmField('Angle').value === 200, 'Tear Drop: angle 200° and radius');
    pmIconBtn('hemType', 'rolled').click();
    assert(+pmField('Angle').value === 270, 'Rolled starts at 270°: ' + pmField('Angle').value);
    setInput(pmField('Radius'), 0.09);
    pmIconBtn('hemPosition', 'outside').click();
    assert(pmIconBtn('hemPosition', 'outside').classList.contains('on'), 'Bend Outside not pressed');
    assert(UI.App.command.onPick({ kind: 'edge', edge: edgeNear([0, 0.06, 1.5]) }) !== false, 'edge pick rejected');
    await pmAccept();
    var f = lastFeature(), s = anvil.summary();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    assert(f.hem === true && f.hemType === 'rolled' && f.hemPosition === 'outside' && f.hemRadius === 0.09 && f.hemAngle === 270 && f.angle === 180 && !('gap' in f), JSON.stringify(f));
    UI.cmdHem();
    assert(pmIconBtn('hemType', 'rolled').classList.contains('on') && pmIconBtn('hemPosition', 'outside').classList.contains('on') && +pmField('Radius').value === 0.09, 'hem settings not remembered');
    pmIconBtn('hemType', 'open').click();
    setInput(pmField('Gap distance'), 0.03);
    assert(UI.App.command.onPick({ kind: 'edge', edge: edgeNear([4, 0.06, 1.5]) }) !== false, 'second edge pick rejected');
    await pmAccept();
    var g = lastFeature();
    assert(g.hemType === 'open' && !('hemRadius' in g) && !('hemAngle' in g) && Math.abs(g.radius - 0.015) < 1e-12, 'open hem: ' + JSON.stringify(g));
    // a hem from before the fields: Open, Bend Outside
    await anvil.run(P9_LB + '\np.hem(0.375, [[0, 0.06, 1.5]]);');
    await idle();
    var oh = lastFeature();
    assert(oh.hem && !oh.hemType, 'scripted hem: ' + JSON.stringify(oh));
    UI.editFeature(oh);
    assert(UI.hasPM() && pmIconBtn('hemType', 'open').classList.contains('on') && pmIconBtn('hemPosition', 'outside').classList.contains('on'), 'an old hem should show Open, Bend Outside');
    UI.pmCancel();
    return 'hem ' + JSON.stringify({ hemType: f.hemType, hemPosition: f.hemPosition, hemRadius: f.hemRadius, hemAngle: f.hemAngle });
  });
  step('p9-pm: Flat to DXF and the Flatten preview\'s Export DXF open DXF/DWG Output on Sheet metal; bend notes sit inside the blank', async function () {
    await anvil.run(P9_LB + '\np.flange(1.5, [[0, 0.06, 1.5]]);');
    await idle();
    UI.setRibbonTab('Sheet Metal');
    var btn = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return b.getAttribute('aria-label') === 'Flat to DXF'; })[0];
    assert(btn, 'Flat to DXF ribbon button');
    btn.click();
    assert(!modalOpen() && UI.hasPM() && UI.pmTitle() === 'DXF/DWG Output', 'Flat to DXF opened: ' + UI.pmTitle());
    assert(D.querySelector('#pm input[data-key="export:sheet"]').checked, 'Sheet metal export not chosen');
    UI.pmCancel();
    UI.cmdFlatten();
    assert(modalOpen(), 'flat pattern dialog');
    var flat = anvil.flat(), notes = D.querySelectorAll('#modal-body text[data-role="bend-note"]');
    assert(notes.length === flat.bends.length && notes.length === 1, 'bend notes: ' + notes.length);
    var want = W.Kernel.bendNoteText ? W.Kernel.bendNoteText(flat.bends[0], 'in') : flat.bends[0].label;
    assert(notes[0].textContent === want, 'bend note "' + notes[0].textContent + '", expected "' + want + '"');
    var nx = +notes[0].getAttribute('x'), ny = -notes[0].getAttribute('y'), b = flat.bbox;
    assert(nx > b.min[0] && nx < b.max[0] && ny > b.min[1] && ny < b.max[1], 'bend note anchor outside the blank: ' + nx + ', ' + ny + ' in ' + JSON.stringify(b));
    clickModalButton('Export DXF');
    assert(!modalOpen() && UI.hasPM() && UI.pmTitle() === 'DXF/DWG Output' && D.querySelector('#pm input[data-key="export:sheet"]').checked, 'Export DXF should open DXF/DWG Output on Sheet metal');
    UI.pmCancel();
    UI.setRibbonTab('Features');
    return notes[0].textContent;
  });
  step('p9-pm: the CommandManager stays on Sheet Metal through Base Flange (sketch, OK) and a sketch opened from it; a tab clicked in a sketch is kept', async function () {
    UI.loadModel(K.newModel('Tabs'));
    await idle();
    function tab() { return UI.App.ribbonTab; }
    function clickTab(name) { var t = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === name; })[0]; assert(t, 'tab ' + name); t.click(); }
    clickTab('Sheet Metal');
    UI.cmdSketch(); clickPmButton('Top Plane'); await idle();
    assert(UI.App.mode === 'sketch' && tab() === 'Sketch', 'sketch: tab ' + tab());
    UI.activeSketchFeature().entities.push({ t: 'rect', x: 0, y: -60, w: 100, h: 60 });
    UI.cmdBaseFlange();
    await idle();
    assert(UI.hasPM() && UI.pmTitle() === 'Base Flange/Tab', 'Base Flange PM: ' + UI.pmTitle());
    assert(tab() === 'Sheet Metal', 'closing the sketch for Base Flange went to ' + tab());
    await pmAccept();
    var s = anvil.summary();
    assert(Object.keys(s.errors).length === 0 && s.volume > 0, 'base flange: ' + JSON.stringify(s.errors));
    var act = D.querySelector('#ribbon-tabs .rtab.active');
    assert(tab() === 'Sheet Metal' && act && act.textContent === 'Sheet Metal', 'after OK the tab is ' + tab());
    UI.cmdSketch(); clickPmButton('Front Plane'); await idle();
    assert(tab() === 'Sketch', 'sketch tab ' + tab());
    await UI.exitSketch(); await idle();
    assert(tab() === 'Sheet Metal', 'Exit Sketch went to ' + tab());
    UI.cmdSketch(); clickPmButton('Front Plane'); await idle();
    clickTab('Evaluate');
    await UI.exitSketch(); await idle();
    assert(tab() === 'Evaluate', 'a tab clicked in the sketch should stay: ' + tab());
    clickTab('Features');
    return 'tabs ok';
  });
  step('p9-pm: Edit Feature on Base-Flange1 (Sheet-Metal PM) keeps the part on screen', async function () {
    await anvil.run(P9_LB + '\np.flange(1.5, [[0, 0.06, 1.5]]);');
    await idle();
    var mesh0 = UI.App.mesh, bf = UI.App.model.features.filter(function (q) { return q.sheetBase; })[0];
    assert(bf, 'no Base Flange');
    UI.editFeature(bf);
    assert(UI.hasPM() && UI.pmTitle() === 'Sheet-Metal', 'PM: ' + UI.pmTitle());
    await idle(); await wait(150);
    assert(UI.App.rollback == null && UI.App.mesh === mesh0 && mesh0.triCount > 0, 'the part was rolled back to before the Base Flange (rollback ' + UI.App.rollback + ')');
    UI.pmCancel();
    await idle();
    return mesh0.triCount + ' triangles shown';
  });
  step('p9-pm: Section View starts through the middle of the part (plane follows the reference until an offset is typed)', async function () {
    await anvil.run('p.sketch("Front").rect(10, 0, 40, 20).extrude(10);');
    await idle();
    var bb = UI.modelBounds();
    UI.cmdSection();
    assert(UI.hasPM(), 'Section PM not open');
    var off = pmField('Offset distance');
    near(+off.value, (bb.min[0] + bb.max[0]) / 2, 1e-6, 'Right plane offset');
    var c = new W.THREE.Vector3((bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2);
    near(UI.App.view.section.plane.distanceToPoint(c), 0, 1e-6, 'section plane through the centre');
    setInput(pmField('Reference plane'), 'Top');
    near(+pmField('Offset distance').value, (bb.min[1] + bb.max[1]) / 2, 1e-6, 'Top plane offset');
    setInput(pmField('Offset distance'), 3);
    setInput(pmField('Reference plane'), 'Front');
    near(+pmField('Offset distance').value, 3, 1e-12, 'a typed offset is kept');
    UI.pmCancel();
    assert(!UI.App.view.section, 'section left on');
    return 'x ' + fmt((bb.min[0] + bb.max[0]) / 2);
  });
  step('p9-pm: a menu item click never reaches the ribbon under it; the press that closes a menu does not start a command; tall menus stay below the bar', async function () {
    UI.loadModel(K.newModel('Menus'));
    await idle();
    UI.setRibbonTab('Features');
    var rev = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return b.getAttribute('aria-label') === 'Revolved Boss/Base'; })[0];
    assert(rev, 'Revolved Boss/Base button');
    var r = rev.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    var nRev = 0, nFit = 0, cmdRevolve = UI.cmdRevolve, zoomToFit = UI.zoomToFit;
    function mouse(target, type) { target.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, view: W, detail: 1, button: 0, clientX: x, clientY: y })); }
    function openMenu(label) { var li = Array.prototype.filter.call(D.querySelectorAll('#menus > li'), function (l) { return l.textContent === label; })[0]; li.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, view: W, detail: 1, button: 0 })); return li; }
    try {
      UI.cmdRevolve = function () { nRev++; };
      UI.zoomToFit = function () { nFit++; };
      // a row pressed and released over the Revolve button's position: the row runs, the click that follows does not
      var li = openMenu('View');
      var row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return /Zoom to Fit/.test(m.textContent); })[0];
      assert(row, 'View ▸ Zoom to Fit row');
      var m = D.querySelector('.menu'), mr = m.getBoundingClientRect(), lr = li.getBoundingClientRect();
      assert(mr.top >= lr.bottom - 1 && mr.bottom <= W.innerHeight + 1, 'the View menu should open below the bar and fit the window: ' + JSON.stringify([mr.top, mr.bottom, lr.bottom, W.innerHeight]));
      mouse(row, 'mousedown'); mouse(row, 'mouseup'); mouse(rev, 'click'); row.click();
      assert(nFit === 1 && nRev === 0 && !UI.menuOpen(), 'menu row: zoom ' + nFit + ', revolve ' + nRev);
      // a press outside an open menu closes it and its click goes nowhere
      openMenu('File');
      assert(UI.menuOpen(), 'File menu not open');
      mouse(rev, 'mousedown'); mouse(rev, 'mouseup'); mouse(rev, 'click');
      assert(!UI.menuOpen() && nRev === 0, 'closing click started Revolve: ' + nRev);
      // the next click on the button works
      mouse(rev, 'mousedown'); mouse(rev, 'mouseup'); mouse(rev, 'click');
      assert(nRev === 1, 'Revolve after the menu closed: ' + nRev);
    } finally { UI.cmdRevolve = cmdRevolve; UI.zoomToFit = zoomToFit; if (UI.closeMenus) UI.closeMenus(); }
    return 'zoom ' + nFit + ', revolve ' + nRev;
  });
  step('p9-sketchedbend: Sketched Bend from the Sheet Metal tab — line sketched on the face, fixed face click, ✓, tree row, flat size; Edit Feature to Material Inside', async function () {
    var T = 0.0598, BA = Math.PI / 2 * (T + 0.5 * T);
    await anvil.run('p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.sketch("Top", ' + T + ').line(3, 0, 3, -4);');
    await idle();
    UI.setRibbonTab('Sheet Metal');
    var btn = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (b) { return /Sketched\s*Bend/.test(b.textContent); })[0];
    assert(btn && !btn.disabled, 'Sketched Bend ribbon button enabled');
    btn.click();
    assert(UI.hasPM() && UI.pmTitle() === 'Sketched Bend', 'PM: ' + (UI.hasPM() ? UI.pmTitle() : 'none'));
    assert(pmField('Bend position').value === 'centerline', 'default Bend Centerline: ' + pmField('Bend position').value);
    near(+pmField('Bend angle').value, 90, 1e-12, 'default bend angle');
    // the fixed face: a click on the left half of the top face
    assert(UI.App.command.onPick({ kind: 'face', index: faceWithNormal([0, 1, 0]), point: [1, T, 2] }) !== false, 'face pick rejected');
    assert(/Fixed face <1>/.test($('pm').innerText), 'fixed face listed: ' + $('pm').innerText.replace(/\s+/g, ' ').slice(0, 200));
    assert(UI.groups.preview.children.length > 0, 'preview shown');
    await pmAccept();
    var s = anvil.summary();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'sketchedBend' && f.name === 'SketchBend1' && f.fixed[0] === 1 && f.position === 'centerline' && f.angle === 90, JSON.stringify(f));
    var row = D.querySelector('#tree .ti[data-fid="' + f.id + '"]');
    assert(row && /SketchBend1/.test(row.textContent), 'tree row');
    near(s.bbox.max[0], 3 - BA / 2 + 2 * T, 1e-6, 'wall outside face'); near(s.bbox.max[1], 2 * T + 3 - BA / 2, 1e-6, 'wall top');
    var flat = anvil.flat();
    near(flat.size[0], 6, 1e-6, 'flat length'); near(flat.size[1], 4, 1e-6, 'flat width');
    assert(flat.bends.length === 1 && /^UP 90°/.test(flat.bends[0].label) && Math.abs(flat.bends[0].a[0] - 3) < 1e-6, 'bend: ' + JSON.stringify(flat.bends));
    // Edit Feature reopens the PropertyManager; Material Inside puts the wall's outside face on the line
    UI.editFeature(f);
    assert(UI.hasPM() && UI.pmTitle() === 'SketchBend1', 'edit PM: ' + (UI.hasPM() ? UI.pmTitle() : 'none'));
    setInput(pmField('Bend position'), 'inside');
    await pmAccept();
    s = anvil.summary();
    assert(Object.keys(s.errors).length === 0 && f.position === 'inside', JSON.stringify(s.errors) + ' ' + JSON.stringify(f));
    near(s.bbox.max[0], 3, 1e-6, 'Material Inside: wall outside face on the line');
    flat = anvil.flat();
    near(flat.size[0], 6, 1e-6, 'flat length after the edit');
    return UI.flatSizeText(flat) + ', bend line at ' + fmt(flat.bends[0].a[0]);
  });
