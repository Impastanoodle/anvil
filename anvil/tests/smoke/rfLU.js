  // --- rfLU (2026-11-11, lane flatperf) --- a big perforated sheet-metal panel after the build, in the app: Flat-Pattern
  // and its DXF on Anvil's engine and on OpenCascade (at 1800 holes 307 s and 112 s before: mergeFlatRegions tested
  // every point against every hole; the kernel group rfLU flattens 1800 in Node), Geometry Nesting saying at once that
  // the part does not fit a smaller sheet (it rasterised every angle first), and the three standard views at 600 holes
  // (24.5 s in Node before: closeFreeEnds and the hidden-line occluders were all-pairs). 1200 holes here keep each
  // step's build well under the page's 30 s step limit; OpenCascade's build of the panel is slower in the page, so it
  // gets 300 holes (?rfLUn=1800 for a bench; Node: OpenCascade 1800 builds in 4 s and flattens in 2.5 s, was 112 s). Each step's times are in its result (?rfLUreport=1: the last
  // step fails with all of them, so headless/ui-smoke.js prints them); the bounds are generous so they never flake,
  // and still catch a quadratic stage coming back.
  (function () {
    var T = 0.0598, R = 0.125, N = 1200, NO = (function () { var m = /[?&]rfLUn=(\d+)/.exec(location.search); return m ? +m[1] : 300; })(), rfLUS = { ok: false, was: null, notes: [] };
    function note(s) { rfLUS.notes.push(s); return s; }
    function rfLUCode(n) {
      var cols = 30, rows = n / cols, sx = 22 / cols, sy = 46 / rows;
      return 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, 0, 24, 48).end().baseFlange(' + T + ');\n' +
        'p.sketch("Top", ' + T + ').circle(' + (1 + sx / 2) + ', ' + (1 + sy / 2) + ', ' + R + ').end().cut("through", { reverse: true });\n' +
        'p.linearPattern({ dir: "x", spacing: ' + sx + ', count: ' + cols + ', dir2: "z", spacing2: ' + sy + ', count2: ' + rows + ', reverse2: true });\n';
    }
    // a new part with n holes on the engine set (OpenCascade warmed by its own step) -> ms, or false
    async function rfLUBuild(n, engine) {
      var t0 = performance.now();
      await anvil.run(rfLUCode(n)); await idle();
      if (engine === 'occt') {
        await Promise.race([anvil.occtIdle(), wait(25000)]);
        for (var k = 0; k < 80 && !UI.App.build.occt; k++) { await wait(250); await anvil.occtIdle(); }
        await idle();
        if (!UI.App.build.occt) return false;
      }
      return Math.round(performance.now() - t0);
    }
    async function rfLUStart(engine) {
      if (rfLUS.was == null) rfLUS.was = anvil.occt().on;
      await anvil.newPart(); await idle();
      anvil.occt(engine === 'occt', { remember: false }); await idle();
    }
    async function rfLUEnd() {
      rfLUS.ok = false;
      if (rfLUS.was != null) { anvil.occt(rfLUS.was, { remember: false }); rfLUS.was = null; }
      await anvil.newPart(); await idle();
    }
    function rfLUFlat(n) {
      var t0 = performance.now(), fp = anvil.flat(), t1 = performance.now();
      assert(fp && !fp.error && fp.loops.length === n + 1, 'flat pattern: ' + (fp && (fp.error || fp.loops.length + ' loops')));
      var dxf = anvil.dxfFlat(), t2 = performance.now(), circles = (String(dxf).match(/\nCIRCLE\r?\n/g) || []).length;
      assert(circles === n, 'the flat DXF holds ' + circles + ' circles, want ' + n);
      assert(t1 - t0 < 12000 && t2 - t1 < 12000, 'Flat-Pattern ' + Math.round(t1 - t0) + ' ms, again for the DXF ' + Math.round(t2 - t1) + ' ms');
      return { flat: Math.round(t1 - t0), dxf: Math.round(t2 - t1) };
    }

    step('rfLU: a 24 x 48 16 ga panel with ' + N + ' Ø.25 holes on Anvil\'s engine: built', async function () {
      try {
        await rfLUStart('anvil');
        var b = await rfLUBuild(N, 'anvil');
        assert(b, 'built');
        rfLUS.ok = true;
        return note('Anvil ' + N + ': build ' + b + ' ms');
      } catch (err) { await rfLUEnd(); throw err; }
    });

    step('rfLU: that panel: Flat-Pattern and its DXF quick, every hole a CIRCLE', async function () {
      if (!rfLUS.ok) return note('skipped: the build step did not finish');
      var errs0 = errors.length;
      try {
        var ms = rfLUFlat(N);
        assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
        return note('Anvil Flat-Pattern ' + ms.flat + ' ms, DXF ' + ms.dxf + ' ms');
      } catch (err) { await rfLUEnd(); throw err; }
    });

    step('rfLU: that panel in Geometry Nesting (Add flat pattern) on a 20 x 40 sheet at 5° steps: "does not fit" at once', async function () {
      if (!rfLUS.ok) return note('skipped: the build step did not finish');
      try {
        UI.cmdTNesting(); await idle();
        assert(UI.pmTitle() === 'Geometry Nesting', 'PM ' + UI.pmTitle());
        clickPmButton('Add flat pattern'); await idle();
        var st = UI.nestState();
        assert(st.parts.length === 1, st.parts.length + ' parts');
        setInput(pmField('Length (X)'), '20'); await idle();
        setInput(pmField('Width (Y)'), '40'); await idle();
        setInput(pmField('Rotation'), 'custom'); await idle();
        var stepIn = pmField('Rotation step');
        assert(stepIn, 'Rotation step field');
        setInput(stepIn, '5'); await idle();
        var t0 = performance.now();
        clickPmButton('Nest'); await idle();
        var ms = Math.round(performance.now() - t0), r = UI.nestState().result;
        assert(r && r.placed === 0 && r.unplaced.length >= 1, 'nothing placed: ' + JSON.stringify(r && { placed: r.placed, unplaced: r.unplaced.length }));
        assert(ms < 5000, 'Nest took ' + ms + ' ms');
        UI.pmCancel(); await idle();
        return note('Nest (does not fit) ' + ms + ' ms');
      } finally { await rfLUEnd(); }
    });

    step('rfLU: a 600-hole panel on Anvil\'s engine: a drawing with the three standard views quick (was 24.5 s in Node)', async function () {
      var errs0 = errors.length;
      try {
        await rfLUStart('anvil');
        var b = await rfLUBuild(600, 'anvil');
        assert(b, 'built');
        var t0 = performance.now(), dw = await anvil.drawing.make(), ms = Math.round(performance.now() - t0);
        assert(dw && dw.views && dw.views.length >= 3, 'three views: ' + JSON.stringify(dw && dw.views && dw.views.length));
        anvil.drawing.close(); await idle();
        assert(ms < 25000, 'drawing ' + ms + ' ms');
        assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
        return note('Anvil 600: build ' + b + ' ms, drawing ' + ms + ' ms');
      } finally { await rfLUEnd(); }
    });

    step('rfLU: OpenCascade started for the panel (skipped without vendor/occt)', async function () {
      if (!anvil.workerOn || !anvil.workerOn()) return note('skipped: worker off');
      try {
        await rfLUStart('occt');
        await anvil.run('p.units("in");\np.box(2, 0.0598, 2);\n'); await idle();
        var st = await Promise.race([anvil.occtIdle(), wait(25000).then(function () { return anvil.occt(); })]);
        if (st.state === 'failed') { await rfLUEnd(); return note('skipped: OpenCascade not installed'); }
        await anvil.newPart(); await idle();
        rfLUS.ok = true;
        return note('OpenCascade started');
      } catch (err) { await rfLUEnd(); throw err; }
    });

    step('rfLU: a ' + NO + '-hole panel built on OpenCascade', async function () {
      if (!rfLUS.ok) return note('skipped: OpenCascade did not start');
      rfLUS.ok = false;
      try {
        var b = await rfLUBuild(NO, 'occt');
        if (!b) { await rfLUEnd(); return note('skipped: OpenCascade did not finish the build'); }
        rfLUS.ok = true;
        return note('OpenCascade ' + NO + ': build ' + b + ' ms');
      } catch (err) { await rfLUEnd(); throw err; }
    });

    step('rfLU: that panel on OpenCascade: Flat-Pattern and its DXF quick, every hole a CIRCLE', async function () {
      try {
        if (!rfLUS.ok) return note('skipped: the build step did not finish');
        assert(UI.App.build.occt, 'built by OpenCascade');
        var ms = rfLUFlat(NO);
        return note('OpenCascade Flat-Pattern ' + ms.flat + ' ms, DXF ' + ms.dxf + ' ms');
      } finally {
        await rfLUEnd();
        if (/[?&]rfLUreport=1/.test(location.search)) { var rep = rfLUS.notes.join(' | '); rfLUS.notes = []; fail('rfLU report: ' + rep); }
      }
    });
  })();
  // --- end rfLU ---
