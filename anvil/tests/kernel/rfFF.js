  // ------------------------------------------------------------------ rfFF: fillets / chamfers on circular edges, spherical corners
  // A fillet on a circular edge (a plane square to the axis meeting a cylinder or cone: rims, hole edges, boss roots) is
  // a torus patch carrying a 'tor' record, a chamfer there a 'cone' record: exact volume and area by Pappus, smooth
  // shading, TOROIDAL / CONICAL_SURFACE in STEP. Three perpendicular convex edges filleted at one vertex with one radius
  // get a spherical corner ('sph'). Face counts are OpenCascade's (planar faces + one per analytic surface).
  (function () {
    group('rfFF: fillets and chamfers on circular edges, spherical corners');
    var PI = Math.PI, X = typeof Exchange !== 'undefined' ? Exchange : null;
    // the spandrel between a 90° corner and a fillet arc of radius r: area and its centroid's distance from the corner
    var rfFFspA = function (r) { return (1 - PI / 4) * r * r; };
    var rfFFspD = function (r) { return r * (10 - 3 * PI) / (3 * (4 - PI)); };
    // B-rep-like face count: planar mesh faces + one face per analytic surface
    function rfFFfaces(r) { return r.mesh.faces.filter(function (f) { return !f.polys.some(function (p) { return p.surf; }); }).length + K.curveSurfaces(r.mesh).length; }
    function rfFFkinds(r) { var o = {}; K.curveSurfaces(r.mesh).forEach(function (s) { o[s.surf.t] = (o[s.surf.t] || 0) + 1; }); return o; }
    // the region between corner E and the fillet arc tangent to directions uA, uB in (ρ, z), revolved (Pappus, fine polygon)
    function rfFFring(E, uA, uB, r) {
      var th = Math.acos(uA[0] * uB[0] + uA[1] * uB[1]), t = r / Math.tan(th / 2), bl = Math.hypot(uA[0] + uB[0], uA[1] + uB[1]);
      var pA = [E[0] + uA[0] * t, E[1] + uA[1] * t], pB = [E[0] + uB[0] * t, E[1] + uB[1] * t];
      var c = [E[0] + (uA[0] + uB[0]) / bl * r / Math.sin(th / 2), E[1] + (uA[1] + uB[1]) / bl * r / Math.sin(th / 2)];
      var a0 = Math.atan2(pA[1] - c[1], pA[0] - c[0]), sw = Math.atan2(pB[1] - c[1], pB[0] - c[0]) - a0;
      while (sw > PI) sw -= 2 * PI; while (sw < -PI) sw += 2 * PI;
      var pts = [E], N = 20000, Mx = 0;
      for (var i = 0; i <= N; i++) { var a = a0 + sw * i / N; pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
      for (var k = 0; k < pts.length; k++) { var p = pts[k], q = pts[(k + 1) % pts.length], cr = p[0] * q[1] - q[0] * p[1]; Mx += (p[0] + q[0]) * cr / 6; }
      return Math.abs(2 * PI * Mx);
    }
    function rfFFstep(r) { return X.exportSTEP(r.model, r.build); }
    function rfFFcount(re, s) { return (s.match(re) || []).length; }
    function rfFFedgeUses(step) {
      var st = X.parseStep(step), uses = {}, bad = 0;
      Object.keys(st.ents).forEach(function (id) { var e = st.ents[id]; if (e.t === 'ORIENTED_EDGE') uses[e.a[3].r] = (uses[e.a[3].r] || 0) + 1; });
      Object.keys(st.ents).forEach(function (id) { if (st.ents[id].t === 'EDGE_CURVE' && uses[id] !== 2) bad++; });
      return bad;
    }
    var RIM = 'p.cylinder(50, 20);\np.fillet(6, [[50, 20, 0]]);';
    var HOLE = 'p.cylinder(50, 20);\np.hole("Top", 0, 0, 20, { offset: 20 });\np.fillet(2, [[10, 20, 0], [10, 0, 0]]);';
    var BOX12 = 'p.box(40, 30, 20);\np.fillet(3, [[20,0,0],[20,0,30],[20,20,0],[20,20,30],[0,10,0],[40,10,0],[0,10,30],[40,10,30],[0,0,15],[40,0,15],[0,20,15],[40,20,15]]);';
    var BOSS = 'p.box(60, 60, 10);\np.sketch("Top", 10).circle(30, -30, 10).extrude(15);\n';

    test('Ø100 × 20 cylinder, top rim R6: a torus patch; volume πR²h − 2π(R − d̄)(1 − π/4)r² and area exact, 4 faces (OpenCascade\'s), no slivers, rims are true circles', function () {
      var r = build(RIM); noErrors(r);
      var want = PI * 2500 * 20 - 2 * PI * (50 - rfFFspD(6)) * rfFFspA(6);
      nearRel(r.mp.volume, want, 1e-9, 'volume');
      nearRel(r.mp.area, PI * 44 * 44 + PI * 2500 + 2 * PI * 50 * 14 + 2 * PI * (44 + 12 / PI) * (PI * 3), 1e-9, 'area');
      consistentVolume(r);
      assert(rfFFfaces(r) === 4 && rfFFkinds(r).tor === 1, 'faces ' + rfFFfaces(r) + ' ' + JSON.stringify(rfFFkinds(r)));
      assert(K.meshQuality(r.mesh).slivers === 0, 'slivers');
      var circles = K.curveEdges(r.mesh).filter(function (c) { return c.kind === 'circle'; }).map(function (c) { return +c.radius.toFixed(6) + '@' + +c.center[1].toFixed(6); }).sort();
      assert(circles.indexOf('44@20') >= 0 && circles.indexOf('50@14') >= 0, 'fillet rims: ' + circles.join(' '));
      return 'volume ' + fmt(r.mp.volume) + ', ' + r.mesh.faces.length + ' facets';
    });
    test('the rim fillet is the same exact volume at chord tolerance 0.01 and on the legacy mesh', function () {
      var v = build(RIM).mp.volume, fine = K.setTessellation({ chordTol: 0.01 }), vf;
      try { vf = build(RIM).mp.volume; } finally { K.setTessellation('default'); }
      var vl = withLegacy(function () { return build(RIM).mp.volume; });
      nearRel(vf, v, 1e-11, 'fine'); nearRel(vl, v, 1e-11, 'legacy');
    });
    test('Ø20 through hole in the cylinder, R2 on both hole edges: two tori, volume exact, 6 faces', function () {
      var r = build(HOLE); noErrors(r);
      nearRel(r.mp.volume, PI * (2500 - 100) * 20 - 2 * 2 * PI * (10 + rfFFspD(2)) * rfFFspA(2), 1e-9, 'volume');
      consistentVolume(r);
      assert(rfFFfaces(r) === 6 && rfFFkinds(r).tor === 2, 'faces ' + rfFFfaces(r) + ' ' + JSON.stringify(rfFFkinds(r)));
    });
    test('chamfer 3 on the Ø100 rim: a cone patch, volume πR²h − 2π(R − 1)·4.5', function () {
      var r = build('p.cylinder(50, 20);\np.chamfer(3, [[50, 20, 0]]);'); noErrors(r);
      nearRel(r.mp.volume, PI * 2500 * 20 - 2 * PI * 49 * 4.5, 1e-9, 'volume');
      assert(rfFFfaces(r) === 4 && rfFFkinds(r).cone === 1, 'faces ' + rfFFfaces(r));
    });
    test('boss root (concave): R3 adds 2π(R + d̄)(1 − π/4)r², chamfer 3 adds 2π(R + 1)·4.5', function () {
      var base = PI * 100 * 15 + 36000;
      var f = build(BOSS + 'p.fillet(3, [[40, 10, 30]]);'); noErrors(f);
      nearRel(f.mp.volume, base + 2 * PI * (10 + rfFFspD(3)) * rfFFspA(3), 1e-9, 'fillet volume');
      assert(rfFFkinds(f).tor === 1, 'torus');
      var c = build(BOSS + 'p.chamfer(3, [[40, 10, 30]]);'); noErrors(c);
      nearRel(c.mp.volume, base + 2 * PI * 11 * 4.5, 1e-9, 'chamfer volume');
    });
    test('drafted boss (5°): root R3 between a plane and a cone, top rim R2 (cone and plane): tori, exact by Pappus', function () {
      var k = Math.tan(5 * PI / 180), kn = Math.sqrt(1 + k * k), head = BOSS.replace('.extrude(15)', '.extrude(15, { draft: 5 })');
      var b0 = build(head); noErrors(b0);
      var root = build(head + 'p.fillet(3, [[40, 10, 30]]);'); noErrors(root);
      nearRel(root.mp.volume, b0.mp.volume + rfFFring([10, 0], [1, 0], [-k / kn, 1 / kn], 3), 1e-9, 'root');
      var Rt = 10 - 15 * k, rim = build(head + 'p.fillet(2, [[' + (30 + Rt) + ', 25, 30]]);'); noErrors(rim);
      nearRel(rim.mp.volume, b0.mp.volume - rfFFring([Rt, 0], [-1, 0], [k / kn, -1 / kn], 2), 1e-9, 'rim');
      assert(rfFFkinds(root).tor === 1 && rfFFkinds(root).cone === 1, JSON.stringify(rfFFkinds(root)));
    });
    test('40 × 30 × 20 box, all 12 edges R3: spherical corners; V = abc − (1 − π/4)r²·Σ(L − 2r) − 8r³(1 − π/6), area exact, 26 faces (6 + 12 + 8)', function () {
      var r = build(BOX12); noErrors(r);
      var a = 40, b = 30, c = 20, R = 3, sumL = 4 * (a + b + c) - 24 * R;
      nearRel(r.mp.volume, a * b * c - rfFFspA(R) * sumL - 8 * R * R * R * (1 - PI / 6), 1e-9, 'volume');
      nearRel(r.mp.area, 2 * (34 * 24 + 24 * 14 + 34 * 14) + PI * R / 2 * sumL + 4 * PI * R * R, 1e-9, 'area');
      consistentVolume(r);
      var kinds = rfFFkinds(r);
      assert(rfFFfaces(r) === 26 && kinds.sph === 8 && kinds.cyl === 12, 'faces ' + rfFFfaces(r) + ' ' + JSON.stringify(kinds));
      assert(K.meshQuality(r.mesh).slivers === 0, 'slivers');
    });
    test('unequal radii at a corner: vertical edges R5, then the top outline R2 runs round them (cylinders + tori, exact); R5 over R2 corners is refused', function () {
      var r = build('p.box(40, 30, 20);\np.fillet(5, [[0, 10, 0], [40, 10, 0], [0, 10, 30], [40, 10, 30]]);\np.fillet(2, [[20, 20, 0]]);'); noErrors(r);
      var A = rfFFspA(2), d = rfFFspD(2);
      nearRel(r.mp.volume, 24000 - 4 * rfFFspA(5) * 20 - A * (2 * 30 + 2 * 20) - 2 * PI * (5 - d) * A, 1e-9, 'volume');
      assert(rfFFfaces(r) === 18 && rfFFkinds(r).tor === 4, 'faces ' + rfFFfaces(r) + ' ' + JSON.stringify(rfFFkinds(r)));
      assert(K.meshQuality(r.mesh).slivers === 0, 'slivers');
      var bad = build('p.box(40, 30, 20);\np.fillet(2, [[0, 10, 0], [40, 10, 0], [0, 10, 30], [40, 10, 30]]);\np.fillet(5, [[20, 20, 0]]);');
      var msg = Object.keys(bad.errors).map(function (id) { return bad.errors[id]; }).join(' ');
      assert(/too large for the round edge of radius 2/.test(msg), 'error: ' + msg);
    });
    test('STEP: the rim fillet on TOROIDAL_SURFACE, the chamfer on CONICAL_SURFACE, the rounded box on 8 SPHERICAL + 12 CYLINDRICAL_SURFACE, every edge used twice; the rim re-imports to the exact volume', function () {
      if (!X) fail('exchange.js is not loaded');
      var rim = build(RIM), s1 = rfFFstep(rim);
      assert(rfFFcount(/=TOROIDAL_SURFACE\(/g, s1) === 1 && rfFFcount(/=ADVANCED_FACE\(/g, s1) === 4 && !rfFFedgeUses(s1), 'rim STEP');
      var res = X.importFile('rim.step', s1), b = K.rebuild(X.newPartFromImport(res));
      nearRel(K.massProps(K.meshFromBody(b.body), 1).volume, rim.mp.volume, 1e-9, 're-imported rim');
      var s2 = rfFFstep(build('p.cylinder(50, 20);\np.chamfer(3, [[50, 20, 0]]);'));
      assert(rfFFcount(/=CONICAL_SURFACE\(/g, s2) === 1 && !rfFFedgeUses(s2), 'chamfer STEP');
      var s3 = rfFFstep(build(BOX12));
      assert(rfFFcount(/=SPHERICAL_SURFACE\(/g, s3) === 8 && rfFFcount(/=CYLINDRICAL_SURFACE\(/g, s3) === 12 && rfFFcount(/=PLANE\(/g, s3) === 6 && !rfFFedgeUses(s3), 'box STEP');
    });
    test('the round is tangent to its neighbours: at every vertex of a torus / sphere facet the true surface normals (from the records; plane faces their own) of all the faces there agree; a script round trip keeps the rounded box', function () {
      var worst = 0;
      // the exact unit normal of record S at x (the torus normal from the tube centre o + R·eρ, axial part included)
      function rfFFnormal(S, x, fn) {
        var v = [x[0] - S.o[0], x[1] - S.o[1], x[2] - S.o[2]], d = S.d, z = v[0] * d[0] + v[1] * d[1] + v[2] * d[2], n;
        var rho = [v[0] - d[0] * z, v[1] - d[1] * z, v[2] - d[2] * z], rl = Math.hypot(rho[0], rho[1], rho[2]), er = rho.map(function (c) { return c / rl; });
        if (S.t === 'sph') n = v;
        else if (S.t === 'cyl') n = er;
        else if (S.t === 'cone') n = [er[0] - S.k * d[0], er[1] - S.k * d[1], er[2] - S.k * d[2]];
        else n = [v[0] - er[0] * S.R, v[1] - er[1] * S.R, v[2] - er[2] * S.R];
        var l = Math.hypot(n[0], n[1], n[2]), s = (n[0] * fn[0] + n[1] * fn[1] + n[2] * fn[2]) < 0 ? -1 / l : 1 / l;
        return [n[0] * s, n[1] * s, n[2] * s];
      }
      [RIM, BOX12].forEach(function (code) {
        var r = build(code), m = r.mesh, at = {}, onRound = {};
        function key(p) { return Math.round(p.x * 1e4) + ',' + Math.round(p.y * 1e4) + ',' + Math.round(p.z * 1e4); }
        m.faces.forEach(function (f) {
          f.polys.forEach(function (p) {
            var S = p.surf && p.surf.s, round = S && (S.t === 'tor' || S.t === 'sph');
            p.vertices.forEach(function (vx) {
              var kk = key(vx.pos);
              (at[kk] = at[kk] || []).push(S ? rfFFnormal(S, [vx.pos.x, vx.pos.y, vx.pos.z], f.normal) : f.normal);
              if (round) onRound[kk] = true;
            });
          });
        });
        Object.keys(onRound).forEach(function (kk) {
          var ns = at[kk];
          for (var a = 1; a < ns.length; a++) worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, ns[0][0] * ns[a][0] + ns[0][1] * ns[a][1] + ns[0][2] * ns[a][2]))));
        });
      });
      assert(worst < 1e-3, 'normals differ by ' + worst + ' rad at a vertex of the round');
      var a = build(BOX12), m2 = K.newModel('rt');
      K.runScript(m2, K.generateScript(a.model));
      nearRel(K.massProps(K.meshFromBody(K.rebuild(m2).body)).volume, a.mp.volume, 1e-12, 'round trip');
      return 'worst normal mismatch ' + worst.toExponential(1) + ' rad';
    });
    // --- rfFF2: rounds that run into earlier rounds or walls; Anvil's STEP importer reads the sphere corners back
    test('rfFF2: three fillets (r .5, .25, .375, no tangent propagation) at a 2 in cube corner: each later round rolls on into the earlier one and is trimmed by it, 9 faces (SolidWorks 7.817528, its own 9)', function () {
      var r = build('p.units("in");\np.sketch("Top").rect(0, -2, 2, 2).end();\np.extrude(2);\np.fillet(0.5, [[1, 2, 2]], { chain: false });\np.fillet(0.25, [[2, 2, 1]], { chain: false });\np.fillet(0.375, [[2, 1, 2]], { chain: false });');
      noErrors(r);
      nearRel(r.mp.volume, 7.817528170230516, 1e-5, 'volume vs SolidWorks');
      assert(rfFFfaces(r) === 9 && rfFFkinds(r).cyl === 3, 'faces ' + rfFFfaces(r) + ' ' + JSON.stringify(rfFFkinds(r)));
      assert(K.meshQuality(r.mesh).slivers === 0, 'slivers');
      return 'volume ' + r.mp.volume.toFixed(6) + ' in³';
    });
    test('rfFF2: a fillet / chamfer on an edge that runs into a wall stops on the wall (no sliver cut out of it): (1 − π/4)r²L and d²/2·L exactly, 9 faces', function () {
      var STEP = 'p.box(40, 30, 10);\np.box(40, 10, 20, { at: [0, 0, 20] });\n';
      var f = build(STEP + 'p.fillet(2, [[40, 10, 10]], { chain: false });'); noErrors(f);
      nearRel(f.mp.volume, 16000 - rfFFspA(2) * 20, 1e-12, 'fillet');
      assert(rfFFfaces(f) === 9, 'fillet faces ' + rfFFfaces(f));
      var c = build(STEP + 'p.chamfer(2, [[40, 10, 10]], { chain: false });'); noErrors(c);
      nearRel(c.mp.volume, 16000 - 2 * 20, 1e-12, 'chamfer');
      assert(c.mesh.faces.length === 9, 'chamfer faces ' + c.mesh.faces.length);
    });
    test('rfFF2: Anvil\'s STEP of the rounded box (8 spherical corners on their own axes) re-imports watertight to the exact volume', function () {
      if (!X) fail('exchange.js is not loaded');
      var r = build(BOX12), res = X.importFile('box.step', rfFFstep(r));
      assert(res.solids.length === 1 && res.stats.openEdges === 0 && !res.warnings.length, res.solids.length + ' solids, ' + res.stats.openEdges + ' open edges ' + res.warnings.join('|'));
      var b = K.rebuild(X.newPartFromImport(res));
      nearRel(K.massProps(K.meshFromBody(b.body), 1).volume, r.mp.volume, 1e-9, 're-imported volume');
      var kinds = {};
      K.curveSurfaces(K.meshFromBody(b.body)).forEach(function (s) { kinds[s.surf.t] = (kinds[s.surf.t] || 0) + 1; });
      assert(kinds.sph === 8 && kinds.cyl === 12, 'surfaces ' + JSON.stringify(kinds));
    });
  })();
