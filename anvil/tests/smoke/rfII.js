  // --- rfII (2026-11-05, lane sketchinfer) --- SolidWorks' inference while drawing: a Line from an arc / spline end
  // locks along the tangent (label Tangent, the click adds Tangent), from a line end square to it (Perpendicular), and
  // parallel / square to a line the cursor passed over (Parallel / Perpendicular); with Automatic Relations off the lock
  // and label still show and nothing is added. A circle / arc centre dragged onto a point merges (Coincident / Midpoint).
  // Smart Dimension takes a polygon side's midpoint ('3.e0.mid'). Real mouse events; an inch sketch at 0.02 in per pixel;
  // the grid, numeric input and Quick Snaps off for each step and put back after it.
  var rfIISaved = null;
  function rfIISet() {
    var V = UI.App.view;
    if (!rfIISaved) rfIISaved = { grid: V.showGrid, i2d: V.instant2D, qs: UI.App.quickSnap, num: UI.sketchNumericInput(), auto: UI.sketchSettings.get('autoRelations'), snap: UI.sketchSettings.get('snapping') };
    V.showGrid = false; V.instant2D = false; UI.App.quickSnap = null; UI.sketchNumericInput(false);
    UI.sketchSettings.set('autoRelations', true); UI.sketchSettings.set('snapping', true);
    UI.App.gridStale = true;
  }
  function rfIIRestore() {
    var s = rfIISaved, V = UI.App.view;
    if (!s) return;
    rfIISaved = null;
    V.showGrid = s.grid; V.instant2D = s.i2d; UI.App.quickSnap = s.qs; UI.sketchNumericInput(s.num);
    UI.sketchSettings.set('autoRelations', s.auto); UI.sketchSettings.set('snapping', s.snap);
    UI.App.gridStale = true; UI.App.dimsStale = true;
  }
  function rfIIStep(name, fn) { step(name, async function () { try { return await fn(); } finally { try { if (UI.isDimEditOpen && UI.isDimEditOpen()) UI.cancelDimEdit(); selKey('Escape'); UI.setTool('select'); } catch (e) { /* no sketch */ } rfIIRestore(); } }); }
  async function rfIINew(ents) {
    await rskNew(); rfIISet();
    UI.App.model.units = 'in';
    UI.zoomView(0.02 / UI.cam.scale);
    var pc = UI.worldToScreen(K.to3D(UI.activePlane(), 2, 0)), c = [UI.size.w / 2, UI.size.h / 2];
    UI.panView(c[0] - pc[0], c[1] - pc[1]);
    var f = UI.activeSketchFeature();
    (ents || []).forEach(function (e) { f.entities.push(e); });
    UI.updateSketches(); UI.setSelection([]); await idle();
    return f;
  }
  function rfIIRels(f) { return (f.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }); }
  function rfIIHas(f, type, a, b) { return (f.rels || []).some(function (r) { return r.type === type && r.refs.length === 2 && ((r.refs[0] === a && r.refs[1] === b) || (r.refs[0] === b && r.refs[1] === a)); }); }
  // P + L·u, then `off` inches square to u (a slightly wrong direction, inside the lock)
  function rfIIAlong(P, u, L, off) { return [P[0] + u[0] * L - u[1] * off, P[1] + u[1] * L + u[0] * off]; }
  // move to uv in a few steps (as a hand does), the last one at uv
  async function rfIIMoveTo(from, uv) { for (var k = 1; k <= 4; k++) selEv('mousemove', rskScr([from[0] + (uv[0] - from[0]) * k / 4, from[1] + (uv[1] - from[1]) * k / 4])); await wait(20); }
  function rfIICross(a, b) { return a[0] * b[1] - a[1] * b[0]; }
  function rfIIDir(e) { var dx = e.x2 - e.x1, dy = e.y2 - e.y1, L = Math.hypot(dx, dy); return [dx / L, dy / L]; }

  rfIIStep('rfII: a Line from an arc end near its tangent locks onto it (label Tangent, light guide line), the click adds Tangent + Coincident; from a slanted line end square to it locks Perpendicular and adds it; from an open spline end along its tangent adds Tangent', async function () {
    var f = await rfIINew([{ t: 'arc', cx: 0, cy: 0, r: 2, a0: 0, a1: 60 }]);
    var E = [2 * Math.cos(Math.PI / 3), 2 * Math.sin(Math.PI / 3)], u = [-Math.sin(Math.PI / 3), Math.cos(Math.PI / 3)];
    UI.setTool('line');
    rskClick(E);
    var T = rfIIAlong(E, u, 2, 0.04);   // 2 px off the tangent
    await rfIIMoveTo(E, T);
    assert(UI.sketchHoverLabel() === 'Tangent', 'label: ' + UI.sketchHoverLabel());
    assert(sfLayer().querySelector('.sk-infer-rel'), 'the light inference line');
    assert((UI.App.inferPreview || []).some(function (c) { return c.type === 'tangent'; }), 'preview lists Tangent ' + JSON.stringify(UI.App.inferPreview));
    rskClick(T); await idle();
    selKey('Escape'); await idle();
    var L = f.entities[1];
    assert(L && L.t === 'line' && Math.abs(rfIICross(rfIIDir(L), u)) < 1e-9, 'locked along the tangent ' + JSON.stringify(L));
    assert(rfIIHas(f, 'tangent', '1', '0') && rfIIHas(f, 'coincident', '1.p1', '0.p2'), 'Tangent + Coincident: ' + rfIIRels(f).join(' '));
    // Perpendicular from a slanted line end
    var g = await rfIINew([{ t: 'line', x1: 0, y1: 0, x2: 3, y2: 1 }]), n = [-1 / Math.sqrt(10), 3 / Math.sqrt(10)];
    UI.setTool('line');
    rskClick([3, 1]);
    var Pp = rfIIAlong([3, 1], n, 1.5, -0.04);
    await rfIIMoveTo([3, 1], Pp);
    assert(UI.sketchHoverLabel() === 'Perpendicular', 'label: ' + UI.sketchHoverLabel());
    rskClick(Pp); await idle(); selKey('Escape'); await idle();
    assert(Math.abs(rfIIDir(g.entities[1])[0] * 3 + rfIIDir(g.entities[1])[1]) < 1e-8 && rfIIHas(g, 'perpendicular', '1', '0'), 'Perpendicular: ' + rfIIRels(g).join(' '));
    // Tangent from a spline end
    var sp = { t: 'spline', pts: [[0, 0], [1, 1], [3, 1.5]] }, h = await rfIINew([sp]), d = W.SketchSolver.freeEndDir(h.entities[0], [3, 1.5]);
    UI.setTool('line');
    rskClick([3, 1.5]);
    var Ps = rfIIAlong([3, 1.5], d, 1.5, 0.04);
    await rfIIMoveTo([3, 1.5], Ps);
    var lab = UI.sketchHoverLabel();
    rskClick(Ps); await idle(); selKey('Escape'); await idle();
    assert(lab === 'Tangent' && Math.abs(rfIICross(rfIIDir(h.entities[1]), d)) < 1e-9 && rfIIHas(h, 'tangent', '1', '0'), 'spline end Tangent: ' + lab + ' ' + rfIIRels(h).join(' '));
    return rfIIRels(f).join(' ') + ' | ' + rfIIRels(g).join(' ') + ' | ' + rfIIRels(h).join(' ');
  });

  rfIIStep('rfII: hovering a slanted line wakes it — a Line drawn elsewhere near parallel to it locks Parallel and the click adds Parallel; near square to it, Perpendicular; with Automatic Relations off the lock and label still show and nothing is added; a line never hovered locks nothing', async function () {
    var f = await rfIINew([{ t: 'line', x1: 0, y1: 0, x2: 3, y2: 1 }]), u = rfIIDir(f.entities[0]);
    UI.setTool('line');
    // never hovered: no lock
    rskClick([5, -2]);
    var P0 = rfIIAlong([5, -2], u, 2, 0.04);
    await rfIIMoveTo([5, -2], P0);
    assert(!UI.sketchWokenLines().length && UI.sketchHoverLabel() !== 'Parallel', 'not woken: ' + UI.sketchHoverLabel());
    // over the line (not at its midpoint or ends), then out parallel to it
    await rfIIMoveTo(P0, [0.9, 0.3]);
    assert(UI.sketchWokenLines().indexOf(0) >= 0, 'woken ' + JSON.stringify(UI.sketchWokenLines()));
    await rfIIMoveTo([0.9, 0.3], P0);
    assert(UI.sketchHoverLabel() === 'Parallel', 'label: ' + UI.sketchHoverLabel());
    rskClick(P0); await idle();
    var L = f.entities[1];
    assert(Math.abs(rfIICross(rfIIDir(L), u)) < 1e-9 && rfIIHas(f, 'parallel', '1', '0'), 'Parallel: ' + JSON.stringify(L) + ' ' + rfIIRels(f).join(' '));
    // the chain goes on from the new end: square to the woken line (not to the line just drawn: that is parallel)
    var B = [L.x2, L.y2], nrm = [-u[1], u[0]], P1 = rfIIAlong(B, nrm, -1.2, 0.04);
    await rfIIMoveTo(B, P1);
    var lab1 = UI.sketchHoverLabel();
    rskClick(P1); await idle(); selKey('Escape'); await idle();
    assert(lab1 === 'Perpendicular' && Math.abs(rfIIDir(f.entities[2])[0] * u[0] + rfIIDir(f.entities[2])[1] * u[1]) < 1e-9 && (rfIIHas(f, 'perpendicular', '2', '0') || rfIIHas(f, 'perpendicular', '2', '1')), 'Perpendicular: ' + lab1 + ' ' + rfIIRels(f).join(' '));
    assert(W.SketchSolver.analyze(f).conflicts === 0 || W.SketchSolver.analyze(f).status !== 'over', 'not over-defined');
    // Automatic Relations off
    var g = await rfIINew([{ t: 'line', x1: 0, y1: 0, x2: 3, y2: 1 }]);
    UI.sketchSettings.set('autoRelations', false);
    UI.setTool('line');
    rskClick([5, -2]);
    await rfIIMoveTo([5, -2], [0.9, 0.3]);
    await rfIIMoveTo([0.9, 0.3], P0);
    var lab2 = UI.sketchHoverLabel();
    rskClick(P0); await idle(); selKey('Escape'); await idle();
    assert(lab2 === 'Parallel' && Math.abs(rfIICross(rfIIDir(g.entities[1]), u)) < 1e-9, 'locked, labelled with Automatic Relations off: ' + lab2);
    assert(!(g.rels || []).some(function (r) { return r.type === 'parallel' || r.type === 'perpendicular'; }), 'nothing added: ' + rfIIRels(g).join(' '));
    return rfIIRels(f).join(' ');
  });

  rfIIStep('rfII: dragging a circle centre onto a line end adds Coincident, onto a line midpoint Midpoint, onto a polygon side midpoint Midpoint with that side, onto the origin Coincident with it; an arc centre likewise', async function () {
    var f = await rfIINew([{ t: 'line', x1: 0, y1: -2, x2: 3, y2: -2 }, { t: 'circle', cx: 5, cy: 1, r: 0.3 }, { t: 'circle', cx: 6, cy: 1, r: 0.3 }, { t: 'poly', cx: 3, cy: 2, r: 1, n: 6, rot: 0 }, { t: 'circle', cx: 7, cy: 1, r: 0.3 }, { t: 'arc', cx: 6, cy: -1, r: 0.5, a0: 0, a1: 90 }]);
    UI.setTool('select');
    await selDrag(rskScr([5, 1]), rskScr([3.006, -2.004])); await idle();
    assert(f.entities[1].cx === 3 && f.entities[1].cy === -2 && rfIIHas(f, 'coincident', '1.c', '0.p2'), 'line end: ' + JSON.stringify(f.entities[1]) + ' ' + rfIIRels(f).join(' '));
    await selDrag(rskScr([6, 1]), rskScr([1.506, -1.996])); await idle();
    assert(Math.abs(f.entities[2].cx - 1.5) < 1e-7 && Math.abs(f.entities[2].cy + 2) < 1e-7 && rfIIHas(f, 'midpoint', '2.c', '0'), 'line midpoint: ' + JSON.stringify(f.entities[2]) + ' ' + rfIIRels(f).join(' '));
    var M = W.SketchSolver.refPoint(f, '3.e0.mid');
    await selDrag(rskScr([7, 1]), rskScr([M[0] + 0.004, M[1] - 0.004])); await idle();
    var c4 = f.entities[4];
    assert(Math.abs(c4.cx - M[0]) < 1e-7 && Math.abs(c4.cy - M[1]) < 1e-7 && rfIIHas(f, 'midpoint', '4.c', '3.e0'), 'polygon side midpoint: ' + JSON.stringify(c4) + ' ' + rfIIRels(f).join(' '));
    await selDrag(rskScr([6, -1]), rskScr([0.004, 0.006])); await idle();
    assert(f.entities[5].cx === 0 && f.entities[5].cy === 0 && rfIIHas(f, 'coincident', '5.c', 'O'), 'arc centre on the origin: ' + rfIIRels(f).join(' '));
    return rfIIRels(f).join(' ');
  });

  rfIIStep('rfII: Smart Dimension from a polygon side midpoint (rest: marker + label Midpoint, the click takes \'0.e0.mid\') to the origin; Modify drives it; right-click a polygon side ▸ Select Midpoint picks it too', async function () {
    var f = await rfIINew([{ t: 'poly', cx: 3, cy: 1, r: 1, n: 6, rot: 0 }]), S = W.SketchSolver;
    var M = S.refPoint(f, '0.e0.mid');
    UI.setTool('dimension');
    selEv('mousemove', rskScr(M)); await wait(UI.dimMidDwell() + 60);
    assert(D.querySelector('#dim-layer .sk-feedback .sk-mid-hover') && UI.sketchHoverLabel() === 'Midpoint', 'marker / label: ' + UI.sketchHoverLabel());
    selClick(rskScr(M)); await wait(10);
    assert(UI.App.toolState.pt1 === '0.e0.mid', 'picked: ' + UI.App.toolState.pt1);
    rskClick([0, 0]);
    var rd = UI.App.toolState.relDim;
    assert(rd && rd.refs.join() === '0.e0.mid,O', 'to the origin: ' + JSON.stringify(rd));
    var n0 = (f.rels || []).length;
    rskClick([1.2, 3.5]); await idle();
    var d = f.rels[f.rels.length - 1];
    assert(f.rels.length === n0 + 1 && d.type === 'distance' && d.refs.join() === '0.e0.mid,O', 'placed: ' + JSON.stringify(d));
    var v0 = d.v, inp = $('dim-edit').querySelector('input');
    assert(UI.isDimEditOpen(), 'Modify box');
    inp.value = String(+(v0 + 0.5).toFixed(3)); inp.dispatchEvent(new W.Event('input', { bubbles: true }));
    inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await idle();
    f = UI.activeSketchFeature();
    near(S.measure(f, 'distance', d.refs, d.dir), +(v0 + 0.5).toFixed(3), 1e-6, 'driven');
    if (UI.isDimEditOpen()) UI.cancelDimEdit();
    // right-click ▸ Select Midpoint on another side (clicked away from its middle)
    var e0 = f.entities[0], M2 = S.refPoint(f, '0.e2.mid'), a2 = [e0.cx + e0.r * Math.cos(2 * Math.PI / 3), e0.cy + e0.r * Math.sin(2 * Math.PI / 3)];
    var p = rskScr([M2[0] + (a2[0] - M2[0]) * 0.5, M2[1] + (a2[1] - M2[1]) * 0.5]);
    selEv('mousemove', p); selEv('mousedown', p, $('viewport'), { button: 2, buttons: 2 }); selEv('mouseup', p, null, { button: 2, buttons: 0 });
    await wait(20);
    var mi = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (x) { return /Select Midpoint/.test(x.textContent); })[0];
    assert(mi, 'Select Midpoint on a polygon side: ' + Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (x) { return x.textContent; }).join('|'));
    mi.click(); await wait(10);
    assert(UI.App.toolState.pt1 === '0.e2.mid', 'Select Midpoint picked ' + UI.App.toolState.pt1);
    return d.type + ' ' + d.refs.join() + ' ' + v0.toFixed(4) + ' → ' + (v0 + 0.5).toFixed(3);
  });
