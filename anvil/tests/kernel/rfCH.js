  // --- rfCH (2026-10-14, lane CH: Trim at a T-junction) --- an end of another entity lying on the trimmed entity (tied to
  // it by a Coincident, or on it within floating-point noise: 1e-9 of the sketch's size) cuts it there as a crossing
  // does, so Trim takes only the piece under the click or the trail; an end that stops short of the entity is no
  // junction and nothing cuts there (user: "it shouldn't trim if it's not a true intersection or a T-junction"). Before,
  // only the crossing test counted, within 1e-9 of the other entity's parameter, and a junction a hair off deleted the
  // whole line. Extend meets such an end too. The junctions found are tied to the kept piece (Coincident), so the
  // rounding every trim does (1e-4) cannot pull a slanted junction off its line for the next trim.
  (function () {
    if (typeof SketchSolver === 'undefined') return;
    group('rfCH: Trim / Extend at a T-junction');
    var SS = SketchSolver;
    function rl(sk) { return (sk.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }); }
    function has(sk, a, b) { var R = rl(sk); return R.indexOf('coincident:' + a + ',' + b) >= 0 || R.indexOf('coincident:' + b + ',' + a) >= 0; }
    function clean(sk, label) { var an = SS.analyze(sk); assert(!an.conflicts && !an.redundant, label + ': conflicts ' + an.conflicts + ', redundant ' + an.redundant + ' ' + rl(sk).join(' ')); }
    function line(e, x1, y1, x2, y2, tol, label) { assert(e && e.t === 'line', label + ': no line ' + JSON.stringify(e)); near(e.x1, x1, tol, label + ' x1'); near(e.y1, y1, tol, label + ' y1'); near(e.x2, x2, tol, label + ' x2'); near(e.y2, y2, tol, label + ' y2'); }
    // a vertical line 0,0 - 0,4 with two slanted lines ending on it: at (0, 1), held there by a Coincident, and at (off, 3)
    // with no relation
    function tee(off) {
      return { entities: [{ t: 'line', x1: 0, y1: 0, x2: 0, y2: 4 }, { t: 'line', x1: 2, y1: 0.5, x2: 0, y2: 1 }, { t: 'line', x1: 2, y1: 3.5, x2: off, y2: 3 }],
        rels: [{ type: 'coincident', refs: ['1.p2', '0'] }] };
    }
    test('rfCH: Trim to closest on the lower piece of a line two lines end on (one held by a Coincident, one on it exactly, 1e-12 or 1e-9 off, no relation) removes that piece only: the line runs from the lower junction to the top, the slanted line\'s end is Coincident with its new end, the untied junction is tied to the line', function () {
      [0, 1e-12, -1e-12, 1e-9].forEach(function (off) {
        var sk = tee(off), r = SS.trimAt(sk, 0, [0.01, 0.5], {});
        assert(r.ok, 'off ' + off + ': ' + r.error);
        assert(sk.entities.length === 3, 'off ' + off + ': three entities stay: ' + JSON.stringify(sk.entities));
        line(sk.entities[0], 0, 1, 0, 4, 1e-9, 'off ' + off + ' kept line');
        assert(has(sk, '0.p1', '1.p2'), 'off ' + off + ': end to end at the lower junction: ' + rl(sk).join(' '));
        assert(has(sk, '2.p2', '0'), 'off ' + off + ': the upper junction is tied to the line: ' + rl(sk).join(' '));
        near(sk.entities[2].x2, 0, 1e-9, 'off ' + off + ': the tied end is closed onto the line');
        clean(sk, 'off ' + off);
      });
    });
    test('rfCH: the middle piece between the two junctions goes alone (two collinear pieces stay, each junction end to end), and the top piece alone', function () {
      var sk = tee(1e-12), r = SS.trimAt(sk, 0, [0.01, 2], {});
      assert(r.ok && sk.entities.length === 4, 'middle: ' + JSON.stringify(r) + ' ' + sk.entities.length);
      line(sk.entities[0], 0, 0, 0, 1, 1e-9, 'lower piece'); line(sk.entities[1], 0, 3, 0, 4, 1e-9, 'upper piece');
      var R = rl(sk);
      assert(R.indexOf('collinear:0,1') >= 0 && has(sk, '0.p2', '2.p2') && has(sk, '1.p1', '3.p2'), R.join(' '));
      clean(sk, 'middle');
      sk = tee(1e-12); r = SS.trimAt(sk, 0, [0.01, 3.5], {});
      assert(r.ok && sk.entities.length === 3, 'top: ' + JSON.stringify(r));
      line(sk.entities[0], 0, 0, 0, 3, 1e-9, 'line to the upper junction');
      assert(has(sk, '0.p2', '3.p2') || has(sk, '0.p2', '2.p2'), 'end to end at the upper junction: ' + rl(sk).join(' '));
      assert(has(sk, '1.p2', '0'), 'the held junction stays on the line: ' + rl(sk).join(' '));
      clean(sk, 'top');
    });
    test('rfCH: Power trim dragged across the lower piece takes that piece only; the hover span (trimSpan) and Trim away inside between the two slanted lines stop at the junctions too', function () {
      var sk = tee(1e-12), n = SS.powerTrim(sk, [-0.5, 0.5], [0.5, 0.5], null, {});
      assert(n === 1 && sk.entities.length === 3, 'one segment went: ' + n + ' ' + JSON.stringify(sk.entities));
      line(sk.entities[0], 0, 1, 0, 4, 1e-9, 'power trim kept line');
      sk = tee(1e-12);
      var sp = SS.trimSpan(sk, 0, [0.01, 2]);
      assert(sp && !sp.whole && sp.pts.length === 2, 'span: ' + JSON.stringify(sp));
      near(sp.pts[0][1], 1, 1e-9, 'span from the lower junction'); near(sp.pts[1][1], 3, 1e-9, 'to the upper');
      sp = SS.trimSpan(sk, 0, [0.01, 0.5]);
      near(sp.pts[0][1], 0, 1e-9, 'lower span from the end'); near(sp.pts[1][1], 1, 1e-9, 'to the junction');
      var r = SS.trimBetween(sk, 0, [0.01, 2], [1, 2], false, {});
      assert(r.ok && sk.entities.length === 4, 'trim away inside between the slanted lines: ' + JSON.stringify(r));
      line(sk.entities[0], 0, 0, 0, 1, 1e-9, 'inside: lower piece'); line(sk.entities[1], 0, 3, 0, 4, 1e-9, 'inside: upper piece');
    });
    test('rfCH: an end that stops 0.001 short of the line is no junction: Trim to closest and Power trim across the line delete it whole, as before; with one true junction the trim runs from the end to that junction', function () {
      var sk = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 0, y2: 4 }, { t: 'line', x1: 2, y1: 0.5, x2: 0.001, y2: 1 }] };
      assert(SS.trimAt(sk, 0, [0.01, 0.5], {}).ok && sk.entities.length === 1 && sk.entities[0].x1 === 2, 'the whole line went: ' + JSON.stringify(sk.entities));
      sk = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 0, y2: 4 }, { t: 'line', x1: 2, y1: 0.5, x2: 0.001, y2: 1 }] };
      assert(SS.powerTrim(sk, [-0.5, 2], [0.5, 2], null, {}) === 1 && sk.entities.length === 1, 'power trim: the whole line went: ' + JSON.stringify(sk.entities));
      sk = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 0, y2: 4 }, { t: 'line', x1: 2, y1: 0.5, x2: 0.001, y2: 1 }, { t: 'line', x1: 2, y1: 3.5, x2: 0, y2: 3 }] };
      assert(SS.trimAt(sk, 0, [0.01, 0.5], {}).ok && sk.entities.length === 3, 'with a true junction above: ' + JSON.stringify(sk.entities));
      line(sk.entities[0], 0, 3, 0, 4, 1e-9, 'from the bottom up to the true junction');
      assert(!rl(sk).some(function (s) { return /^coincident:1\.p2/.test(s) || /,1\.p2$/.test(s); }), 'the short end is tied to nothing: ' + rl(sk).join(' '));
    });
    test('rfCH: an end at the line\'s own end (a corner) is no cut, a sketch point on the line neither: trimming the top of a line with a corner at its top and a crossing at its middle leaves the lower half', function () {
      var sk = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 0, y2: 4 }, { t: 'line', x1: 3, y1: 4, x2: 0, y2: 4 }, { t: 'line', x1: -1, y1: 2, x2: 1, y2: 2 }, { t: 'point', x: 0, y: 3 }],
        rels: [{ type: 'coincident', refs: ['0.p2', '1.p2'] }] };
      assert(SS.trimAt(sk, 0, [0.01, 3.5], {}).ok && sk.entities.length === 4, JSON.stringify(sk.entities));
      line(sk.entities[0], 0, 0, 0, 2, 1e-9, 'lower half');
      assert(has(sk, '0.p2', '2'), 'the new end lies on the crossing line: ' + rl(sk).join(' '));
    });
    test('rfCH: an arc two lines end on (one exactly, one 1e-12 off) loses only the piece between them; a circle two lines end on becomes the arc outside them', function () {
      var a60 = [2 * Math.cos(Math.PI / 3), 2 * Math.sin(Math.PI / 3)], a120 = [2 * Math.cos(2 * Math.PI / 3) + 1e-12, 2 * Math.sin(2 * Math.PI / 3)];
      var sk = { entities: [{ t: 'arc', cx: 0, cy: 0, r: 2, a0: 0, a1: 180 }, { t: 'line', x1: 3, y1: 3, x2: a60[0], y2: a60[1] }, { t: 'line', x1: -3, y1: 3, x2: a120[0], y2: a120[1] }] };
      var r = SS.trimAt(sk, 0, [0, 2], {});
      assert(r.ok && sk.entities.length === 4 && sk.entities[0].t === 'arc' && sk.entities[1].t === 'arc', 'two arcs: ' + JSON.stringify(sk.entities));
      near(sk.entities[0].a0, 0, 1e-3, 'first arc from 0'); near(sk.entities[0].a1, 60, 1e-3, 'to 60'); near(sk.entities[1].a0, 120, 1e-3, 'second from 120'); near(sk.entities[1].a1, 180, 1e-3, 'to 180');
      assert(has(sk, '0.p2', '2.p2') && has(sk, '1.p1', '3.p2'), 'end to end at both junctions: ' + rl(sk).join(' '));
      clean(sk, 'arc');
      sk = { entities: [{ t: 'circle', cx: 0, cy: 0, r: 2 }, { t: 'line', x1: 4, y1: 0, x2: 2, y2: 0 }, { t: 'line', x1: 0, y1: 4, x2: 1e-12, y2: 2 }] };
      r = SS.trimAt(sk, 0, [Math.SQRT2, Math.SQRT2], {});
      assert(r.ok && sk.entities.length === 3 && sk.entities[0].t === 'arc', 'circle to arc: ' + JSON.stringify(sk.entities));
      near(sk.entities[0].a0, 90, 1e-6, 'arc from 90'); near(sk.entities[0].a1, 360, 1e-6, 'round to 360');
      assert(has(sk, '0.p1', '2.p2') && has(sk, '0.p2', '1.p2'), 'end to end: ' + rl(sk).join(' '));
      // a circle one line ends on and nothing else touches has one cut: it goes whole (as a circle with one crossing does)
      sk = { entities: [{ t: 'circle', cx: 0, cy: 0, r: 2 }, { t: 'line', x1: 4, y1: 0, x2: 2, y2: 0 }] };
      assert(SS.trimAt(sk, 0, [0, 2], {}).ok && sk.entities.length === 1, 'one junction: the circle goes whole');
    });
    test('rfCH: Keep trimmed entities as construction geometry at a junction: the kept construction piece is exactly the piece between the end and the junction', function () {
      var sk = tee(1e-12), r = SS.trimAt(sk, 0, [0.01, 0.5], { keepConstruction: true });
      assert(r.ok, r.error);
      var cons = sk.entities.filter(function (e) { return e.construction; });
      assert(cons.length === 1, 'one construction piece: ' + JSON.stringify(sk.entities));
      line(cons[0], 0, 0, 0, 1, 1e-9, 'construction piece');
    });
    test('rfCH: a junction with no relation on a slanted line survives the rounding a trim does: the first trim ties it, the second trim at it takes its piece only (was: the whole line, the junction then 1e-4 off)', function () {
      var a = [0.123456, 0.234567], b = [0.3, 4.1];
      function at(t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
      var j1 = at(0.25), j2 = at(0.75);
      var sk = { entities: [{ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, { t: 'line', x1: 2, y1: 0.5, x2: j1[0], y2: j1[1] }, { t: 'line', x1: 2, y1: 3.5, x2: j2[0], y2: j2[1] }] };
      assert(SS.trimAt(sk, 0, [j1[0] - 0.02, 0.6], {}).ok && sk.entities.length === 3, 'first trim: ' + JSON.stringify(sk.entities));
      assert(has(sk, '2.p2', '0'), 'the untouched junction is tied to the line: ' + rl(sk).join(' '));
      var mid = at(0.5);
      assert(SS.trimAt(sk, 0, [mid[0] + 0.02, mid[1]], {}).ok && sk.entities.length === 3, 'second trim: ' + JSON.stringify(sk.entities));
      near(sk.entities[0].y1, j2[1], 2e-4, 'the top piece stays, from the upper junction'); near(sk.entities[0].y2, b[1], 2e-4, 'to the end');
    });
    test('rfCH: Extend meets an end lying on its carrier within noise (a T-junction) before the next crossing; an end 0.001 off the carrier is passed', function () {
      var sk = { entities: [{ t: 'line', x1: 2, y1: 2, x2: 1, y2: 2 }, { t: 'line', x1: 0, y1: 0, x2: 0, y2: 4 }, { t: 'line', x1: 0.5, y1: 2 + 1e-12, x2: 0.5, y2: -3 }] };
      var r = SS.extendEntity(sk, 0, [1, 2]);
      assert(r.ok && r.end === 'p2', JSON.stringify(r));
      near(sk.entities[0].x2, 0.5, 1e-9, 'lands at the end on its way'); near(sk.entities[0].y2, 2, 1e-9, 'on the carrier');
      assert(has(sk, '0.p2', '2.p1'), 'Coincident with that end: ' + rl(sk).join(' '));
      sk = { entities: [{ t: 'line', x1: 2, y1: 2, x2: 1, y2: 2 }, { t: 'line', x1: 0, y1: 0, x2: 0, y2: 4 }, { t: 'line', x1: 0.5, y1: 1.999, x2: 0.5, y2: -3 }] };
      r = SS.extendEntity(sk, 0, [1, 2]);
      assert(r.ok, r.error);
      near(sk.entities[0].x2, 0, 1e-9, 'past the short end, on to the vertical line');
      assert(has(sk, '0.p2', '1'), 'on that line: ' + rl(sk).join(' '));
    });
    test('rfCH: Kernel.trimCuts / entityEnds — crossings and junction ends as parameters (sorted, once each), an end at the primitive\'s own end left out, `only` and `cuts` honoured; ends of a ray, an infinite line, an arc, a rectangle, a circle, splines', function () {
      var E = tee(1e-12).entities, prim = K.entityPrimitives(E[0])[0];
      var ps = K.trimCuts(E, 0, 0, prim);
      assert(ps.length === 2, 'two cuts: ' + ps); near(ps[0], 0.25, 1e-9, 'at the lower junction'); near(ps[1], 0.75, 1e-9, 'at the upper');
      ps = K.trimCuts(E, 0, 0, prim, { only: [1] });
      assert(ps.length === 1 && Math.abs(ps[0] - 0.25) < 1e-9, 'only entity 1: ' + ps);
      ps = K.trimCuts(E, 0, 0, prim, { only: [], cuts: [[0, 2]] });
      assert(ps.length === 1 && Math.abs(ps[0] - 0.5) < 1e-9, 'an explicit cut: ' + ps);
      ps = K.trimCuts(E, 0, 0, prim, { only: [], cuts: [[0, 4], [0, 0], [0.5, 2]] });
      assert(ps.length === 0, 'cuts at the ends or off the line: none: ' + ps);
      ps = K.trimCuts(E.concat([{ t: 'line', x1: -1, y1: 1, x2: 1, y2: 1 }]), 0, 0, prim);
      assert(ps.length === 2, 'a crossing at the junction counts once: ' + ps);
      var corner = [{ t: 'line', x1: 0, y1: 0, x2: 0, y2: 4 }, { t: 'line', x1: 3, y1: 4, x2: 0, y2: 4 }];
      assert(K.trimCuts(corner, 0, 0, K.entityPrimitives(corner[0])[0]).length === 0, 'a corner is no cut');
      var ends = K.entityEnds({ t: 'line', x1: 1, y1: 2, x2: 3, y2: 4 });
      assert(ends.length === 2 && ends[0][0] === 1 && ends[1][1] === 4, 'line ends');
      assert(K.entityEnds({ t: 'line', x1: 1, y1: 2, x2: 3, y2: 4, infinite: 'p1' }).length === 1 && K.entityEnds({ t: 'line', x1: 1, y1: 2, x2: 3, y2: 4, infinite: 'p1' })[0][0] === 3, 'a ray has its start only');
      assert(K.entityEnds({ t: 'line', x1: 1, y1: 2, x2: 3, y2: 4, infinite: true }).length === 0, 'an infinite line has none');
      var ae = K.entityEnds({ t: 'arc', cx: 0, cy: 0, r: 2, a0: 0, a1: 90 });
      assert(ae.length === 2 && Math.abs(ae[0][0] - 2) < 1e-12 && Math.abs(ae[1][1] - 2) < 1e-12, 'arc ends');
      assert(K.entityEnds({ t: 'rect', x: 0, y: 0, w: 2, h: 1 }).length === 4, 'rectangle corners');
      assert(K.entityEnds({ t: 'circle', cx: 0, cy: 0, r: 1 }).length === 0 && K.entityEnds({ t: 'point', x: 0, y: 0 }).length === 0, 'a circle and a point have none');
      assert(K.entityEnds({ t: 'spline', pts: [[0, 0], [1, 1], [2, 0]] }).length === 2 && K.entityEnds({ t: 'spline', pts: [[0, 0], [1, 1], [2, 0]], closed: true }).length === 0, 'an open spline\'s two ends, a closed one none');
    });
  })();
