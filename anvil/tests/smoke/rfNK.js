  // ---- rfNK (local-2026-11-15b, lane sketchflow round 5): the sketcher driven like a shop user on INCH parts, by real
  // mouse / key events (report test-reports/2026-11-15-sketch-flow-5.md): the four slot tools, part-number text for
  // etching, equations in sketch dimensions, symmetric dimensions about a centerline, polygons / ellipses / 3 point
  // rectangles, sketches on offset and slanted planes, dimensions to arcs (Shift+click Min / Max), and a 400-hole plate
  function rfNKScr3(p) { var s = UI.worldToScreen(p), r = $('viewport').getBoundingClientRect(); return [Math.round(r.left + s[0]), Math.round(r.top + s[1])]; }
  function rfNKScr(uv) { return rfNKScr3(K.to3D(UI.activePlane(), uv[0], uv[1])); }
  function rfNKEv(type, c, mods) {
    (type === 'mousedown' ? $('viewport') : W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: c[0], clientY: c[1] }, mods || {})));
  }
  async function rfNKClickAt(c, mods) { rfNKEv('mousemove', [c[0] + 3, c[1] + 2], mods); await wait(15); rfNKEv('mousemove', c, mods); await wait(15); rfNKEv('mousedown', c, mods); rfNKEv('mouseup', c, mods); await wait(25); }
  async function rfNKClick(uv, mods) { await rfNKClickAt(rfNKScr(uv), mods); }
  async function rfNKMove(uv) { rfNKEv('mousemove', rfNKScr(uv)); await wait(20); }
  function rfNKKey(k, mods) { var ev = new W.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {})); D.dispatchEvent(ev); return ev; }
  async function rfNKEsc(n) { for (var k = 0; k < (n || 1); k++) { rfNKKey('Escape'); await wait(20); } }
  async function rfNKDrag(a, b, n, mods) {
    var A = rfNKScr(a), B = rfNKScr(b);
    rfNKEv('mousemove', A, mods); await wait(20); rfNKEv('mousedown', A, mods); await wait(20);
    for (var k = 1; k <= (n || 8); k++) { rfNKEv('mousemove', [A[0] + (B[0] - A[0]) * k / (n || 8), A[1] + (B[1] - A[1]) * k / (n || 8)], mods); await wait(20); }
    rfNKEv('mouseup', B, mods); await idle(); await wait(40);
  }
  function rfNKF() { return UI.activeSketchFeature(); }
  function rfNKAn() { return W.SketchSolver.analyze(rfNKF()); }
  function rfNKState(f) { f = f || rfNKF(); return JSON.stringify([f.entities, f.rels || [], f.dims || []]); }
  function rfNKRels(f) { return ((f || rfNKF()).rels || []).map(function (r) { return r.type + '(' + r.refs.join(',') + ')' + (r.v != null ? '=' + (+r.v).toFixed(4) : ''); }); }
  function rfNKLabels() { if (UI.drawDims) UI.drawDims(true); return Array.prototype.map.call(D.querySelectorAll('#dim-layer text'), function (x) { return x.textContent; }); }
  function rfNKEnts(f) { return (f || rfNKF()).entities.map(function (e, i) { return i + ':' + e.t + (e.construction ? '*' : ''); }).join(' '); }
  function rfNKOut(log) { if (/[?&]dbg/.test(location.search)) throw new Error('DBG ' + log.join(' | ')); return log.join(' | '); }
  function rfNKOK() { var b = D.querySelector('#pm .pm-ok'); assert(b, 'no OK button in ' + UI.pmTitle()); b.click(); }
  var rfNKGrid = null;
  // an inch part the way a user gets one: Tools > Default units > Inches, File > New (the smoke page starts parts in mm)
  async function rfNKPart() {
    var du = UI.defaultUnits();
    UI.setDefaultUnits('in');
    try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
    assert(UI.App.model.units === 'in' && UI.unitLabel() === 'in', 'an inch part: ' + UI.App.model.units);
  }
  // the view: w x h inches across the viewport, the origin at (ox, oy) of its size
  function rfNKFrame(w, h, ox, oy) {
    var a = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0)), b = UI.worldToScreen(K.to3D(UI.activePlane(), 1, 0));
    UI.zoomView(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.min(UI.size.w / (w || 10), UI.size.h / (h || 6.5)));
    var o = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0));
    UI.panView(UI.size.w * (ox == null ? 0.08 : ox) - o[0], UI.size.h * (oy == null ? 0.72 : oy) - o[1]);
    UI.updateSketches();
  }
  async function rfNKNew(plane) {
    await rfNKPart();
    if (rfNKGrid == null) rfNKGrid = UI.App.view.showGrid;
    UI.App.view.showGrid = false; UI.App.gridStale = true;
    await UI.newSketchOnPlane(plane || 'Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    rfNKFrame(); await wait(30);
    var f = UI.activeSketchFeature();
    f._u0 = UI.App.undo.length;
    return f;
  }
  async function rfNKEnd() {
    if (rfNKGrid != null) { UI.App.view.showGrid = rfNKGrid; rfNKGrid = null; UI.App.gridStale = true; }
    if (UI.App.mode === 'sketch') { UI.setTool('select'); if (UI.closePM) UI.closePM(); if (UI.cancelSketch) UI.cancelSketch(); await idle(); }
  }
  // Smart Dimension by clicks: the pieces, then the place; the Modify box takes value (null: Esc)
  async function rfNKDim(picks, place, value, mods) {
    UI.setTool('dimension'); await wait(20);
    // lane NU: these are quick clicks on lines (often at their middles); the midpoint pick needs a 150 ms rest, which a
    // loaded machine stretches the test's 30 ms into: hold the rest off while picking
    var dwell = UI.dimMidDwell(); UI.dimMidDwell(1e9);
    try {
      for (var k = 0; k < picks.length; k++) await rfNKClick(picks[k], mods && mods[k]);
      await rfNKClick(place); await wait(50);
    } finally { UI.dimMidDwell(dwell); }
    var inp = D.querySelector('#dim-edit input');
    assert(inp && !$('dim-edit').hidden, 'Modify box open after dimensioning ' + JSON.stringify(picks) + ' (' + statusText() + ')');
    var shown = inp.value;
    if (value != null) { setInput(inp, value); pressEnter(inp); await wait(60); }
    if (!$('dim-edit').hidden) { rfNKKey('Escape'); await wait(20); }
    return shown;
  }
  function rfNKLabelEl(re) { if (UI.drawDims) UI.drawDims(true); return Array.prototype.filter.call(D.querySelectorAll('#dim-layer text'), function (x) { return re.test(x.textContent); })[0]; }
  async function rfNKOpenDim(re) {
    UI.setTool('select'); await wait(20);
    var t = rfNKLabelEl(re);
    assert(t, 'no label ' + re + ' in ' + rfNKLabels().join('|'));
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
    return inp;
  }
  async function rfNKEditDim(re, value) {
    var inp = await rfNKOpenDim(re);
    setInput(inp, value); pressEnter(inp); await wait(60);
    if (!$('dim-edit').hidden) { rfNKKey('Escape'); await wait(20); }
  }
  // right-click a dimension label: the rows of its menu
  async function rfNKLabelMenu(re) {
    var t = rfNKLabelEl(re); assert(t, 'no label ' + re + ' in ' + rfNKLabels().join('|'));
    var b = t.getBoundingClientRect(), c = [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)];
    t.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 2, buttons: 2, clientX: c[0], clientY: c[1] }));
    W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 2, clientX: c[0], clientY: c[1] }));
    await wait(40);
    return Array.prototype.slice.call(D.querySelectorAll('.menu .mi'));
  }
  // every step back with Ctrl+Z to the sketch as it was at f._u0, forward with Ctrl+Y, then exit and edit again
  async function rfNKUndoAll(empty) {
    var f = rfNKF(), id = f.id, u0 = f._u0, s1 = rfNKState(f), st1 = rfNKAn().status, n = 0;
    UI.setTool('select'); await wait(20);
    while (UI.App.undo.length > u0 && n < 160) { rfNKKey('z', { ctrlKey: true }); await idle(); await wait(10); n++; }
    var g = rfNKF();
    assert(g && g.id === id && UI.App.mode === 'sketch', 'still in the sketch after ' + n + ' undos');
    if (empty !== false) assert(!g.entities.length, n + ' undos leave the sketch empty: ' + g.entities.length);
    for (var k = 0; k < n; k++) { rfNKKey('y', { ctrlKey: true }); await idle(); await wait(10); }
    g = rfNKF();
    assert(rfNKState(g) === s1, 'redo all gives the same sketch back');
    UI.exitSketch(); await idle();
    UI.enterSketch(id); await idle(); await wait(30);
    g = rfNKF();
    assert(g && rfNKState(g) === s1 && rfNKAn().status === st1, 'exit and edit again: the same sketch, ' + st1 + ' (now ' + rfNKAn().status + ')');
    return n;
  }
  // exit the sketch, Boss-Extrude it d deep (or Base Flange with flange true): the volume
  async function rfNKBuild(d, flange) {
    var id = rfNKF().id;
    UI.exitSketch(); await idle();
    UI.App.sel = { kind: 'feature', id: id };
    if (flange) { UI.cmdBaseFlange(); await idle(); assert(UI.pmTitle() === 'Base Flange/Tab', 'PM ' + UI.pmTitle()); }
    else { UI.cmdExtrude(); await wait(40); setInput(pmNumber(0), String(d)); await wait(30); }
    await UI.pmOK(); await idle();
    var s = anvil.summary();
    assert(!Object.keys(s.errors || {}).length, 'built without errors: ' + JSON.stringify(s.errors));
    return anvil.mass().volume;
  }

  // ---------------------------------------------------------------- (a) the four slot tools
  step('rfNK flow a: the four slot tools on an inch part (Straight, Centerpoint Straight with Add dimensions and Overall Length, 3 Point Arc, Centerpoint Arc); width and centre distance dimensioned, width changed, an end dragged, undo / redo, edit again, Boss-Extrude', async function () {
    var log = [];
    try {
      var f = await rfNKNew();
      UI.sketchCurveOptions({ slotDims: false, overall: false });
      UI.setTool('slot'); await wait(30);
      assert(UI.pmTitle() === 'Slot', 'Slot PM: ' + UI.pmTitle());
      await rfNKClick([1, 1]); await rfNKClick([4, 1]); await rfNKClick([3, 1.25]);
      await rfNKEsc(2);
      assert(rfNKEnts() === '0:line 1:arc 2:line 3:arc 4:line*', 'a straight slot is 2 lines, 2 arcs and its centerline: ' + rfNKEnts());
      assert(rfNKRels().indexOf('horizontal(4)') >= 0, 'the centerline drawn level is Horizontal: ' + rfNKRels().join(' '));
      // width: the two sides; centre to centre: the two arc centres
      assert(await rfNKDim([[2.5, 1.25], [2.5, 0.75]], [5, 1.6], '1/2') === '0.5', 'width .5');
      assert(await rfNKDim([[1, 1], [4, 1]], [2.5, 2.2], '3 1/2') === '3', 'centre distance 3');
      near(f.entities[4].x2 - f.entities[4].x1, 3.5, 1e-9, 'centre to centre 3 1/2');
      log.push('straight: ' + rfNKLabels().join('|'));
      // Centerpoint Straight Slot with Add dimensions and Overall Length checked in its PM
      UI.setTool('cslot'); await wait(30);
      var cb = D.querySelector('#pm input[type=checkbox][data-key="slotDims"]');
      assert(cb, 'Add dimensions box');
      if (!cb.checked) cb.click();
      D.querySelector('#pm button[data-key="lenType:overall"]').click(); await wait(20);
      var e0 = f.entities.length;
      await rfNKClick([7, 1]); await rfNKClick([8, 1]); await rfNKClick([7.5, 1.375]);
      var lab = rfNKLabels();
      assert(lab.indexOf('2.750') >= 0 && lab.indexOf('.750') >= 0, 'Overall Length 2.750 and width .750 added: ' + lab.join('|'));
      await rfNKEsc(2);
      log.push('centerpoint: ' + rfNKEnts(f).split(' ').slice(e0).join(' '));
      // 3 Point Arc Slot and Centerpoint Arc Slot (Add dimensions still on: the arc radius)
      e0 = f.entities.length;
      UI.setTool('aslot3'); await wait(30);
      await rfNKClick([1, 3]); await rfNKClick([3, 3]); await rfNKClick([2, 3.6]); await rfNKClick([2, 3.85]); await rfNKEsc(2);
      assert(f.entities.slice(e0).map(function (e) { return e.t; }).join() === 'arc,arc,arc,arc,arc' && f.entities[e0 + 4].construction, '3 point arc slot: 4 arcs and the centre-line arc');
      assert((f.dims || []).some(function (d) { return d.e === e0 + 4 && d.k === 'r'; }), 'its radius dimensioned');
      e0 = f.entities.length;
      UI.setTool('aslot'); await wait(30);
      await rfNKClick([6, 2.6]); await rfNKClick([7.5, 2.6]); await rfNKClick([6, 4.1]); await rfNKClick([7.6, 2.6]); await rfNKEsc(2);
      assert(f.entities.slice(e0).length === 5 && f.entities[e0 + 4].construction && Math.abs(f.entities[e0 + 4].r - 1.5) < 1e-9, 'centerpoint arc slot R1.5: ' + JSON.stringify(f.entities[e0 + 4]));
      UI.sketchCurveOptions({ slotDims: false, overall: false });
      // the first slot's width changed from its label; its right end arc dragged: the slot moves, keeps its sizes
      await rfNKEditDim(/^\.500$/, '.625');
      near(f.entities[1].r, 0.3125, 1e-9, 'end arcs follow the width');
      var a1 = f.entities[1];
      await rfNKDrag([a1.cx + a1.r, a1.cy], [a1.cx + a1.r + 0.5, a1.cy + 0.5]);
      var cl = f.entities[4];
      near(cl.x2 - cl.x1, 3.5, 1e-9, 'the centre distance holds in the drag');
      near(f.entities[1].r, 0.3125, 1e-9, 'the width holds in the drag');
      assert(Math.abs(cl.y1 - 1) > 0.1, 'the slot moved with the end: ' + JSON.stringify(cl));
      log.push(await rfNKUndoAll() + ' undos / redos');
      var v = await rfNKBuild(0.25);
      assert(v > 0.25 * (3.5 * 0.625 + Math.PI * 0.3125 * 0.3125) - 1e-9, 'Boss-Extrude of the four slots: ' + v);
      log.push('volume ' + v.toFixed(4));
    } finally { UI.sketchCurveOptions({ slotDims: false, overall: false }); await rfNKEnd(); }
    return rfNKOut(log);
  });

  // ---------------------------------------------------------------- (b) part-number text for etching
  step('rfNK flow b: part-number text on a sheet: Sketch Text along a line and along an arc, height .25, Etch on ETCH; undo / redo, edit again; the strokes reach the flat DXF on layer ETCH', async function () {
    var log = [];
    try {
      var f = await rfNKNew('Top');
      UI.setTool('rect'); await wait(20); await rfNKClick([0, 0]); await rfNKClick([6, 4]); await rfNKEsc(2);
      await rfNKBuild(0, true);
      await UI.newSketchOnPlane('Top'); await idle(); rfNKFrame(); await wait(30);
      f = rfNKF(); f._u0 = UI.App.undo.length;
      UI.setTool('line'); await wait(20); await rfNKClick([1, 1]); await rfNKClick([5, 1]); await rfNKEsc(2);
      UI.setTool('arc3'); await wait(20); await rfNKClick([1, 2.5]); await rfNKClick([5, 2.5]); await rfNKClick([3, 3.5]); await rfNKEsc(2);
      // text on the line: pick the Curves box, click the line, type, height .25
      UI.setTool('text'); await idle();
      assert(UI.pmTitle() === 'Sketch Text', 'PM ' + UI.pmTitle());
      D.querySelector('#pm .pm-pick').click(); await wait(20);
      await rfNKClick([3, 1]); await wait(30);
      assert(/follows Line1/.test(statusText()), 'the text follows Line1: ' + statusText());
      setInput(D.querySelector('#pm textarea.txt-str'), 'PN 1234-A'); await wait(30);
      var h = pmField('Height'); setInput(h, '.25'); pressEnter(h); await wait(30);
      rfNKOK(); await idle();
      var t1 = f.entities[f.entities.length - 1];
      assert(t1.t === 'text' && t1.str === 'PN 1234-A' && t1.path && t1.path.e === 0 && t1.h === 0.25 && t1.layer === 'ETCH', 'text on the line: ' + JSON.stringify(t1).slice(0, 200));
      // text on the arc
      UI.setTool('text'); await idle();
      D.querySelector('#pm .pm-pick').click(); await wait(20);
      await rfNKClick([3, 3.5]); await wait(30);
      setInput(D.querySelector('#pm textarea.txt-str'), 'REV B'); await wait(30);
      rfNKOK(); await idle();
      var t2 = f.entities[f.entities.length - 1];
      assert(t2.t === 'text' && t2.path && t2.path.e === 1 && t2.layer === 'ETCH', 'text on the arc: ' + JSON.stringify(t2).slice(0, 200));
      log.push(await rfNKUndoAll() + ' undos / redos');
      UI.exitSketch(); await idle();
      var dxf = anvil.dxfFlat(), etch = (dxf.match(/\n\s*8\s*\r?\nETCH\s*\r?\n/g) || []).length;
      assert(etch >= 20, 'the text strokes on layer ETCH of the flat DXF: ' + etch);
      log.push(etch + ' ETCH entities in the flat');
    } finally { await rfNKEnd(); }
    return rfNKOut(log);
  });

  // ---------------------------------------------------------------- (c) equations in sketch dimensions
  step('rfNK flow c: a global variable T, a length typed =T*2, Link Values on two lengths, a wrong equation turns the Modify box red and keeps the value; T changed: the sketch and its Base Flange follow', async function () {
    var log = [];
    try {
      var f = await rfNKNew('Top');
      UI.App.model.equations = [{ name: 'T', expr: '1.5' }]; await UI.rebuild(); await idle();
      UI.setTool('line'); await wait(20);
      await rfNKClick([0, 0]); await rfNKClick([4, 0]); await rfNKClick([4, 2]); await rfNKEsc(2);
      await rfNKDim([[2, 0]], [2, -0.6], '=T*2');
      assert(f.dims[0].expr === '=T*2' && Math.abs(f.entities[0].x2 - 3) < 1e-9, '=T*2 is 3 and stays linked: ' + JSON.stringify(f.dims[0]));
      assert(rfNKLabels()[0].charAt(0) === 'Σ', 'the linked label starts with Sigma: ' + rfNKLabels().join('|'));
      await rfNKDim([[3, 1]], [3.6, 1], '2');
      // Link Values: both selected, right-click a label > Link Values..., OK
      UI.setSelection([{ kind: 'dim', index: 0 }, { kind: 'dim', index: 1 }]);
      var rows = await rfNKLabelMenu(/^2\.000$/), lv = rows.filter(function (r) { return /Link Values/.test(r.textContent); })[0];
      assert(lv, 'Link Values row: ' + rows.map(function (r) { return r.textContent; }).join(','));
      lv.click(); await wait(40);
      assert(modalOpen() && $('lv-name'), 'Shared Values dialog');
      $('lv-ok').click(); await wait(40);
      assert(f.dims[0].link && f.dims[0].link === f.dims[1].link, 'both linked: ' + JSON.stringify(f.dims));
      near(f.entities[1].y2 - f.entities[1].y1, 3, 1e-9, 'the second length takes the shared value');
      // a wrong equation: red text, the value kept
      var inp = await rfNKOpenDim(/3\.000$/);
      setInput(inp, '=Q*2'); pressEnter(inp); await wait(60);
      assert(!$('dim-edit').hidden && /Unknown variable/.test(statusText()), 'refused, box open: ' + statusText());
      var col = W.getComputedStyle(inp).color;
      assert(/rgb\(221, 51, 51\)/.test(col), 'the wrong equation is shown red: ' + col);
      rfNKKey('Escape'); await wait(30);
      near(f.entities[0].x2, 3, 1e-9, 'the old value kept');
      log.push(await rfNKUndoAll() + ' undos / redos');
      var v1 = await rfNKBuild(0, true);
      UI.App.model.equations = [{ name: 'T', expr: '2' }]; await UI.rebuild(); await idle();
      var sk = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
      near(sk.entities[0].x2 - sk.entities[0].x1, 4, 1e-9, 'T = 2: the =T*2 length is 4');
      near(sk.entities[1].y2 - sk.entities[1].y1, 4, 1e-9, 'the linked length follows');
      var v2 = anvil.mass().volume;
      assert(v2 > v1 * 1.2, 'the Base Flange follows: ' + v1 + ' -> ' + v2);
      log.push('flange ' + v1.toFixed(4) + ' -> ' + v2.toFixed(4));
    } finally { UI.App.model.equations = []; await rfNKEnd(); }
    return rfNKOut(log);
  });

  // ---------------------------------------------------------------- (d) symmetric dimensions about a centerline
  step('rfNK flow d: Smart Dimension from a centerline to a hole and to a parallel side, placed past the centerline: doubled (diameter) values; typed values move them; the centerline deleted takes its dimensions, undo brings them back', async function () {
    var log = [];
    try {
      var f = await rfNKNew();
      UI.cmdCenterline(); await wait(20);
      await rfNKClick([3, -1]); await rfNKClick([3, 4]); await rfNKEsc(2);
      UI.setTool('circle'); await wait(20); await rfNKClick([1.5, 1]); await rfNKClick([1.75, 1]); await rfNKEsc(2);
      UI.setTool('rect'); await wait(20); await rfNKClick([1, 2.5]); await rfNKClick([5, 3.5]); await rfNKEsc(2);
      assert(f.entities[0].construction && rfNKEnts() === '0:line* 1:circle 2:line 3:line 4:line 5:line', rfNKEnts());
      assert(await rfNKDim([[3, 0.5], [1.5, 1]], [4.2, 0.3], '3 1/2') === '3', 'centerline to the hole, placed past it: 3 (doubled 1.5)');
      near(f.entities[1].cx, 3 - 1.75, 1e-9, 'Ø3 1/2 puts the hole 1.75 off the centerline');
      // the centerline and the rectangle's right side (line 3, x = 5), placed on the left of the centerline
      var shown = await rfNKDim([[3, 3.0], [5, 3]], [1.5, 3.9], '5');
      assert(shown === '4', 'centerline to a parallel side placed past it: doubled 4 (was ' + shown + ')');
      var rel = f.rels[f.rels.length - 1];
      assert(rel.type === 'distance' && rel.ac && rel.ac[0] === 'dbl', 'doubled distance relation: ' + JSON.stringify(rel));
      near(f.entities[3].x1, 5.5, 1e-9, 'Ø5 puts the side 2.5 off the centerline');
      assert(rfNKLabels().filter(function (t) { return /^Ø/.test(t); }).length === 2, 'two diameter labels: ' + rfNKLabels().join('|'));
      // placed on the near side it is the plain distance
      var n0 = f.rels.length;
      shown = await rfNKDim([[3, 3.2], [1, 3]], [2, 4.2], null);
      assert(shown === '2' && !(f.rels[n0].ac && f.rels[n0].ac.indexOf('dbl') >= 0), 'near side: plain 2 (' + shown + ')');
      f.rels.splice(n0, 1); UI.updateSketches();
      log.push(await rfNKUndoAll() + ' undos / redos');
      f = rfNKF();
      // the centerline deleted: its two dimensions go with it
      UI.setTool('select'); await wait(20);
      await rfNKClick([3, -0.6]); await wait(20);
      assert(UI.selection().length === 1 && UI.selection()[0].index === 0, 'centerline selected: ' + JSON.stringify(UI.selection()));
      rfNKKey('Delete'); await idle(); await wait(30);
      assert(!f.entities.some(function (e) { return e.construction; }) && !(f.rels || []).some(function (r) { return r.type === 'distance'; }), 'centerline and its dimensions deleted: ' + rfNKRels().join(' '));
      rfNKKey('z', { ctrlKey: true }); await idle(); await wait(20);
      f = rfNKF();
      assert(f.entities[0].construction && (f.rels || []).filter(function (r) { return r.ac && r.ac[0] === 'dbl'; }).length === 2, 'undo brings both back');
      var v = await rfNKBuild(0.5);
      near(v, 0.5 * (4.5 * 1 + Math.PI * 0.0625), 1e-6, 'Boss-Extrude: the plate 4.5 x 1 and the hole');
      log.push('volume ' + v.toFixed(4));
    } finally { await rfNKEnd(); }
    return rfNKOut(log);
  });

  // ---------------------------------------------------------------- (e) polygon, ellipses, 3 point rectangles
  step('rfNK flow e: Polygon 6 sides inscribed, switched to circumscribed and to 8 sides in its PM, its circle dimensioned; Ellipse and Partial Ellipse dimensioned; 3 Point Corner Rectangle and Parallelogram with their relations; undo / redo, edit again, Boss-Extrude', async function () {
    var log = [];
    try {
      var f = await rfNKNew();
      UI.sketchCurveOptions({ sides: 6, ins: true });
      UI.setTool('polygon'); await wait(30);
      await rfNKClick([1.5, 1.5]); await rfNKClick([2.5, 1.5]); await wait(30);
      assert(rfNKEnts() === '0:line 1:line 2:line 3:line 4:line 5:line 6:circle*', 'hexagon: ' + rfNKEnts());
      D.querySelector('#pm input[type=radio][value="circ"]').click(); await idle();
      near(f.entities[6].r, Math.hypot(f.entities[0].x1 - f.entities[6].cx, f.entities[0].y1 - f.entities[6].cy), 1e-9, 'circumscribed: the circle runs through the corners');
      var nf = D.querySelector('#pm input[data-key="n"]'); setInput(nf, '8'); pressEnter(nf); await idle();
      assert(f.entities.filter(function (e) { return e.t === 'line'; }).length === 8, '8 sides: ' + rfNKEnts());
      await rfNKEsc(2);
      var cI = 8, ce = f.entities[cI];
      assert(ce.t === 'circle' && ce.construction, 'the polygon circle: ' + rfNKEnts());
      await rfNKDim([[ce.cx + ce.r * Math.cos(0.3), ce.cy + ce.r * Math.sin(0.3)]], [ce.cx + 1.6, ce.cy + 1.2], '2 1/2');
      near(f.entities[cI].r, 1.25, 1e-9, 'Ø2 1/2');
      var e2 = f.entities.length;
      UI.setTool('rect3'); await wait(30);
      await rfNKClick([0.5, 3.2]); await rfNKClick([2.5, 3.6]); await rfNKClick([2.35, 4.3]); await rfNKEsc(2);
      var r3 = rfNKRels().join(' ');
      assert(f.entities.length === e2 + 4, '3 point corner rectangle drawn: ' + rfNKEnts().split(' ').slice(e2 - 2).join(' ') + ' / ' + statusText() + ' / ' + UI.App.tool + ' / modal ' + modalOpen());
      assert(r3.indexOf('perpendicular(' + e2 + ',' + (e2 + 1) + ')') >= 0 && r3.indexOf('parallel(' + e2 + ',' + (e2 + 2) + ')') >= 0, '3 point corner rectangle: square corners: ' + r3);
      var e3 = f.entities.length;
      UI.setTool('parallelogram'); await wait(30);
      await rfNKClick([4, 3.3]); await rfNKClick([6, 3.3]); await rfNKClick([6.6, 4.3]); await rfNKEsc(2);
      var rp = rfNKRels().join(' ');
      assert(rp.indexOf('parallel(' + e3 + ',' + (e3 + 2) + ')') >= 0 && rp.indexOf('parallel(' + (e3 + 1) + ',' + (e3 + 3) + ')') >= 0 && rp.indexOf('perpendicular(' + e3) < 0, 'parallelogram: two Parallel pairs, no square corner: ' + rp);
      var e0 = f.entities.length;
      UI.setTool('ellipse'); await wait(30);
      await rfNKClick([5.5, 1.5]); await rfNKClick([7, 1.5]); await rfNKClick([5.5, 2.25]); await rfNKEsc(2);
      assert(f.entities[e0].t === 'ellipse' && Math.abs(f.entities[e0].rx - 1.5) < 1e-9 && Math.abs(f.entities[e0].ry - 0.75) < 1e-9, 'ellipse: ' + JSON.stringify(f.entities[e0]));
      await rfNKDim([[7, 1.5]], [7.6, 2.6], '1 3/4');
      near(f.entities[e0].rx, 1.75, 1e-9, 'major semi-axis 1 3/4');
      var e1 = f.entities.length;
      UI.setTool('pellipse'); await wait(30);
      await rfNKClick([5.5, -1]); await rfNKClick([7, -1]); await rfNKClick([5.5, -0.4]); await rfNKClick([4.1, -1]); await rfNKEsc(2);
      var pe = f.entities[e1];
      assert(pe.t === 'pellipse' && Math.abs(pe.a0 - 90) < 1e-6 && Math.abs(pe.a1 - 180) < 1e-6, 'partial ellipse 90..180: ' + JSON.stringify(pe));
      await rfNKDim([[5.5 + 1.5 * Math.cos(2.4), -1 + 0.6 * Math.sin(2.4)]], [4, 0.2], null);
      log.push(await rfNKUndoAll() + ' undos / redos');
      var v = await rfNKBuild(0.25);
      assert(v > 0, 'Boss-Extrude: ' + v);
      log.push('volume ' + v.toFixed(4));
    } finally { UI.sketchCurveOptions({ sides: 6, ins: true }); await rfNKEnd(); }
    return rfNKOut(log);
  });

  // ---------------------------------------------------------------- (f) offset and slanted planes
  step('rfNK flow f: a sketch on Plane1 (Top + 5) and on the slanted face of a wedge: the view turns normal, the origin is the part origin projected, Convert Entities projects a model edge, a hole dimensioned to the projected origin', async function () {
    var log = [];
    try {
      await rfNKPart();
      await anvil.run('p.sketch("Front").polyline([[0, 0], [4, 0], [4, 1], [0, 3]]).extrude(3); p.plane("Top", 5, "Plane1");'); await idle();
      var pf = UI.App.model.features.filter(function (x) { return x.type === 'plane'; })[0];
      UI.setView('Isometric', false); if (UI.finishViewAnimation) UI.finishViewAnimation();
      UI.App.sel = { kind: 'plane', ref: pf.id }; UI.cmdSketch(); await idle(); await wait(40);
      if (UI.finishViewAnimation) UI.finishViewAnimation();
      var f = rfNKF();
      assert(f && f.plane.featureId === pf.id && UI.sketchViewIsNormal(), 'a sketch on Plane1, the view normal to it');
      var o = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0)), po = UI.worldToScreen([0, 5, 0]);
      assert(Math.hypot(o[0] - po[0], o[1] - po[1]) < 1, 'the sketch origin is the part origin projected');
      UI.zoomToFit(); await wait(30);
      await rfNKClickAt(rfNKScr3([2, 2, 3])); await wait(20);
      assert(UI.selection().length === 1 && UI.selection()[0].kind === 'edge', 'the slanted top edge selected in the sketch');
      UI.cmdConvertEntities(); await idle();
      if (UI.hasPM()) { rfNKOK(); await idle(); }
      var e = f.entities[0];
      assert(e && e.t === 'line' && Math.abs(e.y1 + 3) < 1e-9 && Math.abs(e.y2 + 3) < 1e-9 && Math.abs(Math.abs(e.x2 - e.x1) - 4) < 1e-9, 'the edge projected onto Plane1: ' + JSON.stringify(e));
      UI.exitSketch(); await idle();
      // the slanted face
      var fi = -1;
      UI.App.mesh.faces.forEach(function (fc, i) { if (Math.abs(fc.normal[0]) > 0.2 && fc.normal[1] > 0.2) fi = i; });
      UI.App.sel = { kind: 'face', index: fi }; UI.cmdSketch(); await idle(); await wait(40);
      if (UI.finishViewAnimation) UI.finishViewAnimation();
      f = rfNKF(); f._u0 = UI.App.undo.length;
      assert(f.plane.face && UI.sketchViewIsNormal(), 'a sketch on the slanted face, normal view');
      var pl = UI.activePlane(), O3 = K.to3D(pl, 0, 0), n = pl.n, d = O3[0] * n[0] + O3[1] * n[1] + O3[2] * n[2];
      near(Math.hypot(O3[0] - n[0] * d, O3[1] - n[1] * d, O3[2] - n[2] * d), 0, 1e-9, 'the sketch origin is the part origin projected onto the face');
      rfNKFrame(); await wait(20);
      UI.setTool('circle'); await wait(20); await rfNKClick([1, 1]); await rfNKClick([1.25, 1]); await rfNKEsc(2);
      await rfNKDim([[1, 1], [0, 0]], [0.5, 2], '1 1/4');
      var rel = f.rels[f.rels.length - 1];
      assert(rel.type === 'distance' && rel.refs.indexOf('O') >= 0, 'distance to the origin: ' + JSON.stringify(rel));
      near(W.SketchSolver.measure(f, 'distance', rel.refs, rel.dir), 1.25, 1e-9, '1 1/4 from the projected origin');
      log.push(await rfNKUndoAll() + ' undos / redos');
      var v0 = anvil.mass().volume, v = await rfNKBuild(0.25);
      assert(v > v0, 'a boss on the slanted face: ' + v0 + ' -> ' + v);
    } finally { await rfNKEnd(); }
    return rfNKOut(log);
  });

  // ---------------------------------------------------------------- (g) dimensions to arcs
  step('rfNK flow g: line to circle with Shift+click on the near side (Min) and the far side (Max), arc length (the arc, then its two ends), a chord, a radius shown as a diameter in the Dimension PM; undo / redo, edit again, Boss-Extrude', async function () {
    var log = [];
    try {
      var f = await rfNKNew();
      UI.setTool('line'); await wait(20); await rfNKClick([0, 0]); await rfNKClick([6, 0]); await rfNKEsc(2);
      UI.setTool('circle'); await wait(20); await rfNKClick([3, 2]); await rfNKClick([3.5, 2]); await rfNKEsc(2);
      UI.setTool('arc'); await wait(20); await rfNKClick([7, 2]); await rfNKClick([8, 2]); await rfNKClick([7, 3]); await rfNKEsc(2);
      assert(rfNKEnts() === '0:line 1:circle 2:arc', rfNKEnts());
      // plain: centre
      assert(await rfNKDim([[2, 0], [3, 2.5]], [1, 1], null) === '2', 'to the centre 2');
      f.rels.pop(); UI.updateSketches();
      // Shift+click the circle on its far side: Max 2.5
      var shown = await rfNKDim([[2, 0], [3, 2.5]], [0.5, 1.2], '2 3/4', [null, { shiftKey: true }]);
      var rel = f.rels[f.rels.length - 1];
      assert(shown === '2.5' && rel.ac && rel.ac[1] === 'max', 'Shift+click far side: Max 2.5 (' + shown + ', ' + JSON.stringify(rel) + ')');
      near(f.entities[1].cy + f.entities[1].r, 2.75, 1e-9, 'Max 2 3/4: the top of the circle 2.75 up');
      f.rels.pop(); UI.updateSketches();
      // and on its near side: Min
      var cc = f.entities[1], lo = cc.cy - cc.r;
      shown = await rfNKDim([[2, 0], [cc.cx, lo]], [0.5, 1.2], null, [null, { shiftKey: true }]);
      rel = f.rels[f.rels.length - 1];
      assert(Math.abs(+shown - lo) < 1e-6 && rel.ac[1] === 'min', 'Shift+click near side: Min 1.75 (' + shown + ', ' + JSON.stringify(rel) + ')');
      // a radius, then Properties... > Diameter
      var a = f.entities[2], am = (a.a0 * 0.75 + a.a1 * 0.25) * Math.PI / 180;
      await rfNKDim([[a.cx + a.r * Math.cos(am), a.cy + a.r * Math.sin(am)]], [a.cx + (a.r + 0.8) * Math.cos(am), a.cy + (a.r + 0.8) * Math.sin(am)], null);
      var di = f.dims.length - 1;
      assert(f.dims[di].k === 'r', 'a radius on the arc: ' + JSON.stringify(f.dims[di]));
      var rows = await rfNKLabelMenu(/^R/), pr = rows.filter(function (r) { return /Properties/.test(r.textContent); })[0];
      assert(pr, 'Properties row'); pr.click(); await idle();
      D.querySelector('#pm input[type=radio][value="dia"]').click(); await idle();
      assert(f.dims[di].show === 'dia' && rfNKLabels().some(function (t) { return /^Ø/.test(t); }), 'shown as a diameter: ' + rfNKLabels().join('|'));
      if (UI.hasPM()) { rfNKOK(); await idle(); }
      // arc length: the arc, then its two ends
      UI.setTool('dimension'); await wait(20);
      await rfNKClick([7 + Math.SQRT1_2, 2 + Math.SQRT1_2]); await rfNKClick([8, 2]); await rfNKClick([7, 3]); await rfNKClick([8.2, 3.4]); await wait(40);
      assert(!$('dim-edit').hidden && Math.abs(+D.querySelector('#dim-edit input').value - Math.PI / 2) < 1e-4, 'arc length: ' + ($('dim-edit').hidden ? 'none' : D.querySelector('#dim-edit input').value));
      setInput(D.querySelector('#dim-edit input'), '2'); pressEnter(D.querySelector('#dim-edit input')); await wait(60);
      near(f.entities[2].r * (f.entities[2].a1 - f.entities[2].a0) * Math.PI / 180, 2, 1e-6, 'arc length 2');
      // a chord: the two ends
      var ar = f.entities[2], aEnd = function (d) { return [ar.cx + ar.r * Math.cos(d * Math.PI / 180), ar.cy + ar.r * Math.sin(d * Math.PI / 180)]; };
      // (the radius and the arc length hold the chord: SolidWorks asks Make Dimension Driven?)
      UI.setTool('dimension'); await wait(20);
      await rfNKClick(aEnd(ar.a0)); await rfNKClick(aEnd(ar.a1)); await rfNKClick([ar.cx + ar.r + 0.6, ar.cy + ar.r + 0.6]); await wait(50);
      assert(modalOpen() && $('drv-driven'), 'Make Dimension Driven? for the chord');
      $('drv-driven').click(); await wait(40);
      assert(f.rels[f.rels.length - 1].driven, 'the chord is a driven dimension');
      assert(/distance\(2\.p[12],2\.p[12]\)/.test(rfNKRels().slice(-1)[0]), 'chord between the two ends: ' + rfNKRels().slice(-1));
      log.push(await rfNKUndoAll() + ' undos / redos');
      var rc = rfNKF().entities[1].r, v = await rfNKBuild(0.25);
      near(v, 0.25 * Math.PI * rc * rc, 1e-6, 'Boss-Extrude: the circle');
    } finally { await rfNKEnd(); }
    return rfNKOut(log);
  });

  // ---------------------------------------------------------------- (h) a 24 x 48 plate with 400 holes
  // counts solver calls, analyses and redraws per action (never milliseconds: the PC is shared)
  function rfNKMeter() {
    var S = W.SketchSolver, m = { solves: 0, drags: 0, an: 0, redraws: 0 }, os = S.solve, od = S.drag, oa = S.analyze, ou = UI.updateSketches;
    S.solve = function () { m.solves++; return os.apply(this, arguments); };
    S.drag = function () { m.drags++; return od.apply(this, arguments); };
    S.analyze = function () { m.an++; return oa.apply(this, arguments); };
    UI.updateSketches = function () { m.redraws++; return ou.apply(this, arguments); };
    m.reset = function () { m.solves = m.drags = m.an = m.redraws = 0; };
    m.off = function () { S.solve = os; S.drag = od; S.analyze = oa; UI.updateSketches = ou; };
    m.text = function () { return m.solves + ' solves, ' + m.drags + ' drag solves, ' + m.an + ' analyses, ' + m.redraws + ' redraws'; };
    return m;
  }
  function rfNKCircles(f) { return (f || rfNKF()).entities.filter(function (e) { return e.t === 'circle'; }).length; }
  // the condensed solve (copies named by nothing else placed after it) gives what the full solve gives
  function rfNKSame(a, b) { return a.every(function (e, i) { return Object.keys(e).every(function (k) { return typeof e[k] !== 'number' || Math.abs(e[k] - b[i][k]) < 1e-7; }); }); }
  step('rfNK flow h: a 24 x 48 plate, a 1/4 hole patterned 20 x 20 with Linear Sketch Pattern (400 holes): box select all, a zoom, drag the seed, change a spacing, delete 50 holes, undo / redo: every action a bounded number of solves, analyses and redraws', async function () {
    var log = [], m = null;
    try {
      var f = await rfNKNew();
      UI.setTool('rect'); await wait(20); await rfNKClick([0, 0]); await rfNKClick([6, 3]); await rfNKEsc(2);
      UI.setTool('circle'); await wait(20); await rfNKClick([1, 1]); await rfNKClick([1.5, 1]); await rfNKEsc(2);
      assert(f.entities.length === 5 && f.entities[4].t === 'circle', 'plate and hole: ' + rfNKEnts());
      await rfNKDim([[1.5, 1]], [2.2, 1.9], '1/4'); await rfNKDim([[3, 0]], [3, -0.5], '48'); await rfNKDim([[0, 1.5]], [-0.5, 1.5], '24');
      UI.setTool('select'); await wait(20);
      await rfNKDrag([0.6, 0.6], [1.4, 1.4], 6);
      assert(UI.selection().some(function (s) { return s.kind === 'entity' && s.index === 4; }), 'the seed box-selected: ' + JSON.stringify(UI.selection()));
      UI.cmdSketchPattern(); await idle();
      assert(UI.pmTitle() === 'Linear Pattern', 'PM ' + UI.pmTitle());
      function key(k) { var x = D.querySelector('#pm input[data-key="' + k + '"]'); assert(x, 'no ' + k); return x; }
      setInput(key('count'), '20'); setInput(key('spacing'), '2.4'); setInput(key('count2'), '20'); setInput(key('spacing2'), '1.15'); await idle();
      if (!key('dimY').checked) { key('dimY').click(); await idle(); }   // Dimension Y spacing (off by default, as SolidWorks)
      m = rfNKMeter();
      rfNKOK(); await idle(); await wait(40);
      assert(rfNKCircles(f) === 400, '400 holes: ' + rfNKCircles(f) + ' (' + statusText() + ')');
      log.push('pattern: ' + m.text());
      assert(m.an <= 1, 'the pattern is analysed once: ' + m.text());
      // a zoom out to the whole plate and a box select of everything: nothing changed, nothing analysed
      m.reset();
      rfNKFrame(54, 30, 0.04, 0.9); await wait(30);
      UI.setTool('select'); await wait(20);
      await rfNKDrag([-1, -1], [49, 25], 6);
      var nsel = UI.selection().filter(function (s) { return s.kind === 'entity'; }).length;
      log.push('zoom + box select of ' + nsel + ': ' + m.text());
      assert(nsel >= 404, 'every entity selected: ' + nsel + ' of ' + f.entities.length);
      assert(m.solves === 0 && m.an === 0, 'a zoom and a box select solve and analyse nothing: ' + m.text());
      await rfNKEsc(1);
      // drag the seed: every copy follows (the copies named by nothing else are placed after the solve)
      var lastC = f.entities.filter(function (e) { return e.t === 'circle'; }).pop(), l0 = [lastC.cx, lastC.cy], s0 = [f.entities[4].cx, f.entities[4].cy];
      rfNKFrame(); await wait(20);
      m.reset();
      await rfNKDrag([1, 1], [1.3, 1.2], 3);
      var s1 = [f.entities[4].cx, f.entities[4].cy];
      lastC = f.entities.filter(function (e) { return e.t === 'circle'; }).pop();
      log.push('drag: ' + m.text() + ', seed ' + s1.map(function (x) { return x.toFixed(3); }));
      assert(Math.hypot(s1[0] - s0[0], s1[1] - s0[1]) > 0.1, 'the seed moved');
      near(lastC.cx - l0[0], s1[0] - s0[0], 1e-6, 'the last copy follows the seed in x');
      near(lastC.cy - l0[1], s1[1] - s0[1], 1e-6, 'and in y');
      assert(m.drags <= 6 && m.an <= 2, 'one analysis per drag: ' + m.text());
      // the condensed solve equals the full one
      var full = JSON.parse(JSON.stringify(f));
      W.SketchSolver.solve(full, { noCondense: true });
      assert(rfNKSame(f.entities, full.entities), 'the full solve leaves the dragged sketch as it is');
      // a spacing changed from its label
      m.reset();
      await rfNKEditDim(/^2\.400$/, '2.25'); await idle();
      log.push('spacing 2.4 -> 2.25: ' + m.text());
      var cs = f.entities.filter(function (e) { return e.t === 'circle'; }), xs = cs.map(function (e) { return e.cx; }).sort(function (a, b) { return a - b; });
      near(xs[xs.length - 1] - xs[0], 19 * 2.25, 1e-6, 'the 20 columns 2.25 apart');
      assert(m.an <= 2, 'one spacing edit: ' + m.text());
      // delete 50 holes: a window over 5 columns x 10 rows
      var ys = cs.map(function (e) { return e.cy; }).sort(function (a, b) { return a - b; }), x0 = xs[0], y0 = ys[0];
      rfNKFrame(54, 30, 0.04, 0.9); await wait(20);
      m.reset();
      UI.setTool('select'); await wait(20);
      await rfNKDrag([x0 + 10 * 2.25 - 0.6, y0 + 5 * 1.15 - 0.4], [x0 + 14 * 2.25 + 0.6, y0 + 14 * 1.15 + 0.4], 6);
      var picked = UI.selection().filter(function (s) { return s.kind === 'entity' && f.entities[s.index].t === 'circle'; }).length;
      rfNKKey('Delete'); await idle(); await wait(30);
      log.push('delete ' + picked + ': ' + m.text());
      assert(picked === 50 && rfNKCircles(f) === 350, '50 holes deleted: picked ' + picked + ', left ' + rfNKCircles(f));
      assert(m.an <= 2, 'the delete analyses once: ' + m.text());
      m.reset();
      rfNKKey('z', { ctrlKey: true }); await idle();
      assert(rfNKCircles(f = rfNKF()) === 400, 'undo brings the 50 back: ' + rfNKCircles(f));
      rfNKKey('y', { ctrlKey: true }); await idle();
      assert(rfNKCircles(f = rfNKF()) === 350, 'redo deletes them again');
      log.push('undo + redo: ' + m.text());
      assert(m.an <= 4, 'undo and redo: two analyses each at most: ' + m.text());
    } finally { if (m) m.off(); await rfNKEnd(); }
    return rfNKOut(log);
  });
