  // --- rfPM (2026-11-18, lane drawgaps2: Crop View of a flat by a sketched profile, Edit Crop / Remove Crop; drawing
  // Blocks; Alternate Position View; test-reports/2026-11-17-drawing-gaps.md) ---
  (function () {
    var RFPM = {
      blank: 'p.name("PM blank").units("in");\np.sheet(0.0598, 0.06, 0.44);\np.sketch("Top").rect(0, -6, 48, 6).end().baseFlange();\n' +
        'p.sketch("Top", 0.0598).circle(6, -3, 0.1405).circle(18, -3, 0.1405).circle(30, -3, 0.1405).circle(42, -3, 0.1405).cut("through", { reverse: true });\n' +
        'p.sketch("Top", 0.0598).line(2, 0, 2, -6).line(46, 0, 46, -6).sketchedBend(90);'
    };
    async function rfPMDone() { await idle(); await UI.drawing.ready(); await wait(20); }
    async function rfPMPart(code) {
      if (UI.drawingActive()) { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); }
      await anvil.newPart(); await idle();
      await anvil.run(code); await idle();
      assert(!Object.keys(anvil.summary().errors || {}).length, 'part: ' + JSON.stringify(anvil.summary().errors));
    }
    function rfPMMouse(type, p, extra) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m), o = { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: q.x, clientY: q.y, detail: 1 };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      (type === 'mouseup' ? W : svg).dispatchEvent(new W.MouseEvent(type, o));
    }
    function rfPMClick(p) { rfPMMouse('mousemove', p, { buttons: 0 }); rfPMMouse('mousedown', p); rfPMMouse('mouseup', p); }
    function rfPMRibbon(label, tabs) {
      var find = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; })[0]; };
      var b = find();
      if (!b) (tabs || ['View Layout', 'Annotation', 'Sketch']).some(function (t) { var tb = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === t; })[0]; if (tb) tb.click(); b = find(); return !!b; });
      assert(b, 'ribbon button ' + label);
      return b;
    }
    // right-click at p, the menu row named label (clicked when click)
    async function rfPMCtx(p, label, click) {
      rfPMMouse('mousemove', p, { buttons: 0 }); await wait(10);
      rfPMMouse('contextmenu', p, { button: 2, buttons: 2 }); await wait(30);
      var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi')), r = rows.filter(function (x) { return x.textContent.replace(/\s+/g, ' ').trim() === label; })[0];
      assert(r, label + ' in the menu: ' + rows.map(function (x) { return x.textContent.trim(); }).join(' | ').slice(0, 500));
      if (click) { assert(!r.classList.contains('disabled'), label + ' enabled'); r.click(); if (UI.closeMenus) UI.closeMenus(); await rfPMDone(); }
      else if (UI.closeMenus) UI.closeMenus();
      return r;
    }
    // a menu bar menu, its row whose text holds label clicked
    function rfPMMenu(name, label) {
      var lis = D.querySelectorAll('#menus > li'), m = null;
      for (var i = 0; i < lis.length; i++) if (lis[i].textContent.trim().indexOf(name) === 0) m = lis[i];
      assert(m, 'menu ' + name);
      m.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi')), texts = rows.map(function (r) { return r.textContent.replace(/\s+/g, ' ').trim(); });
      var hit = rows.filter(function (r, j) { return texts[j].indexOf(label) >= 0; })[0];
      assert(hit, label + ' in ' + name + ': ' + texts.join(' | ').slice(0, 600));
      hit.click();
      if (UI.closeMenus) UI.closeMenus();
    }
    function rfPMFlat() { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.kind === 'flat'; })[0]; }
    function rfPMView(id) { return anvil.drawing.doc().views.filter(function (x) { return x.id === id; })[0]; }
    function rfPMEnd() { for (var i = 0; i < 4 && ((UI.hasPM && UI.hasPM()) || UI.drawing.state.tool); i++) UI.escapeCommand(); }
    async function rfPMFlatDrawing() {
      await rfPMPart(RFPM.blank);
      anvil.drawing.make({ fresh: true }); await rfPMDone();
      var fw = rfPMFlat();
      if (!fw) { var t1 = D.querySelector('#drawing-tabs .dw-sheet-tab[data-sheet="1"]'); if (t1) { t1.click(); await rfPMDone(); } fw = rfPMFlat(); }
      if (!fw) { anvil.drawing.flatView(); await rfPMDone(); fw = rfPMFlat(); }
      assert(fw, 'a flat-pattern view');
      UI.drawing.fit(); await wait(20);
      return rfPMFlat();
    }

    step('rfPM: Crop View on a flat by a sketched rectangle (Corner Rectangle in the flat, then Crop View): the flat keeps u 1 .. 20, the rectangle becomes the crop; Edit Crop gives it back as four lines, a corner dragged, Crop View again; Remove Crop; undo / redo', async function () {
      var st = UI.drawing.state, errs0 = errors.length;
      var fw = await rfPMFlatDrawing(), id = fw.view.id, bb = fw.flat.bbox, w0 = fw.box.x1 - fw.box.x0;
      var c1 = fw.toSheet([1, bb.vmin + 0.5]), c2 = fw.toSheet([20, bb.vmax - 0.5]);
      rfPMRibbon('Corner Rectangle').click(); await wait(20);
      assert(st.tool === 'sk:rect', 'rectangle tool: ' + st.tool);
      rfPMClick(c1); await wait(10); rfPMClick(c2); await rfPMDone();
      var sk = anvil.drawing.sketch.list(id).filter(function (e) { return e.t === 'line'; });
      assert(sk.length === 4 && st.sel && st.sel.kind === 'sk' && st.sel.ids.length === 4, 'four lines in the flat, selected: ' + sk.length);
      rfPMRibbon('Crop View').click(); await rfPMDone();
      var v = rfPMView(id), s = fw.scale, tol = 2 / s / 96 * 4;   // (whole pixels at fit zoom)
      assert(v.crop && v.crop.type === 'rect', 'cropped to a rectangle: ' + JSON.stringify(v.crop));
      assert(Math.abs(v.crop.a[0] - 1) < tol && Math.abs(v.crop.b[0] - 20) < tol, 'u 1 .. 20: ' + JSON.stringify(v.crop));
      assert(!anvil.drawing.sketch.list(id).length, 'the sketch became the crop');
      assert(st.tool == null, 'the rectangle tool ended: ' + st.tool);
      var w1 = rfPMFlat(), circ = st.sheet.prims.filter(function (p) { return p.k === 'circle' && p.layer === w1.layer; }).length;
      assert(Math.abs((w1.box.x1 - w1.box.x0) - 19 * s) < 0.05 && circ === 2, 'box ' + (w1.box.x1 - w1.box.x0).toFixed(3) + ' (was ' + w0.toFixed(3) + '), holes ' + circ);
      var sum = anvil.drawing.summary().views.filter(function (x) { return x.id === id; })[0];
      assert(sum.crop === 'rect', 'summary crop: ' + sum.crop);
      // undo: the rectangle back, no crop; redo
      await UI.undo(); await rfPMDone(); await rfPMDone();
      assert(!rfPMView(id).crop && anvil.drawing.sketch.list(id).filter(function (e) { return e.t === 'line'; }).length === 4, 'undo: uncropped, the rectangle back');
      await UI.redo(); await rfPMDone();
      assert(rfPMView(id).crop, 'redo');
      // Edit Crop: four lines, the whole flat, selected
      w1 = rfPMFlat();
      await rfPMCtx([(w1.box.x0 + w1.box.x1) / 2, w1.box.y0 + 0.05], 'Crop View ▸ Edit Crop', true);
      var lines = anvil.drawing.sketch.list(id).filter(function (e) { return e.t === 'line'; }), w2 = rfPMFlat();
      assert(!rfPMView(id).crop && lines.length === 4 && st.sel && st.sel.ids && st.sel.ids.length === 4, 'Edit Crop: ' + lines.length + ' lines, crop ' + JSON.stringify(rfPMView(id).crop));
      assert(w2.box.x1 - w2.box.x0 > w0 - 0.01, 'the whole flat shown again');
      // drag the upper-right corner out to u 32
      var corner = w2.toSheet([v.crop.b[0], v.crop.b[1]]), to = w2.toSheet([32, v.crop.b[1]]);
      rfPMMouse('mousemove', corner, { buttons: 0 }); await wait(10);
      rfPMMouse('mousedown', corner); rfPMMouse('mousemove', [corner[0] + 0.1, corner[1]]); rfPMMouse('mousemove', to); rfPMMouse('mouseup', to); await rfPMDone();
      rfPMRibbon('Crop View').click(); await rfPMDone();
      var v2 = rfPMView(id);
      assert(v2.crop && v2.crop.type === 'rect' && Math.abs(v2.crop.b[0] - 32) < tol * 2, 'cropped again to u 32: ' + JSON.stringify(v2.crop));
      var w3 = rfPMFlat();
      assert(st.sheet.prims.filter(function (p) { return p.k === 'circle' && p.layer === w3.layer; }).length === 3, 'holes 6, 18, 30');
      await rfPMCtx([(w3.box.x0 + w3.box.x1) / 2, w3.box.y0 + 0.05], 'Crop View ▸ Remove Crop', true);
      assert(!rfPMView(id).crop && rfPMFlat().box.x1 - rfPMFlat().box.x0 > w0 - 0.01, 'Remove Crop');
      rfPMEnd();
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      UI.markClean(); anvil.drawing.close(); await idle();
      return 'crop u ' + v.crop.a[0].toFixed(2) + ' .. ' + v.crop.b[0].toFixed(2) + ', edited to ' + v2.crop.b[0].toFixed(2);
    });

    step('rfPM: a triangle sketched with the Line tool in the flat, one of its lines selected, Crop View: a profile crop; the SVG and DXF of the sheet carry nothing of the flat outside it', async function () {
      var st = UI.drawing.state, errs0 = errors.length;
      var fw = await rfPMFlatDrawing(), id = fw.view.id, bb = fw.flat.bbox;
      var P = [fw.toSheet([0.5, bb.vmin + 0.3]), fw.toSheet([22, bb.vmin + 0.3]), fw.toSheet([0.5, bb.vmax - 0.3])];
      rfPMRibbon('Line').click(); await wait(20);
      assert(st.tool === 'sk:line', 'line tool: ' + st.tool);
      P.concat([P[0]]).forEach(function (p) { rfPMClick(p); });
      await wait(20); rfPMEnd(); await rfPMDone();
      var ls = anvil.drawing.sketch.list(id).filter(function (e) { return e.t === 'line'; });
      assert(ls.length === 3, 'three lines: ' + ls.length);
      var mid = [(P[0][0] + P[1][0]) / 2, P[0][1]];
      rfPMClick(mid); await wait(20);
      assert(st.sel && st.sel.kind === 'sk', 'a line selected');
      rfPMRibbon('Crop View').click(); await rfPMDone();
      var v = rfPMView(id);
      assert(v.crop && v.crop.type === 'poly' && v.crop.pts.length === 3, 'a profile crop: ' + JSON.stringify(v.crop));
      var w = rfPMFlat(), S = v.crop.pts.map(w.toSheet), out = 0;
      function inside(p) { for (var i = 0; i < 3; i++) { var a = S[i], b = S[(i + 1) % 3]; if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) < -1e-6) return false; } return true; }
      st.sheet.prims.forEach(function (p) { if (p.k === 'line' && (p.layer === w.layer || p.layer === 'BEND_UP') && (p.view == null || p.view === id) && !(inside(p.a) && inside(p.b))) out++; });
      assert(!out, out + ' lines of the flat outside the triangle');
      var dxf = W.Drawing.toDXF(st.sheet, { version: 'R2000' }), svg = D.querySelector('#drawing-sheet svg').innerHTML;
      assert(/BEND_UP/.test(dxf) && svg.length > 1000, 'exports');
      rfPMEnd();
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      UI.markClean(); anvil.drawing.close(); await idle();
      return 'triangle crop, ' + st.sheet.prims.filter(function (p) { return p.layer === 'BEND_UP'; }).length + ' bend line piece(s)';
    });

    // the clearest paper of w x h (sheet units) away from the views, title block, notes and dimensions
    function rfPMFree(w, h) {
      var sh = UI.drawing.state.sheet, S = sh.size, obs = W.Drawing.tbRects(S, sh.units || 'in').concat(sh.views.map(function (x) { return x.box; })), best = null, bs = -Infinity;
      (sh.annotations || []).concat(sh.notes || []).concat(sh.dims || []).forEach(function (a) { if (a.box && isFinite(a.box.x0)) obs.push(a.box); });
      function meet(a, b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }
      for (var i = 1; i < 60; i++) for (var j = 1; j < 40; j++) {
        var c = [S[0] * i / 60, S[1] * j / 40], r = { x0: c[0] - w / 2, x1: c[0] + w / 2, y0: c[1] - h / 2, y1: c[1] + h / 2 };
        if (r.x0 < 0.8 || r.y0 < 0.8 || r.x1 > S[0] - 0.8 || r.y1 > S[1] - 0.8 || obs.some(function (o) { return meet(r, o); })) continue;
        var d = Math.min.apply(null, obs.map(function (o) { return Math.max(o.x0 - r.x1, r.x0 - o.x1, o.y0 - r.y1, r.y0 - o.y1); }));
        if (d > bs) { bs = d; best = c; }
      }
      return best;
    }

    step('rfPM: Blocks: a stamp sketched on the sheet (rectangle + line), selected, Make Block (named STAMP); Insert Block at scale 2 shows its preview and places it with a click; right-click ▸ Explode Block; Save Block puts it in the library; the DXF has the BLOCK and an INSERT; undo', async function () {
      var st = UI.drawing.state, errs0 = errors.length, keep = null;
      try { keep = W.localStorage.getItem('anvil.drawingBlocks'); W.localStorage.removeItem('anvil.drawingBlocks'); } catch (e) { }
      await rfPMPart('p.units("in"); p.sketch("Front").rect(0, 0, 4, 2).circle(3, 1, 0.25).extrude(0.25);');
      anvil.drawing.make({ fresh: true }); await rfPMDone();
      UI.drawing.fit(); await wait(20);
      var c = rfPMFree(5, 3);
      assert(c, 'free paper');
      var a = [c[0] - 1, c[1] - 0.4], b = [c[0] + 1, c[1] + 0.4];
      rfPMRibbon('Corner Rectangle').click(); await wait(20);
      rfPMClick(a); await wait(10); rfPMClick(b); await rfPMDone();
      rfPMEnd();
      rfPMRibbon('Line').click(); await wait(20);
      rfPMClick([a[0] + 0.15, c[1]]); await wait(10); rfPMClick([b[0] - 0.15, c[1]]); await wait(10);
      rfPMEnd(); await rfPMDone();
      var ents = anvil.drawing.sketch.list(null).filter(function (e) { return e.t === 'line'; });
      assert(ents.length === 5, 'five lines on the sheet: ' + ents.length);
      // select them: a click on the rectangle's bottom side, then Ctrl-clicks on the others
      rfPMClick([c[0], a[1]]); await wait(10);
      [[b[0], c[1] + 0.2], [c[0], b[1]], [a[0], c[1] + 0.2], [c[0] + 0.3, c[1]]].forEach(function (p) { rfPMMouse('mousemove', p, { buttons: 0 }); rfPMMouse('mousedown', p, { ctrlKey: true }); rfPMMouse('mouseup', p, { ctrlKey: true }); });
      await wait(20);
      assert(st.sel && st.sel.kind === 'sk' && st.sel.ids.length === 5, 'five selected: ' + JSON.stringify(st.sel));
      rfPMMenu('Tools', 'Block ▸ Make…'); await wait(30);
      var nm = D.querySelector('#pm input[data-key="name"]');
      assert(nm && /^Block\d+$/.test(nm.value), 'Make Block PropertyManager with a name: ' + (nm && nm.value));
      setInput(nm, 'STAMP');
      await UI.pmOK(); await rfPMDone();
      var list = anvil.drawing.sketch.list(null);
      assert(list.length === 1 && list[0].t === 'block' && list[0].name === 'STAMP', 'one instance: ' + JSON.stringify(list.map(function (e) { return e.t + ' ' + (e.name || ''); })));
      assert(Math.abs(list[0].p[0] - a[0]) < 0.02 && Math.abs(list[0].p[1] - a[1]) < 0.02, 'insertion point at the lower-left corner: ' + JSON.stringify(list[0].p));
      assert(st.sheet.prims.filter(function (p) { return p.block === 'STAMP'; }).length === 5, 'drawn');
      // Insert Block at scale 2
      var c2 = rfPMFree(5, 2);
      rfPMMenu('Tools', 'Block ▸ Insert…'); await wait(30);
      var sel = D.querySelector('#pm select[data-key="block"]');
      assert(sel && Array.prototype.some.call(sel.options, function (o) { return o.value === 'STAMP'; }), 'STAMP listed');
      setInput(D.querySelector('#pm input[data-key="scale"]'), '2');
      await UI.pmOK(); await wait(40);
      assert(st.tool === 'sk:block', 'placing: ' + st.tool);
      rfPMMouse('mousemove', c2, { buttons: 0 }); await wait(30);
      var prev = D.querySelectorAll('#drawing-sheet .dw-blk-prev').length;
      assert(prev >= 5, 'the block follows the pointer: ' + prev);
      rfPMClick(c2); await rfPMDone();
      rfPMEnd();
      list = anvil.drawing.sketch.list(null).filter(function (e) { return e.t === 'block'; });
      var b2 = list.filter(function (e) { return e.scale === 2; })[0];
      assert(list.length === 2 && b2 && Math.abs(b2.p[0] - c2[0]) < 0.02, 'two instances, the second at scale 2 where clicked: ' + JSON.stringify(list));
      // the DXF: one BLOCK, two INSERTs
      var dxf = W.Drawing.toDXF(st.sheet, { version: 'R2000' });
      assert((dxf.match(/\nINSERT\r?\n/g) || []).length === 2 && /\nBLOCK\r?\n[\s\S]*\n2\r?\nSTAMP\r?\n/.test(dxf), 'DXF BLOCK STAMP + 2 INSERT');
      // right-click the scaled one ▸ Save Block…, then ▸ Explode Block
      var onIt = [b2.p[0], b2.p[1] + 0.4 * 2];   // its left side
      await rfPMCtx(onIt, 'Save Block…', true);
      var lib = JSON.parse(W.localStorage.getItem('anvil.drawingBlocks') || '{}');
      assert(lib.STAMP && lib.STAMP.ents.length === 5, 'in the library');
      await rfPMCtx(onIt, 'Explode Block', true);
      var after = anvil.drawing.sketch.list(null);
      assert(after.filter(function (e) { return e.t === 'block'; }).length === 1 && after.filter(function (e) { return e.t === 'line'; }).length === 5, 'exploded: ' + after.map(function (e) { return e.t; }).join(','));
      await UI.undo(); await rfPMDone(); await rfPMDone();
      assert(anvil.drawing.sketch.list(null).filter(function (e) { return e.t === 'block'; }).length === 2, 'undo: the instance back');
      rfPMEnd();
      try { if (keep != null) W.localStorage.setItem('anvil.drawingBlocks', keep); else W.localStorage.removeItem('anvil.drawingBlocks'); } catch (e) { }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      UI.markClean(); anvil.drawing.close(); await idle();
      return 'STAMP made, inserted at 2:1, saved, exploded';
    });

    step('rfPM: Alternate Position View: a block held 15 mm over a base by a Distance mate; right-click the Front view ▸ Alternate Position View…, Distance1 40, ✓: the block drawn again 25 mm higher in phantom; right-click ▸ Alternate Position ▸ Delete; undo brings it back', async function () {
      var st = UI.drawing.state, errs0 = errors.length;
      if (UI.drawingActive()) { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); }
      await anvil.newAssembly('AltAsm');
      await anvil.insert({ script: 'p.name("Base"); p.box(100, 60, 10);' });
      await anvil.insert({ script: 'p.name("Block"); p.box(20, 20, 20);' }, { position: [5, 40, 5] });
      await idle();
      await anvil.mate('distance', { component: 2, face: [10, 0, 10] }, { component: 1, face: [50, 10, 30] }, { distance: 15 });
      await anvil.mate('coincident', { component: 2, face: [0, 10, 10] }, { component: 1, face: [0, 5, 30] }, { alignment: 'aligned' });
      await anvil.mate('coincident', { component: 2, face: [10, 10, 0] }, { component: 1, face: [50, 5, 0] }, { alignment: 'aligned' });
      await idle();
      var dm = UI.App.model.mates.filter(function (m) { return m.type === 'distance'; })[0];
      assert(dm && dm.distance === 15, 'Distance1 15: ' + JSON.stringify(dm));
      anvil.drawing.make({ fresh: true }); await rfPMDone();
      UI.drawing.fit(); await wait(20);
      var fw = st.sheet.views.filter(function (w) { return w.view.orient === 'Front' && !w.view.kind; })[0];
      assert(fw, 'a Front view');
      var id = fw.view.id, inside = [(fw.box.x0 + fw.box.x1) / 2, fw.box.y0 + (fw.box.y1 - fw.box.y0) * 0.2];
      await rfPMCtx(inside, 'Alternate Position View…', true);
      var inp = D.querySelector('#pm input[data-key="m' + dm.id + '"]');
      assert(inp && +inp.value === 15, 'the Distance mate\'s value in the PropertyManager: ' + (inp && inp.value));
      setInput(inp, '40');
      await UI.pmOK(); await rfPMDone();
      var v = rfPMView(id);
      assert(v.altPositions && v.altPositions.length === 1 && v.altPositions[0].mates[dm.id] === 40, 'stored: ' + JSON.stringify(v.altPositions));
      var ph = st.sheet.prims.filter(function (p) { return p.altPos === 1; }), w = st.sheet.views.filter(function (x) { return x.view.id === id; })[0];
      assert(ph.length >= 4 && ph.every(function (p) { return p.style === 'tanfont'; }), 'phantom lines: ' + ph.length);
      var s = w.scale, top0 = Math.max.apply(null, st.sheet.prims.filter(function (p) { return p.k === 'line' && p.layer === w.layer && p.style === 'visible'; }).map(function (p) { return Math.max(p.a[1], p.b[1]); }));
      var top1 = Math.max.apply(null, ph.filter(function (p) { return p.k === 'line'; }).map(function (p) { return Math.max(p.a[1], p.b[1]); }));
      assert(Math.abs(top1 - top0 - 25 * s) < 1e-6, 'the second position 25 mm higher: ' + (top1 - top0) + ' vs ' + 25 * s);
      var svg = D.querySelector('#drawing-sheet svg').innerHTML;
      assert(/stroke-dasharray/.test(svg), 'drawn dashed');
      var sm = anvil.drawing.summary().views.filter(function (x) { return x.id === id; })[0];
      assert(sm.altPositions && sm.altPositions[0].moved.join() === 'Block<1>', 'summary: ' + JSON.stringify(sm.altPositions));
      await rfPMCtx(inside, 'Alternate Position ▸ Delete ' + v.altPositions[0].name, true);
      assert(!rfPMView(id).altPositions && !st.sheet.prims.some(function (p) { return p.altPos != null; }), 'deleted');
      await UI.undo(); await rfPMDone(); await rfPMDone();
      assert(rfPMView(id).altPositions && st.sheet.prims.some(function (p) { return p.altPos != null; }), 'undo brings it back');
      rfPMEnd();
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      UI.markClean(); anvil.drawing.close(); await idle();
      return ph.length + ' phantom lines, ' + (top1 - top0).toFixed(3) + ' higher on paper';
    });

    step('rfPM: BOM: an assembly whose bar is in two configurations with their own Description: Make Drawing shows a BOM row per configuration with that Description', async function () {
      var st = UI.drawing.state, errs0 = errors.length;
      if (UI.drawingActive()) { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); }
      await anvil.newAssembly('BomAsm');
      var BAR = 'p.name("Bar"); p.box(60, 10, 10); p.configurations([{ name: "Short", values: {} }, { name: "Long", values: {} }], "Short"); p.property("Description", "BAR 2 FT", { config: "Short" }); p.property("Description", "BAR 4 FT", { config: "Long" });';
      await anvil.insert({ script: 'p.name("Bracket"); p.box(40, 20, 3); p.property("Description", "BRACKET, 14 GA");' });
      await anvil.insert({ script: BAR }, { position: [0, 30, 0], config: 'Short' });
      await anvil.insert({ script: BAR }, { position: [0, 50, 0], config: 'Long' });
      await idle();
      anvil.drawing.make({ fresh: true }); await rfPMDone();
      var bom = anvil.drawing.summary().bom;
      assert(bom && bom.rows.length === 3, 'three rows: ' + JSON.stringify(bom && bom.rows));
      var d = bom.rows.map(function (r) { return r.description; });
      assert(d.join(' | ') === 'BRACKET, 14 GA | BAR 2 FT | BAR 4 FT', 'descriptions: ' + d.join(' | '));
      var svg = D.querySelector('#drawing-sheet svg').textContent;
      assert(svg.indexOf('BAR 4 FT') >= 0, 'on the sheet');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      UI.markClean(); anvil.drawing.close(); await idle();
      return d.join(' | ');
    });
  })();
