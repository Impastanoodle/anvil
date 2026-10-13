  // --- r5/sketch5 ---
  function r5Boxes(sel) { return Array.prototype.map.call(D.querySelectorAll(sel), function (n) { var b = n.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; }); }
  function r5Overlap(a, b) { return a[0] < b[2] - 0.5 && a[2] > b[0] + 0.5 && a[1] < b[3] - 0.5 && a[3] > b[1] + 0.5; }
  function r5Key(k, target) { (target || D.body).dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
  step('r5/sketch5: an angle dimension takes its quadrant from the cursor (between the lines: the angle; beside one: its supplement); its label follows the cursor round the arc and stays where it is dropped or dragged', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 30, y2: 30 });
    UI.updateSketches();
    UI.setTool('dimension');
    rskClick([20, 0]); rskClick([15, 15]);
    selEv('mousemove', rskScr([20, 8]));
    assert(UI.App.tempRelDim && !UI.App.tempRelDim.sup && UI.App.tempRelDim.ta == null, 'between the lines, label in the middle: ' + JSON.stringify(UI.App.tempRelDim));
    selEv('mousemove', rskScr([-10, 6]));
    assert(UI.App.tempRelDim.sup && UI.App.tempRelDim.q === -1, 'beside line 2, past the vertex: supplement ' + JSON.stringify(UI.App.tempRelDim));
    r4Dims();
    var tt = D.querySelector('#dim-layer g.dim.temp text');
    assert(tt && tt.textContent === '135°', 'shows 135°: ' + (tt && tt.textContent));
    var cur = rskScr([-10, 6]), tb = tt.getBoundingClientRect(), vr = $('viewport').getBoundingClientRect();
    assert(Math.hypot(tb.left + tb.width / 2 - vr.left - cur[0], tb.top + tb.height / 2 - vr.top - cur[1]) < 30, 'label at the cursor: ' + [tb.left - vr.left, tb.top - vr.top] + ' vs ' + cur);
    rskClick([-10, 6]);
    UI.cancelDimEdit();
    var rel = f.rels.filter(function (r) { return r.type === 'angle'; })[0];
    assert(rel && rel.sup && Math.abs(rel.v - 135) < 1e-9 && rel.ta != null, 'placed ' + JSON.stringify(rel));
    var r = UI.editRelDim(f.rels.indexOf(rel), '150');
    assert(r.ok, JSON.stringify(r));
    near(W.SketchSolver.measure(f, 'angle', ['0', '1']), 30, 1e-6, 'the lines at 30° (150° on the other side)');
    // drag the label round the arc: ta follows, one undo step
    await wait(500);
    r4Dims();
    D.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true }));
    var undo0 = UI.App.undo.length, ta0 = rel.ta, xy = r4Press(r4Text('150°')), to = rskScr([-9, -3]);
    for (var k = 1; k <= 5; k++) { r4Win('mousemove', [xy[0] + (vr.left + to[0] - xy[0]) * k / 5, xy[1] + (vr.top + to[1] - xy[1]) * k / 5]); await wait(20); }
    r4Win('mouseup', [vr.left + to[0], vr.top + to[1]]);
    assert(rel.ta !== ta0 && rel.sup && Math.abs(rel.v - 150) < 1e-9, 'label moved, value kept: ' + JSON.stringify(rel));
    assert(UI.App.undo.length === undo0 + 1, 'one undo step');
    return 'ta ' + ta0 + ' -> ' + rel.ta;
  });
  step('r5/sketch5: Mirror Entities in place carries the dimensions with their entities (labels mirrored); A, A is the 3 Point Arc with typed chord and radius', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: -5, x2: 0, y2: 30 }, { t: 'line', x1: 5, y1: 0, x2: 35, y2: 10 }, { t: 'line', x1: 5, y1: 20, x2: 5, y2: 30 });
    f.dims = [{ e: 1, k: 'len', off: 6, tx: 8 }, { e: 2, k: 'len', off: 3 }];
    UI.updateSketches();
    var a0 = UI.dimAnchor(f.entities[1], f.dims[0]);
    UI.App.sel = { kind: 'entity', index: 1 };
    UI.cmdMirrorEntities(); UI.pmSetValue('axis', '0'); UI.pmSetValue('copy', false);
    await UI.pmOK();
    var d0 = f.dims[0], a1 = UI.dimAnchor(f.entities[d0.e], d0);
    assert(f.entities[d0.e].x2 < 0 && d0.k === 'len', 'dimension on the mirrored line: ' + JSON.stringify(f.dims));
    near(a1[0], -a0[0], 1e-6, 'label mirrored x'); near(a1[1], a0[1], 1e-6, 'label y');
    assert(f.dims[1].e === 1 && f.entities[1].x1 === 5, 'the other dimension stays on its line: ' + JSON.stringify(f.dims[1]));
    // 3 Point Arc from the keyboard: A then A again
    UI.setTool('select');
    r5Key('a'); r5Key('a');
    assert(UI.App.tool === 'arc3', 'A, A: ' + UI.App.tool);
    rskClick([40, -20]);
    selEv('mousemove', rskScr([55, -18]));
    r5Key('3');
    var ins = UI.sketchNumBox();
    assert(ins && ins.length === 2, 'chord L / A box');
    ins[0].value = '30'; ins[0].dispatchEvent(new W.Event('input')); ins[1].value = '0'; ins[1].dispatchEvent(new W.Event('input'));
    r5Key('Enter', ins[0]);
    assert(UI.App.toolState.pts.length === 2 && UI.App.toolState.pts[1][0] === 70 && UI.App.toolState.pts[1][1] === -20, 'end point typed: ' + JSON.stringify(UI.App.toolState.pts));
    selEv('mousemove', rskScr([55, -14]));
    r5Key('2');
    ins = UI.sketchNumBox();
    assert(ins && ins.length === 1, 'R box');
    ins[0].value = '25'; ins[0].dispatchEvent(new W.Event('input'));
    r5Key('Enter', ins[0]);
    var arc = f.entities[f.entities.length - 1];
    assert(arc.t === 'arc' && Math.abs(arc.r - 25) < 1e-9 && arc.cy < -20, 'arc R25 bulging to the cursor side: ' + JSON.stringify(arc));
    var rd = f.dims.filter(function (d) { return d.e === f.entities.length - 1 && d.k === 'r'; });
    assert(rd.length === 1, 'radius dimension added: ' + JSON.stringify(f.dims));
    UI.setTool('select');
    return 'arc R' + arc.r;
  });
  step('r5/sketch5: relation icons keep clear of each other and of the dimension labels; merged corners show none; hovering an icon or a Display/Delete Relations row lights up its entities; the list puts over-defining items first, deletes from the keyboard, and a click on an entity filters it', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'rect', x: 0, y: 0, w: 40, h: 25 });
    W.SketchSolver.explodeRect(f, 0);
    f.entities.push({ t: 'circle', cx: 10, cy: 12.5, r: 4 }, { t: 'circle', cx: 30, cy: 12.5, r: 4 });
    W.SketchSolver.addRelation(f, 'equal', ['4', '5']); W.SketchSolver.addRelation(f, 'horizontal', ['4.c', '5.c']); W.SketchSolver.addRelation(f, 'coincident', ['0.p1', 'O']);
    f.dims = [{ e: 0, k: 'len', off: -6 }, { e: 4, k: 'dia', ang: 45 }];
    var showDims = UI.App.view.showDims;
    UI.App.view.showDims = true;
    UI.updateSketches(); UI.setTool('select');
    var t0 = performance.now();
    for (var k = 0; k < 5; k++) r4Dims();
    var ms = (performance.now() - t0) / 5;
    var icons = r5Boxes('#dim-layer .rel-badge[data-rel] rect'), labels = r5Boxes('#dim-layer g.dim text');
    UI.App.view.showDims = showDims;
    assert(icons.length === 9, 'icons (corner Coincidents merged): ' + icons.length);
    icons.forEach(function (a, i) {
      icons.forEach(function (b, j) { if (j > i) assert(!r5Overlap(a, b), 'icons ' + i + ' / ' + j + ' overlap'); });
      labels.forEach(function (b, j) { assert(!r5Overlap(a, b), 'icon ' + i + ' overlaps label ' + j + ' ' + a + ' / ' + b); });
    });
    // hover an icon: its entities light up
    var eq = D.querySelector('#dim-layer .rel-badge[data-rel="' + f.rels.map(function (r) { return r.type; }).indexOf('equal') + '"]');
    eq.dispatchEvent(new W.MouseEvent('mouseenter'));
    assert(D.querySelectorAll('#dim-layer .rel-hot').length === 2, 'two circles lit: ' + D.querySelectorAll('#dim-layer .rel-hot').length);
    D.querySelector('#dim-layer .rel-badge.hot').dispatchEvent(new W.MouseEvent('mouseleave'));
    assert(!D.querySelector('#dim-layer .rel-hot'), 'unlit');
    // over-define: Parallel on the top and bottom lines
    W.SketchSolver.addRelation(f, 'parallel', ['0', '2']);
    UI.updateSketches();
    UI.cmdDisplayRelations();
    var rows = D.querySelectorAll('#rel-display .rel-row');
    assert(/Parallel/.test(rows[0].textContent) && rows[0].classList.contains('redundant'), 'over-defining first: ' + rows[0].textContent);
    rows[0].dispatchEvent(new W.MouseEvent('mouseenter'));
    assert(D.querySelectorAll('#dim-layer .rel-hot').length === 2 && UI.App.relHover != null, 'row hover lights the two lines');
    rows[0].dispatchEvent(new W.MouseEvent('mouseleave'));
    var n0 = f.rels.length;
    rows[0].click();
    r5Key('Delete', rows[0]);
    assert(f.rels.length === n0 - 1 && !f.rels.some(function (r) { return r.type === 'parallel'; }), 'Delete key removed it');
    assert(D.activeElement && D.activeElement.classList.contains('rel-row'), 'focus stays in the list');
    r5Key('ArrowDown', D.activeElement);
    assert(UI.App.sel && UI.App.sel.kind === 'rel', 'arrow keys select: ' + JSON.stringify(UI.App.sel));
    // a click on circle 5 in the graphics area shows its relations
    var c = rskScr([34, 12.5]);
    UI.App.command.onSketchPoint(null, c[0], c[1]);
    rows = D.querySelectorAll('#rel-display .rel-row');
    assert(rows.length === 2 && Array.prototype.every.call(rows, function (r) { return /Circle/.test(r.textContent); }), 'filtered to the circle: ' + Array.prototype.map.call(rows, function (r) { return r.textContent; }).join(' | '));
    await UI.pmOK();
    return 'drawDims ' + ms.toFixed(2) + ' ms, ' + icons.length + ' icons';
  });
  step('r5/sketch5: right-click on an entity opens the sketch menu (Construction Geometry toggles it); the FeatureManager shows (-) until the sketch is fully defined; Discard Changes asks first; the confirmation corner sits side by side', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 });
    W.SketchSolver.infer(f, 0);
    UI.updateSketches(); UI.refreshTree(); UI.setTool('select');
    function row() { return Array.prototype.filter.call(D.querySelectorAll('#tree .ti .nm'), function (n) { return /Sketch\d/.test(n.textContent); }).pop(); }
    assert(row() && /^\(-\) Sketch\d+/.test(row().textContent), 'under defined: ' + (row() && row().textContent));
    var p = rskScr([15, 0]);
    selEv('mousemove', p); selEv('mousedown', p, $('viewport'), { button: 2, buttons: 2 }); selEv('mouseup', p, null, { button: 2, buttons: 0 });
    var items = Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (m) { return m.textContent; });
    assert(items.some(function (t) { return /Construction Geometry/.test(t); }) && items.some(function (t) { return /Exit Sketch/.test(t); }), 'menu ' + items.join(' | '));
    var con = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return /Construction Geometry/.test(m.textContent); })[0];
    con.click();
    assert(f.entities[0].construction === true && !D.querySelector('.menu'), 'construction ' + JSON.stringify(f.entities[0]));
    anvil.addRelation('distance', ['0.p1', '0.p2'], 30);
    if (!f.rels.some(function (r) { return r.type === 'coincident' && r.refs.indexOf('O') >= 0; })) anvil.addRelation('coincident', ['0.p1', 'O']);
    var st = UI.sketchStatus();
    assert(st.status === 'full', 'fully defined ' + JSON.stringify(st));
    assert(row() && /^Sketch\d+/.test(row().textContent), 'no (-) once fully defined: ' + row().textContent);
    var b = $('exit-sketch').querySelectorAll('button');
    assert(b.length === 2 && Math.abs(b[0].getBoundingClientRect().top - b[1].getBoundingClientRect().top) < 1 && b[0].getBoundingClientRect().left < b[1].getBoundingClientRect().left, 'side by side');
    b[1].click();
    assert(!$('modal').hidden && /Discard/.test($('modal').textContent) && UI.App.mode === 'sketch', 'asks before discarding');
    $('sk-keep').click();
    assert(UI.App.mode === 'sketch' && f.entities.length === 1, 'kept editing');
    b[1].click(); $('sk-discard').click();
    await idle();
    assert(UI.App.mode === 'part', 'discarded and exited');
    return 'ok';
  });
  step('r5/sketch5: placing a Smart Dimension or deleting one updates Under / Fully Defined (status bar, colours, FeatureManager) at once, not on the next edit', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 });
    W.SketchSolver.infer(f, 0);
    UI.updateSketches(); UI.refreshTree();
    function st() { var s = D.querySelector('#status-right .sk-state'); return s ? s.textContent : ''; }
    assert(st() === 'Under Defined', st());
    UI.setTool('dimension');
    rskClick([15, 0]); rskClick([15, -8]);
    assert(st() === 'Fully Defined' && UI.App.sketchState.status === 'full', 'placed: ' + st());
    var black = UI.groups.sketches.children.filter(function (o) { return o.userData && o.userData.sketch === f.id; }).every(function (o) { return o.material.color.getHex() === 0x15181d; });
    assert(black, 'drawn black at once');
    var inp = $('dim-edit').querySelector('input');
    inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    UI.setTool('select');
    UI.App.sel = { kind: 'dim', index: 0 };
    UI.deleteSelection();
    assert(!(f.dims || []).length && st() === 'Under Defined', 'deleted: ' + st());
    return 'ok';
  });
  step('r5/sketch5: with a PropertyManager open in a sketch the confirmation corner holds its OK / Cancel; closed, Exit Sketch / Discard come back', async function () {
    await rskNew();
    function cls() { return Array.prototype.map.call($('exit-sketch').querySelectorAll('button'), function (b) { return b.className; }).join(','); }
    assert(cls() === 'cc-exit,cc-cancel', cls());
    UI.cmdAddRelations();
    await wait(30);
    assert(cls() === 'cc-ok,cc-cancel', 'PM open: ' + cls());
    $('exit-sketch').querySelector('.cc-ok').click();
    await wait(30);
    assert(!UI.hasPM() && cls() === 'cc-exit,cc-cancel', 'PM closed: ' + cls());
    return 'ok';
  });
  // --- end r5/sketch5 ---
