  // --- rfIN (2026-11-05, lane drawfix): detail view names as SolidWorks writes them; flat-pattern views of parts made by
  // Insert Bends on rounded bends (lane rfIH) = the same part made with Base Flange; exact torus silhouettes ---
  (function () {
    group('rfIN: Detail View A (2 : 1), Insert Bends (rounded) flat views = Base Flange flat views, torus silhouettes');
    var DW = Drawing, T = 0.06, R = 0.06;
    test('rfIN: a detail view is named "Detail View A (2 : 1)" (SolidWorks 2024 spacing), also after fitting to a smaller scale', function () {
      var r = build('p.name("Plate").units("mm");\np.box(100, 60, 8);\np.hole("Top", 20, -20, 10, { offset: 8 });');
      noErrors(r);
      var doc = DW.newDrawing(r.model, { projection: 'third' });
      DW.standard3View(doc, r.mesh, 'mm');
      var Tv = doc.views.filter(function (v) { return v.orient === 'Top'; })[0];
      var dv = DW.addDetailView(doc, r.mesh, Tv.id, { c: [20, -20], r: 10, x: 300, y: 100 });
      assert(dv.name === DW.detailName(dv.label, dv.scale) && /^Detail View [A-Z] \(\d+(\.\d+)? : \d+(\.\d+)?\)$/.test(dv.name), dv.name);
      assert(DW.detailName('B', [2, 1]) === 'Detail View B (2 : 1)' && DW.detailName('C', [1, 2]) === 'Detail View C (1 : 2)', DW.detailName('B', [2, 1]));
      return dv.name;
    });
    // --- rfIH's parts: the L sketched with its arcs, a thin part from its outside chain with filleted corners
    var LA = 'p.units("in");\np.sketch("Front").line(0, 1.5, 0, 0.12).arc(0.12, 0.12, 0.12, 180, 270).line(0.12, 0, 2, 0).line(2, 0, 2, 0.06).line(2, 0.06, 0.12, 0.06).arc(0.12, 0.12, 0.06, 270, 180).line(0.06, 0.12, 0.06, 1.5).line(0.06, 1.5, 0, 1.5).end().extrude(2);\n';
    function thin(chain, D, round) {
      var n = chain.length, segs = [], inner = [];
      for (var i = 0; i + 1 < n; i++) {
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
      round.forEach(function (k) {
        var u = [chain[k][0] - chain[k - 1][0], chain[k][1] - chain[k - 1][1]], v = [chain[k + 1][0] - chain[k][0], chain[k + 1][1] - chain[k][1]];
        var out = u[0] * v[1] - u[1] * v[0] > 0 ? chain[k] : inner[k], inn = out === chain[k] ? inner[k] : chain[k];
        code += 'p.fillet(' + R + ', [[' + inn[0] + ', ' + inn[1] + ', ' + D / 2 + ']]);\np.fillet(' + (R + T) + ', [[' + out[0] + ', ' + out[1] + ', ' + D / 2 + ']]);\n';
      });
      return code;
    }
    function bfOf(chain, D, flip) { return 'p.units("in");\n' + SH + 'p.sketch("Front").polyline(' + JSON.stringify(chain) + ', false).end().baseFlange(null, { depth: ' + D + ', flip: ' + flip + ' });\n'; }
    var SH = 'p.sheet(0.06, 0.06, 0.44);\n', A120 = 2 * Math.PI / 3;
    var C120 = [[0, 0], [2, 0], [2 + 1.5 * Math.cos(A120), 1.5 * Math.sin(A120)]], CZ = [[0, 0.06], [2.06, 0.06], [2.06, 1.5], [4, 1.5]];
    var HOLE = 'p.sketch("Top").circle(1.4, -0.5, 0.2).end().cut("through");\n';
    var CASES = [
      ['L', LA + HOLE + SH + 'p.insertBends([1, 0, 1]);\n', 'p.units("in");\n' + SH + 'p.sketch("Front").polyline([[0, 1.5], [0, 0], [2, 0]], false).end().baseFlange(null, { depth: 2, flip: true });\n' + HOLE, 1],
      ['Z', thin(CZ, 3, [1, 2]) + SH + 'p.insertBends([1, 0.06, 1.5]);\n', bfOf(CZ, 3, true), 2],
      ['120°', thin(C120, 2, [1]) + SH + 'p.insertBends([1, 0, 1]);\n', bfOf(C120, 2, true), 1]
    ];
    // a flat-pattern view alone on a sheet (flat dimensions and the FLAT SIZE note on), at the same place
    function flatSheet(r) {
      var doc = DW.newDrawing(r.model, { projection: 'third', options: { flatDims: true, flatSizeNote: true } });
      doc.views = []; doc.nextView = 1;
      DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, x: 6, y: 5 });
      return DW.compute(doc, r.mesh, r.model, { build: r.build });
    }
    // the DXF entities of the flat's layers, each as text with numbers to 1e-6, sorted (a line either way round)
    function flatDxf(sh, ver) {
      var L = DW.toDXF(sh, { version: ver }).split(/\r?\n/), ents = [], cur = null, keep = /^(FLAT_PATTERN|BEND_UP|BEND_DOWN|BEND_NOTES|DIMENSIONS|NOTES)$/;
      for (var i = 0; i + 1 < L.length; i += 2) {
        var c = L[i].trim(), v = L[i + 1].trim();
        if (c === '0') { cur = { t: v, f: [] }; ents.push(cur); continue; }
        if (!cur || c === '5' || c === '330' || c === '2' || /^AcDb/.test(v)) continue;
        if (c === '8') cur.layer = v;
        cur.f.push(c + '=' + (isFinite(+v) && v !== '' ? (Math.round(+v * 1e6) / 1e6 || 0) : v));
      }
      return ents.filter(function (e) { return e.layer && keep.test(e.layer); }).map(function (e) {
        if (e.t === 'LINE') { var g = {}; e.f.forEach(function (x) { var k = x.split('='); g[k[0]] = k[1]; }); var a = g['10'] + ',' + g['20'], b = g['11'] + ',' + g['21']; return e.layer + ' LINE ' + [a, b].sort().join(' '); }
        return e.t + ' ' + e.f.join(' ');
      }).sort();
    }
    CASES.forEach(function (c) {
      test('rfIN: ' + c[0] + ' bracket, Insert Bends on its rounded bend' + (c[3] > 1 ? 's' : '') + ': the flat-pattern view (outline, bend lines up / down, notes UP 90° R.060, bounding-box dimensions, FLAT SIZE) and its DXF are the Base Flange part\'s', function () {
        var ib = build(c[1]), bf = build(c[2]);
        noErrors(ib); noErrors(bf);
        near(ib.mp.volume, bf.mp.volume, 1e-6, 'the same solid');
        var a = DW.flatData(ib.mesh, ib.model, ib.build), b = DW.flatData(bf.mesh, bf.model, bf.build);
        assert(!a.error && !b.error, a.error || b.error);
        assert(a.bends.length === c[3] && b.bends.length === c[3], 'bends ' + a.bends.length + ' / ' + b.bends.length);
        near(a.bbox.umax - a.bbox.umin, b.bbox.umax - b.bbox.umin, 1e-9, 'flat length'); near(a.bbox.vmax - a.bbox.vmin, b.bbox.vmax - b.bbox.vmin, 1e-9, 'flat width');
        // bend lines from the flat's corner: the same places, directions and notes
        function rel(fd) { return fd.bends.map(function (x) { var u = [x.a[0] - fd.bbox.umin, x.b[0] - fd.bbox.umin].sort(), v = [x.a[1] - fd.bbox.vmin, x.b[1] - fd.bbox.vmin].sort(); return { u: u, v: v, up: x.up, note: DW.bendNoteText(x, 'in') }; }).sort(function (p, q) { return p.u[0] - q.u[0]; }); }
        var ra = rel(a), rb = rel(b);
        ra.forEach(function (x, i) {
          var y = rb[i];
          [0, 1].forEach(function (k) { near(x.u[k], y.u[k], 1e-6, 'bend ' + i + ' u'); near(x.v[k], y.v[k], 1e-6, 'bend ' + i + ' v'); });
          assert(x.up === y.up && x.note === y.note && /^(UP|DOWN) (90|120)° R\.060$/.test(x.note), 'bend ' + i + ': ' + x.note + ' / ' + y.note);
        });
        var sa = flatSheet(ib), sb = flatSheet(bf);
        var txt = function (sh) { return sh.prims.filter(function (p) { return p.k === 'text' && p.layer !== 'SHEET'; }).map(function (p) { return p.layer + ':' + p.text; }).sort(); };
        assert(JSON.stringify(txt(sa)) === JSON.stringify(txt(sb)), 'texts ' + txt(sa).join(' | ') + ' vs ' + txt(sb).join(' | '));
        assert(txt(sa).some(function (t) { return /^NOTES:FLAT SIZE /.test(t); }) && txt(sa).filter(function (t) { return /^DIMENSIONS:/.test(t); }).length >= 2, 'flat size note and dimensions: ' + txt(sa).join(' | '));
        ['R12', 'R2000'].forEach(function (ver) {
          var da = flatDxf(sa, ver), db = flatDxf(sb, ver), diff = da.filter(function (x, i) { return x !== db[i]; });
          assert(da.length === db.length && !diff.length, ver + ': ' + da.length + ' / ' + db.length + ' entities; first differences ' + diff.slice(0, 3).join(' || ') + ' vs ' + db.filter(function (x, i) { return x !== da[i]; }).slice(0, 3).join(' || '));
          assert(da.some(function (x) { return /^(BEND_UP|BEND_DOWN) LINE/.test(x); }), ver + ': bend lines on BEND_UP / BEND_DOWN');
        });
        return ra.map(function (x) { return x.note + ' at ' + x.u[0].toFixed(4); }).join(', ');
      });
    });
    test('rfIN: the rounded L from a customer STEP (exported, imported in inches, Insert Bends): flat-pattern view = the Base Flange L\'s', function () {
      var X = typeof Exchange !== 'undefined' ? Exchange : null;
      if (!X) fail('exchange.js is not loaded');
      var src = build(LA + HOLE); noErrors(src);
      var m = X.newPartFromImport(X.importFile('l.step', X.exportSTEP(src.model, src.build), { units: 'in' }));
      new K.Builder(m).insertBends([1, 0, 1], { kFactor: 0.44 });
      var b = K.rebuild(m), mesh = K.meshFromBody(b.body);
      assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
      var bf = build(CASES[0][2]); noErrors(bf);
      var sa = flatSheet({ model: m, build: b, mesh: mesh }), sb = flatSheet(bf), da = flatDxf(sa, 'R2000'), db = flatDxf(sb, 'R2000');
      var diff = da.filter(function (x, i) { return x !== db[i]; });
      assert(da.length === db.length && !diff.length, da.length + ' / ' + db.length + ': ' + diff.slice(0, 3).join(' || '));
      return da.length + ' entities';
    });
    // --- exact torus silhouettes: the Mug's handle bend (torus centre (44, 45, 0), axis z, R 25, r 5)
    var mug0 = null;
    function mug() { if (!mug0) { mug0 = build(AnvilExamples.filter(function (e) { return e.name === 'Mug'; })[0].code); noErrors(mug0); } return mug0; }
    test('rfIN: Mug Front (along the handle bend\'s axis): its outline is two exact arcs R20 / R30 about (44, 45); Right (from the side): the tube\'s end circles are exact half circles R5, no facet chords left on them', function () {
      var F = DW.projectView(mug().mesh, 'Front', { display: 'hlr' });
      [20, 30].forEach(function (R) {
        var a = F.arcs.visible.filter(function (x) { return Math.abs(x.r - R) < 1e-9 && Math.hypot(x.c[0] - 44, x.c[1] - 45) < 1e-9; });
        assert(a.length === 1 && Math.abs(a[0].a1 - a[0].a0 - 180) < 1e-6, 'Front R' + R + ': ' + JSON.stringify(F.arcs.visible));
      });
      var Rv = DW.projectView(mug().mesh, 'Right', { display: 'hlr' });
      [[0, 70, 0], [0, 20, 180]].forEach(function (q) {
        var a = Rv.arcs.visible.filter(function (x) { return Math.abs(x.r - 5) < 1e-9 && Math.hypot(x.c[0] - q[0], x.c[1] - q[1]) < 1e-9; });
        assert(a.length === 1 && Math.abs(a[0].a1 - a[0].a0 - 180) < 1e-5 && Math.abs(((a[0].a0 - q[2]) % 360 + 540) % 360 - 180) < 1e-5, 'Right: one half circle at ' + q + ': ' + JSON.stringify(Rv.arcs.visible));
      });
      var chords = Rv.lines.visible.filter(function (l) { return [[0, 70], [0, 20]].some(function (c) { return Math.abs(Math.hypot(l[0] - c[0], l[1] - c[1]) - 5) < 1e-3 && Math.abs(Math.hypot(l[2] - c[0], l[3] - c[1]) - 5) < 1e-3; }); });
      assert(!chords.length, chords.length + ' chords left on the end circles');
      return 'Right: ' + Rv.lines.visible.length + ' lines, ' + Rv.arcs.visible.length + ' arcs';
    });
    test('rfIN: Mug isometric: the handle bend\'s outline (a space curve here) is drawn as chords whose ends lie on the exact silhouette and whose middles stay within 0.005 mm of it', function () {
      var pr = DW.projectView(mug().mesh, 'Isometric', { display: 'hlr' }), e = pr.e, U = pr.u, Vv = pr.v;
      function sil(f, sg) {
        var w = [Math.cos(f), Math.sin(f), 0], aa = w[0] * e[0] + w[1] * e[1], bb = e[2], h = Math.hypot(aa, bb), c = sg * bb / h, s = -sg * aa / h;
        var X = [44 + w[0] * (25 + 5 * c), 45 + w[1] * (25 + 5 * c), 5 * s];
        return [X[0] * U[0] + X[1] * U[1] + X[2] * U[2], X[0] * Vv[0] + X[1] * Vv[1] + X[2] * Vv[2]];
      }
      function dist(p) {
        var best = Infinity;
        [1, -1].forEach(function (sg) {
          var bf = 0, bd = Infinity, n = 720;
          for (var i = 0; i <= n; i++) { var f = -Math.PI / 2 + Math.PI * i / n, q = sil(f, sg), d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; bf = f; } }
          var lo = bf - Math.PI / n, hi = bf + Math.PI / n;
          for (var it = 0; it < 60; it++) { var m1 = lo + (hi - lo) * 0.382, m2 = lo + (hi - lo) * 0.618, q1 = sil(m1, sg), q2 = sil(m2, sg); if (Math.hypot(q1[0] - p[0], q1[1] - p[1]) < Math.hypot(q2[0] - p[0], q2[1] - p[1])) hi = m2; else lo = m1; }
          var q = sil((lo + hi) / 2, sg); best = Math.min(best, Math.hypot(q[0] - p[0], q[1] - p[1]));
        });
        return best;
      }
      var n = 0, mid = 0;
      pr.lines.visible.forEach(function (l) {
        if (dist([l[0], l[1]]) < 1e-6 && dist([l[2], l[3]]) < 1e-6) { n++; mid = Math.max(mid, dist([(l[0] + l[2]) / 2, (l[1] + l[3]) / 2])); }
      });
      assert(n >= 50, n + ' chords on the bend\'s silhouette');
      assert(mid < 0.005 + 1e-6, 'chord middles within 0.005 mm: ' + mid.toExponential(3));
      return n + ' chords, ' + mid.toExponential(2) + ' mm';
    });
    test('rfIN: chordsToArcs: chords filling a gap of an exact arc join it; a chord run touching no arc, or a long chord, stays a line', function () {
      var c = [0, 0], r = 5, P = function (d) { return [r * Math.cos(d * Math.PI / 180), r * Math.sin(d * Math.PI / 180)]; };
      var arcs = [{ c: c, r: r, a0: 0, a1: 90, exact: true }, { c: c, r: r, a0: 101.25, a1: 180, exact: true }], circs = [];
      var ch = function (d0, d1) { var a = P(d0), b = P(d1); return [a[0], a[1], b[0], b[1], 0]; };
      var lines = [ch(90, 95), ch(95, 101.25), ch(250, 255), ch(180, 230), [10, 10, 20, 10, 0]];
      var out = DW._.chordsToArcs(lines, arcs, circs);
      assert(arcs.length === 1 && Math.abs(arcs[0].a0) < 1e-9 && Math.abs(arcs[0].a1 - 180) < 1e-9, JSON.stringify(arcs));
      assert(out.length === 3, 'lines left ' + out.length);
      var arcs2 = [{ c: c, r: r, a0: 10, a1: 355, exact: true }], circ2 = [], out2 = DW._.chordsToArcs([ch(355, 362), ch(362, 370)], arcs2, circ2);
      assert(!out2.length && !arcs2.length && circ2.length === 1 && circ2[0].r === r, 'closed all round: a circle');
    });
  })();
