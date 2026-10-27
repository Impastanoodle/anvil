  // --- rfCS (2026-10-20, lane CS): Sheet Metal ▸ Corners ▸ Closed Corner with real mouse events — the Corners flyout
  // opens the PropertyManager, clicks on the end faces of the side walls (looking down into each corner gap), Overlap,
  // gap .02 typed + Enter (commits, PM stays) + Enter (✓); exact volume, one flat loop; one undo step; Edit Feature
  // reopens with the picks and switches to Butt; odd picks are refused; save / reload keeps it. Self-contained. ---
  (function () {
    var T = 0.0598, R = 0.0598, H = 1 - (R + T);
    var TRAY = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
      [[2, T, 0], [4, T, 1.5], [2, T, 3], [0, T, 1.5]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer" });'; }).join('\n');
    function rfCSVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
    function rfCSEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfCSClick(p) { rfCSEv('mousemove', p); rfCSEv('mousedown', p, $('viewport')); rfCSEv('mouseup', p); }
    // look down into a corner gap: the camera above the point, tilted toward `from` (a horizontal direction), zoomed in
    async function rfCSLook(P, from) {
      var c = UI.cam, d = new W.THREE.Vector3(from[0], 1, from[2]).normalize();
      c.dir.copy(d); c.up.set(0, 1, 0); if (Math.abs(d.y) > 0.99) c.up.set(0, 0, -1);
      c.target.set(P[0], P[1], P[2]); c.scale = 0.0015;
      UI.applyCamera(); await idle(); await wait(30);
    }
    function rfCSType(inp, text) { inp.value = text; inp.dispatchEvent(new W.Event('input', { bubbles: true })); }
    function rfCSMenuItem(text) { return Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.indexOf(text) >= 0; })[0]; }
    function rfCSCaret() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon .rb-caret'), function (b) { return /Corner/.test(b.getAttribute('aria-label') || ''); })[0]; }
    // the three end faces to click (the front pair share a plane: Coplanar faces takes both from one click): a point
    // near the top of each, and the side the gap opens to
    var PICKS = [{ at: [T / 2, 0.95, R + T], from: [0, 0, -0.5] }, { at: [4 - R - T, 0.95, 3 - T / 2], from: [0.5, 0, 0] }, { at: [T / 2, 0.95, 3 - R - T], from: [0, 0, 0.5] }];

    step('rfCS: Closed Corner — Corners flyout, three end-face clicks (coplanar front pair), Overlap, gap .02 Enter Enter: exact volume, one flat loop; one undo step; Edit Feature reopens and switches to Butt; odd picks refused; save / reload', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      await anvil.run(TRAY); await idle();
      var v0 = rfCSVol(), n0 = UI.App.model.features.length;
      assert(!Object.keys(UI.App.build.errors).length, 'tray builds: ' + JSON.stringify(UI.App.build.errors));
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      var caret = rfCSCaret();
      assert(caret && !caret.disabled, 'the Corners flyout ▾ on the Sheet Metal ribbon');
      caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click(); await wait(20);
      var mi = rfCSMenuItem('Closed Corner');
      assert(mi && rfCSMenuItem('Break-Corner'), 'the flyout lists Break-Corner and Closed Corner');
      mi.click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Closed Corner', 'Closed Corner PM: ' + (UI.hasPM() && UI.pmTitle()));
      var vals = UI.pmSpec().values;
      assert(vals.cornerType === 'butt' && vals.gap === 0.01 && vals.coplanar === true, 'defaults butt, gap .010 in, coplanar: ' + JSON.stringify(vals));
      // an odd pick first: the base's top face has no flange across a gap
      UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      rfCSClick(UI.worldToScreen([2, T, 1.5])); await idle(); await wait(20);
      assert(UI.pmSpec().values.faces.length === 0 && /no flange face across/.test(statusText()), 'top face refused: ' + statusText());
      for (var i = 0; i < PICKS.length; i++) {
        await rfCSLook(PICKS[i].at, PICKS[i].from);
        var s = UI.worldToScreen(PICKS[i].at), pk = UI.pickFace(s[0], s[1]);
        assert(pk && pk.point && Math.abs(pk.point[1] - 0.95) < 0.02, 'the end face is under the cursor (' + i + '): ' + JSON.stringify(pk && pk.point));
        rfCSClick(s); await idle(); await wait(20);
        assert(UI.pmSpec().values.faces.length === i + 1, 'pick ' + (i + 1) + ' taken: ' + statusText());
      }
      // a second click on a picked face takes it off again, a third puts it back
      rfCSClick(UI.worldToScreen(PICKS[2].at)); await idle(); await wait(20);
      assert(UI.pmSpec().values.faces.length === 2, 'second click removes the pick');
      rfCSClick(UI.worldToScreen(PICKS[2].at)); await idle(); await wait(20);
      assert(UI.pmSpec().values.faces.length === 3 && D.querySelectorAll('#pm .pm-list .pm-item').length === 3, 'three rows in Faces to Extend');
      // Overlap shows the ratio; gap .02 typed: the first Enter commits the entry, the second is ✓
      var ob = D.querySelector('#pm button[data-key="cornerType:overlap"]');
      assert(ob, 'Overlap corner type button'); ob.click(); await wait(20);
      assert(pmField('Overlap/underlap ratio'), 'ratio box shown for Overlap');
      // lane DK: a new corner closes the bend region (Open bend region off); this step checks the open-region volumes
      var obr = pmField('Open bend region');
      assert(obr && !obr.checked, 'Open bend region off for a new corner'); obr.click(); await wait(20);
      var gp = pmField('Gap distance');
      gp.focus(); gp.select(); rfCSType(gp, '.02');
      var ev = pressEnter(gp);
      assert(ev.defaultPrevented && UI.hasPM() && UI.pmSpec().values.gap === 0.02, 'the first Enter applied .02 and kept the PM');
      pressEnter(pmField('Gap distance')); await idle(); await wait(30);
      assert(!UI.hasPM(), 'the second Enter is ✓');
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.type === 'closedCorner' && f.cornerType === 'overlap' && f.gap === 0.02 && f.ratio === 1 && f.faces.length === 3 && f.name === 'Closed Corner1' && f.coplanar !== false, 'feature: ' + JSON.stringify(f));
      assert(!UI.App.build.errors[f.id], 'no error: ' + UI.App.build.errors[f.id]);
      var wantO = v0 + 4 * H * T * (R + T - (T + 0.02));
      near(rfCSVol(), wantO, 1e-9, 'volume: four corners closed, overlap');
      var flat = anvil.flat();
      assert(flat.loops.length === 1, 'one flat loop: ' + flat.loops.length);
      assert(Array.prototype.some.call(D.querySelectorAll('#tree .ti'), function (r) { return /Closed Corner1/.test(r.textContent); }), 'Closed Corner1 in the FeatureManager tree');
      // one undo step, redo
      UI.undo(); await idle();
      assert(UI.App.model.features.length === n0, 'one undo step removes the feature');
      near(rfCSVol(), v0, 1e-9, 'volume after undo');
      UI.redo(); await idle();
      near(rfCSVol(), wantO, 1e-9, 'volume after redo');
      // Edit Feature: the PM reopens on the picks; Butt; ✓ is one undo step
      f = UI.App.model.features[UI.App.model.features.length - 1];
      UI.editFeature(f); await wait(30); await idle();
      assert(UI.hasPM() && UI.pmTitle() === 'Closed Corner1', 'editing PM: ' + (UI.hasPM() && UI.pmTitle()));
      vals = UI.pmSpec().values;
      assert(vals.faces.length === 3 && vals.cornerType === 'overlap' && vals.gap === 0.02, 'the picks and values are back: ' + JSON.stringify(vals));
      D.querySelector('#pm button[data-key="cornerType:butt"]').click(); await wait(20);
      assert(!pmField('Overlap/underlap ratio'), 'no ratio for Butt');
      await pmAccept(); await wait(30);
      var wantB = v0 + 4 * H * (R - 0.02) * T;
      near(rfCSVol(), wantB, 1e-9, 'volume after the edit to Butt');
      assert(UI.App.model.features.length === n0 + 1, 'still one feature');
      UI.undo(); await idle();
      near(rfCSVol(), wantO, 1e-9, 'one undo step back to Overlap');
      UI.redo(); await idle();
      // save / reload
      var json = JSON.stringify(anvil.model());
      await anvil.load(json); await idle();
      near(rfCSVol(), wantB, 1e-9, 'volume after save / reload');
      // Esc on a new Closed Corner leaves nothing behind; the flyout face goes back to Break-Corner for the other groups
      UI.cmdClosedCorner(); await wait(30);
      D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await idle(); await wait(20);
      assert(!UI.hasPM() && UI.App.model.features.length === n0 + 1, 'Esc ends it with nothing added');
      caret = rfCSCaret(); caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click(); await wait(20);
      rfCSMenuItem('Break-Corner').click(); await wait(30);
      D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await idle(); await wait(20);
      assert(!UI.hasPM(), 'Break-Corner closed again');
      UI.setView('Isometric');
      assert(errors.length === errs0, 'no console errors: ' + errors.slice(errs0).join(' | '));
    });

    step('rfCS: Auto Relief — a new part\'s Base Flange/Tab offers Rectangular, ratio 0.5 (SolidWorks\' default) and stores it; Edge-Flange starts with Custom relief type off (the sheet\'s relief) and a flange on a partial edge gets the .5T relief; an older part\'s Sheet-Metal PM keeps None', async function () {
      var errs0 = errors.length;
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
      await anvil.newPart(); await idle();
      // a 4 × 3 plate with a 2 wide tab on the back edge: a flange on the back edge's left part stops at the tab
      await anvil.run('p.units("in");\np.sketch("Top").polyline([[0, 0], [4, 0], [4, -3], [3, -3], [3, -4], [1, -4], [1, -3], [0, -3]], true);'); await idle();
      UI.cmdBaseFlange(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Base Flange/Tab', 'Base Flange/Tab PM');
      var rt = pmField('Relief type'), rr = pmField('Relief ratio');
      assert(rt && rt.value === 'rect' && rr && +rr.value === 0.5, 'Auto Relief: Rectangular, 0.5: ' + (rt && rt.value) + ' ' + (rr && rr.value));
      setInput(pmField('Thickness'), '0.0598'); setInput(pmField('Bend radius'), '0.0598'); await wait(10);
      await pmAccept();
      var sh = UI.App.model.sheet;
      assert(sh.relief === 'rect' && sh.reliefRatio === 0.5, 'sheet: ' + JSON.stringify(sh));
      UI.cmdEdgeFlange(); await wait(30);
      var cr = pmField('Custom relief type');
      assert(cr && cr.type === 'checkbox' && !cr.checked && !pmField('Relief width'), 'Custom relief type off');
      assert(UI.App.command.onPick({ kind: 'edge', edge: UI.App.edges.filter(function (e) { return K.pointSegmentDistance([0.5, 0.0598, 3], e.a, e.b) < 1e-6; })[0] }) !== false, 'edge pick');
      await pmAccept();
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.type === 'flange' && f.relief === undefined && !UI.App.build.errors[f.id], 'flange without its own relief: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
      var withAuto = rfCSVol();
      var js = JSON.parse(JSON.stringify(anvil.model())), last = js.features[js.features.length - 1];
      last.relief = 'rect'; last.reliefWidth = 0.5 * 0.0598; last.reliefDepth = 0.5 * 0.0598; delete js.sheet.relief; delete js.sheet.reliefRatio;
      await anvil.load(js); await idle();
      near(rfCSVol(), withAuto, 1e-9, 'the auto relief is the flange\'s own .5T × .5T Rectangle relief');
      // an older part (a sheet without Auto Relief) keeps None in its Sheet-Metal PM
      UI.cmdSheetMetal(); await wait(30);
      assert(pmField('Relief type') && pmField('Relief type').value === 'none' && !pmField('Relief ratio'), 'older sheet: None');
      D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await idle(); await wait(20);
      assert(!UI.App.model.sheet.relief, 'the sheet is unchanged');
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
      assert(errors.length === errs0, 'no console errors: ' + errors.slice(errs0).join(' | '));
    });
  })();
