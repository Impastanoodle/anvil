  // --- rfRB (2026-11-19, lane stepshop): the flat and its DXF from an imported part. (1) An arc a STEP reader split
  // into chords of unequal length (the last step the remainder) is one ARC / CIRCLE, not an arc plus a short LINE at
  // each end; (2) free-form (B-spline) edges are written as a few LINEs / ARCs within the DXF's arcFit (0.001 in /
  // 0.025 mm), not one segment per chord, and a long straight edge beside one stays a LINE; (3) a rolled sheet (one open
  // cylindrical wall, no flat face) flattens with Insert Bends from a point on the roll: T from the two radii, flat =
  // the arc at R + K·T, one BEND line on the roll's centre. ---
  (function () {
    group('rfRB: imported flats: uneven arcs, fitted splines, rolled sheets');
    var TAU = 2 * Math.PI;
    function rfRBcount(cv) { var o = { arc: 0, line: 0 }; cv.segs.forEach(function (s) { o[s.t]++; }); return o; }
    // points on a circle from angle a0 by the given steps (degrees)
    function rfRBarc(c, r, a0, steps) {
      var pts = [], a = a0 * Math.PI / 180;
      pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
      steps.forEach(function (st) { a += st * Math.PI / 180; pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); });
      return pts;
    }
    function rfRBjoined(cv) {
      for (var i = 0; i < cv.segs.length; i++) { var s = cv.segs[i], t = cv.segs[(i + 1) % cv.segs.length]; if (Math.hypot(s.b[0] - t.a[0], s.b[1] - t.a[1]) > 1e-12) return false; }
      return true;
    }
    test('rfRB: a 30° fillet tessellated 11.25° + 11.25° + 7.5° (a reader\'s remainder step) between two lines is one ARC of its radius', function () {
      // a 30° arc tangent to the bottom edge, then a straight edge along its end tangent
      var r = 0.4, c = [4, 0.4], arc = rfRBarc(c, r, -90, [11.25, 11.25, 7.5]), end = arc[arc.length - 1];
      var t = [Math.cos(-60 * Math.PI / 180 + Math.PI / 2), Math.sin(-60 * Math.PI / 180 + Math.PI / 2)];   // tangent at -60°
      var far = [end[0] + 3 * t[0], end[1] + 3 * t[1]];
      var loop = [[0, 0]].concat(arc, [far, [0, far[1]]]);
      var cv = K.dxfLoopCurves(loop), n = rfRBcount(cv), a = cv.segs.filter(function (s) { return s.t === 'arc'; })[0];
      assert(n.arc === 1 && n.line === 4, JSON.stringify(n));
      near(a.r, r, 1e-9, 'radius'); near(Math.abs(a.sweep), Math.PI / 6, 1e-9, 'sweep');
      assert(rfRBjoined(cv), 'joined');
    });
    test('rfRB: a slot whose ends are tessellated 5° + 8 × 21.25° + 5° (the remainder at each end) is two ARCs and two LINEs, wherever the loop starts', function () {
      var r = 0.1, st = [5, 21.25, 21.25, 21.25, 21.25, 21.25, 21.25, 21.25, 21.25, 5];
      var loop = rfRBarc([1, 0], r, -90, st).concat(rfRBarc([0, 0], r, 90, st));
      for (var s0 = 0; s0 < loop.length; s0 += 3) {
        var rot = loop.slice(s0).concat(loop.slice(0, s0)), cv = K.dxfLoopCurves(rot), n = rfRBcount(cv);
        assert(n.arc === 2 && n.line === 2, 'start ' + s0 + ': ' + JSON.stringify(n));
        cv.segs.forEach(function (sg) { if (sg.t === 'arc') { near(sg.r, r, 1e-9, 'radius'); near(Math.abs(sg.sweep), Math.PI, 1e-9, 'sweep'); } });
        assert(rfRBjoined(cv), 'joined');
      }
    });
    test('rfRB: a round hole whose last chord is the remainder (23 × 15° + 15° split 10° + 5°) is one CIRCLE', function () {
      var st = []; for (var i = 0; i < 23; i++) st.push(15); st.push(10);
      var loop = rfRBarc([2, 3], 0.25, 0, st), cv = K.dxfLoopCurves(loop);
      assert(cv.circle, 'circle: ' + JSON.stringify(cv.segs && rfRBcount(cv)));
      near(cv.circle.r, 0.25, 1e-9, 'r'); near(cv.circle.c[0], 2, 1e-9, 'cx'); near(cv.circle.c[1], 3, 1e-9, 'cy');
    });
    // a free-form corner: a quarter turn whose radius runs 1.5 -> 1.55 -> 1.5 (no circle; a B-spline in a file), between
    // two long straight edges, chords of 0.5° (the fine reader) or 9° (the coarse one)
    function rfRBspline(stepDeg) {
      var pts = [[0, 0], [10, 0]], n = Math.round(90 / stepDeg);
      for (var i = 0; i <= n; i++) {
        var t = i / n, a = -Math.PI / 2 + t * Math.PI / 2, r = 1.5 + 0.05 * Math.sin(Math.PI * t);
        pts.push([10 + r * Math.cos(a), 1.5 + r * Math.sin(a)]);
      }
      pts.push([11.5, 6], [0, 6]);
      return pts;
    }
    function rfRBdev(cv, pts) {   // the farthest any input vertex lies from the written curves
      var worst = 0;
      pts.forEach(function (p) {
        var best = Infinity;
        cv.segs.forEach(function (s) {
          if (s.t === 'line') {
            var dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / L2));
            best = Math.min(best, Math.hypot(p[0] - s.a[0] - dx * t, p[1] - s.a[1] - dy * t));
          } else {
            var a0 = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]), ph = Math.atan2(p[1] - s.c[1], p[0] - s.c[0]) - a0;
            if (s.ccw) { while (ph < 0) ph += TAU; } else { while (ph > 0) ph -= TAU; }
            if (Math.abs(ph) <= Math.abs(s.sweep) + 1e-9) best = Math.min(best, Math.abs(Math.hypot(p[0] - s.c[0], p[1] - s.c[1]) - s.r));
          }
        });
        worst = Math.max(worst, best);
      });
      return worst;
    }
    test('rfRB: a free-form corner as 180 chords goes out as a few ARCs within arcFit 0.001 in; the long straight edges stay LINEs; arcFit off keeps the chords', function () {
      var tol = K.dxfFitTol('in', {});
      near(tol.fit, 0.001, 0, 'default arcFit in inches');
      near(K.dxfFitTol('mm', {}).fit, 0.025, 0, 'default arcFit in mm');
      var fine = rfRBspline(0.5), cv = K.dxfLoopCurves(fine, tol), n = rfRBcount(cv);
      assert(n.arc >= 1 && n.arc <= 8, 'arcs ' + JSON.stringify(n));
      var dev = rfRBdev(cv, fine);
      assert(dev <= 0.001 + 1e-12, 'vertices within arcFit: ' + dev);
      // the long edges: exact lines from corner to corner
      var longs = cv.segs.filter(function (s) { return s.t === 'line' && Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) > 4; });
      assert(longs.length === 4, 'the four long edges are LINEs: ' + longs.length);
      assert(rfRBjoined(cv), 'joined');
      var off = K.dxfLoopCurves(fine), no = rfRBcount(off);
      assert(no.line + no.arc >= 2 * (n.line + n.arc), 'arcFit off: many more pieces (' + JSON.stringify(no) + ' against ' + JSON.stringify(n) + ')');
      // the coarse reader: 15 chords of 6°, same few pieces, its vertices on them
      var coarse = rfRBspline(6), cc = K.dxfLoopCurves(coarse, tol), nc = rfRBcount(cc);
      assert(nc.arc >= 1 && nc.arc <= 4 && nc.line === 4, 'coarse ' + JSON.stringify(nc));
      assert(rfRBdev(cc, coarse) <= 0.001 + 1e-12, 'coarse within arcFit');
      return 'fine ' + JSON.stringify(n) + ', coarse ' + JSON.stringify(nc) + ', dev ' + dev.toExponential(2);
    });
    test('rfRB: exportDXFFlat writes the fitted pieces (polyline bulges) for an imported part flat (fitCurves), every chord with arcFit: false or for a part drawn in Anvil', function () {
      var flat = { loops: [rfRBspline(0.5)], bends: [], etch: [], sheet: { thickness: 0.06, bendRadius: 0.06, kFactor: 0.5 }, note: '', fitCurves: true };
      var d1 = K.exportDXFFlat(flat, 'in', { notes: false }), d0 = K.exportDXFFlat(flat, 'in', { notes: false, arcFit: false });
      var dn = K.exportDXFFlat(Object.assign({}, flat, { fitCurves: false }), 'in', { notes: false });
      assert(dn === d0, 'a flat of a part drawn in Anvil (no fitCurves) keeps its chords unless arcFit is given');
      var v1 = (d1.match(/\nVERTEX\r?\n/g) || []).length, v0 = (d0.match(/\nVERTEX\r?\n/g) || []).length;
      assert(v1 <= 12 && v0 > 2 * v1, 'vertices ' + v1 + ' fitted, ' + v0 + ' raw');
      if (typeof DxfCheck !== 'undefined') { var c = DxfCheck.check(d1, 'in'); assert(c.ok, c.errors.join('; ')); }
    });

    // ---- rolled sheet: an annular sector R 5 .. 5.125 over 90°, 20 long, extruded from Front (axis = Z)
    var Ri = 5, T = 0.125, L = 20;
    function rfRBroll(Kf, extra) {
      var Ro = Ri + T;
      return 'p.units("in");\n' +
        'p.sketch("Front").arc(0, 0, ' + Ri + ', 45, 135).arc(0, 0, ' + Ro + ', 45, 135)' +
        '.line(' + [Ri * Math.cos(Math.PI / 4), Ri * Math.sin(Math.PI / 4), Ro * Math.cos(Math.PI / 4), Ro * Math.sin(Math.PI / 4)].join(', ') + ')' +
        '.line(' + [-Ri * Math.cos(Math.PI / 4), Ri * Math.sin(Math.PI / 4), -Ro * Math.cos(Math.PI / 4), Ro * Math.sin(Math.PI / 4)].join(', ') + ')' +
        '.end().extrude(' + L + ');\n' + (extra || '') +
        (Kf != null ? 'p.sheet(' + T + ', ' + T + ', ' + Kf + ');\n' : '') +
        'p.insertBends([0, ' + (Ri + T) + ', ' + (L / 2) + ']);\n';
    }
    test('rfRB: a rolled sheet (R 5, T .125, 90°, 20 long): T from the radii; flat = (π/2)(R + K·T) x 20 for K .5 and .3; blank x T = the solid at K .5', function () {
      var pre = build('p.units("in");\np.sketch("Front").arc(0, 0, 5, 45, 135).arc(0, 0, 5.125, 45, 135).line(' + [5 * Math.SQRT1_2, 5 * Math.SQRT1_2, 5.125 * Math.SQRT1_2, 5.125 * Math.SQRT1_2].join(', ') + ').line(' + [-5 * Math.SQRT1_2, 5 * Math.SQRT1_2, -5.125 * Math.SQRT1_2, 5.125 * Math.SQRT1_2].join(', ') + ').end().extrude(20);\n');
      noErrors(pre);
      near(K.sheetThicknessAt(pre.body, [0, 5.125, 10], 'in'), T, 1e-9, 'T from the outside');
      near(K.sheetThicknessAt(pre.body, [0, 5, 10], 'in'), T, 1e-9, 'T from the inside');
      var out = [];
      [0.5, 0.3].forEach(function (Kf) {
        var r = build(rfRBroll(Kf)); noErrors(r);
        var fl = K.flatPattern(r.model, r.build, r.mesh), want = Math.PI / 2 * (Ri + Kf * T);
        near(fl.size[0], want, 1e-9, 'K ' + Kf + ' developed length'); near(fl.size[1], L, 1e-9, 'length');
        assert(fl.loops.length === 1 && fl.bends.length === 1 && fl.bends[0].rolled, 'one loop, one roll line');
        near(fl.bends[0].angle, 90, 1e-9, 'sweep');
        assert(!fl.bends[0].up, 'seen from the outside: DOWN');
        assert(!(fl.warnings || []).length, 'warnings: ' + (fl.warnings || []).join('; '));
        if (Kf === 0.5) nearRel(Math.abs(K.signedArea(fl.loops[0])) * T, r.mp.volume, 1e-9, 'blank x T = the solid');
        var dxf = K.exportDXFFlat(fl, 'in', {});
        assert(/\nBEND\r?\n/.test(dxf), 'a BEND layer line for the roll');
        out.push('K ' + Kf + ': ' + fl.size[0].toFixed(6));
      });
      return out.join(', ');
    });
    test('rfRB: picked on the inside face the rolled flat is seen from inside (UP), same size; a rolled part with a flat wall is refused by name', function () {
      var r = build(rfRBroll(0.5).replace('p.insertBends([0, ' + (Ri + T) + ', ', 'p.insertBends([0, ' + Ri + ', ')); noErrors(r);
      var fl = K.flatPattern(r.model, r.build, r.mesh);
      near(fl.size[0], Math.PI / 2 * (Ri + 0.5 * T), 1e-9, 'developed'); assert(fl.bends[0].up, 'UP from inside');
      // a flat tab welded on past one end of the roll: not a plain roll
      var w = build(rfRBroll(0.5, 'p.sketch("Front").rect(' + (Ri * Math.SQRT1_2) + ', ' + (Ri * Math.SQRT1_2) + ', 2, 0.125).end().extrude(20);\n'));
      var errs = Object.keys(w.errors).map(function (k) { return w.errors[k]; }).join(' | ');
      assert(/rolled part with flat walls/.test(errs) || /thickness/.test(errs), 'refused: ' + errs);
    });
    test('rfRB: the rolled sheet through Anvil\'s STEP (faceted) and back: the same flat', function () {
      var r = build(rfRBroll(0.5).replace(/p\.sheet[^\n]*\n|p\.insertBends[^\n]*\n/g, '')); noErrors(r);
      var step = Exchange.exportSTEP(r.model, r.build, {}), imp = Exchange.importFile('roll.step', step, { units: 'in' }), m = Exchange.newPartFromImport(imp);
      K.runScript(m, 'p.insertBends([0, ' + (Ri + T) + ', ' + (L / 2) + ']);');
      var b = K.rebuild(m), mesh = K.meshFromBody(b.body);
      assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
      var fl = K.flatPattern(m, b, mesh);
      near(m.sheet.thickness, T, 1e-9, 'T'); near(fl.size[0], Math.PI / 2 * (Ri + 0.5 * T), 1e-6, 'developed'); near(fl.size[1], L, 1e-9, 'length');
    });
    test('rfRB: a plate T thick with 150 holes goes through Insert Bends as a flat plate (no bends searched), its flat the plate', function () {
      var s = 'p.units("in");\np.sketch("Top").rect(0, -10, 15, 10)';
      for (var i = 0; i < 15; i++) for (var j = 0; j < 10; j++) s += '.circle(' + (0.5 + i) + ', ' + (-0.5 - j) + ', 0.1)';
      s += '.end().extrude(0.06);\n';
      var pre = build(s); noErrors(pre);
      var t0 = Date.now(), r = build(s + 'p.insertBends([7.3, 0.06, 5.2]);\n'), ms = Date.now() - t0;
      noErrors(r);
      var fl = K.flatPattern(r.model, r.build, r.mesh);
      assert(fl.loops.length === 151 && fl.bends.length === 0, 'loops ' + fl.loops.length);
      near(fl.size[0], 15, 1e-9, 'x'); near(fl.size[1], 10, 1e-9, 'y');
      return ms + ' ms';
    });
  })();
