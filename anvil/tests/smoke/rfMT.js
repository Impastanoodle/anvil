  // ---- rfMT (local-2026-11-15a, lane sketchflow round 3): the sketcher driven like a shop user. Select picks model
  // faces / edges while a sketch is open (sketch-flow report 2026-11-11, second table row 8), and the flows of
  // test-reports/2026-11-15-sketch-flow-3.md, by real mouse / key events
  function rfMTScr3(p) { var s = UI.worldToScreen(p), r = $('viewport').getBoundingClientRect(); return [Math.round(r.left + s[0]), Math.round(r.top + s[1])]; }
  function rfMTScr(uv) { return rfMTScr3(K.to3D(UI.activePlane(), uv[0], uv[1])); }
  function rfMTEv(type, c, mods) {
    (type === 'mousedown' ? $('viewport') : W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: c[0], clientY: c[1] }, mods || {})));
  }
  async function rfMTClickAt(c, mods) { rfMTEv('mousemove', [c[0] + 3, c[1] + 2], mods); await wait(15); rfMTEv('mousemove', c, mods); await wait(15); rfMTEv('mousedown', c, mods); rfMTEv('mouseup', c, mods); await wait(25); }
  async function rfMTClick(uv, mods) { await rfMTClickAt(rfMTScr(uv), mods); }
  async function rfMTMove(uv) { rfMTEv('mousemove', rfMTScr(uv)); await wait(20); }
  function rfMTKey(k, mods) { D.dispatchEvent(new W.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {}))); }
  function rfMTFace(n) {
    var best = -1;
    UI.App.mesh.faces.forEach(function (f, i) { if (K.vec.dot(f.normal, n) > 1 - 1e-6 && (best < 0 || f.area > UI.App.mesh.faces[best].area)) best = i; });
    assert(best >= 0, 'no face with normal ' + n);
    return best;
  }
  // a block 4 x 3 x .5 on Top and a sketch on its top face (Top view, zoomed to fit), Select tool
  async function rfMTBlockSketch() {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sketch("Top").rect(0, -3, 4, 3).extrude(0.5);'); await idle();
    UI.setView('Top', false); if (UI.finishViewAnimation) UI.finishViewAnimation();
    UI.App.sel = { kind: 'face', index: rfMTFace([0, 1, 0]) };
    UI.cmdSketch(); await idle(); await wait(40);
    assert(UI.App.mode === 'sketch', 'sketch on the face');
    UI.zoomToFit(); await wait(40);
    UI.setTool('select'); await wait(20);
    return UI.activeSketchFeature();
  }
  async function rfMTDone() { if (UI.App.mode === 'sketch') { UI.setTool('select'); if (UI.closePM) UI.closePM(); if (UI.cancelSketch) UI.cancelSketch(); await idle(); } }

  step('rfMT: in an open sketch on a face the Select tool pre-highlights and selects the model face, an edge and (Ctrl) both; Convert Entities takes the preselected face (4 lines On Edge), as SolidWorks (the click only cleared the selection)', async function () {
    try {
      var f = await rfMTBlockSketch(), top = rfMTFace([0, 1, 0]);
      rfMTEv('mousemove', rfMTScr3([2, 0.5, 1.5])); await wait(30);
      assert(UI.App.hover && UI.App.hover.kind === 'face', 'hover on the face: ' + JSON.stringify(UI.App.hover && UI.App.hover.kind));
      await rfMTClickAt(rfMTScr3([2, 0.5, 1.5])); await wait(20);
      var sel = UI.selection();
      assert(sel.length === 1 && sel[0].kind === 'face' && UI.App.mesh.faces[sel[0].index] && K.vec.dot(UI.App.mesh.faces[sel[0].index].normal, [0, 1, 0]) > 0.999, 'the top face selected: ' + JSON.stringify(sel.map(function (s) { return s.kind; })));
      assert(/face selected/.test(statusText()), 'status: ' + statusText());
      // an edge (the right side x = 4), Ctrl+click adds it, a click on nothing (off the block) clears
      await rfMTClickAt(rfMTScr3([4, 0.5, 1.5])); await wait(20);
      sel = UI.selection();
      assert(sel.length === 1 && sel[0].kind === 'edge', 'edge selected: ' + JSON.stringify(sel.map(function (s) { return s.kind; })));
      await rfMTClickAt(rfMTScr3([2, 0.5, 1.5]), { ctrlKey: true }); await wait(20);
      sel = UI.selection();
      assert(sel.length === 2 && sel.some(function (s) { return s.kind === 'face'; }) && sel.some(function (s) { return s.kind === 'edge'; }), 'Ctrl adds the face: ' + JSON.stringify(sel.map(function (s) { return s.kind; })));
      await rfMTClickAt(rfMTScr3([2, 0.5, 1.5])); await wait(20);
      assert(UI.selection().length === 1 && UI.selection()[0].kind === 'face', 'a plain click: the face alone');
      UI.cmdConvertEntities(); await wait(40);
      assert((UI.App.tempEntities || []).length === 4, 'preview of the preselected face: ' + (UI.App.tempEntities || []).length);
      await UI.pmOK(); await idle();
      f = UI.activeSketchFeature();
      var on = (f.rels || []).filter(function (r) { return r.type === 'onEdge'; });
      assert(f.entities.length === 4 && on.length === 4, 'four lines On Edge: ' + f.entities.length + ' / ' + on.length);
      // a sketch line under the pointer still wins over the face below it
      await rfMTClickAt(rfMTScr3([2, 0.5, 0])); await wait(20);
      sel = UI.selection();
      assert(sel.length === 1 && sel[0].kind === 'entity', 'the converted line, not the face / edge: ' + JSON.stringify(sel));
      return 'face ' + top + ', converted 4';
    } finally { await rfMTDone(); }
  });

  step('rfMT: a model face selected in the sketch, then Offset Entities .25: its edges come in On Edge and one offset chain with the Offset dimension, inside the face', async function () {
    try {
      await rfMTBlockSketch();
      await rfMTClickAt(rfMTScr3([2, 0.5, 1.5])); await wait(20);
      assert(UI.selection()[0] && UI.selection()[0].kind === 'face', 'face selected');
      UI.cmdOffsetEntities(); await wait(40);
      setInput(pmField('Offset distance'), '.25'); await wait(30);
      var pl = UI.activePlane(), inside = function () { var t = UI.App.tempEntities || []; return t.length && t.filter(function (e) { return !e.construction; }).every(function (e) { var q = K.to3D(pl, e.x1, e.y1); return q[0] > 0.1 && q[0] < 3.9; }); };
      if (!inside()) { pmField('Reverse').click(); await wait(30); }
      assert(inside(), 'offset inward: ' + JSON.stringify(UI.App.tempEntities));
      await UI.pmOK(); await idle();
      var f = UI.activeSketchFeature();
      var cons = f.entities.filter(function (e) { return e.construction; }).length, solid = f.entities.filter(function (e) { return !e.construction; });
      assert(cons === 4 && solid.length === 4, '4 construction + 4 offset lines: ' + cons + ' / ' + solid.length);
      assert((f.rels || []).some(function (r) { return r.type === 'offset'; }), 'Offset relation: ' + JSON.stringify((f.rels || []).map(function (r) { return r.type; })));
      var xs = solid.map(function (e) { return K.to3D(pl, e.x1, e.y1)[0]; });
      near(Math.min.apply(null, xs), 0.25, 1e-6, 'offset left side'); near(Math.max.apply(null, xs), 3.75, 1e-6, 'offset right side');
      return 'sides ' + Math.min.apply(null, xs) + ' .. ' + Math.max.apply(null, xs);
    } finally { await rfMTDone(); }
  });

  // ---- rfMT flows (report test-reports/2026-11-15-sketch-flow-3.md)
  // a new inch part, grid off, sketch on Front with x -0.8..9, y -2..4.5 in view; the undo depth after the sketch opened
  var rfMTGrid = null;
  async function rfMTNew() {
    var m = UI.K.newModel('Part1'); m.units = 'in';
    await anvil.load(m); await idle();
    assert(UI.unitLabel() === 'in', 'an inch part');
    if (rfMTGrid == null) rfMTGrid = UI.App.view.showGrid;
    UI.App.view.showGrid = false; UI.App.gridStale = true;
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    var a = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0)), b = UI.worldToScreen(K.to3D(UI.activePlane(), 1, 0));
    UI.zoomView(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.min(UI.size.w / 10, UI.size.h / 6.5));
    var o = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0));
    UI.panView(UI.size.w * 0.08 - o[0], UI.size.h * 0.72 - o[1]);
    UI.updateSketches(); await wait(30);
    var f = UI.activeSketchFeature();
    f._u0 = UI.App.undo.length;
    return f;
  }
  async function rfMTEnd() {
    if (rfMTGrid != null) { UI.App.view.showGrid = rfMTGrid; rfMTGrid = null; UI.App.gridStale = true; }
    await rfMTDone();
  }
  function rfMTF() { return UI.activeSketchFeature(); }
  function rfMTAn() { return W.SketchSolver.analyze(rfMTF()); }
  function rfMTState(f) { f = f || rfMTF(); return JSON.stringify([f.entities, f.rels || [], f.dims || []]); }
  async function rfMTEsc(n) { for (var k = 0; k < (n || 1); k++) { rfMTKey('Escape'); await wait(20); } }
  // Smart Dimension by clicks: the pieces (sketch uv), then the label place; the Modify box takes value (typed text)
  async function rfMTDim(picks, place, value) {
    UI.setTool('dimension'); await wait(20);
    // lane NU: these are quick clicks on lines (often at their middles); the midpoint pick needs a 150 ms rest, which a
    // loaded machine stretches the test's 30 ms into: hold the rest off while picking
    var dwell = UI.dimMidDwell(); UI.dimMidDwell(1e9);
    try {
      for (var k = 0; k < picks.length; k++) await rfMTClick(picks[k]);
      await rfMTClick(place); await wait(50);
    } finally { UI.dimMidDwell(dwell); }
    var inp = D.querySelector('#dim-edit input');
    assert(inp && !$('dim-edit').hidden, 'Modify box open after dimensioning ' + JSON.stringify(picks));
    var shown = inp.value;
    if (value != null) { setInput(inp, value); pressEnter(inp); await wait(60); }
    if (!$('dim-edit').hidden) { rfMTKey('Escape'); await wait(20); }
    return shown;
  }
  // a dimension label whose text matches re: double-press it, type value, Enter
  async function rfMTEditDim(re, value) {
    UI.setTool('select'); await wait(20);
    if (UI.drawDims) UI.drawDims(true);
    var t = Array.prototype.filter.call(D.querySelectorAll('#dim-layer text'), function (x) { return re.test(x.textContent); })[0];
    assert(t, 'no label ' + re + ' in ' + Array.prototype.map.call(D.querySelectorAll('#dim-layer text'), function (x) { return x.textContent; }).join('|'));
    var b = t.getBoundingClientRect(), c = [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)];
    // lane NU: the two presses are made (time-stamped) together, as a hand double-clicks; the page may handle the second
    // only after the slow redraw the first one causes (a loaded machine), and the double-click is judged by the stamps
    var evs = [0, 1].map(function () { return [new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: c[0], clientY: c[1] }), new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, clientX: c[0], clientY: c[1] })]; });
    for (var k = 0; k < 2; k++) {
      if (k) t = Array.prototype.filter.call(D.querySelectorAll('#dim-layer text'), function (x) { return x._d && x._d === t._d; })[0] || t;
      t.dispatchEvent(evs[k][0]); W.dispatchEvent(evs[k][1]);
      await wait(40);
    }
    var inp = D.querySelector('#dim-edit input');
    assert(inp && !$('dim-edit').hidden, 'Modify box open on ' + t.textContent);
    setInput(inp, value); pressEnter(inp); await wait(60);
    if (!$('dim-edit').hidden) { rfMTKey('Escape'); await wait(20); }
  }
  // every step back with Ctrl+Z to the empty sketch, then forward with Ctrl+Y: the same sketch; then exit and edit the
  // sketch again: the same sketch, the same status
  async function rfMTUndoAll() {
    var f = rfMTF(), id = f.id, u0 = f._u0, s1 = rfMTState(f), st1 = rfMTAn().status, n = 0;
    UI.setTool('select'); await wait(20);
    while (UI.App.undo.length > u0 && n < 80) { rfMTKey('z', { ctrlKey: true }); await idle(); await wait(10); n++; }
    var g = rfMTF();
    assert(g && g.id === id && UI.App.mode === 'sketch', 'still in the sketch after ' + n + ' undos');
    assert(!g.entities.length, n + ' undos leave the sketch empty: ' + g.entities.length);
    for (var k = 0; k < n; k++) { rfMTKey('y', { ctrlKey: true }); await idle(); await wait(10); }
    g = rfMTF();
    assert(rfMTState(g) === s1, 'redo all gives the same sketch back');
    UI.exitSketch(); await idle();
    UI.enterSketch(id); await idle(); await wait(30);
    g = rfMTF();
    assert(g && rfMTState(g) === s1 && rfMTAn().status === st1, 'exit and edit again: the same sketch, ' + st1);
    return n;
  }
  // Boss-Extrude the sketch depth d through its PM: the volume is area x d
  async function rfMTExtrude(d, area) {
    var id = rfMTF().id;
    UI.exitSketch(); await idle();
    UI.App.sel = { kind: 'feature', id: id };
    UI.cmdExtrude(); await wait(40);
    setInput(pmNumber(0), String(d)); await wait(30);
    await UI.pmOK(); await idle();
    var v = anvil.mass().volume;
    if (area != null) near(v, area * d, 1e-6 * Math.max(1, area * d), 'Boss-Extrude volume');
    return v;
  }

  step('rfMT flow 1: a gusset by mouse (lines, a Tangent Arc, two straight slots), slots dimensioned from the edges, two dimensions changed, undo / redo all, edit again, Boss-Extrude', async function () {
    try {
      var f = await rfMTNew();
      UI.setTool('line'); await wait(20);
      await rfMTClick([0, 0]); await rfMTClick([4, 0]); await rfMTClick([4, 1]); await rfMTEsc(2);
      UI.setTool('tarc'); await wait(20);
      await rfMTClick([4, 1]); await rfMTMove([3.2, 3.2]); await rfMTClick([1, 4]); await rfMTEsc(2);
      UI.setTool('line'); await wait(20);
      await rfMTClick([1, 4]); await rfMTClick([0, 4]); await rfMTClick([0, 0]); await rfMTEsc(2);
      f = rfMTF();
      var kinds = f.entities.map(function (e) { return e.t; }).join(',');
      var rels = (f.rels || []).map(function (r) { return r.type + '(' + r.refs.join(',') + ')'; }).join(' ');
      assert(f.entities.length === 5, 'five entities: ' + kinds + ' ' + rels);
      var arc = f.entities.filter(function (e) { return e.t === 'arc'; })[0];
      assert(arc, 'an arc: ' + kinds);
      near(arc.r, 3, 1e-6, 'tangent arc radius'); near(arc.cx, 1, 1e-6, 'arc centre x'); near(arc.cy, 1, 1e-6, 'arc centre y');
      UI.setTool('slot'); await wait(20);
      await rfMTClick([1.5, 1]); await rfMTClick([2.5, 1]); await rfMTClick([2, 1.125]); await rfMTEsc(2);
      UI.setTool('slot'); await wait(20);
      await rfMTClick([1, 2]); await rfMTClick([1, 3]); await rfMTClick([1.125, 2.5]); await rfMTEsc(2);
      f = rfMTF();
      var ends = f.entities.filter(function (e) { return e.t === 'arc' && Math.abs(e.r - 0.125) < 1e-6; });
      assert(ends.length === 4 && f.entities.length === 15, 'two slots (2 lines, 2 arcs, a centerline each): ' + JSON.stringify(f.entities.slice(5)));
      // slot 1's first centre 1 up from the bottom edge and 1.5 from the left edge; slot 2's 1 from the left edge
      var d1 = await rfMTDim([[3, 0], [1.5, 1]], [1.2, 0.5], '1');
      var d2 = await rfMTDim([[0, 0.5], [1.5, 1]], [0.8, -0.6], '1 1/2');
      var d3 = await rfMTDim([[0, 3.5], [1, 3]], [0.5, 3.7], '1');
      var d4 = await rfMTDim([[2, 1]], [2, 1.6], '1');   // the slot length (centre to centre)
      UI.setTool('select'); await wait(20);
      var an1 = rfMTAn();
      UI.cmdFullyDefineSketch(); await wait(60);
      await UI.pmOK(); await idle(); await wait(30);
      var an2 = rfMTAn();
      assert(an2.status === 'full', 'Fully Define Sketch: ' + an2.status + ' dof ' + an2.dof);
      await rfMTEditDim(/^1\.50*$/, '1.75');
      f = rfMTF();
      assert(f.entities.some(function (e) { return e.t === 'arc' && Math.abs(e.cx - 1.75) < 1e-6 && Math.abs(e.cy - 1) < 1e-6; }), 'slot 1 moved by its 1.5 dimension: ' + JSON.stringify(f.entities.filter(function (e) { return e.t === 'arc'; })));
      var s0 = rfMTState();
      await rfMTEditDim(/^1(\.0*)?$/, '1.25');
      assert(rfMTState() !== s0 && rfMTAn().status === 'full', 'a 1 in dimension made 1.25: ' + rfMTAn().status);
      var n = await rfMTUndoAll();
      var ar = rfMTF().entities.filter(function (e) { return e.t === 'arc' && Math.abs(e.r - 0.125) < 1e-6; });
      var lens = [Math.hypot(ar[0].cx - ar[1].cx, ar[0].cy - ar[1].cy), Math.hypot(ar[2].cx - ar[3].cx, ar[2].cy - ar[3].cy)];
      var v = await rfMTExtrude(0.25, 4 + 3 + Math.PI * 9 / 4 - (lens[0] + lens[1]) * 0.25 - 2 * Math.PI * 0.125 * 0.125);
      return [d1, d2, d3, d4].join('/') + ' | before Fully Define ' + an1.status + ' ' + an1.dof + ' | ' + n + ' undos | volume ' + v.toFixed(5);
    } finally { await rfMTEnd(); }
  });

  async function rfMTDrag(a, b, n) {
    var A = rfMTScr(a), B = rfMTScr(b);
    rfMTEv('mousemove', A); await wait(20); rfMTEv('mousedown', A); await wait(20);
    for (var k = 1; k <= (n || 8); k++) { rfMTEv('mousemove', [A[0] + (B[0] - A[0]) * k / (n || 8), A[1] + (B[1] - A[1]) * k / (n || 8)]); await wait(20); }
    rfMTEv('mouseup', B); await idle(); await wait(40);
  }
  async function rfMTCircle(c, r) {
    UI.setTool('circle'); await wait(20);
    await rfMTClick(c); await rfMTClick([c[0] + r, c[1]]); await wait(30);
    if (UI.sketchUnitBox && UI.sketchUnitBox.isOpen && UI.sketchUnitBox.isOpen()) { rfMTKey('Escape'); await wait(20); }
    await rfMTEsc(2);
  }
  function rfMTCircles(f) { return (f || rfMTF()).entities.filter(function (e) { return e.t === 'circle'; }); }

  step('rfMT flow 2: a flange outline with two holes mirrored about a vertical centerline, one hole dragged (its mirror image follows), Smart Dimension Ø typed 3/8, Fully Define, two dimensions changed, undo / redo all, edit again, Boss-Extrude', async function () {
    try {
      var f = await rfMTNew();
      UI.setTool('rect'); await wait(20);
      await rfMTClick([0, 0]); await rfMTClick([6, 3]); await rfMTEsc(2);
      UI.cmdCenterline(); await wait(20);
      await rfMTMove([3.05, 0.1]); await rfMTClick([3, 0]); await rfMTMove([3.05, 2.9]); await rfMTClick([3, 3]); await rfMTEsc(2);
      f = rfMTF();
      var cl = f.entities.length - 1;
      assert(f.entities[cl].construction, 'centerline drawn: ' + JSON.stringify(f.entities));
      await rfMTCircle([1, 0.75], 0.2); await rfMTCircle([1, 2.25], 0.2);
      f = rfMTF();
      var c0 = f.entities.length - 2, c1 = f.entities.length - 1;
      UI.setTool('select'); await wait(20);
      await rfMTClick([1.2, 0.75]); await rfMTClick([1.2, 2.25], { ctrlKey: true });
      var sel = UI.selection().map(function (s) { return s.kind + s.index; }).join(',');
      assert(sel === 'entity' + c0 + ',entity' + c1, 'two holes selected: ' + sel);
      UI.cmdMirrorEntities(); await wait(40);
      await rfMTClick([3, 1.5]); await wait(40);
      await UI.pmOK(); await idle();
      f = rfMTF();
      var cs = rfMTCircles(f);
      assert(cs.length === 4 && cs.some(function (c) { return Math.abs(c.cx - 5) < 1e-6 && Math.abs(c.cy - 0.75) < 1e-6; }), 'mirrored: ' + JSON.stringify(cs));
      await rfMTDrag([1, 0.75], [1.25, 0.6]);
      f = rfMTF();
      var o = f.entities[c0], m = rfMTCircles(f).filter(function (c) { return c !== o && Math.abs(c.cy - o.cy) < 1e-6; })[0];
      assert(Math.abs(o.cx - 1) > 0.05, 'the hole moved: ' + JSON.stringify(o));
      assert(m, 'its mirror image at the same height: ' + JSON.stringify(rfMTCircles(f)));
      near(f.entities[cl].x1, 3, 1e-4, 'the centerline (and the outline) stay where they were');
      near(m.cx, 6 - o.cx, 1e-4, 'the mirror image follows (about x = 3)');
      var dDia = await rfMTDim([[o.cx + o.r * 0.7071, o.cy + o.r * 0.7071]], [o.cx + 0.7, o.cy + 0.5], '3/8');
      f = rfMTF();
      assert(rfMTCircles(f).every(function (c) { return Math.abs(c.r - 0.1875) < 1e-6 || Math.abs(c.r - 0.2) < 1e-6; }), 'Ø3/8: ' + JSON.stringify(rfMTCircles(f).map(function (c) { return c.r; })));
      near(f.entities[c0].r, 0.1875, 1e-9, 'the dimensioned hole Ø.375');
      UI.cmdFullyDefineSketch(); await wait(60);
      await UI.pmOK(); await idle(); await wait(30);
      var an = rfMTAn();
      assert(an.status === 'full', 'Fully Define: ' + an.status + ' ' + an.dof);
      var labels = Array.prototype.map.call(D.querySelectorAll('#dim-layer text'), function (x) { return x.textContent; });
      await rfMTEditDim(/^6(\.0*)?$/, '7');
      f = rfMTF();
      var xs = f.entities.filter(function (e) { return e.t === 'line' && !e.construction; }).map(function (e) { return Math.max(e.x1, e.x2); });
      near(Math.max.apply(null, xs), 7, 1e-6, 'width 7');
      var cl2 = f.entities[cl];
      near(cl2.x1, 3.5, 1e-6, 'the centerline stays in the middle');
      var r1 = rfMTCircles(f).map(function (c) { return [c.cx, c.cy]; });
      var n = await rfMTUndoAll();
      var holes = rfMTCircles().reduce(function (s, c) { return s + Math.PI * c.r * c.r; }, 0);
      var v = await rfMTExtrude(0.25, 7 * 3 - holes);
      return 'Ø shown ' + dDia + ' | ' + labels.join(',') + ' | holes ' + JSON.stringify(r1) + ' | ' + n + ' undos | ' + v.toFixed(5);
    } finally { await rfMTEnd(); }
  });

  step('rfMT flow 3: an open channel profile drawn with the Line tool, its two arcs made by moving back over the end point (tangent arc autotransition), dimensions typed as inch fractions (1 1/2, 3/8), undo / redo all, edit again, Base Flange', async function () {
    try {
      var f = await rfMTNew();
      UI.setTool('line'); await wait(20);
      await rfMTClick([0, 2]); await rfMTClick([0, 0.5]);
      // back over the end point and out again: the next segment is a tangent arc
      await rfMTMove([0.3, 0.5]); await rfMTMove([0.02, 0.5]); await rfMTMove([0, 0.5]); await rfMTMove([0.1, 0.2]); await rfMTMove([0.3, 0.05]);
      await rfMTClick([0.5, 0]);
      await rfMTClick([3, 0]);
      await rfMTMove([3, 0.3]); await rfMTMove([3.02, 0]); await rfMTMove([3, 0]); await rfMTMove([3.3, 0.05]); await rfMTMove([3.45, 0.3]);
      await rfMTClick([3.5, 0.5]);
      await rfMTClick([3.5, 2]); await rfMTEsc(2);
      f = rfMTF();
      var kinds = f.entities.map(function (e) { return e.t; }).join(',');
      assert(kinds === 'line,arc,line,arc,line', 'line, arc, line, arc, line: ' + kinds + ' ' + JSON.stringify(f.entities));
      var tang = (f.rels || []).filter(function (r) { return r.type === 'tangent'; }).length;
      assert(tang === 4, 'four Tangent relations: ' + (f.rels || []).map(function (r) { return r.type; }).join(','));
      var arcs = f.entities.filter(function (e) { return e.t === 'arc'; });
      near(arcs[0].r, 0.5, 1e-6, 'arc 1 radius as drawn'); near(arcs[1].r, 0.5, 1e-6, 'arc 2 radius as drawn');
      var d1 = await rfMTDim([[0, 1.25], [3.5, 1.25]], [1.75, 2.4], '3 1/2');
      var d2 = await rfMTDim([[0.5 - 0.5 * 0.7071 + 0.0, 0.5 - 0.5 * 0.7071]], [-0.3, -0.4], '3/8');
      var d3 = await rfMTDim([[0, 1.5]], [-0.5, 1.2], '1 1/2');
      f = rfMTF();
      near(f.entities[1].r, 0.375, 1e-9, 'arc R3/8');
      var L0 = f.entities[0];
      near(Math.hypot(L0.x2 - L0.x1, L0.y2 - L0.y1), 1.5, 1e-9, 'left leg 1 1/2');
      var xs = [f.entities[0].x1, f.entities[4].x2];
      near(Math.abs(xs[1] - xs[0]), 3.5, 1e-9, 'outside width 3 1/2');
      await rfMTEditDim(/^3\.50*$/, '4 1/4');
      f = rfMTF();
      near(Math.abs(f.entities[4].x2 - f.entities[0].x1), 4.25, 1e-9, 'width 4 1/4');
      await rfMTEditDim(/^1\.50*$/, '2');
      f = rfMTF();
      near(Math.hypot(f.entities[0].x2 - f.entities[0].x1, f.entities[0].y2 - f.entities[0].y1), 2, 1e-9, 'leg 2');
      var an = rfMTAn();
      var n = await rfMTUndoAll();
      var g = rfMTF(), id = g.id, L = g.entities.reduce(function (s, e) { return s + (e.t === 'line' ? Math.hypot(e.x2 - e.x1, e.y2 - e.y1) : e.r * Math.abs(e.a1 - e.a0) * Math.PI / 180); }, 0);
      UI.exitSketch(); await idle();
      UI.App.sel = { kind: 'feature', id: id };
      UI.cmdBaseFlange(); await wait(60);
      await UI.pmOK(); await idle();
      var bf = UI.App.model.features.filter(function (x) { return x.sheetBase; })[0], sm = UI.App.model.sheet;
      var v = anvil.mass().volume, feats = UI.App.model.features.map(function (x) { return x.type + (x.sheetBase ? '*' : ''); }).join(',');
      assert(bf && sm && UI.unitLabel() === 'in', 'a Base Flange in an inch part: ' + feats);
      // material on one side of the line: the arcs' mid-surface is t / 2 off them (two 90 degree arcs: +- pi t / 2)
      var lo = sm.thickness * bf.depth * (L - Math.PI * sm.thickness / 2) - 1e-9, hi = sm.thickness * bf.depth * (L + Math.PI * sm.thickness / 2) + 1e-9;
      assert(v > lo && v < hi, 'the sheet volume is about T x depth x the profile length: ' + v + ' not in ' + lo + ' .. ' + hi);
      return [d1, d2, d3].join('/') + ' | ' + an.status + ' dof ' + an.dof + ' | ' + n + ' undos | ' + feats + ' | volume ' + v.toFixed(5);
    } finally { await rfMTEnd(); }
  });

  step('rfMT flow 4: a vent of slots: one straight slot box-selected, Linear Sketch Pattern 5 at .75, then the spacing dimension changed to 1 (every copy follows), undo / redo all, edit again, Boss-Extrude', async function () {
    try {
      var f = await rfMTNew();
      UI.setTool('rect'); await wait(20);
      await rfMTClick([0, 0]); await rfMTClick([6, 3]); await rfMTEsc(2);
      UI.setTool('slot'); await wait(20);
      await rfMTClick([1, 1]); await rfMTClick([1, 2]); await rfMTClick([1.125, 1.5]); await rfMTEsc(2);
      UI.setTool('select'); await wait(20);
      await rfMTDrag([0.7, 2.4], [1.3, 0.6]);
      f = rfMTF();
      var sel = UI.selection().map(function (s) { return s.index; }).sort(function (a, b) { return a - b; });
      assert(sel.join() === '4,5,6,7,8', 'the slot box-selected (2 lines, 2 arcs, its centerline): ' + sel.join());
      UI.cmdSketchPattern(); await wait(40);
      setInput(pmField('Number of instances'), '5'); await wait(20);
      setInput(pmField('Spacing'), '.75'); await wait(40);
      await UI.pmOK(); await idle();
      f = rfMTF();
      var caps = f.entities.filter(function (e) { return e.t === 'arc'; }).map(function (e) { return Math.round(e.cx * 1e6) / 1e6; });
      caps = caps.filter(function (x, i) { return caps.indexOf(x) === i; }).sort(function (a, b) { return a - b; });
      assert(caps.join() === '1,1.75,2.5,3.25,4', 'five slots .75 apart: ' + caps.join());
      UI.drawDims(true);
      var labels = Array.prototype.map.call(D.querySelectorAll('#dim-layer text'), function (x) { return x.textContent; });
      await rfMTEditDim(/^\.750$/, '1');
      f = rfMTF();
      caps = f.entities.filter(function (e) { return e.t === 'arc'; }).map(function (e) { return Math.round(e.cx * 1e6) / 1e6; });
      caps = caps.filter(function (x, i) { return caps.indexOf(x) === i; }).sort(function (a, b) { return a - b; });
      assert(caps.join() === '1,2,3,4,5', 'spacing 1: every copy follows: ' + caps.join() + ' ' + JSON.stringify((f.rels || []).filter(function (r) { return r.v != null || r.type === 'pattern'; })).slice(0, 900) + ' dims ' + JSON.stringify(f.dims));
      var n = await rfMTUndoAll();
      var v = await rfMTExtrude(0.125, 18 - 5 * (0.25 + Math.PI / 64));
      return labels.join(',') + ' | ' + n + ' undos | ' + v.toFixed(5);
    } finally { await rfMTEnd(); }
  });

  function rfMTLines(f) { return (f || rfMTF()).entities.filter(function (e) { return e.t === 'line' && !e.construction; }); }

  step('rfMT flow 5: a line across a rectangle, its two overhangs taken off by Power Trim drags, a short line extended to it with Extend Entities, dimensions changed, Fully Define, undo / redo all, edit again, Boss-Extrude', async function () {
    try {
      var f = await rfMTNew();
      UI.setTool('rect'); await wait(20);
      await rfMTClick([0, 0]); await rfMTClick([4, 3]); await rfMTEsc(2);
      UI.setTool('line'); await wait(20);
      await rfMTClick([-0.5, 1.5]); await rfMTClick([4.5, 1.5]); await rfMTEsc(2);
      UI.setTool('line'); await wait(20);
      await rfMTClick([2, 0]); var dbg = [UI.App.tool, JSON.stringify(UI.App.toolState.pts), statusText()]; await rfMTClick([2, 1]); dbg.push(JSON.stringify(UI.App.toolState.pts), statusText()); await rfMTEsc(2);
      f = rfMTF();
      assert(f.entities.length === 6, 'rectangle, the long line, the short line: ' + dbg.join(' ; ') + JSON.stringify(f.entities));
      UI.cmdTrimEntities(); await wait(40);
      var pw = Array.prototype.filter.call(D.querySelectorAll('#pm label'), function (l) { return /Power trim/.test(l.textContent); })[0];
      assert(pw, 'Power trim option');
      pw.click(); await wait(20);
      await rfMTDrag([-0.25, 1.8], [-0.25, 1.2]);
      await rfMTDrag([4.25, 1.8], [4.25, 1.2]);
      await UI.pmOK(); await idle();
      f = rfMTF();
      var L = rfMTLines(f).filter(function (e) { return Math.abs(e.y1 - 1.5) < 1e-9 && Math.abs(e.y2 - 1.5) < 1e-9; });
      assert(L.length === 1 && Math.min(L[0].x1, L[0].x2) === 0 && Math.max(L[0].x1, L[0].x2) === 4, 'the long line trimmed to the sides: ' + JSON.stringify(L));
      var li = f.entities.indexOf(L[0]);
      var onSides = (f.rels || []).filter(function (r) { return r.refs.some(function (q) { return q === li + '.p1' || q === li + '.p2'; }) && (r.type === 'coincident' || r.type === 'onEdge'); });
      assert(onSides.length >= 2, 'its ends held on the sides: ' + JSON.stringify(f.rels));
      UI.cmdExtendEntities(); await wait(40);
      await rfMTClick([2, 0.9]); await wait(40);
      await UI.pmOK(); await idle();
      f = rfMTF();
      var S2 = rfMTLines(f).filter(function (e) { return Math.abs(e.x1 - 2) < 1e-9 && Math.abs(e.x2 - 2) < 1e-9; })[0];
      assert(S2 && Math.abs(Math.max(S2.y1, S2.y2) - 1.5) < 1e-9, 'the short line extended to the long one: ' + JSON.stringify(S2));
      var si = f.entities.indexOf(S2);
      assert((f.rels || []).some(function (r) { return r.type === 'coincident' && r.refs.indexOf(String(li)) >= 0 && r.refs.some(function (q) { return q.indexOf(si + '.') === 0; }); }), 'Coincident on the long line: ' + JSON.stringify(f.rels));
      UI.setTool('select'); await wait(20);
      await rfMTDim([[2, 0]], [2, -0.5], '4 1/2');
      await rfMTDim([[0, 0.75]], [-0.5, 0.75], '3');
      f = rfMTF();
      assert((f.rels || []).some(function (r) { return r.type === 'midpoint' && r.refs[0] === si + '.p1'; }), 'the short line started on the bottom edge\'s midpoint (Midpoint): ' + JSON.stringify(f.rels));
      near(f.entities[si].x1, 2.25, 1e-9, 'it stays on the midpoint of the 4 1/2 edge');
      await rfMTDim([[3.5, 0], [3, 1.5]], [3.6, 0.8], '1 1/4');
      UI.cmdFullyDefineSketch(); await wait(60);
      await UI.pmOK(); await idle(); await wait(30);
      var an = rfMTAn();
      assert(an.status === 'full', 'Fully Define: ' + an.status + ' ' + an.dof);
      await rfMTEditDim(/^4\.50*$/, '5');
      await rfMTEditDim(/^1\.250*$/, '1');
      f = rfMTF();
      L = f.entities[li];
      near(L.y1, 1, 1e-9, 'the long line 1 up'); near(Math.max(L.x1, L.x2), 5, 1e-9, 'and 5 long');
      var n = await rfMTUndoAll();
      var v = await rfMTExtrude(0.25, 5 * 3);
      return an.status + ' | ' + n + ' undos | ' + v.toFixed(5);
    } finally { await rfMTEnd(); }
  });

  step('rfMT flow 6: an L outline drawn as one Line chain, Offset Entities .25 inward with Select chain, the offset dimension changed to 3/8, undo / redo all, edit again, Boss-Extrude the ring', async function () {
    try {
      var f = await rfMTNew();
      UI.setTool('line'); await wait(20);
      var P = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [0, 3], [0, 0]];
      for (var k = 0; k < P.length; k++) await rfMTClick(P[k]);
      await rfMTEsc(2);
      f = rfMTF();
      assert(f.entities.length === 6, 'six lines: ' + JSON.stringify(f.entities));
      UI.setTool('select'); await wait(20);
      await rfMTClick([2, 0]);
      UI.cmdOffsetEntities(); await wait(40);
      setInput(pmField('Offset distance'), '.25'); await wait(30);
      var inside = function () { var t = UI.App.tempEntities || []; return t.length === 6 && t.every(function (e) { return e.x1 > 0.1 && e.y1 > 0.1; }); };
      if (!inside()) { pmField('Reverse').click(); await wait(30); }
      assert(inside(), 'the offset preview inside: ' + JSON.stringify(UI.App.tempEntities));
      await UI.pmOK(); await idle();
      f = rfMTF();
      assert(f.entities.length === 12, 'six offset lines: ' + f.entities.length);
      var off = (f.rels || []).filter(function (r) { return r.type === 'offset' || (r.type === 'distance' && Math.abs(r.v - 0.25) < 1e-9); });
      UI.drawDims(true);
      var labels = Array.prototype.map.call(D.querySelectorAll('#dim-layer text'), function (x) { return x.textContent; });
      await rfMTEditDim(/^\.250$/, '3/8');
      f = rfMTF();
      var inner = f.entities.slice(6), xs = inner.map(function (e) { return Math.min(e.x1, e.x2); }), ys = inner.map(function (e) { return Math.min(e.y1, e.y2); });
      near(Math.min.apply(null, xs), 0.375, 1e-9, 'offset 3/8 from the left'); near(Math.min.apply(null, ys), 0.375, 1e-9, 'and from the bottom');
      near(f.entities[1].x1, 4, 1e-9, 'the outline stays');
      var want = [[0.375, 0.375], [3.625, 0.375], [3.625, 0.625], [0.625, 0.625], [0.625, 2.625], [0.375, 2.625]];
      want.forEach(function (w) { assert(inner.some(function (e) { return (Math.abs(e.x1 - w[0]) < 1e-9 && Math.abs(e.y1 - w[1]) < 1e-9) || (Math.abs(e.x2 - w[0]) < 1e-9 && Math.abs(e.y2 - w[1]) < 1e-9); }), 'an offset corner at ' + w + ': ' + JSON.stringify(inner)); });
      var n = await rfMTUndoAll();
      var v = await rfMTExtrude(0.125, 6 - (3.25 * 0.25 + 0.25 * 2));
      return labels.join(',') + ' | ' + off.map(function (r) { return r.type; }).join(',') + ' | ' + n + ' undos | ' + v.toFixed(5);
    } finally { await rfMTEnd(); }
  });

  function rfMTUv(p) { return K.to2D(UI.activePlane(), p); }

  step('rfMT flow 7: a sketch on the top face: the face clicked and converted, a hole dimensioned from two converted edges, the block made 5 wide underneath (the hole follows its edge), undo / redo all, edit again, Cut-Extrude', async function () {
    try {
      var f = await rfMTBlockSketch();
      if (rfMTGrid == null) rfMTGrid = UI.App.view.showGrid;
      UI.App.view.showGrid = false; UI.App.gridStale = true;
      f._u0 = UI.App.undo.length;
      await rfMTClickAt(rfMTScr3([2, 0.5, 1.5])); await wait(20);
      UI.cmdConvertEntities(); await wait(40);
      await UI.pmOK(); await idle();
      f = rfMTF();
      assert(f.entities.length === 4, 'converted: ' + f.entities.length);
      var c = rfMTUv([3, 0.5, 1]), r = rfMTUv([3.25, 0.5, 1]);
      UI.setTool('circle'); await wait(20);
      await rfMTClick(c); await rfMTClick(r); await wait(30);
      if (UI.sketchUnitBox && UI.sketchUnitBox.isOpen && UI.sketchUnitBox.isOpen()) { rfMTKey('Escape'); await wait(20); }
      await rfMTEsc(2);
      f = rfMTF();
      assert(f.entities.length === 5 && f.entities[4].t === 'circle', 'the hole drawn: ' + JSON.stringify(f.entities[4]));
      await rfMTDim([rfMTUv([4, 0.5, 2]), c], rfMTUv([3.5, 0.5, 2.4]), '1');
      await rfMTDim([rfMTUv([2, 0.5, 0]), c], rfMTUv([2.6, 0.5, 0.5]), '1');
      await rfMTDim([rfMTUv([3 + 0.25 * 0.7071, 0.5, 1 + 0.25 * 0.7071])], rfMTUv([3.6, 0.5, 1.6]), '1/2');
      var an = rfMTAn();
      assert(an.status === 'full', 'the hole fully defined from the converted edges: ' + an.status + ' ' + an.dof);
      var n = await rfMTUndoAll();
      var id = rfMTF().id, pl = UI.activePlane();
      UI.exitSketch(); await idle();
      UI.App.model.features[0].entities[0].w = 5; await UI.rebuild(); await idle();
      var sk = K.findFeature(UI.App.model, id), ci = sk.entities[4], w = K.to3D(pl, ci.cx, ci.cy);
      near(w[0], 4, 1e-6, 'the hole stays 1 from the moved edge'); near(w[2], 1, 1e-6, 'and 1 from the front edge');
      // Extruded Cut of the hole alone (the converted outline is the face itself): Up To Next is the plate's .5
      sk.entities.slice(0, 4).forEach(function (e) { e.construction = true; });
      UI.App.sel = { kind: 'feature', id: id };
      UI.cmdExtrude(true); await wait(40);
      await UI.pmOK(); await idle();
      var cutF = UI.App.model.features[UI.App.model.features.length - 1], cd = cutF.end === 'blind' ? Math.min(0.5, cutF.depth) : 0.5;
      assert(cutF.cut, 'a Cut-Extrude: ' + JSON.stringify(cutF));
      near(anvil.mass().volume, 7.5 - Math.PI * 0.0625 * cd, 1e-6, 'the plate 5 x 3 x .5 less the hole (' + cutF.end + ' ' + cutF.depth + ')');
      return 'hole centre ' + JSON.stringify(w) + ' | ' + n + ' undos | ' + cutF.type + (cutF.cut ? ' cut' : '') + ' volume ' + anvil.mass().volume.toFixed(5);
    } finally { await rfMTEnd(); }
  });

  step('rfMT flow 8: a bracket outline with a sloped side drawn as one chain, a corner dragged while under defined (relations hold, the origin corner stays), Fully Define Sketch, two of its dimensions changed, undo / redo all, edit again, Boss-Extrude', async function () {
    try {
      var f = await rfMTNew();
      UI.setTool('line'); await wait(20);
      var P = [[0, 0], [5, 0], [5, 1], [2, 3], [0, 3], [0, 0]];
      for (var k = 0; k < P.length; k++) await rfMTClick(P[k]);
      await rfMTEsc(2);
      f = rfMTF();
      assert(f.entities.length === 5, 'five lines: ' + JSON.stringify(f.entities));
      var types = (f.rels || []).map(function (r) { return r.type; }).sort().join(',');
      UI.setTool('select'); await wait(20);
      await rfMTDrag([2, 3], [2.5, 3.3], 10);
      f = rfMTF();
      var E = f.entities;
      near(E[3].y1, E[3].y2, 1e-9, 'the top stays level'); near(E[0].y1, 0, 1e-9, 'the bottom stays on the origin');
      near(E[0].x1, 0, 1e-9, 'the origin corner stays');
      near(E[4].x1, E[4].x2, 1e-9, 'the left side stays vertical');
      assert(Math.abs(E[2].x2 - 2.5) < 0.02 && Math.abs(E[2].y2 - 3.3) < 0.02, 'the corner went with the pointer: ' + JSON.stringify(E[2]));
      near(E[2].x2, E[3].x1, 1e-9, 'the corner stays joined');
      UI.cmdFullyDefineSketch(); await wait(60);
      await UI.pmOK(); await idle(); await wait(30);
      var an = rfMTAn();
      assert(an.status === 'full', 'Fully Define: ' + an.status + ' ' + an.dof);
      UI.drawDims(true);
      var labels = Array.prototype.map.call(D.querySelectorAll('#dim-layer text'), function (x) { return x.textContent; });
      await rfMTEditDim(/^5(\.0*)?$/, '6');
      f = rfMTF();
      near(Math.max(f.entities[0].x1, f.entities[0].x2), 6, 1e-9, 'bottom 6 long');
      await rfMTEditDim(/^1(\.0*)?$/, '1 1/4');
      f = rfMTF();
      near(Math.abs(f.entities[1].y2 - f.entities[1].y1), 1.25, 1e-9, 'right side 1 1/4');
      var E2 = f.entities, pts = [[E2[0].x1, E2[0].y1], [E2[1].x1, E2[1].y1], [E2[2].x1, E2[2].y1], [E2[3].x1, E2[3].y1], [E2[4].x1, E2[4].y1]];
      var area = 0; for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
      var n = await rfMTUndoAll();
      var v = await rfMTExtrude(0.1875, Math.abs(area) / 2);
      return types + ' | ' + labels.join(',') + ' | ' + n + ' undos | ' + v.toFixed(5);
    } finally { await rfMTEnd(); }
  });

  step('rfMT: the Smart Dimension flyout showing any of its 11 commands (three-line labels such as Horizontal Ordinate Dimension included) leaves the CommandManager the same height in every interface profile (it grew 13 px)', async function () {
    await rfMTNew();
    var out = [], P = UI.Profiles, was = P.active(), keep = UI.ribbonFlyFace('dim');
    try {
      var names = P.list().map(function (x) { return x.name || x.id || x; });
      for (var q = 0; q < names.length; q++) {
        await P.set(names[q]); await wait(60);
        var hs = [], three = 0;
        for (var i = 0; i < 11; i++) {
          UI.ribbonFlyFace('dim', i); await wait(20);
          var sp = Array.prototype.filter.call(D.querySelectorAll('#ribbon .rb-fly > .rb > span'), function (s) { return /Dimension|Autodim/.test(s.textContent); })[0];
          if (sp && sp.offsetHeight > 30) three++;
          hs.push($('ribbon').offsetHeight);
        }
        assert(hs.every(function (h) { return h === hs[0]; }), names[q] + ': the ribbon height changes with the face: ' + hs.join(','));
        out.push(names[q] + ' ' + hs[0] + ' px (' + three + ' three-line faces)');
      }
    } finally {
      await P.set(was);
      UI.ribbonFlyFace('dim', keep || 0);
      await rfMTEnd();
    }
    return out.join('; ');
  });