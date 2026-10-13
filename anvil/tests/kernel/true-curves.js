  // ------------------------------------------------------------------ true curves (run cloud-2026-09-25p)
  group('true curves: kernel');
  // Volumes, areas and centroids of curved parts are exact (massProps integrates the slivers between the facets and
  // the analytic surfaces they carry); they are pinned to the textbook formulas to 1e-9 or better.
  test('sketch profiles keep their circles and arcs: profile.curves and loop.seg mark the chords of each', function () {
    var pr = K.sketchProfile({ entities: [{ t: 'rect', x: -20, y: -10, w: 40, h: 20 }, { t: 'circle', cx: 5, cy: 0, r: 4 }, { t: 'slot', x1: -12, y1: 0, x2: -4, y2: 0, w: 4 }] });
    assert(pr.curves && pr.curves.length === 3, 'curves: ' + JSON.stringify(pr.curves));
    var rect = pr.loops.filter(function (l) { return l.pts.length === 4; })[0], circ = pr.loops.filter(function (l) { return l.pts.length === segsForRadius(4); })[0];
    assert(rect && !rect.seg, 'a rectangle has no curved segment');
    assert(circ && circ.seg.every(function (k) { return pr.curves[k].full && pr.curves[k].r === 4; }), 'every segment of the circle is a chord of it');
    var slot = pr.loops.filter(function (l) { return l !== rect && l !== circ; })[0], straight = slot.seg.filter(function (k) { return k < 0; }).length;
    assert(straight === 2, 'a slot has two straight sides, got ' + straight);
    var arcs = slot.seg.filter(function (k) { return k >= 0; }).map(function (k) { return pr.curves[k]; });
    assert(arcs.every(function (c) { return c.r === 2 && !c.full && Math.abs(c.a1 - c.a0 - Math.PI) < 1e-12; }), 'two half circles of r 2');
    // an arc chained with lines
    var p2 = K.sketchProfile({ entities: [{ t: 'line', x1: 0, y1: -5, x2: 0, y2: 5 }, { t: 'arc', cx: 0, cy: 0, r: 5, a0: -90, a1: 90 }] });
    assert(p2.loops.length === 1 && p2.loops[0].seg.filter(function (k) { return k >= 0; }).length === p2.loops[0].pts.length - 1, 'D profile: every segment but the line is on the arc');
  });
  test('tessellation: chord tolerance (sagitta ≤ 0.05 mm by default), n a multiple of 8 in 16..128; setTessellation and legacy', function () {
    [0.5, 2, 4, 7, 10, 25, 40, 100, 400].forEach(function (r) {
      var n = K.segsForRadius(r);
      assert(n % 8 === 0 && n >= 16 && n <= 128, 'r ' + r + ': n = ' + n);
      if (n < 128) assert(r * (1 - Math.cos(Math.PI / n)) <= 0.05 + 1e-12, 'r ' + r + ': sagitta ' + r * (1 - Math.cos(Math.PI / n)));
      if (n > 16) assert(r * (1 - Math.cos(Math.PI / (n - 8))) > 0.05, 'r ' + r + ': n = ' + n + ' is the smallest multiple of 8 that meets the tolerance');
    });
    var st = K.setTessellation({ chordTol: 0.01 });
    try { assert(st.chordTol === 0.01 && K.segsForRadius(10) === 72, 'r 10 at 0.01: ' + K.segsForRadius(10)); } finally { K.setTessellation('default'); }
    withLegacy(function () { [1, 4, 10, 40, 100].forEach(function (r) { assert(K.segsForRadius(r) === legacySegs(r), 'legacy r ' + r); }); });
    assert(K.segsForRadius(10) === 32, 'back to the default');
    var threw = false; try { K.setTessellation({ chordTol: 0 }); } catch (e) { threw = true; }
    assert(threw, 'a zero chord tolerance is refused');
    return 'n(4) ' + K.segsForRadius(4) + ', n(10) ' + K.segsForRadius(10) + ', n(40) ' + K.segsForRadius(40);
  });
  test('model.tessellation: a document with its own chord tolerance rebuilds with it, the global setting comes back, the cache keys follow it', function () {
    var m = K.newModel('T'); K.runScript(m, 'p.cylinder(10, 5);');
    var b1 = K.rebuild(m), n1 = K.meshFromBody(b1.body).faces.length;
    m.tessellation = { chordTol: 0.01 };
    var b2 = K.rebuild(m, b1.cache), n2 = K.meshFromBody(b2.body).faces.length;
    assert(n1 === 32 + 2 && n2 === 72 + 2, 'faces ' + n1 + ' → ' + n2);
    assert(b2.reused === 0, 'a changed tolerance rebuilds everything (reused ' + b2.reused + ')');
    assert(K.segsForRadius(10) === 32, 'global setting restored');
    nearRel(K.massProps(K.meshFromBody(b2.body), 1).volume, Math.PI * 500, 1e-12, 'exact volume either way');
    var c = K.cacheFromBuild(m, b2), b3 = K.rebuild(m, c);
    assert(b3.reused === m.features.length, 'cacheFromBuild keys use the model tolerance (reused ' + b3.reused + ')');
  });
  test('exact volume, area and centroid: cylinder, cone, frustum, sphere, torus (πr²h, πr²h/3, 4/3πr³, 2π²Rr²; areas 2πrh + 2πr², 4πr², 4π²Rr)', function () {
    var PI = Math.PI, cases = [
      ['cylinder r10 h20', 'p.cylinder(10, 20);', PI * 100 * 20, 2 * PI * 10 * 20 + 2 * PI * 100, [0, 10, 0]],
      ['cone r10 h20', 'p.sketch("Front").polyline([[0, 0], [10, 0], [0, 20]], true).revolve(360);', PI * 100 * 20 / 3, PI * 100 + PI * 10 * Math.hypot(10, 20), [0, 5, 0]],
      ['frustum', 'p.sketch("Front").polyline([[0, 0], [10, 0], [5, 20], [0, 20]], true).revolve(360);', PI * 20 / 3 * (100 + 50 + 25), PI * 125 + PI * 15 * Math.hypot(5, 20), [0, 20 * (100 + 2 * 50 + 3 * 25) / (4 * (100 + 50 + 25)), 0]],
      ['sphere r10', 'p.sketch("Front").line(0, -10, 0, 10).arc(0, 0, 10, -90, 90).end().revolve(360);', 4 / 3 * PI * 1000, 4 * PI * 100, [0, 0, 0]],
      ['torus R30 r5', 'p.sketch("Front").circle(30, 0, 5).revolve(360);', 2 * PI * PI * 30 * 25, 4 * PI * PI * 30 * 5, [0, 0, 0]]
    ], out = [];
    cases.forEach(function (c) {
      var r = build(c[1]); noErrors(r);
      nearRel(r.mp.volume, c[2], 1e-9, c[0] + ' volume');
      nearRel(r.mp.area, c[3], 1e-9, c[0] + ' area');
      nearVec(r.mp.centroid, c[4], 1e-7, c[0] + ' centroid');
      assert(Math.abs(polyVol(r.mp) - c[2]) > 1e-4 * c[2], c[0] + ': the facets alone are measurably off (' + polyVol(r.mp) + ')');
      out.push(c[0] + ' ' + ((r.mp.volume - c[2]) / c[2]).toExponential(1));
    });
    return out.join(', ');
  });
  test('exact volume of holes, bosses and steps: through, blind, counterbore, boss on a plate, patterned and mirrored holes; areas where the faces are perpendicular', function () {
    var PI = Math.PI, cases = [
      ['through hole', 'p.box(100, 60, 10); p.hole("Top", 50, -30, 8, { offset: 10 });', 60000 - PI * 16 * 10, 2 * (6000 - PI * 16) + 2 * (1000 + 600) + 2 * PI * 4 * 10],
      ['blind hole', 'p.box(100, 60, 20); p.sketch("Top", 20).circle(50, -30, 5).extrude(8, { cut: true, reverse: true });', 120000 - PI * 25 * 8, 2 * (6000 + 1200 + 2000) + 2 * PI * 5 * 8],
      ['counterbore', 'p.box(100, 60, 20); p.hole("Top", 50, -30, 10, { offset: 20 }); p.sketch("Top", 20).circle(50, -30, 8).extrude(6, { cut: true, reverse: true });', 120000 - PI * 25 * 14 - PI * 64 * 6, 2 * 6000 + 2 * (1200 + 2000) - PI * 64 - PI * 25 + (PI * 64 - PI * 25) + 2 * PI * 8 * 6 + 2 * PI * 5 * 14],
      ['boss on a plate', 'p.box(100, 60, 10); p.sketch("Top", 10).circle(50, -30, 5).extrude(15);', 60000 + PI * 25 * 15, 2 * (6000 + 600 + 1000) + 2 * PI * 5 * 15],
      ['patterned holes', 'p.box(100, 60, 10); p.hole("Top", 20, -30, 8, { offset: 10 }); p.linearPattern({ dir: "x", spacing: 20, count: 4 });', 60000 - 4 * PI * 16 * 10, null],
      ['mirrored boss', 'p.box(100, 60, 10); p.sketch("Top", 10).circle(20, -30, 5).extrude(15); p.mirror("Right", { offset: 50 });', 60000 + 2 * PI * 25 * 15, null]
    ], out = [];
    cases.forEach(function (c) {
      var r = build(c[1]); noErrors(r);
      nearRel(r.mp.volume, c[2], 1e-12, c[0] + ' volume');
      if (c[3] != null) nearRel(r.mp.area, c[3], 1e-12, c[0] + ' area');
      out.push(c[0]);
    });
    return out.join(', ');
  });
  test('exact partial revolves (half sphere, quarter torus: the end caps are the exact profile), a drafted cylinder (a true frustum) and an edge fillet (a quarter cylinder)', function () {
    var PI = Math.PI, t = Math.tan(5 * PI / 180), R2 = 10 - 20 * t;
    var hs = build('p.sketch("Front").line(0, -10, 0, 10).arc(0, 0, 10, -90, 90).end().revolve(180);'); noErrors(hs);
    nearRel(hs.mp.volume, 2 / 3 * PI * 1000, 1e-9, 'half sphere volume'); nearRel(hs.mp.area, 2 * PI * 100 + PI * 100, 1e-9, 'half sphere area');
    nearRel(hs.mp.centroid[2], -3 / 8 * 10, 1e-9, 'half sphere centroid 3r/8 from the flat');
    var qt = build('p.sketch("Front").circle(30, 0, 5).revolve(90);'); noErrors(qt);
    nearRel(qt.mp.volume, PI * PI * 30 * 25 / 2, 1e-12, 'quarter torus'); nearRel(qt.mp.area, PI * PI * 30 * 5 + 2 * PI * 25, 1e-12, 'quarter torus area');
    var dr = build('p.sketch("Top").circle(0, 0, 10).extrude(20, { draft: 5 });'); noErrors(dr);
    nearRel(dr.mp.volume, PI * 20 / 3 * (100 + 10 * R2 + R2 * R2), 1e-12, 'drafted cylinder = frustum');
    var fl = build('p.box(40, 20, 30); p.fillet(5, [[20, 30, 0]]);'); noErrors(fl);
    nearRel(fl.mp.volume, 40 * 20 * 30 - (25 - PI * 25 / 4) * 40, 1e-12, 'fillet r5 along 40');
    nearRel(fl.mp.area, 2 * (800 + 600 + 1200) - 10 * 40 + PI * 5 / 2 * 40 - 2 * (25 - PI * 25 / 4), 1e-12, 'fillet area');
    return 'ok';
  });
  test('the exact volume does not depend on the tessellation (0.05, 0.01, legacy) and survives pack / unpack and mirrors', function () {
    var code = 'p.sketch("Front").polyline([[0, 0], [20, 0], [20, 5], [8, 5], [8, 25], [0, 25]], true).revolve(360);\np.box(60, 60, 5, { at: [-30, 0, -30] });\np.hole("Top", 20, -20, 6, { offset: 5 });\np.circularPattern({ axis: "y", count: 4 });\np.mirror("Right", { body: true, offset: 40 });';
    var a = build(code); noErrors(a);
    var fine; K.setTessellation({ chordTol: 0.01 }); try { fine = build(code).mp.volume; } finally { K.setTessellation('default'); }
    var leg = withLegacy(function () { return build(code).mp.volume; });
    nearRel(fine, a.mp.volume, 1e-12, 'fine'); nearRel(leg, a.mp.volume, 1e-12, 'legacy');
    var u = K.unpackBuild(K.packBuild(a.build, a.model));
    nearRel(K.massProps(K.meshFromBody(u.body), 1).volume, a.mp.volume, 1e-12, 'unpacked');
    var n0 = K.curveSurfaces(a.body).length, n1 = K.curveSurfaces(u.body).length;
    // per body: the Ø16 post of the revolve (its Ø40 foot is inside the plate) and the four Ø6 holes; two bodies
    assert(n0 === 10 && n1 === n0, 'unpacked facets keep their surfaces: ' + n0 + ' → ' + n1);
    return 'volume ' + fmt(a.mp.volume) + ' on three tessellations';
  });
  test('surface records: fragments of a split facet inherit their face’s record; transforms move it (pattern, mirror); planar faces have none', function () {
    var r = build('p.cylinder(10, 20);\np.box(40, 40, 4, { at: [-20, 8, -20] });'); noErrors(r); // a 4 thick plate at y 8..12 through the cylinder
    var cyl = r.body.polygons.filter(function (p) { return p.surf; });
    assert(cyl.length > 32 && cyl.every(function (p) { return p.surf.s.t === 'cyl' && p.surf.s.r === 10; }), 'split side facets are all on the r 10 cylinder: ' + cyl.length);
    assert(r.body.polygons.filter(function (p) { return !p.surf; }).every(function (p) { return Math.abs(p.plane.normal.y) > 0.99 || Math.abs(p.plane.normal.y) < 1e-9; }), 'the others are planar');
    var pt = build('p.box(100, 20, 5);\np.cylinder(3, 8, { at: [10, 5, 10] });\np.linearPattern({ dir: "x", spacing: 30, count: 3 });\np.mirror("Front", { body: true, offset: 20 });'); noErrors(pt);
    var S = K.curveSurfaces(pt.body);
    assert(S.length === 6, 'six distinct cylinders, got ' + S.length);
    var xs = S.map(function (s) { return Math.round(s.surf.o[0] * 1e6) / 1e6; }).sort(function (a, b) { return a - b; });
    assert(JSON.stringify(xs) === JSON.stringify([10, 10, 40, 40, 70, 70]), 'axes at x = ' + xs);
    S.forEach(function (s) { nearVec(s.surf.d.map(Math.abs), [0, 1, 0], 1e-12, 'axis along y'); near(s.surf.r, 3, 1e-12, 'radius'); });
    nearRel(pt.mp.volume, 2 * (10000 + 3 * Math.PI * 9 * 8), 1e-12, 'volume');
  });
  test('curveEdges: the true circles of the bolt-hole plate (4 holes × top and bottom, r 4 at the hole centres), a slot’s arcs, a half sphere’s profile arcs, and none inside a split face', function () {
    var ex = AnvilExamples.filter(function (e) { return e.name === 'Plate with bolt holes'; })[0], r = build(ex.code); noErrors(r);
    var ce = K.curveEdges(r.mesh);
    assert(ce.length === 8 && ce.every(function (e) { return e.kind === 'circle' && Math.abs(e.radius - 4) < 1e-12 && Math.abs(Math.abs(e.normal[1]) - 1) < 1e-12; }), '8 circles: ' + ce.map(function (e) { return e.kind + ' ' + e.radius; }).join(', '));
    ce.forEach(function (e) { assert(e.chords.length >= segsForRadius(4), 'every chord of the 24-gon (or its pieces)'); });
    var sl = K.curveEdges(build('p.sketch("Top").slot(0, 0, 30, 0, 10).extrude(5);').mesh);
    assert(sl.length === 4 && sl.every(function (e) { return e.kind === 'arc' && Math.abs(e.a1 - e.a0 - Math.PI) < 1e-9 && e.radius === 5; }), 'slot: 4 half arcs');
    var hs = K.curveEdges(build('p.sketch("Front").line(0, -10, 0, 10).arc(0, 0, 10, -90, 90).end().revolve(180);').mesh);
    assert(hs.length === 2 && hs.every(function (e) { return e.kind === 'arc' && Math.abs(e.a1 - e.a0 - Math.PI) < 1e-9 && e.radius === 10; }), 'half sphere: the two profile half circles: ' + hs.map(function (e) { return e.kind + ' ' + (e.a1 - e.a0); }));
    var sp = K.curveEdges(build('p.cylinder(10, 20);\np.box(40, 40, 4, { at: [-20, 8, -20] });').mesh);
    var ys = sp.map(function (e) { return Math.round(e.center[1] * 1e9) / 1e9; }).sort(function (a, b) { return a - b; });
    assert(sp.length === 4 && sp.every(function (e) { return e.kind === 'circle'; }) && JSON.stringify(ys) === '[0,8,12,20]', 'a cylinder through a plate: rims at y = 0, 8, 12, 20: ' + ys);
    return '8 + 4 + 2 + 4 edges';
  });
  test('old models rebuild unchanged on the legacy tessellation, and a model saved before true curves (no tessellation field) loads and rebuilds', function () {
    var json = JSON.stringify(build('p.box(40, 40, 10);\np.hole("Top", 20, -20, 8, { offset: 10 });').model);
    var m = JSON.parse(json); delete m.tessellation;
    var b = K.rebuild(m); noErrors({ errors: b.errors });
    nearRel(K.massProps(K.meshFromBody(b.body), 1).volume, 16000 - Math.PI * 16 * 10, 1e-12, 'exact');
    withLegacy(function () { nearRel(K.rebuild(JSON.parse(json)).body.volume(), 16000 - legacySegs(4) / 2 * 16 * Math.sin(2 * Math.PI / legacySegs(4)) * 10, 1e-12, 'legacy polygonal volume'); });
  });
  test('flat patterns are unchanged by the finer tessellation: blank bbox, outline area and every bend line identical to the legacy mesh; round cutouts are finer polygons of the same circles', function () {
    var out = [];
    ['Sheet-metal U-bracket', 'Tray', 'Normal Cut Bracket'].forEach(function (name) {
      var ex = AnvilExamples.filter(function (e) { return e.name === name; })[0];
      function flat() { var r = build(ex.code); noErrors(r); return K.flatPattern(r.model, r.build, r.mesh); }
      var a = withLegacy(flat), b = flat();
      assert(JSON.stringify(a.bbox) === JSON.stringify(b.bbox), name + ': bbox');
      assert(JSON.stringify(a.bends) === JSON.stringify(b.bends), name + ': bends');
      assert(a.loops.length === b.loops.length, name + ': loop count');
      nearRel(Math.abs(K.signedArea(b.loops[0])), Math.abs(K.signedArea(a.loops[0])), 1e-12, name + ': outline area');
      out.push(name + ' ' + a.loops.length + ' loops');
    });
    return out.join(', ');
  });
  // ==== TRUE CURVES KERNEL TESTS END ====

  group('true curves: drawings');
  // ==== TRUE CURVES DRAWING TESTS BEGIN ====
  // Drawings from the analytic records (drawing.js): circles and arcs of Kernel.curveEdges come out as true circles,
  // arcs and ellipses; cylinder and cone silhouettes are the exact tangent generators; meshes without records draw
  // as before. Sheets are made like drawingOf (Standard 3 View, A3, auto scale).
  if (DW) (function () {
    function tcSheet(code) {
      var r = build(code); noErrors(r);
      r.doc = DW.newDrawing(r.model, { date: '2026-09-26' });
      DW.standard3View(r.doc, r.mesh, r.model.units);
      r.sheet = DW.compute(r.doc, r.mesh, r.model);
      r.view = function (o) { return r.sheet.views.filter(function (w) { return w.view.orient === o; })[0]; };
      return r;
    }
    // DXF entities with every group code: [{ type, g: { code: [value…] } }]
    function dxfEnts(dxf) {
      var L = dxf.split('\n'), out = [], cur = null, inEnt = false;
      for (var i = 0; i + 1 < L.length; i += 2) {
        var c = L[i].trim(), v = L[i + 1];
        if (c === '2' && v === 'ENTITIES') inEnt = true;
        if (c === '0') { cur = inEnt && v !== 'ENDSEC' ? { type: v, g: {} } : null; if (cur) out.push(cur); continue; }
        if (cur) (cur.g[c] || (cur.g[c] = [])).push(v);
      }
      return out;
    }
    function num4(x) { return String(Math.round(x * 1e4) / 1e4); }
    function mod360(a) { return ((a % 360) + 360) % 360; }
    function nearAngle(a, b, tol, label) { var d = Math.abs(mod360(a - b + 180) - 180); if (!(d <= tol)) fail((label || 'angle') + ' = ' + a + ', expected ' + b + ' ±' + tol); }
    // the same mesh with no analytic records on its polygons: what an imported STL / STEP body looks like
    function stripped(mesh) {
      var m = {};
      Object.keys(mesh).forEach(function (k) { if (k.charAt(0) !== '_') m[k] = mesh[k]; });
      m.faces = mesh.faces.map(function (f) {
        var g = {};
        Object.keys(f).forEach(function (k) { g[k] = f[k]; });
        g.polys = (f.polys || []).map(function (p) { var q = p.clone(); q.surf = null; return q; });
        return g;
      });
      return m;
    }
    var PLATE_TC = AnvilExamples.filter(function (e) { return e.name === 'Plate with bolt holes'; })[0].code;
    var HOLES_TOP = [[10, -10], [90, -10], [10, -50], [90, -50]];   // Top view (u = x, v = -z) of the holes at x 10 / 90, z 10 / 50

    test('Plate with bolt holes: the Top view has 4 true circles of r 4 at the exact hole centres; SVG <circle>, DXF CIRCLE, PDF Bezier curves at 4 × scale; model item 4X Ø8 from r = 4', function () {
      var r = tcSheet(PLATE_TC), w = r.view('Top'), s = w.scale, cs = w.proj.circles.visible;
      assert(cs.length === 4 && cs.every(function (c) { return c.exact; }), 'exact circles ' + JSON.stringify(w.proj.stats));
      cs.forEach(function (c) { near(c.r, 4, 1e-12, 'r'); });
      HOLES_TOP.forEach(function (h) { assert(cs.some(function (c) { return Math.hypot(c.c[0] - h[0], c.c[1] - h[1]) < 1e-9; }), 'no circle at ' + h); });
      assert(!w.proj.arcs.visible.length && !w.proj.lines.visible.some(function (l) { return Math.hypot(l[2] - l[0], l[3] - l[1]) < 5; }), 'no chords left over');
      var prim = r.sheet.prims.filter(function (p) { return p.k === 'circle' && p.layer === w.layer && p.style === 'visible'; });
      assert(prim.length === 4, 'sheet circles ' + prim.length);
      prim.forEach(function (p) { near(p.r, 4 * s, 1e-9, 'sheet r'); assert(HOLES_TOP.some(function (h) { var q = w.toSheet(h); return Math.hypot(q[0] - p.c[0], q[1] - p.c[1]) < 1e-9; }), 'sheet centre ' + p.c); });
      // SVG, parsed as XML
      var doc = new DOMParser().parseFromString(DW.toSVG(r.sheet), 'image/svg+xml');
      assert(!doc.getElementsByTagName('parsererror').length, 'SVG parses');
      var g = Array.prototype.filter.call(doc.getElementsByTagName('g'), function (x) { return x.getAttribute('data-layer') === w.layer; })[0];
      var sc = Array.prototype.slice.call(g.getElementsByTagName('circle'));
      assert(sc.length === 4 && sc.every(function (c) { return c.getAttribute('r') === num4(4 * s); }), 'SVG circles r=' + num4(4 * s) + ': ' + sc.map(function (c) { return c.getAttribute('r'); }));
      // DXF: CIRCLE entities on the view's layer, parsed back
      var ents = dxfEnts(DW.toDXF(r.sheet)).filter(function (e) { return e.type === 'CIRCLE' && e.g['8'][0] === w.layer; });
      assert(ents.length === 4, 'DXF circles ' + ents.length);
      ents.forEach(function (e) {
        near(+e.g['40'][0], 4 * s, 1e-4, 'DXF radius');
        var p = [+e.g['10'][0], +e.g['20'][0]];
        assert(HOLES_TOP.some(function (h) { var q = w.toSheet(h); return Math.hypot(q[0] - p[0], q[1] - p[1]) < 2e-4; }), 'DXF centre ' + p);
      });
      // PDF: each hole is a closed path of four Bezier curves starting at (cx + r, cy), in points
      var pdf = DW.toPDF(r.sheet), pt = 72 / 25.4;
      prim.forEach(function (p) {
        var start = num4((p.c[0] + p.r) * pt) + ' ' + num4(p.c[1] * pt) + ' m', at = pdf.indexOf(start);
        assert(at > 0, 'PDF path ' + start);
        var path = pdf.slice(at, pdf.indexOf('\n', at));
        assert((path.match(/ c/g) || []).length === 4 && / c S$/.test(path), 'PDF curves: ' + path.slice(0, 80));
      });
      var dia = r.sheet.dims.filter(function (d) { return d.kind === 'dia'; });
      assert(dia.length === 1 && dia[0].text === '4X Ø8', 'model items ' + r.sheet.dims.map(function (d) { return d.text; }));
      near(dia[0].r, 4, 1e-12, 'dimension radius'); near(dia[0].value, 8, 1e-12, 'dimension value');
      return 'scale ' + s + ', ' + ents.length + ' CIRCLEs of r ' + num4(4 * s);
    });

    test('Cylinder r 10 along x: Front silhouettes at exactly v = ±10 (the tangent generators), also in a view tilted 5° about x where the facets reach only 10 cos δ; the isometric caps are ellipses with semi-axes 10 and 10/√3', function () {
      var r = tcSheet('p.cylinder(10, 40, { axis: "x" });'), w = r.view('Front'), L = w.proj.lines.visible;
      assert(hasLine(L, [0, 10, 40, 10], 1e-9) && hasLine(L, [0, -10, 40, -10], 1e-9), 'silhouettes ' + segsStr(L));
      near(w.proj.bounds.vmax, 10, 1e-9, 'vmax'); near(w.proj.bounds.vmin, -10, 1e-9, 'vmin');
      var ys = r.sheet.prims.filter(function (p) { return p.k === 'line' && p.layer === w.layer && Math.abs(p.a[1] - p.b[1]) < 1e-9; }).map(function (p) { return p.a[1]; });
      near(Math.max.apply(null, ys) - Math.min.apply(null, ys), 20 * w.scale, 1e-9, 'sheet: silhouettes 20 × scale apart');
      // tilted 5° about x: the tangent generators are still at ±r from the axis in the view plane
      var a = 5 * Math.PI / 180, F = { e: [0, Math.sin(a), Math.cos(a)], u: [1, 0, 0], v: [0, Math.cos(a), -Math.sin(a)] };
      var P = r.mesh.positions64, vmax = 0;
      for (var i = 0; i < P.length; i += 3) vmax = Math.max(vmax, Math.abs(P[i + 1] * F.v[1] + P[i + 2] * F.v[2]));
      assert(vmax < 10 - 1e-3, 'facet vertices reach ' + vmax);
      var pr = DW.projectView(r.mesh, F), T = pr.lines.visible;
      assert(hasLine(T, [0, 10, 40, 10], 1e-9) && hasLine(T, [0, -10, 40, -10], 1e-9), 'tilted silhouettes ' + segsStr(T));
      assert(!T.some(function (l) { return Math.abs(l[1] - l[3]) < 1e-9 && Math.abs(Math.abs(l[1]) - 10) > 1e-6 && Math.abs(l[1]) > 9; }), 'a facet silhouette is left: ' + segsStr(T));
      near(pr.bounds.vmax, 10, 1e-9, 'tilted vmax');
      // isometric: the two caps (x = 0 and 40, normal x) project to ellipses; a circle's major semi-axis is r, minor r |n·e|
      var iso = r.view('Isometric'), el = r.sheet.prims.filter(function (p) { return p.k === 'ellipse' && p.layer === iso.layer; });
      assert(el.length >= 2 && el.some(function (p) { return p.full && p.style === 'visible'; }), 'iso ellipses ' + JSON.stringify(iso.proj.stats));
      el.forEach(function (p) { near(Math.hypot(p.major[0], p.major[1]), 10 * iso.scale, 1e-9, 'major'); near(p.ratio, 1 / Math.sqrt(3), 1e-9, 'ratio'); });
      return 'facets reach ' + fmt(vmax) + ', silhouettes at ±10; ' + el.length + ' ellipses';
    });

    test('Slot and partial revolve: arcs are ARC entities / SVG arcs with the exact radius and angles; model item: the slot callout 10 X 50 SLOT (was 2X R5)', function () {
      var r = tcSheet('p.box(80, 40, 10);\np.sketch("Top", 10).slot(20, -20, 60, -20, 10).cut("through", { reverse: true });'), w = r.view('Top'), s = w.scale;
      var A = w.proj.arcs.visible;
      assert(A.length === 2 && A.every(function (x) { return x.src === 'arc'; }), 'arcs ' + JSON.stringify(A));
      A.forEach(function (x) { near(x.r, 5, 1e-12, 'r'); near(x.a1 - x.a0, 180, 1e-9, 'sweep'); });
      var right = A.filter(function (x) { return Math.abs(x.c[0] - 60) < 1e-9; })[0], left = A.filter(function (x) { return Math.abs(x.c[0] - 20) < 1e-9; })[0];
      assert(right && left, 'arc centres ' + JSON.stringify(A));
      near(right.c[1], -20, 1e-9); near(left.c[1], -20, 1e-9);
      nearAngle(right.a0, -90, 1e-9, 'right a0'); nearAngle(left.a0, 90, 1e-9, 'left a0');
      assert(hasLine(w.proj.lines.visible, [20, -15, 60, -15], 1e-9) && hasLine(w.proj.lines.visible, [20, -25, 60, -25], 1e-9), 'slot sides');
      var arcs = dxfEnts(DW.toDXF(r.sheet)).filter(function (e) { return e.type === 'ARC' && e.g['8'][0] === w.layer; });
      assert(arcs.length === 2, 'DXF arcs ' + arcs.length);
      arcs.forEach(function (e) { near(+e.g['40'][0], 5 * s, 1e-4, 'DXF radius'); nearAngle(+e.g['51'][0] - +e.g['50'][0], 180, 1e-4, 'DXF sweep'); });
      assert(arcs.some(function (e) { return Math.abs(+e.g['50'][0] - 270) < 1e-4 && Math.abs(+e.g['51'][0] - 90) < 1e-4; }), 'DXF right arc 270..90');
      var svg = new DOMParser().parseFromString(DW.toSVG(r.sheet), 'image/svg+xml');
      var paths = Array.prototype.filter.call(svg.getElementsByTagName('path'), function (p) { return p.parentNode.getAttribute('data-layer') === w.layer && / A/.test(p.getAttribute('d')); });
      assert(paths.length === 2 && paths.every(function (p) { return p.getAttribute('d').indexOf(' A' + num4(5 * s) + ' ' + num4(5 * s) + ' ') > 0; }), 'SVG arcs');
      var rad = r.sheet.dims.filter(function (d) { return d.kind === 'rad'; });
      assert(rad.length === 1 && rad[0].text === '10 X 50 SLOT' && rad[0].slot, 'model items ' + r.sheet.dims.map(function (d) { return d.text; }));
      // a quarter revolve of the rectangle x 10..20, y 0..20 about y: the Top view shows arcs of r 10 and 20 over 90°
      var q = DW.projectView(build('p.sketch("Front").rect(10, 0, 10, 20).revolve(90);').mesh, 'Top').arcs.visible;
      [10, 20].forEach(function (R) {
        var x = q.filter(function (y) { return Math.abs(y.r - R) < 1e-12; });
        assert(x.length === 1 && x[0].src === 'arc', 'revolve arc r ' + R + ': ' + JSON.stringify(q));
        near(x[0].a1 - x[0].a0, 90, 1e-9, 'revolve sweep'); near(Math.hypot(x[0].c[0], x[0].c[1]), 0, 1e-9, 'on the axis');
      });
      return arcs.length + ' ARCs, ' + paths.length + ' SVG arcs, ' + rad[0].text;
    });

    test('A hole half under an overhanging flange: its Top-view circle splits into a visible and a hidden half arc (ray casts agree); DXF ARCs, the hidden one on HIDDEN', function () {
      var r = tcSheet('p.box(60, 40, 10);\np.box(10, 40, 30);\np.box(30, 40, 5, { at: [0, 25, 0] });\np.hole("Top", 30, -20, 10, { offset: 10 });'), w = r.view('Top');
      var V1 = w.proj.arcs.visible, H1 = w.proj.arcs.hidden;
      assert(!w.proj.circles.visible.length && !w.proj.circles.hidden.length, 'no full circle');
      assert(V1.length === 1 && H1.length === 1, 'arcs ' + JSON.stringify(w.proj.stats));
      // the flange edge x = 30 passes through the hole centre: visible for x > 30 (-90°..90°), hidden behind the flange
      // (the hidden-line tolerance, 1e-9 of the part's diagonal, moves the split by under 1e-5°)
      nearAngle(V1[0].a0, -90, 1e-5, 'visible a0'); nearAngle(V1[0].a1, 90, 1e-5, 'visible a1');
      nearAngle(H1[0].a0, 90, 1e-5, 'hidden a0'); nearAngle(H1[0].a1, 270, 1e-5, 'hidden a1');
      [V1[0], H1[0]].forEach(function (x) { near(x.r, 5, 1e-12); near(x.c[0], 30, 1e-9, 'centre u'); near(x.c[1], -20, 1e-9, 'centre v'); });
      var bad = [], n = 0, e = DW.orientation('Top').e;
      [[V1[0], false], [H1[0], true]].forEach(function (c) {
        for (var k = 1; k < 8; k++) {
          var t = (c[0].a0 + (c[0].a1 - c[0].a0) * k / 8) * Math.PI / 180, u = 30 + 5 * Math.cos(t), v = -20 + 5 * Math.sin(t);
          if (rayBlocked(r.mesh, [u, 10, -v], e) !== c[1]) bad.push((c[1] ? 'hidden' : 'visible') + ' at ' + fmt(t * 180 / Math.PI) + '°');
          n++;
        }
      });
      assert(!bad.length, bad.join(', '));
      var arcs = dxfEnts(DW.toDXF(r.sheet)).filter(function (x) { return x.type === 'ARC' && x.g['8'][0] === w.layer; });
      assert(arcs.length === 2 && arcs.filter(function (x) { return x.g['6'] && x.g['6'][0] === 'HIDDEN'; }).length === 1, 'DXF arcs');
      return n + ' ray casts';
    });

    test('Meshes without analytic records (imported / legacy) draw as before: fitted circles from chord chains, facet silhouettes, no arcs or ellipses', function () {
      var ref = build(PLATE_TC), m = stripped(build(PLATE_TC).mesh);
      var top = DW.projectView(m, 'Top'), front = DW.projectView(m, 'Front'), iso = DW.projectView(m, 'Isometric');
      assert(!top.exact && !top.arcs.visible.length && !iso.ellipses.visible.length && !iso.ellipses.hidden.length && !iso.stats.visibleEllipses, 'no exact curves');
      assert(top.circles.visible.length === 4 && top.circles.visible.every(function (c) { return !c.exact && Math.abs(c.r - 4) < 1e-9; }), 'fitted circles');
      assert(front.stats.visibleLines === 4 && front.stats.hiddenLines === 4, 'front ' + JSON.stringify(front.stats));
      // the same part with its records: the same circles, now exact
      var ex = DW.projectView(ref.mesh, 'Top');
      top.circles.visible.forEach(function (c) { assert(ex.circles.visible.some(function (d) { return d.exact && Math.hypot(d.c[0] - c.c[0], d.c[1] - c.c[1]) < 1e-9 && Math.abs(d.r - c.r) < 1e-9; }), 'exact twin of ' + c.c); });
      // an old facet silhouette: the cylinder's Front view without records keeps the facet edge where the facets turn
      var cm = stripped(build('p.cylinder(10, 40, { axis: "x" });').mesh), a = 5 * Math.PI / 180;
      var T = DW.projectView(cm, { e: [0, Math.sin(a), Math.cos(a)], u: [1, 0, 0], v: [0, Math.cos(a), -Math.sin(a)] }).lines.visible;
      assert(T.some(function (l) { return Math.abs(l[1] - l[3]) < 1e-9 && Math.abs(l[1]) > 9 && Math.abs(l[1]) < 10 - 1e-3; }), 'facet silhouette ' + segsStr(T));
      return 'iso ' + JSON.stringify(iso.stats);
    });
  })();
  // ==== TRUE CURVES DRAWING TESTS END ====

  group('true curves: STEP');
  // ==== TRUE CURVES STEP TESTS BEGIN ====
  (function () {
    group('true curves: STEP');
    var X = typeof Exchange !== 'undefined' ? Exchange : null, PI = Math.PI;
    function needX() { if (!X) fail('exchange.js is not loaded (Exchange is undefined)'); }
    function count(re, text) { return (text.match(re) || []).length; }
    function exampleByName(n) { var ex = AnvilExamples.filter(function (e) { return e.name === n; })[0]; if (!ex) fail('no example ' + n); return ex; }
    function fixture(name) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'fixtures/' + name, false);
      xhr.send();
      if (xhr.status !== 200) fail('fixture ' + name + ': HTTP ' + xhr.status);
      return xhr.responseText;
    }
    // exact volume of an import: its solids as an Imported feature, measured by massProps
    function exactOf(res) {
      var b = K.rebuild(X.newPartFromImport(res));
      return (b.bodies && b.bodies.length ? b.bodies : [b.body]).reduce(function (s, body) { return s + K.massProps(K.meshFromBody(body), 1).volume; }, 0);
    }
    // every EDGE_CURVE is used by exactly two ORIENTED_EDGEs (a seam: twice by its one face); returns the count
    function edgeUses(step, label) {
      var st = X.parseStep(step), uses = {}, ids = [];
      Object.keys(st.ents).forEach(function (id) {
        var e = st.ents[id];
        if (e.t === 'ORIENTED_EDGE') uses[e.a[3].r] = (uses[e.a[3].r] || 0) + 1;
        if (e.t === 'EDGE_CURVE') ids.push(id);
      });
      ids.forEach(function (id) { assert(uses[id] === 2, label + ': EDGE_CURVE #' + id + ' used ' + uses[id] + ' times'); });
      return ids.length;
    }
    function entity(step, type) { var st = X.parseStep(step); return Object.keys(st.ents).map(function (id) { return st.ents[id]; }).filter(function (e) { return e.t === type; }); }
    var CASES = [
      ['cylinder r10 h20', 'p.cylinder(10, 20);', PI * 100 * 20],
      ['plate with bolt holes', null, 100 * 60 * 8 - 4 * PI * 16 * 8],
      ['through hole', 'p.box(100, 60, 10); p.hole("Top", 50, -30, 8, { offset: 10 });', 60000 - PI * 16 * 10],
      ['blind hole', 'p.box(100, 60, 20); p.sketch("Top", 20).circle(50, -30, 5).extrude(8, { cut: true, reverse: true });', 120000 - PI * 25 * 8],
      ['counterbore', 'p.box(100, 60, 20); p.hole("Top", 50, -30, 10, { offset: 20 }); p.sketch("Top", 20).circle(50, -30, 8).extrude(6, { cut: true, reverse: true });', 120000 - PI * 25 * 14 - PI * 64 * 6],
      ['boss on a plate', 'p.box(100, 60, 10); p.sketch("Top", 10).circle(50, -30, 5).extrude(15);', 60000 + PI * 25 * 15],
      ['cone r10 h20', 'p.sketch("Front").polyline([[0, 0], [10, 0], [0, 20]], true).revolve(360);', PI * 100 * 20 / 3],
      ['frustum', 'p.sketch("Front").polyline([[0, 0], [10, 0], [5, 20], [0, 20]], true).revolve(360);', PI * 20 / 3 * (100 + 50 + 25)],
      ['sphere r10', 'p.sketch("Front").line(0, -10, 0, 10).arc(0, 0, 10, -90, 90).end().revolve(360);', 4 / 3 * PI * 1000],
      ['torus R30 r5', 'p.sketch("Front").circle(30, 0, 5).revolve(360);', 2 * PI * PI * 30 * 25],
      // half a torus (the outer half of the tube) on a cylinder: a torus band with a meridian-arc seam; Pappus: the half
      // disc's area πr²/2 at its centroid radius R + 4r/3π, plus nothing inside (the cylinder face closes it)
      ['half torus', 'p.sketch("Front").line(30, -5, 30, 5).arc(30, 0, 5, -90, 90).end().revolve(360);', 2 * PI * (30 + 4 * 5 / (3 * PI)) * PI * 25 / 2],
      ['quarter tube (partial revolve)', 'p.sketch("Front").rect(10, 0, 10, 5).revolve(90);', PI * (400 - 100) * 5 / 4],
      ['slot', 'p.sketch("Top").slot(0, 0, 30, 0, 10).extrude(5);', (30 * 10 + PI * 25) * 5]
    ];
    function buildCase(c) { return c[1] ? build(c[1]) : buildExample(exampleByName('Plate with bolt holes')); }

    test('export: a cylinder is two PLANE caps and one CYLINDRICAL_SURFACE face bounded by two CIRCLEs and a seam LINE the face uses twice (OpenCascade\'s layout); the bolt-hole plate has 4 hole cylinders and 8 rim CIRCLEs in its top and bottom loops', function () {
      needX();
      var r = build('p.name("Cyl"); p.cylinder(10, 20);'), step = X.exportSTEP(r.model, r.build);
      assert(count(/=ADVANCED_FACE\(/g, step) === 3 && count(/=PLANE\(/g, step) === 2 && count(/=CYLINDRICAL_SURFACE\(/g, step) === 1, 'faces');
      assert(/=CYLINDRICAL_SURFACE\('',#\d+,10\.\)/.test(step) && count(/=CIRCLE\('',#\d+,10\.\)/g, step) === 2, 'radius 10 surface and circles');
      assert(count(/=LINE\(/g, step) === 1 && /=VECTOR\('',#\d+,20\.\)/.test(step), 'one seam LINE of length 20');
      assert(edgeUses(step, 'cylinder') === 3, 'three EDGE_CURVEs: two circles and the seam');
      var cyl = entity(step, 'CYLINDRICAL_SURFACE')[0], face = entity(step, 'ADVANCED_FACE').filter(function (f) { return f.a[2].r === +/#(\d+)=CYLINDRICAL_SURFACE/.exec(step)[1]; })[0];
      assert(cyl && face && face.a[3].e === 'T', 'the side face follows the surface normal (outward)');
      var p = buildExample(exampleByName('Plate with bolt holes')), ps = X.exportSTEP(p.model, p.build);
      assert(count(/=CYLINDRICAL_SURFACE\('',#\d+,4\.\)/g, ps) === 4 && count(/=CIRCLE\('',#\d+,4\.\)/g, ps) === 8 && count(/=ADVANCED_FACE\(/g, ps) === 10, 'plate: 4 cylinders, 8 circles, 10 faces');
      // the holes are concave: their faces run against the surface normal
      assert(entity(ps, 'ADVANCED_FACE').filter(function (f) { return f.a[3].e === 'F'; }).length === 4, 'hole faces .F.');
      edgeUses(ps, 'plate');
      return 'cylinder ' + step.length + ' bytes, plate ' + count(/=EDGE_CURVE\(/g, ps) + ' edges';
    });

    test('export: cone and frustum on CONICAL_SURFACE (semi-angle atan(r/h), atan(5/20)), a sphere on SPHERICAL_SURFACE bounded by a VERTEX_LOOP, a torus on TOROIDAL_SURFACE (R 30, r 5) with its two seam circles, a half torus with a meridian-arc seam; partial revolves and slots are plain cylinder patches of arcs and rulings; every EDGE_CURVE used twice', function () {
      needX();
      function stepOf(code) { var r = build(code); return X.exportSTEP(r.model, r.build); }
      var cone = stepOf(CASES[6][1]), c = entity(cone, 'CONICAL_SURFACE');
      assert(c.length === 1 && count(/=CIRCLE\(/g, cone) === 1 && count(/=ADVANCED_FACE\(/g, cone) === 2, 'cone: one conical face on one circle and its base');
      near(+c[0].a[3], Math.atan(10 / 20), 1e-12, 'cone semi-angle');
      edgeUses(cone, 'cone');
      var fr = stepOf(CASES[7][1]), cf = entity(fr, 'CONICAL_SURFACE');
      assert(cf.length === 1 && count(/=CIRCLE\(/g, fr) === 2, 'frustum: a band between two circles');
      near(+cf[0].a[3], Math.atan(5 / 20), 1e-12, 'frustum semi-angle');
      edgeUses(fr, 'frustum');
      var sph = stepOf(CASES[8][1]);
      assert(count(/=SPHERICAL_SURFACE\('',#\d+,10\.\)/g, sph) === 1 && count(/=VERTEX_LOOP\(/g, sph) === 1 && count(/=EDGE_CURVE\(/g, sph) === 0 && count(/=ADVANCED_FACE\(/g, sph) === 1, 'sphere: one face on a VERTEX_LOOP');
      var tor = stepOf(CASES[9][1]);
      assert(count(/=TOROIDAL_SURFACE\('',#\d+,30\.,5\.\)/g, tor) === 1 && count(/=ADVANCED_FACE\(/g, tor) === 1, 'torus: one face');
      assert(edgeUses(tor, 'torus') === 2 && count(/=CIRCLE\('',#\d+,35\.\)/g, tor) === 1 && count(/=CIRCLE\('',#\d+,5\.\)/g, tor) === 1, 'torus seams: the outer circle (35) and the tube circle (5)');
      var ht = stepOf(CASES[10][1]);
      assert(count(/=TOROIDAL_SURFACE\(/g, ht) === 1 && count(/=CYLINDRICAL_SURFACE\(/g, ht) === 1 && count(/=PLANE\(/g, ht) === 0, 'half torus: a torus band and the inner cylinder');
      edgeUses(ht, 'half torus');
      var tube = stepOf(CASES[11][1]);
      assert(count(/=CYLINDRICAL_SURFACE\(/g, tube) === 2 && count(/=PLANE\(/g, tube) === 4 && count(/=CIRCLE\(/g, tube) === 4, 'quarter tube: two cylinder patches, four planes, four circles');
      edgeUses(tube, 'quarter tube');
      var slot = stepOf(CASES[12][1]);
      assert(count(/=CYLINDRICAL_SURFACE\(/g, slot) === 2 && count(/=PLANE\(/g, slot) === 4, 'slot: two half cylinders, four planes');
      edgeUses(slot, 'slot');
      return 'ok';
    });

    test('round trip: our STEP export re-imports to the exact massProps volume (1e-9) of cylinders, the bolt-hole plate, through / blind / counterbored holes, a boss, cone, frustum, sphere, torus, half torus, a partial revolve and a slot; closed meshes whose triangles carry the surface records', function () {
      needX();
      var out = [];
      CASES.forEach(function (c) {
        var r = buildCase(c), res = X.importFile('rt.step', X.exportSTEP(r.model, r.build));
        nearRel(r.mp.volume, c[2], 1e-9, c[0] + ' kernel volume');
        assert(res.solids.length === 1 && res.stats.openEdges === 0 && !res.warnings.length, c[0] + ': ' + res.solids.length + ' solids, ' + res.stats.openEdges + ' open edges ' + res.warnings.join('|'));
        assert(res.solids[0].curves && res.solids[0].curves.surfs.length >= 1, c[0] + ': surface records');
        var v = exactOf(res);
        nearRel(v, c[2], 1e-9, c[0] + ' re-imported volume');
        out.push(c[0] + ' ' + ((v - c[2]) / c[2]).toExponential(0));
      });
      return out.join(', ');
    });

    test('the Imported feature keeps the surface records: exact after pack / unpack, cacheFromBuild, the p.importMesh script round trip, a cut against it (plate − Ø10 hole), and an inch part imported into mm and into inches', function () {
      needX();
      var r = buildExample(exampleByName('Plate with bolt holes')), want = 100 * 60 * 8 - 4 * PI * 16 * 8;
      var m = X.newPartFromImport(X.importFile('plate.step', X.exportSTEP(r.model, r.build)));
      assert(typeof m.features[0].solids[0].curves.tri === 'string', 'records stored with the feature (base64 triangle map)');
      var b = K.rebuild(m);
      nearRel(K.massProps(K.meshFromBody(b.body)).volume, want, 1e-9, 'imported plate');
      nearRel(K.massProps(K.meshFromBody(K.unpackBuild(K.packBuild(b, m)).body)).volume, want, 1e-9, 'pack / unpack');
      nearRel(K.massProps(K.meshFromBody(K.rebuild(m, K.cacheFromBuild(m, b)).body)).volume, want, 1e-9, 'cacheFromBuild');
      var m2 = K.newModel('x');
      K.runScript(m2, K.generateScript(m));
      nearRel(K.massProps(K.meshFromBody(K.rebuild(m2).body)).volume, want, 1e-9, 'script round trip');
      new K.Builder(m).hole('Top', 50, -30, 10, { offset: 8 });
      nearRel(K.massProps(K.meshFromBody(K.rebuild(m).body)).volume, want - PI * 25 * 8, 1e-9, 'a Ø10 hole cut through the imported plate');
      var ri = build('p.units("in"); p.cylinder(1, 2);'), si = X.exportSTEP(ri.model, ri.build);
      assert(/CONVERSION_BASED_UNIT\('INCH',/.test(si) && /=CYLINDRICAL_SURFACE\('',#\d+,1\.\)/.test(si), 'inch cylinder r = 1 in');
      nearRel(exactOf(X.importFile('i.step', si, { units: 'in' })), 2 * PI, 1e-9, 'into inches');
      nearRel(exactOf(X.importFile('i.step', si, { units: 'mm' })), 2 * PI * Math.pow(25.4, 3), 1e-9, 'into mm (records scaled by 25.4)');
      return 'ok';
    });

    test('fallback: crossing holes (a cylinder meeting another cylinder) keep planar facets in a closed shell; a Pinned plate assembly writes its 5 cylinders and 10 circles and re-imports exactly per instance', function () {
      needX();
      var r = build('p.box(40, 40, 40); p.sketch("Top", 40).circle(20, -20, 5).extrude(40, { cut: true, reverse: true }); p.sketch("Front", 40).circle(20, 20, 5).extrude(40, { cut: true, reverse: true });');
      var step = X.exportSTEP(r.model, r.build);
      assert(count(/=CYLINDRICAL_SURFACE\(/g, step) === 0 && count(/=ADVANCED_FACE\(/g, step) === count(/=PLANE\(/g, step), 'crossing holes: facets only');
      edgeUses(step, 'crossing holes');
      var a = buildExample(exampleByName('Pinned plate assembly')), as = X.exportSTEP(a.model, a.build);
      assert(count(/=CYLINDRICAL_SURFACE\(/g, as) === 5 && count(/=CIRCLE\(/g, as) === 10, 'plate holes + pin: ' + count(/=CYLINDRICAL_SURFACE\(/g, as) + ' cylinders, ' + count(/=CIRCLE\(/g, as) + ' circles');
      edgeUses(as, 'assembly');
      var res = X.importFile('asm.step', as), pin = PI * 16 * 20;
      var vols = res.solids.map(function (s) { return exactOf({ solids: [s], units: res.units, format: 'step', file: 'asm.step' }); });
      nearRel(vols[0], 100 * 60 * 8 - 4 * PI * 16 * 8, 1e-9, 'Plate');
      nearRel(vols[1], pin, 1e-9, 'Pin<1>'); nearRel(vols[2], pin, 1e-9, 'Pin<2>'); nearRel(vols[3], 30 * 20 * 5, 1e-9, 'Cap');
      return 'ok';
    });

    test('import: a hand-written STEP cylinder (r 5, h 10: one face on CYLINDRICAL_SURFACE bounded by two full CIRCLEs and a seam, two planar caps on the circles) measures 250π exactly; B-spline faces are still refused by name', function () {
      needX();
      var cyl = ['ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION((''),'2;1');", "FILE_NAME('cyl.step','',(''),(''),'','','');", "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));", 'ENDSEC;', 'DATA;',
        "#1=CARTESIAN_POINT('',(0.,0.,0.));", "#2=CARTESIAN_POINT('',(0.,0.,10.));", "#3=DIRECTION('',(0.,0.,1.));", "#4=DIRECTION('',(1.,0.,0.));",
        "#5=AXIS2_PLACEMENT_3D('',#1,#3,#4);", "#6=AXIS2_PLACEMENT_3D('',#2,#3,#4);", "#7=CARTESIAN_POINT('',(5.,0.,0.));", "#8=CARTESIAN_POINT('',(5.,0.,10.));",
        "#9=VERTEX_POINT('',#7);", "#10=VERTEX_POINT('',#8);", "#11=CIRCLE('',#5,5.);", "#12=CIRCLE('',#6,5.);",
        "#13=EDGE_CURVE('',#9,#9,#11,.T.);", "#14=EDGE_CURVE('',#10,#10,#12,.T.);", "#15=VECTOR('',#3,10.);", "#16=LINE('',#7,#15);", "#17=EDGE_CURVE('',#9,#10,#16,.T.);",
        "#18=CYLINDRICAL_SURFACE('',#5,5.);", "#19=EDGE_LOOP('',(#20,#21,#22,#23));", "#20=ORIENTED_EDGE('',*,*,#13,.T.);", "#21=ORIENTED_EDGE('',*,*,#17,.T.);",
        "#22=ORIENTED_EDGE('',*,*,#14,.F.);", "#23=ORIENTED_EDGE('',*,*,#17,.F.);", "#24=FACE_BOUND('',#19,.T.);", "#25=ADVANCED_FACE('',(#24),#18,.T.);",
        "#26=PLANE('',#5);", "#27=EDGE_LOOP('',(#28));", "#28=ORIENTED_EDGE('',*,*,#13,.F.);", "#29=FACE_OUTER_BOUND('',#27,.T.);", "#30=ADVANCED_FACE('',(#29),#26,.F.);",
        "#31=PLANE('',#6);", "#32=EDGE_LOOP('',(#33));", "#33=ORIENTED_EDGE('',*,*,#14,.T.);", "#34=FACE_OUTER_BOUND('',#32,.T.);", "#35=ADVANCED_FACE('',(#34),#31,.T.);",
        "#36=CLOSED_SHELL('',(#25,#30,#35));", "#37=MANIFOLD_SOLID_BREP('Cyl',#36);", '#38=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));', 'ENDSEC;', 'END-ISO-10303-21;'].join('\n');
      var res = X.importFile('cyl.step', cyl);
      assert(res.solids.length === 1 && res.solids[0].name === 'Cyl' && res.stats.openEdges === 0 && !res.warnings.length, 'solid: ' + res.stats.openEdges + ' open ' + res.warnings.join('|'));
      var S = res.solids[0].curves.surfs;
      assert(S.length === 1 && S[0].t === 'cyl' && S[0].r === 5, 'one cylinder record ' + JSON.stringify(S));
      // the side is tessellated on the chord tolerance: Kernel.segsForRadius(5) facets around, every one on the record
      var tri = res.solids[0].curves.tri, tagged = tri.filter(function (k) { return k > 0; }).length;
      assert(tagged === 2 * K.segsForRadius(5), 'side triangles ' + tagged + ' vs 2 × ' + K.segsForRadius(5));
      nearRel(exactOf(res), 250 * PI, 1e-12, 'volume πr²h');
      var bsp = cyl.replace("#18=CYLINDRICAL_SURFACE('',#5,5.);", "#18=B_SPLINE_SURFACE_WITH_KNOTS('',1,1,((#7,#8),(#1,#2)),.UNSPECIFIED.,.F.,.F.,.F.,(2,2),(2,2),(0.,1.),(0.,1.),.UNSPECIFIED.);"), msg = '';
      try { X.importFile('bsp.step', bsp); } catch (e) { msg = e.message; }
      assert(/curved faces \(1 B_SPLINE_SURFACE_WITH_KNOTS\)/.test(msg), 'B-spline refused: ' + msg);
      return tagged + ' side triangles';
    });

    test('import of OpenCascade 8.0 files (fixtures, SURFACE_CURVE / SEAM_CURVE with pcurves): cylinder 2000π, frustum 20π/3·175, sphere (VERTEX_LOOP) 4000π/3, torus (R 20, r 5) 1000π², plate with four Ø8 holes 48000 − 512π, all exact to 1e-9 and closed', function () {
      needX();
      var cases = [['occ-cylinder.step', 2000 * PI], ['occ-frustum.step', 20 * PI / 3 * 175], ['occ-sphere.step', 4000 * PI / 3], ['occ-torus.step', 2 * PI * PI * 20 * 25], ['occ-plate-holes.step', 48000 - 4 * PI * 16 * 8]], out = [];
      cases.forEach(function (c) {
        var res = X.importFile(c[0], fixture(c[0]));
        assert(res.solids.length === 1 && res.stats.openEdges === 0 && !res.warnings.length, c[0] + ': ' + res.solids.length + ' solids, ' + res.stats.openEdges + ' open ' + res.warnings.join('|'));
        var v = exactOf(res);
        nearRel(v, c[1], 1e-9, c[0]);
        out.push(c[0].replace(/^occ-|\.step$/g, '') + ' ' + ((v - c[1]) / c[1]).toExponential(0));
      });
      return out.join(', ');
    });
  })();
  // ==== TRUE CURVES STEP TESTS END ====

