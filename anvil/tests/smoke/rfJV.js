  // --- rfJV (2026-11-05, lane smcorner-2) --- Corner Relief ▸ 3 Bend corner with real mouse events: a U channel (T = R
  // = .06) with end flanges on the base (down) and both walls (outward); the Corners flyout ▸ Corner Relief, Corner Type
  // ▸ 3 Bend corner (the corners clear, Relief type offers Rectangular and Tear), Collect all corners (2), Rectangular
  // .25 ✓: exact volume, one undo step; Edit Feature shows 3 Bend corner and switches to Tear; a click on the base near
  // a corner adds it, a second click removes it. Self-contained.
  (function () {
    var T = 0.06, R = 0.06, BA = Math.PI / 2 * (R + T / 2);
    var PART = 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Front").polyline([[0, 2], [0, 0], [3, 0], [3, 2]], false).end().baseFlange(null, { depth: 4 });\n' +
      [[1.5, 0, 0], [0, 1, 0], [3, 1, 0]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer", reverse: true });\n'; }).join('');
    function rfJVVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
    function rfJVEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfJVClick(p) { rfJVEv('mousemove', p); rfJVEv('mousedown', p, $('viewport')); rfJVEv('mouseup', p); }
    function rfJVLast() { var fs = UI.App.model.features; return fs[fs.length - 1]; }
    function rfJVMenuItem(text) { return Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.indexOf(text) >= 0; })[0]; }
    function rfJVCaret() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon .rb-caret'), function (b) { return /Corner/.test(b.getAttribute('aria-label') || ''); })[0]; }
    function rfJVRadio(val) { return $('pm').querySelector('input[data-key="cornerType:' + val + '"]'); }
    // per corner: the .25 square centred on the bend lines' crossing less its part over the notch (the U stub ends R + T on)
    var REL = 0.0625 - BA * (BA / 2 + 0.125 - (R + T));

    step('rfJV: Corner Relief ▸ 3 Bend corner: the radio clears the corners and offers Rectangular / Tear, Collect all corners, Rectangular .25 ✓: exact; one undo step; Edit Feature ▸ Tear; clicks near a corner add / remove it', async function () {
      var errs0 = errors.length;
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
      await anvil.newPart(); await idle();
      await anvil.run(PART); await idle();
      assert(!Object.keys(anvil.summary().errors).length, 'part: ' + JSON.stringify(anvil.summary().errors));
      UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      var v0 = rfJVVol(), n0 = UI.App.model.features.length;
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      var caret = rfJVCaret();
      caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click(); await wait(20);
      rfJVMenuItem('Corner Relief').click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Corner Relief', 'Corner Relief PM');
      assert(rfJVRadio('2bend') && rfJVRadio('2bend').checked && rfJVRadio('3bend') && !rfJVRadio('3bend').checked, 'Corner Type: 2 Bend corner on, 3 Bend corner offered');
      clickPmButton('Collect all corners'); await wait(20);
      assert(UI.pmSpec().values.corners.length === 0, 'no 2 Bend corner on this part');
      rfJVRadio('3bend').click(); await wait(30);
      assert(rfJVRadio('3bend').checked && UI.pmSpec().values.cornerType === '3bend', '3 Bend corner chosen');
      var sel = pmField('Relief type');
      assert(sel && Array.prototype.map.call(sel.options, function (o) { return o.textContent; }).join() === 'Rectangular,Circular,Tear,Obround', '3 Bend relief types: ' + (sel && Array.prototype.map.call(sel.options, function (o) { return o.textContent; }).join()));
      clickPmButton('Collect all corners'); await wait(20);
      assert(UI.pmSpec().values.corners.length === 2, 'two 3 Bend corners collected: ' + UI.pmSpec().values.corners.length);
      setInput(pmField('Size'), 0.25); await wait(20);
      await pmAccept(); await wait(30);
      var f = rfJVLast();
      assert(f.type === 'cornerRelief' && f.cornerType === '3bend' && f.reliefType === 'rect' && f.size === 0.25 && f.corners.length === 2 && !UI.App.build.errors[f.id], 'feature: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
      near(v0 - rfJVVol(), 2 * T * REL, 1e-9, 'removed: T × the relief in the blank at both corners');
      var fl = anvil.flat();
      assert(fl && fl.loops.length === 1, 'one blank');
      UI.undo(); await idle();
      assert(UI.App.model.features.length === n0, 'one undo step');
      UI.redo(); await idle();
      f = rfJVLast();
      UI.editFeature(f); await wait(30); await idle();
      assert(UI.hasPM() && rfJVRadio('3bend').checked && UI.pmSpec().values.corners.length === 2, 'Edit Feature: 3 Bend corner and both corners');
      setInput(pmField('Relief type'), 'tear'); await wait(20);
      await pmAccept(); await wait(30);
      f = rfJVLast();
      assert(f.reliefType === 'tear' && f.cornerType === '3bend' && !UI.App.build.errors[f.id], 'tear: ' + JSON.stringify(f));
      near(v0 - rfJVVol(), 2 * BA * (R + T) * T, 1e-9, 'tear: the U bends\' stubs');
      // a new one: a click on the base near the left corner adds it, a second removes it
      await anvil.run(PART); await idle();
      UI.cmdCornerRelief(); await wait(30);
      rfJVRadio('3bend').click(); await wait(30);
      var P = [0.4, 0, 0.4], s = UI.worldToScreen(P), pf = UI.pickFace(s[0], s[1]);
      assert(pf && pf.point && Math.abs(pf.point[1]) < 1e-6, 'the base is under the cursor: ' + JSON.stringify(pf && pf.point));
      rfJVClick(s); await idle(); await wait(20);
      assert(UI.pmSpec().values.corners.length === 1 && Math.abs(UI.pmSpec().values.corners[0][0] - R) < 1e-6, 'click adds the left corner: ' + statusText());
      rfJVClick(s); await idle(); await wait(20);
      assert(UI.pmSpec().values.corners.length === 0, 'second click removes it');
      UI.pmCancel(); await idle();
      assert(UI.App.model.features.length === n0, 'Cancel leaves nothing');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    });
  })();
