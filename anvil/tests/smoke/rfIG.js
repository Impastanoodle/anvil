  // --- rfIG (2026-11-05, lane dimmid) --- user: "make the smart dimension able to select center points of any line".
  // Smart Dimension takes a line's midpoint (SolidWorks): rest the cursor by the middle of a line and its marker shows;
  // a click then picks the midpoint ('<i>.mid'), not the line; right-click a line ▸ Select Midpoint picks it too. The
  // dimensions are driving distances (horizontal / vertical / aligned by placement) that stay on the midpoint. Plus the
  // cursor descriptor (user: "a little descriptor of what youre hovering over"): Endpoint / Midpoint / Center / Line …
  // An inch sketch at 0.02 in per pixel; the grid (an earlier group may leave it on: its snap moves clicks), numeric
  // input and Quick Snaps are off for each step and put back after it.
  var rfIGSaved = null;
  function rfIGSet() {
    var V = UI.App.view;
    if (!rfIGSaved) rfIGSaved = { grid: V.showGrid, i2d: V.instant2D, qs: UI.App.quickSnap, num: UI.sketchNumericInput() };
    V.showGrid = false; V.instant2D = false; UI.App.quickSnap = null; UI.sketchNumericInput(false);
    UI.App.gridStale = true;
  }
  function rfIGRestore() {
    var s = rfIGSaved, V = UI.App.view;
    if (!s) return;
    rfIGSaved = null;
    V.showGrid = s.grid; V.instant2D = s.i2d; UI.App.quickSnap = s.qs; UI.sketchNumericInput(s.num);
    UI.App.gridStale = true; UI.App.dimsStale = true;
  }
  function rfIGStep(name, fn) { step(name, async function () { try { return await fn(); } finally { try { if (UI.isDimEditOpen && UI.isDimEditOpen()) UI.cancelDimEdit(); UI.setTool('select'); } catch (e) { /* no sketch */ } rfIGRestore(); } }); }
  // a 4 x 2 rectangle from (1, 1) to (5, 3) as the Corner Rectangle tool leaves it (four lines, H / V / coincident) and
  // a free line (7, 0)-(9, 2); returns { f, top, bottom, right, free } (entity indices)
  async function rfIGNew() {
    await rskNew(); rfIGSet();
    UI.App.model.units = 'in';
    UI.zoomView(0.02 / UI.cam.scale);   // 0.02 in per pixel (the whole test geometry inside a small viewport)
    var pc = UI.worldToScreen(K.to3D(UI.activePlane(), 4, 1.5)), c = [UI.size.w / 2, UI.size.h / 2];
    UI.panView(c[0] - pc[0], c[1] - pc[1]);
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'rect', x: 1, y: 1, w: 4, h: 2 });
    W.SketchSolver.explodeRect(f, f.entities.length - 1);
    f.entities.push({ t: 'line', x1: 7, y1: 0, x2: 9, y2: 2 });
    UI.updateSketches(); UI.setSelection([]); await idle();
    function find(fn) { for (var i = 0; i < f.entities.length; i++) if (f.entities[i].t === 'line' && fn(f.entities[i])) return i; return -1; }
    var r = {
      f: f,
      top: find(function (e) { return e.y1 === 3 && e.y2 === 3; }),
      bottom: find(function (e) { return e.y1 === 1 && e.y2 === 1; }),
      right: find(function (e) { return e.x1 === 5 && e.x2 === 5; }),
      free: find(function (e) { return e.x1 === 7; })
    };
    assert(r.top >= 0 && r.bottom >= 0 && r.right >= 0 && r.free >= 0, 'rectangle lines ' + JSON.stringify(f.entities));
    return r;
  }
  // rest the cursor at uv (the midpoint marker shows after UI.dimMidDwell() ms), then click there
  async function rfIGRest(uv) { selEv('mousemove', rskScr(uv)); await wait(UI.dimMidDwell() + 60); }
  async function rfIGMidClick(uv) { await rfIGRest(uv); selClick(rskScr(uv)); await wait(10); }
  function rfIGMarker() { return !!D.querySelector('#dim-layer .sk-feedback .sk-mid-hover'); }
  // the relation just placed (addRelation keeps the list in its own order: the selection names it)
  var rfIGSeen = [];
  function rfIGMark(f) { rfIGSeen = f.rels.slice(); }
  function rfIGLast(f) { var n = f.rels.filter(function (r) { return rfIGSeen.indexOf(r) < 0; }); rfIGMark(f); return n[n.length - 1] || { none: $('status-msg').textContent + ' / ' + ((D.querySelector('.toast') || {}).textContent || '') + ' / n ' + f.rels.length + ' modal ' + !!modalOpen() }; }
  function rfIGMid(f, i) { var e = f.entities[i]; return [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2]; }
  // the Modify box: type a value, Enter
  async function rfIGModify(v) {
    var inp = $('dim-edit').querySelector('input');
    assert(UI.isDimEditOpen(), 'the Modify box is open');
    inp.value = String(v); inp.dispatchEvent(new W.Event('input', { bubbles: true }));
    inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await idle();
  }
  rfIGStep('rfIG: Smart Dimension from the top edge\'s midpoint of a 4 x 2 rectangle to the origin — resting at the middle shows the midpoint marker (label Midpoint), the click takes the midpoint; placed above it is the horizontal 3, beside it the vertical 3; Modify to 4 moves the rectangle so the midpoint lands at x = 4; Ctrl+Z takes the dimension back', async function () {
    need(UI, 'dimMidDwell'); need(UI, 'sketchHoverLabel');
    var g = await rfIGNew(), f = g.f;
    rfIGMark(f);
    UI.setTool('dimension');
    await rfIGRest([3, 3]);
    assert(rfIGMarker() && UI.sketchHoverLabel() === 'Midpoint', 'midpoint marker and label: ' + UI.sketchHoverLabel());
    selClick(rskScr([3, 3])); await wait(10);
    assert(UI.App.toolState.pt1 === g.top + '.mid', 'picked the midpoint: ' + UI.App.toolState.pt1);
    rskClick([0, 0]);
    var rd = UI.App.toolState.relDim;
    assert(rd && rd.refs.join() === g.top + '.mid,O', 'midpoint to origin: ' + JSON.stringify(rd) + ' ' + $('sketch-hint').textContent);
    rskClick([1.5, 4.2]); await idle();
    var d = rfIGLast(f);
    assert(d.type === 'distance' && d.refs.join() === g.top + '.mid,O' && d.dir === 'h' && Math.abs(d.v - 3) < 1e-9, 'horizontal midpoint to origin: ' + JSON.stringify(d));
    await rfIGModify(4);
    var m = rfIGMid(f, g.top);
    near(m[0], 4, 1e-7, 'the midpoint is driven to x = 4');
    near(Math.abs(f.entities[g.top].x2 - f.entities[g.top].x1), 4, 1e-7, 'the edge keeps its length');
    near(m[1], 3, 1e-7, 'the edge stays at y = 3');
    var nRel = f.rels.length;
    rfIGMark(f);
    // vertical by placement (to the right of both points)
    await rfIGMidClick(m);
    rskClick([0, 0]); rskClick([7, 1.5]); await idle();
    d = rfIGLast(f);
    assert(f.rels.length === nRel + 1 && d.dir === 'v' && Math.abs(d.v - 3) < 1e-9 && d.refs[0] === g.top + '.mid', 'vertical midpoint to origin: ' + JSON.stringify(d));
    if (UI.isDimEditOpen()) UI.cancelDimEdit();
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); await idle();
    f = UI.activeSketchFeature();   // (undo puts back a copy of the sketch)
    assert(f.rels.length === nRel && !f.rels.some(function (r) { return r.dir === 'v' && r.refs[0] === g.top + '.mid'; }), 'Ctrl+Z took the vertical dimension back: ' + JSON.stringify(f.rels.slice(-2)));
    return 'horizontal 3 → 4 drives the midpoint; vertical 3; undo';
  });
  rfIGStep('rfIG: midpoint to midpoint of two lines (horizontal 5 placed below), midpoint to a line (the perpendicular distance 3 from the free line\'s midpoint to the right edge); a quick click on the middle of a line and a click off its middle still dimension the line (length 4)', async function () {
    var g = await rfIGNew(), f = g.f;
    rfIGMark(f);
    UI.setTool('dimension');
    await rfIGMidClick([3, 3]); await rfIGMidClick([8, 1]); rskClick([5.5, -1]); await idle();
    var d = rfIGLast(f);
    assert(d.type === 'distance' && d.refs.join() === g.top + '.mid,' + g.free + '.mid' && d.dir === 'h' && Math.abs(d.v - 5) < 1e-9, 'midpoint to midpoint: ' + JSON.stringify(d));
    if (UI.isDimEditOpen()) UI.cancelDimEdit();
    await rfIGMidClick([8, 1]); rskClick([5, 1.5]); rskClick([6.5, 2.5]); await idle();
    d = rfIGLast(f);
    assert(d.type === 'distance' && d.refs.join() === g.free + '.mid,' + g.right && Math.abs(d.v - 3) < 1e-9, 'midpoint to line: ' + JSON.stringify(d));
    near(W.SketchSolver.measure(f, 'distance', d.refs), 3, 1e-9, 'perpendicular distance');
    if (UI.isDimEditOpen()) UI.cancelDimEdit();
    // off the middle: the line (its length)
    var n0 = (f.dims || []).length;
    rskClick([2, 3]); rskClick([2, 3.6]); await idle();
    assert(f.dims.length === n0 + 1 && f.dims[n0].e === g.top && Math.abs(K.dimValue(f.entities[g.top], f.dims[n0]) - 4) < 1e-9, 'line length off its middle: ' + JSON.stringify(f.dims));
    if (UI.isDimEditOpen()) UI.cancelDimEdit();
    // a quick click on the middle (no rest): the line too
    rskClick([3, 1]); rskClick([3, 0.4]); await idle();
    assert(f.dims.length === n0 + 2 && f.dims[n0 + 1].e === g.bottom, 'a quick click at the middle takes the line: ' + JSON.stringify(f.dims));
    return 'mid–mid 5, mid–line 3, line lengths';
  });
  rfIGStep('rfIG: right-click a line while Smart Dimension runs ▸ Select Midpoint picks its midpoint; the distance to the origin is placed and driving; it survives Exit Sketch (rebuild), save / reopen and the script round trip', async function () {
    var g = await rfIGNew(), f = g.f;
    rfIGMark(f);
    UI.setTool('dimension');
    var p = rskScr([2, 1]);
    selEv('mousemove', p); selEv('mousedown', p, $('viewport'), { button: 2, buttons: 2 }); selEv('mouseup', p, null, { button: 2, buttons: 0 });
    await wait(20);
    var mi = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (x) { return /Select Midpoint/.test(x.textContent); })[0];
    assert(mi, 'Select Midpoint in the right-click menu: ' + Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (x) { return x.textContent; }).join('|'));
    mi.click(); await wait(10);
    assert(UI.App.toolState.pt1 === g.bottom + '.mid', 'the midpoint is picked: ' + UI.App.toolState.pt1);
    rskClick([0, 0]); rskClick([-1, 0.5]); await idle();
    var d = rfIGLast(f);
    assert(d.type === 'distance' && d.refs.join() === g.bottom + '.mid,O' && d.dir === 'v' && Math.abs(d.v - 1) < 1e-9, 'vertical midpoint to origin: ' + JSON.stringify(d));
    await rfIGModify(1.5);
    near(rfIGMid(f, g.bottom)[1], 1.5, 1e-7, 'driven: the bottom edge at y = 1.5');
    var id = f.id;
    await UI.exitSketch(); await idle();
    function check(where) {
      var sk = K.findFeature(UI.App.model, id), r = sk && sk.rels.filter(function (x) { return x.type === 'distance' && x.refs.join() === g.bottom + '.mid,O'; })[0];
      assert(r && Math.abs(r.v - 1.5) < 1e-9, where + ': ' + JSON.stringify(sk && sk.rels.slice(-2)));
      var e = sk.entities[g.bottom];
      near((e.y1 + e.y2) / 2, 1.5, 1e-7, where + ': the midpoint stays at 1.5');
    }
    check('after the rebuild');
    var json = anvil.model();
    await anvil.newPart(); await idle();
    await anvil.load(json); await idle();
    check('after save / reopen');
    var src = anvil.script();
    assert(/\.mid/.test(src), 'the script names the midpoint');
    await anvil.newPart(); await idle();
    await anvil.run(src); await idle();
    var sk2 = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    assert(sk2 && sk2.rels.some(function (x) { return x.type === 'distance' && x.refs.join() === g.bottom + '.mid,O' && Math.abs(x.v - 1.5) < 1e-9; }), 'script round trip: ' + JSON.stringify(sk2 && sk2.rels.slice(-2)));
    return 'Select Midpoint, driven 1 → 1.5, rebuild, reopen, script';
  });
  rfIGStep('rfIG: the cursor descriptor — while the Line tool draws it names the snap (Endpoint, Midpoint, Center, Origin, On curve); under Smart Dimension what the click takes (Line, Midpoint after a rest, Endpoint, Circle, Center, Origin); under the Select tool the hovered point / entity (Endpoint, Line, Arc); nothing when the cursor leaves', async function () {
    var g = await rfIGNew(), f = g.f;
    f.entities.push({ t: 'circle', cx: 3, cy: -2, r: 0.5 }, { t: 'arc', cx: 8, cy: -2, r: 0.75, a0: 0, a1: 180 });
    UI.updateSketches(); await idle();
    function at(uv, ms) { selEv('mousemove', rskScr(uv)); return wait(ms || 80).then(function () { return UI.sketchHoverLabel(); }); }
    var seen = {};
    UI.setTool('line');
    seen.lineEnd = await at([5.03, 3.02]);
    seen.lineMid = await at([3.02, 3.03]);
    seen.lineCen = await at([3.02, -2.02]);
    seen.lineOrg = await at([0.02, 0.03]);
    seen.lineOn = await at([3.25, -2.433]);
    seen.lineNone = await at([-1.2, -0.8]);
    assert(seen.lineEnd === 'Endpoint' && seen.lineMid === 'Midpoint' && seen.lineCen === 'Center' && seen.lineOrg === 'Origin' && seen.lineOn === 'On curve' && seen.lineNone === null, 'Line tool: ' + JSON.stringify(seen));
    var lab = D.querySelector('#dim-layer .sk-snap-label');
    assert(!lab, 'no label left behind');
    await at([5.03, 3.02]);
    lab = D.querySelector('#dim-layer .sk-snap-label');
    var lb = lab && lab.getBBox(), cur = rskScr([5.03, 3.02]);
    assert(lb && !(cur[0] >= lb.x && cur[0] <= lb.x + lb.width && cur[1] >= lb.y && cur[1] <= lb.y + lb.height), 'the label is off the cursor');
    UI.setTool('dimension');
    seen.dimLine = await at([2, 3]);
    seen.dimMid = await at([3, 3], UI.dimMidDwell() + 60);
    seen.dimEnd = await at([5, 3]);
    seen.dimCircle = await at([3.5, -2]);
    seen.dimCen = await at([3, -2]);
    seen.dimOrg = await at([0, 0]);
    seen.dimNone = await at([-1.2, -0.8]);
    assert(seen.dimLine === 'Line' && seen.dimMid === 'Midpoint' && seen.dimEnd === 'Endpoint' && seen.dimCircle === 'Circle' && seen.dimCen === 'Center' && seen.dimOrg === 'Origin' && seen.dimNone === null, 'Smart Dimension: ' + JSON.stringify(seen));
    UI.setTool('select');
    seen.selEnd = await at([1, 1]);
    seen.selLine = await at([2, 1]);
    seen.selArc = await at([8, -1.25]);
    seen.selNone = await at([-1.2, -0.8]);
    assert(seen.selEnd === 'Endpoint' && seen.selLine === 'Line' && seen.selArc === 'Arc' && seen.selNone === null, 'Select: ' + JSON.stringify(seen));
    return JSON.stringify(seen);
  });
  // --- rfIG Select Chain (user: "when i shift click a line in sketch i want it to select the chain") ---
  function rfIGSelIdx() { return anvil.selection().filter(function (s) { return s.kind === 'entity'; }).map(function (s) { return s.index; }).sort(function (a, b) { return a - b; }).join(','); }
  function rfIGShift(uv) { selClick(rskScr(uv), { shiftKey: true }); }
  rfIGStep('rfIG: Shift+click in a sketch selects the chain — an open chain of two lines and an arc (not the rectangle beside it), a rectangle side its four sides, a T junction stops the chain, Shift+click on a selected chain removes it; Ctrl+click stays one entity; right-click ▸ Select Chain; Delete removes the chain and Undo puts it back', async function () {
    need(UI, 'selectSketchChain');
    await rskNew(); rfIGSet();
    UI.App.model.units = 'in';
    UI.zoomView(0.02 / UI.cam.scale);
    var pc = UI.worldToScreen(K.to3D(UI.activePlane(), 3, 2)), c = [UI.size.w / 2, UI.size.h / 2];
    UI.panView(c[0] - pc[0], c[1] - pc[1]);
    var f = UI.activeSketchFeature();
    // 0-2: an open chain (0,0)-(2,0)-(2,2) then an arc on to (3,3); 3-6: a rectangle (4,0)-(6,2); 7-9: a T, three
    // lines meeting at (0,4): (-1,4)-(0,4), (0,4)-(1,4), (0,4)-(0,5)
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 2, y2: 0 }, { t: 'line', x1: 2, y1: 0, x2: 2, y2: 2 }, { t: 'arc', cx: 3, cy: 2, r: 1, a0: 90, a1: 180 });
    f.entities.push({ t: 'rect', x: 4, y: 0, w: 2, h: 2 });
    W.SketchSolver.explodeRect(f, 3);
    f.entities.push({ t: 'line', x1: -1, y1: 4, x2: 0, y2: 4 }, { t: 'line', x1: 0, y1: 4, x2: 1, y2: 4 }, { t: 'line', x1: 0, y1: 4, x2: 0, y2: 5 });
    UI.updateSketches(); UI.setSelection([]); await idle();
    assert(f.entities.length === 10, 'entities ' + f.entities.length);
    rfIGShift([1, 0]); await idle();
    assert(rfIGSelIdx() === '0,1,2', 'the open chain: ' + rfIGSelIdx());
    rfIGShift([5, 0]); await idle();
    assert(rfIGSelIdx() === '0,1,2,3,4,5,6', 'the rectangle added: ' + rfIGSelIdx());
    rfIGShift([2, 1]); await idle();
    assert(rfIGSelIdx() === '3,4,5,6', 'Shift+click on the selected chain takes it away: ' + rfIGSelIdx());
    UI.setSelection([]); await idle();
    rfIGShift([-0.5, 4]); await idle();
    assert(rfIGSelIdx() === '7', 'the T junction stops the chain: ' + rfIGSelIdx());
    UI.setSelection([]); await idle();
    selClick(rskScr([1, 0]), { ctrlKey: true }); await idle();
    assert(rfIGSelIdx() === '0', 'Ctrl+click: one entity: ' + rfIGSelIdx());
    selClick(rskScr([5, 2]), { ctrlKey: true }); await idle();
    assert(rfIGSelIdx().split(',').length === 2, 'Ctrl+click adds one: ' + rfIGSelIdx());
    UI.setSelection([]); await idle();
    // right-click ▸ Select Chain
    var p = rskScr([2, 0.5]);
    selEv('mousemove', p); selEv('mousedown', p, $('viewport'), { button: 2, buttons: 2 }); selEv('mouseup', p, null, { button: 2, buttons: 0 });
    await wait(20);
    var mi = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (x) { return /Select Chain/.test(x.textContent); })[0];
    assert(mi, 'Select Chain in the menu: ' + Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (x) { return x.textContent; }).join('|'));
    mi.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true })); mi.click(); await idle();   // (a user's press, then the click)
    assert(rfIGSelIdx() === '0,1,2', 'right-click ▸ Select Chain: ' + rfIGSelIdx());
    // Delete (the menu's Delete row: the Del key's binding is the user's, an earlier group may change it), then Ctrl+Z
    UI.deleteSelection(); await idle();
    f = UI.activeSketchFeature();
    assert(f.entities.length === 7 && !f.entities.some(function (e) { return e.t === 'arc'; }), 'Delete removed the chain: ' + f.entities.length);
    (UI.undoCommand || UI.undo)(); await idle();   // (Edit ▸ Undo)
    f = UI.activeSketchFeature();
    assert(f.entities.length === 10, 'Undo put the chain back: ' + f.entities.length);
    return 'open chain, rectangle, T stop, toggle, Ctrl single, menu, Delete / undo';
  });
  // --- rfIG drawing: Smart Dimension in a drawing view takes an edge's midpoint the same way ---
  var RFIG_PLATE = 'p.name("IGPlate").units("in");\np.sketch("Front").rect(0, 0, 4, 2).extrude(0.25);';
  function rfIGDMouse(type, p) {
    var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
    pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
    var q = pt.matrixTransform(m);
    svg.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: q.x, clientY: q.y, detail: 1 }));
  }
  function rfIGDClick(p) { rfIGDMouse('mousemove', p); rfIGDMouse('mousedown', p); rfIGDMouse('mouseup', p); }
  function rfIGDLabel() { var t = D.querySelector('#drawing-sheet .dw-snap-label text'); return t ? t.textContent : null; }
  step('rfIG: drawing Smart Dimension — resting at the middle of the Front view\'s top edge shows the midpoint (label Midpoint) and the click takes it; to the left edge it is the horizontal 2.000; the dimension stays on the midpoint when the plate widens to 6 (3.000); a quick click at the middle still takes the edge (4.000)', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(RFIG_PLATE); await idle();
    anvil.drawing.make({ fresh: true }); await idle(); await wait(60);
    await UI.drawing.ready();
    if (anvil.drawing.doc().autoDims) { anvil.drawing.modelItems(false); await idle(); await UI.drawing.ready(); }
    UI.drawing.fit(); await wait(20);
    var w = UI.drawing.state.sheet.views.filter(function (x) { return x.view.orient === 'Front'; })[0], k = UI.drawing.state.sheet.units === 'in' ? 1 : 25.4;
    assert(w, 'Front view');
    var vid = w.view.id, top = w.toSheet([2, 2]), edgeAt = w.toSheet([1, 2]), left = w.toSheet([0, 1]), above = w.toSheet([1, 2]);
    above = [above[0], above[1] + 0.5 * k];
    function userDims() { return UI.drawing.state.sheet.dims.filter(function (d) { return d.view === vid && !d.auto; }); }
    try {
      UI.drawing.smartDimension(); await wait(10);
      rfIGDMouse('mousemove', edgeAt); await wait(UI.dimMidDwell() + 60);
      assert(rfIGDLabel() === 'Edge', 'on the edge: ' + rfIGDLabel());
      rfIGDMouse('mousemove', top); await wait(UI.dimMidDwell() + 60);
      assert(rfIGDLabel() === 'Midpoint', 'at the middle after a rest: ' + rfIGDLabel());
      rfIGDClick(top); await wait(10);
      var P = UI.drawing.state.pending;
      assert(P && P.first && P.first.pick.mid, 'the midpoint picked: ' + JSON.stringify(P && P.first && P.first.pick));
      rfIGDClick(left); await wait(10);
      rfIGDClick(above); await idle(); await UI.drawing.ready(); await wait(20);
      var u = userDims();
      assert(u.length === 1 && u[0].kind === 'h' && u[0].text === '2.000', 'midpoint to the left edge: ' + JSON.stringify(u.map(function (d) { return [d.kind, d.text]; })));
      for (var i = 0; i < 4 && ((UI.hasPM && UI.hasPM()) || UI.drawing.state.tool); i++) UI.escapeCommand();
      // the part widens: the dimension follows the midpoint (the drawing computed again from the rebuilt part)
      var model = JSON.parse(JSON.stringify(UI.App.model)), sk = model.features.filter(function (x) { return x.type === 'sketch'; })[0];
      sk.entities.forEach(function (e) { if (e.t === 'rect') e.w = 6; else if (e.t === 'line') { if (e.x1 === 4) e.x1 = 6; if (e.x2 === 4) e.x2 = 6; } });
      var b = K.rebuild(model), sheet = W.Drawing.compute(JSON.parse(JSON.stringify(anvil.drawing.doc())), K.meshFromBody(b.body), model, { build: b });
      var u2 = sheet.dims.filter(function (d) { return d.view === vid && !d.auto; });
      assert(u2.length === 1 && u2[0].text === '3.000' && !u2[0].dangling, 'after the plate widened: ' + JSON.stringify(u2.map(function (d) { return [d.kind, d.text, !!d.dangling]; })));
      // a quick click at the middle (no rest): the edge, its length
      UI.drawing.smartDimension(); await wait(10);
      rfIGDMouse('mousemove', [top[0] + 3, top[1] + 3]); await wait(UI.dimMidDwell() + 60);
      rfIGDClick(top); await wait(10);
      P = UI.drawing.state.pending;
      assert(P && P.first && P.first.pick.edge, 'a quick click takes the edge: ' + JSON.stringify(P && P.first && P.first.pick));
      rfIGDClick(above); await idle(); await UI.drawing.ready(); await wait(20);
      assert(userDims().some(function (d) { return d.text === '4.000'; }), 'edge length 4.000');
    } finally {
      for (var j = 0; j < 4 && ((UI.hasPM && UI.hasPM()) || UI.drawing.state.tool); j++) UI.escapeCommand();
    }
    return 'midpoint → left edge 2.000, follows to 3.000, edge 4.000';
  });
