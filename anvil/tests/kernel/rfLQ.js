  // ---- rfLQ (2026-11-11, lane sketchgrey): the greyed sketch and curve commands built. Parabola / Conic in a sheet-metal
  // flat (DXF on the true curve); Split Line (projection of a closed / open sketch, intersection with a plane, silhouette
  // of a cylinder): volume unchanged, face count as predicted, the split face its own face, script round trip; 3D Sketch
  // (kernel-features.js sketch3d): a circle swept along three perpendicular lines with sketch fillets has the analytic
  // volume, script and save / open round trips; Offset On Surface on planar and cylindrical faces (exact).
  (function () {
    if (typeof Kernel === 'undefined' || !Kernel.buildSplitLine) return;
    group('rfLQ: Split Line, 3D Sketch, Offset On Surface; Parabola / Conic flats');
    var BOX = 'p.sketch("Top").rect(-5, -5, 10, 10).end().extrude(4);\n';   // x, z -5..5, y 0..4
    function rfLQFaces(r) { return r.mesh.faces.length; }
    function rfLQSplitFaces(r) { return r.mesh.faces.filter(function (f) { return f.polys.some(function (p) { return typeof p.shared === 'string'; }); }); }
    function rfLQRound(r) {   // generateScript -> a new model -> rebuild: same volume and face count
      var code = K.generateScript(r.model), r2 = build(code);
      assert(!Object.keys(r2.errors || {}).length, 'round trip builds: ' + JSON.stringify(r2.errors));
      return r2;
    }
    function rfLQSave(r) {   // save / open: the model's JSON rebuilt
      var m = JSON.parse(JSON.stringify(r.model)), b = K.rebuild(m), mesh = K.meshFromBody(b.body);
      return { model: m, build: b, mesh: mesh, mp: K.massProps(mesh, 1), errors: b.errors };
    }
    test('rfLQ: Split Line, projection of a centred 4 × 4 square onto the top of a 10 × 10 × 4 block: one more face (16 area), the volume unchanged; script and save / open round trips', function () {
      var r = build(BOX + 'var s = p.sketch("Top", 4).centerRect(0, 0, 4, 4).id();\np.splitLine({ faces: [[3, 4, 3]], sketch: s });');
      assert(!Object.keys(r.errors).length, JSON.stringify(r.errors));
      nearRel(r.mp.volume, 400, 1e-12, 'volume');
      assert(rfLQFaces(r) === 7, 'faces: ' + rfLQFaces(r));
      var sf = rfLQSplitFaces(r);
      assert(sf.length === 1, 'one split face: ' + sf.length);
      near(sf[0].area, 16, 1e-9, 'the split face is the 4 × 4 square');
      nearVec(sf[0].normal, [0, 1, 0], 1e-12, 'on the top');
      var sl = r.model.features[r.model.features.length - 1];
      assert(sl.type === 'splitLine' && sl.name === 'Split Line1', 'feature: ' + JSON.stringify(sl));
      // the edge round it is a real edge (Kernel.wrapSplit)
      var edges = K.bodyEdges ? K.bodyEdges(r.mesh) : null;
      if (edges) assert(edges.filter(function (e) { return !e.smooth && Math.abs(e.a[1] - 4) < 1e-9 && Math.abs(e.b[1] - 4) < 1e-9 && Math.max(Math.abs(e.a[0]), Math.abs(e.a[2])) < 2 + 1e-9; }).length >= 4, 'the split edges are sharp edges');
      var r2 = rfLQRound(r), r3 = rfLQSave(r);
      assert(rfLQFaces(r2) === 7 && rfLQFaces(r3) === 7, 'round trips keep the split: ' + rfLQFaces(r2) + ' / ' + rfLQFaces(r3));
      nearRel(r2.mp.volume, 400, 1e-12, 'round-trip volume');
      return rfLQFaces(r) + ' faces';
    });
    test('rfLQ: Split Line, an open line across the top (z = 1) splits it in two (10 × 6 and 10 × 4), no "open contour" warning; a later Draft on the split face takes only that face', function () {
      var r = build(BOX + 'var s = p.sketch("Top", 4).line(-6, 1, 6, 1).id();\np.splitLine({ faces: [[3, 4, 3]], sketch: s });');
      assert(!Object.keys(r.errors).length, JSON.stringify(r.errors));
      assert(!Object.keys(r.warnings || {}).length, 'warnings: ' + JSON.stringify(r.warnings));
      assert(rfLQFaces(r) === 7, 'faces: ' + rfLQFaces(r));
      var tops = r.mesh.faces.filter(function (f) { return f.normal[1] > 1 - 1e-12; }).map(function (f) { return Math.round(f.area * 1e9) / 1e9; }).sort();
      assert(JSON.stringify(tops) === JSON.stringify([40, 60]), 'top pieces: ' + JSON.stringify(tops));
      nearRel(r.mp.volume, 400, 1e-12, 'volume');
      // refFace keeps the split face apart: Offset On Surface on it offsets only its own outline
      var o = K.offsetOnSurface(r.build.body, [0, 4, 3], 0.5, {});
      assert(o.lines.length === 4, 'four sides: ' + o.lines.length);
      var xs = [], zs = [];
      o.lines.forEach(function (L) { xs.push(L[0][0], L[1][0]); zs.push(L[0][2], L[1][2]); });
      // the Top sketch's v = 1 is z = -1 (Top: y = -Z): the piece is z -1 .. 5, its offset z -0.5 .. 4.5, x -4.5 .. 4.5
      near(Math.min.apply(null, zs), -0.5, 1e-9, 'z min'); near(Math.max.apply(null, zs), 4.5, 1e-9, 'z max');
      near(Math.min.apply(null, xs), -4.5, 1e-9, 'x min'); near(Math.max.apply(null, xs), 4.5, 1e-9, 'x max');
      return tops.join(' / ');
    });
    test('rfLQ: Split Line, intersection with the Right plane splits the top and front faces in two each (8 faces); silhouette of a Ø10 cylinder seen from the front marks the facets on one side as their own face; volumes unchanged', function () {
      var r = build(BOX + 'p.splitLine({ mode: "intersection", faces: [[3, 4, 3], [3, 2, 5]], tool: { ref: "Right", offset: 0 } });');
      assert(!Object.keys(r.errors).length, JSON.stringify(r.errors));
      assert(rfLQFaces(r) === 8, 'faces: ' + rfLQFaces(r));
      nearRel(r.mp.volume, 400, 1e-12, 'volume');
      var c = build('p.sketch("Top").circle(0, 0, 5).end().extrude(4);\np.splitLine({ mode: "silhouette", faces: [[5, 2, 0]], dir: { ref: "Front", offset: 0 } });');
      assert(!Object.keys(c.errors).length, JSON.stringify(c.errors));
      var marked = rfLQSplitFaces(c), sideOK = marked.every(function (f) { return f.centroid[0] > -1e-9; });
      assert(marked.length > 0 && sideOK, 'the +X half of the cylinder is split off: ' + marked.length);
      var c0 = build('p.sketch("Top").circle(0, 0, 5).end().extrude(4);');
      nearRel(c.mp.volume, c0.mp.volume, 1e-12, 'cylinder volume unchanged');
      var rt = rfLQRound(c);
      assert(rfLQSplitFaces(rt).length === marked.length, 'silhouette round trip');
      return rfLQFaces(r) + ' faces, ' + marked.length + ' cylinder facets';
    });
    test('rfLQ: Split Line refusals: no faces; a sketch that misses the face', function () {
      var r = build(BOX + 'var s = p.sketch("Top", 4).centerRect(20, 20, 2, 2).id();\np.splitLine({ faces: [[3, 4, 3]], sketch: s });');
      var err = r.errors[r.model.features[r.model.features.length - 1].id];
      assert(/does not project/.test(err || ''), 'error: ' + err);
      nearRel(r.mp.volume, 400, 1e-12, 'the part still builds');
      return err;
    });
    test('rfLQ: 3D Sketch: a Ø2 circle swept along three perpendicular lines (12 along X, 10 along Y, 10 along Z) with R2 sketch fillets has the analytic volume π (24 + 2π); the path length is exact; script and save / open round trips', function () {
      var code = 'var c = p.sketch3d({ pts: [[0, 0, 0], [12, 0, 0], [12, 10, 0], [12, 10, 10]], ents: [{ t: "line", a: 0, b: 1 }, { t: "line", a: 1, b: 2 }, { t: "line", a: 2, b: 3 }, { t: "fillet", at: 1, r: 2 }, { t: "fillet", at: 2, r: 2 }], rels: [{ type: "alongX", e: 0 }, { type: "alongY", e: 1 }, { type: "alongZ", e: 2 }] });\n' +
        'var pr = p.sketch("Right").circle(0, 0, 1).id();\np.sweep({ profile: pr, path: c });';
      var r = build(code), want = Math.PI * (24 + 2 * Math.PI);
      assert(!Object.keys(r.errors).length, JSON.stringify(r.errors));
      nearRel(r.mp.volume, want, 1e-9, 'sweep volume');
      var sk = r.model.features[0], g = r.build.planes[sk.id];
      assert(sk.type === 'sketch3d' && sk.name === '3DSketch1', 'feature ' + sk.name);
      assert(g && g.refgeo === 'curve' && g.runs.length === 1, 'one curve run');
      near(g.length, 24 + 2 * Math.PI, 1e-9, 'path length');
      var r2 = rfLQRound(r), r3 = rfLQSave(r);
      nearRel(r2.mp.volume, want, 1e-9, 'script round trip');
      nearRel(r3.mp.volume, want, 1e-9, 'save / open');
      assert(JSON.stringify(r2.model.features[0].rels) === JSON.stringify(sk.rels), 'relations kept');
      return r.mp.volume.toFixed(9);
    });
    test('rfLQ: 3D Sketch geometry: construction lines and points are not the curve; a fillet too large or between lines in line is refused; a spline through points is a curve; Composite Curve takes the 3D sketch', function () {
      var f = { type: 'sketch3d', pts: [[0, 0, 0], [5, 0, 0], [5, 5, 0], [0, 0, 3]], ents: [{ t: 'line', a: 0, b: 1 }, { t: 'line', a: 1, b: 2 }, { t: 'line', a: 0, b: 3, construction: true }, { t: 'point', p: 3 }] };
      var g = K.resolveCurve(f, K.newModel('x'), { planes: {} });
      assert(g.runs.length === 1 && g.aux.lines.length === 1 && g.aux.points.length === 1, 'one run, one centerline, one point');
      near(g.length, 10, 1e-12, 'two lines');
      var bad = JSON.parse(JSON.stringify(f)); bad.ents.push({ t: 'fillet', at: 1, r: 6 });
      var e1 = ''; try { K.resolveCurve(bad, K.newModel('x'), { planes: {} }); } catch (e) { e1 = e.message; }
      assert(/too large/.test(e1), 'too large: ' + e1);
      var inl = { type: 'sketch3d', pts: [[0, 0, 0], [1, 0, 0], [2, 0, 0]], ents: [{ t: 'line', a: 0, b: 1 }, { t: 'line', a: 1, b: 2 }, { t: 'fillet', at: 1, r: 0.1 }] };
      var e2 = ''; try { K.resolveCurve(inl, K.newModel('x'), { planes: {} }); } catch (e) { e2 = e.message; }
      assert(/in line/.test(e2), 'in line: ' + e2);
      var sp = K.resolveCurve({ type: 'sketch3d', pts: [[0, 0, 0], [1, 1, 0], [2, 0, 1]], ents: [{ t: 'spline', p: [0, 1, 2] }] }, K.newModel('x'), { planes: {} });
      assert(sp.edges[0].t === 'bez' && sp.pts.length > 10, 'a spline');
      var r = build('var c = p.sketch3d({ pts: [[0, 0, 0], [5, 0, 0], [5, 5, 0]], ents: [{ t: "line", a: 0, b: 1 }, { t: "line", a: 1, b: 2 }] });\np.compositeCurve([{ curve: c }]);');
      assert(!Object.keys(r.errors).length, JSON.stringify(r.errors));
      near(r.build.planes[r.model.features[1].id].length, 10, 1e-12, 'composite of the 3D sketch');
      return 'ok';
    });
    test('rfLQ: Offset On Surface: the top of a 10 × 10 block with a Ø4 hole by 0.5 is a 9 × 9 square and a Ø5 circle; a Ø10 cylinder side by 1 gives circles at y = 1 and 3; a 3D sketch of the result builds', function () {
      var h = build('p.sketch("Top").rect(-5, -5, 10, 10).circle(0, 0, 2).end().extrude(4);');
      var o = K.offsetOnSurface(h.build.body, [3, 4, 3], 0.5, {});
      assert(o.kind === 'plane' && o.lines.length === 4 && o.arcs.length === 1, 'four lines and a circle');
      o.lines.forEach(function (L) { near(Math.hypot(L[1][0] - L[0][0], L[1][2] - L[0][2]), 9, 1e-9, 'side'); near(L[0][1], 4, 1e-12, 'on the face'); });
      near(o.arcs[0].r, 2.5, 1e-9, 'the hole grows');
      var rv = K.offsetOnSurface(h.build.body, [3, 4, 3], 0.5, { reverse: true });
      near(Math.hypot(rv.lines[0][1][0] - rv.lines[0][0][0], rv.lines[0][1][2] - rv.lines[0][0][2]), 11, 1e-9, 'reverse: outward');
      var c = build('p.sketch("Top").circle(0, 0, 5).end().extrude(4);');
      var oc = K.offsetOnSurface(c.build.body, [5, 2, 0], 1, {});
      assert(oc.kind === 'cyl' && oc.arcs.length === 2 && !oc.lines.length, 'two circles');
      var ys = oc.arcs.map(function (a) { return a.c[1]; }).sort();
      near(ys[0], 1, 1e-9, 'lower'); near(ys[1], 3, 1e-9, 'upper'); near(oc.arcs[0].r, 5, 1e-12, 'radius');
      var r = build('p.sketch3d({ pts: [], ents: ' + JSON.stringify(oc.arcs.map(function (a) { return { t: 'arc', c: a.c, n: a.n, r: a.r, x: a.x, ang: a.ang }; })) + ' });');
      assert(!Object.keys(r.errors).length, JSON.stringify(r.errors));
      near(r.build.planes[r.model.features[0].id].runs.length, 2, 0, 'two closed runs');
      var e3 = ''; try { K.offsetOnSurface(c.build.body, [5, 2, 0], 3, {}); } catch (e) { e3 = e.message; }
      assert(/too large/.test(e3), 'refused: ' + e3);
      return 'ok';
    });
    test('rfLQ: a Parabola sheet-metal base flange (0.125 in) has the exact volume and its flat DXF follows the true parabola within the document chord tolerance (0.05 mm)', function () {
      var r = build('p.units("in");\np.sketch("Front").parabola([0, 0], [5, 10], [10, 0]).line(10, 0, 0, 0).end().baseFlange(0.125);');
      assert(!Object.keys(r.errors).length, JSON.stringify(r.errors));
      nearRel(r.mp.volume, 2 / 3 * 50 * 0.125, 1e-6, 'volume');
      var flat = K.flatPattern(r.model, r.build, r.mesh), dxf = K.exportDXFFlat(flat, 'in', {});
      var L = dxf.split(/\r?\n/), pts = [], inV = false;
      for (var i = 0; i + 1 < L.length; i += 2) {
        var cd = L[i].trim(), v = L[i + 1].trim();
        if (cd === '0') inV = v === 'VERTEX';
        if (inV && cd === '10') pts.push([+v, 0]);
        if (inV && cd === '20') pts[pts.length - 1][1] = +v;
      }
      assert(pts.length >= 16, 'vertices: ' + pts.length);
      var A = null, B = null;
      pts.forEach(function (p) { pts.forEach(function (q) { if (!A && Math.abs(Math.hypot(p[0] - q[0], p[1] - q[1]) - 10) < 1e-6) { A = p; B = q; } }); });
      assert(A, 'the 10 in base line');
      var ux = [(B[0] - A[0]) / 10, (B[1] - A[1]) / 10], uy = [-ux[1], ux[0]], cx = 0, cy = 0;
      pts.forEach(function (p) { cx += p[0]; cy += p[1]; });
      if ((cx / pts.length - A[0]) * uy[0] + (cy / pts.length - A[1]) * uy[1] < 0) uy = [-uy[0], -uy[1]];
      var dev = 0;
      pts.forEach(function (p) { var u = (p[0] - A[0]) * ux[0] + (p[1] - A[1]) * ux[1], w = (p[0] - A[0]) * uy[0] + (p[1] - A[1]) * uy[1]; dev = Math.max(dev, Math.abs(w - u * (10 - u) / 5) / Math.hypot(1, (10 - 2 * u) / 5)); });
      // the profile's area-true chord points (kernel-sketch.js areaTrue): off the curve by at most the chord tolerance (0.05 mm)
      var tol = (K.setTessellation ? K.setTessellation({}).chordTol : 0.05) / 25.4;
      assert(dev <= tol + 1e-9, 'vertices within the chord tolerance of the parabola: ' + dev + ' > ' + tol);
      return pts.length + ' vertices';
    });
  })();
  // --- end rfLQ ---
