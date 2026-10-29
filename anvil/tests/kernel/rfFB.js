  // --- rfFB (2026-10-29, lane FB: Boundary Boss/Base, Boundary Cut) --- { type: 'boundary', dir1: [profile sketches],
  // dir2: [curves], cut, thin, close }: a solid bounded by the Direction 1 profiles, its sides shaped by Direction 2
  // curves that touch every profile (Coons patches on the curves); with no curves it is the Loft through the profiles.
  (function () {
    group('rfFB: Boundary Boss/Base and Boundary Cut');
    var R2 = Math.SQRT1_2, S2 = Math.SQRT2;
    var FRUSTUM = 'var a = p.sketch("Front").centerRect(0, 0, 2, 2).id();\nvar b = p.sketch("Front", 2).centerRect(0, 0, 1, 1).id();\n';
    // the four corner lines (±1, ±1, 0) → (±0.5, ±0.5, 2), two to a sketch on the diagonal planes through Z
    var GUIDES = 'var g1 = p.sketch({ custom: true, origin: [0, 0, 0], x: [' + R2 + ', ' + R2 + ', 0], y: [0, 0, 1], n: [' + R2 + ', ' + (-R2) + ', 0] }, 0)' +
      '.line(' + S2 + ', 0, ' + S2 / 2 + ', 2).line(' + (-S2) + ', 0, ' + (-S2 / 2) + ', 2).id();\n' +
      'var g2 = p.sketch({ custom: true, origin: [0, 0, 0], x: [' + R2 + ', ' + (-R2) + ', 0], y: [0, 0, 1], n: [' + (-R2) + ', ' + (-R2) + ', 0] }, 0)' +
      '.line(' + S2 + ', 0, ' + S2 / 2 + ', 2).line(' + (-S2) + ', 0, ' + (-S2 / 2) + ', 2).id();\n';
    var V_FRUSTUM = 2 / 3 * (4 + 1 + Math.sqrt(4 * 1));   // (h/3)(A1 + A2 + √(A1·A2))
    function rfFBLast(r) { return r.model.features[r.model.features.length - 1]; }
    function rfFBRound(r) {
      var s = K.generateScript(r.model), m2 = K.newModel('rt');
      K.runScript(m2, s);
      var b2 = K.rebuild(m2);
      assert(!Object.keys(b2.errors).length, 'script round trip errors ' + JSON.stringify(b2.errors) + '\n' + s);
      var j = JSON.parse(JSON.stringify(r.model)), b3 = K.rebuild(j);
      assert(!Object.keys(b3.errors).length, 'JSON round trip errors ' + JSON.stringify(b3.errors));
      return { script: s, v: K.massProps(K.meshFromBody(b2.body)).volume, vj: K.massProps(K.meshFromBody(b3.body)).volume };
    }

    test('rfFB: Direction 1 only (2 × 2 square at z = 0, 1 × 1 at z = 2) is the exact frustum (h/3)(A1 + A2 + √(A1A2)), equal to the Loft; named Boundary-Boss1', function () {
      var r = build(FRUSTUM + 'p.boundary([a, b]);'), lo = build(FRUSTUM + 'p.loft([a, b]);');
      noErrors(r); noErrors(lo);
      nearRel(r.mp.volume, V_FRUSTUM, 1e-9, 'boundary volume');
      nearRel(r.mp.volume, lo.mp.volume, 1e-12, 'equal to the loft');
      assert(rfFBLast(r).name === 'Boundary-Boss1', 'name ' + rfFBLast(r).name);
      consistentVolume(r);
      return 'V = ' + fmt(r.mp.volume);
    });

    test('rfFB: four straight Direction 2 lines joining the corners give the same exact frustum (6 planar faces); as 3D polylines too', function () {
      var r = build(FRUSTUM + GUIDES + 'p.boundary([a, b], { dir2: [g1, g2] });');
      noErrors(r);
      nearRel(r.mp.volume, V_FRUSTUM, 1e-9, 'volume with sketch curves');
      assert(r.mesh.faces.length === 6, 'faces ' + r.mesh.faces.length);
      assert(!r.build.warnings[rfFBLast(r).id], 'no warning: ' + r.build.warnings[rfFBLast(r).id]);
      var g4 = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(function (c) { return '{ pts: [[' + c[0] + ', ' + c[1] + ', 0], [' + c[0] / 2 + ', ' + c[1] / 2 + ', 2]] }'; });
      var r2 = build(FRUSTUM + 'p.boundary([a, b], { dir2: [' + g4.join(', ') + '] });');
      noErrors(r2);
      nearRel(r2.mp.volume, V_FRUSTUM, 1e-9, 'volume with 3D curves');
      // one entity of a two-line sketch: only that line's chain is a curve
      var r3 = build(FRUSTUM + GUIDES + 'p.boundary([a, b], { dir2: [{ sketch: g1, entity: 0 }, { sketch: g1, entity: 1 }, g2] });');
      noErrors(r3);
      nearRel(r3.mp.volume, V_FRUSTUM, 1e-9, 'volume with entity picks');
      return 'V = ' + fmt(r.mp.volume);
    });

    test('rfFB: a Boundary Cut of the frustum through a 3 × 3 × 2 block leaves block − frustum; named Boundary-Cut1', function () {
      var r = build('p.sketch("Front").centerRect(0, 0, 3, 3).end().extrude(2);\n' + FRUSTUM + GUIDES + 'p.boundaryCut([a, b], { dir2: [g1, g2] });');
      noErrors(r);
      nearRel(r.mp.volume, 18 - V_FRUSTUM, 1e-9, 'block minus frustum');
      assert(rfFBLast(r).name === 'Boundary-Cut1' && K.isCut(rfFBLast(r), r.model), 'cut ' + rfFBLast(r).name);
      var r2 = build('p.sketch("Front").centerRect(0, 0, 3, 3).end().extrude(2);\n' + FRUSTUM + 'p.boundary([a, b], { cut: true });');
      noErrors(r2);
      nearRel(r2.mp.volume, 18 - V_FRUSTUM, 1e-9, 'cut without curves');
      return 'V = ' + fmt(r.mp.volume);
    });

    test('rfFB: a Direction 2 curve that misses a profile is refused; one profile is refused', function () {
      var r = build(FRUSTUM + 'p.boundary([a, b], { dir2: [{ pts: [[1, 0, 0], [3, 0, 2]] }] });');
      var e = r.errors[rfFBLast(r).id];
      assert(e && /must intersect every Direction 1 profile/.test(e), 'error: ' + e);
      var r2 = build(FRUSTUM + 'p.boundary({ dir1: [a, b], dir2: [{ pts: [[0, 0, 1], [0, 3, 1]] }] });');
      assert(/must intersect/.test(r2.errors[rfFBLast(r2).id] || ''), 'error: ' + r2.errors[rfFBLast(r2).id]);
      var threw = false;
      try { build(FRUSTUM + 'p.boundary([a]);'); } catch (er) { threw = /at least two/.test(er.message); }
      assert(threw, 'one profile is refused by the script API');
      return e;
    });

    test('rfFB: Thin Feature 0.1 thick, outward and reversed (inward): walls parallel to the sides, ends in the profile planes (exact)', function () {
      var h = 0.1 * Math.sqrt(1 + 0.25 * 0.25);   // the side planes x = 1 − z/4 moved 0.1 along their normals
      function frustumWith(d) { var a0 = 1 + d, a1 = a0 - 0.5; return 2 / 3 * (4 * a0 * a0 + 4 * a1 * a1 + 4 * a0 * a1); }
      var r = build(FRUSTUM + GUIDES + 'p.boundary([a, b], { dir2: [g1, g2], thin: { t: 0.1 } });');
      noErrors(r);
      nearRel(r.mp.volume, frustumWith(h) - V_FRUSTUM, 1e-9, 'outward wall');
      var r2 = build(FRUSTUM + 'p.boundary([a, b], { thin: { t: 0.1, reverse: true } });');
      noErrors(r2);
      nearRel(r2.mp.volume, V_FRUSTUM - frustumWith(-h), 1e-9, 'inward wall');
      var r3 = build(FRUSTUM + 'p.boundary([a, b], { thin: { t: 0.1, mid: true } });');
      noErrors(r3);
      nearRel(r3.mp.volume, frustumWith(h / 2) - frustumWith(-h / 2), 1e-9, 'mid-plane wall');
      return 'V = ' + fmt(r.mp.volume) + ', ' + fmt(r2.mp.volume) + ', ' + fmt(r3.mp.volume);
    });

    test('rfFB: Close joins the last profile back to the first: four 1 × 1 squares at radius 5 about Y make the ruled ring (exact 20)', function () {
      var code = '', ids = [];
      for (var i = 0; i < 4; i++) {
        var t = i * Math.PI / 2, c = Math.round(Math.cos(t)), s = Math.round(Math.sin(t));
        code += 'var q' + i + ' = p.sketch({ custom: true, origin: [0, 0, 0], x: [' + c + ', 0, ' + s + '], y: [0, 1, 0], n: [' + (-s) + ', 0, ' + c + '] }, 0).centerRect(5, 0, 1, 1).id();\n';
        ids.push('q' + i);
      }
      var r = build(code + 'p.boundary([' + ids.join(', ') + '], { close: true });');
      noErrors(r);
      nearRel(r.mp.volume, 20, 1e-9, 'ring');   // each quarter: ∫ r dr dy dt = (5.5² − 4.5²)/2
      return 'V = ' + fmt(r.mp.volume);
    });

    test('rfFB: curved Direction 2 curves bulge the sides between two Ø2 circles 3 apart (symmetric, more than the cylinder, less than the Ø2.6 one)', function () {
      var r = build('var c1 = p.sketch("Front").circle(0, 0, 1).id();\nvar c2 = p.sketch("Front", 3).circle(0, 0, 1).id();\n' +
        'p.boundary([c1, c2], { dir2: [{ pts: [[1, 0, 0], [1.3, 0, 1.5], [1, 0, 3]] }, { pts: [[-1, 0, 0], [-1.3, 0, 1.5], [-1, 0, 3]] }] });');
      noErrors(r);
      var bb = r.body.getBounds();
      near(bb.max[0], 1.3, 1e-9, 'bulge reaches the curve'); near(bb.min[0], -1.3, 1e-9, 'both sides');
      assert(r.mp.volume > Math.PI * 3 && r.mp.volume < Math.PI * 1.69 * 3, 'volume ' + r.mp.volume);
      return 'V = ' + fmt(r.mp.volume);
    });

    test('rfFB: generateScript writes p.boundary with its curves and options; the script and JSON round trips rebuild the same solid', function () {
      var r = build(FRUSTUM + GUIDES + 'p.boundary([a, b], { dir2: [g1, { sketch: g2, entity: 1 }, { sketch: g2, entity: 0 }], tangency1: { start: "normal" }, mergeTangent: false, thin: { t: "=0.05*2" } });');
      noErrors(r);
      var f = rfFBLast(r);
      assert(f.tangency1.start === 'normal' && f.tangency1.end === 'none' && f.mergeTangent === false && f.thin.t === '=0.05*2', JSON.stringify(f));
      assert(/End tangency is not applied yet/.test(r.build.warnings[f.id] || ''), 'tangency warning: ' + r.build.warnings[f.id]);
      var rt = rfFBRound(r);
      assert(/p\.boundary\(\[f1, f2\], \{ dir2: \[f3, \{ sketch: f4, entity: 1 \}, \{ sketch: f4, entity: 0 \}\]/.test(rt.script), rt.script);
      assert(/tangency1: \{"start":"normal","end":"none"\}/.test(rt.script) && /mergeTangent: false/.test(rt.script) && /thin: \{"t":"=0\.05\*2"\}/.test(rt.script), rt.script);
      nearRel(rt.v, r.mp.volume, 1e-12, 'script round trip'); nearRel(rt.vj, r.mp.volume, 1e-12, 'JSON round trip');
      var c = build('p.sketch("Front").centerRect(0, 0, 3, 3).end().extrude(2);\n' + FRUSTUM + 'p.boundaryCut([a, b], { merge: false });');
      var rc = rfFBRound(c);
      assert(/p\.boundary\(\[f3, f4\], \{ name: "Boundary-Cut1", cut: true \}\)/.test(rc.script), rc.script);
      nearRel(rc.v, 18 - V_FRUSTUM, 1e-9, 'cut round trip');
      return 'ok';
    });

    test('rfFB: Direction 2 sketches give no "open contour" warning', function () {
      var r = build(FRUSTUM + GUIDES + 'p.boundary([a, b], { dir2: [g1, g2] });');
      noErrors(r);
      var ids = r.model.features.filter(function (f) { return f.type === 'sketch'; }).map(function (f) { return f.id; });
      ids.forEach(function (id) { assert(!r.build.warnings[id], 'sketch ' + id + ' warning: ' + r.build.warnings[id]); });
      return 'ok';
    });
  })();
