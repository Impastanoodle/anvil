  // ---- rfBS (lane BS, 2026-10-13): Mastercam's Close Arc (an arc becomes its full circle, end-point relations go) and
  // Show Endpoints (the Heads-up toolbar toggle that hides the end-point dots of the sketch being edited)
  async function rfBSNew(ents) {
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    UI.zoomView(0.25 / UI.cam.scale);   // 0.25 units per pixel
    var f = UI.activeSketchFeature();
    (ents || []).forEach(function (e) { f.entities.push(e); });
    UI.App.gridStale = true; UI.updateSketches(); await wait(20);
    return f;
  }
  function rfBSScr(uv) { return UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])); }
  function rfBSEv(type, uv, target) {
    var r = $('viewport').getBoundingClientRect(), p = rfBSScr(uv);
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' || type === 'mousemove' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  async function rfBSClick(uv) { rfBSEv('mousemove', uv); rfBSEv('mousedown', uv, $('viewport')); rfBSEv('mouseup', uv); await idle(); await wait(10); }
  function rfBSRels(f) { return (f.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }); }
  function rfBSRibbon(label) {
    var b = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button.rb'), function (x) { return x.getAttribute('aria-label') === label; })[0];
    assert(b, 'ribbon button ' + label);
    return b;
  }
  // the dots (end and centre points) drawn for the sketch being edited, as [u, v] on its plane
  function rfBSDots() {
    var pl = UI.activePlane(), out = [];
    UI.groups.sketches.children.forEach(function (o) {
      if (!o.userData || !o.userData.sketchPoints) return;
      var a = o.geometry.getAttribute('position');
      for (var k = 0; k < a.count; k++) { var q = [a.getX(k) - pl.origin[0], a.getY(k) - pl.origin[1], a.getZ(k) - pl.origin[2]]; out.push([q[0] * pl.x[0] + q[1] * pl.x[1] + q[2] * pl.x[2], q[0] * pl.y[0] + q[1] * pl.y[1] + q[2] * pl.y[2]]); }
    });
    return out;
  }
  function rfBSHas(dots, p) { return dots.some(function (d) { return Math.abs(d[0] - p[0]) < 0.05 && Math.abs(d[1] - p[1]) < 0.05; }); }

  step('rfBS: Close Arc — a 90° arc picked in the graphics area, Sketch tab ▸ Close Arc, ✓: one circle, same centre and radius, its radius dimension kept (read R), Tangent kept, the end-point Coincident removed (status says so); one undo step brings the arc back', async function () {
    var errs0 = errors.length, S = W.SketchSolver;
    var f = await rfBSNew([{ t: 'arc', cx: 0, cy: 0, r: 10, a0: 0, a1: 90 }, { t: 'line', x1: 10, y1: 0, x2: 10, y2: -20 }]);
    var r1 = S.addRelation(f, 'coincident', ['0.p1', '1.p1']), r2 = S.addRelation(f, 'tangent', ['0', '1']);
    assert(r1.ok && r2.ok, 'relations added: ' + JSON.stringify([r1.error, r2.error]));
    f.dims = [{ e: 0, k: 'r', off: [6, 6] }];
    UI.App.dimsStale = true; UI.updateSketches(); await idle();
    var a0 = JSON.stringify(f.entities[0]), u0 = UI.App.undo.length;
    // pick the arc at 45°, then the ribbon button
    await rfBSClick([10 * Math.SQRT1_2, 10 * Math.SQRT1_2]);
    assert(UI.selection().some(function (s) { return s.kind === 'entity' && s.index === 0; }), 'arc selected: ' + JSON.stringify(UI.selection()));
    rfBSRibbon('Close Arc').click(); await idle();
    assert(UI.pmTitle() === 'Close Arc', 'Close Arc PM: ' + UI.pmTitle());
    assert(/Arcs to Close/.test($('pm').textContent) && /1 entity/.test($('pm').textContent), 'Arcs to Close holds the arc: ' + $('pm').textContent.slice(0, 200));
    assert(UI.App.tempEntities.length === 1 && UI.App.tempEntities[0].t === 'arc' && Math.abs(UI.App.tempEntities[0].a0 - 90) < 1e-9 && Math.abs(UI.App.tempEntities[0].a1 - 360) < 1e-9, 'preview: the 270° closing piece ' + JSON.stringify(UI.App.tempEntities));
    await pmAccept();
    var c = f.entities[0];
    assert(c.t === 'circle' && c.cx === 0 && c.cy === 0 && c.r === 10 && c.a0 == null && c.a1 == null, 'circle: ' + JSON.stringify(c));
    assert(f.entities.length === 2, 'no entity added: ' + f.entities.length);
    assert(f.dims && f.dims.length === 1 && f.dims[0].e === 0 && f.dims[0].k === 'dia' && f.dims[0].show === 'r', 'radius dimension kept on the circle: ' + JSON.stringify(f.dims));
    assert(K.dimValue(c, f.dims[0]) === 20, 'dimension value: ' + K.dimValue(c, f.dims[0]));
    var rels = rfBSRels(f);
    assert(rels.indexOf('tangent:0,1') >= 0, 'Tangent kept: ' + rels.join(' '));
    assert(!rels.some(function (r) { return /0\.p\d/.test(r); }), 'end-point relations gone: ' + rels.join(' '));
    assert(/Closed 1 arc \(1 end-point relation removed\)/.test(statusText()), 'status: ' + statusText());
    assert(UI.App.undo.length === u0 + 1, 'one undo step: ' + (UI.App.undo.length - u0));
    assert(UI.App.tempEntities.length === 0, 'preview cleared');
    UI.undo(); await idle();
    f = UI.activeSketchFeature();
    assert(JSON.stringify(f.entities[0]) === a0, 'undo: the arc back ' + JSON.stringify(f.entities[0]));
    assert(rfBSRels(f).indexOf('coincident:0.p1,1.p1') >= 0 && f.dims[0].k === 'r', 'undo: Coincident and R back ' + rfBSRels(f).join(' ') + ' ' + JSON.stringify(f.dims));
    W.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await idle();
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });

  step('rfBS: Close Arc — two arcs at once (Tools ▸ Sketch Tools ▸ Close Arc, then picks): a line picked too is ignored with a message; construction and level kept; a partial ellipse closes to its ellipse; Search Commands finds it', async function () {
    var errs0 = errors.length;
    var f = await rfBSNew([{ t: 'arc', cx: 0, cy: 0, r: 8, a0: 30, a1: 150, construction: true, layer: 'ETCH' }, { t: 'arc', cx: 40, cy: 0, r: 5, a0: -90, a1: 90 }, { t: 'line', x1: -30, y1: -20, x2: 30, y2: -20 },
      { t: 'pellipse', cx: 0, cy: 40, rx: 12, ry: 6, rot: 0, a0: 0, a1: 180 }]);
    var lv = UI.levels.op('preset', 'ETCH');
    assert(lv && lv.ok, 'ETCH level: ' + JSON.stringify(lv));
    f.entities[0].layer = 'ETCH';
    UI.updateSketches(); await idle();
    var lay0 = f.entities[0].layer;
    assert(lay0 && lay0 !== '0', 'the arc is on the ETCH level: ' + JSON.stringify(f.entities[0]));
    var rows = menuRows('Sketch Tools ▸ Close Arc');
    assert(rows.length === 1 && !rows[0].row.classList.contains('disabled'), 'Tools menu row: ' + rows.length);
    rows[0].row.click(); await idle();
    assert(UI.pmTitle() === 'Close Arc', 'Close Arc PM: ' + UI.pmTitle());
    var u0 = UI.App.undo.length;
    await rfBSClick([0, 8]);
    await rfBSClick([45, 0]);
    await rfBSClick([0, -20]);
    var v = UI.pmSpec().values;
    assert(v.entities.join() === '0,1', 'two arcs in Arcs to Close, the line not: ' + v.entities.join());
    assert(/not an arc and is ignored/.test($('pm').textContent) && /not an arc/.test(statusText()), 'PM and status say the line is ignored: ' + statusText());
    await rfBSClick([0, 46]);
    assert(v.entities.join() === '0,1,3', 'the partial ellipse too: ' + v.entities.join());
    await pmAccept();
    var a = f.entities[0], b = f.entities[1], e = f.entities[3];
    assert(a.t === 'circle' && a.r === 8 && a.construction === true && a.layer === lay0, 'first: construction circle on its level ' + JSON.stringify(a));
    assert(b.t === 'circle' && b.cx === 40 && b.r === 5, 'second: ' + JSON.stringify(b));
    assert(f.entities[2].t === 'line', 'the line untouched');
    assert(e.t === 'ellipse' && e.rx === 12 && e.ry === 6 && e.a0 == null, 'ellipse: ' + JSON.stringify(e));
    assert(/Closed 3 arcs/.test(statusText()), 'status: ' + statusText());
    assert(UI.App.undo.length === u0 + 1, 'one undo step for all: ' + (UI.App.undo.length - u0));
    // nothing closable selected: the command says so and ✓ stays blocked
    UI.cmdCloseArc(); await idle();
    assert(UI.pmSpec().okBlocked() === 'Select an arc to close.', 'blocked with no arcs');
    UI.pmCancel ? UI.pmCancel() : W.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await idle();
    var hits = UI.searchCommands('close arc');
    assert(hits.length && hits[0].name === 'Close Arc' && hits[0].icon === 'closeArc', 'Search Commands: ' + JSON.stringify(hits.slice(0, 2)));
    assert(W.Icons.has('closeArc') && W.Icons.has('showEndpoints'), 'icons');
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });

  step('rfBS: Show Endpoints — the Heads-up button hides the end-point dots (centres, points and the origin stay), remembered in localStorage and read back as a reload does; an end point still selects and the Line tool still snaps to it; View ▸ Display ▸ Show Endpoints turns them back on', async function () {
    var errs0 = errors.length, App = UI.App;
    var f = await rfBSNew([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }, { t: 'arc', cx: 40, cy: 0, r: 10, a0: 0, a1: 180 }, { t: 'point', x: -20, y: 10 }]);
    try {
      var hb = D.querySelector('#hud [data-hud="Show Endpoints"]');
      assert(hb && !hb.querySelector('.caret'), 'Show Endpoints button on the Heads-up toolbar (no drop-down)');
      assert(UI.HUD_ORDER.indexOf('Show Endpoints') === UI.HUD_ORDER.indexOf('View Settings') - 1, 'just before View Settings: ' + UI.HUD_ORDER.join(', '));
      if (App.view.showEndpoints === false) UI.toggleShowEndpoints(true);
      await idle();
      assert(hb.classList.contains('active'), 'pressed while on (the default)');
      var on = rfBSDots();
      assert(rfBSHas(on, [0, 0]) && rfBSHas(on, [20, 0]) && rfBSHas(on, [50, 0]) && rfBSHas(on, [30, 0]) && rfBSHas(on, [40, 0]), 'ends and centre drawn: ' + JSON.stringify(on));
      hb.dispatchEvent(new W.MouseEvent('click', { bubbles: true, cancelable: true })); await idle(); await wait(10);
      hb = D.querySelector('#hud [data-hud="Show Endpoints"]');
      assert(App.view.showEndpoints === false && !hb.classList.contains('active'), 'off, not pressed');
      var off = rfBSDots();
      assert(off.length === 1 && rfBSHas(off, [40, 0]), 'only the arc centre dot left: ' + JSON.stringify(off));
      assert(UI.groups.sketches.children.some(function (o) { return o.type === 'LineSegments' && o.userData.index == null && o.geometry.getAttribute('position').count === 4; }), 'the sketch point still drawn (its cross)');
      assert(W.localStorage.getItem('anvil.showEndpoints') === '0', 'remembered: ' + W.localStorage.getItem('anvil.showEndpoints'));
      // a reload reads it back
      App.view.showEndpoints = true;
      App.view.showEndpoints = UI.showEndpointsPref();
      assert(App.view.showEndpoints === false, 'read back off from localStorage');
      // a redraw (zoom) keeps them hidden
      UI.zoomView(1.25); UI.updateSketches(); await wait(10);
      assert(rfBSDots().length === 1, 'still hidden after a redraw: ' + rfBSDots().length);
      // an end point still selects
      await rfBSClick([20, 0]);
      assert(UI.selection().some(function (s) { return s.kind === 'sketchPoint' && s.ref === '0.p2'; }), 'end point selected: ' + JSON.stringify(UI.selection()));
      W.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await idle();
      // and the Line tool still snaps to an end: Coincident to the arc's end
      UI.setTool('line');
      await rfBSClick([30, 0]); await rfBSClick([30, -15]);
      var ln = f.entities[3];
      assert(ln && ln.t === 'line' && Math.abs(ln.x1 - 30) < 1e-9 && Math.abs(ln.y1) < 1e-9, 'line from the arc end: ' + JSON.stringify(ln));
      assert(rfBSRels(f).some(function (r) { return /^coincident:/.test(r) && /1\.p2/.test(r) && /3\.p1/.test(r); }), 'snapped Coincident: ' + rfBSRels(f).join(' '));
      W.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await idle();
      UI.setTool('select'); await idle();
      // View ▸ Display ▸ Show Endpoints: checked off, then on again
      var rows = menuRows('Show Endpoints');
      assert(rows.length === 1 && rows[0].chk === '', 'View ▸ Display row, unchecked: ' + JSON.stringify(rows.map(function (r) { return r.menu + ' ' + r.text + ' [' + r.chk + ']'; })));
      rows[0].row.click(); await idle(); await wait(10);
      assert(App.view.showEndpoints === true && W.localStorage.getItem('anvil.showEndpoints') === '1', 'on again, remembered');
      assert(D.querySelector('#hud [data-hud="Show Endpoints"]').classList.contains('active'), 'pressed again');
      assert(rfBSDots().length >= 5, 'dots back: ' + rfBSDots().length);
    } finally {
      if (App.view.showEndpoints === false) UI.toggleShowEndpoints(true);
      try { W.localStorage.removeItem('anvil.showEndpoints'); } catch (e) { /* storage blocked */ }
      if (UI.closeMenus) UI.closeMenus();
    }
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });
  // --- end rfBS ---
