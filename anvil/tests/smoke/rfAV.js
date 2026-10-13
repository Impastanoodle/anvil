  // --- rfAV ---
  // Instant2D (ui-sketch-dims.js), angle values in the Modify box (ui-sketch.js), the solver keeping a line's length
  // (sketch-solver.js), relation icons round a short line (ui-relations.js)
  async function rfAVNew(ents, rels, dims) {
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    UI.zoomView(0.25 / UI.cam.scale);
    UI.App.view.showGrid = false; UI.App.gridStale = true;
    var f = UI.activeSketchFeature();
    ents.forEach(function (e) { f.entities.push(e); });
    if (rels) rels.forEach(function (r) { var x = W.SketchSolver.addRelation(f, r[0], r[1], r[2]); assert(x.ok, 'relation ' + r[0] + ': ' + x.error); });
    if (dims) f.dims = dims;
    UI.updateSketches(); await wait(20);
    UI.App.dimsStale = false; UI.drawDims(true);
    return f;
  }
  function rfAVItem(key) { return UI.drawDims(true).filter(function (x) { return UI.dimKey(x) === key; })[0]; }
  function rfAVBall() { return D.querySelector('#i2d-layer .i2d-handle'); }
  // press the ball, move over the given points (each a [value, px off the ruler]), release
  async function rfAVDrag(moves, during) {
    var h = UI.instant2DHandle(), b = rfAVBall();
    assert(h && b, 'a ball to drag');
    selEv('mousedown', h.ball, b);
    for (var k = 0; k < moves.length; k++) { selEv('mousemove', UI.instant2DPoint(moves[k][0], moves[k][1])); await wait(40); }
    if (during) during();
    selEv('mouseup', UI.instant2DPoint(moves[moves.length - 1][0], moves[moves.length - 1][1]));
    await idle(); await wait(30);
  }
  step('rfAV: Instant2D — hovering a length dimension shows the ball at its arrow end; dragging it shows a ruler and snaps to its ticks, finer near the ruler (2 near, 5 beside, 10 away; never under the document precision), one undo step; Esc puts it back; the ribbon toggle turns it off', async function () {
    var errs0 = errors.length;
    var f = await rfAVNew([{ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }], [['fix', ['0.p1']], ['horizontal', ['0']]], [{ e: 0, k: 'len', off: 8 }]);
    var btn = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (x) { return x.getAttribute('aria-label') === 'Instant2D'; })[0];
    assert(btn, 'Instant2D on the Sketch tab');
    UI.toggleInstant2D(true);   // (on by default; a ribbon walk earlier in the suite may have clicked it)
    var it = rfAVItem('d0'), bx = it.sc.box;
    selEv('mousemove', [(bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2], $('viewport')); await wait(20);
    var ball = rfAVBall();
    assert(ball && ball.getAttribute('data-key') === 'd0' && ball.getAttribute('data-kind') === 'linear', 'ball on hover');
    var h = UI.instant2DHandle(), tip = it.sc.lin.b;
    assert(Math.hypot(h.ball[0] - tip[0], h.ball[1] - tip[1]) < 0.5, 'at the arrow end ' + JSON.stringify([h.ball, tip]));
    assert(!D.querySelector('#i3d-layer .i3d-handle'), 'no Instant3D dot in the sketch (rfBA: none made)');
    var sN = UI.instant2DStepAt(2), sM = UI.instant2DStepAt(30), sF = UI.instant2DStepAt(90);
    assert(sN === 2 && sM === 5 && sF === 10, 'steps near / beside / away: ' + [sN, sM, sF]);
    var u0 = UI.App.undo.length, ticks = 0, mid = null;
    await rfAVDrag([[33, 2], [37.3, 2]], function () { ticks = D.querySelectorAll('#i2d-layer .i2d-tick').length; mid = UI.instant2DDrag(); });
    assert(ticks > 10 && mid && mid.value === 38 && mid.step === 2, 'ruler ' + ticks + ' ticks, ' + JSON.stringify(mid));
    near(f.entities[0].x2, 38, 1e-9, 'length 38 (37.3 snapped to the 2 tick)');
    assert(UI.App.undo.length === u0 + 1, 'one undo step: ' + (UI.App.undo.length - u0));
    UI.instant2DHandle('d0');
    await rfAVDrag([[44, 30], [37.3, 90]]);
    near(UI.activeSketchFeature().entities[0].x2, 40, 1e-9, 'away from the ruler: 10 steps (40)');
    await UI.undo(); await idle(); await UI.undo(); await idle();
    near(UI.activeSketchFeature().entities[0].x2, 30, 1e-9, 'undo, undo -> 30');
    // Esc during the drag: the value goes back, no undo step
    UI.App.dimsStale = false; UI.drawDims(true); UI.instant2DHandle('d0');
    u0 = UI.App.undo.length;
    var hb = UI.instant2DHandle();
    selEv('mousedown', hb.ball, rfAVBall()); selEv('mousemove', UI.instant2DPoint(50, 2)); await wait(40);
    near(UI.activeSketchFeature().entities[0].x2, 50, 1e-9, 'live 50');
    var p50 = UI.instant2DPoint(50, 2);
    selKey('Escape'); selEv('mouseup', p50); await wait(30);
    near(UI.activeSketchFeature().entities[0].x2, 30, 1e-9, 'Esc -> 30');
    assert(UI.App.undo.length === u0 && !UI.instant2DDrag(), 'no undo step, drag over');
    // the document precision: zoomed far in, the finest step is .001 in
    UI.zoomView(0.00002 / UI.cam.scale); UI.App.dimsStale = false; UI.drawDims(true);
    UI.instant2DHandle('d0');
    var finest = UI.unitLabel() === 'in' ? 0.001 : 0.01;   // the document's precision: .001 in, 0.01 mm
    assert(UI.instant2DStepAt(0) === finest, 'finest step ' + finest + ' ' + UI.unitLabel() + ': ' + UI.instant2DStepAt(0));
    UI.zoomView(0.25 / UI.cam.scale); UI.App.dimsStale = false; UI.drawDims(true);
    // the toggle
    btn.click(); await wait(20);
    assert(!UI.instant2DOn() && !UI.instant2DHandle('d0') && !rfAVBall(), 'off: no ball');
    btn.click(); await wait(20);
    assert(UI.instant2DOn() && UI.instant2DHandle('d0'), 'on again');
    assert(errors.length === errs0, 'no page errors: ' + errors.slice(errs0).join(' | '));
    return 'steps ' + [sN, sM, sF] + ', ' + ticks + ' ticks';
  });
  step('rfAV: Instant2D on a diameter (Ø16 → Ø20), an angle between two lines (45° → 60°, the line turns) and none on a driven dimension', async function () {
    var a = 45 * Math.PI / 180;
    var f = await rfAVNew([{ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'circle', cx: 50, cy: 20, r: 8 }, { t: 'line', x1: 0, y1: 0, x2: 20 * Math.cos(a), y2: 20 * Math.sin(a) }],
      [['fix', ['0']], ['coincident', ['0.p1', '2.p1']], ['angle', ['0', '2'], { off: 15 }]], [{ e: 1, k: 'dia', ang: 30 }, { e: 0, k: 'len', off: 8, driven: true }]);
    var ai = f.rels.length - 1;
    UI.toggleInstant2D(true);
    assert(f.rels[ai].type === 'angle' && Math.abs(f.rels[ai].v - 45) < 1e-6, 'angle 45 ' + JSON.stringify(f.rels[ai]));
    assert(!UI.instant2DHandle('d1') && !rfAVBall(), 'no ball on a driven dimension');
    // the diameter: the ball on the arrow at the circle
    var hc = UI.instant2DHandle('d0'), itc = rfAVItem('d0'), tip = itc.sc.arrows[0].tip;
    assert(hc && hc.kind === 'radial' && Math.hypot(hc.ball[0] - tip[0], hc.ball[1] - tip[1]) < 0.5, 'ball on the diameter arrow ' + JSON.stringify(hc));
    var u0 = UI.App.undo.length;
    await rfAVDrag([[18, 2], [19.6, 2]]);
    var c = UI.activeSketchFeature().entities[1];
    near(c.r, 10, 1e-9, 'Ø20');
    assert(UI.App.undo.length === u0 + 1, 'one undo step');
    // the angle: the ball on the second arrow, the ruler an arc
    UI.App.dimsStale = false; UI.drawDims(true);
    var ha = UI.instant2DHandle('r' + ai);
    assert(ha && ha.kind === 'angle' && Math.abs(ha.value - 45) < 1e-6, 'angle handle ' + JSON.stringify(ha));
    await rfAVDrag([[52, 2], [61.2, 2]]);
    var g = UI.activeSketchFeature(), l2 = g.entities[2];
    near(g.rels[ai].v, 60, 1e-9, 'angle 60 (61.2 snapped to the 5° tick)');
    near(Math.atan2(l2.y2 - l2.y1, l2.x2 - l2.x1) * 180 / Math.PI, 60, 1e-6, 'the line turned to 60°');
    near(g.entities[0].x2, 30, 1e-9, 'the fixed line stays');
    UI.toggleInstant2D(true);
    return 'Ø20, 60°';
  });
  step('rfAV: the Modify box knows angles — an angle reads °, spins 1° and stops at 180 (200 is refused); an Angular Running value reads °, spins round 359.5 → 0.5', async function () {
    var a = 45 * Math.PI / 180;
    var f = await rfAVNew([{ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 20 * Math.cos(a), y2: 20 * Math.sin(a) }, { t: 'line', x1: 0, y1: 0, x2: 0, y2: 25 }],
      [['fix', ['0']], ['coincident', ['0.p1', '1.p1']], ['coincident', ['0.p1', '2.p1']], ['angle', ['0', '1'], { off: 15 }]]);
    var ai = f.rels.length - 1;
    UI.openRelDimEdit(ai); await wait(20);
    var input = D.querySelector('#dim-edit input');
    assert(UI.isDimEditOpen() && UI.dimEditUnit() === '°', 'unit ° ' + UI.dimEditUnit());
    assert(UI.spinDimEdit(1) === 46, 'spin 1°');
    input.value = '175';
    assert(UI.spinDimEdit(1, { ctrlKey: true }) === 180, 'stops at 180');
    await wait(30);
    if (!UI.isDimEditOpen()) { UI.openRelDimEdit(ai); await wait(20); input = D.querySelector('#dim-edit input'); }   // (at 180 the lines are collinear: the preview has no angle to draw)
    input.value = '200';
    input.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await wait(20);
    assert(UI.isDimEditOpen() && /180/.test(D.querySelector('#dim-edit').getAttribute('data-error') || ''), '200 refused: ' + D.querySelector('#dim-edit').getAttribute('data-error'));
    UI.cancelDimEdit(); await wait(20);
    near(UI.activeSketchFeature().rels[ai].v, 45, 1e-9, 'still 45');
    // Angular Running: a set from the 0° line round to the vertical one
    var r = anvil.runningAngle({ vertex: '0.p1', datum: '0.p2', target: '2.p2', off: 10 });
    var g = UI.activeSketchFeature(), ri = r.index;
    assert(g.rels[ri] && g.rels[ri].type === 'runangle' && Math.abs(g.rels[ri].v - 90) < 1e-6, 'running 90 ' + JSON.stringify(g.rels[ri]));
    UI.App.dimsStale = false; UI.drawDims(true);
    UI.openRelDimEdit(ri); await wait(20);
    assert(UI.dimEditUnit() === '°', 'running value in ° ' + UI.dimEditUnit());
    input = D.querySelector('#dim-edit input');
    input.value = '359.5';
    assert(UI.spinDimEdit(1) === 0.5, 'wraps round: ' + UI.dimEditValue());
    UI.cancelDimEdit(); await wait(20);
    return 'angle ° 1° steps ≤ 180; running ° wraps';
  });
  step('rfAV: a line given Horizontal and Vertical keeps its length (the second is a conflict); deleting Horizontal turns it vertical at the same length', async function () {
    var f = await rfAVNew([{ t: 'line', x1: 0, y1: 0, x2: 30, y2: 2 }]);
    var h = W.SketchSolver.addRelation(f, 'horizontal', ['0']), L0 = Math.hypot(f.entities[0].x2 - f.entities[0].x1, f.entities[0].y2 - f.entities[0].y1);
    var v = W.SketchSolver.addRelation(f, 'vertical', ['0']);
    UI.updateSketches(); await wait(20);
    assert(h.status === 'ok' && v.status === 'conflict', 'V conflicts: ' + v.status);
    near(Math.hypot(f.entities[0].x2 - f.entities[0].x1, f.entities[0].y2 - f.entities[0].y1), L0, 1e-9, 'length kept');
    UI.deleteRelation(0); await idle(); await wait(20);
    var e = UI.activeSketchFeature().entities[0];
    near(e.x2 - e.x1, 0, 1e-6, 'vertical now');
    near(Math.hypot(e.x2 - e.x1, e.y2 - e.y1), L0, 1e-6, 'same length ' + JSON.stringify(e));
    return 'length ' + L0;
  });
  step('rfAV: relation icons round a 0.1 in notch line with four relations (Horizontal, Equal, Perpendicular, Parallel) never overlap each other or sit on a line, zoomed from 24 to 120 px and back', async function () {
    var f = await rfAVNew([{ t: 'line', x1: 0, y1: 0, x2: 0.1, y2: 0 }, { t: 'line', x1: 0.1, y1: 0, x2: 0.1, y2: 0.1 }, { t: 'line', x1: 0.1, y1: 0.1, x2: 1, y2: 0.1 }, { t: 'line', x1: 0, y1: 0, x2: 0, y2: -1 }],
      [['coincident', ['0.p2', '1.p1']], ['coincident', ['1.p2', '2.p1']], ['coincident', ['0.p1', '3.p1']], ['horizontal', ['0']], ['equal', ['0', '1']], ['perpendicular', ['0', '1']], ['parallel', ['0', '2']]]);
    var pl = UI.activePlane(), vr = $('viewport').getBoundingClientRect(), out = [];
    function segHit(p, q, b) {
      var dx = q[0] - p[0], dy = q[1] - p[1], t0 = 0, t1 = 1, P4 = [-dx, dx, -dy, dy], Q4 = [p[0] - b[0], b[2] - p[0], p[1] - b[1], b[3] - p[1]];
      for (var k = 0; k < 4; k++) { if (Math.abs(P4[k]) < 1e-12) { if (Q4[k] < 0) return false; continue; } var r = Q4[k] / P4[k]; if (P4[k] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } }
      return t1 - t0 > 1e-9;
    }
    var zooms = [24, 30, 45, 70, 120, 45, 24];
    for (var z = 0; z < zooms.length; z++) {
      UI.zoomView((0.1 / zooms[z]) / UI.cam.scale);
      var m = UI.worldToScreen(K.to3D(pl, 0.05, 0));
      UI.panView(UI.size.w / 2 - m[0], UI.size.h / 2 - m[1]);
      await wait(200);
      UI.App.dimsStale = false; UI.drawDims(true);
      var rects = Array.prototype.map.call(D.querySelectorAll('#dim-layer .rel-badge'), function (gg) { var b = gg.getBoundingClientRect(); return { b: [b.left - vr.left, b.top - vr.top, b.right - vr.left, b.bottom - vr.top], rel: gg.getAttribute('data-rel') }; });
      var segs = f.entities.map(function (e) { return [UI.worldToScreen(K.to3D(pl, e.x1, e.y1)), UI.worldToScreen(K.to3D(pl, e.x2, e.y2))]; });
      var onA = rects.filter(function (r) { return +r.rel >= 3; }).length;
      assert(onA >= 4, zooms[z] + ' px: the four relations shown (' + onA + ' icons)');
      rects.forEach(function (r, i) {
        var b = [r.b[0] + 1, r.b[1] + 1, r.b[2] - 1, r.b[3] - 1];
        segs.forEach(function (s, k) { assert(!segHit(s[0], s[1], b), zooms[z] + ' px: icon of relation ' + r.rel + ' on line ' + k + ' ' + JSON.stringify(r.b)); });
        rects.forEach(function (o, j) { if (j > i) assert(!(r.b[0] < o.b[2] - 1 && r.b[2] > o.b[0] + 1 && r.b[1] < o.b[3] - 1 && r.b[3] > o.b[1] + 1), zooms[z] + ' px: icons ' + r.rel + ' and ' + o.rel + ' overlap'); });
      });
      out.push(zooms[z] + ':' + rects.length);
    }
    UI.zoomView(0.25 / UI.cam.scale);
    return out.join(' ');
  });
  // --- end rfAV ---
