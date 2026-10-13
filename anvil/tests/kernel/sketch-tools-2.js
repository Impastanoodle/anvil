  // --- sketch-tools: the Sketch tab's tools in sketch-solver.js (ui-sketch-tools.js drives them): Sketch Fillet on lines
  // and arcs, Sketch Chamfer, Offset Entities chains, Move / Copy / Rotate / Scale, Linear / Circular Sketch Pattern and
  // the Trim options. Exact geometry, no new redundancy, DOF unchanged, all or nothing on failure, script round trip ---
  group('sketch-tools: fillet, chamfer, offset, move, patterns, trim options');
  (function () {
    if (typeof SketchSolver === 'undefined') return;
    var SS = SketchSolver;
    function relList(s) { return (s.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }); }
    function keyOf(r) { return r.type + ':' + r.refs.slice().sort().join(',') + (r.dir || '') + (r.driven ? 'd' : ''); }
    function noRepeats(s) { var seen = {}; return (s.rels || []).every(function (r) { var k = keyOf(r); if (seen[k]) return false; seen[k] = true; return true; }); }
    function clean(s, a0, label) {
      var an = SS.analyze(s);
      assert(!an.redundant && !an.conflicts, label + ': ' + an.redundant + ' redundant, ' + an.conflicts + ' conflicts');
      assert(noRepeats(s), label + ': repeated relations ' + relList(s).join(' '));
      if (a0) assert(an.dof === a0.dof, label + ': DOF ' + a0.dof + ' -> ' + an.dof);
      return an;
    }
    function chainRect(w, h) {
      return { entities: [{ t: 'line', x1: 0, y1: 0, x2: w, y2: 0 }, { t: 'line', x1: w, y1: 0, x2: w, y2: h }, { t: 'line', x1: w, y1: h, x2: 0, y2: h }, { t: 'line', x1: 0, y1: h, x2: 0, y2: 0 }],
        rels: [{ type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }, { type: 'horizontal', refs: ['2'] }, { type: 'vertical', refs: ['3'] },
          { type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'coincident', refs: ['2.p2', '3.p1'] },
          { type: 'coincident', refs: ['0.p1', 'O'] }, { type: 'coincident', refs: ['3.p2', 'O'] }], dims: [{ e: 0, k: 'len' }, { e: 1, k: 'len' }] };
    }
    function tangentTo(arc, e) {   // the fillet arc touches e: its centre is r from a line, R ± r from an arc's centre
      if (e.t === 'line') { var d = Math.abs((e.x2 - e.x1) * (arc.cy - e.y1) - (e.y2 - e.y1) * (arc.cx - e.x1)) / Math.hypot(e.x2 - e.x1, e.y2 - e.y1); return Math.abs(d - arc.r); }
      var c = Math.hypot(arc.cx - e.cx, arc.cy - e.cy); return Math.min(Math.abs(c - (e.r + arc.r)), Math.abs(c - Math.abs(e.r - arc.r)));
    }

    test('sketch-tools: Sketch Fillet at a line–arc corner and an arc–arc corner — the fillet is tangent to both (exact), the entities end on it, DOF unchanged, no redundancy', function () {
      var s = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'arc', cx: 15, cy: 0, r: 5, a0: 0, a1: 180 }], rels: [{ type: 'coincident', refs: ['0.p2', '1.p2'] }] }, a0 = SS.analyze(s);
      var c = SS.curveCorner(s, [10, 0.2], 1);
      assert(c && c.i === 0 && c.j === 1, 'corner ' + JSON.stringify(c));
      var r = SS.filletPair(s, c, 1);
      assert(r.ok, r.error);
      var f = s.entities[r.arc];
      near(tangentTo(f, s.entities[0]), 0, 1e-9, 'tangent to the line'); near(tangentTo(f, s.entities[1]), 0, 1e-9, 'tangent to the arc');
      near(s.entities[0].x2, f.cx, 1e-9, 'the line ends at the tangent point');
      clean(s, a0, 'line–arc');
      var t = { entities: [{ t: 'arc', cx: 0, cy: 0, r: 10, a0: 0, a1: 90 }, { t: 'arc', cx: 10, cy: 10, r: 10, a0: 180, a1: 270 }], rels: [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['0.p1', '1.p2'] }] }, b0 = SS.analyze(t);
      var r2 = SS.filletPair(t, SS.curveCorner(t, [0, 10], 1), 2), g = t.entities[r2.arc];
      assert(r2.ok, r2.error);
      near(Math.hypot(g.cx, g.cy), 8, 1e-9, 'inside the first arc (10 − 2)'); near(Math.hypot(g.cx - 10, g.cy - 10), 8, 1e-9, 'inside the second');
      clean(t, b0, 'arc–arc');
      return 'line–arc R1 at (' + fmt(f.cx) + ', ' + fmt(f.cy) + '); arc–arc R2 at (' + fmt(g.cx) + ', ' + fmt(g.cy) + ')';
    });
    test('sketch-tools: Sketch Fillet of picked entities that do not meet (extended / trimmed to the fillet, the side clicked kept), Keep constrained corners off (no virtual sharp, the corner\'s dimensions go), Dimension each fillet off (Equal to the first fillet), a radius too large leaves the sketch untouched', function () {
      var s = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 8, y2: 0 }, { t: 'line', x1: 10, y1: 2, x2: 10, y2: 10 }] };
      var r = SS.filletPair(s, { i: 0, uvi: [2, 0], j: 1, uvj: [10, 8] }, 1);
      assert(r.ok, r.error);
      assert(s.entities[0].x2 === 9 && s.entities[1].y1 === 1 && s.entities[2].cx === 9 && s.entities[2].cy === 1, 'extended / trimmed to the fillet: ' + JSON.stringify(s.entities));
      var x = { entities: [{ t: 'line', x1: -10, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 0, y1: -10, x2: 0, y2: 10 }] };
      assert(SS.filletPair(x, { i: 0, uvi: [5, 0], j: 1, uvj: [0, 5] }, 1).ok && x.entities[0].x1 === 1 && x.entities[1].y1 === 1, 'crossing lines: the quadrant clicked ' + JSON.stringify(x.entities));
      var k = chainRect(8, 4);
      var rk = SS.filletCorner(k, SS.lineCorner(k, [0, 0], 1), 1, { keepCorner: false });
      assert(rk.ok && rk.sharp === -1 && !k.entities.some(function (e) { return e.sharp; }) && !relList(k).some(function (x) { return /O/.test(x); }), 'no sharp, the origin Coincident went: ' + relList(k).join(' '));
      clean(k, null, 'keep corners off');
      var q = chainRect(8, 4), a0 = SS.analyze(q);
      var f1 = SS.filletCorner(q, SS.lineCorner(q, [8, 0], 1), 1), f2 = SS.filletCorner(q, SS.lineCorner(q, [8, 4], 1), 1, { equalTo: f1.arc, dimension: false });
      assert(f1.ok && f2.ok, f1.error || f2.error);
      assert(q.dims.filter(function (d) { return d.k === 'r'; }).length === 1 && relList(q).indexOf('equal:' + f1.arc + ',' + f2.arc) >= 0, 'one R dimension + Equal: ' + relList(q).join(' '));
      assert(SS.setDim(q, q.dims.length - 1, 1.5).ok && Math.abs(q.entities[f2.arc].r - 1.5) < 1e-9, 'the Equal fillet follows the dimension');
      var an = clean(q, a0, 'equal fillets');
      assert(an.status === 'full', 'stays Fully Defined: ' + an.status);
      var u = chainRect(8, 4), before = JSON.stringify(u), bad = SS.filletCorner(u, SS.lineCorner(u, [8, 4], 1), 5);
      assert(!bad.ok && /Radius too large/.test(bad.error) && JSON.stringify(u) === before, 'refused, untouched: ' + bad.error);
      return bad.error;
    });
    test('sketch-tools: Sketch Chamfer — distance-distance (1 × 2) and angle-distance (1, 30°) at a dimensioned corner: exact chamfer line, virtual sharp with the chamfer\'s driving dimensions, still Fully Defined; a free corner keeps its DOF; a distance too large changes nothing', function () {
      var s = chainRect(8, 4), r = SS.chamferPair(s, SS.curveCorner(s, [8, 4], 1), { type: 'distance', d1: 1, d2: 2 }), c = s.entities[r.line];
      assert(r.ok, r.error);
      assert(c.x1 === 8 && c.y1 === 3 && c.x2 === 6 && c.y2 === 4, 'chamfer line ' + JSON.stringify(c));
      assert(s.entities[r.sharp].sharp && s.entities[r.sharp].x === 8 && s.entities[r.sharp].y === 4, 'virtual sharp');
      assert(SS.analyze(s).status === 'full', 'still Fully Defined');
      clean(s, null, 'distance-distance');
      var di = s.rels.map(function (x, i) { return x.type === 'distance' && x.v === 2 ? i : -1; }).filter(function (i) { return i >= 0; })[0];
      assert(SS.setRelValue(s, di, 3).ok && Math.abs(s.entities[r.line].x2 - 5) < 1e-9, 'Distance 2 drives the chamfer');
      var t = chainRect(8, 4), ra = SS.chamferPair(t, SS.curveCorner(t, [8, 0], 1), { type: 'angle', d1: 1, angle: 30 }), ca = t.entities[ra.line];
      assert(ra.ok, ra.error);
      near(ca.x1, 7, 1e-9, 'D1 along the bottom'); near(ca.y2, Math.tan(Math.PI / 6), 1e-9, 'at 30° from it');
      assert(SS.analyze(t).status === 'full' && relList(t).indexOf('angle:0,' + ra.line) >= 0, 'angle dimension, Fully Defined');
      clean(t, null, 'angle-distance');
      var f = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 8, y2: 0 }, { t: 'line', x1: 8, y1: 0, x2: 8, y2: 4 }], rels: [{ type: 'coincident', refs: ['0.p2', '1.p1'] }] }, a0 = SS.analyze(f);
      assert(SS.chamferPair(f, { i: 0, uvi: [2, 0], j: 1, uvj: [8, 3] }, { type: 'distance', d1: 1, equal: true }).ok, 'picked lines of a corner');
      clean(f, a0, 'free corner');
      var g = chainRect(8, 4), before = JSON.stringify(g), bad = SS.chamferPair(g, SS.curveCorner(g, [8, 4], 1), { type: 'distance', d1: 5, d2: 1 });
      assert(!bad.ok && JSON.stringify(g) === before, 'refused, untouched: ' + bad.error);
      return 'chamfer 1 × 2 and 1 @ 30°';
    });
    test('sketch-tools: Offset Entities on a chain — a Line-chain rectangle offset 1 out is a 10 × 6 rectangle of lines (sharp corners), one Offset relation and one driving dimension keep it Fully Defined; editing the offset or the base moves the chain', function () {
      var s = chainRect(8, 4), a0 = SS.analyze(s), r = SS.offsetSelection(s, [0], { d: 1 });
      assert(r.ok && r.added.length === 4, r.error);
      var o = r.added.map(function (i) { return s.entities[i]; });
      assert(JSON.stringify(o.map(function (e) { return [e.x1, e.y1, e.x2, e.y2]; })) === '[[-1,-1,9,-1],[9,-1,9,5],[9,5,-1,5],[-1,5,-1,-1]]', 'offset ' + JSON.stringify(o));
      var an = clean(s, a0, 'offset rectangle');
      assert(an.status === 'full' && relList(s).filter(function (x) { return /^offset:/.test(x); }).length === 1 && s.rels.filter(function (x) { return x.type === 'distance'; }).length === 1, 'one Offset, one dimension: ' + relList(s).join(' '));
      var di = s.rels.map(function (x, i) { return x.type === 'distance' ? i : -1; }).filter(function (i) { return i >= 0; })[0];
      assert(SS.setRelValue(s, di, 2).ok && s.entities[4].y1 === -2 && s.entities[5].x1 === 10, 'offset 2: ' + JSON.stringify(s.entities[5]));
      assert(SS.setDim(s, 0, 10).ok && s.entities[5].x1 === 12, 'base 10 wide: the copy follows ' + JSON.stringify(s.entities[5]));
      // with a fillet in the chain: the copy keeps the arc (concentric, R + 0.5) and the chain stays smooth
      var t = chainRect(8, 4);
      SS.filletCorner(t, SS.lineCorner(t, [8, 4], 1), 1);
      var b0 = SS.analyze(t), rt = SS.offsetSelection(t, [0], { d: 0.5 }), arc = rt.added.map(function (i) { return t.entities[i]; }).filter(function (e) { return e.t === 'arc'; })[0];
      assert(rt.ok && arc && arc.r === 1.5 && arc.cx === 7 && arc.cy === 3 && arc.a0 === 0 && arc.a1 === 90, 'offset arc ' + JSON.stringify(arc));
      clean(t, b0, 'filleted chain');
      return 'rectangle 10 × 6, then offset 2 and base 10: copy at x = 12';
    });
    test('sketch-tools: Offset Entities — Bi-directional with arc caps round an open L, Reverse goes inward, a single line and a circle as before, Select chain off takes only the selection, too large refuses and changes nothing', function () {
      var s = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 10, y1: 0, x2: 10, y2: 5 }], rels: [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }, { type: 'coincident', refs: ['0.p1', 'O'] }], dims: [{ e: 0, k: 'len' }, { e: 1, k: 'len' }] };
      var a0 = SS.analyze(s), r = SS.offsetSelection(s, [1], { d: 1, bi: true, cap: 'arc' }), g = r.added.map(function (i) { return s.entities[i]; });
      assert(r.ok && g.length === 6 && g[4].t === 'arc' && g[4].cx === 0 && g[4].r === 1 && g[4].a0 === 90 && g[4].a1 === 270 && g[5].cx === 10 && g[5].cy === 5 && g[5].a0 === 0 && g[5].a1 === 180, 'both sides and caps ' + JSON.stringify(g));
      assert(clean(s, a0, 'bi-directional').status === 'full', 'Fully Defined');
      var t = chainRect(8, 4), rt = SS.offsetSelection(t, [2], { d: 1, reverse: true });
      var inw = rt.added.map(function (i) { var e = t.entities[i]; return [e.x1, e.y1, e.x2, e.y2].join(','); }).sort().join(' ');
      assert(rt.ok && inw === '1,1,7,1 1,3,1,1 7,1,7,3 7,3,1,3', 'inward 6 × 2: ' + inw);
      var u = chainRect(8, 4), ru = SS.offsetSelection(u, [0], { d: 1, chain: false });
      assert(ru.ok && ru.added.length === 1 && Math.abs(u.entities[4].y1) === 1 && u.entities[4].x1 === 0 && u.entities[4].x2 === 8, 'Select chain off: one line ' + ru.added.length);
      var l = { entities: [{ t: 'line', x1: 0, y1: 30, x2: 30, y2: 30 }] }, rl = SS.offsetSelection(l, [0], { d: 4 });
      assert(rl.ok && l.entities[1].y1 === 34 && relList(l).indexOf('parallel:0,1') >= 0 && relList(l).indexOf('distance:0,1') >= 0 && SS.analyze(l).dof === 4, 'single line ' + relList(l).join(' '));
      var c = { entities: [{ t: 'circle', cx: 20, cy: 0, r: 8 }] }, rc = SS.offsetSelection(c, [0], { d: 3 });
      assert(rc.ok && c.entities[1].t === 'circle' && c.entities[1].r === 11 && relList(c).join() === 'concentric:0,1,distance:0,1', 'circle ' + relList(c).join(' '));
      var v = chainRect(8, 4), before = JSON.stringify(v), bad = SS.offsetSelection(v, [0], { d: 5, reverse: true });
      assert(!bad.ok && JSON.stringify(v) === before, 'too large inward: refused, untouched: ' + bad.error);
      return bad.error;
    });
    test('sketch-tools: Linear Sketch Pattern 3 × 2 of a dimensioned Ø hole — copies exact, one Pattern relation, Horizontal / Vertical and the X / Y spacing dimensions keep it Fully Defined; editing the spacing or the diameter moves / sizes every copy; a skipped first instance still works', function () {
      var s = { entities: [{ t: 'circle', cx: 1, cy: 1, r: 0.133 }], rels: [{ type: 'distance', refs: ['0.c', 'O'], v: 1, dir: 'h' }, { type: 'distance', refs: ['0.c', 'O'], v: 1, dir: 'v' }], dims: [{ e: 0, k: 'dia' }] }, a0 = SS.analyze(s);
      var r = SS.linearPattern(s, [0], { angle1: 0, spacing1: 3, count1: 3, angle2: 90, spacing2: 2, count2: 2, dimX: true, dimY: true });
      assert(r.ok && r.copies.length === 5, r.error);
      var pts = s.entities.map(function (e) { return fmt(e.cx) + ',' + fmt(e.cy); }).sort().join(' ');
      assert(pts === '1,1 1,3 4,1 4,3 7,1 7,3', 'positions ' + pts);
      assert(clean(s, a0, 'pattern').status === 'full' && relList(s).filter(function (x) { return /^pattern:/.test(x); }).length === 1, 'Fully Defined, one Pattern: ' + relList(s).join(' '));
      var dx = s.rels.map(function (x, i) { return x.type === 'distance' && x.dir === 'h' && x.refs[1] !== 'O' ? i : -1; }).filter(function (i) { return i >= 0; })[0];
      assert(SS.setRelValue(s, dx, 2.5).ok && s.entities.map(function (e) { return fmt(e.cx); }).sort().join() === '1,1,3.5,3.5,6,6', 'spacing 2.5 moves the columns');
      assert(SS.setDim(s, 0, 0.5).ok && s.entities.every(function (e) { return Math.abs(e.r - 0.25) < 1e-9; }), 'Ø.5 on every copy');
      var t = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 2, y2: 1 }] }, b0 = SS.analyze(t);
      var rt = SS.linearPattern(t, [0], { angle1: 0, spacing1: 5, count1: 4, count2: 1, skip: ['1,0'], dimX: true });
      assert(rt.ok && rt.copies.length === 2 && t.entities[1].x1 === 10 && t.entities[2].x1 === 15, 'instance 2 skipped ' + JSON.stringify(t.entities));
      clean(t, b0, 'skipped');
      return pts;
    });
    test('sketch-tools: Circular Sketch Pattern — 6 holes equally round 360° about the origin: exact positions, Fully Defined by the radius and angular spacing dimensions; editing the radius moves every hole', function () {
      var s = { entities: [{ t: 'circle', cx: 5, cy: 0, r: 0.5 }], rels: [{ type: 'horizontal', refs: ['0.c', 'O'] }], dims: [{ e: 0, k: 'dia' }] };
      var r = SS.circularPattern(s, [0], { cx: 0, cy: 0, count: 6, angle: 360, equal: true, dimRadius: true, dimAngle: true });
      assert(r.ok && r.copies.length === 5 && r.lines.length === 2, r.error);
      for (var k = 0; k < 6; k++) { var e = s.entities[k]; near(e.cx, 5 * Math.cos(k * Math.PI / 3), 1e-9, 'x ' + k); near(e.cy, 5 * Math.sin(k * Math.PI / 3), 1e-9, 'y ' + k); }
      assert(clean(s, null, 'circular').status === 'full', 'Fully Defined');
      var ri = s.dims.length - 1;
      assert(SS.setDim(s, ri, 8).ok, 'radius 8');
      for (var q = 0; q < 6; q++) near(Math.hypot(s.entities[q].cx, s.entities[q].cy), 8, 1e-9, 'on R8 ' + q);
      var t = { entities: [{ t: 'rect', x: 4, y: -0.5, w: 2, h: 1 }] }, rt = SS.circularPattern(t, [0], { cx: 0, cy: 0, count: 4, angle: 360, equal: true });
      assert(rt.ok && t.entities.filter(function (e) { return e.t === 'line' && !e.construction; }).length === 16, 'a rectangle turns as four lines: ' + t.entities.length);
      clean(t, null, 'rectangle pattern');
      return 'R5 → R8';
    });
    test('sketch-tools: Move / Rotate / Scale / Copy Entities — Keep relations drags what is tied to the selection (Stretch), cleared it breaks those ties; a fixed one is refused unchanged; a quarter turn swaps Horizontal / Vertical; Scale with Copy makes 2 copies with their relations', function () {
      var s = { entities: [{ t: 'circle', cx: 0, cy: 0, r: 1 }, { t: 'line', x1: 0, y1: 0, x2: 5, y2: 5 }], rels: [{ type: 'coincident', refs: ['1.p1', '0.c'] }] };
      assert(SS.transformEntities(s, [0], { dx: 2, dy: 1 }, { keepRelations: true }).ok && s.entities[1].x1 === 2 && s.entities[1].y1 === 1 && s.entities[1].x2 === 5, 'the line stretches with the circle');
      var t = { entities: [{ t: 'circle', cx: 0, cy: 0, r: 1 }, { t: 'line', x1: 0, y1: 0, x2: 5, y2: 5 }], rels: [{ type: 'coincident', refs: ['1.p1', '0.c'] }] };
      assert(SS.transformEntities(t, [0], { dx: 2, dy: 1 }, { keepRelations: false }).ok && t.entities[1].x1 === 0 && !t.rels, 'Keep relations off: the tie breaks');
      var u = { entities: [{ t: 'circle', cx: 0, cy: 0, r: 1 }], rels: [{ type: 'coincident', refs: ['0.c', 'O'] }] }, before = JSON.stringify(u), m = SS.transformEntities(u, [0], { dx: 2, dy: 1 }, { keepRelations: true });
      assert(!m.ok && JSON.stringify(u) === before, 'held on the origin: refused, untouched');
      var v = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 8, y2: 0 }, { t: 'line', x1: 8, y1: 0, x2: 8, y2: 4 }], rels: [{ type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }, { type: 'coincident', refs: ['0.p2', '1.p1'] }], dims: [{ e: 0, k: 'dx' }] };
      assert(SS.transformEntities(v, [0, 1], { rot: 90, cx: 0, cy: 0 }, { keepRelations: true }).ok, 'rotate 90');
      near(v.entities[0].y2, 8, 1e-9, 'turned'); assert(relList(v).join(' ') === 'vertical:0 horizontal:1 coincident:0.p2,1.p1' && v.dims[0].k === 'dy', relList(v).join(' '));
      clean(v, null, 'rotated');
      var w = { entities: [{ t: 'circle', cx: 2, cy: 0, r: 1 }, { t: 'line', x1: 3, y1: 0, x2: 6, y2: 0 }], rels: [{ type: 'coincident', refs: ['1.p1', '0'] }, { type: 'horizontal', refs: ['1'] }] };
      var rc = SS.transformEntities(w, [0, 1], { s: 2, cx: 0, cy: 0 }, { copy: true, count: 2, keepRelations: true });
      assert(rc.ok && rc.added.length === 4 && w.entities[4].r === 4 && w.entities[5].x2 === 24 && relList(w).indexOf('coincident:5.p1,4') >= 0, 'scaled copies ' + JSON.stringify(w.entities.slice(2)));
      clean(w, null, 'scale copies');
      return 'ok';
    });
    test('sketch-tools: Trim options — Keep trimmed entities as construction geometry leaves the removed span as a construction line joined to the cut; Ignore trimming of construction geometry leaves construction lines alone (click and Power trim)', function () {
      var s = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 5, y1: -5, x2: 5, y2: 5 }] };
      assert(SS.trimAt(s, 0, [8, 0], { keepConstruction: true }).ok, 'trim');
      var k = s.entities[2];
      assert(s.entities[0].x2 === 5 && k && k.construction && k.x1 === 5 && k.x2 === 10 && relList(s).indexOf('coincident:2.p1,0.p2') >= 0, 'kept span ' + JSON.stringify(s.entities) + ' ' + relList(s).join(' '));
      var t = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0, construction: true }, { t: 'line', x1: 5, y1: -5, x2: 5, y2: 5 }] };
      assert(!SS.trimAt(t, 0, [8, 0], { ignoreConstruction: true }).ok && SS.powerTrim(t, [7, 1], [7, -1], null, { ignoreConstruction: true }) === 0 && t.entities.length === 2, 'construction left alone');
      return 'ok';
    });
    test('sketch-tools: the Pattern and chain Offset relations round-trip through scripts (the rebuilt sketch has the same relations, geometry and status)', function () {
      var m = K.newModel('T'), f = { id: 1, type: 'sketch', name: 'Sketch1', plane: { ref: 'Front', offset: 0 }, entities: [{ t: 'circle', cx: 1, cy: 1, r: 0.25 }, { t: 'line', x1: 0, y1: -4, x2: 8, y2: -4 }, { t: 'line', x1: 8, y1: -4, x2: 8, y2: 0 }], rels: [{ type: 'coincident', refs: ['1.p2', '2.p1'] }] };
      m.nextId = 2; m.features.push(f);
      assert(SS.linearPattern(f, [0], { angle1: 0, spacing1: 3, count1: 3, count2: 1, dimX: true }).ok && SS.offsetSelection(f, [1], { d: 1 }).ok && SS.circularPattern(f, [0], { cx: -2, cy: 1, count: 3, angle: 90, equal: true }).ok, 'made');
      var code = K.generateScript(m), m2 = K.newModel('T2');
      K.runScript(m2, code);
      var g = m2.features.filter(function (x) { return x.type === 'sketch'; })[0];
      assert(JSON.stringify(relList(g)) === JSON.stringify(relList(f)), 'relations\n' + relList(g).join(' ') + '\nvs\n' + relList(f).join(' '));
      f.entities.forEach(function (e, i) { SS.paramNames(e).forEach(function (nm) { near(+g.entities[i][nm] || 0, +e[nm] || 0, 1e-6, 'entity ' + i + ' ' + nm); }); });
      assert(SS.analyze(g).status === SS.analyze(f).status && !SS.analyze(g).redundant, 'status ' + SS.analyze(g).status);
      return relList(g).filter(function (x) { return /^(pattern|offset)/.test(x); }).length + ' tool relations';
    });
  })();
  // --- end sketch-tools ---
