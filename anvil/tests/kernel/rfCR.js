  // --- rfCR (2026-10-19, lane CR: Sketch tab items) --- Equal Curve Length (SolidWorks: two of line, arc, circle, spline
  // keep one length; offered in Add Relations, listed by name) and Replace Entity (SketchSolver.replaceEntity: the
  // relations and dimensions of one entity move to another, each end to the nearest end, the old entity deleted or kept
  // as construction; all or nothing when the moved dimensions would over-define the sketch).
  (function () {
    if (typeof SketchSolver === 'undefined') return;
    group('rfCR: Equal Curve Length, Replace Entity');
    var SS = SketchSolver;
    function rl(sk) { return (sk.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }); }
    function lineLen(e) { return Math.hypot(e.x2 - e.x1, e.y2 - e.y1); }
    function arcLen(e) { return Math.abs(e.a1 - e.a0) * Math.PI / 180 * e.r; }
    function lineArc() { return { entities: [{ t: 'line', x1: 0, y1: 0, x2: 3, y2: 0 }, { t: 'arc', cx: 0, cy: 2, r: 1, a0: 0, a1: 90 }] }; }
    test('rfCR: Equal Curve Length is in the catalogue with its own name and glyph, offered in Add Relations for a line and an arc (not for a point, not for a slot), and once added the line and the arc have one length; the relation is described by its name', function () {
      assert(SS.TYPES.equalcurve && SS.TYPES.equalcurve.name === 'Equal Curve Length' && SS.TYPES.equalcurve.glyph, 'catalogue: ' + JSON.stringify(SS.TYPES.equalcurve));
      var sk = lineArc();
      assert(SS.applicable(sk, ['0', '1']).indexOf('equalcurve') >= 0, 'offered for a line and an arc: ' + SS.applicable(sk, ['0', '1']));
      assert(SS.applicable(sk, ['0.p1', '1']).indexOf('equalcurve') < 0, 'not for a point: ' + SS.applicable(sk, ['0.p1', '1']));
      var slot = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 3, y2: 0 }, { t: 'slot', x1: 0, y1: 2, x2: 2, y2: 2, w: 0.5 }] };
      assert(SS.applicable(slot, ['0', '1']).indexOf('equalcurve') < 0 && !SS.addRelation(slot, 'equalcurve', ['0', '1']).ok, 'not for a slot');
      var r = SS.addRelation(sk, 'equalcurve', ['0', '1']);
      assert(r.ok && r.status === 'ok', 'added: ' + JSON.stringify(r));
      near(lineLen(sk.entities[0]), arcLen(sk.entities[1]), 1e-9, 'one length');
      assert(SS.describe(sk, sk.rels[0]) === 'Equal Curve Length: Line1, Arc2', SS.describe(sk, sk.rels[0]));
      var an = SS.analyze(sk);
      assert(an.rels[0] === 'ok' && !an.conflicts && !an.redundant, 'clean: ' + JSON.stringify(an.rels));
    });
    test('rfCR: with Equal Curve Length, dragging the line\'s end or the arc\'s end keeps the two lengths equal; a line and a spline too', function () {
      var sk = lineArc();
      SS.addRelation(sk, 'equalcurve', ['0', '1']);
      var start = JSON.parse(JSON.stringify(sk.entities)), r = SS.drag(sk, '0.p2', [5, 0.5], start);
      assert(r.ok, 'drag the line: ' + JSON.stringify(r));
      assert(lineLen(sk.entities[0]) > 3.5, 'the line got longer: ' + lineLen(sk.entities[0]));
      near(lineLen(sk.entities[0]), arcLen(sk.entities[1]), 1e-6, 'still one length after dragging the line');
      start = JSON.parse(JSON.stringify(sk.entities)); r = SS.drag(sk, '1.p2', [-1.5, 2], start);
      assert(r.ok, 'drag the arc: ' + JSON.stringify(r));
      near(lineLen(sk.entities[0]), arcLen(sk.entities[1]), 1e-6, 'still one length after dragging the arc');
      var sp = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 3, y2: 0 }, { t: 'spline', pts: [[0, 2], [1, 3], [2, 2], [3, 3]] }] };
      assert(SS.applicable(sp, ['0', '1']).indexOf('equalcurve') >= 0, 'offered for a line and a spline');
      r = SS.addRelation(sp, 'equalcurve', ['0', '1']);
      assert(r.ok && r.status === 'ok' && lineLen(sp.entities[0]) > 3.2, 'the line took the spline\'s length: ' + JSON.stringify(r.status) + ' ' + lineLen(sp.entities[0]));
    });
    test('rfCR: Equal Curve Length plus a length dimension on each curve over-defines the sketch: the second dimension conflicts, and is refused when asked to reject over-defining', function () {
      var sk = lineArc();
      SS.addRelation(sk, 'equalcurve', ['0', '1']);
      sk.dims = [{ e: 0, k: 'len' }];
      var an = SS.analyze(sk);
      assert(!an.conflicts && !an.redundant, 'one length dimension is fine: ' + JSON.stringify(an.rels));
      var r = SS.addRelation(sk, 'arclength', ['1'], { value: 2 });
      assert(r.ok && r.status === 'conflict', 'a second length conflicts: ' + JSON.stringify(r.status));
      SS.deleteRelation(sk, sk.rels.length - 1);
      r = SS.addRelation(sk, 'arclength', ['1'], { value: 2, rejectOver: true });
      assert(!r.ok && /over-define/.test(r.error), 'refused: ' + JSON.stringify(r));
      an = SS.analyze(sk);
      assert(!an.conflicts && sk.rels.length === 1, 'the sketch is as it was: ' + rl(sk).join(' '));
    });
    function dimmed() {
      return { entities: [{ t: 'line', x1: 0, y1: 0, x2: 4, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 0, y2: 3 }, { t: 'line', x1: 0.2, y1: 0.1, x2: 4.3, y2: 0.4 }],
        rels: [{ type: 'coincident', refs: ['0.p1', '1.p1'] }, { type: 'horizontal', refs: ['0'] }], dims: [{ e: 0, k: 'len', off: 0.5 }] };
    }
    test('rfCR: Replace Entity — a dimensioned line with a Coincident at one end is replaced by a new line: the dimension and the Coincident (to the nearest end) sit on the new line, the dimension keeps its value, the old line is gone; the result is one solved sketch', function () {
      var sk = dimmed(), r = SS.replaceEntity(sk, 0, 2);
      assert(r.ok && r.index === 1 && r.moved === 2 && r.dims === 1, JSON.stringify(r));
      assert(sk.entities.length === 2 && sk.entities[0].y2 === 3 && sk.entities[1].t === 'line', 'the old line went, the new one is entity 1: ' + JSON.stringify(sk.entities));
      var R = rl(sk);
      assert(R.indexOf('coincident:1.p1,0.p1') >= 0 && R.indexOf('horizontal:1') >= 0, 'relations moved to the new line: ' + R.join(' '));
      assert(sk.dims.length === 1 && sk.dims[0].e === 1 && sk.dims[0].k === 'len' && sk.dims[0].off === 0.5, 'the dimension moved: ' + JSON.stringify(sk.dims));
      near(lineLen(sk.entities[1]), 4, 1e-9, 'the new line took the dimension\'s value');
      near(sk.entities[1].x1, sk.entities[0].x1, 1e-9, 'its start is joined to the other line'); near(sk.entities[1].y1, sk.entities[0].y1, 1e-9, 'joined (y)');
      near(sk.entities[1].y1, sk.entities[1].y2, 1e-9, 'horizontal');
      var an = SS.analyze(sk);
      assert(!an.conflicts && !an.redundant, 'solved clean: ' + JSON.stringify(an.rels));
    });
    test('rfCR: Replace Entity options and refusals — Make construction keeps the old entity as construction geometry; a relation the new entity cannot take (Horizontal onto an arc) and a dimension it cannot carry are dropped; a replacement that would over-define the sketch is refused and leaves it exactly as it was; a point or the same entity is refused', function () {
      var sk = dimmed();
      sk.entities[2] = { t: 'arc', cx: 2, cy: 0, r: 2, a0: 180, a1: 360 };
      var r = SS.replaceEntity(sk, 0, 2, { construction: true });
      assert(r.ok && r.index === 2 && sk.entities.length === 3 && sk.entities[0].construction === true, 'kept as construction: ' + JSON.stringify(sk.entities[0]));
      var R = rl(sk);
      assert(R.indexOf('coincident:2.p1,1.p1') >= 0 && R.indexOf('horizontal:2') < 0 && !sk.dims, 'Coincident moved, Horizontal and the length dropped: ' + R.join(' ') + ' ' + JSON.stringify(sk.dims));
      sk = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 4, y2: 0 }, { t: 'line', x1: 0, y1: 1, x2: 2, y2: 1 }], rels: [{ type: 'fix', refs: ['1'] }], dims: [{ e: 0, k: 'len' }] };
      var before = JSON.stringify(sk);
      r = SS.replaceEntity(sk, 0, 1);
      assert(!r.ok && /over-define/.test(r.error) && JSON.stringify(sk) === before, 'a fixed replacement cannot take the dimension: ' + JSON.stringify(r) + ' unchanged ' + (JSON.stringify(sk) === before));
      sk = dimmed();
      assert(!SS.replaceEntity(sk, 0, 0).ok && !SS.replaceEntity(sk, 0, 9).ok, 'the same entity or none is refused');
      sk.entities.push({ t: 'point', x: 1, y: 1 });
      assert(!SS.replaceEntity(sk, 0, 3).ok, 'a point is refused');
    });
  })();
