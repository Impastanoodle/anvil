  // --- rfGE (2026-11-02, lane flanges: edge flanges = SolidWorks 2022 SP5) --- from the second reference pass (rfGD,
  // test-reports/2026-11-02-solidworks-reference-2.md, ranked mismatches 1, 2, 4). flangeLayout's placement rule at every
  // angle: Material Inside keeps the wall's outer face through the base's top edge (the outer virtual sharp sits
  // s = −T·cot A past the edge), Material Outside its inner face (s = T·tan(A/2)). Bend Outside and 90° do not move. A
  // multi-edge flange's auto miter at a square corner is Butt with the bend closed, gap 0.01 in: walls stop square T + g/√2
  // from the outer corner; the bend's end runs from the base corner at its start to the wall's end at its end, straight in
  // (angle, t); the flat is a plus with a square notch at the wall ends. rfGD's rows carry the same numbers: the head
  // promotes those; here the rule itself is pinned, with SolidWorks' numbers where they were measured.
  (function () {
    group('rfGE: edge flange placement below 90° and Material Outside, auto miter = Butt with the bend closed');
    var U = 'p.units("in");\n', TOL = 1e-4, VREL = 1e-5, T16 = 0.0598, PI = Math.PI;
    function rfGEcode(T, R, K0, A, pos, L) {
      return U + 'p.sheet(' + T + ', ' + R + ', ' + K0 + ');\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.flange(' + (L || 1) + ', [[2, ' + T + ', 2]], { angle: ' + A + ', position: "' + pos + '", lengthRef: "outer" });\n';
    }
    function rfGEok(r) {
      var e = Object.keys(r.errors).map(function (k) { return r.errors[k]; });
      assert(!e.length, 'errors: ' + e.join(' | '));
      var c = Evaluate.checkBody(r.body, { maxPairs: 1 });
      assert(!c.openEdges.length && !c.nonManifoldEdges.length, c.openEdges.length + ' open, ' + c.nonManifoldEdges.length + ' non-manifold edges');
    }
    function rfGElen(r) {   // the flat's size across the 4 in edge
      var s = K.flatPattern(r.model, r.build, r.mesh).size;
      return Math.abs(s[0] - 4) < 1e-9 ? s[1] : s[0];
    }
    // the rule by hand: the outer sharp s past the edge, base 2 − (bend start back from the edge), BA, wall 1 − (R + T)·tan(A/2)
    function rfGEflat(T, R, K0, A, s, L) {
      var a = A * PI / 180, ov = (R + T) * Math.tan(a / 2);
      return 2 + s - ov + a * (R + K0 * T) + (L || 1) - ov;
    }
    function rfGEs(T, A, pos) { var a = A * PI / 180; return pos === 'inside' ? -T / Math.tan(a) : T * Math.tan(a / 2); }

    test('rfGE: the two hand checks: 11 ga R 3T 45° and 16 ga R = T 30° Material Outside against SolidWorks', function () {
      // 45° inside: s = −.1196, bend from .3178 back; 2 − .31776 + BA .32877 + wall .80184 = 2.812848
      var a = build(rfGEcode(0.1196, 0.3588, 0.5, 45, 'inside'));
      rfGEok(a);
      near(rfGElen(a), 2.812848, TOL);
      nearRel(a.mp.volume, 1.3456665, VREL);
      near(rfGEflat(0.1196, 0.3588, 0.5, 45, rfGEs(0.1196, 45, 'inside')), 2.812848, 2e-6);
      // 30° outside: s = T·tan 15° = .016023, 2 − .016023 + BA .046967 + wall .967953 = 2.998897
      var b = build(rfGEcode(T16, T16, 0.5, 30, 'outside'));
      rfGEok(b);
      near(rfGElen(b), 2.998897, TOL);
      nearRel(b.mp.volume, 0.7173361, VREL);
      near(rfGEflat(T16, T16, 0.5, 30, rfGEs(T16, 30, 'outside')), 2.998897, 2e-6);
      return 'flats ' + rfGElen(a).toFixed(6) + ', ' + rfGElen(b).toFixed(6);
    });

    test('rfGE: SolidWorks\' measured rows: Material Inside at 30° and 45°, Material Outside at 30°, 45°, 120°, 135°, 90° unchanged', function () {
      [[0.1196, 0.3588, 0.5, 30, 'inside', 2.755651, 1.3183036], [0.1196, 0.3588, 0.5, 45, 'inside', 2.812848, 1.3456665], [T16, T16, 0.5, 30, 'outside', 2.998897, 0.7173361],
        [T16, T16, 0.5, 45, 'outside', 2.99614, 0.7166768], [T16, T16, 0.5, 120, 'outside', 2.877137, 0.6882112], [T16, T16, 0.5, 135, 'outside', 2.778241, 0.6645552],
        [T16, T16, 0.5, 90, 'outside', 2.9615, 0.7083909], [0.1196, 0.3588, 0.5, 90, 'inside', 2.700735, 1.2920318]].forEach(function (q) {
        var r = build(rfGEcode(q[0], q[1], q[2], q[3], q[4]));
        rfGEok(r);
        near(rfGElen(r), q[5], TOL);
        nearRel(r.mp.volume, q[6], VREL);
      });
      return '8 parts';
    });

    test('rfGE: the rule holds across gauges, radii, K and angles on both placements; the wall\'s face runs through the base\'s top edge', function () {
      var n = 0;
      [[0.0598, 0.0598], [0.1196, 0.1196], [0.0359, 0.0718], [0.1196, 0.3588]].forEach(function (g) {
        [0.33, 0.5].forEach(function (k0) {
          [20, 30, 45, 60, 75, 100, 120, 135, 150].forEach(function (A) {
            ['inside', 'outside'].forEach(function (pos) {
              var r = build(rfGEcode(g[0], g[1], k0, A, pos, 4)), a = A * PI / 180, R = g[1], T = g[0], back = (R + T) * Math.tan(a / 2) - rfGEs(T, A, pos);
              rfGEok(r);
              near(rfGElen(r), rfGEflat(T, R, k0, A, rfGEs(T, A, pos), 4), 1e-9);
              // the bend starts `back` from the edge, and the wall's outer (Inside) / inner (Outside) face, run down to the
              // sheet's top face, lands on the edge. The section's frame: top face at y = 0, bend centre at [0, R]
              var P = pos === 'inside' ? [(R + T) * Math.sin(a), R - (R + T) * Math.cos(a)] : [R * Math.sin(a), R - R * Math.cos(a)];
              near(P[0] - P[1] / Math.tan(a), back, 1e-9);
              n++;
            });
          });
        });
      });
      return n + ' parts';
    });

    test('rfGE: a Bend Outside flange and every 90° placement are where they were', function () {
      var T = T16, R = T16, BA = PI / 2 * (R + T / 2);
      near(rfGElen(build(rfGEcode(T, R, 0.5, 90, 'inside'))), 2 + 1 - 2 * (R + T) + BA, 1e-12);
      near(rfGElen(build(rfGEcode(T, R, 0.5, 90, 'outside'))), 2 - R + BA + 1 - (R + T), 1e-12);
      near(rfGElen(build(rfGEcode(T, R, 0.5, 90, 'bendOutside'))), 2 + BA + 1 - (R + T), 1e-12);
      [[30, 3.01492], [45, 3.02091], [120, 2.980714], [135, 2.922611]].forEach(function (q) { near(rfGElen(build(rfGEcode(T, R, 0.5, q[0], 'bendOutside'))), q[1], TOL); });
      // a hem is not a flange here: its Material Inside trim stays R + T, and it never reads tan(90°)
      var h = build(U + 'p.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.hem(0.5, [[2, ' + T + ', 2]], { hemType: "open", gap: 0.03, hemPosition: "inside", position: "outside" });\n');
      rfGEok(h);
      return 'ok';
    });

    var TRAY = 'p.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n';
    function rfGEtray(L, opts) { return U + TRAY + 'p.flange(' + L + ', [[3, 0.0598, 0], [3, 0.0598, 4], [0, 0.0598, 2], [6, 0.0598, 2]], ' + opts + ');\n'; }
    var MI = '{ position: "inside", lengthRef: "outer", miter: true }';
    // the plus: SolidWorks' top-face vertices, in its flat frame (corner of the part at 0,0): M03's [x, z] list, moved to Anvil's flat
    function rfGEnotch(a, b, w, h) { return [[a, b], [a, -b], [w - a, b], [w - a, -b], [a, h - b], [w - a, h - b]]; }
    function rfGEhas(loop, p, tol) { return loop.some(function (q) { return Math.hypot(q[0] - p[0], q[1] - p[1]) < tol; }); }
    function rfGEareaT(fl) { return fl.loops.reduce(function (s, l, i) { return s + (i ? -1 : 1) * Math.abs(K.signedArea(l)); }, 0) * T16; }
    // what SolidWorks' own faces add up to: base + walls + bends (each bend's mean length: base side to wall ends)
    function rfGEvol(L, g) {
      var T = T16, R = T16, e = T + g / Math.SQRT2, S = PI / 4 * ((R + T) * (R + T) - R * R), h = L - R - T;
      var lens = [6 - 2 * e, 6 - 2 * e, 4 - 2 * e, 4 - 2 * e], base = [6 - 2 * (R + T), 4 - 2 * (R + T)], v = base[0] * base[1] * T;
      lens.forEach(function (l, i) { v += l * h * T + S * (l + base[i < 2 ? 0 : 1]) / 2; });
      return v;
    }

    test('rfGE: M03: the flat is SolidWorks\' plus: 7.803401 × 5.803401, twelve corners, a square notch at the wall ends, blank × T = 2.483717669', function () {
      var r = build(rfGEtray(1, MI));
      rfGEok(r);
      var fl = K.flatPattern(r.model, r.build, r.mesh), l = fl.loops[0];
      assert(fl.loops.length === 1, fl.loops.length + ' loops');
      near(fl.size[0], 7.803400861, 1e-8); near(fl.size[1], 5.803400861, 1e-8);
      assert(l.length === 12, l.length + ' corners');
      var xs = l.map(function (p) { return p[0]; }), ys = l.map(function (p) { return p[1]; }), x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
      // SolidWorks' list, shifted so its −.9017 is the blank's lower left
      [[-0.9017, 0.066871], [-0.9017, 3.933129], [0.066871, -0.9017], [0.066871, 0.066871], [0.066871, 3.933129], [0.066871, 4.9017],
        [5.933129, -0.9017], [5.933129, 0.066871], [5.933129, 3.933129], [5.933129, 4.9017], [6.9017, 0.066871], [6.9017, 3.933129]].forEach(function (p) {
        assert(rfGEhas(l, [x0 + p[0] + 0.9017, y0 + (4 - p[1]) + 0.9017], 1e-5), 'corner ' + p + ' missing');
      });
      near(rfGEareaT(fl), 2.483717669, 1e-8);
      fl.bends.forEach(function (b) { near(Math.hypot(b.a[0] - b.b[0], b.a[1] - b.b[1]) > 4 ? Math.hypot(b.a[0] - b.b[0], b.a[1] - b.b[1]) : Math.hypot(b.a[0] - b.b[0], b.a[1] - b.b[1]) + 2, 6 - 2 * 0.066871068, 1e-6); });
      return fl.size.map(function (x) { return x.toFixed(6); }).join(' × ');
    });

    test('rfGE: M03: the solid has SolidWorks\' faces: bbox, base 5.7608 × 3.7608, walls stop .066871 from the corners, bend ends from the base corner to the wall end', function () {
      var r = build(rfGEtray(1, MI));
      rfGEok(r);
      near(r.mp.bbox.max[0], 6, 1e-9); near(r.mp.bbox.max[1], 1, 1e-9); near(r.mp.bbox.max[2], 4, 1e-9);
      var ins = r.body.pointTester(), Y = 0.5, e = 0.066871068, d = 1e-4;
      assert(ins([3, Y, 0.03]) && ins([0.03, Y, 2]), 'walls');
      assert(ins([e + d, Y, 0.03]) && !ins([e - d, Y, 0.03]), 'long wall stops at .066871');
      assert(ins([0.03, Y, e + d]) && !ins([0.03, Y, e - d]), 'short wall stops at .066871');
      assert(!ins([0.03, Y, 0.03]), 'the corner is open');
      assert(!ins([0.05, 0.0299, 0.05]), 'the base stops at its corner .1196, .1196');
      assert(ins([0.1196 + d, 0.0299, 0.1196 + d]), 'base corner');
      // both engines come to the same sum of faces (OpenCascade 2.482606, 38 faces, SolidWorks' count)
      near(r.mp.volume, rfGEvol(1, 0.01), 2e-7);
      return 'volume ' + r.mp.volume.toFixed(6);
    });

    var M24 = U + TRAY + 'p.flange(0.75, [[3, 0.0598, 0], [3, 0.0598, 4], [0, 0.0598, 2], [6, 0.0598, 2]], ' + MI + ');\np.sketch("Top", 0.0598).circle(0.5, -0.5, 0.1005).circle(5.5, -0.5, 0.1005).circle(0.5, -3.5, 0.1005).circle(5.5, -3.5, 0.1005).centerRect(3, -2, 2, 1).end().cut("through", { reverse: true });\n';
    test('rfGE TODO: M03 and M24 volume: SolidWorks reports 9e-5 less than the sum of its own faces (bbox, flat, every face area match)', function () {
      var a = build(rfGEtray(1, MI)), b = build(M24);
      // SolidWorks' base + walls + bends from its own face areas: 2.482603; its Mass Properties 2.482514708. On the same corner
      // from Closed Corner (corners/butt_closed_16, same face areas) the sum and its Mass Properties agree to 1.5e-7, and
      // M03 and M24 (same corners) are off by different amounts, so this reads as its integration of the eight spline
      // faces. A re-measure at Mass Properties accuracy 'maximum' would settle it.
      return 'TODO Anvil ' + a.mp.volume.toFixed(6) + ' / SolidWorks 2.482514708 (' + ((a.mp.volume - 2.482514708) / 2.482514708).toExponential(2) + ' rel); Anvil ' + b.mp.volume.toFixed(6) + ' / SolidWorks 2.064327659 (' + ((b.mp.volume - 2.064327659) / 2.064327659).toExponential(2) + ' rel)';
    });

    test('rfGE: M24: the cover tray\'s flat: 7.303401 × 5.303401, the same plus, four holes and the window; closed; laser DXF reads back', function () {
      var r = build(M24);
      rfGEok(r);
      var fl = K.flatPattern(r.model, r.build, r.mesh);
      near(fl.size[0], 7.303400861, 1e-8); near(fl.size[1], 5.303400861, 1e-8);
      assert(fl.loops.length === 6, fl.loops.length + ' loops');
      assert(fl.loops[0].length === 12, fl.loops[0].length + ' corners');
      var d = K.exportDXFFlat(fl, 'in');
      assert((d.match(/\bCIRCLE\b/g) || []).length === 4, 'four circles');
      return 'ok';
    });

    test('rfGE: a gap of its own, and no gap = SolidWorks\' default .01 in (.25 mm on a metric part)', function () {
      var a = build(rfGEtray(1, '{ position: "inside", lengthRef: "outer", miter: true, miterGap: 0.03 }')), z = build(rfGEtray(1, '{ position: "inside", lengthRef: "outer", miter: true, miterGap: 0 }'));
      rfGEok(a); rfGEok(z);
      near(a.mp.volume, rfGEvol(1, 0.03), 2e-7);
      near(z.mp.volume, rfGEvol(1, 0.01), 2e-7);
      var fl = K.flatPattern(a.model, a.build, a.mesh), e = 0.0598 + 0.03 / Math.SQRT2;
      near(rfGEareaT(fl) / T16, (6 - 2 * e) * (4 - 2 * e) + 2 * (6 - 2 * e + 4 - 2 * e) * (e - 0.1196 + PI / 2 * 0.0897 + 0.8804), 1e-8);
      var m = build('p.units("mm");\np.sheet(1.5, 1.5, 0.5);\np.sketch("Top").rect(0, -100, 150, 100).end().baseFlange();\np.flange(25, [[75, 1.5, 0], [75, 1.5, 100], [0, 1.5, 50], [150, 1.5, 50]], ' + MI + ');\n');
      rfGEok(m);
      var ins = m.body.pointTester(), w = 1.5 + 0.25 / Math.SQRT2;
      assert(ins([w + 0.01, 10, 0.75]) && !ins([w - 0.01, 10, 0.75]), 'wall stops at 1.5 + .25/√2 mm');
      return 'ok';
    });

    test('rfGE: every placement: walls stop T + g/√2 from their outer corner, the flat\'s notch sits at the wall ends (SolidWorks\' miter_16_bendout .052729 past the edge, miter_16_outside .007071 short)', function () {
      [['inside', -0.066871068], ['virtualSharp', -0.066871068], ['outside', -0.007071068], ['bendOutside', 0.052728932]].forEach(function (q) {
        var r = build(U + 'p.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.flange(1, [[2, 0.0598, 2], [4, 0.0598, 1]], { position: "' + q[0] + '", lengthRef: "outer", miter: true });\n');
        rfGEok(r);
        var fl = K.flatPattern(r.model, r.build, r.mesh), l = fl.loops[0];
        assert(fl.loops.length === 1 && l.length === 6, q[0] + ': ' + fl.loops.length + ' loops, ' + l.length + ' corners');
        var ins = r.body.pointTester(), wallZ = q[0] === 'bendOutside' ? 2.0897 : q[0] === 'outside' ? 2.0299 : 1.9701, Y = 0.5, x = 4 + q[1];
        assert(ins([x - 1e-4, Y, wallZ]) && !ins([x + 1e-4, Y, wallZ]), q[0] + ': the wall stops at x = ' + x);
      });
      return 'four placements';
    });

    test('rfGE: mitres SolidWorks was not measured on stay bisector mitres: flanges off 90°, corners that are not square', function () {
      var head = U + 'p.sheet(0.0598, 0.0598, 0.5);\n', sq = build(head + 'p.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n'), tz = build(head + 'p.sketch("Top").polyline([[0, 0], [6, 0], [5, -3], [1, -3]], true).end().baseFlange();\n');
      function lay(r, edges, A) { return K.flangeLayout({ type: 'flange', edges: edges, length: 1, angle: A, position: 'bendOutside', miter: true }, r.model, { body: r.body }); }
      var sqE = [{ at: [3, 0.0598, 4] }, { at: [6, 0.0598, 2] }], a = lay(sq, sqE, 90), b = lay(sq, sqE, 120);
      assert(a.parts.every(function (p) { return p.taper && !p.clips.length; }), 'a square 90° corner is a butt');
      assert(b.parts.every(function (p) { return !p.taper && p.clips.length; }), '120°: bisector');
      var c = lay(tz, [{ at: [3, 0.0598, 0] }, { at: [5.5, 0.0598, 1.5] }], 90);
      assert(c.parts.every(function (p) { return !p.taper && p.clips.length; }), 'a corner that is not square: bisector');
      var r = build(head + 'p.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1, [[3, 0.0598, 4], [6, 0.0598, 2]], { angle: 120, position: "bendOutside", miter: true });\n');
      rfGEok(r);
      assert(K.flatPattern(r.model, r.build, r.mesh).loops.length === 1, 'one blank');
      return 'ok';
    });

    test('rfGE: Unfold of a mitred tray = the blank × T, Fold back = the tray', function () {
      var c = rfGEtray(1, MI), r = build(c + 'p.unfold([3, 0.0598, 2], null);\n');
      rfGEok(r);
      near(r.mp.volume, 2.483717669, 1e-7);
      var f = build(c + 'p.unfold([3, 0.0598, 2], null);\np.fold(null);\n');
      rfGEok(f);
      near(f.mp.volume, rfGEvol(1, 0.01), 5e-4);
      return 'folded back ' + f.mp.volume.toFixed(6);
    });

    test('rfGE: a hole of the sheet across a bend of the mitred tray: closed, the hole in the flat; one at the corner still builds (wrapCut, not closed: as before this lane)', function () {
      var h = build(U + 'p.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).circle(3, -0.08, 0.04).end().baseFlange();\np.flange(1, [[3, 0.0598, 0], [3, 0.0598, 4], [0, 0.0598, 2], [6, 0.0598, 2]], ' + MI + ');\n');
      rfGEok(h);
      var fl = K.flatPattern(h.model, h.build, h.mesh);
      assert(fl.loops.length === 2, fl.loops.length + ' loops');
      near(fl.size[0], 7.803400861, 1e-8);
      var c = build(U + 'p.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).circle(0.08, -0.08, 0.04).end().baseFlange();\np.flange(1, [[3, 0.0598, 0], [3, 0.0598, 4], [0, 0.0598, 2], [6, 0.0598, 2]], ' + MI + ');\n');
      assert(!Object.keys(c.errors).length && c.mp.volume > 2.4, 'the corner hole builds');
      return 'ok';
    });

    test('rfGE: an angle that trims past the end of the sheet is refused: the flange would hang on nothing (not measured on SolidWorks)', function () {
      function errs(w, A, pos) { var r = build(U + 'p.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -' + w + ', 4, ' + w + ').end().baseFlange();\np.flange(1, [[2, 0.0598, ' + w + ']], { angle: ' + A + ', position: "' + pos + '", lengthRef: "outer" });\n'); return Object.keys(r.errors).map(function (k) { return r.errors[k]; }).join(' | '); }
      assert(/trim the sheet away/.test(errs(0.5, 5, 'inside')), 'Material Inside 5°: ' + errs(0.5, 5, 'inside'));
      assert(/trim the sheet away/.test(errs(0.1, 150, 'outside')), 'Material Outside 150°: ' + errs(0.1, 150, 'outside'));
      assert(!errs(1, 15, 'inside'), 'a wider sheet builds');
      return errs(0.5, 5, 'inside');
    });

    test('rfGE: round trip: the script of a mitred tray rebuilds the same part', function () {
      var r = build(rfGEtray(1, MI)), s = K.generateScript(r.model), q = build(s);
      rfGEok(q);
      near(q.mp.volume, r.mp.volume, 1e-9);
      return 'ok';
    });
  })();
