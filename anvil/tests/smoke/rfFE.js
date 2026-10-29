  // --- rfFE (2026-10-29, lane FE): smooth shading on Anvil's own engine, true curve edges at screen resolution. The
  // reported part (R6 fillet on a Ø100 rim, a revolved groove): the viewport's normals are Kernel.analyticNormals'
  // (one copy, the worker's and the page's), the fillet facets shade smooth, the top plane flat; a small hole's edge
  // (Ø2 mm) is re-sampled finer as the view zooms in on it (no rebuild) and back when it zooms out. ---
  function rfFEDeg(a, b) { return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI; }
  function rfFEEdgeCount() {
    var n = 0;
    UI.groups.edges.children.forEach(function (o) { if (o.isLineSegments && !o.userData.fatLine && o.geometry && o.geometry.attributes.position) n = Math.max(n, o.geometry.attributes.position.count); });
    return n;
  }

  step('rfFE: the reported part on Anvil\'s engine — viewport normals are Kernel.analyticNormals\' (smooth fillet facets, flat top plane), no normal jump over 2° between fillet facets', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("mm"); p.sketch("Top").circle(0,0,50).extrude(20); p.fillet(6, [[50,20,0]]); p.sketch("Front").circle(22,20,8).revolveCut(360);'); await idle();
    UI.setView('Isometric'); UI.zoomToFit(); await idle(); await wait(40);
    var m = UI.App.mesh;
    assert(m && m.triCount > 1000, 'part built: ' + (m && m.triCount));
    var n = UI.analyticNormals(m), k = K.analyticNormals(m), worst = 0;
    assert(n.length === k.length, 'same layout');
    for (var i = 0; i < n.length; i++) worst = Math.max(worst, Math.abs(n[i] - k[i]));
    assert(worst < 1e-5, 'viewport normals = Kernel.analyticNormals (worker or page): ' + worst);
    var P = m.positions64, by = {}, top = 0, fil = 0, jump = 0;
    m.faces.forEach(function (f, fi) {
      for (var c = f.start * 3; c < (f.start + f.count) * 3; c++) {
        var p = [P[c * 3], P[c * 3 + 1], P[c * 3 + 2]], nn = [n[c * 3], n[c * 3 + 1], n[c * 3 + 2]], rho = Math.hypot(p[0], p[2]);
        if (f.normal[1] > 1 - 1e-9 && f.area > 1000) { top++; assert(rfFEDeg(nn, [0, 1, 0]) < 0.05, 'top plane flat'); }
        if (p[1] > 14.5 && p[1] < 19.5 && rho > 44.5) {
          fil++;
          var key = p.map(function (x) { return Math.round(x * 1e4); }).join(',');
          (by[key] || (by[key] = [])).push(nn);
        }
      }
    });
    Object.keys(by).forEach(function (key) { var L = by[key]; for (var a = 1; a < L.length; a++) jump = Math.max(jump, rfFEDeg(L[0], L[a])); });
    assert(top > 10 && fil > 100, top + ' top / ' + fil + ' fillet corners');
    assert(jump <= 2, 'fillet normal jump ' + jump.toFixed(3) + '°');
    return 'fillet jump ' + jump.toFixed(3) + '°';
  });

  step('rfFE: a Ø2 mm hole zoomed in — its circle edge is re-sampled at screen resolution (more points, no rebuild), back to the base count zoomed out', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("mm"); p.sketch("Top").rect(0,0,100,80).end().extrude(5); p.sketch("Top", 5).circle(50, 40, 1).end().cut(10, { reverse: true });'); await idle();
    UI.setView('Top'); UI.zoomToFit(); await idle(); await wait(40);
    var cs = (UI.App.curves || []).filter(function (c) { return c.curve && Math.abs(c.curve.radius - 1) < 1e-6; });
    assert(cs.length >= 1, 'hole circle edges: ' + cs.length);
    var n0 = cs[0].pts.length, e0 = rfFEEdgeCount(), b0 = UI.App.build;
    var at = UI.worldToScreen(cs[0].curve.center);
    UI.zoomView(1 / 1000, at[0], at[1]); UI.render(); await wait(40); UI.render();
    var n1 = cs[0].pts.length, e1 = rfFEEdgeCount();
    assert(UI.App.build === b0, 'no rebuild');
    assert(n1 > n0 * 1.5, 'zoomed in: ' + n0 + ' -> ' + n1 + ' points');
    assert(e1 > e0, 'edge lines re-drawn: ' + e0 + ' -> ' + e1);
    // the sagitta of a chord stays under ~0.2 px
    var r = cs[0].curve.radius, segs = (n1 - 1) * 2 * Math.PI / (cs[0].curve.a1 - cs[0].curve.a0), sagPx = r * (1 - Math.cos(Math.PI / segs)) / UI.cam.scale;
    assert(sagPx < 0.2, 'sagitta ' + sagPx.toFixed(3) + ' px');
    UI.zoomToFit(); await idle(); UI.render(); await wait(40); UI.render();
    assert(cs[0].pts.length === n0, 'zoomed out: back to ' + n0 + ' (' + cs[0].pts.length + ')');
    return n0 + ' -> ' + n1 + ' points, sagitta ' + sagPx.toFixed(3) + ' px';
  });
