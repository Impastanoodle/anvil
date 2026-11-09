  // --- rfKK (2026-11-09, lane mitrefid) --- an Edge Flange made through its PropertyManager on the top edge of a
  // trapezoid (71.6° corners at both ends), Material Inside then (Edit Feature) Material Outside: the free ends end
  // square with no overlap-strip sliver past the sheet's sides, the flat has 8 corners and the part = its blank × T
  // (tests/kernel/rfKK.js has the geometry); then the slanted edge added, the 71.6° corner mitred
  var RFKK_T = 0.0598;
  var RFKK_TZ = 'p.units("in");\np.sheet(' + RFKK_T + ', ' + RFKK_T + ', 0.5);\np.sketch("Top").polyline([[0, 0], [6, 0], [5, -3], [1, -3]], true).end().baseFlange();';
  function rfKKBlank(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? Math.abs(W.Kernel.signedArea(l)) : -Math.abs(W.Kernel.signedArea(l))); }, 0); }
  function rfKKVol() { return anvil.mass().volume; }
  step('rfKK: Edge-Flange PM on a trapezoid\'s top edge, Material Inside, then Edit Feature ▸ Material Outside: square free ends at the 71.6° corners, flat 8 corners, folded = blank × T; the slanted edge added mitres the corner', async function () {
    var errs0 = errors.length;
    if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
    await anvil.newPart(); await idle();
    await anvil.run(RFKK_TZ); await idle();
    assert(!Object.keys(anvil.summary().errors).length, 'part: ' + JSON.stringify(anvil.summary().errors));
    UI.cmdEdgeFlange(); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Edge-Flange', 'Edge-Flange PM');
    assert(UI.App.command.onPick({ kind: 'edge', edge: edgeNear([3, RFKK_T, 0]) }) !== false, 'top edge pick');
    setInput(pmField('Position'), 'inside'); await wait(10);
    setInput(pmField('Length'), 1); await wait(10);
    await pmAccept();
    var fs = UI.App.model.features, f = fs[fs.length - 1];
    assert(f.type === 'flange' && f.position === 'inside' && !UI.App.build.errors[f.id], 'flange: ' + JSON.stringify(f) + ' ' + UI.App.build.errors[f.id]);
    var flat = anvil.flat(), v = rfKKVol();
    assert(flat.loops.length === 1 && flat.loops[0].length === 8, 'flat: ' + flat.loops.length + ' loops, ' + flat.loops[0].length + ' corners');
    near(v, rfKKBlank(flat) * RFKK_T, 1e-9 * v, 'Material Inside: folded vs blank × T');
    var s = 2 * RFKK_T;
    assert(flat.loops[0].some(function (p) { return Math.hypot(p[0] - s / 3, p[1] + s) < 1e-6; }), 'step to the side at the bend line');
    UI.editFeature(f); await idle(); await wait(30);
    assert(UI.hasPM() && pmField('Position').value === 'inside', 'Edit Feature shows Material Inside');
    setInput(pmField('Position'), 'outside'); await wait(10);
    await pmAccept();
    f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.position === 'outside' && !UI.App.build.errors[f.id], 'Material Outside: ' + UI.App.build.errors[f.id]);
    flat = anvil.flat(); v = rfKKVol();
    assert(flat.loops.length === 1 && flat.loops[0].length === 8, 'Material Outside flat: ' + flat.loops[0].length + ' corners');
    near(v, rfKKBlank(flat) * RFKK_T, 1e-9 * v, 'Material Outside: folded vs blank × T');
    // the slanted edge added to the same feature: the 71.6° corner is mitred (rfJU), folded just under the blank
    UI.editFeature(f); await idle(); await wait(30);
    assert(UI.App.command.onPick({ kind: 'edge', edge: edgeNear([5.5, RFKK_T, 1.5]) }) !== false, 'slanted edge pick');
    await pmAccept();
    f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.edges.length === 2 && !UI.App.build.errors[f.id], 'two edges: ' + JSON.stringify(f.edges) + ' ' + UI.App.build.errors[f.id]);
    flat = anvil.flat(); v = rfKKVol();
    var ex = (v - rfKKBlank(flat) * RFKK_T) / v;
    assert(flat.loops.length === 1 && ex < 0 && ex > -1e-3, 'mitred corner: ' + flat.loops.length + ' loops, folded − blank ' + ex.toExponential(3));
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return 'flat ' + UI.flatSizeText(flat) + ', folded − blank ' + ex.toExponential(2);
  });
