  // --- rfJY (2026-11-06, lane sweptflange-2) --- an Edge Flange clicked onto a Swept Flange's straight edge (the
  // ribbon, the edge clicked in the viewport, ✓): the flat unfolds it like a Base Flange's; a hole cut after it is in
  // the flat. Self-contained.
  (function () {
    var T = 0.06;
    function rfJYEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfJYClick(p) { rfJYEv('mousemove', p); rfJYEv('mousedown', p, $('viewport')); rfJYEv('mouseup', p); }
    function rfJYButton(label) { UI.setRibbonTab('Sheet Metal'); return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return (b.getAttribute('aria-label') || '').trim() === label; })[0]; }

    step('rfJY: Sheet Metal ▸ Edge Flange on the leg of an L Swept Flange (edge clicked): 2 bends in the flat, = the open-profile Base Flange twin\'s flat; then a Ø.5 hole in the plate shows in the flat', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\nvar path = p.sketch("Top").line(0, 0, 0, -10).id();\nvar prof = p.sketch("Front").polyline([[0, 0], [2, 0], [2, 1]], false).id();\np.sweptFlange(prof, path);\n'); await idle();
      UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      var b = rfJYButton('Edge Flange');
      assert(b, 'Edge Flange button');
      b.click(); await idle(); await wait(30);
      assert(UI.hasPM() && /Edge-Flange|Edge Flange/.test(UI.pmTitle()), 'PM ' + (UI.hasPM() && UI.pmTitle()));
      rfJYClick(UI.worldToScreen([2 + T, 1, 5])); await idle(); await wait(30);
      assert((UI.pmSpec().values.edges || []).length === 1, 'edge taken: ' + JSON.stringify(UI.pmSpec().values.edges));
      await pmAccept();
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.type === 'flange' && !UI.App.build.errors[f.id], 'feature ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
      var flat = anvil.flat();
      assert(flat.loops.length === 1 && flat.bends.length === 2, 'flat: ' + flat.loops.length + ' loops, ' + flat.bends.length + ' bends');
      // the twin: the same section as an open-profile Base Flange 10 deep, the same flange
      var K = W.Kernel, m = K.newModel('twin'), code = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Front").polyline([[0, 0], [2, 0], [2, 1]], false).end().baseFlange(null, { depth: 10 });\n';
      K.runScript(m, code);
      var ff = JSON.parse(JSON.stringify(f)); ff.id = 9999; m.features.push(ff);
      var bb = K.rebuild(m), tf = K.flatPattern(m, bb, K.meshFromBody(bb.body));
      near(Math.abs(K.signedArea(flat.loops[0])), Math.abs(K.signedArea(tf.loops[0])), 1e-9, 'the twin\'s blank');
      await anvil.append('p.sketch("Top").circle(1, -5, 0.25).cut("through");'); await idle();
      var f2 = anvil.flat();
      assert(f2.loops.length === 2, 'the hole in the flat: ' + f2.loops.length + ' loops');
      assert(/\n0\nCIRCLE\n/.test(anvil.dxfOutput({ export: 'sheet' })), 'a CIRCLE in the DXF');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    });
  })();
