  // --- p9-bendtable: the bent-channel report (test-reports/2026-10-07-bent-channel.md items 7 and 17): a Bend Table goes
  // on free paper (never on the title block, the border or a view), carries the bend deduction (BEND DED.; BEND ALLOW.
  // and K-FACTOR on request), reads R.060 like the dimensions; a straight slot gets a slot callout, not 2X R ---
  (function () {
    group('p9-bendtable: Bend Table placement and columns, slot callouts');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing;
    // 16 ga (T = R = .0598, K .5): a 6 × 4 base, flanges 1.5 on both long edges (Material Inside), a hem on the front
    // one, an end flange 1.0, two Ø.266 holes and a .375 slot with centres 1.5 apart through the base
    var CH = 'p.name("Channel").units("in");\np.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
      'p.flange(1.5, [[3, 0.0598, 0], [3, 0.0598, 4]], { position: "inside" });\np.hem(0.375, [[3, 1.6196, 4]], { gap: 0.0299 });\n' +
      'p.flange(1.0, [[0, 0.0598, 2]], { position: "inside" });\np.sketch("Top", 0.0598).slot(2.25, -2, 3.75, -2, 0.375).cut("through", { reverse: true });\n' +
      'p.hole("Top", 1, -1, 0.266, { offset: 0.0598 });\np.hole("Top", 5, -1, 0.266, { offset: 0.0598 });';
    var chan = null;
    function channel() {
      if (!chan) { chan = build(CH); noErrors(chan); chan.flat = K.flatPattern(chan.model, chan.build, chan.mesh); }
      return chan;
    }
    // a drawing of the channel: the standard views when std, then the flat view at 1:2 with a Bend Table at `at`
    function sheetOf(std, at, viewOpts) {
      var r = channel(), doc = DW.newDrawing(r.model, { date: '2026-10-07' });
      if (std) DW.standard3View(doc, r.mesh, 'in');
      var v = DW.addFlatView(doc, r.mesh, Object.assign({ model: r.model, build: r.build, scale: '1:2', bendNotes: 'table', x: at[0], y: at[1] }, viewOpts || {}));
      var q = { doc: doc, view: v };
      q.recompute = function () {
        q.sheet = DW.compute(doc, r.mesh, r.model, { build: r.build });
        q.table = q.sheet.annotations.filter(function (a) { return a.type === 'bendTable' && a.view === v.id; })[0];
        q.w = q.sheet.views.filter(function (x) { return x.view.id === v.id; })[0];
        return q;
      };
      return q.recompute();
    }
    function meet(a, b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }
    function tbRect(sh) { var S = sh.size, b1 = DW._.BORDER / 25.4; return { x0: S[0] - b1 - DW._.TB_W / 25.4, y0: b1, x1: S[0] - b1, y1: b1 + DW._.TB_H / 25.4 }; }
    // what the table's box covers: the title block, the border, any view's linework
    function covers(q) {
      var S = q.sheet.size, b1 = DW._.BORDER / 25.4, t = q.table.box, bad = [];
      if (meet(t, tbRect(q.sheet))) bad.push('title block');
      if (t.x0 < b1 || t.y0 < b1 || t.x1 > S[0] - b1 || t.y1 > S[1] - b1) bad.push('border');
      q.sheet.views.forEach(function (w) { if (meet(t, w.box)) bad.push(w.view.orient); });
      return bad;
    }

    test('p9-bendtable: the channel unfolds to 4 bends (3 × 90° BD .0983, the hem 180° BD .0086), BA .1409 each', function () {
      var f = channel().flat;
      assert(f.bends.length === 4, 'bends ' + f.bends.length);
      f.bends.forEach(function (b) { near(b.ba, Math.PI / 2 * (0.0598 + 0.5 * 0.0598), 1e-9, 'BA'); });
      var bd = f.bends.map(function (b) { return +b.bd.toFixed(4); }).sort();
      assert(JSON.stringify(bd) === '[0.0086,0.0983,0.0983,0.0983]', 'BD ' + JSON.stringify(bd));
      return bd.join(', ');
    });
    test('p9-bendtable: a flat view placed just above the title block, with the three standard views on the sheet: its Bend Table goes on free paper — not on the title block, inside the border, off every view', function () {
      var q = sheetOf(true, [14.6, 4.6]);
      assert(q.table && !q.table.hidden, 'a table');
      var under = q.w.box.y0 - (20 + 6 * 5) / 25.4;
      assert(under < tbRect(q.sheet).y1, 'under the view would run into the title block (the reported bug) ' + fmt(under));
      assert(!covers(q).length, 'the table covers ' + covers(q).join(', ') + ': ' + JSON.stringify(q.table.box));
      return 'table at ' + [q.table.box.x0, q.table.box.y0].map(fmt).join(', ');
    });
    test('p9-bendtable: the flat view alone at the lower right: the table is clear of the title block and the view; at the sheet centre it stays under the view, left-aligned, as before', function () {
      var q = sheetOf(false, [13.5, 4.2]);
      assert(!covers(q).length, 'lower right: the table covers ' + covers(q).join(', ') + ' ' + JSON.stringify(q.table.box));
      var c = sheetOf(false, [8.5, 6.5]);
      assert(!covers(c).length && c.table.box.y1 < c.w.box.y0 && Math.abs(c.table.box.x0 - c.w.box.x0) < 1e-9, 'centre: under the view ' + JSON.stringify(c.table.box) + ' view ' + JSON.stringify(c.w.box));
      return 'lower right at ' + [q.table.box.x0, q.table.box.y0].map(fmt).join(', ');
    });
    test('p9-bendtable: Bend Table columns TAG / DIRECTION / ANGLE / INNER RADIUS / BEND DED.: radius .060 (SolidWorks bend table--standard, rfV), BD = flatPattern\'s bd at three places, no leading zero; bendCols adds BEND ALLOW. and K-FACTOR', function () {
      var r = channel(), q = sheetOf(false, [8.5, 6.5]), rows = q.table.info.rows;
      assert(JSON.stringify(q.table.info.columns) === '["Tag","Direction","Angle","Inner Radius","Bend Ded."]', 'columns ' + JSON.stringify(q.table.info.columns));
      assert(rows.length === 4, 'rows ' + rows.length);
      r.flat.bends.slice().reverse().forEach(function (b, i) {   // the last bend made is A (rfGW)
        var row = rows[i];
        assert(row[0] === DW.bendTag(i) && row[1] === (b.up ? 'UP' : 'DOWN') && row[2] === Math.round(b.angle) + '°', 'row ' + i + ' ' + JSON.stringify(row));
        assert(row[3] === DW.numText(b.R, 'in', 3).replace(/^\./, '0.') && row[4] === DW.numText(b.bd, 'in', 3), 'row ' + i + ' R / BD ' + JSON.stringify(row));
      });
      assert(rows.some(function (x) { return x[3] === '0.060' && x[4] === '.098'; }) && rows.some(function (x) { return x[2] === '180°' && x[3] === '0.015' && x[4] === '.009'; }), 'values ' + JSON.stringify(rows));
      var txt = q.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'BEND_NOTES'; }).map(function (p) { return p.text; });
      assert(txt.indexOf('Bend Ded.') >= 0 && txt.indexOf('.098') >= 0 && txt.indexOf('R .060') < 0, 'drawn ' + txt.join('|'));
      q.view.bendCols = ['k', 'ba', 'bd']; q.recompute();
      assert(JSON.stringify(q.table.info.columns) === '["Tag","Direction","Angle","Inner Radius","Bend Ded.","Bend Allow.","K-Factor"]', 'all columns ' + JSON.stringify(q.table.info.columns));
      assert(q.table.info.rows.every(function (x) { return x[5] === '.141' && x[6] === '0.50'; }), 'BA / K ' + JSON.stringify(q.table.info.rows));
      q.view.bendCols = []; q.recompute();
      assert(q.table.info.rows[0].length === 4, 'no optional columns');
      // the drawing's set precision applies (two places); fractions do not (a deduction stays decimal)
      delete q.view.bendCols; q.doc.options.dimPrec = 2; q.recompute();
      assert(q.table.info.rows[0][4] === '.10' && q.table.info.rows[0][3] === '0.06', 'two places ' + JSON.stringify(q.table.info.rows[0]));
      q.doc.options.dimPrec = ''; q.doc.options.fractions = true; q.recompute();
      assert(q.table.info.rows[0][4] === '.098', 'fractions ' + JSON.stringify(q.table.info.rows[0]));
      return rows.map(function (x) { return x.join(' '); }).join(' / ');
    });
    test('p9-bendtable: a second flat view\'s table keeps clear of the first one\'s; a dragged table keeps its offset from where it goes by itself', function () {
      var r = channel(), q = sheetOf(false, [5, 7]);
      DW.addFlatView(q.doc, r.mesh, { model: r.model, build: r.build, scale: '1:2', bendNotes: 'table', x: 12, y: 7 });
      q.recompute();
      var tabs = q.sheet.annotations.filter(function (a) { return a.type === 'bendTable'; });
      assert(tabs.length === 2 && !meet(tabs[0].box, tabs[1].box), 'two tables apart ' + JSON.stringify(tabs.map(function (a) { return a.box; })));
      var b0 = q.table.box;
      DW.flatAnnotation(q.doc, q.view.id, 'table', { off: [0.5, 0.25] });
      q.recompute();
      near(q.table.box.x0 - b0.x0, 0.5, 1e-9, 'dragged x'); near(q.table.box.y0 - b0.y0, 0.25, 1e-9, 'dragged y');
      return 'ok';
    });
    test('p9-bendtable: model items on the channel: the slot reads .375 X 1.875 SLOT (width X overall length, leader on an end arc), no 2X R.188; holes stay 2X Ø.266', function () {
      var r = channel(), doc = DW.newDrawing(r.model, { date: '2026-10-07' });
      DW.standard3View(doc, r.mesh, 'in');
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), texts = sh.dims.map(function (d) { return d.text; });
      assert(texts.indexOf('.375 X 1.875 SLOT') >= 0 && texts.indexOf('2X R.188') < 0 && texts.indexOf('R.188') < 0, 'model items ' + texts.join(' | '));
      assert(texts.indexOf('2X Ø.266') >= 0, 'holes ' + texts.join(' | '));
      var sd = sh.dims.filter(function (d) { return d.slot; })[0];
      near(sd.r, 0.1875, 1e-9, 'leader on an end arc'); near(sd.slot.w, 0.375, 1e-9, 'width'); near(sd.slot.len, 1.875, 1e-9, 'length');
      assert(sh.prims.some(function (p) { return p.k === 'text' && p.layer === 'DIMENSIONS' && p.text === '.375 X 1.875 SLOT'; }), 'drawn');
      sd.prec = 2;
      assert(DW.dimLabel(sd, 'in').text === '.38 X 1.88 SLOT', 'a set precision applies to both: ' + DW.dimLabel(sd, 'in').text);
      return texts.join(' | ');
    });
    test('p9-bendtable: two identical slots read 2X 10 X 40 SLOT (mm); a slot of another size gets its own callout; a bar with full round ends is no slot (2X R5)', function () {
      var r = build('p.box(120, 60, 5);\np.sketch("Top", 5).slot(20, -15, 50, -15, 10).cut("through", { reverse: true });\np.sketch("Top", 5).slot(70, -15, 100, -15, 10).cut("through", { reverse: true });\np.sketch("Top", 5).slot(30, -45, 30, -35, 6).cut("through", { reverse: true });');
      noErrors(r);
      var doc = DW.newDrawing(r.model, {}); DW.standard3View(doc, r.mesh, 'mm');
      var t = DW.compute(doc, r.mesh, r.model, { build: r.build }).dims.map(function (d) { return d.text; });
      assert(t.indexOf('2X 10 X 40 SLOT') >= 0 && t.indexOf('6 X 16 SLOT') >= 0 && !t.some(function (x) { return /R5|R3/.test(x); }), 'slots ' + t.join(' | '));
      var bar = build('p.sketch("Top").slot(0, 0, 50, 0, 10).extrude(4);'), d2 = DW.newDrawing(bar.model, {});
      DW.standard3View(d2, bar.mesh, 'mm');
      var t2 = DW.compute(d2, bar.mesh, bar.model, { build: bar.build }).dims.map(function (d) { return d.text; });
      assert(t2.indexOf('2X R5') >= 0 && !t2.some(function (x) { return /SLOT/.test(x); }), 'bar ' + t2.join(' | '));
      return t.join(' | ') + ' ; ' + t2.join(' | ');
    });
    test('p9-bendtable: bend notes use Kernel.bendNoteText when the kernel has it (the flat preview\'s and DXF\'s text); a set precision keeps the drawing\'s own format', function () {
      var had = Object.prototype.hasOwnProperty.call(K, 'bendNoteText'), keep = K.bendNoteText;
      try {
        K.bendNoteText = function (b, units) { return (b.up ? 'UP' : 'DOWN') + ' ' + Math.round(b.angle) + '° R' + DW.numText(b.R, units, 3); };
        assert(DW.bendNoteText({ up: true, angle: 90, R: 0.0598 }, 'in') === 'UP 90° R.060', DW.bendNoteText({ up: true, angle: 90, R: 0.0598 }, 'in'));
        assert(DW.bendNoteText({ up: true, angle: 90, R: 0.0598 }, 'in', { prec: 2 }) === 'UP 90° R .06', 'prec');
        var r = channel(), doc = DW.newDrawing(r.model, {});
        DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, bendNotes: 'notes', x: 8.5, y: 6 });
        var notes = DW.compute(doc, r.mesh, r.model, { build: r.build }).annotations.filter(function (a) { return a.type === 'bendNote'; }).map(function (a) { return a.text; });
        assert(notes.indexOf('UP 90° R.060') >= 0 && notes.indexOf('DOWN 180° R.015') >= 0, 'notes ' + notes.join(', '));
      } finally { if (had) K.bendNoteText = keep; else delete K.bendNoteText; }
      return 'ok';
    });
  })();
  // --- end p9-bendtable ---

