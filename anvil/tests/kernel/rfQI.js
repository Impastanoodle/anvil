  // --- rfQI (2026-11-19, lane shopflow9, test-reports/2026-11-19-shop-flow-9.md) --- the shop audit, round 9: each job
  // against the closed form. Job 1: an 18 ga CRS door panel 24 x 36 (gauge table: T = R = .0478, K .5): four Edge
  // Flanges .75 down, Material Inside, a closed Hem .5 on the long flanges, a Cross-Break, four Ø.281 holes 1 in from
  // the corners; gauge 18 -> 16 on the built part (the Cross-Break's face point was left inside the sheet: refused); a
  // Jog .25 1 in from a short edge, Fix projected length off / on; a jog across the face after the flanges (open solid,
  // no error: now refused).
  (function () {
    function rfQIbd(T, R) { var BA = Math.PI / 2 * (R + 0.5 * T); return 2 * (R + T) - BA; }
    // flange .75 a side (outer virtual sharp, Material Inside); the closed hem .5: R 0.05 mm, folds inside the flange's
    // height, leg .5 - (Rh + T), BA = pi (Rh + K T)
    function rfQIdoor(T, R) {
      var Rh = 1 / 508, BD = rfQIbd(T, R), BAh = Math.PI * (Rh + 0.5 * T);
      return [24 + 1.5 - 2 * BD - 2 * (Rh + T) + 2 * (BAh + 0.5 - Rh - T), 36 + 1.5 - 2 * BD];
    }
    var T18 = 0.0478, H = 0.75 - T18;
    var DOOR = 'p.units("in");\np.sheet(null, null, null, { gaugeTable: "steel", gauge: "18" });\np.sketch("Top").rect(0, -36, 24, 36).end().baseFlange();\n';
    var FL4 = 'p.flange(0.75, [[12, ' + T18 + ', 0], [24, ' + T18 + ', 18], [12, ' + T18 + ', 36], [0, ' + T18 + ', 18]], { position: "inside", lengthRef: "outer", toward: [0, -1, 0], relief: "obround" });\n';
    var HEM = 'p.hem(0.5, [[' + (24 - T18) + ', ' + (-H) + ', 18], [' + T18 + ', ' + (-H) + ', 18]], { hemType: "closed", hemPosition: "inside" });\n';
    var CB = 'p.crossBreak([12, ' + T18 + ', 18], {});\n';
    var HO = 'p.sketch("Top").circle(1, -1, 0.1405).circle(23, -1, 0.1405).circle(1, -35, 0.1405).circle(23, -35, 0.1405).end().cut("through", { both: true });\n';
    function rfQIarea(fl) {
      var a = 0;
      fl.loops.forEach(function (l, i) { var s = 0; for (var k = 0; k < l.length; k++) { var p = l[k], q = l[(k + 1) % l.length]; s += p[0] * q[1] - q[0] * p[1]; } a += (i ? -1 : 1) * Math.abs(s / 2); });
      return a;
    }
    function rfQIcentres(fl) {
      return fl.loops.slice(1).map(function (l) { var x = 0, y = 0; l.forEach(function (p) { x += p[0]; y += p[1]; }); return [x / l.length, y / l.length]; })
        .sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    }
    function rfQIcount(dxf, ent, layer) { return (dxf.match(new RegExp('\\n0\\n' + ent + '\\n8\\n' + layer + '\\n', 'g')) || []).length; }
    function rfQIcheckDoor(m, b, me, T, what) {
      assert(!Object.keys(b.errors).length, what + ' errors ' + JSON.stringify(b.errors));
      var q = K.meshQuality(me);
      assert(q.openEdges === 0 && q.nonManifoldEdges === 0, what + ' closed: ' + q.openEdges);
      var fl = K.flatPattern(m, b, me), cf = rfQIdoor(T, T);
      near(fl.size[0], cf[0], 1e-6, what + ' blank across'); near(fl.size[1], cf[1], 1e-6, what + ' blank along');
      assert(fl.loops.length === 5 && fl.bends.length === 6, what + ' loops / bends ' + fl.loops.length + ' / ' + fl.bends.length);
      // the holes stay 1 in from the panel's finished (outside) edges: the base face does not move in the flat
      var c = rfQIcentres(fl), want = [[1, -35], [1, -1], [23, -35], [23, -1]];
      c.forEach(function (p, i) { near(p[0], want[i][0], 1e-6, what + ' hole x'); near(p[1], want[i][1], 1e-6, what + ' hole y'); });
      // four mitred corners: the folded part is a hair under blank x T, as SolidWorks' is (area card: edge-flange mitre)
      var v = K.massProps(me, 1).volume, d = rfQIarea(fl) * T - v;
      assert(d > 0 && d < 2e-3, what + ' blank x T - volume ' + d);
      var dxf = K.exportDXFFlat(fl, 'in', { bendLines: true, notes: true });
      assert(rfQIcount(dxf, 'POLYLINE', 'OUTLINE') === 1 && rfQIcount(dxf, 'CIRCLE', 'HOLES') === 4 && rfQIcount(dxf, 'LINE', 'BEND') === 8, what + ' DXF layers');
      assert(/CROSS BREAK UP 1%%d/.test(dxf) && (dxf.match(/DOWN 180%%d R\.002/g) || []).length === 2 && (dxf.match(/DOWN 90%%d/g) || []).length === 4, what + ' DXF notes');
      return { fl: fl, d: d, v: v };
    }

    test('rfQI: job 1, 18 ga door 24 x 36: four Edge Flanges .75 down (Material Inside, obround), closed Hem .5 on the long flanges, a Cross-Break, four Ø.281 holes 1 in from the corners: closed, blank 24 + 1.5 - 2 BD - 2 (Rh + T) + 2 (pi (Rh + T/2) + .5 - Rh - T) = 26.306315 x 37.342852, holes where drawn, DXF layers and notes', function () {
      var r = build(DOOR + FL4 + HEM + CB + HO);
      noErrors(r);
      var o = rfQIcheckDoor(r.model, r.build, r.mesh, T18, '18 ga');
      return 'blank ' + o.fl.size.map(function (x) { return x.toFixed(6); }).join(' x ') + ', blank x T - volume ' + o.d.toExponential(2);
    });

    test('rfQI: job 1, the built door taken from gauge 18 to 16 by the gauge table (T = R .0478 -> .0598): every feature rebuilds (the Cross-Break\'s face point was left .012 inside the thicker sheet: "no planar sheet face"), blank 26.256563 x 37.303401, holes still 1 in from the finished edges, the Cross-Break still in the DXF', function () {
      var r = build(DOOR + FL4 + HEM + CB + HO);
      noErrors(r);
      var m = r.model, row = K.gaugeRow('steel', '16', 'in');
      m.sheet = K.makeSheet(Object.assign({}, m.sheet, { thickness: row.thickness, bendRadius: row.radius, gauge: '16' }));
      var b = K.rebuild(m), me = K.meshFromBody(b.body);
      var o = rfQIcheckDoor(m, b, me, row.thickness, '16 ga');
      var cb = m.features.filter(function (f) { return f.type === 'crossBreak'; })[0];
      near(cb.face[1], row.thickness, 1e-9, 'the Cross-Break\'s point follows the face');
      return 'blank ' + o.fl.size.map(function (x) { return x.toFixed(6); }).join(' x ');
    });

    var JOG = function (fix) { return 'p.sketch("Top", ' + T18 + ').line(0, -1, 24, -1).jog(0.25, { fixed: [12, ' + T18 + ', 18], offsetRef: "outside", reverse: true' + (fix ? ', fixLength: true' : '') + ' });\n'; };
    test('rfQI: job 1, a Jog .25 (outside) 1 in from a short edge of the 18 ga panel: Fix projected length off = flat 24 x 36; on = 36 + .25 + 2T - 2BD = 36.188452, the far end still at z 0; then Edge Flanges on the other three edges: 25.342852 x (36 + .75 - BD) / (36.188452 + .75 - BD), closed', function () {
      var BD = rfQIbd(T18, T18), out = [];
      [false, true].forEach(function (fix) {
        var r = build(DOOR + JOG(fix));
        noErrors(r);
        assert(K.meshQuality(r.mesh).openEdges === 0, 'closed');
        var fl = K.flatPattern(r.model, r.build, r.mesh), L = fix ? 36 + 0.25 + 2 * T18 - 2 * BD : 36;
        near(fl.size[1], L, 1e-6, 'jog flat, fix ' + fix); near(fl.size[0], 24, 1e-9, 'width');
        near(rfQIarea(fl) * T18, r.mp.volume, 1e-6, 'blank x T = volume');
        var r3 = build(DOOR + JOG(fix) + 'p.flange(0.75, [[12, ' + T18 + ', 36], [24, ' + T18 + ', 18], [0, ' + T18 + ', 18]], { position: "inside", lengthRef: "outer", toward: [0, -1, 0], relief: "obround" });\n');
        noErrors(r3);
        assert(K.meshQuality(r3.mesh).openEdges === 0, 'jog + flanges closed');
        var f3 = K.flatPattern(r3.model, r3.build, r3.mesh);
        near(f3.size[0], 24 + 1.5 - 2 * BD, 1e-6, 'jog + flanges across'); near(f3.size[1], L + 0.75 - BD, 1e-6, 'jog + flanges along');
        out.push(fl.size[1].toFixed(6) + ' / ' + f3.size[1].toFixed(6));
      });
      return out.join('; ');
    });

    test('rfQI: job 1, a Jog (or Sketched Bend) whose line runs into the return flanges (made after the four Edge Flanges) is refused with the reason (it built an open solid, 30 open edges, with no error)', function () {
      [false, true].forEach(function (fix) {
        var r = build(DOOR + FL4 + JOG(fix));
        var e = Object.keys(r.errors).map(function (k) { return r.errors[k]; }).join(' ');
        assert(/Jog: line 1 runs into a flange or wall at its end/.test(e), 'refused: ' + e);
        assert(K.meshQuality(r.mesh).openEdges === 0, 'the part before it stays');
      });
      var s = build(DOOR + FL4 + 'p.sketch("Top", ' + T18 + ').line(0, -12, 24, -12).end();\np.sketchedBend(90, { fixed: [12, ' + T18 + ', 30] });\n');
      var e2 = Object.keys(s.errors).map(function (k) { return s.errors[k]; }).join(' ');
      assert(/Sketched Bend: line 1 runs into a flange or wall/.test(e2), 'sketched bend refused: ' + e2);
      return e2;
    });
  })();

  // Job 2: a 14 ga mitred tray 12 x 8 x 1.5 (gauge table T = R .0747, K .5): Base Flange, one Miter Flange round all four
  // edges (profile 1.5 - T on the Right Plane, gap .01), Closed Corner, Welded Corner, Break-Corner chamfer .06 on the
  // walls' top corners; the height 1.5 -> 2 from the Miter Flange's sketch: every corner feature follows.
  (function () {
    var T = 0.0747, R = T, BA = Math.PI / 2 * (R + T / 2), w = T + 0.01 / Math.SQRT2;
    function rfQIe(h) { return h + BA - 2 * R - 2 * T; }   // per side: wall H - (R + T), base trimmed R + T, plus BA
    var S = 'p.units("in");\np.sheet(null, null, null, { gaugeTable: "steel", gauge: "14" });\np.sketch("Top").rect(0, -8, 12, 8).end().baseFlange();\n';
    var MF = 'p.sketch("Right").line(0, ' + T + ', 0, 1.5).end();\np.miterFlange([[6, ' + T + ', 0], [12, ' + T + ', 4], [6, ' + T + ', 8], [0, ' + T + ', 4]], { miterGap: 0.01 });\n';
    function area(fl) {
      var a = 0;
      fl.loops.forEach(function (l, i) { var s = 0; for (var k = 0; k < l.length; k++) { var p = l[k], q = l[(k + 1) % l.length]; s += p[0] * q[1] - q[0] * p[1]; } a += (i ? -1 : 1) * Math.abs(s / 2); });
      return a;
    }
    function errs(r) { return Object.keys(r.errors).map(function (k) { return r.errors[k]; }).join(' '); }
    test('rfQI: job 2, 14 ga mitred tray 12 x 8 x 1.5 (one Miter Flange on four edges, gap .01): closed, blank 12 + 2 e x 8 + 2 e with e = 1.5 + BA - 2R - 2T = 14.754415 x 10.754415; Closed Corner on a mitre (Coplanar off): Butt and Underlap refused ("already within the gap", .0071 < .01), Overlap extends the wall (blank x T - volume unchanged: the extension is developed exactly)', function () {
      var r = build(S + MF);
      noErrors(r);
      assert(K.meshQuality(r.mesh).openEdges === 0, 'closed');
      var fl = K.flatPattern(r.model, r.build, r.mesh), d0 = area(fl) * T - r.mp.volume;
      near(fl.size[0], 12 + 2 * rfQIe(1.5), 1e-9, 'blank x'); near(fl.size[1], 8 + 2 * rfQIe(1.5), 1e-9, 'blank z');
      // four mitred corners: under blank x T as SolidWorks' (M12: 1.7e-4 a corner at .06)
      assert(d0 > 0 && d0 < 2e-3, 'blank x T - volume ' + d0);
      ['butt', 'underlap'].forEach(function (ct) {
        var rc = build(S + MF + 'p.closedCorner([[' + w + ', 0.8, ' + T / 2 + ']], { cornerType: "' + ct + '", coplanar: false });\n');
        assert(/already within the gap \(0\.0071/.test(errs(rc)), ct + ' refused: ' + errs(rc));
      });
      var ro = build(S + MF + 'p.closedCorner([[' + w + ', 0.8, ' + T / 2 + ']], { cornerType: "overlap", coplanar: false });\n');
      noErrors(ro);
      var flo = K.flatPattern(ro.model, ro.build, ro.mesh);
      assert(K.meshQuality(ro.mesh).openEdges === 0 && ro.mp.volume > r.mp.volume, 'overlap built');
      near(area(flo) * T - ro.mp.volume, d0, 1e-9, 'overlap developed exactly');
      return 'blank ' + fl.size.map(function (x) { return x.toFixed(6); }).join(' x ') + ', blank x T - volume ' + d0.toExponential(3) + ', overlap + ' + (ro.mp.volume - r.mp.volume).toFixed(6);
    });

    test('rfQI: job 2, Overlap Closed Corner (Coplanar on: both left corners, as SolidWorks\' Coplanar faces), a Welded Corner at the back right, Break-Corner chamfer .06 on the six corners offered (area - 6 x .0018 exactly); then the height 1.5 -> 2 in the Miter Flange\'s sketch: no errors, closed, blank 15.754415 x 11.754415, the chamfers follow to y 2', function () {
      var code = S + MF + 'p.closedCorner([[' + w + ', 0.8, ' + T / 2 + ']], { cornerType: "overlap" });\np.weldedCorner([[' + (12 - w) + ', 0.8, ' + (8 - T / 2) + ']]);\n';
      var r = build(code);
      noErrors(r);
      var c = K.breakCornerCandidates(r.build.body, r.model);
      assert(c.length === 6, 'six corners offered: ' + c.length);
      var a0 = area(K.flatPattern(r.model, r.build, r.mesh));
      r = build(code + 'p.breakCorner(0.06, ' + JSON.stringify(c.map(function (q) { return q.at; })) + ', { kind: "chamfer" });\n');
      noErrors(r);
      var fl = K.flatPattern(r.model, r.build, r.mesh);
      near(a0 - area(fl), 6 * 0.06 * 0.06 / 2, 1e-9, 'six chamfers in the flat');
      assert(r.mp.volume > area(fl) * T, 'the weld is in the part, not in the flat');
      var m = r.model, sk = m.features.filter(function (f) { return f.type === 'sketch'; })[1];
      sk.entities[0].y2 = 2;
      var b = K.rebuild(m), me = K.meshFromBody(b.body), f2 = K.flatPattern(m, b, me);
      assert(!Object.keys(b.errors).length && K.meshQuality(me).openEdges === 0, 'height 2: ' + JSON.stringify(b.errors));
      near(f2.size[0], 12 + 2 * rfQIe(2), 1e-9, 'blank x at 2'); near(f2.size[1], 8 + 2 * rfQIe(2), 1e-9, 'blank z at 2');
      var tops = m.features.filter(function (f) { return f.type === 'breakCorner'; })[0].corners.filter(function (q) { return Math.abs(q[1] - 2) < 1e-9; });
      assert(tops.length === 4, 'the top chamfers moved up: ' + tops.length);
      return 'blank at 2: ' + f2.size.map(function (x) { return x.toFixed(6); }).join(' x ');
    });
  })();
  // Job 3: a 16 ga square-to-round transition (Lofted-Bend, Bent): 6 x 6 square (mid-line) to Ø4 round 5 higher, a .03
  // seam at the middle of the front side; the flat is the strip of triangles developed with every edge its true length.
  (function () {
    var T = 0.0598, g = 0.03, d0 = g / 2 * 180 / Math.PI;   // the round's seam: the same .03 as an arc on r 2
    var HEAD = 'p.units("in");\np.sheet(null, null, null, { gaugeTable: "steel", gauge: "16" });\n';
    var SQ = 'var a = p.sketch("Top").polyline([[0, -3], [3, -3], [3, 3], [-3, 3], [-3, -3], [' + (-g) + ', -3]], false).id();\n';
    var RN = 'var b = p.sketch("Top", 5).arc(0, 0, 2, ' + (270 + d0) + ', 360).arc(0, 0, 2, 0, 90).arc(0, 0, 2, 90, 180).arc(0, 0, 2, 180, 270).id();\n';
    function tri(a, b, c) { return K.vec.len(K.vec.cross(K.vec.sub(b, a), K.vec.sub(c, a))) / 2; }
    function sq(x, y) { return [x, 0, -y]; }
    function rd(n, deg) { var t = deg * Math.PI / 180; return [2 * Math.cos(t), 5, -2 * Math.sin(t)]; }
    // the hand layout: each corner fans to its quarter of the round, each side (the seam side in two halves) is one flat
    // triangle to the round's tangent point
    function hand(n) {
      var A = 0, q = [[270 + d0, 360, sq(3, -3)], [0, 90, sq(3, 3)], [90, 180, sq(-3, 3)], [180, 270, sq(-3, -3)]];
      q.forEach(function (s) { for (var i = 0; i < n; i++) A += tri(s[2], rd(n, s[0] + (s[1] - s[0]) * i / n), rd(n, s[0] + (s[1] - s[0]) * (i + 1) / n)); });
      return A + tri(sq(3, -3), sq(3, 3), rd(n, 0)) + tri(sq(3, 3), sq(-3, 3), rd(n, 90)) + tri(sq(-3, 3), sq(-3, -3), rd(n, 180)) +
        tri(sq(0, -3), sq(3, -3), rd(n, 270 + d0)) + tri(sq(-3, -3), sq(-g, -3), rd(n, 270));
    }
    function perim(l) { var s = 0; for (var k = 0; k < l.length; k++) s += Math.hypot(l[(k + 1) % l.length][0] - l[k][0], l[(k + 1) % l.length][1] - l[k][1]); return s; }
    test('rfQI: job 3, 16 ga square-to-round 6 x 6 to Ø4 x 5 high, seam .03 (Bent, 4 / 8 bends per quarter): closed, the flat = its triangles developed (area = their true areas to 1e-9, perimeter = 23.97 + the chords + the two seams), 20 / 36 bend lines in the DXF, volume = area x T within 2e-3 (area card: mid-surface fans); against the hand layout (corner fans, flat side triangles)', function () {
      var out = [];
      [4, 8].forEach(function (n) {
        var r = build(HEAD + SQ + RN + 'p.loftedBend([a, b], { faceting: "count", facetValue: ' + n + ' });\n');
        noErrors(r);
        assert(K.meshQuality(r.mesh).openEdges === 0, 'closed');
        var f = r.model.features.filter(function (q) { return q.type === 'loftedBend'; })[0];
        var lay = K.loftedBendLayout(f, r.model, { planes: r.build.planes, sketches: {} }), LA = 0;
        lay.tris.forEach(function (t) { LA += tri(t.p[0], t.p[1], t.p[2]); });
        var fl = K.flatPattern(r.model, r.build, r.mesh), fa = Math.abs(K.signedArea(fl.loops[0]));
        assert(fl.loops.length === 1, 'one outline');
        near(fa, LA, 1e-9, n + ': flat area = the triangles');
        var chords = 0, A = lay.A, B = lay.B;
        for (var k = 0; k + 1 < B.length; k++) chords += K.vec.len(K.vec.sub(B[k + 1], B[k]));
        near(perim(fl.loops[0]), 24 - g + chords + K.vec.len(K.vec.sub(A[0], B[0])) + K.vec.len(K.vec.sub(A[A.length - 1], B[B.length - 1])), 1e-9, n + ': perimeter, every edge its true length');
        nearRel(r.mp.volume, fa * T, 2e-3, n + ': volume = area x T');
        var dxf = K.exportDXFFlat(fl, 'in', { bendLines: true, notes: true });
        var nb = (dxf.match(/\n0\nLINE\n8\nBEND\n/g) || []).length, no = (dxf.match(/\n0\nPOLYLINE\n8\nOUTLINE\n/g) || []).length;
        assert(fl.bends.length === 4 * n + 4 && nb === fl.bends.length && no === 1, n + ': bend lines ' + fl.bends.length + ' / DXF ' + nb);
        out.push(n + ': area ' + fa.toFixed(6) + ' (hand layout ' + hand(n).toFixed(6) + '), ' + nb + ' bends');
      });
      return out.join('; ');
    });
  })();
  // Job 4: an 11 ga L bracket 3 x 3 x 4 wide (T = R .1196, K .5): two Ribs as gussets across the bend (Anvil has no formed
  // Sheet Metal Gusset), a row of four slots across the bend: Unfold, one slot centred on the bend line by a Normal Cut,
  // Linear Pattern x4, Fold.
  (function () {
    var T = 0.1196, R = T, BA = Math.PI / 2 * (R + T / 2), BD = 2 * (R + T) - BA, xb = 3 - (R + T) + BA / 2, Ls = 1, w = 0.25;
    var S = 'p.units("in");\np.sheet(null, null, null, { gaugeTable: "steel", gauge: "11" });\np.sketch("Top").rect(0, -4, 3, 4).end().baseFlange();\n' +
      'p.flange(3, [[3, ' + T + ', 2]], { position: "inside", lengthRef: "outer" });\n';
    var SLOTS = 'p.unfold([1.5, ' + T + ', 2], null);\np.sketch("Top", ' + T + ').slot(' + (xb - Ls / 2) + ', -0.5, ' + (xb + Ls / 2) + ', -0.5, ' + w + ').end().cut("through", { both: true, normalCut: true });\n' +
      'p.linearPattern({ dir: "z", spacing: 1, count: 4 });\np.fold(null);\n';
    var GUS = 'p.sketch("Front", 1).line(2.2, 0.3, 2.7, 0.8).end();\np.rib(0.12, {});\np.sketch("Front", 3).line(2.2, 0.3, 2.7, 0.8).end();\np.rib(0.12, {});\n';
    test('rfQI: job 4, 11 ga L 3 x 3 x 4: blank 6 - BD = 5.803401 x 4; four slots 1 c-c x .25 across the bend (Unfold, Normal Cut, Linear Pattern, Fold): closed, the folded part loses exactly 4 (Ls w + pi w^2 / 4) T, the flat shows four slots centred on the bend line, the blank unchanged, the DXF 4 slots on HOLES and one BEND', function () {
      var r0 = build(S), r = build(S + SLOTS);
      noErrors(r0); noErrors(r);
      assert(K.meshQuality(r.mesh).openEdges === 0, 'closed');
      var fl = K.flatPattern(r.model, r.build, r.mesh);
      near(fl.size[0], 6 - BD, 1e-9, 'blank'); near(fl.size[1], 4, 1e-9, 'width');
      near(r0.mp.volume - r.mp.volume, 4 * (Ls * w + Math.PI * w * w / 4) * T, 1e-9, 'four slots x T');
      assert(fl.loops.length === 5, 'four slots in the flat');
      fl.loops.slice(1).forEach(function (l) { var lo = Infinity, hi = -Infinity; l.forEach(function (p) { lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]); }); near((lo + hi) / 2, xb, 1e-6, 'slot on the bend line'); near(hi - lo, Ls + w, 1e-6, 'slot length'); });
      var dxf = K.exportDXFFlat(fl, 'in', { bendLines: true, notes: true });
      assert((dxf.match(/\n0\nPOLYLINE\n8\nHOLES\n/g) || []).length === 4 && (dxf.match(/\n0\nLINE\n8\nBEND\n/g) || []).length === 1, 'DXF');
      return 'blank ' + fl.size.map(function (x) { return x.toFixed(6); }).join(' x ') + ', slots - ' + (r0.mp.volume - r.mp.volume).toFixed(6) + ' in3';
    });
    test('rfQI: job 4, two Ribs across the inside of the bend as gussets: the part gains them, the flat is the bracket\'s with a warning (it showed four phantom holes where the ribs met the faces: 5 loops, area - .356)', function () {
      var r0 = build(S + SLOTS), r = build(S + SLOTS + GUS);
      noErrors(r);
      assert(K.meshQuality(r.mesh).openEdges === 0 && r.mp.volume > r0.mp.volume, 'ribs added, closed');
      var f0 = K.flatPattern(r0.model, r0.build, r0.mesh), fl = K.flatPattern(r.model, r.build, r.mesh);
      assert(fl.loops.length === f0.loops.length, 'no phantom holes: ' + fl.loops.length + ' / ' + f0.loops.length);
      near(Math.abs(K.signedArea(fl.loops[0])), Math.abs(K.signedArea(f0.loops[0])), 1e-9, 'same outline');
      assert(fl.warnings.some(function (s) { return /Rib1, Rib2: a Rib is not sheet metal/.test(s); }), 'warned: ' + fl.warnings.join(' | '));
      return 'ribs + ' + (r.mp.volume - r0.mp.volume).toFixed(6) + ' in3; ' + fl.warnings[fl.warnings.length - 1];
    });
  })();
  // Job 5: the door saved and reopened (its model JSON, and its script) and in two configurations, D36 / D42: the base
  // sketch's length and the hole pattern's spacing configured per configuration (Modify box ▸ This configuration =
  // K.configureDimension), the flat DXF per configuration.
  (function () {
    var T = 0.0478, H = 0.75 - T, BD = 2 * (T + T) - Math.PI / 2 * (T + T / 2), Rh = 1 / 508;
    var DOOR = 'p.units("in");\np.sheet(null, null, null, { gaugeTable: "steel", gauge: "18" });\np.sketch("Top").rect(0, 0, 24, 36).dim(0, "h").end().baseFlange();\n' +
      'p.flange(0.75, [[12, ' + T + ', 0], [24, ' + T + ', -18], [12, ' + T + ', -36], [0, ' + T + ', -18]], { position: "inside", lengthRef: "outer", toward: [0, -1, 0], relief: "obround" });\n' +
      'p.hem(0.5, [[' + (24 - T) + ', ' + (-H) + ', -18], [' + T + ', ' + (-H) + ', -18]], { hemType: "closed", hemPosition: "inside" });\n' +
      'p.crossBreak([12, ' + T + ', -18], {});\n' +
      'p.sketch("Top").circle(1, 1, 0.1405).circle(23, 1, 0.1405).end().cut("through", { both: true });\np.linearPattern({ dir: "z", reverse: true, spacing: 34, count: 2 });\n';
    function sig(m) {
      var b = K.rebuild(m), me = K.meshFromBody(b.body), fl = K.flatPattern(m, b, me);
      assert(!Object.keys(b.errors).length && K.meshQuality(me).openEdges === 0, 'built, closed: ' + JSON.stringify(b.errors));
      var c = fl.loops.slice(1).map(function (l) { var x = 0, y = 0; l.forEach(function (p) { x += p[0]; y += p[1]; }); return [Math.round(x / l.length * 1e6) / 1e6, Math.round(y / l.length * 1e6) / 1e6]; });
      return { vol: K.massProps(me, 1).volume, fl: fl, holes: c.map(function (p) { return p.join(','); }).sort().join(' '), dxf: K.exportDXFFlat(fl, 'in', { bendLines: true, notes: true }) };
    }
    test('rfQI: job 5, the 18 ga door in configurations D36 / D42 (length and hole spacing This configuration): blanks 26.306315 x (L + 1.5 - 2 BD), the far holes 1 in from the far edge, the Cross-Break in each DXF; saved as JSON and as its script and reopened: the same volume and the same DXF text in both configurations', function () {
      var r = build(DOOR);
      noErrors(r);
      var m = r.model, sk = m.features[0], lp = m.features.filter(function (f) { return f.type === 'lpattern'; })[0];
      m.configurations = [{ name: 'D36', values: {} }, { name: 'D42', values: {} }]; m.activeConfiguration = 'D42';
      assert(K.configureDimension(m, { sketch: sk.id, dimIndex: 0 }, 42, 'this').ok && K.configureDimension(m, { feature: lp.id, field: 's1' }, 40, 'this').ok, 'configured');
      var out = {}, back = {};
      ['D36', 'D42'].forEach(function (c) {
        m.activeConfiguration = c;
        var L = c === 'D36' ? 36 : 42, s = out[c] = sig(m);
        near(s.fl.size[0], 24 + 1.5 - 2 * BD - 2 * (Rh + T) + 2 * (Math.PI * (Rh + T / 2) + 0.5 - Rh - T), 1e-6, c + ' across');
        near(s.fl.size[1], L + 1.5 - 2 * BD, 1e-6, c + ' along');
        assert(s.holes === ['1,1', '1,' + (L - 1), '23,1', '23,' + (L - 1)].sort().join(' '), c + ' holes ' + s.holes);
        assert(/CROSS BREAK UP 1%%d/.test(s.dxf) && (s.dxf.match(/\n0\nCIRCLE\n8\nHOLES\n/g) || []).length === 4, c + ' DXF');
      });
      var mj = JSON.parse(JSON.stringify(m)), ms = K.newModel('P');
      new Function('p', 'Kernel', K.generateScript(m))(new K.Builder(ms), K);
      [['json', mj], ['script', ms]].forEach(function (x) {
        ['D36', 'D42'].forEach(function (c) {
          x[1].activeConfiguration = c;
          var s = sig(x[1]);
          near(s.vol, out[c].vol, 1e-9, x[0] + ' ' + c + ' volume');
          assert(s.dxf === out[c].dxf, x[0] + ' ' + c + ': the same flat DXF');
        });
      });
      return 'D36 ' + out.D36.fl.size.map(function (v) { return v.toFixed(6); }).join(' x ') + ', D42 ' + out.D42.fl.size.map(function (v) { return v.toFixed(6); }).join(' x ');
    });
  })();
  // Job 5 for jobs 2 to 4: each part saved (model JSON and its script) and reopened: the same volume and flat DXF.
  (function () {
    var T14 = 0.0747, w = T14 + 0.01 / Math.SQRT2, T11 = 0.1196, xb = 3 - 2 * T11 + Math.PI / 4 * (1.5 * T11);
    var JOBS = {
      tray: 'p.units("in");\np.sheet(null, null, null, { gaugeTable: "steel", gauge: "14" });\np.sketch("Top").rect(0, -8, 12, 8).end().baseFlange();\n' +
        'p.sketch("Right").line(0, ' + T14 + ', 0, 1.5).end();\np.miterFlange([[6, ' + T14 + ', 0], [12, ' + T14 + ', 4], [6, ' + T14 + ', 8], [0, ' + T14 + ', 4]], { miterGap: 0.01 });\n' +
        'p.closedCorner([[' + w + ', 0.8, ' + T14 / 2 + ']], { cornerType: "overlap" });\np.weldedCorner([[' + (12 - w) + ', 0.8, ' + (8 - T14 / 2) + ']]);\n' +
        'p.breakCorner(0.06, [[0, 1.5, 0.0373], [11.9627, 1.5, 0.0818], [11.9182, 1.5, 0.0373]], { kind: "chamfer" });\n',
      transition: 'p.units("in");\np.sheet(null, null, null, { gaugeTable: "steel", gauge: "16" });\nvar a = p.sketch("Top").polyline([[0, -3], [3, -3], [3, 3], [-3, 3], [-3, -3], [-0.03, -3]], false).id();\n' +
        'var b = p.sketch("Top", 5).arc(0, 0, 2, 270.859, 360).arc(0, 0, 2, 0, 90).arc(0, 0, 2, 90, 180).arc(0, 0, 2, 180, 270).id();\np.loftedBend([a, b]);\n',
      bracket: 'p.units("in");\np.sheet(null, null, null, { gaugeTable: "steel", gauge: "11" });\np.sketch("Top").rect(0, -4, 3, 4).end().baseFlange();\n' +
        'p.flange(3, [[3, ' + T11 + ', 2]], { position: "inside", lengthRef: "outer" });\np.unfold([1.5, ' + T11 + ', 2], null);\n' +
        'p.sketch("Top", ' + T11 + ').slot(' + (xb - 0.5) + ', -0.5, ' + (xb + 0.5) + ', -0.5, 0.25).end().cut("through", { both: true, normalCut: true });\n' +
        'p.linearPattern({ dir: "z", spacing: 1, count: 4 });\np.fold(null);\np.sketch("Front", 1).line(2.2, 0.3, 2.7, 0.8).end();\np.rib(0.12, {});\n'
    };
    function sig(m) {
      var b = K.rebuild(m), me = K.meshFromBody(b.body), fl = K.flatPattern(m, b, me);
      assert(!Object.keys(b.errors).length && K.meshQuality(me).openEdges === 0, 'built, closed: ' + JSON.stringify(b.errors));
      return { vol: K.massProps(me, 1).volume, dxf: K.exportDXFFlat(fl, 'in', { bendLines: true, notes: true }) };
    }
    test('rfQI: job 5, the tray, the transition and the bracket saved (model JSON, script) and reopened: the same volume (1e-9) and the same flat DXF text', function () {
      var out = [];
      Object.keys(JOBS).forEach(function (k) {
        var r = build(JOBS[k]);
        noErrors(r);
        var s0 = sig(r.model), mj = JSON.parse(JSON.stringify(r.model)), ms = K.newModel('P');
        new Function('p', 'Kernel', K.generateScript(r.model))(new K.Builder(ms), K);
        [mj, ms].forEach(function (m, i) {
          var s = sig(m);
          near(s.vol, s0.vol, 1e-9, k + (i ? ' script' : ' json') + ' volume');
          assert(s.dxf === s0.dxf, k + (i ? ' script' : ' json') + ': the same flat DXF');
        });
        out.push(k + ' ' + s0.vol.toFixed(6));
      });
      return out.join(', ');
    });
  })();