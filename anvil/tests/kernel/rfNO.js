  // --- rfNO (2026-11-16, lane NO stepsm) --- sheet-metal parts out to STEP and back to the same flat.
  // Each part is built with Anvil's own kernel (inch; 20 / 16 / 14 / 11 ga; K-factor, bend deduction and bend-table
  // sheets), written with Exchange.exportSTEP, and checked as a customer's CAD would see it: inch units, every bend a
  // CYLINDRICAL_SURFACE pair and every flat a PLANE (the PLANE / CYLINDRICAL_SURFACE counts are the part's own faces, no
  // facets), then read back with Exchange.importFile (closed, the volume to 1e-8, no more than twice the triangles) and
  // made sheet metal again with Insert Bends (thickness and radii found from the part, the sheet's K / BD / bend table
  // given as the shop would): the same bends, the blank's outline and net area to 1e-6 in², the holes the same distances
  // from the blank's centroid to 1e-5 in, and a clean flat DXF. OpenCascade read every one of these files as one valid
  // closed solid with Anvil's volume to 1e-13 (lane NO report, test-reports/2026-11-16-step-sheetmetal.md: thirty parts).
  (function () {
    group('rfNO: STEP of sheet-metal parts: out with true planes and cylinders, back in, Insert Bends to the same flat');
    var X = typeof Exchange !== 'undefined' ? Exchange : null;
    var G16 = 0.0598, G14 = 0.0747, G20 = 0.0359, G11 = 0.1196;
    function rfNOhead(T, R, KF, opts) {
      return 'p.units("in");\np.sheet(' + T + ', ' + (R == null ? T : R) + ', ' + (KF == null ? 0.5 : KF) + (opts ? ', ' + JSON.stringify(opts) : '') + ');\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n';
    }
    function rfNOholes(T) { return 'p.sketch("Top", ' + T + ').circle(1, -1, 0.125).circle(3, -2, 0.1).end().extrude(1, { cut: true, through: true, both: true });\n'; }
    function rfNOarea(l) { return Math.abs(K.signedArea(l)); }
    function rfNOcen(l) { var a = 0, cx = 0, cy = 0; for (var i = 0; i < l.length; i++) { var p = l[i], q = l[(i + 1) % l.length], c = p[0] * q[1] - q[0] * p[1]; a += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c; } return [cx / (3 * a), cy / (3 * a)]; }
    // the blank as numbers that do not depend on where it lies: outline area, net area, each hole's distance from the
    // blank's (net) centroid, sorted
    function rfNOsig(fl) {
      var outer = fl.loops[0], holes = fl.loops.slice(1), At = rfNOarea(outer), c0 = rfNOcen(outer), cx = c0[0] * At, cy = c0[1] * At;
      holes.forEach(function (h) { var a = rfNOarea(h), c = rfNOcen(h); cx -= c[0] * a; cy -= c[1] * a; At -= a; });
      var C = [cx / At, cy / At];
      return { outer: rfNOarea(outer), net: At, bends: fl.bends.length, hd: holes.map(function (h) { var c = rfNOcen(h); return Math.hypot(c[0] - C[0], c[1] - C[1]); }).sort(function (a, b) { return a - b; }) };
    }
    function rfNOfaces(s) {
      var ent = {}, out = {};
      s.split('\n').forEach(function (l) { var m = /^#(\d+)=(.*);$/.exec(l); if (m) ent[m[1]] = m[2]; });
      Object.keys(ent).forEach(function (id) {
        var m = /^ADVANCED_FACE\(.*,#(\d+),\.[TF]\.\)$/.exec(ent[id]);
        if (!m) return;
        var sf = ent[m[1]] || '', k = /B_SPLINE_SURFACE/.test(sf) ? 'BSPLINE' : (/^([A-Z_]+)\(/.exec(sf) || [])[1] || 'complex';
        out[k] = (out[k] || 0) + 1;
      });
      return out;
    }
    // part -> STEP -> part -> Insert Bends -> flat, against the part's own flat
    function rfNOtrip(code, fixed, faces, bends) {
      if (!X) fail('exchange.js is not loaded');
      var r = build(code); noErrors(r);
      var fl0 = K.flatPattern(r.model, r.build, r.mesh), s0 = rfNOsig(fl0), s = X.exportSTEP(r.model, r.build);
      assert(/CONVERSION_BASED_UNIT\('INCH'/.test(s), 'the file is in inches');
      var f = rfNOfaces(s);
      assert(JSON.stringify(f) === JSON.stringify(faces), 'faces ' + JSON.stringify(f) + ', want ' + JSON.stringify(faces));
      var res = X.importFile('rfNO.step', s, { units: 'in' }), m2 = X.newPartFromImport(res), b2 = K.rebuild(m2), mp2 = K.massProps(K.meshFromBody(b2.body), 1);
      assert(!res.stats.openEdges, 'read back closed: ' + res.stats.openEdges + ' open edges');
      if (typeof Evaluate !== 'undefined') { var ck = Evaluate.checkBody(b2.body, { maxPairs: 1 }); assert(!ck.openEdges.length && !ck.nonManifoldEdges.length, 'Check: closed solid'); }
      nearRel(mp2.volume, r.mp.volume, 1e-8, 'read-back volume');
      var tris0 = r.mesh.positions.length / 9;
      assert(res.stats.triangles <= 2 * tris0, res.stats.triangles + ' triangles read, the part ' + tris0);
      var sh = r.model.sheet, ib = { kFactor: sh.kFactor };
      if (sh.bendAllowanceType && sh.bendAllowanceType !== 'kfactor') { ib.bendAllowanceType = sh.bendAllowanceType; ib.bendTable = sh.bendTable; ib.bendDeduction = sh.bendDeduction; ib.bendAllowance = sh.bendAllowance; }
      new K.Builder(m2).insertBends(fixed, ib);
      var b3 = K.rebuild(m2);
      assert(!Object.keys(b3.errors).length, 'Insert Bends: ' + JSON.stringify(b3.errors));
      near(m2.sheet.thickness, sh.thickness, 1e-9, 'thickness found');
      var fl = K.flatPattern(m2, b3, K.meshFromBody(b3.body)), s1 = rfNOsig(fl);
      assert(fl.bends.length === bends && s0.bends === bends, 'bends ' + s0.bends + ' / ' + fl.bends.length + ', want ' + bends);
      near(s1.outer, s0.outer, 1e-6, 'blank outline area');
      near(s1.net, s0.net, 1e-6, 'blank net area');
      assert(s1.hd.length === s0.hd.length, 'holes ' + s0.hd.length + ' / ' + s1.hd.length);
      s0.hd.forEach(function (d, i) { near(s1.hd[i], d, 1e-5, 'hole ' + i + ' from the blank centroid'); });
      var c = DxfCheck.check(K.exportDXFFlat(fl, 'in'), { units: 'in' });
      assert(c.ok, 'flat DXF: ' + c.errors.join('; '));
      return JSON.stringify(f) + ', ' + res.stats.triangles + ' / ' + tris0 + ' triangles, ' + s.length + ' bytes, blank ' + s1.outer.toFixed(4) + ' in²';
    }
    test('rfNO: 16 ga Edge Flange at 30 deg, two holes in the base: 8 planes + 4 cylinders (bend inside / outside, two hole walls), the same flat and hole places', function () {
      return rfNOtrip(rfNOhead(G16) + 'p.flange(1, [[2, ' + G16 + ', 0]], { angle: 30 });\n' + rfNOholes(G16), [1, G16, 1.3], { PLANE: 8, CYLINDRICAL_SURFACE: 4 }, 1);
    });
    test('rfNO: 14 ga R .09 K .42, two 60 deg flanges (one reversed): 12 planes + 4 cylinders, Insert Bends finds R .09 from the part', function () {
      return rfNOtrip(rfNOhead(G14, 0.09, 0.42) + 'p.flange(1, [[2, ' + G14 + ', 0]], { angle: 60 });\np.flange(0.8, [[4, ' + G14 + ', 1.5]], { angle: 60, reverse: true });\n', [1, G14, 1.3], { PLANE: 12, CYLINDRICAL_SURFACE: 4 }, 2);
    });
    test('rfNO: 20 ga at 120 deg and 11 ga R .125 at 150 deg: one bend each, the same flat', function () {
      var a = rfNOtrip(rfNOhead(G20) + 'p.flange(1, [[2, ' + G20 + ', 0]], { angle: 120 });\n', [1, G20, 1.3], { PLANE: 8, CYLINDRICAL_SURFACE: 2 }, 1);
      var b = rfNOtrip(rfNOhead(G11, 0.125, 0.45) + 'p.flange(1, [[2, ' + G11 + ', 0]], { angle: 150 });\n', [1, G11, 1.3], { PLANE: 8, CYLINDRICAL_SURFACE: 2 }, 1);
      return a + ' | ' + b;
    });
    test('rfNO: a bend-table sheet (BD .105 at 90 deg) and a bend-deduction sheet (BD .1): with the sheet\'s method given to Insert Bends the flat is the original\'s (5.27 and 5.64 long)', function () {
      var BT = { kind: 'BD', name: 'shop', rows: [{ thickness: 0.06, radius: 0.06, angle: 90, value: 0.105 }] };
      var a = rfNOtrip('p.units("in");\np.sheet(0.06, 0.06, 0.5, { bendAllowanceType: "table", bendTable: ' + JSON.stringify(BT) + ' });\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[2, 0.06, 0]]);\np.flange(1, [[2, 0.06, 3]]);\n', [1, 0.06, 1.3], { PLANE: 10, CYLINDRICAL_SURFACE: 4 }, 2);
      var b = rfNOtrip('p.units("in");\np.sheet(0.06, 0.06, 0.5, { bendAllowanceType: "deduction", bendDeduction: 0.1 });\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1.5, [[0, 0.06, 1.5]]);\n', [1, 0.06, 1.3], { PLANE: 8, CYLINDRICAL_SURFACE: 2 }, 1);
      return a + ' | ' + b;
    });
    test('rfNO: Jog and a 60 deg Sketched Bend DOWN (14 ga): two / one bend, written as cylinder pairs', function () {
      var a = rfNOtrip(rfNOhead(G16) + 'p.jog(0.5, 1, [[4, ' + G16 + ', 1.5]]);\n', [1, G16, 1.3], { PLANE: 10, CYLINDRICAL_SURFACE: 4 }, 2);
      var b = rfNOtrip(rfNOhead(G14) + 'p.sketch("Top", ' + G14 + ').line(1.5, 0, 1.5, -3).sketchedBend(60, { reverse: true });\n', [3, G14, 1.3], { PLANE: 8, CYLINDRICAL_SURFACE: 2 }, 1);
      return a + ' | ' + b;
    });
    test('rfNO: Break Corner R .25 on all four corners (14 ga) with two holes: the corner rounds are cylinders, the flat the same', function () {
      return rfNOtrip(rfNOhead(G14) + 'p.breakCorner(0.25, [[0, ' + G14 / 2 + ', 0], [4, ' + G14 / 2 + ', 0], [4, ' + G14 / 2 + ', 3], [0, ' + G14 / 2 + ', 3]], { kind: "fillet" });\n' + rfNOholes(G14), [1, G14, 1.3], { PLANE: 6, CYLINDRICAL_SURFACE: 6 }, 0);
    });
    test('rfNO: Unfold, a slot and a hole across the bend, Fold: the bend stays a cylinder pair with the cut walls on it, the flat holes land where they were cut', function () {
      return rfNOtrip(rfNOhead(G16) + 'p.flange(1.5, [[2, ' + G16 + ', 0]]);\np.unfold([1, ' + G16 + ', 2], null);\np.sketch("Top", ' + G16 + ').slot(2, 0.3, 2, -0.6, 0.25).circle(1, 0.8, 0.125).end().extrude(1, { cut: true, through: true, both: true });\np.fold();\n', [1, G16, 1.3], { PLANE: 10, CYLINDRICAL_SURFACE: 7 }, 1);
    });
    test('rfNO: Normal Cut through a flange and a plain cut across a 14 ga bend: the bend\'s pieces are cylinders, the same flat', function () {
      var a = rfNOtrip(rfNOhead(G16) + 'p.flange(1, [[2, ' + G16 + ', 0]]);\np.sketch("Front", 0.5).rect(1.5, -0.2, 1, 0.5).end().extrude(2, { cut: true, through: true, both: true, normalCut: true });\n', [1, G16, 1.3], { PLANE: 12, CYLINDRICAL_SURFACE: 4 }, 1);
      var b = rfNOtrip(rfNOhead(G14) + 'p.flange(1.5, [[2, ' + G14 + ', 0]]);\np.sketch("Top", 3).rect(1.5, -0.3, 1, 0.5).end().extrude(4, { cut: true, through: true, reverse: true });\n', [1, G14, 1.3], { PLANE: 14, CYLINDRICAL_SURFACE: 4 }, 1);
      return a + ' | ' + b;
    });
    test('rfNO: Swept Flange (L profile along a 10 in path) and a Tab with a slot: the same flat', function () {
      var a = rfNOtrip('p.units("in");\np.sheet(' + G16 + ', ' + G16 + ', 0.5);\nvar path = p.sketch("Top").line(0, 0, 0, -10).id();\nvar prof = p.sketch("Front").polyline([[0, 0], [2, 0], [2, 1]], false).id();\np.sweptFlange(prof, path);\n', [1, 0, 5], { PLANE: 8, CYLINDRICAL_SURFACE: 2 }, 1);
      var b = rfNOtrip(rfNOhead(G16) + 'p.sketch("Top", ' + G16 + ').rect(4, -1.75, 0.5, 0.5).end().tab();\np.sketch("Top", ' + G16 + ').slot(1, -1.5, 2, -1.5, 0.25).end().extrude(1, { cut: true, through: true, both: true });\n', [1, G16, 1.3], { PLANE: 12, CYLINDRICAL_SURFACE: 2 }, 0);
      return a + ' | ' + b;
    });
  })();
