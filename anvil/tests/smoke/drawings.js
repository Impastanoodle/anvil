  // ---- drawings (drawing.js): File > Make Drawing from Part, Drawing ribbon tab, drawing FeatureManager, sheet
  // (rfW) in a drawing, a button not on the open tab is looked for on the other drawing tab (View Layout / Annotation)
  function ribbonButton(label) {
    var find = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; })[0]; };
    var b = find();
    if (!b && UI.drawingActive && UI.drawingActive()) ['View Layout', 'Annotation'].some(function (t) { dwTab(t); b = find(); return !!b; });
    assert(b, 'ribbon button "' + label + '" not found');
    return b;
  }
  function dwTab(name) { var t = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === name; })[0]; if (t) t.click(); return !!t; }
  // (rfW) a drawing's File / Tools menu entry (Save Drawing as …, Sheet Properties…), clicked
  function dwMenu(text) { var r = menuRows(text); assert(r.length, 'menu entry ' + text); r[0].row.click(); if (UI.closeMenus) UI.closeMenus(); return r[0]; }
  function ribbonTabs() { return Array.prototype.map.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (b) { return b.textContent; }); }
  function dwView(orient) { return anvil.drawing.summary().views.filter(function (v) { return v.orient === orient; })[0]; }
  // client coordinates (inside the frame) of a paper point (mm, y up) on the drawing sheet
  function paperToClient(p) {
    var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
    pt.x = p[0]; pt.y = anvil.drawing.summary().sheet.size[1] - p[1];
    var q = pt.matrixTransform(m);
    return { clientX: q.x, clientY: q.y };
  }
  function sheetMouse(type, p, target) {
    var c = paperToClient(p);
    (target || D.querySelector('#drawing-sheet svg')).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: c.clientX, clientY: c.clientY }));
  }
  function key(k) { W.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
  function plateCode() { return W.AnvilExamples.filter(function (e) { return e.name === 'Plate with bolt holes'; })[0].code; }

  step('drawing: File > Make Drawing from Part opens Draw1 (the plate face and edge views: Front, Top; rfLG), then Standard 3 View gives Front / Top / Right + Isometric, the Drawing tab and the drawing FeatureManager', async function () {
    await anvil.run(plateCode());
    var rows = menuRows('Make Drawing from Part');
    assert(rows.length && rows[0].menu === 'File', 'File menu item missing');
    rows[0].row.click();
    assert(UI.drawingActive() && !$('drawing-doc').hidden, 'drawing document not shown');
    // (rfLG) the plate's own layout from the menu; the rest of the group is written for the Standard 3 View + Isometric
    await UI.drawing.ready();
    assert(anvil.drawing.summary().views.map(function (v) { return v.orient; }).join() === 'Front,Top', 'the plate two views: ' + anvil.drawing.summary().views.map(function (v) { return v.orient; }));
    UI.drawing.standard3View(); await UI.drawing.ready();
    assert(JSON.stringify(ribbonTabs().slice(0, 1)) === '["View Layout"]' && ribbonTabs().indexOf('Features') < 0, 'tabs ' + ribbonTabs());
    // (rfW) View Layout holds the views only, as SolidWorks 2024; dimensions, Model Items and Sheet Properties live elsewhere
    var vl = Array.prototype.map.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return x.getAttribute('aria-label') || ''; });
    ['Standard 3 View', 'Model View', 'Projected View', 'Auxiliary View', 'Section View', 'Detail View', 'Break', 'Crop View'].forEach(function (l) { assert(vl.indexOf(l) >= 0, 'View Layout ' + l + ': ' + vl.join(' | ')); });
    ['Smart Dimension', 'Model Items', 'Sheet Properties', 'Save as PDF'].forEach(function (l) { assert(vl.indexOf(l) < 0, l + ' is not on View Layout'); });
    ['Smart Dimension', 'Model Items'].forEach(ribbonButton);
    dwTab('View Layout');
    assert($('doc-title').textContent === 'Draw1 - Sheet1', 'title ' + $('doc-title').textContent);
    assert(W.getComputedStyle($('fm-tree')).display === 'none' && !$('drawing-tree').hidden, 'part tree still shown');
    var vrows = D.querySelectorAll('#drawing-tree .dw-view');
    assert(vrows.length === 4 && D.querySelector('#drawing-tree .dw-sheet'), 'tree rows ' + vrows.length);
    assert(Array.prototype.map.call(vrows, function (r) { return r.querySelector('.badge').textContent; }).join() === 'Front,Top,Right,Isometric', 'view rows');
    await UI.drawing.ready();   // (r12/drawui12: the views land from drawing-worker.js; model items once all have)
    ['FRONT', 'TOP', 'RIGHT', 'ISOMETRIC', 'DIMENSIONS', 'SHEET'].forEach(function (l) { assert(D.querySelector('#drawing-sheet g[data-layer="' + l + '"]'), 'layer ' + l); });
    var s = anvil.drawing.summary();
    assert(JSON.stringify(s.views.map(function (v) { return v.extents; })) === '[[100,8],[100,60],[60,8],[' + dwView('Isometric').extents.join(',') + ']]', 'extents');
    assert(dwView('Front').stats.hiddenLines === 4 && dwView('Top').stats.visibleCircles === 4 && dwView('Right').stats.hiddenLines === 4, 'stats');
    assert(s.dims.indexOf('4X \u00d88') >= 0 && s.sheet.scale === '2:1' && s.sheet.format === 'A3', JSON.stringify(s.dims) + ' ' + s.sheet.scale);
    assert(D.querySelectorAll('#drawing-sheet line.hidden').length === 8, 'dashed lines ' + D.querySelectorAll('#drawing-sheet line.hidden').length);
    return s.views.length + ' views, dims ' + s.dims.join(' ');
  });
  step('drawing: Smart Dimension on the Front view bottom edge adds a 100 dimension; Undo removes it and the drawing stays open', async function () {
    ribbonButton('Smart Dimension').click();
    assert(UI.drawing.state.tool === 'dim', 'tool not active');
    var F = dwView('Front');
    sheetMouse('mousedown', [F.box[0] + (F.box[2] - F.box[0]) * 0.3, F.box[1]]);
    sheetMouse('mousedown', [F.box[0] + (F.box[2] - F.box[0]) * 0.5, F.box[1] - 12]);   // (rfS) the placement click
    var d = anvil.drawing.doc().views[0].dims;
    assert(d.length === 1 && d[0].kind === 'h' && Math.abs(d[0].value - 100) < 1e-9, 'dims ' + JSON.stringify(d));
    assert(anvil.drawing.summary().dims.filter(function (t) { return t === '100'; }).length === 2, 'the new 100 is drawn');
    key('Escape');
    assert(UI.drawing.state.tool === null, 'Esc should end Smart Dimension');
    await UI.undo(); await idle(); await wait(60);
    assert(UI.drawingActive() && anvil.drawing.doc().views[0].dims.length === 0, 'undo');
    return 'Smart Dimension 100, undone';
  });
  step('drawing: dragging the Top view moves it vertically only (aligned with Front); the Right view stays level', async function () {
    var T0 = dwView('Top'), F0 = dwView('Front');
    var c = [(T0.box[0] + T0.box[2]) / 2, (T0.box[1] + T0.box[3]) / 2];
    sheetMouse('mousedown', c);
    var to = paperToClient([c[0] + 25, c[1] + 12]);
    W.dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: to.clientX, clientY: to.clientY }));
    W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, clientX: to.clientX, clientY: to.clientY }));
    await wait(60);
    var T1 = dwView('Top');
    near(T1.x, F0.x, 1e-6, 'Top x'); assert(T1.y > T0.y + 5, 'Top did not move up: ' + T0.y + ' -> ' + T1.y);
    assert(anvil.drawing.doc().layout === 'manual', 'layout');
    return 'Top y ' + fmt(T0.y) + ' -> ' + fmt(T1.y);
  });
  step('drawing: Model View PM (Bottom) then a click on the sheet places a fifth view there', async function () {
    ribbonButton('Model View').click();
    assert(UI.hasPM() && W.getComputedStyle($('drawing-tree')).display === 'none', 'PM not shown over the drawing tree');
    setInput(pmField('View'), 'Bottom');
    await UI.pmOK();
    assert(UI.drawing.state.tool === 'place', 'placing mode');
    assert(W.getComputedStyle($('drawing-tree')).display !== 'none', 'drawing tree back');
    sheetMouse('mousedown', [70, 95]);
    var v = dwView('Bottom');
    assert(v && anvil.drawing.summary().views.length === 5, 'no Bottom view');
    near(v.x, 70, 1, 'x'); near(v.y, 95, 1, 'y');
    assert(D.querySelectorAll('#drawing-tree .dw-view').length === 5 && D.querySelector('#drawing-sheet g[data-layer="BOTTOM"]'), 'tree / layer');
    return 'Bottom view at ' + fmt(v.x) + ', ' + fmt(v.y);
  });
  step('drawing: Sheet Properties > First angle puts Top below Front and Right to its left; title block says so', async function () {
    dwMenu('Sheet Properties');
    assert(modalOpen(), 'no modal');
    var sels = D.querySelectorAll('#modal .dw-props select');
    assert(sels.length === 3, 'selects ' + sels.length);
    setInput(sels[2], 'first');
    clickModalButton('Apply Changes');
    var F = dwView('Front'), T = dwView('Top'), R = dwView('Right');
    assert(T.y < F.y && R.x < F.x, 'first-angle placement ' + JSON.stringify([F.x, F.y, T.y, R.x]));
    assert(Array.prototype.some.call(D.querySelectorAll('#drawing-sheet text'), function (t) { return t.textContent === 'FIRST ANGLE'; }), 'title block');
    return anvil.drawing.summary().sheet.projection;
  });
  step('drawing: Save as PDF / DXF / SVG open the export dialog with the file; anvil.drawing.dxf() has one layer per view', async function () {
    dwMenu('Save Drawing as PDF');
    assert(modalOpen() && $('modal-title').querySelector('span').textContent === 'Save Drawing as PDF', 'pdf dialog');
    assert(D.querySelector('#modal textarea').value.indexOf('%PDF-1.4') === 0, 'pdf text');
    clickModalButton('Close');
    dwMenu('Save Drawing as DXF');
    assert(D.querySelector('#modal textarea').value.indexOf('ISOMETRIC') > 0, 'dxf text');
    clickModalButton('Close');
    dwMenu('Save Drawing as SVG');
    var svg = D.querySelector('#modal textarea').value;
    clickModalButton('Close');
    assert(!new W.DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror'), 'svg parses');
    var dxf = anvil.drawing.dxf();
    ['FRONT', 'TOP', 'RIGHT', 'ISOMETRIC', 'BOTTOM'].forEach(function (l) { assert(dxf.indexOf('\n8\n' + l + '\n') > 0, 'layer ' + l); });
    return (svg.length / 1024).toFixed(1) + ' KB SVG';
  });
  step('drawing: part shortcuts are swallowed (E opens no Extrude); a part change redraws the views', async function () {
    key('e');
    assert(!UI.hasPM(), 'E opened a PropertyManager in the drawing');
    var f = UI.App.model.features.filter(function (x) { return x.type === 'extrude' && !x.cut; })[0];
    UI.pushUndo(); f.depth = 12;
    await UI.rebuild(); await idle(); await wait(80);
    assert(JSON.stringify(dwView('Front').extents) === '[100,12]', 'front extents ' + JSON.stringify(dwView('Front').extents));
    await UI.undo(); await idle(); await wait(80);
    assert(JSON.stringify(dwView('Front').extents) === '[100,8]' && UI.drawingActive(), 'undo');
    return 'Front 100 x 12, then back to 100 x 8';
  });
  step('drawing: the part tab returns to the part (Features tab, part tree); Window lists the drawing and reopens it', async function () {
    var partTab = Array.prototype.filter.call(D.querySelectorAll('#drawing-tabs .dw-tab'), function (b) { return b.textContent.indexOf(UI.App.model.name) >= 0; })[0];
    assert(partTab, 'part tab');
    UI.markClean();   // (as if saved: the part tab closes without "Save changes to Draw1?", which has its own step at the end)
    partTab.click();
    assert(!UI.drawingActive() && $('drawing-doc').hidden && ribbonTabs().indexOf('Features') >= 0 && ribbonTabs().indexOf('View Layout') < 0, 'still in the drawing');
    assert(W.getComputedStyle($('fm-tree')).display !== 'none', 'part tree hidden');
    var rows = menuRows('Draw1 - Sheet1');
    assert(rows.length && rows[0].menu === 'Window', 'Window menu entry');
    rows[0].row.click();
    assert(UI.drawingActive() && anvil.drawing.summary().views.length === 5, 'reopened');
    anvil.drawing.close();
    assert(!UI.drawingActive(), 'close');
    return 'closed and reopened';
  });
