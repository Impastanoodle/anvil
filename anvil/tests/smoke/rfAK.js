  // ---- rfAK (2026-10-12): Split Entities on splines / style splines; Tangent on a style spline's control polygon leg
  function rfAKClick(uv, mods) {
    var p = UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])), r = $('viewport').getBoundingClientRect();
    ['mousemove', 'mousedown', 'mouseup'].forEach(function (type) {
      (type === 'mousedown' ? $('viewport') : W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }, mods || {})));
    });
  }
  async function rfAKNew(ents, rels) {
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    UI.zoomView(0.25 / UI.cam.scale);
    UI.App.view.showGrid = false; UI.App.gridStale = true;
    var f = UI.activeSketchFeature();
    ents.forEach(function (e) { f.entities.push(e); });
    if (rels) f.rels = rels;
    UI.updateSketches(); await wait(20);
    return f;
  }
  function rfAKDev(orig, pieces) {
    var S = W.SketchSolver, fo = S.freeCurve(orig), m = 0;
    for (var k = 0; k <= 200; k++) { var p = fo.pt(fo.t0 + (fo.t1 - fo.t0) * k / 200), b = Infinity; pieces.forEach(function (e) { b = Math.min(b, S.freeClosest(S.freeCurve(e), p).d); }); m = Math.max(m, b); }
    return m;
  }
  step('rfAK: Split Entities on a spline and on a style spline — a click on each splits it there into two pieces that are exactly the curve it was (Coincident; the style spline\'s pieces Tangent too), one undo step each; Ctrl+Z puts the spline back', async function () {
    var errs0 = errors.length;
    var sp = { t: 'spline', pts: [[0, 0], [10, 10], [20, 5], [30, 15], [40, 0]] }, st = { t: 'spline', style: true, pts: [[0, -30], [10, -10], [30, -10], [40, -30]] };
    var f = await rfAKNew([JSON.parse(JSON.stringify(sp)), JSON.parse(JSON.stringify(st))]);
    UI.cmdSplitEntities(); await wait(20);
    assert(UI.pmTitle() === 'Split Entities', 'PM ' + UI.pmTitle());
    var u0 = UI.App.undo.length, at = W.SketchSolver.freeCurve(f.entities[0]).pt(1.5);
    rfAKClick(at); await wait(20);
    assert(f.entities.length === 3 && f.entities[0].t === 'spline' && f.entities[1].t === 'spline' && f.entities[2].style, 'spline split in two: ' + JSON.stringify(f.entities));
    assert(rfAKDev(sp, [f.entities[0], f.entities[1]]) < 1e-4, 'the pieces are the curve: ' + rfAKDev(sp, [f.entities[0], f.entities[1]]));
    assert(relList().indexOf('coincident 0.p2/1.p1') >= 0, 'Coincident at the split: ' + relList().join(', '));
    assert(UI.App.undo.length === u0 + 1, 'one undo step');
    rfAKClick(K.bzPoint(st.pts, 0.5)); await wait(20);
    assert(f.entities.length === 4 && f.entities[2].style && f.entities[3].style && f.entities[2].pts.length === 4, 'style spline split: ' + JSON.stringify(f.entities.slice(2)));
    assert(rfAKDev(st, [f.entities[2], f.entities[3]]) < 1e-4, 'the style pieces are the curve');
    assert(relList().indexOf('coincident 2.p2/3.p1') >= 0 && relList().indexOf('tangent 2/3') >= 0, 'Coincident and Tangent: ' + relList().join(', '));
    assert(UI.App.undo.length === u0 + 2, 'one undo step each');
    var st0 = UI.sketchStatus();
    assert(st0.rels.every(function (s) { return s === 'ok'; }), 'nothing over-defined: ' + JSON.stringify(st0.rels));
    UI.pmCancel(); await wait(20);
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); await idle();
    f = UI.activeSketchFeature();
    assert(f.entities.length === 3 && f.entities[2].style && f.entities[2].pts.length === 4 && JSON.stringify(f.entities[2].pts) === JSON.stringify(st.pts), 'Ctrl+Z: the style spline whole again ' + JSON.stringify(f.entities));
    // the script round trip keeps the split spline (its asymmetric tangent weights)
    var src = anvil.script();
    await anvil.run(src); await idle();
    var sk = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    assert(JSON.stringify(sk.entities) === JSON.stringify(f.entities), 'script round trip: ' + JSON.stringify(sk.entities));
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return f.entities.length + ' entities after undo';
  });
  step('rfAK: a click on a style spline\'s control polygon leg selects the leg (Properties: control polygon line); Ctrl+click a line and Add Relations offers Tangent: the leg turns along the line; leg + arc Tangent is square to the radius', async function () {
    var errs0 = errors.length;
    var f = await rfAKNew([{ t: 'line', x1: -30, y1: 0, x2: 0, y2: 0 }, { t: 'spline', style: true, pts: [[0, 0], [10, 20], [30, 20], [40, 0]] }, { t: 'arc', cx: 40, cy: -20, r: 20, a0: 0, a1: 90 }],
      [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p2'] }]);
    UI.setTool('select'); await wait(20);
    var legScr = UI.worldToScreen(K.to3D(UI.activePlane(), 5, 10));
    assert(UI.pickStyleLeg(legScr[0], legScr[1]) === '1.e0', 'the leg under the cursor: ' + UI.pickStyleLeg(legScr[0], legScr[1]));
    rfAKClick([5, 10]); await wait(20);
    assert(anvil.selection().length === 1 && anvil.selection()[0].kind === 'sketchRef' && anvil.selection()[0].ref === '1.e0', 'leg selected: ' + JSON.stringify(anvil.selection()));
    assert(UI.pmTitle() === 'Properties' && /control polygon line 1/.test(D.querySelector('#pm').textContent), 'Properties PM: ' + UI.pmTitle());
    rfAKClick([-15, 0], { ctrlKey: true }); await wait(20);
    assert(anvil.selection().length === 2, 'the line added: ' + JSON.stringify(anvil.selection()));
    clickPmButton('Tangent'); await wait(30);
    var P = f.entities[1].pts, L = f.entities[0], d = [P[1][0] - P[0][0], P[1][1] - P[0][1]], ld = [L.x2 - L.x1, L.y2 - L.y1];
    assert(relList().indexOf('tangent 1.e0/0') >= 0 || relList().indexOf('tangent 0/1.e0') >= 0, 'Tangent made: ' + relList().join(', '));
    assert(Math.abs(d[0] * ld[1] - d[1] * ld[0]) < 1e-6 * Math.hypot(d[0], d[1]) * Math.hypot(ld[0], ld[1]), 'the first leg runs along the line: ' + JSON.stringify(P));
    UI.setSelection([]); UI.closePM(); await wait(20);
    var r = W.SketchSolver.addRelation(f, 'tangent', ['1.e2', '2']);
    UI.updateSketches();
    P = f.entities[1].pts; var A = f.entities[2], leg = [P[3][0] - P[2][0], P[3][1] - P[2][1]], rad = [P[3][0] - A.cx, P[3][1] - A.cy];
    assert(r.ok && Math.abs(leg[0] * rad[0] + leg[1] * rad[1]) < 1e-6 * Math.hypot(leg[0], leg[1]) * Math.hypot(rad[0], rad[1]), 'last leg tangent to the arc: ' + JSON.stringify(r.status));
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return relList().join(', ');
  });
  step('rfAK: Smart Dimension / Add Relations on a hole\'s rim in a sketch on the face brings in the true circle (fixed construction), not the one facet line under the cursor', async function () {
    var errs0 = errors.length;
    await anvil.run('p.sketch("Front").rect(0, 0, 40, 30).circle(20, 15, 5).extrude(10, { reverse: true });'); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    UI.zoomView(0.25 / UI.cam.scale); UI.App.view.showGrid = false; UI.updateSketches(); await idle(); await wait(30);
    var f = UI.activeSketchFeature(), n0 = f.entities.length, s = UI.worldToScreen(K.to3D(UI.activePlane(), 20 + 5 * Math.cos(0.3), 15 + 5 * Math.sin(0.3)));
    var m = UI.pickModelRef(s[0], s[1]);
    assert(m && m.entity && m.entity.t === 'circle', 'a circle: ' + JSON.stringify(m && m.entity));
    near(m.entity.cx, 20, 1e-6, 'cx'); near(m.entity.cy, 15, 1e-6, 'cy'); near(m.entity.r, 5, 1e-6, 'r');
    assert(f.entities.length === n0 + 1 && m.entity.construction && (f.rels || []).some(function (r) { return r.type === 'fix' && r.refs[0] === m.ref; }), 'fixed construction circle');
    var m2 = UI.pickModelRef(s[0], s[1]);
    assert(m2 && m2.ref === m.ref && f.entities.length === n0 + 1, 'picked again: the same circle reused');
    UI.exitSketch && UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'Ø' + (2 * m.entity.r);
  });
  // --- end rfAK ---
