  // --- rfPS (2026-11-18, lane holenext: Up To Next and relief leftovers; OpenCascade side tests/occt/rfPS.js) ---
  // A Hole Wizard hole with end 'next' (Up To Next, lane shopflow6) in one wall of a U channel leaves the opposite wall
  // alone; its callout and Hole Table row read THRU (SolidWorks' plain THRU for an end other than Through All), not
  // "↧ 0"; a Design Library feature added by script (AnvilLibrary.addFeature) on sheet metal cuts the sheet it is put
  // on (Link to thickness), not every wall Through All.
  (function () {
    group('rfPS: Up To Next holes (callouts, Hole Table) and library features through one sheet');
    var DWps = typeof Drawing !== 'undefined' ? Drawing : null, ALps = typeof AnvilLibrary !== 'undefined' ? AnvilLibrary : null;
    var T = 0.06;
    // a 4 x 2 base with two 1 in flanges up along x = 0 and x = 4: walls 4 in apart
    var CHAN = 'p.units("in");\np.sheet(' + T + ', 0.06, 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n' +
      'p.flange(1, [[0, ' + T + ', 1]]);\np.flange(1, [[4, ' + T + ', 1]]);\n';
    function rfPSxmax(r) { return r.body.getBounds().max[0]; }
    // the hole on the right wall's outer face at z = 1, y = .7 (Right frame: u = -z, v = y)
    function rfPShole(xmax, end) {
      return 'p.holeWizard({ face: "Right", offset: ' + xmax + ', points: [[-1, 0.7]], standard: "ANSI Inch", type: "tap", size: "#10-32 UNF", end: "' + end + '"' + (end === 'blind' ? ', depth: 0.5' : '') + ' });\n';
    }
    function rfPSchan() { var r0 = build(CHAN); noErrors(r0); return r0; }

    test('rfPS: Up To Next in one wall of a U channel drills that wall only (π r² T removed, #21 = .159); Through All drills both', function () {
      if (!HoleWizard.nextDepth) fail('HoleWizard.nextDepth missing (lane shopflow6\'s holewizard.js)');
      var r0 = rfPSchan(), xm = rfPSxmax(r0), v0 = r0.mp.volume, A = Math.PI * 0.159 * 0.159 / 4;
      var rn = build(CHAN + rfPShole(xm, 'next')); noErrors(rn);
      var rt = build(CHAN + rfPShole(xm, 'through')); noErrors(rt);
      nearRel(v0 - rn.mp.volume, A * T, 1e-9, 'Up To Next removed');
      nearRel(v0 - rt.mp.volume, 2 * A * T, 1e-9, 'Through All removed');
      var f = rn.model.features.filter(function (x) { return x.type === 'hole'; })[0];
      var pos = HoleWizard.positions(f, rn.model, null), s = HoleWizard.spec(f, 'in');
      var d = HoleWizard.nextDepth(f, s, pos.plane, pos.pts[0].p, { bodies: r0.build.bodies });
      // the first exit is the wall's inner face (T), the next entry the far wall's inner face (width - T): halfway
      near(d, (xm - r0.body.getBounds().min[0]) / 2, 1e-9, 'depth halfway across the channel');
      return 'removed ' + (v0 - rn.mp.volume).toExponential(6) + ' (one wall), through ' + (v0 - rt.mp.volume).toExponential(6) + ', depth ' + d.toFixed(6);
    });

    function rfPSdraw(r) {
      var doc = DWps.newDrawing(r.model, { date: '2026-11-18' });
      DWps.standard3View(doc, r.mesh, r.model.units);
      var sh = DWps.compute(doc, r.mesh, r.model, { build: r.build });
      var w = sh.views.filter(function (x) { return x.view.orient === 'Right'; })[0];
      return { doc: doc, sh: sh, w: w };
    }
    test('rfPS: drawing hole callout and Hole Table of an Up To Next tap read "Ø .159 THRU" over "#10-32 UNF THRU" (was "↧ 0")', function () {
      if (!DWps) fail('drawing.js is not loaded');
      var r0 = rfPSchan(), xm = rfPSxmax(r0), r = build(CHAN + rfPShole(xm, 'next')); noErrors(r);
      var d = rfPSdraw(r), F = d.w.frame, p = [xm, 0.7, 1], c = [V.dot(p, F.u), V.dot(p, F.v)];
      DWps.addHoleCallout(d.doc, d.w.view.id, { c: c, r: 0.159 / 2 });
      DWps.addHoleTable(d.doc, d.w.view.id, { origin: { p: [c[0] - 1, c[1] - 0.5] }, all: true });
      var sh = DWps.compute(d.doc, r.mesh, r.model, { build: r.build });
      var an = sh.annotations.filter(function (a) { return a.type === 'holeCallout'; })[0];
      assert(an && an.text === 'Ø .159 THRU #10-32 UNF THRU', an && an.text);
      var rows = sh.holeTables[0].rows.map(function (x) { return x.size; });
      assert(rows.length === 1 && rows[0].replace(/\n/g, ' ') === 'Ø .159 THRU #10-32 UNF THRU', JSON.stringify(rows));
      return an.text + ' | table ' + JSON.stringify(rows);
    });

    test('rfPS: AnvilLibrary.addFeature on sheet metal (script / Design Library) cuts the wall it is put on, Link to thickness (was Through All: both walls)', function () {
      if (!ALps) fail('library.js is not loaded');
      var r0 = rfPSchan(), xm = rfPSxmax(r0), v0 = r0.mp.volume;
      var m = K.newModel('rfPS'); K.runScript(m, CHAN);
      var pl = K.planeFromFace([1, 0, 0], [xm, 0.7, 1]), v = ALps.featureDefaults('slot', 1);
      var p3 = [xm, 0.7, 1]; v.x = V.dot(V.sub(p3, pl.origin), pl.x); v.y = V.dot(V.sub(p3, pl.origin), pl.y);
      var made = ALps.addFeature(m, pl, 'slot', v), b = K.rebuild(m);
      assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
      assert(made.cut.linkT === true && made.cut.end === 'blind' && made.cut.depth === T, JSON.stringify(made.cut));
      nearRel(v0 - K.massProps(K.meshFromBody(b.body), 1).volume, ALps.featureArea('slot', v, 1) * T, 1e-6, 'one wall');
      return 'removed area × T on one wall';
    });
  })();
