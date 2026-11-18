  // --- rfPC (2026-11-17, lane smpanel: perforated panels and sheet-metal leftovers) ---
  // 1. A Sketched Bend or a Jog across the 48 x 24 in 16 ga panel with 1800 holes spent most of its time in csg.js
  //    snapTwins: the scan for twin points (two copies of one corner under 1e-6 apart) walked every later vertex within
  //    1e-6 in x, and a cut across the sheet puts thousands of vertices on one x and two y's (2.1 s of a 5.4 s Jog). It
  //    now walks runs of equal x and of equal (x, y) with binary searches: the same pairs in the same order (the
  //    polygons hash to main's, recorded before the change), the work a few looks per vertex (CSG.fatStats.twinLooks).
  // 2. A Miter Flange round a corner on an L profile (riser, then a lip) read back through STEP and Insert Bends: the
  //    lips' bends end on the mitre and were squared at their full reach, 0.0085 in² over the part's own flat at each
  //    corner (0.017 for the L; SolidWorks' flat, rfIZ, runs that strip's end straight from the riser's end to the lip's).
  //    insertBendsLayout keeps a mitred pair slanted when the two bends share no wall; the pair whose bends both leave the
  //    base (the first bends) stays square, and is found also when the fixed face is on a riser (it was missed there).
  (function () {
    group('rfPC: Sketched Bend / Jog across a 1800-hole panel (twin points found by runs, the same solid); Miter Flange L through STEP and Insert Bends = its own flat');
    var T = 0.0598, PI = Math.PI, BA = PI / 2 * (T + 0.44 * T), F = CSG.fatStats, X = typeof Exchange !== 'undefined' ? Exchange : null;
    function rfPCpanel(tail) {
      return 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.44);\nvar s = p.sketch("Top").rect(0, -24, 48, 24);\n' +
        'for (var j = 0; j < 30; j++) for (var i = 0; i < 60; i++) s.circle(1.5 + 0.75 * (i + (j % 2 ? 0.5 : 0.25)), -(1.5 + 0.72 * j), 0.125);\ns.end().baseFlange();\n' + tail;
    }
    // every polygon of a body (plane, corners, feature id), FNV-1a over the doubles' bytes (rfOE's hash)
    function rfPChash(body) {
      var buf = new Float64Array(1), u8 = new Uint8Array(buf.buffer), h = 0x811c9dc5 | 0, n = 0;
      function put(x) { buf[0] = x; for (var i = 0; i < 8; i++) { h ^= u8[i]; h = Math.imul(h, 16777619); } n++; }
      body.polygons.forEach(function (p) {
        put(p.plane.normal.x); put(p.plane.normal.y); put(p.plane.normal.z); put(p.plane.w);
        p.vertices.forEach(function (v) { put(v.pos.x); put(v.pos.y); put(v.pos.z); });
        put(typeof p.shared === 'number' ? p.shared : -1);
      });
      return (h >>> 0).toString(16) + ':' + n;
    }
    // the plate less its holes, and each bend's strip (BA wide, 24 long, clear of the holes) as its quarter ring
    function rfPCvolume(bends) { return T * (48 * 24 - 1800 * PI * 0.125 * 0.125) + bends * 24 * (PI / 4 * ((2 * T) * (2 * T) - T * T) - BA * T); }
    function rfPCrun(tail, hash, lines) {
      var m = K.newModel('rfPC'); K.runScript(m, rfPCpanel(tail));
      var v0 = F.twinVerts, l0 = F.twinLooks, b = K.rebuild(m), verts = F.twinVerts - v0, looks = F.twinLooks - l0;
      assert(!Object.keys(b.errors).length, 'rebuild errors: ' + JSON.stringify(b.errors));
      var h = rfPChash(b.body);
      assert(h === hash, 'polygon hash ' + h + ', main gave ' + hash);
      assert(verts > 500000, verts + ' vertices through snapTwins (the cut runs across the whole sheet)');
      assert(looks < 6 * verts, looks + ' candidate twins looked at for ' + verts + ' vertices (the old scan: every later vertex within 1e-6 in x)');
      var mesh = K.meshFromBody(b.body), mp = K.massProps(mesh, 1);
      nearRel(mp.volume, rfPCvolume(lines.length), 1e-9, 'volume');
      var f = K.flatPattern(m, b, mesh);
      near(f.size[0], 48, 1e-9, 'blank width'); near(f.size[1], 24, 1e-9, 'blank height');
      assert(f.loops.length === 1801, f.loops.length + ' loops in the blank');
      assert(f.bends.length === lines.length, f.bends.length + ' bend lines');
      f.bends.forEach(function (bd, k) {
        near(bd.a[0], lines[k], 1e-9, 'bend line ' + k + ' x'); near(bd.b[0], lines[k], 1e-9, 'bend line ' + k + ' x');
        near(Math.abs(bd.a[1] - bd.b[1]), 24, 1e-9, 'bend line ' + k + ' length'); near(bd.ba, BA, 1e-12, 'bend allowance');
      });
      return h + ', ' + verts + ' vertices, ' + looks + ' looks (' + (looks / verts).toFixed(2) + ' each)';
    }
    test('rfPC: 1800-hole panel, Sketched Bend across it at x 23.9: the polygons main built (hash), a few twin looks per vertex, the closed-form volume, a 48 x 24 blank with its bend line', function () {
      return rfPCrun('p.sketch("Top", ' + T + ').line(23.9, 0, 23.9, -24).sketchedBend(90, { fixed: [10, 0, 12] });\n', '209b3760:2656484', [23.9]);
    });
    test('rfPC: 1800-hole panel, Jog .8 across it at x 23.9: the polygons main built (hash), a few twin looks per vertex, the closed-form volume, both bend lines (the second BA + .8 - T - 2R further)', function () {
      return rfPCrun('p.sketch("Top", ' + T + ').line(23.9, 0, 23.9, -24).jog(0.8, { fixed: [10, ' + T + ', 12] });\n', '83507a53:2657499', [23.9, 23.9 + BA + 0.8 - 3 * T]);
    });

    // ---------------------------------------------------------------- 2. Miter Flange L through STEP + Insert Bends
    function rfPCarea(fl) { return fl.loops.reduce(function (s, l, i) { return s + (i ? -1 : 1) * Math.abs(K.signedArea(l)); }, 0); }
    function rfPCsides(l) { return l.map(function (p, i) { var q = l[(i + 1) % l.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]); }).sort(function (a, b) { return a - b; }); }
    // own flat, then exportSTEP, importFile, Insert Bends (fixed face, K), flat: the same outline (area, every side's length)
    function rfPCtrip(code, fixed) {
      if (!X) fail('exchange.js is not loaded');
      var r = build(code); noErrors(r);
      var own = K.flatPattern(r.model, r.build, r.mesh), m2 = X.newPartFromImport(X.importFile('rfPC.step', X.exportSTEP(r.model, r.build), { units: 'in' }));
      new K.Builder(m2).insertBends(fixed, { kFactor: r.model.sheet.kFactor });
      var b3 = K.rebuild(m2);
      assert(!Object.keys(b3.errors).length, 'Insert Bends: ' + JSON.stringify(b3.errors));
      var ib = K.flatPattern(m2, b3, K.meshFromBody(b3.body));
      near(rfPCarea(ib), rfPCarea(own), 1e-6, 'blank area (Insert Bends ' + rfPCarea(ib).toFixed(7) + ', own ' + rfPCarea(own).toFixed(7) + ')');
      var so = rfPCsides(own.loops[0]), si = rfPCsides(ib.loops[0]);
      assert(si.length === so.length, 'outline corners ' + si.length + ', own ' + so.length);
      so.forEach(function (d, k) { near(si[k], d, 1e-6, 'outline side ' + k); });
      assert(ib.bends.length === own.bends.length, 'bends ' + ib.bends.length + ', own ' + own.bends.length);
      return { own: own, ib: ib, r: r };
    }
    function rfPCmitreWarn(fl) { return (fl.warnings || []).filter(function (w) { return /ends on a mitre/.test(w); }); }
    var LH = 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n';
    var rfPCmf = [
      ['L profile (riser 1, lip .5 out), fixed face on the base (main: 0.017 in² over)', LH + 'p.sketch("Right").line(0, 0.06, 0, 1.06).line(0, 1.06, 0.5, 1.06).end();\np.miterFlange([[2, 0.06, 0], [0, 0.06, 1]], {});\n', [1, 0.06, 1.3], 2],
      ['the same L, fixed face on a riser (its first bend runs from the riser to the base; main: 0.011 in² over)', LH + 'p.sketch("Right").line(0, 0.06, 0, 1.06).line(0, 1.06, 0.5, 1.06).end();\np.miterFlange([[2, 0.06, 0], [0, 0.06, 1]], {});\n', [2, 0.5, 0], 2],
      ['L profile with the lip turned in (right on main too; its lips\' bends end on a sine bulging out: squared and warned like the first bends)', LH + 'p.sketch("Right").line(0, 0.06, 0, 1.06).line(0, 1.06, -0.5, 1.06).end();\np.miterFlange([[2, 0.06, 0], [0, 0.06, 1]], {});\n', [1, 0.06, 1.3], 4],
      ['riser, lip and return (main: 0.025 in² over; the returns\' bend facets share planes with the lips\' bends, the returns\' ends drawn along the slant and warned)', LH + 'p.sketch("Right").line(0, 0.06, 0, 1.06).line(0, 1.06, 0.5, 1.06).line(0.5, 1.06, 0.5, 1.5).end();\np.miterFlange([[2, 0.06, 0], [0, 0.06, 1]], {});\n', [1, 0.06, 1.3], 4, 2],
      ['L profile round three edges, two mitred corners (main: 0.034 in² over)', LH + 'p.sketch("Right").line(0, 0.06, 0, 1.06).line(0, 1.06, 0.5, 1.06).end();\np.miterFlange([[2, 0.06, 0], [0, 0.06, 1], [4, 0.06, 1]], {});\n', [1, 0.06, 1.3], 4],
      ['a riser alone (one bend each side: square, as before)', LH + 'p.sketch("Right").line(0, 0.06, 0, 1.06).end();\np.miterFlange([[2, 0.06, 0], [0, 0.06, 1]], {});\n', [1, 0.06, 1.3], 2]
    ];
    rfPCmf.forEach(function (c) {
      test('rfPC: Miter Flange ' + c[0] + ' through STEP and Insert Bends: the blank is the part\'s own to 1e-6, the mitre warnings are the ends drawn square (and those drawn along a bulging slant)', function () {
        var t = rfPCtrip(c[1], c[2]), w = rfPCmitreWarn(t.ib);
        assert(w.length === c[3], w.length + ' mitre warnings, expected ' + c[3] + ': ' + w.join(' | '));
        var sl = w.filter(function (s) { return /drawn along the slant/.test(s); }).length;
        assert(sl === (c[4] || 0), sl + ' mitre ends drawn along the slant, expected ' + (c[4] || 0) + ': ' + w.join(' | '));
        return 'blank ' + rfPCarea(t.ib).toFixed(6) + ' in², ' + t.ib.loops[0].length + ' corners';
      });
    });
    // rfIZ's SolidWorks L (miter_L2.json): Insert Bends on Anvil's STEP of it gives SolidWorks' outline to 2e-6
    test('rfPC: the SolidWorks Miter Flange L (16 ga, Material Inside, gap .01, rect relief) through STEP and Insert Bends: SolidWorks\' blank area × T and its outline\'s sides to 2e-6', function () {
      var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\n';
      var t = rfPCtrip(HEAD + 'p.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.sketch("Right").line(-2, ' + T + ', -2, 1.0598).line(-2, 1.0598, -2.5, 1.0598).end();\np.miterFlange([[2, ' + T + ', 2], [4, ' + T + ', 1]], { position: "inside", miterGap: 0.01, relief: "rect" });\n', [1, T, 1]);
      nearRel(rfPCarea(t.ib) * T, 1.017194654, 1e-6, 'blank area × T (SolidWorks\' flat body)');
      // SolidWorks' outline, in order round the blank (rfIZ)
      var sw = [[0, 0], [0, 3.482801], [4.492929, 3.482801], [4.052729, 3.042601], [3.933129, 2.9017], [3.933129, 1.933129], [4.9017, 1.933129], [5.042601, 2.052729], [5.482801, 2.492929], [5.482801, 0]];
      var ss = rfPCsides(sw), si = rfPCsides(t.ib.loops[0]);
      assert(si.length === ss.length, si.length + ' outline corners, SolidWorks ' + ss.length);
      ss.forEach(function (d, k) { near(si[k], d, 2e-6, 'outline side ' + k); });
      return rfPCarea(t.ib).toFixed(7) + ' in²';
    });
  })();
