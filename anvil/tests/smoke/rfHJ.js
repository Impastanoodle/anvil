  // ---- rfHJ (2026-11-03, lane fx-flicker) — user: "when you select a face of a part it seems that the glow effect
  // kinda toggles on and off". Measured first (headless Chrome, GPU and software GL, real mouse events, every frame
  // recorded): the frame right after a click or a hover is already a still frame with the cached ambient occlusion and
  // floor; what changed with each selection was the face tint, drawn OVER the occlusion, so a selected (or
  // pre-highlighted) face lost about half its shading round a boss and got it back on the next click. The tints are now
  // drawn with the solid before the AO multiply (ui-render-fx.js faceTints), as SolidWorks shades a selected face.
  // Each step: plate with a boss, AO + shadows + smoothing on, planes and origin hidden, the part zoomed out so the
  // floor shows round it; frames are read synchronously (UI.tick right after the mouse event, no await in between).
  var RFHJ_PART = 'p.units("in");\np.box(4, 4, 0.5);\np.box(1, 1, 1.5, { at: [1.5, 0.5, 1.5] });\n';
  var RFHJ_CORNER = [2, 0.5, 2.7], RFHJ_OPEN = [3.4, 0.5, 3.4], RFHJ_FLOOR = [2, 0, 4.9];
  function rfHJCanvas() {
    var R = UI.renderer, gl = R.getContext(), c = R.domElement, w = c.width, h = c.height, px = new Uint8Array(w * h * 4);
    R.setRenderTarget(null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { w: w, h: h, pr: R.getPixelRatio(), px: px };
  }
  function rfHJPx(img, p) { var s = UI.worldToScreen(p), x = Math.round(s[0] * img.pr), y = Math.round(s[1] * img.pr), i = ((img.h - 1 - y) * img.w + x) * 4; return [img.px[i], img.px[i + 1], img.px[i + 2], img.px[i + 3]]; }
  // mean luminance of a (2r+1)² device-pixel window round a model point
  function rfHJLum(img, p, r) {
    var s = UI.worldToScreen(p), cx = Math.round(s[0] * img.pr), cy = Math.round(s[1] * img.pr), sum = 0, n = 0;
    r = r || 2;
    for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) { var i = ((img.h - 1 - (cy + dy)) * img.w + cx + dx) * 4; sum += (img.px[i] + img.px[i + 1] + img.px[i + 2]) / 3; n++; }
    return sum / n;
  }
  // what the shading shows at a frame: the crease (open spot minus the boss's foot on the same face), the floor round
  // the part (alpha of the premultiplied floor glow) and the open spot's colour
  function rfHJRead(img) { return { crease: rfHJLum(img, RFHJ_OPEN) - rfHJLum(img, RFHJ_CORNER), floor: rfHJPx(img, RFHJ_FLOOR)[3], open: rfHJPx(img, RFHJ_OPEN) }; }
  function rfHJFmt(r) { return 'crease ' + r.crease.toFixed(1) + ' floor ' + r.floor + ' open ' + r.open.slice(0, 3).join('/'); }
  function rfHJEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mousedown' ? 1 : 0, clientX: r.left + p[0], clientY: r.top + p[1], detail: 1 }));
  }
  async function rfHJSetup() {
    await anvil.newPart(); await idle();
    await anvil.run(RFHJ_PART); await idle();
    var V = UI.App.view, keep = { showPlanes: V.showPlanes, showOrigin: V.showOrigin, style: V.style };
    V.showPlanes = false; V.showOrigin = false; UI.updatePlanes(); UI.updateOrigin();
    UI.setStyle('shadedEdges');
    UI.setView('Isometric'); for (var i = 0; i < 50 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(20);
    if (UI.finishViewAnimation) UI.finishViewAnimation();
    UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation();
    UI.zoomView(1.6); if (UI.finishViewAnimation) UI.finishViewAnimation();
    UI.App.sel = null; UI.App.sel2 = null; UI.App.hover = null; UI.updateHighlights();
    UI.setAmbientOcclusion(true); UI.setShadows(true); UI.setStillSmoothing(true);
    await wait(30);
    return keep;
  }
  function rfHJReset(keep) {
    UI.App.sel = null; UI.App.sel2 = null; UI.App.hover = null; if (UI.setSelection) UI.setSelection([], { quiet: true }); UI.updateHighlights();
    UI.setAmbientOcclusion(false); UI.setShadows(false); UI.setStillSmoothing(false);
    if (keep) { var V = UI.App.view; V.showPlanes = keep.showPlanes; V.showOrigin = keep.showOrigin; UI.updatePlanes(); UI.updateOrigin(); UI.setStyle(keep.style); }
    UI.render();
  }
  // the frame the loop draws next (what the screen shows right after the event), read at once, then the settled still pass
  function rfHJNextFrame() { UI.tick(performance.now()); return { img: rfHJCanvas(), st: UI.renderFx.state() }; }

  step('rfHJ: clicking a face keeps the ambient occlusion and the floor glow in the very next frame (no plain frame in between), the selected face keeps its shading round the boss, and the light-blue tint shows at once', async function () {
    var keep, rv0 = typeof UI.setRealView === 'function' && UI.realView ? !!UI.realView() : null, out = [];
    try {
      keep = await rfHJSetup();
      var modes = rv0 != null ? [false, true] : [false];
      for (var mi = 0; mi < modes.length; mi++) {
        if (rv0 != null) { UI.setRealView(modes[mi], true); await idle(); await wait(30); }
        var tag = modes[mi] ? 'RealView on: ' : 'RealView off: ';
        rfHJEv('mousemove', [5, 5], $('viewport')); UI.App.sel = null; UI.App.sel2 = null; UI.updateHighlights();
        UI.renderStill();
        var s0 = rfHJRead(rfHJCanvas());
        assert(s0.crease >= 12 && s0.floor >= 20, tag + 'the still view has a crease and a floor round the part: ' + rfHJFmt(s0));
        var p = UI.worldToScreen(RFHJ_OPEN), hit = UI.pickFace(p[0], p[1]);
        assert(hit && hit.kind === 'face', tag + 'the plate\'s top face is under the point');
        // the click, then the next frame of the loop, synchronously (no animation frame can run in between)
        rfHJEv('mousemove', p, $('viewport')); rfHJEv('mousedown', p, $('viewport')); rfHJEv('mouseup', p);
        var sel = anvil.selection().map(function (s) { return s.kind + ':' + s.index; }).join(',');
        assert(sel === 'face:' + hit.index, tag + 'the click selected the face: ' + sel);
        var f = rfHJNextFrame(), a = rfHJRead(f.img);
        assert(f.st.shown === 'still' && f.st.aoOK, tag + 'the frame after the click is a still frame with AO (not a plain or moving one): ' + JSON.stringify(f.st));
        assert(a.open[2] > a.open[0] + 15, tag + 'the light-blue selection tint is on in that frame: ' + rfHJFmt(a));
        UI.renderStill();
        var b = rfHJRead(rfHJCanvas());
        var msg = tag + 'unselected still: ' + rfHJFmt(s0) + '; next frame: ' + rfHJFmt(a) + '; settled: ' + rfHJFmt(b);
        assert(Math.abs(a.crease - b.crease) <= 3, 'the crease in the next frame matches the settled still frame: ' + msg);
        assert(Math.abs(a.floor - s0.floor) <= 2 && Math.abs(b.floor - s0.floor) <= 2, 'the floor glow does not change with the selection: ' + msg);
        assert(b.crease >= 0.8 * s0.crease, 'the selected face keeps its shading round the boss (was about half under the tint): ' + msg);
        if (UI.setSelection) UI.setSelection([], { quiet: true });
        out.push(msg);
      }
      return out.join(' | ');
    } finally { if (rv0 != null) UI.setRealView(rv0, true); rfHJReset(keep); }
  });

  step('rfHJ: a hover pre-highlight keeps the ambient occlusion and floor glow in the next frame, and the orange face keeps its shading round the boss', async function () {
    var keep;
    try {
      keep = await rfHJSetup();
      rfHJEv('mousemove', [5, 5], $('viewport'));   // off the part: no pre-highlight
      UI.renderStill();
      var s0 = rfHJRead(rfHJCanvas());
      var p = UI.worldToScreen(RFHJ_OPEN);
      rfHJEv('mousemove', p, $('viewport'));
      assert(UI.App.hover && UI.App.hover.kind === 'face', 'the plate\'s face is pre-highlighted: ' + JSON.stringify(UI.App.hover && UI.App.hover.kind));
      var f = rfHJNextFrame(), a = rfHJRead(f.img);
      assert(f.st.shown === 'still' && f.st.aoOK, 'the frame after the hover is a still frame with AO: ' + JSON.stringify(f.st));
      assert(a.open[0] > a.open[2] + 15, 'the orange pre-highlight is on in that frame: ' + rfHJFmt(a));
      UI.renderStill();
      var b = rfHJRead(rfHJCanvas());
      var msg = 'no hover: ' + rfHJFmt(s0) + '; next frame: ' + rfHJFmt(a) + '; settled: ' + rfHJFmt(b);
      assert(Math.abs(a.crease - b.crease) <= 3 && Math.abs(a.floor - s0.floor) <= 2, 'crease and floor in the next frame as in the still frame: ' + msg);
      assert(b.crease >= 0.8 * s0.crease, 'the pre-highlighted face keeps its shading round the boss: ' + msg);
      // the mouse moves on across the same face: nothing changes, no frame needed beyond the still pass
      rfHJEv('mousemove', [p[0] + 3, p[1]], $('viewport'));
      f = rfHJNextFrame();
      assert(f.st.shown === 'still', 'still after moving across the same face: ' + JSON.stringify(f.st));
      return msg;
    } finally { rfHJEv('mousemove', [5, 5], $('viewport')); rfHJReset(keep); }
  });

  step('rfHJ: selecting an edge (yellow) and clearing the selection keep the still pass; a camera rotate still drops it and it comes back once the view rests', async function () {
    var keep;
    try {
      keep = await rfHJSetup();
      UI.renderStill();
      var s0 = rfHJRead(rfHJCanvas());
      // the plate's front-right top edge, halfway along
      var ep = UI.worldToScreen([4, 0.5, 2]), e = UI.pickEdge(ep[0], ep[1]);
      assert(e && e.kind === 'edge', 'an edge under the point');
      UI.App.sel = e; UI.updateHighlights();
      var f = rfHJNextFrame(), a = rfHJRead(f.img);
      assert(f.st.shown === 'still' && f.st.aoOK && Math.abs(a.crease - s0.crease) <= 3 && Math.abs(a.floor - s0.floor) <= 2, 'edge selected: still frame, same crease and floor: ' + rfHJFmt(s0) + ' / ' + rfHJFmt(a) + ' ' + JSON.stringify(f.st));
      UI.App.sel = null; UI.updateHighlights();
      f = rfHJNextFrame(); a = rfHJRead(f.img);
      assert(f.st.shown === 'still' && Math.abs(a.crease - s0.crease) <= 3, 'selection cleared: still frame, same crease: ' + rfHJFmt(a));
      // a camera move: the moving frame (plain + floor), then the still pass after STILL_MS
      UI.renderStill();
      UI.rotateView(20, 8);
      f = rfHJNextFrame();
      assert(f.st.shown === 'moving' && !f.st.aoOK, 'a rotate draws the moving frame: ' + JSON.stringify(f.st));
      var t0 = performance.now(), s = null;
      while (performance.now() - t0 < 4000) { await wait(40); s = UI.renderFx.state(); if (s.shown === 'still' && s.aoOK) break; }
      assert(s && s.shown === 'still' && s.aoOK, 'still pass back after the rotate: ' + JSON.stringify(s));
      return 'still pass back ' + (performance.now() - t0).toFixed(0) + ' ms after the rotate';
    } finally { rfHJReset(keep); }
  });

  // ---- rfHJ hole lines (user 2026-11-03: "fix these lines in the interior of colliding holes"). Short dark lines inside
  // crossing bores were silhouette segments of the bores themselves: a concave fold (the side of a hole, where its wall
  // turns away from the viewer) is always covered by the solid in front of it, so its outline only leaked through the
  // depth test in places (base mesh and zoom display mesh alike). Only convex folds are outlines now (ui-core.js
  // buildSilhouettes, the zoom mesh's silPair). Checked on the edge and silhouette lists: nothing drawn lies on a bore
  // except the rims and the intersections with the other holes.
  // a 3 × 3 × 1 block: a Ø.75 vertical hole, a Ø.4 one overlapping it, a Ø.6 hole along z and a Ø.4 along x crossing it
  var RFHJ_HOLES = 'p.units("in");\np.box(3, 3, 1);\np.hole("Top", 1.5, -1.5, 0.75, { offset: 1 });\np.hole("Top", 1.95, -1.5, 0.4, { offset: 1 });\n' +
    'p.hole("Front", 1.7, 0.5, 0.6, { offset: 3 });\np.hole("Right", -1.2, 0.6, 0.4, { offset: 3 });\n';
  var RFHJ_BORES = [{ o: [1.5, 0, 1.5], d: [0, 1, 0], r: 0.375 }, { o: [1.95, 0, 1.5], d: [0, 1, 0], r: 0.2 }, { o: [1.7, 0.5, 0], d: [0, 0, 1], r: 0.3 }, { o: [0, 0.6, 1.2], d: [1, 0, 0], r: 0.2 }];
  // the bores a point lies on (within tol of the cylinder, inside the block)
  function rfHJOnBores(p, tol) {
    var out = [];
    if (p[0] < -tol || p[0] > 3 + tol || p[1] < -tol || p[1] > 1 + tol || p[2] < -tol || p[2] > 3 + tol) return out;
    RFHJ_BORES.forEach(function (B, i) {
      var v = [p[0] - B.o[0], p[1] - B.o[1], p[2] - B.o[2]], h = v[0] * B.d[0] + v[1] * B.d[1] + v[2] * B.d[2];
      var r = Math.hypot(v[0] - B.d[0] * h, v[1] - B.d[1] * h, v[2] - B.d[2] * h);
      if (Math.abs(r - B.r) <= tol) out.push(i);
    });
    return out;
  }
  // a point on a bore's rim: on a face of the block (its ends)
  function rfHJOnBlockFace(p, tol) { return [0, 1, 2].some(function (k) { var hi = k === 1 ? 1 : 3; return Math.abs(p[k]) <= tol || Math.abs(p[k] - hi) <= tol; }); }
  // drawn lines -> [{ a, b }] (edge lines: what buildEdgeGeometry put on screen; silhouettes: every n1/n2 segment that can show)
  function rfHJSegs(obj) {
    var pa = obj.geometry && obj.geometry.attributes.position, out = [];
    if (!pa) return out;
    for (var i = 0; i + 1 < pa.count; i += 2) out.push({ a: [pa.getX(i), pa.getY(i), pa.getZ(i)], b: [pa.getX(i + 1), pa.getY(i + 1), pa.getZ(i + 1)] });
    return out;
  }
  function rfHJStray(segs, tol) {
    return segs.filter(function (s) {
      var m = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, (s.a[2] + s.b[2]) / 2], on = rfHJOnBores(m, tol);
      if (!on.length) return false;                     // not on a bore at all
      if (on.length > 1 || rfHJOnBlockFace(m, tol)) return false;   // an intersection of two bores, or a rim
      return true;
    });
  }

  step('rfHJ: crossing and overlapping holes draw no lines inside their bores, only the rims and the intersections, on the base mesh and zoomed in on the zoom display mesh (RealView off and on); the volume is unchanged', async function () {
    var rv0 = typeof UI.setRealView === 'function' && UI.realView ? !!UI.realView() : null, style = UI.App.view.style, lvl = UI.zoomTess.level(), out = [];
    try {
      await anvil.newPart(); await idle();
      await anvil.run(RFHJ_HOLES); await idle();
      UI.setStyle('shadedEdges');
      var vol = anvil.mass().volume;
      // block minus the four holes (each hole's own volume less its overlaps): the kernel's exact volume, checked loosely
      // against the bounds: less than the block, more than the block minus every hole as if apart
      var apart = 9 - Math.PI * (0.375 * 0.375 + 0.2 * 0.2) * 1 - Math.PI * 0.09 * 3 - Math.PI * 0.04 * 3;
      assert(vol < 9 && vol > apart, 'volume ' + vol.toFixed(5) + ' between ' + apart.toFixed(5) + ' and 9');
      var modes = rv0 != null ? [false, true] : [false];
      for (var mi = 0; mi < modes.length; mi++) {
        if (rv0 != null) { UI.setRealView(modes[mi], true); await idle(); }
        var tag = modes[mi] ? 'RealView on' : 'RealView off';
        // looking down into the bores at an angle, zoomed in so the zoom display mesh refines them
        UI.setView('Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation();
        UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation();
        UI.zoomTess.setLevel(0); UI.zoomTess.now(); UI.render();
        var edgeObjs = [], silObjs = [];
        UI.groups.edges.traverse(function (o) { if ((o.isLineSegments || o.isLine) && !o.userData.fatLine) (o.userData.silhouette ? silObjs : edgeObjs).push(o); });
        var segE = [].concat.apply([], edgeObjs.map(rfHJSegs)), segS = [].concat.apply([], silObjs.map(rfHJSegs));
        var strayE = rfHJStray(segE, 2e-3), strayS = rfHJStray(segS, 2e-3);
        assert(segE.length > 50, tag + ': edges drawn: ' + segE.length);
        assert(!strayE.length, tag + ', base mesh: ' + strayE.length + ' edge segments lie inside a bore (not a rim, not an intersection), e.g. ' + JSON.stringify(strayE[0]));
        assert(!strayS.length, tag + ', base mesh: ' + strayS.length + ' outline segments lie inside a bore, e.g. ' + JSON.stringify(strayS[0]));
        // zoomed in on the big bore: the zoom display mesh's outlines
        var c = UI.worldToScreen([1.5, 1, 1.5]);
        UI.zoomView(0.15, c[0], c[1]); if (UI.finishViewAnimation) UI.finishViewAnimation();
        UI.zoomTess.setLevel(1); var inf = UI.zoomTess.now(); UI.render();
        assert(inf && inf.faces > 0, tag + ': the zoom display mesh refined the bores: ' + JSON.stringify(inf));
        silObjs = [];
        UI.scene.traverse(function (o) { if (o.isLineSegments && o.userData.silhouette && o.visible) silObjs.push(o); });
        var segZ = [].concat.apply([], silObjs.map(rfHJSegs)), strayZ = rfHJStray(segZ, 2e-3);
        assert(!strayZ.length, tag + ', zoomed in: ' + strayZ.length + ' outline segments of the zoom mesh lie inside a bore, e.g. ' + JSON.stringify(strayZ[0]));
        out.push(tag + ': ' + segE.length + ' edge / ' + segS.length + ' outline segments, zoom mesh ' + segZ.length + ' outline segments (k ' + inf.k + '), none inside a bore');
      }
      return out.join('; ') + '; volume ' + vol.toFixed(5);
    } finally { if (rv0 != null) UI.setRealView(rv0, true); UI.zoomTess.setLevel(lvl); UI.setStyle(style); }
  });

  // the same lists keep the outline of a convex cylinder (a boss): only the concave side of a fold was dropped
  step('rfHJ: a Ø1 cylinder boss still draws its outline (convex silhouettes kept) while its plate\'s hole does not', async function () {
    var style = UI.App.view.style;
    try {
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.box(3, 3, 0.5);\np.sketch("Top", 0.5).circle(1, -1, 0.5).end().extrude(1);\np.hole("Top", 2.2, -2.2, 0.6, { offset: 0.5 });\n'); await idle();
      UI.setStyle('shadedEdges');
      UI.setView('Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation();
      UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation();
      UI.zoomTess.now(); UI.render();
      var sil = [];
      UI.scene.traverse(function (o) { if (o.isLineSegments && o.userData.silhouette && o.visible) sil = sil.concat(rfHJSegs(o)); });
      function onCyl(s, o, r) { var m = [(s.a[0] + s.b[0]) / 2, (s.a[2] + s.b[2]) / 2]; return Math.abs(Math.hypot(m[0] - o[0], m[1] - o[1]) - r) < 2e-3; }
      var boss = sil.filter(function (s) { return onCyl(s, [1, 1], 0.5); }).length, hole = sil.filter(function (s) { return onCyl(s, [2.2, 2.2], 0.3); }).length;
      assert(boss > 0, 'the boss keeps its outline segments: ' + boss);
      assert(hole === 0, 'the hole has no outline segments: ' + hole);
      return 'boss ' + boss + ' outline segments, hole ' + hole;
    } finally { UI.setStyle(style); }
  });
