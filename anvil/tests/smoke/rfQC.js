  // --- rfQC (2026-11-19, lane drawflow6: drawings driven like the user): Shift+drag / Ctrl+drag a dimension to another
  // view, Autodimension ordinates beside Model Items, Bend Table off the title block ---
  (function () {
    var T = 0.0747;
    var RFQC_BRKT = 'p.name("PB-BRKT").units("in");\np.sheet(' + T + ', 0.06, 0.44);\np.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\n' +
      'p.sketch("Top", ' + T + ').circle(1.5, -1.5, 0.1405).circle(4.5, -1.5, 0.1405).circle(3, -1.5, 0.25).cut("through", { reverse: true });\n' +
      'p.flange(1.5, [[6, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\n' +
      'p.flange(1, [[0, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer", reverse: true });\n' +
      'p.flange(1, [[3, ' + T + ', 0]], { position: "inside", lengthRef: "outer", angle: 45 });\n' +
      'p.flange(1.25, [[3, ' + T + ', 3]], { position: "inside", lengthRef: "outer" });\n' +
      'p.hem(0.375, [[3, 1.25, ' + (3 - T / 2) + ']], { gap: 0.0299 });\n';
    async function rfQCDone() { await idle(); await UI.drawing.ready(); await wait(20); }
    async function rfQCClose() { if (UI.drawingActive()) { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); } }
    function rfQCMouse(type, p, extra) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m), o = { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: q.x, clientY: q.y, detail: 1 };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      (type === 'mouseup' ? W : svg).dispatchEvent(new W.MouseEvent(type, o));
    }
    // drag from a to b with the modifier keys held (mods: { shiftKey } / { ctrlKey })
    async function rfQCDrag(a, b, mods) {
      rfQCMouse('mousemove', a, Object.assign({ buttons: 0 }, mods)); rfQCMouse('mousedown', a, mods); await wait(10);
      for (var i = 1; i <= 6; i++) { rfQCMouse('mousemove', [a[0] + (b[0] - a[0]) * i / 6, a[1] + (b[1] - a[1]) * i / 6], mods); await wait(5); }
      rfQCMouse('mouseup', b, mods); await rfQCDone();
    }
    function rfQCDims(text) { return UI.drawing.state.sheet.dims.filter(function (d) { return d.text === text; }).map(function (d) { return d.view + ':' + (d.auto ? 'item' : 'user'); }).sort().join(','); }
    function rfQCDim(view, text) { return UI.drawing.state.sheet.dims.filter(function (d) { return d.view === view && d.text === text; })[0]; }
    function rfQCMid(d) { var b = d.tbox; return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; }
    function rfQCView(id) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.id === id; })[0]; }

    step('rfQC: Shift+drag the Front view\'s 1.500 onto the Right view moves it there (a dimension of the Right view, same value; the model item gone from Front); Undo puts it back; Ctrl+drag copies it; the 6.000 dropped on the Right view is refused (not true length there)', async function () {
      var st = UI.drawing.state, errs0 = errors.length, out = [];
      await rfQCClose();
      await anvil.newPart(); await idle(); await anvil.run(RFQC_BRKT); await idle();
      anvil.drawing.make({ fresh: true }); await rfQCDone();
      try {
        anvil.drawing.modelItems({}); await rfQCDone();
        assert(rfQCDims('1.500').indexOf('1:item') >= 0, 'the Front view\'s 1.500: ' + rfQCDims('1.500'));
        var d = rfQCDim(1, '1.500'), R = rfQCView(3), tgt = [R.box.x0 + 0.3 * (R.box.x1 - R.box.x0), (R.box.y0 + R.box.y1) / 2];
        await rfQCDrag(rfQCMid(d), tgt, { shiftKey: true });
        var nd = rfQCDim(3, '1.500');
        assert(nd && !nd.auto && Math.abs(nd.value - 1.5) < 1e-9 && nd.kind === 'v', 'a 1.500 of the Right view: ' + rfQCDims('1.500'));
        assert(!rfQCDim(1, '1.500'), 'gone from Front: ' + rfQCDims('1.500'));
        assert(W.Drawing.findView(anvil.drawing.doc(), 3).dims.length === 1 && anvil.drawing.doc().suppressed.length === 1, 'stored: one dimension of View3, the model item suppressed');
        out.push('moved: ' + rfQCDims('1.500'));
        var saved = JSON.parse(JSON.stringify(anvil.drawing.doc()));
        assert(saved.views.filter(function (v) { return v.id === 3; })[0].dims[0].refs.length === 2, 'saved with its two model points');
        await UI.undo(); await rfQCDone(); await rfQCDone();
        assert(rfQCDim(1, '1.500') && !rfQCDim(3, '1.500'), 'Undo: back on Front: ' + rfQCDims('1.500'));
        // Ctrl+drag: a copy
        d = rfQCDim(1, '1.500');
        await rfQCDrag(rfQCMid(d), tgt, { ctrlKey: true });
        assert(rfQCDim(1, '1.500') && rfQCDim(3, '1.500'), 'copied: ' + rfQCDims('1.500'));
        out.push('copied: ' + rfQCDims('1.500'));
        // the overall 6.000 runs along X: the Right view looks along X, so it is refused and stays on Front
        var six = st.sheet.dims.filter(function (x) { return x.view === 1 && x.kind === 'h' && x.text === '6.000'; })[0];
        assert(six, 'the 6.000');
        await rfQCDrag(rfQCMid(six), tgt, { shiftKey: true });
        assert(rfQCDims('6.000').indexOf('1:item') >= 0 && rfQCDims('6.000').indexOf('3:') < 0, 'refused: ' + rfQCDims('6.000'));
        out.push('6.000 refused');
      } finally { UI.markClean(); anvil.drawing.close(); await idle(); }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return out.join('; ');
    });
    // job 3's rest (drawing-flow-5 "Handed on"): the 4-component weldment drawn, cut, revised and symbolled
    step('rfQC: assembly print: a section through the weldment with ANGLE-100<2> excluded (each cut part hatched at its own angle, none on the excluded one), Revision Table with rev A (the title block REV follows), a revision symbol, a weld symbol and a surface finish symbol with leaders; no warning, no console error', async function () {
      var st = UI.drawing.state, errs0 = errors.length, out = [];
      await rfQCClose();
      await anvil.newAssembly('WELD-ASM');
      await anvil.insert({ script: 'p.name("BASE-300"); p.box(200, 100, 2);' });
      await anvil.insert({ script: 'p.name("GUSSET-200"); p.box(50, 50, 2);' }, { position: [20, 2, 20] });
      await anvil.insert({ script: 'p.name("ANGLE-100"); p.box(100, 25, 2);' }, { position: [50, 2, 50] });
      await anvil.insert({ script: 'p.name("ANGLE-100"); p.box(100, 25, 2);' }, { position: [50, 2, 80] });
      await idle();
      anvil.drawing.make({ fresh: true }); await rfQCDone();
      try {
        var comps = UI.App.model.components.map(function (c) { return c.id + ':' + c.name; });
        var ex = UI.App.model.components.filter(function (c) { return c.name === 'ANGLE-100<2>'; })[0];
        assert(ex, 'components: ' + comps.join(', '));
        var S = anvil.drawing.summary(), top = S.views.filter(function (v) { return v.orient === 'Top'; })[0], fr = S.views.filter(function (v) { return v.orient === 'Front'; })[0];
        // plane x = 60 cuts the base, the gusset and both angles; ANGLE-100<2> excluded
        await anvil.drawing.sectionView(top.id, { axis: 'v', at: 60, sign: 1, x: 300, y: 150, excluded: [ex.id] }); await rfQCDone();
        var w = st.sheet.views.filter(function (x) { return x.view.kind === 'section'; })[0];
        assert(w && w.hatches, 'a section view with hatches');
        var by = {}; w.hatches.forEach(function (h) { by[h.component != null ? h.component : 'base'] = h.angle; });
        assert(w.hatches.length === 3, 'three parts cut (the excluded angle not hatched): ' + JSON.stringify(w.hatches.map(function (h) { return [h.component, h.angle]; })));
        var angs = w.hatches.map(function (h) { return h.angle; });
        assert(angs.filter(function (a, i) { return angs.indexOf(a) === i; }).length === 3, 'each its own angle: ' + angs.join(', '));
        out.push('hatches ' + angs.join('/'));
        anvil.drawing.revisionTable({}); await rfQCDone();
        var rv = anvil.drawing.addRevision({ description: 'RELEASED', date: '11/19/26', approved: 'LM' }); await rfQCDone();
        assert(rv && rv.latest === 'A' && rv.rows.length === 1, 'rev A: ' + JSON.stringify(rv));
        var tbA = st.sheet.prims.some(function (p) { return p.k === 'text' && p.layer === 'SHEET' && p.text === 'A'; });
        assert(tbA, 'the title block REV reads A');
        anvil.drawing.symbol({ type: 'revision', p: [100, 100] }); await rfQCDone();
        anvil.drawing.symbol({ type: 'weld', p: [150, 120], leader: [120, 100] }); await rfQCDone();
        anvil.drawing.symbol({ type: 'surfaceFinish', p: [60, 120], leader: [70, 100], view: fr.id }); await rfQCDone();
        var sy = anvil.drawing.summary().symbols.map(function (s) { return s.text; });
        assert(sy.join('|') === 'REVISION A|WELD | ARROW SIDE FILLET|SURFACE FINISH', 'symbols: ' + sy.join('|'));
        assert(!(st.sheet.warnings || []).length, 'no warning: ' + JSON.stringify(st.sheet.warnings));
        out.push('rev A, ' + sy.length + ' symbols');
      } finally { UI.markClean(); anvil.drawing.close(); await idle(); }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return out.join('; ');
    });
  })();