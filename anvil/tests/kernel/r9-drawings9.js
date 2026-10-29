  // --- r9/drawings9 ---
  (function () {
    var DW = Drawing;
    function ex9(nm) { return AnvilExamples.filter(function (e) { return e.name === nm; })[0].code; }
    function sD(p, l) { var dx = l[2] - l[0], dy = l[3] - l[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - l[0]) * dx + (p[1] - l[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - l[0] - t * dx, p[1] - l[1] - t * dy); }
    // visible ends 0.001 … hi mm from other linework (arcs / circles / ellipses as fine polylines)
    function shortEnds(pr, hi) {
      var segs = [], ends = [], bad = [];
      pr.lines.visible.forEach(function (l, i) { segs.push({ l: l, o: 'l' + i }); ends.push({ p: [l[0], l[1]], o: 'l' + i }, { p: [l[2], l[3]], o: 'l' + i }); });
      function curve(o, c, ax, ay, t0, t1, open) { var n = 720, prev = null; for (var i = 0; i <= n; i++) { var t = t0 + (t1 - t0) * i / n, q = [c[0] + Math.cos(t) * ax[0] + Math.sin(t) * ay[0], c[1] + Math.cos(t) * ax[1] + Math.sin(t) * ay[1]]; if (prev) segs.push({ l: [prev[0], prev[1], q[0], q[1]], o: o }); prev = q; if (open && (i === 0 || i === n)) ends.push({ p: q, o: o }); } }
      pr.arcs.visible.forEach(function (a, i) { curve('a' + i, a.c, [a.r, 0], [0, a.r], a.a0 * Math.PI / 180, a.a1 * Math.PI / 180, true); });
      pr.circles.visible.forEach(function (c, i) { curve('c' + i, c.c, [c.r, 0], [0, c.r], 0, 2 * Math.PI, false); });
      pr.ellipses.visible.forEach(function (el, i) { curve('e' + i, el.c, el.ax, el.ay, el.t0, el.t1, !el.full); });
      ends.forEach(function (en) { var m = Infinity; segs.forEach(function (s) { if (s.o !== en.o) m = Math.min(m, sD(en.p, s.l)); }); if (m > 1e-3 && m < hi) bad.push(en.p.map(function (x) { return x.toFixed(3); }).join(',') + ' ' + m.toFixed(4) + ' mm'); });
      return { n: ends.length, bad: bad };
    }
    test('Kernel.curveEdges: two faces of one cylinder whose records have different origins keep their rims apart (every chord on its own circle; the Shaft\'s iso rim was 128 facet lines)', function () {
      var bad = [], n = 0;
      AnvilExamples.filter(function (e) { return e.kind !== 'assembly'; }).forEach(function (e) {
        var r = build(e.code); if (!r.mesh || !r.mesh.triCount) return;
        Kernel.curveEdges(r.mesh).forEach(function (ce) {
          ce.chords.forEach(function (ch) { ch.forEach(function (p) {
            n++;
            var d = [p[0] - ce.center[0], p[1] - ce.center[1], p[2] - ce.center[2]], h = d[0] * ce.normal[0] + d[1] * ce.normal[1] + d[2] * ce.normal[2];
            if (Math.abs(h) > 1e-6 * (1 + ce.radius) && bad.length < 5) bad.push(e.name + ': a chord ' + h.toFixed(3) + ' off the plane of the circle at ' + ce.center.map(function (x) { return +x.toFixed(2); }));
          }); });
        });
      });
      assert(!bad.length, bad.join('; '));
      var sh = DW.projectView(build(ex9('Shaft with keyway')).mesh, 'Isometric', { display: 'hlr' });
      assert(sh.lines.visible.length < 40, 'Shaft isometric: ' + sh.lines.visible.length + ' visible lines (rims as facets?)');
      return n + ' chord ends on their circles; Shaft iso ' + sh.lines.visible.length + ' lines, ' + sh.ellipses.visible.length + ' ellipses';
    });
    test('mitre seams drawn whole: the Tray\'s bend mitres reach the base corner, the Handlebar\'s mitre ellipses reach its outline (were 0.54-1.86 mm short); the Rounded handle\'s post outline ends at its root fillet (no 0.64 mm facet stub)', function () {
      var cases = [['Tray', ['Top', 'Front', 'Right', 'Isometric']], ['Handlebar', ['Front', 'Top', 'Right', 'Isometric']], ['Rounded handle', ['Isometric', 'Front']]], bad = [], nE = 0;
      cases.forEach(function (c) {
        var r = build(ex9(c[0])); noErrors(r);
        c[1].forEach(function (vn) { var s = shortEnds(DW.projectView(r.mesh, vn, { display: 'hlr' }), 1.99); nE += s.n; s.bad.forEach(function (b) { bad.push(c[0] + ' ' + vn + ' ' + b); }); });
      });
      assert(!bad.length, bad.length + ' ends short: ' + bad.slice(0, 5).join('; '));
      // the Tray's Top view: each mitre runs from the wall's inner corner to the base corner
      var tt = DW.projectView(build(ex9('Tray')).mesh, 'Top', { display: 'hlr' }).lines.visible;
      [[0, 0, -2, 2], [120, 0, 122, 2], [0, -80, -2, -82], [120, -80, 122, -82]].forEach(function (d) {
        assert(tt.some(function (l) { return (Math.hypot(l[0] - d[0], l[1] - d[1]) < 1e-6 && Math.hypot(l[2] - d[2], l[3] - d[3]) < 1e-6) || (Math.hypot(l[2] - d[0], l[3] - d[1]) < 1e-6 && Math.hypot(l[0] - d[2], l[1] - d[3]) < 1e-6); }), 'Tray Top: no mitre line ' + d.join(','));
      });
      // the Rounded handle's post: its outline stops where the root fillet starts (y = 9: v = 9 × 0.8165)
      var rh = DW.projectView(build(ex9('Rounded handle')).mesh, 'Isometric', { display: 'hlr' }).lines.visible;
      // rfFF: the fillet is a true torus now; its silhouette's first chords (≤ 0.05 mm, within 0.01 of the post's outline,
      // truly hidden by the post) pass HLR's tolerance, so only lines longer than 1 mm are the post's outline
      var post = rh.filter(function (l) { return Math.abs(Math.abs(l[0]) - 8) < 0.2 && Math.abs(Math.abs(l[2]) - 8) < 0.2 && Math.hypot(l[2] - l[0], l[3] - l[1]) > 1; }), lo = Math.min.apply(null, post.map(function (l) { return Math.min(l[1], l[3]); }));
      assert(post.length === 2 && Math.abs(lo - 9 * 2 / Math.sqrt(6)) < 1e-6, 'post outline ends at v = ' + lo.toFixed(4) + ' (' + post.length + ' lines)');
      return nE + ' ends';
    });
    test('the crease (2°) and seam rules add no edge on Anvil-kernel parts other than the Tray\'s and the Handlebar\'s mitre seams', function () {
      var out = [], bad = [];
      ['L-bracket', 'Flange', 'Hex nut', 'Pulley', 'Enclosure lid', 'Chamfered block', 'Rounded handle', 'Mug', 'Funnel', 'Moulded cap', 'Spur gear (12 teeth)', 'Tray', 'Handlebar'].forEach(function (nm) {
        var m = build(ex9(nm)).mesh, add = 0;
        ['Front', 'Isometric'].forEach(function (vn) {
          var a = DW.projectView(m, vn, { display: 'hlr' }).lines.visible, b = DW.projectView(m, vn, { display: 'hlr', _noCrease: true }).lines.visible;
          add += a.filter(function (l) { var mid = [(l[0] + l[2]) / 2, (l[1] + l[3]) / 2]; return !b.some(function (k) { return sD(mid, k) < 1e-3; }); }).length;
        });
        if (add) out.push(nm + ' +' + add);
        if (add && nm !== 'Tray' && nm !== 'Handlebar') bad.push(nm + ' +' + add);
      });
      assert(!bad.length, 'new edges on ' + bad.join(', '));
      return out.join(', ') || 'none';
    });
  })();
  // --- end r9/drawings9 ---
