  // --- p9-sketchfix: sketcher bugs from the 2026-10-07 test reports (complex sketch, bent channel): Sketch Fillet on a
  // corner with no dimensions, repeated relations, Trim splitting a line, Mirror Entities on slots / polygons ---
  group('p9-sketchfix: fillet, repeats, trim split, mirror');
  (function () {
    if (typeof SketchSolver === 'undefined') return;
    var SS = SketchSolver;
    function relList(s) { return (s.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }); }
    function keyOf(r) { return r.type + ':' + r.refs.slice().sort().join(',') + (r.dir || ''); }
    function noRepeats(s) { var seen = {}; return (s.rels || []).every(function (r) { var k = keyOf(r) + (r.driven ? 'd' : ''); if (seen[k]) return false; seen[k] = true; return true; }); }
    // the outline drawn as a Line chain from the origin: both ends at the origin carry their own Coincident with it
    function chainRect(w, h) {
      return { entities: [{ t: 'line', x1: 0, y1: 0, x2: w, y2: 0 }, { t: 'line', x1: w, y1: 0, x2: w, y2: h }, { t: 'line', x1: w, y1: h, x2: 0, y2: h }, { t: 'line', x1: 0, y1: h, x2: 0, y2: 0 }],
        rels: [{ type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }, { type: 'horizontal', refs: ['2'] }, { type: 'vertical', refs: ['3'] },
          { type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'coincident', refs: ['2.p2', '3.p1'] },
          { type: 'coincident', refs: ['0.p1', 'O'] }, { type: 'coincident', refs: ['3.p2', 'O'] }] };
    }
    // the 8 × 5 mounting plate of the complex-sketch report: 8 wide, 3 high sides, 5 overall, 4 across the top, 135°
    function plate() {
      var P = [[0, 0], [8, 0], [8, 3], [6, 5], [2, 5], [0, 3]];
      var s = { entities: P.map(function (p, i) { var q = P[(i + 1) % 6]; return { t: 'line', x1: p[0], y1: p[1], x2: q[0], y2: q[1] }; }), rels: [], dims: [] };
      for (var i = 0; i < 6; i++) s.rels.push({ type: 'coincident', refs: [i + '.p2', ((i + 1) % 6) + '.p1'] });
      s.rels.push({ type: 'coincident', refs: ['0.p1', 'O'] }, { type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }, { type: 'horizontal', refs: ['3'] }, { type: 'vertical', refs: ['5'] });
      s.rels.push({ type: 'distance', refs: ['5', '1'], v: 8 }, { type: 'distance', refs: ['0', '3'], v: 5 }, { type: 'angle', refs: ['4', '3'], v: 135, sup: true });
      s.dims.push({ e: 1, k: 'len' }, { e: 5, k: 'len' }, { e: 3, k: 'len', off: 0.5 });
      return s;
    }

    test('p9-sketchfix: Sketch Fillet on the origin corner of a Line chain with no dimensions — no crash, one Coincident with the origin on the virtual sharp (not two), tangent / coincident relations and the R dimension added, DOF unchanged', function () {
      var s = chainRect(8, 3), a0 = SS.analyze(s);
      var r = SS.filletCorner(s, SS.lineCorner(s, [0, 0], 1), 0.5);
      assert(r.ok, r.error);
      var rl = relList(s), an = SS.analyze(s);
      assert(rl.filter(function (x) { return x === 'coincident:' + r.sharp + ',O' || x === 'coincident:O,' + r.sharp; }).length === 1, 'one origin Coincident on the sharp: ' + rl.join(' '));
      assert(rl.indexOf('tangent:0,' + r.arc) >= 0 && rl.indexOf('tangent:3,' + r.arc) >= 0, 'tangents: ' + rl.join(' '));
      assert(rl.filter(function (x) { return new RegExp('^coincident:.*' + r.arc + '\\.p').test(x); }).length === 2, 'arc ends joined: ' + rl.join(' '));
      assert(s.dims && s.dims.length === 1 && s.dims[0].k === 'r', 'R dimension: ' + JSON.stringify(s.dims));
      assert(an.dof === a0.dof && !an.redundant && !an.conflicts && noRepeats(s), 'DOF ' + an.dof + ' vs ' + a0.dof + ', ' + an.status);
      // dimensioned to Fully Defined first: it stays Fully Defined
      var f = chainRect(8, 3);
      f.dims = [{ e: 0, k: 'len' }, { e: 3, k: 'len' }];
      assert(SS.analyze(f).status === 'full', 'fully defined before');
      var r2 = SS.filletCorner(f, SS.lineCorner(f, [0, 0], 1), 0.5);
      assert(r2.ok && SS.analyze(f).status === 'full' && noRepeats(f), 'stays Fully Defined: ' + SS.analyze(f).status + ' ' + relList(f).join(' '));
      return relList(s).slice(-6).join(' ');
    });
    test('p9-sketchfix: a Sketch Fillet that fails part way leaves the sketch exactly as it was (all or nothing)', function () {
      var s = chainRect(8, 3);
      s.dims = [];
      s.dims.filter = function () { throw new Error('dims unreadable'); };   // throws after the lines were trimmed and the arc added
      var before = JSON.stringify(s), r = SS.filletCorner(s, SS.lineCorner(s, [0, 0], 1), 0.5);
      assert(!r.ok && r.error, 'reported: ' + JSON.stringify(r));
      assert(JSON.stringify(s) === before, 'sketch untouched: ' + JSON.stringify(s.entities));
      return r.error;
    });
    test('p9-sketchfix: repeated relations are dropped (same type and refs in either order, a point with itself); a driven dimension repeating a driving one stays', function () {
      var s = chainRect(8, 3);
      s.rels.push({ type: 'coincident', refs: ['O', '3.p2'] }, { type: 'horizontal', refs: ['0'] }, { type: 'parallel', refs: ['0', '2'] }, { type: 'parallel', refs: ['2', '0'] }, { type: 'coincident', refs: ['1.p1', '1.p1'] });
      s.rels.push({ type: 'distance', refs: ['0', '2'], v: 3 }, { type: 'distance', refs: ['2', '0'], v: 3, driven: true });
      var n = s.rels.length;
      SS.clean(s);
      assert(s.rels.length === n - 4 && noRepeats(s), 'four repeats gone: ' + relList(s).join(' '));
      assert(s.rels.filter(function (r) { return r.type === 'distance'; }).length === 2, 'driving + driven distance kept');
    });
    test('p9-sketchfix: Trim on the fully defined plate — a notch circle at the top edge\'s midpoint trimmed to its lower half, then the top edge cut inside it: stays Fully Defined, nothing over defining, pieces Collinear, the 4.000 length becomes the distance between the outer ends, the Midpoint holds the notch centre between them', function () {
      var s = plate();
      assert(SS.analyze(s).status === 'full', 'plate fully defined: ' + SS.analyze(s).status);
      s.entities.push({ t: 'circle', cx: 4, cy: 5, r: 0.75 });
      s.rels.push({ type: 'midpoint', refs: ['6.c', '3'] });
      s.dims.push({ e: 6, k: 'dia' });
      assert(SS.analyze(s).status === 'full', 'with the notch circle');
      assert(SS.trimAt(s, 6, [4, 5.75]).ok, 'trim circle');
      var a1 = SS.analyze(s);
      assert(a1.status === 'full' && relList(s).indexOf('midpoint:6.c,3') >= 0, 'circle trimmed: the arc keeps its Midpoint: ' + a1.status + ' ' + relList(s).join(' '));
      assert(SS.trimAt(s, 3, [4, 5]).ok, 'trim line');
      var an = SS.analyze(s), rl = relList(s);
      assert(an.status === 'full' && !an.redundant && !an.conflicts && an.dof === 0, 'Fully Defined, nothing over defining: ' + an.status + ' dof ' + an.dof + ' ' + JSON.stringify(an.rels));
      assert(rl.indexOf('collinear:3,4') >= 0, 'pieces Collinear: ' + rl.join(' '));
      assert(rl.filter(function (x) { return /^angle:/.test(x); }).length === 1 && rl.filter(function (x) { return /^distance:0,[34]$/.test(x); }).length === 1, 'angle and 5.000 on one piece each: ' + rl.join(' '));
      assert(rl.indexOf('angle:5,4') >= 0, 'the angle goes to the piece the chamfer joins: ' + rl.join(' '));
      var d4 = s.rels.filter(function (r) { return r.type === 'distance' && r.refs.join() === '3.p1,4.p2'; })[0];
      assert(d4 && Math.abs(d4.v - 4) < 1e-9 && d4.off === 0.5, '4.000 between the outer ends, same side: ' + JSON.stringify(d4));
      assert(rl.indexOf('midpoint:7.c,3.p1,4.p2') >= 0, 'Midpoint of the outer ends: ' + rl.join(' '));
      assert(!s.dims.some(function (d) { return d.k === 'len' && (d.e === 3 || d.e === 4); }) && noRepeats(s), 'no length dimension left on a piece');
      // the length still drives: 4 -> 4.5 keeps the notch centred and everything joined
      assert(SS.setRelValue(s, s.rels.indexOf(d4), 4.5).ok, '4.5');
      var E = s.entities;
      near(E[3].x1 - E[4].x2, 4.5, 1e-6, 'top 4.5'); near(E[7].cx, (E[3].x1 + E[4].x2) / 2, 1e-6, 'notch centred');
      near(E[3].x2, E[7].cx + 0.75, 1e-6, 'right piece ends on the notch');
      assert(SS.analyze(s).status === 'full', 'still Fully Defined');
      return rl.slice(-6).join(' ');
    });
    test('p9-sketchfix: Trim away inside on an arc cut by two lines — the two arc pieces stay on one circle (Concentric + Equal), the radius dimension on one, DOF unchanged, nothing over defining', function () {
      var s = { entities: [{ t: 'arc', cx: 0, cy: 0, r: 10, a0: 0, a1: 180 }, { t: 'line', x1: -12, y1: 0, x2: 12, y2: 0 }, { t: 'line', x1: -3, y1: 0, x2: -3, y2: 12 }, { t: 'line', x1: 3, y1: 0, x2: 3, y2: 12 }],
        rels: [{ type: 'coincident', refs: ['0.c', 'O'] }, { type: 'coincident', refs: ['0.p1', '1'] }, { type: 'coincident', refs: ['0.p2', '1'] }, { type: 'fix', refs: ['1'] }, { type: 'fix', refs: ['2'] }, { type: 'fix', refs: ['3'] }],
        dims: [{ e: 0, k: 'r' }] };
      var a0 = SS.analyze(s);
      assert(a0.status === 'full', 'full before: ' + a0.status);
      var r = SS.trimBetween(s, 0, [0, 10], [2, 3], false);
      assert(r.ok && r.pieces === 2, JSON.stringify(r));
      var an = SS.analyze(s), rl = relList(s);
      assert(an.dof === a0.dof && !an.redundant && !an.conflicts, 'DOF ' + an.dof + ' ' + an.status + ' ' + JSON.stringify(an.rels));
      assert(rl.some(function (x) { return /^concentric:\d,\d$/.test(x); }) && rl.some(function (x) { return /^equal:\d,\d$/.test(x); }), rl.join(' '));
      assert(s.dims.length === 1 && s.dims[0].k === 'r', 'one radius: ' + JSON.stringify(s.dims));
      return rl.join(' ');
    });
    test('p9-sketchfix: three-point Midpoint (the first point midway between the other two) holds, round-trips through .rel(), and Add Relations keeps it one relation', function () {
      var s = { entities: [{ t: 'point', x: 1, y: 1 }, { t: 'line', x1: 0, y1: 0, x2: 2, y2: 4 }] };
      var r = SS.addRelation(s, 'midpoint', ['0', '1.p1', '1.p2']);
      assert(r.ok && s.rels.length === 1 && s.rels[0].refs.length === 3, JSON.stringify(s.rels));
      var e0 = s.entities[0], l = s.entities[1];
      near(e0.x, (l.x1 + l.x2) / 2, 1e-9, 'x'); near(e0.y, (l.y1 + l.y2) / 2, 1e-9, 'y');
      var b = build('p.sketch("Front").point(1, 1).line(0, 0, 2, 4).rel("midpoint", ["0", "1.p1", "1.p2"]).extrude(1);'), sk = b.model.features.filter(function (f) { return f.type === 'sketch'; })[0];
      var p0 = sk.entities[0], l1 = sk.entities[1];
      assert(sk.rels.length === 1 && sk.rels[0].refs.length === 3 && Math.abs(p0.y - (l1.y1 + l1.y2) / 2) < 1e-9 && Math.abs(p0.x - (l1.x1 + l1.x2) / 2) < 1e-9, JSON.stringify(sk.rels));
      return SS.describe(s, s.rels[0]);
    });
    test('p9-sketchfix: Mirror Entities holds a slot copy by one Symmetric (ends mirrored, equal width) and a polygon copy by its centre and first corner: changing the original\'s length / width / radius moves the copy', function () {
      function mk(e) {
        var sk = { entities: [{ t: 'line', x1: 4, y1: 0, x2: 4, y2: 5, construction: true }, e], rels: [{ type: 'fix', refs: ['0'] }] };
        var m = K.mirrorEntity(e, K.mirrorAxis(0, sk.entities));
        Object.keys(m).forEach(function (k) { if (typeof m[k] === 'number') m[k] = Math.round(m[k] * 1e4) / 1e4; });
        sk.entities.push(m);
        return { sk: sk, n: SS.mirrorRelations(sk, [[1, 2]], 0) };
      }
      var a = mk({ t: 'slot', x1: 1.9, y1: 2, x2: 1.9, y2: 3.12, w: 0.37 }), s = a.sk;
      s.dims = [{ e: 1, k: 'len' }, { e: 1, k: 'w' }];
      assert(a.n === 1 && relList(s).indexOf('symmetric:1,2,0') >= 0, relList(s).join(' '));
      assert(SS.setDim(s, 0, 1).ok && SS.setDim(s, 1, 0.5).ok, 'dimensions drive');
      var o = s.entities[1], c = s.entities[2];
      near(Math.hypot(c.x2 - c.x1, c.y2 - c.y1), 1, 1e-6, 'copy length follows'); near(c.w, 0.5, 1e-9, 'copy width follows');
      near(c.x1, 8 - o.x1, 1e-6, 'copy mirrored'); near(c.y1, o.y1, 1e-6, 'copy y');
      var b = mk({ t: 'poly', cx: 2, cy: 2, r: 0.5, n: 6, rot: 10 }), p = b.sk;
      p.dims = [{ e: 1, k: 'r' }];
      assert(b.n === 1 && SS.analyze(p).status !== 'over', relList(p).join(' '));
      assert(SS.setDim(p, 0, 0.8).ok, 'radius drives');
      near(p.entities[2].r, 0.8, 1e-6, 'copy radius follows');
      assert(SS.drag(p, '1.v0', [2.3, 2.9], JSON.parse(JSON.stringify(p.entities))).ok, 'drag a corner');
      var v1 = SS.refPoint(p, '1.v0'), v2 = SS.refPoint(p, '2.v0');
      near(v2[0], 8 - v1[0], 1e-6, 'mirrored corner x'); near(v2[1], v1[1], 1e-6, 'mirrored corner y');
      return relList(s).concat(relList(p)).join(' ');
    });
  })();
  // --- end p9-sketchfix ---

