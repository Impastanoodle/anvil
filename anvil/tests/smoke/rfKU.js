  // ---- rfKU (local-2026-11-11a, lane sketchflow): four shop profiles drawn the SolidWorks way with real mouse events
  // (report test-reports/2026-11-11-sketch-flow.md); one step per fix: a line drawn level to an edge ends on it level
  // (Horizontal + Coincident), Mirror Entities with a box-selected slot waits for the centerline click, the doubled
  // (Ø) distance from a centerline, dragging a spline handle, Sketch Text placed by a click before typing, the
  // relation context toolbar
  function rfKUScr(uv) { var p = UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])), r = $('viewport').getBoundingClientRect(); return [Math.round(r.left + p[0]), Math.round(r.top + p[1])]; }
  function rfKUEv(type, c, mods) {
    (type === 'mousedown' ? $('viewport') : W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: c[0], clientY: c[1] }, mods || {})));
  }
  async function rfKUClick(uv, mods) { var c = rfKUScr(uv); rfKUEv('mousemove', c, mods); rfKUEv('mousedown', c, mods); rfKUEv('mouseup', c, mods); await wait(20); }
  async function rfKUDrag(a, b, n) {
    var A = rfKUScr(a), B = rfKUScr(b);
    rfKUEv('mousemove', A); rfKUEv('mousedown', A);
    for (var k = 1; k <= (n || 8); k++) { rfKUEv('mousemove', [A[0] + (B[0] - A[0]) * k / (n || 8), A[1] + (B[1] - A[1]) * k / (n || 8)]); await wait(16); }
    rfKUEv('mouseup', B); await wait(40);
  }
  function rfKUKey(k, mods) { var ev = new W.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {})); D.dispatchEvent(ev); }
  // a new inch part, sketch on Front, x -0.8..9, y -2..4.5 in view
  async function rfKUNew(ents, rels) {
    await anvil.newPart(); await idle();
    if (UI.setUnits) UI.setUnits('in');
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    var a = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0)), b = UI.worldToScreen(K.to3D(UI.activePlane(), 1, 0));
    var ppi = Math.min(UI.size.w / 10, UI.size.h / 6.5);
    UI.zoomView(Math.hypot(b[0] - a[0], b[1] - a[1]) / ppi);
    var o = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0));
    UI.panView(UI.size.w * 0.08 - o[0], UI.size.h * 0.72 - o[1]);
    var f = UI.activeSketchFeature();
    (ents || []).forEach(function (e) { f.entities.push(e); });
    if (rels) f.rels = rels;
    UI.updateSketches(); await wait(30);
    return f;
  }
  function rfKURels(f) { return (f.rels || []).map(function (r) { return r.type + '(' + r.refs.join(',') + ')'; }); }

  step('rfKU: a line drawn level from its start to a vertical line ends where the level crosses it: Horizontal and Coincident on the line (it took the nearest point, 1-2 px off level, no Horizontal)', async function () {
    var f = await rfKUNew([{ t: 'line', x1: 4, y1: -1.5, x2: 4, y2: 3 }], [{ type: 'vertical', refs: ['0'] }]);
    UI.setTool('line'); await wait(20);
    await rfKUClick([1, 1]);
    var c = rfKUScr([4, 1.03]);   // 2.4 px above the level, on the vertical line
    rfKUEv('mousemove', [c[0] - 40, c[1]]); await wait(20);
    rfKUEv('mousemove', c); rfKUEv('mousedown', c); rfKUEv('mouseup', c); await wait(30);
    rfKUKey('Escape'); await wait(30);
    var L = f.entities[1];
    assert(L && L.t === 'line', 'line drawn: ' + JSON.stringify(f.entities));
    near(L.y2, L.y1, 1e-9, 'level end');
    near(L.x2, 4, 1e-9, 'on the vertical line');
    var rs = rfKURels(f);
    assert(rs.indexOf('horizontal(1)') >= 0 && rs.indexOf('coincident(1.p2,0)') >= 0, 'relations: ' + rs.join(' '));
    return rs.join(' ');
  });

  step('rfKU: Mirror Entities with a box-selected centrepoint slot and a hole: the slot\'s own centerline is mirrored with it and Mirror about takes the clicked centerline (it mirrored about the slot axis)', async function () {
    var f = await rfKUNew([{ t: 'line', x1: 0, y1: 2, x2: 8, y2: 2, construction: true }]);
    UI.setTool('cslot'); await wait(20);
    await rfKUClick([2, 3]); await rfKUClick([2.75, 3]); await rfKUClick([2.75, 3.25]); await wait(30);
    rfKUKey('Escape'); await wait(20);
    UI.setTool('circle'); await wait(20);
    await rfKUClick([5, 3]); await rfKUClick([5.25, 3]); await wait(30);
    if (UI.sketchUnitBox && UI.sketchUnitBox.isOpen && UI.sketchUnitBox.isOpen()) { rfKUKey('Escape'); await wait(20); }
    rfKUKey('Escape'); await wait(20); rfKUKey('Escape'); await wait(20);
    var n0 = f.entities.length;
    assert(n0 >= 8, 'slot and circle drawn: ' + n0);
    await rfKUDrag([0.8, 3.6], [5.6, 2.5]); await wait(40);
    var sel = UI.selection().map(function (s) { return s.index; });
    assert(sel.length === n0 - 1, 'box selected everything but the long centerline: ' + sel.join(','));
    assert(UI.sketchInnerCenterlines(sel).length === 1, 'the slot centerline is inner');
    UI.cmdMirrorEntities(); await wait(40);
    await rfKUClick([7, 2]); await wait(40);
    await UI.pmOK(); await idle();
    assert(f.entities.length === n0 + n0 - 1, 'every selected entity mirrored: ' + f.entities.length);
    var copies = f.entities.slice(n0), cy = copies.filter(function (e) { return e.t === 'circle'; })[0];
    assert(cy && Math.abs(cy.cy - 1) < 1e-6, 'the hole mirrored about y = 2: ' + JSON.stringify(cy));
    assert(copies.some(function (e) { return e.t === 'line' && e.construction; }), 'the slot centerline copied too');
    return f.entities.length + ' entities';
  });

  step('rfKU: Smart Dimension from a centerline to a point placed past the centerline is the doubled (Ø) distance; Modify 2.5 puts the point 1.25 off; placed on the near side it stays the plain distance', async function () {
    var f = await rfKUNew([{ t: 'line', x1: 0, y1: 2, x2: 8, y2: 2, construction: true }, { t: 'point', x: 2, y: 3 }, { t: 'point', x: 5, y: 3 }],
      [{ type: 'horizontal', refs: ['0'] }, { type: 'coincident', refs: ['0.p1', 'O'] }]);
    var a = f.entities[0]; a.y1 = 0; a.y2 = 0; f.entities[1].y = 1; f.entities[2].y = 1; UI.updateSketches(); await wait(20);
    UI.setTool('dimension'); await wait(20);
    await rfKUClick([6.5, 0]); await rfKUClick([2, 1]);
    var c = rfKUScr([2.4, -1]); rfKUEv('mousemove', c); await wait(30);
    assert(UI.App.tempRelDim && UI.App.tempRelDim.ac && UI.App.tempRelDim.ac[0] === 'dbl', 'preview doubled: ' + JSON.stringify(UI.App.tempRelDim && UI.App.tempRelDim.ac));
    rfKUEv('mousedown', c); rfKUEv('mouseup', c); await wait(60);
    var inp = D.querySelector('#dim-edit input');
    assert(inp && !$('dim-edit').hidden, 'Modify box open');
    near(+inp.value, 2, 1e-6, 'Modify box shows 2 × 1');
    setInput(inp, '2.5'); pressEnter(inp); await wait(60);
    var rel = f.rels.filter(function (r) { return r.type === 'distance'; })[0];
    assert(rel && rel.ac && rel.ac[0] === 'dbl', 'doubled relation: ' + JSON.stringify(rel));
    near(f.entities[1].y, 1.25, 1e-9, 'point 1.25 above the centerline');
    var labels = Array.prototype.map.call(D.querySelectorAll('#dim-layer text'), function (t) { return t.textContent; });
    assert(labels.some(function (t) { return /^Ø2\.5/.test(t); }), 'Ø label: ' + labels.join('|'));
    rfKUKey('Escape'); await wait(30);
    if (!$('dim-edit').hidden) { rfKUKey('Escape'); await wait(20); }
    UI.setTool('dimension'); await wait(20);
    await rfKUClick([7, 0]); await rfKUClick([5, 1]);
    await rfKUClick([5.4, 1.6]); await wait(60);
    var inp2 = D.querySelector('#dim-edit input');
    near(+inp2.value, 1, 1e-6, 'near side: the plain distance');
    rfKUKey('Escape'); await wait(30);
    var rel2 = f.rels.filter(function (r) { return r.type === 'distance'; })[1];
    assert(rel2 && !(rel2.ac && rel2.ac.indexOf('dbl') >= 0), 'plain relation: ' + JSON.stringify(rel2));
    return labels.join('|');
  });

  step('rfKU: a selected spline shows its handles; dragging one turns Tangent Driving on at that point (points stay), one undo step', async function () {
    var f = await rfKUNew([{ t: 'spline', pts: [[1, 1], [2, 1.7], [3, 1.1], [4, 1.8], [5, 1.2]] }]);
    var e = f.entities[0], pts0 = JSON.stringify(e.pts);
    rfKUKey('Escape'); await wait(20);
    var g = K.splineGeom(e), q = e.pts[2], fr = e; void fr;
    var on = g.bez[1][3];
    await rfKUClick([on[0], on[1]]); await wait(40);
    var spec = UI.pmSpec && UI.pmSpec();
    assert(spec && spec._skEntity && spec._skEntity.index === 0, 'Spline PM open');
    var tip = K.splineGeom(e).bez[2][1], ts = UI.worldToScreen(K.to3D(UI.activePlane(), tip[0], tip[1]));
    var hit = UI.splineHandleAt(ts[0], ts[1]);
    assert(hit && hit.k === 2 && hit.s === 1, 'handle at point 3: ' + JSON.stringify(hit));
    var u0 = UI.App.undoStack ? UI.App.undoStack.length : null;
    await rfKUDrag(tip, [q[0] + 0.5, q[1] + 0.5], 10); await wait(40);
    assert(e.tans && e.tans[2], 'tangent driving on point 3: ' + JSON.stringify(e.tans));
    near(e.tans[2][0], 45, 1, 'handle angle follows the pointer');
    assert(JSON.stringify(e.pts) === pts0, 'points unchanged');
    UI.undo(); await wait(40);
    var e2 = UI.activeSketchFeature().entities[0];
    assert(!e2.tans || !e2.tans[2], 'one undo takes the drag back: ' + JSON.stringify(e2.tans));
    return 'tans ' + JSON.stringify(e.tans[2]) + (u0 != null ? ' undo ' + u0 : '');
  });

  step('rfKU: Sketch Text: a click in the graphics area before typing marks the place; typing shows it there and ✓ places it (it was dropped)', async function () {
    var f = await rfKUNew([]);
    if (UI.resetSketchTextTool) UI.resetSketchTextTool();
    UI.setTool('text'); await wait(40);
    var ta = D.querySelector('#pm textarea.txt-str');
    assert(ta, 'Text box');
    ta.value = ''; ta.dispatchEvent(new W.Event('input', { bubbles: true }));
    await rfKUClick([2, 1]); await wait(30);
    assert(!f.entities.length, 'nothing placed before the text is typed');
    ta = D.querySelector('#pm textarea.txt-str');
    ta.value = 'PANEL A'; ta.dispatchEvent(new W.Event('input', { bubbles: true })); await wait(30);
    assert(UI.App.tempEntities && UI.App.tempEntities.length === 1 && Math.abs(UI.App.tempEntities[0].x - 2) < 1e-6, 'preview at the click');
    await UI.pmOK(); await idle();
    var t = f.entities.filter(function (e) { return e.t === 'text'; })[0];
    assert(t && t.str === 'PANEL A', 'text placed: ' + JSON.stringify(f.entities));
    near(t.x, 2, 1e-6, 'x'); near(t.y, 1, 1e-6, 'y');
    UI.closePM && UI.closePM();
    return JSON.stringify([t.x, t.y]);
  });

  step('rfKU: the relation context toolbar: click a line, Ctrl+click another: Make Collinear / Equal / Parallel … by the pointer; a click adds the relation (one undo step), Esc hides it', async function () {
    var f = await rfKUNew([{ t: 'line', x1: 0, y1: 1, x2: 2, y2: 1.3 }, { t: 'line', x1: 3, y1: 1.5, x2: 5, y2: 1.6 }]);
    rfKUKey('Escape'); await wait(20);
    await rfKUClick([1, 1.15]); await wait(30);
    var b1 = UI.sketchContextBar();
    assert(b1 && b1.indexOf('horizontal') >= 0 && b1.indexOf('vertical') >= 0, 'one line: ' + JSON.stringify(b1));
    await rfKUClick([4, 1.55], { ctrlKey: true }); await wait(30);
    var b2 = UI.sketchContextBar();
    assert(b2 && ['collinear', 'parallel', 'equal', 'perpendicular'].every(function (t) { return b2.indexOf(t) >= 0; }), 'two lines: ' + JSON.stringify(b2));
    D.querySelector('#sk-ctx [data-rel="collinear"]').click(); await wait(40);
    assert(rfKURels(f).indexOf('collinear(0,1)') >= 0, 'collinear added: ' + rfKURels(f).join(' '));
    assert(!UI.sketchContextBar(), 'bar gone after a click');
    var A = f.entities[0], B = f.entities[1], cr = (A.x2 - A.x1) * (B.y2 - A.y1) - (A.y2 - A.y1) * (B.x2 - A.x1);
    near(cr, 0, 1e-7, 'B on A\'s carrier');
    UI.undo(); await wait(30);
    assert(rfKURels(UI.activeSketchFeature()).indexOf('collinear(0,1)') < 0, 'undo takes it back');
    await rfKUClick([1, 1.15]); await wait(30);
    assert(UI.sketchContextBar(), 'bar again');
    rfKUKey('Escape'); await wait(20);
    assert(!UI.sketchContextBar(), 'Esc hides it');
    return JSON.stringify(b2);
  });
