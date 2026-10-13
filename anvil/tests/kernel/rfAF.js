  // ------------------------------------------------------------------ rfAF: exploded slots on drawings, script arc slots
  (function () {
    group('rfAF: slots drawn as lines and arcs keep their Smart Dimensions\' tolerance / precision / 2X on the SLOT / ARC SLOT callout; a script arc slot explodes on Trim');
    if (typeof Drawing === 'undefined' || typeof SketchSolver === 'undefined') return;
    var DW = Drawing, SS = SketchSolver;
    // rfJ's inch plate: an arc slot (R .6, width +.003/-.000) and two straight slots (width ±.005, overall length 2X,
    // two places) cut through; explode: the slots made into what the Slot tools draw (sides, arcs, construction centre)
    function rfAFPlate(explode) {
      var m = K.newModel('rfAF');
      K.runScript(m, 'p.units("in");\np.sketch("Front").rect(0, 0, 4, 2).extrude(0.25);\n' +
        'p.sketch("Front", 0.25).arcSlot(2, 1, 0.6, 210, 330, 0.25).dim(0, "r").dim(0, "w").dimProps([[1, { tol: { type: "bilateral", plus: 0.003, minus: 0 } }]]).cut("through", { reverse: true });\n' +
        'p.sketch("Front", 0.25).slot(0.5, 1.6, 1.5, 1.6, 0.25).slot(2.5, 1.6, 3.5, 1.6, 0.25).dim(0, "w").dim(0, "olen").dimProps([[0, { tol: { type: "symmetric", plus: 0.005 } }], [1, { prefix: "2X", prec: 2 }]]).cut("through", { reverse: true });');
      if (explode) {
        var sk = m.features.filter(function (f) { return f.type === 'sketch'; });
        assert(SS.explodeSlot(sk[1], 0) === 0, 'arc slot exploded');
        assert(SS.explodeSlot(sk[2], 0) === 0 && SS.explodeSlot(sk[2], 5) === 5, 'slots exploded');
      }
      var b = K.rebuild(m), mesh = K.meshFromBody(b.body), doc = DW.newDrawing(m, { date: '2026-10-12' });
      DW.standard3View(doc, mesh, 'in');
      return { model: m, build: b, mesh: mesh, doc: doc, sheet: DW.compute(doc, mesh, m, { build: b }) };
    }
    var SLOT = '2X .250 ±.005 X 1.25 SLOT', ASLOT = 'R.600 ARC SLOT .250 +.003/-.000 WIDE 120°';
    test('rfAF: exploded slots — the width and overall length dimensions become distance relations that keep their tolerance / 2X / precision, and the drawing\'s callouts read ' + SLOT + ' and ' + ASLOT + ' as for the whole slot entities', function () {
      var w = rfAFPlate(false), x = rfAFPlate(true);
      noErrors({ errors: x.build.errors });
      nearRel(K.massProps(x.mesh, 1).volume, K.massProps(w.mesh, 1).volume, 1e-6, 'same part');
      var sk = x.model.features.filter(function (f) { return f.type === 'sketch'; }), r2 = sk[2].rels.filter(function (r) { return r.type === 'distance'; });
      assert(sk[2].entities.filter(function (e) { return e.t === 'slot'; }).length === 0 && sk[1].entities.every(function (e) { return e.t !== 'aslot'; }), 'no slot entities left');
      var wr = r2.filter(function (r) { return r.tol; })[0], lr = r2.filter(function (r) { return r.prefix; })[0];
      assert(wr && wr.tol.type === 'symmetric' && wr.tol.plus === 0.005 && !wr.ac, 'width relation keeps its tolerance: ' + JSON.stringify(r2));
      assert(lr && lr.prefix === '2X' && lr.prec === 2 && lr.ac, 'overall length relation keeps 2X and precision: ' + JSON.stringify(r2));
      var ar = (sk[1].rels || []).filter(function (r) { return r.type === 'distance' && r.dir === 'r'; })[0];
      assert(ar && ar.tol && ar.tol.type === 'bilateral' && ar.tol.plus === 0.003, 'arc slot width relation keeps its tolerance: ' + JSON.stringify(ar));
      var tw = w.sheet.dims.map(function (d) { return d.text; }), tx = x.sheet.dims.map(function (d) { return d.text; });
      [SLOT, ASLOT].forEach(function (t) { assert(tw.indexOf(t) >= 0, t + ' (whole slots): ' + tw.join(' | ')); assert(tx.indexOf(t) >= 0, t + ' (exploded): ' + tx.join(' | ')); });
      var sd = x.sheet.dims.filter(function (d) { return d.text === SLOT; })[0];
      assert(sd.slot.props && sd.slot.props.w && sd.slot.props.len && /@Sketch/.test(sd.name || sd.slot.props.w.name), 'props from the sketch: ' + JSON.stringify(sd.slot.props));
      return tx.filter(function (t) { return /SLOT/.test(t); }).join(' | ');
    });
    test('rfAF: an exploded slot whose dimension props are set on the relations themselves (the Dimension PM on a tool-drawn slot) and a centerline length with TYP — the callout takes them; no props: no slotProps', function () {
      var m = K.newModel('rfAF2');
      K.runScript(m, 'p.units("in");\np.sketch("Front").rect(0, 0, 4, 2).extrude(0.25);\np.sketch("Front", 0.25).slot(1, 1, 3, 1, 0.5).cut("through", { reverse: true });');
      var f = m.features[2];
      SS.explodeSlot(f, 0);
      var b0 = K.rebuild(m), mesh0 = K.meshFromBody(b0.body), d0 = DW.newDrawing(m, {}); DW.standard3View(d0, mesh0, 'in');
      var s0 = DW.compute(d0, mesh0, m, { build: b0 }).dims.filter(function (d) { return d.slot; })[0];
      assert(s0 && s0.text === '.500 X 2.500 SLOT' && !(s0.slot.props), 'plain callout: ' + (s0 && s0.text));
      (f.rels = f.rels || []).push({ type: 'distance', refs: ['0', '2'], v: 0.5, tol: { type: 'symmetric', plus: 0.002 } });
      (f.dims = f.dims || []).push({ e: 4, k: 'len', suffix: 'TYP', prec: 1 });
      var b = K.rebuild(m), mesh = K.meshFromBody(b.body), doc = DW.newDrawing(m, {}); DW.standard3View(doc, mesh, 'in');
      var sd = DW.compute(doc, mesh, m, { build: b }).dims.filter(function (d) { return d.slot; })[0];
      assert(sd && sd.slot.props && sd.slot.props.w.tol.plus === 0.002 && sd.slot.props.len.prec === 1 && /TYP/.test(sd.slot.props.len.label), 'props: ' + JSON.stringify(sd && sd.slot.props));
      assert(/^\.500 ±\.002 X 2\.5 TYP SLOT$|±\.002/.test(sd.text), 'callout ' + sd.text);
      return sd.text;
    });
    test('rfAF: a script arc slot stays one aslot entity through the script round trip; Trim on it explodes it as Sketch Fillet does (outer / end / inner / end arcs + construction centre arc, Tangent / Coincident, R kept as the construction arc\'s), then trims the picked arc', function () {
      var code = 'p.sketch("Front").rect(-5, -5, 10, 10).end().extrude(1);\np.sketch("Front", 1).arcSlot(0, 0, 3, 30, 150, 1).dim(0, "r").cut(0.5);';
      roundTrip(code);
      var a = build(code), gs = K.generateScript(a.model);
      assert(/\.arcSlot\(/.test(gs), 'script keeps .arcSlot(): ' + gs);
      var sk = { entities: [{ t: 'aslot', cx: 0, cy: 0, r: 3, a0: 30, a1: 150, w: 1 }, { t: 'line', x1: 0, y1: 0, x2: 0, y2: 5 }], dims: [{ e: 0, k: 'r', prec: 2 }] };
      var r = SS.trimAt(sk, 0, [3.5 * Math.cos(Math.PI / 3), 3.5 * Math.sin(Math.PI / 3)]);
      assert(r.ok, 'trimmed: ' + r.error);
      var arcs = sk.entities.filter(function (e) { return e.t === 'arc'; }), con = arcs.filter(function (e) { return e.construction; });
      assert(!sk.entities.some(function (e) { return e.t === 'aslot'; }) && con.length === 1 && Math.abs(con[0].r - 3) < 1e-6, 'exploded with its construction arc: ' + JSON.stringify(sk.entities));
      var outer = arcs.filter(function (e) { return !e.construction && Math.abs(e.r - 3.5) < 1e-6; });
      assert(outer.length === 1 && Math.abs(outer[0].a0 - 90) < 1e-3 && Math.abs(outer[0].a1 - 150) < 1e-3, 'the outer arc trimmed back to the line (90°..150°): ' + JSON.stringify(arcs));
      assert(arcs.filter(function (e) { return !e.construction; }).length === 4, 'inner and both end arcs stay: ' + JSON.stringify(arcs));
      assert((sk.rels || []).some(function (x) { return x.type === 'tangent'; }) && (sk.rels || []).some(function (x) { return x.type === 'coincident'; }), 'relations: ' + JSON.stringify(sk.rels));
      var ci = sk.entities.indexOf(con[0]);
      assert((sk.dims || []).some(function (d) { return d.e === ci && d.k === 'r' && d.prec === 2; }), 'R on the construction arc: ' + JSON.stringify(sk.dims));
      var st = { entities: [{ t: 'slot', x1: -3, y1: 0, x2: 3, y2: 0, w: 2 }, { t: 'line', x1: 0, y1: -5, x2: 0, y2: 5 }], dims: [{ e: 0, k: 'w', tol: { type: 'symmetric', plus: 0.01 } }] };
      assert(SS.trimAt(st, 0, [1, 1]).ok, 'straight slot trimmed');
      assert(st.entities.some(function (e) { return e.t === 'line' && e.construction; }) && (st.rels || []).some(function (x) { return x.type === 'distance' && x.tol && x.tol.plus === 0.01; }), 'straight slot exploded with its width relation: ' + JSON.stringify(st.rels));
      return sk.entities.length + ' entities, ' + (sk.rels || []).length + ' relations';
    });
  })();
  // --- end rfAF ---
