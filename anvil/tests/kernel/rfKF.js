  // --- rfKF (2026-11-09, lane cammate) --- SolidWorks 2024 Mechanical Mates Cam and Universal Joint: a disc cam (an
  // eccentric circle; a lobed profile of four tangent arcs) turned on its axis by an Angle mate drives a follower held to
  // a vertical line (a knife-edge vertex, a roller, a flat face) to the analytic lift at 0, 60, 90 and 180 degrees; a
  // dragged cam lifts its follower; save / script round trips; refusals. Two shafts 30 degrees apart on a Universal
  // Joint follow the Cardan relation tan(b) = tan(a) cos(30); Define joint point makes the axes meet (at a vertex).
  (function () {
    group('rfKF: Cam and Universal Joint mates');
    if (typeof Assembly === 'undefined') { test('assembly.js loads', function () { fail('Assembly is not defined'); }); return; }
    var AS = Assembly, D = Math.PI / 180;
    function noErr(b) { var ids = Object.keys(b.errors); if (ids.length) fail('assembly errors: ' + ids.map(function (id) { return id + ': ' + b.errors[id]; }).join(' | ')); }
    function T(m, id) { return AS.findComponent(m, id).transform; }
    function st(b, id) { return b.components.filter(function (c) { return c.id === id; })[0]; }
    function mv(R, v) { return [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]]; }
    function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function sang(p, q, k) { return Math.atan2(dot(k, cross(p, q)), dot(p, q)); }

    // ---- the cams (sketched on Front, 10 thick along +z, turning about the z axis)
    // eccentric: a 20 radius circle 6 off the axis
    var ECC = 'p.name("Eccentric"); p.sketch("Front").circle(6, 0, 20).end().extrude(10);';
    // lobed: base circle R0 20 about the axis, nose circle 8 at (0, 22), flanks of radius 60 tangent to both
    var R0 = 20, ND = 22, RN = 8, RF = 60;
    var fy = (Math.pow(RF - R0, 2) - Math.pow(RF - RN, 2) + ND * ND) / (2 * ND), fx = Math.sqrt(Math.pow(RF - R0, 2) - fy * fy);
    var a1 = Math.atan2(-fy, fx) / D, a2 = Math.atan2(ND - fy, fx) / D;   // the right flank (centre (-fx, fy)): from the base to the nose
    var ARCS = [[0, 0, R0, 180 - a1, 360 + a1], [-fx, fy, RF, a1, a2], [0, ND, RN, a2, 180 - a2], [fx, fy, RF, 180 - a2, 180 - a1]];
    var LOBE = 'p.name("Lobe"); p.sketch("Front")' + ARCS.map(function (a) { return '.arc(' + a.join(', ') + ')'; }).join('') + '.end().extrude(10);';
    function inSpan(ang, a0, a1) { if (a1 - a0 >= 360) return true; var x = ((ang - a0) % 360 + 360) % 360; return x <= ((a1 - a0) % 360 + 360) % 360 + 1e-9; }
    // the lift of a follower on the line x = 0 (pointing +y) over a cam turned phi about +z: in the cam's frame the line
    // runs along w = (sin phi, cos phi); a knife edge (r 0) or roller (radius r) meets the profile offset by r, a flat
    // face touches its support along w
    function lift(arcs, phi, kind, r) {
      var w = [Math.sin(phi), Math.cos(phi)], out = null;
      arcs.forEach(function (a) {
        var c = [a[0], a[1]], cw = c[0] * w[0] + c[1] * w[1], v;
        if (kind === 'flat') { if (inSpan(Math.atan2(w[1], w[0]) / D, a[3], a[4])) v = cw + a[2]; }
        else {
          var R = a[2] + (r || 0), disc = R * R - (c[0] * c[0] + c[1] * c[1]) + cw * cw;
          if (disc >= 0) { var t = cw + Math.sqrt(disc); if (inSpan(Math.atan2(t * w[1] - c[1], t * w[0] - c[0]) / D, a[3], a[4])) v = t; }
        }
        if (v != null && (out == null || v > out)) out = v;
      });
      return out;
    }
    var ECC_ARCS = [[6, 0, 20, 0, 360]];
    // a fixed frame, the cam on the assembly's Z axis turned by an Angle mate, a follower held to x = 0, z = 0 above it
    var KNIFE = { script: 'p.name("Knife"); p.box(2, 2, 40);' }, ROLLER = { script: 'p.name("Roller"); p.cylinder(4, 2, { axis: "z" });' },
      FLAT = { script: 'p.name("Tappet"); p.box(20, 2, 40, { at: [-10, 0, 0] });' };
    function camRig(src, follower, fref, angleMate) {
      var m = AS.newAssembly();
      AS.insert(m, { script: 'p.name("Frame"); p.box(10, 10, 10);' }, { fixed: true, position: [100, 0, 0] });
      var cam = AS.insert(m, { script: src }).id, f = AS.insert(m, follower, { position: [0, 50, 0] }).id;
      AS.addMate(m, 'concentric', { axis: 'z' }, { component: cam, axis: 'z' });
      AS.addMate(m, 'coincident', { plane: 'Front' }, { component: cam, plane: 'Front' });
      var ang = angleMate === false ? null : AS.addMate(m, 'angle', { plane: 'Right' }, { component: cam, plane: 'Right' }, { angle: 0 });
      AS.addMate(m, 'coincident', { plane: 'Right' }, { component: f, plane: 'Right' });
      AS.addMate(m, 'coincident', { plane: 'Front' }, { component: f, plane: 'Front' });
      fref.component = f;
      var mt = AS.addMate(m, 'cam', { component: cam, cylinder: src === ECC ? [6, -20, 5] : [0, -R0, 5] }, fref);
      var b = AS.rebuild(m);
      noErr(b);
      return { m: m, b: b, cam: cam, f: f, ang: ang, mt: mt };
    }
    function turnOf(s) { var R = T(s.m, s.cam).rotation; return Math.atan2(R[3], R[0]); }
    function sweep(s, arcs, kind, r, label) {
      [0, 60, 90, 180].forEach(function (deg) {
        s.ang.angle = deg; s.b = AS.rebuild(s.m, s.b.cache); noErr(s.b);
        var phi = turnOf(s);
        near(Math.abs(phi), deg * D, 1e-9, label + ': the cam turned ' + deg);
        near(T(s.m, s.f).position[1], lift(arcs, phi, kind, r), 1e-6, label + ': lift at ' + deg + ' degrees');
        var p = T(s.m, s.f).position;
        near(p[0], 0, 1e-9, label + ': on its line (x)'); near(p[2], 0, 1e-9, label + ': on its line (z)');
      });
    }
    test('rfKF: Cam: an eccentric disc turned 0 / 60 / 90 / 180 degrees lifts a knife-edge follower (a vertex) to the analytic lift; CamMateCoincident1, fully defined', function () {
      var s = camRig(ECC, KNIFE, { vertex: [0, 0, 0] });
      assert(s.mt.name === 'CamMateCoincident1' && s.mt.type === 'cam' && !s.mt.alignment && !AS.hasAlignment(s.mt), JSON.stringify(s.mt));
      near(T(s.m, s.f).position[1], Math.sqrt(400 - 36), 1e-9, 'came down onto the cam top');
      assert(st(s.b, s.f).dof === 0 && st(s.b, s.cam).dof === 0, 'dof ' + st(s.b, s.f).dof + ' / ' + st(s.b, s.cam).dof);
      sweep(s, ECC_ARCS, 'knife', 0, 'eccentric');
      near(lift(ECC_ARCS, 90 * D, 'knife', 0), 26, 1e-12, 'the analytic lift itself (90 degrees: 6 + 20)');
    });
    test('rfKF: Cam: a lobed cam of four tangent arcs drives a knife edge, a roller (CamMateTangent) and a flat follower to their analytic lifts (nose, flank, base)', function () {
      near(lift(ARCS, 0, 'knife', 0), ND + RN, 1e-12, 'nose'); near(lift(ARCS, 180 * D, 'knife', 0), R0, 1e-12, 'base');
      var k = camRig(LOBE, KNIFE, { vertex: [0, 0, 0] });
      sweep(k, ARCS, 'knife', 0, 'knife edge');
      var r = camRig(LOBE, ROLLER, { cylinder: [4, 0, 1] });
      assert(r.mt.name === 'CamMateTangent1', r.mt.name);
      sweep(r, ARCS, 'roller', 4, 'roller');
      var f = camRig(LOBE, FLAT, { face: [0, 0, 1] });
      sweep(f, ARCS, 'flat', 0, 'flat follower');
      assert(Math.abs(lift(ARCS, 60 * D, 'knife', 0) - lift(ARCS, 60 * D, 'flat', 0)) > 0.1, 'at 60 degrees the flank: a knife edge and a flat face differ');
    });
    test('rfKF: Cam: with no Angle mate the cam turns free; dragging its rim a quarter turn lifts the follower to the lift of the turn it took (1 DOF)', function () {
      var s = camRig(ECC, KNIFE, { vertex: [0, 0, 0] }, false);
      assert(st(s.b, s.cam).dof === 1, 'dof ' + st(s.b, s.cam).dof);
      for (var i = 1; i <= 6; i++) {
        var a = 15 * i * D;
        s.b = AS.rebuild(s.m, s.b.cache, { drag: { id: s.cam, point: [26, 0, 5], target: [6 * Math.cos(a) + 20 * Math.cos(a), 26 * Math.sin(a), 5] } });
        noErr(s.b);
      }
      var phi = turnOf(s);
      near(phi, 90 * D, 1e-3, 'dragged a quarter turn');
      near(T(s.m, s.f).position[1], lift(ECC_ARCS, phi, 'knife', 0), 1e-6, 'the follower rides on the cam');
    });
    test('rfKF: Cam: JSON and script round trips keep the cam path and follower (vertex ref) and the follower holds its place', function () {
      var s = camRig(LOBE, ROLLER, { cylinder: [4, 0, 1] });
      s.ang.angle = 60; s.b = AS.rebuild(s.m, s.b.cache); noErr(s.b);
      var y = T(s.m, s.f).position[1];
      var j = JSON.parse(JSON.stringify(s.m)), bj = AS.rebuild(j); noErr(bj);
      near(T(j, s.f).position[1], y, 1e-9, 'JSON: holds its place');
      var k = camRig(ECC, KNIFE, { vertex: [0, 0, 0] }), sc = AS.generateScript(k.m);
      assert(/a\.mate\("cam", \{ component: c\d+, cylinder: \[6, -20, 5\] \}, \{ component: c\d+, vertex: \[0, 0, 0\] \}/.test(sc), sc);
      var m2 = AS.newAssembly(); AS.runScript(m2, sc); var b2 = AS.rebuild(m2); noErr(b2);
      var x = m2.mates[5];
      assert(x.type === 'cam' && x.name === 'CamMateCoincident1' && x.b.vertex && x.a.cylinder, JSON.stringify(x));
      near(m2.components[2].transform.position[1], Math.sqrt(400 - 36), 1e-9, 'script: holds its place');
      assert(AS.isAssemblyScript('a.cam(p, f);') && AS.isAssemblyScript('a.universalJoint(s1, s2);'), 'script calls');
      var m3 = AS.newAssembly();
      AS.runScript(m3, 'var c = a.insert({ script: ' + JSON.stringify(ECC) + ' }, { fixed: true }); var k = a.insert(' + JSON.stringify(KNIFE) + ', { position: [0, 50, 0] });' +
        ' a.coincident({ plane: "Right" }, { component: k, plane: "Right" }); a.coincident({ plane: "Front" }, { component: k, plane: "Front" });' +
        ' a.cam({ component: c, cylinder: [6, -20, 5] }, { component: k, vertex: [0, 0, 0] });');
      noErr(AS.rebuild(m3));
      near(m3.components[1].transform.position[1], Math.sqrt(400 - 36), 1e-9, 'a.cam()');
    });
    test('rfKF: Cam refuses a face that is not a closed tangent loop, a vertex as the path, a vertex in another mate, and two picks on one part', function () {
      var m = AS.newAssembly(), bx = AS.insert(m, { script: 'p.box(40, 40, 10);' }, { fixed: true }).id, k = AS.insert(m, KNIFE, { position: [0, 50, 0] }).id;
      var e = AS.insert(m, { script: ECC }, { position: [0, 0, 30] }).id;
      var a = AS.addMate(m, 'cam', { component: bx, face: [40, 5, 20] }, { component: k, vertex: [0, 0, 0] });
      var b = AS.addMate(m, 'cam', { component: k, vertex: [0, 0, 0] }, { component: e, cylinder: [6, -20, 5] });
      var c = AS.addMate(m, 'coincident', { component: bx, face: [40, 5, 20] }, { component: k, vertex: [0, 0, 0] });
      var d = AS.addMate(m, 'cam', { component: e, cylinder: [6, -20, 5] }, { component: e, vertex: [6, 20, 0] });
      var r = AS.rebuild(m);
      assert(/closed loop of tangent faces/.test(r.errors[a.id] || ''), JSON.stringify(r.errors));
      assert(/the cam path must be a face/.test(r.errors[b.id] || ''), JSON.stringify(r.errors));
      assert(/cannot use a vertex/.test(r.errors[c.id] || ''), JSON.stringify(r.errors));
      assert(/on one component and the follower on another/.test(r.errors[d.id] || ''), JSON.stringify(r.errors));
    });

    // ---- Universal Joint: an input shaft on the assembly's Z axis turned by an Angle mate; the output shaft 30 degrees
    // off (about y), held in a fixed yoke bearing
    var BE = 30 * D, CB = Math.cos(BE), SB = Math.sin(BE), RY = [CB, 0, SB, 0, 1, 0, -SB, 0, CB], D2 = [SB, 0, CB];
    var YOKE = { script: 'p.name("Bearing"); p.cylinder(3, 4, { axis: "z", at: [0, 0, 20] });' }, IN = { script: 'p.name("Input"); p.cylinder(2, 20, { axis: "z", at: [0, 0, -30] });' },
      OUT = { script: 'p.name("Output"); p.cylinder(2, 20, { axis: "z", at: [0, 0, 26] });' };
    function ujRig(opts, outPos, parallelOnly) {
      var m = AS.newAssembly();
      var fr = AS.insert(m, YOKE, { fixed: true, rotation: RY }).id, a = AS.insert(m, IN).id, b = AS.insert(m, OUT, { rotation: RY, position: outPos || [0, 0, 0] }).id;
      AS.addMate(m, 'concentric', { axis: 'z' }, { component: a, cylinder: [2, 0, -20] });
      AS.addMate(m, 'coincident', { plane: 'Front' }, { component: a, plane: 'Front' });
      var ang = AS.addMate(m, 'angle', { plane: 'Right' }, { component: a, plane: 'Right' }, { angle: 0 });
      if (parallelOnly) AS.addMate(m, 'parallel', { component: fr, cylinder: [3, 0, 22] }, { component: b, cylinder: [2, 0, 30] });
      else {
        AS.addMate(m, 'concentric', { component: fr, cylinder: [3, 0, 22] }, { component: b, cylinder: [2, 0, 30] });
        AS.addMate(m, 'coincident', { component: fr, plane: 'Front' }, { component: b, plane: 'Front' });
      }
      if (opts && opts.a2) opts.a2.component = a;
      var uj = AS.addMate(m, 'universaljoint', { component: a, cylinder: [2, 0, -20] }, { component: b, cylinder: [2, 0, 30] }, opts);
      var r = AS.rebuild(m);
      noErr(r);
      return { m: m, b: r, a: a, o: b, ang: ang, uj: uj, x0a: mv(T(m, a).rotation, [1, 0, 0]), x0b: mv(T(m, b).rotation, [1, 0, 0]) };
    }
    function cardan(s, deg, label) {
      s.ang.angle = deg; s.b = AS.rebuild(s.m, s.b.cache); noErr(s.b);
      var A = sang(s.x0a, mv(T(s.m, s.a).rotation, [1, 0, 0]), [0, 0, 1]), B = sang(s.x0b, mv(T(s.m, s.o).rotation, [1, 0, 0]), mv(T(s.m, s.o).rotation, [0, 0, 1]));
      near(Math.abs(A), deg * D, 1e-9, label + ': input turned ' + deg);
      near(B, Math.atan2(Math.sin(A) * CB, Math.cos(A)), 1e-9, label + ': tan(b) = tan(a) cos 30 at ' + deg);
      return B;
    }
    test('rfKF: Universal Joint: shafts 30 degrees apart: the output turns by tan(b) = tan(a) cos(30) (1e-9) at 30, 60, 120, 170 degrees; UniversalJoint1, no alignment', function () {
      var s = ujRig();
      assert(s.uj.name === 'UniversalJoint1' && s.uj.phase && s.uj.phase.length === 2 && !AS.hasAlignment(s.uj), JSON.stringify(s.uj));
      assert(st(s.b, s.o).dof === 0, 'output driven: dof ' + st(s.b, s.o).dof);
      [30, 60, 120, 170].forEach(function (d) { cardan(s, d, 'yoke'); });
      near(cardan(s, 60, 'again') / D, Math.atan(Math.tan(60 * D) * CB) / D, 1e-7, '60 degrees in gives 56.31 out');
      var m2 = JSON.parse(JSON.stringify(s.m)), r2 = AS.rebuild(m2); noErr(r2);
      near(sang(mv(T(s.m, s.o).rotation, [1, 0, 0]), mv(T(m2, s.o).rotation, [1, 0, 0]), D2), 0, 1e-9, 'JSON round trip holds the output turn');
      var sc = AS.generateScript(s.m), m3 = AS.newAssembly(); AS.runScript(m3, sc); noErr(AS.rebuild(m3));
      assert(/a\.mate\("universaljoint"/.test(sc) && m3.mates[5].type === 'universaljoint' && m3.mates[5].phase.length === 2, sc);
    });
    test('rfKF: Universal Joint: Define joint point makes the axes meet (an output shaft set off 3, 2, 1), at a vertex when one is given; the Cardan relation still holds', function () {
      var s = ujRig({ jointPoint: true }, [3, 2, 1], true), p = T(s.m, s.o).position, d = mv(T(s.m, s.o).rotation, [0, 0, 1]);
      assert(s.uj.jointPoint === true && !s.uj.a2, JSON.stringify(s.uj));
      var c = cross([0, 0, 1], d), lc = Math.sqrt(dot(c, c));
      near(dot(p, c) / lc, 0, 1e-9, 'the axes meet');
      cardan(s, 60, 'joint');
      var v = ujRig({ jointPoint: true, a2: { vertex: [0, 0, -10] } }, [3, 2, 1], true), q = T(v.m, v.o).position, dv = mv(T(v.m, v.o).rotation, [0, 0, 1]);
      var w = [0 - q[0], 0 - q[1], -10 - q[2]], perp = [w[0] - dv[0] * dot(w, dv), w[1] - dv[1] * dot(w, dv), w[2] - dv[2] * dot(w, dv)];
      near(Math.sqrt(dot(perp, perp)), 0, 1e-9, 'the output axis passes through the joint point (0, 0, -10)');
      cardan(v, 120, 'joint vertex');
      var sc = AS.generateScript(v.m);
      assert(/jointPoint: true/.test(sc) && /a2: \{ component: c\d+, vertex: \[0, 0, -10\] \}/.test(sc), sc);
      var m2 = AS.newAssembly(); AS.runScript(m2, sc); noErr(AS.rebuild(m2));
      assert(m2.mates[4].jointPoint === true && m2.mates[4].a2.vertex[2] === -10, JSON.stringify(m2.mates[4]));
      AS.setMateValues(m2.mates[4], { jointPoint: false });
      assert(!m2.mates[4].jointPoint && !m2.mates[4].a2, 'Define joint point off drops the point');
    });
    test('rfKF: Universal Joint refuses an edge and a planar face; the Mechanical Mates list is complete in SolidWorks 2024 order', function () {
      var m = AS.newAssembly(), a = AS.insert(m, IN, { fixed: true }).id, b = AS.insert(m, OUT, { rotation: RY }).id;
      var x = AS.addMate(m, 'universaljoint', { component: a, edge: [[0, 0, 0], [0, 0, 1]] }, { component: b, cylinder: [2, 0, 30] });
      var y = AS.addMate(m, 'universaljoint', { component: a, cylinder: [2, 0, -20] }, { component: b, face: [0, 0, 46] });
      var r = AS.rebuild(m);
      assert(/Universal Joint needs two cylindrical faces or axes/.test(r.errors[x.id] || '') && /Universal Joint needs two cylindrical faces or axes/.test(r.errors[y.id] || ''), JSON.stringify(r.errors));
      assert(AS.MATE_GROUPS.mechanical.join() === 'cam,slot,hinge,gear,rackpinion,screw,universaljoint', AS.MATE_GROUPS.mechanical.join());
      assert(AS.MATE_NAMES.cam === 'CamMateTangent' && AS.MATE_NAMES.universaljoint === 'UniversalJoint', 'names');
    });
  })();
