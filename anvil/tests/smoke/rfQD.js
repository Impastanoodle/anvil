  // --- rfQD (2026-11-19, lane shopflow8, test-reports/2026-11-19-shop-flow-8.md) --- the shop audit, round 8, driven
  // like a user: an R12 flat DXF saved as DWG through the page's writer (it was refused up front); a configured flange
  // length dragged by its arrow goes to This configuration as a typed value does (the drag wrote a plain number and
  // unlinked it), an equation-driven one is refused with the reason. Self-contained; every setting changed is put back.
  (function () {
    var T14 = 0.0747, R09 = 0.09, K44 = 0.44;
    function rfQDBD(R, T, Kf, deg) { var A = deg * Math.PI / 180; return 2 * (R + T) * Math.tan(A / 2) - A * (R + Kf * T); }
    function rfQDEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, view: W, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    async function rfQDDrag(a, b, target, n) {
      n = n || 8;
      rfQDEv('mousedown', a, target);
      for (var k = 1; k <= n; k++) { rfQDEv('mousemove', [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); if (k % 4 === 0) await wait(5); }
      rfQDEv('mouseup', b);
      await idle(); await wait(30);
    }
    async function rfQDNewInch() {
      var du = UI.defaultUnits();
      UI.setDefaultUnits('in');
      try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
    }
    function rfQDByName(n) { return UI.App.model.features.filter(function (f) { return f.name === n; })[0]; }
    function rfQDLong(fl, w) { return fl.size[0] === w ? fl.size[1] : Math.abs(fl.size[1] - w) < 1e-6 ? fl.size[0] : Math.max(fl.size[0], fl.size[1]); }

    step('rfQD: task 1, a flat written as R12 (AC1009, POLYLINE) is saved as DWG by the page\'s writer without any request to the server (it was refused up front): AC1015 bytes', async function () {
      var errs0 = errors.length;
      if (!(W.DWG && W.DWG.fromDXF)) return 'skipped: dwg-writer.js not loaded';
      await rfQDNewInch();
      await anvil.run('p.units("in");\np.sheet(' + T14 + ', ' + R09 + ', ' + K44 + ');\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1.5, [[3, ' + T14 + ', 0]], { position: "inside", lengthRef: "outer" });\np.sketch("Top").circle(3, -2, 0.25).end();\np.extrude(1, { cut: true, end: "through" });\n'); await idle();
      var r12 = UI.dxfOutput({ export: 'sheet', version: 'R12', style: 'polyline', bendLines: true });
      assert(/AC1009/.test(r12) && /\n0\nPOLYLINE\n|\r\n0\r\nPOLYLINE\r\n/.test(r12), 'an R12 flat with POLYLINEs');
      var real = W.fetch, calls = 0, buf = null;
      W.fetch = function () { calls++; return real.apply(W, arguments); };
      try { buf = await UI.dxfToDwg(r12); } finally { W.fetch = real; }
      var b = new W.Uint8Array(buf);
      assert(calls === 0 && String.fromCharCode.apply(null, Array.prototype.slice.call(b, 0, 6)) === 'AC1015' && b.length > 2000, 'DWG written in the page: ' + calls + ' requests, ' + b.length + ' bytes');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'R12 ' + r12.length + ' chars -> DWG ' + b.length + ' bytes';
    });

    step('rfQD: task 2, a flange length linked per configuration (BR-A 1.5, BR-B 2.5 typed with This configuration), its arrow dragged to 2 in BR-B: BR-B 2, BR-A still 1.5, the feature still linked; with the configuration\'s value an equation the drag is refused with the reason', async function () {
      var errs0 = errors.length, notes = [];
      await rfQDNewInch();
      await anvil.run('p.units("in");\np.sheet(' + T14 + ', ' + R09 + ', ' + K44 + ');\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1.5, [[3, ' + T14 + ', 0]], { position: "inside", lengthRef: "outer" });\n'); await idle();
      try {
        D.querySelector('[data-tab="config"]').click(); await wait(30);
        var names = ['BR-A', 'BR-B'];
        for (var i = 0; i < names.length; i++) {
          $('cfg-add').click(); await wait(30);
          setInput(D.querySelector('#modal input'), names[i]); clickModalButton('OK'); await idle(); await wait(30);
        }
      } finally { D.querySelector('[data-tab="tree"]').click(); await wait(20); }
      var ef = rfQDByName('Edge-Flange1'), scope0 = UI.configDimScope(), i3dWas = UI.instant3DOn(), bd = rfQDBD(R09, T14, K44, 90);
      if (!i3dWas) UI.toggleInstant3D(true);
      function hObj() { return UI.instant3DHandles().filter(function (h) { return h.kind === 'fparam' && h.key === 'length'; })[0]; }
      async function shown() {
        UI.setView('Isometric'); UI.zoomToFit(); await idle(); await wait(40);
        UI.showFeatureDims(ef); await idle();
        for (var q = 0; q < 80 && !D.querySelector('#i3d-layer .i3d-handle[data-kind="fparam"]'); q++) { UI.drawDims(); await wait(25); }
        var h = hObj();
        assert(h && D.querySelector('#i3d-layer .i3d-handle[data-kind="fparam"]'), 'the flange length arrow ' + JSON.stringify(anvil.instant3D().handles));
        return h;
      }
      try {
        await anvil.activateConfiguration('BR-B'); await idle();
        UI.configDimScope('this');
        var h = await shown();
        // linked first by a typed value (This configuration)
        var hg = D.querySelector('#i3d-layer .i3d-handle[data-kind="fparam"]');
        rfQDEv('mousedown', h.grab, hg); rfQDEv('mouseup', h.grab); await idle();
        assert(UI.instant3DEditOpen(), 'the Modify box');
        await UI.instant3DEdit('2.5'); await idle(); await wait(30);
        assert(typeof ef.length === 'string' && /^=/.test(ef.length), 'linked: ' + ef.length);
        var link = ef.length;
        // now dragged to 2 (a ruler tick)
        h = await shown();
        for (var z = 0; z < 14; z++) {
          var st = h.step();
          if (Math.abs(2 / st - Math.round(2 / st)) < 1e-9 && st <= 0.1) break;
          UI.zoomView(st > 0.1 ? 0.8 : 1.15, h.grab[0], h.grab[1]); h = hObj();
        }
        var undoN = UI.App.undo.length;
        await rfQDDrag(h.grab, UI.instant3DRulerPoint(h, 2), D.querySelector('#i3d-layer .i3d-handle[data-kind="fparam"]'));
        await UI.whenIdle(); await idle(); await wait(30);
        notes.push('after drag: ' + statusText());
        ef = rfQDByName('Edge-Flange1');
        assert(ef.length === link, 'still linked after the drag: ' + ef.length + ' (was ' + link + ')');
        assert(UI.App.undo.length === undoN + 1, 'one undo step (' + (UI.App.undo.length - undoN) + ')');
        if (UI.instant3DEditOpen()) UI.escapeCommand();
        var want = { 'BR-A': 1.5, 'BR-B': 2 };
        for (var n in want) {
          await anvil.activateConfiguration(n); await idle();
          var fl = anvil.flat();
          notes.push(n + ' blank ' + fl.size.map(function (x) { return x.toFixed(4); }).join(' x '));
          near(rfQDLong(fl, 6), 4 + want[n] - bd, 1e-6, n + ' blank 4 + L - BD');
        }
        // equation-driven in BR-B: the drag is refused, nothing changes
        await anvil.activateConfiguration('BR-B'); await idle();
        var vname = /^=\s*([A-Za-z_]\w*)/.exec(ef.length)[1], cfg = K.activeConfiguration(UI.App.model);
        cfg.values = cfg.values || {}; cfg.values[vname] = '=1.25*2';
        await UI.afterRebuild(UI.rebuild(), function () { return UI.whenIdle(); }); await idle();
        near(rfQDLong(anvil.flat(), 6), 4 + 2.5 - bd, 1e-6, 'BR-B by the equation 1.25*2');
        h = await shown();
        var to = UI.instant3DRulerPoint(h, 1.5 > h.value ? 1.5 : h.value - 1);
        await rfQDDrag(h.grab, to, D.querySelector('#i3d-layer .i3d-handle[data-kind="fparam"]'));
        notes.push('driven: ' + statusText());
        assert(/Not dragged: .*driven by the equation 1\.25\*2/.test(statusText()), 'the reason on the status bar: ' + statusText());
        if (UI.instant3DEditOpen()) UI.escapeCommand();
        ef = rfQDByName('Edge-Flange1');
        assert(ef.length === link && cfg.values[vname] === '=1.25*2', 'nothing changed: ' + ef.length + ' ' + cfg.values[vname]);
        near(rfQDLong(anvil.flat(), 6), 4 + 2.5 - bd, 1e-6, 'BR-B still 2.5');
      } finally { UI.configDimScope(scope0); if (!i3dWas) UI.toggleInstant3D(false); }
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });

    step('rfQD: task 5, Welded Corner on a tray of Material Inside flanges (one Edge-Flange on four edges, 14 ga): the front wall\'s end face stands .0071 off the left wall\'s inside face and can be clicked in the Left view only; in the Right view right-click ▸ Select Other lists it behind the right wall, its row adds the corner and ✓ builds the weld', async function () {
      var errs0 = errors.length;
      await rfQDNewInch();
      await anvil.run('p.units("in");\np.sheet(' + T14 + ', ' + R09 + ', ' + K44 + ');\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\np.flange(1.5, [[5, ' + T14 + ', 0], [10, ' + T14 + ', 3], [5, ' + T14 + ', 6], [0, ' + T14 + ', 3]], { position: "inside", lengthRef: "outer" });\n'); await idle();
      var faces = UI.App.mesh.faces, endI = -1;
      faces.forEach(function (f, i) { if (f.normal && f.normal[0] < -0.999999 && f.centroid[0] > T14 + 1e-4 && f.centroid[0] < 0.3) endI = i; });
      assert(endI >= 0, 'the walls\' end face');
      var gap = faces[endI].centroid[0] - T14;
      near(gap, 0.0071, 1e-4, 'the end face stands off the left wall');
      var v0 = K.massProps(UI.App.mesh, 1).volume;
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      var caret = Array.prototype.filter.call(D.querySelectorAll('#ribbon .rb-caret'), function (b) { return /Corner/.test(b.getAttribute('aria-label') || ''); })[0];
      caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click(); await wait(20);
      Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.indexOf('Welded Corner') >= 0; })[0].click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Welded Corner', 'Welded Corner PM');
      var P = [T14 + gap, 0.6, T14 / 2];
      // measured: in the Left view the strip (T wide) is in front, so a plain click reaches it there
      UI.setView('Left'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      var s = UI.worldToScreen(P), pf = UI.pickFace(s[0], s[1]);
      assert(pf && pf.index === endI, 'Left view: the end face is under the cursor: ' + JSON.stringify(pf));
      // in the Right view the right wall's end is in front: Select Other reaches it
      UI.setView('Right'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      s = UI.worldToScreen(P); pf = UI.pickFace(s[0], s[1]);
      assert(pf && pf.index !== endI, 'Right view: another face is in front: ' + JSON.stringify(pf));
      var vr = $('viewport').getBoundingClientRect(), cx = Math.round(vr.left + s[0]), cy = Math.round(vr.top + s[1]);
      $('viewport').dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: cx, clientY: cy })); await wait(30);
      var so = Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.trim() === 'Select Other'; })[0];
      assert(so, 'Select Other on the right-click menu: ' + Array.prototype.map.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent; }).join('|'));
      so.click(); await wait(30);
      var rows = Array.prototype.slice.call(D.querySelectorAll('body > .menu.select-other .mi')), labels = rows.map(function (m) { return m.textContent; });
      var row = rows.filter(function (m) { return new RegExp('^Face ' + endI + '\\b').test(m.textContent); })[0];
      assert(row, 'the end face (Face ' + endI + ') is listed: ' + labels.join('|'));
      row.click(); await idle(); await wait(20);
      assert(UI.pmSpec().values.faces.length === 1, 'its row adds the corner: ' + statusText());
      await pmAccept(); await wait(30);
      var fs = UI.App.model.features, f = fs[fs.length - 1];
      assert(f.type === 'weldedCorner' && !UI.App.build.errors[f.id], 'built: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
      var v1 = K.massProps(UI.App.mesh, 1).volume;
      assert(v1 > v0 && K.meshQuality(UI.App.mesh).openEdges === 0, 'the weld added, closed: ' + v0 + ' -> ' + v1);
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'gap ' + gap.toFixed(4) + ', listed as row ' + (rows.indexOf(row) + 1) + ' of ' + rows.length + ', weld + ' + (v1 - v0).toFixed(6) + ' in³';
    });

    step('rfQD: QD2, Design Library ▸ Forming Tools ▸ Louver dragged onto the web of a 16 ga channel (its PM opens with the face picked at the drop point) ✓; Features ▸ Linear Pattern of it, Z, 1.5, 4 ✓: volume and flat = four louvers placed one by one, four LOUVER notes in the flat DXF', async function () {
      var errs0 = errors.length, T16 = 0.0598;
      await rfQDNewInch();
      await anvil.run('p.units("in");\np.sheet(' + T16 + ', 0.0625, 0.44);\np.sketch("Front").polyline([[0, 2], [0, 0], [6, 0], [7, 1.7320508075688772]], false).end().baseFlange(null, { depth: 10 });\n'); await idle();
      UI.setView('Top'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      UI.openTaskPane('library'); await wait(30);
      var dlf = D.querySelector('.dl-row[data-folder="forming"]');
      assert(dlf, 'the Forming Tools folder'); dlf.click(); await wait(20);
      var tile = D.querySelector('.dl-tile[data-kind="forming"][data-id="louver"]');
      assert(tile && !tile.hidden && tile.draggable, 'the Louver tile, draggable');
      var s = UI.worldToScreen([1.5, 0, 1.5]), vr = $('viewport').getBoundingClientRect(), cx = Math.round(vr.left + s[0]), cy = Math.round(vr.top + s[1]);
      var dt = new W.DataTransfer();
      tile.dispatchEvent(new W.DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      var over = new W.DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: cx, clientY: cy });
      $('viewport').dispatchEvent(over);
      assert(over.defaultPrevented, 'the graphics area takes the drop');
      $('viewport').dispatchEvent(new W.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: cx, clientY: cy }));
      tile.dispatchEvent(new W.DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
      await idle(); await wait(30);
      UI.closeTaskPane();
      assert(UI.hasPM() && UI.pmTitle() === 'Forming Tool' && UI.pmSpec().values.tool === 'louver' && UI.pmSpec().values.face, 'the Louver PM with the face: ' + statusText());
      var fv = UI.pmSpec().values.face;
      assert(Math.abs(fv[1]) < 1e-6 && Math.abs(fv[0] - 1.5) < 0.05 && Math.abs(fv[2] - 1.5) < 0.05, 'at the drop point on the web: ' + JSON.stringify(fv));
      await pmAccept(); await wait(30);
      var fs = UI.App.model.features, lv = fs[fs.length - 1];
      assert(lv.type === 'formingTool' && lv.tool === 'louver' && !UI.App.build.errors[lv.id], 'Louver built: ' + JSON.stringify(UI.App.build.errors));
      // the louver picked in the FeatureManager, then Features ▸ Linear Pattern
      var row = Array.prototype.filter.call(D.querySelectorAll('#tree .ti'), function (r) { var nm = r.querySelector('.nm'); return nm && nm.textContent === lv.name; })[0];
      assert(row, 'the ' + lv.name + ' row'); row.click(); await wait(20);
      UI.setRibbonTab('Features'); await wait(20);
      var lb = Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return /Linear Pattern/.test(((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent)); })[0];
      if (lb) lb.click();
      else {   // the flyout's face shows the pattern used last: its caret ▸ Linear Pattern
        var pc = Array.prototype.filter.call(D.querySelectorAll('#ribbon .rb-caret'), function (b) { return /Pattern|Mirror/.test(b.getAttribute('aria-label') || ''); })[0];
        assert(pc, 'the Pattern flyout on the ribbon');
        pc.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); pc.click(); await wait(20);
        var mi = Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return /Linear\s*Pattern/.test(m.textContent); })[0];
        assert(mi, 'Linear Pattern in the flyout'); mi.click();
      }
      await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Linear Pattern' && UI.pmSpec().values.feature === lv.id, 'Linear Pattern PM with the louver: ' + (UI.hasPM() && JSON.stringify(UI.pmSpec().values)));
      var sel = pmField('Direction'); sel.value = 'z'; sel.dispatchEvent(new W.Event('change', { bubbles: true })); await wait(20);
      setInput(pmField('Spacing'), 1.5); await wait(20);
      setInput(pmField('Number of instances'), 4); await wait(20);
      await pmAccept(); await wait(30);
      fs = UI.App.model.features; var lp = fs[fs.length - 1];
      assert(lp.type === 'lpattern' && lp.d1 === 'z' && +lp.s1 === 1.5 && +lp.n1 === 4 && !UI.App.build.errors[lp.id], 'pattern built: ' + JSON.stringify(lp) + ' ' + UI.App.build.errors[lp.id]);
      // the same louvers placed one by one (kernel), against what the part shows
      var ref = JSON.parse(JSON.stringify(UI.App.model)), seed = ref.features.filter(function (g) { return g.id === lv.id; })[0];
      ref.features = ref.features.filter(function (g) { return g.id !== lp.id; });
      for (var k = 1; k < 4; k++) {
        var c = JSON.parse(JSON.stringify(seed)); c.id = ref.nextId++; c.name = 'Louver' + (k + 1);
        c.face = [seed.face[0], seed.face[1], seed.face[2] + 1.5 * k];
        if (c.at) c.at = [seed.at[0], seed.at[1] - 1.5 * k];
        ref.features.push(c);
      }
      var rb = K.rebuild(ref), rm = K.meshFromBody(rb.body), rfl = K.flatPattern(ref, rb, rm), fl = anvil.flat();
      var v1 = K.massProps(UI.App.mesh, 1).volume, v2 = K.massProps(rm, 1).volume;
      near(v1, v2, 1e-9, 'volume = four louvers');
      assert(fl.loops.length === 5 && rfl.loops.length === 5, 'the flat: outline + four lance slits: ' + fl.loops.length + ' / ' + rfl.loops.length);
      var dxf = UI.dxfOutput({ export: 'sheet', version: 'R2000', bendLines: true, notes: true, formingTools: true });
      assert((dxf.match(/LOUVER/g) || []).length === 4, 'four LOUVER notes in the flat DXF');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'louver at ' + fv.map(function (x) { return x.toFixed(3); }).join(', ') + '; volume ' + v1.toFixed(6) + '; flat ' + fl.loops.length + ' loops';
    });
  })();
