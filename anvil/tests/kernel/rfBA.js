  // --- rfBA ---
  // (2026-10-13) older sketch leftovers: Stencil text cut through keeps every island attached (guard), the sketches'
  // angular dimensions (angle, Angular Running, Chamfer) as Model Items with their properties, and every other sketch
  // dimension kind (entity Smart Dimension, point to point, to the origin, to a converted model edge) carrying its
  // tolerance / precision / text onto the drawing
  (function () {
    var S = window.SketchSolver, DW = typeof Drawing !== 'undefined' ? Drawing : null;
    group('rfBA: stencil text islands, sketch dimension properties on drawings');
    // the number of separate solid pieces of a mesh (triangles sharing a vertex are one piece)
    function rfBAPieces(mesh) {
      var P = mesh.positions64 || mesh.positions, n = P.length / 9, par = [], ids = {};
      function find(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
      for (var t = 0; t < n; t++) par[t] = t;
      for (var t2 = 0; t2 < n; t2++) for (var v = 0; v < 3; v++) {
        var o = t2 * 9 + v * 3, key = Math.round(P[o] * 1e5) + ',' + Math.round(P[o + 1] * 1e5) + ',' + Math.round(P[o + 2] * 1e5);
        if (ids[key] == null) ids[key] = t2; else { var a = find(ids[key]), b = find(t2); if (a !== b) par[a] = b; }
      }
      var roots = {};
      for (var t3 = 0; t3 < n; t3++) roots[find(t3)] = 1;
      return Object.keys(roots).length;
    }
    test('rfBA: Stencil "ABD08" (h 10, stroke 0.6, bridge 0.8) cut through a 70 × 20 × 2 plate leaves one piece (every island of A, B, D, 0, 8 tied to the plate), the plain text leaves 7 loose islands; 7 bridges, each 0.8 wide; the sketch DXF is the bridged outlines (no closed loop inside another)', function () {
      var TXT = '.text(5, 5, "ABD08", { h: 10, mode: "outline", strokeWidth: 0.6';
      var base = 'p.sketch("Front").rect(0, 0, 70, 20).extrude(2);\np.sketch("Front", 2)';
      var st = build(base + TXT + ', stencil: true, bridge: 0.8 }).cut("through", { reverse: true });');
      var pl = build(base + TXT + ' }).cut("through", { reverse: true });');
      noErrors(st); noErrors(pl);
      var nS = rfBAPieces(st.mesh), nP = rfBAPieces(pl.mesh);
      assert(nS === 1, 'stencil: one piece, got ' + nS);
      assert(nP === 8, 'plain text: the plate and 7 islands, got ' + nP);
      var e = st.model.features[2].entities[0], br = K.textOutline(e).bridges;
      assert(br.length === 7, '7 bridges: ' + br.length);
      br.forEach(function (q, i) {
        var w = Math.min(Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1]));
        near(w, 0.8, 1e-9, 'bridge ' + i + ' width');
      });
      var prof = K.sketchProfile(st.model.features[2]);
      assert(prof.loops.length > 0 && !prof.loops.some(function (l) { return l.hole || l.cross; }), 'no island loop in the profile');
      var dxf = K.exportDXFSketch(st.model.features[2], 'mm'), polys = (dxf.match(/\nPOLYLINE\r?\n|\nLWPOLYLINE\r?\n/g) || []).length;
      var g = K.textDxf(e);
      assert(g.polys && g.polys.length === prof.loops.length && polys >= g.polys.length, 'DXF: one closed polyline per bridged loop (' + g.polys.length + ' / ' + prof.loops.length + ', ' + polys + ' in the file)');
      // no DXF loop lies inside another (an island would)
      var boxes = g.polys.map(function (p) { var b = [Infinity, Infinity, -Infinity, -Infinity]; p.pts.forEach(function (q) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); }); return b; });
      g.polys.forEach(function (p, i) {
        g.polys.forEach(function (q, j) {
          if (i === j || boxes[j][0] < boxes[i][0] || boxes[j][2] > boxes[i][2] || boxes[j][1] < boxes[i][1] || boxes[j][3] > boxes[i][3]) return;
          assert(!K.pointInPoly || !K.pointInPoly(q.pts[0], p.pts), 'DXF loop ' + j + ' inside loop ' + i);
        });
      });
      return nS + ' piece (plain ' + nP + '), ' + br.length + ' bridges, ' + g.polys.length + ' DXF loops';
    });
    // a 4 × 2 inch plate at (1, 1) with a 45° chamfer on its top right corner, a hole; the sketch's dimensions of every
    // kind, each with its own properties
    function rfBADrawing() {
      var r = build('p.units("in");\np.sketch("Front").line(1, 1, 5, 1).line(5, 1, 5, 2.5).line(5, 2.5, 4.5, 3).line(4.5, 3, 1, 3).line(1, 3, 1, 1).circle(2, 2, 0.125)' +
        '.line(0, 1, 6, 1).extrude(0.25);');
      noErrors(r);
      var f = r.model.features[0];
      f.entities[6].construction = true; f.entities[6].ext = true;   // a model edge brought into the sketch (Convert / Add Relations)
      function ok(x, what) { assert(x && x.ok !== false, what + ': ' + JSON.stringify(x)); return x; }
      ok(S.addRelation(f, 'fix', ['6']), 'fix the model edge');
      var n0 = (f.rels || []).length;
      ok(S.addChamferDim(f, '2', '1'), 'chamfer dimension');
      ok(S.addRelation(f, 'angle', ['3', '2']), 'angle');
      ok(S.addRunningAngle(f, { vertex: '0.p1', datum: '0.p2', target: '2.p2', off: 1 }), 'running angle');
      ok(S.addRelation(f, 'distance', ['O', '5'], { dir: 'h' }), 'origin to the hole, horizontal');
      ok(S.addRelation(f, 'distance', ['6', '5']), 'model edge to the hole');
      var R = f.rels;
      R[n0].prec = 3; R[n0].prefix = '2X';                                                          // chamfer: 2X .500 X 45°
      R[n0 + 1].tol = { type: 'symmetric', plus: 0.5 }; R[n0 + 1].prec = 1; R[n0 + 1].name = 'BEVEL';   // angle
      R[n0 + 2].suffix = 'REF';                                                                     // running angle
      R[n0 + 3].prec = 2; R[n0 + 3].name = 'HOLE_X';                                                // origin
      R[n0 + 4].tol = { type: 'bilateral', plus: 0.005, minus: 0 }; R[n0 + 4].prec = 3;            // model edge
      f.dims = [{ e: 3, k: 'len', prec: 2, suffix: 'TYP' }];                                        // an entity Smart Dimension
      var b = K.rebuild(r.model), mesh = K.meshFromBody(b.body);
      var doc = DW.newDrawing(r.model, { date: '2026-10-13' }); DW.standard3View(doc, mesh, 'in');
      doc.modelItems = { source: 'entire', marked: true, holeLocations: false, holeCallouts: true, annotations: false, dedupe: true };
      var sheet = DW.compute(doc, mesh, r.model, { build: b });
      return { r: r, f: f, n0: n0, doc: doc, sheet: sheet, mesh: mesh, build: b };
    }
    test('rfBA: Model Items brings the sketch\'s Chamfer Dimension ("2X .500 X 45°"), angle ("45.0° ±0.5°", BEVEL@Sketch1) and Angular Running value ("… REF") onto the Front view with their properties, drawn (arc / leader) and in the DXF; a Path Length dimension comes as the drawing\'s Path Length (rfDD)', function () {
      if (!DW || !S || !S.addChamferDim) return 'no drawing engine / solver';
      var x = rfBADrawing(), dims = x.sheet.dims, front = x.sheet.views.filter(function (w) { return w.view.orient === 'Front'; })[0];
      function bySrc(i) { return dims.filter(function (d) { return d.relSrc && d.relSrc.i === x.n0 + i; })[0]; }
      var ch = bySrc(0), an = bySrc(1), ru = bySrc(2);
      assert(ch && ch.kind === 'chamfer' && ch.view === front.view.id && ch.text === '2X .500 X 45°', 'chamfer ' + JSON.stringify(ch && [ch.kind, ch.text]) + ' | ' + dims.map(function (d) { return d.kind + ' ' + d.text; }).join(' | '));
      assert(an && an.kind === 'angle' && an.text === '45.0° ±0.5°' && an.sketchName === 'BEVEL@Sketch1', 'angle ' + JSON.stringify(an && [an.text, an.sketchName, an.value]));
      var ra = Math.atan2(2, 3.5) * 180 / Math.PI;
      assert(ru && ru.kind === 'angle' && Math.abs(ru.value - ra) < 1e-6 && / REF$/.test(ru.text), 'running ' + JSON.stringify(ru && [ru.text, ru.value]));
      assert(x.sheet.prims.some(function (p) { return p.k === 'arc' && p.layer === 'DIMENSIONS'; }) && x.sheet.prims.some(function (p) { return p.k === 'text' && p.text === '2X .500 X 45°'; }), 'drawn');
      var dxf = DW.toDXF(x.sheet);
      assert(dxf.indexOf('2X .500 X 45%%d') >= 0 && dxf.indexOf('45.0%%d %%p0.5%%d') >= 0, 'DXF texts');
      // (rfDD) a path length dimension comes as the drawing's Path Length (4 + 1.5 along lines 0 and 1); Mark for
      // drawing off keeps the angle off
      x.f.rels[x.n0 + 1].mark = false;
      S.addPathLength(x.f, ['0', '1']);
      var sh2 = DW.compute(x.doc, x.mesh, x.r.model, { build: x.build });
      assert(!sh2.dims.some(function (d) { return d.relSrc && d.relSrc.i === x.n0 + 1; }), 'unmarked angle left out');
      var pl = sh2.dims.filter(function (d) { return d.relSrc && x.f.rels[d.relSrc.i].type === 'pathlength'; })[0];
      assert(pl && pl.kind === 'pathlen' && Math.abs(pl.value - 5.5) < 1e-9, 'path length as a drawing pathlen model item: ' + JSON.stringify(pl && [pl.kind, pl.value, pl.text]));
      return dims.filter(function (d) { return d.sketchAng; }).map(function (d) { return d.text; }).join(' | ');
    });
    test('rfBA: every other sketch dimension kind carries its properties onto the drawing: an entity Smart Dimension (3.50 TYP, by its own key), the origin to a hole (HOLE_X, 2.00), a converted model edge to the hole (1.000 +.005/-.000)', function () {
      if (!DW || !S || !S.addChamferDim) return 'no drawing engine / solver';
      var x = rfBADrawing(), dims = x.sheet.dims;
      var en = dims.filter(function (d) { return d.sketchDim === x.f.id + ':0'; })[0];
      assert(en && en.text === '3.50 TYP' && en.sketchName === 'D1@Sketch1', 'entity dimension ' + JSON.stringify(en && [en.text, en.sketchName]) + ' | ' + dims.map(function (d) { return d.kind + ' ' + d.text; }).join(' | '));
      var og = dims.filter(function (d) { return d.relSrc && d.relSrc.i === x.n0 + 3; })[0];
      assert(og && og.text === '2.00' && og.sketchName === 'HOLE_X@Sketch1', 'origin ' + JSON.stringify(og && [og.text, og.sketchName, og.value]));
      var me = dims.filter(function (d) { return d.relSrc && d.relSrc.i === x.n0 + 4; })[0];
      assert(me && me.text === '1.000 +.005/-.000', 'model edge ' + JSON.stringify(me && [me.text, me.value]));
      return [en.text, og.text, me.text].join(' | ');
    });
  })();
  // --- end rfBA ---
