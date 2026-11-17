  // --- rfOE (2026-11-17, lane panelperf: a flanged, perforated panel builds in seconds) ---
  // A 48 x 24 in 16 ga panel with 1800 holes took 6 to 8 s per Edge Flange (26 to 32 s with four): every flange meshed
  // the whole 174 000-polygon sheet and worked out every edge of it, twice (flangeLayout, then the pick's reference in
  // smMakePicks), to find the one edge under the pick. kernel-sheetmetal.js smNear finds the edges beside a pick from
  // the polygons beside it (the same faceOutline / edge code on the few polygons along the picked line); bodies under
  // K.smLocal.minPolys polygons (every example and corpus part) keep the whole-body path, and so does any pick smNear
  // cannot answer for certain (two edges equally near, an edge only one face has, a plane with noise).
  // Rows: the same solid to the last bit with smNear on and off (a hash of every polygon), the hash main gave before
  // the lane, exact call counts (no whole-body meshFromBody / bodyEdges inside a rebuild, however many flanges), closed
  // forms (volume, blank, bend lines), and times with bounds three times what a quiet run of this PC measured.
  (function () {
    group('rfOE: Edge Flanges on a perforated panel look only beside the picked edge: the same solid to the last bit, no whole-body mesh per flange, seconds not half a minute');
    var T = 0.0598, PI = Math.PI, SL = K.smLocal, MS = K.meshStats;
    function rfOEwith(obj, vals, fn) { var was = {}; Object.keys(vals).forEach(function (k) { was[k] = obj[k]; obj[k] = vals[k]; }); try { return fn(); } finally { Object.keys(was).forEach(function (k) { obj[k] = was[k]; }); } }
    // the panel: W x H, cols x rows staggered holes of radius r, then `tail` (script lines)
    function rfOEcode(W, H, cols, rows, px, pz, tail) {
      var s = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.44);\nvar s = p.sketch("Top").rect(0, -' + H + ', ' + W + ', ' + H + ');\n';
      if (cols) s += 'for (var j = 0; j < ' + rows + '; j++) for (var i = 0; i < ' + cols + '; i++) s.circle(1.5 + ' + px + ' * (i + (j % 2 ? 0.5 : 0.25)), -(1.5 + ' + pz + ' * j), 0.125);\n';
      return s + 's.end().baseFlange();\n' + (tail || '');
    }
    function rfOEedge(W, H, k) { return JSON.stringify([[W / 2, T, 0], [W, T, H / 2], [W / 2, T, H], [0, T, H / 2]][k]); }
    function rfOEflanges(W, H, n, L) { var s = ''; for (var k = 0; k < n; k++) s += 'p.flange(' + (L || 1) + ', [' + rfOEedge(W, H, k) + ']);\n'; return s; }
    function rfOEmodel(code) { var m = K.newModel('rfOE'); K.runScript(m, code); return m; }
    // every polygon of a body (plane, corners, feature id), FNV-1a over the doubles' bytes
    function rfOEhash(body) {
      var buf = new Float64Array(1), u8 = new Uint8Array(buf.buffer), h = 0x811c9dc5 | 0, n = 0;
      function put(x) { buf[0] = x; for (var i = 0; i < 8; i++) { h ^= u8[i]; h = Math.imul(h, 16777619); } n++; }
      body.polygons.forEach(function (p) {
        put(p.plane.normal.x); put(p.plane.normal.y); put(p.plane.normal.z); put(p.plane.w);
        p.vertices.forEach(function (v) { put(v.pos.x); put(v.pos.y); put(v.pos.z); });
        put(typeof p.shared === 'number' ? p.shared : -1);
      });
      return (h >>> 0).toString(16) + ':' + n;
    }
    function rfOEtext(s) { var h = 0x811c9dc5 | 0; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16) + ':' + s.length; }
    function rfOEflat(m, b) { var f = K.flatPattern(m, b, K.meshFromBody(b.body)); return { flat: f, dxf: rfOEtext(K.exportDXFFlat(f, 'in', {})) }; }
    function rfOEcount(fn) {
      var m0 = MS.meshFromBody, e0 = MS.bodyEdges, p0 = MS.edgePolys, n0 = SL.stats.near, w0 = SL.stats.whole, r = fn();
      return { r: r, mesh: MS.meshFromBody - m0, edges: MS.bodyEdges - e0, polys: MS.edgePolys - p0, near: SL.stats.near - n0, whole: SL.stats.whole - w0 };
    }
    function rfOEerrs(b) { var ids = Object.keys(b.errors || {}); assert(!ids.length, 'rebuild errors: ' + ids.map(function (id) { return b.errors[id]; }).join(' | ')); }
    // closed forms of the panel with n Edge Flanges (Bend Outside, 90 deg, R = T, K .44, wall L)
    function rfOEvolume(W, H, holes, n, L) {
      var bend = PI / 4 * ((2 * T) * (2 * T) - T * T), lens = [W, H, W, H], v = T * (W * H - holes * PI * 0.125 * 0.125);
      for (var k = 0; k < n; k++) v += lens[k] * (bend + L * T);
      return v;
    }
    var BA = PI / 2 * (T + 0.44 * T);

    // ---------------------------------------------------------------- 1. the same solid, beside the pick and whole
    // a 12 x 8 panel with 96 holes: every sheet-metal feature that finds a picked edge, built with smNear for every
    // body (minPolys 0) and without it
    var rfOEsmall = [
      ['four Edge Flanges, one per feature', rfOEflanges(12, 8, 4)],
      ['one Edge Flange on four edges (mitred corners)', 'p.flange(1, [' + [0, 1, 2, 3].map(function (k) { return rfOEedge(12, 8, k); }).join(', ') + ']);\n'],
      ['Material Inside at 60 deg with a relief, then a hem on the next edge', 'p.flange(0.8, [' + rfOEedge(12, 8, 0) + '], { angle: 60, position: "inside", relief: "rect" });\np.hem(0.5, [' + rfOEedge(12, 8, 1) + ']);\n'],
      ['a flange, then a flange on the first flange\'s outer edge, then an edge jog', 'p.flange(1, [' + rfOEedge(12, 8, 0) + ']);\np.flange(0.5, [[6, ' + (2 * T + 1) + ', ' + (-2 * T) + ']], { toward: [0, 0, -1] });\np.jog(0.3, 0.6, [' + rfOEedge(12, 8, 2) + ']);\n'],
      ['Material Outside flanges on two neighbouring edges (the second trims beside the first\'s bend)', 'p.flange(1, [' + rfOEedge(12, 8, 0) + '], { position: "outside" });\np.flange(1, [' + rfOEedge(12, 8, 1) + '], { position: "outside" });\n']
    ];
    rfOEsmall.forEach(function (c) {
      test('rfOE: 12 x 8 panel, 96 holes, ' + c[0] + ': the solid, the pick references and the flat DXF are the same to the last bit whether the edges are found beside the picks or from the whole body', function () {
        var code = rfOEcode(12, 8, 12, 8, 0.8, 0.7, c[1]);
        var a = rfOEwith(SL, { minPolys: 0 }, function () { var m = rfOEmodel(code), cnt = rfOEcount(function () { return K.rebuild(m); }); return { m: m, b: cnt.r, cnt: cnt }; });
        var w = rfOEwith(SL, { on: false }, function () { var m = rfOEmodel(code); return { m: m, b: K.rebuild(m) }; });
        assert(JSON.stringify(a.b.errors) === JSON.stringify(w.b.errors), 'errors differ: ' + JSON.stringify(a.b.errors) + ' / ' + JSON.stringify(w.b.errors));
        assert(a.cnt.near > 0, 'smNear was not used');
        var ha = rfOEhash(a.b.body), hw = rfOEhash(w.b.body);
        assert(ha === hw, 'the solids differ: ' + ha + ' (beside the picks) / ' + hw + ' (whole body)');
        assert(JSON.stringify(a.b.flanges) === JSON.stringify(w.b.flanges), 'the flange records differ');
        assert(JSON.stringify(a.m.features) === JSON.stringify(w.m.features), 'the features (pick references) differ');
        var fa = rfOEflat(a.m, a.b), fw = rfOEflat(w.m, w.b);
        assert(fa.dxf === fw.dxf, 'the flat DXF differs: ' + fa.dxf + ' / ' + fw.dxf);
        // a second rebuild follows the references written by the first (smFollowPicks): the same again
        var a2 = rfOEwith(SL, { minPolys: 0 }, function () { return K.rebuild(a.m); }), w2 = rfOEwith(SL, { on: false }, function () { return K.rebuild(w.m); });
        assert(rfOEhash(a2.body) === ha && rfOEhash(w2.body) === ha, 'the second rebuild differs: ' + rfOEhash(a2.body) + ' / ' + rfOEhash(w2.body) + ' / ' + ha);
        return ha + ', ' + a.cnt.near + ' picks answered beside the pick, ' + a.cnt.whole + ' from the whole body';
      });
    });
    test('rfOE: K.smLocal.check builds both answers for every pick of those parts and finds no difference', function () {
      var d0 = SL.stats.differ, n = 0;
      rfOEwith(SL, { minPolys: 0, check: true }, function () {
        rfOEsmall.forEach(function (c) { var m = rfOEmodel(rfOEcode(12, 8, 12, 8, 0.8, 0.7, c[1])); rfOEerrs(K.rebuild(m)); n++; });
      });
      assert(SL.stats.differ === d0, (SL.stats.differ - d0) + ' picks differ: ' + JSON.stringify((SL.stats.cases || []).slice(-3)));
      return n + ' parts';
    });
    test('rfOE: a pick half way between two edges (the middle of a 16 ga side face) is not answered beside the pick: the whole body\'s order decides, as before', function () {
      var code = rfOEcode(12, 8, 12, 8, 0.8, 0.7, 'p.flange(1, [[6, ' + (T / 2) + ', 0]]);\n');
      var a = rfOEwith(SL, { minPolys: 0 }, function () { return rfOEcount(function () { return K.rebuild(rfOEmodel(code)); }); });
      var w = rfOEwith(SL, { on: false }, function () { return K.rebuild(rfOEmodel(code)); });
      assert(a.whole > 0, 'the tie was answered beside the pick');
      assert(JSON.stringify(a.r.errors) === JSON.stringify(w.errors) && rfOEhash(a.r.body) === rfOEhash(w.body), 'the results differ');
      return a.whole + ' picks from the whole body';
    });

    // ---------------------------------------------------------------- 2. the 600-hole panel: main's hash, call counts
    var rfOE600 = null;
    function rfOEpanel600() {
      if (rfOE600) return rfOE600;
      var m = rfOEmodel(rfOEcode(48, 24, 40, 15, 1.1, 1.4, rfOEflanges(48, 24, 4))), cnt = rfOEcount(function () { return K.rebuild(m); });
      rfOEerrs(cnt.r);
      return (rfOE600 = { m: m, b: cnt.r, cnt: cnt });
    }
    test('rfOE: 48 x 24 panel, 600 holes, four Edge Flanges: every polygon as main built it before this lane (hash recorded from 5443889), and the flat DXF', function () {
      var P = rfOEpanel600(), h = rfOEhash(P.b.body), f = rfOEflat(P.m, P.b);
      assert(h === 'f8209c28:893634', 'polygon hash ' + h + ', main gave f8209c28:893634');
      assert(f.dxf === '1ae5b7bd:44082', 'flat DXF hash ' + f.dxf + ', main gave 1ae5b7bd:44082');
      return h + ', DXF ' + f.dxf;
    });
    test('rfOE: that rebuild meshes no whole body and works out no whole body\'s edges (0 meshFromBody, 0 bodyEdges; main: 4 and 8), and outlines under 2 % of the sheet\'s polygons per pick', function () {
      var P = rfOEpanel600(), c = P.cnt, n = P.b.body.polygons.length;
      assert(c.mesh === 0, c.mesh + ' meshFromBody calls in the rebuild');
      assert(c.edges === 0, c.edges + ' bodyEdges calls in the rebuild');
      assert(c.whole === 0 && c.near >= 8, c.near + ' picks answered beside the pick, ' + c.whole + ' from the whole body');
      assert(c.polys < 0.02 * n * c.near, c.polys + ' polygons outlined for ' + c.near + ' picks of a body of ' + n);
      return c.near + ' picks, ' + c.polys + ' polygons outlined of ' + n;
    });
    test('rfOE: 600-hole panel with one, two and four flanges: the call counts do not grow with the flanges (0 whole-body meshFromBody / bodyEdges each), volume and blank are the closed forms', function () {
      [1, 2, 4].forEach(function (n) {
        var m = n === 4 ? rfOEpanel600().m : rfOEmodel(rfOEcode(48, 24, 40, 15, 1.1, 1.4, rfOEflanges(48, 24, n)));
        var c = n === 4 ? rfOEpanel600().cnt : rfOEcount(function () { return K.rebuild(m); }), b = c.r;
        rfOEerrs(b);
        assert(c.mesh === 0 && c.edges === 0, n + ' flanges: ' + c.mesh + ' meshFromBody, ' + c.edges + ' bodyEdges');
        var mesh = K.meshFromBody(b.body), mp = K.massProps(mesh, 1);
        nearRel(mp.volume, rfOEvolume(48, 24, 600, n, 1), 1e-9, n + ' flanges: volume');
        var f = K.flatPattern(m, b, mesh), sz = [48 + (n >= 2 ? BA + 1 : 0) + (n >= 4 ? BA + 1 : 0), 24 + (BA + 1) + (n >= 3 ? BA + 1 : 0)];
        near(f.bbox.max[0] - f.bbox.min[0], sz[0], 1e-9, n + ' flanges: blank width');
        near(f.bbox.max[1] - f.bbox.min[1], sz[1], 1e-9, n + ' flanges: blank height');
        assert(f.bends.length === n, f.bends.length + ' bend lines for ' + n + ' flanges');
        assert(f.loops.length === 601, f.loops.length + ' loops in the blank');
        f.bends.forEach(function (bd, k) {
          // each bend line BA / 2 outside its edge, as long as the edge
          var horiz = Math.abs(bd.a[1] - bd.b[1]) < 1e-9, L = Math.hypot(bd.a[0] - bd.b[0], bd.a[1] - bd.b[1]);
          near(L, horiz ? 48 : 24, 1e-9, 'bend line ' + k + ' length');
          var off = horiz ? (bd.a[1] > -12 ? bd.a[1] : -24 - bd.a[1]) : (bd.a[0] > 24 ? bd.a[0] - 48 : -bd.a[0]);
          near(off, BA / 2, 1e-9, 'bend line ' + k + ' offset from its edge');
          near(bd.ba, BA, 1e-12, 'bend allowance');
        });
      });
    });
    test('rfOE: editing the first flange\'s length on the 600-hole panel rebuilds the four flanges from their references without a whole-body mesh, and the result is the fresh build\'s', function () {
      var m = rfOEmodel(rfOEcode(48, 24, 40, 15, 1.1, 1.4, rfOEflanges(48, 24, 4))), b = K.rebuild(m);
      rfOEerrs(b);
      var fl = m.features.filter(function (f) { return f.type === 'flange'; });
      assert(fl.every(function (f) { return f.pickRefs && f.pickRefs['edges.0']; }) || fl.every(function (f) { return f.pickRefs; }), 'the flanges carry no pick references');
      fl[0].length = 1.25;
      var c = rfOEcount(function () { return K.rebuild(m, b.cache); });
      rfOEerrs(c.r);
      assert(c.r.reused === m.features.indexOf(fl[0]), c.r.reused + ' features reused');
      assert(c.mesh === 0 && c.edges === 0, c.mesh + ' meshFromBody, ' + c.edges + ' bodyEdges in the edit rebuild');
      var fresh = K.rebuild(rfOEmodel(rfOEcode(48, 24, 40, 15, 1.1, 1.4, 'p.flange(1.25, [' + rfOEedge(48, 24, 0) + ']);\n' + [1, 2, 3].map(function (k) { return 'p.flange(1, [' + rfOEedge(48, 24, k) + ']);\n'; }).join(''))));
      assert(rfOEhash(c.r.body) === rfOEhash(fresh.body), 'the edited part differs from a fresh build: ' + rfOEhash(c.r.body) + ' / ' + rfOEhash(fresh.body));
      nearRel(K.massProps(K.meshFromBody(c.r.body), 1).volume, rfOEvolume(48, 24, 600, 4, 1) + 48 * 0.25 * T, 1e-9, 'volume');
    });

    // ---------------------------------------------------------------- 3. the 1800-hole panel: times
    // bounds: three times a quiet run on this PC (rebuild 3.5 s, a flange 0.6 s, edit of the last flange 0.33 s, of the first 1.8 s, flat 2.9 s), so a loaded machine passes
    test('rfOE: 48 x 24 panel, 1800 holes: four Edge Flanges rebuild in seconds (main: 26 to 32 s), each flange under a second, an edit of one flange and the flat pattern in seconds; closed, the closed-form volume and blank', function () {
      var m = rfOEmodel(rfOEcode(48, 24, 60, 30, 0.75, 0.72, rfOEflanges(48, 24, 4))), per = [], last = 0, lastT = 0;
      var t0 = Date.now(), c = rfOEcount(function () { return K.rebuild(m, null, { onProgress: function (i, n, f) { var t = Date.now(); if (last) per.push(t - lastT); last = f.type === 'flange' ? 1 : 0; lastT = t; } }); }), b = c.r;
      per.push(Date.now() - lastT);
      var ms = Date.now() - t0;
      rfOEerrs(b);
      assert(c.mesh === 0 && c.edges === 0 && c.whole === 0, c.mesh + ' meshFromBody, ' + c.edges + ' bodyEdges, ' + c.whole + ' picks from the whole body');
      assert(b.body.polygons.length > 170000, b.body.polygons.length + ' polygons');
      assert(ms < 12000, 'rebuild took ' + ms + ' ms');
      per.forEach(function (t, k) { assert(t < 2500, 'flange ' + (k + 1) + ' took ' + t + ' ms'); });
      var fl = m.features.filter(function (f) { return f.type === 'flange'; });
      fl[3].length = 1.5;
      var t1 = Date.now(), b2 = K.rebuild(m, b.cache), msEdit = Date.now() - t1;
      rfOEerrs(b2);
      assert(msEdit < 1500, 'the edit of the last flange took ' + msEdit + ' ms');
      fl[0].length = 1.5;
      var t2 = Date.now(), b3 = K.rebuild(m, b2.cache), msEdit0 = Date.now() - t2;
      rfOEerrs(b3);
      assert(msEdit0 < 7000, 'the edit of the first flange (four flanges rebuilt) took ' + msEdit0 + ' ms');
      var mesh = K.meshFromBody(b3.body), mp = K.massProps(mesh, 1);
      nearRel(mp.volume, rfOEvolume(48, 24, 1800, 4, 1) + (48 + 24) * 0.5 * T, 1e-9, 'volume');
      var ck = Evaluate.checkBody(b3.body, { maxPairs: 1 });
      assert(!ck.openEdges.length && !ck.nonManifoldEdges.length, ck.openEdges.length + ' open, ' + ck.nonManifoldEdges.length + ' non-manifold edges');
      var t3 = Date.now(), f = K.flatPattern(m, b3, mesh), msFlat = Date.now() - t3;
      assert(msFlat < 9000, 'the flat pattern took ' + msFlat + ' ms');
      var t4 = Date.now(), dxf = K.exportDXFFlat(f, 'in', {}), msDxf = Date.now() - t4;
      assert(msDxf < 3000, 'the flat DXF took ' + msDxf + ' ms');
      assert(f.loops.length === 1801 && f.bends.length === 4, f.loops.length + ' loops, ' + f.bends.length + ' bend lines');
      near(f.bbox.max[0] - f.bbox.min[0], 48 + 2 * BA + 2.5, 1e-9, 'blank width');
      near(f.bbox.max[1] - f.bbox.min[1], 24 + 2 * BA + 2.5, 1e-9, 'blank height');
      return 'rebuild ' + ms + ' ms (flanges ' + per.join(', ') + '), edit last ' + msEdit + ', edit first ' + msEdit0 + ', flat ' + msFlat + ', DXF ' + msDxf + ' ms (' + dxf.length + ' chars)';
    });
  })();
