  // --- rfMZ (2026-11-16, lane MZ: dimensioning a shop drawing like a user, test-reports/2026-11-15-drawing-dimensions.md) ---
  // The engine side of the drawing-dimensions audit: hole callouts on an inch plate with plain, tapped, counterbored and
  // countersunk holes; the Dimension PM's tolerance kinds; dimensions that follow or dangle after a model edit.
  group('rfMZ: drawing dimensions (inch shop drawing)');
  var RFMZPLATE = 'p.name("Plate").units("in");\np.sketch("Top").rect(0, -3, 5, 3).end().extrude(0.375);\n' +
    'p.sketch("Top", 0.375).circle(1, -1, 0.1005).end().cut("through", { reverse: true });\n' +
    'p.holeWizard({ face: "Top", offset: 0.375, points: [[2.5, -1], [2.5, -2], [4, -1], [4, -2]], standard: "ANSI Inch", type: "tap", size: "1/4-20 UNC", end: "through" });\n' +
    'p.holeWizard({ face: "Top", offset: 0.375, points: [[1, -2]], standard: "ANSI Inch", type: "cbore", size: "1/4", fit: "normal", end: "through" });\n' +
    'p.holeWizard({ face: "Top", offset: 0.375, points: [[3.25, -2.5]], standard: "ANSI Inch", type: "csk", size: "1/4", fit: "normal", end: "through" });\n';
  function rfMZDoc(code) {
    var r = build(code); noErrors(r);
    var doc = DW.newDrawing(r.model, { date: '2026-11-16', projection: 'third' });
    DW.standard3View(doc, r.mesh, 'in');
    r.doc = doc; r.sheet = DW.compute(doc, r.mesh, r.model, { build: r.build });
    r.w = function (o) { return r.sheet.views.filter(function (w) { return w.view.orient === o; })[0]; };
    return r;
  }
  function rfMZCallout(r, w, c, rad) { return DW.holeCalloutLines(r.doc, w, r.mesh, r.model, { c: c, r: rad }).lines.join(' / '); }

  test('rfMZ: Hole Callout on a plain Ø.201 hole beside four tapped 1/4-20 holes reads Ø.201 THRU ALL (not 5X, not threaded); the tapped ones 4X with the thread', function () {
    var r = rfMZDoc(RFMZPLATE), w = r.w('Top');
    var plain = rfMZCallout(r, w, [1, -1], 0.1005), tap = rfMZCallout(r, w, [2.5, -1], 0.1005);
    var cb = rfMZCallout(r, w, [1, -2], 0.133), ck = rfMZCallout(r, w, [3.25, -2.5], 0.133);
    assert(plain === 'Ø.201 THRU ALL', 'plain: ' + plain);
    assert(tap === '4X Ø .201 THRU ALL / 1/4-20 UNC THRU ALL', 'tapped: ' + tap);
    assert(/^Ø \.266 THRU ALL \/ ⌴ Ø \.438 ↧ \.250$/.test(cb), 'counterbore: ' + cb);
    assert(/^Ø \.266 THRU ALL \/ ⌵ Ø \.5\d\d X 82°$/.test(ck), 'countersink: ' + ck);
    return [plain, tap, cb, ck].join(' | ');
  });

  var RFMZBRACKET = 'p.name("Bracket").units("in");\np.sheet(0.0747, 0.075, 0.44);\n' +
    'p.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\n' +
    'p.flange(1.5, [[6, 0.0747, 1.5]], { position: "inside", lengthRef: "outer" });\n' +
    'p.sketch("Top", 0.0747).circle(1, -1, 0.1005).circle(2, -1, 0.1005).end().cut("through", { reverse: true });\n';
  function rfMZArc(w) { return (w.proj.arcs.visible || []).filter(function (a) { return a.r > 0.1; })[0]; }

  test('rfMZ: arc length dimension (Smart Dimension: the arc, then its ends): r x sweep, ANSI arc symbol over the text, R2000 DXF angular DIMENSION; it follows a new bend radius; a fraction drawing writes it as a fraction', function () {
    var r = rfMZDoc(RFMZBRACKET), f = r.w('Front'), a = rfMZArc(f);
    assert(a, 'the bend outside arc');
    var d = DW.arcLengthDim({ c: a.c, r: a.r, a0: a.a0, a1: a.a1 }, [a.c[0] + 0.5, a.c[1] - 0.5]);
    assert(d && d.arcLen && Math.abs(d.value - a.r * Math.PI / 2) < 1e-12, 'value ' + (d && d.value));
    f.view.dims = (f.view.dims || []).concat([d]);
    var doc = r.doc; doc.views.filter(function (v) { return v.id === f.view.id; })[0].dims = f.view.dims;
    var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), sd = sh.dims.filter(function (x) { return x.arcLen; })[0], ix = sh.dims.indexOf(sd);
    assert(sd && sd.text === '.235' && !sd.dangling, 'text ' + (sd && sd.text));
    var sym = sh.prims.filter(function (p) { return p.dimIx === ix && p.k === 'arc' && p.a0 === 60 && p.a1 === 120; }), txt = sh.prims.filter(function (p) { return p.dimIx === ix && p.k === 'text'; });
    assert(sym.length === 1 && txt.length === 1 && sym[0].c[1] + sym[0].r * Math.sin(Math.PI / 3) > txt[0].p[1] + txt[0].h, 'arc symbol over the text');
    var dxf = DW.toDXF(sh, { version: 'R2000' });
    assert(/\nDIMENSION\r?\n/.test(dxf) && dxf.indexOf('\n.235\n') >= 0 || dxf.indexOf('.235') >= 0, 'R2000 DXF has the dimension');
    // a bigger bend radius: the dimension finds its arc again
    var code2 = RFMZBRACKET.replace('p.sheet(0.0747, 0.075, 0.44)', 'p.sheet(0.0747, 0.25, 0.44)'), r2 = build(code2); noErrors(r2);
    var sh2 = DW.compute(doc, r2.mesh, r2.model, { build: r2.build }), sd2 = sh2.dims.filter(function (x) { return x.arcLen; })[0];
    var R2 = 0.25 + 0.0747;
    assert(sd2 && !sd2.dangling && Math.abs(sd2.value - R2 * Math.PI / 2) < 1e-6, 'followed: ' + (sd2 && sd2.text + ' ' + sd2.value) + ' arcs ' + JSON.stringify(sh2.views.filter(function (x) { return x.view.orient === 'Front'; })[0].proj.arcs.visible.map(function (q) { return [q.c, q.r]; })));
    doc.options = Object.assign({}, doc.options || {}, { fractions: true });
    var sh3 = DW.compute(doc, r2.mesh, r2.model, { build: r2.build }), sd3 = sh3.dims.filter(function (x) { return x.arcLen; })[0];
    assert(/^\d*\s?\d+\/\d+$|^\d+$/.test(sd3.text), 'fraction: ' + sd3.text);
    return sd.text + ' -> ' + sd2.text + ' (' + sd3.text + ')';
  });

  test('rfMZ: a deleted hole: the hole-to-hole dimension dangles (it read 0); reattachDimTo puts it on a picked edge, a diameter only on a circle; Basic / MIN / MAX tolerance labels', function () {
    var r = rfMZDoc(RFMZBRACKET), w = r.w('Top');
    var d = DW.addSmartDim(r.doc, w.view.id, { circle: { c: [1, -1], r: 0.1005 } }, { circle: { c: [2, -1], r: 0.1005 } }, [1.5, 0.4], {});
    var dd = DW.addSmartDim(r.doc, w.view.id, { circle: { c: [2, -1], r: 0.1005 } }, null, [2.6, -0.4], {});
    assert(d && d.value === 1 && dd && dd.kind === 'dia', 'two dims');
    // hole 2 deleted
    var r2 = build(RFMZBRACKET.replace('.circle(2, -1, 0.1005)', '')); noErrors(r2);
    var sh = DW.compute(r.doc, r2.mesh, r2.model, { build: r2.build }), w2 = sh.views.filter(function (x) { return x.view.id === w.view.id; })[0];
    var ds = sh.dims.filter(function (x) { return x.view === w.view.id && !x.auto; });
    // the hole-to-hole dangles (both picks would land on hole 1: 0); the Ø goes to the same-size hole 1 and reads true
    assert(ds.length === 2 && ds[0].dangling && ds[1].text === 'Ø.201', 'after the delete: ' + ds.map(function (x) { return x.text + (x.dangling ? '!' : ''); }));
    var ix = r.doc.views.filter(function (v) { return v.id === w.view.id; })[0].dims.indexOf(d);
    var bad = DW.reattachDimTo(r.doc, w.view.id, ix + 1, w2.proj, { edge: [[0, 0], [6, 0]] });
    assert(!bad.ok, 'a diameter does not take an edge');
    var ok = DW.reattachDimTo(r.doc, w.view.id, ix, w2.proj, { edge: [[6, 0], [6, -3]] });
    assert(ok.ok && !ok.dangling, 'hole to the right edge');
    var sh2 = DW.compute(r.doc, r2.mesh, r2.model, { build: r2.build }), d2 = sh2.dims.filter(function (x) { return x.view === w.view.id && x.index === ix && !x.auto; })[0];
    assert(d2 && !d2.dangling && d2.text === '5.000', 'reattached: ' + (d2 && d2.text));
    function lab(t) { return DW.dimLabel({ kind: 'h', value: 1.5, tol: { type: t } }, 'in'); }
    assert(lab('min').text === '1.500 MIN' && lab('max').text === '1.500 MAX' && lab('basic').basic === true, 'MIN / MAX / Basic');
    assert(DW.TOL_TYPES.map(function (x) { return x[1]; }).join(',') === 'None,Basic,Bilateral,Limit,Symmetric,MIN,MAX', 'list ' + DW.TOL_TYPES.join(';'));
    return d2.text;
  });
  test('rfMZ: Autodimension on a Lofted-Bend square-to-round blank (no edge square to either axis): the overall size between the outline\'s extreme vertices, both ways; the set follows when the part changes', function () {
    var T16 = 0.0598, code = function (h) { return 'p.name("Transition").units("in");\np.sheet(' + T16 + ', ' + T16 + ', 0.5);\n' +
      'var a = p.sketch("Top").polyline([[0, -2], [2, -2], [2, 2], [-2, 2], [-2, -2], [-0.001, -2]], false).id();\n' +
      'var b = p.sketch("Top", ' + h + ').arc(0, 0, 1, 270.03, 360).arc(0, 0, 1, 0, 90).arc(0, 0, 1, 90, 180).arc(0, 0, 1, 180, 270).id();\n' +
      'p.loftedBend([a, b]);\n'; };
    var r = build(code(3)); noErrors(r);
    var doc = DW.newDrawing(r.model, { date: '2026-11-16' }), v = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, fit: true, newSheet: false });
    var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), w = sh.views.filter(function (x) { return x.view.id === v.id; })[0];
    var res = DW.flatAutodimension(doc, v.id, w, sh, {});
    var sh2 = DW.compute(doc, r.mesh, r.model, { build: r.build }), ords = sh2.dims.filter(function (d) { return d.kind === 'ordinate' && d.view === v.id; });
    var b = w.proj.bounds;
    assert(ords.length === 2, 'two ordinate sets: ' + ords.length + ' ' + JSON.stringify(res));
    var span = ords.map(function (d) { return Math.max.apply(null, d.values.map(Math.abs)); }).sort(function (x, y) { return x - y; });
    var want = [b.umax - b.umin, b.vmax - b.vmin].sort(function (x, y) { return x - y; });
    assert(Math.abs(span[0] - want[0]) < 1e-6 && Math.abs(span[1] - want[1]) < 1e-6 && ords.every(function (d) { return !d.dangling; }), 'overall ' + span + ' vs ' + want);
    // a taller transition: a bigger blank; the vertices are found again
    var r2 = build(code(4)); noErrors(r2);
    var sh3 = DW.compute(doc, r2.mesh, r2.model, { build: r2.build }), o3 = sh3.dims.filter(function (d) { return d.kind === 'ordinate' && d.view === v.id; });
    var w3 = sh3.views.filter(function (x) { return x.view.id === v.id; })[0], b3 = w3.proj.bounds;
    var span3 = o3.map(function (d) { return Math.max.apply(null, d.values.map(Math.abs)); }).sort(function (x, y) { return x - y; });
    var want3 = [b3.umax - b3.umin, b3.vmax - b3.vmin].sort(function (x, y) { return x - y; });
    assert(o3.every(function (d) { return !d.dangling; }) && Math.abs(span3[1] - want3[1]) < 1e-6 && span3[1] > span[1] + 0.1, 'followed: ' + span3 + ' vs ' + want3);
    return ords.map(function (d) { return d.text; }).join(' ; ') + ' -> ' + o3.map(function (d) { return d.text; }).join(' ; ');
  });
  test('rfMZ: centre marks on a tight hole pattern at 1:8 shrink to 0.4 of the pitch on paper and drop their extended lines (no crosses running into each other); a lone hole keeps the full mark', function () {
    var code = 'p.units("in");\np.sketch("Top").rect(0, -30, 24, 30).end().extrude(0.0478);\n' +
      'p.sketch("Top", 0.0478).circle(1.5, -1.5, 0.094).end().cut("through", { reverse: true });\n' +
      'p.linearPattern({ dir: "x", spacing: 0.75, count: 4, dir2: "z", spacing2: 0.75, count2: 3 });\n' +
      'p.sketch("Top", 0.0478).circle(20, -25, 0.25).end().cut("through", { reverse: true });\n';
    var r = build(code); noErrors(r);
    var doc = DW.newDrawing(r.model, { date: '2026-11-16', scale: [1, 8] });
    DW.standard3View(doc, r.mesh, 'in');
    doc.sheet.scale = [1, 8]; doc.sheet.autoScale = false;
    var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), w = sh.views.filter(function (x) { return x.view.orient === 'Top'; })[0];
    var vt = doc.views.filter(function (v) { return v.id === w.view.id; })[0];
    var hc = w.proj.circles.visible.filter(function (c) { return Math.abs(c.r - 0.094) < 1e-6; })[0], lone = w.proj.circles.visible.filter(function (c) { return Math.abs(c.r - 0.25) < 1e-6; })[0];
    DW.addCenterMark(doc, vt.id, { style: 'single', holes: [{ c: hc.c, r: hc.r }] });
    DW.addCenterMark(doc, vt.id, { style: 'single', holes: [{ c: lone.c, r: lone.r }] });
    sh = DW.compute(doc, r.mesh, r.model, { build: r.build }); w = sh.views.filter(function (x) { return x.view.id === vt.id; })[0];
    var marks = sh.annotations.filter(function (a) { return a.type === 'centerMark' && a.view === vt.id; });
    function lines(a) { var C = w.toSheet(a === big ? lone.c : hc.c), m = function (q) { return [(q.a[0] + q.b[0]) / 2, (q.a[1] + q.b[1]) / 2]; }; return sh.prims.filter(function (p) { return p.k === 'line' && p.layer === 'ANNOTATIONS' && Math.hypot(m(p)[0] - C[0], m(p)[1] - C[1]) < 1e-9 + (a === big ? 0.5 : 0.01) && Math.hypot(p.a[0] - C[0], p.a[1] - C[1]) < (a === big ? 0.6 : 0.2); }); }
    var tight = marks[marks.length - 2], big = marks[marks.length - 1];
    var pitch = 0.75 * w.scale, ext = function (a) { return Math.max.apply(null, lines(a).map(function (p) { return Math.max(Math.abs(p.a[0] - p.b[0]), Math.abs(p.a[1] - p.b[1])); })); };
    assert(lines(tight).length === 2 && ext(tight) <= 0.8 * pitch + 1e-9, 'tight: ' + lines(tight).length + ' lines, cross ' + ext(tight) + ' vs pitch ' + pitch);
    var Ct = w.toSheet(hc.c), extT = sh.prims.filter(function (p) { return p.k === 'line' && p.layer === 'ANNOTATIONS' && p.style === 'center' && Math.hypot(p.a[0] - Ct[0], p.a[1] - Ct[1]) < pitch; });
    assert(!extT.length, 'no extended lines on the tight mark: ' + extT.length);
    assert(ext(big) >= 0.1 * 2 - 1e-9 || lines(big).length > 2, 'the lone hole keeps its mark: ' + lines(big).length + ' / ' + ext(big));
    return 'cross ' + ext(tight).toFixed(4) + ' in on a ' + pitch.toFixed(4) + ' in pitch';
  });