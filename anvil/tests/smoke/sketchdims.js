  // --- sketchdims: Smart Dimension through SolidWorks' pick combinations, the Dimension PropertyManager, Add Relations
  // with every relation, Display/Delete Relations' filters and Suppressed, status colours, Fully Define Sketch ---
  // a sketch on Front with lines, circles, an arc and a point spread round the origin (0.25 mm per pixel)
  async function dmNew() {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 5, y1: 0, x2: 45, y2: 0 }, { t: 'line', x1: 5, y1: 10, x2: 45, y2: 10 }, { t: 'line', x1: -40, y1: 0, x2: -20, y2: 15 },
      { t: 'circle', cx: -30, cy: -20, r: 5 }, { t: 'circle', cx: -5, cy: -20, r: 4 }, { t: 'arc', cx: 30, cy: -20, r: 8, a0: 0, a1: 90 }, { t: 'point', x: 20, y: 25 });
    UI.updateSketches(); UI.setTool('select'); UI.setSelection([]);
    return f;
  }
  function dmDriven() { if (modalOpen() && $('drv-driven')) $('drv-driven').click(); }
  function dmLast(f) { return f.rels[f.rels.length - 1]; }
  function dmDone() { if (UI.isDimEditOpen()) UI.cancelDimEdit(); }
  step('sketchdims: Smart Dimension pick combinations — line length, two parallel lines, an angle (and its supplement by placement), point to point (horizontal / vertical / aligned by placement), point to line, a circle\'s diameter, an arc\'s radius, arc length (arc then both ends), two circles, the origin', async function () {
    need(UI, 'openDimensionPM'); need(UI, 'sketchRelationGroups'); need(UI, 'cmdFullyDefineSketch');
    var f = await dmNew(), S = W.SketchSolver;
    UI.setTool('dimension');
    rskClick([25, 0]); rskClick([25, -6]);
    assert(f.dims && f.dims.length === 1 && /^(len|dx)$/.test(f.dims[0].k) && f.dims[0].e === 0, 'line length ' + JSON.stringify(f.dims));
    assert(UI.isDimEditOpen() && UI.pmTitle() === 'Dimension' && UI.App.tool === 'dimension', 'Modify box and Dimension PM open, the tool stays: ' + UI.pmTitle() + ' ' + UI.App.tool);
    dmDone();
    rskClick([15, 0]); rskClick([15, 10]); rskClick([52, 5]);
    var d = dmLast(f);
    assert(d.type === 'distance' && d.refs.join() === '0,1' && Math.abs(d.v - 10) < 1e-9, 'parallel lines ' + JSON.stringify(d));
    dmDone();
    rskClick([-30, 7.5]); rskClick([38, 0]); rskClick([0, 8]);
    d = dmLast(f);
    assert(d.type === 'angle' && Math.abs(d.v - 36.8699) < 1e-3 && !d.sup, 'acute angle ' + JSON.stringify(d));
    dmDone(); dmDriven();
    rskClick([-30, 7.5]); rskClick([38, 0]); rskClick([-52, 6]);
    dmDriven(); dmDone();
    d = dmLast(f);
    assert(d.type === 'angle' && Math.abs(d.v - 143.1301) < 1e-3 && d.sup, 'supplement by placement ' + JSON.stringify(d));
    var n0 = f.rels.length;
    rskClick([20, 25]); rskClick([45, 10]); rskClick([32, 34]);
    d = dmLast(f);
    assert(f.rels.length === n0 + 1 && d.dir === 'h' && Math.abs(d.v - 25) < 1e-9, 'horizontal between two points ' + JSON.stringify(d));
    dmDone(); dmDriven();
    rskClick([20, 25]); rskClick([45, 10]); rskClick([55, 18]);
    d = dmLast(f);
    assert(d.dir === 'v' && Math.abs(d.v - 15) < 1e-9, 'vertical between two points ' + JSON.stringify(d));
    dmDone(); dmDriven();
    rskClick([20, 25]); rskClick([45, 10]); rskClick([45, 30]);
    var asked = modalOpen();
    dmDriven(); dmDone();
    d = dmLast(f);
    assert(asked && d.dir == null && Math.abs(d.v - Math.hypot(25, 15)) < 1e-9 && d.driven, 'aligned (over defining: Make Dimension Driven? -> driven) ' + JSON.stringify(d));
    rskClick([20, 25]); rskClick([-36, 3]); rskClick([-50, 25]);
    dmDriven(); dmDone();
    d = dmLast(f);
    assert(d.type === 'distance' && d.refs.join() === '6,2', 'point to line ' + JSON.stringify(d));
    rskClick([-25, -20]); rskClick([-18, -12]);
    var dd = f.dims[f.dims.length - 1];
    assert(dd.e === 3 && dd.k === 'dia', 'circle diameter ' + JSON.stringify(dd));
    dmDone();
    var am = [30 + 8 * Math.SQRT1_2, -20 + 8 * Math.SQRT1_2];
    rskClick(am); rskClick([45, -8]);
    dd = f.dims[f.dims.length - 1];
    assert(dd.e === 5 && dd.k === 'r', 'arc radius ' + JSON.stringify(dd));
    dmDone();
    rskClick(am); rskClick([38, -20]); rskClick([30, -12]); rskClick([44, -2]);
    d = dmLast(f);
    assert(d.type === 'arclength' && d.refs.join() === '5' && Math.abs(d.v - 4 * Math.PI) < 1e-9, 'arc length ' + JSON.stringify(d));
    var ai = f.rels.length - 1;
    UI.drawDims();
    assert(Array.prototype.some.call(D.querySelectorAll('#dim-layer .dim text'), function (t) { return /^⌒12\.57$/.test(t.textContent); }), 'arc length label');
    dmDone();
    var r = UI.editRelDim(ai, '15');
    assert(r.ok && Math.abs(S.measure(f, 'arclength', ['5']) - 15) < 1e-7 && Math.abs(f.entities[5].r - 8) < 1e-9, 'arc length drives ' + JSON.stringify(r));
    rskClick([-30, -15]); rskClick([-5, -16]); rskClick([-17, -36]);
    d = dmLast(f);
    assert(d.type === 'distance' && d.refs.join() === '3,4' && Math.abs(d.v - 25) < 1e-9, 'two circles, centre to centre ' + JSON.stringify(d));
    dmDone();
    rskClick([0, 0]); rskClick([-5, -16]); rskClick([10, 5]);
    d = dmLast(f);
    assert(d.type === 'distance' && d.refs.indexOf('O') >= 0 && d.refs.indexOf('4') >= 0 && Math.abs(d.v - Math.hypot(5, 20)) < 1e-9, 'origin to a circle ' + JSON.stringify(d));
    dmDone(); dmDriven();
    UI.setTool('select');
    return f.dims.length + ' Smart Dimensions, ' + f.rels.filter(function (x) { return S.TYPES[x.type].dim; }).length + ' distance / angle / arc length';
  });
  step('sketchdims: Dimension PropertyManager — a click on a dimension opens it (D1@Sketch name, value, Driven, tolerance, precision, text before / after, radius / diameter, arc conditions); every change is one undo step', async function () {
    var f = await dmNew(), S = W.SketchSolver;
    f.dims = [{ e: 0, k: 'len', off: -5 }, { e: 3, k: 'dia', ang: 45 }];
    S.addRelation(f, 'distance', ['3', '4'], { off: -8 });
    UI.updateSketches(); UI.drawDims();
    function label(re) { return Array.prototype.filter.call(D.querySelectorAll('#dim-layer .dim text'), function (t) { return re.test(t.textContent); })[0]; }
    var t40 = Array.prototype.filter.call(D.querySelectorAll('#dim-layer .dim text'), function (t) { return t._d && !t._d.auto && t._d.index === 0 && t._d.rel == null; })[0];
    assert(t40 && t40.textContent === '40', 'the 40 label: ' + Array.prototype.map.call(D.querySelectorAll('#dim-layer .dim text'), function (t) { return t.textContent; }).join(' | '));
    t40.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 1, clientY: 1 }));
    W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, button: 0 }));
    assert(UI.pmTitle() === 'Dimension' && UI.App.sel && UI.App.sel.kind === 'dim' && UI.App.sel.index === 0, 'click opens the Dimension PM: ' + UI.pmTitle());
    assert(pmField('Name').value === 'D1@' + f.name, 'name ' + pmField('Name').value);
    near(+pmField('Value').value, 40, 1e-9, 'value');
    var undo0 = UI.App.undo.length;
    D.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true }));
    setInput(pmField('Value'), '42');
    near(f.entities[0].x2 - f.entities[0].x1, 42, 1e-9, 'value drives the line');
    D.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true }));
    setInput(D.querySelector('#pm select[data-key="tolType"]'), 'symmetric');
    setInput(pmField('Maximum variation'), '0.1');
    D.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true }));
    setInput(D.querySelector('#pm select[data-key="prec"]'), '2');
    D.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true }));
    setInput(pmField('Text before'), '2X');
    UI.drawDims();
    assert(label(/^2X 42\.00 ±0\.10$/), 'label with text, precision and tolerance: ' + anvil.dimProps('dim', 0).label);
    D.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true }));
    setInput(pmField('Name'), 'Width');
    assert(anvil.dimProps('dim', 0).name === 'Width@' + f.name, 'renamed ' + anvil.dimProps('dim', 0).name);
    assert(UI.App.undo.length === undo0 + 5, 'one undo step per change: ' + (UI.App.undo.length - undo0));
    setInput(D.querySelector('#pm select[data-key="tolType"]'), 'basic');
    UI.drawDims();
    assert(D.querySelector('#dim-layer .dim .dbox'), 'Basic draws a box');
    // driven / driving
    pmField('Driven').click();
    assert(f.dims[0].driven === true && UI.sketchStatus().dims[0] === 'driven', 'Driven');
    pmField('Driven').click();
    assert(!f.dims[0].driven, 'driving again');
    await UI.pmOK();
    // the diameter shown as a radius: the Modify box takes the radius
    UI.openDimensionPM({ kind: 'dim', index: 1 });
    var rad = D.querySelector('#pm input[data-key="show:r"]');
    assert(rad, 'Radius / Diameter display');
    rad.click();
    assert(f.dims[1].show === 'r' && anvil.dimProps('dim', 1).label === 'R5', 'shown as a radius: ' + anvil.dimProps('dim', 1).label);
    var r = UI.editDim(1, '6');
    assert(r.ok && Math.abs(f.entities[3].r - 6) < 1e-9, 'typed 6 is the radius: ' + f.entities[3].r);
    await UI.pmOK();
    // arc conditions of the two-circle distance
    var ri = f.rels.length - 1;
    UI.openDimensionPM({ kind: 'rel', index: ri });
    setInput(pmField('First arc condition'), 'min');
    setInput(pmField('Second arc condition'), 'max');
    var rel = f.rels[ri];
    assert(rel.ac && rel.ac.join() === 'min,max' && Math.abs(rel.v - (25 - 6 + 4)) < 1e-9, 'Min / Max ' + JSON.stringify(rel));
    UI.drawDims();
    assert(label(/^23$/), 'label reads 23');
    r = UI.editRelDim(ri, '30');
    var c3 = f.entities[3], c4 = f.entities[4];
    near(Math.hypot(c4.cx - c3.cx, c4.cy - c3.cy) - c3.r + c4.r, 30, 1e-6, 'drives the gap');
    await UI.pmOK();
    return anvil.dimProps('dim', 0).label;
  });
  step('sketchdims: the Modify box — Enter accepts, Esc restores, spin arrows, 25mm in an inch part, an equation, and Reverse the sense of the dimension', async function () {
    var f = await dmNew(), S = W.SketchSolver;
    f.entities.splice(2);
    S.addRelation(f, 'fix', ['0']);
    S.addRelation(f, 'horizontal', ['1']);
    S.addRelation(f, 'distance', ['1', '0'], { off: 5 });
    f.dims = [{ e: 1, k: 'len' }];
    UI.updateSketches();
    var ri = f.rels.length - 1;
    assert(UI.openRelDimEdit(ri), 'opened');
    var inp = $('dim-edit').querySelector('input');
    inp.value = '12';
    inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    assert(!UI.isDimEditOpen() && Math.abs(f.entities[1].y1 - 12) < 1e-9, 'Enter accepts: ' + f.entities[1].y1);
    UI.openRelDimEdit(ri);
    UI.spinDimEdit(1, {});
    near(+UI.dimEditValue(), 13, 1e-9, 'spin up');
    inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert(!UI.isDimEditOpen() && Math.abs(f.entities[1].y1 - 12) < 1e-9, 'Esc restores: ' + f.entities[1].y1);
    UI.openRelDimEdit(ri);
    $('dim-edit').querySelector('.dm-reverse').click();
    assert(Math.abs(f.entities[1].y1 + 12) < 1e-9 && Math.abs(f.entities[1].y2 + 12) < 1e-9, 'reversed below the fixed line: ' + JSON.stringify(f.entities[1]));
    UI.cancelDimEdit();
    assert(Math.abs(f.rels[ri].v - 12) < 1e-9 && !f.rels[ri].flip, 'still 12, no flip kept');
    var e1 = UI.editRelDim(ri, '=2*7');
    assert(e1.ok && Math.abs(f.entities[1].y1 + 14) < 1e-9, 'equation ' + JSON.stringify(e1));
    UI.App.model.units = 'in';
    var e2 = UI.editDim(0, '25.4mm');
    UI.App.model.units = 'mm';
    assert(e2.ok && Math.abs(e2.value - 1) < 1e-9, '25.4mm in an inch part is 1: ' + JSON.stringify(e2));
    var line = f.entities[1], sx = line.x2 - line.x1;
    var rv = UI.reverseDimSense({ kind: 'dim', index: 0 });
    assert(rv.ok && Math.abs((line.x2 - line.x1) + sx) < 1e-9, 'line length reversed: ' + JSON.stringify(rv) + ' ' + JSON.stringify(line));
    return 'ok';
  });
  step('sketchdims: Add Relations offers only what applies and adds each SolidWorks relation (Horizontal, Vertical, Merge, Coincident, Midpoint, Intersection, Collinear, Parallel, Perpendicular, Tangent, Concentric, Coradial, Equal, Symmetric, Fix); Existing Relations lists them with their state; × deletes', async function () {
    await rskNew();
    var f = UI.activeSketchFeature(), S = W.SketchSolver;
    var cases = [
      ['Horizontal', 'horizontal', [{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 1 }], [0]],
      ['Vertical', 'vertical', [{ t: 'line', x1: 0, y1: 0, x2: 1, y2: 20 }], [0]],
      ['Merge', 'coincident', [{ t: 'point', x: 0, y: 0 }, { t: 'point', x: 1, y: 1 }], ['0', '1']],
      ['Coincident', 'coincident', [{ t: 'point', x: 0, y: 1 }, { t: 'line', x1: -5, y1: 0, x2: 5, y2: 0 }], ['0', '1']],
      ['Midpoint', 'midpoint', [{ t: 'point', x: 1, y: 1 }, { t: 'line', x1: -5, y1: 0, x2: 5, y2: 0 }], ['0', '1']],
      ['Intersection', 'intersection', [{ t: 'point', x: 1, y: 1 }, { t: 'line', x1: -5, y1: 0, x2: 5, y2: 0 }, { t: 'line', x1: 0, y1: -5, x2: 0.5, y2: 5 }], ['0', '1', '2']],
      ['Collinear', 'collinear', [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 12, y1: 1, x2: 20, y2: 1.5 }], ['0', '1']],
      ['Parallel', 'parallel', [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 0, y1: 5, x2: 10, y2: 6 }], ['0', '1']],
      ['Perpendicular', 'perpendicular', [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 1, y2: 10 }], ['0', '1']],
      ['Tangent', 'tangent', [{ t: 'line', x1: -10, y1: 6, x2: 10, y2: 6 }, { t: 'circle', cx: 0, cy: 0, r: 5 }], ['0', '1']],
      ['Concentric', 'concentric', [{ t: 'circle', cx: 0, cy: 0, r: 5 }, { t: 'circle', cx: 1, cy: 1, r: 3 }], ['0', '1']],
      ['Coradial', 'coradial', [{ t: 'circle', cx: 0, cy: 0, r: 5 }, { t: 'arc', cx: 1, cy: 1, r: 4, a0: 0, a1: 90 }], ['0', '1']],
      ['Equal', 'equal', [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 0, y1: 5, x2: 7, y2: 5 }], ['0', '1']],
      ['Symmetric', 'symmetric', [{ t: 'point', x: -5, y: 1 }, { t: 'point', x: 4, y: 0 }, { t: 'line', x1: 0, y1: -5, x2: 0, y2: 5, construction: true }], ['0', '1', '2']],
      ['Fix', 'fix', [{ t: 'point', x: 3, y: 3 }], ['0']]
    ];
    var done = [];
    cases.forEach(function (c, k) {
      var n0 = f.entities.length, dx = 40 * (k % 5), dy = 40 * Math.floor(k / 5);
      c[2].forEach(function (e) { var o = JSON.parse(JSON.stringify(e)); ['x', 'x1', 'x2', 'cx'].forEach(function (q) { if (o[q] != null) o[q] += dx; }); ['y', 'y1', 'y2', 'cy'].forEach(function (q) { if (o[q] != null) o[q] += dy; }); f.entities.push(o); });
      UI.updateSketches();
      UI.setSelection(c[3].map(function (r) { return { kind: 'entity', index: +r + n0 }; }), { quiet: true });
      UI.cmdAddRelations();
      assert(UI.App.relPick.length === c[3].length, c[0] + ': selection listed ' + UI.App.relPick.join());
      var labels = Array.prototype.map.call(D.querySelectorAll('#pm .pm-btns button'), function (x) { return x.textContent; });
      assert(labels.indexOf(c[0]) >= 0, c[0] + ' offered for its picks: ' + labels.join(','));
      if (c[0] === 'Merge') assert(labels.indexOf('Coincident') < 0, 'two points: Merge, not Coincident');
      var nr = (f.rels || []).length;
      clickPmButton(c[0]);
      var rel = f.rels[f.rels.length - 1], st = UI.sketchStatus().rels[f.rels.length - 1];
      assert(f.rels.length > nr && rel.type === c[1] && st === 'ok', c[0] + ' added: ' + JSON.stringify(rel) + ' ' + st);
      done.push(c[0]);
      UI.pmCancel();
    });
    // the shared groups: a line's PM gets Existing Relations (with the Horizontal it has) and Add Relations
    var groups = UI.sketchRelationGroups(f, [0]);
    assert(groups.length === 2 && groups[0].title === 'Existing Relations' && groups[1].title === 'Add Relations', 'groups ' + groups.map(function (g) { return g.title; }));
    UI.openPM({ title: 'Line Properties', groups: groups });
    var rows = D.querySelectorAll('#pm .rel-existing .rel-row');
    assert(rows.length === 1 && /Horizontal/.test(rows[0].textContent) && rows[0].querySelector('.rel-state svg'), 'Existing Relations row with its state icon');
    var nrel = f.rels.length;
    rows[0].querySelector('.rel-del').click();
    assert(f.rels.length === nrel - 1 && D.querySelectorAll('#pm .rel-existing .rel-row').length === 0, '× deleted it and the list follows');
    clickPmButton('Horizontal');
    assert(f.rels.length === nrel && D.querySelectorAll('#pm .rel-existing .rel-row').length === 1, 'Add Relations in the line PM');
    UI.pmCancel();
    return done.join(', ');
  });
  step('sketchdims: Display/Delete Relations — filters (All, Dangling, Overdefining/Not Solved, External, Defined in context, Locked, Broken, Selected Entities), Suppressed, the selected relation\'s Entities, Delete All of a filter', async function () {
    await rskNew();
    var f = UI.activeSketchFeature(), S = W.SketchSolver;
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'line', x1: 0, y1: 10, x2: 30, y2: 10 }, { t: 'line', x1: 0, y1: -20, x2: 30, y2: -20, construction: true, ext: true });
    S.addRelation(f, 'horizontal', ['0']); S.addRelation(f, 'horizontal', ['1']); S.addRelation(f, 'fix', ['2']);
    S.addRelation(f, 'parallel', ['0', '1']);   // over defining
    S.addRelation(f, 'distance', ['0', '2'], { value: 20 });
    UI.updateSketches();
    UI.cmdDisplayRelations();
    function rows() { return Array.prototype.map.call(D.querySelectorAll('#rel-display .rel-row'), function (r) { return r.textContent; }); }
    var opts = Array.prototype.map.call(pmField('Filter').options, function (o) { return o.textContent; });
    assert(opts.join('|') === 'All in this sketch|Dangling|Overdefining/Not Solved|External|Defined in context|Locked|Broken|Selected Entities', 'filters ' + opts.join('|'));
    assert(rows().length === 5 && /Parallel/.test(rows()[0]), 'all, over defining first: ' + rows().join(' / '));
    setInput(pmField('Filter'), 'over');
    assert(rows().length === 1 && /Parallel/.test(rows()[0]) && D.querySelector('#rel-display .rel-row.redundant .rel-state svg'), 'over ' + rows().join(' / '));
    setInput(pmField('Filter'), 'external');
    assert(rows().length === 2 && rows().every(function (t) { return /Line3/.test(t); }), 'external ' + rows().join(' / '));
    setInput(pmField('Filter'), 'dangling');
    assert(!rows().length, 'no dangling');
    setInput(pmField('Filter'), 'context');
    assert(!rows().length && /in-context/.test($('rel-display').textContent), 'in context: none');
    setInput(pmField('Filter'), 'all');
    // Suppressed: the Horizontal of line 1 (row "Horizontal: Line2")
    var row = Array.prototype.filter.call(D.querySelectorAll('#rel-display .rel-row'), function (r) { return /Horizontal: Line2/.test(r.textContent); })[0];
    row.click();
    assert(UI.App.sel && UI.App.sel.kind === 'rel' && /Line2/.test($('rel-entities').textContent) && /Current Sketch/.test($('rel-entities').textContent), 'Entities of the selected relation: ' + $('rel-entities').textContent);
    var hi = UI.App.sel.index;
    pmField('Suppressed').click();
    assert(f.rels[hi].suppressed === true && UI.sketchStatus().rels[hi] === 'suppressed', 'suppressed');
    assert(Array.prototype.some.call(D.querySelectorAll('#rel-display .rel-row.suppressed'), function (r) { return /Line2/.test(r.textContent); }), 'row greyed');
    UI.drawDims();
    assert(!D.querySelector('#dim-layer .rel-badge'), 'rfBR: no relation icon drawn (suppressed or not)');
    f.entities[1].y2 = 13; UI.updateSketches();
    UI.cmdDisplayRelations();
    Array.prototype.filter.call(D.querySelectorAll('#rel-display .rel-row'), function (r) { return /Horizontal: Line2/.test(r.textContent); })[0].click();
    pmField('Suppressed').click();
    assert(!f.rels[hi].suppressed && Math.abs(f.entities[1].y2 - f.entities[1].y1) < 1e-9, 'unsuppressed: solved again ' + JSON.stringify(f.entities[1]));
    setInput(pmField('Filter'), 'over');
    var n = f.rels.length;
    clickPmButton('Delete All');
    assert(f.rels.length === n - 1 && !f.rels.some(function (r) { return r.type === 'parallel'; }), 'Delete All deletes only what the filter lists');
    await UI.pmOK();
    return f.rels.length + ' relations left';
  });
  step('sketchdims: status colours and text — white Under / Fully Defined (rfBR), red Over Defined (entities, status bar, (-) / (+) in the FeatureManager); construction dashed; a deleted entity takes its relations and dimensions with it in one undo step', async function () {
    await rskNew();
    var f = UI.activeSketchFeature(), S = W.SketchSolver;
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'line', x1: 0, y1: 10, x2: 30, y2: 10, construction: true });
    UI.updateSketches(); UI.refreshTree();
    function hex(i) { var o = UI.groups.sketches.children.filter(function (x) { return x.userData && x.userData.sketch === f.id && x.userData.index === i; })[0]; return o && o.material.color.getHex(); }
    function row() { return Array.prototype.filter.call(D.querySelectorAll('#tree .ti .nm'), function (n) { return /Sketch\d/.test(n.textContent); }).pop().textContent; }
    function bar() { var s = D.querySelector('#status-right .sk-state'); return s ? s.textContent : ''; }
    assert(hex(0) === UI.linePalette().sketch && bar() === 'Under Defined' && /^\(-\) /.test(row()), 'under: ' + hex(0).toString(16) + ' ' + bar() + ' ' + row());
    var dashed = UI.groups.sketches.children.filter(function (x) { return x.userData && x.userData.index === 1; })[0];
    assert(dashed && dashed.material.type === 'LineDashedMaterial', 'construction dashed');
    S.addRelation(f, 'fix', ['0']); S.addRelation(f, 'fix', ['1']);
    UI.updateSketches(); UI.refreshTree();
    assert(hex(0) === UI.linePalette().sketch && bar() === 'Fully Defined' && !/^\(/.test(row()), 'full: ' + hex(0).toString(16) + ' ' + bar() + ' ' + row());
    S.addRelation(f, 'horizontal', ['0']);
    UI.updateSketches(); UI.refreshTree();
    assert(hex(0) === 0xd9302c && bar() === 'Over Defined' && /^\(\+\) /.test(row()), 'over: ' + hex(0).toString(16) + ' ' + bar() + ' ' + row());
    f.rels = [{ type: 'horizontal', refs: ['0'] }, { type: 'coincident', refs: ['1.p1', 'O'] }];
    f.dims = [{ e: 0, k: 'len' }, { e: 1, k: 'len' }];
    S.addRelation(f, 'distance', ['0', '1'], { driven: true });
    UI.updateSketches();
    var undo0 = UI.App.undo.length, rels0 = JSON.stringify(f.rels), dims0 = JSON.stringify(f.dims);
    D.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true }));
    UI.deleteSketchEntity(0);
    assert(f.entities.length === 1 && (f.rels || []).every(function (r) { return r.refs.every(function (x) { return x === 'O' || +String(x).split('.')[0] === 0; }); }) && f.dims.length === 1 && f.dims[0].e === 0, 'relations / dimensions of the deleted line gone, the rest re-pointed: ' + JSON.stringify([f.rels, f.dims]));
    assert(UI.App.undo.length === undo0 + 1, 'one undo step');
    UI.undo(); await idle();
    var g = UI.activeSketchFeature();
    assert(g.entities.length === 2 && JSON.stringify(g.rels) === rels0 && JSON.stringify(g.dims) === dims0, 'undo puts it all back');
    return 'ok';
  });
  step('sketchdims: Fully Define Sketch (Sketch tab and Tools ▸ Dimensions) — Calculate adds Horizontal / Vertical and baseline dimensions from the origin until Fully Defined; Cancel puts the sketch back; OK keeps it as one undo step', async function () {
    await rskNew();
    var f = UI.activeSketchFeature(), S = W.SketchSolver;
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0.2 }, { t: 'line', x1: 40, y1: 0.2, x2: 40, y2: 25 }, { t: 'line', x1: 40, y1: 25, x2: 0, y2: 25 }, { t: 'line', x1: 0, y1: 25, x2: 0, y2: 0 }, { t: 'circle', cx: 12, cy: 12, r: 3 });
    S.addRelation(f, 'coincident', ['0.p2', '1.p1']); S.addRelation(f, 'coincident', ['1.p2', '2.p1']); S.addRelation(f, 'coincident', ['2.p2', '3.p1']); S.addRelation(f, 'coincident', ['3.p2', '0.p1']);
    UI.updateSketches();
    var before = JSON.stringify([f.entities, f.rels, f.dims || null]);
    var tools = menuRows('Fully Define Sketch');
    assert(tools.length === 1 && /Tools/.test(tools[0].menu), 'Tools menu ' + JSON.stringify(tools.map(function (x) { return x.text; })));
    UI.closeMenus();
    UI.App.ribbonTab = 'Sketch'; UI.refreshRibbon();
    // rfC: Fully Define Sketch is in the Display/Delete Relations flyout, as on SolidWorks 2024's Sketch tab
    var rfl = c14Fly('relations');
    assert(rfl, 'ribbon button');
    rfl.querySelector('.rb-caret').dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); rfl.querySelector('.rb-caret').click();
    c14MenuRow('Fully Define Sketch').click();
    UI.ribbonFlyFace('relations', 0);
    assert(UI.pmTitle() === 'Fully Define Sketch', 'PM ' + UI.pmTitle());
    clickPmButton('Calculate');
    var st = UI.sketchStatus();
    assert(st.status === 'full' && st.dof === 0, 'fully defined ' + JSON.stringify(st));
    assert(f.rels.some(function (r) { return r.type === 'distance' && r.dir === 'h' && r.refs[0] === 'O'; }) && f.dims.some(function (d) { return d.k === 'dia'; }), 'baseline from the origin and the circle size');
    UI.pmCancel();
    assert(JSON.stringify([f.entities, f.rels, f.dims || null]) === before, 'Cancel restores');
    var undo0 = UI.App.undo.length;
    D.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true }));
    UI.cmdFullyDefineSketch();
    setInput(pmField('Horizontal dimensions scheme'), 'chain');
    await UI.pmOK();
    assert(UI.sketchStatus().status === 'full' && UI.App.undo.length === undo0 + 1, 'OK keeps it, one undo step');
    UI.drawDims();
    assert(UI.dimLabelClashes() === 0, 'labels clear of each other\'s lines: ' + UI.dimLabelClashes(true).join(', '));
    UI.undo(); await idle();
    assert(UI.sketchStatus().status === 'under', 'undone');
    return 'ok';
  });
  // --- end sketchdims ---
