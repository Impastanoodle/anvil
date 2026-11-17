  // ---- rfOG (2026-11-17, lane dragsnap): what is under the cursor follows it within one frame.
  // Measured before (headless Chrome, real mouse moves): a dragged sketch point was solved in a requestAnimationFrame of
  // its own, which runs after the render loop's, so the sketch was drawn one frame behind the cursor (the dimension text
  // drag and Instant2D likewise); every redraw of a sketch triangulated its shaded regions again (38 ms a drag frame at
  // 200 entities, 650 ms on a plate with 1,600 holes); every mouse move tessellated and projected the whole sketch three
  // times to find what is under the cursor and read the layout four times. Rows here: exact counts that do not depend
  // on the machine (one solve per move, the frame after a move shows it, at most one dimension layer layout and one
  // scene render per frame, none when nothing moved, no layout read in a move handler), the fast ways give what the
  // plain ways give (pick, label placement, the drag's result and the relation a drop adds), the regions follow a drag
  // without a new triangulation, a drag over the edge and Esc, and generous time bounds.
  function rfOGframe() { return new Promise(function (res) { W.requestAnimationFrame(function () { res(); }); }); }
  function rfOGscr(u, v) { return UI.worldToScreen(K.to3D(UI.activePlane(), u, v)); }
  var rfOGrect = null;
  // a real mouse event at viewport point p; the layout is read once here, never while the app handles the event
  function rfOGev(type, p, o) {
    o = o || {};
    var r = rfOGrect || (rfOGrect = $('viewport').getBoundingClientRect());
    var init = { bubbles: true, cancelable: true, button: o.button || 0, buttons: type === 'mouseup' ? 0 : (o.buttons != null ? o.buttons : 1), clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) };
    Object.keys(o.mods || {}).forEach(function (k) { init[k] = o.mods[k]; });
    // (a move over the graphics area goes to it, as a real one does, so its own listeners run; outside it, to the window)
    var inside = p[0] >= 0 && p[1] >= 0 && p[0] <= r.width && p[1] <= r.height;
    (o.target || (type === 'mousedown' || (type === 'mousemove' && inside) ? $('viewport') : W)).dispatchEvent(new W.MouseEvent(type, init));
  }
  // where the event of rfOGev lands, in sketch units (client pixels are whole)
  function rfOGuv(p) { var r = rfOGrect, q = [Math.round(r.left + p[0]) - r.left, Math.round(r.top + p[1]) - r.top]; return UI.screenToPlane(q[0], q[1], UI.activePlane()); }
  // a 24 x 12 plate (lines 0-3, fully defined), a free line 4 chained to line 5, a circle 6 above it, then cols x rows
  // holes (7 …) on a grid, two dimensions on the plate, one on circle 6 and one on the first hole
  function rfOGcode(cols, rows) {
    var px = 21 / cols, py = 9 / rows, r = Math.min(px, py) * 0.3;
    return 'p.units("in");\nvar s = p.sketch("Front");\n' +
      's.line(0,0,24,0).line(24,0,24,12).line(24,12,0,12).line(0,12,0,0).line(2,14,6,15).line(6,15,9,14).circle(12,15,0.75);\n' +
      'for (var j = 0; j < ' + rows + '; j++) for (var i = 0; i < ' + cols + '; i++) s.circle(1.5 + ' + px + ' * (i + 0.5), 1.5 + ' + py + ' * (j + 0.5), ' + r + ');\n' +
      's.rel("coincident", ["0.p2", "1.p1"]).rel("coincident", ["1.p2", "2.p1"]).rel("coincident", ["2.p2", "3.p1"]).rel("coincident", ["3.p2", "0.p1"]).rel("coincident", ["0.p1", "O"]);\n' +
      's.rel("horizontal", ["0"]).rel("vertical", ["1"]).rel("horizontal", ["2"]).rel("vertical", ["3"]).rel("coincident", ["4.p2", "5.p1"]);\n' +
      's.dim(0, "len", { off: -1.2 }).dim(1, "len", { off: 1.2 }).dim(6, "dia", {}).dim(7, "dia", {});\ns.end();\n';
  }
  async function rfOGsketch(cols, rows) {
    await anvil.newPart(); await idle();
    await anvil.run(rfOGcode(cols, rows)); await idle();
    var f = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    await UI.enterSketch(f.id); await idle();
    UI.zoomToFit();
    for (var i = 0; i < 80 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(25);
    await idle(); await rfOGframe(); await rfOGframe();
    UI.setTool('select');
    rfOGrect = $('viewport').getBoundingClientRect();
    return UI.activeSketchFeature();
  }
  // counters on the app's own entry points and on the DOM's layout readers; .off() puts everything back
  function rfOGcount() {
    var c = { dims: 0, sk: 0, drag: 0, render: 0, layout: 0, renderVer: -1, armed: false }, undo = [];
    function wrap(o, k, key) { var f = o[k]; o[k] = function () { c[key]++; return f.apply(this, arguments); }; undo.push(function () { o[k] = f; }); }
    wrap(UI, 'drawDims', 'dims'); wrap(UI, 'updateSketches', 'sk'); wrap(W.SketchSolver, 'drag', 'drag');
    var r = UI.renderer, rr = r.render;
    r.render = function (scene) { if (scene === UI.scene) { c.render++; c.renderVer = UI.sketchSceneVersion(); } return rr.apply(this, arguments); };
    undo.push(function () { r.render = rr; });
    [[W.Element.prototype, 'getBoundingClientRect'], [W.Element.prototype, 'getClientRects'], [W.SVGGraphicsElement.prototype, 'getBBox'], [W.SVGTextContentElement.prototype, 'getComputedTextLength']].forEach(function (m) {
      var f = m[0][m[1]];
      m[0][m[1]] = function () { if (c.armed) { c.layout++; c.where = c.where || String(new Error().stack).split(String.fromCharCode(10)).slice(2, 6).join(' < ').replace(/https?:\/\/[^/]+\//g, ''); } return f.apply(this, arguments); };
      undo.push(function () { m[0][m[1]] = f; });
    });
    [[W.HTMLElement.prototype, 'offsetWidth'], [W.HTMLElement.prototype, 'offsetHeight'], [W.HTMLElement.prototype, 'offsetLeft'], [W.HTMLElement.prototype, 'offsetTop'], [W.Element.prototype, 'clientWidth'], [W.Element.prototype, 'clientHeight']].forEach(function (m) {
      var d = Object.getOwnPropertyDescriptor(m[0], m[1]);
      if (!d || !d.get) return;
      Object.defineProperty(m[0], m[1], { configurable: true, get: function () { if (c.armed) { c.layout++; c.where = c.where || m[1] + ' ' + String(new Error().stack).split(String.fromCharCode(10)).slice(2, 6).join(' < ').replace(/https?:\/\/[^/]+\//g, ''); } return d.get.call(this); } });
      undo.push(function () { Object.defineProperty(m[0], m[1], d); });
    });
    // a move event whose handlers are watched for layout reads
    c.move = function (p, o) { c.armed = true; try { rfOGev('mousemove', p, o); } finally { c.armed = false; } };
    c.off = function () { undo.forEach(function (fn) { fn(); }); };
    return c;
  }
  function rfOGregionMesh(ri) { return UI.groups.sketches.children.filter(function (o) { return o.userData && o.userData.sketchRegion === ri; })[0] || null; }
  // the area the triangles of a region mesh cover, each counted by its size (triangles lying over each other would add up to more)
  function rfOGmeshArea(m) {
    var p = m.geometry.attributes.position.array, ix = m.geometry.index.array, a = 0;
    for (var t = 0; t < ix.length; t += 3) { var i = 3 * ix[t], j = 3 * ix[t + 1], k = 3 * ix[t + 2]; a += Math.abs((p[j] - p[i]) * (p[k + 1] - p[i + 1]) - (p[k] - p[i]) * (p[j + 1] - p[i + 1])) / 2; }
    return a;
  }
  function rfOGhasVertex(m, x, y) { var p = m.geometry.attributes.position.array; for (var i = 0; i < p.length; i += 3) if (Math.abs(p[i] - x) < 2e-4 && Math.abs(p[i + 1] - y) < 2e-4) return true; return false; }
  function rfOGmedian(a) { var s = a.slice().sort(function (x, y) { return x - y; }); return s[s.length >> 1]; }
  function rfOGreset() { UI.sketchRegionBudget(3); delete UI.sketchPickGrid; delete UI.sketchGeoFast; UI.App.sketchDragging = false; }
  async function rfOGleave() { rfOGreset(); UI.setTool('select'); if (UI.App.mode === 'sketch') { await UI.exitSketch(); await idle(); } await anvil.newPart(); await idle(); }

  step('rfOG: a dragged sketch point is solved once per move and drawn, with its dimensions, by the frame that follows the move (it trailed the cursor by a frame); a second move in the same frame waits and is drawn by that frame too; one dimension layer layout and one scene render per frame at most, none while nothing moves; no layout is read in a move handler', async function () {
    var f = await rfOGsketch(6, 4), c = rfOGcount(), e = f.entities[4], note = [];
    try {
      var p0 = rfOGscr(2, 14), solvedAtOnce = 0, n = 10;
      rfOGev('mousemove', p0, { buttons: 0 });
      rfOGev('mousedown', p0);
      await rfOGframe();
      for (var k = 1; k <= n; k++) {
        var p = [p0[0] - 6 * k, p0[1] - 5 * k], b = { drag: c.drag, dims: c.dims, render: c.render };
        c.move(p);
        if (c.drag - b.drag === 1) solvedAtOnce++;
        assert(c.drag - b.drag === 1, 'move ' + k + ': the first move since the last frame is solved in its handler');
        await rfOGframe();
        var uv = rfOGuv(p);
        assert(c.drag - b.drag === 1, 'move ' + k + ': ' + (c.drag - b.drag) + ' solves for one move');
        near(e.x1, uv[0], 1e-9, 'move ' + k + ': the end is under the cursor (x)'); near(e.y1, uv[1], 1e-9, 'move ' + k + ': the end is under the cursor (y)');
        assert(c.renderVer === UI.sketchSceneVersion(), 'move ' + k + ': the frame after the move drew the sketch as solved (drawn version ' + c.renderVer + ', sketch version ' + UI.sketchSceneVersion() + ')');
        assert(!UI.App.dimsStale, 'move ' + k + ': the dimension layer was drawn in that frame');
        assert(c.dims - b.dims <= 1 && c.render - b.render <= 1, 'move ' + k + ': ' + (c.dims - b.dims) + ' dimension layouts, ' + (c.render - b.render) + ' scene renders in one frame');
      }
      // two moves before one frame
      var pa = [p0[0] - 80, p0[1] - 20], pb = [p0[0] - 95, p0[1] - 31], d0 = c.drag, r0 = c.render, m0 = c.dims;
      c.move(pa); c.move(pb);
      assert(c.drag - d0 === 1, 'the second move of a frame is not solved in its handler: ' + (c.drag - d0));
      await rfOGframe();
      var uvb = rfOGuv(pb);
      assert(c.drag - d0 === 2, 'two moves in a frame: ' + (c.drag - d0) + ' solves');
      near(e.x1, uvb[0], 1e-9, 'the last move of the frame is the one shown (x)'); near(e.y1, uvb[1], 1e-9, 'the last move of the frame is the one shown (y)');
      assert(c.renderVer === UI.sketchSceneVersion() && !UI.App.dimsStale, 'drawn, with its dimensions, by the frame that followed the two moves');
      assert(c.render - r0 <= 1 && c.dims - m0 <= 1, 'one render and one dimension layout for the two moves');
      assert(c.layout === 0, c.layout + ' layout reads in the move handlers of a drag: ' + c.where);
      rfOGev('mouseup', pb);
      await idle(); await rfOGframe(); await rfOGframe();
      // nothing moves: no dimension layout; a hover over empty space reads no layout and lays out no dimensions
      // (first the full label layout that follows the last frame of a drag by 150 ms)
      await wait(320); await rfOGframe(); await rfOGframe();
      var q0 = c.dims;
      for (k = 0; k < 6; k++) await rfOGframe();
      assert(c.dims === q0, (c.dims - q0) + ' dimension layouts in six frames in which nothing moved');
      var away = rfOGscr(-3, -2);
      for (k = 0; k < 8; k++) { c.move([away[0] + 3 * k, away[1] + 2 * k], { buttons: 0 }); await rfOGframe(); }
      assert(c.dims === q0, (c.dims - q0) + ' dimension layouts for eight moves over empty space');
      // over the sketch (pre-highlight), and a view drag with the middle button
      var over = rfOGscr(5, 6);
      for (k = 0; k < 8; k++) { c.move([over[0] + 9 * k, over[1] + 4 * k], { buttons: 0 }); await rfOGframe(); }
      var mid = [UI.size.w / 2, UI.size.h / 2], view = JSON.stringify([UI.cam.dir, UI.cam.up]);
      rfOGev('mousedown', mid, { button: 1, buttons: 4 });
      for (k = 1; k <= 6; k++) {
        var r1 = c.render, m1 = c.dims;
        c.move([mid[0] + 7 * k, mid[1] + 3 * k], { button: 1, buttons: 4 });
        await rfOGframe();
        assert(c.render - r1 <= 1 && c.dims - m1 <= 1 && !UI.App.dimsStale, 'view drag, move ' + k + ': ' + (c.render - r1) + ' renders, ' + (c.dims - m1) + ' dimension layouts, layer drawn with the view');
      }
      rfOGev('mouseup', [mid[0] + 42, mid[1] + 18], { button: 1 });
      assert(JSON.stringify([UI.cam.dir, UI.cam.up]) !== view, 'the middle button turned the view');
      assert(c.layout === 0, c.layout + ' layout reads in the move handlers (hover, view drag): ' + c.where);
      note.push(solvedAtOnce + ' of ' + n + ' moves solved in the handler');
    } finally { c.off(); UI.setView('front'); await rfOGleave(); }
    return note.join('; ');
  });

  step('rfOG: the fast ways answer as the plain ways: the entity and the point under the cursor at 600 places (the pick grid and the kept points against the whole-sketch scan), the dimension layer drawn with the label grid against the scan (the same text), and a drag ending in a drop on a corner gives the same coordinates to 1e-12 and the same Coincident', async function () {
    async function run(fast) {
      var f = await rfOGsketch(8, 5);
      UI.sketchRegionBudget(fast ? 0 : Infinity);
      if (!fast) { UI.sketchPickGrid = false; UI.sketchGeoFast = false; }
      // picks over a lattice of the graphics area (the plain way: as during a drag, nothing kept)
      var picks = [];
      UI.App.sketchDragging = !fast;
      try {
        for (var y = 0; y < 20; y++) for (var x = 0; x < 30; x++) {
          var mx = 40 + x * (UI.size.w - 80) / 29, my = 30 + y * (UI.size.h - 60) / 19, h = UI.pickEntity(mx, my);
          picks.push((h ? h.index : -1) + '/' + (UI.pickSketchRef ? UI.pickSketchRef(mx, my) : ''));
        }
      } finally { UI.App.sketchDragging = false; }
      UI.drawDims(true);
      var layer = $('dim-layer').innerHTML;
      // drag hole 7 a little (the regions follow), then the free end of line 4 onto the plate's corner (0, 12)
      var a = rfOGscr(f.entities[7].cx, f.entities[7].cy);
      rfOGev('mousemove', a, { buttons: 0 }); rfOGev('mousedown', a);
      for (var k = 1; k <= 5; k++) { rfOGev('mousemove', [a[0] + 4 * k, a[1] - 3 * k]); await rfOGframe(); }
      rfOGev('mouseup', [a[0] + 20, a[1] - 15]);
      await idle(); await rfOGframe();
      var p0 = rfOGscr(2, 14), corner = rfOGscr(0, 12);
      rfOGev('mousemove', p0, { buttons: 0 }); rfOGev('mousedown', p0);
      for (k = 1; k <= 6; k++) { rfOGev('mousemove', [p0[0] + (corner[0] + 2 - p0[0]) * k / 6, p0[1] + (corner[1] + 2 - p0[1]) * k / 6]); await rfOGframe(); }
      rfOGev('mouseup', [corner[0] + 2, corner[1] + 2]);
      await idle(); await rfOGframe();
      var out = { picks: picks, layer: layer, ents: JSON.parse(JSON.stringify(f.entities)), rels: (f.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }), stats: UI.sketchRegionStats() };
      rfOGreset();
      return out;
    }
    var st0 = UI.sketchRegionStats(), A, B;
    try { A = await run(true); B = await run(false); } finally { await rfOGleave(); }
    var diff = 0, firstDiff = '';
    A.picks.forEach(function (s, i) { if (s !== B.picks[i]) { diff++; if (!firstDiff) firstDiff = 'place ' + i + ': ' + s + ' against ' + B.picks[i]; } });
    assert(diff === 0, diff + ' of ' + A.picks.length + ' picks differ (' + firstDiff + ')');
    assert(A.picks.filter(function (s) { return s !== '-1/null' && s !== '-1/'; }).length > 40, 'the lattice met the sketch');
    assert(A.layer === B.layer, 'the dimension layer differs between the label grid and the scan');
    assert(A.ents.length === B.ents.length, 'entity count');
    var worst = 0;
    A.ents.forEach(function (e, i) { Object.keys(e).forEach(function (k) { if (typeof e[k] === 'number') worst = Math.max(worst, Math.abs(e[k] - B.ents[i][k])); else assert(JSON.stringify(e[k]) === JSON.stringify(B.ents[i][k]), 'entity ' + i + ' ' + k); }); });
    assert(worst <= 1e-12, 'coordinates differ by ' + worst);
    assert(JSON.stringify(A.rels) === JSON.stringify(B.rels), 'relations: ' + A.rels.join(' ') + ' against ' + B.rels.join(' '));
    assert(A.rels.some(function (s) { return /^coincident:4\.p1,/.test(s); }), 'the drop on the corner added a Coincident: ' + A.rels.slice(-2).join(' '));
    assert(A.stats.fast - st0.fast >= 5, 'the first run followed the regions in place (' + (A.stats.fast - st0.fast) + ' frames)');
    assert(B.stats.fast === A.stats.fast, 'the second run built the regions in full on every frame');
    return A.picks.length + ' picks, ' + A.ents.length + ' entities equal to ' + worst + ', ' + A.rels.length + ' relations';
  });

  step('rfOG: the shaded regions follow a dragged hole in place: no new triangulation during the drag or at the release, the triangles still cover exactly the plate less its holes, the fill has the hole where it is now; a redraw that changes nothing triangulates nothing; a hole dragged onto its neighbour cannot be followed, so that region is not drawn until the release', async function () {
    var f = await rfOGsketch(8, 5), note = [];
    try {
      UI.sketchRegionBudget(0);
      var regs = UI.sketchRegions(), plate = -1;
      regs.forEach(function (r, i) { if (r.holes === 40) plate = i; });
      assert(plate >= 0, 'the plate with its 40 holes is one region: ' + JSON.stringify(regs.map(function (r) { return r.holes; })));
      var m0 = rfOGregionMesh(plate), area0 = rfOGmeshArea(m0);
      near(area0, regs[plate].area, 1e-4, 'the fill covers the region');
      var s0 = UI.sketchRegionStats();
      UI.updateSketches(); UI.updateSketches();
      assert(UI.sketchRegionStats().tri === s0.tri, 'a redraw with nothing changed triangulated ' + (UI.sketchRegionStats().tri - s0.tri) + ' regions');
      // drag hole 7 by its centre, a third of the way to its neighbour
      var h = f.entities[7], step = f.entities[8].cx - h.cx, a = rfOGscr(h.cx, h.cy), b = rfOGscr(h.cx + step * 0.3, h.cy + step * 0.1);
      rfOGev('mousemove', a, { buttons: 0 }); rfOGev('mousedown', a);
      for (var k = 1; k <= 6; k++) { rfOGev('mousemove', [a[0] + (b[0] - a[0]) * k / 6, a[1] + (b[1] - a[1]) * k / 6]); await rfOGframe(); }
      var s1 = UI.sketchRegionStats(), m1 = rfOGregionMesh(plate);
      assert(UI.App.sketchDragging && s1.fast - s0.fast >= 5 && s1.tri === s0.tri && s1.hidden === 0, 'followed in place: ' + JSON.stringify(s1));
      assert(m1 && rfOGhasVertex(m1, h.cx + h.r, h.cy), 'the fill has the hole where it is now (' + h.cx + ', ' + h.cy + ')');
      near(rfOGmeshArea(m1), area0, 1e-4, 'the triangles cover the same area mid-drag');
      rfOGev('mouseup', b);
      await idle(); await rfOGframe();
      var s2 = UI.sketchRegionStats(), m2 = rfOGregionMesh(plate), regs2 = UI.sketchRegions();
      assert(s2.tri === s1.tri && s2.adopted > s1.adopted, 'the release kept the triangles: ' + JSON.stringify(s2));
      assert(regs2[plate].holes === 40, 'still one plate with 40 holes');
      near(regs2[plate].area, regs[plate].area, 1e-9, 'the region area is unchanged by moving a hole');
      near(rfOGmeshArea(m2), area0, 1e-4, 'the kept triangles cover the region after the release');
      assert(rfOGhasVertex(m2, h.cx + h.r, h.cy), 'the fill has the hole where it was dropped');
      note.push('followed ' + (s1.fast - s0.fast) + ' frames, ' + (s2.tri - s0.tri) + ' triangulations');
      // onto the neighbour: the triangles between them turn over
      var c0 = rfOGscr(h.cx, h.cy), c1 = rfOGscr(f.entities[8].cx - h.r * 0.5, f.entities[8].cy);
      rfOGev('mousemove', c0, { buttons: 0 }); rfOGev('mousedown', c0);
      for (k = 1; k <= 6; k++) { rfOGev('mousemove', [c0[0] + (c1[0] - c0[0]) * k / 6, c0[1] + (c1[1] - c0[1]) * k / 6], { mods: { ctrlKey: true } }); await rfOGframe(); }
      var s3 = UI.sketchRegionStats();
      assert(s3.hidden >= 1 && !rfOGregionMesh(plate), 'the plate region is not drawn while it cannot be followed: ' + JSON.stringify(s3));
      rfOGev('mouseup', c1, { mods: { ctrlKey: true } });
      await idle(); await rfOGframe();
      assert(!UI.App.sketchDragging && UI.sketchRegionStats().dragging === false, 'the release works the regions out in full again');
      assert(UI.groups.sketches.children.some(function (o) { return o.userData && o.userData.sketchRegion != null; }), 'regions are drawn again after the release');
      note.push('hidden while overlapping: ' + s3.hidden);
    } finally { await rfOGleave(); }
    return note.join('; ');
  });

  step('rfOG: a drag carried over the edge of the graphics area keeps following and ends on the release out there (one undo step); Esc during a drag puts the geometry and the relations back as they were, leaves no undo step, and the release after it does nothing', async function () {
    var f = await rfOGsketch(4, 2), e = f.entities[4];
    try {
      var p0 = rfOGscr(2, 14), u0 = UI.App.undo.length, before = JSON.stringify([f.entities, f.rels, f.dims]);
      rfOGev('mousemove', p0, { buttons: 0 }); rfOGev('mousedown', p0);
      rfOGev('mousemove', [p0[0] - 30, p0[1] + 10]); await rfOGframe();
      var out = [-140, p0[1] + 25], uvOut = rfOGuv(out);
      rfOGev('mousemove', [-60, p0[1] + 20]); await rfOGframe();
      rfOGev('mousemove', out); await rfOGframe();
      near(e.x1, uvOut[0], 1e-9, 'outside the graphics area the end still follows (x)'); near(e.y1, uvOut[1], 1e-9, 'outside the graphics area the end still follows (y)');
      assert(UI.App.sketchDragging, 'still dragging outside');
      rfOGev('mouseup', out);
      await idle(); await rfOGframe();
      assert(!UI.App.sketchDragging && !$('viewport').classList.contains('tool-grab'), 'the release outside ended the drag');
      near(e.x1, uvOut[0], 1e-9, 'dropped where it was released');
      assert(UI.App.undo.length === u0 + 1, 'one undo step: ' + (UI.App.undo.length - u0));
      await UI.undo(); await idle();
      f = UI.activeSketchFeature(); e = f.entities[4];
      assert(JSON.stringify([f.entities, f.rels, f.dims]) === before, 'Ctrl+Z puts the sketch back');
      // Esc mid-drag
      var u1 = UI.App.undo.length;
      rfOGev('mousemove', p0, { buttons: 0 }); rfOGev('mousedown', p0);
      for (var k = 1; k <= 4; k++) { rfOGev('mousemove', [p0[0] + 12 * k, p0[1] - 9 * k]); await rfOGframe(); }
      assert(UI.App.sketchDragging && Math.abs(e.x1 - 2) > 0.1, 'the end is being dragged: ' + e.x1);
      selKey('Escape');
      await rfOGframe();
      assert(!UI.App.sketchDragging && !$('viewport').classList.contains('tool-grab'), 'Esc ended the drag');
      assert(JSON.stringify([f.entities, f.rels, f.dims]) === before, 'Esc put everything back: ' + JSON.stringify(f.entities[4]));
      assert(UI.App.undo.length === u1, 'no undo step left by the cancelled drag: ' + (UI.App.undo.length - u1));
      assert(UI.App.mode === 'sketch' && UI.App.tool === 'select', 'the sketch stays open with the Select tool');
      rfOGev('mousemove', [p0[0] + 60, p0[1] - 45]); await rfOGframe();
      rfOGev('mouseup', [p0[0] + 60, p0[1] - 45]);
      await idle(); await rfOGframe();
      assert(JSON.stringify([f.entities, f.rels, f.dims]) === before && UI.App.undo.length === u1, 'the move and the release after Esc change nothing');
    } finally { await rfOGleave(); }
    return 'followed to x ' + (-140) + ' px, Esc restored';
  });

  step('rfOG: a dimension text dragged to another place is drawn there by the frame that follows the move (its own animation frame ran after the render: a frame late)', async function () {
    var f = await rfOGsketch(4, 2);
    try {
      UI.drawDims(true);
      var t = Array.prototype.filter.call($('dim-layer').querySelectorAll('text'), function (x) { return x._d && !x._d.temp && x._d.index === 0; })[0];
      assert(t, 'the plate width dimension has a label');
      var r = t.getBoundingClientRect(), p = [r.left + r.width / 2 - rfOGrect.left, r.top + r.height / 2 - rfOGrect.top], off0 = f.dims[0].off;
      rfOGev('mousedown', p, { target: t });
      for (var k = 1; k <= 5; k++) {
        var was = f.dims[0].off;
        rfOGev('mousemove', [p[0] + 3 * k, p[1] + 9 * k]);
        await rfOGframe();
        assert(f.dims[0].off !== was, 'move ' + k + ': the dimension moved (' + was + ')');
        assert(!UI.App.dimsStale, 'move ' + k + ': the dimension layer was drawn in the frame after the move');
      }
      rfOGev('mouseup', [p[0] + 15, p[1] + 45]);
      await idle();
      assert(Math.abs(f.dims[0].off - off0) > 0.2, 'the dimension line moved: ' + off0 + ' -> ' + f.dims[0].off);
    } finally { await rfOGleave(); }
    return 'drawn in the frame of each move';
  });

  step('rfOG: the edge under the cursor on a perforated part is found from the cursor\'s cell of a grid kept for the view (it asked every edge of the part on every move): the same edge as the scan at 400 places, one grid per view, none while the view changes on every pick', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\nvar s = p.sketch("Top").rect(0, -12, 24, 12);\nfor (var j = 0; j < 6; j++) for (var i = 0; i < 10; i++) s.circle(2 + 2.2 * i, -(1.5 + 1.8 * j), 0.4);\ns.end().extrude(0.25);\n');
    await idle();
    UI.setView('iso'); UI.zoomToFit();
    for (var w = 0; w < 80 && UI.viewAnimating && UI.viewAnimating(); w++) await wait(25);
    await idle(); await rfOGframe(); await rfOGframe();
    try {
      assert(UI.App.edges.length >= 2000, 'a part with many edges: ' + UI.App.edges.length);
      var pts = [], x, y, k, built0 = UI.edgeGridStats.built;
      for (y = 0; y < 16; y++) for (x = 0; x < 25; x++) pts.push([30 + x * (UI.size.w - 60) / 24, 30 + y * (UI.size.h - 60) / 15]);
      // on the lines themselves too: along the screen image of some edges
      UI.App.edges.filter(function (e, i) { return i % 97 === 0; }).forEach(function (e) { var a = UI.worldToScreen(e.a), b = UI.worldToScreen(e.b); pts.push([(a[0] + b[0]) / 2 + 1.5, (a[1] + b[1]) / 2 - 1]); });
      function all() { return pts.map(function (p) { var h = UI.pickEdge(p[0], p[1]); return h ? h.index : -1; }); }
      UI.pickEdge(pts[0][0], pts[0][1]);   // the first pick of a view scans
      var t0 = performance.now(), fast = all(), tFast = performance.now() - t0;
      assert(UI.edgeGridStats.built === built0 + 1, 'one grid for ' + pts.length + ' picks in one view: ' + (UI.edgeGridStats.built - built0));
      UI.modelPickGrid = false;
      t0 = performance.now();
      var plain = all(), tPlain = performance.now() - t0, diff = 0;
      delete UI.modelPickGrid;
      fast.forEach(function (v, i) { if (v !== plain[i]) diff++; });
      assert(diff === 0, diff + ' of ' + pts.length + ' picks differ from the scan');
      assert(fast.filter(function (v) { return v >= 0; }).length >= 40, 'edges were under the cursor at ' + fast.filter(function (v) { return v >= 0; }).length + ' places');
      // a view that changes before every pick: no grid is made
      var b1 = UI.edgeGridStats.built;
      for (k = 0; k < 6; k++) { UI.panView(3, 0); UI.pickEdge(pts[40][0], pts[40][1]); }
      assert(UI.edgeGridStats.built === b1, 'grids made while the view moved: ' + (UI.edgeGridStats.built - b1));
      return pts.length + ' picks: ' + tFast.toFixed(1) + ' ms with the grid, ' + tPlain.toFixed(1) + ' ms scanning ' + UI.App.edges.length + ' edges';
    } finally { delete UI.modelPickGrid; await anvil.newPart(); await idle(); }
  });

  step('rfOG: times, with bounds three times a quiet run of this PC and more: on a 200-hole plate a drag move (solve + redraw) and the frame after it, a hover move, a frame of a view drag; on a 1,600-hole plate a drag frame (650 ms before: the regions were triangulated again) and a hover move (13 ms before)', async function () {
    async function times(cols, rows) {
      var f = await rfOGsketch(cols, rows), h = f.entities[7], a = rfOGscr(h.cx, h.cy), mv = [], fr = [], hv = [], vw = [], k, t0;
      rfOGev('mousemove', a, { buttons: 0 }); rfOGev('mousedown', a);
      rfOGev('mousemove', [a[0] + 5, a[1] + 5]); await rfOGframe();
      for (k = 1; k <= 12; k++) {
        t0 = performance.now(); rfOGev('mousemove', [a[0] + 5 + k, a[1] + 5 - k]); mv.push(performance.now() - t0);
        t0 = performance.now(); UI.tick(); fr.push(performance.now() - t0);
        await rfOGframe();
      }
      rfOGev('mouseup', [a[0] + 17, a[1] - 7]);
      await idle(); await rfOGframe();
      var o = rfOGscr(3, 3);
      rfOGev('mousemove', o, { buttons: 0 }); await rfOGframe();
      for (k = 1; k <= 30; k++) { t0 = performance.now(); rfOGev('mousemove', [o[0] + 11 * k, o[1] + 5 * k], { buttons: 0 }); hv.push(performance.now() - t0); }
      var mid = [UI.size.w / 2, UI.size.h / 2];
      rfOGev('mousedown', mid, { button: 1, buttons: 4 });
      for (k = 1; k <= 10; k++) { rfOGev('mousemove', [mid[0] + 6 * k, mid[1] + 2 * k], { button: 1, buttons: 4 }); t0 = performance.now(); UI.tick(); vw.push(performance.now() - t0); await rfOGframe(); }
      rfOGev('mouseup', [mid[0] + 60, mid[1] + 20], { button: 1 });
      UI.setView('front');
      return { n: f.entities.length, move: rfOGmedian(mv), frame: rfOGmedian(fr), hover: rfOGmedian(hv), view: rfOGmedian(vw) };
    }
    var a, b;
    try { a = await times(20, 10); b = await times(50, 32); } finally { await rfOGleave(); }
    function ms(x) { return x.toFixed(1); }
    var txt = a.n + ' entities: drag move ' + ms(a.move) + ' + frame ' + ms(a.frame) + ' ms, hover ' + ms(a.hover) + ' ms, view frame ' + ms(a.view) + ' ms; ' + b.n + ' entities: drag move ' + ms(b.move) + ' + frame ' + ms(b.frame) + ' ms, hover ' + ms(b.hover) + ' ms, view frame ' + ms(b.view) + ' ms';
    assert(a.move + a.frame < 60, 'drag at ' + a.n + ' entities: ' + txt);
    assert(a.hover < 6 && a.view < 40, 'hover / view at ' + a.n + ' entities: ' + txt);
    assert(b.move + b.frame < 300, 'drag at ' + b.n + ' entities: ' + txt);
    assert(b.hover < 15 && b.view < 150, 'hover / view at ' + b.n + ' entities: ' + txt);
    return txt;
  });
