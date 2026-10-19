  // --- rfCR (2026-10-19, lane CR: Sketch tab items, real mouse events) --- typed dimensions placed outside a closed
  // outline and further off the line (user report #12), Equal Curve Length through Add Relations / Display-Delete
  // Relations, Replace Entity from the sketch right-click menu. Uses trimSketch (r13-trim13), rskNew / rskScr /
  // rskClick / rskEnts (refine-sketcher), selEv / selDrag (selection), clickPmButton / pmField (ui-smoke).
  function crAnchor(e, d) {   // the middle of a linear dimension's line, as ui-sketch.js dimAnchor places it
    var g = K.dimGeometry(e, d), n = [-g.dir[1], g.dir[0]], t = g.value / 2;
    return [g.P[0] + n[0] * d.off + g.dir[0] * t, g.P[1] + n[1] * d.off + g.dir[1] * t];
  }
  step('rfCR: dimensions typed while drawing a closed Line chain sit outside the outline whichever way it was drawn (counter-clockwise and clockwise squares), 26 px off the line; an open chain keeps the left-hand side', async function () {
    var was = UI.sketchNumericInput();
    try {
      UI.sketchNumericInput(true);
      await rskNew();
      var f = UI.activeSketchFeature(), s = UI.cam.scale;
      UI.setTool('line'); rskClick([0, 0]); rskClick([30, 0]); rskClick([30, 30]); rskClick([0, 30]); rskClick([0, 0]);   // counter-clockwise, closed on its first point
      await idle();
      var dims = (f.dims || []).filter(function (d) { return d.k === 'len' && d.e < 4; });
      assert(f.entities.length === 4 && dims.length >= 3, 'a closed square with typed lengths: ' + f.entities.length + ' entities, dims ' + JSON.stringify(f.dims));
      dims.forEach(function (d) {
        var a = crAnchor(f.entities[d.e], d);
        assert(a[0] < -1 || a[0] > 31 || a[1] < -1 || a[1] > 31, 'CCW: dimension of entity ' + d.e + ' sits outside the square: ' + a + ' off ' + d.off);
        near(Math.abs(d.off), 26 * s, 1e-6, '26 px off the line');
      });
      UI.setTool('line'); rskClick([40, 0]); rskClick([40, 30]); rskClick([70, 30]); rskClick([70, 0]); rskClick([40, 0]);   // clockwise
      await idle();
      var dims2 = (f.dims || []).filter(function (d) { return d.k === 'len' && d.e >= 4; });
      assert(f.entities.length === 8 && dims2.length >= 3, 'a clockwise square: ' + f.entities.length + ' entities, dims ' + JSON.stringify(f.dims));
      dims2.forEach(function (d) {
        var a = crAnchor(f.entities[d.e], d);
        assert(a[0] < 39 || a[0] > 71 || a[1] < -1 || a[1] > 31, 'CW: dimension of entity ' + d.e + ' sits outside the square: ' + a + ' off ' + d.off);
      });
      // an open chain: the dimension stays on the left of the line's direction (off positive)
      UI.setTool('line'); rskClick([0, -20]); rskClick([30, -20]); rskDbl([30, -20]);
      await idle();
      var open = (f.dims || []).filter(function (d) { return d.e === 8; })[0];
      assert(open && open.off > 0, 'open chain: the left side: ' + JSON.stringify(open));
      UI.setTool('select');
      return 'dims ' + f.dims.map(function (d) { return d.e + ':' + d.off; }).join(' ');
    } finally { UI.sketchNumericInput(was); UI.setTool('select'); }
  });
  step('rfCR: Equal Curve Length — Add Relations offers it for a selected line and arc, one click adds it and the lengths match; dragging the line\'s free end keeps them equal; Display/Delete Relations lists it by name', async function () {
    var f = await trimSketch([{ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'arc', cx: 0, cy: 20, r: 10, a0: 0, a1: 90 }]);
    UI.setSelection([{ kind: 'entity', index: 0 }, { kind: 'entity', index: 1 }]);
    UI.cmdAddRelations(); await idle();
    var btn = Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (b) { return b.textContent.trim() === 'Equal Curve Length'; })[0];
    assert(btn, 'the Equal Curve Length button is offered: ' + Array.prototype.map.call(D.querySelectorAll('#pm button'), function (b) { return b.textContent.trim(); }).join(','));
    btn.click(); await idle();
    f = UI.activeSketchFeature();
    var rel = (f.rels || []).filter(function (r) { return r.type === 'equalcurve'; })[0];
    assert(rel && rel.refs.join(',') === '0,1', 'relation added: ' + JSON.stringify(f.rels));
    function lineLen() { var e = f.entities[0]; return Math.hypot(e.x2 - e.x1, e.y2 - e.y1); }
    function arcLen() { var a = f.entities[1]; return Math.abs(a.a1 - a.a0) * Math.PI / 180 * a.r; }
    near(lineLen(), arcLen(), 1e-6, 'one length');
    assert(/Equal Curve Length added/.test(statusText()), 'status: ' + statusText());
    UI.pmOK(); await idle();
    // drag the line's free end with the mouse: the arc follows so the lengths stay equal
    var e0 = f.entities[0], from = rskScr([e0.x2, e0.y2]), to = rskScr([e0.x2 + 15, e0.y2 + 3]);
    UI.setTool('select');
    await selDrag(from, to);
    f = UI.activeSketchFeature();
    assert(lineLen() > 32, 'the line was dragged longer: ' + lineLen());
    near(lineLen(), arcLen(), 1e-4, 'still one length after the drag');
    UI.cmdDisplayRelations(); await idle();
    assert($('pm').textContent.indexOf('Equal Curve Length') >= 0, 'listed in Display/Delete Relations');
    UI.pmOK(); await idle();
    return 'line ' + lineLen().toFixed(4) + ' arc ' + arcLen().toFixed(4);
  });
  step('rfCR: Replace Entity — the sketch right-click menu offers it on a selected entity; pick the replacement, ✓: the dimension and the Coincident move to the new line (dimension value kept), the old line goes, one Ctrl+Z brings it back; Make construction keeps the old line as construction', async function () {
    var f = await trimSketch([{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 0, y2: 30 }, { t: 'line', x1: 3, y1: 8, x2: 44, y2: 12 }],
      [{ type: 'coincident', refs: ['0.p1', '1.p1'] }, { type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }]);
    f.dims = [{ e: 0, k: 'len', off: -6 }];
    UI.App.gridStale = true; UI.updateSketches();
    UI.setTool('select');
    var p = rskScr([20, 0]);
    selEv('mousedown', p, $('viewport'), { button: 2, buttons: 2 }); selEv('mouseup', p, null, { button: 2 });
    await wait(20);
    var row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return m.textContent.indexOf('Replace Entity') >= 0; })[0];
    assert(row, 'Replace Entity… on the right-click menu: ' + Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (m) { return m.textContent; }).join('|'));
    row.click(); await idle();
    assert(/Replace Entity/.test($('pm').textContent) && /Line1/.test($('pm').textContent), 'the PM opened with the selected line to replace: ' + $('pm').textContent.slice(0, 120));
    var undo0 = UI.App.undo.length;
    rskClick([23, 10]);   // the replacement line
    await idle();
    assert(/Line3/.test($('pm').textContent), 'the replacement is picked: ' + $('pm').textContent.slice(0, 160));
    UI.pmOK(); await idle();
    f = UI.activeSketchFeature();
    assert(f.entities.length === 2 && f.entities[0].t === 'line' && Math.abs(f.entities[0].x2 - f.entities[0].x1) < 1e-6, 'the old line went, the vertical stays (joined to the new line\'s end): ' + JSON.stringify(f.entities));
    var n = f.entities[1];
    near(Math.hypot(n.x2 - n.x1, n.y2 - n.y1), 40, 1e-6, 'the new line took the 40 dimension');
    assert(f.dims.length === 1 && f.dims[0].e === 1 && f.dims[0].k === 'len', 'the dimension moved: ' + JSON.stringify(f.dims));
    var R = (f.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); });
    assert(R.indexOf('coincident:1.p1,0.p1') >= 0 && R.indexOf('horizontal:1') >= 0, 'relations moved: ' + R.join(' '));
    near(n.x1, f.entities[0].x1, 1e-6, 'joined to the vertical (x)'); near(n.y1, f.entities[0].y1, 1e-6, 'joined (y)');
    assert(UI.App.undo.length === undo0 + 1 && /replaced by/.test(statusText()), 'one undo step: ' + (UI.App.undo.length - undo0) + ' ' + statusText());
    UI.undo(); await idle();
    f = UI.activeSketchFeature();
    assert(f.entities.length === 3 && f.dims[0].e === 0, 'Ctrl+Z brings the old line back: ' + JSON.stringify(f.entities));
    // Make construction: the old line stays, as construction geometry
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    UI.cmdReplaceEntity(); await idle();
    rskClick([23, 10]); await idle();
    pmField('Make construction').click(); await idle();
    UI.pmOK(); await idle();
    f = UI.activeSketchFeature();
    assert(f.entities.length === 3 && f.entities[0].construction === true && f.dims[0].e === 2, 'kept as construction, the dimension on the new line: ' + JSON.stringify(f.entities) + ' ' + JSON.stringify(f.dims));
    return R.join(' ');
  });
