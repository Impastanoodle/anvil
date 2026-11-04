  // ---- rfHE (2026-11-03, lane adaptive: the quality governor and the scene floor) — the governor (ui-render-fx.js,
  // UI.renderFx.governor) lowers RealView / Ambient Occlusion / smoothing when frames are slow and raises them again
  // with hysteresis (fed synthetic timings here: the ui-smoke page never feeds it real frames, G.auto is false); a
  // feature the user turned off stays off; the floor round the part reads lighter than the ground far away and the
  // contact shadow darker than that floor, wherever the part sits (far below the origin, tall); the plain UI.render()
  // frame is byte-identical with the effects off. Every step resets the governor (rfHEGov) and the effects (rfHEFx).
  function rfHEGov() { var G = UI.renderFx.governor; G.reset({ auto: false, slowGuess: false }); return G; }
  function rfHEFx(ao, shadows, smooth) { UI.setAmbientOcclusion(ao); UI.setShadows(shadows); UI.setStillSmoothing(smooth); }
  function rfHEReset() { rfHEGov(); UI.renderFx.persistInTest = false; rfHEFx(false, false, false); }
  function rfHEFeed(G, kind, ms, n, o) { for (var i = 0; i < n; i++) G.feed(kind, ms, o || {}); return G.state(); }
  function rfHECanvas() {
    var R = UI.renderer, gl = R.getContext(), c = R.domElement, w = c.width, h = c.height, px = new Uint8Array(w * h * 4);
    R.setRenderTarget(null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { w: w, h: h, pr: R.getPixelRatio(), px: px };
  }
  function rfHEAt(img, p) {
    var s = UI.worldToScreen(p), x = Math.round(s[0] * img.pr), y = Math.round(s[1] * img.pr);
    if (x < 0 || y < 0 || x >= img.w || y >= img.h) return null;
    var i = ((img.h - 1 - y) * img.w + x) * 4;
    return [img.px[i], img.px[i + 1], img.px[i + 2], img.px[i + 3]];
  }
  // the canvas is premultiplied over the CSS ground: what the eye sees over a ground grey bg (0-255)
  function rfHESeen(c, bg) { return (c[0] + c[1] + c[2]) / 3 + bg * (1 - c[3] / 255); }
  async function rfHEView(name, zoom) {
    UI.setView(name); for (var i = 0; i < 50 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(20);
    if (UI.finishViewAnimation) UI.finishViewAnimation();
    UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation();
    if (zoom) { UI.zoomView(zoom); if (UI.finishViewAnimation) UI.finishViewAnimation(); }
    await wait(30);
  }
  function rfHEQuiet() {   // planes / origin from an earlier group paint the canvas: the floor steps read the floor alone
    var V = UI.App.view, keep = { showPlanes: V.showPlanes, showOrigin: V.showOrigin };
    V.showPlanes = false; V.showOrigin = false; UI.updatePlanes(); UI.updateOrigin();
    return function () { V.showPlanes = keep.showPlanes; V.showOrigin = keep.showOrigin; UI.updatePlanes(); UI.updateOrigin(); };
  }

  step('rfHE: the governor lowers smoothing when still frames are slow and raises it again only well under the budget (hysteresis); AO steps full -> half -> held back, and is tried again on the next model', async function () {
    try {
      var G = rfHEGov(), s;
      G.setScene('rfHE-A');
      var RV = { rv: true };   // still frames as drawn (RealView on, as on a GPU): the cost is the measured one, no ratio
      s = rfHEFeed(G, 'sample', 20, 4, RV);
      assert(s.samples === 8 && s.ao === 'full', 'fast frames: 8 samples, full AO: ' + JSON.stringify(s));
      s = rfHEFeed(G, 'sample', 200, 10, RV);   // the first slow one is taken for a spike and dropped
      assert(s.samples === 4, '200 ms samples: 8 x 200 passes the 1.5 s still pass, 4 samples: ' + JSON.stringify(s.ms) + ' -> ' + s.samples);
      s = rfHEFeed(G, 'sample', 175, 12, RV);
      assert(s.samples === 4, '175 ms: 8 samples would fit (1.4 s) but not under 75 % of the budget, so it stays at 4 (no flicker): ' + s.samples);
      s = rfHEFeed(G, 'sample', 80, 12, RV);
      assert(s.samples === 8, '80 ms: back to 8 samples: ' + s.samples);
      G.setScene('rfHE-B');
      rfHEFeed(G, 'sample', 60, 4, RV);          // still frame budget = max(120 ms, 1.5 x the plain frame) = 120 ms
      s = rfHEFeed(G, 'first', 150, 1, { rv: true, ao: 'full' });   // AO took 90 ms: 150 > 120
      assert(s.ao === 'half', 'AO over the frame budget at full resolution: half: ' + JSON.stringify(s.ms.ao) + ' -> ' + s.ao);
      s = rfHEFeed(G, 'first', 140, 1, { rv: true, ao: 'half' });   // even half resolution takes 80 ms: held back
      assert(s.ao === 'off', 'AO too slow at half resolution: held back: ' + s.ao);
      G.setScene('rfHE-C');
      assert(G.state().ao === 'half', 'a new model tries AO again at half resolution: ' + G.state().ao);
      return 'samples 8 -> 4 -> 4 (hysteresis) -> 8; AO full -> half -> off -> half';
    } finally { rfHEReset(); }
  });

  step('rfHE: RealView is held back while the view moves when its frames are slow (the View Settings row says so) and tried again on a model whose plain frames predict it fits; the user\'s RealView and Ambient Occlusion toggles are never changed', async function () {
    var rv0 = UI.realView ? UI.realView() : false;
    try {
      if (typeof UI.setRealView !== 'function') return 'no RealView in this build';
      UI.setRealView(true, true);
      rfHEFx(true, false, false);
      var G = rfHEGov(), s;
      G.setScene('rfHE-R');
      s = rfHEFeed(G, 'move', 90, 3, { rv: true });
      assert(s.moveRv === false && s.stillRv === true, '90 ms RealView frames while moving: held back while moving, kept when still: ' + JSON.stringify(s));
      var row = UI.depthFxMenuItems().filter(function (r) { return /RealView/.test(r.label); })[0];
      assert(row && row.checked && row.key === 'When still', 'RealView Graphics row stays checked with the note "When still": ' + JSON.stringify(row && { c: row.checked, k: row.key }));
      s = rfHEFeed(G, 'move', 20, 3, { rv: false });
      assert(s.moveRv === false, 'measured 90 ms on this model: stays held back: ' + JSON.stringify(s.ms.move));
      assert(s.ratio >= 2, 'RealView / plain ratio learned from the two: ' + s.ratio);
      G.setScene('rfHE-R2');
      s = rfHEFeed(G, 'move', 6, 3, { rv: false });
      assert(s.moveRv === true, 'a lighter model (6 ms plain x ratio ' + s.ratio + ' fits 40 ms): RealView tried again while moving');
      assert(UI.realView() === true, 'the RealView setting itself never changed');
      // AO held back by the governor: the user's toggle stays on, the row says so, the still pass has no AO
      rfHEFeed(G, 'sample', 100, 4);
      rfHEFeed(G, 'first', 400, 1, { ao: 'full' });
      s = G.state();
      assert(s.ao === 'off' || s.ao === 'half', 'slow AO lowered: ' + s.ao);
      var aoRow = UI.depthFxMenuItems().filter(function (r) { return /Ambient Occlusion/.test(r.label); })[0];
      assert(UI.ambientOcclusion() === true && aoRow.checked && /Held back|Half resolution/.test(aoRow.key || ''), 'AO stays on, its row notes the governor: ' + (aoRow.key || ''));
      // a feature the user turned off stays off however fast the machine is
      UI.setRealView(false, true);
      rfHEFx(false, false, false);
      G = rfHEGov(); G.setScene('rfHE-off');
      rfHEFeed(G, 'move', 2, 5, { rv: false }); rfHEFeed(G, 'sample', 2, 5, { rv: false });
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.box(4, 4, 0.5);\np.box(1, 1, 1.5, { at: [1.5, 0.5, 1.5] });\n'); await idle();
      var res = UI.renderStill(1);
      assert(res === null || !res.ao, 'AO off by the user: no AO in the still pass: ' + JSON.stringify(res));
      assert(UI.realView() === false && UI.ambientOcclusion() === false, 'RealView and AO stay off');
      var row2 = UI.depthFxMenuItems().filter(function (r) { return /RealView|Ambient/.test(r.label); });
      assert(row2.every(function (r) { return !r.checked && !r.key; }), 'rows unchecked, no note: ' + JSON.stringify(row2.map(function (r) { return [r.checked, r.key]; })));
      return 'held while moving, tried again on a lighter model';
    } finally {
      rfHEReset();
      if (typeof UI.setRealView === 'function') UI.setRealView(rv0, true);
      UI.render();
    }
  });

  step('rfHE: Shadows In Shaded Mode on the dark ground: the floor round the part reads lighter than the ground far away and the contact shadow darker than that floor, over the darkest and the lightest ground grey; on the light ground (user 2026-11-04: "shadows look like black glow") no glow and a soft shadow; none in a view from below', async function () {
    var style = UI.App.view.style, back = null, bg0 = UI.App.view.bg;
    try {
      rfHEReset();
      UI.setBackground('dark', true);
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.box(4, 4, 0.5);\np.box(1, 1, 1.5, { at: [1.5, 0.5, 1.5] });\n'); await idle();
      UI.setStyle('shadedEdges');
      back = rfHEQuiet();
      await rfHEView('Isometric', 2.2);
      rfHEFx(false, true, false);
      var res = UI.renderStill(1);
      assert(res && res.shadow, 'still pass with the floor: ' + JSON.stringify(res));
      var img = rfHECanvas();
      var shadow = rfHEAt(img, [2, 0, 4.06]), glow = rfHEAt(img, [2, 0, 5]), far = rfHEAt(img, [2, 0, 6.5]);
      assert(shadow && glow && far, 'the three floor points are on screen');
      var msg = 'rgba shadow ' + shadow.join(',') + ', floor ' + glow.join(',') + ', far ' + far.join(',');
      [14, 60].forEach(function (bg) {
        var sh = rfHESeen(shadow, bg), gl = rfHESeen(glow, bg), fa = rfHESeen(far, bg);
        assert(gl - fa >= 6, 'ground ' + bg + ': the floor near the part is lighter than far away (' + gl.toFixed(1) + ' vs ' + fa.toFixed(1) + '); ' + msg);
        assert(gl - sh >= 10, 'ground ' + bg + ': the shadow is darker than the floor round it (' + sh.toFixed(1) + ' vs ' + gl.toFixed(1) + '); ' + msg);
      });
      assert(far[3] <= 3, 'nothing drawn far away (no floor edge): ' + msg);
      if (UI.theme() !== 'dark') {
        UI.setBackground('gradient', true);
        assert(!UI.darkViewport(), 'the light ground');
        UI.renderStill(1);
        var img2 = rfHECanvas(), sh2 = rfHEAt(img2, [2, 0, 4.06]), gl2 = rfHEAt(img2, [2, 0, 5]);
        msg += '; light ground: shadow ' + sh2.join(',') + ', floor ' + gl2.join(',');
        assert(sh2[3] > 10 && sh2[3] <= 0.6 * shadow[3] && sh2[0] < 20, 'a soft shadow on the light ground (alpha above 10, at most 0.6 of the dark ground shadow): ' + msg);
        assert(gl2[3] < sh2[3] && gl2[0] < 20, 'no grey glow round it on the light ground: ' + msg);
        UI.setBackground('dark', true);
      }
      await rfHEView('Bottom');
      UI.renderStill(1);
      var below = rfHEAt(rfHECanvas(), [2, 0, 4.06]);
      assert(!below || below[3] === 0 || rfHESeen(below, 30) > 25, 'no floor seen from below: ' + (below && below.join(',')));
      return msg;
    } finally { if (back) back(); UI.setStyle(style); UI.setBackground(bg0 || 'gradient', true); rfHEReset(); UI.render(); }
  });

  step('rfHE: the floor is under the part wherever it sits: a part far below the origin and a tall column both get their contact shadow right under them', async function () {
    var style = UI.App.view.style, back = null, out = [], bg0 = UI.App.view.bg;
    try {
      rfHEReset();
      UI.setBackground('dark', true);   // the dark ground's shadow (the light ground's is soft: step above)
      back = rfHEQuiet();
      var cases = [
        { code: 'p.units("in");\np.box(2, 2, 1, { at: [-1, -40, -1] });\n', under: [0, -40, 1.08], far: [0, -40, 2.4], name: 'far below the origin' },
        { code: 'p.units("in");\np.box(1, 1, 12);\n', under: [0.5, 0, 1.04], far: [0.5, 0, 2.5], name: 'tall column' }
      ];
      for (var i = 0; i < cases.length; i++) {
        var c = cases[i];
        await anvil.newPart(); await idle();
        await anvil.run(c.code); await idle();
        UI.setStyle('shaded');
        await rfHEView('Top', 1.8);   // looking down: the floor round the footprint is in view however tall the part
        rfHEFx(false, true, false);
        UI.renderStill(1);
        var img = rfHECanvas(), u = rfHEAt(img, c.under), f = rfHEAt(img, c.far);
        assert(u && f, c.name + ': floor points on screen');
        assert(u[3] >= 60 && rfHESeen(u, 40) < rfHESeen(f, 40) - 5, c.name + ': a shadow right under it: under ' + u.join(',') + ', far ' + f.join(','));
        out.push(c.name + ' a=' + u[3]);
      }
      return out.join('; ');
    } finally { if (back) back(); UI.setStyle(style); UI.setBackground(bg0 || 'gradient', true); rfHEReset(); UI.render(); }
  });

  step('rfHE: with the governor lowered (AO half resolution, 2 samples, RealView held back) the plain UI.render() frame is byte-identical to the frame with every effect off', async function () {
    var rv0 = UI.realView ? UI.realView() : false;
    try {
      rfHEReset();
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.box(4, 4, 0.5);\np.box(1, 1, 1.5, { at: [1.5, 0.5, 1.5] });\n'); await idle();
      await rfHEView('Isometric');
      UI.render();
      var a = rfHECanvas();
      var G = rfHEGov();
      G.setScene('rfHE-plain');
      rfHEFeed(G, 'sample', 400, 6); rfHEFeed(G, 'first', 600, 1, { ao: 'full' }); rfHEFeed(G, 'move', 200, 3, { rv: true });
      var s = G.state();
      assert(s.samples < 8 && s.ao !== 'full' && !s.moveRv, 'governor lowered: ' + JSON.stringify(s));
      rfHEFx(true, true, true);
      var res = UI.renderStill();
      assert(res && res.samples === s.samples && (res.aoQuality === s.ao || (s.ao === 'off' && !res.ao)), 'the still pass follows the governor: ' + JSON.stringify(res) + ' / ' + s.samples + ' ' + s.ao);
      UI.render();
      var b = rfHECanvas(), diff = 0;
      for (var i = 0; i < a.px.length; i++) if (a.px[i] !== b.px[i]) diff++;
      assert(diff === 0, diff + ' bytes differ in the plain frame');
      return a.w + ' × ' + a.h + ', still pass ' + res.samples + ' samples, AO ' + res.aoQuality;
    } finally { rfHEReset(); if (typeof UI.setRealView === 'function') UI.setRealView(rv0, true); UI.render(); }
  });
