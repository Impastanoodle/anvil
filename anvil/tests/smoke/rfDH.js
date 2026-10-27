  // --- rfDH (2026-10-27, user: Mastercam's blue ✓+ "wherever applicable") --- a command that makes something (Fillet
  // here; the list is OKPLUS_COMMANDS in ui-commands.js) shows the blue OK-and-start-another button first, before ✓ and
  // ✗; it accepts and opens the same command again, empty; a refused ✓ stays; editing a feature has no ✓+.
  step('rfDH: Fillet shows ✓+ before ✓ and ✗; ✓+ makes the fillet and opens Fillet again for the next one; with nothing picked it stays; Edit Feature has no ✓+', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Top").rect(-20, -10, 40, 20).extrude(10);'); await idle();
    var sharp = UI.App.edges.filter(function (e) { return !e.smooth && e.faces.length === 2; });
    var n0 = UI.App.model.features.length;
    try {
      UI.App.sel = { kind: 'edge', edge: sharp[0] };
      UI.cmdFillet(); await UI.previewIdle();
      var btns = Array.prototype.map.call(D.querySelectorAll('#pm .pm-actions button'), function (b) { return b.className; });
      assert(/pm-okplus/.test(btns[0]) && /pm-ok\b/.test(btns[1]) && /pm-cancel/.test(btns[2]), 'order ✓+ ✓ ✗: ' + btns.join(' | '));
      D.querySelector('#pm .pm-okplus').click();
      await idle(); await UI.previewIdle(); await idle();
      var fs = UI.App.model.features;
      assert(fs.length === n0 + 1 && fs[fs.length - 1].type === 'fillet', 'one fillet made: ' + fs.map(function (f) { return f.type; }).join(','));
      assert(UI.hasPM() && /Fillet/.test(D.querySelector('#pm .pm-head').textContent) && D.querySelector('#pm .pm-okplus'), 'Fillet open again with ✓+');
      assert(!D.querySelectorAll('#pm .pm-list .pm-item').length, 'the new Fillet starts empty');
      D.querySelector('#pm .pm-okplus').click(); await idle();
      assert(UI.hasPM() && UI.App.model.features.length === n0 + 1, 'nothing picked: ✓+ refused, Fillet stays open');
      UI.pmCancel(); await idle();
      UI.editFeature(fs[fs.length - 1]); await UI.previewIdle();
      assert(UI.hasPM() && !D.querySelector('#pm .pm-okplus'), 'Edit Feature: no ✓+');
      UI.pmCancel(); await idle();
      assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
      return btns.length + ' buttons, ' + UI.App.model.features.length + ' features';
    } finally { if (UI.hasPM()) UI.pmCancel(); }
  });
