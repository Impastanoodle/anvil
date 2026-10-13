  // --- refine/sketcher ---
  // Real mouse events in a sketch on the Front plane, positioned in sketch coordinates.
  function rskScr(uv) { return UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])); }
  function rskClick(uv) { selClick(rskScr(uv)); }
  function rskDbl(uv) { var p = rskScr(uv); selClick(p); selClick(p); selEv('dblclick', p, $('viewport')); }
  function rskEnts() { return UI.activeSketchFeature().entities; }
  async function rskNew() {
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    UI.zoomView(0.25 / UI.cam.scale);   // 0.25 mm per pixel: the test geometry (about 60 x 40) fills the view
    UI.App.gridStale = true;
  }
  step('refine/sketcher: Line tool chain — a double-click ends the chain without a zero-length line and keeps the Line tool; each segment is its own Ctrl+Z step and the sketch stays open; Ctrl+Y redoes', async function () {
    await rskNew();
    var undo0 = UI.App.undo.length;
    UI.setTool('line');
    rskClick([0, 0]); rskClick([40, 0]); rskClick([40, 30]); rskDbl([0, 30]);
    var ents = rskEnts();
    assert(ents.length === 3, 'three segments, got ' + ents.length + ': ' + JSON.stringify(ents));
    assert(ents.every(function (e) { return Math.hypot(e.x2 - e.x1, e.y2 - e.y1) > 1; }), 'a zero-length line was added');
    assert(UI.App.tool === 'line' && !UI.App.toolState.pts.length, 'the Line tool stays, chain ended: ' + UI.App.tool);
    assert(UI.App.undo.length === undo0 + 3, 'one undo step per segment: ' + (UI.App.undo.length - undo0));
    selKey('Escape');
    assert(UI.App.tool === 'select', 'Esc puts the tool down');
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); await idle();
    assert(UI.App.mode === 'sketch' && rskEnts().length === 2, 'Ctrl+Z removed the last segment only: ' + rskEnts().length);
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true, cancelable: true })); await idle();
    assert(rskEnts().length === 3, 'Ctrl+Y brings it back');
    return 'segments 3, undo steps ' + (UI.App.undo.length - undo0);
  });
  step('refine/sketcher: an end clicked on an existing line snaps onto it and gets a Coincident (point on line); Sketch Fillet on the corner of a Line-tool rectangle trims both lines and adds a tangent R arc (one undo step); the part extrudes', async function () {
    await rskNew();
    UI.setTool('line');
    rskClick([0, 0]); rskClick([40, 0]); rskClick([40, 20]); rskClick([0, 20]); rskClick([0, 0]);   // on the snap grid (multiples of 4)
    assert(rskEnts().length === 4 && !UI.App.toolState.pts.length, '4 lines, and closing the loop ended the chain');
    // a line starting on the bottom edge, between grid points (screen-space snap to the curve)
    var a = rskScr([0, 0]), b = rskScr([40, 0]), on = [a[0] + (b[0] - a[0]) * 0.37, a[1]];
    selClick(on); rskDbl([13, -20]);
    var f = UI.activeSketchFeature(), rl = (f.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); });
    assert(rl.indexOf('coincident:4.p1,0') >= 0, 'point-on-line Coincident: ' + rl.join(' '));
    near(rskEnts()[4].y1, 0, 1e-9, 'snapped onto the line');
    UI.App.sel = { kind: 'entity', index: 4 }; selKey('Delete');
    assert(rskEnts().length === 4, 'deleted the extra line');
    UI.setTool('select');
    UI.cmdSketchFillet(); UI.pmSetField('r', '5');
    var undo0 = UI.App.undo.length;
    rskClick([39, 1]);
    var arc = rskEnts().filter(function (e) { return e.t === 'arc'; })[0];
    assert(arc && Math.abs(arc.r - 5) < 1e-9 && Math.abs(arc.cx - 35) < 1e-9 && Math.abs(arc.cy - 5) < 1e-9, 'fillet arc ' + JSON.stringify(arc));
    assert(UI.App.undo.length === undo0 + 1, 'one undo step');
    var st = UI.sketchStatus();
    assert(st.status === 'under' && st.dof === 2 && st.rels.every(function (s) { return s === 'ok'; }), 'status ' + JSON.stringify(st));
    UI.pmOK();
    UI.exitSketch(); await idle();
    var sk = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    await anvil.append('p.extrude(10, { sketch: ' + sk.id + ' });'); await idle();
    var exp = 40 * 20 * 10 - (1 - Math.PI / 4) * 250;
    near(anvil.summary().volume, exp, exp * 3e-3, 'volume');
    return 'volume ' + anvil.summary().volume.toFixed(2) + ' (exact ' + exp.toFixed(2) + ')';
  });
  step('refine/sketcher: dragging a circle by its edge changes its radius, by its centre moves it; a dimension value the sketch cannot take names the dimension it conflicts with', async function () {
    await rskNew();
    UI.setTool('circle'); rskClick([0, 0]); rskClick([20, 0]);
    UI.setTool('select');
    var c = rskEnts()[0];
    near(c.r, 20, 1e-9, 'drawn radius');
    var s0 = UI.cam.scale;
    await selDrag(rskScr([0, 20]), rskScr([0, 30]));
    c = rskEnts()[0];
    near(c.cx, 0, 1e-9, 'centre held (on the origin)'); near(c.r, 30, 2 * s0, 'radius follows the edge');
    // a horizontal line with a length; a vertical distance of 5 on it cannot be reached
    UI.setTool('line'); rskClick([40, 0]); rskDbl([60, 0]);
    UI.setTool('select');
    var f = UI.activeSketchFeature();
    (f.dims = f.dims || []).push({ e: 1, k: 'dy', off: 5 });
    var r = UI.editDim(f.dims.length - 1, '5');
    assert(!r.ok && /Horizontal: Line2/.test(r.error), 'message: ' + JSON.stringify(r));
    UI.cancelDimEdit();
    return r.error;
  });
  step('refine/sketcher: Sketch Fillet on a corner of a Corner Rectangle turns it into four lines (H/V, corner Coincidents) and rounds the corner with a tangent arc; Trim on one of its edges keeps the others\' relations', async function () {
    await rskNew();
    UI.setTool('rect'); rskClick([0, 0]); rskClick([40, 30]);
    // lane C, fidelity #13: the Corner Rectangle is four lines from the start
    var r0 = { x: 0, y: 0, w: 40, h: 30 };
    assert(rskEnts().map(function (e) { return e.t; }).join() === 'line,line,line,line', 'a rectangle (four lines)');
    UI.setTool('select');
    UI.cmdSketchFillet(); UI.pmSetField('r', '4');
    rskClick([r0.x + r0.w, r0.y + r0.h]);
    UI.pmOK();
    var kinds = rskEnts().map(function (e) { return e.t; }).join(',');
    assert(kinds === 'line,line,line,line,arc', 'entities ' + kinds);
    var st = UI.sketchStatus();
    assert(st.rels.every(function (s) { return s === 'ok'; }) && st.status === 'under', 'status ' + JSON.stringify(st));
    var w = rskEnts()[0].x2 - rskEnts()[0].x1;
    UI.cmdTrimEntities(); rskClick([0, r0.h / 2]); UI.pmOK();
    kinds = rskEnts().map(function (e) { return e.t; }).join(',');
    assert(kinds === 'line,line,line,arc', 'after trim ' + kinds);
    var f = UI.activeSketchFeature(), rl = (f.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); });
    assert(rl.indexOf('horizontal:0') >= 0 && rl.indexOf('vertical:1') >= 0 && rl.indexOf('tangent:1,3') >= 0, rl.join(' '));
    near(rskEnts()[0].x2 - rskEnts()[0].x1, w, 1e-9, 'bottom unchanged');
    return kinds + ' · ' + rl.length + ' relations';
  });
  step('refine/sketcher: Offset Entities on a selected circle gives a concentric circle (not a polyline), one undo step; Mirror Entities about a centerline holds the copy Symmetric', async function () {
    await rskNew();
    UI.setTool('circle'); rskClick([20, 0]); rskClick([28, 0]);
    UI.setTool('select');
    rskClick([28, 0]);
    assert(UI.App.sel && UI.App.sel.kind === 'entity' && UI.App.sel.index === 0, 'circle selected: ' + JSON.stringify(UI.App.sel));
    var undo0 = UI.App.undo.length;
    UI.cmdOffsetEntities(); UI.pmSetField('d', '3'); await wait(20);
    UI.pmOK();
    var e = rskEnts();
    assert(e.length === 2 && e[1].t === 'circle' && Math.abs(e[1].r - 11) < 1e-9 && e[1].cx === 20, 'offset ' + JSON.stringify(e[1]));
    var f = UI.activeSketchFeature(), rl = (f.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); });
    assert(rl.indexOf('concentric:0,1') >= 0, 'concentric: ' + rl.join(' '));
    assert(UI.App.undo.length === undo0 + 1, 'one undo step: ' + (UI.App.undo.length - undo0));
    UI.cmdCenterline(); rskClick([0, -24]); rskDbl([0, 24]);
    selKey('Escape');
    UI.App.sel = { kind: 'entity', index: 0 };
    UI.cmdMirrorEntities();
    var sel = D.querySelector('#pm select');
    sel.value = '2'; sel.dispatchEvent(new W.Event('change', { bubbles: true }));
    UI.pmOK();
    e = rskEnts();
    assert(e.length === 4 && e[3].t === 'circle' && Math.abs(e[3].cx + 20) < 1e-9, 'mirrored ' + JSON.stringify(e[3]));
    rl = (f.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); });
    assert(rl.indexOf('symmetric:0,3,2') >= 0, 'symmetric: ' + rl.join(' '));
    return rl.join(' ');
  });
  step('Linear Sketch Pattern patterns only the selected entities (no everything fallback), copies sit spacing away from the seed, and a driving distance dimension reads seed centre to copy centre', async function () {
    await anvil.run('p.name("PatTest"); p.sketch("Front").circle(30, 20, 5).circle(60, 20, 5);');
    var f = UI.App.model.features[0];
    UI.editSketch(f.id); await idle();
    UI.App.sel = null; if (UI.setSelection) UI.setSelection([]);
    UI.cmdSketchPattern();
    assert(UI.hasPM() && UI.pmTitle() === 'Linear Pattern', 'PM open');
    assert(UI.App.tempEntities.length === 0, 'nothing selected: no preview, not every entity (' + UI.App.tempEntities.length + ')');
    var r = UI.pmOK(); if (r && r.then) await r;
    assert(UI.hasPM() && f.entities.length === 2, 'OK with nothing selected is refused');
    UI.App.sel = { kind: 'entity', index: 0 }; if (UI.setSelection) UI.setSelection([{ kind: 'entity', index: 0 }]);
    if (UI.onSelectionChanged) UI.onSelectionChanged();
    await wait(20);
    assert(UI.App.tempEntities.length === 2 && Math.abs(UI.App.tempEntities[0].cx - 50) < 1e-9 && Math.abs(UI.App.tempEntities[1].cx - 70) < 1e-9, 'only the selected circle, copies at 50 and 70: ' + JSON.stringify(UI.App.tempEntities.map(function (e) { return [e.t, e.cx, e.cy]; })));
    var undo0 = UI.App.undo.length;
    await pmAccept();
    assert(f.entities.length === 4 && f.entities[2].t === 'circle' && Math.abs(f.entities[2].cx - 50) < 1e-9 && Math.abs(f.entities[2].cy - 20) < 1e-9, 'two copies added: ' + f.entities.length);
    var dims = (f.rels || []).filter(function (x) { return x.type === 'distance'; });
    assert(dims.length === 1 && dims[0].refs.join() === '0.c,2.c' && dims[0].dir === 'h' && Math.abs(dims[0].v - 20) < 1e-9, 'spacing dimension from the seed centre to the first copy centre: ' + JSON.stringify(dims));
    assert(UI.App.undo.length === undo0 + 1, 'one undo step');
    // the selection is consumed by the command: nothing selected after ✓, and after ✗ too (r15/sketchsel15)
    assert(!(UI.App.sel && UI.App.sel.kind === 'entity') && !UI.selection().some(function (x) { return x.kind === 'entity'; }), 'selection cleared after OK');
    UI.setSelection([{ kind: 'entity', index: 1 }]); UI.cmdSketchPattern(); await wait(20); UI.pmCancel(); await wait(20);
    assert(!(UI.App.sel && UI.App.sel.kind === 'entity') && !UI.selection().some(function (x) { return x.kind === 'entity'; }), 'selection cleared after Cancel');
    UI.exitSketch(true); await idle();
    return 'copies at x = 50, 70; distance 0.c -> 2.c = 20 (horizontal); selection consumed';
  });
  step('true circles on screen: a sketch circle is tessellated for the zoom (sagitta under 0.2 px, 32+ segments), redrawn finer when zooming in; the kernel tessellation is untouched afterwards', async function () {
    await anvil.run('p.name("Circ"); p.sketch("Front").circle(0, 0, 5);');
    var f = UI.App.model.features[0];
    UI.editSketch(f.id); await idle();
    var tess0 = K.setTessellation({});
    function segsAt() { return UI.screenPolylines(f.entities[0])[0].pts.length; }
    function sagPx(n) { var rPx = 5 / UI.cam.scale; return rPx * (1 - Math.cos(Math.PI / n)); }
    UI.zoomView(0.05 / UI.cam.scale); await idle();   // 0.05 mm per px: r = 100 px
    var n1 = segsAt();
    assert(n1 >= 32 && sagPx(n1) < 0.2, 'r = 100 px: ' + n1 + ' segments, sagitta ' + sagPx(n1).toFixed(3) + ' px');
    UI.zoomView(0.005 / UI.cam.scale); await idle();   // 10x closer: r = 1000 px
    var n2 = segsAt();
    assert(n2 > n1 && sagPx(n2) < 0.2 && n2 <= 2048, 'r = 1000 px: ' + n2 + ' segments (was ' + n1 + '), sagitta ' + sagPx(n2).toFixed(3) + ' px');
    var tess1 = K.setTessellation({});
    assert(tess1.chordTol === tess0.chordTol && tess1.minSegs === tess0.minSegs && tess1.maxSegs === tess0.maxSegs, 'kernel tessellation restored: ' + JSON.stringify(tess1));
    assert(K.entityPolylines(f.entities[0])[0].pts.length === 24, 'the model-side polyline is still 24-sided for the profile (' + K.entityPolylines(f.entities[0])[0].pts.length + ')');
    UI.zoomToFit(); UI.exitSketch(true); await idle();
    return 'r = 100 px: ' + n1 + ' segs; r = 1000 px: ' + n2 + ' segs';
  });
  // --- end refine/sketcher ---
