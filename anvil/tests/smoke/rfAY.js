  // ---- rfAY (2026-10-13): Rapid Sketch, Ghost image on drag, Curvature Control with a driving value
  function rfAYEv(type, p, target, button, extra) {
    var r = $('viewport').getBoundingClientRect(), o = { bubbles: true, cancelable: true, button: button || 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    (target || W).dispatchEvent(new W.MouseEvent(type, o));
  }
  function rfAYClick(p) { rfAYEv('mousemove', p, W, 0, { buttons: 0 }); rfAYEv('mousedown', p, $('viewport')); rfAYEv('mouseup', p); }
  function rfAYRb(label) { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (x) { return x.getAttribute('aria-label') === label; })[0]; }
  async function rfAYSettle() { var t0 = Date.now(); while (UI.viewAnimating && UI.viewAnimating() && Date.now() - t0 < 3000) await wait(30); await idle(); }
  // a visible planar face of the part: its index, normal and a screen point well inside it (where pickFace finds it)
  function rfAYFace(skip) {
    var faces = UI.App.mesh.faces, best = null;
    faces.forEach(function (fc, i) {
      if (skip && skip.indexOf(i) >= 0 || fc.area < 50) return;
      var s = UI.worldToScreen(fc.centroid), hit = UI.pickFace(s[0], s[1]);
      if (!hit || hit.index !== i) return;
      if (!best || fc.area > best.area) best = { index: i, normal: fc.normal, scr: s, area: fc.area, w: fc.w };
    });
    return best;
  }
  function rfAYNear(a, b, tol) { return Math.abs(a - b) <= (tol || 1e-6) * Math.max(1, Math.abs(b)); }
  step('rfAY: Rapid Sketch — the Sketch tab toggle (kept per browser) lets Circle start with no sketch open: a face lights up under the cursor, the first click opens a sketch on it (the view stays) and places the centre; between circles a click on another face closes that sketch and opens one there; Esc disarms', async function () {
    var errs0 = errors.length;
    try {
      await anvil.newPart(); await idle();
      await anvil.run('p.box(40, 40, 20, { centered: true });'); await idle();
      UI.setView('Isometric'); await rfAYSettle(); UI.zoomToFit(); await rfAYSettle();
      UI.setRibbonTab('Sketch'); await idle();
      var rs = rfAYRb('Rapid Sketch');
      assert(rs && !rs.disabled && !rs.classList.contains('active'), 'Rapid Sketch button enabled and off');
      var circ0 = rfAYRb('Circle');
      assert(!circ0 || !circ0.disabled, 'Circle enabled with no sketch while Rapid Sketch is off');   // lane mcdirect: it asks for a plane (Edit Sketch) instead of being greyed
      rs.click(); await idle();
      assert(UI.rapidSketchOn() && rfAYRb('Rapid Sketch').classList.contains('active'), 'on, the button pressed');
      assert(JSON.parse(W.localStorage.getItem('anvil.sketchSettings') || '{}').rapidSketch === true, 'kept');
      var circ = rfAYRb('Circle');
      if (circ) { assert(!circ.disabled, 'Circle enabled with Rapid Sketch on'); circ.click(); } else UI.setTool('circle');
      await idle();
      assert(UI.rapidSketchArmed() && UI.rapidSketchArmed().tool === 'circle' && UI.App.mode !== 'sketch', 'armed: ' + JSON.stringify(UI.rapidSketchArmed()));
      // Esc disarms, the Circle again re-arms
      W.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await idle();
      assert(!UI.rapidSketchArmed(), 'Esc disarms');
      UI.setTool('circle'); await idle();
      assert(UI.rapidSketchArmed(), 're-armed by the tool');
      var A = rfAYFace();
      assert(A, 'a visible face');
      var q0 = UI.camera.quaternion.clone(), n0 = UI.App.model.features.length;
      rfAYEv('mousemove', A.scr, W, 0, { buttons: 0 }); await idle();
      assert(UI.App.hover && UI.App.hover.kind === 'face' && UI.App.hover.index === A.index, 'the face lights up: ' + JSON.stringify(UI.App.hover && { k: UI.App.hover.kind, i: UI.App.hover.index }));
      rfAYClick(A.scr); await idle();
      assert(UI.App.mode === 'sketch' && UI.App.tool === 'circle' && UI.App.toolState.pts.length === 1, 'a sketch with the circle started: ' + UI.App.mode + ' ' + UI.App.tool + ' ' + UI.App.toolState.pts.length);
      assert(UI.camera.quaternion.angleTo(q0) < 1e-6, 'the view stays: ' + UI.camera.quaternion.angleTo(q0));
      var pl = UI.activePlane(), f1 = UI.activeSketchFeature();
      assert(Math.abs(K.vec.dot(pl.n, A.normal) - 1) < 1e-9 && Math.abs(K.vec.dot(pl.n, pl.origin) - A.w) < 1e-6, 'on the face: ' + JSON.stringify(pl.n));
      var c0 = UI.screenToPlane(A.scr[0], A.scr[1], pl), edgeP = UI.worldToScreen(K.to3D(pl, c0[0] + 5, c0[1]));
      rfAYClick(edgeP); await idle();
      assert(f1.entities.length === 1 && f1.entities[0].t === 'circle' && rfAYNear(f1.entities[0].r, 5, 1e-3), 'circle 1: ' + JSON.stringify(f1.entities));
      assert(UI.App.tool === 'circle' && !UI.App.toolState.pts.length, 'the tool stays on');
      // another face: it lights up while the tool waits, a click moves the sketch there
      var B = rfAYFace([A.index]);
      assert(B && Math.abs(K.vec.dot(B.normal, A.normal)) < 0.5, 'a second face');
      rfAYEv('mousemove', B.scr, W, 0, { buttons: 0 }); await idle();
      assert(UI.rapidSketchHover() === 'face:' + B.index, 'hover in the sketch: ' + UI.rapidSketchHover());
      rfAYClick(B.scr); await idle();
      var f2 = UI.activeSketchFeature(), pl2 = UI.activePlane();
      assert(f2 && f2.id !== f1.id && UI.App.mode === 'sketch' && UI.App.toolState.pts.length === 1, 'a new sketch with the next circle started');
      assert(Math.abs(K.vec.dot(pl2.n, B.normal) - 1) < 1e-9, 'on the second face');
      var c2 = UI.screenToPlane(B.scr[0], B.scr[1], pl2);
      rfAYClick(UI.worldToScreen(K.to3D(pl2, c2[0], c2[1] + 4))); await idle();
      assert(f2.entities.length === 1 && rfAYNear(f2.entities[0].r, 4, 1e-3), 'circle 2: ' + JSON.stringify(f2.entities));
      assert(UI.camera.quaternion.angleTo(q0) < 1e-6, 'the view still stays');
      // Esc puts the tool down: no more switching; the first sketch was kept with its circle
      D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await idle();
      assert(UI.App.tool === 'select', 'tool down');
      rfAYClick(A.scr); await idle();
      assert(UI.activeSketchFeature() === f2, 'no switch with the Select tool');
      await UI.exitSketch(); await idle();
      var sks = UI.App.model.features.filter(function (g) { return g.type === 'sketch'; });
      assert(UI.App.model.features.length === n0 + 2 && sks.length >= 3 && K.findFeature(UI.App.model, f1.id).entities.length === 1, 'two new sketches: ' + UI.App.model.features.map(function (g) { return g.name; }).join(', '));
      UI.toggleRapidSketch(false); await idle();
      UI.setRibbonTab('Sketch'); await idle();
      var circ2 = rfAYRb('Circle');
      assert(!circ2 || !circ2.disabled, 'off: Circle still enabled (it asks for a plane)');   // lane mcdirect
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'face ' + A.index + ' then face ' + B.index;
    } finally { UI.sketchSettings.reset(); UI.setTool && UI.App.mode !== 'sketch' && UI.setTool('select'); }
  });
  step('rfAY: Ghost image on drag — Tools ▸ Sketch Settings lists it (on by default); dragging a line end leaves the old line drawn faded until the release; off, no ghost', async function () {
    var errs0 = errors.length;
    try {
      await anvil.newPart(); await idle();
      await UI.newSketchOnPlane('Front'); await idle();
      var f = UI.activeSketchFeature();
      f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'circle', cx: 60, cy: 0, r: 5 });
      UI.updateSketches(); UI.zoomToFit(); await rfAYSettle();
      var rows = menuRows('Sketch Settings ▸ Ghost image on drag');
      assert(rows.length === 1 && rows[0].row.querySelector('.chk') && rows[0].row.querySelector('.chk').textContent === '✓', 'menu row, checked');
      if (UI.closeMenus) UI.closeMenus();
      function scr(u, v) { return UI.worldToScreen(K.to3D(UI.activePlane(), u, v)); }
      async function drag(from, to, mid) {
        var a = scr(from[0], from[1]), b = scr(to[0], to[1]), seen = 0;
        rfAYEv('mousemove', a, W, 0, { buttons: 0 });
        rfAYEv('mousedown', a, $('viewport'));
        for (var k = 1; k <= 5; k++) { rfAYEv('mousemove', [a[0] + (b[0] - a[0]) * k / 5, a[1] + (b[1] - a[1]) * k / 5]); await wait(30); }
        seen = UI.sketchGhostCount();
        if (mid) mid();
        rfAYEv('mouseup', b); await idle();
        return seen;
      }
      var g1 = await drag([30, 0], [30, 15]);
      var e0 = UI.activeSketchFeature().entities[0];
      assert(Math.abs(e0.y2 - 15) < 0.2, 'the end moved: ' + JSON.stringify(e0));
      assert(g1 === 1, 'one ghost while dragging: ' + g1);
      assert(UI.sketchGhostCount() === 0, 'gone on release');
      UI.sketchSettings.set('ghostOnDrag', false);
      var g2 = await drag([30, 15], [30, 5]);
      assert(g2 === 0, 'no ghost with the setting off: ' + g2);
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      await UI.exitSketch(); await idle();
      return 'ghost ' + g1 + ' / ' + g2;
    } finally { UI.sketchSettings.reset(); }
  });
  step('rfAY: Add Curvature Control gives the new spline point a driving curvature; the Spline PM\'s Radius of curvature and Curvature set it (both sides of the point hold it), it survives undo and a save / load, and Curvature Control off goes back', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    UI.zoomView(0.25 / UI.cam.scale);
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'spline', pts: [[0, 0], [10, 10], [20, 0], [30, -10], [40, 0]] });
    UI.updateSketches(); await wait(20);
    UI.cmdAddCurvatureControl(); await idle();
    var P = W.SketchSolver.freeCurve(f.entities[0]).pt(0.5), s = UI.worldToScreen(K.to3D(UI.activePlane(), P[0], P[1]));
    rfAYClick(s); await idle();
    var e = UI.activeSketchFeature().entities[0], at = 1;
    assert(e.pts.length === 6 && e.tans && e.tans[at] && isFinite(e.tans[at][3]), 'a curvature value at point 2: ' + JSON.stringify(e.tans));
    var k0 = K.splineCurvatureAt(e, at);
    assert(rfAYNear(k0.out, e.tans[at][3], 1e-6) && rfAYNear(k0['in'], e.tans[at][3], 1e-6), 'held on both sides: ' + JSON.stringify(k0) + ' vs ' + e.tans[at][3]);
    assert(UI.pmTitle() === 'Spline' && D.querySelector('#pm [data-key="cc"]').checked, 'Spline PM, Curvature Control on');
    var u0 = UI.App.undo.length;
    rfAWSet('cr', 8); await idle();
    e = UI.activeSketchFeature().entities[0];
    var k1 = K.splineCurvatureAt(e, at), sg = k0.out < 0 ? -1 : 1;
    assert(rfAYNear(k1.out, sg / 8, 1e-9) && rfAYNear(k1['in'], sg / 8, 1e-9), 'radius 8 on both sides: ' + JSON.stringify(k1));
    var g = K.splineGeom(e);
    assert(g.bez.length === 5 && Math.hypot(g.bez[2][0][0] - e.pts[2][0], g.bez[2][0][1] - e.pts[2][1]) < 1e-12, 'still through its points');
    rfAWSet('ck', 0); await idle();
    var k2 = K.splineCurvatureAt(UI.activeSketchFeature().entities[0], at);
    assert(Math.abs(k2.out) < 1e-9 && Math.abs(k2['in']) < 1e-9, 'Curvature 0: flat there: ' + JSON.stringify(k2));
    rfAWSet('ck', -0.05); await idle(); await wait(30);   // the PM re-renders on a timer
    e = UI.activeSketchFeature().entities[0];
    assert(rfAYNear(K.splineCurvatureAt(e, at).out, -0.05, 1e-9) && rfAYNear(+D.querySelector('#pm [data-key="cr"]').value, 20, 1e-6), 'Curvature -0.05: radius 20 in the PM: ' + D.querySelector('#pm [data-key="cr"]').value + ' κ ' + K.splineCurvatureAt(e, at).out);
    // a save / load keeps it
    var json = JSON.stringify(UI.App.model);
    UI.pmCancel(); await idle();
    await UI.exitSketch(); await idle();
    await anvil.load(JSON.parse(json)); await idle();
    var sk = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0], e2 = sk.entities[0];
    assert(e2.tans && rfAYNear(e2.tans[at][3], -0.05, 1e-12) && rfAYNear(K.splineCurvatureAt(e2, at).out, -0.05, 1e-9), 'loaded: ' + JSON.stringify(e2.tans));
    // undo: back to before the radius (the value Add Curvature Control gave)
    await UI.editSketch(sk.id); await idle();
    UI.setSelection([{ kind: 'entity', index: 0 }]); await idle();
    var r = UI.splineCurvatureControl(0, at, { r: 4 });
    assert(r.ok && rfAYNear(Math.abs(K.splineCurvatureAt(UI.activeSketchFeature().entities[0], at).out), 0.25, 1e-9), 'radius 4 by the API');
    UI.undo(); await idle();
    assert(rfAYNear(K.splineCurvatureAt(UI.activeSketchFeature().entities[0], at).out, -0.05, 1e-9), 'undo: ' + JSON.stringify(UI.activeSketchFeature().entities[0].tans));
    var off = UI.splineCurvatureControl(0, at, 'off'), e3 = UI.activeSketchFeature().entities[0];
    assert(off.ok && e3.tans[at] && e3.tans[at][3] == null && e3.tans[at].length <= 3, 'off: the driving tangent stays, the curvature goes: ' + JSON.stringify(e3.tans[at]));
    UI.setSelection([]);
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    await UI.exitSketch(); await idle();
    return 'κ ' + k0.out.toFixed(4) + ' → 1/8 → 0 → -0.05';
  });
  // --- end rfAY ---
