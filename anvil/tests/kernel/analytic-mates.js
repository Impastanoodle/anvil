  // ------------------------------------------------------------------ analytic mates, interference, clearance (cloud-2026-09-26r)
  // Mates read the cylinders' exact surface records (polygon.surf) instead of fitting the facets: Tangent offsets are the
  // true radius, Concentric / Distance use the true axes; Interference volumes and Clearance distances between analytic
  // bodies are the exact ones. A record-free mesh (stripped records) still falls back to the facet fit.
  group('analytic mates, interference and clearance');
  if (typeof Assembly === 'undefined' || typeof Evaluate === 'undefined') test('assembly.js and evaluate.js load', function () { fail('Assembly or Evaluate is not defined'); });
  else (function () {
    var AS = Assembly, EV = Evaluate;
    var BASE = 'p.name("Base"); p.box(100, 60, 10);';
    var LYING = [1, 0, 0, 0, 0, -1, 0, 1, 0];
    function ry(deg) { var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
    function mul(A, B) { var o = []; for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) o.push(A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]); return o; }
    function noErr(b) { var k = Object.keys(b.errors); if (k.length) fail('assembly errors: ' + k.map(function (id) { return b.errors[id]; }).join(' | ')); }
    function pos(m, id) { return AS.findComponent(m, id).transform.position; }

    test('Tangent with true radii: a lying Ø8 pin turned 7° about its own axis rests with its axis exactly 4 above the top (1e-9); pin–peg axes exactly 4 + 2 apart, 4 − 2 with flip', function () {
      var out = [];
      [0, 7, 11.25].forEach(function (turn) {
        var m = AS.newAssembly(), base = AS.insert(m, { script: BASE }).id;
        var pin = AS.insert(m, { script: 'p.name("Pin"); p.cylinder(4, 20);' }, { position: [30, 40, 20], rotation: mul(LYING, ry(turn)) }).id;
        AS.addMate(m, 'tangent', { component: pin, cylinder: [4 * Math.cos(turn * Math.PI / 180), 10, -4 * Math.sin(turn * Math.PI / 180)] }, { component: base, face: [50, 10, 30] });
        var b = AS.rebuild(m);
        noErr(b);
        near(pos(m, pin)[1], 14, 1e-9, 'axis height at turn ' + turn + '°');
        out.push(pos(m, pin)[1] - 14);
      });
      [false, true].forEach(function (flip) {
        var m = AS.newAssembly(), base = AS.insert(m, { script: BASE }).id;
        var p1 = AS.insert(m, { script: 'p.name("Pin"); p.cylinder(4, 20);' }, { position: [30, 10, 30], fixed: true }).id;
        var p2 = AS.insert(m, { script: 'p.name("Peg"); p.cylinder(2, 20);' }, { position: [60, 10, 40], rotation: ry(5) }).id;
        AS.addMate(m, 'coincident', { component: p2, face: [0.5, 0, 0.5] }, { component: base, face: [50, 10, 30] });
        AS.addMate(m, 'tangent', { component: p2, cylinder: [2, 10, 0] }, { component: p1, cylinder: [4, 10, 0] }, { flip: flip });
        var b = AS.rebuild(m), q = pos(m, p2);
        noErr(b);
        near(Math.hypot(q[0] - 30, q[2] - 30), flip ? 2 : 6, 1e-9, 'axis distance (flip ' + flip + ')');
      });
      return 'height errors ' + out.map(function (e) { return e.toExponential(1); }).join(' / ');
    });

    test('Concentric and Distance use the exact axes: a gear bore turned 7° lands on its shaft axis (1e-9); the bore record radius is 3; Distance 20 between two turned pins is 20 axis to axis', function () {
      var m = AS.newAssembly();
      var shaft = AS.insert(m, { script: 'p.name("Shaft"); p.cylinder(3, 20);' }, { fixed: true }).id;
      var gear = AS.insert(m, { script: 'p.name("Gear"); p.cylinder(12, 5); p.cylinder(3, 5, { cut: true });' }, { position: [5, 8, 3], rotation: ry(7) }).id;
      AS.addMate(m, 'concentric', { component: gear, cylinder: [3, 2.5, 0] }, { component: shaft, cylinder: [3, 10, 0] });
      var b = AS.rebuild(m);
      noErr(b);
      var q = pos(m, gear);
      near(q[0], 0, 1e-9, 'x'); near(q[2], 0, 1e-9, 'z');
      var cy = AS.findCylinder(b.partBuilds[gear], [3, 2.5, 0]);
      assert(cy && cy.exact, 'bore has a record');
      near(cy.radius, 3, 1e-12, 'bore radius');
      // a shaft in its own-size bore, the facets turned 7° against each other: the exact common volume is 0
      var x = AS.interference(m, b), raw = b.bodies[0].intersect(b.bodies[1]).volume();
      assert(x.pairs.length === 0, 'no interference: ' + x.pairs.map(function (p) { return p.volume; }).join(', '));
      var m2 = AS.newAssembly();
      var a1 = AS.insert(m2, { script: 'p.name("Pin"); p.cylinder(4, 20);' }, { fixed: true }).id;
      var a2 = AS.insert(m2, { script: 'p.name("Peg"); p.cylinder(2, 20);' }, { position: [25, 0, 10], rotation: ry(9) }).id;
      AS.addMate(m2, 'distance', { component: a2, cylinder: [2, 10, 0] }, { component: a1, cylinder: [4, 10, 0] }, { distance: 20 });
      var b2 = AS.rebuild(m2), q2 = pos(m2, a2);
      noErr(b2);
      near(Math.hypot(q2[0], q2[2]), 20, 1e-9, 'axis distance');
      return 'facet common volume ' + raw.toExponential(2) + ' → exact ' + x.pairs.length + ' pairs';
    });

    test('Interference of analytic bodies is exact: an Ø8 pin 8 into a block is π·4²·8 (1e-9), also turned 7° about its axis; Evaluate.interference agrees', function () {
      [0, 7].forEach(function (turn) {
        var m = AS.newAssembly(), base = AS.insert(m, { script: BASE }).id;
        AS.insert(m, { script: 'p.name("Pin"); p.cylinder(4, 20);' }, { position: [30, 2, 30], rotation: ry(turn) });
        var b = AS.rebuild(m), x = AS.interference(m, b);
        assert(x.pairs.length === 1, 'one pair');
        nearRel(x.pairs[0].volume, Math.PI * 16 * 8, 1e-9, 'common volume (turn ' + turn + '°)');
        var e = EV.interference(b.bodies, ['Base', 'Pin'], []);
        nearRel(e.pairs[0].volume, Math.PI * 16 * 8, 1e-9, 'Evaluate.interference');
      });
    });

    test('Clearance between analytic bodies is exact: parallel pins 15 apart → 15 − 4 − 2 = 9; a peg 1 off-centre in an Ø10 hole → 5 − 2 − 1 = 2; a lying pin 3 above a block → 3 (all 1e-9)', function () {
      function bodies(parts) {
        var m = AS.newAssembly();
        parts.forEach(function (p) { AS.insert(m, { script: p[0] }, { position: p[1], rotation: p[2] }); });
        var b = AS.rebuild(m);
        noErr(b);
        return b.bodies;
      }
      var r1 = EV.minDistance.apply(null, bodies([['p.cylinder(4, 20);', [0, 0, 0], ry(3)], ['p.cylinder(2, 20);', [15, 0, 0], ry(11)]]));
      assert(r1.exact, 'refined'); near(r1.distance, 9, 1e-9, 'pin–peg');
      near(Math.hypot(r1.pa[0], r1.pa[2]), 4, 1e-9, 'pa on the pin'); near(Math.hypot(r1.pb[0] - 15, r1.pb[2]), 2, 1e-9, 'pb on the peg');
      var r2 = EV.minDistance.apply(null, bodies([['p.cylinder(20, 10); p.cylinder(5, 10, { cut: true });', [0, 0, 0], ry(4)], ['p.cylinder(2, 20);', [1, 0, 0], ry(13)]]));
      assert(r2.exact, 'refined (hole)'); near(r2.distance, 2, 1e-9, 'peg in hole');
      var r3 = EV.minDistance.apply(null, bodies([[BASE, [0, 0, 0]], ['p.cylinder(4, 20);', [30, 17, 20], mul(LYING, ry(5))]]));
      assert(r3.exact, 'refined (plane)'); near(r3.distance, 3, 1e-9, 'pin above the block');
      near(r3.pb[1] - r3.pa[1], 3, 1e-9, 'points one above the other');
      return [r1.distance, r2.distance, r3.distance].join(' / ');
    });

    test('A cylinder without surface records (stripped, as from an STL) still mates through the facet fit: radius r·cos(π/n)', function () {
      var m = AS.newAssembly(), base = AS.insert(m, { script: BASE }).id;
      var pin = AS.insert(m, { script: 'p.name("Pin"); p.cylinder(4, 20);' }, { position: [30, 40, 20], rotation: LYING.slice() }).id;
      var b = AS.rebuild(m), pb = b.partBuilds[pin];
      pb.body.polygons.forEach(function (p) { p.surf = null; });
      pb.__asmGeom = null;
      var cy = AS.findCylinder(pb, [4, 10, 0]), n = K.segsForRadius(4);
      assert(cy && !cy.exact, 'fitted');
      near(cy.radius, 4 * Math.cos(Math.PI / n), 1e-9, 'fitted radius (apothem)');
    });
  })();

