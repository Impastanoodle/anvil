  // --- sketch-refine: the Sketch tab refinement pass — splines and ellipses in Trim, Extend, Smart Dimension and
  // Coincident, a true infinite line (and the rays Trim makes of it), Snap to Model while dragging, Move / Rotate /
  // Pattern / Mirror of splines, ellipses and arc slots, relation icons on small entities
  function fxSk(ents, rels) { var f = UI.activeSketchFeature(); ents.forEach(function (e) { f.entities.push(JSON.parse(JSON.stringify(e))); }); if (rels) f.rels = JSON.parse(JSON.stringify(rels)); UI.updateSketches(); return f; }
  function fxSS() { return W.SketchSolver; }
  // how far spline b strays from spline a (the farthest of 200 points along b from a)
  function fxDev(a, b) { var S = fxSS(), fa = S.freeCurve(a), fb = S.freeCurve(b), m = 0; for (var k = 0; k <= 200; k++) m = Math.max(m, S.freeClosest(fa, fb.pt(fb.t0 + (fb.t1 - fb.t0) * k / 200)).d); return m; }
  function fxOn(e, p) { var S = fxSS(), c = S.freeClosest(S.freeCurve(e), p); return c.d; }
  step('sketch-refine: Trim on splines and ellipses — Trim to closest takes the span of a spline between the two lines crossing it (the hover shows it first; the pieces keep the spline\'s shape, their cut ends Coincident with the lines; Undo brings it back); a closed spline cut by a line leaves one open spline; an ellipse cut by a line, a partial ellipse with both ends on the line; a Power trim drag across that partial ellipse removes it', async function () {
    await rskNew();
    var S = fxSS(), orig = { t: 'spline', pts: [[0, 0], [10, 10], [20, 0], [30, 10], [40, 0]] };
    var f = fxSk([orig, { t: 'line', x1: 15, y1: -5, x2: 15, y2: 15 }, { t: 'line', x1: 35, y1: -5, x2: 35, y2: 15 }]);
    UI.cmdTrimEntities(); await wait(20);
    stRadio('mode', 'closest');
    var mid = S.freeCurve(f.entities[0]).pt(2.5);
    selEv('mousemove', rskScr(mid)); await wait(30);
    var span = D.querySelector('#dim-layer .sk-trim-span');
    assert(span && span.getAttribute('points').split(' ').length > 8, 'the span to go is shown along the curve');
    rskClick(mid);
    var sp = f.entities.filter(function (e) { return e.t === 'spline'; });
    assert(f.entities.length === 4 && sp.length === 2, 'two spline pieces: ' + JSON.stringify(f.entities));
    near(sp[0].pts[sp[0].pts.length - 1][0], 15, 1e-6, 'left piece ends on the line'); near(sp[1].pts[0][0], 35, 1e-6, 'right piece starts on the line');
    var dev = Math.max(fxDev(orig, sp[0]), fxDev(orig, sp[1]));
    assert(dev < 0.05, 'pieces keep the shape: ' + dev);
    var rs = stToolRels();
    assert(rs.indexOf('coincident:0.p2,2') >= 0 && rs.indexOf('coincident:1.p1,3') >= 0, 'cut ends on the lines: ' + rs.join(' '));
    stNoRedundant('spline trim');
    UI.pmOK(); UI.undo(); await wait(20);
    f = UI.activeSketchFeature();
    assert(f.entities.length === 3 && f.entities[0].t === 'spline' && f.entities[0].pts.length === 5, 'undo brings the spline back: ' + JSON.stringify(f.entities));
    // a closed spline and an ellipse
    await rskNew();
    f = fxSk([{ t: 'spline', pts: [[0, 0], [20, 0], [20, 20], [0, 20]], closed: true }, { t: 'line', x1: 10, y1: -10, x2: 10, y2: 30 }, { t: 'ellipse', cx: 60, cy: 0, rx: 10, ry: 5, rot: 0 }, { t: 'line', x1: 45, y1: 0, x2: 75, y2: 0 }]);
    var cl = S.freeCurve(f.entities[0]), left = S.freeClosest(cl, [-6, 10]).p;
    UI.cmdTrimEntities(); await wait(20); stRadio('mode', 'closest');
    rskClick(left);
    var o = f.entities[0];
    assert(o.t === 'spline' && !o.closed && Math.abs(o.pts[0][0] - 10) < 1e-6 && Math.abs(o.pts[o.pts.length - 1][0] - 10) < 1e-6, 'one open spline from the line round to the line: ' + JSON.stringify(o));
    rskClick([60, 5]);
    var pe = f.entities.filter(function (e) { return e.t === 'pellipse'; })[0];
    assert(pe && Math.abs(pe.a0 - 180) < 1e-6 && Math.abs(pe.a1 - 360) < 1e-6, 'partial ellipse (the lower half): ' + JSON.stringify(f.entities));
    var pi = f.entities.indexOf(pe), li = f.entities.length - 1;
    rs = stToolRels();
    assert(rs.indexOf('coincident:' + pi + '.p1,' + li) >= 0 && rs.indexOf('coincident:' + pi + '.p2,' + li) >= 0, 'ends on the line: ' + rs.join(' '));
    stNoRedundant('ellipse trim');
    stRadio('mode', 'power');
    await selDrag(rskScr([60, -2]), rskScr([60, -9]));
    assert(!f.entities.some(function (e) { return e.t === 'pellipse'; }), 'the partial ellipse went under the Power trim trail: ' + JSON.stringify(f.entities));
    UI.pmOK();
    return 'spline pieces within ' + dev.toFixed(4) + ' of the original';
  });
  step('sketch-refine: Extend Entities with splines — a line runs on exactly onto a spline in its way (Coincident on the spline); an open spline\'s end runs on along its end span to a line (a new end point there, Coincident); a partial ellipse runs on round its ellipse to a line; the hover previews the extension', async function () {
    await rskNew();
    var f = fxSk([{ t: 'spline', pts: [[0, 0], [10, 10], [20, 0], [30, 10]] }, { t: 'line', x1: 15, y1: -15, x2: 15, y2: -10 }]);
    UI.cmdExtendEntities(); await wait(20);
    selEv('mousemove', rskScr([15, -10.5])); await wait(30);
    assert(D.querySelector('#dim-layer .sk-preview'), 'extension previewed');
    rskClick([15, -10.5]);
    var l = f.entities[1];
    assert(fxOn(f.entities[0], [l.x2, l.y2]) < 1e-7 && stToolRels().indexOf('coincident:1.p2,0') >= 0, 'line end on the spline: ' + JSON.stringify(l) + ' ' + stToolRels().join(' '));
    UI.pmOK();
    await rskNew();
    f = fxSk([{ t: 'spline', pts: [[0, 0], [10, 10], [20, 5]] }, { t: 'line', x1: 30, y1: -20, x2: 30, y2: 20 }, { t: 'pellipse', cx: 0, cy: 40, rx: 20, ry: 10, rot: 0, a0: 0, a1: 60 }, { t: 'line', x1: -30, y1: 40, x2: 30, y2: 40 }]);
    UI.cmdExtendEntities(); await wait(20);
    rskClick([19.6, 5.3]);
    var s = f.entities[0];
    assert(s.pts.length === 4 && Math.abs(s.pts[3][0] - 30) < 1e-6 && stToolRels().indexOf('coincident:0.p2,1') >= 0, 'spline runs on to the line: ' + JSON.stringify(s) + ' ' + stToolRels().join(' '));
    var e2 = f.entities[2], p2 = [10, 40 + 10 * Math.sin(Math.PI / 3)];
    rskClick([p2[0] - 0.3, p2[1]]);
    assert(Math.abs(e2.a1 - 180) < 1e-6 && Math.abs(e2.a0) < 1e-9, 'partial ellipse round to the line: ' + JSON.stringify(e2));
    stNoRedundant('extend');
    UI.pmOK();
    return 'line → spline, spline → line, partial ellipse → line';
  });
  step('sketch-refine: Offset Entities on a spline and an ellipse gives splines at the offset distance (within 0.02); Trim away inside takes a spline\'s span between two bounding lines (Coincident ends)', async function () {
    await rskNew();
    var S = fxSS(), f = fxSk([{ t: 'spline', pts: [[0, 0], [10, 10], [20, 0]] }, { t: 'ellipse', cx: 50, cy: 0, rx: 10, ry: 5, rot: 20 }]);
    UI.setSelection([{ kind: 'entity', index: 0 }, { kind: 'entity', index: 1 }]);
    UI.cmdOffsetEntities(); await wait(20);
    UI.pmSetField('d', '2'); await wait(20);
    assert(UI.App.tempEntities.length === 2, 'previewed: ' + UI.App.tempEntities.length);
    await pmAccept();
    assert(f.entities.length === 4 && f.entities[2].t === 'spline' && f.entities[3].t === 'spline' && f.entities[3].closed, 'two spline copies: ' + JSON.stringify(f.entities.map(function (e) { return e.t; })));
    [[0, 2], [1, 3]].forEach(function (pr) {
      var a = S.freeCurve(f.entities[pr[0]]), b = S.freeCurve(f.entities[pr[1]]);
      for (var k = 0; k <= 100; k++) { var d = S.freeClosest(a, b.pt(b.t0 + (b.t1 - b.t0) * k / 100)).d; assert(Math.abs(d - 2) < 0.02, 'copy ' + pr[1] + ' at ' + d + ' from its base'); }
    });
    await rskNew();
    f = fxSk([{ t: 'spline', pts: [[0, 0], [10, 10], [20, 0], [30, 10], [40, 0]] }, { t: 'line', x1: 12, y1: -5, x2: 12, y2: 15 }, { t: 'line', x1: 28, y1: -5, x2: 28, y2: 15 }]);
    UI.cmdTrimEntities(); await wait(20); stRadio('mode', 'inside');
    rskClick([12, -3]); rskClick([28, -3]);
    rskClick(S.freeCurve(f.entities[0]).pt(2));
    var sp = f.entities.filter(function (e) { return e.t === 'spline'; });
    assert(sp.length === 2 && Math.abs(sp[0].pts[sp[0].pts.length - 1][0] - 12) < 1e-6 && Math.abs(sp[1].pts[0][0] - 28) < 1e-6, 'the span between the lines went: ' + JSON.stringify(sp));
    assert(stToolRels().indexOf('coincident:0.p2,2') >= 0 && stToolRels().indexOf('coincident:1.p1,3') >= 0, 'ends on the lines: ' + stToolRels().join(' '));
    UI.pmOK();
    return 'offsets within 0.02, inside trim';
  });
  step('sketch-refine: a point on a spline — Add Relations offers Coincident for a point and a spline and puts the point on it; dragged, the point slides along the spline; a line end dragged onto a spline gets a Coincident with it', async function () {
    await rskNew();
    var f = fxSk([{ t: 'spline', pts: [[0, 0], [10, 10], [20, 0], [30, 10]] }, { t: 'point', x: 15, y: 8 }, { t: 'line', x1: 40, y1: -10, x2: 50, y2: -10 }]);
    UI.setSelection([{ kind: 'entity', index: 1 }, { kind: 'entity', index: 0 }]);
    UI.cmdAddRelations(); await wait(20);
    var btn = Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (b) { return b.textContent.trim() === 'Coincident'; })[0];
    assert(btn, 'Coincident offered: ' + Array.prototype.map.call(D.querySelectorAll('#pm button'), function (b) { return b.textContent.trim(); }).join('|'));
    btn.click(); await wait(20);
    var p = f.entities[1];
    assert(fxOn(f.entities[0], [p.x, p.y]) < 1e-7 && stToolRels().indexOf('coincident:1,0') >= 0, 'point on the spline: ' + JSON.stringify(p) + ' ' + stToolRels().join(' '));
    UI.pmOK(); await wait(20);
    UI.setTool('select');
    await selDrag(rskScr([p.x, p.y]), rskScr([24, 3]));
    p = UI.activeSketchFeature().entities[1];
    assert(Math.abs(p.x - 15) > 2 && fxOn(UI.activeSketchFeature().entities[0], [p.x, p.y]) < 1e-6, 'slid along the spline: ' + JSON.stringify(p));
    f = UI.activeSketchFeature();
    var on = W.SketchSolver.freeCurve(f.entities[0]).pt(0.5);
    await selDrag(rskScr([40, -10]), [rskScr(on)[0] + 2, rskScr(on)[1] + 1]);
    f = UI.activeSketchFeature();
    assert(fxOn(f.entities[0], [f.entities[2].x1, f.entities[2].y1]) < 1e-7 && stToolRels().indexOf('coincident:2.p1,0') >= 0, 'line end dropped on the spline: ' + JSON.stringify(f.entities[2]) + ' ' + stToolRels().join(' '));
    stNoRedundant('point on spline');
    return 'point on spline, slid to x ' + p.x.toFixed(3);
  });
  step('sketch-refine: Smart Dimension on a spline — a click on the spline and a second click on it gives the distance between its ends; the spline then a point gives the distance from the spline\'s nearer end', async function () {
    await rskNew();
    var f = fxSk([{ t: 'spline', pts: [[0, 0], [10, 10], [20, 0], [30, 10]] }, { t: 'point', x: 40, y: 25 }]), fc = fxSS().freeCurve(f.entities[0]);
    UI.setTool('dimension');
    rskClick(fc.pt(0.45)); rskClick(fc.pt(2.55)); rskClick([15, -12]);
    await wait(20); dmDriven(); dmDone();
    var d = (f.rels || []).filter(function (r) { return r.type === 'distance'; })[0];
    assert(d && d.refs.join() === '0.p1,0.p2', 'end to end: ' + JSON.stringify(f.rels));
    near(W.SketchSolver.measure(f, 'distance', d.refs, d.dir), d.dir === 'h' ? 30 : d.dir === 'v' ? 10 : Math.hypot(30, 10), 1e-9, 'its value');
    if (UI.hasPM()) UI.pmCancel();
    UI.setTool('dimension');
    rskClick(fc.pt(2.7)); rskClick([40, 25]); rskClick([45, 15]);
    await wait(20); dmDriven(); dmDone();
    var d2 = (f.rels || []).filter(function (r) { return r.type === 'distance'; })[1];
    assert(d2 && d2.refs.join() === '0.p2,1', 'spline end to the point: ' + JSON.stringify(f.rels));
    if (UI.hasPM()) UI.pmCancel();
    selKey('Escape');
    return 'distances ' + f.rels.filter(function (r) { return r.type === 'distance'; }).map(function (r) { return r.refs.join('→') + ' ' + (+r.v).toFixed(3); }).join(', ');
  });
  step('sketch-refine: Move / Rotate / Pattern / Mirror carry splines, ellipses and arc slots — Rotate 90° about the origin turns a spline and a partial ellipse; a Circular Sketch Pattern of an arc slot round its own centre (slots on a bolt circle) makes 4 slots; Mirror about a centerline holds a spline\'s copy Symmetric point by point; Copy From/To lands on the rounded point clicked', async function () {
    await rskNew();
    var f = fxSk([{ t: 'spline', pts: [[5, 0], [10, 10], [20, 0]] }, { t: 'pellipse', cx: 10, cy: 20, rx: 5, ry: 3, rot: 30, a0: 0, a1: 120 }]);
    UI.setSelection([{ kind: 'entity', index: 0 }, { kind: 'entity', index: 1 }]);
    UI.cmdRotateEntities(); await wait(20);
    rskClick([0, 0]); await wait(20); UI.pmSetField('angle', '90'); await wait(20);
    await pmAccept();
    var s = f.entities[0], e = f.entities[1];
    assert(Math.abs(s.pts[0][0]) < 1e-9 && Math.abs(s.pts[0][1] - 5) < 1e-9 && Math.abs(s.pts[1][0] + 10) < 1e-9 && Math.abs(e.cx + 20) < 1e-9 && Math.abs(e.cy - 10) < 1e-9 && Math.abs(e.rot - 120) < 1e-9, 'turned: ' + JSON.stringify(f.entities));
    await rskNew();
    f = fxSk([{ t: 'aslot', cx: 0, cy: 0, r: 20, a0: 0, a1: 30, w: 4 }]);
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    UI.cmdCircularSketchPattern(); await wait(20);
    await pmAccept();
    var slots = f.entities.filter(function (x) { return x.t === 'aslot'; });
    assert(slots.length === 4 && slots.every(function (x, k) { return Math.abs(x.a0 - 90 * k) < 1e-6 && x.r === 20 && x.cx === 0; }), '4 arc slots round the centre: ' + JSON.stringify(slots));
    stNoRedundant('arc slot pattern');
    await rskNew();
    f = fxSk([{ t: 'spline', pts: [[5, 0], [10, 10], [20, 0]] }, { t: 'line', x1: 0, y1: -10, x2: 0, y2: 30, construction: true }, { t: 'circle', cx: 30, cy: 30, r: 3 }]);
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    UI.cmdMirrorEntities(); await wait(20);
    D.querySelectorAll('#pm .pm-pick')[1].click(); rskClick([0, 20]); await wait(20);
    await pmAccept();
    var sym = stToolRels().filter(function (r) { return /^symmetric:/.test(r); });
    assert(f.entities[3] && f.entities[3].t === 'spline' && sym.length === 3, 'mirrored spline held point by point: ' + stToolRels().join(' '));
    UI.setSelection([{ kind: 'entity', index: 2 }]);
    UI.cmdCopyEntities(); await wait(20);
    rskClick([30, 30]); rskClick([40.06, 35.04]); await wait(20);
    if (UI.hasPM()) await pmAccept();
    var cp = f.entities[f.entities.length - 1];
    assert(cp.t === 'circle' && cp.cx === 40 && cp.cy === 35, 'copy on the rounded point: ' + JSON.stringify(cp));
    return 'rotated, 4 slots, ' + sym.length + ' Symmetric, copy at (40, 35)';
  });
  step('sketch-refine: Snap to Model while dragging — a sketch point dragged to a few pixels off a model corner or the hole centre lands exactly there and adds no relation; with Ctrl held it lands where it is dropped', async function () {
    var f = await msBox('{ face: b, normal: [0, 0, 1] }, 0', 'DragSnap');
    f = UI.activeSketchFeature();
    f.entities.push({ t: 'point', x: 60, y: 40 });
    UI.updateSketches();
    var i = f.entities.length - 1, r0 = (f.rels || []).length;
    UI.setTool('select');
    var v = rskScr([0, 60]);
    await selDrag(rskScr([60, 40]), [v[0] + 4, v[1] + 3]);
    f = UI.activeSketchFeature();
    assert(f.entities[i].x === 0 && f.entities[i].y === 60 && (f.rels || []).length === r0, 'on the model corner, no relation: ' + JSON.stringify(f.entities[i]) + ' ' + JSON.stringify(f.rels));
    var h = rskScr([20, 10]);
    await selDrag(rskScr([0, 60]), [h[0] + 3, h[1] - 2]);
    f = UI.activeSketchFeature();
    assert(f.entities[i].x === 20 && f.entities[i].y === 10, 'on the hole centre: ' + JSON.stringify(f.entities[i]));
    var g = rskScr([50, 30]);
    await selDrag(rskScr([20, 10]), [g[0] + 3, g[1] + 2], null, { ctrlKey: true });
    f = UI.activeSketchFeature();
    assert(Math.abs(f.entities[i].x - 50) > 0.3 && Math.abs(f.entities[i].x - 50) < 2, 'Ctrl: no snap (the part centre is right there): ' + JSON.stringify(f.entities[i]));
    UI.exitSketch(true); await idle();
    return 'corner, hole centre, Ctrl free';
  });
  step('sketch-refine: a true infinite line — Horizontal through the origin it is Fully Defined (no end points to pin); a point far along it takes a Coincident; Trim between two lines leaves two rays (Collinear, each ending on its line); the script writes .infinite([[0, "p1"], [1, "p2"]]) and reads it back', async function () {
    await rskNew();
    var f = fxSk([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0, infinite: true }], [{ type: 'horizontal', refs: ['0'] }, { type: 'coincident', refs: ['O', '0'] }]);
    assert(UI.sketchStatus().status === 'full' && !fxSS().pointRefs(f, 0).length, 'Fully Defined, no end points: ' + JSON.stringify(UI.sketchStatus()));
    f.entities.push({ t: 'point', x: 80, y: 3 }); UI.updateSketches();
    var r = anvil.addRelation('coincident', ['1', '0']);
    f = UI.activeSketchFeature();
    assert(r && Math.abs(f.entities[1].y) < 1e-9 && Math.abs(f.entities[1].x - 80) < 1e-9, 'point on the line past its two points: ' + JSON.stringify(f.entities[1]));
    await rskNew();
    f = fxSk([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 5, infinite: true }, { t: 'line', x1: -20, y1: 10, x2: 40, y2: 10 }, { t: 'line', x1: -20, y1: -10, x2: 40, y2: -10 }]);
    UI.cmdTrimEntities(); await wait(20); stRadio('mode', 'closest');
    rskClick([10, 5]);
    var a = f.entities[0], b = f.entities[1];
    assert(a.infinite === 'p1' && b.infinite === 'p2' && a.x2 === -20 && a.y2 === -10 && b.x1 === 20 && b.y1 === 10, 'two rays: ' + JSON.stringify(f.entities));
    var rs = stToolRels();
    assert(rs.indexOf('collinear:0,1') >= 0 && rs.indexOf('coincident:1.p1,2') >= 0 && rs.some(function (x) { return /^coincident:0\.p2,3/.test(x); }), 'Collinear, ends on the lines: ' + rs.join(' '));
    UI.pmOK();
    var sc = anvil.script();
    assert(/\.infinite\(\[\[0,"p1"\],\[1,"p2"\]\]\)/.test(sc), 'script: ' + sc.slice(0, 400));
    await anvil.run(sc); await idle();
    var g = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    assert(g.entities[0].infinite === 'p1' && g.entities[1].infinite === 'p2', 'read back: ' + JSON.stringify(g.entities.slice(0, 2)));
    return 'rays ' + JSON.stringify([a.infinite, b.infinite]);
  });
  step('sketch-refine (rfBR): a small related sketch zoomed out to a third of its size draws no relation icons at all (none can sit on the curves)', async function () {
    await rskNew();
    var f = fxSk([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 10, y1: 0, x2: 10, y2: 6 }, { t: 'line', x1: 10, y1: 6, x2: 0, y2: 6 }, { t: 'line', x1: 0, y1: 6, x2: 0, y2: 0 }, { t: 'circle', cx: 5, cy: 3, r: 1.5 }],
      [{ type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }, { type: 'horizontal', refs: ['2'] }, { type: 'vertical', refs: ['3'] }, { type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'coincident', refs: ['2.p2', '3.p1'] }, { type: 'coincident', refs: ['3.p2', '0.p1'] },
        { type: 'coincident', refs: ['0.p1', 'O'] }, { type: 'horizontal', refs: ['4.c', '3.mid'] }, { type: 'vertical', refs: ['4.c', '0.mid'] }]);
    UI.zoomView(0.08 / UI.cam.scale); UI.App.dimsStale = false; UI.drawDims(); await wait(50);
    UI.zoomView(3); UI.App.dimsStale = false; UI.drawDims(); await wait(50);
    var n = D.querySelectorAll('#dim-layer g.rel-badge').length;
    assert(f.rels.length === 11 && n === 0, 'relations held (' + f.rels.length + '), icons drawn: ' + n);
    return f.rels.length + ' relations, no icons';
  });
  step('sketch-refine: no uncaught errors or console.error calls in any step', async function () {
    await idle();
    assert(errors.length === 0, errors.join('\n'));
  });
  // --- end sketch-refine ---
