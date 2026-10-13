  // ------------------------------------------------------------------ rfAR: SketchXpert diagnosis, Scan Equal
  (function () {
    var S = typeof SketchSolver !== 'undefined' ? SketchSolver : null;
    if (!S || !S.diagnose) return;
    group('rfAR: SketchXpert diagnosis, Scan Equal');
    function rfARKey(sol) { return sol.remove.map(function (x) { return x.src + x.index; }).join(','); }
    test('rfAR: diagnose — a line both Horizontal and Vertical: two solutions (delete either), each leaves the sketch solvable; the sketch itself is untouched', function () {
      var sk = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }], rels: [{ type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['0'] }] };
      var before = JSON.stringify(sk), d = S.diagnose(sk);
      assert(d.over && d.status === 'over', 'over defined: ' + d.status);
      assert(JSON.stringify(sk) === before, 'untouched');
      var keys = d.solutions.map(rfARKey).sort();
      assert(keys.join('|') === 'rel0|rel1', 'solutions ' + keys.join('|'));
      assert(d.candidates.length === 2 && d.solutions.every(function (s) { return s.names.length === 1 && s.status !== 'over'; }), 'names');
      var r = S.diagnoseApply(sk, d.solutions.filter(function (s) { return rfARKey(s) === 'rel0'; })[0].remove);
      assert(r.ok && r.removed === 1 && r.analysis.status !== 'over', 'applied: ' + r.analysis.status);
      near(sk.entities[0].x2 - sk.entities[0].x1, 0, 1e-9, 'now vertical');
      return keys.join(' | ');
    });
    test('rfAR: diagnose — Equal between lines dimensioned 10 and 20: delete the Equal or either dimension (three solutions); a sketch that is not over defined has none', function () {
      var sk = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 0, y1: 5, x2: 20, y2: 5 }], dims: [{ e: 0, k: 'len', off: 1 }, { e: 1, k: 'len', off: 1 }] };
      sk.rels = [{ type: 'equal', refs: ['0', '1'] }];
      var d = S.diagnose(sk), keys = d.solutions.map(rfARKey).sort();
      assert(d.over, 'over: ' + d.status);
      assert(keys.join('|') === 'dim0|dim1|rel0', 'solutions ' + keys.join('|'));
      var r = S.diagnoseApply(sk, [{ src: 'dim', index: 1 }]);
      assert(r.ok && r.analysis.status !== 'over' && sk.dims.length === 1, 'dim removed');
      near(Math.hypot(sk.entities[1].x2 - sk.entities[1].x1, sk.entities[1].y2 - sk.entities[1].y1), 10, 1e-6, 'equal now holds at 10');
      var ok = S.diagnose({ entities: [{ t: 'line', x1: 0, y1: 0, x2: 4, y2: 0 }], rels: [{ type: 'horizontal', refs: ['0'] }] });
      assert(!ok.over && !ok.solutions.length, 'nothing to repair');
      return keys.join(' | ');
    });
    test('rfAR: diagnose — three Horizontal relations on one line: no single deletion repairs it, so pairs are tried (three solutions of two)', function () {
      var sk = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }], rels: [{ type: 'horizontal', refs: ['0'] }, { type: 'horizontal', refs: ['0'] }, { type: 'horizontal', refs: ['0'] }] };
      var d = S.diagnose(sk);
      assert(d.over, 'three Horizontals over define');
      assert(!d.solutions.some(function (s) { return s.remove.length === 1; }), 'no single deletion fixes three');
      assert(d.solutions.length === 3 && d.solutions.every(function (s) { return s.remove.length === 2; }), 'pairs: ' + d.solutions.map(rfARKey).join('|'));
      return d.solutions.map(rfARKey).join(' | ');
    });
    test('rfAR: scanEqual — lines 3, 3.004 and 5, circles / arcs R1, R1 and R2: groups at a 0.01 tolerance; applyEqual ties them, a second pass adds nothing', function () {
      var sk = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 3, y2: 0 }, { t: 'line', x1: 0, y1: 2, x2: 3.004, y2: 2 }, { t: 'line', x1: 0, y1: 4, x2: 5, y2: 4 },
        { t: 'circle', cx: 10, cy: 0, r: 1 }, { t: 'arc', cx: 14, cy: 0, r: 1, a0: 0, a1: 90 }, { t: 'circle', cx: 20, cy: 0, r: 2 }] };
      var g = S.scanEqual(sk, { tol: 0.01 }).groups;
      assert(g.length === 2, 'groups ' + JSON.stringify(g));
      assert(g[0].kind === 'line' && g[0].members.join() === '0,1' && g[1].kind === 'radius' && g[1].members.join() === '3,4', JSON.stringify(g));
      assert(S.scanEqual(sk).groups.length === 1, 'exact: only the radii');
      var r = S.applyEqual(sk, g[0].members);
      assert(r.added.length === 1 && sk.rels[0].type === 'equal', 'equal added');
      near(Math.hypot(sk.entities[1].x2 - sk.entities[1].x1, sk.entities[1].y2 - sk.entities[1].y1), Math.hypot(sk.entities[0].x2 - sk.entities[0].x1, sk.entities[0].y2 - sk.entities[0].y1), 1e-7, 'equal now');
      var r2 = S.applyEqual(sk, g[0].members);
      assert(r2.added.length === 0 && r2.skipped === 1, 'second pass skipped');
      return 'ok';
    });
  })();
  // --- end rfAR ---
