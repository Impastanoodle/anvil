  // --- rfDL (2026-10-27, lane DL: sheet-metal fidelity #11) --- Miter Flange from a profile sketch (Kernel's
  // miterFlangeStages / buildMiterFlange): a 4 × 2 in Base Flange 0.06 thick (R = 0.06, K = 0.5), the profile sketched on
  // the Right Plane (normal to the front edge, x = 0 at the front-left corner), Material Inside, flanges along the front
  // edge (z = 0) and the left edge (x = 0) mitred at the corner they share.
  (function () {
    group('rfDL: Miter Flange from a profile sketch (mitre, gap, start / end offsets, L profile, arcs, errors, round trip)');
    var T = 0.06, R = 0.06, BA = Math.PI / 2 * (R + T / 2);
    var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n';
    var EDGES = '[[2, ' + T + ', 0], [0, ' + T + ', 1]]';
    var STRAIGHT = 'p.sketch("Right").line(0, ' + T + ', 0, ' + (T + 1) + ').end();\n';
    var ELL = 'p.sketch("Right").line(0, ' + T + ', 0, ' + (T + 1) + ').line(0, ' + (T + 1) + ', 0.5, ' + (T + 1) + ').end();\n';
    function mf(opts) { return 'p.miterFlange(' + EDGES + ', ' + JSON.stringify(opts || {}) + ');\n'; }
    function flatOf(code) { var r = build(code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function errOf(r) { var ids = Object.keys(r.errors); return ids.length ? r.errors[ids[0]] : ''; }
    function absArea(l) { return Math.abs(K.signedArea(l)); }
    // the flange section beyond the sheet's trimmed edge (the overlap strip into the sheet left out): 90°, the wall
    // L − R long (the profile line is the length to the inner virtual sharp)
    var APLUS = absArea(K.flangeProfile(Math.PI / 2, R, T, 1 - R, T)) - T * T;
    // outline segments along an axis at |coordinate| = c, longer than minLen
    function axisSegs(loop, c, minLen) {
      var n = 0;
      for (var i = 0; i < loop.length; i++) {
        var a = loop[i], b = loop[(i + 1) % loop.length];
        for (var k = 0; k < 2; k++) if (Math.abs(a[k] - b[k]) < 1e-9 && Math.abs(Math.abs(a[k]) - c) < 1e-6 && Math.abs(a[1 - k] - b[1 - k]) > minLen) n++;
      }
      return n;
    }
    function hasFace(mesh, n) { return mesh.faces.some(function (f) { return Math.abs(f.normal[0] * n[0] + f.normal[1] * n[1] + f.normal[2] * n[2] - 1) < 1e-6; }); }

    test('rfDL: 1 in straight profile, gap .010: the same solid and flat as the edge-only miter (Material Inside, inner virtual sharp), flat 4 + e × 2 + e with e = 1 + BA − 2R − T, a 45° mitre in the blank', function () {
      var r = flatOf(HEAD + STRAIGHT + mf({ miterGap: 0.01 }));
      var o = flatOf(HEAD + 'p.flange(1, ' + EDGES + ', { position: "inside", lengthRef: "inner", miter: true, miterGap: 0.01 });\n');
      var f = r.model.features[r.model.features.length - 1];
      assert(f.type === 'flange' && f.miterFlange === true && f.sketch === 3 && f.name === 'Miter Flange1' && f.position === 'inside', 'feature: ' + JSON.stringify(f));
      nearRel(r.mp.volume, o.mp.volume, 1e-9, 'volume = the edge-only miter flange');
      var e = 1 + BA - 2 * R - T;
      near(r.flat.size[0], 4 + e, 1e-9, 'flat width'); near(r.flat.size[1], 2 + e, 1e-9, 'flat height');
      assert(r.flat.bends.length === 2 && r.flat.bends.every(function (b) { return b.label === 'UP 90° R.060'; }), 'two UP 90° bends: ' + r.flat.bends.map(function (b) { return b.label; }));
      var h = Math.SQRT1_2;
      assert(hasFace(r.mesh, [h, 0, -h]) && hasFace(r.mesh, [-h, 0, h]), 'the two 45° mitre faces at the corner');
      // flat: each wall's end runs square to its bend line, T + gap/√2 from the corner (the mitre at the wall's inside face)
      assert(r.flat.loops.length === 1 && axisSegs(r.flat.loops[0], T + 0.01 * h, 0.9) === 2, 'the two wall ends T + gap/√2 from the corner: ' + JSON.stringify(r.flat.loops[0]));
      assert(!r.warnings[3], 'no "open contour" warning on the profile sketch: ' + r.warnings[3]);
      return 'volume ' + fmt(r.mp.volume) + ', flat ' + fmt(r.flat.size[0]) + ' × ' + fmt(r.flat.size[1]);
    });

    test('rfDL: the mitre gap: volume = no-gap volume − √2 · gap · A+ (each flange loses gap/√2 along its edge), exact', function () {
      var a = flatOf(HEAD + STRAIGHT + mf({ miterGap: 0 })), b = flatOf(HEAD + STRAIGHT + mf({ miterGap: 0.01 }));
      nearRel(a.mp.volume - b.mp.volume, Math.SQRT2 * 0.01 * APLUS, 1e-6, 'gap volume');
      return 'removed ' + fmt(a.mp.volume - b.mp.volume);
    });

    test('rfDL: start offset .25 shortens the first flange (front edge, from its free end x = 4) by .25: volume − .25·(A+ − (R + T)·T), the base keeps its corner; end offset .25 the left flange at z = 2', function () {
      var a = flatOf(HEAD + STRAIGHT + mf({ miterGap: 0.01 })), s = flatOf(HEAD + STRAIGHT + mf({ miterGap: 0.01, startOffset: 0.25 }));
      nearRel(a.mp.volume - s.mp.volume, 0.25 * (APLUS - (R + T) * T), 1e-6, 'start offset volume');
      var inS = s.build.body.pointTester();
      assert(inS([3.7, 0.6, T / 2]) && !inS([3.8, 0.6, T / 2]), 'the front wall ends at x = 3.75');
      assert(inS([3.9, T / 2, (R + T) / 2]), 'the base is not trimmed past the offset');
      var e = flatOf(HEAD + STRAIGHT + mf({ miterGap: 0.01, endOffset: 0.25 })), inE = e.build.body.pointTester();
      nearRel(a.mp.volume - e.mp.volume, 0.25 * (APLUS - (R + T) * T), 1e-6, 'end offset volume');
      assert(inE([T / 2, 0.6, 1.7]) && !inE([T / 2, 0.6, 1.8]), 'the left wall ends at z = 1.75');
      var both = flatOf(HEAD + STRAIGHT + mf({ miterGap: 0.01, startOffset: 0.25, endOffset: 0.5 }));
      nearRel(a.mp.volume - both.mp.volume, 0.75 * (APLUS - (R + T) * T), 1e-6, 'both offsets');
      return 'start ' + fmt(a.mp.volume - s.mp.volume) + ', end ' + fmt(a.mp.volume - e.mp.volume);
    });

    test('rfDL: L profile (1 up, .5 out): two bends along the chain, mitred at both levels; flat 4 + e2 with e2 = BA + (1 − 2R) + BA + (.5 − R) − (R + T); 4 bends; bbox to −.5', function () {
      var r = flatOf(HEAD + ELL + mf({ miterGap: 0.01 }));
      var e2 = BA + (1 - 2 * R) + BA + (0.5 - R) - (R + T);
      near(r.flat.size[0], 4 + e2, 1e-9, 'flat width'); near(r.flat.size[1], 2 + e2, 1e-9, 'flat height');
      assert(r.flat.bends.length === 4, 'four bends: ' + r.flat.bends.length);
      near(r.mp.bbox.min[0], -0.5, 1e-9, 'return reaches x = −.5'); near(r.mp.bbox.min[2], -0.5, 1e-9, 'return reaches z = −.5');
      near(r.mp.bbox.max[1], 1 + 2 * T, 1e-9, 'the return\'s top at 1 + 2T (the profile is its inside face)');
      var inside = r.build.body.pointTester();
      assert(inside([2, 1 + 1.5 * T, -0.3]) && inside([-0.3, 1 + 1.5 * T, 1]), 'both returns there');
      assert(inside([-0.3, 1 + 1.5 * T, -0.3 + 0.02]) && inside([-0.3 + 0.02, 1 + 1.5 * T, -0.3]) && !inside([-0.3, 1 + 1.5 * T, -0.3]), 'the returns meet at a mitre with the gap on the diagonal');
      return 'flat ' + fmt(r.flat.size[0]) + ' × ' + fmt(r.flat.size[1]);
    });

    test('rfDL: a tangent arc of radius R between the lines gives the same part as the sharp L; a larger arc sets that bend\'s radius', function () {
      var arcL = 'p.sketch("Right").line(0, ' + T + ', 0, ' + (1 + T - R) + ').arc(' + R + ', ' + (1 + T - R) + ', ' + R + ', 90, 180).line(' + R + ', ' + (1 + T) + ', 0.5, ' + (1 + T) + ').end();\n';
      var a = flatOf(HEAD + ELL + mf({ miterGap: 0.01 })), b = flatOf(HEAD + arcL + mf({ miterGap: 0.01 }));
      nearRel(b.mp.volume, a.mp.volume, 1e-9, 'same volume');
      var R2 = 0.2, arcB = 'p.sketch("Right").line(0, ' + T + ', 0, ' + (1 + T - R2) + ').arc(' + R2 + ', ' + (1 + T - R2) + ', ' + R2 + ', 90, 180).line(' + R2 + ', ' + (1 + T) + ', 0.5, ' + (1 + T) + ').end();\n';
      var c = flatOf(HEAD + arcB + mf({ miterGap: 0.01 }));
      assert(c.flat.bends.some(function (x) { return Math.abs(x.R - R2) < 1e-9; }), 'a bend of radius .2: ' + c.flat.bends.map(function (x) { return x.R; }));
      return 'R .2 flat ' + fmt(c.flat.size[0]);
    });

    test('rfDL: the edge the profile starts on is added when not picked; Material Outside and Bend Outside build; a profile off the edges and one lying in the sheet are refused', function () {
      var one = flatOf(HEAD + STRAIGHT + 'p.miterFlange([], { miterGap: 0 });\n');
      assert(one.flat.bends.length === 1, 'one flange on the front edge: ' + one.flat.bends.length);
      ['outside', 'bendOutside'].forEach(function (pos) { var r = build(HEAD + STRAIGHT + mf({ position: pos, miterGap: 0.01 })); noErrors(r); assert(r.mp.volume > one.mp.volume, pos); });
      var off = build(HEAD + 'p.sketch("Right").line(0, 1, 0, 2).end();\n' + mf());
      assert(/normal to an edge/.test(errOf(off)), 'off the edge: ' + errOf(off));
      var flatLine = build(HEAD + 'p.sketch("Right").line(0, ' + T + ', -1, ' + T + ').end();\n' + mf());
      assert(/leave the sheet/.test(errOf(flatLine)), 'in the sheet plane: ' + errOf(flatLine));
      var bad = build(HEAD + STRAIGHT + mf({ startOffset: 4.5 }));
      assert(/longer than the edge/.test(errOf(bad)), 'offsets too long: ' + errOf(bad));
      return 'refused: ' + errOf(off);
    });

    test('rfDL: script round trip (generateScript → runScript) keeps the sketch reference, gap and offsets; the old edge-only miter flange JSON still builds', function () {
      var r = build(HEAD + ELL + mf({ miterGap: 0.01, startOffset: 0.25, position: 'inside' }));
      noErrors(r);
      var src = K.generateScript(r.model);
      assert(/p\.miterFlange\(\[\[2,0\.06,0\],\[0,0\.06,1\]\], \{ sketch: f3, name: "Miter Flange1", miterGap: 0\.01, startOffset: 0\.25 \}\)/.test(src), 'script line: ' + src.split('\n').filter(function (l) { return /miterFlange/.test(l); })[0]);
      var r2 = build(src);
      noErrors(r2);
      nearRel(r2.mp.volume, r.mp.volume, 1e-12, 'same volume after the round trip');
      var old = build(HEAD + 'p.flange(1, ' + EDGES + ', { position: "inside", lengthRef: "outer", miter: true, miterGap: 0.01 });\n');
      noErrors(old);
      assert(!old.model.features[1].miterFlange, 'edge-only miter flange stays as it was');
      return 'ok';
    });
  })();
