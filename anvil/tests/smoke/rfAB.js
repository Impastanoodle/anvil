  // --- rfAB: Model Items bring the sketch dimensions into the Top view and the flat-pattern view (shop audit #4) ---
  var RFAB_SHOP = ['p.name("Shop").units("in");', 'p.sheet(0.0598, 0.0598, 0.5);',
    'var f1 = p.sketch("Top", 0, "Sketch1").line(0, 0, 10, 0).line(10, 0, 10, 6).line(10, 6, 0, 6).line(0, 6, 0, 0)',
    '  .circle(1, 1, 0.1405).circle(9, 1, 0.1405).circle(1, 5, 0.1405).circle(9, 5, 0.1405)',
    '  .dim(0, "len").dim(1, "len").rel("distance", ["3","4"], 1).rel("distance", ["3","5"], 9)',
    '  .ordinate([[0,{"ord":"o1","ordAxis":"x","ordAt":-0.5}],[1,{"ord":"o1","ordAxis":"x","ordAt":-0.5}]]).id();',
    'p.extrude(0.0598, { sketch: f1, name: "Base-Flange1", sheetBase: true });',
    'p.flange(1.5, [[0,0.0598,-3]], { angle: 90, name: "Edge-Flange1" });',
    'p.flange(1, [[5,0.0598,0]], { angle: 90, name: "Edge-Flange2", reverse: true });'].join('\n');
  step('rfAB: Model Items on the 16 ga shop blank — with the flat-pattern view selected they go into the flat (10.000, 6.000, the ordinates, 4X Ø.281, no bend radius / deduction); with all views the Top view gets the typed sizes and ordinates and the Front view the flange length; summary().dims lists them', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(RFAB_SHOP); await idle();
    anvil.drawing.make(); await idle(); await wait(60);
    await UI.drawing.ready();
    var fs = anvil.drawing.flatView({ x: 330, y: 70 }); await wait(60);
    await UI.drawing.ready();
    var fv = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'flat' || /Flat/.test(v.orient || ''); })[0];
    assert(fs && fv, 'flat view placed');
    var row = D.querySelector('.dw-view[data-view="' + fv.id + '"]');
    assert(row, 'flat view row');
    row.click(); await wait(30);
    var st = UI.drawing.state;
    assert(st.sel && st.sel.kind === 'view' && st.sel.id === fv.id, 'flat view selected: ' + JSON.stringify(st.sel));
    rfTTab('Annotation');
    var u0 = UI.App.undo.length;
    ribbonButton('Model Items').click(); await wait(30);
    assert(UI.hasPM() && pmField('Selected view').checked, 'destination: the selected view');
    await UI.pmOK(); await wait(60);
    var s = anvil.drawing.summary();
    assert(UI.App.undo.length === u0 + 1, 'one undo step');
    ['10.000', '6.000', '0, 1.000, 9.000', '4X Ø.281'].forEach(function (t) { assert(s.dims.indexOf(t) >= 0, t + ' on the flat: ' + s.dims.join(' | ')); });
    assert(!s.dims.some(function (t) { return /^R?\.060$|^\.098$/.test(t); }), 'no bend radius / deduction: ' + s.dims.join(' | '));
    assert(st.sheet.dims.every(function (d) { return d.view === fv.id; }), 'all on the flat');
    // all views: the Top view reads the blank's sizes, Front the 1.5 flange (1.620 outside)
    ribbonButton('Model Items').click(); await wait(30);
    rfTRadio('Import items into all views');
    await UI.pmOK(); await wait(60);
    var top = dwView('Top'), front = dwView('Front');
    var onTop = st.sheet.dims.filter(function (d) { return d.view === top.id; }).map(function (d) { return d.text; });
    ['10.000', '6.000', '0, 1.000, 9.000', '4X Ø.281'].forEach(function (t) { assert(onTop.indexOf(t) >= 0, t + ' on Top: ' + onTop.join(' | ')); });
    assert(st.sheet.dims.some(function (d) { return d.view === front.id && d.text === '1.620'; }), 'flange length on Front');
    UI.undo(); await wait(60);
    var su = anvil.drawing.summary();
    assert(su.dims.length && su.dimDetails.every(function (d) { return d.view === fv.id; }), 'undo: back to the flat only: ' + su.dims.join(' | '));
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return onTop.join(' | ');
  });
  // --- end rfAB ---
