  // --- r9/sketch9 ---
  step('r9/sketch9: with on-screen numeric input on, the value box opens by itself after the first click and shows the live L / A (selected, typing replaces it); a typed length holds, Enter places it and the box reopens for the next segment; A switches to a tangent arc; Esc ends the chain', async function () {
    var was = UI.sketchNumericInput();
    try {
      UI.sketchNumericInput(true);
      await rskNew();
      UI.App.view.showGrid = false;   // (a failed earlier step may have left the sketch grid on)
      UI.setTool('line'); rskClick([0, 0]);
      selEv('mousemove', rskScr([20, 0.01]));
      var box = UI.sketchNumBox();
      assert(box && box.length === 2 && D.activeElement === box[0], 'box opened by itself after the first click');
      near(+box[0].value, 20, 0.05, 'live L'); near(+box[1].value, 0, 0.1, 'live A');
      selEv('mousemove', rskScr([25, 0.01]));
      near(+UI.sketchNumBox()[0].value, 25, 0.05, 'L follows the mouse');
      r3sType(UI.sketchNumBox()[0], '30');
      selEv('mousemove', rskScr([12, 0.01]));
      var tmp = UI.App.tempEntities[0];
      near(Math.hypot(tmp.x2 - tmp.x1, tmp.y2 - tmp.y1), 30, 1e-9, 'typed length holds while the mouse moves');
      r3sKey(UI.sketchNumBox()[0], 'Enter');
      var f = UI.activeSketchFeature(), l = rskEnts()[0];
      near(l.x2 - l.x1, 30, 1e-9, 'line 30 long'); near(l.y2, 0, 1e-9, 'horizontal');
      assert((f.dims || []).some(function (d) { return d.e === 0 && d.k === 'len'; }), 'length dimension ' + JSON.stringify(f.dims));
      selEv('mousemove', rskScr([30, 15]));
      box = UI.sketchNumBox();
      assert(box && D.activeElement === box[0], 'box reopened for the next segment');
      near(+box[0].value, 15, 0.05, 'live L of the next segment');
      r3sKey(box[0], 'a');
      assert(UI.App.toolState.arcMode && !UI.sketchNumBox(), 'A from the box: tangent arc, no box');
      selKey('a'); selEv('mousemove', rskScr([30, 16]));
      assert(!UI.App.toolState.arcMode && UI.sketchNumBox(), 'A again: lines, box back');
      r3sKey(UI.sketchNumBox()[0], 'Escape');
      assert(UI.App.tool === 'select' && !UI.App.toolState.pts.length && !UI.sketchNumBox(), 'lane CG: one Esc ended the chain and put the Line tool down');
      UI.setTool('rect'); rskClick([0, -30]); selEv('mousemove', rskScr([16, -20]));
      box = UI.sketchNumBox();
      assert(box && box.length === 2, 'W / H box');
      near(+box[0].value, 16, 0.05, 'W'); near(+box[1].value, 10, 0.05, 'H');
      rskClick([16, -20]);
      // lane C, fidelity #13: the rectangle is its four lines (the last four entities)
      var E4 = rskEnts().slice(-4), xs = [], ys = [];
      E4.forEach(function (e) { xs.push(e.x1, e.x2); ys.push(e.y1, e.y2); });
      var r = { w: Math.max.apply(null, xs) - Math.min.apply(null, xs), h: Math.max.apply(null, ys) - Math.min.apply(null, ys) };
      assert(E4.every(function (e) { return e.t === 'line'; }) && Math.abs(r.w - 16) < 0.05 && Math.abs(r.h - 10) < 0.05 && !UI.sketchNumBox(), 'rect at the cursor: ' + JSON.stringify(E4));
      selKey('Escape');
      return 'line 30, rect ' + r.w + ' x ' + r.h;
    } finally { UI.sketchNumericInput(was); }
  });
  step('r9/sketch9: Offset Entities on a rectangle gives ONE offset dimension (an Offset relation links the sides): editing it to 5 moves all four sides; a slot gets a radial offset dimension', async function () {
    await rskNew();
    UI.App.view.showGrid = false;   // (a failed earlier step may have left the sketch grid on)
    UI.setTool('rect'); rskClick([-30, -10]); rskClick([10, 10]);
    // rfH: the Straight Slot tool draws lines and arcs now; a slot entity (as a script makes it) keeps its radial offset
    UI.activeSketchFeature().entities.push({ t: 'slot', x1: 20, y1: 0, x2: 40, y2: 0, w: 8 }); UI.updateSketches();
    var f = UI.activeSketchFeature();
    // lane C, fidelity #13: the rectangle is four lines (0 bottom … 3 left); a click on its top edge selects that line,
    // and Offset (Select chain) takes the closed chain of four
    UI.setTool('select'); rskClick([-10, 10]);
    assert(UI.App.sel && UI.App.sel.index === 2 && f.entities[2].t === 'line', 'top line selected ' + JSON.stringify(UI.App.sel));
    var n0o = f.entities.length;
    UI.cmdOffsetEntities(); UI.pmSetField('d', '3'); await wait(20); UI.pmOK();
    var dists = f.rels.filter(function (x) { return x.type === 'distance'; });
    assert(f.entities.length === n0o + 4 && dists.length === 1 && dists[0].v === 3 && f.rels.some(function (x) { return x.type === 'offset'; }), 'four offset lines, one dimension + Offset: ' + JSON.stringify(f.rels));
    function bbOf(list) { var xs = [], ys = []; list.forEach(function (e) { xs.push(e.x1, e.x2); ys.push(e.y1, e.y2); }); return { w: Math.max.apply(null, xs) - Math.min.apply(null, xs), h: Math.max.apply(null, ys) - Math.min.apply(null, ys) }; }
    var ri = f.rels.indexOf(dists[0]);
    var res = UI.editRelDim(ri, '5');
    assert(res.ok, res.error);
    var bo = bbOf(f.entities.slice(n0o, n0o + 4)), bi = bbOf(f.entities.slice(0, 4));
    near(Math.abs(bo.w - bi.w), 10, 1e-6, 'width changes by 2 x 5'); near(Math.abs(bo.h - bi.h), 10, 1e-6, 'height changes by 2 x 5');
    UI.setTool('select'); rskClick([30, 4]);
    var si = UI.App.sel && UI.App.sel.index;
    assert(f.entities[si] && f.entities[si].t === 'slot', 'slot selected ' + JSON.stringify(UI.App.sel));
    UI.cmdOffsetEntities(); UI.pmSetField('d', '2'); await wait(20); UI.pmOK();
    var sd = f.rels.filter(function (x) { return x.type === 'distance' && x.dir === 'r'; })[0];
    assert(sd && sd.v === 2 && sd.refs.join() === si + ',' + (f.entities.length - 1), 'radial slot offset: ' + JSON.stringify(f.rels));
    UI.App.dimsStale = false; UI.drawDims();
    var labels = Array.prototype.map.call(D.querySelectorAll('#dim-layer g.dim:not(.auto) text'), function (t) { return t.textContent; });
    assert(labels.indexOf('2') >= 0 && labels.indexOf('5') >= 0, 'drawn: ' + labels.join(' '));
    res = UI.editRelDim(f.rels.indexOf(sd), '3');
    var so = f.entities[f.entities.length - 1];
    assert(res.ok && Math.abs(so.w - f.entities[si].w - 6) < 1e-6, 'slot offset 3: ' + JSON.stringify(so));
    return labels.join(' ');
  });
  step('r9/sketch9 (rfBR): no relation icons while zooming — the relations are held, none is drawn', async function () {
    await rskNew();
    UI.App.view.showGrid = false;   // (a failed earlier step may have left the sketch grid on)
    var f = UI.activeSketchFeature();
    UI.setTool('line'); rskClick([0, 0]); rskClick([60, 0]); rskClick([60, 40]); rskClick([0, 40]); rskClick([0, 0]);
    UI.setTool('circle'); rskClick([15, 20]); rskClick([20, 20]);
    UI.setTool('circle'); rskClick([45, 20]); rskClick([50, 20]);
    UI.setTool('select');
    anvil.addRelation('equal', ['4', '5']); anvil.addRelation('horizontal', ['4.c', '5.c']);
    f.dims = [{ e: 0, k: 'len', off: -6 }, { e: 1, k: 'len', off: -6 }, { e: 4, k: 'dia', ang: 45, off: 9 }];
    UI.updateSketches(); UI.zoomToFit(); await wait(400);
    var c = [UI.size.w / 2 + 30, UI.size.h / 2 - 20], seq = [1 / 1.12, 1 / 1.12, 1.12, 1.12, 1.12, 1 / 1.12], shown = 0;
    for (var k = 0; k < seq.length; k++) { UI.zoomView(seq[k], c[0], c[1]); UI.App.dimsStale = false; UI.drawDims(); shown += D.querySelectorAll('#dim-layer .rel-badge').length; }
    assert(f.rels.length >= 6 && shown === 0, 'relations held (' + f.rels.length + '), icons drawn: ' + shown);
    assert(D.querySelectorAll('#dim-layer g.dim text').length >= 3, 'the dimension labels still drawn');
    return f.rels.length + ' relations, ' + seq.length + ' zoom steps, no icons';
  });
  step('r9/sketch9: typing only a line\'s length (numeric input off: a digit opens the box) and pressing Enter places it — the untouched angle field no longer blocks Enter', async function () {
    await rskNew();
    UI.App.view.showGrid = false;
    UI.setTool('line'); rskClick([0, 0]);
    selEv('mousemove', rskScr([10, 0.02]));
    selKey('4');
    var box = UI.sketchNumBox();
    assert(box && box[0].value === '4', 'box opened by the digit');
    r3sType(box[0], '42');
    r3sKey(box[0], 'Enter');
    var l = rskEnts()[0];
    assert(l && Math.abs(Math.hypot(l.x2 - l.x1, l.y2 - l.y1) - 42) < 1e-9 && Math.abs(l.y2) < 1e-9, 'line 42 placed: ' + JSON.stringify(rskEnts()));
    selKey('Escape'); selKey('Escape');
    return 'line ' + l.x2;
  });
  // --- end r9/sketch9 ---

