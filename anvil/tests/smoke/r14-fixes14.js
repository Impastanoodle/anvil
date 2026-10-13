  // --- r14/fixes14 ---
  step('r14/fixes14: File ▸ New / opening another document puts an open drawing away at once; its queued redraw never cancels the PropertyManager opened next; closing a drawing cancels only its own PM', async function () {
    if (UI.drawingActive()) UI.closeDrawing();
    await anvil.run(exByName('Flange').code); await idle();
    UI.makeDrawing({ fresh: true }); await UI.drawing.ready();
    assert(UI.drawingActive(), 'drawing open');
    await anvil.newPart('Fix14');
    assert(!UI.drawingActive() && !D.getElementById('app').classList.contains('drawing-mode'), 'the drawing is put away by newPart');
    UI.openPM({ title: 'Fix14 test', fields: [] });
    await wait(250); await idle();
    assert(UI.hasPM(), 'a PropertyManager opened after newPart stays open');
    UI.pmCancel();
    // an example opened over a drawing: same; the assembly gets its own tab
    await anvil.run(exByName('Flange').code); await idle();
    UI.makeDrawing({ fresh: true }); await UI.drawing.ready();
    await UI.openExample(exByName('Pinned plate assembly')); await idle();
    assert(!UI.drawingActive() && UI.App.ribbonTab === 'Assembly', 'assembly opened over a drawing: ' + UI.App.ribbonTab);
    // closeDrawing leaves a PM that is not the drawing's alone
    await anvil.run(exByName('Flange').code); await idle();
    UI.makeDrawing({ fresh: true }); await UI.drawing.ready();
    UI.openPM({ title: 'Fix14 test 2', fields: [] });
    UI.closeDrawing();
    assert(UI.hasPM(), 'closeDrawing cancelled a PropertyManager it did not open');
    UI.pmCancel();
    // undo past Make Drawing: the drawing goes away without touching a PM opened since
    UI.makeDrawing({ fresh: true }); await UI.drawing.ready();
    UI.undo(); await idle();
    UI.openPM({ title: 'Fix14 test 3', fields: [] });
    await wait(250); await idle();
    assert(UI.hasPM(), 'PM kept after undoing Make Drawing');
    UI.pmCancel();
    if (UI.drawingActive()) UI.closeDrawing();
  });
  step('r14/fixes14: assembly ghost edges, explode lines, cosmetic threads and Evaluate markers are thick lines (userData.lineWidth) with screen-space dashes', async function () {
    function fat(o) { return !!(o.userData.fat && o.userData.fat.mesh); }
    await UI.openExample(exByName('Gear train and patterns')); await idle();
    anvil.exploded(true); await idle();
    await anvil.transparent('Base<1>', true); await idle();
    // (the explode animates as a pose, which hides the ghost edges until it lands)
    for (var gt = 0; gt < 40; gt++) {
      var shown = false;
      UI.scene.traverse(function (o) { if (o.userData.asmGhostEdges && o.visible) shown = true; });
      if (shown) break;
      await wait(100);
    }
    UI.render();
    var ex = [], gh = [];
    UI.scene.traverse(function (o) {
      if (!(o.isLine || o.isLineSegments)) return;
      if (o.parent && o.parent.name === 'explode-lines') ex.push(o);
      if (o.userData.asmGhostEdges) gh.push(o);
    });
    assert(ex.length && ex.every(function (o) { return o.material.userData.lineWidth === 1.5 && o.material.userData.dashPx > 0 && fat(o); }), 'explode lines thick and dashed: ' + ex.length);
    assert(gh.length && gh.every(function (o) { return o.material.userData.lineWidth > 1 && fat(o); }), 'ghost edges thick: ' + gh.length);
    anvil.exploded(false); await anvil.transparent('Base<1>', false); await idle();
    await anvil.run('p.box(60, 20, 40);\np.holeWizard({ face: "Top", offset: 20, points: [[30, -20]], type: "tap", size: "M8", depth: 16, threadDepth: 12 });'); await idle();
    UI.render();
    var th = [];
    UI.scene.traverse(function (o) { if (o.userData.thread) th.push(o); });
    assert(th.length === 1 && th[0].material.userData.lineWidth === 1.5 && th[0].material.userData.dashPx > 0 && fat(th[0]), 'cosmetic thread thick and dashed: ' + th.length);
    await anvil.run(exByName('Two-body clamp').code); await idle();
    UI.cmdClearance(); await idle(); UI.render();
    var mk = [];
    UI.groups.preview.traverse(function (o) { if (o.isLineSegments) mk.push(o); });
    UI.pmCancel();
    assert(mk.length && mk.every(function (o) { return o.material.userData.lineWidth === 2 && fat(o); }), 'clearance line thick: ' + mk.length);
    return ex.length + ' explode lines, ' + gh.length + ' ghost edge sets, 1 thread, ' + mk.length + ' clearance line';
  });
  // --- end r14/fixes14 ---
