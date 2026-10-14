  // ---- rfCF (2026-10-14): a double-click ends a Line chain and discards the segment being pulled — what the
  // double-click's own two clicks made (the segment to its point, a stub) is taken back with its relations and undo
  // snapshots; the segments placed before stay, the tool stays for the next chain
  function rfCFRels() { return (UI.activeSketchFeature().rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }); }
  function rfCFUndo() { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); }
  step('rfCF: Line tool — click A, B, C, double-click at D: exactly A–B and B–C (no line to D, no stub), their relations kept and none left behind, the Line tool stays with the chain ended, the next click starts a new chain; two undo steps, one Ctrl+Z removes B–C', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.App.view.showGrid = false;
    var undo0 = UI.App.undo.length;
    UI.setTool('line'); rskClick([0, 0]); rskClick([40, 0]); rskClick([40, 30]); rskDbl([0, 30]);
    var e = rskEnts();
    assert(e.length === 2 && e[0].x1 === 0 && e[0].y1 === 0 && e[0].x2 === 40 && e[0].y2 === 0 && e[1].x1 === 40 && e[1].y1 === 0 && e[1].x2 === 40 && e[1].y2 === 30, 'A–B and B–C only: ' + JSON.stringify(e));
    var rl = rfCFRels();
    assert(rl.indexOf('horizontal:0') >= 0 && rl.indexOf('vertical:1') >= 0 && (rl.indexOf('coincident:0.p2,1.p1') >= 0 || rl.indexOf('coincident:1.p1,0.p2') >= 0) && !rl.some(function (r) { return /(^|,)2(\.|,|$)/.test(r.split(':')[1]); }), 'their relations kept, none to a third line: ' + rl.join(' '));
    assert(!(UI.activeSketchFeature().dims || []).some(function (d) { return d.e >= 2; }), 'no dimension left behind');
    assert(UI.App.tool === 'line' && !UI.App.toolState.pts.length && /Chain ended/.test(statusText()), 'the Line tool stays, chain ended: ' + UI.App.tool + ' ' + statusText());
    assert(UI.App.undo.length === undo0 + 2, 'two undo steps (one per segment kept): ' + (UI.App.undo.length - undo0));
    // the next click starts a new chain from where it is
    rskClick([10, 10]);
    assert(UI.App.toolState.pts.length === 1 && rskEnts().length === 2, 'a new chain started, nothing drawn yet');
    selKey('Escape');
    assert(!UI.App.toolState.pts.length, 'Esc drops the new chain');
    selKey('Escape');
    assert(UI.App.tool === 'select', 'Esc again puts the tool down');
    rfCFUndo(); await idle();
    assert(rskEnts().length === 1 && rskEnts()[0].x2 === 40 && rskEnts()[0].y2 === 0, 'one Ctrl+Z removes B–C: ' + JSON.stringify(rskEnts()));
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'A–B, B–C kept; D discarded';
  });
  step('rfCF: a deliberate click at D then a double-click on it keeps D\'s segment (the double-click\'s own clicks made nothing); two clicks 2 px apart take back both the segment and the stub; Centerline the same way: click, click, double-click elsewhere leaves one construction line', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.App.view.showGrid = false;
    UI.setTool('line'); rskClick([0, 0]); rskClick([40, 0]); rskClick([40, 30]); rskClick([0, 30]); rskDbl([0, 30]);
    var e = rskEnts();
    assert(e.length === 3 && e[2].x2 === 0 && e[2].y2 === 30 && !UI.App.toolState.pts.length && UI.App.tool === 'line', 'three segments, the last to (0, 30), chain ended: ' + JSON.stringify(e));
    selKey('Escape');
    // Centerline: click, click, double-click elsewhere
    UI.cmdCenterline(); rskClick([-10, -20]); rskClick([-10, 20]); rskDbl([30, 20]);
    e = rskEnts();
    assert(e.length === 4 && e[3].construction === true && e[3].x1 === -10 && e[3].y1 === -20 && e[3].x2 === -10 && e[3].y2 === 20, 'one centerline (-10, -20)–(-10, 20), nothing to (30, 20): ' + JSON.stringify(e[3]));
    assert(UI.lineMode() === 'centerline' && !UI.App.toolState.pts.length, 'Centerline stays, chain ended: ' + UI.lineMode());
    selKey('Escape');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'deliberate D kept; centerline';
  });
  step('rfCF: a double-click right after one click (no segment yet) leaves nothing — the segment its first click placed is taken back, no undo step, the Line tool stays; a double-click with no chain in progress puts the tool down as before', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.App.view.showGrid = false;
    var undo0 = UI.App.undo.length;
    UI.setTool('line'); rskClick([0, 0]); rskDbl([30, 0]);
    assert(rskEnts().length === 0 && !UI.App.toolState.pts.length && UI.App.tool === 'line', 'nothing left, chain ended, the tool stays: ' + JSON.stringify(rskEnts()) + ' ' + UI.App.tool);
    assert(UI.App.undo.length === undo0 && !(UI.activeSketchFeature().rels || []).length, 'no undo step, no relation left: ' + (UI.App.undo.length - undo0) + ' ' + rfCFRels().join(' '));
    // the chain can go on: a full one afterwards
    rskClick([0, 0]); rskClick([20, 0]); rskClick([20, 10]); rskDbl([20, 10]);
    assert(rskEnts().length === 2 && UI.App.undo.length === undo0 + 2, 'a new chain of two: ' + JSON.stringify(rskEnts()));
    // no chain in progress: the double-click puts the tool down (as before)
    selEv('dblclick', rskScr([50, 50]), $('viewport'));
    assert(UI.App.tool === 'select' && rskEnts().length === 2, 'tool down, nothing changed: ' + UI.App.tool);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'one click + double-click: nothing';
  });
