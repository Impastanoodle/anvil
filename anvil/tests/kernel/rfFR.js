  // --- rfFR (2026-10-30, lane FR: fillets and chamfers Anvil refused or approximated) --- (1) the rounds lane FP left
  // refused where OpenCascade builds: a convex round whose setback crosses a hole in its face is trimmed by the hole, as
  // SolidWorks builds it (body − tool is exact: the hole was air already); (2) chamfers where a plane, cylinder or cone
  // meets a revolved torus / sphere are exact cone frusta (the setback on the curved face is a chord, as OpenCascade
  // measures it), and fillets on a cylinder / cone to torus / sphere seam are exact tori (they were refused as "two curved
  // faces meeting in a curve"). kernel-mesh.js: rfFRinHole, rfFRchamferSection, arcEdgeInfo / rfFKcircInfo with SL.
  (function () {
    group('rfFR: fillets and chamfers that were refused or approximate');
    var PI = Math.PI;
    // 2π ∮ ρ²/2 dz over a closed (ρ, z) section given as segments: ['l', a, b] lines, ['a', c, r, t0, t1] arcs
    function rfFRvol(segs) {
      var I = 0;
      segs.forEach(function (s) {
        if (s[0] === 'l') { var a = s[1], b = s[2]; I += (a[0] * a[0] + a[0] * b[0] + b[0] * b[0]) / 6 * (b[1] - a[1]); return; }
        var c = s[1][0], r = s[2];
        function F(t) { var sn = Math.sin(t); return (c * c * r * sn + c * r * r * (t + Math.sin(2 * t) / 2) + r * r * r * (sn - sn * sn * sn / 3)) / 2; }
        I += F(s[4]) - F(s[3]);
      });
      return 2 * PI * I;
    }
    // build at an Image Quality angular limit (0 = off), check the mesh is closed, restore the tessellation
    function rfFRbuild(code, maxAngle) {
      var prev = K.setTessellation();
      try {
        K.setTessellation({ chordTol: 0.002, minSegs: 16, maxSegs: 128, legacy: false, maxAngle: maxAngle });
        var r = build(code);
        noErrors(r);
        var ck = Evaluate.checkBody(r.body, { maxPairs: 1 });
        assert(!ck.openEdges.length && !ck.nonManifoldEdges.length, 'maxAngle ' + maxAngle + ': open ' + ck.openEdges.length + ', non-manifold ' + ck.nonManifoldEdges.length);
        return r;
      } finally { K.setTessellation(prev); }
    }
    function rfFRcones(r) { return K.curveSurfaces(r.mesh).filter(function (s) { return s.surf.t === 'cone'; }).length; }
    var PLATE = 'p.units("in");\np.sketch("Front").line(0,0,2,0).line(2,0,2,1).line(2,1,0,1).line(0,1,0,0).revolve(360);\n';
    var DIMPLE = PLATE + 'p.sketch("Front").arc(0,1,0.5,-90,90).line(0,1.5,0,0.5).revolveCut(360);\n';
    var RS = Math.sqrt(1.25), AE = Math.atan2(0.5, 1);
    var SOCKET = 'p.units("in");\nvar R = Math.sqrt(1.25), a = Math.atan2(0.5, 1) * 180 / Math.PI;\n' +
      'p.sketch("Front").line(0,0,2,0).line(2,0,2,3).line(2,3,0,3).line(0,3,0,0).revolve(360);\n' +
      'p.sketch("Front").line(0,3.5,1,3.5).line(1,3.5,1,2).arc(0,1.5,R,a,-90).line(0,1.5-R,0,3.5).revolveCut(360);\n';

    test('rfFR: chamfer .3 on a ball dimple\'s rim (plane meets sphere): an exact cone frustum, the setback on the sphere a chord .3 (OpenCascade 12.1643171, 1.7e-6 of the removed volume); the same at maxAngle 0, 12 and 3', function () {
      var ph = 2 * Math.asin(0.3), pB = [0.5 * Math.cos(ph), 1 - 0.5 * Math.sin(ph)];
      var exact = rfFRvol([['l', [0, 0], [2, 0]], ['l', [2, 0], [2, 1]], ['l', [2, 1], [0.8, 1]], ['l', [0.8, 1], pB],
        ['a', [0, 1], 0.5, -ph, -PI / 2], ['l', [0, 0.5], [0, 0]]]);
      var code = DIMPLE + 'p.chamfer(0.3, [[0.5, 1, 0]]);\n', out = [];
      [0, 12, 3].forEach(function (a) {
        var r = rfFRbuild(code, a);
        nearRel(r.mp.volume, exact, 1e-9, 'volume at maxAngle ' + a);
        assert(rfFRcones(r) >= 1, 'a cone record');
        out.push(r.mp.volume.toFixed(9));
      });
      nearRel(exact, 12.164317090108204, 3e-8, 'OpenCascade');
      return 'exact ' + exact.toFixed(9) + ', Anvil ' + out.join(' / ');
    });

    test('rfFR: chamfer .2 and R.1 where a Ø2 bore meets a spherical bottom (cylinder meets sphere, convex): exact cone / torus at maxAngle 0, 12, 3 (were refused: two curved faces); = OpenCascade (29.7547716, 29.7976730) to 1.4e-4 / 3.7e-4 of the removed volume', function () {
      var ph = 2 * Math.asin(0.2 / (2 * RS)), pB = [RS * Math.cos(AE - ph), 1.5 + RS * Math.sin(AE - ph)];
      var head = [['l', [0, 0], [2, 0]], ['l', [2, 0], [2, 3]], ['l', [2, 3], [1, 3]]], tail = [['l', [0, 1.5 - RS], [0, 0]]];
      var exCh = rfFRvol(head.concat([['l', [1, 3], [1, 2.2]], ['l', [1, 2.2], pB], ['a', [0, 1.5], RS, AE - ph, -PI / 2]], tail));
      var r = 0.1, zF = 1.5 + Math.sqrt((RS + r) * (RS + r) - (1 + r) * (1 + r)), F = [1 + r, zF];
      var bF = Math.atan2(1.5 - zF, -(1 + r)); if (bF < 0) bF += 2 * PI;
      var pR = [F[0] + r * Math.cos(bF), F[1] + r * Math.sin(bF)], aR = Math.atan2(pR[1] - 1.5, pR[0]);
      var exF = rfFRvol(head.concat([['l', [1, 3], [1, zF]], ['a', F, r, PI, bF], ['a', [0, 1.5], RS, aR, -PI / 2]], tail));
      var out = [];
      [0, 12, 3].forEach(function (a) {
        var c = rfFRbuild(SOCKET + 'p.chamfer(0.2, [[1, 2, 0]]);\n', a), f = rfFRbuild(SOCKET + 'p.fillet(0.1, [[1, 2, 0]]);\n', a);
        nearRel(c.mp.volume, exCh, 1e-9, 'chamfer at maxAngle ' + a);
        nearRel(f.mp.volume, exF, 1e-9, 'fillet at maxAngle ' + a);
        out.push(c.mp.volume.toFixed(9) + ', ' + f.mp.volume.toFixed(9));
      });
      return 'exact ' + exCh.toFixed(9) + ', ' + exF.toFixed(9) + '; Anvil ' + out.join(' / ');
    });

    test('rfFR: chamfer .2 and R.3 where a Ø2 shaft meets its spherical dome (convex, the wedge inside the sphere): the air pocket between the sphere\'s chords and the true circle at B is filled before the cut, so the volume is exact at maxAngle 0 and 12 (OpenCascade 7.3103233 / 7.3743243, 7.6e-5 / 1.0e-4 of the removed volume); closed at 3 (the pocket fill cracks there and is left out: 1.5e-5 / 2.5e-3 of the removed volume)', function () {
      var DOME = 'p.units("in");\nvar R = Math.sqrt(1.25), a = Math.atan2(0.5, 1) * 180 / Math.PI;\np.sketch("Front").line(0,0,1,0).line(1,0,1,2).arc(0,1.5,R,a,90).line(0,1.5+R,0,0).revolve(360);\n';
      var ph = 2 * Math.asin(0.1 / RS), pB = [RS * Math.cos(AE + ph), 1.5 + RS * Math.sin(AE + ph)], tail = [['l', [0, 1.5 + RS], [0, 0]]];
      var exCh = rfFRvol([['l', [0, 0], [1, 0]], ['l', [1, 0], [1, 1.8]], ['l', [1, 1.8], pB], ['a', [0, 1.5], RS, AE + ph, PI / 2]].concat(tail));
      var r = 0.3, fx = 1 - r, fz = 1.5 + Math.sqrt((RS - r) * (RS - r) - fx * fx), aB = Math.atan2(fz - 1.5, fx);
      var exF = rfFRvol([['l', [0, 0], [1, 0]], ['l', [1, 0], [1, fz]], ['a', [fx, fz], r, 0, aB], ['a', [0, 1.5], RS, aB, PI / 2]].concat(tail));
      var out = [];
      [0, 12, 3].forEach(function (a) {
        var c = rfFRbuild(DOME + 'p.chamfer(0.2, [[1, 2, 0]]);\n', a), f = rfFRbuild(DOME + 'p.fillet(0.3, [[1, 2, 0]]);\n', a);
        var tol = a === 3 ? [2e-7, 2e-6] : [1e-10, 1e-10];   // relative to the part (7.3 in³)
        nearRel(c.mp.volume, exCh, tol[0], 'chamfer at maxAngle ' + a);
        nearRel(f.mp.volume, exF, tol[1], 'fillet at maxAngle ' + a);
        out.push(c.mp.volume.toFixed(9) + ', ' + f.mp.volume.toFixed(9));
      });
      return 'exact ' + exCh.toFixed(9) + ', ' + exF.toFixed(9) + '; Anvil ' + out.join(' / ');
    });

    test('rfFR: R2 / chamfer 1.5 on an elliptic boss\'s top rim and root, R2 / chamfer 1 on an extruded spline edge: closed at maxAngle 12 and 3, removed volume = OpenCascade\'s (ellipse 85.24066, −90.05981, 111.33712, −118.40586 to 8e-4 at 12°, 1.5e-4 at 3°; spline 39.41385, 22.89415 to 6e-3, Anvil\'s spline itself)', function () {
      var ELL = 'p.units("mm"); p.box(80, 60, 10);\np.sketch("Top", 10).ellipse(40, -30, 20, 12).extrude(15);\n';
      var SPL = 'p.units("mm"); p.sketch("Front").line(0,0,40,0).line(40,0,40,20).spline([[40,20],[25,30],[10,22],[0,20]]).line(0,20,0,0).extrude(15);\n';
      var cases = [[ELL, 'p.fillet(2, [[60, 25, 30]]);', 85.24066, 8e-4, 1.5e-4], [ELL, 'p.fillet(2, [[60, 10, 30]]);', -90.05981, 8e-4, 1.5e-4],
        [ELL, 'p.chamfer(1.5, [[60, 25, 30]]);', 111.33712, 8e-4, 1.5e-4], [ELL, 'p.chamfer(1.5, [[60, 10, 30]]);', -118.40586, 8e-4, 1.5e-4],
        [SPL, 'p.fillet(2, [[25, 30, 0]]);', 39.41385, 6e-3, 6e-3], [SPL, 'p.chamfer(1, [[25, 30, 0]]);', 22.89415, 6e-3, 6e-3]];
      var prev = K.setTessellation(), out = [];
      try {
        [12, 3].forEach(function (a, ai) {
          K.setTessellation({ maxAngle: a });
          cases.forEach(function (c) {
            var base = build(c[0]), r = build(c[0] + c[1]);
            rfFRtight(r, c[1] + ' at ' + a + '°');
            nearRel(base.mp.volume - r.mp.volume, c[2], c[3 + ai], c[1] + ' removed at ' + a + '°');
            out.push((base.mp.volume - r.mp.volume).toFixed(4));
          });
        });
      } finally { K.setTessellation(prev); }
      return 'removed ' + out.join(', ');
    });

    // a Ø8 hole through a 40 × 30 × 20 block, its axis 8 from a 40 long top edge: R9 / chamfer 9 on that edge run into it
    var BOXHOLE = 'p.units("mm"); p.box(40, 20, 30); p.hole("Top", 32, -10, 8, { offset: 30 });\n';
    var POCKET = 'p.units("mm"); p.box(40, 20, 30);\np.sketch("Top", 30).rect(28, -14, 8, 8).cut(5, { reverse: true });\n';
    var REFUSE = /^Failed to create (fillet|chamfer)\. The (radius|distance) may be too large for the selected edges\.$/;
    function rfFRint(f, a, b) { var n = 20000, s = 0; for (var i = 0; i < n; i++) s += f(a + (b - a) * (i + 0.5) / n); return s * (b - a) / n; }
    function rfFRtight(r, label) {
      noErrors(r);
      var ck = Evaluate.checkBody(r.body, { maxPairs: 1 });
      assert(!ck.openEdges.length && !ck.nonManifoldEdges.length, label + ': open ' + ck.openEdges.length + ', non-manifold ' + ck.nonManifoldEdges.length);
    }
    test('rfFR: R9 and chamfer 9 on a block edge whose setback crosses a Ø8 hole are built, trimmed by the hole (were refused): removed = the corner region less what the hole already took (exact to 3e-7; OpenCascade\'s R9 removes 677.61, 2.3 % short; it fails the chamfer)', function () {
      var base = build(BOXHOLE), f = build(BOXHOLE + 'p.fillet(9, [[20, 30, 0]]);'), c = build(BOXHOLE + 'p.chamfer(9, [[20, 30, 0]]);');
      rfFRtight(f, 'R9'); rfFRtight(c, 'chamfer 9');
      function w(z) { return 2 * Math.sqrt(Math.max(0, 16 - (z - 10) * (z - 10))); }
      var exF = (1 - PI / 4) * 81 * 40 - rfFRint(function (z) { return w(z) * (9 - Math.sqrt(81 - (9 - z) * (9 - z))); }, 6, 9);
      var exC = 40.5 * 40 - rfFRint(function (z) { return w(z) * (9 - z); }, 6, 9);
      nearRel(base.mp.volume - f.mp.volume, exF, 1e-6, 'R9 removed');
      nearRel(base.mp.volume - c.mp.volume, exC, 1e-6, 'chamfer 9 removed');
      return 'R9 removes ' + (base.mp.volume - f.mp.volume).toFixed(6) + ' (exact ' + exF.toFixed(6) + '), chamfer ' + (base.mp.volume - c.mp.volume).toFixed(6) + ' (' + exC.toFixed(6) + ')';
    });
    test('rfFR: R9 on the four edges of a block face, the top and bottom rounds\' setbacks crossing a Ø10 hole (rfFM pinned this one as refused; SolidWorks trims the rounds by the hole): removed = the same rounds without the hole less the hole\'s part of the two corner regions (2e-5: the hole\'s chords inside the rounds)', function () {
      var B0 = 'p.units("mm"); p.box(40, 20, 30);\n', B = B0 + 'p.hole("Top", 20, -10, 10, { offset: 30 });\n', F = 'p.fillet(9, [[20, 30, 20], [20, 0, 20], [40, 15, 20], [0, 15, 20]]);';
      var base = build(B), f = build(B + F), base0 = build(B0), f0 = build(B0 + F);
      rfFRtight(f, 'R9');
      var hole = rfFRint(function (z) { return 2 * Math.sqrt(Math.max(0, 25 - (z - 10) * (z - 10))) * (9 - Math.sqrt(81 - (z - 11) * (z - 11))); }, 11, 15);
      var ex = (base0.mp.volume - f0.mp.volume) - 2 * hole;
      nearRel(base.mp.volume - f.mp.volume, ex, 2e-5, 'removed');
      // (the four mitred rounds alone remove 2154.340 where the swept spandrel is (1 − π/4)·81·(140 − 8g) = 2154.027,
      // g = 9(10 − 3π)/(3(4 − π)): 0.078 per 90° mitre, the same at maxAngle 3: an open finding, not this lane's)
      return 'removed ' + (base.mp.volume - f.mp.volume).toFixed(6) + ', expected ' + ex.toFixed(6);
    });
    test('rfFR: R9 on a block edge whose setback crosses a blind 8 × 8 × 5 pocket is built, trimmed by the pocket\'s walls: = the corner region less the pocket\'s part to 1.7e-5 (the round\'s facets cut along the pocket wall, where curveCorrection\'s radial columns cross it at 19°); OpenCascade fails', function () {
      var base = build(POCKET), f = build(POCKET + 'p.fillet(9, [[20, 30, 0]]);');
      rfFRtight(f, 'R9');
      var ex = (1 - PI / 4) * 81 * 40 - 8 * (27 - (1.5 * Math.sqrt(72) + 40.5 * Math.asin(1 / 3)));
      nearRel(base.mp.volume - f.mp.volume, ex, 2e-5, 'removed');
      return 'removed ' + (base.mp.volume - f.mp.volume).toFixed(6) + ', exact ' + ex.toFixed(6);
    });
    test('rfFR: R3.981 on the rim of a Ø6 hole 5 from a Ø20 boss: the setback runs under the boss; the boss is kept whole and its wall carried down to the round (removed = the round\'s corner ring less its part under the boss footprint, 81.938 to 8e-4: the facets; OpenCascade removes 78.51); still refused when it runs off the plate (R16)', function () {
      var B = 'p.units("mm"); p.box(60, 60, 10);\np.sketch("Top", 10).circle(30, -30, 10).extrude(15);\np.hole("Top", 45, -30, 6, { offset: 10 });\n';
      var base = build(B), f = build(B + 'p.fillet(3.981, [[47.971178, 10, 29.707365]]);');
      rfFRtight(f, 'R3.981');
      var R = 3.981, a = 3, s = a + R, V = 0, NR = 400, NT = 2000;
      for (var i = 0; i < NR; i++) {
        var rho = a + (s - a) * (i + 0.5) / NR, h = R - Math.sqrt(R * R - (s - rho) * (s - rho)), ang = 0;
        for (var j = 0; j < NT; j++) { var t = 2 * PI * (j + 0.5) / NT, x = 15 + rho * Math.cos(t), z = rho * Math.sin(t); if (x * x + z * z >= 100) ang += 2 * PI / NT; }
        V += h * rho * ang * (s - a) / NR;
      }
      nearRel(base.mp.volume - f.mp.volume, V, 1.5e-3, 'removed');
      // the boss: its top face and full height are untouched
      assert(Math.abs(f.mp.bbox.max[1] - 25) < 1e-9, 'boss top ' + f.mp.bbox.max[1]);
      var big = build(B + 'p.fillet(16, [[47.971178, 10, 29.707365]]);');
      assert(REFUSE.test(Object.keys(big.errors).map(function (k) { return big.errors[k]; }).join(' | ')), 'R16 refused');
      return 'removed ' + (base.mp.volume - f.mp.volume).toFixed(5) + ', model ' + V.toFixed(5);
    });
    test('rfFR: K.fitProbe.where names the place of a refusing miss: R9 on a 2 mm shelled box\'s outer edge breaks through the wall (\'face\'), R12 on the block edge runs off the 20 mm face (\'off\')', function () {
      var sh = build('p.units("mm"); p.box(40, 20, 30); p.shell(2, [[20, 30, 10]]);\np.fillet(9, [[0, 0, 10]]);');
      assert(Object.keys(sh.errors).length && /face/.test(K.fitProbe.where), 'shell: ' + K.fitProbe.where);
      var off = build(BOXHOLE + 'p.fillet(25, [[20, 30, 0]]);');
      assert(Object.keys(off.errors).length && /off/.test(K.fitProbe.where), 'off: ' + K.fitProbe.where);
    });
    test('rfFR: P07 with tangent propagation (SolidWorks\' default): the R.25 runs on round the R.5 round\'s end arc onto the edge through (2, 1, 2), so the R.375 finds no edge there, as in SolidWorks; = OpenCascade (which propagates too) 7.843103500 to 1e-9. Without propagation see rfFF2 (SolidWorks 7.817528, 1.1e-6)', function () {
      var B = 'p.units("in");\np.sketch("Top").rect(0, -2, 2, 2).end();\np.extrude(2);\np.fillet(0.5, [[1, 2, 2]]);\np.fillet(0.25, [[2, 2, 1]]);\n';
      var two = build(B);
      rfFRtight(two, 'two rounds');
      nearRel(two.mp.volume, 7.843103500391091, 1e-9, 'two rounds vs OpenCascade');
      var three = build(B + 'p.fillet(0.375, [[2, 1, 2]]);');
      assert(/No edges found/.test(Object.keys(three.errors).map(function (k) { return three.errors[k]; }).join(' | ')), 'third round: no edge');
    });
  })();
