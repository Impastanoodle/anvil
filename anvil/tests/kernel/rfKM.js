  // --- rfKM (2026-11-09, lane shopflow3, test-reports/2026-11-09-shop-flow-2.md) --- the shop audit's three jobs, the
  // engine side: (a) a customer's STEP of a 14 ga U channel (a plain solid, bends filleted R / R + T) read back, Insert
  // Bends, the analytic blank, laser DXF, a flat drawing with its Bend Table and Autodimension's ordinates; (b) a 14 ga
  // box with Butt Closed Corners (bend region closed, as the PropertyManager makes a new one), Circular Corner Reliefs and
  // a Welded Corner: closed, the analytic blank, the weld left out; its drawing's title block with Cut-List links
  // ($PRPSHEET:"Bounding Box Length" …) on the sheet, in the DXF and the PDF (they were empty there); (c) a square-to-
  // round Lofted-Bend with a hole and a Swept Flange channel with holes, their flat DXFs. Plus Autodimension on a flat
  // view near the border keeps its ordinates inside the border frame (it allowed 5 mm from the paper edge).
  // TODO rows carry two kernel findings for the head (the report, findings 3 and 4).
  (function () {
    group('rfKM: shop flow 2 (customer STEP → Insert Bends → flat drawing, box with Closed / Welded Corners and Cut-List title block, Lofted-Bend and Swept Flange flats)');
    var DW = Drawing, T14 = 0.0747, T16 = 0.0598, KF = 0.44, Q = Math.PI / 2;
    function rfKMthin(chain, D, radii, T) {
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
    function rfKMarea(fl) { return fl.loops.reduce(function (s, l, i) { return s + (i === 0 ? Math.abs(K.signedArea(l)) : -Math.abs(K.signedArea(l))); }, 0); }
    function rfKMsheet(doc, r) { return DW.compute(doc, r.mesh, r.model, { build: r.build }); }
    function rfKMview(sh, id) { return sh.views.filter(function (x) { return x.view.id === id; })[0]; }
    function rfKMtexts(sh) { return sh.prims.filter(function (p) { return p.k === 'text'; }).map(function (p) { return p.text; }); }

    // job a: the customer's U channel 3 x 1.5 x 6 (outside), R .0747 inside, two Ø.281 holes in the base, one through both legs
    var U = rfKMthin([[0, 1.5], [0, 0], [3, 0], [3, 1.5]], 6, { 1: T14, 2: T14 }, T14) +
      'p.sketch("Top").circle(1.5, -1.5, 0.1405).circle(1.5, -4.5, 0.1405).end().extrude(1, { cut: true, through: true, both: true });\n' +
      'p.sketch("Right", 4).circle(-3, 0.75, 0.1405).end().extrude(5, { cut: true, through: true, reverse: true });\n';
    var U_W = 2 * (1.5 - 2 * T14) + (3 - 4 * T14) + 2 * Q * (T14 + KF * T14);
    function rfKMchannel() {
      var src = build(U); noErrors(src);
      var imp = Exchange.importFile('customer-channel.step', Exchange.exportSTEP(src.model, src.build, { faceted: true }), { units: 'in' }), m = Exchange.newPartFromImport(imp);
      assert(!imp.stats.openEdges, 'read back closed');
      new K.Builder(m).insertBends([1.5, 0, 3], { kFactor: KF });
      var b = K.rebuild(m), mesh = K.meshFromBody(b.body);
      assert(!Object.keys(b.errors).length, 'Insert Bends: ' + JSON.stringify(b.errors));
      return { model: m, build: b, mesh: mesh };
    }

    test('rfKM: job a, a customer\'s 14 ga U channel STEP → Insert Bends (K .44): blank 6 x (legs + base less setbacks + 2 BA), DXF 4 holes + 2 bend lines; flat drawing: Bend Table A / B (90°, BD .130), Autodimension ordinates to every hole and bend line, nothing in the blocks', function () {
      var r = rfKMchannel(), fl = K.flatPattern(r.model, r.build, r.mesh);
      near(Math.max(fl.size[0], fl.size[1]), 6, 1e-9, 'length'); near(Math.min(fl.size[0], fl.size[1]), U_W, 1e-6, 'width');
      assert(fl.bends.length === 2 && fl.bends.every(function (b) { return Math.abs(b.R - T14) < 1e-9 && Math.abs(b.angle - 90) < 1e-9; }), 'two 90° bends of the part\'s own radius');
      var c = DxfCheck.check(K.exportDXFFlat(fl, 'in', { version: 'R2000' }), { units: 'in' });
      assert(c.ok && c.counts['CIRCLE@HOLES'] === 4 && c.counts['LINE@BEND'] === 2 && c.counts['LWPOLYLINE@OUTLINE'] === 1, 'DXF ' + JSON.stringify(c.counts) + ' ' + c.errors.join('; '));
      var doc = DW.newDrawing(r.model, { projection: 'third' });
      var fv = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, bendNotes: 'table', fit: true });
      var sh = rfKMsheet(doc, r), res = DW.flatAutodimension(doc, fv.id, rfKMview(sh, fv.id), sh, {});
      sh = rfKMsheet(doc, r);
      var bt = sh.annotations.filter(function (a) { return a.type === 'bendTable'; })[0];
      assert(bt && bt.info.rows.length === 2 && bt.info.rows.every(function (x) { return x[2] === '90°' && x[4] === '.130'; }), 'Bend Table ' + JSON.stringify(bt && bt.info.rows));
      var ords = [].concat.apply([], sh.dims.map(function (d) { return String(d.text).split(/,\s*/); }));
      assert(res.n >= 10, 'ordinates ' + res.n);
      ['.750', '1.435', '2.870', '4.305', '4.990', '5.740', '1.500', '3.000', '4.500', '6.000'].forEach(function (x) { assert(ords.indexOf(x) >= 0, x + ' in ' + ords.join(' ')); });
      var S = sh.size, b1 = 10 / 25.4, tbs = DW.tbRects(S, 'in');
      sh.prims.forEach(function (p) {
        if (p.dimIx == null || p.k !== 'text') return;
        var tr = DW.textRect(p);
        assert(tr.x0 >= b1 && tr.y0 >= b1 && tr.x1 <= S[0] - b1 && tr.y1 <= S[1] - b1, 'ordinate ' + p.text + ' inside the border');
        tbs.forEach(function (t) { assert(!(tr.x0 < t.x1 && t.x0 < tr.x1 && tr.y0 < t.y1 && t.y0 < tr.y1), 'ordinate ' + p.text + ' clear of the title block'); });
      });
      return 'blank ' + U_W.toFixed(4) + ' x 6, ' + ords.length + ' ordinate values';
    });

    test('rfKM: Autodimension on a flat view near the sheet\'s edge keeps every ordinate inside the border frame (10 mm), sliding the view or using the other side; it allowed 5 mm from the paper edge, across the border and the zone labels', function () {
      var r = rfKMchannel(), bad = [], tried = 0;
      // the view's size at 1:2 (placed in the middle), then placed with its box edge d in from the border on each side
      var d0 = DW.newDrawing(r.model, { projection: 'third' }), v0 = DW.addFlatView(d0, r.mesh, { model: r.model, build: r.build, bendNotes: 'none', scale: [1, 2] });
      var s0 = rfKMsheet(d0, r), w0 = rfKMview(s0, v0.id), S = s0.size, b1 = 10 / 25.4, hw = (w0.box.x1 - w0.box.x0) / 2, hh = (w0.box.y1 - w0.box.y0) / 2;
      var ox = v0.x - (w0.box.x0 + w0.box.x1) / 2, oy = v0.y - (w0.box.y0 + w0.box.y1) / 2, places = [];
      [0.03, 0.1, 0.2, 0.3, 0.45, 0.6].forEach(function (d) {
        places.push([S[0] / 2, S[1] - b1 - d - hh], [S[0] / 2, b1 + d + hh + 1.75], [b1 + d + hw, S[1] / 2], [S[0] - b1 - d - hw, S[1] / 2 + 1]);
      });
      places.forEach(function (pos) {
        var doc = DW.newDrawing(r.model, { projection: 'third' });
        var fv = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, bendNotes: 'none', x: pos[0] + ox, y: pos[1] + oy, scale: [1, 2] });
        var sh = rfKMsheet(doc, r), w = rfKMview(sh, fv.id);
        var blocked = DW.tbRects(S, 'in').some(function (t) { return w.box.x0 < t.x1 && t.x0 < w.box.x1 && w.box.y0 < t.y1 && t.y0 < w.box.y1; });
        if (blocked || w.box.x0 < b1 || w.box.y0 < b1 || w.box.x1 > S[0] - b1 || w.box.y1 > S[1] - b1) return;   // not a placement a user makes
        tried++;
        DW.flatAutodimension(doc, fv.id, w, sh, {});
        sh = rfKMsheet(doc, r);
        sh.prims.forEach(function (p) {
          if (p.dimIx == null) return;
          var bx = p.k === 'text' ? DW.textRect(p) : p.k === 'line' ? { x0: Math.min(p.a[0], p.b[0]), x1: Math.max(p.a[0], p.b[0]), y0: Math.min(p.a[1], p.b[1]), y1: Math.max(p.a[1], p.b[1]) } : null;
          if (bx && (bx.x0 < b1 - 1e-9 || bx.y0 < b1 - 1e-9 || bx.x1 > S[0] - b1 + 1e-9 || bx.y1 > S[1] - b1 + 1e-9)) bad.push(pos.map(function (x) { return x.toFixed(2); }).join(',') + ' ' + p.k + ' ' + (p.text || '') + ' ' + [bx.x0, bx.y0, bx.x1, bx.y1].map(function (x) { return x.toFixed(3); }).join(','));
        });
      });
      assert(tried >= 6, 'placements tried ' + tried);
      assert(!bad.length, bad.slice(0, 6).join(' | '));
      return tried + ' placements';
    });

    // job b: the 14 ga box, four Edge Flanges, Butt Closed Corners (front pair coplanar, the two back corners), bend
    // region closed, Circular Corner Reliefs at the four corners, a Welded Corner at the front-left
    var RB = 0.075, BD = 2 * (RB + T14) - Q * (RB + KF * T14), G2 = 0.01 / Math.SQRT2;
    var BOX = 'p.name("Box-14GA").units("in");\np.material("Plain Carbon Steel");\np.sheet(' + T14 + ', ' + RB + ', ' + KF + ');\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\n' +
      [[5, T14, 0], [10, T14, 3], [5, T14, 6], [0, T14, 3]].map(function (e) { return 'p.flange(2, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer" });\n'; }).join('') +
      'p.closedCorner(' + JSON.stringify([[T14 / 2, 1.8, RB + T14], [10 - RB - T14, 1.8, 6 - T14 / 2], [T14 / 2, 1.8, 6 - RB - T14]]) + ', { cornerType: "butt", gap: 0.01, closeBend: true });\n';
    var RELIEF = 'p.cornerRelief([[0.1497, 0.0747, 0.1497], [9.8503, 0.0747, 0.1497], [9.8503, 0.0747, 5.8503], [0.1497, 0.0747, 5.8503]], null, { reliefType: "circular" });\n';
    var WELD = 'p.weldedCorner([[' + T14 / 2 + ', 1.2, ' + (T14 + G2) + ']]);\n';

    test('rfKM: job b, 14 ga box 10 x 6 x 2 with Butt Closed Corners (bend region closed), Circular Corner Reliefs and a Welded Corner: closed; blank (10 + 2 (2 − BD)) x (6 + 2 (2 − BD)); the weld adds metal and is not in the flat; laser DXF reads back', function () {
      var a = build(BOX + RELIEF), r = build(BOX + RELIEF + WELD); noErrors(a); noErrors(r);
      var ev = Evaluate.checkBody(r.build.body);
      assert(!ev.openEdges.length && !ev.nonManifoldEdges.length, 'closed: ' + ev.openEdges.length + ' open, ' + ev.nonManifoldEdges.length + ' non-manifold');
      assert(r.mp.volume > a.mp.volume + 1e-4, 'weld metal');
      var fa = K.flatPattern(a.model, a.build, a.mesh), fl = K.flatPattern(r.model, r.build, r.mesh);
      near(fl.size[0], 10 + 2 * (2 - BD), 1e-9, 'width'); near(fl.size[1], 6 + 2 * (2 - BD), 1e-9, 'depth');
      near(rfKMarea(fl), rfKMarea(fa), 1e-12, 'the weld is left out of the flat');
      var c = DxfCheck.check(K.exportDXFFlat(fl, 'in', { version: 'R2000' }), { units: 'in' });
      assert(c.ok && c.counts['LINE@BEND'] === 4, 'DXF ' + JSON.stringify(c.counts) + ' ' + c.errors.join('; '));
      return 'blank ' + fl.size.map(function (x) { return x.toFixed(4); }).join(' x ');
    });

    test('rfKM: job b drawing: a title block field with Cut-List links ($PRPSHEET:"Bounding Box Length" X $PRPSHEET:"Bounding Box Width") reads the blank on the sheet, in the DXF and in the PDF (it was empty there: the sheet had no mesh to work the cut list from)', function () {
      var r = build(BOX); noErrors(r);
      var fl = K.flatPattern(r.model, r.build, r.mesh), want = 'BLANK ' + fl.size[0].toFixed(4) + ' X ' + fl.size[1].toFixed(4);
      var doc = DW.newDrawing(r.model, { projection: 'third' });
      DW.standard3View(doc, r.mesh, 'in');
      doc.titleBlock = { finish: 'BLANK $PRPSHEET:"Bounding Box Length" X $PRPSHEET:"Bounding Box Width"', thickness: '$PRPSHEET:"Sheet Metal Thickness" ($PRPSHEET:"Bends" BENDS)' };
      var sh = rfKMsheet(doc, r), tx = rfKMtexts(sh);
      assert(tx.indexOf(want) >= 0, 'on the sheet: ' + tx.filter(function (t) { return /BLANK/.test(t); }).join(' | '));
      assert(tx.indexOf('.0747 (4 BENDS)') >= 0, 'thickness with the bend count: ' + tx.filter(function (t) { return /BENDS/.test(t); }).join(' | '));
      assert(DW.toDXF(sh, { version: 'R2000', hatch: true }).indexOf(want) >= 0, 'in the DXF');
      assert(DW.toPDF(sh).indexOf(want) >= 0, 'in the PDF');
      var sh2 = DW.compute(doc, r.mesh, r.model, { build: r.build, mesh: r.mesh });
      assert(rfKMtexts(sh2).indexOf(want) >= 0, 'a context with the mesh reads the same');
      return want;
    });

    test('rfKM: Closed Corner (bend region closed) + Circular Corner Relief: no sliver loops in the flat (there were two, about .008 x .013 in, where one wall\'s end was picked: lane smfix, kernel/rfKP.js)', function () {
      var r = build(BOX + RELIEF); noErrors(r);
      var fl = K.flatPattern(r.model, r.build, r.mesh);
      assert(fl.loops.length === 1, 'loops ' + fl.loops.length + ': ' + fl.loops.slice(1).map(function (l) { return Math.abs(K.signedArea(l)).toExponential(2) + ' in²'; }).join(', '));
      return 'one loop, ' + fl.loops[0].length + ' points';
    });

    // job c: the transition (Lofted-Bend, square 6 x 6 to round Ø4, 4 tall, 14 ga) and the Swept Flange channel
    var LOFT = 'p.name("Transition").units("in");\np.sheet(' + T14 + ', ' + T14 + ', 0.5);\n' +
      'var a = p.sketch("Top").polyline([[0, -3], [3, -3], [3, 3], [-3, 3], [-3, -3], [-0.001, -3]], false).id();\n' +
      'var b = p.sketch("Top", 4).arc(0, 0, 2, 270.03, 360).arc(0, 0, 2, 0, 90).arc(0, 0, 2, 90, 180).arc(0, 0, 2, 180, 270).id();\np.loftedBend([a, b]);\n';
    var SWEPT = 'p.name("Swept-Channel").units("in");\np.sheet(' + T16 + ', 0.06, ' + KF + ');\nvar path = p.sketch("Top").line(0, 0, 0, -10).id();\n' +
      'var prof = p.sketch("Front").polyline([[0, 1], [0, 0], [2, 0], [2, 1]], false).id();\np.sweptFlange(prof, path);\n' +
      'p.sketch("Top", 0).circle(1, -2, 0.1405).circle(1, -8, 0.1405).end().extrude(1, { cut: true, through: true, both: true });\n';

    test('rfKM: job c, square-to-round Lofted-Bend with a Ø.5 hole in a side facet (one HOLES loop, its developed area × T = the metal removed) and a 16 ga Swept Flange channel with two Ø.281 holes (blank inside flats less R + 2 BA, two CIRCLEs): flat DXFs read back', function () {
      var t0 = build(LOFT), t = build(LOFT + 'p.sketch("Right").circle(0, 1, 0.25).end().extrude(4, { cut: true });\n'); noErrors(t);
      var f0 = K.flatPattern(t0.model, t0.build, t0.mesh), ft = K.flatPattern(t.model, t.build, t.mesh);
      assert(ft.loops.length === 2 && !ft.warnings.length, 'one hole loop: ' + ft.loops.length + ' ' + ft.warnings.join('; '));
      nearRel((rfKMarea(f0) - rfKMarea(ft)) * T14, t0.mp.volume - t.mp.volume, 0.02, 'hole area × T ≈ the metal cut (facet slice)');
      var c = DxfCheck.check(K.exportDXFFlat(ft, 'in', { version: 'R2000' }), { units: 'in' });
      assert(c.ok && c.counts['LWPOLYLINE@HOLES'] === 1 && c.counts['LINE@BEND'] === ft.bends.length, 'transition DXF ' + JSON.stringify(c.counts));
      var s = build(SWEPT); noErrors(s);
      var fs = K.flatPattern(s.model, s.build, s.mesh), want = 2 * (1 - 0.06) + (2 - 2 * 0.06) + 2 * Q * (0.06 + KF * T16);
      near(Math.min(fs.size[0], fs.size[1]), want, 1e-9, 'channel blank (the sketch is the inside face)'); near(Math.max(fs.size[0], fs.size[1]), 10, 1e-9, 'length');
      c = DxfCheck.check(K.exportDXFFlat(fs, 'in', { version: 'R2000' }), { units: 'in' });
      assert(c.ok && c.counts['CIRCLE@HOLES'] === 2 && c.counts['LINE@BEND'] === 2, 'channel DXF ' + JSON.stringify(c.counts));
      return 'transition ' + ft.size.map(function (x) { return x.toFixed(3); }).join(' x ') + ', channel ' + want.toFixed(4) + ' x 10';
    });

    test('rfKM: a hole through the Lofted-Bend\'s seam (Front sketch Ø.5 at x 0, cut toward +Z) reaches the flat as a notch on each seam edge, area × T = the metal cut (1 %), no warning (it was missing: lane smfix, kernel/rfKP.js)', function () {
      var t0 = build(LOFT), t = build(LOFT + 'p.sketch("Front").circle(0, 1, 0.25).end().extrude(4, { cut: true });\n'); noErrors(t);
      var f0 = K.flatPattern(t0.model, t0.build, t0.mesh), ft = K.flatPattern(t.model, t.build, t.mesh);
      var cut = t0.mp.volume - t.mp.volume, lost = (rfKMarea(f0) - rfKMarea(ft)) * T14;
      assert(ft.loops.length === 1 && !ft.warnings.length, ft.loops.length + ' loop(s) ' + ft.warnings.join('; '));
      nearRel(lost, cut, 0.01, 'flat vs part');
      return 'part loses ' + cut.toFixed(5) + ' in³, flat ' + lost.toFixed(5) + ' in³';
    });
  })();
