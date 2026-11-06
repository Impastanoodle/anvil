  // --- rfIU (2026-11-05, lane smpm) --- sheet-metal PropertyManagers against SolidWorks 2024: a gauge table locks the
  // thickness and bend radius (Override thickness / Override radius free them; a gauge with several radii offers a
  // list), and the Edge-Flange PM in SolidWorks' order and names (test-reports/2026-11-05-sheetmetal-pm-audit.md).
  function rfIUCheck(label) { var c = pmField(label); assert(c && c.type === 'checkbox', label + ' box'); return c; }
  async function rfIUPlate() {
    if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sketch("Top").rect(0, -3, 4, 3);'); await idle();
  }
  step('rfIU: Base Flange/Tab ▸ Use gauge table ▸ 14 ga locks Thickness and Bend radius to the table; Override radius frees the radius (kept through a gauge change to 12 ga); the Sheet-Metal PM reopens with Override radius on, and unchecking it puts the table radius back', async function () {
    var errs0 = errors.length;
    await rfIUPlate();
    UI.cmdBaseFlange(); await wait(30);
    assert(UI.pmTitle() === 'Base Flange/Tab', 'PM ' + UI.pmTitle());
    assert(!pmField('Override thickness') && !pmField('Override radius'), 'no override boxes without a gauge table');
    assert(!pmField('Thickness').disabled && !pmField('Bend radius').disabled, 'free values without a gauge table');
    rfIUCheck('Use gauge table').click(); await wait(10);
    setInput(pmField('Gauge'), '14'); await wait(10);
    var t = pmField('Thickness'), r = pmField('Bend radius');
    near(+t.value, 0.0747, 1e-12, '14 ga T'); near(+r.value, 0.0747, 1e-12, '14 ga R (example table: R = T)');
    assert(t.disabled && r.disabled, 'locked to the table: T ' + t.disabled + ', R ' + r.disabled);
    var ot = rfIUCheck('Override thickness'), orr = rfIUCheck('Override radius');
    assert(!ot.checked && !orr.checked, 'overrides off');
    // SolidWorks' order: thickness, Reverse direction, bend radius
    var labels = Array.prototype.map.call(D.querySelectorAll('#pm label'), function (l) { return l.textContent.trim(); });
    var iT = labels.indexOf('Thickness  T'), iRev = labels.indexOf('Reverse direction'), iR = labels.indexOf('Bend radius');
    assert(iT >= 0 && iT < iRev && iRev < iR, 'order T / Reverse / R: ' + labels.join(' | '));
    orr.click(); await wait(10);
    r = pmField('Bend radius');
    assert(!r.disabled && pmField('Thickness').disabled, 'Override radius frees R only');
    setInput(r, '0.1'); await wait(10);
    setInput(pmField('Gauge'), '12'); await wait(10);
    near(+pmField('Thickness').value, 0.1046, 1e-12, '12 ga T'); near(+pmField('Bend radius').value, 0.1, 1e-12, 'the overridden R stays');
    await pmAccept();
    var sh = UI.App.model.sheet;
    assert(sh.gauge === '12' && sh.thickness === 0.1046 && sh.bendRadius === 0.1, 'sheet: ' + JSON.stringify(sh));
    var base = UI.App.model.features.filter(function (q) { return q.sheetBase; })[0];
    assert(base && base.overrideRadius === undefined && base.gaugeRadius === undefined && base.overrideThickness === undefined, 'UI keys stay out of the feature: ' + JSON.stringify(base));
    UI.cmdSheetMetal(); await wait(30);
    assert(UI.pmTitle() === 'Sheet-Metal', 'Sheet-Metal PM');
    assert(rfIUCheck('Override radius').checked && !rfIUCheck('Override thickness').checked, 'reopened: Override radius on (0.1 is not the table\'s), Override thickness off');
    assert(pmField('Thickness').disabled && !pmField('Bend radius').disabled, 'reopened locks');
    rfIUCheck('Override radius').click(); await wait(10);
    near(+pmField('Bend radius').value, 0.1046, 1e-12, 'unchecked: the table radius again');
    assert(pmField('Bend radius').disabled, 'locked again');
    UI.pmCancel(); await idle();
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return 'T ' + sh.thickness + ', R ' + sh.bendRadius + ' (override)';
  });
  step('rfIU: a shop gauge table with two more radii for 16 ga (pasted in Edit gauge table…) shows the Table bend radius list; picking .06 fills R .06 and K .45 and the PM reopens on that row', async function () {
    var errs0 = errors.length;
    await rfIUPlate();
    UI.cmdBaseFlange(); await wait(30);
    rfIUCheck('Use gauge table').click(); await wait(10);
    setInput(pmField('Gauge'), '16'); await wait(10);
    assert(!pmField('Table bend radius'), 'one radius: no list');
    clickPmButton('Edit gauge table…');
    assert(modalOpen() && $('gt-dialog'), 'gauge table dialog');
    $('gt-dialog-paste').value = '16\t0.0598\t0.03\t0.4\n16\t0.0598\t0.06\t0.45';
    $('gt-dialog-paste-add').click();
    $('gt-dialog-ok').click(); await wait(10);
    assert(!modalOpen(), 'dialog closed');
    var list = pmField('Table bend radius');
    assert(list && list.tagName === 'SELECT' && list.options.length === 3, 'three radii for 16 ga: ' + (list && list.options.length));
    var texts = Array.prototype.map.call(list.options, function (o) { return o.textContent; });
    assert(/^0\.03 in/.test(texts[1]) && /^0\.06 in/.test(texts[2]), 'radius list: ' + texts.join(' | '));
    setInput(list, '2'); await wait(10);
    near(+pmField('Bend radius').value, 0.06, 1e-12, 'R from the picked row');
    assert(pmField('Bend radius').disabled, 'still locked (from the table)');
    await pmAccept();
    var sh = UI.App.model.sheet;
    assert(sh.gauge === '16' && sh.bendRadius === 0.06 && sh.kFactor === 0.45 && sh.thickness === 0.0598 && typeof sh.gaugeTable === 'object', 'sheet: ' + JSON.stringify(sh));
    UI.cmdSheetMetal(); await wait(30);
    assert(pmField('Table bend radius') && pmField('Table bend radius').value === '2' && !rfIUCheck('Override radius').checked, 'reopened on the .06 row');
    UI.pmCancel(); await idle();
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return 'R ' + sh.bendRadius + ', K ' + sh.kFactor;
  });
  step('rfIU: Edge-Flange PM in SolidWorks 2024 order — Use default radius; Flange Length: Blind, Reverse direction, Length, the three references; Flange Position Material Inside first; Miter corners shows Gap distance; Custom Relief Type Rectangle / Obround; a Material Inside flange builds', async function () {
    var errs0 = errors.length;
    await rfIUPlate();
    await anvil.run('p.units("in");\np.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();'); await idle();
    UI.cmdEdgeFlange(); await wait(30);
    assert(UI.pmTitle() === 'Edge-Flange', 'PM ' + UI.pmTitle());
    assert(rfIUCheck('Use default radius').checked, 'Use default radius');
    var labels = Array.prototype.map.call(D.querySelectorAll('#pm label'), function (l) { return l.textContent.trim(); });
    var at = labels.indexOf('End condition'), seq = labels.slice(at, at + 4).map(function (x) { return x.replace(/^Measured from.*/, 'Measured from'); });
    assert(at >= 0 && seq.join('|') === 'End condition|Reverse direction|Length|Measured from', 'Flange Length order: ' + labels.join(' | '));
    assert(pmField('End condition').tagName === 'SELECT' && pmField('End condition').value === 'blind', 'Blind (rfJC: a list with Up To Vertex)');
    var pos = pmField('Position');
    var vals = Array.prototype.map.call(pos.options, function (o) { return o.value; }).join();
    assert(vals === 'inside,outside,bendOutside,virtualSharp,tangentToBend', 'Flange Position order: ' + vals);
    assert(!pmField('Gap distance'), 'no gap before Miter corners');
    rfIUCheck('Miter corners').click(); await wait(10);
    assert(pmField('Gap distance') && pmField('Gap distance').type === 'number', 'Gap distance with Miter corners');
    rfIUCheck('Miter corners').click(); await wait(10);
    rfIUCheck('Custom relief type').click(); await wait(10);
    var rel = Array.prototype.map.call(pmField('Relief type').options, function (o) { return o.textContent; }).join();
    assert(rel === 'Rectangle,Tear,Obround,None', 'Custom Relief Type list: ' + rel);
    rfIUCheck('Custom relief type').click(); await wait(10);
    assert(UI.App.command.onPick({ kind: 'edge', edge: edgeNear([2, 0.0598, 0]) }) !== false, 'edge pick');
    setInput(pmField('Length'), 1); setInput(pmField('Position'), 'inside'); await wait(10);
    await pmAccept();
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'flange' && f.position === 'inside' && f.length === 1 && f.lengthRef === 'outer' && !UI.App.build.errors[f.id], 'flange: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return 'flange ' + f.position + ', ' + UI.flatSizeText(anvil.flat());
  });
