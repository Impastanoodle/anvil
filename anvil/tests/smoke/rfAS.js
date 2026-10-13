  // ---- rfAS (2026-10-13): Split Entities on ellipses, Fit Spline, spline tools, Parabola and Conic
  function rfASClick(uv, mods) {
    var p = UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])), r = $('viewport').getBoundingClientRect();
    ['mousemove', 'mousedown', 'mouseup'].forEach(function (type) {
      (type === 'mousedown' ? $('viewport') : W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }, mods || {})));
    });
  }
  async function rfASNew(ents, rels, dims) {
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    UI.zoomView(0.25 / UI.cam.scale);
    UI.App.view.showGrid = false; UI.App.gridStale = true;
    var f = UI.activeSketchFeature();
    ents.forEach(function (e) { f.entities.push(e); });
    if (rels) f.rels = rels;
    if (dims) f.dims = dims;
    UI.updateSketches(); await wait(20);
    return f;
  }
  function rfASRels() { return (UI.activeSketchFeature().rels || []).map(function (r) { return r.type + ' ' + r.refs.join('/'); }); }
  step('rfAS: Split Entities on an ellipse (two clicks: two partial ellipses on the same curve, joined by two Coincidents, its R dimension on the first piece) and on a partial ellipse (one click), one undo step each', async function () {
    var errs0 = errors.length;
    var el = { t: 'ellipse', cx: 0, cy: 0, rx: 20, ry: 10, rot: 0 }, pe = { t: 'pellipse', cx: 0, cy: -40, rx: 20, ry: 10, rot: 0, a0: 0, a1: 180 };
    var f = await rfASNew([JSON.parse(JSON.stringify(el)), JSON.parse(JSON.stringify(pe))], null, [{ e: 0, k: 'rx', v: 20 }]);
    UI.cmdSplitEntities(); await wait(20);
    assert(UI.pmTitle() === 'Split Entities', 'PM ' + UI.pmTitle());
    var u0 = UI.App.undo.length;
    rfASClick(K.ellipsePoint(el, 0.5)); await wait(20);
    assert(f.entities.length === 2, 'the first click only marks the point');
    rfASClick(K.ellipsePoint(el, 3.5)); await wait(20);
    f = UI.activeSketchFeature();
    assert(f.entities.length === 3 && f.entities[0].t === 'pellipse' && f.entities[1].t === 'pellipse' && f.entities[2].t === 'pellipse', 'ellipse in two: ' + JSON.stringify(f.entities));
    near((f.entities[0].a1 - f.entities[0].a0) + (f.entities[1].a1 - f.entities[1].a0), 360, 1e-6, 'the pieces make the whole ellipse');
    near(f.entities[0].a0, 0.5 * 180 / Math.PI, 1.5, 'cut at the first click (to the pixel)');
    assert(f.entities[0].rx === 20 && f.entities[1].ry === 10 && f.entities[1].cx === 0, 'same curve');
    var rl = rfASRels();
    assert(rl.indexOf('coincident 0.p2/1.p1') >= 0 && rl.indexOf('coincident 1.p2/0.p1') >= 0, 'joined end to end: ' + rl.join(', '));
    assert((f.dims || []).some(function (d) { return d.e === 0 && d.k === 'rx'; }), 'R dimension on the first piece: ' + JSON.stringify(f.dims));
    assert(UI.App.undo.length === u0 + 1, 'one undo step');
    rfASClick(K.ellipsePoint(pe, Math.PI / 2)); await wait(20);
    f = UI.activeSketchFeature();
    assert(f.entities.length === 4 && f.entities[2].t === 'pellipse' && f.entities[3].t === 'pellipse', 'partial ellipse in two: ' + JSON.stringify(f.entities.slice(2)));
    near(f.entities[2].a1, 90, 1.5, 'cut at 90° (to the pixel)'); near(f.entities[3].a1, 180, 1e-9, 'its end kept');
    assert(rfASRels().indexOf('coincident 2.p2/3.p1') >= 0, 'Coincident at the cut');
    assert(UI.App.undo.length === u0 + 2, 'one undo step each');
    // a line still splits through the same command
    UI.pmCancel(); await wait(20);
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); await idle();
    assert(UI.activeSketchFeature().entities.length === 3, 'Ctrl+Z: the partial ellipse whole again');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return UI.activeSketchFeature().entities.length + ' entities after undo';
  });
  step('rfAS: Parabola (focus, apex, start, end) and Conic (start, end, top vertex, rho point) drawn with clicks; the Conic PropertyManager changes rho; script round trip', async function () {
    var errs0 = errors.length;
    var f = await rfASNew([]);
    UI.setTool('parabola'); await wait(20);
    assert(UI.pmTitle() === 'Parabola', 'tool PM ' + UI.pmTitle());
    rfASClick([0, 10]); await wait(10); rfASClick([0, 0]); await wait(10); rfASClick([-10, 20]); await wait(10); rfASClick([20, 30]); await wait(30);
    f = UI.activeSketchFeature();
    var pb = f.entities.filter(function (e) { return e.parabola; })[0];
    assert(pb && pb.conic === 0.5, 'a parabola: ' + JSON.stringify(f.entities));
    near(pb.pts[0][0], -10, 1e-6, 'start x'); near(pb.pts[0][1], 2.5, 1e-6, 'start on y = x²/40'); near(pb.pts[2][1], 10, 1e-6, 'end on the parabola');
    UI.cancelTool(); await wait(10);
    UI.setTool('conic'); await wait(20);
    assert(UI.pmTitle() === 'Conic', 'tool PM ' + UI.pmTitle());
    rfASClick([0, -40]); await wait(10); rfASClick([40, -40]); await wait(10); rfASClick([20, -20]); await wait(10); rfASClick([20, -26]); await wait(30);
    f = UI.activeSketchFeature();
    var ci = -1;
    f.entities.forEach(function (e, i) { if (e.conic != null && !e.parabola) ci = i; });
    assert(ci >= 0, 'a conic: ' + JSON.stringify(f.entities));
    near(f.entities[ci].conic, 0.7, 1e-9, 'rho from the fourth click');
    UI.cancelTool(); await wait(10);
    assert(UI.setConicRho(ci, 0.4), 'rho set');
    var c = K.conicData(UI.activeSketchFeature().entities[ci]);
    near(c.rho, 0.4, 1e-12, 'rho 0.4'); near(c.T[1], -20, 1e-6, 'the top vertex stays');
    UI.openEntityPM(ci); await wait(20);
    assert(UI.pmTitle() === 'Conic', 'entity PM ' + UI.pmTitle());
    UI.pmCancel(); await wait(10);
    // Split Entities on the conic: two conics (each its own rho) on the same curve
    f = UI.activeSketchFeature();
    var ce = JSON.parse(JSON.stringify(f.entities[ci])), cd = K.conicData(ce), n1 = f.entities.length;
    UI.cmdSplitEntities(); await wait(20);
    rfASClick(K.conicPoint(cd, 0.3)); await wait(20);
    f = UI.activeSketchFeature();
    assert(f.entities.length === n1 + 1 && K.conicData(f.entities[ci]) && K.conicData(f.entities[ci + 1]), 'conic in two conics: ' + JSON.stringify(f.entities));
    var S2 = W.SketchSolver, dvc = 0;
    for (var q = 0; q <= 40; q++) { var pq = K.conicPoint(cd, q / 40); dvc = Math.max(dvc, Math.min(S2.freeClosest(S2.freeCurve(f.entities[ci]), pq).d, S2.freeClosest(S2.freeCurve(f.entities[ci + 1]), pq).d)); }
    assert(dvc < 1e-4, 'the pieces are the conic: ' + dvc);
    assert(rfASRels().indexOf('coincident ' + ci + '.p2/' + (ci + 1) + '.p1') >= 0, 'joined: ' + rfASRels().join(', '));
    UI.pmCancel(); await wait(10);
    var before = JSON.stringify(UI.activeSketchFeature().entities);
    await anvil.run(anvil.script()); await idle();
    var sk = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    assert(JSON.stringify(sk.entities) === before, 'script round trip: ' + JSON.stringify(sk.entities));
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'rho ' + c.rho;
  });
  step('rfAS: Fit Spline on a chain of lines and an arc (Delete geometry): one spline within the tolerance of them; Insert Spline Point keeps the shape; Simplify Spline drops points; Show Spline Handles; the spline\'s right-click Spline Tools', async function () {
    var errs0 = errors.length;
    var f = await rfASNew([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }, { t: 'arc', cx: 20, cy: 10, r: 10, a0: -90, a1: 0 }, { t: 'line', x1: 30, y1: 10, x2: 30, y2: 30 }]);
    var chain = JSON.parse(JSON.stringify(f.entities));
    UI.setSelection([0, 1, 2].map(function (i) { return { kind: 'entity', index: i }; })); await wait(10);
    UI.cmdFitSpline(); await wait(20);
    assert(UI.pmTitle() === 'Fit Spline', 'PM ' + UI.pmTitle());
    var u0 = UI.App.undo.length;
    UI.pmOK(); await wait(30);
    f = UI.activeSketchFeature();
    assert(f.entities.length === 1 && f.entities[0].t === 'spline', 'one spline in place of the chain: ' + JSON.stringify(f.entities));
    assert(UI.App.undo.length === u0 + 1, 'one undo step');
    var sp = f.entities[0], S = W.SketchSolver, fc = S.freeCurve(sp), m = 0;
    near(sp.pts[0][0], 0, 1e-9, 'starts at the chain start'); near(sp.pts[sp.pts.length - 1][1], 30, 1e-9, 'ends at the chain end');
    for (var k = 0; k <= 20; k++) { m = Math.max(m, fc ? S.freeClosest(fc, [k, 0]).d : 1); m = Math.max(m, S.freeClosest(fc, [30, 10 + k]).d); var a = (-90 + 4.5 * k) * Math.PI / 180; m = Math.max(m, S.freeClosest(fc, [20 + 10 * Math.cos(a), 10 + 10 * Math.sin(a)]).d); }
    assert(m <= 0.0254 * 1.01, 'within the tolerance of the chain: ' + m);
    // Insert Spline Point: the shape stays
    var orig = JSON.parse(JSON.stringify(sp)), n0 = sp.pts.length, at = fc.pt(fc.t0 + (fc.t1 - fc.t0) * 0.37);
    UI.cmdInsertSplinePoint(); await wait(20);
    assert(UI.pmTitle() === 'Insert Spline Point', 'PM ' + UI.pmTitle());
    rfASClick(at); await wait(20);
    sp = UI.activeSketchFeature().entities[0];
    assert(sp.pts.length === n0 + 1, 'a point more: ' + sp.pts.length);
    var fo = S.freeCurve(orig), fn = S.freeCurve(sp), dv = 0;
    for (k = 0; k <= 100; k++) dv = Math.max(dv, S.freeClosest(fn, fo.pt(fo.t0 + (fo.t1 - fo.t0) * k / 100)).d);
    assert(dv < 1e-4, 'the shape is unchanged: ' + dv);
    UI.pmCancel(); await wait(10);
    // Simplify Spline: fewer points within its tolerance
    var big = { t: 'spline', pts: [] };
    for (k = 0; k <= 12; k++) big.pts.push([k * 5, 40 + 8 * Math.sin(k * 5 / 15)]);
    var r = UI.simplifySpline(big, 0.05, false);
    assert(r.e.pts.length < big.pts.length && r.dev <= 0.05, 'simplified to ' + r.e.pts.length + ' points, deviation ' + r.dev);
    // Show Spline Handles and the right-click rows
    UI.cmdShowSplineHandles(); await wait(10);
    assert(UI.splineView.handles && UI.styleSplineOverlay() > 0, 'handles drawn');
    UI.cmdShowSplineHandles(); await wait(10);
    UI.setSelection([{ kind: 'entity', index: 0 }]); await wait(10);
    var labels = UI.sketchMenuItems([]).map(function (x) { return x.label; });
    ['Insert Spline Point', 'Simplify Spline…', 'Relax Spline', 'Show Spline Handles', 'Show Curvature'].forEach(function (l) { assert(labels.indexOf(l) >= 0, 'right-click ' + l + ': ' + labels.join(', ')); });
    UI.cmdRelaxSpline(0); await wait(10);
    var rs = UI.activeSketchFeature().entities[0];
    assert(!rs.tans || rs.tans.every(function (t, i) { return !t || i === 0 || i === rs.pts.length - 1; }), 'relaxed: no inner tangent-driving');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return n0 + ' fitted points, deviation ' + m.toFixed(4);
  });
  step('rfAS: Trim to closest on a Conic keeps a conic piece on the same curve, ending on the cutting line', async function () {
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'spline', pts: [[0, 0], [20, 14], [40, 0]], conic: 0.4 });
    f.entities.push({ t: 'line', x1: 15, y1: -5, x2: 15, y2: 40 });
    UI.updateSketches(); await wait(20);
    var c0 = K.conicData(JSON.parse(JSON.stringify(f.entities[0])));
    var r = W.SketchSolver.trimAt(f, 0, [30, 10], {});
    UI.updateSketches(); await wait(10);
    var pc = f.entities.filter(function (x) { return x.conic != null; });
    assert(r.ok && pc.length === 1, 'one conic piece: ' + JSON.stringify([r, f.entities]));
    var c1 = K.conicData(pc[0]), dv = 0, k, j;
    assert(c1 && Math.abs(c1.P0[0]) < 1e-6 && Math.abs(c1.P2[0] - 15) < 1e-6, 'from the start to the line: ' + JSON.stringify(pc[0].pts));
    for (k = 0; k <= 20; k++) {
      var p = K.conicPoint(c1, k / 20), dq = function (t) { var q = K.conicPoint(c0, t); return Math.hypot(p[0] - q[0], p[1] - q[1]); }, bt = 0;
      for (j = 0; j <= 400; j++) if (dq(j / 400) < dq(bt)) bt = j / 400;
      var lo = Math.max(0, bt - 1 / 400), hi = Math.min(1, bt + 1 / 400);
      for (j = 0; j < 80; j++) { var m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (dq(m1) < dq(m2)) hi = m2; else lo = m1; }
      dv = Math.max(dv, dq((lo + hi) / 2));
    }
    assert(dv < 1e-5, 'on the original conic: ' + dv);
    return 'deviation ' + dv.toExponential(1);
  });
  // --- end rfAS ---
