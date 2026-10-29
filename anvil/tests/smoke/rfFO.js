  // ---- rfFO (2026-10-29, lane FO: the part never looks broken): whatever mesh the kernel hands over, the graphics area
  // shows a whole part. Pinholes at T-junctions are filled (crack filler), a smoothed normal never shades black, a mesh
  // the mesher or the edge finder cannot read keeps the last good part on screen, Section View shows solid cut faces
  // with their outline (stencil caps), and a failed feature looks as in SolidWorks (part shown without it, red row with
  // its badge, the part badged, the status chip, What's Wrong lists it).
  function rfFONeed(obj, name) { assert(obj && typeof obj[name] === 'function', name + ' is missing (rfFO)'); }
  async function rfFOView(name) { UI.setView(name); for (var i = 0; i < 50 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(20); if (UI.finishViewAnimation) UI.finishViewAnimation(); await wait(30); }
  // draws the scene into a target the size of the graphics area -> { w, h, px (RGBA, bottom row first) }. flat: only
  // the body group, its faces in pure green on magenta (the crack filler keeps its own lit material, as on screen)
  function rfFORender(flat) {
    var T = W.THREE, R = UI.renderer, S = UI.scene, cam = UI.camera, w = Math.max(64, Math.round(UI.size.w)), h = Math.max(64, Math.round(UI.size.h));
    if (UI.render) UI.render();   // the thick lines take their materials' clipping in the app's own render pass
    var rt = new T.WebGLRenderTarget(w, h, { stencilBuffer: true }), restore = [], body = UI.getBodyMesh(), oldMat = body && body.material, green = null;
    if (flat) {
      S.children.forEach(function (c) { if (c !== UI.groups.body && c.visible && c !== cam) { restore.push(c); c.visible = false; } });
      green = new T.MeshBasicMaterial({ color: 0x00ff00, side: T.DoubleSide });
      if (body) body.material = green;
    }
    try {
      R.setRenderTarget(rt); R.setClearColor(0xff00ff, flat ? 1 : 0); R.clear(); R.render(S, cam);
      var px = new Uint8Array(w * h * 4); R.readRenderTargetPixels(rt, 0, 0, w, h, px);
      return { w: w, h: h, px: px };
    } finally {
      R.setRenderTarget(null); R.setClearColor(0x000000, 0);
      if (body) body.material = oldMat;
      restore.forEach(function (c) { c.visible = true; });
      rt.dispose(); if (green) green.dispose();
      UI.requestRender();
    }
  }
  function rfFOPx(img, x, y) { var i = ((img.h - 1 - Math.round(y)) * img.w + Math.round(x)) * 4; return [img.px[i], img.px[i + 1], img.px[i + 2], img.px[i + 3]]; }
  // isolated background pixels inside the part (6 or more of the 8 neighbours are part): a crack seen through
  function rfFOPinholes(img) {
    var w = img.w, h = img.h, px = img.px, n = 0, at = [];
    function bg(x, y) { var i = (y * w + x) * 4; return px[i] > 200 && px[i + 1] < 60 && px[i + 2] > 200; }
    for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
      if (!bg(x, y)) continue;
      var nb = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if ((dx || dy) && !bg(x + dx, y + dy)) nb++;
      if (nb >= 6) { n++; if (at.length < 4) at.push(x + ',' + (h - 1 - y)); }
    }
    return { n: n, at: at };
  }
  var RFFO_PLATE = 'p.units("in");\np.box(6, 4, 0.25);\nvar s = p.sketch("Top", 0.25);\nfor (var i = 0; i < 9; i++) for (var j = 0; j < 6; j++) s.circle(0.45 + i * 0.64, -(0.4 + j * 0.64), 0.17);\ns.cut("through", { reverse: true });\n';

  step('rfFO: no background through the part: a perforated plate seen from the top and bottom, fitted and zoomed in, shows no pinholes; the crack filler is drawn in Shaded / Shaded With Edges only', async function () {
    rfFONeed(UI, 'getCrackFill'); rfFONeed(UI, 'sectionCaps');
    var style = UI.App.view.style;
    try {
      await anvil.newPart(); await idle();
      await anvil.run(RFFO_PLATE); await idle();
      if (UI.App.view.style !== 'shadedEdges') UI.setStyle('shadedEdges');
      var cf = UI.getCrackFill();
      assert(cf && cf.visible && cf.material.wireframe && cf.material.depthWrite === false, 'crack filler drawn in Shaded With Edges (wireframe, no depth write)');
      assert(cf.geometry === UI.getBodyMesh().geometry, 'the filler shares the body geometry');
      var views = ['Top', 'Bottom'], bad = [];
      for (var v = 0; v < views.length; v++) {
        await rfFOView(views[v]); UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation();
        for (var z = 0; z < 2; z++) {
          if (z) { UI.cam.scale /= 3; UI.applyCamera(); }
          var r = rfFOPinholes(rfFORender(true));
          if (r.n) bad.push(views[v] + (z ? ' close' : '') + ': ' + r.n + ' at ' + r.at.join(' '));
        }
      }
      assert(!bad.length, 'background shows through the plate: ' + bad.join('; '));
      UI.setStyle('hlr');
      assert(!UI.getCrackFill().visible, 'no filler in Hidden Lines Removed');
      UI.setStyle('shaded');
      assert(UI.getCrackFill().visible, 'filler in Shaded');
    } finally { UI.setStyle(style); }
  });

  step('rfFO: normals never shade black: smoothed normals that are NaN, zero or turned away from their facet fall back to the facet normal; a shaded part has no black pixels', async function () {
    var m0 = { normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0]) };
    var bad = new Float32Array([NaN, 0, 1, 0, 0, 0, 0, 0, -1, 0.99, 0.14, 0, -1, 0, 0, 0, 1, 0]);
    var out = UI.safeNormals(m0, bad);
    var want = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0.99, 0.14, 0, 1, 0, 0, 1, 0, 0];
    for (var i = 0; i < want.length; i++) near(out[i], want[i], 1e-6, 'corner normal ' + i);
    assert(m0.normalsFixed === 5, 'five corners fixed: ' + m0.normalsFixed);
    // a kernel that hands over flipped normals for one rebuild still gives a part with every corner facing its facet
    var K = W.Kernel, orig = K.analyticNormals, style = UI.App.view.style;
    try {
      await anvil.newPart(); await idle();
      K.analyticNormals = function (m) { var a = orig.call(K, m); for (var j = 0; j < a.length; j++) a[j] = -a[j]; return a; };
      await anvil.run('p.units("in");\np.box(3, 2, 1);\np.fillet(0.25, [[0, 0.5, 0], [3, 0.5, 2]]);\n'); await idle();
      await UI.rebuild({ sync: true }); await idle();
      var m = UI.App.mesh, n = UI.analyticNormals(m), f = m.normals, away = 0;
      for (var t = 0; t < n.length; t += 3) if (n[t] * f[t] + n[t + 1] * f[t + 1] + n[t + 2] * f[t + 2] < 0.2) away++;
      assert(away === 0, away + ' corner normals point away from their facet');
      K.analyticNormals = orig;
      UI.setStyle('shaded');
      await rfFOView('Isometric'); UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation();
      var img = rfFORender(false), dark = 0, part = 0;
      for (var p = 0; p < img.px.length; p += 4) {
        if (img.px[p + 3] < 250) continue;   // background (the renderer clears to transparent)
        part++;
        if (img.px[p] + img.px[p + 1] + img.px[p + 2] < 45) dark++;
      }
      assert(part > 1000, 'the part is drawn: ' + part + ' px');
      assert(dark === 0, dark + ' black pixels on the shaded part');
    } finally { K.analyticNormals = orig; UI.setStyle(style); }
  });

  step('rfFO: the last good part stays on screen: a body the mesher cannot read keeps the previous part and says so; edges that cannot be found leave the shaded part without edges', async function () {
    var K = W.Kernel, mfb = K.meshFromBody, be = K.bodyEdges;
    try {
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.box(3, 2, 1);\n'); await idle();
      var mesh0 = UI.App.mesh, tris0 = mesh0.triCount;
      var fail = true;
      K.meshFromBody = function (b) { if (fail) { fail = false; throw new Error('test: unreadable body'); } return mfb.call(K, b); };
      UI.App.model.features.filter(function (f) { return f.type === 'extrude'; })[0].depth = 1.5;
      await UI.rebuild({ sync: true }); await idle();
      assert(UI.App.mesh === mesh0 && UI.getBodyMesh() && UI.getBodyMesh().visible, 'the last good part stays');
      assert(/last good part/.test($('status-msg').textContent), 'status says why: ' + $('status-msg').textContent);
      K.meshFromBody = mfb;
      K.bodyEdges = function () { throw new Error('test: no edges'); };
      UI.App.model.features.filter(function (f) { return f.type === 'extrude'; })[0].depth = 2;
      await UI.rebuild({ sync: true }); await idle();
      assert(UI.App.mesh !== mesh0 && UI.App.mesh.triCount === tris0, 'the new part is shown');
      assert(UI.getBodyMesh() && UI.getBodyMesh().visible && UI.groups.body.children.length >= 1, 'shaded part on screen');
      assert(UI.App.edges.length === 0, 'no edges');
      assert(/edges could not be drawn/.test($('status-msg').textContent), 'status: ' + $('status-msg').textContent);
    } finally { K.meshFromBody = mfb; K.bodyEdges = be; }
    await UI.rebuild({ sync: true }); await idle();
    assert(UI.App.edges.length > 0, 'edges back once they can be found');
  });

  step('rfFO: Section View shows the cut faces solid (stencil caps) with their outline, in the part colour; none in Hidden Lines Removed; gone when the section is closed', async function () {
    var style = UI.App.view.style;
    try {
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.box(4, 2, 2);\np.box(2, 2, 2, { at: [4, 0, 0], merge: false });\n'); await idle();
      if (UI.App.view.style !== 'shadedEdges') UI.setStyle('shadedEdges');
      await rfFOView('Isometric'); UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation();
      UI.cmdSection(); await idle();
      assert(UI.App.view.section, 'Section View on (Right plane through the middle, x = 3)');
      var caps = UI.sectionCaps().children;
      assert(caps.length === 4, 'stencil back / front, the cap and its outline: ' + caps.length);
      assert(!UI.getCrackFill().visible, 'no crack filler inside a section');
      var outline = caps.filter(function (c) { return c.isLineSegments; })[0];
      assert(outline && outline.geometry.attributes.position.count >= 8, 'outline round the cut');
      // the cut face at x = 3 (inside the 4 x 2 x 2 box): the cap is drawn there, not the inside of the box
      var mc = UI.mats.cap, keep = mc.color.getHex();
      mc.color.setHex(0xff0000); mc.emissive && mc.emissive.setHex(0xff0000);
      var img = rfFORender(false), s = UI.worldToScreen([3, 1, 1]), c = rfFOPx(img, s[0], s[1]), off = UI.worldToScreen([3, 2.6, 1]), c2 = rfFOPx(img, off[0], off[1]);
      mc.color.setHex(keep); mc.emissive && mc.emissive.setHex(0x000000);
      assert(c[0] > 150 && c[1] < 90 && c[2] < 90, 'cap drawn at the cut centre: rgba ' + c.join(','));
      assert(!(c2[0] > 150 && c2[1] < 90 && c2[2] < 90), 'no cap outside the part: rgba ' + c2.join(','));
      UI.setStyle('hlr');
      assert(UI.sectionCaps().children.length === 0, 'no caps in Hidden Lines Removed');
      UI.setStyle('shadedEdges');
      assert(UI.sectionCaps().children.length === 4, 'caps back in Shaded With Edges');
      UI.pmCancel(); await idle();
      assert(!UI.App.view.section && UI.sectionCaps().children.length === 0, 'caps gone with the section');
    } finally { if (UI.hasPM && UI.hasPM()) UI.pmCancel(); UI.App.view.section = null; UI.setStyle(style); }
  });

  step('rfFO: a failed feature looks as in SolidWorks: the part is shown without it, its row red with the error badge, the part badged, the status chip red; the chip opens What\'s Wrong naming it', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.box(4, 3, 1);\np.shell(0.1, [[2, 1, 1.5]]);\np.hole("Top", 2, -1.5, 0.5, { offset: 1 });\n'); await idle();
    var shell = UI.App.model.features.filter(function (f) { return f.type === 'shell'; })[0];
    UI.pushUndo(); shell.thickness = 2;
    await UI.rebuild(); await idle();
    assert(UI.App.build.errors[shell.id], 'Shell1 fails');
    var bb = UI.modelBounds();
    near(bb.max[1] - bb.min[1], 1, 1e-6, 'the part without the shell: the 1 in block (height)');
    assert(UI.getBodyMesh() && UI.getBodyMesh().visible, 'part on screen');
    var row = $('tree').querySelector('.ti[data-fid="' + shell.id + '"]');
    assert(row && row.classList.contains('err') && row.querySelector('.rb-badge.err'), 'Shell1 row red with the error badge');
    var root = $('tree').querySelector('.ti');
    assert(root.querySelector('.rb-badge.err'), 'the part row badged');
    var chip = D.querySelector('#status-right .rb-chip.err');
    assert(chip && /1 rebuild error/.test(chip.textContent), 'status chip: ' + (chip && chip.textContent));
    chip.click(); await wait(30);
    var ww = $('whats-wrong');
    assert(ww && /Shell1/.test(ww.textContent) && /too large/.test(ww.textContent), 'What\'s Wrong lists Shell1 and why');
    UI.closeModal();
    await UI.undoCommand(); await idle();
    assert(!Object.keys(UI.App.build.errors).length, 'undo: fully rebuilt');
  });
