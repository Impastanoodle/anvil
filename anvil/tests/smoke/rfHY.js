  // ---- rfHY (2026-11-05, lane zoomsmooth) — curved faces smooth up close; only whole curved faces selectable; clean
  // lines and silhouettes. User reports, each measured on the canvas with the part zoomed in like the screenshot:
  //  - "blue lines tearing past the FOV": a selected bore's tint streaked up the plate from the rim's extremes (the tint's
  //    negative polygonOffset factor pulled the bore's edge-on facets through the plate);
  //  - a washer's rim drawn as dashes / notches (the camera 10 000 units away: float rounding decided line vs face);
  //  - Shaded with no edges: light dotted lines along a flanged bushing's outlines and seams, a sawtooth bore rim (faces
  //    seen edge-on sank "infinitely" behind by their depth slope; the crack filler painted every crease);
  //  - "fillet rounds, spheres and bends still look faceted up close": the zoom display mesh refines spheres and tori too;
  //  - "make sure facets are never 'Selectable' only entire curved surfaces": extruded / revolved splines and ellipses.
  // Each step runs on Anvil's kernel and, when vendor/occt is there, on OpenCascade.
  var RFHY_WASHER = 'p.units("mm");\np.sketch("Front").circle(0, 0, 9).circle(0, 0, 3.7).extrude(1.6);\n';
  var RFHY_BUSHING = 'p.units("mm");\np.sketch("Front").circle(0, 0, 10).circle(0, 0, 4.5).extrude(3);\np.sketch("Front").circle(0, 0, 7).circle(0, 0, 4.5).extrude(8, { reverse: true });\n';
  function rfHYOcc() { return Promise.race([anvil.occtIdle(), wait(60000).then(function () { return anvil.occt(); })]); }
  // runs fn(label) on Anvil's kernel, then on OpenCascade when it loads -> labels done
  async function rfHYEngines(code, fn) {
    var done = [];
    await anvil.newPart(); await idle();
    anvil.occt(false, { remember: false });
    await anvil.run(code); await idle();
    done.push(await fn('Anvil'));
    anvil.occt(true, { remember: false });
    var s = await rfHYOcc();
    if (s.state === 'failed' || s.state === 'off' || !s.driving) done.push('OpenCascade skipped: ' + (s.error || s.state));
    else { await idle(); done.push(await fn('OpenCascade')); }
    anvil.occt(false, { remember: false }); await idle();
    return done;
  }
  function rfHYCanvas() {
    var R = UI.renderer, gl = R.getContext(), c = R.domElement, w = c.width, h = c.height, px = new Uint8Array(w * h * 4);
    R.setRenderTarget(null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { w: w, h: h, pr: R.getPixelRatio(), px: px };
  }
  function rfHYPx(img, sx, sy) {
    var x = Math.round(sx * img.pr - 0.5), y = Math.round(sy * img.pr - 0.5);
    if (x < 0 || y < 0 || x >= img.w || y >= img.h) return null;
    var i = ((img.h - 1 - y) * img.w + x) * 4;
    return [img.px[i], img.px[i + 1], img.px[i + 2], img.px[i + 3]];
  }
  // 'B' background (transparent), 'D' dark (an edge line), 'F' a face
  function rfHYClass(img, sx, sy) {
    var p = rfHYPx(img, sx, sy);
    if (!p) return null;
    if (p[3] < 128) return 'B';
    return (p[0] + p[1] + p[2]) / 3 / (p[3] / 255) < 70 ? 'D' : 'F';
  }
  // rays across a circular rim of radius R in the plane z = zf (Front), every half degree, from 6 px on the face side
  // to 6 px past it: { seen, gap (no line at all, or face touching background), sliver (a face pixel outside the last
  // line: the user's light sliver past the outline), wMin, wMax (dark run widths, px) }
  function rfHYRim(R, zf, faceInside) {
    var img = rfHYCanvas(), out = { seen: 0, gap: [], sliver: [], wMin: Infinity, wMax: 0 };
    for (var s = 0; s < 720; s++) {
      var a = s / 720 * 2 * Math.PI, P = UI.worldToScreen([R * Math.cos(a), R * Math.sin(a), zf]), Q = UI.worldToScreen([R * 1.001 * Math.cos(a), R * 1.001 * Math.sin(a), zf]);
      var dx = Q[0] - P[0], dy = Q[1] - P[1], L = Math.hypot(dx, dy);
      if (!(L > 0)) continue;
      dx /= L; dy /= L; if (!faceInside) { dx = -dx; dy = -dy; }
      var seq = '', ok = true, dark = 0;
      for (var d = -6; d <= 6; d += 0.5) { var k = rfHYClass(img, P[0] + dx * d, P[1] + dy * d); if (k == null) { ok = false; break; } seq += k; if (k === 'D') dark += 0.5; }
      if (!ok || seq.indexOf('B') < 0 || seq.indexOf('F') < 0) continue;
      out.seen++;
      var runs = seq.replace(/(.)\1+/g, '$1'), tag = (a * 180 / Math.PI).toFixed(1) + ':' + seq;
      if (runs.indexOf('D') < 0 || /FB|BF/.test(runs.replace(/^.*D/, 'D'))) out.gap.push(tag);
      else if (/DFB$/.test(runs)) out.sliver.push(tag);
      else if (!/DFD/.test(runs)) { out.wMin = Math.min(out.wMin, dark); out.wMax = Math.max(out.wMax, dark); }
    }
    return out;
  }
  function rfHYLook(style) {
    var V = UI.App.view;
    V.showPlanes = false; V.showOrigin = false; UI.updatePlanes(); UI.updateOrigin();
    if (UI.setAmbientOcclusion) { UI.setAmbientOcclusion(false); UI.setShadows(false); UI.setStillSmoothing(false); }
    UI.setStyle(style);
  }
  function rfHYSave() {
    var V = UI.App.view;
    // swpart (2026-11-12): the line probes classify pixels as face / dark line / background for rfHA's grey part and #161616 edges; the light default look now draws SolidWorks' near-white part, so they run on the grey part, which the dark theme keeps
    var th = UI.theme(); UI.setTheme('dark');
    return { rv: UI.realView ? UI.realView() : false, style: V.style, planes: V.showPlanes, origin: V.showOrigin, zl: UI.zoomTess.level(), theme: th };
  }
  async function rfHYRestore(s) {
    var V = UI.App.view;
    anvil.occt(false, { remember: false }); await idle();
    UI.zoomTess.setLevel(s.zl);
    if (UI.setRealView) UI.setRealView(s.rv, true);
    UI.setStyle(s.style); if (s.theme) UI.setTheme(s.theme);
    V.showPlanes = s.planes; V.showOrigin = s.origin; UI.updatePlanes(); UI.updateOrigin();
    UI.App.sel = null; if (UI.setSelection) UI.setSelection([]); UI.updateHighlights();
  }
  // a view turned from Front by (yaw, pitch) degrees, mm per pixel s, centred on c
  function rfHYView(yaw, pitch, s, c) {
    UI.setView('Front'); if (UI.finishViewAnimation) UI.finishViewAnimation();
    if (yaw || pitch) { UI.rotateView(yaw * Math.PI / 180 / 0.008, pitch * Math.PI / 180 / 0.008); if (UI.finishViewAnimation) UI.finishViewAnimation(); }
    UI.cam.scale = s; UI.cam.target.set(c[0], c[1], c[2]); UI.applyCamera();
  }

  step('rfHY: a selected bore zoomed in at an angle — its light-blue tint stays inside the hole; the plate above and below the rim\'s left and right extremes shows no tint (the user\'s "blue lines tearing past the FOV"), RealView off and on, both engines', async function () {
    var sv = rfHYSave();
    try {
      var out = await rfHYEngines('p.units("mm");\np.box(100, 100, 6, { centered: true });\np.hole("Top", 0, 0, 20, { offset: 6 });\n', async function (eng) {
        rfHYLook('shadedEdges');
        var fi = UI.App.mesh.faces.findIndex(function (f) { return (f.polys || []).some(function (p) { return p.surf && p.surf.s && p.surf.s.t === 'cyl'; }); });
        assert(fi >= 0, eng + ': the bore face');
        var res = [];
        for (var rv of [false, true]) {
          if (rv && !UI.setRealView) continue;
          if (UI.setRealView) UI.setRealView(rv, true);
          UI.setView('Top'); if (UI.finishViewAnimation) UI.finishViewAnimation();
          UI.rotateView(0, -50 * Math.PI / 180 / 0.008); if (UI.finishViewAnimation) UI.finishViewAnimation();
          UI.cam.scale = 10 / 500; UI.cam.target.set(0, 6, 0); UI.applyCamera();
          UI.zoomTess.now();
          UI.App.sel = { kind: 'face', index: fi }; UI.updateHighlights();
          await wait(30); UI.render(); UI.render();
          var img = rfHYCanvas(), tinted = [];
          [-1, 1].forEach(function (sx) {
            var P = UI.worldToScreen([sx * 10, 6, 0]);
            for (var dy = -150; dy <= 150; dy += 2) {
              if (Math.abs(dy) < 30) continue;   // the rim line and the bore itself near the extreme
              var p = rfHYPx(img, P[0] + sx * 3, P[1] + dy);
              if (p && p[3] > 128 && p[2] - p[0] > 18) tinted.push(sx + ':' + dy + ' ' + p.slice(0, 3).join(','));
            }
          });
          assert(!tinted.length, eng + (rv ? ' RealView' : '') + ': the bore\'s tint on the plate at ' + tinted.length + ' samples, e.g. ' + tinted.slice(0, 4).join(' | '));
          res.push((rv ? 'RealView' : 'plain') + ' clean');
        }
        return eng + ' ' + res.join(', ');
      });
      return out.join('; ');
    } finally { await rfHYRestore(sv); }
  });

  step('rfHY: a washer zoomed in on its rim, head-on and turned 3° — every edge line is continuous (no dashes or notches where the face shows through), even in width head-on, and no face sliver outside the outer outline; RealView off and on, both engines', async function () {
    var sv = rfHYSave();
    try {
      var out = await rfHYEngines(RFHY_WASHER, async function (eng) {
        rfHYLook('shadedEdges');
        var res = [];
        for (var rv of [false, true]) {
          if (rv && !UI.setRealView) continue;
          if (UI.setRealView) UI.setRealView(rv, true);
          for (var tilt of [0, 3]) for (var rpx of [700, 3000]) {
            var a = 225 * Math.PI / 180;
            rfHYView(tilt * 0.7, tilt * 0.7, 9 / rpx, [8.1 * Math.cos(a), 8.1 * Math.sin(a), 1.6]);
            UI.zoomTess.setLevel(1); UI.zoomTess.now();
            await wait(30); UI.render(); UI.render();
            var o = rfHYRim(9, 1.6, true), tag = eng + (rv ? ' RealView' : '') + ' ' + tilt + '° r' + rpx;
            assert(o.seen >= 20, tag + ': rim on screen at ' + o.seen + ' rays');
            assert(!o.gap.length, tag + ': ' + o.gap.length + ' of ' + o.seen + ' rays with no line between face and background, e.g. ' + o.gap.slice(0, 3).join(' '));
            assert(o.sliver.length <= Math.max(1, o.seen * 0.03), tag + ': face outside the outline at ' + o.sliver.length + ' of ' + o.seen + ' rays, e.g. ' + o.sliver.slice(0, 3).join(' '));
            if (!tilt) assert(o.wMax - o.wMin <= 2, tag + ': line width ' + o.wMin + '..' + o.wMax + ' px');
            res.push(tilt + '°/' + rpx + ' ' + o.seen);
          }
        }
        return eng + ' ' + res.join(' ');
      });
      return out.join('; ');
    } finally { await rfHYRestore(sv); }
  });

  // thin light (or dark) lines across a shaded part: an opaque pixel more than 24 levels brighter (darker) than both
  // opaque pixels 2 px away across it, along a row or a column
  function rfHYRidges(img) {
    var w = img.w, h = img.h, p = img.px, light = 0, dark = 0;
    function L(x, y) { var i = (y * w + x) * 4; return p[i + 3] < 250 ? -1 : (p[i] + p[i + 1] + p[i + 2]) / 3; }
    for (var y = 2; y < h - 2; y++) for (var x = 2; x < w - 2; x++) {
      var c = L(x, y); if (c < 0) continue;
      var a = L(x - 2, y), b = L(x + 2, y), u = L(x, y - 2), d = L(x, y + 2);
      if ((a >= 0 && b >= 0 && c > a + 24 && c > b + 24) || (u >= 0 && d >= 0 && c > u + 24 && c > d + 24)) light++;
      if ((a >= 0 && b >= 0 && c < a - 24 && c < b - 24) || (u >= 0 && d >= 0 && c < u - 24 && c < d - 24)) dark++;
    }
    return { light: light, dark: dark };
  }
  step('rfHY: a flanged bushing in Shaded (no edges) zoomed in — no light dotted lines along its outlines and seams and no dark marks on its rims (faces seen edge-on no longer sink behind what they hide; the crack filler stays behind its faces), RealView off and on, both engines', async function () {
    var sv = rfHYSave();
    try {
      var out = await rfHYEngines(RFHY_BUSHING, async function (eng) {
        rfHYLook('shaded');
        var res = [];
        for (var rv of [false, true]) {
          if (rv && !UI.setRealView) continue;
          if (UI.setRealView) UI.setRealView(rv, true);
          rfHYView(-25 / 0.46 * 0.008 * 180 / Math.PI, 20 / 0.46 * 0.008 * 180 / Math.PI, 10 / 600, [3, 3, 1.6]);
          UI.zoomTess.now();
          await wait(30); UI.render(); UI.render();
          var r = rfHYRidges(rfHYCanvas()), tag = eng + (rv ? ' RealView' : '');
          assert(r.light <= 2 && r.dark <= 2, tag + ': ' + r.light + ' light / ' + r.dark + ' dark line pixels across the part (was ~130 light)');
          res.push((rv ? 'RealView' : 'plain') + ' ' + r.light + '/' + r.dark);
        }
        return eng + ' ' + res.join(', ');
      });
      return out.join('; ');
    } finally { await rfHYRestore(sv); }
  });

  // zoom in on a point until the zoom display mesh refines a group of record kind t (or 6 steps) -> deviation rows
  async function rfHYRefine(at, t) {
    UI.setView('Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation();
    UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation();
    UI.zoomTess.setLevel(1);
    for (var i = 0; i < 6; i++) {
      var c = UI.worldToScreen(at);
      UI.zoomToArea(c[0], c[1], 1 / 4); if (UI.finishViewAnimation) UI.finishViewAnimation();
      UI.zoomTess.now();
      var dv = UI.zoomTess.deviation().filter(function (d) { return d.t === t; });
      if (dv.length) return dv;
    }
    // the deepest zoom and still nothing to refine: the engine's own facets are within half a pixel there (OpenCascade
    // meshes a 16 ga bend at 12°) -> the base mesh's gap in pixels, as rows like deviation()'s
    var A = UI.App.mesh._zt;
    return (A ? A.groups : []).filter(function (g) { return g.S.t === t; }).map(function (g) {
      var sag = g.sag != null ? g.sag : g.R * (1 - Math.cos(g.theta / 2));
      return { t: t, base: true, vertPx: 0, sagPx: sag / UI.cam.scale };
    });
  }
  // (rfLR) one step per shape, where it was one step for the four: every shape starts OpenCascade afresh (about 3 s
  // of a 50 MB engine each on a quiet PC), and four or five starts in one step ran into the runner's 30 s limit on a
  // busy machine (23.6 s and a timeout in a part 4/4 run with other suites going). The checks are unchanged.
  [
    ['tor', 'p.units("mm");\np.sketch("Top").circle(0, 0, 10).extrude(10);\np.fillet(3, [[10, 10, 0]]);\n', [6.45, 9.12, 6.45], null, 'a fillet round on a rim (torus)'],
    ['sph', 'p.units("mm");\np.box(20, 20, 20);\np.fillet(4, [[20, 20, 10], [20, 10, 20], [10, 20, 20]]);\n', [18.8, 18.8, 18.8], null, 'a spherical corner'],
    ['cyl', 'p.units("in");\np.sheet(0.0598, 0.06, 0.71);\np.sketch("Top").rect(0, -2, 3, 2).end().baseFlange(0.0598);\np.flange(1, [[0, 0.0598, 1]]);\n', [-0.04, 0.03, 1], '16 ga bend', 'a 16 ga bend'],
    ['cyl', 'p.units("mm");\np.box(60, 40, 5);\np.hole("Top", 30, -20, 8, { offset: 5 });\n', [34, 5, 20], 'Ø8 hole', 'a Ø8 hole']
  ].forEach(function (cs) {
    step('rfHY: zoomed in until facets would show, ' + cs[4] + ' is drawn within half a pixel of the true surface (every drawn vertex on it, every facet\'s middle within 0.5 px), both engines', async function () {
      var sv = rfHYSave();
      try {
        return (await rfHYEngines(cs[1], async function (eng) {
          rfHYLook('shadedEdges');
          var dv = await rfHYRefine(cs[2], cs[0]), tag = (cs[3] || cs[0]) + ' ' + eng;
          assert(dv.length, tag + ': no ' + cs[0] + ' face refined while zooming in: ' + JSON.stringify(UI.zoomTess.info()));
          dv.forEach(function (d) {
            assert(d.vertPx < 0.05, tag + ': a drawn vertex ' + d.vertPx.toFixed(3) + ' px off the surface');
            assert(d.sagPx <= 0.5, tag + ': facets ' + d.sagPx.toFixed(3) + ' px off the surface');
          });
          return tag + (dv[0].base ? ' (its own mesh is fine enough at the deepest zoom)' : ' k ' + UI.zoomTess.info().k) + ' sag ' + Math.max.apply(null, dv.map(function (d) { return d.sagPx; })).toFixed(2) + ' px';
        })).join('; ');
      } finally { await rfHYRestore(sv); }
    });
  });

  // real mouse events on the viewport (press on #viewport, move / release on the window, as ui-sketch.js listens)
  function rfHYEv(type, p, target, mods) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }, mods || {})));
  }
  function rfHYClick(p, mods) { rfHYEv('mousemove', p, null, mods); rfHYEv('mousedown', p, $('viewport'), mods); rfHYEv('mouseup', p, null, mods); }
  // (rfLR) one step per surface, where it was one step for the five (five OpenCascade starts: 15 s on a quiet PC, the
  // 30 s limit on a busy one); the checks are unchanged
  [
    ['spline extrude', 'p.units("mm");\np.sketch("Top").spline([[0,0],[10,8],[20,0],[30,8]]).line(30,8,30,-10).line(30,-10,0,-10).line(0,-10,0,0).end().extrude(10);\n', [[5, 5, 0], [15, 5, 0], [25, 5, 0]], 'Back', null, 'an extruded spline'],
    ['ellipse extrude', 'p.units("mm");\np.sketch("Top").ellipse(0, 0, 20, 10, 0).extrude(5);\n', [[-12, 2.5, 7.9], [0, 2.5, 10], [12, 2.5, 7.9]], 'Front', null, 'an extruded ellipse'],
    ['revolved spline', 'p.units("mm");\np.sketch("Front").spline([[5,0],[8,5],[6,10],[9,15]]).line(9,15,0,15).line(0,15,0,0).line(0,0,5,0).end().revolve(360);\n', null, 'Front', null, 'a revolved spline'],
    ['fillet round', 'p.units("mm");\np.sketch("Top").circle(0, 0, 10).extrude(10);\np.fillet(3, [[10, 10, 0]]);\n', null, 'Front', null, 'a fillet round'],
    ['bend', 'p.units("in");\np.sheet(0.0598, 0.06, 0.71);\np.sketch("Top").rect(0, -2, 3, 2).end().baseFlange(0.0598);\np.flange(1, [[0, 0.0598, 1]]);\n', null, 'Isometric', [-0.0847, 0.0351, 1], 'a bend']
  ].forEach(function (cs) { step('rfHY: clicking anywhere on ' + cs[5] + ' selects the whole surface (one entry, the same face whichever facet is under the cursor), hover lights the whole surface, Ctrl+click on another facet of it takes it off again; both engines', async function () {
    var sv = rfHYSave();
    // points on the face: given, or three facet centroids of its largest group spread across it
    function facePoints(cs) {
      if (cs[2]) return cs[2];
      var m = UI.App.mesh, G = UI.faceGroups(), vis = [];
      // the curved face (more than 3 mesh faces) with the most clickable facets
      G.forEach(function (g, gi) {
        if (!g || g[0] !== gi || g.length <= 3) return;
        var v = g.filter(function (i) {
          var c = m.faces[i].centroid, n = m.faces[i].normal, d = UI.cam.dir;
          if (!c || n[0] * d.x + n[1] * d.y + n[2] * d.z <= 0.3) return false;
          var s = UI.worldToScreen(c), pk = UI.pickFace(s[0], s[1]);
          if (s[0] < 20 || s[1] < 20 || s[0] > UI.size.w - 20 || s[1] > UI.size.h - 20) return false;
          var clear = [[0, 0], [10, 0], [-10, 0], [0, 10], [0, -10]].every(function (o) { return !UI.pickEdge(s[0] + o[0], s[1] + o[1]); });
          return clear && pk && g.indexOf(pk.index) >= 0;   // on the face itself, 10 px clear of its edges
        });
        if (v.length > vis.length) vis = v;
      });
      assert(vis.length >= 3, cs[0] + ': facets facing the viewer ' + vis.length);
      return [vis[0], vis[vis.length >> 1], vis[vis.length - 1]].map(function (i) { return m.faces[i].centroid; });
    }
    try {
        return (await rfHYEngines(cs[1], async function (eng) {
          rfHYLook('shadedEdges');
          UI.setView(cs[3]); if (UI.finishViewAnimation) UI.finishViewAnimation();
          UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation();
          if (cs[4]) { var z = UI.worldToScreen(cs[4]); UI.zoomToArea(z[0], z[1], 1 / 40); if (UI.finishViewAnimation) UI.finishViewAnimation(); }
          UI.zoomTess.now();
          var pts = facePoints(cs), tag = cs[0] + ' ' + eng, keys = [], facets = {};
          UI.setSelection([]);
          for (var i = 0; i < pts.length; i++) {
            var s = UI.worldToScreen(pts[i]), pk = UI.pickFace(s[0], s[1]);
            assert(pk, tag + ': nothing under point ' + i);
            facets[pk.index] = 1;
            rfHYClick(s); await idle();
            var sel = anvil.selection();
            assert(sel.length === 1 && sel[0].kind === 'face', tag + ': click ' + i + ' selected ' + JSON.stringify(sel.map(function (x) { return x.kind + x.index; })));
            keys.push(UI.faceGroup(sel[0].index)[0]);
            var grp = UI.faceGroup(sel[0].index);
            assert(grp.indexOf(pk.index) >= 0, tag + ': the clicked facet ' + pk.index + ' is not in the selected face ' + JSON.stringify(grp.slice(0, 8)));
          }
          assert(keys.every(function (k) { return k === keys[0]; }), tag + ': clicks gave faces ' + keys.join(','));
          assert(Object.keys(facets).length >= 2 || cs[0] === 'bend', tag + ': the clicks hit ' + Object.keys(facets).length + ' facet(s) only (the check proves nothing)');
          // hover from the first point lights the whole face
          var s0 = UI.worldToScreen(pts[0]);
          UI.setSelection([]); rfHYEv('mousemove', s0); await wait(30);
          var hv = UI.App.hover;
          assert(hv && hv.kind === 'face' && UI.faceGroup(hv.index)[0] === keys[0], tag + ': hover ' + JSON.stringify(hv && { kind: hv.kind, index: hv.index }));
          // select from one facet, Ctrl+click another facet of the same face: it toggles off (one face, not two entries)
          var s2 = UI.worldToScreen(pts[pts.length - 1]);
          rfHYClick(s0); await idle();
          rfHYClick(s2, { ctrlKey: true }); await idle();
          var after = anvil.selection();
          assert(after.length === 0, tag + ': Ctrl+click on another facet of the selected face left ' + after.length + ' entries');
          return tag + ': ' + Object.keys(facets).length + ' facets -> face ' + keys[0] + ' (' + UI.faceGroup(keys[0]).length + ' mesh faces)';
        })).join('; ');
    } finally { await rfHYRestore(sv); }
  }); });
