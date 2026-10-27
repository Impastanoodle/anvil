  // --- rfDJ (2026-10-27, lane DJ): a second Unfold with real mouse events — a U-channel with its front bend unfolded
  // by Unfold1; the ribbon's Unfold opens a second PropertyManager that offers the bend Unfold1 left folded (1 bend in
  // the part); a click on that bend's inside surface picks it, ✓: the whole part lies flat (blank × T); Fold with
  // Collect All Bends picks both strips, ✓: the channel is back, exact; one undo step each. Self-contained. ---
  (function () {
    var T = 0.0598, R = 0.0598;
    var U = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1.5, [[3, ' + T + ', 0], [3, ' + T + ', 4]], { position: "inside", lengthRef: "outer" });';
    function rfDJVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
    function rfDJEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfDJClick(P) { var p = UI.worldToScreen(P); rfDJEv('mousemove', p); rfDJEv('mousedown', p, $('viewport')); rfDJEv('mouseup', p); }
    function rfDJBtn(label) { return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return (b.getAttribute('aria-label') || '') === label; })[0]; }
    function rfDJPmButton(text) { return Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (b) { return b.textContent.trim() === text; })[0]; }
    async function rfDJLook(P, dir) {
      var c = UI.cam, d = new W.THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
      c.dir.copy(d); c.up.set(0, 1, 0); c.target.set(P[0], P[1], P[2]); c.scale = 0.004;
      UI.applyCamera(); await idle(); await wait(30);
    }

    step('rfDJ: a second Unfold while one is open — the PM offers the bend left folded, a click on it picks it, ✓ lays the whole part flat; Fold with Collect All Bends folds both back, exact; one undo step each', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      await anvil.run(U); await idle();
      assert(!Object.keys(UI.App.build.errors).length, 'channel builds');
      var v0 = rfDJVol(), flat0 = anvil.flat(), bends = K.sheetBends(UI.App.model, UI.App.build, UI.App.mesh);
      var front = bends.filter(function (b) { return b.at[2] < 1; })[0].at.map(function (x) { return Math.round(x * 1e6) / 1e6; });
      await anvil.append('p.unfold([1, ' + T + ', 2], [' + JSON.stringify(front) + ']);'); await idle();
      assert(!Object.keys(UI.App.build.errors).length, 'Unfold1 (the front bend) builds');
      var n1 = UI.App.model.features.length;
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      rfDJBtn('Unfold').click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Unfold', 'second Unfold PM: ' + (UI.hasPM() && UI.pmTitle()));
      assert(/^1$/.test((Array.prototype.filter.call(D.querySelectorAll('#pm .pm-static, #pm .pm-row'), function (e) { return /Bends in the part/.test(e.textContent); })[0] || { textContent: '' }).textContent.replace(/[^\d]/g, '')), 'one bend offered (the back one Unfold1 left folded)');
      // the back bend's inside surface at 45°, seen from inside the channel
      var C = [3, R + T, 4 - (R + T)], P = [3, C[1] - R * Math.SQRT1_2, C[2] + R * Math.SQRT1_2];
      await rfDJLook(P, [0, 1, -1]);
      rfDJClick(P); await idle(); await wait(20);
      assert(UI.pmSpec().values.bends.length === 1 && !UI.pmSpec().values.fixedFace, 'the back bend picked: ' + JSON.stringify(UI.pmSpec().values) + ' ' + statusText());
      await pmAccept(); await wait(30);
      var u2 = UI.App.model.features[UI.App.model.features.length - 1];
      assert(u2.type === 'unfold' && u2.name === 'Unfold2' && !UI.App.build.errors[u2.id], 'Unfold2: ' + JSON.stringify(u2) + ' ' + UI.App.build.errors[u2.id]);
      var bb = UI.App.build.body.getBounds();
      near(bb.max[1] - bb.min[1], T, 1e-9, 'the whole channel lies flat');
      near(rfDJVol(), K.signedArea(flat0.loops[0]) * T, 1e-9, 'volume = blank × T');
      UI.undo(); await idle();
      assert(UI.App.model.features.length === n1, 'one undo step removes Unfold2');
      UI.redo(); await idle();
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      rfDJBtn('Fold').click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Fold', 'Fold PM');
      rfDJPmButton('Collect All Bends').click(); await wait(30);
      assert(UI.pmSpec().values.bends.length === 2, 'Collect All Bends: both strips: ' + UI.pmSpec().values.bends.length);
      await pmAccept(); await wait(30);
      var fd = UI.App.model.features[UI.App.model.features.length - 1];
      assert(fd.type === 'fold' && !UI.App.build.errors[fd.id], 'Fold: ' + JSON.stringify(fd) + ' ' + UI.App.build.errors[fd.id]);
      near(rfDJVol(), v0, 1e-9, 'the channel is back');
      var bb2 = UI.App.build.body.getBounds();
      near(bb2.max[1], 1.5, 1e-9, 'both walls stand 1.5 tall');
      assert(errors.length === errs0, 'no console errors: ' + errors.slice(errs0).join(' | '));
    });
  })();
