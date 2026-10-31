  // --- rfFN (2026-10-29, lane FN: feature stacks never throw, stay watertight, fail like SolidWorks) --- found by a
  // fuzz of a few hundred Builder parts: an island inside a hole was dropped, outlines sharing an edge left a double
  // internal wall, zero-thickness results (tangent holes in a pattern, blocks meeting on an edge) and a cut that took
  // every body built silently, a revolve of 0° made 360°, a loft between two profiles in one plane gave a zero-volume
  // body, a sweep round a corner tighter than its profile (or doubling back) gave open edges. A failed feature now
  // leaves the bodies before it untouched and its children say which parent failed (kernel-rebuild.js rebuildModel,
  // profileComponents, nonManifoldCount; kernel-features.js buildSweep / buildLoft).
  (function () {
    group('rfFN: feature stacks fail cleanly, keep the part, stay watertight');
    var PI = Math.PI, BLOCK = 'p.box(40, 30, 20);\n';
    function rfFNtight(r, label) {
      (r.build.bodies || []).forEach(function (b, i) {
        var c = Evaluate.checkBody(b);
        assert(!c.openEdges.length && !c.nonManifoldEdges.length, (label || '') + ' body ' + i + ': ' + c.openEdges.length + ' open, ' + c.nonManifoldEdges.length + ' non-manifold edges');
      });
    }
    function rfFNerr(r, name) {
      var f = r.model.features.filter(function (x) { return x.name === name; })[0];
      assert(f, 'no feature ' + name);
      return r.errors[f.id] || '';
    }
    function rfFNonly(r, names) {
      var got = Object.keys(r.errors).map(function (id) { return K.findFeature(r.model, +id).name; }).sort();
      assert(JSON.stringify(got) === JSON.stringify(names.slice().sort()), 'errors on ' + JSON.stringify(got) + ', expected ' + JSON.stringify(names) + ': ' + JSON.stringify(r.errors));
    }
    var PLAIN = /^[A-Z][^]*\.$/, JSERR = /TypeError|ReferenceError|Cannot read|is not a function|undefined|NaN|Infinity|\bnull\b/;

    test('rfFN: an island inside a hole is extruded (SolidWorks: a second solid), the hole stays; exact and watertight', function () {
      var r = build('p.sketch("Front").rect(0, 0, 20, 20).circle(10, 10, 5).rect(8, 8, 4, 4).end().extrude(5);');
      noErrors(r); rfFNtight(r);
      nearRel(r.mp.volume, (400 - 25 * PI + 16) * 5, 1e-6, 'outline − hole + island');
      var rv = build('p.sketch("Front").rect(10, 0, 20, 20).circle(20, 10, 5).rect(18, 8, 4, 4).end().revolve(360, { axis: "y" });');
      noErrors(rv); rfFNtight(rv, 'revolved');
      return 'island kept: ' + r.mp.volume.toFixed(4);
    });
    test('rfFN: two outlines that share an edge extrude as one solid (no internal wall, no non-manifold edges)', function () {
      var r = build('p.sketch("Front").rect(0, 0, 10, 10).rect(10, 0, 10, 10).end().extrude(5);');
      noErrors(r); rfFNtight(r);
      nearRel(r.mp.volume, 1000, 1e-9, 'volume');
      assert(r.build.bodies.length === 1, 'one body');
      return 'ok';
    });
    test('rfFN: a pattern of tangent holes is zero-thickness geometry: refused, the part before it kept, later features build; 0.01 apart is accepted', function () {
      var r = build(BLOCK + 'p.sketch("Top", 20).circle(10, -15, 3).end().cut("through", { reverse: true });\np.linearPattern({ dir: "x", spacing: 6, count: 2 });\np.sketch("Top", 20).circle(32, -15, 2).end().cut("through", { reverse: true });');
      rfFNonly(r, ['LPattern1']);
      assert(/zero-thickness geometry/.test(rfFNerr(r, 'LPattern1')) && PLAIN.test(rfFNerr(r, 'LPattern1')), rfFNerr(r, 'LPattern1'));
      nearRel(r.mp.volume, 24000 - 20 * PI * (9 + 4), 1e-6, 'block − first hole − the later hole');
      rfFNtight(r);
      var ok = build(BLOCK + 'p.sketch("Top", 20).circle(10, -15, 3).end().cut("through", { reverse: true });\np.linearPattern({ dir: "x", spacing: 6.01, count: 2 });');
      noErrors(ok); rfFNtight(ok, 'near miss');
      nearRel(ok.mp.volume, 24000 - 2 * 20 * PI * 9, 1e-6, 'two holes 0.01 apart');
      return 'refused / accepted';
    });
    test('rfFN: outlines touching at a corner and a boss meeting the part on one edge are refused; a flush boss sharing a face is not', function () {
      var a = build('p.sketch("Front").rect(0, 0, 10, 10).rect(10, 10, 10, 10).end().extrude(5);');
      assert(/zero-thickness/.test(rfFNerr(a, 'Boss-Extrude1')), 'corner: ' + JSON.stringify(a.errors));
      var b = build('p.sketch("Front").rect(0, 0, 10, 10).end().extrude(5);\np.sketch("Front", 5).rect(10, 0, 10, 10).end().extrude(5);');
      rfFNonly(b, ['Boss-Extrude2']); nearRel(b.mp.volume, 500, 1e-12, 'first block kept');
      var c = build(BLOCK + 'p.sketch("Front", 30).rect(0, 0, 40, 20).end().extrude(10);\np.sketch("Front", 40).rect(0, 0, 10, 10).end().extrude(3);');
      noErrors(c); rfFNtight(c, 'flush'); nearRel(c.mp.volume, 24000 + 8000 + 300, 1e-12, 'flush unions');
      var d = build(BLOCK + 'p.circularPattern({ axis: "y", center: [0, 0, 0], count: 2 });');
      rfFNonly(d, ['CirPattern1']);
      return 'ok';
    });
    test('rfFN: a cut that would remove every body fails and keeps the part (was: an empty part, no error); the next boss builds', function () {
      var r = build(BLOCK + 'p.sketch("Top", 20).rect(-10, -40, 60, 50).end().cut("through", { reverse: true });\np.sketch("Top", 20).circle(10, -10, 2).end().extrude(5);');
      rfFNonly(r, ['Cut-Extrude1']);
      assert(/remove all of the material/.test(rfFNerr(r, 'Cut-Extrude1')), rfFNerr(r, 'Cut-Extrude1'));
      nearRel(r.mp.volume, 24000 + 20 * PI, 1e-6, 'block + boss');
      assert(r.build.bodies.length === 1, 'one body');
      return 'kept';
    });
    // rfFS (2026-10-30): script cuts with no direction go into the material, so an empty cut is SolidWorks' rebuild
    // error now (it was a warning while the default was +normal); the part before it is kept
    test('rfFN: a Cut-Extrude sketched on the top face cutting away from the part is an error, the part kept, the rest builds; a cut that changes one of two bodies neither fails nor warns', function () {
      var r = build(BLOCK + 'p.sketch("Top", 20).circle(10, -10, 3).end().cut(5, { reverse: false });\np.sketch("Top", 20).circle(30, -20, 2).end().cut("through", { reverse: true });');
      rfFNonly(r, ['Cut-Extrude1']);
      var e = rfFNerr(r, 'Cut-Extrude1');
      assert(/does not intersect the model/.test(e) && K.isRefusal(e), 'error: ' + e);
      nearRel(r.mp.volume, 24000 - 20 * 4 * PI, 1e-6, 'block − the later hole');
      var p = build(BLOCK + 'p.sketch("Top", 20).circle(10, -10, 3).end().cut("through", { reverse: true });\np.linearPattern({ dir: "x", spacing: 100, count: 2 });');
      rfFNonly(p, ['LPattern1']);
      assert(/does not intersect the model/.test(rfFNerr(p, 'LPattern1')), 'pattern error: ' + rfFNerr(p, 'LPattern1'));
      nearRel(p.mp.volume, 24000 - 20 * 9 * PI, 1e-6, 'block − the seed hole');
      var two = build(BLOCK + 'p.box(10, 10, 10, { at: [60, 0, 0], merge: false });\np.sketch("Top", 20).circle(10, -10, 3).end().cut("through", { reverse: true });');
      noErrors(two);
      assert(Object.keys(two.warnings).length === 0, 'a cut that changes one of two bodies neither fails nor warns: ' + JSON.stringify(two.warnings));
      return e;
    });
    test('rfFN: a failed feature never blanks the part; a pattern / mirror of it says its parent failed; the rest of the tree builds', function () {
      var r = build(BLOCK + 'p.sketch("Top", 20).polyline([[5, -5], [15, -15], [15, -5], [5, -15]]).end().cut(5, { reverse: true });\np.linearPattern({ dir: "x", spacing: 20, count: 2 });\np.mirror("Front", { offset: 15 });\np.sketch("Top", 20).circle(30, -20, 2).end().cut("through", { reverse: true });');
      rfFNonly(r, ['Cut-Extrude1', 'LPattern1', 'Mirror1']);
      assert(/crosses itself/.test(rfFNerr(r, 'Cut-Extrude1')), rfFNerr(r, 'Cut-Extrude1'));
      assert(/parent feature Cut-Extrude1 failed/.test(rfFNerr(r, 'LPattern1')), rfFNerr(r, 'LPattern1'));
      assert(/parent feature LPattern1 failed/.test(rfFNerr(r, 'Mirror1')), rfFNerr(r, 'Mirror1'));
      nearRel(r.mp.volume, 24000 - 20 * 4 * PI, 1e-6, 'block − the last hole');
      rfFNtight(r);
      return 'ok';
    });
    test('rfFN: revolve of 0°, a loft between two profiles in one plane, a sweep that doubles back or turns tighter than its profile: plain errors; a corner the profile clears builds', function () {
      var cases = {
        rev: ['p.sketch("Front").rect(0, 0, 10, 10).end().revolve(0, { axis: "y" });', 'Revolve1', /angle must be greater than zero/],
        loft: ['var a = p.sketch("Top").circle(0, 0, 5).id();\nvar b = p.sketch("Top").circle(0, 0, 3).id();\np.loft([a, b]);', 'Loft1', /same plane/],
        back: ['p.sketch("Front").circle(0, 0, 3);\np.sweep({ path: [[0, 0, 0], [0, 0, 10], [0, 0, 0]] });', 'Sweep1', /turns back on itself/],
        tight: ['p.sketch("Front").circle(0, 0, 5);\np.sweep({ path: [[0, 0, 0], [0, 0, 20], [1, 0, 20]] });', 'Sweep1', /intersect itself/]
      };
      Object.keys(cases).forEach(function (k) {
        var c = cases[k], r = build(c[0]), e = rfFNerr(r, c[1]);
        assert(c[2].test(e) && PLAIN.test(e) && !JSERR.test(e), k + ': ' + JSON.stringify(r.errors));
      });
      var ok = build('p.sketch("Front").circle(0, 0, 2);\np.sweep({ path: [[0, 0, 0], [0, 0, 20], [10, 0, 20]] });');
      noErrors(ok); rfFNtight(ok, 'sweep corner');
      return 'ok';
    });
    test('rfFN: bad sketches give plain sentences, never a JavaScript error, and nothing after them breaks', function () {
      var bad = [
        'p.sketch("Front").line(0, 0, 0, 0).end().extrude(5);',
        'p.sketch("Front").polyline([[0, 0], [10, 10], [10, 0], [0, 10]]).end().extrude(5);',
        'p.sketch("Front").rect(0, 0, 20, 20).circle(20, 10, 5).end().extrude(5);',
        'p.sketch("Front").end().extrude(5);',
        'p.sketch("Front").circle(0, 0, 0).end().extrude(5);',
        'p.sketch("Front").ellipse(0, 0, 10, 0, 0).end().extrude(5);',
        'p.sketch("Front").rect(0, 0, 10, 10).end().extrude(0);',
        'p.sketch("Front").rect(-5, 0, 10, 10).end().revolve(360, { axis: "y" });',
        'p.sketch("Front").rect(0, 0, 10, 10).end().revolve(360, { axis: 7 });',
        'p.linearPattern({ feature: 999, dir: "x", spacing: 10, count: 3 });',
        'var prof = p.sketch("Front").circle(0, 0, 3).id();\np.sweep({ profile: prof, path: 999 });'
      ];
      bad.forEach(function (code) {
        var r = build(BLOCK + code + '\np.sketch("Top", 20).circle(30, -20, 2).end().cut("through", { reverse: true });');
        var ids = Object.keys(r.errors);
        assert(ids.length >= 1, 'no error for ' + code);
        ids.forEach(function (id) { assert(PLAIN.test(r.errors[id]) && !JSERR.test(r.errors[id]), code + ' → ' + r.errors[id]); });
        nearRel(r.mp.volume, 24000 - 20 * 4 * PI, 1e-6, 'block − hole after: ' + code);
      });
      return bad.length + ' bad inputs';
    });
    test('rfFN (head): K.isRefusal marks the on-purpose refusals, which ui-occt.js suppresses for OpenCascade; parent and ordinary errors are not refusals', function () {
      var r = build(BLOCK + 'p.sketch("Top", 20).circle(10, -15, 3).end().cut("through", { reverse: true });\np.linearPattern({ dir: "x", spacing: 6, count: 2 });');
      assert(K.isRefusal(rfFNerr(r, 'LPattern1')), 'zero thickness: ' + rfFNerr(r, 'LPattern1'));
      assert(K.isRefusal('This cut would remove all of the material: nothing would be left of the part.'), 'cut leaving nothing');
      assert(K.isRefusal('Revolve angle must be greater than zero.'), 'revolve 0');
      assert(!K.isRefusal('The parent feature Boss-Extrude1 failed to rebuild. Fix it first.'), 'parent failed is not a refusal');
      assert(!K.isRefusal('Failed to create fillet.') && !K.isRefusal(undefined), 'ordinary error');
      return 'ok';
    });
    // rfFN2: the shell slab of a face whose outline has a shallow bite (a hole breaking through a side wall) folded its
    // offset outline over itself (a swallowtail plus a run doubling back along the edge); every boolean with that
    // self-intersecting prism cracked (45 open edges). untangleLoop / outerPieces keep the outer boundary only.
    test('rfFN2: shell of a hexagon whose hole breaks through a side wall is watertight and matches OpenCascade (8430.2437, within 1e-5) at four thicknesses', function () {
      var base = 'p.sketch("Top").polygon(0, 0, 25, 6).end().extrude(20);\np.sketch("Top", 20).circle(4.55, -19.77, 2.1).end().cut("through", { reverse: true });\n';
      // OpenCascade's volumes (MakeThickSolid, exact cylinders); Anvil's hole wall offset is faceted near the bite
      var occ = { 1: 4525.555186574758, 1.5: 6609.66095275892, 1.96: 8430.243711954256, 2.5: 10453.795857799854 };
      Object.keys(occ).forEach(function (t) {
        var r = build(base + 'p.shell(' + t + ', [[4.96, 20, 2.1]]);');
        noErrors(r); rfFNtight(r, 'T ' + t);
        nearRel(r.mp.volume, occ[t], 1e-5, 'T ' + t);   // 2e-6 in the full suite (the tessellation earlier groups leave)
      });
      var box = build('p.box(40, 30, 20);\np.sketch("Top", 20).circle(10, 0.5, 3).end().cut("through", { reverse: true });\np.shell(2, [[20, 20, 15]]);');
      noErrors(box); rfFNtight(box, 'block'); nearRel(box.mp.volume, 7205.36089653893, 1e-5, 'block with a hole breaking its front wall');
      var lp = [[0, 0], [10, 0], [10, 4], [6, 4], [6, 4.0000001], [6, 6], [0, 6]];
      assert(K._.untangleLoop([[0, 0], [10, 0], [10, 10], [12, 5], [8, 5], [0, 10]]).length === 1, 'a swallowtail is dropped');
      assert(K._.untangleLoop(lp).length === 1, 'a simple loop stays one loop');
      return 'watertight';
    });
    test('rfFN2: a loft whose profile lies on both sides of its neighbour\'s plane is refused (a refusal: OpenCascade skips it); an elbow between Top and Right profiles and a tilted loft still build', function () {
      var r = build('var a = p.sketch("Top").centerRect(0, 0, 27.87, 21.99).id();\nvar b = p.sketch("Front", 20.7).polygon(0, 0, 13.54, 8, 50.81).id();\np.loft([a, b]);');
      var e = rfFNerr(r, 'Loft1');
      assert(/loft would intersect itself/.test(e) && /profile 2 lies on both sides of the plane of profile 1/.test(e) && PLAIN.test(e), e);
      assert(K.isRefusal(e), 'a refusal');
      var elbow = build('var a = p.sketch("Top").rect(0, -5, 10, 10).id();\nvar b = p.sketch("Right", 20).rect(-5, 5, 10, 10).id();\np.loft([a, b]);');
      noErrors(elbow); rfFNtight(elbow, 'elbow');
      assert(elbow.mp.volume > 0, 'elbow volume');
      var tilt = build('var a = p.sketch("Top").centerRect(0, 0, 10, 10).id();\nvar b = p.sketch("Front", 30).rect(-4, 2, 8, 8).id();\np.loft([a, b]);');
      noErrors(tilt); rfFNtight(tilt, 'tilted');
      return e;
    });
  })();
