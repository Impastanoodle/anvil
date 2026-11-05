  // --- rfIF (2026-11-05, lane dimprec) --- dimension precision like SolidWorks 2024 (user: "make it like this", their
  // screenshot of the Dimension PM's Tolerance/Precision box). The two lists carry an icon instead of a text label; the
  // precision list is None, .1 … .12345678 then "<document value> (Document)" last; a dimension's own precision shows
  // up to 8 places on its viewport label and in the Modify box; Tools ▸ Options ▸ Document Properties ▸ Dimensions
  // (the task pane's Document properties) sets the part's primary precision, saved with the part, in generateScript,
  // undoable; the drawing's Dimension PM offers the same list with the drawing's own precision.
  var RFIF_LEN = 1.93812345;
  var RFIF_PLACES = ['None', '.1', '.12', '.123', '.1234', '.12345', '.123456', '.1234567', '.12345678'];
  async function rfIFNew(units) {
    var m = UI.K.newModel('IFPart'); m.units = units;
    await anvil.load(m); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: RFIF_LEN, y2: 0 });
    f.dims = [{ e: 0, k: 'len', off: -0.3 }];
    UI.updateSketches(); UI.setTool('select'); UI.setSelection([]);
    UI.zoomView(0.01 / UI.cam.scale); UI.App.gridStale = true;
    UI.drawDims();
    return f;
  }
  function rfIFLabel() {
    UI.drawDims();
    var t = Array.prototype.filter.call(D.querySelectorAll('#dim-layer .dim text'), function (x) { return x._d && !x._d.auto && x._d.index === 0 && x._d.rel == null; })[0];
    return t ? t.textContent : null;
  }
  // a click on the dimension's label opens its PropertyManager (half a second after the last one: two presses within
  // 450 ms are a double-click, which opens the Modify box)
  async function rfIFOpenPM() {
    await wait(480);
    if (UI.hasPM()) UI.pmCancel();
    UI.setSelection([]); UI.drawDims();
    var t = Array.prototype.filter.call(D.querySelectorAll('#dim-layer .dim text'), function (x) { return x._d && !x._d.auto && x._d.index === 0 && x._d.rel == null; })[0];
    assert(t, 'the dimension label');
    t.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 1, clientY: 1 }));
    W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, button: 0 }));
    if (UI.isDimEditOpen && UI.isDimEditOpen()) UI.cancelDimEdit();
    assert(UI.pmTitle() === 'Dimension', 'Dimension PM: ' + UI.pmTitle() + ' mode ' + UI.App.mode + ' sel ' + JSON.stringify(UI.App.sel && { kind: UI.App.sel.kind, index: UI.App.sel.index }) + ' tool ' + UI.App.tool + ' modal ' + D.getElementById('modal').hidden + ' cmd ' + !!UI.App.command);
  }
  function rfIFSel(key) { return D.querySelector('#pm select[data-key="' + key + '"]'); }
  function rfIFOptions(sel) { return Array.prototype.map.call(sel.options, function (o) { return o.text; }); }
  function rfIFPick(sel, value) { sel.value = value; sel.dispatchEvent(new W.Event('change', { bubbles: true })); UI.drawDims(); }

  step('rfIF: the Dimension PM\'s Tolerance/Precision lists carry icons (no text labels); precision lists None, .1 … .12345678, ".123 (Document)" in an inch part (".12 (Document)" in mm); .12345678 shows 8 places on the label and in the Modify box, None shows 2; Document again restores .938', async function () {
    var f = await rfIFNew('in');
    assert(rfIFLabel() === '1.938', 'default label ' + rfIFLabel());
    await rfIFOpenPM();
    var tol = rfIFSel('tolType'), pr = rfIFSel('prec');
    assert(tol && pr, 'both lists');
    [[tol, 'dimTolType', 'Tolerance type'], [pr, 'dimPrecision', 'Primary unit precision']].forEach(function (x) {
      var row = x[0].closest('.pm-row'), lab = row.querySelector('label.pm-ico-label');
      assert(row.getAttribute('data-icon') === x[1] && lab && lab.querySelector('svg') && lab.textContent.trim() === '', x[2] + ': an icon label');
      assert(lab.getAttribute('title') === x[2] && x[0].getAttribute('aria-label') === x[2], x[2] + ': tooltip / accessible name');
      var r = lab.getBoundingClientRect();
      assert(r.width === 16 && r.height === 16, x[2] + ' icon 16 px: ' + r.width + ' x ' + r.height);
    });
    var txt = D.querySelector('#pm').textContent;
    assert(txt.indexOf('Tolerance type') < 0 && txt.indexOf('Primary unit precision') < 0, 'no text labels in the PM');
    assert(rfIFOptions(tol).join() === 'None,Basic,Bilateral,Limit,Symmetric,MIN,MAX', 'tolerance types kept: ' + rfIFOptions(tol).join());
    assert(rfIFOptions(pr).join('|') === RFIF_PLACES.concat(['.123 (Document)']).join('|'), 'precision list ' + rfIFOptions(pr).join('|'));
    assert(pr.value === 'auto' && pr.options[pr.selectedIndex].text === '.123 (Document)', 'follows the document: ' + pr.value);
    rfIFPick(pr, '8');
    assert(f.dims[0].prec === 8 && rfIFLabel() === '1.93812345', '8 places: ' + rfIFLabel());
    D.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true }));
    var pv = D.querySelector('#pm input[data-key="value"]'); assert(pv && +pv.value === RFIF_LEN, 'PM Value ' + (pv && pv.value));
    var r = UI.openDimEdit ? UI.openDimEdit(0) : null;
    var mb = D.querySelector('#dim-edit input');
    assert(mb && mb.value === '1.93812345', 'Modify box ' + (mb && mb.value) + ' ' + JSON.stringify(r));
    UI.cancelDimEdit();
    await rfIFOpenPM(); pr = rfIFSel('prec');
    assert(pr.value === '8', 'reopened at 8: ' + pr.value);
    rfIFPick(pr, '0');
    assert(f.dims[0].prec === 0 && rfIFLabel() === '2', 'None: ' + rfIFLabel());
    rfIFPick(rfIFSel('prec'), 'auto');
    assert(f.dims[0].prec == null && rfIFLabel() === '1.938', 'Document again: ' + rfIFLabel());
    UI.pmCancel(); await idle();
    // a millimetre part: the default is .12
    await rfIFNew('mm');
    await rfIFOpenPM();
    assert(rfIFOptions(rfIFSel('prec')).pop() === '.12 (Document)', 'mm: ' + rfIFOptions(rfIFSel('prec')).pop());
    assert(rfIFLabel() === '1.94', 'mm label ' + rfIFLabel());
    UI.pmCancel(); await UI.exitSketch(); await idle();
    return 'icons, list, 8 places, None, Document';
  });

  step('rfIF: Document Properties ▸ Dimensions sets the part\'s primary precision (.1234): a dimension following the document shows 4 places and its list reads ".1234 (Document)"; one with its own precision keeps it; Undo restores .123; Save / Open and generateScript keep both', async function () {
    var f = await rfIFNew('in');
    f.entities.push({ t: 'line', x1: 0, y1: 1, x2: 1.5, y2: 1 });
    f.dims.push({ e: 1, k: 'len', off: 0.3, prec: 2 });
    UI.updateSketches(); UI.drawDims();
    UI.openTaskPane('props'); await idle();
    var lin = D.querySelector('[data-role="dim-prec-linear"]'), ang = D.querySelector('[data-role="dim-prec-angular"]');
    assert(lin && ang, 'Dimensions section in Document properties');
    assert(rfIFOptions(lin).join('|') === RFIF_PLACES.join('|') && lin.value === '3' && ang.value === '2', 'defaults .123 / .12: ' + lin.value + ' ' + ang.value);
    var undo0 = UI.App.undo.length;
    lin.value = '4'; lin.dispatchEvent(new W.Event('change', { bubbles: true })); await idle();
    assert(JSON.stringify(UI.App.model.dimPrecision) === '{"linear":4}', 'stored ' + JSON.stringify(UI.App.model.dimPrecision));
    assert(UI.App.undo.length === undo0 + 1, 'one undo step: ' + (UI.App.undo.length - undo0));
    assert(rfIFLabel() === '1.9381', 'follows the document: ' + rfIFLabel());
    var own = Array.prototype.filter.call(D.querySelectorAll('#dim-layer .dim text'), function (x) { return x._d && x._d.index === 1 && x._d.rel == null; })[0];
    assert(own && own.textContent === '1.50', 'own precision kept: ' + (own && own.textContent));
    await rfIFOpenPM();
    var pr = rfIFSel('prec');
    assert(pr.value === 'auto' && pr.options[pr.options.length - 1].text === '.1234 (Document)', 'list end ' + pr.options[pr.options.length - 1].text);
    UI.pmCancel();
    lin = D.querySelector('[data-role="dim-prec-linear"]');
    assert(lin && lin.value === '4', 'task pane shows .1234');
    // generateScript and Save / Open
    await UI.exitSketch(); await idle();
    var script = UI.K.generateScript(UI.App.model);
    assert(script.indexOf('p.dimPrecision({"linear":4});') >= 0, 'script: ' + script.split('\n').slice(0, 3).join(' / '));
    var json = JSON.stringify(UI.App.model);
    await anvil.newPart(); await idle();
    await anvil.load(json); await idle();
    assert(JSON.stringify(UI.App.model.dimPrecision) === '{"linear":4}', 'reopened ' + JSON.stringify(UI.App.model.dimPrecision));
    var sk = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    assert(sk.dims[1].prec === 2 && sk.dims[0].prec == null, 'dimension precisions kept');
    UI.editSketch(sk.id); await idle(); UI.drawDims();
    assert(rfIFLabel() === '1.9381', 'reopened label ' + rfIFLabel());
    await UI.exitSketch(); await idle();
    await anvil.run(script); await idle();
    assert(JSON.stringify(UI.App.model.dimPrecision) === '{"linear":4}', 'script round trip ' + JSON.stringify(UI.App.model.dimPrecision));
    // undo puts the default back
    await anvil.load(json); await idle();
    UI.editSketch(UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0].id); await idle();
    UI.openTaskPane('props'); await idle();
    lin = D.querySelector('[data-role="dim-prec-linear"]');
    lin.value = '3'; lin.dispatchEvent(new W.Event('change', { bubbles: true })); await idle();
    assert(UI.App.model.dimPrecision == null && rfIFLabel() === '1.938', 'back to the default: ' + JSON.stringify(UI.App.model.dimPrecision) + ' ' + rfIFLabel());
    await UI.undo(); await idle();
    if (UI.App.mode !== 'sketch') { UI.editSketch(UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0].id); await idle(); }
    assert(JSON.stringify(UI.App.model.dimPrecision) === '{"linear":4}' && rfIFLabel() === '1.9381', 'Undo: ' + JSON.stringify(UI.App.model.dimPrecision) + ' ' + rfIFLabel());
    await UI.exitSketch(); await idle();
    // a part saved before rfIF (no dimPrecision) shows the same text as before
    var old = JSON.parse(json); delete old.dimPrecision;
    await anvil.load(old); await idle();
    UI.editSketch(UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0].id); await idle();
    assert(rfIFLabel() === '1.938', 'old part ' + rfIFLabel());
    await UI.exitSketch(); await idle();
    UI.closeTaskPane && UI.closeTaskPane();
    await anvil.newPart(); await idle();
    return 'document .1234, own .12 kept, script / save / undo';
  });

  // client coordinates of a paper point (mm, y up) on the drawing sheet
  function rfIFSheet(type, p) {
    var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
    pt.x = p[0]; pt.y = anvil.drawing.summary().sheet.size[1] - p[1];
    var q = pt.matrixTransform(m);
    svg.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: q.x, clientY: q.y }));
  }
  step('rfIF: the drawing\'s Dimension PM shows the same icon lists and precision list with the drawing\'s own value (Document Properties ▸ Units: .1234 → ".1234 (Document)"); .12345678 writes 8 places on the sheet', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(W.AnvilExamples.filter(function (e) { return e.name === 'Plate with bolt holes'; })[0].code); await idle();
    anvil.drawing.make(); await idle(); await wait(60);
    var w = anvil.drawing.summary().dimDetails[0];
    assert(w && w.kind === 'h' && w.text === '100', 'width dim ' + JSON.stringify(w));
    var mid = function (b) { return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
    rfIFSheet('dblclick', mid(w.box)); await wait(20);
    assert(UI.hasPM() && UI.pmSpec().command === 'dimension', 'drawing Dimension PM');
    var pr = rfIFSel('prec'), tol = rfIFSel('tolType');
    assert(pr.closest('.pm-row').getAttribute('data-icon') === 'dimPrecision' && tol.closest('.pm-row').getAttribute('data-icon') === 'dimTolType', 'icon rows');
    assert(rfIFOptions(pr).join('|') === RFIF_PLACES.concat(['.12 (Document)']).join('|') && pr.value === 'auto', 'drawing list ' + rfIFOptions(pr).join('|'));
    rfIFPick(pr, '8');
    UI.pmOK(); await idle(); await wait(40);
    assert(anvil.drawing.summary().dims[0] === '100.00000000', '8 places on the sheet: ' + anvil.drawing.summary().dims[0]);
    // the drawing's Document Properties list, then its value in the PM
    var rows = menuRows('Options ▸ Document Properties');
    assert(rows.length, 'Tools ▸ Options ▸ Document Properties');
    rows[0].row.click(); await wait(20);
    var dp = D.getElementById('dw-opt-prec');
    assert(dp && rfIFOptions(dp).slice(1).join('|') === RFIF_PLACES.join('|'), 'drawing document list ' + (dp && rfIFOptions(dp).join('|')));
    dp.value = '4'; D.getElementById('dw-opt-ok').click(); await idle(); await wait(40);
    w = anvil.drawing.summary().dimDetails[1];
    rfIFSheet('dblclick', mid(w.box)); await wait(20);
    pr = rfIFSel('prec');
    assert(UI.hasPM() && pr && pr.options[pr.options.length - 1].text === '.1234 (Document)', 'drawing document value: ' + (pr && pr.options[pr.options.length - 1].text));
    UI.pmCancel(); await wait(20);
    // rfIF-2: the drawing-wide setting at .1234567 and .12345678 writes 7 and 8 places (it stopped at 6 before)
    var docText = [];
    for (var pl = 7; pl <= 8; pl++) {
      menuRows('Options ▸ Document Properties')[0].row.click(); await wait(20);
      dp = D.getElementById('dw-opt-prec');
      assert(dp, 'Document Properties');
      dp.value = String(pl); D.getElementById('dw-opt-ok').click(); await idle(); await wait(40);
      var t1 = anvil.drawing.summary().dims[1];
      assert(new RegExp('\\.\\d{' + pl + '}(\\D|$)').test(t1) && !new RegExp('\\.\\d{' + (pl + 1) + '}').test(t1), pl + ' places on the sheet: ' + t1);
      assert(anvil.drawing.options().dimPrec === pl, 'document option ' + pl);
      docText.push(t1);
    }
    assert(anvil.drawing.summary().dims[0] === '100.00000000', 'own precision kept: ' + anvil.drawing.summary().dims[0]);
    anvil.drawing.close(); await idle();
    await anvil.newPart(); await idle();
    return 'drawing list, 8 places, document .1234, ' + docText.join(' / ');
  });
