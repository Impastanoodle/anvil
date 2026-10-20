  // --- rfCT (2026-10-20, lane CT: drawing dimension tools) --- the drawing's Smart Dimension flyout and Tools ▸
  // Dimensions: Horizontal / Vertical Dimension (held to one direction wherever they are placed), Horizontal / Vertical
  // Ordinate (the direction preset), Angular Running and Path Length Dimension. Real mouse events on the sheet; one undo
  // step per placed dimension; Esc ends each tool.
  var CT_PLATE = 'p.name("CTPlate").units("in");\np.sketch("Front").rect(0, 0, 4, 2).circle(3, 1, 0.25).extrude(0.25);';
  var CT_FAN = 'p.name("CTFan").units("in");\np.sketch("Front").polyline([[0, 0], [4, 0], [4, 2], [1, 1.7320508075688772]]).circle(2.1650635094610964, 1.25, 0.2).extrude(0.25);';
  async function rfCTDrawing(code) {
    await anvil.newPart(); await idle();
    await anvil.run(code); await idle();
    anvil.drawing.make({ fresh: true }); await idle(); await wait(60);
    await UI.drawing.ready();
    UI.drawing.fit(); await wait(20);
    return anvil.drawing.summary();
  }
  function rfCTClient(p) {
    var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
    pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
    var q = pt.matrixTransform(m);
    return { clientX: q.x, clientY: q.y };
  }
  function rfCTMouse(type, p) {
    var c = rfCTClient(p);
    D.querySelector('#drawing-sheet svg').dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: c.clientX, clientY: c.clientY, detail: 1 }));
  }
  function rfCTClick(p) { rfCTMouse('mousemove', p); rfCTMouse('mousedown', p); rfCTMouse('mouseup', p); }
  // the front view's sheet point of a model point (view units, inches)
  function rfCTFront(q) { var w = UI.drawing.state.sheet.views.filter(function (x) { return x.view.orient === 'Front'; })[0]; return w.toSheet(q); }
  function rfCTFrontDims() { var id = anvil.drawing.summary().views.filter(function (v) { return v.orient === 'Front'; })[0].id; return anvil.drawing.doc().views.filter(function (v) { return v.id === id; })[0].dims || []; }
  function rfCTTab(name) { var t = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === name; })[0]; if (t) t.click(); return !!t; }
  // pick an entry of the Smart Dimension flyout's ▾ list (Annotation tab)
  function rfCTFly(label) {
    rfCTTab('Annotation');
    var c = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === 'Smart Dimension options'; })[0];
    assert(c, 'the Smart Dimension flyout ▾');
    c.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true })); c.click();
    var row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (r) { return r.textContent.indexOf(label) >= 0; })[0];
    assert(row, 'flyout entry ' + label + ' in: ' + Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (r) { return r.textContent; }).join(' | '));
    row.click();
    if (UI.closeMenus) UI.closeMenus();
  }
  function rfCTMenu(text) { var r = menuRows(text); assert(r.length, 'menu entry ' + text); r[0].row.click(); if (UI.closeMenus) UI.closeMenus(); return r[0]; }
  function rfCTEsc() { W.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); }

  step('rfCT: Smart Dimension flyout ▸ Horizontal Dimension — vertex to hole centre on the Front view of a 4 × 2 plate, placed above-left, reads 3.000 (not the aligned 3.162); Tools ▸ Dimensions ▸ Vertical Dimension reads 1.000; one undo step each; Esc ends', async function () {
    var errs0 = errors.length;
    await rfCTDrawing(CT_PLATE);
    rfCTFly('Horizontal Dimension');
    var st = UI.drawing.state;
    assert(st.tool === 'dim' && st.dimLock === 'h', 'Horizontal Dimension on: ' + st.tool + ' / ' + st.dimLock);
    assert(/^Horizontal Dimension/.test(statusText()), 'prompt: ' + statusText());
    var face = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button.rb-face'), function (b) { return b.getAttribute('aria-label') === 'Horizontal Dimension'; })[0];
    assert(face && face.classList.contains('active'), 'the flyout shows Horizontal Dimension, on');
    var u0 = UI.App.undo.length, n0 = rfCTFrontDims().length;
    rfCTClick(rfCTFront([0, 0])); rfCTClick(rfCTFront([3, 1])); rfCTClick(rfCTFront([-0.8, 2.8]));
    await idle(); await wait(30);
    var dims = rfCTFrontDims(), d = dims[dims.length - 1];
    assert(dims.length === n0 + 1 && d.kind === 'h' && d.lock === 'h', 'a horizontal dimension: ' + JSON.stringify(d && { kind: d.kind, lock: d.lock }));
    assert(Math.abs(d.value - 3) < 1e-9, 'X distance only: ' + d.value);
    assert(UI.App.undo.length === u0 + 1, 'one undo step: ' + (UI.App.undo.length - u0));
    assert(anvil.drawing.summary().dims.indexOf('3.000') >= 0, 'on the sheet: ' + anvil.drawing.summary().dims.join(' | '));
    rfCTEsc(); await wait(30);
    assert(!UI.drawing.state.tool && !UI.drawing.state.dimLock, 'Esc ends it: ' + UI.drawing.state.tool);
    assert(rfCTFrontDims().length === n0 + 1, 'the dimension stays');
    // Tools ▸ Dimensions ▸ Vertical Dimension
    rfCTMenu('Dimensions ▸ Vertical Dimension');
    assert(UI.drawing.state.tool === 'dim' && UI.drawing.state.dimLock === 'v', 'Vertical Dimension on');
    u0 = UI.App.undo.length;
    rfCTClick(rfCTFront([0, 0])); rfCTClick(rfCTFront([3, 1])); rfCTClick(rfCTFront([-0.8, 2.8]));
    await idle(); await wait(30);
    dims = rfCTFrontDims(); d = dims[dims.length - 1];
    assert(d.kind === 'v' && Math.abs(d.value - 1) < 1e-9, 'Y distance: ' + d.kind + ' ' + d.value);
    assert(UI.App.undo.length === u0 + 1, 'one undo step');
    rfCTEsc(); await wait(30);
    assert(!UI.drawing.state.tool, 'Esc ends Vertical Dimension');
    // the export carries both, a DIMENSION entity each in R2000
    var dxf = anvil.drawing.dxf({ version: 'R2000' });
    assert(dxf.indexOf('3.000') > 0 && dxf.indexOf('1.000') > 0, 'DXF texts');
    UI.ribbonFlyFace('dwDim', 0);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return '3.000 horizontal, 1.000 vertical';
  });

  step('rfCT: Horizontal Ordinate (flyout) and Vertical Ordinate (Tools ▸ Dimensions) — the direction preset, no Direction box: left edge then the hole reads 0, 3.000; bottom edge then the hole 0, 1.000; ✓ ends', async function () {
    var errs0 = errors.length;
    await rfCTDrawing(CT_PLATE);
    rfCTFly('Horizontal Ordinate Dimension');
    assert(UI.drawing.state.tool === 'ordinate' && UI.drawing.state.pending.fixed === 'h', 'Horizontal Ordinate on');
    assert(UI.pmTitle() === 'Horizontal Ordinate Dimension' && !pmField('Measure'), 'PM ' + UI.pmTitle() + ', no Direction box');
    var u0 = UI.App.undo.length;
    rfCTClick(rfCTFront([0, 1])); rfCTClick(rfCTFront([3.25, 1]));
    await idle();
    var d = rfCTFrontDims().filter(function (x) { return x.kind === 'ordinate'; })[0];
    assert(d && d.dir === 'h' && Math.abs(d.values[0] - 3) < 1e-9, 'horizontal ordinate ' + JSON.stringify(d && { dir: d.dir, values: d.values }));
    assert(UI.App.undo.length === u0 + 1, 'one undo step');
    D.querySelector('#pm .pm-ok').click(); await wait(30);
    assert(!UI.drawing.state.tool, '✓ ends it');
    rfCTMenu('Dimensions ▸ Vertical Ordinate Dimension');
    assert(UI.drawing.state.tool === 'ordinate' && UI.drawing.state.pending.fixed === 'v' && UI.pmTitle() === 'Vertical Ordinate Dimension', 'Vertical Ordinate on');
    rfCTClick(rfCTFront([2, 0])); rfCTClick(rfCTFront([3, 1.25]));
    await idle();
    var dv = rfCTFrontDims().filter(function (x) { return x.kind === 'ordinate' && x.dir === 'v'; })[0];
    assert(dv && Math.abs(dv.values[0] - 1) < 1e-9, 'vertical ordinate ' + JSON.stringify(dv && dv.values));
    assert(anvil.drawing.summary().dims.indexOf('0, 1.000') >= 0 && anvil.drawing.summary().dims.indexOf('0, 3.000') >= 0, 'texts ' + anvil.drawing.summary().dims.join(' | '));
    rfCTEsc(); await wait(30);
    assert(!UI.drawing.state.tool, 'Esc ends it');
    UI.ribbonFlyFace('dwDim', 0);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'ordinates h / v';
  });

  step('rfCT: Angular Running Dimension — base the bottom edge, then the hole at 30° and the edge at 60°: one record, 0°, 30°, 60° on the sheet, one undo step; Path Length — bottom then right edge, a click on free paper places 6.000; an edge that does not join is refused; Esc ends', async function () {
    var errs0 = errors.length;
    await rfCTDrawing(CT_FAN);
    rfCTMenu('Dimensions ▸ Angular Running Dimension');
    assert(UI.drawing.state.tool === 'angrun' && UI.pmTitle() === 'Angular Running Dimension', 'Angular Running on: ' + UI.drawing.state.tool);
    assert(/^Angular Running Dimension: click the base/.test(statusText()), 'prompt ' + statusText());
    var u0 = UI.App.undo.length;
    rfCTClick(rfCTFront([3, 0]));
    assert(/base picked/.test(statusText()), 'base: ' + statusText());
    rfCTClick(rfCTFront([2.1650635094610964 + 0.2, 1.25])); rfCTClick(rfCTFront([0.5, 0.8660254037844386]));
    await idle();
    var ar = rfCTFrontDims().filter(function (x) { return x.kind === 'angrun'; });
    assert(ar.length === 1 && ar[0].refs.length === 2, 'one record, two picks: ' + ar.length);
    assert(Math.abs(ar[0].values[0] - 30) < 1e-6 && Math.abs(ar[0].values[1] - 60) < 1e-6, 'values ' + JSON.stringify(ar[0].values));
    assert(UI.App.undo.length === u0 + 1, 'one undo step: ' + (UI.App.undo.length - u0));
    assert(anvil.drawing.summary().dims.indexOf('0°, 30°, 60°') >= 0, 'sheet ' + anvil.drawing.summary().dims.join(' | '));
    D.querySelector('#pm .pm-ok').click(); await wait(30);
    assert(!UI.drawing.state.tool, '✓ ends it');
    // Path Length from the flyout
    rfCTFly('Path Length Dimension');
    assert(UI.drawing.state.tool === 'pathlen', 'Path Length on');
    u0 = UI.App.undo.length;
    rfCTClick(rfCTFront([2, 0])); rfCTClick(rfCTFront([4, 1]));
    assert(UI.drawing.state.pending.refs.length === 2 && /2 edges, 6\.000/.test(statusText()), 'chain ' + statusText());
    rfCTClick(rfCTFront([2.5, 1.86]));   // the top edge meets the right one: it joins
    assert(UI.drawing.state.pending.refs.length === 3, 'top edge joined');
    rfCTClick(rfCTFront([2.5, 1.86]));   // a second click takes it off
    assert(UI.drawing.state.pending.refs.length === 2, 'taken off again');
    var w = UI.drawing.state.sheet.views.filter(function (x) { return x.view.orient === 'Front'; })[0];
    rfCTClick([w.box.x1 + 0.4, w.box.y0 - 0.3]);
    await idle();
    var pl = rfCTFrontDims().filter(function (x) { return x.kind === 'pathlen'; });
    assert(pl.length === 1 && Math.abs(pl[0].value - 6) < 1e-9 && pl[0].lead, 'path length 6 placed: ' + JSON.stringify(pl.map(function (x) { return x.value; })));
    assert(UI.App.undo.length === u0 + 1, 'one undo step');
    assert(anvil.drawing.summary().dims.indexOf('6.000') >= 0, 'sheet text');
    rfCTClick(rfCTFront([2, 0])); rfCTClick(rfCTFront([2.5, 1.86]));
    assert(/does not join/.test(statusText()) && UI.drawing.state.pending.refs.length === 1, 'refused: ' + statusText());
    rfCTEsc(); await wait(30);
    assert(!UI.drawing.state.tool, 'Esc ends Path Length');
    var svg = anvil.drawing.svg(0);
    assert(svg.indexOf('60°') > 0 && svg.indexOf('6.000') > 0, 'SVG carries both');
    UI.ribbonFlyFace('dwDim', 0);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return 'angular running 0/30/60, path 6.000';
  });

  step('rfCT: after creation, as a shop user — click the Path Length: Dimension PM (no Flip arrows), precision .12 reads 6.00, Undo puts 6.000 back, Redo 6.00; drag its text and the running set\'s arc; precision .1 on the running set reads 0°, 30.0°, 60.0° with no Tolerance box; close and reopen the drawing: both kept; R12 / R2000 DXF and PDF carry them', async function () {
    var errs0 = errors.length;
    var s = await rfCTDrawing(CT_FAN), F = s.views.filter(function (v) { return v.orient === 'Front'; })[0];
    assert(anvil.drawing.pathLength(F.id, { refs: [{ a: [0, 0], b: [4, 0] }, { a: [4, 0], b: [4, 2] }] }), 'path length by the API');
    assert(anvil.drawing.angularRunning(F.id, { base: { a: [0, 0], b: [4, 0] }, refs: [{ c: [2.1650635094610964, 1.25], r: 0.2 }, { a: [0, 0], b: [1, 1.7320508075688772] }] }), 'running set by the API');
    await idle(); await UI.drawing.ready();
    function sdim(kind) { return UI.drawing.state.sheet.dims.filter(function (x) { return x.view === F.id && x.kind === kind; })[0]; }
    function mid(b) { return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; }
    var pl = sdim('pathlen');
    assert(pl && pl.text === '6.000' && pl.tbox, 'path length on the sheet: ' + (pl && pl.text));
    rfCTClick(mid(pl.tbox)); await wait(30);
    assert(UI.hasPM() && UI.pmSpec().command === 'dimension', 'Dimension PM on a click');
    assert(!pmField('Flip arrows') && pmField('Unit precision'), 'precision, no Flip arrows');
    var pr = pmField('Unit precision'); pr.value = '2'; pr.dispatchEvent(new W.Event('change', { bubbles: true }));
    D.querySelector('#pm .pm-ok').click(); await idle(); await wait(30);
    assert(anvil.drawing.summary().dims.indexOf('6.00') >= 0, 'precision .12: ' + anvil.drawing.summary().dims.join(' | '));
    await UI.undo(); await idle(); await wait(40);
    assert(UI.drawingActive() && anvil.drawing.summary().dims.indexOf('6.000') >= 0, 'Undo: ' + anvil.drawing.summary().dims.join(' | '));
    await UI.redo(); await idle(); await wait(40);
    assert(anvil.drawing.summary().dims.indexOf('6.00') >= 0, 'Redo: ' + anvil.drawing.summary().dims.join(' | '));
    // drag the path length's text, then the running set's arc outward
    pl = sdim('pathlen');
    var p0 = mid(pl.tbox), lead0 = pl.leadNow.slice();
    rfCTMouse('mousedown', p0); rfCTMouse('mousemove', [p0[0] + 0.3, p0[1] + 0.2]); rfCTMouse('mousemove', [p0[0] + 0.6, p0[1] + 0.4]); rfCTMouse('mouseup', [p0[0] + 0.6, p0[1] + 0.4]);
    await idle(); await wait(30);
    var stored = rfCTFrontDims().filter(function (x) { return x.kind === 'pathlen'; })[0];
    assert(stored.lead && Math.abs(stored.lead[0] - lead0[0] - 0.6) < 0.05, 'leader dragged: ' + JSON.stringify(stored.lead) + ' from ' + JSON.stringify(lead0));
    if (UI.hasPM()) { UI.pmCancel(); await wait(20); }
    var arc = UI.drawing.state.sheet.prims.filter(function (p) { return p.k === 'arc' && p.layer === 'DIMENSIONS' && p.view === F.id; })[0];
    assert(arc, 'the running set\'s arc');
    var am = (arc.a0 + arc.a1) / 2 * Math.PI / 180, q0 = [arc.c[0] + arc.r * Math.cos(am), arc.c[1] + arc.r * Math.sin(am)], R0 = arc.r;
    rfCTMouse('mousedown', q0); rfCTMouse('mousemove', [q0[0] + 0.1 * Math.cos(am), q0[1] + 0.1 * Math.sin(am)]); rfCTMouse('mousemove', [q0[0] + 0.3 * Math.cos(am), q0[1] + 0.3 * Math.sin(am)]); rfCTMouse('mouseup', [q0[0] + 0.3 * Math.cos(am), q0[1] + 0.3 * Math.sin(am)]);
    await idle(); await wait(30);
    var arc2 = UI.drawing.state.sheet.prims.filter(function (p) { return p.k === 'arc' && p.layer === 'DIMENSIONS' && p.view === F.id; })[0];
    assert(arc2 && arc2.r > R0 + 0.2, 'the arc moved out: ' + R0 + ' -> ' + (arc2 && arc2.r));
    if (UI.hasPM()) { UI.pmCancel(); await wait(20); }
    var ar = sdim('angrun');
    rfCTClick(mid(ar.tbox)); await wait(30);
    assert(UI.hasPM() && UI.pmSpec().command === 'dimension' && !pmField('Tolerance') && !pmField('Text (<DIM>'), 'running set PM: precision only');
    pr = pmField('Unit precision'); pr.value = '1'; pr.dispatchEvent(new W.Event('change', { bubbles: true }));
    D.querySelector('#pm .pm-ok').click(); await idle(); await wait(30);
    assert(anvil.drawing.summary().dims.indexOf('0°, 30.0°, 60.0°') >= 0, 'precision .1: ' + anvil.drawing.summary().dims.join(' | '));
    // close and reopen: kept
    anvil.drawing.close(); await idle();
    anvil.drawing.open(0); await idle(); await UI.drawing.ready(); await wait(40);
    var dims = anvil.drawing.summary().dims;
    assert(dims.indexOf('6.00') >= 0 && dims.indexOf('0°, 30.0°, 60.0°') >= 0, 'reopened: ' + dims.join(' | '));
    var r12 = anvil.drawing.dxf({ version: 'R12' }), r2k = anvil.drawing.dxf({ version: 'R2000' }), pdf = anvil.drawing.pdf();
    [r12, r2k].forEach(function (x, i) { assert(x.indexOf('6.00') > 0 && /60\.0(%%d|°)/.test(x), (i ? 'R2000' : 'R12') + ' texts'); });
    assert(typeof pdf !== 'string' || pdf.indexOf('6.00') > 0, 'PDF text');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return 'edited, undone, redone, dragged, reopened';
  });
