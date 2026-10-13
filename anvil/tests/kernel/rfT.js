  // --- rfT: Model Items options, ANSI inch dimension style and scales, DIMENSION entities in the R2000 drawing DXF ---
  (function () {
    group('rfT: Model Items (flange lengths, hole locations, selected feature / views, no outside bend radius), ANSI inch dimension style, ANSI scales, R2000 DIMENSION entities');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing;
    var BRACKET = ['p.name("Bracket").units("in");', 'p.sheet(0.0598, 0.0598, 0.44);',
      'p.sketch("Top").rect(0, -4, 6, 4).end().baseFlange(0.0598);',
      'p.sketch("Top", 0.0598).circle(1, -1, 0.1405).circle(5, -1, 0.1405).circle(3, -3, 0.25).cut("through", { reverse: true });',
      'p.flange(1.5, [[0, 0.0598, 2]]);', 'p.flange(1.0, [[6, 0.0598, 2]], { reverse: true });'].join('\n');
    function rfTDoc(code, opts) {
      var r = build(code || BRACKET);
      noErrors(r);
      r.doc = DW.newDrawing(r.model, Object.assign({ date: '2026-10-12' }, opts || {}));
      DW.standard3View(r.doc, r.mesh, r.model.units);
      r.recompute = function () { r.sheet = DW.compute(r.doc, r.mesh, r.model, { build: r.build }); return r.sheet; };
      r.recompute();
      r.texts = function () { return r.sheet.dims.map(function (d) { return d.text; }); };
      return r;
    }
    test('rfT: inch drawings use the ANSI scales (8:1 … 1:64, no 1:5 / 1:10); the 6 x 4 bracket goes on ANSI B at 1:1; metric drawings keep the ISO list', function () {
      var A = DW.scalesFor('in').map(DW.scaleText);
      assert(A.join() === '8:1,4:1,2:1,1:1,1:2,1:4,1:8,1:16,1:32,1:64', 'ANSI list ' + A.join());
      assert(DW.scalesFor('mm') === DW.SCALES && DW.SCALES.map(DW.scaleText).indexOf('1:5') >= 0, 'ISO list');
      var r = rfTDoc();
      assert(r.doc.sheet.format === 'ANSI B' && DW.scaleText(r.doc.sheet.scale) === '1:1', 'bracket at ' + DW.scaleText(r.doc.sheet.scale));
      // a 60 x 40 inch plate: 1:8 (no 1:5 / 1:10 on an inch sheet)
      var big = rfTDoc('p.name("Big").units("in");\np.sketch("Front").rect(0, 0, 60, 40).extrude(1);');
      assert(DW.scalesFor('in').some(function (s) { return DW.scaleText(s) === DW.scaleText(big.doc.sheet.scale); }), 'big plate on an ANSI scale: ' + DW.scaleText(big.doc.sheet.scale));
      return DW.scaleText(big.doc.sheet.scale);
    });
    test('rfT: the default model items drop the outside bend radius (R.120 = R + T) and keep R.060; the MATERIAL cell is blank when the part has no material', function () {
      var r = rfTDoc(), t = r.texts();
      assert(t.indexOf('2X R.060') >= 0 && !t.some(function (x) { return /R\.120/.test(x); }), 'radii ' + t.join(' | '));
      assert(t.indexOf('1.620') < 0 && t.indexOf('1.000') < 0, 'no flange / hole locations without the PM: ' + t.join(' | '));
      assert(DW.titleBlock(r.doc, r.model, { build: r.build, mesh: r.mesh }).material === '', 'material blank');
      r.model.materialName = 'AISI 304';
      var m = DW.titleBlock(r.doc, r.model, { build: r.build, mesh: r.mesh }).material;
      return 'material with a name: ' + JSON.stringify(m);
    });
    test('rfT: Model Items (doc.modelItems) inserts the flange length 1.620 (R + T + 1.5, outside) in the Front view and the hole locations from the left / bottom edges (1.120, 3.120, 5.120; 1.000, 3.000), one per line of holes; Eliminate duplicates off repeats them', function () {
      var r = rfTDoc();
      r.doc.modelItems = { source: 'entire' };
      var t = r.recompute() && r.texts();
      ['6.239', '2.679', '4.000', '2X Ø.281', 'Ø.500', '2X R.060', '1.620', '1.120', '3.120', '5.120', '1.000', '3.000'].forEach(function (x) { assert(t.indexOf(x) >= 0, x + ' in ' + t.join(' | ')); });
      assert(t.filter(function (x) { return x === '1.000'; }).length === 1, 'holes in line share one: ' + t.join(' | '));
      var fl = r.sheet.dims.filter(function (d) { return d.flange; })[0], front = r.doc.views.filter(function (v) { return v.role === 'front'; })[0];
      assert(fl && fl.view === front.id && fl.kind === 'v' && Math.abs(fl.value - (1.5 + 2 * 0.0598)) < 1e-9, 'flange item ' + JSON.stringify(fl && { v: fl.view, k: fl.kind, x: fl.value }));
      r.doc.modelItems = { source: 'entire', dedupe: false };
      var t2 = r.recompute() && r.texts();
      assert(t2.filter(function (x) { return x === '3.000'; }).length === 2, 'no dedupe: ' + t2.join(' | '));
      r.doc.modelItems = { source: 'entire', holeLocations: false, holeCallouts: false };
      var t3 = r.recompute() && r.texts();
      assert(t3.indexOf('1.000') < 0 && !t3.some(function (x) { return /Ø/.test(x); }) && t3.indexOf('1.620') >= 0, 'locations and callouts off: ' + t3.join(' | '));
      return t.length + ' items';
    });
    test('rfT: Model Items ▸ Selected feature inserts only that feature\'s dimensions (Edge-Flange1: 1.620; a sketch: its marked distances); Destination limits the views', function () {
      var r = rfTDoc(), f1 = r.model.features.filter(function (f) { return f.type === 'flange'; })[0];
      r.doc.modelItems = { source: 'feature', feature: f1.id };
      var t = r.recompute() && r.texts();
      assert(t.join() === '1.620', 'flange only: ' + t.join(' | '));
      var top = r.doc.views.filter(function (v) { return v.role === 'top'; })[0];
      r.doc.modelItems = { source: 'entire', views: [top.id] };
      r.recompute();
      assert(r.sheet.dims.every(function (d) { return d.view === top.id; }) && r.texts().indexOf('2.679') < 0, 'Top only: ' + r.texts().join(' | '));
      assert(DW.modelItems({}).pm === false && DW.modelItems({ modelItems: { views: [] } }).views === null, 'options');
      return 'ok';
    });
    test('rfT: ANSI inch dimension style: .125 text, .125 x .042 arrows, .0625 gap, .125 beyond; ISO mm keeps 3.5 / 3 x 1 / 1.5 / 2; doc.options override; the R2000 DIMSTYLE carries them', function () {
      var r = rfTDoc(), z = DW.dimSizes(r.doc);
      assert(z.dimText === 0.125 && z.arrowLen === 0.125 && z.arrowWidth === 0.042 && z.extGap === 0.0625 && z.extBeyond === 0.125, 'inch ' + JSON.stringify(z));
      var tx = r.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'DIMENSIONS'; });
      assert(tx.length && tx.every(function (p) { return Math.abs(p.h - 0.125) < 1e-12; }), 'text .125: ' + tx[0].h);
      var ar = r.sheet.prims.filter(function (p) { return p.k === 'fill' && p.layer === 'DIMENSIONS'; })[0], L = Math.hypot((ar.pts[1][0] + ar.pts[2][0]) / 2 - ar.pts[0][0], (ar.pts[1][1] + ar.pts[2][1]) / 2 - ar.pts[0][1]), Wd = Math.hypot(ar.pts[1][0] - ar.pts[2][0], ar.pts[1][1] - ar.pts[2][1]);
      assert(Math.abs(L - 0.125) < 1e-9 && Math.abs(Wd - 0.042) < 1e-9, 'arrow ' + L + ' x ' + Wd);
      // the overall width below the Front view: its extension lines start .0625 from the part and end .125 past the line
      var d = r.sheet.dims.filter(function (x) { return x.kind === 'h' && x.text === '6.239'; })[0], vw = r.sheet.views.filter(function (w) { return w.view.id === d.view; })[0];
      var a = vw.toSheet(d.a), yl = vw.toSheet([0, d.lineAt])[1];
      var ext = r.sheet.prims.filter(function (p) { return p.k === 'line' && p.dimIx != null && Math.abs(p.a[0] - a[0]) < 1e-9 && Math.abs(p.b[0] - a[0]) < 1e-9; })[0];
      assert(ext && Math.abs(Math.abs(ext.a[1] - a[1]) - 0.0625) < 1e-9 && Math.abs(Math.abs(ext.b[1] - yl) - 0.125) < 1e-9, 'extension line ' + JSON.stringify(ext));
      var mm = rfTDoc('p.name("P").units("mm");\np.sketch("Front").rect(0, 0, 100, 50).extrude(10);'), zm = DW.dimSizes(mm.doc);
      assert(zm.dimText === 3.5 && zm.arrowLen === 3 && zm.arrowWidth === 1 && zm.extGap === 1.5 && zm.extBeyond === 2, 'mm ' + JSON.stringify(zm));
      assert(mm.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'DIMENSIONS'; }).every(function (p) { return Math.abs(p.h - 3.5) < 1e-12; }), 'mm text 3.5');
      r.doc.options.dimText = 0.18;
      r.recompute();
      assert(Math.abs(r.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'DIMENSIONS'; })[0].h - 0.18) < 1e-12, 'override');
      var dxf = DW.toDXF(r.sheet, { version: 'R2000' });
      assert(/\n140\n0\.18\n/.test(dxf) && /\n41\n0\.125\n/.test(dxf) && /\n42\n0\.0625\n/.test(dxf) && /\n44\n0\.125\n/.test(dxf) && /\n78\n4\n/.test(dxf) && /\n271\n3\n/.test(dxf), 'DIMSTYLE');
      return 'ok';
    });
    test('rfT: the R2000 drawing DXF writes each linear / diameter / radius dimension as a DIMENSION with its own *D block (read back by dxf-check: blocks present, DIMSTYLE known); R12 stays exploded', function () {
      var r = rfTDoc();
      r.doc.modelItems = { source: 'entire' };
      r.recompute();
      var dxf = DW.toDXF(r.sheet, { version: 'R2000' }), c = DxfCheck.check(dxf, { units: 'in', layers: [] });
      assert(c.ok, 'check ' + c.errors.join('; '));
      assert(c.dimensions.length === r.sheet.dims.length && c.dimensions.every(function (d) { return d.entities > 0 && /^\*D\d+$/.test(d.block); }), 'dimensions ' + JSON.stringify(c.dimensions.slice(0, 3)));
      assert(!c.counts['LINE@DIMENSIONS'] && !c.counts['TEXT@DIMENSIONS'], 'no exploded dimension geometry in ENTITIES: ' + JSON.stringify(c.counts));
      var kinds = {}; c.dimensions.forEach(function (d) { kinds[d.kind] = (kinds[d.kind] || 0) + 1; });
      assert(kinds.linear && kinds.diameter && kinds.radius, 'kinds ' + JSON.stringify(kinds));
      var dia = c.dimensions.filter(function (d) { return d.kind === 'diameter'; }).map(function (d) { return d.text; });
      assert(dia.indexOf('%%c.500') >= 0 && dia.indexOf('2X %%c.281') >= 0, 'diameter texts ' + dia.join());
      var w = c.dimensions.filter(function (d) { return d.text === '6.239'; })[0];
      assert(w && Math.abs(w.value - 6.2392) < 1e-3, 'measurement ' + JSON.stringify(w));
      var bad = DxfCheck.check(dxf.replace(/\n2\n\*D1\n70\n1\n/, '\n2\n*X1\n70\n1\n'), { layers: [] });
      assert(!bad.ok && /\*D1/.test(bad.errors.join()), 'a missing block is an error: ' + bad.errors.join());
      var r12 = DW.toDXF(r.sheet, { version: 'R12' }), c12 = DxfCheck.check(r12, { units: 'in', layers: [] });
      assert(c12.ok && !c12.dimensions.length && c12.counts['TEXT@DIMENSIONS'] === r.sheet.dims.length, 'R12 exploded ' + JSON.stringify(c12.counts));
      return c.dimensions.length + ' DIMENSION';
    });
  })();
  // --- end rfT ---

