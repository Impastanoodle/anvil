  // --- r3/sketch3 ---
  (function () {
    group('r3/sketch3: tangent / perpendicular inference, virtual sharps, Extend');
    if (typeof SketchSolver === 'undefined') return;
    var SS = SketchSolver;
    function relList(s) { return (s.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }); }
    function lineRect(w, h) {
      return { entities: [{ t: 'line', x1: 0, y1: 0, x2: w, y2: 0 }, { t: 'line', x1: w, y1: 0, x2: w, y2: h }, { t: 'line', x1: w, y1: h, x2: 0, y2: h }, { t: 'line', x1: 0, y1: h, x2: 0, y2: 0 }],
        rels: [{ type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }, { type: 'horizontal', refs: ['2'] }, { type: 'vertical', refs: ['3'] },
          { type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'coincident', refs: ['2.p2', '3.p1'] }, { type: 'coincident', refs: ['3.p2', '0.p1'] },
          { type: 'coincident', refs: ['0.p1', 'O'] }],
        dims: [{ e: 0, k: 'len', off: -3 }, { e: 1, k: 'len', off: 3 }] };
    }
    test('inference: a line leaving an arc end along its tangent gets Tangent, a line square to a slanted line it starts from gets Perpendicular, an arc leaving a line smoothly gets Tangent; an off angle or two axis-aligned lines get neither', function () {
      var arc = { t: 'arc', cx: 0, cy: 0, r: 10, a0: 0, a1: 60 }, e60 = [10 * Math.cos(Math.PI / 3), 10 * Math.sin(Math.PI / 3)], t60 = [-Math.sin(Math.PI / 3), Math.cos(Math.PI / 3)];
      function types(s) { return SS.inferCandidates(s, s.entities.length - 1).map(function (c) { return c.type; }).sort().join(','); }
      var s1 = { entities: [arc, { t: 'line', x1: e60[0], y1: e60[1], x2: e60[0] + 8 * t60[0], y2: e60[1] + 8 * t60[1] }] };
      assert(types(s1) === 'coincident,tangent', 'tangent line: ' + types(s1));
      var s2 = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 10 }, { t: 'line', x1: 20, y1: 10, x2: 15, y2: 20 }] };
      assert(types(s2) === 'coincident,perpendicular', 'perpendicular: ' + types(s2));
      var s3 = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 10 }, { t: 'line', x1: 20, y1: 10, x2: 16, y2: 20 }] };
      assert(types(s3) === 'coincident', 'off angle: ' + types(s3));
      var s4 = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }, { t: 'line', x1: 20, y1: 0, x2: 20, y2: 10 }] };
      assert(types(s4) === 'coincident,vertical', 'axis-aligned corner: ' + types(s4));
      // an arc starting at a line's end, tangent to it (centre square above the end)
      var s5 = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }, { t: 'arc', cx: 20, cy: 5, r: 5, a0: -90, a1: 30 }] };
      assert(types(s5) === 'coincident,tangent', 'tangent arc: ' + types(s5));
      SS.infer(s2, 1);
      var an = SS.analyze(s2);
      assert(relList(s2).join(' ') === 'coincident:1.p1,0.p2 perpendicular:1,0' && !an.redundant && !an.conflicts, relList(s2).join(' '));
      SS.infer(s5, 1); an = SS.analyze(s5);
      assert(relList(s5).indexOf('tangent:1,0') >= 0 && !an.redundant && !an.conflicts, relList(s5).join(' '));
      return 'ok';
    });
    test('virtual sharp: filleting a dimensioned corner (on the origin, 50 × 30 lines, Fully Defined) keeps it Fully Defined — a construction point stays at the corner on both lines, keeps the origin Coincident, and the lengths become distances to it that still drive', function () {
      var s = lineRect(50, 30);
      assert(SS.analyze(s).status === 'full', 'starts fully defined');
      var r = SS.filletCorner(s, SS.lineCorner(s, [0, 0], 1), 5), an = SS.analyze(s);
      assert(r.ok && r.sharp >= 0, JSON.stringify(r));
      var p = s.entities[r.sharp];
      assert(p.t === 'point' && p.construction && p.sharp && Math.abs(p.x) < 1e-9 && Math.abs(p.y) < 1e-9, 'sharp ' + JSON.stringify(p));
      assert(an.status === 'full' && !an.redundant && !an.conflicts, 'after fillet ' + an.status + ' dof ' + an.dof);
      var rl = relList(s);
      assert(rl.indexOf('coincident:' + r.sharp + ',O') >= 0 && rl.indexOf('coincident:' + r.sharp + ',0') >= 0 && rl.indexOf('coincident:' + r.sharp + ',3') >= 0, rl.join(' '));
      var di = -1;
      s.rels.forEach(function (rel, i) { if (rel.type === 'distance' && rel.refs.join() === r.sharp + ',0.p2') di = i; });
      assert(di >= 0 && s.rels[di].v === 50 && s.rels[di].off === -3, 'length 50 became the distance to the sharp: ' + JSON.stringify(s.rels));
      assert(!(s.dims || []).some(function (d) { return d.e === 0 && d.k === 'len'; }), 'the length dimension is gone from the trimmed line');
      near(s.entities[0].x1, 5, 1e-9, 'line trimmed to the tangent point');
      var sv = SS.setRelValue(s, di, 60);
      assert(sv.ok, JSON.stringify(sv));
      near(s.entities[0].x2, 60, 1e-9, 'far end follows the distance'); near(s.entities[0].x1, 5, 1e-9, 'tangent point stays'); near(s.entities[r.sharp].x, 0, 1e-9, 'sharp stays on the origin');
      // a corner with nothing on it gets no sharp
      var s2 = lineRect(50, 30); s2.dims = []; s2.rels = s2.rels.slice(0, 8);
      var r2 = SS.filletCorner(s2, SS.lineCorner(s2, [50, 30], 1), 5);
      assert(r2.ok && r2.sharp === -1 && !s2.entities.some(function (e) { return e.t === 'point'; }), 'no sharp needed: ' + JSON.stringify(r2));
      return 'sharp ' + r.sharp + ', dof ' + an.dof;
    });
    test('Extend: a line grows to the first entity ahead (an end point there, a line, a circle) and gets a Coincident there; an arc grows along its circle; a joined end and nothing ahead are refused', function () {
      var s = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 30, y1: -10, x2: 30, y2: 10 }, { t: 'circle', cx: -20, cy: 0, r: 5 }, { t: 'arc', cx: 0, cy: 0, r: 20, a0: 0, a1: 60 }], rels: [{ type: 'horizontal', refs: ['0'] }] };
      var tg = SS.extendTarget(s, 0, [9, 0]);
      assert(tg && tg.end === 'p2' && Math.abs(tg.to[0] - 20) < 1e-9, 'target ' + JSON.stringify(tg));
      var r = SS.extendEntity(s, 0, [9, 0]);
      assert(r.ok && r.at === '3.p1', JSON.stringify(r));
      near(s.entities[0].x2, 20, 1e-9, 'to the arc start');
      r = SS.extendEntity(s, 0, [1, 0]);
      assert(r.ok && r.at === '2', JSON.stringify(r));
      near(s.entities[0].x1, -15, 1e-9, 'back to the circle');
      r = SS.extendEntity(s, 3, [10, 17]);
      assert(r.ok && r.at === '2', JSON.stringify(r));
      var a1 = s.entities[3].a1 * Math.PI / 180;
      near(Math.hypot(20 * Math.cos(a1) + 20, 20 * Math.sin(a1)), 5, 1e-9, 'arc end on the circle');
      r = SS.extendEntity(s, 3, [20, 0.5]);
      assert(!r.ok && /joined/.test(r.error), 'joined end: ' + JSON.stringify(r));
      var s2 = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }] };
      r = SS.extendEntity(s2, 0, [9, 0]);
      assert(!r.ok && /Nothing/.test(r.error) && s2.entities[0].x2 === 10, 'nothing ahead: ' + JSON.stringify(r));
      assert(!SS.analyze(s).conflicts, 'no conflicts');
      return relList(s).join(' ');
    });
  })();
  // --- end r3/sketch3 ---
