  // --- r11/occtswap11 ---
  async function occtDriving(code) {
    anvil.occt(true, { remember: false });
    await anvil.run(code); await idle();
    var st = await Promise.race([anvil.occtIdle(), wait(30000).then(function () { return anvil.occt(); })]);
    if (st.state === 'failed') return false;
    for (var k = 0; k < 40 && !UI.App.build.occt; k++) { await wait(250); await anvil.occtIdle(); }
    await idle();
    assert(UI.App.build.occt, 'built by OpenCascade (' + JSON.stringify(anvil.occt()).slice(0, 120) + ')');
    return true;
  }
  step('r11/occtswap11: with OpenCascade driving, Edit Feature shows OpenCascade\'s exact rolled-back solid (from its rebuild cache) with the edges resolved on it; ✗ rolls forward to the same exact part (skipped without vendor/occt)', async function () {
    if (!anvil.workerOn()) return 'skipped: worker off';
    var was = anvil.occt().on;
    try {
      if (!await occtDriving(exByName('Rounded handle').code)) return 'skipped: OpenCascade not installed';
      var f = UI.App.model.features.filter(function (x) { return x.type === 'fillet'; })[0], idx = UI.App.model.features.indexOf(f);
      var build0 = UI.App.build, mesh0 = UI.App.mesh;
      UI.editFeature(f);
      await rolledBackTo(idx);
      for (var k = 0; k < 100 && !(UI.App.rollback === idx && UI.App.build.occt); k++) await wait(30);
      assert(UI.App.rollback === idx && UI.App.build.occt, 'OpenCascade\'s rolled-back solid shown: ' + JSON.stringify(UI.occt.rollback()));
      near(UI.App.build.occt.volume, prefixVolume(idx), 2e-3 * prefixVolume(idx), 'the features before the fillet');
      assert(UI.App.mesh.faces[0].polys[0].face != null, 'B-rep faces on the shown mesh');
      assert(UI.App.command.edgeList.length > 0, 'fillet edges resolved on it: ' + UI.App.command.edgeList.length);
      var ms = UI.occt.rollback().ms;
      UI.pmCancel();
      assert(UI.App.rollback === null && UI.App.build === build0 && UI.App.mesh === mesh0, 'the whole exact part is back as it was');
      await wait(50);
      assert(UI.App.build === build0, 'no late swap after ✗');
      return 'rolled back to ' + idx + ' features on OpenCascade in ' + (ms != null ? ms.toFixed(0) : '?') + ' ms';
    } finally { anvil.occt(was, { remember: false }); await idle(); }
  });
  step('r11/occtswap11: after an edit of a part OpenCascade drives, the view holds the exact solid with a Rebuilding cue until OpenCascade\'s new solid swaps in (no faceted frame); a newly opened part is never held (skipped without vendor/occt)', async function () {
    var was = anvil.occt().on, swap0 = UI.occt.swapMode ? UI.occt.swapMode() : null;
    if (swap0) UI.occt.swapMode('wait', { remember: false });   // r12/occtui12: the hold is the 'Wait for the exact solid' option now
    try {
      if (!await occtDriving(exByName('Spur gear (12 teeth)').code)) return 'skipped: OpenCascade not installed';
      await wait(200);   // not a burst of rebuilds
      UI.App.model.features.filter(function (x) { return x.type === 'cpattern'; })[0].n = 11;
      await UI.rebuild();
      var heldNow = UI.App.holdFrameUntil > performance.now(), info = UI.occt.rollback();
      assert(!UI.App.build.occt && heldNow, 'Anvil\'s build applied under a held frame: held ' + heldNow + ', estimate ' + info.estimate);
      assert(info.cue && D.querySelector('.occt-cue.on'), 'Rebuilding cue');
      await anvil.occtIdle(); await idle();
      assert(UI.App.build.occt && !(UI.App.holdFrameUntil > performance.now()), 'OpenCascade\'s solid swapped in and the hold released');
      assert(!UI.occt.rollback().cue && !D.querySelector('.occt-cue.on'), 'cue gone');
      await anvil.run(exByName('Mug').code);
      assert(!(UI.App.holdFrameUntil > performance.now()), 'another part opened: not held');
      await anvil.occtIdle(); await idle();
      return 'estimate ' + info.estimate.toFixed(0) + ' ms';
    } finally { if (swap0) UI.occt.swapMode(swap0, { remember: false }); anvil.occt(was, { remember: false }); await idle(); }
  });
  step('r11/occtswap11: a whole-part OpenCascade build that finishes while Edit Feature is rolled back is not checked against the rolled-back part (no "volume differs"); ✗ swaps it in (skipped without vendor/occt)', async function () {
    if (!anvil.workerOn()) return 'skipped: worker off';
    var was = anvil.occt().on;
    try {
      if (!await occtDriving(exByName('Tray').code)) return 'skipped: OpenCascade not installed';
      await wait(200);
      var fl = UI.App.model.features.filter(function (x) { return x.type === 'flange'; })[0];
      fl.length = 18;
      await UI.rebuild();
      var f = UI.App.model.features[UI.App.model.features.length - 1], idx = UI.App.model.features.length - 1;
      UI.editFeature(f);
      await rolledBackTo(idx);
      var states = [];
      for (var k = 0; k < 200 && (UI.occt.pending() || states.length === 0); k++) { states.push(anvil.occt().state); await wait(25); }
      states.push(anvil.occt().state);
      assert(states.indexOf('mismatch') < 0, 'states while rolled back: ' + states.filter(function (s, i) { return s !== states[i - 1]; }).join(' → '));
      UI.pmCancel();
      await wait(20); await anvil.occtIdle(); await idle();
      assert(UI.App.rollback === null && UI.App.build.occt && anvil.occt().state === 'ok', 'whole exact part after ✗: ' + anvil.occt().state);
      near(UI.App.build.occt.volume, anvil.occt().volume, 1e-9, 'the deferred solid');
      return 'states ' + states.filter(function (s, i) { return s !== states[i - 1]; }).join(' → ');
    } finally { if (UI.hasPM()) UI.pmCancel(); anvil.occt(was, { remember: false }); await idle(); }
  });
  // --- end r11/occtswap11 ---

