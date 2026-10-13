  // ---- rfN (lane N, 2026-10-12): Auxiliary, Crop and Broken drawing views
  (function () {
    if (typeof Drawing === 'undefined') return;
    group('rfN: Auxiliary View, Crop View, Break (broken view)');
    var DR = Drawing;
    function sheetOf(code, opts) {
      var r = build(code);
      noErrors(r);
      r.doc = DR.newDrawing(r.model, Object.assign({ date: '2026-10-12' }, opts || {}));
      DR.standard3View(r.doc, r.mesh, r.model.units);
      r.recompute = function () { r.sheet = DR.compute(r.doc, r.mesh, r.model); return r.sheet; };
      r.recompute();
      r.w = function (id) { return r.sheet.views.filter(function (w) { return w.view.id === id; })[0]; };
      r.front = r.doc.views.filter(function (v) { return v.orient === 'Front'; })[0];
      return r;
    }
    function throws(f) { try { f(); return false; } catch (e) { return true; } }
    function len(l) { return Math.hypot(l[2] - l[0], l[3] - l[1]); }
    var WEDGE = 'p.sketch("Front").polyline([[0, 0], [100, 0], [100, 20], [0, 60]], true).extrude(30);';
    test('rfN: auxFrame — square onto a horizontal edge of Front is Top (third angle) / the view from below placed above (first angle); any edge gives a right-handed orthonormal frame looking along the edge normal', function () {
      var F = DR.orientation('Front'), T = DR.orientation('Top');
      var A = DR.auxFrame(F, [0, 0], [1, 0], 1, 'third');
      nearVec(A.e, T.e, 1e-12, 'e'); nearVec(A.u, T.u, 1e-12, 'u'); nearVec(A.v, T.v, 1e-12, 'v');
      var A1 = DR.auxFrame(F, [0, 0], [1, 0], 1, 'first');
      nearVec(A1.e, [0, -1, 0], 1e-12, 'first angle: seen from below');
      var B = DR.auxFrame(F, [100, 20], [0, 60], -1, 'third'), L = Math.hypot(100, 40), V = Kernel.vec;
      nearVec(B.e, [40 / L, 100 / L, 0], 1e-12, 'looks along the edge normal');
      near(V.dot(B.u, B.v), 0, 1e-12, 'u.v'); near(V.len(B.u), 1, 1e-12, '|u|'); nearVec(V.cross(B.u, B.v), B.e, 1e-12, 'u x v = e');
      near(B.dir[0], 40 / L, 1e-12, 'placed along the normal x'); near(B.dir[1], 100 / L, 1e-12, 'placed along the normal y');
      return 'ok';
    });
    test('rfN: Auxiliary View of a 21.8° wedge face — the face is drawn at true size (107.703 × 30), the view stays aligned square to the edge, slides only along its axis, follows its parent, VIEW A-A label and arrow in SVG / DXF R12 + R2000 / PDF', function () {
      var r = sheetOf(WEDGE), L = Math.hypot(100, 40);
      var v = DR.addAuxiliaryView(r.doc, r.mesh, r.front.id, { a: [100, 20], b: [0, 60], sign: -1 });
      assert(v.kind === 'aux' && v.label === 'A', 'kind / label ' + v.kind + ' ' + v.label);
      var sh = r.recompute(), w = r.w(v.id), pw = r.w(r.front.id);
      assert(w && w.ortho, 'aux view is orthographic (dimensionable)');
      // the inclined face's corners in the view: a true 107.703 × 30 rectangle; its 30 edges are drawn visible
      var vis = w.proj.lines.visible, Vv = Kernel.vec, F = w.frame;
      function at(X) { return [Vv.dot(X, F.u), Vv.dot(X, F.v)]; }
      var A = at([100, 20, 0]), B = at([0, 60, 0]), C = at([0, 60, 30]), D = at([100, 20, 30]);
      near(Math.hypot(B[0] - A[0], B[1] - A[1]), L, 1e-9, 'true length of the inclined edge');
      near(Math.hypot(D[0] - A[0], D[1] - A[1]), 30, 1e-9, 'true width');
      near((B[0] - A[0]) * (D[0] - A[0]) + (B[1] - A[1]) * (D[1] - A[1]), 0, 1e-9, 'square corner');
      function drawn(P, Q) { return vis.some(function (l) { return Math.hypot(l[0] - P[0], l[1] - P[1]) + Math.hypot(l[2] - Q[0], l[3] - Q[1]) < 1e-6 || Math.hypot(l[0] - Q[0], l[1] - Q[1]) + Math.hypot(l[2] - P[0], l[3] - P[1]) < 1e-6; }); }
      assert(drawn(A, D) && drawn(B, C), 'the face\'s 30 edges are visible lines');
      // alignment: a corner of the edge in the parent and in the aux view lie on one line along the view's axis
      function checkAligned(tag) {
        var W = r.w(v.id), P = r.w(r.front.id), F = W.frame, X = [100, 20, 0], V = Kernel.vec;
        var a = P.toSheet([100, 20]), b = W.toSheet([V.dot(X, F.u), V.dot(X, F.v)]), d = v.aux.dir;
        near((b[0] - a[0]) * d[1] - (b[1] - a[1]) * d[0], 0, 1e-9, tag + ': projection line square to the edge');
        assert((b[0] - a[0]) * d[0] + (b[1] - a[1]) * d[1] > 0, tag + ': view on the arrow side');
      }
      checkAligned('placed');
      var x0 = v.x, y0 = v.y;
      DR.moveView(r.doc, v.id, x0 + 40, y0 - 7);
      near((v.x - x0) * v.aux.dir[1] - (v.y - y0) * v.aux.dir[0], 0, 1e-9, 'drag slides along the axis only');
      r.recompute(); checkAligned('dragged');
      var ax = v.x, ay = v.y;
      DR.moveView(r.doc, r.front.id, r.front.x + 10, r.front.y + 5);
      near(v.x - ax, 10, 1e-9, 'follows the parent x'); near(v.y - ay, 5, 1e-9, 'follows the parent y');
      sh = r.recompute(); checkAligned('parent moved');
      var lab = sh.prims.filter(function (p) { return p.k === 'text' && p.text === 'VIEW A-A'; });
      assert(lab.length === 1, 'one VIEW A-A label');
      var arrow = sh.prims.filter(function (p) { return p.auxArrow === v.id; });
      assert(arrow.some(function (p) { return p.k === 'fill'; }) && arrow.some(function (p) { return p.k === 'text' && p.text === 'A'; }), 'arrow and letter on the parent');
      assert(arrow.every(function (p) { return p.layer === r.w(r.front.id).layer; }), 'on the parent layer');
      var svg = DR.toSVG(sh), dxf = DR.toDXF(sh), dxf2 = DR.toDXF(sh, { version: 'R2000' }), pdf = DR.toPDF(sh);
      assert(svg.indexOf('VIEW A-A') >= 0 && dxf.indexOf('VIEW A-A') >= 0 && dxf2.indexOf('VIEW A-A') >= 0 && pdf.indexOf('VIEW A-A') >= 0, 'label in SVG / DXF / PDF');
      assert(/\nAUXILIARY\r?\n/.test(dxf), 'own DXF layer');
      // saved with the drawing: a JSON round trip computes the same sheet
      var doc2 = JSON.parse(JSON.stringify(r.doc)), sh2 = DR.compute(doc2, r.mesh, r.model);
      assert(sh2.prims.length === sh.prims.length, 'JSON round trip ' + sh2.prims.length + ' vs ' + sh.prims.length);
      assert(throws(function () { DR.addAuxiliaryView(r.doc, r.mesh, r.front.id, { a: [0, 0], b: [0, 0] }); }), 'a zero-length edge is refused');
      return 'ok';
    });
    var PLATE = 'p.sketch("Front").rect(0, 0, 100, 50).circle(20, 25, 5).circle(80, 25, 5).extrude(10);';
    test('rfN: Crop View — a rectangle keeps the left half (edges clipped exactly at u = 50, the right hole gone, a hole on the boundary becomes a 180° arc), a circle keeps one hole; Remove Crop restores the view; SVG / DXF follow', function () {
      var r = sheetOf(PLATE), id = r.front.id, full = r.w(id).proj.stats;
      DR.setCrop(r.doc, id, { type: 'rect', a: [0, 0], b: [50, 50] });
      var w = r.recompute() && r.w(id), pr = w.proj;
      assert(pr.circles.visible.length === 1, 'one hole left: ' + pr.circles.visible.length);
      near(pr.circles.visible[0].c[0], 20, 1e-6, 'the left hole');
      pr.lines.visible.forEach(function (l) { assert(l[0] <= 50 + 1e-9 && l[2] <= 50 + 1e-9, 'line inside the crop ' + l); });
      assert(pr.lines.visible.filter(function (l) { return Math.abs(len(l) - 50) < 1e-6 && Math.abs(l[1] - l[3]) < 1e-9; }).length === 2, 'top and bottom edges clipped to 50');
      near(pr.bounds.umax, 50, 1e-9, 'bounds end at the crop');
      DR.setCrop(r.doc, id, { type: 'rect', a: [0, 0], b: [20, 50] });
      pr = r.recompute() && r.w(id).proj;
      var sweep = 0; pr.arcs.visible.forEach(function (a) { sweep += a.a1 - a.a0; near(a.r, 5, 1e-6, 'arc radius'); });
      near(sweep, 180, 1e-6, 'hole on the boundary: a half circle');
      DR.setCrop(r.doc, id, { type: 'circle', c: [80, 25], r: 10 });
      var sh = r.recompute(); pr = r.w(id).proj;
      assert(pr.circles.visible.length === 1 && pr.lines.visible.length === 0, 'circle crop: the right hole only');
      assert(DR.toDXF(sh).indexOf('CIRCLE') >= 0 && DR.toSVG(sh).length > 0, 'exports');
      DR.setCrop(r.doc, id, null);
      assert(r.recompute() && r.w(id).proj.stats.visibleLines === full.visibleLines, 'Remove Crop restores the view');
      assert(throws(function () { DR.setCrop(r.doc, id, { type: 'rect', a: [0, 0], b: [0, 5] }); }), 'a degenerate rectangle is refused');
      return 'ok';
    });
    test('rfN: Crop View of a section view clips its hatching to the rectangle', function () {
      var r = sheetOf(PLATE), sv = DR.addSectionView(r.doc, r.mesh, r.front.id, { axis: 'h', at: 25, sign: 1 });
      var w = r.recompute() && r.w(sv.id), n0 = w.hatch;
      assert(n0 > 0, 'hatched');
      var b = w.proj.bounds, mid = (b.umin + b.umax) / 2;
      DR.setCrop(r.doc, sv.id, { type: 'rect', a: [b.umin - 1, b.vmin - 1], b: [mid, b.vmax + 1] });
      var sh = r.recompute(); w = r.w(sv.id);
      assert(w.hatch > 0 && w.hatch < n0, 'fewer hatch lines ' + w.hatch + ' < ' + n0);
      var xm = w.toSheet([mid, 0])[0];
      sh.prims.forEach(function (p) { if (p.layer === w.layer && p.style === 'hatch') assert(Math.max(p.a[0], p.b[0]) <= xm + 1e-6, 'hatch inside the crop'); });
      return 'ok';
    });
    var BAR = 'p.sketch("Front").rect(0, 0, 200, 20).circle(20, 10, 4).circle(180, 10, 4).extrude(10);';
    test('rfN: Break — a 200 bar broken between u = 50 and 150 closes up to the gap, keeps its centre, the overall dimension still reads 200, holes on both sides kept; zig-zag and straight break lines; Un-Break restores', function () {
      var r = sheetOf(BAR), id = r.front.id, w0 = r.w(id), box0 = w0.box, s = w0.scale;
      var dim0 = r.sheet.dims.filter(function (d) { return d.view === id && d.kind === 'h' && Math.abs(d.value - 200) < 1e-6; })[0];
      assert(dim0, 'overall 200 dimension');
      DR.addBreak(r.doc, id, { dir: 'vertical', a: 50, b: 150, gap: 10, style: 'straight' });
      var sh = r.recompute(), w = r.w(id), box = w.box;
      near((box.x1 - box.x0), (box0.x1 - box0.x0) - (100 * s - 10), 1e-6, 'closed up to the gap');
      near((box.x0 + box.x1) / 2, (box0.x0 + box0.x1) / 2, 1e-6, 'centre kept');
      var bl = sh.prims.filter(function (p) { return p.breakLine && p.layer === w.layer; });
      assert(bl.length === 2, 'two straight break lines: ' + bl.length);
      near(Math.abs(bl[1].a[0] - bl[0].a[0]), 10, 1e-9, 'gap between the break lines');
      var lo = Math.min(bl[0].a[0], bl[1].a[0]), hi = Math.max(bl[0].a[0], bl[1].a[0]);
      sh.prims.forEach(function (p) {
        if (p.layer !== w.layer || p.breakLine || p.k !== 'line') return;
        assert(!(Math.min(p.a[0], p.b[0]) < hi - 1e-6 && Math.max(p.a[0], p.b[0]) > lo + 1e-6), 'no linework in the gap');
      });
      assert(sh.prims.filter(function (p) { return p.layer === w.layer && p.k === 'circle'; }).length === 2, 'both holes kept');
      var d = sh.dims.filter(function (x) { return x.view === id && x.kind === 'h' && Math.abs(x.value - 200) < 1e-6; })[0];
      assert(d, 'dimension across the break still 200');
      assert(sh.prims.some(function (p) { return p.k === 'text' && p.view === id && /200/.test(p.text); }), 'its text reads 200');
      // the dimension's own lines are pulled in with the view
      var dl = sh.prims.filter(function (p) { return p.view === id && p.k === 'line' && Math.abs(p.a[1] - p.b[1]) < 1e-9 && p.a[1] > box.y1; });
      assert(dl.every(function (p) { return Math.max(p.a[0], p.b[0]) <= box.x1 + 1e-6 && Math.min(p.a[0], p.b[0]) >= box.x0 - 1e-6; }), 'dimension line within the shortened view');
      // a model point right of the break maps across (picking)
      var pt = w.toSheet([180, 10]); var back = w.fromSheet(pt); near(back[0], 180, 1e-9, 'fromSheet inverts toSheet u'); near(back[1], 10, 1e-9, 'fromSheet inverts toSheet v');
      DR.addBreak(r.doc, id, { dir: 'vertical', a: 50, b: 150, gap: 10 });
      sh = r.recompute(); w = r.w(id);
      assert(sh.prims.filter(function (p) { return p.breakLine; }).length > 2, 'zig-zag break lines');
      var dxf = DR.toDXF(sh), dxf2 = DR.toDXF(sh, { version: 'R2000' }), svg = DR.toSVG(sh), pdf = DR.toPDF(sh);
      assert(dxf.length && dxf2.length && svg.length && pdf.length, 'exports');
      var doc2 = JSON.parse(JSON.stringify(r.doc));
      assert(DR.compute(doc2, r.mesh, r.model).prims.length === sh.prims.length, 'saved with the drawing');
      DR.clearBreaks(r.doc, id);
      near(r.recompute() && r.w(id).box.x1 - r.w(id).box.x0, box0.x1 - box0.x0, 1e-9, 'Un-Break restores');
      assert(throws(function () { DR.addBreak(r.doc, id, { a: 5, b: 5 }); }), 'equal break lines refused');
      return 'ok';
    });
  })();
  // --- end rfN ---

