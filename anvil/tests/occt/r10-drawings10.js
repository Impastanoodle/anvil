  // --- r10/drawings10 ---
  // drawings of OpenCascade's Tray, Hex nut, Rounded handle, Handlebar, Mug and Funnel in four views: (a) no visible end
  // 0.001 … 0.03 mm short of other linework (18 over these parts before: facet pieces at the Tray's corners, the Hex
  // nut's chamfer curves, the grip ends); (b) no straight piece lying along a drawn arc, circle or ellipse (the Tray's
  // mitre seam, seen along the wall, drawn as 22 facet lines over the bend's exact arc in the Right view)
  try {
    var t10 = performance.now(), why10 = [], nE10 = 0, nOn10 = 0;
    function sD10(p, l) { var dx = l[2] - l[0], dy = l[3] - l[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - l[0]) * dx + (p[1] - l[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - l[0] - t * dx, p[1] - l[1] - t * dy); }
    for (var nm10 of ['Tray', 'Hex nut', 'Rounded handle', 'Handlebar', 'Mug', 'Funnel']) {
      var mm10 = K.newModel('T'); K.runScript(mm10, EX.find(function (e) { return e.name === nm10; }).code);
      var mb10 = K.rebuild(mm10), am10 = K.meshFromBody(mb10.body), ts10 = new Int32Array(am10.triCount), tc10 = 0;
      am10.faces.forEach(function (f) { f.polys.forEach(function (p) { for (var i = 0; i < p.vertices.length - 2; i++) ts10[tc10++] = p.shared == null ? -1 : p.shared; }); });
      var mr10 = await new Promise(function (res, rej) { var s10 = ++seq; waiting[s10] = { res: res, rej: rej }; worker.postMessage({ type: 'build', seq: s10, model: JSON.parse(JSON.stringify(mm10)), noCache: true, anvil: { key: 9, positions: am10.positions, triShared: ts10 } }); });
      var om10 = K.meshFromBody(OcctKernel.fromPacked(mr10, mr10.packed || [], mb10, CSG, K).body);
      ['Front', 'Top', 'Right', 'Isometric'].forEach(function (vn) {
        var pr = Drawing.projectView(om10, vn, { display: 'hlr' }), segs = [], ends = [], curves = [];
        pr.lines.visible.forEach(function (l, i) { segs.push({ l: l, o: 'l' + i }); ends.push({ p: [l[0], l[1]], o: 'l' + i }, { p: [l[2], l[3]], o: 'l' + i }); });
        function curve(o, c, ax, ay, t0, t1, open) {
          var n = Math.max(64, Math.ceil(Math.hypot(ax[0], ax[1], ay[0], ay[1]) * (t1 - t0) / 0.05)), prev = null, cv = [];
          for (var i = 0; i <= n; i++) { var t = t0 + (t1 - t0) * i / n, q = [c[0] + Math.cos(t) * ax[0] + Math.sin(t) * ay[0], c[1] + Math.cos(t) * ax[1] + Math.sin(t) * ay[1]]; if (prev) { segs.push({ l: [prev[0], prev[1], q[0], q[1]], o: o }); cv.push([prev[0], prev[1], q[0], q[1]]); } prev = q; if (open && (i === 0 || i === n)) ends.push({ p: q, o: o }); }
          curves.push(cv);
        }
        pr.arcs.visible.forEach(function (a, i) { curve('a' + i, a.c, [a.r, 0], [0, a.r], a.a0 * Math.PI / 180, a.a1 * Math.PI / 180, true); });
        pr.circles.visible.forEach(function (c, i) { curve('c' + i, c.c, [c.r, 0], [0, c.r], 0, 2 * Math.PI, false); });
        pr.ellipses.visible.forEach(function (el, i) { curve('e' + i, el.c, el.ax, el.ay, el.t0, el.t1, !el.full); });
        function near(p, l, r) { return p[0] >= Math.min(l[0], l[2]) - r && p[0] <= Math.max(l[0], l[2]) + r && p[1] >= Math.min(l[1], l[3]) - r && p[1] <= Math.max(l[1], l[3]) + r; }
        ends.forEach(function (en) {
          var m = Infinity; nE10++;
          segs.forEach(function (sg) { if (sg.o !== en.o && near(en.p, sg.l, 0.05)) m = Math.min(m, sD10(en.p, sg.l)); });
          if (m > 1e-3 && m < 0.03) why10.push(nm10 + ' ' + vn + ' end ' + en.p.map(function (x) { return x.toFixed(3); }).join(',') + ' ' + m.toFixed(4) + ' mm short');
        });
        pr.lines.visible.forEach(function (l) {
          var pts = [[l[0], l[1]], [(l[0] + l[2]) / 2, (l[1] + l[3]) / 2], [l[2], l[3]]];
          if (curves.some(function (cv) { return pts.every(function (p) { return cv.some(function (s) { return near(p, s, 1e-3) && sD10(p, s) < 1e-3; }); }); })) { nOn10++; why10.push(nm10 + ' ' + vn + ': line ' + l.slice(0, 4).map(function (x) { return x.toFixed(3); }).join(',') + ' drawn along a curve'); }
        });
      });
    }
    row(why10.length ? 'bad' : 'ok', 'Drawings of OpenCascade parts: no line end 0.001-0.03 mm short of the linework, no facet lines drawn over an exact arc (Tray Right view)', why10.slice(0, 6).join('; ') + (why10.length > 6 ? ' … ' + why10.length : '') || (nE10 + ' ends checked, no line along a curve'), performance.now() - t10);
    counts[why10.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'Drawings of OpenCascade parts: small gaps, lines over curves', e.message); counts.fail++; }
  // --- end r10/drawings10 ---
