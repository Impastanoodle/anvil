  // ---- rfAH (2026-10-12): Style Spline — one Bézier span of degree 3 / 5 / 7 shaped by its control polygon
  function rfAHFly() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb-fly'), function (w) { return w._fly && w._fly.fly === 'spline'; })[0]; }
  function rfAHMenuRow(text) { var m = D.querySelector('.menu'); return m && Array.prototype.filter.call(m.querySelectorAll('.mi'), function (r) { return r.textContent.indexOf(text) >= 0; })[0]; }
  function rfAHRadio(label) { var r = pmField(label); assert(r && r.type === 'radio', 'radio ' + label); r.checked = true; r.dispatchEvent(new W.Event('change', { bubbles: true })); }
  step('rfAH: Style Spline — Spline ▸ Style Spline opens its PM (Spline Degree 3 / 5 / 7); four clicks make a degree-3 curve through its end vertices (the first on the origin), Degree 5 elevates it, six clicks end a degree-5 one; the control polygon is drawn', async function () {
    var errs0 = errors.length;
    UI.loadModel(K.newModel('StyleSplines')); await idle();
    UI.cmdSketch(); clickPmButton('Front Plane'); await idle();
    UI.zoomView(1); UI.refreshRibbon();
    var fl = rfAHFly();
    assert(fl, 'Spline flyout');
    var caret = fl.querySelector('.rb-caret');
    caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click();
    var row = rfAHMenuRow('Style Spline');
    assert(row && !row.classList.contains('disabled') && !row.hasAttribute('disabled'), 'Style Spline enabled in the flyout');
    row.click(); await idle();
    assert(UI.App.tool === 'styleSpline' && UI.pmTitle() === 'Style Spline', 'tool ' + UI.App.tool + ', PM ' + UI.pmTitle());
    assert(pmField('Degree 3') && pmField('Degree 5') && pmField('Degree 7') && pmField('Degree 3').checked && pmField('Show curvature') && pmField('For construction'), 'Style Spline PM');
    var f = activeSketch();
    skClick(0, 0); skClick(10, 30); skClick(30, 30);
    vpEvent('mousemove', skScreen(40, 0));
    var te = UI.App.tempEntities;
    assert(te.length === 2 && te[0].t === 'spline' && te[0].style && te[1].t === 'polyline' && te[1].construction, 'preview: the curve and its control polygon ' + JSON.stringify(te));
    skClick(40, 0);
    await wait(30);
    var e = f.entities[0];
    assert(f.entities.length === 1 && e.t === 'spline' && e.style && e.pts.length === 4, 'ends by itself at 4 vertices: ' + JSON.stringify(f.entities));
    assert(JSON.stringify(e.pts) === '[[0,0],[10,30],[30,30],[40,0]]', 'vertices where clicked ' + JSON.stringify(e.pts));
    assert(relList().indexOf('coincident 0.p1/O') >= 0, 'starts on the origin: ' + relList().join(', '));
    assert(UI.App.tool === 'styleSpline' && UI.pmTitle() === 'Style Spline', 'the tool stays on');
    var mid = K.bzPoint(e.pts, 0.5);
    near(mid[0], 20, 1e-9, 'curve mid x'); near(mid[1], 22.5, 1e-9, 'curve mid y');
    // Degree 5 in the tool's PM: the one just drawn is elevated (the same curve), the next one is of degree 5
    rfAHRadio('Degree 5'); await wait(20);
    e = f.entities[0];
    assert(e.pts.length === 6, 'elevated to degree 5: ' + JSON.stringify(e.pts));
    var m5 = K.bzPoint(e.pts, 0.5);
    assert(Math.abs(m5[0] - 20) < 1e-6 && Math.abs(m5[1] - 22.5) < 1e-6, 'the same curve ' + m5);
    [[0, -20], [10, -40], [20, -10], [30, -40], [40, -10]].forEach(function (q) { skClick(q[0], q[1]); });
    assert(f.entities.length === 1, 'not yet: five vertices of six');
    skClick(50, -30);
    await wait(30);
    var e2 = f.entities[1];
    assert(f.entities.length === 2 && e2.style && e2.pts.length === 6, 'six clicks end a degree-5 style spline ' + JSON.stringify(e2));
    await wait(260);
    assert(UI.styleSplineOverlay() >= 1, 'control polygons drawn');
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(260);
    assert(UI.App.tool === 'select' && !UI.hasPM(), 'Esc puts the tool down');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return f.entities.map(function (x) { return 'degree ' + (x.pts.length - 1); }).join(', ');
  });
  step('rfAH: selecting a style spline opens the Style Spline PM on the vertex clicked: X / Y move it (the curve follows), Horizontal on a control polygon leg, Degree 7 / 3; Trim cuts it to a style spline of the same degree; the script round-trips; extruded and on a drawing', async function () {
    var errs0 = errors.length, f = activeSketch();
    UI.setTool('select');
    skClick(10, -40);
    assert(UI.pmTitle() === 'Style Spline', 'PM ' + UI.pmTitle());
    assert(+pmField('Control vertex number').value === 2 && +pmField('X Coordinate').value === 10 && pmField('Degree 5').checked, 'vertex 2 picked: ' + pmField('Control vertex number').value);
    setInput(pmField('Y Coordinate'), -45);
    assert(f.entities[1].pts[1][1] === -45, 'moved: ' + JSON.stringify(f.entities[1].pts));
    clickPmButton('Horizontal'); await wait(20);
    assert(relList().indexOf('horizontal 1.v1/1.v2') >= 0, 'leg 2–3 horizontal: ' + relList().join(', '));
    near(f.entities[1].pts[2][1], f.entities[1].pts[1][1], 1e-9, 'the leg is horizontal');
    rfAHRadio('Degree 7'); await wait(20);
    assert(f.entities[1].pts.length === 8 && UI.pmTitle() === 'Style Spline', 'degree 7: ' + f.entities[1].pts.length);
    rfAHRadio('Degree 3'); await wait(20);
    var e1 = f.entities[1];
    assert(e1.pts.length === 4 && Math.abs(e1.pts[0][0]) < 1e-9 && Math.abs(e1.pts[3][0] - 50) < 1e-9, 'degree 3, the same ends: ' + JSON.stringify(e1.pts));
    await UI.pmOK();
    // Trim to closest against a line across the first one
    UI.setTool('line'); skClick(20, -5); skClick(20, 40); UI.cancelTool();
    var n0 = f.entities.length, r = W.SketchSolver.trimAt(f, 0, [36, 12], {});
    UI.updateSketches();
    var pc = f.entities.filter(function (x) { return x.style && x.pts.length === 6; });
    assert(r.ok && f.entities.length === n0 && pc.length === 1 && Math.abs(pc[0].pts[5][0] - 20) < 1e-6, 'trimmed to a degree-5 piece ending on the line: ' + JSON.stringify([r, pc]));
    // the script: generateScript → runScript gives the same sketch
    var src = anvil.script();
    assert(/\.styleSpline\(/.test(src) && /degree: 5 \}/.test(src) && /degree: 3 \}/.test(src), 'script ' + src);
    await anvil.run(src); await idle();
    var sk2 = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    assert(JSON.stringify(sk2.entities.filter(function (x) { return x.style; })) === JSON.stringify(f.entities.filter(function (x) { return x.style; })), 'the same style splines after the round trip');
    // a closed profile: a degree-7 style spline closed by a line, extruded, on a drawing
    await anvil.run('p.units("in");\np.sketch("Front").styleSpline([[0, 0], [0.5, 1], [1.5, 1.2], [2.5, 0.8], [3, 0]], { degree: 7 }).line(3, 0, 0, 0).extrude(0.25);'); await idle();
    var v = anvil.mass().volume;
    var P7 = UI.App.model.features[0].entities[0].pts, A7 = 0, N7 = 4000;
    for (var q7 = 0; q7 < N7; q7++) { var a7 = K.bzPoint(P7, q7 / N7), b7 = K.bzPoint(P7, (q7 + 1) / N7); A7 += (a7[0] * b7[1] - b7[0] * a7[1]) / 2; }
    assert(P7.length === 8 && Math.abs(v / (Math.abs(A7) * 0.25) - 1) < 1e-5, 'volume ' + v + ' vs the area of the curve x depth ' + Math.abs(A7) * 0.25);
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready();
    var sm = anvil.drawing.summary();
    assert(sm.views.length >= 3, 'drawing views ' + sm.views.length);
    anvil.drawing.close(); await idle();
    UI.ribbonFlyFace('spline', 0);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'volume ' + v.toFixed(4) + ' in³, ' + sm.views.length + ' views';
  });
  // --- end rfAH ---
