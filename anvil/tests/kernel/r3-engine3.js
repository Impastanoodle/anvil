  // --- r3/engine3 ---
  (function () {
    var K = Kernel;
    function exMesh(name) {
      var ex = AnvilExamples.filter(function (e) { return e.name === name; })[0], m = K.newModel('T');
      K.runScript(m, ex.code);
      return K.meshFromBody(K.rebuild(m).body);
    }
    test('bodyEdges with the face-outline grid equals the all-pairs split on the Flange, Pulley, Mug and Spur gear (and is faster on the Flange)', function () {
      var out = [];
      ['Flange', 'Pulley', 'Mug', 'Spur gear (12 teeth)'].forEach(function (name) {
        var mesh = exMesh(name), keep = K.outlineOptions.gridMin, t0 = performance.now(), fast = K.bodyEdges(mesh), t1 = performance.now(), slow;
        K.outlineOptions.gridMin = Infinity;
        try { slow = K.bodyEdges(mesh); } finally { K.outlineOptions.gridMin = keep; }
        var t2 = performance.now();
        assert(JSON.stringify(fast) === JSON.stringify(slow), name + ': edges differ (' + fast.length + ' vs ' + slow.length + ')');
        out.push(name + ' ' + fast.length + ' edges ' + (t1 - t0).toFixed(0) + ' / ' + (t2 - t1).toFixed(0) + ' ms');
      });
      return out.join('; ');
    });
    test('CSG pack / unpack keeps B-rep face tags (OpenCascade bodies packed in the worker)', function () {
      var bm = K.newModel('T'); K.runScript(bm, 'p.box(10, 10, 10);'); var c = K.rebuild(bm).body;
      c.polygons.forEach(function (p, i) { if (i % 2) p.face = i * 3; });
      var u = CSG.unpack(c.pack());
      u.polygons.forEach(function (p, i) { assert(i % 2 ? p.face === i * 3 : p.face == null, 'polygon ' + i + ': face ' + p.face); });
      var bm2 = K.newModel('T'); K.runScript(bm2, 'p.box(10, 10, 10);'); var plain = K.rebuild(bm2).body.pack();
      assert(!plain.faces, 'no face array without face tags');
    });
    test('meshCurveInfo / analyticNormals (sent by the workers) match curveSurfaces and curveEdges on the Mug', function () {
      var mesh = exMesh('Mug'), info = K.meshCurveInfo(mesh), keyOf = new Map();
      K.curveSurfaces(mesh).forEach(function (s) { s.polys.forEach(function (p) { keyOf.set(p, s.key); }); });
      assert(info.faces === mesh.faces.length && info.faceSurfs.length === mesh.faces.length, 'one entry per face');
      mesh.faces.forEach(function (f, i) {
        var k0 = keyOf.get(f.polys[0]) || null;
        assert(info.key0[i] === k0, 'face ' + i + ' key0');
        f.polys.forEach(function (p) { var k = keyOf.get(p); if (k) assert(info.faceSurfs[i] && info.faceSurfs[i].indexOf(k) >= 0, 'face ' + i + ' surface list'); });
      });
      var ce = K.curveEdges(mesh);
      assert(info.curves.length === ce.length && info.curves.every(function (c, i) { return c.radius === ce[i].radius && c.chords.length === ce[i].chords.length; }), 'curves');
      var n = K.analyticNormals(mesh);
      assert(n.length === mesh.normals.length, 'normals length');
      var curved = 0;
      for (var i = 0; i < n.length; i++) if (Math.abs(n[i] - mesh.normals[i]) > 1e-6) curved++;
      assert(curved > 0, 'some corners take their surface normal');
      return info.curves.length + ' true curves, ' + curved + ' smooth normal components';
    });
  })();
  // --- end r3/engine3 ---
