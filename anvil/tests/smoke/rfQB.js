  // --- rfQB (2026-11-18, lane smflange): sheet-metal flanges in the app. An Edge-Flange on three edges has one length
  // arrow per edge; dragging one sets that edge's own length (Edge length box), ✓ builds it ---
  function rfQBframe() { return new Promise(function (res) { var done = false; W.requestAnimationFrame(function () { if (!done) { done = true; res(); } }); setTimeout(function () { if (!done) { done = true; res(); } }, 1500); }); }
  var rfQBrect = null;
  function rfQBev(type, p, o) {
    o = o || {};
    var r = rfQBrect || (rfQBrect = $('viewport').getBoundingClientRect());
    var init = { bubbles: true, cancelable: true, view: W, button: o.button || 0, buttons: type === 'mouseup' ? 0 : (o.buttons != null ? o.buttons : 1), detail: o.detail || 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) };
    var inside = p[0] >= 0 && p[1] >= 0 && p[0] <= r.width && p[1] <= r.height;
    (o.target || (type === 'mousedown' || type === 'click' || type === 'dblclick' || ((type === 'mousemove' || type === 'mouseup') && inside) ? $('viewport') : W)).dispatchEvent(new W.MouseEvent(type, init));
  }
  function rfQBfeat(type) { return UI.App.model.features.filter(function (f) { return f.type === type; })[0]; }
  async function rfQBsettle() { for (var i = 0; i < 40 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(25); await idle(); await rfQBframe(); await rfQBframe(); }
  var RFQB_SM = 'p.name("QB-SM").units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
    'p.flange(1, [[3, 0.06, 0], [6, 0.06, 2], [3, 0.06, 4]], { name: "Flange Q" });\n';

  step('rfQB: an Edge-Flange on three edges shows one length arrow per edge; dragging the x = 6 edge\'s arrow up sets that edge\'s own length live (Edge length box, the others stay at Length), ✓ builds the walls 1 / 1.5 / 1 tall and the feature keeps lengths { 1: 1.5 }', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(RFQB_SM); await idle();
    UI.setView('Isometric'); UI.zoomToFit(); await rfQBsettle();
    UI.editFeature(rfQBfeat('flange')); await idle(); if (UI.previewIdle) await UI.previewIdle(); await idle();
    var hs = UI.instant3DHandles().filter(function (h) { return h.kind === 'pm'; });
    var keys = hs.map(function (h) { return h.key; }).sort().join(',');
    assert(keys === 'len@0,len@1,len@2', 'one arrow per edge: ' + keys);
    var h = hs.filter(function (x) { return x.key === 'len@1'; })[0], tip = h.pos(h.value);
    near(tip[0], 6 + 0.06 + 0.06 / 2, 1e-6, 'the x = 6 arrow sits in its wall (Bend Outside: x = 6 + R + T/2)');
    // drag it up by about half an inch with the mouse
    var g = D.querySelectorAll('#i3d-layer .i3d-handle[data-kind="pm"]')[hs.indexOf(h)], s0 = h.grab;
    var s1 = UI.worldToScreen([tip[0], tip[1] + 0.5, tip[2]]), s2 = UI.worldToScreen(tip), d = [s1[0] - s2[0], s1[1] - s2[1]];
    assert(g, 'the arrow\'s element');
    rfQBrect = $('viewport').getBoundingClientRect();
    rfQBev('mousedown', s0, { target: g });
    for (var k = 1; k <= 5; k++) { rfQBev('mousemove', [s0[0] + d[0] * k / 5, s0[1] + d[1] * k / 5]); await rfQBframe(); }
    rfQBev('mouseup', [s0[0] + d[0], s0[1] + d[1]]); await idle();
    var v = UI.pmSpec().values;
    assert(v.lengths && Math.abs(v.lengths[1] - 1.5) < 0.03, 'edge 2\'s own length follows the drag to about 1.5: ' + JSON.stringify(v.lengths));
    assert(v.lenEdge === 1 && Math.abs(+pmField('Edge length').value - v.lengths[1]) < 1e-9, 'the Edge length box shows it: ' + (pmField('Edge length') && pmField('Edge length').value));
    assert(+v.length === 1 && v.lengths[0] == null && v.lengths[2] == null, 'Length and the other edges stay: ' + v.length + ' ' + JSON.stringify(v.lengths));
    setInput(pmField('Edge length'), 1.5); await wait(10); await idle();
    await pmAccept(); await wait(30); await idle();
    var fl = rfQBfeat('flange');
    assert(fl.lengths && fl.lengths[1] === 1.5 && Object.keys(fl.lengths).length === 1, 'feature lengths ' + JSON.stringify(fl.lengths));
    var bb = UI.App.build.body.getBounds();
    near(bb.max[1], 1.5 + 0.12, 1e-6, 'the x = 6 wall stands 1.5 past its bend');
    var inside = UI.App.build.body.pointTester();
    assert(inside([3, 1.1, -0.09]) && !inside([3, 1.14, -0.09]), 'the z = 0 wall is still 1 past its bend');
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return 'lengths ' + JSON.stringify(fl.lengths);
  });

  step('rfQB: Sheet-Metal PropertyManager: Thickness .075 typed, ✓: the Base Flange and the Edge-Flange are both .075 thick; then Use gauge table ▸ 14 ga, ✓: both are 0.0747 (the Base Flange followed the sheet)', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.name("QB-T").units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1, [[3, 0.06, 0]]);\n'); await idle();
    function thick(T, label) {
      var b = UI.App.build.body, inside = b.pointTester(), bb = b.getBounds(), R = +UI.App.model.sheet.bendRadius;
      assert(inside([3, T - 0.004, 2]) && !inside([3, T + 0.004, 2]), label + ': the Base Flange is ' + T + ' thick');
      near(bb.min[2], -(R + T), 1e-6, label + ': the Edge-Flange wall is ' + T + ' thick (outer face at z = -(R + T))');
    }
    UI.cmdSheetMetal(); await idle();
    setInput(pmField('Thickness'), 0.075); await wait(10);
    await pmAccept(); await wait(30); await idle();
    thick(0.075, 'typed .075');
    UI.cmdSheetMetal(); await idle();
    var ug = pmField('Use gauge table');
    if (!ug.checked) ug.click();
    await wait(10);
    setInput(pmField('Gauge'), '14'); await wait(10);
    near(+pmField('Thickness').value, 0.0747, 1e-12, '14 ga thickness');
    await pmAccept(); await wait(30); await idle();
    thick(0.0747, '14 ga');
    var base = UI.App.model.features.filter(function (f) { return f.sheetBase; })[0];
    near(+base.depth, 0.0747, 1e-12, 'the Base Flange feature stores the new T');
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return 'T ' + UI.App.model.sheet.thickness;
  });

  step('rfQB: an Edge-Flange with a sketched (trapezoid) profile: Measured from Inner Virtual Sharp updates the greyed Length to the profile\'s top + R (was: it kept top + R + T); Edit Flange Profile sets UI.sketchExitGuard (an open profile is refused with the reason, the whole one passes) and Exit Sketch clears it', async function () {
    var errs0 = errors.length, R = 0.06, T = 0.06, H = 1.5;
    var prof = [[0, 0], [6, 0], [5, H], [1, H]].map(function (p, i, a) { var q = a[(i + 1) % a.length]; return { t: 'line', x1: p[0], y1: p[1], x2: q[0], y2: q[1] }; });
    await anvil.newPart(); await idle();
    await anvil.run('p.name("QB-P").units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
      'p.flange(1.62, [[3, 0.06, 0]], { lengthRef: "outer", startPoint: [0, 0.06, 0], profile: ' + JSON.stringify({ entities: prof }) + ' });\n'); await idle();
    assert(!Object.keys(UI.App.build.errors).length, 'built: ' + JSON.stringify(UI.App.build.errors));
    UI.editFeature(rfQBfeat('flange')); await wait(30); await idle();
    near(+pmField('Length').value, H + R + T, 1e-6, 'Length from the outer virtual sharp');
    pmIconBtn('lengthRef', 'inner').click(); await wait(10); await idle();
    near(+pmField('Length').value, H + R, 1e-6, 'Length from the inner virtual sharp');
    clickPmButton('Edit Flange Profile'); await idle(); await wait(60);
    assert(UI.App.mode === 'sketch', 'the profile sketch opened');
    assert(typeof UI.sketchExitGuard === 'function', 'the exit guard is set');
    var sk = UI.activeSketchFeature();
    assert(UI.sketchExitGuard(sk) == null, 'the whole profile passes: ' + UI.sketchExitGuard(sk));
    var open = { id: sk.id, type: 'sketch', plane: sk.plane, entities: sk.entities.slice(0, -1), rels: [] };
    var why = UI.sketchExitGuard(open);
    assert(typeof why === 'string' && /Edit Flange Profile/.test(why), 'an open profile is refused: ' + why);
    D.querySelector('.cc-exit').click(); await idle(); await wait(60); await idle();
    assert(UI.App.mode !== 'sketch' && UI.hasPM(), 'back in the PM: ' + statusText());
    assert(typeof UI.sketchExitGuard !== 'function', 'the guard is cleared');
    near(+pmField('Length').value, H + R, 1e-6, 'Length still from the inner virtual sharp');
    UI.pmCancel(); await idle();
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return why.slice(0, 90);
  });
