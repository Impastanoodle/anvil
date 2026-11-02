  // --- rfGM (2026-11-02, lane perforated) --- many holes through one plate are cut on the plate's caps, not by a boolean
  // (kernel-curves.js plateCut), and massProps / sketchProfile no longer go quadratic. Same part as the boolean: closed form
  // volume and area, closed mesh, one true cylinder per hole. Anything but plain holes through one plate takes the boolean.
  (function () {
    group('rfGM: perforated plates: closed form volume and area, closed, true cylinders; everything else takes the boolean');
    function eq(a, b, msg) { assert(a === b, (msg || 'equal') + ': ' + a + ' / ' + b); }
    function rfGMholes(n, hex) {
      var code = 'p.units("in");\np.sketch("Front").rect(0, 0, 24, 12).extrude(0.125);\nvar s = p.sketch("Front", 0.125);\n', c = 0;
      for (var j = 0; c < n; j++) for (var i = 0; i < 40 && c < n; i++, c++) code += 's.circle(' + (0.6 + 0.45 * i + (hex && j % 2 ? 0.1875 : 0)) + ', ' + (0.6 + (hex ? 0.26 : 0.45) * j) + ', 0.125);\n';
      return code;
    }
    function rfGMbuild(code) {
      var m = Kernel.newModel('rfGM');
      Kernel.runScript(m, code);
      Kernel.plateOptions.last = null;
      var b = Kernel.rebuild(m);
      return { m: m, b: b, used: Kernel.plateOptions.last };
    }
    var THROUGH = 's.cut("through", { reverse: true });\n';
    function rfGMcheck(r, n, name) {
      assert(!Object.keys(r.b.errors).length, name + ': no errors');
      var mesh = Kernel.meshFromBody(r.b.body), mp = Kernel.massProps(mesh, 1), a = 288 - n * Math.PI / 64;
      nearRel(mp.volume, a * 0.125, 1e-11, name + ': volume');
      nearRel(mp.area, 2 * a + 9 + n * 2 * Math.PI * 0.015625, 1e-9, name + ': area');
      eq(Exchange.bodyMesh(r.b.body).openEdges, 0, name + ': closed');
    }
    test('200 holes on a square pitch: no boolean, closed form, same faces as the boolean', function () {
      var code = rfGMholes(200) + THROUGH, r = rfGMbuild(code);
      assert(r.used && r.used.holes === 200, 'the plate path ran');
      rfGMcheck(r, 200, 'plate');
      Kernel.plateOptions.on = false;
      var old;
      try { old = rfGMbuild(code); } finally { Kernel.plateOptions.on = true; }
      assert(!old.used, 'switched off: the boolean');
      eq(Kernel.meshFromBody(r.b.body).faces.length, Kernel.meshFromBody(old.b.body).faces.length, 'face count = the boolean\'s');
      var mp = Kernel.massProps(Kernel.meshFromBody(r.b.body), 1), mo = Kernel.massProps(Kernel.meshFromBody(old.b.body), 1);
      nearRel(mp.volume, mo.volume, 1e-9, 'volume = the boolean\'s');
      for (var k = 0; k < 3; k++) near(mp.centroid[k], mo.centroid[k], 1e-8, 'centroid ' + k);
    });
    test('every hole wall keeps its cylinder record, facing into the hole', function () {
      var r = rfGMbuild(rfGMholes(100) + THROUGH), n = 0, bad = 0;
      r.b.body.polygons.forEach(function (p) {
        if (!p.surf) return;
        n++;
        var S = p.surf.s, q = p.vertices[0].pos, nn = p.plane.normal;
        if (S.t !== 'cyl' || Math.abs(S.r - 0.125) > 1e-12) bad++;
        var dx = q.x - S.o[0], dy = q.y - S.o[1];
        if (dx * nn.x + dy * nn.y >= 0) bad++;   // the facet's normal points at the axis
      });
      assert(n >= 800, 'hole walls carry records: ' + n);
      eq(bad, 0, 'true cylinders, material outside');
    });
    test('a hexagonal pitch whose boxes overlap: apart, so no union per hole', function () {
      var r = rfGMbuild(rfGMholes(120, true) + THROUGH);
      assert(r.used, 'the plate path ran');
      rfGMcheck(r, 120, 'hex');
    });
    test('a second perforation next to the first', function () {
      var code = rfGMholes(100) + THROUGH + 'var t = p.sketch("Front", 0.125);\n';
      for (var i = 0; i < 80; i++) code += 't.circle(' + (0.6 + 0.28 * i) + ', 11.4, 0.125);\n';
      var r = rfGMbuild(code + 't.cut("through", { reverse: true });\n');
      assert(r.used && r.used.holes === 80, 'the plate path ran again');
      rfGMcheck(r, 180, 'second cut');
    });
    test('the boolean still takes what is not a plain plate', function () {
      // a hole over the plate's edge
      var r = rfGMbuild(rfGMholes(80) + 's.circle(23.95, 6, 0.125);\n' + THROUGH);
      assert(!r.used, 'hole across an edge: boolean');
      assert(!Object.keys(r.b.errors).length, 'it builds');
      // holes off the plate altogether
      r = rfGMbuild(rfGMholes(80) + 's.circle(40, 6, 0.125);\n' + THROUGH);
      assert(!r.used, 'hole in air: boolean');
      // a boss in a hole's column
      var code = 'p.units("in");\np.sketch("Front").rect(0, 0, 24, 12).extrude(0.125);\np.sketch("Front", 0.125).rect(0.5, 0.5, 1, 1).end().extrude(0.5);\nvar s = p.sketch("Front", 0.125);\n';
      for (var i = 0; i < 80; i++) code += 's.circle(' + (0.6 + 0.28 * i) + ', 0.9, 0.125);\n';
      r = rfGMbuild(code + THROUGH);
      assert(!r.used, 'boss in the way: boolean');
      // a blind cut, and few holes
      r = rfGMbuild(rfGMholes(80) + 's.cut(0.05, { reverse: true });\n');
      assert(!r.used, 'blind cut: boolean');
      r = rfGMbuild(rfGMholes(10) + THROUGH);
      assert(!r.used, 'ten holes: boolean, as ever');
    });
    test('sketchProfile: seg indices point at each loop\'s own circle', function () {
      var m = Kernel.newModel('rfGM');
      Kernel.runScript(m, rfGMholes(100) + THROUGH);
      var sk = m.features.filter(function (f) { return f.type === 'sketch'; })[1], pr = Kernel.sketchProfile(sk), bad = 0;
      pr.loops.forEach(function (l) {
        l.seg.forEach(function (k, i) {
          var C = pr.curves[k], q = l.pts[i];
          if (k < 0 || Math.abs(Math.hypot(q[0] - C.c[0], q[1] - C.c[1]) - C.r) > 1e-7) bad++;
        });
      });
      eq(pr.loops.length, 100, 'loops');
      eq(bad, 0, 'every chord on its circle');
    });
  })();
