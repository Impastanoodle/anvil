  // ---- rfL (lane L, 2026-10-12): Edit Polygon, Smart Dimension leftovers, ordinate edits, dimension label placement
  function rfLTypes(list) { return list.map(function (e) { return e.t + (e.construction ? '(c)' : ''); }).join(','); }
  function rfLMenuClick(label) { var it = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return m.textContent.indexOf(label) >= 0; })[0]; if (it) it.click(); return !!it; }
  step('rfL: Edit Polygon — right-click a side of a placed hexagon: Edit Polygon opens the Polygon PM with its parameters (6 sides, circumscribed, centre, Ø, angle); Circle diameter and Number of sides edit that polygon (its Polygon relation, the circle kept); Line Properties of a side has Edit Polygon too; a plain line has neither', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.sketchCurveOptions({ sides: 6, ins: false, slotDims: false, overall: false });
    try {
      UI.setTool('polygon'); rskClick([0, 0]); rskClick([10, 0]);
      selKey('Escape'); UI.setTool('select'); UI.closePM();
      var f = UI.activeSketchFeature();
      f.entities.push({ t: 'line', x1: 30, y1: -20, x2: 50, y2: -20 }); UI.updateSketches();
      assert(rfLTypes(f.entities) === 'line,line,line,line,line,line,circle(c),line', 'hexagon and a line: ' + rfLTypes(f.entities));
      var mid = [(f.entities[1].x1 + f.entities[1].x2) / 2, (f.entities[1].y1 + f.entities[1].y2) / 2], pm = rskScr(mid);
      UI.sketchMenu(pm[0], pm[1]);
      var rows = rfcMenu();
      var ie = rows.findIndex(function (t) { return t.indexOf('Edit Polygon') >= 0; }), ip = rows.findIndex(function (t) { return t.indexOf('Properties') >= 0; });
      assert(ie >= 0 && ip === ie + 1, 'Edit Polygon right before Properties…: ' + rows.join(' | '));
      rfLMenuClick('Edit Polygon');
      var v = UI.pmSpec() && UI.pmSpec().values;
      assert(UI.pmTitle() === 'Polygon' && v.n === 6 && v.ins === 'circ' && v.dia === 20 && v.cx === 0 && v.cy === 0, 'the Polygon PM shows the hexagon: ' + UI.pmTitle() + ' ' + JSON.stringify(v));
      assert(UI.App.tool === 'select' || !UI.App.tool, 'no drawing tool active: ' + UI.App.tool);
      var u0 = UI.App.undo.length;
      UI.pmSetField('dia', '40');
      near(f.entities[6].r, 20, 1e-9, 'Ø40 circle');
      f.entities.slice(0, 6).forEach(function (l, k) { near(Math.hypot(l.x1, l.y1), 20, 1e-9, 'corner ' + k + ' on the Ø40 circle'); });
      UI.pmSetField('n', '8');
      assert(rfLTypes(f.entities) === 'line,line,line,line,line,line,line,line,circle(c),line', 'eight sides, the circle kept, the other line after it: ' + rfLTypes(f.entities));
      assert((f.rels || []).some(function (r) { return r.type === 'polygon' && r.refs.join('/') === '8/0/1/2/3/4/5/6/7'; }), 'the Polygon relation ties the 8 sides: ' + JSON.stringify(f.rels));
      f.entities.slice(0, 8).forEach(function (l, k) { near(Math.hypot(l.x1, l.y1), 20, 1e-6, 'octagon corner ' + k); });
      D.querySelector('#pm input[type=radio][data-key="ins:ins"]').click();
      near(f.entities[8].r, 20, 1e-9, 'the circle keeps Ø40');
      var rIn = f.entities[8].r;
      f.entities.slice(0, 8).forEach(function (l, k) { near(Math.hypot((l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2), rIn, 1e-6, 'inscribed: side ' + k + ' touches the circle'); });
      assert(UI.App.undo.length >= u0 + 1, 'undoable');
      assert(UI.sketchCurveOptions().sides === 6 && UI.sketchCurveOptions().ins === false, 'the tool\'s remembered options untouched: ' + JSON.stringify(UI.sketchCurveOptions()));
      await UI.pmOK();
      UI.openEntityPM(2);
      assert(UI.pmTitle() === 'Line Properties' && pmButton('Edit Polygon'), 'Line Properties of a side has Edit Polygon');
      pmButton('Edit Polygon').click();
      assert(UI.pmTitle() === 'Polygon' && UI.pmSpec().values.n === 8 && UI.pmSpec().values.ins === 'ins', 'Edit Polygon from Line Properties: ' + JSON.stringify(UI.pmSpec().values));
      UI.closePM();
      UI.openEntityPM(9);
      assert(UI.pmTitle() === 'Line Properties' && !pmButton('Edit Polygon'), 'a plain line has no Edit Polygon');
      UI.closePM();
      var pl = rskScr([40, -20]);
      UI.sketchMenu(pl[0], pl[1]);
      assert(!rfcMenu().some(function (t) { return t.indexOf('Edit Polygon') >= 0; }), 'no Edit Polygon on a plain line: ' + rfcMenu().join(' | '));
      UI.closeMenus();
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'hexagon -> inscribed octagon Ø40';
    } finally { UI.sketchCurveOptions({ sides: 6, ins: true }); }
  });
  step('rfL: an angle dimension being placed between two lines follows the cursor — its arc radius and the label\'s place round the arc (ta) change with every move, snapping to the arc\'s middle near it; the quadrant follows too', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 20, y2: 20 });
    UI.updateSketches();
    UI.setTool('dimension');
    rskClick([20, 0]); rskClick([10, 10]);
    var seen = [];
    [[25, 8], [18, 14], [8, 16], [-10, 5]].forEach(function (p) { selEv('mousemove', rskScr(p)); var t = UI.App.tempRelDim; seen.push(t ? { ta: t.ta, off: t.off, sup: !!t.sup, q: t.q } : null); });
    selKey('Escape'); UI.setTool('select');
    assert(seen.every(Boolean), 'an angle preview at every move: ' + JSON.stringify(seen));
    near(seen[0].off, Math.hypot(25, 8), 0.5, 'arc radius at the cursor');
    assert(seen[0].ta == null, 'near the arc\'s middle the label snaps there: ' + JSON.stringify(seen[0]));
    assert(seen[1].ta > 5 && seen[2].ta < -5 && seen[1].ta !== seen[2].ta, 'the label follows round the arc: ' + JSON.stringify(seen));
    assert(seen[3].sup && !seen[0].sup, 'beside a line: the supplement: ' + JSON.stringify(seen));
    return 'ta ' + seen.map(function (x) { return x.ta; }).join(' / ');
  });
  step('rfL: a Ø dimension whose 45° leader would cross another dimension label turns to a free angle (no `ang` set by the user), and a layout is never left with more labels on other lines than the plain 45° one', async function () {
    var errs0 = errors.length;
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'circle', cx: 0, cy: 0, r: 1.5 }, { t: 'circle', cx: 5, cy: 0, r: 1.5 }, { t: 'circle', cx: 10, cy: 0, r: 1.5 });
    f.dims = [{ e: 0, k: 'dia' }, { e: 1, k: 'dia' }, { e: 2, k: 'dia' }];
    f.rels = [{ type: 'distance', dir: 'h', refs: ['0.c', '1.c'], v: 5, off: 4 }, { type: 'distance', dir: 'h', refs: ['1.c', '2.c'], v: 5, off: 4 }];
    async function rfLLay(turned) {
      f.dims.forEach(function (d) { if (turned) d.ang = 45; else delete d.ang; });
      UI.updateSketches(); await new Promise(function (r) { setTimeout(r, 300); }); UI.drawDims(true);
      return UI.dimLabelClashes();
    }
    var seen = [];
    for (var zs = [0.12, 0.15, 0.2, 0.25], k = 0; k < zs.length; k++) {
      UI.zoomView(zs[k] / UI.cam.scale);
      var at45 = await rfLLay(true), free = await rfLLay(false);
      seen.push(zs[k] + ': ' + at45 + '→' + free);
      assert(free <= at45, 'never worse than 45° at ' + zs[k] + ' mm/px: ' + at45 + ' → ' + free + ' (' + UI.dimLabelClashes(true).join(', ') + ')');
      if (zs[k] === 0.12) assert(at45 > 0 && free === 0, 'at 0.12 mm/px the 45° leaders cross a neighbour and the turned ones are clear: ' + at45 + ' → ' + free);
    }
    assert(f.dims.every(function (d) { return d.ang == null; }), 'the model is not changed (the turn is layout only)');
    await UI.exitSketch(true); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return seen.join(' · ');
  });
  // ---- end rfL
