  // --- rfFJ (2026-10-29, lane FJ: the two reds after the 12° angular limit) --- a fillet end whose tangent point a
  // boolean / the outline weld replaced by a split point 1e-4 along the next chord is still one ARC in the DXF
  // (dxfLoopCurves takes the spoiled end chord into the arc), and a hollow sweep along line → arc → line stays exact
  // at other tessellations (each piece is hollowed on its own before the pieces are joined).
  (function () {
    group('rfFJ: DXF arcs keep a spoiled end chord, hollow sweeps along true arcs exact at any angular limit');
    // a 90° arc of radius R (8 chords) between two tangent lines; `spoil` moves the arc's end point 1e-4 along the
    // following line (the tangent point lost to a split point, as the vent's flat had it)
    function loop(spoil, extra) {
      var R = 0.05, pts = [[0, 0], [1, 0]], n = 8, i;
      for (i = 0; i <= n; i++) { var a = -Math.PI / 2 + Math.PI / 2 * i / n; pts.push([1 + R * Math.cos(a), R + R * Math.sin(a)]); }
      if (spoil) pts[pts.length - 1] = [1 + R, R + 1e-4];
      if (extra) pts.push([1 + R, R + 0.2], [1 + R - 0.01, R + 0.21]);
      pts.push([1 + R, 1], [0, 1]);
      return pts;
    }
    function count(cv) { var o = { arc: 0, line: 0 }; cv.segs.forEach(function (s) { o[s.t]++; }); return o; }
    test('rfFJ: a 90° fillet whose end point slid 1e-4 along the next line is still one ARC (radius kept to 1e-5), the lines stay 4', function () {
      var c0 = count(K.dxfLoopCurves(loop(false))), cv = K.dxfLoopCurves(loop(true)), c1 = count(cv);
      assert(c0.arc === 1 && c0.line === 4, 'clean: ' + JSON.stringify(c0));
      assert(c1.arc === 1 && c1.line === 4, 'spoiled: ' + JSON.stringify(c1));
      var arc = cv.segs.filter(function (s) { return s.t === 'arc'; })[0];
      near(arc.r, 0.05, 1e-5, 'radius'); near(Math.abs(arc.sweep), Math.PI / 2, 3e-3, 'sweep');
      for (var i = 0; i < cv.segs.length; i++) { var s = cv.segs[i], t = cv.segs[(i + 1) % cv.segs.length]; assert(Math.hypot(s.b[0] - t.a[0], s.b[1] - t.a[1]) < 1e-12, 'joined end to end at ' + i); }
      return 'r ' + arc.r.toFixed(7);
    });
    test('rfFJ: a real short line next to an arc (a 0.014 chamfer off the tangent line) is not taken into the arc', function () {
      var c = count(K.dxfLoopCurves(loop(false, true)));
      assert(c.arc === 1 && c.line === 6, JSON.stringify(c));
    });
    function vent(maxAngle) {
      var saved = K.setTessellation({ maxAngle: maxAngle });
      try {
        var T = 0.06, r = build('p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(-2, -2, 4, 4).end().baseFlange();\np.sketch("Top").circle(0, 0, 1).line(-1, 0, 1, 0).line(0, -1, 0, 1).circle(0, 0, 0.5).end().vent({ ribWidth: 0.1, sparWidth: 0.1, radius: 0.05 });\n');
        noErrors(r);
        var fl = K.flatPattern(r.model, r.build, r.mesh), o = { arc: 0, line: 0 };
        fl.loops.slice(1).forEach(function (l) { var cv = K.dxfLoopCurves(l); if (cv.circle) o.arc++; else { var c = count(cv); o.arc += c.arc; o.line += c.line; } });
        return o;
      } finally { K.setTessellation({ maxAngle: saved.maxAngle }); }
    }
    test('rfFJ: the acceptance vent with radius .05: 40 ARCs + 16 LINEs on HOLES at the 12° default, at 15° and with no angular limit', function () {
      [12, 15, 0].forEach(function (a) { var o = vent(a); assert(o.arc === 40 && o.line === 16, a + '°: ' + JSON.stringify(o)); });
    });
    test('rfFJ: a tube (Ø.5 / Ø.2) along line → tangent arc → line = annulus × path length at 12°, 20° and no angular limit', function () {
      var A = Math.PI * (0.0625 - 0.01), Lp = 1 + Math.PI + 1, out = [];
      [12, 20, 0].forEach(function (a) {
        var saved = K.setTessellation({ maxAngle: a });
        try {
          var r = build('p.units("in");\nvar prof = p.sketch("Top").circle(0, 0, 0.25).circle(0, 0, 0.1).id();\nvar path = p.sketch("Front").line(0, 0, 0, 1).arc(2, 1, 2, 90, 180).line(2, 3, 3, 3).id();\np.sweep({ profile: prof, path: path });\n');
          noErrors(r);
          nearRel(r.mp.volume, A * Lp, 1e-9, a + '° volume');
          out.push(a + '°: ' + r.body.polygons.length + ' polygons');
        } finally { K.setTessellation({ maxAngle: saved.maxAngle }); }
      });
      return out.join(', ');
    });
  })();
