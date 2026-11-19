  // --- rfQK (2026-11-19, lane drawdxf): File ▸ Make Drawing from inside a sketch whose Exit Sketch is refused
  // (UI.sketchExitGuard, lane sketchflow8) stays in the sketch instead of opening the drawing over it ---
  (function () {
    step('rfQK exit guard: Make Drawing from inside a sketch: a refused Exit Sketch keeps the sketch open, no drawing opens, the reason is shown; allowed, the sketch closes and the drawing opens', async function () {
      var asked = [];
      try {
        if (UI.drawingActive()) { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); }
        await anvil.newPart(); await idle();
        await anvil.run('p.units("in");\np.sketch("Front").rect(0, 0, 4, 2).end().extrude(0.25);'); await idle();
        await UI.newSketchOnPlane('Top'); await idle();
        assert(UI.App.mode === 'sketch', 'in a sketch');
        var n0 = (UI.App.model.drawings || []).length;
        UI.sketchExitGuard = function (sk) { asked.push(sk.id); return 'The profile must stay closed: close it first.'; };
        var r = anvil.drawing.make({ fresh: true }); await idle();
        assert(UI.App.mode === 'sketch' && asked.length === 1, 'still in the sketch, the guard asked: ' + UI.App.mode + ' ' + asked.length);
        assert(!UI.drawingActive() && (UI.App.model.drawings || []).length === n0 && !r, 'no drawing made or opened');
        var toast = Array.prototype.map.call(D.querySelectorAll('.toast'), function (x) { return x.textContent; }).join(' ');
        assert(/stay closed/.test(toast + ' ' + statusText()), 'the reason shown: ' + toast);
        UI.sketchExitGuard = null;
        anvil.drawing.make({ fresh: true }); await idle(); await UI.drawing.ready(); await wait(20);
        assert(UI.App.mode !== 'sketch' && UI.drawingActive(), 'no guard: the sketch closes and the drawing opens');
        return 'asked ' + asked.length + ', then opened';
      } finally {
        UI.sketchExitGuard = null;
        if (UI.App.mode === 'sketch' && UI.cancelSketch) { UI.cancelSketch(); await idle(); }
        if (UI.drawingActive()) { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); }
      }
    });

    // --- job 3 by the mouse: an assembly print (the 4-component weldment of smoke rfOJ's Sort step) ---
    function rfQKMouse(type, p, extra) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m), o = { bubbles: true, cancelable: true, button: type === 'contextmenu' ? 2 : 0, buttons: type === 'mouseup' || type === 'mousemove' ? 0 : 1, clientX: q.x, clientY: q.y, detail: 1 };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      (type === 'mouseup' ? W : svg).dispatchEvent(new W.MouseEvent(type, o));
    }
    function rfQKClick(p) { rfQKMouse('mousemove', p); rfQKMouse('mousedown', p); rfQKMouse('mouseup', p); }
    async function rfQKDone() { await idle(); await UI.drawing.ready(); await wait(20); }
    function rfQKEnd() { for (var i = 0; i < 4 && ((UI.hasPM && UI.hasPM()) || UI.drawing.state.tool); i++) UI.escapeCommand(); }
    function rfQKWin(id) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.id === id; })[0]; }
    function rfQKMenu(name, label) {
      var lis = D.querySelectorAll('#menus > li'), m = null;
      for (var i = 0; i < lis.length; i++) if (lis[i].textContent.trim().indexOf(name) === 0) m = lis[i];
      assert(m, 'menu ' + name);
      m.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      var hit = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (r) { return r.textContent.replace(/\s+/g, ' ').indexOf(label) >= 0; })[0];
      assert(hit, label + ' in ' + name);
      hit.click(); if (UI.closeMenus) UI.closeMenus();
    }
    function rfQKCtx(p, re) {
      rfQKMouse('mousemove', p); rfQKMouse('contextmenu', p);
      var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi')), mi = rows.filter(function (m) { return re.test(m.textContent); })[0];
      assert(mi, re + ' in the menu: ' + rows.map(function (m) { return m.textContent; }).join(' | '));
      mi.click(); if (UI.closeMenus) UI.closeMenus();
    }
    // a paper point on a visible edge of component body b in view w that picks that body, also a pixel off (or null)
    function rfQKEdgePt(w, b) {
      var t = UI.drawingInternal.pxToPaper(1), out = null;
      function sure(q) { return [[0, 0], [t, 0], [-t, 0], [0, t], [0, -t]].every(function (o) { var e = UI.drawing.edgeAt([q[0] + o[0], q[1] + o[1]]); return e && e.body === b; }); }
      w.proj.lines.visible.forEach(function (l) {
        for (var k = 0; k < 16 && !out && (b == null || (l[4] || 0) === b); k++) {
          var q = w.toSheet([l[0] + (l[2] - l[0]) * (k + 0.5) / 16, l[1] + (l[3] - l[1]) * (k + 0.5) / 16]);
          if (b == null ? UI.drawing.edgeAt(q) : sure(q)) out = q;
        }
      });
      return out;
    }
    step('rfQK job 3 by the mouse: a 4-component weldment print: Section View (vertical, Top view) with GUSSET-200 excluded in the Section View PM by a click on it; Insert ▸ Revision Table, right-click ▸ Add Revision; a Revision Symbol; a Weld Symbol and a Surface Finish attached to edges; no console errors', async function () {
      var errs0 = errors.length, st = UI.drawing.state, log = [];
      if (UI.drawingActive()) { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); }
      await anvil.newAssembly('WELD-ASM');
      await anvil.insert({ script: 'p.name("BASE-300"); p.box(200, 100, 2);' });
      await anvil.insert({ script: 'p.name("GUSSET-200"); p.box(50, 50, 2);' }, { position: [20, 2, 20] });
      await anvil.insert({ script: 'p.name("ANGLE-100"); p.box(100, 25, 2);' }, { position: [50, 2, 50] });
      await anvil.insert({ script: 'p.name("ANGLE-100"); p.box(100, 25, 2);' }, { position: [50, 2, 80] });
      await idle();
      anvil.drawing.make({ fresh: true }); await rfQKDone();
      UI.drawing.fit(); await wait(20);
      try {
        var comps = UI.App.model.components, g = -1, base = -1;
        comps.forEach(function (c, i) { if (g < 0 && /^GUSSET/.test(c.name)) g = i; if (base < 0 && /^BASE/.test(c.name)) base = i; });
        assert(g >= 0 && base >= 0, 'components ' + comps.map(function (c) { return c.name; }).join(', '));
        // Section View: PM, Line Vertical, a click on the gusset puts it in Excluded components, OK, the line, the side
        ribbonButton('Section View').click(); await idle();
        assert(UI.hasPM() && UI.pmTitle() === 'Section View', 'Section View PM');
        setInput(pmField('Line'), 'v'); await idle();
        var top = dwView('Top'), wt = rfQKWin(top.id), pick = null;
        st.sheet.views.forEach(function (w) { if (!pick && !w.view.kind) pick = rfQKEdgePt(w, g); });
        assert(pick, 'a point on a GUSSET-200 edge');
        rfQKClick(pick); await idle();
        assert(JSON.stringify(UI.pmSpec().values.excluded) === JSON.stringify([String(comps[g].id)]), 'excluded ' + JSON.stringify(UI.pmSpec().values.excluded));
        await UI.pmOK(); await idle();
        // the cutting line through the gusset's middle in the Top view
        var gl = wt.proj.lines.visible.filter(function (l) { return (l[4] || 0) === g; }), u0 = Infinity, u1 = -Infinity;
        gl.forEach(function (l) { u0 = Math.min(u0, l[0], l[2]); u1 = Math.max(u1, l[0], l[2]); });
        var B = wt.proj.bounds, cut = wt.toSheet([(u0 + u1) / 2, (B.vmin + B.vmax) / 2]);
        rfQKClick(cut); await idle();
        rfQKClick([wt.box.x1 + (wt.box.x1 - wt.box.x0) * 0.3, cut[1]]); await rfQKDone();
        var sv = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'section'; })[0];
        assert(sv && sv.hatches.length >= 1, 'a section view with hatches: ' + JSON.stringify(sv && sv.hatches));
        assert(!sv.hatches.some(function (h) { return /GUSSET/.test(h.component); }) && sv.hatches.some(function (h) { return /BASE/.test(h.component); }), 'gusset not hatched, base hatched: ' + JSON.stringify(sv.hatches));
        log.push('section ' + sv.hatches.map(function (h) { return h.component; }).join('+'));
        rfQKEnd();
        // Revision Table, a row from its right-click menu
        rfQKMenu('Insert', 'Revision Table'); await rfQKDone();
        var rv = st.sheet.revisions;
        assert(rv && rv.box, 'Revision Table');
        var u0n = UI.App.undo.length;
        rfQKCtx([(rv.box.x0 + rv.box.x1) / 2, (rv.box.y0 + rv.box.y1) / 2], /^Add Revision/); await wait(20);
        assert(UI.hasPM() && UI.pmTitle() === 'Add Revision', 'Add Revision PM');
        setInput(pmField('DESCRIPTION'), 'GUSSET ADDED');
        await UI.pmOK(); await rfQKDone();
        var s = anvil.drawing.summary();
        assert(s.revisions.rows.length === 1 && UI.App.undo.length === u0n + 1 && s.titleBlock.rev === s.revisions.rows[0].rev, 'one row, one undo step, title block REV: ' + JSON.stringify(s.revisions.rows) + ' ' + s.titleBlock.rev);
        // Revision Symbol: leader on the base in the Front view, the symbol above it
        var F = rfQKWin(dwView('Front').id), fb = F.box, fw = fb.x1 - fb.x0, fh = fb.y1 - fb.y0;
        ribbonButton('Revision Symbol').click(); await idle();
        assert(UI.pmTitle() === 'Revision Symbol', 'Revision Symbol PM');
        var fe = rfQKEdgePt(F, base);
        assert(fe, 'an edge of the base in the Front view');
        rfQKClick(fe); rfQKClick([fe[0] + fw * 0.15, fb.y1 + fh * 0.6]); await rfQKDone();
        var rs = anvil.drawing.symbols().filter(function (y) { return y.type === 'revision'; });
        assert(rs.length === 1 && rs[0].text === 'REVISION ' + s.revisions.rows[0].rev, 'revision symbol ' + JSON.stringify(rs));
        rfQKEnd();
        // Weld Symbol and Surface Finish on edges of the Front view
        var s0 = (anvil.drawing.doc().symbols || []).length;
        ribbonButton('Weld Symbol').click(); await idle();
        assert(UI.pmTitle() === 'Weld Symbol', 'Weld Symbol PM');
        var ge = rfQKEdgePt(F, g) || fe;
        rfQKClick(ge); await wait(10); rfQKMouse('mousemove', [ge[0] - fw * 0.2, fb.y1 + fh * 0.8]); rfQKClick([ge[0] - fw * 0.2, fb.y1 + fh * 0.8]); await rfQKDone();
        rfQKEnd();
        ribbonButton('Surface Finish').click(); await idle();
        rfQKClick(fe); await wait(10); rfQKMouse('mousemove', [fe[0] + fw * 0.3, fb.y0 - fh * 0.8]); rfQKClick([fe[0] + fw * 0.3, fb.y0 - fh * 0.8]); await rfQKDone();
        rfQKEnd();
        var sy = (anvil.drawing.doc().symbols || []).slice(s0);
        assert(sy.length === 2 && sy[0].type === 'weld' && sy[1].type === 'surfaceFinish', 'symbols ' + JSON.stringify(sy.map(function (y) { return y.type; })));
        assert(sy.every(function (y) { return y.leader && y.anchor; }), 'both attached to their edges: ' + JSON.stringify(sy.map(function (y) { return [y.type, y.leader, y.anchor, y.anchorTried, y.p]; })) + ' fe ' + fe + ' ge ' + ge);
        log.push('rev ' + s.revisions.rows[0].rev + ', symbols ' + sy.map(function (y) { return y.type; }).join(' '));
        var dxf = W.Drawing.toDXF(st.sheet, { version: 'R2000' });
        assert(/GUSSET ADDED/.test(dxf), 'revision row in the DXF');
        assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
        return log.join('; ');
      } finally {
        rfQKEnd();
        if (UI.drawingActive()) { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); }
      }
    });
  })();
