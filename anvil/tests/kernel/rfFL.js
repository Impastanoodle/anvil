  // --- rfFL (2026-10-29, lane FL: every boolean result watertight) --- a stress corpus of the joints BSP booleans
  // crack on (tangent bosses / holes / slot ends, coplanar and flush faces, cuts through a vertex or along an edge, a
  // perforated plate, crossing cylinders, the revolved WHEEL with its rim fillet, the vent), each at the Image Quality
  // angular limits 12°, 6° and 3° on the app's inch tessellation (chord .002 in). Every case must come out closed
  // (Evaluate.checkBody: no open, non-manifold or zero-area faces; meshQuality: no open edges) with its exact volume
  // (analytic, or OpenCascade's B-rep volume where noted). csg.js healCracks closes what the BSP leaves (without it
  // the GROOVE has 6 open edges at 12°). Still open, not pinned: the vent at any angle (4 / 10 / 46 open edges: a
  // fillet end folds back on a top-face fragment), the R0.1 dimple and GROOVE at 6° (see docs/areas/kernel.md).
  (function () {
    group('rfFL: boolean results are watertight (tangent, coplanar and fine-faceted joints)');
    var PI = Math.PI, U = 'p.units("in");\n', PLATE = U + 'p.sketch("Top").rect(0, -2, 4, 2).extrude(0.5);\n';
    function rfFLbuild(code, maxAngle) {
      var prev = K.setTessellation();
      try {
        K.setTessellation({ chordTol: 0.002, minSegs: 16, maxSegs: 128, legacy: false, maxAngle: maxAngle });
        return build(code);
      } finally { K.setTessellation(prev); }
    }
    function rfFLclosed(r, label, opts) {
      opts = opts || {};
      var c = Evaluate.checkBody(r.body, { maxPairs: 1 }), q = K.meshQuality(r.mesh);
      assert(c.openEdges.length === 0 && q.openEdges === 0, label + ': open edges ' + c.openEdges.length + ' (meshQuality ' + q.openEdges + ')');
      if (!opts.nonManifoldOk) assert(c.nonManifoldEdges.length === 0, label + ': non-manifold edges ' + c.nonManifoldEdges.length);
      assert(c.zeroAreaFaces.length === 0, label + ': zero-area faces ' + c.zeroAreaFaces.length);
    }
    // [name, code, exact volume, relative tolerance, angles, options]
    var CASES = [
      ['boss tangent to a side face', PLATE + 'p.sketch("Top", 0.5).circle(3.5, -1, 0.5).extrude(1);\n', 4 + PI * 0.25, 1e-12],
      ['boss tangent to the outside of a face', PLATE + 'p.sketch("Top").circle(4.5, -1, 0.5).extrude(0.5);\n', 4 + PI * 0.125, 1e-12],
      ['hole tangent to the plate edge', PLATE + 'p.sketch("Top").circle(3.5, -1, 0.5).cut("through");\n', 4 - PI * 0.125, 1e-12],
      ['slot whose round ends touch both end walls', PLATE + 'p.sketch("Top").slot(0.25, -1, 3.75, -1, 0.5).cut("through");\n', (8 - 1.75 - PI * 0.0625) * 0.5, 1e-12],
      ['slot whose round ends meet a pocket wall', PLATE + 'p.sketch("Top", 0.5).rect(0.5, -1.5, 3, 1).extrude(0.25, { cut: true, reverse: true });\n' +
        'p.sketch("Top", 0.25).slot(0.75, -1, 3.25, -1, 0.5).extrude(0.25, { cut: true, reverse: true });\n', 4 - 0.75 - (1.25 + PI * 0.0625) * 0.25, 1e-12],
      ['stacked boxes sharing faces (coplanar union)', PLATE + 'p.sketch("Top", 0.5).rect(1, -1.5, 4, 1).extrude(0.5);\np.sketch("Top").rect(4, -2, 1, 2).extrude(0.5);\n', 7, 1e-12],
      ['cuts flush with faces (coincident walls and floor)', PLATE + 'p.sketch("Top", 0.5).rect(3, -2, 1, 1).extrude(0.5, { cut: true, reverse: true });\n' +
        'p.sketch("Top", 0.5).rect(1, -1.5, 1, 1).extrude(0.25, { cut: true, reverse: true });\n', 3.25, 1e-12],
      ['cut through a corner vertex', PLATE + 'p.sketch("Top").line(4, 0, 3, -1).line(3, -1, 5, -1.5).line(5, -1.5, 4, 0).cut("through");\n', 3.6875, 1e-12],
      ['groove along an edge (axis on the edge)', PLATE + 'p.sketch("Right").circle(-2, 0.5, 0.3).extrude(5, { cut: true });\n', 4 - PI * 0.09, 1e-12],
      ['40-hole perforated plate', U + 'p.sketch("Top").rect(0, -4, 10, 4).extrude(0.125);\np.hole("Top", 0.5, -0.5, 0.25, { offset: 0.125 });\n' +
        'p.linearPattern({ dir: "x", spacing: 1, count: 10, dir2: "z", spacing2: 1, count2: 4 });\n', (40 - 40 * PI / 64) * 0.125, 1e-12, [12]],
      // the intersection curves are not corrected exactly (no record for a cylinder–cylinder seam): pinned at the residual
      ['Steinmetz union (equal cylinders crossing)', U + 'p.sketch("Front").circle(0, 0, 1).extrude(4, { midplane: true });\np.sketch("Right").circle(0, 0, 1).extrude(4, { midplane: true });\n',
        8 * PI - 16 / 3, 1e-6, [12, 6]],
      ['cylinder cut through a cylinder off-axis (OpenCascade volume)', U + 'p.sketch("Top").circle(0, 0, 1).extrude(3);\np.sketch("Right").circle(0.4, 1.5, 0.35).extrude(4, { cut: true, midplane: true });\n',
        8.735269871650829, 1e-6],
      ['WHEEL: revolved, dished, rim fillet (OpenCascade volume)', U + 'p.sketch("Front").line(0,0,3,0).line(3,0,3,1.5).line(3,1.5,0,1.5).line(0,1.5,0,0).revolve(360);\n' +
        'p.sketch("Front").line(0,1.5,2.4,1.5).arc(2.4,2.7,1.2,-90,-40).line(2.4+1.2*Math.cos(-40*Math.PI/180),2.7+1.2*Math.sin(-40*Math.PI/180),0,3).line(0,3,0,1.5).revolveCut(360);\n' +
        'p.sketch("Front").arc(0,1.9,0.8,-90,-20).line(0.8*Math.cos(-20*Math.PI/180),1.9+0.8*Math.sin(-20*Math.PI/180),0,1.9+0.8*Math.sin(-20*Math.PI/180)).line(0,1.9+0.8*Math.sin(-20*Math.PI/180),0,1.1).revolveCut(360);\n' +
        'p.fillet(0.25,[[3,1.5,0]]);\n', 41.82828179888897, 2e-7, [12, 6]],
      // GROOVE (rfFG, without its annular groove): torus-walled dish, ball dimple, two fillets; 6 open edges at 12° before healCracks
      ['GROOVE: torus dish, ball dimple and two fillets (OpenCascade volume)', U + 'p.sketch("Front").line(0,0,3,0).line(3,0,3,1.5).line(3,1.5,0,1.5).line(0,1.5,0,0).revolve(360);\n' +
        'p.sketch("Front").line(0,1.0,1.9,1.0).arc(1.9,1.6,0.6,-90,0).line(2.5,1.6,0,1.6).line(0,1.6,0,1.0).revolveCut(360);\n' +
        'p.sketch("Front").arc(0,1.0,0.35,-90,90).line(0,1.35,0,0.65).revolveCut(360);\n' +
        'p.fillet(0.25,[[3,1.5,0]]);\np.fillet(0.15,[[2.5,1.5,0]]);\n', 33.362651728326746, 2e-7, [12]]
    ];
    CASES.forEach(function (cs) {
      var angles = cs[4] || [12, 6, 3];
      test('rfFL: ' + cs[0] + ' — closed, exact volume at maxAngle ' + angles.join(' / '), function () {
        var out = [];
        angles.forEach(function (a) {
          var r = rfFLbuild(cs[1], a);
          noErrors(r);
          rfFLclosed(r, cs[0] + ' at ' + a + '°', cs[5]);
          nearRel(r.mp.volume, cs[2], cs[3], 'volume at ' + a + '°');
          out.push(a + '°: ' + r.body.polygons.length + ' polygons, ' + ((r.mp.volume - cs[2]) / cs[2]).toExponential(1));
        });
        return out.join('; ');
      });
    });

    test('rfFL: healCracks closes a near miss (a vertex 4e-6 off its neighbour\'s edge) and leaves a watertight solid alone', function () {
      var V = CSG.Vector, Vx = CSG.Vertex, P = CSG.Polygon;
      function poly(pts) { return new P(pts.map(function (q) { return new Vx(new V(q[0], q[1], q[2])); })); }
      // a unit cube whose top face is split in two along x = 0.5, the left half's corner on that line 4e-6 off it
      var d = 4e-6, quads = [
        [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
        [[1, 1, 0], [0, 1, 0], [0, 1, 1], [1, 1, 1]], [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]],
        [[0, 0, 1], [0.5, 0, 1], [0.5 - d, 0.5, 1], [0.5, 1, 1], [0, 1, 1]], [[0.5, 0, 1], [1, 0, 1], [1, 1, 1], [0.5, 1, 1]]];
      var cube = CSG.fromPolygons(quads.map(poly)), before = Evaluate.checkBody(cube, { maxPairs: 1 }).openEdges.length;
      assert(before > 0, 'the cracked cube is open: ' + before);
      var healed = CSG.healCracks(cube), after = Evaluate.checkBody(healed, { maxPairs: 1 });
      assert(after.openEdges.length === 0 && after.nonManifoldEdges.length === 0, 'healed: open ' + after.openEdges.length + ', non-manifold ' + after.nonManifoldEdges.length);
      // the right half's edge now runs through the dented corner: the top is whole again, the solid the unit cube
      near(healed.volume(), 1, 1e-12, 'healed volume');
      var whole = CSG.fromPolygons(quads.slice(0, 5).map(poly).concat([poly([[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]])]));
      assert(CSG.healCracks(whole).polygons.every(function (p, i) { return p === whole.polygons[i]; }), 'a watertight solid comes back untouched');
      return 'open ' + before + ' → 0';
    });
  })();
