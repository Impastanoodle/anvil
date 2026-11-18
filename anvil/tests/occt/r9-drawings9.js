  // --- r9/drawings9 ---
  // drawings of OpenCascade's Pulley, Tray, Rounded handle and Handlebar in four views: no visible end 0.03 … 1.99 mm
  // short of other linework (the Pulley's rim-band outline was missing and its groove rim stopped ~1 mm short: two faces
  // of one cylinder with different record origins were merged; the Handlebar's mitre ellipses stopped 0.2-0.48 mm
  // short where the tubes turn tangent); the 2° crease and seam rules add lines only on the Tray and the Handlebar
  try {
    var t9 = performance.now(), why9 = [], nE9 = 0, added9 = [];
    function sD9(p, l) { var dx = l[2] - l[0], dy = l[3] - l[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - l[0]) * dx + (p[1] - l[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - l[0] - t * dx, p[1] - l[1] - t * dy); }
    for (var nm9 of ['Pulley', 'Tray', 'Rounded handle', 'Handlebar']) {
      var mm9 = K.newModel('T'); K.runScript(mm9, EX.find(function (e) { return e.name === nm9; }).code);
      var mb9 = K.rebuild(mm9), am9 = K.meshFromBody(mb9.body), ts9 = new Int32Array(am9.triCount), tc9 = 0;
      am9.faces.forEach(function (f) { f.polys.forEach(function (p) { for (var i = 0; i < p.vertices.length - 2; i++) ts9[tc9++] = p.shared == null ? -1 : p.shared; }); });
      var mr9 = await new Promise(function (res, rej) { var s9 = ++seq; waiting[s9] = { res: res, rej: rej }; worker.postMessage({ type: 'build', seq: s9, model: JSON.parse(JSON.stringify(mm9)), noCache: true, anvil: { key: 9, positions: am9.positions, triShared: ts9 } }); });
      var om9 = K.meshFromBody(OcctKernel.fromPacked(mr9, mr9.packed || [], mb9, CSG, K).body), add9 = 0;
      ['Front', 'Top', 'Right', 'Isometric'].forEach(function (vn) {
        var pr = Drawing.projectView(om9, vn, { display: 'hlr' }), segs = [], ends = [];
        pr.lines.visible.forEach(function (l, i) { segs.push({ l: l, o: 'l' + i }); ends.push({ p: [l[0], l[1]], o: 'l' + i }, { p: [l[2], l[3]], o: 'l' + i }); });
        function curve(o, c, ax, ay, t0, t1, open) { var n = 720, prev = null; for (var i = 0; i <= n; i++) { var t = t0 + (t1 - t0) * i / n, q = [c[0] + Math.cos(t) * ax[0] + Math.sin(t) * ay[0], c[1] + Math.cos(t) * ax[1] + Math.sin(t) * ay[1]]; if (prev) segs.push({ l: [prev[0], prev[1], q[0], q[1]], o: o }); prev = q; if (open && (i === 0 || i === n)) ends.push({ p: q, o: o }); } }
        pr.arcs.visible.forEach(function (a, i) { curve('a' + i, a.c, [a.r, 0], [0, a.r], a.a0 * Math.PI / 180, a.a1 * Math.PI / 180, true); });
        pr.circles.visible.forEach(function (c, i) { curve('c' + i, c.c, [c.r, 0], [0, c.r], 0, 2 * Math.PI, false); });
        pr.ellipses.visible.forEach(function (el, i) { curve('e' + i, el.c, el.ax, el.ay, el.t0, el.t1, !el.full); });
        ends.forEach(function (en) {
          var m = Infinity; nE9++;
          segs.forEach(function (sg) { if (sg.o !== en.o) m = Math.min(m, sD9(en.p, sg.l)); });
          if (m > 0.03 && m < 1.99) why9.push(nm9 + ' ' + vn + ' end ' + en.p.map(function (x) { return x.toFixed(3); }).join(',') + ' ' + m.toFixed(4) + ' mm short');
        });
        var b9 = Drawing.projectView(om9, vn, { display: 'hlr', _noCrease: true }).lines.visible;
        add9 += pr.lines.visible.filter(function (l) { var mid = [(l[0] + l[2]) / 2, (l[1] + l[3]) / 2]; return !b9.some(function (k) { return sD9(mid, k) < 1e-3; }); }).length;
        if (nm9 === 'Pulley' && vn !== 'Top') {
          var gen = pr.lines.visible.filter(function (l) { return Math.abs(Math.abs(l[0]) - 40) < 1e-6 && Math.abs(Math.abs(l[2]) - 40) < 1e-6 && l[0] * l[2] > 0; });
          if (gen.length !== 4) why9.push('Pulley ' + vn + ': ' + gen.length + ' rim outlines at ±40 (4 expected)');
        }
      });
      if (add9) added9.push(nm9 + ' +' + add9);
      if (add9 && (nm9 === 'Pulley' || nm9 === 'Rounded handle')) why9.push(nm9 + ': the crease / seam rules add ' + add9 + ' lines');
    }
    row(why9.length ? 'bad' : 'ok', 'Drawings of OpenCascade parts: no line end just short of the linework (Pulley rim outlines, Handlebar mitre seams); creases / seams only on the Tray and Handlebar', why9.slice(0, 6).join('; ') || (nE9 + ' ends checked; added by creases / seams: ' + added9.join(', ')), performance.now() - t9);
    counts[why9.length ? 'fail' : 'pass']++;
  } catch (e) { row('bad', 'Drawings of OpenCascade parts: line ends', e.message); counts.fail++; }
  // --- end r9/drawings9 ---
