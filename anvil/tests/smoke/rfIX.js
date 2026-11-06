  // --- rfIX (2026-11-05, lane sketchtools) --- quick Ctrl+clicks on lines' exact midpoints with real mouse events
  // (the rfIT "lost click" was a click above the viewport: the mouseup bounds check drops it, as for any click off the
  // graphics area), Align Grid/Origin on an inch plate (model vertex + edge, geometry stays in space, script round trip).
  async function rfIXNew(code) {
    var m = UI.K.newModel('IXPart'); m.units = 'in';
    await anvil.load(m); await idle();
    if (code) { await anvil.run('p.units("in");\n' + code); await idle(); }
    var fs = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; }), f = fs[fs.length - 1];
    if (f && code) { await UI.enterSketch(f.id); await idle(); }
    else { await UI.newSketchOnPlane('Front'); await idle(); }
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    return UI.activeSketchFeature();
  }
  async function rfIXGrid(fn) {
    var was = UI.App.view.showGrid;
    UI.App.view.showGrid = false; UI.App.gridStale = true;
    try { return await fn(); } finally { UI.App.view.showGrid = was; UI.App.gridStale = true; }
  }
  function rfIXOn(uv) { var s = rskScr(uv); assert(s[0] > 2 && s[1] > 2 && s[0] < UI.size.w - 2 && s[1] < UI.size.h - 2, 'on screen ' + JSON.stringify(uv) + ' → ' + JSON.stringify(s)); return s; }
  function rfIXSel() {
    var out = [];
    UI.selection().forEach(function (s) { var i = s.kind === 'entity' ? s.index : s.ref ? +String(s.ref).split('.')[0] : null; if (i != null && out.indexOf(i) < 0) out.push(i); });
    return out.sort().join();
  }
  function rfIXCentre(uv) { var c = rskScr(uv); if (UI.panView) UI.panView(UI.size.w / 2 - c[0], UI.size.h / 2 - c[1]); }
  step('rfIX: Select tool: a click then quick Ctrl+clicks on three lines\' exact midpoints (real mouse events, no wait between) select all three; Ctrl+click again takes one out; the same after Smart Dimension rested on a midpoint', async function () {
    return rfIXGrid(async function () {
      var errs0 = errors.length, f = await rfIXNew();
      UI.zoomView(0.01 / UI.cam.scale);
      f.entities.push({ t: 'line', x1: -1, y1: 0, x2: 1, y2: 0 }, { t: 'line', x1: -1, y1: 0.75, x2: 1, y2: 0.75 }, { t: 'line', x1: -1, y1: -0.75, x2: 1, y2: -0.5 });
      UI.updateSketches(); UI.setTool('select'); UI.setSelection([]); await idle();
      rfIXCentre([0, 0]); await idle();
      var M = [[0, 0], [0, 0.75], [0, -0.625]].map(rfIXOn);
      selClick(M[0]); selClick(M[1], { ctrlKey: true }); selClick(M[2], { ctrlKey: true }); await idle();
      assert(rfIXSel() === '0,1,2', 'all three: ' + rfIXSel() + ' ' + JSON.stringify(UI.selection()));
      selClick(M[1], { ctrlKey: true }); await idle();
      assert(rfIXSel() === '0,2', 'the middle one out: ' + rfIXSel());
      UI.setTool('dimension'); selEv('mousemove', M[1]); await wait(UI.dimMidDwell ? UI.dimMidDwell() + 40 : 200);
      selKey('Escape'); await idle();
      UI.setTool('select'); UI.setSelection([]); await idle();
      selEv('mousemove', M[0]); selClick(M[0]); selClick(M[1], { ctrlKey: true }); selClick(M[2], { ctrlKey: true }); await idle();
      assert(rfIXSel() === '0,1,2', 'after Smart Dimension: ' + rfIXSel());
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'selected ' + rfIXSel();
    });
  });
  step('rfIX: Align Grid/Origin on a 6 × 4 × .25 in plate sketch: a click on the plate corner vertex sets the origin, a click on its left edge the X axis (a quarter turn); ✓: the hole reads from the corner, stays in space (the cut volume is unchanged), one undo step, the script round trip keeps it', async function () {
    return rfIXGrid(async function () {
      var errs0 = errors.length;
      var code = 'p.sketch("Front").rect(1, 1, 6, 4);\np.extrude(0.25);\np.sketch("Front", 0.25).circle(3, 2.5, 0.25);';
      var f = await rfIXNew(code);
      UI.zoomView(0.012 / UI.cam.scale); rfIXCentre([4, 3]); await idle();
      var spec = UI.cmdAlignGrid(); await idle();
      assert(spec && UI.pmTitle() === 'Align Grid/Origin', 'PM ' + UI.pmTitle());
      selClick(rfIXOn([1, 1])); await idle();
      assert(spec.values.org && spec.values.org.label === 'Vertex', 'origin: the corner vertex ' + JSON.stringify(spec.values.org));
      near(spec.values.org.uv[0], 1, 1e-9, 'u'); near(spec.values.org.uv[1], 1, 1e-9, 'v');
      selClick(rfIXOn([1, 3])); await idle();
      assert(spec.values.xax && spec.values.xax.label === 'Edge', 'X axis: the left edge ' + JSON.stringify(spec.values.xax));
      var u0 = UI.App.undo.length;
      UI.pmOK({ close: true }); await idle();
      f = UI.activeSketchFeature();
      assert(UI.App.undo.length === u0 + 1, 'one undo step');
      var C = f.entities[0], pl = UI.activePlane();
      var w = K.to3D(pl, C.cx, C.cy);
      near(w[0], 3, 1e-9, 'hole x in space'); near(w[1], 2.5, 1e-9, 'hole y in space'); near(w[2], 0.25, 1e-9, 'on the face');
      near(Math.abs(C.cx), 1.5, 1e-9, 'along the new X (the left edge): 1.5'); near(Math.abs(C.cy), 2, 1e-9, 'across: 2');
      assert(/Grid aligned/.test(statusText()), 'status ' + statusText());
      UI.exitSketch(); await idle();
      await anvil.run(anvil.script() + '\np.cut("through");'); await idle();
      var vol = anvil.mass().volume, want = 6 * 4 * 0.25 - Math.PI * 0.0625 * 0.25;
      near(vol, want, 2e-3 * want, 'the hole cuts where it was');
      var s2 = anvil.script();
      await anvil.run(s2); await idle();
      near(anvil.mass().volume, vol, 1e-9, 'script round trip');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'hole at ' + C.cx.toFixed(3) + ', ' + C.cy.toFixed(3) + '; ' + vol.toFixed(5) + ' in³';
    });
  });
  // --- end rfIX ---
