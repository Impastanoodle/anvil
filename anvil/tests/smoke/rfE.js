  // --- rfE (sketch fidelity findings 2, 5, 9, 10, 11, 14: Modify box, Tangent start, Smart Dimension preselection,
  // the Line chain's right-click menu, the Dimension PM value, the status bar / hint per command) ---
  // a new Front sketch at 0.025 units per pixel (a 3 × 2 line is about 120 px wide)
  async function rfENew(ents) {
    await rskNew();
    UI.zoomView(0.025 / UI.cam.scale);
    UI.App.gridStale = true;
    var f = UI.activeSketchFeature();
    (ents || []).forEach(function (e) { f.entities.push(JSON.parse(JSON.stringify(e))); });
    UI.updateSketches(); UI.setTool('select'); UI.setSelection([]);
    return f;
  }
  function rfERclick(uv) {
    var p = rskScr(uv);
    selEv('mousemove', p);
    selEv('mousedown', p, $('viewport'), { button: 2, buttons: 2 });
    selEv('mouseup', p, null, { button: 2, buttons: 0 });
  }
  function rfEMenu() { var ms = D.querySelectorAll('body > .menu'), m = ms[ms.length - 1]; return m ? Array.prototype.slice.call(m.querySelectorAll('.mi')) : []; }
  function rfEMenuRow(re) { return rfEMenu().filter(function (r) { return re.test(r.textContent); })[0]; }
  step('rfE: Modify box — ✓ / Enter / a click elsewhere with the shown text (3.6056) untouched keep a √13 line exactly (no undo step, no "Dimension set to"); a typed value still drives it', async function () {
    var f = await rfENew([{ t: 'line', x1: 0, y1: 0, x2: 3, y2: 2 }]), R13 = Math.sqrt(13);
    UI.setTool('dimension');
    rskClick([1.5, 1]); rskClick([-0.6, 2.6]); await wait(10);
    assert(f.dims && f.dims.length === 1 && f.dims[0].k === 'len' && UI.isDimEditOpen(), 'length dimension placed, Modify box open: ' + JSON.stringify(f.dims));
    var inp = $('dim-edit').querySelector('input');
    assert(UI.dimEditValue() === '3.6056', 'shown rounded: ' + UI.dimEditValue());
    UI.setStatus('rfE marker');
    r3sKey(inp, 'Enter'); await wait(10);
    var l = f.entities[0];
    assert(!UI.isDimEditOpen() && l.x1 === 0 && l.y1 === 0 && l.x2 === 3 && l.y2 === 2, 'Enter kept the line exactly: ' + JSON.stringify(l));
    assert(!/Dimension set to/.test(statusText()), 'no "Dimension set to": ' + statusText());
    // ✓ and blur with the sketch clean: no undo step either
    UI.App.sketchDirty = false;
    var u0 = UI.App.undo.length;
    assert(UI.openDimEdit(0), 'reopened');
    $('dim-edit').querySelector('.dm-ok').click(); await wait(10);
    assert(UI.openDimEdit(0), 'reopened again');
    inp.blur(); await wait(10);
    l = f.entities[0];
    assert(l.x1 === 0 && l.y1 === 0 && l.x2 === 3 && l.y2 === 2, 'still the √13 line after ✓ and blur: ' + JSON.stringify(l));
    near(K.dimValue(l, f.dims[0]), R13, 1e-15, '√13');
    assert(UI.App.undo.length === u0 && !UI.App.sketchDirty, 'no undo step: ' + UI.App.undo.length + ' vs ' + u0);
    // a typed value is a change: one undo step
    var r = UI.editDim(0, '4');
    assert(r.ok, 'typed 4: ' + JSON.stringify(r));
    near(K.dimValue(f.entities[0], f.dims[0]), 4, 1e-9, 'driven to 4');
    assert(UI.App.undo.length === u0 + 1 && /Dimension set to/.test(statusText()), 'one undo step and the status: ' + statusText());
    if (UI.hasPM()) await UI.pmOK();
    selKey('Escape'); selKey('Escape');
    return 'kept ' + K.dimValue({ t: 'line', x1: 0, y1: 0, x2: 3, y2: 2 }, { k: 'len' });
  });
  step('rfE: Line ▸ Tangent start is off by default (a line started on a circle starts where clicked, Coincident only); T with the Line tool turns it on (status note) and the start slides to the tangent point; T again turns it off', async function () {
    var f = await rfENew([{ t: 'circle', cx: 0, cy: 0, r: 1 }]);
    assert(UI.lineTangentStart && UI.lineTangentStart() === false, 'off by default');
    UI.setTool('line');
    var a = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
    rskClick(a);
    var p0 = UI.App.toolState.pts[0];
    assert(Math.abs(Math.hypot(p0[0], p0[1]) - 1) < 1e-9, 'start on the circle: ' + JSON.stringify(p0));
    selEv('mousemove', rskScr([2.5, -1.5]));
    var t0 = UI.App.tempEntities[0];
    assert(t0 && Math.abs(t0.x1 - p0[0]) < 1e-12 && Math.abs(t0.y1 - p0[1]) < 1e-12, 'the preview starts at the clicked point: ' + JSON.stringify(t0));
    rskClick([2.5, -1.5]); selKey('Escape');
    var l = f.entities[1], rl = sfRels();
    assert(l && l.t === 'line' && Math.abs(l.x1 - p0[0]) < 1e-12 && Math.abs(l.y1 - p0[1]) < 1e-12, 'the line starts where clicked: ' + JSON.stringify(l));
    assert(rl.indexOf('coincident:1.p1,0') >= 0 && !rl.some(function (x) { return /^tangent/.test(x); }), 'Coincident only: ' + rl.join(' '));
    selKey('Escape');
    // T turns it on (also before the start is clicked) and says so
    UI.setTool('line');
    selKey('t');
    assert(UI.lineTangentStart() === true && /Tangent start on/.test(statusText()), 'T: on, status ' + statusText());
    var a2 = [Math.cos(200 * Math.PI / 180), Math.sin(200 * Math.PI / 180)];
    rskClick(a2);
    assert(UI.App.toolState.tanFrom && !UI.App.toolState.tanFrom.off, 'the start slides');
    selEv('mousemove', rskScr([-3, -2]));
    var t1 = UI.App.tempEntities[0], T = [t1.x1, t1.y1], Q = [-3, -2];
    assert(Math.abs(Math.hypot(T[0], T[1]) - 1) < 1e-9 && Math.abs(T[0] * (Q[0] - T[0]) + T[1] * (Q[1] - T[1])) < 1e-6, 'start at the tangent point: ' + JSON.stringify(T));
    selKey('t');
    assert(UI.lineTangentStart() === false && UI.App.toolState.tanFrom.off && /Tangent start off/.test(statusText()), 'T again: off ' + statusText());
    selKey('Escape'); selKey('Escape');
    UI.setLineTangentStart(false);
    return rl.join(' ');
  });
  step('rfE: Smart Dimension with a preselection — a circle clicked with the Select tool, then the ribbon\'s Smart Dimension: the Ø is on the cursor and the next click places it; two parallel lines selected give their distance', async function () {
    var f = await rfENew([{ t: 'circle', cx: 0, cy: 0, r: 1 }, { t: 'line', x1: 2, y1: 0, x2: 4, y2: 0 }, { t: 'line', x1: 2, y1: 1, x2: 4, y2: 1 }]);
    rskClick([1, 0]); await wait(10);
    assert(UI.selection().some(function (s) { return s.kind === 'entity' && s.index === 0; }), 'circle selected: ' + JSON.stringify(UI.selection()));
    ribbonButton('Smart Dimension').click(); await wait(10);
    var st = UI.App.toolState;
    assert(UI.App.tool === 'dimension' && st.dim && st.dim.e === 0 && st.dim.k === 'dia' && UI.App.tempDim, 'Ø on the cursor: ' + JSON.stringify({ tool: UI.App.tool, dim: st.dim }));
    assert(!UI.selection().length, 'the selection is used up');
    selEv('mousemove', rskScr([1.5, 1.5])); rskClick([1.5, 1.5]); await wait(10);
    assert(f.dims && f.dims.length === 1 && f.dims[0].e === 0 && f.dims[0].k === 'dia', 'Ø placed by the next click: ' + JSON.stringify(f.dims));
    if (UI.isDimEditOpen()) UI.cancelDimEdit();
    if (UI.hasPM()) await UI.pmOK();
    UI.setTool('select');
    UI.setSelection([{ kind: 'entity', index: 1 }, { kind: 'entity', index: 2 }]);
    UI.setTool('dimension');
    st = UI.App.toolState;
    assert(st.relDim && st.relDim.type === 'distance' && UI.App.tempRelDim, 'the distance between the lines on the cursor: ' + JSON.stringify(st.relDim));
    var n0 = (f.rels || []).length;
    selEv('mousemove', rskScr([4.5, 0.5])); rskClick([4.5, 0.5]); await wait(10);
    var rel = (f.rels || [])[n0];
    assert(rel && rel.type === 'distance' && Math.abs(rel.v - 1) < 1e-9, 'distance 1 placed: ' + JSON.stringify(rel));
    if (UI.isDimEditOpen()) UI.cancelDimEdit();
    if (UI.hasPM()) await UI.pmOK();
    selKey('Escape'); selKey('Escape');
    return 'Ø and distance ' + rel.v;
  });
  step('rfE: right-click while drawing a Line chain opens End Chain / Select / Smart Dimension / Exit Sketch (the chain goes on until a row is picked); End Chain keeps the Line tool, Smart Dimension switches to it', async function () {
    var f = await rfENew([]);
    UI.setTool('line');
    rskClick([0, 0]); rskClick([2, 0]);
    rfERclick([2.5, 1]);
    var rows = rfEMenu().map(function (r) { return r.textContent; });
    assert(D.querySelector('body > .menu') && rfEMenuRow(/End Chain/) && rfEMenuRow(/^.?Select$/) && rfEMenuRow(/Smart Dimension/) && rfEMenuRow(/Exit Sketch/), 'the chain menu: ' + rows.join(' | '));
    assert(UI.App.tool === 'line' && UI.App.toolState.pts.length === 1 && f.entities.length === 1, 'the chain is still going');
    rfEMenuRow(/End Chain/).click();
    assert(!D.querySelector('body > .menu') && UI.App.tool === 'line' && !UI.App.toolState.pts.length, 'End Chain: chain ended, Line tool kept');
    rskClick([0, 1]); rskClick([2, 1]);
    rfERclick([2.5, 2]);
    rfEMenuRow(/Smart Dimension/).click();
    assert(UI.App.tool === 'dimension' && f.entities.length === 2, 'Smart Dimension: ' + UI.App.tool);
    // with nothing in progress a right-click still puts the tool down (no menu)
    UI.setTool('line');
    rfERclick([3, 3]);
    assert(!D.querySelector('body > .menu') && UI.App.tool === 'select', 'nothing drawn: tool put down, no menu');
    UI.closeMenus();
    return rows.join(' | ');
  });
  step('rfE: the Dimension PM\'s Primary Value shows the document precision and follows a Modify-box edit; a value typed in the PM keeps its full precision', async function () {
    var f = await rfENew([{ t: 'line', x1: 0, y1: 0, x2: 3, y2: 2 }]);
    UI.setTool('dimension');
    rskClick([1.5, 1]); rskClick([-0.6, 2.6]); await wait(10);
    assert(UI.dimensionPMOpen() && UI.isDimEditOpen(), 'Dimension PM beside the Modify box');
    var inch = UI.unitLabel() === 'in', val = pmField('Value');
    assert(val, 'Value field');
    assert(+val.value === (inch ? 3.606 : 3.61), 'Value at the document precision: ' + val.value);
    var inp = $('dim-edit').querySelector('input');
    r3sType(inp, '4'); r3sKey(inp, 'Enter'); await wait(10);
    near(K.dimValue(f.entities[0], f.dims[0]), 4, 1e-9, 'driven to 4');
    val = pmField('Value');
    assert(UI.dimensionPMOpen() && +val.value === 4, 'the PM follows the Modify box: ' + (val && val.value));
    setInput(val, '3.60555127546'); await wait(10);
    near(K.dimValue(f.entities[0], f.dims[0]), 3.60555127546, 1e-9, 'typed in the PM at full precision');
    f.dims[0].prec = 1;
    UI.refreshDimensionPM();
    assert(+pmField('Value').value === 3.6, 'the dimension\'s own precision (1 place): ' + pmField('Value').value);
    await UI.pmOK();
    selKey('Escape'); selKey('Escape');
    return 'value ' + (inch ? '3.606' : '3.61') + ' → 4';
  });
  step('rfE: the status bar and the hint follow the active command — a tool after another command\'s prompt shows its own prompt; Extend Entities puts its message in the hint line (not the Select tool\'s)', async function () {
    var f = await rfENew([{ t: 'line', x1: 0, y1: 0, x2: 2, y2: 0 }]);
    UI.setStatus('Select two lines: a stale prompt');
    UI.setTool('rect');
    var h = $('sketch-hint').textContent.replace(/\s+/g, ' ').trim();
    assert(!/stale prompt/.test(statusText()) && statusText() === h && h.length > 5, 'status = the Corner Rectangle hint: "' + statusText() + '" / "' + h + '"');
    UI.setStatus('Select two lines: a stale prompt');
    UI.setTool('dimension');
    assert(/^Click a line/.test(statusText()), 'Smart Dimension prompt: ' + statusText());
    selKey('Escape');
    assert(UI.App.tool === 'select', 'Select tool');
    UI.cmdExtendEntities(); await wait(10);
    assert(/lengthen/i.test($('sketch-hint').textContent) && !/Click an entity to select it/.test($('sketch-hint').textContent), 'Extend hint: ' + $('sketch-hint').textContent);
    UI.pmCancel(); await wait(10);
    assert(/Click an entity to select it/.test($('sketch-hint').textContent), 'back to the Select hint: ' + $('sketch-hint').textContent);
    return statusText();
  });
  // --- end rfE ---
