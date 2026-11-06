  // --- rfIW (2026-11-05, lane drawaudit) --- in the app: anvil.drawing.flatView() on a full sheet puts the flat on a new
  // Sheet2 (its tab appears and is active, SHEET 2 OF 2), Undo takes it away again; the title block shows THICKNESS,
  // FINISH and SIZE.
  var IW_PART = 'p.name("IWChannel").units("in");\np.sheet(0.0598, 0.06, 0.44);\np.sketch("Top").rect(0, -3, 8, 3).end().baseFlange();\n' +
    'p.flange(1.5, [[4, 0.0598, 0], [4, 0.0598, 3]], { position: "inside" });\np.property("Finish", "ZINC PLATE");\n' +
    'p.sketch("Top", 0.0598).circle(1, -1.5, 0.1405).circle(7, -1.5, 0.1405).cut("through", { reverse: true });';
  step('rfIW: a flat pattern with no room on Sheet1 goes to Sheet2 (tab, SHEET 2 OF 2, flat at the sheet scale), one Undo step; title block THICKNESS .0598, FINISH, SIZE B', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(IW_PART); await idle();
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
    var s = anvil.drawing.summary();
    assert(s.sheet.format === 'ANSI B' && s.views.length === 4, 'Standard 3 View on ANSI B: ' + s.sheet.format + ' ' + s.views.length);
    var tb = s.titleBlock;
    assert(tb.thickness === '.0598' && tb.finish === 'ZINC PLATE' && tb.size === 'B', 'title block ' + JSON.stringify([tb.thickness, tb.finish, tb.size]));
    var txt = [].map.call(D.querySelectorAll('#drawing-sheet g[data-layer="SHEET"] text'), function (t) { return t.textContent; });
    ['THICKNESS', 'FINISH', 'SIZE', '.0598', 'ZINC PLATE'].forEach(function (x) { assert(txt.indexOf(x) >= 0, 'on the sheet: ' + x); });
    anvil.drawing.flatView(); await UI.drawing.ready(); await wait(30);
    s = anvil.drawing.summary();
    assert(s.sheets.length === 2 && s.sheet.index === 1 && s.views.length === 1 && s.views[0].kind === 'flat', 'flat on Sheet2: ' + JSON.stringify([s.sheets.length, s.sheet.index, s.views.map(function (v) { return v.kind; })]));
    assert(s.titleBlock.sheet === '2 OF 2', 'SHEET ' + s.titleBlock.sheet);
    var tab = D.querySelector('#drawing-tabs .dw-sheet-tab.active');
    assert(tab && tab.textContent === 'Sheet2', 'active tab ' + (tab && tab.textContent));
    await UI.undo(); await UI.drawing.ready(); await wait(30);
    s = anvil.drawing.summary(); s = anvil.drawing.summary();
    assert(s.sheets.length === 1 && s.views.length === 4, 'Undo: one sheet, four views: ' + JSON.stringify([s.sheets.length, s.views.length]));
    anvil.drawing.close();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });
