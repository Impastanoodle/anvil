  // --- rfNU (local-2026-11-16b, lane sketchfull) --- Fully Define Sketch on big sketches takes the sparse path (the
  // sketch's rows reduced as spBasis, as analyze does above SPARSE_MIN), with the relations, dimensions and geometry the
  // dense reduction (SketchSolver.setDense(true)) gives; report test-reports/2026-11-16-sketch-clicks.md
  (function () {
    if (typeof Kernel === 'undefined' || typeof SketchSolver === 'undefined') return;
    var S = SketchSolver;
    group('rfNU: Fully Define Sketch on the sparse path: the same result as the dense one');
    function rfNUSk(E, R, D) { return { id: 1, type: 'sketch', name: 'Sketch1', plane: { ref: 'Front', offset: 0 }, entities: E, rels: R || [], dims: D || [] }; }
    function rfNUCopy(f) { return JSON.parse(JSON.stringify(f)); }
    // n rectangles of 4 lines joined by Coincidents only (each 4 x 2 unknowns, 2 DOF short of Fully Defined... and more)
    function rfNURects(n, tilt) {
      var E = [], R = [];
      for (var q = 0; q < n; q++) {
        var x = (q % 10) * 3, y = Math.floor(q / 10) * 2, w = 2, h = 1.2, b = E.length, d = tilt ? 0.004 * (q % 3) : 0;
        E.push({ t: 'line', x1: x, y1: y, x2: x + w, y2: y + d }, { t: 'line', x1: x + w, y1: y + d, x2: x + w, y2: y + h }, { t: 'line', x1: x + w, y1: y + h, x2: x, y2: y + h }, { t: 'line', x1: x, y1: y + h, x2: x, y2: y });
        for (var k = 0; k < 4; k++) R.push({ type: 'coincident', refs: [(b + k) + '.p2', (b + (k + 1) % 4) + '.p1'] });
      }
      return rfNUSk(E, R, []);
    }
    // a flat: an outline of lines with Coincidents, holes and slots as lines + arcs (a small Insert DXF)
    function rfNUFlat() {
      var E = [], R = [], i, pts = [[0, 0], [4, 0], [8, 0], [8, 3], [8, 6], [4, 6], [0, 6], [0, 3]];
      for (i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; E.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }); }
      for (i = 0; i < pts.length; i++) R.push({ type: 'coincident', refs: [i + '.p2', ((i + 1) % pts.length) + '.p1'] });
      for (i = 0; i < 40; i++) E.push({ t: 'circle', cx: 0.6 + (i % 10) * 0.75, cy: 0.6 + Math.floor(i / 10) * 0.5, r: i % 3 ? 0.1 : 0.125 });
      for (i = 0; i < 6; i++) {
        var x = 0.8 + i * 1.2, y = 4.5, L = 0.6, r = 0.15, s = E.length;
        E.push({ t: 'line', x1: x, y1: y - r, x2: x + L, y2: y - r }, { t: 'arc', cx: x + L, cy: y, r: r, a0: 270, a1: 90 }, { t: 'line', x1: x + L, y1: y + r, x2: x, y2: y + r }, { t: 'arc', cx: x, cy: y, r: r, a0: 90, a1: 270 });
        R.push({ type: 'coincident', refs: [s + '.p2', (s + 1) + '.p1'] }, { type: 'coincident', refs: [(s + 1) + '.p2', (s + 2) + '.p1'] }, { type: 'coincident', refs: [(s + 2) + '.p2', (s + 3) + '.p1'] }, { type: 'coincident', refs: [(s + 3) + '.p2', s + '.p1'] });
      }
      return rfNUSk(E, R, []);
    }
    function rfNUPlate(nx, ny, dims) {
      var f = rfNUSk([{ t: 'circle', cx: 1, cy: 1, r: 0.125 }], [], []);
      var r = S.linearPattern(f, [0], { angle1: 0, spacing1: 1.1, count1: nx, angle2: 90, spacing2: 2.3, count2: ny, dimX: !!dims, dimY: !!dims });
      assert(r.ok, r.error);
      return f;
    }
    // Fully Define f with opts on the quick path and on a copy the dense way: the same relations, dimensions, geometry
    function rfNUBoth(f, what, opts) {
      var g = rfNUCopy(f), u = S.buildSystem(f).vars.length;
      assert(u > 240, what + ': above the sparse threshold (' + u + ' unknowns)');
      var ra = S.fullyDefine(f, opts), rb;
      S.setDense(true);
      try { rb = S.fullyDefine(g, opts); } finally { S.setDense(false); }
      assert(ra.ok === rb.ok && ra.status === rb.status && ra.dof === rb.dof, what + ': ' + ra.status + ' DOF ' + ra.dof + ' / ' + rb.status + ' DOF ' + rb.dof);
      assert(JSON.stringify(ra.rels) === JSON.stringify(rb.rels) && JSON.stringify(ra.dims) === JSON.stringify(rb.dims), what + ': the same new relations / dimensions (' + ra.rels.length + ' / ' + rb.rels.length + ', ' + ra.dims.length + ' / ' + rb.dims.length + ')');
      var worst = 0, at = '';
      function cmp(x, y, path) {
        if (typeof x === 'number') {
          var d = Math.abs(x - y);
          if (/\.a[01]$/.test(path)) d = Math.abs(((x - y) % 360 + 540) % 360 - 180);   // an arc's angle: the same arc at +-360
          if (!(d <= worst)) { worst = d; at = path; }
          return;
        }
        if (x && typeof x === 'object') Object.keys(x).forEach(function (k) { cmp(x[k], y && y[k], path + '.' + k); });
        else assert(x === y, what + ': ' + path + ' ' + JSON.stringify(x) + ' / ' + JSON.stringify(y));
      }
      cmp(f.entities, g.entities, 'entities'); cmp(f.rels, g.rels, 'rels'); cmp(f.dims, g.dims, 'dims');
      assert(worst < 1e-9, what + ': values differ by ' + worst + ' at ' + at);
      return ra;
    }

    test('rfNU: Fully Define Sketch on 30 loose rectangles, a slanted set, a small DXF flat and a 10 x 10 hole pattern (300 to 480 unknowns): the sparse path adds the same relations and dimensions as the dense one (baseline, chain, ordinate)', function () {
      var r = rfNUBoth(rfNURects(30), '30 rectangles, baseline', { units: 'in' });
      assert(r.status === 'full' && r.rels.length > 100, 'Fully Defined: ' + r.status + ', ' + r.rels.length + ' relations');
      rfNUBoth(rfNURects(30), '30 rectangles, chain', { units: 'in', scheme: 'chain' });
      rfNUBoth(rfNURects(30), '30 rectangles, ordinate', { units: 'in', scheme: 'ordinate' });
      rfNUBoth(rfNURects(30, true), '30 rectangles, some slanted', { units: 'in' });
      rfNUBoth(rfNURects(30), 'relations only', { units: 'in', dims: false });
      var fl = rfNUBoth(rfNUFlat(), 'a small flat', { units: 'in' });
      assert(fl.status === 'full' && fl.dims.length > 40, 'the flat Fully Defined with its hole sizes: ' + fl.status + ', ' + fl.dims.length);
      rfNUBoth(rfNUFlat(), 'a small flat, datum a corner', { units: 'in', hDatum: '0.p1', vDatum: '0.p1' });
      rfNUBoth(rfNUPlate(10, 10), 'a 10 x 10 pattern with nothing else', { units: 'in' });
    });

    // edit(f) the quick way (condensed, sparse) and on a copy the reference way (dense, nothing condensed): the same
    // coordinates (1e-9) and states
    function rfNUEdit(f, what, edit) {
      var g = rfNUCopy(f), ra = edit(f), rb;
      S.setDense(true);
      try { rb = edit(g); } finally { S.setDense(false); }
      assert(!!(ra && ra.ok !== false) === !!(rb && rb.ok !== false), what + ': both ways ' + JSON.stringify(ra && ra.ok) + ' / ' + JSON.stringify(rb && rb.ok));
      var worst = 0, at = '';
      f.entities.forEach(function (e, i) { Object.keys(e).forEach(function (k) { if (typeof e[k] === 'number') { var d = Math.abs(e[k] - g.entities[i][k]); if (/^a[01]$/.test(k)) d = Math.abs(((e[k] - g.entities[i][k]) % 360 + 540) % 360 - 180); if (!(d <= worst)) { worst = d; at = i + '.' + k; } } }); });
      assert(worst < 1e-9, what + ': coordinates differ by ' + worst + ' at ' + at);
      var a = S.analyze(f), b;
      S.setDense(true);
      try { b = S.analyze(g); } finally { S.setDense(false); }
      assert(a.dof === b.dof && a.status === b.status && JSON.stringify(a.dims) === JSON.stringify(b.dims) && JSON.stringify(a.entities) === JSON.stringify(b.entities), what + ': the same states (' + a.status + ' / ' + b.status + ')');
      return ra;
    }
    test('rfNU: a pattern copy with its own diameter or length leaves the unknowns as the other copies do (its dimension acts on the seed while condensed): the same holes and lines as the full dense solve', function () {
      var f = rfNUPlate(12, 12, true);
      f.rels.push({ type: 'fix', refs: ['0.c'] });
      var copy = 50;
      assert(f.entities[copy].t === 'circle', 'a copy at ' + copy);
      f.dims = (f.dims || []).concat([{ e: copy, k: 'dia' }]);
      var cz = S.condensePatterns(f, null);
      assert(cz && cz.drop[copy], 'the dimensioned copy is condensed');
      S.resetStats();
      rfNUEdit(f, 'the copy\'s diameter 0.25 -> 0.3125', function (s) { return S.setDim(s, s.dims.length - 1, 0.3125); });
      near(f.entities[0].r, 0.15625, 1e-9, 'the seed follows the copy\'s diameter');
      near(f.entities[143].r, 0.15625, 1e-9, 'and so does every other copy');
      rfNUEdit(f, 'a spacing changed', function (s) { var i = s.rels.map(function (r, k) { return r.type === 'distance' ? k : -1; }).filter(function (k) { return k >= 0; })[0]; return S.setRelValue(s, i, 1.25); });
      rfNUEdit(f, 'the seed dragged', function (s) { s.rels = s.rels.filter(function (r) { return r.type !== 'fix'; }); var c0 = rfNUCopy(s.entities); return S.drag(s, '0.c', [1.3, 1.2], c0); });
      rfNUEdit(f, 'a driven diameter on another copy', function (s) { s.dims.push({ e: 70, k: 'dia', driven: true }); return S.solve(s); });
      // a row of slots' lines: a length on a copy
      var g = rfNUSk([{ t: 'line', x1: 0, y1: 0, x2: 1, y2: 0 }], [{ type: 'fix', refs: ['0.p1'] }, { type: 'horizontal', refs: ['0'] }], []);
      var r = S.linearPattern(g, [0], { angle1: 0, spacing1: 1.5, count1: 12, dimX: true });
      assert(r.ok, r.error);
      g.dims.push({ e: 6, k: 'len' });
      rfNUEdit(g, 'a copy\'s length 1 -> 1.25', function (s) { return S.setDim(s, s.dims.length - 1, 1.25); });
      near(g.entities[11].x2 - g.entities[11].x1, 1.25, 1e-9, 'the last copy too');
    });

    test('rfNU: Fully Define Sketch on the 2,600-entity customer DXF (9,304 unknowns) and on 150 loose rectangles goes through the sparse rows: Fully Defined, DOF 0', function () {
      var f = rfNURects(150), r = S.fullyDefine(f, { units: 'in' });
      assert(r.ok && r.status === 'full' && r.dof === 0, '150 rectangles: ' + r.status + ' DOF ' + r.dof);
      if (typeof DxfImport === 'undefined') return;
      // rfNP's customer DXF: a 60 x 30 outline of 296 lines and 4 corner arcs, 1,500 holes, 200 slots as lines + arcs
      var out = ['0', 'SECTION', '2', 'ENTITIES'], W = 60, H = 30, n = 74, rr = 1, i;
      function line(a, b) { out.push('0', 'LINE', '8', '0', '10', a[0], '20', a[1], '30', 0, '11', b[0], '21', b[1], '31', 0); }
      function arc(c, rad, a0, a1) { out.push('0', 'ARC', '8', '0', '10', c[0], '20', c[1], '30', 0, '40', rad, '50', a0, '51', a1); }
      function side(p, q) { for (var k = 0; k < n; k++) line([p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n], [p[0] + (q[0] - p[0]) * (k + 1) / n, p[1] + (q[1] - p[1]) * (k + 1) / n]); }
      side([rr, 0], [W - rr, 0]); arc([W - rr, rr], rr, 270, 360); side([W, rr], [W, H - rr]); arc([W - rr, H - rr], rr, 0, 90);
      side([W - rr, H], [rr, H]); arc([rr, H - rr], rr, 90, 180); side([0, H - rr], [0, rr]); arc([rr, rr], rr, 180, 270);
      for (i = 0; i < 1500; i++) out.push('0', 'CIRCLE', '8', '0', '10', 3 + (i % 50) * 1.08, '20', 3 + Math.floor(i / 50) * 0.6, '30', 0, '40', 0.1);
      for (i = 0; i < 200; i++) { var x = 3 + (i % 40) * 1.35, y = 22 + Math.floor(i / 40) * 1.2; line([x, y - 0.15], [x + 0.6, y - 0.15]); arc([x + 0.6, y], 0.15, 270, 90); line([x + 0.6, y + 0.15], [x, y + 0.15]); arc([x, y], 0.15, 90, 270); }
      out.push('0', 'ENDSEC', '0', 'EOF');
      var p = DxfImport.parse(out.join('\n')), b = DxfImport.prepare(p, { partUnits: 'in', units: 'in', layers: {}, origin: 'file', tol: 0, repair: false });
      var g = rfNUSk(b.entities, [], []);
      DxfImport.endJoints(g.entities).forEach(function (j) { for (var k = 1; k < j.length; k++) g.rels.push({ type: 'coincident', refs: [j[0], j[k]] }); });
      assert(g.entities.length === 2600, 'the DXF: ' + g.entities.length + ' entities');
      S.resetStats();
      var r2 = S.fullyDefine(g, { units: 'in' });
      assert(r2.ok && r2.status === 'full' && r2.dof === 0, 'the DXF Fully Defined: ' + r2.status + ' DOF ' + r2.dof);
      assert(r2.dims.length === 1704 && r2.rels.length === 5400, 'hole / slot sizes and positions: ' + r2.dims.length + ' dimensions, ' + r2.rels.length + ' relations');
      assert(S.stats.jacobians >= 1, 'sparse rows were built: ' + JSON.stringify(S.stats));
    });
  })();
