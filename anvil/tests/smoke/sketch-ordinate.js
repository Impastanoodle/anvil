  // --- sketch-ordinate: Smart Dimension flyout (Horizontal / Vertical Dimension, Horizontal / Vertical Ordinate),
  // ordinate sets in a sketch, Fully Define Sketch ▸ Ordinate, sketch dimension properties and arc slots on drawings ---
  // a 100 × 50 plate on Front centred on the origin (left edge x = -50: rectangle edge e3, right edge e1) held by a Fix
  // relation on its lower left corner (its width stays free: the right edge's ordinate drives it), with three Ø6 holes
  // 20, 50 and 80 from the left edge (entities 1–3)
  async function ordNew() {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'rect', x: -50, y: -25, w: 100, h: 50 }, { t: 'circle', cx: -30, cy: 0, r: 3 }, { t: 'circle', cx: 0, cy: -10, r: 3 }, { t: 'circle', cx: 30, cy: 10, r: 3 });
    W.SketchSolver.addRelation(f, 'fix', ['0.v0']);
    UI.updateSketches(); UI.setTool('select'); UI.setSelection([]);
    return f;
  }
  function ordSets(f) { return W.SketchSolver.ordinateSets(f); }
  function ordValues(f, set) { return set.members.map(function (i) { return Math.round(f.rels[i].v * 1e6) / 1e6; }); }
  function ordTexts() { return Array.prototype.map.call(D.querySelectorAll('#dim-layer .dim text'), function (t) { return t; }); }
  function ordBox(t) { var b = t.getBoundingClientRect(); return { x0: b.left, x1: b.right, y0: b.top, y1: b.bottom, s: t.textContent }; }
  function ordMeet(a, b) { return a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5; }
  step('sketch-ordinate: the Sketch tab\'s Smart Dimension is a flyout — Smart Dimension, Horizontal / Vertical Dimension, Horizontal / Vertical Ordinate Dimension, each with its icon', async function () {
    await ordNew();
    var fly = UI.RIBBON.Sketch.filter(function (it) { return it.fly === 'dim'; })[0];
    assert(fly, 'no Smart Dimension flyout');
    var labels = fly.items.map(function (it) { return it.label.replace(/\n/g, ' '); });
    assert(labels.join('|') === 'Smart Dimension|Horizontal Dimension|Vertical Dimension|Ordinate Dimension|Horizontal Ordinate Dimension|Vertical Ordinate Dimension|Chamfer Dimension|Angular Running Dimension|Path Length Dimension|Autodimension', 'items ' + labels.join('|'));   // rfAQ: Ordinate, Chamfer, Angular Running, Path Length, Autodimension
    assert(fly.items.every(function (it) { return W.Icons.has(it.id); }), 'icons ' + fly.items.map(function (it) { return it.id; }).join(','));
    assert(ribbonButton('Smart Dimension') && ribbonButton('Smart Dimension options'), 'the face still reads Smart Dimension, with its ▾');
    ribbonButton('Smart Dimension').click();
    assert(UI.App.tool === 'dimension', 'the face runs Smart Dimension: ' + UI.App.tool);
    UI.setTool('select');
    return labels.length + ' items';
  });
  step('sketch-ordinate: Horizontal Ordinate — the left edge as zero, the text line below, the three hole centres and the right edge: 4 dimensions in one set (20, 50, 80, 100) drawn with a 0 and every value on one line, none overlapping', async function () {
    need(UI, 'cmdOrdinateDim');
    var f = await ordNew(), n0 = (f.rels || []).length;
    UI.cmdOrdinateDim('x');
    assert(UI.pmTitle() === 'Horizontal Ordinate Dimension', 'PM ' + UI.pmTitle());
    rskClick([-50, 8]);                       // the zero: the left edge
    rskClick([-20, -36]);                     // the values stand below the plate
    rskClick([-30, 0]); rskClick([0, -10]); rskClick([30, 10]);   // the hole centres
    rskClick([50, 6]);                        // the right edge
    var sets = ordSets(f), ids = Object.keys(sets), set = sets[ids[0]];
    assert(ids.length === 1 && set.members.length === 4 && f.rels.length === n0 + 4, 'one set of 4: ' + JSON.stringify(sets));
    assert(set.zero === '0.e3' && set.axis === 'x' && Math.abs(set.at + 36) < 0.5, 'zero, axis, text line ' + JSON.stringify(set));
    assert(JSON.stringify(ordValues(f, set)) === '[20,50,80,100]', 'values ' + ordValues(f, set));
    assert(set.members.every(function (i) { return !f.rels[i].driven; }), 'driving');
    UI.pmOK();
    UI.App.dimsStale = false; UI.drawDims();
    var zero = D.querySelector('#ord-layer text.ord-zero');
    assert(zero && zero.textContent === '0', 'the 0 at the zero');
    var vals = ordTexts().filter(function (t) { return /^(20|50|80|100)$/.test(t.textContent); });
    assert(vals.length === 4, 'values drawn: ' + ordTexts().map(function (t) { return t.textContent; }).join(' '));
    var boxes = vals.map(ordBox).concat([ordBox(zero)]);
    var ys = boxes.map(function (b) { return Math.round((b.y0 + b.y1) / 2); });
    assert(Math.max.apply(null, ys) - Math.min.apply(null, ys) <= 1, 'one text line: ' + ys.join(','));
    for (var i = 0; i < boxes.length; i++) for (var j = i + 1; j < boxes.length; j++) assert(!ordMeet(boxes[i], boxes[j]), boxes[i].s + ' overlaps ' + boxes[j].s);
    // below the plate: the text line is under the bottom edge on screen
    var bottom = rskScr([0, -25])[1], vr = $('viewport').getBoundingClientRect();
    assert(boxes.every(function (b) { return b.y0 - vr.top > bottom; }), 'below the plate');
    return 'set ' + ids[0] + ': 0, ' + ordValues(f, set).join(', ');
  });
  step('sketch-ordinate: crowded values jog — a fourth hole 3 mm from the first: the two values stand apart on the text line, their leaders jogged; the Modify box on a value drives its hole (one value, one hole)', async function () {
    var f = await ordNew();
    f.entities.push({ t: 'circle', cx: -27, cy: 15, r: 2 });
    UI.updateSketches();
    var S = W.SketchSolver, o = S.addOrdinate(f, { zero: '0.e3', target: '1.c', axis: 'x', at: -36 });
    ['2.c', '3.c', '4.c', '0.e1'].forEach(function (t) { var q = S.addOrdinate(f, { zero: '0.e3', target: t, axis: 'x', ord: o.ord }); assert(q.ok, q.error); });
    UI.App.dimsStale = false; UI.drawDims();
    var t20 = ordTexts().filter(function (t) { return t.textContent === '20'; })[0], t23 = ordTexts().filter(function (t) { return t.textContent === '23'; })[0];
    assert(t20 && t23 && !ordMeet(ordBox(t20), ordBox(t23)), '20 and 23 apart');
    // the leader of a jogged value has three pieces: its dimension path holds more than one segment
    var g = t23.parentNode, path = g.querySelector('path.dl');
    assert(path && (path.getAttribute('d').match(/M/g) || []).length >= 2, 'jogged leader ' + (path && path.getAttribute('d')));
    var set = ordSets(f)[o.ord], i50 = set.members[1];
    var r = UI.editRelDim(i50, '45');
    assert(r.ok, r.error);
    near(f.entities[2].cx, -5, 1e-6, 'hole 2 at 45 from the left edge'); near(f.entities[1].cx, -30, 1e-6, 'hole 1 stays'); near(f.entities[3].cx, 30, 1e-6, 'hole 3 stays');
    near(f.entities[0].x, -50, 1e-9, 'plate stays');
    return 'jogged; 50 -> 45';
  });
  step('sketch-ordinate: a click on the 0 selects the set\'s zero; Delete deletes the whole set (4 dimensions); a value alone deletes only itself', async function () {
    var f = await ordNew(), S = W.SketchSolver, o = S.addOrdinate(f, { zero: '0.e3', target: '1', axis: 'x', at: -36 });
    ['2', '3', '0.e1'].forEach(function (t) { S.addOrdinate(f, { zero: '0.e3', target: t, axis: 'x', ord: o.ord }); });
    UI.App.dimsStale = false; UI.drawDims();
    var n = f.rels.length, set = ordSets(f)[o.ord];
    // a value: Delete removes that one
    UI.App.sel = { kind: 'rel', index: set.members[3] };
    UI.deleteSelection();
    assert(f.rels.length === n - 1 && ordSets(f)[o.ord].members.length === 3, 'one value deleted');
    UI.App.dimsStale = false; UI.drawDims();
    var zero = D.querySelector('#ord-layer text.ord-zero');
    assert(zero, 'the 0');
    zero.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    assert(UI.App.sel && UI.App.sel.ordZero === o.ord, 'zero selected ' + JSON.stringify(UI.App.sel));
    UI.App.dimsStale = false; UI.drawDims();
    assert(D.querySelector('#ord-layer text.ord-zero.sel'), 'drawn selected');
    UI.deleteSelection();
    assert(!Object.keys(ordSets(f)).length && f.rels.length === n - 4, 'set deleted: ' + JSON.stringify(f.rels));
    UI.App.dimsStale = false; UI.drawDims();
    assert(!D.querySelector('#ord-layer text.ord-zero'), 'no 0 left');
    return 'ok';
  });
  step('sketch-ordinate: Fully Define Sketch ▸ Ordinate scheme (both directions) fully defines the holes: two ordinate sets from the origin, Fully Defined', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'rect', x: 0, y: 0, w: 100, h: 50 }, { t: 'circle', cx: 20, cy: 25, r: 3 }, { t: 'circle', cx: 50, cy: 15, r: 3 }, { t: 'circle', cx: 80, cy: 35, r: 3 });
    UI.updateSketches();
    UI.cmdFullyDefineSketch();
    var sel = Array.prototype.filter.call(D.querySelectorAll('#pm select'), function (s) { return Array.prototype.some.call(s.options, function (o) { return o.value === 'ordinate'; }); });
    assert(sel.length === 2, 'two scheme boxes with Ordinate: ' + sel.length);
    sel.forEach(function (s) { setInput(s, 'ordinate'); });
    var calc = Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (b) { return b.textContent === 'Calculate'; })[0];
    assert(calc, 'Calculate');
    calc.click();
    var sets = ordSets(f), ids = Object.keys(sets);
    assert(UI.sketchStatus().status === 'full', 'Fully Defined: ' + JSON.stringify(UI.sketchStatus()));
    assert(ids.length === 2 && ids.every(function (k) { return sets[k].zero === 'O'; }), 'two sets from the origin ' + JSON.stringify(sets));
    // (hole 1 is level with the origin: a Horizontal relation holds its height, so it is only in the X set)
    function inSet(k, h) { return sets[k].members.some(function (i) { return f.rels[i].refs[1].split('.')[0] === String(h); }); }
    [1, 2, 3].forEach(function (h) { assert(ids.some(function (k) { return sets[k].axis === 'x' && inSet(k, h); }), 'hole ' + h + ' in the X set'); });
    [2, 3].forEach(function (h) { assert(ids.some(function (k) { return sets[k].axis === 'y' && inSet(k, h); }), 'hole ' + h + ' in the Y set'); });
    UI.pmOK();
    UI.App.dimsStale = false; UI.drawDims();
    assert(D.querySelectorAll('#ord-layer text.ord-zero').length === 2, 'two zeros drawn');
    return ids.map(function (k) { return sets[k].axis + ': ' + ordValues(f, sets[k]).join(', '); }).join(' / ');
  });
  step('sketch-ordinate: Horizontal Dimension — two hole centres then a click beside them still gives the horizontal distance (dir h, 30); Vertical Dimension the vertical one (10)', async function () {
    need(UI, 'cmdHorizontalDim');
    var f = await ordNew(), n0 = (f.rels || []).length;
    UI.cmdHorizontalDim();
    assert(UI.pmTitle() === 'Horizontal Dimension', UI.pmTitle());
    rskClick([-30, 0]); rskClick([0, -10]); rskClick([-15, -5]);
    dmDone(); dmDriven();
    var d = f.rels[n0];
    assert(d && d.type === 'distance' && d.dir === 'h' && Math.abs(d.v - 30) < 1e-9, 'horizontal ' + JSON.stringify(d));
    UI.pmOK();
    UI.cmdVerticalDim();
    rskClick([-30, 0]); rskClick([0, -10]); rskClick([-15, 20]);
    dmDone(); dmDriven();
    d = f.rels[n0 + 1];
    assert(d && d.dir === 'v' && Math.abs(d.v - 10) < 1e-9, 'vertical ' + JSON.stringify(d));
    UI.pmOK();
    return 'h 30, v 10';
  });
  // drawings: what the sketch's Dimension PM set comes onto the sheet with the model item
  var DTL_PART = 'p.units("in");\np.sketch("Front").rect(0, 0, 4, 2).circle(1, 1, 0.133).circle(3, 1, 0.133).dim(1, "dia")' +
    '.dimProps([[0, { tol: { type: "symmetric", plus: 0.005, minus: 0.005 }, prec: 3, prefix: "2X" }]])' +
    '.rel("distance", ["0.e3", "1"], { value: 1, dir: "h" }).rel("distance", ["0.e3", "2"], { value: 3, dir: "h" }).rel("distance", ["0.e3", "0.e1"], { value: 4, dir: "h" })' +
    '.ordinate([[0, { ord: "o1", ordAxis: "x", ordAt: -0.5 }], [1, { ord: "o1", ordAxis: "x", ordAt: -0.5 }], [2, { ord: "o1", ordAxis: "x", ordAt: -0.5 }]]).extrude(0.25);\n' +
    'p.sketch("Front", 0.25).arcSlot(2, 1, 0.6, 210, 330, 0.25).cut("through", { reverse: true });';
  step('sketch-ordinate (dtl): Make Drawing — the hole\'s model item reads 2X Ø.266 ±.005 as the sketch set it (sheet, SVG, DXF); the sketch ordinate set is an ordinate dimension 0, 1.000, 3.000, 4.000 on the Front view; the arc slot reads R.600 ARC SLOT .250 WIDE 120°', async function () {
    await anvil.run(DTL_PART); await idle();
    anvil.drawing.make({ fresh: true });
    var s = anvil.drawing.summary();
    assert(s.dims.indexOf('2X Ø.266 ±.005') >= 0, 'hole ' + s.dims.join(' | '));
    assert(s.dims.indexOf('0, 1.000, 3.000, 4.000') >= 0, 'ordinate ' + s.dims.join(' | '));
    assert(s.dims.indexOf('R.600 ARC SLOT .250 WIDE 120°') >= 0, 'arc slot ' + s.dims.join(' | '));
    var od = s.dimDetails.filter(function (d) { return d.kind === 'ordinate'; })[0], front = dwView('Front');
    assert(od && od.auto && od.view === front.id, 'on Front ' + JSON.stringify(od));
    var svg = anvil.drawing.svg(), dxf = anvil.drawing.dxf();
    assert(svg.indexOf('2X Ø.266 ±.005') >= 0 && svg.indexOf('R.600 ARC SLOT .250 WIDE 120°') >= 0, 'SVG');
    assert(/2X (Ø|%%[cC])\.266 (±|%%[pP])\.005/.test(dxf) && /R\.600 ARC SLOT \.250 WIDE 120(°|%%[dD])/.test(dxf), 'DXF');
    anvil.drawing.close();
    return s.dims.join(' | ');
  });
  step('sketch-ordinate: no uncaught errors or console.error calls in any step', async function () {
    await idle();
    assert(errors.length === 0, errors.join('\n'));
  });
  // --- end sketch-ordinate ---
