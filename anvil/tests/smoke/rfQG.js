  // --- rfQG (2026-11-19, lane drawflow7: a detail print of a 14 ga bracket dimensioned by hand): Baseline and Chain
  // rows, Chamfer / angle dimensions, break lines, arrows, Center Dimension, foreshortened radius, virtual sharps, dual
  // dimensions and a tolerance, save / reopen ---
  (function () {
    var T = 0.0747;
    var RFQG_BRKT = 'p.name("DET-BRKT").units("in");\np.sheet(' + T + ', 0.06, 0.44);\np.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\n' +
      'p.sketch("Top", ' + T + ').circle(1.5, -0.75, 0.1405).circle(4.5, -0.75, 0.1405).circle(1.5, -2.25, 0.1405).circle(4.5, -2.25, 0.1405).slot(2.5, -1.5, 3.5, -1.5, 0.25).cut("through", { reverse: true });\n' +
      'p.flange(1.5, [[6, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\n' +
      'p.flange(1, [[0, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer", reverse: true });\n';
    async function rfQGDone() { await idle(); await UI.drawing.ready(); await wait(20); }
    async function rfQGClose() { if (UI.drawingActive()) { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); } }
    async function rfQGOpen(extra) {
      await rfQGClose();
      await anvil.newPart(); await idle(); await anvil.run(RFQG_BRKT + (extra || '')); await idle();
      anvil.drawing.make({ fresh: true }); await rfQGDone();
      UI.drawing.fit(); await wait(20);
    }
    function rfQGMouse(type, p, extra) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m), o = { bubbles: true, cancelable: true, button: type === 'contextmenu' ? 2 : 0, buttons: type === 'mouseup' || type === 'mousemove' ? 0 : 1, clientX: q.x, clientY: q.y, detail: type === 'dblclick' ? 2 : 1 };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      (type === 'mouseup' ? W : svg).dispatchEvent(new W.MouseEvent(type, o));
    }
    function rfQGClick(p, extra) { rfQGMouse('mousemove', p, extra); rfQGMouse('mousedown', p, extra); rfQGMouse('mouseup', p, extra); }
    async function rfQGDrag(a, b, extra) {
      rfQGMouse('mousemove', a, extra); rfQGMouse('mousedown', a, extra);
      for (var i = 1; i <= 6; i++) { rfQGMouse('mousemove', [a[0] + (b[0] - a[0]) * i / 6, a[1] + (b[1] - a[1]) * i / 6], Object.assign({ buttons: 1 }, extra || {})); await wait(10); }
      rfQGMouse('mouseup', b, extra); await rfQGDone();
    }
    function rfQGView(orient) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.orient === orient && !w.view.kind; })[0]; }
    function rfQGTab(name) { var t = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === name; })[0]; if (t) t.click(); return !!t; }
    // a row of the Annotation tab's Smart Dimension flyout ▾ (the face reset first and after)
    function rfQGFly(label) {
      UI.ribbonFlyFace('dwDim', 0); rfQGTab('Annotation');
      var c = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === 'Smart Dimension options'; })[0];
      assert(c, 'the Smart Dimension flyout ▾');
      c.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true })); c.click();
      var row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (r) { return r.textContent.indexOf(label) >= 0; })[0];
      assert(row, 'flyout entry ' + label);
      row.click(); if (UI.closeMenus) UI.closeMenus();
    }
    // zoom the sheet about paper point p with the mouse wheel (n notches in)
    async function rfQGZoom(p, n) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint(); pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m);
      for (var i = 0; i < n; i++) { svg.dispatchEvent(new W.WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: q.x, clientY: q.y, deltaY: -300 })); await wait(30); }
      await wait(100);
    }
    function rfQGOK() { var b = D.querySelector('button.pm-ok'); assert(b, 'the PM\'s OK'); b.click(); }
    function rfQGIx(pred) { var s = UI.drawing.state.sheet; for (var i = 0; i < s.dims.length; i++) if (pred(s.dims[i])) return i; return -1; }
    function rfQGTexts(ix) { return UI.drawing.state.sheet.prims.filter(function (p) { return p.k === 'text' && p.dimIx === ix; }); }
    function rfQGMid(p) { var r = W.Drawing.textRect(p); return [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]; }
    // texts of different dimensions that overlap, and dimension texts past the 10 mm border
    function rfQGClash() {
      var sh = UI.drawing.state.sheet, b = 10 / 25.4, S = sh.size, over = [], out = [];
      var R = sh.prims.filter(function (p) { return p.k === 'text' && p.dimIx != null; }).map(function (p) { return { t: p.text, d: p.dimIx, r: W.Drawing.textRect(p) }; });
      R.forEach(function (x, i) {
        if (x.r.x0 < b || x.r.y0 < b || x.r.x1 > S[0] - b || x.r.y1 > S[1] - b) out.push(x.t);
        for (var j = i + 1; j < R.length; j++) if (R[j].d !== x.d && x.r.x0 < R[j].r.x1 - 1e-3 && R[j].r.x0 < x.r.x1 - 1e-3 && x.r.y0 < R[j].r.y1 - 1e-3 && R[j].r.y0 < x.r.y1 - 1e-3) over.push(x.t + ' x ' + R[j].t);
      });
      return { over: over, out: out };
    }

    step('rfQG: detail print: Baseline Dimension from the left edge across two holes, the slot end and the right edge (Top view): equal spacing; dragging the third line re-spaces the set evenly (it moved the whole set); then a Chain Dimension row over the same holes goes where it is clear (it sat on the baseline\'s 1.500, then off the sheet)', async function () {
      var errs0 = errors.length;
      await rfQGOpen();
      try {
        var w = rfQGView('Top'), id = w.view.id;
        rfQGFly('Baseline'); await wait(20);
        assert(UI.drawing.state.tool === 'baseline', 'Baseline tool: ' + UI.drawing.state.tool);
        [[0, -1.2], [1.5 + 0.1405, -0.75], [3.5 + 0.125, -1.5], [4.5 + 0.1405, -0.75], [6, -1.2]].forEach(function (q) { rfQGClick(w.toSheet(q)); });
        rfQGOK(); await rfQGDone();
        var ix = rfQGIx(function (d) { return d.view === id && d.kind === 'baseline'; });
        assert(ix >= 0, 'a baseline set');
        var d = UI.drawing.state.sheet.dims[ix];
        assert(d.text === '1.500, 3.500, 4.500, 6.000', 'values ' + d.text);
        var P = d.blPos, s1 = P[1] - P[0];
        assert(P.length === 4 && P.every(function (x, i) { return !i || Math.abs(x - P[i - 1] - s1) < 1e-9; }), 'equal spacing: ' + P.join(', '));
        var t3 = rfQGTexts(ix)[2], c = rfQGMid(t3);
        rfQGClick([w.box.x0 - 1, w.box.y0 - 0.3]); await wait(20);
        // (rfQN) the set starts at its closest spacing (5.5 mm, kept on the sheet), above or under the view: drag the third
        // line 0.1 in outward (away from the first line), which widens the spacing. At fit zoom a pixel is .031 in, so
        // 0.1 in is about 3 px, inside the 3 px drag threshold (the press only selected the set): zoom in on it first
        var out = P[1] > P[0] ? 1 : -1;
        await rfQGZoom(c, 3);
        await rfQGDrag(c, [c[0], c[1] + out * 0.1]);
        UI.drawing.fit(); await rfQGDone();
        d = UI.drawing.state.sheet.dims[rfQGIx(function (x) { return x.view === id && x.kind === 'baseline'; })];
        var Q = d.blPos, s2 = Q[1] - Q[0];
        assert(Math.abs(Q[0] - P[0]) < 1e-9, 'the first line stays: ' + Q[0] + ' / ' + P[0]);
        assert(Math.abs(Q[2] - (P[2] + out * 0.1)) < 0.02, 'the dragged line follows the pointer: ' + Q[2] + ' / ' + (P[2] + out * 0.1));
        assert(Q.every(function (x, i) { return !i || Math.abs(x - Q[i - 1] - s2) < 1e-9; }) && out * s2 > out * s1 + 0.04, 'evenly re-spaced, wider: ' + Q.join(', '));
        var stored = W.Drawing.findView(UI.App.model.drawings[UI.drawing.state.index], id).dims.filter(function (x) { return x.kind === 'baseline'; })[0];
        assert(stored && Math.abs(stored.step - Math.abs(s2) * 25.4) < 1e-6 && !(d.stepFit > 0), 'the hand spacing is kept (not closed up again): step ' + (stored && stored.step) + ' fit ' + d.stepFit);
        await UI.undo(); await rfQGDone();
        d = UI.drawing.state.sheet.dims[rfQGIx(function (x) { return x.view === id && x.kind === 'baseline'; })];
        assert(Math.abs(d.blPos[1] - d.blPos[0] - s1) < 1e-9, 'one undo step puts the spacing back');
        rfQGFly('Chain'); await wait(20);
        assert(UI.drawing.state.tool === 'chaindim', 'Chain tool');
        [[0, -1.2], [1.5 + 0.1405, -0.75], [3.5 + 0.125, -1.5], [4.5 + 0.1405, -0.75], [6, -1.2]].forEach(function (q) { rfQGClick(w.toSheet(q)); });
        rfQGOK(); await rfQGDone();
        var ch = UI.drawing.state.sheet.dims.filter(function (x) { return x.view === id && x.kind === 'h' && !x.auto; });
        assert(ch.map(function (x) { return x.text; }).join(' ') === '1.500 2.000 1.000 1.500', 'chain ' + ch.map(function (x) { return x.text; }).join(' '));
        assert(ch.every(function (x) { return Math.abs(x.lineAt - ch[0].lineAt) < 1e-9; }), 'one line');
        var cl = rfQGClash();
        assert(!cl.over.length, 'values on each other: ' + cl.over.join(' | '));
        var chOut = ch.filter(function (x) { return rfQGTexts(UI.drawing.state.sheet.dims.indexOf(x)).some(function (p) { var r = W.Drawing.textRect(p); return r.y1 > UI.drawing.state.sheet.size[1] - 10 / 25.4; }); });
        assert(!chOut.length, 'the chain row inside the border');
      } finally { UI.ribbonFlyFace('dwDim', 0); UI.markClean(); anvil.drawing.close(); await idle(); }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'baseline spacing ' + (s1 * 25.4).toFixed(2) + ' -> ' + (s2 * 25.4).toFixed(2) + ' mm; chain row clear';
    });

    // the chamfered corner of the 1.5 flange (Right view) and the right bend
    var RFQG_CHAMFER = 'p.breakCorner(0.1, [[' + (6 - T / 2) + ', 1.5, 3]]);\n';

    step('rfQG: detail print: Chamfer Dimension on the flange corner reads .100 X 45°; Smart Dimension between the chamfer and the flange top reads 135° (placed on the part side); the bend in the Front view reads 90° (already right)', async function () {
      var errs0 = errors.length;
      await rfQGOpen(RFQG_CHAMFER);
      try {
        var R = rfQGView('Right'), F = rfQGView('Front'), n0 = UI.drawing.state.sheet.dims.length;
        await rfQGZoom(R.toSheet([-2.95, 1.45]), 3);   // (the chamfer is .14 long: a few pixels at fit zoom)
        rfQGFly('Chamfer'); await wait(20);
        rfQGClick(R.toSheet([-2.95, 1.45])); await wait(30); rfQGClick(R.toSheet([-1.5, 1.5])); await rfQGDone();
        UI.escapeCommand(); await wait(20);
        rfQGFly('Smart Dimension'); await wait(20);
        rfQGClick(R.toSheet([-2.95, 1.45])); await wait(30); rfQGClick(R.toSheet([-1.5, 1.5])); await wait(30); rfQGClick(R.toSheet([-2.5, 1.2])); await rfQGDone();
        UI.drawing.fit(); await wait(60);
        rfQGClick(F.toSheet([3, 0])); await wait(30); rfQGClick(F.toSheet([6, 0.8])); await wait(30); rfQGClick(F.toSheet([5.3, 0.6])); await rfQGDone();
        UI.escapeCommand(); await wait(20);
        var mine = UI.drawing.state.sheet.dims.filter(function (d) { return !d.auto; }).map(function (d) { return d.kind + ' ' + d.text; }).sort().join(' | ');
        assert(mine === 'angle 135° | angle 90° | chamfer .100 X 45°', mine);
        var cl = rfQGClash();
        assert(!cl.over.length, 'values on each other: ' + cl.over.join(' | '));
      } finally { UI.ribbonFlyFace('dwDim', 0); UI.markClean(); anvil.drawing.close(); await idle(); }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return mine;
    });

    step('rfQG: detail print: Break Lines ticked in the Dimension PM cuts the .750\'s extension lines where they cross the 3.000\'s line and arrow (there was no Break Lines); clicking an arrow handle flips the arrows and back; the value dragged off centre goes back with right-click ▸ Display Options ▸ Center Dimension and stays centred while the line is dragged', async function () {
      var errs0 = errors.length;
      await rfQGOpen();
      try {
        var w = rfQGView('Top'), id = w.view.id;
        var m3 = UI.drawing.state.sheet.dims.filter(function (d) { return d.view === id && d.kind === 'v' && d.auto; })[0];
        assert(m3 && m3.text === '3.000' && m3.lineAt < 0, 'the 3.000 left of the Top view');
        var x3 = w.toSheet([m3.lineAt, 0])[0];
        rfQGFly('Smart Dimension'); await wait(20);
        rfQGClick(w.toSheet([3, 0])); await wait(30); rfQGClick(w.toSheet([4.5 + 0.1405, -0.75])); await wait(30); rfQGClick(w.toSheet([m3.lineAt - 0.5, -0.4])); await rfQGDone();
        UI.escapeCommand(); await wait(20);
        var ix = UI.drawing.state.sheet.dims.length - 1, d = UI.drawing.state.sheet.dims[ix];
        assert(d.kind === 'v' && d.text === '.750', d.kind + ' ' + d.text);
        var crossing = function () { return UI.drawing.state.sheet.prims.filter(function (p) { return p.dimIx === ix && p.k === 'line' && Math.abs(p.a[1] - p.b[1]) < 1e-9 && Math.min(p.a[0], p.b[0]) < x3 && Math.max(p.a[0], p.b[0]) > x3; }).length; };
        assert(crossing() === 2, 'both extension lines run through the 3.000: ' + crossing());
        rfQGClick(rfQGMid(rfQGTexts(ix)[0])); await wait(60);
        var lab = Array.prototype.filter.call(D.querySelectorAll('#pm label, .pm label'), function (l) { return /^\s*Break Lines/.test(l.textContent); })[0];
        assert(lab, 'Break Lines in the Dimension PM: ' + Array.prototype.map.call(D.querySelectorAll('#pm label, .pm label'), function (l) { return l.textContent.trim(); }).join(' | '));
        (lab.querySelector('input') || lab).click(); await wait(40);
        rfQGOK(); await rfQGDone();
        d = UI.drawing.state.sheet.dims[ix];
        assert(d.brk === true, 'brk ' + d.brk);
        assert(crossing() === 0, 'cut at the 3.000');
        var gaps = UI.drawing.state.sheet.prims.filter(function (p) { return p.dimIx === ix && p.k === 'line' && p.brk; }).map(function (p) { return Math.min(Math.abs(p.a[0] - x3), Math.abs(p.b[0] - x3)); }).filter(function (g) { return g < 0.2; });
        assert(gaps.length === 4 && gaps.every(function (g) { return Math.abs(g - 0.0625) < 1e-6; }), 'a .0625 gap each side: ' + gaps.join(', '));
        // the arrow handles: select, click an arrow, click again
        rfQGClick(rfQGMid(rfQGTexts(ix)[0])); await rfQGDone();
        rfQGClick(UI.drawing.state.sheet.dims[ix].arrows[0]); await rfQGDone();
        assert(UI.drawing.state.sheet.dims[ix].flip === true, 'flipped by the arrow handle');
        rfQGClick(UI.drawing.state.sheet.dims[ix].arrows[0]); await rfQGDone();
        assert(!UI.drawing.state.sheet.dims[ix].flip, 'flipped back');
        UI.escapeCommand(); await wait(20);
        var c = rfQGMid(rfQGTexts(ix)[0]);
        await rfQGDrag(c, [c[0], c[1] + 0.5]);
        assert(Math.abs(UI.drawing.state.sheet.dims[ix].txNow - 0.5) < 0.02, 'dragged off centre: ' + UI.drawing.state.sheet.dims[ix].txNow);
        c = rfQGMid(rfQGTexts(ix)[0]);
        rfQGMouse('mousemove', c); rfQGMouse('contextmenu', c); await wait(30);
        var row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (r) { return /Center Dimension/.test(r.textContent); })[0];
        assert(row, 'Display Options ▸ Center Dimension on the right-click menu');
        row.click(); if (UI.closeMenus) UI.closeMenus(); await rfQGDone();
        d = UI.drawing.state.sheet.dims[ix];
        assert(d.centre && Math.abs(d.txNow) < 1e-9, 'centred: ' + d.txNow);
        var line0 = d.lineAt; c = rfQGMid(rfQGTexts(ix)[0]);
        await rfQGDrag(c, [c[0] - 0.3, c[1] + 0.4]);
        d = UI.drawing.state.sheet.dims[ix];
        assert(Math.abs(d.txNow) < 1e-9 && d.lineAt < line0 - 0.2, 'the line moves, the value stays centred: ' + d.txNow + ' / ' + d.lineAt);
        await UI.undo(); await rfQGDone(); await UI.undo(); await rfQGDone();
        assert(!UI.drawing.state.sheet.dims[ix].centre, 'undo takes Center Dimension back');
      } finally { UI.ribbonFlyFace('dwDim', 0); UI.markClean(); anvil.drawing.close(); await idle(); }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'breaks 4, flip, centre';
    });
    // a large arc on the base's back edge (R22.6, its centre 22 in off the part)
    var RFQG_ARC = 'var RA = 22.6, A0 = Math.atan2(22.4, 3) * 180 / Math.PI;\np.sketch("Top", ' + T + ').arc(3, -25.4, RA, A0, 180 - A0).line(0, -3, 6, -3).cut("through", { reverse: true });\n';
    function rfQGLabel(re) { return Array.prototype.filter.call(D.querySelectorAll('#pm label, .pm label'), function (l) { return re.test(l.textContent); })[0]; }

    step('rfQG: detail print: R22.600 on the large arc, Foreshortened ticked in its PM: a zigzag line from a false centre, the arrow on the arc (there was no Foreshortened); right-click ▸ Find Intersection on the base, then the flange: a virtual sharp, 6.000 to the left flange; a bend\'s tangent edge picked in the Right view (Tangent Edges Visible): 1.365 (it could not be picked)', async function () {
      var errs0 = errors.length;
      await rfQGClose();
      await anvil.newPart(); await idle(); await anvil.run(RFQG_BRKT.replace('p.flange(1.5', RFQG_ARC + 'p.flange(1.5')); await idle();
      anvil.drawing.make({ fresh: true }); await rfQGDone(); UI.drawing.fit(); await wait(20);
      try {
        var w = rfQGView('Top'), F = rfQGView('Front'), R = rfQGView('Right');
        rfQGFly('Smart Dimension'); await wait(20);
        rfQGClick(w.toSheet([4, -2.8])); await wait(30);
        var p = w.toSheet([4, -2.8]); rfQGClick([p[0] + 0.3, p[1] - 0.6]); await rfQGDone();
        UI.escapeCommand(); await wait(20);
        var ix = UI.drawing.state.sheet.dims.length - 1;
        assert(UI.drawing.state.sheet.dims[ix].text === 'R22.600', UI.drawing.state.sheet.dims[ix].text);
        rfQGClick(rfQGMid(rfQGTexts(ix)[0])); await wait(60);
        var lab = rfQGLabel(/^\s*Foreshortened/);
        assert(lab, 'Foreshortened in the Dimension PM');
        (lab.querySelector('input') || lab).click(); await wait(40);
        rfQGOK(); await rfQGDone();
        var L = UI.drawing.state.sheet.prims.filter(function (q) { return q.dimIx === ix && q.k === 'line'; }), tip = w.toSheet([3, -2.8]);
        assert(UI.drawing.state.sheet.dims[ix].fs && L.length === 5 && Math.hypot(L[4].b[0] - tip[0], L[4].b[1] - tip[1]) < 1e-6, 'zigzag to the arc: ' + L.length);
        // the virtual sharp
        rfQGFly('Smart Dimension'); await wait(20);
        var q = F.toSheet([3, 0]); rfQGMouse('mousemove', q); rfQGMouse('contextmenu', q); await wait(30);
        var row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (r) { return /Find Intersection/.test(r.textContent); })[0];
        assert(row, 'Find Intersection on the edge\'s right-click menu');
        row.click(); if (UI.closeMenus) UI.closeMenus(); await wait(20);
        rfQGClick(F.toSheet([6, 0.8])); await wait(30);
        rfQGClick(F.toSheet([0, -0.5])); await wait(30);
        rfQGClick(F.toSheet([1.5, 2.1])); await rfQGDone();   // (clear of the R22.600's line, which runs down at x 3)
        UI.escapeCommand(); await wait(20);
        var iv = rfQGIx(function (x) { return x.refs && x.refs[0] && x.refs[0].vs; }), dv = UI.drawing.state.sheet.dims[iv] || {};
        assert(dv.text === '6.000' && dv.refs[0].vs, 'virtual sharp: ' + dv.text);
        assert(UI.drawing.state.sheet.prims.filter(function (x) { return x.dimIx === iv && x.vsharp; }).length === 2, 'its witness lines');
        // the tangent edge: the view's right-click ▸ Tangent Edge ▸ Tangent Edges Visible, then Smart Dimension
        var rc = R.toSheet([-1.5, 0.7]); rfQGMouse('mousemove', rc); rfQGMouse('contextmenu', rc); await wait(30);
        var tr = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (r) { return /Tangent Edges Visible/.test(r.textContent); })[0];
        assert(tr, 'Tangent Edges Visible on the view\'s menu');
        tr.dispatchEvent(new W.MouseEvent('mouseenter', { bubbles: true })); tr.click(); if (UI.closeMenus) UI.closeMenus(); await rfQGDone();
        R = rfQGView('Right');
        assert(R.view.tangent === 'visible', 'tangent ' + R.view.tangent);
        rfQGFly('Smart Dimension'); await wait(20);
        rfQGClick(R.toSheet([-1.5, 0.1347])); await wait(30);
        rfQGClick(R.toSheet([-1.5, 1.5])); await wait(30);
        rfQGClick(R.toSheet([0.6, 0.8])); await rfQGDone();
        UI.escapeCommand(); await wait(20);
        var dt = UI.drawing.state.sheet.dims.filter(function (x) { return x.view === R.view.id && !x.auto && x.kind === 'v'; })[0] || {};
        assert(dt.kind === 'v' && dt.text === '1.365', 'tangent edge to the top: ' + dt.kind + ' ' + dt.text);
      } finally { UI.ribbonFlyFace('dwDim', 0); UI.markClean(); anvil.drawing.close(); await idle(); }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'R22.600 foreshortened, 6.000 to a virtual sharp, 1.365 from a tangent edge';
    });

    // the sheet's texts in the R12 DXF and the PDF, at the sheet's places: the ones missing
    function rfQGExportGaps() {
      var DWg = W.Drawing, sh = UI.drawing.state.sheet, dxf = anvil.drawing.dxf({ version: 'R12' }), pdf = anvil.drawing.pdf();
      var lines = String(dxf).split(/\r?\n/).map(function (s) { return s.trim(); }), ents = [], cur = null;
      for (var k = 0; k + 1 < lines.length; k += 2) { if (lines[k] === '0') { cur = { type: lines[k + 1] }; ents.push(cur); } else if (cur) cur[lines[k]] = lines[k + 1]; }
      var dtx = ents.filter(function (e) { return e.type === 'TEXT'; });
      var pdfStr = typeof pdf === 'string' ? pdf : Array.prototype.map.call(pdf, function (ch) { return String.fromCharCode(ch); }).join('');
      var tms = [], re = /([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) Tm \(((?:[^()\\]|\\.)*)\) Tj/g, m;
      while ((m = re.exec(pdfStr))) tms.push({ x: +m[5] / 72, y: +m[6] / 72, t: m[7].replace(/\\([0-7]{3})/g, function (s, o) { return String.fromCharCode(parseInt(o, 8)); }).replace(/\\(.)/g, '$1') });
      var dxfT = function (t) { return DWg.plainText(t).replace(/\n/g, ' ').replace(/Ø/g, '%%c').replace(/±/g, '%%p').replace(/°/g, '%%d').replace(/×/g, 'x').replace(/[^\x20-\x7e]/g, '?'); };
      var bad = [], n = 0;
      sh.prims.filter(function (p) { return p.k === 'text' && p.text && p.dimIx != null; }).forEach(function (p) {
        n++;
        var inD = dtx.some(function (e) { return e['1'] === dxfT(p.text) && [['10', '20'], ['11', '21']].some(function (q) { return Math.abs(+e[q[0]] - p.p[0]) < 5e-3 && Math.abs(+e[q[1]] - p.p[1]) < 5e-3; }); });
        var tr = DWg.textRect(p), pt = DWg.plainText(p.text);
        var inP = tms.some(function (q) { return q.t === pt && Math.abs(q.y - p.p[1]) < 5e-3 && q.x > tr.x0 - 5e-3 && q.x < tr.x1 + 5e-3; });
        if (!inD || !inP) bad.push(p.text + (inD ? '' : ' not in the DXF') + (inP ? '' : ' not in the PDF'));
      });
      return { n: n, bad: bad };
    }

    step('rfQG: detail print: Document Properties ▸ Dual dimensions on and 2 places; the hole location\'s PM set to .123 with a Bilateral +.005 / -.000: .750 +.005 -.000 [19.05 +0.13 0] while the others read .75 / 6.00 (already right); with Baseline (spaced 7 mm), Break Lines, Center Dimension, a virtual sharp and a Chamfer Dimension: saved, closed and opened, the sheet\'s SVG is the same and every value is in the PDF and the DXF where the sheet has it', async function () {
      var errs0 = errors.length;
      await rfQGOpen(RFQG_CHAMFER);
      try {
        var w = rfQGView('Top'), id = w.view.id;
        var find = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === 'Document Properties'; })[0]; }, b = find();
        if (!b) { rfQGTab('Annotation'); b = find(); }
        if (!b) { rfQGTab('View Layout'); b = find(); }
        assert(b, 'Document Properties on the ribbon');
        b.click(); await wait(30);
        var on = D.getElementById('dw-opt-dual'), pr = D.getElementById('dw-opt-prec');
        assert(on && pr && modalOpen(), 'the dialog');
        on.click(); pr.value = '2'; pr.dispatchEvent(new W.Event('change', { bubbles: true }));
        D.getElementById('dw-opt-ok').click(); await rfQGDone();
        rfQGFly('Smart Dimension'); await wait(20);
        rfQGClick(w.toSheet([3, 0])); await wait(30); rfQGClick(w.toSheet([4.5 + 0.1405, -0.75])); await wait(30); rfQGClick(w.toSheet([6.8, -0.4])); await rfQGDone();
        UI.escapeCommand(); await wait(20);
        var ix = rfQGIx(function (d) { return d.view === id && d.kind === 'v' && !d.auto; });
        assert(UI.drawing.state.sheet.dims[ix].text === '.75 [19.05]', 'at the document\'s 2 places: ' + UI.drawing.state.sheet.dims[ix].text);
        rfQGClick(rfQGMid(rfQGTexts(ix)[0])); await wait(60);
        var fk = function (key) { return D.querySelector('#pm [data-key="' + key + '"]'); };
        var setSel = function (key, v) { var s = fk(key); assert(s, key + ' in the PM'); s.value = v; s.dispatchEvent(new W.Event('change', { bubbles: true })); };
        var setNum = function (key, v) { var s = fk(key); assert(s, key + ' in the PM'); s.value = v; s.dispatchEvent(new W.Event('input', { bubbles: true })); s.dispatchEvent(new W.Event('change', { bubbles: true })); };
        setSel('prec', '3'); await wait(30); setSel('tolType', 'bilateral'); await wait(40);
        setNum('plus', '0.005'); await wait(20); setNum('minus', '0'); await wait(20);
        rfQGOK(); await rfQGDone();
        ix = rfQGIx(function (d) { return d.view === id && d.kind === 'v' && !d.auto; });
        var tt = rfQGTexts(ix).map(function (p) { return p.text; }).join(' ');
        assert(tt === '.750 +.005 -.000 [19.05 +0.13 0 ]', 'the hole location: ' + tt);
        var others = UI.drawing.state.sheet.dims.filter(function (d) { return d.auto && d.kind !== 'rad' && d.kind !== 'dia'; }).map(function (d) { return d.text; });
        assert(others.indexOf('6.00 [152.40]') >= 0 && others.indexOf('3.00 [76.20]') >= 0, 'the rest at 2 places: ' + others.join(' | '));
        // the rest of the print (each made by the mouse in the steps above), then Save / close / open
        var DWg = W.Drawing, doc = UI.App.model.drawings[UI.App.model.drawings.length - 1];
        var vid = function (o) { return doc.views.filter(function (v) { return v.orient === o && !v.kind; })[0].id; };
        DWg.addBaseline(doc, id, { dir: 'h', base: { a: [0, 0], b: [0, -3] }, refs: [{ kind: 'dia', c: [1.5, -0.75], r: 0.1405 }, { kind: 'dia', c: [4.5, -0.75], r: 0.1405 }, { a: [6, 0], b: [6, -3] }] });
        DWg.findView(doc, id).dims.slice(-1)[0].step = 7;
        var dv = DWg.findView(doc, id).dims.filter(function (d) { return d.kind === 'v'; })[0];
        DWg.setDimProps(dv, { brk: true, centre: true });
        var vs = DWg.smartDim({ point: [6, 0], vsharp: [[[0.1347, 0], [5.8653, 0]], [[6, 0.1347], [6, 1.5]]] }, { edge: [[0, -0.9253], [0, -0.1347]] }, [1.5, 2.1], { scale: 1, lock: 'h' });
        DWg.findView(doc, vid('Front')).dims = (DWg.findView(doc, vid('Front')).dims || []).concat([vs]);
        DWg.addChamferDim(doc, vid('Right'), { a: [-2.9, 1.5], b: [-3, 1.4], ref: { a: [-2.9, 1.5], b: [0, 1.5] } });
        UI.drawing.render(); await rfQGDone();
        var texts = UI.drawing.state.sheet.dims.map(function (d) { return d.text; }).join(' | ');
        assert(/1\.50 \[38\.10\], 4\.50 \[114\.30\], 6\.00 \[152\.40\]/.test(texts) && /\.10 X 45° \[2\.54\]/.test(texts), texts);
        var g1 = rfQGExportGaps();
        assert(!g1.bad.length, 'before saving: ' + g1.bad.join(' | '));
        var svg1 = anvil.drawing.svg(), json = JSON.stringify(anvil.model()), di = UI.App.model.drawings.length - 1;
        UI.markClean(); anvil.drawing.close(); await idle();
        await anvil.newPart(); await idle();
        await anvil.load(JSON.parse(json)); await idle();
        anvil.drawing.open(di); await rfQGDone();
        var svg2 = anvil.drawing.svg();
        assert(svg1 === svg2, 'the SVG after reopening: ' + svg1.length + ' / ' + svg2.length);
        var g2 = rfQGExportGaps();
        assert(g2.n === g1.n && !g2.bad.length, 'after reopening: ' + g2.n + ' ' + g2.bad.join(' | '));
      } finally { UI.ribbonFlyFace('dwDim', 0); UI.markClean(); if (UI.drawingActive()) anvil.drawing.close(); await idle(); }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return g2.n + ' values in the SVG, PDF and DXF, the same after reopening';
    });
  })();
