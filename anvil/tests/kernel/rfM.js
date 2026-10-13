  // --- rfM: drawing Revision Table, shop symbols, notes with leaders and $PRP links, title block blocks, unilateral tolerances ---
  (function () {
    group('rfM: Revision Table, Surface Finish / Datum / Geometric Tolerance, notes, title block');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing;
    var PLATE = 'p.name("Plate").units("in");\np.sketch("Front").rect(0, 0, 6, 3).extrude(0.25);\np.hole("Front", 1, 1, 0.281, { offset: 0.25 });';
    function rfMDoc(code, opts) {
      var r = build(code || PLATE);
      noErrors(r);
      r.doc = DW.newDrawing(r.model, Object.assign({ date: '2026-10-12' }, opts || {}));
      DW.standard3View(r.doc, r.mesh, r.model.units);
      r.recompute = function () { r.sheet = DW.compute(r.doc, r.mesh, r.model, { build: r.build }); return r.sheet; };
      r.recompute();
      return r;
    }
    function texts(sheet, layer) { return sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === layer; }).map(function (p) { return p.text; }); }
    function inside(a, b) { return a.x0 >= b.x0 - 1e-9 && a.x1 <= b.x1 + 1e-9 && a.y0 >= b.y0 - 1e-9 && a.y1 <= b.y1 + 1e-9; }
    function meets(a, b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }

    test('rfM: revision letters run A … H, J … N, P, R, T … W, Y, AA (I, O, Q, S, X, Z skipped, ASME Y14.35 / SolidWorks); nextRev goes on from a letter or a number', function () {
      var l = []; for (var i = 0; i < 22; i++) l.push(DW.revLetter(i));
      assert(l.join(',') === 'A,B,C,D,E,F,G,H,J,K,L,M,N,P,R,T,U,V,W,Y,AA,AB', l.join(','));
      assert(DW.nextRev('') === 'A' && DW.nextRev('H') === 'J' && DW.nextRev('N') === 'P' && DW.nextRev('R') === 'T' && DW.nextRev('W') === 'Y' && DW.nextRev('Y') === 'AA', 'next');
      assert(DW.nextRev('I') === 'J' && DW.nextRev('O') === 'P' && DW.nextRev('7') === '8', 'from outside the list');
      return l.slice(0, 10).join('');
    });
    test('rfM: Revision Table — Add Revision fills ZONE / REV / DESCRIPTION / DATE / APPROVED rows A, B, C, the title block REV reads the latest, top-right inside the border, kept through a JSON save, views kept clear; SVG / DXF R12 / R2000 / PDF carry it', function () {
      var r = rfMDoc();
      assert(r.sheet.titleBlock === undefined && DW.titleBlock(r.doc, r.model).rev === '', 'no REV yet');
      DW.addRevision(r.doc, { description: 'INITIAL RELEASE', date: '2026-10-12', approved: 'LH' });
      DW.addRevision(r.doc, { description: 'HOLE WAS .257', date: '2026-10-13', zone: 'B2' });
      var rc = DW.addRevision(r.doc, { description: 'ADDED FLANGE NOTE' });
      assert(rc.rev === 'C' && /^\d{4}-\d\d-\d\d$/.test(rc.date), 'C with today: ' + JSON.stringify(rc));
      r.doc = JSON.parse(JSON.stringify(r.doc));
      DW.standard3View(r.doc, r.mesh, r.model.units);
      r.recompute();
      assert(DW.titleBlock(r.doc, r.model).rev === 'C', 'title block REV ' + DW.titleBlock(r.doc, r.model).rev);
      var rv = r.sheet.revisions, S = r.sheet.size, b = 10 / 25.4;
      assert(rv && rv.rows.length === 3 && rv.latest === 'C', 'sheet.revisions');
      near(rv.box.x1, S[0] - b, 1e-9, 'right on the border'); near(rv.box.y1, S[1] - b, 1e-9, 'top on the border');
      near(rv.box.y1 - rv.box.y0, 5 * 6 / 25.4, 1e-9, 'title, header and three rows');
      var t = texts(r.sheet, 'REVISIONS');
      ['REVISIONS', 'ZONE', 'REV', 'DESCRIPTION', 'DATE', 'APPROVED', 'A', 'B', 'C', 'INITIAL RELEASE', 'B2', 'LH', '2026-10-13'].forEach(function (s) { assert(t.indexOf(s) >= 0, 'text ' + s + ' in ' + t.join('|')); });
      r.sheet.views.forEach(function (w) { assert(!meets(w.box, rv.box), w.view.name + ' clear of the table'); });
      var revT = r.sheet.prims.filter(function (p) { return p.layer === 'SHEET' && p.k === 'text' && p.text === 'C'; });
      assert(revT.length === 1, 'REV C in the title block');
      var svg = DW.toSVG(r.sheet), d = new DOMParser().parseFromString(svg, 'image/svg+xml');
      var st = Array.prototype.map.call(d.querySelectorAll('g[data-layer="REVISIONS"] text'), function (x) { return x.textContent; });
      assert(st.indexOf('ADDED FLANGE NOTE') >= 0, 'SVG ' + st.join('|'));
      [DW.toDXF(r.sheet), DW.toDXF(r.sheet, { version: 'R2000' })].forEach(function (dxf, i) {
        assert(/\n2\nREVISIONS\n70\n0\n62\n7\n/.test(dxf), 'layer REVISIONS ' + i);
        assert(dxf.indexOf('\n1\nHOLE WAS .257\n') >= 0 && dxf.indexOf('\n1\nAPPROVED\n') >= 0, 'DXF texts ' + i);
      });
      assert(DW.toPDF(r.sheet).indexOf('(INITIAL RELEASE) Tj') >= 0, 'PDF');
      // edit, delete a row, delete the table
      DW.editRevision(r.doc, 2, { description: 'ADDED NOTE 3', rev: 'd' });
      assert(r.doc.revisions.rows[2].rev === 'D' && DW.latestRev(r.doc) === 'D', 'edited');
      assert(DW.deleteRevision(r.doc, 2) && DW.latestRev(r.doc) === 'B', 'row deleted');
      assert(DW.addRevision(r.doc, {}).rev === 'C', 'next after B');
      DW.titleBlock(r.doc, r.model);
      r.doc.titleBlock = { rev: 'X1' };
      assert(DW.titleBlock(r.doc, r.model).rev === 'X1', 'an edited REV field wins');
      assert(DW.deleteRevisionTable(r.doc) && !r.recompute().revisions, 'table removed');
      return t.length + ' texts';
    });
    test('rfM: a BOM anchored top-right goes under the Revision Table; revRowAt finds a row', function () {
      var r = rfMDoc();
      DW.addRevision(r.doc, { description: 'A' }); DW.addRevision(r.doc, { description: 'B' });
      r.doc.bom = { show: true, anchor: 'top-right' };
      var bb = DW.bomBox(r.doc, 'in', 2), rv = DW.revBox(r.doc, 'in');
      assert(bb.y1 <= rv.y0 + 1e-9, 'BOM under the table: ' + bb.y1 + ' / ' + rv.y0);
      assert(DW.revRowAt(r.doc, 'in', [rv.x0 + 1, rv.y1 - 0.1]) === -1 && DW.revRowAt(r.doc, 'in', [rv.x0 + 1, rv.y0 + 0.05]) === 1 && DW.revRowAt(r.doc, 'in', [rv.x0 - 1, rv.y0 + 0.05]) === null, 'rows');
      return 'ok';
    });
    test('rfM: title block blocks — COMPANY, DRAWN / CHECKED and dates from the drawing\'s properties, GENERAL TOLERANCES (inch .XX ±.01 .XXX ±.005 ANGLES ±1°), editable cells; an A4 sheet leaves the tolerance block out', function () {
      var r = rfMDoc();
      r.doc.properties = { CompanyName: 'Acme Sheet Metal', DrawnBy: 'LH', DrawnDate: '2026-10-12', CheckedBy: 'JS' };
      var tb = DW.titleBlock(r.doc, r.model);
      assert(tb.company === 'ACME SHEET METAL' && tb.drawnBy === 'LH' && tb.drawnDate === '2026-10-12' && tb.checkedBy === 'JS' && tb.checkedDate === '', JSON.stringify(tb));
      assert(tb.tolerances.split('\n').join('|') === 'DIMENSIONS ARE IN INCHES|TOLERANCES:|.XX ±.01|.XXX ±.005|ANGLES ±1°', tb.tolerances);
      r.recompute();
      var t = texts(r.sheet, 'SHEET');
      ['UNLESS OTHERWISE SPECIFIED', 'COMPANY', 'DRAWN', 'CHECKED', 'ACME SHEET METAL', 'LH', '.XX ±.01', '.XXX ±.005', 'ANGLES ±1°'].forEach(function (s) { assert(t.indexOf(s) >= 0, s + ' in ' + t.join('|')); });
      var f = DW.TB_FIELDS.filter(function (x) { return x.key === 'drawnBy'; })[0], R = DW.fieldRect(f, r.sheet.size, 'in');
      var hit = DW.titleFieldAt(r.sheet.size, 'in', [(R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2]);
      assert(hit && hit.field.key === 'drawnBy', 'cell hit');
      r.doc.titleBlock = { checkedBy: 'MK' };
      assert(DW.titleBlock(r.doc, r.model).checkedBy === 'MK', 'edited cell');
      var dxf = DW.toDXF(r.recompute());
      assert(dxf.indexOf('\n1\n.XXX %%p.005\n') >= 0 && dxf.indexOf('\n1\nANGLES %%p1%%d\n') >= 0, 'DXF tolerance text');
      var mm = DW.newDrawing({ units: 'mm', name: 'P' }, { format: 'A4' });
      var on = DW.tbBlocks([297, 210], 'mm');
      assert(on.eng && !on.tol, 'A4: ' + JSON.stringify(on));
      assert(/MILLIMETERS/.test(DW.titleBlock(mm, null).tolerances), 'mm block');
      return t.length + ' sheet texts';
    });
    test('rfM: a note links custom properties ($PRPSHEET:"Material", $PRP:"DrawnBy") and takes a leader (shoulder, line, arrow at the point); the raw text is kept', function () {
      var r = rfMDoc();
      Materials.setProperty(r.model, 'Finish', 'POWDER COAT BLACK');
      r.doc.properties = { DrawnBy: 'LH' };
      var nt = DW.addNote(r.doc, { p: [1, 2], text: 'FINISH: $PRPSHEET:"Finish"\nBY $PRP:"DrawnBy"', leader: [0.6, 1.5] });
      r.recompute();
      var sn = r.sheet.notes[0];
      assert(sn.text === 'FINISH: POWDER COAT BLACK\nBY LH' && sn.raw === nt.text && DW.findNote(r.doc, nt.id).text === nt.text, 'evaluated: ' + JSON.stringify(sn.text));
      var np = r.sheet.prims.filter(function (p) { return p.layer === 'NOTES'; });
      var fills = np.filter(function (p) { return p.k === 'fill'; }), lines = np.filter(function (p) { return p.k === 'line'; });
      assert(fills.length === 1 && lines.length === 2, 'two lines and an arrow');
      near(fills[0].pts[0][0], 0.6, 1e-12); near(fills[0].pts[0][1], 1.5, 1e-12, 'arrow tip');
      assert(lines[0].a[0] < sn.box.x0 && Math.abs(lines[0].a[1] - lines[0].b[1]) < 1e-12, 'horizontal shoulder on the left');
      DW.editNote(r.doc, nt.id, { leader: null }); r.recompute();
      assert(!r.sheet.prims.some(function (p) { return p.layer === 'NOTES' && p.k === 'fill'; }), 'leader removed');
      return sn.text.replace('\n', ' / ');
    });
    test('rfM: Surface Finish, Datum Feature (A, B … skipping I, O, Q) and Geometric Tolerance (position Ø.010 (M) | A | B | C(M)) symbols: drawn on SYMBOLS as lines / circles / fills / text in SVG, DXF R12 and R2000, PDF; edit and delete', function () {
      var r = rfMDoc();
      var sf = DW.addSymbol(r.doc, { type: 'surfaceFinish', p: [2, 3], symbol: 'machined', ra: '63', leader: [2.2, 2.6] });
      var da = DW.addSymbol(r.doc, { type: 'datum', p: [3, 3] }), db = DW.addSymbol(r.doc, { type: 'datum', p: [4, 3] });
      assert(da.label === 'A' && db.label === 'B', 'datum letters');
      var g = DW.addSymbol(r.doc, { type: 'gtol', p: [5, 3.5], char: 'position', dia: true, tol: '.010', mod: 'M', datums: ['A', 'B', 'C(M)'], leader: [4.5, 2.8] });
      r.recompute();
      var sy = r.sheet.symbols;
      assert(sy.length === 4 && sy[3].text === 'POSITION Ø.010(M) | A | B | C(M)' && sy[0].text === 'SURFACE FINISH 63 (MACHINED)' && sy[1].text === 'DATUM A', JSON.stringify(sy.map(function (s) { return s.text; })));
      var gp = r.sheet.prims.filter(function (p) { return p.symbol === g.id; });
      var gl = gp.filter(function (p) { return p.k === 'line'; }), gc = gp.filter(function (p) { return p.k === 'circle'; }), gt = gp.filter(function (p) { return p.k === 'text'; }).map(function (p) { return p.text; });
      // frame: 4 sides + 4 dividers (5 cells), glyph: 2 lines + a circle, 2 MMC circles, a leader: shoulder + line + arrow
      assert(gl.length === 4 + 4 + 2 + 2 && gc.length === 3 && gp.filter(function (p) { return p.k === 'fill'; }).length === 1, 'frame lines ' + gl.length + ', circles ' + gc.length);
      assert(gt.join('|') === 'Ø.010|M|A|B|C|M', gt.join('|'));
      var dp = r.sheet.prims.filter(function (p) { return p.symbol === da.id; });
      assert(dp.filter(function (p) { return p.k === 'fill'; }).length === 1 && dp.filter(function (p) { return p.k === 'line'; }).length === 5, 'datum: frame, leader, triangle');
      var sp = r.sheet.prims.filter(function (p) { return p.symbol === sf.id; });
      assert(sp.filter(function (p) { return p.k === 'line'; }).length === 4 && sp.some(function (p) { return p.k === 'text' && p.text === '63'; }), 'surface finish: V, bar, leader, 63');
      var d = new DOMParser().parseFromString(DW.toSVG(r.sheet), 'image/svg+xml');
      assert(d.querySelectorAll('g[data-layer="SYMBOLS"] line').length >= gl.length && d.querySelectorAll('g[data-layer="SYMBOLS"] circle').length >= 3, 'SVG');
      [DW.toDXF(r.sheet), DW.toDXF(r.sheet, { version: 'R2000' })].forEach(function (dxf, i) {
        assert(dxf.indexOf('\n1\n%%c.010\n') >= 0 && /\n0\nCIRCLE\n(5\n[0-9A-F]+\n330\n1F\n100\nAcDbEntity\n)?8\nSYMBOLS\n/.test(dxf) && /\n0\nSOLID\n(5\n[0-9A-F]+\n330\n1F\n100\nAcDbEntity\n)?8\nSYMBOLS\n/.test(dxf), 'DXF ' + i);
      });
      var pdf = DW.toPDF(r.sheet);
      assert(pdf.indexOf('(\\330.010) Tj') >= 0 && pdf.indexOf('(63) Tj') >= 0, 'PDF');
      DW.editSymbol(r.doc, g.id, { char: 'flatness', dia: false, mod: '', datums: [], tol: '.005' });
      assert(DW.symbolText(DW.findSymbol(r.doc, g.id)) === 'FLATNESS .005', DW.symbolText(DW.findSymbol(r.doc, g.id)));
      var bad = false; try { DW.editSymbol(r.doc, g.id, { char: 'wobble' }); } catch (e) { bad = true; }
      assert(bad && DW.findSymbol(r.doc, g.id).char === 'flatness', 'bad characteristic refused, symbol unchanged');
      assert(DW.deleteSymbol(r.doc, db.id) && DW.nextDatum(r.doc) === 'B', 'deleted; B free again');
      DW.addSymbol(r.doc, { type: 'datum', p: [1, 1], label: 'H' });
      ['B', 'C', 'D', 'E', 'F', 'G'].forEach(function (L) { DW.addSymbol(r.doc, { type: 'datum', p: [1, 1], label: L }); });
      assert(DW.nextDatum(r.doc) === 'J', 'skips I: ' + DW.nextDatum(r.doc));
      return sy.map(function (s) { return s.text; }).join('; ');
    });
    test('rfM: a bilateral tolerance with a zero limit is written at the other limit\'s precision: inch +.003 / -.000 and +.000 / -.002 (ASME Y14.5 unilateral), mm a single 0', function () {
      function L(d, u) { return DW.dimLabel(d, u); }
      var a = L({ kind: 'h', value: 2, tol: { type: 'bilateral', plus: 0.003, minus: 0 } }, 'in');
      assert(a.upper === '+.003' && a.lower === '-.000' && a.text === '2.000 +.003/-.000', JSON.stringify(a));
      var b = L({ kind: 'h', value: 2, prec: 2, tol: { type: 'bilateral', plus: 0, minus: 0.02 } }, 'in');
      assert(b.upper === '+.00' && b.lower === '-.02', JSON.stringify(b));
      var c = L({ kind: 'h', value: 2, tol: { type: 'bilateral', plus: 0.0005, minus: 0, prec: 4 } }, 'in');
      assert(c.upper === '+.0005' && c.lower === '-.0000', JSON.stringify(c));
      var m = L({ kind: 'h', value: 32, prec: 2, tol: { type: 'bilateral', plus: 0, minus: 0.02 } }, 'mm');
      assert(m.upper === '0' && m.lower === '-0.02', JSON.stringify(m));
      return a.text + ', ' + b.text + ', ' + m.text;
    });
  })();
  // --- end rfM ---


