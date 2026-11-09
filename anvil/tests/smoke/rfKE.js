  // ---- rfKE (local-2026-11-09a, lane fitspline): Fit Spline makes ONE B-spline entity (knots + control points) within
  // the PM's Tolerance; Delete geometry / Constrained / Unconstrained / Fixed; a Constrained spline follows its source
  // chain when a source is dragged; the B-spline's own PM, Insert Spline Point, Simplify Spline, undo
  function rfKEScr(uv) { var p = UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])), r = $('viewport').getBoundingClientRect(); return [Math.round(r.left + p[0]), Math.round(r.top + p[1])]; }
  function rfKEEv(type, c, mods) {
    (type === 'mousedown' ? $('viewport') : W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: c[0], clientY: c[1] }, mods || {})));
  }
  async function rfKEClick(uv) { var c = rfKEScr(uv); rfKEEv('mousemove', c); rfKEEv('mousedown', c); rfKEEv('mouseup', c); await wait(15); }
  // 3 lines + 2 tangent arcs (mm): 40 along, R10 up, 20 up, R20 over, 30 back
  function rfKEChain() {
    return [{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'arc', cx: 40, cy: 10, r: 10, a0: -90, a1: 0 }, { t: 'line', x1: 50, y1: 10, x2: 50, y2: 30 },
      { t: 'arc', cx: 30, cy: 30, r: 20, a0: 0, a1: 90 }, { t: 'line', x1: 30, y1: 50, x2: 0, y2: 50 }];
  }
  // a point on each chain entity, for clicking it
  var RFKE_ON = [[20, 0], [40 + 10 * Math.SQRT1_2, 10 - 10 * Math.SQRT1_2], [50, 20], [30 + 20 * Math.SQRT1_2, 30 + 20 * Math.SQRT1_2], [15, 50]];
  async function rfKENew() {
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    UI.zoomView(0.15 / UI.cam.scale);
    var cc = UI.worldToScreen(K.to3D(UI.activePlane(), 25, 25));
    if (UI.panView) UI.panView(UI.size.w / 2 - cc[0], UI.size.h / 2 - cc[1]);
    var f = UI.activeSketchFeature();
    rfKEChain().forEach(function (e) { f.entities.push(e); });
    f.rels = [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'coincident', refs: ['2.p2', '3.p1'] }, { type: 'coincident', refs: ['3.p2', '4.p1'] }];
    UI.updateSketches(); await wait(20);
    RFKE_ON.forEach(function (uv) { var c = rfKEScr(uv), r = $('viewport').getBoundingClientRect(); assert(c[0] > r.left && c[0] < r.right && c[1] > r.top && c[1] < r.bottom, 'click point on screen ' + uv); });
    return f;
  }
  // how far spline e and the chain stray from each other (chain samples to the spline)
  function rfKEDev(e, ch) {
    var S = W.SketchSolver, fc = S.freeCurve(e), m = 0;
    ch.forEach(function (c) {
      for (var k = 0; k <= 40; k++) {
        var p = c.t === 'line' ? [c.x1 + (c.x2 - c.x1) * k / 40, c.y1 + (c.y2 - c.y1) * k / 40] : (function () { var a = (c.a0 + (c.a1 - c.a0) * k / 40) * Math.PI / 180; return [c.cx + c.r * Math.cos(a), c.cy + c.r * Math.sin(a)]; })();
        m = Math.max(m, S.freeClosest(fc, p).d);
      }
    });
    return m;
  }
  step('rfKE: Fit Spline (Tools ▸ Spline Tools) on 3 lines + 2 tangent arcs picked by clicks: ONE B-spline within the Tolerance typed in the PM (Delete geometry), one undo step; its PM is Spline (no degree choice); Insert Spline Point keeps the curve', async function () {
    var errs0 = errors.length, f = await rfKENew(), ch = rfKEChain();
    UI.cmdFitSpline(); await wait(20);
    assert(UI.pmTitle() === 'Fit Spline', 'PM ' + UI.pmTitle());
    for (var i = 0; i < RFKE_ON.length; i++) await rfKEClick(RFKE_ON[i]);
    assert(/5 entities selected/.test($('pm').textContent), 'five picked: ' + $('pm').textContent.slice(0, 200));
    assert(['Delete geometry', 'Closed spline', 'Constrained', 'Unconstrained', 'Fixed', 'Tolerance'].every(function (t) { return $('pm').textContent.indexOf(t) >= 0; }), 'SolidWorks 2024 parameters');
    var tolBox = pmField('Tolerance');
    assert(tolBox, 'Tolerance box');
    setInput(tolBox, '0.01'); await wait(20);
    assert(D.querySelectorAll('polyline.sk-preview').length === 1, 'the fitted spline previewed: ' + D.querySelectorAll('polyline.sk-preview').length);
    var u0 = UI.App.undo.length;
    UI.pmOK(); await wait(40);
    f = UI.activeSketchFeature();
    assert(f.entities.length === 1, 'one entity in place of the chain: ' + f.entities.length);
    var sp = f.entities[0];
    assert(K.isBSpline(sp) && sp.deg === 3 && sp.knots.length === sp.pts.length + 4, 'a cubic B-spline: ' + JSON.stringify(sp).slice(0, 200));
    var dv = rfKEDev(sp, ch);
    assert(dv < 0.01, 'within .01 mm of the chain: ' + dv);
    assert(UI.App.undo.length === u0 + 1, 'one undo step');
    assert(/Fit Spline: one spline of \d+ spans?/.test(statusText()), 'status: ' + statusText());
    // its PropertyManager
    UI.setSelection([{ kind: 'entity', index: 0 }]); await wait(10);
    UI.sketchEntityPMs.spline(0, sp, f); await wait(20);
    assert(UI.pmTitle() === 'Spline' && $('pm').textContent.indexOf('Spline Degree') < 0 && $('pm').textContent.indexOf('B-spline') >= 0, 'B-spline PM: ' + UI.pmTitle());
    UI.pmCancel(); await wait(10);
    // Insert Spline Point: one control point more, the same curve
    var fc = W.SketchSolver.freeCurve(sp), at = fc.pt(0.41), orig = JSON.parse(JSON.stringify(sp)), n0 = sp.pts.length;
    UI.cmdInsertSplinePoint(); await wait(20);
    await rfKEClick(at); await wait(20);
    sp = UI.activeSketchFeature().entities[0];
    assert(sp.pts.length === n0 + 1, 'a control point more: ' + sp.pts.length);
    var fo = W.SketchSolver.freeCurve(orig), fn = W.SketchSolver.freeCurve(sp), m = 0;
    for (var k = 0; k <= 100; k++) m = Math.max(m, W.SketchSolver.freeClosest(fn, fo.pt(k / 100)).d);
    assert(m < 1e-6, 'the curve is unchanged: ' + m);
    UI.pmCancel(); await wait(10);
    // undo twice: the chain is back
    UI.undo(); await wait(20); UI.undo(); await wait(20);
    assert(UI.activeSketchFeature().entities.length === 5, 'undo brings the chain back');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return (sp.knots.length - 7) + ' spans, deviation ' + dv.toExponential(2);
  });
  step('rfKE: Fit Spline Constrained (Delete geometry off): the chain turns construction and stays; dragging the free end of the last line refits the spline to it; Fixed adds a Fix relation', async function () {
    var errs0 = errors.length, f = await rfKENew();
    UI.setSelection([0, 1, 2, 3, 4].map(function (i) { return { kind: 'entity', index: i }; })); await wait(10);
    UI.cmdFitSpline(); await wait(20);
    var del = Array.prototype.filter.call(D.querySelectorAll('#pm label'), function (l) { return /Delete geometry/.test(l.textContent); })[0];
    var cb = del && (del.querySelector('input') || del.parentNode.querySelector('input[type=checkbox]'));
    assert(cb && cb.checked, 'Delete geometry on by default');
    cb.click(); await wait(20);
    UI.pmOK(); await wait(40);
    f = UI.activeSketchFeature();
    assert(f.entities.length === 6, 'the chain stays: ' + f.entities.length);
    var sp = f.entities[5];
    assert(K.isBSpline(sp) && sp.fit && f.entities.slice(0, 5).every(function (e) { return e.construction && e.fitSrc === sp.fit.id; }), 'linked, chain construction');
    assert((f.rels || []).some(function (r) { return r.type === 'coincident' && r.refs.indexOf('5.p2') >= 0; }), 'end Coincident');
    // drag the free end of the last line (0, 50) to (-10, 50) with the mouse
    UI.setSelection([]); UI.App.sel = null; await wait(10);
    var a = rfKEScr([0, 50]), b = rfKEScr([-10, 50]);
    rfKEEv('mousemove', a); await wait(10);
    rfKEEv('mousedown', a); await wait(10);
    for (var s = 1; s <= 6; s++) { rfKEEv('mousemove', [Math.round(a[0] + (b[0] - a[0]) * s / 6), Math.round(a[1] + (b[1] - a[1]) * s / 6)]); await wait(15); }
    rfKEEv('mouseup', b); await wait(40);
    f = UI.activeSketchFeature();
    var ln = f.entities[4];
    assert(Math.abs(ln.x2 - -10) < 1.5, 'the line end moved: ' + JSON.stringify(ln));
    sp = f.entities[5];
    var P = sp.pts[sp.pts.length - 1];
    near(P[0], ln.x2, 1e-6, 'spline end follows x'); near(P[1], ln.y2, 1e-6, 'spline end follows y');
    var dv = rfKEDev(sp, f.entities.slice(0, 5));
    assert(dv < 0.025, 'refitted within the tolerance: ' + dv);
    // Fixed
    var g = await rfKENew();
    var r = UI.fitSpline(g, [0, 1, 2, 3, 4], { tol: 0.025, mode: 'fixed', del: true });
    assert(r.ok && (g.rels || []).some(function (x) { return x.type === 'fix' && x.refs[0] === String(r.index); }), 'Fix relation: ' + JSON.stringify(g.rels));
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'end ' + P.map(function (x) { return x.toFixed(3); }).join(', ') + ', deviation ' + dv.toExponential(2);
  });
  step('rfKE: Simplify Spline on a fit B-spline drops spans within its tolerance; Show Spline Handles shows its control polygon; Tools menu has Make Path, Close Sketch to Model, Align Grid/Origin, Create Sketch from Selections, Fit Spline', async function () {
    var errs0 = errors.length, f = await rfKENew();
    var r = UI.fitSpline(f, [0, 1, 2, 3, 4], { tol: 0.001, del: true });
    assert(r.ok, JSON.stringify(r));
    UI.updateSketches(); await wait(20);
    var e = f.entities[0], n0 = e.pts.length, s = UI.simplifySpline(e, 0.05);
    assert(K.isBSpline(s.e) && s.e.pts.length < n0 && s.dev <= 0.05, 'simplified ' + n0 + ' -> ' + s.e.pts.length + ', ' + s.dev);
    UI.cmdShowSplineHandles(); await wait(20);
    assert(UI.splineView.handles && UI.styleSplineOverlay() > 0, 'control polygon drawn');
    UI.cmdShowSplineHandles(); await wait(10);
    ['Sketch Tools ▸ Make Path', 'Sketch Tools ▸ Close Sketch to Model', 'Sketch Tools ▸ Align ▸ Grid/Origin', 'Sketch Tools ▸ Create Sketch from Selections', 'Spline Tools ▸ Fit Spline'].forEach(function (t) {
      var rows = menuRows(t);
      assert(rows.length === 1 && /Tools/.test(rows[0].menu) && !rows[0].row.classList.contains('disabled'), 'Tools row ' + t + ': ' + JSON.stringify(rows.map(function (x) { return x.menu.slice(0, 20) + ' / ' + x.text; })));
    });
    if (UI.closeMenus) UI.closeMenus();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return n0 + ' -> ' + s.e.pts.length + ' control points';
  });
