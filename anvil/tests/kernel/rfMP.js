  // --- rfMP (2026-11-15, lane solidfid: solids fidelity) --- the boolean that left needle holes (csg.js bandSnap).
  // splitPolygon takes a vertex within 1e-5 of a plane as on it and leaves it where it is, while the other solid's face
  // is cut where the planes really cross: the two sides of one edge held different points, 7e-6 apart where a cut line
  // across a plate's top passed 5e-6 from a facet of a groove's wall (stack fuzz 773: 2 open + 1 non-manifold edges),
  // 2.7e-5 at the corner of two facets of a hole (stack fuzz 829: a kink in one boolean, 2 open + 1 non-manifold edges
  // in the union after it). The split now notes every such vertex and every split point, and the points that stand for
  // one point become one point in both solids. Rows: the two fuzz parts are closed and exact; with the switch off they
  // are open as before (the rows fail without the fix); a boolean with no such pair is bitwise what it was; the snap
  // is never kept when the mesh round the moved points has more open edges; a shell's slabs are assembled without it.
  (function () {
    group('rfMP: solids fidelity: a band vertex and the split points that stand for it are one point (no needle holes)');
    var rfMPu = 'p.units("in");\n';
    // stack fuzz 773 without its two refused ribs (they add nothing to the solid)
    var rfMP773 = rfMPu + 'p.sketch("Top").centerRect(0, 0, 3.75, 2.75).end().extrude(0.25);\n' +
      'p.sketch("Top", 0.25).circle(0.524, -0.1777, 0.1875).end().extrude(0.5);\n' +
      'p.sketch("Front").rect(0.7583, 0.2, 0.2062, 0.3).end().revolveCut(360);\n' +
      'p.sketch("Top", 0.25).centerRect(-1.403, 1.0621, 0.375, 0.2813).end().cut(0.125, { reverse: true });\n';
    var rfMP829 = rfMPu + 'p.sketch("Front").polyline([[0, 0], [1.5, 0], [1.5, 0.5], [0, 0.5]]).end().revolve(360);\n' +
      'p.sketch("Top", 2.5).circle(-0.6228, 0.4043, 0.375).end().cut("through", { reverse: true });\n' +
      'p.sketch("Top", 0.5).circle(-0.6335, 0.497, 0.125).end().extrude(0.25);\n' +
      'p.sketch("Top", 2.5).centerRect(-0.1703, -0.6843, 0.25, 0.25).end().cut("through", { reverse: true });\n' +
      'p.sketch("Top", 2.5).circle(0.2093, 0.2133, 0.125).end().cut("through", { reverse: true });\n' +
      'p.sketch("Top", 0.25).circle(-0.2273, 0.343, 0.5).end().extrude(0.25, { merge: false });\n' +
      'p.intersect({ regions: [true,false,false] });\n' +
      'p.sketch("Top", 0.5).circle(0.9528, -0.08, 0.25).end().extrude(0.25);\n';
    function rfMPcount(r) {
      var open = 0, nm = 0;
      (r.build.bodies || []).forEach(function (b) { var c = Evaluate.checkBody(b); open += c.openEdges.length; nm += c.nonManifoldEdges.length; });
      return { open: open, nm: nm, mesh: K.meshQuality(r.mesh).openEdges };
    }
    function rfMPclosed(r, label) {
      var e = Object.keys(r.errors || {}).map(function (k) { return r.errors[k]; }), c = rfMPcount(r);
      assert(!e.length, label + ': ' + e.join(' | '));
      assert(!c.open && !c.nm && !c.mesh, label + ': ' + c.open + ' open, ' + c.nm + ' non-manifold edges (mesh ' + c.mesh + ' open)');
    }
    function rfMPoff(fn) { var was = CSG.options.band; CSG.options.band = false; try { return fn(); } finally { CSG.options.band = was; } }
    function rfMPbits(body) {
      var s = [];
      body.polygons.forEach(function (p) { p.vertices.forEach(function (v) { s.push(v.pos.x, v.pos.y, v.pos.z); }); s.push(p.plane.w); });
      return s.join(',');
    }

    test('rfMP: plate, boss, revolved groove, pocket (stack fuzz 773): closed, the closed-form volume; open with CSG.options.band off', function () {
      var m0 = CSG.bandStats.moved, r = build(rfMP773), moved = CSG.bandStats.moved - m0;
      rfMPclosed(r, 'fuzz 773');
      // plate + boss − groove (0.05 deep into the plate, clear of the boss) − pocket
      var want = 3.75 * 2.75 * 0.25 + Math.PI * 0.1875 * 0.1875 * 0.5 - Math.PI * (0.9645 * 0.9645 - 0.7583 * 0.7583) * 0.05 - 0.375 * 0.2813 * 0.125;
      nearRel(r.mp.volume, want, 1e-9, 'volume');
      assert(moved >= 1, 'bandSnap moved ' + moved + ' points (the needle is closed by one point going onto the other)');
      var off = rfMPoff(function () { return rfMPcount(build(rfMP773)); });
      assert(off.open + off.nm > 0, 'with the snap off this part was open (2 open + 1 non-manifold): ' + JSON.stringify(off) + ' (if it is closed without, this row no longer tests the snap)');
      return 'closed, volume ' + r.mp.volume.toFixed(9) + ', ' + moved + ' point(s) moved; off: ' + off.open + ' open + ' + off.nm + ' non-manifold';
    });

    test('rfMP: disk, holes, a second body, Intersect regions, boss (stack fuzz 829): both bodies closed; open with CSG.options.band off', function () {
      var r = build(rfMP829);
      rfMPclosed(r, 'fuzz 829');
      // the two kept regions (the disk less the second body, and their overlap) make up the whole disk: one body.
      // Without the snap the overlap piece came out with a needle flap and stayed a body of its own.
      assert(r.build.bodies.length === 1, r.build.bodies.length + ' bodies');
      var ro = rfMPoff(function () { return build(rfMP829); }), off = rfMPcount(ro);
      assert(off.open + off.nm > 0, 'with the snap off this part was open (2 open + 1 non-manifold): ' + JSON.stringify(off));
      nearRel(r.mp.volume, ro.mp.volume, 1e-8, 'volume against the result without the snap (the same solid)');
      return 'closed, 1 body, volume ' + r.mp.volume.toFixed(9) + '; off: ' + ro.build.bodies.length + ' bodies, ' + off.open + ' open + ' + off.nm + ' non-manifold';
    });

    test('rfMP: the groove cut of fuzz 773 alone: the one moved point goes under 1e-5, no polygon is lost, the volume moves under 1e-8', function () {
      var pre = rfMPu + 'p.sketch("Top").centerRect(0, 0, 3.75, 2.75).end().extrude(0.25);\np.sketch("Top", 0.25).circle(0.524, -0.1777, 0.1875).end().extrude(0.5);\n';
      var cut = 'p.sketch("Front").rect(0.7583, 0.2, 0.2062, 0.3).end().revolveCut(360);\n';
      var s0 = { moved: CSG.bandStats.moved, dropped: CSG.bandStats.dropped, kept: CSG.bandStats.kept, undone: CSG.bandStats.undone };
      var on = build(pre + cut), s1 = CSG.bandStats;
      var off = rfMPoff(function () { return build(pre + cut); });
      assert(s1.moved - s0.moved === 1 && s1.kept - s0.kept === 1 && s1.undone === s0.undone && s1.dropped === s0.dropped, 'moved ' + (s1.moved - s0.moved) + ', kept ' + (s1.kept - s0.kept) + ', undone ' + (s1.undone - s0.undone) + ', dropped ' + (s1.dropped - s0.dropped));
      assert(on.body.polygons.length === off.body.polygons.length, on.body.polygons.length + ' / ' + off.body.polygons.length + ' polygons');
      nearRel(on.body.volume(), off.body.volume(), 1e-8, 'polygon volume on / off');
      rfMPclosed(on, 'groove cut');
      return 'polygon volume ' + on.body.volume().toFixed(12) + ' (off ' + off.body.volume().toFixed(12) + ')';
    });

    test('rfMP: booleans with no such pair are bitwise what they were (Bracket-style plate with holes, a boss, a pocket; a filleted block)', function () {
      var codes = [
        rfMPu + 'p.sketch("Top").centerRect(0, 0, 4, 3).end().extrude(0.5);\np.sketch("Top", 0.5).circle(1, -0.5, 0.25).circle(-1, 0.5, 0.25).end().cut("through", { reverse: true });\np.sketch("Top", 0.5).circle(0, 0, 0.5).end().extrude(0.75);\np.sketch("Top", 0.5).centerRect(-1.2, -0.8, 0.5, 0.4).end().cut(0.2, { reverse: true });\n',
        rfMPu + 'p.sketch("Top").centerRect(0, 0, 3, 2).end().extrude(1);\np.fillet(0.25, [[1.5, 0.5, 1], [-1.5, 0.5, 1]]);\np.sketch("Front").circle(0, 0.5, 0.2).end().cut("through");\n'
      ];
      var n = 0;
      codes.forEach(function (code, i) {
        var m0 = CSG.bandStats.moved, on = build(code), moved = CSG.bandStats.moved - m0;
        var off = rfMPoff(function () { return build(code); });
        rfMPclosed(on, 'part ' + (i + 1));
        assert(moved === 0, 'part ' + (i + 1) + ': ' + moved + ' points moved');
        assert(rfMPbits(on.body) === rfMPbits(off.body), 'part ' + (i + 1) + ': the polygons differ with the snap on and off');
        assert(on.mp.volume === off.mp.volume, 'part ' + (i + 1) + ': volume ' + on.mp.volume + ' / ' + off.mp.volume);
        n += on.body.polygons.length;
      });
      return n + ' polygons bit-identical';
    });

    test('rfMP: the snap is undone when the mesh round the moved points gets worse (CSG.options.cracks), and kept when it does not', function () {
      assert(typeof CSG.options.cracks === 'function', 'kernel-mesh.js sets CSG.options.cracks');
      var was = CSG.options.cracks, u0 = CSG.bandStats.undone, k0 = CSG.bandStats.kept, r, c;
      // a count that calls every snapped list worse: the result must be the one without the snap (open, as with band off)
      var calls = 0;
      CSG.options.cracks = function (polys) { return calls++ % 2 === 0 ? 1 : 0; };   // the snapped list is counted first
      try { r = build(rfMP773); c = rfMPcount(r); } finally { CSG.options.cracks = was; }
      assert(CSG.bandStats.undone > u0 && CSG.bandStats.kept === k0, 'undone ' + (CSG.bandStats.undone - u0) + ', kept ' + (CSG.bandStats.kept - k0));
      assert(c.open + c.nm > 0, 'the result without the snap is the open one: ' + JSON.stringify(c));
      r = build(rfMP773);
      rfMPclosed(r, 'with the mesh count back');
      return 'undone ' + (CSG.bandStats.undone - u0) + ' time(s) under a count that calls the snap worse';
    });

    test('rfMP: a shell is assembled with the snap off and leaves the switch as it found it (rfGA G13: first attempt, exact volume)', function () {
      var c0 = CSG.bandStats.calls;
      var pre = rfMPu + 'p.sketch("Top").centerRect(0, 0, 4, 3).end().extrude(2);\np.fillet(0.5, [[2, 1, 1.5], [2, 1, -1.5], [-2, 1, 1.5], [-2, 1, -1.5]]);\np.fillet(0.25, [[0, 0, 1.5]]);\n';
      var a = build(pre), c1 = CSG.bandStats.calls;
      var r = build(pre + 'p.shell(0.1, [[0, 2, 0]]);\n'), g = K.shellGuard.last;
      rfMPclosed(r, 'G13');
      assert(g && g.tries === 1 && g.open[0] === 0, 'shell guard: ' + JSON.stringify(g));
      assert(CSG.options.band === true, 'CSG.options.band is back on after the shell');
      assert(CSG.bandStats.calls - c1 === c1 - c0, 'the shell itself made ' + (CSG.bandStats.calls - c1 - (c1 - c0)) + ' snap calls (its slabs are assembled without)');
      nearRel(r.mp.volume, 3.503599424, 1e-8, 'volume');
      return 'tries ' + g.tries + ', volume ' + r.mp.volume.toFixed(9);
    });
  })();
  // --- end rfMP ---
