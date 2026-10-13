  // ------------------------------------------------------------------ rfS: drawing Smart Dimension from picks
  (function () {
    var DW = Drawing;
    var PLATE = AnvilExamples.filter(function (e) { return e.name === 'Plate with bolt holes'; })[0].code;
    function rfSDoc(code) {
      var r = build(code || PLATE);
      noErrors(r);
      r.doc = DW.newDrawing(r.model, { date: '2026-10-12' });
      DW.standard3View(r.doc, r.mesh, r.model.units);
      r.recompute = function () { r.sheet = DW.compute(r.doc, r.mesh, r.model, { build: r.build }); return r.sheet; };
      r.recompute();
      r.view = function (orient) { return r.sheet.views.filter(function (w) { return w.view.orient === orient; })[0]; };
      return r;
    }
    function rfSUser(r, viewId) { return r.sheet.dims.filter(function (d) { return d.view === viewId && d.index != null; }); }
    // the Top view of the 100 x 60 plate: u = x in [0, 100], v = -z in [-60, 0]; holes Ø8 at (10 | 90, -10 | -50)
    var C1 = { c: [10, -10], r: 4 }, C2 = { c: [90, -10], r: 4 }, LEFT = [[0, 0], [0, -60]], RIGHT = [[100, 0], [100, -60]], TOP = [[0, 0], [100, 0]], BOT = [[0, -60], [100, -60]];
    test('rfS: Smart Dimension picks: edge length, hole centre to edge, hole to hole (centre, min, max), parallel edges, point to point by the pointer\'s quadrant', function () {
      var S = DW.smartDim, out = [];
      function chk(d, kind, v, what) { assert(d && d.kind === kind, what + ': kind ' + (d && d.kind)); near(d.value, v, 1e-9, what); out.push(what + ' ' + d.kind + ' ' + d.value); }
      chk(S({ edge: TOP }, null, [50, 10]), 'h', 100, 'edge length');
      chk(S({ edge: LEFT }, null, [-10, -30]), 'v', 60, 'vertical edge');
      chk(S({ center: C1 }, { edge: LEFT }, [5, 10]), 'h', 10, 'centre to left edge');
      chk(S({ edge: TOP }, { circle: C1 }, [-10, -5]), 'v', 10, 'top edge to hole (centre)');
      chk(S({ circle: C1 }, { circle: C2 }, [50, 10]), 'h', 80, 'hole to hole');
      chk(S({ circle: C1 }, { circle: C2 }, [50, 10], { minmax: 'min' }), 'h', 72, 'hole to hole, min');
      chk(S({ circle: C1 }, { circle: C2 }, [50, 10], { minmax: 'max' }), 'h', 88, 'hole to hole, max');
      chk(S({ circle: C1 }, { edge: LEFT }, [5, 10], { minmax: 'min' }), 'h', 6, 'hole edge to left edge, min');
      chk(S({ edge: TOP }, { edge: BOT }, [110, -30]), 'v', 60, 'parallel edges');
      chk(S({ edge: LEFT }, { edge: RIGHT }, [50, 10]), 'h', 100, 'parallel vertical edges');
      chk(S({ point: [0, 0] }, { point: [100, -60] }, [50, 10]), 'h', 100, 'corners, pointer above');
      chk(S({ point: [0, 0] }, { point: [100, -60] }, [110, -30]), 'v', 60, 'corners, pointer beside');
      chk(S({ point: [0, 0] }, { point: [100, -60] }, [60, -20]), 'aligned', Math.hypot(100, 60), 'corners, pointer between');
      chk(S({ center: C1 }, { center: { c: [90, -50], r: 4 } }, [50, -20]), 'aligned', Math.hypot(80, 40), 'diagonal hole centres');
      chk(S({ circle: C1 }, null, [30, 10], { scale: 2 }), 'dia', 8, 'circle');
      assert(S({ point: [0, 0] }, null, [5, 5]) === null, 'a point alone makes no dimension');
      // the dimension line goes through the pointer
      var h = S({ edge: TOP }, null, [50, 12]);
      assert(h.at === 12 && h.side === 1, 'h at the pointer ' + h.at);
      return out.join('; ');
    });
    test('rfS: an angle between two edges in the pointer\'s quadrant (45° / 135°), drawn with an arc, arrows and its text on the sheet; DXF has the arc', function () {
      var c = rfSDoc('p.box(40, 20, 10); p.chamfer(2, [[20, 10, 20]]);'), R = c.view('Right');
      var ch = R.proj.lines.visible.filter(function (l) { return Math.abs(Math.abs(l[2] - l[0]) - 2) < 1e-9 && Math.abs(Math.abs(l[3] - l[1]) - 2) < 1e-9; })[0];
      var lead = R.proj.lines.visible.filter(function (l) { return Math.abs(l[1] - 10) < 1e-9 && Math.abs(l[3] - 10) < 1e-9; })[0];
      assert(ch && lead, 'chamfer / lead-in edges');
      var e1 = { edge: [[ch[0], ch[1]], [ch[2], ch[3]]] }, e2 = { edge: [[lead[0], lead[1]], [lead[2], lead[3]]] };
      var d0 = DW.smartDim(e1, e2, null);
      var V = d0.c, mids = [[(ch[0] + ch[2]) / 2, (ch[1] + ch[3]) / 2], [(lead[0] + lead[2]) / 2, (lead[1] + lead[3]) / 2]];
      // the pointer between the two edges as drawn (inside the part's corner): 135°; between the chamfer line's
      // extension past the vertex and the lead-in edge: the acute 45°
      var inside = [(mids[0][0] + mids[1][0]) / 2, (mids[0][1] + mids[1][1]) / 2];
      var other = DW.smartDim(e1, e2, inside), acute = DW.smartDim(e1, e2, [V[0] - (mids[0][0] - V[0]) + (mids[1][0] - V[0]) * 0.5, V[1] - (mids[0][1] - V[1]) + (mids[1][1] - V[1]) * 0.5]);
      near(acute.value, 45, 1e-9, 'acute'); near(other.value, 135, 1e-9, 'obtuse');
      var v = DW.findView(c.doc, R.view.id); v.dims = (v.dims || []).concat([acute]);
      c.recompute();
      var sd = rfSUser(c, R.view.id).filter(function (d) { return d.kind === 'angle'; })[0];
      assert(sd && sd.text === '45°', 'sheet text ' + (sd && sd.text));
      assert(sd.box && isFinite(sd.box.x0) && sd.arrows.length === 2, 'box and arrows');
      var arcs = c.sheet.prims.filter(function (p) { return p.layer === 'DIMENSIONS' && p.k === 'arc' && p.view === R.view.id; });
      assert(arcs.length === 1 && Math.abs(((arcs[0].a1 - arcs[0].a0) % 360 + 360) % 360 - 45) < 1e-6, 'one 45° arc');
      assert(c.sheet.prims.some(function (p) { return p.layer === 'DIMENSIONS' && p.k === 'text' && p.text === '45°'; }), 'text drawn');
      var dxf = DW.toDXF(c.sheet, { version: 'R2000' });
      assert(/\nARC\n/.test(dxf) && dxf.indexOf('45') >= 0, 'DXF has the arc');
      // precision from the Dimension PM: 45.0°
      v.dims[v.dims.length - 1].prec = 1; c.recompute();
      sd = rfSUser(c, R.view.id).filter(function (d) { return d.kind === 'angle'; })[0];
      assert(sd.text === '45.0°', 'precision ' + sd.text);
      return sd.text + ' / ' + other.value;
    });
    test('rfS: two-pick dimensions stay attached: through a rebuild they measure again (hole centre to the right edge 10 -> 30 when the plate widens to 120); a removed reference dangles', function () {
      var r = rfSDoc(), T = r.view('Top');
      var d1 = DW.addSmartDim(r.doc, T.view.id, { center: C2 }, { edge: RIGHT }, [95, 10], { scale: T.scale });
      var d2 = DW.addSmartDim(r.doc, T.view.id, { circle: C1 }, { circle: C2 }, [50, 12], { scale: T.scale });
      near(d1.value, 10, 1e-9, 'before'); near(d2.value, 80, 1e-9, 'hole to hole');
      r.recompute();
      var u = rfSUser(r, T.view.id);
      assert(u.length === 2 && u[0].text === '10' && u[1].text === '80' && !u[0].dangling, 'texts ' + u.map(function (d) { return d.text; }));
      r.model.features.filter(function (f) { return f.type === 'sketch'; })[0].entities[0].w = 120;
      var b = K.rebuild(r.model); r.mesh = K.meshFromBody(b.body); r.build = b; r.recompute();
      u = rfSUser(r, T.view.id);
      assert(u[0].text === '30' && !u[0].dangling, 'after the change ' + u[0].text);
      assert(u[1].text === '80', 'hole to hole stays ' + u[1].text);
      // the dimension line still goes through where it was placed (view model units)
      var hz = r.sheet.prims.filter(function (p) { return p.layer === 'DIMENSIONS' && p.k === 'text' && p.text === '30'; })[0];
      assert(hz, '30 drawn');
      return u.map(function (d) { return d.text; }).join(', ');
    });
  })();
  // --- end rfS ---

