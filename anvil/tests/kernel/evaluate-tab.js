  // ------------------------------------------------------------------ Evaluate tab (evaluate.js, run cloud-2026-09-25n)
  group('evaluate: Check / Section Properties / Draft Analysis / Clearance / Interference');
  if (typeof Evaluate === 'undefined') {
    test('evaluate.js loads', function () { fail('Evaluate is not defined'); });
  } else (function () {
    var EV = Evaluate;
    // closed-form second moments of a regular n-gon of circumradius R centred on the origin (vertex at angle 0):
    // area n/2 R² sin a, polar moment n R⁴ sin a (2 + cos a) / 12 with a = 2π/n, Ixx = Iyy = J / 2
    function ngon(R) { var n = segsForRadius(R), a = 2 * Math.PI / n; return { n: n, A: n / 2 * R * R * Math.sin(a), J: n * Math.pow(R, 4) * Math.sin(a) * (2 + Math.cos(a)) / 12 }; }
    function sketchOf(r, name) { return r.model.features.filter(function (f) { return f.type === 'sketch' && (!name || f.name === name); })[0]; }
    function faceNormal(mesh, n) {
      var best = -1;
      mesh.faces.forEach(function (f, i) { if (V.len(V.sub(f.normal, n)) < 1e-9 && (best < 0 || f.area > mesh.faces[best].area)) best = i; });
      assert(best >= 0, 'no face with normal ' + n);
      return best;
    }
    // a unit cube as an indexed triangle mesh (outward, counter-clockwise), for the Check tests
    function cubeMesh(o, s) {
      o = o || [0, 0, 0]; s = s || 1;
      var P = [], T = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
      [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]].forEach(function (c) { P.push(o[0] + c[0] * s, o[1] + c[1] * s, o[2] + c[2] * s); });
      return { positions: P, triangles: T };
    }
    function joinMeshes(a, b) {
      var n = a.positions.length / 3;
      return { positions: a.positions.concat(b.positions), triangles: a.triangles.concat(b.triangles.map(function (i) { return i + n; })) };
    }

    // ---- Section Properties
    test('Section Properties of a 40 × 20 rectangle sketch at (5, 10): A = 800, centroid (25, 20), Ixx = bh³/12, Iyy = hb³/12, Ixy = 0, principal axes along x / y, origin moments by the parallel-axis theorem', function () {
      var r = build('p.sketch("Front").rect(5, 10, 40, 20);');
      var s = EV.sectionOfSketch(sketchOf(r), r.model, r.build.planes);
      nearRel(s.area, 800, 1e-12, 'area');
      near(s.centroid2[0], 25, 1e-9, 'cx'); near(s.centroid2[1], 20, 1e-9, 'cy');
      nearVec(s.centroid, [25, 20, 0], 1e-9, 'centroid 3D');
      nearRel(s.Ixx, 40 * 8000 / 12, 1e-12, 'Ixx'); nearRel(s.Iyy, 20 * 64000 / 12, 1e-12, 'Iyy'); near(s.Ixy, 0, 1e-6, 'Ixy');
      nearRel(s.J, 40 * 8000 / 12 + 20 * 64000 / 12, 1e-12, 'J');
      nearRel(s.I1, 20 * 64000 / 12, 1e-12, 'I1 = Iyy'); nearRel(s.I2, 40 * 8000 / 12, 1e-12, 'I2 = Ixx');
      near(Math.abs(s.axis1World[1]), 1, 1e-9, 'I1 about the y direction');
      nearRel(s.origin.Ixx, 40 * 8000 / 12 + 800 * 20 * 20, 1e-12, 'Lxx'); nearRel(s.origin.Iyy, 20 * 64000 / 12 + 800 * 25 * 25, 1e-12, 'Lyy'); nearRel(s.origin.Ixy, 800 * 25 * 20, 1e-12, 'Lxy');
      nearRel(s.perimeter, 120, 1e-12, 'perimeter');
      return 'Ixx ' + fmt(s.Ixx) + ', Iyy ' + fmt(s.Iyy);
    });
    test('Section Properties of an L-section (60 × 80, 10 thick): A, centroid, Ixx, Iyy, Ixy by composite rectangles and the parallel-axis theorem; principal moments and angle from Mohr\'s circle', function () {
      var r = build('p.sketch("Front").polyline([[0, 0], [60, 0], [60, 10], [10, 10], [10, 80], [0, 80]]);');
      var s = EV.sectionOfSketch(sketchOf(r), r.model, r.build.planes);
      // rectangles: flange [0,60]×[0,10], web [0,10]×[10,80]
      var R = [{ b: 60, h: 10, x: 30, y: 5 }, { b: 10, h: 70, x: 5, y: 45 }];
      var A = 0, Sx = 0, Sy = 0;
      R.forEach(function (q) { var a = q.b * q.h; A += a; Sx += a * q.x; Sy += a * q.y; });
      var cx = Sx / A, cy = Sy / A, Ixx = 0, Iyy = 0, Ixy = 0;
      R.forEach(function (q) { var a = q.b * q.h; Ixx += q.b * Math.pow(q.h, 3) / 12 + a * Math.pow(q.y - cy, 2); Iyy += q.h * Math.pow(q.b, 3) / 12 + a * Math.pow(q.x - cx, 2); Ixy += a * (q.x - cx) * (q.y - cy); });
      nearRel(s.area, 1300, 1e-12, 'area'); near(s.centroid2[0], cx, 1e-9, 'cx'); near(s.centroid2[1], cy, 1e-9, 'cy');
      nearRel(s.Ixx, Ixx, 1e-10, 'Ixx'); nearRel(s.Iyy, Iyy, 1e-10, 'Iyy'); nearRel(s.Ixy, Ixy, 1e-10, 'Ixy');
      var avg = (Ixx + Iyy) / 2, rad = Math.sqrt(Math.pow((Ixx - Iyy) / 2, 2) + Ixy * Ixy);
      nearRel(s.I1, avg + rad, 1e-10, 'I1'); nearRel(s.I2, avg - rad, 1e-10, 'I2');
      // the moment about axis1 is I1 and the product about the principal axes vanishes
      var th = s.angle * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
      nearRel(Ixx * c * c + Iyy * sn * sn - Ixy * Math.sin(2 * th), s.I1, 1e-10, 'moment about axis1');
      near((Ixx - Iyy) / 2 * Math.sin(2 * th) + Ixy * Math.cos(2 * th), 0, 1e-6 * s.I1, 'principal product');
      assert(Ixy < 0, 'an L with its legs along +x / +y has a negative product about the centroid: ' + Ixy);
      return 'centroid (' + fmt(cx) + ', ' + fmt(cy) + '), Ixy ' + fmt(Ixy) + ', θ ' + fmt(s.angle) + '°';
    });
    test('Section Properties of a ring (R 20, r 12): the n-gon closed form (n/2 R² sin 2π/n, J = nR⁴ sin a (2 + cos a)/12) to 1e-9 and π(R⁴ − r⁴)/4 to 1 %; the extruded ring\'s annular face gives the same values', function () {
      var r = build('p.sketch("Front").circle(0, 0, 20).circle(0, 0, 12).end().extrude(5);');
      var s = EV.sectionOfSketch(sketchOf(r), r.model, r.build.planes), o = ngon(20), i = ngon(12);
      nearRel(s.area, o.A - i.A, 1e-9, 'area'); nearRel(s.J, o.J - i.J, 1e-9, 'J');
      nearRel(s.Ixx, (o.J - i.J) / 2, 1e-9, 'Ixx'); nearRel(s.Iyy, (o.J - i.J) / 2, 1e-9, 'Iyy'); near(s.Ixy, 0, 1e-6 * s.Ixx, 'Ixy');
      nearVec(s.centroid, [0, 0, 0], 1e-9, 'centroid');
      nearRel(s.Ixx, Math.PI * (Math.pow(20, 4) - Math.pow(12, 4)) / 4, 0.01, 'true circle');
      var f = EV.sectionOfFace(r.mesh, faceNormal(r.mesh, [0, 0, 1]));
      nearRel(f.area, s.area, 1e-9, 'face area'); nearRel(f.J, s.J, 1e-9, 'face J'); nearRel(f.I1, s.I1, 1e-9, 'face I1'); nearRel(f.I2, s.I2, 1e-9, 'face I2');
      nearVec(f.centroid, [0, 0, 5], 1e-9, 'face centroid');
      return 'n ' + o.n + ' / ' + i.n + ', J ' + fmt(s.J);
    });
    test('Section Properties of a face: the 40 × 20 top of a box (any in-plane frame) gives the rectangle\'s area, centroid, J and principal moments; a planar face with a hole subtracts it', function () {
      var r = build('p.sketch("Front").rect(0, 0, 40, 20).end().extrude(7);');
      var s = EV.sectionOfFace(r.mesh, faceNormal(r.mesh, [0, 0, 1]));
      nearRel(s.area, 800, 1e-12, 'area'); nearVec(s.centroid, [20, 10, 7], 1e-9, 'centroid');
      nearRel(s.I1, 20 * 64000 / 12, 1e-10, 'I1'); nearRel(s.I2, 40 * 8000 / 12, 1e-10, 'I2'); nearRel(s.J, 40 * 8000 / 12 + 20 * 64000 / 12, 1e-10, 'J');
      nearVec(s.normal, [0, 0, 1], 1e-12, 'normal');
      var h = build('p.sketch("Front").rect(0, 0, 40, 20).rect(5, 5, 10, 10).end().extrude(7);');
      var t = EV.sectionOfFace(h.mesh, faceNormal(h.mesh, [0, 0, 1]));
      nearRel(t.area, 700, 1e-12, 'holed area');
      var cx = (800 * 20 - 100 * 10) / 700, cy = (800 * 10 - 100 * 10) / 700;
      nearVec(t.centroid, [cx, cy, 7], 1e-9, 'holed centroid');
      var Ixx = 40 * 8000 / 12 + 800 * Math.pow(10 - cy, 2) - (10 * 1000 / 12 + 100 * Math.pow(10 - cy, 2));
      var Iyy = 20 * 64000 / 12 + 800 * Math.pow(20 - cx, 2) - (10 * 1000 / 12 + 100 * Math.pow(10 - cx, 2));
      nearRel(t.J, Ixx + Iyy, 1e-10, 'holed J');
      assert(t.perimeter > 159.99 && t.perimeter < 160.01, 'perimeter ' + t.perimeter);
    });
    test('Section Properties refuses a sketch with no closed contour', function () {
      var r = build('p.sketch("Front").line(0, 0, 10, 0);');
      var err = null;
      try { EV.sectionOfSketch(sketchOf(r), r.model, r.build.planes); } catch (e) { err = e.message; }
      assert(err && /closed/.test(err), 'error ' + err);
    });

    // ---- Draft Analysis
    test('Draft Analysis of a 5° tapered extrude along +Z: sides +5.000° (positive at 3°, requires draft at 6°), top +90° positive, bottom −90° negative; pulling along −Z makes the sides negative', function () {
      var r = build('p.sketch("Front").rect(0, 0, 40, 20).end().extrude(30, { draft: 5 });');
      noErrors(r);
      var a = EV.draftAnalysis(r.mesh, [0, 0, 1], 3), sides = a.faces.filter(function (f) { return Math.abs(r.mesh.faces[f.index].normal[2]) < 0.5; });
      assert(sides.length === 4, 'four side faces, got ' + sides.length);
      sides.forEach(function (f) { near(f.angle, 5, 1e-9, 'side draft'); assert(f.cls === 'positive', 'side ' + f.cls); });
      var top = a.faces[faceNormal(r.mesh, [0, 0, 1])], bot = a.faces[faceNormal(r.mesh, [0, 0, -1])];
      near(top.angle, 90, 1e-9, 'top'); near(bot.angle, -90, 1e-9, 'bottom');
      assert(top.cls === 'positive' && bot.cls === 'negative', top.cls + ' / ' + bot.cls);
      assert(a.counts.positive === 5 && a.counts.negative === 1 && a.counts.requires === 0 && a.counts.straddle === 0, JSON.stringify(a.counts));
      var b = EV.draftAnalysis(r.mesh, [0, 0, 1], 6);
      assert(b.counts.requires === 4 && b.counts.positive === 1 && b.counts.negative === 1, 'at 6°: ' + JSON.stringify(b.counts));
      var c = EV.draftAnalysis(r.mesh, [0, 0, -1], 3);
      assert(c.counts.negative === 5 && c.counts.positive === 1, 'reversed: ' + JSON.stringify(c.counts));
      c.faces.filter(function (f) { return Math.abs(r.mesh.faces[f.index].normal[2]) < 0.5; }).forEach(function (f) { near(f.angle, -5, 1e-9, 'reversed side'); });
      var d = EV.draftAnalysis(build('p.box(10, 10, 10);').mesh, [0, 1, 0], 1);
      assert(d.counts.requires === 4 && d.counts.positive === 1 && d.counts.negative === 1, 'box walls need draft: ' + JSON.stringify(d.counts));
    });
    test('Draft Analysis: the faceted side of a cylinder lying across the pull direction is one straddle surface (its facets are joined by tangent edges); the end caps need draft', function () {
      var r = build('p.cylinder(10, 30, { axis: "x" });');
      var a = EV.draftAnalysis(r.mesh, [0, 1, 0], 2);
      assert(a.counts.straddle === 1 && a.counts.requires === 2 && a.counts.positive === 0 && a.counts.negative === 0, JSON.stringify(a.counts));
      var st = a.faces.filter(function (f) { return f.cls === 'straddle'; });
      assert(st.length === segsForRadius(10), 'every side facet straddles: ' + st.length);
      var b = EV.draftAnalysis(r.mesh, [1, 0, 0], 2);
      assert(b.counts.requires === 1 && b.counts.positive === 1 && b.counts.negative === 1, 'along the axis: ' + JSON.stringify(b.counts));
    });

    // ---- Clearance Verification
    test('Clearance between two boxes: 10 apart along x (face to face), and √50 corner to corner with the two closest points exactly at the corners', function () {
      var r = build('p.box(10, 10, 10); p.sketch("Front").rect(20, 3, 10, 5).end().extrude(5, { merge: false });');
      assert(r.build.bodies.length === 2, 'two bodies');
      var d = EV.minDistance(r.build.bodies[0], r.build.bodies[1]);
      near(d.distance, 10, 1e-9, 'gap'); near(d.pa[0], 10, 1e-9, 'pa on x = 10'); near(d.pb[0], 20, 1e-9, 'pb on x = 20');
      assert(!d.interfering, 'not interfering');
      var q = build('p.box(10, 10, 10); p.sketch("Front", 13).rect(15, 14, 5, 5).end().extrude(5, { merge: false });');
      var e = EV.minDistance(q.build.bodies[0], q.build.bodies[1]);
      near(e.distance, Math.sqrt(50), 1e-9, 'diagonal'); nearVec(e.pa, [10, 10, 10], 1e-9, 'corner A'); nearVec(e.pb, [15, 14, 13], 1e-9, 'corner B');
      var c = EV.clearance(q.build.bodies, ['A', 'B'], [], 8);
      assert(c.checked === 1 && c.failed === 1 && !c.results[0].ok, 'below 8: ' + JSON.stringify(c.results.map(function (x) { return x.ok; })));
      assert(EV.clearance(q.build.bodies, ['A', 'B'], [], 7).failed === 0, 'at least 7');
      return 'min ' + fmt(e.distance);
    });
    test('Clearance between two cylinders (r 4, 16-gons): side by side 20 apart → 12 (facet vertices face each other); end to end 7 apart → 7; overlapping → 0 and interfering; touching boxes → 0, not interfering', function () {
      assert(segsForRadius(4) % 8 === 0, 'r 4 is an n-gon with n a multiple of 8, so a vertex faces ±x');
      var a = build('p.cylinder(4, 20, { axis: "z" }); p.cylinder(4, 20, { axis: "z", at: [20, 0, 0], merge: false });');
      var d = EV.minDistance(a.build.bodies[0], a.build.bodies[1]);
      near(d.distance, 12, 1e-9, 'side by side'); near(d.pa[0], 4, 1e-9, 'pa x'); near(d.pb[0], 16, 1e-9, 'pb x');
      var b = build('p.cylinder(4, 20, { axis: "z" }); p.cylinder(4, 10, { axis: "z", at: [0, 0, 27], merge: false });');
      near(EV.minDistance(b.build.bodies[0], b.build.bodies[1]).distance, 7, 1e-9, 'end to end');
      var c = build('p.cylinder(4, 20, { axis: "z" }); p.cylinder(4, 20, { axis: "z", at: [5, 0, 0], merge: false });');
      var e = EV.minDistance(c.build.bodies[0], c.build.bodies[1]);
      assert(e.distance === 0 && e.interfering, 'overlap ' + e.distance + ' ' + e.interfering);
      var t = build('p.box(10, 10, 10); p.box(10, 10, 10, { at: [10, 0, 0], merge: false });');
      var f = EV.minDistance(t.build.bodies[0], t.build.bodies[1]);
      assert(f.distance === 0 && !f.interfering, 'touching ' + f.distance + ' ' + f.interfering);
    });
    test('Clearance between assembly components: selected pairs only, one selected against the rest; Pinned plate pins sit in their holes (clearance 0 would mean touching)', function () {
      var ex = AnvilExamples.filter(function (x) { return x.name === 'Interference check'; })[0];
      var r = buildAsm(ex.code), names = r.model.components.map(function (c) { return c.name; });
      var all = EV.clearance(r.build.bodies, names, [], 0);
      assert(all.checked === 6, 'six pairs ' + all.checked);
      var one = EV.clearance(r.build.bodies, names, [names.indexOf('Pin<1>')], 0);
      assert(one.checked === 3 && one.results.every(function (x) { return x.aName === 'Pin<1>' || x.bName === 'Pin<1>'; }), 'Pin<1> vs the rest');
      var two = EV.clearance(r.build.bodies, names, [names.indexOf('Block<1>'), names.indexOf('Pin<2>')], 0);
      assert(two.checked === 1, 'one pair');
      var ov = all.results.filter(function (x) { return x.interfering; }).map(function (x) { return x.aName + '/' + x.bName; }).sort();
      assert(ov.join() === 'Base<1>/Block<1>,Base<1>/Pin<2>', 'interfering pairs ' + ov.join());
      return 'minimum ' + fmt(all.minimum) + ', Block–Pin<2> ' + fmt(two.minimum);
    });
    test('Interference Detection limited to selected components matches Assembly.interference on the whole assembly and filters to the selection', function () {
      var ex = AnvilExamples.filter(function (x) { return x.name === 'Interference check'; })[0];
      var r = buildAsm(ex.code), names = r.model.components.map(function (c) { return c.name; });
      var whole = Assembly.interference(r.model, r.build), mine = EV.interference(r.build.bodies, names, []);
      assert(mine.pairs.length === whole.pairs.length && mine.pairs.length === 2, 'pairs ' + mine.pairs.length);
      mine.pairs.forEach(function (p, i) { nearRel(p.volume, whole.pairs[i].volume, 1e-12, p.aName + '/' + p.bName); assert(p.aName === whole.pairs[i].aName && p.bName === whole.pairs[i].bName, 'names'); });
      var bi = names.indexOf('Base<1>'), pi = names.indexOf('Pin<2>'), ki = names.indexOf('Block<1>');
      var sel = EV.interference(r.build.bodies, names, [bi, pi]);
      assert(sel.pairs.length === 1 && sel.pairs[0].bName === 'Pin<2>', 'Base + Pin<2>');
      nearRel(sel.pairs[0].volume, 8 * circleArea(4), 1e-9, 'Base ∩ Pin<2>');
      assert(EV.interference(r.build.bodies, names, [ki, pi]).pairs.length === 0, 'Block and Pin<2> do not overlap');
      var rest = EV.interference(r.build.bodies, names, [pi], { withRest: true });
      assert(rest.pairs.length === 1 && rest.checked >= 1, 'Pin<2> and the rest');
      assert(EV.pairsFor(4, [2]).length === 3 && EV.pairsFor(4, []).length === 6 && EV.pairsFor(4, [0, 3]).length === 1 && EV.pairsFor(4, [0, 3], { withRest: true }).length === 5, 'pairsFor');
    });

    // pattern and mirror instances (assembly.js, cloud-2026-09-25l) are components with their own world bodies; the
    // exploded view adds display offsets to build.bodies, so Interference / Clearance use Assembly.explodedBodies(…, 0)
    var BLK = 'p.name("Block"); p.box(20, 20, 20);';
    function patterned() {
      var m = Assembly.newAssembly();
      var base = Assembly.insert(m, { script: 'p.name("Base"); p.box(100, 60, 10);' }, { fixed: true }).id;
      var blk = Assembly.insert(m, { script: BLK }, { position: [10, 10, 5], fixed: true }).id;   // x 10..30, y 10..30, z 5..25
      Assembly.addPattern(m, 'linear', [blk], { direction: { axis: 'x' }, spacing: 15, count: 2 });   // Block<2>: x 25..45 (5 into Block<1>)
      Assembly.addPattern(m, 'mirror', [blk], { plane: { component: base, plane: 'Right' } });        // Block<3>: x −30..−10
      Assembly.addPattern(m, 'mirror', [blk], { plane: { plane: 'Front' }, oppositeHand: true });     // Block<4>: z −25..−5, det −1
      return { m: m, b: Assembly.rebuild(m), blk: blk };
    }
    function idx(m, name) { for (var i = 0; i < m.components.length; i++) if (m.components[i].name === name) return i; return -1; }
    test('Interference and Clearance on Linear Component Pattern and Mirror Components instances: Block<1> ∩ Block<2> = 5 × 20 × 20; the mirror copy 20 away, the opposite-hand copy 10 away (outward normals, so CSG and distances work on it); coplanar-sided and nested overlaps interfere', function () {
      var s = patterned(), m = s.m, names = m.components.map(function (c) { return c.name; });
      noErrors(s.b);
      assert(names.join() === 'Base<1>,Block<1>,Block<2>,Block<3>,Block<4>', names.join());
      var b1 = idx(m, 'Block<1>'), b2 = idx(m, 'Block<2>'), b3 = idx(m, 'Block<3>'), b4 = idx(m, 'Block<4>');
      var r = EV.interference(s.b.bodies, names, [b1, b2]);
      assert(r.pairs.length === 1, 'pairs ' + r.pairs.length); nearRel(r.pairs[0].volume, 2000, 1e-9, 'Block<1> ∩ Block<2>');
      var all = EV.interference(s.b.bodies, names, []), whole = Assembly.interference(m, s.b);
      assert(all.pairs.length === whole.pairs.length, 'same pairs as Assembly.interference: ' + all.pairs.length + ' / ' + whole.pairs.length);
      near(EV.minDistance(s.b.bodies[b1], s.b.bodies[b3]).distance, 20, 1e-9, 'mirror copy');
      var d4 = EV.minDistance(s.b.bodies[b1], s.b.bodies[b4]);
      near(d4.distance, 10, 1e-9, 'opposite hand'); near(d4.pa[2], 5, 1e-9, 'pa on z = 5'); near(d4.pb[2], -5, 1e-9, 'pb on z = −5');
      var c = EV.clearance(s.b.bodies, names, [b3, b4], 0, { withRest: true });
      assert(c.results.every(function (x) { return !x.interfering; }), 'the mirrored blocks touch nothing');
      // an opposite-hand mirror that overlaps its seed: a block at z −5..15 mirrored in the Front plane (z −15..5)
      var m2 = Assembly.newAssembly();
      var k = Assembly.insert(m2, { script: BLK }, { position: [0, 0, -5], fixed: true }).id;   // z −5..15
      Assembly.addPattern(m2, 'mirror', [k], { plane: { plane: 'Front' }, oppositeHand: true });   // z −15..5: overlap 10
      var b2b = Assembly.rebuild(m2), n2 = m2.components.map(function (x) { return x.name; });
      var o = EV.interference(b2b.bodies, n2, [0, 1]);
      assert(o.pairs.length === 1, 'opposite-hand overlap'); nearRel(o.pairs[0].volume, 4000, 1e-9, 'Block ∩ its opposite-hand mirror');
      assert(EV.minDistance(b2b.bodies[0], b2b.bodies[1]).interfering, 'coplanar-sided overlap interferes');
      var nest = build('p.box(20, 20, 20); p.box(4, 4, 4, { at: [8, 8, 8], merge: false });');
      var dn = EV.minDistance(nest.build.bodies[0], nest.build.bodies[1]);
      assert(dn.distance === 0 && dn.interfering, 'a block nested inside another: ' + dn.distance + ' ' + dn.interfering);
    });
    test('Exploded View: build.bodies carry the explode offsets, Assembly.explodedBodies(…, 0) gives the collapsed ones; Interference / Clearance on the collapsed bodies match the unexploded assembly', function () {
      var s = patterned(), m = s.m, names = m.components.map(function (c) { return c.name; });
      var b2 = idx(m, 'Block<2>'), b1 = idx(m, 'Block<1>');
      var before = EV.interference(s.b.bodies, names, []), cb = EV.clearance(s.b.bodies, names, [], 0);
      Assembly.addExplodeStep(m, null, [m.components[b2].id], 'y', 50);
      Assembly.setExploded(m, true);
      var x = Assembly.rebuild(m);
      assert(x.explode && x.explode.offsets[m.components[b2].id], 'exploded');
      near(K.massProps(K.meshFromBody(x.bodies[b2]), 1).bbox.min[1], 60, 1e-9, 'Block<2> shown 50 up');
      assert(EV.interference(x.bodies, names, [b1, b2]).pairs.length === 0, 'the displayed (exploded) bodies no longer overlap');
      var col = Assembly.explodedBodies(m, x, x.explode.view, 0);
      near(K.massProps(K.meshFromBody(col[b2]), 1).bbox.min[1], 10, 1e-9, 'collapsed Block<2>');
      var after = EV.interference(col, names, []), ca = EV.clearance(col, names, [], 0);
      assert(after.pairs.length === before.pairs.length, 'pairs ' + after.pairs.length + ' vs ' + before.pairs.length);
      after.pairs.forEach(function (p, i) { nearRel(p.volume, before.pairs[i].volume, 1e-12, p.aName + ' ∩ ' + p.bName); });
      ca.results.forEach(function (r, i) { near(r.distance, cb.results[i].distance, 1e-12, r.aName + ' – ' + r.bName); });
    });

    // ---- Check
    test('Check: a closed indexed cube passes; the same cube as unwelded triangle soup passes after welding', function () {
      var r = EV.checkMesh(cubeMesh());
      assert(r.ok && r.triangles === 12 && r.edges === 18 && r.vertices === 8, JSON.stringify({ ok: r.ok, t: r.triangles, e: r.edges, v: r.vertices }));
      var c = cubeMesh(), P = [], T = [];
      for (var i = 0; i < c.triangles.length; i++) { var v = c.triangles[i]; P.push(c.positions[v * 3], c.positions[v * 3 + 1], c.positions[v * 3 + 2]); T.push(i); }
      var s = EV.checkMesh({ positions: P, triangles: T });
      assert(s.ok && s.vertices === 8, 'soup ' + s.vertices);
    });
    test('Check flags deliberately broken meshes: a missing triangle (3 open edges), a duplicated triangle (3 non-manifold edges), a flipped triangle (3 inconsistently oriented edges), a collinear triangle (zero-area), two interpenetrating cubes (self-intersections); touching cubes do not self-intersect', function () {
      var c = cubeMesh();
      var hole = { positions: c.positions, triangles: c.triangles.slice(3) };
      var h = EV.checkMesh(hole);
      assert(h.openEdges.length === 3 && !h.nonManifoldEdges.length && !h.ok, 'hole: open ' + h.openEdges.length + ', nm ' + h.nonManifoldEdges.length);
      var dup = EV.checkMesh({ positions: c.positions, triangles: c.triangles.concat(c.triangles.slice(0, 3)) });
      assert(dup.nonManifoldEdges.length === 3 && dup.nonManifoldEdges.every(function (e) { return e.count === 3; }) && !dup.openEdges.length, 'duplicate: nm ' + dup.nonManifoldEdges.length);
      var flip = c.triangles.slice(); flip[1] = c.triangles[2]; flip[2] = c.triangles[1];
      var f = EV.checkMesh({ positions: c.positions, triangles: flip });
      assert(f.nonManifoldEdges.length === 3 && /orient/.test(f.nonManifoldEdges[0].reason) && !f.openEdges.length, 'flipped: nm ' + f.nonManifoldEdges.length);
      var deg = EV.checkMesh({ positions: c.positions.concat([5, 0, 0, 6, 0, 0, 7, 0, 0]), triangles: c.triangles.concat([8, 9, 10]) });
      assert(deg.zeroAreaFaces.length === 1 && deg.zeroAreaFaces[0].tri === 12, 'collinear: ' + deg.zeroAreaFaces.length);
      var interMesh = joinMeshes(c, cubeMesh([0.5, 0.25, 0.3])), inter = EV.checkMesh(interMesh);
      assert(inter.selfIntersections.length > 0 && !inter.openEdges.length && !inter.nonManifoldEdges.length, 'interpenetrating: ' + inter.selfIntersections.length);
      var touch = EV.checkMesh(joinMeshes(c, cubeMesh([1, 0.25, 0.3], 0.5)));
      assert(touch.selfIntersections.length === 0 && touch.ok, 'touching: ' + touch.selfIntersections.length);
      var all = EV.check([hole, interMesh], ['Hole', 'Inter']);
      assert(all.counts.open === 3 && all.counts.selfIntersection === inter.selfIntersections.length && all.items.length === 3 + inter.selfIntersections.length && !all.ok, JSON.stringify(all.counts));
      assert(all.items[0].lines.length === 1 && all.items[0].name === 'Hole' && /Open edge 1/.test(all.items[0].label), 'item ' + all.items[0].label);
      return 'self-intersections ' + inter.selfIntersections.length;
    });
    test('Check of CSG bodies: every Design Library example is closed and manifold with no zero-area faces or self-intersections (the Funnel\'s known sliver crack is reported, not asserted)', function () {
      var out = [], funnel = '';
      AnvilExamples.forEach(function (ex) {
        var r = buildExample(ex), c = EV.check(r.build.bodies);
        if (ex.name === 'Funnel') { funnel = JSON.stringify(c.counts); return; }
        assert(c.ok, ex.name + ': ' + JSON.stringify(c.counts));
        out.push(ex.name);
      });
      return out.length + ' clean; Funnel ' + funnel;
    });
    test('Check finds a zero-area polygon added to a CSG body (reported once, from the polygons or the welded mesh)', function () {
      var body = build('p.box(10, 10, 10);').body.clone();
      var p0 = body.polygons[0], v = p0.vertices;
      var sliver = new CSG.Polygon([v[0].clone(), v[1].clone(), new CSG.Vertex(v[0].pos.lerp(v[1].pos, 0.5), v[0].normal)], p0.shared);
      sliver.plane = p0.plane.clone();   // three collinear points define no plane of their own
      body.polygons.push(sliver);
      var r = EV.checkBody(body);
      assert(r.zeroAreaFaces.length === 1 && !r.ok, 'sliver flagged once: ' + r.zeroAreaFaces.length);
      near(r.zeroAreaFaces[0].area, 0, 1e-12, 'its area');
    });

    // ---- Zebra Stripes normals
    test('Zebra Stripes normals: a box keeps its face normals; a cylinder\'s side is smoothed radially (tangent facets blend) while its caps stay flat', function () {
      var b = build('p.box(10, 10, 10);'), n = EV.smoothNormals(b.mesh);
      for (var i = 0; i < b.mesh.normals.length; i++) near(n[i], b.mesh.normals[i], 1e-6, 'box normal ' + i);
      var c = build('p.cylinder(10, 30, { axis: "z" });'), m = EV.smoothNormals(c.mesh), P = c.mesh.positions, side = 0;
      c.mesh.faces.forEach(function (f) {
        for (var t = f.start; t < f.start + f.count; t++) for (var k = 0; k < 3; k++) {
          var o = t * 9 + k * 3;
          if (Math.abs(f.normal[2]) > 0.5) { near(m[o + 2], f.normal[2], 1e-6, 'cap'); continue; }
          var rr = Math.hypot(P[o], P[o + 1]);
          near(m[o], P[o] / rr, 1e-5, 'radial x'); near(m[o + 1], P[o + 1] / rr, 1e-5, 'radial y'); near(m[o + 2], 0, 1e-6, 'radial z');
          side++;
        }
      });
      assert(side > 0, 'side vertices');
    });
  })();

