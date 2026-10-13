  // ---- exchange.js: neutral formats (STEP / 3MF / OBJ / STL) in File ▸ Open, Save As, Insert ▸ Features ▸ Imported
  function fixtureText(name) { return fetch('fixtures/' + name).then(function (r) { if (!r.ok) throw new Error('fixture ' + name + ': HTTP ' + r.status); return r.text(); }); }
  // the FeatureManager row of a feature (a Solid Bodies row can carry the same name: its body is named after the feature)
  function treeRow(name) { return Array.prototype.filter.call(D.querySelectorAll('#tree .ti'), function (r) { var nm = r.querySelector('.nm'); return nm && nm.textContent === name && !/volume/.test(nm.title); })[0]; }
  step('exchange: anvil.importFile opens a STEP written by OpenCascade as a new part whose only feature is Imported1 (tree row with icon and tooltip), and a Cut-Extrude script cuts it (27875 - 320)', async function () {
    var txt = await fixtureText('occ-block.step');
    var s = await anvil.importFile('occ-block.step', txt); await idle();
    assert(s.type === 'part' && s.features === 1 && names()[0] === 'Imported1', 'summary ' + JSON.stringify({ type: s.type, features: s.features, names: names() }));
    near(s.volume, 27875, 1e-3, 'imported volume');
    var row = treeRow('Imported1');
    assert(row && row.querySelector('svg') && /Imported STEP from occ-block\.step, 1 solid/.test(row.querySelector('.nm').title), 'tree row ' + (row && row.querySelector('.nm').title));
    var s2 = await anvil.append('p.sketch("Front").rect(2, 2, 4, 4).extrude(30, { cut: true, end: "through" });'); await idle();
    near(s2.volume, 27875 - 320, 1e-3, 'after cut');
    assert(!Object.keys(s2.errors).length, JSON.stringify(s2.errors));
    return s2.features + ' features, volume ' + s2.volume;
  });
  step('exchange: double-clicking Imported1 opens its PropertyManager (file, solids, triangles, Merge result); OK keeps the geometry', async function () {
    var row = treeRow('Imported1');
    row.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true }));
    assert(UI.hasPM() && /Imported from occ-block\.step \(STEP\): 1 solid, \d+ triangles/.test($('pm').textContent), 'PM text: ' + $('pm').textContent.slice(0, 200));
    var merge = pmField('Merge result');
    assert(merge && merge.type === 'checkbox' && !merge.checked, 'Merge result checkbox');
    await pmAccept();
    near(anvil.summary().volume, 27875 - 320, 1e-3, 'volume after OK');
    return 'ok';
  });
  step('exchange: File ▸ Save As lists Part / script / STEP / 3MF / OBJ / STL / DXF / DWG; File ▸ Export STEP AP214… preselects STEP and Save downloads it; exportData gives 3MF bytes and OBJ + .mtl', async function () {
    var rows = menuRows('Export STEP AP214');
    assert(rows.length === 1 && /File/.test(rows[0].menu), 'File ▸ Export STEP row');
    UI.closeMenus();
    var r3 = menuRows('Export 3MF'); UI.closeMenus();
    var ro = menuRows('Export OBJ'); UI.closeMenus();
    assert(r3.length === 1 && ro.length === 1, 'Export 3MF / OBJ rows');
    rows = menuRows('Export STEP AP214');
    rows[0].row.click();
    assert(modalOpen() && /Save As/.test($('modal-title').textContent), 'Save As dialog');
    var sel = D.querySelector('#modal-body select');
    var opts = Array.prototype.map.call(sel.options, function (o) { return o.value; }).join(',');
    assert(opts === 'json,script,step,3mf,obj,stl,dxf,dwg' && sel.value === 'step', 'types ' + opts + ' selected ' + sel.value);   // dxf / dwg: the DXF/DWG Output PropertyManager
    clickModalButton('Save');
    await wait(20);
    assert(!modalOpen() && /Saved \S+\.step/.test(statusText()), 'status ' + statusText());
    var dl = W.__downloads[W.__downloads.length - 1];
    assert(dl && /\.step$/.test(dl.name), 'the STEP file was handed to the browser as a download: ' + JSON.stringify(dl && dl.name));
    var tmf = UI.exportData('3mf', 'x'), obj = UI.exportData('obj', 'x');
    assert(tmf.name === 'x.3mf' && tmf.data instanceof W.Uint8Array && tmf.data[0] === 0x50, '3mf bytes');
    assert(obj.name === 'x.obj' && /^mtllib x\.mtl$/m.test(obj.data) && obj.extra && obj.extra.name === 'x.mtl' && /newmtl/.test(obj.extra.data), 'obj + mtl');
    assert(/MANIFOLD_SOLID_BREP/.test(anvil.exportStep()) && /^o /m.test(anvil.exportObj()) && anvil.export3mf().length > 1000, 'anvil.exportStep / exportObj / export3mf');
    // the part's material (materials.js) goes out with it
    await anvil.append('p.material("Brass");'); await idle();
    assert(/^newmtl Brass$/m.test(anvil.exportMtl()) && /^usemtl Brass$/m.test(anvil.exportObj()), 'OBJ material');
    assert(/<base name="Brass" displaycolor="#[0-9A-F]{6}FF"\/>/.test(W.Exchange.fromUtf8(W.Exchange.unzip(anvil.export3mf())['3D/3dmodel.model'])), '3MF basematerial');
    assert(/PRODUCT\('occ-block','occ-block'/.test(anvil.exportStep()), 'STEP product name unchanged');
    return 'types ' + opts;
  });
  step('exchange: File ▸ Open has a Files of type filter; a 3MF picked in its file input opens as a new part (Imported1, same volume); pasting an ASCII STL opens too', async function () {
    await anvil.run('p.name("Blocky"); p.box(30, 20, 10); p.hole("Top", 15, -10, 6, { offset: 10 });'); await idle();
    var vol = anvil.summary().volume, bytes = anvil.export3mf(), stl = anvil.stl();
    UI.fileOpen(); dontSaveIfAsked();   // the scripted part is unsaved: "Save changes to Blocky?" comes first
    assert(modalOpen() && /Open/.test($('modal-title').textContent), 'Open dialog');
    var sel = D.querySelector('#modal-body select'), inp = D.querySelector('#modal-body input[type=file]');
    assert(sel.options.length === 9 && /\.step/.test(inp.accept) && /\.igs/.test(inp.accept) && /\.3mf/.test(inp.accept) && /\.dxf/.test(inp.accept) && /\.dwg/.test(inp.accept), 'type list / accept ' + inp.accept);   // dxf-import: + DXF as a 2D sketch; dwg-import: + DWG
    sel.value = 'stl'; sel.dispatchEvent(new W.Event('change'));
    assert(inp.accept === '.stl', 'filter narrows accept: ' + inp.accept);
    var dt = new W.DataTransfer();
    dt.items.add(new W.File([bytes], 'blocky.3mf', { type: 'model/3mf' }));
    inp.files = dt.files;
    inp.dispatchEvent(new W.Event('change'));
    await wait(100);
    clickModalButton('Open');
    for (var i = 0; i < 50 && modalOpen(); i++) await wait(50);
    await idle();
    var s = anvil.summary();
    assert(!modalOpen() && s.name === 'blocky' && names().join() === 'Imported1', 'opened ' + s.name + ': ' + names().join());
    near(s.volume, vol, 1e-3 * vol, '3MF volume');
    UI.fileOpen(); dontSaveIfAsked();
    D.querySelector('#modal-body textarea').value = stl;
    clickModalButton('Open');
    for (i = 0; i < 50 && modalOpen(); i++) await wait(50);
    await idle();
    s = anvil.summary();
    assert(s.name === 'Pasted' && names().join() === 'Imported1' && UI.App.model.features[0].format === 'stl', 'pasted STL: ' + s.name + ' ' + names().join());
    near(s.volume, vol, 1e-3 * vol, 'STL volume');
    return 'volume ' + s.volume;
  });
  step('exchange: Insert ▸ Features ▸ Imported… is in the Insert menu; importing into the open part appends Imported1 as a second body; one undo removes it', async function () {
    var rows = menuRows('Features ▸ Imported');
    assert(rows.length === 1 && /Insert/.test(rows[0].menu), 'Insert menu row');
    UI.closeMenus();
    await anvil.run('p.name("Host"); p.box(10, 10, 10);'); await idle();
    var cube = 'o Far\nv 20 0 0\nv 25 0 0\nv 25 5 0\nv 20 5 0\nv 20 0 5\nv 25 0 5\nv 25 5 5\nv 20 5 5\nf 1 4 3 2\nf 5 6 7 8\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8\n';
    var s = await anvil.importFile('far.obj', cube, { into: 'current' }); await idle();
    assert(names()[names().length - 1] === 'Imported1' && s.bodies === 2, 'features ' + names().join() + ', bodies ' + s.bodies);
    near(s.volume, 1000 + 125, 1e-6, 'volume');
    UI.undo(); await idle();
    assert(names().indexOf('Imported1') < 0, 'undo: ' + names().join());
    near(anvil.summary().volume, 1000, 1e-6, 'after undo');
    return 'ok';
  });
  step('exchange: an assembly (Pinned plate) exports STEP with 4 NEXT_ASSEMBLY_USAGE_OCCURRENCEs, 3MF with 4 build items and OBJ with 4 groups; Save As offers Assembly (*.anvil.json)', async function () {
    await UI.openExample(W.AnvilExamples.filter(function (e) { return e.name === 'Pinned plate assembly'; })[0]); await idle();
    var step = anvil.exportStep(), xml = W.Exchange.fromUtf8(W.Exchange.unzip(anvil.export3mf())['3D/3dmodel.model']), obj = anvil.exportObj();
    assert((step.match(/=NEXT_ASSEMBLY_USAGE_OCCURRENCE\(/g) || []).length === 4, 'NAUO');
    assert((xml.match(/<item /g) || []).length === 4, '3MF items');
    assert((obj.match(/^o /gm) || []).length === 4, 'OBJ groups');
    var back = W.Exchange.importFile('a.step', step);
    // true curves: the STEP keeps the pins' and holes' cylinders, so the re-imported solids measure the exact volume
    var bb = W.Kernel.rebuild(W.Exchange.newPartFromImport(back));
    near(bb.bodies.reduce(function (t, body) { return t + W.Kernel.massProps(W.Kernel.meshFromBody(body), 1).volume; }, 0), anvil.summary().volume, 1e-3, 'STEP volume');
    UI.fileSaveAs();
    var first = D.querySelector('#modal-body select').options[0].textContent;
    clickModalButton('Cancel');
    assert(/^Assembly/.test(first), 'first type ' + first);
    await anvil.newPart('Part1'); await idle();   // (UI.newPart is the File menu's, which asks to save a changed document)
    return 'volume ' + anvil.summary().volume;
  });
