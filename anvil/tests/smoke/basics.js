  // ---- steps
  step('app booted: anvil, UI, Kernel, THREE present, no boot errors', async function () {
    assert(W.anvil && W.UI && W.Kernel && W.THREE, 'globals missing');
    assert($('tree') && $('pm') && $('viewport'), 'layout missing');
    // downloads (File ▸ Save As, exports, drawing SVG / DXF / PDF) are recorded in W.__downloads instead of saved,
    // so a test run never drops files on the user's disk or asks where to save them
    W.__downloads = [];
    var aClick = W.HTMLAnchorElement.prototype.click;
    W.HTMLAnchorElement.prototype.click = function () {
      if (this.hasAttribute('download')) { W.__downloads.push({ name: this.getAttribute('download'), href: this.href }); return; }
      return aClick.apply(this, arguments);
    };
    // the OpenCascade switch is remembered per browser: every step runs with Anvil's own face grouping
    if (W.anvil.occt) W.anvil.occt(false, { remember: false });
    await idle();
    return 'status: ' + statusText().slice(0, 60);
  });
  step('new part via loadModel', async function () {
    UI.loadModel(K.newModel('Smoke'));
    await idle();
    assert($('doc-title').textContent === 'Smoke', 'title');
    assert(anvil.summary().features === 0, 'features');
  });
  step('every Design Library example builds through anvil.run', async function () {
    var out = [];
    for (var i = 0; i < anvil.examples.length; i++) {
      var ex = anvil.examples[i];
      var s = await anvil.run(ex.code);
      await idle();
      assert(Object.keys(s.errors).length === 0, ex.name + ': ' + JSON.stringify(s.errors));
      assert(s.volume > 0 && s.faces > 0, ex.name + ': empty body');
      if (W.Assembly && W.Assembly.isAssemblyScript(ex.code)) {
        // an assembly example (kind: 'assembly'): no features, one tree row per component
        assert(s.type === 'assembly' && s.components > 0, ex.name + ': opened as ' + s.type);
        assert(D.querySelectorAll('#tree .ti.component-row[data-comp]').length === s.components, ex.name + ': component rows');
        out.push(ex.name + ' (assembly) ' + s.rebuildMs + 'ms');
        continue;
      }
      var last = UI.App.model.features[UI.App.model.features.length - 1];
      assert($('tree').textContent.indexOf(last.name) >= 0, ex.name + ': tree lacks ' + last.name);
      out.push(ex.name + ' ' + s.rebuildMs + 'ms');
    }
    return anvil.examples.length + ' examples · ' + out.join(' · ');
  });
  step('Sketch PM: pick Front Plane → sketch mode on Front', async function () {
    UI.loadModel(K.newModel('Smoke'));
    await idle();
    UI.cmdSketch();
    assert(UI.hasPM(), 'Sketch PM not open');
    clickPmButton('Front Plane');
    await idle();
    assert(UI.App.mode === 'sketch' && UI.App.activeSketch != null, 'not in sketch mode');
    var f = K.findFeature(UI.App.model, UI.App.activeSketch);
    assert(f.plane.ref === 'Front', 'plane ' + JSON.stringify(f.plane));
    near(UI.cam.dir.z, 1, 1e-9, 'camera normal to Front');
  });
  step('draw a rectangle, exit sketch, extrude 20 via the PM', async function () {
    var f = K.findFeature(UI.App.model, UI.App.activeSketch);
    f.entities.push({ t: 'rect', x: 0, y: 0, w: 30, h: 20 });
    UI.exitSketch();
    await idle();
    assert(UI.App.mode === 'part', 'still in sketch');
    UI.cmdExtrude(false);
    assert(UI.hasPM(), 'Extrude PM not open');
    var sel = D.querySelector('#pm select');
    assert(sel && +sel.value === f.id, 'sketch not preselected: ' + (sel && sel.value));
    setInput(pmNumber(0), 20);
    await pmAccept();
    assert(!UI.hasPM(), 'PM still open');
    var s = anvil.summary();
    near(s.volume, 30 * 20 * 20, 1e-6, 'volume');
    assert(names().join() === 'Sketch1,Boss-Extrude1', names().join());
  });
  step('edit the extrude (depth 30), undo, redo', async function () {
    UI.editFeature(K.findFeature(UI.App.model, 2));
    assert(UI.hasPM(), 'edit PM not open');
    setInput(pmNumber(0), 30);
    await pmAccept();
    near(anvil.summary().volume, 18000, 1e-6, 'after edit');
    UI.undo(); await idle(); near(anvil.summary().volume, 12000, 1e-6, 'after undo');
    UI.redo(); await idle(); near(anvil.summary().volume, 18000, 1e-6, 'after redo');
  });
  step('Standard toolbar: the Undo / Redo buttons next to the menus act on the model and grey out with their stacks', async function () {
    var u = D.getElementById('std-undo'), r = D.getElementById('std-redo');
    assert(u && r && u.querySelector('svg') && r.querySelector('svg'), 'Undo / Redo buttons with icons in #std-toolbar');
    assert(!u.disabled && r.disabled, 'after a redo: Undo enabled, Redo greyed (' + u.disabled + ' / ' + r.disabled + ')');
    u.click(); await idle(); near(anvil.summary().volume, 12000, 1e-6, 'after the Undo button');
    assert(!r.disabled, 'Redo enabled once something was undone');
    r.click(); await idle(); near(anvil.summary().volume, 18000, 1e-6, 'after the Redo button');
    assert(r.disabled && !u.disabled, 'Redo greyed again, Undo still enabled');
    return 'Undo 18000 → 12000, Redo → 18000, greying follows the stacks';
  });
  step('Hole Wizard on the +Z face (Ø6 through)', async function () {
    var idx = faceWithNormal([0, 0, 1]);
    UI.cmdHole();
    assert(UI.hasPM() && UI.App.command && UI.App.command.onPick, 'Hole PM not waiting for a pick');
    var c = UI.App.mesh.faces[idx].centroid;
    assert(UI.App.command.onPick({ kind: 'face', index: idx, point: [15, 10, c[2]] }) !== false, 'pick rejected');
    setInput(pmNumber(0), 6);
    await pmAccept();
    near(anvil.summary().volume, 18000 - Math.PI * 9 * 30, 1e-3, 'volume');   // exact: block 18000 minus the Ø6 × 30 cylinder π·3²·30
    assert(names()[names().length - 1] === 'Hole1', names().join());
  });
  step('Chamfer PM: pick an edge object, distance 2', async function () {
    UI.cmdChamfer();
    assert(UI.hasPM() && UI.App.command.pickEdges, 'Chamfer PM not open');
    var e = edgeNear([30, 20, 15]);
    var before = anvil.summary().volume;
    assert(UI.App.command.onPick({ kind: 'edge', edge: e }) === true, 'edge pick rejected');
    assert(/1 edge pick/.test($('pm').innerText), 'pick not listed: ' + $('pm').innerText.slice(0, 120));
    setInput(pmNumber(0), 2);
    await pmAccept();
    near(anvil.summary().volume, before - 2 * 2 / 2 * 30, 1e-3, 'volume');
    assert(names()[names().length - 1] === 'Chamfer1', names().join());
  });
  step('exports: STL, script round-trip, face DXF, PNG', async function () {
    var stl = anvil.stl();
    assert(stl.indexOf('solid ') === 0 && /endsolid/.test(stl), 'stl');
    var script = anvil.script(), vol = anvil.summary().volume;
    var m = K.newModel('rt'); K.runScript(m, script);
    var mp = K.massProps(K.meshFromBody(K.rebuild(m).body), m.density);
    near(mp.volume, vol, 1e-3, 'script round-trip volume'); // summary() rounds to 3 decimals
    var dxf = anvil.dxfFace(faceWithNormal([0, 0, 1]));
    assert(dxf && dxf.indexOf('CIRCLE') > 0 && dxf.indexOf('HOLES') > 0, 'face dxf should carry the hole as a CIRCLE on HOLES');
    var png = anvil.png();
    assert(png.indexOf('data:image/png') === 0 && png.length > 1000, 'png');
    return 'stl ' + stl.length + ' chars, script ' + script.split('\n').length + ' lines, png ' + png.length + ' chars';
  });
  step('section view PM accepts and clips', async function () {
    UI.cmdSection();
    assert(UI.hasPM(), 'Section PM not open');
    await pmAccept();
    assert(UI.App.view.section && UI.App.view.section.plane, 'section not set');
    UI.App.view.section = null; UI.applyDisplayStyle();
  });
  step('delete the sketch with its dependents through the confirm modal', async function () {
    var before = names().length;
    UI.deleteFeature(1);
    assert(modalOpen(), 'confirm modal expected');
    var primary = D.querySelector('#modal-buttons button.primary') || D.querySelector('#modal-buttons button');
    primary.click();
    await idle();
    assert(!modalOpen(), 'modal still open');
    assert(names().length < before, 'nothing deleted: ' + names().join());
    assert(names().indexOf('Sketch1') < 0 && names().indexOf('Boss-Extrude1') < 0, 'dependents remain: ' + names().join());
    return 'now: ' + names().join(', ');
  });
  step('File ▸ New goes through the modal and starts Part1', async function () {
    UI.fileNew();
    assert(modalOpen(), 'New-part modal expected');
    clickModalButton('New part');
    if (modalOpen()) clickModalButton("Don't Save");   // the part has unsaved changes: "Save changes to …?" (AutoRecover steps at the end)
    await idle();
    assert($('doc-title').textContent === 'Part1' && anvil.summary().features === 0, 'not reset');
  });
  step('Extrude PM with Draft on (10°) builds a frustum', async function () {
    await anvil.run('p.sketch("Top").centerRect(0, 0, 20, 20);');
    await idle();
    UI.cmdExtrude(false);
    assert(UI.hasPM(), 'Extrude PM not open');
    setInput(pmNumber(0), 10);
    var draftOn = pmField('Draft on');
    assert(draftOn && draftOn.type === 'checkbox', 'Draft on checkbox missing');
    draftOn.click();
    var angle = pmField('Draft angle');
    assert(angle, 'Draft angle field missing after enabling draft');
    setInput(angle, 10);
    await pmAccept();
    var t = Math.tan(10 * Math.PI / 180), s2 = 20 - 2 * 10 * t;
    near(anvil.summary().volume, 10 / 3 * (400 + s2 * s2 + 20 * s2), 1e-3, 'frustum volume');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.draft === 10 && !f.draftOut, 'feature draft fields: ' + JSON.stringify(f));
  });
  step('Sweep PM pairs profile and path sketches and builds a tube', async function () {
    await anvil.run('p.sketch("Front").circle(0, 0, 5);\np.sketch("Top").line(0, 0, 0, -50);');
    await idle();
    UI.cmdSweep(false);
    assert(UI.hasPM(), 'Sweep PM not open');
    await pmAccept();
    var s = anvil.summary();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    // sweeps are not exact yet: the swept n-gon of the r = 5 circle (n = Kernel.segsForRadius(5)) times the 50 mm path
    near(s.volume, meshCircleArea(5) * 50, 1e-3, 'tube volume');
    assert(names()[names().length - 1] === 'Sweep1', names().join());
  });
  step('Loft PM lofts the two most recent sketches', async function () {
    await anvil.run('p.sketch("Front").centerRect(0, 0, 20, 20);\np.sketch("Front", 30).centerRect(0, 0, 10, 10);');
    await idle();
    UI.cmdLoft(false);
    assert(UI.hasPM(), 'Loft PM not open');
    await pmAccept();
    var s = anvil.summary();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    near(s.volume, 30 / 3 * (400 + 100 + 200), 1e-3, 'frustum volume');
    assert(names()[names().length - 1] === 'Loft1', names().join());
  });
  step('Shell PM removes the pre-selected top face', async function () {
    await anvil.run('p.box(40, 40, 20, { centered: true });');
    await idle();
    var idx = faceWithNormal([0, 1, 0]);
    var c = UI.App.mesh.faces[idx].centroid;
    UI.App.sel = { kind: 'face', index: idx, point: c.slice() };
    UI.cmdShell();
    assert(UI.hasPM(), 'Shell PM not open');
    setInput(pmNumber(0), 2);
    await pmAccept();
    var s = anvil.summary();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    near(s.volume, 32000 - 36 * 36 * 18, 1e-3, 'open box volume');
    assert(names()[names().length - 1] === 'Shell1', names().join());
  });
  step('sheet metal: Edge Flange PM picks an edge and builds', async function () {
    await anvil.run('p.sheet(2, 2, 0.71);\np.sketch("Top").rect(0, -60, 100, 60).end().baseFlange(2);');
    await idle();
    var before = anvil.summary().volume;
    UI.cmdEdgeFlange();
    assert(UI.hasPM(), 'Flange PM not open');
    var e = edgeNear([0, 2, 30]);
    assert(UI.App.command.onPick({ kind: 'edge', edge: e }) !== false, 'edge pick rejected');
    setInput(pmNumber(1), 20); // angle is the first number, length the second
    await pmAccept();
    var s = anvil.summary();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    near(s.volume, before + Math.PI / 4 * 12 * 60 + (20 - 4) * 2 * 60, 60, 'volume');   // Outer Virtual Sharp (new flanges): the wall is L - (R + T)
    assert(names()[names().length - 1] === 'Edge-Flange1', names().join());
  });
  step('Flatten modal and Flat to DXF', async function () {
    await idle();
    UI.cmdFlatten();
    assert(modalOpen() && /Flat pattern/.test($('modal-body').innerText), 'flatten modal');
    assert($('modal-body').querySelector('svg, canvas'), 'no drawing in the flatten modal');
    UI.closeModal();
    // p9-pm: Flat to DXF opens the DXF/DWG Output PropertyManager on Sheet metal (was a text dialog)
    UI.exportFlatDXF();
    assert(!modalOpen() && UI.hasPM() && UI.pmTitle() === 'DXF/DWG Output', 'DXF/DWG Output PM: ' + UI.pmTitle());
    assert(D.querySelector('#pm input[data-key="export:sheet"]').checked, 'Sheet metal export chosen');
    UI.pmCancel();
    var dxf = K.exportDXFFlat(anvil.flat(), UI.App.model.units);
    assert(dxf.indexOf('BEND') > 0 && /\nEOF$/.test(dxf), 'dxf content');
    return 'dxf ' + dxf.length + ' chars';
  });
  step('DXF/DWG Output PM (UI.cmdDxfOutput): Export defaults per part, anvil.dxfOutput views / sheet, DWG greyed without the converter', async function () {
    await idle();
    var errs0 = errors.length;
    function layerTable(dxf) { var m = dxf.match(/\n0\nLAYER\n2\n([^\n]+)/g) || []; return m.map(function (s) { return s.replace(/[\s\S]*\n/, ''); }); }
    // a sheet-metal part is open: Sheet metal is the default export, DXF the default format
    UI.cmdDxfOutput();
    assert(UI.hasPM() && UI.pmTitle() === 'DXF/DWG Output', 'PM not open: ' + UI.pmTitle());
    assert(D.querySelector('#pm input[data-key="export:sheet"]').checked, 'Sheet metal should be the default export on a sheet-metal part');
    assert(D.querySelector('#pm input[data-key="export:faces"]').disabled && /Select a planar face first/.test($('pm').textContent), 'Faces greyed without a face, with the note');
    assert(D.querySelector('#pm input[data-key="format:dxf"]').checked, 'DXF should be the default format');
    assert(D.querySelector('#pm input[data-key="bendLines"]').checked && D.querySelector('#pm input[data-key="notes"]').checked, 'Bend lines and Notes on by default');
    assert(/_flat$/.test(pmField('Name').value), 'file name suffix _flat: ' + pmField('Name').value);
    // sheet: the flat pattern, with and without BEND entities
    var flat = anvil.dxfOutput({ export: 'sheet', bendLines: false });
    assert(/\$ACADVER\n1\nAC1009\n/.test(flat) && /\n8\nOUTLINE\n/.test(flat) && !/\n8\nBEND\n/.test(flat), 'sheet without bend lines');
    assert(/\n8\nBEND\n/.test(anvil.dxfOutput({ export: 'sheet' })), 'sheet with bend lines carries BEND entities');
    assert(!/\n0\nTEXT\n/.test(anvil.dxfOutput({ export: 'sheet', notes: false })), 'notes off drops the TEXT entities');
    // views: one layer per view, LINE / POLYLINE entities, R12 header
    var views = anvil.dxfOutput({ export: 'views', views: ['Front', 'Top'] });
    var lt = layerTable(views);
    assert(/\$ACADVER\n1\nAC1009\n/.test(views), 'views header');
    assert(lt.indexOf('FRONT') >= 0 && lt.indexOf('TOP') >= 0 && lt.indexOf('RIGHT') < 0, 'a LAYER per view: ' + lt.join(','));
    assert(/\n8\nFRONT\n/.test(views) && /\n8\nTOP\n/.test(views) && (/\n0\nLINE\n/.test(views) || /\n0\nLWPOLYLINE\n/.test(views)), 'view entities');
    var cur = anvil.dxfOutput({ export: 'views', views: ['Front', 'Isometric'], current: true });
    assert(layerTable(cur).indexOf('CURRENT') >= 0 && /\n8\nCURRENT\n/.test(cur), 'the current view gets its own layer beside the Isometric');
    UI.pmCancel();
    // a plain part: Views is the default; with a face selected, Faces
    await anvil.run('p.sketch("Top").rect(0, 0, 30, 20).extrude(10);');
    await idle();
    UI.cmdDxfOutput();
    assert(D.querySelector('#pm input[data-key="export:views"]').checked && D.querySelector('#pm input[data-key="export:sheet"]').disabled, 'Views default on a plain part, Sheet metal greyed');
    assert(/_views$/.test(pmField('Name').value), 'file name suffix _views');
    UI.pmCancel();
    anvil.select(faceWithNormal([0, 1, 0]));
    UI.cmdDxfOutput();
    assert(D.querySelector('#pm input[data-key="export:faces"]').checked && !D.querySelector('#pm input[data-key="export:faces"]').disabled, 'Faces default with a face selected');
    var face = anvil.dxfOutput({ export: 'faces' });
    assert(/\n8\nOUTLINE\n/.test(face) && /\n0\nPOLYLINE\n/.test(face), 'face outline');
    // DWG no longer needs the server (rfDG): Anvil's own writer (dwg-writer.js) makes it, so the radio is always live
    // and UI.dxfToDwg gives a DWG (magic AC1015) from the R2000 DXF of the face. No console error.
    var conv = await UI.dwgConverter();
    var dwg = D.querySelector('#pm input[data-key="format:dwg"]');
    assert(dwg && !dwg.disabled, 'DWG enabled (converter ' + conv + ')');
    var face2000 = anvil.dxfOutput({ export: 'faces', version: 'R2000' });
    var bytes = await UI.dxfToDwg(face2000);
    var head = String.fromCharCode.apply(null, new Uint8Array(bytes).slice(0, 6));
    assert(head === 'AC1015', 'DWG from the face DXF: ' + head);
    assert(D.querySelector('#pm select[data-key="version"]').value === 'R12', 'version R12 for DXF');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    UI.pmCancel();
    assert(!UI.hasPM(), 'PM should be closed');
    anvil.clearSelection();
    return 'views ' + views.length + ' chars (' + lt.join(',') + '), flat ' + flat.length + ' chars, face ' + face.length + ' chars';
  });
  step('sheet metal: mitred two-edge flange via anvil.run, tree title says "mitred"', async function () {
    var s;
    try {
      s = await anvil.run('p.sheet(2, 2, 0.71);\np.sketch("Top").rect(0, -60, 100, 60).end().baseFlange(2);\np.flange(20, [[0, 2, 30], [50, 2, 0]], { miter: true });');
    } catch (e) { fail('anvil.run threw: ' + ((e && e.message) || e)); }
    await idle();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    // two 20 mm walls (60 + 100 long) plus the mitred corner: well above the bare 12000 sheet
    assert(s.volume > 12000 + 0.9 * (Math.PI / 4 * 12 + 40) * 160, 'both flanges missing or short: ' + s.volume);
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'flange' && f.miter === true, 'last feature: ' + JSON.stringify(f));
    // the tree row shows the feature name; its description (", mitred") is the row's title attribute
    var tree = $('tree');
    var titles = Array.prototype.map.call(tree.querySelectorAll('[title]'), function (el) { return el.getAttribute('title'); }).join(' | ');
    var text = tree.textContent + ' | ' + titles;
    assert(/mitred/i.test(text), 'tree lacks "mitred": ' + text.replace(/\s+/g, ' ').slice(0, 200));
    return 'volume ' + s.volume + ' · ' + titles.split(' | ').filter(function (t) { return /mitred/i.test(t); })[0];
  });
  step('Miter Flange PM: pick two adjacent edges, accept, named Miter-Flange1', async function () {
    await anvil.run('p.sheet(2, 2, 0.71);\np.sketch("Top").rect(0, -60, 100, 60).end().baseFlange(2);');
    var plain = (await anvil.run('p.sheet(2, 2, 0.71);\np.sketch("Top").rect(0, -60, 100, 60).end().baseFlange(2);\np.flange(20, [[0, 2, 30], [50, 2, 0]], { lengthRef: "outer" });')).volume;
    await anvil.run('p.sheet(2, 2, 0.71);\np.sketch("Top").rect(0, -60, 100, 60).end().baseFlange(2);');
    await idle();
    UI.cmdMiterFlange();
    assert(UI.hasPM(), 'Miter Flange PM not open');
    assert(/Miter-Flange/.test($('pm').innerText), 'PM title: ' + $('pm').innerText.slice(0, 80));
    var miter = pmField('Miter corners');
    assert(miter && miter.type === 'checkbox' && miter.checked, 'Miter corners should be preset');
    assert(UI.App.command.onPick({ kind: 'edge', edge: edgeNear([0, 2, 30]) }) !== false, 'first edge pick rejected');
    assert(UI.App.command.onPick({ kind: 'edge', edge: edgeNear([50, 2, 0]) }) !== false, 'second edge pick rejected');
    setInput(pmNumber(1), 20); // angle is the first number, length the second
    await pmAccept();
    assert(!UI.hasPM(), 'PM still open');
    var s = anvil.summary();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    assert(s.volume > plain + 1, 'mitre should add the corner: ' + s.volume + ' vs unmitred ' + plain);
    assert(names()[names().length - 1] === 'Miter-Flange1', names().join());
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.miter === true && f.edges.length === 2, JSON.stringify(f));
    return 'volume ' + s.volume + ' (unmitred ' + plain + ')';
  });
  step('task pane: Design Library lists the examples, script console has the API text', async function () {
    UI.openTaskPane('library');
    var n = D.querySelectorAll('#tp-body button').length;
    assert(n >= anvil.examples.length, 'library buttons ' + n + ' < ' + anvil.examples.length);
    UI.openTaskPane('macro');
    assert(D.querySelector('#tp-body textarea'), 'script textarea missing');
    UI.closeTaskPane();
    return n + ' library entries';
  });
  step('Cut-Extrude PM on a sheet part: "Normal cut" is on by default, lands in the feature, absent on a plain part', async function () {
    // sheet on Top: x ∈ [0,100], y ∈ [0,2], z ∈ [−60,0]; the sketch sits on the bottom face (Top plane, offset 0) so
    // the cut's default direction (+y) already goes into the sheet
    await anvil.run('p.sheet(2, 2, 0.71);\np.sketch("Top").rect(0, 0, 100, 60);\np.baseFlange(2);');
    await anvil.append('p.sketch("Top", 0).rect(20, 20, 10, 10);');
    await idle();
    near(anvil.summary().volume, 12000, 1e-6, 'sheet volume');
    UI.cmdExtrude(true);
    assert(UI.hasPM(), 'Cut-Extrude PM not open');
    assert(/Sheet Metal/.test($('pm').innerText), 'PM has no Sheet Metal group: ' + $('pm').innerText.replace(/\s+/g, ' ').slice(0, 160));
    var cb = pmField('Normal cut');
    assert(cb && cb.type === 'checkbox', 'Normal cut checkbox missing');
    assert(cb.checked, 'Normal cut should be checked by default for a new cut on a sheet part');
    await pmAccept();
    assert(!UI.hasPM(), 'PM still open');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'extrude' && f.cut === true && f.normalCut === true, 'committed feature: ' + JSON.stringify(f));
    var s = anvil.summary();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    near(s.volume, 12000 - 10 * 10 * 2, 1e-6, 'volume after the cut');
    assert(/normalCut: true/.test(anvil.script()), 'script lacks normalCut: ' + anvil.script().split('\n').pop());
    // editing the feature shows the box checked; a plain part gets no Sheet Metal group
    UI.editFeature(f);
    assert(UI.hasPM(), 'edit PM not open');
    var cb2 = pmField('Normal cut');
    assert(cb2 && cb2.checked, 'edit PM should show Normal cut checked');
    UI.pmCancel();
    await anvil.run('p.box(20, 20, 10);\np.sketch("Top", 10).rect(5, -15, 5, 5);');
    await idle();
    UI.cmdExtrude(true);
    assert(UI.hasPM(), 'Cut-Extrude PM not open on the plain part');
    assert(!pmField('Normal cut') && !/Sheet Metal/.test($('pm').innerText), 'Normal cut should not be offered on a part without sheet parameters');
    UI.pmCancel();
    await idle();
    return 'volume ' + s.volume + ', feature ' + f.name;
  });
  step('Cut-Extrude PM: a sketch on the top face gets "Reverse direction" checked by default and the cut goes into the sheet', async function () {
    // sheet on Front: x ∈ [0,100], y ∈ [0,60], z ∈ [0,2]; the sketch sits on the top face (Front plane, offset 2),
    // whose normal (+Z) points away from the sheet, so a forward cut would miss. Kernel.cutDirectionHint says so
    // and cmdExtrude presets Reverse direction for the new cut.
    await anvil.run('p.sketch("Front").rect(0, 0, 100, 60).extrude(2);');
    await anvil.append('p.sketch("Front", 2).rect(20, 20, 10, 10);');
    await idle();
    near(anvil.summary().volume, 12000, 1e-6, 'sheet volume');
    assert(typeof K.cutDirectionHint === 'function', 'Kernel.cutDirectionHint is missing');
    UI.cmdExtrude(true);
    assert(UI.hasPM(), 'Cut-Extrude PM not open');
    var cb = pmField('Reverse direction');
    assert(cb && cb.type === 'checkbox', 'Reverse direction checkbox missing');
    assert(cb.checked, 'Reverse direction should be checked for a new cut sketched on the top face');
    await pmAccept();
    assert(!UI.hasPM(), 'PM still open');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'extrude' && f.cut === true && f.reverse === true, 'committed feature: ' + JSON.stringify(f));
    var s = anvil.summary();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    near(s.volume, 12000 - 10 * 10 * 2, 1e-6, 'the cut should remove 10 × 10 × 2');
    var warn = UI.App.build && UI.App.build.warnings && UI.App.build.warnings[f.id];
    assert(!warn || !/removed no material/.test(warn), 'the cut warned: ' + warn);
    return 'volume ' + s.volume + ', feature ' + f.name + ' reverse=' + f.reverse;
  });
  step('Cut-Extrude PM: a sketch on the bottom face leaves "Reverse direction" unchecked and the cut still removes material', async function () {
    await anvil.run('p.sketch("Front").rect(0, 0, 100, 60).extrude(2);');
    await anvil.append('p.sketch("Front", 0).rect(60, 20, 10, 10);'); // bottom face: +Z already points into the sheet
    await idle();
    UI.cmdExtrude(true);
    assert(UI.hasPM(), 'Cut-Extrude PM not open');
    var cb = pmField('Reverse direction');
    assert(cb && cb.type === 'checkbox', 'Reverse direction checkbox missing');
    assert(!cb.checked, 'Reverse direction should stay unchecked for a sketch on the bottom face');
    await pmAccept();
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'extrude' && f.cut === true && !f.reverse, 'committed feature: ' + JSON.stringify(f));
    var s = anvil.summary();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    near(s.volume, 12000 - 10 * 10 * 2, 1e-6, 'the forward cut should remove 10 × 10 × 2');
    // editing the feature must not flip the stored direction
    UI.editFeature(f);
    assert(UI.hasPM(), 'edit PM not open');
    var cb2 = pmField('Reverse direction');
    assert(cb2 && !cb2.checked, 'edit PM should show the stored (unchecked) direction');
    UI.pmCancel();
    await idle();
    return 'volume ' + s.volume + ', feature ' + f.name + ' reverse=' + !!f.reverse;
  });
  step('icons: every ribbon and tree icon id renders as well-formed SVG', async function () {
    var Icons = W.Icons;
    assert(typeof Icons === 'function', 'window.Icons is missing');
    // ids the ribbon, tree and panels ask for (ui-panels.js RIBBON tabs, FEATURE_ICON, task pane, PM header)
    var ids = ['extrude', 'revolve', 'sweep', 'loft', 'cut', 'hole', 'revolveCut', 'fillet', 'lpattern', 'cpattern', 'mirror', 'chamfer', 'shell',
      'draft', 'intersect', 'rib', 'wrap', 'refgeo', 'curves', 'instant', 'sketch', 'exitSketch', 'dim', 'line', 'rect', 'crect', 'circle', 'arc',
      'polygon', 'slot', 'point', 'spline', 'ellipse', 'text', 'trim', 'convert', 'offset', 'mirrorEnt', 'sketchPattern', 'relations', 'plane',
      'dxf', 'measure', 'mass', 'section', 'check', 'sensor', 'zebra', 'generic', 'flange', 'bend', 'miter', 'flatten',
      'part', 'planeSmall', 'origin', 'body', 'material', 'folder', 'annotations', 'error', 'warn', 'ok', 'cancel', 'search', 'filter',
      'home', 'library', 'explorer', 'palette', 'props', 'macro', 'tree', 'pm', 'config', 'dimx', 'display', 'dispman', 'appearance',
      'fit', 'zoomArea', 'prevView', 'orient', 'hideshow', 'scene', 'settings'];
    if (typeof Icons.names === 'function') ids = ids.concat(Icons.names());
    else if (Array.isArray(Icons.names)) ids = ids.concat(Icons.names);
    var seen = {}; ids = ids.filter(function (id) { if (seen[id]) return false; seen[id] = true; return true; });
    var parser = new W.DOMParser(), bad = [], missing = [];
    function check(label, s) {
      if (typeof s !== 'string' || s.indexOf('<svg') !== 0) { bad.push(label + ': not an <svg string (' + String(s).slice(0, 40) + ')'); return; }
      var doc = parser.parseFromString(s, 'image/svg+xml');
      var err = doc.querySelector('parsererror');
      if (err) bad.push(label + ': ' + err.textContent.replace(/\s+/g, ' ').slice(0, 120));
      else if (!doc.documentElement || doc.documentElement.nodeName !== 'svg') bad.push(label + ': root is <' + (doc.documentElement && doc.documentElement.nodeName) + '>');
    }
    ids.forEach(function (id) {
      if (typeof Icons.has === 'function' && id !== 'generic' && !Icons.has(id)) missing.push(id);
      check(id, Icons(id, 16));
      check(id + '@32', Icons(id, 32));
    });
    // the ribbon as actually rendered: every button's SVG must re-parse cleanly
    var svgs = D.querySelectorAll('#ribbon svg');
    assert(svgs.length >= 12, 'ribbon shows only ' + svgs.length + ' icons');
    Array.prototype.forEach.call(svgs, function (svg, i) { check('ribbon svg #' + i, svg.outerHTML); });
    assert(bad.length === 0, bad.length + ' bad icon(s):\n' + bad.join('\n'));
    assert(missing.length === 0, 'ribbon/tree ids with no icon (fall back to generic): ' + missing.join(', '));
    return ids.length + ' icon ids × 2 sizes, ' + svgs.length + ' rendered ribbon icons parse';
  });
  step('View ▸ Theme: UI.setTheme / anvil.theme switch to dark and back; document, storage, viewport and menu agree', async function () {
    assert(typeof UI.setTheme === 'function' && typeof UI.theme === 'function', 'UI.setTheme / UI.theme missing');
    assert(typeof anvil.theme === 'function', 'anvil.theme missing');
    assert(UI.theme() === 'light' && anvil.theme() === 'light', 'the default theme should be light, got ' + UI.theme());
    var stored;
    function read() { try { return W.localStorage.getItem('anvil.theme'); } catch (e) { return null; } }
    try {
      UI.setTheme('dark');
      assert(D.documentElement.dataset.theme === 'dark', 'documentElement.dataset.theme = ' + JSON.stringify(D.documentElement.dataset.theme));
      stored = read();
      assert(stored === 'dark', 'localStorage anvil.theme = ' + JSON.stringify(stored));
      assert(UI.theme() === 'dark' && anvil.theme() === 'dark', 'UI.theme() / anvil.theme() should report dark');
      assert(UI.viewportTheme === 'dark', 'UI.viewportTheme = ' + JSON.stringify(UI.viewportTheme));
      var rows = menuRows('Theme');
      var dark = rows.filter(function (r) { return /Dark/.test(r.text); })[0], light = rows.filter(function (r) { return /Light/.test(r.text); })[0];
      assert(dark && light, 'View menu lacks Theme ▸ Light / Dark rows: ' + rows.map(function (r) { return r.text; }).join(' | '));
      assert(/View/.test(dark.menu), 'Theme rows should be in the View menu, found in ' + dark.menu);
      assert(dark.chk && !light.chk, 'Dark should be checked and Light not: dark=' + JSON.stringify(dark.chk) + ' light=' + JSON.stringify(light.chk));
      if (UI.closeMenus) UI.closeMenus();
      // the setter also takes the light theme back through the automation alias
      anvil.theme('light');
      assert((D.documentElement.dataset.theme || 'light') === 'light', 'dataset.theme after light = ' + JSON.stringify(D.documentElement.dataset.theme));
      assert(UI.theme() === 'light' && UI.viewportTheme === 'light', 'light restored: theme ' + UI.theme() + ', viewport ' + UI.viewportTheme);
      var rows2 = menuRows('Theme');
      var light2 = rows2.filter(function (r) { return /Light/.test(r.text); })[0], dark2 = rows2.filter(function (r) { return /Dark/.test(r.text); })[0];
      assert(light2 && light2.chk && dark2 && !dark2.chk, 'after restoring: light=' + JSON.stringify(light2 && light2.chk) + ' dark=' + JSON.stringify(dark2 && dark2.chk));
      // clicking the menu row (still open from menuRows) works too and closes the menu
      dark2.row.click();
      assert(UI.theme() === 'dark' && D.documentElement.dataset.theme === 'dark', 'clicking Theme ▸ Dark should switch the theme');
    } finally {
      if (UI.theme() !== 'light') UI.setTheme('light');
      if (UI.closeMenus) UI.closeMenus();
      try { W.localStorage.removeItem('anvil.theme'); } catch (e) { }
    }
    await idle();
    return 'stored ' + JSON.stringify(stored) + ' while dark; restored light';
  });

