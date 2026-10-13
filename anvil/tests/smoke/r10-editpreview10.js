  // --- r10/editpreview10 ---
  function rbVolume() { return UI.App.mesh && UI.App.mesh.triCount ? K.massProps(UI.App.mesh).volume : 0; }
  function prefixVolume(n) { var m = JSON.parse(JSON.stringify(UI.App.model)); m.features = m.features.slice(0, n); var b = K.rebuild(m).body; return b ? K.massProps(K.meshFromBody(b)).volume : 0; }
  async function rolledBackTo(n) { var t0 = performance.now(); while (UI.App.rollback !== n && performance.now() - t0 < 10000) await wait(10); await UI.previewIdle(); }
  step('r10/editpreview10: Edit Feature rolls the part back to just before the feature (later features, sketches and planes hidden), previews the feature on it, and ✗ rolls forward to the same part without a rebuild', async function () {
    if (!anvil.workerOn()) return 'skipped: worker off';
    var was = anvil.occt().on;
    anvil.occt(false, { remember: false });
    try {
      await anvil.run(exByName('Funnel').code); await idle();
      var f = UI.App.model.features.filter(function (x) { return x.name === 'Spout'; })[0], idx = UI.App.model.features.indexOf(f);
      var build0 = UI.App.build, mesh0 = UI.App.mesh, vol0 = rbVolume();
      UI.App.view.showSketches = true; UI.updateSketches();
      var later = UI.App.model.features.filter(function (x, i) { return i > idx && x.type === 'sketch'; }).length;
      UI.editFeature(f);
      assert(UI.hasPM(), 'edit PM not open');
      await rolledBackTo(idx);
      assert(UI.App.rollback === idx, 'rolled back to ' + UI.App.rollback + ', want ' + idx);
      near(rbVolume(), prefixVolume(idx), 1e-3, 'shown part = the features before Spout');
      assert(UI.App.build !== build0 && Object.keys(UI.App.build.errors || {}).length === 0, 'rolled-back build');
      assert(UI.groups.preview.children.length === 1, 'Spout previewed on it: ' + UI.groups.preview.children.length);
      var shown = UI.groups.sketches.children.filter(function (o) { var fi = o.userData && o.userData.sketch != null ? UI.App.model.features.indexOf(K.findFeature(UI.App.model, o.userData.sketch)) : -1; return fi > idx; }).length;
      assert(shown === 0, shown + ' lines of sketches after the rollback point are shown (' + later + ' later sketches)');
      UI.pmCancel();
      assert(UI.App.rollback === null, 'rolled forward');
      assert(UI.App.build === build0 && UI.App.mesh === mesh0, 'the whole part is back as it was (no rebuild)');
      near(rbVolume(), vol0, 1e-9, 'volume after ✗');
      assert(UI.groups.preview.children.length === 0, 'preview cleared');
      await wait(50);
      assert(UI.App.rollback === null && UI.App.mesh === mesh0, 'no late rollback after ✗');
      return 'rolled back to ' + idx + ' features (' + prefixVolume(idx).toFixed(0) + ' mm³ of ' + vol0.toFixed(0) + ')';
    } finally { UI.App.view.showSketches = false; UI.updateSketches(); anvil.occt(was, { remember: false }); }
  });
  step('r10/editpreview10: ✓ keeps the rolled-back part and preview until the rebuilt part is applied, then shows the whole edited part', async function () {
    if (!anvil.workerOn()) return 'skipped: worker off';
    await anvil.run(exByName('Rounded handle').code); await idle();
    var f = UI.App.model.features.filter(function (x) { return x.type === 'fillet'; })[0], idx = UI.App.model.features.indexOf(f);
    var n = UI.App.model.features.length, vol0 = anvil.summary().volume;
    UI.editFeature(f);
    await rolledBackTo(idx);
    assert(UI.App.rollback === idx, 'rolled back: ' + UI.App.rollback);
    // the fillet's edge is resolved on the shown (unfilleted) part
    assert(UI.App.command.edgeList.length > 0, 'edge list on the rolled-back part: ' + UI.App.command.edgeList.length);
    setInput(D.querySelector('#pm input[data-key="r"]'), String(+f.r + 1));
    await UI.previewIdle();
    var p = UI.pmOK(), keptRb = UI.App.rollback, kept = UI.groups.preview.children.length;
    await p; await idle();
    assert(keptRb === idx || UI.App.rollback === null, 'rollback kept until the build: ' + keptRb);
    assert(kept >= 1 || keptRb === null, 'preview kept until the build: ' + kept);
    assert(UI.App.rollback === null, 'rolled forward after ✓');
    assert(UI.App.model.features.length === n, 'feature count');
    var s = anvil.summary();
    assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
    assert(Math.abs(s.volume - vol0) > 1e-3, 'volume changed by the larger fillet: ' + vol0 + ' → ' + s.volume);
    near(rbVolume(), s.volume, 1e-3, 'the whole part is shown');
    return 'fillet R' + f.r + ': ' + vol0.toFixed(1) + ' → ' + s.volume.toFixed(1) + ' mm³';
  });
  step('r10/editpreview10: editing a Shell shows its removed faces on the rolled-back part; an OpenCascade solid that arrives meanwhile waits for the roll forward', async function () {
    if (!anvil.workerOn()) return 'skipped: worker off';
    var was = anvil.occt().on;
    anvil.occt(false, { remember: false });
    try {
      await anvil.run(exByName('Funnel').code); await idle();
      var f = UI.App.model.features.filter(function (x) { return x.type === 'shell'; })[0], idx = UI.App.model.features.indexOf(f);
      UI.editFeature(f);
      await rolledBackTo(idx);
      assert(UI.App.command.faceList.length >= f.faces.length, 'removed faces highlighted: ' + JSON.stringify(UI.App.command.faceList));
      var rbBuild = UI.App.build, fake = K.rebuild(JSON.parse(JSON.stringify(UI.App.model)));
      UI.applyBuild(fake, { occt: true, noSave: true });
      assert(UI.App.build === rbBuild && UI.App.rollback === idx, 'the rolled-back part stays on screen');
      UI.pmCancel();
      assert(UI.App.rollback === null && UI.App.build === fake, 'the waiting solid is applied on ✗');
      await UI.rebuild({ noSave: true }); await idle();
      return UI.App.command ? 'command left open' : 'faces ' + f.faces.length;
    } finally { anvil.occt(was, { remember: false }); }
  });
  step('r10/editpreview10: double-clicking another feature while editing cancels the first edit and rolls back to the second; Plane edits roll back too', async function () {
    if (!anvil.workerOn()) return 'skipped: worker off';
    await anvil.run('p.box(40, 30, 10);\np.plane("Top", 20);\np.sketch("Top", 10).rect(5, 5, 10, 10);\np.extrude(5);'); await idle();
    var fs = UI.App.model.features, pl = fs.filter(function (x) { return x.type === 'plane'; })[0], ex = fs[fs.length - 1];
    var pi = fs.indexOf(pl), ei = fs.indexOf(ex);
    UI.editFeature(ex);
    await rolledBackTo(ei);
    UI.editFeature(pl);
    assert(UI.hasPM(), 'plane PM');
    await rolledBackTo(pi);
    assert(UI.App.rollback === pi, 'rolled back to the plane: ' + UI.App.rollback);
    UI.pmCancel();
    assert(UI.App.rollback === null, 'rolled forward');
    near(rbVolume(), anvil.summary().volume, 1e-3, 'whole part shown');
    return 'extrude at ' + ei + ', plane at ' + pi;
  });
  step('r10/editpreview10: Edit Sketch rolls the part back to just before the sketch (later features greyed in the FeatureManager); exiting the sketch shows the whole part again', async function () {
    if (!anvil.workerOn()) return 'skipped: worker off';
    var was = anvil.occt().on;
    anvil.occt(false, { remember: false });
    try {
      await anvil.run(exByName('Funnel').code); await idle();
      var sk = UI.App.model.features.filter(function (x) { return x.name === 'Sketch3'; })[0], idx = UI.App.model.features.indexOf(sk);
      var vol0 = anvil.summary().volume;
      UI.editFeature(sk);
      assert(UI.App.mode === 'sketch' && UI.App.activeSketch === sk.id, 'editing Sketch3');
      await rolledBackTo(idx);
      assert(UI.App.rollback === idx, 'rolled back to ' + UI.App.rollback);
      near(rbVolume(), prefixVolume(idx), 1e-3, 'shown part = the features before Sketch3');
      var rolled = Array.prototype.map.call(D.querySelectorAll('#tree .ti.rolled .nm'), function (n) { return n.textContent; });
      assert(rolled.indexOf('Spout') >= 0 && rolled.indexOf('Shell1') >= 0 && rolled.indexOf('Cone') < 0, 'greyed rows: ' + rolled.join(', '));
      // a build applied while the rolled-back sketch is edited waits (no jump to the whole part mid-edit)
      var rbBuild = UI.App.build;
      UI.applyBuild(K.rebuild(JSON.parse(JSON.stringify(UI.App.model))), { noSave: true });
      assert(UI.App.build === rbBuild && UI.App.rollback === idx, 'still rolled back');
      await UI.exitSketch(); await idle();
      assert(UI.App.rollback === null && UI.App.mode === 'part', 'rolled forward on exit');
      near(rbVolume(), vol0, 1e-3, 'whole part after exit');
      assert(!D.querySelector('#tree .ti.rolled'), 'no greyed rows after exit');
      return 'Sketch3 at ' + idx + ': ' + prefixVolume(idx).toFixed(0) + ' mm³ shown while editing';
    } finally { anvil.occt(was, { remember: false }); }
  });
  // --- end r10/editpreview10 ---
