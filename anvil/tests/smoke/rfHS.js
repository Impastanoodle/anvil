// rfHS: the FeatureManager hides completely and comes back from a pull tab (user 2026-11-04: "the left panel ... not
// locked at a minimum size, rather its able to be completely hidden with a pull tab always extruded"), and pulling the
// panel never moves the model on the screen ("the pulling of the panel should not change the position of the part
// relative to the screen").
(function () {
  function rfHSAt(p) { var r = UI.viewport.getBoundingClientRect(), s = UI.worldToScreen(p); return [r.left + s[0], r.top + s[1]]; }
  function rfHSFm() { return parseFloat(getComputedStyle(D.documentElement).getPropertyValue('--fm-w')); }
  function rfHSDrag(t, x0, y0, dx) {
    t.dispatchEvent(new W.PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 7, clientX: x0, clientY: y0 }));
    for (var i = 1; i <= 10; i++) t.dispatchEvent(new W.PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientX: x0 + dx * i / 10, clientY: y0 }));
    t.dispatchEvent(new W.PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientX: x0 + dx, clientY: y0 }));
  }
  step('rfHS: the pull tab hides and shows the FeatureManager (click, F9, drag shut, drag out below the old 200 px minimum); the model keeps its place on the screen throughout; the hidden state is remembered', async function () {
    var errs0 = errors.length;
    try {
      await anvil.newPart(); await idle();
      await anvil.run("p.sketch('Front').rect(0, 0, 60, 40).extrude(20)"); await idle();
      UI.setView('Isometric'); await wait(500);
      var tab = $('fm-tab'), pt = [30, 20, 10];
      assert(tab && tab.getBoundingClientRect().width > 8, 'the pull tab is out');
      assert(!UI.featureManagerHidden() && rfHSFm() >= 140, 'the FeatureManager is shown: ' + rfHSFm());
      var a0 = rfHSAt(pt), msg = [];
      function same(what) { var a = rfHSAt(pt); msg.push(what + ' ' + a.map(Math.round)); assert(Math.abs(a[0] - a0[0]) < 1 && Math.abs(a[1] - a0[1]) < 1, what + ': the model moved on the screen from ' + a0.map(Math.round) + ' to ' + a.map(Math.round)); }
      tab.click(); await wait(60);   // a keyboard click (detail 0) toggles
      assert(UI.featureManagerHidden() && rfHSFm() === 0 && $('left').getBoundingClientRect().width < 1, 'click: hidden');
      assert(Math.abs($('fm-tab').getBoundingClientRect().left - UI.viewport.getBoundingClientRect().left) < 1, 'the tab sits on the graphics area\'s left edge');
      same('hidden');
      var kept = 'no storage'; try { kept = localStorage.getItem('anvil.fmHidden'); } catch (e) { }
      assert(kept === '1' || kept === 'no storage', 'the hidden state is kept: ' + kept);
      D.body.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'F9', bubbles: true, cancelable: true })); await wait(60);
      assert(!UI.featureManagerHidden() && rfHSFm() >= 140, 'F9: shown again');
      same('F9 shown');
      var r = tab.getBoundingClientRect();
      rfHSDrag(tab, r.left + 6, r.top + 20, -400); await wait(60);
      assert(UI.featureManagerHidden(), 'dragged shut: hidden');
      same('dragged shut');
      r = tab.getBoundingClientRect();
      rfHSDrag(tab, r.left + 6, r.top + 20, 150); await wait(60);
      assert(!UI.featureManagerHidden() && Math.abs(rfHSFm() - 150) <= 2, 'dragged out to 150 px (no 200 px floor): ' + rfHSFm());
      same('dragged out');
      return msg.join('; ');
    } finally {
      UI.setFeatureManagerHidden(false);
      try { localStorage.removeItem('anvil.fmHidden'); localStorage.removeItem('anvil.fmWidth'); } catch (e) { }
      var sp = $('left').querySelector(':scope > .split'); if (sp) sp.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true }));
      await idle();
      assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    }
  });

  // (user 2026-11-04: "i click empty space and this prompt doesnt disappear")
  step('rfHS: the Select tool sketch help line goes away at a press on empty space; a drawing tool brings its own line back', async function () {
    try {
      await anvil.newPart(); await idle();
      await UI.newSketchOnPlane('Front'); await idle();
      UI.setTool('select'); await idle();
      var h = $('sketch-hint'), gl = UI.viewport.querySelector('canvas.gl'), r = UI.viewport.getBoundingClientRect();
      assert(h.offsetParent && /Click an entity/.test(h.textContent), 'the Select help line is shown: ' + h.textContent);
      gl.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width * 0.8, clientY: r.top + r.height * 0.8 }));
      W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, button: 0, clientX: r.left + r.width * 0.8, clientY: r.top + r.height * 0.8 }));
      await idle();
      assert(!h.offsetParent, 'a press on empty space hides it');
      UI.setTool('line'); await idle();
      assert(h.offsetParent && /start point/.test(h.textContent), 'the Line tool shows its line: ' + h.textContent);
      return 'ok';
    } finally { UI.setTool('select'); if (UI.exitSketch) UI.exitSketch(true); await idle(); }
  });
})();
