  // --- rfFN (2026-10-29, lane FN: feature stacks fail cleanly) --- in the app (background rebuild): a cut whose sketch
  // crosses itself fails, the pattern of it names its failed parent, both rows carry the error mark, and the part keeps
  // the block with the hole made after them (a failed feature never blanks the part).
  step('rfFN: a failed cut and its pattern are flagged in the FeatureManager; the part before them and the hole after them stay', async function () {
    await anvil.newPart(); await idle();
    var thrown = '';
    await anvil.run('p.units("mm");\np.box(40, 30, 20);\np.sketch("Top", 20).polyline([[5, -5], [15, -15], [15, -5], [5, -15]]).end().cut(5, { reverse: true });\n' +
      'p.linearPattern({ dir: "x", spacing: 20, count: 2 });\np.sketch("Top", 20).circle(30, -20, 2).end().cut("through", { reverse: true });')
      .catch(function (e) { thrown = String(e && e.message || e); });   // anvil.run rejects with the feature errors
    assert(/LPattern1: The parent feature/.test(thrown), 'anvil.run reports the errors: ' + thrown);
    await idle(); await wait(20); await idle();
    var F = UI.App.model.features, errs = UI.App.build.errors || {};
    function feat(name) { return F.filter(function (f) { return f.name === name; })[0]; }
    var cut = feat('Cut-Extrude1'), pat = feat('LPattern1');
    assert(/crosses itself/.test(errs[cut.id] || ''), 'cut error: ' + JSON.stringify(errs));
    assert(/parent feature Cut-Extrude1 failed/.test(errs[pat.id] || ''), 'pattern error: ' + JSON.stringify(errs));
    assert(Object.keys(errs).length === 2, 'two errors: ' + JSON.stringify(errs));
    UI.setFmTab('tree'); UI.refreshTree();
    [cut, pat].forEach(function (f) { assert(D.querySelector('#tree .ti[data-fid="' + f.id + '"]'), 'tree row ' + f.name); });
    var v = K.massProps(UI.App.mesh).volume, want = 24000 - 20 * 4 * Math.PI;
    assert(Math.abs(v - want) <= 1e-6 * want, 'volume ' + v + ', expected ' + want);
  });
