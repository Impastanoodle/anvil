  // --- rfNT (2026-11-16, lane solidfid4: solids fidelity 4) ---
  // 1. kernel-curves.js, Mass Properties of a panel read from STEP (600 holes: 56 s, its Insert Bends flat 340 s): the
  //    faces of a part read from a file are triangles of one bridged ring, a quarter of them needles; planarIndex's
  //    box grid gave up on them and every query for the flat face beside a hole wall ran the whole plane.
  //    planarRaster files each polygon in the cells its outline covers; dirTable finds the direction clusters of
  //    boundCorrection without asking every one; a candidate edge compares its last 8 sampled cells, not all.
  //    The same numbers to the last bit (K.massOptions switches each off to compare).
  // 2. kernel-mesh.js, Chamfer with two distances (f.d2) and with angle + distance (f.angle), f.flip: which face takes
  //    d is decided at the picked edge (one face planar: that one; else the face looking more to +Y, +X, +Z) and
  //    carried along the selection. Closed forms; the corner where three unequal chamfers meet is the plane through
  //    the three faces' setback corners (= OpenCascade's BRepFilletAPI_MakeChamfer Add(d1, d2, E, F) to 1e-14 on the
  //    corners it builds three-sided).
  (function () {
    group('rfNT: solids fidelity 4: Mass Properties of a panel read from STEP in seconds; Chamfer with two distances and with angle + distance');
    var X = typeof Exchange !== 'undefined' ? Exchange : null, PI = Math.PI;
    function rfNTwith(obj, key, value, fn) { var was = obj[key]; obj[key] = value; try { return fn(); } finally { obj[key] = was; } }
    // ---------------------------------------------------------------- 1. the panel
    var rfNTplate = null;
    function rfNTpanel() {
      if (rfNTplate) return rfNTplate;
      if (!X) fail('exchange.js is not loaded');
      var T = 0.0598, r = build('p.units("in");\np.sheet(' + T + ', ' + T + ', 0.44);\np.sketch("Top").rect(0, -10, 12, 10).end().baseFlange();\np.flange(1, [[6, ' + T + ', 0]]);\np.flange(1, [[6, ' + T + ', 10]]);\np.sketch("Top", ' + T + ').circle(0.75, -0.75, 0.125).end().extrude(1, { cut: true, through: true, both: true });\np.linearPattern({ dir: "x", spacing: 1, count: 12, dir2: "z", spacing2: 0.85, count2: 10 });\n');
      noErrors(r);
      var res = X.importFile('rfNT.step', X.exportSTEP(r.model, r.build), { units: 'in' }), m2 = X.newPartFromImport(res), b2 = K.rebuild(m2);
      rfNTplate = { part: r, body: b2.body, polys: b2.body.polygons };
      return rfNTplate;
    }
    function rfNTcorr(polys) {
      var C = K._.cellOps, p0 = C.planar, q0 = C.query, f0 = C.fill, s0 = C.samples, c = K.curveCorrection(polys);
      return { json: JSON.stringify(c), planar: C.planar - p0, query: C.query - q0, fill: C.fill - f0, samples: C.samples - s0 };
    }
    test('rfNT: a 16 ga 12 × 10 plate with 120 holes and two flanges, read from STEP: the curve correction of Mass Properties is the same to the last bit with the outline grid on and off, and looks at under a twentieth of the polygons (the faces are triangles of one ring, a quarter of them needles: the box grid gave up and every query ran the whole face)', function () {
      var P = rfNTpanel(), on = rfNTcorr(P.polys), off = rfNTwith(K.massOptions, 'planarRaster', false, function () { return rfNTcorr(P.polys); });
      assert(on.json === off.json, 'the correction differs with the outline grid: ' + on.json.slice(0, 120) + ' / ' + off.json.slice(0, 120));
      assert(on.planar * 20 < off.planar, 'polygons looked at: ' + on.planar + ' with the grid, ' + off.planar + ' without');
      var mp = K.massProps(K.meshFromBody(P.body), 1);
      nearRel(mp.volume, P.part.mp.volume, 1e-12, 'volume of the part read back');
      return on.planar + ' polygons looked at, ' + off.planar + ' without the grid (' + (off.planar / on.planar).toFixed(0) + ' × fewer); volume ' + mp.volume.toFixed(9);
    });
    test('rfNT: on that plate the bounding-plane search opens the same cells and files the same edges whether a candidate edge compares its last 8 sampled cells or all of them, and whether the direction clusters are found through the table or by asking each (same counts, same result to the last bit)', function () {
      var P = rfNTpanel(), a = rfNTcorr(P.polys);
      var b = rfNTwith(K.massOptions, 'sampleWindow', Infinity, function () { return rfNTcorr(P.polys); });
      var c = rfNTwith(K.massOptions, 'dirTable', false, function () { return rfNTcorr(P.polys); });
      assert(a.json === b.json && a.json === c.json, 'the correction differs');
      assert(a.query === b.query && a.samples === b.samples, 'cells opened: ' + a.query + ' (last 8) / ' + b.query + ' (all); samples ' + a.samples + ' / ' + b.samples);
      assert(a.fill === c.fill && a.query === c.query, 'edges filed: ' + a.fill + ' (table) / ' + c.fill + ' (each cluster asked); cells opened ' + a.query + ' / ' + c.query);
      return a.fill + ' cells filed, ' + a.query + ' opened, ' + a.samples + ' samples';
    });
    test('rfNT: a long edge across fine cells (a 40 × .5 strip with a slanted cut beside 30 small holes, read from STEP): comparing the last 8 sampled cells opens exactly the cells that comparing all of them opens', function () {
      if (!X) fail('exchange.js is not loaded');
      var r = build('p.units("in");\np.sketch("Top").polyline([[0, 0], [40, 0], [40, -0.5], [0, -0.3]], true).end().extrude(0.06);\np.sketch("Top", 0.06).circle(0.6, -0.15, 0.03).end().extrude(1, { cut: true, through: true, both: true });\np.linearPattern({ dir: "x", spacing: 1.3, count: 30 });\np.fillet(0.03, [[20, 0.06, 0]]);\n');
      noErrors(r);
      var res = X.importFile('rfNT.step', X.exportSTEP(r.model, r.build), { units: 'in' }), polys = K.rebuild(X.newPartFromImport(res)).body.polygons;
      var a = rfNTcorr(polys), b = rfNTwith(K.massOptions, 'sampleWindow', Infinity, function () { return rfNTcorr(polys); });
      assert(a.json === b.json, 'the correction differs');
      assert(a.query === b.query && a.samples === b.samples && a.samples > 0, 'cells opened: ' + a.query + ' / ' + b.query + ', samples ' + a.samples + ' / ' + b.samples);
      return a.samples + ' samples, ' + a.query + ' cells opened both ways';
    });
    // (task 3) a plate sketched with its holes takes the plate path (plateCutParts) instead of one boolean with every hole
    test('rfNT: a 16 ga 12 × 10 Base Flange sketched with 120 staggered Ø.25 holes: built without a boolean (the plate path a Cut-Extrude of the same circles takes), closed, the analytic volume to 1e-12 and the boolean\'s to 1e-10, the hole walls true cylinders; 20 holes, and a drafted Boss-Extrude with 120, still take the boolean (the same polygons with the switch off)', function () {
      var T = 0.0598;
      function code(n, rows, extra) {
        var s = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.44);\nvar s = p.sketch("Top").rect(0, -10, 12, 10);\nfor (var j = 0; j < ' + rows + '; j++) for (var i = 0; i < ' + (n / rows) + '; i++) s.circle(0.75 + 0.9 * (i + (j % 2 ? 0.5 : 0.25)), -(0.75 + 0.9 * j), 0.125);\n';
        return s + (extra || 's.end().baseFlange();\n');
      }
      function sig(r) { return JSON.stringify(r.body.polygons.map(function (p) { return p.vertices.map(function (v) { return [v.pos.x, v.pos.y, v.pos.z]; }); })); }
      function closed(r, label) { var c = Evaluate.checkBody(r.body, { maxPairs: 1 }); assert(!c.openEdges.length && !c.nonManifoldEdges.length, label + ': ' + c.openEdges.length + ' open, ' + c.nonManifoldEdges.length + ' non-manifold'); }
      K.plateOptions.last = null;
      var a = build(code(120, 10)), used = K.plateOptions.last;
      noErrors(a); closed(a, 'plate path');
      assert(used && used.holes === 120, 'the plate path was not taken: ' + JSON.stringify(used));
      var b = rfNTwith(K.solidOptions, 'plate', false, function () { return build(code(120, 10)); });
      noErrors(b); closed(b, 'boolean');
      var want = 12 * 10 * T - 120 * PI * 0.125 * 0.125 * T;
      nearRel(a.mp.volume, want, 1e-12, 'plate path against the formula');
      nearRel(a.mp.volume, b.mp.volume, 1e-10, 'plate path against the boolean');
      var cyl = a.body.polygons.filter(function (p) { return p.surf && p.surf.s && p.surf.s.t === 'cyl'; }).length, cylB = b.body.polygons.filter(function (p) { return p.surf && p.surf.s && p.surf.s.t === 'cyl'; }).length;
      assert(cyl > 0 && cyl <= cylB, 'cylinder facets: ' + cyl + ' (plate path), ' + cylB + ' (boolean)');
      // the flat pattern of the sheet: 121 loops either way, the same area
      var fa = K.flatPattern(a.model, a.build, a.mesh), fb = K.flatPattern(b.model, b.build, b.mesh);
      assert(fa.loops.length === 121 && fb.loops.length === 121, 'flat loops ' + fa.loops.length + ' / ' + fb.loops.length);
      // under plateOptions.minLoops holes, and holes that are no straight prisms: the boolean, as before
      var few = build(code(20, 4)), fewB = rfNTwith(K.solidOptions, 'plate', false, function () { return build(code(20, 4)); });
      assert(sig(few) === sig(fewB), '20 holes: the polygons differ with the switch off');
      var dr = 's.end().extrude(0.5, { draft: 3 });\n', d1 = build(code(120, 10, dr)), d2 = rfNTwith(K.solidOptions, 'plate', false, function () { return build(code(120, 10, dr)); });
      noErrors(d1);
      assert(sig(d1) === sig(d2), 'drafted: the polygons differ with the switch off');
      return a.body.polygons.length + ' polygons (boolean ' + b.body.polygons.length + '), volume ' + ((a.mp.volume - want) / want).toExponential(1) + ' off the formula, the boolean ' + ((b.mp.volume - want) / want).toExponential(1);
    });
    // ---------------------------------------------------------------- 2. chamfers
    var rfNTBLOCK = 'p.units("in");\np.sketch("Top").rect(0, -2, 3, 2).end().extrude(1);\n';   // x 0..3, y 0..1, z 0..2
    function rfNTbuild(code, patch) {
      var m = K.newModel('rfNT');
      K.runScript(m, code);
      m.features.forEach(function (f) { if (f.type === 'chamfer') Object.keys(patch || {}).forEach(function (k) { f[k] = patch[k]; }); });
      var b = K.rebuild(m), open = 0, nm = 0;
      (b.bodies || []).forEach(function (x) { var c = Evaluate.checkBody(x); open += c.openEdges.length; nm += c.nonManifoldEdges.length; });
      return { model: m, build: b, body: b.body, errors: b.errors, errs: Object.keys(b.errors || {}).map(function (k) { return b.errors[k]; }), open: open, nm: nm, vol: b.body ? K.massProps(K.meshFromBody(b.body), 1).volume : null };
    }
    function rfNTok(r, want, rel, label) {
      assert(!r.errs.length, label + ': ' + r.errs.join(' | '));
      assert(!r.open && !r.nm, label + ': ' + r.open + ' open, ' + r.nm + ' non-manifold edges');
      nearRel(r.vol, want, rel, label);
      return ((r.vol - want) / want).toExponential(1);
    }
    function rfNTrefused(r, re, label) { assert(r.errs.length === 1 && re.test(r.errs[0]), label + ': ' + (r.errs.join(' | ') || 'built, volume ' + r.vol)); return r.errs[0]; }
    function rfNTch(d, pts) { return rfNTBLOCK + 'p.chamfer(' + d + ', ' + JSON.stringify(pts) + ');'; }
    // the reach of the chamfer faces (polygons that are no block face) on each axis
    function rfNTreach(r) {
      var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      r.body.polygons.forEach(function (p) {
        var n = p.plane.normal;
        if (Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)) > 1 - 1e-9) return;
        p.vertices.forEach(function (v) { [v.pos.x, v.pos.y, v.pos.z].forEach(function (c, i) { lo[i] = Math.min(lo[i], c); hi[i] = Math.max(hi[i], c); }); });
      });
      return { lo: lo, hi: hi };
    }
    // an independent closed form: the volume of the box cut by planes (keep n·x >= w), by clipping its faces
    function rfNTclip(box, planes) {
      var x0 = box[0], y0 = box[1], z0 = box[2], x1 = box[3], y1 = box[4], z1 = box[5];
      var faces = [[[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
        [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]];
      function dt(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
      function sb(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
      function cr(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
      planes.forEach(function (pl) {
        var out = [], cut = [];
        function onCut(p) { if (!cut.some(function (q) { return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 1e-11; })) cut.push(p); }
        faces.forEach(function (poly) {
          var res = [];
          for (var i = 0; i < poly.length; i++) {
            var a = poly[i], b = poly[(i + 1) % poly.length], da = dt(pl.n, a) - pl.w, db = dt(pl.n, b) - pl.w;
            if (Math.abs(da) < 1e-12) da = 0;
            if (Math.abs(db) < 1e-12) db = 0;
            if (da >= 0) res.push(a);
            if (da === 0) onCut(a);
            if ((da > 0 && db < 0) || (da < 0 && db > 0)) { var t = da / (da - db), p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; res.push(p); onCut(p); }
          }
          if (res.length >= 3) out.push(res);
        });
        if (cut.length >= 3) {
          var c = [0, 0, 0];
          cut.forEach(function (p) { c = [c[0] + p[0] / cut.length, c[1] + p[1] / cut.length, c[2] + p[2] / cut.length]; });
          var u = sb(cut[0], c), v = cr(pl.n, u);
          cut.sort(function (p, q) { return Math.atan2(dt(sb(p, c), v), dt(sb(p, c), u)) - Math.atan2(dt(sb(q, c), v), dt(sb(q, c), u)); });
          out.push(cut);
        }
        faces = out;
      });
      var O = [0, 0, 0], nv = 0, vol = 0;
      faces.forEach(function (f) { f.forEach(function (p) { O = [O[0] + p[0], O[1] + p[1], O[2] + p[2]]; nv++; }); });
      O = [O[0] / nv, O[1] / nv, O[2] / nv];
      faces.forEach(function (f) { for (var i = 1; i + 1 < f.length; i++) vol += Math.abs(dt(sb(f[0], O), cr(sb(f[i], O), sb(f[i + 1], O)))) / 6; });
      return vol;
    }
    // the plane of a chamfer: through E + uA sA and E + uB sB along dir, keeping the side away from the edge point E
    function rfNTplane(E, uA, sA, uB, sB, dir) {
      var P = [E[0] + uA[0] * sA, E[1] + uA[1] * sA, E[2] + uA[2] * sA], Q = [E[0] + uB[0] * sB, E[1] + uB[1] * sB, E[2] + uB[2] * sB], d = [Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]];
      var n = [dir[1] * d[2] - dir[2] * d[1], dir[2] * d[0] - dir[0] * d[2], dir[0] * d[1] - dir[1] * d[0]], l = Math.hypot(n[0], n[1], n[2]);
      n = [n[0] / l, n[1] / l, n[2] / l];
      var w = n[0] * P[0] + n[1] * P[1] + n[2] * P[2];
      return n[0] * E[0] + n[1] * E[1] + n[2] * E[2] > w ? { n: [-n[0], -n[1], -n[2]], w: -w } : { n: n, w: w };
    }
    function rfNTthrough(A, B, C, away) {
      var u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]], n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(n[0], n[1], n[2]);
      n = [n[0] / l, n[1] / l, n[2] / l];
      var w = n[0] * A[0] + n[1] * A[1] + n[2] * A[2];
      return n[0] * away[0] + n[1] * away[1] + n[2] * away[2] > w ? { n: [-n[0], -n[1], -n[2]], w: -w } : { n: n, w: w };
    }
    var rfNTBOX = [0, 0, 0, 3, 1, 2], rfNTtopFront = [1.5, 1, 2], rfNTtopRight = [3, 1, 1], rfNTrightFront = [3, 0.5, 2];
    test('rfNT: Distance Distance on a block\'s top front edge, d = .25, d2 = .5: 6 − ½ · .25 · .5 · 3 (1e-9); d lies on the top face (the face looking up: the chamfer runs from .25 back on the top to .5 down the front); Flip direction swaps them, the same volume', function () {
      var a = rfNTbuild(rfNTch(0.25, [rfNTtopFront]), { d2: 0.5 }), b = rfNTbuild(rfNTch(0.25, [rfNTtopFront]), { d2: 0.5, flip: true });
      var ra = rfNTok(a, 6 - 0.5 * 0.25 * 0.5 * 3, 1e-9, 'd .25 d2 .5'), rb = rfNTok(b, 6 - 0.5 * 0.25 * 0.5 * 3, 1e-9, 'flipped');
      var A = rfNTreach(a), B = rfNTreach(b);
      near(A.lo[2], 1.75, 1e-12, 'top face setback (z)'); near(A.lo[1], 0.5, 1e-12, 'front face setback (y)');
      near(B.lo[2], 1.5, 1e-12, 'flipped: top face setback (z)'); near(B.lo[1], 0.75, 1e-12, 'flipped: front face setback (y)');
      // every edge of the block, both ways: the removed prism is ½ d d2 × the edge's length
      [[[1.5, 1, 0], 3], [[3, 1, 1], 2], [[0, 1, 1], 2], [[3, 0.5, 2], 1], [[0, 0.5, 0], 1], [[1.5, 0, 2], 3], [[3, 0, 1], 2]].forEach(function (c) {
        [false, true].forEach(function (fl) { rfNTok(rfNTbuild(rfNTch(0.25, [c[0]]), { d2: 0.5, flip: fl }), 6 - 0.5 * 0.25 * 0.5 * c[1], 1e-9, 'edge at ' + c[0] + (fl ? ' flipped' : '')); });
      });
      // the bottom front edge: the front wall outranks the face looking down, so d is on the wall
      var C = rfNTreach(rfNTbuild(rfNTch(0.25, [[1.5, 0, 2]]), { d2: 0.5 }));
      near(C.hi[1], 0.25, 1e-12, 'bottom front edge: d up the wall'); near(C.lo[2], 1.5, 1e-12, 'bottom front edge: d2 on the bottom');
      return ra + ', flipped ' + rb;
    });
    test('rfNT: Angle Distance on the same edge, d = .25 at 30 deg: the other setback is .25 tan 30 = .1443 down the front, 6 − ½ · .25² tan 30 · 3 (1e-9); flipped, .1443 on the top; 45 deg is the equal-distance chamfer\'s volume', function () {
      var t = Math.tan(PI / 6), a = rfNTbuild(rfNTch(0.25, [rfNTtopFront]), { angle: 30 }), b = rfNTbuild(rfNTch(0.25, [rfNTtopFront]), { angle: 30, flip: true });
      var ra = rfNTok(a, 6 - 0.5 * 0.25 * 0.25 * t * 3, 1e-9, 'angle 30'); rfNTok(b, 6 - 0.5 * 0.25 * 0.25 * t * 3, 1e-9, 'angle 30 flipped');
      var A = rfNTreach(a), B = rfNTreach(b);
      near(A.lo[2], 1.75, 1e-12, 'top setback'); near(A.lo[1], 1 - 0.25 * t, 1e-12, 'front setback');
      near(B.lo[2], 2 - 0.25 * t, 1e-12, 'flipped: top setback'); near(B.lo[1], 0.75, 1e-12, 'flipped: front setback');
      rfNTok(rfNTbuild(rfNTch(0.25, [rfNTtopFront]), { angle: 45 }), rfNTbuild(rfNTch(0.25, [rfNTtopFront]), {}).vol, 1e-12, 'angle 45 against equal distance');
      rfNTok(rfNTbuild(rfNTch(0.25, [rfNTtopFront]), { angle: 60 }), 6 - 0.5 * 0.25 * 0.25 * Math.tan(PI / 3) * 3, 1e-9, 'angle 60');
      return ra;
    });
    test('rfNT: equal distances build what they built: d2 = d, and d2 given as the same text, give the polygons of the chamfer without d2, vertex for vertex', function () {
      function sig(r) { return JSON.stringify(r.body.polygons.map(function (p) { return [p.vertices.map(function (v) { return [v.pos.x, v.pos.y, v.pos.z]; }), p.plane.w]; })); }
      var pts = [rfNTtopFront, rfNTtopRight, rfNTrightFront], s0 = sig(rfNTbuild(rfNTch(0.25, pts), {}));
      assert(sig(rfNTbuild(rfNTch(0.25, pts), { d2: 0.25 })) === s0, 'd2 = d differs');
      assert(sig(rfNTbuild(rfNTch(0.25, pts), { d2: '0.25', flip: true })) === s0, 'd2 = "0.25", flipped, differs');
      var CYL = 'p.units("in");\np.sketch("Top").circle(0, 0, 1).end().extrude(1.5);\np.chamfer(0.25, [[1, 1.5, 0]]);';
      assert(sig(rfNTbuild(CYL, { d2: 0.25 })) === sig(rfNTbuild(CYL, {})), 'cylinder rim: d2 = d differs');
      return 'identical';
    });
    test('rfNT: a cylinder\'s rim both ways round (R 1, 1.5 high): d = .25 on the flat top and d2 = .1 down the wall, flipped .1 on the top and .25 down; by angle 30 deg both ways: each the cone frustum\'s closed form (1e-9); a Ø1 hole\'s rim in a plate the same', function () {
      var CYL = 'p.units("in");\np.sketch("Top").circle(0, 0, 1).end().extrude(1.5);\np.chamfer(0.25, [[1, 1.5, 0]]);', R = 1, H = 1.5, t = 0.25 * Math.tan(PI / 6);
      function cone(a, b) { return PI * R * R * H - PI * b * (R * R - (R * R + R * (R - a) + (R - a) * (R - a)) / 3); }   // a in on the top, b down the wall
      var out = [rfNTok(rfNTbuild(CYL, { d2: 0.1 }), cone(0.25, 0.1), 1e-9, 'd .25 top, d2 .1 wall'), rfNTok(rfNTbuild(CYL, { d2: 0.1, flip: true }), cone(0.1, 0.25), 1e-9, 'flipped'),
        rfNTok(rfNTbuild(CYL, { angle: 30 }), cone(0.25, t), 1e-9, 'angle 30'), rfNTok(rfNTbuild(CYL, { angle: 30, flip: true }), cone(t, 0.25), 1e-9, 'angle 30 flipped')];
      var HOLE = 'p.units("in");\np.sketch("Top").rect(-2, -2, 4, 4).circle(0, 0, 0.5).end().extrude(1);\np.chamfer(0.1, [[0.5, 1, 0]]);';
      function csk(a, b) { return 16 - PI * 0.25 - PI * b * (((0.5 + a) * (0.5 + a) + (0.5 + a) * 0.5 + 0.25) / 3 - 0.25); }
      out.push(rfNTok(rfNTbuild(HOLE, { d2: 0.2 }), csk(0.1, 0.2), 1e-9, 'hole rim d .1 on the plate, d2 .2 down the hole'), rfNTok(rfNTbuild(HOLE, { d2: 0.2, flip: true }), csk(0.2, 0.1), 1e-9, 'hole rim flipped'));
      return out.join(', ');
    });
    test('rfNT: a cone\'s rim (frustum R 2 to R 1.5, the top meets the cone at 116.57 deg): d = .1 on the top and d2 = .2 down the cone, flipped, and by angle 30 deg (the other setback .1 sin 30 / sin 146.57): the triangle\'s solid of revolution (1e-9); 70 deg there is refused in plain words', function () {
      var C = 'p.units("in");\np.sketch("Front").polyline([[0, 0], [2, 0], [1.5, 1], [0, 1]], true).end().revolve(360, { axis: "y" });\np.chamfer(0.1, [[1.5, 1, 0]]);';
      var V0 = PI * (4 + 3 + 2.25) / 3, kn = Math.hypot(0.5, 1), uC = [0.5 / kn, -1 / kn], th = Math.acos(-uC[0]);
      function rem(sP, sC) { var A = [1.5 - sP, 0], B = [1.5 + uC[0] * sC, uC[1] * sC], ar = 0.5 * Math.abs((A[0] - 1.5) * B[1] - (B[0] - 1.5) * A[1]); return 2 * PI * (1.5 + A[0] + B[0]) / 3 * ar; }
      var out = [rfNTok(rfNTbuild(C, { d2: 0.2 }), V0 - rem(0.1, 0.2), 1e-9, 'd .1 top, d2 .2 cone'), rfNTok(rfNTbuild(C, { d2: 0.2, flip: true }), V0 - rem(0.2, 0.1), 1e-9, 'flipped'),
        rfNTok(rfNTbuild(C, { angle: 30 }), V0 - rem(0.1, 0.1 * Math.sin(PI / 6) / Math.sin(th + PI / 6)), 1e-9, 'angle 30')];
      rfNTrefused(rfNTbuild(C, { angle: 70 }), /^Failed to create chamfer\. The angle 70° is too large for the 116\.57° corner between these faces/, 'angle 70');
      return out.join(', ');
    });
    test('rfNT: a tangent chain (the top edge of a 4 × 3 plate with R.5 corners, picked on a straight or on a corner): d = .1 on the top all the way round, d2 = .2 down the walls: ½ d d2 (10 + 2π (R − d/3)) (1e-9); flipped; the bottom edge has d up the walls (the wall outranks a face looking down)', function () {
      var P = 'p.units("in");\np.sketch("Top").rect(0, -3, 4, 3).end().extrude(1);\np.fillet(0.5, [[0, 0.5, 0], [4, 0.5, 0], [4, 0.5, 3], [0, 0.5, 3]]);\n', R = 0.5, V0 = 12 - (4 - PI) * R * R, c = 0.5 - 0.5 * Math.SQRT1_2;
      function rem(a, b) { return 0.5 * a * b * (10 + 2 * PI * (R - a / 3)); }   // a in on the face, b down the wall
      var out = [rfNTok(rfNTbuild(P + 'p.chamfer(0.1, [[2, 1, 0]]);', { d2: 0.2 }), V0 - rem(0.1, 0.2), 1e-9, 'picked on a straight'),
        rfNTok(rfNTbuild(P + 'p.chamfer(0.1, [[' + c + ', 1, ' + c + ']]);', { d2: 0.2 }), V0 - rem(0.1, 0.2), 1e-9, 'picked on a corner'),
        rfNTok(rfNTbuild(P + 'p.chamfer(0.1, [[2, 1, 0]]);', { d2: 0.2, flip: true }), V0 - rem(0.2, 0.1), 1e-9, 'flipped'),
        rfNTok(rfNTbuild(P + 'p.chamfer(0.1, [[2, 1, 0]]);', { angle: 60 }), V0 - rem(0.1, 0.1 * Math.tan(PI / 3)), 1e-9, 'angle 60'),
        rfNTok(rfNTbuild(P + 'p.chamfer(0.1, [[2, 0, 0]]);', { d2: 0.2 }), V0 - rem(0.2, 0.1), 1e-9, 'the bottom edge')];
      return out.join(', ');
    });
    test('rfNT: an inside (concave) edge of an L, d = .25, d2 = .5 and by angle 30 deg: the chamfer adds ½ d d2 × 2 (1e-9)', function () {
      var L = 'p.units("in");\np.sketch("Front").polyline([[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]], true).end().extrude(2);\np.chamfer(0.25, [[1, 1, 1]]);', V = 10;
      var a = rfNTbuild(L, { d2: 0.5 }), ra = rfNTok(a, V + 0.5 * 0.25 * 0.5 * 2, 1e-9, 'd .25 d2 .5');
      rfNTok(rfNTbuild(L, { d2: 0.5, flip: true }), V + 0.5 * 0.25 * 0.5 * 2, 1e-9, 'flipped');
      rfNTok(rfNTbuild(L, { angle: 30 }), V + 0.5 * 0.25 * 0.25 * Math.tan(PI / 6) * 2, 1e-9, 'angle 30');
      // d on the face looking up (y = 1, the L's step), d2 up the wall x = 1
      var A = rfNTreach(a);
      near(A.hi[0], 1.25, 1e-12, 'setback on the step'); near(A.hi[1], 1.5, 1e-12, 'setback up the wall');
      return ra;
    });
    test('rfNT: three edges meeting at a block\'s corner with d = .25, d2 = .5: the corner is the plane through the three faces\' setback corners; the volume is the block cut by the three chamfer planes and that plane (1e-9; OpenCascade 5.65625). Flipped, by angle 30 deg (OpenCascade 5.896489968290086) and d = .1, d2 = .6 (5.834) the same way', function () {
      // by the rule: top/front and top/right have d on the top, right/front has d on the right (+X before +Z)
      function want(d, e, fl) {   // d on the ranked face, e on the other (fl: swapped)
        var a = fl ? e : d, b = fl ? d : e;
        var pl = [rfNTplane([1.5, 1, 2], [0, 0, -1], a, [0, -1, 0], b, [1, 0, 0]), rfNTplane([3, 1, 1], [-1, 0, 0], a, [0, -1, 0], b, [0, 0, 1]), rfNTplane([3, 0.5, 2], [0, 0, -1], a, [-1, 0, 0], b, [0, 1, 0])];
        // setback corners: on the top (y = 1): x from top/right's setback on the top, z from top/front's; on the right
        // (x = 3): y from top/right's setback on the right, z from right/front's; on the front (z = 2): x, y likewise
        pl.push(rfNTthrough([3 - a, 1, 2 - a], [3, 1 - b, 2 - a], [3 - b, 1 - b, 2], [3, 1, 2]));
        return rfNTclip(rfNTBOX, pl);
      }
      var pts = [rfNTtopFront, rfNTtopRight, rfNTrightFront], t = 0.25 * Math.tan(PI / 6);
      near(want(0.25, 0.5, false), 5.65625, 1e-12, 'the clipped block against OpenCascade');
      near(want(0.25, t, false), 5.896489968290086, 1e-12, 'the clipped block against OpenCascade, angle 30');
      near(want(0.1, 0.6, false), 5.834, 1e-12, 'the clipped block against OpenCascade, .1 / .6');
      var out = [rfNTok(rfNTbuild(rfNTch(0.25, pts), { d2: 0.5 }), want(0.25, 0.5, false), 1e-9, 'd .25 d2 .5'), rfNTok(rfNTbuild(rfNTch(0.25, pts), { d2: 0.5, flip: true }), want(0.25, 0.5, true), 1e-9, 'flipped'),
        rfNTok(rfNTbuild(rfNTch(0.25, pts), { angle: 30 }), want(0.25, t, false), 1e-9, 'angle 30'), rfNTok(rfNTbuild(rfNTch(0.1, pts), { d2: 0.6 }), want(0.1, 0.6, false), 1e-9, 'd .1 d2 .6')];
      // equal distances: the same construction is the old corner triangle
      rfNTok(rfNTbuild(rfNTch(0.25, pts), {}), want(0.25, 0.25, false), 1e-9, 'equal .25');
      return out.join(', ');
    });
    test('rfNT: two chamfered edges at a corner: sharing the top face (d on it for both) they meet on the plane between them; top/front with right/front (d on the top for one, on the right for the other) each runs out past the corner: both the block cut by the two chamfer planes (1e-9; OpenCascade 5.697916666666667 and 5.770833333333333)', function () {
      var p1 = rfNTplane([1.5, 1, 2], [0, 0, -1], 0.25, [0, -1, 0], 0.5, [1, 0, 0]), p2 = rfNTplane([3, 1, 1], [-1, 0, 0], 0.25, [0, -1, 0], 0.5, [0, 0, 1]), p3 = rfNTplane([3, 0.5, 2], [0, 0, -1], 0.25, [-1, 0, 0], 0.5, [0, 1, 0]);
      near(rfNTclip(rfNTBOX, [p1, p2]), 5.697916666666667, 1e-12, 'clip against OpenCascade (mirror)');
      near(rfNTclip(rfNTBOX, [p1, p3]), 5.770833333333333, 1e-12, 'clip against OpenCascade (not mirrored)');
      return rfNTok(rfNTbuild(rfNTch(0.25, [rfNTtopFront, rfNTtopRight]), { d2: 0.5 }), rfNTclip(rfNTBOX, [p1, p2]), 1e-9, 'sharing the top') + ', ' +
        rfNTok(rfNTbuild(rfNTch(0.25, [rfNTtopFront, rfNTrightFront]), { d2: 0.5 }), rfNTclip(rfNTBOX, [p1, p3]), 1e-9, 'd on different faces');
    });
    test('rfNT: all twelve edges of the block, d = .1, d2 = .2: closed, every corner three-sided: the block cut by the twelve chamfer planes and the eight corner planes (1e-9)', function () {
      var pts = [[1.5, 1, 2], [1.5, 1, 0], [3, 1, 1], [0, 1, 1], [1.5, 0, 2], [1.5, 0, 0], [3, 0, 1], [0, 0, 1], [3, 0.5, 2], [0, 0.5, 2], [3, 0.5, 0], [0, 0.5, 0]];
      var d = 0.1, e = 0.2, N = { x0: [-1, 0, 0], x1: [1, 0, 0], y0: [0, -1, 0], y1: [0, 1, 0], z0: [0, 0, -1], z1: [0, 0, 1] };
      function first(a, b) { var A = N[a], B = N[b], ax = [1, 0, 2]; for (var k = 0; k < 3; k++) if (A[ax[k]] !== B[ax[k]]) return A[ax[k]] > B[ax[k]] ? a : b; return a; }
      function leg(a, b, on) { return first(a, b) === on ? d : e; }   // the setback of edge a/b on face `on`
      var planes = [], S = [0, 3], T = [0, 1], U = [0, 2];
      [0, 1].forEach(function (iy) { [0, 1].forEach(function (iz) { var fy = 'y' + iy, fz = 'z' + iz; planes.push(rfNTplane([1.5, T[iy], U[iz]], [0, 0, -N[fz][2]], leg(fy, fz, fy), [0, -N[fy][1], 0], leg(fy, fz, fz), [1, 0, 0])); }); });
      [0, 1].forEach(function (ix) { [0, 1].forEach(function (iy) { var fx = 'x' + ix, fy = 'y' + iy; planes.push(rfNTplane([S[ix], T[iy], 1], [-N[fx][0], 0, 0], leg(fx, fy, fy), [0, -N[fy][1], 0], leg(fx, fy, fx), [0, 0, 1])); }); });
      [0, 1].forEach(function (ix) { [0, 1].forEach(function (iz) { var fx = 'x' + ix, fz = 'z' + iz; planes.push(rfNTplane([S[ix], 0.5, U[iz]], [-N[fx][0], 0, 0], leg(fx, fz, fz), [0, 0, -N[fz][2]], leg(fx, fz, fx), [0, 1, 0])); }); });
      [0, 1].forEach(function (ix) { [0, 1].forEach(function (iy) { [0, 1].forEach(function (iz) {
        var fx = 'x' + ix, fy = 'y' + iy, fz = 'z' + iz, V = [S[ix], T[iy], U[iz]], sx = -N[fx][0], sy = -N[fy][1], sz = -N[fz][2];
        // on face fy: x from edge fx/fy's setback on fy, z from edge fy/fz's; and so on round
        var Py = [V[0] + sx * leg(fx, fy, fy), V[1], V[2] + sz * leg(fy, fz, fy)], Px = [V[0], V[1] + sy * leg(fx, fy, fx), V[2] + sz * leg(fx, fz, fx)], Pz = [V[0] + sx * leg(fx, fz, fz), V[1] + sy * leg(fy, fz, fz), V[2]];
        planes.push(rfNTthrough(Py, Px, Pz, V));
      }); }); });
      var r = rfNTbuild(rfNTch(d, pts), { d2: e }), want = rfNTclip(rfNTBOX, planes);
      return rfNTok(r, want, 1e-9, 'twelve edges') + ', volume ' + r.vol.toFixed(9);
    });
    test('rfNT: what is not built says so: Distance 2 of zero, an angle outside 0 to 180, an angle too large for a square corner, two distances on a saddle between two cylinders; D2@Chamfer and D3@Chamfer name d2 and the angle, and d2 may be an equation', function () {
      var B = rfNTch(0.25, [rfNTtopFront]);
      rfNTrefused(rfNTbuild(B, { d2: 0 }), /^Distance 2 must be greater than zero\.$/, 'd2 0');
      rfNTrefused(rfNTbuild(B, { angle: 0 }), /^Angle must be between 0 and 180 degrees\.$/, 'angle 0');
      rfNTrefused(rfNTbuild(B, { angle: 95 }), /^Failed to create chamfer\. The angle 95° is too large for the 90° corner/, 'angle 95');
      rfNTrefused(rfNTbuild(B, { d2: 1.5 }), /^Failed to create chamfer\. The distance may be too large/, 'd2 1.5 down a wall 1 high');
      var TEE = 'p.units("in");\np.cylinder(1, 6, { axis: "x", at: [-3, 0, 0] });\np.cylinder(0.5, 3, { at: [0, 0, 0] });\np.chamfer(0.0625, [[0, Math.sqrt(0.75), 0.5]]);';
      var msg = rfNTrefused(rfNTbuild(TEE, { d2: 0.1 }), /^Failed to create chamfer\. Anvil's kernel cannot build a Distance Distance \/ Angle Distance chamfer on an edge where two curved faces meet yet; use Equal distance there/, 'saddle');
      assert(!rfNTbuild(TEE, {}).errs.length, 'the equal-distance saddle chamfer still builds');
      var r = rfNTbuild(B, { d2: 0.5, angle: null }), nm = r.model.features.filter(function (f) { return f.type === 'chamfer'; })[0].name;
      var c2 = K.designTableColumn(r.model, 'D2@' + nm), c3 = K.designTableColumn(r.model, 'D3@' + nm);
      assert(c2.field === 'd2' && c2.kind === 'dim', 'D2@' + nm + ': ' + JSON.stringify(c2));
      assert(c3.error, 'D3@' + nm + ' with no angle: ' + JSON.stringify(c3));
      assert(K.designTableColumn(rfNTbuild(B, { angle: 30 }).model, 'D3@' + nm).field === 'angle', 'D3 is the angle');
      rfNTok(rfNTbuild('p.units("in");\np.equations({ W: "0.25 * 2" });\n' + B.replace('p.units("in");\n', ''), { d2: '=W' }), 6 - 0.5 * 0.25 * 0.5 * 3, 1e-9, 'd2 = W');
      return msg;
    });
  })();
