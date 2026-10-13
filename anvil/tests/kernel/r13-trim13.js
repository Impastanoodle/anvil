  // --- r13/trim13 ---
  (function () {
    if (typeof SketchSolver === 'undefined') return;
    var SS = SketchSolver;
    function rl(sk) { return (sk.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }); }
    function cross3() { return { entities: [{ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'line', x1: 10, y1: -5, x2: 10, y2: 5 }, { t: 'line', x1: 20, y1: -5, x2: 20, y2: 5 }], rels: [{ type: 'horizontal', refs: ['0'] }] }; }
    test('r13/trim13: the span Trim highlights is the span it removes (line between crossings, line end, circle, rectangle edge, lone circle)', function () {
      var sk = cross3(), sp = SS.trimSpan(sk, 0, [15, 0.1]);
      assert(!sp.whole && sp.pts.length === 2, 'two ends: ' + JSON.stringify(sp));
      near(sp.pts[0][0], 10, 1e-9, 'from the first crossing'); near(sp.pts[1][0], 20, 1e-9, 'to the second');
      sp = SS.trimSpan(sk, 0, [25, 0]);
      near(sp.pts[0][0], 20, 1e-9, 'end span from the last crossing'); near(sp.pts[1][0], 30, 1e-9, 'to the end');
      var c = { entities: [{ t: 'circle', cx: 0, cy: 0, r: 10 }, { t: 'line', x1: -20, y1: 0, x2: 20, y2: 0 }] };
      sp = SS.trimSpan(c, 0, [0, 10]);
      assert(sp.pts.every(function (p) { return p[1] >= -1e-9; }) && sp.pts.length > 10, 'the upper half (what K.trimEntity removes)');
      var kept = K.trimEntity(c.entities, 0, [0, 10]).filter(function (e) { return e.t === 'arc'; })[0];
      near(kept.a0, 180, 1e-9, 'kernel keeps the lower half');
      var r = { entities: [{ t: 'rect', x: 0, y: 0, w: 40, h: 20 }, { t: 'line', x1: 10, y1: -5, x2: 10, y2: 5 }] };
      sp = SS.trimSpan(r, 0, [5, 0]);
      assert(Math.abs(sp.pts[0][0]) < 1e-9 && Math.abs(sp.pts[1][0] - 10) < 1e-9 && !sp.whole, 'bottom edge from its corner to the crossing: ' + JSON.stringify(sp.pts));
      assert(SS.trimSpan({ entities: [{ t: 'circle', cx: 0, cy: 0, r: 3 }] }, 0, [3, 0]).whole, 'a lone circle goes whole');
    });
    test('r13/trim13: Power trim — a trail across three entities trims each crossed segment (a lone circle goes), in one pass; relations follow without redundancy', function () {
      var sk = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'line', x1: 10, y1: -5, x2: 10, y2: 5 }, { t: 'line', x1: 20, y1: -5, x2: 20, y2: 5 }, { t: 'circle', cx: 40, cy: 0, r: 3 }],
        rels: [{ type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }, { type: 'vertical', refs: ['2'] }] };
      var calls = 0, n = SS.powerTrim(sk, [5, 2], [45, 2], function () { calls++; });
      assert(n === 3 && calls === 1, 'three trims, onFirst once: ' + n + ' ' + calls);
      var E = sk.entities;
      assert(E.length === 3 && E.every(function (e) { return e.t === 'line'; }), 'circle deleted: ' + JSON.stringify(E));
      assert(Math.abs(E[1].y2) < 1e-9 && Math.abs(E[2].y2) < 1e-9 && Math.abs(E[1].y1 + 5) < 1e-9, 'the verticals lost their tops');
      var R = rl(sk);
      assert(R.indexOf('coincident:1.p2,0') >= 0 && R.indexOf('coincident:2.p2,0') >= 0 && R.indexOf('vertical:1') >= 0, R.join(' '));
      var an = SS.analyze(sk);
      assert(!an.conflicts && !an.redundant, 'no conflicts / redundancy: ' + JSON.stringify(an.rels));
      // a trail missing everything changes nothing; a trail through the middle of the line splits it
      assert(SS.powerTrim(sk, [50, 50], [60, 60]) === 0, 'nothing crossed');
      n = SS.powerTrim(sk, [15, 1], [15, -1]);
      assert(n === 1 && sk.entities.length === 4, 'the line between the verticals went: ' + sk.entities.length);
      an = SS.analyze(sk);
      assert(!an.conflicts && !an.redundant, 'still clean: ' + rl(sk).join(' '));
    });
    test('r13/trim13: trimming where another end sits on the line gives one Coincident (the point in the removed gap loses its point-on-line one); the analysis is passed on (ctx)', function () {
      var sk = cross3();
      sk.entities[1] = { t: 'line', x1: 10, y1: 0, x2: 10, y2: 5 };
      sk.rels.push({ type: 'coincident', refs: ['1.p1', '0'] });
      sk.entities.push({ t: 'point', x: 15, y: 0 });
      sk.rels.push({ type: 'coincident', refs: ['3', '0'] });
      var ctx = {}, r = SS.trimAt(sk, 0, [15, 0.1], ctx);
      assert(r.ok, r.error);
      var R = rl(sk);
      // now [piece, piece, vertical (its end at the cut), vertical, point]
      assert(R.filter(function (x) { return /^coincident:.*\b2\.p1\b/.test(x); }).length === 1, 'one Coincident on the vertical\'s end: ' + R.join(' '));
      assert(R.every(function (x) { return !/^coincident:4,|,4$/.test(x); }), 'the point in the gap is no longer held on the line: ' + R.join(' '));
      var an = SS.analyze(sk);
      assert(!an.redundant && ctx.analysis && ctx.conflicts === an.conflicts && ctx.analysis.dof === an.dof, 'ctx carries the result\'s analysis');
    });
    test('r13/trim13: Corner — two lines that fall short meet (extended), two that cross are trimmed back keeping the clicked sides; a line and an arc; joined by a Coincident', function () {
      var sk = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 15, y1: 5, x2: 15, y2: 20 }], rels: [{ type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }] };
      var r = SS.cornerTrim(sk, 0, [2, 0], 1, [15, 15]);
      assert(r.ok, r.error);
      var E = sk.entities;
      assert(E[0].x2 === 15 && E[0].y2 === 0 && E[1].x1 === 15 && E[1].y1 === 0 && E[1].y2 === 20, 'extended: ' + JSON.stringify(E));
      assert(rl(sk).indexOf('coincident:0.p2,1.p1') >= 0, rl(sk).join(' '));
      var x = { entities: [{ t: 'line', x1: -10, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 0, y1: -10, x2: 0, y2: 10 }] };
      r = SS.cornerTrim(x, 0, [-5, 0], 1, [0, 5]);
      assert(r.ok && x.entities[0].x1 === -10 && Math.abs(x.entities[0].x2) < 1e-9 && Math.abs(x.entities[1].y1) < 1e-9 && x.entities[1].y2 === 10, 'trimmed to an L: ' + JSON.stringify(x.entities));
      var la = { entities: [{ t: 'line', x1: -20, y1: 5, x2: -12, y2: 5 }, { t: 'arc', cx: 0, cy: 0, r: 10, a0: 90, a1: 120 }] };
      r = SS.cornerTrim(la, 0, [-18, 5], 1, [0, 10]);
      assert(r.ok, r.error);
      var a = la.entities[1], end = [a.cx + a.r * Math.cos(a.a1 * Math.PI / 180), a.cy + a.r * Math.sin(a.a1 * Math.PI / 180)];
      near(la.entities[0].x2, -Math.sqrt(75), 1e-6, 'line reaches the circle'); near(end[0], la.entities[0].x2, 1e-6, 'arc end meets it'); near(end[1], 5, 1e-6, 'at y = 5');
      assert(!SS.cornerTrim({ entities: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 0, y1: 5, x2: 10, y2: 5 }] }, 0, [1, 0], 1, [1, 5]).ok, 'parallel lines cannot meet');
    });
    test('r13/trim13: Trim away inside removes the part between two bounding lines, outside keeps only it; a circle keeps the side clicked; an entity that misses a boundary is refused', function () {
      function frame() { return { entities: [{ t: 'line', x1: 0, y1: -10, x2: 0, y2: 10 }, { t: 'line', x1: 20, y1: -10, x2: 20, y2: 10 }, { t: 'line', x1: -5, y1: 0, x2: 25, y2: 0 }], rels: [{ type: 'horizontal', refs: ['2'] }] }; }
      var sk = frame(), sp = SS.betweenSpans(sk, 2, [10, 0], [0, 1], false);
      assert(sp.length === 1 && Math.abs(sp[0][0][0]) < 1e-9 && Math.abs(sp[0][1][0] - 20) < 1e-9, 'inside span 0..20');
      var r = SS.trimBetween(sk, 2, [10, 0], [0, 1], false);
      assert(r.ok && r.pieces === 2, JSON.stringify(r));
      var E = sk.entities;
      assert(E[2].x1 === -5 && E[2].x2 === 0 && E[3].x1 === 20 && E[3].x2 === 25, 'outer stubs remain: ' + JSON.stringify(E));
      var R = rl(sk);
      // p9-sketchfix: the two stubs stay on one line (Collinear) and the Horizontal goes to one of them, not both
      assert((R.indexOf('horizontal:2') >= 0) !== (R.indexOf('horizontal:3') >= 0) && R.indexOf('collinear:2,3') >= 0 && R.indexOf('coincident:2.p2,0') >= 0 && R.indexOf('coincident:3.p1,1') >= 0, R.join(' '));
      assert(!SS.analyze(sk).redundant, 'nothing over-defines');
      sk = frame();
      r = SS.trimBetween(sk, 2, [-3, 0], [0, 1], true);
      assert(r.ok && sk.entities.length === 3 && sk.entities[2].x1 === 0 && sk.entities[2].x2 === 20, 'outside keeps 0..20: ' + JSON.stringify(sk.entities));
      var c = { entities: [{ t: 'line', x1: -20, y1: -3, x2: 20, y2: -3 }, { t: 'line', x1: -20, y1: 3, x2: 20, y2: 3 }, { t: 'circle', cx: 0, cy: 0, r: 10 }] };
      r = SS.trimBetween(c, 2, [10, 0], [0, 1], true);
      var arc = c.entities[2];
      assert(r.ok && arc.t === 'arc', JSON.stringify(c.entities));
      var mid = (arc.a0 + arc.a1) / 2;
      assert(Math.abs(((mid % 360) + 360) % 360) < 1e-6 || Math.abs(((mid % 360) + 360) % 360 - 360) < 1e-6, 'the right-hand arc between the lines stays: ' + JSON.stringify(arc));
      var miss = { entities: [{ t: 'line', x1: 0, y1: -10, x2: 0, y2: 10 }, { t: 'line', x1: 20, y1: 5, x2: 20, y2: 10 }, { t: 'line', x1: -5, y1: 0, x2: 25, y2: 0 }] };
      assert(!SS.trimBetween(miss, 2, [10, 0], [0, 1], false).ok, 'misses the second boundary');
    });
    test('r13/trim13: Power trim extend — a free line end slides along the line, lands on the entity in its way with a Coincident, and shortens back; an arc end sweeps round its circle', function () {
      var sk = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 20, y1: -5, x2: 20, y2: 5 }], rels: [{ type: 'horizontal', refs: ['0'] }] };
      var st = SS.extendBegin(sk, 0, 'p2');
      assert(st && st.hits.some(function (h) { return Math.abs(h[0] - 20) < 1e-9; }), 'the crossing with the vertical is a target');
      var p = SS.extendMove(sk, st, [15, 3], null);
      near(p[0], 15, 1e-9, 'follows the cursor along the line'); near(p[1], 0, 1e-9, 'stays on it');
      SS.extendMove(sk, st, [19.8, 1], [20, 0]);
      var r = SS.extendEnd(sk, st, true);
      assert(r.ok && r.at === '1' && sk.entities[0].x2 === 20, 'landed on the vertical: ' + JSON.stringify(r) + JSON.stringify(sk.entities[0]));
      assert(rl(sk).indexOf('coincident:0.p2,1') >= 0, rl(sk).join(' '));
      // back again: shorter, free (the Coincident goes when the drag begins)
      st = SS.extendBegin(sk, 0, 'p2'); SS.extendMove(sk, st, [6, 0], null); r = SS.extendEnd(sk, st, false);
      assert(r.ok && sk.entities[0].x2 === 6 && rl(sk).join(' ') === 'horizontal:0', 'shortened: ' + JSON.stringify(sk.entities[0]) + ' ' + rl(sk).join(' '));
      var a = { entities: [{ t: 'arc', cx: 0, cy: 0, r: 10, a0: 0, a1: 90 }] };
      st = SS.extendBegin(a, 0, 'p2');
      SS.extendMove(a, st, [-10, 1], null); SS.extendMove(a, st, [-10, -1], null);
      near(a.entities[0].a1, 180 + Math.atan2(1, 10) * 180 / Math.PI, 1e-6, 'swept past 180° without a jump');
      assert(SS.extendEnd(a, st, false).ok, 'settles');
      // an end joined to another end does not extend
      var j = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 10, y1: 0, x2: 10, y2: 10 }], rels: [{ type: 'coincident', refs: ['0.p2', '1.p1'] }] };
      assert(SS.extendBegin(j, 0, 'p2') === null && SS.extendBegin(j, 0, 'p1'), 'joined end refused, free end taken');
    });
  })();
  // --- end r13/trim13 ---

