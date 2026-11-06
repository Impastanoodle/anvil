  // --- rfIZ (2026-11-05, lane rfIZ: sheet-metal options from the PM audit, test-reports/2026-11-05-sheetmetal-pm-audit.md)
  // --- Edge Flange: Flange Length end condition Up To Vertex (lengthEnd / lengthVertex / lengthVertexMode), Flange Position
  // Tangent to Bend (position: 'tangentToBend'), Offset (offset: { end: 'blind', distance }); Custom Relief Type Tear
  // (relief: 'tear', also the sheet's Auto Relief) and a relief ratio (reliefRatio); Hem ▸ Miter Gap (miter / miterGap on
  // hem: true) and a hem's Custom Relief; the Miter Flange L profile (report 2026-11-02 5d). Builder.flange / Builder.hem do
  // not pass the new fields yet (kernel-script.js), so the rows set them on the feature JSON. Flats are analytic (16 ga,
  // T = R = .0598, K .5, inches); OpenCascade builds the same volumes (checked by hand through headless build --occt).
  (function () {
    group('rfIZ: Edge Flange Up To Vertex / Tangent to Bend / Offset, Tear relief, relief ratio, mitred hems, Miter Flange L profile');
    var T = 0.0598, R = 0.0598, HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\n';
    var PL = HEAD + 'p.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n';
    var LB = HEAD + 'p.sketch("Top").polyline([[0, 0], [4, 0], [4, -2], [2, -2], [2, -3], [0, -3]], true).end().baseFlange();\n';
    function ba(deg) { return deg * Math.PI / 180 * (R + T / 2); }
    function ok(c, label) { assert(c, label); }
    function errOf(r) { var ids = Object.keys(r.errors || {}); return ids.length ? r.errors[ids[ids.length - 1]] : ''; }
    // the script, then `patch` on the last flange feature (fields Builder does not pass yet), then sheet fields
    function buildP(code, patch, sheet) {
      var model = K.newModel('rfIZ');
      K.runScript(model, code);
      var fl = model.features.filter(function (q) { return q.type === 'flange'; });
      if (patch) Object.keys(patch).forEach(function (k) { fl[fl.length - 1][k] = patch[k]; });
      if (sheet) Object.keys(sheet).forEach(function (k) { model.sheet[k] = sheet[k]; });
      var b = K.rebuild(model), mesh = K.meshFromBody(b.body), mp = K.massProps(mesh, model.density);
      return { model: model, build: b, body: b.body, mesh: mesh, mp: mp, errors: b.errors, flat: K.flatPattern(model, b, mesh) };
    }
    function blankArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? Math.abs(K.signedArea(l)) : -Math.abs(K.signedArea(l))); }, 0); }
    function flatH(r) { return Math.min(r.flat.size[0], r.flat.size[1]); }
    function exact(r, label) { noErrors(r); near(r.mp.volume, blankArea(r.flat) * T, 1e-9, label + ': folded volume = blank area × T'); }
    var FL = 'p.flange(1, [[2, ' + T + ', 2]], {});\n', FL60 = 'p.flange(1, [[2, ' + T + ', 2]], { angle: 60 });\n';

    test('rfIZ: Up To Vertex, normal to the flange plane, 90°: the wall ends level with the vertex, flat 2 + BA + (y − T − R)', function () {
      var r = buildP(PL + FL, { lengthEnd: 'upToVertex', lengthVertex: [2, 1.5, 2.2] });
      exact(r, 'up to vertex');
      near(flatH(r), 2 + ba(90) + (1.5 - T - R), 1e-9, 'flat');
      near(r.mp.bbox.max[1], 1.5, 1e-9, 'top of the wall at the vertex');
    });
    test('rfIZ: Up To Vertex at 60°: normal (end plane square to the wall through the vertex) and parallel (top level with the vertex)', function () {
      var A = Math.PI / 3, sA = Math.sin(A), cA = Math.cos(A);
      var n = buildP(PL + FL60, { lengthEnd: 'upToVertex', lengthVertex: [2, 1.0, 2.6] });
      exact(n, 'normal');
      var Ln = (0.6 - R * sA) * cA + (1 - T - R * (1 - cA)) * sA;
      near(flatH(n), 2 + ba(60) + Ln, 1e-9, 'normal: flat');
      var p = buildP(PL + FL60, { lengthEnd: 'upToVertex', lengthVertex: [2, 1.0, 2.2], lengthVertexMode: 'parallel' });
      exact(p, 'parallel');
      near(flatH(p), 2 + ba(60) + (1 - T - R * (1 - cA)) / sA, 1e-9, 'parallel: flat');
      near(p.mp.bbox.max[1], 1.0, 1e-9, 'parallel: top of the wall at the vertex height');
      var bad = buildP(PL + FL, { lengthEnd: 'upToVertex', lengthVertex: [2, 0.05, 2.2] });
      ok(/does not lie past the bend/.test(errOf(bad)), 'a vertex below the bend is refused: ' + errOf(bad));
      var none = buildP(PL + FL, { lengthEnd: 'upToVertex' });
      ok(/pick the vertex/.test(errOf(none)), 'no vertex: ' + errOf(none));
    });
    test('rfIZ: Flange Position Tangent to Bend, 120°: the bend starts R + T back, its outside tangent to the sheet\'s side; refused below 90°', function () {
      var r = buildP(PL + 'p.flange(1, [[2, ' + T + ', 2]], { angle: 120 });\n', { position: 'tangentToBend' });
      exact(r, 'tangent to bend');
      near(flatH(r), 2 - (R + T) + ba(120) + 1, 1e-9, 'flat');
      near(r.mp.bbox.max[2], 2, 2e-4, 'the bend\'s outside reaches the side face plane (facets)');
      var low = buildP(PL + FL60, { position: 'tangentToBend' });
      ok(/90° or more/.test(errOf(low)), '60° refused: ' + errOf(low));
    });
    test('rfIZ: Flange Position Offset (Blind .25): the sheet runs on flat .25 to the bend, Bend Outside and Material Inside', function () {
      var r = buildP(PL + FL, { offset: { end: 'blind', distance: 0.25 } });
      exact(r, 'offset, bend outside');
      near(flatH(r), 2 + 0.25 + ba(90) + 1, 1e-9, 'bend outside: flat');
      near(r.mp.bbox.max[2], 2.25 + R + T, 1e-9, 'bend outside: outer face of the wall');
      var i = buildP(PL + 'p.flange(1, [[2, ' + T + ', 2]], { position: "inside" });\n', { offset: 0.25 });
      exact(i, 'offset, material inside');
      near(flatH(i), 2 - (R + T) + 0.25 + ba(90) + 1, 1e-9, 'material inside: flat');
      near(i.mp.bbox.max[2], 2.25, 1e-9, 'material inside: the wall\'s outer face .25 past the edge');
      var bad = buildP(PL + FL, { offset: { end: 'upToVertex', distance: 0.25 } });
      ok(/Blind/.test(errOf(bad)), 'other end conditions refused: ' + errOf(bad));
    });
    function holes(r) { return r.flat.loops.slice(1).map(function (l) { var x = [Infinity, -Infinity], y = [Infinity, -Infinity]; l.forEach(function (p) { x = [Math.min(x[0], p[0]), Math.max(x[1], p[0])]; y = [Math.min(y[0], p[1]), Math.max(y[1], p[1])]; }); return { w: x[1] - x[0], h: y[1] - y[0], x: x }; }); }
    test('rfIZ: Custom Relief Tear: a slit the Rip gap wide (.004 in) beside the flange\'s end where the sheet runs on; also as the sheet\'s Auto Relief', function () {
      var r = buildP(LB + 'p.flange(1, [[3, ' + T + ', 2]], { position: "inside" });\n', { relief: 'tear' });
      noErrors(r);
      var h = holes(r);
      eq(h.length, 1, 'one slit in the blank');
      near(h[0].w, K.ripDefaultGap(r.model), 1e-9, 'slit width');
      near(h[0].x[1], 2, 1e-9, 'slit beside the flange\'s end (x = 2)');
      nearRel(r.mp.volume, blankArea(r.flat) * T, 2e-5, 'folded vs blank');
      var a = buildP(LB + 'p.flange(1, [[3, ' + T + ', 2]], { position: "inside" });\n', null, { relief: 'tear' });
      noErrors(a);
      near(holes(a)[0].w, 0.004, 1e-9, 'Auto Relief Tear: the same slit');
      eq(K.makeSheet({ thickness: T, bendRadius: R, kFactor: 0.5, relief: 'tear' }).relief, 'tear', 'makeSheet keeps Tear');
    });
    function eq(a, b, label) { assert(a === b, label + ': ' + a + ', want ' + b); }
    test('rfIZ: Custom Relief with Use relief ratio 1: width and depth T (SolidWorks\' ratio × T)', function () {
      var r = buildP(LB + 'p.flange(1, [[3, ' + T + ', 2]], { position: "inside", relief: "rect" });\n', { reliefRatio: 1 });
      noErrors(r);
      near(holes(r)[0].w, T, 1e-9, 'relief width T');
      var d = buildP(LB + 'p.flange(1, [[3, ' + T + ', 2]], { position: "inside", relief: "rect" });\n');
      near(holes(d)[0].w, T, 1e-9, 'no ratio: the default width T');
      var h = buildP(LB + 'p.flange(1, [[3, ' + T + ', 2]], { position: "inside", relief: "rect" });\n', { reliefRatio: 0.5 });
      near(holes(h)[0].w, T / 2, 1e-9, 'ratio .5: width T / 2');
      var bad = buildP(LB + 'p.flange(1, [[3, ' + T + ', 2]], { position: "inside", relief: "rect" });\n', { reliefRatio: 0 });
      ok(/ratio must be greater than zero/.test(errOf(bad)), 'ratio 0 refused: ' + errOf(bad));
    });
    test('rfIZ: Hem ▸ Miter Gap: closed hems (Material Inside) on two edges of a corner build mitred (refused as crossing without it); a hem\'s Custom Relief', function () {
      var code = PL + 'p.hem(0.5, [[2, ' + T + ', 2], [4, ' + T + ', 1]], { hemType: "closed", hemPosition: "inside" });\n';
      var plain = buildP(code);
      ok(/would cross/.test(errOf(plain)), 'without a mitre: ' + errOf(plain));
      var m = buildP(code, { miter: true, miterGap: 0.02 });
      noErrors(m);
      near(Math.max(m.flat.size[0], m.flat.size[1]), 4.476581, 1e-6, 'flat: each strip as one closed hem (rfDO 2.476581 − 2)');
      near(Math.min(m.flat.size[0], m.flat.size[1]), 2.476581, 1e-6, 'flat height');
      nearRel(m.mp.volume, blankArea(m.flat) * T, 1e-3, 'folded vs blank (a plane mitre through a 180° bend)');
      var rl = buildP(LB + 'p.hem(0.5, [[3, ' + T + ', 2]], { hemType: "open", hemPosition: "inside" });\n', { relief: 'rect' });
      noErrors(rl);
      eq(holes(rl).length, 1, 'the hem\'s relief notch in the blank');
    });
    // the Miter Flange L profile against SolidWorks (report 2026-11-02 5d, miter_L2.json): the first line's strips end square
    // T + g/√2 past the base's corner, the second bend's end runs from that wall's end to the 45° wall line
    test('rfIZ: Miter Flange L profile (Material Inside, gap .01, rect relief): SolidWorks\' flat to the digit, folded within 2e-5', function () {
      var r = buildP(HEAD + 'p.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.sketch("Right").line(-2, ' + T + ', -2, 1.0598).line(-2, 1.0598, -2.5, 1.0598).end();\np.miterFlange([[2, ' + T + ', 2], [4, ' + T + ', 1]], { position: "inside", miterGap: 0.01, relief: "rect" });\n');
      noErrors(r);
      nearRel(blankArea(r.flat) * T, 1.017194654, 1e-6, 'blank area × T (SolidWorks\' flat body)');
      nearRel(r.mp.volume, 1.016735486, 2e-5, 'folded volume');
      var sw = [[0, 0], [0, 3.482801], [3.933129, 1.933129], [3.933129, 2.9017], [4.052729, 3.042601], [4.492929, 3.482801], [4.9017, 1.933129], [5.042601, 2.052729], [5.482801, 0], [5.482801, 2.492929]];
      eq(r.flat.loops[0].length, sw.length, 'outline corners');
      sw.forEach(function (q) {
        var d = Math.min.apply(null, r.flat.loops[0].map(function (p) { return Math.hypot(p[0] - q[0], -p[1] - q[1]); }));
        ok(d < 2e-6, 'SolidWorks corner (' + q.join(', ') + ') ' + d.toExponential(2) + ' away');
      });
      return r.mp.volume.toFixed(9);
    });
  })();
