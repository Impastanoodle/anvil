  // ---- rfBM (2026-10-13): Geometry Nesting (nest.js): true-shape nesting on sheets, parts in holes, rotation, DXF
  (function () {
    group('rfBM: Geometry Nesting');
    function rfBMRect(w, h, x, y) { x = x || 0; y = y || 0; return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
    // the exact corners of a placed rectangle part (its one outer loop of lines)
    function rfBMBox(res, pl) {
      var L = Nest.placedLoops(res, pl)[0], b = [Infinity, Infinity, -Infinity, -Infinity];
      L.segs.forEach(function (s) { [s.a, s.b].forEach(function (p) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }); });
      return b;
    }
    test('rfBM: 20 rectangles 10 × 5 on a 48 × 96 sheet, spacing .25, margin .5 — all placed on one sheet, every pair at least .25 apart and every part inside the margin (exact box tests and Nest.check), utilisation 21.7 %', function () {
      var res = Nest.run([{ name: 'R', loops: [rfBMRect(10, 5)], qty: 20 }], { width: 48, height: 96, spacing: 0.25, margin: 0.5, rotation: 90 });
      assert(res.placed === 20 && res.unplaced.length === 0 && res.sheets.length === 1, 'placed ' + res.placed + ' on ' + res.sheets.length);
      var B = res.placements.map(function (pl) { return rfBMBox(res, pl); });
      B.forEach(function (b, i) {
        assert(b[0] >= 0.5 - 1e-9 && b[1] >= 0.5 - 1e-9 && b[2] <= 47.5 + 1e-9 && b[3] <= 95.5 + 1e-9, 'part ' + i + ' outside the margin: ' + b);
        near(Math.min(b[2] - b[0], b[3] - b[1]), 5, 1e-9, 'short side'); near(Math.max(b[2] - b[0], b[3] - b[1]), 10, 1e-9, 'long side');
      });
      for (var i = 0; i < B.length; i++) for (var j = i + 1; j < B.length; j++) {
        var gap = Math.max(B[j][0] - B[i][2], B[i][0] - B[j][2], B[j][1] - B[i][3], B[i][1] - B[j][3]);
        assert(gap >= 0.25 - 1e-9, 'parts ' + i + ' and ' + j + ' ' + gap.toFixed(6) + ' apart');
      }
      var c = Nest.check(res);
      assert(c.ok && c.minGap >= 0.25 - 1e-9, 'check: ' + JSON.stringify(c));
      near(res.sheets[0].utilization, 100 * 20 * 50 / (48 * 96), 1e-9, 'utilisation');
      // a full sheet: 200 copies over at most 5 sheets, the first sheet well filled, still no overlap
      var big = Nest.run([{ name: 'R', loops: [rfBMRect(10, 5)], qty: 200 }], { width: 48, height: 96, spacing: 0.25, margin: 0.5, rotation: 90, maxSheets: 5 });
      assert(big.placed === 200 && big.sheets.length === 3 && big.sheets[0].utilization > 80 && Nest.check(big).ok, '200: ' + big.placed + ' on ' + big.sheets.length + ', ' + big.sheets.map(function (s) { return s.utilization.toFixed(1); }));
      return 'sheet 1 ' + res.sheets[0].utilization.toFixed(1) + ' %; 200 copies: ' + big.sheets.map(function (s) { return s.placements.length + ' (' + s.utilization.toFixed(1) + ' %)'; }).join(', ');
    });
    test('rfBM: an L-shaped blank with a 6.5 square hole fills a 21.5 sheet — two 2.5 squares nest inside the hole when Nest in holes is on (.25 clear of it), and stay unplaced when it is off', function () {
      var L = [[0, 0], [20, 0], [20, 18], [18, 18], [18, 20], [0, 20]], hole = rfBMRect(6.5, 6.5, 6, 6);
      function job(holes) { return Nest.run([{ name: 'L', loops: [L, hole] }, { name: 'S', loops: [rfBMRect(2.5, 2.5)], qty: 2 }], { width: 21.5, height: 21.5, spacing: 0.25, margin: 0.5, rotation: 90, holes: holes, maxSheets: 1 }); }
      var on = job(true), off = job(false);
      assert(on.placed === 3 && on.unplaced.length === 0, 'on: ' + on.placed);
      var Lp = on.placements.filter(function (p) { return p.name === 'L'; })[0], hb = Nest.loopsBox([Nest.placedLoops(on, Lp)[1]]);
      on.placements.filter(function (p) { return p.name === 'S'; }).forEach(function (pl) {
        var b = rfBMBox(on, pl);
        assert(b[0] >= hb[0] + 0.25 - 1e-9 && b[1] >= hb[1] + 0.25 - 1e-9 && b[2] <= hb[2] - 0.25 + 1e-9 && b[3] <= hb[3] - 0.25 + 1e-9, 'small part ' + b + ' not inside the hole ' + hb);
      });
      assert(Nest.check(on).ok, 'check on: ' + Nest.check(on).problems.join('; '));
      assert(off.placed === 1 && off.unplaced.length === 2 && off.unplaced.every(function (u) { return u.name === 'S'; }), 'off: ' + off.placed + ' placed, unplaced ' + JSON.stringify(off.unplaced));
      near(on.parts[0].area, 400 - 4 - 42.25, 1e-9, 'L area (outer less the hole)');
    });
    test('rfBM: rotation — eight 10 × 4 blanks on a 12.5 × 22.5 sheet: 5 fit without rotation, 6 with 90° steps (utilisation 71.1 % -> 85.3 %)', function () {
      function job(step) { return Nest.run([{ name: 'B', loops: [rfBMRect(10, 4)], qty: 8 }], { width: 12.5, height: 22.5, rotation: step, maxSheets: 1 }); }
      var a = job(0), b = job(90);
      assert(a.placed === 5 && b.placed === 6, 'placed ' + a.placed + ' / ' + b.placed);
      assert(a.placements.every(function (p) { return p.angle === 0 && !p.mirror; }), 'no rotation means angle 0');
      assert(b.sheets[0].utilization > a.sheets[0].utilization + 10, 'utilisation ' + a.sheets[0].utilization + ' -> ' + b.sheets[0].utilization);
      assert(Nest.check(a).ok && Nest.check(b).ok, 'no overlap');
      return a.sheets[0].utilization.toFixed(1) + ' % -> ' + b.sheets[0].utilization.toFixed(1) + ' %';
    });
    test('rfBM: deterministic, true arcs, 45° steps with mirror, every start corner and direction — the same job twice gives the same placements; a D-shaped blank with a hole keeps its exact area; each corner fills from that corner', function () {
      // a D: a line and a half circle (radius 3) with a Ø2 hole
      var D = { name: 'D', loops: [{ segs: [{ t: 'line', a: [3, 0], b: [-3, 0] }, { t: 'arc', a: [-3, 0], b: [3, 0], c: [0, 0], r: 3, ccw: false }] }, { circle: { c: [0, 1.2], r: 1 } }], qty: 14 };
      var opts = { width: 30, height: 20, spacing: 0.2, margin: 0.3, rotation: 45, mirror: true, maxSheets: 2 };
      var r1 = Nest.run([D], opts), r2 = Nest.run([D], opts);
      assert(JSON.stringify(r1.placements) === JSON.stringify(r2.placements), 'not deterministic');
      near(r1.parts[0].area, Math.PI * 9 / 2 - Math.PI, 1e-12, 'D area');
      var c = Nest.check(r1);
      assert(r1.placed === 14 && c.ok, r1.placed + ' placed; ' + c.problems.join('; '));
      var ok = 0;
      ['bl', 'br', 'tl', 'tr'].forEach(function (corner) {
        ['x', 'y'].forEach(function (dir) {
          var r = Nest.run([{ name: 'R', loops: [rfBMRect(4, 2)], qty: 3 }], { width: 30, height: 20, spacing: 0.25, margin: 0.5, rotation: 0, corner: corner, direction: dir });
          var B = r.placements.map(function (pl) { return rfBMBox(r, pl); }), cx = 0, cy = 0;
          B.forEach(function (b) { cx += (b[0] + b[2]) / 6; cy += (b[1] + b[3]) / 6; });
          var right = corner[1] === 'r', top = corner[0] === 't';
          assert(Nest.check(r).ok && (right ? cx > 15 : cx < 15) && (top ? cy > 10 : cy < 10), corner + '/' + dir + ': centre ' + cx + ', ' + cy);
          // the first part sits in the corner, at the margin (within a cell and a half)
          var b0 = B[0], tolc = 1.5 * r.cell + 1e-9;
          assert(Math.abs((right ? 29.5 - b0[2] : b0[0] - 0.5)) <= tolc && Math.abs((top ? 19.5 - b0[3] : b0[1] - 0.5)) <= tolc, corner + ': first part ' + b0);
          // rows along X keep the three in one row, columns along Y in one column
          var sameRow = Math.abs(B[0][1] - B[2][1]) < 1e-9, sameCol = Math.abs(B[0][0] - B[2][0]) < 1e-9;
          assert(dir === 'x' ? sameRow : sameCol, corner + '/' + dir + ' fill direction');
          ok++;
        });
      });
      return ok + ' corner / direction runs; D-blanks ' + r1.utilization.toFixed(1) + ' %';
    });
    test('rfBM: the U-bracket example\'s flat pattern × 12 on a 48 × 96 in sheet (the part is in mm) — 12 on one sheet, no overlap; each sheet\'s DXF (R12 and R2000) reads back with 12 × the flat\'s cut entities on CUT, closed loops', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Sheet-metal U-bracket'; })[0];
      var r = buildExample(ex), flat = K.flatPattern(r.model, r.build, r.mesh);
      var parts = [Nest.part({ name: 'U-Bracket', loops: flat.loops, qty: 12 })];
      near(parts[0].size[0] * parts[0].size[1], flat.size[0] * flat.size[1], 1e-6 * flat.size[0] * flat.size[1], 'part extents = flat extents');
      var res = Nest.run(parts, { width: 48 * 25.4, height: 96 * 25.4, spacing: 0.25 * 25.4, margin: 0.5 * 25.4, rotation: 90 });
      assert(res.placed === 12 && res.sheets.length === 1, 'placed ' + res.placed + ' on ' + res.sheets.length);
      var c = Nest.check(res);
      assert(c.ok, c.problems.join('; '));
      // the flat's own cut entities (LINE / ARC / CIRCLE, no bend lines or notes)
      var one = DxfCheck.check(K.exportDXFFlat(flat, 'mm', { style: 'entities', bendLines: false, notes: false }), { units: 'mm' }), per = 0;
      Object.keys(one.counts).forEach(function (k) { per += one.counts[k]; });
      ['R12', 'R2000'].forEach(function (v) {
        var text = Nest.sheetDXF(res, 0, 'mm', { version: v }), chk = DxfCheck.check(text, { layers: ['CUT'], units: 'mm' }), n = 0;
        Object.keys(chk.counts).forEach(function (k) { assert(/@CUT$/.test(k), 'entity off CUT: ' + k); n += chk.counts[k]; });
        assert(chk.ok, v + ': ' + chk.errors.join('; '));
        assert(n === 12 * per, v + ': ' + n + ' entities, want 12 × ' + per);
        assert(chk.version === (v === 'R12' ? 'AC1009' : 'AC1015'), 'version ' + chk.version);
        var back = DxfImport.parse(text);
        assert(back.entities.length === 12 * per, 'DxfImport reads ' + back.entities.length);
      });
      return per + ' entities per blank, utilisation ' + res.sheets[0].utilization.toFixed(1) + ' %';
    });
    test('rfBM: parts from a sketch\'s closed profiles — a plate with a hole and a separate disc give two parts (the hole stays with the plate); sheet entities hold the parts on CUT and the sheet outline as construction', function () {
      var prof = K.sketchProfile({ entities: [{ t: 'rect', x: 0, y: 0, w: 8, h: 4 }, { t: 'circle', cx: 2, cy: 2, r: 1 }, { t: 'circle', cx: 20, cy: 0, r: 1.5 }] });
      var parts = Nest.partsFromLoops(prof.loops, 'Sketch1');
      assert(parts.length === 2, parts.length + ' parts');
      var plate = parts.filter(function (p) { return p.loops.length === 2; })[0], disc = parts.filter(function (p) { return p.loops.length === 1; })[0];
      assert(plate && disc && disc.loops[0].circle, 'plate with its hole and a true circle disc');
      near(plate.area, 32 - Math.PI, 1e-9, 'plate area'); near(disc.area, Math.PI * 2.25, 1e-9, 'disc area');
      var res = Nest.run([{ name: plate.name, loops: plate.loops, qty: 2 }, { name: disc.name, loops: disc.loops, qty: 3 }], { width: 20, height: 10, spacing: 0.25, margin: 0.25 });
      var E = Nest.sheetEntities(res, 0);
      assert(E.filter(function (e) { return e.construction; }).length === 4, 'sheet outline');
      assert(E.filter(function (e) { return e.t === 'circle' && e.layer === 'CUT'; }).length === 5 && E.filter(function (e) { return e.t === 'line' && e.layer === 'CUT'; }).length === 8, 'circles and lines on CUT');
      assert(Nest.check(res).ok && res.placed === 5, 'placed ' + res.placed);
    });
  })();
