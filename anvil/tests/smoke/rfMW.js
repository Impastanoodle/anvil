  // ---- rfMW (local-2026-11-15b, lane sketchflow round 4): the sketcher driven like a shop user on INCH parts, by real
  // mouse / key events (report test-reports/2026-11-15-sketch-flow-4.md): imported DXF clean-up, fillets and chamfers,
  // Move / Copy / Rotate / Scale / Stretch, relations and SketchXpert, circular patterns, construction geometry,
  // Selected Contours, copy / paste and pasted fractions; and the neighbours of rfMT's model-face click in a sketch
  function rfMWScr3(p) { var s = UI.worldToScreen(p), r = $('viewport').getBoundingClientRect(); return [Math.round(r.left + s[0]), Math.round(r.top + s[1])]; }
  function rfMWScr(uv) { return rfMWScr3(K.to3D(UI.activePlane(), uv[0], uv[1])); }
  function rfMWEv(type, c, mods) {
    (type === 'mousedown' ? $('viewport') : W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: c[0], clientY: c[1] }, mods || {})));
  }
  async function rfMWClickAt(c, mods) { rfMWEv('mousemove', [c[0] + 3, c[1] + 2], mods); await wait(15); rfMWEv('mousemove', c, mods); await wait(15); rfMWEv('mousedown', c, mods); rfMWEv('mouseup', c, mods); await wait(25); }
  async function rfMWClick(uv, mods) { await rfMWClickAt(rfMWScr(uv), mods); }
  async function rfMWMove(uv) { rfMWEv('mousemove', rfMWScr(uv)); await wait(20); }
  function rfMWKey(k, mods) { var ev = new W.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {})); D.dispatchEvent(ev); return ev; }
  async function rfMWEsc(n) { for (var k = 0; k < (n || 1); k++) { rfMWKey('Escape'); await wait(20); } }
  async function rfMWDrag(a, b, n, mods) {
    var A = rfMWScr(a), B = rfMWScr(b);
    rfMWEv('mousemove', A, mods); await wait(20); rfMWEv('mousedown', A, mods); await wait(20);
    for (var k = 1; k <= (n || 8); k++) { rfMWEv('mousemove', [A[0] + (B[0] - A[0]) * k / (n || 8), A[1] + (B[1] - A[1]) * k / (n || 8)], mods); await wait(20); }
    rfMWEv('mouseup', B, mods); await idle(); await wait(40);
  }
  function rfMWF() { return UI.activeSketchFeature(); }
  function rfMWAn() { return W.SketchSolver.analyze(rfMWF()); }
  function rfMWState(f) { f = f || rfMWF(); return JSON.stringify([f.entities, f.rels || [], f.dims || []]); }
  function rfMWRels(f) { return ((f || rfMWF()).rels || []).map(function (r) { return r.type + '(' + r.refs.join(',') + ')'; }); }
  function rfMWLabels() { if (UI.drawDims) UI.drawDims(true); return Array.prototype.map.call(D.querySelectorAll('#dim-layer text'), function (x) { return x.textContent; }); }
  // a new part made the way a user gets an inch part: Tools ▸ Default units for new documents ▸ Inches, File ▸ New
  // (the smoke page itself starts every part in mm); the default is put back. Grid off, sketch on Front, x -0.8..9,
  // y -2..4.5 in view.
  var rfMWGrid = null;
  async function rfMWPart() {
    var du = UI.defaultUnits();
    UI.setDefaultUnits('in');
    try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
    assert(UI.App.model.units === 'in' && UI.unitLabel() === 'in', 'an inch part: ' + UI.App.model.units);
  }
  async function rfMWNew() {
    await rfMWPart();
    if (rfMWGrid == null) rfMWGrid = UI.App.view.showGrid;
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
  async function rfMWDone() { if (UI.App.mode === 'sketch') { UI.setTool('select'); if (UI.closePM) UI.closePM(); if (UI.cancelSketch) UI.cancelSketch(); await idle(); } }
  async function rfMWEnd() {
    if (rfMWGrid != null) { UI.App.view.showGrid = rfMWGrid; rfMWGrid = null; UI.App.gridStale = true; }
    await rfMWDone();
  }
  // Smart Dimension by clicks: the pieces, then the label place; the Modify box takes value
  async function rfMWDim(picks, place, value) {
    UI.setTool('dimension'); await wait(20);
    for (var k = 0; k < picks.length; k++) await rfMWClick(picks[k]);
    await rfMWClick(place); await wait(50);
    var inp = D.querySelector('#dim-edit input');
    assert(inp && !$('dim-edit').hidden, 'Modify box open after dimensioning ' + JSON.stringify(picks) + ' (' + statusText() + ')');
    var shown = inp.value;
    if (value != null) { setInput(inp, value); pressEnter(inp); await wait(60); }
    if (!$('dim-edit').hidden) { rfMWKey('Escape'); await wait(20); }
    return shown;
  }
  // a dimension label whose text matches re: double-press it, type value, Enter
  async function rfMWEditDim(re, value) {
    var inp = await rfMWOpenDim(re);
    setInput(inp, value); pressEnter(inp); await wait(60);
    if (!$('dim-edit').hidden) { rfMWKey('Escape'); await wait(20); }
  }
  async function rfMWOpenDim(re) {
    UI.setTool('select'); await wait(20);
    if (UI.drawDims) UI.drawDims(true);
    var t = Array.prototype.filter.call(D.querySelectorAll('#dim-layer text'), function (x) { return re.test(x.textContent); })[0];
    assert(t, 'no label ' + re + ' in ' + rfMWLabels().join('|'));
    var b = t.getBoundingClientRect(), c = [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)];
    for (var k = 0; k < 2; k++) {
      t.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: c[0], clientY: c[1] }));
      W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, clientX: c[0], clientY: c[1] }));
      await wait(40);
    }
    var inp = D.querySelector('#dim-edit input');
    assert(inp && !$('dim-edit').hidden, 'Modify box open on ' + t.textContent);
    return inp;
  }
  // every step back with Ctrl+Z to the sketch as it was at f._u0, forward with Ctrl+Y, then exit and edit again
  async function rfMWUndoAll(empty) {
    var f = rfMWF(), id = f.id, u0 = f._u0, s1 = rfMWState(f), st1 = rfMWAn().status, n = 0;
    UI.setTool('select'); await wait(20);
    while (UI.App.undo.length > u0 && n < 120) { rfMWKey('z', { ctrlKey: true }); await idle(); await wait(10); n++; }
    var g = rfMWF();
    assert(g && g.id === id && UI.App.mode === 'sketch', 'still in the sketch after ' + n + ' undos');
    if (empty !== false) assert(!g.entities.length, n + ' undos leave the sketch empty: ' + g.entities.length);
    for (var k = 0; k < n; k++) { rfMWKey('y', { ctrlKey: true }); await idle(); await wait(10); }
    g = rfMWF();
    assert(rfMWState(g) === s1, 'redo all gives the same sketch back');
    UI.exitSketch(); await idle();
    UI.enterSketch(id); await idle(); await wait(30);
    g = rfMWF();
    assert(g && rfMWState(g) === s1 && rfMWAn().status === st1, 'exit and edit again: the same sketch, ' + st1 + ' (now ' + rfMWAn().status + ')');
    return n;
  }
  function rfMWOut(log) { if (/[?&]dbg/.test(location.search)) throw new Error('DBG ' + log.join(' | ')); return log.join(' | '); }
  function rfMWOK() { var b = D.querySelector('#pm .pm-ok'); assert(b, 'no ✓ in ' + UI.pmTitle()); b.click(); }

  // ---------------------------------------------------------------- the model-face click in a sketch: its neighbours
  function rfMWFace(n) {
    var best = -1;
    UI.App.mesh.faces.forEach(function (f, i) { if (K.vec.dot(f.normal, n) > 1 - 1e-6 && (best < 0 || f.area > UI.App.mesh.faces[best].area)) best = i; });
    assert(best >= 0, 'no face with normal ' + n);
    return best;
  }
  async function rfMWBlockSketch() {
    await rfMWPart();
    await anvil.run('p.sketch("Top").rect(0, -3, 4, 3).extrude(0.5);'); await idle();
    UI.setView('Top', false); if (UI.finishViewAnimation) UI.finishViewAnimation();
    UI.App.sel = { kind: 'face', index: rfMWFace([0, 1, 0]) };
    UI.cmdSketch(); await idle(); await wait(40);
    assert(UI.App.mode === 'sketch', 'sketch on the face');
    UI.zoomToFit(); await wait(40);
    UI.setTool('select'); await wait(20);
    return UI.activeSketchFeature();
  }
  step('rfMW: a model face selected in an open sketch: a click off the part clears it, Esc clears it, a sketch tool starts and draws over it, Delete with only the face selected deletes nothing and says so', async function () {
    try {
      var f = await rfMWBlockSketch(), on = rfMWScr3([2, 0.5, 1.5]);
      await rfMWClickAt(on); await wait(20);
      assert(UI.selection().length === 1 && UI.selection()[0].kind === 'face', 'face selected');
      // a click on empty space beside the block
      var r = $('viewport').getBoundingClientRect(), off = [Math.round(r.left + 12), Math.round(r.top + r.height / 2)];
      assert(!UI.sketchModelPick(off[0] - r.left, off[1] - r.top), 'nothing under the off-part spot');
      await rfMWClickAt(off); await wait(20);
      assert(!UI.selection().length, 'a click off the part clears: ' + JSON.stringify(UI.selection()));
      // Esc clears a face selection
      await rfMWClickAt(on); await wait(20);
      assert(UI.selection().length === 1, 'face selected again');
      await rfMWEsc(1);
      assert(!UI.selection().length, 'Esc clears the face: ' + JSON.stringify(UI.selection()));
      // Delete with only the face selected
      await rfMWClickAt(on); await wait(20);
      var s0 = rfMWState(), feats = UI.App.model.features.length, u0 = UI.App.undo.length;
      rfMWKey('Delete'); await idle(); await wait(30);
      assert(UI.App.mode === 'sketch' && rfMWState() === s0 && UI.App.model.features.length === feats, 'Delete changed nothing');
      assert(UI.App.undo.length === u0, 'no undo step for nothing: ' + (UI.App.undo.length - u0));
      var st = statusText();
      assert(!/Deleted|delete the feature|Under Defined/i.test(st), 'status after Delete: ' + st);
      // a sketch tool starts with the face selected and draws on it (the click goes to the tool, not the face)
      UI.setTool('line'); await wait(20);
      assert(UI.App.tool === 'line', 'Line tool on: ' + UI.App.tool);
      await rfMWClickAt(rfMWScr3([1, 0.5, 1])); await rfMWClickAt(rfMWScr3([3, 0.5, 1])); await rfMWEsc(2);
      f = rfMWF();
      assert(f.entities.length === 1 && f.entities[0].t === 'line', 'a line drawn on the face: ' + JSON.stringify(f.entities));
      return 'Delete status: ' + st;
    } finally { await rfMWDone(); }
  });

  // ---------------------------------------------------------------- flow (a): a customer DXF cleaned up for a flange
  function rfMWDxf() {
    function L(a, b) { return ['0', 'LINE', '8', '0', '10', a[0], '20', a[1], '11', b[0], '21', b[1]]; }
    var e = [].concat(L([0, 0], [6, 0]), L([0, 0], [6, 0]), L([6.0004, 0], [6, 4]), L([6, 4], [0.5, 4]), L([0, 4], [0, 0]),
      ['0', 'CIRCLE', '8', '0', '10', 1, '20', 1, '40', 0.25]);
    return ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', 1, '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'].concat(e, ['0', 'ENDSEC', '0', 'EOF']).join('\r\n') + '\r\n';
  }
  step('rfMW flow a: a customer DXF (a duplicate edge, a .0004 gap, an open end) inserted into an inch sketch without repair, Check Sketch for Feature, Repair Sketch, the open end closed with the Line tool, Fully Define, two dimensions changed, undo / redo all, Base Flange', async function () {
    try {
      var f = await rfMWNew(), log = [];
      var v = UI.importDXFText(rfMWDxf(), { name: 'customer.dxf' }); await idle();
      assert(v && UI.pmTitle() === 'DXF/DWG Import', 'PM ' + UI.pmTitle());
      var rep = pmField('Repair after import');
      assert(rep && rep.checked, 'Repair after import starts on');
      rep.click(); await idle();
      rfMWOK(); await idle();
      f = rfMWF();
      log.push(f.entities.length + ' entities in');
      assert(f.entities.length === 6, 'six entities as in the file: ' + f.entities.length);
      UI.cmdCheckSketch(); await wait(40);
      assert(UI.pmTitle() === 'Check Sketch for Feature', 'PM ' + UI.pmTitle());
      var sel = pmField('Feature usage');
      setInput(sel, 'baseFlange'); await wait(30);
      var rows = Array.prototype.map.call(D.querySelectorAll('#pm [data-lfi]'), function (r) { return r.textContent; });
      log.push('check: ' + rows.join(' / '));
      assert(rows.length >= 2, 'Check lists the problems: ' + rows.join(' | '));
      UI.pmCancel(); await wait(20);
      UI.cmdRepairSketch(); await wait(40);
      assert(UI.pmTitle() === 'Repair Sketch', 'PM ' + UI.pmTitle());
      var labs = Array.prototype.map.call(D.querySelectorAll('#pm label'), function (l) { return l.textContent.trim(); });
      log.push('repair: ' + labs.filter(function (t) { return /\(\d+\)/.test(t); }).join(', '));
      await UI.pmOK(); await idle();
      f = rfMWF();
      assert(f.entities.length === 5, 'duplicate merged: ' + f.entities.length + ' ' + JSON.stringify(f.entities));
      var right = f.entities.filter(function (e) { return e.t === 'line' && Math.abs(e.x1 - e.x2) < 1e-9 && e.x1 > 5; })[0];
      assert(right, 'the right side is square after the gap closed: ' + JSON.stringify(f.entities));
      // the open end: a line from (.5, 4) to (0, 4)
      UI.setTool('line'); await wait(20);
      await rfMWClick([0.5, 4]); await rfMWClick([0, 4]); await rfMWEsc(2);
      f = rfMWF();
      var prof = UI.K.sketchProfile(f);
      log.push('loops ' + prof.loops.length);
      assert(prof.loops.length === 2, 'outline + hole closed: ' + prof.loops.length + ' ' + rfMWRels().join(' '));
      UI.setTool('select'); await wait(20);
      UI.cmdFullyDefineSketch(); await wait(60);
      await UI.pmOK(); await idle(); await wait(30);
      assert(rfMWAn().status === 'full', 'Fully Define: ' + rfMWAn().status + ' dof ' + rfMWAn().dof);
      log.push('labels ' + rfMWLabels().join(','));
      await rfMWEditDim(/^6(\.0*)?$/, '7');
      await rfMWEditDim(/^4(\.0*)?$/, '5');
      f = rfMWF();
      var bb = UI.K.sketchProfile(f).loops.map(function (l) { return l.pts || []; });
      assert(rfMWAn().status === 'full', 'still fully defined: ' + rfMWAn().status);
      var n = await rfMWUndoAll();
      log.push(n + ' undos');
      UI.exitSketch(); await idle();
      UI.App.sel = { kind: 'feature', id: f.id };
      UI.cmdBaseFlange(); await idle();
      assert(UI.pmTitle() === 'Base Flange/Tab', 'PM ' + UI.pmTitle());
      setInput(pmField('Thickness'), '.0598'); await idle();
      rfMWOK(); await idle();
      var vol = K.massProps(UI.App.mesh, 1).volume, A = 35 - Math.PI * 0.0625;
      near(vol, A * 0.0598, 1e-6, 'Base Flange volume');
      return rfMWOut(log);
    } finally { await rfMWEnd(); }
  });

  // ---------------------------------------------------------------- flow (h): pasted fractions
  function rfMWPaste(inp, text) {
    inp.focus();
    var dt = new W.DataTransfer(); dt.setData('text/plain', text);
    var ev = new W.ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    inp.dispatchEvent(ev);
    // what the browser does itself when the page lets the paste through: a number box takes no "1 1/2"
    if (!ev.defaultPrevented) {
      if (inp.type === 'number') inp.value = /^\s*[-+]?(\d+\.?\d*|\.\d+)\s*$/.test(text) ? text.trim() : '';
      else inp.value = text;
      inp.dispatchEvent(new W.Event('input', { bubbles: true }));
    }
    return ev.defaultPrevented;
  }
  step('rfMW flow h: the text 1 1/2 pasted into a PropertyManager number box (Offset distance) and into the Modify box reads 1.5 in (the number box dropped it)', async function () {
    try {
      var f = await rfMWNew();
      UI.setTool('line'); await wait(20);
      await rfMWClick([0, 0]); await rfMWClick([4, 0]); await rfMWEsc(2);
      UI.setTool('select'); await wait(20);
      await rfMWClick([2, 0]);
      UI.cmdOffsetEntities(); await wait(40);
      var inp = pmField('Offset distance');
      assert(inp, 'Offset distance box');
      rfMWPaste(inp, '1 1/2'); await wait(30);
      pressEnter(inp); await wait(30);
      near(+inp.value, 1.5, 1e-12, 'Offset distance after the paste (' + inp.type + ' "' + inp.value + '")');
      await UI.pmOK(); await idle();
      f = rfMWF();
      var off = f.entities.filter(function (e, i) { return i > 0 && e.t === 'line'; })[0];
      assert(off, 'an offset line: ' + JSON.stringify(f.entities));
      near(Math.abs(off.y1), 1.5, 1e-9, 'offset 1.5 in');
      // the Modify box of the line's length
      var shown = await rfMWDim([[2, 0]], [2, -0.8], null);
      var box = await rfMWOpenDim(/^4(\.0*)?$/);
      box.select();
      rfMWPaste(box, '1 1/2'); await wait(20);
      pressEnter(box); await wait(60);
      f = rfMWF();
      near(Math.hypot(f.entities[0].x2 - f.entities[0].x1, f.entities[0].y2 - f.entities[0].y1), 1.5, 1e-9, 'line length after pasting 1 1/2 in the Modify box');
      if (!$('dim-edit').hidden) { rfMWKey('Escape'); await wait(20); }
      return shown + ' -> 1 1/2';
    } finally { await rfMWEnd(); }
  });

  // ---------------------------------------------------------------- flow (b): Sketch Fillet / Chamfer on a chain
  async function rfMWChain(pts) {
    UI.setTool('line'); await wait(20);
    for (var k = 0; k < pts.length; k++) await rfMWClick(pts[k]);
    await rfMWEsc(2);
  }
  function rfMWArcs(f) { return (f || rfMWF()).entities.filter(function (e) { return e.t === 'arc'; }); }
  step('rfMW flow b: a dimensioned plate outline, Sketch Fillet R.25 on two corners and Sketch Chamfer .25 on a third; the dimensions stay on the virtual sharps; the radius changed, one fillet deleted; undo / redo all, edit again', async function () {
    try {
      var f = await rfMWNew(), log = [];
      await rfMWChain([[0, 0], [5, 0], [5, 3], [0, 3], [0, 0]]);
      f = rfMWF();
      assert(f.entities.length === 4, 'four lines: ' + f.entities.length);
      await rfMWDim([[2.5, 0]], [2.5, -0.7], '5');
      await rfMWDim([[5, 1.5]], [5.8, 1.5], '3');
      UI.setTool('select'); await wait(20);
      UI.cmdSketchFillet(); await wait(40);
      assert(UI.pmTitle() === 'Sketch Fillet', 'PM ' + UI.pmTitle());
      setInput(pmField('Radius'), '.25'); pressEnter(pmField('Radius')); await wait(30);
      await rfMWClick([5, 0]); await wait(30); await rfMWClick([5, 3]); await wait(30);
      await UI.pmOK(); await idle();
      f = rfMWF();
      assert(rfMWArcs(f).length === 2, 'two fillets: ' + JSON.stringify(f.entities.map(function (e) { return e.t; })));
      UI.cmdSketchChamfer(); await wait(40);
      assert(UI.pmTitle() === 'Sketch Chamfer', 'PM ' + UI.pmTitle());
      setInput(pmField('Distance 1'), '.25'); pressEnter(pmField('Distance 1')); await wait(30);
      await rfMWClick([0, 3]); await wait(30);
      await UI.pmOK(); await idle();
      f = rfMWF();
      var labs = rfMWLabels();
      log.push('after fillet / chamfer: ' + labs.join(','));
      assert(labs.some(function (t) { return /^5(\.0*)?$/.test(t); }) && labs.some(function (t) { return /^3(\.0*)?$/.test(t); }), 'the 5 and 3 survive on the virtual sharps: ' + labs.join(','));
      var sharps = f.entities.filter(function (e) { return e.sharp; }).length;
      log.push(sharps + ' sharps, status ' + rfMWAn().status + ' dof ' + rfMWAn().dof);
      // the plate made 6 long: the fillets ride along
      await rfMWEditDim(/^5(\.0*)?$/, '6');
      f = rfMWF();
      var xs = f.entities.map(function (e) { return e.t === 'line' ? Math.max(e.x1, e.x2) : e.t === 'arc' ? e.cx + e.r : -1; });
      near(Math.max.apply(null, xs), 6, 1e-6, 'the right side at 6');
      // one radius changed (the radius dimension, R.25 -> .375)
      var rl = labs.filter(function (t) { return /^R/.test(t); });
      log.push('R labels ' + rl.join(','));
      await rfMWEditDim(/^R\.250?$/, '.375');
      f = rfMWF();
      var rs = rfMWArcs(f).map(function (a) { return +a.r.toFixed(6); });
      log.push('radii ' + rs.join(','));
      assert(rs.indexOf(0.375) >= 0, 'a radius .375: ' + rs.join(','));
      // one fillet deleted: the arc at the top right
      UI.setTool('select'); await wait(20);
      var top = rfMWArcs(f).filter(function (a) { return a.cy > 1.5; })[0];
      var mid = (top.a0 + top.a1) / 2 * Math.PI / 180;
      await rfMWClick([top.cx + top.r * Math.cos(mid), top.cy + top.r * Math.sin(mid)]);
      assert(UI.selection().length === 1 && UI.selection()[0].kind === 'entity' && f.entities[UI.selection()[0].index].t === 'arc', 'the fillet selected: ' + JSON.stringify(UI.selection()));
      rfMWKey('Delete'); await idle(); await wait(30);
      f = rfMWF();
      labs = rfMWLabels();
      log.push('after delete: ' + f.entities.map(function (e) { return e.t + (e.sharp ? '*' : ''); }).join(',') + ' labels ' + labs.join(',') + ' status ' + rfMWAn().status + ' / ' + statusText());
      assert(labs.some(function (t) { return /^6(\.0*)?$/.test(t); }) && labs.some(function (t) { return /^3(\.0*)?$/.test(t); }), 'the 6 and the 3 survive the deleted fillet: ' + labs.join(','));
      assert(rfMWAn().status !== 'over', 'not over defined');
      var n = await rfMWUndoAll();
      log.push(n + ' undos');
      return rfMWOut(log);
    } finally { await rfMWEnd(); }
  });

  // ---------------------------------------------------------------- flow (c): Move / Copy / Rotate / Scale / Stretch
  async function rfMWBox(a, b) { UI.setTool('select'); await wait(20); await rfMWDrag(a, b, 8); }
  function rfMWBoxOf(f, idx) {
    var b = [1e9, 1e9, -1e9, -1e9];
    (idx || f.entities.map(function (e, i) { return i; })).forEach(function (i) { (K.entityPolylines(f.entities[i]) || []).forEach(function (pl) { pl.pts.forEach(function (p) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }); }); });
    return b.map(function (x) { return +x.toFixed(6); });
  }
  step('rfMW flow c: a dimensioned plate with a hole moved (Keep relations off, then on), copied, rotated 90, scaled 2 and stretched by From/To clicks; dimensions follow; undo / redo all, edit again', async function () {
    try {
      var f = await rfMWNew(), log = [];
      UI.setTool('rect'); await wait(20);
      await rfMWClick([1, 1]); await rfMWClick([4, 3]); await rfMWEsc(2);
      UI.setTool('circle'); await wait(20);
      await rfMWClick([2, 2]); await rfMWClick([2.25, 2]); await wait(30);
      if (UI.sketchUnitBox && UI.sketchUnitBox.isOpen && UI.sketchUnitBox.isOpen()) { rfMWKey('Escape'); await wait(20); }
      await rfMWEsc(2);
      f = rfMWF();
      log.push('drawn: ' + f.entities.map(function (e) { return e.t; }).join(','));
      await rfMWDim([[2.5, 1]], [2.5, 0.4], '3');
      await rfMWDim([[4, 2]], [4.6, 2], '2');
      await rfMWDim([[2.25, 2]], [2.9, 2.6], '.5');
      var n0 = f.entities.length, st0 = rfMWAn();
      log.push('status ' + st0.status + ' dof ' + st0.dof);
      // Move: box everything, From/To (1, 1) -> (2, 1.5)
      await rfMWBox([0.5, 3.6], [4.6, 0.5]);
      var picked = UI.selection().filter(function (s) { return s.kind === 'entity'; }).length;
      assert(picked === n0, 'box selected everything: ' + picked + ' of ' + n0);
      UI.cmdMoveEntities(); await wait(40);
      assert(UI.pmTitle() === 'Move', 'PM ' + UI.pmTitle());
      log.push('move status: ' + statusText());
      await rfMWClick([1, 1]); await rfMWClick([2, 1.5]); await idle();
      f = rfMWF();
      var b = rfMWBoxOf(f);
      log.push('moved box ' + b.join(','));
      near(b[0], 2, 1e-6, 'moved x'); near(b[1], 1.5, 1e-6, 'moved y');
      assert(rfMWLabels().some(function (t) { return /^3(\.0*)?$/.test(t); }), 'dimensions kept: ' + rfMWLabels().join(','));
      // Copy with Keep relations: the copy keeps its own relations
      await rfMWBox([1.5, 3.9], [5.4, 1]);
      UI.cmdCopyEntities(); await wait(40);
      var keep = pmField('Keep relations'); if (keep && !keep.checked) { keep.click(); await wait(20); }
      await rfMWClick([2, 1.5]); await rfMWClick([2, -1.5]); await idle();
      f = rfMWF();
      log.push('copy: ' + f.entities.length + ' entities, ' + (f.rels || []).length + ' rels, status ' + rfMWAn().status);
      assert(f.entities.length === 2 * n0, 'a copy: ' + f.entities.length);
      // Rotate the copy 90 about its corner (2, -1.5)
      var copyIdx = []; for (var i = n0; i < 2 * n0; i++) copyIdx.push({ kind: 'entity', index: i });
      UI.setSelection(copyIdx); await wait(20);
      UI.cmdRotateEntities(); await wait(40);
      await rfMWClick([2, -1.5]); await wait(20);
      var ang = pmField('Angle'); setInput(ang, '90'); pressEnter(ang); await wait(30);
      await UI.pmOK(); await idle();
      f = rfMWF();
      b = rfMWBoxOf(f, copyIdx.map(function (s) { return s.index; }));
      log.push('rotated copy box ' + b.join(',') + ' status ' + rfMWAn().status);
      near(b[2] - b[0], 2, 1e-6, 'rotated: 2 wide'); near(b[3] - b[1], 3, 1e-6, 'rotated: 3 tall');
      // Scale the copy 2 about its corner
      UI.setSelection(copyIdx); await wait(20);
      UI.cmdScaleEntities(); await wait(40);
      await rfMWClick([2, -1.5]); await wait(20);
      var sc = pmField('Scale Factor'); setInput(sc, '2'); pressEnter(sc); await wait(30);
      var cp = pmField('Copy'); if (cp && cp.checked) { cp.click(); await wait(20); }
      await UI.pmOK(); await idle();
      f = rfMWF();
      b = rfMWBoxOf(f, copyIdx.map(function (s) { return s.index; }));
      log.push('scaled copy box ' + b.join(',') + ' labels ' + rfMWLabels().join(',') + ' status ' + rfMWAn().status + ' / ' + statusText());
      near(b[3] - b[1], 6, 1e-6, 'scaled: 6 tall');
      // Stretch the first plate's right side 1 to the right (crossing box over the right edge)
      UI.setSelection([]); await wait(10);
      await rfMWBox([5.4, 3.8], [4.6, 1.2]);
      log.push('stretch box: ' + UI.selection().length);
      UI.cmdStretchEntities(); await wait(40);
      await rfMWClick([5, 1.5]); await rfMWClick([6, 1.5]); await idle();
      f = rfMWF();
      b = rfMWBoxOf(f, f.entities.map(function (e, i) { return i; }).filter(function (i) { return i < n0; }));
      log.push('stretched box ' + b.join(',') + ' labels ' + rfMWLabels().join(',') + ' status ' + rfMWAn().status);
      near(b[2], 6, 1e-6, 'stretched to x 6');
      await rfMWEditDim(/^2(\.0*)?$/, '2.5');
      var n = await rfMWUndoAll();
      log.push(n + ' undos');
      return rfMWOut(log);
    } finally { await rfMWEnd(); }
  });

  // ---------------------------------------------------------------- flow (d): over defined, SketchXpert, relations PM
  function rfMWLabelEl(re) { if (UI.drawDims) UI.drawDims(true); return Array.prototype.filter.call(D.querySelectorAll('#dim-layer text'), function (x) { return re.test(x.textContent); })[0]; }
  function rfMWPmButton(text) { return Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (x) { return x.textContent.trim() === text || x.getAttribute('title') === text || x.getAttribute('data-rel') === text; })[0]; }
  step('rfMW flow d: a fully defined plate over defined by a third dimension left driving: status bar Over Defined, red; Add Relations offers and refuses a redundant Equal; SketchXpert from the status bar repairs it; a relation deleted in Display/Delete Relations; undo / redo all, edit again', async function () {
    try {
      var f = await rfMWNew(), log = [];
      await rfMWChain([[0, 0], [4, 0], [4, 2], [0, 2], [0, 0]]);
      f = rfMWF();
      log.push('rels ' + rfMWRels(f).join(' '));
      await rfMWDim([[2, 0]], [2, -0.7], '4');
      await rfMWDim([[4, 1]], [4.7, 1], '2');
      assert(rfMWAn().status === 'full', 'fully defined: ' + rfMWAn().status + ' dof ' + rfMWAn().dof);
      // Add Relations: the left and right lines (Ctrl+click) -> Equal is redundant
      UI.setTool('select'); await wait(20);
      await rfMWClick([0, 1]); await rfMWClick([4, 1], { ctrlKey: true });
      UI.cmdAddRelations(); await wait(40);
      var btns = Array.prototype.map.call(D.querySelectorAll('#pm button'), function (b) { return (b.getAttribute('title') || b.textContent).trim(); }).filter(Boolean);
      log.push('offered: ' + btns.join(','));
      var eq = Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (b) { return /Equal/.test(b.getAttribute('title') || b.textContent); })[0];
      assert(eq, 'Equal offered: ' + btns.join(','));
      var r0 = (f.rels || []).length;
      eq.click(); await idle(); await wait(30);
      f = rfMWF();
      log.push('Equal: ' + statusText() + ' / rels ' + r0 + '->' + (f.rels || []).length + ' ' + rfMWAn().status);
      await UI.pmOK(); await idle();
      // the top line dimensioned: Make Dimension Driven? -> leave it driving
      UI.setTool('dimension'); await wait(20);
      await rfMWClick([2, 2]); await rfMWClick([2, 2.7]); await wait(60);
      var modal = $('drv-driving');
      log.push('modal ' + !!modal);
      assert(modal, 'Make Dimension Driven? asked: ' + statusText());
      modal.click(); await idle(); await wait(30);
      if (!$('dim-edit').hidden) { rfMWKey('Escape'); await wait(20); }
      UI.setTool('select'); await wait(20);
      f = rfMWF();
      assert(rfMWAn().status === 'over', 'over defined: ' + rfMWAn().status);
      var stEl = D.querySelector('.sk-state');
      log.push('status bar: ' + (stEl && stEl.textContent) + ' / ' + statusText());
      assert(stEl && /Over Defined/.test(stEl.textContent), 'status bar says Over Defined: ' + (stEl && stEl.textContent));
      if (UI.drawDims) UI.drawDims(true);
      var fills = Array.prototype.map.call(D.querySelectorAll('#dim-layer text'), function (x) { return x.textContent + ':' + W.getComputedStyle(x).fill + ':' + (x.getAttribute('class') || '') + ':' + ((x.parentNode && x.parentNode.getAttribute && x.parentNode.getAttribute('class')) || ''); });
      log.push('label fills ' + fills.join(' ; '));
      var eFill = rfMWF().entities.map(function (e, i) { return UI.sketchEntityColor ? UI.sketchEntityColor(i) : ''; });
      log.push('entity states ' + rfMWAn().entities.join(','));
      // SketchXpert from the status bar
      stEl.click(); await wait(40);
      assert(UI.pmTitle() === 'SketchXpert', 'SketchXpert opened: ' + UI.pmTitle());
      var xs = UI.sketchXpertState();
      log.push('xpert ' + JSON.stringify(xs));
      assert(xs.names.length && !xs.names.some(function (nm) { return /^(Coincident|Horizontal|Vertical)/.test(nm); }), 'the first solution deletes the dimension / the Equal, not a corner or a side: ' + xs.names.join('; '));
      var acc = rfMWPmButton('Accept');
      assert(acc, 'Accept button');
      acc.click(); await idle(); await wait(30);
      log.push('after accept: ' + rfMWAn().status + ' / ' + statusText());
      assert(rfMWAn().status === 'full', 'repaired to fully defined: ' + rfMWAn().status);
      await UI.pmOK(); await idle();
      // Display/Delete Relations: the Horizontal of the top line deleted from the PM
      UI.cmdDisplayRelations(); await wait(40);
      var rows = Array.prototype.slice.call(D.querySelectorAll('#rel-display [data-key]'));
      log.push(rows.length + ' rows');
      var hz = rows.filter(function (r) { return /Horizontal/.test(r.textContent); })[0];
      assert(hz, 'a Horizontal row: ' + rows.map(function (r) { return r.textContent; }).join(' | '));
      var nr = (rfMWF().rels || []).length;
      hz.click(); await wait(30);
      var del = rfMWPmButton('Delete');
      log.push('delete button ' + !!del);
      if (del) del.click(); else rfMWKey('Delete');
      await idle(); await wait(30);
      f = rfMWF();
      log.push('rels ' + nr + ' -> ' + (f.rels || []).length + ', ' + rfMWAn().status + ' / ' + statusText());
      assert((f.rels || []).length === nr - 1, 'one relation deleted from the PM');
      await UI.pmOK(); await idle();
      await rfMWEditDim(/^4(\.0*)?$/, '4.5');
      await rfMWEditDim(/^2(\.0*)?$/, '2.25');
      var n = await rfMWUndoAll();
      log.push(n + ' undos');
      return rfMWOut(log);
    } finally { await rfMWEnd(); }
  });

  // ---------------------------------------------------------------- flow (e): Circular Sketch Pattern of a slot
  step('rfMW flow e: a straight slot patterned 6 round the origin (Circular Sketch Pattern), the count made 8 and the angle 180 in Edit Circular Pattern, one instance deleted; undo / redo all, edit again', async function () {
    try {
      var f = await rfMWNew(), log = [];
      UI.setTool('slot'); await wait(20);
      await rfMWClick([2.5, 0.75]); await rfMWClick([3.5, 0.75]); await rfMWClick([3, 0.875]); await rfMWEsc(2);
      f = rfMWF();
      var n0 = f.entities.length;
      log.push('slot: ' + f.entities.map(function (e) { return e.t + (e.construction ? 'c' : ''); }).join(','));
      await rfMWBox([2, 1.3], [4.1, 0.3]);
      log.push('picked ' + UI.selection().length);
      UI.cmdCircularSketchPattern(); await wait(40);
      assert(UI.pmTitle() === 'Circular Pattern', 'PM ' + UI.pmTitle());
      var cnt = pmField('Number of instances'); setInput(cnt, '6'); pressEnter(cnt); await wait(30);
      log.push('centre ' + pmField('Center X').value + ',' + pmField('Center Y').value + ' spacing ' + pmField('Spacing').value);
      await UI.pmOK(); await idle();
      f = rfMWF();
      var nSlots = f.entities.filter(function (e) { return e.t === 'arc'; }).length / 2;
      log.push(nSlots + ' slots, status ' + rfMWAn().status + ', labels ' + rfMWLabels().join(','));
      assert(nSlots === 6, 'six slots: ' + nSlots);
      // Edit Circular Pattern by the right-click menu on the seed
      UI.setTool('select'); await wait(20);
      await rfMWClick([3, 0.875]);
      var c = rfMWScr([3, 0.875]);
      rfMWEv('mousedown', c, { button: 2, buttons: 2 }); rfMWEv('mouseup', c, { button: 2 }); await wait(40);
      var row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (r) { return /Edit Circular Pattern/.test(r.textContent); })[0];
      assert(row, 'the right-click row: ' + Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (m) { return m.textContent; }).join(' | '));
      row.click();
      await wait(40);
      assert(/Circular Pattern/.test(UI.pmTitle()), 'edit PM: ' + UI.pmTitle());
      cnt = pmField('Number of instances'); setInput(cnt, '8'); pressEnter(cnt); await wait(30);
      var sp = pmField('Spacing'); setInput(sp, '180'); pressEnter(sp); await wait(30);
      await UI.pmOK(); await idle();
      f = rfMWF();
      nSlots = f.entities.filter(function (e) { return e.t === 'arc'; }).length / 2;
      var cs = f.entities.filter(function (e) { return e.t === 'line' && e.construction; }).map(function (e) { return Math.atan2((e.y1 + e.y2) / 2, (e.x1 + e.x2) / 2) * 180 / Math.PI; });
      log.push('edited: ' + nSlots + ' slots, centreline angles ' + cs.map(function (a) { return a.toFixed(1); }).join(','));
      assert(nSlots === 8, 'eight slots: ' + nSlots);
      var labs = rfMWLabels();
      log.push('labels after the edit ' + labs.join(','));
      assert(labs.length === 2 && labs.some(function (t) { return /°$/.test(t); }), 'the edit leaves one radius and one angle dimension (the old radius dimension stayed on a copied side): ' + labs.join(','));
      // one instance deleted: box over the last copy (at 180 - 180/7.. pick the one at 180 deg)
      var lastC = f.entities.filter(function (e) { return e.t === 'arc'; }).slice(-2);
      var mx = (lastC[0].cx + lastC[1].cx) / 2, my = (lastC[0].cy + lastC[1].cy) / 2;
      log.push('last at ' + mx.toFixed(3) + ',' + my.toFixed(3));
      UI.setSelection([]);
      await rfMWBox([mx - 0.8, my + 0.8], [mx + 0.8, my - 0.8]);
      var nsel = UI.selection().length;
      rfMWKey('Delete'); await idle(); await wait(30);
      f = rfMWF();
      nSlots = f.entities.filter(function (e) { return e.t === 'arc'; }).length / 2;
      log.push('deleted ' + nsel + ' -> ' + nSlots + ' slots, status ' + rfMWAn().status + ' / ' + statusText());
      assert(nSlots === 7, 'seven slots left: ' + nSlots);
      // Edit Circular Pattern again: the deleted one is an instance to skip, the count stays 8
      UI.setTool('select'); await wait(20);
      c = rfMWScr([3, 0.875]);
      rfMWEv('mousedown', c, { button: 2, buttons: 2 }); rfMWEv('mouseup', c, { button: 2 }); await wait(40);
      row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (r) { return /Edit Circular Pattern/.test(r.textContent); })[0];
      assert(row, 'Edit Circular Pattern after an instance was deleted: ' + Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (m) { return m.textContent; }).join(' | '));
      {
        row.click(); await wait(40);
        var pv = UI.pmSpec() && UI.pmSpec().values;
        log.push('PM ' + UI.pmTitle() + ' count ' + (pv && pv.count) + ' skip ' + JSON.stringify(pv && pv.skip) + ' temp ' + (UI.App.tempEntities || []).length);
        await UI.pmOK(); await idle();
        f = rfMWF();
        nSlots = f.entities.filter(function (e) { return e.t === 'arc'; }).length / 2;
        log.push('after OK ' + nSlots + ' slots, ' + rfMWLabels().join(','));
        assert(nSlots === 7, 'the edit keeps the deleted instance out: ' + nSlots);
      }
      if (D.querySelector('.menu')) { rfMWKey('Escape'); await wait(20); }
      log.push('labels ' + rfMWLabels().join(','));
      await rfMWEditDim(/°$/, '20');
      assert(/^20°$/.test(rfMWLabels().filter(function (t) { return /°/.test(t); })[0] || ''), 'the spacing reads 20°: ' + rfMWLabels().join(',') + ' / ' + statusText());
      await rfMWEditDim(/^2\.649$/, '3');
      log.push('after R: ' + rfMWLabels().join(',') + ' / ' + statusText());
      assert(rfMWLabels().some(function (t) { return /^3(\.0*)?$/.test(t); }), 'the pattern radius reads 3 (it was refused after the spacing changed): ' + statusText());
      var n = await rfMWUndoAll();
      log.push(n + ' undos');
      return rfMWOut(log);
    } finally { await rfMWEnd(); }
  });

  // ---------------------------------------------------------------- flow (f): a bolt circle on a construction circle
  step('rfMW flow f: a bolt circle: a circle made construction in its PropertyManager, a hole on it located by an angle dimension from a centerline, patterned 4 equal; two holes toggled For construction and back; undo / redo all, edit again', async function () {
    try {
      var f = await rfMWNew(), log = [];
      UI.setTool('circle'); await wait(20);
      await rfMWClick([0, 0]); await rfMWClick([2, 0]); await wait(30);
      if (UI.sketchUnitBox && UI.sketchUnitBox.isOpen && UI.sketchUnitBox.isOpen()) { rfMWKey('Escape'); await wait(20); }
      await rfMWEsc(2);
      UI.setTool('select'); await wait(20);
      await rfMWClick([0, 2]);
      assert(UI.pmTitle() === 'Circle', 'Circle PM: ' + UI.pmTitle());
      var fc = pmField('For construction'); assert(fc, 'For construction box'); fc.click(); await idle();
      f = rfMWF();
      assert(f.entities[0].construction, 'construction circle');
      await rfMWEsc(1);
      await rfMWDim([[0, 2]], [2.6, 2.6], '4');
      // a hole on the bolt circle at 30 degrees, a centerline from the origin to it
      var h = [Math.cos(Math.PI / 6) * 2, Math.sin(Math.PI / 6) * 2];
      UI.setTool('circle'); await wait(20);
      await rfMWClick(h); await rfMWClick([h[0] + 0.2, h[1]]); await wait(30);
      if (UI.sketchUnitBox && UI.sketchUnitBox.isOpen && UI.sketchUnitBox.isOpen()) { rfMWKey('Escape'); await wait(20); }
      await rfMWEsc(2);
      UI.setTool('line'); await wait(20);
      if (UI.cmdCenterline) { UI.cmdCenterline(); await wait(20); }
      await rfMWClick([0, 0]); await rfMWClick(h); await rfMWEsc(2);
      UI.setTool('line'); await wait(20);
      if (UI.cmdCenterline) { UI.cmdCenterline(); await wait(20); }
      await rfMWClick([0, 0]); await rfMWClick([3, 0]); await rfMWEsc(2);
      f = rfMWF();
      log.push('drawn ' + f.entities.map(function (e) { return e.t + (e.construction ? 'c' : ''); }).join(',') + ' rels ' + rfMWRels(f).join(' '));
      var shown = await rfMWDim([[h[0] / 2, h[1] / 2], [1.5, 0]], [1.4, 0.35], '45');
      f = rfMWF();
      var hole = f.entities[1];
      log.push('angle shown ' + shown + ' hole at ' + hole.cx.toFixed(4) + ',' + hole.cy.toFixed(4));
      near(Math.atan2(hole.cy, hole.cx) * 180 / Math.PI, 45, 1e-6, 'hole at 45');
      near(Math.hypot(hole.cx, hole.cy), 2, 1e-6, 'hole on the bolt circle');
      await rfMWDim([[hole.cx + hole.r, hole.cy]], [hole.cx + 0.6, hole.cy + 0.6], '3/8');
      // pattern the hole 4 equal round the origin
      UI.setTool('select'); await wait(20);
      UI.setSelection([{ kind: 'entity', index: 1 }]);
      UI.cmdCircularSketchPattern(); await wait(40);
      var cnt = pmField('Number of instances'); setInput(cnt, '4'); pressEnter(cnt); await wait(30);
      var eq = pmField('Equal spacing'); if (eq && !eq.checked) { eq.click(); await wait(20); }
      await UI.pmOK(); await idle();
      f = rfMWF();
      var holes = f.entities.filter(function (e) { return e.t === 'circle' && !e.construction; });
      log.push(holes.length + ' holes ' + holes.map(function (c) { return (Math.atan2(c.cy, c.cx) * 180 / Math.PI).toFixed(1); }).join(',') + ' status ' + rfMWAn().status + ' dof ' + rfMWAn().dof);
      assert(holes.length === 4, 'four holes');
      // two holes toggled For construction in the selection PM, then back
      var a = holes[1], b = holes[2];
      await rfMWClick([a.cx + a.r, a.cy]); await rfMWClick([b.cx + b.r, b.cy], { ctrlKey: true }); await wait(30);
      log.push('PM ' + UI.pmTitle() + ' sel ' + UI.selection().length);
      fc = pmField('For construction');
      assert(fc, 'For construction on the selection');
      fc.click(); await idle();
      f = rfMWF();
      var nc = f.entities.filter(function (e) { return e.t === 'circle' && e.construction; }).length;
      assert(nc === 3, 'two holes construction: ' + nc);
      fc = pmField('For construction'); fc.click(); await idle();
      f = rfMWF();
      nc = f.entities.filter(function (e) { return e.t === 'circle' && e.construction; }).length;
      assert(nc === 1, 'back: ' + nc);
      await rfMWEsc(1);
      await rfMWEditDim(/^Ø?4(\.0*)?$/, '5');
      await rfMWEditDim(/^45/, '30');
      f = rfMWF();
      holes = f.entities.filter(function (e) { return e.t === 'circle' && !e.construction; });
      log.push('after edits ' + holes.map(function (c) { return Math.hypot(c.cx, c.cy).toFixed(4) + '@' + (Math.atan2(c.cy, c.cx) * 180 / Math.PI).toFixed(1); }).join(','));
      var n = await rfMWUndoAll();
      log.push(n + ' undos');
      return rfMWOut(log);
    } finally { await rfMWEnd(); }
  });

  // ---------------------------------------------------------------- flow (g): Selected Contours
  step('rfMW flow g: a plate and an overlapping circle, Boss-Extrude with one Selected Contour (the plate less the circle), then the circle deleted in Edit Sketch: the contour is re-found as the whole plate', async function () {
    try {
      var f = await rfMWNew(), log = [];
      UI.setTool('rect'); await wait(20);
      await rfMWClick([0, 0]); await rfMWClick([4, 2]); await rfMWEsc(2);
      UI.setTool('circle'); await wait(20);
      await rfMWClick([4, 1]); await rfMWClick([4.75, 1]); await wait(30);
      if (UI.sketchUnitBox && UI.sketchUnitBox.isOpen && UI.sketchUnitBox.isOpen()) { rfMWKey('Escape'); await wait(20); }
      await rfMWEsc(2);
      await rfMWDim([[2, 0]], [2, -0.6], '4');
      await rfMWDim([[0, 1]], [-0.6, 1], '2');
      await rfMWEditDim(/^4(\.0*)?$/, '5'); await rfMWEditDim(/^5(\.0*)?$/, '4');
      await rfMWEditDim(/^2(\.0*)?$/, '2.5'); await rfMWEditDim(/^2\.50*$/, '2');
      log.push(await rfMWUndoAll() + ' undos');
      f = rfMWF(); var id = f.id;
      var circ = f.entities.filter(function (e) { return e.t === 'circle'; })[0];
      log.push('circle r ' + circ.r.toFixed(4));
      UI.exitSketch(); await idle();
      UI.App.sel = { kind: 'feature', id: id };
      UI.cmdExtrude(); await wait(40);
      setInput(pmNumber(0), '.5'); await wait(30);
      await rfMWClick([1, 1]); await idle(); await wait(30);
      var vals = UI.pmSpec().values;
      log.push('contours ' + JSON.stringify(vals.contours));
      assert(vals.contours && vals.contours.length === 1, 'one contour picked');
      await UI.pmOK(); await idle();
      var r = circ.r, d = 0, half = r * r * Math.acos(d / r) - d * Math.sqrt(r * r - d * d);
      var A = 8 - half;   // the circle's centre is on the right edge: half of it is inside the plate
      var v1 = K.massProps(UI.App.mesh, 1).volume;
      log.push('volume ' + v1.toFixed(6));
      near(v1, A * 0.5, 1e-6, 'plate less the half circle');
      UI.enterSketch(id); await idle(); await wait(30);
      UI.setTool('select'); await wait(20);
      await rfMWClick([4 + circ.r, 1]);
      rfMWKey('Delete'); await idle(); await wait(30);
      UI.exitSketch(); await idle(); await wait(30);
      var v2 = K.massProps(UI.App.mesh, 1).volume;
      log.push('after the circle went: ' + v2.toFixed(6) + ' errors ' + JSON.stringify((UI.App.build && UI.App.build.errors) || []) + ' / ' + statusText());
      near(v2, 4, 1e-6, 'the whole plate');
      // a contour that goes away: a lone circle beside the plate picked alone, then deleted
      UI.enterSketch(id); await idle(); await wait(30);
      UI.setTool('circle'); await wait(20);
      await rfMWClick([6, 1]); await rfMWClick([6.5, 1]); await wait(30);
      if (UI.sketchUnitBox && UI.sketchUnitBox.isOpen && UI.sketchUnitBox.isOpen()) { rfMWKey('Escape'); await wait(20); }
      await rfMWEsc(2);
      UI.exitSketch(); await idle();
      var ext = UI.App.model.features.filter(function (x) { return x.sketch === id || x.sketchId === id; })[0] || UI.App.model.features[UI.App.model.features.length - 1];
      log.push('feature ' + ext.type + ' contours ' + JSON.stringify(ext.contours));
      UI.App.sel = { kind: 'feature', id: ext.id };
      UI.editFeature(ext); await wait(60);
      log.push('edit PM ' + UI.pmTitle());
      var vv = UI.pmSpec() && UI.pmSpec().values;
      if (vv && vv.contours) {
        var box = Array.prototype.filter.call(D.querySelectorAll('#pm .pm-pick'), function (b) { return /sketch regions|contour/i.test(b.textContent); })[0];
        log.push('contour box ' + (box ? box.className : 'none'));
        if (box && !/active/.test(box.className)) { box.click(); await wait(30); }
        await rfMWClick([1, 1]); await wait(30); await rfMWClick([6, 1]); await idle(); await wait(30);
        log.push('picked ' + JSON.stringify(vv.contours));
        await UI.pmOK(); await idle();
        var v3 = K.massProps(UI.App.mesh, 1).volume;
        log.push('circle alone ' + v3.toFixed(6));
        near(v3, Math.PI * 0.25 * 0.5, 1e-6, 'the circle alone');
        UI.enterSketch(id); await idle(); await wait(30);
        UI.setTool('select'); await wait(20);
        await rfMWClick([6.5, 1]);
        rfMWKey('Delete'); await idle(); await wait(30);
        UI.exitSketch(); await idle(); await wait(30);
        var v4 = K.massProps(UI.App.mesh, 1).volume;
        assert(/Selected contour .* no longer inside a closed sketch region/.test(JSON.stringify((UI.App.build && UI.App.build.errors) || {})), 'the feature says its contour is gone');
        log.push('after the circle went: ' + v4.toFixed(6) + ' errors ' + JSON.stringify((UI.App.build && UI.App.build.errors) || []) + ' warnings ' + JSON.stringify((UI.App.build && UI.App.build.warnings) || []).slice(0, 200) + ' / ' + statusText());
      }
      return rfMWOut(log);
    } finally { await rfMWEnd(); }
  });

  // ---------------------------------------------------------------- flow (h): Ctrl+C / Ctrl+V of entities
  step('rfMW flow h2: Ctrl+C of a dimensioned hole pair, Ctrl+V placed by a click in the same sketch and in another sketch; the copies keep their relations; undo / redo all, edit again', async function () {
    try {
      var f = await rfMWNew(), log = [];
      UI.setTool('circle'); await wait(20);
      await rfMWClick([1, 1]); await rfMWClick([1.25, 1]); await wait(30);
      if (UI.sketchUnitBox && UI.sketchUnitBox.isOpen && UI.sketchUnitBox.isOpen()) { rfMWKey('Escape'); await wait(20); }
      await rfMWEsc(2);
      UI.setTool('circle'); await wait(20);
      await rfMWClick([2, 1]); await rfMWClick([2.25, 1]); await wait(30);
      if (UI.sketchUnitBox && UI.sketchUnitBox.isOpen && UI.sketchUnitBox.isOpen()) { rfMWKey('Escape'); await wait(20); }
      await rfMWEsc(2);
      await rfMWDim([[1.25, 1]], [1.6, 1.6], '.5');
      await rfMWDim([[2.25, 1]], [2.6, 1.6], '.5');
      f = rfMWF();
      log.push('rels ' + rfMWRels(f).join(' '));
      UI.setTool('select'); await wait(20);
      await rfMWBox([0.5, 1.6], [2.6, 0.4]);
      var ev = rfMWKey('c', { ctrlKey: true }); await wait(20);
      log.push('copy: ' + statusText());
      assert(ev.defaultPrevented && UI.sketchClipboard() && UI.sketchClipboard().entities === 2, 'copied 2: ' + JSON.stringify(UI.sketchClipboard()));
      rfMWKey('v', { ctrlKey: true }); await wait(30);
      log.push('paste PM ' + UI.pmTitle() + ' / ' + statusText());
      await rfMWMove([3.5, 2.5]); await rfMWClick([3.5, 2.5]); await idle();
      f = rfMWF();
      log.push('pasted: ' + f.entities.length + ' ' + statusText() + ' rels ' + rfMWRels(f).join(' '));
      assert(f.entities.length === 4, 'four circles');
      var c2 = f.entities.slice(2).map(function (e) { return [e.cx, e.cy]; });
      near((c2[0][0] + c2[1][0]) / 2, 3.5, 1e-6, 'pasted where clicked (x)');
      await rfMWEditDim(/^Ø\.50*$/, '.375');
      await rfMWEditDim(/^Ø\.50*$/, '.625');
      var n = await rfMWUndoAll();
      log.push(n + ' undos');
      // another sketch
      UI.exitSketch(); await idle();
      await UI.newSketchOnPlane('Front'); await idle();
      rfMWKey('v', { ctrlKey: true }); await wait(30);
      await rfMWMove([5, 1]); await rfMWClick([5, 1]); await idle();
      var g = rfMWF();
      log.push('other sketch: ' + g.entities.length + ' ' + statusText());
      assert(g.entities.length === 2 && g.id !== f.id, 'pasted into the second sketch');
      return rfMWOut(log);
    } finally { await rfMWEnd(); }
  });
