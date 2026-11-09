  // --- rfKD (2026-11-09, lane importbend) --- A customer's STEP of a formed part, through Insert Bends, to the flat DXF.
  // The parts are solids as a customer's CAD sends them (a sharp thin profile extruded and its corners filleted R inside
  // and R + T outside; the tray from flanges with square corner notches), written by Anvil's STEP writer and then
  // rewritten the way other CAD systems write the same part: millimetres, every circle a RATIONAL B-spline curve (a full
  // circle the edge is trimmed from), every line a degree-1 B-spline, every cylinder a rational B-spline surface, every
  // plane a bilinear B-spline surface. Each reads back closed, Insert Bends finds every bend with its own radius, the
  // blank is the analytic developed size (legs + BA = A(R + K·T)), holes land where they should and the DXF is one
  // closed outline, the holes and the bend lines. Plus the reader's two known gaps (test-reports/2026-11-06-step-audit.md):
  // sealed voids (BREP_WITH_VOIDS) and several solids in one file. T .06, K .44, inches.
  (function () {
    group('rfKD: customer STEP (mm, B-spline curves and surfaces, voids, several solids) → Insert Bends → flat DXF, analytic');
    var T = 0.06, KF = 0.44, Q = Math.PI / 2;
    function ba(r, A) { return (A == null ? Q : A) * (r + KF * T); }
    // a thin part from its chain (material on the chain's left, T thick), extruded D along +Z from the Front plane; each
    // corner k (1 .. n − 2) in `radii` is filleted r inside and r + T outside (a left turn: the chain is its outside)
    function rfKDthin(chain, D, radii) {
      var n = chain.length, segs = [], inner = [], i;
      for (i = 0; i + 1 < n; i++) {
        var a = chain[i], b = chain[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
        segs.push([[a[0] + nx * T, a[1] + ny * T], [b[0] + nx * T, b[1] + ny * T]]);
      }
      inner.push(segs[0][0]);
      for (i = 1; i < segs.length; i++) {
        var p = segs[i - 1][0], r = [segs[i - 1][1][0] - p[0], segs[i - 1][1][1] - p[1]], q = segs[i][0], s = [segs[i][1][0] - q[0], segs[i][1][1] - q[1]];
        var t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / (r[0] * s[1] - r[1] * s[0]);
        inner.push([p[0] + r[0] * t, p[1] + r[1] * t]);
      }
      inner.push(segs[segs.length - 1][1]);
      var code = 'p.units("in");\np.sketch("Front").polyline(' + JSON.stringify(chain.concat(inner.slice().reverse())) + ', true).end().extrude(' + D + ');\n';
      Object.keys(radii).forEach(function (k) {
        k = +k;
        var u = [chain[k][0] - chain[k - 1][0], chain[k][1] - chain[k - 1][1]], v = [chain[k + 1][0] - chain[k][0], chain[k + 1][1] - chain[k][1]];
        var out = u[0] * v[1] - u[1] * v[0] > 0 ? chain[k] : inner[k], inn = out === chain[k] ? inner[k] : chain[k];
        code += 'p.fillet(' + radii[k] + ', [[' + inn[0] + ', ' + inn[1] + ', ' + D / 2 + ']]);\np.fillet(' + (radii[k] + T) + ', [[' + out[0] + ', ' + out[1] + ', ' + D / 2 + ']]);\n';
      });
      return code;
    }
    // the chain's developed length: each segment less the setbacks (r + T on a corner the chain is the outside of, r
    // on one it is the inside of), plus each bend's BA
    function rfKDdeveloped(chain, radii) {
      var sb = chain.map(function () { return 0; }), total = 0;
      Object.keys(radii).forEach(function (k) {
        k = +k;
        var u = [chain[k][0] - chain[k - 1][0], chain[k][1] - chain[k - 1][1]], v = [chain[k + 1][0] - chain[k][0], chain[k + 1][1] - chain[k][1]];
        sb[k] = u[0] * v[1] - u[1] * v[0] > 0 ? radii[k] + T : radii[k];
        total += ba(radii[k]);
      });
      for (var i = 0; i + 1 < chain.length; i++) total += Math.hypot(chain[i + 1][0] - chain[i][0], chain[i + 1][1] - chain[i][1]) - sb[i] - sb[i + 1];
      return total;
    }
    var L_CHAIN = [[0, 1.5], [0, 0], [2, 0]], U_CHAIN = [[0, 2], [0, 0], [2, 0], [2, 2]], HAT_CHAIN = [[0, 0], [1, 0], [1, 1.5], [3, 1.5], [3, 0], [4, 0]];
    var HAT_R = { 1: 0.06, 2: 0.09, 3: 0.12, 4: 0.03 };
    // U: Ø.25 holes in the base (x 1, z 2) and through both legs (y 1 at z 1; y 1.5 at z 3)
    var U_HOLES = 'p.sketch("Top").circle(1, -2, 0.125).end().extrude(1, { cut: true, through: true, both: true });\n' +
      'p.sketch("Right", 3).circle(-1, 1, 0.125).circle(-3, 1.5, 0.125).end().extrude(3, { cut: true, through: true, reverse: true });\n';
    // the tray: 4 × 3 base, four 1.12 flanges (Material Inside), the corners notched .25 square through everything
    var TRAY = 'p.units("in");\np.sheet(' + T + ', ' + T + ', ' + KF + ');\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
      'p.flange(1, [[2, ' + T + ', 0], [4, ' + T + ', 1.5], [2, ' + T + ', 3], [0, ' + T + ', 1.5]], { position: "inside" });\n' +
      'p.sketch("Top").rect(-0.1, -0.25, 0.35, 0.35).rect(3.75, -0.25, 0.35, 0.35).rect(-0.1, -3.1, 0.35, 0.35).rect(3.75, -3.1, 0.35, 0.35).end().extrude(3, { cut: true, through: true, both: true });\n';
    var PARTS = {
      L: { code: rfKDthin(L_CHAIN, 2, { 1: 0.06 }), fixed: [1, 0, 1], len: rfKDdeveloped(L_CHAIN, { 1: 0.06 }), wid: 2, bends: [0.06] },
      U: { code: rfKDthin(U_CHAIN, 4, { 1: 0.06, 2: 0.06 }) + U_HOLES, fixed: [1, 0, 1.5], len: rfKDdeveloped(U_CHAIN, { 1: 0.06, 2: 0.06 }), wid: 4, bends: [0.06, 0.06], holes: 5 },
      TRAY: { code: TRAY, fixed: [2, 0, 1.5], len: 4 - 0.24 + 2 * ba(T) + 2 * (1.12 - 0.12), wid: 3 - 0.24 + 2 * ba(T) + 2 * (1.12 - 0.12), bends: [T, T, T, T] },
      HAT: { code: rfKDthin(HAT_CHAIN, 3, HAT_R), fixed: [2, 1.56, 1.5], len: rfKDdeveloped(HAT_CHAIN, HAT_R), wid: 3, bends: [0.03, 0.06, 0.09, 0.12] }
    };
    var srcCache = {};
    function rfKDsrc(name) {
      if (!srcCache[name]) { var r = build(PARTS[name].code); noErrors(r); srcCache[name] = { r: r, step: Exchange.exportSTEP(r.model, r.build, { faceted: true }) }; }
      return srcCache[name];
    }
    function rfKDnum(v) { var s = String(+(+v).toPrecision(15)); if (!/[.eE]/.test(s)) s = s.replace(/^(-?\d+)/, '$1.'); return s.replace('e', 'E'); }
    // Anvil's inch STEP rewritten in millimetres (the unit, every point, vector length and radius)
    function rfKDmm(text) {
      var k = 25.4, sc = function (x) { return rfKDnum(+x * k); };
      return text.replace(/^(#\d+=)\(CONVERSION_BASED_UNIT\('INCH',#\d+\)LENGTH_UNIT\(\)NAMED_UNIT\(#\d+\)\);$/m, '$1(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));')
        .replace(/^(#\d+=CARTESIAN_POINT\('[^']*',\()([^)]*)(\)\);)$/gm, function (m, a, c, b) { return a + c.split(',').map(sc).join(',') + b; })
        .replace(/^(#\d+=(?:VECTOR|CIRCLE|CYLINDRICAL_SURFACE)\('[^']*',#\d+,)([^,)]+)(\);)$/gm, function (m, a, c, b) { return a + sc(c) + b; })
        .replace(/^(#\d+=ELLIPSE\('[^']*',#\d+,)([^,]+),([^)]+)(\);)$/gm, function (m, a, c, d, b) { return a + sc(c) + ',' + sc(d) + b; });
    }
    // every CIRCLE / LINE / CYLINDRICAL_SURFACE (and with planes: PLANE) entity replaced in place by the B-spline other
    // CAD systems write: a full rational circle from the placement's x axis (the edge trims it at its vertices), a
    // degree-1 curve over the edge, a rational cylinder 4 quarters round and 2 units past the part each way, a bilinear
    // patch over the plane
    function rfKDsplines(text, planes) {
      var st = Exchange.parseStep(text), E = st.ents, next = 1, extra = [], big = 0, rep = {};
      Object.keys(E).forEach(function (id) { next = Math.max(next, +id + 1); if (E[id].t === 'CARTESIAN_POINT') E[id].a[1].forEach(function (v) { big = Math.max(big, Math.abs(+v)); }); });
      big = 2 * big + 2;
      function P(ref) { return E[ref.r].a[1].map(Number); }
      function D(ref) { var d = P(ref), l = Math.hypot(d[0], d[1], d[2]); return d.map(function (x) { return x / l; }); }
      function ax(ref) { var a = E[ref.r].a, z = D(a[2]), x = D(a[3]); return { o: P(a[1]), z: z, x: x, y: [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]] }; }
      function at(A, th, r, h) { return [0, 1, 2].map(function (k) { return A.o[k] + r * (Math.cos(th) * A.x[k] + Math.sin(th) * A.y[k]) + h * A.z[k]; }); }
      function pt(p) { var id = next++; extra.push('#' + id + '=CARTESIAN_POINT(\'\',(' + p.map(rfKDnum).join(',') + '));'); return '#' + id; }
      var W = Math.SQRT1_2, ws = [1, W, 1, W, 1, W, 1, W, 1];
      function ring(A, r, h) { var out = []; for (var i = 0; i < 9; i++) out.push(at(A, i * Math.PI / 4, i % 2 ? r * Math.SQRT2 : r, h)); return out; }
      Object.keys(E).forEach(function (id) {
        var e = E[id], A;
        if (e.t === 'CIRCLE') {
          A = ax(e.a[1]);
          rep[id] = '(BOUNDED_CURVE()B_SPLINE_CURVE(2,(' + ring(A, +e.a[2], 0).map(pt).join(',') + '),.CIRCULAR_ARC.,.F.,.F.)B_SPLINE_CURVE_WITH_KNOTS((3,2,2,2,3),(0.,1.,2.,3.,4.),.UNSPECIFIED.)CURVE()GEOMETRIC_REPRESENTATION_ITEM()RATIONAL_B_SPLINE_CURVE((' + ws.map(rfKDnum).join(',') + '))REPRESENTATION_ITEM(\'\'))';
        } else if (e.t === 'LINE') {
          var p0 = P(e.a[1]), v = E[e.a[2].r].a, d = D(v[1]), m = +v[2];
          rep[id] = 'B_SPLINE_CURVE_WITH_KNOTS(\'\',1,(' + pt(p0) + ',' + pt(p0.map(function (x, k) { return x + d[k] * m; })) + '),.POLYLINE_FORM.,.F.,.F.,(2,2),(0.,1.),.UNSPECIFIED.)';
        } else if (e.t === 'CYLINDRICAL_SURFACE') {
          A = ax(e.a[1]);
          var lo = ring(A, +e.a[2], -big).map(pt), hi = ring(A, +e.a[2], big).map(pt);
          rep[id] = '(BOUNDED_SURFACE()B_SPLINE_SURFACE(2,1,(' + lo.map(function (q, i) { return '(' + q + ',' + hi[i] + ')'; }).join(',') + '),.UNSPECIFIED.,.F.,.F.,.F.)B_SPLINE_SURFACE_WITH_KNOTS((3,2,2,2,3),(2,2),(0.,1.,2.,3.,4.),(0.,1.),.UNSPECIFIED.)GEOMETRIC_REPRESENTATION_ITEM()RATIONAL_B_SPLINE_SURFACE((' + ws.map(function (w) { return '(' + rfKDnum(w) + ',' + rfKDnum(w) + ')'; }).join(',') + '))REPRESENTATION_ITEM(\'\')SURFACE())';
        } else if (e.t === 'PLANE' && planes) {
          A = ax(e.a[1]);
          var c = function (s, t) { return pt([0, 1, 2].map(function (k) { return A.o[k] + big * (s * A.x[k] + t * A.y[k]); })); };
          rep[id] = 'B_SPLINE_SURFACE_WITH_KNOTS(\'\',1,1,((' + c(-1, -1) + ',' + c(-1, 1) + '),(' + c(1, -1) + ',' + c(1, 1) + ')),.PLANE_SURF.,.F.,.F.,.F.,(2,2),(2,2),(0.,1.),(0.,1.),.UNSPECIFIED.)';
        }
      });
      return text.replace(/^#(\d+)=(.*);$/gm, function (m, id, body) { return rep[id] ? '#' + id + '=' + rep[id] + ';' : m; }).replace(/^ENDSEC;\s*\nEND-ISO/m, extra.join('\n') + '\nENDSEC;\nEND-ISO');
    }
    // read a STEP into a new inch part, Insert Bends at the fixed face (K .44), flat, DXF
    function rfKDflat(step, fixed) {
      var imp = Exchange.importFile('customer.step', step, { units: 'in' }), m = Exchange.newPartFromImport(imp);
      assert(!imp.stats.openEdges, 'read back closed: ' + imp.stats.openEdges + ' open edges ' + imp.warnings.join('; '));
      var b0 = K.rebuild(m), mp0 = K.massProps(K.meshFromBody(b0.body));
      new K.Builder(m).insertBends(fixed, { kFactor: KF });
      var b = K.rebuild(m), mesh = K.meshFromBody(b.body);
      assert(!Object.keys(b.errors).length, 'Insert Bends: ' + JSON.stringify(b.errors));
      near(m.sheet.thickness, T, 1e-9, 'T measured');
      var fl = K.flatPattern(m, b, mesh), dxf = K.exportDXFFlat(fl, 'in');
      return { imp: imp, model: m, volume: mp0.volume, flat: fl, dxf: dxf, check: DxfCheck.check(dxf, { units: 'in' }) };
    }
    function rfKDlong(fl) { return Math.max(fl.size[0], fl.size[1]); }
    function rfKDshort(fl) { return Math.min(fl.size[0], fl.size[1]); }
    // the analytic flat, the bends with their own radii, one closed outline + holes + bend lines in the DXF
    function rfKDsame(r, part, tag, tolV) {
      var src = rfKDsrc(part).r, P = PARTS[part], fl = r.flat;
      nearRel(r.volume, src.mp.volume, tolV || 1e-9, tag + ': read-back volume');
      assert(fl.bends.length === P.bends.length, tag + ': bends ' + fl.bends.length + ' (' + fl.bends.map(function (b) { return b.label; }).join('; ') + ')');
      var rs = fl.bends.map(function (b) { return b.R; }).sort(), want = P.bends.slice().sort();
      rs.forEach(function (x, i) { near(x, want[i], 1e-9, tag + ': bend radius ' + i); });
      near(rfKDlong(fl), Math.max(P.len, P.wid), 1e-6, tag + ': flat length'); near(rfKDshort(fl), Math.min(P.len, P.wid), 1e-6, tag + ': flat width');
      var c = r.check;
      assert(c.ok, tag + ': DXF ' + c.errors.join('; '));
      var outl = c.loops.filter(function (l) { return l.layer === 'OUTLINE'; });
      assert(outl.length === 1 && outl[0].closed, tag + ': one closed outline, got ' + JSON.stringify(outl));
      assert(c.circles.filter(function (q) { return q.layer === 'HOLES'; }).length === (P.holes || 0), tag + ': holes ' + JSON.stringify(c.circles));
      var bl = DxfCheck.parse(r.dxf).entities.filter(function (e) { return e.layer === 'BEND'; });
      assert(bl.length === P.bends.length, tag + ': bend lines ' + bl.length);
      return fl;
    }
    function rfKDvariants(part) {
      var s = rfKDsrc(part).step, P = PARTS[part], out = [];
      [['Anvil inch', s], ['mm', rfKDmm(s)], ['mm, B-spline curves + cylinders', rfKDsplines(rfKDmm(s))], ['inch, all B-spline (planes too)', rfKDsplines(s, true)]].forEach(function (v) {
        if (v[0] !== 'Anvil inch') assert(v[1] !== s, v[0] + ': the file changed');
        var r = rfKDflat(v[1], P.fixed);
        out.push({ name: v[0], r: r, fl: rfKDsame(r, part, part + ' ' + v[0]) });
      });
      return out;
    }

    test('rfKD: the rewrites look like other CAD output: mm unit, RATIONAL_B_SPLINE_CURVE / _SURFACE, no CIRCLE / LINE / CYLINDRICAL_SURFACE / PLANE left in use', function () {
      var s = rfKDsrc('L').step, mm = rfKDmm(s), sp = rfKDsplines(mm, true);
      assert(/SI_UNIT\(\.MILLI\.,\.METRE\.\)/.test(mm) && !/CONVERSION_BASED_UNIT\('INCH'/.test(mm), 'mm unit');
      assert(/RATIONAL_B_SPLINE_CURVE/.test(sp) && /RATIONAL_B_SPLINE_SURFACE/.test(sp) && /\.PLANE_SURF\./.test(sp), 'B-spline entities');
      assert(!/=(CIRCLE|LINE|CYLINDRICAL_SURFACE|PLANE)\(/.test(sp), 'no analytic entity left');
      // the reader takes them back exactly: same volume, a closed solid, the cylinders' records (exact mass)
      var r = Exchange.importFile('x.step', sp, { units: 'in' }), b = K.rebuild(Exchange.newPartFromImport(r));
      assert(!r.stats.openEdges && !r.warnings.length, 'closed, no warning: ' + r.warnings.join('; '));
      nearRel(K.massProps(K.meshFromBody(b.body)).volume, rfKDsrc('L').r.mp.volume, 1e-9, 'volume');
      assert(r.solids[0].curves && r.solids[0].curves.surfs.filter(function (q) { return q.t === 'cyl'; }).length === 2, 'two cylinder records');
    });

    test('rfKD: L bracket (legs 2 / 1.5 outside, R .06, width 2): every rewrite → one bend R .060, flat 1.88 + 1.38 + BA by 2, DXF outline + 1 bend line', function () {
      var v = rfKDvariants('L');
      near(rfKDlong(v[0].fl), 1.88 + 1.38 + ba(0.06), 1e-9, 'the analytic flat by hand');
      return v.map(function (x) { return x.name + ' ' + rfKDlong(x.fl).toFixed(6); }).join(', ');
    });

    test('rfKD: U channel 2 × 2 × 4 with Ø.25 holes in the base and through both legs: two bends, flat 5.7914, every hole at its developed place', function () {
      var v = rfKDvariants('U'), W = PARTS.U.len, x0 = 2 - 0.12 + ba(0.06) + 1 - 0.12;
      // in the flat: across = from the left leg's free edge (leg holes 1 and .5 in), along = z
      var want = [[1, 1], [0.5, 3], [x0, 2], [W - 1, 1], [W - 0.5, 3]];
      v.forEach(function (x) {
        var c = x.r.check, holes = c.circles.filter(function (q) { return q.layer === 'HOLES'; }), e = c.extents;
        holes.forEach(function (h) { near(h.r, 0.125, 1e-9, x.name + ': hole radius'); });
        // the flat lies on the base's outside: x = world x (left leg's free edge at 0), y = world z
        near(e.max[0] - e.min[0], W, 1e-6, x.name + ': DXF width'); near(e.max[1] - e.min[1], 4, 1e-9, x.name + ': DXF height');
        var got = holes.map(function (h) { return [h.c[0] - e.min[0], h.c[1] - e.min[1]]; });
        assert(got.length === want.length, x.name + ': ' + got.length + ' holes');
        want.forEach(function (w) {
          assert(got.some(function (g) { return Math.abs(g[0] - w[0]) < 1e-6 && Math.abs(g[1] - w[1]) < 1e-6; }), x.name + ': a hole at ' + JSON.stringify(w) + ' of ' + JSON.stringify(got));
        });
      });
      return 'flat ' + rfKDlong(v[0].fl).toFixed(6) + ' × ' + rfKDshort(v[0].fl).toFixed(4);
    });

    test('rfKD: tray 4 × 3 × 1.12, four flanges, .25 square corner notches: four bends, flat 6.0314 × 5.0314, blank area analytic', function () {
      var v = rfKDvariants('TRAY'), s = 0.25, RT = 0.12, H = 1.12 - RT, B = ba(T);
      var area = (4 - 2 * RT) * (3 - 2 * RT) - 4 * (s - RT) * (s - RT) + 2 * (4 - 2 * s) * (B + H) + 2 * (3 - 2 * s) * (B + H);
      v.forEach(function (x) {
        var a = x.fl.loops.reduce(function (t, l) { var s2 = 0; for (var i = 0; i < l.length; i++) { var p = l[i], q = l[(i + 1) % l.length]; s2 += p[0] * q[1] - q[0] * p[1]; } return t + s2 / 2; }, 0);
        near(Math.abs(a), area, 1e-6, x.name + ': blank area');
      });
      return 'blank ' + area.toFixed(6) + ' in²';
    });

    test('rfKD: hat channel, unequal radii (R .06 / .09 / .12 / .03), fixed on the top or on a brim (the two brims lie in one plane: two plates, not a ring)', function () {
      var v = rfKDvariants('HAT');
      var brim = rfKDflat(rfKDsrc('HAT').step, [0.5, 0, 1.5]);
      rfKDsame(brim, 'HAT', 'HAT fixed on a brim');
      var other = rfKDflat(rfKDsrc('HAT').step, [3.5, 0, 1.5]);
      rfKDsame(other, 'HAT', 'HAT fixed on the other brim');
      return 'flat ' + rfKDlong(v[0].fl).toFixed(6) + ' (' + v[0].fl.bends.map(function (b) { return b.label; }).join('; ') + ')';
    });

    test('rfKD: the hat solid itself (no STEP): Insert Bends no longer reads the coplanar brims as one plate', function () {
      var r = build(PARTS.HAT.code + 'p.insertBends([2, 1.56, 1.5], { kFactor: ' + KF + ' });\n');
      noErrors(r);
      var fl = K.flatPattern(r.model, r.build, r.mesh);
      assert(fl.bends.length === 4, 'bends ' + fl.bends.length);
      near(rfKDlong(fl), PARTS.HAT.len, 1e-9, 'flat');
    });

    test('rfKD: sealed voids (BREP_WITH_VOIDS + ORIENTED_CLOSED_SHELL .F.): one solid, the void subtracted exactly (each void was a solid of its own: +0.6 %)', function () {
      var r = build('p.units("mm");\np.box(40, 30, 20);\np.sketch("Top", 5).rect(10, -20, 10, 8).end().extrude(6, { merge: false });\n');
      noErrors(r);
      var s = Exchange.exportSTEP(r.model, r.build, { faceted: true }), ids = [];
      s.replace(/^#(\d+)=MANIFOLD_SOLID_BREP\('[^']*',#(\d+)\);$/gm, function (m, id, sh) { ids.push([id, sh]); return m; });
      assert(ids.length === 2, 'two solids written: ' + ids.length);
      var v = s.replace(new RegExp('^#' + ids[0][0] + '=MANIFOLD_SOLID_BREP\\(\'([^\']*)\',#' + ids[0][1] + '\\);$', 'm'), '#' + ids[0][0] + '=BREP_WITH_VOIDS(\'$1\',#' + ids[0][1] + ',(#' + ids[1][0] + '));')
        .replace(new RegExp('^#' + ids[1][0] + '=MANIFOLD_SOLID_BREP\\(\'[^\']*\',#' + ids[1][1] + '\\);$', 'm'), '#' + ids[1][0] + '=ORIENTED_CLOSED_SHELL(\'\',*,#' + ids[1][1] + ',.F.);');
      assert(/BREP_WITH_VOIDS/.test(v) && /ORIENTED_CLOSED_SHELL/.test(v), 'rewritten');
      var imp = Exchange.importFile('void.step', v, { units: 'mm' });
      assert(imp.solids.length === 1 && !imp.stats.openEdges, 'one closed solid, got ' + imp.solids.length);
      var b = K.rebuild(Exchange.newPartFromImport(imp));
      near(K.massProps(K.meshFromBody(b.body)).volume, 40 * 30 * 20 - 10 * 8 * 6, 1e-9, 'volume = block − void');
    });

    test('rfKD: several solids in one file (the bracket and a separate block): both read, Insert Bends on the bracket gives its flat', function () {
      var r = build(PARTS.L.code + 'p.sketch("Top").rect(4, -1, 1, 1).end().extrude(0.5, { merge: false });\n');
      noErrors(r);
      var s = Exchange.exportSTEP(r.model, r.build, { faceted: true });
      assert((s.match(/=MANIFOLD_SOLID_BREP\(/g) || []).length === 2, 'two solids in the file');
      var imp = Exchange.importFile('two.step', rfKDsplines(rfKDmm(s)), { units: 'in' });
      assert(imp.solids.length === 2, 'solids ' + imp.solids.length);
      var f = rfKDflat(rfKDsplines(rfKDmm(s)), PARTS.L.fixed);
      near(rfKDlong(f.flat), PARTS.L.len, 1e-6, 'flat'); assert(f.flat.bends.length === 1, 'one bend');
    });

    test('rfKD: a ruled B-spline face that is not a cylinder (a bend\'s weights off: no longer round) reads as a ruled strip between its rails, closed, with no cylinder record, so Insert Bends does not take it for a bend', function () {
      var s = rfKDsplines(rfKDsrc('L').step).replace(/RATIONAL_B_SPLINE_SURFACE\(\(\(1\.,1\.\),\(([^,]+),([^)]+)\)/, 'RATIONAL_B_SPLINE_SURFACE(((1.,1.),(0.7,0.7)');
      var imp = Exchange.importFile('x.step', s, { units: 'in' });
      assert(!imp.stats.openEdges, 'closed: ' + JSON.stringify(imp.stats) + ' ' + imp.warnings.join('; '));
      assert(imp.solids[0].curves.surfs.filter(function (q) { return q.t === 'cyl'; }).length === 1, 'one cylinder record left');
      var m = Exchange.newPartFromImport(imp);
      m.sheet = null;
      K.runScript(m, 'p.insertBends(' + JSON.stringify(PARTS.L.fixed) + ', { thickness: ' + T + ', kFactor: ' + KF + ' });');
      var b = K.rebuild(m), err = Object.keys(b.errors).map(function (k) { return b.errors[k]; }).join(' ');
      assert(/no sharp corner/.test(err), 'Insert Bends: ' + err);
    });
  })();
  // --- end rfKD ---
