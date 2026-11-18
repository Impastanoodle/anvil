  // ---- rfPA (2026-11-17, lane dragfeel): the graphics area feels instant while dragging.
  // A sketch drag frame redrew the whole sketch (every entity's buffers, its dots) and the dimension layer worked out
  // the whole sketch on screen twice (its label grid and its line-clipping grid) on every frame, and the solver built
  // the whole sketch's system twice per frame to find the part that moves: 7 ms a frame at 200 entities and 17 ms at
  // 1,600 on this PC's graphics card (10 and 33 ms on the shop PC's). Now a drag frame works out only what the solve
  // moved. Rows: the sketch drawn mid-drag and after the release is exactly what a full redraw draws (every object's
  // buffers, the dots, the dimension layer), for a hole dragged by its centre and by its edge (its tessellation
  // changes) and a free line end, at 200 entities (an object per entity) and 1,000 (one buffer per material); the
  // partial redraw was the one used; generous time bounds.
  function rfPAframe() { return new Promise(function (res) { W.requestAnimationFrame(function () { res(); }); }); }
  function rfPAscr(u, v) { return UI.worldToScreen(K.to3D(UI.activePlane(), u, v)); }
  var rfPArect = null;
  function rfPAev(type, p, o) {
    o = o || {};
    var r = rfPArect || (rfPArect = $('viewport').getBoundingClientRect());
    var init = { bubbles: true, cancelable: true, button: o.button || 0, buttons: type === 'mouseup' ? 0 : (o.buttons != null ? o.buttons : 1), clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) };
    var inside = p[0] >= 0 && p[1] >= 0 && p[0] <= r.width && p[1] <= r.height;
    (o.target || (type === 'mousedown' || (type === 'mousemove' && inside) ? $('viewport') : W)).dispatchEvent(new W.MouseEvent(type, init));
  }
  // a 24 x 12 plate (lines 0-3, fully defined), a free line 4 chained to line 5, a circle 6 above it, then cols x rows
  // holes (7 …), two dimensions on the plate, one on circle 6 and one on the first hole (rfOG's sketch)
  function rfPAcode(cols, rows) {
    var px = 21 / cols, py = 9 / rows, r = Math.min(px, py) * 0.3;
    return 'p.units("in");\nvar s = p.sketch("Front");\n' +
      's.line(0,0,24,0).line(24,0,24,12).line(24,12,0,12).line(0,12,0,0).line(2,14,6,15).line(6,15,9,14).circle(12,15,0.75);\n' +
      'for (var j = 0; j < ' + rows + '; j++) for (var i = 0; i < ' + cols + '; i++) s.circle(1.5 + ' + px + ' * (i + 0.5), 1.5 + ' + py + ' * (j + 0.5), ' + r + ');\n' +
      's.rel("coincident", ["0.p2", "1.p1"]).rel("coincident", ["1.p2", "2.p1"]).rel("coincident", ["2.p2", "3.p1"]).rel("coincident", ["3.p2", "0.p1"]).rel("coincident", ["0.p1", "O"]);\n' +
      's.rel("horizontal", ["0"]).rel("vertical", ["1"]).rel("horizontal", ["2"]).rel("vertical", ["3"]).rel("coincident", ["4.p2", "5.p1"]);\n' +
      's.dim(0, "len", { off: -1.2 }).dim(1, "len", { off: 1.2 }).dim(6, "dia", {}).dim(7, "dia", {});\ns.end();\n';
  }
  async function rfPAsketch(cols, rows) {
    await anvil.newPart(); await idle();
    await anvil.run(rfPAcode(cols, rows)); await idle();
    var f = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    await UI.enterSketch(f.id); await idle();
    UI.zoomToFit();
    for (var i = 0; i < 80 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(25);
    await idle(); await rfPAframe(); await rfPAframe();
    UI.setTool('select');
    rfPArect = $('viewport').getBoundingClientRect();
    return UI.activeSketchFeature();
  }
  // what the sketch group draws: per object its kind, material, order, tags and every buffer value
  function rfPAscene() {
    return UI.groups.sketches.children.filter(function (o) { return o.name !== 'sketch-pictures'; }).map(function (o) {
      var g = o.geometry, pa = g && g.attributes.position, ld = g && g.attributes.lineDistance;
      return { type: o.type, mat: o.material && o.material.uuid, ro: o.renderOrder, vis: o.visible,
        ud: JSON.stringify(o.userData, function (k, v) { return k === 'fat' ? undefined : v; }),
        pos: pa ? Array.prototype.join.call(pa.array, ',') : '', ld: ld ? Array.prototype.join.call(ld.array, ',') : '', idx: g && g.index ? Array.prototype.join.call(g.index.array, ',') : '' };
    });
  }
  function rfPAdiff(A, B) {
    if (A.length !== B.length) return A.length + ' objects against ' + B.length;
    for (var i = 0; i < A.length; i++) for (var k in A[i]) if (A[i][k] !== B[i][k]) return 'object ' + i + ' (' + A[i].type + ' ' + A[i].ud + ') ' + k + ': ' + String(A[i][k]).slice(0, 80) + ' against ' + String(B[i][k]).slice(0, 80);
    return '';
  }
  function rfPAreset() { delete UI.sketchDragRedraw; delete UI.sketchGeoKeep; delete UI.sketchRelKeep; UI.App.sketchDragging = false; }
  async function rfPAleave() { rfPAreset(); UI.setTool('select'); if (UI.App.mode === 'sketch') { await UI.exitSketch(); await idle(); } await anvil.newPart(); await idle(); }
  // drag from a to a + k·d (k = 1..n) with a frame after each move; mid: called after the last move, before the release
  async function rfPAdrag(a, d, n, mid) {
    rfPAev('mousemove', a, { buttons: 0 }); rfPAev('mousedown', a);
    for (var k = 1; k <= n; k++) { rfPAev('mousemove', [a[0] + d[0] * k, a[1] + d[1] * k]); await rfPAframe(); }
    var r = mid ? await mid() : null;
    rfPAev('mouseup', [a[0] + d[0] * n, a[1] + d[1] * n]);
    await idle(); await rfPAframe();
    return r;
  }
  // mid-drag: the drawn sketch and the dimension layer against a full redraw of the same sketch (keeps off)
  function rfPAmidCheck(out, tag) {
    return async function () {
      var st = UI.sketchDragRedrawStats();
      var A = rfPAscene(); UI.drawDims(true); var dA = $('dim-layer').innerHTML;
      UI.sketchDragRedraw = false; UI.sketchGeoKeep = false; UI.sketchRelKeep = false;
      try { UI.updateSketches(); var B = rfPAscene(); UI.drawDims(true); var dB = $('dim-layer').innerHTML; }
      finally { delete UI.sketchDragRedraw; delete UI.sketchGeoKeep; delete UI.sketchRelKeep; }
      out.push({ tag: tag, objects: A.length, diff: rfPAdiff(A, B), dims: dA === dB, dimLen: dA.length, stats: st });
    };
  }

  step('rfPA: a sketch drag redraws only what the solve moved, and what it draws is what a full redraw draws: every object\'s buffers, the dots and the dimension layer mid-drag and after the release, for a hole dragged by its centre and by its edge and a free line end, at 207 entities (an object each) and 1,007 (a buffer per material)', async function () {
    var note = [];
    try {
      for (var size = 0; size < 2; size++) {
        var cols = size ? 40 : 20, rows = size ? 25 : 10;
        var kinds = ['centre', 'edge', 'line'];
        for (var w = 0; w < kinds.length; w++) {
          var f = await rfPAsketch(cols, rows), h = f.entities[7], out = [];
          var a = kinds[w] === 'line' ? rfPAscr(2, 14) : kinds[w] === 'edge' ? rfPAscr(h.cx + h.r, h.cy) : rfPAscr(h.cx, h.cy);
          var s0 = UI.sketchDragRedrawStats();
          await rfPAdrag(a, [3, -2], 8, rfPAmidCheck(out, kinds[w]));
          var m = out[0], tag = f.entities.length + ' entities, ' + kinds[w];
          assert(m.stats.fast - s0.fast >= 6, tag + ': ' + (m.stats.fast - s0.fast) + ' drag frames redrawn in part (' + m.stats.why + ')');
          assert(m.stats.full === s0.full, tag + ': ' + (m.stats.full - s0.full) + ' drag frames redrawn in full (' + m.stats.why + ')');
          assert(!m.diff, tag + ', mid-drag: ' + m.diff);
          assert(m.dims && m.dimLen > 500, tag + ', mid-drag: the dimension layer differs from a full redraw\'s');
          // after the release: what is drawn is a full redraw of the sketch as dropped
          await wait(320); await rfPAframe();
          var C = rfPAscene(); UI.drawDims(true); var dC = $('dim-layer').innerHTML;
          UI.updateSketches(); var D = rfPAscene(); UI.drawDims(true); var dD = $('dim-layer').innerHTML;
          assert(!rfPAdiff(C, D) && dC === dD, tag + ', after the release: ' + rfPAdiff(C, D) + (dC === dD ? '' : ' (dimension layer)'));
          note.push(f.entities.length + '/' + kinds[w] + ' ' + m.objects + ' objects');
          await rfPAleave();
        }
      }
    } finally { await rfPAleave(); }
    return note.join(', ');
  });

  step('rfPA: the drop targets and the solve keep what does not change during a drag: a hole dragged onto a corner of the plate still snaps there and gets its Coincident, and the same drag with nothing kept gives the same coordinates to 1e-12 and the same relations', async function () {
    async function run(keep) {
      var f = await rfPAsketch(8, 5), h = f.entities[7], a = rfPAscr(h.cx, h.cy), c = rfPAscr(24, 0);
      if (!keep) { UI.sketchRelKeep = false; UI.sketchGeoKeep = false; UI.sketchDragRedraw = false; }
      try {
        rfPAev('mousemove', a, { buttons: 0 }); rfPAev('mousedown', a);
        for (var k = 1; k <= 8; k++) { rfPAev('mousemove', [a[0] + (c[0] + 2 - a[0]) * k / 8, a[1] + (c[1] - 2 - a[1]) * k / 8]); await rfPAframe(); }
        rfPAev('mouseup', [c[0] + 2, c[1] - 2]);
        await idle(); await rfPAframe();
      } finally { rfPAreset(); }
      return { ents: JSON.parse(JSON.stringify(f.entities)), rels: (f.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }) };
    }
    var A, B;
    try { A = await run(true); B = await run(false); } finally { await rfPAleave(); }
    var worst = 0;
    A.ents.forEach(function (e, i) { Object.keys(e).forEach(function (k) { if (typeof e[k] === 'number') worst = Math.max(worst, Math.abs(e[k] - B.ents[i][k])); }); });
    assert(worst <= 1e-12, 'coordinates differ by ' + worst);
    assert(JSON.stringify(A.rels) === JSON.stringify(B.rels), A.rels.join(' ') + ' against ' + B.rels.join(' '));
    assert(A.rels.some(function (s) { return /^coincident:7\.c,/.test(s); }), 'the drop on the corner added a Coincident: ' + A.rels.slice(-2).join(' '));
    near(A.ents[7].cx, 24, 1e-9, 'the hole centre is on the corner (x)'); near(A.ents[7].cy, 0, 1e-9, 'the hole centre is on the corner (y)');
    return A.rels.length + ' relations, equal to ' + worst;
  });

  step('rfPA: times, with bounds three times a quiet run of this PC and more: a sketch drag frame (move + frame) on a 207-entity and a 1,607-entity plate', async function () {
    async function times(cols, rows) {
      var f = await rfPAsketch(cols, rows), h = f.entities[7], a = rfPAscr(h.cx, h.cy), mv = [], fr = [], k, t0;
      rfPAev('mousemove', a, { buttons: 0 }); rfPAev('mousedown', a);
      rfPAev('mousemove', [a[0] + 5, a[1] + 5]); await rfPAframe();
      rfPAev('mousemove', [a[0] + 6, a[1] + 4]); await rfPAframe();
      for (k = 1; k <= 16; k++) {
        t0 = performance.now(); rfPAev('mousemove', [a[0] + 5 + (k % 8), a[1] + 5 - (k % 8)]); mv.push(performance.now() - t0);
        t0 = performance.now(); UI.tick(); fr.push(performance.now() - t0);
        await rfPAframe();
      }
      rfPAev('mouseup', [a[0] + 9, a[1] + 1]);
      await idle(); await rfPAframe();
      function med(x) { var s = x.slice().sort(function (p, q) { return p - q; }); return s[s.length >> 1]; }
      return { n: f.entities.length, move: med(mv), frame: med(fr) };
    }
    var a, b;
    try { a = await times(20, 10); b = await times(50, 32); } finally { await rfPAleave(); }
    var txt = a.n + ' entities: ' + a.move.toFixed(1) + ' + ' + a.frame.toFixed(1) + ' ms; ' + b.n + ' entities: ' + b.move.toFixed(1) + ' + ' + b.frame.toFixed(1) + ' ms';
    assert(a.move + a.frame < 40, txt);
    assert(b.move + b.frame < 60, txt);
    return txt;
  });

  function rfPAmesh(ri) { return UI.groups.sketches.children.filter(function (o) { return o.userData && o.userData.sketchRegion === ri; })[0] || null; }
  // the triangles' areas: [sum of |area|, |sum of signed area|] (equal when none lies turned over)
  function rfPAareas(m) {
    var p = m.geometry.attributes.position.array, ix = m.geometry.index.array, a = 0, s = 0;
    for (var t = 0; t < ix.length; t += 3) { var i = 3 * ix[t], j = 3 * ix[t + 1], k = 3 * ix[t + 2], v = ((p[j] - p[i]) * (p[k + 1] - p[i + 1]) - (p[k] - p[i]) * (p[j + 1] - p[i + 1])) / 2; a += Math.abs(v); s += v; }
    return [a, Math.abs(s)];
  }
  function rfPAringArea(e) { var q = K.entityPolylines(e, true)[0].pts, a = 0; for (var i = 0; i < q.length; i++) { var u = q[i], v = q[(i + 1) % q.length]; a += u[0] * v[1] - v[0] * u[1]; } return Math.abs(a) / 2; }

  step('rfPA: a hole dragged larger by its edge on a big sketch keeps the plate\'s shaded fill on every frame (it was hidden until the release): the gap the hole leaves grows to take it, the triangles cover the plate less the holes exactly; the region maps a drag needs are made while the app is idle after the sketch opens, and the first drag makes no shader program', async function () {
    var f = await rfPAsketch(8, 5), note = [];
    try {
      var st0 = UI.sketchRegionStats();
      for (var w = 0; w < 30 && UI.sketchRegionStats().warm === st0.warm; w++) await wait(20);   // (made for the sketch as it opened; a budget of 0 makes it worth it here)
      UI.sketchRegionBudget(0);
      UI.updateSketches(); await rfPAframe();
      for (w = 0; w < 30 && UI.sketchRegionStats().warm === st0.warm; w++) await wait(20);
      assert(UI.sketchRegionStats().warm > st0.warm, 'the region maps were made at idle');
      var regs = UI.sketchRegions(), plate = -1;
      regs.forEach(function (r, i) { if (r.holes === 40) plate = i; });
      assert(plate >= 0, 'the plate is one region with 40 holes');
      var hz = rfPAscr(f.entities[13].cx, f.entities[13].cy);
      UI.zoomView(0.25, hz[0], hz[1]); await idle(); await rfPAframe(); await rfPAframe();   // (the hole large on the screen: every move past the drag's dead zone)
      var h = f.entities[13], r0 = h.r, ring0 = rfPAringArea(h), area0 = rfPAareas(rfPAmesh(plate))[0], hidden = [], progs = UI.renderer.info.programs.length;
      var a = rfPAscr(h.cx + h.r, h.cy), b = rfPAscr(h.cx + 0.82, h.cy), dx = (b[0] - a[0]) / 10, dy = (b[1] - a[1]) / 10, s0 = UI.sketchRegionStats();   // (to r .82: the neighbours sit 1.8 apart)
      rfPAev('mousemove', a, { buttons: 0 }); rfPAev('mousedown', a);
      for (var k = 1; k <= 10; k++) {
        rfPAev('mousemove', [a[0] + dx * k, a[1] + dy * k]); await rfPAframe();
        var m = rfPAmesh(plate), ar = m ? rfPAareas(m) : null;
        hidden.push(m ? 0 : 1);
        if (m && UI.sketchRegionStats().resampled === s0.resampled) {
          near(ar[0], ar[1], 1e-6 * area0, 'frame ' + k + ': no triangle turned over');
          near(ar[0], area0 - ring0 * (h.r * h.r / (r0 * r0) - 1), 1e-6 * area0, 'frame ' + k + ': the fill is the plate less the holes (r ' + h.r.toFixed(4) + ')');
        }
      }
      var s1 = UI.sketchRegionStats();
      assert(hidden.join('') === '0000000000', 'the fill was hidden on frames: ' + hidden.join('') + ' ' + JSON.stringify(s1) + ' r ' + r0 + ' -> ' + h.r);
      assert(h.r > r0 + 0.2, 'the hole grew: ' + r0 + ' -> ' + h.r);
      assert(s1.fast - s0.fast >= 8 && s1.tri === s0.tri, 'followed without triangulating the plate again: ' + JSON.stringify(s1) + ' from ' + JSON.stringify(s0));
      assert(UI.renderer.info.programs.length === progs, (UI.renderer.info.programs.length - progs) + ' shader programs made during the drag');
      rfPAev('mouseup', [a[0] + dx * 10, a[1] + dy * 10]);
      await idle(); await rfPAframe();
      assert(rfPAmesh(plate), 'the fill after the release');
      note.push('r ' + r0.toFixed(3) + ' -> ' + h.r.toFixed(3));
      // a hole carried 1.1 in across the plate, between its neighbours (2.6 apart): the gap is made again around it
      var g = f.entities[14], c0 = rfPAscr(g.cx, g.cy), c1 = rfPAscr(g.cx + 1.1, g.cy), s2 = UI.sketchRegionStats(), hid2 = '';
      rfPAev('mousemove', c0, { buttons: 0 }); rfPAev('mousedown', c0);
      for (k = 1; k <= 10; k++) {
        rfPAev('mousemove', [c0[0] + (c1[0] - c0[0]) * k / 10, c0[1] + (c1[1] - c0[1]) * k / 10]); await rfPAframe();
        var m2 = rfPAmesh(plate), a2 = m2 ? rfPAareas(m2) : null;
        hid2 += m2 ? '0' : '1';
        if (m2) near(a2[0], a2[1], 1e-6 * area0, 'carried, frame ' + k + ': no triangle turned over');
      }
      var s3 = UI.sketchRegionStats();
      assert(hid2 === '0000000000' && s3.grown > s2.grown, 'carried: hidden on frames ' + hid2 + ', gap grown ' + (s3.grown - s2.grown) + ' times');
      rfPAev('mouseup', c1); await idle(); await rfPAframe();
      note.push('carried 1.1 in, the gap grown ' + (s3.grown - s2.grown) + ' times');
    } finally { UI.sketchRegionBudget(3); await rfPAleave(); }
    return note.join('; ');
  });
  // the body alone drawn into a target: how many pixels it covers
  function rfPAbodyPixels() {
    var T = W.THREE, R = UI.renderer, S = UI.scene, cam = UI.camera, pr = R.getPixelRatio(), w = Math.round(UI.size.w * pr), h = Math.round(UI.size.h * pr), restore = [];
    if (UI.render) UI.render();
    S.children.forEach(function (c) { if (c !== cam && c.visible && c !== UI.groups.body && !c.isLight) { restore.push(c); c.visible = false; } });
    var rt = new T.WebGLRenderTarget(w, h, { stencilBuffer: true }), px = new Uint8Array(w * h * 4), n = 0;
    try { R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(); R.render(S, cam); R.readRenderTargetPixels(rt, 0, 0, w, h, px); }
    finally { R.setRenderTarget(null); restore.forEach(function (c) { c.visible = true; }); rt.dispose(); UI.requestRender(); }
    for (var i = 3; i < px.length; i += 4) if (px[i] > 0) n++;
    return n;
  }
  step('rfPA: Section View with RealView on builds no RealView shader program (the first section waited 400 to 780 ms while the body\'s was built again for one clipping plane): the RealView body keeps one plane that clips nothing without a section, and draws whole; the section cuts it; off again it is whole', async function () {
    var keep = null, style = UI.App.view.style;
    try { keep = W.localStorage.getItem('anvil.realview'); } catch (e) { }
    try {
      UI.setRealView(true, true);
      await anvil.newPart(); await idle();
      await anvil.run('p.units("in");\np.box(4, 2, 2);\n'); await idle();
      UI.setStyle('shadedEdges');
      UI.setView('Isometric'); for (var i = 0; i < 50 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(20); UI.zoomToFit(); if (UI.finishViewAnimation) UI.finishViewAnimation(); await idle();
      var body = UI.getBodyMesh().material;
      if (!body.userData.realView) return 'RealView not available here (no studio): skipped';
      assert(body.clippingPlanes && body.clippingPlanes.length === 1 && body.clippingPlanes[0].constant > 1e12, 'no section: one plane that clips nothing');
      var whole = rfPAbodyPixels();
      function rvProgs() { return UI.renderer.info.programs.filter(function (p) { return p.cacheKey.indexOf('anvil-rv') >= 0; }).length; }
      var p0 = rvProgs();
      UI.cmdSection(); await idle(); await UI.pmOK(); await idle();
      body = UI.getBodyMesh().material;
      assert(UI.App.view.section && body.clippingPlanes[0] === UI.App.view.section.plane, 'sectioned: the body is clipped by the section plane');
      var cut = rfPAbodyPixels();
      assert(rvProgs() === p0, (rvProgs() - p0) + ' RealView programs built by the section');
      UI.cmdSection(); await idle();
      if (UI.App.view.section && UI.hasPM && UI.hasPM()) { UI.pmCancel(); await idle(); }
      if (UI.App.view.section && UI.setSection) { UI.setSection(null); await idle(); }
      var again = UI.App.view.section ? null : rfPAbodyPixels();
      assert(whole > 2000 && cut < whole, 'the section cut the body: ' + whole + ' -> ' + cut + ' px');
      if (again != null) assert(again === whole, 'section off: the body whole again (' + again + ' px against ' + whole + ')');
      return whole + ' px whole, ' + cut + ' cut' + (again != null ? ', ' + again + ' again' : '') + '; RealView programs ' + p0 + ' -> ' + rvProgs();
    } finally {
      if (UI.hasPM && UI.hasPM()) UI.pmCancel();
      try { if (keep == null) W.localStorage.removeItem('anvil.realview'); else W.localStorage.setItem('anvil.realview', keep); } catch (e) { }
      UI.setRealView(keep === '1' ? true : keep === '0' ? false : UI.realViewInfo().byDefault, true);
      UI.setStyle(style); await anvil.newPart(); await idle();
    }
  });
  var RFPA_SHOP = ['p.units("in");', 'p.sketch("Front", 0, "Sketch1")',
    '  .line(0.5, 0, 11.5, 0).line(12, 0.5, 12, 7.5).line(11.5, 8, 0.5, 8).line(0, 7.5, 0, 0.5)',
    '  .arc(11.5, 0.5, 0.5, -90, 0).arc(11.5, 7.5, 0.5, 0, 90).arc(0.5, 7.5, 0.5, 90, 180).arc(0.5, 0.5, 0.5, 180, 270)',
    '  .circle(2, 1.5, 0.1405).circle(4, 1.5, 0.1405).circle(6, 1.5, 0.1405).circle(2, 3, 0.1405).circle(4, 3, 0.1405).circle(6, 3, 0.1405)',
    '  .slot(8, 2, 10, 2, 0.5).slot(10.5, 4.5, 10.5, 6.5, 0.375)',
    '  .line(0, 4, 12, 4).line(1, 6.8, 3.5, 7.4).arc(6, 5.5, 1, 20, 160).spline([[2, 4.8], [3, 5.8], [4, 4.9], [5, 6.2]])',
    '  .construction([16, 17])',
    '  .dim(0, "len", { off: -0.6 }).dim(1, "len", { off: -0.6 }).dim(17, "len", { off: 0.4 })',
    '  .dim(5, "r", { ang: 45, off: 1.2 }).dim(8, "dia", { ang: 225, off: 0.8 }).dim(18, "r", { ang: 60, off: 1.6 })',
    '  .dim(14, "w").dim(14, "len")',
    '  .rel("distance", ["0", "2"], 8, { off: 0.9 })', '  .rel("distance", ["2.mid", "14.c"], 3)', '  .rel("angle", ["16", "17"], 13.5)', '  .driven([2]);'].join('\n');
  // the drawn dimension texts: label, ink box, and the dimension's line segments (from its path)
  function rfPAlabels() {
    UI.drawDims(true);
    return Array.prototype.map.call(D.querySelectorAll('#dim-layer g.dim'), function (g) {
      var t = g.querySelector('text'), dl = g.querySelector('path.dl'), segs = [], last = null;
      if (!t || !t.textContent) return null;
      (dl ? dl.getAttribute('d') || '' : '').replace(/([ML])\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/g, function (m, c, x, y) { var q = [+x, +y]; if (c === 'L' && last) segs.push([last, q]); last = q; return m; });
      var bb = t.getBBox(), y = +t.getAttribute('y');
      return { label: t.textContent, box: [bb.x - 1, y - UI.DIM_CAP - 1, bb.x + bb.width + 1, y + 1], segs: segs };
    }).filter(function (x) { return x; });
  }
  step('rfPA: zoomed far out, a dimension value with no clear place along its line goes outside, past its arrow, with its line run on to it (7.000 and 8.000 lay on the plate\'s edges 3x out); an extension line stops 1.5 px clear of the dot that is drawn at its point (it stopped 6.5 px off every point, as off a full 10 px dot, also where a small arc\'s 3 px dot is drawn)', async function () {
    var V = UI.App.view, saved = { grid: V.showGrid, regions: V.sketchRegions, dims: V.showDims }, note = [];
    try {
      await anvil.newPart(); await idle();
      V.showGrid = false; V.sketchRegions = false; V.showDims = false;
      await anvil.run(RFPA_SHOP); await idle();
      var f = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
      UI.editSketch(f.id); await idle();
      UI.zoomToFit(); for (var i = 0; i < 50 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(20); if (UI.finishViewAnimation) UI.finishViewAnimation(); await idle();
      UI.zoomView(3); await idle(); UI.updateSketches(); await idle();
      var L = rfPAlabels(), on = L.filter(function (x) { return UI.sketchGeometryAt(x.box); });
      assert(L.length >= 10, 'dimensions drawn: ' + L.length);
      assert(!on.length, '3x out, values on the sketch\'s lines: ' + on.map(function (x) { return x.label; }).join(', '));
      var seven = L.filter(function (x) { return x.label === '7.000'; })[0];
      assert(seven, 'the 7.000 is drawn');
      // its line runs on to it: a segment of its path reaches within a few px of its box
      var bx = seven.box, reach = seven.segs.some(function (s) { return s.some(function (q) { return q[0] >= bx[0] - 4 && q[0] <= bx[2] + 4 && q[1] >= bx[1] - 4 && q[1] <= bx[3] + 4; }); });
      assert(reach, 'the 7.000\'s line runs on to its value');
      note.push(L.length + ' values clear of the lines 3x out');
      // extension line gaps: a 4 in line whose right end a small arc shares (its dot is that arc's, 3 px or hidden)
      await anvil.newPart(); await idle();
      V.showGrid = false; V.sketchRegions = false; V.showDims = false;
      await anvil.run('p.units("in");\np.sketch("Front").line(0, 0, 4, 0).arc(4, 0.03, 0.03, -90, 90).dim(0, "len", { off: -0.8 });\n'); await idle();
      f = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
      UI.editSketch(f.id); await idle();
      UI.zoomToFit(); for (i = 0; i < 50 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(20); if (UI.finishViewAnimation) UI.finishViewAnimation(); await idle();
      var dimL = rfPAlabels().filter(function (x) { return x.label === '4.000'; })[0], pl = UI.activePlane();
      function gapAt(u, v) { var p = UI.worldToScreen(K.to3D(pl, u, v)), best = Infinity; dimL.segs.forEach(function (s) { s.forEach(function (q) { var d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < best) best = d; }); }); return best; }
      var gl = gapAt(0, 0), gr = gapAt(4, 0), dotR = UI.sketchDotCap(f.entities[1]);
      near(gl, 6.5, 0.6, 'by a full 10 px dot the extension line stops 1.5 px past it');
      assert(gr < 4.5 && gr >= 1.5, 'by the small arc\'s dot (' + dotR + ' px) it stops ' + gr.toFixed(1) + ' px from the point');
      note.push('gaps ' + gl.toFixed(1) + ' px (10 px dot) and ' + gr.toFixed(1) + ' px (' + dotR + ' px dot)');
    } finally {
      V.showGrid = saved.grid; V.sketchRegions = saved.regions; V.showDims = saved.dims;
      if (UI.App.mode === 'sketch') { await UI.exitSketch(); await idle(); }
      await anvil.newPart(); await idle();
    }
    return note.join('; ');
  });