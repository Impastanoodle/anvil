  // --- rfFM (2026-10-29, lane FM: fillet / chamfer on any edge builds right or says why) --- a fuzz of fillets and
  // chamfers on every edge, every edge of a face and all edges of the examples and stock shapes (small 5 % and large
  // 45 % of the shortest adjacent edge) against OpenCascade found: concave tools reaching 1.5 × size behind the corner
  // out through thin walls (L of 8 mm legs R9 +4 %, shelled box +22 %), convex tools reaching 1.5 × size out across a
  // thin bore into the far wall (Funnel: "Maximum call stack size exceeded" from the BSP), the 0.01 overshoot of a
  // concave free end adding material, a small round on an inch hole rim cracking the plate face (8 chords of 11°: the
  // first within 1e-5 of the plane), three chamfers at a box corner leaving the corner under the triangle, a corner
  // edge ending at a 45° chamfer cone stopping short, and radii that cannot fit cutting a wrong body. kernel-mesh.js:
  // rfFMband, rfFMarcAngles, rfFMprobes / rfFMrefuse, the chamfer corner tetrahedron, capFor's run-on and end caps.
  (function () {
    group('rfFM: fillet / chamfer on any edge builds right or says why');
    var PI = Math.PI, SPA = 1 - PI / 4;
    var L_PART = 'p.units("mm"); p.sketch("Front").polyline([[0,0],[40,0],[40,8],[8,8],[8,30],[0,30]], true).extrude(20);\n';
    var SHELL = 'p.units("mm"); p.box(40, 20, 30); p.shell(2, [[20, 30, 10]]);\n';
    var BOX12 = [[0, 30, 10], [20, 30, 20], [40, 30, 10], [20, 30, 0], [20, 0, 20], [0, 0, 10], [20, 0, 0], [40, 0, 10], [40, 15, 20], [0, 15, 20], [40, 15, 0], [0, 15, 0]];
    var REFUSE = /^Failed to create (fillet|chamfer)\. The (radius|distance) may be too large for the selected edges\.$/;
    function rfFMedge(code, kind, size, ats, chain) {
      return build(code + 'p.' + kind + '(' + size + ', ' + JSON.stringify(ats) + (chain === false ? ', { chain: false }' : '') + ');');
    }
    function rfFMerr(r) { return Object.keys(r.errors).map(function (k) { return r.errors[k]; }).join(' | '); }
    function rfFMtight(r, label) {
      var ck = Evaluate.checkBody(r.body, { maxPairs: 1 });
      assert(!ck.openEdges.length && !ck.nonManifoldEdges.length, label + ': open ' + ck.openEdges.length + ', non-manifold ' + ck.nonManifoldEdges.length);
    }

    test('rfFM: concave R9 / chamfer 9 in the inside corner of an L with 8 mm legs: exact ((1 − π/4) r² L, d²/2 L; = OpenCascade), nothing added behind the legs or past the ends', function () {
      var f = rfFMedge(L_PART, 'fillet', 9, [[8, 8, 10]]); noErrors(f); rfFMtight(f, 'fillet');
      nearRel(f.mp.volume, 9920 + SPA * 81 * 20, 1e-9, 'R9');
      var c = rfFMedge(L_PART, 'chamfer', 9, [[8, 8, 10]]); noErrors(c); rfFMtight(c, 'chamfer');
      nearRel(c.mp.volume, 9920 + 40.5 * 20, 1e-9, 'chamfer 9');
      [f, c].forEach(function (r) { assert(r.mp.bbox.min[0] > -1e-9 && r.mp.bbox.min[1] > -1e-9 && r.mp.bbox.max[2] < 20 + 1e-9, 'bbox ' + JSON.stringify(r.mp.bbox)); });
    });
    test('rfFM: concave R7.2 inside a 2 mm shelled box (floor to wall, ending on the side walls): exact, = OpenCascade (was +22 %: the tool came out under the floor)', function () {
      var r = rfFMedge(SHELL, 'fillet', 7.2, [[20, 2, 18]]); noErrors(r); rfFMtight(r, 'shell');
      nearRel(r.mp.volume, 24000 - 36 * 28 * 16 + SPA * 7.2 * 7.2 * 36, 1e-9, 'volume');
    });
    test('rfFM: 40 × 30 × 20 box, all 12 edges chamfered 9: the three chamfers at each corner meet in a triangle (as SolidWorks / OpenCascade), V = 13308 exactly', function () {
      var r = rfFMedge('p.units("mm"); p.box(40, 20, 30);\n', 'chamfer', 9, BOX12); noErrors(r); rfFMtight(r, 'box');
      nearRel(r.mp.volume, 13308, 1e-12, 'volume');
    });
    test('rfFM: R.0125 and R.1125 on both rims of a Ø.5 hole in a .25 inch plate: watertight (a crack beside the rim before), exact tori (= OpenCascade)', function () {
      var code = 'p.units("in"); p.box(4, 3, 0.25); p.hole("Top", 2, -1.5, 0.5, { offset: 0.25 });\n';
      [[0.0125, 2.950806095851330], [0.1125, 2.941522205011679]].forEach(function (c) {
        var r = rfFMedge(code, 'fillet', c[0], [[1.9278, 0.25, 1.2619], [2.0722, 0, 1.7381]]); noErrors(r); rfFMtight(r, 'R' + c[0]);
        assert(K.meshQuality(r.mesh).openEdges === 0, 'R' + c[0] + ': mesh open edges');
        nearRel(r.mp.volume, c[1], 1e-9, 'R' + c[0]);
      });
    });
    test('rfFM: Hex nut corner edges ending at the 45° chamfer cone run on until the round leaves the body (OpenCascade within 1e-5; was 2e-4 / 4e-3 short)', function () {
      var nut = AnvilExamples.filter(function (e) { return e.name === 'Hex nut'; })[0].code + '\n';
      var b0 = build(nut).mp.volume;
      var f = rfFMedge(nut, 'fillet', 3.393, [[9.5, 5, -5.4848]]); noErrors(f); rfFMtight(f, 'fillet');
      var c = rfFMedge(nut, 'chamfer', 3.393, [[9.5, 5, -5.4848]]); noErrors(c); rfFMtight(c, 'chamfer');
      // OpenCascade (headless --occt): the same edge removes 5.19371 / 47.61442 mm³ (Anvil 5.19145 / 47.61762; the nut's
      // own faceted chamfer cone differs from the true one by more); stopping at the cone removed 4.68 / 37.69
      near(b0 - f.mp.volume, 5.19371, 0.01, 'fillet removes');
      near(b0 - c.mp.volume, 47.61442, 0.01, 'chamfer removes');
    });
    test('rfFM: the Funnel\'s inner spout edge R15.51 builds watertight (was "Maximum call stack size exceeded": the tool reached 23 mm out across the bore; a lone chord of it ran on 21 mm along its tangent)', function () {
      var fun = AnvilExamples.filter(function (e) { return e.name === 'Funnel'; })[0].code + '\n';
      var base = build(fun), r = rfFMedge(fun, 'fillet', 15.51, [[3.4678, 20.5393, 4.2255]]); noErrors(r); rfFMtight(r, 'ring');
      assert(r.mp.volume < base.mp.volume && r.mp.volume > base.mp.volume - 250, 'removed ' + (base.mp.volume - r.mp.volume));
      var one = rfFMedge(fun, 'fillet', 15.51, [[3.4678, 20.5393, 4.2255]], false); noErrors(one); rfFMtight(one, 'one chord');
      assert(base.mp.volume - one.mp.volume < 10, 'one chord removed ' + (base.mp.volume - one.mp.volume));
    });
    test('rfFM: a radius that cannot fit is refused with SolidWorks\' message, the body before it kept: R7.2 round the 2 mm rim of a shelled box, chamfer 9 through its 2 mm walls', function () {
      var cases = [
        [SHELL, 'fillet', 7.2, [[40, 30, 10], [20, 30, 0], [0, 30, 10], [20, 30, 20], [38, 30, 10], [20, 30, 18], [2, 30, 10], [20, 30, 2]]],
        [SHELL, 'chamfer', 9, [[0, 0, 10]]],
        [SHELL, 'fillet', 7.2, [[40, 30, 10], [20, 30, 0], [0, 30, 10], [20, 30, 20]]]   // the 4 outer rim edges alone (smoke rfFM): the setback lies in the pocket along the whole edge, not a hole crossing it (head, local-2026-10-30a)
      ];
      cases.forEach(function (c, i) {
        var base = build(c[0]), r = rfFMedge(c[0], c[1], c[2], c[3]), msg = rfFMerr(r);
        assert(REFUSE.test(msg), 'case ' + i + ': ' + msg);
        nearRel(r.mp.volume, base.mp.volume, 1e-12, 'case ' + i + ' keeps the body');
      });
    });
    test('rfFM: a round that fits is not refused: every edge of the L and of the box R3 / chamfer 3, the shell\'s outer edges R1.5, the inch plate\'s every edge R.1125', function () {
      var all = [[20, 0, 20], [40, 4, 20], [24, 8, 20], [8, 19, 20], [4, 30, 20], [0, 15, 20], [40, 4, 0], [20, 0, 0], [0, 15, 0], [4, 30, 0], [8, 19, 0], [24, 8, 0], [40, 0, 10], [0, 0, 10], [40, 8, 10], [8, 8, 10], [8, 30, 10], [0, 30, 10]];
      ['fillet', 'chamfer'].forEach(function (k) {
        var r = rfFMedge(L_PART, k, 3, all); noErrors(r); rfFMtight(r, 'L ' + k);
        var b = rfFMedge('p.units("mm"); p.box(40, 20, 30);\n', k, 3, BOX12); noErrors(b); rfFMtight(b, 'box ' + k);
      });
      var s = rfFMedge(SHELL, 'fillet', 1.5, [[0, 0, 10], [40, 0, 10], [20, 0, 0], [20, 0, 20]]); noErrors(s); rfFMtight(s, 'shell');
      // four mitred corners: each pair of prisms meets on the diagonal plane, so Σ L less 2 × the spandrel's centroid
      // offset r (10 − 3π) / (12 − 3π) per corner (= OpenCascade 7815.35175); the mitred cylinder ends integrate to 2e-7
      var cbar = 1.5 * (10 - 3 * PI) / (12 - 3 * PI);
      nearRel(s.mp.volume, 7872 - SPA * 2.25 * (2 * 40 + 2 * 20 - 8 * cbar), 1e-6, 'shell bottom edges');
    });
    test('rfFM: Chamfered block: chamfers ending at the tangent R6 rounds stop on the tangent line (no 0.01 notch): the exact volume is the formula on every tessellation (was 40.15 mm³ light) and the body has no zero-area polygons', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Chamfered block'; })[0], want = 100000 - 4 * SPA * 36 * 25 - 2 * 212 - PI * 4.5 * 4.5 * 25 - PI * (64 - 20.25) * 6;
      var r = build(ex.code); noErrors(r);
      nearRel(r.mp.volume, want, 1e-11, 'default');
      var ck = Evaluate.checkBody(r.body, { maxPairs: 1 });
      assert(ck.ok, 'check: open ' + ck.openEdges.length + ', zero-area ' + ck.zeroAreaFaces.length);
      nearRel(withLegacy(function () { return build(ex.code).mp.volume; }), want, 1e-11, 'legacy');
    });
    test('rfFM: a small round on an inch plate edge: one exact cylinder (its end chords turn ≥ 23°, rfFMarcAngles)', function () {
      var r = rfFMedge('p.units("in"); p.box(4, 3, 0.25);\n', 'fillet', 0.0125, [[2, 0.25, 0]]); noErrors(r); rfFMtight(r, 'plate');
      var cyl = K.curveSurfaces(r.mesh).filter(function (s) { return s.surf.t === 'cyl'; });
      assert(cyl.length === 1, 'one cylinder face: ' + cyl.length);
      nearRel(r.mp.volume, 3 - SPA * 0.0125 * 0.0125 * 4, 1e-12, 'volume');
    });
    test('rfFM: smooth shading reaches every triangle of a record-less curved face cut into pieces (the Funnel\'s shelled loft: 617 of 1742 inner triangles were flat bands)', function () {
      var r = build(AnvilExamples.filter(function (e) { return e.name === 'Funnel'; })[0].code), m = r.mesh, sm = K.analyticNormals(m), flat = 0, tot = 0;
      m.faces.forEach(function (f) {
        if (!f.polys || f.polys.some(function (p) { return p.surf; }) || Math.abs(f.normal[1]) > 0.99) return;   // loft / shell facets (not the end rings)
        for (var t = f.start; t < f.start + f.count; t++) {
          tot++;
          var d = 0;
          for (var k = 0; k < 9; k++) d = Math.max(d, Math.abs(sm[t * 9 + k] - m.normals[t * 9 + k]));
          if (d <= 1e-3) flat++;
        }
      });
      // lane FX: the loft between the Funnel's coaxial circles is a cone record now (loftAxisRecords) and its shell's inner
      // walls carry the offset cone: they shade from the records, so no record-less loft triangles are left to check
      var cone = m.faces.filter(function (f) { return f.polys && f.polys.some(function (p) { return p.surf && p.surf.s && p.surf.s.t === 'cone'; }); }).length;
      assert(flat === 0 && (tot > 1000 || cone > 100), flat + ' of ' + tot + ' facet triangles keep the flat normal (' + cone + ' cone faces)');
      // lane GC: the record-carrying faces shade from their records: every corner of the outer cone (r 40) and of the
      // shell's inner offset cone (r 38.055, the same k) takes the record's normal (a wrong apex / k sign / axis would
      // be ignored and leave the wall flat-shaded), on 1000+ inner triangles
      var P = m.positions64, worst = 0, radii = {}, inner = 0;
      m.faces.forEach(function (f) {
        var s = f.polys && f.polys[0] && f.polys[0].surf && f.polys[0].surf.s;
        if (!s || s.t !== 'cone') return;
        radii[s.r.toFixed(3)] = true;
        if (s.r < 39) inner += f.count;
        for (var t = f.start; t < f.start + f.count; t++) for (var c = 0; c < 3; c++) {
          var x = [P[t * 9 + c * 3], P[t * 9 + c * 3 + 1], P[t * 9 + c * 3 + 2]], N = K.surfNormalAt(s, x, f.centroid);
          if (N[0] * f.normal[0] + N[1] * f.normal[1] + N[2] * f.normal[2] < 0) N = N.map(function (v) { return -v; });
          worst = Math.max(worst, Math.hypot(sm[t * 9 + c * 3] - N[0], sm[t * 9 + c * 3 + 1] - N[1], sm[t * 9 + c * 3 + 2] - N[2]));
        }
      });
      assert(radii['40.000'] && radii['38.055'] && inner > 1000, 'outer and inner cone records: ' + Object.keys(radii).join(', ') + '; ' + inner + ' inner triangles');
      assert(worst < 1e-6, 'smooth normal vs the cone record ' + worst.toExponential(2));
      return cone + ' cone faces, ' + inner + ' inner cone triangles shaded from the offset record (worst ' + worst.toExponential(1) + ')';
    });
  })();
