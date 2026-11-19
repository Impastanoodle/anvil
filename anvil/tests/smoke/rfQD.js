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
  })();
