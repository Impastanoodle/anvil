  // --- rfDB (2026-10-26, lane DB): Sheet Metal ▸ Unfold / Fold with real mouse events — the ribbon buttons open the
  // PropertyManagers; Unfold: a click on the base's top face (Fixed face), clicks on the bend (add / remove / add),
  // Collect All Bends, ✓: the part lies flat (blank × T); a slot cut flat across the bend line; Fold: a click on the
  // flat bend strip, ✓: exact volume, the flat shows the 0.25 × 1.0 slot; one undo step each; Edit Feature reopens
  // with the picks; save / reload. Self-contained. ---
  (function () {
    var T = 0.0598, R = 0.0598, BA = Math.PI / 2 * (R + 0.5 * T), ZB = (R + T) - BA / 2;
    var L = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1.5, [[3, ' + T + ', 0]], { position: "inside", lengthRef: "outer" });';
    var SLOT = 'p.sketch("Top", 1).rect(2.5, ' + (-(ZB + 0.125)) + ', 1, 0.25).cut("through", { reverse: true });';
    var FACET = 8 * 0.5 * Math.sin(Math.PI / 16) * ((R + T) * (R + T) - R * R);
    function rfDBVol() { var mp = K.massProps(UI.App.mesh, UI.App.model.density); return mp.polygonal ? mp.polygonal.volume : mp.volume; }   // the faceted solid (lane FX)
    function rfDBEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfDBClick(P) { var p = UI.worldToScreen(P); rfDBEv('mousemove', p); rfDBEv('mousedown', p, $('viewport')); rfDBEv('mouseup', p); }
    function rfDBBtn(label) { return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return (b.getAttribute('aria-label') || '') === label; })[0]; }
    function rfDBPmButton(text) { return Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (b) { return b.textContent.trim() === text; })[0]; }
    function rfDBBlankArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? K.signedArea(l) : -Math.abs(K.signedArea(l))); }, 0); }
    // look at a point from above-front, zoomed in
    async function rfDBLook(P, dir) {
      var c = UI.cam, d = new W.THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
      c.dir.copy(d); c.up.set(0, 1, 0); c.target.set(P[0], P[1], P[2]); c.scale = 0.004;
      UI.applyCamera(); await idle(); await wait(30);
    }

    step('rfDB: Unfold / Fold — ribbon buttons, fixed-face and bend clicks, Collect All Bends, a slot cut flat across the bend, Fold by a click on the strip: exact volume, the flat shows the 0.25 × 1.0 slot; one undo step each; Edit Feature; save / reload', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      await anvil.run(L); await idle();
      assert(!Object.keys(UI.App.build.errors).length, 'bracket builds');
      var v0 = rfDBVol(), flat0 = anvil.flat(), n0 = UI.App.model.features.length;
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      var ub = rfDBBtn('Unfold'), fb = rfDBBtn('Fold');
      assert(ub && !ub.disabled && fb && !fb.disabled, 'Unfold and Fold on the Sheet Metal ribbon, enabled');
      ub.click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Unfold', 'Unfold PM: ' + (UI.hasPM() && UI.pmTitle()));
      // the fixed face: a click on the base's top
      await rfDBLook([2, T, 2], [0.4, 1, 0.6]);
      rfDBClick([2, T, 2]); await idle(); await wait(20);
      var vals = UI.pmSpec().values;
      assert(vals.fixedFace && Math.abs(vals.fixedFace[1] - T) < 1e-6 && !vals.bends.length, 'fixed face picked: ' + JSON.stringify(vals.fixedFace));
      // the bend: a click on its inside surface at 45°, looked at from inside the L
      var C = [3, R + T, R + T], P = [3, C[1] - R * Math.SQRT1_2, C[2] - R * Math.SQRT1_2];
      await rfDBLook(P, [0, 1, 1]);
      var s = UI.worldToScreen(P), pk = UI.pickFace(s[0], s[1]);
      assert(pk && pk.point && K.sheetBendAt(K.sheetBends(UI.App.model, UI.App.build, UI.App.mesh), pk.point, T) === 0, 'the bend is under the cursor: ' + JSON.stringify(pk && pk.point));
      rfDBClick(P); await idle(); await wait(20);
      assert(UI.pmSpec().values.bends.length === 1, 'the bend picked: ' + statusText());
      rfDBClick(P); await idle(); await wait(20);
      assert(UI.pmSpec().values.bends.length === 0, 'a second click removes it');
      rfDBClick(P); await idle(); await wait(20);
      assert(UI.pmSpec().values.bends.length === 1 && Math.abs(UI.pmSpec().values.fixedFace[1] - T) < 1e-6, 'picked again, the fixed face kept');
      rfDBPmButton('Collect All Bends').click(); await wait(20);
      assert(UI.pmSpec().values.bends.length === 1 && D.querySelectorAll('#pm .pm-list .pm-item').length >= 2, 'Collect All Bends: the one bend; rows listed');
      await pmAccept(); await wait(30);
      var uf = UI.App.model.features[UI.App.model.features.length - 1];
      assert(uf.type === 'unfold' && uf.name === 'Unfold1' && uf.bends.length === 1 && !UI.App.build.errors[uf.id], 'Unfold1: ' + JSON.stringify(uf) + ' ' + UI.App.build.errors[uf.id]);
      near(rfDBVol(), rfDBBlankArea(flat0) * T, 1e-9, 'flat: volume = blank × T');
      var bb = UI.App.build.body.getBounds();
      near(bb.max[1] - bb.min[1], T, 1e-9, 'the part lies flat');
      assert(Array.prototype.some.call(D.querySelectorAll('#tree .ti'), function (r) { return /Unfold1/.test(r.textContent); }), 'Unfold1 in the FeatureManager tree');
      UI.undo(); await idle();
      assert(UI.App.model.features.length === n0, 'one undo step removes the Unfold'); near(rfDBVol(), v0, 1e-9, 'folded again after undo');
      UI.redo(); await idle();
      // the slot, cut flat across the bend line
      await anvil.append(SLOT); await idle();
      // Fold: a click on the flat bend strip, ✓
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      rfDBBtn('Fold').click(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Fold', 'Fold PM: ' + (UI.hasPM() && UI.pmTitle()));
      var S = [1.5, T, ZB];
      await rfDBLook(S, [0.3, 1, 0.3]);
      rfDBClick(S); await idle(); await wait(20);
      assert(UI.pmSpec().values.bends.length === 1, 'the strip picked: ' + statusText());
      var n1 = UI.App.model.features.length;
      await pmAccept(); await wait(30);
      var fd = UI.App.model.features[UI.App.model.features.length - 1];
      assert(fd.type === 'fold' && fd.name === 'Fold1' && !UI.App.build.errors[fd.id], 'Fold1: ' + JSON.stringify(fd) + ' ' + UI.App.build.errors[fd.id]);
      var want = v0 - 1.0 * (FACET + (0.25 - BA) * T);
      near(rfDBVol(), want, 1e-9, 'folded with the slot round the bend');
      var flat = anvil.flat();
      assert(flat.loops.length === 2 && flat.loops[1].length === 4, 'one 4-corner hole in the flat');
      near(Math.abs(K.signedArea(flat.loops[1])), 0.25, 1e-9, 'the hole is the 0.25 × 1.0 slot');
      var dxf = anvil.dxfFlat();
      assert(/HOLES/.test(dxf) && /OUTLINE/.test(dxf), 'DXF out');
      UI.undo(); await idle();
      assert(UI.App.model.features.length === n1, 'one undo step removes the Fold');
      UI.redo(); await idle();
      near(rfDBVol(), want, 1e-9, 'redo');
      // Edit Feature on the Unfold: the picks come back; ✓ leaves the part as it was
      UI.editFeature(uf); await wait(30); await idle();
      assert(UI.hasPM() && UI.pmTitle() === 'Unfold1', 'editing PM: ' + (UI.hasPM() && UI.pmTitle()));
      vals = UI.pmSpec().values;
      assert(vals.bends.length === 1 && vals.fixedFace && Math.abs(vals.fixedFace[1] - T) < 1e-6, 'the picks are back: ' + JSON.stringify(vals));
      await pmAccept(); await wait(30);
      near(rfDBVol(), want, 1e-9, 'unchanged after the edit');
      // save / reload
      var json = JSON.parse(JSON.stringify(anvil.model()));
      await anvil.load(JSON.stringify(json)); await idle();
      near(rfDBVol(), want, 1e-9, 'volume after save / reload');
      assert(!Object.keys(UI.App.build.errors).length, 'no errors after reload');
      assert(errors.length === errs0, 'no console errors: ' + errors.slice(errs0).join(' | '));
    });
  })();
