  // --- rfMN (2026-11-13, lane stepwrite) --- Anvil's STEP writer on imported parts and on holes that cross a curved face.
  // (1) A flat face of an imported part whose points carry the file's rounding (6 decimals, plus noise here) fell into
  //     several of fanPolygons' rounded plane keys and was written as dozens of PLANE faces (a 4 x 3 plate with three
  //     holes: 142 planes for 8), its hole walls partly as facets. The writer now joins the mesh faces of one flat face
  //     (sharing an edge, every point within planeTolOf of their least-squares plane) and names a circle / ruling to the
  //     file's rounding: read -> write -> read -> write keeps the source's face counts.
  // (2) A hole wall that is a whole cylinder cut by another cylinder (a hole through a bend, a cross-drilled tube) went to
  //     facets, and with it the bend. Its points move to the true intersection, the curve is a cubic through them on both
  //     cylinders, and the wall is one CYLINDRICAL_SURFACE face cut open along a seam.
  (function () {
    group('rfMN: STEP writer: a noisy imported plane is one PLANE face, a hole wall cut by a cylinder is a cylinder');
    var X = typeof Exchange !== 'undefined' ? Exchange : null;
    function rfMNneedX() { if (!X) fail('exchange.js is not loaded'); }
    function rfMNcount(s, k) { return (s.match(new RegExp('=' + k + '\\(', 'g')) || []).length; }
    function rfMNfaces(s) { return ['ADVANCED_FACE', 'PLANE', 'CYLINDRICAL_SURFACE'].map(function (k) { return rfMNcount(s, k); }).join(' / '); }
    function rfMNpart(code) { var m = K.newModel('rfMN'); K.runScript(m, 'p.units("in");\n' + code); var b = K.rebuild(m); noErrors({ errors: b.errors }); return { model: m, build: b, volume: K.massProps(K.meshFromBody(b.body)).volume }; }
    function rfMNread(s) {
      var r = X.importFile('rfMN.step', s, { units: 'in' }), m = X.newPartFromImport(r), b = K.rebuild(m);
      assert(!r.stats.openEdges, 'reads closed: ' + r.stats.openEdges + ' open edges');
      if (typeof Evaluate !== 'undefined') assert(Evaluate.checkBody(b.body, { maxPairs: 1 }).ok, 'a closed solid');
      return { model: m, build: b, volume: K.massProps(K.meshFromBody(b.body)).volume, step: X.exportSTEP(m, b) };
    }
    // every CARTESIAN_POINT to 6 decimals plus seeded noise up to +-5e-7
    function rfMNnoisy(s, seed) {
      function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
      return s.replace(/CARTESIAN_POINT\('',\(([^)]*)\)\)/g, function (all, xs) {
        return 'CARTESIAN_POINT(\'\',(' + xs.split(',').map(function (x) { return (Math.round(+x * 1e6) / 1e6 + (rnd() * 2 - 1) * 5e-7).toFixed(7); }).join(',') + '))';
      });
    }
    // the shortest edge between two different vertices
    function rfMNshortest(s) {
      var E = {};
      s.split('\n').forEach(function (l) { var m = /^#(\d+)=(.*);$/.exec(l); if (m) E[m[1]] = m[2]; });
      function vp(id) { var cp = /VERTEX_POINT\('',#(\d+)\)/.exec(E[id.slice(1)])[1]; return /\(([^()]*)\)\)$/.exec(E[cp])[1].split(',').map(Number); }
      var min = Infinity;
      Object.keys(E).forEach(function (k) {
        var m = /^EDGE_CURVE\('',(#\d+),(#\d+),/.exec(E[k]);
        if (m && m[1] !== m[2]) { var a = vp(m[1]), b = vp(m[2]); min = Math.min(min, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])); }
      });
      return min;
    }
    var rfMNbracket = 'p.sheet(0.06, 0.25, 0.44);\np.sketch("Top").rect(0, -4, 2, 4).end().baseFlange();\np.flange(2, [[0, 0.06, 2], [2, 0.06, 2]], { position: "inside" });\n';

    [['a plate with three holes and a slot', 'p.sketch("Top").rect(0, 0, 4, 3).circle(1, 1, 0.25).circle(3, 2, 0.125).slot(1, 2.2, 2.5, 2.2, 0.1).end().extrude(0.25);\n', 4],
     ['a bent channel with a hole in the base', rfMNbracket + 'p.sketch("Top").circle(1, -2, 0.25).end().extrude(1, { cut: true, through: true, both: true });\n', 4]].forEach(function (c) {
      test('rfMN: ' + c[0] + ', its STEP rounded to 6 decimals with noise up to 5e-7 (seeds 1, 2, 3), imported and written again: as many PLANE and cylinder faces as the source (was: dozens of planes, hole walls as facets), no edge shorter than 1e-5 x the part, reads back closed to 1e-6, and the second round trip writes the same', function () {
        rfMNneedX();
        var src = rfMNpart(c[1]), s0 = X.exportSTEP(src.model, src.build), out = [];
        [1, 2, 3].forEach(function (seed) {
          var a = rfMNread(rfMNnoisy(s0, seed * 7919)), b = rfMNread(a.step);
          assert(rfMNfaces(a.step) === rfMNfaces(s0), 'seed ' + seed + ': faces (all / planes / cylinders) ' + rfMNfaces(a.step) + ', source ' + rfMNfaces(s0));
          assert(rfMNfaces(b.step) === rfMNfaces(s0), 'seed ' + seed + ': second write ' + rfMNfaces(b.step));
          var sh = rfMNshortest(a.step);
          assert(sh > 1e-5 * c[2], 'seed ' + seed + ': shortest edge ' + sh);
          nearRel(b.volume, a.volume, 1e-6, 'seed ' + seed + ': read-back volume');
          nearRel(a.volume, src.volume, 1e-5, 'seed ' + seed + ': the noisy file\'s volume');
          out.push(((b.volume - a.volume) / a.volume).toExponential(1));
        });
        return 'faces ' + rfMNfaces(s0) + ', read back ' + out.join(' ');
      });
    });

    test('rfMN: Anvil\'s own exact parts write the same text as before the plane joining (a face alone keeps its plane): the exported plate has its 8 planes at whole numbers', function () {
      rfMNneedX();
      var src = rfMNpart('p.sketch("Top").rect(0, 0, 4, 3).circle(1, 1, 0.25).end().extrude(0.25);\n'), s = X.exportSTEP(src.model, src.build);
      assert(rfMNfaces(s) === '9 / 8 / 1' || rfMNfaces(s) === '7 / 6 / 1', 'faces ' + rfMNfaces(s));
      assert(!/DIRECTION\('',\([^)]*e-/.test(s), 'no direction carries a rounding residue');
      return rfMNfaces(s);
    });

    // ---- (2) hole walls cut by another cylinder
    function rfMNtubeVolume(R, r0, h, rh) {
      // the tube R / r0, length h, less a hole rh across it: the hole's chunk of the wall by quadrature (x across the hole)
      var N = 20000, s = 0;
      for (var i = 0; i < N; i++) { var t = -Math.PI / 2 + (i + 0.5) * Math.PI / N, x = rh * Math.sin(t), dx = rh * Math.cos(t) * Math.PI / N; s += 2 * Math.sqrt(rh * rh - x * x) * (Math.sqrt(R * R - x * x) - Math.sqrt(r0 * r0 - x * x)) * dx; }
      return Math.PI * (R * R - r0 * r0) * h - 2 * s;
    }
    var rfMNholes = [
      ['a hole drilled straight through a bend (Base Flange, Edge Flange, Cut-Extrude through all)', rfMNbracket + 'p.sketch("Top").circle(0.155, -2, 0.08).end().extrude(1, { cut: true, through: true, both: true });\n', 5, null],
      ['the same hole as a Normal Cut (its walls square to the sheet: ruled wall faces, not cylinders; the bends stay whole)', rfMNbracket + 'p.sketch("Top", 1).circle(0.155, -2, 0.08).cut("through", { reverse: true, normalCut: true });\n', 4, null, true],
      ['a tube with a cross-drilled hole', 'p.sketch("Top").circle(0, 0, 0.5).circle(0, 0, 0.4).end().extrude(2);\np.sketch("Front").circle(0, 1, 0.15).end().extrude(1, { cut: true, through: true, both: true });\n', 4, function () { return rfMNtubeVolume(0.5, 0.4, 2, 0.15); }]
    ];
    rfMNholes.forEach(function (c) {
      test('rfMN: ' + c[0] + (c[4] ? ': both bends stay cylinders, reads back closed to 1e-8, and after an import the bends are still cylinders (its ruled walls come back as facets, as before this lane)' : ': every hole wall a CYLINDRICAL_SURFACE face (was: facets, and the bend with it), its saddle edges B-spline curves on both cylinders, reads back closed to 1e-8; exported, imported and exported again it keeps them'), function () {
        rfMNneedX();
        var src = rfMNpart(c[1]), s0 = X.exportSTEP(src.model, src.build);
        if (c[3]) nearRel(src.volume, c[3](), 1e-7, 'Anvil\'s volume against the closed form');
        assert(rfMNcount(s0, 'CYLINDRICAL_SURFACE') === c[2], 'cylinders: ' + rfMNfaces(s0));
        if (!c[4]) assert(rfMNcount(s0, 'B_SPLINE_CURVE_WITH_KNOTS') >= 4, 'saddle edges as curves: ' + rfMNcount(s0, 'B_SPLINE_CURVE_WITH_KNOTS'));
        var a = rfMNread(s0);
        nearRel(a.volume, src.volume, 1e-8, 'read-back volume');
        if (c[4]) { assert(rfMNcount(a.step, 'CYLINDRICAL_SURFACE') === c[2], 'after an import: faces ' + rfMNfaces(a.step)); return 'faces ' + rfMNfaces(s0) + ', back ' + ((a.volume - src.volume) / src.volume).toExponential(1) + ', after an import ' + rfMNfaces(a.step); }
        assert(rfMNfaces(a.step) === rfMNfaces(s0), 'after an import: faces ' + rfMNfaces(a.step) + ', source ' + rfMNfaces(s0));
        var b = rfMNread(a.step);
        nearRel(b.volume, src.volume, 1e-8, 'second read-back volume');
        return 'faces ' + rfMNfaces(s0) + ', back ' + ((a.volume - src.volume) / src.volume).toExponential(1) + ' / ' + ((b.volume - src.volume) / src.volume).toExponential(1);
      });
    });
  })();
  // --- end rfMN ---
