  // --- rfPJ (2026-11-17, lane sketchdual: dual dimensions on sketch and part dimensions in the graphics area, as
  // SolidWorks 2024's Document Properties > Dimensions > Dual dimensions display; the dimensions a double-click on a
  // feature shows with Instant3D off, without switching Instant3D on behind its button) ---
  var rfPJSaved = null;
  function rfPJSet() {
    var V = UI.App.view;
    if (!rfPJSaved) rfPJSaved = { grid: V.showGrid, regions: V.sketchRegions, dims: V.showDims, i2d: V.instant2D, qs: UI.App.quickSnap };
    V.showGrid = false; V.sketchRegions = false; V.showDims = false; V.instant2D = false; UI.App.quickSnap = null;
  }
  function rfPJRestore() {
    var s = rfPJSaved, V = UI.App.view;
    if (!s) return;
    rfPJSaved = null;
    V.showGrid = s.grid; V.sketchRegions = s.regions; V.showDims = s.dims; V.instant2D = s.i2d; UI.App.quickSnap = s.qs;
    UI.App.gridStale = true; UI.App.dimsStale = true;
  }
  function rfPJStep(name, fn) { step(name, async function () { try { return await fn(); } finally { try { if (UI.hasPM()) UI.pmCancel(); UI.setTool('select'); } catch (e) { /* no sketch */ } rfPJRestore(); } }); }
  async function rfPJLand() { for (var i = 0; i < 50 && UI.viewAnimating && UI.viewAnimating(); i++) await wait(20); if (UI.finishViewAnimation) UI.finishViewAnimation(); await idle(); }
  function rfPJframe() { return new Promise(function (res) { var done = false; W.requestAnimationFrame(function () { if (!done) { done = true; res(); } }); setTimeout(function () { if (!done) { done = true; res(); } }, 1500); }); }
  // the shop sketch of rfOH: linear, aligned, radius with a tolerance, 4X diameter, between two lines, to a midpoint, an
  // angle, a driven one, a slot's width and length, and an ordinate set
  var RFPJ_SHOP = ['p.units("in");',
    'p.sketch("Front", 0, "Sketch1")',
    '  .line(0.5, 0, 11.5, 0).line(12, 0.5, 12, 7.5).line(11.5, 8, 0.5, 8).line(0, 7.5, 0, 0.5)',
    '  .arc(11.5, 0.5, 0.5, -90, 0).arc(11.5, 7.5, 0.5, 0, 90).arc(0.5, 7.5, 0.5, 90, 180).arc(0.5, 0.5, 0.5, 180, 270)',
    '  .circle(2, 1.5, 0.1405).circle(4, 1.5, 0.1405).circle(6, 1.5, 0.1405).circle(2, 3, 0.1405).circle(4, 3, 0.1405).circle(6, 3, 0.1405)',
    '  .slot(8, 2, 10, 2, 0.5).slot(10.5, 4.5, 10.5, 6.5, 0.375)',
    '  .line(0, 4, 12, 4).line(1, 6.8, 3.5, 7.4).arc(6, 5.5, 1, 20, 160).spline([[2, 4.8], [3, 5.8], [4, 4.9], [5, 6.2]])',
    '  .construction([16, 17])',
    '  .dim(0, "len", { off: -0.6 }).dim(1, "len", { off: -0.6 }).dim(17, "len", { off: 0.4 })',
    '  .dim(5, "r", { ang: 45, off: 1.2 }).dim(8, "dia", { ang: 225, off: 0.8 }).dim(18, "r", { ang: 60, off: 1.6 })',
    '  .dim(14, "w").dim(14, "len")',
    '  .rel("distance", ["0", "2"], 8, { off: 0.9 })',
    '  .rel("distance", ["2.mid", "14.c"], 3)',
    '  .rel("angle", ["16", "17"], 13.5)',
    '  .driven([2]);'].join('\n');
  async function rfPJShop() {
    await anvil.newPart(); await idle();
    rfPJSet();
    await anvil.run(RFPJ_SHOP); await idle();
    var f = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    f.dims[3].tol = { type: 'symmetric', plus: 0.005, minus: 0.005 };
    f.dims[4].prefix = '4X';
    UI.editSketch(f.id); await idle();
    rfPJSet();
    anvil.ordinate('x', '3', ['11.c', '12.c', '13.c'], -1.8);
    UI.App.sel = null;
    UI.zoomToFit(); await rfPJLand();
    return UI.activeSketchFeature();
  }
  // the dimension layer: per dimension its label, the text's ink box and its arrowheads (as rfOH reads it)
  function rfPJLayer() {
    UI.drawDims(true);
    return Array.prototype.map.call(D.querySelectorAll('#dim-layer g.dim'), function (g) {
      var t = g.querySelector('text'), da = g.querySelector('path.da'), arrows = [];
      var bb = t && t.textContent ? t.getBBox() : null, yb = t ? +t.getAttribute('y') : 0;
      (da ? da.getAttribute('d') || '' : '').replace(/M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)L\s*(-?[\d.]+)[ ,]+(-?[\d.]+)L\s*(-?[\d.]+)[ ,]+(-?[\d.]+)Z/g, function (m, a, b, c, d, e, f) { arrows.push([[+a, +b], [+c, +d], [+e, +f]]); return m; });
      return { label: t ? t.textContent : '', box: bb ? [bb.x - 1, yb - UI.DIM_CAP - 1, bb.x + bb.width + 1, yb + 1] : null, arrows: arrows, temp: /\btemp\b/.test(g.getAttribute('class')) };
    }).filter(function (x) { return !x.temp && x.label; });
  }
  function rfPJLabels() { return rfPJLayer().map(function (x) { return x.label; }); }
  function rfPJMeet(a, b) { return !!a && !!b && a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }
  function rfPJTriBox(tr) { var xs = tr.map(function (p) { return p[0]; }), ys = tr.map(function (p) { return p[1]; }); return [Math.min.apply(0, xs), Math.min.apply(0, ys), Math.max.apply(0, xs), Math.max.apply(0, ys)]; }
  // every text against every other text (the ordinate zero too) and every arrowhead
  function rfPJCrowd() {
    var L = rfPJLayer(), bad = [];
    var zero = Array.prototype.map.call(D.querySelectorAll('#ord-layer text'), function (t) { var bb = t.getBBox(), y = +t.getAttribute('y'); return { label: '0', box: [bb.x - 1, y - UI.DIM_CAP - 1, bb.x + bb.width + 1, y + 1], arrows: [] }; });
    var all = L.concat(zero);
    all.forEach(function (a, i) {
      all.forEach(function (b, j) {
        if (j > i && rfPJMeet(a.box, b.box)) bad.push(a.label + ' text on ' + b.label);
        b.arrows.forEach(function (tr) { if (rfPJMeet(a.box, rfPJTriBox(tr))) bad.push(b.label + ' arrow on ' + a.label); });
      });
    });
    return { n: L.length, bad: bad };
  }

  rfPJStep('rfPJ: Dual dimensions display on in an inch part: every length dimension of the shop sketch shows its millimetres in brackets (11.000 [279.40], R.500 ±.005 [12.70 ±0.13], 4X Ø.281 [7.14], ordinate values, the driven one inside its parentheses), angles do not; no text on another text or arrow at the fitted zoom, 3x out and 3x in; off again and Undo', async function () {
    var errs0 = errors.length;
    var f = await rfPJShop(), before = rfPJLabels();
    assert(before.indexOf('11.000') >= 0 && !before.some(function (l) { return /\[/.test(l); }), 'no dual while off: ' + before.join(' | '));
    var undo0 = UI.App.undo.length;
    var st = anvil.dualDimensions({ on: true });
    assert(st.on && st.units === 'mm' && st.prec === 2 && st.pos === 'right', 'the defaults: ' + JSON.stringify(st));
    assert(JSON.stringify(UI.App.model.dualDimensions) === '{"on":true}' && UI.App.undo.length === undo0 + 1, 'stored as ' + JSON.stringify(UI.App.model.dualDimensions) + ', one undo step');
    UI.updateSketches(); await idle();
    var L = rfPJLabels(), want = ['11.000 [279.40]', '7.000 [177.80]', 'R.500 ±.005 [12.70 ±0.13]', '4X Ø.281 [7.14]', '8.000 [203.20]', '3.000 [76.20]', '13.5°'];
    want.forEach(function (w) { assert(L.indexOf(w) >= 0, '"' + w + '" among ' + L.join(' | ')); });
    assert(L.some(function (l) { return /^\(\d*\.\d+ \[\d+\.\d\d\]\)$/.test(l); }), 'the driven dimension with its dual inside the parentheses: ' + L.join(' | '));
    assert(!L.some(function (l) { return /°.*\[|\[.*°/.test(l); }), 'no angle doubled: ' + L.join(' | '));
    var ords = L.filter(function (l) { return /^(2|4|6)\.000 \[/.test(l); });
    assert(ords.length >= 3, 'the ordinate values each with its dual: ' + L.join(' | '));
    var res = [], steps = [[1, 'fit'], [3, 'out 3x'], [1 / 9, 'in 3x']];
    for (var k = 0; k < steps.length; k++) {
      UI.zoomView(steps[k][0]); await idle(); UI.updateSketches(); await idle();
      var c = rfPJCrowd();
      assert(c.n >= 13, steps[k][1] + ': dimensions drawn ' + c.n);
      assert(!c.bad.length, steps[k][1] + ': ' + c.bad.slice(0, 6).join(', '));
      res.push(steps[k][1] + ' clear');
    }
    // the Modify box and status messages keep the primary value only
    assert(anvil.dimProps('dim', 0).label === '11.000' && anvil.dimProps('dim', 0).text === '11.000 [279.40]', 'label / text: ' + JSON.stringify(anvil.dimProps('dim', 0)));
    UI.undo(); await idle(); UI.updateSketches(); await idle();
    assert(!UI.App.model.dualDimensions && !rfPJLabels().some(function (l) { return /\[/.test(l); }), 'Undo turned it off: ' + JSON.stringify(UI.App.model.dualDimensions));
    anvil.dualDimensions({ on: true }); anvil.dualDimensions({ on: false });
    assert(!UI.App.model.dualDimensions, 'off is not stored');
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return want.length + ' texts as SolidWorks; ' + res.join(', ');
  });

  rfPJStep('rfPJ: the Dimension PropertyManager\'s Dual Dimension box: on with the document, unticked it is stored as dual false on that dimension only and survives the script; ticked on a part with the option off it shows that one; Left puts the dual first; a mm part shows inches (.500); an angle has no box', async function () {
    var errs0 = errors.length;
    var f = await rfPJShop();
    anvil.dualDimensions({ on: true }); UI.updateSketches(); await idle();
    UI.openDimensionPM({ kind: 'dim', index: 0 }); await idle();
    var box = pmField('Dual Dimension');
    assert(box && box.type === 'checkbox' && box.checked, 'Dual Dimension box, ticked: ' + (box && box.checked));
    box.click(); await idle();
    assert(f.dims[0].dual === false, 'stored as false: ' + JSON.stringify(f.dims[0]));
    UI.pmOK(); await idle();
    var L = rfPJLabels();
    assert(L.indexOf('11.000') >= 0 && L.indexOf('7.000 [177.80]') >= 0, 'that one only: ' + L.join(' | '));
    // through the script
    UI.exitSketch(); await idle();
    var script = anvil.script();
    assert(/"dual":false/.test(script), 'the script carries it: ' + script.split('\n').filter(function (l) { return /dimProps/.test(l); }).join(' / '));
    await anvil.newPart(); await idle();
    await anvil.run(script); await idle();
    var g = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    assert(g.dims[0].dual === false && g.dims[1].dual == null, 'read back: ' + JSON.stringify([g.dims[0].dual, g.dims[1].dual]));
    assert(UI.App.model.dualDimensions && UI.App.model.dualDimensions.on, 'the part\'s option came back with the script (p.dualDimensions)');
    anvil.dualDimensions({ on: false });
    // option off, one dimension ticked; then Left
    UI.editSketch(g.id); await idle(); rfPJSet();
    UI.openDimensionPM({ kind: 'dim', index: 1 }); await idle();
    box = pmField('Dual Dimension');
    assert(box && !box.checked, 'unticked with the option off');
    box.click(); await idle(); UI.pmOK(); await idle();
    assert(g.dims[1].dual === true, 'stored as true');
    L = rfPJLabels();
    assert(L.indexOf('7.000 [177.80]') >= 0 && L.indexOf('11.000') >= 0 && L.filter(function (l) { return /\[/.test(l); }).length === 1, 'only that one: ' + L.join(' | '));
    anvil.dualDimensions({ pos: 'left' }); UI.updateSketches(); await idle();
    assert(rfPJLabels().indexOf('[177.80] 7.000') >= 0, 'Left: ' + rfPJLabels().join(' | '));
    // an angle: no box
    var ai = g.rels.reduce(function (a, r, i) { return r.type === 'angle' ? i : a; }, -1);
    UI.openDimensionPM({ kind: 'rel', index: ai }); await idle();
    assert(UI.hasPM() && !pmField('Dual Dimension'), 'no Dual Dimension box on an angle');
    UI.pmCancel(); await idle();
    UI.exitSketch(); await idle();
    // a millimetre part shows inches
    await anvil.newPart(); await idle(); rfPJSet();
    await anvil.run('p.units("mm");\np.sketch("Front").line(0, 0, 25.4, 0).circle(50, 20, 6.35).dim(0, "len", { off: -8 }).dim(1, "dia", { ang: 45, off: 12 });'); await idle();
    anvil.dualDimensions({ on: true });
    var h = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    UI.editSketch(h.id); await idle(); rfPJSet(); UI.zoomToFit(); await rfPJLand();
    L = rfPJLabels();
    assert(L.indexOf('25.4 [1.000]') >= 0 && L.indexOf('Ø12.7 [.500]') >= 0, 'mm part: ' + L.join(' | '));
    anvil.dualDimensions({ prec: 4, showUnits: true }); UI.updateSketches(); await idle();
    assert(rfPJLabels().indexOf('25.4 [1.0000in]') >= 0, 'Dual Dimension Length .1234 with units: ' + rfPJLabels().join(' | '));
    UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return 'per-dimension override both ways, Left, mm part';
  });

  function rfPJEv(type, p, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
  }
  async function rfPJClick(p) { rfPJEv('mousemove', p); rfPJEv('mousedown', p, $('viewport')); rfPJEv('mouseup', p); await wait(20); }
  function rfPJRole(role) { return D.querySelector('[data-role="' + role + '"]'); }
  function rfPJChange(elm) { elm.dispatchEvent(new W.Event('change', { bubbles: true })); }
  rfPJStep('rfPJ: Document Properties ▸ Dimensions: the user ticks Dual dimensions display: a Smart Dimension on the solid (a 4 in edge) reads 4.000 [101.60], picks Left: [101.60] 4.000, decimals .1 and Show units: [101.6mm] 4.000; the script writes p.dualDimensions and builds it back; Undo steps back; unticked it is gone', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sketch("Top").rect(-2, -1, 4, 2).extrude(0.5);'); await idle();
    var v = UI.App.view, planes = v.showPlanes, origin = v.showOrigin;
    v.showPlanes = false; v.showOrigin = false; if (UI.updatePlanes) UI.updatePlanes(); if (UI.updateOrigin) UI.updateOrigin();
    try {
      UI.setView('Isometric'); await rfPJLand(); UI.zoomToFit(); await wait(60);
      UI.modelDimTool(true);
      await rfPJClick(UI.worldToScreen([1, 0.5, 1]));
      await rfPJClick(UI.worldToScreen([1, 0.5, 2.5]));
      UI.modelDimTool(false);
      var md = UI.modelDims()[0];
      assert(md && md.text === '4.000' && md.label === '4.000', 'a 4.000 edge dimension, no dual yet: ' + JSON.stringify(UI.modelDims()));
      UI.openTaskPane('props'); await idle();
      var on = rfPJRole('dual-on'), pos = rfPJRole('dual-pos');
      assert(on && pos && !on.checked && pos.disabled, 'the Dual dimensions display row, off, position greyed');
      var undo0 = UI.App.undo.length;
      on.click(); await idle();
      assert(JSON.stringify(UI.App.model.dualDimensions) === '{"on":true}' && UI.App.undo.length === undo0 + 1, 'ticked: ' + JSON.stringify(UI.App.model.dualDimensions));
      UI.drawDims();
      var t = UI.modelDimLabel(md.id);
      assert(UI.modelDims()[0].label === '4.000 [101.60]' && t && t.el.textContent === '4.000 [101.60]' && UI.modelDims()[0].text === '4.000', 'the solid\'s dimension: ' + (t && t.el.textContent));
      pos = rfPJRole('dual-pos'); assert(!pos.disabled, 'position live once on');
      pos.value = 'left'; rfPJChange(pos); await idle();
      assert(UI.modelDims()[0].label === '[101.60] 4.000', 'Left: ' + UI.modelDims()[0].label);
      var pr = rfPJRole('dual-prec'); pr.value = '1'; rfPJChange(pr); await idle();
      rfPJRole('dual-units-shown').click(); await idle();
      assert(UI.modelDims()[0].label === '[101.6mm] 4.000', 'decimals .1 with units: ' + UI.modelDims()[0].label);
      assert(JSON.stringify(UI.App.model.dualDimensions) === '{"on":true,"prec":1,"pos":"left","showUnits":true}', 'stored ' + JSON.stringify(UI.App.model.dualDimensions));
      var script = anvil.script();
      assert(script.indexOf('p.dualDimensions({"on":true,"prec":1,"pos":"left","showUnits":true});') >= 0, 'script: ' + script.split('\n').slice(0, 4).join(' / '));
      UI.undo(); await idle();
      assert(JSON.stringify(UI.App.model.dualDimensions) === '{"on":true,"prec":1,"pos":"left"}', 'Undo took back Show units: ' + JSON.stringify(UI.App.model.dualDimensions));
      UI.openTaskPane('props'); await idle();
      rfPJRole('dual-on').click(); await idle();
      assert(UI.App.model.dualDimensions && !UI.App.model.dualDimensions.on && UI.modelDims()[0].label === '4.000', 'unticked: no dual (' + UI.modelDims()[0].label + ', kept ' + JSON.stringify(UI.App.model.dualDimensions) + ')');
      await anvil.newPart(); await idle();
      await anvil.run(script); await idle();
      assert(JSON.stringify(UI.App.model.dualDimensions) === '{"on":true,"prec":1,"pos":"left","showUnits":true}', 'built back from the script: ' + JSON.stringify(UI.App.model.dualDimensions));
    } finally { UI.modelDimTool(false); v.showPlanes = planes; v.showOrigin = origin; if (UI.updatePlanes) UI.updatePlanes(); if (UI.updateOrigin) UI.updateOrigin(); }
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return 'switched on from Document Properties; model dimension 4.000 [101.60]';
  });

  rfPJStep('rfPJ: in the part, Instant3D off: a double-click on Boss-Extrude1 shows its sketch dimensions and depth with their duals (3.000 [76.20], 1.000 [25.40]) while Instant3D stays off (no switching on behind the button); Esc hides them; a plain selection then shows no arrows; Instant3D on shows them as before', async function () {
    var errs0 = errors.length, wasOn = UI.instant3DOn();
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\nvar s = p.sketch("Front");\ns.line(0, 0, 3, 0).line(3, 0, 3, 2).line(3, 2, 0, 2).line(0, 2, 0, 0);\n' +
      's.rel("coincident", ["0.p2", "1.p1"]).rel("coincident", ["1.p2", "2.p1"]).rel("coincident", ["2.p2", "3.p1"]).rel("coincident", ["3.p2", "0.p1"]);\n' +
      's.dim(0, "len", { off: -0.5 }).dim(1, "len", { off: 0.5 });\ns.end().extrude(1);\n'); await idle();
    UI.toggleInstant3D(false);
    try {
      anvil.dualDimensions({ on: true });
      UI.setView('Isometric'); UI.zoomToFit(); await rfPJLand(); await rfPJframe();
      var ex = UI.App.model.features.filter(function (x) { return x.type === 'extrude'; })[0];
      var calls = 0, tg = UI.toggleInstant3D;
      UI.toggleInstant3D = function () { calls++; return tg.apply(this, arguments); };
      try { assert(UI.showFeatureDims(ex), 'shown'); } finally { UI.toggleInstant3D = tg; }
      await idle(); await rfPJframe();
      assert(calls === 0 && !UI.instant3DOn() && !anvil.instant3D().on, 'Instant3D not switched: ' + calls + ' toggles, on ' + anvil.instant3D().on);
      var kinds = anvil.instant3D().handles.map(function (h) { return h.kind; });
      assert(kinds.indexOf('depth') >= 0 && kinds.indexOf('sdim') >= 0, 'depth and sketch dimensions with Instant3D off: ' + kinds.join());
      UI.drawDims();   // (anvil.instant3D() redraws the arrows alone, without the values written beside them)
      var texts = Array.prototype.map.call(D.querySelectorAll('#i3d-layer .i3d-dim-text'), function (t) { return t.textContent; });
      assert(texts.indexOf('3.000 [76.20]') >= 0 && texts.indexOf('2.000 [50.80]') >= 0, 'sketch dimensions with duals: ' + texts.join(' | '));
      var dt = D.querySelector('#i3d-layer g.i3d[data-kind="depth"] .pe-fdim');
      assert(dt && dt.textContent === '1.000 [25.40]', 'the depth with its dual: ' + (dt && dt.textContent));
      D.body.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await idle(); await rfPJframe();
      assert(UI.featureDimsShown() == null && !anvil.instant3D().handles.length, 'Esc hid them');
      UI.App.sel = { kind: 'feature', id: ex.id }; UI.updateHighlights();
      assert(!anvil.instant3D().handles.length, 'a plain selection: no arrows with Instant3D off');
      UI.toggleInstant3D(true);
      assert(anvil.instant3D().handles.some(function (h) { return h.kind === 'depth'; }), 'Instant3D on: the arrows');
      UI.App.sel = null; UI.updateHighlights();
      // saved with the part
      var json = JSON.stringify(anvil.model());
      await anvil.newPart(); await idle();
      await anvil.load(json); await idle();
      assert(JSON.stringify(UI.App.model.dualDimensions) === '{"on":true}', 'saved and opened: ' + JSON.stringify(UI.App.model.dualDimensions));
    } finally { UI.toggleInstant3D(wasOn); }
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return 'dual on Instant3D texts; Instant3D left off';
  });
