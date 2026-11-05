  // --- rfIH (2026-11-05, lane rfIH: Insert Bends / Convert to Sheet Metal take the bends already rounded in the part)
  // --- SolidWorks' Insert Bends recognises a rounded bend (concentric cylinders R and R + T between two walls T thick)
  // and keeps its own radius; the PM's radius is for sharp corners only. An L bracket sketched with its arcs (R .06,
  // outside .12, T .06), a Z and a 120° bend made by filleting a sharp thin part, a U with one rounded and one sharp
  // corner, a STEP round trip, Collect All Bends. Flats are analytic (straight legs + BA from the part's K-factor or
  // bend deduction) and the solid does not change (exact volumes).
  (function () {
    group('rfIH: Insert Bends / Convert on rounded bends (L, Z, 120°, mixed U, STEP, Collect All Bends)');
    var T = 0.06, R = 0.06, RT = R + T, Q = Math.PI / 2;
    function ba(A, k, r) { return A * ((r == null ? R : r) + k * T); }
    function errOf(r) { var ids = Object.keys(r.errors); return ids.length ? r.errors[ids[ids.length - 1]] : ''; }
    function flatOf(r) { return K.flatPattern(r.model, r.build, r.mesh); }
    function long(fl) { return Math.max(fl.size[0], fl.size[1]); }
    function wide(fl) { return Math.min(fl.size[0], fl.size[1]); }
    // the L sketched with its two arcs: legs 2 (x) and 1.5 (y) outside, extruded 2
    var LA = 'p.units("in");\np.sketch("Front").line(0, 1.5, 0, 0.12).arc(0.12, 0.12, 0.12, 180, 270).line(0.12, 0, 2, 0).line(2, 0, 2, 0.06).line(2, 0.06, 0.12, 0.06).arc(0.12, 0.12, 0.06, 270, 180).line(0.06, 0.12, 0.06, 1.5).line(0.06, 1.5, 0, 1.5).end().extrude(2);\n';
    // a thin part from its outside chain (thickness to the left of the chain as drawn), extruded D; corners filleted
    // R + T outside and R inside when `round` lists their indexes (1 .. n − 2)
    function thin(chain, D, round, rr) {
      var n = chain.length, segs = [], inner = [];
      for (var i = 0; i + 1 < n; i++) {
        var a = chain[i], b = chain[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
        segs.push([[a[0] + nx * T, a[1] + ny * T], [b[0] + nx * T, b[1] + ny * T]]);
      }
      inner.push(segs[0][0]);
      for (i = 1; i < segs.length; i++) {
        var p = segs[i - 1][0], r = [segs[i - 1][1][0] - p[0], segs[i - 1][1][1] - p[1]], q = segs[i][0], s = [segs[i][1][0] - q[0], segs[i][1][1] - q[1]];
        var t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / (r[0] * s[1] - r[1] * s[0]);
        inner.push([p[0] + r[0] * t, p[1] + r[1] * t]);
      }
      inner.push(segs[segs.length - 1][1]);
      var pts = chain.concat(inner.slice().reverse()), code = 'p.units("in");\np.sketch("Front").polyline(' + JSON.stringify(pts) + ', true).end().extrude(' + D + ');\n';
      (round || []).forEach(function (k) {
        var r0 = rr && rr[k] != null ? rr[k] : R;
        // a left turn: the chain is the bend's outside; a right turn: its inside
        var u = [chain[k][0] - chain[k - 1][0], chain[k][1] - chain[k - 1][1]], v = [chain[k + 1][0] - chain[k][0], chain[k + 1][1] - chain[k][1]];
        var out = u[0] * v[1] - u[1] * v[0] > 0 ? chain[k] : inner[k], inn = out === chain[k] ? inner[k] : chain[k];
        // the inside first (Anvil's fillet refuses the outside of a sharp 120° corner while its inside is still sharp)
        code += 'p.fillet(' + r0 + ', [[' + inn[0] + ', ' + inn[1] + ', ' + D / 2 + ']]);\np.fillet(' + (r0 + T) + ', [[' + out[0] + ', ' + out[1] + ', ' + D / 2 + ']]);\n';
      });
      return code;
    }
    var la0 = null;
    function la() { if (!la0) { la0 = build(LA); noErrors(la0); } return la0; }

    test('rfIH: L bracket with its bend rounded (R .06, outside .12, T .06): Insert Bends (K .44) takes it: one bend R .060, the solid unchanged, flat 1.88 + 1.38 + BA by 2', function () {
      var r = build(LA + 'p.insertBends([1, 0, 1], { kFactor: 0.44 });\n');
      noErrors(r);
      near(r.mp.volume, la().mp.volume, 1e-12, 'volume unchanged');
      near(r.model.sheet.thickness, T, 1e-12, 'T measured');
      var fl = flatOf(r);
      assert(fl.bends.length === 1 && fl.loops.length === 1, 'bends ' + fl.bends.length + ', loops ' + fl.loops.length);
      near(fl.bends[0].R, R, 1e-12, 'bend radius = the part\'s');
      assert(/90° R\.060/.test(fl.bends[0].label), fl.bends[0].label);
      near(long(fl), 1.88 + 1.38 + ba(Q, 0.44), 1e-9, 'flat length'); near(wide(fl), 2, 1e-9, 'flat width');
      // the wall as the fixed face: the same flat
      var w = build(LA + 'p.insertBends([0, 0.75, 1], { kFactor: 0.44 });\n');
      noErrors(w);
      near(long(flatOf(w)), long(fl), 1e-12, 'wall fixed');
      return 'flat ' + long(fl).toFixed(4);
    });

    test('rfIH: the L\'s flat = the same L made with Base Flange (K .44, K .71, BD .1), and the PM radius (.1) does not change a rounded bend', function () {
      [['0.44', null], ['0.71', null], ['0.5, { bendAllowanceType: "deduction", bendDeduction: 0.1 }', 3.4]].forEach(function (c) {
        var sh = 'p.sheet(0.06, 0.06, ' + c[0] + ');\n';
        var r = build(LA + sh + 'p.insertBends([1, 0, 1]);\n'), bf = build('p.units("in");\n' + sh + 'p.sketch("Front").polyline([[0, 1.5], [0, 0], [2, 0]], false).end().baseFlange(null, { depth: 2, flip: true });\n');
        noErrors(r); noErrors(bf);
        var a = flatOf(r), b = flatOf(bf);
        near(long(a), long(b), 1e-9, 'K / BD ' + c[0] + ': flat length = Base Flange');
        near(wide(a), wide(b), 1e-9, 'flat width = Base Flange');
        near(r.mp.volume, bf.mp.volume, 1e-9, 'volume = Base Flange');
        if (c[1] != null) near(long(a), c[1], 1e-9, 'BD .1: 2 + 1.5 − BD');
        else near(long(a), 1.88 + 1.38 + ba(Q, +c[0]), 1e-9, 'K ' + c[0]);
      });
      var big = build(LA + 'p.insertBends([1, 0, 1], { radius: 0.1, kFactor: 0.44 });\n');
      noErrors(big);
      var fb = flatOf(big);
      near(fb.bends[0].R, R, 1e-12, 'rounded bend keeps R .06');
      near(long(fb), 1.88 + 1.38 + ba(Q, 0.44), 1e-9, 'flat unchanged by the PM radius');
    });

    test('rfIH: a Z (two rounded 90° bends, fillets .12 / .06 on a sharp thin Z): two bends, unchanged solid, flat 1.94 + 1.26 + 1.88 + 2·BA', function () {
      var Z = thin([[0, 0.06], [2.06, 0.06], [2.06, 1.5], [4, 1.5]], 3, [1, 2]);
      // the chain is the outside of the first bend only; build it from the faces it gives
      var z0 = build(Z); noErrors(z0);
      var r = build(Z + 'p.insertBends([1, 0.06, 1.5], { kFactor: 0.5 });\n');
      noErrors(r);
      near(r.mp.volume, z0.mp.volume, 1e-12, 'volume unchanged');
      var fl = flatOf(r);
      assert(fl.bends.length === 2 && fl.loops.length === 1 && fl.bends.every(function (b) { return Math.abs(b.R - R) < 1e-9; }), fl.bends.map(function (b) { return b.label; }).join(', '));
      near(long(fl), 1.94 + 1.26 + 1.88 + 2 * ba(Q, 0.5), 1e-9, 'flat length'); near(wide(fl), 3, 1e-9, 'width');
      return 'flat ' + long(fl).toFixed(4) + ' (' + fl.bends.map(function (b) { return b.label; }).join(', ') + ')';
    });

    test('rfIH: a 120° rounded bend (legs 2 and 1.5 outside, R .06): flat (2 − RT·tan 60°) + (1.5 − RT·tan 60°) + BA(120°), K .44', function () {
      var A = 2 * Math.PI / 3, c = [[0, 0], [2, 0], [2 + 1.5 * Math.cos(A), 1.5 * Math.sin(A)]];
      var P = thin(c, 2, [1]), p0 = build(P); noErrors(p0);
      var r = build(P + 'p.insertBends([1, 0, 1], { kFactor: 0.44 });\n');
      noErrors(r);
      near(r.mp.volume, p0.mp.volume, 1e-12, 'volume unchanged');
      var fl = flatOf(r), sb = RT * Math.tan(A / 2);
      assert(fl.bends.length === 1 && /120° R\.060/.test(fl.bends[0].label), fl.bends.map(function (b) { return b.label; }).join(', '));
      near(long(fl), (2 - sb) + (1.5 - sb) + ba(A, 0.44), 1e-9, 'flat length');
      near(wide(fl), 2, 1e-9, 'width');
    });

    test('rfIH: a U with one rounded corner (R .06) and one sharp one: Insert Bends R .1 bends the sharp one at .1, keeps .06; = the U with both rounded', function () {
      var c = [[0, 2], [0, 0], [2, 0], [2, 2]];
      var U1 = thin(c, 4, [1]), U2 = thin(c, 4, [1, 2], { 2: 0.1 });
      var r = build(U1 + 'p.insertBends([1, 0, 2], { radius: 0.1, kFactor: 0.5 });\n'), both = build(U2), rb = build(U2 + 'p.insertBends([1, 0, 2], { radius: 0.1, kFactor: 0.5 });\n');
      noErrors(r); noErrors(both); noErrors(rb);
      near(r.mp.volume, both.mp.volume, 1e-9, 'sharp corner bent = the same corner filleted');
      near(rb.mp.volume, both.mp.volume, 1e-12, 'both rounded: unchanged');
      var fl = flatOf(r), f2 = flatOf(rb), rs = fl.bends.map(function (b) { return b.R; }).sort();
      assert(fl.bends.length === 2 && Math.abs(rs[0] - 0.06) < 1e-9 && Math.abs(rs[1] - 0.1) < 1e-9, 'radii ' + rs.join(', '));
      var want = (2 - RT) + (2 - RT - 0.16) + (2 - 0.16) + ba(Q, 0.5) + ba(Q, 0.5, 0.1);
      near(long(fl), want, 1e-9, 'flat length'); near(wide(fl), 4, 1e-9, 'width');
      near(long(f2), want, 1e-9, 'both rounded: the same flat');
    });

    test('rfIH: STEP round trip: the rounded L exported, imported (inches), Insert Bends: the same solid and flat', function () {
      var X = typeof Exchange !== 'undefined' ? Exchange : null;
      if (!X) fail('exchange.js is not loaded');
      var step = X.exportSTEP(la().model, la().build), m = X.newPartFromImport(X.importFile('l.step', step, { units: 'in' }));
      new K.Builder(m).insertBends([1, 0, 1], { kFactor: 0.44 });
      var b = K.rebuild(m), mesh = K.meshFromBody(b.body);
      assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
      near(K.massProps(mesh).volume, la().mp.volume, 1e-9, 'volume');
      var fl = K.flatPattern(m, b, mesh);
      assert(fl.bends.length === 1 && Math.abs(fl.bends[0].R - R) < 1e-9, 'one bend R .06');
      near(long(fl), 1.88 + 1.38 + ba(Q, 0.44), 1e-9, 'flat length'); near(wide(fl), 2, 1e-9, 'width');
    });

    test('rfIH: Collect All Bends collects rounded bends (the filleted U-channel): 2 bends, none unusable; Convert with them = Insert Bends, same flat', function () {
      var U = 'p.units("in");\np.sketch("Front").polyline([[0, 0], [2, 0], [2, 2], [1.94, 2], [1.94, 0.06], [0.06, 0.06], [0.06, 2], [0, 2]]).end().extrude(4);\n';
      var RND = U + 'p.fillet(0.12, [[0, 0, 2], [2, 0, 2]]);\np.fillet(0.06, [[0.06, 0.06, 2], [1.94, 0.06, 2]]);\n';
      var r0 = build(RND); noErrors(r0);
      var c = K.convertSMCollect(r0.build.body, [1, 0, 2], { thickness: T, units: 'in' });
      assert(c.bends.length === 2 && !c.rips.length && !c.rounded, JSON.stringify(c));
      var cv = build(RND + 'p.convertSheetMetal([1, 0, 2], ' + JSON.stringify(c.bends) + ', { thickness: ' + T + ', radius: 0.1, gap: 0.03 });\n');
      var ib = build(RND + 'p.insertBends([1, 0, 2], { radius: 0.1 });\n');
      noErrors(cv); noErrors(ib);
      near(cv.mp.volume, r0.mp.volume, 1e-12, 'Convert: unchanged'); near(ib.mp.volume, r0.mp.volume, 1e-12, 'Insert Bends: unchanged');
      var a = flatOf(cv), b = flatOf(ib), want = 6 - 4 * RT + 2 * ba(Q, 0.5);
      near(long(a), want, 1e-9, 'Convert flat'); near(long(b), want, 1e-9, 'Insert Bends flat');
      assert(a.bends.length === 2 && b.bends.length === 2, 'two bends each');
    });

    test('rfIH: no false bends: a rounded bend of the wrong thickness, a hole, an outside fillet alone', function () {
      // a .05 sheet on the .06 L: its rounded bend is not a bend of this sheet
      var r = build(LA + 'p.sheet(0.05, 0.06, 0.5);\np.insertBends([1, 0, 1]);\n');
      assert(/no sharp corner between two walls 0\.05 thick/.test(errOf(r)), errOf(r));
      // an outside fillet on a solid block: no inner cylinder, nothing to bend
      var s = build('p.units("in");\np.sketch("Front").rect(0, 0, 2, 1).end().extrude(1);\np.fillet(0.12, [[2, 0, 0.5]]);\np.insertBends([1, 0, 0.5], { thickness: 0.06 });\n');
      assert(/no sharp corner/.test(errOf(s)), errOf(s));
      // a hole through the L's base: still the one bend, the hole in the flat
      var h = build(LA + 'p.sketch("Top").circle(1, -1.5, 0.2).end().cut("through");\np.insertBends([1, 0, 1], { kFactor: 0.44 });\n');
      noErrors(h);
      var fl = flatOf(h);
      assert(fl.bends.length === 1 && fl.loops.length === 2, 'bends ' + fl.bends.length + ', loops ' + fl.loops.length);
    });
  })();
