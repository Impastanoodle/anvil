  // ---- rfAL (2026-10-12): magnetic lines follow a dragged view, True Ø / R on ellipses, Insert menu entries once
  var RFAL_PLATE = 'p.units("mm");\np.sketch("Front").rect(0, 0, 100, 50).circle(30, 25, 5).extrude(10);';
  async function rfALDrawing() {
    await anvil.newPart(); await idle();
    await anvil.run(RFAL_PLATE); await idle();
    anvil.drawing.make({ fresh: true }); await idle(); await wait(60);
    await UI.drawing.ready();
    if (!dwView('Isometric')) { anvil.drawing.standard3View(); await idle(); }
    UI.drawing.fit(); await wait(20);
    return dwView('Isometric');
  }
  function rfALView(id) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.id === id; })[0]; }
  function rfALClick(p) { sheetMouse('mousemove', p); sheetMouse('mousedown', p); sheetMouse('mouseup', p); }
  function rfALMagNode(id) { return D.querySelector('#dw-overlay line[data-mag="' + id + '"]'); }
  step('rfAL: a magnetic line follows its view while the view is dragged (not only on release), and stays with it after', async function () {
    var errs0 = errors.length, iso = await rfALDrawing();
    assert(iso, 'isometric view');
    var w = rfALView(iso.id), y = w.box.y0 - 12, id = anvil.drawing.magLine(iso.id, { a: [w.box.x0, y], b: [w.box.x1, y] });
    await idle();
    assert(id, 'magnetic line ' + statusText());
    var n0 = rfALMagNode(id), x10 = +n0.getAttribute('x1'), y10 = +n0.getAttribute('y1');
    w = rfALView(iso.id);
    var g = [w.box.x0 + 2, w.box.y1 - 2], dx = -15, dy = 10;
    sheetMouse('mousemove', g); sheetMouse('mousedown', g);
    for (var i = 1; i <= 4; i++) sheetMouse('mousemove', [g[0] + dx * i / 4, g[1] + dy * i / 4]);
    assert(UI.drawing.state.drag && UI.drawing.state.drag.kind === 'view' && UI.drawing.state.drag.moved, 'dragging the view ' + JSON.stringify(UI.drawing.state.drag && UI.drawing.state.drag.kind));
    var n1 = rfALMagNode(id), o = UI.drawingInternal.liveOffset(iso.id);
    assert(Math.abs(o[0] - dx) < 0.1 && Math.abs(o[1] - dy) < 0.1, 'the view moved ' + o);
    assert(n1 && Math.abs(+n1.getAttribute('x1') - (x10 + o[0])) < 1e-6 && Math.abs(+n1.getAttribute('y1') - (y10 - o[1])) < 1e-6, 'the line moved with the view mid-drag: ' + (n1 && [n1.getAttribute('x1'), n1.getAttribute('y1')]) + ' from ' + [x10, y10] + ' by ' + o);
    sheetMouse('mouseup', [g[0] + dx, g[1] + dy]); await idle(); await wait(30);
    var n2 = rfALMagNode(id), ml = anvil.drawing.magLines().filter(function (m) { return m.id === id; })[0];
    assert(n2 && Math.abs(+n2.getAttribute('x1') - (x10 + o[0])) < 1e-6 && Math.abs(ml.a[1] - (y + o[1])) < 1e-6, 'after release: ' + JSON.stringify(ml) + ' ' + n2.getAttribute('x1'));
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'line ' + id + ' moved ' + dx + ', ' + dy;
  });
  step('rfAL: Dimension Type True — Smart Dimension on the Ø10 hole\'s ellipse in a True isometric view reads Ø10 (the ellipse pre-highlights); Projected views do not pick it; Insert menu lists each Drawing View / Annotations entry once', async function () {
    var errs0 = errors.length, iso = await rfALDrawing();
    anvil.drawing.viewOptions(iso.id, { dimType: 'true' }); await idle();
    var w = rfALView(iso.id);
    assert(w.trueDims, 'True view');
    var el = w.proj.ellipses.visible.filter(function (e) { return (e.full || e.whole) && Math.abs(W.Drawing.ellipseRadius(e.ax, e.ay) - 5) < 1e-6; })[0];
    assert(el, 'the hole rim is an ellipse: ' + w.proj.ellipses.visible.length);
    var t = (el.t0 + el.t1) / 2, onE = w.toSheet([el.c[0] + el.ax[0] * Math.cos(t) + el.ay[0] * Math.sin(t), el.c[1] + el.ax[1] * Math.cos(t) + el.ay[1] * Math.sin(t)]);
    ribbonButton('Smart Dimension').click();
    assert(UI.drawing.state.tool === 'dim', 'tool on');
    sheetMouse('mousemove', onE);
    assert(UI.drawing.state.hover && UI.drawing.state.hover.ellipse && D.querySelector('#dw-overlay path.dw-hot'), 'ellipse pre-highlighted ' + JSON.stringify(UI.drawing.state.hover && Object.keys(UI.drawing.state.hover)));
    rfALClick(onE);
    assert(UI.drawing.state.pending && UI.drawing.state.pending.first && UI.drawing.state.pending.first.pick.ellipse, 'picked the ellipse');
    var at = [w.box.x1 + 15, w.box.y1 + 10];
    rfALClick(at); await idle();
    var dv = anvil.drawing.doc().views.filter(function (v) { return v.id === iso.id; })[0].dims || [];
    assert(dv.length === 1 && dv[0].kind === 'dia' && dv[0].ell && Math.abs(dv[0].value - 10) < 1e-9, 'Ø10: ' + JSON.stringify(dv));
    assert(anvil.drawing.summary().dims.indexOf('Ø10') >= 0, 'drawn ' + anvil.drawing.summary().dims);
    if (UI.hasPM()) UI.pmCancel();
    key('Escape'); await idle();
    if (UI.drawing.state.tool) ribbonButton('Smart Dimension').click();
    // Projected: the ellipse is not a pick (lengths there are foreshortened)
    anvil.drawing.viewOptions(iso.id, { dimType: 'projected' }); await idle();
    assert(!rfALView(iso.id).trueDims, 'projected');
    assert(!(UI.drawingInternal.entityAt(onE, false, true) || {}).ellipse, 'no ellipse pick in a Projected view');
    // Insert menu: each added entry once (the menu hook used to run twice)
    var lis = D.querySelectorAll('#menus > li'), ins = null;
    for (var i = 0; i < lis.length; i++) if (/^Insert/.test(lis[i].textContent)) ins = lis[i];
    ins.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    var rows = Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (m) { return m.textContent.replace(/\s+/g, ' ').trim(); });
    if (UI.closeMenus) UI.closeMenus();
    ['Auxiliary', 'Broken-out Section', 'Break', 'Crop', 'Area Hatch/Fill', 'Magnetic Line'].forEach(function (l) {
      var n = rows.filter(function (r) { return r.indexOf('▸ ' + l) >= 0; }).length;
      assert(n === 1, l + ' listed ' + n + ' times: ' + rows.filter(function (r) { return r.indexOf(l) >= 0; }).join(' | '));
    });
    var dupes = rows.filter(function (r, j) { return r && rows.indexOf(r) !== j; });
    assert(!dupes.length, 'no duplicate Insert rows: ' + dupes.join(' | '));
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return dv[0].value + ', Insert ' + rows.length + ' rows';
  });
  // --- end rfAL ---
