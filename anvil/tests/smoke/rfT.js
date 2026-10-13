  // --- rfT: Model Items PM, ANSI inch dimension style and scales, DIMENSION entities in the R2000 DXF ---
  var RFT_BRACKET = ['p.name("Bracket").units("in");', 'p.sheet(0.0598, 0.0598, 0.44);',
    'p.sketch("Top").rect(0, -4, 6, 4).end().baseFlange(0.0598);',
    'p.sketch("Top", 0.0598).circle(1, -1, 0.1405).circle(5, -1, 0.1405).circle(3, -3, 0.25).cut("through", { reverse: true });',
    'p.flange(1.5, [[0, 0.0598, 2]]);', 'p.flange(1.0, [[6, 0.0598, 2]], { reverse: true });'].join('\n');
  async function rfTDrawing() {
    await anvil.newPart(); await idle();
    await anvil.run(RFT_BRACKET); await idle();
    anvil.drawing.make(); await idle(); await wait(60);
    await UI.drawing.ready();
  }
  function rfTTab(name) { Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (b) { return b.textContent === name; })[0].click(); }
  function rfTRadio(label) { var r = pmField(label); assert(r && r.type === 'radio', 'radio ' + label); r.checked = true; r.dispatchEvent(new W.Event('change', { bubbles: true })); }
  step('rfT: a 6 x 4 inch bracket lands on ANSI B at 1:1, Sheet Properties lists the ANSI scales (1:8, no 1:5), the MATERIAL cell is blank without a material; Model Items opens its PropertyManager and inserts flange lengths and hole locations, no outside bend radius', async function () {
    var errs0 = errors.length;
    await rfTDrawing();
    var s = anvil.drawing.summary();
    assert(s.sheet.format === 'ANSI B' && s.sheet.scale === '1:1', 'sheet ' + JSON.stringify(s.sheet));
    assert(anvil.drawing.titleBlock().material === '', 'material cell: ' + JSON.stringify(anvil.drawing.titleBlock().material));
    dwMenu('Sheet Properties'); await wait(30);
    var scSel = Array.prototype.filter.call(D.querySelectorAll('#modal-body select'), function (x) { return /Automatic/.test(x.textContent); })[0];
    assert(scSel, 'scale select');
    var opts = Array.prototype.map.call(scSel.options, function (o) { return o.value; });
    assert(opts.indexOf('1:8') >= 0 && opts.indexOf('1:16') >= 0 && opts.indexOf('1:5') < 0 && opts.indexOf('1:10') < 0, 'ANSI scales: ' + opts.join(' '));
    UI.closeModal();
    assert(W.Drawing.SCALES.some(function (x) { return x[0] === 1 && x[1] === 5; }), 'the metric list is back after the dialog');
    assert(s.dims.indexOf('R.120') < 0 && s.dims.indexOf('2X R.120') < 0, 'no outside bend radius: ' + s.dims.join(' | '));
    rfTTab('Annotation');
    var u0 = UI.App.undo.length;
    ribbonButton('Model Items').click(); await wait(30);
    assert(UI.hasPM() && D.querySelector('#pm .pm-head span').textContent === 'Model Items', 'Model Items PM');
    ['Entire model', 'Selected feature', 'Import items into all views', 'Marked for drawing', 'Hole Wizard locations', 'Hole callout', 'Eliminate duplicates'].forEach(function (t) { assert(pmField(t), 'PM field ' + t); });
    assert(pmField('Eliminate duplicates').checked && pmField('Hole Wizard locations').checked, 'defaults on');
    await UI.pmOK(); await wait(60);
    s = anvil.drawing.summary();
    assert(UI.App.undo.length === u0 + 1, 'one undo step');
    ['1.620', '1.000', '3.000', '1.120', '6.239', '4.000', 'Ø.500', '2X Ø.281', '2X R.060'].forEach(function (t) { assert(s.dims.indexOf(t) >= 0, t + ' in ' + s.dims.join(' | ')); });
    assert(s.dims.filter(function (t) { return /R\.120/.test(t); }).length === 0, 'no R.120: ' + s.dims.join(' | '));
    var n = s.dims.length;
    // Source: Selected feature (Edge-Flange1): only its flange length
    ribbonButton('Model Items').click(); await wait(30);
    rfTRadio('Selected feature');
    var fs = pmField('Feature'), fl = Array.prototype.filter.call(fs.options, function (o) { return /Edge-Flange1/.test(o.textContent); })[0];
    assert(fl, 'Edge-Flange1 listed: ' + Array.prototype.map.call(fs.options, function (o) { return o.textContent; }).join());
    setInput(fs, fl.value);
    await UI.pmOK(); await wait(60);
    s = anvil.drawing.summary();
    assert(s.dims.join() === '1.620', 'flange only: ' + s.dims.join(' | '));
    UI.undo(); await wait(60);
    assert(anvil.drawing.summary().dims.length === n, 'undo back to ' + n);
    // Hole callout off, into the Top view only
    var top = dwView('Top');
    anvil.drawing.modelItems({ views: [top.id], holeCallouts: false });
    await wait(60);
    s = anvil.drawing.summary();
    assert(s.dims.indexOf('Ø.500') < 0 && s.dims.indexOf('1.000') >= 0 && s.dims.indexOf('2.679') < 0 && s.dims.filter(function (t) { return t === '4.000'; }).length === 1, 'Top only, no Ø: ' + s.dims.join(' | '));
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return n + ' items';
  });
  step('rfT: Document Properties has a Dimensions page with the ANSI inch sizes (.125 text, .125 arrows, .0625 gap, .125 extension); a new text height redraws the dimensions and goes into the R2000 DXF, whose dimensions are DIMENSION entities with *D blocks', async function () {
    var errs0 = errors.length;
    await rfTDrawing();
    var hs = Array.prototype.map.call(D.querySelectorAll('#drawing-sheet g[data-layer="DIMENSIONS"] text'), function (t) { return t.getAttribute('font-size'); });
    rfTTab('Annotation');
    ribbonButton('Document Properties').click(); await wait(30);
    var fld = function (k) { return D.getElementById('dw-opt-' + k); };
    assert(fld('dimText') && +fld('dimText').value === 0.125 && +fld('arrowLen').value === 0.125 && +fld('arrowWidth').value === 0.042 && +fld('extGap').value === 0.0625 && +fld('extBeyond').value === 0.125, 'ANSI sizes ' + (fld('dimText') && fld('dimText').value));
    setInput(fld('dimText'), '0.15');
    D.getElementById('dw-opt-ok').click(); await wait(60);
    var hs2 = Array.prototype.map.call(D.querySelectorAll('#drawing-sheet g[data-layer="DIMENSIONS"] text'), function (t) { return t.getAttribute('font-size'); });
    assert(hs.length && hs2.length && Math.abs(hs2[0] / hs[0] - 1.2) < 1e-3, 'text 1.2x: ' + hs[0] + ' -> ' + hs2[0]);
    var dxf = anvil.drawing.dxf({ version: 'R2000' }), nd = (dxf.match(/\n0\nDIMENSION\n/g) || []).length;
    assert(nd === anvil.drawing.summary().dims.length && nd > 0, 'DIMENSION entities ' + nd);
    assert(/\nAcDbRotatedDimension\n/.test(dxf) && /\nAcDbDiametricDimension\n/.test(dxf) && /\n2\n\*D1\n70\n1\n/.test(dxf), 'subclasses and anonymous blocks');
    assert(/\nDIMSTYLE\n[\s\S]*?\n140\n0\.15\n/.test(dxf) && /\n41\n0\.125\n/.test(dxf), 'DIMSTYLE text .15 / arrows .125');
    var r12 = anvil.drawing.dxf({ version: 'R12' });
    assert(!/\nDIMENSION\n/.test(r12), 'R12 stays exploded');
    UI.undo(); await wait(60);
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return nd + ' DIMENSION';
  });
  // --- end rfT ---
