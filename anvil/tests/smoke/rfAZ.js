  // ---- rfAZ (2026-10-13): Insert DXF brings blocks in as blocks; Edit Block keeps the other instances' relations;
  // Sketch Fillet on a selection previews and makes the fillets on ✓
  // a 4 × 2 in plate (closed LWPOLYLINE on CUT) with three INSERTs of block PUNCH (a Ø r circle) at (1, 1), (2, 1), (3, 1);
  // only: the INSERTs and a block of radius r at (x, y)
  function rfAZPlate(r, only, at) {
    var L = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC',
      '0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '8', '0', '2', 'PUNCH', '70', '0', '10', '0', '20', '0',
      '0', 'CIRCLE', '8', '0', '10', '0', '20', '0', '40', String(r), '0', 'ENDBLK', '8', '0', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
    if (!only) L = L.concat(['0', 'LWPOLYLINE', '8', 'CUT', '90', '4', '70', '1', '10', '0', '20', '0', '10', '4', '20', '0', '10', '4', '20', '2', '10', '0', '20', '2']);
    (at || [[1, 1], [2, 1], [3, 1]]).forEach(function (p) { L = L.concat(['0', 'INSERT', '8', 'CUT', '2', 'PUNCH', '10', String(p[0]), '20', String(p[1]), '30', '0']); });
    return L.concat(['0', 'ENDSEC', '0', 'EOF']).join('\r\n') + '\r\n';
  }
  function rfAZLabels() { return Array.prototype.map.call(D.querySelectorAll('#pm label'), function (l) { return l.textContent.trim(); }); }
  function rfAZMsg() { var m = D.querySelector('#pm .pm-msg'); return m ? m.textContent : ''; }
  function rfAZOk() { var b = D.querySelector('#pm .pm-ok'); assert(b, 'no ✓ button'); b.click(); }
  function rfAZCancel() { var b = D.querySelector('#pm .pm-cancel'); assert(b, 'no ✗ button'); b.click(); }
  function rfAZArcs() { return UI.activeSketchFeature().entities.filter(function (e) { return e.t === 'arc'; }); }
  step('rfAZ: Insert DXF brings the file\'s blocks in as blocks — "Import blocks as blocks" (on) previews 3 PUNCH instances with their insertion points, off explodes them (the layer count follows), ✓ makes rigid instances of one definition; a second DXF with another PUNCH comes in as PUNCH-2; Extruded Boss has the plate\'s exact volume', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    var s = UI.App.model.units === 'in' ? 1 : 25.4;
    UI.importDXFText(rfAZPlate(0.125), { name: 'punched.dxf' }); await idle();
    assert(UI.pmTitle() === 'DXF/DWG Import', 'PM ' + UI.pmTitle());
    var labels = rfAZLabels(), box = D.querySelector('#pm input[data-key="blocks"]');
    assert(labels.indexOf('Import blocks as blocks') >= 0 && box && box.checked && labels.indexOf('CUT (10)') >= 0, 'option on, CUT (10): ' + labels.join(' | '));
    assert(UI.App.tempEntities.length === 10 && UI.App.tempEntities.filter(function (e) { return e.blkDef === 'PUNCH'; }).length === 3 && /3 block instances of 1 block/.test(rfAZMsg()), 'preview with blocks: ' + UI.App.tempEntities.length + ' ' + rfAZMsg());
    box.click(); await wait(20);
    labels = rfAZLabels();
    assert(UI.App.tempEntities.length === 7 && !UI.App.tempEntities.some(function (e) { return e.blk != null; }) && labels.indexOf('CUT (7)') >= 0 && !/block instance/.test(rfAZMsg()), 'blocks off, exploded: ' + UI.App.tempEntities.length + ' ' + labels.join(' | '));
    D.querySelector('#pm input[data-key="blocks"]').click(); await wait(20);
    assert(UI.App.tempEntities.length === 10 && rfAZLabels().indexOf('CUT (10)') >= 0, 'blocks on again');
    var u0 = UI.App.undo.length;
    rfAZOk(); await idle();
    var f = activeSketch(), I = K.blockInstances(f);
    assert(!UI.hasPM() && UI.App.undo.length === u0 + 1 && f.blocks && f.blocks.PUNCH && I.length === 3 && I.every(function (q) { return q.def === 'PUNCH' && q.ents.length === 1; }), 'three PUNCH instances: ' + JSON.stringify(I));
    near(f.entities[I[2].ents[0]].r, 0.125 * s, 1e-9, 'block radius'); near(I[2].x, 3 * s, 1e-9, 'third instance x');
    assert(/Imported 10 entities from punched\.dxf \(4 Coincident relations, 3 block instances\)/.test(statusText()), 'status ' + statusText());
    // rigid in the solver: an instance's circle dragged moves it whole (its centre stays on the insertion point)
    var st = UI.sketchStatus();
    assert(st && st.status !== 'over', 'not over defined: ' + JSON.stringify(st));
    // a second DXF whose PUNCH is bigger, into the same sketch: its instance comes in as PUNCH-2
    UI.importDXFText(rfAZPlate(0.2, true, [[3.5, 0.5]]), { name: 'more.dxf', ok: true }); await idle();
    f = activeSketch(); I = K.blockInstances(f);
    var p2 = I.filter(function (q) { return q.def === 'PUNCH-2'; })[0];
    assert(f.blocks['PUNCH-2'] && p2 && Math.abs(f.entities[p2.ents[0]].r - 0.2 * s) < 1e-9 && f.blocks.PUNCH.ents[0].r !== f.blocks['PUNCH-2'].ents[0].r && I.length === 4, 'PUNCH-2: ' + JSON.stringify(Object.keys(f.blocks)) + ' ' + JSON.stringify(I));
    var sid = UI.App.activeSketch;
    await UI.exitSketch(); await idle();
    UI.App.sel = { kind: 'feature', id: sid };
    UI.cmdExtrude(false); setInput(pmNumber(0), 0.25 * s); await pmAccept();
    var want = (8 - 3 * Math.PI * 0.125 * 0.125 - Math.PI * 0.04) * 0.25 * s * s * s;
    near(anvil.summary().volume, want, 1e-4 * want, 'volume');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'volume ' + anvil.summary().volume.toFixed(4) + ' (' + want.toFixed(4) + ')';
  });
  step('rfAZ: Edit Block keeps the relations on the other instances — a Horizontal that levels the turned instance stays after the first instance gets a line drawn in Edit Block; the status says the relations were kept', async function () {
    var errs0 = errors.length;
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'circle', cx: 10, cy: 10, r: 2 }, { t: 'line', x1: -2, y1: 10, x2: 22, y2: 10 }, { t: 'line', x1: 10, y1: -2, x2: 10, y2: 22 });
    K.makeBlock(f, [0, 1, 2], 'Cross', [10, 10]);
    K.insertBlock(f, 'Cross', 50, 30, 30, 1);
    UI.App.gridStale = true; UI.updateSketches(); await idle();
    var I = K.blockInstances(f);
    assert(W.SketchSolver.addRelation(f, 'horizontal', [String(I[1].ents[1])]).status === 'ok', 'Horizontal on the turned instance');
    UI.updateSketches(); await idle();
    I = K.blockInstances(f);
    var L = f.entities[I[1].ents[1]];
    near(L.y1, L.y2, 1e-6, 'levelled');
    // Edit Block on the first instance (its line picked in the graphics area), a line drawn meanwhile, Edit Block again
    UI.setTool('select');
    rskClick([10, 18]); await wait(20);
    UI.cmdEditBlock(); await idle();
    assert(UI.blockEditing() && UI.blockEditing().name === 'Cross', 'editing: ' + JSON.stringify(UI.blockEditing()));
    UI.setTool('line'); rskClick([4, 4]); rskClick([16, 4]);
    selKey('Escape'); selKey('Escape'); await idle();
    UI.setTool('select');
    UI.cmdEditBlock(); await idle();
    f = UI.activeSketchFeature(); I = K.blockInstances(f);
    assert(!UI.blockEditing() && f.blocks.Cross.ents.length === 4 && I.every(function (q) { return q.ents.length === 4; }), 'every instance has the new line: ' + JSON.stringify(I.map(function (q) { return q.ents.length; })));
    var hz = (f.rels || []).filter(function (q) { return q.type === 'horizontal'; });
    assert(hz.length === 1 && +hz[0].refs[0] === I[1].ents[1], 'the Horizontal still on the second instance\'s line: ' + JSON.stringify(f.rels) + ' ' + JSON.stringify(I));
    L = f.entities[I[1].ents[1]];
    near(L.y1, L.y2, 1e-6, 'still level');
    assert(/their relations kept/.test(statusText()), 'status ' + statusText());
    assert(UI.sketchStatus().status !== 'over', 'not over defined: ' + JSON.stringify(UI.sketchStatus()));
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return statusText();
  });
  step('rfAZ: Sketch Fillet on a box-selected rectangle previews the four corners at the current radius (listed, sketch untouched); a new Radius redraws the preview; ✗ leaves the sketch as it was; ✓ makes them as one undo step; two selected lines preview their one fillet and ✓ makes it; a radius too big is refused on ✓ and the PropertyManager stays', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.App.view.showGrid = false;
    UI.setTool('rect'); rskClick([0, 0]); rskClick([60, 40]); UI.setTool('select'); await wait(20);
    var f = UI.activeSketchFeature(), lines0 = JSON.stringify(f.entities), rels0 = JSON.stringify(f.rels || null);
    await selDrag(rskScr([-6, -6]), rskScr([66, 46]));
    assert(anvil.selection().length === 4, 'the box takes the four lines: ' + anvil.selection().length);
    var u0 = UI.App.undo.length;
    UI.cmdSketchFillet(); await wait(20);
    function prev() { return UI.App.tempEntities.filter(function (e) { return e.t === 'arc'; }); }
    var items = Array.prototype.map.call(D.querySelectorAll('#pm .pm-list .pm-item'), function (x) { return x.textContent.trim(); });
    assert(prev().length === 4 && prev().every(function (a) { return Math.abs(a.r - 10) < 1e-9; }) && items.length === 4 && items.every(function (t) { return /^Vertex \(/.test(t); }), 'four R10 previewed, four vertices listed: ' + items.join(' | '));
    assert(JSON.stringify(UI.activeSketchFeature().entities) === lines0 && UI.App.undo.length === u0 && /Preview: 4 fillets/.test(statusText()), 'sketch untouched: ' + statusText());
    setInput(pmField('Radius'), 5); await wait(20);
    assert(prev().length === 4 && prev().every(function (a) { return Math.abs(a.r - 5) < 1e-9; }) && JSON.stringify(UI.activeSketchFeature().entities) === lines0, 'R5 previewed: ' + JSON.stringify(prev().map(function (a) { return a.r; })));
    // the preview arcs sit in the corners: tangent to both sides (centre 5 in from each)
    assert(prev().some(function (a) { return Math.abs(a.cx - 55) < 1e-6 && Math.abs(a.cy - 35) < 1e-6; }), 'top-right arc centre (55, 35): ' + JSON.stringify(prev()));
    rfAZCancel(); await wait(20);
    f = UI.activeSketchFeature();
    assert(!UI.hasPM() && JSON.stringify(f.entities) === lines0 && JSON.stringify(f.rels || null) === rels0 && !UI.App.tempEntities.length && UI.App.undo.length === u0, '✗ leaves the sketch untouched');
    // again, R 5, ✓
    await selDrag(rskScr([-6, -6]), rskScr([66, 46]));
    UI.cmdSketchFillet(); await wait(20);
    setInput(pmField('Radius'), 5); await wait(20);
    rfAZOk(); await idle();
    f = UI.activeSketchFeature();
    assert(!UI.hasPM() && rfAZArcs().length === 4 && rfAZArcs().every(function (a) { return Math.abs(a.r - 5) < 1e-9; }) && UI.App.undo.length === u0 + 1 && !UI.App.tempEntities.length, '✓: four R5 fillets, one undo step: ' + (UI.App.undo.length - u0));
    assert(UI.sketchStatus().status !== 'over', 'nothing over defined');
    UI.undo(); await idle();
    assert(JSON.stringify(UI.activeSketchFeature().entities) === lines0, 'undo: the sharp rectangle');
    // two lines selected (the bottom one, then the right one with Ctrl): one fillet previewed, made on ✓
    UI.setSelection([]); UI.App.sel = null;
    rskClick([30, 0]); await wait(10);
    selClick(rskScr([60, 20]), { ctrlKey: true }); await wait(10);
    assert(anvil.selection().length === 2, 'two lines selected: ' + JSON.stringify(anvil.selection()));
    UI.cmdSketchFillet(); await wait(20);
    assert(prev().length === 1 && UI.activeSketchFeature().entities.length === 4 && D.querySelectorAll('#pm .pm-list .pm-item').length === 1, 'one fillet previewed: ' + prev().length);
    setInput(pmField('Radius'), 8); await wait(20);
    assert(prev().length === 1 && Math.abs(prev()[0].r - 8) < 1e-9, 'R8 previewed');
    rfAZOk(); await idle();
    assert(!UI.hasPM() && rfAZArcs().length === 1 && Math.abs(rfAZArcs()[0].r - 8) < 1e-9, '✓: the R8 fillet');
    UI.undo(); await idle();
    // a radius too big: no preview, ✓ refused, the PropertyManager stays open; ✗ leaves the sketch as it was
    await selDrag(rskScr([-6, -6]), rskScr([66, 46]));
    UI.cmdSketchFillet(); await wait(20);
    setInput(pmField('Radius'), 30); await wait(20);
    assert(!prev().length, 'R30 does not fit the 40 high sides: no preview');
    rfAZOk(); await idle();
    assert(UI.hasPM() && UI.pmTitle() === 'Sketch Fillet' && JSON.stringify(UI.activeSketchFeature().entities) === lines0, '✓ refused, the PM stays: ' + JSON.stringify(UI.activeSketchFeature().entities).slice(0, 200));
    rfAZCancel(); await wait(20);
    assert(JSON.stringify(UI.activeSketchFeature().entities) === lines0 && !UI.App.tempEntities.length, '✗ after the refusal: untouched');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'preview R10 → R5, ✓, two-line R8';
  });
  // --- end rfAZ ---
