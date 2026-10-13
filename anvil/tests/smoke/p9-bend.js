  // ---- p9-bend: bend allowance methods in the Sheet-Metal PropertyManager, Custom Bend Allowance, flat size readout
  // L bracket in inches, T = R = 0.060, base 4 × 3, a 90° flange of wall 1.5 on the x = 0 edge: outside dimensions
  // A = 4.12, B = 1.62, flat length A + B − BD.
  var P9_LB = 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();';
  function p9FlatText() {
    var lab = Array.prototype.filter.call(D.querySelectorAll('#pm label'), function (l) { return l.textContent === 'Flat size'; })[0];
    assert(lab, 'no Flat size row in the PM');
    return lab.parentElement.querySelector('.static').textContent;
  }
  step('p9-bend: Sheet-Metal PM: switch to Bend Deduction, type 0.1, the flat size follows; ✓ stores it and the status bar shows the flat size', async function () {
    var errs0 = errors.length;
    await anvil.run(P9_LB + '\np.flange(1.5, [[0, 0.06, 1.5]]);');
    await idle();
    UI.cmdSheetMetal();
    assert(UI.hasPM() && /Sheet-Metal/.test($('pm').innerText), 'Sheet-Metal PM not open: ' + $('pm').innerText.slice(0, 80));
    var BDk = 2 * 0.12 - Math.PI / 2 * (0.06 + 0.5 * 0.06);
    var before = p9FlatText();
    assert(before.indexOf(UI.fmtNum(4.12 + 1.62 - BDk, 4) + ' × 3 in') === 0, 'K-factor flat size: ' + before);
    setInput(pmField('Type'), 'deduction');
    var bd = pmField('Bend deduction');
    assert(bd && bd.type === 'number', 'Bend deduction field missing');
    setInput(bd, 0.1);
    var after = p9FlatText();
    assert(after.indexOf('5.64 × 3 in') === 0, 'flat size after BD 0.1: ' + after + ' (was ' + before + ')');
    await pmAccept();
    assert(!UI.hasPM(), 'PM still open');
    var sh = UI.App.model.sheet;
    assert(sh.bendAllowanceType === 'deduction' && sh.bendDeduction === 0.1 && sh.kFactor === 0.5, 'sheet: ' + JSON.stringify(sh));
    assert(/Flat size 5\.64 × 3 in/.test(statusText()), 'status: ' + statusText());
    near(anvil.flat().size[0], 5.64, 1e-9, 'kernel flat length');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return before + ' → ' + after;
  });
  step('p9-bend: Edge-Flange PM Custom Bend Allowance (Bend Deduction 0.09) wins over the sheet\'s 0.1', async function () {
    await anvil.run(P9_LB.replace('p.sheet(0.06, 0.06, 0.5);', 'p.sheet(0.06, 0.06, 0.5, { bendAllowanceType: "deduction", bendDeduction: 0.1 });'));
    await idle();
    UI.cmdEdgeFlange();
    assert(UI.hasPM(), 'Edge-Flange PM not open');
    assert(UI.App.command.onPick({ kind: 'edge', edge: edgeNear([0, 0.06, 1.5]) }) !== false, 'edge pick rejected');
    setInput(pmField('Length'), 1.5);
    var cb = pmField('Custom bend allowance');
    assert(cb && cb.type === 'checkbox' && !cb.checked, 'Custom bend allowance check');
    cb.click();
    setInput(pmField('Type'), 'deduction');
    setInput(pmField('Bend deduction'), 0.09);
    await pmAccept();
    var s = anvil.summary();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'flange' && f.bendAllowance && f.bendAllowance.type === 'deduction' && f.bendAllowance.value === 0.09, JSON.stringify(f));
    assert(!('useCustomBA' in f) && !('cbaBD' in f), 'UI-only keys leaked: ' + Object.keys(f).join());
    near(anvil.flat().size[0], 4.12 + 1.5 - 0.09, 1e-9, 'flat with the custom BD');   // Outer Virtual Sharp: the flange is 1.5 outside
    assert(/p\.flange\(1\.5, .*bendAllowance: \{"type":"deduction","value":0\.09\}/.test(anvil.script()), 'script: ' + anvil.script().split('\n').pop());
    UI.cmdFlatten();
    assert(modalOpen(), 'flat pattern dialog');
    var fs = D.querySelector('#modal-body [data-role="flat-size"]');
    assert(fs && /^Flat size 5\.53 × 3 in/.test(fs.textContent), 'flatten dialog: ' + (fs && fs.textContent));
    clickModalButton('Close');
    return fs.textContent;
  });
  step('p9-bend: Bend Table grid (pasted rows, BD by angle) and gauge pick in the Sheet-Metal PM', async function () {
    await anvil.run(P9_LB + '\np.flange(1.5, [[0, 0.06, 1.5]]);');
    await idle();
    UI.cmdSheetMetal();
    setInput(pmField('Type'), 'table');
    clickPmButton('Edit bend table…');
    assert(modalOpen() && $('bt-dialog'), 'bend table dialog');
    $('bt-dialog-paste').value = '0.06\t0.06\t60\t0.05\n0.06\t0.06\t120\t0.15';
    $('bt-dialog-paste-add').click();
    assert(D.querySelectorAll('#bt-dialog tr.grid-row').length === 2, 'pasted rows: ' + D.querySelectorAll('#bt-dialog tr.grid-row').length);
    $('bt-dialog-ok').click();
    assert(!modalOpen(), 'dialog closed');
    assert(/2 rows of bend deduction/.test($('pm').innerText), 'table summary: ' + $('pm').innerText.replace(/\s+/g, ' ').slice(0, 300));
    var t = p9FlatText();
    assert(t.indexOf('5.64 × 3 in') === 0, 'table flat (90° interpolated to 0.1): ' + t);
    var ug = pmField('Use gauge table');
    ug.click();
    assert(/example — replace with your shop's values/.test($('pm').innerText), 'gauge example label');
    setInput(pmField('Gauge'), '14');
    near(+pmField('Thickness').value, 0.0747, 1e-12, '14 ga thickness');
    assert(/updates after ✓/.test(p9FlatText()), 'T changed: ' + p9FlatText());
    await pmAccept();
    var sh = UI.App.model.sheet;
    assert(sh.thickness === 0.0747 && sh.gauge === '14' && sh.bendAllowanceType === 'table' && sh.bendTable.rows.length === 2, JSON.stringify(sh));
    var flat = anvil.flat();
    assert(flat.warnings.length === 1 && /Bend table: no row/.test(flat.warnings[0]), 'the 14 ga bend falls back to K: ' + flat.warnings.join(' | '));
    return 'gauge 14: ' + UI.flatSizeText(flat);
  });
