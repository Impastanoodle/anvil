  // ---- sketch-tools2: Dynamic Mirror, Intersection Curve, Fillet all corners of the chain, the 3 Point Arc Slot's width
  // click near its third point, Trim ▸ Corner with a spline (ui-sketch-tools.js, ui-sketch-curves.js, sketch-solver.js)
  var dynErr0 = 0;
  function dynFlyRow(group, text) {
    var fl = c14Fly(group);
    assert(fl, 'no ' + group + ' flyout');
    fl.querySelector('.rb-caret').dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); fl.querySelector('.rb-caret').click();
    var row = c14MenuRow(text), off = !row || /disabled/.test(row.className);
    UI.closeMenus();
    return row && !off;
  }
  step('sketch-tools2: Dynamic Mirror — the Mirror flyout\'s button is live; with nothing selected the Mirror PM asks for the line, a click on the centerline turns it on ("=" marks on it); a line drawn from (10, 0) to (20, 10) shows its mirror image while drawing and adds (-10, 0)-(-20, 10) held Symmetric, in one undo step; Esc twice (or the button) turns it off and later lines are not mirrored', async function () {
    dynErr0 = errors.length;
    await rskNew();
    UI.App.view.showGrid = false;
    var f = fxSk([{ t: 'line', x1: 0, y1: -30, x2: 0, y2: 30, construction: true }]);
    UI.setRibbonTab('Sketch'); UI.refreshRibbon();
    assert(dynFlyRow('mirrorEnt', 'Dynamic Mirror'), 'Dynamic Mirror is live in the Mirror flyout');
    if (UI.setSelection) UI.setSelection([]);
    UI.App.sel = null;
    UI.cmdDynamicMirror(); await wait(20);
    assert(UI.pmTitle() === 'Mirror' && !UI.dynamicMirrorOn(), 'the Mirror PM asks for the line: ' + UI.pmTitle());
    rskClick([0, 20]); await wait(20);
    assert(UI.dynamicMirrorOn() && !UI.hasPM() && UI.dynamicMirrorState().axis === 0, 'on about the centerline: ' + JSON.stringify(UI.dynamicMirrorState()) + ' PM ' + UI.pmTitle());
    var marks = UI.sketchOverlayObjects(UI.activeSketchFeature(), UI.activePlane()).filter(function (o) { return o.userData && o.userData.dynMirrorMarks; });   // sketch-hooks: UI.sketchOverlayHooks
    assert(marks.length === 1 && marks[0].geometry.attributes.position.count === 8, '"=" marks at both ends: ' + marks.length);
    UI.setTool('line');
    var undo0 = UI.App.undo.length;
    rskClick([10, 0]); selEv('mousemove', rskScr([20, 10])); await wait(20);
    assert(UI.App.tempEntities.length === 1 && UI.groups.temp.children.length === 2, 'the mirror image is previewed with the line: ' + UI.groups.temp.children.length);
    rskClick([20, 10]); await wait(20);
    f = UI.activeSketchFeature();
    var e1 = f.entities[1], e2 = f.entities[2];
    assert(f.entities.length === 3 && e1.t === 'line' && e2 && e2.t === 'line', 'line + its mirror: ' + JSON.stringify(f.entities));
    near(e2.x1, -10, 1e-9, 'mirror x1'); near(e2.y1, 0, 1e-9, 'mirror y1'); near(e2.x2, -20, 1e-9, 'mirror x2'); near(e2.y2, 10, 1e-9, 'mirror y2');
    assert(stToolRels().indexOf('symmetric:1,2,0') >= 0, 'Symmetric about the centerline: ' + stToolRels().join(' '));
    assert(UI.App.undo.length === undo0 + 1, 'one undo step for both: ' + (UI.App.undo.length - undo0));
    stNoRedundant('dynamic mirror');
    // the chain goes on: the next segment is mirrored too
    rskClick([30, 0]); await wait(20);
    f = UI.activeSketchFeature();
    var o3 = f.entities[3], m4 = f.entities[4];   // (the end lands square to the first segment: Perpendicular inference)
    assert(f.entities.length === 5 && m4 && Math.abs(m4.x1 + o3.x1) < 1e-9 && Math.abs(m4.y1 - o3.y1) < 1e-9 && Math.abs(m4.x2 + o3.x2) < 1e-9 && Math.abs(m4.y2 - o3.y2) < 1e-9 && stToolRels().indexOf('symmetric:3,4,0') >= 0, 'second segment mirrored: ' + JSON.stringify([o3, m4]));
    UI.undo(); await wait(20);
    f = UI.activeSketchFeature();
    assert(f.entities.length === 3, 'Undo takes a segment and its mirror image back together: ' + f.entities.length);
    assert(UI.dynamicMirrorOn(), 'still on after Undo');
    // Esc twice: the first puts the tool down, the second turns Dynamic Mirror off
    selKey('Escape');
    assert(UI.App.tool === 'select' && UI.dynamicMirrorOn(), 'first Esc: the tool goes down, still mirroring');
    selKey('Escape');
    assert(!UI.dynamicMirrorOn(), 'second Esc turns it off');
    UI.setTool('line'); rskClick([10, -10]); rskClick([20, -20]); await wait(20);
    f = UI.activeSketchFeature();
    assert(f.entities.length === 4, 'off: nothing mirrored: ' + f.entities.length);
    UI.cancelTool();
    // the button toggles it, with the centerline selected
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    UI.cmdDynamicMirror();
    assert(UI.dynamicMirrorOn(), 'on from the selected centerline');
    UI.cmdDynamicMirror();
    assert(!UI.dynamicMirrorOn(), 'the button again turns it off');
    // leaving the sketch turns it off
    UI.setSelection([{ kind: 'entity', index: 0 }]); UI.cmdDynamicMirror();
    UI.exitSketch(); await idle();
    assert(!UI.dynamicMirrorOn() && !UI.dynamicMirrorState(), 'off after Exit Sketch');
    return 'mirrored (-10, 0)-(-20, 10), Symmetric, one undo step';
  });
  step('sketch-tools2: Intersection Curve — live in the Convert flyout; on a 40 × 20 × 10 block cut by the Front plane through its middle the top face gives a line 40 long and the side face one 10 long; a Ø10 cylinder square to the sketch gives a circle R5 at its axis; ✓ adds them held On Edge', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(BLOCK + ' p.sketch("Front").circle(40, 5, 5).extrude(20, { midplane: true });'); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    UI.setRibbonTab('Sketch'); UI.refreshRibbon();
    assert(dynFlyRow('convert', 'Intersection Curve'), 'Intersection Curve is live in the Convert flyout');
    var M = UI.App.mesh, top = faceWithNormal([0, 1, 0]), side = faceWithNormal([1, 0, 0]), cyl = -1;
    M.faces.forEach(function (fc, i) { var p = fc.polys && fc.polys[0]; if (cyl < 0 && p && p.surf && p.surf.s && p.surf.s.t === 'cyl') cyl = i; });
    assert(Math.abs(M.faces[top].centroid[1] - 10) < 1e-6 && Math.abs(M.faces[side].centroid[0] - 20) < 1e-6 && cyl >= 0, 'faces found: ' + [top, side, cyl]);
    UI.cmdIntersectionCurve([top, side, cyl]); await wait(20);
    assert(UI.pmTitle() === 'Intersection Curve' && stToolGroups().join('|') === 'Selections' && UI.intersectionCurveOpen(), 'PM ' + UI.pmTitle() + ' ' + stToolGroups().join('|'));
    var tmp = UI.App.tempEntities;
    assert(tmp.length === 3, 'previewed: ' + JSON.stringify(tmp));
    await pmAccept();
    var f = UI.activeSketchFeature(), lines = f.entities.filter(function (e) { return e.t === 'line'; }), circ = f.entities.filter(function (e) { return e.t === 'circle'; });
    function L(e) { return Math.hypot(e.x2 - e.x1, e.y2 - e.y1); }
    var lens = lines.map(L).sort(function (a, b) { return a - b; });
    assert(lines.length === 2 && Math.abs(lens[0] - 10) < 1e-6 && Math.abs(lens[1] - 40) < 1e-6, 'lines 10 and 40 long: ' + JSON.stringify(lines));
    var tl = lines.filter(function (e) { return Math.abs(L(e) - 40) < 1e-6; })[0];
    assert(Math.abs(tl.y1 - 10) < 1e-6 && Math.abs(tl.y2 - 10) < 1e-6 && Math.abs(Math.min(tl.x1, tl.x2) + 20) < 1e-6, 'the top face\'s line runs along y = 10 from x -20 to 20: ' + JSON.stringify(tl));
    assert(circ.length === 1 && Math.abs(circ[0].r - 5) < 1e-9 && Math.abs(circ[0].cx - 40) < 1e-9 && Math.abs(circ[0].cy - 5) < 1e-9, 'circle R5 at (40, 5): ' + JSON.stringify(circ));
    assert((f.rels || []).filter(function (r) { return r.type === 'onEdge'; }).length === 3 && UI.sketchStatus().status === 'full', 'held On Edge, Fully Defined: ' + stToolRels().join(' ') + ' ' + UI.sketchStatus().status);
    // a face the plane does not cut: nothing to add
    var bottomCap = -1;
    M.faces.forEach(function (fc, i) { if (bottomCap < 0 && Math.abs(fc.normal[2] - 1) < 1e-9 && Math.abs(fc.centroid[2] - 10) < 1e-6) bottomCap = i; });
    assert(bottomCap >= 0 && UI.intersectionCurveGeometry([bottomCap]).length === 0, 'the block\'s front face (z = 10) is not cut');
    return 'lines ' + lens.join(' / ') + ', circle R' + circ[0].r;
  });
  step('sketch-tools2: Sketch Fillet ▸ Fillet all corners of the chain — one click on a corner of a 40 × 20 rectangle with R 3 rounds all four corners: 4 arcs, one R dimension, 3 Equal relations, nothing over defined, one undo step', async function () {
    await rskNew();
    UI.App.view.showGrid = false;
    UI.setTool('rect'); rskClick([0, 0]); rskClick([40, 20]); UI.setTool('select');
    UI.cmdSketchFillet(); await wait(20);
    assert(stLabels().indexOf('Fillet all corners of the chain') >= 0 && UI.pmSpec().values.chain === false, 'the option, off by default: ' + stLabels().join('|'));
    UI.pmSetField('r', '3'); stCheck('chain');
    assert(UI.pmSpec().values.chain === true, 'chain on');
    var undo0 = UI.App.undo.length;
    rskClick([40, 20]); await wait(20);
    var f = UI.activeSketchFeature(), arcs = f.entities.filter(function (e) { return e.t === 'arc'; }), lines = f.entities.filter(function (e) { return e.t === 'line'; });
    assert(arcs.length === 4 && lines.length === 4 && arcs.every(function (a) { return Math.abs(a.r - 3) < 1e-9; }), '4 lines, 4 R3 arcs: ' + JSON.stringify(f.entities));
    assert((f.dims || []).filter(function (d) { return d.k === 'r'; }).length === 1, 'one R dimension: ' + JSON.stringify(f.dims));
    assert(stToolRels().filter(function (r) { return /^equal:/.test(r); }).length === 3, '3 Equal: ' + stToolRels().join(' '));
    var an = W.SketchSolver.analyze(f);
    assert(an.conflicts === 0 && an.status !== 'over', 'solvable: ' + an.status);
    stNoRedundant('fillet chain');
    assert(UI.App.undo.length === undo0 + 1 && D.querySelectorAll('#pm .pm-list .pm-item').length === 4, 'one undo step, four fillets listed: ' + (UI.App.undo.length - undo0));
    // R 15 does not fit the 20 high sides: nothing changes
    UI.pmCancel();
    f = UI.activeSketchFeature();
    assert(!f.entities.some(function (e) { return e.t === 'arc'; }), '✗ takes the chain back');
    UI.cmdSketchFillet(); UI.pmSetField('r', '15'); stCheck('chain');
    rskClick([40, 20]); await wait(20);
    f = UI.activeSketchFeature();
    assert(!f.entities.some(function (e) { return e.t === 'arc'; }), 'R 15 is refused all or nothing: ' + JSON.stringify(f.entities));
    UI.pmCancel();
    return '4 × R3, 1 dimension, 3 Equal';
  });
  step('sketch-tools2: 3 Point Arc Slot — a width click 1.5 from the third point (6 px) is taken (width 3), not snapped onto that point; a width click that would make the slot wider than the arc\'s diameter is refused with the reason in the status bar', async function () {
    await rskNew(); cvDefaults();
    UI.App.view.showGrid = false;
    UI.setTool('aslot3');
    assert(UI.App.tool === 'aslot3', 'tool ' + UI.App.tool);
    rskClick([-50, -10]); rskClick([-30, -10]); selEv('mousemove', rskScr([-40, 0])); rskClick([-40, 0]);
    selEv('mousemove', rskScr([-40, 12])); rskClick([-40, 12]);
    assert(rskEnts().length === 0 && /not taken/.test(statusText()), 'a click 22 from the centre (width 24 > Ø20) is refused with its reason: ' + statusText() + ' ' + JSON.stringify(rskEnts()));
    selEv('mousemove', rskScr([-40, 1.5])); rskClick([-40, 1.5]);
    var a = rfYSlotOf(rskEnts(), 0);
    assert(a && a.t === 'aslot' && Math.abs(a.w - 3) < 1e-9 && Math.abs(a.r - 10) < 1e-9, 'width 3 next to the third point: ' + JSON.stringify(rskEnts()) + ' status ' + statusText());
    selKey('Escape');
    cvDefaults();
    return 'W ' + a.w;
  });
  step('sketch-tools2: Trim ▸ Corner with a spline — an open spline and a line beyond its end meet (the spline carried on along its end span to the line, Coincident); a line crossing a spline cuts it back to the side clicked; the result is previewed first', async function () {
    await rskNew();
    var S = W.SketchSolver, f = fxSk([{ t: 'spline', pts: [[0, 0], [10, 5], [20, 0]] }, { t: 'line', x1: 30, y1: -10, x2: 30, y2: 10 }]);
    UI.cmdTrimEntities(); await wait(20);
    stRadio('mode', 'corner');
    var sp = S.freeCurve(f.entities[0]).pt(1.5);
    rskClick(sp);
    selEv('mousemove', rskScr([30, 5])); await wait(20);
    assert(D.querySelector('#dim-layer .sk-preview'), 'the corner is previewed');
    rskClick([30, 5]); await wait(20);
    f = UI.activeSketchFeature();
    var s = f.entities[0], l = f.entities[1], end = s.pts[s.pts.length - 1];
    assert(s.t === 'spline' && s.pts.length === 4 && Math.abs(end[0] - 30) < 1e-6 && Math.abs(l.x1 - end[0]) < 1e-6 && Math.abs(l.y1 - end[1]) < 1e-6, 'spline runs on to the line, the line ends there: ' + JSON.stringify(f.entities));
    assert(stToolRels().indexOf('coincident:0.p2,1.p1') >= 0, 'Coincident corner: ' + stToolRels().join(' '));
    stNoRedundant('spline corner');
    UI.pmOK();
    await rskNew();
    f = fxSk([{ t: 'spline', pts: [[0, 0], [10, 5], [20, 0]] }, { t: 'line', x1: 15, y1: -10, x2: 15, y2: 1 }]);
    UI.cmdTrimEntities(); await wait(20);
    stRadio('mode', 'corner');
    rskClick(S.freeCurve(f.entities[0]).pt(0.5)); rskClick([15, -5]); await wait(20);
    f = UI.activeSketchFeature();
    s = f.entities[0]; l = f.entities[1]; end = s.pts[s.pts.length - 1];
    assert(s.t === 'spline' && Math.abs(end[0] - 15) < 1e-6 && Math.abs(l.y2 - end[1]) < 1e-6 && Math.abs(l.x2 - 15) < 1e-6, 'spline cut back to the line (left side kept): ' + JSON.stringify(f.entities));
    assert(fxDev({ t: 'spline', pts: [[0, 0], [10, 5], [20, 0]] }, s) < 0.05, 'the piece keeps the spline\'s shape');
    stNoRedundant('spline corner cut');
    UI.pmOK();
    return 'carried on to x = 30; cut back at x = 15';
  });
  step('sketch-tools2: no uncaught errors or console.error calls in these steps', async function () {
    var mine = errors.slice(dynErr0);
    assert(!mine.length, mine.join(' | '));
    return 'clean';
  });
  // --- end sketch-tools2 ---

