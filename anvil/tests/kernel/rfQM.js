  // --- rfQM (2026-11-19, lane smfinish): sheet-metal finishing: Circular Corner Relief folded vs flat, Vent arcs on the
  // true circle ---
  function rfQMtray(rl, extra) {
    var s = 'p.units("in"); p.sheet(0.06, 0.06, 0.5); p.sketch("Top").rect(0, -6, 8, 6).end().baseFlange();\n';
    [[4, 0.06, 0], [4, 0.06, 6], [0, 0.06, 3], [8, 0.06, 3]].forEach(function (e, i) {
      s += 'p.flange(1, [[' + e.join(', ') + ']], { position: "inside", lengthRef: "outer"' + (rl ? ', relief: "' + rl + '"' : '') + ' });\n';
    });
    return s + (extra || '');
  }
  function rfQMexact(flat) {
    var A = 0;
    flat.loops.forEach(function (loop, i) {
      var lc = K.dxfLoopCurves(loop), a = 0;
      if (!lc) return;
      if (lc.circle) a = Math.PI * lc.circle.r * lc.circle.r;
      else {
        var s = 0;
        lc.segs.forEach(function (g) { s += (g.a[0] * g.b[1] - g.b[0] * g.a[1]) / 2; if (g.t === 'arc') s += g.r * g.r / 2 * (g.sweep - Math.sin(g.sweep)); });
        a = Math.abs(s);
      }
      A += i ? -a : a;
    });
    return A;
  }
  // the area of a circle (C, r) inside a polygon, exactly (rfQF's rfQFcircleIn)
  function rfQMcircleIn(C, r, loop) {
    var s = 0;
    loop.forEach(function (p0, k) {
      var q0 = loop[(k + 1) % loop.length], a = [p0[0] - C[0], p0[1] - C[1]], b = [q0[0] - C[0], q0[1] - C[1]], d = [b[0] - a[0], b[1] - a[1]];
      var AA = d[0] * d[0] + d[1] * d[1], BB = 2 * (a[0] * d[0] + a[1] * d[1]), CC = a[0] * a[0] + a[1] * a[1] - r * r, D = BB * BB - 4 * AA * CC, ts = [0];
      if (AA > 0 && D > 0) [(-BB - Math.sqrt(D)) / (2 * AA), (-BB + Math.sqrt(D)) / (2 * AA)].forEach(function (t) { if (t > 0 && t < 1) ts.push(t); });
      ts.push(1);
      for (var i = 0; i + 1 < ts.length; i++) {
        var p = [a[0] + d[0] * ts[i], a[1] + d[1] * ts[i]], q = [a[0] + d[0] * ts[i + 1], a[1] + d[1] * ts[i + 1]], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        var cr = p[0] * q[1] - p[1] * q[0];
        s += Math.hypot(m[0], m[1]) <= r ? cr / 2 : r * r / 2 * Math.atan2(cr, p[0] * q[0] + p[1] * q[1]);
      }
    });
    return Math.abs(s);
  }
  function rfQMpoly(flat) { return flat.loops.reduce(function (s, l, i) { return s + Math.abs(K.signedArea(l)) * (i ? -1 : 1); }, 0); }
  (function () {
    group('rfQM: sheet-metal finishing');
    // the tray with no bend reliefs and a Circular corner relief at two corners: folded volume = the flat's exact area
    // (its DXF arcs) x T, and what the relief takes = the circle's area inside the plain blank (analytic) in both
    function rfQMcr(size, centered) {
      var opts = centered === false ? ', { reliefType: "circular", centeredOnBend: false }' : ', { reliefType: "circular" }';
      var p0 = build(rfQMtray(null)), f0 = K.flatPattern(p0.model, p0.build, p0.mesh);
      var r1 = build(rfQMtray(null, 'p.cornerRelief([[7.88, 0.06, 5.88], [0.12, 0.06, 0.12]], ' + size + opts + ');\n')); noErrors(r1);
      var f1 = K.flatPattern(r1.model, r1.build, r1.mesh), cs = [];
      f1.loops.forEach(function (l) { var lc = K.dxfLoopCurves(l); if (lc && lc.segs) lc.segs.forEach(function (g) { if (g.t === 'arc' && Math.abs(g.r - size / 2) < 1e-6 && !cs.some(function (c) { return Math.hypot(c.c[0] - g.c[0], c.c[1] - g.c[1]) < 1e-6; })) cs.push({ c: g.c, r: size / 2 }); }); });
      var want = 0; cs.forEach(function (c) { f0.loops.forEach(function (l, i) { want += (i ? -1 : 1) * rfQMcircleIn(c.c, c.r, l); }); });
      return { r1: r1, closed: K.meshQuality(r1.mesh).closed, circles: cs.length, dFlat: r1.mp.volume - rfQMexact(f1) * 0.06, flatTakes: rfQMexact(f0) - rfQMexact(f1), solidTakes: (p0.mp.volume - r1.mp.volume) / 0.06, want: want };
    }
    test('rfQM: Circular Corner Relief Ø.12 centred on the bends, inch tray with no bend reliefs: folded volume = the flat\'s exact area x T to 1e-9 (it was 5.3e-7 short: the flat\'s piece crossed each bend\'s end on the 32-gon\'s chord, 8e-5 inside the circle, and the DXF drew that bit as a line); both take the circle inside the blank exactly', function () {
      var a = rfQMcr(0.12);
      assert(a.closed && a.circles === 2, 'closed ' + a.closed + ', circles in the DXF ' + a.circles);
      near(a.dFlat, 0, 1e-9, 'folded - flat x T');
      near(a.flatTakes, a.want, 1e-10, 'the flat takes the circle inside the blank');
      near(a.solidTakes, a.want, 1e-9, 'the solid takes it');
      return 'folded - flat x T ' + a.dFlat.toExponential(2) + ', takes ' + a.want.toFixed(10);
    });
    test('rfQM: Circular Corner Relief Ø.25 centred (into the sheet face and the walls) and Ø.2 on the corner: folded = flat exact area x T to 1e-9 relative (2.6e-5 / 2.4e-5 with the old 32-gon)', function () {
      var out = [];
      [[0.25, true], [0.2, false]].forEach(function (c) {
        var a = rfQMcr(c[0], c[1]), w = 'Ø' + c[0] + (c[1] ? ' centred' : ' on the corner');
        out.push(w + ': ' + a.dFlat.toExponential(2) + ' / ' + (a.flatTakes - a.want).toExponential(2) + ' / ' + (a.solidTakes - a.want).toExponential(2));
        assert(a.closed, w + ': closed');
        near(a.dFlat, 0, 1e-9 * a.r1.mp.volume, w + ': folded - flat x T');
        // (with K.crExact off: 2.6e-5 and 2.4e-5)
        // (not pinned: Ø.25 centred, both take 1.25e-5 in2 less than the circle inside the plain blank; open)
      });
      return out.join('; ');
    });
  })();

  // --- rfQM (3) Corner-Trim corners picked (the Corner Edges boxes): picked points follow a flange length change ---
  (function () {
    group('rfQM: Corner-Trim picked corners follow a flange length change');
    function tray(L0) {
      return 'p.units("in"); p.sheet(0.06, 0.06, 0.5); p.sketch("Top").rect(0, -6, 8, 6).end().baseFlange();\n' +
        [[4, 0.06, 0], [4, 0.06, 6], [0, 0.06, 3], [8, 0.06, 3]].map(function (e, i) { return 'p.flange(' + (i ? 1 : L0) + ', [[' + e.join(', ') + ']], { position: "inside", lengthRef: "outer" });\n'; }).join('');
    }
    function flatOf(code) { var r = build(code); noErrors(r); return K.flatPattern(r.model, r.build, r.mesh); }
    function key(p) { return p.map(function (x) { return x.toFixed(6); }).join(','); }
    test('rfQM: one outer corner (on the first flange\'s wall) and one bend corner picked, chamfer .1 and circular R .125: each takes only its corner; the first flange 1 -> 1.5: the chamfer follows its corner (moved .5 across the bend line), the relief stays; the script keeps the picks', function () {
      var f1 = flatOf(tray(1)), f2 = flatOf(tray(1.5));
      var b1 = K.cornerTrimBreakCorners(f1), b2 = K.cornerTrimBreakCorners(f2), k2 = b2.map(key), k1 = b1.map(key);
      assert(b1.length === 8, 'outer corners of the tray blank: ' + b1.length);
      var moved = b1.filter(function (p) { return k2.indexOf(key(p)) < 0; }), fresh = b2.filter(function (p) { return k1.indexOf(key(p)) < 0; });
      assert(moved.length === 2 && fresh.length === 2, 'two corners move with the first flange: ' + moved.length + ' / ' + fresh.length);
      var rc = K.cornerTrimCorners(f1)[0].at, bc = moved[0];
      var trim = 'p.cornerTrim({ relief: "circular", size: 0.125, corners: [[' + rc.join(', ') + ']], breakCorner: "chamfer", breakSize: 0.1, breakCorners: [[' + bc.join(', ') + ']] });\n';
      var t1 = flatOf(tray(1) + trim), t2 = flatOf(tray(1.5) + trim);
      [t1, t2].forEach(function (t, i) {
        assert(t.trims[0].breaks === 1 && t.trims[0].reliefs.length === 1, (i ? 'L 1.5' : 'L 1') + ': ' + JSON.stringify(t.trims[0]) + ' ' + JSON.stringify(t.warnings));
      });
      // the chamfer is on the corner the wall's end moved to: the new corner is gone from the blank, and the removed area is the same
      var gone = function (f, t) { var have = K.cornerTrimBreakCorners(t).map(key); return K.cornerTrimBreakCorners(f).filter(function (p) { return have.indexOf(key(p)) < 0; }); };
      var g1 = gone(f1, t1), g2 = gone(f2, t2);
      assert(g1.length === 1 && key(g1[0]) === key(bc), 'L 1: the picked corner chamfered: ' + JSON.stringify(g1));
      var near2 = fresh.filter(function (p) { return Math.hypot(p[0] - bc[0], p[1] - bc[1]) < 0.5 + 1e-9; });
      assert(g2.length === 1 && near2.length === 1 && key(g2[0]) === key(near2[0]), 'L 1.5: the corner .5 across chamfered: ' + JSON.stringify(g2) + ' expected ' + JSON.stringify(near2));
      near(rfQMexact(f1) - rfQMexact(t1), rfQMexact(f2) - rfQMexact(t2), 1e-12, 'the same area taken');
      var scr = K.generateScript(build(tray(1) + trim).model);
      assert(/breakCorners: \[\[/.test(scr) && /corners: \[\[/.test(scr), 'script: ' + (scr.match(/p\.cornerTrim\([^\n]*/) || [''])[0]);
      return 'taken ' + (rfQMexact(f1) - rfQMexact(t1)).toFixed(9);
    });
  })();

  // --- rfQM (4) DXF arcs whose ends are a boolean's split points on a chord (a vent rib crossing a spar, test-reports/
  // 2026-11-18-export-audit.md handed-on 2): the circle is fitted on the run's interior vertices and each end moved
  // along its line onto it ---
  (function () {
    group('rfQM: DXF arcs with split-point ends on the true circle');
    // a sector of the spar's 32-gon (centre (3, 2.5), r .8003) from a0 to a1 degrees, closed by two radial ribs and a
    // chord at r .3: the arc's ends are where the ribs cross the polygon's chords
    function sector(a0, a1) {
      var C = [3, 2.5], r = 0.8003, out = [], rad = Math.PI / 180;
      function ray(a) {   // where the radial line at angle a crosses the 32-gon's chord
        var k = Math.floor(a / 11.25), p = [C[0] + r * Math.cos(k * 11.25 * rad), C[1] + r * Math.sin(k * 11.25 * rad)], q = [C[0] + r * Math.cos((k + 1) * 11.25 * rad), C[1] + r * Math.sin((k + 1) * 11.25 * rad)];
        var d = [Math.cos(a * rad), Math.sin(a * rad)], e = [q[0] - p[0], q[1] - p[1]], w = [p[0] - C[0], p[1] - C[1]], den = d[0] * e[1] - d[1] * e[0], t = (w[0] * e[1] - w[1] * e[0]) / den;
        return [C[0] + d[0] * t, C[1] + d[1] * t];
      }
      out.push(ray(a0));
      for (var k = Math.ceil(a0 / 11.25 + 1e-9); k * 11.25 < a1 - 1e-9; k++) out.push([C[0] + r * Math.cos(k * 11.25 * rad), C[1] + r * Math.sin(k * 11.25 * rad)]);
      out.push(ray(a1));
      out.push([C[0] + 0.3 * Math.cos(a1 * rad), C[1] + 0.3 * Math.sin(a1 * rad)], [C[0] + 0.3 * Math.cos(a0 * rad), C[1] + 0.3 * Math.sin(a0 * rad)]);
      return out;
    }
    test('rfQM: a spar arc between two ribs, the ends split points on the 32-gon\'s chords (within 1e-4 of a vertex, so in the run: the centre was 3e-6 off): one ARC centred (3, 2.5) r .8003 to 1e-9, its ends on the circle and on the ribs', function () {
      var out = [];
      [[0.0005, 89.9995], [11.2504, 56.2496], [22.5003, 168.7497]].forEach(function (c) {
        var lc = K.dxfLoopCurves(sector(c[0], c[1])), arcs = lc && lc.segs ? lc.segs.filter(function (g) { return g.t === 'arc'; }) : [];
        assert(arcs.length === 1, c.join('..') + ': one arc: ' + JSON.stringify(lc && lc.segs.map(function (g) { return g.t; })));
        var g = arcs[0];
        near(g.c[0], 3, 1e-9, c.join('..') + ': centre x'); near(g.c[1], 2.5, 1e-9, c.join('..') + ': centre y'); near(g.r, 0.8003, 1e-9, c.join('..') + ': radius');
        [g.a, g.b].forEach(function (p, k) {
          near(Math.hypot(p[0] - 3, p[1] - 2.5), 0.8003, 1e-12, c.join('..') + ': end ' + k + ' on the circle');
          var ang = Math.atan2(p[1] - 2.5, p[0] - 3) * 180 / Math.PI;
          near(((ang % 360) + 360) % 360, k ? c[1] : c[0], 1e-9, c.join('..') + ': end ' + k + ' on its rib');
        });
        assert(lc.segs.length === 4, c.join('..') + ': arc, rib, chord, rib: ' + lc.segs.length);
        out.push(c.join('..') + ' ok');
      });
      return out.join(', ');
    });
  })();