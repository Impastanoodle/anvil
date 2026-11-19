  // --- rfQS (lane solidleft, 2026-11-19; report test-reports/2026-11-19-solids-fidelity-9.md): solids / STEP leftovers.
  (function () {
    group('rfQS: solids fidelity 9: a hole wall sharing its rim with a split face, cracked read-backs, a rib over a hole');
    function rfQSbuild(code) { var m = K.newModel('rfQS'); K.runScript(m, code); return { m: m, b: K.rebuild(m) }; }
    function rfQSvol(b) { return K.massProps(K.meshFromBody(b.body), 1).volume; }
    // every EDGE_CURVE of a STEP file and how many ORIENTED_EDGEs use it (a closed shell: two each)
    function rfQSedgeUses(st) {
      var uses = {}, m, re = /#(\d+)=EDGE_CURVE\(/g, ro = /ORIENTED_EDGE\('',\*,\*,#(\d+),/g;
      while ((m = re.exec(st))) uses[m[1]] = 0;
      while ((m = ro.exec(st))) uses[m[1]] = (uses[m[1]] || 0) + 1;
      return Object.keys(uses).filter(function (k) { return uses[k] !== 2; }).map(function (k) { return '#' + k + ' x' + uses[k]; });
    }
    var T6028 = 'p.units("in");\np.sketch("Top").circle(0, 0, 0.5).circle(0, 0, 0.25).end().extrude(1.5);\np.sketch("Top", 2.5).rect(-0.0625, 0.2, 0.125, 0.1425).end().cut("through", { reverse: true });\np.sketch("Front", 1.5).circle(0, 0.2559, 0.0625).end().cut("through", { reverse: true });\n';
    // 1. exchange.js writer (loopEdges, Exchange.circleCuts): the keyway floor is two pieces touching at the cross hole's
    //    rim, each written with half the circle; the hole's wall wrote the same rim as one closed edge of its own, so
    //    three edges were used by one face each (OpenCascade: shell not closed, no solid). The wall takes the arcs.
    test('rfQS: fuzz t6028: the cross hole\'s wall uses the keyway floor\'s two arcs: every EDGE_CURVE used by two faces, read back closed (control: off, three edges used once)', function () {
      var r = rfQSbuild(T6028), v = rfQSvol(r.b), st, off;
      assert(!Object.keys(r.b.errors).length, JSON.stringify(r.b.errors));
      try { Exchange.circleCuts.on = false; off = rfQSedgeUses(Exchange.exportSTEP(r.m, r.b)); } finally { Exchange.circleCuts.on = true; }
      st = Exchange.exportSTEP(r.m, r.b);
      var bad = rfQSedgeUses(st);
      assert(!bad.length, 'edges not used twice: ' + bad.join(', '));
      assert(off.length === 3, 'control (off): ' + off.join(', '));
      var back = K.rebuild(Exchange.newPartFromImport(Exchange.importFile('rfQS.step', st, { units: 'in' }))), ck = Evaluate.checkBody(back.body), rel = (rfQSvol(back) - v) / v;
      assert(ck.openEdges.length + ck.nonManifoldEdges.length === 0, ck.openEdges.length + ' open, ' + ck.nonManifoldEdges.length + ' non-manifold read back');
      assert(Math.abs(rel) < 1e-8, 'read back ' + rel.toExponential(2));
      return (st.match(/=EDGE_CURVE\(/g) || []).length + ' edges, all used twice; read back ' + rel.toExponential(1);
    });
    // 2. exchange.js reader (the zipped cylinder patch, zipFolds): a pocket wall's floor side is the floor's arcs and a
    //    side hole's curve leaving them upright; zipped against the top side as one row, a triangle folded (3 edges
    //    oriented inconsistently, read back 1.8e-7 off); it goes to cylPatch now
    test('rfQS: fuzz m6043: a pocket wall cut by a side hole at the floor reads back closed at the volume to 1e-9', function () {
      var r = rfQSbuild('p.units("in");\np.sketch("Top").centerRect(0, 0, 3, 3).end().extrude(0.5);\np.sketch("Top", 0.25).circle(1.5, 0, 0.25).end().extrude(0.25, { merge: false });\np.intersect({ regions: [true,false,false] });\np.sketch("Front", 5).circle(1.5, 0.25, 0.0625).end().cut("through", { reverse: true });\n');
      assert(!Object.keys(r.b.errors).length, JSON.stringify(r.b.errors));
      var v = rfQSvol(r.b), st = Exchange.exportSTEP(r.m, r.b), back = K.rebuild(Exchange.newPartFromImport(Exchange.importFile('rfQS.step', st, { units: 'in' })));
      var ck = Evaluate.checkBody(back.body), rel = (rfQSvol(back) - v) / v;
      assert(ck.openEdges.length + ck.nonManifoldEdges.length === 0, ck.openEdges.length + ' open, ' + ck.nonManifoldEdges.length + ' non-manifold read back');
      assert(Math.abs(rel) < 1e-9, 'read back ' + rel.toExponential(2));
      return 'read back ' + rel.toExponential(1);
    });
    // 3. kernel-features.js buildRib (K.ribBridge): a rib over a hole through the face it meets stops at that face's
    //    plane (the face taken whole across the rib) and the hole stays open under it (fuzz b6078; was: the rib ran down
    //    the hole to its far wall, 0.0557 in3 on this part)
    test('rfQS: fuzz b6078: an L-bracket\'s rib over a hole through the base: the part is the same rib over no hole less the whole hole, to 1e-9 (control: off, the rib fills the hole)', function () {
      var L = 'p.units("in");\np.sketch("Front").polyline([[0, 0], [2.25, 0], [2.25, 0.25], [0.25, 0.25], [0.25, 2], [0, 2]]).end().extrude(3, { midplane: true });\n';
      var HOLE = 'p.sketch("Top", 1.25).circle(1.05, -0.1, 0.125).end().cut("through", { reverse: true });\n', RIB = 'p.sketch("Front", 0).line(0.25, 1.5491, 1.982, 0.25).end().rib(0.1875);\n';
      var noHole = rfQSbuild(L + RIB), withHole = rfQSbuild(L + HOLE + RIB), off;
      try { K.ribBridge.on = false; off = rfQSbuild(L + HOLE + RIB); } finally { K.ribBridge.on = true; }
      [noHole, withHole, off].forEach(function (r) { assert(!Object.keys(r.b.errors).length, JSON.stringify(r.b.errors)); });
      var rib = 0.5 * 1.2991 * 1.732 * 0.1875, hole = Math.PI * 0.125 * 0.125 * 0.25, v0 = rfQSvol(noHole.b), v1 = rfQSvol(withHole.b), v2 = rfQSvol(off.b);
      assert(Math.abs(v0 - (3 + rib)) < 1e-9, 'no hole: ' + v0 + ' want ' + (3 + rib));
      assert(Math.abs(v1 - (3 + rib - hole)) < 1e-9, 'over the hole: ' + v1 + ' want ' + (3 + rib - hole));
      assert(v2 - v1 > 0.05, 'control (off) ' + v2);
      var ck = Evaluate.checkBody(withHole.b.body);
      assert(ck.openEdges.length + ck.nonManifoldEdges.length === 0, ck.openEdges.length + ' open, ' + ck.nonManifoldEdges.length + ' non-manifold');
      return 'rib ' + (v1 - 3 + hole).toFixed(6) + ' (no hole ' + (v0 - 3).toFixed(6) + '), off ' + (v2 - v1).toFixed(4) + ' more';
    });
    // 4. kernel-rebuild.js tangentContacts (lane QS2): two holes drawn tangent whose decimals overlap by less than the
    //    facets resolve (fuzz p6025: Ø.5 and Ø.1876, centres .343783 apart, radii .3438: 1.7e-5) are refused like an
    //    exact tangency (written exact, the two circles cross: OpenCascade called 14 such plates invalid); a real gap or
    //    an overlap the facets show builds
    test('rfQS: fuzz p6025: two holes overlapping by 1.7e-5 (under the facets\' sagitta) refused with how far to move; a .01 gap and a .01 overlap build', function () {
      var PL = 'p.units("in");\np.sketch("Top").centerRect(0, 0, 3, 2.25).end().extrude(0.105);\np.sketch("Top", 1.105).circle(0.6344, -0.4063, 0.25).end().cut("through", { reverse: true });\n';
      function second(dx) { return PL + 'p.sketch("Top", 1.105).circle(' + (0.4783 + dx) + ', -0.7126, 0.0938).end().cut("through", { reverse: true });\n'; }
      var r = rfQSbuild(second(0)), k = Object.keys(r.b.errors), msg = k.length ? r.b.errors[k[k.length - 1]] : '';
      assert(/zero-thickness/.test(msg) && /overlap by 0\.000017 in/.test(msg) && /Move one of them at least/.test(msg), 'want the refusal: ' + msg);
      assert(K.isRefusal(msg), 'a refusal');
      var gap = rfQSbuild(second(-0.01 * 0.1561 / 0.3438)), over = rfQSbuild(second(0.01 * 0.1561 / 0.3438));
      assert(!Object.keys(gap.b.errors).length, 'gap: ' + JSON.stringify(gap.b.errors));
      assert(!Object.keys(over.b.errors).length, 'overlap: ' + JSON.stringify(over.b.errors));
      return msg.slice(0, 160);
    });
  })();
  // --- end rfQS ---
