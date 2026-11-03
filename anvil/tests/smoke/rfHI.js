  // --- rfHI: Sheet Metal ▸ Forming Tool with real mouse events: the ribbon's Forming Tool flyout is live and opens the
  // PM, a click on the sheet's top face places the tool there (Position X / Y follow), the preview shows the form, ✓ adds
  // Dimple1 with its tree icon in one undo step and the exact volume change; Edit Feature reopens it, a tool switched in
  // the PM's Tool row takes that tool's dimensions; UI.cmdFormingTool('louver') opens preset; the flat shows the marks. ---
  function rfHIVol() { return K.massProps(UI.App.mesh, UI.App.model.density).volume; }
  step('rfHI: Forming Tool: ribbon flyout, face click, preview, ✓, undo, Edit Feature, tool switch, cmdFormingTool preset, Flatten marks', async function () {
    var errs0 = errors.length, T = 0.0598;
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();'); await idle();
    UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
    var v0 = rfHIVol(), n0 = UI.App.model.features.length;
    UI.setRibbonTab('Sheet Metal'); await wait(20);
    var btn = Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return (b.getAttribute('aria-label') || '') === 'Forming Tool'; })[0];
    assert(btn && !btn.disabled, 'Forming Tool is live on the Sheet Metal ribbon');
    try { localStorage.removeItem('anvil.fly.forming'); } catch (e) { }
    btn.click(); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Forming Tool', 'Forming Tool PM: ' + (UI.hasPM() && UI.pmTitle()));
    assert(D.querySelectorAll('#pm [data-key^="tool:"]').length === 5, 'five tools in the Tool row');
    selClick(UI.worldToScreen([2, T, 1.5])); await idle(); await wait(20);
    var v = UI.pmSpec().values;
    assert(v.face && Math.abs(v.face[1] - T) < 1e-6, 'the face click is held: ' + JSON.stringify(v.face));
    assert(Math.abs(v.atU - 2) < 0.05 && Math.abs(v.atV + 1.5) < 0.05, 'Position X / Y from the click: ' + v.atU + ', ' + v.atV);
    assert(UI.groups.preview.children.length >= 1, 'the form previews');
    // exact position typed in
    UI.pmSetValue('atU', 2); UI.pmSetValue('atV', -1.5); await idle();
    await UI.pmOK(); await idle();
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(UI.App.model.features.length === n0 + 1 && f.type === 'formingTool' && f.tool === 'dimple' && f.name === 'Dimple1', 'feature ' + JSON.stringify(f));
    assert(!Object.keys(UI.App.build.errors || {}).length, 'build errors ' + JSON.stringify(UI.App.build.errors));
    var m2 = K.newModel('x'); K.runScript(m2, 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.formingTool("dimple", [2, ' + T + ', 1.5]);');
    near(rfHIVol(), K.massProps(K.meshFromBody(K.rebuild(m2).body)).volume, 1e-12, 'the volume of a scripted dimple at that point');
    assert(rfHIVol() > v0, 'the dimple adds metal (the wall stretches)');
    var row = Array.prototype.filter.call(D.querySelectorAll('#tree [data-fid]'), function (e) { return /Dimple1/.test(e.textContent) && e.querySelector('svg'); })[0];
    assert(row, 'tree row with an icon');
    // one undo step
    await UI.undo(); await idle();
    assert(UI.App.model.features.length === n0, 'undo removes it');
    near(rfHIVol(), v0, 1e-12, 'volume back');
    await UI.redo(); await idle();
    assert(UI.App.model.features.length === n0 + 1, 'redo puts it back');
    f = UI.App.model.features[UI.App.model.features.length - 1];
    // Edit Feature: reopens on the dimple; switching the tool to Louver takes the louver's dimensions
    UI.editFeature(f); await idle(); await wait(30);
    assert(UI.hasPM() && UI.pmSpec().values.tool === 'dimple' && UI.pmSpec().values.face, 'Edit Feature reopens the dimple');
    var lv = D.querySelector('#pm [data-key="tool:louver"]');
    assert(lv, 'Louver in the Tool row');
    lv.click(); await idle(); await wait(20);
    v = UI.pmSpec().values;
    assert(v.tool === 'louver' && Math.abs(v.length - 1.5) < 1e-12 && Math.abs(v.width - 0.375) < 1e-12, 'louver dims: ' + JSON.stringify(v));
    assert(Array.prototype.some.call(D.querySelectorAll('#pm label'), function (l) { return /^Length/.test(l.textContent); }), 'the Length field shows');
    await UI.pmOK(); await idle();
    f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.tool === 'louver' && f.name === 'Dimple1' && !Object.keys(UI.App.build.errors || {}).length, 'edited to a louver: ' + JSON.stringify(f) + JSON.stringify(UI.App.build.errors));
    // UI.cmdFormingTool(id) opens preset (the Design Library pane calls it)
    UI.cmdFormingTool('lance'); await idle(); await wait(20);
    assert(UI.hasPM() && UI.pmSpec().values.tool === 'lance', 'preset lance');
    var on = D.querySelector('#pm [data-key="tool:lance"]');
    assert(on && on.classList.contains('on'), 'Lance pressed in the Tool row');
    selClick(UI.worldToScreen([0.7, T, 1.0])); await idle(); await wait(20);
    UI.pmSetValue('angle', 90); await idle();
    await UI.pmOK(); await idle();
    f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.tool === 'lance' && f.name === 'Lance1' && +f.angle === 90 && !Object.keys(UI.App.build.errors || {}).length, 'Lance1: ' + JSON.stringify(f) + JSON.stringify(UI.App.build.errors));
    // a click too near the edge is refused: the tool stays where it was
    UI.cmdFormingTool('dimple'); await idle(); await wait(20);
    selClick(UI.worldToScreen([0.1, T, 2.9])); await idle(); await wait(20);
    assert(!UI.pmSpec().values.face, 'a click at the corner does not place a dimple');
    UI.pmCancel(); await idle();
    // the flat: one blank (louver slit + two lance slits), the marks drawn while flattened
    var flat = K.flatPattern(UI.App.model, UI.App.build, UI.App.mesh);
    assert(flat.loops.length === 4, 'blank + three slits: ' + flat.loops.length);
    assert(/FORM/.test(K.exportDXFFlat(flat, 'in')) && /LOUVER 1\.5 X \.375 X \.125 UP/.test(K.exportDXFFlat(flat, 'in')), 'FORM layer and the louver note in the DXF');
    UI.toggleFlatten(true); await idle(); await wait(20);
    var segs = (UI.crossBreakGroup && UI.crossBreakGroup.children || []).reduce(function (n, o) { return n + o.geometry.getAttribute('position').count / 2; }, 0);
    assert(segs >= 8, 'the FORM marks show on the flat: ' + segs);
    UI.toggleFlatten(false); await idle();
    try { localStorage.removeItem('anvil.fly.forming'); } catch (e) { }
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'Dimple1 → louver, Lance1, ' + flat.loops.length + ' loops';
  });
