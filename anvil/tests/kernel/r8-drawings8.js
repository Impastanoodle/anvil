  // --- r8/drawings8 ---
  (function () {
    var DW = Drawing;
    test('Mug / Rounded handle / Handlebar views: rims reach the exact silhouette, faceted silhouette pieces meet (no visible end 0.001-0.5 mm short; 13 before, 0.03-0.41 mm)', function () {
      function sD(p, l) { var dx = l[2] - l[0], dy = l[3] - l[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - l[0]) * dx + (p[1] - l[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - l[0] - t * dx, p[1] - l[1] - t * dy); }
      var names = ['Mug', 'Rounded handle', 'Handlebar'], views = ['Front', 'Top', 'Right', 'Isometric'], bad = [], nEnds = 0;
      names.forEach(function (nm) {
        var r = build(AnvilExamples.filter(function (e) { return e.name === nm; })[0].code); noErrors(r);
        views.forEach(function (vn) {
          var pr = DW.projectView(r.mesh, vn, { display: 'hlr' }), segs = [], ends = [];
          pr.lines.visible.forEach(function (l, i) { segs.push({ l: l, o: 'l' + i }); ends.push({ p: [l[0], l[1]], o: 'l' + i }, { p: [l[2], l[3]], o: 'l' + i }); });
          function curve(o, c, ax, ay, t0, t1, open) { var n = 720, prev = null; for (var i = 0; i <= n; i++) { var t = t0 + (t1 - t0) * i / n, q = [c[0] + Math.cos(t) * ax[0] + Math.sin(t) * ay[0], c[1] + Math.cos(t) * ax[1] + Math.sin(t) * ay[1]]; if (prev) segs.push({ l: [prev[0], prev[1], q[0], q[1]], o: o }); prev = q; if (open && (i === 0 || i === n)) ends.push({ p: q, o: o }); } }
          pr.arcs.visible.forEach(function (a, i) { curve('a' + i, a.c, [a.r, 0], [0, a.r], a.a0 * Math.PI / 180, a.a1 * Math.PI / 180, true); });
          pr.circles.visible.forEach(function (c, i) { curve('c' + i, c.c, [c.r, 0], [0, c.r], 0, 2 * Math.PI, false); });
          pr.ellipses.visible.forEach(function (el, i) { curve('e' + i, el.c, el.ax, el.ay, el.t0, el.t1, !el.full); });
          ends.forEach(function (en) {
            var m = Infinity; nEnds++;
            segs.forEach(function (s) { if (s.o !== en.o) m = Math.min(m, sD(en.p, s.l)); });
            if (m > 1e-3 && m < 0.5) bad.push(nm + ' ' + vn + ' ' + en.o + ' ' + m.toFixed(4) + ' mm short');
          });
        });
      });
      assert(!bad.length, bad.length + ' ends short: ' + bad.slice(0, 5).join('; '));
      return nEnds + ' ends in ' + names.length * views.length + ' views';
    });
  })();
  // --- end r8/drawings8 ---
