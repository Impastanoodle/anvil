  // --- rfCY (2026-10-20, lane CY: sketch follow-ups from QUEUE.md 2026-10-07T13 / T14) --- (1) trims, Extend and Sketch
  // Fillet keep the entity's layer (the fillet arc takes the layer of the entities it joins; a rounded closed polyline
  // stays on its layer); (2) a real box drag in a sketch skips a hidden layer; (3) Paste from an inch part into a mm part
  // scales a Sketch Text (letter height, outline stroke), a spline's curvature control and an arc-length dimension;
  // (4) a dragged sketch end snaps onto a model edge (no relation), Ctrl drops the snap; (5) Ctrl while drawing places the
  // point where it is (no snap to a model corner, no inferred relation); (6) Fillet Chain from one entity: with the chain
  // option a click on a line (or a rectangle's side) rounds every corner of its chain, and a double-click on an entity
  // does it without the option. Uses rskNew / rskClick / rskScr / rskEnts (refine-sketcher), selClick / selEv / selDrag
  // (selection), fxSk (sketch-refine), stRadio / stToolRels (sketch-tools), lyrPart (sketch-layers), msBox (p9-modelsnap).
  function rfCYLayers(f) { f.layers = [{ name: 'CUT', color: '#e03030' }, { name: 'BEND', color: '#3060e0' }]; }
  // the entities pushed into the open sketch with the CUT and BEND layers made first (a layer the sketch does not list is
  // dropped from its entities when the sketch is redrawn)
  function rfCYSk(ents, hide) { var f = UI.activeSketchFeature(); rfCYLayers(f); if (hide) f.layers[1].hidden = true; return fxSk(ents); }
  function rfCYLay(f) { return f.entities.map(function (e) { return e.t + ':' + (e.layer || '-') + (e.construction ? 'C' : ''); }).join(' '); }
  function rfCYChain(on) { var cb = D.querySelector('#pm input[type="checkbox"][data-key="chain"]'); assert(cb, 'no chain check box'); if (cb.checked !== on) cb.click(); }
  function rfCYArcs(f) { return f.entities.filter(function (e) { return e.t === 'arc'; }); }
  function rfCYDbl(uv) { var p = rskScr(uv); selClick(p); selClick(p); selEv('dblclick', p, $('viewport')); }

  step('rfCY: trims keep the layer — Trim to closest on a CUT line leaves its piece on CUT (a construction line on BEND stays construction on BEND), Extend keeps CUT, a Sketch Fillet between two CUT lines makes a CUT arc (one CUT, one default line: the arc stays default), a rounded closed CUT polyline stays on CUT', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.App.view.showGrid = false;
    var f = rfCYSk([{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0, layer: 'CUT' }, { t: 'line', x1: 20, y1: -10, x2: 20, y2: 10 },
      { t: 'line', x1: 0, y1: 20, x2: 40, y2: 20, layer: 'BEND', construction: true }, { t: 'line', x1: 30, y1: 15, x2: 30, y2: 25 }]);
    UI.cmdTrimEntities(); await wait(20); stRadio('mode', 'closest');
    rskClick([32, 0]); await idle();
    f = UI.activeSketchFeature();
    rskClick([36, 20]); await idle();
    f = UI.activeSketchFeature();
    var cut = f.entities.filter(function (e) { return e.t === 'line' && e.y1 === 0 && e.y2 === 0; }), bend = f.entities.filter(function (e) { return e.t === 'line' && e.y1 === 20 && e.y2 === 20; });
    assert(cut.length === 1 && cut[0].layer === 'CUT' && Math.max(cut[0].x1, cut[0].x2) === 20, 'the CUT piece: ' + rfCYLay(f) + ' ' + JSON.stringify(cut));
    assert(bend.length === 1 && bend[0].layer === 'BEND' && bend[0].construction === true && Math.max(bend[0].x1, bend[0].x2) === 30, 'the BEND construction piece: ' + JSON.stringify(bend));
    UI.pmOK(); await idle();
    // Extend: a short CUT line to a line ahead of it
    await rskNew();
    f = rfCYSk([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0, layer: 'CUT' }, { t: 'line', x1: 30, y1: -10, x2: 30, y2: 10 }]);
    var r = W.SketchSolver.extendEntity(f, 0, [19, 0]);
    assert(r && r.ok !== false && f.entities[0].x2 === 30 && f.entities[0].layer === 'CUT', 'extended on CUT: ' + JSON.stringify(f.entities[0]) + ' ' + JSON.stringify(r));
    // Sketch Fillet: an L of two CUT lines, and an L of a CUT line and a default one
    await rskNew();
    f = rfCYSk([{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0, layer: 'CUT' }, { t: 'line', x1: 40, y1: 0, x2: 40, y2: 30, layer: 'CUT' },
      { t: 'line', x1: 0, y1: 50, x2: 40, y2: 50, layer: 'CUT' }, { t: 'line', x1: 40, y1: 50, x2: 40, y2: 80 },
      { t: 'polyline', pts: [[60, 0], [90, 0], [90, 30], [60, 30]], closed: true, layer: 'BEND' }]);
    UI.cmdSketchFillet(); await wait(20); UI.pmSetField('r', '4'); await wait(10);
    rskClick([40, 0]); await idle();
    rskClick([40, 50]); await idle();
    rskClick([90, 30]); await idle();
    f = UI.activeSketchFeature();
    var arcs = rfCYArcs(f);
    assert(arcs.length === 2, 'two fillet arcs: ' + rfCYLay(f));
    var a0 = arcs.filter(function (a) { return a.cy < 25; })[0], a1 = arcs.filter(function (a) { return a.cy > 25; })[0];
    assert(a0 && a0.layer === 'CUT', 'the fillet between two CUT lines is on CUT: ' + JSON.stringify(a0));
    assert(a1 && a1.layer == null, 'between a CUT and a default line it stays default: ' + JSON.stringify(a1));
    var pl = f.entities.filter(function (e) { return e.t === 'polyline'; })[0];
    assert(pl && pl.layer === 'BEND' && pl.closed && pl.pts.length > 4, 'the rounded polyline stays on BEND: ' + JSON.stringify(pl));
    // a value change re-makes the fillets: still on CUT
    UI.pmSetField('r', '5'); await idle();
    f = UI.activeSketchFeature();
    a0 = rfCYArcs(f).filter(function (a) { return a.cy < 25; })[0];
    assert(a0 && Math.abs(a0.r - 5) < 1e-9 && a0.layer === 'CUT', 'R5 re-made on CUT: ' + JSON.stringify(a0));
    UI.pmOK(); await idle();
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return rfCYLay(UI.activeSketchFeature());
  });

  step('rfCY: a box dragged with the mouse in a sketch (Select tool) skips entities on a hidden layer — window and crossing; shown again, the same drag takes them', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.App.view.showGrid = false;
    var f = rfCYSk([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }, { t: 'circle', cx: 10, cy: 10, r: 4, layer: 'BEND' }, { t: 'line', x1: 0, y1: 20, x2: 20, y2: 20, layer: 'BEND' }], true);
    UI.setTool('select'); UI.setSelection([]);
    function picked() { return anvil.selection().filter(function (s) { return s.kind === 'entity'; }).map(function (s) { return s.index; }).sort().join(); }
    await selDrag(rskScr([-5, 25]), rskScr([25, -5])); await idle();
    var win = picked();
    UI.setSelection([]);
    await selDrag(rskScr([15, 22]), rskScr([5, -2])); await idle();   // right to left: crossing all three
    var crs = picked();
    assert(win === '0' && crs === '0', 'BEND hidden: window ' + win + ', crossing ' + crs);
    f.layers[1].hidden = false; UI.updateSketches(); UI.setSelection([]);
    await selDrag(rskScr([-5, 25]), rskScr([25, -5])); await idle();
    win = picked();
    assert(win === '0,1,2', 'BEND shown: ' + win);
    UI.setSelection([]);
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'hidden: 0; shown: ' + win;
  });

  step('rfCY: Paste from an inch part into a mm part scales a Sketch Text (height .25 in -> 6.35 mm, outline stroke .02 in -> .508 mm), a spline\'s curvature control (1 / R scales 1 / 25.4) and an arc-length dimension (1 in -> 25.4 mm); back into an inch part they are as copied', async function () {
    var errs0 = errors.length;
    try { W.localStorage.removeItem('anvil.sketchClipboard'); } catch (e) { }
    var f1 = await lyrPart('p.units("in"); p.sketch("Front", 0, "CYin").point(-3, -3);', 'CYin');
    var arcSweep = 1 / 0.75 * 180 / Math.PI;   // a 1 in arc of R .75
    f1.entities.push({ t: 'text', x: 0, y: 0, h: 0.25, str: 'AB', mode: 'outline', strokeWidth: 0.02 });
    f1.entities.push({ t: 'spline', pts: [[0, 1], [1, 1.5], [2, 1]], tans: [null, [0, 1, 1, 0.5], null] });
    f1.entities.push({ t: 'arc', cx: 3, cy: 0, r: 0.75, a0: 0, a1: arcSweep });
    f1.rels = [{ type: 'arclength', refs: ['3'], v: 1 }];
    UI.updateSketches();
    UI.setSelection([1, 2, 3].map(function (i) { return { kind: 'entity', index: i }; }));
    var cp = UI.sketchCopy();
    assert(cp && cp.entities === 3 && cp.rels === 1, 'copied ' + JSON.stringify(cp));
    await UI.exitSketch(true); await idle();
    var f2 = await lyrPart('p.units("mm"); p.sketch("Front", 0, "CYmm").point(-80, -80);', 'CYmm');
    var r = UI.sketchPaste([0, 0]); await idle();
    assert(r && Math.abs(r.scale - 25.4) < 1e-12, 'paste ' + JSON.stringify(r));
    var t = f2.entities[1], s = f2.entities[2], a = f2.entities[3];
    near(t.h, 6.35, 1e-9, 'text height'); near(t.strokeWidth, 0.508, 1e-9, 'outline stroke');
    assert(s.tans && s.tans[1], 'spline tans ' + JSON.stringify(s.tans));
    near(s.tans[1][3], 0.5 / 25.4, 1e-12, 'curvature control'); near(s.tans[1][0], 0, 1e-12, 'tangent direction kept'); near(s.tans[1][1], 1, 1e-12, 'weight kept');
    near(a.r, 0.75 * 25.4, 1e-9, 'arc radius');
    var al = (f2.rels || []).filter(function (x) { return x.type === 'arclength'; })[0];
    assert(al, 'arc length relation pasted ' + JSON.stringify(f2.rels));
    near(al.v, 25.4, 1e-9, 'arc length value');
    near(a.r * (a.a1 - a.a0) * Math.PI / 180, 25.4, 1e-6, 'the arc is 25.4 mm long');
    await UI.exitSketch(true); await idle();
    var f3 = await lyrPart('p.units("in"); p.sketch("Front", 0, "CYin2").point(-3, -3);', 'CYin2');
    r = UI.sketchPaste([0, 0]); await idle();
    assert(r && r.scale === 1 && Math.abs(f3.entities[1].h - 0.25) < 1e-12 && Math.abs(f3.entities[2].tans[1][3] - 0.5) < 1e-12, 'inch to inch unscaled ' + JSON.stringify(f3.entities.slice(1, 3)));
    await UI.exitSketch(true); await idle();
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'text 6.35 mm, curvature ' + fmt(0.5 / 25.4 * 1000) + 'e-3, arc 25.4 mm';
  });

  step('rfCY: dragging a sketch line\'s end onto a model edge (3 px off the box\'s top edge) lands it exactly on the edge with no relation; with Ctrl held it lands where it is dropped; dragged to 3 px off another sketch point it merges (Coincident), with Ctrl it does not', async function () {
    var errs0 = errors.length;
    var f = await msBox('{ face: b, normal: [0, 0, 1] }, 0', 'CYDrag');
    f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 30, y1: 30, x2: 50, y2: 40 }, { t: 'point', x: 70, y: 20 }, { t: 'point', x: 80, y: 45 });
    UI.updateSketches();
    var i = f.entities.length - 3, r0 = (f.rels || []).length;
    UI.setTool('select');
    var e = rskScr([45, 60]);
    await selDrag(rskScr([50, 40]), [e[0], e[1] + 3]);
    f = UI.activeSketchFeature();
    assert(Math.abs(f.entities[i].y2 - 60) < 1e-9 && (f.rels || []).length === r0, 'on the top edge, no relation: ' + JSON.stringify(f.entities[i]) + ' ' + JSON.stringify(f.rels));
    var e2 = rskScr([45, 55]);
    await selDrag(rskScr([f.entities[i].x2, f.entities[i].y2]), [e2[0], e2[1]]);
    await selDrag(rskScr([f.entities[i].x2, f.entities[i].y2]), [rskScr([45, 60])[0], rskScr([45, 60])[1] + 3], null, { ctrlKey: true });
    f = UI.activeSketchFeature();
    assert(Math.abs(f.entities[i].y2 - 60) > 0.3, 'Ctrl: not on the edge: ' + JSON.stringify(f.entities[i]));
    var q = rskScr([70, 20]), q2 = rskScr([80, 45]);
    await selDrag(rskScr([f.entities[i].x2, f.entities[i].y2]), [q2[0] + 3, q2[1] + 2], null, { ctrlKey: true });
    f = UI.activeSketchFeature();
    assert(Math.abs(f.entities[i].x2 - 80) > 0.3 && !(f.rels || []).some(function (x) { return x.type === 'coincident'; }), 'Ctrl: no merge with the point: ' + JSON.stringify(f.entities[i]) + ' ' + JSON.stringify(f.rels));
    await selDrag(rskScr([f.entities[i].x2, f.entities[i].y2]), [q[0] + 3, q[1] + 2]);
    f = UI.activeSketchFeature();
    assert(f.entities[i].x2 === 70 && f.entities[i].y2 === 20 && (f.rels || []).some(function (x) { return x.type === 'coincident'; }), 'merged with the point: ' + JSON.stringify(f.entities.slice(i)) + ' ' + JSON.stringify(f.rels) + ' ' + $('status-msg').textContent);
    UI.exitSketch(true); await idle();
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'edge, Ctrl free, merge';
  });

  step('rfCY: Ctrl while drawing — a Line ended 3 px off the box\'s corner snaps to it without Ctrl; with Ctrl held (moving and clicking) the end stays where it is clicked, and a nearly horizontal Line drawn with Ctrl gets no Horizontal relation', async function () {
    var errs0 = errors.length;
    await msBox('{ face: b, normal: [0, 0, 1] }, 0', 'CYCtrl');
    var f = UI.activeSketchFeature(), n0 = f.entities.length;
    UI.App.view.showGrid = false;
    UI.setTool('line');
    var c = rskScr([100, 60]);
    rskClick([70, 40]); selClick([c[0] - 3, c[1] + 2]); rskDbl([100, 60]);
    f = UI.activeSketchFeature();
    var l = f.entities[n0];
    assert(l && l.t === 'line' && l.x2 === 100 && l.y2 === 60, 'snapped to the corner: ' + JSON.stringify(l));
    UI.setTool('select'); UI.setTool('line');
    var n1 = f.entities.length, r1 = (f.rels || []).length;
    rskClick([60, 20]);
    selClick([c[0] - 3, c[1] + 2], { ctrlKey: true });
    f = UI.activeSketchFeature();
    var l2 = f.entities[n1];
    assert(l2 && l2.t === 'line' && Math.abs(l2.x2 - 100) > 0.3 && Math.abs(l2.y2 - 60) > 0.3, 'Ctrl: the end stays off the corner: ' + JSON.stringify(l2));
    UI.setTool('select'); UI.setTool('line');
    var n2 = f.entities.length;
    var h0 = rskScr([10, 30]), h1 = rskScr([50, 30]);
    // (2 px off level: lane swribbon's whole-pixel graphics area top made a 1 px offset round back onto y = 30)
    selClick(h0, { ctrlKey: true }); selClick([h1[0], h1[1] - 2], { ctrlKey: true });
    f = UI.activeSketchFeature();
    var l3 = f.entities[n2];
    assert(l3 && l3.t === 'line' && l3.y2 !== l3.y1, 'Ctrl: not squared to horizontal: ' + JSON.stringify(l3));
    assert(!(f.rels || []).some(function (x) { return x.type === 'horizontal' && x.refs.indexOf(String(n2)) >= 0; }), 'Ctrl: no Horizontal: ' + JSON.stringify(f.rels));
    UI.setTool('select');
    UI.exitSketch(true); await idle();
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'snap, Ctrl free, Ctrl no Horizontal';
  });

  step('rfCY: Fillet Chain from one entity — with "Fillet all corners of the chain" a click on the bottom line of a 4-line outline rounds all 4 corners (Equal to the first), a click on a rectangle\'s side rounds its 4; without the option a double-click on a line of an open 3-line chain rounds its 2 corners, and ✗ puts everything back', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.App.view.showGrid = false;
    var f = fxSk([{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'line', x1: 40, y1: 0, x2: 40, y2: 30 }, { t: 'line', x1: 40, y1: 30, x2: 0, y2: 30 }, { t: 'line', x1: 0, y1: 30, x2: 0, y2: 0 },
      { t: 'rect', x: 60, y: 0, w: 30, h: 20 }]);
    UI.cmdSketchFillet(); await wait(20); UI.pmSetField('r', '3'); await wait(10);
    rfCYChain(true);
    rskClick([20, 0]); await idle();
    f = UI.activeSketchFeature();
    var arcs = rfCYArcs(f);
    assert(arcs.length === 4 && arcs.every(function (a) { return Math.abs(a.r - 3) < 1e-6; }), 'four R3 arcs on the outline: ' + JSON.stringify(arcs));
    assert(stToolRels().filter(function (x) { return /^equal:/.test(x); }).length === 3, 'Equal to the first: ' + stToolRels().join(' '));
    rskClick([75, 0]); await idle();
    f = UI.activeSketchFeature();
    arcs = rfCYArcs(f);
    assert(arcs.length === 8 && !f.entities.some(function (e) { return e.t === 'rect'; }), 'the rectangle\'s four corners too: ' + rfCYLay(f));
    UI.pmOK(); await idle();
    // without the option: a double-click on the middle line of an open U
    await rskNew();
    f = fxSk([{ t: 'line', x1: 0, y1: 30, x2: 0, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'line', x1: 40, y1: 0, x2: 40, y2: 30 }, { t: 'line', x1: 60, y1: 0, x2: 80, y2: 0 }]);
    var snap0 = JSON.stringify(f.entities);
    UI.cmdSketchFillet(); await wait(20); UI.pmSetField('r', '3'); await wait(10);
    rfCYChain(false);
    rfCYDbl([20, 0]); await idle();
    f = UI.activeSketchFeature();
    arcs = rfCYArcs(f);
    assert(arcs.length === 2, 'double-click: the U\'s two corners: ' + rfCYLay(f));
    var items = D.querySelectorAll('#pm .pm-pick-item, #pm .pm-list li');
    // a lone line has no chain: the status says so and nothing is made
    rfCYDbl([70, 0]); await idle();
    f = UI.activeSketchFeature();
    assert(rfCYArcs(f).length === 2 && /no chain/i.test($('status-msg').textContent), 'a lone line: ' + $('status-msg').textContent);
    UI.pmCancel ? UI.pmCancel() : clickPmButton('✕'); await idle();
    f = UI.activeSketchFeature();
    assert(JSON.stringify(f.entities) === snap0, '✗ put the sketch back: ' + rfCYLay(f));
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'chain 4 + rect 4, double-click 2 (' + items.length + ' rows)';
  });

  // found sketching around the fixes (head, 2026-10-20): what a hidden layer holds cannot be seen, so it is neither
  // trimmed by a Power trim drag, nor a target Extend grows to, nor a point a dragged end merges with
  step('rfCY: a hidden layer is left alone — a Power trim drag across a hidden BEND line and a shown line trims only the shown one; Extend grows a CUT line past a hidden BEND line to the next shown line; a line end dragged 3 px off a hidden point does not merge with it', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.App.view.showGrid = false;
    var f = rfCYSk([{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0, layer: 'BEND' }, { t: 'line', x1: 20, y1: -10, x2: 20, y2: 10 }, { t: 'line', x1: 0, y1: 5, x2: 40, y2: 5 }], true);
    UI.cmdTrimEntities(); await wait(20); stRadio('mode', 'power');
    await selDrag(rskScr([30, -3]), rskScr([30, 8]));
    f = UI.activeSketchFeature();
    assert(f.entities[0].layer === 'BEND' && f.entities[0].x1 === 0 && f.entities[0].x2 === 40, 'the hidden line is whole: ' + rfCYLay(f) + ' ' + JSON.stringify(f.entities[0]));
    assert(f.entities.some(function (e) { return e.y1 === 5 && e.y2 === 5 && Math.max(e.x1, e.x2) === 20; }), 'the shown line was trimmed: ' + JSON.stringify(f.entities));
    UI.pmOK(); await idle();
    await rskNew();
    UI.App.view.showGrid = false;
    f = rfCYSk([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0, layer: 'CUT' }, { t: 'line', x1: 30, y1: -10, x2: 30, y2: 10, layer: 'BEND' }, { t: 'line', x1: 40, y1: -10, x2: 40, y2: 10 }], true);
    UI.cmdExtendEntities(); await wait(20);
    rskClick([18, 0]); await idle();
    f = UI.activeSketchFeature();
    assert(f.entities[0].x2 === 40 && f.entities[0].layer === 'CUT', 'extended past the hidden line to x = 40: ' + JSON.stringify(f.entities[0]));
    UI.pmOK(); await idle();
    // shown again, the BEND line is the target
    await rskNew();
    UI.App.view.showGrid = false;
    f = rfCYSk([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0, layer: 'CUT' }, { t: 'line', x1: 30, y1: -10, x2: 30, y2: 10, layer: 'BEND' }, { t: 'line', x1: 40, y1: -10, x2: 40, y2: 10 }]);
    UI.cmdExtendEntities(); await wait(20);
    rskClick([18, 0]); await idle();
    f = UI.activeSketchFeature();
    assert(f.entities[0].x2 === 30, 'BEND shown: extended to x = 30: ' + JSON.stringify(f.entities[0]));
    UI.pmOK(); await idle();
    await rskNew();
    UI.App.view.showGrid = false;
    f = rfCYSk([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }, { t: 'point', x: 30, y: 10, layer: 'BEND' }], true);
    UI.setTool('select');
    var q = rskScr([30, 10]);
    await selDrag(rskScr([20, 0]), [q[0] + 2, q[1] + 2]); await idle();
    f = UI.activeSketchFeature();
    assert(!(f.rels || []).length && Math.abs(f.entities[0].x2 - 30) > 0.2, 'no merge with the hidden point: ' + JSON.stringify(f.entities[0]) + ' ' + JSON.stringify(f.rels));
    UI.exitSketch(true); await idle();
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'power trim, extend, drag leave the hidden layer alone';
  });

  // lane CY2 (2026-10-20): Ctrl+Z inside a sketch tool that commits per click undoes its last edit and keeps it open, as
  // SolidWorks does; with nothing of its own left it cancels the tool (rfCM); feature PropertyManagers keep rfCM's rule
  function rfCYZ(k) { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: k || 'z', ctrlKey: true, bubbles: true, cancelable: true })); }
  function rfCYLines(f) { return f.entities.filter(function (e) { return e.t === 'line'; }).map(function (e) { return [e.x1, e.y1, e.x2, e.y2].join(','); }).sort().join(' | '); }
  step('rfCY2: Trim Entities — two trims, Ctrl+Z undoes the second and Trim stays open, Ctrl+Z the first (still open), Ctrl+Y redoes it, a click trims again on the restored sketch; once nothing of its own is left Ctrl+Z cancels Trim and the sketch is as it was', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.App.view.showGrid = false;
    var f = fxSk([{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'line', x1: 10, y1: -10, x2: 10, y2: 10 }, { t: 'line', x1: 20, y1: -10, x2: 20, y2: 10 }]);
    var orig = rfCYLines(f);
    UI.cmdTrimEntities(); await wait(20); stRadio('mode', 'closest');
    rskClick([30, 0]); await idle();
    var one = rfCYLines(UI.activeSketchFeature());
    rskClick([15, 0]); await idle();
    var two = rfCYLines(UI.activeSketchFeature());
    assert(one !== orig && two !== one, 'two trims: ' + one + ' / ' + two);
    rfCYZ(); await idle();
    assert(UI.pmTitle() === 'Trim Entities' && rfCYLines(UI.activeSketchFeature()) === one, 'Ctrl+Z: the second trim undone, Trim open: ' + UI.pmTitle() + ' ' + rfCYLines(UI.activeSketchFeature()));
    rfCYZ(); await idle();
    assert(UI.pmTitle() === 'Trim Entities' && rfCYLines(UI.activeSketchFeature()) === orig, 'Ctrl+Z: the first undone, Trim open: ' + rfCYLines(UI.activeSketchFeature()));
    rfCYZ('y'); await idle();
    assert(UI.pmTitle() === 'Trim Entities' && rfCYLines(UI.activeSketchFeature()) === one, 'Ctrl+Y: the first redone: ' + rfCYLines(UI.activeSketchFeature()));
    rfCYZ(); await idle();
    rskClick([5, 0]); await idle();   // a trim on the sketch the undo restored
    var three = rfCYLines(UI.activeSketchFeature());
    assert(UI.pmTitle() === 'Trim Entities' && three !== orig && three.indexOf('10,0,40,0') >= 0, 'a new trim after the undo: ' + three);
    rfCYZ(); await idle();
    assert(UI.pmTitle() === 'Trim Entities' && rfCYLines(UI.activeSketchFeature()) === orig, 'that one undone too: ' + rfCYLines(UI.activeSketchFeature()));
    rfCYZ(); await idle();
    assert(!UI.hasPM() && /Trim Entities cancelled/.test($('status-msg').textContent) && UI.App.mode === 'sketch', 'nothing left: Ctrl+Z cancels Trim: ' + UI.pmTitle() + ' / ' + $('status-msg').textContent);
    assert(rfCYLines(UI.activeSketchFeature()) === orig, 'the sketch as it was: ' + rfCYLines(UI.activeSketchFeature()));
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'undo / redo inside Trim, then cancel';
  });
  step('rfCY2: Extend Entities and Split Entities — Ctrl+Z undoes the last extension (split) and the command stays open for the next click; with nothing left it cancels; Sketch Fillet (a command with its own session) keeps rfCM\'s rule: the first Ctrl+Z cancels it and takes its fillets back', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.App.view.showGrid = false;
    var f = fxSk([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }, { t: 'line', x1: 30, y1: -10, x2: 30, y2: 10 }, { t: 'line', x1: 0, y1: 20, x2: 20, y2: 20 }]);
    var orig = rfCYLines(f);
    UI.cmdExtendEntities(); await wait(20);
    rskClick([18, 0]); await idle();
    assert(UI.activeSketchFeature().entities[0].x2 === 30, 'extended: ' + JSON.stringify(UI.activeSketchFeature().entities[0]));
    rfCYZ(); await idle();
    assert(UI.pmTitle() === 'Extend Entities' && rfCYLines(UI.activeSketchFeature()) === orig, 'Ctrl+Z: undone, Extend open: ' + UI.pmTitle() + ' ' + rfCYLines(UI.activeSketchFeature()));
    rskClick([18, 0]); await idle();
    assert(UI.activeSketchFeature().entities[0].x2 === 30, 'extended again on the restored sketch: ' + JSON.stringify(UI.activeSketchFeature().entities[0]));
    rfCYZ(); await idle(); rfCYZ(); await idle();
    assert(!UI.hasPM() && rfCYLines(UI.activeSketchFeature()) === orig, 'then cancelled, sketch as it was: ' + UI.pmTitle() + ' ' + rfCYLines(UI.activeSketchFeature()));
    // Split Entities
    UI.cmdSplitEntities(); await wait(20);
    rskClick([10, 20]); await idle();
    assert(UI.activeSketchFeature().entities.length === 4, 'split in two: ' + rfCYLines(UI.activeSketchFeature()));
    rfCYZ(); await idle();
    assert(UI.pmTitle() === 'Split Entities' && UI.activeSketchFeature().entities.length === 3, 'Ctrl+Z: split undone, Split open: ' + UI.pmTitle());
    rskClick([5, 20]); await idle();
    assert(UI.activeSketchFeature().entities.length === 4, 'split again: ' + rfCYLines(UI.activeSketchFeature()));
    rfCYZ(); await idle(); rfCYZ(); await idle();
    assert(!UI.hasPM() && UI.activeSketchFeature().entities.length === 3, 'then cancelled: ' + UI.pmTitle());
    // Sketch Fillet: a feature-style session, rfCM's rule
    await rskNew();
    UI.App.view.showGrid = false;
    fxSk([{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'line', x1: 40, y1: 0, x2: 40, y2: 30 }]);
    UI.cmdSketchFillet(); await wait(20); UI.pmSetField('r', '4'); await wait(10);
    rskClick([40, 0]); await idle();
    assert(rfCYArcs(UI.activeSketchFeature()).length === 1, 'filleted');
    rfCYZ(); await idle();
    assert(!UI.hasPM() && rfCYArcs(UI.activeSketchFeature()).length === 0, 'Sketch Fillet: the first Ctrl+Z cancels it: ' + UI.pmTitle() + ' ' + rfCYLay(UI.activeSketchFeature()));
    assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
    return 'Extend, Split inside; Fillet cancels';
  });
  // --- end rfCY ---
