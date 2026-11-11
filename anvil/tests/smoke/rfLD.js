  // --- rfLD (2026-11-11, lane curveperf) --- a big perforated sheet-metal panel from end to end, on Anvil's engine and
  // on OpenCascade: rebuild (LPattern of a Ø.25 through cut: the plate path, kernel-curves.js plateCutParts), the
  // viewport's edges / curve info / upload and its first frame, a click on the plate's face, Flat-Pattern, the flat DXF,
  // a drawing with the three standard views and STEP. Each stage's time is in the step's result (the kernel card keeps
  // the table); the bounds are generous so they never flake, and catch a quadratic stage coming back (67 s → 0.3 s).
  // ?rfLDn=1800 on the page URL times 1800 holes on both engines (default: 300 on Anvil's, 210 on OpenCascade: their
  // Flat-Pattern and drawing are still quadratic in the holes: kernel-sheetmetal.js mergeFlatRegions, drawing.js closeFreeEnds).
  function rfLDEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect(), press = type === 'mousedown';
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: press ? 1 : 0, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfLDFrame() { return new Promise(function (res) { W.requestAnimationFrame(function () { W.requestAnimationFrame(function () { res(); }); }); }); }
  function rfLDCode(n) {
    var T = 0.0598, R = 0.125, cols = 30, rows = n / cols, sx = 22 / cols, sy = 46 / rows;
    return 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, 0, 24, 48).end().baseFlange(' + T + ');\n' +
      'p.sketch("Top", ' + T + ').circle(' + (1 + sx / 2) + ', ' + (1 + sy / 2) + ', ' + R + ').end().cut("through", { reverse: true });\n' +
      'p.linearPattern({ dir: "x", spacing: ' + sx + ', count: ' + cols + ', dir2: "z", spacing2: ' + sy + ', count2: ' + rows + ', reverse2: true });\n';
  }
  // the trip in four steps per engine (each under the page's 30 s step limit): build, then Flat-Pattern + DXF, the
  // drawing, STEP; rfLDS carries the engine switch and the times between them
  var rfLDS = { n: 600, ms: {} };
  function rfLDn(engine) { var m = /[?&]rfLDn=(\d+)/.exec(location.search); return m ? +m[1] : engine === 'occt' ? 210 : 300; }
  // ?rfLDreport=1: the last step fails with every step's times, so headless/ui-smoke.js prints them (the kernel card's table)
  function rfLDNote(s) { (rfLDS.report = rfLDS.report || []).push(s); return s; }
  async function rfLDBuild(engine) {
    var n = rfLDS.n = rfLDn(engine), T = 0.0598, R = 0.125, ms = rfLDS.ms = {}, t0;
    function lap(k) { var t = performance.now(); ms[k] = Math.round(t - t0); t0 = t; }
    if (rfLDS.was == null) rfLDS.was = anvil.occt().on;
    rfLDS.ok = false;
    await anvil.newPart(); await idle();
    anvil.occt(engine === 'occt', { remember: false }); await idle();
    if (engine === 'occt') {   // the engine started first (not timed): a plain plate
      await anvil.run('p.units("in");\np.box(2, 0.0598, 2);\n'); await idle();
      await Promise.race([anvil.occtIdle(), wait(20000)]);
      await anvil.newPart(); await idle();
    }
    t0 = performance.now();
    await anvil.run(rfLDCode(n)); await idle();
    if (engine === 'occt') {
      var st = await Promise.race([anvil.occtIdle(), wait(25000).then(function () { return anvil.occt(); })]);
      if (st.state === 'failed') return 'skipped: OpenCascade not installed';
      for (var k = 0; k < 80 && !UI.App.build.occt; k++) { await wait(250); await anvil.occtIdle(); }
      await idle();
      assert(UI.App.build.occt, 'built by OpenCascade');
    }
    lap('rebuild + mesh + edges + upload');
    var am = UI.App.applyMs || {};
    ms.apply = Math.round(am.total || 0);
    await rfLDFrame(); lap('first frame');
    var want = (24 * 48 - n * Math.PI * R * R) * T, vol = engine === 'occt' ? UI.App.build.occt.volume : anvil.mass().volume;
    assert(Math.abs(vol - want) <= 1e-9 * want, engine + ' volume ' + vol + ', exact ' + want);
    // a click on the plate's top face in the margin, zoomed in so no edge is under the cursor
    UI.setView('Top'); UI.zoomToFit(); await idle(); await rfLDFrame();
    var s = UI.worldToScreen([0.62, T, -0.62]), vr = $('viewport').getBoundingClientRect();
    for (var z = 0; z < 6; z++) { $('viewport').dispatchEvent(new W.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120, clientX: Math.round(vr.left + s[0]), clientY: Math.round(vr.top + s[1]) })); await rfLDFrame(); }
    await idle(); await rfLDFrame(); t0 = performance.now();
    s = UI.worldToScreen([0.62, T, -0.62]);
    rfLDEv('mousemove', s); rfLDEv('mousedown', s, $('viewport')); rfLDEv('mouseup', s); await idle(); await rfLDFrame();
    lap('select a face');
    var sel = anvil.selection();
    assert(sel.length === 1 && sel[0].kind === 'face', 'the plate\'s face is selected: ' + JSON.stringify(sel));
    if (anvil.clearSelection) anvil.clearSelection(); await idle();
    rfLDS.ok = true;
    return rfLDNote(engine + ', ' + n + ' holes (ms): ' + JSON.stringify(ms));
  }
  // the later steps of one engine: on the part the build step left (skipped when it did not finish)
  async function rfLDStage(engine, fn) {
    if (!rfLDS.ok) return 'skipped: the build step did not finish';
    if (engine === 'occt' && !(UI.App.build && UI.App.build.occt)) return 'skipped: not on OpenCascade';
    var t0 = performance.now(), out = await fn();
    var ms = Math.round(performance.now() - t0);
    assert(ms < 25000, 'took ' + (ms / 1000).toFixed(1) + ' s');
    return rfLDNote(engine + ': ' + out + ' (' + ms + ' ms)');
  }
  function rfLDFlat() {
    var fp = anvil.flat();
    assert(fp && !fp.error, 'flat pattern: ' + (fp && fp.error));
    var t0 = performance.now(), dxf = anvil.dxfFlat(), circles = (String(dxf).match(/\nCIRCLE\r?\n/g) || []).length;
    assert(circles === rfLDS.n, 'the flat DXF holds ' + circles + ' circles, want ' + rfLDS.n);
    return 'Flat-Pattern + flat DXF (DXF alone ' + Math.round(performance.now() - t0) + ' ms)';
  }
  async function rfLDDrawing() {
    var dw = await anvil.drawing.make();
    assert(dw && dw.views && dw.views.length >= 3, 'three views: ' + JSON.stringify(dw && dw.views && dw.views.length));
    anvil.drawing.close(); await idle();
    return 'drawing with ' + dw.views.length + ' views';
  }
  function rfLDStep() {
    var s = anvil.exportStep();
    assert(String(s).indexOf('CYLINDRICAL_SURFACE') > 0, 'STEP with cylinders');
    return 'STEP ' + Math.round(String(s).length / 1024) + ' KB';
  }
  async function rfLDEnd(last) {
    if (last && /[?&]rfLDreport=1/.test(location.search)) { var rep = (rfLDS.report || []).join(' | '); rfLDS.report = []; await rfLDEnd(); fail('rfLD report: ' + rep); }
    if (rfLDS.was != null) { anvil.occt(rfLDS.was, { remember: false }); rfLDS.was = null; } rfLDS.ok = false; await anvil.newPart(); await idle(); }
  [['anvil', 'Anvil\'s engine'], ['occt', 'OpenCascade (skipped without vendor/occt)']].forEach(function (e) {
    var en = e[0];
    step('rfLD: a 24 x 48 16 ga sheet-metal panel with an LPattern of ' + (en === 'occt' ? 210 : 300) + ' Ø.25 holes on ' + e[1] + ': rebuilt, drawn, a face clicked quickly, volume exact', async function () {
      if (en === 'occt' && (!anvil.workerOn || !anvil.workerOn())) return 'skipped: worker off';
      try { return await rfLDBuild(en); } catch (err) { await rfLDEnd(); throw err; }
    });
    step('rfLD: that panel on ' + e[1] + ': Flat-Pattern and its DXF (every hole a CIRCLE)', function () { return rfLDStage(en, rfLDFlat); });
    step('rfLD: that panel on ' + e[1] + ': a drawing with the three standard views', function () { return rfLDStage(en, rfLDDrawing); });
    step('rfLD: that panel on ' + e[1] + ': STEP export', async function () { try { return await rfLDStage(en, rfLDStep); } finally { await rfLDEnd(en === 'occt'); } });
  });
