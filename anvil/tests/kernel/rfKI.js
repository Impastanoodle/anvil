  // --- rfKI (2026-11-09, lane stepin2) --- The rest of customer STEP import (test-reports/2026-11-09-step-import.md):
  // (1) a mitred tray whose bend faces come first in the file and are read in fine facets (OpenCascade's order and
  // tessellation) lost every wall in the Insert Bends flat, silently: a facet of the bend 1° off the wall was taken for
  // the wall; (2) a flat that holds less metal than the part now says so; (3) a slot through a bend (a cylinder face
  // with an inner loop) is read, exact, and Insert Bends lays it in the flat; (4) Anvil's writer writes a bend notched by
  // a Rectangle / Obround auto relief whole (an L-shaped cylinder patch the reader now takes). T .06, K .44, inches.
  // OpenCascade's own files (and its B-spline cylinders marked as bends) are rows "rfKI" of tests/occt-tests.html.
  (function () {
    group('rfKI: customer STEP, the rest: walls never dropped, a slot through a bend developed, relief-notched bends written whole');
    var T = 0.06, KF = 0.44;
    function rfKIarea(loops) { return loops.reduce(function (s, l, i) { var a = Math.abs(K.signedArea(l)); return s + (i ? -a : a); }, 0); }
    function rfKIbox(l) { var lo = [Infinity, Infinity], hi = [-Infinity, -Infinity]; l.forEach(function (p) { for (var k = 0; k < 2; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } }); return { lo: lo, hi: hi }; }
    // the cylinder faces first in every CLOSED_SHELL, as OpenCascade orders a bent part's faces
    function rfKIcylFirst(text) {
      var cyl = {}, faceSurf = {};
      text.replace(/^#(\d+)=CYLINDRICAL_SURFACE\(/gm, function (m, id) { cyl[id] = 1; return m; });
      text.replace(/^#(\d+)=ADVANCED_FACE\('[^']*',\([^)]*\),#(\d+),/gm, function (m, id, s) { faceSurf[id] = s; return m; });
      return text.replace(/^(#\d+=CLOSED_SHELL\('[^']*',\()([^)]*)(\)\);)$/gm, function (m, a, list, b) {
        var ids = list.split(','), c = ids.filter(function (x) { return cyl[faceSurf[x.slice(1)]]; });
        return a + c.concat(ids.filter(function (x) { return c.indexOf(x) < 0; })).join(',') + b;
      });
    }
    // read a STEP into a new inch part and Insert Bends at the fixed face (K .44): { imp, model, build, mesh, flat }
    function rfKIinsert(step, fixed) {
      var imp = Exchange.importFile('customer.step', step, { units: 'in' }), m = Exchange.newPartFromImport(imp);
      assert(!imp.stats.openEdges, 'read back closed: ' + imp.stats.openEdges + ' open edges ' + imp.warnings.join('; '));
      new K.Builder(m).insertBends(fixed, { kFactor: KF });
      var b = K.rebuild(m), mesh = K.meshFromBody(b.body);
      assert(!Object.keys(b.errors).length, 'Insert Bends: ' + JSON.stringify(b.errors));
      return { imp: imp, model: m, build: b, mesh: mesh, flat: K.flatPattern(m, b, mesh) };
    }
    var TRAY = 'p.units("in");\np.sheet(' + T + ', ' + T + ', ' + KF + ');\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
      'p.flange(1, [[2, ' + T + ', 0], [4, ' + T + ', 1.5], [2, ' + T + ', 3], [0, ' + T + ', 1.5]], { position: "inside" });\n';
    // a U channel 2 wide, 2 high, 4 long (R .25), and a cut through one bend made flat: Unfold, cut, Fold (the cut's
    // walls in the bend are radial, so its developed shape is the sketch); BA = π/2 (R + K·T), the bend's middle at
    // x = R + T − BA / 2 in the unfolded part
    var UR = 0.25, UBA = Math.PI / 2 * (UR + KF * T), UMID = UR + T - UBA / 2;
    function rfKIu(cut) {
      return 'p.units("in");\np.sheet(' + T + ', ' + UR + ', ' + KF + ');\np.sketch("Top").rect(0, -4, 2, 4).end().baseFlange();\n' +
        'p.flange(2, [[0, ' + T + ', 2], [2, ' + T + ', 2]], { position: "inside" });\np.unfold([1, ' + T + ', 2], null);\n' +
        'p.sketch("Top")' + cut + '.end().extrude(1, { cut: true, through: true, both: true });\np.fold(null);\n';
    }
    var USLOT = rfKIu('.rect(' + (UMID - 0.125) + ', -2.375, 0.25, 0.75)'), UHOLE = rfKIu('.circle(' + UMID + ', -2, 0.1)');

    test('rfKI: a mitred tray with its bend faces first in the file, read in 2° facets (as OpenCascade sends it): the Insert Bends flat has all four walls (was the base and the bend strips only, 12.19 in², no warning)', function () {
      var src = build(TRAY); noErrors(src);
      var want = K.flatPattern(src.model, src.build, src.mesh), step = rfKIcylFirst(Exchange.exportSTEP(src.model, src.build, { faceted: true }));
      assert(step.indexOf('CLOSED_SHELL') > 0, 'a closed shell');
      K.setTessellation({ maxAngle: 2, maxSegs: 360 });
      var r;
      try { r = rfKIinsert(step, [2, 0, 1.5]); } finally { K.setTessellation('default'); }
      assert(r.flat.bends.length === 4, 'bends ' + r.flat.bends.length);
      near(rfKIarea(r.flat.loops), rfKIarea(want.loops), 1e-6, 'blank area = the tray\'s own flat');
      near(Math.max(r.flat.size[0], r.flat.size[1]), 6.031433605270157, 1e-6, 'flat length'); near(Math.min(r.flat.size[0], r.flat.size[1]), 5.031433605270157, 1e-6, 'flat width');
      assert(!r.flat.warnings.length, 'no warning: ' + r.flat.warnings.join('; '));
      return 'blank ' + rfKIarea(r.flat.loops).toFixed(6) + ' in²';
    });

    test('rfKI: a flat that holds less metal than the part says so (a bend Anvil\'s STEP writes as facets: a round hole through it; Insert Bends finds the other bend only and the leg past the faceted one is not laid)', function () {
      var src = build(UHOLE); noErrors(src);
      var r = rfKIinsert(Exchange.exportSTEP(src.model, src.build, { faceted: true }), [1, 0, 2]);
      assert(r.flat.bends.length === 1, 'one bend found: ' + r.flat.bends.length);
      var w = r.flat.warnings.filter(function (x) { return /less metal than the part/.test(x); });
      assert(w.length === 1, 'the warning: ' + r.flat.warnings.join('; '));
      return w[0];
    });

    test('rfKI: a .25 × .75 slot through a bend of a U channel (R .25): Anvil\'s STEP writes the bend whole (cylinders with the slot as an inner loop), the reader takes it exact, Insert Bends finds both bends and lays the slot: area and place = the developed slot within 1e-6', function () {
      var src = build(USLOT); noErrors(src);
      var own = K.flatPattern(src.model, src.build, src.mesh);
      assert(own.loops.length === 2, 'the part\'s own flat has the slot');
      var step = Exchange.exportSTEP(src.model, src.build, { faceted: true });
      assert((step.match(/=CYLINDRICAL_SURFACE\(/g) || []).length === 4, 'both bends whole: ' + (step.match(/=CYLINDRICAL_SURFACE\(/g) || []).length + ' cylinders');
      var r = rfKIinsert(step, [1, 0, 2]), b0 = K.rebuild(Exchange.newPartFromImport(r.imp));
      nearRel(K.massProps(K.meshFromBody(b0.body)).volume, src.mp.volume, 1e-9, 'read-back volume');
      assert(r.imp.solids[0].curves.surfs.filter(function (q) { return q.t === 'cyl'; }).length === 4, 'four cylinder records');
      var fl = r.flat;
      assert(fl.bends.length === 2 && fl.bends.every(function (b) { return Math.abs(b.R - UR) < 1e-9; }), 'two bends R .25: ' + fl.bends.map(function (b) { return b.label; }).join('; '));
      assert(!fl.warnings.length, 'no warning: ' + fl.warnings.join('; '));
      near(fl.size[0], own.size[0], 1e-9, 'flat length'); near(fl.size[1], own.size[1], 1e-9, 'flat width');
      assert(fl.loops.length === 2, 'outline + slot: ' + fl.loops.length);
      near(Math.abs(K.signedArea(fl.loops[1])), 0.25 * 0.75, 1e-6, 'slot area');
      near(rfKIarea(fl.loops), rfKIarea(own.loops), 1e-6, 'blank area');
      // the slot's corners against the blank's, as the part's own flat has them (the flat may be seen from the other side)
      var bo = rfKIbox(own.loops[0]), so = rfKIbox(own.loops[1]), bi = rfKIbox(fl.loops[0]), si = rfKIbox(fl.loops[1]);
      var got = [si.lo[0] - bi.lo[0], si.hi[0] - bi.lo[0], si.lo[1] - bi.lo[1], si.hi[1] - bi.lo[1]], W = bo.hi[0] - bo.lo[0], H = bo.hi[1] - bo.lo[1];
      var wx = [so.lo[0] - bo.lo[0], so.hi[0] - bo.lo[0]], wy = [so.lo[1] - bo.lo[1], so.hi[1] - bo.lo[1]];
      var fits = [[wx, wy], [[W - wx[1], W - wx[0]], wy], [wx, [H - wy[1], H - wy[0]]], [[W - wx[1], W - wx[0]], [H - wy[1], H - wy[0]]]].some(function (c) {
        return Math.abs(got[0] - c[0][0]) < 1e-6 && Math.abs(got[1] - c[0][1]) < 1e-6 && Math.abs(got[2] - c[1][0]) < 1e-6 && Math.abs(got[3] - c[1][1]) < 1e-6;
      });
      assert(fits, 'slot at ' + JSON.stringify(got) + ', developed ' + JSON.stringify([wx, wy]) + ' in ' + W + ' × ' + H);
      // the slot's centre across the bend: the bend line's station
      near((wx[0] + wx[1]) / 2 + bo.lo[0], UMID, 1e-9, 'the part\'s own slot on the bend line');
      return 'slot ' + Math.abs(K.signedArea(fl.loops[1])).toFixed(9) + ' in², flat ' + fl.size.map(function (x) { return x.toFixed(6); }).join(' × ');
    });

    test('rfKI: the reader\'s general cylinder patch: the slotted bend re-read from mm and with its cylinders as rational B-spline surfaces (as other CAD writes them), still exact and two bends', function () {
      var src = build(USLOT); noErrors(src);
      var s = Exchange.exportSTEP(src.model, src.build, { faceted: true }), st = Exchange.parseStep(s), E = st.ents, rep = {}, next = 1, extra = [];
      Object.keys(E).forEach(function (id) { next = Math.max(next, +id + 1); });
      function P(ref) { return E[ref.r].a[1].map(Number); }
      function D(ref) { var d = P(ref), l = Math.hypot(d[0], d[1], d[2]); return d.map(function (x) { return x / l; }); }
      function num(v) { var x = String(+(+v).toPrecision(15)); if (!/[.eE]/.test(x)) x = x.replace(/^(-?\d+)/, '$1.'); return x.replace('e', 'E'); }
      function pt(p) { var id = next++; extra.push('#' + id + '=CARTESIAN_POINT(\'\',(' + p.map(num).join(',') + '));'); return '#' + id; }
      var Wt = Math.SQRT1_2, ws = [1, Wt, 1, Wt, 1, Wt, 1, Wt, 1];
      Object.keys(E).forEach(function (id) {
        var e = E[id];
        if (e.t !== 'CYLINDRICAL_SURFACE') return;
        var a = E[e.a[1].r].a, o = P(a[1]), z = D(a[2]), x = D(a[3]), y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]], r = +e.a[2];
        function ring(h) { var out = []; for (var i = 0; i < 9; i++) { var th = i * Math.PI / 4, rr = i % 2 ? r * Math.SQRT2 : r; out.push(pt([0, 1, 2].map(function (k) { return o[k] + rr * (Math.cos(th) * x[k] + Math.sin(th) * y[k]) + h * z[k]; }))); } return out; }
        var lo = ring(-10), hi = ring(10);
        rep[id] = '(BOUNDED_SURFACE()B_SPLINE_SURFACE(2,1,(' + lo.map(function (q, i) { return '(' + q + ',' + hi[i] + ')'; }).join(',') + '),.UNSPECIFIED.,.F.,.F.,.F.)B_SPLINE_SURFACE_WITH_KNOTS((3,2,2,2,3),(2,2),(0.,1.,2.,3.,4.),(0.,1.),.UNSPECIFIED.)GEOMETRIC_REPRESENTATION_ITEM()RATIONAL_B_SPLINE_SURFACE((' + ws.map(function (w) { return '(' + num(w) + ',' + num(w) + ')'; }).join(',') + '))REPRESENTATION_ITEM(\'\')SURFACE())';
      });
      var sp = s.replace(/^#(\d+)=(.*);$/gm, function (m, id) { return rep[id] ? '#' + id + '=' + rep[id] + ';' : m; }).replace(/^ENDSEC;\s*\nEND-ISO/m, extra.join('\n') + '\nENDSEC;\nEND-ISO');
      assert(!/=CYLINDRICAL_SURFACE\(/.test(sp) && /RATIONAL_B_SPLINE_SURFACE/.test(sp), 'rewritten');
      var r = rfKIinsert(sp, [1, 0, 2]);
      nearRel(K.massProps(K.meshFromBody(K.rebuild(Exchange.newPartFromImport(r.imp)).body)).volume, src.mp.volume, 1e-9, 'read-back volume');
      assert(r.flat.bends.length === 2 && r.flat.loops.length === 2, 'two bends and the slot: ' + r.flat.bends.length + ' / ' + r.flat.loops.length);
      near(Math.abs(K.signedArea(r.flat.loops[1])), 0.1875, 1e-6, 'slot area');
    });

    test('rfKI: two inside flanges at a corner with a Rectangle / Obround auto relief: the notched bend (an L in (angle, t)) is written whole now, both bends two cylinders each, round trip to 1e-9, closed', function () {
      var T2 = 0.0747, R2 = 0.06;
      ['rect', 'obround'].forEach(function (rl) {
        var src = build('p.name("Tray").units("in");\np.sheet(' + T2 + ', ' + R2 + ', 0.5, { relief: "' + rl + '" });\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
          'p.flange(1, [[2, ' + T2 + ', 0]], { position: "inside" });\np.flange(1, [[4, ' + T2 + ', 1.5]], { position: "inside" });\n');
        noErrors(src);
        var step = Exchange.exportSTEP(src.model, src.build, { faceted: true }), rs = [];
        step.replace(/CYLINDRICAL_SURFACE\('',#\d+,([^)]+)\)/g, function (m0, x) { rs.push(+x); return m0; });
        assert(rs.filter(function (x) { return Math.abs(x - R2) < 1e-9; }).length === 2 && rs.filter(function (x) { return Math.abs(x - R2 - T2) < 1e-9; }).length === 2, rl + ': both bends whole: ' + JSON.stringify(rs));
        var imp = Exchange.importFile('part.step', step, { units: 'in' }), mesh = K.meshFromBody(K.rebuild(Exchange.newPartFromImport(imp)).body), q = K.meshQuality(mesh);
        assert(!imp.warnings.length, rl + ': ' + imp.warnings.join('; '));
        assert(q.closed && !q.openEdges && !q.nonManifoldEdges, rl + ': read back closed');
        nearRel(K.massProps(mesh).volume, src.mp.volume, 1e-9, rl + ': round trip volume');
      });
    });

    test('rfKI: Insert Bends on the customer parts of rfKD gives no metal warning (the check is quiet on every good flat): L bracket and corner-notched tray through Anvil\'s STEP', function () {
      var L = 'p.units("in");\np.sketch("Front").polyline([[0, 1.5], [0, 0], [2, 0], [2, 0.06], [0.06, 0.06], [0.06, 1.5]], true).end().extrude(2);\np.fillet(0.06, [[0.06, 0.06, 1]]);\np.fillet(0.12, [[0, 0, 1]]);\n';
      var NOTCHED = TRAY + 'p.sketch("Top").rect(-0.1, -0.25, 0.35, 0.35).rect(3.75, -0.25, 0.35, 0.35).rect(-0.1, -3.1, 0.35, 0.35).rect(3.75, -3.1, 0.35, 0.35).end().extrude(3, { cut: true, through: true, both: true });\n';
      [[L, [1, 0, 1]], [NOTCHED, [2, 0, 1.5]], [TRAY, [2, 0, 1.5]]].forEach(function (c) {
        var src = build(c[0]); noErrors(src);
        var r = rfKIinsert(Exchange.exportSTEP(src.model, src.build, { faceted: true }), c[1]);
        assert(!r.flat.warnings.length, 'warnings: ' + r.flat.warnings.join('; '));
      });
    });
  })();
  // --- end rfKI ---
