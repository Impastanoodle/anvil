  // --- rfNI (2026-11-16, lane solidfid3: solids fidelity, the fillets that could not close) ---
  // 1. kernel-mesh.js resolveEdges: a tangent chain is decided by TRUE tangents where both edges are true curves (a
  //    chord of a recorded circle, a straight edge between planes). Two different circles crossing at 15 to 28 degrees
  //    turn no more than a 16-chord circle's own chords, so the chord rule ran a round / chamfer on round the other
  //    circle: a boss's rim into the rim of a hole biting into it (round fuzz 259: "could not close"), a ring's rim into
  //    its mirrored copy's (stack fuzz 365, 392, 764, 772: 4e-4 to 1e-2 off OpenCascade), two refusals (89, 550).
  // 2. kernel.js triangulate: a CLOCKWISE loop that is not convex fell to the fan, whose triangles then face both
  //    ways; the prism over a face's inner loop (the boss kept whole under a round, a hole a round rests on) was closed
  //    but no solid, and "tool - prism" came out larger than the tool, with open edges (stack fuzz 226).
  // 3. kernel-mesh.js faceOutline: of two copies of a welded edge the boundary one is the copy without an exact
  //    reversed twin. An inch tube 1.5 / 0.5: the cap's interior split point 2.8e-4 from the bore's rim vertex stood in
  //    for that vertex, the rim's chord no longer ended on the circle and a round from the bore left one sector out
  //    (rfNC's "Mass Properties 4.5e-4 off": the solid was wrong, not the integral).
  (function () {
    group('rfNI: solids fidelity 3: tangent chains by true tangents, prisms over clockwise loops, the outline keeps a rim\'s own vertex');
    var rfNIu = 'p.units("in");\n';
    function rfNIcount(r) {
      var open = 0, nm = 0;
      (r.build.bodies || []).forEach(function (b) { var c = Evaluate.checkBody(b); open += c.openEdges.length; nm += c.nonManifoldEdges.length; });
      return { open: open, nm: nm };
    }
    function rfNIerrs(r) { return Object.keys(r.errors || {}).map(function (k) { return r.errors[k]; }); }
    function rfNIclosed(r, label) {
      var e = rfNIerrs(r), c = rfNIcount(r);
      assert(!e.length, label + ': ' + e.join(' | '));
      assert(!c.open && !c.nm, label + ': ' + c.open + ' open, ' + c.nm + ' non-manifold edges');
    }
    function rfNIwith(obj, key, value, fn) { var was = obj[key]; obj[key] = value; try { return fn(); } finally { if (was === undefined) delete obj[key]; else obj[key] = was; } }
    // build, counting the open-edge guard's attempts per feature type
    function rfNIbuild(code) {
      var att = { fillet: 0, chamfer: 0 }, was = K.openGuard.log, r;
      K.openGuard.log = function (o) { att[o.f.type]++; };
      try { r = build(code); } finally { if (was === undefined) delete K.openGuard.log; else K.openGuard.log = was; }
      r.attempts = att;
      return r;
    }
    // the edges a chained pick takes
    function rfNIchain(code, at, size) {
      var r = build(code), edges = K.bodyEdges(r.mesh).filter(function (e) { return !e.smooth && e.faces.length === 2 && e.convex !== null; });
      return K.resolveEdges([{ at: at, chain: true }], edges, K.pickTol('in', size));
    }

    // ---- 1. true tangents
    var rfNIboss = rfNIu + 'p.sketch("Top").rect(0, -2.75, 6.25, 2.75).end().extrude(0.375);\n' +
      'p.sketch("Top", 0.375).circle(4.1143, -0.9035, 0.25).end().extrude(0.5);\n' +
      'p.sketch("Top", 1.375).circle(4.375, -0.4896, 0.25).end().cut("through", { reverse: true });\n';
    test('rfNI: a chained pick on a boss\'s rim stops where the rim of a hole biting .011 into the boss crosses it (two circles at 24 degrees): 30 chords of the boss, none of the hole (the chord rule took the hole\'s too)', function () {
      var at = [4.3643, 0.875, 0.9035], sel = rfNIchain(rfNIboss, at, 0.1125);
      var off = sel.filter(function (e) { return Math.abs(Math.hypot(e.mid[0] - 4.1143, e.mid[2] - 0.9035) - 0.25) > 0.01; });
      assert(!off.length, off.length + ' selected edges are not on the boss\'s circle');
      assert(sel.length >= 28, 'only ' + sel.length + ' edges: the chain no longer runs round the boss');
      var old = rfNIwith(K.openGuard, 'trueTangent', false, function () { return rfNIchain(rfNIboss, at, 0.1125); });
      assert(old.length > sel.length, 'the chord rule took no more edges (' + old.length + '): the row no longer measures the rule');
      return sel.length + ' edges (chord rule: ' + old.length + ')';
    });
    test('rfNI: round fuzz 259 (a boss\'s root rounded R.225 beside that hole, its top rim chamfered .1125): the chamfer builds on the first attempt, closed; it was refused ("could not close the chamfered faces"); = OpenCascade 6.478923 to 2e-4', function () {
      var code = rfNIboss + 'p.fillet(0.225, [[4.3643,0.375,0.9035]]);\np.chamfer(0.1125, [[4.3643,0.875,0.9035]]);\n', r = rfNIbuild(code);
      rfNIclosed(r, 'fuzz 259');
      assert(r.attempts.chamfer === 1, 'the chamfer took ' + r.attempts.chamfer + ' attempts');
      // 8e-5: the chamfer ends in the meridian plane of its end vertex; SolidWorks / OpenCascade run its cone on to the
      // hole's wall (.0005 in³ of the boss's top edge inside the bite is left sharp). The R.225 below it is 4e-6.
      nearRel(r.mp.volume, 6.478922560, 2e-4, 'volume vs OpenCascade');
      var old = rfNIwith(K.openGuard, 'trueTangent', false, function () { return build(code); });
      assert(rfNIerrs(old).some(function (m) { return /could not close the chamfered faces/.test(m); }), 'with the chord rule the chamfer is no longer refused: the row does not measure the rule');
      return 'volume ' + r.mp.volume.toFixed(9) + ', fillet attempts ' + r.attempts.fillet + ', chamfer attempts 1';
    });
    test('rfNI: two discs R1, .35 apart (their rims cross at 20 degrees): a chamfer picked on one rim takes that disc\'s arc only, closed, within 1e-3 of OpenCascade 1.902993 (the chord rule went all the way round: 9e-3)', function () {
      var base = rfNIu + 'p.sketch("Top").circle(0, 0, 1).end().extrude(0.5);\np.sketch("Top").circle(0.35, 0, 1).end().extrude(0.5);\n';
      var sel = rfNIchain(base, [-1, 0.5, 0], 0.1);
      assert(sel.length > 8 && sel.every(function (e) { return Math.abs(Math.hypot(e.mid[0], e.mid[2]) - 1) < 0.01 && e.mid[0] < 0.2; }), 'the chain left the first disc\'s rim: ' + sel.length + ' edges');
      var r = build(base + 'p.chamfer(0.1, [[-1, 0.5, 0]]);\n');
      rfNIclosed(r, 'two discs');
      nearRel(r.mp.volume, 1.902993298, 1e-3, 'volume vs OpenCascade');
      // what is built today: the union less the arc's own sector of the chamfer ring (the arc is 2π − 2·acos(.175) long);
      // OpenCascade ends the chamfer on the other disc's wall (4.6e-4 heavier)
      var arc = 2 * Math.PI - 2 * Math.acos(0.175), ring = arc * (1 - 0.1 / 3) * 0.005;
      var lens = 2 * Math.acos(0.175) - 0.35 * Math.sqrt(1 - 0.175 * 0.175), union = (2 * Math.PI - lens) * 0.5;
      nearRel(r.mp.volume, union - ring, 5e-6, 'the union less the arc\'s sector');   // (1.4e-6: the arc ends where two chords cross, a sagitta inside the circles)
      var old = rfNIwith(K.openGuard, 'trueTangent', false, function () { return build(base + 'p.chamfer(0.1, [[-1, 0.5, 0]]);\n'); });
      assert(Math.abs(old.mp.volume - 1.902993298) / 1.902993298 > 5e-3, 'the chord rule is as near OpenCascade: the row does not measure the rule');
      return sel.length + ' edges, volume ' + r.mp.volume.toFixed(9);
    });
    test('rfNI: a tangent chain still runs on through true tangents: a slot-shaped boss\'s rim (two lines, two arcs) is one chain, and a circle is one chain whatever its chords', function () {
      var slot = rfNIu + 'p.sketch("Top").rect(0, -2, 4, 2).end().extrude(0.25);\np.sketch("Top", 0.25).slot(1, -1, 3, -1, 0.5).end().extrude(0.5);\n';
      var sel = rfNIchain(slot, [2, 0.75, 1.25], 0.05), r = build(slot + 'p.fillet(0.05, [[2, 0.75, 1.25]]);\n');
      rfNIclosed(r, 'slot boss');
      var len = 0; sel.forEach(function (e) { len += e.len; });
      assert(Math.abs(len - (4 + 2 * 0.25 * 2 * 16 * Math.sin(Math.PI / 32))) < 0.02 || len > 5.5, 'chain length ' + len.toFixed(4) + ': not the whole rim');
      // R.05 round the whole rim: straight runs 2 × 2, arcs one circle of R.25 (Pappus)
      var A = 0.0025 * (1 - Math.PI / 4), xb = 0.05 * (5 / 6 - Math.PI / 4) / (1 - Math.PI / 4);
      nearRel(r.mp.volume, 4 * 2 * 0.25 + (2 * 0.5 + Math.PI * 0.0625) * 0.5 - 4 * A - 2 * Math.PI * (0.25 - xb) * A, 1e-9, 'slot boss rounded all round');
      var disc = rfNIu + 'p.sketch("Top").circle(0, 0, 0.0625).end().extrude(0.25);\n', ds = rfNIchain(disc, [0.0625, 0.25, 0], 0.01);
      assert(ds.length >= 16, 'a small circle\'s rim: ' + ds.length + ' edges');
      return 'slot rim ' + sel.length + ' edges, ' + len.toFixed(4) + ' long; Ø.125 rim ' + ds.length + ' edges';
    });
    // stack fuzz 365 and 89 as built (scripts copied from the generator so the rows stand alone)
    var rfNI365 = rfNIu + 'p.sketch("Front").polyline([[0, 0], [2, 0], [2, 0.5], [0, 0.5]]).end().revolve(360);\np.chamfer(0.125, [[2,0,0]]);\n' +
      'p.sketch("Top", 2.5).circle(1.7054, 0.4839, 0.125).end().cut("through", { reverse: true });\np.sketch("Top", 0.5).circle(0.5709, -0.2933, 0.1875).end().extrude(0.5);\n' +
      'p.sketch("Top", 2.5).circle(0.2388, 1.2392, 0.375).end().cut("through", { reverse: true });\np.fillet(0.0625, [[0.6138,0.5,-1.2392]]);\n' +
      'p.mirror("Right", { body: true, offset: -0.5 });\np.chamfer(0.03, [[2,0.5,0]]);\np.chamfer(0.03, [[0.7584,1,0.2933]]);\n';
    var rfNI89 = rfNIu + 'p.sketch("Front").polyline([[0.25, 0], [2, 0], [2, 0.75], [0.25, 0.75]]).end().revolve(360);\n' +
      'p.sketch("Top", 0.75).centerRect(0.5413, -1.0345, 0.375, 0.1875).end().extrude(0.75);\np.linearPattern({ dir: "z", spacing: 0.75, count: 2 });\n' +
      'p.sketch("Top", 0.75).circle(0.8283, 0.2341, 0.1875).end().cut(0.375, { reverse: true });\np.sketch("Top", 0.375).circle(1.088, -0.1193, 0.75).end().extrude(0.375, { merge: false });\n' +
      'p.intersect({ regions: [true,true,false] });\np.fillet(0.03, [[0.25,0.75,0]]);\np.sketch("Top", 2.75).centerRect(1.5996, 0.2148, 0.375, 0.1875).end().cut("through", { reverse: true });\n' +
      'p.circularPattern({ axis: "y", center: [0, 0, 0], count: 4 });\np.fillet(0.03, [[2,0.75,0]]);\n';
    test('rfNI: stack fuzz 365 (a disc mirrored onto itself 1 in off centre, its rim chamfered): the chamfer stays on the picked disc\'s rim, = OpenCascade 8.142581 to 1e-5 (the chord rule ran on round the copy\'s rim: 4e-4)', function () {
      var r = build(rfNI365);
      rfNIclosed(r, 'fuzz 365');
      nearRel(r.mp.volume, 8.142581401, 1e-5, 'volume vs OpenCascade');
      var old = rfNIwith(K.openGuard, 'trueTangent', false, function () { return build(rfNI365); });
      assert(Math.abs(old.mp.volume - 8.142581401) / 8.142581401 > 1e-4, 'the chord rule is as near: the row does not measure the rule');
      return 'volume ' + r.mp.volume.toFixed(9) + ' (chord rule ' + old.mp.volume.toFixed(9) + ')';
    });
    test('rfNI: stack fuzz 89 (a ring with a disc combined into it, R.03 on the rim): builds, = OpenCascade 8.572233 to 2e-5; it was refused ("The radius may be too large"): the chain had run on round the combined disc', function () {
      var r = build(rfNI89);
      rfNIclosed(r, 'fuzz 89');
      nearRel(r.mp.volume, 8.572232684, 2e-5, 'volume vs OpenCascade');
      var old = rfNIwith(K.openGuard, 'trueTangent', false, function () { return build(rfNI89); });
      assert(rfNIerrs(old).length, 'with the chord rule the fillet is no longer refused: the row does not measure the rule');
      return 'volume ' + r.mp.volume.toFixed(9);
    });

    // ---- 2. clockwise loops
    test('rfNI: triangulate() of a clockwise loop that is not convex: triangles wind as the loop does, none reversed, their areas add up to the loop\'s; a convex clockwise loop keeps its fan', function () {
      var tri = K._.triangulate, U = [[0, 0], [0, 3], [1, 3], [1, 1], [2, 1], [2, 3], [3, 3], [3, 0]];   // a U, clockwise
      function area2(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
      var ts = tri(U), sum = 0;
      ts.forEach(function (t) { var a = area2(U[t[0]], U[t[1]], U[t[2]]); assert(a < 0, 'a triangle winds the other way: ' + t.join(',')); sum += a / 2; });
      near(sum, -7, 1e-12, 'area');
      assert(ts.length === 6, ts.length + ' triangles');
      var old = rfNIwith(tri, 'cw', false, function () { return tri(U); });
      assert(old.some(function (t) { return area2(U[t[0]], U[t[1]], U[t[2]]) > 0; }), 'the fan has no reversed triangle: the row does not measure the rule');
      var sq = [[0, 0], [0, 1], [1, 1], [1, 0]];
      assert(JSON.stringify(tri(sq)) === JSON.stringify(rfNIwith(tri, 'cw', false, function () { return tri(sq); })), 'a convex clockwise loop changed');
      assert(JSON.stringify(tri(U.slice().reverse())) === JSON.stringify(rfNIwith(tri, 'cw', false, function () { return tri(U.slice().reverse()); })), 'a counter-clockwise loop changed');
      return ts.length + ' triangles, area ' + sum;
    });
    test('rfNI: a prism over that clockwise U has every cap triangle facing out, and a block less it has the exact volume and no open edge', function () {
      var pl = K._.makePlane('Top', 0), U = [[0, 0], [0, 3], [1, 3], [1, 1], [2, 1], [2, 3], [3, 3], [3, 0]];
      function block() { return K._.prism([[-1, -1], [4, -1], [4, 4], [-1, 4]], pl, -1, 2); }
      function caps(s) { var up = 0, down = 0; s.polygons.forEach(function (p) { var y = p.vertices[0].pos.y, ny = p.plane.normal.y; if (Math.abs(ny) < 0.5) return; if ((y > 0.5) === (ny > 0)) up++; else down++; }); return [up, down]; }
      var P = K._.prism(U, pl, 0, 1), c = caps(P), co = caps(rfNIwith(K._.triangulate, 'cw', false, function () { return K._.prism(U, pl, 0, 1); }));
      near(P.volume(), 7, 1e-12, 'the prism\'s volume');
      assert(c[0] === 12 && c[1] === 0, 'cap triangles facing out / in: ' + c.join(' / '));
      assert(co[1] > 0, 'the fan\'s prism has no cap triangle facing in: the row does not measure the rule');
      var d = block().subtract(P), ck = Evaluate.checkBody(d);
      near(d.volume(), 75 - 7, 1e-9, 'block less the prism');
      assert(!ck.openEdges.length && !ck.nonManifoldEdges.length, 'open / non-manifold edges');
      return 'caps ' + c.join(' out / ') + ' in (fan: ' + co.join(' / ') + '), block less prism ' + d.volume().toFixed(9);
    });
    test('rfNI: stack fuzz 226 (a disc with two grooves and a block, R.125 on the rim: the block and the grooves\' outline stay whole under the round): builds on the first attempt, closed, = OpenCascade 6.963879 to 3e-5; it was refused ("could not close the rounded faces")', function () {
      var code = rfNIu + 'p.sketch("Front").polyline([[0, 0], [2, 0], [2, 0.5], [0, 0.5]]).end().revolve(360);\n' +
        'p.sketch("Top", 2.5).centerRect(-1.2373, 0.783, 0.375, 0.375).end().cut("through", { reverse: true });\np.chamfer(0.125, [[2,0,0]]);\n' +
        'p.sketch("Front").rect(1.4097, 0.4, 0.1844, 0.35).end().revolveCut(360);\np.linearPattern({ dir: "z", spacing: -0.25, count: 2 });\n' +
        'p.sketch("Top", 0.25).centerRect(-0.2756, 1.0985, 1.5, 1.125).end().extrude(1, { merge: false });\np.intersect({ regions: [true,true,true] });\n' +
        'p.sketch("Top", 2.5).centerRect(0.8954, -0.4059, 0.5, 0.5).end().cut("through", { reverse: true });\np.fillet(0.125, [[2,0.5,0]]);\n';
      var r = rfNIbuild(code);
      rfNIclosed(r, 'fuzz 226');
      assert(r.attempts.fillet === 1, 'the fillet took ' + r.attempts.fillet + ' attempts');
      nearRel(r.mp.volume, 6.963879402, 3e-5, 'volume vs OpenCascade');
      var old = rfNIwith(K._.triangulate, 'cw', false, function () { return build(code); });
      assert(rfNIerrs(old).some(function (m) { return /could not close the rounded faces/.test(m); }), 'with the fan the fillet is no longer refused: the row does not measure the rule');
      return 'volume ' + r.mp.volume.toFixed(9);
    });

    // ---- 3. the outline keeps the rim's own vertex
    function rfNItube(Ro, Ri, H, kind, size) {
      return rfNIu + 'p.sketch("Top").circle(0, 0, ' + Ro + ').circle(0, 0, ' + Ri + ').end().extrude(' + H + ');\n' + (kind ? 'p.' + kind + '(' + size + ', [[' + Ri + ', ' + H + ', 0]]);\n' : '');
    }
    function rfNItubeVolume(Ro, Ri, H, kind, r) {
      var A = kind === 'fillet' ? r * r * (1 - Math.PI / 4) : r * r / 2, xb = kind === 'fillet' ? r * (5 / 6 - Math.PI / 4) / (1 - Math.PI / 4) : r / 3;
      return Math.PI * (Ro * Ro - Ri * Ri) * H - 2 * Math.PI * (Ri + xb) * A;
    }
    test('rfNI: an inch tube Ø1.5 / Ø.5: the top face\'s outline has the bore\'s 32 rim vertices, every one on the circle (it had a cap split point 2.8e-4 off the rim in place of one), and the rim is 32 edges of one length', function () {
      var r = build(rfNItube(0.75, 0.25, 1)), fi = -1;
      r.mesh.faces.forEach(function (f, i) { if (f.normal[1] > 0.99) fi = i; });
      function inner(o) { var l = o.loops.slice().sort(function (a, b) { return Math.abs(K.signedArea(a)) - Math.abs(K.signedArea(b)); })[0]; return l.map(function (p) { return Math.hypot(p.p3[0], p.p3[2]); }); }
      var rs = inner(K.faceOutline(r.mesh, fi)), worst = 0;
      rs.forEach(function (x) { worst = Math.max(worst, Math.abs(x - 0.25)); });
      assert(rs.length === 32, rs.length + ' vertices on the bore\'s rim');
      assert(worst < 1e-12, 'a rim vertex is ' + worst.toExponential(2) + ' off the circle');
      var es = K.bodyEdges(r.mesh).filter(function (e) { return Math.abs(e.a[1] - 1) < 1e-9 && Math.abs(e.b[1] - 1) < 1e-9 && Math.hypot(e.mid[0], e.mid[2]) < 0.3; });
      assert(es.length === 32 && es.every(function (e) { return Math.abs(e.len - es[0].len) < 1e-12; }), es.length + ' rim edges');
      var old = rfNIwith(K.outlineOptions, 'exactTwin', false, function () { return inner(K.faceOutline(K.meshFromBody(build(rfNItube(0.75, 0.25, 1)).body), fi)); }), ow = 0;
      old.forEach(function (x) { ow = Math.max(ow, Math.abs(x - 0.25)); });
      assert(ow > 1e-5, 'without the rule the outline is on the circle too: the row does not measure the rule');
      return '32 vertices, worst ' + worst.toExponential(2) + ' (before: ' + old.length + ' vertices, ' + ow.toExponential(2) + ' off)';
    });
    test('rfNI: that tube\'s bore rounded or chamfered, 50 % to 100 % of the wall (12 parts): closed, Mass Properties = the closed form to 1e-7 (R.25 was 4.5e-4 off, chamfer .4995 8.8e-3, the full width refused)', function () {
      var worst = 0, n = 0;
      ['fillet', 'chamfer'].forEach(function (kind) {
        [0.25, 0.3125, 0.375, 0.45, 0.4995, 0.5].forEach(function (s) {
          var label = kind + ' ' + s, r = build(rfNItube(0.75, 0.25, 1, kind, s)), want = rfNItubeVolume(0.75, 0.25, 1, kind, s);
          rfNIclosed(r, label);
          nearRel(r.mp.volume, want, s === 0.25 ? 1e-9 : 1e-7, label + ' volume');   // (3.7e-8 at chamfer .4995: the 0.0005 face left beside the outer rim)
          worst = Math.max(worst, Math.abs(r.mp.volume - want) / want); n++;
        });
      });
      var code = rfNItube(0.75, 0.25, 1, 'fillet', 0.25), old = rfNIwith(K.outlineOptions, 'exactTwin', false, function () { return build(code); });
      assert(Math.abs(old.mp.volume - rfNItubeVolume(0.75, 0.25, 1, 'fillet', 0.25)) > 1e-4, 'without the rule R.25 is exact too: the row does not measure the rule');
      return n + ' parts, worst ' + worst.toExponential(2);
    });
    test('rfNI: other inch tubes with a small bore (Ø2 / Ø.5, Ø2 / Ø1, Ø1.5 / Ø.25, Ø4 / Ø.5): R.125 and chamfer .125 from the bore, Mass Properties = the closed form to 1e-9', function () {
      var worst = 0, n = 0;
      [[1, 0.25], [1, 0.5], [0.75, 0.125], [2, 0.25]].forEach(function (t) {
        ['fillet', 'chamfer'].forEach(function (kind) {
          var label = 'tube ' + t[0] + ' / ' + t[1] + ' ' + kind, r = build(rfNItube(t[0], t[1], 1, kind, 0.125)), want = rfNItubeVolume(t[0], t[1], 1, kind, 0.125);
          rfNIclosed(r, label);
          nearRel(r.mp.volume, want, 1e-9, label + ' volume');
          worst = Math.max(worst, Math.abs(r.mp.volume - want) / want); n++;
        });
      });
      return n + ' parts, worst ' + worst.toExponential(2);
    });
  })();
  // --- end rfNI ---
