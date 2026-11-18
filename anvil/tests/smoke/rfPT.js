  // --- rfPT (2026-11-18, lane tabslot) --- Edge-Flange ▸ Edit Flange Profile with real mouse events: the 6 in edge of a
  // 6 x 4 sheet clicked, Length 1, Edit Flange Profile opens a sketch on the wall (the edge as a fixed construction line,
  // the profile a rectangle on it); both sides dragged in, Exit Sketch: the PM comes back with Profile start / end offset
  // near 2, typed exactly, ✓: a 2 in flange centred on the edge with a relief each side (kernel group rfPT has the closed
  // forms). Edit Feature ▸ Edit Flange Profile shows the rectangle at 2..4; Discard Changes brings the PM back as it was
  // and leaves no sketch behind. Self-contained.
  (function () {
    var T = 0.1, R = 0.1, BA = Math.PI / 2 * (R + 0.5 * T), WALL = 1 - (R + T);
    var BASE = 'p.units("in");\np.sheet(0.1, 0.1, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n';
    function rfPTEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfPTClick(p) { rfPTEv('mousemove', p); rfPTEv('mousedown', p, $('viewport')); rfPTEv('mouseup', p); }
    async function rfPTDrag(from, to) {
      rfPTEv('mousemove', from); await wait(15);
      rfPTEv('mousedown', from, $('viewport'));
      for (var k = 1; k <= 8; k++) { rfPTEv('mousemove', [from[0] + (to[0] - from[0]) * k / 8, from[1] + (to[1] - from[1]) * k / 8]); await wait(15); }
      rfPTEv('mouseup', to);
      await idle(); await wait(20);
    }
    function rfPTScr(uv) { return UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])); }
    function rfPTVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
    function rfPTSketches() { return UI.App.model.features.filter(function (f) { return f.type === 'sketch'; }).length; }

    step('rfPT: Edge-Flange ▸ Edit Flange Profile: the profile\'s sides dragged in on the wall sketch, Exit Sketch, the set-backs typed 2 / 2, ✓: a 2 in flange centred on the 6 in edge; Edit Feature shows the profile at 2..4 and Discard Changes leaves the PM and the tree as they were', async function () {
      var errs0 = errors.length, notes = [], du = UI.defaultUnits();
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
      UI.setDefaultUnits('in');
      try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
      await anvil.run(BASE); await idle();
      UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      var nSk = rfPTSketches();
      UI.cmdEdgeFlange(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Edge-Flange', 'Edge-Flange PM');
      var e = edgeNear([3, T, 0]), s = UI.worldToScreen(e.mid);
      rfPTClick(s); await idle(); await wait(20);
      assert(UI.pmSpec().values.edges.length === 1, 'edge taken: ' + statusText());
      setInput(pmField('Length'), 1); await wait(10);
      assert(!pmField('Profile start offset'), 'no set-back boxes before the profile is edited');
      clickPmButton('Edit Flange Profile'); await idle(); await wait(60);
      assert(UI.App.mode === 'sketch', 'a sketch opened: ' + statusText());
      var sk = UI.activeSketchFeature();
      assert(sk && sk.entities.length === 5 && sk.entities[0].construction, 'the edge and the profile: ' + JSON.stringify(sk && sk.entities));
      near(sk.entities[0].x2, 6, 1e-9, 'the edge is 6 long');
      if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      // drag the left side right and the right side left (the rectangle's relations keep it square)
      await rfPTDrag(rfPTScr([0, 0.5]), rfPTScr([2, 0.5]));
      await rfPTDrag(rfPTScr([6, 0.5]), rfPTScr([4, 0.5]));
      var ents = UI.activeSketchFeature().entities;
      notes.push('profile x ' + Math.min(ents[4].x1, ents[4].x2).toFixed(3) + '..' + Math.max(ents[2].x1, ents[2].x2).toFixed(3));
      var exitB = D.querySelector('.cc-exit');
      assert(exitB, 'the Exit Sketch corner button');
      exitB.click(); await idle(); await wait(60); await idle();
      assert(UI.App.mode !== 'sketch' && UI.hasPM() && UI.pmTitle() === 'Edge-Flange', 'the Edge-Flange PM is back: ' + statusText());
      assert(rfPTSketches() === nSk, 'no profile sketch left in the tree');
      var so = pmField('Profile start offset'), eo = pmField('Profile end offset');
      assert(so && eo, 'the set-back boxes show');
      notes.push('dragged: start ' + (+so.value).toFixed(3) + ', end ' + (+eo.value).toFixed(3));
      assert(Math.abs(+so.value - 2) < 0.3 && Math.abs(+eo.value - 2) < 0.3, 'the drags set the set-backs near 2: ' + notes.join('; '));
      near(+pmField('Length').value, 1, 1e-6, 'the length kept');
      setInput(so, 2); await wait(10);
      setInput(pmField('Profile end offset'), 2); await wait(10);
      // Custom Relief Type ▸ Rectangle (this sheet has no Auto Relief): T wide, T/2 deep
      var cr = pmField('Custom relief type');
      assert(cr && cr.type === 'checkbox', 'Custom relief type box');
      cr.click(); await wait(20);
      setInput(pmField('Relief type'), 'rect'); await wait(20);
      await pmAccept(); await wait(30);
      var fs = UI.App.model.features, f = fs[fs.length - 1];
      assert(f.type === 'flange' && +f.startOffset === 2 && +f.endOffset === 2 && Array.isArray(f.startPoint) && !UI.App.build.errors[f.id], 'flange: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
      var rec = UI.App.build.flanges[f.id][0], rl = rec.reliefs || [];
      near(rec.len, 2, 1e-9, 'the flange is 2 long');
      assert(rl[0] && rl[1] && f.relief === 'rect', 'a Rectangle relief each side: ' + JSON.stringify(rl));
      near(rfPTVol(), T * (24 - 2 * T * (T / 2) + 2 * (BA + WALL)), 1e-9, 'folded = T x blank');
      var fl = anvil.flat(), bx = [fl.bends[0].a[0], fl.bends[0].b[0]].sort(function (p, q) { return p - q; });
      near(bx[0], 2, 1e-9, 'bend line from 2'); near(bx[1], 4, 1e-9, 'to 4');
      notes.push('volume ' + rfPTVol().toFixed(6) + ', bend ' + bx.join('..'));
      // Edit Feature ▸ Edit Flange Profile: the rectangle at 2..4; Discard Changes and Exit: the PM as it was
      UI.editFeature(f); await wait(30); await idle();
      assert(UI.hasPM() && Math.abs(+pmField('Profile start offset').value - 2) < 1e-9, 'Edit Feature shows the set-backs');
      clickPmButton('Edit Flange Profile'); await idle(); await wait(60);
      ents = UI.activeSketchFeature().entities;
      near(Math.min(ents[1].x1, ents[1].x2), 2, 1e-9, 'profile from 2'); near(Math.max(ents[1].x1, ents[1].x2), 4, 1e-9, 'to 4');
      near(Math.max(ents[2].y1, ents[2].y2), 1, 1e-9, 'top at the length');
      D.querySelector('.cc-cancel').click(); await idle(); await wait(60); await idle();
      if (modalOpen()) { clickModalButton('Discard Changes and Exit'); await idle(); await wait(60); await idle(); }
      assert(UI.App.mode !== 'sketch' && UI.hasPM() && Math.abs(+pmField('Profile end offset').value - 2) < 1e-9, 'the PM is back as it was');
      assert(rfPTSketches() === nSk, 'no sketch left after Discard');
      UI.pmCancel(); await idle();
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });
  })();

  // --- rfPT (2) Sheet Metal â–¸ Tab and Slot from the ribbon with real mouse events: the plate's bottom edge clicked where it
  // rests on the sheet, 3 instances 0.5 long, slot offsets .01 / .005 (Equal offset unticked), âœ“: both bodies' volumes
  // exact, the flat has the 3 slots; the tree row has the Tab and Slot icon; Edit Feature to 2 instances.
  (function () {
    var T = 0.1;
    var CODE = 'p.units("in");\np.sheet(0.1, 0.1, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.sketch("Front", 2).rect(1, 0.1, 4, 2).end().extrude(0.1, { merge: false });\n';
    function rfPTsEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfPTsClick(p) { rfPTsEv('mousemove', p); rfPTsEv('mousedown', p, $('viewport')); rfPTsEv('mouseup', p); }
    function rfPTsVols() { return UI.App.build.bodies.map(function (b) { return K.massProps(K.meshFromBody(b), 1).volume; }); }

    step('rfPT: Tab and Slot from the Sheet Metal ribbon: the plate\'s bottom edge clicked on the sheet, 3 instances 0.5 long, slot offsets .01 / .005, âœ“: sheet 2.4 - 3 x .52 x .11 x T, plate 0.8 + 3 x .5 x T x T, 3 slots in the flat; Edit Feature to 2 instances', async function () {
      var errs0 = errors.length, notes = [], du = UI.defaultUnits();
      UI.setDefaultUnits('in');
      try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
      await anvil.run(CODE); await idle();
      assert(UI.App.build.bodies.length === 2, 'two bodies');
      UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      var btn = Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return /Tab and\s*Slot/.test(b.textContent); })[0];
      assert(btn, 'the Tab and Slot button on the Sheet Metal tab');
      btn.click(); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Tab and Slot', 'Tab and Slot PM: ' + (UI.hasPM() && UI.pmTitle()));
      var ok = D.querySelector('#pm .pm-ok');
      assert(ok && ok.classList.contains('disabled'), 'greyed âœ“ before the edge');
      var e = edgeNear([3, 0.1, 2]), s = UI.worldToScreen(e.mid);
      rfPTsClick(s); await idle(); await wait(20);
      var v = UI.pmSpec().values;
      assert(v.edges.length === 1 && Math.abs(v.edges[0].at[2] - 2) < 1e-6 && Math.abs(v.edges[0].at[1] - 0.1) < 1e-6, 'the plate\'s bottom front edge taken: ' + JSON.stringify(v.edges) + ' ' + statusText());
      setInput(pmField('Number of instances'), 3); await wait(10);
      setInput(pmField('Tab length'), 0.5); await wait(10);
      setInput(pmField('Slot length offset'), 0.01); await wait(10);
      var eq = pmField('Equal offset');
      assert(eq && eq.type === 'checkbox' && eq.checked, 'Equal offset ticked');
      eq.click(); await wait(20);
      setInput(pmField('Slot width offset'), 0.005); await wait(20);
      notes.push(statusText().slice(0, 120));
      assert(/3 tabs/.test(statusText()), 'preview: ' + statusText());
      await pmAccept(); await wait(30);
      var fs = UI.App.model.features, f = fs[fs.length - 1];
      assert(f.type === 'tabSlot' && f.count === 3 && !UI.App.build.errors[f.id], 'feature: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
      var vol = rfPTsVols();
      near(vol[0], 2.4 - 3 * 0.52 * 0.11 * T, 1e-9, 'sheet less 3 slots');
      near(vol[1], 0.8 + 3 * 0.5 * T * 0.1, 1e-9, 'plate plus 3 tabs');
      var fl = anvil.flat();
      assert(fl.loops.length === 4, 'the flat has 3 slots: ' + fl.loops.length + ' loops');
      var row = D.querySelector('#tree .ti[data-fid="' + f.id + '"]');
      assert(row && /Tab and Slot1/.test(row.textContent), 'tree row: ' + (row && row.textContent));
      notes.push('sheet ' + vol[0].toFixed(6) + ', plate ' + vol[1].toFixed(6));
      UI.editFeature(f); await wait(30); await idle();
      assert(UI.hasPM() && +pmField('Number of instances').value === 3, 'Edit Feature shows 3');
      setInput(pmField('Number of instances'), 2); await wait(10);
      await pmAccept(); await wait(30);
      vol = rfPTsVols();
      near(vol[0], 2.4 - 2 * 0.52 * 0.11 * T, 1e-9, 'two slots');
      assert(anvil.flat().loops.length === 3, 'two slots in the flat');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });
  })();
