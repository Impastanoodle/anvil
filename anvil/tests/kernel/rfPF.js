  // --- rfPF (2026-11-17, lane PF stepexact) --- solids that survive STEP exactly (exchange.js).
  // (1) A free-form import drilled, written and read again is closed: freeFacesOf takes the slivers a cut leaves beside
  //     a hole as pieces of their face (its plane tolerance is the mesh's weld, a sliver's normal its mesh face's), so the
  //     hole's rim is one true curve, not a ragged polygon (the report's case: 9 open edges, OpenCascade: not valid).
  // (2) The reader keeps a straight side of a B-spline face as its two ends (straightGrid): 24 samples across left
  //     facets a few 1e-6 off their neighbours' planes, inside the boolean's band, where a cut cracks (holes refused as
  //     zero-thickness, up to 272 open edges).
  // (3) Equal holes crossing: four cylinder walls meeting in two ELLIPSEs (snapCylEqual / equalCross), were facets.
  // (4) Anvil's own spline loft with a hole through it keeps its B_SPLINE_SURFACE faces (loftFacesOf).
  // (5) bodyMesh welds the ends of open edges a hair over a weld cell apart (weldOpenTwins).
  (function () {
    group('rfPF: drilled lofts and free-form imports go through STEP closed and exact');
    var X = typeof Exchange !== 'undefined' ? Exchange : null;
    var rfPFLOFT = 'p.units("in");\nvar a = p.sketch("Top").centerRect(0, 0, 4, 4).id();\nvar b = p.sketch("Top", 1.5).centerRect(0, 0, 2, 2).id();\nvar c = p.sketch("Top", 3).centerRect(0, 0, 4, 4).id();\np.loft([a, b, c]);\n';
    var rfPFLOFT4 = 'p.units("in");\nvar a = p.sketch("Top").centerRect(0, 0, 3, 5).id();\nvar b = p.sketch("Top", 1).centerRect(0.2, 0, 2, 3).id();\nvar c = p.sketch("Top", 2.5).centerRect(0, 0.3, 4, 4).id();\nvar d = p.sketch("Top", 4).centerRect(0, 0, 3, 3).id();\np.loft([a, b, c, d]);\n';
    var rfPFMM = 'var a = p.sketch("Top").centerRect(0, 0, 80, 60).id();\nvar b = p.sketch("Top", 30).centerRect(0, 0, 40, 50).id();\nvar c = p.sketch("Top", 70).centerRect(5, 0, 70, 70).id();\np.loft([a, b, c]);\n';
    var rfPFG18 = 'p.units("in");\nvar a = p.sketch("Top").circle(0, 0, 1.5).id();\nvar b = p.sketch("Top", 1.5).centerRect(0, 0, 2, 2).id();\nvar c = p.sketch("Top", 3).circle(0, 0, 0.75).id();\np.loft([a, b, c]);\n';
    function rfPFhole(pl, x, y, r, len) { return 'p.sketch("' + pl + '").circle(' + x + ', ' + y + ', ' + r + ').end().extrude(' + (len || 10) + ', { cut: true, both: true });\n'; }
    function rfPFfaces(s) {
      return { B: (s.match(/B_SPLINE_SURFACE_WITH_KNOTS/g) || []).length, C: (s.match(/CYLINDRICAL_SURFACE/g) || []).length, P: (s.match(/=PLANE\(/g) || []).length, E: (s.match(/=ELLIPSE\(/g) || []).length, all: (s.match(/=ADVANCED_FACE/g) || []).length };
    }
    // edges of the body's welded mesh used other than twice: [open, more than twice]
    function rfPFedges(body, twins) {
      var m = X.bodyMesh(body, twins), t = m.triangles, use = {}, open = 0, many = 0;
      for (var i = 0; i < t.length; i += 3) for (var k = 0; k < 3; k++) { var a = t[i + k], b = t[i + (k + 1) % 3], key = a < b ? a + '_' + b : b + '_' + a; use[key] = (use[key] || 0) + 1; }
      Object.keys(use).forEach(function (key) { if (use[key] === 1) open++; else if (use[key] > 2) many++; });
      return [open, many];
    }
    function rfPFexample(n) { var ex = AnvilExamples.filter(function (e) { return e.name === n; })[0]; if (!ex) fail('no example ' + n); return ex; }
    function rfPFvol(m, b) { return K.massProps(K.meshFromBody((b || K.rebuild(m)).body), 1).volume; }
    // the script's part written to STEP and read back as an Imported part
    function rfPFimported(script, units) {
      var m0 = K.newModel('rfPF'); K.runScript(m0, script);
      return X.newPartFromImport(X.importFile('rfPF-in.step', X.exportSTEP(m0, K.rebuild(m0)), { units: units }));
    }
    // model -> { b, v, s (STEP), f (face counts), res (read back), v2 }
    function rfPFtrip(m, units) {
      var b = K.rebuild(m), v = rfPFvol(m, b), s = X.exportSTEP(m, b), res = X.importFile('rfPF.step', s, { units: units });
      return { b: b, v: v, s: s, f: rfPFfaces(s), res: res, back: X.newPartFromImport(res), v2: rfPFvol(X.newPartFromImport(res)) };
    }
    test('rfPF: a re-read loft drilled by two equal crossing holes goes to STEP as 4 spline faces, 4 cylinder walls meeting in 2 ellipses and 2 planes, and reads back closed at its volume (was 192 faces, 9 open edges, 2.7e-4)', function () {
      if (!X) fail('exchange.js is not loaded');
      var m = rfPFimported(rfPFLOFT, 'in');
      K.runScript(m, rfPFhole('Right', 0, 0.6, 0.25) + rfPFhole('Front', 0, 0.6, 0.25));
      var r = rfPFtrip(m, 'in');
      assert(!Object.keys(r.b.errors || {}).length, 'feature errors ' + JSON.stringify(r.b.errors));
      assert(rfPFedges(r.b.body).join() === '0,0', 'the drilled body is closed: ' + rfPFedges(r.b.body));
      assert(r.f.B === 4 && r.f.C === 4 && r.f.P === 2 && r.f.all === 10, 'faces ' + JSON.stringify(r.f));
      assert(r.f.E === 2, 'the walls meet in two ELLIPSEs: ' + r.f.E);
      assert(r.res.stats.openEdges === 0 && !r.res.warnings.length, 'open edges ' + r.res.stats.openEdges + ' ' + r.res.warnings);
      nearRel(r.v2, r.v, 2e-6, 'read-back volume');
      // and once more: the re-read drilled part writes the same faces and volume again
      var r2 = rfPFtrip(r.back, 'in');
      assert(r2.f.all === 10 && r2.res.stats.openEdges === 0, 'second trip ' + JSON.stringify(r2.f) + ' open ' + r2.res.stats.openEdges);
      nearRel(r2.v2, r2.v, 1e-9, 'second trip volume');
      return JSON.stringify(r.f) + ', volume ' + ((r.v2 - r.v) / r.v).toExponential(1);
    });
    test('rfPF: one hole, unequal crossing holes and two holes in one face of a re-read loft: every wall a CYLINDRICAL_SURFACE, the body and the file closed, volume to 2e-6 (were facets with 5 to 11 open edges)', function () {
      var out = [];
      [[rfPFhole('Right', 0, 0.6, 0.25), 1], [rfPFhole('Right', 0, 0.6, 0.25) + rfPFhole('Front', 0, 0.6, 0.15), 3], [rfPFhole('Right', 0.5, 0.6, 0.2) + rfPFhole('Right', -0.6, 2.3, 0.3), 2]].forEach(function (c) {
        var m = rfPFimported(rfPFLOFT, 'in');
        K.runScript(m, c[0]);
        var r = rfPFtrip(m, 'in');
        assert(!Object.keys(r.b.errors || {}).length, 'feature errors ' + JSON.stringify(r.b.errors));
        assert(rfPFedges(r.b.body).join() === '0,0', 'the drilled body is closed: ' + rfPFedges(r.b.body));
        assert(r.f.B === 4 && r.f.C === c[1] && r.f.P === 2, 'faces ' + JSON.stringify(r.f));
        assert(r.res.stats.openEdges === 0, 'open edges ' + r.res.stats.openEdges);
        nearRel(r.v2, r.v, 2e-6, 'read-back volume');
        out.push(r.f.all + ' faces ' + ((r.v2 - r.v) / r.v).toExponential(1));
      });
      return out.join('; ');
    });
    test('rfPF: a re-read loft is meshed like Anvil\'s own (a straight side its two ends: 388 triangles, were 9404), so a hole through a 4-section loft or a mm loft is cut, not refused as zero-thickness, and a square cut reads back closed', function () {
      var m = rfPFimported(rfPFLOFT, 'in'), b0 = K.rebuild(m), n0 = X.bodyMesh(b0.body).triangles.length / 3, m0 = K.newModel('n');
      K.runScript(m0, rfPFLOFT);
      assert(n0 < 600, 'triangles of the re-read loft: ' + n0);
      nearRel(rfPFvol(m, b0), rfPFvol(m0), 2e-5, 're-read loft volume against the part');
      var out = [n0 + ' triangles'];
      [[rfPFLOFT4, 'in', rfPFhole('Right', 0, 1.7, 0.4), 7], [rfPFMM, 'mm', rfPFhole('Front', 3, 40, 8, 200), 7], [rfPFMM, 'mm', 'p.sketch("Front").centerRect(0, 45, 12, 9).end().extrude(200, { cut: true, both: true });\n', 10]].forEach(function (c) {
        var mi = rfPFimported(c[0], c[1]);
        K.runScript(mi, c[2]);
        var r = rfPFtrip(mi, c[1]);
        assert(!Object.keys(r.b.errors || {}).length, 'feature errors ' + JSON.stringify(r.b.errors));
        assert(rfPFedges(r.b.body).join() === '0,0', 'the cut body is closed: ' + rfPFedges(r.b.body));
        assert(r.f.B === 4 && r.f.all === c[3], 'faces ' + JSON.stringify(r.f));
        assert(r.res.stats.openEdges === 0, 'open edges ' + r.res.stats.openEdges);
        nearRel(r.v2, r.v, 2e-6, 'read-back volume');
        out.push(r.f.all + ' faces');
      });
      return out.join(', ');
    });
    test('rfPF: a loft from a circle through a square to a circle, re-read and drilled: the cut\'s split point and its twin 1e-6 apart are one vertex in the mesh the file is written from (3 open edges and 34 planar facets before), 7 faces, closed', function () {
      var m = rfPFimported(rfPFG18, 'in');
      K.runScript(m, rfPFhole('Right', 0.1, 1.3, 0.3));
      var r = rfPFtrip(m, 'in');
      // (the kernel's own count, X.bodyMesh(body), still sees the hair crack: its guards are not to be fooled)
      assert(rfPFedges(r.b.body, true).join() === '0,0', 'the mesh the file is written from is closed: ' + rfPFedges(r.b.body, true));
      assert(r.f.B === 4 && r.f.C === 1 && r.f.all === 7, 'faces ' + JSON.stringify(r.f));
      assert(r.res.stats.openEdges === 0, 'open edges ' + r.res.stats.openEdges);
      nearRel(r.v2, r.v, 2e-6, 'read-back volume');
      return JSON.stringify(r.f);
    });
    test('rfPF: equal holes crossing in a block are four CYLINDRICAL_SURFACE walls meeting in two ELLIPSEs: the file reads back at the exact volume (two cylinders less their common part, 16 r^3 / 3) to 1e-9; a blind hole ending inside the other writes too', function () {
      var m = K.newModel('rfPF'); K.runScript(m, 'p.box(40, 40, 40); p.sketch("Top", 40).circle(20, -20, 5).extrude(40, { cut: true, reverse: true }); p.sketch("Front", 40).circle(20, 20, 5).extrude(40, { cut: true, reverse: true });');
      var r = rfPFtrip(m, 'mm'), exact = 64000 - 2 * Math.PI * 25 * 40 + 16 * 125 / 3;
      assert(r.f.C === 4 && r.f.E === 2 && r.f.P === 6 && r.f.all === 10, 'faces ' + JSON.stringify(r.f));
      assert(r.res.stats.openEdges === 0, 'open edges ' + r.res.stats.openEdges);
      nearRel(r.v, exact, 1e-9, 'the part');
      nearRel(r.v2, exact, 1e-9, 'read back');
      var m2 = K.newModel('rfPF'); K.runScript(m2, 'p.box(40, 40, 40); p.sketch("Top", 40).circle(20, -20, 5).extrude(40, { cut: true, reverse: true }); p.sketch("Front", 40).circle(20, 20, 5).extrude(25, { cut: true, reverse: true });');
      var r2 = rfPFtrip(m2, 'mm');
      assert(r2.f.C === 5 && r2.f.all === 12 && r2.res.stats.openEdges === 0, 'blind: ' + JSON.stringify(r2.f) + ' open ' + r2.res.stats.openEdges);
      nearRel(r2.v2, r2.v, 1e-9, 'blind hole read back');
      return JSON.stringify(r.f);
    });
    // (4) Anvil's own lofts with a cut. The file holds the true surface, the part's volume is its mesh's: they differ by
    // the mesh's own error (rfGO: 1e-5, G18 2e-5), so that is the limit here too.
    test('rfPF: Anvil\'s own spline loft with holes through its sides keeps its B_SPLINE_SURFACE faces, the walls CYLINDRICAL_SURFACEs (were 422 planar facets, 2.8e-4 off on reading back; a circle-square-circle loft 13,599 facets)', function () {
      var out = [];
      [[rfPFLOFT, rfPFhole('Right', 0, 0.6, 0.25) + rfPFhole('Front', 0, 0.6, 0.25), 4, 4, 10, 1e-5],
        [rfPFG18, rfPFhole('Right', 0.1, 1.3, 0.3), 4, 1, 7, 2e-5],
        ['p.units("in");\nvar a = p.sketch("Top").centerRect(0, 0, 2, 2).id();\nvar b = p.sketch("Top", 1).polygon(0, 0, 1.1, 8, 22.5).id();\nvar c = p.sketch("Top", 2.5).circle(0, 0, 0.75).id();\np.loft([a, b, c]);\n', 'p.sketch("Top", 3).circle(0, 0, 0.25).end().cut("through");\n', 8, 1, 11, 1e-5]].forEach(function (c) {
        var m = K.newModel('rfPF'); K.runScript(m, c[0] + c[1]);
        var r = rfPFtrip(m, 'in');
        assert(!Object.keys(r.b.errors || {}).length, 'feature errors ' + JSON.stringify(r.b.errors));
        assert(r.f.B === c[2] && r.f.C === c[3] && r.f.P === 2 && r.f.all === c[4], 'faces ' + JSON.stringify(r.f));
        assert(r.res.stats.openEdges === 0 && !r.res.warnings.length, 'open edges ' + r.res.stats.openEdges + ' ' + r.res.warnings);
        nearRel(r.v2, r.v, c[5], 'read-back volume');
        out.push(r.f.all + ' faces ' + ((r.v2 - r.v) / r.v).toExponential(1));
      });
      return out.join('; ');
    });
    // (6) faces that went out as facets for a reason that was the writer's own
    test('rfPF: the Mug goes to STEP as 8 faces (4 cylinders, the handle\'s TOROIDAL_SURFACE, 3 planes) and reads back at its exact volume (was 1032 faces, 1031 of them planar facets, 0.9 % light: a rim point snapped onto the inner wall sent that band, the outer wall and the handle back to facets)', function () {
      var ex = rfPFexample('Mug'), m = K.newModel('rfPF'); K.runScript(m, ex.code);
      var b = K.rebuild(m), s = X.exportSTEP(m, b), n = function (re) { return (s.match(re) || []).length; };
      assert(n(/=CYLINDRICAL_SURFACE\(/g) === 4 && n(/=TOROIDAL_SURFACE\(/g) === 1 && n(/=PLANE\(/g) === 3 && n(/=ADVANCED_FACE\(/g) === 8, 'faces: ' + n(/=CYLINDRICAL_SURFACE\(/g) + ' cyl, ' + n(/=TOROIDAL_SURFACE\(/g) + ' tor, ' + n(/=PLANE\(/g) + ' planes of ' + n(/=ADVANCED_FACE\(/g));
      var res = X.importFile('mug.step', s, { units: 'mm' }), v = rfPFvol(m, b), v2 = rfPFvol(X.newPartFromImport(res));
      assert(res.stats.openEdges === 0 && !res.warnings.length, 'open edges ' + res.stats.openEdges + ' ' + res.warnings);
      nearRel(v2, v, 1e-9, 'read-back volume');
      return ((v2 - v) / v).toExponential(1);
    });
    test('rfPF: the Rounded handle\'s grip (two cones, one with its record\'s origin past the apex) is two CONICAL_SURFACEs: 16 faces, exact on reading back (was 110 faces, 1.4e-3 light); a chamfer equal to the corner round it turns is a CONICAL_SURFACE with its apex a vertex (was 5 facets)', function () {
      var ex = rfPFexample('Rounded handle'), m = K.newModel('rfPF'); K.runScript(m, ex.code);
      var r = rfPFtrip(m, 'mm'), n = function (s, re) { return (s.match(re) || []).length; };
      assert(n(r.s, /=CONICAL_SURFACE\(/g) === 2 && n(r.s, /=TOROIDAL_SURFACE\(/g) === 1 && r.f.all === 16, 'handle faces: ' + n(r.s, /=CONICAL_SURFACE\(/g) + ' cones of ' + r.f.all);
      assert(r.res.stats.openEdges === 0, 'handle open edges ' + r.res.stats.openEdges);
      nearRel(r.v2, r.v, 1e-9, 'handle read-back volume');
      var m2 = K.newModel('rfPF'); K.runScript(m2, 'p.units("in");\np.sketch("Top").rect(0, -4, 3.75, 4).end().extrude(0.25);\np.fillet(0.03, [[0,0.125,4]]);\np.chamfer(0.03, [[1.875,0.25,4]]);');
      var q = rfPFtrip(m2, 'in');
      assert(n(q.s, /=CONICAL_SURFACE\(/g) === 1 && q.f.all === 10, 'cone corner faces: ' + n(q.s, /=CONICAL_SURFACE\(/g) + ' cone of ' + q.f.all);
      assert(q.res.stats.openEdges === 0, 'cone corner open edges ' + q.res.stats.openEdges);
      nearRel(q.v2, q.v, 1e-12, 'cone corner read-back volume');
      return r.f.all + ' and ' + q.f.all + ' faces';
    });
  })();
