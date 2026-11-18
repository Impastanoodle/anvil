  // --- rfOL (2026-11-18, lane flangeprofile; kernel group rfOL has the closed forms) --- (1) Edge-Flange ▸ Edit Flange
  // Profile drawn by mouse into a trapezoid: on a 16 ga 6 x 4 sheet the profile rectangle's sides are deleted, the top
  // line's ends dragged in, the two slanted sides drawn with the Line tool from the base's ends; Exit Sketch: the PM
  // comes back with the Length greyed (set by the profile), ✓: the flange is the trapezoid (volume = the closed form on
  // the profile as stored, to 1e-9). Edit Feature ▸ Edit Flange Profile opens the same four lines; a side deleted (an
  // open profile) and Exit Sketch: refused in the sketch with the reason; Discard Changes and Exit: the PM as it was, no
  // sketch left. (2) Tab and Slot in one body (below).
  (function () {
    var T = 0.0598, R = 0.06, BA = Math.PI / 2 * (R + T / 2), H = 1.5, t30 = Math.tan(Math.PI / 6);
    var BASE = 'p.units("in");\np.sheet(0.0598, 0.06, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n';
    function rfOLEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfOLClick(p) { rfOLEv('mousemove', p); rfOLEv('mousedown', p, $('viewport')); rfOLEv('mouseup', p); }
    function rfOLKey(k) { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
    async function rfOLDrag(from, to) {
      rfOLEv('mousemove', from); await wait(15);
      rfOLEv('mousedown', from, $('viewport'));
      for (var k = 1; k <= 8; k++) { rfOLEv('mousemove', [from[0] + (to[0] - from[0]) * k / 8, from[1] + (to[1] - from[1]) * k / 8]); await wait(15); }
      rfOLEv('mouseup', to);
      await idle(); await wait(20);
    }
    function rfOLScr(uv) { return UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])); }
    function rfOLVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
    function rfOLSketches() { return UI.App.model.features.filter(function (f) { return f.type === 'sketch'; }).length; }
    function rfOLLines() { return UI.activeSketchFeature().entities.filter(function (e) { return e.t === 'line' && !e.construction; }); }
    async function rfOLDelete(uv) {
      UI.setTool('select'); await wait(10);
      rfOLClick(rfOLScr(uv)); await idle(); await wait(20);
      assert(UI.App.sel && UI.App.sel.kind === 'entity', 'picked at ' + uv + ': ' + JSON.stringify(UI.App.sel));
      rfOLKey('Delete'); await idle(); await wait(30);
    }

    step('rfOL: Edit Flange Profile drawn into a trapezoid by mouse (sides deleted, the top\'s ends dragged in, slanted sides drawn with the Line tool), Exit Sketch: Length greyed, ✓: the flange is the trapezoid (closed form to 1e-9); edit again, an open profile refused in the sketch, Discard Changes: as it was', async function () {
      var errs0 = errors.length, notes = [], du = UI.defaultUnits();
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
      UI.setDefaultUnits('in');
      try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
      await anvil.run(BASE); await idle();
      UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      var nSk = rfOLSketches();
      UI.cmdEdgeFlange(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Edge-Flange', 'Edge-Flange PM');
      rfOLClick(UI.worldToScreen(edgeNear([3, T, 0]).mid)); await idle(); await wait(20);
      assert(UI.pmSpec().values.edges.length === 1, 'edge taken: ' + statusText());
      setInput(pmField('Length'), H + R + T); await wait(10);   // to the outer virtual sharp: the wall H
      clickPmButton('Edit Flange Profile'); await idle(); await wait(60);
      assert(UI.App.mode === 'sketch', 'a sketch opened: ' + statusText());
      UI.setView('Normal To'); await idle(); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      var ln = rfOLLines();
      assert(ln.length === 4 && Math.abs(Math.max(ln[1].y1, ln[1].y2) - H) < 1e-9, 'the rectangle 6 x ' + H + ': ' + JSON.stringify(ln));
      // the two sides out, the top's ends in by H tan 30, the slanted sides drawn from the base's ends
      await rfOLDelete([6, H / 2]);
      await rfOLDelete([0, H / 2]);
      assert(rfOLLines().length === 2, 'two lines left: ' + JSON.stringify(rfOLLines()));
      UI.setTool('select'); await wait(10);
      await rfOLDrag(rfOLScr([6, H]), rfOLScr([6 - H * t30, H]));
      await rfOLDrag(rfOLScr([0, H]), rfOLScr([H * t30, H]));
      var top = rfOLLines().filter(function (e) { return e.y1 > H / 2 && Math.abs(e.y1 - e.y2) < 1e-9; })[0];
      assert(top && Math.abs(top.y1 - H) < 0.02, 'the top stays level: ' + JSON.stringify(rfOLLines()));
      var Ht = top.y1;   // the drags may nudge it (no dimension holds it)
      var tx = [Math.min(top.x1, top.x2), Math.max(top.x1, top.x2)];
      UI.setTool('line'); await wait(10);
      rfOLClick(rfOLScr([6, 0])); await wait(20); rfOLClick(rfOLScr([tx[1], Ht])); await wait(20);
      UI.cancelTool(); await idle();
      UI.setTool('line'); await wait(10);
      rfOLClick(rfOLScr([0, 0])); await wait(20); rfOLClick(rfOLScr([tx[0], Ht])); await wait(20);
      UI.cancelTool(); await idle();
      assert(rfOLLines().length === 4, 'four lines: ' + JSON.stringify(rfOLLines()));
      notes.push('top ' + tx.map(function (x) { return x.toFixed(3); }).join('..'));
      D.querySelector('.cc-exit').click(); await idle(); await wait(60); await idle();
      assert(UI.App.mode !== 'sketch' && UI.hasPM() && UI.pmTitle() === 'Edge-Flange', 'the Edge-Flange PM is back: ' + statusText());
      assert(rfOLSketches() === nSk, 'no profile sketch left in the tree');
      var v = UI.pmSpec().values;
      assert(v.profile && v.profile.entities.length === 4, 'the profile: ' + JSON.stringify(v.profile));
      assert(pmField('Length').disabled, 'Length greyed');
      near(+pmField('Length').value, Ht + R + T, 1e-6, 'Length = the profile\'s top + R + T');
      assert(!pmField('Profile start offset'), 'no set-back boxes for a sketched profile');
      await pmAccept(); await wait(30);
      var fs = UI.App.model.features, f = fs[fs.length - 1];
      assert(f.type === 'flange' && f.profile && !UI.App.build.errors[f.id], 'flange: ' + UI.App.build.errors[f.id]);
      var wp = K.flangeWallProfile(f.profile), topE = f.profile.entities.filter(function (e) { return Math.abs(e.y1 - Ht) < 1e-6 && Math.abs(e.y2 - Ht) < 1e-6; })[0];
      var slant = topE ? Math.atan2(wp.ub - Math.max(topE.x1, topE.x2), Ht) * 180 / Math.PI : NaN;
      assert(Math.abs(slant - 30) < 1, 'the end slanted about 30 degrees: ' + slant);
      near(rfOLVol(), T * 24 + 6 * Math.PI / 4 * ((R + T) * (R + T) - R * R) + T * wp.area, 1e-9, 'the trapezoid flange: closed form');
      notes.push('volume ' + rfOLVol().toFixed(6) + ', slant ' + slant.toFixed(2));
      // Edit Feature ▸ Edit Flange Profile: the four lines again; a side deleted, Exit: refused in the sketch
      UI.editFeature(f); await wait(30); await idle();
      assert(UI.hasPM() && pmField('Length').disabled, 'Edit Feature: Length greyed');
      clickPmButton('Edit Flange Profile'); await idle(); await wait(60);
      assert(UI.App.mode === 'sketch' && rfOLLines().length === 4, 'the profile opens: ' + JSON.stringify(rfOLLines()));
      var sk = UI.activeSketchFeature();
      assert(sk.rels.some(function (q) { return q.type === 'collinear'; }), 'the base Collinear with the edge');
      UI.setView('Normal To'); await idle(); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      await rfOLDelete([(6 + tx[1]) / 2, Ht / 2]);
      D.querySelector('.cc-exit').click(); await idle(); await wait(60); await idle(); await wait(30);
      assert(UI.App.mode === 'sketch' && /open/.test(statusText()), 'refused in the sketch: ' + statusText());
      notes.push(statusText().slice(0, 80));
      D.querySelector('.cc-cancel').click(); await idle(); await wait(60); await idle();
      if (modalOpen()) { clickModalButton('Discard Changes and Exit'); await idle(); await wait(60); await idle(); }
      assert(UI.App.mode !== 'sketch' && UI.hasPM() && UI.pmSpec().values.profile && UI.pmSpec().values.profile.entities.length === 4, 'the PM is back as it was');
      assert(rfOLSketches() === nSk, 'no sketch left after Discard');
      UI.pmCancel(); await idle();
      near(rfOLVol(), T * 24 + 6 * Math.PI / 4 * ((R + T) * (R + T) - R * R) + T * wp.area, 1e-9, 'the part unchanged');
      UI.setView('Isometric');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });
  })();

  // --- rfOL (2) Sheet Metal ▸ Tab and Slot in one body with real mouse events: a folded box (the lid flange's free end
  // 0.01 from the back wall), the lid's top free edge clicked, 2 instances 1 long, the slot offsets start at .01 (one body),
  // ✓: one body, volume = box - 2 slots + 2 tabs, the flat has the 2 slots as holes.
  (function () {
    var T = 0.06, R = 0.06, G = 0.01, H = 4 - 2 * T - R - G;
    function rfOLsPoly(pts) { return pts.map(function (p, i) { var q = pts[(i + 1) % pts.length]; return { t: 'line', x1: p[0], y1: p[1], x2: q[0], y2: q[1] }; }); }
    var BOX = 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
      'p.flange(2, [[3, 0.06, 0]], { position: "inside", lengthRef: "outer" });\np.flange(2.5, [[3, 0.06, 4]], { position: "inside", lengthRef: "outer" });\n' +
      'p.flange(1, [[3, 2, 0.06]], { position: "inside", relief: "rect", startPoint: [0, 2, 0.06], profile: ' + JSON.stringify({ entities: rfOLsPoly([[1, 0], [5, 0], [5, H], [1, H]]) }) + ' });\n';
    function rfOLsEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfOLsClick(p) { rfOLsEv('mousemove', p); rfOLsEv('mousedown', p, $('viewport')); rfOLsEv('mouseup', p); }
    function rfOLsVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }

    step('rfOL: Tab and Slot in one body from the Sheet Metal ribbon: a folded box, the lid flange free edge clicked (0.01 from the back wall), 2 instances 1 long, slot offsets .01 to start with, ✓: one body, volume = box - 2 slots + 2 tabs, 2 slots in the flat', async function () {
      var errs0 = errors.length, notes = [], du = UI.defaultUnits();
      UI.setDefaultUnits('in');
      try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
      await anvil.run(BOX); await idle();
      assert(UI.App.build.bodies.length === 1 && !Object.keys(UI.App.build.errors).length, 'one body: ' + JSON.stringify(UI.App.build.errors));
      var v0 = rfOLsVol();
      UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      var btn = Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return /Tab and\s*Slot/.test(b.textContent); })[0];
      assert(btn, 'the Tab and Slot button');
      btn.click(); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Tab and Slot', 'Tab and Slot PM opens in a one-body part: ' + statusText());
      near(+pmField('Slot length offset').value, 0.01, 1e-9, 'slot clearance .01 to start with');
      var e = edgeNear([3, 2, 4 - T - G]);
      rfOLsClick(UI.worldToScreen(e.mid)); await idle(); await wait(20);
      var v = UI.pmSpec().values;
      assert(v.edges.length === 1 && Math.abs(v.edges[0].at[2] - (4 - T - G)) < 1e-6, 'the lid free edge taken: ' + JSON.stringify(v.edges) + ' ' + statusText());
      setInput(pmField('Number of instances'), 2); await wait(10);
      setInput(pmField('Tab length'), 1); await wait(20);
      notes.push(statusText().slice(0, 100));
      assert(/2 tabs/.test(statusText()), 'preview: ' + statusText());
      await pmAccept(); await wait(30);
      var fs = UI.App.model.features, f = fs[fs.length - 1];
      assert(f.type === 'tabSlot' && !UI.App.build.errors[f.id] && UI.App.build.bodies.length === 1, 'feature: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
      near(rfOLsVol() - v0, 2 * (1 * (G + T) * T - 1.02 * (T + 0.02) * T), 1e-9, 'box - 2 slots + 2 tabs');
      var fl = anvil.flat();
      assert(fl.loops.length === 3, 'the flat has the 2 slots: ' + fl.loops.length + ' loops');
      notes.push('volume ' + rfOLsVol().toFixed(6));
      UI.setView('Isometric');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });
  })();
