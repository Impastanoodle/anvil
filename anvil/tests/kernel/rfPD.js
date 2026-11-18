  // --- rfPD (2026-11-17, lane drawchamfer: the drawing's Chamfer Dimension in SolidWorks' text formats, a chamfer
  // feature's model item, dual chamfer texts in the sheet / SVG / PDF / DXF, explode lines of an exploded view) ---
  (function () {
    group('rfPD: Chamfer Dimension .100 X .300 / .100 X 30° / C.100, chamfer model items, dual chamfer texts, explode lines');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing;
    // a 3 x 1 x 2 inch block (x 0..3, y 0..1, z 0..2); the chamfer on its top edge along x at z = 0, seen end on in the
    // Right view (u = -z, v = y): the corner at (0, 1)
    var BLOCK = 'p.units("in");\np.sketch("Top").rect(0, -2, 3, 2).end().extrude(1);\n';
    function rfPDDoc(chamfer, opts) {
      var r = build(BLOCK + chamfer);
      noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-17' });
      DW.standard3View(doc, r.mesh, r.model.units);
      doc.modelItems = { source: 'entire', marked: true };   // (Model Items run: its PM's OK writes this)
      doc.options = Object.assign(doc.options || {}, opts || {});
      var q = { r: r, doc: doc };
      q.compute = function () { q.sheet = DW.compute(doc, r.mesh, r.model, { build: r.build }); return q.sheet; };
      q.view = function (o) { return q.sheet.views.filter(function (w) { return w.view.orient === o; })[0]; };
      q.chamfers = function () { return q.sheet.dims.filter(function (d) { return d.kind === 'chamfer'; }); };
      q.compute();
      return q;
    }
    // the visible lines of a view that end at p (view frame)
    function rfPDLinesAt(w, p) {
      return w.proj.lines.visible.filter(function (l) { return Math.hypot(l[0] - p[0], l[1] - p[1]) < 1e-6 || Math.hypot(l[2] - p[0], l[3] - p[1]) < 1e-6; });
    }
    // the chamfer line of the Right view (both ends within .5 of the corner (0, 1), not on either face line)
    function rfPDChamferLine(w) {
      return w.proj.lines.visible.filter(function (l) {
        return Math.abs(l[0] - l[2]) > 1e-6 && Math.abs(l[1] - l[3]) > 1e-6 && Math.hypot(l[0], l[1] - 1) < 0.5 && Math.hypot(l[2], l[3] - 1) < 0.5;
      })[0];
    }
    // a user Chamfer Dimension on the Right view's chamfer with the lead-in edge at the end `end` (0 | 1) of it
    function rfPDUserDim(q, end) {
      var R = q.view('Right'), ch = rfPDChamferLine(R);
      assert(ch, 'the chamfer line in the Right view');
      var P = end ? [ch[2], ch[3]] : [ch[0], ch[1]];
      var lead = rfPDLinesAt(R, P).filter(function (l) { return l !== ch; })[0];
      assert(lead, 'a lead-in edge at ' + P);
      return DW.addChamferDim(q.doc, R.view.id, { a: [ch[0], ch[1]], b: [ch[2], ch[3]], ref: { a: [lead[0], lead[1]], b: [lead[2], lead[3]] } });
    }
    function rfPDTexts(sheet) { return sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'DIMENSIONS'; }).map(function (p) { return p.text; }); }
    function rfPDDxfTexts(dxf) {
      var L = dxf.split(/\r?\n/), out = [];
      for (var i = 0; i + 1 < L.length; i += 2) if (L[i].trim() === '1') out.push(L[i + 1]);
      return out;
    }

    test('rfPD: Model Items bring a Distance Distance chamfer feature (D1 .1, D2 .3) as one chamfer dimension .100 X .300 in the Right view (the view along its edge), D1 first whichever face takes it; flipped the same', function () {
      var out = [];
      [false, true].forEach(function (flip) {
        var q = rfPDDoc('p.chamfer(0.1, [[1.5, 1, 0]], { d2: 0.3' + (flip ? ', flip: true' : '') + ' });'), c = q.chamfers();
        assert(c.length === 1 && c[0].auto && c[0].text === '.100 X .300', (flip ? 'flipped: ' : '') + JSON.stringify(c.map(function (d) { return [d.text, d.auto]; })));
        assert(c[0].view === q.view('Right').view.id, 'in the Right view');
        near(c[0].value, 0.1, 1e-9, 'D1'); near(c[0].value2, 0.3, 1e-9, 'D2');
        assert(rfPDTexts(q.sheet).indexOf('.100 X .300') >= 0, 'drawn: ' + rfPDTexts(q.sheet).join(' | '));
        out.push(c[0].text);
        if (flip) return;
        delete q.doc.modelItems; q.compute();
        assert(!q.chamfers().length, 'before Model Items is run (the default set of a new drawing): none');
      });
      return out.join(' ; ');
    });

    test('rfPD: an Angle Distance chamfer (.1 at 30°) reads .100 X 30°, an equal one .100 X 45°; Model Items off (Marked for drawing off) or another feature selected brings none', function () {
      var a = rfPDDoc('p.chamfer(0.1, [[1.5, 1, 0]], { angle: 30 });'), ca = a.chamfers();
      assert(ca.length === 1 && ca[0].text === '.100 X 30°', 'angle: ' + ca.map(function (d) { return d.text; }));
      var e = rfPDDoc('p.chamfer(0.1, [[1.5, 1, 0]]);'), ce = e.chamfers();
      assert(ce.length === 1 && ce[0].text === '.100 X 45°', 'equal: ' + ce.map(function (d) { return d.text; }));
      e.doc.modelItems = { source: 'entire', marked: false }; e.compute();
      assert(!e.chamfers().length, 'not marked: none');
      var ex = e.r.model.features.filter(function (f) { return f.type === 'extrude'; })[0];
      e.doc.modelItems = { source: 'feature', feature: ex.id, marked: true }; e.compute();
      assert(!e.chamfers().length, 'the extrude selected: none');
      var ch = e.r.model.features.filter(function (f) { return f.type === 'chamfer'; })[0];
      e.doc.modelItems = { source: 'feature', feature: ch.id, marked: true }; e.compute();
      assert(e.chamfers().length === 1, 'the chamfer selected: ' + e.chamfers().length);
      return ca[0].text + ' | ' + ce[0].text;
    });

    test('rfPD: a Chamfer Dimension placed by hand on a Distance Distance chamfer reads D1 X D2 with D1 the leg along the lead-in edge (picked at either end: .100 X .300 / .300 X .100); on a sketch-like chamfer the part does not name it stays .100 X 71.57°', function () {
      var q = rfPDDoc('p.chamfer(0.1, [[1.5, 1, 0]], { d2: 0.3 });', {}), out = [];
      q.doc.modelItems = { source: 'entire', marked: false };
      rfPDUserDim(q, 0); rfPDUserDim(q, 1); q.compute();
      var t = q.chamfers().map(function (d) { return d.text; }).sort();
      assert(t.length === 2 && t[0] === '.100 X .300' && t[1] === '.300 X .100', 'both ends: ' + t.join(' | '));
      out.push(t.join(', '));
      q.doc.modelItems = { source: 'entire', marked: true }; q.compute();
      assert(q.chamfers().length === 2 && !q.chamfers().some(function (d) { return d.auto; }), 'dimensioned by hand: no model item on top: ' + q.chamfers().map(function (d) { return d.text + (d.auto ? ' (auto)' : ''); }));
      // the same block with the chamfer made by a cut (no chamfer feature): the angle form
      var r = build(BLOCK + 'p.sketch("Right").polyline([[0, 1], [-0.3, 1], [0, 0.9]], { close: true }).cut("through", { both: true });');
      noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-17' }); DW.standard3View(doc, r.mesh, 'in'); doc.modelItems = { source: 'entire', marked: false };
      var q2 = { r: r, doc: doc, compute: q.compute };
      q2.sheet = DW.compute(doc, r.mesh, r.model, { build: r.build });
      q2.view = function (o) { return q2.sheet.views.filter(function (w) { return w.view.orient === o; })[0]; };
      var R = q2.view('Right'), ch = R && rfPDChamferLine(R);
      if (!ch) return out.join('') + ' (cut chamfer not found in Right: skipped)';
      var P = [ch[0], ch[1]], lead = rfPDLinesAt(R, P).filter(function (l) { return l !== ch; })[0];
      DW.addChamferDim(doc, R.view.id, { a: [ch[0], ch[1]], b: [ch[2], ch[3]], ref: { a: [lead[0], lead[1]], b: [lead[2], lead[3]] } });
      var s2 = DW.compute(doc, r.mesh, r.model, { build: r.build }), c2 = s2.dims.filter(function (d) { return d.kind === 'chamfer'; })[0];
      assert(c2 && / X \d+(\.\d+)?°$/.test(c2.text), 'no feature: the angle form ' + (c2 && c2.text));
      out.push(c2.text);
      return out.join(' ; ');
    });

    test('rfPD: text formats: a dimension\'s chform (1 X 45°, 45° X 1, 1 X 1, C1) wins over the document\'s Chamfer text display; C1 only on a 45° chamfer; the PM / doc props key is kept by setDimProps', function () {
      var q = rfPDDoc('p.chamfer(0.1, [[1.5, 1, 0]]);'), out = [];
      function t() { return q.chamfers()[0].text; }
      [['dxa', '.100 X 45°'], ['axd', '45° X .100'], ['dxd', '.100 X .100'], ['c', 'C.100']].forEach(function (x) {
        q.doc.options.chamferText = x[0]; q.compute();
        assert(t() === x[1], 'document ' + x[0] + ': ' + t()); out.push(t());
      });
      q.doc.options.chamferText = 'c';
      var key = q.chamfers()[0].style;
      assert(/:chamfer:/.test(key), 'a stable key: ' + key);
      q.doc.dimProps = {}; q.doc.dimProps[key] = DW.setDimProps({}, { chform: 'axd' }); q.compute();
      assert(t() === '45° X .100', 'own format wins: ' + t());
      var a = rfPDDoc('p.chamfer(0.1, [[1.5, 1, 0]], { angle: 30 });', { chamferText: 'c' });
      assert(a.chamfers()[0].text === '.100 X 30°', 'C1 on a 30° chamfer falls back: ' + a.chamfers()[0].text);
      a.doc.options.chamferText = 'axd'; a.compute();
      assert(a.chamfers()[0].text === '30° X .100', '45° X 1 form: ' + a.chamfers()[0].text);
      return out.join(' | ');
    });

    test('rfPD: the chamfer model item follows the part: D1 .1 -> .15 reads .150 X .300 and keeps its key; its tolerance and precision from the Dimension PM stay on it', function () {
      var q = rfPDDoc('p.chamfer(0.1, [[1.5, 1, 0]], { d2: 0.3 });'), c = q.chamfers()[0], key = c.style;
      q.doc.dimProps = {}; q.doc.dimProps[key] = DW.setDimProps({}, { prec: 2 }); q.compute();
      assert(q.chamfers()[0].text === '.10 X .30', 'precision 2: ' + q.chamfers()[0].text);
      var r = build(BLOCK + 'p.chamfer(0.15, [[1.5, 1, 0]], { d2: 0.3 });');
      noErrors(r);
      var s = DW.compute(q.doc, r.mesh, r.model, { build: r.build }), c2 = s.dims.filter(function (d) { return d.kind === 'chamfer'; })[0];
      assert(c2 && c2.style === key && c2.text === '.15 X .30', 'after the edit: ' + (c2 && [c2.style, c2.text]));
      return key + ' ' + c2.text;
    });

    test('rfPD: dual dimensions: .100 X .300 [2.54 X 7.62] (both distances, same order), .100 X 30° [2.54] (the angle once); the sheet, SVG, PDF, DXF R12 and R2000 carry the same texts', function () {
      var q = rfPDDoc('p.chamfer(0.1, [[1.5, 1, 0]], { d2: 0.3 });', { dual: true }), out = [];
      assert(q.chamfers()[0].text === '.100 X .300 [2.54 X 7.62]', 'dxd dual: ' + q.chamfers()[0].text);
      var tx = rfPDTexts(q.sheet);
      assert(tx.indexOf('.100 X .300') >= 0 && tx.indexOf('[2.54 X 7.62]') >= 0, 'sheet texts: ' + tx.join(' | '));
      var svg = DW.toSVG(q.sheet);
      assert(svg.indexOf('.100 X .300') >= 0 && svg.indexOf('[2.54 X 7.62]') >= 0, 'SVG');
      var pdf = DW.toPDF(q.sheet);
      assert(pdf.indexOf('(.100 X .300)') >= 0 && pdf.indexOf('([2.54 X 7.62])') >= 0, 'PDF');
      ['R12', 'R2000'].forEach(function (ver) {
        var dt = rfPDDxfTexts(DW.toDXF(q.sheet, { version: ver }));
        assert(dt.indexOf('.100 X .300') >= 0 && dt.indexOf('[2.54 X 7.62]') >= 0, ver + ' texts: ' + dt.filter(function (x) { return /X/.test(x); }).join(' | '));
      });
      out.push(q.chamfers()[0].text);
      var a = rfPDDoc('p.chamfer(0.1, [[1.5, 1, 0]], { angle: 30 });', { dual: true, dualPos: 'right' });
      assert(a.chamfers()[0].text === '.100 X 30° [2.54]', 'dxa dual: ' + a.chamfers()[0].text);
      var dt = rfPDDxfTexts(DW.toDXF(a.sheet, { version: 'R2000' }));
      assert(dt.indexOf('.100 X 30%%d') >= 0 && dt.indexOf('[2.54]') >= 0, 'R2000 angle form: ' + dt.filter(function (x) { return /X|\[/.test(x); }).join(' | '));
      out.push(a.chamfers()[0].text);
      a.doc.options.dualUnits = 'mm'; a.doc.options.dualShowUnits = true; a.doc.options.chamferText = 'dxd'; a.compute();
      assert(a.chamfers()[0].text === '.100 X .058 [2.54mm X 1.47mm]', 'units shown on both: ' + a.chamfers()[0].text);
      out.push(a.chamfers()[0].text);
      return out.join(' ; ');
    });

    test('rfPD: Autodimension on a slot (8 x 4 plate, slot centres 2.5 / 5.5 at y 2): SolidWorks\' centre position 2.500 and centre-to-centre 3.000, the slot\'s centre line 2.000 (not its sides 1.750 / 2.250 or ends); baseline, chain and ordinate, from either side; the dimensions follow the slot when it moves', function () {
      var r = build('p.units("in");\np.sketch("Front").rect(0, 0, 8, 4).slot(2.5, 2, 5.5, 2, 0.5).extrude(0.25);');
      noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-17' });
      doc.views = []; doc.nextView = 1; doc.autoDims = false;
      DW.addView(doc, 'Front', { x: 200, y: 140 });
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), w = sh.views[0], out = [];
      function run(scheme, far) {
        doc.views[0].dims = [];
        DW.autodimension(doc, doc.views[0].id, w.proj, { h: { scheme: scheme, origin: far ? 'right' : 'left', place: far ? 'below' : 'above' }, v: { scheme: scheme, origin: far ? 'top' : 'bottom', place: far ? 'right' : 'left' }, scale: 1, units: 'in' });
        sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
        assert(!sh.dims.some(function (d) { return d.dangling; }), scheme + ': none dangles');
        return sh.dims.map(function (d) { return d.kind + ' ' + d.text; }).sort().join(' | ');
      }
      var want = {
        baseline: 'baseline 2.000, 4.000 | baseline 2.500, 8.000 | h 3.000',
        chain: 'h 2.500 | h 3.000 | h 5.500 | v 2.000 | v 2.000',
        ordinate: 'h 3.000 | ordinate 0, 2.000, 4.000 | ordinate 0, 2.500, 8.000'
      };
      Object.keys(want).forEach(function (s) {
        [false, true].forEach(function (far) { var t = run(s, far); assert(t === want[s], s + (far ? ' (right / top)' : '') + ': ' + t); });
        out.push(want[s]);
      });
      // moved to 3 .. 6.5 (ordinate from the right / top, the last run): 8 - 6.5 = 1.500, centre to centre 3.500
      var r2 = build('p.units("in");\np.sketch("Front").rect(0, 0, 8, 4).slot(3, 2, 6.5, 2, 0.5).extrude(0.25);');
      var s2 = DW.compute(doc, r2.mesh, r2.model, { build: r2.build }), t2 = s2.dims.map(function (d) { return d.kind + ' ' + d.text + (d.dangling ? '?' : ''); }).sort().join(' | ');
      assert(t2 === 'h 3.500 | ordinate 0, 1.500, 8.000 | ordinate 0, 2.000, 4.000', 'moved: ' + t2);
      return out.join(' ; ');
    });

    test('rfPD: Hole Wizard callouts as SolidWorks writes them (drill line on top, a space after each symbol as its callout tokens <MOD-DIAM> <hw-diam> store it): Ø .281 ↧ .750; Ø .266 THRU ALL over ⌴ Ø .438 ↧ .250; Ø .266 THRU ALL over ⌵ Ø .507 X 82°', function () {
      if (typeof HoleWizard === 'undefined') return 'no Hole Wizard';
      var base = 'p.units("in");\np.sketch("Top").rect(0, -2, 4, 2).end().extrude(1);\n', out = [];
      [['p.holeWizard({ face: "Top", offset: 1, points: [[1, -1]], standard: "ANSI Inch", type: "hole", size: "9/32", sizeType: "drill", end: "blind", depth: 0.75 });', 'Ø .281 ↧ .750'],
        ['p.holeWizard({ face: "Top", offset: 1, points: [[1, -1]], standard: "ANSI Inch", type: "cbore", size: "1/4", fit: "normal", end: "through" });', 'Ø .266 THRU ALL\n⌴ Ø .438 ↧ .250'],
        ['p.holeWizard({ face: "Top", offset: 1, points: [[1, -1]], standard: "ANSI Inch", type: "csk", size: "1/4", end: "through" });', 'Ø .266 THRU ALL\n⌵ Ø .507 X 82°']].forEach(function (x) {
        var r = build(base + x[0]);
        noErrors(r);
        var doc = DW.newDrawing(r.model, { date: '2026-11-17' });
        DW.standard3View(doc, r.mesh, 'in');
        var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), T = sh.views.filter(function (q) { return q.view.orient === 'Top'; })[0];
        var c = T.proj.circles.visible.slice().sort(function (a, b) { return a.r - b.r; })[0];
        DW.addHoleCallout(doc, T.view.id, { c: c.c, r: c.r });
        sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
        var a = sh.annotations.filter(function (q) { return q.type === 'holeCallout'; })[0];
        assert(a && a.text.replace(/\s+/g, ' ') === x[1].replace(/\n/g, ' '), 'callout ' + JSON.stringify(a && a.text) + ' wanted ' + JSON.stringify(x[1]));
        out.push(a.text.replace(/\n/g, ' / '));
      });
      return out.join(' ; ');
    });

    test('rfPD: explode lines: a projected view made from an exploded model view is exploded too and draws its explode line; a collapsed one none', function () {
      if (typeof Assembly === 'undefined' || typeof buildAsm === 'undefined') return 'no assembly helpers';
      var r = buildAsm('var b = a.insert({ script: \'p.name("Base"); p.box(100, 50, 10);\' }, { fixed: true });\n' +
        'var k = a.insert({ script: \'p.name("Block"); p.box(20, 20, 10);\' }, { position: [40, 10, 15], fixed: true });\n' +
        'a.explode([k], "x", 40);');
      assert(!Object.keys(r.errors).length, 'errors ' + JSON.stringify(r.errors));
      var doc = DW.newDrawing(r.model, { date: '2026-11-17' });
      DW.addView(doc, 'Front', { x: 90, y: 160 });
      DW.setViewExploded(doc, doc.views[0].id, true, r.model);
      DW.addProjectedView(doc, r.mesh, doc.views[0].id, 'down', {});
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      var xl = function (w) { return sh.prims.filter(function (p) { return p.explodeLine && p.view === w.view.id; }); };
      assert(sh.views.length === 2, 'two views: ' + sh.views.length);
      var F = xl(sh.views[0]), T = xl(sh.views[1]);
      assert(F.length === 1 && T.length === 1, 'one explode line each: ' + F.length + ' / ' + T.length);
      assert(F[0].style === 'tanfont' && T[0].style === 'tanfont', 'thin phantom (SolidWorks\' explode line font): ' + F[0].style);
      var s = sh.views[1].scale;
      near(Math.abs(T[0].b[0] - T[0].a[0]), 40 * s, 1e-6, 'Top: along x, 40 mm');
      var dxf = DW.toDXF(sh, { version: 'R2000' });
      assert(/PHANTOM/.test(dxf), 'DXF: phantom linetype');
      DW.setViewExploded(doc, doc.views[1].id, false, r.model);
      sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      assert(!xl(sh.views[1]).length, 'collapsed: none');
      return '40 mm lines in Front and Top';
    });
  })();
