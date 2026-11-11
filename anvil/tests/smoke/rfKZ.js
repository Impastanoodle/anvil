  // ---- rfKZ (local-2026-11-11a, lane sketchflow2): four more shop sketches drawn the SolidWorks way (report
  // test-reports/2026-11-11-sketch-flow.md, Round 2); one step per fix: Offset Entities of the face a sketch is on (one
  // chain, Offset relation + dimension, fully defined) and the view kept when it is already normal to the face; a
  // dimension typed "=W" stays linked to the global variable; a fully defined line dragged leaves no undo step; Over
  // Defined in the status bar opens SketchXpert; Delete says what went with the entity
  function rfKZScr(uv) { var p = UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])), r = $('viewport').getBoundingClientRect(); return [Math.round(r.left + p[0]), Math.round(r.top + p[1])]; }
  function rfKZEv(type, c, mods) {
    (type === 'mousedown' ? $('viewport') : W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: c[0], clientY: c[1] }, mods || {})));
  }
  async function rfKZClick(uv) { var c = rfKZScr(uv); rfKZEv('mousemove', c); rfKZEv('mousedown', c); rfKZEv('mouseup', c); await wait(20); }
  function rfKZKey(k) { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
  // a new inch part, sketch on Front, x -0.8..9, y -2..4.5 in view, with entities / relations / dimensions put in
  async function rfKZNew(ents, rels, dims, eqs) {
    await anvil.newPart(); await idle();
    if (eqs) { UI.App.model.equations = eqs; await UI.rebuild(); await idle(); }
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    var a = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0)), b = UI.worldToScreen(K.to3D(UI.activePlane(), 1, 0));
    UI.zoomView(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.min(UI.size.w / 10, UI.size.h / 6.5));
    var o = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0));
    UI.panView(UI.size.w * 0.08 - o[0], UI.size.h * 0.72 - o[1]);
    var f = UI.activeSketchFeature();
    (ents || []).forEach(function (e) { f.entities.push(e); });
    if (rels) f.rels = rels;
    if (dims) f.dims = dims;
    UI.updateSketches(); await wait(30);
    return f;
  }

  step('rfKZ: Offset Entities on a sheet wall\'s face (nothing selected) makes one chain held by an Offset relation and the .25 dimension, fully defined (it made a loose polyline, no dimension); a sketch opened with the view already normal to the face keeps the zoom', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(2, [[3, 0.06, 0]]);'); await idle();
    var idx = faceWithNormal([0, 0, 1]);
    near(UI.App.mesh.faces[idx].area, 12, 1e-6, 'the wall\'s inner face');
    UI.setView('Front', false); UI.zoomView(0.6); if (UI.finishViewAnimation) UI.finishViewAnimation();
    var s0 = UI.cam.scale;
    UI.App.sel = { kind: 'face', index: idx, point: [3, 1.5, -0.06] };
    UI.cmdSketch(); await idle();
    assert(UI.App.mode === 'sketch', 'sketch on the face');
    assert(UI.sketchViewIsNormal(), 'view normal to the face');
    near(UI.cam.scale, s0, 1e-12, 'zoom kept (no Zoom to Fit)');
    var f = UI.activeSketchFeature();
    assert(UI.sketchFaceIndex() === idx, 'the sketch\'s face found: ' + UI.sketchFaceIndex());
    UI.cmdOffsetEntities(); await wait(40);
    setInput(pmField('Offset distance'), '.25');
    var rv = pmField('Reverse'); rv.click(); await wait(30);
    assert((UI.App.tempEntities || []).length === 4, 'preview: four lines inside');
    await UI.pmOK(); await idle();
    var off = f.rels.filter(function (r) { return r.type === 'offset'; }), dist = f.rels.filter(function (r) { return r.type === 'distance'; });
    assert(off.length === 1 && dist.length === 1 && Math.abs(dist[0].v - 0.25) < 1e-12, 'Offset relation and .25 dimension: ' + JSON.stringify(f.rels));
    assert(f.entities.filter(function (e) { return e.construction; }).length === 4, 'the face edges came in as construction lines');
    assert(f.rels.filter(function (r) { return r.type === 'onEdge'; }).length === 4, 'On Edge');
    assert(UI.App.sketchState.status === 'full', 'fully defined: ' + UI.App.sketchState.status);
    var inner = f.entities.filter(function (e) { return !e.construction; });
    near(Math.min.apply(null, inner.map(function (e) { return Math.min(e.x1, e.x2); })), 0.25, 1e-9, 'left side .25 in');
    near(Math.max.apply(null, inner.map(function (e) { return Math.max(e.y1, e.y2); })), 1.87, 1e-9, 'top .25 below the wall top');
    assert(/Fully Defined/.test(statusText()), statusText());
    UI.cancelSketch && UI.cancelSketch();
    return statusText();
  });

  step('rfKZ: a dimension typed =W in the Modify box stays linked to the global variable: W 3.5 -> 4.25 and a rebuild redraws the line 4.25, label with Σ; the box shows =W; a plain number lets go', async function () {
    var f = await rfKZNew([{ t: 'line', x1: 0, y1: 0, x2: 3, y2: 0 }], [{ type: 'horizontal', refs: ['0'] }, { type: 'coincident', refs: ['0.p1', 'O'] }], null, [{ name: 'W', expr: '3.5' }]);
    UI.setTool('dimension'); await wait(20);
    await rfKZClick([1.2, 0]); await rfKZClick([1.2, -0.8]); await wait(40);
    var box = $('dim-edit').querySelector('input');
    assert(!$('dim-edit').hidden, 'Modify box open');
    setInput(box, '=W'); pressEnter(box); await wait(40);
    assert(f.dims && f.dims[0] && f.dims[0].expr === '=W', 'expr kept: ' + JSON.stringify(f.dims));
    near(f.entities[0].x2, 3.5, 1e-9, 'line 3.5');
    UI.App.model.equations = [{ name: 'W', expr: '4.25' }];
    await UI.rebuild(); await idle();
    near(UI.activeSketchFeature().entities[0].x2, 4.25, 1e-9, 'line follows W');
    await wait(250);
    var lab = Array.prototype.map.call(D.querySelectorAll('#dim-layer text'), function (t) { return t.textContent; }).join(' ');
    assert(/Σ4\.25/.test(lab), 'label: ' + lab);
    assert(UI.openDimEdit(0) && UI.dimEditValue() === '=W', 'box shows the equation: ' + UI.dimEditValue());
    rfKZKey('Escape'); await wait(20);
    var r = UI.editDim(0, '5');
    assert(r.ok, r.error);
    f = UI.activeSketchFeature();
    assert(!f.dims[0].expr, 'unlinked by a plain number');
    UI.App.model.equations = [{ name: 'W', expr: '2' }];
    await UI.rebuild(); await idle();
    near(UI.activeSketchFeature().entities[0].x2, 5, 1e-9, 'no longer follows W');
    UI.setTool('select');
    return lab;
  });

  step('rfKZ: dragging a fully defined line moves nothing, leaves no undo step and says it is fully defined (it said "Dragged Line1" with an empty undo step)', async function () {
    var f = await rfKZNew([{ t: 'line', x1: 0, y1: 0, x2: 4, y2: 0 }], [{ type: 'horizontal', refs: ['0'] }, { type: 'coincident', refs: ['0.p1', 'O'] }], [{ e: 0, k: 'len', off: -0.5 }]);
    assert(W.SketchSolver.analyze(f).status === 'full', 'fully defined');
    UI.App.sketchDirty = false;
    var n0 = UI.App.undo.length, A = rfKZScr([2, 0]), B = rfKZScr([2.5, 1]);
    rfKZEv('mousemove', A); rfKZEv('mousedown', A);
    for (var k = 1; k <= 8; k++) { rfKZEv('mousemove', [A[0] + (B[0] - A[0]) * k / 8, A[1] + (B[1] - A[1]) * k / 8]); await wait(16); }
    rfKZEv('mouseup', B); await wait(40);
    near(f.entities[0].y1, 0, 1e-12, 'did not move');
    assert(UI.App.undo.length === n0, 'no undo step: ' + n0 + ' -> ' + UI.App.undo.length);
    assert(/fully defined: it cannot be dragged/.test(statusText()), statusText());
    return statusText();
  });

  step('rfKZ: Over Defined in the status bar opens SketchXpert; Delete of a line says the dimension and relations that went with it', async function () {
    var f = await rfKZNew([{ t: 'line', x1: 0, y1: 0, x2: 4, y2: 0 }, { t: 'line', x1: 0, y1: 1, x2: 4, y2: 1 }],
      [{ type: 'horizontal', refs: ['0'] }, { type: 'coincident', refs: ['0.p1', 'O'] }, { type: 'distance', refs: ['0.p1', '0.p2'], v: 4, dir: 'h' }],
      [{ e: 0, k: 'len', off: -0.5 }]);
    UI.updateSketches(); if (UI.refreshStatus) UI.refreshStatus(); await wait(30);
    var st = D.querySelector('.sk-state');
    assert(st && /\bover\b/.test(st.className), 'status bar shows Over Defined: ' + (st && st.className));
    st.dispatchEvent(new W.MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(40);
    assert(UI.sketchXpertState && UI.sketchXpertState(), 'SketchXpert open');
    assert(/SketchXpert/.test(D.querySelector('#pm').textContent), 'SketchXpert PM');
    rfKZKey('Escape'); await wait(30);
    UI.closePM && UI.closePM();
    f.rels.pop(); UI.updateSketches(); await wait(20);
    UI.setTool('select'); await wait(20);
    await rfKZClick([2, 0]); await wait(30);
    rfKZKey('Delete'); await wait(40);
    f = UI.activeSketchFeature();
    assert(f.entities.length === 1, 'line deleted');
    assert(/Deleted Line1 with 1 dimension and 2 relations on it/.test(statusText()), statusText());
    return statusText();
  });
