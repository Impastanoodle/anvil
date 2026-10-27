  // --- rfDR (2026-10-27, lane DR: the rest of the drawing views off the main thread) --- every view the
  // anvil.drawing API adds (Model View, Projected, Detail, Auxiliary, Section) and a tangent-edge change have their
  // hidden-line removal done in drawing-worker.js: the main-thread HLR (Drawing.projectView) and section cuts are
  // stubbed and counted, and must not be called.
  function rfDRWin(id) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.id === id; })[0]; }
  // counts main-thread hidden-line removal (Drawing.projectView), section cuts (sectionOf / pathSectionOf that cut,
  // sectionJob) and CSG intersects while fn runs
  async function rfDRNoHlr(fn) {
    var Dr = W.Drawing, P = W.CSG.prototype, n = { hlr: 0, cut: 0, csg: 0 }, keep = { v: Dr.projectView, s: Dr.sectionOf, p: Dr.pathSectionOf, j: Dr.sectionJob, i: P.intersect };
    function where(what) { if (!n.where) n.where = what + ': ' + String(new Error().stack).split('\n').slice(2, 8).join(' < '); }
    function cutting(f) { return function (mesh) { var k0 = Object.keys(mesh._drawingSections || {}).length, r = f.apply(this, arguments); if (Object.keys(mesh._drawingSections || {}).length > k0) { n.cut++; where('cut'); } return r; }; }
    Dr.projectView = function () { n.hlr++; where('projectView'); return keep.v.apply(this, arguments); };
    Dr.sectionOf = cutting(keep.s);
    Dr.pathSectionOf = cutting(keep.p);
    Dr.sectionJob = function () { n.cut++; where('sectionJob'); return keep.j.apply(this, arguments); };
    P.intersect = function () { n.csg++; where('intersect'); return keep.i.apply(this, arguments); };
    try { n.result = await fn(); } finally { Dr.projectView = keep.v; Dr.sectionOf = keep.s; Dr.pathSectionOf = keep.p; Dr.sectionJob = keep.j; P.intersect = keep.i; }
    return n;
  }

  step('rfDR: anvil.drawing addView / projectedView / detailView / auxiliaryView / sectionView and a tangent-edge change on the L-bracket: hidden lines removed in the drawing worker (main-thread projectView stubbed: never called), each awaits to the summary with its linework, one undo step each; reading a result at once still works', async function () {
    var errs0 = errors.length;
    var ex = W.AnvilExamples.filter(function (e) { return e.name === 'L-bracket'; })[0];
    var r = await UI.openExample(ex); await idle();
    assert(!r.error, 'L-bracket opened: ' + r.error);
    if (anvil.occtIdle) { await Promise.race([anvil.occtIdle(), wait(30000)]); await idle(); }   // (an OpenCascade swap of the mesh mid-call would project again)
    var mk = anvil.drawing.make({ fresh: true });
    assert(mk && typeof mk.then === 'function', 'make() is thenable');
    await mk; await UI.drawing.ready(); await idle();
    if (anvil.occtIdle) { await Promise.race([anvil.occtIdle(), wait(30000)]); await idle(); await UI.drawing.ready(); }
    for (var c = 0; c < 120 && UI.drawingInternal.workerState().cooling > 0; c++) await wait(100);   // (a worker that failed earlier in the run: wait out its pause)
    var F = dwView('Front'), T = dwView('Top'), b = rfDRWin(F.id).proj.bounds, undo0 = UI.App.undo.length, n0 = UI.drawing.state.sheet.views.length;
    var ids = {};
    var n = await rfDRNoHlr(async function () {
      var m = anvil.drawing.addView('Back');
      assert(m && typeof m.then === 'function', 'addView: a thenable summary');
      var s1 = await m; ids.model = s1.views[s1.views.length - 1].id;
      var s2 = await anvil.drawing.projectedView(F.id, 'left'); ids.proj = s2.views[s2.views.length - 1].id;
      var s3 = await anvil.drawing.detailView(F.id, { c: [b.umin, b.vmin], r: (b.umax - b.umin) / 4 }); ids.detail = s3.views[s3.views.length - 1].id;
      var s4 = await anvil.drawing.auxiliaryView(F.id, { a: [b.umin, b.vmin], b: [b.umax, b.vmax], sign: 1 }); ids.aux = s4.views[s4.views.length - 1].id;
      var s5 = await anvil.drawing.sectionView(T.id, { axis: 'v', at: (rfDRWin(T.id).proj.bounds.umin + rfDRWin(T.id).proj.bounds.umax) / 2, sign: 1 }); ids.sec = s5.views[s5.views.length - 1].id;
      return await anvil.drawing.tangent(F.id, 'visible');
    });
    var probs = { hlr: n.hlr, cut: n.cut, csg: n.csg, where: n.where, worker: UI.drawingInternal.workerState() };
    assert(n.hlr === 0 && n.cut === 0 && n.csg === 0, 'main-thread hidden-line removal / cuts: ' + JSON.stringify(probs));
    var sm = n.result, kinds = {};
    sm.views.forEach(function (v) { kinds[v.id] = v; });
    assert(sm.views.length === n0 + 5, 'views ' + sm.views.map(function (v) { return v.kind + ':' + v.orient; }).join(', '));
    assert(kinds[ids.model].kind === 'model' && kinds[ids.model].orient === 'Back', 'model view ' + JSON.stringify(kinds[ids.model]));
    assert(kinds[ids.proj].kind === 'projected' && kinds[ids.detail].kind === 'detail' && kinds[ids.aux].kind === 'aux' && kinds[ids.sec].kind === 'section',
      'kinds ' + [ids.proj, ids.detail, ids.aux, ids.sec].map(function (i) { return kinds[i].kind; }).join(' '));
    ['model', 'proj', 'detail', 'aux', 'sec'].forEach(function (k) {
      var w = rfDRWin(ids[k]);
      assert(w && !w.proj.pending && w.proj.lines.visible.length > 0, k + ' view has its linework ' + JSON.stringify(w && w.proj.stats));
    });
    assert(kinds[ids.sec].sectionArea > 0, 'section area ' + kinds[ids.sec].sectionArea);
    assert(kinds[F.id].tangent === 'visible', 'tangent ' + kinds[F.id].tangent);
    assert(UI.App.undo.length === undo0 + 6, 'one undo step each: ' + (UI.App.undo.length - undo0));
    // the synchronous fallback: reading a property at once finishes the view here and now
    var s6 = anvil.drawing.projectedView(F.id, 'down');
    assert(s6.views.length === n0 + 6 && !rfDRWin(s6.views[s6.views.length - 1].id).proj.pending, 'sync read ' + s6.views.length);
    assert(anvil.drawing.projectedView(999, 'left') === null && anvil.drawing.detailView(999, { c: [0, 0], r: 1 }) === null && anvil.drawing.auxiliaryView(999, { a: [0, 0], b: [1, 1] }) === null, 'refused: null');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return '5 views + tangent edges, 0 main-thread HLR calls';
  });

  // (rfDR2) a UI edit that needs a new projection goes to the worker too (render is lazy unless settling)
  function rfDRMenuItem(re) { return Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (x) { return re.test(x.textContent); })[0]; }
  step('rfDR: right-click a view > Tangent Edge > Tangent Edges With Font on the Chamfered block: the phantom run-outs come from the drawing worker (main-thread projectView stubbed: never called), one undo step; undo back to removed', async function () {
    var errs0 = errors.length, ex = W.AnvilExamples.filter(function (e) { return e.name === 'Chamfered block'; })[0];
    await anvil.run(ex.code); await idle();
    if (anvil.occtIdle) { await Promise.race([anvil.occtIdle(), wait(30000)]); await idle(); }
    await anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await idle();
    if (anvil.occtIdle) { await Promise.race([anvil.occtIdle(), wait(30000)]); await idle(); await UI.drawing.ready(); }
    for (var c = 0; c < 120 && UI.drawingInternal.workerState().cooling > 0; c++) await wait(100);
    try {
      var F = dwView('Front'), undo0 = UI.App.undo.length, p = paperToClient([(F.box[0] + F.box[2]) / 2, (F.box[1] + F.box[3]) / 2]);
      var n = await rfDRNoHlr(async function () {
        D.querySelector('#drawing-sheet svg').dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: p.clientX, clientY: p.clientY }));
        var it = rfDRMenuItem(/Tangent Edges With Font/);
        assert(it, 'Tangent Edges With Font in the menu');
        it.click();
        assert(UI.drawing.state.prog, 'the view is being worked out in the worker');
        await UI.drawing.ready();
        return D.querySelectorAll('#drawing-sheet g[data-layer="FRONT"] .tanfont').length;
      });
      assert(n.hlr === 0 && n.cut === 0 && n.csg === 0, 'main-thread hidden-line removal: ' + JSON.stringify({ hlr: n.hlr, where: n.where, worker: UI.drawingInternal.workerState() }));
      assert(n.result === 2 && dwView('Front').tangent === 'font', 'phantom run-outs ' + n.result);
      assert(UI.App.undo.length === undo0 + 1, 'one undo step');
      await UI.undo(); await idle(); await UI.drawing.ready();
      assert(dwView('Front').tangent === 'removed' && !D.querySelector('#drawing-sheet .tanfont'), 'undo');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return '2 phantom run-outs from the worker';
    } finally {
      if (UI.closeMenus) UI.closeMenus();
      anvil.drawing.close(); await idle();
    }
  });
