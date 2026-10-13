  // --- r10/drawings10 ---
  group('r10/drawings10: assembly bore rims, no lines over curves, small end gaps');
  (function () {
    var DW = Drawing;
    function sD(p, l) { var dx = l[2] - l[0], dy = l[3] - l[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - l[0]) * dx + (p[1] - l[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - l[0] - t * dx, p[1] - l[1] - t * dy); }
    // visible linework as fine polylines: { segs: [{ l, o }], ends: [{ p, o }], curves: [[l…]] }
    function linework(pr) {
      var segs = [], ends = [], curves = [];
      pr.lines.visible.forEach(function (l, i) { segs.push({ l: l, o: 'l' + i }); ends.push({ p: [l[0], l[1]], o: 'l' + i }, { p: [l[2], l[3]], o: 'l' + i }); });
      function curve(o, c, ax, ay, t0, t1, open) {
        var n = Math.max(64, Math.ceil(Math.hypot(ax[0], ax[1], ay[0], ay[1]) * (t1 - t0) / 0.05)), prev = null, cv = [];
        for (var i = 0; i <= n; i++) { var t = t0 + (t1 - t0) * i / n, q = [c[0] + Math.cos(t) * ax[0] + Math.sin(t) * ay[0], c[1] + Math.cos(t) * ax[1] + Math.sin(t) * ay[1]]; if (prev) { segs.push({ l: [prev[0], prev[1], q[0], q[1]], o: o }); cv.push([prev[0], prev[1], q[0], q[1]]); } prev = q; if (open && (i === 0 || i === n)) ends.push({ p: q, o: o }); }
        curves.push(cv);
      }
      pr.arcs.visible.forEach(function (a, i) { curve('a' + i, a.c, [a.r, 0], [0, a.r], a.a0 * Math.PI / 180, a.a1 * Math.PI / 180, true); });
      pr.circles.visible.forEach(function (c, i) { curve('c' + i, c.c, [c.r, 0], [0, c.r], 0, 2 * Math.PI, false); });
      pr.ellipses.visible.forEach(function (el, i) { curve('e' + i, el.c, el.ax, el.ay, el.t0, el.t1, !el.full); });
      return { segs: segs, ends: ends, curves: curves };
    }
    function near(p, l, r) { return p[0] >= Math.min(l[0], l[2]) - r && p[0] <= Math.max(l[0], l[2]) + r && p[1] >= Math.min(l[1], l[3]) - r && p[1] <= Math.max(l[1], l[3]) + r; }
    function shortEnds(pr, lo, hi) {
      var w = linework(pr), bad = [];
      w.ends.forEach(function (en) { var m = Infinity; w.segs.forEach(function (s) { if (s.o !== en.o && near(en.p, s.l, hi)) m = Math.min(m, sD(en.p, s.l)); }); if (m > lo && m < hi) bad.push(en.p.map(function (x) { return x.toFixed(3); }).join(',') + ' ' + m.toFixed(4)); });
      return bad;
    }
    function onCurves(pr) {
      var w = linework(pr);
      return pr.lines.visible.filter(function (l) {
        var pts = [[l[0], l[1]], [(l[0] + l[2]) / 2, (l[1] + l[3]) / 2], [l[2], l[3]]];
        return w.curves.some(function (cv) { return pts.every(function (p) { return cv.some(function (s) { return near(p, s, 1e-3) && sD(p, s) < 1e-3; }); }); });
      });
    }
    test('a disc\'s bore on a shaft of the same radius, its facets turned against the shaft\'s (an assembly): the bore\'s top rim is drawn whole in the isometric, not in dashes (OpenCascade\'s Gear train: 18)', function () {
      if (typeof Assembly === 'undefined') fail('assembly.js is not loaded');
      var out = [];
      [2.5, 5, 7].forEach(function (deg) {
        var c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180);
        var r = buildAsm('a.name("R").units("mm");' +
          ' a.insert({ script: \'p.name("Base"); p.box(40, 40, 10, { centered: true }); p.cylinder(3, 15, { at: [0, 10, 0] });\' }, { fixed: true });' +
          ' a.insert({ script: \'p.name("Disc"); p.cylinder(12, 5); p.cylinder(3, 5, { cut: true });\' }, { position: [0, 10, 0], rotation: [' + [c, 0, s, 0, 1, 0, -s, 0, c].join(',') + '] });');
        var pr = DW.projectView(r.mesh, 'Isometric', { display: 'hlr' }), ends = shortEnds(pr, 1e-3, 0.5);
        assert(pr.ellipses.visible.length === 4 && !ends.length, deg + '°: ' + pr.ellipses.visible.length + ' ellipse pieces (4 expected), ' + ends.length + ' ends short of the linework');
        out.push(deg + '° ' + pr.ellipses.visible.length);
      });
      return out.join(', ');
    });
    test('no straight piece is drawn along an exact arc, circle or ellipse of the view (the Chamfered block\'s corner arcs had 72 facet lines over their ends in the Top view), nor closer than 0.005 mm only (the Hex nut\'s chamfer curves stay)', function () {
      var out = [];
      ['Chamfered block', 'Hex nut', 'Mirrored clevis', 'Spur gear (12 teeth)', 'Bushing'].forEach(function (nm) {
        var r = build(AnvilExamples.filter(function (e) { return e.name === nm; })[0].code), n = 0;
        ['Front', 'Top', 'Right', 'Isometric'].forEach(function (vn) {
          var pr = DW.projectView(r.mesh, vn, { display: 'hlr' }), on = onCurves(pr);
          if (on.length) fail(nm + ' ' + vn + ': ' + on.length + ' lines along a curve, e.g. ' + on[0].slice(0, 4).map(function (x) { return x.toFixed(3); }).join(','));
          n += pr.lines.visible.length;
        });
        out.push(nm + ' ' + n);
      });
      var hn = build(AnvilExamples.filter(function (e) { return e.name === 'Hex nut'; })[0].code), iso = DW.projectView(hn.mesh, 'Isometric', { display: 'hlr' }), keep = DW.projectView(hn.mesh, 'Isometric', { display: 'hlr', _keepOnCurves: true });
      assert(iso.lines.visible.length >= keep.lines.visible.length - 2, 'Hex nut: ' + keep.lines.visible.length + ' -> ' + iso.lines.visible.length + ' lines (its chamfer curves dropped)');
      return out.join(', ');
    });
    test('visible line ends close: no end 0.001-0.03 mm short of other linework in the Hex nut\'s, Rounded handle\'s and Handlebar\'s views (closeSmallGaps; the Hex nut isometric had one)', function () {
      var out = [];
      ['Hex nut', 'Rounded handle', 'Handlebar', 'Mug'].forEach(function (nm) {
        var r = build(AnvilExamples.filter(function (e) { return e.name === nm; })[0].code), n = 0;
        ['Front', 'Top', 'Right', 'Isometric'].forEach(function (vn) {
          var pr = DW.projectView(r.mesh, vn, { display: 'hlr' }), bad = shortEnds(pr, 1e-3, 0.03);
          assert(!bad.length, nm + ' ' + vn + ': ends short ' + bad.slice(0, 3).join('; '));
          n += pr.lines.visible.length;
        });
        out.push(nm + ' ' + n);
      });
      var hx = build(AnvilExamples.filter(function (e) { return e.name === 'Hex nut'; })[0].code);
      assert(shortEnds(DW.projectView(hx.mesh, 'Isometric', { display: 'hlr', _keepGaps: true }), 1e-3, 0.03).length > 0, 'the Hex nut isometric no longer shows the gap without closeSmallGaps (test model changed)');
      return out.join(', ');
    });
  })();
  // --- end r10/drawings10 ---
