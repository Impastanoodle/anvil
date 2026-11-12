  // ---- rfHA (2026-11-03, lane viewport: the graphics area's finish) — the part's studio lighting gives planar faces at
  // different angles distinct greys, edges are dark and drawn on whole device pixels (crisp when square to the screen),
  // nothing blue on the part, the ground keeps its grey-black gradient with a grain layer under the canvas, the Heads-up
  // toolbar's glyphs share one box and one centre line with SVG flyout chevrons, the triad is drawn at the screen's
  // pixel density, and sketch dimensions carry a dark casing under their light lines.
  async function rfHAView(name) { UI.setView(name); for (var i = 0; i < 50 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(20); if (UI.finishViewAnimation) UI.finishViewAnimation(); UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation(); await wait(30); }
  // the scene as the user sees it but with only the part (faces + edges): { w, h, px (RGBA, bottom row first) }
  function rfHARender() {
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
    } finally {
      R.setRenderTarget(null); R.setClearColor(0x000000, 0);
      restore.forEach(function (c) { c.visible = true; });
      rt.dispose(); UI.requestRender();
    }
  }
  function rfHAPx(img, sx, sy) { var x = Math.round(sx * img.pr), y = Math.round(sy * img.pr), i = ((img.h - 1 - y) * img.w + x) * 4; return [img.px[i], img.px[i + 1], img.px[i + 2], img.px[i + 3]]; }
  function rfHALum(c) { return (c[0] + c[1] + c[2]) / 3; }
  var RFHA_BOX = 'p.units("in");\np.box(3, 2, 1);\n';   // x 0..3, y (up) 0..1, z 0..2

  step('rfHA: studio lighting: an isometric box shows three clearly different greys (top lightest, then the left (front) face, then the right), none washed out or black; a face seen Normal To reads mid-light grey', async function () {
    var style = UI.App.view.style;
    // swpart (2026-11-12): this pins rfHA's grey part, which the light default look replaced with SolidWorks' near-white
    // one (rfMF); the grey rig is unchanged in the dark theme, so it is measured there
    var swpTheme = UI.theme(); UI.setTheme('dark');
    try {
      await anvil.newPart(); await idle();
      await anvil.run(RFHA_BOX); await idle();
      UI.setStyle('shaded');
      await rfHAView('Isometric');
      var img = rfHARender();
      function at(p) { var s = UI.worldToScreen(p); return rfHALum(rfHAPx(img, s[0], s[1])); }
      var top = at([1.5, 1, 1]), left = at([1.5, 0.5, 2]), right = at([3, 0.5, 1]);
      var msg = 'top ' + top.toFixed(0) + ', left ' + left.toFixed(0) + ', right ' + right.toFixed(0);
      assert(top - left >= 20 && left - right >= 20, 'faces at different angles differ by 20 levels or more: ' + msg);
      assert(top <= 235 && right >= 70, 'no face washed out or near black: ' + msg);
      await rfHAView('Front');
      img = rfHARender();
      var face = at([1.5, 0.5, 2]);
      assert(face >= 130 && face <= 215, 'a face square to the view is mid-light grey: ' + face.toFixed(0));
      return msg + '; Normal To ' + face.toFixed(0);
    } finally { UI.setStyle(style); UI.setTheme(swpTheme); }
  });

  step('rfHA: edges dark (#161616) on shaded faces, a whole number of device pixels wide; an edge square to the screen covers whole pixels (no grey smear beside it)', async function () {
    var style = UI.App.view.style;
    // swpart (2026-11-12): the line probes classify pixels as face / dark line / background for rfHA's grey part and #161616 edges; the light default look now draws SolidWorks' near-white part, so they run on the grey part, which the dark theme keeps
    var swpTheme = UI.theme(); UI.setTheme('dark');
    try {
      await anvil.newPart(); await idle();
      await anvil.run(RFHA_BOX); await idle();
      UI.setStyle('shadedEdges');
      // swpart: the default part in the light default look has SolidWorks' edge colour (UI.partLook.bodyEdge())
      assert(UI.mats.edge.color.getHex() === UI.partLook.bodyEdge(), 'edge colour on shaded faces: ' + UI.mats.edge.color.getHexString());
      await rfHAView('Isometric');
      var fm = UI.mats.edge.userData.fatMats && UI.mats.edge.userData.fatMats.line;
      if (fm) { var dw = fm.uniforms.linewidth.value * UI.renderer.getPixelRatio(); assert(Math.abs(dw - Math.round(dw)) < 1e-6 && dw >= 1, 'edge width in device px: ' + dw); }
      var img = rfHARender(), s = UI.worldToScreen([1.5, 1, 2]), darkest = 255;
      for (var dy = -3; dy <= 3; dy++) for (var dx = -3; dx <= 3; dx++) darkest = Math.min(darkest, rfHALum(rfHAPx(img, s[0] + dx, s[1] + dy)));
      assert(darkest < 45, 'a dark edge between the top and the front face: darkest ' + darkest.toFixed(0));
      // Front view: the box's top edge runs square to the screen; down a column through it, the dark run is whole
      await rfHAView('Front');
      img = rfHARender();
      var e = UI.worldToScreen([1.5, 1, 2]), col = [], x = Math.round(e[0] * img.pr), y0 = Math.round(e[1] * img.pr);
      for (var y = y0 - 6; y <= y0 + 6; y++) { var i = ((img.h - 1 - y) * img.w + x) * 4; col.push(img.px[i + 3] < 128 ? -1 : Math.round((img.px[i] + img.px[i + 1] + img.px[i + 2]) / 3)); }
      var dark = col.filter(function (v) { return v >= 0 && v < 40; }).length, smear = col.filter(function (v) { return v >= 40 && v < 90; }).length;
      assert(dark >= 1 && dark <= 3 && smear <= 1, 'crisp horizontal edge (dark ' + dark + ', half-tone ' + smear + '): ' + col.join(' '));
      return 'darkest ' + darkest.toFixed(0) + '; column ' + col.join(' ');
    } finally { UI.setStyle(style); UI.setTheme(swpTheme); }
  });

  step('rfHA: no blue on the shaded part, in the light and the dark theme (only the axis colours may be blue, and they are not drawn here)', async function () {
    var theme0 = UI.theme(), style = UI.App.view.style;
    try {
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.box(3, 2, 1);\np.fillet(0.25, [[0, 0.5, 0], [3, 0.5, 2]]);\np.sketch("Top", 1).circle(1.5, -1, 0.3).cut("through", { reverse: true });\n'); await idle();
      UI.setStyle('shadedEdges');
      await rfHAView('Isometric');
      var out = [];
      ['light', 'dark'].forEach(function (th) {
        UI.setTheme(th);
        var img = rfHARender(), n = 0, part = 0;
        for (var p = 0; p < img.px.length; p += 4) {
          if (img.px[p + 3] < 250) continue;
          part++;
          var r = img.px[p], g = img.px[p + 1], b = img.px[p + 2];
          if (b > r + 18 && b > g + 18) n++;
        }
        assert(part > 2000, th + ': the part is drawn (' + part + ' px)');
        assert(n === 0, th + ' theme: ' + n + ' blue pixels on the part');
        out.push(th + ' ' + part + ' px');
      });
      return out.join(', ');
    } finally { UI.setTheme(theme0); UI.setStyle(style); }
  });

  step('rfHA: the ground is an eased gradient of several grey stops with a grain layer under the canvas — grey-black (#3c3c3c to #0e0e0e) in the dark theme, light in the light theme (user 2026-11-04; since swcolors the SolidWorks gradient, white to #d8dce8)', async function () {
    var theme0 = UI.theme(), vp = $('viewport');
    try {
      ['light', 'dark'].forEach(function (th) {
        UI.setTheme(th); UI.setBackground('gradient', true);
        var bg = W.getComputedStyle(vp).backgroundImage, stops = (bg.match(/rgb\(/g) || []).length;
        // swcolors (2026-11-12): the light ground is SolidWorks' own (white #fefefe to the pale blue-grey #d8dce8, two layers,
        // measured on the user's screenshot; rfMC checks its colours)
        assert((th === 'dark' ? /rgb\(60, 60, 60\)/.test(bg) && /rgb\(14, 14, 14\)/.test(bg) : /rgb\(216, 220, 232\)/.test(bg) && /rgb\(254, 254, 254\)/.test(bg)) && stops >= 5, th + ': gradient ' + bg);
        assert(th === 'light' || !/rgb\((\d+), (?!\1)\d+, \d+\)/.test(bg), th + ': grey stops only ' + bg);   // the light ground's stops are a neutral grey within 5 levels (no blue: rfBR)
        var before = W.getComputedStyle(vp, '::before');
        assert(/^url\(/.test(before.backgroundImage) && before.pointerEvents === 'none' && before.position === 'absolute', th + ': grain layer ' + before.backgroundImage.slice(0, 40));
      });
      var canvas = vp.querySelector('canvas.gl'), kids = Array.prototype.slice.call(vp.children);
      assert(kids.indexOf(canvas) === 0, 'the canvas is drawn over the grain (first child, after ::before)');
      return 'ok';
    } finally { UI.setTheme(theme0); UI.setBackground('gradient', true); }
  });

  step('rfHA: Heads-up toolbar — every glyph in one 32 px box (rfIL: pixel-sharp on the 16-grid) on one centre line, buttons one height, flyout arrows are 7 x 4 SVG chevrons beside their icons; the triad canvas matches the screen\'s pixels', async function () {
    await anvil.newPart(); await idle();
    var hud = $('hud'), kids = Array.prototype.slice.call(hud.children), mids = [], heights = [];
    kids.forEach(function (b) {
      var ic = b.querySelector('svg').getBoundingClientRect(), br = b.getBoundingClientRect();
      // lane swribbon (2026-11-12): 32 px glyphs, SolidWorks' size with large buttons (16 under a profile's frame; was 16)
      var hpx = UI.chromeIconSize ? UI.chromeIconSize(16) : 16;
      assert(Math.abs(ic.width - hpx) < 0.01 && Math.abs(ic.height - hpx) < 0.01, b.getAttribute('data-hud') + ': glyph ' + ic.width + ' x ' + ic.height);
      mids.push(ic.top + ic.height / 2); heights.push(br.height);
      var ca = b.querySelector('.caret');
      if (ca) {
        var cs = ca.querySelector('svg');
        assert(cs, b.getAttribute('data-hud') + ': the caret is an SVG chevron');
        var cr = cs.getBoundingClientRect();
        assert(Math.abs(cr.width - 7) < 0.01 && Math.abs(cr.height - 4) < 0.01 && cr.left >= ic.right - 0.5, b.getAttribute('data-hud') + ': chevron ' + [cr.left, cr.width, cr.height] + ' beside ' + ic.right);
        assert(Math.abs((cr.top + cr.height / 2) - (ic.top + ic.height / 2)) <= 1, b.getAttribute('data-hud') + ': chevron centred on the glyph');
      }
    });
    var spread = Math.max.apply(null, mids) - Math.min.apply(null, mids);
    assert(spread < 0.01, 'glyph centres on one line: spread ' + spread);
    assert(Math.max.apply(null, heights) - Math.min.apply(null, heights) < 0.01, 'buttons one height: ' + heights.join(','));
    var tr = $('triad'), want = Math.max(96, Math.round(tr.clientWidth * (W.devicePixelRatio || 1)));
    UI.render();
    assert(tr.width === want && tr.height === want, 'triad bitmap ' + tr.width + ' for ' + tr.clientWidth + ' CSS px at ' + W.devicePixelRatio);
    var gl = UI.renderer.domElement;
    near(parseFloat(gl.style.width) * UI.renderer.getPixelRatio(), gl.width, 1e-6, 'the canvas is laid out exactly as wide as its drawing buffer');
    return 'ok';
  });

  step('rfHA: sketch dimensions — text with a halo of the ground (light on dark in the dark theme, dark on light in the light theme), 1 px lines over a 3 px casing, arrowheads cased; a horizontal dimension line sits on a pixel centre', async function () {
    var theme0 = UI.theme();
    try {
      await anvil.newPart(); await idle();
      await UI.newSketchOnPlane('Front'); await idle();
      var f = UI.activeSketchFeature();
      f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 });
      f.dims = [{ e: 0, k: 'len' }];
      UI.updateSketches(); UI.App.dimsStale = true; if (UI.render) UI.render();
      var t0 = performance.now(), t = null; while (!(t = D.querySelector('#dim-layer .dim text')) && performance.now() - t0 < 5000) await wait(15);
      assert(t, 'a dimension label');
      var out = [];
      ['light', 'dark'].forEach(function (th) {
        UI.setTheme(th);
        var g = t.parentNode, dl = g.querySelector('path.dl'), dlh = D.querySelector('#dim-layer > path.dlh'), da = g.querySelector('path.da');
        assert(dl && dlh && da, th + ': line, casing and arrow paths');
        assert(g.children.length === 3, th + ': still three children per dimension (' + g.children.length + ')');
        assert(dlh.compareDocumentPosition(dl) & 4, th + ': the casing is drawn under the line');
        assert(dlh.getAttribute('d').indexOf(dl.getAttribute('d')) >= 0, th + ': the casing follows the line ' + dl.getAttribute('d'));
        function lum(c) { var m = (c.match(/[\d.]+/g) || [NaN, NaN, NaN]).map(Number); return (m[0] + m[1] + m[2]) / 3; }
        var ts = W.getComputedStyle(t), hs = W.getComputedStyle(dlh), ls = W.getComputedStyle(dl), as = W.getComputedStyle(da);
        var dk = UI.darkViewport();
        function inkOK(c) { return dk ? lum(c) > 150 : lum(c) < 100; }
        function caseOK(c) { return dk ? lum(c) < 60 : lum(c) > 200; }
        assert((dk ? lum(ts.fill) > 200 : lum(ts.fill) < 60) && caseOK(ts.stroke) && parseFloat(ts.strokeWidth) >= 2, th + ': text ' + ts.fill + ' halo ' + ts.stroke);
        assert(inkOK(ls.stroke) && caseOK(hs.stroke) && parseFloat(hs.strokeWidth) >= 2.5 && parseFloat(hs.strokeWidth) > parseFloat(ls.strokeWidth), th + ': line ' + ls.stroke + ' / casing ' + hs.stroke + ' ' + hs.strokeWidth);
        assert(caseOK(as.stroke) && /stroke/.test(as.paintOrder), th + ': arrow casing ' + as.stroke + ' ' + as.paintOrder);
        out.push(th + ' ok');
      });
      var d = t.parentNode.querySelector('path.dl').getAttribute('d'), seg = d.match(/M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/g) || [], flat = 0;
      seg.forEach(function (sg) {
        var n = sg.match(/-?[\d.]+/g).map(Number);
        if (Math.abs(n[1] - n[3]) < 1e-9 && Math.abs(n[0] - n[2]) > 0.5) { flat++; var dpr = W.devicePixelRatio || 1, v = n[1] * dpr - (Math.max(1, Math.round(dpr)) % 2) * 0.5; assert(Math.abs(v - Math.round(v)) < 0.011, 'horizontal dimension line on a pixel centre: y ' + n[1]); }
      });
      assert(flat >= 1, 'a horizontal dimension line: ' + d);
      return out.join(', ');
    } finally { UI.setTheme(theme0); if (UI.exitSketch) UI.exitSketch(true); }
  });

  // ---- rfHA follow-up (user 2026-11-03): "double clicking a solid should select the entire solid, not open extrude or
  // whatever feature was used to create it; single click should only select the face that was clicked"
  function rfHAEv(type, p, target, mods) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mousedown' ? 1 : 0, clientX: r.left + p[0], clientY: r.top + p[1], detail: type === 'dblclick' ? 2 : 1 }, mods || {})));
  }
  function rfHAClick(p, mods) { rfHAEv('mousemove', p, $('viewport'), mods); rfHAEv('mousedown', p, $('viewport'), mods); rfHAEv('mouseup', p, null, mods); }
  function rfHADbl(p, mods) { rfHAClick(p, mods); rfHAClick(p, mods); rfHAEv('dblclick', p, $('viewport'), mods); }
  function rfHASel() { return anvil.selection().map(function (s) { return s.kind + (s.index != null ? ':' + s.index : ''); }).join(','); }
  function rfHAEsc() { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); }

  step('rfHA: a single click on a solid selects only the clicked face; a double-click selects the whole body (no Edit Feature); Esc clears', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(RFHA_BOX); await idle();
    await rfHAView('Isometric');
    var p = UI.worldToScreen([1.5, 1, 1]), hit = UI.pickFace(p[0], p[1]);
    assert(hit, 'the top face is under the point');
    rfHAClick(p); await wait(20);
    assert(rfHASel() === 'face:' + hit.index, 'a single click selects the face only: ' + rfHASel());
    rfHAEsc(); await wait(20);
    rfHADbl(p); await idle();
    assert(!UI.hasPM(), 'no PropertyManager opened by the double-click: ' + (UI.hasPM() && UI.pmTitle()));
    assert(rfHASel() === 'body:0', 'the double-click selects the body, no face beside it: ' + rfHASel());
    rfHAEsc(); await wait(20);
    assert(rfHASel() === '', 'Esc clears: ' + rfHASel());
    return 'ok';
  });

  step('rfHA: two-body part — a double-click selects the body under the cursor, Ctrl+double-click adds the other body', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.box(3, 2, 1);\np.box(3, 2, 0.5, { at: [0, 1.5, 0], merge: false });\n'); await idle();
    assert(UI.bodyCount() === 2, 'two bodies: ' + UI.bodyCount());
    await rfHAView('Isometric');
    var capP = UI.worldToScreen([1.5, 2, 1]), baseP = UI.worldToScreen([1.5, 0.5, 2]);
    var capF = UI.pickFace(capP[0], capP[1]), baseF = UI.pickFace(baseP[0], baseP[1]);
    assert(capF && baseF, 'faces under both points');
    var capB = UI.App.mesh.faces[capF.index].body || 0, baseB = UI.App.mesh.faces[baseF.index].body || 0;
    assert(capB !== baseB, 'the two points are on different bodies: ' + capB + ' / ' + baseB);
    rfHAClick(baseP); await wait(20);
    assert(rfHASel() === 'face:' + baseF.index, 'single click: the face ' + rfHASel());
    rfHAEsc(); await wait(20);
    rfHADbl(capP); await idle();
    assert(!UI.hasPM() && rfHASel() === 'body:' + capB, 'double-click on the cap: its body ' + rfHASel());
    rfHADbl(baseP, { ctrlKey: true }); await idle();
    var s = anvil.selection().map(function (x) { return x.kind + ':' + x.index; }).sort().join(',');
    assert(s === ['body:' + capB, 'body:' + baseB].sort().join(','), 'Ctrl+double-click adds the base body: ' + s);
    rfHAEsc(); await wait(20);
    assert(rfHASel() === '', 'Esc clears: ' + rfHASel());
    return 'ok';
  });

  step('rfHA: with a command open, a double-click on a solid stays in that command (it never opens Edit Feature of the face\'s feature)', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(RFHA_BOX); await idle();
    await rfHAView('Isometric');
    UI.cmdFillet(); await idle();
    var title = UI.pmTitle();
    assert(UI.hasPM() && /fillet/i.test(title), 'Fillet open: ' + title);
    rfHADbl(UI.worldToScreen([1.5, 1, 1])); await idle();
    assert(UI.hasPM() && UI.pmTitle() === title, 'still in ' + title + ': ' + (UI.hasPM() && UI.pmTitle()));
    UI.pmCancel(); await idle();
    return 'ok';
  });

  step('rfHA: a double-click on a FeatureManager feature row still opens Edit Feature', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(RFHA_BOX); await idle();
    var f = UI.App.model.features.filter(function (x) { return x.type !== 'sketch'; })[0];
    var row = D.querySelector('[data-fid="' + f.id + '"]');
    assert(row, 'the tree row of ' + f.name);
    row.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true }));
    await idle();
    assert(UI.hasPM(), 'Edit Feature opened from the tree');
    UI.pmCancel(); await idle();
    return 'ok';
  });
