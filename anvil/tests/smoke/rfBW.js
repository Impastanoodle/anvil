  // --- rfBW (2026-10-13, lane BW): sheet metal the way the shop user does it — Base Flange/Tab from the gauge table,
  // an Edge Flange typed with the two-Enter rule, the Flatten dialog's size, a Hem, and the Sheet-Metal PM's bend
  // deduction typed with Enter. Uses pmField / setInput / pressEnter / edgeNear / clickModalButton of ui-smoke.html
  // and r3sType of r3-sketch3 (the group files share one scope). ---
  step('rfBW: Base Flange/Tab ▸ Use gauge table ▸ Steel 16 ga fills T = R = 0.0598; Edge-Flange: Length 1.5 typed + Enter commits and keeps the PM (status says press Enter again), Enter again is ✓ (Outer Virtual Sharp, Bend Outside); Flatten reads 5.5213 × 3 in', async function () {
    var errs0 = errors.length;
    UI.sheetMetalMemory(null);
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sketch("Top").rect(0, -3, 4, 3);'); await idle();
    UI.cmdBaseFlange(); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Base Flange/Tab', 'Base Flange/Tab PM: ' + UI.pmTitle());
    var ug = pmField('Use gauge table');
    assert(ug && ug.type === 'checkbox' && !ug.checked, 'Use gauge table box, off');
    ug.click(); await wait(10);
    var tbl = pmField('Table');
    assert(tbl && tbl.tagName === 'SELECT' && /Steel/.test(tbl.value), 'Table select, Steel first: ' + (tbl && tbl.value));
    setInput(pmField('Gauge'), '16'); await wait(10);
    near(+pmField('Thickness').value, 0.0598, 1e-9, '16 ga thickness'); near(+pmField('Bend radius').value, 0.0598, 1e-9, 'bend radius = T (example table)');
    await pmAccept();
    var sh = UI.App.model.sheet;
    assert(sh && sh.gauge === '16' && /^Steel/.test(sh.gaugeTable) && sh.thickness === 0.0598, 'sheet: ' + JSON.stringify(sh));
    // the edge flange, typed: 1.5 Enter Enter
    UI.cmdEdgeFlange(); await wait(30);
    assert(UI.pmTitle() === 'Edge-Flange', 'Edge-Flange PM: ' + UI.pmTitle());
    assert(UI.App.command.onPick({ kind: 'edge', edge: edgeNear([0, 0.0598, 1.5]) }) !== false, 'edge pick rejected');
    var len = pmField('Length');
    assert(len && len.type === 'number', 'Length box');
    len.focus(); len.select();
    r3sType(len, '1.5');
    var ev = pressEnter(len);
    assert(ev.defaultPrevented && UI.hasPM() && UI.pmTitle() === 'Edge-Flange', 'the first Enter kept the PM open');
    assert(UI.pmSpec().values.length === 1.5, 'length applied: ' + UI.pmSpec().values.length);
    assert(/press Enter again to finish/.test(statusText()), 'status: ' + statusText());
    pressEnter(len); await idle(); await wait(20);
    assert(!UI.hasPM(), 'the second Enter is ✓');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'flange' && f.length === 1.5 && f.lengthRef === 'outer' && f.position === 'bendOutside' && f.angle === 90, 'flange: ' + JSON.stringify(f));
    var BA = Math.PI / 2 * (0.0598 + 0.5 * 0.0598), BD = 2 * 0.1196 - BA, F = 4 + 0.1196 + 1.5 - BD;
    near(anvil.flat().size[0], F, 1e-9, 'flat length A + B − BD');
    UI.cmdFlatten(); await wait(20);
    assert(modalOpen(), 'flat pattern dialog');
    var fs = D.querySelector('#modal-body [data-role="flat-size"]');
    assert(fs && fs.textContent.indexOf('Flat size ' + UI.fmtNum(F, 4) + ' × 3 in') === 0, 'flatten dialog: ' + (fs && fs.textContent));
    clickModalButton('Close');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return fs.textContent;
  });
  step('rfBW: Hem on the opposite edge (Open, Material Inside, 0.5) ✓: the flat grows by L + BA − R − T; Sheet-Metal PM ▸ Bend Deduction 0.098 typed + Enter keeps the PM with the flat size following, Enter again ✓: both bends BD .098', async function () {
    var errs0 = errors.length;
    UI.cmdHem(); await wait(30);
    assert(UI.pmTitle() === 'Hem', 'Hem PM: ' + UI.pmTitle());
    assert(UI.App.command.onPick({ kind: 'edge', edge: edgeNear([4, 0.0598, 1.5]) }) !== false, 'edge pick rejected');
    var hl = pmField('Hem length');
    assert(hl, 'Hem length box');
    setInput(hl, 0.5);
    var gap = pmField('Gap distance');
    assert(gap, 'Gap distance box (Open hem)');
    setInput(gap, 0.06);
    await pmAccept();
    var h = UI.App.model.features[UI.App.model.features.length - 1];
    assert(h.type === 'flange' && h.hem === true && h.hemType === 'open' && h.hemPosition === 'inside' && h.length === 0.5 && Math.abs(h.radius - 0.03) < 1e-9, 'hem: ' + JSON.stringify(h));
    var BA = Math.PI / 2 * (0.0598 + 0.5 * 0.0598), BD = 2 * 0.1196 - BA, F = 4 + 0.1196 + 1.5 - BD;
    var hemAdd = 0.5 + Math.PI * (0.03 + 0.5 * 0.0598) - (0.03 + 0.0598);
    near(anvil.flat().size[0], F + hemAdd, 1e-9, 'flat with the hem');
    assert(anvil.flat().loops.length === 1, 'one loop');
    // the shop's bend deduction, typed in the Sheet-Metal PM with the two-Enter rule
    UI.cmdSheetMetal(); await wait(30);
    assert(UI.pmTitle() === 'Sheet-Metal', 'Sheet-Metal PM: ' + UI.pmTitle());
    setInput(pmField('Type'), 'deduction'); await wait(10);
    var bd = pmField('Bend deduction');
    assert(bd, 'Bend deduction box');
    bd.focus(); bd.select();
    r3sType(bd, '0.098');
    pressEnter(bd); await wait(10);
    assert(UI.hasPM() && UI.pmTitle() === 'Sheet-Metal' && UI.pmSpec().values.bendDeduction === 0.098, 'the first Enter committed 0.098 and kept the PM');
    pressEnter(bd); await idle(); await wait(20);
    assert(!UI.hasPM(), 'the second Enter is ✓');
    assert(UI.App.model.sheet.bendAllowanceType === 'deduction' && UI.App.model.sheet.bendDeduction === 0.098, 'sheet: ' + JSON.stringify(UI.App.model.sheet));
    var flat = anvil.flat();
    assert(flat.bends.length === 2 && flat.bends.every(function (b) { return Math.abs(b.bd - 0.098) < 1e-9 && b.method === 'deduction'; }), 'both bends BD .098: ' + JSON.stringify(flat.bends.map(function (b) { return [b.label, b.bd]; })));
    near(flat.size[0], 4 + 0.1196 + 1.5 - 0.098 + (0.5 + 2 * (0.03 + 0.0598) - 0.098 - (0.03 + 0.0598)), 1e-9, 'flat = A + B − BD, hem BA = 2·OSSB − BD');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'flat ' + UI.fmtNum(flat.size[0], 4) + ' × ' + UI.fmtNum(flat.size[1], 4);
  });
