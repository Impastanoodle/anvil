  // ---- sketch relations and the constraint solver (sketch-solver.js, ui-relations.js)
  function vpEvent(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function skScreen(u, v) { return UI.worldToScreen(K.to3D(UI.activePlane(), u, v)); }
  function skClick(u, v) { var p = skScreen(u, v); vpEvent('mousemove', p); vpEvent('mousedown', p, $('viewport')); vpEvent('mouseup', p); }
  function activeSketch() { return K.findFeature(UI.App.model, UI.App.activeSketch); }
  function relList() { return (activeSketch().rels || []).map(function (r) { return r.type + ' ' + r.refs.join('/'); }); }
  function statusRight() { return $('status-right').textContent; }
  step('sketch relations: a rectangle drawn with the Line tool infers Horizontal / Vertical / Coincident (rfBR: no icons while drawing); Under Defined, white, DOF 2', async function () {
    assert(W.SketchSolver, 'SketchSolver missing'); need(UI, 'cmdAddRelations'); need(UI, 'cmdDisplayRelations'); need(UI, 'sketchStatus');
    UI.loadModel(K.newModel('Relations')); await idle();
    UI.cmdSketch(); clickPmButton('Front Plane'); await idle();
    UI.zoomView(1); UI.setTool('line');
    skClick(0, 0);
    vpEvent('mousemove', skScreen(40, 0));
    assert((UI.App.inferPreview || []).some(function (x) { return x.type === 'horizontal'; }), 'no Horizontal inference while drawing: ' + JSON.stringify(UI.App.inferPreview));
    UI.drawDims();
    assert(D.querySelectorAll('#dim-layer .rel-badge').length === 0, 'rfBR: no inference icon by the cursor');
    skClick(40, 0); skClick(40, 20); skClick(0, 20); skClick(0, 0);
    var f = activeSketch();
    assert(f.entities.length === 4 && f.entities.every(function (e) { return e.t === 'line'; }), 'entities ' + JSON.stringify(f.entities));
    UI.setTool('select');
    var want = ['horizontal 0', 'coincident 0.p1/O', 'vertical 1', 'coincident 1.p1/0.p2', 'horizontal 2', 'coincident 2.p1/1.p2', 'vertical 3', 'coincident 3.p1/2.p2', 'coincident 3.p2/O'];
    assert(relList().join() === want.join(), 'inferred ' + relList().join(', '));
    var st = UI.sketchStatus();
    assert(st.status === 'under' && st.dof === 2 && st.entities.every(function (x) { return x === 'under'; }), JSON.stringify(st));
    assert(/Under Defined/.test(statusRight()), 'status bar: ' + statusRight());
    UI.drawDims();
    // r5/sketch5: the three Coincidents that only join chain end points are merged points (no icon, as in SolidWorks)
    assert(D.querySelectorAll('#dim-layer .rel-badge').length === 0, 'rfBR: no relation icons next to the entities: ' + D.querySelectorAll('#dim-layer .rel-badge').length);
    var white = UI.groups.sketches.children.filter(function (o) { return o.userData && o.userData.sketch === f.id; }).every(function (o) { return o.material.color.getHex() === UI.linePalette().sketch; });
    assert(white, 'rfBR: under-defined entities in the plain line colour (white on the dark ground, near-black on the light)');
    return relList().length + ' inferred relations, DOF ' + st.dof;
  });
  step('sketch relations: Smart Dimensions 50 and 30 make it Fully Defined (black); editing 50 -> 65 re-solves the whole rectangle', async function () {
    var f = activeSketch();
    UI.setTool('dimension');
    skClick(20, 0); skClick(20, -8);
    assert(f.dims && f.dims.length === 1 && UI.isDimEditOpen(), 'first dimension placed with the Modify box open');
    UI.cancelDimEdit();
    UI.setTool('dimension');
    skClick(40, 10); skClick(48, 10);
    UI.cancelDimEdit();
    assert(f.dims.length === 2, 'dims ' + JSON.stringify(f.dims));
    var r1 = UI.editDim(0, '50'), r2 = UI.editDim(1, '30');
    assert(r1.ok && r2.ok, JSON.stringify([r1, r2]));
    var st = UI.sketchStatus();
    assert(st.status === 'full' && st.dof === 0 && st.entities.every(function (x) { return x === 'full'; }), JSON.stringify(st));
    assert(/Fully Defined/.test(statusRight()), 'status bar: ' + statusRight());
    var white = UI.groups.sketches.children.filter(function (o) { return o.userData && o.userData.sketch === f.id; }).every(function (o) { return o.material.color.getHex() === UI.linePalette().sketch; });
    assert(white, 'rfBR: fully defined entities the same colour (the status bar names the state)');
    var r3 = UI.editDim(0, '65');
    assert(r3.ok && Math.abs(r3.value - 65) < 1e-9, JSON.stringify(r3));
    var want = [[0, 0, 65, 0], [65, 0, 65, 30], [65, 30, 0, 30], [0, 30, 0, 0]];
    f.entities.forEach(function (e, i) { [e.x1, e.y1, e.x2, e.y2].forEach(function (v, k) { near(v, want[i][k], 1e-9, 'line ' + i + '[' + k + ']'); }); });
    var bad = UI.editDim(1, '-3');
    assert(!bad.ok, 'negative refused');
    UI.cancelDimEdit();
    return 'rectangle 65 x 30, Fully Defined';
  });
  step('sketch relations: Add Relations PM (pick two lines, Parallel) over-defines (yellow, Over Defined); Display/Delete Relations lists it under Overdefining and Delete restores Fully Defined', async function () {
    var f = activeSketch(), n0 = f.rels.length;
    UI.App.sel = null;
    UI.cmdAddRelations();
    assert(UI.hasPM() && /Add Relations/.test($('pm').textContent), 'Add Relations PM');
    var a = skScreen(30, 0), b = skScreen(30, 30);
    UI.App.command.onSketchPoint(null, a[0], a[1]);
    UI.App.command.onSketchPoint(null, b[0], b[1]);
    assert(UI.App.relPick.join() === '0,2', 'picked ' + UI.App.relPick.join());
    assert(/Line1/.test($('rel-picks').textContent) && /Line3/.test($('rel-picks').textContent), 'Selected Entities list');
    var labels = Array.prototype.map.call(D.querySelectorAll('#pm .pm-btns button'), function (x) { return x.textContent; });
    assert(labels.indexOf('Parallel') >= 0 && labels.indexOf('Equal') >= 0 && labels.indexOf('Collinear') >= 0 && labels.indexOf('Tangent') < 0, 'offered ' + labels.join());
    clickPmButton('Parallel');
    assert(f.rels.length === n0 + 1 && f.rels[n0].type === 'parallel', 'parallel added');
    var st = UI.sketchStatus();
    assert(st.status === 'over' && st.rels[n0] === 'redundant' && st.entities[0] === 'over', JSON.stringify(st));
    assert(/Over Defined/.test(statusRight()), 'status bar: ' + statusRight());
    var yellow = UI.groups.sketches.children.filter(function (o) { return o.userData && o.userData.sketch === f.id && o.userData.index === 0; })[0];
    assert(yellow && yellow.material.color.getHex() === 0xd9302c, 'line 1 drawn red (over defined, as SolidWorks)');   // sketchdims: was yellow 0xd4a300
    UI.drawDims();
    assert(D.querySelectorAll('#dim-layer .rel-badge').length === 0, 'rfBR: no relation icons, over defining or not');
    await UI.pmOK();
    UI.cmdDisplayRelations();
    assert(D.querySelectorAll('#rel-display .rel-row').length === n0 + 1, 'all relations listed');
    assert(/Over Defined/.test($('pm').textContent), 'PM message');
    setInput(pmField('Filter'), 'over');
    var rows = D.querySelectorAll('#rel-display .rel-row');
    assert(rows.length === 1 && /Parallel/.test(rows[0].textContent) && /Over Defining/.test(rows[0].textContent), 'filtered ' + rows.length);
    rows[0].click();
    assert(UI.App.sel && UI.App.sel.kind === 'rel' && UI.App.sel.index === n0, 'row selects the relation');
    clickPmButton('Delete');
    assert(f.rels.length === n0 && UI.sketchStatus().status === 'full', 'deleted, Fully Defined again');
    await UI.pmOK();
    // rfBR: a relation selected (as a Display/Delete Relations row selects it) lights up its entities in the graphics
    // area; Delete removes it; anvil.addRelation puts it back
    UI.App.sel = { kind: 'rel', index: 0 }; UI.App.dimsStale = false; UI.drawDims();
    assert(D.querySelector('#dim-layer .rel-hot') && !D.querySelector('#dim-layer .rel-badge'), 'the selected relation lights up its entities, no icon');
    UI.deleteSelection();
    assert(f.rels.length === n0 - 1 && UI.sketchStatus().status === 'under', 'deleted Horizontal: under defined');
    var back = anvil.addRelation('horizontal', ['0']);
    assert(back.status === 'ok' && back.sketch === 'Fully Defined' && activeSketch().rels.length === n0, 'anvil.addRelation ' + JSON.stringify(back));
    return n0 + ' relations after the round trip';
  });
  step('sketch relations: dragging the right side of an under-defined rectangle (width dimension deleted) widens it and keeps every relation; a fully defined sketch does not move', async function () {
    var f = activeSketch();
    UI.App.sel = { kind: 'dim', index: 0 };
    UI.deleteSelection();
    assert(f.dims.length === 1 && UI.sketchStatus().dof === 1, 'DOF 1 after deleting the width');
    var from = skScreen(65, 15), sc = UI.cam.scale, to = [from[0] + 40, from[1] + 25];
    vpEvent('mousedown', from, $('viewport'));
    for (var k = 1; k <= 5; k++) { vpEvent('mousemove', [from[0] + (to[0] - from[0]) * k / 5, from[1] + (to[1] - from[1]) * k / 5]); await wait(15); }
    vpEvent('mouseup', to);
    f = activeSketch();
    var w = f.entities[0].x2;
    near(w, 65 + 40 * sc, 1e-6, 'width follows the drag in x');
    var want = [[0, 0, w, 0], [w, 0, w, 30], [w, 30, 0, 30], [0, 30, 0, 0]];
    f.entities.forEach(function (e, i) { [e.x1, e.y1, e.x2, e.y2].forEach(function (v, kk) { near(v, want[i][kk], 1e-9, 'line ' + i + '[' + kk + ']'); }); });
    // put the width back as a two-entity distance dimension (Smart Dimension: left line, right line, place)
    UI.setTool('dimension');
    skClick(0, 12); skClick(w, 12); skClick(w / 2, 40);
    var ri = f.rels.length - 1, rel = f.rels[ri];
    assert(rel.type === 'distance' && rel.refs.join() === '3,1' && Math.abs(rel.v - w) < 1e-9, 'distance ' + JSON.stringify(rel));
    assert(UI.isDimEditOpen(), 'Modify box opens on the new dimension');
    UI.cancelDimEdit();
    var r = UI.editRelDim(ri, '70');
    assert(r.ok && f.entities[1].x1 === 70 && f.entities[0].x2 === 70, JSON.stringify(r) + ' ' + JSON.stringify(f.entities[1]));
    assert(UI.sketchStatus().status === 'full', 'Fully Defined with the distance');
    UI.setTool('select');
    var before = JSON.stringify(f.entities), p = skScreen(70, 15);
    vpEvent('mousedown', p, $('viewport'));
    for (var j = 1; j <= 4; j++) { vpEvent('mousemove', [p[0] + 10 * j, p[1]]); await wait(15); }
    vpEvent('mouseup', [p[0] + 40, p[1]]);
    assert(JSON.stringify(activeSketch().entities) === before, 'a fully defined sketch does not drag');
    return 'dragged to ' + fmt(w) + ', distance 70';
  });
  step('sketch relations: relations, dimensions and the distance survive exit / extrude / script round trip; an old model without relations loads Under Defined and unchanged', async function () {
    var sid = UI.App.activeSketch;
    await UI.exitSketch(); await idle();
    UI.cmdExtrude(false); setInput(pmNumber(0), 10); await pmAccept();
    near(anvil.summary().volume, 70 * 30 * 10, 1e-6, 'volume');
    var f = K.findFeature(UI.App.model, sid), rels = JSON.stringify(f.rels), script = anvil.script();
    assert(/\.rel\("distance", \["3","1"\], \{"value":70,"off":/.test(script) && /\.rel\("coincident", \["0\.p1","O"\]\)/.test(script), 'script ' + script);
    await anvil.run(script); await idle();
    var g = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    assert(JSON.stringify(g.rels) === rels, 'rels after the script round trip');
    near(anvil.summary().volume, 21000, 1e-6, 'volume after the round trip');
    var old = K.newModel('Old'); old.features.push({ id: 1, type: 'sketch', name: 'Sketch1', plane: { ref: 'Front', offset: 0 }, entities: [{ t: 'rect', x: 0, y: 0, w: 30, h: 20 }], dims: [{ e: 0, k: 'w', i: 0 }] }); old.nextId = 2;
    var json = JSON.stringify(old);
    UI.loadModel(JSON.parse(json)); await idle();
    UI.editFeature(K.findFeature(UI.App.model, 1));
    await idle();
    assert(UI.App.mode === 'sketch', 'editing the old sketch');
    var st = UI.sketchStatus();
    assert(st.status === 'under' && st.dof === 3, 'rect with one dimension: DOF 3 ' + JSON.stringify(st));
    await UI.exitSketch(); await idle();
    var g0 = UI.App.model.features[0], o0 = old.features[0];
    assert(JSON.stringify([g0.entities, g0.dims, g0.rels]) === JSON.stringify([o0.entities, o0.dims, o0.rels]), 'old sketch unchanged: ' + JSON.stringify(g0));
    return 'script ' + script.split('\n').length + ' lines';
  });
  step('sketch relations: ribbon Add Relation / Display/Delete Relations, Tools ▸ Relations; no View ▸ Sketch Relations (rfBR: no relation icons)', async function () {
    UI.loadModel(K.newModel('Ribbon')); await idle();
    UI.cmdSketch(); clickPmButton('Front Plane'); await idle();
    var f = activeSketch();
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'circle', cx: 10, cy: 10, r: 4 });
    W.SketchSolver.infer(f, 0); UI.updateSketches();
    UI.App.ribbonTab = 'Sketch'; UI.refreshRibbon();
    function ribbonBtn(re) { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (b) { return re.test(b.textContent); })[0]; }
    // rfC: Add Relation is in the Display/Delete Relations flyout, as on SolidWorks 2024's Sketch tab
    UI.ribbonFlyFace('relations', 0);
    var rfl = c14Fly('relations'), disp = rfl && rfl.querySelector('.rb');
    assert(disp && /Display\/Delete Relations/.test(disp.textContent.replace(/\s+/g, ' ')), 'ribbon buttons');
    rfl.querySelector('.rb-caret').dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); rfl.querySelector('.rb-caret').click();
    c14MenuRow('Add Relation').click();
    assert(UI.hasPM() && /Add Relations/.test($('pm').textContent), 'Add Relations from the ribbon');
    UI.pmCancel();
    UI.ribbonFlyFace('relations', 0);
    disp.click();
    assert(UI.hasPM() && D.querySelectorAll('#rel-display .rel-row').length === 2, 'Display/Delete from the ribbon');
    clickPmButton('Delete All');
    assert(!f.rels && UI.sketchStatus().status === 'under', 'Delete All');
    UI.pmCancel();
    var tools = menuRows('Display/Delete');
    assert(tools.length === 1 && /Tools/.test(tools[0].menu) && /Relations/.test(tools[0].text), 'Tools menu ' + tools.map(function (x) { return x.menu + ': ' + x.text; }).join('|'));
    UI.closeMenus();
    W.SketchSolver.infer(f, 0); UI.drawDims();
    var n = (f.rels || []).length;
    var view = menuRows('Sketch Relations');
    UI.closeMenus();
    assert(view.length === 0, 'rfBR: no View ▸ Sketch Relations row: ' + view.map(function (x) { return x.menu + ': ' + x.text; }).join('|'));
    assert(n > 0 && D.querySelectorAll('#dim-layer .rel-badge').length === 0, 'relations held (' + n + '), no icons drawn');
    await UI.exitSketch(); await idle();
    return n + ' relations, no icons';
  });
  step('sketch: Centerline (dashed, construction), a level line across it infers Horizontal only (Symmetric added with Add Relations); a second dimension on it asks "Make this dimension driven?" in a page modal, the driven one is grey in parentheses and follows a 16 -> 30 edit; Construction Geometry toggles the line', async function () {
    need(UI, 'toggleConstruction'); need(UI, 'cmdCenterline'); need(UI, 'askDrivenIfOver');
    UI.loadModel(K.newModel('Symmetric')); await idle();
    UI.cmdSketch(); clickPmButton('Front Plane'); await idle();
    UI.zoomView(1);
    UI.App.ribbonTab = 'Sketch'; UI.refreshRibbon();
    function ribbonBtn(re) { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (b) { return re.test(b.textContent); })[0]; }
    // rfC: Centerline is in the Line flyout, as on SolidWorks 2024's Sketch tab
    var lfl = c14Fly('line'), cg = ribbonBtn(/Construction Geometry/);
    assert(lfl && cg, 'ribbon Centerline / Construction Geometry');
    lfl.querySelector('.rb-caret').dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); lfl.querySelector('.rb-caret').click();
    c14MenuRow('Centerline').click();
    UI.ribbonFlyFace('line', 0);
    skClick(0, -20); skClick(0, 20);
    UI.setTool('select');
    var f = activeSketch();
    assert(f.entities.length === 1 && f.entities[0].construction === true, 'centerline ' + JSON.stringify(f.entities));
    var dashed = UI.groups.sketches.children.filter(function (o) { return o.userData && o.userData.sketch === f.id && o.userData.index === 0; })[0];
    assert(dashed && dashed.material.type === 'LineDashedMaterial', 'centerline drawn dashed: ' + (dashed && dashed.material.type));
    UI.setTool('line');
    skClick(-8, 4); skClick(8, 4);
    UI.setTool('select');
    assert(f.entities.length === 2 && !f.entities[1].construction, 'line after the centerline is ordinary geometry');
    var rl = relList();
    // lane C, fidelity #7: drawing infers Horizontal only (SolidWorks never infers Symmetric while sketching); the
    // Symmetric comes from Add Relations, the Horizontal it repeats going first
    assert(rl.indexOf('horizontal 1') >= 0 && !rl.some(function (x) { return /^symmetric/.test(x); }), 'inferred ' + rl.join(', '));
    f.rels = f.rels.filter(function (x) { return !(x.type === 'horizontal' && x.refs.join() === '1'); });
    var symR = W.SketchSolver.addRelation(f, 'symmetric', ['1.p1', '1.p2', '0']);
    assert(symR.ok && relList().indexOf('symmetric 1.p1/1.p2/0') >= 0, 'Symmetric added ' + JSON.stringify(symR) + ' ' + relList().join(', '));
    UI.setTool('dimension');
    skClick(4, 4); skClick(4, 8);
    assert(f.dims && f.dims.length === 1 && UI.isDimEditOpen() && $('modal').hidden, 'first dimension: Modify box, no question');
    UI.cancelDimEdit();
    UI.setTool('dimension');
    skClick(-4, 4); skClick(-4, 12);
    assert(f.dims.length === 2 && !$('modal').hidden && /Make Dimension Driven/.test($('modal-title').textContent) && !UI.isDimEditOpen(), 'over-defining dimension asks: ' + $('modal-title').textContent);
    $('drv-driven').click();
    assert($('modal').hidden && f.dims[1].driven === true, 'made driven ' + JSON.stringify(f.dims[1]));
    var st = UI.sketchStatus();
    assert(st.status !== 'over' && st.dims[1] === 'driven', JSON.stringify(st));
    UI.drawDims();
    var drv = D.querySelectorAll('#dim-layer .dim.driven text');
    assert(drv.length === 1 && /^\(16(\.0+)?\)$/.test(drv[0].textContent), 'driven label ' + (drv[0] && drv[0].textContent));
    var r = UI.editDim(0, '30');
    assert(r.ok, JSON.stringify(r));
    near(K.dimValue(f.entities[1], f.dims[1]), 30, 1e-9, 'driven dimension follows');
    near(f.entities[1].x2 - f.entities[1].x1, 30, 1e-9, 'line length 30');
    near((f.entities[1].x1 + f.entities[1].x2) / 2, f.entities[0].x1, 1e-9, 'still symmetric about the centerline (which is free to move sideways)');
    UI.drawDims();
    assert(/^\(30(\.0+)?\)$/.test(D.querySelector('#dim-layer .dim.driven text').textContent), 'driven label after the edit');
    UI.App.sel = { kind: 'entity', index: 1 };
    cg.click();
    assert(f.entities[1].construction === true, 'Construction Geometry on');
    cg.click();
    assert(!f.entities[1].construction, 'Construction Geometry off');
    UI.App.sel = null;
    await UI.exitSketch(); await idle();
    return rl.join(', ') + '; driven (30)';
  });
