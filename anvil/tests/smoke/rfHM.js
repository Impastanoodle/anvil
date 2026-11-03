  // ---- rfHM (2026-11-03, lane sweep-shade) — user: the Compression Spring (Design Library ▸ Bent and Swept), zoomed in
  // with OpenCascade on, looked lumpy and faceted, with white streaks along the coil and small dark marks on the wire.
  // Causes: OpenCascade facets of one smooth face were split by the 20° crease rule (its mesh turned ~20°), its mesh
  // was coarse (0.35 rad, 0.05 model units), the helix was drawn through the wire (no depth test), and a face whose
  // pieces touch at one corner lost outline edges (drawn as dark marks). Each step: the part zoomed in like the
  // screenshot, on Anvil's kernel and on OpenCascade (skipped without vendor/occt).
  var RFHM_SPRING = 'p.units("in");\nvar s = p.sketch("Top").circle(0, 0, 0.5).id();\nvar h = p.helix(s, { pitch: 0.25, revolutions: 8 });\n' +
    'var wire = p.sketch("Front").circle(0.5, 0, 0.03125).id();\np.sweep({ profile: wire, path: h, name: "Coil" });';
  var RFHM_FUNNEL = 'p.units("in");\nvar a = p.sketch("Top").circle(0, 0, 2).id();\nvar b = p.sketch("Top", 2).circle(0, 0, 0.9).id();\nvar c = p.sketch("Top", 4).circle(0, 0, 0.5).id();\np.loft([a, b, c]);';
  function rfHMOcc() { return Promise.race([anvil.occtIdle(), wait(60000).then(function () { return anvil.occt(); })]); }
  function rfHMAng(a, b) { return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI; }
  // the largest jump between the smooth normals two faces give one vertex of a smooth edge (shading seams)
  function rfHMJump() {
    var m = UI.App.mesh, N = UI.analyticNormals(m), P = m.positions, nT = P.length / 9, faceOf = new Int32Array(nT), vf = new Map(), worst = 0;
    function key(x, y, z) { return Math.round(x * 1e5) + ',' + Math.round(y * 1e5) + ',' + Math.round(z * 1e5); }
    m.faces.forEach(function (f, fi) { for (var q = f.start; q < f.start + f.count; q++) faceOf[q] = fi; });
    for (var t = 0; t < nT; t++) for (var k = 0; k < 3; k++) { var o = t * 9 + k * 3, kk = key(P[o], P[o + 1], P[o + 2]) + '#' + faceOf[t], l = vf.get(kk); if (!l) vf.set(kk, l = []); l.push([N[o], N[o + 1], N[o + 2]]); }
    (UI.App.edges || []).forEach(function (e) {
      if (!e.smooth || e.faces.length !== 2) return;
      [e.a, e.b].forEach(function (p) {
        var A = vf.get(key(p[0], p[1], p[2]) + '#' + e.faces[0]), B = vf.get(key(p[0], p[1], p[2]) + '#' + e.faces[1]);
        if (A && B) A.forEach(function (x) { B.forEach(function (y) { worst = Math.max(worst, rfHMAng(x, y)); }); });
      });
    });
    return worst;
  }
  // the helix as segments, its two ends
  function rfHMHelix() {
    var f = UI.App.model.features.filter(function (x) { return x.type === 'helix'; })[0], g = f && UI.App.build.planes[f.id];
    assert(g && g.pts && g.pts.length > 100, 'helix record');
    return g.pts;
  }
  function rfHMNearest(pts, p) {
    var best = Infinity, bq = null;
    for (var i = 0; i + 1 < pts.length; i++) {
      var a = pts[i], b = pts[i + 1], d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
      var t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / L2)) : 0;
      var q = [a[0] + t * d[0], a[1] + t * d[1], a[2] + t * d[2]], dd = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      if (dd < best) { best = dd; bq = q; }
    }
    return { d: best, q: bq };
  }
  // segments of the silhouette line sets that the shader keeps at this view (one facet toward the viewer, one away)
  function rfHMSilShown() {
    var v = UI.mats.silhouette.uniforms.viewDir.value, out = [];
    UI.scene.traverse(function (o) {
      if (!(o.isLineSegments && o.userData.silhouette && o.visible) || o.userData.fatLine) return;
      var pa = o.geometry.attributes.position, n1 = o.geometry.attributes.n1, n2 = o.geometry.attributes.n2;
      for (var i = 0; i + 1 < pa.count; i += 2) {
        var d1 = n1.getX(i) * v.x + n1.getY(i) * v.y + n1.getZ(i) * v.z, d2 = n2.getX(i) * v.x + n2.getY(i) * v.y + n2.getZ(i) * v.z;
        if (d1 * d2 > 0) continue;
        out.push({ a: [pa.getX(i), pa.getY(i), pa.getZ(i)], b: [pa.getX(i + 1), pa.getY(i + 1), pa.getZ(i + 1)] });
      }
    });
    return { segs: out, v: [v.x, v.y, v.z] };
  }
  async function rfHMZoomIn() {
    UI.setStyle('shadedEdges');
    UI.setView('Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation();
    UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation();
    UI.zoomView(0.12); if (UI.finishViewAnimation) UI.finishViewAnimation();
    if (UI.zoomTess) UI.zoomTess.now();
    UI.render();
  }
  // the spring's checks on what is shown now -> one line of figures
  function rfHMSpringChecks(tag) {
    var pts = rfHMHelix(), r = 0.03125, ends = [pts[0], pts[pts.length - 1]];
    var jump = rfHMJump();
    assert(jump < 0.5, tag + ': smooth normals jump ' + jump.toFixed(2) + '° across a facet edge of the wire (lumps / streaks)');
    // drawn edges: only the two end caps' rims
    var stray = (UI.App.edges || []).filter(function (e) {
      if (e.smooth) return false;
      return ends.every(function (c) { return Math.hypot(e.mid[0] - c[0], e.mid[1] - c[1], e.mid[2] - c[2]) > 2 * r; });
    });
    assert(!stray.length, tag + ': ' + stray.length + ' edge lines drawn on the wire away from its ends, e.g. ' + JSON.stringify(stray[0] && stray[0].mid));
    // outlines: only where the wire turns away from the viewer
    var sh = rfHMSilShown(), bad = sh.segs.filter(function (s) {
      var m = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, (s.a[2] + s.b[2]) / 2], nr = rfHMNearest(pts, m);
      if (Math.abs(nr.d - r) > 0.25 * r) return false;   // not on the tube (an end cap)
      var n = [(m[0] - nr.q[0]) / nr.d, (m[1] - nr.q[1]) / nr.d, (m[2] - nr.q[2]) / nr.d];
      return Math.abs(n[0] * sh.v[0] + n[1] * sh.v[1] + n[2] * sh.v[2]) > 0.35;
    });
    assert(sh.segs.length > 20, tag + ': outline segments shown ' + sh.segs.length);
    assert(!bad.length, tag + ': ' + bad.length + ' of ' + sh.segs.length + ' outline segments lie on the wire\'s face toward the viewer (dark marks), e.g. ' + JSON.stringify(bad[0]));
    return tag + ': jump ' + jump.toFixed(3) + '°, ' + sh.segs.length + ' outline segments on the outline';
  }

  step('rfHM: Compression Spring zoomed in (Anvil kernel, then OpenCascade): one smooth normal per vertex, no edge lines along the wire, outlines only at its outline, the helix hidden inside the wire', async function () {
    var style = UI.App.view.style, out = [];
    try {
      await anvil.newPart(); await idle();
      await anvil.run(RFHM_SPRING); await idle();
      await rfHMZoomIn();
      out.push(rfHMSpringChecks('Anvil'));
      // the helix is drawn depth-tested (it lies inside the wire: SolidWorks hides it there)
      var curves = [];
      UI.groups.refgeo.traverse(function (o) { if ((o.isLineSegments || o.isLine) && !o.userData.fatLine) curves.push(o); });
      assert(curves.length && curves.every(function (o) { return o.material.depthTest === true; }), 'helix line depth test: ' + curves.map(function (o) { return o.material.depthTest; }).join());
      anvil.occt(true, { remember: false });
      var s = await rfHMOcc();
      if (s.state === 'failed' || s.state === 'off') out.push('OpenCascade skipped: ' + (s.error || s.state));
      else {
        assert(s.state === 'ok' && s.driving, 'OpenCascade state ' + s.state + ' driving ' + s.driving);
        await rfHMZoomIn();
        out.push(rfHMSpringChecks('OpenCascade'));
      }
      return out.join('; ');
    } finally { anvil.occt(false, { remember: false }); await idle(); UI.setStyle(style); }
  });

  step('rfHM: Trumpet Funnel (3-section circle loft) on OpenCascade: smooth flare, and the only edge lines are the two rims (no marks on the flare)', async function () {
    var style = UI.App.view.style;
    try {
      await anvil.newPart(); await idle();
      await anvil.run(RFHM_FUNNEL); await idle();
      anvil.occt(true, { remember: false });
      var s = await rfHMOcc();
      if (s.state === 'failed' || s.state === 'off') return 'skipped: ' + (s.error || s.state);
      assert(s.state === 'ok' && s.driving, 'OpenCascade state ' + s.state);
      UI.setStyle('shadedEdges');
      UI.setView('Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation();
      UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation();
      UI.render();
      var jump = rfHMJump();
      assert(jump < 0.5, 'smooth normals jump ' + jump.toFixed(2) + '° on the flare');
      var tris = UI.App.mesh.triCount;
      assert(tris > 2000, 'OpenCascade mesh ' + tris + ' triangles (was 372: a faceted flare)');
      var stray = (UI.App.edges || []).filter(function (e) { return !e.smooth && !e.seam && Math.abs(e.mid[1]) > 1e-3 && Math.abs(e.mid[1] - 4) > 1e-3; });
      assert(!stray.length, stray.length + ' edge lines on the flare, e.g. ' + JSON.stringify(stray[0] && { mid: stray[0].mid, faces: stray[0].faces.length }));
      return tris + ' triangles, jump ' + jump.toFixed(3) + '°';
    } finally { anvil.occt(false, { remember: false }); await idle(); UI.setStyle(style); }
  });
