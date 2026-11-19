  // --- rfQQ (2026-11-19, lane shopmouse, test-reports/2026-11-19-shop-mouse.md) --- the sheet-metal commands driven
  // only by the mouse and keys, as at SolidWorks 2024: ribbon buttons, picks in the graphics area, PropertyManager
  // boxes typed into, arrows dragged, ✓ / ✗, Edit Feature from the tree, Ctrl+Z / Ctrl+Y. Self-contained; every
  // setting changed is put back.
  (function () {
    var T16 = 0.0598;
    function rfQQEv(type, p, target, extra) {
      var r = $('viewport').getBoundingClientRect(), o = { bubbles: true, cancelable: true, view: W, button: type === 'contextmenu' ? 2 : 0, buttons: type === 'mouseup' || type === 'click' || type === 'dblclick' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) };
      for (var k in extra || {}) o[k] = extra[k];
      (target || W).dispatchEvent(new W.MouseEvent(type, o));
    }
    async function rfQQDrag(a, b, target, n) {
      n = n || 8;
      rfQQEv('mousedown', a, target);
      for (var k = 1; k <= n; k++) { rfQQEv('mousemove', [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); if (k % 4 === 0) await wait(5); }
      rfQQEv('mouseup', b);
      await idle(); await wait(30);
    }
    async function rfQQNewInch() {
      var du = UI.defaultUnits();
      UI.setDefaultUnits('in');
      try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
    }
    function rfQQRowOf(f) { return Array.prototype.filter.call(D.querySelectorAll('#tree .ti'), function (r) { return r.getAttribute('data-fid') === String(f.id); })[0]; }
    function rfQQRowMouse(type, row) { var b = row.getBoundingClientRect(); row.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, view: W, button: type === 'contextmenu' ? 2 : 0, clientX: b.left + 20, clientY: b.top + b.height / 2 })); }
    function rfQQMenuItem(text) { return Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.trim().indexOf(text) >= 0; })[0]; }
    function rfQQErrs() { var e = UI.App.build.errors || {}; return Object.keys(e).map(function (k) { return e[k]; }); }
    function rfQQRibbon(tab, re) {
      UI.setRibbonTab(tab);
      var b = Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (x) { return re.test((x.getAttribute('aria-label') || '') + ' ' + (x.title || '') + ' ' + x.textContent); })[0];
      assert(b, tab + ' ribbon button ' + re); b.click();
    }
    // a command in a ribbon flyout (Corners): the caret, then its row; the flyout's face is put back to its first command
    async function rfQQFly(tab, group, text) {
      UI.setRibbonTab(tab);
      var w = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb-fly'), function (x) { return x._fly && x._fly.fly === group; })[0];
      assert(w, tab + ' flyout ' + group);
      var caret = w.querySelector('.rb-caret'); caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click(); await wait(20);
      var row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (r) { return r.textContent.indexOf(text) >= 0; })[0];
      assert(row, group + ' flyout row ' + text); row.click(); await idle(); await wait(20);
      UI.ribbonFlyFace(group, 0);
    }
    function rfQQKey(key, opts) { var o = { key: key, bubbles: true, cancelable: true }; for (var k in opts || {}) o[k] = opts[k]; if (D.activeElement && D.activeElement !== D.body) D.activeElement.blur(); D.dispatchEvent(new W.KeyboardEvent('keydown', o)); }
    function rfQQOk() { var b = D.querySelector('#pm .pm-ok'); assert(b, 'PM ✓'); b.click(); }
    function rfQQCancel() { var b = D.querySelector('#pm .pm-cancel'); assert(b, 'PM ✗'); b.click(); }

    step('rfQQ: 1a, an open-profile Base Flange double-clicked in the FeatureManager shows its depth arrow and its sketch\'s dimensions (it showed none); the arrow dragged to 5 rebuilds the flat', async function () {
      var errs0 = errors.length, i3dWas = UI.instant3DOn();
      await rfQQNewInch();
      await anvil.run('p.units("in");\np.sheet(' + T16 + ', 0.06, 0.5);\np.sketch("Front").line(3, 2, 3, 0).line(3, 0, 0, 0).line(0, 0, 0, 2).dim(1, "len", { value: 3 }).dim(0, "len", { value: 2 }).end();\n'); await idle();
      rfQQRibbon('Sheet Metal', /Base Flange/); await idle(); await wait(20);
      assert(UI.hasPM() && UI.pmTitle() === 'Base Flange/Tab', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
      setInput(pmField('Depth'), '4'); await idle();
      rfQQOk(); await idle(); await idle();
      var f = UI.App.model.features.filter(function (g) { return g.type === 'insertBends' && g.openBase; })[0];
      assert(f && +f.depth === 4, 'Base-Flange1 4 deep');
      if (i3dWas) UI.toggleInstant3D(false);
      try {
        UI.setView('Isometric'); UI.zoomToFit(); await idle(); await wait(30);
        rfQQRowMouse('dblclick', rfQQRowOf(f)); await idle();
        for (var q = 0; q < 60 && !D.querySelector('#i3d-layer .i3d-handle[data-kind="depth"]'); q++) { UI.drawDims(); await wait(25); }
        var hs = UI.instant3DHandles(), dep = hs.filter(function (h) { return h.kind === 'depth'; })[0], sd = hs.filter(function (h) { return h.kind === 'sdim'; });
        assert(dep && Math.abs(dep.value - 4) < 1e-9, 'a depth arrow: ' + JSON.stringify(hs.map(function (h) { return h.kind + ' ' + h.value; })));
        assert(sd.length === 2, 'the sketch\'s two dimensions: ' + sd.length);
        // drag the depth arrow to 5 on its ruler
        for (var z = 0; z < 14; z++) {
          var st = dep.step();
          if (Math.abs(5 / st - Math.round(5 / st)) < 1e-9 && st <= 1) break;
          UI.zoomView(st > 1 ? 0.8 : 1.15, dep.grab[0], dep.grab[1]); dep = UI.instant3DHandles().filter(function (h) { return h.kind === 'depth'; })[0];
        }
        var undoN = UI.App.undo.length;
        await rfQQDrag(dep.grab, UI.instant3DRulerPoint(dep, 5), D.querySelector('#i3d-layer .i3d-handle[data-kind="depth"]'));
        await UI.whenIdle(); await idle(); await wait(30);
        f = K.findFeature(UI.App.model, f.id);
        assert(Math.abs(+f.depth - 5) < 1e-9, 'depth dragged to 5: ' + f.depth);
        assert(UI.App.undo.length === undoN + 1, 'one undo step');
        var fl = anvil.flat(), Rt = 0.06 + T16, L = (2 - Rt) * 2 + (3 - 2 * Rt) + Math.PI * (0.06 + 0.5 * T16);
        near(Math.max(fl.size[0], fl.size[1]), Math.max(L, 5), 1e-6, 'flat long'); near(Math.min(fl.size[0], fl.size[1]), Math.min(L, 5), 1e-6, 'flat short');
      } finally { if (UI.instant3DEditOpen && UI.instant3DEditOpen()) UI.escapeCommand(); UI.toggleInstant3D(i3dWas); }
      assert(!rfQQErrs().length && errors.length === errs0, 'errors: ' + rfQQErrs().concat(errors.slice(errs0)).join(' | '));
      return 'depth + 2 sketch dims shown; dragged 4 -> 5';
    });

    step('rfQQ: 2, Base Flange/Tab from a closed 8 x 6 sketch by the ribbon: gauge table 16 ga, Override radius .06, K .44, Reverse direction; ✗ leaves nothing; ✓; Edit Feature from the tree reopens the Base Flange PM with the same values (it opened Sheet-Metal, without Reverse); Ctrl+Z / Ctrl+Y round trip', async function () {
      var errs0 = errors.length, notes = [];
      await rfQQNewInch();
      await anvil.run('p.units("in");\np.sketch("Top").rect(0, -6, 8, 6).end();\n'); await idle();
      var n0 = UI.App.model.features.length, undo0 = UI.App.undo.length;
      async function openIt() {
        rfQQRibbon('Sheet Metal', /Base Flange/); await idle(); await wait(20);
        assert(UI.hasPM() && UI.pmTitle() === 'Base Flange/Tab', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
      }
      await openIt();
      rfQQCancel(); await idle();
      assert(!UI.hasPM() && UI.App.model.features.length === n0 && !UI.App.model.sheet && UI.App.undo.length === undo0, '✗ leaves nothing');
      await openIt();
      var ug = pmField('Use gauge table');
      if (!ug.checked) { ug.click(); await idle(); }
      var tb = pmField('Table'); tb.value = Array.prototype.filter.call(tb.options, function (o) { return /steel/i.test(o.value + o.text) && !/stain|galv/i.test(o.text); })[0].value; tb.dispatchEvent(new W.Event('change', { bubbles: true })); await idle();
      var g = pmField('Gauge'); g.value = '16'; g.dispatchEvent(new W.Event('change', { bubbles: true })); await idle();
      near(+pmField('Thickness  T').value, T16, 1e-12, '16 ga thickness');
      assert(pmField('Thickness  T').disabled, 'T locked by the table');
      pmField('Override radius').click(); await idle();
      setInput(pmField('Bend radius'), '0.06'); await idle();
      var bt = pmField('Type'); bt.value = 'kfactor'; bt.dispatchEvent(new W.Event('change', { bubbles: true })); await idle();
      setInput(pmField('K-factor'), '0.44'); await idle();
      pmField('Reverse direction').click(); await idle(); await wait(30);
      rfQQOk(); await idle(); await idle();
      assert(!UI.hasPM(), 'PM closed');
      var f = UI.App.model.features[n0], sh = UI.App.model.sheet;
      assert(f && f.sheetBase && f.reverse && f.name === 'Base-Flange1', 'feature: ' + JSON.stringify(f));
      near(+sh.thickness, T16, 1e-12, 'T'); near(+sh.bendRadius, 0.06, 1e-12, 'R'); near(+sh.kFactor, 0.44, 1e-12, 'K');
      var ym = Infinity, yM = -Infinity;
      (UI.App.mesh.positions64 || UI.App.mesh.positions).forEach(function (x, i) { if (i % 3 === 1) { ym = Math.min(ym, x); yM = Math.max(yM, x); } });
      near(ym, -T16, 1e-9, 'reversed: down from the sketch'); near(yM, 0, 1e-9, 'top on the sketch');
      var fl = anvil.flat(); near(fl.size[0], 8, 1e-9, 'flat x'); near(fl.size[1], 6, 1e-9, 'flat y');
      // Edit Feature from the tree
      var row = rfQQRowOf(f); rfQQRowMouse('contextmenu', row); await wait(30);
      var mi = rfQQMenuItem('Edit Feature'); assert(mi, 'Edit Feature in the right-click menu'); mi.click(); await idle(); await wait(20);
      assert(UI.hasPM() && UI.pmTitle() === 'Base-Flange1', 'Edit Feature: ' + (UI.hasPM() && UI.pmTitle()));
      assert(pmField('Reverse direction') && pmField('Reverse direction').checked, 'Reverse direction kept');
      assert(pmField('Use gauge table').checked && pmField('Gauge').value === '16' && pmField('Override radius').checked, 'gauge 16, radius overridden');
      near(+pmField('Bend radius').value, 0.06, 1e-12, 'R shown'); near(+pmField('K-factor').value, 0.44, 1e-12, 'K shown');
      // un-reverse in the edit
      var undo1 = UI.App.undo.length;
      pmField('Reverse direction').click(); await idle();
      rfQQOk(); await idle(); await idle();
      f = K.findFeature(UI.App.model, f.id);
      assert(!f.reverse && UI.App.undo.length === undo1 + 1, 'edited: not reversed, one undo step');
      ym = Infinity; (UI.App.mesh.positions64 || UI.App.mesh.positions).forEach(function (x, i) { if (i % 3 === 1) ym = Math.min(ym, x); });
      near(ym, 0, 1e-9, 'up from the sketch');
      // Ctrl+Z twice: the edit, then the flange and its sheet
      rfQQKey('z', { ctrlKey: true }); await idle(); await idle();
      assert(K.findFeature(UI.App.model, f.id).reverse, 'Ctrl+Z: reversed again');
      rfQQKey('z', { ctrlKey: true }); await idle(); await idle();
      assert(UI.App.model.features.length === n0 && !UI.App.model.sheet, 'Ctrl+Z: no flange and no sheet: ' + JSON.stringify(UI.App.model.sheet));
      rfQQKey('y', { ctrlKey: true }); await idle(); await idle();
      rfQQKey('y', { ctrlKey: true }); await idle(); await idle();
      f = UI.App.model.features[n0];
      assert(f && !f.reverse && UI.App.model.sheet && Math.abs(UI.App.model.sheet.bendRadius - 0.06) < 1e-12, 'Ctrl+Y twice: back');
      assert(!rfQQErrs().length && errors.length === errs0, 'errors: ' + rfQQErrs().concat(errors.slice(errs0)).join(' | '));
      return '16 ga, R.06, K.44, reverse, edit, undo/redo';
    });

    var R06 = 0.06, K44 = 0.44;
    function rfQQBD(deg) { var A = deg * Math.PI / 180; return 2 * (R06 + T16) * Math.tan(A / 2) - A * (R06 + K44 * T16); }
    var TRAY = 'p.units("in");\np.sheet(' + T16 + ', ' + R06 + ', ' + K44 + ');\np.sketch("Top").rect(0, -6, 8, 6).end().baseFlange();\n';
    async function rfQQTray() {
      await rfQQNewInch();
      await anvil.run(TRAY); await idle();
      UI.setView('Isometric'); UI.zoomToFit(); await idle(); await wait(30);
    }
    function rfQQSel(key, val) { var s = pmField(key); assert(s, 'PM box ' + key); s.value = val; s.dispatchEvent(new W.Event('change', { bubbles: true })); }
    function rfQQSorted(fl) { return fl.size.slice().sort(function (a, b) { return b - a; }); }
    function rfQQPick(p) { selClick(UI.worldToScreen(p)); }
    function rfQQNoPreview() { return !UI.groups.preview.children.length; }

    step('rfQQ: 3, Edge Flange by the mouse on the 8 x 6 tray: ✗ leaves nothing; one edge clicked, Length 1 typed, Material Inside ✓ (6 + 1 - BD); Edit Feature from the tree, two side edges clicked ✓ (8 + 2 (1 - BD) x 7 - BD); Ctrl+Z / Ctrl+Y; the length arrow of a new flange dragged to 2', async function () {
      var errs0 = errors.length, notes = [], bd = rfQQBD(90);
      await rfQQTray();
      var n0 = UI.App.model.features.length, u0 = UI.App.undo.length;
      rfQQRibbon('Sheet Metal', /Edge Flange/); await idle(); await wait(20);
      assert(UI.hasPM() && UI.pmTitle() === 'Edge-Flange', 'PM: ' + (UI.hasPM() && UI.pmTitle()));
      rfQQPick([4, T16, 0]); await idle(); await wait(30);
      assert(UI.pmSpec().values.edges.length === 1, 'one edge picked');
      rfQQCancel(); await idle(); await wait(30);
      assert(!UI.hasPM() && UI.App.model.features.length === n0 && UI.App.undo.length === u0 && rfQQNoPreview(), '✗ leaves nothing');
      rfQQRibbon('Sheet Metal', /Edge Flange/); await idle(); await wait(20);
      rfQQPick([4, T16, 0]); await idle(); await wait(30);
      setInput(pmField('Length'), '1'); await idle();
      rfQQSel('Position', 'inside'); await idle();
      await wait(30);
      rfQQOk(); await idle(); await idle(); await UI.whenIdle();
      var ef = UI.App.model.features[n0];
      assert(ef && ef.type === 'flange' && ef.edges.length === 1 && +ef.length === 1 && ef.position === 'inside' && ef.lengthRef === 'outer', 'Edge-Flange1: ' + JSON.stringify(ef));
      var fl = rfQQSorted(anvil.flat());
      near(fl[0], 8, 1e-9, 'across'); near(fl[1], 7 - bd, 1e-6, 'along: 6 + 1 - BD');
      // Edit Feature: add the two side edges
      var row = rfQQRowOf(ef); rfQQRowMouse('contextmenu', row); await wait(30);
      rfQQMenuItem('Edit Feature').click(); await idle(); await wait(40);
      assert(UI.hasPM() && UI.pmTitle() === 'Edge-Flange1' && +pmField('Length').value === 1 && pmField('Position').value === 'inside', 'Edit Feature: same values');
      rfQQPick([0, T16, 3]); await idle(); await wait(20);
      rfQQPick([8, T16, 3]); await idle(); await wait(20);
      assert(UI.pmSpec().values.edges.length === 3, 'three edges: ' + UI.pmSpec().values.edges.length);
      var u1 = UI.App.undo.length;
      rfQQOk(); await idle(); await idle(); await UI.whenIdle();
      assert(UI.App.undo.length === u1 + 1 && !rfQQErrs().length, 'edited: ' + rfQQErrs().join(' | '));
      fl = rfQQSorted(anvil.flat());
      near(fl[0], 8 + 2 * (1 - bd), 1e-6, 'across 8 + 2 (1 - BD)'); near(fl[1], 7 - bd, 1e-6, 'along');
      assert(K.meshQuality(UI.App.mesh).openEdges === 0, 'closed');
      rfQQKey('z', { ctrlKey: true }); await idle(); await idle();
      assert(K.findFeature(UI.App.model, ef.id).edges.length === 1, 'Ctrl+Z: one edge');
      rfQQKey('y', { ctrlKey: true }); await idle(); await idle();
      assert(K.findFeature(UI.App.model, ef.id).edges.length === 3, 'Ctrl+Y: three edges');
      notes.push('flat ' + fl.map(function (x) { return x.toFixed(6); }).join(' x '));
      // a new flange on the back edge, its arrow dragged to 2
      rfQQRibbon('Sheet Metal', /Edge Flange/); await idle(); await wait(20);
      rfQQPick([4, T16, 6]); await idle(); await wait(60);
      rfQQSel('Position', 'inside'); await idle(); await wait(60);
      var h;
      for (var q = 0; q < 60; q++) { h = UI.instant3DHandles().filter(function (x) { return x.kind === 'pm' && x.key === 'length'; })[0]; if (h && D.querySelector('#i3d-layer .i3d-handle[data-kind="pm"]')) break; UI.drawDims && UI.drawDims(); await wait(25); }
      assert(h, 'the length arrow');
      for (var z = 0; z < 14; z++) {
        var st = h.step();
        if (Math.abs(2 / st - Math.round(2 / st)) < 1e-9 && st <= 0.5) break;
        UI.zoomView(st > 0.5 ? 0.8 : 1.15, h.grab[0], h.grab[1]); h = UI.instant3DHandles().filter(function (x) { return x.kind === 'pm' && x.key === 'length'; })[0];
      }
      await rfQQDrag(h.grab, UI.instant3DRulerPoint(h, 2), D.querySelector('#i3d-layer .i3d-handle[data-kind="pm"]'));
      near(+pmField('Length').value, 2, 1e-9, 'the box follows the arrow');
      rfQQOk(); await idle(); await idle(); await UI.whenIdle();
      var ef2 = UI.App.model.features[UI.App.model.features.length - 1];
      assert(ef2.type === 'flange' && +ef2.length === 2 && !rfQQErrs().length, 'Edge-Flange2 2 long: ' + ef2.length + ' ' + rfQQErrs().join(' | '));
      fl = rfQQSorted(anvil.flat());
      near(fl[1], 6 + 1 - bd + 2 - bd, 1e-6, 'along 6 + (1 - BD) + (2 - BD)');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });

    async function rfQQEdit(f, title) {
      var row = rfQQRowOf(f); assert(row, 'tree row of ' + f.name); rfQQRowMouse('contextmenu', row); await wait(30);
      var mi = rfQQMenuItem('Edit Feature'); assert(mi, 'Edit Feature'); mi.click(); await idle(); await wait(40);
      assert(UI.hasPM() && UI.pmTitle() === (title || f.name), 'Edit Feature PM: ' + (UI.hasPM() && UI.pmTitle()));
    }
    step('rfQQ: 3b, Edge Flange PropertyManager boxes by Edit Feature on one flange, Length 1: Material Inside / Material Outside / Bend Outside give 6 + 1 - BD, + T, + R + T; Tangent to Bend builds; Flange angle 60 and 120 (flats + BA)', async function () {
      var errs0 = errors.length, notes = [];
      await rfQQTray();
      await anvil.run(TRAY + 'p.flange(1, [[4, ' + T16 + ', 0]], { position: "inside", lengthRef: "outer" });\n'); await idle();
      UI.setView('Isometric'); UI.zoomToFit(); await idle(); await wait(30);
      var ef = UI.App.model.features.filter(function (g) { return g.type === 'flange'; })[0];
      async function variant(set, want, label) {
        await rfQQEdit(ef);
        for (var k in set) { if (k === 'angle') setInput(pmField('Flange angle'), String(set[k])); else rfQQSel('Position', set[k]); await idle(); await wait(20); }
        rfQQOk(); await idle(); await idle(); await UI.whenIdle();
        ef = K.findFeature(UI.App.model, ef.id);
        assert(!rfQQErrs().length, label + ': ' + rfQQErrs().join(' | '));
        var fl = rfQQSorted(anvil.flat());
        notes.push(label + ' ' + fl[1].toFixed(6) + (want != null ? ' (want ' + want.toFixed(6) + ')' : ''));
        if (want != null) near(fl[1], want, 1e-6, label);
        return fl;
      }
      var bd = rfQQBD(90);
      await variant({ position: 'outside' }, 7 + T16 - bd, 'Material Outside');
      await variant({ position: 'bendOutside' }, 7 + R06 + T16 - bd, 'Bend Outside');
      await variant({ position: 'tangentToBend' }, null, 'Tangent to Bend');
      await variant({ position: 'inside' }, 7 - bd, 'Material Inside');
      // flange angle 60 / 120, Material Inside: the flange's outer face runs through the picked (top) edge, so the outer
      // virtual sharp is T / tan(A) inside the base's end; Length 1 to it: (6 - T / tan A) + 1 - BD(A)
      function want(a) { return 6 - T16 / Math.tan(a * Math.PI / 180) + 1 - rfQQBD(a); }
      await variant({ angle: 60 }, want(60), 'angle 60');
      await variant({ angle: 120 }, want(120), 'angle 120');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });

    step('rfQQ: 3c, Custom Relief Type by the mouse: a side flange 6 long (stops short of the front flange\'s bend, Material Inside) with Rectangle ratio .5, Tear, Obround ratio 1, then Trim side bends: each box goes into the feature, Edit Feature shows it, builds closed', async function () {
      var errs0 = errors.length, notes = [];
      await rfQQTray();
      await anvil.run(TRAY + 'p.flange(1, [[4, ' + T16 + ', 0]], { position: "inside", lengthRef: "outer" });\n'); await idle();
      UI.setView('Isometric'); UI.zoomToFit(); await idle(); await wait(30);
      var n0 = UI.App.model.features.length;
      rfQQRibbon('Sheet Metal', /Edge Flange/); await idle(); await wait(20);
      rfQQPick([8, T16, 3]); await idle(); await wait(30);
      assert(UI.pmSpec().values.edges.length === 1, 'the side edge');
      setInput(pmField('Length'), '1'); rfQQSel('Position', 'inside'); await idle();
      pmField('Custom relief type').click(); await idle();
      rfQQSel('Relief type', 'rect'); await idle();
      pmField('Use relief ratio').click(); await idle();
      setInput(pmField('Ratio'), '0.5'); await idle(); await wait(30);
      rfQQOk(); await idle(); await idle(); await UI.whenIdle();
      var sf = UI.App.model.features[n0];
      function check(label, want) {
        sf = K.findFeature(UI.App.model, sf.id);
        for (var k in want) assert(JSON.stringify(sf[k]) === JSON.stringify(want[k]), label + ': ' + k + ' = ' + JSON.stringify(sf[k]));
        assert(!rfQQErrs().length && K.meshQuality(UI.App.mesh).openEdges === 0, label + ' builds closed: ' + rfQQErrs().join(' | '));
        notes.push(label + ' flat ' + rfQQSorted(anvil.flat()).map(function (x) { return x.toFixed(4); }).join(' x '));
      }
      check('rect .5', { relief: 'rect', reliefRatio: 0.5 });
      await rfQQEdit(sf);
      assert(pmField('Custom relief type').checked && pmField('Relief type').value === 'rect' && pmField('Use relief ratio').checked && +pmField('Ratio').value === 0.5, 'Edit Feature: the relief as set');
      rfQQSel('Relief type', 'tear'); await idle(); rfQQOk(); await idle(); await idle(); await UI.whenIdle();
      check('tear', { relief: 'tear' });
      await rfQQEdit(sf);
      rfQQSel('Relief type', 'obround'); await idle();
      if (!pmField('Use relief ratio').checked) { pmField('Use relief ratio').click(); await idle(); }
      setInput(pmField('Ratio'), '1'); await idle();
      rfQQOk(); await idle(); await idle(); await UI.whenIdle();
      check('obround 1', { relief: 'obround', reliefRatio: 1 });
      await rfQQEdit(sf);
      pmField('Trim side bends').click(); await idle(); rfQQOk(); await idle(); await idle(); await UI.whenIdle();
      check('trim side bends', { trimSideBends: true });
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });

    function rfQQIcon(key) { var b = D.querySelector('#pm [data-key="' + key + '"]'); assert(b, 'PM button ' + key); b.click(); }
    function rfQQZExtent() { var lo = Infinity, hi = -Infinity; (UI.App.mesh.positions64 || UI.App.mesh.positions).forEach(function (x, i) { if (i % 3 === 2) { lo = Math.min(lo, x); hi = Math.max(hi, x); } }); return [lo, hi]; }
    step('rfQQ: 4, Hem by the mouse on the tray\'s front edge: ✗ leaves nothing; Closed .5 Material Inside ✓; Edit Feature: Open (gap .03), Tear Drop (R .06), Rolled (R .06, 270) by the Type buttons, Bend Outside: each into the feature, closed; Ctrl+Z / Ctrl+Y', async function () {
      var errs0 = errors.length, notes = [];
      await rfQQTray();
      var n0 = UI.App.model.features.length, u0 = UI.App.undo.length;
      rfQQRibbon('Sheet Metal', /^\s*Hem\b|\bHem\b/); await idle(); await wait(20);
      assert(UI.hasPM() && UI.pmTitle() === 'Hem', 'Hem PM: ' + (UI.hasPM() && UI.pmTitle()));
      rfQQPick([4, T16, 0]); await idle(); await wait(30);
      rfQQCancel(); await idle(); await wait(20);
      assert(UI.App.model.features.length === n0 && UI.App.undo.length === u0 && rfQQNoPreview(), '✗ leaves nothing');
      rfQQRibbon('Sheet Metal', /^\s*Hem\b|\bHem\b/); await idle(); await wait(20);
      rfQQPick([4, T16, 0]); await idle(); await wait(30);
      rfQQIcon('hemType:closed'); await idle();
      rfQQIcon('hemPosition:inside'); await idle();
      setInput(pmField('Hem length'), '0.5'); await idle(); await wait(30);
      rfQQOk(); await idle(); await idle(); await UI.whenIdle();
      var hm = UI.App.model.features[n0];
      function check(label, want) {
        hm = K.findFeature(UI.App.model, hm.id);
        for (var k in want) assert(Math.abs(+hm[k] - +want[k]) < 1e-12 || hm[k] === want[k], label + ': ' + k + ' = ' + JSON.stringify(hm[k]) + ' want ' + want[k]);
        assert(!rfQQErrs().length && K.meshQuality(UI.App.mesh).openEdges === 0, label + ' builds closed: ' + rfQQErrs().join(' | '));
        notes.push(label + ' flat ' + rfQQSorted(anvil.flat())[1].toFixed(6));
      }
      // a hem of radius r, Material Inside, Length .5 to its outside: 6 - 2 (r + T) + pi (r + K T) + .5 (a Closed hem's r is 1 / 508, rfQI)
      function hemFlat(r) { return 6 - 2 * (r + T16) + Math.PI * (r + K44 * T16) + 0.5; }
      check('closed .5', { hem: true, hemType: 'closed', hemPosition: 'inside', length: 0.5 });
      near(rfQQSorted(anvil.flat())[1], hemFlat(1 / 508), 1e-6, 'closed hem flat');
      await rfQQEdit(hm);
      assert(D.querySelector('#pm [data-key="hemType:closed"]').classList.contains('on') && +pmField('Hem length').value === 0.5, 'Edit Feature: Closed .5');
      rfQQIcon('hemType:open'); await idle(); setInput(pmField('Gap distance'), '0.03'); await idle();
      rfQQOk(); await idle(); await idle(); await UI.whenIdle();
      check('open gap .03', { hemType: 'open', radius: 0.015 });
      near(rfQQSorted(anvil.flat())[1], hemFlat(0.015), 1e-6, 'open hem flat');
      await rfQQEdit(hm);
      rfQQIcon('hemType:teardrop'); await idle(); setInput(pmField('Radius'), '0.06'); await idle();
      rfQQOk(); await idle(); await idle(); await UI.whenIdle();
      check('tear drop R.06', { hemType: 'teardrop', hemRadius: 0.06 });
      await rfQQEdit(hm);
      rfQQIcon('hemType:rolled'); await idle(); setInput(pmField('Radius'), '0.06'); setInput(pmField('Angle'), '270'); await idle();
      rfQQIcon('hemPosition:outside'); await idle();
      rfQQOk(); await idle(); await idle(); await UI.whenIdle();
      check('rolled R.06 270 bend outside', { hemType: 'rolled', hemRadius: 0.06, hemAngle: 270, hemPosition: 'outside' });
      rfQQKey('z', { ctrlKey: true }); await idle(); await idle();
      assert(K.findFeature(UI.App.model, hm.id).hemType === 'teardrop', 'Ctrl+Z: tear drop');
      rfQQKey('y', { ctrlKey: true }); await idle(); await idle();
      assert(K.findFeature(UI.App.model, hm.id).hemType === 'rolled', 'Ctrl+Y: rolled');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });

    step('rfQQ: 4b, Jog by the mouse: a line across the tray (z = 3), Jog on the ribbon, the front half clicked as the fixed face, Offset .5 Outside Offset ✓: the flat stays 8 x 6, the back half up .5; Edit Feature: Fix projected length ✓: the folded part keeps its 6, Ctrl+Z; then Sketched Bend on the same line, Bend position Material Inside, angle 90 ✓: the flat 8 x 6', async function () {
      var errs0 = errors.length, notes = [];
      await rfQQTray();
      await anvil.run(TRAY + 'p.sketch("Top", ' + T16 + ').line(0, -3, 8, -3).end();\n'); await idle();
      UI.setView('Isometric'); UI.zoomToFit(); await idle(); await wait(30);
      var n0 = UI.App.model.features.length;
      rfQQRibbon('Sheet Metal', /\bJog\b/); await idle(); await wait(20);
      assert(UI.hasPM() && UI.pmTitle() === 'Jog', 'Jog PM: ' + (UI.hasPM() && UI.pmTitle()));
      rfQQPick([4, T16, 1.5]); await idle(); await wait(30);
      var fx = UI.pmSpec().values.fixed;
      assert(fx && fx[2] < 3, 'the front half fixed: ' + JSON.stringify(fx));
      setInput(pmField('Offset distance'), '0.5'); rfQQSel('Dimension position', 'outside'); await idle(); await wait(30);
      rfQQOk(); await idle(); await idle(); await UI.whenIdle();
      var jg = UI.App.model.features[n0];
      assert(jg && jg.type === 'jog' && +jg.offset === 0.5 && jg.offsetRef === 'outside' && !rfQQErrs().length, 'Jog1: ' + JSON.stringify(jg) + rfQQErrs().join(' | '));
      var fl = rfQQSorted(anvil.flat()); near(fl[0], 8, 1e-9, 'flat 8'); near(fl[1], 6, 1e-6, 'flat 6 (the jog uses up length)');
      var yHi = -Infinity; (UI.App.mesh.positions64 || UI.App.mesh.positions).forEach(function (x, i) { if (i % 3 === 1) yHi = Math.max(yHi, x); });
      near(yHi, 0.5 + T16, 1e-6, 'Outside Offset .5: the jogged top face .5 above the fixed top face');
      notes.push('jog: top ' + yHi.toFixed(6) + ', z ' + rfQQZExtent().map(function (x) { return x.toFixed(4); }).join('..'));
      await rfQQEdit(jg);
      assert(+pmField('Offset distance').value === 0.5 && pmField('Dimension position').value === 'outside', 'Edit Feature: same values');
      pmField('Fix projected length').click(); await idle(); rfQQOk(); await idle(); await idle(); await UI.whenIdle();
      jg = K.findFeature(UI.App.model, jg.id);
      assert(jg.fixLength && !rfQQErrs().length, 'fixLength: ' + rfQQErrs().join(' | '));
      var ze = rfQQZExtent(); near(ze[1] - ze[0], 6, 1e-6, 'projected length kept');
      notes.push('fixed: flat ' + rfQQSorted(anvil.flat())[0].toFixed(6));
      rfQQKey('z', { ctrlKey: true }); await idle(); await idle();
      rfQQKey('z', { ctrlKey: true }); await idle(); await idle();
      assert(UI.App.model.features.length === n0, 'Ctrl+Z twice: no jog');
      // Sketched Bend on the same sketch line
      rfQQRibbon('Sheet Metal', /Sketched Bend/); await idle(); await wait(20);
      assert(UI.hasPM() && UI.pmTitle() === 'Sketched Bend', 'Sketched Bend PM: ' + (UI.hasPM() && UI.pmTitle()));
      rfQQPick([4, T16, 1.5]); await idle(); await wait(20);
      rfQQSel('Bend position', 'inside'); setInput(pmField('Bend angle'), '90'); await idle(); await wait(30);
      rfQQOk(); await idle(); await idle(); await UI.whenIdle();
      var sb = UI.App.model.features[n0];
      assert(sb && sb.type === 'sketchedBend' && sb.position === 'inside' && +sb.angle === 90 && !rfQQErrs().length, 'Sketched Bend1: ' + JSON.stringify(sb) + rfQQErrs().join(' | '));
      fl = rfQQSorted(anvil.flat()); near(fl[0], 8, 1e-9, 'flat 8'); near(fl[1], 6, 1e-6, 'flat 6');
      await rfQQEdit(sb);
      assert(pmField('Bend position').value === 'inside', 'Edit Feature: Material Inside');
      rfQQCancel(); await idle();
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });
    var TRAY4 = TRAY + 'p.flange(1, [[4, ' + T16 + ', 0], [8, ' + T16 + ', 3], [4, ' + T16 + ', 6], [0, ' + T16 + ', 3]], { position: "inside", lengthRef: "outer" });\n';
    // the narrow end face of the back flange (the wall on z = 6) at its x = 8 end, as the mouse picks it
    function rfQQFrontEnd() {
      var best = null;
      UI.App.mesh.faces.forEach(function (fc, i) {
        if (!fc.normal || fc.normal[0] < 0.999 || fc.centroid[1] < 0.3 || fc.centroid[0] < 7) return;   // (the front and back flanges' end faces are one plane: its centroid is mid-tray)
        if (!best || fc.area < best.area) best = { i: i, c: [fc.centroid[0], fc.centroid[1], 6 - T16 / 2], area: fc.area };   // the back flange's end: the one the isometric view shows
      });
      return best;
    }
    function rfQQMaxX(pred) { var m = -Infinity, P = UI.App.mesh.positions64 || UI.App.mesh.positions; for (var i = 0; i < P.length; i += 3) if (pred(P[i], P[i + 1], P[i + 2])) m = Math.max(m, P[i]); return m; }
    step('rfQQ: 5, Closed Corner by the mouse on a four-flange tray: the back flange\'s end face clicked, Butt then Overlap (ratio .5), gap .002 typed (.01 is refused: the four flanges\' corners are .0071 apart); ✓ builds closed with the gap measured; Edit Feature shows the values; ✗ leaves nothing; Break-Corner chamfer .25 on a clicked corner edge', async function () {
      var errs0 = errors.length, notes = [];
      await rfQQNewInch();
      await anvil.run(TRAY4); await idle();
      UI.setView('Isometric'); UI.zoomToFit(); await idle(); await wait(30);
      var n0 = UI.App.model.features.length, u0 = UI.App.undo.length;
      var x0 = rfQQMaxX(function (x, y, z) { return z > 6 - T16 / 2 && y > 0.5; });
      notes.push('back flange end before ' + x0.toFixed(6));
      await rfQQFly('Sheet Metal', 'corners', 'Closed Corner');
      assert(UI.hasPM() && UI.pmTitle() === 'Closed Corner', 'Closed Corner PM: ' + (UI.hasPM() && UI.pmTitle()));
      var fe = rfQQFrontEnd(); assert(fe, 'the front flange\'s end face: ' + JSON.stringify(UI.App.mesh.faces.filter(function (fc) { return fc.normal && Math.abs(fc.normal[0]) > 0.99; }).map(function (fc) { return [fc.normal[0], fc.centroid.map(function (x) { return +x.toFixed(3); }), +fc.area.toFixed(4)]; })));
      rfQQPick(fe.c); await idle(); await wait(30);
      assert(UI.pmSpec().values.faces.length === 1, 'one face to extend: ' + statusText());
      rfQQCancel(); await idle(); await wait(20);
      assert(UI.App.model.features.length === n0 && UI.App.undo.length === u0 && rfQQNoPreview(), '✗ leaves nothing');
      await rfQQFly('Sheet Metal', 'corners', 'Closed Corner');
      rfQQPick(fe.c); await idle(); await wait(30);
      rfQQIcon('cornerType:butt'); await idle();
      setInput(pmField('Gap distance'), '0.002'); await idle(); await wait(30);
      rfQQOk(); await idle(); await idle(); await UI.whenIdle();
      var cc = UI.App.model.features[n0];
      assert(cc && cc.type === 'closedCorner' && cc.cornerType === 'butt' && +cc.gap === 0.002 && !rfQQErrs().length, 'Closed Corner1: ' + JSON.stringify(cc) + rfQQErrs().join(' | ') + ' PM open ' + UI.hasPM() + ' ' + statusText() + ' min gap ' + K.closedCornerMinGap(UI.App.model));
      assert(K.meshQuality(UI.App.mesh).openEdges === 0, 'closed');
      var x1 = rfQQMaxX(function (x, y, z) { return z > 6 - T16 / 2 && y > 0.5; });
      notes.push('butt: back end ' + x1.toFixed(6));
      near(x1, 8 - T16 - 0.002 / Math.SQRT2, 1e-6, 'butt: the end gap / sqrt 2 short of the side flange\'s inside face (lane DV: the gap measured diagonally)');
      await rfQQEdit(cc);
      assert(D.querySelector('#pm [data-key="cornerType:butt"]').classList.contains('on') && +pmField('Gap distance').value === 0.002, 'Edit Feature: butt, .002');
      rfQQIcon('cornerType:overlap'); await idle(); setInput(pmField('Overlap/underlap ratio'), '0.5'); await idle();
      rfQQOk(); await idle(); await idle(); await UI.whenIdle();
      cc = K.findFeature(UI.App.model, cc.id);
      assert(cc.cornerType === 'overlap' && +cc.ratio === 0.5 && !rfQQErrs().length && K.meshQuality(UI.App.mesh).openEdges === 0, 'overlap .5: ' + rfQQErrs().join(' | '));
      var x2 = rfQQMaxX(function (x, y, z) { return z > 6 - T16 / 2 && y > 0.5; });
      notes.push('overlap: back end ' + x2.toFixed(6));
      near(x2, 8 - T16 + 0.5 * T16, 1e-6, 'overlap .5: half way into the side flange');
      // Break-Corner on the flat tray: the corner edge through the thickness at (8, 6) clicked, Chamfer .25: 48 - .25^2 / 2
      await rfQQTray();
      var n1 = UI.App.model.features.length;
      await rfQQFly('Sheet Metal', 'corners', 'Break-Corner');
      assert(UI.hasPM(), 'Break-Corner PM');
      rfQQPick([8, T16 / 2, 6]); await idle(); await wait(30);
      rfQQIcon('kind:chamfer'); await idle(); setInput(pmField('Distance'), '0.25'); await idle(); await wait(30);
      rfQQOk(); await idle(); await idle(); await UI.whenIdle();
      var bc = UI.App.model.features[n1];
      assert(bc && !rfQQErrs().length, 'Break-Corner1: ' + JSON.stringify(bc) + ' ' + rfQQErrs().join(' | ') + ' ' + statusText());
      near(UI.App.build.body.volume(), (48 - 0.25 * 0.25 / 2) * T16, 1e-9, 'chamfer .25 on one corner');
      notes.push(bc.name + ' ' + JSON.stringify(bc).slice(0, 120));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });
    function rfQQYExtent() { var lo = Infinity, hi = -Infinity; (UI.App.mesh.positions64 || UI.App.mesh.positions).forEach(function (x, i) { if (i % 3 === 1) { lo = Math.min(lo, x); hi = Math.max(hi, x); } }); return [lo, hi]; }
    step('rfQQ: 6, Unfold (the base face clicked, Collect All Bends) ✓ lies the front flange flat: 7 - BD long, T thick; Fold (Collect All Bends) ✓ folds it back; the Flatten button toggles the flat and back; a right-click on a face ▸ Export to DXF / DWG opens DXF/DWG Output on Sheet metal with Bend lines and Bend notes (the face menu had no export)', async function () {
      var errs0 = errors.length, notes = [], bd = rfQQBD(90);
      await rfQQTray();
      await anvil.run(TRAY + 'p.flange(1, [[4, ' + T16 + ', 0]], { position: "inside", lengthRef: "outer" });\n'); await idle();
      UI.setView('Isometric'); UI.zoomToFit(); await idle(); await wait(30);
      var n0 = UI.App.model.features.length;
      rfQQRibbon('Sheet Metal', /\bUnfold\b/); await idle(); await wait(20);
      assert(UI.hasPM() && UI.pmTitle() === 'Unfold', 'Unfold PM: ' + (UI.hasPM() && UI.pmTitle()));
      rfQQPick([4, T16, 3]); await idle(); await wait(20);
      clickPmButton('Collect All Bends'); await idle(); await wait(30);
      rfQQOk(); await idle(); await idle(); await UI.whenIdle();
      var uf = UI.App.model.features[n0];
      assert(uf && uf.type === 'unfold' && !rfQQErrs().length, 'Unfold1: ' + JSON.stringify(uf) + rfQQErrs().join(' | '));
      var ye = rfQQYExtent(), ze = rfQQZExtent();
      near(ye[1] - ye[0], T16, 1e-9, 'unfolded: T thick'); near(ze[1] - ze[0], 7 - bd, 1e-6, 'unfolded: 6 + 1 - BD');
      notes.push('unfolded z ' + ze.map(function (x) { return x.toFixed(6); }).join('..'));
      rfQQRibbon('Sheet Metal', /\bFold\b/); await idle(); await wait(20);
      assert(UI.hasPM() && UI.pmTitle() === 'Fold', 'Fold PM: ' + (UI.hasPM() && UI.pmTitle()));
      clickPmButton('Collect All Bends'); await idle(); await wait(30);
      rfQQOk(); await idle(); await idle(); await UI.whenIdle();
      assert(UI.App.model.features[n0 + 1].type === 'fold' && !rfQQErrs().length, 'Fold1: ' + rfQQErrs().join(' | '));
      ye = rfQQYExtent(); near(ye[1] - ye[0], 1, 1e-6, 'folded back: 1 high');
      // Flatten on, off
      rfQQRibbon('Sheet Metal', /\bFlatten\b/); await idle(); await UI.whenIdle(); await idle(); await wait(30);
      assert(UI.App.model.flatState, 'flattened');
      assert(UI.App.flat, 'the flat shown: ' + statusText());
      var fs = rfQQSorted(UI.App.flat); near(fs[0], 8, 1e-9, 'flat 8'); near(fs[1], 7 - bd, 1e-6, 'flat 7 - BD');
      rfQQRibbon('Sheet Metal', /\bFlatten\b/); await idle(); await UI.whenIdle(); await idle(); await wait(30);
      assert(!UI.App.model.flatState, 'folded');
      // right-click the base's top face ▸ Export to DXF / DWG
      var p = UI.worldToScreen([4, T16, 3]);
      rfQQEv('contextmenu', p, $('viewport').querySelector('canvas') || $('viewport')); await wait(40);
      var mi = rfQQMenuItem('Export to DXF / DWG');
      assert(mi, 'Export to DXF / DWG on the face menu: ' + Array.prototype.map.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.trim(); }).join(' | '));
      mi.click(); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'DXF/DWG Output', 'DXF/DWG Output: ' + (UI.hasPM() && UI.pmTitle()));
      var v = UI.pmSpec().values;
      assert(v.export === 'sheet' && v.bendLines && v.notes, 'Sheet metal, bend lines, bend notes: ' + JSON.stringify({ e: v.export, b: v.bendLines, n: v.notes }));
      rfQQCancel(); await idle();
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });
    step('rfQQ: 1b, an equation whose variable is deleted in Tools > Equations (D1@Sketch1 = W, W deleted by its row\'s delete button, OK): the Equations folder turns red with a D1@Sketch1 row, and the status line names it (the folder showed nothing)', async function () {
      var errs0 = errors.length;
      await rfQQNewInch();
      await anvil.run('p.units("in");\np.equations({ W: 6, H: 4 });\np.sketch("Front").line(0, 0, 6, 0).line(6, 0, 6, 4).line(6, 4, 0, 4).line(0, 4, 0, 0).dim(0, "len", { value: 6 }).end().extrude(1);\n'); await idle();
      // setup: D1 linked to W as the Modify box stores "=W" (rfQL types it)
      var sk = UI.App.model.features.filter(function (g) { return g.type === 'sketch'; })[0]; UI.pushUndo(); sk.dims[0].expr = '=W'; await UI.afterRebuild(UI.rebuild(), function () { }); await idle();
      var rows = menuRows('Equations');
      assert(rows.length, 'Tools > Equations'); rows[0].row.click(); if (UI.closeMenus) UI.closeMenus(); await wait(30);
      var wr = Array.prototype.filter.call(D.querySelectorAll('#eq-table tr.eq-row'), function (tr) { return tr.querySelector('.eq-name').value === 'W'; })[0];
      assert(wr, 'the W row'); wr.querySelector('.eq-del').click(); await wait(20);
      $('eq-ok').click(); await anvil.idle(); await idle(); await wait(30);
      var ee = UI.App.build.equationErrors || {};
      assert(ee['D1@Sketch1'], 'D1@Sketch1 an equation error: ' + JSON.stringify(ee));
      var fo = D.querySelector('#tree .eq-folder');
      assert(fo && fo.classList.contains('err'), 'the Equations folder red');
      var r = D.querySelector('#tree .eq-row.err[data-eq="D1@Sketch1"]');
      assert(r && /D1@Sketch1 =W/.test(r.textContent), 'a red D1@Sketch1 row: ' + (r && r.textContent));
      rfQQRowMouse('click', r); await wait(10);
      assert(/Equation D1@Sketch1: .*W/.test(statusText()), 'status: ' + statusText());
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return r.textContent + ' | ' + statusText().slice(0, 100);
    });  })();
