  // --- rfCK (2026-10-14, lane CK: Trim cuts at true crossings only, three fixes) --- (1) a slot's / arc slot's 'p1' / 'p2'
  // are its cap-arc centres, not outline points: Trim no longer cuts a line at a slot centre (a Coincident held there,
  // or the centre lying on the line) and ties no piece end to it; (2) Trim away inside / outside accepts a bound through
  // the entity's own end (an L corner; Kernel.trimCuts opts.ends); (3) a junction found by both the crossing test and the
  // end-foot test (an end overshooting the entity by less than the tolerance it was accepted with) counts once, so a
  // circle with one such junction is deleted instead of leaving a sliver or a 360-degree arc.
  (function () {
    if (typeof SketchSolver === 'undefined') return;
    group('rfCK: Trim at slot centres, bounds through an end, one junction found twice');
    var SS = SketchSolver;
    function rl(sk) { return (sk.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }); }
    function line(e, x1, y1, x2, y2, tol, label) { assert(e && e.t === 'line', label + ': no line ' + JSON.stringify(e)); near(e.x1, x1, tol, label + ' x1'); near(e.y1, y1, tol, label + ' y1'); near(e.x2, x2, tol, label + ' x2'); near(e.y2, y2, tol, label + ' y2'); }
    // no Coincident joins any point of entity e (the slot) to anything
    function untied(sk, e, label) { assert(!rl(sk).some(function (s) { return /^coincident:/.test(s) && new RegExp('(:|,)' + e + '\\.p[12](,|$)').test(s); }), label + ': a slot centre is tied: ' + rl(sk).join(' ')); }
    test('rfCK: a slot centre is no T-junction: Trim to closest on a line through the right cap centre, held there by a Coincident, cuts at the cap arc (y = ±5), not at the centre (y = 0), and ties no piece end to the centre; the same for an arc slot', function () {
      var sk = { entities: [{ t: 'line', x1: 10, y1: -20, x2: 10, y2: 20 }, { t: 'slot', x1: -10, y1: 0, x2: 10, y2: 0, w: 10 }], rels: [{ type: 'coincident', refs: ['1.p2', '0'] }] };
      var r = SS.trimAt(sk, 0, [10, 2], {});
      assert(r.ok && sk.entities.length === 3 && sk.entities[2].t === 'slot', 'two pieces and the slot: ' + JSON.stringify(sk.entities));
      line(sk.entities[0], 10, -20, 10, -5, 1e-9, 'lower piece'); line(sk.entities[1], 10, 5, 10, 20, 1e-9, 'upper piece');
      untied(sk, 2, 'slot');
      // an arc slot: its 'p1' / 'p2' are the centres of its end arcs (on its centreline arc), held on a vertical line
      // through the one at 45 degrees; the line meets the outline at the inner arc (r = 8) below and the end cap above
      var a = Math.PI / 4, c = [10 * Math.cos(a), 10 * Math.sin(a)];
      sk = { entities: [{ t: 'line', x1: c[0], y1: c[1] - 20, x2: c[0], y2: c[1] + 20 }, { t: 'aslot', cx: 0, cy: 0, r: 10, a0: 0, a1: 45, w: 4 }], rels: [{ type: 'coincident', refs: ['1.p2', '0'] }] };
      r = SS.trimAt(sk, 0, [c[0], c[1] + 0.5], {});
      assert(r.ok && sk.entities.length === 3 && sk.entities[2].t === 'aslot', 'arc slot: two pieces: ' + JSON.stringify(sk.entities));
      near(sk.entities[0].y2, Math.sqrt(64 - c[0] * c[0]), 1e-3, 'arc slot: the lower piece ends on the inner arc, not at the centre'); near(sk.entities[1].y1, c[1] + 2, 1e-3, 'the upper piece starts on the end cap, 2 above the centre');
      untied(sk, 2, 'arc slot');
    });
    test('rfCK: a slot centre lying on a line, with no relation, is not tied to it by a trim elsewhere on the line (was: a new Coincident pinned the slot centre to the line)', function () {
      var sk = { entities: [{ t: 'line', x1: 10, y1: -20, x2: 10, y2: 20 }, { t: 'slot', x1: -10, y1: 0, x2: 10, y2: 0, w: 10 }, { t: 'line', x1: 0, y1: 15, x2: 20, y2: 15 }] };
      var r = SS.trimAt(sk, 0, [10, 17], {});
      assert(r.ok && sk.entities.length === 3, JSON.stringify(sk.entities));
      line(sk.entities[0], 10, -20, 10, 15, 1e-9, 'the line stops at the crossing');
      untied(sk, 1, 'slot');
      assert(rl(sk).some(function (s) { return s === 'coincident:0.p2,2' || s === 'coincident:2,0.p2'; }), 'the new end lies on the crossing line: ' + rl(sk).join(' '));
    });
    test('rfCK: Trim away inside / outside accepts a bound through the entity\'s own end: a line with a bound at its start and one at its middle loses its first half (inside) or keeps it (outside); an arc 0..90 with bounds y = 0 and the 45-degree line too', function () {
      var ents = [{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }, { t: 'line', x1: 0, y1: -5, x2: 0, y2: 5 }, { t: 'line', x1: 10, y1: -5, x2: 10, y2: 5 }];
      var pl = SS.betweenPlan({ entities: ents }, 0, [5, 0], [1, 2], false);
      assert(!pl.error && pl.keep.length === 1 && pl.remove.length === 1, 'inside plan: ' + JSON.stringify(pl));
      near(pl.keep[0][0], 0.5, 1e-9, 'keep from the middle'); near(pl.keep[0][1], 1, 1e-9, 'to the end'); near(pl.remove[0][0], 0, 1e-9, 'remove from the start'); near(pl.remove[0][1], 0.5, 1e-9, 'to the middle');
      pl = SS.betweenPlan({ entities: ents }, 0, [5, 0], [1, 2], true);
      assert(!pl.error && pl.keep.length === 1 && pl.remove.length === 1 && Math.abs(pl.keep[0][1] - 0.5) < 1e-9, 'outside plan: ' + JSON.stringify(pl));
      var sk = { entities: JSON.parse(JSON.stringify(ents)) }, r = SS.trimBetween(sk, 0, [5, 0], [1, 2], false, {});
      assert(r.ok && sk.entities.length === 3, 'trimBetween: ' + JSON.stringify(r) + ' ' + JSON.stringify(sk.entities));
      line(sk.entities[0], 10, 0, 20, 0, 1e-9, 'the second half stays');
      var arc = { entities: [{ t: 'arc', cx: 0, cy: 0, r: 10, a0: 0, a1: 90 }, { t: 'line', x1: -20, y1: 0, x2: 20, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 20, y2: 20 }] };
      pl = SS.betweenPlan(arc, 0, [10 * Math.cos(0.3), 10 * Math.sin(0.3)], [1, 2], false);
      assert(!pl.error && pl.keep.length === 1 && pl.remove.length === 1, 'arc plan: ' + JSON.stringify(pl));
      near(pl.keep[0][0], Math.PI / 4, 1e-9, 'arc: keep from 45'); near(pl.keep[0][1], Math.PI / 2, 1e-9, 'to 90'); near(pl.remove[0][0], 0, 1e-9, 'remove from 0'); near(pl.remove[0][1], Math.PI / 4, 1e-9, 'to 45');
      // Trim to closest still makes no zero-length piece there: the bound through the start is no cut for it
      var ps = Kernel.trimCuts(ents, 0, 0, Kernel.entityPrimitives(ents[0])[0], { only: [1] });
      assert(ps.length === 0, 'a crossing at the entity\'s end is dropped without opts.ends: ' + ps);
      ps = Kernel.trimCuts(ents, 0, 0, Kernel.entityPrimitives(ents[0])[0], { only: [1], ends: true });
      assert(ps.length === 1 && Math.abs(ps[0]) < 1e-9, 'and kept with it: ' + ps);
    });
    test('rfCK: one junction found by the crossing test and the end-foot test counts once: a line ending 1.5e-8 inside a circle (within tol 2e-8) gives one cut and Trim deletes the circle; a line end held on the circle by a Coincident but 3e-5 inside it (unsolved) deletes the circle too (was: a sliver / a 360-degree arc)', function () {
      var a = Math.PI / 6, px = 10 * Math.cos(a), py = 10 * Math.sin(a), dx = px - 25, dy = py, L = Math.hypot(dx, dy);
      function lineTo(over) { return { t: 'line', x1: 25, y1: 0, x2: px + dx / L * over, y2: py + dy / L * over }; }
      var ents = [{ t: 'circle', cx: 0, cy: 0, r: 10 }, lineTo(1.5e-8)], prim = Kernel.entityPrimitives(ents[0])[0];
      var ps = Kernel.trimCuts(ents, 0, 0, prim, { tol: 2e-8 });
      assert(ps.length === 1, 'one cut: ' + JSON.stringify(ps)); near(ps[0], a, 1e-8, 'at the crossing');
      var out = Kernel.trimEntity(ents, 0, [-10, 0], { tol: 2e-8 });
      assert(out.length === 1 && out[0].t === 'line', 'the circle is deleted: ' + JSON.stringify(out));
      var sk = { entities: [{ t: 'circle', cx: 0, cy: 0, r: 10 }, lineTo(3e-5)], rels: [{ type: 'coincident', refs: ['1.p2', '0'] }] };
      var r = SS.trimAt(sk, 0, [-10, 0], {});
      assert(r.ok && sk.entities.length === 1 && sk.entities[0].t === 'line', 'held junction: the circle is deleted: ' + JSON.stringify(sk.entities) + ' ' + rl(sk).join(' '));
      // two true junctions stay two cuts: a second line ending on the circle at 120 degrees makes an arc between them
      sk = { entities: [{ t: 'circle', cx: 0, cy: 0, r: 10 }, lineTo(3e-5), { t: 'line', x1: 0, y1: 25, x2: 10 * Math.cos(2 * Math.PI / 3), y2: 10 * Math.sin(2 * Math.PI / 3) }], rels: [{ type: 'coincident', refs: ['1.p2', '0'] }] };
      r = SS.trimAt(sk, 0, [10 * Math.cos(Math.PI / 2.4), 10 * Math.sin(Math.PI / 2.4)], {});
      assert(r.ok && sk.entities.length === 3 && sk.entities[0].t === 'arc', 'two junctions: an arc: ' + JSON.stringify(sk.entities));
      near(sk.entities[0].a0, 120, 1e-3, 'from the second junction'); near(sk.entities[0].a1, 390, 1e-3, 'round to the first');
    });
  })();
