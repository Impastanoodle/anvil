  // --- rfFF (2026-10-29, lane FF): Fillet on a cylinder rim with real mouse / key events. A Ø2 × 1 in cylinder; the
  // Fillet command, the top rim clicked in the graphics area (one click takes the whole circle), Radius .125, Enter
  // Enter: the round is one torus face (exact volume by Pappus), Fillet1 in the tree, one undo step. ---
  function rfFFEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  function rfFFClick(p) { rfFFEv('mousemove', p); rfFFEv('mousedown', p, $('viewport')); rfFFEv('mouseup', p); }

  step('rfFF: Fillet — the top rim of a Ø2 × 1 in cylinder clicked in the graphics area, Radius .125, Enter Enter: one torus face, exact volume, Fillet1 in the tree, one undo step', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sketch("Top").circle(0, 0, 1).end().extrude(1);'); await idle();
    UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
    var n0 = UI.App.model.features.length, v0 = K.massProps(UI.App.mesh, 1).volume;
    near(v0, Math.PI, 1e-9, 'cylinder');
    UI.cmdFillet(); await UI.previewIdle();
    assert(UI.hasPM(), 'Fillet PM');
    // the rim at 45° towards the isometric eye
    rfFFClick(UI.worldToScreen([Math.SQRT1_2, 1, Math.SQRT1_2])); await UI.previewIdle(); await wait(30);
    var vals = UI.pmSpec().values;
    assert(vals.edges && vals.edges.length === 1, 'one rim pick: ' + JSON.stringify(vals.edges));
    var rf = pmField('Radius');
    assert(rf, 'Radius box');
    rf.focus(); rf.select(); rf.value = '.125'; rf.dispatchEvent(new W.Event('input', { bubbles: true }));
    pressEnter(rf); await UI.previewIdle();
    pressEnter(pmField('Radius')); await idle(); await wait(30);
    assert(!UI.hasPM(), 'the second Enter is ✓');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'fillet' && f.name === 'Fillet1' && Math.abs(f.r - 0.125) < 1e-12, 'feature: ' + JSON.stringify(f));
    assert(!UI.App.build.errors[f.id], 'no error: ' + UI.App.build.errors[f.id]);
    var r = 0.125, d = r * (10 - 3 * Math.PI) / (3 * (4 - Math.PI));
    near(K.massProps(UI.App.mesh, 1).volume, Math.PI - 2 * Math.PI * (1 - d) * (1 - Math.PI / 4) * r * r, 1e-9, 'volume');
    var kinds = K.curveSurfaces(UI.App.mesh).map(function (s) { return s.surf.t; }).sort().join(',');
    assert(kinds === 'cyl,tor', 'surfaces: ' + kinds);
    assert(Array.prototype.some.call(D.querySelectorAll('#tree [data-fid]'), function (row) { return /Fillet1/.test(row.textContent); }), 'Fillet1 in the tree');
    UI.undo(); await idle();
    assert(UI.App.model.features.length === n0, 'one undo step removes the fillet');
  });
