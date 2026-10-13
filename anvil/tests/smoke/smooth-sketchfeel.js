  // --- smooth/sketchfeel ---
  function sfLayer() { return D.querySelector('#dim-layer .sk-feedback'); }
  function sfRels() { return (UI.activeSketchFeature().rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }); }
  // the grid is (re)drawn by the render loop: wait for it (animation frames are slow in a background tab)
  async function sfGridLines(want) { for (var i = 0; i < 80 && (UI.groups.grid.children.length > 0) !== want; i++) await wait(25); return UI.groups.grid.children.length; }
  step('smooth/sketchfeel: no grid in a sketch — none drawn, a point lands where it is clicked (within a pixel, a tidy value), not on a 4 mm snap grid; the Line tool shows L / A by the cursor with the Horizontal glyph and infers Horizontal', async function () {
    await rskNew();
    assert(UI.App.view.showGrid === false, 'the grid is off by default');
    var gl = await sfGridLines(false);
    assert(gl === 0, 'grid lines drawn: ' + gl);
    var px = UI.cam.scale;   // 0.25 mm per pixel (the old snap grid here was 4 mm)
    UI.setTool('point'); rskClick([13.7, 7.3]);
    var pt = rskEnts()[0];
    assert(pt && pt.t === 'point' && Math.abs(pt.x - 13.7) <= px && Math.abs(pt.y - 7.3) <= px, 'point not where clicked: ' + JSON.stringify(pt));
    assert(String(pt.x).length <= 5 && String(pt.y).length <= 5, 'untidy value: ' + JSON.stringify(pt));
    UI.setTool('line'); rskClick([0, -10]);
    selEv('mousemove', rskScr([23.4, -10.6]));
    var t = sfLayer() && sfLayer().querySelector('text');
    assert(t && /^L 23(\.\d+)? +A (0|360)°$/.test(t.textContent), 'readout: ' + (t && t.textContent));
    assert(sfLayer().querySelectorAll('.rel-badge.infer').length >= 1 && (UI.App.inferPreview || []).some(function (c) { return c.type === 'horizontal'; }), 'Horizontal glyph by the cursor');
    rskClick([23.4, -10.6]);
    var l = rskEnts()[1];
    assert(l.y1 === -10 && l.y2 === -10 && Math.abs(l.x2 - 23.4) <= px, 'line ' + JSON.stringify(l));
    assert(sfRels().indexOf('horizontal:1') >= 0, 'relations ' + sfRels().join(' '));
    selKey('Escape');
    return 'point (' + pt.x + ', ' + pt.y + '), line to x ' + l.x2;
  });
  step('smooth/sketchfeel: inference — near a line\'s midpoint the click takes it exactly (orange ring, Midpoint relation); a point the cursor passed over draws a dotted inference line and lines the next click up with it; the Sketch Grid option brings grid snapping back', async function () {
    var px = UI.cam.scale, l = rskEnts()[1], mid = [(l.x1 + l.x2) / 2, -10];
    UI.setTool('line');
    selEv('mousemove', rskScr([mid[0] + 1.2 * px, mid[1] + 1.4 * px]));
    assert(sfLayer().querySelector('circle'), 'no snap ring on the midpoint');
    rskClick([mid[0] + 1.2 * px, mid[1] + 1.4 * px]);
    var start = UI.App.toolState.pts[0];
    assert(start && start[0] === mid[0] && start[1] === mid[1], 'midpoint taken exactly: ' + JSON.stringify(start));
    // wake the line's end point by passing over it, then click below it, 4 px to the side: x lines up exactly
    selEv('mousemove', rskScr([l.x2, l.y2]));
    selEv('mousemove', rskScr([l.x2 + 4 * px, 12]));
    var dotted = Array.prototype.some.call(sfLayer().querySelectorAll('line'), function (x) { return /dasharray/.test(x.getAttribute('style') || ''); });
    assert(dotted, 'no dotted inference line');
    rskClick([l.x2 + 4 * px, 12]);
    var n = rskEnts()[2];
    assert(n && n.x1 === mid[0] && n.x2 === l.x2 && Math.abs(n.y2 - 12) <= px, 'aligned end ' + JSON.stringify(n));
    assert(sfRels().indexOf('midpoint:2.p1,1') >= 0, 'relations ' + sfRels().join(' '));
    selKey('Escape');
    // the grid as an option (View > Sketch Grid): shown and snapped to while on
    UI.App.view.showGrid = true; UI.App.gridStale = true;
    assert(await sfGridLines(true) > 0, 'grid not drawn when switched on');
    var step = UI.snapStep();
    UI.setTool('point'); rskClick([-13.7, 27.3]);
    var g = rskEnts()[3];
    near(g.x / step, Math.round(g.x / step), 1e-9, 'x on the grid (step ' + step + ')'); near(g.y / step, Math.round(g.y / step), 1e-9, 'y on the grid');
    UI.App.view.showGrid = false; UI.App.gridStale = true; selKey('Escape');
    assert(await sfGridLines(false) === 0, 'grid still drawn');
    return 'midpoint ' + mid[0] + ', aligned x ' + n.x2 + ', grid point ' + g.x + ', ' + g.y;
  });
  step('smooth/sketchfeel: click-drag with the Line tool draws a line (press = start, release = end) instead of rotating the view; dragging a free end point onto another end point merges them (Coincident); the Select tool pre-highlights what is under the cursor', async function () {
    await rskNew();
    var view = JSON.stringify([UI.cam.right, UI.cam.up]);
    UI.setTool('line');
    await selDrag(rskScr([0, 0]), rskScr([30, 0.2]));
    var e = rskEnts();
    assert(e.length === 1 && e[0].x1 === 0 && e[0].y1 === 0 && e[0].y2 === 0 && Math.abs(e[0].x2 - 30) <= UI.cam.scale, 'dragged line ' + JSON.stringify(e));
    assert(JSON.stringify([UI.cam.right, UI.cam.up]) === view, 'the view rotated');
    assert(!UI.App.toolState.pts.length && UI.App.tool === 'line', 'a dragged line starts no chain');
    await selDrag(rskScr([10, 20]), rskScr([25, 30]));
    assert(rskEnts().length === 2, 'second line');
    selKey('Escape');
    var a = rskEnts()[0];
    await selDrag(rskScr([25, 30]), rskScr([a.x2 + 0.5, 1]));
    e = rskEnts();
    assert(Math.abs(e[1].x2 - e[0].x2) < 1e-9 && Math.abs(e[1].y2) < 1e-9 && Math.abs(e[0].x2 - a.x2) < 1e-6, 'end point dropped on the other end: ' + JSON.stringify(e));
    assert(sfRels().indexOf('coincident:1.p2,0.p2') >= 0, 'Coincident added: ' + sfRels().join(' '));
    selEv('mousemove', rskScr([15, 0]));
    assert(sfLayer().querySelector('polyline'), 'no pre-highlight under the cursor');
    return 'merged at (' + e[1].x2 + ', ' + e[1].y2 + ')';
  });
  // --- end smooth/sketchfeel ---

