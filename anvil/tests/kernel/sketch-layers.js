  // --- sketch-layers: layer table, ETCH / BEND out of profiles, DXF layers, script round trip ---
  group('sketch-layers: noProfile layers leave profiles, DXF layers and colours, script round trip');
  (function () {
    function lyrSketch() {
      return { entities: [{ t: 'rect', x: 0, y: 0, w: 40, h: 20 }, { t: 'circle', cx: 20, cy: 10, r: 5, layer: 'ETCH' }, { t: 'line', x1: 5, y1: 2, x2: 35, y2: 2, layer: 'BEND' }],
        layers: [{ name: 'ETCH', color: '#1e9e3c', aci: 3, noProfile: true }, { name: 'BEND', color: '#c77700', aci: 30, noProfile: true, lineType: 'dashed' }] };
    }
    test('sketch-layers: an entity on a noProfile layer (ETCH) makes no loop; on the default or an ordinary layer it does', function () {
      var s = lyrSketch(), p = K.sketchProfile(s);
      assert(p.loops.length === 1 && !p.loops[0].hole, 'one loop: ' + p.loops.length);
      assert(!p.warnings.length, 'no open-contour warning for the BEND line: ' + p.warnings.join(' '));
      s.layers[0].noProfile = false;
      var q = K.sketchProfile(s);
      assert(q.loops.length === 2 && q.loops.filter(function (l) { return l.hole; }).length === 1, 'ETCH as an ordinary layer: a hole');
      delete s.entities[1].layer;
      assert(K.sketchProfile(s).loops.length === 2, 'default layer: a hole');
      s.entities[1].layer = 'GONE';
      assert(K.sketchProfile(s).loops.length === 2 && !K.sketchLayer(s, s.entities[1]), 'a layer missing from the table is the default');
      return 'ok';
    });
    test('sketch-layers: Extruded Boss of a rectangle with an ETCH circle is the full block (40 × 20 × 10 = 8000); script round trip keeps the layer table and the layers', function () {
      var code = 'p.sketch("Front").rect(0, 0, 40, 20).circle(20, 10, 5).line(5, 2, 35, 2)' +
        '.layers([{ name: "ETCH", color: "#1e9e3c", aci: 3, noProfile: true }, { name: "BEND", color: "#c77700", noProfile: true, lineType: "dashed" }])' +
        '.layer("ETCH", [1]).layer("BEND", [2]).extrude(10);';
      var r = build(code);
      assert(!Object.keys(r.errors).length, 'errors ' + JSON.stringify(r.errors));
      nearRel(r.mp.volume, 8000, 1e-9, 'volume');
      var gen = K.generateScript(r.model);
      assert(/\.layers\(\[/.test(gen) && gen.indexOf('.layer("ETCH", [1])') > 0 && gen.indexOf('.layer("BEND", [2])') > 0, 'script: ' + gen);
      var m2 = K.newModel('T2');
      K.runScript(m2, gen);
      var s1 = r.model.features[0], s2 = m2.features[0];
      assert(JSON.stringify(s2.layers) === JSON.stringify(s1.layers), 'layers ' + JSON.stringify(s2.layers));
      assert(s2.entities[1].layer === 'ETCH' && s2.entities[2].layer === 'BEND' && s2.entities[0].layer == null, 'entity layers');
      nearRel(K.massProps(K.meshFromBody(K.rebuild(m2).body), 1).volume, 8000, 1e-9, 'round-trip volume');
      return 'ok';
    });
    test('sketch-layers: sketch DXF (R12 and R2000) puts the circle on ETCH (colour 3) and the bend line on BEND (colour 30, DASHED line type); the rectangle stays on OUTLINE; a hidden layer is written off (negative colour)', function () {
      var s = lyrSketch();
      ['R12', 'R2000'].forEach(function (v) {
        var dxf = K.exportDXFSketch(s, 'mm', { version: v }), ents = sketchDxfEnts(dxf);
        var c = ents.filter(function (e) { return e.t === 'CIRCLE'; })[0], ln = ents.filter(function (e) { return e.t === 'LINE'; });
        assert(c && c['8'] === 'ETCH', v + ' circle on ETCH: ' + JSON.stringify(c));
        assert(ln.length === 5 && ln.filter(function (e) { return e['8'] === 'OUTLINE'; }).length === 4 && ln.filter(function (e) { return e['8'] === 'BEND'; }).length === 1, v + ' lines ' + JSON.stringify(ln.map(function (e) { return e['8']; })));
        assert(/\n2\nETCH\n70\n0\n62\n3\n6\n(CONTINUOUS|Continuous)\n/.test(dxf), v + ' ETCH layer record colour 3');
        assert(/\n2\nBEND\n70\n0\n62\n30\n6\nDASHED\n/.test(dxf), v + ' BEND layer record colour 30 DASHED');
        assert(/\nLTYPE\n[\s\S]*?\n2\nDASHED\n70\n0\n3\n[^\n]*\n72\n65\n73\n2\n40\n0\.75\n49\n0\.5\n/.test(dxf), v + ' DASHED line type');
        assert(/\$ACADVER\n1\n/.test(dxf) && (v === 'R12' ? /AC1009/ : /AC1015/).test(dxf), v + ' version');
      });
      s.layers[0].hidden = true;
      assert(/\n2\nETCH\n70\n0\n62\n-3\n/.test(K.exportDXFSketch(s, 'mm')), 'hidden layer off');
      var plain = K.exportDXFSketch({ entities: [{ t: 'circle', cx: 0, cy: 0, r: 1 }] }, 'mm');
      assert(plain.indexOf('DASHED') < 0 && plain.indexOf('ETCH') < 0, 'no layer table changes without layers');
      assert(K.dxfNearestAci('#1e9e3c') === 3 && K.dxfNearestAci('#d9302c') === 1 && K.dxfNearestAci('#2050d0') === 5 && K.dxfNearestAci('#808080') === 8, 'nearest ACI');
      return 'ok';
    });
    test('sketch-layers: mirror and trim keep an entity\'s layer', function () {
      var m = K.mirrorEntity({ t: 'line', x1: 1, y1: 0, x2: 2, y2: 3, layer: 'ETCH' }, K.mirrorAxis('y', []));
      assert(m && m.layer === 'ETCH', 'mirror ' + JSON.stringify(m));
      var ents = K.trimEntity([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0, layer: 'ETCH' }, { t: 'line', x1: 3, y1: -1, x2: 3, y2: 1 }, { t: 'line', x1: 6, y1: -1, x2: 6, y2: 1 }], 0, [4.5, 0]);
      var pieces = ents.filter(function (e) { return e.y1 === 0 && e.y2 === 0; });
      assert(pieces.length === 2 && pieces.every(function (e) { return e.layer === 'ETCH'; }), 'trim ' + JSON.stringify(ents));
      return 'ok';
    });
  })();
  // --- end sketch-layers ---

  group('sketch-ordinate: ordinate dimensions in sketches, sketch dimension properties and arc slots on drawings');
  (function () {
    var S = typeof SketchSolver !== 'undefined' ? SketchSolver : null, DW = typeof Drawing !== 'undefined' ? Drawing : null;
    // a 100 × 50 plate with three Ø6 holes on Front: entity 0 the rectangle (edge e3 its left side, e1 its right), 1–3 the holes
    var PLATE = 'p.sketch("Front").rect(0, 0, 100, 50).circle(20, 25, 3).circle(50, 15, 3).circle(80, 35, 3)';
    function plate() { var m = K.newModel('Ord'); K.runScript(m, PLATE + '.extrude(5);'); return m; }
    function ordSet(f) { var o = S.addOrdinate(f, { zero: '0.e3', target: '1', axis: 'x', at: -10 }); ['2', '3', '0.e1'].forEach(function (t) { var q = S.addOrdinate(f, { zero: '0.e3', target: t, axis: 'x', ord: o.ord }); assert(q.ok, q.error); }); return o.ord; }
    function sheetOf(r, units) { var doc = DW.newDrawing(r.model, { date: '2026-10-07' }); DW.standard3View(doc, r.mesh, units || 'mm'); return DW.compute(doc, r.mesh, r.model, { build: r.build }); }
    test('sketch-ordinate: a horizontal ordinate set from the left edge to three holes and the right edge is 4 driving distances in one set (20, 50, 80, 100); a value moves its hole; deleting the set removes all 4', function () {
      var f = plate().features[0], ord = ordSet(f), sets = S.ordinateSets(f), set = sets[ord];
      assert(Object.keys(sets).length === 1 && set.members.length === 4 && set.axis === 'x' && set.zero === '0.e3' && set.at === -10, 'one set ' + JSON.stringify(sets));
      assert(JSON.stringify(set.members.map(function (i) { return f.rels[i].v; })) === '[20,50,80,100]', 'values ' + set.members.map(function (i) { return f.rels[i].v; }));
      assert(set.members.every(function (i) { return f.rels[i].type === 'distance' && !f.rels[i].driven; }), 'driving distances');
      assert(S.addRelation(f, 'fix', ['0.v0', '0.v2']).ok, 'fix');   // (the plate held where it is: the hole is all that can move)
      var r = S.setRelValue(f, set.members[1], 45);
      assert(r.ok, r.error);
      near(f.entities[2].cx, 45, 1e-7, 'hole 2 moved'); near(f.entities[1].cx, 20, 1e-7, 'hole 1 stayed'); near(f.entities[0].w, 100, 1e-7, 'plate stayed');
      var bad = S.addOrdinate(f, { zero: '0.e3', target: '0.e0', axis: 'x', ord: ord });
      assert(!bad.ok && /vertical line/.test(bad.error), 'a horizontal edge is refused: ' + bad.error);
      assert(!S.addOrdinate(f, { zero: '0.e0', target: '1', axis: 'x' }).ok, 'a horizontal zero is refused');
      assert(S.deleteOrdinateSet(f, ord) === 4 && !Object.keys(S.ordinateSets(f)).length, 'set deleted');
      return 'ok';
    });
    test('sketch-ordinate: a member that would over-define the sketch is made driven; deleting the zero entity takes its set with it', function () {
      var f = plate().features[0], ord = ordSet(f);
      // a second set from the same edge to hole 1: holds what the first already says (driven)
      var q = S.addOrdinate(f, { zero: '0.e3', target: '1', axis: 'x' });
      assert(q.ok && q.driven && f.rels[q.index].driven, 'driven ' + JSON.stringify(q));
      S.removeEntity(f, 0); f.entities.splice(0, 1);
      assert(!Object.keys(S.ordinateSets(f)).length, 'no set left: ' + JSON.stringify(S.ordinateSets(f)));
      void ord;
      return 'ok';
    });
    test('sketch-ordinate: Fully Define Sketch with the Ordinate scheme fully defines the plate: a horizontal and a vertical ordinate set from the origin; Baseline / Chain unchanged', function () {
      var f = plate().features[0];
      var r = S.fullyDefine(f, { hScheme: 'ordinate', vScheme: 'ordinate' }), sets = S.ordinateSets(f), ids = Object.keys(sets);
      assert(r.status === 'full' && r.dof === 0, 'fully defined ' + r.status + ' ' + r.dof);
      assert(ids.length === 2 && ids.some(function (k) { return sets[k].axis === 'x'; }) && ids.some(function (k) { return sets[k].axis === 'y'; }), 'two sets ' + JSON.stringify(sets));
      ids.forEach(function (k) { assert(sets[k].zero === 'O' && sets[k].members.length >= 3 && sets[k].at < 0, 'set ' + k + ' ' + JSON.stringify(sets[k])); });
      var g = plate().features[0], b = S.fullyDefine(g, { hScheme: 'baseline', vScheme: 'chain' });
      assert(b.status === 'full' && !Object.keys(S.ordinateSets(g)).length, 'baseline / chain make no ordinate sets');
      return ids.map(function (k) { return sets[k].axis + ' ' + sets[k].members.length; }).join(', ');
    });
    test('sketch-ordinate: the script keeps the set (.ordinate after the .rel lines) and rebuilds it', function () {
      var m = plate(), ord = ordSet(m.features[0]), gen = K.generateScript(m);
      assert(/\.ordinate\(\[\[0,\{"ord":"o1","ordAxis":"x","ordAt":-10\}\]/.test(gen), 'script ' + gen);
      var m2 = K.newModel('T2');
      K.runScript(m2, gen);
      var s2 = S.ordinateSets(m2.features[0]);
      assert(s2[ord] && s2[ord].members.length === 4 && s2[ord].at === -10, 'round trip ' + JSON.stringify(s2));
      return 'ok';
    });
    test('sketch-ordinate: model items bring the sketch ordinate set onto the Front view as an ordinate dimension "0, 20, 50, 80, 100" (drawn: a 0 and every value)', function () {
      var m = plate();
      ordSet(m.features[0]);
      var b = K.rebuild(m), r = { model: m, build: b, mesh: K.meshFromBody(b.body) }, sh = sheetOf(r);
      var od = sh.dims.filter(function (d) { return d.kind === 'ordinate'; });
      assert(od.length === 1 && od[0].text === '0, 20, 50, 80, 100' && od[0].auto && od[0].dir === 'h', 'ordinate ' + sh.dims.map(function (d) { return d.kind + ' ' + d.text; }).join(' | '));
      var front = sh.views.filter(function (w) { return w.view.orient === 'Front'; })[0];
      assert(od[0].view === front.view.id && od[0].side === -1, 'on Front, below (where the sketch set stands): view ' + od[0].view + ' side ' + od[0].side);
      var t = sh.prims.filter(function (p) { return p.k === 'text' && p.layer === 'DIMENSIONS'; }).map(function (p) { return p.text; });
      ['0', '20', '50', '80', '100'].forEach(function (x) { assert(t.indexOf(x) >= 0, 'drawn ' + x + ': ' + t.join(' ')); });
      return od[0].text;
    });
    test('sketch-ordinate: a model item carries its sketch dimension\'s properties — 2X, ±.005 and 3 places (inch) on the sheet, the SVG and the DXF; a drawing Dimension PM setting still wins', function () {
      var code = 'p.units("in");\np.sketch("Front").rect(0, 0, 4, 2).circle(1, 1, 0.133).circle(3, 1, 0.133).dim(1, "dia").dimProps([[0, { tol: { type: "symmetric", plus: 0.005, minus: 0.005 }, prec: 3, prefix: "2X", name: "HOLE" }]]).extrude(0.25);';
      var r = build(code);
      noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-10-07' }); DW.standard3View(doc, r.mesh, 'in');
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), d = sh.dims.filter(function (x) { return x.kind === 'dia'; })[0];
      assert(d && d.text === '2X Ø.266 ±.005' && d.sketchName === 'HOLE@Sketch1', 'dia ' + (d && d.text) + ' ' + (d && d.sketchName));
      assert(sh.dims.every(function (x) { return !/2X 2X/.test(x.text); }), 'no doubled count');
      var svg = DW.toSVG(sh), dxf = DW.toDXF(sh);
      assert(svg.indexOf('2X Ø.266 ±.005') >= 0, 'SVG text');
      assert(/2X (Ø|%%[cC])\.266 (±|%%[pP])\.005/.test(dxf), 'DXF text ' + (dxf.match(/2X[^\n]*/) || [''])[0]);
      // MIN, Basic, a driven dimension in parentheses
      var r2 = build('p.units("in");\np.sketch("Front").rect(0, 0, 4, 2).circle(2, 1, 0.25).dim(1, "dia").dimProps([[0, { tol: { type: "min" }, suffix: "TYP" }]]).extrude(0.25);');
      var t2 = DW.compute((function () { var q = DW.newDrawing(r2.model, {}); DW.standard3View(q, r2.mesh, 'in'); return q; })(), r2.mesh, r2.model, { build: r2.build }).dims.map(function (x) { return x.text; });
      assert(t2.indexOf('Ø.500 MIN TYP') >= 0, 'MIN, TYP ' + t2.join(' | '));
      doc.dimProps = {}; doc.dimProps[d.style] = { prec: 2 };
      var d2 = DW.compute(doc, r.mesh, r.model, { build: r.build }).dims.filter(function (x) { return x.kind === 'dia'; })[0];
      assert(d2.text === '2X Ø.27 ±.01', 'drawing PM precision wins: ' + d2.text);
      return d.text;
    });
    test('sketch-ordinate: arc slot callout — R30 ARC SLOT 8 WIDE 120° (centre-line radius, width, angle between the caps), its caps and sides get no radius; inch: R1.500 ARC SLOT .375 WIDE 60°', function () {
      var r = build('p.box(120, 80, 5);\np.sketch("Top", 5).arcSlot(60, -40, 30, 30, 150, 8).cut("through", { reverse: true });');
      noErrors(r);
      var t = sheetOf(r).dims.map(function (d) { return d.text; });
      assert(t.indexOf('R30 ARC SLOT 8 WIDE 120°') >= 0 && !t.some(function (x) { return /^(\d+X )?R(34|26|4)$/.test(x); }), 'mm ' + t.join(' | '));
      var ri = build('p.units("in");\np.box(5, 4, 0.25);\np.sketch("Top", 0.25).arcSlot(2.5, -2.5, 1.5, 60, 120, 0.375).cut("through", { reverse: true });');
      noErrors(ri);
      var sh = sheetOf(ri, 'in'), ti = sh.dims.map(function (d) { return d.text; }), sd = sh.dims.filter(function (d) { return d.slot && d.slot.arc; })[0];
      assert(ti.indexOf('R1.500 ARC SLOT .375 WIDE 60°') >= 0, 'inch ' + ti.join(' | '));
      near(sd.r, 0.1875, 1e-9, 'leader on an end cap');
      assert(sh.prims.some(function (p) { return p.k === 'text' && p.text === 'R1.500 ARC SLOT .375 WIDE 60°'; }), 'drawn');
      sd.prec = 2;
      assert(DW.dimLabel(sd, 'in').text === 'R1.50 ARC SLOT .38 WIDE 60°', 'precision ' + DW.dimLabel(sd, 'in').text);
      return ti.join(' | ');
    });
  })();
  // --- end sketch-ordinate ---
