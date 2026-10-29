  // --- rfDW (2026-10-29, lane DW: hatch editing per region) --- Area Hatch/Fill overrides keyed by body and region
  // (they survive a rebuild that keeps the region), Apply changes to Region / Body, Hatch / Solid / None, ANSI35 /
  // ANSI36, and Area Hatch/Fill on a model face or a closed sheet-sketch profile; SVG and DXF follow.
  (function () {
    if (typeof Drawing === 'undefined') return;
    group('rfDW: hatch per region (keys, Region / Body, Solid / None), ANSI35 / 36, area fills on faces and sketches');
    var DWg = Drawing;
    // two separate 2 x 1 x 1 inch blocks (merge: false), the second at x = gapX
    function rfDWCode(w, gapX) { return 'p.name("Two blocks").units("in");\np.box(' + w + ', 1, 1);\np.box(2, 1, 1, { at: [' + gapX + ', 0, 0], merge: false });'; }
    function rfDWDoc(code) {
      var r = build(code);
      noErrors(r);
      r.doc = DWg.newDrawing(r.model, { date: '2026-10-29', scale: [1, 1] });
      DWg.standard3View(r.doc, r.mesh, r.model.units);
      r.F = r.doc.views.filter(function (v) { return v.orient === 'Front' && !v.kind; })[0];
      r.recompute = function (rb) { var x = rb || r; r.sheet = DWg.compute(r.doc, x.mesh, x.model, { build: x.build }); return r.sheet; };
      r.win = function (id) { return r.sheet.views.filter(function (w) { return w.view.id === id; })[0]; };
      r.recompute();
      return r;
    }
    function rfDWSection(r) { r.S = DWg.addSectionView(r.doc, r.mesh, r.F.id, { axis: 'h', at: 0.5, sign: 1 }); r.recompute(); return r.S; }
    function rfDWHatchLines(sheet, layer, tag) { return sheet.prims.filter(function (p) { return p.k === 'line' && p.layer === layer && p.style === 'hatch' && (tag === undefined || p.areaHatch === tag); }); }
    function rfDWDxfLines(dxf, layer) { return dxf.split(/\n0\n/).filter(function (e) { return /^LINE\n/.test(e) && e.indexOf('\n8\n' + layer + '\n') >= 0; }).length; }
    function rfDWAng(p) { var a = Math.atan2(p.b[1] - p.a[1], p.b[0] - p.a[0]) * 180 / Math.PI; a = ((a % 180) + 180) % 180; return Math.round(a); }

    test('rfDW: a section of a 2-body part has one keyed region per body (b0:r0, b1:r0); region 1 ANSI37 scale 2 angle 0 and region 2 None draw exactly that on the sheet, in the SVG and in the DXF', function () {
      var r = rfDWDoc(rfDWCode(2, 3)), S = rfDWSection(r), w = r.win(S.id);
      var regs = DWg.hatchRegions(w);
      assert(regs.length === 2 && regs[0].key === 'b0:r0' && regs[1].key === 'b1:r0' && regs[0].solid === 'b0', 'keys ' + JSON.stringify(regs.map(function (g) { return g.key; })));
      var s0 = w.hatches.filter(function (h) { return h.body === 0; })[0].spacing;
      DWg.setAreaHatch(r.doc, S.id, regs[0].p, { pattern: 'ANSI37', scale: 2, angle: 0 }, { key: regs[0].key });
      DWg.setAreaHatch(r.doc, S.id, regs[1].p, { fill: 'none' }, { key: regs[1].key });
      assert(S.hatchRegions.length === 2 && S.hatchRegions[0].key === 'b0:r0' && S.hatchRegions[1].pattern === 'NONE', 'stored ' + JSON.stringify(S.hatchRegions));
      r.recompute(); w = r.win(S.id);
      var a37 = rfDWHatchLines(r.sheet, w.layer, 'ANSI37'), all = rfDWHatchLines(r.sheet, w.layer);
      assert(a37.length > 4 && a37.length === all.length, 'only ANSI37 hatch lines ' + a37.length + ' / ' + all.length);
      var angs = {}; a37.forEach(function (p) { angs[rfDWAng(p)] = 1; });
      assert(Object.keys(angs).sort().join() === '135,45', 'ANSI37 at 45 and 135: ' + Object.keys(angs));
      var h0 = w.hatches.filter(function (h) { return h.areaHatch && h.pattern === 'ANSI37'; })[0], h1 = w.hatches.filter(function (h) { return h.pattern === 'NONE'; })[0];
      assert(h0 && h0.key === 'b0:r0' && Math.abs(h0.spacing - 2 * s0) < 1e-12 && h0.lines === a37.length, 'ANSI37 entry ' + JSON.stringify(h0) + ' s0 ' + s0);
      assert(h1 && h1.lines === 0 && h1.body === 1, 'None entry ' + JSON.stringify(h1));
      // the region's hatch lines lie inside body 0's cut face (x 0..2), none over body 1 (x 3..5)
      var inB0 = a37.every(function (p) { var m = w.fromSheet([(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2]); return m[0] > -1e-6 && m[0] < 2 + 1e-6; });
      assert(inB0, 'ANSI37 only on body 0');
      // SVG: hatch paths on the section layer; DXF: the ANSI37 lines are LINEs on its layer (None adds none)
      var svg = DWg.toSVG(r.sheet);
      assert(/class="hatch"/.test(svg), 'SVG hatch');
      var dxf = DWg.toDXF(r.sheet, { version: 'R2000' }), n1 = rfDWDxfLines(dxf, w.layer);
      DWg.setAreaHatch(r.doc, S.id, null, { fill: 'none' }, { key: 'b0:r0' });
      r.recompute();
      var n0 = rfDWDxfLines(DWg.toDXF(r.sheet, { version: 'R2000' }), w.layer);
      assert(n1 - n0 === a37.length, 'DXF ANSI37 lines ' + (n1 - n0) + ' vs ' + a37.length);
      assert(rfDWHatchLines(r.sheet, w.layer).length === 0, 'both None: no hatch');
    });

    test('rfDW: the overrides survive a rebuild that keeps both bodies (block 1 wider, block 2 moved so the stored point is off it: found again by its key); a body that is gone drops its override quietly', function () {
      var r = rfDWDoc(rfDWCode(2, 3)), S = rfDWSection(r), regs = DWg.hatchRegions(r.win(S.id));
      DWg.setAreaHatch(r.doc, S.id, regs[0].p, { pattern: 'ANSI37', scale: 2, angle: 0 }, { key: regs[0].key });
      DWg.setAreaHatch(r.doc, S.id, regs[1].p, { fill: 'none' }, { key: regs[1].key });
      var r2 = build(rfDWCode(2.5, 6)); noErrors(r2);
      r.recompute(r2);
      var w = r.win(S.id), g = DWg.hatchRegions(w);
      assert(g.length === 2 && g[0].pattern === 'ANSI37' && g[0].scale === 2 && g[1].pattern === 'NONE' && g[1].areaHatch, 'kept ' + JSON.stringify(g.map(function (x) { return [x.key, x.pattern, x.scale]; })));
      assert(!DWg._.inLoops(S.hatchRegions[1].p, g[1].loops), 'the stored point is off the moved block');
      assert(rfDWHatchLines(r.sheet, w.layer, 'ANSI37').length > 4 && w.hatches.filter(function (h) { return h.body === 1; })[0].lines === 0, 'drawn');
      var r3 = build('p.name("One block").units("in");\np.box(2, 1, 1);'); noErrors(r3);
      r.recompute(r3);
      var g3 = DWg.hatchRegions(r.win(S.id));
      assert(g3.length === 1 && g3[0].pattern === 'ANSI37', 'one body left ' + JSON.stringify(g3.map(function (x) { return [x.key, x.pattern]; })));
      // the doc round-trips through JSON (save / open)
      var d2 = JSON.parse(JSON.stringify(r.doc)), sh2 = DWg.compute(d2, r2.mesh, r2.model, { build: r2.build });
      var w2 = sh2.views.filter(function (x) { return x.view.id === S.id; })[0], g2 = DWg.hatchRegions(w2);
      assert(g2[0].pattern === 'ANSI37' && g2[1].pattern === 'NONE', 'after save / open');
    });

    test('rfDW: Apply changes to Body sets every region of the solid and replaces its region overrides; Solid is one filled region; the material crosshatch (null) clears; bad keys and scopes are refused', function () {
      var r = rfDWDoc(rfDWCode(2, 3)), S = rfDWSection(r), regs = DWg.hatchRegions(r.win(S.id));
      DWg.setAreaHatch(r.doc, S.id, regs[0].p, { pattern: 'ANSI31', scale: 3 }, { key: regs[0].key });
      DWg.setAreaHatch(r.doc, S.id, null, { fill: 'solid' }, { key: regs[0].key, scope: 'body' });
      assert(S.hatchRegions.length === 1 && S.hatchRegions[0].scope === 'body' && S.hatchRegions[0].key === 'b0' && S.hatchRegions[0].pattern === 'SOLID', 'body entry ' + JSON.stringify(S.hatchRegions));
      r.recompute();
      var w = r.win(S.id), fills = r.sheet.prims.filter(function (p) { return p.k === 'region' && p.layer === w.layer; });
      assert(fills.length === 1 && fills[0].areaHatch === 'SOLID', 'one fill ' + fills.length);
      assert(DWg.hatchRegions(w)[0].scope === 'body', 'reported scope');
      DWg.setAreaHatch(r.doc, S.id, null, null, { key: 'b0:r0', scope: 'body' });
      assert(!S.hatchRegions, 'cleared');
      var bad = 0;
      try { DWg.setAreaHatch(r.doc, S.id, 'x1', { fill: 'none' }); } catch (e) { bad++; }
      try { DWg.setAreaHatch(r.doc, S.id, 'b0:r0', { fill: 'none' }, { scope: 'part' }); } catch (e) { bad++; }
      try { DWg.setAreaHatch(r.doc, S.id, 'b0:r0', { fill: 'dots' }); } catch (e) { bad++; }
      try { DWg.setAreaHatch(r.doc, S.id, 'b0:r0', { pattern: 'ANSI31', scale: 0 }); } catch (e) { bad++; }
      assert(bad === 4, 'refused ' + bad);
      // a key string alone (no point) works: the place among the solid's regions
      DWg.setAreaHatch(r.doc, S.id, 'b1:r0', { pattern: 'ANSI36' });
      r.recompute();
      assert(DWg.hatchRegions(r.win(S.id))[1].pattern === 'ANSI36', 'key alone');
    });

    test('rfDW: ANSI35 (solid lines and dash-dot lines between, 2 units apart) and ANSI36 (dash-dot lines whose dashes shift half a period on each next line) as acad.pat draws them', function () {
      var sq = [[[0, 0], [10, 0], [10, 10], [0, 10]]];
      var a35 = DWg.patternLines(sq, 0.5, 45, 'ANSI35'), a31 = DWg.patternLines(sq, 0.5, 45, 'ANSI31');
      assert(a35.length > a31.length / 2, 'ANSI35 lines ' + a35.length);
      var a36 = DWg.patternLines(sq, 0.5, 0, 'ANSI36');
      // horizontal at angle 0: dashes 1.25 long (2.5 units of .5), dots .025, period 1.75; line k's dashes start 0.875 k later
      var byY = {};
      a36.forEach(function (l) { var y = Math.round(l[1] * 1000) / 1000; (byY[y] = byY[y] || []).push(l); });
      var ys = Object.keys(byY).map(Number).sort(function (a, b) { return a - b; });
      assert(ys.length >= 19 && Math.abs(ys[1] - ys[0] - 0.5) < 1e-9, 'line spacing ' + ys.slice(0, 3));
      function firstFull(L) { var s = L.filter(function (l) { return Math.abs(l[2] - l[0] - 1.25) < 1e-9; }).map(function (l) { return l[0]; }).sort(function (a, b) { return a - b; }); return s[0]; }
      var d = firstFull(byY[ys[2]]) - firstFull(byY[ys[1]]);
      d = ((d % 1.75) + 1.75) % 1.75;
      assert(Math.abs(d - 0.875) < 1e-9, 'shift ' + d);
      assert(byY[ys[1]].some(function (l) { return Math.abs(l[2] - l[0] - 0.025) < 1e-9; }), 'dots');
      assert(DWg.AREA_PATTERNS.indexOf('ANSI35') >= 0 && DWg.AREA_PATTERNS.indexOf('ANSI36') >= 0, 'in the list');
    });

    test('rfDW: Area Hatch/Fill on a model face of the Front view (ANSI31, its outline 2 x 1 at 1:1) and on a closed sheet-sketch rectangle (layer ANNOTATIONS, in the DXF); edited, deleted, a face that is gone is not drawn', function () {
      var r = rfDWDoc(rfDWCode(2, 3)), w = r.win(r.F.id);
      var f = DWg.addAreaFill(r.doc, { view: r.F.id, p: [1, 0.5], pattern: 'ANSI31', scale: 1 }, r.mesh, w.frame);
      assert(f.kind === 'face' && f.view === r.F.id && /^AF\d+$/.test(f.id), 'made ' + JSON.stringify(f));
      r.recompute();
      var af = r.sheet.areaFills.filter(function (x) { return x.id === f.id; })[0];
      assert(af && af.prims > 0 && af.layer === w.layer, 'drawn ' + JSON.stringify(af && { prims: af.prims, layer: af.layer }));
      var xs = [], ys = []; af.loops[0].forEach(function (p) { xs.push(p[0]); ys.push(p[1]); });
      near(Math.max.apply(null, xs) - Math.min.apply(null, xs), 2 * r.win(r.F.id).scale, 1e-6, 'face width');
      near(Math.max.apply(null, ys) - Math.min.apply(null, ys), 1 * r.win(r.F.id).scale, 1e-6, 'face height');
      var lines = r.sheet.prims.filter(function (p) { return p.areaFill === f.id; });
      assert(lines.length === af.prims && lines.every(function (p) { return p.style === 'hatch'; }), 'prims');
      var refused = 0;
      try { DWg.addAreaFill(r.doc, { view: r.F.id, p: [2.5, 0.5] }, r.mesh, w.frame); } catch (e) { refused++; }
      assert(refused === 1, 'no face in the gap');
      // a sheet-sketch rectangle
      var ids = DWg.addSketchRect(r.doc, [20, 20], [60, 40]);
      var g = DWg.sketchRegionAt(r.doc, [30, 30]);
      assert(g && g.ids.length === 4 && g.view === null, 'sketch region ' + JSON.stringify(g && g.ids));
      var f2 = DWg.addAreaFill(r.doc, { ids: [ids[0]], fill: 'solid' });
      assert(f2.kind === 'sketch' && f2.view === null && r.doc.sheet.areaFills.length === 1, 'sheet fill');
      r.recompute();
      var reg = r.sheet.prims.filter(function (p) { return p.k === 'region' && p.areaFill === f2.id; });
      assert(reg.length === 1 && reg[0].layer === 'ANNOTATIONS', 'solid region on ANNOTATIONS');
      DWg.editAreaFill(r.doc, f2.id, { fill: 'hatch', pattern: 'ANSI32', scale: 2 });
      r.recompute();
      var ann = r.sheet.prims.filter(function (p) { return p.areaFill === f2.id; });
      assert(ann.length > 3 && ann.every(function (p) { return p.k === 'line' && p.layer === 'ANNOTATIONS'; }), 'ANSI32 lines ' + ann.length);
      var nd = rfDWDxfLines(DWg.toDXF(r.sheet, { version: 'R2000' }), 'ANNOTATIONS');
      assert(nd >= ann.length - 2 && nd <= ann.length, 'DXF lines on ANNOTATIONS ' + nd + ' / ' + ann.length);   // (a corner sliver a hair long is left out of the DXF)
      assert(DWg.areaFills(r.doc).length === 2, 'listed');
      // the face gone (one block only, at x 3..5 now): not drawn, kept
      var r3 = build('p.name("One block").units("in");\np.box(2, 1, 1, { at: [3, 0, 0] });'); noErrors(r3);
      r.recompute(r3);
      assert(!r.sheet.areaFills.some(function (x) { return x.id === f.id; }) && r.sheet.prims.every(function (p) { return p.areaFill !== f.id; }), 'face gone: not drawn');
      DWg.editAreaFill(r.doc, f.id, null); DWg.editAreaFill(r.doc, f2.id, null);
      assert(!r.F.areaFills && !r.doc.sheet.areaFills, 'deleted');
    });

    // (lane DW2) the area of a set of disjoint loops pieces / a profile with islands (even-odd)
    function rfDWArea(l) { var a = 0; for (var i = 0, j = l.length - 1; i < l.length; j = i++) a += (l[j][0] + l[i][0]) * (l[j][1] - l[i][1]); return Math.abs(a / 2); }
    function rfDWSegIn(s, test) { for (var k = 1; k < 10; k++) { var t = k / 10; if (test([s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t])) return true; } return false; }

    test('rfDW2: an Area Hatch/Fill on a sheet-sketch rectangle cuts out the circle drawn inside it, and fills again the rectangle inside the circle (nested islands alternate, as SolidWorks): hatch lines and the Solid fill', function () {
      var r = rfDWDoc(rfDWCode(2, 3));
      var ids = DWg.addSketchRect(r.doc, [100, 100], [180, 160]);
      var c = DWg.addSketchEntity(r.doc, { t: 'circle', c: [140, 130], r: 20 });
      DWg.addSketchRect(r.doc, [132, 124], [148, 136]);
      var f = DWg.addAreaFill(r.doc, { ids: [ids[0]], pattern: 'ANSI31', scale: 1 });
      r.recompute();
      var af = r.sheet.areaFills.filter(function (x) { return x.id === f.id; })[0];
      assert(af && af.loops.length === 3, 'outer + two islands: ' + (af && af.loops.length));
      var lines = r.sheet.prims.filter(function (p) { return p.areaFill === f.id; });
      function inRing(q) { var d = Math.hypot(q[0] - 140, q[1] - 130); return d < 19.9 && !(q[0] > 131.95 && q[0] < 148.05 && q[1] > 123.95 && q[1] < 136.05); }
      function inInner(q) { return q[0] > 132.1 && q[0] < 147.9 && q[1] > 124.1 && q[1] < 135.9; }
      assert(lines.length > 10 && !lines.some(function (s) { return rfDWSegIn(s, inRing); }), 'no hatch in the ring between the circle and the inner rectangle');
      assert(lines.some(function (s) { return rfDWSegIn(s, inInner); }), 'the inner rectangle is hatched again');
      assert(lines.some(function (s) { return rfDWSegIn(s, function (q) { return q[0] < 115; }); }), 'the outer band is hatched');
      DWg.editAreaFill(r.doc, f.id, { fill: 'solid' });
      r.recompute();
      var reg = r.sheet.prims.filter(function (p) { return p.k === 'region' && p.areaFill === f.id; })[0];
      assert(reg && reg.loops.length === 3, 'solid: three loops (even-odd) ' + (reg && reg.loops.length));
      near(rfDWArea(reg.loops[0]) - rfDWArea(reg.loops[1]) + rfDWArea(reg.loops[2]), 80 * 60 - Math.PI * 400 + 16 * 12, 2, 'filled area (circle as a 96-gon)');
      void c;
    });

    test('rfDW2: a face fill on a face partly hidden by a body in front of it (Front view: block 4 x 2, a 1 x 1 block floating in front) is drawn only where the face shows — Solid pieces add up to 7 sq in, no hatch line under the front block; a face nothing hides keeps its single outline', function () {
      var r = rfDWDoc('p.name("Hidden face").units("in");\np.box(4, 1, 2);\np.box(1, 1, 1, { at: [1, 0.5, 2], merge: false });');
      var w = r.win(r.F.id), s = w.scale;
      var f = DWg.addAreaFill(r.doc, { view: r.F.id, p: [3, 1], fill: 'solid' }, r.mesh, w.frame);
      r.recompute();
      var reg = r.sheet.prims.filter(function (p) { return p.k === 'region' && p.areaFill === f.id; })[0];
      assert(reg && reg.loops.length > 1, 'pieces ' + (reg && reg.loops.length));
      var a = 0; reg.loops.forEach(function (l) { a += rfDWArea(l); });
      near(a / (s * s), 7, 1e-6, 'visible area');
      w = r.win(r.F.id);
      function under(q) { var m = w.fromSheet(q); return m[0] > 1.01 && m[0] < 1.99 && m[1] > 0.51 && m[1] < 1.49; }
      DWg.editAreaFill(r.doc, f.id, { fill: 'hatch', pattern: 'ANSI31' });
      r.recompute(); w = r.win(r.F.id);
      var lines = r.sheet.prims.filter(function (p) { return p.areaFill === f.id; });
      assert(lines.length > 5 && !lines.some(function (q) { return rfDWSegIn(q, under); }), 'no hatch under the front block');
      assert(lines.some(function (q) { return rfDWSegIn(q, function (z) { var m = w.fromSheet(z); return m[0] > 2.1; }); }), 'hatch beside it');
      // the joined lines: no two hatch lines on one line touch end to end
      var touch = 0;
      lines.forEach(function (p, i) { lines.forEach(function (q, j) { if (j > i && Math.hypot(p.b[0] - q.a[0], p.b[1] - q.a[1]) < 1e-7 && Math.abs((p.b[0] - p.a[0]) * (q.b[1] - q.a[1]) - (p.b[1] - p.a[1]) * (q.b[0] - q.a[0])) < 1e-9) touch++; }); });
      assert(touch === 0, 'pieces joined ' + touch);
      // the front block's own face: nothing in front, one outline
      var f2 = DWg.addAreaFill(r.doc, { view: r.F.id, p: [1.5, 1], fill: 'solid' }, r.mesh, w.frame);
      r.recompute();
      var reg2 = r.sheet.prims.filter(function (p) { return p.k === 'region' && p.areaFill === f2.id; })[0];
      assert(reg2 && reg2.loops.length === 1, 'one loop ' + (reg2 && reg2.loops.length));
      near(rfDWArea(reg2.loops[0]) / (s * s), 1, 1e-6, 'front block face');
      assert(DWg.visibleFacePieces(r.mesh, DWg.faceAt(r.mesh, w.frame, [1.5, 1]), w.frame) === null, 'nothing in front');
    });
  })();
