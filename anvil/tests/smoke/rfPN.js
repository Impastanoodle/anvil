  // ---- rfPN (2026-11-18, lane zoomfine): what the user sees zoomed in and on big parts.
  // The zoom refinement re-drew only faces with an exact surface record (cylinders, cones, spheres, tori: holes,
  // bends, fillet rounds); lofts, sweeps, extruded / revolved splines and an import's curved faces stayed faceted. Now
  // a record-less curved facet is drawn from its PN triangle (the cubic through its corners with the smooth normals
  // there). Zoomed far into a big part the plan counted every triangle of the part and was left out whole; now only
  // what is on screen is refined, the nearest first. The first Section View built its programs on first use; they are
  // built while the view is still. Rows measure the drawn geometry against references made from the kernel's own
  // vertices (they lie on the true surface) or the exact shape.
  var RFPN_FUNNEL = 'p.units("in");\nvar a = p.sketch("Top").circle(0, 0, 2).id();\nvar b = p.sketch("Top", 2).circle(0, 0, 0.9).id();\nvar c = p.sketch("Top", 4).circle(0, 0, 0.5).id();\np.loft([a, b, c]);\n';
  function rfPNTorus(nu, nv) {
    return 'var P = [], T = [], nu = ' + nu + ', nv = ' + nv + ', R = 40, r = 12, i, j;\n' +
      'for (i = 0; i < nu; i++) for (j = 0; j < nv; j++) { var a = 2 * Math.PI * i / nu, b = 2 * Math.PI * j / nv; P.push((R + r * Math.cos(b)) * Math.cos(a), r * Math.sin(b), (R + r * Math.cos(b)) * Math.sin(a)); }\n' +
      'function v(i, j) { return (i % nu) * nv + (j % nv); }\n' +
      'for (i = 0; i < nu; i++) for (j = 0; j < nv; j++) T.push(v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j), v(i + 1, j + 1), v(i, j + 1));\n' +
      'p.importMesh({ name: "Imported1", solids: [{ name: "Torus", positions: P, triangles: T }] });\n';
  }
  async function rfPNStart(code) {
    var V = UI.App.view, sv = { style: V.style, planes: V.showPlanes, origin: V.showOrigin, zl: UI.zoomTess.level(), occt: anvil.occt().on, budget: UI.zoomTess.options.budget, maxMs: UI.zoomTess.options.maxMs, msPerTri: UI.zoomTess.options.msPerTri };
    await anvil.newPart(); await idle();
    anvil.occt(false, { remember: false }); await idle();
    await anvil.run(code); await idle();
    V.showPlanes = false; V.showOrigin = false; UI.updatePlanes(); UI.updateOrigin();
    UI.setStyle('shadedEdges'); UI.zoomTess.setLevel(1); UI.zoomTess.enabled(true);
    return sv;
  }
  async function rfPNEnd(sv) {
    var V = UI.App.view, O = UI.zoomTess.options;
    O.budget = sv.budget; O.maxMs = sv.maxMs; O.msPerTri = sv.msPerTri;
    UI.zoomTess.setLevel(sv.zl); UI.zoomTess.enabled(true);
    anvil.occt(sv.occt, { remember: false });
    V.showPlanes = sv.planes; V.showOrigin = sv.origin; UI.updatePlanes(); UI.updateOrigin(); UI.setStyle(sv.style);
    await anvil.newPart(); await idle();
  }
  function rfPNView(at, s, name) {
    UI.setView(name || 'Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation();
    UI.cam.scale = s; UI.cam.target.set(at[0], at[1], at[2]); UI.applyCamera();
  }
  // the drawn triangles: [{ d, t (base triangle), C: [3 corners] }] whose centre is on screen
  function rfPNDrawn(filter) {
    var geo = UI.getBodyMesh().geometry.attributes.position.array, map = UI.zoomTess.map(), out = [], cv = UI.renderer.domElement, w = cv.clientWidth, h = cv.clientHeight;
    for (var d = 0; d < geo.length / 9; d++) {
      var C = [];
      for (var c = 0; c < 3; c++) C.push([geo[d * 9 + c * 3], geo[d * 9 + c * 3 + 1], geo[d * 9 + c * 3 + 2]]);
      var m = [(C[0][0] + C[1][0] + C[2][0]) / 3, (C[0][1] + C[1][1] + C[2][1]) / 3, (C[0][2] + C[1][2] + C[2][2]) / 3], sc = UI.worldToScreen(m);
      if (sc[0] < 0 || sc[1] < 0 || sc[0] > w || sc[1] > h || (filter && !filter(C))) continue;
      out.push({ d: d, t: map ? map[d] : d, C: C });
    }
    return out;
  }
  // the largest gap (px) between drawn triangles (side middles, centre) and a reference: gap(point) -> model units
  function rfPNDepth(list, gap) {
    var worst = 0;
    list.forEach(function (x) {
      var C = x.C, M = [[(C[0][0] + C[1][0]) / 2, (C[0][1] + C[1][1]) / 2, (C[0][2] + C[1][2]) / 2], [(C[1][0] + C[2][0]) / 2, (C[1][1] + C[2][1]) / 2, (C[1][2] + C[2][2]) / 2], [(C[0][0] + C[2][0]) / 2, (C[0][1] + C[2][1]) / 2, (C[0][2] + C[2][2]) / 2], [(C[0][0] + C[1][0] + C[2][0]) / 3, (C[0][1] + C[1][1] + C[2][1]) / 3, (C[0][2] + C[1][2] + C[2][2]) / 3]];
      M.forEach(function (p) { worst = Math.max(worst, gap(p)); });
    });
    return worst / UI.cam.scale;
  }
  // sides of the drawn mesh used an odd number of times (a crack or a T-junction left open), keys at 1e-6
  function rfPNOpenSides() {
    var geo = UI.getBodyMesh().geometry.attributes.position.array, n = new Map(), odd = 0;
    function k(o) { return Math.round(geo[o] * 1e6) + ',' + Math.round(geo[o + 1] * 1e6) + ',' + Math.round(geo[o + 2] * 1e6); }
    for (var d = 0; d < geo.length / 9; d++) for (var e = 0; e < 3; e++) {
      var a = k(d * 9 + e * 3), b = k(d * 9 + ((e + 1) % 3) * 3), key = a < b ? a + '|' + b : b + '|' + a;
      n.set(key, (n.get(key) || 0) + 1);
    }
    n.forEach(function (c) { if (c % 2) odd++; });
    return odd;
  }
  // the funnel loft is a surface of revolution about Y: its radius at (y, angle) from the kernel's own vertices (rows of
  // equal y, each sampled round the axis), a cubic through four rows of cubics through four samples
  function rfPNFunnelRef() {
    var m = UI.App.mesh, P = m.positions64 || m.positions, grid = {};
    for (var i = 0; i < m.triCount * 3; i++) {
      var y = +P[i * 3 + 1].toFixed(9), r = Math.hypot(P[i * 3], P[i * 3 + 2]);
      if (!(r > 1e-6)) continue;
      var an = Math.atan2(P[i * 3 + 2], P[i * 3]);
      (grid[y] = grid[y] || {})[Math.round(an * 1e6)] = [an, r];
    }
    var ys = Object.keys(grid).map(Number).sort(function (a, b) { return a - b; }), rows = {};
    ys.forEach(function (y) { rows[y] = Object.keys(grid[y]).map(function (k) { return grid[y][k]; }).sort(function (a, b) { return a[0] - b[0]; }); });
    function lag(xs, vs, x) { var s = 0; for (var a = 0; a < xs.length; a++) { var l = 1; for (var b = 0; b < xs.length; b++) if (b !== a) l *= (x - xs[b]) / (xs[a] - xs[b]); s += l * vs[a]; } return s; }
    function four(L, x, get) { var j = 0; while (j < L.length - 2 && get(L[j + 1]) < x) j++; var j0 = Math.max(0, j - 1), j3 = Math.min(L.length - 1, j + 2), xs = [], vs = []; for (var q = j0; q <= j3; q++) { xs.push(get(L[q])); vs.push(q); } return { xs: xs, idx: vs }; }
    return function (p) {
      var y = p[1], an = Math.atan2(p[2], p[0]), f = four(ys, y, function (v) { return v; });
      var R = lag(f.xs, f.idx.map(function (q) { var L = rows[ys[q]], g = four(L, an, function (v) { return v[0]; }); return lag(g.xs, g.idx.map(function (i) { return L[i][1]; }), an); }), y);
      return Math.abs(Math.hypot(p[0], p[2]) - R);
    };
  }

  step('rfPN: a three-section loft zoomed in (0.0002 in a pixel) — its side is refined (no surface record: PN triangles) and drawn within half a pixel of the loft (was over a pixel of facets), with no open sides', async function () {
    var sv = await rfPNStart(RFPN_FUNNEL);
    try {
      var ref = rfPNFunnelRef(), side = function (C) { return C.every(function (p) { return p[1] > 0.02 && p[1] < 3.98; }); };
      rfPNView([1.0, 1.5, 1.0], 0.0002);
      UI.zoomTess.enabled(false);
      var before = rfPNDepth(rfPNDrawn(side), ref), open0 = rfPNOpenSides();
      UI.zoomTess.enabled(true);
      var inf = UI.zoomTess.now();
      assert(inf && inf.free === 1 && inf.refined > 0 && inf.tris > inf.baseTris, 'the loft side refined: ' + JSON.stringify(inf));
      var after = rfPNDepth(rfPNDrawn(side), ref), open1 = rfPNOpenSides(), dv = UI.zoomTess.deviation().filter(function (d) { return d.t === 'free'; });
      assert(before > 1, 'the facets show before (' + before.toFixed(2) + ' px): the step measures something');
      assert(after <= 0.5, 'drawn ' + after.toFixed(3) + ' px off the loft');
      assert(dv.length && dv[0].sagPx <= 0.5, 'sub-facets ' + (dv[0] && dv[0].sagPx.toFixed(3)) + ' px off their PN triangles');
      assert(open1 <= open0, 'open sides ' + open0 + ' -> ' + open1);
      return 'facets ' + before.toFixed(2) + ' -> ' + after.toFixed(3) + ' px, k ' + inf.k + ', ' + inf.refined + ' facets refined, open sides ' + open0 + ' -> ' + open1;
    } finally { await rfPNEnd(sv); }
  });

  step('rfPN: an extruded spline zoomed in — its side refined smooth (facets ' + '> 5 px -> within half a pixel of the PN surface), no open sides, and the spline\'s edge lines follow the refined side instead of its chords', async function () {
    var sv = await rfPNStart('p.units("mm");\np.sketch("Front").spline([[0,0],[20,10],[40,-5],[60,8]], false).line(60, 8, 60, -20).line(60, -20, 0, -20).line(0, -20, 0, 0).extrude(10);\n');
    try {
      rfPNView([20, 10, 5], 0.005);
      function edgeVerts() { var n = 0; UI.groups.edges.children.forEach(function (o) { if (o.isLineSegments && !o.userData.silhouette && !o.userData.zoomTess && o.geometry.attributes.position) n += o.geometry.attributes.position.count; }); return n; }
      UI.zoomTess.enabled(false);
      var open0 = rfPNOpenSides(), e0 = edgeVerts(), A = UI.App.mesh._zt;
      UI.zoomTess.enabled(true);
      var inf = UI.zoomTess.now(), A2 = UI.App.mesh._zt, worst = 0;
      for (var t = 0; t < UI.App.mesh.triCount; t++) if (A2.tsag && A2.tsag[t] > worst) worst = A2.tsag[t];
      assert(inf && inf.free === 1 && inf.refined > 0, 'the spline side refined: ' + JSON.stringify(inf));
      var dv = UI.zoomTess.deviation().filter(function (d) { return d.t === 'free'; }), open1 = rfPNOpenSides(), e1 = edgeVerts();
      assert(worst / UI.cam.scale > 5, 'the facets show before: ' + (worst / UI.cam.scale).toFixed(2) + ' px');
      assert(dv.length && dv[0].sagPx <= 0.6, 'sub-facets ' + (dv[0] && dv[0].sagPx.toFixed(3)) + ' px off the PN surface');
      assert(open1 <= open0, 'open sides ' + open0 + ' -> ' + open1);
      assert(e1 > e0, 'the edge lines took the refined side\'s points: ' + e0 + ' -> ' + e1 + ' vertices');
      return 'facets ' + (worst / UI.cam.scale).toFixed(2) + ' -> ' + dv[0].sagPx.toFixed(3) + ' px, k ' + inf.k + ', edge vertices ' + e0 + ' -> ' + e1 + ', open sides ' + open0 + ' -> ' + open1;
    } finally { await rfPNEnd(sv); }
  });

  step('rfPN: a Lofted-Bend\'s facets are its formed shape — left as they are zoomed in (smoothing bent its flat panels 70 px)', async function () {
    var sv = await rfPNStart('p.units("in");\np.sheet(0.0598, 0.0598, 0.5);\nvar a = p.sketch("Top").polyline([[0, -2], [2, -2], [2, 2], [-2, 2], [-2, -2], [-0.001, -2]], false).id();\nvar b = p.sketch("Top", 3).arc(0, 0, 1, 270.03, 360).arc(0, 0, 1, 0, 90).arc(0, 0, 1, 90, 180).arc(0, 0, 1, 180, 270).id();\np.loftedBend([a, b]);\n');
    try {
      rfPNView([1.2, 1.5, 1.2], 0.0005);
      var inf = UI.zoomTess.now();
      assert(!inf || !inf.free, 'no free facet refined: ' + JSON.stringify(inf));
      return JSON.stringify(inf);
    } finally { await rfPNEnd(sv); }
  });

  step('rfPN: an imported curved body of 16 000 triangles zoomed far in — only what is on screen is refined, under the time budget, and drawn within half a pixel of the exact torus (was 3.9 px of facets); the whole body would have been over the budget', async function () {
    var sv = await rfPNStart(rfPNTorus(100, 80)), O = UI.zoomTess.options;
    try {
      var at = [52 / Math.SQRT2, 0, 52 / Math.SQRT2], gap = function (p) { return Math.abs(Math.hypot(Math.hypot(p[0], p[2]) - 40, p[1]) - 12); };
      rfPNView(at, 0.002);
      UI.zoomTess.enabled(false);
      var before = rfPNDepth(rfPNDrawn(), gap);
      UI.zoomTess.enabled(true);
      O.msPerTri = 0.004; O.maxMs = 80;
      var inf = UI.zoomTess.now(true);   // budgeted, as the still view
      assert(inf && !inf.over && inf.refined > 0, 'refined under the budget: ' + JSON.stringify(inf));
      var sel = UI.zoomTess.selected(), n = 0;
      for (var t = 0; t < sel.length; t++) if (sel[t]) n++;
      assert(n === inf.refined && n < 16000 / 20, n + ' of 16 000 facets refined (only those on screen)');
      assert(16000 * inf.k * inf.k * O.msPerTri > O.maxMs, 'the whole body at k ' + inf.k + ' would have been over the budget');
      var after = rfPNDepth(rfPNDrawn(), gap);
      assert(before > 1 && after <= 0.5, 'facets ' + before.toFixed(2) + ' -> ' + after.toFixed(3) + ' px');
      return n + ' facets refined at k ' + inf.k + ' in ' + inf.ms + ' ms (' + JSON.stringify(inf.timing) + '), ' + before.toFixed(2) + ' -> ' + after.toFixed(3) + ' px';
    } finally { await rfPNEnd(sv); }
  });

  step('rfPN: two bosses one behind the other and room in the budget for one — the nearer one is refined', async function () {
    var sv = await rfPNStart('p.units("mm");\np.sketch("Front").circle(0, 0, 20).extrude(10);\np.sketch("Front", -40).circle(0, 0, 20).extrude(10);\n'), O = UI.zoomTess.options;
    try {
      rfPNView([0, 12, -15], 0.03, 'Front'); UI.rotateView(0, -20 * Math.PI / 180 / 0.008); if (UI.finishViewAnimation) UI.finishViewAnimation();
      var all = UI.zoomTess.now(), A = UI.App.mesh._zt;
      assert(all && all.faces >= 2, 'both bosses refined with room: ' + JSON.stringify(all));
      var cyl = A.groups.filter(function (g) { return g.S && g.S.t === 'cyl'; });
      assert(cyl.length === 2, cyl.length + ' cylinder groups');
      O.budget = Math.ceil(Math.max(cyl[0].tris.length, cyl[1].tris.length) * (all.k * all.k - 1) * 1.2);
      UI.zoomTess.enabled(false); UI.zoomTess.enabled(true);
      var one = UI.zoomTess.now(), sel = UI.zoomTess.selected(), front = cyl.filter(function (g) { return g.box[5] > 5; })[0], back = cyl.filter(function (g) { return g.box[5] <= 5; })[0];
      var inFront = front.tris.some(function (t) { return sel && sel[t]; }), inBack = back.tris.some(function (t) { return sel && sel[t]; });
      assert(one && one.faces === 1 && inFront && !inBack, 'the nearer boss refined: ' + JSON.stringify(one) + ' front ' + inFront + ' back ' + inBack);
      return 'both: ' + all.faces + ' groups; budget ' + O.budget + ': the front one';
    } finally { await rfPNEnd(sv); }
  });

  step('rfPN: Section View\'s programs are built while the view is still — the first section then builds none, RealView off and on', async function () {
    var keep = null, res = [];
    try { keep = W.localStorage.getItem('anvil.realview'); } catch (e) { }
    var sv = await rfPNStart('p.units("in");\np.box(4, 2, 2);\np.hole("Top", 1, -1, 0.5, { offset: 2 });\n');
    try {
      for (var rv of [false, true]) {
        if (rv && !UI.setRealView) continue;
        if (UI.setRealView) UI.setRealView(rv, true);
        UI.App.view.section = null; UI.applyDisplayStyle();
        UI.setView('Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation(); UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation();
        UI.render();
        var w0 = UI.sectionWarm(), got = null;
        for (var i = 0; i < 40 && !got; i++) { await wait(100); var w = UI.sectionWarm(); if (w.n > w0.n || (w.key && w.key.indexOf(String(rv)) === 0)) got = w; }
        assert(got && got.key && got.key.indexOf(String(!!(UI.realView && UI.realView()))) === 0, (rv ? 'RealView' : 'plain') + ': warmed while still: ' + JSON.stringify(UI.sectionWarm()));
        var p0 = UI.renderer.info.programs.length;
        UI.cmdSection(); await idle(); UI.render();
        var built = UI.renderer.info.programs.length - p0;
        assert(UI.App.view.section, 'the section is on');
        assert(built === 0, (rv ? 'RealView' : 'plain') + ': the first section built ' + built + ' program(s)');
        if (UI.hasPM && UI.hasPM()) UI.pmCancel();
        UI.App.view.section = null; UI.applyDisplayStyle(); await idle();
        res.push((rv ? 'RealView' : 'plain') + ' warmed in ' + got.ms + ' ms, 0 built');
      }
      return res.join('; ');
    } finally {
      if (UI.hasPM && UI.hasPM()) UI.pmCancel();
      UI.App.view.section = null; UI.applyDisplayStyle();
      try { if (keep == null) W.localStorage.removeItem('anvil.realview'); else W.localStorage.setItem('anvil.realview', keep); } catch (e) { }
      if (UI.setRealView) UI.setRealView(keep === '1' ? true : keep === '0' ? false : UI.realViewInfo().byDefault, true);
      await rfPNEnd(sv);
    }
  });
