  // --- rfIX (2026-11-05, lane sketchtools) --- Sweep along a Make Path path: a path sketch with members (pathId)
  // sweeps along those only; the other entities of the sketch are not the path (SolidWorks).
  (function () {
    if (typeof Kernel === 'undefined') return;
    group('rfIX: Sweep along a Make Path path only');
    var PROF = 'var prof = p.sketch("Top").rect(-1, -1, 2, 2).id();\n';
    test('rfIX: lines: the path member (0,0)-(0,10) sweeps a 2 × 2 square: 40; the line carried on past it (not a member) is left out (60 without the path)', function () {
      var all = build(PROF + 'var path = p.sketch("Front").line(0, 0, 0, 10).line(0, 10, 0, 15).id();\np.sweep({ profile: prof, path: path });');
      near(all.mp.volume, 60, 1e-9, 'no path: the whole sketch');
      var r = build(PROF + 'var path = p.sketch("Front").line(0, 0, 0, 10).line(0, 10, 0, 15).paths([[0]]).id();\np.sweep({ profile: prof, path: path });');
      assert(!r.errors.length, JSON.stringify(r.errors));
      near(r.mp.volume, 40, 1e-9, 'the path only');
      return r.mp.volume;
    });
    test('rfIX: line + true arc path (exact sweep pieces): 2 × 2 along 10 + a quarter R5 = 4·(10 + 2.5π); the line off the arc end (not a member) is left out', function () {
      var code = 'var path = p.sketch("Front").line(0, 0, 0, 10).arc(5, 10, 5, 90, 180).line(5, 15, 12, 15)';
      var r = build(PROF + code + '.paths([[0, 1]]).id();\np.sweep({ profile: prof, path: path });');
      assert(!r.errors.length, JSON.stringify(r.errors));
      near(r.mp.volume, 4 * (10 + 2.5 * Math.PI), 1e-6, 'path only');
      var all = build(PROF + code + '.id();\np.sweep({ profile: prof, path: path });');
      near(all.mp.volume, 4 * (17 + 2.5 * Math.PI), 1e-6, 'no path: all three');
      assert(Kernel.notPathMember({ entities: [{ t: 'line', pathId: 1 }, { t: 'line' }] }, { t: 'line' }) === true, 'hook for the OpenCascade sweep');
      return r.mp.volume.toFixed(6);
    });
  })();

  (function () {
    if (typeof SketchSolver === 'undefined' || !SketchSolver.alignGrid) return;
    group('rfIX: Align Grid/Origin keeps the geometry where it is in space');
    var SS = SketchSolver, K = Kernel;
    function world(pl, p) { return K.to3D(pl, p[0], p[1]); }
    function sameWorld(a, b, tol, what) { for (var i = 0; i < 3; i++) near(a[i], b[i], tol, what + ' [' + i + ']'); }
    function plate() {
      // a 6 × 4 plate outline as four lines, corner at (1, 1), held to the origin by a point-to-origin distance, H / V
      return { plane: { ref: 'Top', offset: 0.25 }, entities: [
        { t: 'line', x1: 1, y1: 1, x2: 7, y2: 1 }, { t: 'line', x1: 7, y1: 1, x2: 7, y2: 5 }, { t: 'line', x1: 7, y1: 5, x2: 1, y2: 5 }, { t: 'line', x1: 1, y1: 5, x2: 1, y2: 1 },
        { t: 'circle', cx: 4, cy: 3, r: 0.25 }],
        rels: [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'coincident', refs: ['2.p2', '3.p1'] }, { type: 'coincident', refs: ['3.p2', '0.p1'] },
          { type: 'horizontal', refs: ['0'] }, { type: 'horizontal', refs: ['2'] }, { type: 'vertical', refs: ['1'] }, { type: 'vertical', refs: ['3'] },
          { type: 'distance', refs: ['0.p1', 'O'], v: Math.SQRT2 }],
        dims: [{ e: 0, k: 'len', off: -0.3 }, { e: 1, k: 'len', off: 0.3 }, { e: 4, k: 'dia' }] };
    }
    test('rfIX: Align Grid/Origin, origin to the plate corner (1, 1) only: every point keeps its place in space; the corner reads (0, 0), the hole (3, 2); relations to the old origin go to a Fixed point left there; same status', function () {
      var sk = plate(), pl = K.resolvePlane(sk.plane), before = SS.analyze(sk);
      var w0 = world(pl, [7, 5]), wc = world(pl, [4, 3]);
      var r = SS.alignGrid(sk, pl, { origin: [1, 1] });
      assert(r.ok, r.error);
      var np = K.resolvePlane(r.plane);
      near(sk.entities[0].x1, 0, 1e-9, 'corner u'); near(sk.entities[0].y1, 0, 1e-9, 'corner v');
      near(sk.entities[4].cx, 3, 1e-9, 'hole u'); near(sk.entities[4].cy, 2, 1e-9, 'hole v');
      sameWorld(world(np, [6, 4]), w0, 1e-9, 'far corner in space'); sameWorld(world(np, [sk.entities[4].cx, sk.entities[4].cy]), wc, 1e-9, 'hole in space');
      var O = sk.entities.filter(function (e) { return e.t === 'point' && e.construction; })[0];
      assert(O && Math.abs(O.x + 1) < 1e-9 && Math.abs(O.y + 1) < 1e-9, 'old origin point at (-1, -1) ' + JSON.stringify(O));
      assert(!(sk.rels || []).some(function (x) { return x.refs.indexOf('O') >= 0; }), 'no relation to the new origin');
      var an = SS.analyze(sk);
      assert(an.status === before.status && an.conflicts === 0, 'status ' + before.status + ' -> ' + an.status);
      near(r.map([4, 3])[0], 3, 1e-12, 'map'); 
      return 'plane origin ' + JSON.stringify(r.plane.origin);
    });
    test('rfIX: Align Grid/Origin with the X axis along a 30° line: geometry stays in space, Horizontal / Vertical lines hold Parallel to the old axes, the hole keeps Ø.5; a quarter turn swaps Horizontal and Vertical', function () {
      var sk = plate(), pl = K.resolvePlane(sk.plane);
      sk.entities.push({ t: 'line', x1: 1, y1: 1, x2: 1 + Math.cos(Math.PI / 6), y2: 1 + Math.sin(Math.PI / 6), construction: true });
      var w = [[7, 5], [4, 3], [1, 5]].map(function (p) { return world(pl, p); });
      var r = SS.alignGrid(sk, pl, { origin: [1, 1], dir: [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)] });
      assert(r.ok, r.error);
      near(r.ang, 30, 1e-9, '30°');
      var np = K.resolvePlane(r.plane);
      var L5 = sk.entities[5];
      near(L5.y2 - L5.y1, 0, 1e-9, 'the 30° line is the new X axis');
      sameWorld(world(np, [sk.entities[0].x2, sk.entities[0].y2]), world(pl, [7, 1]), 1e-9, 'corner (7, 1)');
      sameWorld(world(np, [sk.entities[2].x1, sk.entities[2].y1]), w[0], 1e-9, 'corner (7, 5)');
      sameWorld(world(np, [sk.entities[4].cx, sk.entities[4].cy]), w[1], 1e-9, 'hole');
      near(sk.entities[4].r, 0.25, 1e-12, 'Ø.5');
      assert(!(sk.rels || []).some(function (x) { return x.type === 'horizontal' || x.type === 'vertical'; }) && sk.rels.filter(function (x) { return x.type === 'parallel'; }).length === 4, 'Parallel to the old axes ' + JSON.stringify(sk.rels));
      assert(SS.analyze(sk).conflicts === 0, 'no conflicts');
      var sq = plate(), r2 = SS.alignGrid(sq, K.resolvePlane(sq.plane), { origin: [1, 1], dir: [0, 1] });
      assert(r2.ok, r2.error);
      assert(sq.rels.filter(function (x) { return x.type === 'vertical'; }).length === 2 && sq.rels.filter(function (x) { return x.type === 'horizontal'; }).length === 2 && sq.rels[4].type === 'vertical', 'quarter turn swaps');
      near(sq.entities[1].x2, 4, 1e-9, 'the 4 in side runs along the new X');
    });
    test('rfIX: Align Grid/Origin refuses a horizontal distance between points on a 30° grid (it reads along the old X), and a sketch on a reference plane feature', function () {
      var sk = plate(), pl = K.resolvePlane(sk.plane);
      sk.rels.push({ type: 'distance', refs: ['4.c', '0.p1'], v: 3, dir: 'h' });
      var r = SS.alignGrid(sk, pl, { origin: [1, 1], dir: [1, 1] });
      assert(!r.ok && /X \/ Y axes/.test(r.error), r.error);
      near(sk.entities[0].x1, 1, 0, 'unchanged');
      var r1 = SS.alignGrid(sk, pl, { origin: [1, 1] });
      assert(r1.ok, 'moving the origin alone is fine: ' + r1.error);
      var rp = SS.alignGrid({ plane: { featureId: 3 }, entities: [{ t: 'point', x: 1, y: 1 }] }, pl, { origin: [1, 1] });
      assert(!rp.ok && /reference plane/.test(rp.error), rp.error);
    });
  })();
