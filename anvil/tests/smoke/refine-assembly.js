  // --- refine/assembly ---
  step('refine/assembly: dragging the hinged Arm of the Hinge swings it about the hinge (it used to snap back); mates hold; one undo step', async function () {
    await anvil.run(W.AnvilExamples.filter(function (e) { return e.name === 'Hinge sub-assembly'; })[0].code);
    await idle();
    UI.setView('Front'); anvil.fit(); await idle();
    var arm = anvil.components()[1], undoN = UI.App.undo.length;
    var p = UI.worldToScreen([-2.5, 36, 20]), hit = UI.pickFace(p[0], p[1]);
    assert(hit && UI.App.mesh.faces[hit.index].body === 1, 'the arm is under the point');
    var a0 = Math.atan2(arm.rotation[3], arm.rotation[0]) * 180 / Math.PI;
    var hinge = UI.worldToScreen([0, 0, 20]), r = Math.hypot(p[0] - hinge[0], p[1] - hinge[1]);
    // pull the top of the arm round to 45° on the right of the hinge line
    await dragViewport(p, [hinge[0] + r * Math.SQRT1_2, hinge[1] - r * Math.SQRT1_2]);
    var after = anvil.components()[1], a1 = Math.atan2(after.rotation[3], after.rotation[0]) * 180 / Math.PI;
    assert(Math.abs(a1 - a0) > 30, 'the arm swung: ' + a0.toFixed(1) + '° → ' + a1.toFixed(1) + '°');
    nearVecS(after.position, [0, 0, 0], 1e-6, 'still on the hinge');
    assert(anvil.mates().every(function (m) { return m.ok; }), 'mates ok');
    assert(UI.App.undo.length === undoN + 1, 'one undo step (' + (UI.App.undo.length - undoN) + ')');
    await UI.undo(); await idle();
    near(anvil.components()[1].rotation[3], arm.rotation[3], 1e-9, 'undo');
    return 'arm ' + a0.toFixed(1) + '° → ' + a1.toFixed(1) + '°';
  });
  step('refine/assembly: dragging a fully defined component leaves it in place, says so and adds no undo step', async function () {
    await anvil.run(exByName('Distance and angle mates').code);
    await idle();
    UI.setView('Front'); anvil.fit(); await idle();
    var blk = anvil.components()[1], undoN = UI.App.undo.length;
    assert(blk.dof === 0, 'the block is fully defined');
    var p = UI.worldToScreen(W.Assembly.componentCenter(UI.App.model, UI.App.build, blk.id)), hit = UI.pickFace(p[0], p[1]);
    assert(hit && UI.App.mesh.faces[hit.index].body === 1, 'the block is under its centre');
    await dragViewport(p, [p[0] + 50, p[1] + 20]);
    nearVecS(anvil.components()[1].position, blk.position, 1e-6, 'not moved');
    assert(UI.App.undo.length === undoN, 'no undo step (' + (UI.App.undo.length - undoN) + ')');
    assert(/fully defined/.test($('status-msg').textContent), 'status: ' + $('status-msg').textContent);
  });
  step('refine/assembly: Mate PM proposes Tangent for a cylindrical face and a flat face; mate menu Flip Mate Alignment turns the block upside down (one undo step)', async function () {
    await baseAndBlock('FlipAsm');
    await anvil.insert({ script: 'p.name("Pin"); p.cylinder(4, 20);' }, { position: [80, 40, 30], rotation: [1, 0, 0, 0, 0, -1, 0, 1, 0] });
    await idle();
    UI.cmdMate();
    UI.mateSelect({ component: 3, cylinder: [4, 10, 0] }); UI.mateSelect({ component: 1, face: [50, 10, 30] });
    await idle();
    assert(D.querySelector('#pm select[data-key="type"]').value === 'tangent', 'proposed type ' + D.querySelector('#pm select[data-key="type"]').value);
    UI.pmCancel(); await idle();
    var mt = await anvil.mate('coincident', { component: 2, face: [10, 0, 10] }, { component: 1, face: [50, 10, 30] });
    await idle();
    var c1 = anvil.mates()[0];
    near(anvil.components()[1].rotation[4], 1, 1e-9, 'upright');
    var items = UI.asmMateMenuExtras(UI.App.model.mates[0]);
    assert(items.length === 1 && items[0].label === 'Flip Mate Alignment', 'menu item');
    var undoN = UI.App.undo.length;
    items[0].action();
    await idle(); await wait(50); await idle();
    var c = anvil.components()[1];
    near(c.rotation[4], -1, 1e-9, 'upside down');
    near(c.position[1], 10, 1e-9, 'bottom face still on the top plane');
    assert(anvil.mates()[0].ok && UI.App.model.mates[0].alignment === 'aligned', 'mate ok, aligned');
    assert(UI.App.undo.length === undoN + 1, 'one undo step');
    await UI.undo(); await idle();
    near(anvil.components()[1].rotation[4], 1, 1e-9, 'undo: upright');
    // a mate that cannot be satisfied marks the block over defined: "(+) Block<1>" in the FeatureManager
    await anvil.mate('coincident', { component: 2, face: [10, 0, 10] }, { component: 1, face: [50, 0, 30] });
    await idle();
    assert(anvil.components()[1].overDefined && rowText(compRows()[1]) === '(+) Block<1>', 'over defined row: ' + rowText(compRows()[1]));
    return c1.name;
  });
  // --- end refine/assembly ---
