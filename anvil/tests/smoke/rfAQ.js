  // ---- rfAQ (2026-10-13): sketch Chamfer / Path Length / Angular Running / Ordinate Dimension, Autodimension, Tools ▸ Dimensions
  function rfAQScr(uv) { return UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])); }
  function rfAQClick(uv) { selClick(rfAQScr(uv)); }
  function rfAQKey(target, k) { target.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
  async function rfAQNew(ents, rels) {
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    var f = UI.activeSketchFeature();
    ents.forEach(function (e) { f.entities.push(e); });
    if (rels) f.rels = rels;
    UI.zoomView(0.25 / UI.cam.scale);   // 0.25 units per pixel: the 40-unit test geometry fills the view
    UI.updateSketches(); await wait(20);
    return f;
  }
  function rfAQPlate() {   // 40 x 24 with a 8 x 45° chamfer at the top right and a R12 half-round left end
    return [{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'line', x1: 40, y1: 0, x2: 40, y2: 16 }, { t: 'line', x1: 40, y1: 16, x2: 32, y2: 24 },
      { t: 'line', x1: 32, y1: 24, x2: 0, y2: 24 }, { t: 'arc', cx: 0, cy: 12, r: 12, a0: 90, a1: 270 }];
  }
  function rfAQPlateRels() {
    return [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'coincident', refs: ['2.p2', '3.p1'] },
      { type: 'coincident', refs: ['3.p2', '4.p1'] }, { type: 'coincident', refs: ['4.p2', '0.p1'] }, { type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }, { type: 'horizontal', refs: ['3'] }];
  }
  function rfAQRels(f, type) { return (f.rels || []).map(function (r, i) { return { r: r, i: i }; }).filter(function (x) { return x.r.type === type; }); }
  function rfAQLabels() { return Array.prototype.map.call(D.querySelectorAll('#dim-layer text'), function (t) { return t.textContent; }); }
  step('rfAQ: Chamfer Dimension — chamfer line, the line next to it, a click places 8 X 45°; the Modify box drives the distance to 10, the Dimension PM the angle to 30°; Ctrl+Z steps back; the script keeps it', async function () {
    need(UI, 'cmdChamferDim');
    var errs0 = errors.length, f = await rfAQNew(rfAQPlate(), rfAQPlateRels()), u0 = UI.App.undo.length;
    UI.cmdChamferDim(); await idle();
    assert(UI.pmTitle() === 'Chamfer Dimension', 'PM ' + UI.pmTitle());
    rfAQClick([36, 20]); rfAQClick([16, 24]); rfAQClick([44, 30]); await idle(); await wait(20);
    var c = rfAQRels(f, 'chamfer')[0];
    assert(c, 'no chamfer dimension: ' + statusText());
    assert(Math.abs(c.r.v - 8) < 1e-9 && Math.abs(c.r.cang - 45) < 1e-9 && !c.r.driven, 'value ' + JSON.stringify(c.r));
    UI.App.dimsStale = true; UI.drawDims(true);
    assert(rfAQLabels().some(function (t) { return /X 45°$/.test(t); }), 'label: ' + rfAQLabels().join(' | '));
    assert(!$('dim-edit').hidden, 'Modify box open');
    var inp = D.querySelector('#dim-edit input');
    inp.value = '10'; rfAQKey(inp, 'Enter'); await idle();
    f = UI.activeSketchFeature(); c = rfAQRels(f, 'chamfer')[0];
    assert(Math.abs(W.SketchSolver.measure(f, 'chamfer', c.r.refs) - 10) < 1e-6, 'distance 10: ' + W.SketchSolver.measure(f, 'chamfer', c.r.refs));
    await UI.pmOK(); await idle();
    // the Dimension PM: Angle under the value
    UI.App.sel = { kind: 'rel', index: c.i };
    assert(UI.openDimensionPM(UI.App.sel), 'Dimension PM');
    var ai = D.querySelector('#pm [data-key="cang"]');
    assert(ai, 'Angle field');
    assert(Math.abs(+ai.value - 45) < 1e-9, 'angle shown ' + ai.value);
    ai.value = '30'; ai.dispatchEvent(new W.Event('input', { bubbles: true })); ai.dispatchEvent(new W.Event('change', { bubbles: true })); await idle();
    f = UI.activeSketchFeature();
    assert(Math.abs(W.SketchSolver.chamferAngle(f, c.r.refs) - 30) < 1e-6, 'angle 30: ' + W.SketchSolver.chamferAngle(f, c.r.refs));
    await UI.pmOK(); await idle();
    var src = anvil.script();
    assert(/\.rel\("chamfer"/.test(src) && /\.rfaq\(\[\[\d+,\{"cang":30/.test(src), 'script ' + src.split('\n').filter(function (l) { return /chamfer|rfaq/.test(l); }).join(' '));
    while (UI.App.undo.length > u0) UI.undo();
    await idle();
    assert(!rfAQRels(UI.activeSketchFeature(), 'chamfer').length, 'undo took the chamfer dimension away');
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return '10 X 30°';
  });
  step('rfAQ: Path Length — one line, Select Chain takes the whole outline, ✓ then a click places it; driving it to 150 grows the chain; Delete removes it', async function () {
    need(UI, 'cmdPathLengthDim');
    var errs0 = errors.length, f = await rfAQNew(rfAQPlate(), rfAQPlateRels());
    var spec = UI.cmdPathLengthDim(); await idle();
    assert(UI.pmTitle() === 'Path Length', 'PM ' + UI.pmTitle());
    rfAQClick([20, 0]);
    clickPmButton('Select Chain'); await idle();
    var total = 40 + 16 + 8 * Math.SQRT2 + 32 + 12 * Math.PI;
    await UI.pmOK(); await idle();
    assert(UI.pmTitle() === 'Path Length', 'still placing');
    rfAQClick([20, -10]); await idle(); await wait(20);
    f = UI.activeSketchFeature();
    var p = rfAQRels(f, 'pathlength')[0];
    assert(p && p.r.refs.length === 5, 'path of 5: ' + JSON.stringify(p && p.r));
    assert(Math.abs(p.r.v - total) < 1e-9, 'total ' + p.r.v + ' vs ' + total);
    assert(!$('dim-edit').hidden, 'Modify box');
    var inp = D.querySelector('#dim-edit input');
    inp.value = '150'; rfAQKey(inp, 'Enter'); await idle();
    f = UI.activeSketchFeature();
    assert(Math.abs(W.SketchSolver.measure(f, 'pathlength', p.r.refs) - 150) < 1e-6, 'driven to 150: ' + W.SketchSolver.measure(f, 'pathlength', p.r.refs));
    UI.App.sel = { kind: 'rel', index: p.i };
    UI.deleteRelation(p.i); await idle();
    assert(!rfAQRels(UI.activeSketchFeature(), 'pathlength').length, 'deleted');
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    void spec;
    return 'path ' + total.toFixed(3);
  });
  step('rfAQ: Angular Running — the 0° line near its vertex, the arcs, then two lines and a hole: 90°, 225°, 45° in one set with a 0°; 225° driven to 200°; the 0° selects the set and Delete deletes it; Ctrl+Z brings it back', async function () {
    need(UI, 'cmdAngularRunningDim');
    var errs0 = errors.length;
    var f = await rfAQNew([{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 0, y2: 40 }, { t: 'line', x1: 0, y1: 0, x2: -24, y2: -24 }, { t: 'circle', cx: 20, cy: 20, r: 2 }],
      [{ type: 'coincident', refs: ['0.p1', '1.p1'] }, { type: 'coincident', refs: ['0.p1', '2.p1'] }, { type: 'fix', refs: ['0'] }]);
    UI.cmdAngularRunningDim(); await idle();
    assert(UI.pmTitle() === 'Angular Running Dimension', 'PM ' + UI.pmTitle());
    rfAQClick([8, 0]); rfAQClick([0, 16]);
    rfAQClick([0, 30]); rfAQClick([-15, -15]); rfAQClick([22, 20]); await idle();
    await UI.pmOK(); await idle(); await wait(20);
    f = UI.activeSketchFeature();
    var sets = W.SketchSolver.runningSets(f), ids = Object.keys(sets);
    assert(ids.length === 1 && sets[ids[0]].members.length === 3, 'one set of 3: ' + JSON.stringify(sets) + ' ' + statusText());
    var vals = sets[ids[0]].members.map(function (i) { return Math.round(f.rels[i].v * 1e6) / 1e6; });
    assert(JSON.stringify(vals) === '[90,225,45]', 'values ' + JSON.stringify(vals));
    UI.App.dimsStale = true; UI.drawDims(true);
    var zero = D.querySelector('#ord-layer text.run-zero');
    assert(zero && zero.textContent === '0°', 'the 0° datum');
    assert(rfAQLabels().some(function (t) { return t === '225°'; }), 'labels ' + rfAQLabels().join(' | '));
    var m225 = sets[ids[0]].members[1];
    assert(W.SketchSolver.setRelValue(f, m225, 200).ok, 'drive 200'); UI.updateSketches();
    var e2 = f.entities[2];
    assert(Math.abs(Math.atan2(e2.y2 - e2.y1, e2.x2 - e2.x1) * 180 / Math.PI + 360 - 200) < 1e-6, 'line turned to 200°');
    var u0 = UI.App.undo.length;
    zero = D.querySelector('#ord-layer text.run-zero');
    zero.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, view: W, button: 0 }));
    assert(UI.App.sel && UI.App.sel.runZero === ids[0], 'set selected');
    rfAQKey(zero, 'Delete'); await idle();
    assert(!Object.keys(W.SketchSolver.runningSets(UI.activeSketchFeature())).length, 'set deleted');
    assert(UI.App.undo.length === u0 + 1, 'one undo step');
    UI.undo(); await idle();
    assert(Object.keys(W.SketchSolver.runningSets(UI.activeSketchFeature())).length === 1, 'undo brought it back');
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return JSON.stringify(vals);
  });
  step('rfAQ: Tools ▸ Dimensions lists Smart … Fully Define Sketch; Autodimension PM (Baseline / Chain / Ordinate, datum line, placement) dimensions a plate to Fully Defined; Ordinate Dimension takes its direction from the placement', async function () {
    var errs0 = errors.length;
    var f = await rfAQNew([{ t: 'rect', x: 0, y: 0, w: 40, h: 24 }, { t: 'circle', cx: 10, cy: 12, r: 3 }, { t: 'circle', cx: 30, cy: 12, r: 3 }]);
    lyrMenu('Tools');
    var rows = Array.prototype.slice.call(D.querySelectorAll('body > .menu .mi')).map(function (r) { return r.textContent; });
    ['Smart Dimension', 'Horizontal Dimension', 'Vertical Dimension', 'Ordinate Dimension', 'Horizontal Ordinate Dimension', 'Vertical Ordinate Dimension', 'Chamfer Dimension', 'Path Length Dimension', 'Angular Running Dimension', 'Autodimension', 'Fully Define Sketch'].forEach(function (n) {
      assert(rows.some(function (r) { return r.indexOf('Dimensions ▸ ' + n) >= 0; }), 'Tools lacks Dimensions ▸ ' + n);
    });
    lyrMenuRow(/Dimensions ▸ Autodimension/).click(); await idle();
    assert(UI.pmTitle() === 'Autodimension', 'PM ' + UI.pmTitle());
    var txt = D.querySelector('#pm').textContent;
    ['Entities to Dimension', 'Horizontal Dimensions', 'Vertical Dimensions', 'Baseline', 'Chain', 'Ordinate', 'Above sketch', 'Left of sketch'].forEach(function (w) { assert(txt.indexOf(w) >= 0, 'PM lacks ' + w); });
    assert(txt.indexOf('Relations') < 0, 'no relations group');
    var sch = D.querySelector('#pm [data-key="vScheme"]');
    sch.value = 'chain'; sch.dispatchEvent(new W.Event('change', { bubbles: true })); await idle();
    clickPmButton('Apply'); await idle();
    var st = UI.sketchStatus();
    assert(st.status === 'full', 'Fully Defined: ' + JSON.stringify(st));
    await UI.pmOK(); await idle();
    // Ordinate Dimension: the zero at the origin, the values placed beside it -> a vertical set
    UI.cmdOrdinateFree(); await idle();
    assert(UI.pmTitle() === 'Ordinate Dimension', 'PM ' + UI.pmTitle());
    rfAQClick([0, 0]); rfAQClick([-10, 6]); rfAQClick([10, 12]); await idle();
    await UI.pmOK(); await idle();
    f = UI.activeSketchFeature();
    var os = W.SketchSolver.ordinateSets(f), oid = Object.keys(os);
    assert(oid.length === 1 && os[oid[0]].axis === 'y', 'vertical set: ' + JSON.stringify(os));
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return rows.filter(function (r) { return /Dimensions ▸/.test(r); }).length + ' Dimensions rows';
  });
  // --- end rfAQ ---
