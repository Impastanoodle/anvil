  // ------------------------------------------------------------------ drawings (drawing.js)
  // Orthographic / isometric projection with exact hidden-line removal, sheets, automatic dimensions and the
  // SVG / DXF / PDF writers. Counts are after merging collinear pieces and dropping hidden pieces under visible ones.
  group('drawings');
  var DW = typeof Drawing !== 'undefined' ? Drawing : null;
  function drawingOf(code, opts) {
    var r = build(code);
    noErrors(r);
    var doc = DW.newDrawing(r.model, Object.assign({ date: '2026-09-25' }, opts || {}));
    DW.standard3View(doc, r.mesh, r.model.units);
    r.doc = doc; r.sheet = DW.compute(doc, r.mesh, r.model);
    r.view = function (orient) { return r.sheet.views.filter(function (w) { return w.view.orient === orient; })[0]; };
    return r;
  }
  function segsStr(list) { return JSON.stringify(list.map(function (l) { return l.map(fmt); })); }
  function hasLine(list, l, tol) {
    return list.some(function (m) {
      var fw = Math.abs(m[0] - l[0]) + Math.abs(m[1] - l[1]) + Math.abs(m[2] - l[2]) + Math.abs(m[3] - l[3]);
      var bw = Math.abs(m[0] - l[2]) + Math.abs(m[1] - l[3]) + Math.abs(m[2] - l[0]) + Math.abs(m[3] - l[1]);
      return Math.min(fw, bw) < (tol || 1e-6);
    });
  }
  // Independent check of the hidden-line result: from the midpoint of every drawn piece, a ray toward the viewer
  // hits no triangle (visible) or at least one (hidden). Plain Moller-Trumbore over every triangle, no grid.
  function rayBlocked(mesh, p, e) {
    var P = mesh.positions64, eps = 1e-9;   // inclusive: a ray along a triangle's edge still counts as blocked
    var o = [p[0] + e[0] * 1e-6, p[1] + e[1] * 1e-6, p[2] + e[2] * 1e-6];
    for (var i = 0; i < P.length; i += 9) {
      var a = [P[i], P[i + 1], P[i + 2]], e1 = [P[i + 3] - a[0], P[i + 4] - a[1], P[i + 5] - a[2]], e2 = [P[i + 6] - a[0], P[i + 7] - a[1], P[i + 8] - a[2]];
      var h = V.cross(e, e2), det = V.dot(e1, h);
      if (Math.abs(det) < 1e-12) continue;
      var f = 1 / det, s = V.sub(o, a), u = f * V.dot(s, h);
      if (u < -eps || u > 1 + eps) continue;
      var q = V.cross(s, e1), v = f * V.dot(e, q);
      if (v < -eps || u + v > 1 + eps) continue;
      if (f * V.dot(e2, q) > 1e-6) return true;
    }
    return false;
  }
  // lift a 2D view point back to 3D on the mesh: the edge point is where the view ray through (u, v) meets the edge,
  // so search the edge list for the 3D segment whose projection contains the point
  function checkRays(r, orient) {
    var w = r.view(orient), O = DW.orientation(orient), edges = DW.meshEdges(r.mesh), bad = [], n = 0;
    function lift(pt, wantHidden) {
      // candidates: 3D edge pieces whose projection passes through pt; take the one nearest the viewer for visible,
      // any that is blocked for hidden
      var cands = [];
      edges.forEach(function (ed) {
        var a = [V.dot(ed.a, O.u), V.dot(ed.a, O.v)], b = [V.dot(ed.b, O.u), V.dot(ed.b, O.v)];
        var dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
        if (L < 1e-12) return;
        var t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L;
        if (t < -1e-9 || t > 1 + 1e-9) return;
        if (Math.hypot(a[0] + t * dx - pt[0], a[1] + t * dy - pt[1]) > 1e-6) return;
        cands.push(V.add(ed.a, V.scale(V.sub(ed.b, ed.a), t)));
      });
      if (!cands.length) return 'no edge under the drawn point';
      var blocked = cands.map(function (c) { return rayBlocked(r.mesh, c, O.e); });
      if (wantHidden) return blocked.some(Boolean) ? null : 'drawn hidden but every edge under it is visible';
      return blocked.some(function (b) { return !b; }) ? null : 'drawn visible but blocked';
    }
    [['visible', false], ['hidden', true]].forEach(function (c) {
      w.proj.lines[c[0]].forEach(function (l) {
        [0.25, 0.5, 0.75].forEach(function (t) {
          var pt = [l[0] + (l[2] - l[0]) * t, l[1] + (l[3] - l[1]) * t], m = lift(pt, c[1]); n++;
          if (m) bad.push(orient + ' ' + c[0] + ' ' + segsStr([l]) + ': ' + m);
        });
      });
    });
    return { bad: bad, n: n };
  }
  if (!DW) test('drawing.js loads', function () { fail('Drawing is not defined'); });
  else {
    test('orientations: u x v = e; Front / Top / Right match the sketch frames', function () {
      DW.ORIENTS.forEach(function (name) {
        var o = DW.orientation(name);
        nearVec(V.cross(o.u, o.v), o.e, 1e-12, name + ' uxv');
        near(V.len(o.u), 1, 1e-12); near(V.len(o.v), 1, 1e-12); near(V.dot(o.u, o.v), 0, 1e-12);
      });
      ['Front', 'Top', 'Right'].forEach(function (name) {
        var o = DW.orientation(name), pl = K.STD_PLANES ? K.makePlane(name, 0) : null;
        if (pl) { nearVec(o.u, pl.x, 1e-12, name + '.u'); nearVec(o.v, pl.y, 1e-12, name + '.v'); nearVec(o.e, pl.n, 1e-12, name + '.e'); }
      });
      var iso = DW.orientation('Isometric');
      nearVec(iso.e, V.norm([1, 1, 1]), 1e-12, 'iso e'); nearVec(iso.u, V.norm([1, 0, -1]), 1e-12, 'iso u');
      return DW.ORIENTS.length + ' orientations';
    });
    test('box 40x20x10: each ortho view is a rectangle of 4 visible lines; the isometric has 9 visible and 3 hidden edges', function () {
      var r = build('p.box(40, 20, 10);');
      var f = DW.projectView(r.mesh, 'Front'), t = DW.projectView(r.mesh, 'Top'), s = DW.projectView(r.mesh, 'Right'), iso = DW.projectView(r.mesh, 'Isometric');
      [[f, 40, 10], [t, 40, 20], [s, 20, 10]].forEach(function (c) {
        assert(c[0].stats.visibleLines === 4 && c[0].stats.hiddenLines === 0, c[0].orient + ' ' + JSON.stringify(c[0].stats));
        near(c[0].bounds.umax - c[0].bounds.umin, c[1], 1e-9, c[0].orient + ' width'); near(c[0].bounds.vmax - c[0].bounds.vmin, c[2], 1e-9, c[0].orient + ' height');
      });
      assert(iso.stats.visibleLines === 9 && iso.stats.hiddenLines === 3, 'iso ' + JSON.stringify(iso.stats));
      var hlr = DW.projectView(r.mesh, 'Isometric', { display: 'hlr' });
      assert(hlr.stats.visibleLines === 9 && hlr.stats.hiddenLines === 0, 'iso HLR ' + JSON.stringify(hlr.stats));
      // the three hidden edges meet at the back corner (0, 0, 0) -> (0, 0) in the view
      iso.lines.hidden.forEach(function (l) { assert(Math.hypot(l[0], l[1]) < 1e-9 || Math.hypot(l[2], l[3]) < 1e-9, 'hidden edge not at the back corner ' + segsStr([l])); });
      return 'iso 9 + 3 hidden';
    });
    test('blind \u00d810 hole 8 deep: Front view shows two hidden walls and the hidden bottom; Top view one circle', function () {
      var r = build('p.box(40, 40, 20); p.hole("Top", 20, -20, 10, { offset: 20, depth: 8 });');
      noErrors(r);
      var f = DW.projectView(r.mesh, 'Front'), t = DW.projectView(r.mesh, 'Top');
      assert(f.stats.visibleLines === 4 && f.stats.hiddenLines === 3, 'front ' + JSON.stringify(f.stats) + ' hidden ' + segsStr(f.lines.hidden));
      assert(hasLine(f.lines.hidden, [15, 12, 15, 20]) && hasLine(f.lines.hidden, [25, 12, 25, 20]) && hasLine(f.lines.hidden, [15, 12, 25, 12]), 'hidden ' + segsStr(f.lines.hidden));
      assert(t.stats.visibleLines === 4 && t.stats.visibleCircles === 1 && t.stats.hiddenLines === 0 && t.stats.hiddenCircles === 0, 'top ' + JSON.stringify(t.stats));
      near(t.circles.visible[0].r, 5, 1e-9, 'r'); nearVec(t.circles.visible[0].c.concat([0]), [20, -20, 0], 1e-9, 'centre');
      return 'front 4 + 3 hidden';
    });
    test('partial occlusion: a post behind a lower wall is split into visible and hidden pieces at the wall top', function () {
      var r = build('p.box(40, 40, 10); p.box(40, 5, 30, { at: [0, 0, 35] }); p.box(10, 5, 30, { at: [15, 10, 0] });');
      var f = DW.projectView(r.mesh, 'Front');
      assert(f.stats.visibleLines === 7 && f.stats.hiddenLines === 3, JSON.stringify(f.stats) + ' visible ' + segsStr(f.lines.visible) + ' hidden ' + segsStr(f.lines.hidden));
      [[15, 30, 15, 40], [25, 30, 25, 40], [15, 40, 25, 40]].forEach(function (l) { assert(hasLine(f.lines.visible, l), 'visible ' + l); });
      [[15, 10, 15, 30], [25, 10, 25, 30], [0, 10, 40, 10]].forEach(function (l) { assert(hasLine(f.lines.hidden, l), 'hidden ' + l); });
      return '7 visible, 3 hidden';
    });
    test('silhouettes of curved faces: Bushing front view shows the \u00d830 / \u00d836 outlines and the hidden \u00d820 bore', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Bushing'; })[0];
      var r = build(ex.code), f = DW.projectView(r.mesh, 'Front'), t = DW.projectView(r.mesh, 'Top');
      near(f.bounds.umax - f.bounds.umin, 36, 1e-9, 'width'); near(f.bounds.vmax - f.bounds.vmin, 25, 1e-9, 'height');
      [[15, 0, 15, 21], [-15, 0, -15, 21], [18, 21, 18, 25], [-18, 21, -18, 25]].forEach(function (l) { assert(hasLine(f.lines.visible, l, 1e-6), 'silhouette ' + l + ' in ' + segsStr(f.lines.visible)); });
      assert(f.stats.hiddenLines === 2 && hasLine(f.lines.hidden, [10, 0, 10, 25]) && hasLine(f.lines.hidden, [-10, 0, -10, 25]), 'bore ' + segsStr(f.lines.hidden));
      assert(f.stats.visibleLines === 7, 'front visible ' + f.stats.visibleLines);
      var rv = t.circles.visible.map(function (c) { return fmt(c.r); }).sort(), rh = t.circles.hidden.map(function (c) { return fmt(c.r); });
      assert(JSON.stringify(rv) === '[10,18]' && JSON.stringify(rh) === '[15]', 'top circles visible ' + rv + ' hidden ' + rh);
      return 'front 7 + 2 hidden; top \u00d836 \u00d820 visible, \u00d830 hidden';
    });
    test('Design Library "Plate with bolt holes": view extents, hidden-edge counts, circles and model dimensions', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Plate with bolt holes'; })[0];
      var r = drawingOf(ex.code);
      var F = r.view('Front'), T = r.view('Top'), R = r.view('Right'), I = r.view('Isometric');
      function ext(w) { var b = w.proj.bounds; return [fmt(b.umax - b.umin), fmt(b.vmax - b.vmin)]; }
      assert(JSON.stringify(ext(F)) === '[100,8]' && JSON.stringify(ext(T)) === '[100,60]' && JSON.stringify(ext(R)) === '[60,8]', 'extents ' + JSON.stringify([ext(F), ext(T), ext(R)]));
      // isometric extents from the 8 corners of the 100 x 8 x 60 block
      var O = DW.orientation('Isometric'), us = [], vs = [];
      [0, 100].forEach(function (x) { [0, 8].forEach(function (y) { [0, 60].forEach(function (z) { us.push(V.dot([x, y, z], O.u)); vs.push(V.dot([x, y, z], O.v)); }); }); });
      near(I.proj.bounds.umax - I.proj.bounds.umin, Math.max.apply(null, us) - Math.min.apply(null, us), 1e-9, 'iso width');
      near(I.proj.bounds.vmax - I.proj.bounds.vmin, Math.max.apply(null, vs) - Math.min.apply(null, vs), 1e-9, 'iso height');
      // Front: 4 outline lines; each hole's two silhouettes are hidden (both rows of holes project onto the same lines)
      assert(F.proj.stats.visibleLines === 4 && F.proj.stats.hiddenLines === 4, 'front ' + JSON.stringify(F.proj.stats));
      [6, 14, 86, 94].forEach(function (x) { assert(hasLine(F.proj.lines.hidden, [x, 0, x, 8]), 'front hidden x=' + x); });
      assert(R.proj.stats.visibleLines === 4 && R.proj.stats.hiddenLines === 4, 'right ' + JSON.stringify(R.proj.stats));
      [-6, -14, -46, -54].forEach(function (u) { assert(hasLine(R.proj.lines.hidden, [u, 0, u, 8]), 'right hidden u=' + u); });
      assert(T.proj.stats.visibleLines === 4 && T.proj.stats.visibleCircles === 4 && T.proj.stats.hiddenLines === 0 && T.proj.stats.hiddenCircles === 0, 'top ' + JSON.stringify(T.proj.stats));
      T.proj.circles.visible.forEach(function (c) { near(c.r, 4, 1e-9, 'hole r'); assert([10, 90].some(function (x) { return Math.abs(c.c[0] - x) < 1e-9; }) && [-10, -50].some(function (v) { return Math.abs(c.c[1] - v) < 1e-9; }), 'hole at ' + c.c); });
      assert(I.view.display === 'hlr' && I.proj.stats.hiddenLines === 0, 'isometric is hidden-lines-removed');
      // sheet: A3, automatic scale 2:1, third angle (Top above Front, Right beside it, aligned)
      assert(r.doc.sheet.format === 'A3' && DW.scaleText(r.doc.sheet.scale) === '2:1', 'sheet ' + JSON.stringify(r.doc.sheet));
      near(T.view.x, F.view.x, 1e-9, 'Top aligned with Front'); near(R.view.y, F.view.y, 1e-9, 'Right level with Front');
      assert(T.view.y > F.view.y && R.view.x > F.view.x, 'third-angle placement');
      near(T.box.x1 - T.box.x0, 200, 1e-9, 'Top view is 200 mm wide at 2:1');
      var texts = r.sheet.dims.map(function (d) { return d.text; });
      assert(JSON.stringify(texts) === JSON.stringify(['100', '8', '60', '4X \u00d88']), 'dims ' + JSON.stringify(texts));
      return 'Front 4+4 hidden, Top 4 + 4 circles, Right 4+4 hidden; dims ' + texts.join(', ');
    });
    test('hidden-line result agrees with an independent ray cast (plate, bushing, L-bracket, blind hole; all four views)', function () {
      var codes = ['Plate with bolt holes', 'Bushing', 'L-bracket'].map(function (n) { return AnvilExamples.filter(function (e) { return e.name === n; })[0].code; });
      codes.push('p.box(40, 40, 20); p.hole("Top", 20, -20, 10, { offset: 20, depth: 8 });');
      var bad = [], n = 0;
      codes.forEach(function (code) {
        var r = drawingOf(code);
        ['Front', 'Top', 'Right', 'Isometric'].forEach(function (o) {
          r.view(o).view.display = 'hlv';
          r.sheet = DW.compute(r.doc, r.mesh, r.model);
          var c = checkRays(r, o); n += c.n; bad = bad.concat(c.bad);
        });
      });
      assert(!bad.length, bad.length + ' of ' + n + ': ' + bad.slice(0, 4).join(' | '));
      return n + ' sample points agree';
    });
    test('first-angle projection puts Top below Front and Right to its left; sheet size and scale are honoured', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Plate with bolt holes'; })[0];
      var r = drawingOf(ex.code, { projection: 'first', format: 'A2', scale: [1, 1] });
      var F = r.view('Front'), T = r.view('Top'), R = r.view('Right');
      assert(T.view.y < F.view.y && R.view.x < F.view.x, 'first-angle placement');
      near(T.view.x, F.view.x, 1e-9); near(R.view.y, F.view.y, 1e-9);
      assert(JSON.stringify(r.sheet.size) === '[594,420]', 'A2 ' + r.sheet.size);
      near(F.box.x1 - F.box.x0, 100, 1e-9, '1:1 width');
      // views stay inside the sheet border, above the title block
      r.sheet.views.forEach(function (w) { assert(w.box.x0 > 10 && w.box.x1 < 584 && w.box.y0 > 50 && w.box.y1 < 410, w.view.orient + ' box ' + JSON.stringify(w.box)); });
      var title = r.sheet.prims.filter(function (p) { return p.k === 'text'; }).map(function (p) { return p.text; });
      ['PLATE', 'FIRST ANGLE', '1:1', '2026-09-25', 'MM'].forEach(function (s) { assert(title.indexOf(s) >= 0, 'title block lacks ' + s); });
      return 'Top below, Right left';
    });
    test('an inch part gets an ANSI B sheet in inches', function () {
      var r = drawingOf('p.units("in"); p.box(4, 2, 1);');
      assert(r.doc.sheet.format === 'ANSI B' && r.sheet.units === 'in', r.doc.sheet.format);
      near(r.sheet.size[0], 17, 1e-9); near(r.sheet.size[1], 11, 1e-9);
      var dims = r.sheet.dims.map(function (d) { return d.text; });
      assert(JSON.stringify(dims) === '["4.000","1.000","2.000"]', JSON.stringify(dims));   // ANSI inch: three places, trailing zeros kept (r16/p9-drawing)
      return DW.scaleText(r.doc.sheet.scale);
    });
    test('SVG: well-formed, real sheet size, one dashed element per hidden line or circle', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Plate with bolt holes'; })[0];
      var r = drawingOf(ex.code), svg = DW.toSVG(r.sheet);
      var d = new DOMParser().parseFromString(svg, 'image/svg+xml');
      assert(!d.querySelector('parsererror'), 'parse error');
      var root = d.documentElement;
      assert(root.getAttribute('width') === '420mm' && root.getAttribute('height') === '297mm' && root.getAttribute('viewBox') === '0 0 420 297', 'size');
      var hidden = r.sheet.prims.filter(function (p) { return p.style === 'hidden'; }).length;
      assert(hidden === 8 && d.querySelectorAll('[stroke-dasharray]').length === hidden, 'dashed ' + d.querySelectorAll('[stroke-dasharray]').length + ' vs ' + hidden);
      assert(d.querySelectorAll('g[data-layer="TOP"] circle').length === 4, 'top circles');
      assert(Array.prototype.some.call(d.querySelectorAll('text'), function (t) { return t.textContent === '4X \u00d88'; }), 'hole callout');
      return (svg.length / 1024).toFixed(1) + ' KB';
    });
    test('DXF: one layer per view, HIDDEN linetype on hidden edges, CIRCLE entities for holes, sheet in paper mm', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Plate with bolt holes'; })[0];
      var r = drawingOf(ex.code), dxf = DW.toDXF(r.sheet), L = dxf.split('\n');
      assert(L.length % 2 === 0 && L[L.length - 1] === 'EOF', 'pairs / EOF');
      var ents = [], cur = null, layers = [], inEnt = false;
      for (var i = 0; i < L.length; i += 2) {
        var c = L[i].trim(), v = L[i + 1];
        if (c === '2' && v === 'ENTITIES') inEnt = true;
        if (c === '0') { cur = inEnt ? { type: v } : null; if (cur) ents.push(cur); if (v === 'LAYER') layers.push(null); }
        if (c === '2' && layers.length && layers[layers.length - 1] === null && !inEnt) layers[layers.length - 1] = v;
        if (cur && c === '8') cur.layer = v;
        if (cur && c === '6') cur.ltype = v;
      }
      ['FRONT', 'TOP', 'RIGHT', 'ISOMETRIC', 'DIMENSIONS', 'SHEET'].forEach(function (n) { assert(layers.indexOf(n) >= 0, 'layer ' + n + ' in ' + layers); });
      var hid = ents.filter(function (e) { return e.ltype === 'HIDDEN'; });
      assert(hid.length === 8 && hid.every(function (e) { return e.layer === 'FRONT' || e.layer === 'RIGHT'; }), 'hidden ' + hid.length);
      assert(ents.filter(function (e) { return e.type === 'CIRCLE' && e.layer === 'TOP'; }).length === 4, 'circles');
      assert(dxf.indexOf('%%c8') > 0 && dxf.indexOf('$INSUNITS\n70\n4') > 0, 'diameter text / units');
      assert(dxf.indexOf('$DIMALTF\n40\n0.0393700787') > 0, 'DIMALTF for mm (rfDU)');
      return ents.length + ' entities, layers ' + layers.join(' ');
    });
    test('PDF: header, xref offsets point at their objects, page is A3 in points, ASCII only', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Plate with bolt holes'; })[0];
      var r = drawingOf(ex.code), pdf = DW.toPDF(r.sheet);
      assert(pdf.indexOf('%PDF-1.4') === 0 && /%%EOF\n$/.test(pdf), 'header/trailer');
      assert(!/[^\x00-\x7f]/.test(pdf), 'non-ASCII byte');
      var sx = +/startxref\n(\d+)/.exec(pdf)[1];
      assert(pdf.substr(sx, 4) === 'xref', 'startxref');
      var offs = pdf.substr(sx).split('\n').slice(3, 8).map(function (l) { return +l.substr(0, 10); });
      offs.forEach(function (o, i) { assert(pdf.substr(o, String(i + 1).length + 6) === (i + 1) + ' 0 obj', 'object ' + (i + 1) + ' offset'); });
      assert(pdf.indexOf('/MediaBox [0 0 1190.5512 841.8898]') > 0, 'A3 media box');
      var len = +/\/Length (\d+) >>\nstream\n/.exec(pdf)[1], st = pdf.indexOf('stream\n') + 7;
      assert(pdf.substr(st + len, 10) === '\nendstream', 'stream length');
      assert(pdf.indexOf('(4X \\3308) Tj') > 0, 'hole callout as WinAnsi');
      assert((pdf.match(/\] 0 d/g) || []).length >= 2, 'dash pattern switched for hidden lines');
      return (pdf.length / 1024).toFixed(1) + ' KB';
    });
    test('moveView keeps projected views aligned; a suppressed model dimension stays hidden', function () {
      var r = drawingOf('p.box(40, 20, 10); p.hole("Top", 20, -10, 6, { offset: 10 });');
      var F = r.view('Front').view, T = r.view('Top').view, R = r.view('Right').view;
      var tx = T.x, ry = R.y;
      DW.moveView(r.doc, T.id, T.x + 30, T.y + 5); near(T.x, tx, 1e-12, 'Top x locked'); near(T.y, r.view('Top').view.y, 1e-12);
      DW.moveView(r.doc, R.id, R.x + 5, R.y + 30); near(R.y, ry, 1e-12, 'Right y locked');
      var fx = F.x, ty = T.y;
      DW.moveView(r.doc, F.id, F.x + 10, F.y - 7); near(T.x, fx + 10, 1e-12, 'Top follows Front'); near(T.y, ty - 7, 1e-12);
      assert(r.doc.layout === 'manual', 'layout manual after a drag');
      var sh = DW.compute(r.doc, r.mesh, r.model), dia = sh.dims.filter(function (d) { return d.kind === 'dia'; })[0];
      assert(dia && dia.text === '\u00d86', 'dia dim ' + (dia && dia.text));
      r.doc.suppressed = [dia.key];
      sh = DW.compute(r.doc, r.mesh, r.model);
      assert(!sh.dims.some(function (d) { return d.kind === 'dia'; }), 'suppressed');
      return sh.dims.map(function (d) { return d.text; }).join(', ');
    });
    test('every Design Library part example draws (Standard 3 View + Isometric) with extents equal to its bounding box; assembly examples are skipped', function () {
      var out = [], skipped = [];
      AnvilExamples.forEach(function (ex) {
        if (isAsmExample(ex)) { skipped.push(ex.name); return; }   // drawings are made from parts only
        var r = drawingOf(ex.code), bb = r.mp.bbox;
        var F = r.view('Front').proj.bounds, T = r.view('Top').proj.bounds;
        near(F.umax - F.umin, bb.max[0] - bb.min[0], 1e-6, ex.name + ' front width'); near(F.vmax - F.vmin, bb.max[1] - bb.min[1], 1e-6, ex.name + ' front height');
        near(T.vmax - T.vmin, bb.max[2] - bb.min[2], 1e-6, ex.name + ' top depth');
        assert(r.sheet.views.every(function (w) { return w.proj.lines.visible.length + w.proj.circles.visible.length > 0; }), ex.name + ': a view is empty');
        out.push(ex.name.split(' ')[0] + ' ' + DW.scaleText(r.doc.sheet.scale));
      });
      return out.join(', ') + (skipped.length ? '; skipped assemblies: ' + skipped.join(', ') : '');
    });

    // ---------------------------------------------------------------- Projected, Section and Detail views, dimensions that follow the part
    group('drawing views');
    var PLATE = AnvilExamples.filter(function (e) { return e.name === 'Plate with bolt holes'; })[0].code;
    function viewRec(r, id) { return r.sheet.views.filter(function (w) { return w.view.id === id; })[0]; }
    function recompute(r) { r.sheet = DW.compute(r.doc, r.mesh, r.model); return r.sheet; }
    function frameEq(F, G, what) { nearVec(F.e, G.e, 1e-12, what + ' e'); nearVec(F.u, G.u, 1e-12, what + ' u'); nearVec(F.v, G.v, 1e-12, what + ' v'); }
    test('projected frames: Front + up / down / left / right = Top / Bottom / Left / Right in third angle, mirrored in first angle; u x v = e from any parent', function () {
      var Fr = DW.orientation('Front');
      [['up', 'Top'], ['down', 'Bottom'], ['left', 'Left'], ['right', 'Right']].forEach(function (c) {
        var F = DW.projectedFrame(Fr, c[0], 'third');
        assert(F.name === c[1], c[0] + ' -> ' + F.name); frameEq(F, DW.orientation(c[1]), c[0]);
      });
      [['up', 'Bottom'], ['down', 'Top'], ['left', 'Right'], ['right', 'Left']].forEach(function (c) { assert(DW.projectedFrame(Fr, c[0], 'first').name === c[1], 'first angle ' + c[0]); });
      // folding up from Top shows the back upside down (a true projection, not the Back standard view)
      var tu = DW.projectedFrame(DW.orientation('Top'), 'up', 'third'), bk = DW.orientation('Back');
      assert(tu.name === 'Projected', 'Top + up is ' + tu.name); nearVec(tu.e, bk.e, 1e-12, 'Top + up looks from the back'); nearVec(tu.u, V.scale(bk.u, -1), 1e-12, 'turned 180');
      assert(DW.projectedFrame(DW.orientation('Right'), 'right', 'third').name === 'Back', 'Right + right = Back');
      DW.ORIENTS.forEach(function (n) {
        ['up', 'down', 'left', 'right'].forEach(function (d) {
          var F = DW.projectedFrame(DW.orientation(n), d, 'third');
          nearVec(V.cross(F.u, F.v), F.e, 1e-12, n + ' ' + d);
          near(V.len(F.e), 1, 1e-12); near(V.dot(F.u, F.v), 0, 1e-12);
        });
      });
      return '4 x ' + DW.ORIENTS.length + ' frames right-handed';
    });
    test('Projected View: a Bottom view below Front and a Back view right of Right are aligned (same x span / y span), slide only along the projection and follow the parent', function () {
      var r = drawingOf(PLATE), F = r.view('Front').view, R = r.view('Right').view;
      var B = DW.addProjectedView(r.doc, r.mesh, F.id, 'down'), K2 = DW.addProjectedView(r.doc, r.mesh, R.id, 'right');
      assert(B.orient === 'Bottom' && B.kind === 'projected' && B.align === 'x' && K2.orient === 'Back' && K2.align === 'y', B.orient + ' ' + K2.orient);
      recompute(r);
      var wb = viewRec(r, B.id), wf = viewRec(r, F.id), wk = viewRec(r, K2.id), wr = viewRec(r, R.id);
      near(wb.box.x0, wf.box.x0, 1e-9, 'Bottom x0'); near(wb.box.x1, wf.box.x1, 1e-9, 'Bottom x1');
      near(wk.box.y0, wr.box.y0, 1e-9, 'Back y0'); near(wk.box.y1, wr.box.y1, 1e-9, 'Back y1');
      assert(wb.box.y1 < wf.box.y0 && wk.box.x0 > wr.box.x1, 'placed below / beside');
      near(wb.box.x1 - wb.box.x0, 200, 1e-9, 'Bottom width at 2:1'); near(wb.box.y1 - wb.box.y0, 120, 1e-9, 'Bottom depth at 2:1');
      assert(wb.proj.stats.visibleCircles === 4 && wk.proj.stats.hiddenLines === 4, 'content ' + JSON.stringify([wb.proj.stats, wk.proj.stats]));
      var bx = B.x; DW.moveView(r.doc, B.id, B.x + 40, B.y - 10); near(B.x, bx, 1e-12, 'Bottom slides vertically only');
      var fx = F.x, by = B.y, ky = K2.y; DW.moveView(r.doc, F.id, fx + 7, F.y + 3);
      near(B.x, bx + 7, 1e-12, 'Bottom follows Front'); near(B.y, by + 3, 1e-12);
      near(K2.y, ky + 3, 1e-12, 'Back follows Right, which follows Front');
      recompute(r);
      near(viewRec(r, B.id).box.x0, viewRec(r, F.id).box.x0, 1e-9, 'still aligned after the moves');
      // a new sheet scale re-lays out the standard views: the projected ones follow and stay aligned
      r.doc.sheet.scale = [1, 1]; r.doc.sheet.autoScale = false; DW.layout(r.doc, r.mesh, 'mm'); recompute(r);
      near(B.x, F.x, 1e-12, 'Bottom under Front after the layout'); near(K2.y, R.y, 1e-12, 'Back level with Right');
      near(viewRec(r, B.id).box.x1 - viewRec(r, B.id).box.x0, 100, 1e-9, '1:1');
      return 'Bottom under Front, Back beside Right';
    });
    test('section areas are exact: box, plate through its four holes, bushing annulus and axial section, two-body clamp (one cap per body)', function () {
      var bx = build('p.box(40, 20, 10);'), S = DW.sectionOf(bx.mesh, [0, 1, 0], 5);
      near(S.area, 800, 1e-9, 'box y=5'); near(K.massProps(S.mesh, 1).volume, 4000, 1e-9, 'box kept half');
      var pl = build(PLATE);
      S = DW.sectionOf(pl.mesh, [0, 1, 0], 4);
      nearRel(S.area, 6000 - 4 * polyCircleArea(4), 1e-12, 'plate through the holes');
      assert(S.caps.length === 1, 'one cap face');
      near(DW.sectionOf(pl.mesh, [1, 0, 0], 50).area, 480, 1e-9, 'plate x=50');
      near(DW.sectionOf(pl.mesh, [-1, 0, 0], -50).area, 480, 1e-9, 'plate x=50 seen from the other side');
      // dV/dc = A where the part is prismatic along the cut direction: an independent check of the cap area
      var v1 = K.massProps(DW.sectionOf(pl.mesh, [0, 1, 0], 1).mesh, 1).volume, v7 = K.massProps(DW.sectionOf(pl.mesh, [0, 1, 0], 7).mesh, 1).volume;
      // (massProps volumes are exact since true curves: the slope is the exact section, the holes true circles)
      nearRel((v7 - v1) / 6, 6000 - 4 * circleArea(4), 1e-12, 'volume slope');
      var bu = build(AnvilExamples.filter(function (e) { return e.name === 'Bushing'; })[0].code);
      var ann = 24 * Math.sin(2 * Math.PI / 48) * (15 * 15 - 10 * 10);   // revolves are 48-gons
      nearRel(DW.sectionOf(bu.mesh, [0, 1, 0], 10).area, ann, 1e-12, 'bushing annulus');
      var ax = DW.sectionOf(bu.mesh, [1, 0, 0], 0);
      near(ax.area, 2 * (5 * 21 + 8 * 4), 1e-9, 'bushing through its axis = twice the profile');
      assert(ax.caps.length === 1, 'the two walls are one cap face');
      var tb = build(AnvilExamples.filter(function (e) { return e.name === 'Two-body clamp'; })[0].code), bb = tb.mp.bbox;
      var tS = DW.sectionOf(tb.mesh, [0, 0, 1], (bb.min[2] + bb.max[2]) / 2);
      assert(JSON.stringify(tS.caps.map(function (i) { return tS.mesh.faces[i].body; })) === '[0,1]', 'caps per body');
      assert(DW.sectionOf(pl.mesh, [0, 1, 0], 100).area === 0 && DW.sectionOf(pl.mesh, [0, 1, 0], -1).mesh.triCount === 0, 'planes that miss the part');
      return 'plate ' + fmt(S.area) + ', bushing ' + fmt(ann) + ' / 274';
    });
    test('Section View A-A: cutting line on Front, aligned view looking down at the cut, 4 hole circles, 45 degree hatch inside the cut face only, arrows and labels', function () {
      var r = drawingOf(PLATE), F = r.view('Front').view;
      var S = DW.addSectionView(r.doc, r.mesh, F.id, { axis: 'h', at: 4, sign: 1 });
      assert(S.label === 'A' && S.name === 'Section View A-A' && S.orient === 'Top' && S.align === 'x', JSON.stringify([S.label, S.name, S.orient]));
      recompute(r);
      var w = viewRec(r, S.id), wf = viewRec(r, F.id);
      near(w.box.x0, wf.box.x0, 1e-9, 'aligned with Front'); near(w.box.x1, wf.box.x1, 1e-9);
      assert(w.box.y0 > wf.box.y1, 'third angle: above the Front view (the viewer side)');
      assert(w.layer === 'SECTION_A' && w.proj.stats.visibleCircles === 4 && w.proj.stats.visibleLines === 4, JSON.stringify(w.proj.stats));
      w.proj.circles.visible.forEach(function (c) { near(c.r, 4, 1e-9, 'hole'); });
      nearRel(w.section.area, 6000 - 4 * polyCircleArea(4), 1e-12, 'area');
      // hatching: every line at 45 degrees, inside the plate outline and outside every hole, total length ~ area / spacing
      var hatch = r.sheet.prims.filter(function (p) { return p.layer === 'SECTION_A' && p.style === 'hatch'; }), len = 0;
      assert(hatch.length === w.hatch && hatch.length > 50, 'hatch lines ' + hatch.length);
      var holes = w.proj.circles.visible.map(function (c) { return c.c; });
      hatch.forEach(function (h) {
        var dx = h.b[0] - h.a[0], dy = h.b[1] - h.a[1], L = Math.hypot(dx, dy);
        near(Math.abs(dx / L), Math.SQRT1_2, 1e-9, '45 deg'); near(dx * dy > 0 ? 1 : 0, 1, 0, 'rising');
        len += L;
        [0.1, 0.5, 0.9].forEach(function (t) {
          var m = w.fromSheet([h.a[0] + dx * t, h.a[1] + dy * t]);
          assert(m[0] > -1e-9 && m[0] < 100 + 1e-9 && m[1] < 1e-9 && m[1] > -60 - 1e-9, 'hatch outside the plate ' + m);
          holes.forEach(function (c) { assert(Math.hypot(m[0] - c[0], m[1] - c[1]) > 4 * Math.cos(Math.PI / 16) - 1e-9, 'hatch inside a hole ' + m); });
        });
      });
      nearRel(len * 2.5, w.section.area * 4, 0.02, 'hatched length x spacing = paper area');
      // cutting line on the Front view: chain line through y = 4 past both sides, arrows pointing down (toward the part), letters A
      var cut = r.sheet.prims.filter(function (p) { return p.layer === 'FRONT' && p.style === 'chain'; });
      assert(cut.length === 1, 'chain lines ' + cut.length);
      var y = wf.toSheet([0, 4])[1];
      near(cut[0].a[1], y, 1e-9); near(cut[0].b[1], y, 1e-9);
      assert(Math.min(cut[0].a[0], cut[0].b[0]) < wf.box.x0 && Math.max(cut[0].a[0], cut[0].b[0]) > wf.box.x1, 'line runs past the view');
      var arrows = r.sheet.prims.filter(function (p) { return p.layer === 'FRONT' && p.k === 'fill'; });
      assert(arrows.length === 2 && arrows.every(function (a) { return a.pts[0][1] < a.pts[1][1] && a.pts[0][1] < y; }), 'arrows point down, away from the view above');
      var txt = r.sheet.prims.filter(function (p) { return p.k === 'text'; });
      assert(txt.filter(function (t) { return t.layer === 'FRONT' && t.text === 'A'; }).length === 2, 'letters A');
      assert(txt.some(function (t) { return t.layer === 'SECTION_A' && t.text === 'SECTION A-A'; }), 'view label');
      assert(!r.sheet.dims.some(function (d) { return d.view === S.id; }), 'model items stay on the standard views');
      return hatch.length + ' hatch lines, area ' + fmt(w.section.area);
    });
    test('section views agree with an independent ray cast; a vertical cut through two holes; sign flips the side; first angle places it on the arrow side', function () {
      var r = drawingOf(PLATE), F = r.view('Front').view, T = r.view('Top').view;
      var S = DW.addSectionView(r.doc, r.mesh, F.id, { axis: 'v', at: 10, sign: -1 });
      assert(S.orient === 'Left' && S.align === 'y', S.orient);
      S.display = 'hlv';
      recompute(r);
      var w = viewRec(r, S.id), wt = viewRec(r, F.id);
      assert(w.box.x1 < wt.box.x0, 'viewer on the left: view left of Front');
      near(w.box.y0, wt.box.y0, 1e-9, 'level with Front'); near(w.box.y1, wt.box.y1, 1e-9);
      void T;
      near(w.section.area, 60 * 8 - 2 * 8 * 8, 1e-9, 'x = 10 through two hole axes (a 16-gon vertex lies on the plane)');
      var c = checkRays({ mesh: w.section.mesh, view: function () { return w; } }, 'Left');
      assert(!c.bad.length, c.bad.slice(0, 3).join(' | '));
      var arrows = r.sheet.prims.filter(function (p) { return p.layer === 'FRONT' && p.k === 'fill'; });
      assert(arrows.length === 2 && arrows.every(function (a) { return a.pts[0][0] > a.pts[1][0]; }), 'arrows point right (line of sight)');
      var r2 = drawingOf(PLATE, { projection: 'first' }), F2 = r2.view('Front').view;
      var S2 = DW.addSectionView(r2.doc, r2.mesh, F2.id, { axis: 'h', at: 4, sign: 1 });
      recompute(r2);
      assert(viewRec(r2, S2.id).box.y1 < viewRec(r2, F2.id).box.y0, 'first angle: below the parent');
      return c.n + ' ray samples agree';
    });
    test('Detail View: twice the parent scale, lines clipped to the circle, a cut circle becomes an arc, circle and letter on the parent, DETAIL A / SCALE 4 : 1', function () {
      var r = drawingOf(PLATE), T = r.view('Top').view;
      assert(JSON.stringify(DW.detailScale([2, 1])) === '[4,1]' && JSON.stringify(DW.detailScale([1, 2])) === '[1,1]' && JSON.stringify(DW.detailScale([1, 5])) === '[1,2.5]', 'detail scales');
      var Dv = DW.addDetailView(r.doc, r.mesh, T.id, { c: [10, -10], r: 12, x: 330, y: 120 });
      assert(Dv.label === 'A' && DW.scaleText(Dv.scale) === '4:1' && Dv.name === 'Detail View A (4 : 1)', Dv.name);
      var Dv2 = DW.addDetailView(r.doc, r.mesh, T.id, { c: [14, -10], r: 3, x: 330, y: 60, label: 'C' });
      recompute(r);
      var w = viewRec(r, Dv.id), w2 = viewRec(r, Dv2.id);
      near(w.scale, 4, 0); near(w.box.x1 - w.box.x0, 96, 1e-9, 'box = 2r x 4');
      assert(w.proj.stats.visibleCircles === 1 && w.proj.stats.visibleLines === 2, JSON.stringify(w.proj.stats));
      var circ = r.sheet.prims.filter(function (p) { return p.layer === 'DETAIL_A' && p.k === 'circle'; });
      assert(circ.length === 1, 'circles'); near(circ[0].r, 16, 1e-9, 'hole r 4 at 4:1'); nearVec(circ[0].c.concat(0), [330, 120, 0], 1e-9, 'centred');
      r.sheet.prims.filter(function (p) { return p.layer === 'DETAIL_A' && p.k === 'line'; }).forEach(function (l) {
        [l.a, l.b].forEach(function (q) { assert(Math.hypot(q[0] - 330, q[1] - 120) <= 48 + 1e-9, 'line leaves the detail circle'); });
      });
      // the plate corner edges u = 0 and v = 0 each clipped to a chord of the circle
      w.proj.lines.visible.forEach(function (l) { near(Math.hypot(l[2] - l[0], l[3] - l[1]), 2 * Math.sqrt(144 - 100), 1e-9, 'chord'); });
      var arcs = r.sheet.prims.filter(function (p) { return p.layer === 'DETAIL_C' && p.k === 'arc'; });
      assert(arcs.length === 1 && w2.proj.stats.visibleCircles === 0, 'arc ' + JSON.stringify(w2.proj.stats));
      var a = arcs[0], a0 = a.a0 * Math.PI / 180, a1 = a.a1 * Math.PI / 180, cc = w2.toSheet([14, -10]);
      near(a.r, 16, 1e-9);
      [a0, a1].forEach(function (t) { near(Math.hypot(a.c[0] + a.r * Math.cos(t) - cc[0], a.c[1] + a.r * Math.sin(t) - cc[1]), 12, 1e-9, 'arc ends on the detail circle'); });
      var mid = (a0 + a1) / 2;
      assert(Math.hypot(a.c[0] + a.r * Math.cos(mid) - cc[0], a.c[1] + a.r * Math.sin(mid) - cc[1]) < 12, 'the arc kept is the inside one');
      var wt = viewRec(r, T.id), onTop = r.sheet.prims.filter(function (p) { return p.layer === 'TOP' && p.k === 'circle' && p.style === 'thick'; });
      assert(onTop.length === 2, 'detail circles on the parent'); near(onTop[0].r, 24, 1e-9, 'r 12 at 2:1'); nearVec(onTop[0].c.concat(0), wt.toSheet([10, -10]).concat(0), 1e-9);
      var txt = r.sheet.prims.filter(function (p) { return p.k === 'text'; }).map(function (p) { return p.layer + ':' + p.text; });
      ['TOP:A', 'TOP:C', 'DETAIL_A:DETAIL A', 'DETAIL_A:SCALE 4 : 1', 'DETAIL_C:DETAIL C'].forEach(function (t) { assert(txt.indexOf(t) >= 0, 'missing ' + t); });
      // a detail of a section view hatches the cut face at the detail's scale, inside the circle
      var S = DW.addSectionView(r.doc, r.mesh, r.view('Front').view.id, { axis: 'h', at: 4, sign: 1, x: 139, y: 40 });
      var Ds = DW.addDetailView(r.doc, r.mesh, S.id, { c: [10, -10], r: 8, x: 60, y: 60 });
      recompute(r);
      var wd = viewRec(r, Ds.id), dh = r.sheet.prims.filter(function (p) { return p.layer === wd.layer && p.style === 'hatch'; });
      assert(S.label === 'B' && Ds.label === 'D' && dh.length > 10 && dh.every(function (h) { return Math.hypot(h.a[0] - 60, h.a[1] - 60) <= 32 + 1e-9 && Math.hypot(h.b[0] - 60, h.b[1] - 60) <= 32 + 1e-9; }), 'detail hatch ' + dh.length);
      return 'chords ' + fmt(2 * Math.sqrt(44)) + ', arc ' + fmt(a.a1 - a.a0) + ' deg';
    });
    test('labels skip I, O and Q; deleting a parent removes its section and detail views, projected views become free', function () {
      var r = drawingOf('p.box(40, 20, 10);'), F = r.view('Front').view;
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(function (l) { r.doc.views.push({ id: 900 + l.charCodeAt(0), label: l, orient: 'Front', kind: 'x' }); });
      assert(DW.nextLabel(r.doc) === 'J', DW.nextLabel(r.doc));
      r.doc.views = r.doc.views.filter(function (v) { return v.id < 900; });
      var S = DW.addSectionView(r.doc, r.mesh, F.id, { at: 5 }), Dt = DW.addDetailView(r.doc, r.mesh, S.id, { c: [5, 5], r: 3 }), P = DW.addProjectedView(r.doc, r.mesh, F.id, 'down');
      var n = r.doc.views.length;
      assert(DW.deleteView(r.doc, F.id) === 3 && r.doc.views.length === n - 3, 'removed ' + (n - r.doc.views.length));
      assert(!DW.findView(r.doc, S.id) && !DW.findView(r.doc, Dt.id) && P.parent === null && P.align === null && DW.findView(r.doc, P.id), 'dependents');
      recompute(r);
      assert(viewRec(r, P.id).view.orient === 'Bottom', 'the projected view keeps its frame');
      return 'J after H';
    });
    test('Smart Dimensions follow the part: an edge that grows, a face that moves, a hole that grows and moves; a lost reference dangles (olive) and reattaches on undo', function () {
      function redo(r, code) { var n = build(code); noErrors(n); r.mesh = n.mesh; r.model = n.model; return recompute(r); }
      var r = drawingOf('p.box(100, 60, 8); p.hole("Top", 20, -20, 10, { offset: 8 });');
      var wf = r.view('Front'), wt = r.view('Top');
      var top = wf.proj.lines.visible.filter(function (l) { return Math.abs(l[1] - wf.proj.bounds.vmax) < 1e-9 && Math.abs(l[3] - l[1]) < 1e-9; })[0];
      assert(top, 'top edge in the Front view');
      wf.view.dims.push({ kind: 'h', a: [top[0], top[1]], b: [top[2], top[3]], side: 1, value: Math.abs(top[2] - top[0]) });
      var hole = wt.proj.circles.visible[0];
      wt.view.dims.push({ kind: 'dia', c: hole.c.slice(), r: hole.r, count: 1, value: 2 * hole.r });
      function user() { return r.sheet.dims.filter(function (d) { return !d.auto; }).map(function (d) { return d.text + (d.dangling ? '?' : ''); }).join(' '); }
      recompute(r); assert(user() === '100 \u00d810', user());
      redo(r, 'p.box(120, 60, 8); p.hole("Top", 20, -20, 10, { offset: 8 });');
      assert(user() === '120 \u00d810', 'wider: ' + user());
      redo(r, 'p.box(120, 60, 10); p.hole("Top", 20, -20, 12, { offset: 10 });');
      assert(user() === '120 \u00d812', 'taller + bigger hole: ' + user());
      near(wf.view.dims[0].a[1], 10, 1e-9, 'the dimension moved with the top face');
      redo(r, 'p.box(120, 60, 10); p.hole("Top", 50, -30, 12, { offset: 10 });');
      assert(user() === '120 \u00d812', 'hole moved: ' + user());
      nearVec(wt.view.dims[0].c.concat(0), [50, -30, 0], 1e-9, 'diameter follows the hole');
      var sh = redo(r, 'p.box(120, 60, 10);');
      assert(user() === '120 \u00d812?', 'hole deleted: ' + user());
      var dang = sh.prims.filter(function (p) { return p.color === 'dangling'; });
      assert(dang.length >= 3 && dang.every(function (p) { return p.layer === 'DIMENSIONS'; }), 'dangling prims ' + dang.length);
      var svg = DW.toSVG(sh), dxf = DW.toDXF(sh), pdf = DW.toPDF(sh);
      assert(svg.indexOf('stroke="#a07c00"') > 0 && svg.indexOf('fill="#a07c00"') > 0, 'SVG colour');
      assert(/\n62\n42\n/.test(dxf) && pdf.indexOf('0.627 0.486 0 RG') > 0, 'DXF / PDF colour');
      redo(r, 'p.box(120, 60, 10); p.hole("Top", 50, -30, 12, { offset: 10 });');
      assert(user() === '120 \u00d812', 'reattached: ' + user());
      return 'dangling colour #a07c00 (DXF 42)';
    });
    test('a moved full-length edge beats a short collinear leftover (a blind hole bottom on the old top line)', function () {
      var r = drawingOf('p.box(100, 60, 8);'), wf = r.view('Front');
      wf.view.dims.push({ kind: 'h', a: [0, 8], b: [100, 8], side: 1, value: 100 });
      var n = build('p.box(100, 60, 12); p.hole("Top", 50, -30, 10, { offset: 12, depth: 4 });');
      r.mesh = n.mesh; r.model = n.model; recompute(r);
      assert(viewRec(r, wf.view.id).proj.all.some(function (l) { return Math.abs(l[1] - 8) < 1e-9 && Math.abs(l[3] - 8) < 1e-9; }), 'the hole bottom is on the old line');
      var d = wf.view.dims[0];
      assert(!d.dangling && Math.abs(d.value - 100) < 1e-9 && Math.abs(d.a[1] - 12) < 1e-9 && Math.abs(d.b[1] - 12) < 1e-9, JSON.stringify(d));
      return 'top edge 8 -> 12';
    });
    test('exports of section, detail and projected views: SVG layers and hatch, DXF PHANTOM cutting line + ARC entities, PDF arcs and chain dash', function () {
      var r = drawingOf(PLATE), F = r.view('Front').view, T = r.view('Top').view;
      var S = DW.addSectionView(r.doc, r.mesh, T.id, { axis: 'v', at: 10, sign: -1, x: 60 });
      var Dv = DW.addDetailView(r.doc, r.mesh, T.id, { c: [14, -10], r: 6, x: 330, y: 110 });
      DW.addProjectedView(r.doc, r.mesh, F.id, 'down');
      var sh = recompute(r), svg = DW.toSVG(sh), dxf = DW.toDXF(sh), pdf = DW.toPDF(sh);
      var d = new DOMParser().parseFromString(svg, 'image/svg+xml');
      assert(!d.querySelector('parsererror'), 'SVG parse');
      var nh = sh.prims.filter(function (p) { return p.style === 'hatch'; }).length;
      assert(nh > 0 && [].reduce.call(d.querySelectorAll('g[data-layer="SECTION_A"] path.hatch'), function (n, e) { return n + e.getAttribute('d').split(/[Mm]/).length - 1; }, 0) === nh, 'hatch in SVG (one path, a move per line)');
      assert(d.querySelectorAll('g[data-layer="DETAIL_B"] path.visible').length === 1, 'arc path');
      assert(d.querySelectorAll('g[data-layer="TOP"] line.chain[stroke-dasharray]').length === 1 && d.querySelector('g[data-layer="BOTTOM"]'), 'chain line / Bottom layer');
      var L = dxf.split('\n'), ents = [], cur = null, inEnt = false;
      for (var i = 0; i < L.length; i += 2) {
        var c = L[i].trim(), v = L[i + 1];
        if (c === '2' && v === 'ENTITIES') inEnt = true;
        if (c === '0') { cur = inEnt ? { type: v } : null; if (cur) ents.push(cur); }
        if (cur && c === '8') cur.layer = v;
        if (cur && c === '6') cur.ltype = v;
      }
      assert(dxf.indexOf('\n2\nPHANTOM\n') > 0 && dxf.indexOf('LTYPE\n70\n3') > 0, 'PHANTOM linetype');
      assert(ents.filter(function (e) { return e.ltype === 'PHANTOM'; }).length === 1, 'cutting line');
      assert(ents.filter(function (e) { return e.type === 'ARC' && e.layer === 'DETAIL_B'; }).length === 1, 'ARC');
      assert(ents.filter(function (e) { return e.type === 'LINE' && e.layer === 'SECTION_A'; }).length >= nh, 'hatch lines in DXF');
      assert(!/[^\x00-\x7f]/.test(pdf) && pdf.indexOf('[22.6772 4.252 4.252 4.252] 0 d') > 0, 'PDF chain dash');
      var sx = +/startxref\n(\d+)/.exec(pdf)[1];
      assert(pdf.substr(sx, 4) === 'xref', 'startxref');
      var len = +/\/Length (\d+) >>\nstream\n/.exec(pdf)[1], st = pdf.indexOf('stream\n') + 7;
      assert(pdf.substr(st + len, 10) === '\nendstream', 'stream length');
      void Dv; void S;
      return ents.length + ' DXF entities, ' + nh + ' hatch lines';
    });
  }

