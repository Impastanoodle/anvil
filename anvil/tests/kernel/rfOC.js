  // --- rfOC (2026-11-17, lane drawdual: dual dimensions, SolidWorks 2024's Document Properties > Dimensions > Dual
  // dimensions display and Units > Dual Dimension Length) ---
  (function () {
    group('rfOC: dual dimensions (1.000 [25.40]) on every length of the sheet, its SVG, PDF and DXF');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing;
    // a 4 x 2 x .25 inch plate, two .281 holes and a .500 hole, a .06 chamfer on the top right edge
    var PLATE = 'p.units("in");\np.sketch("Front").rect(0, 0, 4, 2).circle(1, 1, 0.1405).circle(3, 1, 0.1405).circle(2, 1.5, 0.25).extrude(0.25);\n';
    function rfOCDoc(code, opts) {
      var r = build(code || PLATE);
      noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-17' });
      DW.standard3View(doc, r.mesh, r.model.units);
      doc.options = Object.assign(doc.options || {}, opts || {});
      var q = { r: r, doc: doc };
      q.compute = function () { q.sheet = DW.compute(doc, r.mesh, r.model, { build: r.build }); return q.sheet; };
      q.view = function (o) { return q.sheet.views.filter(function (w) { return w.view.orient === o; })[0]; };
      q.compute();
      return q;
    }
    function rfOCTexts(sheet) { return sheet.prims.filter(function (p) { return p.k === 'text' && (p.layer === 'DIMENSIONS' || p.layer === 'ANNOTATIONS'); }).map(function (p) { return p.text; }); }
    function rfOCMeet(a, b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }
    function rfOCClashes(sheet) {
      var t = sheet.prims.filter(function (p) { return p.k === 'text' && p.dimIx != null; }).map(function (p) { return { p: p, r: DW.textRect(p) }; }), out = [];
      for (var i = 0; i < t.length; i++) for (var j = i + 1; j < t.length; j++) if (t[i].p.dimIx !== t[j].p.dimIx && rfOCMeet(t[i].r, t[j].r)) out.push(t[i].p.text + ' / ' + t[j].p.text);
      return out;
    }
    // the DXF's (code, value) pairs
    function rfOCDxf(dxf) { var L = dxf.split(/\r?\n/), out = []; for (var i = 0; i + 1 < L.length; i += 2) out.push([L[i].trim(), L[i + 1]]); return out; }

    test('rfOC: Dual dimensions display is off by default; Drawing.dualStyle gives the other system: millimetres .12 on an inch drawing, inches .123 on a millimetre one, Bottom', function () {
      var q = rfOCDoc();
      var st = DW.dualStyle(q.doc);
      assert(!st.on && st.units === 'mm' && st.prec === 2 && st.pos === 'bottom' && !st.showUnits, JSON.stringify(st));
      var mm = DW.dualStyle({ units: 'mm', options: {} });
      assert(mm.units === 'in' && mm.prec === 3, JSON.stringify(mm));
      var t = rfOCTexts(q.sheet).join(' ');
      assert(t.indexOf('[') < 0, 'no brackets with it off: ' + t);
      return t;
    });

    test('rfOC: with it on, model items read value [mm]: 4.000 [101.60], 2.000 [50.80], 2X Ø.281 [7.14], Ø.500 [12.70]; the drawn label is the value over its bracketed dual value (Bottom)', function () {
      var q = rfOCDoc(null, { dual: true }), dims = q.sheet.dims.map(function (d) { return d.text; });
      ['4.000 [101.60]', '2.000 [50.80]', '2X Ø.281 [7.14]', 'Ø.500 [12.70]', '.250 [6.35]'].forEach(function (t) { assert(dims.indexOf(t) >= 0, t + ' in ' + dims.join(' | ')); });
      var d = q.sheet.dims.filter(function (x) { return x.text === '4.000 [101.60]'; })[0];
      var mine = q.sheet.prims.filter(function (p) { return p.k === 'text' && p.dimIx === q.sheet.dims.indexOf(d); });
      var a = mine.filter(function (p) { return p.text === '4.000'; })[0], b = mine.filter(function (p) { return p.text === '[101.60]'; })[0];
      assert(a && b, 'two texts: ' + mine.map(function (p) { return p.text; }));
      assert(b.p[1] < a.p[1] - b.h && Math.abs(a.p[0] - b.p[0]) < 1e-9, 'stacked under it, same centre ' + JSON.stringify([a.p, b.p]));
      var c = rfOCClashes(q.sheet);
      assert(!c.length, 'no two texts meet: ' + c.join('; '));
      return dims.join(' | ');
    });

    test('rfOC: Right / Left / Top positions, Show units, Dual Dimension Length decimals; a millimetre drawing doubles in inches', function () {
      var q = rfOCDoc(null, { dual: true, dualPos: 'right' }), out = [];
      var d = q.sheet.dims.filter(function (x) { return x.text === '4.000 [101.60]'; })[0], ix = q.sheet.dims.indexOf(d);
      var mine = q.sheet.prims.filter(function (p) { return p.k === 'text' && p.dimIx === ix; });
      var a = mine.filter(function (p) { return p.text === '4.000'; })[0], b = mine.filter(function (p) { return p.text === '[101.60]'; })[0];
      assert(a && b && Math.abs(a.p[1] - b.p[1]) < 1e-9 && b.p[0] > a.p[0], 'right: one line ' + JSON.stringify(mine));
      out.push(d.text);
      q.doc.options.dualPos = 'left'; q.compute();
      d = q.sheet.dims.filter(function (x) { return /101\.60/.test(x.text); })[0];
      assert(d.text === '[101.60] 4.000', 'left: ' + d.text); out.push(d.text);
      q.doc.options.dualPos = 'top'; q.compute();
      d = q.sheet.dims.filter(function (x) { return /101\.60/.test(x.text); })[0]; ix = q.sheet.dims.indexOf(d);
      mine = q.sheet.prims.filter(function (p) { return p.k === 'text' && p.dimIx === ix; });
      a = mine.filter(function (p) { return p.text === '4.000'; })[0]; b = mine.filter(function (p) { return p.text === '[101.60]'; })[0];
      assert(b.p[1] > a.p[1] + a.h, 'top: over it');
      q.doc.options.dualShowUnits = true; q.doc.options.dualPrec = 1; q.compute();
      assert(q.sheet.dims.some(function (x) { return x.text === '4.000 [101.6mm]'; }), 'units + .1: ' + q.sheet.dims.map(function (x) { return x.text; }));
      var m = rfOCDoc('p.sketch("Front").rect(0, 0, 100, 50).extrude(10);', { dual: true });
      var mt = m.sheet.dims.map(function (x) { return x.text; });
      assert(mt.indexOf('100 [3.937]') >= 0 && mt.indexOf('50 [1.969]') >= 0, 'mm drawing: ' + mt.join(' | '));
      out.push(mt.join(', '));
      return out.join(' ; ');
    });

    test('rfOC: ordinate, baseline, chamfer, a tolerance (both limits), the counted form and hole callouts are doubled; thread sizes, angles and per-dimension Dual Dimension off are not', function () {
      var q = rfOCDoc(PLATE + 'p.chamfer(0.06, [[4, 2, 0.125]]);', { dual: true, dualPos: 'right' }), F = q.view('Front');
      // ordinate along the bottom edge from the left edge to the two hole centres; baseline the same
      var edge = function (x) { return { a: [x, 0], b: [x, 2] }; };
      DW.addOrdinate(q.doc, F.view.id, { dir: 'h', base: edge(0), refs: [{ c: [1, 1], r: 0.1405 }, { c: [3, 1], r: 0.1405 }] });
      DW.addBaseline(q.doc, F.view.id, { dir: 'v', base: { a: [0, 0], b: [4, 0] }, refs: [{ c: [2, 1.5], r: 0.25 }] });
      DW.addHoleCallout(q.doc, F.view.id, { c: [2, 1.5], r: 0.25 });
      q.compute();
      var R = q.view('Front');
      var ch = R.proj.lines.visible.filter(function (l) { return Math.abs(Math.abs(l[2] - l[0]) - 0.06) < 1e-6 && Math.abs(Math.abs(l[3] - l[1]) - 0.06) < 1e-6; })[0];
      var lead = R.proj.lines.visible.filter(function (l) { return Math.abs(l[1] - l[3]) < 1e-9 && Math.abs(l[1] - 2) < 1e-9; })[0];
      assert(ch && lead, 'chamfer edges in the Right view');
      DW.addChamferDim(q.doc, R.view.id, { a: [ch[0], ch[1]], b: [ch[2], ch[3]], ref: { a: [lead[0], lead[1]], b: [lead[2], lead[3]] } });
      q.compute();
      var w = q.sheet.dims.filter(function (x) { return x.text === '4.000 [101.60]'; })[0];
      q.doc.dimProps = q.doc.dimProps || {};
      q.doc.dimProps[w.style] = { tol: { type: 'bilateral', plus: 0.005, minus: 0.002 } };
      var h = q.sheet.dims.filter(function (x) { return x.text === '2.000 [50.80]'; })[0];
      q.doc.dimProps[h.style] = { tol: { type: 'limit', plus: 0.01, minus: 0.01 } };
      var dd = q.sheet.dims.filter(function (x) { return x.text === 'Ø.500 [12.70]'; })[0];
      q.doc.dimProps[dd.style] = { dual: false };
      var t = q.sheet.dims.filter(function (x) { return x.text === '.250 [6.35]'; })[0];
      q.doc.dimProps[t.style] = { label: '29X <DIM>' };
      q.compute();
      var texts = q.sheet.dims.map(function (x) { return x.text; }), all = texts.join(' | ');
      function has(s) { assert(texts.indexOf(s) >= 0, s + ' in ' + all); }
      has('0 [0.00], 1.000 [25.40], 3.000 [76.20]');
      has('1.500 [38.10]');
      has('.060 X 45° [1.52]');
      has('4.000 +.005/-.002 [101.60 +0.13/-0.05]');
      has('2.010/1.990 [51.05/50.55]');
      has('Ø.500');
      has('29X .250 [6.35]');
      var ann = q.sheet.annotations.filter(function (a) { return a.type === 'holeCallout'; })[0];
      assert(ann && /^Ø\.500 \[12\.70\] THRU/.test(ann.text), 'callout: ' + (ann && ann.text));
      var c = rfOCClashes(q.sheet);
      assert(!c.length, 'no two texts meet: ' + c.join('; '));
      return all + ' | ' + ann.text;
    });

    test('rfOC: a Hole Wizard tapped hole callout doubles the drill and depths, never the thread size; tables and the title block are not doubled', function () {
      if (typeof HoleWizard === 'undefined') return 'no Hole Wizard';
      var q = rfOCDoc('p.units("in");\np.sketch("Top").rect(0, -2, 2, 2).end().extrude(1);\np.holeWizard({ face: "Top", offset: 1, points: [[1, -1]], standard: "ANSI Inch", type: "tap", size: "1/4-20 UNC", end: "blind", depth: 0.75, threadDepth: 0.5 });', { dual: true });
      var F = q.view('Top');
      var c = F.proj.circles.visible.filter(function (x) { return x.r < 0.2; })[0];
      if (!c) return 'no hole circle (skipped): ' + JSON.stringify(F.proj.circles.visible.map(function (x) { return x.r; }));
      DW.addHoleCallout(q.doc, F.view.id, { c: c.c, r: c.r });
      q.compute();
      var ann = q.sheet.annotations.filter(function (a) { return a.type === 'holeCallout'; })[0];
      assert(ann && /1\/4-20 UNC ↧ \.500 \[12\.70\]/.test(ann.text) && /Ø \.201 \[5\.11\] ↧ \.750 \[19\.05\]/.test(ann.text), 'callout ' + (ann && ann.text));
      var tb = q.sheet.prims.filter(function (p) { return p.layer === 'SHEET' && p.k === 'text' && /\[/.test(p.text); });
      assert(!tb.length, 'title block has no dual ' + tb.map(function (p) { return p.text; }));
      return ann.text;
    });

    test('rfOC: SVG, PDF and DXF carry the dual text; R2000 DIMENSION text overrides stack it with \\X (Bottom) as AutoCAD reads it, Right on one line; R12 has both TEXTs', function () {
      var q = rfOCDoc(null, { dual: true }), out = [];
      var svg = DW.toSVG(q.sheet);
      assert(svg.indexOf('[101.60]') >= 0 && svg.indexOf('>4.000<') >= 0, 'SVG');
      var pdf = DW.toPDF(q.sheet);
      assert(pdf.indexOf('[101.60]') >= 0, 'PDF');
      var e = rfOCDxf(DW.toDXF(q.sheet, { version: 'R2000' })), ov = [];
      for (var i = 0; i < e.length; i++) if (e[i][0] === '0' && e[i][1] === 'DIMENSION') { for (var j = i + 1; j < e.length && e[j][0] !== '0'; j++) if (e[j][0] === '1') ov.push(e[j][1]); }
      assert(ov.indexOf('4.000\\X[101.60]') >= 0 && ov.indexOf('2X %%c.281\\X[7.14]') >= 0, 'R2000 overrides: ' + ov.join(' | '));
      out.push(ov.join(' | '));
      var r12 = rfOCDxf(DW.toDXF(q.sheet, { version: 'R12' })).filter(function (x) { return x[0] === '1'; }).map(function (x) { return x[1]; });
      assert(r12.indexOf('4.000') >= 0 && r12.indexOf('[101.60]') >= 0, 'R12 texts');
      q.doc.options.dualPos = 'right'; q.compute();
      e = rfOCDxf(DW.toDXF(q.sheet, { version: 'R2000' })); ov = [];
      for (i = 0; i < e.length; i++) if (e[i][0] === '0' && e[i][1] === 'DIMENSION') { for (j = i + 1; j < e.length && e[j][0] !== '0'; j++) if (e[j][0] === '1') ov.push(e[j][1]); }
      assert(ov.indexOf('4.000 [101.60]') >= 0, 'Right: ' + ov.join(' | '));
      return out.join(' ; ');
    });

    test('rfOC: Autodimension of a 29-hole row (Chain: equal links counted, nX 1.000) with dual on: the counted form keeps its count on the primary value only, no two texts meet', function () {
      var code = 'p.units("in");\nvar s = p.sketch("Front").rect(0, 0, 30, 2);\nfor (var i = 0; i < 29; i++) s.circle(1 + i, 1, 0.125);\ns.extrude(0.06);\n';
      var q = rfOCDoc(code, { dual: true }), F = q.view('Front');
      var n = DW.autodimension(q.doc, F.view.id, F.proj, { h: { scheme: 'chain' }, v: { scheme: 'ordinate' }, units: 'in', scale: F.scale });
      q.compute();
      var texts = q.sheet.dims.map(function (d) { return d.text; });
      assert(n > 0 && texts.some(function (t) { return /^\d+X 1\.000 \[25\.40\]$/.test(t); }), 'counted chain link: ' + texts.join(' | '));
      var c = rfOCClashes(q.sheet);
      assert(!c.length, c.join('; '));
      return n + ': ' + texts.join(' | ');
    });
    [[30, 4.12], [90, 4.15], [60, 4.2]].forEach(function (cs) {
      var ang = cs[0], xc = cs[1];
      test('rfOC: a hole in the bend itself (' + ang + ' deg flange, R.5): Front shows its rims on the bend arcs, Right and the auxiliary view draw the visible and hidden rims as smooth curves on the true curve (no facet chords)', function () {
        var T = 0.0598, R = 0.5;
        var code = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.44);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(2, [[4, ' + T + ', 1.5]], { angle: ' + ang + ' });\np.sketch("Top").circle(' + xc + ', -1.5, 0.1).cut("through", { midplane: true });';
        var r = build(code); noErrors(r);
        var doc = DW.newDrawing(r.model, { date: '2026-11-17' });
        DW.standard3View(doc, r.mesh, r.model.units);
        r.sheet = DW.compute(doc, r.mesh, r.model);
        var F = r.sheet.views.filter(function (w) { return w.view.orient === 'Front'; })[0];
        var sl = F.proj.lines.visible.filter(function (l) { var a = Math.atan2(l[3] - l[1], l[2] - l[0]) * 180 / Math.PI; return Math.abs(Math.abs(a) - ang) < 0.5 || Math.abs(Math.abs(a) - (180 - ang)) < 0.5; })
          .sort(function (p, q) { return Math.hypot(q[2] - q[0], q[3] - q[1]) - Math.hypot(p[2] - p[0], p[3] - p[1]); })[0];
        DW.addAuxiliaryView(doc, r.mesh, F.view.id, { a: [sl[0], sl[1]], b: [sl[2], sl[3]], sign: 1 });
        r.sheet = DW.compute(doc, r.mesh, r.model);
        // the bend: axis along Z through (4, R + T) (material outside the base edge, rising +Y); bend surfaces radius R and R + T
        // true rim points: the hole cylinder on each bend cylinder, within the bend's sweep
        var pts = [];
        [R, R + T].forEach(function (rr) {
          for (var k = 0; k < 4000; k++) {
            var th = k / 4000 * 2 * Math.PI, x = xc + 0.1 * Math.cos(th), z = 1.5 + 0.1 * Math.sin(th), dx = x - 4;
            if (dx < 0 || dx > rr * Math.sin(ang * Math.PI / 180)) continue;
            pts.push([x, R + T - Math.sqrt(rr * rr - dx * dx), z]);
          }
        });
        var out = [];
        r.sheet.views.forEach(function (w) {
          var Fr = w.frame, ps = r.sheet.prims.filter(function (p) { return p.layer === w.layer; });
          if (!Fr || !Fr.u) return;
          var sp = pts.map(function (P) { return w.toSheet([P[0] * Fr.u[0] + P[1] * Fr.u[1] + P[2] * Fr.u[2], P[0] * Fr.v[0] + P[1] * Fr.v[1] + P[2] * Fr.v[2]]); });
          var worst = 0, n = { visible: 0, hidden: 0 }, chords = 0;
          ps.forEach(function (p) {
            if (p.k !== 'line') return;
            var m = p.bz ? rfOCBz(p, 0.5) : [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2];
            var d = Infinity; sp.forEach(function (q) { d = Math.min(d, Math.hypot(q[0] - m[0], q[1] - m[1])); });
            var dA = Infinity; sp.forEach(function (q) { dA = Math.min(dA, Math.hypot(q[0] - p.a[0], q[1] - p.a[1])); });
            if (dA / w.scale > 2e-3) return;   // not a rim piece
            if (!p.bz) { if (d / w.scale < 2e-3 && Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) > 1e-6) chords++; return; }
            n[p.style] = (n[p.style] || 0) + 1; worst = Math.max(worst, d / w.scale);
          });
          out.push(w.view.orient + (w.view.kind ? '/' + w.view.kind : '') + ' bz ' + JSON.stringify(n) + ' worst ' + worst.toExponential(2) + ' chords on rim ' + chords + ' ell ' + ps.filter(function (p) { return p.k === 'ellipse'; }).length);
        });
        out.forEach(function (s) {
          if (!/^(Right|Auxiliary)/.test(s)) return;
          var m = /bz \{"visible":(\d+),"hidden":(\d+)\} worst ([^ ]+) chords on rim (\d+)/.exec(s);
          assert(m && +m[1] >= 50 && +m[2] >= 50, 'visible and hidden rims as curves: ' + s);
          assert(+m[3] < 5e-4 && +m[4] <= 4, 'on the true curve, no chord fan: ' + s);
        });
        return out.join(' || ');
      });
    });
    function rfOCBz(p, t) { var a = p.a, b = p.b, c1 = p.bz[0], c2 = p.bz[1], s = 1 - t; return [s * s * s * a[0] + 3 * s * s * t * c1[0] + 3 * s * t * t * c2[0] + t * t * t * b[0], s * s * s * a[1] + 3 * s * s * t * c1[1] + 3 * s * t * t * c2[1] + t * t * t * b[1]]; }
  })();
