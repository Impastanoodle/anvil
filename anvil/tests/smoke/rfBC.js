  // --- rfBC ---
  // (2026-10-13) Constrain All PropertyManager (Relations only / Relations and dimensions, preview, ✓ one undo step, ✗
  // leaves the sketch), Stretch Entities by a crossing / window box (the points inside move, what crosses stretches),
  // inch angle tolerances with their leading zero (±0.5°)
  async function rfBCNew(ents, rels) {
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    UI.zoomView(0.25 / UI.cam.scale);
    var f = UI.activeSketchFeature();
    ents.forEach(function (e) { f.entities.push(e); });
    (rels || []).forEach(function (r) { var x = W.SketchSolver.addRelation(f, r[0], r[1]); assert(x.ok, 'relation ' + r[0] + ': ' + x.error); });
    UI.updateSketches(); await wait(20);
    return f;
  }
  function rfBCScr(p) { return UI.worldToScreen(K.to3D(UI.activePlane(), p[0], p[1])); }
  // a box drag from sketch point a to b with the real mouse (b left of a: crossing; right of a: window)
  async function rfBCBox(a, b) { await selDrag(rfBCScr(a), rfBCScr(b)); }
  function rfBCRect(w, h) {
    return { ents: [{ t: 'line', x1: 0, y1: 0, x2: w, y2: 0 }, { t: 'line', x1: w, y1: 0, x2: w, y2: h }, { t: 'line', x1: w, y1: h, x2: 0, y2: h }, { t: 'line', x1: 0, y1: h, x2: 0, y2: 0 }],
      rels: [['coincident', ['0.p2', '1.p1']], ['coincident', ['1.p2', '2.p1']], ['coincident', ['2.p2', '3.p1']], ['coincident', ['3.p2', '0.p1']], ['horizontal', ['0']], ['vertical', ['1']], ['horizontal', ['2']], ['vertical', ['3']]] };
  }
  function rfBCBlank() {   // an imported 10 x 6 blank: a R1 corner, a hole, ends a hair apart, nothing related
    return [{ t: 'line', x1: 0, y1: 0, x2: 9, y2: 1e-7 }, { t: 'arc', cx: 9, cy: 1, r: 1, a0: 270, a1: 360 }, { t: 'line', x1: 10, y1: 1, x2: 10, y2: 6 },
      { t: 'line', x1: 10, y1: 6, x2: 0, y2: 6 }, { t: 'line', x1: 0, y1: 6, x2: 0, y2: 0 }, { t: 'circle', cx: 5, cy: 3, r: 0.5 }];
  }
  async function rfBCStretchXY(dx, dy) {
    UI.pmSetValue('mode', 'xy'); UI.renderPM(); UI.pmSetValue('dx', dx); UI.pmSetValue('dy', dy); await wait(20);
  }
  step('rfBC: Constrain All from the menu opens its PropertyManager — Relations only by default with a preview of what it adds (nothing added yet); Relations and dimensions shows the scheme fields and the dimension count; ✗ leaves the sketch; ✓ adds the relations only, one undo step', async function () {
    var errs0 = errors.length;
    var f = await rfBCNew(rfBCBlank()), before = JSON.stringify({ e: f.entities, r: f.rels || null, d: f.dims || null }), u0 = UI.App.undo.length;
    lyrMenu('Tools'); lyrMenuRow(/Relations ▸ Constrain All/).click(); await idle();
    assert(UI.pmTitle() === 'Constrain All', 'PM ' + UI.pmTitle());
    var p = UI.constrainAllPreview();
    assert(p && p.added.coincident === 6 && p.added.horizontal === 2 && p.added.vertical === 2 && p.added.tangent === 2 && !p.dims, 'preview ' + JSON.stringify(p));
    assert(/Will add 6 Coincident, 2 Horizontal, 2 Vertical, 2 Tangent\./.test(p.text) && !/dimension/.test(p.text), 'message: ' + p.text);
    assert(D.querySelector('#pm').textContent.indexOf('Will add 6 Coincident') >= 0, 'the message is in the PM');
    assert(!D.querySelector('#pm [data-key="hScheme"]'), 'no scheme fields for Relations only');
    assert(JSON.stringify({ e: f.entities, r: f.rels || null, d: f.dims || null }) === before, 'the preview changed nothing');
    var rb = D.querySelector('#pm input[data-key="mode:dims"]');
    assert(rb, 'Relations and dimensions option');
    rb.click(); await idle();
    p = UI.constrainAllPreview();
    assert(D.querySelector('#pm [data-key="hScheme"]') && D.querySelector('#pm [data-key="vScheme"]'), 'scheme fields shown');
    assert(p.dims >= 4 && p.status === 'full' && /dimensions/.test(p.text), 'with dimensions: ' + p.text);
    UI.pmCancel(); await idle();
    assert(!UI.pmTitle() && JSON.stringify({ e: f.entities, r: f.rels || null, d: f.dims || null }) === before && UI.App.undo.length === u0, '✗ leaves the sketch');
    UI.cmdConstrainAll(); await idle();
    assert(UI.pmTitle() === 'Constrain All' && UI.pmSpec().values.mode === 'rels', 'opens on Relations only again');
    UI.pmOK(); await idle();
    f = UI.activeSketchFeature();
    assert(f.rels && f.rels.length === 12 && !(f.dims && f.dims.length), 'relations only: ' + (f.rels || []).length + ' rels, ' + (f.dims || []).length + ' dims');
    assert(UI.App.undo.length === u0 + 1, 'one undo step: ' + (UI.App.undo.length - u0));
    UI.undo(); await idle();
    assert(!(UI.activeSketchFeature().rels || []).length, 'undone');
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return '12 relations';
  });
  step('rfBC: Constrain All PM with Relations and dimensions, Ordinate both ways — ✓ makes the blank fully defined with ordinate dimensions; the script form with options still runs without a PM', async function () {
    var errs0 = errors.length;
    var f = await rfBCNew(rfBCBlank());
    UI.cmdConstrainAll(); await idle();
    UI.pmSetValue('mode', 'dims'); await idle();
    UI.pmSetValue('hScheme', 'ordinate'); UI.pmSetValue('vScheme', 'ordinate'); await idle();
    var p = UI.constrainAllPreview();
    assert(p.status === 'full', 'preview fully defined: ' + p.text);
    UI.pmOK(); await idle();
    f = UI.activeSketchFeature();
    var an = W.SketchSolver.analyze(f), ord = (f.rels || []).filter(function (r) { return /ordinate|^o/.test(r.type) || r.ord; }).length + (f.dims || []).filter(function (d) { return d.ord || /^o/.test(d.k || ''); }).length;
    assert(an.status === 'full', 'fully defined: ' + an.status);
    var r = UI.cmdConstrainAll({ fullyDefine: false });
    assert(r && r.ok && !UI.pmTitle(), 'script form: no PM, ' + JSON.stringify(r && r.added));
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return an.status + ', ordinate items ' + ord;
  });
  step('rfBC: Stretch Entities with a crossing box (real mouse, right to left) over the right half of a 40 × 20 rectangle of four lines — the right side moves 10, the top and bottom stretch to 50, the left side stays, the top\'s length dimension reads 50; the preview shows it; one undo step', async function () {
    var errs0 = errors.length, R = rfBCRect(40, 20);
    var f = await rfBCNew(R.ents, R.rels);
    f.dims = [{ e: 2, k: 'len', off: 4 }];
    UI.setSelection([]);
    UI.cmdStretchEntities(); await wait(20);
    assert(/^Stretch/.test(UI.pmTitle()), 'Stretch PM: ' + UI.pmTitle());
    await rfBCBox([46, 26], [25, -6]);
    var sel = anvil.selection().map(function (s) { return s.index; }).sort();
    assert(sel.join() === '0,1,2', 'crossing picks the right side, top and bottom: ' + sel.join());
    assert(UI.lastSketchBox && UI.lastSketchBox.mode === 'crossing', 'the box is kept for Stretch');
    var u0 = UI.App.undo.length;
    await rfBCStretchXY(10, 0);
    var tmp = UI.App.tempEntities || [];
    assert(tmp.some(function (e) { return e.t === 'line' && Math.abs(e.x1 - 50) < 1e-6 && Math.abs(e.x2 - 50) < 1e-6; }) && tmp.some(function (e) { return e.t === 'line' && Math.abs(Math.abs(e.x2 - e.x1) - 50) < 1e-6; }), 'preview: the stretched shape ' + JSON.stringify(tmp));
    UI.pmOK(); await idle(); await wait(20);
    var E = UI.activeSketchFeature().entities;
    near(E[1].x1, 50, 1e-6, 'right side moved'); near(E[1].x2, 50, 1e-6, 'right side moved (top end)');
    near(E[0].x1, 0, 1e-6, 'bottom keeps its left end'); near(E[0].x2, 50, 1e-6, 'bottom stretched');
    near(E[2].x1, 50, 1e-6, 'top stretched'); near(E[2].x2, 0, 1e-6, 'top keeps its left end');
    near(E[3].x1, 0, 1e-6, 'left side stays'); near(E[3].y1, 20, 1e-6, 'left side stays');
    near(K.dimValue(E[2], UI.activeSketchFeature().dims[0]), 50, 1e-6, 'length dimension');
    assert(UI.App.undo.length - u0 === 1, 'one undo step: ' + (UI.App.undo.length - u0));
    UI.undo(); await idle();
    near(UI.activeSketchFeature().entities[1].x1, 40, 1e-9, 'undone');
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'stretched to 50';
  });
  step('rfBC: Stretch Entities on an L-shape with a tangent arc corner — a crossing box round the arc and the right leg moves them 3, stretches the bottom and the inner top; the Tangents hold. A window box (left to right) round the same corner does the same', async function () {
    var errs0 = errors.length, out = [];
    function lshape() {
      return { ents: [{ t: 'line', x1: 0, y1: 0, x2: 8, y2: 0 }, { t: 'arc', cx: 8, cy: 2, r: 2, a0: 270, a1: 360 }, { t: 'line', x1: 10, y1: 2, x2: 10, y2: 4 },
        { t: 'line', x1: 10, y1: 4, x2: 4, y2: 4 }, { t: 'line', x1: 4, y1: 4, x2: 4, y2: 10 }, { t: 'line', x1: 4, y1: 10, x2: 0, y2: 10 }, { t: 'line', x1: 0, y1: 10, x2: 0, y2: 0 }],
        rels: [['coincident', ['0.p2', '1.p1']], ['coincident', ['1.p2', '2.p1']], ['tangent', ['0', '1']], ['tangent', ['1', '2']], ['coincident', ['2.p2', '3.p1']], ['coincident', ['3.p2', '4.p1']],
          ['coincident', ['4.p2', '5.p1']], ['coincident', ['5.p2', '6.p1']], ['coincident', ['6.p2', '0.p1']]] };
    }
    var boxes = [[[11.5, 5], [6.5, -1.5]], [[6.5, -1.5], [11.5, 5]]];
    for (var b = 0; b < boxes.length; b++) {
      var L = lshape(), f = await rfBCNew(L.ents, L.rels);
      UI.zoomView(0.06 / UI.cam.scale); await wait(20);
      UI.setSelection([]);
      UI.cmdStretchEntities(); await wait(20);
      await rfBCBox(boxes[b][0], boxes[b][1]);
      assert(UI.lastSketchBox && UI.lastSketchBox.mode === (b ? 'window' : 'crossing'), 'box mode');
      assert(anvil.selection().length >= 2, 'selected ' + JSON.stringify(anvil.selection().map(function (s) { return s.index; })));
      await rfBCStretchXY(3, 0);
      UI.pmOK(); await idle(); await wait(20);
      var E = UI.activeSketchFeature().entities;
      near(E[1].cx, 11, 1e-6, 'arc moved'); near(E[1].r, 2, 1e-6, 'arc radius');
      near(E[0].x1, 0, 1e-6, 'bottom keeps its far end'); near(E[0].x2, 11, 1e-6, 'bottom stretched');
      near(E[2].x1, 13, 1e-6, 'right leg moved'); near(E[3].x1, 13, 1e-6, 'inner top stretched'); near(E[3].x2, 4, 1e-6, 'inner corner stays'); near(E[4].x1, 4, 1e-6, 'upper leg stays');
      assert(W.SketchSolver.analyze(UI.activeSketchFeature()).conflicts === 0, 'tangents hold');
      out.push(UI.lastSketchBox === null ? (b ? 'window' : 'crossing') : '?');
      await UI.exitSketch(); await idle();
    }
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return out.join(', ');
  });
  step('rfBC: Stretch Entities on a straight slot — a crossing box over its right end lengthens it by 6 (the width stays); a slot picked by a click (no box) still moves whole', async function () {
    var errs0 = errors.length;
    var f = await rfBCNew([{ t: 'slot', x1: 0, y1: 0, x2: 20, y2: 0, w: 6 }]);
    UI.setSelection([]);
    UI.cmdStretchEntities(); await wait(20);
    await rfBCBox([26, 8], [15, -8]);
    assert(anvil.selection().length === 1, 'slot picked by the crossing box');
    await rfBCStretchXY(6, 0);
    UI.pmOK(); await idle(); await wait(20);
    var s = UI.activeSketchFeature().entities[0];
    assert(s.t === 'slot' && Math.abs(s.x1) < 1e-9 && Math.abs(s.x2 - 26) < 1e-6 && s.w === 6, 'slot ' + JSON.stringify(s));
    // a click selection (no box): the whole slot moves
    UI.lastSketchBox = null;
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    UI.cmdStretchEntities(); await wait(20);
    await rfBCStretchXY(0, 5);
    UI.pmOK(); await idle(); await wait(20);
    s = UI.activeSketchFeature().entities[0];
    assert(Math.abs(s.y1 - 5) < 1e-6 && Math.abs(s.y2 - 5) < 1e-6 && Math.abs(s.x2 - s.x1 - 26) < 1e-6, 'moved whole ' + JSON.stringify(s));
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'slot 26 long';
  });
  step('rfBC: inch angle tolerances keep the leading zero (ASME Y14.5: ±0.5°) in sketch labels and on the drawing, while inch lengths still drop it (.500 ±.005)', async function () {
    await anvil.newPart(); await idle();
    UI.App.model.units = 'in';
    var a = UI.dimLabelText({ prec: 1, tol: { type: 'symmetric', plus: 0.5 } }, 30, 'angle');
    assert(a === '30.0° ±0.5°', 'sketch angle: ' + a);
    var a2 = UI.dimLabelText({ tol: { type: 'bilateral', plus: 0.5, minus: 0.25 } }, 30, 'angle');
    assert(a2 === '30° +0.5° -0.25°', 'sketch bilateral angle: ' + a2);
    var l = UI.dimLabelText({ prec: 3, tol: { type: 'symmetric', plus: 0.005 } }, 0.5, 'len');
    assert(l === '.500 ±.005', 'sketch length: ' + l);
    var DW = W.Drawing, d = DW.dimLabel({ kind: 'angle', value: 45, prec: 1, tol: { type: 'symmetric', plus: 0.5 } }, 'in');
    assert(d.text === '45.0° ±0.5°', 'drawing angle: ' + d.text);
    var dl = DW.dimLabel({ kind: 'len', value: 2, tol: { type: 'symmetric', plus: 0.01, prec: 2 } }, 'in');
    assert(/±\.01$/.test(dl.text), 'drawing length: ' + dl.text);
    return [a, d.text, l, dl.text].join(' | ');
  });
  // --- end rfBC ---
