  // ------------------------------------------------------------------ rfAD: Broken-out Section, Area Hatch per region, Jagged detail clip
  (function () {
    if (typeof Drawing === 'undefined') return;
    group('rfAD: Broken-out Section (profile, depth, depth reference), Area Hatch / Fill per region, the Jagged detail outline as the clip');
    var DW = Drawing, PLATE = 'p.sketch("Front").rect(0, 0, 100, 50).circle(20, 25, 5).circle(80, 25, 5).extrude(10);';
    function rfADDoc(code) {
      var r = build(code);
      noErrors(r);
      r.doc = DW.newDrawing(r.model, { date: '2026-10-12' });
      DW.standard3View(r.doc, r.mesh, r.model.units);
      r.recompute = function () { r.sheet = DW.compute(r.doc, r.mesh, r.model, { build: r.build }); return r.sheet; };
      r.byId = function (id) { return r.sheet.views.filter(function (w) { return w.view.id === id; })[0]; };
      r.view = function (o) { return r.doc.views.filter(function (v) { return v.orient === o && !v.kind; })[0]; };
      r.recompute();
      return r;
    }
    test('rfAD: Broken-out Section — a 20 × 20 rectangle round the left hole, 5 deep, on Front of a 10 mm plate: the cut floor (400 − the hole) is hatched at z = 5, the profile is 4 thin lines, the view keeps its box; a depth reference at z = 3 in Top cuts 7 deep; refused on a section view, with no depth, or a reference in a parallel view; setBrokenOut(null) takes it off', function () {
      var r = rfADDoc(PLATE), F = r.view('Front'), T = r.view('Top'), w0 = r.byId(F.id), box0 = JSON.stringify(w0.box);
      var e = DW.addBrokenOut(r.doc, F.id, { shape: 'rect', a: [30, 35], b: [10, 15], depth: 5 });
      assert(e.id === 1 && e.a[0] === 10 && e.b[1] === 35 && e.depth === 5, 'stored ' + JSON.stringify(e));
      var sh = r.recompute(), w = r.byId(F.id), ct = w.content;
      assert(ct.caps.length === 1 && w.hatch > 10, 'one hatched floor, ' + w.hatch + ' lines');
      nearRel(ct.brokenOutArea, 400 - Math.PI * 25, 0.01, 'floor area');
      near(ct.brokenOut[0].w, 5, 1e-9, 'floor at z = 5');
      var bl = sh.prims.filter(function (p) { return p.brokenOut === e.id; });
      assert(bl.length === 4 && bl.every(function (p) { return p.k === 'line' && p.style === 'thin' && p.layer === w.layer; }), 'thin profile ' + bl.length);
      assert(!w.proj.lines.visible.some(function (l) { return Math.abs(l[0] - 10) < 1e-6 && Math.abs(l[2] - 10) < 1e-6; }), 'no thick edge on the profile');
      assert(JSON.stringify(w.box) === box0, 'box unchanged');
      DW.setBrokenOut(r.doc, F.id, e.id, { depthRef: { view: T.id, p: [20, -3] } });
      r.recompute(); w = r.byId(F.id);
      near(w.content.brokenOut[0].depth, 7, 1e-9, 'depth from the Top view point');
      var dxf = DW.toDXF(r.sheet, { version: 'R2000' }), svg = DW.toSVG(r.sheet), pdf = DW.toPDF(r.sheet);
      assert(dxf.indexOf('AcDbLine') > 0 && svg.indexOf('class="hatch"') > 0 && (pdf.length || pdf.byteLength) > 1000, 'exports');
      var S = DW.addSectionView(r.doc, r.mesh, F.id, { axis: 'h', at: 25, sign: 1 }), errs = [];
      [function () { DW.addBrokenOut(r.doc, S.id, { shape: 'rect', a: [0, 0], b: [5, 5], depth: 1 }); },
        function () { DW.addBrokenOut(r.doc, F.id, { shape: 'rect', a: [0, 0], b: [5, 5] }); },
        function () { DW.addBrokenOut(r.doc, F.id, { shape: 'circle', c: [5, 5], r: 2, depthRef: { view: r.view('Front').id, p: [0, 0] } }); },
        function () { DW.addBrokenOut(r.doc, F.id, { shape: 'spline', pts: [[0, 0], [1, 1]], depth: 1 }); }].forEach(function (f) { try { f(); errs.push(null); } catch (x) { errs.push(x.message); } });
      assert(errs.every(Boolean), 'refusals ' + JSON.stringify(errs));
      DW.setBrokenOut(r.doc, F.id, e.id, null);
      r.recompute(); w = r.byId(F.id);
      assert(!F.brokenOut && !w.content.caps.length && !r.sheet.prims.some(function (p) { return p.brokenOut; }), 'removed');
      return 'floor ' + ct.brokenOutArea.toFixed(2) + ' mm²';
    });
    test('rfAD: Broken-out spline and circle profiles — a closed spline through 5 points is a smooth CCW polygon; a circle round the right hole 4 deep hatches an annulus; two broken-outs in one view each get a floor; a Front copy stays uncut (view only)', function () {
      var r = rfADDoc(PLATE), F = r.view('Front');
      var sp = DW.brokenOutPolygon({ shape: 'spline', pts: [[0, 0], [10, -2], [12, 8], [5, 12], [-2, 6]] });
      assert(sp.length === 50, 'spline samples ' + sp.length);
      var A = 0; for (var i = 0, j = sp.length - 1; i < sp.length; j = i++) A += (sp[j][0] + sp[i][0]) * (sp[j][1] - sp[i][1]);
      assert(-A / 2 > 0, 'counter-clockwise');
      DW.addBrokenOut(r.doc, F.id, { shape: 'circle', c: [80, 25], r: 10, depth: 4 });
      DW.addBrokenOut(r.doc, F.id, { shape: 'spline', pts: [[10, 15], [30, 14], [32, 36], [12, 36]], depth: 2 });
      var w = r.recompute() && r.byId(F.id);
      assert(w.content.caps.length === 2, 'two floors ' + w.content.caps.length);
      var ws = w.content.brokenOut.map(function (c) { return c.w; }).sort();
      near(ws[0], 6, 1e-9, 'circle floor'); near(ws[1], 8, 1e-9, 'spline floor');
      var iso = r.doc.views.filter(function (v) { return v.orient === 'Isometric'; })[0];
      assert(!iso.brokenOut && !r.byId(iso.id).content.caps.length, 'other views uncut');
      return w.hatch + ' hatch lines';
    });
    test('rfAD: Area Hatch per region — hatchRegions lists the section\'s cut faces with a point inside; ANSI37 at scale 2, angle 30 replaces the material hatch of that region only (its lines carry region and pattern, two families at 75° and 165°); SOLID is a close fill; NONE leaves it bare; null goes back to the material crosshatch; a detail of the section follows its parent', function () {
      var r = rfADDoc(PLATE), F = r.view('Front');
      var S = DW.addSectionView(r.doc, r.mesh, F.id, { axis: 'h', at: 25, sign: 1 }), w = r.recompute() && r.byId(S.id);
      var regs = DW.hatchRegions(w);
      assert(regs.length === 3 && regs.every(function (g) { return g.pattern === 'ANSI31' && g.angle === 0 && !g.areaHatch; }), 'three regions (the plate between the holes) ' + JSON.stringify(regs.map(function (g) { return g.p; })));
      var mid = regs.filter(function (g) { return Math.abs(g.p[0] - 50) < 1e-6; })[0], base = w.hatch;
      assert(mid, 'the middle piece (u 25..75) ' + JSON.stringify(regs.map(function (g) { return g.p; })));
      function lines(pat) { return r.sheet.prims.filter(function (p) { return p.layer === w.layer && p.style === 'hatch' && (pat ? p.areaHatch === pat : !p.areaHatch); }); }
      var plain0 = lines(null).length;
      DW.setAreaHatch(r.doc, S.id, mid.p, { pattern: 'ANSI37', scale: 2, angle: 30 });
      w = r.recompute() && r.byId(S.id);
      var own = lines('ANSI37');
      assert(own.length > 0 && own.every(function (p) { return p.region === own[0].region && Math.min(p.a[0], p.b[0]) >= w.toSheet([25, 0])[0] - 1e-6 && Math.max(p.a[0], p.b[0]) <= w.toSheet([75, 0])[0] + 1e-6; }), 'own hatch on the middle piece only ' + own.length);
      var angs = {}; own.forEach(function (p) { angs[Math.round((Math.atan2(p.b[1] - p.a[1], p.b[0] - p.a[0]) * 180 / Math.PI + 360) % 180)] = 1; });
      assert(angs[75] && angs[165] && Object.keys(angs).length === 2, 'two families ' + Object.keys(angs));
      var plain1 = lines(null).length;
      assert(plain1 > 0 && plain1 < plain0, 'the side pieces keep the material hatch ' + plain0 + ' → ' + plain1);
      var regs2 = DW.hatchRegions(w), m2 = regs2.filter(function (g) { return g.areaHatch; });
      assert(regs2.length === 3 && m2.length === 1 && m2[0].angle === 30 && m2[0].scale === 2 && m2[0].pattern === 'ANSI37', 'listed with its pattern ' + JSON.stringify(m2));
      assert(w.hatches.some(function (h) { return h.pattern === 'ANSI37' && h.lines === own.length; }), 'hatches entry');
      DW.setAreaHatch(r.doc, S.id, mid.p, { pattern: 'SOLID' });
      w = r.recompute() && r.byId(S.id);
      var sol = lines('SOLID');
      assert(sol.length === 1 && sol[0].k === 'region' && sol[0].loops.length >= 1, 'solid fill: one filled region (rfAG) ' + sol.length);
      var D2 = DW.addDetailView(r.doc, r.mesh, S.id, { c: mid.p, r: 6, x: 320, y: 120 }), wd = r.recompute() && r.byId(D2.id);
      assert(r.sheet.prims.some(function (p) { return p.layer === wd.layer && p.areaHatch === 'SOLID'; }), 'detail follows the parent');
      DW.setAreaHatch(r.doc, S.id, mid.p, { pattern: 'NONE' });
      w = r.recompute() && r.byId(S.id);
      assert(lines(null).length === plain1 && !r.sheet.prims.some(function (p) { return p.layer === w.layer && p.areaHatch; }), 'none');
      DW.setAreaHatch(r.doc, S.id, mid.p, null);
      w = r.recompute() && r.byId(S.id);
      assert(!S.hatchRegions && w.hatch === base && lines(null).length === plain0, 'back to the material hatch');
      var bad = null; try { DW.setAreaHatch(r.doc, S.id, mid.p, { pattern: 'BRICK' }); } catch (x) { bad = x.message; }
      assert(bad && /pattern/.test(bad), 'unknown pattern refused');
      return plain0 + ' → ' + plain1 + ' + ' + own.length + ' lines';
    });
    test('rfAD: Jagged detail outline is the clip — the detail\'s lines and hatch end inside the zig-zag (out to r + 1.2 mm, past the circle where the zig-zag is), none past it; Full outline still clips at the circle', function () {
      var r = rfADDoc(PLATE), F = r.view('Front');
      var S = DW.addSectionView(r.doc, r.mesh, F.id, { axis: 'h', at: 25, sign: 1 });
      var v = DW.addDetailView(r.doc, r.mesh, S.id, { c: [15, -5], r: 8, outline: 'jagged', x: 320, y: 120 }), sh = r.recompute(), w = r.byId(v.id);
      var c = w.toSheet(v.detail.c), R = v.detail.r * w.scale, k = 1, J = DW._.jaggedPts(w, k);
      var lin = sh.prims.filter(function (p) { return p.layer === w.layer && p.k === 'line' && p.detailOutline == null; }), maxR = 0, out = 0;
      lin.forEach(function (p) { [p.a, p.b].forEach(function (q) { var d = Math.hypot(q[0] - c[0], q[1] - c[1]); maxR = Math.max(maxR, d); }); var m = [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2]; if (!DW._.inLoops(m, [J])) out++; });
      assert(lin.length > 5 && out === 0, 'all inside the zig-zag (' + out + ' of ' + lin.length + ' out)');
      assert(maxR > R + 0.05 && maxR <= R + 1.2 + 1e-6, 'out to the zig-zag: ' + maxR.toFixed(3) + ' vs r ' + R.toFixed(3));
      assert(lin.some(function (p) { return p.style === 'hatch'; }), 'hatch clipped too');
      DW.setDetailOptions(r.doc, v.id, { outline: 'full' });
      sh = r.recompute(); w = r.byId(v.id); maxR = 0;
      sh.prims.filter(function (p) { return p.layer === w.layer && p.k === 'line' && p.detailOutline == null; }).forEach(function (p) { [p.a, p.b].forEach(function (q) { maxR = Math.max(maxR, Math.hypot(q[0] - c[0], q[1] - c[1])); }); });
      assert(maxR <= R + 1e-6, 'full: at the circle ' + maxR);
      return 'jagged reach ' + R.toFixed(2) + ' → zig-zag';
    });
    test('rfAD: flatCurves on an arc slot loop (no corner over 30°) gives its four true arcs — two concentric 120° arcs and two 180° end arcs, no lines — wherever the loop starts (the seam goes where two arcs meet, not inside an end arc)', function () {
      var P = [], R = 20, w = 3, a0 = 30, a1 = 150, Dg = Math.PI / 180, i;
      for (i = 0; i <= 16; i++) { var t = (a0 + (a1 - a0) * i / 16) * Dg; P.push([(R + w) * Math.cos(t), (R + w) * Math.sin(t)]); }
      var c1 = [R * Math.cos(a1 * Dg), R * Math.sin(a1 * Dg)], c0 = [R * Math.cos(a0 * Dg), R * Math.sin(a0 * Dg)];
      for (i = 1; i < 8; i++) { var t2 = a1 * Dg + Math.PI * i / 8; P.push([c1[0] + w * Math.cos(t2), c1[1] + w * Math.sin(t2)]); }
      for (i = 0; i <= 16; i++) { var t3 = (a1 - (a1 - a0) * i / 16) * Dg; P.push([(R - w) * Math.cos(t3), (R - w) * Math.sin(t3)]); }
      for (i = 1; i < 8; i++) { var t4 = a0 * Dg + Math.PI + Math.PI * i / 8; P.push([c0[0] + w * Math.cos(t4), c0[1] + w * Math.sin(t4)]); }
      var bad = [];
      for (var s = 0; s < P.length; s++) {
        var o = Drawing.flatCurves([P.slice(s).concat(P.slice(0, s))], 60), sw = o.arcs.map(function (a) { return Math.round(a.a1 - a.a0); }).sort();
        if (o.lines.length || JSON.stringify(sw) !== '[120,120,180,180]') bad.push(s + ':' + o.lines.length + 'L ' + sw);
      }
      assert(!bad.length, 'starts that split an arc: ' + bad.slice(0, 5).join(' | '));
      return P.length + ' starts, 4 arcs each';
    });
  })();
  // --- end rfAD ---
