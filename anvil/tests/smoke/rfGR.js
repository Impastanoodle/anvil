  // ---- rfGR (lane sketch-path, 2026-11-02): Close Sketch to Model and Make Path (Tools ▸ Sketch Tools)
  async function rfGROpen(code) {
    await anvil.newPart(); await idle();
    await anvil.run(code); await idle();
    var fs = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; }), f = fs[fs.length - 1];
    await UI.enterSketch(f.id); await idle();
    assert(UI.App.mode === 'sketch', 'not in the sketch');
    return UI.activeSketchFeature();
  }
  async function rfGRExtrude(d) {
    UI.exitSketch(); await idle();
    await anvil.run(anvil.script() + '\np.extrude(' + d + ');'); await idle();
    return anvil.mass().volume;
  }
  var RFGR_BLOCK = 'p.sketch("Front").rect(0, 0, 40, 30);\np.extrude(10);\n';
  step('rfGR: Close Sketch to Model: a U on a block\'s face ending on its bottom edge closes along that edge and extrudes as a closed profile; Reverse direction of closure takes the other way round; one undo step', async function () {
    var errs0 = errors.length;
    var U1 = RFGR_BLOCK + 'p.sketch("Front", 10).line(10, 0, 10, 15).line(10, 15, 30, 15).line(30, 15, 30, 0);';
    var f = await rfGROpen(U1), n0 = f.entities.length;
    assert(K.sketchProfile(f).loops.length === 0, 'open at the start');
    var chains = K.openSketchChains(f);
    assert(chains.length === 1 && chains[0].ents.length === 3, 'one chain of three ' + JSON.stringify(chains));
    var spec = UI.cmdCloseSketchToModel();
    await idle();
    assert(UI.App.tempEntities.length === 1, 'preview: the closing line ' + JSON.stringify(UI.App.tempEntities));
    var L = UI.App.tempEntities[0];
    assert(L.t === 'line' && Math.abs(L.y1) < 1e-9 && Math.abs(L.y2) < 1e-9 && Math.abs(Math.abs(L.x2 - L.x1) - 20) < 1e-9, 'along the bottom edge ' + JSON.stringify(L));
    pmField('Reverse direction of closure').click(); await idle();
    assert(UI.App.tempEntities.length === 5, 'the other way: bottom, left, top, right, bottom pieces ' + JSON.stringify(UI.App.tempEntities));
    pmField('Reverse direction of closure').click(); await idle();
    assert(UI.App.tempEntities.length === 1, 'back to the short way');
    var u0 = UI.App.undo.length;
    UI.pmOK({ close: true }); await idle();
    f = UI.activeSketchFeature();
    assert(f.entities.length === n0 + 1 && UI.App.undo.length === u0 + 1, 'one line, one undo step: ' + f.entities.length + ' undo +' + (UI.App.undo.length - u0));
    assert((f.rels || []).some(function (r) { return r.type === 'onEdge'; }) && (f.rels || []).filter(function (r) { return r.type === 'coincident'; }).length >= 2, 'On Edge + Coincident ' + JSON.stringify(f.rels));
    assert(K.sketchProfile(f).loops.length === 1 && !K.sketchProfile(f).warnings.length, 'closed profile ' + JSON.stringify(K.sketchProfile(f).warnings));
    near(await rfGRExtrude(5), 40 * 30 * 10 + 20 * 15 * 5, 1e-6, 'the U extrudes closed');
    // Reverse: everything of the face but the U
    f = await rfGROpen(U1);
    var r = UI.closeSketchToModel({ reverse: true });
    assert(r.ok, 'reverse ' + JSON.stringify(r));
    assert(K.sketchProfile(f).loops.length === 1, 'closed the long way');
    near(await rfGRExtrude(5), 40 * 30 * 10 + (40 * 30 - 20 * 15) * 5, 1e-6, 'the rest of the face extrudes');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'U 300 × 5, reverse 900 × 5';
  });
  step('rfGR: Close Sketch to Model on a round edge: a chord of a disc closes along a true arc (exact segment area), Reverse the long way; an end off the model says so in a plain sentence; a sketch on a plane behind the block closes on the projected edges', async function () {
    var errs0 = errors.length, R = 10, c = Math.acos(8 / 10), seg = R * R * c - 8 * Math.sqrt(R * R - 64);
    var DISC = 'p.sketch("Front").circle(0, 0, 10);\np.extrude(5);\np.sketch("Front", 5).line(-6, 8, 6, 8);';
    var f = await rfGROpen(DISC), r = UI.closeSketchToModel();
    assert(r.ok && f.entities.length === 2 && f.entities[1].t === 'arc', 'an arc ' + JSON.stringify(f.entities));
    near(f.entities[1].r, 10, 1e-9, 'true radius');
    near(await rfGRExtrude(2), Math.PI * 100 * 5 + seg * 2, 1e-5, 'the chord segment');
    f = await rfGROpen(DISC); r = UI.closeSketchToModel({ reverse: true });
    assert(r.ok && f.entities[1].t === 'arc', 'an arc the long way ' + JSON.stringify(f.entities));
    near(await rfGRExtrude(2), Math.PI * 100 * 5 + (Math.PI * 100 - seg) * 2, 1e-5, 'the big segment');
    f = await rfGROpen(RFGR_BLOCK + 'p.sketch("Front", 10).line(10, 5, 30, 5);');
    r = UI.closeSketchToModel();
    assert(!r.ok && /have to lie on model edges/.test(r.error), r.error);
    // a line, a true arc and a line in one closure: a cross line on a slot-shaped block takes the near round end
    f = await rfGROpen('p.sketch("Front").slot(-10, 0, 10, 0, 8);\np.extrude(5);\np.sketch("Front", 5).line(-5, -4, -5, 4);');
    r = UI.closeSketchToModel();
    assert(r.ok && f.entities.map(function (e) { return e.t; }).slice(1).sort().join() === 'arc,line,line', 'line, arc, line ' + JSON.stringify(f.entities));
    near(await rfGRExtrude(2), (20 * 8 + Math.PI * 16) * 5 + (5 * 8 + Math.PI * 8) * 2, 1e-5, 'the round end');
    // a slanted edge: a line up from the bottom of a triangle to its hypotenuse
    f = await rfGROpen('p.sketch("Front").polyline([[0, 0], [40, 0], [0, 30]], true);\np.extrude(5);\np.sketch("Front", 5).line(20, 0, 20, 15);');
    r = UI.closeSketchToModel();
    assert(r.ok, 'slanted ' + JSON.stringify(r));
    near(await rfGRExtrude(2), 600 * 5 + 150 * 2, 1e-6, 'the small triangle');
    // closed already: nothing to close
    f = await rfGROpen(RFGR_BLOCK + 'p.sketch("Front", 10).rect(5, 5, 5, 5);');
    r = UI.closeSketchToModel();
    assert(!r.ok && /no open profile/.test(r.error), r.error);
    // the sketch plane is off the block: the projected edges close it
    f = await rfGROpen(RFGR_BLOCK + 'p.sketch("Front", 30).line(10, 0, 10, 15).line(10, 15, 30, 15).line(30, 15, 30, 0);');
    r = UI.closeSketchToModel();
    assert(r.ok && K.sketchProfile(f).loops.length === 1, 'projected ' + JSON.stringify(r));
    UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'segment ' + seg.toFixed(3);
  });
  step('rfGR: Make Path: one selected entity takes in its tangent-connected chain; a click adds a chain and takes a member out; a corner stops it; the path survives a script round trip; right-click Edit Path and Dissolve Path; the Tools menu has both commands', async function () {
    var errs0 = errors.length, u, f;
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    UI.zoomView(0.25 / UI.cam.scale);
    f = UI.activeSketchFeature();
    // line, tangent arc, tangent line (a slot-like J), then a line at a corner, and a loose line
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }, { t: 'arc', cx: 20, cy: 10, r: 10, a0: 270, a1: 360 }, { t: 'line', x1: 30, y1: 10, x2: 30, y2: 30 },
      { t: 'line', x1: 30, y1: 30, x2: 10, y2: 30 }, { t: 'line', x1: -30, y1: 40, x2: -10, y2: 40 });
    UI.App.gridStale = true; UI.updateSketches(); await wait(20);
    assert(K.tangentChain(f, 1).join() === '0,1,2', 'chain ' + K.tangentChain(f, 1));
    assert(K.pathOrder(f, [2, 0, 1]).join() === '0,1,2' || K.pathOrder(f, [2, 0, 1]).join() === '2,1,0', 'order ' + K.pathOrder(f, [2, 0, 1]));
    assert(K.pathOrder(f, [0, 4]) === null, 'two loose lines are no chain');
    assert(K.makeSketchPath({ entities: f.entities }, [0, 4]).ok === false, 'refused');
    UI.setSelection([{ kind: 'entity', index: 1 }]); await idle();
    var spec = UI.cmdMakePath(); await idle();
    assert(spec.values.entities.slice().sort().join() === '0,1,2', 'taken in ' + spec.values.entities);
    assert(UI.selection().length === 3, 'shown selected ' + UI.selection().length);
    // real clicks: a member comes out, the loose line goes in and out again
    rskClick([30, 20]); await idle();
    assert(spec.values.entities.slice().sort().join() === '0,1', 'a click takes a member out ' + spec.values.entities);
    rskClick([30, 20]); await idle();
    assert(spec.values.entities.slice().sort().join() === '0,1,2', 'a click takes it back ' + spec.values.entities);
    rskClick([-20, 40]); await idle();
    assert(spec.values.entities.indexOf(4) >= 0, 'the loose line ' + spec.values.entities);
    assert(UI.pmOK({ close: true }) === false || UI.App.command, 'not one chain: refused, the PM stays');
    await idle();
    rskClick([-20, 40]); await idle();
    assert(spec.values.entities.indexOf(4) < 0, 'taken out again ' + spec.values.entities);
    u = UI.App.undo.length;
    UI.pmOK({ close: true }); await idle();
    f = UI.activeSketchFeature();
    assert(f.entities[0].pathId === 1 && f.entities[1].pathId === 1 && f.entities[2].pathId === 1 && f.entities[3].pathId == null, 'members ' + JSON.stringify(f.entities));
    assert(UI.App.undo.length === u + 1, 'one undo step');
    assert(K.sketchPaths(f).length === 1 && K.sketchPaths(f)[0].ents.length === 3, 'one path');
    assert(/\.paths\(\[\[0,1,2\]\]\)/.test(anvil.script()), 'script line: ' + anvil.script());
    // the right-click rows
    UI.setSelection([{ kind: 'entity', index: 2 }]); await idle();
    var items = UI.sketchMenuItems([]), rows = items.map(function (x) { return x && x.label; });
    assert(rows.indexOf('Edit Path') >= 0 && rows.indexOf('Dissolve Path') >= 0, 'rows ' + rows.join());
    // Edit Path: a row leaves the path, ✓ keeps the rest
    spec = UI.editSketchPath(2); await idle();
    assert(spec.title === 'Edit Path' && spec.values.entities.length === 3, 'edit opens on the path');
    spec.values.entities.splice(spec.values.entities.indexOf(2), 1);
    UI.pmOK({ close: true }); await idle();
    f = UI.activeSketchFeature();
    assert(f.entities[2].pathId == null && f.entities[0].pathId === 1 && f.entities[1].pathId === 1, 'edited ' + JSON.stringify(f.entities));
    // round trip
    UI.exitSketch(); await idle();
    await anvil.run(anvil.script()); await idle();
    var g = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    assert(K.sketchPaths(g).length === 1 && K.sketchPaths(g)[0].ents.length === 2, 'round trip ' + JSON.stringify(K.sketchPaths(g)));
    await UI.enterSketch(g.id); await idle();
    f = UI.activeSketchFeature();
    var n = f.entities.length;
    assert(UI.dissolveSketchPath(0) === 2 && f.entities.length === n && K.sketchPaths(f).length === 0, 'dissolved, entities stay');
    UI.undo(); await idle();
    assert(K.sketchPaths(UI.activeSketchFeature()).length === 1, 'undo brings it back');
    var rowsCS = menuRows('Close Sketch to Model'), rowsMP = menuRows('Make Path');
    assert(rowsCS.length && /Tools/.test(rowsCS[0].menu) && !rowsCS[0].row.classList.contains('disabled'), 'Close Sketch to Model in Tools ' + JSON.stringify(rowsCS.map(function (x) { return x.menu; })));
    assert(rowsMP.length && /Tools/.test(rowsMP[0].menu) && !rowsMP[0].row.classList.contains('disabled'), 'Make Path in Tools');
    selKey('Escape'); await idle();
    if (UI.closeMenus) UI.closeMenus();
    UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'path of 3, edited to 2, dissolved';
  });
  // --- end rfGR ---
