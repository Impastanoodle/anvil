  // --- rfNS (2026-11-16, lane NS: Autodimension and centre marks that never overlap,
  // test-reports/2026-11-16-drawing-dimension-layout.md) ---
  (function () {
    group('rfNS: Autodimension (ordinate, baseline, chain) and centre marks never print on top of each other');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing, T = 0.0625;
    // the shop-flow box (16 ga 8 x 6, four 2 in Edge Flanges Material Inside, circular corner reliefs): its flat has a
    // bend line .018 from the relief edge next to it on each side
    var E4 = '[[4, ' + T + ', 0], [4, ' + T + ', 6], [0, ' + T + ', 3], [8, ' + T + ', 3]]';
    var C4 = '[[' + T + ', ' + T + ', ' + T + '], [' + (8 - T) + ', ' + T + ', ' + T + '], [' + T + ', ' + T + ', ' + (6 - T) + '], [' + (8 - T) + ', ' + T + ', ' + (6 - T) + ']]';
    var BOX = 'p.units("in");\np.sheet(' + T + ', 0.0625, 0.5);\np.sketch("Top").rect(0, -6, 8, 6).end().baseFlange();\n' +
      'p.flange(2, ' + E4 + ', { position: "inside", lengthRef: "outer" });\np.cornerRelief(' + C4 + ', 0.125, { reliefType: "circular" });\n';
    function rfNSPanel(cols, rows) {
      var G = 0.0478, sx = 22 / cols, sy = 46 / rows;
      return 'p.units("in");\np.sheet(' + G + ', ' + G + ', 0.5);\np.sketch("Top").rect(0, 0, 24, 48).end().baseFlange(' + G + ');\n' +
        'p.sketch("Top", ' + G + ').circle(' + (1 + sx / 2) + ', ' + (1 + sy / 2) + ', 0.125).end().cut("through", { reverse: true });\n' +
        'p.linearPattern({ dir: "x", spacing: ' + sx + ', count: ' + cols + ', dir2: "z", spacing2: ' + sy + ', count2: ' + rows + ', reverse2: true });\n' +
        'p.flange(1, [[12, ' + G + ', 0], [12, ' + G + ', -48], [0, ' + G + ', -24], [24, ' + G + ', -24]], { position: "inside" });\n';
    }
    var parts = {};
    function rfNSPart(code) { if (!parts[code]) { parts[code] = build(code); noErrors(parts[code]); } return parts[code]; }
    function rfNSFlat(code, scale, marks) {
      var r = rfNSPart(code), doc = DW.newDrawing(r.model, { date: '2026-11-16' });
      if (scale) { doc.sheet.scale = scale; doc.sheet.autoScale = false; }
      if (marks) doc.options = Object.assign(doc.options || {}, { autoCenterMarks: true });
      var v = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, fit: true, newSheet: false });
      if (marks) DW.autoInsert(doc, r.mesh, [v.id]);
      var q = { doc: doc, view: v, r: r };
      q.compute = function () { q.sheet = DW.compute(doc, r.mesh, r.model, { build: r.build }); q.w = q.sheet.views.filter(function (x) { return x.view.id === v.id; })[0]; return q.sheet; };
      q.compute();
      return q;
    }
    function rfNSTexts(q) { return q.sheet.prims.filter(function (p) { return p.k === 'text' && p.dimIx != null; }).map(function (p) { return { p: p, r: DW.textRect(p) }; }); }
    function meet(a, b, m) { m = m || 0; return a.x0 - m < b.x1 && b.x0 - m < a.x1 && a.y0 - m < b.y1 && b.y0 - m < a.y1; }
    function rfNSClashes(q) {
      var t = rfNSTexts(q), out = [], S = q.sheet.size;
      for (var i = 0; i < t.length; i++) {
        for (var j = i + 1; j < t.length; j++) if (meet(t[i].r, t[j].r)) out.push(t[i].p.text + ' / ' + t[j].p.text);
        if (meet(t[i].r, q.w.box, -1e-3)) out.push(t[i].p.text + ' on the view');
        if (t[i].r.x0 < 0 || t[i].r.y0 < 0 || t[i].r.x1 > S[0] || t[i].r.y1 > S[1]) out.push(t[i].p.text + ' off the sheet');
      }
      return out;
    }
    function rfNSAuto(q, scheme) { var res = DW.flatAutodimension(q.doc, q.view.id, q.w, q.sheet, { hScheme: scheme, vScheme: scheme }); q.compute(); return res; }

    test('rfNS: the box flat (values .018 apart: a bend line beside a relief edge) dimensioned Ordinate, Baseline and Chain: every value printed, no two texts meet, none on the view (baseline and chain covered each other before)', function () {
      var out = [];
      ['ordinate', 'baseline', 'chain'].forEach(function (s) {
        var q = rfNSFlat(BOX), res = rfNSAuto(q, s), texts = rfNSTexts(q).map(function (t) { return t.p.text; });
        assert(res.n === 10, s + ': ten dimensions ' + JSON.stringify(res));
        ['1.949', '1.967', '9.828', '9.846', '7.828', '7.846'].forEach(function (v) { assert(texts.indexOf(v) >= 0 || s === 'chain', s + ': ' + v + ' printed: ' + texts.join(' ')); });
        if (s === 'chain') assert(texts.filter(function (x) { return x === '.018'; }).length === 4, 'chain: four .018 links ' + texts.join(' '));
        var c = rfNSClashes(q);
        assert(!c.length, s + ': ' + c.join('; '));
        out.push(s + ' ' + texts.length);
      });
      return out.join(', ');
    });

    test('rfNS: ordinate values closer than a text height are jogged with a leader (three lines: up, across, up) and keep their order', function () {
      var q = rfNSFlat(BOX); rfNSAuto(q, 'ordinate');
      var H = q.sheet.dims.filter(function (d) { return d.view === q.view.id && d.kind === 'ordinate' && d.dir !== 'v'; })[0];
      var ix = q.sheet.dims.indexOf(H), tx = q.sheet.prims.filter(function (p) { return p.dimIx === ix && p.k === 'text'; });
      var a = tx.filter(function (t) { return t.text === '1.949'; })[0], b = tx.filter(function (t) { return t.text === '1.967'; })[0];
      assert(a && b && b.p[0] - a.p[0] >= a.h * 1.2, 'texts apart along the line: ' + (a && b && (b.p[0] - a.p[0])));
      var lines = q.sheet.prims.filter(function (p) { return p.dimIx === ix && p.k === 'line'; });
      var slanted = lines.filter(function (l) { return Math.abs(l.a[0] - l.b[0]) > 1e-6 && Math.abs(l.a[1] - l.b[1]) > 1e-6; });
      assert(slanted.length >= 2, 'jog leaders: ' + slanted.length);
    });

    test('rfNS: a 24 x 48 panel flat with 600 holes at 1:8: the 30 jogged ordinate values across no longer run into the values up the side (the second set steps out); 0 clashes', function () {
      var q = rfNSFlat(rfNSPanel(30, 20), [1, 8]), res = rfNSAuto(q, 'ordinate');
      assert(res.n === 60, 'sixty stations ' + JSON.stringify(res));
      var c = rfNSClashes(q);
      assert(!c.length, c.slice(0, 6).join('; '));
      var V = q.sheet.dims.filter(function (d) { return d.view === q.view.id && d.dir === 'v'; })[0];
      assert(V && V.outerNow > 0, 'the side set stepped out: ' + (V && V.outerNow));
      return 'stepped out ' + V.outerNow + ' mm';
    });

    test('rfNS: Chain on the panel: a run of equal links too short for their values is one dimension "29X .733" / "19X 2.300", no clashes; the 6 x 4 rfJM-style blank keeps its five links', function () {
      var q = rfNSFlat(rfNSPanel(30, 20), [1, 8]), res = rfNSAuto(q, 'chain');
      var texts = rfNSTexts(q).map(function (t) { return t.p.text; });
      assert(texts.indexOf('29X .733') >= 0 && texts.indexOf('19X 2.300') >= 0, 'pattern links: ' + texts.join(' '));
      assert(res.n === 14, 'fourteen dimensions ' + res.n);
      var c = rfNSClashes(q);
      assert(!c.length, c.join('; '));
      // links that fit are never merged: three equal 1.500 links of a 6 in blank stay three
      var B = 'p.units("in");\np.sheet(0.0598, 0.06, 0.44);\np.sketch("Top").rect(0, -4, 8, 4).end().baseFlange();\np.sketch("Top", 0.0598).circle(1, -2, 0.1).circle(2, -2, 0.1).circle(3, -2, 0.1).circle(4, -2, 0.1).circle(5, -2, 0.1).cut("through", { reverse: true });\n';
      var q2 = rfNSFlat(B), r2 = DW.flatAutodimension(q2.doc, q2.view.id, q2.w, q2.sheet, { hScheme: 'chain', v: false });
      q2.compute();
      var t2 = rfNSTexts(q2).map(function (t) { return t.p.text; });
      assert(r2.n === 6 && t2.filter(function (x) { return x === '1.000'; }).length === 5 && !t2.some(function (x) { return /X /.test(x); }), 'five 1.000 links kept: ' + t2.join(' '));
    });

    test('rfNS: true curves of the 600-hole panel scan each face at most once for analytic polygons (a slanted-rim check made Make Drawing scan the plate for every hole-rim chord: 6.4 -> 14..22 s); a hole through a 30° flange still gets its ellipse after one scan per face', function () {
      var r = rfNSPart(rfNSPanel(30, 20)), m = K.meshFromBody(r.build.body);
      Drawing._.curveOps.polyScans = 0;
      var cv = Drawing.meshCurves(m);
      assert(cv && cv.groups.filter(function (g) { return g.full; }).length >= 1200, 'hole rims ' + (cv && cv.groups.length));
      var scans = Drawing._.curveOps.polyScans;
      assert(scans <= 200 && scans <= m.faces.length, 'faces scanned: ' + scans + ' of ' + m.faces.length);
      var s = build('p.units("in");\np.sheet(0.0598, 0.06, 0.44);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(2, [[4, 0.0598, 1.5]], { angle: 30 });\np.sketch("Top").circle(4.8, -1.5, 0.15).cut("through", { both: true });');
      noErrors(s);
      Drawing._.curveOps.polyScans = 0;
      var c2 = Drawing.meshCurves(K.meshFromBody(s.build.body)), ell = c2 ? c2.groups.filter(function (g) { return g.ry; }).length : 0;
      assert(ell >= 2, 'the slanted rims are ellipses: ' + ell);
      assert(Drawing._.curveOps.polyScans > 0 &&Drawing._.curveOps.polyScans <= s.mesh.faces.length, 'one scan a face at most: ' + Drawing._.curveOps.polyScans + ' of ' + s.mesh.faces.length);
      return 'panel ' + scans + ' scans; 30° flange ' + Drawing._.curveOps.polyScans + ' scans, ' + ell + ' ellipse groups';
    });

    test('rfNS: Auto insert centre marks on the 600-hole panel at 1:8 shrink to 0.4 of the pitch (never touching); 1200 holes (pitch 1.2 mm on paper) are left off with one warning', function () {
      var q = rfNSFlat(rfNSPanel(30, 20), [1, 8], true), w = q.w;
      var ls = q.sheet.prims.filter(function (p) { return p.k === 'line' && p.layer === 'ANNOTATIONS' && p.view == null || p.k === 'line' && p.layer === 'ANNOTATIONS'; });
      assert(ls.length === 1200, 'two lines a hole: ' + ls.length);
      var half = Math.max.apply(null, ls.map(function (l) { return Math.hypot(l.a[0] - l.b[0], l.a[1] - l.b[1]) / 2; })), pitch = 22 / 30 * w.scale;
      assert(2 * half < pitch - 1e-9, 'marks apart: ' + 2 * half + ' vs pitch ' + pitch);
      assert(!(q.sheet.warnings || []).some(function (x) { return /centre mark/.test(x); }), 'no warning');
      var q2 = rfNSFlat(rfNSPanel(60, 20), [1, 8], true);
      var l2 = q2.sheet.prims.filter(function (p) { return p.k === 'line' && p.layer === 'ANNOTATIONS'; });
      var wn = (q2.sheet.warnings || []).filter(function (x) { return /centre mark/.test(x); });
      assert(!l2.length && wn.length === 1 && /1200 centre marks left off/.test(wn[0]) && /1:8/.test(wn[0]), 'left off: ' + l2.length + ' ' + JSON.stringify(wn));
      // a mark the user places is drawn however small
      var an = q2.doc.views[0].annotations[0]; delete an.auto; q2.compute();
      assert(q2.sheet.prims.filter(function (p) { return p.k === 'line' && p.layer === 'ANNOTATIONS'; }).length === 2, 'user mark drawn');
      return 'mark ' + (2 * half).toFixed(4) + ' in on a ' + pitch.toFixed(4) + ' in pitch';
    });
  })();
