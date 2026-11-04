  // ---- rfHO (2026-11-04, lane occt-on): the app with OpenCascade on, the user's default once the engine is installed.
  // The suite's setup step turns OpenCascade off for every group; this one turns it on, waits for its exact solid and
  // runs the flows that failed with it on: undo / redo of a drawing-only edit (a note, a dimension's precision, Area
  // Hatch/Fill) shows at once and keeps the exact solid and its views (ui-core.js keepSame), a drawing reader after an
  // undo onto a rebuilt part sees the undone sheet (drawing-ui.js settle), a lasso round a hole keeps the whole rim
  // selected when the exact solid swaps in (ui-occt.js curveChords), and exports do not change when a view or a
  // dimension is selected. Without the engine (vendor/get-occt.ps1 not run) every step says so and passes.
  var RFHO = { engine: null, plate: 'p.name("HOPlate").units("in");\np.sketch("Front").rect(0, 0, 4, 2).circle(3, 1, 0.25).extrude(0.25);' };
  async function rfHOEngine() {
    if (RFHO.engine == null) {
      try { var r = await W.fetch('vendor/occt/opencascade.full.wasm', { method: 'HEAD' }); RFHO.engine = r.ok; } catch (e) { RFHO.engine = false; }
      if (!RFHO.engine) { try { var g = await W.fetch('vendor/occt/opencascade.full.wasm.gz', { method: 'HEAD' }); RFHO.engine = g.ok; } catch (e2) { } }
    }
    return RFHO.engine;
  }
  // OpenCascade on (not remembered) and its exact solid of the part on screen
  async function rfHOExact() {
    if (!anvil.occt().on) anvil.occt(true, { remember: false });
    for (var i = 0; i < 600 && !anvil.occt().driving; i++) {
      var s = anvil.occt();
      if (/^(failed|error|unsupported|invalid|mismatch|featureError)$/.test(s.state)) throw new Error('OpenCascade: ' + s.state + ' ' + (s.error || ''));
      await wait(50);
    }
    await anvil.occtIdle();
    assert(anvil.occt().driving, 'OpenCascade drives the part: ' + JSON.stringify(anvil.occt()).slice(0, 200));
  }
  async function rfHOPart(code) {
    await anvil.newPart(); await idle();
    await anvil.run(code || RFHO.plate); await idle();
    await rfHOExact();
  }
  async function rfHODrawing(code) {
    await rfHOPart(code);
    anvil.drawing.make({ fresh: true }); await idle(); await wait(60);
    await UI.drawing.ready();
    return anvil.drawing.summary();
  }
  function rfHOKey(k, mods) { (D.activeElement || D.body).dispatchEvent(new W.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {}))); }
  function rfHOTexts() { return UI.drawing.state.sheet.prims.filter(function (p) { return p.k === 'text'; }).map(function (p) { return p.text; }); }
  // the projection work done while fn runs (HLR runs, section cuts), as rfDR counts it
  async function rfHOWork(fn) {
    var Dw = W.Drawing, n = 0, pv = Dw.projectView, so = Dw.sectionOf;
    Dw.projectView = function () { n++; return pv.apply(this, arguments); };
    Dw.sectionOf = function () { n++; return so.apply(this, arguments); };
    try { await fn(); } finally { Dw.projectView = pv; Dw.sectionOf = so; }
    return n;
  }

  step('rfHO: OpenCascade on — a fresh part gets OpenCascade\'s exact solid (the user\'s default once the engine is installed)', async function () {
    if (!(await rfHOEngine())) return 'skipped: no OpenCascade engine in vendor/occt';
    RFHO.was = anvil.occt().on;
    await rfHOPart();
    var s = anvil.occt();
    assert(s.on && s.driving && s.state === 'ok', 'state ' + JSON.stringify(s).slice(0, 200));
    return 'exact solid: ' + s.faces + ' faces, engine loaded in ' + Math.round(s.loadMs || 0) + ' ms';
  });

  step('rfHO: (rfAE, rfCT) Ctrl+Z / Ctrl+Y of a drawing note and of a dimension\'s precision on an OpenCascade part show at once (one frame), the exact solid and its views stay: no new mesh, no view worked out again', async function () {
    if (!(await rfHOEngine())) return 'skipped: no OpenCascade engine';
    var errs0 = errors.length, s0 = await rfHODrawing(), m0 = UI.App.mesh, b0 = UI.App.build;
    var S = s0.sheet.size;
    anvil.drawing.note({ p: [S[0] / 2, S[1] - 1.2], text: 'HO NOTE ONE' }); await UI.drawing.ready(); await wait(20);
    assert(rfHOTexts().indexOf('HO NOTE ONE') >= 0, 'the note is on the sheet');
    var work = await rfHOWork(async function () {
      rfHOKey('z', { ctrlKey: true }); await wait(40);
      assert(rfHOTexts().indexOf('HO NOTE ONE') < 0, 'Ctrl+Z: the note gone within a frame (it waited for OpenCascade to rebuild the same part)');
      assert(UI.App.mesh === m0 && UI.App.build === b0 && anvil.occt().driving, 'the exact solid stays (same build and mesh, OpenCascade driving)');
      rfHOKey('y', { ctrlKey: true }); await wait(40);
      assert(rfHOTexts().indexOf('HO NOTE ONE') >= 0, 'Ctrl+Y: the note back within a frame');
      assert(UI.App.mesh === m0 && anvil.occt().driving, 'redo keeps the exact solid');
    });
    assert(work === 0, 'no view worked out again for a drawing undo: ' + work);
    // a dimension's precision (rfCT's shop flow): .12 -> Ctrl+Z puts the 3-place text back at once
    if (!anvil.drawing.summary().dims.length) anvil.drawing.modelItems(true);
    await UI.drawing.ready(); await wait(20);
    var texts = anvil.drawing.summary().dims.map(function (d, j) { return anvil.drawing.dimProps(j).text; }), i = texts.findIndex(function (t) { return /^\d*\.\d{3}$/.test(t || ''); });
    assert(i >= 0, 'a 3-place dimension: ' + texts.join(' '));
    var t3 = texts[i];
    anvil.drawing.dimProps(i, { prec: 2 }); await wait(20);
    var t2 = anvil.drawing.dimProps(i).text;
    assert(t2 !== t3 && /^\d*\.\d{2}$/.test(t2), 'precision 2: ' + t2);
    rfHOKey('z', { ctrlKey: true }); await wait(40);
    assert(rfHOTexts().indexOf(t3) >= 0 && UI.App.mesh === m0, 'Ctrl+Z: ' + t3 + ' back at once on the exact solid');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return 'note and ' + t3 + ' / ' + t2 + ' undone in a frame, no view work';
  });

  step('rfHO: (rfDW) Area Hatch/Fill on a section of an OpenCascade part — a dimension change, then Ctrl+Z three times: the hatch reader sees each undone sheet at once, even while OpenCascade rebuilds', async function () {
    if (!(await rfHOEngine())) return 'skipped: no OpenCascade engine';
    var errs0 = errors.length, s = await rfHODrawing('p.name("HOTwo").units("in");\np.box(2, 1, 1);\np.box(2, 1, 1, { at: [3, 0, 0], merge: false });');
    var front = s.views.filter(function (v) { return v.orient === 'Front'; })[0];
    await anvil.drawing.sectionView(front.id, { axis: 'h', at: 0.5 }); await idle(); await UI.drawing.ready(); await wait(30);
    var sv = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'section'; })[0];
    assert(sv, 'section view');
    anvil.drawing.areaHatch(sv.id, 'b0:r0', { pattern: 'ANSI37', scale: 2, angle: 0 }); await UI.drawing.ready();
    anvil.drawing.areaHatch(sv.id, 'b1:r0', { fill: 'none' }); await UI.drawing.ready();
    var g1 = anvil.drawing.hatchRegions(sv.id);
    assert(g1[0].areaHatch && g1[0].pattern === 'ANSI37' && g1[1].areaHatch && g1[1].pattern === 'NONE', 'hatches set ' + JSON.stringify(g1.map(function (x) { return x.pattern; })));
    var f0 = UI.App.model.features.filter(function (f) { return f.type === 'extrude' && isFinite(f.depth); })[0] || UI.App.model.features[0];
    UI.pushUndo(); if (f0.depth != null) f0.depth = 1.5; else f0.h = 1.5; await UI.rebuild(); await idle(); await rfHOExact(); await UI.drawing.ready();
    rfHOKey('z', { ctrlKey: true }); await idle();   // the part back: OpenCascade rebuilds it
    var gA = anvil.drawing.hatchRegions(sv.id);
    assert(gA[0].areaHatch && gA[0].pattern === 'ANSI37' && gA[1].areaHatch && gA[1].pattern === 'NONE', 'after undoing the dimension the hatches stay ' + JSON.stringify(gA.map(function (x) { return x.pattern; })));
    rfHOKey('z', { ctrlKey: true }); await idle();
    var gB = anvil.drawing.hatchRegions(sv.id);
    assert(gB[0].areaHatch && gB[0].pattern === 'ANSI37' && !gB[1].areaHatch, 'Ctrl+Z: None undone at once ' + JSON.stringify(gB.map(function (x) { return x.pattern; })));
    rfHOKey('z', { ctrlKey: true }); await idle();
    var gC = anvil.drawing.hatchRegions(sv.id);
    assert(!gC[0].areaHatch && !gC[1].areaHatch, 'Ctrl+Z: ANSI37 undone at once ' + JSON.stringify(gC.map(function (x) { return x.pattern; })));
    await rfHOExact(); await UI.drawing.ready();
    var gD = anvil.drawing.hatchRegions(sv.id);
    assert(!gD[0].areaHatch && !gD[1].areaHatch && gD.length === 2, 'and once the exact solid is back ' + JSON.stringify(gD.map(function (x) { return x.pattern; })));
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return 'hatches undone in step with the part';
  });

  step('rfHO: (rfFD) a lasso round the top face on Anvil\'s quick result, then OpenCascade\'s exact solid swaps in: the top face\'s 4 edges and the whole hole rim stay selected (every chord of the new mesh, nothing below); Shift + the same loop clears it', async function () {
    if (!(await rfHOEngine())) return 'skipped: no OpenCascade engine';
    var keep = anvil.selectHidden(), code = 'p.units("in");\np.sketch("Top").rect(-2, -2, 4, 4).extrude(2);\np.sketch("Top", 2).circle(0, 0, 0.25).cut("through", { reverse: true });';
    try {
      anvil.selectHidden(false);
      await rfHOPart(code);
      anvil.selectionFilter({ faces: false, edges: false, vertices: false, bodies: false, components: false, sketch: false, suspended: false });
      await rfFDView('Isometric');
      // the same part again: Anvil's result shows first, OpenCascade's is on its way
      await anvil.run(code.replace('p.units', 'p.name("HOBlock2");\np.units'));
      var quick = !anvil.occt().driving;
      function topEdges() { return rfFDShown().filter(function (e) { return Math.abs(e.a[1] - 2) < 1e-6 && Math.abs(e.b[1] - 2) < 1e-6; }); }
      var nQuick = topEdges().length;
      var top = [[-2, 2, -2], [2, 2, -2], [2, 2, 2], [-2, 2, 2]].map(function (p) { return UI.worldToScreen(p); });
      var loop = rfFDLoop(top, 10, 8);
      anvil.selectionMode('lasso');
      rfFDEv('mousedown', loop[0], $('viewport'));
      for (var k = 1; k < loop.length; k++) rfFDEv('mousemove', loop[k]);
      rfFDEv('mouseup', loop[loop.length - 1]);
      var n1 = anvil.selection().length;
      assert(n1 === nQuick, 'lasso on the quick result: ' + n1 + ' of ' + nQuick + ' top edges');
      await idle(); await rfHOExact(); await wait(20);
      var sel = anvil.selection().map(function (s) { return UI.App.edges[s.index]; }), want = topEdges();
      assert(sel.every(function (e) { return e && Math.abs(e.a[1] - 2) < 1e-6 && Math.abs(e.b[1] - 2) < 1e-6; }), 'only top edges after the swap');
      var miss = want.filter(function (e) { return sel.indexOf(e) < 0; });
      assert(sel.length === want.length, 'after the swap every top edge is still selected: ' + sel.length + ' of ' + want.length + ' (quick result had ' + nQuick + '); missing ' + miss.map(function (e) { return e.mid.map(fmt).join(',') + (e.curve != null ? ' c' : '') + ' L' + fmt(e.len); }).join(' / '));
      await rfFDDrag(loop, null, { shiftKey: true });
      assert(anvil.selection().length === 0, 'Shift + the same loop clears it: ' + anvil.selection().length);
      return (quick ? 'swapped after the lasso: ' : 'exact solid was first: ') + nQuick + ' -> ' + want.length + ' top edges';
    } finally {
      anvil.selectionMode('box');
      anvil.selectHidden(keep);
    }
  });

  step('rfHO: (rfBI) on an OpenCascade part, selecting a view and a dimension leaves the SVG and DXF byte-identical', async function () {
    if (!(await rfHOEngine())) return 'skipped: no OpenCascade engine';
    await rfHODrawing('p.name("HOPlate6").units("in");\np.sketch("Front").rect(0, 0, 6, 3).extrude(0.25);');
    var svg0 = anvil.drawing.svg(), dxf0 = anvil.drawing.dxf({ version: 'R2000' });
    var S = UI.drawing.state.sheet, w = S.views[0], c = [(w.box.x0 + w.box.x1) / 2, (w.box.y0 + w.box.y1) / 2];
    sheetMouse('mousemove', c); sheetMouse('mousedown', c); sheetMouse('mouseup', c); await idle(); await wait(30);
    assert(UI.drawing.state.sel, 'a view selected');
    var d = UI.drawing.state.sheet.dims.filter(function (x) { return x.box && isFinite(x.box.x0); })[0];
    if (d) { var dc = [(d.box.x0 + d.box.x1) / 2, (d.box.y0 + d.box.y1) / 2]; sheetMouse('mousemove', dc); sheetMouse('mousedown', dc); sheetMouse('mouseup', dc); await idle(); await wait(30); }
    assert(anvil.occt().driving, 'still the exact solid');
    assert(anvil.drawing.svg() === svg0 && anvil.drawing.dxf({ version: 'R2000' }) === dxf0, 'SVG / DXF byte-identical');
    anvil.drawing.close(); await idle();
    return d ? 'view and dimension selected' : 'view selected';
  });

  step('rfHO: OpenCascade back off (as the suite runs)', async function () {
    if (!(await rfHOEngine())) return 'skipped: no OpenCascade engine';
    anvil.occt(false, { remember: false }); await idle();
    assert(!anvil.occt().on && !anvil.occt().driving, 'off');
    return 'off';
  });
