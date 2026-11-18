  // --- rfPA (2026-11-17, lane dragfeel) --- a drag keeps the part of the sketch it moves for the drag's later frames
  // (SketchSolver.drag: the whole sketch's system was built on every frame only to find that part), and a system of
  // part of a sketch reads the other entities without copying them. Self-contained.
  (function () {
    group('rfPA: a drag frame solves only the part it moves, worked out once per drag');
    var S = SketchSolver;
    // a fully defined 10 x 6 plate, a line chain (4, 5) tied by a Coincident, and n free holes
    function rfPAsk(n) {
      var e = [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 10, y1: 0, x2: 10, y2: 6 }, { t: 'line', x1: 10, y1: 6, x2: 0, y2: 6 }, { t: 'line', x1: 0, y1: 6, x2: 0, y2: 0 },
        { t: 'line', x1: 2, y1: 8, x2: 5, y2: 9 }, { t: 'line', x1: 5, y1: 9, x2: 8, y2: 8 }];
      for (var i = 0; i < n; i++) e.push({ t: 'circle', cx: 1 + (i % 9), cy: 1 + Math.floor(i / 9) * 0.5, r: 0.15 });
      var rels = [['coincident', ['0.p2', '1.p1']], ['coincident', ['1.p2', '2.p1']], ['coincident', ['2.p2', '3.p1']], ['coincident', ['3.p2', '0.p1']], ['coincident', ['0.p1', 'O']],
        ['horizontal', ['0']], ['vertical', ['1']], ['horizontal', ['2']], ['vertical', ['3']], ['coincident', ['4.p2', '5.p1']]].map(function (r) { return { type: r[0], refs: r[1] }; });
      return { entities: e, rels: rels, dims: [{ e: 0, k: 'len', v: 10 }, { e: 1, k: 'len', v: 6 }, { e: 6, k: 'dia', v: 0.3 }] };
    }
    function rfPAcopy(o) { return JSON.parse(JSON.stringify(o)); }

    test('rfPA: twelve frames of a drag with the part kept give what twelve frames worked out in full give (to 1e-12), the kept part is used from the second frame on, and the entities outside the part are the same objects with the same values', function () {
      var A = rfPAsk(40), B = rfPAsk(40), startA = rfPAcopy(A.entities), k0 = S.stats.dragPartKept, outside = A.entities.slice(), before = JSON.stringify(A.entities.slice(7));
      var k;
      for (k = 1; k <= 12; k++) assert(S.drag(A, '4.p1', [2 + 0.13 * k, 14 - 0.07 * k], startA, {}).ok, 'frame ' + k + ' (kept)');
      assert(S.stats.dragPartKept - k0 === 11, (S.stats.dragPartKept - k0) + ' frames used the kept part');
      for (k = 1; k <= 12; k++) assert(S.drag(B, '4.p1', [2 + 0.13 * k, 14 - 0.07 * k], rfPAcopy(startA), {}).ok, 'frame ' + k + ' (in full)');   // a new start every frame: nothing kept
      var worst = 0;
      A.entities.forEach(function (e, i) { Object.keys(e).forEach(function (n) { if (typeof e[n] === 'number') worst = Math.max(worst, Math.abs(e[n] - B.entities[i][n])); }); });
      assert(worst <= 1e-12, 'kept and full differ by ' + worst);
      near(A.entities[4].x1, 2 + 0.13 * 12, 1e-9, 'the dragged end is at the cursor (x)');
      assert(A.entities[5].x1 === A.entities[4].x2 && A.entities[5].y1 === A.entities[4].y2, 'the chain stays joined');
      assert(outside.every(function (e, i) { return A.entities[i] === e; }), 'the entities are the sketch\'s own objects');
      assert(JSON.stringify(A.entities.slice(7)) === before, 'the holes outside the part did not move');
      return '12 frames, equal to ' + worst;
    });

    test('rfPA: the kept part is dropped by another drag (a new start), another dragged entity or other relations, and a radius drag of a hole keeps its own part', function () {
      var A = rfPAsk(10), st1 = rfPAcopy(A.entities), k0 = S.stats.dragPartKept;
      assert(S.drag(A, '4.p1', [3, 15], st1, {}).ok && S.drag(A, '4.p1', [3.1, 15], st1, {}).ok, 'line drag');
      assert(S.stats.dragPartKept - k0 === 1, 'the second frame kept the part: ' + (S.stats.dragPartKept - k0));
      var k1 = S.stats.dragPartKept;
      assert(S.drag(A, '7.c', [2.2, 1.1], st1, {}).ok, 'a hole with the same start');
      assert(S.stats.dragPartKept === k1, 'another dragged entity works its part out again');
      A.rels = A.rels.concat([{ type: 'coincident', refs: ['7.c', '4.p1'] }]);
      assert(S.drag(A, '4.p1', [3.2, 15], st1, {}).ok, 'line drag after a new relation');
      assert(S.stats.dragPartKept === k1, 'new relations: the part is worked out again');
      near(A.entities[7].cx, A.entities[4].x1, 1e-9, 'the hole follows the end it is now tied to');
      var st2 = rfPAcopy(A.entities), k2 = S.stats.dragPartKept;
      for (var k = 1; k <= 4; k++) assert(S.drag(A, '8', [A.entities[8].cx + 0.2 + 0.01 * k, A.entities[8].cy], st2, { radius: true }).ok, 'radius frame ' + k);
      assert(S.stats.dragPartKept - k2 === 3, 'radius drag kept its part: ' + (S.stats.dragPartKept - k2));
      near(A.entities[8].r, 0.24, 1e-9, 'the radius follows');
      return 'ok';
    });
  })();
