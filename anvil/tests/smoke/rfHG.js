  // ---- rfHG (2026-11-03, lane outlines: round things look round) — a circular model edge is one unbroken dark line.
  // The edge is drawn on the true circle (screen-resolution polyline) while its faces stop at the facet chords, so
  // zoomed in, background (or the face) showed between the line and the face at every chord's middle: the user's
  // "chewed" copper rim. The thick-line shader now widens a true-curve line over the sliver down to its chord (radial
  // foot, ui-core.js curveChordFeet) and gives that side the chord's depth. Measured on screen: a coarse Ø8 boss
  // (16 chords, sagitta ≈ 3 px at this zoom) seen face-on, RealView off and on, every degree round the rim.
  function rfHGCanvas() {
    var R = UI.renderer, gl = R.getContext(), c = R.domElement, w = c.width, h = c.height, px = new Uint8Array(w * h * 4);
    R.setRenderTarget(null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { w: w, h: h, pr: R.getPixelRatio(), px: px };
  }
  // 'B' background (transparent canvas), 'D' dark (the edge colour), 'F' the face
  function rfHGClass(img, sx, sy) {
    var x = Math.round(sx * img.pr), y = Math.round(sy * img.pr);
    if (x < 0 || y < 0 || x >= img.w || y >= img.h) return null;
    var i = ((img.h - 1 - y) * img.w + x) * 4, a = img.px[i + 3];
    if (a < 128) return 'B';
    return (img.px[i] + img.px[i + 1] + img.px[i + 2]) / 3 / (a / 255) < 70 ? 'D' : 'F';
  }
  // every degree: scanning across the rim from 6 px inside to 6 px outside, face and background never touch (the dark
  // line always lies between them: no 'FB' / 'BF' once runs are merged), one dark run only, and it covers the true
  // circle (a dark pixel within 1.5 px of it). dMin / dMax: the dark run's width (px) round the rim (scallops)
  function rfHGRim(img, c, r) {
    var bad = [], seen = 0, dMin = Infinity, dMax = 0;
    for (var deg = 0; deg < 360; deg++) {
      var a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), seq = [], near = false, dark = 0;
      for (var d = -6; d <= 6; d += 0.5) {
        var k = rfHGClass(img, c[0] + ca * (r + d), c[1] + sa * (r + d));
        if (k == null) { seq = null; break; }
        seq.push(k);
        if (k === 'D') dark += 0.5;
        // the line covers the true circle: a dark pixel within 1.5 px of it, read ±1 px across the ray as well (a ray
        // along a pixel row or column rounds onto one row; the curve's polyline starts at 0°)
        if (Math.abs(d) <= 1.5 && !near) for (var q = -1; q <= 1 && !near; q++) if (rfHGClass(img, c[0] + ca * (r + d) - sa * q, c[1] + sa * (r + d) + ca * q) === 'D') near = true;
      }
      if (!seq) continue;
      seen++;
      var s = seq.join('').replace(/(.)\1+/g, '$1');
      if (!near || /FB|BF/.test(s) || s.split('D').length !== 2) bad.push(deg + ':' + seq.join(''));
      else { dMin = Math.min(dMin, dark); dMax = Math.max(dMax, dark); }
    }
    return { bad: bad, seen: seen, dMin: dMin, dMax: dMax };
  }
  // samples at n angles from a0 to a1 across the rim (±8 px): per sample the dark run's middle minus r (the drawn
  // outline's deviation from the true circle, px) and whether face and background touch anywhere (a gap)
  function rfHGArc(img, c, r, a0, a1, n) {
    var dev = [], gaps = [], seen = 0;
    for (var s = 0; s < n; s++) {
      var a = a0 + (a1 - a0) * s / Math.max(1, n - 1), ca = Math.cos(a), sa = Math.sin(a), first = null, last = null, seq = '';
      for (var d = -8; d <= 8; d += 0.25) {
        var k = rfHGClass(img, c[0] + ca * (r + d), c[1] + sa * (r + d));
        if (k == null) { seq = null; break; }
        seq += k;
        if (k === 'D') { if (first == null) first = d; last = d; }
      }
      if (seq == null) continue;
      seen++;
      var runs = seq.replace(/(.)\1+/g, '$1');
      if (first == null || /FB|BF/.test(runs)) { gaps.push(a.toFixed(4) + ':' + seq); continue; }
      dev.push((first + last) / 2);
    }
    var lo = Math.min.apply(null, dev.concat([0])), hi = Math.max.apply(null, dev.concat([0]));
    return { seen: seen, gaps: gaps, dev: dev, worst: Math.max(Math.abs(lo), Math.abs(hi)), spread: dev.length ? Math.max.apply(null, dev) - Math.min.apply(null, dev) : 0 };
  }
  // the shaded outline with no edge lines drawn: per sample where face meets background (px from the true circle)
  function rfHGBoundary(img, c, r, a0, a1, n) {
    var dev = [], seen = 0, wv = 0, wa = null;
    // coverage (alpha 0..1) at a fractional CSS position, bilinear between pixel centres
    function alphaAt(sx, sy) {
      var x = sx * img.pr - 0.5, y = sy * img.pr - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, acc = 0;
      for (var j = 0; j < 2; j++) for (var i = 0; i < 2; i++) {
        var px = x0 + i, py = y0 + j;
        if (px < 0 || py < 0 || px >= img.w || py >= img.h) return null;
        acc += img.px[((img.h - 1 - py) * img.w + px) * 4 + 3] / 255 * (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
      }
      return acc;
    }
    for (var s = 0; s < n; s++) {
      var a = a0 + (a1 - a0) * s / Math.max(1, n - 1), ca = Math.cos(a), sa = Math.sin(a), prev = null, at = null, pd = null, bad = false;
      for (var d = -8; d <= 8; d += 0.125) {
        var al = alphaAt(c[0] + ca * (r + d), c[1] + sa * (r + d));
        if (al == null) { bad = true; break; }
        if (prev != null && (prev - 0.5) * (al - 0.5) <= 0 && prev !== al && at == null) at = pd + (d - pd) * (0.5 - prev) / (al - prev);   // the 50 % coverage crossing
        prev = al; pd = d;
      }
      if (bad || at == null) continue;
      seen++; dev.push(at);
      if (Math.abs(at) > wv) { wv = Math.abs(at); wa = a; }
    }
    var mean = dev.length ? dev.reduce(function (s2, v) { return s2 + v; }, 0) / dev.length : 0;
    // spread: how far the outline wanders round the circle (the facets' scallops); mean: a constant offset, which this
    // probe also reads on a perfect outline (antialiasing, the crack filler's 1 px lines, canvas rounding: ~1.6 px on a
    // hole seen through, the same with and without refinement)
    return { seen: seen, worst: wv, at: wa, dev: dev, mean: mean, spread: dev.length ? Math.max.apply(null, dev) - Math.min.apply(null, dev) : 0 };
  }
  async function rfHGZoomOn(center, rim, px) {
    UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation();
    var c = UI.worldToScreen(center), s = UI.worldToScreen(rim);
    UI.zoomToArea(c[0], c[1], Math.hypot(s[0] - c[0], s[1] - c[1]) / px); if (UI.finishViewAnimation) UI.finishViewAnimation();
    c = UI.worldToScreen(center); s = UI.worldToScreen(rim);
    await wait(30);
    return { c: c, r: Math.hypot(s[0] - c[0], s[1] - c[1]) };
  }
  step('rfHG: a circular edge seen face-on and zoomed in is one continuous dark line on the true circle — no background between the face and the line at the chords\' middles, RealView off and on', async function () {
    var rv0 = UI.realView ? UI.realView() : false, style = UI.App.view.style, zl = UI.zoomTess ? UI.zoomTess.level() : null;
    // planes / origin left shown by an earlier group cross the rim at 0° in Top view (the Front plane edge-on, the X axis)
    var V = UI.App.view, shown = { showPlanes: V.showPlanes, showOrigin: V.showOrigin };
    V.showPlanes = false; V.showOrigin = false; UI.updatePlanes(); UI.updateOrigin();
    if (UI.zoomTess) UI.zoomTess.setLevel(0);   // the base mesh: this step measures the edge line's chord band
    try {
      await anvil.newPart(); await idle();
      // coarse on purpose (16 chords): the sliver between arc and chord is ~3 px wide at this zoom
      await anvil.run('p.units("mm");\np.sketch("Top").circle(0, 0, 4).extrude(2);\n'); await idle();
      UI.App.model.tessellation = { chordTol: 0.5, maxAngle: 0 };
      await UI.rebuild(); await idle();
      UI.App.view.showPlanes = false; UI.App.view.showOrigin = false; UI.updatePlanes(); UI.updateOrigin();   // again, in case the new part reset them
      if (UI.setAmbientOcclusion) { UI.setAmbientOcclusion(false); UI.setShadows(false); UI.setStillSmoothing(false); }
      UI.setStyle('shadedEdges');
      UI.setView('Top'); if (UI.finishViewAnimation) UI.finishViewAnimation();
      UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation();
      var c = UI.worldToScreen([0, 2, 0]), s = UI.worldToScreen([4, 2, 0]);
      UI.zoomToArea(c[0], c[1], Math.hypot(s[0] - c[0], s[1] - c[1]) / 170); if (UI.finishViewAnimation) UI.finishViewAnimation();
      c = UI.worldToScreen([0, 2, 0]); s = UI.worldToScreen([4, 2, 0]);
      var r = Math.hypot(s[0] - c[0], s[1] - c[1]), out = [];
      assert(Math.abs(r - 170) < 2, 'zoomed: rim radius ' + r.toFixed(1) + ' px');
      var modes = [false];
      if (UI.setRealView) modes.push(true);
      for (var i = 0; i < modes.length; i++) {
        if (UI.setRealView) UI.setRealView(modes[i], true);
        await wait(30); await idle(); UI.render(); UI.render();   // under load: the edge layer of this exact view, drawn twice
        var res = rfHGRim(rfHGCanvas(), c, r);
        assert(res.seen >= 300, 'rim on screen at ' + res.seen + ' of 360 degrees');
        assert(!res.bad.length, (modes[i] ? 'RealView' : 'plain') + ': ' + res.bad.length + ' degrees broken, e.g. ' + res.bad.slice(0, 4).join(' '));
        out.push((modes[i] ? 'RealView' : 'plain') + ' ' + res.seen + '°');
      }
      return 'rim r ' + r.toFixed(0) + ' px, continuous: ' + out.join(', ');
    } finally {
      if (UI.zoomTess && zl != null) UI.zoomTess.setLevel(zl);
      if (UI.setRealView) UI.setRealView(rv0, true);
      UI.setStyle(style);
      V.showPlanes = shown.showPlanes; V.showOrigin = shown.showOrigin; UI.updatePlanes(); UI.updateOrigin();
    }
  });

  step('rfHG: a Ø8 hole of a 1200 × 600 panel (32 chords; 24 showed its corners here and was dropped) zoomed in to 300 px across — the rim is one clean dark line, its width even round the hole (no scallops), RealView off and on', async function () {
    var rv0 = UI.realView ? UI.realView() : false, style = UI.App.view.style, zl = UI.zoomTess ? UI.zoomTess.level() : null;
    if (UI.zoomTess) UI.zoomTess.setLevel(0);   // the base mesh: this step measures the edge line's chord band
    try {
      await anvil.newPart(); await idle();
      await anvil.run('p.units("mm");\np.box(1200, 600, 1.5);\np.hole("Top", 30, -30, 8, { offset: 1.5 });\np.linearPattern({ dir: "x", spacing: 112, count: 10, dir2: "z", spacing2: 110, count2: 5 });\n'); await idle();
      var rims = (UI.K.curveEdges(UI.App.mesh) || []).filter(function (c) { return Math.abs(c.radius - 4) < 1e-6; });
      assert(rims.length === 100 && rims[0].chords.length >= 32,'Ø8 rims ' + rims.length + ', chords ' + (rims[0] && rims[0].chords.length));
      if (UI.setAmbientOcclusion) { UI.setAmbientOcclusion(false); UI.setShadows(false); UI.setStillSmoothing(false); }
      UI.setStyle('shadedEdges');
      UI.setView('Top'); if (UI.finishViewAnimation) UI.finishViewAnimation();
      var z = await rfHGZoomOn([30, 1.5, 30], [34, 1.5, 30], 150), out = [];
      assert(Math.abs(z.r - 150) < 2, 'zoomed: hole radius ' + z.r.toFixed(1) + ' px');
      var modes = [false];
      if (UI.setRealView) modes.push(true);
      for (var i = 0; i < modes.length; i++) {
        if (UI.setRealView) UI.setRealView(modes[i], true);
        await wait(30); UI.render();
        var res = rfHGRim(rfHGCanvas(), z.c, z.r), tag = modes[i] ? 'RealView' : 'plain';
        assert(res.seen >= 300, tag + ': rim on screen at ' + res.seen + ' of 360 degrees');
        assert(!res.bad.length, tag + ': ' + res.bad.length + ' degrees broken, e.g. ' + res.bad.slice(0, 4).join(' '));
        assert(res.dMax - res.dMin <= 2, tag + ': line width ' + res.dMin + '..' + res.dMax + ' px round the rim');
        out.push(tag + ' width ' + res.dMin + '..' + res.dMax + ' px');
      }
      return 'hole r ' + z.r.toFixed(0) + ' px: ' + out.join(', ');
    } finally {
      if (UI.zoomTess && zl != null) UI.zoomTess.setLevel(zl);
      if (UI.setRealView) UI.setRealView(rv0, true);
      UI.setStyle(style);
    }
  });

  // ---- rfHG zoom tessellation (UI.zoomTess): with the view still, cylinders and cones on screen whose facets leave
  // more than half a pixel are drawn from a finer display mesh on the exact surface; zooming out returns the base mesh
  async function rfHGZoomCase(code, center, rim, rpx, label) {
    await anvil.newPart(); await idle();
    await anvil.run(code); await idle();
    if (UI.setAmbientOcclusion) { UI.setAmbientOcclusion(false); UI.setShadows(false); UI.setStillSmoothing(false); }
    UI.setStyle('shadedEdges');
    UI.setView('Top'); if (UI.finishViewAnimation) UI.finishViewAnimation();
    UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation();
    UI.zoomTess.now();
    var base = UI.zoomTess.info();
    // zoom onto the rim point, the circle's radius rpx on screen
    var c = UI.worldToScreen(center), s = UI.worldToScreen(rim);
    UI.zoomToArea(s[0], s[1], Math.hypot(s[0] - c[0], s[1] - c[1]) / rpx); if (UI.finishViewAnimation) UI.finishViewAnimation();
    c = UI.worldToScreen(center); s = UI.worldToScreen(rim);
    var r = Math.hypot(s[0] - c[0], s[1] - c[1]), a = Math.atan2(s[1] - c[1], s[0] - c[0]), span = 260 / r;
    async function shot(level) {
      UI.zoomTess.setLevel(level);
      UI.setStyle('shaded'); var inf = UI.zoomTess.now(); await wait(30); UI.render();   // a style change restores the base mesh first
      var outline = rfHGBoundary(rfHGCanvas(), c, r, a - span, a + span, 200);
      UI.setStyle('shadedEdges'); UI.zoomTess.now(); await wait(30); UI.render();
      var rim = rfHGArc(rfHGCanvas(), c, r, a - span, a + span, 200);
      return { info: inf, outline: outline, rim: rim };
    }
    var off = await shot(0), on = await shot(1);
    return { base: base, info: on.info, off: off, on: on, r: r, a: a, label: label };
  }
  step('rfHG: zoomed in on a Ø8 hole of a 1200 × 600 panel and on a Ø500 cylinder\'s rim, the zoom display mesh puts the drawn outline within a pixel of the true circle with no background through the rim; zooming out restores the base triangle count', async function () {
    var rv0 = UI.realView ? UI.realView() : false, style = UI.App.view.style, lvl = UI.zoomTess.level(), out = [];
    try {
      if (UI.setRealView) UI.setRealView(false, true);
      var cases = [
        await rfHGZoomCase('p.units("mm");\np.box(1200, 600, 1.5);\np.hole("Top", 30, -30, 8, { offset: 1.5 });\np.linearPattern({ dir: "x", spacing: 112, count: 10, dir2: "z", spacing2: 110, count2: 5 });\n', [30, 1.5, 30], [30, 1.5, 34], 900, 'Ø8 hole'),
        await rfHGZoomCase('p.units("mm");\np.sketch("Top").circle(0, 0, 250).extrude(100);\n', [0, 100, 0], [0, 100, 250], 20000, 'Ø500 cylinder')
      ];
      cases.forEach(function (z) {
        assert(z.info && z.info.k > 1 && z.info.tris > z.base.tris, z.label + ': refined ' + JSON.stringify(z.info));
        assert(z.on.outline.seen >= 150 && z.on.rim.seen >= 150, z.label + ': rim on screen at ' + z.on.outline.seen + ' / ' + z.on.rim.seen + ' samples');
        assert(!z.on.rim.gaps.length, z.label + ': background through the rim at ' + z.on.rim.gaps.length + ' samples, e.g. ' + z.on.rim.gaps.slice(0, 3).join(' '));
        var o = z.on.outline, f = z.off.outline;
        assert(o.spread < 1 && Math.abs(o.mean) < 2, z.label + ': shaded outline wanders ' + o.spread.toFixed(2) + ' px round the circle, mean offset ' + o.mean.toFixed(2) + ' (base mesh ' + f.spread.toFixed(2) + ' / ' + f.mean.toFixed(2) + ')');
        out.push(z.label + ' r ' + Math.round(z.r) + ' px, k ' + z.info.k + ', ' + z.base.tris + ' -> ' + z.info.tris + ' tris, outline wander ' + f.spread.toFixed(2) + ' -> ' + o.spread.toFixed(2) + ' px');
      });
      assert(cases.some(function (z) { return z.off.outline.spread >= 1; }), 'the base mesh is visibly off at one of these zooms (else the test proves nothing): ' + cases.map(function (z) { return z.off.outline.spread.toFixed(2); }));
      UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation();
      var back = UI.zoomTess.now(), pos = UI.getBodyMesh().geometry.attributes.position.count;
      assert(back && back.tris === UI.App.mesh.triCount && pos === UI.App.mesh.triCount * 3, 'zoomed out: ' + JSON.stringify(back) + ', drawn vertices ' + pos);
      return out.join('; ');
    } finally {
      UI.zoomTess.setLevel(lvl);
      if (UI.setRealView) UI.setRealView(rv0, true);
      UI.setStyle(style);
    }
  });

  step('rfHG: picking a face drawn from the zoom display mesh selects the same face index as the base mesh; selecting it highlights from the display mesh', async function () {
    var lvl = UI.zoomTess.level();
    try {
      await anvil.newPart(); await idle();
      await anvil.run('p.units("mm");\np.sketch("Top").circle(0, 0, 250).extrude(100);\np.sketch("Top", 100).circle(0, 0, 4).cut(20);\n'); await idle();
      UI.setView('Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation();
      UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation();
      // the hole's far wall, zoomed in
      var wall = [0, 95, -4], c = UI.worldToScreen([0, 100, 0]), s = UI.worldToScreen([4, 100, 0]);
      UI.zoomToArea(c[0], c[1], Math.hypot(s[0] - c[0], s[1] - c[1]) / 150); if (UI.finishViewAnimation) UI.finishViewAnimation();
      var pts = [UI.worldToScreen(wall), UI.worldToScreen([2.8, 97, -2.8]), UI.worldToScreen([-2.8, 92, -2.8]), UI.worldToScreen([60, 100, 60])];
      UI.zoomTess.setLevel(0); UI.zoomTess.now();
      var before = pts.map(function (p) { var h = UI.pickFace(p[0], p[1]); return h ? h.index : null; });
      UI.zoomTess.setLevel(1); var info = UI.zoomTess.now();
      assert(info && info.k > 1, 'refined: ' + JSON.stringify(info));
      var after = pts.map(function (p) { var h = UI.pickFace(p[0], p[1]); return h ? h.index : null; });
      assert(before.every(function (i) { return i != null; }) && JSON.stringify(before) === JSON.stringify(after), 'face picks ' + JSON.stringify(before) + ' -> ' + JSON.stringify(after));
      UI.App.sel = { kind: 'face', index: after[0] }; UI.updateHighlights(); UI.render();   // the highlight is cut from the display mesh (ztRangeGeometry): must not throw
      return 'faces ' + JSON.stringify(after) + ', k ' + info.k;
    } finally { UI.zoomTess.setLevel(lvl); UI.App.sel = null; UI.updateHighlights(); }
  });
