  // --- rfNL (2026-11-16, lane NL: drawing leftovers and a views audit, test-reports/2026-11-16-drawing-views.md) ---
  (function () {
    var RFNL = {
      channel: 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[4, 0.06, 1.5]]);\np.flange(1, [[0, 0.06, 1.5]]);\n' +
        'p.sketch("Top").circle(4.02, -1.5, 0.1).cut("through", { both: true });'
    };
    async function rfNLDone() { await idle(); await UI.drawing.ready(); await wait(20); }
    async function rfNLPart(code) {
      if (UI.drawingActive()) { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); }
      await anvil.newPart(); await idle();
      await anvil.run(code); await idle();
      assert(!Object.keys(anvil.summary().errors || {}).length, 'part: ' + JSON.stringify(anvil.summary().errors));
    }
    function rfNLMouse(type, p) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m), o = { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: q.x, clientY: q.y, detail: 1 };
      (type === 'mouseup' ? W : svg).dispatchEvent(new W.MouseEvent(type, o));
    }
    function rfNLClick(p) { rfNLMouse('mousemove', p); rfNLMouse('mousedown', p); rfNLMouse('mouseup', p); }
    function rfNLTab(name) { var t = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === name; })[0]; assert(t, 'tab ' + name); t.click(); }
    function rfNLBtn(label) { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; }); }
    function rfNLKey(key, shift) { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: key, shiftKey: !!shift, bubbles: true, cancelable: true })); }
    function rfNLEnd() { for (var i = 0; i < 4 && ((UI.hasPM && UI.hasPM()) || UI.drawing.state.tool); i++) UI.escapeCommand(); }

    step('rfNL: the drawing Annotation tab lists Ordinate / Baseline / Chamfer Dimension once (in the Smart Dimension flyout); each still starts its tool', async function () {
      var errs0 = errors.length;
      await rfNLPart(RFNL.channel);
      anvil.drawing.make({ fresh: true }); await rfNLDone();
      rfNLTab('Annotation'); await wait(20);
      var ids = Array.prototype.map.call(D.querySelectorAll('#ribbon-buttons [data-cmd], #ribbon-buttons [data-id]'), function (b) { return b.getAttribute('data-cmd') || b.getAttribute('data-id'); });
      ['Ordinate Dimension', 'Baseline Dimension', 'Chamfer Dimension'].forEach(function (n) {
        var bs = rfNLBtn(n);
        assert(bs.length === 1, n + ': ' + bs.length + ' buttons');
      });
      rfNLBtn('Ordinate Dimension')[0].click(); await wait(20);
      assert(UI.drawing.state.tool === 'ordinate', 'Ordinate tool: ' + UI.drawing.state.tool);
      rfNLEnd();
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      UI.markClean(); anvil.drawing.close(); await idle();
      return 'one button each';
    });

    step('rfNL: from a fitted sheet Shift+Z / Z, the wheel, Zoom to Fit and Mastercam\u2019s Unzoom zoom the sheet (they moved the hidden 3D camera)', async function () {
      var st = UI.drawing.state, errs0 = errors.length;
      await rfNLPart(RFNL.channel);
      anvil.drawing.make({ fresh: true }); await rfNLDone();
      UI.drawing.fit(); await wait(20);
      var w0 = st.vb.w, out = [];
      rfNLKey('Z', true); await wait(30);
      assert(Math.abs(st.vb.w - w0 * 0.8) < 1e-9 * w0, 'Shift+Z zooms in: ' + st.vb.w + ' of ' + w0); out.push('Shift+Z ' + (st.vb.w / w0).toFixed(2));
      rfNLKey('z'); rfNLKey('z'); await wait(30);
      assert(Math.abs(st.vb.w - w0 * 1.25) < 1e-9 * w0, 'Z twice zooms out: ' + st.vb.w); out.push('Z Z ' + (st.vb.w / w0).toFixed(2));
      UI.zoomToFit(); await wait(30);
      assert(Math.abs(st.vb.w - w0) < 1e-9 * w0, 'Zoom to Fit: ' + st.vb.w);
      var host = D.querySelector('#drawing-sheet'), r = host.getBoundingClientRect();
      host.dispatchEvent(new W.WheelEvent('wheel', { deltaY: -100, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true })); await wait(30);
      assert(st.vb.w < w0 * 0.9, 'wheel zooms in from the fit: ' + st.vb.w); out.push('wheel ' + (st.vb.w / w0).toFixed(2));
      UI.zoomToFit(); await wait(30);
      UI.unzoom(0.5); await wait(30);
      assert(Math.abs(st.vb.w - w0 * 2) < 1e-9 * w0, 'Unzoom 50 %: ' + st.vb.w); out.push('Unzoom 50% ' + (st.vb.w / w0).toFixed(2));
      UI.zoomToFit(); await wait(30);
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      UI.markClean(); anvil.drawing.close(); await idle();
      return out.join(', ');
    });

    step('rfNL: Center Mark on a hole that has its Auto insert mark puts one mark there (the auto one hidden); a second click selects it, no third mark; undo', async function () {
      var st = UI.drawing.state, errs0 = errors.length;
      await rfNLPart(RFNL.channel);
      anvil.drawing.make({ fresh: true }); await rfNLDone();
      UI.drawing.fit(); await wait(20);
      var w = st.sheet.views.filter(function (x) { return x.view.orient === 'Top'; })[0];
      var circ = st.sheet.prims.filter(function (p) { return p.layer === w.layer && p.k === 'circle'; })[0];
      assert(circ, 'the hole in Top');
      var C = circ.c, R = circ.r, onC = [C[0] + R * Math.cos(2.2), C[1] + R * Math.sin(2.2)];
      function shown() { return (st.sheet.annotations || []).filter(function (a) { return a.type === 'centerMark' && a.view === w.view.id && !a.hidden; }); }
      assert(shown().length === 1 && shown()[0].auto, 'the Auto insert mark: ' + JSON.stringify(shown()));
      rfNLTab('Annotation'); await wait(10);
      rfNLBtn('Center Mark')[0].click(); await wait(10);
      rfNLClick(onC); await rfNLDone();
      assert(shown().length === 1 && !shown()[0].auto, 'one mark, the user\u2019s: ' + JSON.stringify(shown().map(function (a) { return a.auto; })));
      rfNLClick(onC); await rfNLDone();
      assert(shown().length === 1, 'a second click adds none: ' + shown().length);
      assert(st.sel && st.sel.kind === 'annot' && st.sel.id === shown()[0].id, 'it selects the mark: ' + JSON.stringify(st.sel));
      rfNLEnd();
      await UI.undo(); await idle(); await wait(60); await rfNLDone();
      assert(shown().length === 1 && shown()[0].auto, 'undo: the auto mark is back');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      UI.markClean(); anvil.drawing.close(); await idle();
      return 'one mark per hole';
    });
    function rfNLCtx(p, re) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m);
      rfNLMouse('mousemove', p);
      svg.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: q.x, clientY: q.y }));
      var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi')), mi = rows.filter(function (r) { return re.test(r.textContent); })[0];
      assert(mi, re + ' in the view menu: ' + rows.map(function (r) { return r.textContent.replace(/\s+/g, ' ').trim(); }).join(' | '));
      var off = mi.classList.contains('disabled') || mi.getAttribute('aria-disabled') === 'true';
      if (!off) mi.click();
      if (UI.closeMenus) UI.closeMenus();
      return !off;
    }
    function rfNLDrag(a, b) {
      sheetMouse('mousedown', a);
      var to = paperToClient(b);
      W.dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: to.clientX, clientY: to.clientY, buttons: 1 }));
      W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, clientX: to.clientX, clientY: to.clientY }));
    }
    var RFNL_PANEL = 'p.name("Panel").units("in");\np.material("Plain Carbon Steel");\np.sheet(0.0598, 0.06, 0.44);\np.sketch("Top").rect(0, -6, 36, 6).end().baseFlange();\n' +
      'p.flange(1, [[18, 0.0598, 0], [18, 0.0598, 6]], { position: "inside", lengthRef: "outer" });\np.sketch("Top", 0.0598).circle(2, -3, 0.1285).end().cut("through", { reverse: true });\n';
    step('rfNL: right-click a view \u25b8 Alignment \u25b8 Break Alignment (the Top view drags freely, the Front no longer carries it) / Default Alignment (lined up again); undo / redo; saved and opened again', async function () {
      var st = UI.drawing.state, errs0 = errors.length;
      await rfNLPart(RFNL_PANEL);
      anvil.drawing.make({ fresh: true }); await rfNLDone();
      UI.drawing.fit(); await wait(20);
      var sv = function (o) { return st.sheet.views.filter(function (w) { return w.view.orient === o && !w.view.kind; })[0]; };
      var at = function (w) { return [(w.box.x0 + w.box.x1) / 2 + 2, w.box.y1 - 0.05]; };
      var T = sv('Top'), tx = T.view.x, ty = T.view.y;
      assert(T.view.align === 'x', 'Top starts aligned under / over Front: ' + T.view.align);
      assert(!rfNLCtx(at(T), /Default Alignment/), 'Default Alignment greyed while aligned');
      rfNLDrag(at(T), [at(T)[0] + 1.5, at(T)[1] + 0.4]); await rfNLDone();
      assert(Math.abs(sv('Top').view.x - tx) < 1e-9 && Math.abs(sv('Top').view.y - ty - 0.4) < 0.06, 'aligned: slides up only: ' + [sv('Top').view.x - tx, sv('Top').view.y - ty]);
      assert(rfNLCtx(at(sv('Top')), /Break Alignment/), 'Break Alignment enabled'); await rfNLDone();
      assert(sv('Top').view.align == null, 'alignment broken');
      var x1 = sv('Top').view.x;
      rfNLDrag(at(sv('Top')), [at(sv('Top'))[0] + 1.5, at(sv('Top'))[1]]); await rfNLDone();
      assert(Math.abs(sv('Top').view.x - x1 - 1.5) < 0.06, 'free: moved sideways ' + (sv('Top').view.x - x1));
      var F = sv('Front'), fx = F.view.x, tx2 = sv('Top').view.x;
      rfNLDrag([(F.box.x0 + F.box.x1) / 2 + 2, F.box.y1 - 0.02], [(F.box.x0 + F.box.x1) / 2 + 1, F.box.y1 - 0.02]); await rfNLDone();
      assert(Math.abs(sv('Front').view.x - fx + 1) < 0.06 && Math.abs(sv('Top').view.x - tx2) < 1e-9, 'Front moved, Top stayed');
      assert(rfNLCtx(at(sv('Top')), /Default Alignment/), 'Default Alignment enabled'); await rfNLDone();
      assert(sv('Top').view.align === 'x' && Math.abs(sv('Top').view.x - sv('Front').view.x) < 1e-9, 'lined up over Front again');
      await UI.undo(); await idle(); await wait(60);
      assert(sv('Top').view.align == null, 'undo: broken again');
      await UI.redo(); await idle(); await wait(60);
      assert(sv('Top').view.align === 'x', 'redo: aligned');
      rfNLCtx(at(sv('Top')), /Break Alignment/); await rfNLDone();
      var json = JSON.stringify(anvil.model());
      UI.markClean(); anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save");
      await anvil.load(json); await idle(); anvil.drawing.make(); await rfNLDone();
      assert(sv('Top').view.align == null && sv('Top').view.alignWas === 'x', 'reopened: still broken, the old alignment kept');
      var dxf = anvil.drawing.dxf(), pdf = anvil.drawing.pdf();
      assert(dxf.indexOf('\n8\nTOP\n') > 0 && pdf.indexOf('%PDF-1.4') === 0, 'DXF / PDF');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      UI.markClean(); anvil.drawing.close(); await idle();
      return 'break / default alignment';
    });
  })();