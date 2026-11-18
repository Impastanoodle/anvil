  // --- rfPH (2026-11-17, lane drawgaps: the drawing tools a sheet-metal shop still missed, test-reports/2026-11-17-drawing-gaps.md):
  // Broken View on a flat-pattern view (a long blank) with what sits on it (bend notes / tags, ordinates, hole tags,
  // centre marks, Bend Table, Fixed Face, Hole Table), SolidWorks 2024's five break line styles ---
  (function () {
    group('rfPH: Broken View of a flat pattern (48 in blank at 1:4), what goes with the removed paper, five break line styles');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing, T = 0.0598;
    // a 48 x 6 blank (16 ga), Ø.281 holes at x 6, 18, 30, 42 (y 3), a Ø.25 at 24, 4.5; Sketched Bends across it at x 2 and 46
    var BLANK = 'p.name("PH blank").units("in");\np.sheet(' + T + ', 0.06, 0.44);\np.sketch("Top").rect(0, -6, 48, 6).end().baseFlange();\n' +
      'p.sketch("Top", ' + T + ').circle(6, -3, 0.1405).circle(18, -3, 0.1405).circle(30, -3, 0.1405).circle(42, -3, 0.1405).circle(24, -1.5, 0.125).cut("through", { reverse: true });\n' +
      'p.sketch("Top", ' + T + ').line(2, 0, 2, -6).line(46, 0, 46, -6).sketchedBend(90);\n';
    var part = null;
    function rfPHPart() { if (!part) { part = build(BLANK); noErrors(part); } return part; }
    // the shop's flat print: the flat at 1:4 centred at (8, 6) on ANSI B, Autodimension (ordinates), a Hole Table from
    // the lower-left corner, Auto centre marks, FLAT SIZE; mode 'table' puts the Bend Table and its tags on
    function rfPHSheet(mode) {
      var r = rfPHPart(), doc = DW.newDrawing(r.model, { date: '2026-11-17' });
      doc.sheet.scale = [1, 4];
      doc.options = Object.assign(doc.options || {}, { flatSizeNote: true });
      var v = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, x: 8, y: 6, scale: [1, 4] });
      var q = { doc: doc, view: v, r: r };
      q.compute = function () { q.sheet = DW.compute(doc, r.mesh, r.model, { build: r.build }); q.w = q.sheet.views.filter(function (x) { return x.view.id === v.id; })[0]; return q.sheet; };
      q.compute();
      DW.flatAutodimension(doc, v.id, q.w, q.sheet, {});
      q.compute();
      var bb = q.w.flat.bbox;
      DW.addHoleTable(doc, v.id, { all: true, origin: { p: [bb.umin, bb.vmin] } }, q.w);
      DW.autoCenterMarks(doc, r.mesh, v.id);
      if (mode === 'table') v.bendNotes = 'table';
      q.compute();
      return q;
    }
    function rfPHTexts(q, layer) { return q.sheet.prims.filter(function (p) { return p.k === 'text' && (!layer || p.layer === layer); }); }
    function rfPHText(q, s) { return rfPHTexts(q).filter(function (p) { return p.text === s; }); }
    function rfPHGap(q) { var b = q.w.breaks.vertical[0]; return { lo: b.olo, hi: b.ohi }; }
    function rfPHBox(prims) {
      var r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      prims.forEach(function (p) { [p.a, p.b, p.p].forEach(function (q) { if (q) { r.x0 = Math.min(r.x0, q[0]); r.x1 = Math.max(r.x1, q[0]); r.y0 = Math.min(r.y0, q[1]); r.y1 = Math.max(r.y1, q[1]); } }); });
      return r;
    }

    test('rfPH: a flat-pattern view breaks (it was refused): 48 in at 1:4 with a 28 in break and a .4 gap is 5.400 in wide on paper, centred where it was; the outline, bend lines and holes left of / right of the break close up', function () {
      var q = rfPHSheet('notes'), w0 = q.w.box, L = q.w.layer;
      near(w0.x1 - w0.x0, 12, 1e-9, 'unbroken width');
      DW.addBreak(q.doc, q.view.id, { dir: 'vertical', a: 10, b: 38 });
      assert(q.view.breaks.length === 1 && q.view.breaks[0].style === 'zigzag' && q.view.breaks[0].gap === 0.4, JSON.stringify(q.view.breaks));
      q.compute();
      var b = q.w.box, g = rfPHGap(q);
      near(b.x1 - b.x0, 12 - (28 / 4 - 0.4), 1e-9, 'broken width'); near((b.x0 + b.x1) / 2, 8, 1e-9, 'centre');
      near(g.hi - g.lo, 0.4, 1e-9, 'gap on paper');
      var lines = q.sheet.prims.filter(function (p) { return p.k === 'line' && p.layer === L && !p.breakLine; });
      assert(!lines.some(function (p) { return Math.min(p.a[0], p.b[0]) < g.hi - 1e-9 && Math.max(p.a[0], p.b[0]) > g.lo + 1e-9; }), 'no linework across the gap');
      var circ = q.sheet.prims.filter(function (p) { return p.k === 'circle' && p.layer === L; }).map(function (p) { return +p.c[0].toFixed(4); }).sort(function (x, y) { return x - y; });
      // u 6 -> 8 + (6 - 24) / 4 + 3.3 = 6.8; u 42 -> 8 + 18 / 4 - 3.3 = 9.2 (the two ends move in by half the removed 6.6)
      assert(JSON.stringify(circ) === JSON.stringify([6.8, 9.2]), 'holes left: ' + JSON.stringify(circ));
      var bends = q.sheet.prims.filter(function (p) { return p.layer === 'BEND_UP'; }).map(function (p) { return +p.a[0].toFixed(4); }).sort(function (x, y) { return x - y; });
      assert(JSON.stringify(bends) === JSON.stringify([5.8, 10.2]), 'bend lines: ' + JSON.stringify(bends));
      var notes = rfPHTexts(q, 'BEND_NOTES').map(function (p) { return +p.p[0].toFixed(3); }).sort(function (x, y) { return x - y; });
      assert(notes.length === 2 && notes[0] < 5.8 && notes[0] > 5.5 && notes[1] < 10.2 && notes[1] > 9.9, 'bend notes on their lines: ' + JSON.stringify(notes));
      var bl = q.sheet.prims.filter(function (p) { return p.breakLine; });
      assert(bl.length && bl.every(function (p) { return Math.abs(p.a[0] - g.lo) < 0.07 || Math.abs(p.a[0] - g.hi) < 0.07; }), 'break lines at the gap (teeth 1.5 mm)');
      return 'width ' + (b.x1 - b.x0).toFixed(3) + ', holes ' + circ.join(' / ') + ', bend lines ' + bends.join(' / ');
    });

    test('rfPH: on the broken flat the ordinates, hole tags and centre marks of the holes in the removed paper go with it (18, 24, 30 and 4.500; B2, B3, A1); the others keep their true values; the Hole Table keeps all five rows and does not move', function () {
      var q = rfPHSheet('notes'), dims0 = rfPHTexts(q, 'DIMENSIONS').map(function (p) { return p.text; }), ht0 = q.sheet.holeTables[0];
      ['18.000', '24.000', '30.000', '4.500', '42.000'].forEach(function (s) { assert(dims0.indexOf(s) >= 0, 'before: ' + s + ' in ' + dims0.join(' ')); });
      var tag0 = rfPHText(q, 'B4')[0].p.slice(), cm0 = q.sheet.annotations.filter(function (a) { return a.type === 'centerMark'; }).length;
      DW.addBreak(q.doc, q.view.id, { dir: 'vertical', a: 10, b: 38 });
      q.compute();
      var dims = rfPHTexts(q, 'DIMENSIONS').map(function (p) { return p.text; });
      ['18.000', '24.000', '30.000', '4.500'].forEach(function (s) { assert(dims.indexOf(s) < 0, s + ' went with the removed paper: ' + dims.join(' ')); });
      ['0', '2.000', '6.000', '42.000', '46.000', '48.000', '3.000', '6.000'].forEach(function (s) { assert(dims.indexOf(s) >= 0, s + ' kept: ' + dims.join(' ')); });
      // a kept member's line still runs from its hole to the ordinate line, now at the hole's new place
      var m42 = q.sheet.prims.filter(function (p) { return p.k === 'line' && p.layer === 'DIMENSIONS' && p.ordM && Math.abs(p.a[0] - 9.2) < 1e-6 && Math.abs(p.b[0] - 9.2) < 1e-6; });
      assert(m42.length, 'the 42.000 member line at x 9.2');
      ['B2', 'B3', 'A1'].forEach(function (t) { assert(!rfPHText(q, t).some(function (p) { return p.holeTag; }), t + ' tag gone'); });
      var tag = rfPHText(q, 'B4').filter(function (p) { return p.holeTag; })[0];
      near(tag.p[0], tag0[0] - 3.3, 1e-9, 'B4 tag moved with its hole'); near(tag.p[1], tag0[1], 1e-12, 'B4 y');
      var cms = q.sheet.annotations.filter(function (a) { return a.type === 'centerMark'; }), shown = cms.filter(function (a) { return !a.inBreak; });
      assert(cm0 === 5 && shown.length === 2 && cms.length === 5, 'centre marks shown ' + shown.length + ' of ' + cms.length);
      var ht = q.sheet.holeTables[0];
      assert(ht.rows.length === 5 && ht.rows.map(function (r) { return r.xText; }).join(' ') === ht0.rows.map(function (r) { return r.xText; }).join(' '), 'rows: ' + ht.rows.map(function (r) { return r.tag + ' ' + r.xText; }).join(', '));
      near(ht.box.x0, ht0.box.x0, 1e-12, 'table x'); near(ht.box.y1, ht0.box.y1, 1e-12, 'table y');
      return dims.join(' ');
    });

    test('rfPH: with a Bend Table the Bend Table and FLAT SIZE move whole (same size), the tags stay on their bend lines, the Fixed Face note leaves the removed paper and lands clear of holes, tags and the break lines', function () {
      var q = rfPHSheet('table'), tb0 = q.sheet.annotations.filter(function (a) { return a.type === 'bendTable'; })[0].box;
      var ff0 = q.sheet.annotations.filter(function (a) { return a.type === 'fixedFace'; })[0].box;
      assert(ff0.x0 > 4.5 && ff0.x1 < 11.5, 'Fixed Face starts in what the break takes (centre of the blank): ' + JSON.stringify(ff0));
      DW.addBreak(q.doc, q.view.id, { dir: 'vertical', a: 10, b: 38, style: 'curve' });
      q.compute();
      var tb = q.sheet.annotations.filter(function (a) { return a.type === 'bendTable'; })[0].box, g = rfPHGap(q);
      near(tb.x1 - tb.x0, tb0.x1 - tb0.x0, 1e-9, 'table width'); near(tb.y1 - tb.y0, tb0.y1 - tb0.y0, 1e-9, 'table height');
      var tl = q.sheet.prims.filter(function (p) { return p.k === 'line' && p.layer === 'BEND_NOTES'; }), tlb = rfPHBox(tl);
      near(tlb.x1 - tlb.x0, tb0.x1 - tb0.x0, 1e-9, 'table lines not squeezed');
      var tags = rfPHTexts(q, 'BEND_NOTES').filter(function (p) { return p.text === 'A' || p.text === 'B'; }).filter(function (p) { return p.rot; });
      assert(tags.length === 2, 'two tags: ' + tags.length);
      var ff = q.sheet.annotations.filter(function (a) { return a.type === 'fixedFace'; })[0].box, k = 1 / 25.4;
      assert(ff.x1 < g.lo - 1.5 * k - 1e-9 || ff.x0 > g.hi + 1.5 * k + 1e-9, 'Fixed Face clear of the gap and the break line teeth: ' + JSON.stringify(ff) + ' gap ' + JSON.stringify(g));
      assert(ff.x0 >= q.w.box.x0 && ff.x1 <= q.w.box.x1 && ff.y0 >= q.w.box.y0 && ff.y1 <= q.w.box.y1, 'Fixed Face inside the blank');
      var circles = q.sheet.prims.filter(function (p) { return p.k === 'circle' && p.layer === q.w.layer; });
      assert(!circles.some(function (c) { return c.c[0] + c.r > ff.x0 && c.c[0] - c.r < ff.x1 && c.c[1] + c.r > ff.y0 && c.c[1] - c.r < ff.y1; }), 'Fixed Face not on a hole');
      var ffText = rfPHText(q, 'Fixed Face')[0];
      assert(ffText && Math.abs(ffText.p[0] - (ff.x0 + ff.x1) / 2) < 1e-9, 'text drawn where its box is');
      var fs = rfPHTexts(q).filter(function (p) { return /^FLAT SIZE 48\.000 × 6\.000$/.test(p.text); });
      assert(fs.length === 1 && Math.abs(fs[0].p[0] - 8) < 1e-9, 'FLAT SIZE the true size, under the view centre: ' + JSON.stringify(fs.map(function (p) { return p.p; })));
      return 'Fixed Face at x ' + ((ff.x0 + ff.x1) / 2).toFixed(3) + ', table ' + (tb.x1 - tb.x0).toFixed(3) + ' wide';
    });

    test('rfPH: a bend line in the removed paper goes with its note (break 1 .. 3 around the bend at x 2); a horizontal break keeps each bend note on the longest kept piece of its line', function () {
      var q = rfPHSheet('notes');
      DW.addBreak(q.doc, q.view.id, { dir: 'vertical', a: 1, b: 3, gap: 0.2 });
      q.compute();
      var bl = q.sheet.prims.filter(function (p) { return p.layer === 'BEND_UP'; }), nt = rfPHTexts(q, 'BEND_NOTES');
      assert(bl.length === 1 && nt.length === 1, 'one bend line and one note left: ' + bl.length + ' / ' + nt.length);
      assert(q.sheet.annotations.filter(function (a) { return a.type === 'bendNote' && a.inBreak; }).length === 1, 'the other note marked inBreak');
      // horizontal: v 2.5 .. 5.5 removed (the notes sat at the middle of their lines, v 3)
      var q2 = rfPHSheet('notes'), vb = q2.w.flat.bbox;
      near(vb.vmax - vb.vmin, 6, 1e-9, 'the blank 6 high in the flat frame');
      DW.addBreak(q2.doc, q2.view.id, { dir: 'horizontal', a: vb.vmin + 2.5, b: vb.vmin + 5.5, gap: 0.2 });
      q2.compute();
      var g = q2.w.breaks.horizontal[0], lines = q2.sheet.prims.filter(function (p) { return p.layer === 'BEND_UP'; });
      assert(lines.length === 4, 'each bend line in two pieces: ' + lines.length);
      var notes = rfPHTexts(q2, 'BEND_NOTES');
      assert(notes.length === 2, 'both notes: ' + notes.length);
      notes.forEach(function (n) {
        var r = DW.textRect ? DW.textRect(n) : null;
        assert(r && (r.y1 <= g.olo + 1e-9 || r.y0 >= g.ohi - 1e-9), 'note clear of the gap: ' + JSON.stringify(r) + ' gap ' + g.olo + '..' + g.ohi);
        // (the note, 1.17 in on paper, is longer than either kept piece: it runs from the piece out past the blank's edge)
        assert(lines.some(function (l) { return Math.abs(l.a[0] - n.p[0]) < 0.2 && Math.min(l.a[1], l.b[1]) < r.y1 && Math.max(l.a[1], l.b[1]) > r.y0; }), 'note beside a kept piece of its line');
      });
      return 'vertical: 1 line + 1 note; horizontal: 4 pieces, notes kept';
    });

    test('rfPH: SolidWorks\' five break line styles: Straight Cut one line, Zig Zag Cut teeth all along, Small Zig Zag Cut one Z, Curve Cut true arcs (DXF ARC), Jagged Cut a torn edge the same on both lines; an unknown style is refused', function () {
      var k = 1 / 25.4, out = [];
      assert(DW.BREAK_STYLES.map(function (s) { return s[1]; }).join(', ') === 'Straight Cut, Curve Cut, Zig Zag Cut, Small Zig Zag Cut, Jagged Cut', 'names');
      var a = [5, 1], b = [5, 4];
      function pr(st) { return DW.breakLinePrims(a, b, st, k, 'L'); }
      assert(pr('straight').length === 1, 'straight');
      var zz = pr('zigzag'); assert(zz.length === 2 * Math.round(3 / (6 * k)), 'zig zag teeth: ' + zz.length);
      var sz = pr('smallZigzag'); assert(sz.length === 5, 'small zig zag: ' + sz.length);
      var cv = pr('curve');
      assert(cv.length >= 2 && cv.every(function (p) { return p.k === 'arc'; }), 'curve: arcs');
      // the arcs join end to end from a to b and stay within 1.5 mm of the line
      var pts = DW.breakLinePoints(a, b, 'curve', k);
      near(pts[0][0], a[0], 1e-9, 'starts at a'); near(pts[0][1], a[1], 1e-9, 'a y'); near(pts[pts.length - 1][1], b[1], 1e-9, 'ends at b');
      assert(pts.every(function (p) { return Math.abs(p[0] - 5) <= 1.5 * k + 1e-9; }), 'within 1.5 mm');
      for (var i = 1; i < pts.length; i++) assert(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) < 0.06, 'continuous at ' + i);
      var j1 = pr('jagged'), j2 = DW.breakLinePrims([5.4, 1], [5.4, 4], 'jagged', k, 'L');
      assert(j1.length > 10 && j1.length === j2.length && j1.every(function (p, i) { return Math.abs(p.a[0] + 0.4 - j2[i].a[0]) < 1e-12 && Math.abs(p.a[1] - j2[i].a[1]) < 1e-12; }), 'jagged: both lines the same shape');
      var q = rfPHSheet('notes'), threw = '';
      try { DW.addBreak(q.doc, q.view.id, { a: 10, b: 38, style: 'wavy' }); } catch (e) { threw = e.message; }
      assert(/Break line style/.test(threw), 'refused: ' + threw);
      ['straight', 'curve', 'zigzag', 'smallZigzag', 'jagged'].forEach(function (st) {
        DW.addBreak(q.doc, q.view.id, { dir: 'vertical', a: 10, b: 38, style: st });
        q.compute();
        var mine = q.sheet.prims.filter(function (p) { return p.breakLine; });
        var dxf = DW.toDXF(q.sheet, { version: 'R2000', hatch: true }), arcs = (dxf.match(/\n\s*ARC\r?\n/g) || []).length;
        if (st === 'curve') assert(arcs >= mine.length, 'Curve Cut arcs in the DXF: ' + arcs);
        var au = DxfCheck.audit(dxf, { units: 'in' }).errors.concat(DxfCheck.audit(DW.toDXF(q.sheet), { units: 'in' }).errors);
        assert(!au.length, st + ' DXF audit: ' + au.slice(0, 3).join(' | '));
        assert(/<path|<line|<polyline/.test(DW.toSVG(q.sheet)) && /%PDF/.test(DW.toPDF(q.sheet)), st + ' SVG / PDF');
        out.push(st + ' ' + mine.length);
      });
      return out.join(', ');
    });

    test('rfPH: a broken flat is saved with the drawing (style kept), Un-Break gives the whole flat back; a detail view still cannot be broken', function () {
      var q = rfPHSheet('notes');
      DW.addBreak(q.doc, q.view.id, { dir: 'vertical', a: 10, b: 38, style: 'smallZigzag', gap: 0.25 });
      var back = DW.readDrawingFile(JSON.stringify(DW.drawingFile(q.doc, q.r.model, 'ph.anvil.json'))).drawing;
      var bv = back.views.filter(function (v) { return v.id === q.view.id; })[0];
      assert(bv && JSON.stringify(bv.breaks) === JSON.stringify([{ dir: 'vertical', a: 10, b: 38, gap: 0.25, style: 'smallZigzag' }]), JSON.stringify(bv && bv.breaks));
      DW.clearBreaks(q.doc, q.view.id); q.compute();
      near(q.w.box.x1 - q.w.box.x0, 12, 1e-9, 'whole again');
      var r = rfPHPart(), d2 = DW.newDrawing(r.model, {}); DW.standard3View(d2, r.mesh, 'in');
      var dv = DW.addDetailView(d2, r.mesh, d2.views[0].id, { c: [0, 0], r: 1 }), threw = '';
      try { DW.addBreak(d2, dv.id, { a: -0.5, b: 0.5 }); } catch (e) { threw = e.message; }
      assert(/detail view cannot be broken/.test(threw), threw);
      return 'kept: smallZigzag .25';
    });

    // --- Detail View of a flat-pattern view (it was refused): a 14 ga bracket, flange UP 1 on the right, DOWN 1 on the
    // left, a Ø.25 hole at (3.5, 2.5) near the UP bend; the flat's bend lines at u 3.938 (UP) and .062 (DOWN), v -3 .. 0
    var BRK = 'p.name("PH bracket").units("in");\np.sheet(0.0747, 0.06, 0.44);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
      'p.sketch("Top", 0.0747).circle(3.5, -2.5, 0.125).cut("through", { reverse: true });\n' +
      'p.flange(1, [[4, 0.0747, 1.5]], { position: "inside", lengthRef: "outer" });\np.flange(1, [[0, 0.0747, 1.5]], { position: "inside", lengthRef: "outer", reverse: true });\n';
    function rfPHBracket(code) {
      var r = build(code || BRK); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-17' }), v = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, x: 5, y: 6, scale: [1, 1] });
      var q = { doc: doc, view: v, r: r };
      q.compute = function () { q.sheet = DW.compute(doc, r.mesh, r.model, { build: r.build }); q.w = q.sheet.views.filter(function (x) { return x.view.id === v.id; })[0]; return q.sheet; };
      q.compute();
      q.wOf = function (id) { return q.sheet.views.filter(function (x) { return x.view.id === id; })[0]; };
      return q;
    }

    test('rfPH: Detail View of a flat-pattern view (a circle round the UP bend\'s end and the hole): DETAIL A at 2 : 1 with the outline, the hole and the bend line clipped to the circle, on BEND_UP; the circle and letter on the flat', function () {
      var q = rfPHBracket(), ub = q.w.flat.bends.filter(function (b) { return b.up; })[0], C = [ub.a[0], -2.6], R = 0.6;
      var dv = DW.addDetailView(q.doc, q.r.mesh, q.view.id, { c: C, r: R });
      assert(dv.kind === 'detail' && dv.name === 'Detail View A (2 : 1)' && JSON.stringify(dv.scale) === '[2,1]', dv.name + ' ' + JSON.stringify(dv.scale));
      q.compute();
      var dw = q.wOf(dv.id), mine = q.sheet.prims.filter(function (p) { return p.view === dv.id || p.layer === dw.layer; });
      var bl = mine.filter(function (p) { return p.layer === 'BEND_UP'; });
      assert(bl.length === 1, 'one UP bend line in the detail: ' + bl.length);
      var c0 = dw.toSheet(C), rr = R * dw.scale;
      [bl[0].a, bl[0].b].forEach(function (p) { assert(Math.hypot(p[0] - c0[0], p[1] - c0[1]) <= rr + 1e-9, 'inside the detail circle'); });
      near(bl[0].a[0], dw.toSheet([ub.a[0], 0])[0], 1e-9, 'on the bend line (u ' + ub.a[0].toFixed(3) + ')');
      // the chord of the circle at the bend line, at 2 : 1: the line ends on the circle (v -3 is outside: -2.6 - .6 = -3.2)
      var half = Math.sqrt(R * R - Math.pow(ub.a[0] - C[0], 2)), top = Math.max(bl[0].a[1], bl[0].b[1]), bot = Math.min(bl[0].a[1], bl[0].b[1]);
      near(top - bot, (Math.min(C[1] + half, 0) - Math.max(C[1] - half, -3)) * 2, 1e-9, 'bend line length on paper');
      var holes = mine.filter(function (p) { return p.k === 'circle' && p.layer === dw.layer; });
      assert(holes.length === 1 && Math.abs(holes[0].r - 0.125 * 2) < 1e-9, 'the Ø.25 hole at 2 : 1: ' + holes.length);
      assert(!mine.some(function (p) { return p.layer === 'BEND_DOWN'; }), 'no DOWN bend line (it is outside the circle)');
      var tx = q.sheet.prims.filter(function (p) { return p.k === 'text'; }).map(function (p) { return p.text; });
      assert(tx.indexOf('DETAIL A') >= 0 && tx.indexOf('SCALE 2 : 1') >= 0, 'label: ' + tx.join(' | '));
      var mark = q.sheet.prims.filter(function (p) { return p.layer === q.w.layer && p.k === 'circle' && Math.abs(p.r - R * q.w.scale) < 1e-9; });
      assert(mark.length === 1, 'the detail circle on the flat');
      assert(q.sheet.annotations.filter(function (a) { return a.view === dv.id && a.flat; }).length === 0, 'no bend notes or FLAT SIZE in the detail');
      var dxf = DW.toDXF(q.sheet, { version: 'R2000' }), au = DxfCheck.audit(dxf, { units: 'in' }).errors.concat(DxfCheck.audit(DW.toDXF(q.sheet), { units: 'in' }).errors);
      assert(!au.length, 'DXF: ' + au.slice(0, 3).join(' | '));
      assert(/DETAIL_A/.test(dxf) && /BEND_UP/.test(dxf), 'layers in the DXF');
      return 'bend line ' + (top - bot).toFixed(3) + ' in on paper';
    });

    test('rfPH: a rectangle-profile detail of the flat round the DOWN bend draws it dashed on BEND_DOWN; a detail round the UP bend follows a change of the part (base 4 -> 4.2 wide: its bend line .2 to the right); a sketched polygon profile on a flat is built (rfOJ; refused before)', function () {
      var q = rfPHBracket(), db = q.w.flat.bends.filter(function (b) { return !b.up; })[0];
      var dv = DW.addDetailView(q.doc, q.r.mesh, q.view.id, { shape: 'profile', a: [db.a[0] - 0.5, -1.0], b: [db.a[0] + 0.5, 0.2] });
      q.compute();
      var dw = q.wOf(dv.id), dl = q.sheet.prims.filter(function (p) { return p.view === dv.id && p.layer === 'BEND_DOWN'; });
      assert(dl.length === 1 && dl[0].style === 'benddown', 'one dashed DOWN line: ' + dl.length);
      near(Math.abs(dl[0].a[1] - dl[0].b[1]), 1.0 * dw.scale, 1e-9, 'clipped to the profile (v -1 .. 0)');
      var svg = DW.toSVG(q.sheet);
      assert(/stroke-dasharray/.test(svg), 'dashed in the SVG');
      // the part changes (the base 4 -> 4.2 wide: the UP bend line .2 further right): a detail round the UP bend
      // follows it, as the drawing is worked out again from the rebuilt part
      var ub = q.w.flat.bends.filter(function (b) { return b.up; })[0];
      var dv2 = DW.addDetailView(q.doc, q.r.mesh, q.view.id, { shape: 'profile', a: [ub.a[0] - 0.5, -1.0], b: [ub.a[0] + 0.5, 0.2] });
      q.compute();
      var x0 = q.sheet.prims.filter(function (p) { return p.view === dv2.id && p.layer === 'BEND_UP'; })[0].a[0];
      var r2 = build(BRK.replace('rect(0, -3, 4, 3)', 'rect(0, -3, 4.2, 3)').replace('[[4, 0.0747, 1.5]]', '[[4.2, 0.0747, 1.5]]')); noErrors(r2);
      var sh2 = DW.compute(q.doc, r2.mesh, r2.model, { build: r2.build }), w2 = sh2.views.filter(function (x) { return x.view.id === dv2.id; })[0];
      var ul2 = sh2.prims.filter(function (p) { return p.view === dv2.id && p.layer === 'BEND_UP'; });
      assert(ul2.length === 1, 'UP line in the detail after the change');
      var ub2 = sh2.views.filter(function (x) { return x.view.id === q.view.id; })[0].flat.bends.filter(function (b) { return b.up; })[0];
      near(ub2.a[0] - ub.a[0], 0.2, 1e-6, 'the bend line moved .2 on the part');
      near(ul2[0].a[0] - w2.toSheet([ub2.a[0], 0])[0], 0, 1e-9, 'drawn on the moved bend line');
      assert(Math.abs(ul2[0].a[0] - x0) > 0.1, 'moved on paper: ' + x0 + ' -> ' + ul2[0].a[0]);
      // (rfOJ) a sketched polygon profile on a flat is built now (was refused); its linework is checked in kernel rfOJ
      var pv = DW.addDetailView(q.doc, q.r.mesh, q.view.id, { pts: [[0, 0], [1, 0], [1, -1]] });
      assert(pv && pv.detail.pts && pv.detail.pts.length === 3, 'a polygon detail of the flat');
      return 'DOWN line ' + Math.abs(dl[0].a[1] - dl[0].b[1]).toFixed(3) + ' on paper';
    });
  })();
