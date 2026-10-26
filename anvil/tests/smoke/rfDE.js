  // --- rfDE (2026-10-26, lane DE: sketch curves and polish) --- (1) Trim to closest with real clicks on a line through a
  // spline, and on a circle through an ellipse: the ends left lie on the true curve; Corner (Trim Entities' corner mode)
  // joins a partial ellipse and a line; (2) Smart Dimension on a spline handle (Show Spline Handles on): a click on the
  // handle's tip, a click on a line, a click to place: an angle dimension whose value turns the handle, not the line.
  // Uses rskNew / rskClick / rskScr (refine-sketcher), selClick (selection), fxSk (sketch-refine), stRadio (sketch-tools).
  function rfDEOn(e, p) { var S = W.SketchSolver; return S.freeClosest(S.freeCurve(e), p).d; }

  step('rfDE: Trim to closest at a spline and an ellipse cuts the line / circle at the true crossing; Corner joins a partial ellipse and a line', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.App.view.showGrid = false;
    var spl = { t: 'spline', pts: [[0, 0], [15, 15], [30, -7], [45, 7], [60, 0]] };
    var f = fxSk([spl, { t: 'line', x1: 22, y1: -20, x2: 22, y2: 25 }, { t: 'ellipse', cx: 30, cy: -25, rx: 12, ry: 6, rot: 20 }, { t: 'circle', cx: 42, cy: -25, r: 6 }]);
    UI.cmdTrimEntities(); await wait(20); stRadio('mode', 'closest');
    rskClick([22, 22]); await idle();
    f = UI.activeSketchFeature();
    var l = f.entities.filter(function (e) { return e.t === 'line'; })[0];
    assert(l && Math.max(l.y1, l.y2) < 15, 'the top of the line went: ' + JSON.stringify(f.entities));
    var top = l.y1 > l.y2 ? [l.x1, l.y1] : [l.x2, l.y2];
    assert(rfDEOn(f.entities[0], top) < 1e-4, 'the line ends on the spline: ' + rfDEOn(f.entities[0], top));
    // the circle round the ellipse's end: the part outside it goes
    rskClick([48, -25]); await idle();
    f = UI.activeSketchFeature();
    var a = f.entities.filter(function (e) { return e.t === 'arc'; })[0], el = f.entities.filter(function (e) { return e.t === 'ellipse'; })[0], D = Math.PI / 180;
    assert(a && el, 'an arc is left of the circle: ' + JSON.stringify(f.entities));
    [a.a0, a.a1].forEach(function (g) { var q = [a.cx + a.r * Math.cos(g * D), a.cy + a.r * Math.sin(g * D)]; assert(rfDEOn(el, q) < 1e-4, 'arc end on the ellipse: ' + rfDEOn(el, q)); });
    UI.pmOK(); await idle();
    // Corner: a partial ellipse runs on round its ellipse to meet a line
    await rskNew();
    f = fxSk([{ t: 'pellipse', cx: 0, cy: 0, rx: 20, ry: 10, rot: 0, a0: 0, a1: 150 }, { t: 'line', x1: 10, y1: -20, x2: 10, y2: -5 }]);
    UI.cmdTrimEntities(); await wait(20); stRadio('mode', 'corner');
    rskClick([19, 3]); await idle(); rskClick([10, -15]); await idle();
    f = UI.activeSketchFeature();
    var pe = f.entities.filter(function (e) { return e.t === 'pellipse'; })[0], ln = f.entities.filter(function (e) { return e.t === 'line'; })[0];
    assert(pe && Math.abs(pe.a0 - 300) < 1e-3 && ln && Math.abs(ln.y2 + 8.660254) < 1e-3, 'Corner made: ' + JSON.stringify(f.entities));
    UI.pmOK(); await idle();
    assert(errors.length === errs0, 'no page errors: ' + errors.slice(errs0).join(' | '));
    return 'line end ' + top.map(function (x) { return x.toFixed(4); }).join(', ') + ' on the spline; corner at 300°';
  });

  step('rfDE: Smart Dimension on a spline handle — tip, line, place: an angle dimension; its value turns the handle (not the line) and leaves the spline points', async function () {
    var errs0 = errors.length, S = W.SketchSolver;
    await rskNew();
    UI.App.view.showGrid = false;
    var f = fxSk([{ t: 'spline', pts: [[0, 0], [20, 15], [40, 5]] }, { t: 'line', x1: -10, y1: -15, x2: 50, y2: -15 }]);
    if (!UI.splineHandlesShownFor(0)) UI.cmdShowSplineHandles();
    assert(UI.splineHandlesShownFor(0), 'Show Spline Handles on');
    UI.setTool('dimension'); await wait(20);
    var hl = S.handleLine(f.entities[0], 1);
    var undo0 = UI.App.undo.length;
    rskClick(hl.b); await wait(20);
    assert(UI.App.toolState.pt1 === '0.h1', 'the handle picked: ' + UI.App.toolState.pt1);
    rskClick([30, -15]); await wait(20);
    rskClick([45, 10]); await idle();
    f = UI.activeSketchFeature();
    var ri = -1;
    (f.rels || []).forEach(function (r, i) { if (r.type === 'angle' && r.refs.indexOf('0.h1') >= 0) ri = i; });
    assert(ri >= 0, 'angle dimension on the handle: ' + JSON.stringify(f.rels));
    assert(f.entities[0].tans && f.entities[0].tans[1], 'the handle is driving');
    if (UI.closeDimEdit) UI.closeDimEdit(); if (UI.escapeBoxes) UI.escapeBoxes.forEach(function (fn) { try { fn(); } catch (e) { /* */ } });
    UI.setTool('select'); await idle();
    f = UI.activeSketchFeature();
    var r = S.setRelValue(f, ri, 20); UI.updateSketches(); await idle();
    assert(r.ok, 'value set: ' + r.error);
    var ang = S.measure(f, 'angle', f.rels[ri].refs);
    assert(Math.abs(ang - 20) < 1e-6 && Math.abs(Math.abs(Math.sin(f.entities[0].tans[1][0] * Math.PI / 180)) - Math.sin(20 * Math.PI / 180)) < 1e-6, 'handle at 20°: ' + ang + ' ' + JSON.stringify(f.entities[0].tans));
    assert(Math.abs(f.entities[1].y1 + 15) < 1e-9 && Math.abs(f.entities[1].y2 + 15) < 1e-9, 'the line did not turn: ' + JSON.stringify(f.entities[1]));
    assert(Math.abs(f.entities[0].pts[1][0] - 20) < 1e-6 && Math.abs(f.entities[0].pts[1][1] - 15) < 1e-6, 'the spline point stayed: ' + JSON.stringify(f.entities[0].pts));
    assert(UI.App.undo.length > undo0, 'one undo step at least');
    UI.cmdShowSplineHandles();
    assert(!UI.splineHandlesShownFor(0), 'handles off again');
    assert(errors.length === errs0, 'no page errors: ' + errors.slice(errs0).join(' | '));
    return 'angle ' + ang.toFixed(3) + '°';
  });

  // lane DE2: the sketch-hook registries replace the old wrappers (Dynamic Mirror commits through
  // UI.sketchCommitHooks, an arc slot's width step turns its own-point snaps off through sketchToolDefs[tool].noOwnSnap);
  // a circle / arc on a plane tilted to the sketch comes in as a true ellipse / partial ellipse; Linear Sketch
  // Pattern's Display instance count labels the last instance of each direction in the preview.
  step('rfDE: sketch hooks, a tilted model circle projected as an ellipse, Display instance count in the sketch patterns', async function () {
    var errs0 = errors.length;
    await rskNew();
    assert(typeof UI.afterSketchCommit === 'function' && /sketchCommitHooks/.test(String(UI.afterSketchCommit)) && UI.sketchCommitHooks.length >= 1, 'UI.afterSketchCommit runs the commit hooks');
    assert(Object.keys(UI.sketchToolDefs).some(function (k) { return typeof UI.sketchToolDefs[k].noOwnSnap === 'function'; }), 'a tool def carries noOwnSnap');
    var pl = UI.activePlane(), c30 = Math.cos(Math.PI / 6), s30 = Math.sin(Math.PI / 6);
    var C = { center: [1, 2, 3], normal: [0, s30, c30], xdir: [1, 0, 0], radius: 5, a0: 0, a1: 2 * Math.PI };
    var e = UI.modelCircleProjection(pl, C);
    assert(e.t === 'ellipse', 'a full ellipse: ' + JSON.stringify(e));
    near(e.cx, 1, 1e-6, 'cx'); near(e.cy, 2, 1e-6, 'cy'); near(e.rx, 5, 1e-6, 'rx'); near(e.ry, 5 * c30, 1e-6, 'ry');
    var A = { center: [1, 2, 3], normal: [0, s30, c30], xdir: [1, 0, 0], radius: 5, a0: 0.3, a1: 1.8 }, pe = UI.modelCircleProjection(pl, A), yd = K.vec.cross(A.normal, A.xdir);
    assert(pe.t === 'pellipse', 'a partial ellipse: ' + JSON.stringify(pe));
    var ends = [A.a0, A.a1].map(function (u) { return K.to2D(pl, K.vec.add(A.center, K.vec.add(K.vec.scale(A.xdir, 5 * Math.cos(u)), K.vec.scale(yd, 5 * Math.sin(u))))); });
    var got = [W.SketchSolver.refPoint({ entities: [pe] }, '0.p1'), W.SketchSolver.refPoint({ entities: [pe] }, '0.p2')];
    ends.forEach(function (q) { assert(got.some(function (g) { return Math.hypot(g[0] - q[0], g[1] - q[1]) < 1e-5; }), 'arc end ' + JSON.stringify(q) + ' is an end of the partial ellipse ' + JSON.stringify(got)); });
    var mid = K.to2D(pl, K.vec.add(A.center, K.vec.add(K.vec.scale(A.xdir, 5 * Math.cos(1.05)), K.vec.scale(yd, 5 * Math.sin(1.05)))));
    assert(rfDEOn(pe, mid) < 1e-5, 'the arc\'s middle lies on it');
    // Display instance count
    var f = fxSk([{ t: 'circle', cx: 0, cy: 0, r: 3 }]);
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    UI.cmdSketchPattern(); await wait(30);
    var cb = D.querySelector('#pm input[type="checkbox"][data-key="showCount"]');
    assert(cb && !cb.checked, 'Display instance count box (off)');
    assert(!D.querySelector('.sk-count'), 'no count shown yet');
    cb.click(); await wait(30);
    var lab = D.querySelector('.sk-count');
    assert(lab && lab.textContent === '3', 'the count by the last instance: ' + (lab && lab.textContent));
    UI.pmCancel(); await wait(20);
    assert(!D.querySelector('.sk-count') && UI.activeSketchFeature().entities.length === 1, 'cancel leaves nothing');
    assert(errors.length === errs0, 'no page errors: ' + errors.slice(errs0).join(' | '));
    return 'ellipse ' + e.rx + ' × ' + e.ry;
  });
