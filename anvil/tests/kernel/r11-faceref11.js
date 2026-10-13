  // --- r11/faceref11 ---
  (function () {
    group('Face references follow their cap and pattern copies (r11/faceref11)');
    function byName(m, n) { return m.features.filter(function (f) { return f.name === n; })[0]; }
    function vol(b) { return K.massProps(K.meshFromBody(b.body), 1).volume; }
    function without(model, n) { var m = JSON.parse(JSON.stringify(model)); m.features = m.features.slice(0, n); return m; }
    // a sketch frame on the mesh face matching `pred`, with the face reference the UI stores (UI.facePlane)
    function pickRef(model, b, pred) {
      var mesh = K.meshFromBody(b.body), face = mesh.faces.filter(pred)[0];
      if (!face) throw new Error('no such face');
      var pl = K.tidyPlane(K.planeFromFace(face.normal, K.vec.scale(face.normal, face.w)));
      pl.face = K.faceRef(model, face.polys[0].shared, pl, b.planes);
      return pl;
    }
    function addPin(model, pl, cx, cy, r, d, name) {
      model.features.push({ id: model.nextId++, type: 'sketch', name: name, plane: pl, entities: [{ t: 'circle', cx: cx, cy: cy, r: r }] });
      model.features.push({ id: model.nextId++, type: 'extrude', name: name + ' boss', sketch: model.nextId - 2, depth: d, end: 'blind' });
    }
    function frame(pl) { return JSON.stringify([pl.origin, pl.x, pl.y, pl.n, pl.offset]); }

    test('reverse the extrude a face sketch is on: the sketch moves to the cap it was drawn on (normal and x flip), and back', function () {
      var r = build('var base = p.sketch("Top").rect(0, -40, 60, 40).extrude(10, { name: "Base" }).last();\n' +
        'p.sketch({ face: base, normal: [0, 1, 0] }, 0, "Top sketch").circle(30, -20, 5).extrude(5, { name: "Pin" });');
      noErrors(r);
      var sk = byName(r.model, 'Top sketch'), V = 24000 + Math.PI * 25 * 5;
      assert(sk.plane.face.cap === 'far', 'a round-10 style reference gets its cap at the first rebuild: ' + JSON.stringify(sk.plane.face));
      byName(r.model, 'Base').reverse = true;
      var b = K.rebuild(r.model, r.build.cache);
      assert(!Object.keys(b.errors).length && !Object.keys(b.warnings).length, JSON.stringify([b.errors, b.warnings]));
      near(b.body.getBounds().min[1], -15, 1e-9, 'the pin hangs under the reversed base');
      near(b.body.getBounds().max[1], 0, 1e-9, 'nothing above the sketch plane');
      assert(frame(sk.plane) === JSON.stringify([[0, -10, 0], [-1, 0, 0], [0, 0, -1], [0, -1, 0], 10]), JSON.stringify(sk.plane));
      nearRel(vol(b), V, 1e-9, 'volume');
      byName(r.model, 'Base').reverse = false;
      var b2 = K.rebuild(r.model, b.cache);
      assert(frame(sk.plane) === JSON.stringify([[0, 10, 0], [1, 0, 0], [0, 0, -1], [0, 1, 0], 10]), 'back on top exactly: ' + JSON.stringify(sk.plane));
      near(b2.body.getBounds().max[1], 15, 1e-9, 'pin on top again');
      nearRel(vol(b2), V, 1e-9, 'volume');
    });

    test('a sketch on the start cap ("near") stays on that cap when the extrude is reversed; a pocket floor follows the depth', function () {
      var r = build('p.sketch("Top").rect(0, -40, 60, 40).extrude(10, { name: "Base" });');
      var pl = pickRef(r.model, r.build, function (f) { return f.normal[1] < -0.9; });
      assert(pl.face.role === 'cap' && pl.face.cap === 'near' && pl.offset === 0, JSON.stringify(pl));
      addPin(r.model, pl, 30, -20, 4, 3, 'Under');
      var b = K.rebuild(r.model);
      near(b.body.getBounds().min[1], -3, 1e-9, 'hangs under');
      byName(r.model, 'Base').reverse = true;
      b = K.rebuild(r.model);
      // reversed, the start cap is the top face at y = 0 (normal +y): the pin stands on it
      near(b.body.getBounds().min[1], -10, 1e-9, 'base below');
      near(b.body.getBounds().max[1], 3, 1e-9, 'pin on the start cap, now facing up');
      nearRel(vol(b), 24000 + Math.PI * 16 * 3, 1e-9, 'volume');
      var c = build('p.box(40, 40, 20);\nvar pk = p.sketch("Top", 20).rect(10, -30, 20, 20).cut(6, { reverse: true }).last();\n' +
        'p.sketch({ face: pk, normal: [0, 1, 0] }, 0, "Floor").circle(20, -20, 4).extrude(3);');
      var fl = byName(c.model, 'Floor');
      assert(fl.plane.face.cap === 'far' && fl.plane.offset === 14, JSON.stringify(fl.plane));
      c.model.features.filter(function (f) { return f.type === 'extrude' && f.cut; })[0].depth = 9;
      K.rebuild(c.model);
      assert(fl.plane.offset === 11 && fl.plane.n[1] === 1, 'floor at 11: ' + JSON.stringify(fl.plane));
    });

    test('a face of a circular-pattern copy is a "cap" of the pattern (inst, local frame): it follows the seed depth and the pattern angle', function () {
      var r = build('p.sketch("Top").rect(-10, -10, 20, 20).extrude(10, { name: "Hub" });\n' +
        'var arm = p.sketch("Right").rect(-3, 2, 6, 6).extrude(40, { name: "Arm" }).last();\np.circularPattern({ feature: arm, axis: "y", count: 4, name: "CP" });');
      noErrors(r);
      var cp = byName(r.model, 'CP');
      var pl = pickRef(r.model, r.build, function (f) { return f.normal[2] < -0.9 && Math.abs(f.w - 40) < 1e-6; });
      assert(pl.face.feature === cp.id && pl.face.role === 'cap' && pl.face.cap === 'far' && pl.face.inst === 0 && pl.face.lx && pl.face.ln && pl.face.lo, JSON.stringify(pl.face));
      var n0 = r.model.features.length;
      addPin(r.model, pl, 0, 5, 2, 5, 'OnCopy');
      var sk = byName(r.model, 'OnCopy');
      var b = K.rebuild(r.model);
      assert(!Object.keys(b.warnings).length, JSON.stringify(b.warnings));
      nearRel(vol(b) - vol(K.rebuild(without(r.model, n0))), Math.PI * 4 * 5, 1e-9, 'pin on the copy');
      near(b.body.getBounds().min[2], -45, 1e-9, 'pin tip at z = -45');
      byName(r.model, 'Arm').depth = 45;
      b = K.rebuild(r.model);
      near(b.body.getBounds().min[2], -50, 1e-9, 'longer arm: pin tip at z = -50');
      assert(sk.plane.offset === 45 && JSON.stringify(sk.plane.n) === '[0,0,-1]', JSON.stringify(sk.plane));
      cp.n = 3;   // the first copy turns from 90° to 120°
      b = K.rebuild(r.model);
      assert(!Object.keys(b.warnings).length && !Object.keys(b.errors).length, JSON.stringify([b.errors, b.warnings]));
      var n = sk.plane.n;
      near(n[0], -0.5, 1e-12, 'n.x'); near(n[2], -Math.sqrt(3) / 2, 1e-12, 'n.z'); near(sk.plane.offset, 45, 1e-12, 'offset');
      near(K.vec.dot(sk.plane.x, n), 0, 1e-12, 'x in the plane');
      near(K.vec.dot(K.vec.cross(sk.plane.x, sk.plane.y), n), 1, 1e-12, 'right-handed');
      nearRel(vol(b) - vol(K.rebuild(without(r.model, n0))), Math.PI * 4 * 5, 1e-9, 'the pin is whole on the turned copy');
      return 'copy normal ' + n.map(function (x) { return fmt(x); }).join(', ');
    });

    test('a face of a linear-pattern copy moves with the copy (spacing); the copy gone -> Dangling, no error', function () {
      var r = build('p.sketch("Top").rect(0, -10, 100, 10).extrude(5, { name: "Bar" });\n' +
        'var post = p.sketch("Right").rect(-8, 6, 6, 6).extrude(10, { name: "Post" }).last();\np.linearPattern({ feature: post, dir: "x", spacing: 20, count: 4, name: "LP" });');
      var pl = pickRef(r.model, r.build, function (f) { return f.normal[0] > 0.9 && Math.abs(f.w - 50) < 1e-6; });
      assert(pl.face.inst === 1 && pl.face.feature === byName(r.model, 'LP').id, JSON.stringify(pl.face));
      addPin(r.model, pl, -5, 9, 1, 3, 'Side');
      var sk = byName(r.model, 'Side');
      K.rebuild(r.model);
      var o0 = sk.plane.origin.slice();
      byName(r.model, 'LP').s1 = 25;
      K.rebuild(r.model);
      assert(sk.plane.offset === 60 && JSON.stringify(sk.plane.origin) === JSON.stringify([o0[0] + 10, o0[1], o0[2]]), 'moved with the copy: ' + JSON.stringify(sk.plane));
      byName(r.model, 'LP').n1 = 2;
      var b = K.rebuild(r.model);
      assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
      assert(/Dangling/.test(b.warnings[sk.id] || ''), 'dangling: ' + JSON.stringify(b.warnings));
      assert(sk.plane.offset === 60, 'stays at its last position');
      return b.warnings[sk.id];
    });

    test('a face of a mirror copy follows the seed depth and the mirror plane; the script round trip keeps the copy reference', function () {
      var r = build('p.sketch("Top").rect(-5, -10, 10, 10).extrude(5, { name: "Bar" });\n' +
        'var lug = p.sketch("Right", 10).rect(-8, 0, 6, 10).extrude(10, { name: "Lug" }).last();\np.mirror("Right", { feature: lug, name: "M" });');
      noErrors(r);
      var pl = pickRef(r.model, r.build, function (f) { return f.normal[0] < -0.9 && Math.abs(f.w - 20) < 1e-6; });
      assert(pl.face.feature === byName(r.model, 'M').id && pl.face.inst === 0, JSON.stringify(pl.face));
      addPin(r.model, pl, 5, 5, 1.5, 2, 'OnMirror');
      var sk = byName(r.model, 'OnMirror');
      var b = K.rebuild(r.model);
      near(b.body.getBounds().min[0], -22, 1e-9, 'pin out to x = -22');
      byName(r.model, 'Lug').depth = 15;
      b = K.rebuild(r.model);
      near(b.body.getBounds().min[0], -27, 1e-9, 'deeper lug: pin out to x = -27');
      byName(r.model, 'M').offset = -5;   // mirror plane x = -5: the copy's end at -10 - 25 = -35
      b = K.rebuild(r.model);
      near(sk.plane.offset, 35, 1e-12, 'offset ' + sk.plane.offset);
      var s1 = K.generateScript(r.model);
      assert(/"inst":0,"lo":\[[^\]]*\],"lx":\[[^\]]*\],"ln":\[[^\]]*\]/.test(s1), s1);
      var m2 = K.newModel('RT'); K.runScript(m2, s1);
      nearRel(vol(K.rebuild(m2)), vol(b), 1e-12, 'same volume after the round trip');
      byName(m2, 'Lug').depth = 10;
      near(K.rebuild(m2).body.getBounds().min[0], -32, 1e-9, 'round-tripped model still follows the copy');
    });
  })();
  // --- end r11/faceref11 ---
