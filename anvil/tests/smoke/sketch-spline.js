  // ---- sketch-spline: Spline, Ellipse and Partial Ellipse drawn like a user (ui-sketch-spline.js)
  function splRibbonButton(label) { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return (b.getAttribute('aria-label') || '') === label; })[0]; }
  step('sketch-spline: the Spline, Ellipse ▸ Partial Ellipse buttons are live in a sketch and open their PropertyManager at once; a closed spline (click its first point) and a 3-click ellipse; ✓ puts the tool down', async function () {
    var errs0 = errors.length;
    UI.loadModel(K.newModel('Splines')); await idle();
    UI.cmdSketch(); clickPmButton('Front Plane'); await idle();
    UI.zoomView(1); UI.refreshRibbon();
    var sb = splRibbonButton('Spline'), eb = splRibbonButton('Ellipse');
    assert(sb && !sb.disabled && eb && !eb.disabled, 'Spline / Ellipse buttons enabled in a sketch');
    sb.click();
    assert(UI.App.tool === 'spline' && UI.pmTitle() === 'Spline', 'tool ' + UI.App.tool + ', PM ' + UI.pmTitle());
    assert(pmField('Show curvature') && pmField('Maintain internal continuity') && pmField('For construction'), 'Spline PM Options');
    skClick(-10, -30); skClick(10, -40); skClick(30, -30); skClick(10, -15);
    vpEvent('mousemove', skScreen(-10.1, -30));
    assert(UI.App.tempEntities.length === 1 && UI.App.tempEntities[0].closed, 'the preview closes on the first point');
    skClick(-10, -30);
    var f = activeSketch();
    assert(f.entities.length === 1 && f.entities[0].t === 'spline' && f.entities[0].closed && f.entities[0].pts.length === 4, JSON.stringify(f.entities));
    assert(UI.App.tool === 'spline', 'the tool stays on for the next spline');
    UI.setTool('ellipse');
    assert(UI.pmTitle() === 'Ellipse', 'Ellipse PM on the tool: ' + UI.pmTitle());
    skClick(0, 0); skClick(25, 0); skClick(8, 10);
    await wait(30);
    var e = f.entities[1];
    assert(e && e.t === 'ellipse' && e.rx === 25 && e.ry === 10 && e.rot === 0, JSON.stringify(e));
    assert(relList().indexOf('coincident 1.c/O') >= 0, 'centre on the origin: ' + relList().join(', '));
    // the tool PM now shows the ellipse just drawn; a typed minor radius changes it
    setInput(pmField('Minor radius'), 8);
    assert(f.entities[1].ry === 8, 'typed minor radius: ' + JSON.stringify(f.entities[1]));
    await UI.pmOK();
    assert(UI.App.tool === 'select' && !UI.hasPM(), '✓ puts the tool down: ' + UI.App.tool);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return f.entities.map(function (x) { return x.t; }).join(', ');
  });
  step('sketch-spline: Partial Ellipse (centre, major end, start, round to the end), an open spline ended by a double-click and joined to a line; Esc ends a spline in progress', async function () {
    var f = activeSketch();
    UI.setTool('pellipse');
    assert(UI.pmTitle() === 'Ellipse', 'PM ' + UI.pmTitle());
    skClick(45, 20); skClick(60, 20); skClick(52, 26);
    [[48, 27], [42, 25], [36, 20], [40, 14]].forEach(function (q) { vpEvent('mousemove', skScreen(q[0], q[1])); });
    skClick(40, 14);
    await wait(30);
    var pe = f.entities[2];
    assert(pe && pe.t === 'pellipse' && pe.rx === 15 && pe.a1 > pe.a0 && pe.a1 - pe.a0 > 150 && pe.a1 - pe.a0 < 270, JSON.stringify(pe));
    UI.setTool('line'); skClick(-40, 20); skClick(-20, 20); UI.cancelTool();
    UI.setTool('spline');
    skClick(-20, 20); skClick(-10, 30); skClick(0, 20);
    var p = skScreen(10, 30);
    skClick(10, 30); skClick(10, 30);
    var r = $('viewport').getBoundingClientRect();
    $('viewport').dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true, clientX: r.left + p[0], clientY: r.top + p[1] }));
    var sp = f.entities[f.entities.length - 1];
    assert(sp.t === 'spline' && !sp.closed && sp.pts.length === 4, 'double-click ends it with 4 points: ' + JSON.stringify(sp));
    assert(relList().indexOf('coincident ' + (f.entities.length - 1) + '.p1/' + (f.entities.length - 2) + '.p2') >= 0, 'starts on the line end: ' + relList().join(', '));
    skClick(-40, -40); skClick(-35, -35); skClick(-30, -40);
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(UI.App.tool === 'select' && f.entities[f.entities.length - 1].pts.length === 3, 'Esc keeps the 3-point spline and puts the tool down');
    await wait(260);
    assert(!UI.hasPM(), 'the tool PM went with the tool: ' + UI.pmTitle());
    return f.entities.length + ' entities';
  });
  step('sketch-spline: selecting a spline opens the Spline PM on the point clicked; X / Y, Tangent Driving and Show curvature edit it; selecting the ellipse opens the Ellipse PM (Angle turns it)', async function () {
    var f = activeSketch();
    UI.setTool('select');
    skClick(30, -30);
    assert(UI.pmTitle() === 'Spline', 'PM ' + UI.pmTitle());
    assert(+pmField('Spline point number').value === 3 && +pmField('X Coordinate').value === 30, 'point 3 picked: ' + pmField('Spline point number').value);
    setInput(pmField('X Coordinate'), 34);
    assert(f.entities[0].pts[2][0] === 34, 'moved: ' + JSON.stringify(f.entities[0].pts));
    pmField('Tangent Driving').click(); await wait(20);
    assert(f.entities[0].tans && f.entities[0].tans[2] && pmField('Tangent Radial Direction'), 'tangent driving on: ' + JSON.stringify(f.entities[0].tans));
    setInput(pmField('Tangent Radial Direction'), 100);
    assert(f.entities[0].tans[2][0] === 100, 'radial direction');
    pmField('Show curvature').click();
    assert(f.entities[0].showCurvature && UI.splineComb(f.entities[0]).length > 50, 'curvature comb');
    await UI.pmOK();
    skClick(-12.5, -8.66);   // rfH: on the curve (an axis end selects as a point, as in SolidWorks)
    assert(UI.pmTitle() === 'Ellipse' && pmField('Major radius') && pmField('Angle'), 'Ellipse PM: ' + UI.pmTitle());
    setInput(pmField('Angle'), 30);
    near(f.entities[1].rot, 30, 1e-9, 'angle');
    await UI.pmOK();
    return 'spline point 3 at ' + f.entities[0].pts[2].join(', ');
  });
  step('sketch-spline: exit and extrude: the closed spline and the ellipse are bodies of their exact areas; sketch DXF R2000 has SPLINE / ELLIPSE, R12 only chained ARCs and LINEs; the script round-trips', async function () {
    var sid = UI.App.activeSketch, f = activeSketch();
    var spl = f.entities[0], e = f.entities[1], g = K.splineGeom(spl), A = 0;
    g.bez.forEach(function (B) { var N = 2000; for (var i = 0; i < N; i++) { var p = K.bezPoint(B, i / N), q = K.bezPoint(B, (i + 1) / N); A += (p[0] * q[1] - q[0] * p[1]) / 2; } });
    // leave only the two closed curves in the profile (the open pieces would only warn)
    var r12 = anvil.dxfOutput({ export: 'sketch', version: 'R12' }), r2k = anvil.dxfOutput({ export: 'sketch', version: 'R2000' });
    assert(/\n0\nSPLINE\n/.test(r2k) && (r2k.match(/\n0\nELLIPSE\n/g) || []).length === 2, 'R2000: SPLINE and two ELLIPSEs');
    assert(!/\n0\n(SPLINE|ELLIPSE)\n/.test(r12) && (r12.match(/\n0\nARC\n/g) || []).length > 20, 'R12: arcs only');
    await UI.exitSketch(); await idle();
    UI.App.sel = { kind: 'feature', id: sid };
    UI.cmdExtrude(false); setInput(pmNumber(0), 5); await pmAccept();
    var want = (Math.abs(A) + Math.PI * e.rx * e.ry) * 5;
    near(anvil.summary().volume, want, 1e-3 * want, 'volume');
    var script = anvil.script();
    assert(/\.spline\(/.test(script) && /\.ellipse\(/.test(script) && /\.partialEllipse\(/.test(script), 'script has the curves');
    await anvil.run(script); await idle();
    near(anvil.summary().volume, want, 1e-3 * want, 'volume after the round trip');
    return 'volume ' + anvil.summary().volume.toFixed(3) + ' (≈ ' + want.toFixed(3) + ')';
  });
  step('sketch-spline: Search Commands "spline" / "partial ellipse" picks the tool in a sketch', async function () {
    var sk = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    UI.editFeature(sk); await idle();
    var box = $('cmd-search');
    box.value = 'partial ellipse';
    box.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    assert(UI.App.tool === 'pellipse', 'tool ' + UI.App.tool);
    box.value = 'Spline';
    box.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    assert(UI.App.tool === 'spline' && UI.pmTitle() === 'Spline', 'tool ' + UI.App.tool);
    UI.cancelTool();
    await UI.exitSketch(); await idle();
    return 'ok';
  });
  // ---- end sketch-spline
