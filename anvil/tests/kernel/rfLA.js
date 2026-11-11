  // --- rfLA (2026-11-11, lane drawflow3, test-reports/2026-11-11-drawing-flow.md *Round 2*) --- a drawing that follows
  // its model: a note's leader put on an edge or a hole follows that geometry when the part changes (gauge) and is
  // dangling when the geometry is gone (a deleted hole), as Smart Dimensions and callouts already were; the same after
  // the .drawing file is saved and read back. Self-contained.
  (function () {
    group('rfLA: drawing flow 3 (a drawing that follows its model)');
    var DW = Drawing;
    var RFLA_HEAD = 'p.name("Bracket").units("in");\np.material("Plain Carbon Steel");\np.property("Part Number", "BR-100");\n';
    function rfLACode(o) {
      o = Object.assign({ t: 0.0598, fl: 1.5, d1: 0.281, hole2: true }, o || {});
      return RFLA_HEAD + 'p.sheet(' + o.t + ', 0.06, 0.71);\np.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\n' +
        'p.flange(' + o.fl + ', [[0, ' + o.t + ', 1.5]]);\np.flange(2, [[6, ' + o.t + ', 1.5]], { angle: 120 });\n' +
        'p.hole("Top", 1.5, -0.75, ' + o.d1 + ', { offset: ' + o.t + ' });\n' + (o.hole2 ? 'p.hole("Top", 4.5, -0.75, 0.281, { offset: ' + o.t + ' });\n' : '') +
        'p.hole("Top", 3, -1.5, 0.5, { offset: ' + o.t + ' });\n';
    }
    function rfLADoc() {
      var r = build(rfLACode());
      noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-11', autoDims: false });
      DW.standard3View(doc, r.mesh, r.model.units);
      r.doc = doc;
      r.T = doc.views.filter(function (v) { return v.orient === 'Top'; })[0];
      r.sheet = function (b) { b = b || r; return DW.compute(doc, b.mesh, b.model, { build: b.build }); };
      return r;
    }
    function rfLANote(sh, text) { return sh.notes.filter(function (n) { return n.text === text; })[0]; }

    test('rfLA: a note whose leader is on the Top view\'s right edge follows the edge when the gauge changes (the text stays); a note on a hole dangles (dangling colour) when the hole is deleted and comes back with it; a moved leader is found again on the geometry under it; saved and read back the same', function () {
      var r = rfLADoc(), T = r.T, sh = r.sheet(), w = sh.views.filter(function (x) { return x.view.id === T.id; })[0];
      var tip = w.toSheet([6.1198, -1.5]), t2 = w.toSheet([4.5, -0.75 + 0.1405]);
      var nE = DW.addNote(r.doc, { p: [tip[0] + 0.6, tip[1] + 0.4], text: 'BREAK EDGE', leader: tip });
      var nH = DW.addNote(r.doc, { p: [t2[0] + 0.4, t2[1] + 0.8], text: 'DEBURR HOLE', leader: t2 });
      var nP = DW.addNote(r.doc, { p: [tip[0] + 0.6, tip[1] - 0.4], text: 'ON PAPER', leader: [tip[0] + 0.3, tip[1] - 0.2] });   // on the view, not on its geometry
      DW.addSmartDim(r.doc, T.id, { center: { c: [1.5, -0.75], r: 0.1405 } }, { center: { c: [4.5, -0.75], r: 0.1405 } }, [3, 0.8]);
      sh = r.sheet();
      assert(nE.view === T.id && nE.anchor && nE.anchor.ref.kind === 'v' && nH.anchor && nH.anchor.ref.kind === 'dia' && !nP.anchor, 'anchors: ' + JSON.stringify([nE.anchor, nH.anchor, nP.anchor]));
      var l0 = nE.leader.slice(), p0 = nE.p.slice();
      assert(l0[0] === tip[0] && l0[1] === tip[1], 'nothing moves while the part is the same');
      // 14 ga: the right edge goes out by .0149
      var g14 = build(rfLACode({ t: 0.0747 })); noErrors(g14);
      sh = r.sheet(g14);
      near(nE.leader[0] - l0[0], (0.0747 - 0.0598) * w.scale, 1e-9, 'the arrow follows the edge (6 + R .06 + T)');
      near(nE.leader[1], l0[1], 1e-12, 'along the edge it stays');
      assert(nE.p[0] === p0[0] && nE.p[1] === p0[1] && !rfLANote(sh, 'BREAK EDGE').dangling, 'the text stays');
      // hole 2 deleted: the dimension and the note on it dangle, drawn in the dangling colour
      var nh = build(rfLACode({ hole2: false })); noErrors(nh);
      sh = r.sheet(nh);
      var dh = rfLANote(sh, 'DEBURR HOLE');
      assert(dh.dangling && nH.dangling && !rfLANote(sh, 'BREAK EDGE').dangling && sh.dims[0].dangling, 'dangling: ' + JSON.stringify([dh.dangling, sh.dims[0].dangling]));
      assert(sh.prims.filter(function (p) { return p.layer === 'NOTES' && p.color === 'dangling'; }).length >= 2, 'drawn in the dangling colour');
      assert(DW.toDXF(sh).indexOf('DEBURR HOLE') > 0, 'still on the sheet (never dropped)');
      // saved and read back while dangling, then the hole is back
      var back = DW.readDrawingFile(JSON.stringify(DW.drawingFile(r.doc, nh.model, 'Bracket'))).drawing;
      var sb = DW.compute(back, nh.mesh, nh.model, { build: nh.build });
      assert(rfLANote(sb, 'DEBURR HOLE').dangling && sb.dims[0].dangling, 'read back: still dangling');
      sb = DW.compute(back, r.mesh, r.model, { build: r.build });
      var nH2 = back.notes.filter(function (n) { return n.text === 'DEBURR HOLE'; })[0];
      assert(!rfLANote(sb, 'DEBURR HOLE').dangling && !sb.dims[0].dangling && Math.abs(nH2.leader[0] - t2[0]) < 1e-9, 'the hole back: attached again where it was');
      sh = r.sheet();
      assert(!nH.dangling && Math.abs(nE.leader[0] - l0[0]) < 1e-9, 'the original part: back to the start');
      // the arrow dragged onto the Ø.500: anchored there now
      var t3 = w.toSheet([3, -1.5 + 0.25]);
      DW.editNote(r.doc, nH.id, { leader: t3 });
      sh = r.sheet();
      assert(nH.anchor && nH.anchor.ref.kind === 'dia' && Math.abs(nH.anchor.ref.r - 0.25) < 1e-9, 're-anchored on the Ø.500');
      sh = r.sheet(nh);
      assert(!nH.dangling, 'hole 2 deleted: no longer its concern');
      return 'moved ' + fmt(nE.leader[0] - l0[0]);
    });

    test('rfLA: a flange added on the edge a Smart Dimension measures to keeps the dimension on that edge\'s line (.750 from the hole), not on the new bend\'s inner face (.810); the flat view\'s Bend Table gets the new bend', function () {
      var r = rfLADoc(), T = r.T;
      var fv = DW.addFlatView(r.doc, r.mesh, { model: r.model, build: r.build, x: 300, y: 70, bendNotes: 'table' });
      DW.addSmartDim(r.doc, T.id, { center: { c: [1.5, -0.75], r: 0.1405 } }, { edge: [[-0.1198, 0], [6.1198, 0]] }, [0.6, 0.45]);
      var sh = r.sheet();
      function dm(s) { return s.dims.filter(function (d) { return d.view === T.id; })[0]; }
      function bt(s) { return (s.annotations || []).filter(function (a) { return a.type === 'bendTable' && a.view === fv.id; })[0]; }
      assert(dm(sh).text === '.750' && /\(2\)/.test(bt(sh).text), 'before: ' + dm(sh).text + ' ' + (bt(sh) && bt(sh).text));
      var nf = build(rfLACode() + 'p.flange(1, [[3, 0.0598, 0]]);\n'); noErrors(nf);
      sh = r.sheet(nf);
      var w = sh.views.filter(function (x) { return x.view.id === T.id; })[0];
      assert(w.proj.all.some(function (l) { return Math.abs(l[1] - 0.06) < 1e-9 && Math.abs(l[3] - 0.06) < 1e-9; }), 'the bend\'s inner face is drawn 0.06 off the old edge');
      assert(dm(sh).text === '.750' && !dm(sh).dangling, 'the dimension stays on the edge\'s line: ' + dm(sh).text);
      assert(/\(3\)/.test(bt(sh).text), 'the Bend Table lists three bends: ' + bt(sh).text);
      return dm(sh).text + ', ' + bt(sh).text;
    });

    test('rfLA: Rotate View — a 60 in channel\'s Top view turned 90° / 180° / back: its box swaps, the 60.000 (h → v), the Ø.500, the centre-to-edge 2.000 and the callout stay on their geometry, the break turns with it; another angle is refused while it holds dimensions; an empty Isometric turns 30°', function () {
      var r = build('p.name("Channel60").units("in");\np.sheet(0.0747, 0.06, 0.44);\np.sketch("Top").rect(0, -3, 60, 3).end().baseFlange();\np.flange(1.5, [[30, 0.0747, 0]]);\np.flange(1.5, [[30, 0.0747, 3]]);\np.hole("Top", 2, -1.5, 0.5, { offset: 0.0747 });\np.hole("Top", 58, -1.5, 0.5, { offset: 0.0747 });');
      noErrors(r);
      var doc = DW.newDrawing(r.model, { autoDims: false });
      DW.standard3View(doc, r.mesh, r.model.units);
      var T = doc.views.filter(function (v) { return v.orient === 'Top'; })[0], I = doc.views.filter(function (v) { return v.orient === 'Isometric'; })[0];
      DW.addSmartDim(doc, T.id, { edge: [[0, -3], [0, 0]] }, { edge: [[60, -3], [60, 0]] }, [30, 1]);
      DW.addSmartDim(doc, T.id, { circle: { c: [2, -1.5], r: 0.25 } }, null, [4, -4]);
      DW.addSmartDim(doc, T.id, { center: { c: [2, -1.5], r: 0.25 } }, { edge: [[0, -3], [0, 0]] }, [1, -5]);
      DW.addHoleCallout(doc, T.id, { c: [58, -1.5], r: 0.25 });
      DW.addBreak(doc, T.id, { dir: 'vertical', a: 8, b: 52 });
      function rep() {
        var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), w = sh.views.filter(function (x) { return x.view.id === T.id; })[0];
        return { w: w.box.x1 - w.box.x0, h: w.box.y1 - w.box.y0, t: sh.dims.filter(function (d) { return d.view === T.id; }).map(function (d) { return d.kind + ':' + d.text + (d.dangling ? '?' : ''); }).join(' | '),
          c: sh.annotations.filter(function (a) { return a.view === T.id && a.type === 'holeCallout'; }).map(function (a) { return a.text + (a.dangling ? '?' : ''); }).join() };
      }
      var a = rep();
      assert(a.t === 'h:60.000 | dia:Ø.500 | h:2.000' && a.c === '2X Ø.500 THRU ALL' && a.w > a.h * 3, 'before: ' + JSON.stringify(a));
      DW.setViewRotation(doc, T.id, 90);
      var b = rep();
      near(b.w, a.h, 1e-9, 'width <- height'); near(b.h, a.w, 1e-9, 'height <- width (the break kept)');
      assert(b.t === 'v:60.000 | dia:Ø.500 | v:2.000' && b.c === a.c && T.breaks[0].dir === 'horizontal' && T.align == null, '90°: ' + JSON.stringify(b));
      DW.setViewRotation(doc, T.id, 180);
      var c = rep();
      assert(c.t === a.t && c.c === a.c && Math.abs(c.w - a.w) < 1e-9, '180°: ' + JSON.stringify(c));
      DW.setViewRotation(doc, T.id, 0);
      var d = rep();
      assert(d.t === a.t && !T.rotate && Math.abs(d.w - a.w) < 1e-9 && T.breaks[0].a === 8 && T.breaks[0].b === 52, 'back: ' + JSON.stringify(d));
      var m = null; try { DW.setViewRotation(doc, T.id, 30); } catch (e) { m = e.message; }
      assert(m && /steps of 90/.test(m) && !T.rotate, 'refused: ' + m);
      DW.setViewRotation(doc, I.id, 30);
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      assert(I.rotate === 30 && sh.views.filter(function (x) { return x.view.id === I.id; })[0].proj.lines.visible.length > 0, 'the Isometric at 30°');
      return b.t;
    });

    test('rfLA: note text the PDF / DXF fonts lack is written as a shop types it — GRAIN →, 1½, – “ ” • ≤ (was ?), Latin-1 letters kept in the PDF (WinAnsi), Ø ± ° as before', function () {
      var r = rfLADoc();
      DW.addNote(r.doc, { p: [1, 1.5], text: 'GRAIN → 1½ – “A” • ≤.010 Ø.281 ±.005 90° café', view: 0 });
      var sh = r.sheet(), pdf = DW.toPDF(sh), dxf = DW.toDXF(sh);
      assert(pdf.indexOf('(GRAIN -> 1 1/2 - "A" * <=.010 \\330.281 \\261.005 90\\260 caf\\351)') > 0, 'PDF: ' + (/\(GRAIN[^)]*\)/.exec(pdf) || [''])[0]);
      assert(dxf.indexOf('GRAIN -> 1 1/2 - "A" * <=.010 %%c.281 %%p.005 90%%d caf?') > 0, 'DXF: ' + (/GRAIN[^\n]*/.exec(dxf) || [''])[0]);
      return 'ok';
    });
  })();
  // --- end rfLA ---
