  // ---- rfMB (2026-11-12, lane arccenters): Arc Center Points (Mastercam's Home ▸ Display ▸ Arc Center Points; user:
  // "how do i remove the green dots in the center of circles"). Off: the centre dots of circles / arcs are not drawn,
  // end points stay; a centre still snaps and selects (and shows while selected); remembered per browser; the Mastercam
  // profile's Home tab button toggles the same state.
  function rfMBEv(type, uv, target) {
    var r = $('viewport').getBoundingClientRect(), p = UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1]));
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' || type === 'mousemove' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  async function rfMBClick(uv) { rfMBEv('mousemove', uv); rfMBEv('mousedown', uv, $('viewport')); rfMBEv('mouseup', uv); await idle(); await wait(10); }
  function rfMBDots() {
    var pl = UI.activePlane(), out = [];
    UI.groups.sketches.children.forEach(function (o) {
      if (!o.userData || !o.userData.sketchPoints) return;
      var a = o.geometry.getAttribute('position');
      for (var k = 0; k < a.count; k++) { var q = [a.getX(k) - pl.origin[0], a.getY(k) - pl.origin[1], a.getZ(k) - pl.origin[2]]; out.push([q[0] * pl.x[0] + q[1] * pl.x[1] + q[2] * pl.x[2], q[0] * pl.y[0] + q[1] * pl.y[1] + q[2] * pl.y[2]]); }
    });
    return out;
  }
  function rfMBHas(dots, p) { return dots.some(function (d) { return Math.abs(d[0] - p[0]) < 0.05 && Math.abs(d[1] - p[1]) < 0.05; }); }
  function rfMBRestore() {
    if (UI.App.view.showArcCenters === false) UI.toggleArcCenters(true);
    try { W.localStorage.removeItem('anvil.showArcCenters'); } catch (e) { /* storage blocked */ }
    if (UI.closeMenus) UI.closeMenus();
  }

  step('rfMB: Arc Center Points — a circle and an arc drawn by mouse show their centre dots; View ▸ Display ▸ Arc Center Points off hides them (end points stay), a line still snaps to the hidden centre, a click there selects it and it shows; on again brings them back; remembered as a reload reads it', async function () {
    var errs0 = errors.length, App = UI.App, S = W.SketchSolver;
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    UI.zoomView(0.25 / UI.cam.scale);
    var f = UI.activeSketchFeature();
    try {
      if (App.view.showArcCenters === false) UI.toggleArcCenters(true);
      UI.setTool('circle'); await rfMBClick([-30, 10]); await rfMBClick([-20, 10]);
      UI.setTool('arc'); await rfMBClick([30, 10]); await rfMBClick([40, 10]); await rfMBClick([20, 10]);
      W.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await idle();
      UI.setTool('select'); await idle();
      var ci = f.entities.findIndex(function (e) { return e && e.t === 'circle'; }), ai = f.entities.findIndex(function (e) { return e && e.t === 'arc'; });
      assert(ci >= 0 && ai >= 0, 'a circle and an arc drawn: ' + JSON.stringify(f.entities));
      var arc = f.entities[ai], ae = [arc.cx + arc.r * Math.cos(arc.a0 * Math.PI / 180), arc.cy + arc.r * Math.sin(arc.a0 * Math.PI / 180)];
      UI.updateSketches(); await wait(10);
      var on = rfMBDots();
      assert(rfMBHas(on, [-30, 10]) && rfMBHas(on, [30, 10]) && rfMBHas(on, ae), 'centres and arc ends drawn: ' + JSON.stringify(on));
      // View ▸ Display ▸ Arc Center Points, by mouse
      var rows = menuRows('Arc Center Points');
      assert(rows.length === 1 && rows[0].chk !== '' && /Display/.test(rows[0].text), 'View ▸ Display row, checked: ' + JSON.stringify(rows.map(function (r) { return r.menu + ' ' + r.text + ' [' + r.chk + ']'; })));
      rows[0].row.click(); await idle(); await wait(10);
      assert(App.view.showArcCenters === false && W.localStorage.getItem('anvil.showArcCenters') === '0', 'off and remembered');
      var off = rfMBDots();
      assert(!rfMBHas(off, [-30, 10]) && !rfMBHas(off, [30, 10]), 'centre dots gone: ' + JSON.stringify(off));
      assert(rfMBHas(off, ae), 'arc end points still drawn: ' + JSON.stringify(off));
      UI.zoomView(1.25); UI.updateSketches(); await wait(10);
      assert(!rfMBHas(rfMBDots(), [-30, 10]), 'still hidden after a redraw');
      UI.zoomView(0.8); UI.updateSketches(); await wait(10);
      // a reload reads the setting back
      App.view.showArcCenters = UI.showArcCentersPref();
      assert(App.view.showArcCenters === false, 'read back off from localStorage');
      // a line snapped to the hidden centre lands on it (Coincident)
      UI.setTool('line'); await rfMBClick([-30, 10]); await rfMBClick([-30, -20]);
      W.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await idle();
      UI.setTool('select'); await idle();
      var ln = f.entities.filter(function (e) { return e && e.t === 'line'; })[0];
      assert(ln && Math.abs(ln.x1 + 30) < 1e-9 && Math.abs(ln.y1 - 10) < 1e-9, 'line from the circle centre: ' + JSON.stringify(ln));
      var li = f.entities.indexOf(ln);
      assert((f.rels || []).some(function (r) { return r.refs.indexOf(ci + '.c') >= 0 && r.refs.indexOf(li + '.p1') >= 0; }), 'snapped to the centre: ' + JSON.stringify(f.rels));
      // clicking where the arc's centre is selects it, and the selection dot shows
      await rfMBClick([30, 10]);
      assert(UI.selection().some(function (s) { return s.kind === 'sketchPoint' && s.ref === ai + '.c'; }), 'centre selected: ' + JSON.stringify(UI.selection()));
      await wait(30);
      assert(D.querySelector('.sk-selpt'), 'the selected centre is drawn');
      W.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await idle();
      assert(S.refPoint(f, ci + '.c'), 'the centre is still a sketch point');
      // on again
      rows = menuRows('Arc Center Points');
      assert(rows.length === 1 && rows[0].chk === '', 'row unchecked while off');
      rows[0].row.click(); await idle(); await wait(10);
      assert(App.view.showArcCenters === true && W.localStorage.getItem('anvil.showArcCenters') === '1', 'on again, remembered');
      assert(rfMBHas(rfMBDots(), [-30, 10]) && rfMBHas(rfMBDots(), [30, 10]), 'centre dots back');
    } finally { rfMBRestore(); }
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });

  step('rfMB: Arc Center Points is a command (UI.Commands showArcCenters, View tab, Heads-up Hide/Show Items), and under the Mastercam profile it is the first of Home ▸ Display\'s small stack, above Endpoints: a click toggles the same state and shows pressed', async function () {
    var App = UI.App;
    assert(UI.Commands.get('showArcCenters', 'part'), 'registered as a command');
    assert(W.Icons.has('showArcCenters'), 'icon');
    try {
      anvil.profile('mastercam');
      await anvil.newPart(); await idle();
      var tab = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (t) { return t.textContent === 'Home' && t.offsetWidth; })[0];
      assert(tab, 'Home tab');
      tab.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true })); tab.click(); await idle(); await wait(30);
      var btns = Array.prototype.slice.call(D.querySelectorAll('#ribbon-buttons .rb'));
      var ac = btns.filter(function (b) { return (b.getAttribute('aria-label') || '') === 'Arc Center Points'; })[0];
      var ep = btns.filter(function (b) { return (b.getAttribute('aria-label') || '') === 'Endpoints'; })[0];
      assert(ac && ep, 'Arc Center Points and Endpoints on Home: ' + btns.map(function (b) { return b.getAttribute('aria-label'); }).join(', '));
      assert(ac.parentElement === ep.parentElement && ac.nextElementSibling === ep, 'Arc Center Points directly above Endpoints in one stack');
      assert(ac.classList.contains('active'), 'pressed while on');
      var r = ac.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      ['mousedown', 'mouseup', 'click'].forEach(function (t) { ac.dispatchEvent(new W.MouseEvent(t, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y })); });
      await idle(); await wait(30);
      ac = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return (b.getAttribute('aria-label') || '') === 'Arc Center Points'; })[0];
      assert(App.view.showArcCenters === false && !ac.classList.contains('active'), 'off, not pressed');
      ['mousedown', 'mouseup', 'click'].forEach(function (t) { ac.dispatchEvent(new W.MouseEvent(t, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y })); });
      await idle(); await wait(30);
      ac = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return (b.getAttribute('aria-label') || '') === 'Arc Center Points'; })[0];
      assert(App.view.showArcCenters === true && ac.classList.contains('active'), 'on again, pressed');
    } finally { anvil.profile('solidworks'); rfMBRestore(); await idle(); }
    // the Heads-up Hide/Show Items list (SolidWorks profile)
    var hb = D.querySelector('#hud [data-hud="Hide/Show Items"]');
    assert(hb, 'Hide/Show Items on the Heads-up toolbar');
    hb.click(); await wait(20);
    var row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return /Arc Center Points/.test(m.textContent); })[0];
    assert(row, 'Arc Center Points in Hide/Show Items');
    UI.closeMenus();
  });
