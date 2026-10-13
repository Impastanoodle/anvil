  // --- r3/drawings3 ---
  (function () {
    group('r3/drawings3: exact round silhouettes, tangent circles, view placement, layered SVG');
    var DW = Drawing, TOR = 'p.sketch("Front").circle(30, 0, 5).revolve(360);', SPH = 'p.sketch("Front").arc(0, 0, 10, -90, 90).line(0, 10, 0, -10).revolve(360);';
    var PLATE_CODE = AnvilExamples.filter(function (e) { return e.name === 'Plate with bolt holes'; })[0].code;
    test('a torus (R 30, r 5) seen along its axis is two exact circles Ø70 / Ø50 (outline, not dimensioned), from the side 70 × 10 with the tube ends as half circles (inner halves hidden); no facet lines', function () {
      var r = build(TOR); noErrors(r);
      var top = DW.projectView(r.mesh, 'Top'), fr = DW.projectView(r.mesh, 'Front');
      var rs = top.circles.visible.map(function (c) { return c.r; }).sort();
      assert(rs.length === 2 && top.lines.visible.length === 0 && top.circles.visible.every(function (c) { return c.sil; }), 'Top ' + JSON.stringify(top.circles.visible) + ' lines ' + top.lines.visible.length);
      near(rs[0], 25, 1e-9, 'inner'); near(rs[1], 35, 1e-9, 'outer');
      near(top.bounds.umax - top.bounds.umin, 70, 1e-9, 'Top width'); near(fr.bounds.umax - fr.bounds.umin, 70, 1e-9, 'Front width'); near(fr.bounds.vmax - fr.bounds.vmin, 10, 1e-9, 'Front height');
      assert(fr.lines.visible.length === 2 && fr.lines.visible.every(function (l) { return Math.abs(Math.abs(l[1]) - 5) < 1e-9 && Math.abs(l[3] - l[1]) < 1e-9; }), 'top / bottom ' + segsStr(fr.lines.visible));
      assert(fr.arcs.visible.length === 2 && fr.arcs.hidden.length === 2 && fr.arcs.visible.concat(fr.arcs.hidden).every(function (a) { return Math.abs(a.r - 5) < 1e-9 && Math.abs(Math.abs(a.c[0]) - 30) < 1e-9 && Math.abs(a.a1 - a.a0 - 180) < 1e-6; }), 'tube ends ' + JSON.stringify(fr.arcs));
      fr.arcs.visible.forEach(function (a) { var mid = (a.a0 + a.a1) / 2 * Math.PI / 180; assert(Math.cos(mid) * a.c[0] > 0, 'the outer half is the visible one'); });
      var d = drawingOf(TOR);
      assert(d.sheet.dims.every(function (x) { return x.kind !== 'dia'; }), 'no Ø on an outline: ' + d.sheet.dims.map(function (x) { return x.text; }).join(' '));
      return 'Ø' + 2 * rs[1] + ' / Ø' + 2 * rs[0] + ', side 70 × 10';
    });
    test('the torus in an isometric view: its outline is the exact silhouette curve (the view extents equal a dense sampling of the true outline to 1e-4)', function () {
      var r = build(TOR), O = DW.orientation('Isometric'), pv = DW.projectView(r.mesh, 'Isometric'), Vc = Kernel.vec;
      var e = O.e, b = { umin: Infinity, umax: -Infinity, vmin: Infinity, vmax: -Infinity }, d = [0, 1, 0];
      for (var i = 0; i < 20000; i++) {
        var f = i / 20000 * 2 * Math.PI, w = [Math.cos(f), 0, -Math.sin(f)], aa = Vc.dot(w, e), bb = Vc.dot(d, e), h = Math.hypot(aa, bb);
        [1, -1].forEach(function (s) {
          var c = s * bb / h, sn = -s * aa / h, p = Vc.add(Vc.scale(w, 30 + 5 * c), Vc.scale(d, 5 * sn)), u = Vc.dot(p, O.u), v = Vc.dot(p, O.v);
          b.umin = Math.min(b.umin, u); b.umax = Math.max(b.umax, u); b.vmin = Math.min(b.vmin, v); b.vmax = Math.max(b.vmax, v);
        });
      }
      ['umin', 'umax', 'vmin', 'vmax'].forEach(function (k) { near(pv.bounds[k], b[k], 1e-4, k); });
      assert(pv.lines.visible.length > 50, 'drawn as fine exact chords: ' + pv.lines.visible.length);
      return pv.lines.visible.length + ' chords, extents ' + fmt(b.umax - b.umin) + ' × ' + fmt(b.vmax - b.vmin);
    });
    test('a sphere (r 10) is one exact circle r 10 in every view, no facet lines', function () {
      var r = build(SPH); noErrors(r);
      ['Front', 'Top', 'Right', 'Isometric'].forEach(function (o) {
        var pv = DW.projectView(r.mesh, o);
        assert(pv.circles.visible.length === 1 && Math.abs(pv.circles.visible[0].r - 10) < 1e-9 && pv.lines.visible.length === 0, o + ' ' + JSON.stringify(pv.circles.visible) + ' lines ' + pv.lines.visible.length);
        near(pv.bounds.umax - pv.bounds.umin, 20, 1e-9, o + ' width');
      });
    });
    test('Tangent Edges Visible: a fillet round a cylinder rim runs out onto the side and onto the cap on true circles: two exact ellipses in the isometric, one edge-on line in Front (no facet pieces)', function () {
      // r4/drawings4: the run-out onto the cap (an Anvil fillet's facets carry no surface record) is drawn too
      var code = 'p.cylinder(20, 10); p.fillet(3, [[20, 10, 0]]);', r = build(code); noErrors(r);
      var iso = DW.projectView(r.mesh, 'Isometric', { tangent: 'visible' }), fr = DW.projectView(r.mesh, 'Front', { tangent: 'visible' });
      assert(iso.ellipses.tangent.length === 2 && iso.lines.tangent.length === 0, 'iso ' + JSON.stringify([iso.ellipses.tangent.length, iso.lines.tangent.length]));
      // the major semi-axis of a projected circle is its radius: the largest eigenvalue of [ax ay][ax ay]ᵀ
      var majors = iso.ellipses.tangent.map(function (el) {
        var ax = Math.hypot(el.ax[0], el.ax[1]), ay = Math.hypot(el.ay[0], el.ay[1]), dt = el.ax[0] * el.ay[0] + el.ax[1] * el.ay[1];
        var tr = ax * ax + ay * ay, det = ax * ax * ay * ay - dt * dt;
        return Math.sqrt((tr + Math.sqrt(Math.max(0, tr * tr - 4 * det))) / 2);
      }).sort(function (a, b) { return a - b; });
      near(majors[1], 20, 1e-6, 'run-out circle r 20');
      near(majors[0], 17, 0.05, 'run-out onto the cap r 17');
      assert(fr.lines.tangent.length === 1 && Math.abs(fr.lines.tangent[0][1] - 7) < 1e-9 && Math.abs(Math.abs(fr.lines.tangent[0][2] - fr.lines.tangent[0][0]) - 40) < 1e-9, 'Front ' + segsStr(fr.lines.tangent));
      var d = drawingOf(code), I = d.view('Isometric');
      I.view.tangent = 'font';
      var sh = DW.compute(d.doc, d.mesh, d.model);
      assert(sh.prims.filter(function (p) { return p.k === 'ellipse' && p.style === 'tanfont'; }).length === 2, 'drawn as phantom ellipses');
    });
    test('Section, projected and detail views added without a position land clear of the other views and each other, still aligned with their parents', function () {
      var r = drawingOf(PLATE_CODE), F = r.view('Front').view, T = r.view('Top').view;
      var S = DW.addSectionView(r.doc, r.mesh, F.id, { axis: 'v', at: 50, sign: 1 });
      var Dt = DW.addDetailView(r.doc, r.mesh, T.id, { c: [10, -10], r: 8 });
      var P = DW.addProjectedView(r.doc, r.mesh, F.id, 'down');
      near(S.y, F.y, 1e-12, 'section level with Front'); near(P.x, F.x, 1e-12, 'Bottom under Front');
      var sh = DW.compute(r.doc, r.mesh, r.model), boxes = sh.views.map(function (w) { return { id: w.view.name, b: w.box }; });
      for (var i = 0; i < boxes.length; i++) for (var j = i + 1; j < boxes.length; j++) {
        var a = boxes[i].b, b = boxes[j].b;
        assert(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0, boxes[i].id + ' covers ' + boxes[j].id);
      }
      var wS = sh.views.filter(function (w) { return w.view.id === S.id; })[0], wF = sh.views.filter(function (w) { return w.view.id === F.id; })[0];
      assert(wS.box.x0 > wF.box.x1, 'section on the viewer side (right of Front)');
      // a view whose default spot is free stays there; a given position is kept
      var r2 = drawingOf(PLATE_CODE), F2 = r2.view('Front').view, x0 = F2.x + 1000;
      r2.doc.views = r2.doc.views.filter(function (v) { return v.role === 'front'; });
      var S2 = DW.addSectionView(r2.doc, r2.mesh, F2.id, { axis: 'v', at: 50, sign: 1 }), S3 = DW.addSectionView(r2.doc, r2.mesh, F2.id, { axis: 'v', at: 50, sign: 1, x: x0 });
      near(S3.x, x0, 1e-12, 'a given position is kept');
      assert(S2.x > F2.x && S2.x < F2.x + 250, 'default spot kept when clear: ' + S2.x);
      return 'section x ' + fmt(S.x) + ', detail (' + fmt(Dt.x) + ', ' + fmt(Dt.y) + '), bottom y ' + fmt(P.y);
    });
    test('svgParts: the SVG in layers joins to exactly toSVG; the live form puts each view\'s dimensions in their own group (a dragged view takes them along)', function () {
      var r = drawingOf(PLATE_CODE), P = DW.svgParts(r.sheet), out = [P.head, P.bg];
      P.groups.forEach(function (g) { out.push(g.open); out.push(g.body); out.push('</g>'); });
      out.push('</svg>');
      assert(out.join('\n') === DW.toSVG(r.sheet), 'parts join to toSVG');
      var L = DW.svgParts(r.sheet, { live: true }), dims = L.groups.filter(function (g) { return g.key === 'DIMENSIONS'; })[0];
      var F = r.view('Front').view;
      assert(dims && dims.body.indexOf('<g data-of="' + F.id + '">') >= 0, 'Front dimensions grouped');
      assert(DW.toSVG(r.sheet).indexOf('data-of') < 0, 'exports unchanged');
      return P.groups.length + ' layers';
    });
  })();
  // --- end r3/drawings3 ---
