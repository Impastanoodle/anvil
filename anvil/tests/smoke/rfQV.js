  // --- rfQV (2026-11-19, lane drawviews, test-reports/2026-11-19-drawing-views.md): the drawing's View Layout tab the way
  // a detailer uses it, with mouse and key events only, on the 14 ga bracket of rfOJ (two bends, holes, a slot), ANSI B ---
  (function () {
    var T = 0.0747;
    var RFQV_BRKT = 'p.name("VW-BRKT").units("in");\np.sheet(' + T + ', 0.06, 0.44);\np.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\n' +
      'p.sketch("Top", ' + T + ').circle(1.5, -0.75, 0.1405).circle(4.5, -0.75, 0.1405).circle(3, -2, 0.25).slot(2.5, -0.9, 3.5, -0.9, 0.125).cut("through", { reverse: true });\n' +
      'p.flange(1.5, [[6, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\n' +
      'p.flange(1, [[0, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer", reverse: true });\n';
    async function rfQVDone() { await idle(); await UI.drawing.ready(); await wait(20); }
    async function rfQVClose() { if (UI.drawingActive()) { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); } }
    function rfQVMouse(type, p, extra) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m), o = { bubbles: true, cancelable: true, button: type === 'contextmenu' ? 2 : 0, buttons: type === 'mouseup' || type === 'mousemove' ? 0 : 1, clientX: q.x, clientY: q.y, detail: type === 'dblclick' ? 2 : 1 };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      (type === 'mouseup' ? W : svg).dispatchEvent(new W.MouseEvent(type, o));
    }
    function rfQVClick(p, extra) { rfQVMouse('mousemove', p, extra); rfQVMouse('mousedown', p, extra); rfQVMouse('mouseup', p, extra); }
    async function rfQVDrag(a, b, extra) {
      rfQVMouse('mousemove', a, extra); rfQVMouse('mousedown', a, extra);
      for (var i = 1; i <= 6; i++) { rfQVMouse('mousemove', [a[0] + (b[0] - a[0]) * i / 6, a[1] + (b[1] - a[1]) * i / 6], Object.assign({ buttons: 1 }, extra || {})); await wait(10); }
      rfQVMouse('mouseup', b, extra); await rfQVDone();
    }
    function rfQVKey(k, extra) { D.dispatchEvent(new W.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, extra || {}))); }
    function rfQVTab(name) { var t = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === name; })[0]; if (t) t.click(); return !!t; }
    function rfQVRibbon(label) {
      rfQVTab('View Layout');
      var b = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; })[0];
      assert(b, 'ribbon button ' + label + ' in ' + Array.prototype.map.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return x.getAttribute('aria-label'); }).join(' | '));
      return b;
    }
    function rfQVOK() { var b = D.querySelector('button.pm-ok'); assert(b, 'the PM\'s OK'); b.click(); }
    function rfQVRows() { return Array.prototype.slice.call(D.querySelectorAll('.menu .mi')); }
    async function rfQVCtx(p, label) {
      rfQVMouse('mousemove', p); rfQVMouse('contextmenu', p); await wait(30);
      var r = rfQVRows().filter(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().indexOf(label) === 0; })[0];
      assert(r, label + ' in the menu: ' + rfQVRows().map(function (x) { return x.textContent.trim(); }).join(' | '));
      r.dispatchEvent(new W.MouseEvent('mouseenter', { bubbles: true })); r.click(); await wait(30);
      if (UI.closeMenus) UI.closeMenus();
      await rfQVDone();
    }
    function rfQVViews() { return UI.drawing.state.sheet.views; }
    function rfQVW(id) { return rfQVViews().filter(function (w) { return w.view.id === id; })[0]; }
    function rfQVDoc(id) { return anvil.drawing.doc().views.filter(function (v) { return v.id === id; })[0]; }
    // a free spot inside the view's box (its lower-left corner, off the linework and the annotations)
    function rfQVOn(w) { return [w.box.x0 + 0.04, w.box.y0 + 0.04]; }
    function rfQVPMSelect(val) {
      var s = Array.prototype.filter.call(D.querySelectorAll('#pm select'), function (x) { return Array.prototype.some.call(x.options, function (o) { return o.value === val; }); })[0];
      assert(s, 'a PM list with ' + val);
      s.value = val; s.dispatchEvent(new W.Event('change', { bubbles: true }));
    }
    function rfQVPMCheck(label, on) {
      var r = Array.prototype.filter.call(D.querySelectorAll('#pm label'), function (l) { return l.textContent.trim() === label; })[0];
      var cb = r && (r.querySelector('input[type=checkbox]') || (r.parentNode && r.parentNode.querySelector('input[type=checkbox]')));
      assert(cb, 'PM check ' + label);
      if (cb.checked !== on) cb.click();
    }
    function rfQVPMText(label) { return Array.prototype.map.call(D.querySelectorAll('#pm .pm-group'), function (g) { return g.textContent.replace(/\s+/g, ' '); }).join(' | '); }
    async function rfQVOpen(extra) {
      await rfQVClose();
      await anvil.newPart(); await idle(); await anvil.run(RFQV_BRKT + (extra || '')); await idle();
      anvil.drawing.make({ fresh: true, autoDims: false }); await rfQVDone();
      UI.drawing.fit(); await wait(20);
    }
    // every view off the sheet by a click on it and Delete (Yes when it asks about the views made from it)
    async function rfQVClear() {
      for (var k = 0; k < 12 && rfQVViews().length; k++) {
        rfQVClick(rfQVOn(rfQVViews()[0])); await rfQVDone(); rfQVKey('Delete'); await rfQVDone();
        if (modalOpen()) { clickModalButton('Yes'); await rfQVDone(); }
      }
      assert(!rfQVViews().length, 'the sheet is empty');
    }
    function rfQVNear(a, b, tol) { return Math.abs(a - b) <= (tol || 1e-6); }

    step('rfQV: Standard 3 View from the ribbon puts Front, Top and Right on the sheet (no isometric, as SolidWorks) and keeps the views already there; dragging the Front takes Top and Right along, Top slides only up and down, Break Alignment frees it and Default Alignment lines it up again; Ctrl+Z', async function () {
      var errs0 = errors.length;
      await rfQVOpen();
      try {
        await rfQVClear();
        rfQVRibbon('Standard 3 View').click(); await rfQVDone();
        var vs = anvil.drawing.doc().views;
        assert(vs.length === 3 && vs.map(function (v) { return v.orient; }).join() === 'Front,Top,Right', 'three views: ' + vs.map(function (v) { return v.orient; }).join());
        var F = vs[0], Tp = vs[1], R = vs[2];
        assert(Tp.parent === F.id && Tp.align === 'x' && R.parent === F.id && R.align === 'y' && rfQVNear(Tp.x, F.x) && rfQVNear(R.y, F.y), 'aligned');
        // drag the Front 1 left and .5 down: Top and Right go along
        var a = rfQVOn(rfQVW(F.id)), fx = F.x, fy = F.y;
        await rfQVDrag(a, [a[0] - 1, a[1] - 0.5]);
        F = rfQVDoc(F.id); Tp = rfQVDoc(Tp.id); R = rfQVDoc(R.id);
        assert(rfQVNear(F.x, fx - 1, 0.05) && rfQVNear(F.y, fy - 0.5, 0.05), 'Front moved: ' + [F.x, F.y]);
        assert(rfQVNear(Tp.x, F.x) && rfQVNear(R.y, F.y), 'Top / Right followed: ' + [Tp.x, R.y]);
        // the Top slides up only
        var tx = Tp.x, ty = Tp.y; a = rfQVOn(rfQVW(Tp.id));
        await rfQVDrag(a, [a[0] + 1, a[1] + 0.3]);
        Tp = rfQVDoc(Tp.id);
        assert(rfQVNear(Tp.x, tx) && rfQVNear(Tp.y, ty + 0.3, 0.05), 'Top only up: ' + [Tp.x - tx, Tp.y - ty]);
        // Break Alignment, drag free, Default Alignment
        await rfQVCtx(rfQVOn(rfQVW(Tp.id)), 'Alignment ▸ Break Alignment');
        assert(!rfQVDoc(Tp.id).align, 'alignment broken');
        a = rfQVOn(rfQVW(Tp.id));
        await rfQVDrag(a, [a[0] + 1.2, a[1]]);
        assert(rfQVNear(rfQVDoc(Tp.id).x, tx + 1.2, 0.05), 'moves sideways when broken: ' + (rfQVDoc(Tp.id).x - tx));
        await rfQVCtx(rfQVOn(rfQVW(Tp.id)), 'Alignment ▸ Default Alignment');
        Tp = rfQVDoc(Tp.id);
        assert(Tp.align === 'x' && rfQVNear(Tp.x, F.x), 'lined up again: ' + [Tp.align, Tp.x, F.x]);
        // Ctrl+Z takes the Default Alignment back
        rfQVKey('z', { ctrlKey: true }); await rfQVDone(); await rfQVDone();
        assert(!rfQVDoc(Tp.id).align && rfQVNear(rfQVDoc(Tp.id).x, tx + 1.2, 0.05), 'undo: ' + JSON.stringify(rfQVDoc(Tp.id)).slice(0, 120));
        // Standard 3 View again: three more views, the first three where they were
        var before = anvil.drawing.doc().views.map(function (v) { return [v.id, v.x, v.y]; });
        rfQVRibbon('Standard 3 View').click(); await rfQVDone();
        vs = anvil.drawing.doc().views;
        assert(vs.length === 6, 'six views: ' + vs.length);
        before.forEach(function (b) { var v = rfQVDoc(b[0]); assert(v && v.x === b[1] && v.y === b[2], 'view ' + b[0] + ' kept'); });
        assert(vs[4].parent === vs[3].id && vs[5].parent === vs[3].id, 'the second set is its own family');
        rfQVKey('z', { ctrlKey: true }); await rfQVDone(); await rfQVDone();
        assert(anvil.drawing.doc().views.length === 3, 'undo the second set');
      } finally { UI.markClean(); }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'Front / Top / Right, aligned, dragged, broken and realigned';
    });

    step('rfQV: Model View (Front button, OK): the preview follows the pointer and the click places the view there; Auto-start projected view: a click right gives the Right, above the Top (aligned), at the top-right corner the Isometric (free, pictorial); the Projected View tool from a picked view; Esc ends', async function () {
      var errs0 = errors.length;
      await rfQVOpen();
      try {
        await rfQVClear();
        rfQVRibbon('Model View').click(); await wait(30);
        var fb = Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (b) { return b.textContent.trim() === 'Front'; })[0];
        assert(fb, 'the Front button');
        fb.click(); await wait(20);
        var t = rfQVPMText();
        assert(/Auto-start projected view/.test(t) && /Hidden Lines Visible/.test(t) && /Use sheet scale/.test(t), 'PM: ' + t);
        rfQVOK(); await wait(20);
        assert(UI.drawing.state.tool === 'place', 'placing');
        rfQVMouse('mousemove', [4.5, 3.6]); await wait(20);
        var P = UI.drawing.state.pending;
        assert(P && Math.hypot(P.at[0] - 4.5, P.at[1] - 3.6) < 0.05 && rfQVNear(P.w, 6, 1e-6), 'preview at the pointer, 6 wide: ' + JSON.stringify(P && [P.at, P.w]));
        rfQVClick([4.5, 3.6]); await rfQVDone();
        var F = anvil.drawing.doc().views[0];
        assert(F.orient === 'Front' && rfQVNear(F.x, 4.5, 0.05) && rfQVNear(F.y, 3.6, 0.05), 'placed at the click: ' + [F.x, F.y]);
        assert(UI.drawing.state.tool === 'project', 'auto-start projected view');
        rfQVMouse('mousemove', [11.4, 3.9]); await wait(20); rfQVClick([11.4, 3.9]); await rfQVDone();
        rfQVMouse('mousemove', [4.8, 7.4]); await wait(20); rfQVClick([4.8, 7.4]); await rfQVDone();
        rfQVMouse('mousemove', [12, 8]); await wait(20);
        var g = UI.drawing.state.pending && UI.drawing.state.pending.at && UI.drawing.projectPlacement ? UI.drawing.projectPlacement(UI.drawing.state.pending.at) : null;
        rfQVClick([12, 8]); await rfQVDone();
        var vs = anvil.drawing.doc().views;
        assert(vs.length === 4, 'four views: ' + vs.map(function (v) { return v.orient; }).join());
        var R = vs[1], Tp = vs[2], I = vs[3];
        assert(R.orient === 'Right' && R.align === 'y' && rfQVNear(R.y, F.y) && rfQVNear(R.x, 11.4, 0.05), 'Right: ' + [R.orient, R.align, R.x, R.y]);
        assert(Tp.orient === 'Top' && Tp.align === 'x' && rfQVNear(Tp.x, F.x) && rfQVNear(Tp.y, 7.4, 0.05), 'Top: ' + [Tp.orient, Tp.align, Tp.x, Tp.y]);
        var iso = W.Drawing.frameOf('Isometric'), fI = W.Drawing.viewFrame ? null : null;
        assert(I.orient === 'Isometric' && !I.align && I.parent === F.id && rfQVNear(I.x, 12, 0.05) && rfQVNear(I.y, 8, 0.05), 'Isometric at the corner: ' + JSON.stringify(I).slice(0, 200));
        assert(I.frame && Math.abs(I.frame.e[0] - iso.e[0]) < 1e-9 && Math.abs(I.frame.e[1] - iso.e[1]) < 1e-9 && Math.abs(I.frame.u[0] - iso.u[0]) < 1e-9, 'the standard isometric frame: ' + JSON.stringify(I.frame));
        assert(UI.drawing.state.tool === 'project', 'still projecting');
        rfQVKey('Escape'); await rfQVDone();
        assert(!UI.drawing.state.tool, 'Esc ends it');
        // the Projected View tool: pick the Right, place to its right (the Back)
        rfQVClick([0.6, 0.6]); await rfQVDone();
        rfQVRibbon('Projected View').click(); await wait(20);
        rfQVClick(rfQVOn(rfQVW(R.id))); await rfQVDone();
        rfQVMouse('mousemove', [15.2, 3.9]); await wait(20); rfQVClick([15.2, 3.9]); await rfQVDone();
        var B = anvil.drawing.doc().views.slice(-1)[0];
        assert(B.orient === 'Back' && B.parent === R.id && B.align === 'y' && rfQVNear(B.y, F.y), 'Back from the Right: ' + [B.orient, B.parent, B.align]);
        // drag the Front: Right, Top and the Back (aligned through the Right) follow; the Isometric stays
        var a = rfQVOn(rfQVW(F.id)), ix = I.x, iy = I.y;
        await rfQVDrag(a, [a[0] + 0.3, a[1] + 0.2]);
        F = rfQVDoc(F.id);
        assert(rfQVNear(rfQVDoc(R.id).y, F.y) && rfQVNear(rfQVDoc(Tp.id).x, F.x) && rfQVNear(rfQVDoc(B.id).y, F.y), 'children followed');
        assert(rfQVNear(rfQVDoc(I.id).x, ix) && rfQVNear(rfQVDoc(I.id).y, iy), 'the Isometric stays');
        // Break Alignment is greyed on the corner view
        rfQVMouse('mousemove', rfQVOn(rfQVW(I.id))); rfQVMouse('contextmenu', rfQVOn(rfQVW(I.id))); await wait(30);
        var row = rfQVRows().filter(function (x) { return x.textContent.indexOf('Default Alignment') >= 0; })[0];
        assert(row && (row.classList.contains('disabled') || row.getAttribute('aria-disabled') === 'true'), 'no alignment for the corner view');
        UI.closeMenus();
      } finally { UI.markClean(); }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'Front at the click, Right / Top / Isometric chained, Back projected';
    });
    // close the drawing, write the part (with it) to JSON, load that and open the drawing again: the same SVG
    async function rfQVRoundTrip() {
      var svg0 = anvil.drawing.svg(), ix = UI.drawing.state.index;
      UI.markClean(); anvil.drawing.close(); await idle();
      if (modalOpen()) clickModalButton("Don't Save");
      var json = JSON.stringify(anvil.model());
      await anvil.load(json); await idle();
      anvil.drawing.open(ix); await rfQVDone(); UI.drawing.fit(); await wait(20);
      var svg1 = anvil.drawing.svg();
      assert(svg1 === svg0, 'the SVG after save / open differs (' + svg0.length + ' -> ' + svg1.length + ')');
      return svg1.length;
    }

    step('rfQV: view Properties: the Front set to 1:2 and Hidden Lines Removed takes Top and Right along (Use parent scale / Use parent style, SolidWorks\' defaults); a Top with its own 1:1 stays; a User Defined scale typed 3:8; Hide / Show from the right-click and the FeatureManager; Lock View Position; save and open again', async function () {
      var errs0 = errors.length;
      await rfQVOpen();
      try {
        var V0 = anvil.drawing.doc().views, F = V0[0], Tp = V0[1], R = V0[2];
        assert(F.orient === 'Front' && Tp.parent === F.id && R.parent === F.id, 'Standard 3 View');
        // Front: 1:2, Hidden Lines Removed
        await rfQVCtx(rfQVOn(rfQVW(F.id)), 'Properties');
        rfQVPMSelect('1:2'); rfQVPMSelect('hlr'); rfQVOK(); await rfQVDone();
        [F.id, Tp.id, R.id].forEach(function (id) { var v = rfQVDoc(id); assert(JSON.stringify(v.scale) === '[1,2]' && v.display === 'hlr', 'view ' + id + ' at 1:2 HLR: ' + JSON.stringify([v.scale, v.display])); });
        var wT = rfQVW(Tp.id), wF = rfQVW(F.id);
        assert(rfQVNear(wT.box.x1 - wT.box.x0, wF.box.x1 - wF.box.x0, 1e-6), 'Top as wide as the Front on paper');
        // the Top's PM: Use parent scale / Use parent style shown and on; give it its own 1:1
        await rfQVCtx(rfQVOn(rfQVW(Tp.id)), 'Properties');
        var t = rfQVPMText();
        assert(/Use parent style/.test(t) && /Use parent scale/.test(t), 'Top PM: ' + t);
        var ss = Array.prototype.filter.call(D.querySelectorAll('#pm select'), function (s) { return Array.prototype.some.call(s.options, function (o) { return o.value === 'parent'; }); })[0];
        assert(ss && ss.value === 'parent', 'Use parent scale chosen: ' + (ss && ss.value));
        rfQVPMSelect('1:1'); rfQVOK(); await rfQVDone();
        assert(JSON.stringify(rfQVDoc(Tp.id).scale) === '[1,1]' && rfQVDoc(Tp.id).ownScale, 'Top 1:1 of its own');
        // Front 1:4: Right follows, Top keeps 1:1
        await rfQVCtx(rfQVOn(rfQVW(F.id)), 'Properties');
        rfQVPMSelect('1:4'); rfQVOK(); await rfQVDone();
        assert(JSON.stringify(rfQVDoc(R.id).scale) === '[1,4]' && JSON.stringify(rfQVDoc(Tp.id).scale) === '[1,1]', 'Right 1:4, Top 1:1: ' + JSON.stringify([rfQVDoc(R.id).scale, rfQVDoc(Tp.id).scale]));
        // User Defined 3:8 on the Front
        await rfQVCtx(rfQVOn(rfQVW(F.id)), 'Properties');
        rfQVPMSelect('user'); await wait(20);
        var ut = D.querySelector('#pm input[data-key="userScale"]');
        assert(ut, 'the User defined box');
        ut.value = '3:8'; ut.dispatchEvent(new W.Event('input', { bubbles: true }));
        rfQVOK(); await rfQVDone();
        assert(JSON.stringify(rfQVDoc(F.id).scale) === '[3,8]' && JSON.stringify(rfQVDoc(R.id).scale) === '[3,8]', 'Front and Right 3:8: ' + JSON.stringify(rfQVDoc(R.id).scale));
        wF = rfQVW(F.id);
        assert(rfQVNear(wF.box.x1 - wF.box.x0, 6 * 3 / 8, 0.01), 'Front 6 in at 3:8 = 2.25 on paper: ' + (wF.box.x1 - wF.box.x0));
        await rfQVCtx(rfQVOn(rfQVW(F.id)), 'Properties');
        assert(D.querySelector('#pm input[data-key="userScale"]') && D.querySelector('#pm input[data-key="userScale"]').value === '3:8', 'the PM reads it back');
        UI.pmCancel(); await rfQVDone();
        // the Top's own style: Use parent style off, Hidden Lines Visible
        await rfQVCtx(rfQVOn(rfQVW(Tp.id)), 'Properties');
        rfQVPMCheck('Use parent style', false); await wait(20);
        rfQVPMSelect('hlv'); rfQVOK(); await rfQVDone();
        assert(rfQVDoc(Tp.id).display === 'hlv' && rfQVDoc(Tp.id).ownStyle && rfQVDoc(F.id).display === 'hlr', 'Top HLV of its own');
        // Hide the Right from its right-click, Show it from its FeatureManager row
        await rfQVCtx(rfQVOn(rfQVW(R.id)), 'Hide');
        assert(rfQVDoc(R.id).hidden && !rfQVW(R.id), 'the Right is off the sheet');
        var rowR = D.querySelector('#drawing-tree .ti.dw-view-hidden');
        assert(rowR, 'a greyed FeatureManager row');
        rowR.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 40, clientY: 200 })); await wait(30);
        var sh = rfQVRows().filter(function (x) { return x.textContent.trim() === 'Show'; })[0];
        assert(sh, 'Show on the row: ' + rfQVRows().map(function (x) { return x.textContent.trim(); }).join(' | '));
        sh.click(); UI.closeMenus(); await rfQVDone();
        assert(!rfQVDoc(R.id).hidden && rfQVW(R.id), 'shown again');
        // Lock View Position: a drag does not move it; Ctrl+Z unlocks
        await rfQVCtx(rfQVOn(rfQVW(R.id)), 'Lock View Position');
        var rx = rfQVDoc(R.id).y, a = rfQVOn(rfQVW(R.id));
        await rfQVDrag(a, [a[0] + 0.5, a[1] + 0.5]);
        assert(rfQVDoc(R.id).locked && rfQVDoc(R.id).x === R.x, 'locked: not moved');
        rfQVKey('z', { ctrlKey: true }); await rfQVDone(); await rfQVDone();
        assert(!rfQVDoc(R.id).locked, 'undo unlocks');
        await rfQVCtx(rfQVOn(rfQVW(R.id)), 'Hide');
        var n = await rfQVRoundTrip();
        assert(rfQVDoc(R.id).hidden && rfQVDoc(Tp.id).ownScale && JSON.stringify(rfQVDoc(F.id).scale) === '[3,8]', 'kept in the file');
        assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
        return 'parent scale / style followed, own kept, 3:8 typed, hide / show / lock, SVG ' + n + ' chars the same after open';
      } finally { UI.markClean(); }
    });
    step('rfQV: Auxiliary View from the 45° flange\'s edge; Section View through a hole by the PM and two clicks, its cutting line dragged to the other hole (the section follows, snapped); Detail View by three clicks, a User Defined 3:1 typed, its circle dragged; Ctrl+Z', async function () {
      var errs0 = errors.length;
      await rfQVOpen('p.flange(1, [[3, ' + T + ', 0]], { position: "inside", lengthRef: "outer", angle: 45 });\n');
      try {
        var dc = anvil.drawing.doc(), F = dc.views[0], Tp = dc.views[1], R = dc.views[2], n0 = dc.views.length;
        // Auxiliary View: the PM opens with the tool; click the slanted edge in the Right view, then a side
        rfQVRibbon('Auxiliary View').click(); await wait(20);
        assert(UI.drawing.state.tool === 'aux' && /Arrow/.test(rfQVPMText()), 'Auxiliary View PM');
        var wR = rfQVW(R.id), sl = null;
        var cand = (wR.proj.all || []).filter(function (l) { var dx = l[2] - l[0], dy = l[3] - l[1], L = Math.hypot(dx, dy); return L > 0.3 && Math.abs(Math.abs(dx / L) - Math.SQRT1_2) < 0.02; });
        assert(cand.length, 'a 45° edge in the Right view');
        sl = cand[0];
        var pm = wR.toSheet([(sl[0] + sl[2]) / 2, (sl[1] + sl[3]) / 2]);
        rfQVMouse('mousemove', pm); await wait(20); rfQVClick(pm); await rfQVDone();
        assert(UI.drawing.state.pending && UI.drawing.state.pending.parent === R.id, 'edge picked: ' + JSON.stringify(UI.drawing.state.pending && UI.drawing.state.pending.edge));
        var spot = [15.2, 6.2];
        rfQVMouse('mousemove', spot); await wait(20); rfQVClick(spot); await rfQVDone();
        var A = anvil.drawing.doc().views.slice(-1)[0];
        assert(A.kind === 'aux' && A.parent === R.id && anvil.drawing.doc().views.length === n0 + 1, 'auxiliary view: ' + JSON.stringify(A).slice(0, 160));
        var wA = rfQVW(A.id);
        assert(wA && wA.proj.stats.visibleLines > 4, 'drawn');
        // Section View: vertical, OK, click on the left hole's centre in the Top view, then right of it
        var wT = rfQVW(Tp.id), holes = wT.proj.circles.visible.concat(wT.proj.circles.hidden).filter(function (c) { return Math.abs(c.r - 0.1405) < 1e-3; }).sort(function (a, b) { return a.c[0] - b.c[0]; });
        assert(holes.length >= 2, 'two .281 holes in the Top view');
        rfQVRibbon('Section View').click(); await wait(20);
        rfQVPMSelect('v'); rfQVOK(); await wait(20);
        var h0 = wT.toSheet(holes[0].c);
        rfQVMouse('mousemove', [h0[0] + 0.03, h0[1]]); await wait(20); rfQVClick([h0[0] + 0.03, h0[1]]); await rfQVDone();
        rfQVMouse('mousemove', [h0[0] - 3, h0[1]]); await wait(20); rfQVClick([h0[0] - 3, h0[1]]); await rfQVDone();
        var S = anvil.drawing.doc().views.slice(-1)[0];
        assert(S.kind === 'section' && S.parent === Tp.id && Math.abs(S.section.at - holes[0].c[0]) < 1e-9, 'section through the hole centre: ' + JSON.stringify(S.section));
        // drag its cutting line to the right hole: snapped there; the section is cut there
        var cut0 = rfQVW(S.id).proj.stats.visibleLines, h1 = wT.toSheet(holes[holes.length - 1].c);
        var yl = wT.box.y0 + 0.08, from = [h0[0], yl];
        await rfQVDrag(from, [h1[0] + 0.04, yl]);
        S = rfQVDoc(S.id);
        assert(Math.abs(S.section.at - holes[holes.length - 1].c[0]) < 1e-9, 'line dragged to the other hole: ' + S.section.at);
        assert(rfQVW(S.id) && rfQVW(S.id).proj.stats.visibleLines > 0, 'the section follows');
        rfQVKey('z', { ctrlKey: true }); await rfQVDone(); await rfQVDone();
        assert(Math.abs(rfQVDoc(S.id).section.at - holes[0].c[0]) < 1e-9, 'undo puts it back');
        // Detail View: centre on the middle hole of the Top view, radius, place
        var mid = wT.proj.circles.visible.concat(wT.proj.circles.hidden).filter(function (c) { return Math.abs(c.r - 0.25) < 1e-3; })[0];
        assert(mid, 'the .5 hole');
        var mc = wT.toSheet(mid.c);
        rfQVRibbon('Detail View').click(); await wait(20);
        rfQVClick(mc); await rfQVDone();
        rfQVMouse('mousemove', [mc[0] + 0.45, mc[1]]); await wait(10); rfQVClick([mc[0] + 0.45, mc[1]]); await rfQVDone();
        rfQVMouse('mousemove', [2.2, 2.2]); await wait(20); rfQVClick([2.2, 2.2]); await rfQVDone();
        var Dv = anvil.drawing.doc().views.slice(-1)[0];
        assert(Dv.kind === 'detail' && Dv.parent === Tp.id && Math.abs(Dv.detail.r - 0.45) < 0.05, 'detail: ' + JSON.stringify(Dv.detail));
        if (UI.hasPM && UI.hasPM()) UI.pmCancel();
        // its Properties: User Defined 3:1
        await rfQVCtx(rfQVOn(rfQVW(Dv.id)), 'Properties');
        rfQVPMSelect('user'); await wait(20);
        var ut = D.querySelector('#pm input[data-key="userScale"]'); ut.value = '3:1'; ut.dispatchEvent(new W.Event('input', { bubbles: true }));
        rfQVOK(); await rfQVDone();
        Dv = rfQVDoc(Dv.id);
        assert(JSON.stringify(Dv.scale) === '[3,1]' && /3 : 1/.test(Dv.name), 'detail 3:1: ' + Dv.name);
        // drag the detail circle by its rim .5 to the right
        var c0 = Dv.detail.c.slice(), cs = rfQVW(Tp.id).toSheet(c0), rr = Dv.detail.r * rfQVW(Tp.id).scale, rim = [cs[0] - rr * Math.SQRT1_2, cs[1] - rr * Math.SQRT1_2];
        rfQVMouse('mousemove', rim); rfQVMouse('mousedown', rim);
        var dk = UI.drawing.state.drag && UI.drawing.state.drag.kind;
        rfQVMouse('mouseup', rim); await rfQVDone();
        assert(dk === 'vhandle', 'the rim grabs the circle: ' + dk + ' ' + JSON.stringify(UI.drawing.state.sel));
        await rfQVDrag(rim, [rim[0] + 0.5, rim[1]]);
        Dv = rfQVDoc(Dv.id);
        assert(Math.abs(Dv.detail.c[0] - c0[0] - 0.5) < 0.05 && Math.abs(Dv.detail.c[1] - c0[1]) < 0.05, 'circle moved: ' + JSON.stringify([c0, Dv.detail.c]));
        assert(rfQVDoc(Tp.id).x === Tp.x, 'the Top view stayed');
        rfQVKey('z', { ctrlKey: true }); await rfQVDone(); await rfQVDone();
        assert(Math.abs(rfQVDoc(Dv.id).detail.c[0] - c0[0]) < 1e-9, 'undo');
        var n = await rfQVRoundTrip();
        assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
        return 'aux from the 45° edge, section line dragged hole to hole, detail 3:1 dragged; SVG ' + n + ' the same after open';
      } finally { UI.markClean(); }
    });
    step('rfQV: the flat pattern by Model View at 1:4 of its own; Sheet Properties 1:1 -> 1:2: the views on the sheet scale halve and stay on the sheet, the flat keeps 1:4; B -> C keeps the views in their places; Add Sheet, the Front cut (Ctrl+X) and pasted (Ctrl+V) on Sheet2 with its Top and Right; Ctrl+Z', async function () {
      var errs0 = errors.length;
      await rfQVOpen();
      try {
        var V0 = anvil.drawing.doc().views, F = V0[0], Tp = V0[1], R = V0[2];
        // Model View: the sheet-metal part opens on Flat pattern; Use custom scale 1:4; click to place
        rfQVRibbon('Model View').click(); await wait(30);
        var fl = Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (b) { return /Flat pattern/.test(b.textContent); })[0];
        assert(fl, 'the Flat pattern button');
        fl.click(); await wait(10);
        var cr = D.querySelector('#pm input[type=radio][value="custom"]');
        assert(cr, 'Use custom scale'); cr.click(); await wait(20);
        rfQVPMSelect('1:4'); rfQVOK(); await wait(20);
        rfQVMouse('mousemove', [14.6, 1.6]); await wait(20); rfQVClick([14.6, 1.6]); await rfQVDone();
        var FL = anvil.drawing.doc().views.slice(-1)[0];
        assert(FL.kind === 'flat' && JSON.stringify(FL.scale) === '[1,4]', 'flat at 1:4: ' + JSON.stringify([FL.kind, FL.scale]));
        var wid = function (id) { var w = rfQVW(id); return w.box.x1 - w.box.x0; };
        var w0 = { F: wid(F.id), fl: wid(FL.id) };
        // Sheet Properties from the sheet's right-click: 1:2
        await rfQVCtx([0.7, 10.3], 'Properties');
        var sels = D.querySelectorAll('#modal select');
        var scSel = Array.prototype.filter.call(sels, function (s) { return Array.prototype.some.call(s.options, function (o) { return o.value === '1:2'; }); })[0];
        assert(scSel, 'the scale list'); scSel.value = '1:2';
        var ap = Array.prototype.filter.call(D.querySelectorAll('#modal button'), function (b) { return /Apply/.test(b.textContent); })[0]; ap.click(); await rfQVDone();
        var dc = anvil.drawing.doc(), S = UI.drawing.state.sheet.size;
        assert(JSON.stringify(dc.sheet.scale) === '[1,2]', 'sheet 1:2');
        assert(Math.abs(wid(F.id) - w0.F / 2) < 1e-6 && Math.abs(wid(FL.id) - w0.fl) < 1e-6, 'Front halved, flat kept: ' + [wid(F.id), w0.F, wid(FL.id), w0.fl]);
        rfQVViews().forEach(function (w) { assert(w.box.x0 >= 0 && w.box.y0 >= 0 && w.box.x1 <= S[0] && w.box.y1 <= S[1], w.view.name + ' on the sheet: ' + JSON.stringify(w.box)); });
        assert(rfQVNear(rfQVDoc(Tp.id).x, rfQVDoc(F.id).x) && rfQVNear(rfQVDoc(R.id).y, rfQVDoc(F.id).y), 'still aligned');
        // B -> C: the hand-placed flat keeps its place relative to the sheet, the family stays aligned and on it
        var rel0 = [rfQVDoc(FL.id).x / S[0], rfQVDoc(FL.id).y / S[1]];
        await rfQVCtx([0.7, 10.3], 'Properties');
        var fmSel = Array.prototype.filter.call(D.querySelectorAll('#modal select'), function (s) { return Array.prototype.some.call(s.options, function (o) { return o.value === 'ANSI C'; }); })[0];
        fmSel.value = 'ANSI C'; fmSel.dispatchEvent(new W.Event('change', { bubbles: true }));
        Array.prototype.filter.call(D.querySelectorAll('#modal button'), function (b) { return /Apply/.test(b.textContent); })[0].click(); await rfQVDone();
        var S2 = UI.drawing.state.sheet.size;
        assert(S2[0] > S[0] + 1, 'ANSI C: ' + S2);
        assert(Math.abs(rfQVDoc(FL.id).x / S2[0] - rel0[0]) < 0.06 && Math.abs(rfQVDoc(FL.id).y / S2[1] - rel0[1]) < 0.06, 'flat in its place: ' + [rfQVDoc(FL.id).x / S2[0], rel0[0], rfQVDoc(FL.id).y / S2[1], rel0[1]]);
        rfQVViews().forEach(function (w) { assert(w.box.x0 >= 0 && w.box.y0 >= 0 && w.box.x1 <= S2[0] && w.box.y1 <= S2[1], w.view.name + ' on the C sheet'); });
        assert(rfQVNear(rfQVDoc(Tp.id).x, rfQVDoc(F.id).x) && rfQVNear(rfQVDoc(R.id).y, rfQVDoc(F.id).y), 'aligned on C');
        // Add Sheet (the tab), back to Sheet1, select the Front, Ctrl+X, Sheet2, Ctrl+V
        D.querySelector('#drawing-tabs .dw-add-sheet').click(); await rfQVDone();
        assert(anvil.drawing.doc().activeSheet === 1, 'on Sheet2');
        D.querySelector('#drawing-tabs .dw-sheet-tab[data-sheet="0"]').click(); await rfQVDone();
        var fx = rfQVDoc(F.id).x, fy = rfQVDoc(F.id).y;
        rfQVClick(rfQVOn(rfQVW(F.id))); await rfQVDone();
        rfQVKey('x', { ctrlKey: true }); await wait(10);
        assert(rfQVW(F.id), 'Cut leaves it until it is pasted');
        D.querySelector('#drawing-tabs .dw-sheet-tab[data-sheet="1"]').click(); await rfQVDone();
        rfQVKey('v', { ctrlKey: true }); await rfQVDone();
        var ids = rfQVViews().map(function (w) { return w.view.id; }).sort();
        assert(ids.join() === [F.id, Tp.id, R.id].sort().join(), 'Front, Top and Right on Sheet2: ' + ids);
        assert(rfQVNear(rfQVDoc(F.id).x, fx) && rfQVNear(rfQVDoc(F.id).y, fy), 'at the same place');
        rfQVKey('z', { ctrlKey: true }); await rfQVDone(); await rfQVDone();
        var t0 = D.querySelector('#drawing-tabs .dw-sheet-tab[data-sheet="0"]');
        if (t0 && !t0.classList.contains('active')) { t0.click(); await rfQVDone(); }
        assert(anvil.drawing.doc().activeSheet === 0 && rfQVW(F.id) && rfQVW(FL.id), 'undo: the Front back on Sheet1');
        assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
        return 'flat 1:4 kept, sheet 1:2 halved the rest on the sheet, B -> C in place, Front family cut / pasted to Sheet2';
      } finally { UI.markClean(); }
    });
  })();
