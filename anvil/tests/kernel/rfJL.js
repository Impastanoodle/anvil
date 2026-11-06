  // --- rfJL (2026-11-06, lane sketchgaps-2): DXF / DWG import of customer flats against SolidWorks 2024's DXF/DWG Import
  // (DxfImport.prepare, the import PropertyManager's pipeline): data units from $INSUNITS (mm file into an inch part),
  // layers left out, duplicates / overlaps merged, gaps up to 0.001 in closed (one exactly the Merge tolerance too),
  // LWPOLYLINE bulges, SPLINE, INSERT blocks, so the flat is one closed profile that makes a Base Flange at once. ---
  (function () {
    group('rfJL: customer DXF flats into a sketch (units, layers, duplicates, gaps, bulges, SPLINE, INSERT) make a Base Flange without a repair step');
    var DI = DxfImport, K = Kernel;
    function rfJLDxf(units, ents, blocks) {
      var h = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', String(units), '0', 'ENDSEC'];
      if (blocks) h = h.concat(['0', 'SECTION', '2', 'BLOCKS'], blocks, ['0', 'ENDSEC']);
      return h.concat(['0', 'SECTION', '2', 'ENTITIES'], ents, ['0', 'ENDSEC', '0', 'EOF']).join('\n');
    }
    function rfJLLine(a, b, lay) { return ['0', 'LINE', '8', lay || 'CUT', '10', a[0], '20', a[1], '11', b[0], '21', b[1]]; }
    function rfJLCirc(c, r, lay) { return ['0', 'CIRCLE', '8', lay || 'CUT', '10', c[0], '20', c[1], '40', r]; }
    function rfJLPoly(pts, closed, lay) { var o = ['0', 'LWPOLYLINE', '8', lay || 'CUT', '90', pts.length, '70', closed ? 1 : 0]; pts.forEach(function (p) { o.push('10', p[0], '20', p[1]); if (p[2]) o.push('42', p[2]); }); return o; }
    function rfJLSpline(ctrl, knots, lay) { var o = ['0', 'SPLINE', '8', lay || 'CUT', '70', 8, '71', 3, '72', knots.length, '73', ctrl.length]; knots.forEach(function (k) { o.push('40', k); }); ctrl.forEach(function (p) { o.push('10', p[0], '20', p[1], '30', 0); }); return o; }
    var rfJLBlk = ['0', 'BLOCK', '8', '0', '2', 'HOLES', '70', 0, '10', 0, '20', 0].concat(rfJLCirc([0, 0], 0.125, '0'), rfJLCirc([0.5, 0], 0.125, '0'), ['0', 'ENDBLK']);
    // a 10 x 6 in blank as a customer sends it: the bottom edge twice, the right edge starting 0.0005 off the corner with a
    // piece drawn over it again, the top 0.0008 short of the left edge; a 4 x 1 slot as a closed LWPOLYLINE with bulges,
    // a Ø.5 hole, two Ø.25 holes in an INSERT of block HOLES, a part number circle on ETCH
    function rfJLFlat() {
      return rfJLDxf(1, [].concat(rfJLLine([0, 0], [10, 0]), rfJLLine([0, 0], [10, 0]), rfJLLine([10.0005, 0], [10, 6]), rfJLLine([10, 3], [10, 5]),
        rfJLLine([10, 6], [0.0008, 6]), rfJLLine([0, 6], [0, 0]), rfJLPoly([[3, 2, 0], [7, 2, 1], [7, 3, 0], [3, 3, 1]], true), rfJLCirc([8.5, 4.5], 0.25),
        rfJLCirc([5, 4.5], 0.2, 'ETCH'), ['0', 'INSERT', '8', 'CUT', '2', 'HOLES', '10', 1, '20', 1]), rfJLBlk);
    }
    function rfJLLoops(ents) { return K.sketchProfile({ entities: ents }).loops; }
    function rfJLFlange(ents, T) {
      var m = K.newModel('JL'); m.units = 'in';
      K.runScript(m, 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -1, 1, 1).end().baseFlange();');
      var sk = m.features.filter(function (f) { return f.type === 'sketch'; })[0];
      sk.entities = JSON.parse(JSON.stringify(ents)); delete sk.rels; delete sk.dims;
      return K.rebuild(m);
    }

    test('rfJL: the customer flat comes in as one closed outline with its holes (duplicate merged, overlap merged, the 0.0005 and 0.0008 gaps closed, slot arcs from bulges, the block\'s holes kept as a block): Check Sketch finds nothing', function () {
      var p = DI.parse(rfJLFlat(), { blocks: true }), r = DI.prepare(p, { partUnits: 'in', layers: { ETCH: false } });
      assert(p.units === 'in', 'file units ' + p.units);
      assert(r.report.merged === 2 && r.report.gaps === 2, 'report ' + JSON.stringify([r.report.merged, r.report.gaps]));
      assert(r.report.maxMove <= 0.001 + 1e-12, 'no end moved more than the gap: ' + r.report.maxMove);
      var loops = rfJLLoops(r.entities), outer = loops.filter(function (l) { return !l.hole; });
      assert(outer.length === 1 && loops.length === 5, 'one outline + slot + 3 holes: ' + loops.map(function (l) { return l.hole ? 'hole' : 'outer'; }).join(' '));
      assert(r.entities.filter(function (e) { return e.t === 'arc'; }).length === 2, 'two slot arcs from the bulges');
      assert(r.entities.filter(function (e) { return e.blkDef === 'HOLES'; }).length === 1 && r.entities.filter(function (e) { return e.blk != null && e.t === 'circle'; }).length === 2, 'block instance of HOLES');
      assert(DI.check(r.entities.filter(function (e) { return e.blk == null; }), 0.001).summary === 'No problems found', DI.check(r.entities, 0.001).summary);
      assert(!r.entities.some(function (e) { return e.layer === 'ETCH'; }), 'ETCH left out');
    });
    test('rfJL: without Repair after import the same flat stays open (what SolidWorks users get before Repair Sketch); a gap of exactly the Merge tolerance (0.0005) still closes', function () {
      var p = DI.parse(rfJLFlat(), { blocks: true }), r = DI.prepare(p, { partUnits: 'in', repair: false, layers: { ETCH: false } });
      assert(r.report.gaps === 1, 'only the 0.0005 gap closes by Merge points: ' + r.report.gaps);
      assert(/open contour/.test(DI.check(r.entities.filter(function (e) { return e.blk == null; }), 0.001).summary), 'still open');
      var g = DI.repair([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 10.0005, y1: 0, x2: 10, y2: 6 }], { tol: 0.0005, merge: false, removeTiny: false, join: false });
      assert(g.report.gaps === 1, 'gap of exactly the tolerance (0.000500000000000611 in floating point) closes');
    });
    test('rfJL: the flat makes a Base Flange .0598 at once: volume (60 − slot 4.785398 − holes π·.09375) × .0598', function () {
      var p = DI.parse(rfJLFlat(), { blocks: true }), r = DI.prepare(p, { partUnits: 'in', layers: { ETCH: false } });
      var b = rfJLFlange(r.entities, 0.0598), A = 60 - (4 + Math.PI * 0.25) - Math.PI * 0.09375;
      assert(b.body, 'Base Flange built: ' + JSON.stringify(b.errors || b.error || null));
      nearRel(b.body.volume(), A * 0.0598, 2e-3, 'volume');
    });
    test('rfJL: a millimetre file ($INSUNITS 4) into an inch part: 254 × 152.4 mm comes in as 10 × 6 in with its Ø12.7 hole Ø.5, the 0.01 mm gap closed; As in file / Inches / position options', function () {
      var m = rfJLDxf(4, [].concat(rfJLLine([0, 0], [254, 0]), rfJLLine([254, 0], [254, 152.4]), rfJLLine([254, 152.4], [0, 152.4]), rfJLLine([0, 152.4], [0, 0.01]), rfJLCirc([127, 76.2], 6.35)));
      var p = DI.parse(m), r = DI.prepare(p, { partUnits: 'in' });
      assert(p.units === 'mm' && Math.abs(r.scale - 1 / 25.4) < 1e-15, 'scale ' + r.scale);
      var bb = DI.bounds(r.entities);
      near(bb[2], 10, 1e-9, 'width'); near(bb[3], 6, 1e-9, 'height');
      near(r.entities.filter(function (e) { return e.t === 'circle'; })[0].r, 0.25, 1e-12, 'hole radius');
      assert(r.report.gaps === 1 && rfJLLoops(r.entities).length === 2, 'closed ' + JSON.stringify(r.report));
      var c = DI.prepare(p, { partUnits: 'in', origin: 'center' }), cb = DI.bounds(c.entities);
      near(cb[0], -5, 1e-9, 'centred x'); near(cb[1], -3, 1e-9, 'centred y');
      var asIn = DI.prepare(p, { partUnits: 'in', units: 'in' });
      near(DI.bounds(asIn.entities)[2], 254, 1e-9, 'read as inches');
      var mmPart = DI.prepare(p, { partUnits: 'mm' });
      near(DI.bounds(mmPart.entities)[2], 254, 1e-9, 'mm part'); assert(mmPart.report.gaps === 1, 'mm part: 0.01 mm gap closes (Merge 0.01 mm)');
    });
    test('rfJL: an open SPLINE edge 0.0008 short of the outline is joined to it; the flat is one closed profile', function () {
      var t = rfJLDxf(1, [].concat(rfJLLine([0, 0], [6, 0]), rfJLLine([6, 0], [6, 2]), rfJLSpline([[6, 2], [5, 3], [1, 3], [0, 2.0008]], [0, 0, 0, 0, 1, 1, 1, 1]), rfJLLine([0, 2], [0, 0])));
      var p = DI.parse(t), r = DI.prepare(p, { partUnits: 'in' });
      assert(r.entities.some(function (e) { return e.t === 'spline'; }), 'SPLINE as a spline: ' + r.entities.map(function (e) { return e.t; }));
      var loops = rfJLLoops(r.entities);
      assert(loops.length === 1 && !loops[0].hole && r.report.gaps === 1, 'closed: ' + loops.length + ' ' + JSON.stringify(r.report.gaps));
    });
  })();
