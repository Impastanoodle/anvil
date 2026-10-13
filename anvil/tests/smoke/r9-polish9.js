  // --- r9/polish9 ---
  step('r9/polish9: a Through All cut preview stops just past the part (depth from the sketch plane to the far side of the model, not 1.5 diagonals)', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.box(40, 20, 20, { centered: true });\np.sketch("Top", 20).circle(0, 0, 4);'); await idle();
    var sk = UI.App.model.features.filter(function (f) { return f.type === 'sketch'; }).pop();
    UI.setSelection([{ kind: 'feature', id: sk.id }]);
    UI.cmdExtrude(true); await wait(50);
    var v = UI.pmSpec().values;
    assert(v.end === 'through', 'Cut-Extrude opens Through All: ' + v.end);
    var lim = UI.previewThroughLimit({ type: 'extrude', sketch: sk.id, end: 'through', reverse: true, cut: true });
    assert(lim >= 20 && lim < 23, 'through limit ' + lim + ' (part 20 deep below the sketch)');
    await UI.previewIdle();
    var box = new W.THREE.Box3().setFromObject(UI.groups.preview);
    assert(!box.isEmpty() && box.min.y > -3 && box.max.y <= 20.001, 'preview y ' + box.min.y.toFixed(2) + '..' + box.max.y.toFixed(2));
    UI.pmCancel(); await idle();
    return 'limit ' + lim.toFixed(2) + ', preview y ' + box.min.y.toFixed(2) + '..' + box.max.y.toFixed(2);
  });
  step('r9/polish9: Mate PM — a Coincident whose default Anti-Aligned cannot be met (pin held upright by a Concentric, its bottom on the plate bottom) previews and commits Aligned instead of an error', async function () {
    await anvil.newAssembly('R9Align');
    await anvil.insert({ example: 'Plate with bolt holes' }, { fixed: true });
    await anvil.insert({ script: 'p.name("Pin"); p.cylinder(3, 25);' }, { position: [10, 30, 10] });
    await anvil.mate('concentric', { component: 2, cylinder: [3, 10, 0] }, { component: 1, cylinder: [14, 4, 10] }); await idle();
    UI.cmdMate(); await wait(30);
    UI.mateSelect({ component: 2, face: [1, 0, 1] }); UI.mateSelect({ component: 1, face: [50, 0, 30] }); await idle();
    assert(UI.pmSpec().values.alignment === 'aligned', 'alignment ' + UI.pmSpec().values.alignment);
    assert(/previewed/.test(D.querySelector('#pm').innerText), 'message: ' + D.querySelector('#pm').innerText.slice(0, 80));
    await pmAccept();
    UI.pmCancel(); await idle();
    var mt = anvil.mates().filter(function (m) { return m.type === 'coincident'; })[0];
    assert(mt && mt.ok && !mt.error, 'mate ' + JSON.stringify(mt));
    assert(W.Assembly.findMate(UI.App.model, mt.id).alignment === 'aligned', 'stored alignment');
    var pin = anvil.components()[1];
    nearVecS(pin.position, [10, 0, 10], 1e-6, 'pin');
    return 'Aligned taken, pin at ' + pin.position.join(', ');
  });
  step('r9/polish9: a Flexible sub-assembly inside another Flexible one: dragging a part of the inner sub-assembly moves that sub-assembly (it slides on its mate) instead of "is fixed"', async function () {
    var W2 = 'a.name("W2").units("mm");\nvar base = a.insert({ script: \'p.name("Base"); p.box(120, 60, 10);\' }, { fixed: true });\n' +
      'var h = a.insert({ example: "Hinge sub-assembly" }, { position: [60, 30, 20], flexible: true });\n' +
      'a.coincident({ component: h, path: ["Leaf<1>"], face: [-20, -5, 10] }, { component: base, face: [60, 10, 30] });';
    await anvil.newAssembly('R9Nest');
    await anvil.insert({ script: W2 }, { fixed: true }); await idle();
    await UI.setFlexible(1, true); await idle();
    UI.setView('Front'); await wait(30);
    var x0 = UI.App.model.components[0].flexState[2].position[0];
    // the standing arm's front face (x 55..60, y 16..56, z = 40), above the leaf
    var p = UI.worldToScreen([57.5, 45, 40]), hit = UI.pickFace(p[0], p[1]);
    assert(hit && Math.abs(hit.point[2] - 40) < 1e-6, 'arm face under ' + p.map(Math.round) + ': ' + JSON.stringify(hit && hit.point));
    await selDrag(p, [p[0] + 40, p[1]]);
    var st = UI.App.model.components[0].flexState[2], x1 = st.position[0];
    assert(x1 > x0 + 1, 'hinge slid: ' + x0 + ' -> ' + x1);
    near(st.position[1], 15, 1e-6, 'still on the base top');
    return 'x ' + x0 + ' -> ' + x1.toFixed(2);
  });
  step('r9/polish9: inside a rigid sub-assembly every inner part keeps its own OpenCascade faces (ids offset per component: no face spans two parts) (skipped without vendor/occt)', async function () {
    var was = anvil.occt().on;
    await anvil.newAssembly('R9Faces');
    await anvil.insert({ example: 'Hinged cover (sub-assemblies)' }, { fixed: true }); await idle();
    anvil.occt(true, { remember: false });
    try {
      var s = await Promise.race([anvil.occtIdle(), wait(30000).then(function () { return anvil.occt(); })]); await idle();
      if (s.state === 'failed' || !s.driving) return 'skipped: ' + (s.error || s.state);
      var m = UI.App.mesh, g = UI.occtFaceGroups(m);
      assert(g && g.every(function (x) { return x.length === 1; }), 'merged groups: ' + (g || []).filter(function (x) { return x.length > 1; }).map(function (x) { return x.join(); }).join(' | '));
      assert(m.faces.length === 30, 'five boxes, 30 faces: ' + m.faces.length);
      return m.faces.length + ' faces';
    } finally { anvil.occt(was, { remember: false }); await idle(); }
  });
  step('r9/polish9: Fillet / Chamfer / Shell take the whole pre-selection — a selected face gives the edges around it (a circle once), Ctrl-selected edges all go in, two selected faces are both removed by Shell; a just-created feature is let go', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.box(40, 20, 10, { centered: true });\np.sketch("Top", 10).circle(0, 0, 5);\np.extrude(5);'); await idle();
    var tf = UI.App.mesh.faces.findIndex(function (f) { return f.normal[1] > 0.9 && Math.abs(f.centroid[1] - 10) < 1e-6; });
    UI.setSelection([{ kind: 'face', index: tf }]);
    UI.cmdFillet(); await UI.previewIdle();
    var ed = UI.pmSpec().values.edges;
    assert(ed.length === 5, '4 outer edges + the boss circle: ' + JSON.stringify(ed));
    assert(anvil.selection().length === 0, 'the face moved into the PM');
    UI.pmCancel(); await idle();
    var sharp = UI.App.edges.filter(function (e) { return !e.smooth && e.faces.length === 2 && e.convex === true && e.curve == null && Math.abs(e.a[1] - e.b[1]) > 5; });
    assert(sharp.length === 4, 'four vertical edges: ' + sharp.length);
    UI.setSelection(sharp.map(function (e) { return { kind: 'edge', edge: e, index: UI.App.edges.indexOf(e) }; }));
    UI.cmdChamfer(); await UI.previewIdle();
    assert(UI.pmSpec().values.edges.length === 4, 'four chamfer picks: ' + UI.pmSpec().values.edges.length);
    await pmAccept();
    var ch = UI.App.model.features[UI.App.model.features.length - 1];
    assert(ch.type === 'chamfer' && ch.edges.length === 4 && !anvil.summary().errors[ch.id], 'chamfer committed ' + JSON.stringify(ch.edges));
    // the new feature is selected after ✓; the next Fillet starts empty and lets it go
    assert(UI.App.sel && UI.App.sel.kind === 'feature', 'feature selected after the commit');
    UI.cmdFillet(); await wait(20);
    assert(UI.pmSpec().values.edges.length === 0 && !UI.App.sel, 'Fillet starts empty, selection let go');
    UI.pmCancel(); await idle();
    // Shell: two faces (top and front) selected
    await anvil.run('p.box(40, 20, 10, { centered: true });'); await idle();
    var ft = UI.App.mesh.faces.findIndex(function (f) { return f.normal[1] > 0.9; }), ff = UI.App.mesh.faces.findIndex(function (f) { return f.normal[2] > 0.9; });
    UI.setSelection([{ kind: 'face', index: ft }, { kind: 'face', index: ff }]);
    UI.cmdShell(); await UI.previewIdle();
    assert(UI.pmSpec().values.faces.length === 2, 'two faces to remove: ' + JSON.stringify(UI.pmSpec().values.faces));
    setInput(pmNumber(0), 1);
    await pmAccept();
    // 40 × 20 × 10 minus the 38 × 19 × 9 cavity open at the top and front
    near(anvil.summary().volume, 8000 - 38 * 19 * 9, 1e-3, 'open box volume');
    return 'face → 5 edges, 4 edges, 2 shell faces';
  });
  step('r9/polish9: SmartMates — dropping the top of a pin (held upright by a Concentric) on the plate top adds an Aligned Coincident (flush) instead of "not possible"', async function () {
    await anvil.newAssembly('R9Smart');
    await anvil.insert({ example: 'Plate with bolt holes' }, { fixed: true });
    await anvil.insert({ script: 'p.name("Pin"); p.cylinder(3, 25);' }, { position: [10, 30, 10] });
    await anvil.mate('concentric', { component: 2, cylinder: [3, 10, 0] }, { component: 1, cylinder: [14, 4, 10] }); await idle();
    UI.setView('Isometric'); anvil.fit(); await wait(400);
    var a = UI.worldToScreen([10, 55, 10]), b = UI.worldToScreen([60, 10, 40]);
    var top = UI.App.mesh.faces.filter(function (f) { return f.normal[1] > 0.99 && (f.body || 0) === 0; }).reduce(function (m, f) { return Math.max(m, f.centroid[1]); }, -1e9);   // the plate top
    await selDrag(a, b, null, { altKey: true }); await wait(50);
    var mt = UI.App.model.mates.filter(function (m) { return m.type === 'coincident'; })[0];
    assert(mt && mt.alignment === 'aligned', 'coincident added aligned: ' + JSON.stringify(UI.App.model.mates));
    assert(anvil.mates().every(function (m) { return m.ok; }), 'mates ok ' + JSON.stringify(anvil.mates()));
    var pin = anvil.components()[1];
    near(pin.position[1] + 25, top, 1e-6, 'pin top flush with the plate top');
    var keep = D.querySelector('.asm-popup [data-id="ok"]'); if (keep) keep.click();
    return 'pin at ' + pin.position.map(function (v) { return +v.toFixed(3); }).join(', ');
  });
  // --- end r9/polish9 ---
