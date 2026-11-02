  // --- p9-drawing: shop drawings of sheet-metal parts (run local-2026-10-07a): the flat-pattern view (bend lines UP /
  // DOWN, bend notes, Bend Table, overall dimensions, FLAT SIZE), inch ANSI dimension text, notes, DXF layers
  (function () {
    group('p9-drawing: flat-pattern views, bend notes, inch ANSI dimensions, notes');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing;
    var UB = AnvilExamples.filter(function (e) { return e.name === 'Sheet-metal U-bracket'; })[0].code;
    // 0.060 in steel, R .030, K .44: a 4 × 2 base, one flange up on the left edge, one down on the right, a slot and
    // four Ø.281 holes
    var INCH = 'p.name("Bracket").units("in");\np.sheet(0.06, 0.03, 0.44);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n' +
      'p.sketch("Top", 0.06).slot(1.5, -1, 2.5, -1, 0.3).cut("through", { reverse: true });\np.flange(1, [[0, 0.06, 1]]);\np.flange(1, [[4, 0.06, 1]], { reverse: true });\n' +
      'p.hole("Top", 0.5, -0.5, 0.281, { offset: 0.06 });\np.hole("Top", 3.5, -0.5, 0.281, { offset: 0.06 });\np.hole("Top", 0.5, -1.5, 0.281, { offset: 0.06 });\np.hole("Top", 3.5, -1.5, 0.281, { offset: 0.06 });';
    function flatDrawing(code, opts, docOpts) {
      var r = build(code);
      noErrors(r);
      r.flat = K.flatPattern(r.model, r.build, r.mesh);
      // (rfV: overall flat dimensions are off by default, as in SolidWorks; these tests turn them on unless told)
      r.doc = DW.newDrawing(r.model, { date: '2026-10-07', options: Object.assign({ flatDims: true }, docOpts || {}) });
      r.view = DW.addFlatView(r.doc, r.mesh, Object.assign({ model: r.model, build: r.build }, opts || {}));
      r.recompute = function () { r.sheet = DW.compute(r.doc, r.mesh, r.model, { build: r.build }); r.w = r.sheet.views.filter(function (w) { return w.view.id === r.view.id; })[0]; return r.sheet; };
      r.recompute();
      return r;
    }
    function flatAnns(r, type) { return r.sheet.annotations.filter(function (a) { return a.flat && (!type || a.type === type); }); }
    // the note a bend gets (Drawing.bendNoteText: the drawing's own 'UP 90° R .030', or Kernel.bendNoteText's when the
    // kernel has it), so these tests hold either way; the drawing's own format is checked with the kernel's hidden
    function noteOf(up, angle, R, units) { return DW.bendNoteText({ up: up, angle: angle, R: R }, units || 'in'); }
    function ownFormat(fn) { var had = Object.prototype.hasOwnProperty.call(K, 'bendNoteText'), keep = K.bendNoteText; if (had) delete K.bendNoteText; try { return fn(); } finally { if (had) K.bendNoteText = keep; } }

    test('p9-drawing: the U-bracket flat-pattern view draws one bend line per bend of Kernel.flatPattern, on its centre line, 1.5 mm past the outline at both ends, UP on BEND_UP (thin solid)', function () {
      var r = flatDrawing(UB), w = r.w, bl = r.sheet.prims.filter(function (p) { return p.bend != null; });
      assert(r.view.kind === 'flat' && r.view.orient === 'Flat pattern' && w.layer === 'FLAT_PATTERN', 'view ' + r.view.kind + ' ' + w.layer);
      assert(bl.length === r.flat.bends.length && bl.length === 2, 'bend lines ' + bl.length + ' vs ' + r.flat.bends.length);
      r.flat.bends.forEach(function (b, i) {
        var p = bl.filter(function (x) { return x.bend === i; })[0], A = w.toSheet(b.a), B = w.toSheet(b.b), L = Math.hypot(B[0] - A[0], B[1] - A[1]), t = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
        assert(p && p.layer === (b.up ? 'BEND_UP' : 'BEND_DOWN') && p.style === (b.up ? 'bendup' : 'benddown'), 'bend ' + i + ' ' + JSON.stringify(p));
        nearVec([p.a[0], p.a[1], 0], [A[0] - t[0] * 1.5, A[1] - t[1] * 1.5, 0], 1e-9, 'start ' + i);
        nearVec([p.b[0], p.b[1], 0], [B[0] + t[0] * 1.5, B[1] + t[1] * 1.5, 0], 1e-9, 'end ' + i);
        assert(b.up === true, 'the U-bracket legs both fold up');
      });
      // the outline: the bend lines run across the blank, from edge to edge
      near(w.box.y1 - w.box.y0, 60, 1e-6, 'blank height'); near(bl[0].a[1] - bl[0].b[1], 63, 1e-6, 'line 60 + 2 × 1.5');
      return bl.map(function (p) { return p.layer + ' x=' + fmt(p.a[0]); }).join(', ');
    });
    test('p9-drawing: the flat\'s holes are true circles (4 × Ø6, 2 × Ø8 in the legs), the slot\'s ends two 180° arcs R4.5, the outline 4 lines; a Hole Callout on the flat reads 4X Ø6 THRU ALL; centre marks go on the holes and the slot', function () {
      var r = flatDrawing(UB, null, { autoCenterMarks: true }), pr = r.w.proj;
      var dias = pr.circles.visible.map(function (c) { return +(2 * c.r).toFixed(6); }).sort();
      assert(JSON.stringify(dias) === '[6,6,6,6,8,8]', 'circles ' + JSON.stringify(dias));
      assert(pr.arcs.visible.length === 2 && pr.arcs.visible.every(function (a) { return Math.abs(a.r - 4.5) < 1e-6 && Math.abs(a.a1 - a.a0 - 180) < 1e-4 && a.src === 'arc'; }), 'slot arcs ' + JSON.stringify(pr.arcs.visible));
      assert(pr.lines.visible.length === 6, 'outline 4 + slot sides 2: ' + pr.lines.visible.length);
      var c6 = pr.circles.visible.filter(function (c) { return Math.abs(c.r - 3) < 1e-6; })[0];
      DW.addHoleCallout(r.doc, r.view.id, { c: c6.c, r: c6.r });
      DW.autoInsert(r.doc, r.mesh, [r.view.id]);
      r.recompute();
      var hc = r.sheet.annotations.filter(function (a) { return a.type === 'holeCallout'; });
      assert(hc.length === 1 && hc[0].text === '4X Ø6 THRU ALL' && !hc[0].dangling, 'callout ' + JSON.stringify(hc.map(function (a) { return a.text; })));
      var cm = r.sheet.annotations.filter(function (a) { return a.type === 'centerMark'; });
      assert(cm.length === 7 && cm.some(function (a) { return a.style === 'linear'; }) && cm.every(function (a) { return !a.dangling; }), 'centre marks ' + cm.map(function (a) { return a.text + (a.dangling ? '!' : ''); }));
      assert(!r.sheet.annotations.some(function (a) { return a.type === 'centerline'; }), 'no centrelines on a flat');
      return dias.join(' ') + ', slot R4.5 × 2, ' + hc[0].text;
    });
    test('p9-drawing: bend notes carry the model\'s direction, angle and inside radius — "UP 90° R 2" (mm), "UP 90° R .030" / "DOWN 90° R .030" (inch, no leading zero), centred on their bend line, upright along it', function () {
      var r = flatDrawing(UB), n = flatAnns(r, 'bendNote');
      assert(n.length === 2 && n.every(function (a) { return a.text === noteOf(true, 90, 2, 'mm'); }), 'mm notes ' + n.map(function (a) { return a.text; }));
      var q = flatDrawing(INCH), m = flatAnns(q, 'bendNote');
      assert(q.flat.bends.length === 2 && q.flat.bends[0].up && !q.flat.bends[1].up, 'inch bends ' + JSON.stringify(q.flat.bends));
      assert(m.length === 2 && m[0].text === noteOf(true, 90, 0.03) && m[1].text === noteOf(false, 90, 0.03), 'inch notes ' + m.map(function (a) { return a.text; }));
      var tp = q.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'BEND_NOTES'; });
      assert(tp.length === 2 && tp.every(function (p) { return p.rot === 90 && p.anchor === 'middle'; }), 'notes run along the vertical bend lines: ' + JSON.stringify(tp.map(function (p) { return p.rot; })));
      q.flat.bends.forEach(function (b, i) {
        var A = q.w.toSheet(b.a), B = q.w.toSheet(b.b);
        near(tp[i].p[1], (A[1] + B[1]) / 2, 1e-9, 'note ' + i + ' centred on its line');
        near(tp[i].p[0], A[0] - 1.2 / 25.4, 1e-9, 'note ' + i + ' just beside its line');
      });
      assert(ownFormat(function () { return DW.bendNoteText({ up: false, angle: 45, R: 0.76 }, 'mm') === 'DOWN 45° R 0.76' && DW.bendNoteText({ up: true, angle: 135.04, R: 0.125 }, 'in') === 'UP 135° R .125' && DW.bendNoteText({ up: true, angle: 90, R: 0.03 }, 'in') === 'UP 90° R .030'; }), 'bendNoteText');
      return m.map(function (a) { return a.text; }).join(' / ') + ' | ' + n[0].text;
    });
    test('p9-drawing: overall dimensions on the flat equal the blank\'s bounding box (210.74 × 60; inch 6.177 × 2.000), FLAT SIZE note on request; Document Properties ▸ flatDims off removes them; they do not drive the part', function () {
      var r = flatDrawing(UB), bb = r.flat.bbox;
      var fdims = r.sheet.dims.filter(function (d) { return d.flat; });
      assert(fdims.length === 2, 'flat dims ' + r.sheet.dims.map(function (d) { return d.text; }));
      near(fdims[0].value, bb.max[0] - bb.min[0], 1e-9, 'width'); near(fdims[1].value, bb.max[1] - bb.min[1], 1e-9, 'height');
      assert(fdims[0].text === '210.74' && fdims[1].text === '60', 'texts ' + fdims.map(function (d) { return d.text; }));
      assert(DW.dimSource(r.model, r.build, r.w, fdims[1]) === null, 'a blank size drives nothing');
      var q = flatDrawing(INCH, null, { flatSizeNote: true }), qd = q.sheet.dims.filter(function (d) { return d.flat; }).map(function (d) { return d.text; });
      var W = q.flat.bbox.max[0] - q.flat.bbox.min[0];
      near(W, 4 + 2 * (1 + (Math.PI / 2) * (0.03 + 0.44 * 0.06)), 1e-9, 'inch blank: 4 + 2 (L + BA)');
      assert(JSON.stringify(qd) === '["6.177","2.000"]', 'inch flat dims ' + JSON.stringify(qd));
      var sz = flatAnns(q, 'flatSize');
      assert(sz.length === 1 && sz[0].text === 'FLAT SIZE 6.177 × 2.000', 'flat size note ' + JSON.stringify(sz.map(function (a) { return a.text; })));
      assert(q.sheet.prims.some(function (p) { return p.k === 'text' && p.layer === 'NOTES' && p.text === 'FLAT SIZE 6.177 × 2.000'; }), 'drawn on NOTES');
      q.doc.options.flatDims = false; q.recompute();
      assert(!q.sheet.dims.some(function (d) { return d.flat; }), 'flatDims off');
      return fdims.map(function (d) { return d.text; }).join(' × ') + ' | ' + qd.join(' × ') + ' | ' + sz[0].text;
    });
    test('p9-drawing: Bend Table mode: tags A, B on the bend lines and a table TAG / DIRECTION / ANGLE / INNER RADIUS / BEND DED. under the view (A UP 90° .030 .091, B DOWN 90° .030 .091)', function () {
      var q = flatDrawing(INCH, { bendNotes: 'table' }), tags = flatAnns(q, 'bendTag'), tb = flatAnns(q, 'bendTable');
      assert(tags.map(function (a) { return a.text; }).join() === 'B,A' && !flatAnns(q, 'bendNote').length, 'tags ' + JSON.stringify(tags.map(function (a) { return a.text; })));   // the last bend made is A (rfGW)
      assert(tb.length === 1 && JSON.stringify(tb[0].info.rows) === '[["A","DOWN","90°","0.030",".091"],["B","UP","90°","0.030",".091"]]', 'table ' + JSON.stringify(tb[0] && tb[0].info));
      var txt = q.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'BEND_NOTES'; }).map(function (p) { return p.text; });
      ['Tag', 'Direction', 'Angle', 'Inner Radius', 'Bend Ded.', 'UP', 'DOWN', '0.030', '.091'].forEach(function (s) { assert(txt.indexOf(s) >= 0, 'table text ' + s); });
      assert(tb[0].box.y1 < q.w.box.y0, 'the table is under the view');
      q.view.bendNotes = 'none'; q.recompute();
      assert(!flatAnns(q).length, 'none: no notes, tags or table');
      return tags.map(function (a) { return a.text; }).join(', ') + ' + table of ' + tb[0].info.rows.length;
    });
    test('p9-drawing: the flat follows the part: a longer flange widens the blank and moves the bend; a dragged note keeps its offset, a hidden one stays hidden, the text follows a new radius', function () {
      var r = flatDrawing(INCH);
      DW.flatAnnotation(r.doc, r.view.id, 'b0', { off: [0.3, 0.1] });
      DW.flatAnnotation(r.doc, r.view.id, 'b1', { hidden: true });
      r.recompute();
      var n0 = flatAnns(r, 'bendNote'), W0 = r.sheet.dims.filter(function (d) { return d.flat && d.kind === 'h'; })[0].value;
      assert(n0[1].hidden && !r.sheet.prims.some(function (p) { return p.k === 'text' && p.text === noteOf(false, 90, 0.03); }), 'b1 hidden');
      var json = JSON.parse(JSON.stringify(r.doc));
      // the part changes: the left flange 1.5 in long, R .060
      r.model.features.filter(function (f) { return f.type === 'flange'; })[0].length = 1.5;
      r.model.sheet.bendRadius = 0.06;
      r.build = K.rebuild(r.model); r.mesh = K.meshFromBody(r.build.body);
      r.doc = json; r.view = DW.findView(json, r.view.id);
      r.recompute();
      var W1 = r.sheet.dims.filter(function (d) { return d.flat && d.kind === 'h'; })[0].value, n1 = flatAnns(r, 'bendNote');
      var BA = function (R) { return Math.PI / 2 * (R + 0.44 * 0.06); };
      near(W1 - W0, 0.5 + 2 * (BA(0.06) - BA(0.03)), 1e-9, 'the blank grows by the longer flange and the larger allowances');
      assert(n1[0].text === noteOf(true, 90, 0.06) && n1[1].hidden, 'texts follow the radius; b1 still hidden: ' + JSON.stringify(n1.map(function (a) { return [a.text, a.hidden]; })));
      var tp = r.sheet.prims.filter(function (p) { return p.k === 'text' && p.text === noteOf(true, 90, 0.06); })[0], A = r.w.toSheet(r.w.flat.bends[0].a), B = r.w.toSheet(r.w.flat.bends[0].b);
      near(tp.p[0], A[0] - 1.2 / 25.4 + 0.3, 1e-9, 'dragged x kept'); near(tp.p[1], (A[1] + B[1]) / 2 + 0.1, 1e-9, 'dragged y kept');
      return fmt(W0) + ' -> ' + fmt(W1) + ', ' + n1[0].text;
    });
    test('p9-drawing: inch ANSI dimension text: .030, 4.000, -.500, 0 (three places, no leading zero), a set precision .03 / 4.0, fractions 2 1/4 and 3/16; millimetres unchanged (0.76, 2, 120.5); an inch drawing\'s hole callout reads Ø.281 THRU', function () {
      var f = function (x) { return DW.fmtDim(x, 'in'); };
      assert([f(0.03), f(4), f(-0.5), f(0), f(12.25)].join(' ') === '.030 4.000 -.500 0 12.250', [f(0.03), f(4), f(-0.5), f(0), f(12.25)].join(' '));
      assert(DW.numText(0.03, 'in', 2) === '.03' && DW.numText(4, 'in', 1) === '4.0' && DW.numText(0.76, 'mm', 2) === '0.76', 'set precision');
      assert(DW.fmtDim(0.76, 'mm') === '0.76' && DW.fmtDim(2, 'mm') === '2' && DW.fmtDim(120.5, 'mm') === '120.5', 'mm');
      assert(DW.fracText(2.25, 64) === '2 1/4' && DW.fracText(0.1875, 64) === '3/16' && DW.fracText(0.281, 64) === '9/32' && DW.fracText(0.281, 16) === '1/4' && DW.fracText(5, 16) === '5', 'fractions');
      var q = flatDrawing(INCH);
      q.doc.options.fractions = true; q.recompute();
      assert(q.sheet.dims.filter(function (d) { return d.flat; }).map(function (d) { return d.text; }).join() === '6 11/64,2', 'fractions on the sheet: ' + q.sheet.dims.map(function (d) { return d.text; }));
      q.doc.options.fractions = false; q.doc.options.dimPrec = 2; q.recompute();
      assert(q.sheet.dims.filter(function (d) { return d.flat; }).map(function (d) { return d.text; }).join() === '6.18,2.00', 'two places: ' + q.sheet.dims.map(function (d) { return d.text; }));
      assert(DW.fmtDim(0.03, 'in') === '.030', 'the style is the sheet\'s only while it is worked out');
      // a standard drawing of the inch part: model items and a callout on the Top view
      var r = build(INCH), doc = DW.newDrawing(r.model, { date: '2026-10-07' });
      DW.standard3View(doc, r.mesh, r.model.units);
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), T = sh.views.filter(function (w) { return w.view.orient === 'Top'; })[0];
      var c = T.proj.circles.visible.filter(function (x) { return Math.abs(2 * x.r - 0.281) < 1e-6; })[0];
      DW.addHoleCallout(doc, T.view.id, { c: c.c, r: c.r });
      sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      var hc = sh.annotations.filter(function (a) { return a.type === 'holeCallout'; })[0];
      assert(hc.text === '4X Ø.281 THRU ALL', 'callout ' + hc.text);
      assert(sh.dims.indexOf(sh.dims.filter(function (d) { return d.text === '4.180'; })[0]) >= 0 && sh.dims.some(function (d) { return d.text === '4X Ø.281'; }), 'model items ' + sh.dims.map(function (d) { return d.text; }));
      return hc.text + ', ' + sh.dims.map(function (d) { return d.text; }).join(' ');
    });
    test('p9-drawing: a hole feature with a thread size name adds it to the callout (1/4-20 UNC); clearance and counterbore sizes do not', function () {
      var m = { type: 'part', features: [{ type: 'hole', holeType: 'tap', size: '1/4-20 UNC', dia: 0.201 }, { type: 'hole', holeType: 'hole', size: 'M6', dia: 6.6 }, { type: 'hole', size: '#10-32 UNF', drill: 0.159 }] };
      var names = DW.holeSizeNames(m).map(function (x) { return x.name + '@' + x.dia; });
      assert(names.length === 2 && /^#10-32 UNF@/.test(names[1]) &&/^1\/4-20 UNC@/.test(names[0]), 'names ' + JSON.stringify(names));
      return names.join(', ');
    });
    test('p9-drawing: Note round trip: addNote (two lines) / editNote / deleteNote, kept through a JSON save; drawn on NOTES in SVG, DXF (one TEXT per line) and PDF; an emptied note is deleted', function () {
      var r = flatDrawing(UB);
      var nt = DW.addNote(r.doc, { p: [30, 40], text: 'NOTES:\n1. BREAK ALL EDGES' });
      assert(nt.id > 0 && r.doc.notes.length === 1, 'added');
      var back = JSON.parse(JSON.stringify(r.doc));
      assert(back.notes[0].text === 'NOTES:\n1. BREAK ALL EDGES' && back.notes[0].p[0] === 30, 'saved');
      r.doc = back; r.recompute();
      var tp = r.sheet.prims.filter(function (p) { return p.layer === 'NOTES' && p.k === 'text'; });
      assert(tp.length === 2 && tp[0].text === 'NOTES:' && tp[1].text === '1. BREAK ALL EDGES' && tp[0].p[1] > tp[1].p[1], 'two lines, first on top: ' + JSON.stringify(tp.map(function (p) { return p.text; })));
      near(tp[0].p[0], 30, 1e-12); near(tp[0].p[1], 40, 1e-12); near(tp[0].p[1] - tp[1].p[1], 3.5 * 1.6, 1e-9, 'line pitch');
      assert(r.sheet.notes.length === 1 && r.sheet.notes[0].box.x0 === 30, 'sheet.notes');
      var svg = DW.toSVG(r.sheet), dxf = DW.toDXF(r.sheet), pdf = DW.toPDF(r.sheet);
      var d = new DOMParser().parseFromString(svg, 'image/svg+xml');
      var st = Array.prototype.map.call(d.querySelectorAll('g[data-layer="NOTES"] text'), function (t) { return t.textContent; });
      assert(st.join('|') === 'NOTES:|1. BREAK ALL EDGES', 'SVG ' + st.join('|'));
      assert((dxf.match(/\n0\nTEXT\n8\nNOTES\n/g) || []).length === 2 && dxf.indexOf('\n1\n1. BREAK ALL EDGES\n') >= 0, 'DXF two TEXTs on NOTES');
      assert(pdf.indexOf('(NOTES:) Tj') >= 0 && pdf.indexOf('(1. BREAK ALL EDGES) Tj') >= 0, 'PDF');
      DW.editNote(r.doc, nt.id, { text: 'DEBURR', p: [50, 45] }); r.recompute();
      assert(r.sheet.notes[0].text === 'DEBURR' && r.sheet.notes[0].p[0] === 50, 'edited');
      DW.editNote(r.doc, nt.id, { text: '  ' });
      assert(!r.doc.notes.length, 'an emptied note is deleted');
      DW.addNote(r.doc, { p: [1, 1], text: 'X' });
      assert(DW.deleteNote(r.doc, r.doc.notes[0].id) && !r.doc.notes.length, 'deleted');
      var threw = false; try { DW.addNote(r.doc, { p: [1, 1], text: ' ' }); } catch (e) { threw = true; }
      assert(threw, 'an empty note is refused');
      return 'SVG / DXF / PDF carry the note';
    });
    test('p9-drawing: DXF layers: FLAT_PATTERN (outline, CIRCLE holes, ARC slot ends), BEND_UP (colour 3), BEND_DOWN (colour 1, HIDDEN), BEND_NOTES (UP 90%%d R .030), NOTES; SVG groups; PDF dashes the DOWN line', function () {
      var q = flatDrawing(INCH, null, { flatSizeNote: true });
      DW.addNote(q.doc, { p: [1, 10], text: 'MATERIAL: 16 GA CRS' });
      q.recompute();
      var dxf = DW.toDXF(q.sheet);
      function layerColour(n) { var m = new RegExp('\\n0\\nLAYER\\n2\\n' + n + '\\n70\\n0\\n62\\n(\\d+)\\n').exec(dxf); return m ? +m[1] : null; }
      assert(layerColour('BEND_UP') === 3 && layerColour('BEND_DOWN') === 1 && layerColour('BEND_NOTES') === 3 && layerColour('NOTES') === 7 && layerColour('FLAT_PATTERN') === 7, 'layer colours');
      assert(/\n0\nLINE\n8\nBEND_DOWN\n6\nHIDDEN\n/.test(dxf) && /\n0\nLINE\n8\nBEND_UP\n10\n/.test(dxf), 'DOWN line on HIDDEN, UP continuous');
      assert((dxf.match(/\n0\nCIRCLE\n8\nFLAT_PATTERN\n/g) || []).length === 4 && (dxf.match(/\n0\nARC\n8\nFLAT_PATTERN\n/g) || []).length === 2, 'true circles and arcs on the flat layer');
      assert(dxf.indexOf('\n1\n' + noteOf(true, 90, 0.03).replace('°', '%%d') + '\n') >= 0 && dxf.indexOf('\n1\n' + noteOf(false, 90, 0.03).replace('°', '%%d') + '\n') >= 0 && dxf.indexOf('\n1\nFLAT SIZE 6.177 x 2.000\n') >= 0 && dxf.indexOf('\n1\nMATERIAL: 16 GA CRS\n') >= 0, 'texts');
      var d = new DOMParser().parseFromString(DW.toSVG(q.sheet), 'image/svg+xml');
      ['FLAT_PATTERN', 'BEND_UP', 'BEND_DOWN', 'BEND_NOTES', 'NOTES'].forEach(function (l) { assert(d.querySelector('g[data-layer="' + l + '"]'), 'SVG layer ' + l); });
      assert(d.querySelector('g[data-layer="BEND_DOWN"] line').getAttribute('stroke-dasharray') && !d.querySelector('g[data-layer="BEND_UP"] line').getAttribute('stroke-dasharray'), 'SVG dashes DOWN only');
      var pdf = DW.toPDF(q.sheet);
      assert(pdf.indexOf('(' + noteOf(true, 90, 0.03).replace('°', '\\260') + ') Tj') >= 0 && pdf.indexOf('(FLAT SIZE 6.177 \\327 2.000) Tj') >= 0, 'PDF text');
      return 'layers ' + ['FLAT_PATTERN', 'BEND_UP', 'BEND_DOWN', 'BEND_NOTES', 'NOTES'].join(', ');
    });
    test('p9-drawing: a part that is not sheet metal has no flat-pattern view (addFlatView refuses it); a flat view whose part lost its Base Flange says why in the view; projected / section / detail views of a flat are refused', function () {
      var r = build('p.box(10, 10, 2);'), doc = DW.newDrawing(r.model, {}), threw = null;
      try { DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build }); } catch (e) { threw = e.message; }
      assert(threw && /sheet-metal|Base Flange/.test(threw) && !DW.isSheetMetal(r.model), 'refused: ' + threw);
      var q = flatDrawing(UB);
      assert(DW.isSheetMetal(q.model), 'U-bracket is sheet metal');
      ['addProjectedView', 'addSectionView', 'addDetailView'].forEach(function (fn) {
        var t = null; try { DW[fn](q.doc, q.mesh, q.view.id, fn === 'addProjectedView' ? 'down' : { r: 5, c: [0, 0] }); } catch (e) { t = e.message; }
        assert(t && /flat-pattern/.test(t), fn + ': ' + t);
      });
      var json = JSON.parse(JSON.stringify(q.doc)), sh = DW.compute(json, r.mesh, r.model, { build: r.build });
      assert(sh.prims.some(function (p) { return p.k === 'text' && /^FLAT PATTERN: /.test(p.text); }) && !sh.dims.some(function (d) { return d.flat; }), 'the reason shows in the view');
      return threw;
    });
    test('p9-drawing: flatCurves keeps a circle whose CSG merge left a stray vertex, drops collinear split vertices, and joins an arc the loop seam split', function () {
      var circ = [];
      for (var i = 0; i < 18; i++) { var a = i / 18 * 2 * Math.PI; circ.push([2 + 0.1405 * Math.cos(a), -1 + 0.1405 * Math.sin(a)]); }
      circ.splice(5, 0, circ[4].slice()); circ.push([1.897, -1.051]);                 // a repeated vertex and a stray one
      var sq = [[0, 0], [5, 0], [10, 0], [10, 4], [0, 4]];                             // a split vertex on the bottom edge
      var slot = [];
      for (var j = 0; j <= 12; j++) { var b = -Math.PI / 2 + j / 12 * Math.PI; slot.push([20 + 3 * Math.cos(b), 3 * Math.sin(b)]); }
      for (var k2 = 0; k2 <= 12; k2++) { var c2 = Math.PI / 2 + k2 / 12 * Math.PI; slot.push([10 + 3 * Math.cos(c2), 3 * Math.sin(c2)]); }
      slot = slot.slice(3).concat(slot.slice(0, 3));                                     // the seam inside an end arc
      var cv = DW.flatCurves([circ, sq, slot], 30);
      assert(cv.circles.length === 1 && Math.abs(cv.circles[0].r - 0.1405) < 1e-6 && Math.abs(cv.circles[0].c[0] - 2) < 1e-6, 'circle ' + JSON.stringify(cv.circles));
      assert(cv.lines.length === 4 + 2, 'square 4 lines + slot 2: ' + cv.lines.length);
      assert(cv.arcs.length === 2 && cv.arcs.every(function (a) { return Math.abs(a.r - 3) < 1e-9 && Math.abs(a.a1 - a.a0 - 180) < 1e-6; }), 'slot ends ' + JSON.stringify(cv.arcs));
      return '1 circle, 6 lines, 2 arcs';
    });
  })();
  // --- end p9-drawing ---
