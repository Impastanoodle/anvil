  // --- rfCP (2026-10-19, lane CP): Sheet Metal ▸ Break-Corner with real mouse events — the ribbon button opens the
  // PropertyManager, two clicks on corner edges (the short edges through the thickness) in the Isometric view, Fillet,
  // .25 typed + Enter (commits, PM stays) + Enter (✓); the volume and the flat's two R.25 arcs; one undo step; Edit
  // Feature reopens with the picks and Esc ends it unchanged; a click on a long edge is refused, a face click takes
  // the face's corners. Uses selClick (selection.js), r3sType (r3-sketch3), pmField / pressEnter / statusText. ---
  function cpVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }   // exact (anvil.summary() rounds)
  step('rfCP: Break-Corner — ribbon button, two corner-edge clicks, Fillet, .25 Enter Enter: volume (12 − 2·(1 − π/4)·.0625)·T, two R.25 arcs in the flat, one undo step, Edit Feature reopens with the picks, Esc ends it; long-edge click refused, face click takes its corners', async function () {
    var errs0 = errors.length, T = 0.0598;
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();'); await idle();
    UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
    var v0 = cpVol(), n0 = UI.App.model.features.length;
    near(v0, 12 * T, 1e-9, 'plate volume');
    UI.setRibbonTab('Sheet Metal'); await wait(20);
    var btn = Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return /Break-Corner/.test((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent); })[0];
    assert(btn && !btn.disabled && !btn.classList.contains('disabled'), 'Break-Corner on the Sheet Metal ribbon');
    btn.click(); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Break Corner', 'Break Corner PM: ' + (UI.hasPM() && UI.pmTitle()));
    // the corner edges the camera sees whole: a click on the middle of each must hit that edge
    var corners = UI.App.edges.filter(function (e) { return e.len < 1.5 * T && e.faces.length === 2; });
    assert(corners.length === 4, 'four corner edges: ' + corners.length);
    var clickable = corners.filter(function (e) { var s = UI.worldToScreen(e.mid), pk = UI.pickEdge(s[0], s[1]); return pk && pk.edge === e; });
    assert(clickable.length >= 2, 'at least two corner edges are clickable in the Isometric view: ' + clickable.length);
    var two = clickable.slice(0, 2);
    // a click on a long sheet edge is refused with a hint, and nothing is picked
    var longE = UI.App.edges.filter(function (e) { return e.len > 2; }).filter(function (e) { var s = UI.worldToScreen(e.mid), pk = UI.pickEdge(s[0], s[1]); return pk && pk.edge === e; })[0];
    assert(longE, 'a clickable long edge');
    selClick(UI.worldToScreen(longE.mid)); await idle(); await wait(20);
    assert(UI.pmSpec().values.corners.length === 0 && /not a corner edge/.test(statusText()), 'long edge refused: ' + statusText());
    for (var i = 0; i < 2; i++) { selClick(UI.worldToScreen(two[i].mid)); await idle(); await wait(20); }
    var vals = UI.pmSpec().values;
    assert(vals.corners.length === 2 && vals.faces.length === 0, 'two corners picked: ' + JSON.stringify(vals.corners));
    assert(D.querySelectorAll('#pm .pm-list .pm-item').length === 2, 'two rows in the selection list');
    // Fillet, then .25 typed: the first Enter commits the entry, the second is ✓
    var fb = D.querySelector('#pm button[data-key="kind:fillet"]');
    assert(fb, 'Fillet break type button'); fb.click(); await wait(20);
    var rad = pmField('Radius');
    assert(rad && !pmField('Distance'), 'Radius box (Distance hidden) for a fillet');
    rad.focus(); rad.select(); r3sType(rad, '.25');
    var ev = pressEnter(rad);
    assert(ev.defaultPrevented && UI.hasPM() && UI.pmSpec().values.size === 0.25, 'the first Enter applied .25 and kept the PM');
    assert(/press Enter again to finish/.test(statusText()), 'status: ' + statusText());
    pressEnter(pmField('Radius')); await idle(); await wait(30);
    assert(!UI.hasPM(), 'the second Enter is ✓');
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'breakCorner' && f.kind === 'fillet' && f.size === 0.25 && f.corners.length === 2 && f.name === 'Break-Corner1' && !f.faces, 'feature: ' + JSON.stringify(f));
    assert(!UI.App.build.errors[f.id], 'no error: ' + UI.App.build.errors[f.id]);
    var want = (12 - 2 * (1 - Math.PI / 4) * 0.0625) * T;
    near(cpVol(), want, 1e-9, 'volume after two R.25 fillets');
    var flat = anvil.flat(), cv = K.dxfLoopCurves(flat.loops[0]);
    var arcs = cv.segs.filter(function (s) { return s.t === 'arc'; });
    assert(arcs.length === 2 && arcs.every(function (a) { return Math.abs(a.r - 0.25) < 1e-9; }), 'two R.25 arcs in the flat: ' + JSON.stringify(arcs.map(function (a) { return a.r; })));
    near(flat.size[0], 4, 1e-9, 'flat width'); near(flat.size[1], 3, 1e-9, 'flat height');
    // the tree row
    assert(Array.prototype.some.call(D.querySelectorAll('#tree .ti'), function (r) { return /Break-Corner1/.test(r.textContent); }), 'Break-Corner1 in the FeatureManager tree');
    // one undo step takes it all away, redo puts it back
    UI.undo(); await idle();
    assert(UI.App.model.features.length === n0, 'one undo step removes the feature');
    near(cpVol(), v0, 1e-9, 'volume after undo');
    UI.redo(); await idle();
    assert(UI.App.model.features.length === n0 + 1, 'redo');
    // Edit Feature: the PM reopens on the picks; Esc ends it with nothing changed
    f = UI.App.model.features[UI.App.model.features.length - 1];
    UI.editFeature(f); await wait(30); await idle();
    assert(UI.hasPM() && UI.pmTitle() === 'Break-Corner1', 'editing PM: ' + (UI.hasPM() && UI.pmTitle()));
    vals = UI.pmSpec().values;
    assert(vals.corners.length === 2 && vals.kind === 'fillet' && vals.size === 0.25, 'the picks and values are back: ' + JSON.stringify({ c: vals.corners.length, k: vals.kind, s: vals.size }));
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await idle(); await wait(20);
    assert(!UI.hasPM(), 'Esc ends the command');
    near(cpVol(), want, 1e-9, 'unchanged after Esc');
    // a second Break-Corner: a click on the top face takes its corners still sharp (the other two)
    UI.cmdBreakCorner(); await wait(30);
    var top = UI.App.mesh.faces.map(function (fc, k) { return { fc: fc, k: k }; }).filter(function (o) { return o.fc.normal[1] > 0.999 && o.fc.area > 1; })[0];
    assert(top, 'top face');
    var tp = UI.worldToScreen([2, T, 1.5]);
    var pk = UI.pickFace(tp[0], tp[1]);
    assert(pk && pk.kind === 'face', 'the top face is under (2, T, 1.5)');
    selClick(tp); await idle(); await wait(20);
    vals = UI.pmSpec().values;
    assert(vals.faces.length === 1 && vals.corners.length === 0, 'a face pick: ' + JSON.stringify(vals.faces));
    assert(vals.kind === 'fillet' && vals.size === 0.25, 'the break type and size are remembered');
    D.querySelector('#pm button[data-key="kind:chamfer"]').click(); await wait(20);
    await UI.pmOK(); await idle();
    near(cpVol(), want - 2 * 0.03125 * T, 1e-9, 'the face\'s two sharp corners chamfered .25');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'volume ' + cpVol().toFixed(6);
  });
