  // ---- rfHD (2026-11-03, lane depthfx: depth effects drawn when the view is still) — View Settings ▸ Shadows In
  // Shaded Mode / Ambient Occlusion (Heads-up flyout and View menu ▸ Display, remembered), AO darkens an inside corner
  // but never an edge or the selection tint, the floor shadow darkens the floor under the part only, a camera move
  // drops the still pass, and the plain UI.render() / anvil.png() frame is the same with the effects on or off.
  // ui-render-fx.js starts every effect off inside this page; each step turns on what it checks and rfHDReset() puts
  // them back (and the remembered values).
  var RFHD_KEYS = ['anvil.ao', 'anvil.shadows', 'anvil.smoothStill'];
  function rfHDSaveLS() { return RFHD_KEYS.map(function (k) { return W.localStorage.getItem(k); }); }
  function rfHDReset(saved) {
    UI.renderFx.persistInTest = false;
    UI.setAmbientOcclusion(false); UI.setShadows(false); UI.setStillSmoothing(false);
    if (saved) RFHD_KEYS.forEach(function (k, i) { if (saved[i] == null) W.localStorage.removeItem(k); else W.localStorage.setItem(k, saved[i]); });
  }
  function rfHDFx(ao, shadows, smooth) { UI.setAmbientOcclusion(ao); UI.setShadows(shadows); UI.setStillSmoothing(smooth); }
  // the canvas as drawn now: { w, h, pr, px (RGBA premultiplied, bottom row first) }
  function rfHDCanvas() {
    var R = UI.renderer, gl = R.getContext(), c = R.domElement, w = c.width, h = c.height, px = new Uint8Array(w * h * 4);
    R.setRenderTarget(null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { w: w, h: h, pr: R.getPixelRatio(), px: px };
  }
  function rfHDPx(img, sx, sy) { var x = Math.round(sx * img.pr), y = Math.round(sy * img.pr), i = ((img.h - 1 - y) * img.w + x) * 4; return [img.px[i], img.px[i + 1], img.px[i + 2], img.px[i + 3]]; }
  function rfHDLum(c) { return (c[0] + c[1] + c[2]) / 3; }
  function rfHDAt(img, p) { var s = UI.worldToScreen(p); return rfHDPx(img, s[0], s[1]); }
  // the darkest pixel in a (2r+1)² CSS-px window around a model point
  function rfHDDarkest(img, p, r) {
    var s = UI.worldToScreen(p), best = 999;
    for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) { var l = rfHDLum(rfHDPx(img, s[0] + dx, s[1] + dy)); if (l < best) best = l; }
    return best;
  }
  async function rfHDView(name) { UI.setView(name); for (var i = 0; i < 50 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(20); if (UI.finishViewAnimation) UI.finishViewAnimation(); UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation(); await wait(30); }
  // a plate with a square boss: inside corners all round the boss's foot
  var RFHD_PART = 'p.units("in");\np.box(4, 4, 0.5);\np.box(1, 1, 1.5, { at: [1.5, 0.5, 1.5] });\n';   // box(x, z, y up): plate 4 × 4 × .5, boss 1 × 1 × 1.5 on it

  step('rfHD: Heads-up View Settings flyout and View menu ▸ Display list Shadows In Shaded Mode and Ambient Occlusion (RealView Graphics only when UI.setRealView exists); each row toggles App.view and is remembered in localStorage', async function () {
    var saved = rfHDSaveLS();
    try {
      rfHDReset();
      UI.renderFx.persistInTest = true;
      UI.closeMenus();
      var hud = $('hud').querySelector('[data-hud="View Settings"]');
      assert(hud, 'View Settings flyout in the Heads-up toolbar');
      function flyRow(text) {
        UI.closeMenus(); hud.click();
        var rows = [].slice.call(D.querySelectorAll('.menu .mi'));
        return rows.filter(function (r) { return r.textContent.indexOf(text) >= 0; })[0];
      }
      var labels = [].slice.call((hud.click(), D.querySelectorAll('.menu .mi'))).map(function (r) { return r.textContent; }).join(' | ');
      UI.closeMenus();
      assert(/Shadows In Shaded Mode/.test(labels) && /Ambient Occlusion/.test(labels) && /Options/.test(labels), 'flyout rows: ' + labels);
      assert(/RealView Graphics/.test(labels) === (typeof UI.setRealView === 'function'), 'RealView Graphics row follows UI.setRealView: ' + labels);
      var r = flyRow('Ambient Occlusion'); r.click();
      assert(UI.App.view.ao === true && UI.ambientOcclusion(), 'Ambient Occlusion on from the flyout');
      assert(W.localStorage.getItem('anvil.ao') === '1', 'remembered: ' + W.localStorage.getItem('anvil.ao'));
      r = flyRow('Shadows In Shaded Mode'); r.click();
      assert(UI.App.view.shadows === true && W.localStorage.getItem('anvil.shadows') === '1', 'Shadows In Shaded Mode on from the flyout');
      UI.closeMenus();
      var rows = menuRows('Display ▸ Ambient Occlusion');
      assert(rows.length === 1 && rows[0].menu.indexOf('View') === 0, 'View menu ▸ Display ▸ Ambient Occlusion: ' + rows.map(function (x) { return x.menu + ':' + x.text; }).join(', '));
      rows[0].row.click();
      assert(UI.App.view.ao === false && W.localStorage.getItem('anvil.ao') === '0', 'Ambient Occlusion off from the View menu');
      rows = menuRows('Display ▸ Shadows In Shaded Mode');
      assert(rows.length === 1, 'View menu ▸ Display ▸ Shadows In Shaded Mode');
      rows[0].row.click();
      assert(UI.App.view.shadows === false && W.localStorage.getItem('anvil.shadows') === '0', 'Shadows off from the View menu');
      UI.closeMenus();
      return labels;
    } finally { UI.closeMenus(); rfHDReset(saved); }
  });

  step('rfHD: Ambient Occlusion (forced still pass) darkens the inside corner at a boss\'s foot against an open spot of the same face; the edge in that corner and a selected face\'s tint are unchanged', async function () {
    var saved = rfHDSaveLS(), style = UI.App.view.style;
    try {
      await anvil.newPart(); await idle();
      await anvil.run(RFHD_PART); await idle();
      UI.setStyle('shadedEdges');
      await rfHDView('Isometric');
      var corner = [2, 0.5, 2.56], open = [3.4, 0.5, 3.4], edge = [2, 0.5, 2.5];
      rfHDFx(false, false, false); UI.render();
      var off = rfHDCanvas();
      rfHDFx(true, false, false);
      var res = UI.renderStill(1);
      assert(res && res.ao, 'the still pass ran with ambient occlusion: ' + JSON.stringify(res));
      var on = rfHDCanvas();
      var c0 = rfHDLum(rfHDAt(off, corner)), o0 = rfHDLum(rfHDAt(off, open)), c1 = rfHDLum(rfHDAt(on, corner)), o1 = rfHDLum(rfHDAt(on, open));
      var msg = 'corner ' + c0.toFixed(0) + ' -> ' + c1.toFixed(0) + ', open ' + o0.toFixed(0) + ' -> ' + o1.toFixed(0);
      assert(Math.abs(c0 - o0) <= 3, 'without AO the corner and the open spot are one grey: ' + msg);
      assert(o0 - c1 >= 10, 'with AO the inside corner is darker than the open spot by 10 levels or more: ' + msg);
      assert(Math.abs(o1 - o0) <= 2, 'the open spot is unchanged: ' + msg);
      var e0 = rfHDDarkest(off, edge, 3), e1 = rfHDDarkest(on, edge, 3);
      assert(Math.abs(e0 - e1) <= 2, 'the edge in the corner keeps its colour: ' + e0.toFixed(0) + ' / ' + e1.toFixed(0));
      // the selection tint: select the plate's top face, compare an open spot of it with the effects off and on
      var s = UI.worldToScreen(open), pk = UI.pickFace(s[0], s[1]);
      assert(pk && pk.index != null, 'picked the top face');
      UI.App.sel = { kind: 'face', index: pk.index }; UI.updateHighlights();
      rfHDFx(false, false, false); UI.render();
      var t0 = rfHDAt(rfHDCanvas(), open);
      rfHDFx(true, false, false); UI.renderStill(1);
      var t1 = rfHDAt(rfHDCanvas(), open);
      assert(Math.abs(t0[0] - t1[0]) <= 2 && Math.abs(t0[1] - t1[1]) <= 2 && Math.abs(t0[2] - t1[2]) <= 2, 'selection tint unchanged: ' + t0.join(',') + ' / ' + t1.join(','));
      assert(t0[2] > t0[0], 'the tint is on (light blue): ' + t0.join(','));
      return msg + '; edge ' + e1.toFixed(0) + '; ' + res.ms.toFixed(0) + ' ms (software GL)';
    } finally { UI.App.sel = null; UI.updateHighlights(); UI.setStyle(style); rfHDReset(saved); UI.render(); }
  });

  step('rfHD: Shadows In Shaded Mode darken the invisible floor just under the part, not the floor far away nor the background; none in Hidden Lines Removed', async function () {
    var saved = rfHDSaveLS(), style = UI.App.view.style;
    try {
      await anvil.newPart(); await idle();
      await anvil.run(RFHD_PART); await idle();
      UI.setStyle('shadedEdges');
      await rfHDView('Isometric');
      // planes / origin shown by an earlier group paint the canvas (a plane is alpha .1): this step reads the floor alone
      var V = UI.App.view, shown = { showPlanes: V.showPlanes, showOrigin: V.showOrigin };
      V.showPlanes = false; V.showOrigin = false; UI.updatePlanes(); UI.updateOrigin();
      // the part shrinks on screen so there is floor around it
      UI.zoomView(2.2); if (UI.finishViewAnimation) UI.finishViewAnimation();
      var under = [2, 0, 4.12], far = [2, 0, 6.5], bg = [12, 14];
      rfHDFx(false, false, false); UI.render();
      var off = rfHDCanvas();
      rfHDFx(false, true, false);
      var res = UI.renderStill(1);
      assert(res && res.shadow, 'the still pass drew the shadow: ' + JSON.stringify(res));
      var on = rfHDCanvas();
      var u0 = rfHDAt(off, under), u1 = rfHDAt(on, under), f0 = rfHDAt(off, far), f1 = rfHDAt(on, far), b0 = rfHDPx(off, bg[0], bg[1]), b1 = rfHDPx(on, bg[0], bg[1]);
      var msg = 'under alpha ' + u0[3] + ' -> ' + u1[3] + ', far ' + f0[3] + ' -> ' + f1[3] + ', background ' + b0[3] + ' -> ' + b1[3];
      assert(u0[3] === 0, 'no paint on the floor without shadows: ' + msg);
      // rfHE (2026-11-03): the floor round the part is now lit (a lighter glow the shadow darkens), so the shadow's
      // premultiplied colour is that floor's light times (1 - shadow), no longer black (was < 8); rfHE checks the
      // shadow reads darker than the floor round it
      assert(u1[3] - u0[3] >= 25 && rfHDLum(u1) < 24, 'a dark shadow just under the part: ' + msg + ' rgb ' + u1.slice(0, 3).join(','));
      assert(Math.abs(f1[3] - f0[3]) <= 3, 'the floor far from the part is clear: ' + msg);
      assert(b0.join(',') === b1.join(','), 'the background elsewhere is unchanged: ' + msg);
      UI.setStyle('hlr'); await wait(30);
      UI.renderStill(1);
      assert(rfHDAt(rfHDCanvas(), under)[3] === 0, 'no floor shadow in Hidden Lines Removed');
      return msg;
    } finally {
      if (typeof shown === 'object' && shown) { V.showPlanes = shown.showPlanes; V.showOrigin = shown.showOrigin; UI.updatePlanes(); UI.updateOrigin(); }
      UI.setStyle(style); rfHDReset(saved); UI.render();
    }
  });

  step('rfHD: moving the camera drops the still pass (the plain frame is drawn) and the still pass comes back once the view rests', async function () {
    var saved = rfHDSaveLS();
    try {
      await anvil.newPart(); await idle();
      await anvil.run(RFHD_PART); await idle();
      await rfHDView('Isometric');
      rfHDFx(true, true, true);
      UI.renderStill();
      var s0 = UI.renderFx.state();
      assert(s0.shown === 'still' && s0.aoOK && s0.k === UI.renderFx.SAMPLES, 'still pass complete: ' + JSON.stringify(s0));
      UI.rotateView(25, 10);
      UI.tick(performance.now());
      var s1 = UI.renderFx.state();
      assert(s1.shown === 'moving' && !s1.aoOK && s1.k === 0, 'a camera move draws the moving frame without AO: ' + JSON.stringify(s1));
      var t0 = performance.now(), s2 = null;
      while (performance.now() - t0 < 4000) { await wait(50); s2 = UI.renderFx.state(); if (s2.shown === 'still' && s2.aoOK) break; }
      assert(s2 && s2.shown === 'still' && s2.aoOK, 'still pass back after the view rests: ' + JSON.stringify(s2));
      return 'back after ' + (performance.now() - t0).toFixed(0) + ' ms';
    } finally { rfHDReset(saved); UI.render(); }
  });

  step('rfHD: the plain frame (UI.render(), anvil.png()) is byte-identical with every effect on or off', async function () {
    var saved = rfHDSaveLS();
    try {
      await anvil.newPart(); await idle();
      await anvil.run(RFHD_PART); await idle();
      await rfHDView('Isometric');
      rfHDFx(false, false, false); UI.render();
      var a = rfHDCanvas(), pa = anvil.png();
      rfHDFx(true, true, true); UI.renderStill();
      UI.render();
      var b = rfHDCanvas(), pb = anvil.png(), diff = 0;
      for (var i = 0; i < a.px.length; i++) if (a.px[i] !== b.px[i]) diff++;
      assert(diff === 0, diff + ' bytes differ in the plain frame');
      assert(pa === pb, 'anvil.png() differs');
      return a.w + ' × ' + a.h;
    } finally { rfHDReset(saved); UI.render(); }
  });
