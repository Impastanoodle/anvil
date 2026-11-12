  // ---- rfHC (2026-11-03, lane realview): RealView. UI.setRealView(on) swaps the part onto a physically based material
  // lit by a procedural studio (PMREM); off is rfHA's Phong part exactly. The setting persists (localStorage
  // anvil.realview), the default is on with a GPU and off on a software rasterizer (this page runs on one). With it on:
  // materials read apart (steel / aluminium tones, a highlight on rounds), the selection tint, pre-highlight, sketch and
  // edge colours are the rule colours, edges stay dark and whole-pixel, section caps are drawn, per-body appearances.
  async function rfHCView(name) { UI.setView(name); for (var i = 0; i < 50 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(20); if (UI.finishViewAnimation) UI.finishViewAnimation(); UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation(); await wait(30); }
  // the part (faces, edges, highlights) as the user sees it, into a target at device size -> { w, h, pr, px }
  function rfHCRender(withHighlight) {
    var T = W.THREE, R = UI.renderer, S = UI.scene, cam = UI.camera, pr = R.getPixelRatio();
    var w = Math.round(UI.size.w * pr), h = Math.round(UI.size.h * pr);
    if (UI.render) UI.render();
    var keep = [UI.groups.body, UI.groups.edges].concat(withHighlight ? [UI.groups.highlight] : []), restore = [];
    S.children.forEach(function (c) { if (c !== cam && c.visible && keep.indexOf(c) < 0 && !c.isLight && !(c.userData && c.userData.sectionCaps)) { restore.push(c); c.visible = false; } });
    var rt = new T.WebGLRenderTarget(w, h, { stencilBuffer: true });
    try {
      R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(); R.render(S, cam);
      var px = new Uint8Array(w * h * 4); R.readRenderTargetPixels(rt, 0, 0, w, h, px);
      return { w: w, h: h, pr: pr, px: px };
    } finally {
      R.setRenderTarget(null); R.setClearColor(0x000000, 0);
      restore.forEach(function (c) { c.visible = true; });
      rt.dispose(); UI.requestRender();
    }
  }
  function rfHCPx(img, sx, sy) { var x = Math.round(sx * img.pr), y = Math.round(sy * img.pr), i = ((img.h - 1 - y) * img.w + x) * 4; return [img.px[i], img.px[i + 1], img.px[i + 2], img.px[i + 3]]; }
  function rfHCAt(img, p) { var s = UI.worldToScreen(p); return rfHCPx(img, s[0], s[1]); }
  function rfHCLum(c) { return (c[0] + c[1] + c[2]) / 3; }
  function rfHCStored() { try { return W.localStorage.getItem('anvil.realview'); } catch (e) { return null; } }
  function rfHCRestore(v) { try { if (v == null) W.localStorage.removeItem('anvil.realview'); else W.localStorage.setItem('anvil.realview', v); } catch (e) { } UI.setRealView(v === '1' ? true : v === '0' ? false : UI.realViewInfo().byDefault, true); }
  var RFHC_BOX = 'p.units("in");\np.box(3, 2, 1);\n';   // x 0..3, y (up) 0..1, z 0..2

  step('rfHC: RealView toggles and persists (localStorage anvil.realview), defaults on with a GPU and off on a software rasterizer; on = the physically based material in a studio, off = the Phong part', async function () {
    assert(typeof UI.setRealView === 'function' && typeof UI.realView === 'function' && typeof UI.realViewInfo === 'function', 'UI.setRealView / realView / realViewInfo');
    var keep = rfHCStored(), style = UI.App.view.style;
    try {
      var info = UI.realViewInfo();
      assert(info.byDefault === !info.software, 'default rule: on unless software WebGL (software ' + info.software + ')');
      await anvil.newPart(); await idle();
      await anvil.run(RFHC_BOX); await idle();
      UI.setStyle('shadedEdges');
      assert(UI.setRealView(true) === true && UI.realView() === true && UI.App.view.realView === true && rfHCStored() === '1', 'on, remembered');
      var m = UI.getBodyMesh().material;
      assert(m.userData.realView && m.isMeshStandardMaterial && m.envMap, 'body on the RV material with the studio: ' + m.type);
      assert(UI.getCrackFill().material.userData.realView && UI.getCrackFill().material.wireframe, 'crack filler follows');
      UI.setStyle('hlr');
      assert(UI.getBodyMesh().material === UI.mats.hlr, 'HLR keeps the occluder');
      UI.setStyle('shadedEdges');
      assert(UI.getBodyMesh().material.userData.realView, 'back on the RV material');
      assert(UI.setRealView(false) === false && rfHCStored() === '0' && UI.getBodyMesh().material === UI.mats.part, 'off: the Phong part, remembered');
      return 'software GL ' + info.software + ', studio ' + Math.round(UI.realViewInfo().envMs) + ' ms';
    } finally { rfHCRestore(keep); UI.setStyle(style); }
  });

  step('rfHC: RealView off renders exactly as before (rfHA: isometric box top ~196, left ~148, right ~112, Normal To ~162)', async function () {
    var keep = rfHCStored(), style = UI.App.view.style;
    // swpart (2026-11-12): this pins rfHA's grey part, which the light default look replaced with SolidWorks' near-white
    // one (rfMF); the grey rig is unchanged in the dark theme, so it is measured there
    var swpTheme = UI.theme(); UI.setTheme('dark');
    try {
      UI.setRealView(false, true);
      await anvil.newPart(); await idle();
      await anvil.run(RFHC_BOX); await idle();
      UI.setStyle('shaded');
      await rfHCView('Isometric');
      var img = rfHCRender(), t = rfHCLum(rfHCAt(img, [1.5, 1, 1])), l = rfHCLum(rfHCAt(img, [1.5, 0.5, 2])), r = rfHCLum(rfHCAt(img, [3, 0.5, 1]));
      var msg = 'top ' + t.toFixed(0) + ', left ' + l.toFixed(0) + ', right ' + r.toFixed(0);
      assert(Math.abs(t - 196) <= 2 && Math.abs(l - 148.5) <= 2 && Math.abs(r - 112.5) <= 2, 'RealView off = rfHA: ' + msg);
      await rfHCView('Front');
      var f = rfHCLum(rfHCAt(rfHCRender(), [1.5, 0.5, 2]));
      assert(Math.abs(f - 162.5) <= 2, 'Normal To ' + f.toFixed(0));
      return msg + ', Normal To ' + f.toFixed(0);
    } finally { rfHCRestore(keep); UI.setStyle(style); UI.setTheme(swpTheme); }
  });

  step('rfHC: RealView on: the no-material part keeps rfHA\'s distinct greys; steel and aluminium read apart; a round in steel carries a highlight streak; hot rolled is darker than cold rolled', async function () {
    var keep = rfHCStored(), style = UI.App.view.style, out = [];
    // swpart (2026-11-12): this pins rfHA's grey part, which the light default look replaced with SolidWorks' near-white
    // one (rfMF); the grey rig is unchanged in the dark theme, so it is measured there
    var swpTheme = UI.theme(); UI.setTheme('dark');
    try {
      UI.setRealView(true, true);
      await anvil.newPart(); await idle();
      await anvil.run(RFHC_BOX); await idle();
      UI.setStyle('shaded');
      await rfHCView('Isometric');
      function tones() { var img = rfHCRender(); return [rfHCAt(img, [1.5, 1, 1]), rfHCAt(img, [1.5, 0.5, 2]), rfHCAt(img, [3, 0.5, 1])].map(rfHCLum); }
      var g = tones();
      assert(g[0] - g[1] >= 20 && g[1] - g[2] >= 20 && g[0] <= 235 && g[2] >= 70, 'satin grey: top / left / right ' + g.map(Math.round).join(' / '));
      out.push('grey ' + g.map(Math.round).join('/'));
      var tone = {};
      var mats = [['steel', 'Plain Carbon Steel'], ['al', '6061'], ['hr', 'ASTM A36 Steel']];
      for (var i = 0; i < mats.length; i++) {
        await UI.setMaterial(mats[i][1]); await idle();
        assert(UI.getBodyMesh().material.userData.realView, mats[i][1] + ' on the RV material');
        tone[mats[i][0]] = tones();
        out.push(mats[i][0] + ' ' + tone[mats[i][0]].map(Math.round).join('/'));
      }
      var d = Math.abs(tone.steel[0] - tone.al[0]) + Math.abs(tone.steel[1] - tone.al[1]) + Math.abs(tone.steel[2] - tone.al[2]);
      assert(d >= 30, 'steel and aluminium differ in tone (sum of differences ' + d.toFixed(0) + ')');
      assert(tone.hr[0] < tone.steel[0] - 25 && tone.hr[1] < tone.steel[1] - 15, 'hot rolled darker than cold rolled');
      // a Ø1 bar in steel seen from the front: across the round, a bright streak and a dark side (a reflection, not a flat tone)
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.sketch("Top").circle(0, 0, 0.5).extrude(2);\np.material("Plain Carbon Steel");\n'); await idle();
      UI.setStyle('shaded');
      await rfHCView('Front');
      var img = rfHCRender(), lo = 255, hi = 0;
      for (var k = -0.45; k <= 0.45; k += 0.03) { var c = rfHCLum(rfHCAt(img, [k, 1, 0])); lo = Math.min(lo, c); hi = Math.max(hi, c); }
      assert(hi >= 170 && hi - lo >= 70, 'highlight across the round: ' + lo.toFixed(0) + ' .. ' + hi.toFixed(0));
      out.push('round ' + lo.toFixed(0) + '..' + hi.toFixed(0));
      return out.join('; ');
    } finally { rfHCRestore(keep); UI.setStyle(style); UI.setTheme(swpTheme); }
  });

  step('rfHC: with RealView on the overlay colours are the rule colours: selection tint #7ec8ff @0.45 blended over the face exactly, pre-highlight #ff9a2e, sketch white, edges #161616 dark and whole-pixel', async function () {
    var keep = rfHCStored(), style = UI.App.view.style;
    try {
      UI.setRealView(true, true);
      await anvil.newPart(); await idle();
      await anvil.run(RFHC_BOX + 'p.material("AISI 304");\n'); await idle();
      UI.setStyle('shadedEdges');
      var M = UI.mats;
      assert(M.sel.color.getHex() === 0x7ec8ff && Math.abs(M.sel.opacity - 0.45) < 1e-9 && M.hover.color.getHex() === 0xff9a2e, 'sel / hover materials');
      // swpart: the body edge is UI.partLook.bodyEdge() (SolidWorks' on its default part)
      assert(M.sketch.color.getHex() === UI.linePalette().sketch && M.sketchSel.color.getHex() === UI.linePalette().sketchSel && M.edge.color.getHex() === UI.partLook.bodyEdge(), 'sketch / selection / edge colours');
      assert(UI.renderer.toneMapping === W.THREE.NoToneMapping && UI.renderer.outputEncoding === W.THREE.LinearEncoding, 'the renderer stays linear: overlays are drawn as given');
      await rfHCView('Isometric');
      var p = [1.5, 1, 1], base = rfHCAt(rfHCRender(true), p);
      var top = UI.pickFace.apply(null, UI.worldToScreen(p));
      var fi = top && top.index != null ? top.index : (top && top.face != null ? top.face : null);
      assert(fi != null, 'top face picked: ' + JSON.stringify(top && Object.keys(top)));
      UI.setSelection([{ kind: 'face', index: fi }]); UI.updateHighlights();
      var sel = rfHCAt(rfHCRender(true), p), want = [0x7e, 0xc8, 0xff].map(function (c, k) { return base[k] * 0.55 + c * 0.45; });
      var err = Math.max(Math.abs(sel[0] - want[0]), Math.abs(sel[1] - want[1]), Math.abs(sel[2] - want[2]));
      assert(err <= 3, 'selected: ' + sel.slice(0, 3).join(',') + ' = face ' + base.slice(0, 3).join(',') + ' with #7ec8ff @0.45 (' + want.map(Math.round).join(',') + ')');
      UI.setSelection([]); UI.updateHighlights();
      // edges: dark between the top and the front face, crisp when square to the screen
      var fm = M.edge.userData.fatMats && M.edge.userData.fatMats.line;
      if (fm) { var dw = fm.uniforms.linewidth.value * UI.renderer.getPixelRatio(); assert(Math.abs(dw - Math.round(dw)) < 1e-6 && dw >= 1, 'edge width in device px: ' + dw); }
      var img = rfHCRender(), s = UI.worldToScreen([1.5, 1, 2]), darkest = 255;
      for (var dy = -3; dy <= 3; dy++) for (var dx = -3; dx <= 3; dx++) darkest = Math.min(darkest, rfHCLum(rfHCPx(img, s[0] + dx, s[1] + dy)));
      assert(darkest < 45, 'a dark edge between the top and the front face: darkest ' + darkest.toFixed(0));
      await rfHCView('Front');
      img = rfHCRender();
      var e = UI.worldToScreen([1.5, 1, 2]), col = [], x = Math.round(e[0] * img.pr), y0 = Math.round(e[1] * img.pr);
      for (var y = y0 - 6; y <= y0 + 6; y++) { var i = ((img.h - 1 - y) * img.w + x) * 4; col.push(img.px[i + 3] < 128 ? -1 : Math.round((img.px[i] + img.px[i + 1] + img.px[i + 2]) / 3)); }
      var dark = col.filter(function (v) { return v >= 0 && v < 40; }).length, smear = col.filter(function (v) { return v >= 40 && v < 90; }).length;
      assert(dark >= 1 && dark <= 3 && smear <= 1, 'crisp horizontal edge (dark ' + dark + ', half-tone ' + smear + '): ' + col.join(' '));
      return 'selected error ' + err.toFixed(1) + '; column ' + col.join(' ');
    } finally { UI.setSelection([]); rfHCRestore(keep); UI.setStyle(style); }
  });

  step('rfHC: with RealView on Section View still caps the cut (the RV body is clipped, the cap drawn at the cut centre); body materials give each body its own appearance (per-vertex data)', async function () {
    var keep = rfHCStored(), style = UI.App.view.style;
    try {
      UI.setRealView(true, true);
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.box(4, 2, 2);\np.box(2, 2, 2, { at: [4, 0, 0], merge: false });\np.material("6061");\n'); await idle();
      UI.setStyle('shadedEdges');
      await rfHCView('Isometric');
      UI.cmdSection(); await idle();
      var body = UI.getBodyMesh().material;
      assert(UI.App.view.section && body.userData.realView && body.clippingPlanes && body.clippingPlanes.length === 1, 'the RV body is clipped by the section');
      assert(UI.sectionCaps().children.length === 4, 'caps: ' + UI.sectionCaps().children.length);
      // rfHF re-pinned: with RealView on the cap is drawn in its own RV material (the part's appearance), not mats.cap
      var capMesh = UI.sectionCaps().children.filter(function (c) { return c.isMesh && c.userData.capPlane; })[0];
      assert(capMesh && capMesh.material.userData.realView && capMesh.material !== UI.mats.cap, 'the cap is on a RealView material');
      var mc = capMesh.material, k0 = mc.color.getHex(), mt0 = mc.metalness;
      mc.color.setHex(0xff0000); mc.metalness = 0;
      if (UI.render) UI.render();
      var T = W.THREE, R = UI.renderer, w = Math.round(UI.size.w * R.getPixelRatio()), h = Math.round(UI.size.h * R.getPixelRatio()), rt = new T.WebGLRenderTarget(w, h, { stencilBuffer: true }), px = new Uint8Array(w * h * 4);
      R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(); R.render(UI.scene, UI.camera); R.readRenderTargetPixels(rt, 0, 0, w, h, px); R.setRenderTarget(null); rt.dispose();
      mc.color.setHex(k0); mc.metalness = mt0;
      var c = rfHCPx({ w: w, h: h, pr: R.getPixelRatio(), px: px }, UI.worldToScreen([3, 1, 1])[0], UI.worldToScreen([3, 1, 1])[1]);
      assert(c[0] > 150 && c[1] < 90 && c[2] < 90, 'cap drawn at the cut centre: rgba ' + c.join(','));
      UI.pmCancel(); await idle();
      // body materials: the second body in stainless
      var info = UI.bodyInfo(), fid = info[1] && info[1].featureId;
      assert(fid != null, 'two bodies: ' + JSON.stringify(info.map(function (b) { return b.name; })));
      await UI.setBodyMaterial(1, 'AISI 304'); await idle();
      var m = UI.getBodyMesh().material, g = UI.getBodyMesh().geometry;
      assert(m.userData.realView && m.defines && 'RV_VERTEX' in m.defines && g.getAttribute('rvColor') && g.getAttribute('rvAppear'), 'per-vertex appearances');
      var A = g.getAttribute('rvAppear').array, pats = {};
      for (var i = 2; i < A.length; i += 3) pats[A[i]] = 1;
      assert(pats[0] && pats[1], 'aluminium (plain) and stainless (brushed) bodies: patterns ' + Object.keys(pats).join(','));
      UI.setRealView(false, true);
      assert(UI.getBodyMesh().material === UI.mats.part && UI.mats.part.vertexColors, 'off: the Phong part with the flat body colours');
      return 'ok';
    } finally { if (UI.hasPM && UI.hasPM()) UI.pmCancel(); UI.App.view.section = null; rfHCRestore(keep); UI.setStyle(style); }
  });
