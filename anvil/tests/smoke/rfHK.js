  // ---- rfHK (2026-11-03, lane model-dims): Smart Dimension on the solid (ui-model-dims.js). With no sketch open the
  // ribbon's Smart Dimension (or D) dimensions the part: edge length, Ø of a hole, face to face, angle. The dimensions
  // measure the solid (no editing of features), are saved in the model, follow the geometry after a rebuild, turn red
  // when their items vanish, select / Delete / undo, and hide with View ▸ Model Dimensions. Real mouse events.
  var RFHK_BLOCK = 'p.units("in");\np.sketch("Top").rect(-2, -1, 4, 2).extrude(0.5);';   // X -2..2, Y 0..0.5, Z -1..1
  async function rfHKView(name) { UI.setView(name); for (var i = 0; i < 50 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(20); await wait(40); }
  async function rfHKPart(script) {
    await anvil.newPart(); await idle();
    await anvil.run(script); await idle();
    var v = UI.App.view; v.showPlanes = false; v.showOrigin = false;
    if (UI.updatePlanes) UI.updatePlanes(); if (UI.updateOrigin) UI.updateOrigin();
    anvil.selectionFilter({ faces: false, edges: false, vertices: false, bodies: false, components: false, sketch: false, suspended: false });
    await rfHKView('Isometric'); UI.zoomToFit(); await wait(60);
  }
  function rfHKEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  async function rfHKClick(p) { rfHKEv('mousemove', p); rfHKEv('mousedown', p, $('viewport')); rfHKEv('mouseup', p); await wait(20); }
  function rfHKScr(p3) { return UI.worldToScreen(p3); }
  // a screen point with nothing of the model under it (a place click)
  function rfHKFree(p3) { var s = rfHKScr(p3); assert(!UI.pickFace(s[0], s[1]) && !UI.pickEdge(s[0], s[1]), 'place point ' + p3 + ' is free'); return s; }
  function rfHKLast() { var l = UI.modelDims(); return l[l.length - 1]; }

  step('rfHK: Smart Dimension on the ribbon works with no sketch open (part): it starts the model tool, the button shows pressed, Esc ends it; D toggles it too', async function () {
    need(UI, 'modelDimTool'); need(UI, 'modelDims');
    await rfHKPart(RFHK_BLOCK);
    UI.setRibbonTab('Sketch'); await wait(30);
    var b = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === 'Smart Dimension'; })[0];
    assert(b, 'Smart Dimension button on the Sketch tab');
    assert(!b.disabled && !b.classList.contains('disabled'), 'Smart Dimension enabled with no sketch open');
    b.click(); await wait(30);
    assert(UI.modelDimTool(), 'the model tool is on after the ribbon click');
    assert(UI.App.mode === 'part', 'no sketch was opened');
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await wait(20);
    assert(!UI.modelDimTool(), 'Esc ends the tool');
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'd', bubbles: true, cancelable: true })); await wait(20);
    assert(UI.modelDimTool(), 'D starts it');
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'd', bubbles: true, cancelable: true })); await wait(20);
    assert(!UI.modelDimTool(), 'D again ends it');
    UI.setRibbonTab('Features');
  });

  step('rfHK: on a 4 x 2 x .5 in block, click an edge then a free spot: a length dimension 4.000, drawn in 3D (lines, arrows, text) and saved in the model', async function () {
    await rfHKPart(RFHK_BLOCK);
    UI.modelDimTool(true);
    await rfHKClick(rfHKScr([1, 0.5, 1]));
    assert(UI.modelDimPicks() === 1, 'the edge is picked');
    var sel = anvil.selection();
    assert(sel.length === 1 && sel[0].kind === 'edge', 'the picked edge is highlighted as selected: ' + JSON.stringify(sel));
    var preview = D.querySelector('#mdim-layer .mdim.temp');
    assert(preview, 'the dimension follows the cursor before it is placed');
    await rfHKClick(rfHKFree([1, 0.5, 2.5]));
    var d = rfHKLast();
    assert(d && d.kind === 'len', 'a length dimension: ' + JSON.stringify(UI.modelDims()));
    near(d.value, 4, 1e-9, 'edge length');
    assert(d.text === '4.000', 'reads 4.000 (inch, three places): ' + d.text);
    var m = anvil.model().modelDims;
    assert(m && m.length === 1 && m[0].refs.length === 1 && m[0].refs[0].k === 'edge', 'saved on the model: ' + JSON.stringify(m));
    var lab = UI.modelDimLabel(d.id);
    assert(lab && lab.el.textContent === '4.000', 'label drawn');
    var g = lab.el.parentNode;
    assert(g.querySelector('path.mdl') && g.querySelector('path.mdl').getAttribute('d').split('M').length >= 4, 'extension and dimension lines drawn');
    assert(g.querySelector('path.mda') && /Z.*Z/.test(g.querySelector('path.mda').getAttribute('d')), 'two arrowheads');
    assert(!/dangling/.test(lab.cls), 'not dangling');
    // the label stays the same size zoomed: the sketch dimension font (px), the dimension lines scale with the model
    var fs0 = W.getComputedStyle(lab.el).fontSize;
    var span0 = g.querySelector('path.mdl').getBBox().width;
    UI.zoomView(0.667); await wait(60);
    var lab2 = UI.modelDimLabel(d.id), span1 = lab2.el.parentNode.querySelector('path.mdl').getBBox().width;
    assert(W.getComputedStyle(lab2.el).fontSize === fs0 && span1 > span0 * 1.2, 'zoom: text ' + fs0 + ', lines ' + span0 + ' -> ' + span1);
    UI.modelDimTool(false);
  });

  step('rfHK: two parallel faces (top, then the bottom from the Bottom view) read .500; after the extrude depth changes to .75 in the feature the dimension follows (.750)', async function () {
    await rfHKPart(RFHK_BLOCK);
    UI.modelDimTool(true);
    await rfHKClick(rfHKScr([0.6, 0.5, -0.4]));
    assert(UI.modelDimPicks() === 1, 'top face picked');
    await rfHKView('Bottom');
    await rfHKClick(rfHKScr([0.6, 0, -0.4]));
    assert(UI.modelDimPicks() === 2, 'bottom face picked');
    var free = [30, 30];
    assert(!UI.pickFace(free[0], free[1]), 'corner of the view is free');
    await rfHKClick(free);
    var d = rfHKLast();
    assert(d && d.kind === 'dist', 'a distance: ' + JSON.stringify(UI.modelDims()));
    near(d.value, 0.5, 1e-9, 'face to face'); assert(d.text === '.500', 'reads .500: ' + d.text);
    UI.modelDimTool(false);
    await rfHKView('Isometric');
    var f = UI.App.model.features.filter(function (x) { return x.type === 'extrude'; })[0];
    UI.pushUndo(); f.depth = 0.75; await UI.rebuild(); await idle();
    near(anvil.mass().volume, 4 * 2 * 0.75, 1e-9, 'block rebuilt .75 thick');
    var d2 = UI.modelDims().filter(function (x) { return x.id === d.id; })[0];
    assert(!d2.dangling, 'the faces are found again after the rebuild');
    near(d2.value, 0.75, 1e-9, 'the dimension follows the feature'); assert(d2.text === '.750', 'reads .750: ' + d2.text);
  });

  step('rfHK: a hole: its top rim reads Ø.375 (shop default Ø for holes), placed by a click over the top face; its wall too; two vertices of an edge read 4.000', async function () {
    await rfHKPart(RFHK_BLOCK + '\np.hole("Top", 0, 0, 0.375, { offset: 0.5 });');
    UI.modelDimTool(true);
    await rfHKClick(rfHKScr([0, 0.5, 0.1875]));
    var sel = anvil.selection();
    assert(UI.modelDimPicks() === 1 && sel[0] && sel[0].kind === 'edge', 'rim edge picked: ' + JSON.stringify(sel));
    var onTop = rfHKScr([-1.2, 0.5, -0.5]);
    assert(UI.pickFace(onTop[0], onTop[1]), 'the place click is over the top face');
    await rfHKClick(onTop);   // a Ø on the cursor is placed over a face (the hole sits inside it)
    var d = rfHKLast();
    assert(d && d.kind === 'dia', 'a diameter: ' + JSON.stringify(UI.modelDims()));
    near(d.value, 0.375, 1e-9, 'hole diameter'); assert(d.text === 'Ø.375', 'reads Ø.375: ' + d.text);
    // the hole's wall seen through the opening
    var wall = rfHKScr([-0.1326, 0.42, -0.1326]);
    var fc = UI.pickFace(wall[0], wall[1]);
    assert(fc, 'wall under the pointer');
    await rfHKClick(wall);
    await rfHKClick(rfHKFree([-1, 0.5, 2.5]));
    var dw = rfHKLast();
    assert(dw && dw.kind === 'dia' && dw.id !== d.id, 'wall: a diameter too: ' + JSON.stringify(UI.modelDims()));
    near(dw.value, 0.375, 1e-9, 'wall diameter');
    // two vertices of the front top edge, placed above the edge: aligned = along X = 4.000
    await rfHKClick(rfHKScr([2, 0.5, 1]));
    await rfHKClick(rfHKScr([-2, 0.5, 1]));
    assert(UI.modelDimPicks() === 2 && anvil.selection().every(function (s) { return s.kind === 'vertex'; }), 'two vertices picked: ' + JSON.stringify(anvil.selection()));
    await rfHKClick(rfHKFree([0, 0.5, 2.5]));
    var dv = rfHKLast();
    assert(dv.kind === 'dist', 'vertex distance: ' + JSON.stringify(dv));
    near(dv.value, 4, 1e-9, 'vertex to vertex');
    UI.modelDimTool(false);
  });

  step('rfHK: an angle between the top face and a .125 chamfer face reads 45° or 135° (by where it is placed); suppressing the chamfer turns it red (dangling), unsuppressing brings it back', async function () {
    await rfHKPart(RFHK_BLOCK + '\np.chamfer(0.125, [[0, 0.5, 1]]);');
    UI.modelDimTool(true);
    await rfHKClick(rfHKScr([0.6, 0.5, -0.4]));
    var ch = rfHKScr([0.6, 0.4375, 0.9375]), fc = UI.pickFace(ch[0], ch[1]);
    assert(fc && Math.abs(UI.App.mesh.faces[fc.index].normal[2] - Math.SQRT1_2) < 1e-6, 'chamfer face under the pointer');
    await rfHKClick(ch);
    assert(UI.modelDimPicks() === 2, 'top and chamfer picked');
    await rfHKClick(rfHKFree([1, 0.5, 2.5]));
    var d = rfHKLast();
    assert(d && d.kind === 'ang', 'an angle: ' + JSON.stringify(UI.modelDims()));
    assert(Math.abs(d.value - 45) < 1e-6 || Math.abs(d.value - 135) < 1e-6, 'angle 45 / 135: ' + d.value);
    assert(/°$/.test(d.text), 'text in degrees: ' + d.text);
    UI.modelDimTool(false);
    var chf = UI.App.model.features.filter(function (x) { return x.type === 'chamfer'; })[0];
    await UI.setSuppression([chf.id], true); await idle();
    var d2 = UI.modelDims().filter(function (x) { return x.id === d.id; })[0];
    assert(d2.dangling, 'dangling when the chamfer face is gone');
    var lab = UI.modelDimLabel(d.id);
    assert(lab && /dangling/.test(lab.cls) && /rgb\(255, 90, 82\)/.test(W.getComputedStyle(lab.el).fill), 'drawn red: ' + (lab && lab.cls) + ' ' + (lab && W.getComputedStyle(lab.el).fill));
    await UI.setSuppression([chf.id], false); await idle();
    d2 = UI.modelDims().filter(function (x) { return x.id === d.id; })[0];
    assert(!d2.dangling && Math.abs(d2.value - d.value) < 1e-6, 'found again: ' + JSON.stringify(d2));
  });

  step('rfHK: click a label to select it, Delete removes it, Ctrl+Z brings it back; save / load keeps the dimensions; View ▸ Model Dimensions hides and shows them', async function () {
    await rfHKPart(RFHK_BLOCK);
    UI.modelDimTool(true);
    await rfHKClick(rfHKScr([1, 0.5, 1]));
    await rfHKClick(rfHKFree([1, 0.5, 2.5]));
    await rfHKClick(rfHKScr([2, 0.25, 0.4]));       // right face: alone it waits for a second item
    assert(UI.modelDimPicks() === 1, 'a face alone waits');
    await rfHKClick(rfHKScr([-0.6, 0.5, -0.4]));    // top face: not parallel -> an angle of 90
    await rfHKClick(rfHKFree([-1, 0.5, 2.5]));
    UI.modelDimTool(false);
    var list = UI.modelDims();
    assert(list.length === 2 && list[1].kind === 'ang' && Math.abs(list[1].value - 90) < 1e-6, 'length + 90° angle: ' + JSON.stringify(list));
    var lab = UI.modelDimLabel(list[0].id);
    rfHKEv('mousedown', [lab.x, lab.y], lab.el); rfHKEv('mouseup', [lab.x, lab.y]); await wait(20);
    assert(UI.modelDims()[0].selected, 'label click selects it');
    assert(/sel/.test(UI.modelDimLabel(list[0].id).cls), 'drawn selected');
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })); await idle();
    assert(UI.modelDims().length === 1, 'Delete removes it');
    UI.undoCommand(); await idle(); await wait(30);
    assert(UI.modelDims().length === 2 && UI.modelDims()[0].text === '4.000', 'Ctrl+Z restores it: ' + JSON.stringify(UI.modelDims()));
    // save / load (the document JSON, as File ▸ Save keeps it)
    var json = JSON.stringify(anvil.model());
    await anvil.newPart(); await idle();
    assert(UI.modelDims().length === 0, 'a new part has none');
    await anvil.load(json); await idle();
    var back = UI.modelDims();
    assert(back.length === 2 && back[0].text === '4.000' && Math.abs(back[1].value - 90) < 1e-6 && !back[0].dangling && !back[1].dangling, 'round trip: ' + JSON.stringify(back));
    await rfHKView('Isometric');
    var rows = menuRows('Model Dimensions');
    assert(rows.length === 1 && /View/.test(rows[0].menu), 'View ▸ Model Dimensions row: ' + JSON.stringify(rows.map(function (r) { return r.menu + ' ' + r.text; })));
    if (UI.closeMenus) UI.closeMenus();
    UI.toggleModelDims(); await wait(40);
    assert(!UI.modelDimsShown() && !D.querySelector('#mdim-layer .mdim'), 'hidden');
    UI.toggleModelDims(); await wait(40);
    assert(UI.modelDimsShown() && D.querySelectorAll('#mdim-layer .mdim').length === 2, 'shown again');
  });
