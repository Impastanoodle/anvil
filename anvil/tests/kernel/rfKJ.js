  // --- rfKJ (2026-11-09, lane insertbends2) --- Insert Bends on the parts a shop gets. (1) Rip Parameters: a closed tray
  // (a drafted extrude, shelled) is ripped at its corner edges by Insert Bends itself, as SolidWorks' Bends PM does;
  // the 6 × 4 × 2 tray with walls drafted 10° (80° bends), 14 ga, R .06, K .44 unfolds to its analytic size, each bend
  // developed at its true angle. (2) A corner rounded on one side only is not one thickness: refused, as SolidWorks
  // refuses a part that is not of uniform thickness; an outside round of exactly T with a sharp inside is SolidWorks'
  // own R 0 bend and is taken. (3) Reverse direction: the flat lies on the fixed wall's other face (mirrored, UP / DOWN
  // swapped). Inches.
  (function () {
    group('rfKJ: Insert Bends — Rip Parameters (drafted tray), one-sided fillets refused, R 0 rounds, Reverse direction');
    var T14 = 0.0747, R = 0.06, D10 = 10 * Math.PI / 180, tn = Math.tan(D10), A80 = 80 * Math.PI / 180;
    function errOf(r) { var ids = Object.keys(r.errors); return ids.length ? r.errors[ids[ids.length - 1]] : ''; }
    function flatOf(r) { return K.flatPattern(r.model, r.build, r.mesh); }
    function bendLen(b) { return Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]); }
    function loopArea(l) { var s = 0; for (var j = 0; j < l.length; j++) { var p = l[j], q = l[(j + 1) % l.length]; s += p[0] * q[1] - q[0] * p[1]; } return Math.abs(s / 2); }
    var TRAY = 'p.units("in");\np.sketch("Top").rect(0, 0, 6, 4).end().extrude(2, { draft: 10, draftOutward: true });\np.shell(' + T14 + ', [[3, 2, -2]]);\n';
    var CORNERS = JSON.stringify([[-tn, 1, tn], [6 + tn, 1, tn], [6 + tn, 1, -4 - tn], [-tn, 1, -4 - tn]].map(function (p) { return p.map(function (x) { return Math.round(x * 1e6) / 1e6; }); }));
    function tray(k) { return TRAY + 'p.insertBends([3, 0, -2], { radius: ' + R + ', kFactor: ' + k + ', ripEdges: ' + CORNERS + ', gap: 0.03 });\n'; }

    test('rfKJ: drafted tray 6 × 4 × 2, walls 10°, 14 ga, R .06, K .44, corners ripped by Insert Bends: 4 bends of 80°, flat = 6 (4) − 2S + 2·BA + 2(2/cos 10° − S) to 1e-9', function () {
      var r = build(tray(0.44));
      noErrors(r);
      var RT = R + T14, S = RT * Math.tan(A80 / 2), BA = A80 * (R + 0.44 * T14), wall = 2 / Math.cos(D10) - S, fl = flatOf(r);
      assert(fl.bends.length === 4 && fl.loops.length === 1 && fl.bends.every(function (q) { return /80° R\.060/.test(q.label); }), fl.bends.map(function (q) { return q.label; }).join(', ') + ', loops ' + fl.loops.length);
      near(Math.max(fl.size[0], fl.size[1]), 6 - 2 * S + 2 * BA + 2 * wall, 1e-9, 'flat length');
      near(Math.min(fl.size[0], fl.size[1]), 4 - 2 * S + 2 * BA + 2 * wall, 1e-9, 'flat width');
      // each bend stops where its zone leaves the other's at the bottom corner (a square plate corner: S)
      var L = fl.bends.map(bendLen).sort(function (a, b) { return a - b; });
      near(L[0], 4 - 2 * S, 1e-9, 'short bend'); near(L[1], 4 - 2 * S, 1e-9, 'short bend');
      near(L[2], 6 - 2 * S, 1e-9, 'long bend'); near(L[3], 6 - 2 * S, 1e-9, 'long bend');
      return 'flat ' + fl.size.map(function (x) { return x.toFixed(6); }).join(' × ');
    });

    test('rfKJ: Insert Bends\' rips = Sheet Metal ▸ Rip then Insert Bends (volume to 1e-12, same flat); the unripped tray is refused naming Rip Parameters', function () {
      var a = build(tray(0.44)), b = build(TRAY + 'p.rip(' + CORNERS + ', 0.03);\np.insertBends([3, 0, -2], { radius: ' + R + ', kFactor: 0.44 });\n');
      noErrors(a); noErrors(b);
      nearRel(a.mp.volume, b.mp.volume, 1e-12, 'volume');
      var fa = flatOf(a), fb = flatOf(b);
      near(fa.size[0], fb.size[0], 1e-12, 'flat X'); near(fa.size[1], fb.size[1], 1e-12, 'flat Y');
      near(loopArea(fa.loops[0]), loopArea(fb.loops[0]), 1e-9, 'blank area');
      var n = build(TRAY + 'p.insertBends([3, 0, -2], { radius: ' + R + ' });\n');
      assert(/close a ring.*Rip Parameters/.test(errOf(n)), errOf(n));
    });

    test('rfKJ: the drafted tray at K .5: folded volume = blank × T less the bevels of its cut edges (top T·tan 10° / 2, rip sides T·c/√(1 − c²) / 2 per inch), to 1e-4', function () {
      // the walls' tops are cut level across a 10° wall and the rips cut each wall square to its neighbour, so those
      // edges are bevelled: the blank (the outer face's outline, as SolidWorks' flat) is that much over the metal
      var r = build(tray(0.5)), fl = flatOf(r), l = fl.loops[0];
      noErrors(r);
      var xs = l.map(function (p) { return p[0]; }), ys = l.map(function (p) { return p[1]; });
      var X0 = Math.min.apply(null, xs), X1 = Math.max.apply(null, xs), Y0 = Math.min.apply(null, ys), Y1 = Math.max.apply(null, ys), top = 0, side = 0;
      var c = Math.sin(D10) * Math.sin(D10);   // the two walls' normals at a corner
      l.forEach(function (p, j) {
        var q = l[(j + 1) % l.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
        var onX = Math.abs(p[0] - q[0]) < 1e-9 && (Math.abs(p[0] - X0) < 1e-9 || Math.abs(p[0] - X1) < 1e-9), onY = Math.abs(p[1] - q[1]) < 1e-9 && (Math.abs(p[1] - Y0) < 1e-9 || Math.abs(p[1] - Y1) < 1e-9);
        if (onX || onY) top += L; else if (L > 1) side += L;
      });
      var want = loopArea(l) * T14 - top * T14 * T14 * tn / 2 + side * T14 * T14 * c / Math.sqrt(1 - c * c) / 2;
      nearRel(r.mp.volume, want, 1e-4, 'volume');
      return 'blank × T ' + (loopArea(l) * T14).toFixed(6) + ', volume ' + r.mp.volume.toFixed(6) + ', rel ' + ((r.mp.volume - want) / want).toExponential(2);
    });

    var U = 'p.units("in");\np.sketch("Front").polyline([[0, 0], [2, 0], [2, 2], [1.94, 2], [1.94, 0.06], [0.06, 0.06], [0.06, 2], [0, 2]]).end().extrude(4);\n';
    var IB = 'p.insertBends([1, 0, 2], { radius: 0.06, kFactor: 0.5 });\n';
    test('rfKJ: a corner rounded on one side only is refused (not one thickness): inside fillet with the outside sharp, outside fillet with the inside sharp; one corner of two', function () {
      var a = build(U + 'p.fillet(0.06, [[0.06, 0.06, 2], [1.94, 0.06, 2]]);\n' + IB);
      assert(/not one thickness at .*inside of that corner is rounded R0?\.06.*not R0?\.12/.test(errOf(a)), errOf(a));
      var b = build(U + 'p.fillet(0.12, [[0, 0, 2], [2, 0, 2]]);\n' + IB);
      assert(/not one thickness at .*outside of that corner is rounded R0?\.12.*round the inside R0?\.06/.test(errOf(b)), errOf(b));
      var c = build(U + 'p.fillet(0.06, [[0.06, 0.06, 2]]);\n' + IB);
      assert(/not one thickness/.test(errOf(c)), 'one inside fillet, the other corner sharp: ' + errOf(c));
      // an outside round under T (the inside sharp) is no bend either
      var d = build(U + 'p.fillet(0.03, [[0, 0, 2], [2, 0, 2]]);\n' + IB);
      assert(/not one thickness.*radius of T or more/.test(errOf(d)), errOf(d));
      // rounds R and R + T on one axis and sharp corners still go in
      noErrors(build(U + 'p.fillet(0.12, [[0, 0, 2], [2, 0, 2]]);\np.fillet(0.06, [[0.06, 0.06, 2], [1.94, 0.06, 2]]);\n' + IB));
      noErrors(build(U + IB));
    });

    test('rfKJ: an outside round of T with the inside sharp is an R 0 bend (SolidWorks\' radius 0): flat 2 − 2T + 2(2 − T) + 2·(π/2)·K·T, volume = blank × T to 1e-9', function () {
      var r = build(U + 'p.fillet(0.06, [[0, 0, 2], [2, 0, 2]]);\n' + IB);
      noErrors(r);
      var fl = flatOf(r), T = 0.06, want = 2 - 2 * T + 2 * (2 - T) + 2 * (Math.PI / 2) * 0.5 * T;
      assert(fl.bends.length === 2 && fl.bends.every(function (q) { return Math.abs(q.R) < 1e-12; }), fl.bends.map(function (q) { return q.label; }).join(', '));
      near(Math.max(fl.size[0], fl.size[1]), want, 1e-9, 'flat length'); near(Math.min(fl.size[0], fl.size[1]), 4, 1e-9, 'width');
      nearRel(r.mp.volume, loopArea(fl.loops[0]) * T, 1e-9, 'volume');
      var hit = K.insertBendsRoundAt(r.body, [0.06 - 0.06 / Math.SQRT2, 0.06 - 0.06 / Math.SQRT2, 2], T, 'in');
      assert(hit && Math.abs(hit.R) < 1e-12 && Math.abs(hit.RT - T) < 1e-12, 'the R 0 round under a click: ' + JSON.stringify(hit));
    });

    test('rfKJ: Reverse direction: the flat on the fixed wall\'s other face (same size, mirrored, UP for DOWN); its flat body fills the same slab', function () {
      var a = build(U + IB), b = build(U + 'p.insertBends([1, 0, 2], { radius: 0.06, kFactor: 0.5, reverse: true });\n');
      noErrors(a); noErrors(b);
      nearRel(a.mp.volume, b.mp.volume, 1e-12, 'the part is the same');
      var fa = flatOf(a), fb = flatOf(b);
      near(fa.size[0], fb.size[0], 1e-12, 'flat X'); near(fa.size[1], fb.size[1], 1e-12, 'flat Y');
      assert(fa.bends.every(function (q) { return /^DOWN/.test(q.label); }) && fb.bends.every(function (q) { return /^UP/.test(q.label); }), fa.bends.map(function (q) { return q.label; }) + ' / ' + fb.bends.map(function (q) { return q.label; }));
      near(fa.plane.n[0] * fb.plane.n[0] + fa.plane.n[1] * fb.plane.n[1] + fa.plane.n[2] * fb.plane.n[2], -1, 1e-12, 'seen from the other side');
      var ba = K.flatBody(a.model, a.build, fa).body.getBounds(), bb = K.flatBody(b.model, b.build, fb).body.getBounds();
      near(ba.min[1], bb.min[1], 1e-9, 'slab bottom'); near(ba.max[1], bb.max[1], 1e-9, 'slab top');
    });

    test('rfKJ: script round trip: generateScript writes ripEdges, gap and reverse; the rebuilt part is the same', function () {
      var a = build(tray(0.44) + 'p.model.features[p.model.features.length - 1].reverse = true;\n');
      noErrors(a);
      var s = K.generateScript(a.model), line = s.split('\n').filter(function (l) { return /insertBends/.test(l); })[0] || '';
      assert(/ripEdges/.test(line) && /gap: ?0\.03/.test(line) && /reverse: ?true/.test(line), line);
      var b = build(s);
      noErrors(b);
      nearRel(b.mp.volume, a.mp.volume, 1e-9, 'round trip');
      var fa = flatOf(a), fb = flatOf(b);
      near(fa.size[0], fb.size[0], 1e-6, 'flat X'); near(fa.size[1], fb.size[1], 1e-6, 'flat Y');
    });
  })();
