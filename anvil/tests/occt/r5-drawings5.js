  // --- r5/drawings5 ---
  // OpenCascade's Mug in the Front, Top and Right views: every visible line, arc or ellipse end meets other linework
  // (within 0.001 mm) or is clear of it (0.5 mm): the rim reaches the side outlines (it stopped 0.025 mm short in the
  // Front view, 0.006 in the Right), the side outline reaches the rim, the handle's tube seen end-on is one arc and
  // the bend's top / bottom lines reach it
  try {
    var t5 = performance.now(), why5 = [], mm5 = K.newModel('T'); K.runScript(mm5, EX.find(function (e) { return e.name === 'Mug'; }).code);
    var mb5 = K.rebuild(mm5), am5 = K.meshFromBody(mb5.body), ts5 = new Int32Array(am5.triCount), tc5 = 0;
    am5.faces.forEach(function (f) { f.polys.forEach(function (p) { for (var i = 0; i < p.vertices.length - 2; i++) ts5[tc5++] = p.shared == null ? -1 : p.shared; }); });
    var mr5 = await new Promise(function (res, rej) { var s5 = ++seq; waiting[s5] = { res: res, rej: rej }; worker.postMessage({ type: 'build', seq: s5, model: JSON.parse(JSON.stringify(mm5)), noCache: true, anvil: { key: 9, positions: am5.positions, triShared: ts5 } }); });
    var om5 = K.meshFromBody(OcctKernel.fromPacked(mr5, mr5.packed || [], mb5, CSG, K).body), nEnds = 0;
    function sD5(p, l) { var dx = l[2] - l[0], dy = l[3] - l[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - l[0]) * dx + (p[1] - l[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - l[0] - t * dx, p[1] - l[1] - t * dy); }
    ['Front', 'Top', 'Right'].forEach(function (vn) {
      var pr = Drawing.projectView(om5, vn), segs = [], ends = [];
      pr.lines.visible.forEach(function (l, i) { segs.push({ l: l, o: 'l' + i }); ends.push({ p: [l[0], l[1]], o: 'l' + i }, { p: [l[2], l[3]], o: 'l' + i }); });
      // arcs, circles and ellipses as fine polylines
      function curve(o, c, ax, ay, t0, t1, open) {
        var n = 720, prev = null;
        for (var i = 0; i <= n; i++) { var t = t0 + (t1 - t0) * i / n, q = [c[0] + Math.cos(t) * ax[0] + Math.sin(t) * ay[0], c[1] + Math.cos(t) * ax[1] + Math.sin(t) * ay[1]]; if (prev) segs.push({ l: [prev[0], prev[1], q[0], q[1]], o: o }); prev = q; if (open && (i === 0 || i === n)) ends.push({ p: q, o: o }); }
      }
      pr.arcs.visible.forEach(function (a, i) { curve('a' + i, a.c, [a.r, 0], [0, a.r], a.a0 * Math.PI / 180, a.a1 * Math.PI / 180, true); });
      pr.circles.visible.forEach(function (c, i) { curve('c' + i, c.c, [c.r, 0], [0, c.r], 0, 2 * Math.PI, false); });
      pr.ellipses.visible.forEach(function (el, i) { curve('e' + i, el.c, el.ax, el.ay, el.t0, el.t1, !el.full); });
      ends.forEach(function (en) {
        var m = Infinity;
        segs.forEach(function (s) { if (s.o !== en.o) m = Math.min(m, sD5(en.p, s.l)); });
        nEnds++;
        if (m > 1e-3 && m < 0.5) why5.push(vn + ' end ' + en.p.map(function (x) { return x.toFixed(3); }).join(',') + ' is ' + m.toFixed(4) + ' mm short');
      });
      if (vn !== 'Top') {
        var rim = pr.lines.visible.filter(function (l) { return Math.abs(l[1] - 90) < 1e-6 && Math.abs(l[3] - 90) < 1e-6; });
        var lo = Math.min.apply(null, rim.map(function (l) { return Math.min(l[0], l[2]); })), hi = Math.max.apply(null, rim.map(function (l) { return Math.max(l[0], l[2]); }));
        if (!(Math.abs(lo + 40) < 1e-6 && Math.abs(hi - 40) < 1e-6)) why5.push(vn + ' rim runs ' + lo.toFixed(4) + ' … ' + hi.toFixed(4) + ', not ±40');
      }
    });
    row(why5.length ? 'bad' : 'ok', 'Mug drawing: view lines meet exactly (rim to side outline, handle tube end-on)', why5.slice(0, 6).join('; ') || (nEnds + ' line ends checked in Front / Top / Right'), performance.now() - t5);
    counts[why5.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'Mug drawing: view lines meet exactly', e.message); counts.fail++; }
  // --- end r5/drawings5 ---
