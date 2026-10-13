  // ---- rfP (lane P, 2026-10-12): Half, Offset and Aligned section views; dimensions in a broken view
  (function () {
    if (typeof Drawing === 'undefined') return;
    group('rfP: Half / Offset / Aligned sections, broken-view mapping');
    var DR = Drawing;
    function rfPsheet(code) {
      var r = build(code);
      noErrors(r);
      r.doc = DR.newDrawing(r.model, { date: '2026-10-12' });
      DR.standard3View(r.doc, r.mesh, r.model.units);
      r.recompute = function () { r.sheet = DR.compute(r.doc, r.mesh, r.model); return r.sheet; };
      r.recompute();
      r.w = function (id) { return r.sheet.views.filter(function (w) { return w.view.id === id; })[0]; };
      r.front = r.doc.views.filter(function (v) { return v.orient === 'Front'; })[0];
      return r;
    }
    function rfPthrows(f) { try { f(); return false; } catch (e) { return true; } }
    function rfPcut(sh, pw, id) { return sh.prims.filter(function (p) { return p.cutLine === id && p.layer === pw.layer; }); }
    test('rfP: Half Section — a quarter is taken away: the cut half is hatched (area 400 = 50 × 10 less a Ø10 hole), the other half is seen from outside; the parent shows an L-shaped cutting line with one arrow and the letter, the straight line is gone; exports and JSON round trip', function () {
      var r = rfPsheet('p.sketch("Front").rect(0, 0, 100, 50).circle(20, 25, 5).circle(80, 25, 5).extrude(10);');
      var sv = DR.addSectionView(r.doc, r.mesh, r.front.id, { axis: 'h', at: 25, sign: 1, type: 'half', c: 50, side: 1 });
      assert(sv.section.type === 'half' && sv.section.c === 50 && sv.section.side === 1, 'stored on the view');
      var sh = r.recompute(), w = r.w(sv.id), pw = r.w(r.front.id);
      near(w.section.area, 400, 1e-6, 'cut area');
      assert(w.hatch > 0, 'hatched');
      w.content.caps.forEach(function (c) { c.loops.forEach(function (l) { l.forEach(function (p) { assert(p[0] >= 50 - 1e-6, 'hatch only on the cut half ' + p[0]); }); }); });
      // the uncut half is seen from outside: its top edge (v = 50 → depth line) spans u 0..50
      assert(w.proj.lines.visible.some(function (l) { return Math.abs(l[1] - l[3]) < 1e-9 && Math.min(l[0], l[2]) < 1e-6 && Math.max(l[0], l[2]) > 49; }), 'outside half drawn');
      var cl = rfPcut(sh, pw, sv.id);
      assert(cl.filter(function (p) { return p.k === 'line' && p.style === 'chain'; }).length === 2, 'two chain legs (L shape)');
      assert(cl.filter(function (p) { return p.k === 'fill'; }).length === 1, 'one arrow');
      assert(cl.filter(function (p) { return p.k === 'text' && p.text === 'A'; }).length === 1, 'one letter');
      assert(!sh.prims.some(function (p) { return p.layer === pw.layer && p.style === 'chain' && p.cutLine == null; }), 'no straight cutting line left');
      var leg = cl.filter(function (p) { return p.k === 'line' && p.style === 'chain'; }), C = pw.toSheet([50, 25]);
      assert(leg.every(function (p) { return Math.hypot(p.a[0] - C[0], p.a[1] - C[1]) < 1e-6 || Math.hypot(p.b[0] - C[0], p.b[1] - C[1]) < 1e-6; }), 'legs meet at the centre');
      assert(sh.prims.some(function (p) { return p.k === 'text' && p.text === 'SECTION A-A'; }), 'SECTION A-A label');
      var dxf = DR.toDXF(sh), svg = DR.toSVG(sh), pdf = DR.toPDF(sh);
      assert(dxf.indexOf('SECTION A-A') >= 0 && svg.length && pdf.length, 'exports');
      var doc2 = JSON.parse(JSON.stringify(r.doc));
      assert(DR.compute(doc2, r.mesh, r.model).prims.length === sh.prims.length, 'JSON round trip');
      DR.setSectionType(r.doc, sv.id, { type: 'full' });
      sh = r.recompute();
      near(r.w(sv.id).section.area, 800, 1e-6, 'full section through both holes: 100 × 10 less 2 × 10 × 10');
      assert(!sh.prims.some(function (p) { return p.cutLine != null; }), 'back to the straight line');
      assert(rfPthrows(function () { DR.setSectionType(r.doc, sv.id, { type: 'half' }); }), 'a half section without its centre is refused');
      assert(!sv.section.type, 'refused change leaves the view as it was');
      return 'ok';
    });
    test('rfP: Offset Section — a stepped line through holes at two heights hatches both legs (area 800), the step is not drawn in the view, the parent shows the stepped line with two arrows', function () {
      var r = rfPsheet('p.sketch("Front").rect(0, 0, 100, 50).circle(20, 15, 5).circle(80, 35, 5).extrude(10);');
      var n0 = r.doc.views.length;
      assert(rfPthrows(function () { DR.addSectionView(r.doc, r.mesh, r.front.id, { axis: 'h', at: 15, sign: 1, type: 'offset', jogs: [] }); }), 'no steps: refused');
      assert(r.doc.views.length === n0, 'a refused section adds no view');
      var sv = DR.addSectionView(r.doc, r.mesh, r.front.id, { axis: 'h', at: 15, sign: 1, type: 'offset', jogs: [{ t: 50, at: 35 }] });
      var sh = r.recompute(), w = r.w(sv.id), pw = r.w(r.front.id);
      near(w.section.area, 800, 1e-6, 'two legs, each 50 × 10 less a hole');
      assert(w.content.caps.length >= 2, 'both cut faces hatched');
      assert(!w.proj.lines.visible.some(function (l) { return Math.abs(l[0] - 50) < 1e-6 && Math.abs(l[2] - 50) < 1e-6; }), 'no line at the step');
      var cl = rfPcut(sh, pw, sv.id), legs = cl.filter(function (p) { return p.k === 'line' && p.style === 'chain'; });
      assert(legs.length === 3, 'three legs: ' + legs.length);
      assert(cl.filter(function (p) { return p.k === 'fill'; }).length === 2, 'two arrows');
      var y15 = pw.toSheet([0, 15])[1], y35 = pw.toSheet([0, 35])[1];
      assert(legs.some(function (p) { return Math.abs(p.a[1] - y15) < 1e-6 && Math.abs(p.b[1] - y15) < 1e-6; }) && legs.some(function (p) { return Math.abs(p.a[1] - y35) < 1e-6 && Math.abs(p.b[1] - y35) < 1e-6; }), 'legs at both depths');
      return 'ok';
    });
    test('rfP: Aligned Section — a disc with holes at 0° and 270°: the 270° leg is turned into the plane of the first, both holes show as gaps in one cut across the full diameter (area 800), arrows square to each leg', function () {
      var r = rfPsheet('p.sketch("Front").circle(0, 0, 50).circle(30, 0, 5).circle(0, -30, 5).extrude(10);');
      var sv = DR.addSectionView(r.doc, r.mesh, r.front.id, { axis: 'h', at: 0, sign: 1, type: 'aligned', c: 0, side: 1, angle: 270 });
      var sh = r.recompute(), w = r.w(sv.id), pw = r.w(r.front.id);
      near(w.section.area, 800, 1e-3, 'two 40 × 10 cut faces');
      var umin = Infinity, umax = -Infinity;
      w.content.caps.forEach(function (c) { c.loops.forEach(function (l) { l.forEach(function (p) { umin = Math.min(umin, p[0]); umax = Math.max(umax, p[0]); }); }); });
      near(umin, -50, 0.5, 'the turned leg reaches -R'); near(umax, 50, 0.5, 'the first leg reaches +R');
      var cl = rfPcut(sh, pw, sv.id), fills = cl.filter(function (p) { return p.k === 'fill'; });
      assert(fills.length === 2 && cl.filter(function (p) { return p.k === 'line' && p.style === 'chain'; }).length === 2, 'two legs, two arrows');
      var L = DR.alignedLegs(sv.section);
      near(L.d2[0] * L.n2[0] + L.d2[1] * L.n2[1], 0, 1e-12, 'leg 2 normal square to it');
      assert(rfPthrows(function () { DR.setSectionType(r.doc, sv.id, { type: 'aligned', c: 0, side: 1, angle: 0 }); }), 'legs in line refused');
      return 'ok';
    });
    test('rfP: Broken view — breakMap inverts toSheet across the gap, so a dimension line dragged to a paper position right of the break lands on the model coordinate under it', function () {
      var r = rfPsheet('p.sketch("Front").rect(0, 0, 200, 20).circle(20, 10, 4).circle(180, 10, 4).extrude(10);'), id = r.front.id;
      DR.addBreak(r.doc, id, { dir: 'horizontal', a: 5, b: 15, gap: 2, style: 'straight' });
      DR.addBreak(r.doc, id, { dir: 'vertical', a: 50, b: 150, gap: 10 });
      r.recompute();
      var w = r.w(id), M = w.breakMap;
      assert(M && M.fwd && M.inv, 'break map exposed');
      [[180, 18], [10, 2], [199, 19.5]].forEach(function (m) {
        var p = w.toSheet(m), q = w.fromSheet(p);
        near(q[0], m[0], 1e-9, 'u back'); near(q[1], m[1], 1e-9, 'v back');
        var b = M.inv(p), f = M.fwd(b); near(f[0], p[0], 1e-9, 'fwd(inv) x'); near(f[1], p[1], 1e-9, 'fwd(inv) y');
      });
      return 'ok';
    });
  })();
  // --- end rfP ---
