  // --- r7/drawings7 ---
  (function () {
    var DW = Drawing;
    var PL7 = AnvilExamples.filter(function (e) { return e.name === 'Plate with bolt holes'; })[0].code;
    function noOverlap(r, kinds) {
      var S = DW.sheetSize(r.doc, r.doc.units), sh = DW.compute(r.doc, r.mesh, r.model), boxes = sh.views.map(function (w) { return { id: w.view.name, b: w.box, v: w.view }; });
      for (var a = 0; a < boxes.length; a++) for (var b = a + 1; b < boxes.length; b++) {
        var p = boxes[a].b, q = boxes[b].b;
        assert(p.x1 <= q.x0 || q.x1 <= p.x0 || p.y1 <= q.y0 || q.y1 <= p.y0, boxes[a].id + ' covers ' + boxes[b].id);
      }
      boxes.forEach(function (o) {
        if (kinds.indexOf(o.v.kind) < 0 || o.v.offSheet) return;
        assert(o.b.x0 >= 0 && o.b.y0 >= 0 && o.b.x1 <= S[0] && o.b.y1 <= S[1], o.id + ' on the sheet: ' + JSON.stringify(o.b));
      });
      return boxes;
    }
    test('projected views added by script to a full sheet: fit (free area / smaller scale) or beside it (offSheet); never over another view', function () {
      var r = drawingOf(PL7), F = r.view('Front').view, T = r.view('Top').view, out = [], off = 0, dirs = ['left', 'down', 'right', 'up', 'left', 'down'];
      for (var i = 0; i < 6; i++) {
        var pv = DW.addProjectedView(r.doc, r.mesh, (i % 2 ? T : F).id, dirs[i], { fit: true });
        if (pv.offSheet) off++;
        out.push(pv.orient + (pv.align ? '' : '*') + (pv.scale ? DW.scaleText(pv.scale) : '') + (pv.offSheet ? '!' : ''));
      }
      var boxes = noOverlap(r, ['projected']);
      assert(boxes.some(function (o) { return o.v.kind === 'projected' && !o.v.offSheet && (!o.v.align || o.v.scale); }), 'at least one fitted by shrinking / breaking alignment: ' + out.join(' '));
      return out.join(' ') + ' (' + off + ' beside the sheet)';
    });
    test('detail views added by script to a full sheet: free area, then smaller scale (still above the parent\'s), else beside it; never over another view', function () {
      var r = drawingOf(PL7), F = r.view('Front').view, T = r.view('Top').view, out = [], off = 0;
      for (var i = 0; i < 6; i++) {
        var par = i % 2 ? T : F, dv = DW.addDetailView(r.doc, r.mesh, par.id, { c: [10 - 4 * i, -5], r: [6, 8, 5, 14, 6, 14][i], scale: i < 3 ? [10, 1] : null, fit: true });
        if (dv.offSheet) off++;
        assert(DW.scaleValue(dv.scale) > DW.scaleValue(par.scale || r.doc.sheet.scale || [1, 1]) + 1e-9, dv.name + ' larger than its parent');
        assert(dv.name.indexOf('(' + DW.scaleText(dv.scale) + ')') > 0, 'name carries the scale: ' + dv.name);
        out.push(dv.label + DW.scaleText(dv.scale) + (dv.offSheet ? '!' : ''));
      }
      var boxes = noOverlap(r, ['detail']);
      assert(boxes.some(function (o) { return o.v.kind === 'detail' && !o.v.offSheet && DW.scaleValue(o.v.scale) < 10; }), 'at least one fitted at a smaller scale: ' + out.join(' '));
      return out.join(' ') + ' (' + off + ' beside the sheet)';
    });
    test('isometric views: a line / arc / ellipse cut short by a hole\'s wall or a silhouette ends on the drawn outline (no end 0.001-0.015 mm short; 37 over the examples before)', function () {
      function sD(p, l) { var dx = l[2] - l[0], dy = l[3] - l[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - l[0]) * dx + (p[1] - l[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - l[0] - t * dx, p[1] - l[1] - t * dy); }
      var names = ['L-bracket', 'Flange', 'Pulley', 'Sheet-metal U-bracket', 'Normal Cut Bracket', 'Chamfered block', 'Rounded handle', 'Shaft with keyway', 'Tray'], bad = [], nEnds = 0;
      names.forEach(function (nm) {
        var r = build(AnvilExamples.filter(function (e) { return e.name === nm; })[0].code); noErrors(r);
        var pr = DW.projectView(r.mesh, 'Isometric', { display: 'hlr' }), segs = [], ends = [];
        pr.lines.visible.forEach(function (l, i) { segs.push({ l: l, o: 'l' + i }); ends.push({ p: [l[0], l[1]], o: 'l' + i }, { p: [l[2], l[3]], o: 'l' + i }); });
        function curve(o, c, ax, ay, t0, t1, open) { var n = 720, prev = null; for (var i = 0; i <= n; i++) { var t = t0 + (t1 - t0) * i / n, q = [c[0] + Math.cos(t) * ax[0] + Math.sin(t) * ay[0], c[1] + Math.cos(t) * ax[1] + Math.sin(t) * ay[1]]; if (prev) segs.push({ l: [prev[0], prev[1], q[0], q[1]], o: o }); prev = q; if (open && (i === 0 || i === n)) ends.push({ p: q, o: o }); } }
        pr.arcs.visible.forEach(function (a, i) { curve('a' + i, a.c, [a.r, 0], [0, a.r], a.a0 * Math.PI / 180, a.a1 * Math.PI / 180, true); });
        pr.circles.visible.forEach(function (c, i) { curve('c' + i, c.c, [c.r, 0], [0, c.r], 0, 2 * Math.PI, false); });
        pr.ellipses.visible.forEach(function (el, i) { curve('e' + i, el.c, el.ax, el.ay, el.t0, el.t1, !el.full); });
        ends.forEach(function (en) {
          var m = Infinity; nEnds++;
          segs.forEach(function (s) { if (s.o !== en.o) m = Math.min(m, sD(en.p, s.l)); });
          if (m > 1e-3 && m < 0.015) bad.push(nm + ' ' + en.o + ' ' + m.toFixed(4) + ' mm short');
        });
      });
      assert(!bad.length, bad.length + ' ends just short: ' + bad.slice(0, 5).join('; '));
      return nEnds + ' ends in ' + names.length + ' isometric views';
    });
  })();
  // --- end r7/drawings7 ---
