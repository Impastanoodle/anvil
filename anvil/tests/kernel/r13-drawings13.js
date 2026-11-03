  // --- r13/drawings13 ---
  (function () {
    function exCode(name) { return AnvilExamples.filter(function (e) { return e.name === name; })[0].code; }
    function viewOf(doc, orient) { return doc.views.filter(function (v) { return v.orient === orient && !v.kind; })[0]; }
    function clone(x) { return typeof structuredClone === 'function' ? structuredClone(x) : x; }
    test('sheet-metal bends on Anvil\'s kernel are drawn as arcs (fitArcs): the U-bracket\'s Front view and its section are 8 lines and 4 arcs of R2 / R4, as on OpenCascade (were 40 lines, 0 arcs); an ellipse\'s chords stay lines', function () {
      var r = build(exCode('Sheet-metal U-bracket')), doc = DW.newDrawing(r.model, { date: '2026-10-04' });
      DW.standard3View(doc, r.mesh, r.model.units, { autoInsert: false });
      var sec = DW.addSectionView(doc, r.mesh, viewOf(doc, 'Top').id, { axis: 'h', at: -15 });
      var sh = DW.compute(doc, r.mesh, r.model), F = sh.views[0], S = sh.views.filter(function (w) { return w.view.id === sec.id; })[0];
      [F, S].forEach(function (w) {
        assert(w.proj.lines.visible.length === 8 && w.proj.arcs.visible.length === 4, w.view.name + ': ' + w.proj.lines.visible.length + ' lines, ' + w.proj.arcs.visible.length + ' arcs');
        var rs = w.proj.arcs.visible.map(function (a) { return Math.round(a.r * 1e6) / 1e6; }).sort();
        assert(JSON.stringify(rs) === '[2,2,4,4]', 'radii ' + rs);
        w.proj.arcs.visible.forEach(function (a) { assert(Math.abs(a.a1 - a.a0 - 90) < 1e-6, '90° bend, got ' + (a.a1 - a.a0)); });
      });
      // every arc end meets a line end (the flats run on tangent from the bend)
      S.proj.arcs.visible.forEach(function (a) {
        [a.a0, a.a1].forEach(function (t) {
          var p = [a.c[0] + a.r * Math.cos(t * Math.PI / 180), a.c[1] + a.r * Math.sin(t * Math.PI / 180)];
          assert(S.proj.lines.visible.some(function (l) { return Math.hypot(l[0] - p[0], l[1] - p[1]) < 1e-6 || Math.hypot(l[2] - p[0], l[3] - p[1]) < 1e-6; }), 'arc end ' + p + ' meets no line');
        });
      });
      assert(S.hatch > 0, 'hatched');
      // half an ellipse as 12 chords stays lines; six equal chords of a quarter circle are one arc
      var segs = [], n = 24;
      for (var i = 0; i < n / 2; i++) { var t0 = i * 2 * Math.PI / n, t1 = (i + 1) * 2 * Math.PI / n; segs.push([30 * Math.cos(t0), 10 * Math.sin(t0), 30 * Math.cos(t1), 10 * Math.sin(t1), 0]); }
      assert(!DW.fitArcs(segs, 100).arcs.length, 'half an ellipse fitted as an arc');
      var cs = [];
      for (var j = 0; j < 6; j++) { var u0 = j * Math.PI / 12, u1 = (j + 1) * Math.PI / 12; cs.push([5 * Math.cos(u0), 5 * Math.sin(u0), 5 * Math.cos(u1), 5 * Math.sin(u1), 0]); }
      var fa = DW.fitArcs(cs, 100);
      assert(fa.arcs.length === 1 && !fa.lines.length && Math.abs(fa.arcs[0].r - 5) < 1e-9 && Math.abs(fa.arcs[0].a0) < 1e-9 && Math.abs(fa.arcs[0].a1 - 90) < 1e-9, 'six equal chords of a quarter circle: ' + JSON.stringify(fa.arcs));
      return 'Front ' + F.proj.lines.visible.length + ' lines / ' + F.proj.arcs.visible.length + ' arcs; section ' + S.proj.lines.visible.length + ' / ' + S.proj.arcs.visible.length + ', ' + S.hatch + ' hatch lines';
    });
    test('assembly section views hatch each part with its material\'s pattern (steel ANSI32, brass ANSI33, aluminium ANSI38, ABS ANSI34, none ANSI31; were all ANSI31), touching parts still at different angles', function () {
      var code = [
        'a.name("Mat asm").units("mm");',
        'a.insert({ script: \'p.name("Plate"); p.material("Plain Carbon Steel"); p.sketch("Top").rect(0, -60, 100, 60).end().extrude(8); p.hole("Top", 10, -10, 8, { offset: 8 });\' }, { fixed: true });',
        'a.insert({ script: \'p.name("Pin"); p.material("Brass"); p.cylinder(4, 20);\' }, { position: [10, 0, 10] });',
        'a.insert({ script: \'p.name("Cap"); p.material("6061-T6 (SS)"); p.box(30, 5, 20);\' }, { position: [35, 8, 20] });',
        'a.insert({ script: \'p.name("Block"); p.material("ABS"); p.box(20, 10, 20);\' }, { position: [65, 8, 20] });',
        'a.insert({ script: \'p.name("Spacer"); p.box(10, 4, 10);\' }, { position: [5, 8, 40] });'
      ].join('\n');
      var a = buildAsm(code), doc = DW.newDrawing(a.model, { date: '2026-10-04' });
      DW.standard3View(doc, a.mesh, a.model.units, { autoInsert: false });
      var top = viewOf(doc, 'Top'), out = [];
      var s1 = DW.addSectionView(doc, a.mesh, top.id, { axis: 'h', at: -10 }), s2 = DW.addSectionView(doc, a.mesh, top.id, { axis: 'h', at: -22 }), s3 = DW.addSectionView(doc, a.mesh, top.id, { axis: 'h', at: -42 });
      var sh = DW.compute(doc, a.mesh, a.model, { build: a.build });
      function hatches(v) { return sh.views.filter(function (w) { return w.view.id === v.id; })[0].hatches; }
      var mats = DW.asmPartMaterials(a.model, a.build);
      assert(JSON.stringify(mats) === JSON.stringify(['Plain Carbon Steel', 'Brass', '6061-T6 (SS)', 'ABS', null]), 'materials by part tag ' + JSON.stringify(mats));
      var want = { 0: 'ANSI32', 1: 'ANSI33', 2: 'ANSI38', 3: 'ANSI34', 4: 'ANSI31' };
      [s1, s2, s3].forEach(function (v) {
        var hs = hatches(v);
        assert(hs.length >= 2, v.name + ': ' + hs.length + ' cut parts');
        hs.forEach(function (h) { assert(h.pattern === want[h.part], v.name + ' part ' + h.part + ': ' + h.pattern); out.push(h.part + ':' + h.pattern + '@' + h.angle); });
      });
      // neighbours (the cap on the plate and against the block, the pin in its hole) keep different angles
      var ang = {}; hatches(s2).forEach(function (h) { ang[h.part] = h.angle; });
      assert(ang[0] !== ang[2] && ang[2] !== ang[3], 'touching parts share an angle ' + JSON.stringify(ang));
      var an1 = {}; hatches(s1).forEach(function (h) { an1[h.part] = h.angle; });
      assert(an1[0] !== an1[1], 'pin and plate ' + JSON.stringify(an1));
      // without a build (materials unknown): ANSI31 as before
      var bare = DW.compute(doc, a.mesh, a.model, {});
      assert(bare.views.every(function (w) { return (w.hatches || []).every(function (h) { return h.pattern === 'ANSI31'; }); }), 'no build: ANSI31');
      return out.join(', ');
    });
    test('ANSI dimension text: horizontal (vertical dimensions too), centred in a break of the dimension line; a dimension too small for its text has its arrows outside and the text beyond them; one text height (3.5 mm capitals) in SVG, PDF and DXF', function () {
      var r = build('p.box(60, 40, 5);'), doc = DW.newDrawing(r.model, { date: '2026-10-04' });
      DW.standard3View(doc, r.mesh, r.model.units, { autoInsert: false });
      var fr = viewOf(doc, 'Front');
      var b = DW.compute(doc, r.mesh, r.model).views.filter(function (w) { return w.view.id === fr.id; })[0].proj.bounds;
      fr.dims = [{ kind: 'h', a: [b.umin, b.vmin], b: [b.umax, b.vmin], side: -1, value: b.umax - b.umin }, { kind: 'v', a: [b.umax, b.vmin], b: [b.umax, b.vmax], side: 1, value: b.vmax - b.vmin }];
      var sh = DW.compute(doc, r.mesh, r.model), F = sh.views.filter(function (w) { return w.view.id === fr.id; })[0];
      var dhs = sh.dims.filter(function (d) { return d.kind === 'h'; }), dvs = sh.dims.filter(function (d) { return d.kind === 'v'; }), dh = dhs[dhs.length - 1], dv = dvs[dvs.length - 1];   // (ours come after the model items)
      assert(dh && dv && dh.text === '60' && dv.text === '5', 'dims ' + sh.dims.map(function (d) { return d.text; }));
      // the 60: in the middle of a broken line, its baseline 1.75 below the line (capitals centred on it)
      var yLine = F.toSheet([0, dh.lineAt])[1], t60 = sh.prims.filter(function (p) { return p.layer === 'DIMENSIONS' && p.k === 'text' && p.text === '60' && Math.abs(p.p[1] - (yLine - 1.75)) < 1; })[0];
      assert(t60 && t60.rot === 0 && Math.abs(t60.h - 3.5) < 1e-9 && Math.abs(t60.p[1] - (yLine - 1.75)) < 1e-9, '60: ' + JSON.stringify(t60));
      var onLine = sh.prims.filter(function (p) { return p.layer === 'DIMENSIONS' && p.k === 'line' && Math.abs(p.a[1] - yLine) < 1e-9 && Math.abs(p.b[1] - yLine) < 1e-9; });
      assert(onLine.length === 2, 'the 60\'s line in ' + onLine.length + ' pieces');
      var gapL = Math.min.apply(null, onLine.map(function (l) { return Math.max(l.a[0], l.b[0]); })), gapR = Math.max.apply(null, onLine.map(function (l) { return Math.min(l.a[0], l.b[0]); })), hw = 2 * 0.78 * 3.5 / 2;
      assert(gapL < t60.p[0] - hw && gapR > t60.p[0] + hw, 'the break holds the text: ' + gapL + ' .. ' + gapR + ' round ' + t60.p[0]);
      // the 5 (vertical): horizontal text, arrows outside pointing in, the text beyond the upper arrow on the line
      var xLine = F.toSheet([dv.lineAt, 0])[0], t5 = sh.prims.filter(function (p) { return p.layer === 'DIMENSIONS' && p.k === 'text' && p.text === '5' && Math.abs(p.p[0] - xLine) < 1; })[0];
      var ya = F.toSheet([0, b.vmin])[1], yb = F.toSheet([0, b.vmax])[1];
      assert(t5 && t5.rot === 0 && Math.abs(t5.p[0] - xLine) < 1e-9 && t5.p[1] > yb + 3, '5: text beyond the arrows ' + JSON.stringify(t5));
      var arr5 = sh.prims.filter(function (p) { return p.layer === 'DIMENSIONS' && p.k === 'fill' && Math.abs(p.pts[0][0] - xLine) < 1e-9; });
      assert(arr5.length === 2 && arr5.every(function (p) { var tip = p.pts[0], tail = p.pts[1]; return Math.abs(tip[1] - ya) < 1e-9 ? tail[1] < ya : tail[1] > yb; }), 'arrows point in from outside');
      assert(Math.abs(dv.txNow - (t5.p[1] + 1.75 - (ya + yb) / 2)) < 1e-9, 'txNow ' + dv.txNow);
      // writers: one text height everywhere
      var svg = DW.toSVG(sh), pdf = DW.toPDF(sh), dxf = DW.toDXF(sh);
      assert(svg.indexOf('font-family="&quot;Century Gothic&quot;') > 0 && svg.indexOf('font-size="' + (Math.round(3.5 / 0.72 * 1e4) / 1e4) + '"') > 0, 'SVG: Century Gothic at 3.5 / 0.72');
      assert(pdf.indexOf('/F1 ' + (Math.round(3.5 / 0.718 * 72 / 25.4 * 1e4) / 1e4) + ' Tf') > 0, 'PDF: Helvetica with 3.5 mm capitals');
      assert(dxf.indexOf('\n0\nTABLE\n2\nSTYLE\n') > 0 && dxf.indexOf('\n3\nGOTHIC.TTF\n') > 0 && dxf.indexOf('\n40\n3.5\n1\n60\n') > 0, 'DXF: STYLE GOTHIC.TTF, TEXT height 3.5');
      // a title block caption: SVG font-size 2.8 (rfHB, was 2.2)
      assert(sh.prims.some(function (p) { return p.layer === 'SHEET' && p.k === 'text' && Math.abs(p.h - 2.8 * 0.72) < 1e-9; }) && svg.indexOf('font-size="2.8"') > 0, 'title block label size');
      return '60 in a break [' + gapL.toFixed(2) + ', ' + gapR.toFixed(2) + ']; 5 above the arrows at ' + t5.p[1].toFixed(2);
    });
    test('section views in the lazy compute: a pending job with its cut for drawing-worker.js and a placeholder (no cut on the main thread); sectionJob / putSection on a structured copy give the synchronous sheet', function () {
      var code = exCode('Sheet-metal U-bracket'), r = build(code), doc = DW.newDrawing(r.model, { date: '2026-10-04' });
      DW.standard3View(doc, r.mesh, r.model.units, { autoInsert: false });
      var sec = DW.addSectionView(doc, r.mesh, viewOf(doc, 'Top').id, { axis: 'h', at: -30 });
      DW.compute(doc, r.mesh, r.model);   // the standard views' projections cached; the cut dropped below
      delete r.mesh._drawingSections;
      var lazy = DW.compute(doc, r.mesh, r.model, { lazy: true }), jobs = lazy.pending.filter(function (j) { return j.section; });
      assert(jobs.length === 1 && lazy.pending.length === 1, 'jobs ' + JSON.stringify(lazy.pending.map(function (j) { return j.key; })));
      var w = lazy.views.filter(function (x) { return x.view.id === sec.id; })[0];
      assert(w.pending && !w.section && !w.hatch, 'placeholder');
      assert(!r.mesh._drawingSections || !Object.keys(r.mesh._drawingSections).length, 'a cut on the main thread');
      var j = jobs[0], res = clone(DW.sectionJob(r.mesh, j.section, j.frame, j.display, j.tangent));
      delete r.mesh._drawingSections;
      DW.putSection(r.mesh, j.section, j.frame, j.display, j.tangent, res);
      var done = DW.compute(doc, r.mesh, r.model, { lazy: true });
      assert(!done.pending.length, 'still pending ' + done.pending.length);
      var r2 = build(code), sync = DW.compute(JSON.parse(JSON.stringify(doc)), r2.mesh, r2.model);
      assert(DW.toSVG(done) === DW.toSVG(sync), 'the sheet from the worker\'s answer differs from the synchronous one');
      var ws = done.views.filter(function (x) { return x.view.id === sec.id; })[0];
      return 'section ' + ws.proj.lines.visible.length + ' lines, ' + ws.proj.arcs.visible.length + ' arcs, ' + ws.hatch + ' hatch lines, from a structured copy';
    });
  })();
  // --- end r13/drawings13 ---
