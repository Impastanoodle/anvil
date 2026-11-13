  // --- rfDS (2026-10-27, lane DS: sketch leftovers) --- Edit Circular / Linear Sketch Pattern hide the old instances
  // while the edit PM is open (✗ shows them again); Edit Linear Pattern on the right-click menu; the curvature-control
  // dimension drags (label), double-clicks (Modify box) and has an Instant2D ball; Fully Define Sketch with Ordinate in
  // one direction and Chain in the other through the PM. Real mouse events throughout.
  function rfDSPickable(f, i) { return !(UI.entityLayerHidden && UI.entityLayerHidden(f, f.entities[i])); }
  function rfDSHiddenDims() { return Array.prototype.filter.call(D.querySelectorAll('#dim-layer g.dim'), function (g) { return g.style.display === 'none'; }).length; }
  function rfDSRightClick(uv) {
    var p = rskScr(uv);
    selEv('mousedown', p, $('viewport'), { button: 2, buttons: 2 }); selEv('mouseup', p, null, { button: 2 });
  }
  function rfDSMenuRow(text) { return Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return m.textContent.indexOf(text) >= 0; })[0]; }
  function rfDSMenuText() { return Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (m) { return m.textContent; }).join(' | '); }
  step('rfDS: Edit Circular Pattern (right-click an instance) hides the old copies, construction lines and their dimensions while the PM is open, shows the preview in their place; ✗ brings them back unchanged; ✓ with 6 makes six', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.zoomView(0.1 / UI.cam.scale);
    var f = fxSk([{ t: 'circle', cx: 10, cy: 0, r: 1 }]);
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    UI.cmdCircularSketchPattern(); await wait(30);
    D.querySelector('[title="OK (Enter)"]').click(); await idle();
    f = UI.activeSketchFeature();
    var n0 = f.entities.length, json0 = JSON.stringify(f.entities);
    assert(f.entities.filter(function (e) { return e.t === 'circle'; }).length === 4, '4 holes: ' + json0);
    UI.App.dimsStale = true; UI.drawDims(true);
    assert(rfDSHiddenDims() === 0, 'no dimension hidden before the edit');
    var pat = f.rels.filter(function (r) { return r.type === 'pattern'; })[0], ci = +pat.refs[3], c = f.entities[ci];
    UI.setTool('select'); await wait(20);
    rfDSRightClick([c.cx + 1, c.cy]); await wait(30);
    var row = rfDSMenuRow('Edit Circular Pattern');
    assert(row, 'the right-click row: ' + rfDSMenuText());
    row.click(); await wait(40);
    assert(UI.pmTitle() === 'Edit Circular Pattern', 'the PM: ' + UI.pmTitle());
    assert(UI.sketchPatternEditHidden() === 5, 'hidden: 3 copies and 2 construction lines, got ' + UI.sketchPatternEditHidden());
    assert(!rfDSPickable(f, ci) && rfDSPickable(f, 0), 'a copy is hidden (not drawn, not picked), the seed stays');
    UI.App.dimsStale = true; UI.drawDims(true);
    assert(rfDSHiddenDims() >= 1, 'the pattern dimensions on the construction lines are hidden: ' + rfDSHiddenDims());
    assert(UI.App.tempEntities.length === 3, 'the preview shows 3 copies: ' + UI.App.tempEntities.length);
    setInput(D.querySelector('#pm [data-key="count"]'), '6'); await wait(30);
    assert(UI.App.tempEntities.length === 5, 'the preview follows the count: ' + UI.App.tempEntities.length);
    D.querySelector('[title="Cancel (Esc)"]').click(); await idle();
    f = UI.activeSketchFeature();
    assert(UI.sketchPatternEditHidden() === 0 && rfDSPickable(f, ci), 'shown again after ✗');
    assert(f.entities.length === n0 && JSON.stringify(f.entities) === json0, 'unchanged after ✗');
    UI.App.dimsStale = true; UI.drawDims(true);
    assert(rfDSHiddenDims() === 0, 'the dimensions are back');
    UI.editCircularPattern(0); await wait(40);
    assert(UI.sketchPatternEditHidden() === 5, 'the seed opens the edit too');
    setInput(D.querySelector('#pm [data-key="count"]'), '6'); await wait(30);
    D.querySelector('[title="OK (Enter)"]').click(); await idle();
    f = UI.activeSketchFeature();
    var circ = f.entities.filter(function (e) { return e.t === 'circle'; });
    assert(circ.length === 6 && UI.sketchPatternEditHidden() === 0, 'six holes, nothing hidden: ' + circ.length);
    assert(f.entities.every(function (e, i) { return rfDSPickable(f, i); }), 'every entity shown after ✓');
    assert(errors.length === errs0, 'no page errors: ' + errors.slice(errs0).join(' | '));
    return '4 → (✗) 4 → 6';
  });
  step('rfDS: Edit Linear Pattern — right-click an instance of a 3 × 10 linear pattern: the PM reopens with its settings, the old copies hidden, ✓ with 5 makes five at 10; a script-made pattern reads its spacing / count back', async function () {
    var errs0 = errors.length, S = W.SketchSolver;
    await rskNew();
    UI.zoomView(0.15 / UI.cam.scale);
    var f = fxSk([{ t: 'circle', cx: 5, cy: 5, r: 1 }]);
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    UI.cmdSketchPattern(); await wait(30);
    setInput(D.querySelector('#pm [data-key="spacing"]'), '10'); await wait(20);
    setInput(D.querySelector('#pm [data-key="count"]'), '3'); await wait(20);
    D.querySelector('[title="OK (Enter)"]').click(); await idle();
    f = UI.activeSketchFeature();
    assert(f.entities.filter(function (e) { return e.t === 'circle'; }).length === 3, '3 holes: ' + JSON.stringify(f.entities));
    var pat = f.rels.filter(function (r) { return r.type === 'pattern'; })[0];
    assert(pat && pat.pat.spec && pat.pat.spec.count === 3, 'the settings kept on the pattern: ' + JSON.stringify(pat && pat.pat));
    UI.setTool('select'); await wait(20);
    rfDSRightClick([26, 5]); await wait(30);
    var row = rfDSMenuRow('Edit Linear Pattern');
    assert(row, 'the right-click row: ' + rfDSMenuText());
    row.click(); await wait(40);
    assert(UI.pmTitle() === 'Edit Linear Pattern', 'the PM: ' + UI.pmTitle());
    near(+D.querySelector('#pm [data-key="count"]').value, 3, 0, 'count 3');
    near(parseFloat(D.querySelector('#pm [data-key="spacing"]').value), 10, 1e-9, 'spacing 10');
    assert(UI.sketchPatternEditHidden() === 2, 'the two copies hidden: ' + UI.sketchPatternEditHidden());
    setInput(D.querySelector('#pm [data-key="count"]'), '5'); await wait(30);
    assert(UI.App.tempEntities.length === 4, 'preview of 4 copies: ' + UI.App.tempEntities.length);
    D.querySelector('[title="OK (Enter)"]').click(); await idle();
    f = UI.activeSketchFeature();
    var xs = f.entities.filter(function (e) { return e.t === 'circle'; }).map(function (e) { return Math.round(e.cx * 1e6) / 1e6; }).sort(function (a, b) { return a - b; });
    assert(xs.join() === '5,15,25,35,45', 'five at 10: ' + xs.join());
    assert(f.rels.filter(function (r) { return r.type === 'pattern'; }).length === 1 && UI.sketchPatternEditHidden() === 0, 'one pattern, nothing hidden');
    // a pattern made by the solver call (as a script makes it: no PM settings on it): read back from its anchors
    f.entities.push({ t: 'circle', cx: 5, cy: 30, r: 1 });
    var si = f.entities.length - 1, r = S.linearPattern(f, [si], { angle1: 0, spacing1: 7, count1: 2, angle2: 90, spacing2: 4, count2: 3, skip: ['1,2'] });
    assert(r.ok, 'script pattern: ' + r.error);
    UI.updateSketches(); await idle();
    UI.editLinearPattern(r.copies[0]); await wait(40);
    assert(UI.pmTitle() === 'Edit Linear Pattern', 'opens: ' + UI.pmTitle());
    near(parseFloat(D.querySelector('#pm [data-key="spacing"]').value), 7, 1e-9, 'spacing 7');
    near(+D.querySelector('#pm [data-key="count"]').value, 2, 0, 'count 2');
    near(parseFloat(D.querySelector('#pm [data-key="spacing2"]').value), 4, 1e-9, 'spacing 2: 4');
    near(+D.querySelector('#pm [data-key="count2"]').value, 3, 0, 'count 2: 3');
    assert(UI.sketchPatternEditHidden() === 4, 'its 4 copies hidden: ' + UI.sketchPatternEditHidden());
    assert(UI.App.tempEntities.length === 4, 'the skipped instance stays skipped in the preview: ' + UI.App.tempEntities.length);
    D.querySelector('[title="Cancel (Esc)"]').click(); await idle();
    assert(UI.sketchPatternEditHidden() === 0, 'shown again');
    assert(errors.length === errs0, 'no page errors: ' + errors.slice(errs0).join(' | '));
    return xs.join(', ');
  });
  step('rfDS: the curvature-control dimension — drag its label (it moves, the value stays), double-click it (Modify box), and Instant2D shows a ball on its arrow; dragging the ball away from the centre of curvature makes the radius larger, one undo step', async function () {
    var errs0 = errors.length;
    await rskNew();
    var rfDSGrid = UI.App.view.showGrid; UI.App.view.showGrid = false;   // (lane ML2) put back what was found, not true
    try {
      var f = fxSk([{ t: 'spline', pts: [[0, 0], [10, 10], [20, 0], [30, -10], [40, 0]] }]);
      assert(UI.splineCurvatureControl(0, 1, 'on').ok, 'curvature control on point 2');
      f = UI.activeSketchFeature();
      W.SketchSolver.setDim(f, (f.dims = [{ e: 0, k: 'curv', i: 1, ang: 60, off: 6 }]).length - 1, 5);
      UI.updateSketches(); await idle();
      UI.toggleInstant2D(true);
      UI.App.dimsStale = false;
      var list = UI.drawDims(true), it = list.filter(function (x) { return x.d && x.d.k === 'curv'; })[0];
      assert(it && it.sc && it.sc.box, 'the R dimension drawn');
      near(K.dimValue(f.entities[0], f.dims[0]), 5, 1e-9, 'R5');
      var t = Array.prototype.filter.call(D.querySelectorAll('#dim-layer text'), function (x) { return x._d && x._d.d && x._d.d.k === 'curv'; })[0];
      assert(t, 'its label');
      var bx = it.sc.box, p0 = [(bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2], p1 = [p0[0] + 40, p0[1] - 30];
      var ang0 = f.dims[0].ang, off0 = f.dims[0].off;
      selEv('mousemove', p0, $('viewport'));
      selEv('mousedown', p0, t);
      for (var k = 1; k <= 6; k++) { selEv('mousemove', [p0[0] + (p1[0] - p0[0]) * k / 6, p0[1] + (p1[1] - p0[1]) * k / 6]); await wait(20); }
      selEv('mouseup', p1); await idle(); await wait(30);
      f = UI.activeSketchFeature();
      assert(f.dims[0].ang !== ang0 || f.dims[0].off !== off0, 'the label moved: ' + JSON.stringify([ang0, off0, f.dims[0]]));
      near(K.dimValue(f.entities[0], f.dims[0]), 5, 1e-9, 'the value stays R5');
      // double-click: the Modify box
      UI.App.dimsStale = false; list = UI.drawDims(true); it = list.filter(function (x) { return x.d && x.d.k === 'curv'; })[0];
      t = Array.prototype.filter.call(D.querySelectorAll('#dim-layer text'), function (x) { return x._d && x._d.d && x._d.d.k === 'curv'; })[0];
      bx = it.sc.box; p0 = [(bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2];
      await wait(500);
      selEv('mousedown', p0, t); selEv('mouseup', p0); selEv('mousedown', p0, t); selEv('mouseup', p0); await wait(30);
      assert(UI.isDimEditOpen(), 'the Modify box opens on a double-click');
      near(+D.querySelector('#dim-edit input').value, 5, 1e-9, 'showing 5');
      UI.cancelDimEdit(); await wait(20);
      // Instant2D: hover the label, the ball sits on the arrow (the spline point)
      UI.App.dimsStale = false; list = UI.drawDims(true); it = list.filter(function (x) { return x.d && x.d.k === 'curv'; })[0];
      bx = it.sc.box;
      UI.setSelection([]); UI.closePM && UI.closePM(); await wait(20);
      selEv('mousemove', [(bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2], $('viewport')); await wait(30);
      var ball = D.querySelector('#i2d-layer .i2d-handle');
      assert(ball && ball.getAttribute('data-kind') === 'radial', 'a ball on hover: ' + (ball && ball.outerHTML));
      var h = UI.instant2DHandle(), sp = rskScr([10, 10]);
      assert(Math.hypot(h.ball[0] - sp[0], h.ball[1] - sp[1]) < 1, 'on the spline point: ' + JSON.stringify([h.ball, sp]));
      near(h.value, 5, 1e-9, 'handle value 5');
      var u0 = UI.App.undo.length;
      selEv('mousedown', h.ball, ball);
      selEv('mousemove', UI.instant2DPoint(7, 2)); await wait(40);
      selEv('mousemove', UI.instant2DPoint(9, 2)); await wait(40);
      var mid = UI.instant2DDrag();
      assert(mid && mid.value > 5, 'a larger value while dragging: ' + JSON.stringify(mid));
      selEv('mouseup', UI.instant2DPoint(9, 2)); await idle(); await wait(30);
      f = UI.activeSketchFeature();
      var R = K.dimValue(f.entities[0], f.dims[0]);
      near(R, mid.value, 1e-9, 'dragged out to R' + mid.value + ' (ruler step ' + mid.step + ')');
      assert(Math.abs(R - 9) <= mid.step, 'about R9: ' + R);
      near(Math.abs(f.entities[0].tans[1][3]), 1 / R, 1e-12, 'the control follows');
      assert(UI.App.undo.length === u0 + 1, 'one undo step: ' + (UI.App.undo.length - u0));
      assert(errors.length === errs0, 'no page errors: ' + errors.slice(errs0).join(' | '));
      return 'R5 → R' + R.toFixed(3);
    } finally { UI.App.view.showGrid = rfDSGrid; UI.App.gridStale = true; }
  });
  step('rfDS: Fully Define Sketch — Horizontal scheme Ordinate, Vertical scheme Chain (PM selects), Calculate, ✓: fully defined with one horizontal ordinate set from the origin and no vertical one', async function () {
    var errs0 = errors.length, S = W.SketchSolver;
    await rskNew();
    fxSk([{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'line', x1: 40, y1: 0, x2: 40, y2: 20 }, { t: 'line', x1: 40, y1: 20, x2: 0, y2: 20 }, { t: 'line', x1: 0, y1: 20, x2: 0, y2: 0 },
      { t: 'circle', cx: 10, cy: 10, r: 2 }, { t: 'circle', cx: 28, cy: 6, r: 2 }],
      [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'coincident', refs: ['2.p2', '3.p1'] }, { type: 'coincident', refs: ['3.p2', '0.p1'] }]);
    UI.cmdFullyDefineSketch(); await wait(40);
    assert(UI.pmTitle() === 'Fully Define Sketch', 'the PM: ' + UI.pmTitle());
    var hs = D.querySelector('#pm select[data-key="hScheme"]'), vs = D.querySelector('#pm select[data-key="vScheme"]');
    assert(hs && vs && Array.prototype.some.call(hs.options, function (o) { return o.value === 'ordinate'; }), 'Ordinate offered');
    hs.value = 'ordinate'; hs.dispatchEvent(new W.Event('change', { bubbles: true })); await wait(20);
    vs = D.querySelector('#pm select[data-key="vScheme"]');
    vs.value = 'chain'; vs.dispatchEvent(new W.Event('change', { bubbles: true })); await wait(20);
    clickPmButton('Calculate'); await idle();
    D.querySelector('[title="OK (Enter)"]').click(); await idle();
    var f = UI.activeSketchFeature(), sets = S.ordinateSets(f), ids = Object.keys(sets);
    assert(S.analyze(f).status === 'full', 'fully defined: ' + S.analyze(f).status + ' (' + S.analyze(f).dof + ')');
    assert(ids.length === 1 && sets[ids[0]].axis === 'x' && sets[ids[0]].zero === 'O', 'one horizontal ordinate set from the origin: ' + JSON.stringify(sets));
    assert(sets[ids[0]].members.length >= 3, 'its members: ' + sets[ids[0]].members.length);
    UI.App.dimsStale = true; UI.drawDims(true);
    assert(errors.length === errs0, 'no page errors: ' + errors.slice(errs0).join(' | '));
    return sets[ids[0]].members.length + ' ordinate members';
  });
  step('rfDS: Edit Linear Pattern keeps its direction line when an entity drawn before it is deleted — Direction 1 picked on a 30° line (Line2), the point before it deleted, the edit shows the same line (now Line1)', async function () {
    var errs0 = errors.length;
    await rskNew();
    var f = fxSk([{ t: 'point', x: -20, y: 20 }, { t: 'line', x1: 0, y1: -10, x2: 17.3205080757, y2: 0 }, { t: 'circle', cx: 0, cy: 10, r: 1 }]);
    UI.setSelection([{ kind: 'entity', index: 2 }]);
    UI.cmdSketchPattern(); await wait(30);
    D.querySelectorAll('#pm .pm-pick')[0].click(); await wait(20);
    rskClick([8.66, -5]); await wait(30);
    var pick = D.querySelectorAll('#pm .pm-pick')[0];
    assert(/Line2/.test(pick.textContent), 'Direction 1 along Line2: ' + pick.textContent);
    D.querySelector('[title="OK (Enter)"]').click(); await idle();
    f = UI.activeSketchFeature();
    var pat = f.rels.filter(function (r) { return r.type === 'pattern'; })[0];
    assert(pat && pat.pat.spec && pat.pat.spec.ref1 === '1', 'ref1 saved as the line: ' + JSON.stringify(pat && pat.pat.spec));
    var line = f.entities[1];
    UI.setTool('select'); await wait(20);
    rskClick([-20, 20]); await wait(20);
    assert(UI.selection().length === 1, 'the point selected: ' + JSON.stringify(UI.selection()));
    selKey('Delete'); await idle();
    f = UI.activeSketchFeature();
    assert(!f.entities.some(function (e) { return e.t === 'point' && Math.abs(e.x + 20) < 1e-6; }), 'the point is gone: ' + JSON.stringify(f.entities));
    var li = f.entities.indexOf(line);
    assert(li === 0, 'the line is entity 0 now: ' + li);
    pat = f.rels.filter(function (r) { return r.type === 'pattern'; })[0];
    assert(pat.pat.spec.ref1 === '0', 'ref1 renumbered: ' + pat.pat.spec.ref1);
    var copy = f.entities[+pat.refs[pat.refs.length - 1]];
    rfDSRightClick([copy.cx + 1, copy.cy]); await wait(30);
    var row = rfDSMenuRow('Edit Linear Pattern');
    assert(row, 'the right-click row: ' + rfDSMenuText());
    row.click(); await wait(40);
    pick = D.querySelectorAll('#pm .pm-pick')[0];
    assert(/Line1/.test(pick.textContent), 'the Direction box shows the same line, now Line1: ' + pick.textContent);
    near(+D.querySelector('#pm [data-key="angle"]').value, 30, 1e-6, 'angle 30');
    D.querySelector('[title="Cancel (Esc)"]').click(); await idle();
    // the line itself deleted: the direction falls back to the axis word, the angle stays
    f = UI.activeSketchFeature();
    W.SketchSolver.removeEntity(f, 0); f.entities.splice(0, 1);
    pat = f.rels.filter(function (r) { return r.type === 'pattern'; })[0];
    assert(pat.pat.spec.ref1 === 'x' && pat.pat.spec.angle === 30, 'no line: the X-axis word, the angle kept: ' + JSON.stringify(pat.pat.spec));
    UI.updateSketches(); await idle();
    assert(errors.length === errs0, 'no page errors: ' + errors.slice(errs0).join(' | '));
    return 'Line2 → Line1';
  });
