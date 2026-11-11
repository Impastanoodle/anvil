  // --- rfKY (2026-11-11, lane occtparity: test-reports/2026-11-11-occt-sheetmetal-parity.md) --- OpenCascade now builds
  // Forming Tools and Lofted-Bends from Anvil's own plain data (occt-kernel.js formingToolOp / loftedBendTool; rows
  // "rfKY" in tests/occt-tests.html). These rows pin what that port reads: Kernel.formingToolLayout's sections (closed
  // paths of points and { c, r } arcs, a frame each, revolved about the frame's y or extruded along its n) and its
  // footprint cut, the record the flat reads (build.planes[id]), and Kernel.buildLoftedBend's polygons (each planar:
  // OpenCascade sews them as plane faces), for every tool and both Lofted-Bend methods.
  (function () {
    group('rfKY: the data OpenCascade\'s Forming Tool and Lofted-Bend read (layout sections, footprint, record, planar facets)');
    var T = 0.0747, S = 'p.units("in");\np.sheet(' + T + ', 0.06, 0.5);\n', B = S + 'p.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n';
    var A = 'var a = p.sketch("Top").polyline([[0, -2], [2, -2], [2, 2], [-2, 2], [-2, -2], [-0.001, -2]], false).id();\n';
    var RND = 'var b = p.sketch("Top", 3).arc(0, 0, 1, 270.03, 360).arc(0, 0, 1, 0, 90).arc(0, 0, 1, 90, 180).arc(0, 0, 1, 180, 270).id();\n';
    function rfKYunit(v) { return Math.abs(Math.hypot(v[0], v[1], v[2]) - 1) < 1e-9; }

    test('rfKY: Kernel.formingToolLayout for every tool: closed section paths (points with { c, r } arcs), a frame each (unit x, y, n), revolved (rev) or extruded (depth > 0); a footprint cut T + 2 % deep; the record in build.planes', function () {
      ['dimple', 'extrudedHole', 'louver', 'lance', 'rib'].forEach(function (tool) {
        var r = build(B + 'p.formingTool("' + tool + '", [3, ' + T + ', 2]);\n');
        noErrors(r);
        var f = r.model.features[r.model.features.length - 1];
        var body = K.rebuild(Object.assign({}, r.model, { features: r.model.features.slice(0, -1) })).body;
        var lay = K.formingToolLayout(f, r.model, { body: body });
        assert(lay.solids.length >= 1, tool + ': no sections');
        lay.solids.forEach(function (s, i) {
          var pts = s.path.filter(function (q) { return Array.isArray(q); });
          assert(pts.length >= 3 && Array.isArray(s.path[0]), tool + ' section ' + i + ': starts on a point, ' + pts.length + ' points');
          s.path.forEach(function (q) { if (!Array.isArray(q)) assert(q.c && q.c.length === 2 && q.r > 0, tool + ' section ' + i + ': arc ' + JSON.stringify(q)); });
          assert(rfKYunit(s.plane.x) && rfKYunit(s.plane.y) && rfKYunit(s.plane.n), tool + ' section ' + i + ': frame not unit');
          assert(s.rev ? s.rev > 0 && s.rev <= 360 : s.depth > 0, tool + ' section ' + i + ': neither revolved nor extruded (' + s.rev + ', ' + s.depth + ')');
        });
        assert(lay.cut.ents.length >= 1, tool + ': no footprint');
        near(lay.cut.depth, T * 1.02, 1e-12, tool + ': footprint depth');
        assert(r.build.planes[f.id] && r.build.planes[f.id].refgeo === 'formingTool', tool + ': record in build.planes');
      });
    });

    test('rfKY: Kernel.buildLoftedBend (bent, formed, square to square / round): every polygon planar to 1e-9, a closed solid of positive volume', function () {
      [[A + 'var b = p.sketch("Top", 3).polyline([[0, -1], [1, -1], [1, 1], [-1, 1], [-1, -1], [-0.0005, -1]], false).id();\n', ''],
        [A + RND, ''], [A + RND, ', { method: "formed" }']].forEach(function (c, ci) {
        var r = build(S + c[0] + 'p.loftedBend([a, b]' + c[1] + ');\n');
        noErrors(r);
        var f = r.model.features[r.model.features.length - 1], csg = K.buildLoftedBend(f, r.model, {}), worst = 0;
        csg.polygons.forEach(function (pg) {
          var n = pg.plane.normal, w = pg.plane.w;
          pg.vertices.forEach(function (v) { worst = Math.max(worst, Math.abs(n.x * v.pos.x + n.y * v.pos.y + n.z * v.pos.z - w)); });
        });
        assert(worst < 1e-9, 'case ' + ci + ': a polygon off its plane by ' + worst);
        assert(csg.volume() > 0, 'case ' + ci + ': volume ' + csg.volume());
        var q = K.meshQuality(K.meshFromBody(csg));
        assert(!q.openEdges && !q.nonManifoldEdges, 'case ' + ci + ': ' + q.openEdges + ' open, ' + q.nonManifoldEdges + ' non-manifold');
      });
    });
  })();
