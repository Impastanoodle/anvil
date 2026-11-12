  // ---- rfA: Sketch tab refinement — commit hooks (Dynamic Mirror for every drawing tool, no wrappers), ordinate edits
  // that move only the target, Sketch Text as a point (Smart Dimension, relations, drag), Sketch Fillet / Chamfer on
  // every pair, Straight Slot Overall Length, unit formatting of the sketch messages, and what a user's pass over the
  // drawing tools turned up (ui-sketch.js, ui-sketch-*.js, ui-relations.js, sketch-solver.js)
  var rfAErr0 = 0;
  function rfAEnts() { return UI.activeSketchFeature().entities; }
  function rfARels() { return (UI.activeSketchFeature().rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }); }
  function rfASym(i, j, ax) { return (UI.activeSketchFeature().rels || []).some(function (r) { if (r.type !== 'symmetric') return false; var e = r.refs.map(function (x) { return +String(x).split('.')[0]; }); return e[0] === i && e[1] === j && e[2] === ax; }); }
  function rfAType(s) { s.split('').forEach(function (ch) { selKey(ch); }); }
  // a press, moves (button held) and release in the graphics area, in sketch coordinates
  async function rfADrag(a, b) { var p = rskScr(a), q = rskScr(b); await selDrag(p, q); }
  // the screen point of a text's first stroke (a press on its letters)
  function rfATextAt(e) { var s = K.textLayout(e).strokes.filter(function (x) { return x.t === 'line'; })[0]; return [(s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2]; }
  async function rfAText(str, at) {
    var n0 = UI.activeSketchFeature().entities.length;
    UI.setTool('text'); await wait(10);
    txtType(str);
    selEv('mousemove', rskScr(at)); rskClick(at); await wait(10);
    UI.closePM(); await wait(10);
    var f = UI.activeSketchFeature();
    for (var i = n0; i < f.entities.length; i++) if (f.entities[i].t === 'text' && f.entities[i].str === str) return i;
    return -1;
  }
  step('rfA: sketch hooks — Dynamic Mirror mirrors what every drawing tool places in the same click and the same undo step (circle, rectangle, polygon, straight slot, point, ellipse, spline, text, Parallel Line), each copy held Symmetric; no redraw function is wrapped and the arc slot\'s width step leaves its points\' forEach alone', async function () {
    rfAErr0 = errors.length;
    await rskNew();
    UI.App.view.showGrid = false;
    var f = fxSk([{ t: 'line', x1: 0, y1: -60, x2: 0, y2: 60, construction: true }]);
    assert(!UI.updateSketches._dyn && !UI.updateTemp._dyn && !(UI.sketchRegionObjects && UI.sketchRegionObjects._dyn), 'no Dynamic Mirror wrappers on the redraw functions');
    assert(typeof UI.afterSketchCommit === 'function' && UI.sketchCommitHooks.length >= 1, 'commit hooks');
    UI.setSelection([{ kind: 'entity', index: 0 }]); UI.cmdDynamicMirror();
    assert(UI.dynamicMirrorOn(), 'Dynamic Mirror on');
    var done = [];
    async function tool(name, clicks, extra) {
      var n0 = rfAEnts().length, u0 = UI.App.undo.length;
      UI.setTool(name); await wait(10);
      for (var k = 0; k < clicks.length; k++) { selEv('mousemove', rskScr(clicks[k])); rskClick(clicks[k]); }
      if (extra) await extra();
      await wait(10);
      var n1 = rfAEnts().length, made = (n1 - n0) / 2;
      assert(made >= 1 && n1 - n0 === 2 * made, name + ': ' + (n1 - n0) + ' entities added: ' + JSON.stringify(rfAEnts().slice(n0)));
      for (var q = 0; q < made; q++) assert(rfASym(n0 + q, n0 + made + q, 0), name + ': copy ' + (n0 + made + q) + ' Symmetric to ' + (n0 + q) + ': ' + rfARels().join(' '));
      assert(UI.App.undo.length === u0 + 1, name + ': one undo step, got ' + (UI.App.undo.length - u0));
      UI.cancelTool();   // the tool down, Dynamic Mirror still on (one Esc would end both since 2026-10-14)
      done.push(name);
    }
    await tool('circle', [[20, 25], [25, 25]]);
    await tool('rect', [[8, 12], [16, 20]]);
    await tool('polygon', [[32, 15], [36, 15]]);
    await tool('slot', [[8, -5], [20, -5], [14, -3]]);
    await tool('point', [[10, 4]]);
    await tool('ellipse', [[32, -8], [38, -8], [32, -6]]);
    await tool('spline', [[4, -14], [10, -11], [16, -14]], async function () { rskDbl([22, -12]); });
    // Text: its click places it and puts the tool down; the copy is the mirrored text
    var n0 = rfAEnts().length, u0 = UI.App.undo.length;
    var ti = await rfAText('AB', [12, -24]);
    var tx = rfAEnts();
    assert(ti === n0 && tx.length === n0 + 2 && tx[n0 + 1].t === 'text' && tx[n0 + 1].flipV && Math.abs(tx[n0 + 1].x + tx[n0].x) < 1e-9 && rfASym(n0, n0 + 1, 0) && UI.App.undo.length === u0 + 1, 'text mirrored in one step: ' + JSON.stringify(tx.slice(n0)) + ' undo ' + (UI.App.undo.length - u0));
    done.push('text');
    // Parallel Line (a command that places lines): through a point, mirrored too
    var li = rfAEnts().length;
    UI.setTool('line'); var tl0 = UI.App.tool + '/' + UI.pmTitle(); rskClick([28, -26]); var tl1 = JSON.stringify(UI.App.toolState.pts) + ' ' + $('status-msg').textContent; rskClick([42, -26]);
    assert(rfAEnts().length === li + 2, 'line drawn and mirrored: ' + tl0 + ' | ' + tl1 + ' | ' + JSON.stringify(rfAEnts().slice(li)));
    selKey('Escape'); selKey('Escape');
    UI.setSelection([{ kind: 'entity', index: 0 }]); UI.cmdDynamicMirror();
    assert(UI.dynamicMirrorOn(), 'on again');
    n0 = rfAEnts().length; u0 = UI.App.undo.length;
    UI.setSelection([]); UI.App.sel = null;
    UI.cmdParallelLine(); await wait(10);
    [["place", "point"], ["lenMode", "same"]].forEach(function (q) { var rb = D.querySelector("#pm input[type=radio][value=\"" + q[1] + "\"]"); if (rb && !rb.checked) rb.click(); });   // (the PM keeps the last settings)
    await wait(10);
    assert(UI.pmTitle() === 'Parallel Line', 'PL PM: ' + UI.pmTitle() + ' tool ' + UI.App.tool + ' msg ' + $('status-msg').textContent);
    rskClick([35, -26]); await wait(10);
    assert(/passes through/.test($('status-msg').textContent), 'reference picked: ' + $('status-msg').textContent + ' ents ' + JSON.stringify(rfAEnts().slice(-3)));
    selEv('mousemove', rskScr([32, -22])); rskClick([32, -22]); await wait(10);
    enterTwice(UI.sketchNumBox()[0]); await wait(10);   // lane BP: the click places the preview and asks for the distance; Enter commits, Enter makes the line
    var pe = rfAEnts();
    assert(pe.length === n0 + 2 && pe[n0].t === 'line' && Math.abs(pe[n0].y1 + 22) < 1e-9 && pe[n0 + 1].t === 'line' && Math.abs(pe[n0 + 1].x1 + pe[n0].x1) < 1e-9 && rfASym(n0, n0 + 1, 0) && UI.App.undo.length === u0 + 1, 'Parallel Line mirrored: ' + JSON.stringify(pe.slice(n0)) + ' ' + rfARels().slice(-3).join(' '));
    done.push('Parallel Line');
    UI.closePM(); await wait(10);
    selKey('Escape'); selKey('Escape');
    assert(!UI.dynamicMirrorOn(), 'Esc twice: off');
    // the arc slot's width step: its own points are not offered as snaps, without touching st.pts.forEach
    await rskNew();
    UI.setTool('aslot3'); rskClick([-50, -10]); rskClick([-30, -10]); selEv('mousemove', rskScr([-40, 0])); rskClick([-40, 0]);
    var st = UI.App.toolState;
    assert(st.pts.length === 3 && st.pts.forEach === W.Array.prototype.forEach && UI.sketchToolDefs.aslot3.noOwnSnap(st), 'width step: noOwnSnap, forEach untouched');
    selEv('mousemove', rskScr([-40, 0.6])); rskClick([-40, 0.6]); await wait(10);
    var as = rfYSlotOf(rfAEnts(), rfAEnts().length - 5);
    assert(as.t === 'aslot' && as.w > 0.5 && as.w < 2, 'width click near the third point taken: ' + JSON.stringify(as));
    selKey('Escape');
    return 'mirrored: ' + done.join(', ');
  });
  step('rfA: ordinate dimensions — editing a member in an under-defined sketch moves only the target and what hangs on it: the zero (a rectangle\'s left side) stays, another sketch piece is not dragged along, the other members keep their values', async function () {
    await rskNew();
    function rect(x, y, w, h, b) { return [{ t: 'line', x1: x, y1: y, x2: x + w, y2: y }, { t: 'line', x1: x + w, y1: y, x2: x + w, y2: y + h }, { t: 'line', x1: x + w, y1: y + h, x2: x, y2: y + h }, { t: 'line', x1: x, y1: y + h, x2: x, y2: y }]; }
    function rels(b) { var r = []; for (var k = 0; k < 4; k++) r.push({ type: 'coincident', refs: [(b + k) + '.p2', (b + (k + 1) % 4) + '.p1'] }); r.push({ type: 'horizontal', refs: [String(b)] }, { type: 'horizontal', refs: [String(b + 2)] }, { type: 'vertical', refs: [String(b + 1)] }, { type: 'vertical', refs: [String(b + 3)] }); return r; }
    var f = fxSk(rect(0, 0, 40, 20).concat(rect(50, 0, 10, 10), [{ t: 'circle', cx: 10, cy: 10, r: 2 }, { t: 'circle', cx: 30, cy: 10, r: 2 }]), rels(0).concat(rels(4)));
    var o = anvil.ordinate('x', '3', ['8.c', '9.c', '5'], -5);
    assert(o.members.length === 3, 'ordinate set: ' + JSON.stringify(o));
    var before = JSON.stringify(f.entities.slice(0, 4)), r1 = UI.editRelDim(o.members[1], '25');
    f = UI.activeSketchFeature();
    assert(r1.ok && JSON.stringify(f.entities.slice(0, 4)) === before, 'the zero side stays: ' + JSON.stringify(f.entities.slice(0, 4)));
    near(f.entities[9].cx, 25, 1e-6, 'the second hole moved to 25'); near(f.entities[8].cx, 10, 1e-6, 'the first member kept 10');
    near(f.entities[4].x1, 50, 1e-6, 'the other rectangle stayed');
    var r2 = UI.editRelDim(o.members[2], '55');
    f = UI.activeSketchFeature();
    assert(r2.ok && JSON.stringify(f.entities.slice(0, 4)) === before, 'zero still in place');
    near(f.entities[5].x1, 55, 1e-6, 'the second rectangle\'s right side at 55');
    near(f.entities[9].cx, 25, 1e-6, 'the hole kept its 25');
    return 'zero held; members 25, 55';
  });
  step('rfA: Sketch Text is a point to the solver — Smart Dimension from a point to the text (the text moves to the typed value), Add Relations offers Merge / Horizontal / Vertical for a text and a point, a text dragged by its letters snaps its insertion point onto a sketch point (Coincident on release) and then follows that point', async function () {
    await rskNew();
    var f = fxSk([{ t: 'point', x: 40, y: 10 }, { t: 'point', x: -20, y: -15 }]);
    var ti = await rfAText('HI', [10, 10]);
    f = UI.activeSketchFeature();
    var t = f.entities[ti];
    assert(ti === 2 && t.x === 10 && t.y === 10, 'text placed: ' + JSON.stringify(t));
    assert(W.SketchSolver.pointRefs(f, ti).length === 1 && W.SketchSolver.refKind(f, String(ti)) === 'point', 'its insertion point is a point ref');
    // Smart Dimension: the point, then the text (on a letter), then below them: a horizontal distance
    UI.setTool('dimension');
    rskClick([40, 10]);
    rskClick(rfATextAt(t));
    rskClick([25, 0]); await wait(20);
    var ri = (f.rels || []).length - 1, rel = f.rels[ri];
    assert(rel && rel.type === 'distance' && rel.refs.join() === '0,' + ti && Math.abs(rel.v - 30) < 1e-9, 'distance point → text: ' + JSON.stringify(rel));
    var ed = UI.editRelDim(ri, '22');
    t = UI.activeSketchFeature().entities[ti];
    assert(ed.ok, 'Modify ' + JSON.stringify(ed));
    near(t.x, 18, 1e-6, 'the text followed the dimension'); near(UI.activeSketchFeature().entities[0].x, 40, 1e-9, 'the point picked first stayed');
    UI.cancelDimEdit(); selKey('Escape'); selKey('Escape');
    // Add Relations: text + the second point
    UI.App.sel = null; UI.setSelection([]);
    UI.cmdAddRelations(); await wait(10);
    UI.App.command.onSketchPoint(null, rskScr(rfATextAt(t))[0], rskScr(rfATextAt(t))[1]);
    UI.App.command.onSketchPoint(null, rskScr([-20, -15])[0], rskScr([-20, -15])[1]);
    var labels = Array.prototype.map.call(D.querySelectorAll('#pm .pm-btns button'), function (x) { return x.textContent; });
    assert(labels.indexOf('Merge') >= 0 && labels.indexOf('Horizontal') >= 0 && labels.indexOf('Vertical') >= 0, 'offered: ' + labels.join(', '));
    clickPmButton('Vertical');
    await UI.pmOK(); await wait(10);
    t = UI.activeSketchFeature().entities[ti];
    f = UI.activeSketchFeature();
    assert(rfARels().indexOf('vertical:' + ti + ',1') >= 0 || rfARels().indexOf('vertical:1,' + ti) >= 0, 'Vertical added: ' + rfARels().join(' '));
    near(t.x, f.entities[1].x, 1e-6, 'Vertical holds: the text over the point');
    near(t.x - f.entities[0].x, -22, 1e-6, 'the distance still holds');
    return 'text at (' + fmt(t.x) + ', ' + fmt(t.y) + ')';
  });
  step('rfA: a Sketch Text dragged by its letters keeps the grab offset, its insertion point snaps onto a sketch point within reach and gets a Coincident on release; dragging that point then carries the text (the solver holds it)', async function () {
    await rskNew();
    fxSk([{ t: 'point', x: 40, y: 10 }]);
    var ti = await rfAText('HI', [10, 10]), f = UI.activeSketchFeature(), t = f.entities[ti];
    UI.setTool('select');
    // a plain move first: the text moves by the drag, no snap, no relation
    var g0 = rfATextAt(t);
    await rfADrag(g0, [g0[0] + 5, g0[1] + 3]);
    t = UI.activeSketchFeature().entities[ti];
    near(t.x, 15, 0.3, 'moved by the drag x'); near(t.y, 13, 0.3, 'moved by the drag y');
    assert(!(UI.activeSketchFeature().rels || []).length, 'no relation from a free move: ' + rfARels().join(' '));
    // then onto the point: within a few pixels the insertion point lands on it
    var grab = rfATextAt(t), off = [grab[0] - t.x, grab[1] - t.y];
    await rfADrag(grab, [40 + off[0] + 0.4, 10 + off[1] - 0.3]);
    f = UI.activeSketchFeature(); t = f.entities[ti];
    near(t.x, 40, 1e-9, 'snapped x'); near(t.y, 10, 1e-9, 'snapped y');
    assert(rfARels().indexOf('coincident:' + ti + ',0') >= 0, 'Coincident text–point on release: ' + rfARels().join(' '));
    // drag the point: the text follows
    await rfADrag([40, 10], [30, 20]);
    t = UI.activeSketchFeature().entities[ti];
    var p = UI.activeSketchFeature().entities[0];
    assert(Math.abs(p.x - 40) > 1 && Math.abs(t.x - p.x) < 1e-6 && Math.abs(t.y - p.y) < 1e-6, 'the text follows the point: ' + JSON.stringify([p, { x: t.x, y: t.y }]));
    assert(errors.length === rfAErr0, 'console errors: ' + errors.slice(rfAErr0).join(' | '));
    return 'text on the point at (' + fmt(t.x) + ', ' + fmt(t.y) + ')';
  });
  // Sketch Fillet / Chamfer through their PropertyManagers, entities picked with the mouse; f: the sketch after
  async function rfAFillet(ents, rels, r, clicks) {
    await rskNew();
    fxSk(ents, rels);
    UI.cmdSketchFillet(); await wait(10);
    setInput(pmField('Radius'), r);
    clicks.forEach(function (q) { selEv('mousemove', rskScr(q)); rskClick(q); });
    await wait(10);
    var f = UI.activeSketchFeature(), an = W.SketchSolver.analyze(f), msg = statusText();
    await UI.pmOK(); await wait(10);
    return { f: UI.activeSketchFeature(), an: an, msg: msg };
  }
  function rfAArc(f) { var a = f.entities.filter(function (e) { return e.t === 'arc' && !e.construction; }); return a[a.length - 1]; }
  function rfAFilletOk(res, label, r) {
    var f = res.f, k = f.entities.indexOf(rfAArc(f)), rr = (f.rels || []).filter(function (x) { return x.refs.indexOf(String(k)) >= 0 || x.refs.some(function (y) { return String(y).split('.')[0] === String(k); }); });
    assert(/^Fillet R/.test(res.msg), label + ': ' + res.msg);
    assert(k >= 0 && Math.abs(f.entities[k].r - r) < 1e-9, label + ': fillet arc R' + r + ' ' + JSON.stringify(f.entities));
    assert(rr.filter(function (x) { return x.type === 'tangent'; }).length === 2 && rr.filter(function (x) { return x.type === 'coincident'; }).length === 2, label + ': Tangent and Coincident at both ends: ' + rfARels().join(' '));
    assert((f.dims || []).some(function (d) { return d.e === k && d.k === 'r'; }), label + ': the R dimension: ' + JSON.stringify(f.dims));
    assert(res.an.conflicts === 0 && res.an.redundant === 0, label + ': solved, nothing over defining: ' + JSON.stringify([res.an.status, res.an.dof]));
    return k;
  }
  step('rfA: Sketch Fillet on every pair SolidWorks fillets — line–arc and arc–arc corners, line–circle and arc–circle (the circle stays whole), a line meeting a spline end (the spline cut back, Tangent), a polygon corner (still regular), two sides of a rectangle and a slot side with a line, each with Tangent + Coincident at both ends and its R dimension', async function () {
    var res, f, k;
    res = await rfAFillet([{ t: 'line', x1: -20, y1: 0, x2: 0, y2: 0 }, { t: 'arc', cx: 6, cy: 0, r: 6, a0: 90, a1: 180 }], [{ type: 'coincident', refs: ['0.p2', '1.p2'] }], 2, [[0, 0]]);
    rfAFilletOk(res, 'line–arc corner', 2);
    res = await rfAFillet([{ t: 'arc', cx: 0, cy: 0, r: 15, a0: 0, a1: 90 }, { t: 'arc', cx: 15, cy: 15, r: 15, a0: 180, a1: 270 }], [{ type: 'coincident', refs: ['0.p2', '1.p1'] }], 2, [[0, 15]]);
    rfAFilletOk(res, 'arc–arc corner', 2);
    res = await rfAFillet([{ t: 'line', x1: -20, y1: 0, x2: 20, y2: 0 }, { t: 'circle', cx: 0, cy: 10, r: 4 }], null, 4, [[-15, 0], [-4, 10]]);
    k = rfAFilletOk(res, 'line–circle', 4);
    f = res.f;
    assert(f.entities[1].t === 'circle' && f.entities[1].r === 4 && f.entities[0].x1 === -20 && Math.abs(f.entities[0].x2 - f.entities[k].cx) < 1e-6, 'the circle stays whole, the line ends under the fillet: ' + JSON.stringify(f.entities));
    res = await rfAFillet([{ t: 'arc', cx: 0, cy: -10, r: 20, a0: 0, a1: 180 }, { t: 'circle', cx: 0, cy: 15, r: 4 }], null, 2, [[-14.14, 4.14], [-4, 15]]);
    rfAFilletOk(res, 'arc–circle', 2);
    res = await rfAFillet([{ t: 'line', x1: -20, y1: 0, x2: 0, y2: 0 }, { t: 'spline', pts: [[0, 0], [6, 6], [15, 8]] }], [{ type: 'coincident', refs: ['0.p2', '1.p1'] }], 2, [[0, 0]]);
    k = rfAFilletOk(res, 'line–spline end', 2);
    f = res.f;
    var sp = f.entities[1], arc = f.entities[k], e1 = [arc.cx + 2 * Math.cos(arc.a1 * Math.PI / 180), arc.cy + 2 * Math.sin(arc.a1 * Math.PI / 180)];
    assert(sp.t === 'spline' && Math.hypot(sp.pts[0][0] - e1[0], sp.pts[0][1] - e1[1]) < 1e-5 && sp.pts[sp.pts.length - 1][0] === 15, 'the spline starts where the fillet ends: ' + JSON.stringify(sp) + ' ' + JSON.stringify(arc));
    res = await rfAFillet([{ t: 'poly', cx: 0, cy: 0, r: 15, n: 6, rot: 0 }], null, 3, [[15, 0]]);
    k = rfAFilletOk(res, 'polygon corner', 3);
    f = res.f;
    var sides = f.entities.filter(function (e) { return e.t === 'line' && !e.construction; });
    assert(sides.length === 6 && f.entities.some(function (e) { return e.t === 'circle' && e.construction && e.r === 15 && e.cx === 0 && e.cy === 0; }), 'six sides and the construction circle, unmoved: ' + JSON.stringify(f.entities));
    near(Math.hypot(sides[1].x2 - sides[1].x1, sides[1].y2 - sides[1].y1), 15, 1e-6, 'an untouched side is still 15');
    assert(f.entities.some(function (e) { return e.t === 'point' && e.sharp && Math.abs(e.x - 15) < 1e-9 && Math.abs(e.y) < 1e-9; }), 'the corner is kept as a virtual sharp');
    res = await rfAFillet([{ t: 'rect', x: -10, y: -5, w: 20, h: 10 }], null, 2, [[0, -5], [10, 0]]);
    rfAFilletOk(res, 'two sides of a rectangle', 2);
    assert(res.f.entities.filter(function (e) { return e.t === 'line'; }).length === 4 && rfARels().filter(function (x) { return /^(horizontal|vertical):/.test(x); }).length === 4, 'the rectangle\'s lines keep Horizontal / Vertical: ' + rfARels().join(' '));
    res = await rfAFillet([{ t: 'slot', x1: -10, y1: 0, x2: 10, y2: 0, w: 6 }, { t: 'line', x1: 0, y1: 10, x2: 0, y2: 20 }], null, 2, [[6, 3.05], [0, 15]]);
    k = rfAFilletOk(res, 'slot side and a line', 2);
    near(res.f.entities[k].cx, 2, 1e-6, 'fillet right of the line'); near(res.f.entities[k].cy, 5, 1e-6, 'fillet above the slot side');
    return 'line–arc, arc–arc, line–circle, arc–circle, line–spline, polygon, rectangle sides, slot side';
  });
  step('rfA: Sketch Chamfer — Distance-distance (2 × 3) and Angle-distance (2 at 30°) at a corner of two lines, as SolidWorks: the chamfer line Coincident at both ends, a virtual sharp at the corner with the two distances (or the distance and the angle) driving it; two sides of a polygon chamfer too', async function () {
    await rskNew();
    fxSk([{ t: 'line', x1: -20, y1: 0, x2: 0, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 0, y2: 15 }], [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }]);
    UI.cmdSketchChamfer(); await wait(10);
    D.querySelector('#pm input[type=radio][value="distance"]').click(); await wait(10);
    var eq = D.querySelector('#pm input[type=checkbox][data-key="equal"]');
    if (eq && eq.checked) { eq.click(); await wait(10); }
    setInput(pmField('Distance 1'), 2); setInput(pmField('Distance 2'), 3);
    selEv('mousemove', rskScr([0, 0])); rskClick([0, 0]); await wait(10);
    var f = UI.activeSketchFeature(), ch = f.entities[2];
    assert(/^Chamfer 2 mm × 3 mm made/.test(statusText()), 'status: ' + statusText());
    assert(ch && ch.t === 'line' && Math.abs(ch.x1 + 2) < 1e-9 && Math.abs(ch.y1) < 1e-9 && Math.abs(ch.x2) < 1e-9 && Math.abs(ch.y2 - 3) < 1e-9, 'chamfer line (-2, 0)-(0, 3): ' + JSON.stringify(ch));
    assert(rfARels().indexOf('coincident:0.p2,2.p1') >= 0 && rfARels().indexOf('coincident:1.p1,2.p2') >= 0 && f.rels.filter(function (r) { return r.type === 'distance'; }).length === 2 && f.entities[3].sharp, 'Coincident ends, two distances from the sharp: ' + rfARels().join(' '));
    await UI.pmOK();
    await rskNew();
    fxSk([{ t: 'line', x1: -20, y1: 0, x2: 0, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 0, y2: 15 }], [{ type: 'coincident', refs: ['0.p2', '1.p1'] }]);
    UI.cmdSketchChamfer(); await wait(10);
    D.querySelector('#pm input[type=radio][value="angle"]').click(); await wait(10);
    setInput(pmField('Distance 1'), 2); setInput(pmField('Direction 1 Angle'), 30);
    selEv('mousemove', rskScr([0, 0])); rskClick([0, 0]); await wait(10);
    f = UI.activeSketchFeature(); ch = f.entities[2];
    assert(/^Chamfer 2 mm × 30° made/.test(statusText()), 'status: ' + statusText());
    near(Math.atan2(ch.y2 - ch.y1, ch.x2 - ch.x1) * 180 / Math.PI, 30, 1e-6, 'chamfer at 30° to the first line');
    near(ch.x1, -2, 1e-9, 'distance 2 along the first line');
    assert(f.rels.some(function (r) { return r.type === 'angle' && Math.abs(r.v - 30) < 1e-9; }), 'the angle drives it: ' + rfARels().join(' '));
    await UI.pmOK();
    await rskNew();
    fxSk([{ t: 'poly', cx: 0, cy: 0, r: 15, n: 6, rot: 0 }]);
    UI.cmdSketchChamfer(); await wait(10);
    D.querySelector('#pm input[type=radio][value="distance"]').click(); await wait(10);
    eq = D.querySelector('#pm input[type=checkbox][data-key="equal"]');
    if (eq && !eq.checked) { eq.click(); await wait(10); }
    setInput(pmField('Distance 1'), 2);
    selEv('mousemove', rskScr([15, 0])); rskClick([15, 0]); await wait(10);
    f = UI.activeSketchFeature();
    assert(/^Chamfer 2 mm made/.test(statusText()) && f.entities.filter(function (e) { return e.t === 'line' && !e.construction; }).length === 7, 'polygon corner chamfered: ' + statusText() + ' ' + JSON.stringify(f.entities));
    assert(W.SketchSolver.analyze(f).conflicts === 0, 'solved');
    await UI.pmOK();
    return 'chamfers 2 × 3, 2 at 30°, polygon corner';
  });
  step('rfA: Straight Slot Length ▸ Overall Length — a length typed while drawing is the overall length (30 typed, width 8 typed: centres 22 apart) and its dimension is the overall one (30); the Centerpoint Straight Slot keeps its centre (ends ±11); an overall length not more than the width is refused with its reason', async function () {
    await rskNew();
    UI.sketchCurveOptions({ overall: true, slotDims: false });
    try {
      UI.setTool('slot');
      rskClick([-15, 0]); selEv('mousemove', rskScr([0, 0]));
      selKey('3'); r3sType(UI.sketchNumBox()[0], '30'); r3sKey(UI.sketchNumBox()[0], 'Enter');
      selEv('mousemove', rskScr([0, 3]));
      assert(/(^|\s)L 30(\.00)?(\s|$)/.test($('status-coords').textContent), 'the readout shows the overall length 30: ' + $('status-coords').textContent);
      selKey('8'); r3sType(UI.sketchNumBox()[0], '8'); r3sKey(UI.sketchNumBox()[0], 'Enter');
      // rfH: the slot is its sides 0 / 2, end arcs 1 / 3 and construction centerline 4; the overall length is the
      // distance across the arcs' far sides, the width the distance between the sides
      var f = UI.activeSketchFeature(), s = f.entities[4];
      assert(s && s.t === 'line' && s.construction && f.entities[3].r === 4 && Math.abs(s.x1 + 15) < 1e-9 && Math.abs(s.x2 - 7) < 1e-9, 'centres 22 apart from -15: ' + JSON.stringify(f.entities));
      var od = (f.rels || []).filter(function (x) { return x.type === 'distance' && x.ac; })[0];
      assert(od && od.refs.join() === '3,1' && Math.abs(W.SketchSolver.measure(f, 'distance', od.refs, null, null, od.ac) - 30) < 1e-9 && Math.abs(od.v - 30) < 1e-9 && (f.rels || []).some(function (x) { return x.type === 'distance' && x.refs.join() === '0,2' && x.v === 8; }), 'Overall Length dimension 30 and the width: ' + JSON.stringify(f.rels));
      selKey('Escape');
      UI.setTool('cslot');
      rskClick([0, -15]); selEv('mousemove', rskScr([10, -15]));
      selKey('3'); r3sType(UI.sketchNumBox()[0], '30'); r3sKey(UI.sketchNumBox()[0], 'Enter');
      selEv('mousemove', rskScr([0, -12]));
      selKey('8'); r3sType(UI.sketchNumBox()[0], '8'); r3sKey(UI.sketchNumBox()[0], 'Enter');
      f = UI.activeSketchFeature(); s = f.entities[9];
      assert(s && s.t === 'line' && s.construction && Math.abs(s.x1 + 11) < 1e-9 && Math.abs(s.x2 - 11) < 1e-9 && Math.abs(s.y1 + 15) < 1e-9 && f.entities[8].r === 4 && f.entities[10].t === 'point', 'centerpoint slot: ends at ±11 about its centre: ' + JSON.stringify(f.entities.slice(5)));
      selKey('Escape');
      var n = f.entities.length;
      UI.setTool('slot');
      rskClick([-15, 15]); selEv('mousemove', rskScr([0, 15]));
      selKey('5'); r3sType(UI.sketchNumBox()[0], '5'); r3sKey(UI.sketchNumBox()[0], 'Enter');
      selEv('mousemove', rskScr([-12, 18]));
      selKey('8'); r3sType(UI.sketchNumBox()[0], '8'); r3sKey(UI.sketchNumBox()[0], 'Enter');
      assert(UI.activeSketchFeature().entities.length === n && /overall length 5 mm must be more than the slot width 8 mm/.test(statusText()), 'refused: ' + statusText());
      selKey('Escape'); selKey('Escape');
    } finally { UI.sketchCurveOptions({ overall: false }); }
    return 'overall 30 → centres 22; centerpoint ±11';
  });
  step('rfA: sketch messages use the part\'s units — in an inch part Sketch Fillet reports R.250 in (not R0.25), a fillet too large names its limit as R… in, Chamfer and the Offset status read .125 in, a value a relation holds reads .500 in', async function () {
    await rskNew();
    UI.App.model.units = 'in';
    try {
      fxSk([{ t: 'line', x1: -2, y1: 0, x2: 0, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 0, y2: 1.5 }], [{ type: 'coincident', refs: ['0.p2', '1.p1'] }]);
      UI.zoomView(0.01 / UI.cam.scale);
      UI.cmdSketchFillet(); await wait(10);
      setInput(pmField('Radius'), 0.25);
      selEv('mousemove', rskScr([0, 0])); rskClick([0, 0]); await wait(10);
      assert(/^Fillet R\.250 in made/.test(statusText()), 'fillet status: ' + statusText());
      await UI.pmOK();
      fxSk([{ t: 'line', x1: -2, y1: -2, x2: -1, y2: -2 }, { t: 'line', x1: -1, y1: -2, x2: -1, y2: -1.8 }], [{ type: 'coincident', refs: ['3.p2', '4.p1'] }]);
      var f = UI.activeSketchFeature(), r = W.SketchSolver.filletPair(f, W.SketchSolver.curveCorner(f, [-1, -2], 1e-6), 1);
      assert(!r.ok && /at most R\.200 in/.test(r.error), 'too large: ' + r.error);
      UI.cmdSketchChamfer(); await wait(10);
      D.querySelector('#pm input[type=radio][value="distance"]').click(); await wait(10);
      var eq = D.querySelector('#pm input[type=checkbox][data-key="equal"]');
      if (eq && !eq.checked) { eq.click(); await wait(10); }
      setInput(pmField('Distance 1'), 0.125);
      selEv('mousemove', rskScr([-1, -2])); rskClick([-1, -2]); await wait(10);
      assert(/^Chamfer \.125 in made/.test(statusText()), 'chamfer status: ' + statusText());
      await UI.pmOK();
      assert(UI.fmtLen(0.5) === '.500 in' && W.SketchSolver.fmtLen(1.25) === '1.250 in', 'fmtLen: ' + UI.fmtLen(0.5));
    } finally { UI.App.model.units = 'mm'; }
    return 'R.250 in, R.200 in, .125 in';
  });
  step('rfA: drawing tools as a user — an ellipse\'s minor axis click near its centre is taken (it snapped onto the centre and was refused); a tangent arc whose computed centre lands on a rectangle edge\'s midpoint infers nothing there; an outline typed segment by segment and closed on its start gets the closing Coincident and is Fully Defined; a line rotated 90° lands on exact coordinates', async function () {
    await rskNew();
    UI.setTool('ellipse');
    rskClick([0, 0]); selEv('mousemove', rskScr([12, 0])); rskClick([12, 0]); selEv('mousemove', rskScr([0, 1.5])); rskClick([0, 1.5]); await wait(10);
    var el = rfAEnts()[0];
    assert(el && el.t === 'ellipse' && Math.abs(el.ry - 1.5) < 0.3, 'narrow ellipse made: ' + JSON.stringify(rfAEnts()) + ' ' + statusText());
    selKey('Escape');
    await rskNew();
    // a line whose midpoint (10, 5) is where the tangent arc's centre will be computed
    fxSk([{ t: 'rect', x: 20, y: 0, w: 10, h: 10 }, { t: 'line', x1: 0, y1: -5, x2: 10, y2: -5 }, { t: 'line', x1: 5, y1: 5, x2: 15, y2: 5, construction: true }]);
    UI.setTool('tarc');
    rskClick([10, -5]); selEv('mousemove', rskScr([18, 1])); selEv('mousemove', rskScr([20, 5])); rskClick([20, 5]); await wait(10);
    var f = UI.activeSketchFeature(), ta = f.entities[3];
    assert(ta && ta.t === 'arc' && Math.abs(ta.cx - 10) < 1e-6 && Math.abs(ta.cy - 5) < 1e-6, 'tangent arc centred (10, 5): ' + JSON.stringify(ta));
    selKey('Escape'); selKey('Escape');
    assert(!rfARels().some(function (r) { return /(^|[,:])3\.c(,|$)/.test(r); }), 'no relation at the computed centre: ' + rfARels().join(' '));
    assert(rfARels().indexOf('tangent:3,1') >= 0 || rfARels().indexOf('tangent:1,3') >= 0, 'Tangent to the line: ' + rfARels().join(' '));
    assert(rfARels().some(function (r) { return /^midpoint:3\.p2,0\.e3$/.test(r); }), 'its clicked end on the rectangle edge\'s midpoint: Midpoint: ' + rfARels().join(' '));
    // an L outline by typed lengths, closed on its start point
    await rskNew();
    UI.setTool('line');
    rskClick([0, 0]);
    [[[20, 0.5], '40'], [[40.5, 10], '15'], [[30, 15.5], '25'], [[15.5, 30], '20'], [[10, 35.5], '15']].forEach(function (s) {
      selEv('mousemove', rskScr(s[0])); selKey(s[1].charAt(0)); r3sType(UI.sketchNumBox()[0], s[1]); r3sKey(UI.sketchNumBox()[0], 'Enter');
    });
    selEv('mousemove', rskScr([0.2, 20])); rskClick([0, 0]); await wait(10);
    f = UI.activeSketchFeature();
    assert(f.entities.length === 6 && rfARels().indexOf('coincident:5.p2,O') >= 0 && UI.sketchStatus().status === 'full', 'closed with a Coincident, Fully Defined: ' + rfARels().join(' ') + ' ' + JSON.stringify(UI.sketchStatus().status));
    selKey('Escape');
    // Rotate 90° about a free line's start
    await rskNew();
    fxSk([{ t: 'line', x1: 10, y1: 0, x2: 30, y2: 0 }]);
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    UI.cmdRotateEntities(); await wait(10);
    rskClick([10, 0]); await wait(10);
    setInput(pmField('Angle'), 90);
    await UI.pmOK(); await wait(10);
    var l0 = UI.activeSketchFeature().entities[0];
    assert(l0.x1 === 10 && l0.y1 === 0 && l0.x2 === 10 && l0.y2 === 20, 'rotated exactly: ' + JSON.stringify(l0));
    return 'ellipse ry ' + fmt(el.ry) + ', tangent arc free centre, L closed, rotated to (10, 20)';
  });
  step('rfA: the keyboard after Smart Dimension — Enter in the Modify box gives the keyboard back (the hidden box kept the focus: Esc no longer put the tool down), the status names the value with its unit; the Spline and Ellipse PropertyManagers close when Esc puts their tool down; an ordinate dimension\'s status has its unit', async function () {
    await rskNew();
    fxSk([{ t: 'circle', cx: 0, cy: 0, r: 5 }]);
    UI.setTool('dimension');
    rskClick([5, 0]); rskClick([10, 8]); await wait(10);
    var inp = $('dim-edit').querySelector('input');
    assert(UI.isDimEditOpen() && D.activeElement === inp, 'the Modify box has the keyboard');
    r3sType(inp, '12'); r3sKey(inp, 'Enter'); await wait(10);
    assert(!UI.isDimEditOpen() && D.activeElement !== inp, 'closed and the keyboard given back: ' + (D.activeElement && D.activeElement.tagName));
    assert(/Dimension set to 12 mm\./.test(statusText()) || /set to Ø12 mm\./.test(statusText()), 'status with the unit: ' + statusText());
    near(rfAEnts()[0].r, 6, 1e-9, 'Ø12');
    selKey('Escape'); selKey('Escape');
    assert(UI.App.tool === 'select' && !UI.hasPM(), 'Esc put Smart Dimension down: ' + UI.App.tool + ' ' + UI.pmTitle());
    ['spline', 'ellipse'].forEach(function (t) {
      UI.setTool(t);
      assert(UI.pmTitle() === (t === 'spline' ? 'Spline' : 'Ellipse'), t + ' PM');
      rskClick([-20, -10]); rskClick([-15, -8]);
      selKey('Escape');
      if (UI.App.tool !== 'select') selKey('Escape');
      assert(UI.App.tool === 'select' && !UI.hasPM(), t + ': tool and PM gone: ' + UI.App.tool + ' ' + UI.pmTitle());
    });
    await rskNew();
    fxSk([{ t: 'point', x: 0, y: 5 }, { t: 'point', x: 20, y: 5 }]);
    UI.cmdOrdinateDim('x'); await wait(10);
    rskClick([0, 5]); rskClick([0, -5]); rskClick([20, 5]); await wait(10);
    assert(/^Ordinate dimension 20 mm added/.test(statusText()), 'ordinate status: ' + statusText());
    await UI.pmOK();
    assert(errors.length === rfAErr0, 'console errors: ' + errors.slice(rfAErr0).join(' | '));
    return 'keyboard back, Spline / Ellipse PMs closed';
  });
  step('rfA: Snap to Model — a line started on a model edge (not at one of its points) lands on the edge at a round coordinate (x -15 on the block\'s bottom edge, not -14.95…), as a free point is rounded; the point is Coincident with a reference to the edge', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(BLOCK); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    UI.zoomView(0.25 / UI.cam.scale);
    var f = UI.activeSketchFeature(), pl = UI.activePlane();
    UI.setTool('line');
    // aim a third of a pixel off the edge and off the round x
    var px = UI.cam.scale, a = [-15 + 0.3 * px, 0.3 * px];
    selEv('mousemove', rskScr(a)); rskClick(a);
    selEv('mousemove', rskScr([-5, 0.2 * px])); rskClick([-5, 0.2 * px]); await wait(10);
    f = UI.activeSketchFeature();
    var l = f.entities[0];
    assert(l && l.t === 'line' && l.x1 === -15 && l.y1 === 0 && l.x2 === -5 && l.y2 === 0, 'on the edge at round coordinates: ' + JSON.stringify(l));
    // lane sketchref (local-2026-11-11b): a point drawn on a model edge is Coincident with a reference to that edge (rel.mref), as in SolidWorks; nothing else is added (sketchref2: the Coincident names the edge itself)
    var rfARs = f.rels || [];
    assert(rfARs.some(function (r) { return r.mref; }) && rfARs.some(function (r) { return r.type === 'coincident'; }), 'Coincident to a reference of the model edge: ' + rfARels().join(' '));
    assert(!rfARs.some(function (r) { return r.type !== 'horizontal' && r.type !== 'coincident' && !r.mref; }), 'no other relation: ' + rfARels().join(' '));
    selKey('Escape');
    UI.exitSketch(true); await idle();
    return 'line (-15, 0) → (-5, 0)';
  });
  // --- end rfA ---
