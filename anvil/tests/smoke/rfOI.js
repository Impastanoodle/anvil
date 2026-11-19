  // ---- rfOI (local-2026-11-18a, lane sketchflow7): sketching like a SolidWorks 2024 user on INCH parts, by real mouse /
  // key events (report test-reports/2026-11-18-sketch-flow-7.md). Uses rfPR's helpers (one eval scope).
  function rfOIRelTexts(f) { return rfPRRels(f).join(' '); }
  function rfOIDims() { return rfPRLabels().join('|'); }
  function rfOICounts(f) { f = f || rfPRF(); var a = W.SketchSolver.analyze(f); return 'e' + f.entities.length + ' r' + (f.rels || []).length + ' d' + (f.dims || []).length + ' dof' + a.dof + ' ' + a.status; }
  var rfOIHoles = [[1, 1, 0.25], [2.5, 3, 0.375], [4, 1.5, 0.5], [5, 3, 0.25], [3.25, 0.75, 0.5], [5.5, 2, 0.25]];
  // an ordinate set by clicks: the zero (a point on it), the text line, then each member typed into the Modify box
  async function rfOIOrd(axis, zeroAt, lineAt, members, log) {
    UI.cmdOrdinateDim(axis); await wait(30);
    await rfPRClick(zeroAt); await rfPRClick(lineAt);
    for (var k = 0; k < members.length; k++) {
      await rfPRClick(members[k][0]); await wait(30);
      var inp = D.querySelector('#dim-edit input'), open = inp && !$('dim-edit').hidden;
      if (log && k === 0) log.push('Modify box after the first member: ' + open + ' (' + (inp && inp.value) + ')');
      assert(open, 'the Modify box opens on ordinate member ' + k + ' (' + statusText() + ')');
      setInput(inp, members[k][1]); pressEnter(inp); await wait(50);
      assert($('dim-edit').hidden, 'Enter closes the Modify box (' + k + ')');
      assert(UI.pmTitle() === (axis === 'x' ? 'Horizontal' : 'Vertical') + ' Ordinate Dimension', 'the ordinate tool stays: ' + UI.pmTitle());
    }
    rfPROK(); await idle();
  }
  step('rfOI flow 1: a hinge-side bracket from a print with ordinate dimensions: a 6 x 4 plate and six holes of three sizes clicked roughly, the Horizontal and Vertical Ordinate sets from the lower left corner with the 14 values typed into the Modify box as each member is clicked (defect 1: the box did not open, every value had to be double-clicked after), fully defined; the datum moved to the top right corner (both 0s clicked and deleted, the sets made again, 14 values re-typed): the holes stay; undo / redo, edit again, Boss-Extrude', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Front', 8, 6, 0.12, 0.8);
      UI.setTool('rect'); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([6.2, 4.15]); await rfPREsc(2);
      UI.setTool('circle'); await wait(30);
      for (var h = 0; h < rfOIHoles.length; h++) { var H = rfOIHoles[h]; await rfPRClick([H[0] + 0.07, H[1] - 0.06]); await rfPRClick([H[0] + 0.07 + H[2] * 0.6, H[1] - 0.06]); }
      await rfPREsc(2);
      for (h = 0; h < rfOIHoles.length; h++) { H = rfOIHoles[h]; var e = f.entities[4 + h]; await rfPRDim([[e.cx + e.r * 0.7071, e.cy + e.r * 0.7071]], [e.cx + 0.45, e.cy + 0.4], ['1/4', '3/8', '1/2'][[0.25, 0.375, 0.5].indexOf(H[2])]); }
      log.push(rfOICounts());
      var X = rfOIHoles.map(function (H, i) { return [[f.entities[4 + i].cx, f.entities[4 + i].cy], ['1', '2 1/2', '4', '5', '3 1/4', '5 1/2'][i]]; });
      X.push([[f.entities[1].x1, 2], '6']);
      await rfOIOrd('x', [0, 2], [3, -0.7], X, log);
      var Y = rfOIHoles.map(function (H, i) { return [[f.entities[4 + i].cx, f.entities[4 + i].cy], ['1', '3', '1 1/2', '3', '3/4', '2'][i]]; });
      Y.push([[3, f.entities[2].y1], '4']);
      await rfOIOrd('y', [3, 0], [-0.7, 2], Y, log);
      assert(rfPRAn().status === 'full', 'fully defined by the two sets: ' + rfOICounts());
      log.push(rfOICounts());
      log.push(rfPRLabels().join('|'));
      rfOIHoles.forEach(function (H, i) { var e = f.entities[4 + i]; near(e.cx, H[0], 1e-9, 'hole ' + i + ' x'); near(e.cy, H[1], 1e-9, 'hole ' + i + ' y'); near(e.r * 2, H[2], 1e-9, 'hole ' + i + ' d'); });
      log.push(JSON.stringify(Object.keys(W.SketchSolver.ordinateSets(f)).map(function (k) { var s = W.SketchSolver.ordinateSets(f)[k]; return s.zero + ' ' + s.members.length; })));
      // the datum moves to the top right corner: each set's 0 clicked and deleted, the sets made again from there
      for (var z = 0; z < 2; z++) {
        UI.setTool('select'); await wait(20); UI.drawDims(true);
        var zt = D.querySelector('#ord-layer text.ord-zero');
        assert(zt, 'a 0 to click');
        rfPRLabelPress(zt); await wait(30);
        log.push('sel ' + JSON.stringify(UI.App.sel));
        rfPRKey('Delete'); await idle(); await wait(30);
        assert(Object.keys(W.SketchSolver.ordinateSets(rfPRF())).length === 1 - z, 'a set deleted with its 0: ' + rfOICounts());
        log.push(rfOICounts());
      }
      var X2 = rfOIHoles.map(function (H, i) { return [[f.entities[4 + i].cx, f.entities[4 + i].cy], ['5', '3 1/2', '2', '1', '2 3/4', '1/2'][i]]; });
      X2.push([[0, 2], '6']);
      await rfOIOrd('x', [6, 2], [3, 4.7], X2, log);
      var Y2 = rfOIHoles.map(function (H, i) { return [[f.entities[4 + i].cx, f.entities[4 + i].cy], ['3', '1', '2 1/2', '1', '3 1/4', '2'][i]]; });
      Y2.push([[3, 0], '4']);
      await rfOIOrd('y', [3, 4], [6.7, 2], Y2, log);
      log.push(rfOICounts());
      log.push(rfPRLabels().join('|'));
      rfOIHoles.forEach(function (H, i) { var e = f.entities[4 + i]; near(e.cx, H[0], 1e-9, 'B hole ' + i + ' x'); near(e.cy, H[1], 1e-9, 'B hole ' + i + ' y'); });
      assert(rfPRAn().status === 'full', 'fully defined from the new datum: ' + rfOICounts());
      log.push(rfPREnts() + ' ' + JSON.stringify(f.entities[0]));
      log.push(await rfPRUndoAll() + ' undos');
      var v = await rfPRBuild(0.125);
      near(v, (24 - rfOIHoles.reduce(function (a, H) { return a + Math.PI * H[2] * H[2] / 4; }, 0)) * 0.125, 1e-9, 'the plate less six holes');
      log.push('volume ' + v.toFixed(5));
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });
  step('rfOI flow 2: a slotted plate: a straight slot, a Centerpoint Arc Slot and a 3 Point Arc Slot drawn by clicks; the arc slot dragged by its end cap, its centre arc and its side, the straight slot by its side, its centre line and its end (each stays a slot); dimensions between slot centres and to the edges typed; the slot length 1 1/2 -> 2, width 3/8 -> 1/2 and the arc slot R 1 1/4 -> 1 1/8 by double-click; undo / redo, edit again, Boss-Extrude to the closed form', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Front', 10, 6.5, 0.1, 0.85);
      UI.setTool('rect'); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([8, 5]); await rfPREsc(2);
      await rfPRDim([[4, 0]], [4, -0.6], '8'); await rfPRDim([[8, 2.5]], [8.6, 2.5], '5');
      UI.setTool('slot'); await wait(30);
      await rfPRClick([1.5, 1.1]); await rfPRClick([3.1, 1.1]); await rfPRClick([2.3, 1.32]); await wait(30);
      if (UI.sketchUnitBox && UI.sketchUnitBox.isOpen && UI.sketchUnitBox.isOpen()) { rfPRKey('Escape'); await wait(20); }
      await rfPREsc(2);
      log.push('A ' + rfPREnts() + ' ' + rfOICounts());
      UI.setTool('aslot'); await wait(30);
      await rfPRClick([5.6, 2.4]); await rfPRClick([4.4, 2.4]); await rfPRClick([6.8, 2.4]); await rfPRClick([5.6, 3.75]); await wait(30);
      await rfPREsc(2);
      log.push('B ' + rfPREnts() + ' ' + rfOICounts());
      UI.setTool('aslot3'); await wait(30);
      await rfPRClick([1.2, 3]); await rfPRClick([3.4, 3]); await rfPRClick([2.3, 4.1]); await rfPRClick([2.3, 4.3]); await wait(30);
      await rfPREsc(2);
      log.push('C ' + rfPREnts() + ' ' + rfOICounts());
      var E = f.entities, P = function (i, w) { var e = E[i]; return w === 'c' ? [e.cx, e.cy] : w === 'm' ? [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2] : [e.cx + e.r * Math.cos((e.a0 + e.a1) / 2 * Math.PI / 180), e.cy + e.r * Math.sin((e.a0 + e.a1) / 2 * Math.PI / 180)]; };
      function slotOK(tag) {
        var o = E[9], i = E[11];
        near(E[10].r, E[12].r, 1e-9, tag + ': arc slot caps equal'); near(o.r - i.r, 2 * E[10].r, 1e-9, tag + ': arc slot width = cap diameter');
        near(E[5].r, E[7].r, 1e-9, tag + ': straight slot ends equal'); near(Math.abs(E[4].y1 - E[6].y1), 2 * E[5].r, 1e-9, tag + ': sides 2R apart');
        near(E[4].y1, E[4].y2, 1e-9, tag + ': side level'); near(E[8].y1, (E[4].y1 + E[6].y1) / 2, 1e-9, tag + ': centre line midway');
      }
      slotOK('drawn');
      var aw = function () { var o = E[9], i = E[11], ca = E[13]; return 'ro ' + o.r.toFixed(4) + ' ri ' + i.r.toFixed(4) + ' caps ' + E[10].r.toFixed(4) + '/' + E[12].r.toFixed(4) + ' R ' + ca.r.toFixed(4) + ' a ' + ca.a0.toFixed(1) + '-' + ca.a1.toFixed(1) + ' c ' + ca.cx.toFixed(3) + ',' + ca.cy.toFixed(3); };
      log.push('arcslot0 ' + aw());
      UI.setTool('select'); await wait(20);
      await rfPRDrag(P(10), [P(10)[0] + 0.3, P(10)[1] + 0.3]); log.push('drag end ' + aw()); slotOK('drag end');
      await rfPRDrag(P(13), [P(13)[0] + 0.2, P(13)[1] + 0.2]); log.push('drag centre arc ' + aw()); slotOK('drag centre arc');
      await rfPRDrag(P(9), [P(9)[0], P(9)[1] + 0.15]); log.push('drag side ' + aw()); slotOK('drag side');
      await rfPRDrag(P(4, 'm'), [P(4, 'm')[0] + 0.2, P(4, 'm')[1] + 0.1]); slotOK('slotA side');
      await rfPRDrag(P(8, 'm'), [P(8, 'm')[0] + 0.2, P(8, 'm')[1] - 0.1]); slotOK('slotA centre');
      await rfPRDrag(P(5), [P(5)[0] + 0.3, P(5)[1]]); slotOK('slotA end');
      await rfPRDim([[0, 2.5], P(7, 'c')], [0.8, 0.3], '1 1/2');
      await rfPRDim([[6, 0], P(8, 'm')], [3.8, 0.5], '1');
      await rfPRDim([P(8, 'm')], [2.6, 0.2], '1 1/2');
      await rfPRDim([P(4, 'm'), P(6, 'm')], [4.2, 1.0], '3/8');
      await rfPRDim([P(5, 'c'), P(13, 'c')], [4.2, 0.4], '2 3/4');
      await rfPRDim([P(13, 'c'), [6, 0]], [7.3, 1.2], '2 1/2');
      await rfPRDim([P(13)], [5.6, 4.2], '1 1/4');
      log.push(rfPRLabels().join('|'));
      // the slot's length and width changed by a double-click on their values
      await rfOIEditWhere(function (d) { return d.d === f.dims[2]; }, '2');
      await rfOIEditWhere(function (d) { return d.rel != null && f.rels[d.rel].v === 0.375; }, '1/2');
      await rfOIEditWhere(function (d) { return d.d === f.dims[3]; }, '1 1/8');
      slotOK('edited');
      near(E[8].x2 - E[8].x1, 2, 1e-9, 'slot length 2'); near(E[5].r, 0.25, 1e-9, 'slot width 1/2'); near(E[13].r, 1.125, 1e-9, 'arc slot R 1 1/8');
      log.push('edited ' + rfOICounts() + ' arc ' + aw());
      log.push(rfPRLabels().join('|'));
      var sl = 2 * 0.5 + Math.PI * 0.0625, as = E[13], aa = (as.a1 - as.a0) * Math.PI / 180 * as.r * (E[9].r - E[11].r) + Math.PI * E[10].r * E[10].r;
      var a3 = E[18], a3a = (a3.a1 - a3.a0) * Math.PI / 180 * a3.r * (E[14].r - E[16].r) + Math.PI * E[15].r * E[15].r;
      log.push(await rfPRUndoAll() + ' undos');
      var v = await rfPRBuild(0.1);
      near(v, (40 - sl - aa - a3a) * 0.1, 1e-9, 'the plate less three slots');
      log.push('volume ' + v.toFixed(5));
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });
  // a double-click on the value of the dimension (or relation dimension) pred picks, then value + Enter in the Modify box
  async function rfOIEditWhere(pred, value) {
    UI.setTool('select'); await wait(20);
    UI.drawDims(true);
    var t = Array.prototype.filter.call(D.querySelectorAll('#dim-layer text'), function (x) { return x._d && pred(x._d); })[0];
    assert(t, 'no such label among ' + rfPRLabels().join('|'));
    var re = null;
    for (var k = 0; k < 2; k++) {
      if (k) t = Array.prototype.filter.call(D.querySelectorAll('#dim-layer text'), function (x) { return x._d && pred(x._d); })[0] || t;
      rfPRLabelPress(t); await wait(40);
    }
    var inp = D.querySelector('#dim-edit input');
    assert(inp && !$('dim-edit').hidden, 'Modify box open on ' + t.textContent);
    setInput(inp, value); pressEnter(inp); await wait(60);
    if (!$('dim-edit').hidden) { rfPRKey('Escape'); await wait(20); }
    return re;
  }
  function rfOILines(f) { return (f || rfPRF()).entities.map(function (e, i) { return i + (e.t === 'line' ? ':(' + [e.x1, e.y1, e.x2, e.y2].map(function (x) { return +x.toFixed(3); }).join(',') + ')' : e.t === 'arc' ? ':arc(' + [e.cx, e.cy, e.r].map(function (x) { return +x.toFixed(3); }).join(',') + ')' : ':' + e.t); }).join(' '); }
  async function rfOITrimMode(m) { var b = D.querySelector('#pm input[value=' + m + ']'); assert(b, 'Trim mode ' + m); if (!b.checked) { b.click(); await wait(20); } }
  step('rfOI flow 3: notches and reliefs on an 8 x 5 blank: three Corner Rectangles across the outline, trimmed by Power trim (two drags across several), Trim to closest and Corner into one closed outline; Sketch Fillet R1/4 on the inside corners of one notch and R1/2 on both inside corners of a notch 1 deep (defect 2: the second corner was refused "Radius too large … at most R.500" for R.500: now the full round, the used-up line goes); the notch widened 1 -> 1 1/2 by its dimension; the rounded notch window-selected and deleted, the left edge healed by Extend (defect 3: the join to the upper piece was dropped as redundant beside their Collinear, so the outline only looked closed); undo / redo, edit again, Boss-Extrude to the closed form', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Front', 10, 6.5, 0.1, 0.85);
      UI.setTool('rect'); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([8, 5]); await rfPREsc(2);
      await rfPRDim([[4, 0]], [4.6, -0.75], '8'); await rfPRDim([[8, 2.5]], [8.9, 2.5], '5');
      UI.setTool('rect'); await wait(30);
      await rfPRClick([2, -0.5]); await rfPRClick([3, 0.75]);
      await rfPRClick([7, 4]); await rfPRClick([8.5, 5.5]);
      await rfPRClick([-0.4, 2]); await rfPRClick([0.6, 3]); await rfPREsc(2);
      UI.cmdTrimEntities(); await wait(40);
      await rfOITrimMode('power');
      await rfPRDrag([2.5, 0.12], [2.5, -0.62], 6);
      await rfPRDrag([1.88, -0.25], [3.12, -0.25], 6);
      await rfOITrimMode('closest');
      await rfPRClick([7.5, 5]); await rfPRClick([8, 4.5]); await rfPRClick([7.5, 5.5]); await rfPRClick([8.5, 4.7]); await rfPRClick([7, 5.25]); await rfPRClick([8.25, 4]);
      await rfPRClick([0, 2.5]); await rfPRClick([-0.4, 2.5]);
      await rfOITrimMode('corner');
      await rfPRClick([0.3, 3]); await rfPRClick([0, 4]);
      await rfPRClick([0.3, 2]); await rfPRClick([0, 1]);
      rfPROK(); await idle();
      assert(W.Kernel.sketchProfile(rfPRF()).loops.length === 1, 'one closed outline after the trims: ' + rfOILines());
      log.push('trimmed ' + rfOICounts());
      UI.cmdSketchFillet(); await wait(40);
      await rfPRTypePM(pmField('Radius'), '1/4'); pressEnter(pmField('Radius')); await wait(30);
      await rfPRClick([2, 0.75]); await rfPRClick([3, 0.75]); await wait(30);
      await UI.pmOK(); await idle();
      assert(/^Fillet R.250/.test(statusText()), 'R1/4 fillets: ' + statusText());
      UI.cmdSketchFillet(); await wait(40);
      await rfPRTypePM(pmField('Radius'), '1/2'); pressEnter(pmField('Radius')); await wait(30);
      var t0 = D.querySelectorAll('.toast').length;
      await rfPRClick([0.6, 2]); await rfPRClick([0.6, 3]); await wait(30);
      var tl = Array.prototype.slice.call(D.querySelectorAll('.toast'), t0).map(function (t) { return t.textContent; }).join(' / ');
      assert(!/too large/.test(tl), 'the second R.5 corner is made, not refused: ' + tl);
      await UI.pmOK(); await idle();
      var g = rfPRF(), arcs = g.entities.filter(function (e) { return e.t === 'arc' && Math.abs(e.r - 0.5) < 1e-9; });
      assert(arcs.length === 2 && arcs.every(function (a) { return Math.abs(a.cx - arcs[0].cx) < 1e-9 && Math.abs(a.cy - 2.5) < 1e-9; }), 'the full round: two R.5 arcs on one centre: ' + rfOILines());
      assert(!g.entities.some(function (e) { return e.t === 'line' && Math.abs(e.x1 - e.x2) < 1e-9 && Math.abs(e.x1 - 0.6) < 1e-9; }), 'the end line of the notch is used up: ' + rfOILines());
      assert(W.Kernel.sketchProfile(g).loops.length === 1 && rfPRAn().redundant === 0, 'still one outline, nothing redundant');
      log.push('rounded ' + rfOICounts());
      await rfPRDim([[2, 0.25], [3, 0.25]], [2.5, -0.5], '1');
      await rfOIEditWhere(function (d) { return d.rel != null && f.rels[d.rel].v === 1; }, '1 1/2');
      f = rfPRF(); var w8 = f.entities.filter(function (e) { return e.t === 'line' && Math.abs(e.x1 - e.x2) < 1e-9 && e.y1 < 0.6 && e.y2 < 0.6 && e.x1 > 1; }).map(function (e) { return e.x1; });
      assert(w8.length === 2 && Math.abs(Math.abs(w8[1] - w8[0]) - 1.5) < 1e-9, 'the notch 1 1/2 wide: ' + w8);
      UI.setTool('select'); await wait(20);
      await rfPRDrag([-0.25, 1.8], [0.8, 3.2]);
      assert(UI.selection().length === 4, 'the rounded notch window-selected: ' + JSON.stringify(UI.selection()));
      rfPRKey('Delete'); await idle(); await wait(30);
      UI.cmdExtendEntities(); await wait(40);
      await rfPRClick([0, 1.8]); await wait(30);
      assert(/^Extended 1/.test(statusText()), statusText());
      UI.setTool('select'); if (UI.hasPM()) rfPROK(); await idle();
      f = rfPRF();
      assert(rfPRRels(f).indexOf('coincident(5.p1,4.p2)') >= 0 && rfPRRels(f).indexOf('collinear(4,5)') < 0, 'the healed edge is joined (and no longer Collinear): ' + rfPRRels(f).join(' '));
      await rfPRDrag([0, 4], [0, 4.4]);
      f = rfPRF();
      near(f.entities[5].y1, f.entities[4].y2, 1e-9, 'a drag of the upper piece keeps the join'); near(f.entities[5].x1, f.entities[4].x2, 1e-9, 'x');
      rfPRKey('z', { ctrlKey: true }); await idle();
      assert(W.Kernel.sketchProfile(rfPRF()).loops.length === 1, 'one outline');
      log.push(await rfPRUndoAll() + ' undos');
      var r = 0.25, v = await rfPRBuild(0.1);
      near(v, (40 - (1.5 * 0.75 - 2 * (r * r - Math.PI * r * r / 4)) - 1) * 0.1, 1e-9, 'the blank less the rounded notch and the corner');
      log.push('volume ' + v.toFixed(5));
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });
  step('rfOI flow 4: construction geometry and relations by hand: an 8 x 6 plate, a bolt circle drawn and made construction in its PM (Ø4, centre 4 and 3 from the edges), a Ø3/8 hole on it, Circular Sketch Pattern of 6 about the bolt circle\'s centre (tied to it), the bolt circle moved 4 -> 3 1/2 (the holes follow), Horizontal from the context toolbar after Ctrl-selecting the seed\'s and the circle\'s centres (fully defined); right-click > Edit Circular Pattern: 8, the 90° instance skipped (7 holes); a centerline, two holes made Symmetric and one Coincident on it from the toolbar, each dragged; the Symmetric deleted in Display / Delete Relations (one relation goes), the hole dragged alone; undo / redo, edit again', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Front', 12, 8, 0.1, 0.88);
      UI.setTool('rect'); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([8, 6]); await rfPREsc(2);
      await rfPRDim([[4, 0]], [4.6, -0.6], '8'); await rfPRDim([[8, 3]], [8.7, 3], '6');
      UI.setTool('circle'); await wait(30);
      await rfPRClick([4.1, 3.1]); await rfPRClick([6.1, 3.1]); await wait(30); await rfPREsc(2);
      UI.setTool('select'); await wait(20); await rfPRClick([4.1, 5.1]); await wait(30);
      var cc = pmField('For construction'); assert(cc, 'For construction box in ' + UI.pmTitle()); cc.click(); await wait(30);
      rfPREsc(1); await wait(20);
      assert(rfPREnts() === '0:line 1:line 2:line 3:line 4:circle*', 'a construction bolt circle: ' + rfPREnts());
      await rfPRDim([[4.1 + 2 * 0.7071, 3.1 + 2 * 0.7071]], [6.8, 5.4], '4');
      await rfPRDim([[0, 3], [f.entities[4].cx, f.entities[4].cy]], [2, 5.6], '4');
      await rfPRDim([[4, 0], [f.entities[4].cx, f.entities[4].cy]], [-0.6, 1.5], '3');
      assert(rfPRAn().status === 'full' && f.entities[4].cx === 4 && f.entities[4].cy === 3 && f.entities[4].r === 2, 'the bolt circle placed: ' + JSON.stringify(f.entities[4]));
      UI.setTool('circle'); await wait(30);
      await rfPRClick([6, 3]); await rfPRClick([6.2, 3]); await wait(30); await rfPREsc(2);
      assert(rfPRRels().indexOf('coincident(5.c,4)') >= 0, 'the hole centre on the bolt circle: ' + rfPRRels().join(' '));
      await rfPRDim([[6.2, 3]], [6.6, 3.8], '3/8');
      UI.setTool('select'); await rfPRClick([6.1875, 3]);
      UI.cmdCircularSketchPattern(); await wait(40);
      function fk(k) { return D.querySelector('#pm input[data-key="' + k + '"]'); }
      await rfPRTypePM(fk('cx'), '4'); pressEnter(fk('cx')); await wait(20);
      await rfPRTypePM(fk('cy'), '3'); pressEnter(fk('cy')); await wait(20);
      await rfPRTypePM(fk('count'), '6'); pressEnter(fk('count')); await wait(20);
      rfPROK(); await idle(); await wait(50);
      var hs = function () { return rfPRF().entities.filter(function (e) { return e.t === 'circle' && !e.construction; }); };
      assert(hs().length === 6, 'six holes: ' + hs().length);
      assert(rfPRRels().some(function (r) { return /^coincident\(\d+\.p1,4\.c\)$/.test(r); }), 'the pattern centre tied to the bolt circle\'s centre: ' + rfPRRels().join(' '));
      await rfOIEditWhere(function (d) { return d.rel != null && f.rels[d.rel].v === 4 && f.rels[d.rel].refs.indexOf('4.c') >= 0; }, '3 1/2');
      near(f.entities[4].cx, 3.5, 1e-9, 'the bolt circle moved');
      hs().forEach(function (e, k) { near(Math.hypot(e.cx - 3.5, e.cy - 3), 2, 1e-9, 'hole ' + k + ' on the moved bolt circle'); });
      UI.setTool('select'); await wait(20);
      var s0 = f.entities[5];
      await rfPRClick([s0.cx, s0.cy]); await rfPRClick([f.entities[4].cx, f.entities[4].cy], { ctrlKey: true }); await wait(30);
      var hb = D.querySelector('#sk-ctx [data-rel="horizontal"]');
      assert(hb, 'Make Horizontal on the context toolbar');
      hb.click(); await wait(40);
      assert(rfPRAn().status === 'full', 'fully defined: ' + rfOICounts());
      near(f.entities[5].cy, 3, 1e-9, 'the seed level with the centre');
      rfPREsc(2); await wait(20);
      var rows = await rfPRMenuAt([f.entities[5].cx + f.entities[5].r * 0.7071, f.entities[5].cy - f.entities[5].r * 0.7071]);
      var ed = rows.filter(function (r) { return /Edit Circular Pattern/.test(r.textContent); })[0];
      assert(ed, 'Edit Circular Pattern on the hole\'s menu: ' + rows.map(function (r) { return r.textContent; }).join('/'));
      ed.click(); await wait(60);
      await rfPRTypePM(fk('count'), '8'); pressEnter(fk('count')); await wait(20);
      var picks = D.querySelectorAll('#pm .pm-pick');
      picks[picks.length - 1].click(); await wait(30);
      assert(UI.pmSpec().values.box === 'skip', 'Instances to Skip active');
      var C0 = f.entities[4];
      await rfPRClick([C0.cx, C0.cy + 2]);
      assert(UI.pmSpec().values.skip.length === 1, 'one skipped: ' + JSON.stringify(UI.pmSpec().values.skip));
      rfPROK(); await idle(); await wait(50);
      f = rfPRF(); C0 = f.entities[4];
      var ang = hs().map(function (e) { return Math.round(Math.atan2(e.cy - C0.cy, e.cx - C0.cx) * 180 / Math.PI); }).sort(function (a, b) { return a - b; }).join(',');
      assert(ang === '-135,-90,-45,0,45,135,180', '8 less the one at 90°: ' + ang);
      // a centerline and four free holes; Symmetric and Coincident from the toolbar
      UI.cmdCenterline(); await wait(30);
      await rfPRClick([7.2, 0.6]); await rfPRClick([7.2, 5.4]); await rfPREsc(2);
      UI.setTool('circle'); await wait(30);
      await rfPRClick([6.6, 0.9]); await rfPRClick([6.85, 0.9]); await wait(20);
      await rfPRClick([7.85, 1.1]); await rfPRClick([7.85, 1.35]); await wait(20);
      await rfPRClick([7.05, 4.5]); await rfPRClick([7.05, 4.25]); await wait(20); await rfPREsc(2);
      f = rfPRF();
      var n = f.entities.length, CL = n - 4;
      assert(f.entities[CL].t === 'line' && f.entities[CL].construction && f.entities.slice(n - 3).every(function (e) { return e.t === 'circle'; }), 'centerline and three holes: ' + rfPREnts());
      async function rel(refsAt, type) {
        UI.setTool('select'); await wait(20); rfPREsc(1); await wait(10);
        for (var k = 0; k < refsAt.length; k++) await rfPRClick(refsAt[k], k ? { ctrlKey: true } : null);
        await wait(30);
        var b = D.querySelector('#sk-ctx [data-rel="' + type + '"]');
        assert(b, 'Make ' + type + ' offered: ' + Array.prototype.map.call(D.querySelectorAll('#sk-ctx button'), function (x) { return x.getAttribute('data-rel'); }).join(','));
        b.click(); await wait(40);
        rfPREsc(1); await wait(10);
      }
      var E = function (i) { return rfPRF().entities[i]; }, iA = n - 3, iB = n - 2, iD = n - 1;
      function symOK(tag) { var a = E(iA), b = E(iB), x = E(CL).x1; near((a.cx + b.cx) / 2, x, 1e-9, tag + ': A and B symmetric about the centerline'); near(a.cy, b.cy, 1e-9, tag + ': level'); }
      await rel([[E(iA).cx, E(iA).cy], [E(iB).cx, E(iB).cy], [7.2, 3]], 'symmetric');
      symOK('added');
      await rel([[E(iD).cx, E(iD).cy], [7.2, 3.5]], 'coincident');
      near(E(iD).cx, E(CL).x1, 1e-9, 'D on the centerline');
      UI.setTool('select');
      await rfPRDrag([E(iA).cx, E(iA).cy], [E(iA).cx - 0.3, E(iA).cy + 0.4]);
      symOK('A dragged');
      await rfPRDrag([E(iD).cx, E(iD).cy], [E(iD).cx + 0.4, E(iD).cy - 0.3]);
      near(E(iD).cx, E(CL).x1, 1e-9, 'D dragged stays on the centerline');
      // Display / Delete Relations: the Symmetric row, Delete
      var r0 = rfPRF().rels.length;
      UI.cmdDisplayRelations(); await idle();
      var sym = Array.prototype.filter.call(D.querySelectorAll('#rel-display .rel-row'), function (r) { return /Symmetric/.test(r.textContent); })[0];
      assert(sym, 'the Symmetric row');
      sym.click(); sym.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })); await wait(30);
      UI.pmOK(); await idle();
      f = rfPRF();
      assert(f.rels.length === r0 - 1 && !f.rels.some(function (r) { return r.type === 'symmetric'; }), 'one relation gone, the Symmetric: ' + rfPRRels().join(' '));
      var bx = E(iB).cx;
      await rfPRDrag([E(iA).cx, E(iA).cy], [E(iA).cx - 0.2, E(iA).cy - 0.3]);
      near(E(iB).cx, bx, 1e-9, 'B stays when A is dragged alone');
      log.push(rfOICounts());
      log.push(await rfPRUndoAll() + ' undos');
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });
  step('rfOI flow 6: a sketch on the outer face of a 6 x 2 Edge Flange (T .06, R .06, Tangent Edges Visible): a Ø1/4 hole dimensioned 1 from the flange\'s side edge and 3/4 from the bend\'s edge (defect 5: the bend\'s tangent edge could not be picked, "No distance between those two"; now the drawn tangent edges are picked in a sketch, as SolidWorks dimensions from the bend line); the Edge Flange 2 -> 3, the sheet T .06 -> .075 and the base outline moved 1/2 in at the flange\'s side: the hole follows both references, nothing dangles', async function () {
    var log = [], tan0 = UI.tangentEdges();
    try {
      await rfPRPart();
      await anvil.run('p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange(0.06);\np.flange(2, [[3, 0.06, 0]]);'); await idle();
      // Tangent Edges Removed (the smoke page's start): the bend's edge is not drawn and not picked, as in SolidWorks
      UI.setTangentEdges('visible');
      var fi = -1;
      UI.App.mesh.faces.forEach(function (x, i) { if (x.normal[2] < -0.999 && x.area > 5) fi = i; });
      assert(fi >= 0, 'the flange\'s outer face');
      UI.setView('Front', false); if (UI.finishViewAnimation) UI.finishViewAnimation();
      UI.App.sel = { kind: 'face', index: fi };
      UI.cmdSketch(); await idle(); await wait(40);
      UI.zoomToFit(); await wait(40);
      if (rfPRGrid == null) rfPRGrid = UI.App.view.showGrid;
      UI.App.view.showGrid = false; UI.App.gridStale = true;
      var f = rfPRF(), id = f.id, pl = UI.activePlane(), z0 = K.to3D(pl, 0, 0)[2];
      var U = function (x, y) { return rfPRUv([x, y, z0]); };
      UI.setTool('circle'); await wait(30);
      await rfPRClick(U(1.1, 1.3)); await rfPRClick(U(1.3, 1.3)); await rfPREsc(2);
      var c = rfPRF().entities[0];
      await rfPRDim([[c.cx + c.r * 0.7071, c.cy + c.r * 0.7071]], [c.cx + 0.5, c.cy + 0.5], '1/4');
      await rfPRDim([[c.cx, c.cy], U(0, 0.9)], U(0.5, 1.9), '1');
      await rfPRDim([[c.cx, c.cy], U(3, 0.12)], U(2.2, 0.7), '3/4');
      assert(rfPRAn().status === 'full', 'fully defined from the two model edges: ' + rfOICounts());
      var p3 = K.to3D(pl, c.cx, c.cy);
      near(p3[0], 1, 1e-9, 'the hole 1 from the side'); near(p3[1], 0.12 + 0.75, 1e-9, '3/4 above the bend edge');
      UI.exitSketch(); await idle();
      var m = UI.App.model, ef = m.features.filter(function (x) { return x.type === 'flange'; })[0];
      async function check(x, y, z, tag) {
        await UI.rebuild(); await idle();
        assert(!Object.keys(anvil.summary().errors || {}).length && !/Dangling/.test(UI.App.build.warnings[id] || ''), tag + ': rebuilt, nothing dangling: ' + JSON.stringify([anvil.summary().errors, UI.App.build.warnings]));
        UI.enterSketch(id); await idle(); await wait(30);
        var g = rfPRF(), e = g.entities.filter(function (q) { return q.t === 'circle'; })[0], q = K.to3D(UI.activePlane(), e.cx, e.cy);
        near(q[0], x, 1e-6, tag + ': hole x'); near(q[1], y, 1e-6, tag + ': hole y'); near(q[2], z, 1e-6, tag + ': hole z');
        assert(rfPRAn().status === 'full', tag + ': ' + rfOICounts());
        log.push(tag + ' ' + q.map(function (v) { return +v.toFixed(4); }).join(','));
        UI.exitSketch(); await idle();
      }
      ef.length = 3;
      await check(1, 0.87, -0.12, 'flange 3');
      m.sheet.thickness = 0.075;
      await check(1, 0.885, -0.135, 'T .075');   // (the flange's wall moves out to T + R, and since lane smflange the Base Flange takes the sheet's T too, so the bend edge is at .135)
      var bs = m.features.filter(function (x) { return x.type === 'sketch'; })[0];
      bs.entities[0].x = 0.5; bs.entities[0].w = 5.5;
      await check(1.5, 0.885, -0.135, 'base moved in');
    } finally { UI.setTangentEdges(tan0); await rfPREnd(); }
    return rfPROut(log);
  });
  step('rfOI flow 5: copy and edit a dimensioned group (two holes on a 6 x 4 plate, the first located 1 1/2 and 2, the second 1 from it): Move Entities X/Y 2 without Keep relations (the dimensions to the plate go, the one between the holes comes along), with Keep relations (refused with the reason); Copy Entities 2 (no dimensions on the copies); Rotate 90° and Scale x2 (Copy, the default) of the copies; Stretch by a crossing box over the right edge, 1: the 6 reads 7; Ctrl+drag of a hole copies it (defect 4: the hole was dragged, or \"did not move\" when dimensioned); Ctrl+C / Ctrl+V into a sketch on Top (the copy keeps its Ø and the 1 between the holes); undo / redo, edit again', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Front', 10, 6.5, 0.1, 0.85);
      UI.setTool('rect'); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([6, 4]); await rfPREsc(2);
      await rfPRDim([[3, 0]], [3.6, -0.6], '6'); await rfPRDim([[6, 2]], [6.7, 2], '4');
      UI.setTool('circle'); await wait(30);
      await rfPRClick([1.5, 2]); await rfPRClick([1.8, 2]); await rfPRClick([2.6, 2.1]); await rfPRClick([2.8, 2.1]); await rfPREsc(2);
      await rfPRDim([[1.5 + 0.3 * 0.7071, 2 + 0.3 * 0.7071]], [1.9, 2.8], '1/2');
      await rfPRDim([[2.6 + 0.2 * 0.7071, 2.1 + 0.2 * 0.7071]], [3.0, 2.8], '1/4');
      await rfPRDim([[0, 3], [1.5, 2]], [0.75, 3.4], '1 1/2');
      await rfPRDim([[3, 0], [1.5, 2]], [-0.5, 1], '2');
      await rfPRDim([[1.5, 2], f.entities[5] && [f.entities[5].cx, f.entities[5].cy]], [2, 1.2], '1');
      assert(rfPRAn().dof === 1, 'one freedom left (the second hole round the first): ' + rfOICounts());
      // Move Entities (X/Y) dx 2 of both holes, Keep relations off
      UI.setTool('select'); await wait(20);
      await rfPRClick([1.75, 2]); var h2 = rfPRF().entities[5]; await rfPRClick([h2.cx + h2.r, h2.cy], { ctrlKey: true });
      assert(UI.selection().length === 2, 'both holes selected');
      UI.cmdMoveEntities(); await wait(40);
      D.querySelector('#pm input[value=xy]').click(); await wait(20);
      setInput(pmField('ΔX'), '2'); pressEnter(pmField('ΔX')); await wait(20);
      assert(!pmField('Keep relations').checked, 'Keep relations off by default');
      await UI.pmOK(); await idle();
      var E = rfPRF().entities;
      near(E[4].cx, 3.5, 1e-9, 'moved 2'); near(E[5].cx - E[4].cx, 1, 1e-3, 'together');
      assert(rfOIDims() === '6.000|4.000|Ø.500|Ø.250|1.000', 'the dimensions to the plate went, Ø and the 1 between came along: ' + rfOIDims());
      rfPRKey('z', { ctrlKey: true }); await idle();
      assert(rfPRAn().dof === 1 && rfPRF().entities[4].cx === 1.5, 'undo');
      // with Keep relations
      UI.setTool('select'); await wait(20);
      await rfPRClick([1.75, 2]); var h2 = rfPRF().entities[5]; await rfPRClick([h2.cx + h2.r, h2.cy], { ctrlKey: true });
      UI.cmdMoveEntities(); await wait(40);
      D.querySelector('#pm input[value=xy]').click(); await wait(20);
      setInput(pmField('ΔX'), '2'); pressEnter(pmField('ΔX')); await wait(20);
      pmField('Keep relations').click(); await wait(20);
      var u0 = UI.App.undo.length;
      await UI.pmOK(); await idle();
      assert(UI.App.undo.length === u0 && rfPRF().entities[4].cx === 1.5 && Array.prototype.some.call(D.querySelectorAll('.toast'), function (t) { return /hold them where they are/.test(t.textContent); }), 'Keep relations: refused, nothing moved, no undo step');
      if (UI.hasPM()) UI.pmCancel();
      if (UI.App.undo.length > u0) { rfPRKey('z', { ctrlKey: true }); await idle(); }
      // Copy Entities dx 2
      UI.setTool('select'); await wait(20);
      await rfPRClick([1.75, 2]); var h2 = rfPRF().entities[5]; await rfPRClick([h2.cx + h2.r, h2.cy], { ctrlKey: true });
      UI.cmdCopyEntities(); await wait(40);
      D.querySelector('#pm input[value=xy]').click(); await wait(20);
      setInput(pmField('ΔX'), '2'); pressEnter(pmField('ΔX')); await wait(20);
      await UI.pmOK(); await idle();
      E = rfPRF().entities;
      assert(E.length === 8 && E[6].cx === 3.5 && E[6].r === 0.25 && rfPRF().dims.length === 4, 'two copies 2 to the right, no dimensions on them: ' + rfOICounts());
      // Rotate the copies 90 about the first copy's centre
      UI.setTool('select'); await wait(20); rfPREsc(1);
      await rfPRClick([3.75, 2]); h2 = rfPRF().entities[7]; await rfPRClick([h2.cx + h2.r, h2.cy], { ctrlKey: true });
      UI.cmdRotateEntities(); await wait(40);
      D.querySelectorAll('#pm .pm-pick')[1].click(); await wait(20);
      await rfPRClick([3.5, 2]); await wait(20);
      setInput(pmField('Angle'), '90'); pressEnter(pmField('Angle')); await wait(20);
      await UI.pmOK(); await idle();
      E = rfPRF().entities;
      near(E[7].cx, 3.4, 1e-9, 'the small copy turned 90° about the big one x'); near(E[7].cy, 3, 1e-9, 'y');
      // Scale x2 about the plate corner, Copy off
      UI.setTool('select'); await wait(20); rfPREsc(1);
      await rfPRClick([3.75, 2]);
      var g = rfPRF().entities[7]; await rfPRClick([g.cx + g.r, g.cy], { ctrlKey: true });
      UI.cmdScaleEntities(); await wait(40);
      D.querySelectorAll('#pm .pm-pick')[1].click(); await wait(20);
      await rfPRClick([3.5, 2]); await wait(20);
      setInput(pmField('Scale Factor'), '2'); pressEnter(pmField('Scale Factor')); await wait(20);
      await UI.pmOK(); await idle();
      E = rfPRF().entities;
      assert(E.length === 10 && E[8].r === 0.5 && E[9].r === 0.25 && /^Copied: 2/.test(statusText()), 'scaled copies x2 (Copy on by default): ' + JSON.stringify(E.slice(8)));
      // Stretch: a crossing box over the right edge, dx 1: the 6 becomes 7
      UI.setTool('select'); await wait(20); rfPREsc(1);
      UI.cmdStretchEntities(); await wait(40);
      await rfPRDrag([6.4, 4.4], [5.6, -0.3]);
      D.querySelector('#pm input[value=xy]') && D.querySelector('#pm input[value=xy]').click(); await wait(20);
      setInput(pmField('ΔX'), '1'); pressEnter(pmField('ΔX')); await wait(20);
      await UI.pmOK(); await idle();
      assert(rfPRF().entities[1].x1 === 7 && rfOIDims().indexOf('7.000') === 0, 'stretched: the width reads 7: ' + rfOIDims());
      // Ctrl-drag a hole: a copy
      UI.setTool('select'); await wait(20); rfPREsc(1);
      var h0 = rfPRF().entities[4];
      await rfPRDrag([h0.cx, h0.cy + h0.r], [h0.cx + 0.5, h0.cy + h0.r + 1], 8, { ctrlKey: true });
      E = rfPRF().entities;
      assert(E.length === 11 && E[10].t === 'circle' && E[10].r === 0.25 && E[4].cx === 1.5 && /^Copied 1 entity/.test(statusText()), 'Ctrl+drag made a copy, the hole stayed: ' + statusText());
      near(E[10].cx, 2, 0.05, 'the copy where it was dropped x'); near(E[10].cy, 3, 0.05, 'y');
      log.push(await rfPRUndoAll() + ' undos');
      // Ctrl+C the two holes, a new sketch on Top, Ctrl+V
      UI.setTool('select'); await wait(20);
      await rfPRClick([1.75, 2]); h2 = rfPRF().entities[5]; await rfPRClick([h2.cx + h2.r, h2.cy], { ctrlKey: true });
      rfPRKey('c', { ctrlKey: true }); await wait(30);
      UI.exitSketch(); await idle();
      await UI.newSketchOnPlane('Top'); await idle(); rfPRFrame(10, 6.5, 0.1, 0.85);
      var g2 = rfPRF(); g2._u0 = UI.App.undo.length;
      rfPREv('mousemove', rfPRScr([3, 1])); await wait(20);
      rfPRKey('v', { ctrlKey: true }); await idle(); await wait(30);
      await rfPRClick([3, 1]); await idle();
      assert(rfPRF().entities.length === 2 && rfOIDims() === 'Ø.500|Ø.250|1.000', 'pasted with their dimensions: ' + rfOIDims());
      log.push(await rfPRUndoAll() + ' undos');
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });

  step('rfOI flow 7: arcs from a print: a Line chain with A pressed for a tangent arc (one arc, back to lines), closed on the origin; Smart Dimension on the arc then its two end points (shared with the lines) gives its arc length (defect 6: the end point picked belonged to the line, so a distance from the arc centre was made: 1.000, not ⌒3.142), typed 3 1/2; a radius on it is offered as driven (over-defining); two circles 2 apart made Equal from the context toolbar; the distance between them set to Max on the first circle in the Dimension PM (Leaders): 2.400, the circles do not move; undo / redo, edit again', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Front', 10, 6.5, 0.15, 0.8);
      UI.setTool('line'); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([3, 0]);
      rfPRKey('a'); await wait(20);
      rfPREv('mousemove', rfPRScr([4, 1])); await wait(20);
      await rfPRClick([3, 2]);
      assert(rfPREnts() === '0:line 1:arc' && !UI.App.toolState.arcMode, 'A: one tangent arc, then lines again: ' + rfPREnts());
      await rfPRClick([0, 2]); await rfPRClick([0, 0]); await rfPREsc(2);
      assert(rfOIRelTexts().indexOf('tangent(1,0)') >= 0 && rfOIRelTexts().indexOf('tangent(2,1)') >= 0, 'tangent both ends: ' + rfOIRelTexts());
      var arc = f.entities.filter(function (e) { return e.t === 'arc'; })[0];
      UI.setTool('dimension'); await wait(20);
      var mid = [arc.cx + arc.r * Math.cos((arc.a0 + arc.a1) / 2 * Math.PI / 180), arc.cy + arc.r * Math.sin((arc.a0 + arc.a1) / 2 * Math.PI / 180)];
      var dw = UI.dimMidDwell(); UI.dimMidDwell(1e9);
      try { await rfPRClick(mid); await rfPRClick([3, 0]); await rfPRClick([3, 2]); await rfPRClick([mid[0] + 0.6, mid[1]]); await wait(40); } finally { UI.dimMidDwell(dw); }
      var inp = D.querySelector('#dim-edit input');
      assert(inp && !$('dim-edit').hidden && inp.value === '3.1416', 'the arc length in the Modify box: ' + (inp && inp.value));
      setInput(inp, '3 1/2'); pressEnter(inp); await wait(60);
      arc = f.entities.filter(function (e) { return e.t === 'arc'; })[0];
      near(arc.r * Math.PI, 3.5, 1e-9, 'the arc is 3 1/2 long'); assert(rfOIDims() === '⌒3.500', rfOIDims());
      arc = f.entities.filter(function (e) { return e.t === 'arc'; })[0];
      mid = [arc.cx + arc.r * Math.cos((arc.a0 + arc.a1) / 2 * Math.PI / 180), arc.cy + arc.r * Math.sin((arc.a0 + arc.a1) / 2 * Math.PI / 180)];
      var m45 = [arc.cx + arc.r * Math.cos(-Math.PI / 4), arc.cy + arc.r * Math.sin(-Math.PI / 4)];
      UI.setTool('dimension'); await wait(20);
      await rfPRClick(m45); await rfPRClick([m45[0] + 0.7, m45[1] - 0.5]); await wait(50);
      assert(modalOpen() && $('drv-driven'), 'R over-defines: Make Dimension Driven?');
      if (modalOpen() && $('drv-driven')) { $('drv-driven').click(); await wait(40); }
      rfPREsc(2); await wait(20);
      assert(rfOIDims() === '(R1.114)|⌒3.500', 'driven R: ' + rfOIDims());
      UI.setTool('circle'); await wait(30);
      await rfPRClick([6, 1]); await rfPRClick([6.5, 1]); await rfPRClick([8, 1.2]); await rfPRClick([8.3, 1.2]); await rfPREsc(2);
      var n = f.entities.length, c1 = f.entities[n - 2], c2 = f.entities[n - 1];
      await rfPRDim([[c1.cx + c1.r, c1.cy], [c2.cx - c2.r, c2.cy]], [7, 2.2], null);
      UI.setTool('select'); await wait(20); rfPREsc(1);
      await rfPRClick([c1.cx + c1.r, c1.cy]); await rfPRClick([c2.cx + c2.r, c2.cy], { ctrlKey: true }); await wait(30);
      var eb = D.querySelector('#sk-ctx [data-rel="equal"]'); assert(eb, 'Make Equal offered'); eb.click(); await wait(40);
      near(c1.r, c2.r, 1e-9, 'equal circles');
      rfPREsc(1); await wait(20);
      var lab = rfPRLabelEl(/^2\.0/); rfPRLabelPress(lab); await wait(60);
      var ac0 = D.querySelector('#pm select[data-key="ac0"]');
      assert(ac0, 'First arc condition in ' + UI.pmTitle());
      var x1 = c1.cx; ac0.value = 'max'; ac0.dispatchEvent(new W.Event('change', { bubbles: true })); await wait(40);
      var ri = f.rels.map(function (r, i) { return r.type === 'distance' && r.refs.join() === (n - 2) + ',' + (n - 1) ? i : -1; }).filter(function (i) { return i >= 0; })[0];
      near(f.rels[ri].v, 2 + c1.r, 1e-9, 'Max on the first circle'); assert(f.rels[ri].ac[0] === 'max' && c1.cx === x1, 'the circles stay: ' + JSON.stringify(f.rels[ri]));
      UI.pmOK && UI.pmOK(); await idle();
      log.push(rfOIDims());
      log.push(await rfPRUndoAll() + ' undos');
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });

  step('rfOI flow 8: rapid sketching without lifting the tool: a Corner Rectangle started on the origin (Coincident to it, Horizontal / Vertical sides), Smart Dimension straight after it (Enter accepts each value, the tool stays), Esc; Enter repeats the last command (defect 7: Enter did nothing with the Select tool); a Line typed on screen (2, Tab, 30, Enter: the angle kept as a dimension); a line drawn with Ctrl held gets no Horizontal; the S shortcut bar opens by the pointer; the relation and dimension counts after each step', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Front', 10, 6.5, 0.15, 0.8);
      UI.setTool('rect'); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([4, 2.5]); await rfPREsc(2);
      assert(rfPRRels().indexOf('coincident(0.p1,O)') >= 0 && rfPRRels().filter(function (r) { return /^(horizontal|vertical)\(\d\)$/.test(r); }).length === 4, 'started on the origin: ' + rfOIRelTexts());
      log.push('rect ' + rfOICounts());
      // Smart Dimension: width, Enter; height, Enter; the tool stays
      UI.setTool('dimension'); await wait(20);
      var dw = UI.dimMidDwell(); UI.dimMidDwell(1e9);
      try {
        await rfPRClick([2, 0]); await rfPRClick([2, -0.6]); await wait(40);
        var inp = D.querySelector('#dim-edit input'); setInput(inp, '4 1/2'); pressEnter(inp); await wait(60);
        assert(UI.App.tool === 'dimension', 'Smart Dimension stays after Enter: ' + UI.App.tool);
        await rfPRClick([4.5, 1.25]); await rfPRClick([5.1, 1.25]); await wait(40);
        inp = D.querySelector('#dim-edit input'); setInput(inp, '2 3/4'); pressEnter(inp); await wait(60);
      } finally { UI.dimMidDwell(dw); }
      assert(rfPRAn().status === 'full' && f.dims.length === 2, 'fully defined by two dimensions: ' + rfOICounts());
      await rfPREsc(2);
      assert(UI.App.tool === 'select', 'Esc: Select');
      // Enter repeats the last command (Smart Dimension)
      var ev = rfPRKey('Enter'); await wait(30);
      assert(UI.App.tool === 'dimension', 'Enter repeats Smart Dimension: ' + UI.App.tool + ' / ' + statusText());
      await rfPREsc(2);
      // a Line typed on screen: 2 at 30°
      UI.setTool('line'); await wait(30);
      await rfPRClick([4.5, 2.75]);
      await rfPRTypeSeg('2', 30);
      await rfPREsc(2);
      var L = f.entities[f.entities.length - 1];
      near(Math.hypot(L.x2 - L.x1, L.y2 - L.y1), 2, 1e-9, 'typed length'); near(Math.atan2(L.y2 - L.y1, L.x2 - L.x1) * 180 / Math.PI, 30, 1e-9, 'typed angle');
      log.push('typed line ' + rfOICounts() + ' ' + rfOIDims());
      // Enter again: the Line tool back
      rfPRKey('Enter'); await wait(30);
      assert(UI.App.tool === 'line', 'Enter repeats Line: ' + UI.App.tool);
      // a level line drawn with Ctrl held: no Horizontal (SolidWorks: Ctrl suppresses the automatic relations)
      var r0 = (f.rels || []).length;
      await rfPRClick([0.5, 4], { ctrlKey: true }); await rfPRClick([2.5, 4], { ctrlKey: true }); await rfPREsc(2);
      assert((f.rels || []).length === r0, 'no relation added with Ctrl held: ' + rfOIRelTexts().split(' ').slice(r0).join(' '));
      UI.setTool('line'); await wait(30);
      await rfPRClick([0.5, 4.6]); await rfPRClick([2.5, 4.6]); await rfPREsc(2);
      assert((f.rels || []).length === r0 + 1 && /^horizontal/.test(rfPRRels().slice(-1)[0]), 'without Ctrl: Horizontal: ' + rfPRRels().slice(r0).join(' '));
      // S: the shortcut bar by the pointer
      rfPREv('mousemove', rfPRScr([3, 3])); await wait(20);
      rfPRKey('s'); await wait(60);
      var bar = D.querySelector('#scbar');
      assert(bar && bar.offsetWidth, 'S: the Shortcut Bar');
      rfPREsc(1); await wait(20);
      log.push(rfOICounts());
      log.push(await rfPRUndoAll() + ' undos');
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });
