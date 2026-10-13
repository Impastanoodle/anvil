  // ------------------------------------------------------------------ sketch constraint solver (sketch-solver.js)
  (function () {
    group('sketch solver');
    if (typeof SketchSolver === 'undefined') { test('sketch-solver.js loads', function () { fail('SketchSolver is not defined'); }); return; }
    var SS = SketchSolver;
    function copy(o) { return JSON.parse(JSON.stringify(o)); }
    function sk(ents, rels, dims) { var s = { entities: copy(ents) }; if (rels) s.rels = copy(rels); if (dims) s.dims = copy(dims); return s; }
    function addAll(s, list) { list.forEach(function (r) { var x = SS.addRelation(s, r[0], r[1], r[2] != null ? { value: r[2] } : {}); assert(x.ok && x.status === 'ok', r[0] + ' ' + JSON.stringify(r[1]) + ': ' + (x.error || x.status)); }); return s; }
    function nearPt(p, q, tol, label) { near(p[0], q[0], tol, label + '.x'); near(p[1], q[1], tol, label + '.y'); }
    // four lines drawn roughly as a rectangle (none of the corners meet, nothing is exactly level)
    var SLOPPY = [{ t: 'line', x1: 0.3, y1: -0.2, x2: 38, y2: 1 }, { t: 'line', x1: 38.5, y1: 0.7, x2: 39, y2: 22 }, { t: 'line', x1: 39.2, y1: 21, x2: 1, y2: 19 }, { t: 'line', x1: 0.5, y1: 18, x2: -0.4, y2: 0.4 }];
    var RECT_RELS = [['coincident', ['0.p2', '1.p1']], ['coincident', ['1.p2', '2.p1']], ['coincident', ['2.p2', '3.p1']], ['coincident', ['3.p2', '0.p1']],
      ['horizontal', ['0']], ['horizontal', ['2']], ['vertical', ['1']], ['vertical', ['3']], ['coincident', ['0.p1', 'O']]];
    function constrainedRect() {
      var s = addAll(sk(SLOPPY), RECT_RELS);
      s.dims = [{ e: 0, k: 'len' }, { e: 1, k: 'len' }];
      assert(SS.setDim(s, 0, 40).ok && SS.setDim(s, 1, 20).ok, 'dimensions 40 x 20');
      return s;
    }

    test('DOF counts: line 4, +Horizontal 3, circle 3, arc 5, point 2, rectangle 4, slot 5, polygon 4, 3-point polyline 6; point on the origin 0 (Fully Defined); circle concentric with the origin 1', function () {
      function dof(ents, rels) { return SS.analyze(sk(ents, rels)).dof; }
      var L = { t: 'line', x1: 0, y1: 0, x2: 10, y2: 3 };
      var got = [dof([L]), dof([L], [{ type: 'horizontal', refs: ['0'] }]), dof([{ t: 'circle', cx: 1, cy: 2, r: 3 }]), dof([{ t: 'arc', cx: 0, cy: 0, r: 5, a0: 0, a1: 90 }]),
        dof([{ t: 'point', x: 1, y: 1 }]), dof([{ t: 'rect', x: 0, y: 0, w: 4, h: 3 }]), dof([{ t: 'slot', x1: 0, y1: 0, x2: 10, y2: 0, w: 4 }]),
        dof([{ t: 'poly', cx: 0, cy: 0, r: 5, n: 6, rot: 0 }]), dof([{ t: 'polyline', pts: [[0, 0], [5, 0], [5, 5]], closed: false }])];
      assert(got.join() === '4,3,3,5,2,4,5,4,6', 'DOF ' + got.join());
      var pt = sk([{ t: 'point', x: 1, y: 1 }]);
      var r = SS.addRelation(pt, 'coincident', ['0', 'O']);
      var an = SS.analyze(pt);
      assert(r.ok && an.dof === 0 && an.status === 'full' && an.entities[0] === 'full', JSON.stringify(an));
      nearPt([pt.entities[0].x, pt.entities[0].y], [0, 0], 1e-12, 'point on origin');
      var c = sk([{ t: 'circle', cx: 1, cy: 2, r: 3 }]);
      SS.addRelation(c, 'concentric', ['0', 'O']);
      assert(SS.analyze(c).dof === 1 && c.entities[0].cx === 0 && c.entities[0].cy === 0, 'concentric with origin ' + JSON.stringify(c.entities[0]));
      return got.join(', ');
    });
    test('constrained rectangle: four sloppy lines + 4 Coincident, 2 Horizontal, 2 Vertical, corner on the origin -> DOF 2 (Under Defined); width 40 and height 20 -> exact 40 x 20, DOF 0, Fully Defined, every line black', function () {
      var s = addAll(sk(SLOPPY), RECT_RELS), an = SS.analyze(s);
      assert(an.dof === 2 && an.status === 'under' && an.entities.every(function (x) { return x === 'under'; }), 'before dims ' + JSON.stringify(an));
      s.dims = [{ e: 0, k: 'len' }, { e: 1, k: 'len' }];
      assert(SS.setDim(s, 0, 40).ok && SS.setDim(s, 1, 20).ok, 'set dims');
      an = SS.analyze(s);
      assert(an.dof === 0 && an.status === 'full' && an.entities.join() === 'full,full,full,full' && an.rels.every(function (x) { return x === 'ok'; }), JSON.stringify(an));
      var want = [[0, 0, 40, 0], [40, 0, 40, 20], [40, 20, 0, 20], [0, 20, 0, 0]];
      s.entities.forEach(function (e, i) { [e.x1, e.y1, e.x2, e.y2].forEach(function (v, k) { near(v, want[i][k], 1e-9, 'line ' + i + ' [' + k + ']'); }); });
      assert(s.entities[2].y1 === 20 && s.entities[1].x1 === 40, 'round-off snapped: ' + s.entities[2].y1);
      return an.unknowns + ' unknowns, ' + an.equations + ' equations, rank ' + an.rank;
    });
    test('editing a dimension re-solves the whole sketch: width 40 -> 55 keeps the rectangle closed, level and on the origin', function () {
      var s = constrainedRect();
      var r = SS.setDim(s, 0, 55);
      assert(r.ok, r.error);
      var want = [[0, 0, 55, 0], [55, 0, 55, 20], [55, 20, 0, 20], [0, 20, 0, 0]];
      s.entities.forEach(function (e, i) { [e.x1, e.y1, e.x2, e.y2].forEach(function (v, k) { near(v, want[i][k], 1e-9, 'line ' + i + ' [' + k + ']'); }); });
      assert(SS.analyze(s).status === 'full', 'still fully defined');
      // the kernel alone would have moved only line 0's end: the solver moved the whole right side with it
      return 'line 1 now at x = ' + s.entities[1].x1;
    });
    test('tangent arc-line: a line and an arc joined end to start, Tangent -> centre-to-line distance = radius, ends coincide, DOF 9 - 3 = 6; circle-circle Tangent is external when drawn apart', function () {
      var s = sk([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'arc', cx: 10.5, cy: 4.2, r: 5, a0: -80, a1: 30 }]);
      addAll(s, [['coincident', ['0.p2', '1.p1']], ['tangent', ['0', '1']]]);
      var L = s.entities[0], A = s.entities[1];
      var d = Math.abs((L.x2 - L.x1) * (A.cy - L.y1) - (L.y2 - L.y1) * (A.cx - L.x1)) / Math.hypot(L.x2 - L.x1, L.y2 - L.y1);
      near(d, A.r, 1e-9, 'distance centre-line vs r');
      var st = [A.cx + A.r * Math.cos(A.a0 * Math.PI / 180), A.cy + A.r * Math.sin(A.a0 * Math.PI / 180)];
      nearPt(st, [L.x2, L.y2], 1e-9, 'arc start on line end');
      // tangent at the shared point: the radius there is perpendicular to the line
      near((st[0] - A.cx) * (L.x2 - L.x1) + (st[1] - A.cy) * (L.y2 - L.y1), 0, 1e-7, 'radius . line');
      assert(SS.analyze(s).dof === 6, 'DOF ' + SS.analyze(s).dof);
      var c = sk([{ t: 'circle', cx: 0, cy: 0, r: 5 }, { t: 'circle', cx: 20, cy: 3, r: 8 }]);
      addAll(c, [['tangent', ['0', '1']]]);
      near(Math.hypot(c.entities[1].cx - c.entities[0].cx, c.entities[1].cy - c.entities[0].cy), c.entities[0].r + c.entities[1].r, 1e-9, 'external tangency');
      return 'r ' + fmt(A.r) + ', DOF 6';
    });
    test('equal circles: Equal on r 5 and r 8, then diameter 20 on the first -> both r = 10, centres unmoved, DOF 6 - 2 = 4', function () {
      var s = sk([{ t: 'circle', cx: 0, cy: 0, r: 5 }, { t: 'circle', cx: 20, cy: 0, r: 8 }], null, [{ e: 0, k: 'dia' }]);
      addAll(s, [['equal', ['0', '1']]]);
      near(s.entities[0].r, s.entities[1].r, 1e-12, 'equal after the relation');
      assert(SS.setDim(s, 0, 20).ok, 'dia 20');
      near(s.entities[0].r, 10, 1e-12, 'r0'); near(s.entities[1].r, 10, 1e-12, 'r1');
      assert(s.entities[0].cx === 0 && s.entities[1].cx === 20, 'centres moved');
      assert(SS.analyze(s).dof === 4, 'DOF ' + SS.analyze(s).dof);
      return 'r = 10, 10';
    });
    test('over-defined: a Parallel on two Horizontal lines is redundant (yellow, Over Defined); a 30 distance across a 40 line conflicts (red), leaves the geometry alone; a conflicting dimension edit is refused', function () {
      var s = constrainedRect(), before = JSON.stringify(s.entities);
      var r = SS.addRelation(s, 'parallel', ['0', '2']);
      var an = SS.analyze(s);
      assert(r.ok && r.status === 'redundant' && an.status === 'over' && an.rels[an.rels.length - 1] === 'redundant' && an.redundant === 1 && an.conflicts === 0, JSON.stringify(an));
      assert(an.entities[0] === 'over' && an.entities[2] === 'over' && an.entities[1] === 'full', 'entity states ' + an.entities.join());
      assert(JSON.stringify(s.entities) === before, 'a redundant relation moves nothing');
      SS.deleteRelation(s, s.rels.length - 1);
      assert(SS.analyze(s).status === 'full', 'back to Fully Defined');
      var c = SS.addRelation(s, 'distance', ['0.p1', '0.p2'], { value: 30 });
      an = SS.analyze(s);
      assert(c.ok && c.status === 'conflict' && an.status === 'over' && an.conflicts === 1 && an.rels[an.rels.length - 1] === 'conflict', JSON.stringify(an));
      assert(JSON.stringify(s.entities) === before, 'a conflicting relation leaves the geometry');
      assert(an.entities[0] === 'conflict', 'line 0 red: ' + an.entities.join());
      SS.deleteRelation(s, s.rels.length - 1);
      s.dims.push({ e: 2, k: 'len' });
      var e = SS.setDim(s, 2, 30);
      assert(!e.ok && /conflict/.test(e.error) && JSON.stringify(s.entities) === before, 'conflicting dimension: ' + JSON.stringify(e));
      assert(SS.analyze(s).dims[2] === 'redundant', 'the extra (driven-value) dimension is flagged redundant');
      return 'redundant, conflict, refused edit';
    });
    test('relations: Perpendicular, Collinear, Midpoint, Concentric, Vertical between two points, Equal lines, Fix and an Angle dimension (30 -> 45)', function () {
      var s = sk([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 1 }, { t: 'line', x1: 1, y1: 1, x2: 2, y2: 9 }]);
      addAll(s, [['perpendicular', ['0', '1']]]);
      var a = s.entities[0], b = s.entities[1];
      near((a.x2 - a.x1) * (b.x2 - b.x1) + (a.y2 - a.y1) * (b.y2 - b.y1), 0, 1e-9, 'perpendicular dot');
      var c = sk([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 12, y1: 1, x2: 20, y2: 2 }]);
      addAll(c, [['collinear', ['0', '1']]]);
      var l0 = c.entities[0], l1 = c.entities[1];
      [[l1.x1, l1.y1], [l1.x2, l1.y2]].forEach(function (p, k) { near((l0.x2 - l0.x1) * (p[1] - l0.y1) - (l0.y2 - l0.y1) * (p[0] - l0.x1), 0, 1e-8, 'collinear ' + k); });
      var m = sk([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'point', x: 4, y: 1 }]);
      addAll(m, [['midpoint', ['1', '0']]]);
      nearPt([m.entities[1].x, m.entities[1].y], [(m.entities[0].x1 + m.entities[0].x2) / 2, (m.entities[0].y1 + m.entities[0].y2) / 2], 1e-9, 'midpoint');
      var cc = sk([{ t: 'circle', cx: 0, cy: 0, r: 5 }, { t: 'arc', cx: 1, cy: 2, r: 8, a0: 0, a1: 120 }, { t: 'point', x: 3, y: 7 }, { t: 'point', x: 5, y: 1 }]);
      addAll(cc, [['concentric', ['0', '1']], ['vertical', ['2', '3']]]);
      nearPt([cc.entities[0].cx, cc.entities[0].cy], [cc.entities[1].cx, cc.entities[1].cy], 1e-9, 'concentric');
      near(cc.entities[2].x, cc.entities[3].x, 1e-9, 'vertical points');
      var q = sk([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 0, y1: 5, x2: 7, y2: 5 }]);
      addAll(q, [['fix', ['0']], ['equal', ['0', '1']]]);
      assert(JSON.stringify(q.entities[0]) === JSON.stringify({ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }), 'fixed line moved');
      near(Math.hypot(q.entities[1].x2 - q.entities[1].x1, q.entities[1].y2 - q.entities[1].y1), 10, 1e-9, 'equal to the fixed line');
      assert(SS.analyze(q).entities[0] === 'full', 'a fixed entity is fully defined');
      var g = sk([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 8, y2: 5 }]);
      addAll(g, [['fix', ['0']], ['coincident', ['1.p1', '0.p1']]]);
      var ar = SS.addRelation(g, 'angle', ['0', '1'], { value: 30 });
      assert(ar.ok && ar.status === 'ok', JSON.stringify(ar));
      function ang() { var e = g.entities[1]; return Math.atan2(e.y2 - e.y1, e.x2 - e.x1) * 180 / Math.PI; }
      near(ang(), 30, 1e-8, 'angle 30');
      assert(SS.setRelValue(g, ar.rels[0], 45).ok, 'angle 45');
      near(ang(), 45, 1e-8, 'angle 45'); near(g.rels[ar.rels[0]].v, 45, 0, 'stored value');
      assert(!SS.setRelValue(g, ar.rels[0], 200).ok, 'angle > 180 refused');
      return 'all satisfied';
    });
    test('distance dimensions: point-point, point-line and between parallel lines drive the geometry; measure() reads the current values', function () {
      var s = sk([{ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'line', x1: 0, y1: 12, x2: 30, y2: 12 }, { t: 'point', x: 10, y: 5 }]);
      addAll(s, [['fix', ['0']], ['parallel', ['0', '1']]]);
      near(SS.measure(s, 'distance', ['1', '0']), 12, 1e-12, 'measure line-line');
      var r = SS.addRelation(s, 'distance', ['1', '0'], { value: 25 });
      assert(r.ok && r.status === 'ok', JSON.stringify(r));
      near(s.entities[1].y1, 25, 1e-9, 'line 1 y1'); near(s.entities[1].y2, 25, 1e-9, 'line 1 y2');
      r = SS.addRelation(s, 'distance', ['2', '0'], { value: 7 });
      near(s.entities[2].y, 7, 1e-9, 'point above line');
      r = SS.addRelation(s, 'distance', ['2', '0.p1'], { value: 10 });
      near(Math.hypot(s.entities[2].x, s.entities[2].y), 10, 1e-9, 'point to line start');
      assert(SS.analyze(s).entities[2] === 'full', 'the point is fully defined');
      return 'y = 25, point (' + fmt(s.entities[2].x) + ', ' + fmt(s.entities[2].y) + ')';
    });
    test('dragging: an under-defined level line follows the drag along x only; a fully defined rectangle does not move; a free point goes where it is dragged', function () {
      var s = sk([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }], [{ type: 'horizontal', refs: ['0'] }, { type: 'coincident', refs: ['0.p1', 'O'] }]);
      var r = SS.drag(s, '0.p2', [20, 5], copy(s.entities));
      assert(r.ok, 'drag');
      assert(JSON.stringify(s.entities[0]) === JSON.stringify({ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }), JSON.stringify(s.entities[0]));
      var rect = constrainedRect(), before = JSON.stringify(rect.entities);
      SS.drag(rect, '1.p2', [70, 50], copy(rect.entities));
      SS.drag(rect, '2', [5, 5], copy(rect.entities));
      assert(JSON.stringify(rect.entities) === before, 'fully defined geometry moved: ' + JSON.stringify(rect.entities));
      var p = sk([{ t: 'point', x: 1, y: 1 }, { t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }], [{ type: 'coincident', refs: ['0', '1'] }]);
      SS.drag(p, '0', [4, 3], copy(p.entities));
      near(p.entities[0].y, p.entities[1].y1 + (p.entities[1].y2 - p.entities[1].y1) * (p.entities[0].x - p.entities[1].x1) / (p.entities[1].x2 - p.entities[1].x1), 1e-9, 'point stays on the line');
      return 'line end at x = 20';
    });
    test('inference: a line from the origin infers Horizontal + Coincident(origin); the next line from its end infers Coincident + Vertical; a third line from the same corner infers only one Coincident; a circle on an arc centre infers Concentric', function () {
      var s = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }] };
      var a = SS.infer(s, 0).map(function (r) { return r.type + ' ' + r.refs.join('/'); }).join(', ');
      assert(a === 'horizontal 0, coincident 0.p1/O', a);
      s.entities.push({ t: 'line', x1: 10, y1: 0, x2: 10, y2: 8 });
      var b = SS.infer(s, 1).map(function (r) { return r.type + ' ' + r.refs.join('/'); }).join(', ');
      assert(b === 'vertical 1, coincident 1.p1/0.p2', b);
      s.entities.push({ t: 'line', x1: 10, y1: 0, x2: 17, y2: 5 });
      var c = SS.infer(s, 2).map(function (r) { return r.type + ' ' + r.refs.join('/'); }).join(', ');
      assert(c === 'coincident 2.p1/0.p2', c);
      assert(SS.analyze(s).status === 'under', 'no inferred relation over-defines');
      var t = { entities: [{ t: 'arc', cx: 5, cy: 5, r: 4, a0: 0, a1: 90 }, { t: 'circle', cx: 5, cy: 5, r: 2 }] };
      var d = SS.infer(t, 1).map(function (r) { return r.type + ' ' + r.refs.join('/'); }).join(', ');
      assert(d === 'concentric 1/0', d);
      var prev = SS.inferPreview({ entities: [] }, { t: 'line', x1: 0, y1: 0, x2: 0, y2: 5 }).map(function (x) { return x.type; }).join();
      assert(prev === 'vertical,coincident', 'preview ' + prev);
      return a + ' | ' + b + ' | ' + c + ' | ' + d;
    });
    test('relations follow entity deletion (refs shift down, relations on the deleted entity go) and clean() drops a relation whose entity changed type', function () {
      var s = addAll(sk(SLOPPY), RECT_RELS);
      SS.removeEntity(s, 1);
      var txt = s.rels.map(function (r) { return r.type + ' ' + r.refs.join('/'); }).join(', ');
      assert(txt === 'coincident 1.p2/2.p1, coincident 2.p2/0.p1, horizontal 0, horizontal 1, vertical 2, coincident 0.p1/O', txt);
      s.entities[2] = { t: 'circle', cx: 0, cy: 0, r: 3 };
      var dropped = SS.clean(s);
      assert(dropped === 3 && s.rels.map(function (r) { return r.type + ' ' + r.refs.join('/'); }).join(', ') === 'horizontal 0, horizontal 1, coincident 0.p1/O', 'dropped ' + dropped + ': ' + JSON.stringify(s.rels));
      return txt;
    });
    test('script round trip: .rel() lines are written before .id(), runScript reproduces rels and entities exactly, the generator is a fixed point; a model without relations writes no .rel()', function () {
      var m = K.newModel('Rels');
      new K.Builder(m).sketch('Front').line(0, 0, 38, 1).line(38, 1, 39, 22).line(39, 22, 1, 19).line(1, 19, 0, 0)
        .dim(0, 'len', { value: 40 }).dim(1, 'len', { value: 20 })
        .rel('coincident', ['0.p2', '1.p1']).rel('coincident', ['1.p2', '2.p1']).rel('coincident', ['2.p2', '3.p1']).rel('coincident', ['3.p2', '0.p1'])
        .rel('horizontal', ['0']).rel('horizontal', ['2']).rel('vertical', ['1']).rel('vertical', ['3']).rel('coincident', ['0.p1', 'O'])
        .rel('distance', ['0.mid', '2'], { value: 20, off: 4 }).rel('fix', ['2.p1']).id();
      var f = m.features[0];
      var st = SS.analyze(f);
      assert(st.status === 'over', 'the distance repeats the height dimension, the fix repeats everything: ' + st.status);
      var s1 = K.generateScript(m);
      assert(/\.rel\("coincident", \["0\.p2","1\.p1"\]\)/.test(s1) && /\.rel\("distance", \["0\.mid","2"\], \{"value":20,"off":4\}\)/.test(s1) && /\.rel\("fix", \["2\.p1"\], \{"at":\[40,20\]\}\)/.test(s1), s1);
      assert(s1.indexOf('.rel(') < s1.indexOf('.id();'), 'rels before .id()');
      var m2 = K.newModel('x');
      K.runScript(m2, s1);
      var g = m2.features[0];
      assert(JSON.stringify(g.rels) === JSON.stringify(f.rels), 'rels ' + JSON.stringify(g.rels));
      assert(JSON.stringify(g.entities) === JSON.stringify(f.entities) && JSON.stringify(g.dims) === JSON.stringify(f.dims), 'entities / dims');
      assert(K.generateScript(m2) === s1, 'fixed point');
      var plain = build('p.sketch("Front").rect(0, 0, 10, 5).dim(0, "w").extrude(3);');
      assert(K.generateScript(plain.model).indexOf('.rel(') < 0, 'no .rel for a plain model');
      var bad = false;
      try { K.runScript(K.newModel('y'), 'p.sketch("Front").line(0,0,1,0).circle(5,5,1).rel("parallel", ["0", "1"]);'); } catch (e) { bad = /does not apply/.test(e.message); }
      assert(bad, 'an inapplicable relation throws');
      return f.rels.length + ' relations, ' + s1.split('\n').length + ' lines';
    });
    test('old models load unchanged: solving every sketch of every Design Library part example moves nothing', function () {
      var n = 0, ents = 0;
      AnvilExamples.forEach(function (ex) {
        if (isAsmExample(ex)) return;
        var model = K.newModel();
        K.runScript(model, ex.code);
        model.features.forEach(function (f) {
          if (f.type !== 'sketch') return;
          var before = JSON.stringify(f);
          var res = SS.solve(f);
          assert(res.ok, ex.name + ' ' + f.name + ' did not solve');
          if (!f.rels) assert(JSON.stringify(f) === before, ex.name + ' ' + f.name + ' changed');
          SS.analyze(f);
          n++; ents += f.entities.length;
        });
      });
      return n + ' sketches, ' + ents + ' entities';
    });

    // ---- Symmetric, driven (reference) dimensions, construction geometry (cloud-2026-09-26s)
    var CL = { t: 'line', x1: 0, y1: -20, x2: 0, y2: 20, construction: true };   // a vertical centerline
    test('Symmetric: two points about a free centerline 8 -> 6 DOF; about a fixed centerline 4 -> 2 DOF and the points mirror exactly; offered by Add Relations for [point, point, line] in any order', function () {
      var s = sk([{ t: 'point', x: -7, y: 3 }, { t: 'point', x: 6, y: 4 }, CL]);
      assert(SS.analyze(s).dof === 8, 'free ' + SS.analyze(s).dof);
      assert(SS.applicable(s, ['2', '0', '1']).indexOf('symmetric') >= 0 && SS.applicable(s, ['0', '1']).indexOf('symmetric') < 0, 'applicable ' + SS.applicable(s, ['2', '0', '1']));
      var r = SS.addRelation(s, 'symmetric', ['2', '0', '1']);
      assert(r.ok && r.status === 'ok', JSON.stringify(r));
      assert(JSON.stringify(s.rels[0].refs) === '["0","1","2"]', 'axis last (the centerline) ' + JSON.stringify(s.rels[0].refs));
      assert(SS.analyze(s).dof === 6, 'free axis ' + SS.analyze(s).dof);
      var t = sk([{ t: 'point', x: -7, y: 3 }, { t: 'point', x: 6, y: 4 }, CL]);
      addAll(t, [['fix', ['2']]]);
      assert(SS.analyze(t).dof === 4, 'fixed axis before ' + SS.analyze(t).dof);
      addAll(t, [['symmetric', ['0', '1', '2']]]);
      var a = t.entities[0], b = t.entities[1];
      near(a.x, -b.x, 1e-9, 'x mirrored'); near(a.y, b.y, 1e-9, 'same height');
      assert(SS.analyze(t).dof === 2, 'fixed axis after ' + SS.analyze(t).dof);
      return 'points ' + [a.x, a.y, b.x, b.y].map(function (v) { return v.toFixed(3); }).join(', ');
    });
    test('Symmetric: two lines about a fixed centerline 8 -> 4 DOF (ends paired as they mirror now); two circles 6 -> 3 DOF with equal radii; end points of one line symmetric 4 -> 2; a fourth relation repeating it is redundant', function () {
      var s = sk([{ t: 'line', x1: -9, y1: 0, x2: -4, y2: 8 }, { t: 'line', x1: 4.5, y1: 7.5, x2: 8, y2: 0.5 }, CL]);
      addAll(s, [['fix', ['2']], ['symmetric', ['0', '1', '2']]]);
      var L0 = s.entities[0], L1 = s.entities[1];
      near(L0.x1, -L1.x2, 1e-9, 'p1 <-> p2 x'); near(L0.y1, L1.y2, 1e-9, 'p1 <-> p2 y'); near(L0.x2, -L1.x1, 1e-9, 'p2 <-> p1 x'); near(L0.y2, L1.y1, 1e-9, 'p2 <-> p1 y');
      assert(SS.analyze(s).dof === 4, 'lines ' + SS.analyze(s).dof);
      var c = sk([{ t: 'circle', cx: -5, cy: 2, r: 3 }, { t: 'circle', cx: 6, cy: 2.5, r: 2 }, CL]);
      addAll(c, [['fix', ['2']], ['symmetric', ['0', '1', '2']]]);
      near(c.entities[0].r, c.entities[1].r, 1e-9, 'equal radii'); near(c.entities[0].cx, -c.entities[1].cx, 1e-9, 'centres mirrored');
      assert(SS.analyze(c).dof === 3, 'circles ' + SS.analyze(c).dof);
      var h = sk([{ t: 'line', x1: -10, y1: 5, x2: 9, y2: 6 }, CL]);
      addAll(h, [['fix', ['1']], ['symmetric', ['0.p1', '0.p2', '1']]]);
      assert(SS.analyze(h).dof === 2 && Math.abs(h.entities[0].y1 - h.entities[0].y2) < 1e-9, 'line ends ' + JSON.stringify(h.entities[0]));
      var x = SS.addRelation(h, 'horizontal', ['0']);
      assert(x.ok && x.status === 'redundant', 'horizontal repeats the symmetry: ' + x.status);
      return 'DOF 4, 3, 2';
    });
    test('with opts.symmetric, Symmetric is inferred when a line is drawn with its ends mirrored about a centerline (instead of Horizontal), and when a circle mirrors an existing one', function () {
      var SYM = { symmetric: true };   // lane C, fidelity #7: only on request (the drawing tools never ask)
      var s = sk([CL], [{ type: 'vertical', refs: ['0'] }]);   // a centerline drawn upright infers Vertical
      s.entities.push({ t: 'line', x1: -10, y1: 5, x2: 10, y2: 5 });
      var got = SS.infer(s, 1, SYM).map(function (r) { return r.type; });
      assert(got.join() === 'symmetric', 'line ' + got.join());
      assert(JSON.stringify(s.rels[1].refs) === '["1.p1","1.p2","0"]', JSON.stringify(s.rels[1].refs));
      s.entities.push({ t: 'circle', cx: -6, cy: 12, r: 2 });
      SS.infer(s, 2, SYM);
      s.entities.push({ t: 'circle', cx: 6, cy: 12, r: 2 });
      var got2 = SS.infer(s, 3, SYM).map(function (r) { return r.type + ':' + r.refs.join('|'); });
      assert(got2.join() === 'symmetric:2|3|0', 'circle ' + got2.join());
      assert(SS.inferPreview({ entities: [CL] }, { t: 'line', x1: -3, y1: 1, x2: 3, y2: 1 }, SYM)[0].type === 'symmetric', 'preview');
      return got.concat(got2).join(', ');
    });
    test('lane C fidelity #7: while drawing (no opts.symmetric) a level line across a centerline infers Horizontal only, a mirrored circle nothing; the preview shows no Symmetric', function () {
      var s = sk([{ t: 'line', x1: 10, y1: -5, x2: 10, y2: 5, construction: true }], [{ type: 'vertical', refs: ['0'] }]);
      s.entities.push({ t: 'line', x1: 8.5, y1: -2, x2: 11.5, y2: -2 });
      var got = SS.infer(s, 1).map(function (r) { return r.type + ' ' + r.refs.join('/'); }).join(', ');
      assert(got === 'horizontal 1', 'line: ' + got);
      s.entities.push({ t: 'circle', cx: 7, cy: 3, r: 1 }); SS.infer(s, 2);
      s.entities.push({ t: 'circle', cx: 13, cy: 3, r: 1 });
      var got2 = SS.infer(s, 3).map(function (r) { return r.type; }).join();
      assert(got2 === '', 'circle: ' + got2);
      var prev = SS.inferPreview({ entities: [s.entities[0]] }, { t: 'line', x1: 8, y1: 1, x2: 12, y2: 1 }).map(function (c) { return c.type; }).join();
      assert(prev === 'horizontal', 'preview ' + prev);
      return got + ' | circle: none | preview ' + prev;
    });
    test('lane C fidelity #8: opts.placed limits Coincident / Midpoint / Tangent inference to the placed points; H / V on the entity stay', function () {
      // a line y = 0 and a Corner Rectangle (1,0)-(3,-1.5) whose top edge lies on it: without placed both top corners
      // are on the line; placed at its two clicks only the clicked corner (1, 0) is
      var base = { entities: [{ t: 'line', x1: -1, y1: 0, x2: 6, y2: 0 }, { t: 'rect', x: 1, y: -1.5, w: 2, h: 1.5 }] };
      function co(s, o) { return SS.inferCandidates(s, 1, o).filter(function (c) { return c.type === 'coincident'; }).map(function (c) { return c.refs.join('/'); }).sort().join(' '); }
      var all = co(copy(base)), one = co(copy(base), { placed: [[1, 0], [3, -1.5]] });
      assert(all === '1.v2/0 1.v3/0', 'unrestricted: ' + all);
      assert(one === '1.v3/0', 'placed: ' + one);
      // the same rectangle as four lines (explodeRect), each line inferred with the clicks: one Coincident on the line
      var s = copy(base); SS.explodeRect(s, 1);
      var added = [];
      [1, 2, 3, 4].forEach(function (i) { SS.infer(s, i, { placed: [[1, 0], [3, -1.5]] }).forEach(function (r) { added.push(r.type + ' ' + r.refs.join('/')); }); });
      assert(added.join(', ') === 'coincident 3.p2/0', 'four lines: ' + added.join(', '));
      var h = s.rels.filter(function (r) { return r.type === 'horizontal'; }).length, v = s.rels.filter(function (r) { return r.type === 'vertical'; }).length;
      assert(h === 2 && v === 2, 'H ' + h + ' V ' + v);
      // a line with an unplaced end on another line's end: no Coincident and no Perpendicular there; Vertical stays
      var t = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 4, y2: 3 }, { t: 'line', x1: 4, y1: 3, x2: 4, y2: 8 }] };
      var got = SS.inferCandidates(t, 1, { placed: [[4, 8]] }).map(function (c) { return c.type; }).join();
      assert(got === 'vertical', 'unplaced end: ' + got);
      var got2 = SS.inferCandidates(t, 1, { placed: [[4, 3], [4, 8]] }).map(function (c) { return c.type; }).join();
      assert(got2 === 'vertical,coincident', 'placed end: ' + got2);
      return 'all: ' + all + ' | placed: ' + one + ' | lines: ' + added.join(', ');
    });
    test('lane C: Sketch Fillet between a line and a spline that do not meet extends the line to the fillet (either pick order); a line whose extension misses the spline gets the spline carried on too (rfAX, as SolidWorks)', function () {
      var spl = { t: 'spline', pts: [[0, 0], [3, 2], [6, 3], [9, 6]] }, out = [];
      [[{ t: 'line', x1: 4, y1: -6, x2: 4, y2: -1 }, [4, -3]], [{ t: 'line', x1: -8, y1: 2, x2: -3, y2: 2 }, [-5, 2]]].forEach(function (c) {
        [false, true].forEach(function (splineFirst) {
          var s = { entities: splineFirst ? [copy(spl), copy(c[0])] : [copy(c[0]), copy(spl)] }, li = splineFirst ? 1 : 0, si = 1 - li;
          var spec = splineFirst ? { i: 0, uvi: [6, 3], j: 1, uvj: c[1] } : { i: 0, uvi: c[1], j: 1, uvj: [6, 3] };
          var res = SS.filletPair(s, spec, 0.5);
          assert(res.ok, 'fillet ' + JSON.stringify(c[0]) + ': ' + res.error);
          var L = s.entities[li], A = s.entities[res.arc], sp = s.entities[si], T = SS.refPoint(s, li + '.p2');
          // the line's moved end is on the arc, the arc is R .5 and tangent there, and the spline starts on the arc
          var dT = Math.hypot(T[0] - A.cx, T[1] - A.cy), u = [L.x2 - L.x1, L.y2 - L.y1], rv = [T[0] - A.cx, T[1] - A.cy];
          assert(Math.abs(A.r - 0.5) < 1e-9 && Math.abs(dT - 0.5) < 1e-6, 'end on the arc ' + dT);
          assert(Math.abs(u[0] * rv[0] + u[1] * rv[1]) / Math.hypot(u[0], u[1]) < 1e-6, 'tangent');
          assert(Math.abs(Math.hypot(sp.pts[0][0] - A.cx, sp.pts[0][1] - A.cy) - 0.5) < 1e-6, 'spline cut back to the arc');
          assert(Math.hypot(L.x2 - c[0].x2, L.y2 - c[0].y2) > 0.5, 'the line was extended');
          assert(res.analysis.conflicts === 0, 'conflicts');
          out.push(L.x2.toFixed(3) + ',' + L.y2.toFixed(3));
        });
      });
      var miss = { entities: [copy(spl), { t: 'line', x1: 12, y1: -6, x2: 12, y2: -2 }] }, before = JSON.stringify(miss);
      var r2 = SS.filletPair(miss, { i: 0, uvi: [6, 3], j: 1, uvj: [12, -3] }, 0.5);
      assert(r2.ok && miss.entities[0].pts.length === 5 && miss.entities[1].y2 > 6 && JSON.stringify(miss) !== before, 'miss: the spline is carried on past (9, 6) and the line up to the fillet: ' + JSON.stringify(r2.error || miss.entities));
      r2.error = 'carried on to ' + miss.entities[0].pts[4].join(', ');
      var big = { entities: [copy(spl), { t: 'line', x1: 4, y1: -6, x2: 4, y2: -1 }] };
      var r3 = SS.filletPair(big, { i: 0, uvi: [6, 3], j: 1, uvj: [4, -3] }, 50);
      assert(!r3.ok && /smaller radius/.test(r3.error), 'too big: ' + JSON.stringify(r3));
      return 'line ends ' + out.join(' ') + ' | ' + r2.error.slice(0, 50) + '…';
    });
    test('driven dimensions: a distance repeating the rectangle height over-defines (Make driven?); made driven it adds no equation (Fully Defined), shows 20, and reads 30 after the height is set to 30; a driven Smart Dimension follows a width edit and refuses edits', function () {
      var s = constrainedRect();
      var r = SS.addRelation(s, 'distance', ['0', '2']);
      assert(r.ok && r.status === 'redundant' && SS.overDefines(s, 'rel', r.rels[0]), 'redundant ' + r.status);
      var d = SS.setDriven(s, 'rel', r.rels[0], true);
      assert(d.ok && d.state === 'driven' && d.analysis.status === 'full' && d.analysis.dof === 0, JSON.stringify(d.analysis));
      near(s.rels[r.rels[0]].v, 20, 1e-9, 'driven value');
      assert(SS.setDim(s, 1, 30).ok, 'height 30');
      near(s.rels[r.rels[0]].v, 30, 1e-9, 'driven value after the solve');
      assert(!SS.setRelValue(s, r.rels[0], 12).ok, 'a driven distance cannot be edited');
      s.dims.push({ e: 2, k: 'len' });
      var di = s.dims.length - 1;
      assert(SS.overDefines(s, 'dim', di) && SS.analyze(s).status === 'over', 'top width repeats the bottom width');
      SS.setDriven(s, 'dim', di, true);
      assert(SS.analyze(s).status === 'full' && SS.analyze(s).dims[di] === 'driven', 'driven dim ' + JSON.stringify(SS.analyze(s).dims));
      assert(SS.setDim(s, 0, 50).ok, 'width 50');
      near(K.dimValue(s.entities[2], s.dims[di]), 50, 1e-9, 'driven width follows');
      var e = SS.setDim(s, di, 45);
      assert(!e.ok && /driven/.test(e.error), 'refused: ' + e.error);
      var back = SS.setDriven(s, 'rel', r.rels[0], false);
      assert(back.state === 'redundant', 'driving again over-defines: ' + back.state);
      return 'distance ' + s.rels[r.rels[0]].v + ', width ' + K.dimValue(s.entities[2], s.dims[di]);
    });
    test('construction geometry: a centerline and a construction circle are solved but not part of the profile (1 loop, volume of the rectangle alone); .construction() / .driven() / driven .rel() round trip through the script', function () {
      var code = 'p.sketch("Front").rect(-10, 0, 20, 8).line(0, -5, 0, 15).circle(0, 4, 3).dim(0, "w").dim(0, "w", { i: 2 })'
        + '.construction([1, 2]).driven([1]).rel("symmetric", ["0.v0", "0.v1", "1"]).rel("distance", ["0.e0", "0.e2"], { driven: true }).extrude(5);';
      var b = build(code), f = b.model.features[0];
      assert(!b.errors || !Object.keys(b.errors).length, JSON.stringify(b.errors));
      assert(K.sketchProfile(f).loops.length === 1, 'loops ' + K.sketchProfile(f).loops.length);
      near(b.mp.volume, 20 * 8 * 5, 1e-9, 'volume');
      var an = SS.analyze(f);
      assert(an.dims[1] === 'driven' && an.rels[1] === 'driven' && an.status !== 'over', JSON.stringify(an.dims) + ' ' + JSON.stringify(an.rels));
      near(f.rels[1].v, 8, 1e-9, 'driven distance reads the height');
      var s1 = K.generateScript(b.model);
      assert(s1.indexOf('.construction([1,2])') > 0 && s1.indexOf('.driven([1])') > 0 && s1.indexOf('{"driven":true}') > 0, s1);
      var m2 = K.newModel('x');
      K.runScript(m2, s1);
      var g = m2.features[0];
      assert(JSON.stringify(g.entities) === JSON.stringify(f.entities) && JSON.stringify(g.dims) === JSON.stringify(f.dims) && JSON.stringify(g.rels) === JSON.stringify(f.rels), 'round trip');
      assert(K.generateScript(m2) === s1, 'fixed point');
      return 'volume ' + b.mp.volume;
    });
  })();

