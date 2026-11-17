  // --- rfNP (local-2026-11-16b, lane sketchbig) --- big sketches stay quick (test-reports/2026-11-16-big-sketches.md):
  // the sparse Jacobian / rank reduction / LDL^T solve and the condensed pattern copies give the sketch the reference
  // (dense, nothing condensed: SketchSolver.setDense(true)) gives, after every kind of edit, on (A) a hole pattern,
  // (B) a customer DXF of 2,600 entities with its Coincidents and (C) 150 dimensioned rectangles
  (function () {
    if (typeof Kernel === 'undefined' || typeof SketchSolver === 'undefined') return;
    var S = SketchSolver;
    group('rfNP: big sketches: sparse and condensed solves equal the full dense ones');
    function rfNPSk(E, R, D) { return { id: 1, type: 'sketch', name: 'Sketch1', plane: { ref: 'Front', offset: 0 }, entities: E, rels: R || [], dims: D || [] }; }
    function rfNPCopy(f) { return JSON.parse(JSON.stringify(f)); }
    // (A) a plate's hole: Linear Sketch Pattern nx x ny with both spacings dimensioned
    function rfNPPlate(nx, ny) {
      var f = rfNPSk([{ t: 'circle', cx: 1, cy: 1, r: 0.125 }], [{ type: 'fix', refs: ['0.c'] }], [{ e: 0, k: 'dia' }]);
      var r = S.linearPattern(f, [0], { angle1: 0, spacing1: 1.1, count1: nx, angle2: 90, spacing2: 2.3, count2: ny, dimX: true, dimY: true });
      assert(r.ok, r.error);
      return f;
    }
    // (C) n rectangles of 4 lines, Coincident / Horizontal / Vertical, width and height, each placed from its neighbour
    function rfNPRects(n) {
      var E = [], R = [], D = [];
      for (var q = 0; q < n; q++) {
        var x = (q % 15) * 3, y = Math.floor(q / 15) * 2, w = 2, h = 1.2, b = E.length, k;
        E.push({ t: 'line', x1: x, y1: y, x2: x + w, y2: y }, { t: 'line', x1: x + w, y1: y, x2: x + w, y2: y + h }, { t: 'line', x1: x + w, y1: y + h, x2: x, y2: y + h }, { t: 'line', x1: x, y1: y + h, x2: x, y2: y });
        for (k = 0; k < 4; k++) R.push({ type: 'coincident', refs: [(b + k) + '.p2', (b + (k + 1) % 4) + '.p1'] });
        R.push({ type: 'horizontal', refs: [String(b)] }, { type: 'horizontal', refs: [String(b + 2)] }, { type: 'vertical', refs: [String(b + 1)] }, { type: 'vertical', refs: [String(b + 3)] });
        D.push({ e: b, k: 'len' }, { e: b + 1, k: 'len' });
        if (!q) R.push({ type: 'coincident', refs: ['O', b + '.p1'] });
        else if (q % 15) R.push({ type: 'distance', refs: [(b - 4) + '.p1', b + '.p1'], v: 3, dir: 'h' }, { type: 'distance', refs: [(b - 4) + '.p1', b + '.p1'], v: 0, dir: 'v' });
        else R.push({ type: 'distance', refs: [(b - 60) + '.p1', b + '.p1'], v: 2, dir: 'v' }, { type: 'distance', refs: [(b - 60) + '.p1', b + '.p1'], v: 0, dir: 'h' });
      }
      return rfNPSk(E, R, D);
    }
    // (B) a customer DXF: a 60 x 30 outline of 296 lines and 4 corner arcs, 1,500 holes, 200 slots as 2 lines + 2 arcs;
    // read by DxfImport as Insert DXF does, a Coincident at every joint
    function rfNPDxfText() {
      var out = ['0', 'SECTION', '2', 'ENTITIES'], W = 60, H = 30, n = 74, rr = 1, i;
      function line(a, b) { out.push('0', 'LINE', '8', '0', '10', a[0], '20', a[1], '30', 0, '11', b[0], '21', b[1], '31', 0); }
      function arc(c, r, a0, a1) { out.push('0', 'ARC', '8', '0', '10', c[0], '20', c[1], '30', 0, '40', r, '50', a0, '51', a1); }
      function side(p, q) { for (var k = 0; k < n; k++) line([p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n], [p[0] + (q[0] - p[0]) * (k + 1) / n, p[1] + (q[1] - p[1]) * (k + 1) / n]); }
      side([rr, 0], [W - rr, 0]); arc([W - rr, rr], rr, 270, 360);
      side([W, rr], [W, H - rr]); arc([W - rr, H - rr], rr, 0, 90);
      side([W - rr, H], [rr, H]); arc([rr, H - rr], rr, 90, 180);
      side([0, H - rr], [0, rr]); arc([rr, rr], rr, 180, 270);
      for (i = 0; i < 1500; i++) out.push('0', 'CIRCLE', '8', '0', '10', 3 + (i % 50) * 1.08, '20', 3 + Math.floor(i / 50) * 0.6, '30', 0, '40', 0.1);
      for (i = 0; i < 200; i++) { var x = 3 + (i % 40) * 1.35, y = 22 + Math.floor(i / 40) * 1.2, L = 0.6, r = 0.15; line([x, y - r], [x + L, y - r]); arc([x + L, y], r, 270, 90); line([x + L, y + r], [x, y + r]); arc([x, y], r, 90, 270); }
      out.push('0', 'ENDSEC', '0', 'EOF');
      return out.join('\n');
    }
    function rfNPDxf() {
      var p = DxfImport.parse(rfNPDxfText()), b = DxfImport.prepare(p, { partUnits: 'in', units: 'in', layers: {}, origin: 'file', tol: 0, repair: false });
      var f = rfNPSk(b.entities, [], []);
      DxfImport.endJoints(f.entities).forEach(function (j) { for (var k = 1; k < j.length; k++) f.rels.push({ type: 'coincident', refs: [j[0], j[k]] }); });
      return f;
    }
    // edit(f) on f the quick way and on a copy as the reference; the same coordinates (1e-9), DOF and every status
    function rfNPBoth(f, what, edit) {
      var g = rfNPCopy(f), ra, rb;
      ra = edit(f);
      S.setDense(true);
      try { rb = edit(g); } finally { S.setDense(false); }
      assert(!!(ra && ra.ok !== false) === !!(rb && rb.ok !== false), what + ': both ways succeed or fail alike (' + JSON.stringify(ra) + ' / ' + JSON.stringify(rb) + ')');
      assert(f.entities.length === g.entities.length, what + ': the same entity count');
      var worst = 0, at = '';
      f.entities.forEach(function (e, i) {
        Object.keys(e).forEach(function (k) { if (typeof e[k] === 'number') { var d = Math.abs(e[k] - g.entities[i][k]); if (!(d <= worst)) { worst = d; at = i + '.' + k; } } });
      });
      assert(worst < 1e-9, what + ': coordinates differ by ' + worst + ' at ' + at);
      var a = S.analyze(f), b;
      S.setDense(true);
      try { b = S.analyze(g); } finally { S.setDense(false); }
      assert(a.dof === b.dof && a.status === b.status, what + ': DOF ' + a.dof + ' / ' + b.dof + ', ' + a.status + ' / ' + b.status);
      assert(JSON.stringify(a.entities) === JSON.stringify(b.entities), what + ': every entity\'s Under / Fully / Over Defined');
      assert(JSON.stringify(a.rels) === JSON.stringify(b.rels) && JSON.stringify(a.dims) === JSON.stringify(b.dims), what + ': every relation\'s and dimension\'s state');
      return a;
    }
    // delete entity i as the UI does: its relations (a pattern copy: its instance), the entity, its dimensions
    function rfNPDel(s, i) { S.removeEntity(s, i); s.entities.splice(i, 1); s.dims = (s.dims || []).filter(function (d) { return d.e !== i; }); s.dims.forEach(function (d) { if (d.e > i) d.e--; }); }
    function rfNPRel(f, type, v) { return f.rels.map(function (x, i) { return x.type === type && (v == null || Math.abs(x.v - v) < 1e-9) ? i : -1; }).filter(function (i) { return i >= 0; })[0]; }

    test('rfNP (A): a 12 x 12 hole pattern: spacing edit, seed drag, a dimension on a copy, a relation, a deleted copy, a diameter: the same holes and statuses as the full dense solve', function () {
      var f = rfNPPlate(12, 12);
      var a = rfNPBoth(f, 'nothing changed', function (s) { return S.solve(s); });
      assert(a.status === 'full', 'the pattern is Fully Defined: ' + a.status);
      rfNPBoth(f, 'spacing 1.1 -> 1.25', function (s) { return S.setRelValue(s, rfNPRel(s, 'distance', 1.1), 1.25); });
      rfNPBoth(f, 'seed diameter', function (s) { return S.setDim(s, 0, 0.3125); });
      S.deleteRelation(f, rfNPRel(f, 'fix'));
      rfNPBoth(f, 'the seed dragged (its Fix deleted)', function (s) { var c0 = rfNPCopy(s.entities); return S.drag(s, '0.c', [1.4, 1.3], c0); });
      rfNPBoth(f, 'spacing 2.3 -> 2.1 with the seed free', function (s) { return S.setRelValue(s, rfNPRel(s, 'distance', 2.3), 2.1); });
      var last = f.entities.length - 1;
      rfNPBoth(f, 'a driven diameter on the last copy', function (s) { s.dims.push({ e: last, k: 'dia', driven: true }); return S.solve(s); });
      rfNPBoth(f, 'a Horizontal between the seed centre and the origin', function (s) { return S.addRelation(s, 'horizontal', ['0.c', 'O']); });
      rfNPBoth(f, 'a copy deleted', function (s) { rfNPDel(s, 40); return S.solve(s); });
    });

    test('rfNP (A): 400 and 1,600 holes: the sparse analysis equals the dense one at 400 (DOF 0, every hole Fully Defined) and runs at 1,600 with 4,800 unknowns', function () {
      var f = rfNPPlate(20, 20), a = S.analyze(f), b;
      S.setDense(true);
      try { b = S.analyze(f); } finally { S.setDense(false); }
      assert(a.dof === 0 && b.dof === 0 && a.status === 'full', 'Fully Defined: ' + a.dof + ' / ' + b.dof);
      assert(JSON.stringify(a.entities) === JSON.stringify(b.entities), 'every hole the same state');
      var g = rfNPPlate(40, 40);
      S.resetStats();
      var c = S.analyze(g);
      assert(c.unknowns === 4800 && c.dof === 0 && c.entities.every(function (s) { return s === 'full'; }), '1,600 holes Fully Defined: ' + c.unknowns + ' unknowns, DOF ' + c.dof);
      assert(S.stats.analyses + S.stats.analysisHits === 1 && S.stats.jacobians === S.stats.analyses, 'one analysis (or the one Linear Sketch Pattern made, kept): ' + JSON.stringify(S.stats));
      g.dims[0].v = 0.25; delete g.dims[0].v;
      S.resetStats(); S.analyze(g); S.analyze(g);
      assert(S.stats.analyses === 0 && S.stats.analysisHits === 2, 'the same content analysed again: kept (' + JSON.stringify(S.stats) + ')');
      var g2 = rfNPCopy(g); g2.entities[5].cx += 0.01; S.resetStats(); S.analyze(g2);
      assert(S.stats.analyses === 1, 'a moved hole: analysed again');
    });

    test('rfNP (B): a customer DXF (2,600 entities, 1,100 Coincidents): an outline line dragged, a Horizontal, a diameter added and changed, entities deleted: the same as the full dense solve', function () {
      var f = rfNPDxf();
      assert(f.entities.length === 2600 && f.rels.length === 1100, 'entities ' + f.entities.length + ', relations ' + f.rels.length);
      var a = rfNPBoth(f, 'imported', function (s) { return S.solve(s); });
      assert(a.status === 'under' && a.dof > 7000, 'Under Defined: ' + a.status + ' ' + a.dof);
      rfNPBoth(f, 'an outline line dragged', function (s) { var c0 = rfNPCopy(s.entities); return S.drag(s, '10', [s.entities[10].x1 + 0.05, s.entities[10].y1 + 0.2], c0); });
      rfNPBoth(f, 'a Horizontal on an outline line', function (s) { return S.addRelation(s, 'horizontal', ['20']); });
      var hole = 400;
      assert(f.entities[hole].t === 'circle', 'a hole at ' + hole + ': ' + f.entities[hole].t);
      rfNPBoth(f, 'a diameter on a hole, changed', function (s) { s.dims.push({ e: hole, k: 'dia' }); var r = S.setDim(s, s.dims.length - 1, 0.25); return r; });
      rfNPBoth(f, '50 holes deleted', function (s) { for (var k = 0; k < 50; k++) rfNPDel(s, 500); return S.solve(s); });
    });

    test('rfNP (C): 150 dimensioned rectangles (2,400 unknowns, Fully Defined): a placing distance and a width edited, a corner dragged, a Parallel added (Over Defined), a rectangle deleted: the same as the full dense solve', function () {
      var f = rfNPRects(150);
      var a = rfNPBoth(f, 'as built', function (s) { return S.solve(s); });
      assert(a.status === 'full' && a.unknowns === 2400, 'Fully Defined: ' + a.status + ', ' + a.unknowns);
      rfNPBoth(f, 'a placing distance 3 -> 3.25', function (s) { return S.setRelValue(s, rfNPRel(s, 'distance', 3), 3.25); });
      rfNPBoth(f, 'a width 2 -> 2.5', function (s) { return S.setDim(s, 40, 2.5); });
      rfNPBoth(f, 'a corner dragged (all dimensions held: nothing moves)', function (s) { var c0 = rfNPCopy(s.entities); return S.drag(s, '300.p1', [s.entities[300].x1 + 0.3, s.entities[300].y1], c0); });
      var o = rfNPBoth(f, 'a Parallel between two horizontal sides', function (s) { s.rels.push({ type: 'parallel', refs: ['0', '2'] }); return S.solve(s); });
      assert(o.status === 'over', 'the Parallel repeats the Horizontals: ' + o.status);
      rfNPBoth(f, 'a dimension deleted (Under Defined), a corner dragged', function (s) { s.rels.pop(); s.dims.splice(41, 1); var c0 = rfNPCopy(s.entities); return S.drag(s, '81.p1', [s.entities[81].x1, s.entities[81].y1 + 0.4], c0); });
      rfNPBoth(f, 'a rectangle deleted', function (s) { for (var k = 0; k < 4; k++) rfNPDel(s, 596); return S.solve(s); });
    });
  })();
