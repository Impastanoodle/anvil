  // --- rfJI (2026-11-06, lane drawgaps-2): flag notes (a Flag Note Bank note, numbered flags that follow their item),
  // the Note border shapes (Box, Diamond, Pentagon, Flag Pentagon, Underline), View > Hide/Show (All Annotations,
  // Sketches) in SVG / DXF ---
  (function () {
    group('rfJI: flag notes and their bank, note border shapes, View Hide/Show of annotations and sketches');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing;
    var PLATE = 'p.name("JI plate").units("in");\np.sketch("Front").rect(0, 0, 4, 2).end().extrude(0.25);\np.sketch("Front", 0.25).circle(1, 1, 0.14).circle(3, 1, 0.14).end().cut("through", { reverse: true });\n';
    var part = null;
    function rfJIPart() { if (!part) { part = build(PLATE); noErrors(part); } return part; }
    function rfJIDoc() {
      var r = rfJIPart(), doc = DW.newDrawing(r.model, { date: '2026-11-06' });
      DW.standard3View(doc, r.mesh, 'in');
      var q = { doc: doc, r: r };
      q.compute = function () { q.sheet = DW.compute(doc, r.mesh, r.model, { build: r.build }); return q.sheet; };
      return q;
    }
    function rfJINote(sh, id) { return sh.notes.filter(function (n) { return n.id === id; })[0]; }
    function rfJITexts(sh, id) { return sh.prims.filter(function (p) { return p.k === 'text' && p.note === id; }); }

    test('rfJI: a Flag Note Bank numbers its notes; a flag note shows its item number in a Flag Triangle with a leader', function () {
      var q = rfJIDoc();
      var bank = DW.addNote(q.doc, { p: [1, 2.5], text: 'DEBURR ALL EDGES\nBREAK SHARP CORNERS .010 MAX\nPAINT BLACK', bank: true });
      assert(bank.bank === true && bank.list === 'number', 'a bank is a numbered list: ' + JSON.stringify(bank));
      var f = DW.addFlagNote(q.doc, { bank: bank.id, item: 2, p: [6, 6], leader: [5, 5.2] });
      assert(f.text === '2' && f.border === 'flag' && f.flag.item === 2 && f.flag.key === 'BREAK SHARP CORNERS .010 MAX', 'record ' + JSON.stringify(f));
      var sh = q.compute(), fn = rfJINote(sh, f.id);
      assert(fn && fn.flag && fn.flag.item === 2 && !fn.flag.dangling && fn.text === '2', 'sheet flag ' + JSON.stringify(fn));
      var fp = sh.prims.filter(function (p) { return p.note === f.id; });
      assert(fp.filter(function (p) { return p.k === 'line'; }).length >= 3 + 2, 'triangle and leader lines: ' + fp.length);
      assert(fp.some(function (p) { return p.k === 'fill'; }), 'leader arrow');
      // the flag triangle is at least 7 mm a side and holds the number
      var tri = fp.filter(function (p) { return p.k === 'line'; }).slice(0, 3), side = Math.hypot(tri[0].b[0] - tri[0].a[0], tri[0].b[1] - tri[0].a[1]);
      assert(side >= 7 / 25.4 - 1e-9, 'side ' + side);
      // the bank: item 2's number drawn inside the flag's shape, the others as '1.' '3.'
      var bt = rfJITexts(sh, bank.id).map(function (p) { return p.text; });
      assert(bt.indexOf('1.') >= 0 && bt.indexOf('3.') >= 0 && bt.indexOf('2.') < 0 && bt.indexOf('2') >= 0, 'bank markers ' + JSON.stringify(bt));
      var bf = sh.prims.filter(function (p) { return p.note === bank.id && p.flagItem === 2; });
      assert(bf.filter(function (p) { return p.k === 'line'; }).length === 3, 'a triangle round item 2 in the bank: ' + bf.length);
      // the items still line up: every item's text starts at the same indent
      var items = rfJITexts(sh, bank.id).filter(function (p) { return p.text.length > 3; });
      assert(items.length === 3 && items.every(function (p) { return Math.abs(p.p[0] - items[0].p[0]) < 1e-9; }), 'one indent');
      // flags on neighbouring items 2 and 3: their shapes stay apart and left of the item texts
      DW.addFlagNote(q.doc, { bank: bank.id, item: 3, p: [7, 6] });
      sh = q.compute();
      var yr = function (it) { var ys = []; sh.prims.forEach(function (p) { if (p.note === bank.id && p.flagItem === it && p.k === 'line') ys.push(p.a[1], p.b[1]); }); return [Math.min.apply(null, ys), Math.max.apply(null, ys)]; };
      var y2 = yr(2), y3 = yr(3), txt0 = rfJITexts(sh, bank.id).filter(function (p) { return p.text.length > 3; })[0];
      assert(y3[1] < y2[0], 'item 3\'s flag under item 2\'s: ' + y2 + ' / ' + y3);
      assert(sh.prims.filter(function (p) { return p.note === bank.id && p.flagItem && p.k === 'line'; }).every(function (p) { return Math.max(p.a[0], p.b[0]) < txt0.p[0]; }), 'flags left of the texts');
      var svg = DW.toSVG(sh), dxf = DW.toDXF(sh), pdf = DW.toPDF(sh);
      assert(dxf.indexOf('BREAK SHARP CORNERS') > 0 && /\n2\r?\n/.test(dxf.replace(/\r/g, '')), 'DXF');
      assert(svg.indexOf('PAINT BLACK') > 0, 'SVG');
      assert(pdf && (typeof pdf === 'string' ? pdf.length : pdf.byteLength || pdf.length) > 100, 'PDF');
    });

    test('rfJI: flags follow their item when the bank is edited, renumber, dangle when it is gone; refusals', function () {
      var q = rfJIDoc();
      var bank = DW.addNote(q.doc, { p: [1, 2.5], text: 'DEBURR ALL EDGES\nPAINT BLACK', bank: true });
      var f = DW.addFlagNote(q.doc, { bank: bank.id, item: 2, p: [6, 6], border: 'circle' });
      // a note inserted above: PAINT BLACK is item 3 now, so is the flag
      DW.editNote(q.doc, bank.id, { text: 'DEBURR ALL EDGES\nREMOVE BURRS FROM HOLES\nPAINT BLACK' });
      var sh = q.compute();
      assert(rfJINote(sh, f.id).text === '3' && q.doc.notes.filter(function (n) { return n.id === f.id; })[0].flag.item === 3, 'renumbered ' + rfJINote(sh, f.id).text);
      assert(sh.prims.some(function (p) { return p.note === bank.id && p.flagItem === 3 && p.k === 'circle'; }), 'the bank\'s item 3 in a circle');
      // the item text changed: the flag keeps its number
      DW.editNote(q.doc, bank.id, { text: 'DEBURR ALL EDGES\nREMOVE BURRS FROM HOLES\nPAINT GLOSS BLACK' });
      sh = q.compute();
      assert(rfJINote(sh, f.id).text === '3' && !rfJINote(sh, f.id).flag.dangling, 'kept 3');
      // the bank deleted: the flag stays, dangling
      DW.deleteNote(q.doc, bank.id);
      sh = q.compute();
      var fn = rfJINote(sh, f.id);
      assert(fn && fn.flag.dangling && fn.text === '3', 'dangling ' + JSON.stringify(fn && fn.flag));
      assert(sh.prims.filter(function (p) { return p.note === f.id; }).every(function (p) { return p.color === 'dangling'; }), 'drawn dangling');
      // refusals
      var plain = DW.addNote(q.doc, { p: [1, 1], text: 'A\nB' }), msg = function (fn2) { try { fn2(); } catch (e) { return e.message; } return null; };
      assert(/Flag Note Bank/.test(msg(function () { DW.addFlagNote(q.doc, { bank: plain.id, item: 1, p: [2, 2] }); })), 'not a bank');
      DW.editNote(q.doc, plain.id, { bank: true });
      assert(/no item 5/.test(msg(function () { DW.addFlagNote(q.doc, { bank: plain.id, item: 5, p: [2, 2] }); })), 'no item');
      assert(/closed border/.test(msg(function () { DW.addFlagNote(q.doc, { bank: plain.id, item: 1, p: [2, 2], border: 'underline' }); })), 'underline refused');
      assert(q.doc.notes.filter(function (n) { return n.id === plain.id; })[0].list === 'number', 'bank on: numbered');
      // saved and read back
      var back = JSON.parse(JSON.stringify(q.doc));
      assert(back.notes.some(function (n) { return n.flag && n.flag.item === 3; }) && back.notes.some(function (n) { return n.bank; }), 'round trip');
    });

    test('rfJI: note borders Box, Diamond, Pentagon, Flag Pentagon, Underline close round the text', function () {
      var q = rfJIDoc();
      var names = DW.NOTE_BORDERS.map(function (b) { return b[1]; });
      ['Circle', 'Triangle', 'Box', 'Diamond', 'Hexagon', 'Pentagon', 'Flag Triangle', 'Flag Pentagon', 'Underline'].forEach(function (n) { assert(names.indexOf(n) >= 0, n + ' in ' + names); });
      var want = { square: 4, diamond: 4, pentagon: 5, flagPentagon: 5, underline: 1, hexagon: 6 }, ids = {};
      Object.keys(want).forEach(function (b, i) { ids[b] = DW.addNote(q.doc, { p: [1 + i * 1.6, 9], text: 'NOTE', border: b }).id; });
      var sh = q.compute();
      Object.keys(want).forEach(function (b) {
        var ls = sh.prims.filter(function (p) { return p.note === ids[b] && p.k === 'line'; }), t = rfJITexts(sh, ids[b])[0], tr = DW.textRect(t);
        assert(ls.length === want[b], b + ' sides ' + ls.length);
        var nb = rfJINote(sh, ids[b]).box;
        if (b === 'underline') assert(ls[0].a[1] < tr.y0 && Math.abs(ls[0].a[1] - ls[0].b[1]) < 1e-12 && ls[0].b[0] - ls[0].a[0] >= tr.x1 - tr.x0 - 1e-9, 'underline under the text');
        else assert(nb.x0 < tr.x0 && nb.x1 > tr.x1 && nb.y0 < tr.y0 && nb.y1 > tr.y1, b + ' box round the text');
        // closed: every corner is shared by two sides
        if (b !== 'underline') ls.forEach(function (l) { assert(ls.some(function (m) { return m !== l && Math.hypot(m.b[0] - l.a[0], m.b[1] - l.a[1]) < 1e-9; }), b + ' closed'); });
      });
    });

    test('rfJI: View Hide/Show: All Annotations and Sketches leave the sheet and the outputs, then come back', function () {
      var q = rfJIDoc();
      DW.addNote(q.doc, { p: [1, 2.5], text: 'DEBURR ALL EDGES' });
      DW.addSketchEntity(q.doc, { t: 'line', a: [0.5, 0.5], b: [2.5, 0.5] });
      DW.autoDims && (q.doc.autoDims = true);
      var sh = q.compute(), layers = function (s) { var o = {}; s.prims.forEach(function (p) { o[p.layer] = (o[p.layer] || 0) + 1; }); return o; };
      var L0 = layers(sh);
      assert(L0.NOTES && L0.SKETCH && L0.DIMENSIONS, 'notes, sketch, dims shown: ' + JSON.stringify(L0));
      assert(sh.display.annotations && sh.display.sketches, 'display on');
      assert(JSON.stringify(DW.setDisplay(q.doc, { annotations: false })) === JSON.stringify({ annotations: false, sketches: true }), 'set');
      sh = q.compute();
      var L1 = layers(sh);
      assert(!L1.NOTES && !L1.DIMENSIONS && !L1.ANNOTATIONS && L1.SKETCH && L1.SHEET, 'annotations hidden: ' + JSON.stringify(L1));
      assert(sh.notes.every(function (n) { return !isFinite(n.box.x0); }) && sh.dims.every(function (d) { return !d.box || !isFinite(d.box.x0); }), 'no clicks on hidden annotations');
      assert(DW.toDXF(sh).indexOf('DEBURR') < 0 && DW.toSVG(sh).indexOf('DEBURR') < 0, 'not in DXF / SVG');
      DW.setDisplay(q.doc, { sketches: false });
      sh = q.compute();
      assert(!layers(sh).SKETCH, 'sketch hidden');
      assert(q.doc.display.annotations === false && q.doc.display.sketches === false, 'saved with the drawing');
      DW.setDisplay(q.doc, { annotations: true, sketches: true });
      assert(!q.doc.display, 'defaults leave no key');
      sh = q.compute();
      assert(JSON.stringify(layers(sh)) === JSON.stringify(L0), 'all back: ' + JSON.stringify(layers(sh)));
      var threw = null; try { DW.setDisplay(q.doc, { planes: false }); } catch (e) { threw = e.message; }
      assert(threw && /No Hide\/Show item/.test(threw), 'unknown item refused');
    });
  })();
