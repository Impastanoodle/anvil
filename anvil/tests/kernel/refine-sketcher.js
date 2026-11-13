  // --- refine/sketcher ---
  (function () {
    group('refine/sketcher: inference, fillet, trim, conflict messages');
    if (typeof SketchSolver === 'undefined') return;
    var SS = SketchSolver;
    function copy(o) { return JSON.parse(JSON.stringify(o)); }
    function relList(s) { return (s.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }); }
    // a closed rectangle of four lines with H/V, corner Coincidents and the first corner on the origin
    function lineRect(w, h) {
      return { entities: [{ t: 'line', x1: 0, y1: 0, x2: w, y2: 0 }, { t: 'line', x1: w, y1: 0, x2: w, y2: h }, { t: 'line', x1: w, y1: h, x2: 0, y2: h }, { t: 'line', x1: 0, y1: h, x2: 0, y2: 0 }],
        rels: [{ type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }, { type: 'horizontal', refs: ['2'] }, { type: 'vertical', refs: ['3'] },
          { type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'coincident', refs: ['2.p2', '3.p1'] }, { type: 'coincident', refs: ['3.p2', '0.p1'] },
          { type: 'coincident', refs: ['0.p1', 'O'] }] };
    }

    test('inference: an end dropped on a line, a circle or inside an arc (not at one of its points) gets a Coincident to that curve; outside the arc or past the line end it gets none', function () {
      var s = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'circle', cx: 100, cy: 0, r: 10 }, { t: 'arc', cx: 0, cy: 100, r: 10, a0: 0, a1: 90 }] };
      function inf(e) { return SS.inferPreview(s, e).map(function (c) { return c.type; }).join(','); }
      var tmp = { entities: s.entities.concat([{ t: 'line', x1: 10, y1: 0, x2: 10, y2: -20 }]) };
      var c1 = SS.inferCandidates(tmp, 3).filter(function (c) { return c.type === 'coincident'; });
      assert(c1.length === 1 && c1[0].refs.join() === '3.p1,0', 'on line: ' + JSON.stringify(c1));
      var c45 = [Math.cos(Math.PI / 4) * 10, 100 + Math.sin(Math.PI / 4) * 10];
      assert(/coincident/.test(inf({ t: 'line', x1: 100, y1: 10, x2: 130, y2: 40 })), 'on circle: ' + inf({ t: 'line', x1: 100, y1: 10, x2: 130, y2: 40 }));
      assert(/coincident/.test(inf({ t: 'line', x1: c45[0], y1: c45[1], x2: 30, y2: 140 })), 'inside the arc');
      assert(!/coincident/.test(inf({ t: 'line', x1: -10, y1: 100, x2: -30, y2: 120 })), 'outside the arc sweep: ' + inf({ t: 'line', x1: -10, y1: 100, x2: -30, y2: 120 }));
      assert(!/coincident/.test(inf({ t: 'line', x1: 50, y1: 0, x2: 50, y2: 20 })), 'past the line end');
      var s2 = copy(tmp), added = SS.infer(s2, 3);
      assert(added.some(function (r) { return r.type === 'coincident' && r.refs.join() === '3.p1,0'; }) && SS.analyze(s2).status !== 'over', 'infer adds it: ' + relList(s2));
      return relList(s2).join(' ');
    });
    // rfMM (2026-11-13): SolidWorks keeps Midpoint at both ends and leaves out the Vertical that makes one redundant
    // (it was Midpoint + Coincident on the line + Vertical)
    test('inference: a vertical line between the midpoints of a rectangle\'s bottom and top gets Midpoint at both ends and no Vertical, never over-defining', function () {
      var s = lineRect(40, 30);
      s.entities.push({ t: 'line', x1: 20, y1: 0, x2: 20, y2: 30 });
      var added = SS.infer(s, 4), an = SS.analyze(s), t = added.map(function (r) { return r.type + ':' + r.refs.join(','); });
      assert(t.indexOf('midpoint:4.p1,0') >= 0 && t.indexOf('midpoint:4.p2,2') >= 0 && t.indexOf('vertical:4') < 0, t.join(' '));
      assert(an.status === 'under' && !an.redundant && !an.conflicts, JSON.stringify(an));
      return t.join(' ');
    });
    test('sketch fillet between two lines: lineCorner finds the corner, filletCorner trims both lines to the tangent points, adds an R arc with Coincident + Tangent relations and an R dimension; DOF unchanged; the R dimension drives', function () {
      var s = lineRect(40, 30), dof0 = SS.analyze(s).dof;
      var c = SS.lineCorner(s, [39, 1], 5);
      assert(c && c.i === 0 && c.j === 1, 'corner ' + JSON.stringify(c));
      assert(SS.lineCorner(s, [20, 15], 5) === null, 'no corner near the middle');
      var r = SS.filletCorner(s, c, 5);
      assert(r.ok, r.error);
      var a = s.entities[r.arc];
      assert(a.t === 'arc' && Math.abs(a.r - 5) < 1e-9 && Math.abs(a.cx - 35) < 1e-9 && Math.abs(a.cy - 5) < 1e-9, 'arc ' + JSON.stringify(a));
      near(s.entities[0].x2, 35, 1e-9, 'bottom line trimmed'); near(s.entities[1].y1, 5, 1e-9, 'right line trimmed');
      var an = SS.analyze(s), rl = relList(s);
      assert(an.dof === dof0 && !an.conflicts && !an.redundant, 'DOF ' + an.dof + ' vs ' + dof0 + ' ' + JSON.stringify(an.rels));
      assert(rl.indexOf('tangent:0,4') >= 0 && rl.indexOf('tangent:1,4') >= 0 && rl.filter(function (x) { return /^coincident:.*4\.p/.test(x); }).length === 2, rl.join(' '));
      assert(s.dims && s.dims.length === 1 && s.dims[0].e === 4 && s.dims[0].k === 'r', 'R dim ' + JSON.stringify(s.dims));
      // the R dimension drives: 5 -> 8 keeps everything tangent and joined
      assert(SS.setDim(s, 0, 8).ok, 'R 8');
      near(s.entities[4].r, 8, 1e-9, 'radius'); assert(!SS.analyze(s).conflicts, 'still solved');
      var e4 = s.entities[4], p1 = [e4.cx + 8 * Math.cos(e4.a0 * Math.PI / 180), e4.cy + 8 * Math.sin(e4.a0 * Math.PI / 180)];
      near(p1[0], s.entities[0].x2, 1e-6, 'arc start on the bottom line end'); near(p1[1], s.entities[0].y2, 1e-6, 'arc start y');
      var big = SS.filletCorner(lineRect(40, 30), SS.lineCorner(lineRect(40, 30), [0, 30], 5), 50);
      assert(!big.ok && /Radius too large/.test(big.error), 'too large: ' + JSON.stringify(big));
      return rl.slice(-4).join(' ');
    });
    test('sketch fillet: a filleted four-line rectangle extrudes to 40·30·10 − (1 − π/4)·25·10', function () {
      var s = lineRect(40, 30), r = SS.filletCorner(s, SS.lineCorner(s, [40, 0], 5), 5);
      assert(r.ok, r.error);
      var code = 'p.sketch("Front")' + s.entities.map(function (e) { return e.t === 'line' ? '.line(' + [e.x1, e.y1, e.x2, e.y2].join(', ') + ')' : '.arc(' + [e.cx, e.cy, e.r, e.a0, e.a1].join(', ') + ')'; }).join('') + '.extrude(10);';
      var b = build(code), exp = 40 * 30 * 10 - (1 - Math.PI / 4) * 25 * 10;
      assert(!Object.keys(b.errors || {}).length, JSON.stringify(b.errors));
      nearRel(b.mp.volume, exp, 2e-3, 'volume');
      return b.mp.volume.toFixed(3) + ' vs ' + exp.toFixed(3);
    });
    test('trim keeps relations: cutting a rectangle\'s top line at a T-junction keeps its Horizontal and its surviving corner Coincident, adds a Coincident at the cut; a circle trimmed by a line keeps its centre on the origin and its radius dimension', function () {
      var s = lineRect(40, 30);
      s.entities.push({ t: 'line', x1: 20, y1: 0, x2: 20, y2: 30 });
      s.rels.push({ type: 'vertical', refs: ['4'] }, { type: 'midpoint', refs: ['4.p1', '0'] }, { type: 'coincident', refs: ['4.p2', '2'] });
      var before = s.entities.slice();
      s.entities = K.trimEntity(s.entities, 2, [30, 30]);
      SS.afterTrim(s, before, 2);
      var rl = relList(s), an = SS.analyze(s);
      assert(rl.indexOf('horizontal:2') >= 0, 'Horizontal kept: ' + rl.join(' '));
      assert(rl.indexOf('coincident:2.p2,3.p1') >= 0 || rl.indexOf('coincident:3.p1,2.p2') >= 0, 'surviving corner: ' + rl.join(' '));
      assert(rl.some(function (x) { return /coincident:(2\.p1,4\.p2|4\.p2,2\.p1)/.test(x); }), 'cut end Coincident: ' + rl.join(' '));
      assert(!an.conflicts && !an.redundant && an.dof === 3, 'analysis ' + JSON.stringify({ dof: an.dof, rels: an.rels }));
      var c = { entities: [{ t: 'circle', cx: 0, cy: 0, r: 20 }, { t: 'line', x1: -30, y1: 10, x2: 30, y2: 10 }], rels: [{ type: 'coincident', refs: ['0.c', 'O'] }, { type: 'horizontal', refs: ['1'] }], dims: [{ e: 0, k: 'dia' }, { e: 1, k: 'len' }] };
      var b2 = c.entities.slice();
      c.entities = K.trimEntity(c.entities, 0, [0, 20]);
      SS.afterTrim(c, b2, 0);
      var rc = relList(c), ac = SS.analyze(c);
      assert(c.entities[0].t === 'arc' && rc.indexOf('coincident:0.c,O') >= 0 && rc.indexOf('coincident:0.p1,1') >= 0 && rc.indexOf('coincident:0.p2,1') >= 0, rc.join(' '));
      assert(c.dims.length === 2 && c.dims[0].k === 'r' && c.dims[0].e === 0 && c.dims[1].e === 1, 'dims ' + JSON.stringify(c.dims));
      assert(!ac.conflicts && !ac.redundant, JSON.stringify(ac.rels));
      // a line split in two shifts the later entities: a dimension on one of them follows it
      var t = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'line', x1: 10, y1: -5, x2: 10, y2: 5 }, { t: 'line', x1: 20, y1: -5, x2: 20, y2: 5 }, { t: 'circle', cx: 50, cy: 0, r: 3 }], dims: [{ e: 3, k: 'dia' }] };
      var b3 = t.entities.slice();
      t.entities = K.trimEntity(t.entities, 0, [15, 0]);
      SS.afterTrim(t, b3, 0);
      assert(t.entities.length === 5 && t.dims[0].e === 4 && t.entities[4].t === 'circle', 'dimension follows the circle: ' + JSON.stringify(t.dims));
      return rl.join(' ');
    });
    test('a dimension value that cannot be reached names what it fights: the top length of a dimensioned rectangle names "Line1 length (50)"; dy on a horizontal line names the Horizontal', function () {
      var s = lineRect(50, 20);
      s.dims = [{ e: 0, k: 'len' }, { e: 3, k: 'len' }, { e: 2, k: 'len' }];
      var r = SS.setDim(s, 2, 60);
      assert(!r.ok && /Line1 length \(50\)/.test(r.error) && r.conflicts.length, r.error);
      near(s.entities[2].x1, 50, 1e-9, 'geometry unchanged');
      var s2 = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 50, y2: 0 }], rels: [{ type: 'horizontal', refs: ['0'] }], dims: [{ e: 0, k: 'dy' }] };
      var r2 = SS.setDim(s2, 0, 5);
      assert(!r2.ok && /Horizontal: Line1/.test(r2.error), r2.error);
      return r.error;
    });
    test('dragging a circle by its edge changes the radius about a fixed centre; a radius held by a dimension does not move', function () {
      var s = { entities: [{ t: 'circle', cx: 10, cy: 0, r: 5 }], rels: [{ type: 'coincident', refs: ['0.c', 'O'] }] };
      SS.solve(s);
      var st = copy(s.entities);
      assert(SS.drag(s, '0', [0, 12], st, { radius: true }).ok, 'drag');
      near(s.entities[0].r, 12, 1e-6, 'radius follows'); near(s.entities[0].cx, 0, 1e-9, 'centre stays');
      var d = { entities: [{ t: 'circle', cx: 0, cy: 0, r: 5 }], dims: [{ e: 0, k: 'dia' }] };
      var st2 = copy(d.entities);
      SS.drag(d, '0', [0, 12], st2, { radius: true });
      near(d.entities[0].r, 5, 1e-6, 'dimensioned radius');
    });
    test('explodeRect: a corner rectangle (corner on the origin, width 50 on the top edge) becomes four lines with H/V and corner Coincidents, the width a length dimension of the top line, DOF unchanged; a centre rectangle centred on the origin keeps that through a construction diagonal\'s midpoint; later entities shift', function () {
      var s = { entities: [{ t: 'rect', x: 0, y: 0, w: 50, h: 30 }, { t: 'circle', cx: 80, cy: 0, r: 5 }], rels: [{ type: 'coincident', refs: ['0.v0', 'O'] }, { type: 'tangent', refs: ['0.e1', '1'] }], dims: [{ e: 0, k: 'w', i: 2, off: 6 }, { e: 1, k: 'dia' }] };
      SS.solve(s);
      var dof0 = SS.analyze(s).dof;
      assert(SS.explodeRect(s, 0) === 0, 'exploded');
      assert(s.entities.length === 5 && s.entities.slice(0, 4).every(function (e) { return e.t === 'line'; }) && s.entities[4].t === 'circle', JSON.stringify(s.entities));
      var rl = relList(s), an = SS.analyze(s);
      assert(rl.indexOf('coincident:0.p1,O') >= 0 && rl.indexOf('tangent:1,4') >= 0 && rl.indexOf('horizontal:2') >= 0 && rl.indexOf('vertical:3') >= 0, rl.join(' '));
      assert(an.dof === dof0 && !an.conflicts && !an.redundant, 'DOF ' + an.dof + ' vs ' + dof0);
      assert(s.dims[0].e === 2 && s.dims[0].k === 'len' && s.dims[0].off === -6 && s.dims[1].e === 4, 'dims ' + JSON.stringify(s.dims));
      near(K.dimValue(s.entities[2], s.dims[0]), 50, 1e-9, 'top length');
      var c = { entities: [{ t: 'crect', cx: 3, cy: 2, w: 40, h: 20 }], rels: [{ type: 'coincident', refs: ['0.c', 'O'] }] };
      SS.solve(c);
      var d0 = SS.analyze(c).dof;
      SS.explodeRect(c, 0);
      var ac = SS.analyze(c), rc = relList(c);
      assert(c.entities.length === 5 && c.entities[4].construction && rc.indexOf('coincident:4.mid,O') >= 0, rc.join(' '));
      assert(ac.dof === d0 && !ac.conflicts && !ac.redundant, 'centre rectangle DOF ' + ac.dof + ' vs ' + d0 + ' ' + JSON.stringify(ac.rels));
      return rl.join(' ');
    });
    test('Add Relations that cannot be satisfied (Equal on a 40 x 30 dimensioned rectangle) reports status conflict and names the dimensions it fights', function () {
      var s = lineRect(40, 30);
      s.dims = [{ e: 0, k: 'len' }, { e: 1, k: 'len' }];
      var r = SS.addRelation(s, 'equal', ['0', '1']);
      assert(r.ok && r.status === 'conflict' && r.conflicts && r.conflicts.some(function (t) { return /Line[12] length \((40|30)\)/.test(t); }), JSON.stringify(r.conflicts) + ' ' + r.status);
      return r.conflicts.join('; ');
    });
    test('offsetEntity keeps the kind (circle r 10 + 2 -> circle r 12, rectangle grows 2 each side, slot width +4, hexagon across flats +4) and offsetRelations centres the copy (Concentric / Coincident); too large an inward offset gives null', function () {
      var c = SS.offsetEntity({ t: 'circle', cx: 1, cy: 2, r: 10 }, 2);
      assert(c.t === 'circle' && c.r === 12 && c.cx === 1, JSON.stringify(c));
      var r = SS.offsetEntity({ t: 'rect', x: 0, y: 0, w: 40, h: 20 }, 2);
      assert(r.t === 'rect' && r.x === -2 && r.y === -2 && r.w === 44 && r.h === 24, JSON.stringify(r));
      var s = SS.offsetEntity({ t: 'slot', x1: 0, y1: 0, x2: 30, y2: 0, w: 10 }, 2);
      assert(s.t === 'slot' && s.w === 14, JSON.stringify(s));
      var hex = { t: 'poly', cx: 0, cy: 0, r: 10, n: 6, rot: 0 }, h2 = SS.offsetEntity(hex, 2);
      near(h2.r * Math.cos(Math.PI / 6) - hex.r * Math.cos(Math.PI / 6), 2, 1e-12, 'across-flats grows by the offset');
      assert(SS.offsetEntity({ t: 'circle', cx: 0, cy: 0, r: 3 }, -5) === null, 'inward past the centre');
      var sk = { entities: [{ t: 'circle', cx: 0, cy: 0, r: 10 }, c] };
      sk.entities[1] = SS.offsetEntity(sk.entities[0], 2);
      sk.rels = SS.offsetRelations(sk, 0, 1);
      assert(sk.rels.length === 1 && sk.rels[0].type === 'concentric' && SS.analyze(sk).dof === 4, JSON.stringify(sk.rels) + ' dof ' + SS.analyze(sk).dof);
    });
    test('mirrorRelations: a line and a circle mirrored about a centerline are held Symmetric to their originals (moving the original drags the copy along)', function () {
      var sk = { entities: [{ t: 'line', x1: 0, y1: -20, x2: 0, y2: 20, construction: true }, { t: 'line', x1: 5, y1: 0, x2: 15, y2: 10 }, { t: 'circle', cx: 10, cy: -10, r: 3 }] };
      var ax = K.mirrorAxis(0, sk.entities);
      sk.entities.push(K.mirrorEntity(sk.entities[1], ax), K.mirrorEntity(sk.entities[2], ax));
      var n = SS.mirrorRelations(sk, [[1, 3], [2, 4]], 0);
      assert(n === 2 && relList(sk).join(' ') === 'symmetric:1,3,0 symmetric:2,4,0', relList(sk).join(' '));
      sk.rels.push({ type: 'fix', refs: ['0'] });
      var r = SS.drag(sk, '2.c', [12, -8], copy(sk.entities));
      assert(r.ok, 'drag');
      near(sk.entities[4].cx, -sk.entities[2].cx, 1e-6, 'copy follows in x'); near(sk.entities[4].cy, sk.entities[2].cy, 1e-6, 'copy follows in y');
      return n + ' symmetric';
    });
  })();
  // --- end refine/sketcher ---
