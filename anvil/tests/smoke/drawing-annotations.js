  // ---- drawing annotations (run cloud-2026-09-25m): Annotation tab, centre marks, centrelines, hole callouts,
  // ordinate dimensions, the Dimension PropertyManager (tolerance, driving the part), balloons
  function annots(type, viewId) { return anvil.drawing.summary().annotations.filter(function (a) { return (!type || a.type === type) && (viewId == null || a.view === viewId); }); }
  function boxMid(b) { return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
  function sheetDrag(from, to) {
    sheetMouse('mousedown', from);
    var c = paperToClient(to);
    W.dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: c.clientX, clientY: c.clientY }));
    W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, clientX: c.clientX, clientY: c.clientY }));
  }
  step('annotations: a new plate drawing auto-inserts centre marks (Top) and centrelines (Front, Right); the Annotation tab has the tools; Document Properties turns centre marks off for new views', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(plateCode()); await idle();
    anvil.drawing.make(); await idle(); await wait(60);
    var T = dwView('Top'), F = dwView('Front'), R = dwView('Right');
    var cm = annots('centerMark'), cl = annots('centerline');
    assert(cm.length === 4 && cm.every(function (a) { return a.view === T.id && a.auto; }), 'centre marks ' + JSON.stringify(annots().map(function (a) { return a.view + a.type; })));
    // the marks sit on the hole centres: Top view box x0 + 2 * x, y1 - 2 * z at 2:1
    [[10, 10], [90, 10], [10, 50], [90, 50]].forEach(function (xz) {
      var x = T.box[0] + 2 * xz[0], y = T.box[3] - 2 * xz[1];
      assert(cm.some(function (a) { return Math.hypot(a.centers[0][0] - x, a.centers[0][1] - y) < 1e-6; }), 'mark at ' + xz);
    });
    assert(cl.filter(function (a) { return a.view === F.id; }).length === 2 && cl.filter(function (a) { return a.view === R.id; }).length === 2, 'centrelines');
    assert(D.querySelectorAll('#drawing-sheet g[data-layer="ANNOTATIONS"] line.center').length >= 20, 'centre-line styled lines');
    var mrow = D.querySelector('#drawing-tree .dw-centerMark');
    assert(mrow && mrow.querySelector('.badge').textContent === '4' && D.querySelectorAll('#drawing-tree .dw-centerline').length === 2, 'tree rows');
    assert(ribbonTabs().slice(0, 2).join() === 'View Layout,Annotation', 'tabs ' + ribbonTabs());
    Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (b) { return b.textContent === 'Annotation'; })[0].click();
    ['Smart Dimension', 'Ordinate Dimension', 'Baseline Dimension', 'Chamfer Dimension', 'Model Items', 'Balloon', 'Auto Balloon', 'Stacked Balloon', 'Hole Callout', 'Center Mark', 'Centerline', 'Document Properties'].forEach(ribbonButton);
    ribbonButton('Document Properties').click();
    assert(modalOpen() && $('dw-opt-cm').checked && $('dw-opt-cl').checked, 'Document Properties with auto insert on');
    $('dw-opt-cm').checked = false;
    $('dw-opt-ok').click(); await wait(30);
    assert(anvil.drawing.summary().options.autoCenterMarks === false && anvil.drawing.summary().options.autoCenterlines === true, 'options');
    anvil.drawing.addView('Bottom', { x: 330, y: 90 }); await wait(30);
    var B = dwView('Bottom');
    assert(B && annots('centerMark', B.id).length === 0 && annots('centerline').length === 4, 'no centre marks on the new Bottom view');
    anvil.drawing.deleteView(B.id);
    return cm.length + ' marks, ' + cl.length + ' centrelines';
  });
  step('annotations: Center Mark PM (Linear: two holes then ✓), Hole Callout tool reads 4X Ø8 THRU ALL and drags, Centerline tool, Delete and Undo', async function () {
    var T = dwView('Top'), x0 = T.box[0], y1 = T.box[3];
    ribbonButton('Center Mark').click();
    assert(UI.hasPM() && UI.drawing.state.tool === 'centermark', 'Center Mark PM');
    setInput(pmField('Style'), 'linear');
    sheetMouse('mousedown', [x0 + 20 + 8, y1 - 20]); sheetMouse('mousedown', [x0 + 180 + 8, y1 - 20]);
    await UI.pmOK(); await wait(30);
    var lin = annots('centerMark').filter(function (a) { return a.style === 'linear'; });
    assert(lin.length === 1 && lin[0].text === 'Linear Center Mark (2)' && UI.drawing.state.tool === null, 'linear mark ' + JSON.stringify(lin));
    ribbonButton('Hole Callout').click();
    sheetMouse('mousedown', [x0 + 20 + 8, y1 - 100]);
    sheetMouse('mousedown', [x0 + 20 + 8, y1 - 100]);   // (rfKX) the second click places it (on the hole: its default place)
    key('Escape');
    var hc = annots('holeCallout');
    assert(hc.length === 1 && hc[0].text === '4X Ø8 THRU ALL', 'callout ' + JSON.stringify(hc));
    assert(Array.prototype.some.call(D.querySelectorAll('#drawing-sheet g[data-layer="ANNOTATIONS"] text'), function (t) { return t.textContent === '4X Ø8 THRU ALL'; }), 'callout drawn');
    function calloutOf() { var out = null; anvil.drawing.doc().views.forEach(function (v) { (v.annotations || []).forEach(function (a) { if (a.type === 'holeCallout') out = a; }); }); return out; }
    var b0 = hc[0].box, from = [b0[2] - 4, b0[3] - 2], l0 = calloutOf().leadNow.slice();
    sheetDrag(from, [from[0] - 30, from[1] + 12]); await wait(60);
    var l1 = calloutOf().lead;
    near(l1[0] - l0[0], -30, 0.5, 'leader dragged left'); near(l1[1] - l0[1], 12, 0.5, 'leader dragged up');
    // Centerline tool: click the hole row of the Right view (its centrelines were auto-inserted; delete one first)
    var R = dwView('Right'), rl = annots('centerline', R.id);
    anvil.drawing.deleteAnnotation(rl[0].id);
    assert(annots('centerline', R.id).length === 1, 'one right centreline left');
    ribbonButton('Centerline').click();
    var ax = (rl[0].box[0] + rl[0].box[2]) / 2;
    sheetMouse('mousedown', [ax + 1, (R.box[1] + R.box[3]) / 2]);
    key('Escape');
    assert(annots('centerline', R.id).length === 2, 'centreline added back');
    // select a centre mark on the sheet and Delete it; Undo restores it
    var n = annots('centerMark').length, m = annots('centerMark').filter(function (a) { return a.style === 'single'; })[0];
    sheetMouse('mousedown', [m.centers[0][0] + 6, m.centers[0][1]]);
    assert(UI.drawing.state.sel && UI.drawing.state.sel.kind === 'annot', 'selected ' + JSON.stringify(UI.drawing.state.sel));
    key('Delete');
    assert(annots('centerMark').length === n - 1, 'deleted');
    await UI.undo(); await idle(); await wait(60);
    assert(UI.drawingActive() && annots('centerMark').length === n, 'undo');
    return 'linear mark, ' + hc[0].text + ', centreline, delete / undo';
  });
  step('annotations: Ordinate Dimension (vertical, Top view): base = top edge, then two holes, reads 0 / 10 / 50; Chamfer Dimension tool on a chamfered box reads 2 X 45°', async function () {
    var T = dwView('Top'), x0 = T.box[0], y1 = T.box[3];
    ribbonButton('Ordinate Dimension').click();
    setInput(pmField('Measure'), 'v');
    sheetMouse('mousedown', [x0 + 100, y1]);
    sheetMouse('mousedown', [x0 + 20 + 8, y1 - 20]);
    sheetMouse('mousedown', [x0 + 20 + 8, y1 - 100]);
    await UI.pmOK(); await wait(30);
    var od = anvil.drawing.summary().dimDetails.filter(function (d) { return d.kind === 'ordinate'; });
    assert(od.length === 1 && od[0].text === '0, 10, 50' && od[0].view === T.id, 'ordinate ' + JSON.stringify(od));
    anvil.drawing.close(); await idle();
    await anvil.newPart(); await idle();
    await anvil.run('p.box(40, 20, 10); p.chamfer(2, [[20, 10, 20]]);'); await idle();
    anvil.drawing.make(); await idle(); await wait(60);
    var R = dwView('Right'), s = +anvil.drawing.summary().sheet.scale.split(':')[0] / +anvil.drawing.summary().sheet.scale.split(':')[1];
    // Right view: u = -z ∈ [-20, 0], v = y ∈ [0, 10]; the chamfer runs (-20, 8) - (-18, 10), the lead-in edge along v = 10
    Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (b) { return b.textContent === 'Annotation'; })[0].click();
    ribbonButton('Chamfer Dimension').click();
    sheetMouse('mousedown', [R.box[0] + 1 * s, R.box[3] - 1 * s]);
    sheetMouse('mousedown', [R.box[0] + 10 * s, R.box[3]]);
    key('Escape');
    var cd = anvil.drawing.summary().dimDetails.filter(function (d) { return d.kind === 'chamfer'; });
    assert(cd.length === 1 && cd[0].text === '2 X 45°', 'chamfer ' + JSON.stringify(cd));
    anvil.drawing.close(); await idle();
    return od[0].text + '; ' + cd[0].text;
  });
  step('dimensions: drag the plate width text down; double-click → Dimension PM: Bilateral +0.1 / -0.05 at .12; again: Value 120 drives the part (rebuild, 120 wide); Undo restores 100', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(plateCode()); await idle();
    anvil.drawing.make(); await idle(); await wait(60);
    var dd = anvil.drawing.summary().dimDetails, w = dd[0];
    assert(w.kind === 'h' && w.auto && w.text === '100', 'width dim ' + JSON.stringify(w));
    var mid = boxMid(w.box);
    sheetDrag(mid, [mid[0] + 6, mid[1] - 12]); await wait(60);
    var w1 = anvil.drawing.summary().dimDetails[0];
    near(w1.box[1] - w.box[1], -12, 0.5, 'moved down');
    var pr = anvil.drawing.doc().dimProps[w.style];
    assert(pr && pr.at != null && Math.abs(pr.tx - 6) < 0.5, 'dimProps ' + JSON.stringify(anvil.drawing.doc().dimProps));
    near(pr.at, -5 - 6, 0.25, 'dimension line 12 mm lower at 2:1');
    sheetMouse('dblclick', boxMid(w1.box));
    assert(UI.hasPM() && D.querySelector('#pm .pm-head span').textContent === 'Dimension', 'Dimension PM');
    assert(/Sketch1/.test(D.querySelector('#pm').textContent), 'Drives Sketch1');
    setInput(D.querySelector('#pm select[data-key="tolType"]'), 'bilateral');
    setInput(pmField('Maximum variation'), '0.1'); setInput(pmField('Minimum variation'), '0.05'); setInput(D.querySelector('#pm select[data-key="prec"]'), '2');
    await UI.pmOK(); await wait(30);
    assert(anvil.drawing.summary().dims[0] === '100.00 +0.10/-0.05', 'tolerance ' + anvil.drawing.summary().dims[0]);
    assert(Array.prototype.some.call(D.querySelectorAll('#drawing-sheet g[data-layer="DIMENSIONS"] text'), function (t) { return t.textContent === '+0.10'; }), 'stacked tolerance drawn');
    sheetMouse('dblclick', boxMid(anvil.drawing.summary().dimDetails[0].box));
    setInput(pmField('Value'), '120');
    await UI.pmOK(); await idle(); await wait(80);
    assert(UI.drawingActive() && JSON.stringify(dwView('Front').extents) === '[120,8]', 'driven: ' + JSON.stringify(dwView('Front').extents));
    assert(anvil.drawing.summary().dims[0] === '120.00 +0.10/-0.05', 'dim follows ' + anvil.drawing.summary().dims[0]);
    assert(UI.App.model.features.filter(function (f) { return f.type === 'sketch'; })[0].entities[0].w === 120, 'sketch width');
    await UI.undo(); await idle(); await wait(80);
    assert(JSON.stringify(dwView('Front').extents) === '[100,8]' && anvil.drawing.summary().dims[0] === '100.00 +0.10/-0.05', 'undo ' + anvil.drawing.summary().dims[0]);
    return 'dragged, toleranced, driven 100 -> 120 -> undo';
  });
  step('balloons: Balloon tool on the part drawing (edge, place) is item 1; drag it; double-click → Show quantity 1X; Stacked Balloon on the assembly isometric stacks Plate, Pin, Cap with QTY', async function () {
    var T = dwView('Top');
    Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (b) { return b.textContent === 'Annotation'; })[0].click();
    ribbonButton('Balloon').click();
    sheetMouse('mousedown', [T.box[0], (T.box[1] + T.box[3]) / 2 + 7]);
    sheetMouse('mousedown', [T.box[0] - 25, T.box[3] + 8]);
    UI.pmCancel();
    var bl = anvil.drawing.summary().balloons;
    assert(bl.length === 1 && bl[0].item === 1 && bl[0].manual, 'balloon ' + JSON.stringify(bl));
    near(bl[0].c[0], T.box[0] - 25, 0.5, 'placed x'); near(bl[0].c[1], T.box[3] + 8, 0.5, 'placed y');
    sheetDrag(bl[0].c, [bl[0].c[0] - 10, bl[0].c[1] + 5]); await wait(60);
    var b2 = anvil.drawing.summary().balloons[0];
    near(b2.c[0] - bl[0].c[0], -10, 1, 'dragged x'); near(b2.c[1] - bl[0].c[1], 5, 1, 'dragged y');
    sheetMouse('dblclick', b2.c);
    assert(UI.hasPM() && D.querySelector('#pm .pm-head span').textContent === 'Balloon', 'Balloon PM');
    var q = pmField('Show quantity'); q.checked = true; q.dispatchEvent(new W.Event('change', { bubbles: true }));
    await UI.pmOK(); await wait(30);
    assert(anvil.drawing.summary().balloons[0].qty === '1X', 'qty ' + JSON.stringify(anvil.drawing.summary().balloons[0]));
    anvil.drawing.close(); await idle();
    // assembly: Auto Balloon finds an edge point of each component; the Stacked Balloon tool uses them
    var ex = W.AnvilExamples.filter(function (e) { return e.name === 'Pinned plate assembly'; })[0];
    await UI.openExample(ex); await idle();
    anvil.drawing.make(); await idle(); await wait(60);
    var iso = dwView('Isometric');
    var auto = anvil.drawing.autoBalloon(iso.id).balloons;
    var at = {}; auto.forEach(function (b) { at[b.item] = b.attach; });
    anvil.drawing.deleteBalloons(iso.id);
    Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (b) { return b.textContent === 'Annotation'; })[0].click();
    ribbonButton('Stacked Balloon').click();
    var qs = pmField('Show quantity'); qs.checked = true; qs.dispatchEvent(new W.Event('change', { bubbles: true }));
    sheetMouse('mousedown', at[1]);
    sheetMouse('mousedown', [iso.box[0] - 10, iso.box[3] + 10]);
    sheetMouse('mousedown', at[2]); sheetMouse('mousedown', at[3]);
    await UI.pmOK(); await wait(30);
    var sb = anvil.drawing.summary().balloons;
    assert(sb.length === 1 && sb[0].item === 1 && JSON.stringify(sb[0].stack) === '[2,3]' && sb[0].qty === '1X', 'stack ' + JSON.stringify(sb));
    assert(D.querySelectorAll('#drawing-sheet g[data-layer="BALLOONS"] circle').length === 3, 'three circles');
    sheetMouse('mousedown', sb[0].c); key('Delete');
    assert(!anvil.drawing.summary().balloons.length, 'deleted');
    await UI.undo(); await idle(); await wait(60);
    assert(anvil.drawing.summary().balloons.length === 1, 'undo');
    var dxf = anvil.drawing.dxf();
    assert(dxf.indexOf('\n2\nCENTER\n') > 0 && dxf.indexOf('\n8\nANNOTATIONS\n') > 0, 'DXF annotations');
    anvil.drawing.close(); await idle();
    await anvil.newPart(); await idle();
    return 'part balloon 1 (1X); stack ' + [sb[0].item].concat(sb[0].stack).join(' | ');
  });
