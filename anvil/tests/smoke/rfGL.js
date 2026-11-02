  // --- rfGL (lane open-base): Base Flange/Tab on an open sketch: the Direction 1 PM, depth typed, ✓, the flat by hand,
  // Edit Feature comes back to the same PM, one undo takes it back. Self-contained. ---
  (function () {
    var T = 0.06, R = 0.06;
    function rfGLOk() { var b = D.querySelector('#pm .pm-ok'); assert(b, 'PM ✓ button'); b.click(); }
    step('rfGL: Base Flange on an open U sketch: Direction 1 in the PM, depth typed, the flat length, Edit Feature, undo', async function () {
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Front").polyline([[3, 2], [3, 0], [0, 0], [0, 2]], false).end();\n'); await idle();
      var n0 = UI.App.model.features.length;
      UI.cmdBaseFlange(); await idle();
      assert(UI.hasPM() && UI.pmTitle() === 'Base Flange/Tab', 'PM: ' + UI.pmTitle());
      var d = pmField('Depth');
      assert(d, 'Depth field');
      d.focus(); setInput(d, '4'); await idle();
      rfGLOk(); await idle(); await idle();
      assert(!UI.hasPM(), 'PM closed');
      var f = UI.App.model.features[n0];
      assert(f && f.openBase && f.sheetBase && +f.depth === 4 && f.name === 'Base-Flange1', 'feature: ' + JSON.stringify(f));
      var fl = K.flatPattern(UI.App.model, UI.App.build, UI.App.mesh), Rt = R + T;
      var L = (2 - Rt) + (3 - 2 * Rt) + (2 - Rt) + 2 * (Math.PI / 2) * (R + 0.5 * T);
      assert(Math.abs(fl.size[0] - L) < 1e-6 && Math.abs(fl.size[1] - 4) < 1e-6, 'flat ' + fl.size + ' want ' + L);
      assert(!Object.keys(UI.App.build.errors).length, 'errors: ' + JSON.stringify(UI.App.build.errors));
      UI.editFeature(f); await idle();
      assert(UI.hasPM() && pmField('Depth'), 'Edit Feature opens the Direction 1 PM: ' + UI.pmTitle());
      var c = D.querySelector('#pm .pm-cancel');
      if (c) c.click(); else UI.closePM();
      await idle();
      UI.undo(); await idle(); await idle();
      assert(UI.App.model.features.length === n0, 'one undo takes it back: ' + UI.App.model.features.length);
    });
  })();
