  // ---- rfKL (local-2026-11-09a, lane fitspline2): a Constrained fit spline copied and pasted with its chain gets its own
  // link: dragging the pasted chain refits the pasted spline only. Uses rfKE's helpers (rfKENew, rfKEScr, rfKEEv).
  step('rfKL: Ctrl+C / paste of a Constrained fit spline with its chain: the copy follows the pasted chain when it is dragged, the original stays; Fit Spline on 3 lines + 2 tangent arcs makes few control points', async function () {
    var errs0 = errors.length, f = await rfKENew();
    var r = UI.fitSpline(f, [0, 1, 2, 3, 4], { tol: 0.025, mode: 'constrained', del: false });
    assert(r.ok && r.points <= 20, 'few control points: ' + r.points);
    UI.updateSketches(); await wait(20);
    UI.setSelection([0, 1, 2, 3, 4, 5].map(function (i) { return { kind: 'entity', index: i }; })); await wait(10);
    assert(UI.sketchCopy(), 'copied');
    UI.zoomView(2); await wait(20);
    var cc = UI.worldToScreen(K.to3D(UI.activePlane(), 60, 25));
    UI.panView(UI.size.w / 2 - cc[0], UI.size.h / 2 - cc[1]); await wait(20);
    var p = UI.sketchPaste([85, 25]);
    assert(p && p.count === 6, 'pasted six: ' + JSON.stringify(p));
    f = UI.activeSketchFeature();
    var o = f.entities[5], c = f.entities[p.first + 5];
    assert(K.isBSpline(c) && c.fit && c.fit.id !== o.fit.id, 'own link id: ' + JSON.stringify([o.fit, c.fit]));
    assert(f.entities.slice(p.first, p.first + 5).every(function (e) { return e.fitSrc === c.fit.id; }), 'copied chain carries the new id');
    var oPts = JSON.stringify(o.pts), ln = f.entities[p.first + 4], end0 = [ln.x2, ln.y2];
    UI.setSelection([]); UI.App.sel = null; await wait(10);
    var a = rfKEScr(end0), b = rfKEScr([end0[0] - 10, end0[1]]), rr = $('viewport').getBoundingClientRect();
    assert(a[0] > rr.left && a[0] < rr.right && b[0] > rr.left && a[1] > rr.top && a[1] < rr.bottom, 'drag points on screen');
    rfKEEv('mousemove', a); await wait(10);
    rfKEEv('mousedown', a); await wait(10);
    for (var s = 1; s <= 6; s++) { rfKEEv('mousemove', [Math.round(a[0] + (b[0] - a[0]) * s / 6), Math.round(a[1] + (b[1] - a[1]) * s / 6)]); await wait(15); }
    rfKEEv('mouseup', b); await wait(40);
    f = UI.activeSketchFeature();
    ln = f.entities[p.first + 4]; c = f.entities[p.first + 5]; o = f.entities[5];
    assert(Math.abs(ln.x2 - (end0[0] - 10)) < 1.5, 'the pasted line end moved: ' + JSON.stringify(ln));
    var P = c.pts[c.pts.length - 1];
    near(P[0], ln.x2, 1e-6, 'the pasted spline follows x'); near(P[1], ln.y2, 1e-6, 'y');
    assert(JSON.stringify(o.pts) === oPts, 'the original spline stays');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return r.points + ' control points; ids ' + o.fit.id + ' / ' + c.fit.id;
  });
