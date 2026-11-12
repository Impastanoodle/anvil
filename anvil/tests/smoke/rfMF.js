  // ---- rfMF (2026-11-12, lane swpart): the default part looks like SolidWorks' default part (user: "the exact same thing
  // ... colors and all"). In the user's sw-03 / sw-05 a part with no material is nearly white: the top of a plate #ffffff,
  // its sides #a8aab6 and #95979a, thin dark edges. Anvil draws a part with no material and no colour of its own that way
  // in the light graphics area of the default profile (ui-core.js SW_PART, applyPartLook: its own colour, light rig with a
  // top light, RealView appearance and tone); everything else keeps rfHA's grey exactly. Checked by rendering the part
  // alone and reading pixels, RealView off and on.
  var RFMF_BOX = 'p.units("in");\np.box(3, 2, 1);\n';
  var RFMF_PTS = { top: [1.5, 1, 1], left: [1.5, 0.5, 2], right: [3, 0.5, 1] };
  var RFMF_BR = { plateTop: [20, 4, 30], plateFront: [0, 2, 40], plateRight: [60, 2, 0], bossSide: [-7.5, 14, 13], bossTop: [0, 24, -10] };
  // measured at 057fc50 (before this lane), the same renders: the grey part in the dark theme and under Mastercam, and the
  // Mounting Bracket in the light theme (luminance of each sample point)
  var RFMF_BEFORE = {
    darkPh: { top: [196, 196, 196], left: [149, 149, 149], right: [113, 113, 113] }, darkRV: { top: [181, 182, 185], left: [153, 154, 156], right: [113, 114, 115] },
    mcPh: { top: [179, 179, 179], left: [136, 136, 136], right: [103, 103, 103] }, mcRV: { top: [181, 182, 185], left: [153, 154, 156], right: [113, 114, 115] },
    bracketPh: { plateTop: 196, plateFront: 149, plateRight: 113, bossSide: 116, bossTop: 196 }, bracketRV: { plateTop: 182, plateFront: 151, plateRight: 112, bossSide: 129, bossTop: 183 }
  };
  function rfMFrender() {
    var T = W.THREE, R = UI.renderer, S = UI.scene, cam = UI.camera, pr = R.getPixelRatio();
    var w = Math.round(UI.size.w * pr), h = Math.round(UI.size.h * pr);
    if (UI.render) UI.render();
    var keep = [UI.groups.body, UI.groups.edges], restore = [];
    S.children.forEach(function (c) { if (c !== cam && c.visible && keep.indexOf(c) < 0 && !c.isLight) { restore.push(c); c.visible = false; } });
    var rt = new T.WebGLRenderTarget(w, h, { stencilBuffer: true });
    try {
      R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(); R.render(S, cam);
      var px = new Uint8Array(w * h * 4); R.readRenderTargetPixels(rt, 0, 0, w, h, px);
      return { w: w, h: h, pr: pr, px: px };
    } finally { R.setRenderTarget(null); R.setClearColor(0x000000, 0); restore.forEach(function (c) { c.visible = true; }); rt.dispose(); UI.requestRender(); }
  }
  function rfMFat(img, p) { var s = UI.worldToScreen(p), x = Math.round(s[0] * img.pr), y = Math.round(s[1] * img.pr), i = ((img.h - 1 - y) * img.w + x) * 4; return [img.px[i], img.px[i + 1], img.px[i + 2]]; }
  function rfMFlum(c) { return (c[0] + c[1] + c[2]) / 3; }
  function rfMFsample(P) { var img = rfMFrender(), o = {}; Object.keys(P).forEach(function (k) { o[k] = rfMFat(img, P[k]); }); return o; }
  async function rfMFview() {
    UI.setStyle('shadedEdges'); UI.setView('Isometric');
    for (var i = 0; i < 50 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(20);
    if (UI.finishViewAnimation) UI.finishViewAnimation(); UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation(); await wait(60);
  }
  async function rfMFpart(code) { await anvil.newPart(); await idle(); await anvil.run(code); await idle(); await rfMFview(); }
  function rfMFrv() { try { return localStorage.getItem('anvil.realview'); } catch (e) { return null; } }
  async function rfMFend(keep, style, theme) {
    if (anvil.profile() !== 'solidworks') anvil.profile('solidworks');
    UI.setTheme(theme); UI.setStyle(style);
    UI.setRealView(keep === '1' ? true : keep === '0' ? false : UI.realView(), true);
    try { if (keep == null) localStorage.removeItem('anvil.realview'); else localStorage.setItem('anvil.realview', keep); } catch (e) { }
    await idle();
  }

  step('rfMF: a plate in the light default look is SolidWorks\' default part — top #ffffff, sides #a8aab6 and #95979a within 8 levels, RealView off and on', async function () {
    var keep = rfMFrv(), style = UI.App.view.style, theme = UI.theme(), bad = [], got = [];
    var want = { top: [255, 255, 255], left: [168, 170, 182], right: [149, 151, 154] };
    try {
      UI.setTheme('light');
      for (var rv = 0; rv < 2; rv++) {
        UI.setRealView(!!rv, true);
        await rfMFpart(RFMF_BOX);
        if (!UI.partLook.on()) bad.push('look not on');
        var s = rfMFsample(RFMF_PTS), tag = rv ? 'RealView' : 'Phong';
        Object.keys(want).forEach(function (k) {
          var c = s[k]; got.push(tag + ' ' + k + ' ' + c.join(','));
          if (c.some(function (v, i) { return Math.abs(v - want[k][i]) > 8; })) bad.push(tag + ' ' + k + ' ' + c.join(',') + ' (SolidWorks ' + want[k].join(',') + ')');
        });
      }
    } finally { await rfMFend(keep, style, theme); }
    assert(!bad.length, bad.join('; '));
    return got.join('; ');
  });

  step('rfMF: the Mounting Bracket reads clearly in the new look — adjacent faces (plate top / front / right, boss side / plate top / boss top) at least as far apart as with the grey part, no face blown out but the tops, edges dark', async function () {
    var keep = rfMFrv(), style = UI.App.view.style, theme = UI.theme(), bad = [], got = [];
    // Two checks per pair of adjacent faces, both on absolute luminance differences: (1) at least the step the grey part had
    // at 057fc50 (RFMF_BEFORE: boss side / plate top was 80 Phong, 53 RealView; now ~108 / ~91); (2) a floor of 19 levels,
    // SolidWorks' own smallest step between two adjacent faces of its default part: the two side faces of the plate in sw-03,
    // #a8aab6 (168) against #95979a (149). (The screenshots show no cylinder beside a lit top, so the plate gives the floor.)
    var RFMF_FLOOR = 19;
    var PAIRS = [['plateTop', 'plateFront'], ['plateTop', 'plateRight'], ['bossSide', 'plateTop'], ['bossSide', 'bossTop']];
    try {
      UI.setTheme('light');
      for (var rv = 0; rv < 2; rv++) {
        UI.setRealView(!!rv, true);
        await rfMFpart(anvil.examples[0].code);
        var s = rfMFsample(RFMF_BR), b = RFMF_BEFORE[rv ? 'bracketRV' : 'bracketPh'], tag = rv ? 'RealView' : 'Phong';
        PAIRS.forEach(function (p) {
          var now = Math.abs(rfMFlum(s[p[0]]) - rfMFlum(s[p[1]])), was = Math.abs(b[p[0]] - b[p[1]]);
          got.push(tag + ' ' + p.join('/') + ' ' + Math.round(now) + ' (was ' + was + ')');
          if (now < was - 1) bad.push(tag + ' ' + p.join(' / ') + ' ' + Math.round(now) + ' closer than the grey part (' + was + ')');
          if (now < RFMF_FLOOR) bad.push(tag + ' ' + p.join(' / ') + ' ' + Math.round(now) + ' under the SolidWorks floor ' + RFMF_FLOOR);
        });
        ['plateFront', 'plateRight', 'bossSide'].forEach(function (k) { var l = rfMFlum(s[k]); if (l > 235 || l < 70) bad.push(tag + ' ' + k + ' ' + Math.round(l)); });
        if (UI.mats.edge.color.getHex() !== UI.partLook.SW_PART.edge || rfMFlum([UI.mats.edge.color.r * 255, UI.mats.edge.color.g * 255, UI.mats.edge.color.b * 255]) > 70) bad.push('edge ' + UI.mats.edge.color.getHexString());
      }
    } finally { await rfMFend(keep, style, theme); }
    assert(!bad.length, bad.join('; '));
    return got.join('; ');
  });

  step('rfMF: a part with a material or a colour of its own keeps it and rfHA\'s rig; selection stays light blue, previews yellow / red', async function () {
    var keep = rfMFrv(), style = UI.App.view.style, theme = UI.theme(), bad = [];
    try {
      UI.setTheme('light'); UI.setRealView(false, true);
      await rfMFpart(anvil.examples[0].code + '\np.material("AISI 304");\n');
      var r = UI.partLook.rig();
      if (UI.partLook.on()) bad.push('look on with a material');
      if (r.hemi !== 0.85 || r.key !== 0.64 || r.fill !== 0.31 || r.rim !== 0.25 || r.top !== 0) bad.push('rig with a material ' + JSON.stringify(r));
      if (UI.mats.part.color.getHexString() === new W.THREE.Color(UI.partLook.SW_PART.color).getHexString()) bad.push('material part drawn in the default white');
      await rfMFpart(RFMF_BOX + 'p.color("#2f6db5");\n');
      if (UI.partLook.on() || UI.mats.part.color.getHexString() !== '2f6db5') bad.push('own colour ' + UI.mats.part.color.getHexString());
      UI.setRealView(true, true); await idle();
      var m = UI.getBodyMesh().material;
      if (m.userData.realView && m.color.getHexString() !== '2f6db5') bad.push('RealView own colour ' + m.color.getHexString());
      await rfMFpart(RFMF_BOX);
      if (UI.mats.sel.color.getHex() !== 0x7ec8ff || UI.mats.preview.color.getHex() !== 0xf2cf5b || UI.mats.previewCut.color.getHex() !== 0xe8746a) bad.push('overlay colours');
    } finally { await rfMFend(keep, style, theme); }
    assert(!bad.length, bad.join('; '));
    return 'ok';
  });

  step('rfMF: the dark theme and the Mastercam profile draw the grey part exactly as before (pixels of an isometric box equal to 057fc50), RealView off and on', async function () {
    var keep = rfMFrv(), style = UI.App.view.style, theme = UI.theme(), bad = [];
    try {
      for (var rv = 0; rv < 2; rv++) {
        UI.setRealView(!!rv, true); var tag = rv ? 'RV' : 'Ph';
        UI.setTheme('dark'); await rfMFpart(RFMF_BOX);
        var d = rfMFsample(RFMF_PTS); if (UI.partLook.on()) bad.push('look on in the dark theme');
        anvil.profile('mastercam'); UI.setTheme('light'); await wait(300); await rfMFpart(RFMF_BOX);
        var m = rfMFsample(RFMF_PTS); if (UI.partLook.on()) bad.push('look on under Mastercam');
        anvil.profile('solidworks');
        [['dark', d], ['mc', m]].forEach(function (p) {
          var b = RFMF_BEFORE[p[0] + tag];
          Object.keys(b).forEach(function (k) { if (p[1][k].some(function (v, i) { return Math.abs(v - b[k][i]) > 1; })) bad.push(p[0] + ' ' + tag + ' ' + k + ' ' + p[1][k].join(',') + ' (was ' + b[k].join(',') + ')'); });
        });
      }
    } finally { await rfMFend(keep, style, theme); }
    assert(!bad.length, bad.join('; '));
    return 'dark and Mastercam unchanged';
  });
