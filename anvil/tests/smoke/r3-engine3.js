  // --- r3/engine3 ---
  async function engUntil(fn, ms) { var t0 = performance.now(); while (!fn() && performance.now() - t0 < (ms || 3000)) await wait(15); return fn(); }
  step('Instant3D light drag: dragging a depth arrow 10 → 30 previews the extrude from the worker without rebuilding the part on every ruler step; the release rebuilds once (24000) and clears the preview', async function () {
    var was = anvil.workerOn();
    anvil.workerOn(true);
    var builds = 0, hook = function (b, o) { if (!(o && o.occt)) builds++; };   // OpenCascade's swap of the same model does not count
    try {
      await anvil.newPart(); await idle();
      await anvil.run(BLOCK); await idle();
      UI.setView('Front');
      var top = anvil.faces().filter(function (f) { return f.normal[1] > 0.999; })[0];
      UI.setSelection([{ kind: 'face', index: top.index }]);
      var h = anvil.instant3D().handles.filter(function (x) { return x.kind === 'depth'; })[0];
      assert(h && h.value === 10, 'depth handle');
      var from = h.grab, to = UI.instant3DRulerPoint(UI.instant3DHandles().filter(function (x) { return x.kind === 'depth'; })[0], 30);   // r5/select5: the ruler's 30 tick
      UI.onBuild.push(hook);
      selEv('mousedown', from, D.querySelector('#i3d-layer .i3d-handle[data-kind="depth"]'));
      for (var k = 1; k <= 6; k++) { selEv('mousemove', [from[0] + (to[0] - from[0]) * k / 6, from[1] + (to[1] - from[1]) * k / 6]); await wait(15); }
      var shown = await engUntil(function () { return UI.groups.preview.children.length > 0; });
      var during = builds;
      selEv('mouseup', to);
      await idle(); await wait(20); await idle();
      assert(shown, 'the dragged extrude is previewed');
      assert(during === 0, 'the part was rebuilt ' + during + ' times during the drag');
      assert(anvil.model().features[1].depth === 30, 'depth 30: ' + anvil.model().features[1].depth);
      near(anvil.mass().volume, 24000, 1e-6, 'volume after the release');
      assert(await engUntil(function () { return UI.groups.preview.children.length === 0; }), 'preview cleared after the release');
      return builds + ' rebuild(s), all after the release';
    } finally {
      var i = UI.onBuild.indexOf(hook); if (i >= 0) UI.onBuild.splice(i, 1);
      anvil.workerOn(was);
    }
  });
  step('Hole Wizard preview comes from the worker: picking a face shows the hole preview without building it on the main thread', async function () {
    var was = anvil.workerOn();
    anvil.workerOn(true);
    var calls = 0, bt = K.buildTool;
    try {
      await anvil.newPart(); await idle();
      await anvil.run('p.box(60, 60, 30, { centered: true });'); await idle();
      var idx = anvil.faces().filter(function (f) { return f.normal[1] > 0.999; })[0].index;
      K.buildTool = function () { calls++; return bt.apply(this, arguments); };
      UI.cmdHoleWizard();
      assert(UI.App.command.onPick({ kind: 'face', index: idx, point: [-15, 30, 0] }) !== false, 'pick rejected');
      var shown = await engUntil(function () { return UI.groups.preview.children.length > 0; });
      assert(shown, 'hole preview shown');
      assert(calls === 0, 'buildTool ran on the main thread ' + calls + ' times');
      UI.pmCancel();
      assert(UI.groups.preview.children.length === 0, 'preview gone with the PropertyManager');
    } finally { K.buildTool = bt; anvil.workerOn(was); if (UI.hasPM()) UI.pmCancel(); }
  });
  // --- end r3/engine3 ---
