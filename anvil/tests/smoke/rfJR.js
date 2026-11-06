  // ---- rfJR (2026-11-06, lane drawfix2): the Bend Table keeps clear of the sheet's dimensions (the flat dragged left
  // of the Front view on ANSI B, Annotation ▸ Bend Table); Sheet Properties ▸ Zones and the Revision Table's ZONE
  // filled from a Revision Symbol placed by clicks
  var JR_T = 0.0598, JR_BOX = 'p.name("JRBox").units("in");\np.sheet(' + JR_T + ', 0.06, 0.44);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
    'p.flange(1.5, [[3, ' + JR_T + ', 0], [3, ' + JR_T + ', 4], [0, ' + JR_T + ', 2], [6, ' + JR_T + ', 2]], { position: "inside", relief: "rect" });\n' +
    'p.hem(0.375, [[3, 1.6196, 0]], { gap: 0.0299 });\n';
  function rfJRClient(p) {
    var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
    pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
    var q = pt.matrixTransform(m);
    return { clientX: q.x, clientY: q.y };
  }
  function rfJRMouse(type, p) {
    var c = rfJRClient(p);
    D.querySelector('#drawing-sheet svg').dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: c.clientX, clientY: c.clientY, detail: 1 }));
  }
  function rfJRClick(p) { rfJRMouse('mousemove', p); rfJRMouse('mousedown', p); rfJRMouse('mouseup', p); }
  async function rfJRDrag(from, to) {
    rfJRMouse('mousemove', from); rfJRMouse('mousedown', from);
    for (var i = 1; i <= 6; i++) { rfJRMouse('mousemove', [from[0] + (to[0] - from[0]) * i / 6, from[1] + (to[1] - from[1]) * i / 6]); await wait(10); }
    rfJRMouse('mouseup', to); await UI.drawing.ready(); await wait(30);
  }
  function rfJRMeet(a, b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }
  // the dimensions with a piece on box B (text, arrow, or a line crossing it)
  function rfJRDimsOn(sh, B) {
    var bad = [];
    sh.prims.forEach(function (p) {
      if (p.dimIx == null) return;
      var b = p.k === 'text' ? W.Drawing.textRect(p) : p.k === 'line' ? { x0: Math.min(p.a[0], p.b[0]), x1: Math.max(p.a[0], p.b[0]), y0: Math.min(p.a[1], p.b[1]), y1: Math.max(p.a[1], p.b[1]) } : null;
      if (b && rfJRMeet(b, B) && (p.k !== 'line' || W.Drawing._.segHitsRect(p.a, p.b, B))) bad.push(sh.dims[p.dimIx].text);
    });
    return bad;
  }
  async function rfJRSheetProps(fn) {
    dwMenu('Sheet Properties'); await idle();
    assert(modalOpen(), 'Sheet Properties dialog');
    fn();
    clickModalButton('Apply Changes'); await idle(); await UI.drawing.ready(); await wait(30);
  }
  step('rfJR: the box\'s flat dragged left of its Front view on ANSI B, then Annotation ▸ Bend Table: the table keeps clear of the Front view\'s 6.000 and every other dimension', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(JR_BOX); await idle();
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
    await rfJRSheetProps(function () {
      var sel = D.querySelectorAll('#modal .dw-props select');
      setInput(sel[0], 'ANSI B'); setInput(sel[1], '1:1');
    });
    if (!anvil.drawing.summary().autoDims) { anvil.drawing.modelItems(true); await idle(); await UI.drawing.ready(); await wait(30); }
    anvil.drawing.flatView({ x: 17 / 12, y: 11 * 3 / 8, scale: [1, 4] }); await UI.drawing.ready(); await wait(30);
    var sum = anvil.drawing.summary(), fv = sum.views.filter(function (v) { return v.kind === 'flat'; })[0];
    assert(sum.sheet.format === 'ANSI B' && sum.sheet.index === 0 && fv, 'flat on sheet 1 of ANSI B: ' + JSON.stringify(sum.sheet));
    // (the audit's scale: 1 : 4; the flat view's PM has no scale box of its own yet)
    UI.App.model.drawings[UI.drawing.state.index].views.filter(function (v) { return v.id === fv.id; })[0].scale = [1, 4];
    UI.drawing.render(); await UI.drawing.ready(); await wait(30);
    UI.drawing.fit(); await wait(20);
    var w = UI.drawing.state.sheet.views.filter(function (x) { return x.view.id === fv.id; })[0];
    // drag the flat (by an empty corner of its box, off the bend lines and notes) to the left of the Front view
    var g = [w.box.x0 + 0.08 * (w.box.x1 - w.box.x0), w.box.y0 + 0.08 * (w.box.y1 - w.box.y0)], cx = (w.box.x0 + w.box.x1) / 2, cy = (w.box.y0 + w.box.y1) / 2;
    await rfJRDrag(g, [g[0] + 17 / 12 - cx, g[1] + 11 * 3 / 8 - cy]);
    w = UI.drawing.state.sheet.views.filter(function (x) { return x.view.id === fv.id; })[0];
    assert(Math.abs((w.box.x0 + w.box.x1) / 2 - 17 / 12) < 0.05, 'dragged: ' + JSON.stringify(w.box));
    UI.drawing.state.sel = { kind: 'view', id: fv.id };
    ribbonButton('Bend Table').click(); await idle(); await UI.drawing.ready(); await wait(30);
    var sh = UI.drawing.state.sheet, bt = sh.annotations.filter(function (a) { return a.type === 'bendTable' && a.view === fv.id; })[0];
    assert(bt && bt.box, 'Bend Table placed');
    assert(sh.dims.some(function (d) { return d.text === '6.000'; }), 'the 6.000 is on the sheet');
    var on = rfJRDimsOn(sh, bt.box);
    assert(!on.length, 'dimensions on the Bend Table: ' + on.join(', '));
    sh.views.forEach(function (x) { assert(!rfJRMeet(x.box, bt.box), 'table on ' + x.view.name); });
    anvil.drawing.close();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });
  step('rfJR: ANSI B zones (4 3 2 1 / A B in the margin), Sheet Properties ▸ Zones off and on, a Revision Symbol clicked into zone B3 fills the Revision Table\'s ZONE, a typed zone wins', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.box(4, 0.25, 2);\n'); await idle();
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
    await rfJRSheetProps(function () { setInput(D.querySelectorAll('#modal .dw-props select')[0], 'ANSI B'); });
    UI.drawing.fit(); await wait(20);
    assert(anvil.drawing.summary().sheet.zones === '4 x 2', 'zones ' + anvil.drawing.summary().sheet.zones);
    function zoneTexts() { return UI.drawing.state.sheet.prims.filter(function (p) { return p.fmt === 'zones' && p.k === 'text'; }).map(function (p) { return p.text; }); }
    assert(zoneTexts().sort().join('') === '11223344AABB', 'labels ' + zoneTexts().join(''));
    // Sheet Properties ▸ Zones off, then on again
    await rfJRSheetProps(function () { var z = D.getElementById('dw-sheet-zones'); assert(z && z.checked, 'Zones ticked for ANSI B'); z.click(); });
    assert(!anvil.drawing.summary().sheet.zones && !zoneTexts().length, 'zones off');
    await rfJRSheetProps(function () { D.getElementById('dw-sheet-zones').click(); });
    assert(anvil.drawing.summary().sheet.zones === '4 x 2', 'zones on again');
    // a revision, then Annotation ▸ Revision Symbol: the leader tip, then the symbol in zone B3
    anvil.drawing.addRevision({ description: 'HOLE MOVED' }); await idle();
    var b1 = 10 / 25.4, zx = 17 - b1 - 2.5 * (17 - 2 * b1) / 4, zy = b1 + 1.5 * (11 - 2 * b1) / 2;
    ribbonButton('Revision Symbol').click(); await idle();
    assert(UI.drawing.state.tool === 'rfansym' && UI.pmTitle() === 'Revision Symbol', 'Revision Symbol PM');
    rfJRClick([zx - 0.6, zy - 0.4]); rfJRClick([zx, zy]); await idle();
    key('Escape'); await idle();
    if (UI.hasPM()) UI.pmCancel();
    await UI.drawing.ready(); await wait(20);
    var rv = anvil.drawing.summary().revisions;
    assert(rv && rv.rows.length === 1 && rv.rows[0].zoneAuto === 'B3', 'ZONE ' + JSON.stringify(rv && rv.rows));
    assert(Array.prototype.some.call(D.querySelectorAll('#drawing-sheet text'), function (t) { return t.textContent === 'B3'; }), 'B3 drawn in the table');
    anvil.drawing.editRevision(0, { zone: 'C1' }); await idle(); await UI.drawing.ready();
    rv = anvil.drawing.summary().revisions;
    assert(rv.rows[0].zone === 'C1' && !rv.rows[0].zoneAuto, 'typed zone: ' + JSON.stringify(rv.rows));
    anvil.drawing.close();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });
