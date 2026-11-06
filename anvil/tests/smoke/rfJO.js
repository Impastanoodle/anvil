  // --- rfJO (2026-11-06, lane sketchgaps-3) --- Intersection Curve of a cylinder cut at an angle: an ellipse (SolidWorks
  // gives one; Anvil gave the facets' lines), and a partial ellipse on a half cylinder.
  async function rfJONew(script, tiltDeg) {
    await anvil.newPart(); await idle();
    await anvil.run(script); await idle();
    var m = JSON.parse(JSON.stringify(UI.App.model)), a = tiltDeg * Math.PI / 180, s = Math.sin(a), c = Math.cos(a), id = m.nextId++;
    m.features.push({ id: id, type: 'sketch', name: 'Tilted', plane: { custom: true, origin: [0, 0, 0], x: [1, 0, 0], y: [0, c, s], n: [0, -s, c] }, entities: [] });
    await anvil.load(m); await idle();
    await UI.enterSketch(id); await idle();
    assert(UI.App.mode === 'sketch', 'in the tilted sketch');
    var cyl = [];
    UI.App.mesh.faces.forEach(function (fc, i) { var p = fc.polys && fc.polys[0]; if (p && p.surf && p.surf.s && p.surf.s.t === 'cyl') cyl.push(i); });
    return cyl;
  }
  step('rfJO: Intersection Curve of a Ø10 cylinder (axis Z) cut by a plane tilted 30°: one ellipse, centre on the axis, semi-axes 5 / cos 30° = 5.7735 along the axis\' shadow and 5 across, held On Edge; a half cylinder gives a partial ellipse over 180°', async function () {
    var errs0 = errors.length, cyl = await rfJONew('p.sketch("Front").circle(0, 0, 5).extrude(40, { midplane: true });', 30);
    assert(cyl.length >= 1, 'cylinder face');
    UI.cmdIntersectionCurve([cyl[0]]); await wait(20);
    assert(UI.pmTitle() === 'Intersection Curve', 'PM ' + UI.pmTitle());
    var tmp = UI.App.tempEntities;
    assert(tmp.length === 1 && tmp[0].t === 'ellipse', 'previewed one ellipse: ' + JSON.stringify(tmp));
    D.querySelector('#pm .pm-ok').click(); await idle();
    var f = UI.activeSketchFeature(), el = f.entities.filter(function (e) { return e.t === 'ellipse'; });
    assert(el.length === 1 && f.entities.length === 1, 'one ellipse: ' + JSON.stringify(f.entities));
    var e = el[0];
    near(e.cx, 0, 1e-6, 'cx'); near(e.cy, 0, 1e-6, 'cy'); near(e.rx, 5 / Math.cos(Math.PI / 6), 1e-6, 'major'); near(e.ry, 5, 1e-6, 'minor'); near(e.rot, 90, 1e-6, 'along the axis\' shadow');
    assert((f.rels || []).some(function (r) { return r.type === 'onEdge'; }), 'held On Edge: ' + JSON.stringify(f.rels));
    // a half cylinder (a D-shaped bar: the flat on y = 0): a partial ellipse
    cyl = await rfJONew('p.sketch("Front").arc(0, 0, 5, 0, 180).line(-5, 0, 5, 0).extrude(40, { midplane: true });', 30);
    assert(cyl.length >= 1, 'half-cylinder face');
    var g = UI.intersectionCurveGeometry([cyl[0]]);
    assert(g.length === 1 && g[0].t === 'pellipse', 'one partial ellipse: ' + JSON.stringify(g));
    near(g[0].a1 - g[0].a0, 180, 1e-3, 'half of it'); near(g[0].rx, 5 / Math.cos(Math.PI / 6), 1e-6, 'major'); near(g[0].ry, 5, 1e-6, 'minor');
    var K = UI.K, p0 = K.ellipsePoint(g[0], g[0].a0 * Math.PI / 180), p1 = K.ellipsePoint(g[0], g[0].a1 * Math.PI / 180);
    near(Math.abs(p0[0]), 5, 1e-4, 'starts at x ±5'); near(Math.abs(p1[0]), 5, 1e-4, 'ends at x ±5'); near(p0[1], 0, 1e-4, 'on the flat'); near(p1[1], 0, 1e-4, 'on the flat');
    var mid = K.ellipsePoint(g[0], (g[0].a0 + g[0].a1) / 2 * Math.PI / 180);
    assert(mid[1] > 5, 'over the top of the bar (y > 0 in the tilted sketch): ' + JSON.stringify(mid));
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'ellipse ' + e.rx.toFixed(4) + ' × ' + e.ry + ', partial ' + (g[0].a1 - g[0].a0).toFixed(2) + '°';
  });
  // --- end rfJO ---
