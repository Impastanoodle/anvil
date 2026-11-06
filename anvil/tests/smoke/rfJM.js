  // ---- rfJM (2026-11-06, lane drawgaps-3): Tools ▸ Dimensions ▸ Autodimension on a flat pattern view: Ordinate from
  // the blank's lower-left with the bend lines (the flat selected first), Undo; Selected entities (a bend line and a
  // hole clicked)
  var JM_T = 0.0598, JM_PART = 'p.name("JMBlank").units("in");\np.sheet(' + JM_T + ', 0.06, 0.44);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
    'p.sketch("Top", ' + JM_T + ').circle(0.75, -2, 0.1405).circle(3, -1, 0.1405).circle(3, -3, 0.125).cut("through", { reverse: true });\n' +
    'p.sketch("Top", ' + JM_T + ').line(1.5, 0, 1.5, -4).line(4.5, 0, 4.5, -4).sketchedBend(90);';
  function rfJMView(id) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.id === id; })[0]; }
  function rfJMClick(p) { sheetMouse('mousemove', p); sheetMouse('mousedown', p); sheetMouse('mouseup', p); }
  function rfJMFlatDims(id) { return UI.drawing.state.sheet.dims.filter(function (d) { return d.view === id; }).map(function (d) { return d.text; }); }
  step('rfJM: Autodimension on the 6 × 4 blank\'s flat view: Ordinate preselected, 0 .750 1.500 3.000 4.500 6.000 across and 0 1 2 3 4 up, one undo step; Selected entities: a bend line and a hole', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(JM_PART); await idle();
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
    anvil.drawing.flatView({ x: 5, y: 4 }); await UI.drawing.ready(); await wait(30);
    UI.drawing.fit(); await wait(20);
    var fv = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'flat'; })[0];
    assert(fv, 'flat view');
    UI.drawing.state.sel = { kind: 'view', id: fv.id };
    dwMenu('Dimensions ▸ Autodimension'); await idle();
    var st = UI.drawing.state;
    assert(st.tool === 'autodim' && st.pending.view === fv.id, 'tool on the flat: ' + st.tool + ' ' + st.pending.view);
    var schemes = Array.prototype.filter.call(D.querySelectorAll('#pm select'), function (x) { return Array.prototype.some.call(x.options, function (o) { return o.value === 'chain'; }); });
    assert(schemes.length === 2 && schemes.every(function (x) { return x.value === 'ordinate'; }), 'Ordinate preselected on a flat');
    assert(pmField('Bend lines (flat pattern)') && pmField('Bend lines (flat pattern)').checked, 'bend lines on');
    var u0 = UI.App.undo.length;
    await UI.pmOK(); await idle(); await UI.drawing.ready(); await wait(20);
    var dims = rfJMFlatDims(fv.id);
    assert(dims.indexOf('0, .750, 1.500, 3.000, 4.500, 6.000') >= 0 && dims.indexOf('0, 1.000, 2.000, 3.000, 4.000') >= 0, 'ordinates: ' + dims.join(' | '));
    assert(UI.App.undo.length === u0 + 1, 'one undo step');
    await UI.undo(); await idle(); await UI.drawing.ready(); await wait(20);
    anvil.drawing.summary();
    assert(!rfJMFlatDims(fv.id).length, 'undone: ' + rfJMFlatDims(fv.id).join(' | '));
    // Selected entities: the bend line at 1.5 and the Ø.281 hole at .75
    UI.drawing.state.sel = { kind: 'view', id: fv.id };
    dwMenu('Dimensions ▸ Autodimension'); await idle();
    var rad = Array.prototype.filter.call(D.querySelectorAll('#pm input[type="radio"]'), function (x) { return x.value === 'selected'; })[0];
    assert(rad, 'Selected entities radio');
    rad.click(); await idle();
    var w = rfJMView(fv.id), b = w.flat.bbox, bend = w.flat.bends.filter(function (x) { return Math.abs(x.a[0] - b.umin - 1.5) < 1e-6; })[0];
    var mid = w.toSheet([(bend.a[0] + bend.b[0]) / 2, (bend.a[1] + bend.b[1]) / 2 + 0.6]);
    rfJMClick(mid); await idle();
    var hole = w.proj.circles.visible.filter(function (c) { return Math.abs(c.c[0] - b.umin - 0.75) < 1e-6; })[0], hc = w.toSheet(hole.c);
    rfJMClick([hc[0] + hole.r * w.scale, hc[1]]); await idle();
    assert(UI.drawing.state.pending.select.length === 2, 'two picked: ' + JSON.stringify(UI.drawing.state.pending.select));
    assert(D.querySelectorAll('#dw-overlay .dw-hot').length >= 2, 'highlighted');
    await UI.pmOK(); await idle(); await UI.drawing.ready(); await wait(20);
    dims = rfJMFlatDims(fv.id);
    assert(dims.indexOf('0, .750, 1.500') >= 0 && dims.indexOf('0, 2.000') >= 0, 'selected only: ' + dims.join(' | '));
    anvil.drawing.close();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });
