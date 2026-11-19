  // --- rfQU (2026-11-19, lane shopmouse2, test-reports/2026-11-19-shop-mouse.md "Second pass") --- the rest of the
  // sheet-metal commands driven only by the mouse and keys, as at SolidWorks 2024: ribbon buttons, picks in the graphics
  // area, PropertyManager boxes typed into, ✓ / ✗, Edit Feature from the tree, Ctrl+Z / Ctrl+Y. Self-contained; every
  // setting changed is put back. Helpers copied from rfQQ.
  (function () {
    var T16 = 0.0598, R06 = 0.06, K44 = 0.44;
    function rfQUEv(type, p, target, extra) {
      var r = $('viewport').getBoundingClientRect(), o = { bubbles: true, cancelable: true, view: W, button: type === 'contextmenu' ? 2 : 0, buttons: type === 'mouseup' || type === 'click' || type === 'dblclick' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) };
      for (var k in extra || {}) o[k] = extra[k];
      (target || W).dispatchEvent(new W.MouseEvent(type, o));
    }
    async function rfQUNewInch() {
      var du = UI.defaultUnits();
      UI.setDefaultUnits('in');
      try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
    }
    function rfQURowOf(f) { return Array.prototype.filter.call(D.querySelectorAll('#tree .ti'), function (r) { return r.getAttribute('data-fid') === String(f.id); })[0]; }
    function rfQURowMouse(type, row) { var b = row.getBoundingClientRect(); row.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, view: W, button: type === 'contextmenu' ? 2 : 0, clientX: b.left + 20, clientY: b.top + b.height / 2 })); }
    function rfQUMenuItem(text) { return Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.trim().indexOf(text) >= 0; })[0]; }
    function rfQUErrs() { var e = UI.App.build.errors || {}; return Object.keys(e).map(function (k) { return e[k]; }); }
    function rfQURibbon(tab, re) {
      UI.setRibbonTab(tab);
      var b = Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (x) { return re.test((x.getAttribute('aria-label') || '') + ' ' + (x.title || '') + ' ' + x.textContent); })[0];
      assert(b, tab + ' ribbon button ' + re); b.click();
    }
    async function rfQUFly(tab, group, text) {
      UI.setRibbonTab(tab);
      var w = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb-fly'), function (x) { return x._fly && x._fly.fly === group; })[0];
      assert(w, tab + ' flyout ' + group);
      var caret = w.querySelector('.rb-caret'); caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click(); await wait(20);
      var row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (r) { return r.textContent.indexOf(text) >= 0; })[0];
      assert(row, group + ' flyout row ' + text); row.click(); await idle(); await wait(20);
      UI.ribbonFlyFace(group, 0);
    }
    function rfQUKey(key, opts) { var o = { key: key, bubbles: true, cancelable: true }; for (var k in opts || {}) o[k] = opts[k]; if (D.activeElement && D.activeElement !== D.body) D.activeElement.blur(); D.dispatchEvent(new W.KeyboardEvent('keydown', o)); }
    function rfQUOk() { var b = D.querySelector('#pm .pm-ok'); assert(b, 'PM ✓'); b.click(); }
    function rfQUCancel() { var b = D.querySelector('#pm .pm-cancel'); assert(b, 'PM ✗'); b.click(); }
    function rfQUSel(key, val) { var s = pmField(key); assert(s, 'PM box ' + key); s.value = val; s.dispatchEvent(new W.Event('change', { bubbles: true })); }
    function rfQUPick(p) { selClick(UI.worldToScreen(p)); }
    function rfQUNoPreview() { return !UI.groups.preview.children.length; }
    function rfQUIcon(key) { var b = D.querySelector('#pm [data-key="' + key + '"]'); assert(b, 'PM button ' + key); b.click(); }
    async function rfQUEdit(f, title) {
      var row = rfQURowOf(f); assert(row, 'tree row of ' + f.name); rfQURowMouse('contextmenu', row); await wait(30);
      var mi = rfQUMenuItem('Edit Feature'); assert(mi, 'Edit Feature'); mi.click(); await idle(); await wait(40);
      assert(UI.hasPM() && UI.pmTitle() === (title || f.name), 'Edit Feature PM: ' + (UI.hasPM() && UI.pmTitle()));
    }
    async function rfQUDone() { rfQUOk(); await idle(); await idle(); await UI.whenIdle(); await idle(); }
    function rfQUSorted(fl) { return fl.size.slice().sort(function (a, b) { return b - a; }); }
    function rfQUBD(deg) { var A = deg * Math.PI / 180; return 2 * (R06 + T16) * Math.tan(A / 2) - A * (R06 + K44 * T16); }
    var TRAY = 'p.units("in");\np.sheet(' + T16 + ', ' + R06 + ', ' + K44 + ');\np.sketch("Top").rect(0, -6, 8, 6).end().baseFlange();\n';
    var TRAY4 = TRAY + 'p.flange(1, [[4, ' + T16 + ', 0], [8, ' + T16 + ', 3], [4, ' + T16 + ', 6], [0, ' + T16 + ', 3]], { position: "inside", lengthRef: "outer" });\n';
    async function rfQUTray(src) {
      await rfQUNewInch();
      await anvil.run(src || TRAY4); await idle();
      UI.setView('Isometric'); UI.zoomToFit(); await idle(); await wait(30);
    }
    // the flat's holes: every loop but the largest as { w, h (extents), e (distance to the blank's nearest bbox side), c (centre) }
    function rfQUFlatHoles(fl) {
      fl = fl || anvil.flat();
      function area(l) { var a = 0; for (var i = 0; i < l.length; i++) { var p = l[i], q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); }
      var ls = fl.loops.slice().sort(function (a, b) { return area(b) - area(a); }), o = ls[0], X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
      o.forEach(function (p) { X0 = Math.min(X0, p[0]); X1 = Math.max(X1, p[0]); Y0 = Math.min(Y0, p[1]); Y1 = Math.max(Y1, p[1]); });
      return ls.slice(1).map(function (l) {
        var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        l.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
        var c = [(x0 + x1) / 2, (y0 + y1) / 2];
        return { w: x1 - x0, h: y1 - y0, c: c, e: Math.min(c[0] - X0, X1 - c[0], c[1] - Y0, Y1 - c[1]), area: area(l) };
      }).sort(function (a, b) { return a.c[0] - b.c[0] || a.c[1] - b.c[1]; });
    }
    function rfQUOpt(key, re) { var s = pmField(key); assert(s, 'PM box ' + key); var o = Array.prototype.filter.call(s.options, function (x) { return re.test(x.text) || re.test(x.value); })[0]; assert(o, key + ' option ' + re + ': ' + Array.prototype.map.call(s.options, function (x) { return x.text; }).slice(0, 30).join(', ')); rfQUSel(key, o.value); return o.value; }
    function rfQUTab(label) { var b = Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (x) { return x.textContent.trim() === label; })[0]; assert(b, 'PM tab ' + label); b.click(); }

    step('rfQU: 1, Hole Wizard on the back flange of a four-flange 16 ga tray by the mouse: ✗ leaves nothing; two clicks on the flange face, Point X / Y typed (2, .5) and (6, .5); Hole / ANSI Inch / 1/4 normal / Through All ✓: the flat has the holes of the drill size in the back and (through all) the front flange, .5 from the blank\'s edge, 4 apart; Edit Feature: 5/16; Countersink and Straight Tap 1/4-20 Up To Next (back flange only) build; Ctrl+Z / Ctrl+Y', async function () {
      var errs0 = errors.length, notes = [], HWz = W.HoleWizard;
      await rfQUTray();
      var n0 = UI.App.model.features.length, u0 = UI.App.undo.length, h0 = rfQUFlatHoles().length;
      rfQURibbon('Features', /Hole Wizard/); await idle(); await wait(20);
      assert(UI.hasPM() && UI.pmTitle() === 'Hole Wizard', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
      rfQUPick([4, 0.5, 6]); await idle(); await wait(30);
      assert(UI.pmSpec().values.points.length === 1, 'a point placed');
      rfQUCancel(); await idle(); await wait(20);
      assert(!UI.hasPM() && UI.App.model.features.length === n0 && UI.App.undo.length === u0 && rfQUNoPreview(), '✗ leaves nothing');
      rfQURibbon('Features', /Hole Wizard/); await idle(); await wait(20);
      rfQUPick([2.3, 0.4, 6]); await idle(); await wait(30);
      rfQUPick([5.7, 0.6, 6]); await idle(); await wait(30);
      var v = UI.pmSpec().values;
      assert(v.points.length === 2 && v.face && Math.abs(v.face.n[2] - 1) < 1e-9, 'two points on the back flange: ' + JSON.stringify(v.face) + ' ' + JSON.stringify(v.points));
      setInput(pmField('Point1  X'), '2'); await idle(); setInput(pmField('Point1  Y'), '0.5'); await idle();
      setInput(pmField('Point2  X'), '6'); await idle(); setInput(pmField('Point2  Y'), '0.5'); await idle();
      rfQUTab('Type'); await idle();
      rfQUSel('Type', 'hole'); await idle();
      rfQUSel('Standard', HWz.ANSI); await idle();
      rfQUSel('Hole type', 'clearance'); await idle();
      rfQUOpt('Size', /^1\/4$/); await idle();
      rfQUSel('Fit', 'normal'); await idle();
      rfQUSel('End condition', 'through'); await idle(); await wait(30);
      await rfQUDone();
      var hf = UI.App.model.features.filter(function (f) { return f.type === 'hole'; })[0];
      assert(hf && !rfQUErrs().length, 'Hole feature: ' + JSON.stringify(hf) + rfQUErrs().join(' | '));
      var d = HWz.spec({ standard: HWz.ANSI, holeType: 'hole', size: '1/4', fit: 'normal' }, 'in').dia;
      var hs = rfQUFlatHoles();
      assert(hs.length === h0 + 4, 'Through All: two holes in the back flange and two in the front one: ' + JSON.stringify(hs));
      hs.forEach(function (h) { near(h.w, d, 1e-6, 'hole width = drill ' + d); near(h.h, d, 1e-6, 'hole height'); near(h.e, 0.5, 1e-6, 'hole .5 from the blank\'s edge'); });
      near(Math.abs(hs[2].c[0] - hs[0].c[0]), 4, 1e-6, '4 apart'); near(hs[1].c[0], hs[0].c[0], 1e-9, 'front and back in line');
      notes.push('1/4 normal: ' + d.toFixed(4) + ' at ' + hs.map(function (h) { return h.c.map(function (x) { return x.toFixed(4); }).join(','); }).join(' / '));
      // Edit Feature: 5/16
      await rfQUEdit(hf, 'Hole Wizard');
      assert(pmField('Type').value === 'hole' && pmField('End condition').value === 'through' && /1\/4/.test(pmField('Size').value), 'Edit Feature: same values');
      rfQUOpt('Size', /^5\/16$/); await idle();
      var u1 = UI.App.undo.length;
      await rfQUDone();
      var d2 = HWz.spec({ standard: HWz.ANSI, holeType: 'hole', size: '5/16', fit: 'normal' }, 'in').dia;
      hs = rfQUFlatHoles();
      assert(UI.App.undo.length === u1 + 1 && hs.length === h0 + 4, 'edited, one undo step');
      hs.forEach(function (h) { near(h.w, d2, 1e-6, '5/16 hole'); near(h.e, 0.5, 1e-6, 'still .5 from the edge'); });
      rfQUKey('z', { ctrlKey: true }); await idle(); await idle(); await UI.whenIdle();
      near(rfQUFlatHoles()[0].w, d, 1e-6, 'Ctrl+Z: 1/4 again');
      rfQUKey('y', { ctrlKey: true }); await idle(); await idle(); await UI.whenIdle();
      near(rfQUFlatHoles()[0].w, d2, 1e-6, 'Ctrl+Y: 5/16 again');
      // Countersink, then Straight Tap Up To Next, by Edit Feature
      await rfQUEdit(K.findFeature(UI.App.model, hf.id), 'Hole Wizard');
      rfQUSel('Type', 'csk'); await idle(); rfQUOpt('Size', /^1\/4$/); await idle();
      await rfQUDone();
      assert(!rfQUErrs().length && K.meshQuality(UI.App.mesh).openEdges === 0, 'countersink: ' + rfQUErrs().join(' | '));
      var sc = HWz.spec({ standard: HWz.ANSI, holeType: 'csk', size: '1/4', fit: 'normal' }, 'in');
      hs = rfQUFlatHoles();
      notes.push('csk 1/4 (drill ' + sc.dia.toFixed(4) + ', csk ' + sc.csk.dia.toFixed(4) + '): flat hole ' + hs.map(function (h) { return h.w.toFixed(4); }).join(' / '));
      await rfQUEdit(K.findFeature(UI.App.model, hf.id), 'Hole Wizard');
      rfQUSel('Type', 'tap'); await idle(); rfQUOpt('Size', /^1\/4-20/); await idle(); rfQUSel('End condition', 'next'); await idle();
      await rfQUDone();
      assert(!rfQUErrs().length && K.meshQuality(UI.App.mesh).openEdges === 0, 'tap Up To Next: ' + rfQUErrs().join(' | '));
      var st = HWz.spec({ standard: HWz.ANSI, holeType: 'tap', size: '1/4-20 UNC' }, 'in');
      hs = rfQUFlatHoles();
      assert(hs.length === h0 + 2, 'tapped: two holes');
      hs.forEach(function (h) { near(h.w, st.dia, 1e-6, 'tap drill ' + st.drillName); near(h.e, 0.5, 1e-6, '.5 from the edge'); });
      notes.push('tap 1/4-20 Up To Next: ' + st.dia.toFixed(4));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });

    function rfQUArea(l) { var a = 0; for (var i = 0; i < l.length; i++) { var p = l[i], q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); }
    function rfQUBlank(fl) { fl = fl || anvil.flat(); var ls = fl.loops.slice().sort(function (a, b) { return rfQUArea(b) - rfQUArea(a); }); var a = rfQUArea(ls[0]); ls.slice(1).forEach(function (l) { a -= rfQUArea(l); }); return { area: a, loops: ls.length, outer: ls[0] }; }
    function rfQUArea(l) { var a = 0; for (var i = 0; i < l.length; i++) { var p = l[i], q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); }
    function rfQUBlank(fl) { fl = fl || anvil.flat(); var ls = fl.loops.slice().sort(function (a, b) { return rfQUArea(b) - rfQUArea(a); }); var a = rfQUArea(ls[0]); ls.slice(1).forEach(function (l) { a -= rfQUArea(l); }); return { area: a, loops: ls.length, outer: ls[0] }; }
    function rfQUClosed() { return K.meshQuality(UI.App.mesh).openEdges === 0; }
    step('rfQU: 2, Corner Relief by the mouse on the four-flange tray (Sheet Metal ▸ Corners ▸ Corner Relief): ✗ leaves nothing; a click near the front-right corner, Rectangular .25 centred on the bend lines ✓: the flat loses the .25 square less the corner it already had; Edit Feature keeps the values; Circular, Tear, Obround, Constant Width and not centred each build closed with a smaller blank; Collect all corners takes 4; Ctrl+Z / Ctrl+Y', async function () {
      var errs0 = errors.length, notes = [];
      await rfQUTray();
      var n0 = UI.App.model.features.length, u0 = UI.App.undo.length, b0 = rfQUBlank();
      await rfQUFly('Sheet Metal', 'corners', 'Corner Relief');
      assert(UI.hasPM() && UI.pmTitle() === 'Corner Relief', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
      rfQUPick([7.8, T16, 0.2]); await idle(); await wait(30);
      assert(UI.pmSpec().values.corners.length === 1, 'one corner: ' + statusText());
      rfQUCancel(); await idle(); await wait(20);
      assert(!UI.hasPM() && UI.App.model.features.length === n0 && UI.App.undo.length === u0 && rfQUNoPreview(), '✗ leaves nothing');
      await rfQUFly('Sheet Metal', 'corners', 'Corner Relief');
      rfQUPick([7.8, T16, 0.2]); await idle(); await wait(30);
      rfQUSel('Relief type', 'rect'); await idle();
      if (!pmField('Centered on bend lines').checked) { pmField('Centered on bend lines').click(); await idle(); }
      setInput(pmField('Size'), '0.25'); await idle(); await wait(20);
      assert(!rfQUNoPreview(), 'the relief previewed');
      await rfQUDone();
      var cr = UI.App.model.features[n0];
      assert(cr && cr.type === 'cornerRelief' && cr.reliefType === 'rect' && cr.size === 0.25 && cr.corners.length === 1 && cr.centeredOnBend !== false && !rfQUErrs().length && rfQUClosed(), 'Corner-Relief1: ' + JSON.stringify(cr) + rfQUErrs().join(' | '));
      // the flat lies with x = world x, y = -z: the bend lines cross at (8 - (R + T) + BA / 2, -(R + T) + BA / 2); the corner's old notch is the quadrant past the outline vertex nearest (8, 0)
      var BA = Math.PI / 2 * (R06 + K44 * T16), bx = 8 - (R06 + T16) + BA / 2, by = -(R06 + T16) + BA / 2, s = 0.25, cq = null;
      b0.outer.forEach(function (p) { if (p[0] < 8 && p[1] < 0 && (!cq || Math.hypot(p[0] - 8, p[1]) < Math.hypot(cq[0] - 8, cq[1]))) cq = p; });
      var b1 = rfQUBlank(), want = s * s - Math.max(0, bx + s / 2 - cq[0]) * Math.max(0, by + s / 2 - cq[1]);
      near(b0.area - b1.area, want, 1e-6, 'rect .25 centred: the square less the old corner notch');
      assert(b1.outer.some(function (p) { return Math.abs(p[0] - (bx - s / 2)) < 1e-6 && Math.abs(p[1] - (by - s / 2)) < 1e-6; }), 'the square centred on the bend lines\' crossing');
      notes.push('rect .25: blank ' + b0.area.toFixed(6) + ' -> ' + b1.area.toFixed(6) + ' (closed form ' + want.toFixed(6) + ')');
      await rfQUEdit(cr);
      assert(pmField('Relief type').value === 'rect' && +pmField('Size').value === 0.25 && pmField('Centered on bend lines').checked && UI.pmSpec().values.corners.length === 1, 'Edit Feature: same values');
      var types = ['circular', 'tear', 'obround', 'constantWidth'], last = b1.area;
      for (var i = 0; i < types.length; i++) {
        if (i) await rfQUEdit(K.findFeature(UI.App.model, cr.id));
        rfQUSel('Relief type', types[i]); await idle(); await wait(20);
        assert(!rfQUNoPreview(), types[i] + ' previewed: ' + statusText());
        await rfQUDone();
        var f = K.findFeature(UI.App.model, cr.id), bb = rfQUBlank();
        assert(f.reliefType === types[i] && !rfQUErrs().length && rfQUClosed(), types[i] + ': ' + rfQUErrs().join(' | '));
        assert(bb.area < b0.area - 1e-4 && bb.loops === 1, types[i] + ': a smaller blank, one loop: ' + bb.area + ' / ' + bb.loops);
        notes.push(types[i] + ' ' + bb.area.toFixed(6));
      }
      // not centred: Rectangular from the corner
      await rfQUEdit(K.findFeature(UI.App.model, cr.id));
      rfQUSel('Relief type', 'rect'); await idle();
      pmField('Centered on bend lines').click(); await idle(); await wait(20);
      await rfQUDone();
      var f2 = K.findFeature(UI.App.model, cr.id);
      assert(f2.centeredOnBend === false && !rfQUErrs().length && rfQUClosed(), 'not centred: ' + JSON.stringify(f2) + rfQUErrs().join(' | '));
      notes.push('rect not centred ' + rfQUBlank().area.toFixed(6));
      // Collect all corners
      await rfQUEdit(f2);
      clickPmButton('Collect all corners'); await idle(); await wait(20);
      assert(UI.pmSpec().values.corners.length === 4, 'four corners: ' + UI.pmSpec().values.corners.length);
      var u1 = UI.App.undo.length;
      await rfQUDone();
      assert(K.findFeature(UI.App.model, cr.id).corners.length === 4 && UI.App.undo.length === u1 + 1 && !rfQUErrs().length && rfQUClosed(), 'four corners built');
      var b4 = rfQUBlank().area;
      rfQUKey('z', { ctrlKey: true }); await idle(); await idle(); await UI.whenIdle();
      assert(K.findFeature(UI.App.model, cr.id).corners.length === 1, 'Ctrl+Z: one corner');
      rfQUKey('y', { ctrlKey: true }); await idle(); await idle(); await UI.whenIdle();
      assert(K.findFeature(UI.App.model, cr.id).corners.length === 4, 'Ctrl+Y: four');
      near(rfQUBlank().area, b4, 1e-9, 'Ctrl+Y: same blank');
      notes.push('4 corners ' + b4.toFixed(6));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });

    // the back flange's x = 8 end face, .0071 from the right flange's inside face: looked at down the gap from above, zoomed in
    async function rfQUWeldView() {
      var P = [7.9331, 0.96, 6 - T16 / 2], nrm = [0.1, 1, 0.05].map(function (x) { return x / Math.sqrt(1.0125); });
      UI.viewNormalTo(K.planeFromFace(nrm, P)); UI.zoomToFit(); await idle(); await wait(30);
      for (var z = 0; z < 16; z++) { var s0 = UI.worldToScreen(P); UI.zoomView(0.7, s0[0], s0[1]); }
      await idle(); await wait(30);
      return P;
    }
    step('rfQU: 3, Welded Corner by the mouse on the four-flange tray: ✗ leaves nothing; the back flange\'s end face clicked down the .0071 gap; Add fillet .1 ✓: closed, heavier, the flat unchanged (the weld is left out); Edit Feature keeps the face and the fillet; fillet off; Ctrl+Z / Ctrl+Y', async function () {
      var errs0 = errors.length, notes = [];
      await rfQUTray();
      var n0 = UI.App.model.features.length, u0 = UI.App.undo.length, v0 = UI.App.build.body.volume(), b0 = rfQUBlank();
      await rfQUFly('Sheet Metal', 'corners', 'Welded Corner');
      assert(UI.hasPM() && UI.pmTitle() === 'Welded Corner', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
      var P = await rfQUWeldView();
      rfQUPick(P); await idle(); await wait(30);
      assert(UI.pmSpec().values.faces.length === 1, 'the end face taken: ' + statusText());
      rfQUCancel(); await idle(); await wait(20);
      assert(!UI.hasPM() && UI.App.model.features.length === n0 && UI.App.undo.length === u0 && rfQUNoPreview(), '✗ leaves nothing');
      await rfQUFly('Sheet Metal', 'corners', 'Welded Corner');
      P = await rfQUWeldView();
      rfQUPick(P); await idle(); await wait(30);
      if (!pmField('Add fillet').checked) { pmField('Add fillet').click(); await idle(); }
      setInput(pmField('Fillet radius'), '0.1'); await idle(); await wait(20);
      assert(!rfQUNoPreview(), 'the weld previewed: ' + statusText());
      await rfQUDone();
      var wc = UI.App.model.features[n0];
      assert(wc && wc.type === 'weldedCorner' && wc.faces.length === 1 && +wc.fillet === 0.1 && !rfQUErrs().length && rfQUClosed(), 'Welded Corner1: ' + JSON.stringify(wc) + rfQUErrs().join(' | '));
      var v1 = UI.App.build.body.volume(), b1 = rfQUBlank();
      assert(v1 > v0 + 1e-5, 'the weld adds metal: ' + (v1 - v0));
      near(b1.area, b0.area, 1e-12, 'the flat leaves the weld out');
      notes.push('weld + fillet .1: +' + (v1 - v0).toFixed(6) + ' in3');
      UI.setView('Isometric'); UI.zoomToFit(); await idle();
      await rfQUEdit(wc);
      assert(UI.pmSpec().values.faces.length === 1 && pmField('Add fillet').checked && +pmField('Fillet radius').value === 0.1, 'Edit Feature: the face and the fillet');
      pmField('Add fillet').click(); await idle();
      var u1 = UI.App.undo.length;
      await rfQUDone();
      var v2 = UI.App.build.body.volume();
      assert(K.findFeature(UI.App.model, wc.id).fillet == null && UI.App.undo.length === u1 + 1 && v2 < v1 && v2 > v0 && rfQUClosed(), 'fillet off: ' + (v2 - v0));
      notes.push('no fillet: +' + (v2 - v0).toFixed(6));
      rfQUKey('z', { ctrlKey: true }); await idle(); await idle(); await UI.whenIdle();
      near(UI.App.build.body.volume(), v1, 1e-12, 'Ctrl+Z: the fillet back');
      rfQUKey('y', { ctrlKey: true }); await idle(); await idle(); await UI.whenIdle();
      near(UI.App.build.body.volume(), v2, 1e-12, 'Ctrl+Y');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });    function rfQUClick(p) { rfQUEv('mousemove', p); rfQUEv('mousedown', p, $('viewport')); rfQUEv('mouseup', p); }
    function rfQUSk(uv) { return UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])); }
    function rfQUBtn(label) { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return b.getAttribute('aria-label') === label; })[0]; }
    function rfQUEdge(P) {
      var s = UI.worldToScreen(P), pk = UI.pickEdge(s[0], s[1]);
      assert(pk && pk.edge && K.pointSegmentDistance(P, pk.edge.a, pk.edge.b) < 1e-6, 'edge under ' + JSON.stringify(P) + ': ' + JSON.stringify(pk && [pk.edge.a, pk.edge.b]));
      rfQUClick(s);
    }
    // the x / z extent of the metal above the base (y > .5) near one side wall
    function rfQUSpan(axis, pred) { var lo = Infinity, hi = -Infinity, P = UI.App.mesh.positions64 || UI.App.mesh.positions; for (var i = 0; i < P.length; i += 3) if (P[i + 1] > 0.5 && pred(P[i], P[i + 1], P[i + 2])) { lo = Math.min(lo, P[i + axis]); hi = Math.max(hi, P[i + axis]); } return [lo, hi]; }
    step('rfQU: 4, Miter Flange by the mouse on the flat 8 x 6: the front edge clicked, Miter Flange opens a sketch at its end, a line 1 up drawn with the Line tool, Exit Sketch, the other three edges clicked, gap .01 ✓: 1 + T high, ends T + g / sqrt 2 short of the next wall, flat (8 + 2 (1 + T) - 2 BD) x (6 + 2 (1 + T) - 2 BD); Edit Feature: gap .1; the left edge clicked off, Start offset .5 / End offset .25 move the chain\'s free ends in; ✗ / Ctrl+Z / Ctrl+Y', async function () {
      var errs0 = errors.length, notes = [], bd = rfQUBD(90), H = 1 + T16;
      await rfQUTray(TRAY);
      var n0 = UI.App.model.features.length;
      rfQUEdge([4, T16, 0]); await idle();
      UI.setRibbonTab('Sheet Metal'); rfQUBtn('Miter Flange').click(); await idle();
      assert(UI.App.mode === 'sketch', 'a sketch at the edge\'s end: ' + UI.App.mode);
      UI.setTool('line');
      rfQUClick(rfQUSk([0, 0])); rfQUClick(rfQUSk([0, 1]));
      rfQUKey('Escape'); rfQUKey('Escape'); await idle();
      var sk = UI.activeSketchFeature();
      assert(sk.entities.length === 1 && sk.entities[0].t === 'line', 'one line: ' + JSON.stringify(sk.entities));
      D.querySelector('#exit-sketch .cc-exit').click(); await idle(); await idle();
      assert(UI.hasPM() && UI.pmTitle() === 'Miter Flange', 'Miter Flange PM: ' + (UI.hasPM() && UI.pmTitle()));
      UI.setView('Isometric'); UI.zoomToFit(); await idle();
      rfQUEdge([8, T16, 3]); await idle(); rfQUEdge([4, T16, 6]); await idle(); rfQUEdge([0, T16, 3]); await idle();
      assert(UI.pmSpec().values.edges.length === 4, 'four edges round the tray: ' + UI.pmSpec().values.edges.length);
      setInput(pmField('Gap distance'), '0.01'); await idle(); await wait(30);
      assert(!rfQUNoPreview(), 'previewed: ' + statusText());
      await rfQUDone();
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.miterFlange && f.edges.length === 4 && +f.miterGap === 0.01 && f.sketch === sk.id && !rfQUErrs().length && rfQUClosed(), 'Miter Flange1: ' + JSON.stringify(f).slice(0, 300) + rfQUErrs().join(' | '));
      var bb = K.massProps(UI.App.mesh).bbox;
      near(bb.max[1], H, 1e-9, '1 + T high');
      var fl = rfQUSorted(anvil.flat());
      near(fl[0], 8 + 2 * H - 2 * bd, 1e-6, 'flat long'); near(fl[1], 6 + 2 * H - 2 * bd, 1e-6, 'flat short');
      var back = function (x, y, z) { return z > 6 - T16 - 1e-6; };
      near(rfQUSpan(0, back)[1], 8 - T16 - 0.01 / Math.SQRT2, 1e-6, 'gap .01: the back wall ends T + g / sqrt 2 short of the right wall\'s outside');
      notes.push('flat ' + fl.map(function (x) { return x.toFixed(6); }).join(' x '));
      // Edit Feature: gap .1, then the offsets
      await rfQUEdit(f);
      assert(+pmField('Gap distance').value === 0.01 && UI.pmSpec().values.edges.length === 4, 'Edit Feature: same values');
      setInput(pmField('Gap distance'), '0.1'); await idle();
      await rfQUDone();
      near(rfQUSpan(0, back)[1], 8 - T16 - 0.1 / Math.SQRT2, 1e-6, 'gap .1');
      // Start / End offset: a closed chain of four edges has no free end (the offsets do nothing: miterOffsetEnds), so the
      // left edge is clicked off: front, right, back; start = the front edge's free end (at x = 0, the sketch sits at x = 8)
      var front = function (x, y, z) { return z < T16 + 1e-6; }, backW = function (x, y, z) { return z > 6 - T16 - 1e-6; };
      await rfQUEdit(K.findFeature(UI.App.model, f.id));
      rfQUEdge([0, T16, 3]); await idle();
      assert(UI.pmSpec().values.edges.length === 3, 'the left edge clicked off: ' + UI.pmSpec().values.edges.length);
      await rfQUDone();
      var fr0 = rfQUSpan(0, front), bk0 = rfQUSpan(0, backW);
      await rfQUEdit(K.findFeature(UI.App.model, f.id));
      pmField('Start/End offset').click(); await idle();
      setInput(pmField('Start offset distance'), '0.5'); await idle(); setInput(pmField('End offset distance'), '0.25'); await idle();
      var u1 = UI.App.undo.length;
      await rfQUDone();
      var g = K.findFeature(UI.App.model, f.id);
      assert(+g.startOffset === 0.5 && +g.endOffset === 0.25 && !rfQUErrs().length && rfQUClosed() && UI.App.undo.length === u1 + 1, 'offsets: ' + JSON.stringify(g).slice(0, 200) + rfQUErrs().join(' | '));
      var fr1 = rfQUSpan(0, front), bk1 = rfQUSpan(0, backW);
      notes.push('front wall x ' + fr0.map(function (x) { return x.toFixed(4); }) + ' -> ' + fr1.map(function (x) { return x.toFixed(4); }) + ', back wall x ' + bk0.map(function (x) { return x.toFixed(4); }) + ' -> ' + bk1.map(function (x) { return x.toFixed(4); }));
      near(fr1[0] - fr0[0], 0.5, 1e-6, 'Start offset .5: the front wall starts .5 in (' + notes.join('; ') + ')'); near(fr1[1], fr0[1], 1e-9, 'its mitred end stays');
      near(bk1[0] - bk0[0], 0.25, 1e-6, 'End offset .25: the back wall ends .25 in'); near(bk1[1], bk0[1], 1e-9, 'its mitred end stays');      rfQUKey('z', { ctrlKey: true }); await idle(); await idle(); await UI.whenIdle();
      assert(!+K.findFeature(UI.App.model, f.id).startOffset, 'Ctrl+Z: no offsets');
      rfQUKey('y', { ctrlKey: true }); await idle(); await idle(); await UI.whenIdle();
      assert(+K.findFeature(UI.App.model, f.id).startOffset === 0.5, 'Ctrl+Y: offsets back');
      // ✗ on an edit leaves the feature as it was
      await rfQUEdit(K.findFeature(UI.App.model, f.id));
      setInput(pmField('Gap distance'), '0.2'); await idle(); await wait(20);
      rfQUCancel(); await idle(); await UI.whenIdle();
      assert(+K.findFeature(UI.App.model, f.id).miterGap === 0.1 && rfQUNoPreview(), '✗ keeps gap .1');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });    step('rfQU: 5, Closed Corner Underlap by the mouse on the four-flange tray: the back flange\'s end face clicked, Underlap, gap .002, ratio .5 ✓: the right flange runs .5 T into the back flange (its end at z = 6 - T / 2), the back flange runs to x = 8 over it; Edit Feature shows Underlap and .5; closed', async function () {
      var out = [], errs0 = errors.length;
      await rfQUTray();
      var backW = function (x, y, z) { return z > 6 - T16 - 1e-6; }, right = function (x, y, z) { return x > 8 - T16 - 1e-6; };
      out.push('before back x ' + rfQUSpan(0, backW) + ' right z ' + rfQUSpan(2, right));
      await rfQUFly('Sheet Metal', 'corners', 'Closed Corner');
      var best = null;
      UI.App.mesh.faces.forEach(function (fc, i) { if (!fc.normal || fc.normal[0] < 0.999 || fc.centroid[1] < 0.3 || fc.centroid[0] < 7) return; if (!best || fc.area < best.area) best = { c: [fc.centroid[0], fc.centroid[1], 6 - T16 / 2], area: fc.area }; });
      rfQUPick(best.c); await idle(); await wait(30);
      out.push('faces ' + UI.pmSpec().values.faces.length + ' ' + Array.prototype.map.call(D.querySelectorAll('#pm [data-key^="cornerType:"]'), function (b) { return b.getAttribute('data-key'); }).join(','));
      rfQUIcon('cornerType:underlap'); await idle();
      setInput(pmField('Gap distance'), '0.002'); await idle(); setInput(pmField('Overlap/underlap ratio'), '0.5'); await idle(); await wait(20);
      await rfQUDone();
      var cc = UI.App.model.features[UI.App.model.features.length - 1];
      out.push(JSON.stringify(cc).slice(0, 200) + ' errs ' + rfQUErrs().join('|') + ' closed ' + rfQUClosed());
      out.push('after back x ' + rfQUSpan(0, backW) + ' right z ' + rfQUSpan(2, right));
      assert(cc.type === 'closedCorner' && cc.cornerType === 'underlap' && +cc.ratio === 0.5 && +cc.gap === 0.002 && !rfQUErrs().length && rfQUClosed(), 'Closed Corner1: ' + out.join(' | '));
      near(rfQUSpan(2, right)[1], 6 - T16 + 0.5 * T16, 1e-6, 'underlap .5: the right flange .5 T into the back one');
      near(rfQUSpan(0, backW)[1], 8, 1e-9, 'the back flange over it to x = 8');
      await rfQUEdit(cc);
      assert(D.querySelector('#pm [data-key=\"cornerType:underlap\"]').classList.contains('on') && +pmField('Overlap/underlap ratio').value === 0.5 && +pmField('Gap distance').value === 0.002, 'Edit Feature: Underlap .5');
      rfQUCancel(); await idle(); await UI.whenIdle();
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return out.slice(3).join('; ');
    });    step('rfQU: 6, Flat-Pattern1 right-click ▸ Edit Feature: the right flange\'s top edge clicked as the grain direction ✓: the flat turns (9.79 x 7.79 -> 7.79 x 9.79), Edit Feature shows Edge<1>, Ctrl+Z / Ctrl+Y; then Flatten clicked while Edge-Flange1 is being edited (Length 2 typed): the edit is dropped, nothing previewed, the flat shown is the 1 high one, Flatten again folds', async function () {
      var errs0 = errors.length, notes = [], bd = rfQUBD(90);
      await rfQUTray();
      var s0 = anvil.flat().size.slice();
      near(s0[0], 8 + 2 * (1 - bd), 1e-6, 'flat x'); near(s0[1], 6 + 2 * (1 - bd), 1e-6, 'flat y');
      var row = D.querySelector('#tree .ti.fp-row'); assert(row, 'Flat-Pattern1 in the tree');
      rfQURowMouse('contextmenu', row); await wait(30);
      var mi = rfQUMenuItem('Edit Feature'); assert(mi, 'Edit Feature on Flat-Pattern1: ' + Array.prototype.map.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.trim(); }).join(' | '));
      mi.click(); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Flat-Pattern1', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
      rfQUEdge([8, 1, 3]); await idle(); await wait(20);
      assert(UI.pmSpec().values.grain, 'grain edge taken: ' + statusText());
      var u0 = UI.App.undo.length;
      await rfQUDone();
      assert(UI.App.model.flatGrain && UI.App.undo.length === u0 + 1, 'grain stored, one undo step');
      var s1 = anvil.flat().size;
      near(s1[0], s0[1], 1e-6, 'turned: the 6 side along X'); near(s1[1], s0[0], 1e-6, 'the 8 side along Y');
      rfQURowMouse('contextmenu', D.querySelector('#tree .ti.fp-row')); await wait(30);
      rfQUMenuItem('Edit Feature').click(); await idle(); await wait(30);
      assert(UI.pmSpec().values.grain && $('pm').textContent.indexOf('Edge<1>') >= 0, 'Edit Feature shows the grain edge');
      rfQUCancel(); await idle();
      assert(UI.App.model.flatGrain, '✗ keeps it');
      rfQUKey('z', { ctrlKey: true }); await idle(); await idle(); await UI.whenIdle();
      assert(!UI.App.model.flatGrain && Math.abs(anvil.flat().size[0] - s0[0]) < 1e-6, 'Ctrl+Z: no grain');
      rfQUKey('y', { ctrlKey: true }); await idle(); await idle(); await UI.whenIdle();
      assert(UI.App.model.flatGrain && Math.abs(anvil.flat().size[0] - s0[1]) < 1e-6, 'Ctrl+Y: grain back');
      notes.push('grain: ' + s0.map(function (x) { return x.toFixed(6); }).join(' x ') + ' -> ' + s1.map(function (x) { return x.toFixed(6); }).join(' x '));
      // Flatten while Edge-Flange1 is being edited
      var ef = UI.App.model.features.filter(function (g) { return g.type === 'flange'; })[0];
      await rfQUEdit(ef);
      setInput(pmField('Length'), '2'); await idle(); await wait(60); await UI.whenIdle();
      var nU = UI.App.undo.length;
      rfQURibbon('Sheet Metal', /\bFlatten\b/); await idle(); await UI.whenIdle(); await idle(); await wait(30);
      ef = K.findFeature(UI.App.model, ef.id);
      notes.push('flatten while editing: PM ' + UI.hasPM() + ', flatState ' + !!UI.App.model.flatState + ', length ' + ef.length + ', rollback ' + UI.App.rollback + ', preview ' + UI.groups.preview.children.length + ', undo +' + (UI.App.undo.length - nU));
      assert(!UI.hasPM() && +ef.length === 1 && rfQUNoPreview() && UI.App.rollback == null, 'the edit is dropped: ' + notes.join('; '));
      assert(UI.App.model.flatState && UI.App.flat, 'flattened: ' + statusText());
      var fs = UI.App.flat.size; near(Math.max(fs[0], fs[1]), s0[0], 1e-6, 'the shown flat is the 1 high one');
      rfQURibbon('Sheet Metal', /\bFlatten\b/); await idle(); await UI.whenIdle(); await idle(); await wait(30);
      assert(!UI.App.model.flatState && !rfQUErrs().length && rfQUClosed(), 'folded again');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });    async function rfQUDropTool(id, P) {
      UI.designLibrary.open('forming'); await idle(); await wait(20);
      var tile = D.querySelector('.dl-tile[data-kind="forming"][data-id="' + id + '"]');
      assert(tile && tile.draggable, 'Design Library ▸ Forming Tools ▸ ' + id + ' tile, draggable');
      var dt = new W.DataTransfer();
      tile.dispatchEvent(new W.DragEvent('dragstart', { dataTransfer: dt, bubbles: true, cancelable: true }));
      var s = UI.worldToScreen(P), r = $('viewport').getBoundingClientRect(), cv = $('viewport').querySelector('canvas') || $('viewport');
      var o = { dataTransfer: dt, bubbles: true, cancelable: true, clientX: Math.round(r.left + s[0]), clientY: Math.round(r.top + s[1]) };
      cv.dispatchEvent(new W.DragEvent('dragover', o)); cv.dispatchEvent(new W.DragEvent('drop', o)); await idle(); await wait(30);
      tile.dispatchEvent(new W.DragEvent('dragend', { dataTransfer: dt, bubbles: true }));
    }
    function rfQUMarks(fl) { var by = {}; (fl || anvil.flat()).etch.forEach(function (e) { if (e.form != null && e.kind === 'mark') by[e.form] = (by[e.form] || 0) + 1; }); return by; }
    function rfQUMarkBox(fl, form) { var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; (fl || anvil.flat()).etch.forEach(function (e) { if (e.kind !== 'mark' || (form != null && String(e.form) !== String(form))) return; (e.pts || [e.a, e.b].filter(Boolean)).forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }); if (e.c && e.r) { x0 = Math.min(x0, e.c[0] - e.r); x1 = Math.max(x1, e.c[0] + e.r); y0 = Math.min(y0, e.c[1] - e.r); y1 = Math.max(y1, e.c[1] + e.r); } }); return [x0, y0, x1, y1]; }
    step('rfQU: 7, Forming Tool dragged from the Design Library onto the tray\'s floor: the PM opens with the drop point; Position X / Y typed 2 / -2 (the face frame: x, -z), Flip tool, then Louver with Rotation angle 90 by Edit Feature; ✓ / ✗; then Linear Pattern from the ribbon: the dimple clicked as the feature, Direction 1 by a click on the front edge (X), spacing 1.5, 3 instances: the flat marks all three', async function () {
      var errs0 = errors.length, notes = [];
      await rfQUTray();
      var n0 = UI.App.model.features.length, u0 = UI.App.undo.length;
      await rfQUDropTool('dimple', [3, T16, 2.5]);
      assert(UI.hasPM() && UI.pmTitle() === 'Forming Tool' && UI.pmSpec().values.face && UI.pmSpec().values.tool === 'dimple', 'dropped: the PM with the face under the drop: ' + statusText());
      rfQUCancel(); await idle();
      assert(!UI.hasPM() && UI.App.model.features.length === n0 && UI.App.undo.length === u0 && rfQUNoPreview(), '✗ leaves nothing');
      UI.setView('Isometric'); UI.zoomToFit(); await idle();
      await rfQUDropTool('dimple', [3, T16, 2.5]);
      setInput(pmField('Position X'), '2'); await idle(); setInput(pmField('Position Y'), '-2'); await idle(); await wait(20);
      assert(!rfQUNoPreview(), 'previewed: ' + statusText());
      await rfQUDone();
      var ft = UI.App.model.features[n0];
      assert(ft && ft.type === 'formingTool' && ft.at[0] === 2 && ft.at[1] === -2 && !rfQUErrs().length && rfQUClosed(), 'Dimple1: ' + JSON.stringify(ft) + rfQUErrs().join(' | '));
      var mb = rfQUMarkBox(null, ft.id);
      near((mb[0] + mb[2]) / 2, 2, 1e-6, 'the flat\'s dimple marks centred at x 2'); near((mb[1] + mb[3]) / 2, -2, 1e-6, 'and y -2 (z = 2)');
      var yUp = rfQUSpan(1, function (x, y, z) { return Math.abs(x - 2) < 0.5 && Math.abs(z - 2) < 0.5; });
      await rfQUEdit(ft);
      assert(+pmField('Position X').value === 2 && +pmField('Position Y').value === -2 && !pmField('Flip tool').checked, 'Edit Feature: same values');
      pmField('Flip tool').click(); await idle();
      await rfQUDone();
      var lo = Infinity, P = UI.App.mesh.positions64 || UI.App.mesh.positions; for (var q = 0; q < P.length; q += 3) lo = Math.min(lo, P[q + 1]);
      assert(K.findFeature(UI.App.model, ft.id).flip && lo < -0.05 && !rfQUErrs().length && rfQUClosed(), 'flipped: formed down to ' + lo);
      notes.push('dimple at (2, -2): marks ' + mb.map(function (x) { return x.toFixed(4); }).join(',') + '; flipped down to y ' + lo.toFixed(4));
      // Louver, rotation 0 then 90: its marks turn
      await rfQUEdit(K.findFeature(UI.App.model, ft.id));
      pmField('Flip tool').click(); await idle();
      rfQUIcon('tool:louver'); await idle(); await wait(20);
      await rfQUDone();
      assert(!rfQUErrs().length && rfQUClosed(), 'louver: ' + rfQUErrs().join(' | '));
      var l0 = rfQUMarkBox(null, ft.id);
      await rfQUEdit(K.findFeature(UI.App.model, ft.id));
      setInput(pmField('Rotation angle'), '90'); await idle();
      await rfQUDone();
      assert(!rfQUErrs().length && rfQUClosed() && +K.findFeature(UI.App.model, ft.id).angle === 90, 'louver 90: ' + rfQUErrs().join(' | '));
      var l1 = rfQUMarkBox(null, ft.id);
      near(l1[2] - l1[0], l0[3] - l0[1], 1e-6, 'rotated 90: the marks\' width = their old height'); near(l1[3] - l1[1], l0[2] - l0[0], 1e-6, 'and height = old width');
      notes.push('louver marks ' + (l0[2] - l0[0]).toFixed(4) + ' x ' + (l0[3] - l0[1]).toFixed(4) + ' -> ' + (l1[2] - l1[0]).toFixed(4) + ' x ' + (l1[3] - l1[1]).toFixed(4));
      rfQUKey('z', { ctrlKey: true }); await idle(); await idle(); await UI.whenIdle();
      assert(+K.findFeature(UI.App.model, ft.id).angle === 0, 'Ctrl+Z: 0');
      // back to the dimple, then Linear Pattern
      await rfQUEdit(K.findFeature(UI.App.model, ft.id));
      rfQUIcon('tool:dimple'); await idle();
      await rfQUDone();
      UI.setSelection && UI.setSelection([]);
      rfQURibbon('Features', /Linear Pattern/); await idle(); await wait(20);
      assert(UI.hasPM() && UI.pmTitle() === 'Linear Pattern', 'Linear Pattern PM: ' + (UI.hasPM() && UI.pmTitle()));
            for (var zq = 0; zq < 5; zq++) { var sz = UI.worldToScreen([2, T16 + 0.125, 2]); UI.zoomView(0.7, sz[0], sz[1]); } await idle();   // zoomed in on the dimple, as one does to click its face
      rfQUPick([2, T16 + 0.125, 2]); await idle(); await wait(20);
      UI.zoomToFit(); await idle();
      assert(+UI.pmSpec().values.feature === ft.id, 'the dimple clicked as the feature to pattern: ' + UI.pmSpec().values.feature + ' ' + statusText());
      rfQUSel('Direction', 'z'); await idle();
      rfQUEdge([4, 1, 0]); await idle(); await wait(20);
      assert(UI.pmSpec().values.d1 === 'x', 'Direction 1 from the front edge: X: ' + UI.pmSpec().values.d1 + ' ' + statusText());
      setInput(pmField('Spacing'), '1.5'); await idle(); setInput(pmField('Number of instances'), '3'); await idle();
      await rfQUDone();
      var lp = UI.App.model.features[UI.App.model.features.length - 1];
      assert(lp.type === 'lpattern' && lp.feature === ft.id && !rfQUErrs().length && rfQUClosed(), 'LPattern1: ' + JSON.stringify(lp) + rfQUErrs().join(' | '));
      var fl = anvil.flat(), mk = rfQUMarks(fl), all = rfQUMarkBox(fl);
      notes.push('marks per form ' + JSON.stringify(mk) + ' box ' + all.map(function (x) { return x.toFixed(4); }).join(','));
      near((all[0] + all[2]) / 2, 2 + 1.5, 1e-6, 'three dimples\' marks centred at x 3.5 (' + notes.join('; ') + ')'); near(all[2] - all[0], 3 + (mb[2] - mb[0]), 1e-6, 'spanning 3 + one dimple');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });    function rfQUVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
    step('rfQU: 8, Vent by the mouse on the four-flange tray\'s floor (a sketch of three circles and four lines): the ribbon fills the boxes from the sketch; the small circle clicked out of Spars and into Fill-In Boundary, a rib clicked out and back in; Rib width .1, Spar width .08, Radius for fillets .05 typed ✓: removed = T x the open area, the flat\'s blank loses it; Edit Feature shows the boxes; ✗ / Ctrl+Z / Ctrl+Y', async function () {
      var errs0 = errors.length, notes = [], c = 4, q = 1.5 * Math.SQRT1_2;
      await rfQUTray(TRAY4 + 'p.sketch("Top", ' + T16 + ').circle(4, -3, 1.5).circle(4, -3, 0.9).circle(4, -3, 0.35).line(2.5, -3, 5.5, -3).line(4, -4.5, 4, -1.5).line(' + (c - q) + ', ' + (-3 - q) + ', ' + (c + q) + ', ' + (-3 + q) + ').line(' + (c - q) + ', ' + (-3 + q) + ', ' + (c + q) + ', ' + (-3 - q) + ');\n');
      UI.setView('Top'); UI.zoomToFit(); await idle(); await wait(30);
      var n0 = UI.App.model.features.length, sk = UI.App.model.features[n0 - 1], v0 = rfQUVol(), b0 = rfQUBlank(), u0 = UI.App.undo.length;
      rfQURibbon('Sheet Metal', /\bVent\b/); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Vent', 'Vent PM: ' + (UI.hasPM() && UI.pmTitle()));
      rfQUCancel(); await idle();
      assert(!UI.hasPM() && UI.App.model.features.length === n0 && UI.App.undo.length === u0 && rfQUNoPreview(), '✗ leaves nothing');
      rfQURibbon('Sheet Metal', /\bVent\b/); await idle(); await wait(30);
      var vals = UI.pmSpec().values;
      notes.push('auto ' + JSON.stringify([vals.boundary, vals.ribs, vals.spars, vals.fill]));
      assert(JSON.stringify([vals.boundary, vals.ribs, vals.spars, vals.fill]) === '[[0],[3,4,5,6],[1,2],[]]', 'boxes filled from the sketch: ' + notes[0]);
      var pl = { origin: [0, T16, 0], x: [1, 0, 0], y: [0, 0, -1], n: [0, 1, 0] };
      function at(u, v) { return UI.worldToScreen(K.to3D(pl, u, v)); }
      function box(i) { var b = D.querySelectorAll('#pm .pm-pick.clickable'); assert(b[i], 'selection box ' + i + ' of ' + b.length); b[i].click(); }
      // the small circle: out of Spars, then into Fill-In Boundary (its group expanded first)
      box(2); await wait(20);
      var s3 = at(4 + 0.35 * Math.cos(0.4), -3 + 0.35 * Math.sin(0.4)), pk = UI.pickSketchRefs(s3[0], s3[1]);
      assert(pk && pk.kind === 'sketchEntity' && pk.index === 2, 'the small circle under the pointer: ' + JSON.stringify(pk));
      rfQUClick(s3); await idle(); await wait(30);
      assert(JSON.stringify(UI.pmSpec().values.spars) === '[1]', 'clicked out of Spars: ' + JSON.stringify(UI.pmSpec().values.spars));
      var fh = Array.prototype.filter.call(D.querySelectorAll('#pm .pm-group > h4'), function (h) { return /Fill-In Boundary/.test(h.textContent); })[0];
      assert(fh, 'Fill-In Boundary group'); if (!D.querySelectorAll('#pm .pm-pick.clickable')[3]) { fh.click(); await wait(20); }
      box(3); await wait(20);
      assert(UI.pmSpec().values.box === 'fill', 'Fill-In box active: ' + UI.pmSpec().values.box);
      rfQUClick(s3); await idle(); await wait(30);
      assert(JSON.stringify(UI.pmSpec().values.fill) === '[2]', 'into Fill-In Boundary: ' + JSON.stringify(UI.pmSpec().values.fill));
      // a rib out and back in
      box(1); await wait(20);
      var s4 = at(4.6, -3); rfQUClick(s4); await idle(); await wait(30);
      assert(UI.pmSpec().values.ribs.indexOf(3) < 0, 'rib out: ' + JSON.stringify(UI.pmSpec().values.ribs));
      rfQUClick(s4); await idle(); await wait(30);
      assert(UI.pmSpec().values.ribs.indexOf(3) >= 0, 'rib back: ' + JSON.stringify(UI.pmSpec().values.ribs));
      setInput(pmField('Rib width'), '0.1'); await idle(); setInput(pmField('Spar width'), '0.08'); await idle(); setInput(pmField('Radius for fillets'), '0.05'); await idle(); await wait(30);
      assert(!rfQUNoPreview(), 'previewed: ' + statusText());
      await rfQUDone();
      var vf = UI.App.model.features[n0];
      assert(vf && vf.type === 'vent' && vf.sketch === sk.id && JSON.stringify([vf.boundary, vf.spars, vf.fill]) === '[[0],[1],[2]]' && vf.ribs.length === 4 && vf.ribWidth === 0.1 && vf.sparWidth === 0.08 && vf.radius === 0.05, 'Vent1: ' + JSON.stringify(vf));
      assert(!rfQUErrs().length && rfQUClosed(), 'built closed: ' + rfQUErrs().join(' | '));   // (.02 / .01 here leave 6 / 12 open edges: kernel ventFillets, reported in the lane's report)
      var v1 = rfQUVol(), b1 = rfQUBlank(), open = (v0 - v1) / T16;
      notes.push('removed / T = ' + open.toFixed(6) + ', blank loses ' + (b0.area - b1.area).toFixed(6) + ' in ' + (b1.loops - b0.loops) + ' loops');
      near(b0.area - b1.area, open, 2e-3 * open, 'the flat loses the open area (chords against true arcs)');
      assert(b1.loops - b0.loops >= 9, 'the openings in the flat: ' + (b1.loops - b0.loops));
      await rfQUEdit(vf);
      vals = UI.pmSpec().values;
      assert(JSON.stringify([vals.boundary, vals.spars, vals.fill]) === '[[0],[1],[2]]' && +pmField('Rib width').value === 0.1 && +pmField('Radius for fillets').value === 0.05, 'Edit Feature: the boxes and widths');
      setInput(pmField('Rib width'), '0.15'); await idle();
      var u1 = UI.App.undo.length;
      await rfQUDone();
      var v2 = rfQUVol();
      assert(v2 > v1 && UI.App.undo.length === u1 + 1 && !rfQUErrs().length, 'wider ribs keep more metal');
      rfQUKey('z', { ctrlKey: true }); await idle(); await idle(); await UI.whenIdle();
      near(rfQUVol(), v1, 1e-12, 'Ctrl+Z');
      rfQUKey('y', { ctrlKey: true }); await idle(); await idle(); await UI.whenIdle();
      near(rfQUVol(), v2, 1e-12, 'Ctrl+Y');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });    step('rfQU: 9, Lofted-Bend by the mouse: three open profiles (a square 4 at y 0, a round Ø2 at y 3, a decoy Ø1.6 at y 5); the ribbon takes the last two; the square then the Ø2 clicked in the graphics area become Profile 1 / 2 (the Profiles were drop-downs only); Bent, Bends per arc 3 then 6 (4 x 3 + 4 = 16, then 28 bend lines in the flat); Edit Feature from the tree keeps them; Formed: no bend lines; ✗ / Ctrl+Z', async function () {
      var errs0 = errors.length, notes = [];
      await rfQUNewInch();
      await anvil.run('p.units("in");\np.sheet(' + T16 + ', ' + R06 + ', ' + K44 + ');\np.sketch("Top").polyline([[0, -2], [2, -2], [2, 2], [-2, 2], [-2, -2], [-0.001, -2]], false).end();\n' +
        'p.sketch("Top", 3).arc(0, 0, 1, 270.03, 360).arc(0, 0, 1, 0, 90).arc(0, 0, 1, 90, 180).arc(0, 0, 1, 180, 270).end();\n' +
        'p.sketch("Top", 5).arc(0, 0, 0.8, 270.03, 360).arc(0, 0, 0.8, 0, 90).arc(0, 0, 0.8, 90, 180).arc(0, 0, 0.8, 180, 270).end();\n'); await idle();
      UI.setView('Isometric'); UI.zoomToFit(); await idle(); await wait(30);
      var sks = UI.App.model.features.filter(function (g) { return g.type === 'sketch'; }), n0 = UI.App.model.features.length, u0 = UI.App.undo.length;
      rfQURibbon('Sheet Metal', /Lofted-Bend/); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Lofted-Bend', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
      rfQUCancel(); await idle();
      assert(!UI.hasPM() && UI.App.model.features.length === n0 && UI.App.undo.length === u0 && rfQUNoPreview(), '✗ leaves nothing');
      rfQURibbon('Sheet Metal', /Lofted-Bend/); await idle(); await wait(30);
      var v = UI.pmSpec().values;
      assert(v.p1 === String(sks[1].id) && v.p2 === String(sks[2].id), 'the last two sketches taken: ' + v.p1 + ' ' + v.p2);
      function clickSketch(P, id) { var s = UI.worldToScreen(P), pk = UI.pickSketchRefs(s[0], s[1]); assert(pk && pk.kind === 'sketchEntity' && pk.sketch === id, 'sketch ' + id + ' under the pointer: ' + JSON.stringify(pk)); rfQUClick(s); }
      clickSketch([2, 0, 0.5], sks[0].id); await idle(); await wait(30);
      clickSketch([1, 3, 0], sks[1].id); await idle(); await wait(30);
      v = UI.pmSpec().values;
      assert(v.p1 === String(sks[0].id) && v.p2 === String(sks[1].id), 'clicked: the square and the Ø2: ' + v.p1 + ' ' + v.p2 + ' ' + statusText());
      assert(!rfQUNoPreview(), 'previewed: ' + statusText());
      var bentR = D.querySelector('#pm input[data-key="method:bent"]'); if (!bentR.checked) { bentR.click(); await wait(20); }
      var cnt = D.querySelector('#pm input[data-key="faceting:count"]'); if (!cnt.checked) { cnt.click(); await wait(20); }
      setInput(pmField('Bends per arc'), '3'); await idle(); await wait(20);
      await rfQUDone();
      var lb = UI.App.model.features[n0];
      assert(lb && lb.type === 'loftedBend' && JSON.stringify(lb.sketches) === JSON.stringify([sks[0].id, sks[1].id]) && lb.method === 'bent' && lb.faceting === 'count' && lb.facetValue === 3 && !rfQUErrs().length, 'Lofted-Bend1: ' + JSON.stringify(lb) + rfQUErrs().join(' | '));
      var b3 = anvil.flat().bends.length;
      await rfQUEdit(lb);
      v = UI.pmSpec().values;
      assert(v.p1 === String(sks[0].id) && v.p2 === String(sks[1].id) && v.method === 'bent' && +pmField('Bends per arc').value === 3, 'Edit Feature: same values');
      setInput(pmField('Bends per arc'), '6'); await idle();
      await rfQUDone();
      var b6 = anvil.flat().bends.length;
      notes.push('bend lines: 3 per arc ' + b3 + ', 6 per arc ' + b6);
      assert(b3 === 4 * 3 + 4 && b6 === 4 * 6 + 4, 'a bend line per facet joint on the four arcs plus the square\'s four corners: ' + notes.join('; '));
      await rfQUEdit(K.findFeature(UI.App.model, lb.id));
      D.querySelector('#pm input[data-key="method:formed"]').click(); await wait(20);
      await rfQUDone();
      assert(!anvil.flat().bends.length && !rfQUErrs().length, 'Formed: no bend lines');
      rfQUKey('z', { ctrlKey: true }); await idle(); await idle(); await UI.whenIdle();
      assert(K.findFeature(UI.App.model, lb.id).method === 'bent' && anvil.flat().bends.length === b6, 'Ctrl+Z: bent, 6 per arc');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });  })();
