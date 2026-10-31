  // --- rfFQ (2026-10-30, lane FQ: the boolean cracks left after rfFL) --- csg.js splitPolygon takes a vertex within
  // EPSILON (1e-5) of a plane as on it. Where two nearly parallel planes meet (a vent fillet running tangent into a
  // spar circle, a small round's first chord on a dish wall, a hole through the edge of a boss) the solid being split
  // takes its new edge through that vertex while the other solid is cut where the planes really cross, up to
  // EPSILON / sin(angle) away: cracks of 1e-4 that healCracks may not bridge. A boolean still open after healing is now
  // run once more with those vertices on their true side (`retryExact`) and kept when it is better; a watertight boolean
  // is never redone. Also lane FU's twin split points: both polygons sharing a cut edge now get the bitwise-same point
  // (the 14 ga L bracket's 13 open edges). Inch tessellation as rfFL (chord .002 in, Image Quality angular limit).
  (function () {
    group('rfFQ: tangent joints and shared split points come out watertight (csg.js exact retry, identical twins)');
    var PI = Math.PI, U = 'p.units("in");\n';
    function rfFQbuild(code, maxAngle) {
      var prev = K.setTessellation();
      try {
        K.setTessellation({ chordTol: 0.002, minSegs: 16, maxSegs: 128, legacy: false, maxAngle: maxAngle });
        return build(code);
      } finally { K.setTessellation(prev); }
    }
    function rfFQwith(opts, fn) {
      var keep = {};
      Object.keys(opts).forEach(function (k) { keep[k] = CSG.options[k]; CSG.options[k] = opts[k]; });
      try { return fn(); } finally { Object.keys(keep).forEach(function (k) { CSG.options[k] = keep[k]; }); }
    }
    // open / non-manifold / zero-area counts of Evaluate.checkBody and meshQuality's open edges
    function rfFQcount(r) {
      var c = Evaluate.checkBody(r.body, { maxPairs: 1 }), q = K.meshQuality(r.mesh);
      return { open: c.openEdges.length, mq: q.openEdges, nm: c.nonManifoldEdges.length, zero: c.zeroAreaFaces.length };
    }
    function rfFQclosed(r, label, nmOk) {
      var c = rfFQcount(r);
      assert(c.open === 0 && c.mq === 0, label + ': open edges ' + c.open + ' (meshQuality ' + c.mq + ')');
      if (!nmOk) assert(c.nm === 0, label + ': non-manifold edges ' + c.nm);
      assert(c.zero === 0, label + ': zero-area faces ' + c.zero);
      return c;
    }
    // volume of a solid of revolution about y from its (x, y) profile: lines and arcs, Green / Pappus (rfFK)
    function rfFQvol(segs) {
      var I = 0;
      segs.forEach(function (s) {
        if (s[0] === 'l') { var a = s[1], b = s[2]; I += (a[0] * a[0] + a[0] * b[0] + b[0] * b[0]) / 6 * (b[1] - a[1]); return; }
        var c = s[1][0], r = s[2];
        function F(t) { var sn = Math.sin(t); return (c * c * r * sn + c * r * r * (t + Math.sin(2 * t) / 2) + r * r * r * (sn - sn * sn * sn / 3)) / 2; }
        I += F(s[4]) - F(s[3]);
      });
      return 2 * PI * I;
    }

    // the rfDT2 acceptance vent (Ø2 boundary, ribs and a spar .1 wide, R.05 in every corner) on a 4 × 4 × .06 sheet:
    // removed = T × (open area − the 28 corner pieces), exactly (rfDT.js)
    var T = 0.06, H = 0.05, R5 = 0.05;
    var VENT = U + 'p.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(-2, -2, 4, 4).end().baseFlange();\n' +
      'p.sketch("Top").circle(0, 0, 1).line(-1, 0, 1, 0).line(0, -1, 0, 1).circle(0, 0, 0.5).end().vent({ ribWidth: 0.1, sparWidth: 0.1, radius: 0.05 });\n';
    function rfFQventVolume() {
      function S(r) { return 2 * (H * Math.sqrt(r * r - H * H) + r * r * Math.asin(H / r)); }
      function D(r) { return PI * r * r - 2 * S(r) + 4 * H * H; }
      function seg(p, q) { return (p[0] * q[1] - q[0] * p[1]) / 2; }
      function arc(c, rho, t0, sw) { var t1 = t0 + sw; return (rho * rho * sw + rho * (c[0] * (Math.sin(t1) - Math.sin(t0)) - c[1] * (Math.cos(t1) - Math.cos(t0)))) / 2; }
      function corner(R, inside) {
        var Rc = inside ? R - R5 : R + R5, xc = Math.sqrt(Rc * Rc - (H + R5) * (H + R5)), C = [xc, H + R5], T1 = [xc, H], T2 = [C[0] * R / Rc, C[1] * R / Rc], V = [Math.sqrt(R * R - H * H), H];
        var aV = Math.atan2(V[1], V[0]), aT2 = Math.atan2(T2[1], T2[0]), f0 = Math.atan2(T2[1] - C[1], T2[0] - C[0]), sw = -PI / 2 - f0;
        if (inside) { while (sw > 0) sw -= 2 * PI; } else { while (sw < 0) sw += 2 * PI; }
        return Math.abs(arc([0, 0], R, aV, aT2 - aV) + arc(C, R5, f0, sw) + seg(T1, V));
      }
      var open = D(0.45) + D(1) - D(0.55), lost = 4 * (R5 * R5 * (1 - PI / 4) + 2 * corner(0.45, true)) + 4 * (2 * corner(0.55, false) + 2 * corner(1, true));
      return 16 * T - T * (open - lost);
    }

    test('rfFQ: vent R.05 at maxAngle 12 / 6: closed and exact (was 4 / 32 open edges, −3.5e-5 at 6°); 6° without the exact retry still cracks', function () {
      var exact = rfFQventVolume(), out = [];
      [12, 6].forEach(function (a) {
        var r = rfFQbuild(VENT, a);
        noErrors(r);
        rfFQclosed(r, 'vent at ' + a + '°');
        nearRel(r.mp.volume, exact, 1e-8, 'volume at ' + a + '°');
        out.push(a + '°: ' + ((r.mp.volume - exact) / exact).toExponential(1));
      });
      var off = rfFQwith({ retryExact: false }, function () { return rfFQbuild(VENT, 6); }), c = rfFQcount(off);
      assert(c.open > 0, 'retryExact off: the BSP alone leaves the tangent joints open (' + c.open + ')');
      return out.join('; ') + '; retry off at 6°: ' + c.open + ' open';
    });

    test('rfFQ: vent R.05 at maxAngle 3: closed (no open and no non-manifold edge) and the exact volume (was 38 open + 4 non-manifold, then 10 non-manifold; lane FV)', function () {
      // the fillet's end chord and the spar's chord leave the tangent point nearly collinear (3°): the BSP split the
      // sheet faces along the spar chord's extension into a wedge ~5e-7 wide, which the meshes' 1e-6 weld folded into
      // four faces on one edge. csg.js fattenSlivers (rfFV) merges the wedge into its neighbour.
      var r = rfFQbuild(VENT, 3), exact = rfFQventVolume();
      noErrors(r);
      var c = rfFQclosed(r, 'vent at 3°');
      nearRel(r.mp.volume, exact, 1e-8, 'volume');
      return 'open ' + c.open + ', non-manifold ' + c.nm + ', ' + ((r.mp.volume - exact) / exact).toExponential(1);
    });

    test('rfFQ: R0.1 round on a ball dimple at maxAngle 6: built (the open-edge guard refused it: 12 open), closed, exact torus volume', function () {
      var code = U + 'p.sketch("Front").line(0,0,2,0).line(2,0,2,1).line(2,1,0,1).line(0,1,0,0).revolve(360);\n' +
        'p.sketch("Front").arc(0,1,0.5,-90,90).line(0,1.5,0,0.5).revolveCut(360);\np.fillet(0.1,[[0.5,1,0]]);\n';
      var fx = Math.sqrt(0.35), pB = [fx * 0.5 / 0.6, 1 - 0.1 * 0.5 / 0.6];
      var exact = rfFQvol([['l', [0, 0], [2, 0]], ['l', [2, 0], [2, 1]], ['l', [2, 1], [fx, 1]],
        ['a', [fx, 0.9], 0.1, PI / 2, Math.atan2(pB[1] - 0.9, pB[0] - fx)], ['a', [0, 1], 0.5, Math.atan2(pB[1] - 1, pB[0]), -PI / 2],
        ['l', [0, 0.5], [0, 0]]]);
      var r = rfFQbuild(code, 6);
      noErrors(r);
      rfFQclosed(r, 'dimple at 6°');
      nearRel(r.mp.volume, exact, 1e-9, 'volume');
      return 'exact ' + exact.toFixed(9) + ', Anvil ' + r.mp.volume.toFixed(9);
    });

    test('rfFQ: GROOVE (torus dish, ball dimple, two fillets) at maxAngle 6: built (refused before: 12 open), closed, = OpenCascade', function () {
      var code = U + 'p.sketch("Front").line(0,0,3,0).line(3,0,3,1.5).line(3,1.5,0,1.5).line(0,1.5,0,0).revolve(360);\n' +
        'p.sketch("Front").line(0,1.0,1.9,1.0).arc(1.9,1.6,0.6,-90,0).line(2.5,1.6,0,1.6).line(0,1.6,0,1.0).revolveCut(360);\n' +
        'p.sketch("Front").arc(0,1.0,0.35,-90,90).line(0,1.35,0,0.65).revolveCut(360);\n' +
        'p.fillet(0.25,[[3,1.5,0]]);\np.fillet(0.15,[[2.5,1.5,0]]);\n';
      var r = rfFQbuild(code, 6);
      noErrors(r);
      rfFQclosed(r, 'GROOVE at 6°');
      nearRel(r.mp.volume, 33.362651728326746, 2e-7, 'volume (OpenCascade)');
      return r.body.polygons.length + ' polygons';
    });

    test('rfFQ: Normal Cut Bracket with every sharp edge rounded R0.1 (open-edge guard off): the raw booleans come out closed (were 18 open edges)', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Normal Cut Bracket'; })[0];
      var r0 = build(ex.code), ats = K.bodyEdges(r0.mesh).filter(function (e) { return !e.smooth; }).map(function (e) { return e.mid.map(function (v) { return +v.toFixed(6); }); });
      var keep = K.openGuard.on, r;
      K.openGuard.on = false;
      try { r = build(ex.code + '\np.fillet(0.1, ' + JSON.stringify(ats) + ');\n'); } finally { K.openGuard.on = keep; }
      noErrors(r);
      rfFQclosed(r, 'every edge R0.1');
      assert(r.mp.volume < r0.mp.volume, 'the rounds take material off: ' + r.mp.volume + ' < ' + r0.mp.volume);
      return ats.length + ' edge picks, ' + r.body.polygons.length + ' polygons';
    });

    test('rfFQ: a plain 14 ga L bracket (7.75 × 4, 1.5 flange) and an up / down flange corner are watertight (lane FU: twin split points, were 13 open + 1 non-manifold / 10 open)', function () {
      var L = U + 'p.sheet(0.0747, 0.0747, 0.4);\np.sketch("Top").rect(0, -4, 7.75, 4).end().baseFlange();\n' +
        'p.flange(1.5, [[3.875, 0.0747, 0]], { position: "inside", lengthRef: "outer" });\n';
      var C = U + 'p.sheet(0.0359, 0.0718, 0.5);\np.sketch("Top").rect(0, -5.75, 6, 5.75).end().baseFlange();\n' +
        'p.flange(1.25, [[3, 0.0359, 5.75]], { position: "inside", lengthRef: "outer", reverse: true });\n' +
        'p.flange(0.875, [[0, 0.0359, 2.875]], { position: "inside", lengthRef: "outer" });\n';
      [[L, 'L bracket'], [C, 'up / down corner']].forEach(function (cs) {
        var r = build(cs[0]);
        noErrors(r);
        rfFQclosed(r, cs[1]);
      });
    });

    test('rfFQ: splitPolygon gives the two triangles of a split quad the bitwise-same point on their shared diagonal', function () {
      var V = CSG.Vector, Vx = CSG.Vertex, P = CSG.Polygon;
      function tri(a, b, c) { return new P([a, b, c].map(function (q) { return new Vx(new V(q[0], q[1], q[2])); })); }
      var A = [0.1, 0.0747, 0.3], B = [0.7, 0.0747, 0.3], Cc = [0.7, 0.0747, 0.02], D = [0.1, 0.0747, 0.02];
      var t1 = tri(A, B, Cc), t2 = tri(A, Cc, D), bad = 0;
      for (var k = 0; k < 200; k++) {
        var x = 0.11 + k * 0.00293, pl = new CSG.Plane(new V(1, 0, 0), x), out = [];
        [t1, t2].forEach(function (t) { var f = [], b = []; pl.splitPolygon(t, [], [], f, b); out.push(f.concat(b)); });
        // the split point on the diagonal A–C of each triangle (the one not on an outer edge z = 0.3 or z = 0.02)
        var on = out.map(function (list) {
          var pts = [];
          list.forEach(function (p) { p.vertices.forEach(function (v) { if (v.pos.z !== 0.3 && v.pos.z !== 0.02) pts.push(v.pos); }); });
          return pts[0];
        });
        if (on[0] && on[1] && (on[0].x !== on[1].x || on[0].y !== on[1].y || on[0].z !== on[1].z)) bad++;
      }
      assert(bad === 0, bad + ' of 200 cuts gave the two triangles different points');
    });

    test('rfFQ: a hole through the edge of a boss, a hole through a drafted boss, a slot after a revolve-cut groove: closed, exact where there is a closed form (were 3 / 3 / 4 open edges)', function () {
      // Ø.5 hole through the edge of a Ø.5 × 1 boss on a 4 × 4.5 × .25 plate: the hole takes π r² of the plate and
      // the lens of two r = .25 circles d apart from the boss
      var hb = build(U + 'p.sketch("Top").rect(0, -4.5, 4, 4.5).end().extrude(0.25);\np.sketch("Top", 0.25).circle(1.33, -3.1532, 0.25).end().extrude(1);\n' +
        'p.sketch("Top", 1.25).circle(0.9453, -2.9922, 0.25).end().cut("through", { reverse: true });\n');
      noErrors(hb); rfFQclosed(hb, 'hole through the boss edge');
      var r = 0.25, d = Math.sqrt(Math.pow(1.33 - 0.9453, 2) + Math.pow(3.1532 - 2.9922, 2)), lens = 2 * r * r * Math.acos(d / (2 * r)) - d / 2 * Math.sqrt(4 * r * r - d * d);
      // 2e-8: the hole meets the boss cylinder in a cylinder–cylinder curve, which curveCorrection does not integrate
      // exactly (9e-9 left; the cracked build without the retry was off by as much)
      nearRel(hb.mp.volume, 4 * 4.5 * 0.25 + PI * r * r - PI * r * r * 0.25 - lens, 2e-8, 'boss-edge volume');
      // Ø1.5 boss 1 tall with 3° draft (a frustum), Ø.5 hole through it
      var db = build(U + 'p.sketch("Top").circle(0, 0, 0.75).end().extrude(1, { draft: 3 });\np.sketch("Top", 1).circle(0, 0, 0.25).end().cut("through", { reverse: true });\n');
      noErrors(db); rfFQclosed(db, 'drafted boss hole');
      var R0 = 0.75, R1 = 0.75 - Math.tan(3 * PI / 180);
      nearRel(db.mp.volume, PI / 3 * (R0 * R0 + R0 * R1 + R1 * R1) - PI * 0.0625, 1e-9, 'drafted boss volume');
      // lane FS fuzz: a slot cut after a revolve-cut groove (mm): closed, the same solid as the BSP alone (to 1e-9)
      var code = 'p.box(23, 45, 10);\np.sketch("Front").rect(15, 5, 1, 5).revolveCut(360);\np.sketch("Top", 10).slot(10, -23, 19, -17, 8).cut(2);\n';
      var sg = build(code);
      noErrors(sg); rfFQclosed(sg, 'slot after groove');
      var sg0 = rfFQwith({ retryExact: false }, function () { return build(code); });
      nearRel(sg.mp.volume, sg0.mp.volume, 1e-9, 'slot volume = the cracked build');
      return 'boss edge ' + hb.mp.volume.toFixed(9) + ', drafted ' + db.mp.volume.toFixed(9);
    });
  })();
