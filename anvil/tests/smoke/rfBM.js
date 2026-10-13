  // ---- rfBM (lane BM, 2026-10-13): Transform ▸ Geometry Nesting — the U-bracket's flat pattern × 12 on a 48 × 96 in
  // sheet from the PropertyManager, ✓ makes the Nest document with one sketch per sheet, sheet 1's DXF reads back
  step('rfBM: Geometry Nesting — the U-bracket example\'s flat pattern × 12 on 48 × 96 from the PM (Add flat pattern, quantity 12, Nest: 12 on one sheet with a preview), Save DXF\'s sheet 1 reads back with 12 × the blank\'s entities on CUT (R12 and R2000), ✓ makes the Nest document with the sheet sketch on Top (outline as construction)', async function () {
    var errs0 = errors.length;
    var ex = W.AnvilExamples.filter(function (e) { return e.name === 'Sheet-metal U-bracket'; })[0];
    await UI.openExample(ex); await idle();
    assert(typeof UI.cmdTNesting === 'function', 'UI.cmdTNesting');
    UI.cmdTNesting(); await wait(20);
    assert(UI.pmTitle() === 'Geometry Nesting', 'PM ' + UI.pmTitle());
    var size = pmField('Size');
    assert(size && size.value === '48x96', 'preset ' + (size && size.value));
    near(+pmField('Length (X)').value, 96 * 25.4, 1e-9, 'sheet X in mm'); near(+pmField('Width (Y)').value, 48 * 25.4, 1e-9, 'sheet Y in mm');
    clickPmButton('Add flat pattern'); await wait(20);
    var st = UI.nestState();
    assert(st.parts.length === 1 && st.parts[0].name === 'U-Bracket', 'parts: ' + st.parts.map(function (p) { return p.name; }));
    var qty = D.querySelector('#pm input.nest-qty');
    assert(qty, 'quantity box');
    setInput(qty, 12); await wait(20);
    clickPmButton('Nest'); await wait(20);
    st = UI.nestState();
    assert(st.result && st.result.placed === 12 && st.result.sheets.length === 1 && !st.result.unplaced.length, 'nest: ' + (st.result && st.result.placed));
    assert(W.Nest.check(st.result).ok, 'no overlap: ' + W.Nest.check(st.result).problems.join('; '));
    var svg = D.querySelector('#pm [data-role="nest-preview"]');
    assert(svg && svg.querySelectorAll('path').length === 12, 'preview with 12 blanks');
    assert(/12 of 12 parts on 1 sheet/.test(D.querySelector('#pm .pm-msg').textContent), 'message ' + D.querySelector('#pm .pm-msg').textContent);
    // live: a spacing change re-nests at once
    var util = st.result.utilization;
    setInput(pmField('Part spacing'), 0.5 * 25.4); await wait(20);
    st = UI.nestState();
    assert(st.result && !st.stale && st.result.opts.spacing === 0.5 * 25.4 && st.result.placed === 12, 'live re-nest');
    near(st.result.utilization, util, 1e-9, 'same parts, same utilisation');
    // DXF of sheet 1: each blank's cut entities (the flat's own DXF without bend lines and notes), × 12, on CUT
    var flat = K.flatPattern(UI.App.model, UI.App.build, UI.App.mesh), per = W.DxfImport.parse(K.exportDXFFlat(flat, 'mm', { style: 'entities', bendLines: false, notes: false })).entities.length;
    ['R12', 'R2000'].forEach(function (v) {
      var text = UI.nestSheetDXF(0, v), back = W.DxfImport.parse(text);
      assert(back.entities.length === 12 * per && back.entities.every(function (e) { return e.layer === 'CUT'; }), v + ': ' + back.entities.length + ' entities, want 12 × ' + per);
      assert(back.units === 'mm' && text.indexOf(v === 'R12' ? 'AC1009' : 'AC1015') > 0, v + ' header');
    });
    // Save DXF downloads one file per sheet
    var saved = [], dl = UI.download;
    UI.download = function (name, text) { saved.push({ name: name, text: text }); };
    try { clickPmButton('Save DXF'); } finally { UI.download = dl; }
    assert(saved.length === 1 && /U-Bracket-nest-sheet1\.dxf$/.test(saved[0].name) && W.DxfImport.parse(saved[0].text).entities.length === 12 * per, 'saved ' + saved.map(function (s) { return s.name; }));
    // ✓: the Nest document
    await pmAccept(); await idle();
    var m = UI.App.model, sk = m.features.filter(function (f) { return f.type === 'sketch'; });
    assert(m.name === 'Nest' && m.units === 'mm' && sk.length === 1 && sk[0].name === 'Sheet1' && sk[0].plane.ref === 'Top', 'document ' + m.name + ' ' + sk.map(function (f) { return f.name; }));
    assert(sk[0].entities.filter(function (e) { return e.construction; }).length === 4 && sk[0].entities.filter(function (e) { return e.layer === 'CUT'; }).length === 12 * per, 'sheet sketch: ' + sk[0].entities.length + ' entities');
    assert(m.nest && m.nest.placed === 12 && m.nest.sheets.length === 1, 'nest record');
    assert(!UI.hasPM() && /^Nest: 12 of 12 parts/.test(statusText()), 'status ' + statusText());
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return per + ' entities per blank; ' + util.toFixed(1) + ' % of the sheet';
  });
