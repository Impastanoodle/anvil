  // --- rfJP (2026-11-05, lane smcorner) --- Sheet Metal ▸ Corners ▸ Welded Corner, with real mouse events: the Corners
  // flyout lists it after Closed Corner as SolidWorks (Break-Corner stays the flyout's face); the PM (Corner to
  // Weld, Add fillet, Fillet radius, Add texture); a click on the left wall's end face at the front-left corner of a tray
  // (looked at down the gap) adds it, a click on a wall's outside face is refused; Add fillet .1 + Add texture ✓: the exact weld, tree
  // icon, the flat is the tray's, one undo step; Edit Feature brings it back and unticking Add fillet drops the fillet.
  // Self-contained.
  (function () {
    var T = 0.0598, R = 0.0598, H = 1 - (R + T), N = 16;
    var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
      [[2, T, 0], [4, T, 1.5], [2, T, 3], [0, T, 1.5]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer" });\n'; }).join('');
    function rfJPVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
    function rfJPEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfJPClick(p) { rfJPEv('mousemove', p); rfJPEv('mousedown', p, $('viewport')); rfJPEv('mouseup', p); }
    function rfJPLast() { var fs = UI.App.model.features; return fs[fs.length - 1]; }
    function rfJPCheck(label) { var c = pmField(label); assert(c && c.type === 'checkbox', label + ' box'); return c; }
    function rfJPMenu() { return Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return true; }).map(function (m) { return m; }); }
    function rfJPMenuItem(text) { return rfJPMenu().filter(function (m) { return m.textContent.indexOf(text) >= 0; })[0]; }
    function rfJPCaret() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon .rb-caret'), function (b) { return /Corner/.test(b.getAttribute('aria-label') || ''); })[0]; }
    function rfJPFlat() { var fl = anvil.flat(); return { n: fl.loops.length, w: fl.size[0], h: fl.size[1], loops: JSON.stringify(fl.loops) }; }

    step('rfJP: Corners flyout ▸ Welded Corner: SolidWorks\' order and PM; a click on the end face down the gap adds the corner, a wall face is refused; Add fillet .1 + Add texture ✓: exact weld, tree icon, the flat unchanged, one undo step; Edit Feature, untick Add fillet ✓', async function () {
      var errs0 = errors.length;
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
      await anvil.newPart(); await idle();
      await anvil.run(HEAD); await idle();
      assert(!Object.keys(anvil.summary().errors).length, 'tray: ' + JSON.stringify(anvil.summary().errors));
      var v0 = rfJPVol(), flat0 = rfJPFlat(), n0 = UI.App.model.features.length;
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      var caret = rfJPCaret();
      assert(caret && !caret.disabled, 'the Corners flyout');
      caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click(); await wait(20);
      var names = rfJPMenu().map(function (m) { return m.textContent; }).join('|');
      var iC = names.indexOf('Closed Corner'), iW = names.indexOf('Welded Corner'), iB = names.indexOf('Break-Corner'), iR = names.indexOf('Corner Relief');
      assert(iB >= 0 && iC >= 0 && iC < iW && iW < iR, 'Welded Corner after Closed Corner (SolidWorks), Break-Corner stays the face: ' + names);
      rfJPMenuItem('Welded Corner').click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Welded Corner', 'Welded Corner PM: ' + (UI.hasPM() && UI.pmTitle()));
      var txt = $('pm').textContent;
      ['Corner to Weld', 'Add fillet', 'Add texture'].forEach(function (w) { assert(txt.indexOf(w) >= 0, 'PM shows ' + w); });
      assert(!pmField('Fillet radius'), 'Fillet radius hidden until Add fillet');
      // look down the gap in front of the left wall's end (from outside the left wall, a little from the front)
      UI.viewNormalTo(K.planeFromFace([-1, 0.25, -1].map(function (x) { return x / Math.sqrt(2.0625); }), [T / 2, 0.6, R + T])); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      var P = [T / 2, 0.6, R + T], s = UI.worldToScreen(P), pf = UI.pickFace(s[0], s[1]);
      assert(pf && pf.point && Math.abs(pf.point[2] - (R + T)) < 1e-6, 'the end face is under the cursor: ' + JSON.stringify(pf && pf.point));
      rfJPClick(s); await idle(); await wait(20);
      assert(UI.pmSpec().values.faces.length === 1, 'click adds the corner: ' + statusText());
      var Q = UI.worldToScreen([2, 0.6, 0]), pq = UI.pickFace(Q[0], Q[1]);
      assert(pq && pq.point && Math.abs(pq.point[2]) < 1e-6, 'the front wall outside face is under the cursor: ' + JSON.stringify(pq && pq.point));
      rfJPClick(Q); await idle(); await wait(20);
      assert(UI.pmSpec().values.faces.length === 1 && /not the end of a wall/.test(statusText()), 'a wall outside face is refused: ' + statusText());
      rfJPCheck('Add fillet').click(); await wait(20);
      assert(pmField('Fillet radius'), 'Fillet radius shown');
      setInput(pmField('Fillet radius'), 0.1); await wait(20);
      rfJPCheck('Add texture').click(); await wait(20);
      await pmAccept(); await wait(30);
      var f = rfJPLast();
      assert(f.type === 'weldedCorner' && f.name === 'Welded Corner1' && f.fillet === 0.1 && f.addTexture === true && f.faces.length === 1 && !UI.App.build.errors[f.id], 'feature: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
      assert(f.addFillet === undefined, 'no UI keys');
      var fa = 0.01 - N / 2 * 0.01 * Math.sin(Math.PI / 2 / N);
      near(rfJPVol() - v0, H * (R * T + fa), 1e-9, 'added: H·(R·T + the fillet)');
      var row = D.querySelector('#tree [data-fid="' + f.id + '"]');
      // rfMD: the row's icon is whatever the icon set in use draws for weldedCorner (it was a fragment of the built-in
      // drawing's path, which the SolidWorks set of the default profile does not share), and not the generic square
      var rowIco = row && row.querySelector('svg.ico');
      assert(rowIco && rowIco.outerHTML === W.Icons.node('weldedCorner', 16).outerHTML && rowIco.outerHTML !== W.Icons.node('generic', 16).outerHTML, 'tree row with the Welded Corner icon');
      var flat1 = rfJPFlat();
      assert(flat1.n === flat0.n && Math.abs(flat1.w - flat0.w) < 1e-12 && Math.abs(flat1.h - flat0.h) < 1e-12 && flat1.loops === flat0.loops, 'the flat is the tray\'s');
      UI.undo(); await idle();
      assert(UI.App.model.features.length === n0, 'one undo step');
      UI.redo(); await idle();
      f = rfJPLast();
      UI.editFeature(f); await wait(30); await idle();
      var v = UI.hasPM() && UI.pmSpec().values;
      assert(v && v.faces.length === 1 && v.addFillet === true && v.fillet === 0.1 && v.addTexture === true, 'Edit Feature: the corner, fillet and texture are back');
      rfJPCheck('Add fillet').click(); await wait(20);
      await pmAccept(); await wait(30);
      f = rfJPLast();
      assert(f.fillet === undefined && f.addTexture === true && !UI.App.build.errors[f.id], 'fillet dropped: ' + JSON.stringify(f));
      near(rfJPVol() - v0, H * R * T, 1e-9, 'added: R·T·H');
      assert(/p\.weldedCorner\(/.test(anvil.script()), 'script');
      // the flyout face goes back to Break-Corner for the other groups
      caret = rfJPCaret(); caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click(); await wait(20);
      rfJPMenuItem('Break-Corner').click(); await wait(30);
      D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await idle(); await wait(20);
      assert(!UI.hasPM(), 'Break-Corner closed again');
      UI.setView('Isometric');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'weld ' + (H * R * T).toFixed(6) + ' in³';
    });
  })();
