  // --- rfGH (2026-11-02, lane guards: refusals SolidWorks does not make) --- volumes in the comments are SolidWorks 2022
  // SP5 (rfGD rows, test-reports/2026-11-02-solidworks-reference-2.md section 1). False "zero-thickness" (exchange.js
  // dropSpikes, dropFoldedPairs, fillSliverLoops); contact-only pieces as separate bodies, pattern copies not created
  // (kernel-rebuild.js bodyTouch, touchParts, zeroThickness); shell over thin rounds, rims tangent to the opening, one
  // region of a plane opened (kernel-features.js buildShell: bridge, rimOf, pickedRegions); draft past collapse (kernel-curves.js
  // taperedRoof), cylinders along the pull (buildDraft); ribs not bounded (ribLayout).
  (function () {
    group('rfGH: false zero-thickness, edge contact, shells over rounds, draft collapse, disjoint pattern copies, unbounded ribs');
    var PI = Math.PI, U = 'p.units("in");\n';
    function rfGHclosed(r, what) {
      var open = 0, nm = 0;
      (r.build.bodies || []).forEach(function (b) { var c = Evaluate.checkBody(b); open += c.openEdges.length; nm += c.nonManifoldEdges.length; });
      assert(!open && !nm, (what || 'closed') + ': ' + open + ' open, ' + nm + ' non-manifold edges');
    }
    function rfGHerrs(r) { return Object.keys(r.errors).map(function (k) { return r.errors[k]; }); }
    function rfGHbuilds(r, vol, bodies, tol, quick) {
      var e = rfGHerrs(r);
      assert(!e.length, 'errors: ' + e.join(' | '));
      // quick: checkBody's self-intersection pass takes 20 s on a grid of 1000 holes; the mesh counts are what it reads
      if (quick) r.build.bodies.forEach(function (b) { assert(!Exchange.bodyMesh(b).openEdges && !K.nonManifoldCount(b), 'closed mesh'); });
      else rfGHclosed(r);
      nearRel(r.mp.volume, vol, tol || 1e-5, 'volume');
      assert(r.build.bodies.length === (bodies || 1), r.build.bodies.length + ' bodies');
      return 'volume ' + r.mp.volume.toFixed(7);
    }
    function rfGHrefused(r, re) {
      var e = rfGHerrs(r);
      assert(e.length && re.test(e[0]), 'refused: ' + e.join(' | '));
      assert(/^[A-Z][^]*\.$/.test(e[0]), 'a plain sentence: ' + e[0]);
      return e[0];
    }
    function rfGHgrid(nx, ny) {
      var c = U + 'p.sketch("Front").rect(0, 0, 24, 12).extrude(0.125);\nvar s = p.sketch("Front", 0.125);\n';
      for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) c += 's.circle(' + (+(1 + i * 22 / (nx - 1)).toFixed(3)) + ', ' + (+(1 + j * 10 / (ny - 1)).toFixed(3)) + ', 0.125);\n';
      return c + 's.cut("through", { reverse: true });\n';
    }
    // the false refusal: bodyMesh's T-junction split doubled a thin polygon back on itself (648), or two polygons fanned
    // one sliver triangle each way (800); the solid was always right
    [[36, 18], [40, 20]].forEach(function (g) {
      test('rfGH: ' + g[0] * g[1] + ' Ø.25 holes in a 24 × 12 × .125 plate build, exact and closed (was: false zero-thickness)', function () {
        return rfGHbuilds(build(rfGHgrid(g[0], g[1])), (24 * 12 - g[0] * g[1] * PI / 64) * 0.125, 1, 1e-9, true);
      });
    });
    test('rfGH: bodyMesh: a hair-thin wedge left open between two faces is closed with a face of its own, a real gap stays open (968 hole grid: 6 open edges)', function () {
      function cube(gap) {
        var b = build('p.sketch("Top").rect(0, -1, 1, 1).end().extrude(1);\n').build.body, ps = b.polygons.filter(function (q) { return q.plane.normal.y < 0.5; });
        K._.pushPoly(ps, [[0, 1, 0], [0, 1, 1], [1, 1, 1]], 1);   // the top in two triangles, the second's corner moved along the edge
        K._.pushPoly(ps, [[gap, 1, 0], [1, 1, 1], [1, 1, 0]], 1);
        return CSG.fromPolygons(ps);
      }
      assert(Exchange.bodyMesh(cube(1e-5)).openEdges === 0, 'wedge closed');
      assert(Exchange.bodyMesh(cube(1e-3)).openEdges > 0, 'a real crack stays open');
      return 'ok';
    });
    test('rfGH: a plain cut across a 2-section loft builds (S28: 1.433376; the loft itself is lane lofts\')', function () {
      var r = build(U + 'var a = p.sketch("Top").centerRect(0, 0, 3, 2).id();\nvar b = p.sketch("Top", 2.5).circle(0, 0, 0.75).id();\np.loft([a, b]);\np.sketch("Top", 0.25).centerRect(0, 0, 12, 12).end().cut("through", { reverse: false });\n');
      return rfGHbuilds(r, 1.4333764, 1, 1e-3);
    });
    test('rfGH: real zero thickness stays refused: tangent holes, tangent bosses on a plate, a sketch whose own outlines touch (both programs refuse)', function () {
      rfGHrefused(build(U + 'p.sketch("Top").rect(0, -3, 4, 3).end().extrude(2);\np.sketch("Top", 2).circle(1, -1.5, 0.25).end().cut("through", { reverse: true });\np.linearPattern({ dir: "x", spacing: 0.5, count: 2 });\n'), /zero-thickness geometry/);
      rfGHrefused(build(U + 'p.sketch("Top").centerRect(0, 0, 3.75, 3.75).end().extrude(0.75);\np.sketch("Top", 0.75).circle(0.4508, 1.5416, 0.1875).end().extrude(0.75);\np.linearPattern({ dir: "z", spacing: -0.375, count: 2 });\n'), /zero-thickness geometry/);
      rfGHrefused(build(U + 'p.sketch("Front").rect(0, 0, 1, 1).rect(1, 1, 1, 1).end().extrude(0.5);\n'), /zero-thickness geometry/);
      rfGHrefused(build(U + 'p.sketch("Top").centerRect(0, 0, 4, 4).end().extrude(0.5);\np.sketch("Top", 0.5).rect(0, 0, 3, 3).rect(-3, -3, 3, 3).end().cut("through", { reverse: true });\n'), /zero-thickness geometry/);
      return 'refused';
    });
    test('rfGH: a block meeting another on one edge: 2 bodies, volume 1 (SolidWorks R01b); Mass Properties, STEP and each body see two solids', function () {
      var r = build(U + 'p.sketch("Front").rect(0, 0, 1, 1).end().extrude(0.5);\np.sketch("Front", 0.5).rect(1, 0, 1, 1).end().extrude(0.5);\n');
      rfGHbuilds(r, 1, 2, 1e-12);
      r.build.bodies.forEach(function (b) { nearRel(b.volume(), 0.5, 1e-12, 'each block'); assert(!K.nonManifoldCount(b), 'each body is manifold'); });
      nearVec(r.mp.bbox.max, [2, 1, 1], 1e-9, 'bbox');
      var step = Exchange.exportSTEP(r.model, r.build);
      assert((step.match(/MANIFOLD_SOLID_BREP/g) || []).length === 2, 'two solids in the STEP');
      return 'ok';
    });
    test('rfGH: two cuts leaving two blocks in edge contact: 2 bodies, volume 4 (R01e); blocks meeting at a point: 2 bodies (R02a)', function () {
      rfGHbuilds(build(U + 'p.sketch("Top").centerRect(0, 0, 4, 4).end().extrude(0.5);\np.sketch("Top", 0.5).rect(0, 0, 3, 3).end().cut("through", { reverse: true });\np.sketch("Top", 0.5).rect(-3, -3, 3, 3).end().cut("through", { reverse: true });\n'), 4, 2, 1e-12);
      return rfGHbuilds(build(U + 'p.sketch("Top").rect(0, -1, 1, 1).end().extrude(1);\np.sketch("Top", 1).rect(1, -2, 1, 1).end().extrude(1);\n'), 2, 2, 1e-12);
    });
    test('rfGH: a boss off the part inside the part\'s box is a body of its own (rfGA 183), the feature that made it owns it', function () {
      var r = build(U + 'p.sketch("Top").centerRect(0, 0, 4, 4).end().extrude(1);\np.shell(0.25, [[0, 1, 0]]);\np.sketch("Top", 1).circle(0, 0, 0.5).end().extrude(0.5);\n');
      rfGHbuilds(r, 16 - 3.5 * 3.5 * 0.75 + PI * 0.25 * 0.5, 2, 1e-9);
      assert(r.build.bodyFeatures[1] === r.model.features[r.model.features.length - 1].id, 'the boss owns its body');
      return 'ok';
    });
    var DISK = U + 'p.sketch("Front").polyline([[0, 0], [1.5, 0], [1.5, 0.5], [0, 0.5]]).end().revolve(360);\n';
    function rfGHspandrel(r, rc) { return 2 * PI * r * r * (1 - PI / 4) * (rc + r / (6 * (1 - PI / 4))); }   // the ring a convex rim round removes
    test('rfGH: shell over a thinner rim round, sharp inner corner: closed 1.098052 (= disk − sharp cylinder), open top 0.692314 (flat rim, the wall runs straight up)', function () {
      var outer = PI * 2.25 * 0.5 - rfGHspandrel(0.03, 1.47), R2 = 1.4375 * 1.4375;
      var a = rfGHbuilds(build(DISK + 'p.fillet(0.03, [[1.5, 0.5, 0]]);\np.shell(0.0625, []);\n'), outer - PI * R2 * 0.375, 1, 1e-7);
      nearRel(outer - PI * R2 * 0.375, 1.098052, 1e-6, 'SolidWorks');
      var b = rfGHbuilds(build(DISK + 'p.fillet(0.03, [[1.5, 0.5, 0]]);\np.shell(0.0625, [[1.4, 0.5, 0]]);\n'), outer - PI * R2 * 0.4375, 1, 1e-7);
      nearRel(outer - PI * R2 * 0.4375, 0.692314, 1e-6, 'SolidWorks');
      return a + ', ' + b;
    });
    test('rfGH: shell 0.5, 4 × 3 × 2 box, R 0.25 vertical edges: 14.892699 (= box − sharp 3 × 2 × 1.5); sharp inner corners', function () {
      var a = rfGHbuilds(build(U + 'p.sketch("Top").centerRect(0, 0, 4, 3).end().extrude(2);\np.fillet(0.25, [[2, 1, 1.5], [2, 1, -1.5], [-2, 1, 1.5], [-2, 1, -1.5]]);\np.shell(0.5, [[0, 2, 0]]);\n'), 24 - 0.25 * (4 - PI) * 0.25 * 2 - 9, 1, 1e-8);
      return a;
    });
    test('rfGH: shell 0.0625 open top of a Ø3 × 0.5 disk with an R 0.1 rim: 0.697804: the wall ends straight down from the tangent edge, no lip inside the opening', function () {
      var outer = PI * 2.25 * 0.5 - rfGHspandrel(0.1, 1.4);
      var cav = PI * 1.96 * 0.4375 + PI * (1.4375 * 1.4375 - 1.96) * 0.3375 + 2 * PI * (PI * 0.0375 * 0.0375 / 4) * (1.4 + 4 * 0.0375 / (3 * PI));
      nearRel(outer - cav, 0.6978044, 1e-6, 'SolidWorks = this closed form');
      return rfGHbuilds(build(DISK + 'p.fillet(0.1, [[1.5, 0.5, 0]]);\np.shell(0.0625, [[1.0, 0.5, 0]]);\n'), outer - cav, 1, 1e-7);
    });
    test('rfGH: fuzz stacks with a shell over a round: rfGA 147 0.426046, 183 2.028633 (2 bodies), 52 0.986169 (1e-3: R = T on the bore rim and a wall through two bosses)', function () {
      rfGHbuilds(build(U + 'p.sketch("Front").polyline([[0, 0], [1, 0], [1, 1], [0, 1]]).end().revolve(360);\np.fillet(0.03, [[1,1,0]]);\np.shell(0.05, [[0.9,1,0]]);\np.sketch("Top", 3).centerRect(-0.1332, 0.2118, 0.25, 0.25).end().cut("through", { reverse: true });\np.circularPattern({ axis: "y", center: [0, 0, 0], count: 5 });\np.fillet(0.0625, [[1,0,0]]);\n'), 0.4260456, 1, 1e-6);
      rfGHbuilds(build(U + 'p.sketch("Front").polyline([[0, 0], [2, 0], [2, 0.75], [0, 0.75]]).end().revolve(360);\np.fillet(0.0625, [[2,0.75,0]]);\np.shell(0.1, [[1.9,0.75,0]]);\np.fillet(0.125, [[2,0,0]]);\np.sketch("Top", 0.75).circle(-1.1239, -0.0327, 0.1875).end().extrude(0.25);\n'), 2.028633, 2, 1e-6);
      return rfGHbuilds(build(U + 'p.sketch("Front").polyline([[0.25, 0], [1, 0], [1, 1], [0.25, 1]]).end().revolve(360);\np.fillet(0.0625, [[0.25,1,0]]);\np.sketch("Top", 1).circle(0.5758, -0.1914, 0.1875).end().extrude(0.5);\np.mirror("Right");\np.sketch("Front").rect(0.5642, 0.6, 0.2032, 0.65).end().revolveCut(360);\np.shell(0.0625, [[0.9,1,0]]);\np.sketch("Front").rect(0.5123, 0.8, 0.1287, 0.45).end().revolveCut(360);\n'), 0.9861693, 1, 1e-3);
    });
    test('rfGH: a removed face opens only the picked region of its plane: a groove splits the top, the other ring stays a wall', function () {
      var base = U + 'p.sketch("Front").polyline([[0, 0], [2, 0], [2, 1], [1, 1], [1, 0.5], [0.8, 0.5], [0.8, 1], [0, 1]]).end().revolve(360);\n';
      var r = build(base + 'p.shell(0.1, [[1.5, 1, 0]]);\n'), full = build(base);
      assert(!rfGHerrs(r).length, rfGHerrs(r).join(' | '));
      rfGHclosed(r);
      var t = r.build.body.pointTester();
      assert(t([0.4, 0.95, 0]), 'the inner ring keeps its top wall');
      assert(!t([1.5, 0.95, 0]), 'the outer ring is open');
      assert(r.mp.volume < full.mp.volume, 'hollowed');
      return 'volume ' + r.mp.volume.toFixed(7);
    });
    test('rfGH: draft past the collapse: Ø1 45° cone 0.130900 at depth 0.5 and at depth 1; 2 × 1 45° roof 0.416667; the cone keeps its record', function () {
      var a = build(U + 'p.sketch("Top").circle(0, 0, 0.5).end().extrude(0.5, { draft: 45 });\n');
      rfGHbuilds(a, PI * 0.25 * 0.5 / 3, 1, 1e-7);
      assert(a.build.body.polygons.some(function (p) { return p.surf && p.surf.s.t === 'cone'; }), 'cone record');
      rfGHbuilds(build(U + 'p.sketch("Top").circle(0, 0, 0.5).end().extrude(1, { draft: 45 });\n'), PI * 0.25 * 0.5 / 3, 1, 1e-7);
      rfGHbuilds(build(U + 'p.sketch("Top").centerRect(0, 0, 2, 1).end().extrude(1, { draft: 45 });\n'), 1 / 4 + 1 / 6, 1, 1e-9);
      nearVec(build(U + 'p.sketch("Top").centerRect(0, 0, 2, 1).end().extrude(1, { draft: 45 });\n').mp.bbox.max, [1, 0.5, 0.5], 1e-9, 'ridge height');
      return 'ok';
    });
    test('rfGH: draft past the collapse: cone tip clear of a plate 2 bodies 2.380900 (R02b); a pocket cut with draft comes to a point; a concave section stays refused', function () {
      rfGHbuilds(build(U + 'p.sketch("Top").centerRect(0, 0, 3, 3).end().extrude(0.25);\np.sketch("Top", 1.25).circle(0, 0, 0.5).end().extrude(1, { draft: 45 });\n'), 2.25 + PI * 0.25 * 0.5 / 3, 2, 1e-7);
      rfGHbuilds(build(U + 'p.sketch("Top").centerRect(0, 0, 4, 4).end().extrude(1);\np.sketch("Top", 1).centerRect(0, 0, 1, 1).end().cut(0.75, { reverse: true, draft: 45 });\n'), 16 - 1 / 6, 1, 1e-9);
      rfGHrefused(build(U + 'p.sketch("Top").polyline([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2], [0, 0]]).end().extrude(1, { draft: 45 });\n'), /collapses/);
      return 'ok';
    });
    test('rfGH: Draft 1° Along Tangent over a round: 8.911946 (R10c): the round becomes a cone tangent to both faces; without Along Tangent both programs refuse', function () {
      var B = U + 'p.sketch("Top").centerRect(0, 0, 5.5, 3.25).end().extrude(0.5);\np.fillet(0.25, [[2.75, 0.25, 1.625]]);\n';
      var a = build(B + 'p.draft(1, [0, 0, 0], [[0, 0.25, 1.625]], { propagate: "tangent" });\n');
      rfGHbuilds(a, 8.9119463, 1, 1e-7);
      assert(a.build.body.polygons.some(function (p) { return p.surf && p.surf.s.t === 'cone'; }), 'cone record');
      rfGHrefused(build(B + 'p.draft(1, [0, 0, 0], [[0, 0.25, 1.625]]);\n'), /tangent to a round that is not drafted/);
      rfGHrefused(build(B + 'p.draft(1, [0, 0, 0], [[2.7, 0.25, 1.57]]);\n'), /round is tangent to a face that is not drafted/);
      return 'ok';
    });
    test('rfGH: Draft of a cylinder along the pull: a boss to an exact frustum, a hole opening up', function () {
      var t5 = Math.tan(5 * PI / 180), r2 = 0.5 - t5, r3 = 0.25 + t5;
      rfGHbuilds(build(U + 'p.sketch("Top").circle(0, 0, 0.5).end().extrude(1);\np.draft(5, [0, 0, 0], [[0.5, 0.5, 0]]);\n'), PI / 3 * (0.25 + 0.5 * r2 + r2 * r2), 1, 1e-9);
      return rfGHbuilds(build(U + 'p.sketch("Top").centerRect(0, 0, 2, 2).end().extrude(1);\np.sketch("Top", 1).circle(0, 0, 0.25).end().cut("through", { reverse: true });\np.draft(5, [0.9, 0, 0.9], [[0.25, 0.5, 0]]);\n'), 4 - PI / 3 * (0.0625 + 0.25 * r3 + r3 * r3), 1, 1e-9);
    });
    test('rfGH: a pattern or mirror of a cut landing on empty space is a warning, same volume (R05e 23.6073, rfGA 7, 244); a plain cut that misses stays an error', function () {
      var B = U + 'p.sketch("Top").rect(0, -3, 4, 3).end().extrude(2);\np.sketch("Top", 2).circle(1, -1, 0.25).end().cut("through", { reverse: true });\n';
      var a = build(B + 'p.linearPattern({ dir: "x", spacing: 10, count: 2 });\n');
      rfGHbuilds(a, 24 - PI * 0.0625 * 2, 1, 1e-9);
      assert(Object.keys(a.warnings).some(function (k) { return /disjoint/.test(a.warnings[k]); }), 'warning: ' + JSON.stringify(a.warnings));
      var b = build(U + 'p.sketch("Top").centerRect(0, 0, 4.25, 4).end().extrude(0.5);\np.sketch("Front").rect(0.8756, 0.4, 0.2926, 0.35).end().revolveCut(360);\np.mirror("Right");\n');
      assert(!rfGHerrs(b).length, rfGHerrs(b).join(' | '));
      assert(Object.keys(b.warnings).length === 1, 'warning: ' + JSON.stringify(b.warnings));
      rfGHrefused(build(B + 'p.sketch("Top", 2).circle(10, -1, 0.25).end().cut("through", { reverse: true });\n'), /does not intersect the model/);
      return 'ok';
    });
    test('rfGH: CirPattern of a whole block about its edge: the copy would touch on the edge alone: not created, a warning, 24, 1 body (R17)', function () {
      var r = build(U + 'p.sketch("Top").rect(0, -3, 4, 3).end().extrude(2);\np.circularPattern({ axis: "y", center: [0, 0, 0], count: 2 });\n');
      rfGHbuilds(r, 24, 1, 1e-12);
      assert(Object.keys(r.warnings).some(function (k) { return /disjoint/.test(r.warnings[k]); }), 'warning: ' + JSON.stringify(r.warnings));
      return 'ok';
    });
    test('rfGH: a free-ended rib Normal to Sketch is refused ("not bounded properly", R20a, R20b, G24); one whose line reaches walls builds; the part after it still builds', function () {
      var P = U + 'p.sketch("Top").centerRect(0, 0, 4, 2).end().extrude(0.25);\n';
      rfGHrefused(build(P + 'p.sketch("Top", 1).line(-1.5, 0, 1.5, 0).end().rib(0.2, { direction: "normal" });\n'), /not bounded properly/);
      rfGHrefused(build(P + 'p.sketch("Top", 1).line(-2.5, 0, 2.5, 0).end().rib(0.2, { direction: "normal" });\n'), /not bounded properly/);
      var w = build(U + 'p.sketch("Top").centerRect(0, 0, 4, 2).end().extrude(1);\np.shell(0.25, [[0, 1, 0]]);\np.sketch("Top", 0.75).line(-1, 0, 1, 0).end().rib(0.2, { direction: "normal" });\n');
      assert(!rfGHerrs(w).length, rfGHerrs(w).join(' | '));
      rfGHclosed(w);
      return 'volume ' + w.mp.volume.toFixed(7);
    });
  })();
