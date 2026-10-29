  // --- rfFG (2026-10-29, lane FG: no stray triangles on solids) --- revolved, dished, filleted wheels on Anvil's own
  // engine. The BSP booleans leave sliver polygons (a few 1e-4 wide) next to fillet ends; they broke face outlines
  // (kernel-mesh.js faceOutline): a true corner between two tiny pieces was dropped as "collinear", a crack left a
  // chain dangling and the loop closed with a chord across the face, a duplicate sliver cancelled a real boundary
  // edge. bodyEdges then drew a line across the face (the "small triangle") and left short unpaired segments along
  // tangent fillet edges ("<" marks). Checks on three parts: every face's outline encloses exactly the face's area,
  // every edge joins two faces, no face is a sliver (< 1e-6 of the part's area), no edge is shorter than 1e-4 of the
  // bounding diagonal; volumes are those of the mesh (the outline work never touches the body); face counts as
  // OpenCascade's B-rep (facets of one analytic surface or one fillet feature joined across smooth edges, as the
  // viewport's face groups) where no FF / FE work is needed: WHEEL 5 and DISH 7 faces in OpenCascade (2026-10-29,
  // anvil/headless occt build of the same scripts). GROOVE gives 11 against OpenCascade's 12 (Anvil merges the
  // two coplanar floor annuli into one face; 12 by chance before lane FK, when a band of the R0.15 fillet stood apart),
  // so its count is not asserted.
  (function () {
    group('rfFG: no stray triangles: face outlines and edges after booleans with slivers');
    var WHEEL = 'p.units("in");\n' +
      'p.sketch("Front").line(0,0,3,0).line(3,0,3,1.5).line(3,1.5,0,1.5).line(0,1.5,0,0).revolve(360);\n' +
      'p.sketch("Front").line(0,1.5,2.4,1.5).arc(2.4,2.7,1.2,-90,-40).line(2.4+1.2*Math.cos(-40*Math.PI/180),2.7+1.2*Math.sin(-40*Math.PI/180),0,3).line(0,3,0,1.5).revolveCut(360);\n' +
      'p.sketch("Front").arc(0,1.9,0.8,-90,-20).line(0.8*Math.cos(-20*Math.PI/180),1.9+0.8*Math.sin(-20*Math.PI/180),0,1.9+0.8*Math.sin(-20*Math.PI/180)).line(0,1.9+0.8*Math.sin(-20*Math.PI/180),0,1.1).revolveCut(360);\n' +
      'p.fillet(0.25,[[3,1.5,0]]);\n' +
      'p.sketch("Top",1.0).circle(0,0,1.3).circle(0,0,0.8).end();\n';
    var DISH = 'p.units("in");\n' +
      'p.sketch("Front").line(0,0,3,0).line(3,0,3,1.5).line(3,1.5,0,1.5).line(0,1.5,0,0).revolve(360);\n' +
      'var a = Math.asin((1.5-5)/4.1), x1 = 4.1*Math.cos(a);\n' +
      'p.sketch("Front").arc(0,5,4.1,-90,a*180/Math.PI).line(x1,1.5,x1,2).line(x1,2,0,2).line(0,2,0,0.9).revolveCut(360);\n' +
      'p.sketch("Front").arc(0,0.9,0.3,-90,90).line(0,1.2,0,0.6).revolveCut(360);\n' +
      'p.fillet(0.25,[[3,1.5,0]]);\np.fillet(0.15,[[x1,1.5,0]]);\n' +
      'p.sketch("Top",1.0).circle(0,0,1.3).circle(0,0,0.8).end();\n';
    var GROOVE = 'p.units("in");\n' +
      'p.sketch("Front").line(0,0,3,0).line(3,0,3,1.5).line(3,1.5,0,1.5).line(0,1.5,0,0).revolve(360);\n' +
      'p.sketch("Front").line(0,1.0,1.9,1.0).arc(1.9,1.6,0.6,-90,0).line(2.5,1.6,0,1.6).line(0,1.6,0,1.0).revolveCut(360);\n' +
      'p.sketch("Front").arc(0,1.0,0.35,-90,90).line(0,1.35,0,0.65).revolveCut(360);\n' +
      'p.sketch("Top",1.0).circle(0,0,1.3).circle(0,0,0.8).end().extrude(0.05,{cut:true,reverse:true});\n' +
      'p.fillet(0.25,[[3,1.5,0]]);\np.fillet(0.15,[[2.5,1.5,0]]);\n' +
      'p.sketch("Top",1.0).circle(0,0,1.6).circle(0,0,1.1).end();\n';
    // the app's inch tessellation (chord 0.002 in, 16..128 segments): the fine facets that make the slivers
    function rfFGBuild(code) {
      var prev = K.setTessellation();
      try { K.setTessellation({ chordTol: 0.002, minSegs: 16, maxSegs: 128, legacy: false }); return build(code); } finally { K.setTessellation(prev); }
    }
    function rfFGDiag(mesh) {
      var P = mesh.positions64, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (var i = 0; i < P.length; i += 3) for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
      return Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    }
    // logical faces: facets of one analytic surface, or of one fillet / sweep / loft feature across smooth edges
    function rfFGFaces(r, E) {
      var mesh = r.mesh, surfOf = new Map(), par = mesh.faces.map(function (f, i) { return i; });
      K.curveSurfaces(mesh).forEach(function (s) { s.polys.forEach(function (p) { surfOf.set(p, s.key); }); });
      var keys = mesh.faces.map(function (f) { var o = {}; f.polys.forEach(function (p) { var k = surfOf.get(p); if (k) o[k] = 1; }); return o; });
      function find(i) { while (par[i] !== i) i = par[i] = par[par[i]]; return i; }
      function rfFGstep(f) { var s = f.polys[0].surf; return !!(s && s.step); }
      function freeform(id) { var f = K.findFeature(r.model, id); return f && (f.type === 'fillet' || f.type === 'sweep' || f.type === 'loft'); }
      E.forEach(function (e) {
        if (e.faces.length !== 2) return;
        var a = e.faces[0], b = e.faces[1], same = false;
        for (var k in keys[a]) if (keys[b][k]) same = true;
        if (!same && e.smooth && !Object.keys(keys[a]).length && !Object.keys(keys[b]).length) {
          var ia = mesh.faces[a].polys[0].shared;
          same = ia === mesh.faces[b].polys[0].shared && freeform(ia);
        }
        // rfFK: a round on a faceted torus / sphere wall ends on the true surface, a step (a cone band narrower than
        // the wall's sagitta) from the wall's chords: it belongs to its round, not a face of its own
        if (!same && rfFGstep(mesh.faces[a]) !== rfFGstep(mesh.faces[b])) {
          var sa = mesh.faces[a].polys[0].shared;
          same = sa === mesh.faces[b].polys[0].shared && freeform(sa);
        }
        if (same) { var ra = find(a), rb = find(b); if (ra !== rb) par[ra] = rb; }
      });
      var roots = {};
      mesh.faces.forEach(function (f, i) { roots[find(i)] = 1; });
      return Object.keys(roots).length;
    }
    function rfFGCheck(name, code, volume, occtFaces, rel) {
      var r = rfFGBuild(code);
      noErrors(r);
      nearRel(r.mp.volume, volume, rel || 1e-9, name + ' volume');
      var mesh = r.mesh, tot = mesh.faces.reduce(function (s, f) { return s + f.area; }, 0), diag = rfFGDiag(mesh);
      var tiny = mesh.faces.filter(function (f) { return f.area < 1e-6 * tot; }).length;
      assert(tiny === 0, name + ': ' + tiny + ' faces under 1e-6 of the area');
      var bad = 0, worst = 0;
      mesh.faces.forEach(function (f, i) {
        var o = K.faceOutline(mesh, i), a = 0;
        o.loops.forEach(function (l) { for (var k = 0; k < l.length; k++) { var p = l[k], q = l[(k + 1) % l.length]; a += (p[0] * q[1] - q[0] * p[1]) / 2; } });
        var d = Math.abs(a - f.area) / tot;
        if (d > worst) worst = d;
        if (d > 1e-6) bad++;
      });
      assert(bad === 0, name + ': ' + bad + ' face outlines do not enclose their face (worst ' + worst.toExponential(2) + ' of the area)');
      var E = K.bodyEdges(mesh);
      var lone = E.filter(function (e) { return e.faces.length !== 2; });
      assert(lone.length === 0, name + ': ' + lone.length + ' edges with one face, e.g. ' + JSON.stringify(lone[0] && [lone[0].a, lone[0].b]));
      var short = E.filter(function (e) { return e.len < 1e-4 * diag; });
      assert(short.length === 0, name + ': ' + short.length + ' edges shorter than 1e-4 of the diagonal');
      var n = rfFGFaces(r, E);
      if (occtFaces != null) assert(n === occtFaces, name + ': ' + n + ' faces, OpenCascade has ' + occtFaces);
      return mesh.faces.length + ' facets, ' + E.length + ' edges, ' + n + ' faces';
    }

    test('rfFG: WHEEL (revolve, dish cut, centre dimple, R0.25 rim fillet, sketch on the floor): outlines exact, every edge two faces, no slivers / short edges, 5 faces as OpenCascade', function () {
      // exact since lane FF's torus fillets (= OpenCascade to 6 decimals, 2026-10-29)
      return rfFGCheck('WHEEL', WHEEL, 41.828284742188025, 5);
    });
    test('rfFG: DISH (spherical dish, ball dimple, R0.25 rim and R0.15 dish fillets): outlines exact, every edge two faces, no slivers / short edges, 7 faces as OpenCascade', function () {
      // the exact volume (Green on the section; OpenCascade 37.692434). The R0.15 round where the spherical dish meets
      // the top is an exact torus since lane FK (before: the straight edgeTool, no record, 37.69304, 6e-4 over). The
      // ≈ -3.7e-6 left is the dish's own (the part without that round is off by as much)
      return rfFGCheck('DISH', DISH, 37.6924340474255, 7, 2e-7);
    });
    test('rfFG: GROOVE (torus-walled dish, ball dimple, annular cut-extrude groove, two fillets): outlines exact, every edge two faces, no slivers / short edges', function () {
      // the exact volume (Green on the section; OpenCascade 33.197718). The R0.15 round where the torus dish wall meets
      // the top is an exact torus since lane FK (it was the straight edgeTool against one wall facet, no record: 33.19382
      // at maxAngle 0, 33.19434 at 12). The ≈ 5e-9 left is the dish wall's own column error at the top plane (rfFK).
      return rfFGCheck('GROOVE', GROOVE, 33.19771911322, null, 1e-9);
    });

    test('rfFG: faceOutline keeps a true corner between two tiny pieces; a clean box keeps its 12 edges', function () {
      var r = build('p.sketch("Front").rect(0, 0, 40, 30).end().extrude(10);');
      var E = K.bodyEdges(r.mesh);
      assert(E.length === 12 && E.every(function (e) { return e.faces.length === 2; }), 'box edges: ' + E.length);
      // a square face given as polygons with a 2e-4 step at one corner and a 3e-4 crack in one side
      var CSG_ = CSG, V = function (x, y) { return new CSG_.Vertex(new CSG_.Vector(x, y, 0), new CSG_.Vector(0, 0, 1)); };
      function P(pts) { return new CSG_.Polygon(pts.map(function (p) { return V(p[0], p[1]); })); }
      var polys = [P([[0, 0], [10, 0], [10, 9.9998], [0, 9.9998]]), P([[0, 9.9998], [10, 9.9998], [9.9996, 10], [0, 10]]), P([[10, 9.9998], [10, 10], [9.9996, 10]])];
      var mesh = K.meshFromBody(CSG_.fromPolygons(polys));
      var o = K.faceOutline(mesh, 0), a = 0;
      assert(mesh.faces.length === 1 && o.loops.length === 1, 'one face, one loop: ' + mesh.faces.length + ' / ' + o.loops.length);
      o.loops[0].forEach(function (p, k, l) { var q = l[(k + 1) % l.length]; a += (p[0] * q[1] - q[0] * p[1]) / 2; });
      nearRel(Math.abs(a), 100, 1e-9, 'the outline encloses the whole square (it cut the corner: 50)');
      return o.loops[0].length + ' outline corners';
    });
  })();
