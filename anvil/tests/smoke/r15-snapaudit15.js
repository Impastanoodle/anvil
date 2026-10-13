  // --- r15/snapaudit15: snapping and inference integrity (ui-sketch.js inferPoint, sketch-solver.js inferCandidates,
  // ui-relations.js drag / drop merge, ui-select.js box selection). A step named "(known: …)" pins down a defect that
  // lives in ui-sketch.js / sketch-solver.js / ui-core.js and is still open: it asserts today's wrong behaviour so the
  // run stays green, and is flipped when the defect is fixed.
  function saAdd(list) { var f = UI.activeSketchFeature(); list.forEach(function (e) { f.entities.push(e); }); UI.updateSketches(); }
  // where the drawing tool would put its next point for the cursor at screen point s (no click)
  function saInfer(s) { return UI.sketchInferPoint(UI.screenToPlane(s[0], s[1], UI.activePlane()), s[0], s[1]); }
  function saSnapMark() { return !!(sfLayer() && sfLayer().querySelector('circle')); }
  // pan so that sketch point uv sits at screen fraction (fx, fy) of the graphics area
  function saPanTo(uv, fx, fy) { var s = rskScr(uv); UI.panView(UI.size.w * fx - s[0], UI.size.h * fy - s[1]); UI.updateSketches(); }
  // a point on circle (0, 0, r) half way between two vertices of its model polygon (Kernel.entityPolylines), where the
  // model's chord lies furthest inside the drawn curve
  function saBetweenFacets(e) {
    var p = K.entityPolylines(e)[0].pts, a = (Math.atan2(p[0][1], p[0][0]) + Math.atan2(p[1][1], p[1][0])) / 2;
    return { uv: [e.cx + e.r * Math.cos(a), e.cy + e.r * Math.sin(a)], sag: e.r * (1 - Math.cos((Math.atan2(p[1][1], p[1][0]) - Math.atan2(p[0][1], p[0][0])) / 2)) };
  }
  step('r15/snapaudit15: inference tolerances are screen pixels at every zoom (0.02, 0.25, 4 mm per pixel) — a point snaps at 8.5 px, not 9.5; a line at 6.5 px, not 7.5; the click 6 px off the line lands exactly on it with a Coincident, 8 px off adds none', async function () {
    var zooms = [0.02, 0.25, 4], out = [];
    for (var zi = 0; zi < zooms.length; zi++) {
      var s = zooms[zi];
      await rskNew();
      UI.zoomView(s / UI.cam.scale);
      saPanTo([0, 0], 0.2, 0.7);
      near(UI.cam.scale, s, s * 1e-9, 'zoom');
      saAdd([{ t: 'line', x1: 50 * s, y1: 40 * s, x2: 250 * s, y2: 40 * s }]);   // 200 px long, 40 px above the origin
      UI.setTool('line');
      var P = rskScr([50 * s, 40 * s]), M = rskScr([170 * s, 40 * s]), M2 = rskScr([215 * s, 40 * s]);
      var a = saInfer([P[0] - 8.5, P[1]]), b = saInfer([P[0] - 9.5, P[1]]);
      assert(a.snap && a.snap.kind === 'end' && a.p[0] === 50 * s && a.p[1] === 40 * s, 'zoom ' + s + ': 8.5 px from the end: ' + JSON.stringify(a.snap));
      assert(!b.snap, 'zoom ' + s + ': 9.5 px from the end snapped: ' + JSON.stringify(b.snap));
      var c = saInfer([M[0], M[1] + 6.5]), d = saInfer([M[0], M[1] + 7.5]);
      assert(c.snap && c.snap.kind === 'on' && c.p[1] === 40 * s, 'zoom ' + s + ': 6.5 px from the line: ' + JSON.stringify(c.snap));
      assert(!d.snap && Math.abs(d.p[1] - 40 * s) > 7 * s, 'zoom ' + s + ': 7.5 px from the line snapped: ' + JSON.stringify(d));
      selClick([M[0], M[1] + 6]); selClick([M[0] + 60, M[1] + 80]); selKey('Escape');
      UI.setTool('line'); selClick([M2[0], M2[1] + 8]); selClick([M2[0] + 60, M2[1] + 80]); selKey('Escape'); selKey('Escape');
      var e = rskEnts(), rl = sfRels();
      assert(e.length === 3 && e[1].y1 === 40 * s, 'zoom ' + s + ': the 6 px click lands on the line: ' + JSON.stringify(e[1]));
      assert(rl.indexOf('coincident:1.p1,0') >= 0, 'zoom ' + s + ': Coincident missing: ' + rl.join(' '));
      assert(!rl.some(function (r) { return /2\.p1/.test(r); }) && Math.abs(e[2].y1 - 40 * s) > 7 * s, 'zoom ' + s + ': the 8 px click inferred: ' + rl.join(' ') + ' ' + JSON.stringify(e[2]));
      out.push(s + ': ok');
    }
    return out.join(', ');
  });
  step('r15/snapaudit15: Smart Dimension placement is zoom-independent — the label snaps to the middle within 10 px (not at 11) and the horizontal / vertical / aligned choice for two points follows the cursor region at 0.02 and 4 mm per pixel', async function () {
    var out = [], zooms = [0.02, 4];
    for (var zi = 0; zi < zooms.length; zi++) {
      var s = zooms[zi];
      await rskNew();
      UI.zoomView(s / UI.cam.scale);
      assert(UI.dimTextAlong([20 * s + 9.5 * s, 3 * s], [0, 0], [1, 0], 40 * s) === null, 'zoom ' + s + ': 9.5 px from the middle is not centred');
      assert(UI.dimTextAlong([20 * s + 10.5 * s, 3 * s], [0, 0], [1, 0], 40 * s) !== null, 'zoom ' + s + ': 10.5 px from the middle is centred');
      saAdd([{ t: 'point', x: 0, y: 0 }, { t: 'point', x: 40 * s, y: 20 * s }]);
      var f = UI.activeSketchFeature(), rel = UI.relDimFor(f, '0', '1');
      var dirs = [[20, 60], [80, 10], [80, 60]].map(function (q) { return UI.relDimPlacement(f, rel, [q[0] * s, q[1] * s]).dir || 'aligned'; }).join(' ');
      assert(dirs === 'h v aligned', 'zoom ' + s + ': above / beside / elsewhere: ' + dirs);
      out.push(s + ': ' + dirs);
    }
    return out.join('; ');
  });
  step('r15/snapaudit15: drag and drop merge — an end dragged slowly 2 px along a line keeps its drop snap every frame and merges (Coincident); dropped on a line\'s midpoint it merges with Midpoint; a drop that would over-define is refused with a status message and the point stays; one undo step per drag', async function () {
    await rskNew();
    var px = UI.cam.scale;
    saAdd([{ t: 'line', x1: 5, y1: 30, x2: 20, y2: 40 }, { t: 'line', x1: 0, y1: 10, x2: 40, y2: 10 }]);
    UI.setTool('select');
    var from = rskScr([20, 40]), T = rskScr([13, 10]), S0 = [T[0], T[1] - 6], seq = [], u0 = UI.App.undo.length;
    selEv('mousedown', from, $('viewport'));
    for (var k = 1; k <= 4; k++) { selEv('mousemove', [from[0] + (S0[0] - from[0]) * k / 4, from[1] + (S0[1] - from[1]) * k / 4]); await wait(70); }
    for (var j = 0; j < 10; j++) { selEv('mousemove', [S0[0] + j, S0[1] + Math.min(j, 4)]); await wait(70); seq.push(saSnapMark() ? 'S' : '-'); }
    selEv('mouseup', [S0[0] + 9, S0[1] + 4]); await idle(); await wait(20);
    assert(seq.join('') === 'SSSSSSSSSS', 'the drop snap blinked: ' + seq.join(''));
    assert(sfRels().indexOf('coincident:0.p2,1') >= 0 && Math.abs(rskEnts()[0].y2 - 10) < 1e-9, 'merged onto the line: ' + sfRels().join(' ') + ' ' + JSON.stringify(rskEnts()[0]));
    assert(UI.App.undo.length === u0 + 1, 'one undo step for the drag: ' + (UI.App.undo.length - u0));
    // the free end onto the line's midpoint (20, 10), 3 px off it: Midpoint
    await selDrag(rskScr([5, 30]), rskScr([20 + 3 * px, 10 + 2 * px]));
    var e0 = rskEnts()[0];
    assert(sfRels().indexOf('midpoint:0.p1,1') >= 0 && Math.abs(e0.x1 - 20) < 1e-9 && Math.abs(e0.y1 - 10) < 1e-9, 'Midpoint drop: ' + sfRels().join(' ') + ' ' + JSON.stringify(e0));
    assert(/Midpoint with Line2 added/.test(statusText()), 'status: ' + statusText());
    // a point on the line, dropped on the line's end: Coincident would repeat "on the line" (redundant): refused
    UI.setTool('point'); rskClick([30, 10]); selKey('Escape');
    assert(sfRels().indexOf('coincident:2,1') >= 0, 'the point is on the line: ' + sfRels().join(' '));
    var n0 = sfRels().length;
    await selDrag(rskScr([30, 10]), rskScr([40 + 2 * px, 10 + 2 * px]));
    var pt = rskEnts()[2], l1 = rskEnts()[1];
    assert(sfRels().length === n0, 'a relation was added: ' + sfRels().join(' '));
    assert(/not added: it would over-define the sketch/.test(statusText()), 'status: ' + statusText());
    assert(Math.abs(pt.x - l1.x2) < 1e-6 && Math.abs(pt.y - l1.y2) < 1e-6, 'the point stays where it was dropped: ' + JSON.stringify(pt) + ' ' + JSON.stringify(l1));
    return 'snap ' + seq.join('') + '; ' + sfRels().join(' ');
  });
  step('r15/snapaudit15: box selection at a deep zoom (0.004 mm per pixel) — a crossing box over the drawn arc of a Ø20 circle, between two of its model facets, selects it', async function () {
    await rskNew();
    var c = { t: 'circle', cx: 0, cy: 0, r: 10 };
    saAdd([c]);
    var bf = saBetweenFacets(c);
    UI.zoomView(0.004 / UI.cam.scale); saPanTo(bf.uv, 0.5, 0.5);
    assert(bf.sag / UI.cam.scale > 8, 'the model facet is only ' + (bf.sag / UI.cam.scale) + ' px inside');
    UI.setTool('select');
    var s = rskScr(bf.uv);
    await selDrag([s[0] + 20, s[1] - 10], [s[0] - 3, s[1] + 10]);   // right to left: crossing, 3 px past the drawn curve
    var sel = anvil.selection();
    assert(sel.length === 1 && sel[0].kind === 'entity' && sel[0].index === 0, 'selected ' + JSON.stringify(sel));
    return 'facet ' + fmt(bf.sag / UI.cam.scale) + ' px inside the drawn circle; selected';
  });
  step('r15/snapaudit15: 2 px off a line or off a Corner Rectangle edge the Line tool snaps onto it (on-curve ring)', async function () {
    await rskNew();
    var px = UI.cam.scale;
    saAdd([{ t: 'rect', x: 0, y: 0, w: 20, h: 10 }, { t: 'line', x1: 0, y1: -10, x2: 20, y2: -10 }]);
    UI.setTool('line');
    var onLine = saInfer(rskScr([7.3, -10 - 2 * px])), onEdge = saInfer(rskScr([7.3, 10 + 2 * px]));
    selKey('Escape');
    assert(onLine.snap && onLine.snap.kind === 'on', 'line: ' + JSON.stringify(onLine.snap));
    assert(onEdge.snap && onEdge.snap.kind === 'on' && Math.abs(onEdge.p[1] - 10) < 1e-9, 'rectangle edge: ' + JSON.stringify(onEdge));
    return 'line and rectangle edge both snap (on)';
  });
  step('r15/snapaudit15: woken points go with their entity — after Undo removes a line whose end the cursor passed over, the Line tool no longer lines up with the deleted end', async function () {
    await rskNew();
    var px = UI.cam.scale;
    UI.setTool('line'); rskClick([10, 10]); rskClick([30, 10]); selKey('Escape'); selKey('Escape');
    UI.setTool('line');
    selEv('mousemove', rskScr([30, 10]));   // wakes the end
    var before = saInfer(rskScr([30 + 3 * px, -15]));
    assert(before.align.some(function (al) { return al.axis === 'x' && al.from[0] === 30; }), 'not aligned with the woken end: ' + JSON.stringify(before.align));
    await UI.undo(); await idle();
    assert(rskEnts().length === 0, 'undo left ' + rskEnts().length);
    UI.setTool('line');
    var after = saInfer(rskScr([30 + 3 * px, -15]));
    selKey('Escape');
    assert(!after.align.some(function (al) { return al.from[0] === 30 && al.from[1] === 10; }), 'still aligned with the deleted end: ' + JSON.stringify(after.align));
    return 'not aligned with the deleted end (30, 10) after Undo';
  });
  step('r15/snapaudit15: a tool\'s point cannot land on one it already placed — a Centerpoint Arc ended on its own centre and a slot\'s width point on its first centre are refused (no 360° arc, no 0.01-wide slot)', async function () {
    await rskNew();
    var px = UI.cam.scale;
    UI.setTool('arc'); rskClick([10, 10]); rskClick([20, 10]); rskClick([10 + 2 * px, 10 + px]); selKey('Escape');
    UI.setTool('slot'); rskClick([30, 0]); rskClick([50, 0]); rskClick([30 + 2 * px, px]); selKey('Escape'); selKey('Escape');
    var e = rskEnts();
    assert(e.length === 0, 'the collapsing clicks were refused: ' + JSON.stringify(e));
    assert(/already part of the entity/.test(statusText()), 'status says why: ' + statusText());
    return 'both clicks refused, nothing drawn';
  });
  step('r15/snapaudit15: UI.pickEntity tests the curve as drawn — at 0.004 mm per pixel a click on a Ø20 circle between two model facets selects it, as the Line tool snaps onto it', async function () {
    await rskNew();
    var c = { t: 'circle', cx: 0, cy: 0, r: 10 };
    saAdd([c]);
    var bf = saBetweenFacets(c);
    UI.zoomView(0.004 / UI.cam.scale); saPanTo(bf.uv, 0.5, 0.5);
    var s = rskScr(bf.uv);
    UI.setTool('line');
    var inf = saInfer(s);
    selKey('Escape');
    assert(inf.snap && inf.snap.kind === 'on', 'the Line tool does not snap: ' + JSON.stringify(inf.snap));
    var pk = UI.pickEntity(s[0], s[1]);
    assert(pk && pk.index === 0 && UI.pickSketchRef(s[0], s[1]) !== null, 'picked ' + JSON.stringify(pk));
    return 'facet ' + fmt(bf.sag / UI.cam.scale) + ' px inside: the circle is picked';
  });
  step('r15/snapaudit15: two segments placed by typed values are two undo steps — L 20 Enter, L 15 Enter draw exactly 20 and 15 with Horizontal / Vertical kept, and one Ctrl+Z removes only the last', async function () {
    await rskNew();
    function typeLen(v) {
      selKey(v[0]);
      var inp = UI.sketchNumBox()[0];
      inp.value = v; inp.dispatchEvent(new W.Event('input', { bubbles: true }));
      inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    }
    UI.setTool('line'); rskClick([0, 10]);
    var u0 = UI.App.undo.length;
    selEv('mousemove', rskScr([20, 10.1])); typeLen('20');
    selEv('mousemove', rskScr([20.1, 30])); typeLen('15');
    selKey('Escape'); selKey('Escape');
    var e = rskEnts(), rl = sfRels();
    assert(e.length === 2 && e[0].x2 === 20 && e[0].y2 === 10 && e[1].x2 === 20 && e[1].y2 === 25, 'typed values: ' + JSON.stringify(e));
    assert(rl.indexOf('horizontal:0') >= 0 && rl.indexOf('vertical:1') >= 0, 'direction locks: ' + rl.join(' '));
    assert(UI.App.undo.length - u0 === 2, 'undo steps ' + (UI.App.undo.length - u0));
    await UI.undo(); await idle();
    assert(rskEnts().length === 1, 'one Ctrl+Z removed ' + (2 - rskEnts().length) + ' segment(s)');
    return 'two typed segments, two undo steps';
  });
  step('r15/snapaudit15: grid rounding that lands on geometry shows the snap — with View ▸ Sketch Grid on, a point clicked 7.6 px from a line rounds onto it with the on-curve ring and gets its Coincident', async function () {
    await rskNew();
    saAdd([{ t: 'line', x1: -50, y1: 0, x2: 50, y2: 0 }]);
    UI.App.view.showGrid = true; UI.App.gridStale = true;
    try {
      var st = UI.snapStep(), q = [st, 7.6 * UI.cam.scale];
      assert(q[1] < st / 2, 'step ' + st);
      UI.setTool('point');
      var inf = saInfer(rskScr(q));
      assert(inf.snap && inf.snap.kind === 'on' && inf.p[1] === 0, 'grid point on the line, shown as a snap: ' + JSON.stringify(inf));
      rskClick(q); selKey('Escape');
      assert(rskEnts()[1].y === 0 && sfRels().indexOf('coincident:1,0') >= 0, sfRels().join(' '));
    } finally { UI.App.view.showGrid = false; UI.App.gridStale = true; }
    return 'snap shown, Coincident added';
  });
  step('r15/snapaudit15: centre snaps add what they promise — a line end on a Polygon centre gets Coincident (a sketch point), a Corner Rectangle centre is no snap and gets nothing, and on a circle centre the glyph says Coincident', async function () {
    await rskNew();
    saAdd([{ t: 'poly', cx: 20, cy: 20, r: 8, n: 6, rot: 0 }, { t: 'circle', cx: -20, cy: 20, r: 6 }, { t: 'rect', x: -40, y: -30, w: 20, h: 10 }]);
    UI.setTool('line'); rskClick([0, 0]);
    var sp = saInfer(rskScr([20, 20]));
    assert(sp.snap && sp.snap.kind === 'center', 'polygon centre snap: ' + JSON.stringify(sp.snap));
    rskClick([20, 20]);
    selEv('mousemove', rskScr([-20, 20]));
    var glyphs = Array.prototype.map.call(sfLayer().querySelectorAll('use'), function (n) { return n.getAttribute('href'); }).join(' ');
    rskClick([-20, 20]); rskClick([-30, -25]); selKey('Escape'); selKey('Escape');
    var rl = sfRels();
    assert(rl.some(function (r) { return /^coincident/.test(r) && /(^|,)0\.c\b/.test(r.split(':')[1]); }), 'polygon centre Coincident: ' + rl.join(' '));
    assert(!rl.some(function (r) { return /(^|,)2\.c\b/.test(r.split(':')[1]); }) && ((saInfer(rskScr([-30, -25])).snap || {}).kind || '') !== 'center', 'rectangle centre: no relation, not a centre snap (the drawn line\'s end is there now): ' + rl.join(' '));
    assert(/relCoincident/.test(glyphs) && !/relConcentric/.test(glyphs) && rl.indexOf('coincident:4.p2,1.c') >= 0 && !rl.some(function (r) { return /^concentric/.test(r); }), 'circle centre glyphs ' + glyphs + ' / ' + rl.join(' '));
    return rl.join(' ');
  });
  step('r15/tanslide15: a Line started on a circle (not at one of its points) slides tangent to it like Mastercam\'s Line Endpoints with Tangent — the start follows the cursor round the circle, the click leaves a line Tangent and Coincident; T draws from the clicked point instead', async function () {
    await rskNew();
    saAdd([{ t: 'circle', cx: 0, cy: 0, r: 10 }]);
    UI.setTool('line'); UI.setLineTangentStart(true);   // rfE: Tangent start is opt-in (T), SolidWorks starts where clicked
    var a = [10 * Math.cos(Math.PI / 6), 10 * Math.sin(Math.PI / 6)];
    var inf = saInfer(rskScr(a));
    assert(inf.snap && inf.snap.kind === 'on' && inf.snap.e === 0, 'first point on the circle: ' + JSON.stringify(inf.snap));
    rskClick(a);
    assert(UI.App.toolState.tanFrom && UI.App.toolState.tanFrom.e === 0, 'tangent-sliding start armed');
    function startFor(q) { selEv('mousemove', rskScr(q)); var t = UI.App.tempEntities[0]; return [t.x1, t.y1]; }
    function tangentAt(T, Q) { return Math.abs(Math.hypot(T[0], T[1]) - 10) < 1e-9 && Math.abs(T[0] * (Q[0] - T[0]) + T[1] * (Q[1] - T[1])) < 1e-6; }
    var T1 = startFor([30, -20]), T2 = startFor([-25, 25]);
    assert(tangentAt(T1, [30, -20]) && tangentAt(T2, [-25, 25]) && Math.hypot(T1[0] - T2[0], T1[1] - T2[1]) > 1, 'the start slid round the circle and stayed tangent: ' + JSON.stringify([T1, T2]));
    rskClick([30, -20]); selKey('Escape');
    var e = rskEnts(), rl = sfRels();
    assert(e.length === 2 && e[1].t === 'line' && tangentAt([e[1].x1, e[1].y1], [30, -20]) && e[1].x2 === 30 && e[1].y2 === -20, 'tangent line placed: ' + JSON.stringify(e[1]));
    assert(rl.indexOf('tangent:1,0') >= 0 && rl.indexOf('coincident:1.p1,0') >= 0, 'Tangent + Coincident: ' + rl.join(' '));
    assert(!UI.App.toolState.tanFrom, 'sliding start cleared after the segment');
    var a2 = [10 * Math.cos(200 * Math.PI / 180), 10 * Math.sin(200 * Math.PI / 180)];   // away from the first line's points (a point snap would win there)
    UI.setTool('line'); rskClick(a2); selKey('t');
    assert(UI.App.toolState.tanFrom && UI.App.toolState.tanFrom.off, 'T turned the tangent slide off: ' + JSON.stringify(UI.App.toolState.tanFrom));
    selEv('mousemove', rskScr([-30, -20]));
    var t0 = UI.App.tempEntities[0], p0 = UI.App.toolState.pts[0];   // the clicked point as snapped onto the circle (a pixel-rounded click)
    assert(Math.abs(t0.x1 - p0[0]) < 1e-9 && Math.abs(t0.y1 - p0[1]) < 1e-9 && Math.abs(Math.hypot(p0[0], p0[1]) - 10) < 1e-9, 'line from the clicked point: ' + JSON.stringify(t0) + ' vs ' + JSON.stringify(p0));
    selKey('Escape'); selKey('Escape'); UI.setLineTangentStart(false);
    return 'start slid from ' + JSON.stringify(T1.map(fmt)) + ' to ' + JSON.stringify(T2.map(fmt)) + '; ' + rl.join(' ');
  });
  step('r15/dblclick15: a double-click ends the Line chain without the stub its second click made (as in SolidWorks) — click, click, then two clicks 2 px apart: the 2 px segment is taken back and the chain ends at the double-click point', async function () {
    await rskNew();
    UI.setTool('line'); rskClick([0, 0]); rskClick([20, 0]);
    var u0 = UI.App.undo.length, p = rskScr([40, 0]);
    selClick(p); selClick([p[0] + 2, p[1]]); selEv('dblclick', [p[0] + 2, p[1]], $('viewport'));
    var e = rskEnts();
    assert(e.length === 2 && e[1].x2 === 40 && e[1].y2 === 0, 'two segments, the chain ends at (40, 0): ' + JSON.stringify(e));
    assert(!UI.App.toolState.pts.length, 'chain ended');
    assert(UI.App.undo.length - u0 <= 1, 'the stub left no undo step of its own (' + (UI.App.undo.length - u0) + ')');
    return 'stub removed, chain ended at (40, 0)';
  });
  step('r15/scalebar15: the scale bar at the bottom right reads the length of its 100 px bar in model units at the current zoom, follows zoom and units, and hides under a drawing', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Top").rect(0, 0, 30, 20).extrude(10);'); await idle();
    var el = D.getElementById('scale-bar');
    assert(el && !el.hidden && el.getBoundingClientRect().width === 100, 'scale bar shown, 100 px wide');
    await wait(400);   // the zoom-to-fit after the run glides; the label is written by the frame after the camera settles
    var sb = UI.scaleBar();
    near(sb.value, 100 * UI.cam.scale, 1e-12, 'value = 100 px × units per px');
    assert(sb.text === UI.fmtNum(sb.value, 2) + ' mm', 'label ' + sb.text);
    UI.zoomView(0.5); await idle(); await wait(400);
    var sb2 = UI.scaleBar();
    near(sb2.value, 100 * UI.cam.scale, 1e-12, 'follows the zoom');
    assert(sb2.text !== sb.text && sb2.text === UI.fmtNum(sb2.value, 2) + ' mm', 'label changed with the zoom: ' + sb.text + ' -> ' + sb2.text);
    UI.App.model.units = 'in'; UI.requestRender && UI.requestRender(); await wait(80); UI.zoomView(1.0000001); await wait(80);
    assert(/ in$/.test(UI.scaleBar().text) && /\.\d{4} in$/.test(UI.scaleBar().text), 'inches with 4 decimals: ' + UI.scaleBar().text);
    UI.App.model.units = 'mm';
    UI.makeDrawing(); await idle(); await wait(120);
    function sbVisible() { var e = D.getElementById('scale-bar'); return !e.hidden && W.getComputedStyle(e).display !== 'none'; }
    assert(!sbVisible(), 'hidden under a drawing');
    anvil.drawing.close(); await idle(); await wait(80);
    assert(sbVisible(), 'back in the part');
    return sb.text + ' -> ' + sb2.text;
  });
  step('r15/inches15: new documents default to inches (IPS) unless Tools ▸ Default units says millimeters — with anvil.units cleared a new part is in inches with IPS in the status bar, Image Quality default 0.002 in and inch PropertyManager defaults (extrude depth 3/8 in); the run itself stays metric', async function () {
    var saved = null; try { saved = W.localStorage.getItem('anvil.units'); } catch (e) { }
    try {
      W.localStorage.removeItem('anvil.units');
      assert(UI.defaultUnits() === 'in', 'default units: ' + UI.defaultUnits());
      await anvil.newPart(); await idle();
      assert(UI.App.model.units === 'in', 'new part units ' + UI.App.model.units);
      assert(/IPS/.test($('status-right').textContent), 'status bar says IPS: ' + $('status-right').textContent);
      var iq = UI.imageQuality();
      near(iq.chordTol, 0.002, 1e-12, 'default chord tolerance in inches'); assert(iq.preset === 'default', 'preset ' + iq.preset);
      assert(UI.lenDefault(10) === 0.375 && UI.lenDefault(2) === 0.0625 && UI.lenDefault(20) === 0.75 && UI.lenDefault(6.6) === 0.25, 'inch defaults ' + [UI.lenDefault(10), UI.lenDefault(2), UI.lenDefault(20), UI.lenDefault(6.6)].join(' '));
      await anvil.run('p.sketch("Top").circle(0, 0, 0.5);'); await idle();
      assert(UI.App.model.units === 'in', 'a script without .units() takes the default: ' + UI.App.model.units);
      UI.cmdExtrude(false); await wait(20);
      assert(UI.pmSpec() && Math.abs(UI.pmSpec().values.depth - 0.375) < 1e-9, 'extrude depth default 3/8 in: ' + (UI.pmSpec() && UI.pmSpec().values.depth));
      UI.pmCancel();
      await anvil.run('p.units("mm"); p.sketch("Top").circle(0, 0, 5);'); await idle();
      assert(UI.App.model.units === 'mm', 'a script\'s own .units("mm") wins: ' + UI.App.model.units);
      UI.setDefaultUnits('mm'); await anvil.newPart(); await idle();
      assert(UI.App.model.units === 'mm' && /MMGS/.test($('status-right').textContent), 'back to mm for the rest of the run');
    } finally { try { W.localStorage.setItem('anvil.units', saved == null ? 'mm' : saved); } catch (e) { } }
    return 'inches by default: IPS, 0.002 in, depth 0.375 in';
  });
  // --- end r15/snapaudit15 ---

