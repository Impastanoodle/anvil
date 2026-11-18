  // --- rfPH (2026-11-17, lane drawgaps: Broken View on a flat-pattern view with SolidWorks' five break line styles,
  // test-reports/2026-11-17-drawing-gaps.md) ---
  (function () {
    var RFPH = {
      blank: 'p.name("PH blank").units("in");\np.sheet(0.0598, 0.06, 0.44);\np.sketch("Top").rect(0, -6, 48, 6).end().baseFlange();\n' +
        'p.sketch("Top", 0.0598).circle(6, -3, 0.1405).circle(18, -3, 0.1405).circle(30, -3, 0.1405).circle(42, -3, 0.1405).cut("through", { reverse: true });\n' +
        'p.sketch("Top", 0.0598).line(2, 0, 2, -6).line(46, 0, 46, -6).sketchedBend(90);'
    };
    async function rfPHDone() { await idle(); await UI.drawing.ready(); await wait(20); }
    async function rfPHPart(code) {
      if (UI.drawingActive()) { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); }
      await anvil.newPart(); await idle();
      await anvil.run(code); await idle();
      assert(!Object.keys(anvil.summary().errors || {}).length, 'part: ' + JSON.stringify(anvil.summary().errors));
    }
    function rfPHMouse(type, p, extra) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m), o = { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: q.x, clientY: q.y, detail: 1 };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      (type === 'mouseup' ? W : svg).dispatchEvent(new W.MouseEvent(type, o));
    }
    function rfPHClick(p) { rfPHMouse('mousemove', p); rfPHMouse('mousedown', p); rfPHMouse('mouseup', p); }
    function rfPHRibbon(label) {
      var find = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; })[0]; };
      var b = find();
      if (!b) ['View Layout', 'Annotation'].some(function (t) { var tb = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === t; })[0]; if (tb) tb.click(); b = find(); return !!b; });
      assert(b, 'ribbon button ' + label);
      return b;
    }
    function rfPHFlat() { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.kind === 'flat'; })[0]; }
    function rfPHEnd() { for (var i = 0; i < 4 && ((UI.hasPM && UI.hasPM()) || UI.drawing.state.tool); i++) UI.escapeCommand(); }

    step('rfPH: Break on a 48 in flat-pattern view: the PropertyManager lists SolidWorks’ five line styles, Curve Cut and a .25 gap, two clicks in the flat; the preview is the curve, the view closes up, one undo step', async function () {
      var st = UI.drawing.state, errs0 = errors.length;
      await rfPHPart(RFPH.blank);
      anvil.drawing.make({ fresh: true }); await rfPHDone();
      var fw = rfPHFlat();
      if (!fw) { var t1 = D.querySelector('#drawing-tabs .dw-sheet-tab[data-sheet="1"]'); if (t1) { t1.click(); await rfPHDone(); } fw = rfPHFlat(); }
      if (!fw) { anvil.drawing.flatView(); await rfPHDone(); fw = rfPHFlat(); }
      assert(fw, 'a flat-pattern view: ' + st.sheet.views.map(function (w) { return w.view.kind || w.view.orient; }).join(','));
      UI.drawing.fit(); await wait(20);
      var id = fw.view.id, w0 = fw.box.x1 - fw.box.x0, bb = fw.flat.bbox, vm = (bb.vmin + bb.vmax) / 2, sc = fw.scale;
      rfPHRibbon('Break').click(); await wait(30);
      var sel = D.querySelector('#pm select[data-key="style"]');
      assert(sel, 'Break line style list');
      var names = Array.prototype.map.call(sel.options, function (o) { return o.textContent; });
      assert(names.join(', ') === 'Straight Cut, Curve Cut, Zig Zag Cut, Small Zig Zag Cut, Jagged Cut', 'styles: ' + names.join(', '));
      setInput(sel, 'curve');
      setInput(D.querySelector('#pm input[data-key="gap"]'), '.25');
      await UI.pmOK(); await wait(20);
      assert(st.tool === 'brk', 'placing break lines: ' + st.tool);
      var p1 = fw.toSheet([bb.umin + 10, vm]), p2 = fw.toSheet([bb.umin + 38, vm]);
      rfPHClick(p1); await wait(20);
      rfPHMouse('mousemove', [p2[0] - 0.3, p2[1]], { buttons: 0 }); await wait(30);
      var pv = Array.prototype.filter.call(D.querySelectorAll('#drawing-sheet polyline.dw-break'), function (x) { return x.getAttribute('points').split(' ').length > 12; });
      assert(st.preview && st.preview.kind === 'break' && pv.length === 2, 'two curved break lines follow the pointer: ' + pv.length + ' ' + JSON.stringify(st.preview));
      rfPHClick(p2); await rfPHDone();
      var v = anvil.drawing.doc().views.filter(function (x) { return x.id === id; })[0];
      assert(v.breaks && v.breaks.length === 1 && v.breaks[0].style === 'curve' && Math.abs(v.breaks[0].gap - 0.25) < 1e-12, 'break: ' + JSON.stringify(v.breaks));
      assert(Math.abs(v.breaks[0].a - (bb.umin + 10)) < 0.5 && Math.abs(v.breaks[0].b - (bb.umin + 38)) < 0.5, 'where clicked: ' + v.breaks[0].a + ' .. ' + v.breaks[0].b);
      var w1 = rfPHFlat(), arcs = st.sheet.prims.filter(function (p) { return p.breakLine && p.k === 'arc'; });
      assert(Math.abs((w1.box.x1 - w1.box.x0) - (w0 - ((v.breaks[0].b - v.breaks[0].a) * sc - 0.25))) < 1e-6, 'closed up: ' + (w1.box.x1 - w1.box.x0) + ' from ' + w0);
      assert(arcs.length >= 4, 'Curve Cut arcs on the sheet: ' + arcs.length);
      var svg = D.querySelector('#drawing-sheet svg').innerHTML;
      assert(/<path[^>]*d="M[^"]*A/.test(svg) || / A /.test(svg), 'the arcs drawn');
      rfPHEnd();
      await UI.undo(); await rfPHDone(); await rfPHDone();
      var vu = anvil.drawing.doc().views.filter(function (x) { return x.id === id; })[0];
      assert(!vu.breaks || !vu.breaks.length, 'undo takes the break off');
      await UI.redo(); await rfPHDone();
      assert((anvil.drawing.doc().views.filter(function (x) { return x.id === id; })[0].breaks || []).length === 1, 'redo puts it back');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      UI.markClean(); anvil.drawing.close(); await idle();
      return 'paper ' + w0.toFixed(3) + ' -> ' + (w1.box.x1 - w1.box.x0).toFixed(3) + ' in, ' + arcs.length + ' arcs';
    });

    step('rfPH: a flat broken with Jagged Cut: its DXF carries the break lines; the flat view\'s right-click menu offers Un-Break View, which gives the whole flat back', async function () {
      var st = UI.drawing.state, errs0 = errors.length;
      await rfPHPart(RFPH.blank);
      anvil.drawing.make({ fresh: true }); await rfPHDone();
      var fw = rfPHFlat();
      if (!fw) { var t1 = D.querySelector('#drawing-tabs .dw-sheet-tab[data-sheet="1"]'); if (t1) { t1.click(); await rfPHDone(); } fw = rfPHFlat(); }
      if (!fw) { anvil.drawing.flatView(); await rfPHDone(); fw = rfPHFlat(); }
      assert(fw, 'a flat view');
      var id = fw.view.id, bb = fw.flat.bbox;
      anvil.drawing.breakView(id, { dir: 'vertical', a: bb.umin + 10, b: bb.umin + 38, style: 'jagged' }); await rfPHDone();
      UI.drawing.fit(); await wait(20);
      var w = rfPHFlat(), c = [w.box.x0 + 0.2, (w.box.y0 + w.box.y1) / 2];
      rfPHMouse('mousemove', c, { buttons: 0 }); await wait(10);
      rfPHMouse('contextmenu', c, { button: 2, buttons: 2 }); await wait(30);
      var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi')), ub = rows.filter(function (r) { return r.textContent.replace(/\s+/g, ' ').trim() === 'Un-Break View'; })[0];
      assert(ub && !ub.classList.contains('disabled'), 'Un-Break View in the menu: ' + rows.map(function (r) { return r.textContent.trim(); }).join(' | ').slice(0, 400));
      var dxf = W.Drawing.toDXF(st.sheet, { version: 'R2000' }), nBreak = st.sheet.prims.filter(function (p) { return p.breakLine; }).length;
      // (two break lines across the 6 in blank at its scale, a tooth every 2 to 5 mm)
      assert(nBreak >= 10 && (dxf.match(/\nLINE\r?\n/g) || []).length > nBreak, 'jagged break lines in the DXF: ' + nBreak);
      ub.click(); if (UI.closeMenus) UI.closeMenus(); await rfPHDone();
      assert(!(anvil.drawing.doc().views.filter(function (x) { return x.id === id; })[0].breaks || []).length, 'Un-Break');
      var w2 = rfPHFlat();
      assert(w2.box.x1 - w2.box.x0 > w.box.x1 - w.box.x0 + 1, 'the whole flat again');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      UI.markClean(); anvil.drawing.close(); await idle();
      return nBreak + ' jagged break segments; un-broken';
    });

    step('rfPH: Detail View on a flat-pattern view by the mouse (centre on the UP bend\'s end, a point for the radius, a click to place): DETAIL A at 2 : 1 with the bend line on BEND_UP; one undo step', async function () {
      var st = UI.drawing.state, errs0 = errors.length;
      await rfPHPart('p.units("in");\np.sheet(0.0747, 0.06, 0.44);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.sketch("Top", 0.0747).circle(3.5, -2.5, 0.125).cut("through", { reverse: true });\n' +
        'p.flange(1, [[4, 0.0747, 1.5]], { position: "inside", lengthRef: "outer" });\np.flange(1, [[0, 0.0747, 1.5]], { position: "inside", lengthRef: "outer", reverse: true });');
      anvil.drawing.make({ fresh: true }); await rfPHDone();
      var fw = rfPHFlat();
      if (!fw) { var t1 = D.querySelector('#drawing-tabs .dw-sheet-tab[data-sheet="1"]'); if (t1) { t1.click(); await rfPHDone(); } fw = rfPHFlat(); }
      if (!fw) { anvil.drawing.flatView(); await rfPHDone(); fw = rfPHFlat(); }
      assert(fw, 'a flat view');
      UI.drawing.fit(); await wait(20);
      var n0 = anvil.drawing.doc().views.length, ub = fw.flat.bends.filter(function (b) { return b.up; })[0];
      var C = fw.toSheet([ub.a[0], -2.6]), Rp = fw.toSheet([ub.a[0] + 0.6, -2.6]);
      // placed beside the flat, in clear paper
      var S = st.sheet.size, place = [Math.min(S[0] - 2.5, fw.box.x1 + 2.2), fw.box.y1 - 0.5];
      rfPHRibbon('Detail View').click(); await wait(30);
      assert(st.tool === 'detail', 'detail tool: ' + st.tool);
      rfPHClick(C); await wait(10);
      assert(st.pending && st.pending.parent === fw.view.id, 'the flat is the parent: ' + (st.pending && st.pending.parent));
      rfPHClick(Rp); await wait(10);
      rfPHMouse('mousemove', place, { buttons: 0 }); await wait(20);
      rfPHClick(place); await rfPHDone();
      var views = anvil.drawing.doc().views, dv = views[views.length - 1];
      assert(views.length === n0 + 1 && dv.kind === 'detail' && dv.parent === fw.view.id, 'a detail of the flat: ' + JSON.stringify(dv && { kind: dv.kind, parent: dv.parent }));
      assert(Math.abs(dv.detail.r - 0.6) < 0.05, 'radius from the clicks: ' + dv.detail.r);
      var bl = st.sheet.prims.filter(function (p) { return p.view === dv.id && p.layer === 'BEND_UP'; });
      var tx = st.sheet.prims.filter(function (p) { return p.k === 'text'; }).map(function (p) { return p.text; });
      assert(bl.length === 1 && tx.indexOf('DETAIL ' + dv.label) >= 0 && tx.indexOf('SCALE 2 : 1') >= 0, 'bend line ' + bl.length + ', ' + tx.filter(function (t) { return /DETAIL|SCALE/.test(t); }).join(' | '));
      rfPHEnd();
      await UI.undo(); await rfPHDone(); await rfPHDone();
      assert(anvil.drawing.doc().views.length === n0, 'undo takes it off');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      UI.markClean(); anvil.drawing.close(); await idle();
      return dv.name + ', r ' + dv.detail.r.toFixed(3);
    });
  })();
