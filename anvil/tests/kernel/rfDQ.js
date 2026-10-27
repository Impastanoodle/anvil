  // --- rfDQ (2026-10-27, lane DQ: sheet metal Insert Bends and Convert to Sheet Metal) --- Insert Bends on a shelled
  // 2 × 2 × 1 in box (wall .06, open top) ripped at its four vertical corners (gap .03): R .06 bends at the bottom
  // edges, the outer faces stay put, each bend stops R + T short of a corner and the (R + T) cube there is cut out.
  // Convert to Sheet Metal of the solid box (bottom fixed, the four bottom edges as bends) gives the same part. A thin
  // L extrude (free ends), a flange after Insert Bends, No Bends, errors, round trips.
  (function () {
    group('rfDQ: Insert Bends / Convert to Sheet Metal (ripped shelled box, solid box, thin L, errors, round trip)');
    var W = 0.06, G = 0.03, R = 0.06, RT = R + W, K5 = 0.5;
    var BOX = 'p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\np.shell(' + W + ', [[1, 1, -1]]);\n';
    var RIP = 'p.rip([[2, 0.5, 0], [2, 0.5, -2], [0, 0.5, -2], [0, 0.5, 0]], ' + G + ');\n';
    var IB = 'p.insertBends([1, 0, -1], { radius: ' + R + ' });\n';
    var SOLID = 'p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\n';
    var CONV = 'p.convertSheetMetal([1, 0, -1], [[1, 0, 0], [2, 0, -1], [1, 0, -2], [0, 0, -1]], { thickness: ' + W + ', radius: ' + R + ', gap: ' + G + ' });\n';
    var L = 'p.units("in");\np.sketch("Front").polyline([[0, 0], [1.5, 0], [1.5, 0.06], [0.06, 0.06], [0.06, 1], [0, 1]]).end().extrude(2);\n';
    function errOf(r) { var ids = Object.keys(r.errors); return ids.length ? r.errors[ids[ids.length - 1]] : ''; }
    function flatOf(r) { return K.flatPattern(r.model, r.build, r.mesh); }
    // Anvil's bend: the annulus R … R + T as 8 chords per 90° (flangeProfile); the sharp corner it replaces: the kite
    // (R + T)² less the inner R² square
    var FILL = RT * RT - R * R, WEDGE = 0.5 * 8 * Math.sin(Math.PI / 16) * (RT * RT - R * R);
    var LB = 2 - 2 * RT;   // each bend between the corner reliefs
    // the ripped box inside one corner cube (R + T): the bottom's corner, then the two walls above it less the 'both' slot
    var CUBE = RT * RT * W + (RT - W) * (2 * RT * W - W * W - Math.SQRT2 * G * W);
    var BA = Math.PI / 2 * (R + K5 * W), FLAT = 2 * (1 - RT) + (2 - 2 * RT) + 2 * BA;
    var ripped0 = null, ib0 = null;
    function ripped() { if (!ripped0) { ripped0 = build(BOX + RIP); noErrors(ripped0); } return ripped0; }
    function ib() { if (!ib0) { ib0 = build(BOX + RIP + IB); noErrors(ib0); } return ib0; }

    test('rfDQ: Insert Bends on the ripped shelled box (R .06, bottom fixed): T measured .06, four bends, volume = ripped − 4·Lb·(kite − bend) − 4 corner cubes, exact', function () {
      var r = ib();
      near(+r.model.sheet.thickness, W, 1e-12, 'T'); near(+r.model.sheet.bendRadius, R, 1e-12, 'R'); near(+r.model.sheet.kFactor, K5, 1e-12, 'K');
      var f = r.model.features[r.model.features.length - 1];
      assert(f.type === 'insertBends' && f.sheetBase === true && f.name === 'Process-Bends1', JSON.stringify(f));
      near(r.mp.volume, ripped().mp.volume - 4 * LB * (FILL - WEDGE) - 4 * CUBE, 1e-9, 'volume');
      assert(r.build.bodies.length === 1, 'one body: ' + r.build.bodies.length);
      consistentVolume(r);
      assert((r.build.flanges[f.id] || []).length === 4, 'four bend records');
      var t = r.build.body.pointTester();
      // the outer faces stay: a point just inside the bottom's outer face mid-way, the wall's outer face mid-height
      assert(t([1, W / 2, -1]) && t([1, 0.5, -W / 2]), 'plates kept');
      // the sharp corner is gone (outside the R + T arc), the inside corner filled (inside the R arc's chord)
      var h = Math.SQRT1_2;
      assert(!t([1, 0.004, -0.004]) && t([1, RT - (R + W / 2) * h, -RT + (R + W / 2) * h]), 'the sharp outside corner is gone, the bend is there');
      assert(t([1, W + 0.004, -W - 0.004]) && !t([1, RT - 0.9 * R * h, -RT + 0.9 * R * h]), 'the inside corner is filled to the R arc');
      assert(!t([2 - RT / 2, RT / 2, -RT / 2]), 'the corner cube is cut out');
    });

    test('rfDQ: the flat of the inserted box: one blank ' + FLAT.toFixed(4) + ' square (1.76 base + 2 × .88 walls + 2·BA), four 90° R.060 bend lines, DXF', function () {
      var fl = flatOf(ib());
      near(fl.size[0], FLAT, 1e-9, 'flat X'); near(fl.size[1], FLAT, 1e-9, 'flat Y');
      assert(fl.loops.length === 1, 'loops ' + fl.loops.length);
      assert(fl.bends.length === 4 && fl.bends.every(function (b) { return /90° R\.060/.test(b.label) && Math.abs(b.ba - BA) < 1e-12; }), fl.bends.map(function (b) { return b.label; }).join(', '));
      assert(!fl.warnings.length, 'warnings ' + fl.warnings.join('; '));
      var dx = K.exportDXFFlat(fl, 'in');
      assert((dx.match(/\nBEND\n/g) || []).length >= 4 && /OUTLINE/.test(dx), 'DXF bend lines');
      var fb = K.flatBody(ib().model, ib().build, fl), fm = K.massProps(K.meshFromBody(fb.body), 1);
      near(fm.volume, Math.abs(K.signedArea(fl.loops[0])) * W, 1e-9, 'Flatten solid = blank × T');
      assert(fb.body.pointTester()([1, W / 2, -1]), 'the flat lies on the fixed face, T thick inward');
    });

    test('rfDQ: the K-factor (or a bend deduction) changes only the flat; the radius changes the solid', function () {
      var r = build(BOX + RIP + 'p.insertBends([1, 0, -1], { radius: ' + R + ', kFactor: 0.3 });\n');
      noErrors(r);
      near(r.mp.volume, ib().mp.volume, 1e-12, 'same solid');
      near(flatOf(r).size[0], FLAT - 2 * BA + 2 * Math.PI / 2 * (R + 0.3 * W), 1e-9, 'flat K .3');
      var d = build(BOX + RIP + 'p.insertBends([1, 0, -1], { radius: ' + R + ', bendAllowanceType: "deduction", bendDeduction: 0.1 });\n');
      noErrors(d);
      near(flatOf(d).size[0], 1 + 2 + 1 - 2 * 0.1, 1e-9, 'flat = A + B + C − 2·BD (outside 1 + 2 + 1)');
      var r2 = build(BOX + RIP + 'p.insertBends([1, 0, -1], { radius: 0.03 });\n'), RT2 = 0.03 + W, F2 = RT2 * RT2 - 0.03 * 0.03, W2 = 0.5 * 8 * Math.sin(Math.PI / 16) * F2;
      noErrors(r2);
      var C2 = RT2 * RT2 * W + (RT2 - W) * (2 * RT2 * W - W * W - Math.SQRT2 * G * W);
      near(r2.mp.volume, ripped().mp.volume - 4 * (2 - 2 * RT2) * (F2 - W2) - 4 * C2, 1e-9, 'R .03 volume');
    });

    test('rfDQ: Convert to Sheet Metal of the solid 2 × 2 × 1 box (bottom fixed, the four bottom edges, T .06, R .06, gap .03) = the shelled, ripped, inserted box', function () {
      var c = build(SOLID + CONV);
      noErrors(c);
      near(c.mp.volume, ib().mp.volume, 1e-9, 'volume');
      var fl = flatOf(c);
      near(fl.size[0], FLAT, 1e-9, 'flat X'); near(fl.size[1], FLAT, 1e-9, 'flat Y');
      assert(fl.loops.length === 1 && fl.bends.length === 4, 'loops ' + fl.loops.length + ', bends ' + fl.bends.length);
      var f = c.model.features[c.model.features.length - 1];
      assert(f.type === 'convertSM' && f.name === 'Convert-Solid1' && f.sheetBase, JSON.stringify(f));
      var m0 = K.newModel('t'); K.runScript(m0, SOLID + 'p.sheet(' + W + ', ' + R + ', 0.5);\n');
      var plan = K.convertSMPlan({ type: 'convertSM', fixedFace: [1, 0, -1], bendEdges: [[1, 0, 0], [2, 0, -1], [1, 0, -2], [0, 0, -1]] }, m0, { body: K.rebuild(m0).body });
      assert(plan.removed.length === 1 && Math.abs(plan.removed[0][1] - 1) < 1e-9, 'the top is removed: ' + JSON.stringify(plan.removed));
      assert(plan.rips.length === 4 && plan.rips.every(function (q) { return Math.abs(q.at[1] - 0.5) < 1e-9; }), 'four vertical rip edges found: ' + JSON.stringify(plan.rips));
      // given rip edges are used as they are
      var c2 = build(SOLID + CONV.replace('gap: ', 'ripEdges: [[2, 0.5, 0], [2, 0.5, -2], [0, 0.5, -2], [0, 0.5, 0]], gap: '));
      noErrors(c2);
      near(c2.mp.volume, c.mp.volume, 1e-12, 'given rips');
    });

    test('rfDQ: a thin L extrude (legs 1.5 × 1, T .06, 2 long): one bend, free ends; flat 1.5 + 1 − BD either face fixed', function () {
      var r0 = build(L), r = build(L + 'p.insertBends([0.75, 0, 1], { radius: ' + R + ' });\n'), w = build(L + 'p.insertBends([0, 0.5, 1], { radius: ' + R + ' });\n');
      noErrors(r0); noErrors(r); noErrors(w);
      near(r.mp.volume, r0.mp.volume - 2 * (FILL - WEDGE), 1e-9, 'volume');
      near(w.mp.volume, r.mp.volume, 1e-12, 'fixed on the wall: same solid');
      var BD = 2 * RT - BA, a = flatOf(r), b = flatOf(w);
      near(Math.max(a.size[0], a.size[1]), 2.5 - BD, 1e-9, 'flat length'); near(Math.min(a.size[0], a.size[1]), 2, 1e-9, 'flat width');
      near(Math.max(b.size[0], b.size[1]), 2.5 - BD, 1e-9, 'wall fixed: flat length');
      assert(a.bends.length === 1 && a.loops.length === 1, 'one bend, one loop');
    });

    test('rfDQ: an Edge Flange after Insert Bends (front wall top, .5 Material Inside, outer): the flat grows by .5 − BD, five bends', function () {
      var r = build(BOX + RIP + IB + 'p.flange(0.5, [[1, 1, -0.03]], { position: "inside", lengthRef: "outer" });\n');
      noErrors(r);
      var fl = flatOf(r), sz = fl.size.slice().sort(function (p, q) { return p - q; });
      near(sz[0], FLAT, 1e-9, 'flat X'); near(sz[1], FLAT + 0.5 - (2 * RT - BA), 1e-9, 'flat Y');
      assert(fl.bends.length === 5 && fl.loops.length === 1, 'bends ' + fl.bends.length + ', loops ' + fl.loops.length);
    });

    test('rfDQ: No Bends (model.noBends) shows the ripped box (Convert: the shelled, ripped solid); the flat refuses', function () {
      var r = build(BOX + RIP + IB);
      r.model.noBends = true;
      var b = K.rebuild(r.model);
      assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
      near(K.massProps(K.meshFromBody(b.body), 1).volume, ripped().mp.volume, 1e-12, 'no bends');
      var msg = '';
      try { K.flatPattern(r.model, b, K.meshFromBody(b.body)); } catch (e) { msg = e.message; }
      assert(/No Bends is on/.test(msg), msg);
      var c = build(SOLID + CONV);
      c.model.noBends = true;
      var cb = K.rebuild(c.model);
      near(K.massProps(K.meshFromBody(cb.body), 1).volume, ripped().mp.volume, 1e-9, 'Convert, no bends = shelled + ripped');
    });

    test('rfDQ: script round trip (p.sheet header + p.insertBends / p.convertSheetMetal) keeps the part exactly', function () {
      [BOX + RIP + IB, SOLID + CONV, SOLID + CONV.replace(' });', ', autoRelief: "rect", name: "Convert-Solid7" });')].forEach(function (code) {
        var r = build(code), s = K.generateScript(r.model), r2 = build(s);
        noErrors(r2);
        near(r2.mp.volume, r.mp.volume, 1e-12, 'round trip volume: ' + s.split('\n').filter(function (l) { return /insertBends|convertSheetMetal/.test(l); }).join(' '));
        assert(/p\.sheet\(0\.06, 0\.06, 0\.5\)/.test(s), 'sheet header');
        var f = r.model.features[r.model.features.length - 1], f2 = r2.model.features[r2.model.features.length - 1];
        assert(f2.name === f.name && f2.type === f.type && JSON.stringify(f2.fixedFace) === JSON.stringify(f.fixedFace), 'feature kept');
      });
    });

    test('rfDQ: errors: an unripped box (a ring of bends), no relief where bends meet, a solid (no walls T thick), a fixed face that is no wall, Convert without bend edges', function () {
      assert(/close a ring.*rip a corner first/.test(errOf(build(BOX + 'p.insertBends([1, 0, -1]);\n'))), 'ring: ' + errOf(build(BOX + 'p.insertBends([1, 0, -1]);\n')));
      var e2 = build(BOX + RIP + 'p.insertBends([1, 0, -1], { autoRelief: "none" });\n');
      assert(/two bends meet at .*turn Auto Relief on/.test(errOf(e2)), 'none: ' + errOf(e2));
      var e3 = build(SOLID + 'p.insertBends([1, 0, -1], { thickness: 0.06 });\n');
      assert(/no sharp corner between two walls 0\.06 thick/.test(errOf(e3)), 'solid: ' + errOf(e3));
      var e4 = build(L + 'p.insertBends([5, 5, 5], { thickness: 0.06 });\n');
      assert(/fixed face at \(5, 5, 5\) is not a wall next to a bend/.test(errOf(e4)), 'nowhere: ' + errOf(e4));
      var msg = '';
      try { build(L + 'p.insertBends([5, 5, 5]);\n'); } catch (e) { msg = e.message; }
      assert(/no flat face at/.test(msg), 'measuring T: ' + msg);
      var e5 = build(SOLID + 'p.convertSheetMetal([1, 0, -1], [], { thickness: 0.06 });\n');
      assert(/pick the bend edges/.test(errOf(e5)), 'no bend edges: ' + errOf(e5));
      msg = '';
      try { build(SOLID + 'p.convertSheetMetal([1, 0, -1], [[1, 0, 0]]);\n'); } catch (e) { msg = e.message; }
      assert(/needs a thickness/.test(msg), 'no thickness: ' + msg);
    });
  })();
