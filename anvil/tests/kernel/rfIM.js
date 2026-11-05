  // --- rfIM (2026-11-05, lane rfIM: more Insert Bends / Convert to Sheet Metal) --- Convert of a solid whose edges are
  // filleted (the shell makes the inner cylinder, R = r − T), bends meeting at corners that are not square (a tray with
  // flared walls, a hexagonal tray: each bend stops where its zone leaves the other's, t = (S_q + max(0, S_b·cos φ)) /
  // sin φ, S = (R + T)·tan(A/2)), Convert's Reverse thickness (the solid's faces become the inside), the rounded bend
  // under a click (Convert's Bend Edges) and the rounded count Insert Bends' PM shows. Flats are analytic (inches,
  // T = .06, K .5); OpenCascade gives the same volumes and flats (checked by hand: occt-kernel.js reads the same layout).
  (function () {
    group('rfIM: Convert of a filleted solid, non-square corners, Reverse thickness, rounded-bend picks');
    var T = 0.06, R = 0.06, RT = R + T, Q = Math.PI / 2;
    function ba(A, r) { return A * ((r == null ? R : r) + 0.5 * T); }
    function errOf(r) { var ids = Object.keys(r.errors); return ids.length ? r.errors[ids[ids.length - 1]] : ''; }
    function flatOf(r) { return K.flatPattern(r.model, r.build, r.mesh); }
    function long(fl) { return Math.max(fl.size[0], fl.size[1]); }
    function wide(fl) { return Math.min(fl.size[0], fl.size[1]); }
    function bendLen(b) { return Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]); }
    // a 4 × 2 × 2 block, its two long bottom edges filleted r; Convert from the bottom with the fillets as bends
    function block(r) {
      var m = r - r / Math.SQRT2;   // the fillet's mid point, r(1 − 1/√2) in from both faces
      return { code: 'p.units("in");\np.sketch("Top").rect(0, 0, 4, 2).end().extrude(2);\np.fillet(' + r + ', [[2, 0, 0], [2, 0, -2]]);\n', picks: [[2, m, -m], [2, m, -2 + m]] };
    }
    function conv(b, extra) { return b.code + 'p.convertSheetMetal([2, 0, -1], ' + JSON.stringify(b.picks) + ', { thickness: ' + T + ', radius: ' + R + ', gap: 0.03 });\n' + (extra || ''); }
    var U = 'p.units("in");\np.sketch("Front").polyline([[0, 0], [2, 0], [2, 2], [1.94, 2], [1.94, 0.06], [0.06, 0.06], [0.06, 2], [0, 2]]).end().extrude(4);\n';
    var RND = U + 'p.fillet(0.12, [[0, 0, 2], [2, 0, 2]]);\np.fillet(0.06, [[0.06, 0.06, 2], [1.94, 0.06, 2]]);\n';

    test('rfIM: Convert of a solid block with filleted edges (r .12, T .06): the shell makes R .06 bends; = the rounded U-channel, flat 6 − 4·.12 + 2·BA by 4', function () {
      var b = block(0.12), r = build(conv(b)), u = build(RND);
      noErrors(r); noErrors(u);
      near(r.mp.volume, u.mp.volume, 1e-9, 'the rounded channel');
      var fl = flatOf(r);
      assert(fl.bends.length === 2 && fl.loops.length === 1 && fl.bends.every(function (q) { return Math.abs(q.R - 0.06) < 1e-9; }), fl.bends.map(function (q) { return q.label; }).join(', '));
      near(long(fl), 6 - 4 * RT + 2 * ba(Q), 1e-9, 'flat length'); near(wide(fl), 4, 1e-9, 'width');
      // a bigger fillet (.2): R .14, the walls and base shorter by its setbacks
      var b2 = block(0.2), r2 = build(conv(b2));
      noErrors(r2);
      var f2 = flatOf(r2);
      assert(f2.bends.every(function (q) { return Math.abs(q.R - 0.14) < 1e-9; }), f2.bends.map(function (q) { return q.label; }).join(', '));
      near(long(f2), 6 - 4 * 0.2 + 2 * ba(Q, 0.14), 1e-9, 'r .2: flat length');
    });

    test('rfIM: the rounded bend under a click (Convert\'s Bend Edges): a fillet of the solid, a bend already rounded; a flat face is none', function () {
      var b = block(0.12), body = build(b.code).body;
      var hit = K.insertBendsRoundAt(body, b.picks[0], T, 'in');
      assert(hit && hit.solid && Math.abs(hit.R - 0.06) < 1e-12 && Math.abs(hit.RT - 0.12) < 1e-12 && Math.abs(hit.A - Q) < 1e-9, JSON.stringify(hit));
      assert(K.insertBendsRoundAt(body, [2, 0, -1], T, 'in') === null, 'the bottom face is no bend');
      var u = K.insertBendsRoundAt(build(RND).body, [0.035147, 0.035147, 1], T, 'in');
      assert(u && !u.solid && Math.abs(u.R - 0.06) < 1e-12, 'a bend already rounded: ' + JSON.stringify(u));
      // its stored point is a valid Bend Edges pick
      var r = build(b.code + 'p.convertSheetMetal([2, 0, -1], ' + JSON.stringify([hit.mid, K.insertBendsRoundAt(body, b.picks[1], T, 'in').mid]) + ', { thickness: ' + T + ', radius: ' + R + ', gap: 0.03 });\n');
      noErrors(r);
      near(r.mp.volume, build(conv(b)).mp.volume, 1e-12, 'same part');
    });

    test('rfIM: Insert Bends preview counts the rounded bends (the U with one rounded corner: 2 bends, 1 rounded)', function () {
      var c = U + 'p.fillet(0.06, [[0.06, 0.06, 2]]);\np.fillet(0.12, [[0, 0, 2]]);\n', r0 = build(c);
      noErrors(r0);
      var m = K.newModel('t'); K.runScript(m, c + 'p.sheet(0.06, 0.06, 0.5);\n');
      var pv = K.insertBendsPreview({ id: 99, type: 'insertBends', fixedFace: [1, 0, 2], sheetBase: true }, m, r0.body);
      assert(pv.bends === 2 && pv.rounded === 1, JSON.stringify({ bends: pv.bends, rounded: pv.rounded }));
    });

    test('rfIM: bends meeting at a corner that is not square: a 2 × 2 tray with walls flared 10° (80° bends), corners notched: 4 bends, each 2 − 2S, flat 2/cos 10° + 2 − 4S + 2·BA(80°)', function () {
      var r = build('p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1, { draft: 10, draftOutward: true });\np.shell(0.06, [[1, 1, -1]]);\n' +
        'p.sketch("Top", 0.06).rect(-0.5, -0.5, 0.59, 0.59).rect(1.91, -0.5, 0.59, 0.59).rect(-0.5, 1.91, 0.59, 0.59).rect(1.91, 1.91, 0.59, 0.59).end().cut(1);\n' +
        'p.insertBends([1, 0, -1], { radius: 0.06, kFactor: 0.5 });\n');
      noErrors(r);
      var A = 80 * Math.PI / 180, S = RT * Math.tan(A / 2), fl = flatOf(r);
      assert(fl.bends.length === 4 && fl.loops.length === 1 && fl.bends.every(function (q) { return /80° R\.060/.test(q.label); }), fl.bends.map(function (q) { return q.label; }).join(', '));
      fl.bends.forEach(function (q, i) { near(bendLen(q), 2 - 2 * S, 1e-9, 'bend ' + i + ' length'); });
      var want = 2 / Math.cos(10 * Math.PI / 180) + 2 - 4 * S + 2 * ba(A);
      near(fl.size[0], want, 1e-9, 'flat X'); near(fl.size[1], want, 1e-9, 'flat Y');
      // Auto Relief off refuses, as at a square corner
      var n = build('p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1, { draft: 10, draftOutward: true });\np.shell(0.06, [[1, 1, -1]]);\n' +
        'p.sketch("Top", 0.06).rect(-0.5, -0.5, 0.59, 0.59).rect(1.91, -0.5, 0.59, 0.59).rect(-0.5, 1.91, 0.59, 0.59).rect(1.91, 1.91, 0.59, 0.59).end().cut(1);\n' +
        'p.insertBends([1, 0, -1], { radius: 0.06, autoRelief: "none" });\n');
      assert(/two bends meet at .*turn Auto Relief on/.test(errOf(n)), errOf(n));
    });

    test('rfIM: a hexagonal tray (side 1, walls 1 high, corners notched Ø.3): 6 bends, each 1 − 2·RT / sin 120°; across the flats 2(√3/2 − RT) + 2·BA + 2(1 − RT)', function () {
      var H = [[2, 0], [1.5, 0.866025403784439], [0.5, 0.866025403784439], [0, 0], [0.5, -0.866025403784439], [1.5, -0.866025403784439]];
      var code = 'p.units("in");\np.sketch("Top").polyline(' + JSON.stringify(H) + ', true).end().extrude(1);\np.shell(0.06, [[1, 1, 0]]);\nvar s = p.sketch("Top", 0.06);\n' +
        H.map(function (q) { return 's.circle(' + q[0] + ', ' + q[1] + ', 0.15);\n'; }).join('') + 's.end().cut(1);\np.insertBends([1, 0, 0], { radius: 0.06, kFactor: 0.5 });\n';
      var r = build(code);
      noErrors(r);
      var fl = flatOf(r);
      assert(fl.bends.length === 6 && fl.loops.length === 1, 'bends ' + fl.bends.length + ', loops ' + fl.loops.length);
      fl.bends.forEach(function (q, i) { near(bendLen(q), 1 - 2 * RT / Math.sin(2 * Math.PI / 3), 1e-9, 'bend ' + i + ' length'); });
      near(Math.max(fl.size[0], fl.size[1]), 2 * (Math.sqrt(3) / 2 - RT) + 2 * ba(Q) + 2 * (1 - RT), 1e-9, 'across the flats');
    });

    test('rfIM: Convert with Reverse thickness (2 × 2 × 1 solid box, bottom fixed, four bottom edges): = Convert of the box grown T on the kept faces; flat 4.0427; refused on a part already T thick', function () {
      var BOX = 'p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\n';
      var rv = build(BOX + 'p.convertSheetMetal([1, 0, -1], [[1, 0, 0], [2, 0, -1], [1, 0, -2], [0, 0, -1]], { thickness: 0.06, radius: 0.06, gap: 0.03 });\np.model.features[p.model.features.length - 1].reverse = true;\n');
      var big = build('p.units("in");\np.sketch("Top", -0.06).rect(-0.06, -0.06, 2.12, 2.12).end().extrude(1.06);\np.convertSheetMetal([1, -0.06, -1], [[1, -0.06, 0.06], [2.06, -0.06, -1], [1, -0.06, -2.06], [-0.06, -0.06, -1]], { thickness: 0.06, radius: 0.06, gap: 0.03 });\n');
      noErrors(rv); noErrors(big);
      near(rv.mp.volume, big.mp.volume, 1e-12, 'volume');
      var a = flatOf(rv), b = flatOf(big), FLAT = 2 * (1.06 - RT) + (2.12 - 2 * RT) + 2 * ba(Q);
      near(a.size[0], FLAT, 1e-9, 'flat X'); near(a.size[1], FLAT, 1e-9, 'flat Y'); near(b.size[0], FLAT, 1e-9, 'grown box flat');
      assert(a.bends.length === 4 && a.loops.length === 1, 'bends ' + a.bends.length + ', loops ' + a.loops.length);
      var th = build(U + 'p.convertSheetMetal([1, 0, 2], [[0, 0, 2], [2, 0, 2]], { thickness: 0.06, radius: 0.06, gap: 0.03 });\np.model.features[p.model.features.length - 1].reverse = true;\n');
      assert(/Reverse thickness is for a solid/.test(errOf(th)), errOf(th));
    });

    test('rfIM: Reverse thickness through the script API: { reverse: true } builds the same part as the model flag, and generateScript writes it back', function () {
      var BOX = 'p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\n', E = '[[1, 0, 0], [2, 0, -1], [1, 0, -2], [0, 0, -1]]';
      var a = build(BOX + 'p.convertSheetMetal([1, 0, -1], ' + E + ', { thickness: 0.06, radius: 0.06, gap: 0.03, reverse: true });\n');
      var b = build(BOX + 'p.convertSheetMetal([1, 0, -1], ' + E + ', { thickness: 0.06, radius: 0.06, gap: 0.03 });\np.model.features[p.model.features.length - 1].reverse = true;\n');
      noErrors(a); noErrors(b);
      near(a.mp.volume, b.mp.volume, 1e-12, 'same part');
      var s = K.generateScript(a.model), line = s.split('\n').filter(function (l) { return /convertSheetMetal/.test(l); })[0] || '';
      assert(/"?reverse"?: ?true/.test(line), 'reverse written: ' + line);
      var c = build(s); noErrors(c); near(c.mp.volume, a.mp.volume, 1e-9, 'round trip');
    });
  })();
