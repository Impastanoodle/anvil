  // --- rfIE (2026-11-05, lane rfIE: Convert to Sheet Metal ▸ Collect All Bends) --- K.convertSMCollect(body, fixedFace,
  // { thickness, units }) finds the edges that become bends from the fixed face: the outside corners of two walls T
  // thick, reached from the fixed face (a breadth-first tree; an edge that would close a ring is ripped by Convert).
  // A thin-walled U-channel (4 long, 2 × 2, walls .06) and a shelled 2 × 2 × 1 box with an open top: the collected
  // edges are the hand picks, Convert with them is the same part and flat (analytic, K .5); Convert of a part already T
  // thick no longer shells it again; a solid block, an inside face and a part with rounded bends collect nothing.
  (function () {
    group('rfIE: Collect All Bends (Convert to Sheet Metal): U-channel, open box, block, rounded bends, round trip');
    var W = 0.06, R = 0.06, G = 0.03, RT = R + W, BA = Math.PI / 2 * (R + 0.5 * W);
    var U = 'p.units("in");\np.sketch("Front").polyline([[0, 0], [2, 0], [2, 2], [1.94, 2], [1.94, 0.06], [0.06, 0.06], [0.06, 2], [0, 2]]).end().extrude(4);\n';
    var BOX = 'p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\np.shell(' + W + ', [[1, 1, -1]]);\n';
    var BLOCK = 'p.units("in");\np.sketch("Top").rect(0, 0, 4, 2).end().extrude(2);\n';
    function rfIEbody(code) { var r = build(code); noErrors(r); return r.build.body; }
    function rfIEconv(code, P, edges, T) { return build(code + 'p.convertSheetMetal(' + JSON.stringify(P) + ', ' + JSON.stringify(edges) + ', { thickness: ' + (T || W) + ', radius: ' + R + ', gap: ' + G + ' });\n'); }
    function rfIEhas(list, p) { return list.some(function (q) { return Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]) < 1e-9; }); }
    function rfIEflat(r) { return K.flatPattern(r.model, r.build, r.mesh); }

    test('rfIE: U-channel (bottom outside face fixed): the two bottom outside edges, no rips; Convert = by hand, flat 6 − 4(R + T) + 2·BA by 4', function () {
      var c = K.convertSMCollect(rfIEbody(U), [1, 0, 2], { thickness: W, units: 'in' });
      assert(c.bends.length === 2 && rfIEhas(c.bends, [0, 0, 2]) && rfIEhas(c.bends, [2, 0, 2]), 'bends ' + JSON.stringify(c.bends));
      assert(!c.rips.length && !c.rounded, JSON.stringify(c));
      near(c.T, W, 1e-12, 'T'); near(c.wall, W, 1e-9, 'wall');
      var a = rfIEconv(U, [1, 0, 2], c.bends), b = rfIEconv(U, [1, 0, 2], [[0, 0, 1], [2, 0, 3]]);
      noErrors(a); noErrors(b);
      near(a.mp.volume, b.mp.volume, 1e-12, 'collected = picked by hand');
      var fa = rfIEflat(a), fb = rfIEflat(b), L = Math.max(fa.size[0], fa.size[1]);
      near(L, 6 - 4 * RT + 2 * BA, 1e-9, 'flat length'); near(Math.min(fa.size[0], fa.size[1]), 4, 1e-9, 'flat width');
      near(Math.max(fb.size[0], fb.size[1]), L, 1e-12, 'same flat by hand');
      assert(fa.loops.length === 1 && fa.bends.length === 2, 'loops ' + fa.loops.length + ', bends ' + fa.bends.length);
      // the walls were already T thick: Convert does not shell them again; the volume is the channel less the two
      // corner kites plus the two faceted bends (Insert Bends on the channel)
      var ib = build(U + 'p.insertBends([1, 0, 2], { radius: ' + R + ' });\n');
      noErrors(ib);
      near(a.mp.volume, ib.mp.volume, 1e-9, 'Convert of the thin channel = Insert Bends on it');
      var fv = Math.abs(K.signedArea(fa.loops[0])) * W;
      near(fv, (6 - 4 * RT + 2 * BA) * 4 * W, 1e-9, 'blank × T');
    });

    test('rfIE: shelled 2 × 2 × 1 box, open top (bottom fixed): four bottom edges, the four vertical corners left to Convert as rips; same part and flat as by hand', function () {
      var body = rfIEbody(BOX), c = K.convertSMCollect(body, [1, 0, -1], { thickness: W, units: 'in' });
      assert(c.bends.length === 4 && [[1, 0, 0], [2, 0, -1], [1, 0, -2], [0, 0, -1]].every(function (p) { return rfIEhas(c.bends, p); }), 'bends ' + JSON.stringify(c.bends));
      assert(c.rips.length === 4 && c.rips.every(function (p) { return Math.abs(p[1] - 0.5) < 1e-9; }), 'rings closed at the corners: ' + JSON.stringify(c.rips));
      var m0 = K.newModel('t'); K.runScript(m0, BOX + 'p.sheet(' + W + ', ' + R + ', 0.5);\n');
      var plan = K.convertSMPlan({ type: 'convertSM', fixedFace: [1, 0, -1], bendEdges: c.bends }, m0, { body: K.rebuild(m0).body });
      assert(plan.thin && plan.rips.length === 4, 'Convert rips the four corners and does not shell: ' + JSON.stringify(plan.rips));
      var a = rfIEconv(BOX, [1, 0, -1], c.bends), b = rfIEconv(BOX, [1, 0, -1], [[0, 0, -0.5], [1.5, 0, 0], [2, 0, -1.2], [0.7, 0, -2]]);
      noErrors(a); noErrors(b);
      near(a.mp.volume, b.mp.volume, 1e-12, 'collected = picked by hand');
      // = Rip (both, .03) + Insert Bends on the shelled box, and = Convert of the solid box (rfDQ)
      var ib = build(BOX + 'p.rip([[2, 0.5, 0], [2, 0.5, -2], [0, 0.5, -2], [0, 0.5, 0]], ' + G + ');\np.insertBends([1, 0, -1], { radius: ' + R + ' });\n');
      noErrors(ib);
      near(a.mp.volume, ib.mp.volume, 1e-9, 'Rip + Insert Bends');
      var FLAT = 2 * (1 - RT) + (2 - 2 * RT) + 2 * BA, fa = rfIEflat(a);
      near(fa.size[0], FLAT, 1e-9, 'flat X'); near(fa.size[1], FLAT, 1e-9, 'flat Y');
      assert(fa.loops.length === 1 && fa.bends.length === 4, 'loops ' + fa.loops.length + ', bends ' + fa.bends.length);
    });

    test('rfIE: nothing to collect on a solid block, from an inside face, or with rounded bends (counted: Convert cannot use them yet)', function () {
      var c = K.convertSMCollect(rfIEbody(BLOCK), [2, 0, -1], { thickness: W, units: 'in' });
      assert(!c.bends.length && !c.rips.length && !c.rounded, 'block: ' + JSON.stringify(c));
      near(c.wall, 2, 1e-9, 'the block is 2 thick at its bottom');
      var d = K.convertSMCollect(rfIEbody(U), [1, 0.06, 2], { thickness: W, units: 'in' });
      assert(!d.bends.length, 'inside face: ' + JSON.stringify(d));
      var RND = U + 'p.fillet(0.12, [[0, 0, 2], [2, 0, 2]]);\np.fillet(0.06, [[0.06, 0.06, 2], [1.94, 0.06, 2]]);\n';
      var e = K.convertSMCollect(rfIEbody(RND), [1, 0, 2], { thickness: W, units: 'in' });
      assert(!e.bends.length && e.rounded > 0, 'rounded: ' + JSON.stringify(e));
      var msg = '';
      try { K.convertSMCollect(rfIEbody(U), [9, 9, 9], { units: 'in' }); } catch (x) { msg = x.message; }
      assert(/no flat face at/.test(msg), msg);
    });

    test('rfIE: the thickness typed differs from the walls: collected at the part\'s wall (T reports .06); Convert at .05 says to set .06', function () {
      var c = K.convertSMCollect(rfIEbody(U), [1, 0, 2], { thickness: 0.05, units: 'in' });
      assert(c.bends.length === 2, JSON.stringify(c));
      near(c.T, W, 1e-9, 'T from the part');
      var r = rfIEconv(U, [1, 0, 2], c.bends, 0.05), ids = Object.keys(r.errors), msg = ids.length ? r.errors[ids[ids.length - 1]] : '';
      assert(/0\.06 thick at the fixed face: set the thickness to 0\.06/.test(msg), msg);
      var n = K.convertSMCollect(rfIEbody(U), [1, 0, 2], { units: 'in' });
      assert(n.bends.length === 2 && Math.abs(n.T - W) < 1e-9, 'no thickness given: the wall');
    });

    test('rfIE: the collected edges are stored as hand picks: generateScript round-trips the converted channel and box exactly', function () {
      [[U, [1, 0, 2]], [BOX, [1, 0, -1]]].forEach(function (t) {
        var c = K.convertSMCollect(rfIEbody(t[0]), t[1], { thickness: W, units: 'in' });
        var r = rfIEconv(t[0], t[1], c.bends), s = K.generateScript(r.model), r2 = build(s);
        noErrors(r); noErrors(r2);
        near(r2.mp.volume, r.mp.volume, 1e-12, 'round trip');
        var f = r2.model.features[r2.model.features.length - 1];
        assert(f.type === 'convertSM' && f.bendEdges.length === c.bends.length && !('collect' in f), JSON.stringify(f));
      });
    });
  })();
