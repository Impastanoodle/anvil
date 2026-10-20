  // --- rfCV (2026-10-20, lane CV: Sketch tab gaps, real mouse events) --- right-click a sketch text ▸ Dissolve Sketch
  // Text, right-click a dimension ▸ Link Values… / Unlink Value (Shared Values dialog, ∞ before the value, linked values
  // follow each other and go to the part's other sketches when the sketch is left), right-click a spline ▸ Show
  // Minimum Radius, Tools ▸ Sketch Settings ▸ Create dimension only when value is entered, Tools ▸ Sketch Tools order.
  // Uses trimSketch (r13-trim13), rskNew / rskScr / rskClick (refine-sketcher), selEv / selKey (selection), r3sType /
  // r3sKey (r3-sketch3), menuRows / clickModalButton (ui-smoke).
  function rfCVRight(p, target) {   // a right-button press and release at screen point p (the sketch menu opens on the press)
    var r = $('viewport').getBoundingClientRect(), o = { bubbles: true, cancelable: true, button: 2, buttons: 2, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) };
    selEv('mousemove', p);
    (target || $('viewport')).dispatchEvent(new W.MouseEvent('mousedown', o));
    W.dispatchEvent(new W.MouseEvent('mouseup', Object.assign({}, o, { buttons: 0 })));
  }
  function rfCVRel(a, b, rel, label) { near(a, b, Math.abs(b) * rel + 1e-12, label); }
  function rfCVMenu() { var ms = D.querySelectorAll('body > .menu'), m = ms[ms.length - 1]; return m ? Array.prototype.slice.call(m.querySelectorAll('.mi')) : []; }
  function rfCVRow(label) {
    var row = rfCVMenu().filter(function (x) { return x.textContent.indexOf(label) >= 0; })[0];
    assert(row, 'menu row "' + label + '" (have: ' + rfCVMenu().map(function (x) { return x.textContent; }).join(' | ') + ')');
    return row;
  }
  function rfCVClickRow(label) { var row = rfCVRow(label); row.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true })); row.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true })); row.click(); }
  function rfCVDimText(f, index) {   // the label <text> of placed dimension `index` in the dimension layer
    UI.App.dimsStale = true; UI.drawDims(true);
    return Array.prototype.filter.call(D.querySelectorAll('#dim-layer g.dim text'), function (t) { return t._d && !t._d.auto && t._d.rel == null && t._d.index === index; })[0];
  }

  step('rfCV: right-click a Cut sketch text ▸ Dissolve Sketch Text — the text becomes lines and arcs with the same outline (the profile\'s exact area unchanged), selected; one Ctrl+Z brings the text back', async function () {
    var txt = { t: 'text', x: 0, y: 0, str: 'AB', h: 20, mode: 'outline', strokeWidth: 2.4, layer: '0' };
    var f = await trimSketch([txt]);
    UI.zoomView(0.1 / UI.cam.scale); UI.App.gridStale = true; UI.updateSketches(); await idle();
    function exact(sk) {   // the profile's exact area: chords plus the circular segments of the chords on true arcs
      var P = K.sketchProfile(sk), tot = 0;
      P.loops.forEach(function (l) {
        var a = Math.abs(K.signedArea(l.pts));
        if (l.seg) l.seg.forEach(function (k, i) {
          if (k < 0) return;
          var C = P.curves[k], p = l.pts[i], q = l.pts[(i + 1) % l.pts.length], th = 2 * Math.asin(Math.min(1, Math.hypot(q[0] - p[0], q[1] - p[1]) / (2 * C.r)));
          var cr = (q[0] - p[0]) * (C.c[1] - p[1]) - (q[1] - p[1]) * (C.c[0] - p[0]);
          a += (cr > 0 ? 1 : -1) * C.r * C.r / 2 * (th - Math.sin(th));
        });
        tot += (l.hole ? -1 : 1) * a;
      });
      return tot;
    }
    var a0 = exact(f), on = K.textOutline(f.entities[0]).loops[0].pts[0];
    rfCVRight(rskScr(on)); await idle();
    rfCVClickRow('Dissolve Sketch Text'); await idle();
    f = UI.activeSketchFeature();
    assert(f.entities.length > 8 && f.entities.every(function (e) { return e.t === 'line' || e.t === 'arc' || e.t === 'circle'; }), 'only lines / arcs / circles: ' + JSON.stringify(f.entities.map(function (e) { return e.t; })));
    rfCVRel(exact(f), a0, 1e-6, 'profile area after dissolving');
    assert(!K.sketchProfile(f).warnings.length, 'closed loops, no warnings: ' + JSON.stringify(K.sketchProfile(f).warnings));
    assert(UI.selection().length === f.entities.length, 'the new entities are selected: ' + UI.selection().length);
    assert(/dissolved/.test(statusText()), 'status: ' + statusText());
    UI.undo(); await idle();
    f = UI.activeSketchFeature();
    assert(f.entities.length === 1 && f.entities[0].t === 'text', 'one Ctrl+Z restores the text: ' + JSON.stringify(f.entities.map(function (e) { return e.t; })));
    return 'area ' + a0.toFixed(4);
  });

  step('rfCV: right-click a dimension ▸ Link Values… — the Shared Values dialog links two line lengths as "W" (the second takes the first\'s value), ∞ before both values; changing one in the Modify box changes both; Unlink Value frees one', async function () {
    var f = await trimSketch([{ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'line', x1: 0, y1: 20, x2: 50, y2: 20 }]);
    f.dims = [{ e: 0, k: 'len', off: 5 }, { e: 1, k: 'len', off: 5 }];
    UI.App.dimsStale = true; UI.updateSketches(); await idle();
    var t0 = rfCVDimText(f, 0);
    assert(t0, 'the first dimension is drawn');
    var b = t0.getBoundingClientRect(), r = $('viewport').getBoundingClientRect();
    rfCVRight([b.left + b.width / 2 - r.left, b.top + b.height / 2 - r.top], t0); await idle();
    rfCVClickRow('Link Values'); await idle();
    assert(modalOpen() && $('lv-name'), 'Shared Values dialog open');
    $('lv-name').value = 'W'; clickModalButton('OK'); await idle();
    assert(!modalOpen(), 'dialog closed');
    var t1 = rfCVDimText(f, 1);
    b = t1.getBoundingClientRect();
    rfCVRight([b.left + b.width / 2 - r.left, b.top + b.height / 2 - r.top], t1); await idle();
    rfCVClickRow('Link Values'); await idle();
    assert($('lv-name').value === 'W' && /W/.test($('lv-names').innerHTML), 'the name W is offered: ' + $('lv-name').value);
    clickModalButton('OK'); await idle();
    f = UI.activeSketchFeature();
    assert(f.dims[0].link === 'W' && f.dims[1].link === 'W', 'both linked: ' + JSON.stringify(f.dims));
    near(K.dimValue(f.entities[1], f.dims[1]), 30, 1e-9, 'the second takes the first\'s value');
    assert(/^∞/.test(rfCVDimText(f, 0).textContent) && /^∞/.test(rfCVDimText(f, 1).textContent), 'linked labels start with ∞: ' + rfCVDimText(f, 0).textContent);
    UI.openDimEdit(1); await idle();
    var inp = $('dim-edit').querySelector('input');
    r3sType(inp, '42'); r3sKey(inp, 'Enter'); await idle();
    if (!$('dim-edit').hidden) { r3sKey(inp, 'Enter'); await idle(); }
    f = UI.activeSketchFeature();
    near(K.dimValue(f.entities[0], f.dims[0]), 42, 1e-9, 'the first follows the Modify box');
    near(K.dimValue(f.entities[1], f.dims[1]), 42, 1e-9, 'the second is 42');
    t0 = rfCVDimText(f, 0); b = t0.getBoundingClientRect();
    rfCVRight([b.left + b.width / 2 - r.left, b.top + b.height / 2 - r.top], t0); await idle();
    rfCVClickRow('Unlink Value'); await idle();
    f = UI.activeSketchFeature();
    assert(f.dims[0].link == null && f.dims[1].link === 'W', 'the first is unlinked: ' + JSON.stringify(f.dims));
    assert(!/^∞/.test(rfCVDimText(f, 0).textContent), 'no ∞ after unlinking');
    return 'linked, 42, unlinked';
  });

  step('rfCV: Link Values across sketches — two sketches with lengths linked as "T": changing it in Sketch1 and leaving the sketch changes Sketch2\'s line too', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('var s1 = p.sketch("Front").line(0, 0, 10, 0).dim(0, "len").dimProps([[0, { link: "T" }]]).end(); var s2 = p.sketch("Top").line(0, 0, 10, 0).line(0, 5, 3, 5).dim(0, "len").dimProps([[0, { link: "T" }]]).end();'); await idle();
    var sk = UI.App.model.features.filter(function (g) { return g.type === 'sketch'; });
    assert(sk.length === 2 && sk[1].dims[0].link === 'T', 'two sketches, linked: ' + JSON.stringify(sk.map(function (g) { return g.dims; })));
    await UI.enterSketch(sk[0].id); await idle();
    var f = UI.activeSketchFeature();
    UI.openDimEdit(0); await idle();
    var inp = $('dim-edit').querySelector('input');
    r3sType(inp, '16'); r3sKey(inp, 'Enter'); await idle();
    if (!$('dim-edit').hidden) { r3sKey(inp, 'Enter'); await idle(); }
    near(K.dimValue(f.entities[0], f.dims[0]), 16, 1e-9, 'Sketch1 line 16');
    await UI.exitSketch(); await idle();
    sk = UI.App.model.features.filter(function (g) { return g.type === 'sketch'; });
    near(K.dimValue(sk[1].entities[0], sk[1].dims[0]), 16, 1e-9, 'Sketch2 follows when Sketch1 is left');
    near(sk[1].entities[1].x2, 3, 1e-12, 'Sketch2\'s other line is untouched');
    return 'Sketch2 line ' + K.dimValue(sk[1].entities[0], sk[1].dims[0]);
  });

  step('rfCV: right-click a spline ▸ Show Minimum Radius — a read-only "Min R" label with a leader at the tightest point (its value the true minimum radius, 1e-6); it follows the spline when a point moves; the same row turns it off', async function () {
    var f = await trimSketch([{ t: 'spline', pts: [[0, 0], [20, 15], [40, 0], [60, 10]] }]);
    UI.zoomView(0.25 / UI.cam.scale); UI.App.gridStale = true; UI.updateSketches(); await idle();
    function brute(e) {   // the minimum radius by dense sampling of the spline's spans (curvature of each Bézier span)
      var g = K.splineGeom(e), best = 0;
      g.bez.forEach(function (P) {
        var D = []; for (var i = 0; i + 1 < P.length; i++) D.push([(P.length - 1) * (P[i + 1][0] - P[i][0]), (P.length - 1) * (P[i + 1][1] - P[i][1])]);
        for (var q = 0; q <= 20000; q++) { var s = q / 20000, a = K.bzPoint(D, s), d2 = K.bzDeriv(D, s), L = Math.hypot(a[0], a[1]), k = Math.abs(a[0] * d2[1] - a[1] * d2[0]) / (L * L * L); if (k > best) best = k; }
      });
      return 1 / best;
    }
    var onS = K.splineGeom(f.entities[0]).bez[0], p = K.bzPoint(onS, 0.5);
    rfCVRight(rskScr(p)); await idle();
    rfCVClickRow('Show Minimum Radius'); await idle();
    f = UI.activeSketchFeature();
    assert(f.entities[0].showMinRadius === true, 'flag set');
    var m = UI.splineMinRadius(f.entities[0]);
    rfCVRel(m.r, brute(f.entities[0]), 1e-6, 'minimum radius');
    var labels = UI.splineMinRadiusLabels();
    assert(labels.length === 1 && /^Min R/.test(labels[0]), 'one Min R label: ' + JSON.stringify(labels));
    assert(D.querySelectorAll('#dim-layer .sp-minr line').length === 1, 'with a leader');
    f.entities[0].pts[1] = [20, 30]; UI.App.dimsStale = true; UI.updateSketches(); await idle();
    var labels2 = UI.splineMinRadiusLabels();
    assert(labels2.length === 1 && labels2[0] !== labels[0], 'the label follows the spline: ' + labels[0] + ' -> ' + labels2[0]);
    rfCVRel(UI.splineMinRadius(f.entities[0]).r, brute(f.entities[0]), 1e-6, 'minimum radius after the change');
    rfCVRight(rskScr(K.bzPoint(K.splineGeom(f.entities[0]).bez[0], 0.5))); await idle();
    assert(/✓|✔/.test(rfCVRow('Show Minimum Radius').textContent) || rfCVRow('Show Minimum Radius').querySelector('.chk'), 'the row shows it is on');
    rfCVClickRow('Show Minimum Radius'); await idle();
    assert(!UI.activeSketchFeature().entities[0].showMinRadius && UI.splineMinRadiusLabels().length === 0, 'turned off');
    return labels[0] + ' -> ' + labels2[0];
  });

  step('rfCV: Tools ▸ Sketch Settings ▸ Create dimension only when value is entered — with the numeric input on, a line drawn by two clicks gets no dimension and a typed length gets one; off, the clicked line is dimensioned as before', async function () {
    var wasNum = UI.sketchNumericInput(), wasOnly = UI.sketchSettings.get('dimOnlyTyped');
    try {
      UI.sketchNumericInput(true); UI.sketchSettings.set('dimOnlyTyped', false);
      await rskNew();
      var rows = menuRows('Create dimension only when value is entered');
      assert(rows.length === 1 && rows[0].menu.indexOf('Tools') >= 0, 'the Tools menu row: ' + JSON.stringify(rows.map(function (x) { return x.menu + ':' + x.text; })));
      rows[0].row.click(); if (UI.closeMenus) UI.closeMenus(); await idle();
      assert(UI.sketchSettings.get('dimOnlyTyped') === true, 'the menu row turned it on');
      var f = UI.activeSketchFeature();
      UI.setTool('line'); rskClick([0, 0]); rskClick([20, 0]); selKey('Escape'); selKey('Escape'); await idle();
      assert(f.entities.length === 1 && !(f.dims || []).length, 'clicked line: no dimension: ' + JSON.stringify(f.dims));
      UI.setTool('line'); rskClick([0, 10]);
      selEv('mousemove', rskScr([8, 10.2]));
      selKey('1');
      var box = UI.sketchNumBox();
      assert(box && box.length >= 1, 'the numeric box is open');
      r3sType(box[0], '25'); r3sKey(box[0], 'Enter'); selKey('Escape'); selKey('Escape'); await idle();
      f = UI.activeSketchFeature();
      var typed = (f.dims || []).filter(function (d) { return d.e === 1; });
      assert(f.entities.length === 2 && typed.length === 1 && typed[0].k === 'len', 'typed length: one dimension: ' + JSON.stringify(f.dims));
      UI.sketchSettings.set('dimOnlyTyped', false);
      UI.setTool('line'); rskClick([0, 30]); rskClick([20, 30]); selKey('Escape'); selKey('Escape'); await idle();
      f = UI.activeSketchFeature();
      assert((f.dims || []).some(function (d) { return d.e === 2; }), 'setting off: the clicked line is dimensioned: ' + JSON.stringify(f.dims));
      return 'dims ' + JSON.stringify(f.dims.map(function (d) { return d.e + d.k; }));
    } finally { UI.sketchNumericInput(wasNum); UI.sketchSettings.set('dimOnlyTyped', wasOnly); UI.setTool('select'); }
  });

  step('rfCV: Tools ▸ Sketch Tools in SolidWorks 2024\'s order (Convert, Intersection Curve, Segment, Offset, Trim, Extend, Split, …, Jog Line, Construction, Mirror, Dynamic Mirror, Stretch, Move, Rotate, Scale, Copy, patterns, Repair, SketchXpert, Modify, Check Sketch, Sketch Picture); Fillet / Chamfer under Sketch Entities', async function () {
    await rskNew();
    var labels = UI.menuModel ? [] : null;
    var tools = null;
    (function walk(items) { (items || []).forEach(function (it) { if (it.items) { if (it.label === 'Tools') tools = it.items; walk(it.items); } }); })(UI.menuModel ? UI.menuModel() : []);
    assert(tools, 'the Tools menu model');
    labels = tools.filter(function (it) { return it.label && /^Sketch Tools ▸ /.test(it.label); }).map(function (it) { return it.label.replace(/^Sketch Tools ▸ /, ''); });
    var want = ['Convert Entities', 'Intersection Curve', 'Segment', 'Offset Entities', 'Trim Entities', 'Extend Entities', 'Split Entities', 'Jog Line', 'Construction Geometry', 'Mirror Entities', 'Dynamic Mirror', 'Stretch Entities', 'Move Entities', 'Rotate Entities', 'Scale Entities', 'Copy Entities', 'Linear Sketch Pattern', 'Circular Sketch Pattern', 'Repair Sketch', 'SketchXpert', 'Modify', 'Check Sketch for Feature', 'Sketch Picture'];
    var at = want.map(function (w) { for (var i = 0; i < labels.length; i++) if (labels[i].indexOf(w) === 0) return i; return -1; });
    assert(at.every(function (i) { return i >= 0; }), 'every row present: ' + JSON.stringify(want.filter(function (w, k) { return at[k] < 0; })) + ' in ' + JSON.stringify(labels));
    for (var k = 1; k < at.length; k++) assert(at[k] > at[k - 1], want[k] + ' comes after ' + want[k - 1] + ': ' + JSON.stringify(labels));
    var ent = tools.filter(function (it) { return it.label && /^Sketch Entities ▸ /.test(it.label); }).map(function (it) { return it.label; }).join(' | ');
    assert(/Fillet/.test(ent) && /Chamfer/.test(ent) && !labels.some(function (l) { return /Fillet|Chamfer/.test(l); }), 'Fillet / Chamfer under Sketch Entities only');
    return labels.length + ' Sketch Tools rows';
  });

  step('rfCV: use as a SolidWorks user — dissolve an Etch text (its strokes land on the ETCH layer, made if missing, and make no profile); Ctrl+Z / Ctrl+Y undo and redo the dissolve; the dissolved sketch saves and reloads as plain entities', async function () {
    var f = await trimSketch([{ t: 'rect', x: -10, y: -10, w: 80, h: 40 }, { t: 'text', x: 0, y: 0, str: 'OK', h: 20, layer: 'ETCH' }]);
    delete f.layers; UI.zoomView(0.1 / UI.cam.scale); UI.App.gridStale = true; UI.updateSketches(); await idle();
    UI.setSelection([{ kind: 'entity', index: 1 }]);
    var idx = UI.dissolveSketchText(); await idle();
    f = UI.activeSketchFeature();
    assert(idx && idx.length > 3 && f.entities[0].t === 'rect' && f.entities.slice(1).every(function (e) { return e.layer === 'ETCH'; }), 'strokes on ETCH after the rect: ' + JSON.stringify(f.entities.map(function (e) { return e.t + ':' + e.layer; })));
    assert((f.layers || []).some(function (l) { return l.name === 'ETCH' && l.noProfile; }), 'the ETCH layer was added (no profile): ' + JSON.stringify(f.layers));
    var P = K.sketchProfile(f);
    assert(P.loops.length === 1 && !P.warnings.length, 'only the rectangle is a profile: ' + P.loops.length + ' ' + JSON.stringify(P.warnings));
    var n1 = f.entities.length;
    UI.undo(); await idle();
    assert(UI.activeSketchFeature().entities.some(function (e) { return e.t === 'text'; }), 'undo brings the text back');
    UI.redo(); await idle();
    f = UI.activeSketchFeature();
    assert(f.entities.length === n1 && !f.entities.some(function (e) { return e.t === 'text'; }), 'redo dissolves again: ' + f.entities.length);
    await UI.exitSketch(); await idle();
    await anvil.load(anvil.model()); await idle();
    var sk = UI.App.model.features.filter(function (g) { return g.type === 'sketch'; })[0];
    assert(sk && sk.entities.length === n1 && sk.entities.slice(1).every(function (e) { return e.layer === 'ETCH' && e.t !== 'text'; }), 'reloaded as plain entities');
    var code = anvil.script();
    assert(!/\.text\(/.test(code) && /\.layer\("ETCH"/.test(code), 'the script writes plain entities on ETCH: ' + code.slice(0, 300));
    return n1 + ' entities';
  });

  step('rfCV: use as a SolidWorks user — right-click a two-entity distance ▸ Link Values with an empty name is refused in the dialog (it stays open); linked with a circle\'s Ø as "D", the Modify box on the Ø moves the distance too', async function () {
    var f = await trimSketch([{ t: 'line', x1: 0, y1: 0, x2: 0, y2: 20 }, { t: 'circle', cx: 30, cy: 10, r: 4 }],
      [{ type: 'distance', refs: ['0', '1.c'], v: 30, dir: 'h' }]);
    f.dims = [{ e: 1, k: 'dia', ang: 45 }];
    UI.App.dimsStale = true; UI.updateSketches(); await idle();
    UI.App.dimsStale = true; UI.drawDims(true);
    var tr = Array.prototype.filter.call(D.querySelectorAll('#dim-layer g.dim text'), function (t) { return t._d && t._d.rel === 0; })[0];
    assert(tr, 'the distance label is drawn');
    var b = tr.getBoundingClientRect(), r = $('viewport').getBoundingClientRect();
    rfCVRight([b.left + b.width / 2 - r.left, b.top + b.height / 2 - r.top], tr); await idle();
    rfCVClickRow('Link Values'); await idle();
    $('lv-name').value = '  '; clickModalButton('OK'); await idle();
    assert(modalOpen() && /name/i.test($('lv-msg').textContent), 'empty name refused: ' + $('lv-msg').textContent);
    $('lv-name').value = 'D'; clickModalButton('OK'); await idle();
    assert(!modalOpen() && UI.activeSketchFeature().rels[0].link === 'D', 'distance linked');
    var t0 = rfCVDimText(UI.activeSketchFeature(), 0); b = t0.getBoundingClientRect();
    rfCVRight([b.left + b.width / 2 - r.left, b.top + b.height / 2 - r.top], t0); await idle();
    rfCVClickRow('Link Values'); await idle();
    $('lv-name').value = 'D'; clickModalButton('OK'); await idle();
    f = UI.activeSketchFeature();
    near(f.entities[1].r * 2, 30, 1e-9, 'the Ø takes the shared 30');
    UI.openDimEdit(0); await idle();
    var inp = $('dim-edit').querySelector('input');
    r3sType(inp, '12'); r3sKey(inp, 'Enter'); await idle();
    if (!$('dim-edit').hidden) { r3sKey(inp, 'Enter'); await idle(); }
    f = UI.activeSketchFeature();
    near(f.entities[1].r * 2, 12, 1e-9, 'Ø 12'); near(f.rels[0].v, 12, 1e-12, 'distance 12');
    near(Math.abs(f.entities[1].cx - f.entities[0].x1), 12, 1e-6, 'the circle moved to 12 from the line (solver tolerance)');
    return 'Ø and distance linked';
  });

  step('rfCV: use as a SolidWorks user — Show Minimum Radius on a closed spline through a circle\'s points (min R near the circle\'s), a straight two-point spline (no label, says so) and a style spline; Ctrl+Z turns it off again', async function () {
    var pts = []; for (var k = 0; k < 8; k++) pts.push([10 * Math.cos(k * Math.PI / 4), 10 * Math.sin(k * Math.PI / 4)]);
    var f = await trimSketch([{ t: 'spline', pts: pts, closed: true }, { t: 'spline', pts: [[20, 0], [40, 0]] }, { t: 'spline', style: true, pts: [[50, 0], [55, 10], [65, 10], [70, 0]] }]);
    UI.cmdShowMinimumRadius(0); await idle();
    var m = UI.splineMinRadius(UI.activeSketchFeature().entities[0]);
    assert(m && m.r > 9 && m.r < 10, 'closed spline: min R a little under the circle\'s 10 (it bulges between the points): ' + (m && m.r));
    UI.cmdShowMinimumRadius(1); await idle();
    assert(/straight/.test(statusText()) && UI.splineMinRadius(UI.activeSketchFeature().entities[1]) === null, 'straight spline: ' + statusText());
    UI.cmdShowMinimumRadius(2); await idle();
    var ms = UI.splineMinRadius(UI.activeSketchFeature().entities[2]);
    assert(ms && ms.r > 0 && isFinite(ms.r), 'style spline: ' + JSON.stringify(ms));
    assert(UI.splineMinRadiusLabels().length === 2, 'two labels (the straight spline has none): ' + JSON.stringify(UI.splineMinRadiusLabels()));
    UI.undo(); await idle();
    assert(!UI.activeSketchFeature().entities[2].showMinRadius && UI.splineMinRadiusLabels().length === 1, 'undo turns the last one off');
    return 'closed R' + m.r.toFixed(3) + ', style R' + ms.r.toFixed(3);
  });

  step('rfCV: use as a SolidWorks user — a sketch only opened and left never pushes its older shared value over another sketch\'s (Sketch1 T = 10, Sketch2 T = 12: open / leave Sketch1, Sketch2 keeps 12); Ctrl+Z after an edit that went across sketches restores both', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.sketch("Front").line(0, 0, 10, 0).dim(0, "len").dimProps([[0, { link: "T" }]]).end(); p.sketch("Top").line(0, 0, 12, 0).dim(0, "len").dimProps([[0, { link: "T" }]]).end();'); await idle();
    var sk = UI.App.model.features.filter(function (g) { return g.type === 'sketch'; });
    await UI.enterSketch(sk[0].id); await idle();
    await UI.exitSketch(); await idle();
    sk = UI.App.model.features.filter(function (g) { return g.type === 'sketch'; });
    near(sk[1].entities[0].x2, 12, 1e-12, 'Sketch2 keeps 12');
    await UI.enterSketch(sk[0].id); await idle();
    UI.openDimEdit(0); await idle();
    var inp = $('dim-edit').querySelector('input');
    r3sType(inp, '14'); r3sKey(inp, 'Enter'); await idle();
    if (!$('dim-edit').hidden) { r3sKey(inp, 'Enter'); await idle(); }
    await UI.exitSketch(); await idle();
    sk = UI.App.model.features.filter(function (g) { return g.type === 'sketch'; });
    near(sk[1].entities[0].x2, 14, 1e-9, 'Sketch2 follows the edit');
    UI.undo(); await idle();
    sk = UI.App.model.features.filter(function (g) { return g.type === 'sketch'; });
    near(sk[0].entities[0].x2, 10, 1e-9, 'undo: Sketch1 back to 10');
    near(sk[1].entities[0].x2, 12, 1e-9, 'undo: Sketch2 back to 12');
    return 'stale push avoided, undo restores both';
  });

  step('rfCV2: Create dimension only when value is entered holds for the Tangent Arc and the 3 Point Arc Slot too — on, arcs and slots drawn by clicks get no dimensions; off (numeric input on), the arc gets its radius and the slot its dimensions as before', async function () {
    var wasNum = UI.sketchNumericInput(), wasOnly = UI.sketchSettings.get('dimOnlyTyped');
    function nDims(f) { return (f.dims || []).length + (f.rels || []).filter(function (r) { return r.v != null; }).length; }
    async function draw(only) {
      UI.sketchSettings.set('dimOnlyTyped', only);
      await rskNew();
      var f = UI.activeSketchFeature();
      UI.setTool('line'); rskClick([0, 0]); rskClick([20, 0]); selKey('Escape'); selKey('Escape'); await idle();
      var n0 = nDims(f);
      UI.setTool('tarc'); rskClick([20, 0]); selEv('mousemove', rskScr([25, 2])); selEv('mousemove', rskScr([30, 10])); rskClick([30, 10]); selKey('Escape'); selKey('Escape'); await idle();
      f = UI.activeSketchFeature();
      var arc = f.entities.filter(function (e) { return e.t === 'arc'; }).length, n1 = nDims(f);
      UI.setTool('aslot3'); rskClick([-50, -10]); rskClick([-30, -10]); selEv('mousemove', rskScr([-40, 0])); rskClick([-40, 0]);
      selEv('mousemove', rskScr([-40, 1.5])); rskClick([-40, 1.5]); selKey('Escape'); selKey('Escape'); await idle();
      f = UI.activeSketchFeature();
      return { arc: arc, arcDims: n1 - n0, slotEnts: f.entities.length, slotDims: nDims(f) - n1, lineDims: n0 };
    }
    try {
      UI.sketchNumericInput(true);
      var on = await draw(true), off = await draw(false);
      assert(on.arc === 1 && off.arc === 1, 'a tangent arc each time: ' + JSON.stringify([on, off]));
      assert(on.lineDims === 0 && on.arcDims === 0 && on.slotDims === 0, 'setting on: no dimensions from clicks: ' + JSON.stringify(on));
      assert(off.arcDims >= 1 && off.slotDims >= 1, 'setting off: the arc and the slot are dimensioned: ' + JSON.stringify(off));
      return 'on ' + JSON.stringify(on) + ' off ' + JSON.stringify(off);
    } finally { UI.sketchNumericInput(wasNum); UI.sketchSettings.set('dimOnlyTyped', wasOnly); UI.setTool('select'); }
  });
