  // ---- rfMM (local-2026-11-13a, lane sketchleft): the sketch items the 2026-11-11 sketch-flow report left open, by
  // real mouse / key events: a centerline from one rectangle side's midpoint to the other's gets Midpoint at both ends;
  // dragging a rectangle corner leaves an original Symmetric to a copy where it was; Esc takes a drawing tool's prompt
  // off the status bar; Autodimension of a straight slot places its centre and its first end centre (SolidWorks'
  // reference sketch, head-tools/sw-reference/ref3_auto.py)
  function rfMMScr(uv) { var p = UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])), r = $('viewport').getBoundingClientRect(); return [Math.round(r.left + p[0]), Math.round(r.top + p[1])]; }
  function rfMMEv(type, c, mods) {
    (type === 'mousedown' ? $('viewport') : W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: c[0], clientY: c[1] }, mods || {})));
  }
  async function rfMMMove(uv) { rfMMEv('mousemove', rfMMScr(uv)); await wait(20); }
  async function rfMMClick(uv) { var c = rfMMScr(uv); rfMMEv('mousemove', [c[0] + 3, c[1] + 2]); await wait(15); rfMMEv('mousemove', c); await wait(15); rfMMEv('mousedown', c); rfMMEv('mouseup', c); await wait(25); }
  function rfMMKey(k) { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
  // a new part, grid snap off, a sketch on Front with x -0.8..9, y -2..4.5 in view, entities / relations put in
  async function rfMMNew(ents, rels) {
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    var a = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0)), b = UI.worldToScreen(K.to3D(UI.activePlane(), 1, 0));
    UI.zoomView(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.min(UI.size.w / 10, UI.size.h / 6.5));
    var o = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0));
    UI.panView(UI.size.w * 0.08 - o[0], UI.size.h * 0.72 - o[1]);
    var f = UI.activeSketchFeature();
    (ents || []).forEach(function (e) { f.entities.push(e); });
    if (rels) f.rels = rels;
    UI.updateSketches(); await wait(30);
    return f;
  }
  async function rfMMNoGrid(fn) {
    var was = UI.App.view.showGrid;
    UI.App.view.showGrid = false; UI.App.gridStale = true;
    try { return await fn(); } finally { UI.App.view.showGrid = was; UI.App.gridStale = true; if (UI.App.mode === 'sketch') { UI.setTool('select'); if (UI.cancelSketch) UI.cancelSketch(); await idle(); } }
  }
  function rfMMRectRels() {
    return [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'coincident', refs: ['2.p2', '3.p1'] }, { type: 'coincident', refs: ['3.p2', '0.p1'] },
      { type: 'horizontal', refs: ['0'] }, { type: 'horizontal', refs: ['2'] }, { type: 'vertical', refs: ['1'] }, { type: 'vertical', refs: ['3'] }];
  }
  function rfMMRect() { return [{ t: 'line', x1: 1, y1: 0.5, x2: 5, y2: 0.5 }, { t: 'line', x1: 5, y1: 0.5, x2: 5, y2: 2.5 }, { t: 'line', x1: 5, y1: 2.5, x2: 1, y2: 2.5 }, { t: 'line', x1: 1, y1: 2.5, x2: 1, y2: 0.5 }]; }

  step('rfMM: a Centerline drawn by mouse from the midpoint of a Corner Rectangle\'s left side to the midpoint of its right side gets Midpoint at both ends and no Horizontal, as SolidWorks (the second end got Coincident: Midpoint looked redundant with the inferred Horizontal); the centerline is held', async function () {
    return rfMMNoGrid(async function () {
      var f = await rfMMNew();
      UI.setTool('rect'); await wait(20);
      await rfMMClick([1, 0.5]); await rfMMClick([5, 2.5]);
      UI.setTool('select'); await wait(20);
      var n0 = f.entities.length;
      assert(n0 === 4 && f.entities.every(function (e) { return e.t === 'line'; }), 'four lines: ' + JSON.stringify(f.entities));
      UI.cmdCenterline(); await wait(20);
      await rfMMMove([1.05, 1.4]); await rfMMClick([1, 1.5]);
      await rfMMMove([4.9, 1.55]); await rfMMClick([5, 1.5]);
      UI.setTool('select'); await wait(20);
      var cl = f.entities[n0];
      assert(cl && cl.construction && cl.t === 'line', 'centerline ' + JSON.stringify(f.entities.slice(n0)));
      var mine = (f.rels || []).filter(function (x) { return x.refs.some(function (q) { return String(q).split('.')[0] === String(n0); }); });
      var desc = mine.map(function (x) { return x.type + ' ' + x.refs.join(','); }).join('; ');
      assert(mine.filter(function (x) { return x.type === 'midpoint'; }).length === 2 && !mine.some(function (x) { return x.type === 'horizontal' || x.type === 'coincident'; }), 'two Midpoints, no Horizontal / Coincident: ' + desc);
      var an = W.SketchSolver.analyze(f);
      assert(an.redundant === 0 && an.conflicts === 0 && an.dof === 4, 'centerline held (the rectangle\'s 4 degrees of freedom left), nothing over defined: ' + JSON.stringify({ red: an.redundant, dof: an.dof }));
      return desc;
    });
  });

  step('rfMM: dragging a rectangle corner 1 in out by mouse leaves a circle that is Symmetric to a copy about the centerline where it was; the copy follows the centerline (both moved half way)', async function () {
    return rfMMNoGrid(async function () {
      var ents = rfMMRect().concat([{ t: 'line', x1: 3, y1: 2.5, x2: 3, y2: 0.5, construction: true }, { t: 'circle', cx: 2, cy: 1.5, r: 0.25 }, { t: 'circle', cx: 4, cy: 1.5, r: 0.25 }]);
      var f = await rfMMNew(ents, rfMMRectRels().concat([{ type: 'midpoint', refs: ['4.p1', '2'] }, { type: 'midpoint', refs: ['4.p2', '0'] }, { type: 'symmetric', refs: ['5', '6', '4'] }]));
      UI.setTool('select'); await wait(20);
      var c = rfMMScr([5, 2.5]), d = rfMMScr([6, 2.5]);
      rfMMEv('mousemove', c); await wait(20); rfMMEv('mousedown', c); await wait(20);
      for (var k = 1; k <= 8; k++) { rfMMEv('mousemove', [c[0] + (d[0] - c[0]) * k / 8, c[1]]); await wait(20); }
      rfMMEv('mouseup', d); await idle(); await wait(30);
      f = UI.activeSketchFeature();
      var c0 = f.entities[5], c1 = f.entities[6], cl = f.entities[4];
      assert(f.entities[1].x1 > 5.8, 'the corner was dragged: right side at x ' + f.entities[1].x1);
      near(c0.cx, 2, 2e-3, 'original circle x'); near(c0.cy, 1.5, 2e-3, 'original circle y');
      near(c1.cx, 2 * cl.x1 - c0.cx, 1e-6, 'copy mirrored about the centerline');
      return 'original (' + c0.cx.toFixed(4) + ', ' + c0.cy.toFixed(4) + '), copy x ' + c1.cx.toFixed(4) + ', centerline x ' + cl.x1.toFixed(4);
    });
  });

  step('rfMM: Esc with the Ellipse tool, and the Select button with the Line tool, take the drawing tool\'s prompt off the status bar (it kept "Click the center …" with Select active); a result message stays', async function () {
    return rfMMNoGrid(async function () {
      await rfMMNew();
      UI.setTool('ellipse'); await wait(20);
      var s1 = statusText();
      rfMMKey('Escape'); await wait(30);
      var s2 = statusText();
      assert(UI.App.tool === 'select', 'tool down: ' + UI.App.tool);
      assert(s1 !== s2 && !/center/i.test(s2), 'prompt replaced: [' + s1 + '] -> [' + s2 + ']');
      UI.setTool('line'); await wait(20);
      var s3 = statusText();
      UI.setTool('select'); await wait(20);
      var s4 = statusText();
      assert(s3 !== s4, 'Line prompt replaced: [' + s3 + '] -> [' + s4 + ']');
      UI.setTool('line'); await wait(20);
      UI.setStatus('Chain ended.');
      rfMMKey('Escape'); await wait(30);
      assert(statusText() === 'Chain ended.', 'a result message stays: ' + statusText());
      return s2;
    });
  });

  step('rfMM: Autodimension of SolidWorks\' reference sketch drawn by mouse (4 x 3 corner rectangle, a .5 straight slot 2.5 -> 3.5 at y 1): the slot by its first end centre x 2.5 and its centre x 3.0 from the origin, no centre-to-centre length, as SolidWorks (Anvil gave length 1.0 + centre); Fully Defined', async function () {
    return rfMMNoGrid(async function () {
      var f = await rfMMNew();
      UI.setTool('rect'); await wait(20);
      await rfMMClick([0, 0]); await rfMMClick([4, 3]);
      UI.setTool('slot'); await wait(20);
      await rfMMClick([2.5, 1]); await rfMMClick([3.5, 1]); await rfMMClick([3.5, 1.25]);
      UI.setTool('select'); await wait(20);
      f = UI.activeSketchFeature();
      var cl = f.entities.reduce(function (a, e, i) { return e.t === 'line' && e.construction ? i : a; }, -1), c = f.entities[cl];
      assert(c && c.x1 === 2.5 && c.x2 === 3.5 && c.y1 === 1, 'slot centerline ' + JSON.stringify(c));
      UI.cmdAutodimension(); await idle();
      clickPmButton('Apply'); await idle();
      await UI.pmOK(); await idle();
      f = UI.activeSketchFeature();
      var ds = (f.rels || []).filter(function (r) { return r.type === 'distance' && r.dir === 'h' && String(r.refs[1]).split('.')[0] === String(cl); });
      var desc = ds.map(function (r) { return r.refs.join('-') + ' ' + r.v; }).join(', ');
      assert(ds.length === 2 && ds.some(function (r) { return r.refs[1] === cl + '.p1' && Math.abs(r.v - 2.5) < 1e-9; }) && ds.some(function (r) { return r.refs[1] === cl + '.mid' && Math.abs(r.v - 3) < 1e-9; }), 'slot x 2.5 and centre 3.0: ' + desc);
      assert(!(f.dims || []).some(function (d) { return d.k === 'len'; }), 'no centre-to-centre length: ' + JSON.stringify(f.dims));
      assert(UI.sketchStatus().status === 'full', 'Fully Defined: ' + JSON.stringify(UI.sketchStatus()));
      return desc;
    });
  });
