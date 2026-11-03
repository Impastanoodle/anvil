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
      // no background on this ray at all: something else of the scene covers the ground beyond the rim here (in the
      // full run another group's overlay lay over 0° once); not a rim sample. A broken line always shows background.
      if (seq.indexOf('B') < 0) continue;
      seen++;
      var s = seq.join('').replace(/(.)\1+/g, '$1');
      if (!near || /FB|BF/.test(s) || s.split('D').length !== 2) bad.push(deg + ':' + seq.join(''));
      else { dMin = Math.min(dMin, dark); dMax = Math.max(dMax, dark); }
    }
    return { bad: bad, seen: seen, dMin: dMin, dMax: dMax };
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
    var rv0 = UI.realView ? UI.realView() : false, style = UI.App.view.style;
    try {
      await anvil.newPart(); await idle();
      // coarse on purpose (16 chords): the sliver between arc and chord is ~3 px wide at this zoom
      await anvil.run('p.units("mm");\np.sketch("Top").circle(0, 0, 4).extrude(2);\n'); await idle();
      UI.App.model.tessellation = { chordTol: 0.5, maxAngle: 0 };
      await UI.rebuild(); await idle();
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
      if (UI.setRealView) UI.setRealView(rv0, true);
      UI.setStyle(style);
    }
  });

  step('rfHG: a Ø8 hole of a 1200 × 600 panel (32 chords; 24 showed its corners here and was dropped) zoomed in to 300 px across — the rim is one clean dark line, its width even round the hole (no scallops), RealView off and on', async function () {
    var rv0 = UI.realView ? UI.realView() : false, style = UI.App.view.style;
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
        await wait(30); await idle(); UI.render(); UI.render();   // under load: the edge layer of this exact view, drawn twice
        var res = rfHGRim(rfHGCanvas(), z.c, z.r), tag = modes[i] ? 'RealView' : 'plain';
        assert(res.seen >= 300, tag + ': rim on screen at ' + res.seen + ' of 360 degrees');
        assert(!res.bad.length, tag + ': ' + res.bad.length + ' degrees broken, e.g. ' + res.bad.slice(0, 4).join(' '));
        assert(res.dMax - res.dMin <= 2, tag + ': line width ' + res.dMin + '..' + res.dMax + ' px round the rim');
        out.push(tag + ' width ' + res.dMin + '..' + res.dMax + ' px');
      }
      return 'hole r ' + z.r.toFixed(0) + ' px: ' + out.join(', ');
    } finally {
      if (UI.setRealView) UI.setRealView(rv0, true);
      UI.setStyle(style);
    }
  });
