  // ---- rfHF (2026-11-03, lane rv-polish): RealView polish. Section View's caps take the part's (or each body's)
  // RealView appearance instead of the flat Phong cap; the no-material part has a satin with a faint studio reflection;
  // Section View is per document (a new / opened part is not cut, a rebuild of the same part stays cut); a menu row with
  // both a check and an icon draws them side by side; RealView off is unchanged (Phong cap, rfHA tones).
  async function rfHFView(name) { UI.setView(name); for (var i = 0; i < 50 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(20); if (UI.finishViewAnimation) UI.finishViewAnimation(); UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation(); await wait(30); }
  // the whole scene (caps included) into a target at device size -> { w, h, pr, px }
  function rfHFRender() {
    var T = W.THREE, R = UI.renderer, pr = R.getPixelRatio(), w = Math.round(UI.size.w * pr), h = Math.round(UI.size.h * pr);
    if (UI.render) UI.render();
    var rt = new T.WebGLRenderTarget(w, h, { stencilBuffer: true }), px = new Uint8Array(w * h * 4);
    try { R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(); R.render(UI.scene, UI.camera); R.readRenderTargetPixels(rt, 0, 0, w, h, px); }
    finally { R.setRenderTarget(null); R.setClearColor(0x000000, 0); rt.dispose(); UI.requestRender(); }
    return { w: w, h: h, pr: pr, px: px };
  }
  function rfHFAt(img, p) { var s = UI.worldToScreen(p), x = Math.round(s[0] * img.pr), y = Math.round(s[1] * img.pr), i = ((img.h - 1 - y) * img.w + x) * 4; return [img.px[i], img.px[i + 1], img.px[i + 2], img.px[i + 3]]; }
  function rfHFDiff(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]); }
  function rfHFStored() { try { return W.localStorage.getItem('anvil.realview'); } catch (e) { return null; } }
  function rfHFRestore(v) { try { if (v == null) W.localStorage.removeItem('anvil.realview'); else W.localStorage.setItem('anvil.realview', v); } catch (e) { } UI.setRealView(v === '1' ? true : v === '0' ? false : UI.realViewInfo().byDefault, true); }
  function rfHFCaps() { return UI.sectionCaps().children.filter(function (c) { return c.isMesh && c.userData.capPlane; }); }
  async function rfHFEnd(style) { if (UI.hasPM && UI.hasPM()) UI.pmCancel(); UI.App.view.section = null; UI.applyDisplayStyle(); UI.setStyle(style); await idle(); }

  step('rfHF: with RealView on the section cap is drawn in the part\'s RealView appearance (not the flat Phong cap); RealView off keeps the Phong cap in the flat colour', async function () {
    var keep = rfHFStored(), style = UI.App.view.style;
    try {
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.box(4, 2, 2);\np.material("AISI 304");\n'); await idle();
      UI.setStyle('shadedEdges');
      await rfHFView('Isometric');
      UI.setRealView(true, true);
      UI.cmdSection(); await idle();
      assert(UI.App.view.section, 'Section View on (Right plane through the middle, x = 2)');
      var caps = rfHFCaps(), A = W.Materials.appearanceOf(UI.App.model);
      assert(UI.sectionCaps().children.length === 4 && caps.length === 1, 'stencil back / front, one cap, outline: ' + UI.sectionCaps().children.length);
      var cm = caps[0].material;
      assert(cm.userData.realView && cm !== UI.mats.cap && cm.isMeshStandardMaterial && cm.envMap, 'the cap is on a RealView material with the studio');
      assert('#' + cm.color.getHexString() === A.color.toLowerCase() && Math.abs(cm.metalness - A.metalness) < 1e-6 && Math.abs(cm.roughness - A.roughness) < 1e-6 && cm.userData.rvPattern.value === A.pattern, 'the part\'s appearance: ' + JSON.stringify(A));
      var p = [2, 1, 1], on = rfHFAt(rfHFRender(), p);
      assert(on[3] > 200 && (on[0] + on[1] + on[2]) / 3 > 40, 'a cap pixel, not the background: ' + on.join(','));
      UI.setRealView(false, true); await idle();
      caps = rfHFCaps();
      assert(caps.length === 1 && caps[0].material === UI.mats.cap && UI.getBodyMesh().material === UI.mats.part, 'RealView off: the Phong cap and part');
      var off = rfHFAt(rfHFRender(), p);
      assert(rfHFDiff(on, off) >= 12, 'the RealView cap differs from the flat Phong cap: ' + on.slice(0, 3).join(',') + ' / ' + off.slice(0, 3).join(','));
      return 'RealView cap ' + on.slice(0, 3).join(',') + ', Phong cap ' + off.slice(0, 3).join(',');
    } finally { await rfHFEnd(style); rfHFRestore(keep); }
  });

  step('rfHF: bodies in different materials: each cut is capped in its own body\'s RealView appearance', async function () {
    var keep = rfHFStored(), style = UI.App.view.style;
    try {
      UI.setRealView(true, true);
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.box(4, 2, 2);\np.box(2, 2, 2, { at: [4, 0, 0], merge: false });\np.material("6061");\n'); await idle();
      await UI.setBodyMaterial(1, 'AISI 304'); await idle();
      UI.setStyle('shadedEdges');
      await rfHFView('Isometric');
      UI.cmdSection(); await idle();
      var caps = rfHFCaps(), want = [W.Materials.appearance('6061').color, W.Materials.appearance('AISI 304').color].map(function (c) { return c.toLowerCase(); }).sort();
      var got = caps.map(function (c) { return '#' + c.material.color.getHexString(); }).sort();
      assert(caps.length === 2 && got.join() === want.join(), 'one cap per appearance: ' + got.join(' ') + ' (want ' + want.join(' ') + ')');
      assert(caps.every(function (c) { return c.material.userData.realView; }), 'both on RealView materials');
      var c = rfHFAt(rfHFRender(), [3, 1, 1]);
      assert(c[3] > 200 && (c[0] + c[1] + c[2]) / 3 > 40, 'the cut through the aluminium body is capped: ' + c.join(','));
      return 'caps ' + got.join(' ');
    } finally { await rfHFEnd(style); rfHFRestore(keep); }
  });

  step('rfHF: the no-material part in RealView is a satin grey with a faint studio reflection: still grey, the three faces apart, a sheen across a round', async function () {
    var keep = rfHFStored(), style = UI.App.view.style;
    try {
      UI.setRealView(true, true);
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.sketch("Top").circle(0, 0, 0.5).extrude(2);\n'); await idle();
      UI.setStyle('shaded');
      var m = UI.getBodyMesh().material, A = W.Materials.appearanceOf(UI.App.model);
      assert(m.userData.realView && '#' + m.color.getHexString() === '#8c8c8c' && m.metalness > 0.1 && m.metalness < 0.4, 'satin grey, a little reflective: metalness ' + m.metalness + ', roughness ' + m.roughness);
      assert(A.name.indexOf('no material') >= 0, A.name);
      await rfHFView('Front');
      var img = rfHFRender(), lo = 255, hi = 0, grey = 0;
      for (var k = -0.45; k <= 0.45; k += 0.03) {
        var c = rfHFAt(img, [k, 1, 0]), l = (c[0] + c[1] + c[2]) / 3;
        lo = Math.min(lo, l); hi = Math.max(hi, l); grey = Math.max(grey, Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]));
      }
      assert(hi - lo >= 50, 'a sheen across the round: ' + lo.toFixed(0) + ' .. ' + hi.toFixed(0));
      assert(grey <= 24, 'still a neutral grey (largest channel spread ' + grey + ')');
      return 'round ' + lo.toFixed(0) + '..' + hi.toFixed(0) + ', spread ' + grey;
    } finally { rfHFRestore(keep); UI.setStyle(style); }
  });

  step('rfHF: Section View belongs to the document: a new part (and an opened one) is not cut; a rebuild of the same part keeps the section', async function () {
    var style = UI.App.view.style;
    try {
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.box(4, 2, 2);\n'); await idle();
      UI.setStyle('shadedEdges');
      UI.cmdSection(); await idle();
      await UI.pmOK(); await idle();
      assert(UI.App.view.section && UI.getBodyMesh().material.clippingPlanes.length === 1, 'sectioned, PropertyManager closed');
      await UI.rebuild(); await idle();
      assert(UI.App.view.section && UI.sectionCaps().children.length === 4, 'a rebuild of the same part keeps the section');
      await anvil.newPart(); await idle();
      assert(!UI.App.view.section, 'a new part is not sectioned');
      await anvil.run('p.units("in");\np.box(3, 1, 1);\n'); await idle();
      assert(!UI.App.view.section && UI.sectionCaps().children.length === 0 && !(UI.getBodyMesh().material.clippingPlanes || []).length, 'no caps, the body not clipped');
      UI.cmdSection(); await idle(); await UI.pmOK(); await idle();
      await anvil.load(JSON.stringify(UI.App.model)); await idle();
      assert(!UI.App.view.section, 'an opened document is not sectioned');
      return 'ok';
    } finally { await rfHFEnd(style); }
  });

  step('rfHF: a menu row with both a check and an icon (View ▸ Display ▸ Show Endpoints) draws them in separate boxes side by side; rows without an icon keep the label column', async function () {
    var keepEnd = UI.App.view.showEndpoints;
    try {
      UI.App.view.showEndpoints = true;
      var rows = menuRows('Show Endpoints');
      assert(rows.length && rows[0].chk === '✓', 'Show Endpoints row, checked: ' + JSON.stringify(rows.map(function (r) { return r.text + ' [' + r.chk + ']'; })));
      var row = rows[0].row, chk = row.querySelector('.chk'), ico = row.querySelector('.mi-ico');
      assert(chk && ico && ico.querySelector('svg'), 'a check box and an icon');
      var a = chk.getBoundingClientRect(), b = ico.getBoundingClientRect();
      assert(a.width >= 14 && b.width >= 14 && a.right <= b.left + 0.5, 'check ' + a.left.toFixed(1) + '..' + a.right.toFixed(1) + ' then icon ' + b.left.toFixed(1) + '..' + b.right.toFixed(1));
      assert(Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) <= 1.5, 'on one line');
      var label = [].filter.call(row.children, function (s) { return s !== chk && s !== ico && !s.classList.contains('key'); })[0];
      assert(label && label.getBoundingClientRect().left >= b.right, 'the label after the icon');
      // a checked row without an icon in the same menu: its label lines up with the icon row's
      var other = [].filter.call(row.parentNode.querySelectorAll('.mi'), function (r) { return !r.querySelector('.mi-ico') && r.querySelector('.chk').textContent === '✓'; })[0];
      assert(other, 'a checked row without an icon');
      var ol = [].filter.call(other.children, function (s) { return !s.classList.contains('chk') && !s.classList.contains('key'); })[0];
      assert(Math.abs(ol.getBoundingClientRect().left - label.getBoundingClientRect().left) <= 1, 'labels aligned: ' + ol.getBoundingClientRect().left.toFixed(1) + ' / ' + label.getBoundingClientRect().left.toFixed(1));
      assert(row.parentNode.classList.contains('mi-icons') && row.classList.contains('mi-has-ico'), 'marked by showMenu');
      return 'check ' + a.left.toFixed(1) + '..' + a.right.toFixed(1) + ', icon ' + b.left.toFixed(1) + '..' + b.right.toFixed(1);
    } finally { if (UI.closeMenus) UI.closeMenus(); UI.App.view.showEndpoints = keepEnd; }
  });

  // a row of device pixels across an outline (horizontal through the screen point of p; -1 = background): the darkest
  // level and how many pixels are the line's core (< 30: its width)
  function rfHFAcross(img, p) {
    var s = UI.worldToScreen(p), x0 = Math.round(s[0] * img.pr), y = Math.round(s[1] * img.pr), n = 0, row = [], dark = 255;
    for (var x = x0 - 4; x <= x0 + 4; x++) {
      var i = ((img.h - 1 - y) * img.w + x) * 4, l = img.px[i + 3] < 128 ? -1 : Math.round((img.px[i] + img.px[i + 1] + img.px[i + 2]) / 3);
      row.push(l); if (l >= 0) { dark = Math.min(dark, l); if (l < 30) n++; }
    }
    return { dark: dark, n: n, row: row };
  }
  // the line and its fringe (every pixel of the RealView-off row darker than 100: the line and its partly covered
  // pixels, where the face or the crack filler's fringe shows through) are no lighter with RealView on -> worst excess
  function rfHFFringe(a, b) {
    var worst = -255;
    a.row.forEach(function (v, i) { if (v >= 0 && v < 100) worst = Math.max(worst, b.row[i] < 0 ? 255 : b.row[i] - v); });
    return worst;
  }
  // the frame as drawn on the canvas (antialiased, as the user sees it: a render target has no multisampling, so the
  // partly covered fringe pixels of a line never show there) -> { w, h, pr, px }; read right after UI.render()
  function rfHFCanvas() {
    UI.render();
    var R = UI.renderer, gl = R.getContext(), c = R.domElement, w = c.width, h = c.height, px = new Uint8Array(w * h * 4);
    R.setRenderTarget(null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { w: w, h: h, pr: R.getPixelRatio(), px: px };
  }
  // the screen-leftmost point of the circle of radius r round the Y axis at height y, turned by `turn` degrees
  function rfHFRim(r, y, turn) {
    var best = null;
    for (var a = 0; a < 360; a += 0.5) { var t = a * Math.PI / 180, s = UI.worldToScreen([r * Math.cos(t), y, r * Math.sin(t)]); if (!best || s[0] < best.s) best = { s: s[0], a: a }; }
    var u = (best.a + turn) * Math.PI / 180;
    return [r * Math.cos(u), y, r * Math.sin(u)];
  }
  step('rfHF: with RealView on, the silhouettes and edges of a cone and a cylinder are as dark and as wide as with RealView off (no bright Fresnel fringe beside the #161616 line)', async function () {
    var keep = rfHFStored(), style = UI.App.view.style, out = [];
    try {
      var parts = [['cone', 'p.units("in");\np.sketch("Front").polyline([[0, 0], [1, 0], [0, 2]], true).revolve(360);\np.material("AISI 304");\n', 1, 0],
        ['cylinder', 'p.units("in");\np.sketch("Top").circle(0, 0, 0.5).extrude(2);\np.material("6061");\n', 0.5, 2]];
      for (var k = 0; k < parts.length; k++) {
        await anvil.newPart(); await idle();
        await anvil.run(parts[k][1]); await idle();
        UI.setStyle('shadedEdges');
        var R0 = parts[k][2], views = ['Front', 'Isometric'];
        for (var v = 0; v < views.length; v++) {
          await rfHFView(views[v]);
          // Front: the two side silhouettes; Isometric: the outline along the rim (silhouette into sharp edge), three places
          // (Front: the cone, r 1 at y 0 and apex at y 2, and the cylinder, r 0.5, both have their sides at x = ±0.5 at y = 1)
          var pts = views[v] === 'Front' ? [[0.5, 1, 0], [-0.5, 1, 0]] : [rfHFRim(R0, 0, 0), rfHFRim(R0, 0, -15), rfHFRim(R0, 0, 15), rfHFRim(R0, parts[k][3], 0)];
          var res = {};
          [false, true].forEach(function (on) {
            UI.setRealView(on, true);
            var img = rfHFCanvas();
            res[on] = pts.map(function (p) { return rfHFAcross(img, p); });
          });
          assert(UI.realViewInfo().active, 'RealView drawn');
          pts.forEach(function (p, j) {
            var a = res[false][j], b = res[true][j];
            var ex = rfHFFringe(a, b);
            var msg = parts[k][0] + ' ' + views[v] + ' at ' + p.map(function (c) { return c.toFixed(2); }).join(',') + ': off ' + a.dark + ' (' + a.n + ' px) [' + a.row.join(' ') + '] / on ' + b.dark + ' (' + b.n + ' px) [' + b.row.join(' ') + ']';
            assert(a.dark < 45 && Math.abs(a.dark - b.dark) <= 4, 'line as dark: ' + msg);
            assert(ex <= 8, 'no lighter fringe beside the line (worst +' + ex + '): ' + msg);
            assert(b.n === a.n, 'as wide: ' + msg);
            out.push(parts[k][0][0] + views[v][0] + j + ' ' + a.dark + '/' + b.dark + ' +' + ex);
          });
        }
      }
      return out.join('; ');
    } finally { rfHFRestore(keep); UI.setStyle(style); }
  });
