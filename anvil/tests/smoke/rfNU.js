  // ---- rfNU (local-2026-11-16b, lane sketchfull): clicks a slow PC must not lose (each drawing tool clicked the moment
  // it is picked; a quick click on a line's middle or a quick double-press on a label handled late, after a slow frame),
  // one analysis for a new dimension on a big sketch, and the sketch pick distances in px (report
  // test-reports/2026-11-16-sketch-clicks.md). Real mouse / key events as rfNK.
  function rfNUScr(uv) { var s = UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])), r = $('viewport').getBoundingClientRect(); return [Math.round(r.left + s[0]), Math.round(r.top + s[1])]; }
  function rfNUMk(type, c, mods) {
    return new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: c[0], clientY: c[1] }, mods || {}));
  }
  function rfNUEv(type, c, mods) { (type === 'mousedown' ? $('viewport') : W).dispatchEvent(rfNUMk(type, c, mods)); }
  // a click with no waits at all: move, press, release (what a quick hand on a busy PC gives the page in one go)
  function rfNUTap(uv) { var c = rfNUScr(uv); rfNUEv('mousemove', c); rfNUEv('mousedown', c); rfNUEv('mouseup', c); }
  function rfNUKey(k, mods) { D.dispatchEvent(new W.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {}))); }
  function rfNUBusy(ms) { var e = performance.now() + ms; while (performance.now() < e) { /* a slow frame */ } }
  function rfNUF() { return UI.activeSketchFeature(); }
  function rfNUKinds() { return rfNUF().entities.map(function (e) { return e.t; }).join(','); }
  var rfNUGrid = null;
  async function rfNUNew() {
    var du = UI.defaultUnits();
    UI.setDefaultUnits('in');
    try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
    if (rfNUGrid == null) rfNUGrid = UI.App.view.showGrid;
    UI.App.view.showGrid = false; UI.App.gridStale = true;
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    // 10 x 6.5 in across the viewport, the origin low left
    var a = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0)), b = UI.worldToScreen(K.to3D(UI.activePlane(), 1, 0));
    UI.zoomView(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.min(UI.size.w / 10, UI.size.h / 6.5));
    var o = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0));
    UI.panView(UI.size.w * 0.08 - o[0], UI.size.h * 0.72 - o[1]);
    UI.updateSketches(); await wait(20);
    return rfNUF();
  }
  async function rfNUEnd() {
    if (rfNUGrid != null) { UI.App.view.showGrid = rfNUGrid; rfNUGrid = null; UI.App.gridStale = true; }
    if (UI.App.mode === 'sketch') { UI.setTool('select'); if (UI.closePM) UI.closePM(); if (UI.cancelSketch) UI.cancelSketch(); await idle(); }
  }

  step('rfNU: each drawing tool clicked the moment it is picked, with no pause between move, press and release: Line, Circle, Corner Rectangle, Straight Slot, Smart Dimension and Trim lose no click', async function () {
    try {
      await rfNUNew();
      UI.setTool('line'); rfNUTap([1, 1]); rfNUTap([3, 1]); rfNUTap([3, 2.5]); rfNUKey('Escape'); rfNUKey('Escape');
      assert(rfNUKinds() === 'line,line', 'Line: two segments: ' + rfNUKinds());
      UI.setTool('circle'); rfNUTap([5, 1.5]); rfNUTap([5.5, 1.5]); rfNUKey('Escape'); rfNUKey('Escape');
      assert(rfNUKinds() === 'line,line,circle', 'Circle: ' + rfNUKinds());
      near(rfNUF().entities[2].r, 0.5, 1e-6, 'the circle\'s radius');
      UI.setTool('rect'); rfNUTap([1, 3]); rfNUTap([3, 4]); rfNUKey('Escape'); rfNUKey('Escape');
      assert(/^line,line,circle,(rect|line,line,line,line)$/.test(rfNUKinds()), 'Corner Rectangle: ' + rfNUKinds());
      var n0 = rfNUF().entities.length;
      UI.sketchCurveOptions({ slotDims: false, overall: false });
      UI.setTool('slot'); rfNUTap([5, 3.5]); rfNUTap([7, 3.5]); rfNUTap([6.5, 3.75]); rfNUKey('Escape'); rfNUKey('Escape');
      assert(rfNUF().entities.length === n0 + 5, 'Straight Slot: 2 lines, 2 arcs and its centerline: ' + rfNUKinds());
      // Smart Dimension: the first line (a quick click: not its midpoint), then the place
      var nd = (rfNUF().dims || []).length;
      UI.setTool('dimension'); rfNUTap([1.6, 1]); rfNUTap([1.6, 0.5]);
      assert((rfNUF().dims || []).length === nd + 1 && rfNUF().dims[nd].e === 0, 'Smart Dimension on the line: ' + JSON.stringify(rfNUF().dims));
      if (!$('dim-edit').hidden) { rfNUKey('Escape'); }
      UI.setTool('select');
      // Trim (Power trim by a click on the piece): the second line goes
      var n1 = rfNUF().entities.length;
      UI.cmdTrimEntities(); rfNUTap([3, 2]); if (UI.pmOK) await UI.pmOK();
      await idle();
      assert(rfNUF().entities.length === n1 - 1, 'Trim took the clicked line: ' + n1 + ' -> ' + rfNUF().entities.length);
      return rfNUKinds();
    } finally { await rfNUEnd(); }
  });

  step('rfNU: a quick click on the middle of a line still picks the line when the page handles it late (a 300 ms frame between the move and the press); a rest of 150 ms picks the midpoint', async function () {
    try {
      var f = await rfNUNew();
      UI.setTool('line'); rfNUTap([1, 1]); rfNUTap([4, 1]); rfNUKey('Escape'); rfNUKey('Escape');
      assert(f.entities.length === 1, 'a line');
      UI.setTool('dimension'); await wait(20);
      var c = rfNUScr([2.5, 1]), mv = rfNUMk('mousemove', c), dn = rfNUMk('mousedown', c), up = rfNUMk('mouseup', c);
      // the hand moved and clicked within a few ms (the events' time stamps); the page was busy with a frame between
      W.dispatchEvent(mv); rfNUBusy(300); $('viewport').dispatchEvent(dn); W.dispatchEvent(up);
      var st = UI.App.toolState || {};
      assert(st.dim && st.dim.e === 0 && st.dim.k === 'len', 'the quick click picked the line (its length), not the midpoint: ' + JSON.stringify(st.dim || st.pt1 || null));
      rfNUKey('Escape'); await wait(20);
      // a real rest by the middle: the midpoint (SolidWorks)
      UI.setTool('dimension'); await wait(20);
      rfNUEv('mousemove', c); await wait(UI.dimMidDwell() + 60); rfNUEv('mousemove', c); rfNUEv('mousedown', c); rfNUEv('mouseup', c);
      st = UI.App.toolState || {};
      assert(st.pt1 === '0.mid', 'after a rest the midpoint: ' + JSON.stringify(st.pt1 || st.dim || null));
      rfNUKey('Escape');
      return 'quick: line length; rested: 0.mid';
    } finally { await rfNUEnd(); }
  });

  step('rfNU: a double-press on a dimension label opens the Modify box when a slow redraw (600 ms) follows the first press', async function () {
    try {
      var f = await rfNUNew();
      UI.setTool('line'); rfNUTap([1, 1]); rfNUTap([4, 1]); rfNUKey('Escape'); rfNUKey('Escape');
      f.dims = [{ e: 0, k: 'len', off: 0.6 }]; UI.App.dimsStale = true; UI.updateSketches();
      UI.setTool('select'); await wait(20);
      if (UI.drawDims) UI.drawDims(true);
      var t = Array.prototype.filter.call(D.querySelectorAll('#dim-layer text'), function (x) { return /^3/.test(x.textContent); })[0];
      assert(t, 'the 3.000 label');
      var b = t.getBoundingClientRect(), c = [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)];
      var d1 = rfNUMk('mousedown', c), u1 = rfNUMk('mouseup', c), d2 = rfNUMk('mousedown', c), u2 = rfNUMk('mouseup', c);
      t.dispatchEvent(d1); W.dispatchEvent(u1); rfNUBusy(600);
      var t2 = Array.prototype.filter.call(D.querySelectorAll('#dim-layer text'), function (x) { return /^3/.test(x.textContent); })[0] || t;
      t2.dispatchEvent(d2); W.dispatchEvent(u2); await wait(30);
      assert(!$('dim-edit').hidden, 'the Modify box is open');
      rfNUKey('Escape');
      return 'Modify box after a 600 ms frame';
    } finally { await rfNUEnd(); }
  });

  step('rfNU: pick distances at 100 % with the Select tool: a press within 5 px of a line or a hole grabs it, within 6 px of an end point grabs the point, farther starts a box (also on a 420-hole pattern)', async function () {
    try {
      var f = await rfNUNew(), out = [];
      UI.setTool('line'); rfNUTap([1, 1]); rfNUTap([4, 1]); rfNUKey('Escape'); rfNUKey('Escape');
      UI.setTool('circle'); rfNUTap([6, 2]); rfNUTap([6.5, 2]); rfNUKey('Escape'); rfNUKey('Escape');
      f.entities[1].r = 0.125;
      UI.App.dimsStale = true; UI.updateSketches(); UI.setTool('select'); await wait(30);
      var snap = JSON.stringify(f.entities);
      async function grab(c) {
        // press, drag 30 px down-right, release: did the sketch change (grabbed) or did a box start?
        rfNUEv('mousemove', c); rfNUEv('mousedown', c);
        for (var k = 1; k <= 4; k++) rfNUEv('mousemove', [c[0] + 8 * k, c[1] + 8 * k]);
        var box = $('sel-box') && !$('sel-box').hidden;
        rfNUEv('mouseup', [c[0] + 32, c[1] + 32]); await wait(10);
        var moved = JSON.stringify(f.entities) !== snap, ed = !$('dim-edit').hidden;
        if (moved) { f.entities = JSON.parse(snap); UI.updateSketches(); }
        if (ed) rfNUKey('Escape');
        UI.App.sel = null; if (UI.setSelection) UI.setSelection([]);
        return box ? '.' : 'G';   // (no box: the press took the entity)
      }
      var pxIn = Math.hypot(rfNUScr([1, 0])[0] - rfNUScr([0, 0])[0], 0), R = 0.125 * pxIn;
      // the farthest whole px (2 … 12) a press grabs: G up to it, a box beyond
      async function reach(at) {
        var row = '', last = 0;
        for (var d = 2; d <= 12; d++) { var g = await grab(at(d)); row += g; if (g === 'G') last = d; }
        assert(/^G*\.*$/.test(row), 'grabs up to a distance, then boxes: ' + row);
        return last;
      }
      var A = rfNUScr([2.3, 1]), E = rfNUScr([4, 1]), C = rfNUScr([6, 2]);
      var side = await reach(function (d) { return [A[0], A[1] + d]; });
      var end = await reach(function (d) { return [E[0] + d, E[1]]; });
      var rim = await reach(function (d) { return [Math.round(C[0] - R - d), C[1]]; });
      // a big pattern (drawn batched, 400+ entities) as rfNP's plate
      f.dims = []; f.entities = []; f.rels = [];
      for (var i = 0; i < 420; i++) f.entities.push({ t: 'circle', cx: 0.3 + (i % 30) * 1.1, cy: 0.3 + Math.floor(i / 30) * 2.3, r: 0.125 });
      snap = JSON.stringify(f.entities); UI.App.dimsStale = true; UI.updateSketches(); await wait(30);
      var C2 = rfNUScr([0.3 + 3 * 1.1, 0.3 + 1 * 2.3]);
      var big = await reach(function (d) { return [C2[0], Math.round(C2[1] + R + d)]; });
      out.push('px/in ' + pxIn.toFixed(0) + ': line side ' + side + ' px, line end ' + end + ' px, hole rim ' + rim + ' px, 420-hole pattern rim ' + big + ' px');
      // SolidWorks picks a curve a few px away: 5 here (under 6), a point 6 (under 7)
      assert(side === 5 && rim === 5 && big === 5, 'a curve is picked within 5 px: ' + out[0]);
      assert(end === 6, 'an end point within 6 px: ' + out[0]);
      return out[0];
    } finally { await rfNUEnd(); }
  });

  step('rfNU: Smart Dimension on a hole of a 300-hole sketch costs one analysis (the before state is the one already analysed, the after state is reused by the redraw)', async function () {
    try {
      var f = await rfNUNew();
      for (var i = 0; i < 300; i++) f.entities.push({ t: 'circle', cx: 0.4 + (i % 20) * 0.45, cy: 0.4 + Math.floor(i / 20) * 0.38, r: 0.1 });
      UI.App.dimsStale = true; UI.updateSketches(); await wait(20);
      W.SketchSolver.analyze(f);   // what the redraw had already done
      UI.setTool('dimension'); await wait(20);
      W.SketchSolver.resetStats();
      var c0 = rfNUScr([0.4 + 5 * 0.45 + 0.1, 0.4 + 7 * 0.38]);
      rfNUEv('mousemove', c0); rfNUEv('mousedown', c0); rfNUEv('mouseup', c0); await wait(20);
      var c1 = rfNUScr([0.4 + 5 * 0.45 + 0.2, 0.4 + 7 * 0.38 + 0.15]);
      rfNUEv('mousemove', c1); rfNUEv('mousedown', c1); rfNUEv('mouseup', c1); await wait(40);
      assert((f.dims || []).length === 1 && f.dims[0].k === 'dia', 'a diameter: ' + JSON.stringify(f.dims));
      var s = JSON.parse(JSON.stringify(W.SketchSolver.stats));
      assert(s.analyses === 1, 'one analysis for the new dimension (' + JSON.stringify(s) + ')');
      rfNUKey('Escape');
      return JSON.stringify(s);
    } finally { await rfNUEnd(); }
  });
