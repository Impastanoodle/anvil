  // --- rfCX (2026-10-20, lane CX: drawing views) --- Removed Section (the cross-section alone, placed anywhere, SECTION
  // A-A with its cutting line on the parent), section views that follow their parent's scale (Use parent scale) and the
  // part as it changes, Detail View Full outline round the detail view, and solid fills clipped to a non-convex
  // sketched detail profile (not its convex hull).
  (function () {
    group('rfCX: Removed Section, sections follow the parent and the part, detail outlines, non-convex detail fills');
    var CX = typeof Drawing !== 'undefined' ? Drawing : null;
    // an inch angle 1.5 x 1.5 x t, 4 long along Z (the Top view looks down its length)
    function rfCXAngle(t) {
      t = t || 0.125;
      return 'p.name("Angle").units("in");\np.sketch("Front").polyline([[0,0],[1.5,0],[1.5,' + t + '],[' + t + ',' + t + '],[' + t + ',1.5],[0,1.5]], true).extrude(4);';
    }
    function rfCXDoc(code) {
      var r = build(code);
      noErrors(r);
      r.doc = CX.newDrawing(r.model, { date: '2026-10-20', scale: [1, 1] });
      CX.standard3View(r.doc, r.mesh, r.model.units);
      r.role = function (role) { return r.doc.views.filter(function (v) { return v.role === role; })[0]; };
      r.sheet = function (mesh) { r.sh = CX.compute(r.doc, mesh || r.mesh, r.model); return r.sh; };
      r.win = function (id, sh) { return (sh || r.sh).views.filter(function (w) { return w.view.id === id; })[0]; };
      return r;
    }
    function rfCXArea(l) { var a = 0; for (var i = 0, j = l.length - 1; i < l.length; j = i++) a += (l[j][0] + l[i][0]) * (l[j][1] - l[i][1]); return Math.abs(a / 2); }
    function rfCXCapArea(w) { var a = 0; w.content.caps.forEach(function (c) { c.loops.forEach(function (l) { a += rfCXArea(l); }); }); return a; }
    function rfCXRemoved(r) {
      var top = r.role('top'), ex = CX.viewExtents(r.doc, r.mesh, top);
      return CX.addRemovedSection(r.doc, r.mesh, top.id, { a: [ex.umin, ex.cv], b: [ex.umax, ex.cv] });
    }

    test('rfCX: Removed Section of an inch angle — the cut face only (one L-shaped face, .359375 sq in, six outline lines, no hidden lines), hatched, SECTION A-A, not aligned, the cutting line between the two edges on the parent; in SVG, both DXFs (layer SECTION_A) and the PDF', function () {
      var r = rfCXDoc(rfCXAngle()), v = rfCXRemoved(r), top = r.role('top');
      assert(v.kind === 'section' && v.section.removed && v.section.axis === 'h' && v.align == null && v.name === 'Removed Section A-A', JSON.stringify(v));
      assert(CX.isRemovedSection(v) && JSON.stringify(v.section.partial) === '[0,1.5]', 'line from edge to edge: ' + JSON.stringify(v.section));
      var sh = r.sheet(), w = r.win(v.id);
      assert(w.content.caps.length === 1 && w.content.caps[0].loops.length === 1 && w.content.caps[0].loops[0].length === 6, 'one L face ' + JSON.stringify(w.content.caps.map(function (c) { return c.loops.map(function (l) { return l.length; }); })));
      assert(Math.abs(rfCXCapArea(w) - (1.5 * 0.125 * 2 - 0.125 * 0.125)) < 1e-9, 'area ' + rfCXCapArea(w));
      var vis = sh.prims.filter(function (p) { return p.layer === w.layer && p.k === 'line' && p.style === 'visible'; });
      var hid = sh.prims.filter(function (p) { return p.layer === w.layer && p.style === 'hidden'; });
      assert(vis.length === 6 && !hid.length && w.hatch > 5, vis.length + ' visible, ' + hid.length + ' hidden, ' + w.hatch + ' hatch lines');
      assert(Math.abs(w.box.x1 - w.box.x0 - 1.5) < 1e-9 && Math.abs(w.box.y1 - w.box.y0 - 1.5) < 1e-9, 'box 1.5 x 1.5 ' + JSON.stringify(w.box));
      var texts = sh.prims.filter(function (p) { return p.k === 'text' && p.layer === w.layer; }).map(function (p) { return p.text; });
      assert(texts.join('|') === 'SECTION A-A', 'label ' + texts.join('|'));
      var pw = r.win(top.id), cut = sh.prims.filter(function (p) { return p.layer === pw.layer && p.style === 'chain'; });
      assert(cut.length === 1 && Math.abs(Math.abs(cut[0].b[0] - cut[0].a[0]) - 1.5) < 1e-9 && Math.abs(cut[0].a[1] - cut[0].b[1]) < 1e-9, 'cutting line on the parent ' + JSON.stringify(cut));
      assert(sh.prims.filter(function (p) { return p.layer === pw.layer && p.k === 'text' && p.text === 'A'; }).length === 2, 'A at both arrows');
      var svg = CX.toSVG(sh), d12 = CX.toDXF(sh), d20 = CX.toDXF(sh, { version: 'R2000' }), pdf = CX.toPDF(sh);
      assert(svg.indexOf('SECTION A-A') > 0 && d12.indexOf('SECTION A-A') > 0 && d20.indexOf('SECTION_A') > 0 && pdf.indexOf('SECTION A-A') > 0, 'exports');
      return vis.length + ' lines, ' + w.hatch + ' hatch lines';
    });

    test('rfCX: a removed section shows nothing behind the cut — a bar with a taller block at its end, cut across the bar: the bar\'s 4 x 1 face only, from either side, where the full section on the same line also draws the block behind', function () {
      var r = rfCXDoc('p.name("Step").units("in");\np.sketch("Front").rect(0, 0, 4, 1).extrude(4);\np.sketch("Front").rect(0, 0, 4, 3).extrude(1);');
      var top = r.role('top'), ex = CX.viewExtents(r.doc, r.mesh, top), out = [];
      [1, -1].forEach(function (sg) {
        var v = CX.addRemovedSection(r.doc, r.mesh, top.id, { a: [ex.umin, -3], b: [ex.umax, -3], sign: sg });
        var f = CX.addSectionView(r.doc, r.mesh, top.id, { axis: 'h', at: -3, sign: sg });
        r.sheet();
        var w = r.win(v.id), wf = r.win(f.id), b = w.proj.bounds, bf = wf.proj.bounds;
        assert(Math.abs(b.umax - b.umin - 4) < 1e-9 && Math.abs(b.vmax - b.vmin - 1) < 1e-9, 'removed: the 4 x 1 face only ' + JSON.stringify(b));
        assert(Math.abs(rfCXCapArea(w) - 4) < 1e-9 && w.proj.stats.visibleLines === 4, 'face 4 sq in, 4 lines: ' + rfCXCapArea(w) + ' / ' + w.proj.stats.visibleLines);
        out.push(sg + ': full ' + (bf.vmax - bf.vmin).toFixed(3) + ' tall');
      });
      assert(out.some(function (s) { return / 3\.000 tall/.test(s); }), 'the full section sees the block from one side: ' + out.join(', '));
      return out.join(' · ');
    });

    test('rfCX: a removed section follows the part — the angle made .25 thick re-cuts at the same line (face .6875 sq in); Scale with model changes keeps the line on the part when it grows; refused: two equal points, a half section, clearing its ends; it goes with its parent', function () {
      var r = rfCXDoc(rfCXAngle()), v = rfCXRemoved(r), top = r.role('top');
      var r2 = build(rfCXAngle(0.25));
      noErrors(r2);
      r.sheet(r2.mesh);
      assert(Math.abs(rfCXCapArea(r.win(v.id)) - (1.5 * 0.25 * 2 - 0.25 * 0.25)) < 1e-9, 'thicker face ' + rfCXCapArea(r.win(v.id)));
      // Scale with model changes: a longer angle (8) keeps the line half-way along it
      CX.setSectionOptions(r.doc, r.mesh, v.id, { scaleWithModel: true });
      var r3 = build(rfCXAngle().replace('extrude(4)', 'extrude(8)'));
      r.sheet(r3.mesh);
      assert(Math.abs(v.section.at - -4) < 1e-9 && r.win(v.id).content.caps.length === 1, 'line at the middle of the longer part: ' + v.section.at);
      function throws(fn) { try { fn(); } catch (e) { return e.message; } return null; }
      assert(throws(function () { CX.addRemovedSection(r.doc, r.mesh, top.id, { a: [1, 1], b: [1, 1] }); }), 'equal points refused');
      assert(throws(function () { CX.setSectionType(r.doc, v.id, { type: 'half', c: 0.5, side: 1 }); }), 'half refused');
      assert(throws(function () { CX.setSectionOptions(r.doc, r.mesh, v.id, { partial: null }); }) && v.section.partial, 'its ends stay');
      assert(throws(function () { CX.addRemovedSection(r.doc, r.mesh, v.id, { a: [0, 0], b: [1, 0] }); }), 'none from a removed section');
      var n = r.doc.views.length;
      CX.deleteView(r.doc, top.id);
      assert(r.doc.views.length === n - 2 && !CX.findView(r.doc, v.id), 'deleted with its parent');
      return 'ok';
    });

    test('rfCX: saved and read back (.drawing file), on a second sheet and back, a removed section is the same view with the same linework', function () {
      var r = rfCXDoc(rfCXAngle()), v = rfCXRemoved(r);
      var sh0 = r.sheet(), n0 = sh0.prims.filter(function (p) { return p.layer === r.win(v.id).layer; }).length;
      var back = CX.readDrawingFile(JSON.stringify(CX.drawingFile(r.doc, r.model, 'Angle')));
      assert(JSON.stringify(back.drawing) === JSON.stringify(r.doc), 'same drawing');
      var v2 = CX.findView(back.drawing, v.id);
      assert(v2 && v2.section.removed && v2.align == null, 'still removed');
      var sh1 = CX.compute(back.drawing, r.mesh, r.model), w1 = sh1.views.filter(function (w) { return w.view.id === v.id; })[0];
      assert(sh1.prims.filter(function (p) { return p.layer === w1.layer; }).length === n0, 'same prims');
      CX.addSheet(r.doc, {});
      CX.activateSheet(r.doc, 0);
      assert(CX.findView(r.doc, v.id) && CX.findView(r.doc, v.id).section.removed, 'back on sheet 1');
      return n0 + ' prims';
    });

    test('rfCX: a section at its parent\'s scale follows it (Use parent scale) — the parent set to 1:2 draws the section and the removed section at 1:2 with SCALE 1 : 2; a custom scale stays', function () {
      var r = rfCXDoc(rfCXAngle()), top = r.role('top'), front = r.role('front');
      var s1 = CX.addSectionView(r.doc, r.mesh, front.id, { axis: 'v', at: 0.75 }), rm = rfCXRemoved(r);
      var s2 = CX.addSectionView(r.doc, r.mesh, top.id, { axis: 'v', at: 0.5, scale: [2, 1] });
      assert(s1.section.parentScale && rm.section.parentScale && !s2.section.parentScale && JSON.stringify(s2.scale) === '[2,1]', 'flags');
      front.scale = [1, 2]; top.scale = [1, 2];
      var sh = r.sheet();
      assert(JSON.stringify(s1.scale) === '[1,2]' && JSON.stringify(rm.scale) === '[1,2]' && JSON.stringify(s2.scale) === '[2,1]', 'scales ' + JSON.stringify([s1.scale, rm.scale, s2.scale]));
      [s1, rm].forEach(function (v) {
        var w = r.win(v.id), t = sh.prims.filter(function (p) { return p.k === 'text' && p.layer === w.layer; }).map(function (p) { return p.text; });
        assert(t.indexOf('SCALE 1 : 2') >= 0 && Math.abs(w.scale - 0.5) < 1e-12, v.name + ': ' + t.join('|'));
      });
      front.scale = null; r.sheet();
      assert(s1.scale == null, 'back to the sheet scale with its parent');
      return 'ok';
    });

    test('rfCX: Detail View Full outline is drawn round the detail view itself — the circle (radius × the detail scale, on the view\'s centre), the rectangle profile, the sketched profile as sketched', function () {
      var r = rfCXDoc('p.name("Plate").units("in");\np.box(6, 4, 0.25);\np.hole("Top", 1, -1, 0.5, { offset: 0.25 });'), top = r.role('top');
      var dc = CX.addDetailView(r.doc, r.mesh, top.id, { c: [1, -1], r: 0.6, outline: 'full' });
      var dr = CX.addDetailView(r.doc, r.mesh, top.id, { shape: 'profile', a: [0.2, -1.6], b: [1.8, -0.4], outline: 'full' });
      var dp = CX.addDetailView(r.doc, r.mesh, top.id, { pts: [[0.2, -1.6], [1.8, -1.6], [1.8, -1], [1, -1], [1, -0.4], [0.2, -0.4]], outline: 'full' });
      var sh = r.sheet();
      function outl(v) { return sh.prims.filter(function (p) { return p.detailOutline === v.id; }); }
      var oc = outl(dc), wc = r.win(dc.id), cc = wc.toSheet([1, -1]);
      assert(oc.length === 1 && oc[0].k === 'circle' && Math.abs(oc[0].r - 0.6 * wc.scale) < 1e-9 && Math.hypot(oc[0].c[0] - cc[0], oc[0].c[1] - cc[1]) < 1e-9, 'circle ' + JSON.stringify(oc));
      assert(outl(dr).length === 4 && outl(dr).every(function (p) { return p.k === 'line'; }), 'rectangle ' + outl(dr).length);
      var wp = r.win(dp.id), op = outl(dp);
      assert(op.length === 6 && op.every(function (p) { return p.k === 'line' && p.a[0] >= wp.box.x0 - 1e-9 && p.a[0] <= wp.box.x1 + 1e-9; }), 'sketched profile ' + op.length);
      return 'circle r ' + oc[0].r.toFixed(3);
    });

    test('rfCX: a solid area fill in a detail with a non-convex (L) sketched profile is clipped to the L itself, not its convex hull (300 mm² of the 10 thick middle region at 1:1 × the detail scale²); the convex pieces of an L are two', function () {
      var r = rfCXDoc('p.sketch("Front").rect(0, 0, 100, 50).circle(20, 25, 5).circle(80, 25, 5).extrude(10);'), front = r.role('front');
      var S = CX.addSectionView(r.doc, r.mesh, front.id, { axis: 'h', at: 25, sign: 1 });
      var sh = r.sheet(), mid = CX.hatchRegions(r.win(S.id)).filter(function (g) { return Math.abs(g.p[0] - 50) < 1e-6; })[0];
      CX.setAreaHatch(r.doc, S.id, mid.p, { pattern: 'SOLID' });
      var b = r.win(S.id).proj.bounds, y0 = b.vmin - 1, y1 = b.vmax + 1, ym = (b.vmin + b.vmax) / 2;
      var L = [[30, y0], [70, y0], [70, ym], [50, ym], [50, y1], [30, y1]];
      var d = CX.addDetailView(r.doc, r.mesh, S.id, { pts: L });
      sh = r.sheet();
      var w = r.win(d.id), reg = sh.prims.filter(function (p) { return p.k === 'region' && p.layer === w.layer; });
      var area = 0; reg.forEach(function (p) { p.loops.forEach(function (l) { area += rfCXArea(l); }); });
      var want = 300 * w.scale * w.scale;
      assert(reg.length === 1 && Math.abs(area - want) < want * 1e-6, 'filled ' + area.toFixed(4) + ' of ' + want);
      var pieces = CX.convexPieces([[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]]);
      assert(pieces.length === 2 && Math.abs(pieces.reduce(function (s, P) { return s + rfCXArea(P); }, 0) - 5) < 1e-12, 'pieces ' + JSON.stringify(pieces));
      return area.toFixed(2) + ' paper²';
    });

    // --- rfCX2 (2026-10-20, lane CX2) --- typed sections cut in drawing-worker.js; no straight cutting line under a
    // typed section's path; the view kinds called directly (no wrappers)
    var CX2_PLATE = 'p.name("CX2Plate").units("mm");\np.box(120, 80, 10);\np.hole("Top", 30, -20, 10, { offset: 10 });\np.hole("Top", 90, -60, 10, { offset: 10 });';
    function rfCX2Clone(x) { return typeof structuredClone === 'function' ? structuredClone(x) : x; }
    test('rfCX2: offset and aligned sections in the lazy compute are jobs for drawing-worker.js (section.path) with a placeholder and no cut on the main thread; sectionJob / putSection on a structured copy give the synchronous sheet', function () {
      var r = rfCXDoc(CX2_PLATE), top = r.role('top');
      var off = CX.addSectionView(r.doc, r.mesh, top.id, { axis: 'h', at: -20, type: 'offset', jogs: [{ t: 60, at: -60 }] });
      var al = CX.addSectionView(r.doc, r.mesh, top.id, { axis: 'v', at: 30, type: 'aligned', c: -40, side: 1, angle: 30 });
      CX.compute(r.doc, r.mesh, r.model);   // the model views' projections cached; the cuts dropped below
      delete r.mesh._drawingSections;
      var lazy = CX.compute(r.doc, r.mesh, r.model, { lazy: true }), jobs = lazy.pending.filter(function (j) { return j.section && j.section.path; });
      assert(jobs.length === 2 && lazy.pending.length === 2, 'jobs ' + JSON.stringify(lazy.pending.map(function (j) { return j.key; })));
      [off, al].forEach(function (v) { var w = lazy.views.filter(function (x) { return x.view.id === v.id; })[0]; assert(w.pending && !w.hatch, v.name + ' placeholder'); });
      assert(!r.mesh._drawingSections || !Object.keys(r.mesh._drawingSections).length, 'a cut on the main thread');
      var res = jobs.map(function (j) { return rfCX2Clone(CX.sectionJob(r.mesh, j.section, j.frame, j.display, j.tangent)); });
      delete r.mesh._drawingSections;
      jobs.forEach(function (j, i) { CX.putSection(r.mesh, j.section, j.frame, j.display, j.tangent, res[i]); });
      var done = CX.compute(r.doc, r.mesh, r.model, { lazy: true });
      assert(!done.pending.length, 'still pending ' + done.pending.length);
      var r2 = build(CX2_PLATE), sync = CX.compute(JSON.parse(JSON.stringify(r.doc)), r2.mesh, r2.model);
      assert(CX.toSVG(done) === CX.toSVG(sync), 'the sheet from the worker\'s answers differs from the synchronous one');
      return [off, al].map(function (v) { var w = done.views.filter(function (x) { return x.view.id === v.id; })[0]; return v.section.type + ' ' + w.hatch + ' hatch lines'; }).join(', ');
    });
    test('rfCX2: a typed section\'s cutting line is its path only — every chain line on the parent belongs to the path (cutLine), none is the straight full-section line; a full section next to it keeps its straight line', function () {
      var r = rfCXDoc(CX2_PLATE), top = r.role('top');
      var off = CX.addSectionView(r.doc, r.mesh, top.id, { axis: 'h', at: -20, type: 'offset', jogs: [{ t: 60, at: -60 }] });
      var sh = r.sheet(), pw = r.win(top.id), chain = sh.prims.filter(function (p) { return p.layer === pw.layer && p.style === 'chain'; });
      assert(chain.length === 3 && chain.every(function (p) { return p.cutLine === off.id; }), 'path legs only: ' + chain.length + ' ' + JSON.stringify(chain.map(function (p) { return p.cutLine; })));
      var full = CX.addSectionView(r.doc, r.mesh, top.id, { axis: 'v', at: 60 });
      sh = r.sheet(); pw = r.win(top.id);
      var straight = sh.prims.filter(function (p) { return p.layer === pw.layer && p.style === 'chain' && p.cutLine == null; });
      assert(straight.length === 1 && Math.abs(straight[0].a[0] - straight[0].b[0]) < 1e-9, 'the full section\'s straight line ' + straight.length);
      return 'ok';
    });
    test('rfCX2: the view kinds are called directly (no wrappers): Line Format, the drawing sketch, a broken-out section, a jagged detail and an Area Hatch region all show in one sheet, and _.viewKindMarks is the plain function', function () {
      var r = rfCXDoc(CX2_PLATE), top = r.role('top'), front = r.role('front');
      assert(CX._.viewKindMarks.toString().indexOf('baseMarks') < 0 && CX._.auxCenter.toString().indexOf('contentExtras') < 0, 'no wrapper');
      var S = CX.addSectionView(r.doc, r.mesh, front.id, { axis: 'v', at: 30 });
      r.sheet();
      var reg = CX.hatchRegions(r.win(S.id))[0];
      CX.setAreaHatch(r.doc, S.id, reg.p, { pattern: 'SOLID' });
      var det = CX.addDetailView(r.doc, r.mesh, top.id, { c: [30, -20], r: 12, outline: 'jagged' });
      CX.addBrokenOut(r.doc, front.id, { shape: 'rect', a: [80, 2], b: [100, 8], depth: 50 });
      CX.addSketchEntity(r.doc, { t: 'line', a: [10, 10], b: [40, 10] });
      var sh = r.sheet();
      assert(sh.prims.some(function (p) { return p.k === 'region' && p.layer === r.win(S.id).layer; }), 'Area Hatch region');
      assert(sh.prims.some(function (p) { return p.detailOutline === det.id; }) && r.win(det.id).content.jagged, 'jagged detail');
      assert(r.win(front.id).content.brokenOut, 'broken-out');
      assert(sh.prims.some(function (p) { return p.k === 'line' && Math.abs(p.a[0] - 10) < 1e-9 && Math.abs(p.b[0] - 40) < 1e-9 && Math.abs(p.a[1] - 10) < 1e-9; }), 'the sketch line on the sheet');
      return 'ok';
    });
  })();
