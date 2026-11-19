  // --- rfNC (2026-11-15, lane solidfid2: solids fidelity, continued) ---
  // 1. A hollow round tangent to a removed face (a boss's root fillet on the opened top; stack fuzz 665, 763, 862).
  //    kernel-features.js buildShell counted the opened plane as a "faceted face" beside the round (mixedSurf: the
  //    first chord's tilt makes the edge concave), so the round stayed out of ringSolids and its facets got slabs: a
  //    lip under the opening, a wall end leaning inward, and a slab assembly that closed on the fifth attempt or not
  //    at all (4 x 3 plate, dia .5 boss, R.03, shell .0625: 17 open edges kept inside the guard's slack). The round is
  //    now one solid from the first attempt, its wall end straight down from the tangent edge.
  // 2. csg.js bandSnap's wide rule (stack fuzz 908): a split point that stands for an original vertex lying exactly
  //    on the three planes goes to it up to 1e-3 away, and across a plane within 20 degrees of its polygon.
  // 3. kernel-mesh.js fit check (rfMU's tube): a round that uses up the whole face beside a circular edge has its
  //    setback between the far rim's chords and its true circle; that is on the face, not off the plate.
  (function () {
    group('rfNC: solids fidelity 2: a hollow round beside a shell\'s opening, the wide snap, rounds that use up a rim\'s face');
    var rfNCu = 'p.units("in");\n';
    function rfNCcount(r) {
      var open = 0, nm = 0;
      (r.build.bodies || []).forEach(function (b) { var c = Evaluate.checkBody(b); open += c.openEdges.length; nm += c.nonManifoldEdges.length; });
      return { open: open, nm: nm, mesh: K.meshQuality(r.mesh).openEdges };
    }
    function rfNCclosed(r, label) {
      var e = Object.keys(r.errors || {}).map(function (k) { return r.errors[k]; }), c = rfNCcount(r);
      assert(!e.length, label + ': ' + e.join(' | '));
      assert(!c.open && !c.nm && !c.mesh, label + ': ' + c.open + ' open, ' + c.nm + ' non-manifold edges (mesh ' + c.mesh + ' open)');
    }
    function rfNCwith(obj, key, value, fn) { var was = obj[key]; obj[key] = value; try { return fn(); } finally { if (was === undefined) delete obj[key]; else obj[key] = was; } }
    // plate Lx x W x H, boss radius rb, height hb on its top, root fillet rf, the top removed, shell T
    function rfNCboss(Lx, W, H, rb, hb, rf, T) {
      return rfNCu + 'p.sketch("Top").centerRect(0, 0, ' + Lx + ', ' + W + ').end().extrude(' + H + ');\n' +
        'p.sketch("Top", ' + H + ').circle(0, 0, ' + rb + ').end().extrude(' + hb + ');\n' +
        'p.fillet(' + rf + ', [[' + rb + ',' + H + ',0]]);\n' +
        'p.shell(' + T + ', [[' + (Lx / 2 - 0.1) + ',' + H + ',' + (W / 2 - 0.1) + ']]);\n';
    }
    // the closed form: the tray (bottom and four sides), the boss's cap, its tube down to the fillet, and the wall
    // under the fillet: the quarter ring between the fillet (rf) and its offset (rf + T) about the fillet's centre
    // circle (radius rb + rf), which ends square on the boss side and straight down from the tangent circle on the
    // opening's side (the rule SolidWorks was measured on for a convex rim, rfGH: the opening goes straight through)
    function rfNCbossVolume(Lx, W, H, rb, hb, rf, T) {
      var A = Math.PI / 4 * ((rf + T) * (rf + T) - rf * rf);
      return Lx * W * H - (Lx - 2 * T) * (W - 2 * T) * (H - T) + Math.PI * rb * rb * T + Math.PI * (rb * rb - (rb - T) * (rb - T)) * (hb - T - rf) +
        2 * Math.PI * ((rb + rf) * A - (Math.pow(rf + T, 3) - Math.pow(rf, 3)) / 3);
    }

    test('rfNC: a boss with a root fillet on the opened top, shelled (R .03 / .0625 / .1 x T .02 / .04 / .0625): closed on the first attempt, the closed-form volume to 1e-9', function () {
      var worst = 0, n = 0;
      [0.03, 0.0625, 0.1].forEach(function (rf) {
        [0.02, 0.04, 0.0625].forEach(function (T) {
          var label = 'R' + rf + ' T' + T, r = build(rfNCboss(4, 3, 0.375, 0.25, 0.75, rf, T)), g = K.shellGuard.last;
          rfNCclosed(r, label);
          assert(g && g.tries === 1 && g.open[0] === 0, label + ': shell guard ' + JSON.stringify(g));
          assert(r.build.bodies.length === 1, label + ': ' + r.build.bodies.length + ' bodies');
          var want = rfNCbossVolume(4, 3, 0.375, 0.25, 0.75, rf, T);
          nearRel(r.mp.volume, want, 1e-9, label + ' volume');
          worst = Math.max(worst, Math.abs(r.mp.volume - want) / want); n++;
        });
      });
      return n + ' shells, worst volume ' + worst.toExponential(1) + ' off the closed form';
    });

    test('rfNC: the same boss before this lane\'s rule (K.shellGuard.hollowRim = false): open inside the guard\'s slack, a lip under the opening (the row above fails without the rule)', function () {
      var r = rfNCwith(K.shellGuard, 'hollowRim', false, function () { var b = build(rfNCboss(4, 3, 0.375, 0.25, 0.75, 0.03, 0.0625)); return { c: rfNCcount(b), g: K.shellGuard.last, v: b.mp.volume }; });
      assert(r.g.tries > 1, 'without the rule the shell needed ' + r.g.tries + ' attempt(s): ' + JSON.stringify(r.g.open) + ' (if it closes at once, this row no longer shows the rule)');
      var on = build(rfNCboss(4, 3, 0.375, 0.25, 0.75, 0.03, 0.0625));
      rfNCclosed(on, 'with the rule');
      assert(K.shellGuard.hollowRim === undefined || K.shellGuard.hollowRim === true, 'the switch is back');
      return 'without: ' + r.c.open + ' open + ' + r.c.nm + ' non-manifold, attempts ' + JSON.stringify(r.g.open) + '; with: closed, volume ' + on.mp.volume.toFixed(9);
    });

    // stack fuzz 665: plate, a second body intersected, corner chamfer, mirror, boss, root fillet, shell with the top
    // opened, a through cut. 6 open + 1 non-manifold before (the shell's best of five attempts had 7 cracks)
    var rfNC665 = rfNCu + 'p.sketch("Top").centerRect(0, 0, 5.75, 3.75).end().extrude(0.375);\n' +
      'p.sketch("Top", -0.1875).centerRect(1.1742, -0.4699, 1.5, 1.125).end().extrude(0.375, { merge: false });\n' +
      'p.intersect({ regions: [true,true,true] });\n' +
      'p.chamfer(0.125, [[-2.875,0.1875,-1.875]]);\n' +
      'p.mirror("Front", { body: true, offset: 0.25 });\n' +
      'p.sketch("Top", 0.375).circle(2.4676, -1.5226, 0.25).end().extrude(0.75);\n' +
      'p.fillet(0.03, [[2.7176,0.375,1.5226]]);\n' +
      'p.shell(0.0625, [[2.775,0.375,1.775]]);\n' +
      'p.sketch("Top", 2.375).centerRect(2.3276, 1.5221, 0.25, 0.25).end().cut("through", { reverse: true });\n';
    test('rfNC: stack fuzz 665 (plate, mirror, boss with a root fillet, shell, cut): closed, the shell on its first attempt', function () {
      var r = build(rfNC665), g = K.shellGuard.last;
      rfNCclosed(r, 'fuzz 665');
      assert(g && g.tries === 1 && g.open[0] === 0, 'shell guard: ' + JSON.stringify(g));
      assert(r.build.bodies.length === 1, r.build.bodies.length + ' bodies');
      return 'closed, volume ' + r.mp.volume.toFixed(9) + ', shell attempts ' + g.tries;
    });

    // stack fuzz 908 without its two refused ribs: a shelled, grooved disc with a rounded bottom rim, a block over
    // the opening, the whole mirrored onto itself 1 in off centre. The mirror's union: the copy's bottom rim (chords 5
    // degrees apart, the R.03 round's first facet 11.5 degrees off the bottom) crosses the original's coplanar bottom,
    // and a split point there lay 2.2e-4 from the rim vertex it stands for
    var rfNC908 = rfNCu + 'p.sketch("Front").polyline([[0, 0], [2, 0], [2, 0.75], [0, 0.75]]).end().revolve(360);\n' +
      'p.fillet(0.03, [[2,0,0]]);\n' +
      'p.sketch("Front").rect(0.7779, 0.45, 0.1887, 0.55).end().revolveCut(360);\n' +
      'p.linearPattern({ dir: "z", spacing: 0.375, count: 2 });\n' +
      'p.shell(0.0625, [[1.9,0.75,0]]);\n' +
      'p.sketch("Top", 0.75).centerRect(-0.4901, -0.156, 0.5, 0.375).end().extrude(0.25);\n' +
      'p.mirror("Right", { body: true, offset: -0.5 });\n';
    test('rfNC: stack fuzz 908 (a shelled disc mirrored onto itself): closed by the wide snap; open with CSG.options.bandWide = 0; the same volume', function () {
      var w0 = CSG.bandStats.wide, r = build(rfNC908), wide = CSG.bandStats.wide - w0;
      rfNCclosed(r, 'fuzz 908');
      assert(r.build.bodies.length === 1, r.build.bodies.length + ' bodies');
      assert(wide > 0, 'the wide rule paired ' + wide + ' points');
      var off = rfNCwith(CSG.options, 'bandWide', 0, function () { return rfNCwith(CSG.options, 'healFold', false, function () { var b = build(rfNC908); return { c: rfNCcount(b), v: b.mp.volume }; }); });   // (healFold, lane solidcracks, closes it too)
      assert(off.c.open + off.c.nm > 0, 'with the wide rule off this part was open (4 open + 2 non-manifold): ' + JSON.stringify(off.c) + ' (if it is closed without, this row no longer tests the rule)');
      nearRel(r.mp.volume, off.v, 1e-8, 'volume against the result without the rule (the same solid)');
      assert(CSG.options.bandWide === 1e-3, 'CSG.options.bandWide is back at ' + CSG.options.bandWide);
      return 'closed, volume ' + r.mp.volume.toFixed(9) + '; off: ' + off.c.open + ' open + ' + off.c.nm + ' non-manifold';
    });

    // rounds / chamfers from a tube's bore that use up the whole top face. Volumes by Pappus, as rfMU
    function rfNCtube(Ro, Ri, H, kind, size) {
      return rfNCu + 'p.sketch("Top").circle(0, 0, ' + Ro + ').circle(0, 0, ' + Ri + ').end().extrude(' + H + ');\np.' + kind + '(' + size + ', [[' + Ri + ', ' + H + ', 0]]);\n';
    }
    function rfNCtubeVolume(Ro, Ri, H, kind, r) {
      var A = kind === 'fillet' ? r * r * (1 - Math.PI / 4) : r * r / 2, xb = kind === 'fillet' ? r * (5 / 6 - Math.PI / 4) / (1 - Math.PI / 4) : r / 3;
      return Math.PI * (Ro * Ro - Ri * Ri) * H - 2 * Math.PI * (Ri + xb) * A;
    }
    test('rfNC: a round or chamfer from a tube\'s bore that uses up its whole top face (four tubes, the full width and 0.1 % under): one body, the analytic volume to 1e-6', function () {
      var n = 0;
      [[1, 0.75, 1], [0.5, 0.375, 0.75], [3, 2.5, 2], [2, 1.75, 0.5]].forEach(function (t) {
        var w = t[0] - t[1];
        [w, +(w * 0.999).toFixed(6)].forEach(function (size) {
          ['fillet', 'chamfer'].forEach(function (kind) {
            var label = 'tube ' + t[0] + ' / ' + t[1] + ' ' + kind + ' ' + size, b = build(rfNCtube(t[0], t[1], t[2], kind, size));
            var e = Object.keys(b.errors).map(function (k) { return b.errors[k]; });
            assert(!e.length, label + ': ' + e.join(' | '));
            assert(b.build.bodies.length === 1, label + ': ' + b.build.bodies.length + ' bodies');
            rfNCclosed(b, label);
            nearRel(b.mp.volume, rfNCtubeVolume(t[0], t[1], t[2], kind, size), 1e-6, label + ' volume');
            n++;
          });
        });
      });
      return n + ' rounds and chamfers';
    });

    test('rfNC: rfMU\'s tube (R.25 from the bore of a 1 / 0.75 tube) builds with the snap on and with it off: it does not hang on the stray point the BSP left on the bore\'s rim', function () {
      var code = rfNCtube(1, 0.75, 1, 'fillet', 0.25), want = rfNCtubeVolume(1, 0.75, 1, 'fillet', 0.25);
      var on = build(code), off = rfNCwith(CSG.options, 'band', false, function () { return build(code); });
      noErrors(on); noErrors(off);
      nearRel(on.mp.volume, want, 1e-6, 'volume, snap on');
      nearRel(off.mp.volume, want, 1e-6, 'volume, snap off');
      // the rule before: every station off the plate -> refused whenever no station faced a vertex of the outer rim
      var old = rfNCwith(K.fitProbe, 'rim', false, function () { return build(code); });
      var oe = Object.keys(old.errors).map(function (k) { return old.errors[k]; });
      assert(oe.length === 1 && /radius may be too large/.test(oe[0]), 'with K.fitProbe.rim = false and the snap on, this round was refused: ' + JSON.stringify(oe) + ' (if it builds, this row no longer tests the rule)');
      return 'volume ' + on.mp.volume.toFixed(9) + ' (snap off ' + off.mp.volume.toFixed(9) + '); refused under the old rule';
    });

    test('rfNC: a round wider than the face beside the bore (R.251, R.26, R.3 on a 0.25 face) is still refused: nothing to stand on', function () {
      [0.251, 0.26, 0.3].forEach(function (size) {
        var b = build(rfNCtube(1, 0.75, 1, 'fillet', size)), e = Object.keys(b.errors).map(function (k) { return b.errors[k]; });
        assert(e.length === 1 && /radius may be too large/.test(e[0]), 'R' + size + ': ' + JSON.stringify(e));
        nearRel(b.mp.volume, Math.PI * (1 - 0.5625), 1e-9, 'R' + size + ': the tube is left as it was');
      });
    });

    // 4. csg.js planar(): sheet fuzz 929 (rfFT pin 13, a hard row there now). The Fold's cut-out (the body before
    //    the cut less the body after) held a wall the heal had left 4.2e-6 off flat; kernel-sheetmetal.js smBool works
    //    at 16x on 14 ga, where that is 6.8e-5, past the splitter's 1e-5: the subtract left 7 open + 2 non-manifold.
    var rfNC929 = rfNCu + 'p.sheet(0.0747, 0.0747, 0.5);\np.sketch("Top").rect(0, -3.5, 5.5, 3.5).end().baseFlange();\n' +
      'p.flange(1.625, [[0,0.0747,1.75]], { position: "inside", lengthRef: "outer" });\n' +
      'p.flange(0.625, [[2.75,0.0747,0]], { position: "inside", lengthRef: "outer", reverse: true });\n' +
      'p.flange(1.625, [[5.5,0.0747,1.75]], { position: "inside", lengthRef: "outer" });\n' +
      'p.unfold([2.75, 0.0747, 1.75], null);\np.sketch("Top", 0.0747).circle(-0.05, -2.1517, 0.25).end().cut("through", { reverse: true });\np.fold(null);\n' +
      'p.unfold([2.75, 0.0747, 1.75], null);\np.sketch("Top", 0.0747).circle(-0.05, -2.5522, 0.1405).end().cut("through", { reverse: true });\np.fold(null);\n';
    test('rfNC: two Unfold / cut / Fold rounds, each a hole across the bend (sheet fuzz 929): closed; open when smBool\'s operands are not made flat (CSG.prototype.planar off)', function () {
      var r = build(rfNC929);
      rfNCclosed(r, 'fuzz 929');
      var was = CSG.prototype.planar, off;
      CSG.prototype.planar = function () { return this; };
      try { off = rfNCcount(build(rfNC929)); } finally { CSG.prototype.planar = was; }
      assert(off.open + off.nm > 0, 'without planar() this part was open (7 open + 2 non-manifold): ' + JSON.stringify(off) + ' (if it is closed without, this row no longer tests it)');
      return 'closed, volume ' + r.mp.volume.toFixed(9) + '; without: ' + off.open + ' open + ' + off.nm + ' non-manifold';
    });

    test('rfNC: planar(): a polygon with a vertex 3e-5 off its plane becomes flat triangles on the same points (same volume); a flat solid comes back as itself', function () {
      var V = function (x, y, z) { return new CSG.Vertex(new CSG.Vector(x, y, z)); };
      function P(pts, plane) { var vs = pts.map(function (q) { return V(q[0], q[1], q[2]); }); return plane ? new CSG.Polygon(vs, null, plane) : CSG.Polygon.tryCreate(vs, null); }
      // a unit cube whose top holds a fifth point on one edge, 3e-5 above the top's plane; the side under that edge
      // holds it too (so the solid is closed), in its own plane
      var e = 3e-5, top = P([[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0], [0.5, 1 + e, 0]], new CSG.Plane(new CSG.Vector(0, 1, 0), 1));
      var polys = [top, P([[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]), P([[0, 0, 0], [0, 1, 0], [0.5, 1 + e, 0], [1, 1, 0], [1, 0, 0]]),
        P([[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]), P([[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]), P([[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]])];
      var solid = CSG.fromPolygons(polys), flat = solid.planar();
      assert(flat !== solid, 'the bent top was not fanned');
      assert(flat.polygons.length === 8, flat.polygons.length + ' polygons (5 flat ones kept, the top as 3 triangles)');
      var worst = 0;
      flat.polygons.forEach(function (p) { p.vertices.forEach(function (v) { worst = Math.max(worst, Math.abs(p.plane.normal.x * v.pos.x + p.plane.normal.y * v.pos.y + p.plane.normal.z * v.pos.z - p.plane.w)); }); });
      assert(worst < 1e-12, 'a vertex is ' + worst + ' off its polygon\'s plane');
      // (a bent polygon has no one surface: the fan from the raised point is a roof e / 3 high over the unit top)
      near(flat.volume(), 1 + e / 3, 1e-12, 'volume of the fanned solid');
      near(flat.volume(), solid.volume(), e, 'volume against the bent polygon\'s own (its area × the bend at most)');
      assert(flat.planar() === flat, 'a flat solid comes back as itself');
      var cube = CSG.fromPolygons(polys.slice(1, 2).concat(polys.slice(3)).concat([P([[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]), P([[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]])]));
      assert(cube.planar() === cube, 'a cube comes back as itself');
      return '6 polygons -> ' + flat.polygons.length + ', worst vertex ' + worst.toExponential(1) + ' off its plane';
    });

    // 5. sheet fuzz 91 (rfFT pin 6, still a TODO row there): 9 edges used four times. Traced: it is the part, not the
    //    boolean. The cut starts on the sheet's top face and goes down; the 120 degree flange next to the hole's flange
    //    is mitred past the corner, and the inside of its bend leaves the top face tangentially, so above the cut a
    //    cusp of that bend is left touching the other bend's end along one line. kernel-rebuild.js already says so
    //    (rfMQ's warning); the fuzz harness counts the part as open because it does not read warnings.
    test('rfNC: sheet fuzz 91 (two 120 degree flanges, a hole at their corner): 0 open; every edge used four times lies on the one line where the two bends touch, and the cut carries the zero-thickness warning', function () {
      var T = 0.125, r = build(rfNCu + 'p.sheet(0.125, 0.25, 0.5);\np.sketch("Top").rect(0, -5.5, 3.25, 5.5).end().baseFlange();\n' +
        'p.flange(0.625, [[1.625,0.125,0]], { position: "inside", lengthRef: "outer", angle: 45 });\n' +
        'p.flange(1.75, [[3.25,0.125,2.75]], { position: "inside", lengthRef: "outer", angle: 120 });\n' +
        'p.flange(0.875, [[1.625,0.125,5.5]], { position: "inside", lengthRef: "outer", angle: 120 });\n' +
        'p.sketch("Top", 0.125).circle(2.5939, -5.047, 0.25).circle(1.1486, -0.7617, 0.0995).end().cut("through", { reverse: true });\n');
      noErrors(r);
      var open = 0, nm = [];
      r.build.bodies.forEach(function (b) { var c = Evaluate.checkBody(b); open += c.openEdges.length; nm = nm.concat(c.nonManifoldEdges); });
      assert(open === 0, open + ' open edges');
      var w = Object.keys(r.warnings || {}).map(function (k) { return r.warnings[k]; }).join(' ');
      if (!nm.length) return 'closed now (no edge used four times): promote rfFT pin 6';
      assert(/zero-thickness geometry at a bend/.test(w), 'the cut carries no zero-thickness warning: ' + JSON.stringify(r.warnings));
      // the line: x = the tangent line of the x = 3.25 flange's bend, y = the sheet's top face
      var x0 = null, off = 0;
      nm.forEach(function (e) {
        assert(e.count === 4, 'an edge used ' + e.count + ' times (a flap, not a line of contact)');
        [e.a, e.b].forEach(function (q) { if (x0 == null) x0 = q[0]; off = Math.max(off, Math.abs(q[0] - x0), Math.abs(q[1] - T)); });
      });
      assert(off < 1e-6, 'the edges used four times are not on one line of the top face: ' + off);
      return nm.length + ' edges used four times, all on x = ' + (x0 == null ? '?' : x0.toFixed(6)) + ', y = T; warning: ' + w.slice(0, 60);
    });
  })();
  // --- end rfNC ---
