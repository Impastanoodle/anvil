  // ---- rfJX (2026-11-06, lane drawfix2-2): the L-bracket's flat from anvil.drawing.flatView() on a full 1 : 1 ANSI B
  // sheet goes to Sheet2 at 1 : 1; Sheet Properties ▸ size B -> C -> A keeps a hand-placed flat where it was relative
  // to the border, re-lays the standard views, and A keeps the general tolerances
  var JX_T = 0.0598;
  var JX_BRACKET = 'p.name("JXBracket").units("in");\np.sheet(' + JX_T + ', 0.06, 0.44);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
    'p.flange(2, [[2, ' + JX_T + ', 3]], { position: "inside", lengthRef: "outer" });\n';
  var JX_TAB = 'p.name("JXTab").units("in");\np.sheet(' + JX_T + ', 0.06, 0.44);\np.sketch("Top").rect(0, -1.5, 2, 1.5).end().baseFlange();\n' +
    'p.flange(0.75, [[1, ' + JX_T + ', 1.5]], { position: "inside", lengthRef: "outer" });\n';
  async function rfJXSheetProps(fmt, scale) {
    dwMenu('Sheet Properties'); await idle();
    assert(modalOpen(), 'Sheet Properties dialog');
    var sel = D.querySelectorAll('#modal .dw-props select');
    setInput(sel[0], fmt);
    if (scale) setInput(sel[1], scale);
    clickModalButton('Apply Changes'); await idle(); await UI.drawing.ready(); await wait(30);
  }
  function rfJXTexts() { return Array.prototype.map.call(D.querySelectorAll('#drawing-sheet text'), function (t) { return t.textContent; }); }
  function rfJXMeet(a, b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }
  function rfJXInside(sh) {
    var S = sh.size, b1 = 10 / 25.4, tbs = W.Drawing.tbRects(S, 'in'), bad = [];
    sh.views.forEach(function (x) {
      if (!(x.box.x0 > b1 && x.box.y0 > b1 && x.box.x1 < S[0] - b1 && x.box.y1 < S[1] - b1)) bad.push(x.view.name + ' past the border');
      tbs.forEach(function (t) { if (rfJXMeet(x.box, t)) bad.push(x.view.name + ' on the title block'); });
      sh.views.forEach(function (y) { if (y !== x && rfJXMeet(x.box, y.box)) bad.push(x.view.name + ' on ' + y.view.name); });
    });
    return bad;
  }
  step('rfJX: the L-bracket on a 1 : 1 ANSI B sheet (Sheet Properties), then the flat pattern view: no room at 1 : 1, so Sheet2 at 1 : 1, not 1 : 2 beside the views', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(JX_BRACKET); await idle();
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
    await rfJXSheetProps('ANSI B', '1:1');
    anvil.drawing.flatView(); await UI.drawing.ready(); await wait(30);
    var s = anvil.drawing.summary(), fv = s.views.filter(function (v) { return v.kind === 'flat'; })[0];
    assert(s.sheet.index === 1 && s.sheet.count === 2 && s.sheet.scale === '1:1', 'Sheet2 at 1:1: ' + JSON.stringify(s.sheet));
    assert(fv && (!fv.scale || fv.scale === '1:1'), 'flat at the sheet scale: ' + JSON.stringify(fv));
    assert(rfJXTexts().indexOf('SCALE 1 : 2') < 0, 'no SCALE 1 : 2 note');
    anvil.drawing.close();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });
  step('rfJX: Sheet Properties ▸ ANSI B -> C -> A with the tab\'s Standard 3 View and its flat: the flat keeps its place relative to the border, nothing overlaps or runs off, zones and SIZE follow, A keeps UNLESS OTHERWISE SPECIFIED', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(JX_TAB); await idle();
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
    await rfJXSheetProps('ANSI B', '1:1');
    anvil.drawing.flatView(); await UI.drawing.ready(); await wait(30);
    var s = anvil.drawing.summary(), fv = s.views.filter(function (v) { return v.kind === 'flat'; })[0];
    assert(s.sheet.index === 0 && fv, 'the flat on Sheet1: ' + JSON.stringify(s.sheet));
    var b1 = 10 / 25.4;
    function frac() { var w = UI.drawing.state.sheet.views.filter(function (x) { return x.view.id === fv.id; })[0], S = UI.drawing.state.sheet.size; return [((w.box.x0 + w.box.x1) / 2 - b1) / (S[0] - 2 * b1), ((w.box.y0 + w.box.y1) / 2 - b1) / (S[1] - 2 * b1)]; }
    var f0 = frac();
    await rfJXSheetProps('ANSI C');
    s = anvil.drawing.summary();
    assert(s.sheet.format === 'ANSI C' && s.sheet.zones === '4 x 4' && s.titleBlock.size === 'C', 'C: ' + JSON.stringify([s.sheet, s.titleBlock.size]));
    var f1 = frac();
    assert(Math.abs(f1[0] - f0[0]) < 0.12 && Math.abs(f1[1] - f0[1]) < 0.12, 'flat kept its place: ' + f0.map(function (x) { return x.toFixed(2); }) + ' -> ' + f1.map(function (x) { return x.toFixed(2); }));
    var bad = rfJXInside(UI.drawing.state.sheet);
    assert(!bad.length, 'C: ' + bad.join(', '));
    await rfJXSheetProps('ANSI A');
    s = anvil.drawing.summary();
    bad = rfJXInside(UI.drawing.state.sheet);
    assert(s.sheet.zones === '2 x 2' && s.titleBlock.size === 'A' && !bad.length, 'A: ' + JSON.stringify(s.sheet) + ' ' + bad.join(', '));
    var tx = rfJXTexts();
    assert(tx.indexOf('UNLESS OTHERWISE SPECIFIED') >= 0 && tx.indexOf('DRAWN') < 0, 'A keeps the tolerances');
    await UI.undo(); await idle(); await UI.drawing.ready(); await wait(20);
    assert(anvil.drawing.summary().sheet.format === 'ANSI C', 'one undo step per change');
    anvil.drawing.close();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });
