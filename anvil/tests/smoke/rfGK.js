  // --- rfGK: Sheet Metal ▸ Cross-Break with real mouse events: the ribbon button is live, a click on the sheet's top face
  // takes it, ✓ adds Cross-Break1 with a tree icon, one undo step, the volume and the blank unchanged, the X drawn on the
  // model and on the flat; Edit Feature reopens with the face; Edit Cross-Break Sketch opens a sketch with the two lines
  // and exiting it comes back to the PropertyManager with the sketch held. ---
  function rfGKMarks() { return (UI.crossBreakGroup && UI.crossBreakGroup.children || []).reduce(function (n, o) { return n + o.geometry.getAttribute('position').count / 2; }, 0); }
  step('rfGK: Cross-Break: ribbon button, face click, ✓, one undo step, volume and blank unchanged, the X on the model and the flat, Edit Feature, Edit Cross-Break Sketch', async function () {
    var errs0 = errors.length, T = 0.0598;
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();'); await idle();
    UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
    var v0 = K.massProps(UI.App.mesh, UI.App.model.density).volume, n0 = UI.App.model.features.length;
    var size0 = K.flatPattern(UI.App.model, UI.App.build, UI.App.mesh).size.slice();
    UI.setRibbonTab('Sheet Metal'); await wait(20);
    var btn = Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return /Cross-Break/.test((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent); })[0];
    assert(btn && !btn.disabled && !btn.classList.contains('disabled'), 'Cross-Break is live on the Sheet Metal ribbon');
    btn.click(); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Cross-Break', 'Cross-Break PM: ' + (UI.hasPM() && UI.pmTitle()));
    selClick(UI.worldToScreen([2, T, 1.5])); await idle(); await wait(20);
    var v = UI.pmSpec().values;
    assert(v.face && Math.abs(v.face[1] - T) < 1e-6, 'the face click is held: ' + JSON.stringify(v.face));
    assert(UI.groups.preview.children.length === 1, 'the X previews');
    await UI.pmOK(); await idle();
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(UI.App.model.features.length === n0 + 1 && f.type === 'crossBreak' && f.name === 'Cross-Break1', 'feature ' + JSON.stringify(f));
    assert(!Object.keys(UI.App.build.errors || {}).length, 'build errors ' + JSON.stringify(UI.App.build.errors));
    near(K.massProps(UI.App.mesh, UI.App.model.density).volume, v0, 1e-12, 'volume unchanged');
    var flat = K.flatPattern(UI.App.model, UI.App.build, UI.App.mesh);
    near(flat.size[0], size0[0], 1e-12, 'blank X'); near(flat.size[1], size0[1], 1e-12, 'blank Y');
    assert(rfGKMarks() === 2, 'two lines on the model: ' + rfGKMarks());
    assert(/BEND/.test(K.exportDXFFlat(flat, 'in')) && /CROSS BREAK UP 1/.test(K.exportDXFFlat(flat, 'in')), 'the note in the DXF');
    var row = Array.prototype.filter.call(D.querySelectorAll('#tree *'), function (e) { return e.children.length && /Cross-Break1/.test(e.textContent) && e.querySelector('svg'); }).pop();
    assert(row, 'tree row with an icon');
    // Flatten: the marks follow the flat, and come back on the model
    UI.toggleFlatten(true); await idle(); await wait(20);
    assert(rfGKMarks() === 2, 'two lines on the flat: ' + rfGKMarks());
    UI.toggleFlatten(false); await idle(); await wait(20);
    assert(rfGKMarks() === 2, 'back on the model');
    // Edit Feature
    UI.editFeature(f); await idle(); await wait(30);
    assert(UI.hasPM() && UI.pmSpec().values.face, 'Edit Feature reopens with the face');
    // Edit Cross-Break Sketch: a sketch with the two lines, and back
    var sb = Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (b) { return /Edit Cross-Break Sketch/.test(b.textContent); })[0];
    assert(sb, 'Edit Cross-Break Sketch button');
    sb.click(); await idle(); await wait(40);
    assert(UI.App.mode === 'sketch', 'sketch mode: ' + UI.App.mode);
    var sk = UI.activeSketchFeature();
    assert(sk.entities.length === 2 && sk.entities[0].t === 'line', 'the two lines in the sketch ' + JSON.stringify(sk.entities));
    var keep = sk.entities[1];
    sk.entities = [{ t: 'line', x1: keep.x1, y1: keep.y1, x2: keep.x2, y2: keep.y2 }];
    await UI.exitSketch(true); await idle(); await wait(40);
    assert(UI.hasPM() && UI.pmSpec().values.sketch === sk.id, 'back in the PM with the sketch: ' + (UI.hasPM() && JSON.stringify(UI.pmSpec().values)));
    await UI.pmOK(); await idle();
    var fNow = UI.App.model.features.filter(function (g) { return g.type === 'crossBreak'; })[0];
    assert(fNow.sketch === sk.id, 'the feature reads the sketch');
    assert(UI.App.model.features.indexOf(sk) < UI.App.model.features.indexOf(fNow), 'the sketch comes first');
    assert(!Object.keys(UI.App.build.errors || {}).length, 'no errors after the edit ' + JSON.stringify(UI.App.build.errors));
    assert(rfGKMarks() === 1, 'one line now: ' + rfGKMarks());
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'Cross-Break1, ' + rfGKMarks() + ' line';
  });
