  // --- rfCB (2026-10-14, head): the user's look requests — end-point dots green 10 px beads on the white wireframe, and
  // the quick-access Undo / Redo white when there is something to undo / redo (on a dark chip in the light theme). ---
  step('rfCB: quick-access Undo is white with something to undo and faded grey without; Redo the same after an undo; light theme puts the white arrow on a dark chip', async function () {
    await anvil.newPart(); await idle();
    var u = D.getElementById('std-undo'), r = D.getElementById('std-redo');
    var stroke = function (b) { return W.getComputedStyle(b.querySelector('.ico path')).stroke; };
    UI.syncStdToolbar();
    assert(u.disabled && stroke(u) !== 'rgb(255, 255, 255)', 'nothing to undo: not white (' + stroke(u) + ')');
    await anvil.run('p.units("in");\np.sketch("Front", 0, "S1").rect(0, 0, 2, 1).extrude(0.25);'); await idle();
    UI.pushUndo(); UI.App.model.features[0].name = 'S1b'; UI.syncStdToolbar();
    assert(!u.disabled && stroke(u) === 'rgb(255, 255, 255)', 'something to undo: white (' + stroke(u) + ')');
    var light = D.documentElement.getAttribute('data-theme') !== 'dark';
    if (light) assert(W.getComputedStyle(u).backgroundColor === 'rgb(58, 58, 58)', 'light theme: dark chip ' + W.getComputedStyle(u).backgroundColor);
    await UI.undo(); await idle(); UI.syncStdToolbar();
    assert(!r.disabled && stroke(r) === 'rgb(255, 255, 255)', 'something to redo: white (' + stroke(r) + ')');
    return 'undo / redo white when available';
  });
