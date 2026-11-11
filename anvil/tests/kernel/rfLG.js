  // --- rfLG (2026-11-11, lane drawflow4, test-reports/2026-11-11-drawing-flow.md *Round 4*) --- Make Drawing from
  // Part's layout (Drawing.partViews: a plate's face and edge views; Front / Top / Right, the isometric when it fits, a
  // sheet-metal part's flat pattern) and Rotate View at any angle with the view's dimensions, centre marks and notes
  // turning with it. Self-contained.
  (function () {
    group('rfLG: drawing flow 4 (Make Drawing from Part layout, Rotate View at any angle)');
    var DW = Drawing;
    var RFLG_HEAD = 'p.name("Bracket").units("in");\np.material("Plain Carbon Steel");\np.property("Part Number", "BR-100");\n';
    function rfLGBracket(o) {
      o = Object.assign({ t: 0.0598, w: 6, d: 3, f: 1.5, holes: true }, o || {});
      return RFLG_HEAD + 'p.sheet(' + o.t + ', 0.06, 0.71);\np.sketch("Top").rect(0, -' + o.d + ', ' + o.w + ', ' + o.d + ').end().baseFlange();\n' +
        'p.flange(' + o.f + ', [[0, ' + o.t + ', ' + o.d / 2 + ']]);\np.flange(' + (o.f + 0.5) + ', [[' + o.w + ', ' + o.t + ', ' + o.d / 2 + ']], { angle: 120 });\n' +
        (o.holes ? 'p.hole("Top", 1.5, -0.75, 0.281, { offset: ' + o.t + ' });\np.hole("Top", 3, -1.5, 0.5, { offset: ' + o.t + ' });\n' : '');
    }
    function rfLGDoc(code, fn) {
      var r = build(code);
      noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-11', autoDims: false });
      if (fn) fn(doc, r); else DW.partViews(doc, r.mesh, r.model.units, { model: r.model, build: r.build });
      r.doc = doc;
      r.sheet = function (b) { b = b || r; return DW.compute(doc, b.mesh, b.model, { build: b.build }); };
      return r;
    }
    function rfLGOrients(doc) { return doc.views.map(function (v) { return v.kind === 'flat' ? 'Flat' : v.orient; }).join(','); }
    function rfLGApart(sh) {
      var b = sh.views.map(function (w) { return { id: w.view.id, b: w.box }; });
      for (var i = 0; i < b.length; i++) for (var j = i + 1; j < b.length; j++) {
        var p = b[i].b, q = b[j].b;
        if (p.x1 > q.x0 && q.x1 > p.x0 && p.y1 > q.y0 && q.y1 > p.y0) return 'views ' + b[i].id + ' and ' + b[j].id + ' overlap';
      }
      return null;
    }

    test('rfLG: Make Drawing from Part on a flat plate: the face view and one edge view, no isometric, the largest standard scale with room for the dimensions; plates on the Top, Front and Right planes', function () {
      // a 16 ga blank on the Top plane (sheet metal, no bends)
      var a = rfLGDoc(RFLG_HEAD + 'p.sheet(0.0598, 0.06, 0.71);\np.sketch("Top").rect(0, -4, 10, 4).end().baseFlange();\np.hole("Top", 2, -2, 0.5, { offset: 0.0598 });\n');
      assert(rfLGOrients(a.doc) === 'Front,Top', 'Top-plane plate: ' + rfLGOrients(a.doc));
      assert(DW.plateOf(a.mesh).axis === 1, 'thin along Y');
      var sa = a.sheet();
      assert(!rfLGApart(sa), rfLGApart(sa));
      assert(DW.scaleText(a.doc.sheet.scale) === '1:1', 'scale ' + DW.scaleText(a.doc.sheet.scale));
      // a plate in the Front plane, wider than tall: Front + Top
      var b = rfLGDoc('p.units("in");\np.sketch("Front").rect(0, 0, 12, 5).end().extrude(0.25);\n');
      assert(rfLGOrients(b.doc) === 'Front,Top', 'Front-plane plate: ' + rfLGOrients(b.doc));
      // taller than wide: Front + Right
      var c = rfLGDoc('p.units("in");\np.sketch("Front").rect(0, 0, 4, 9).end().extrude(0.25);\n');
      assert(rfLGOrients(c.doc) === 'Front,Right', 'tall plate: ' + rfLGOrients(c.doc));
      // a Right-plane plate: Right is the face, Front its edge
      var d = rfLGDoc('p.units("in");\np.sketch("Right").rect(0, 0, 8, 5).end().extrude(0.375);\n');
      assert(rfLGOrients(d.doc) === 'Front,Right', 'Right-plane plate: ' + rfLGOrients(d.doc));
      // the scale: a 30 x 20 plate on ANSI B goes below 1:1, its pair centred and apart
      var e = rfLGDoc('p.units("in");\np.sketch("Front").rect(0, 0, 30, 20).end().extrude(0.25);\n'), se = e.sheet();
      assert(DW.scaleValue(e.doc.sheet.scale) < 1, 'big plate scale ' + DW.scaleText(e.doc.sheet.scale));
      assert(!rfLGApart(se), rfLGApart(se));
      // with Standard 3 View the same plate needed the Right view's column too: never larger than the pair's scale
      var e3 = rfLGDoc('p.units("in");\np.sketch("Front").rect(0, 0, 30, 20).end().extrude(0.25);\n', function (doc, r) { DW.standard3View(doc, r.mesh, 'in'); });
      assert(DW.scaleValue(e3.doc.sheet.scale) <= DW.scaleValue(e.doc.sheet.scale), 'the pair is never smaller');
      // a block with a step is not a plate
      var f = rfLGDoc('p.units("in");\np.sketch("Front").rect(0, 0, 4, 2).end().extrude(1);\np.sketch("Front").rect(0, 0, 2, 2).end().extrude(0.5, { offset: 1 });\n');
      assert(!DW.plateOf(f.mesh) && rfLGOrients(f.doc).indexOf('Front,Top,Right') === 0, 'block: ' + rfLGOrients(f.doc));
      return [a, b, c, d, e].map(function (x) { return rfLGOrients(x.doc) + ' ' + DW.scaleText(x.doc.sheet.scale); }).join('; ');
    });
    test('rfLG: Make Drawing from Part on a bent bracket: Front / Top / Right, the isometric in the upper right, the flat pattern with bend lines and notes on Sheet1 when it has room, else on Sheet2; Sheet1 stays active; the API\'s standard3View is unchanged', function () {
      // a 10 x 1 channel-like bracket: the flat has room on Sheet1 (the isometric does not fit at half scale: left off)
      var r = rfLGDoc(rfLGBracket({ w: 10, d: 1, f: 0.5, holes: false })), sh = r.sheet();
      assert(rfLGOrients(r.doc) === 'Front,Top,Right,Flat', 'views: ' + rfLGOrients(r.doc));
      assert(!r.doc.sheets && DW.scaleText(r.doc.sheet.scale) === '1:1', 'one sheet at 1:1');
      assert(!rfLGApart(sh), rfLGApart(sh));
      var fw = sh.views.filter(function (w) { return w.view.kind === 'flat'; })[0];
      assert(fw && !fw.view.scale, 'the flat at the sheet scale');
      assert(sh.prims.some(function (p) { return p.k === 'text' && /UP|DOWN/.test(p.text); }), 'bend notes on the flat');
      // the 6 x 3 bracket with holes: the isometric in the upper right at 1:1, the flat (9.6 in long) on Sheet2
      var m = rfLGDoc(rfLGBracket()), sm = m.sheet();
      assert(rfLGOrients(m.doc) === 'Front,Top,Right,Isometric', 'Sheet1: ' + rfLGOrients(m.doc));
      assert(m.doc.sheets && m.doc.sheets.length === 2 && (m.doc.activeSheet | 0) === 0, 'Sheet2 made, Sheet1 active');
      assert(!rfLGApart(sm), rfLGApart(sm));
      var iso = m.doc.views.filter(function (v) { return v.orient === 'Isometric'; })[0], fr = m.doc.views[0];
      assert(iso.x > fr.x && iso.y > fr.y && (!iso.scale || DW.scaleValue(iso.scale) >= DW.scaleValue(m.doc.sheet.scale) / 2), 'the isometric is upper right, half scale or more');
      DW.activateSheet(m.doc, 1);
      var s2 = m.sheet();
      assert(rfLGOrients(m.doc) === 'Flat' && !m.doc.views[0].scale && DW.scaleText(m.doc.sheet.scale) === '1:1', 'Sheet2 holds the flat at 1:1: ' + rfLGOrients(m.doc));
      assert(s2.prims.some(function (p) { return p.k === 'text' && /UP|DOWN/.test(p.text); }), 'bend notes on Sheet2');
      DW.activateSheet(m.doc, 0);
      // the script's Standard 3 View keeps its four views and its scale
      var s3 = rfLGDoc(rfLGBracket(), function (doc, b) { DW.standard3View(doc, b.mesh, 'in'); });
      assert(rfLGOrients(s3.doc) === 'Front,Top,Right,Isometric' && !s3.doc.sheets, 'standard3View: ' + rfLGOrients(s3.doc));
      return '10 x 1: ' + rfLGOrients(r.doc) + ' ' + DW.scaleText(r.doc.sheet.scale) + '; 6 x 3: ' + rfLGOrients(m.doc) + ' ' + DW.scaleText(m.doc.sheet.scale) + ' + Sheet2 flat';
    });
    test('rfLG: Rotate View 30° on a dimensioned Top view: the horizontal / vertical dimensions, the ordinate set, the Ø, the centre mark and a note on an edge turn with the geometry, values unchanged, texts horizontal; DXF DIMENSION at 30°; the gauge change followed; back to 0° the same as before; 90° makes them plain h / v again', function () {
      var r = rfLGDoc(rfLGBracket(), function (doc, b) { DW.standard3View(doc, b.mesh, 'in', { autoInsert: false }); }), doc = r.doc;
      doc.autoDims = false;
      var T = doc.views.filter(function (v) { return v.orient === 'Top'; })[0];
      var c1 = { c: [1.5, -0.75], r: 0.1405 }, c2 = { c: [3, -1.5], r: 0.25 };
      DW.addSmartDim(doc, T.id, { center: c1 }, { center: c2 }, [2.25, 0.6]);       // h 1.500
      DW.addSmartDim(doc, T.id, { center: c1 }, { center: c2 }, [4.2, -1.1]);       // v .750
      DW.addSmartDim(doc, T.id, { circle: c2 }, null, [4, -3]);                      // Ø.500
      DW.addOrdinate(doc, T.id, { dir: 'h', base: c1, refs: [c2] });
      DW.addCenterMark(doc, T.id, { holes: [c2] });
      var sh = r.sheet(), w = sh.views.filter(function (x) { return x.view.id === T.id; })[0];
      var tip = w.toSheet([6.1198, -1.5]);
      var nE = DW.addNote(doc, { p: [tip[0] + 0.6, tip[1] + 0.4], text: 'BREAK EDGE', leader: tip });
      function rep(b) {
        var s2 = r.sheet(b), w2 = s2.views.filter(function (x) { return x.view.id === T.id; })[0];
        return { s: s2, w: w2, t: s2.dims.filter(function (d) { return d.view === T.id; }).map(function (d) { return d.kind + ':' + d.text + (d.dangling ? '?' : ''); }).join(' | ') };
      }
      var a = rep(), dims0 = JSON.stringify(T.dims.map(function (d) { return [d.kind, d.at, d.side, d.dir]; }));
      assert(a.t === 'h:1.500 | v:.750 | dia:Ø.500 | ordinate:' + a.s.dims[3].text, 'before: ' + a.t);
      DW.setViewRotation(doc, T.id, 30);
      var b = rep();
      assert(T.rotate === 30 && T.dims[0].kind === 'h' && T.dims[0].rot === 30 && T.dims[3].rot === 30 && T.annotations[0].rot === 30, 'turned: ' + JSON.stringify(T.dims.map(function (d) { return [d.kind, d.rot]; })));
      assert(b.t === a.t, 'values unchanged at 30°: ' + b.t);
      // the 1.500's dimension line runs at 30° and its extension lines start at the two centres (turned on the paper)
      var d0 = b.s.dims.filter(function (d) { return d.view === T.id; })[0];
      near(d0.dxf.ang, 30, 1e-9, 'DXF angle');
      var P1 = b.w.toSheet(T.dims[0].a), P2 = b.w.toSheet(T.dims[0].b);
      near(Math.hypot(d0.dxf.p13[0] - P1[0], d0.dxf.p13[1] - P1[1]), 0, 1e-9, 'first extension line origin on the centre');
      near(Math.hypot(d0.dxf.p14[0] - P2[0], d0.dxf.p14[1] - P2[1]), 0, 1e-9, 'second on the other centre');
      var dl = [d0.dxf.p11[0] - d0.dxf.p10[0], d0.dxf.p11[1] - d0.dxf.p10[1]];
      near(Math.abs(dl[0] * Math.sin(Math.PI / 6) - dl[1] * Math.cos(Math.PI / 6)), 0, 1e-9, 'the dimension line at 30°');
      var texts = b.s.prims.filter(function (p) { return p.k === 'text' && p.layer === 'DIMENSIONS' && /^(1\.500|\.750)$/.test(p.text); });
      assert(texts.filter(function (p) { return !p.rot; }).length === 2, 'the 1.500 and .750 horizontal (ANSI): ' + JSON.stringify(texts.map(function (p) { return p.text + '@' + p.rot; })));
      var ot = b.s.prims.filter(function (p) { return p.k === 'text' && p.layer === 'DIMENSIONS' && p.rot; });
      assert(ot.length >= 1 && ot.every(function (p) { return p.rot > -90 && p.rot <= 90; }), 'ordinate texts turned, upright: ' + JSON.stringify(ot.map(function (p) { return p.rot; })));
      // the centre mark's arms at 30°
      var cm = b.s.prims.filter(function (p) { return p.k === 'line' && p.layer === 'ANNOTATIONS'; });
      assert(cm.some(function (p) { var ang = Math.atan2(p.b[1] - p.a[1], p.b[0] - p.a[0]) * 180 / Math.PI; return Math.abs(((ang - 30) % 180 + 180) % 180) < 1e-6; }), 'a centre-mark arm at 30°');
      // the note's arrow on the turned edge, the text where it was
      var ePt = b.w.toSheet(nE.anchor.pt);
      near(Math.hypot(nE.leader[0] - ePt[0], nE.leader[1] - ePt[1]), 0, 1e-9, 'the arrow on the edge');
      assert(!nE.dangling, 'the note is attached');
      // DXF: the DIMENSION entity at 30 (group 50)
      var dxf = DW.toDXF(b.s, { version: 'R2000' }), rl = dxf.split(/\r?\n/), angs = [];
      for (var li = 0; li < rl.length; li++) if (rl[li].trim() === 'AcDbRotatedDimension' && rl[li - 3] && rl[li - 3].trim() === '50') angs.push(+rl[li - 2]);
      assert(angs.indexOf(30) >= 0, 'a DIMENSION at 30 deg in the DXF: ' + angs.join() + ' ' + (dxf.indexOf('AcDbRotatedDimension') > 0));
      assert(DW.toPDF(b.s).indexOf('(1.500)') > 0, 'PDF has the 1.500');
      // the part changes (14 ga): still attached, values the same (hole positions do not move)
      var g14 = build(rfLGBracket({ t: 0.0747 })); noErrors(g14);
      var c = rep(g14);
      assert(c.t === a.t, '14 ga at 30°: ' + c.t);
      // back to 0°: the same dimensions as before (kinds, at, side)
      DW.setViewRotation(doc, T.id, 0);
      var d = rep();
      assert(d.t === a.t && !T.rotate && T.dims.every(function (x) { return !x.rot; }) && !T.annotations[0].rot, 'back: ' + d.t);
      var dims1 = JSON.stringify(T.dims.map(function (x) { return [x.kind, x.at == null ? x.at : Math.round(x.at * 1e9) / 1e9, x.side, x.dir]; }));
      assert(dims1 === JSON.stringify(JSON.parse(dims0).map(function (q) { return [q[0], q[1] == null ? q[1] : Math.round(q[1] * 1e9) / 1e9, q[2], q[3]]; })), 'kinds / at / side back: ' + dims1 + ' vs ' + dims0);
      // 30° then 60° more = 90°: plain v / h again
      DW.setViewRotation(doc, T.id, 30); DW.setViewRotation(doc, T.id, 90);
      var e = rep();
      assert(T.dims[0].kind === 'v' && !T.dims[0].rot && T.dims[1].kind === 'h' && T.dims[3].dir === 'v' && !T.dims[3].rot, '90: ' + JSON.stringify(T.dims.map(function (x) { return [x.kind, x.dir, x.rot]; })));
      assert(e.t === 'v:1.500 | h:.750 | dia:Ø.500 | ordinate:' + a.s.dims[3].text, '90° values: ' + e.t);
      // a view with a break still turns in steps of 90°
      DW.setViewRotation(doc, T.id, 0);
      DW.addBreak(doc, T.id, { dir: 'vertical', a: 2, b: 4 });
      var m = null; try { DW.setViewRotation(doc, T.id, 30); } catch (x) { m = x.message; }
      assert(m && /steps of 90/.test(m), 'break: ' + m);
      return b.t;
    });
  })();
