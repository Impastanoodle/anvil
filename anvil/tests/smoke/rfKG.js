  // --- rfKG (2026-11-09, lane smflat) --- Corner Relief ▸ 3 Bend corner ▸ Circular through the PropertyManager: the
  // rfJV U channel (T = R = .06) with end flanges; the Corners flyout ▸ Corner Relief, 3 Bend corner, Relief type
  // Circular (offered now), Collect all corners, Size .12 ✓: the feature, a closed solid, one blank, folded = blank × T;
  // Edit Feature ▸ Obround. Then an arc Swept Flange with an Edge Flange on its end: the flat (Flatten) has its bend
  // and no warning. Self-contained.
  (function () {
    var T = 0.06;
    var PART = 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Front").polyline([[0, 2], [0, 0], [3, 0], [3, 2]], false).end().baseFlange(null, { depth: 4 });\n' +
      [[1.5, 0, 0], [0, 1, 0], [3, 1, 0]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer", reverse: true });\n'; }).join('');
    function rfKGVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
    function rfKGLast() { var fs = UI.App.model.features; return fs[fs.length - 1]; }
    function rfKGMenuItem(text) { return Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.indexOf(text) >= 0; })[0]; }
    function rfKGCaret() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon .rb-caret'), function (b) { return /Corner/.test(b.getAttribute('aria-label') || ''); })[0]; }
    function rfKGRadio(val) { return $('pm').querySelector('input[data-key="cornerType:' + val + '"]'); }
    function rfKGBlank(fl) { return fl.loops.reduce(function (s, l, i) { return s + (i ? -Math.abs(K.signedArea(l)) : Math.abs(K.signedArea(l))); }, 0); }
    function rfKGClosed() { var c = W.Evaluate.checkBody(UI.App.build.body, { maxPairs: 1 }); return c.openEdges.length + c.nonManifoldEdges.length; }

    step('rfKG: Corner Relief ▸ 3 Bend corner ▸ Circular Ø.12 at both corners through the PM: closed, one blank, folded = blank × T; Edit Feature ▸ Obround; an arc Swept Flange\'s end Edge Flange is in the flat', async function () {
      var errs0 = errors.length;
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
      await anvil.newPart(); await idle();
      await anvil.run(PART); await idle();
      assert(!Object.keys(anvil.summary().errors).length, 'part: ' + JSON.stringify(anvil.summary().errors));
      var v0 = rfKGVol(), n0 = UI.App.model.features.length;
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      var caret = rfKGCaret();
      caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click(); await wait(20);
      rfKGMenuItem('Corner Relief').click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Corner Relief', 'Corner Relief PM');
      rfKGRadio('3bend').click(); await wait(30);
      var sel = pmField('Relief type');
      assert(sel && Array.prototype.some.call(sel.options, function (o) { return o.value === 'circular'; }), 'Circular offered on a 3 Bend corner');
      setInput(sel, 'circular'); await wait(20);
      clickPmButton('Collect all corners'); await wait(20);
      assert(UI.pmSpec().values.corners.length === 2, 'two 3 Bend corners: ' + UI.pmSpec().values.corners.length);
      setInput(pmField('Size'), 0.12); await wait(20);
      await pmAccept(); await wait(30); await idle();
      var f = rfKGLast();
      assert(f.type === 'cornerRelief' && f.cornerType === '3bend' && f.reliefType === 'circular' && f.size === 0.12 && f.corners.length === 2 && !UI.App.build.errors[f.id], 'feature: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
      assert(rfKGClosed() === 0, 'closed solid');
      var fl = anvil.flat();
      assert(fl && fl.loops.length === 1, 'one blank');
      near(rfKGVol(), rfKGBlank(fl) * T, 1e-6 * rfKGBlank(fl) * T, 'folded = blank × T');
      near(v0 - rfKGVol(), 1.2905e-3, 1e-6, 'material removed (two Ø.12 corners less the notch, × T)');
      UI.editFeature(f); await wait(30); await idle();
      assert(UI.hasPM() && rfKGRadio('3bend').checked && pmField('Relief type').value === 'circular', 'Edit Feature: 3 Bend corner, Circular');
      setInput(pmField('Relief type'), 'obround'); await wait(20);
      await pmAccept(); await wait(30); await idle();
      f = rfKGLast();
      assert(f.reliefType === 'obround' && !UI.App.build.errors[f.id] && UI.App.model.features.length === n0 + 1, 'obround: ' + JSON.stringify(f));
      assert(rfKGClosed() === 0, 'obround: closed solid');
      // an arc Swept Flange with an Edge Flange on its end edge: the flat has the flange's bend and no warning
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.sheet(0.06, 0.06, 0.5);\nvar path = p.sketch("Top").arc(0, 0, 5, 0, 90).id();\nvar prof = p.sketch("Front").line(5, 0, 7, 0).id();\np.sweptFlange(prof, path);\np.flange(1, [[6, 0, 0]]);\n'); await idle();
      assert(!Object.keys(anvil.summary().errors).length, 'swept part: ' + JSON.stringify(anvil.summary().errors));
      var sf = anvil.flat();
      assert(sf && sf.loops.length === 1 && sf.bends.length === 1 && !sf.warnings.length, 'flat: ' + (sf && (sf.bends.length + ' bends; ' + sf.warnings.join(' | '))));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    });
  })();
