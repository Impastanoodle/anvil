  // --- rfCQ (2026-10-19, lane CQ: drawing fidelity) --- view labels as SolidWorks shows them (none on model views
  // unless Display label is on; section, detail and auxiliary views labelled by default), a Revision Table per sheet,
  // and a detail view whose boundary is a closed sketched profile (polygon, spline or circle) with its Full outline.
  (function () {
    group('rfCQ: view labels, Revision Table per sheet, sketched detail profiles');
    var CQ = typeof Drawing !== 'undefined' ? Drawing : null;
    var CQ_PLATE = 'p.name("Plate").units("mm");\np.box(100, 60, 8);\np.hole("Top", 10, -10, 8, { offset: 8 });\np.linearPattern({ dir: "x", spacing: 80, count: 2, dir2: "z", spacing2: 40, count2: 2 });';
    function cqDoc() {
      var r = build(CQ_PLATE);
      noErrors(r);
      var doc = CQ.newDrawing(r.model, { date: '2026-10-19', scale: [1, 1] });
      CQ.standard3View(doc, r.mesh, 'mm');
      r.doc = doc;
      r.sheet = function () { return CQ.compute(doc, r.mesh, r.model); };
      r.role = function (role) { return doc.views.filter(function (v) { return v.role === role; })[0]; };
      return r;
    }
    function cqTexts(sh, id) {
      var w = sh.views.filter(function (x) { return x.view.id === id; })[0];
      return sh.prims.filter(function (p) { return p.k === 'text' && p.layer === w.layer; }).map(function (p) { return p.text; });
    }
    function cqWin(sh, id) { return sh.views.filter(function (x) { return x.view.id === id; })[0]; }

    test('rfCQ: model views carry no label by default (SolidWorks) — not on the sheet, in the SVG, the DXF or the PDF — even an isometric at its own 1:2 on a 1:1 sheet; Display label on shows ISOMETRIC / SCALE 1 : 2, and SCALE 1 : 1 when it is drawn at the sheet scale', function () {
      var r = cqDoc(), iso = r.role('iso');
      iso.scale = [1, 2];
      var sh = r.sheet();
      ['front', 'top', 'right', 'iso'].forEach(function (role) { var t = cqTexts(sh, r.role(role).id); assert(!t.length, role + ' view texts: ' + t.join(' | ')); });
      assert(!CQ.viewLabelShown(iso), 'the isometric\'s label is off');
      var svg = CQ.toSVG(sh), dxf = CQ.toDXF(sh), pdf = CQ.toPDF(sh);
      assert(svg.indexOf('SCALE 1 : 2') < 0 && dxf.indexOf('SCALE 1 : 2') < 0 && pdf.indexOf('(SCALE 1 : 2)') < 0, 'no "SCALE 1 : 2" label in SVG / DXF / PDF');
      CQ.setViewLabel(r.doc, iso.id, true);
      assert(iso.showLabel === true, 'stored on the view');
      sh = r.sheet();
      var t1 = cqTexts(sh, iso.id);
      assert(t1.join('|') === 'ISOMETRIC|SCALE 1 : 2', 'label shown: ' + t1.join(' | '));
      svg = CQ.toSVG(sh); dxf = CQ.toDXF(sh); pdf = CQ.toPDF(sh);
      assert(svg.indexOf('SCALE 1 : 2') > 0 && dxf.indexOf('SCALE 1 : 2') > 0 && pdf.indexOf('(SCALE 1 : 2)') > 0, 'the label in SVG / DXF / PDF');
      iso.scale = null;
      var t2 = cqTexts(r.sheet(), iso.id);
      assert(t2.join('|') === 'ISOMETRIC|SCALE 1 : 1', 'at the sheet scale: ' + t2.join(' | '));
      CQ.setViewLabel(r.doc, iso.id, null);
      assert(!('showLabel' in iso) && !CQ.viewLabelShown(iso), 'back to the default');
      // the label goes below the view, clear of its linework
      CQ.setViewLabel(r.doc, iso.id, true);
      var sh3 = r.sheet(), w = cqWin(sh3, iso.id), lab = sh3.prims.filter(function (p) { return p.k === 'text' && p.layer === w.layer; });
      assert(lab.every(function (p) { return p.p[1] < w.box.y0; }), 'below the view box');
      return t1.join(' / ') + ' · ' + t2.join(' / ');
    });

    test('rfCQ: section, detail and auxiliary views are labelled by default (SECTION A-A, DETAIL B / SCALE 2 : 1, VIEW C-C); Display label off hides each; showLabel: false when they are made', function () {
      var r = cqDoc(), front = r.role('front'), top = r.role('top');
      var sec = CQ.addSectionView(r.doc, r.mesh, front.id, { axis: 'v', at: 10 });
      var det = CQ.addDetailView(r.doc, r.mesh, top.id, { c: [10, -10], r: 8 });
      var aux = CQ.addAuxiliaryView(r.doc, r.mesh, front.id, { a: [0, 8], b: [100, 8] });
      var sh = r.sheet(), ts = cqTexts(sh, sec.id), td = cqTexts(sh, det.id), ta = cqTexts(sh, aux.id);
      assert(ts.indexOf('SECTION ' + sec.label + '-' + sec.label) >= 0, 'section label: ' + ts.join(' | '));
      assert(td.indexOf('DETAIL ' + det.label) >= 0 && td.indexOf('SCALE 2 : 1') >= 0, 'detail label: ' + td.join(' | '));
      assert(ta.indexOf('VIEW ' + aux.label + '-' + aux.label) >= 0, 'auxiliary label: ' + ta.join(' | '));
      [sec, det, aux].forEach(function (v) { assert(CQ.viewLabelShown(v), v.name + ' labelled by default'); CQ.setViewLabel(r.doc, v.id, false); });
      sh = r.sheet();
      [sec, det, aux].forEach(function (v) { var t = cqTexts(sh, v.id); assert(!t.some(function (x) { return /^(SECTION|DETAIL|VIEW|SCALE) /.test(x); }), v.name + ' label off: ' + t.join(' | ')); });
      var sec2 = CQ.addSectionView(r.doc, r.mesh, front.id, { axis: 'v', at: 90, showLabel: false });
      assert(sec2.showLabel === false && !cqTexts(r.sheet(), sec2.id).some(function (x) { return /^SECTION /.test(x); }), 'made with its label off');
      return ts[0] + ' · ' + td.join(' / ') + ' · ' + ta[0];
    });

    test('rfCQ: a Revision Table belongs to the sheet it was inserted on — sheet 2 shows none (its title block still reads the drawing\'s REV), a table inserted there goes on from it; sheetDoc, JSON round trip; a drawing saved before rfCQ keeps its table on the sheet that was active', function () {
      var r = cqDoc(), doc = r.doc;
      CQ.insertRevisionTable(doc, {});
      CQ.addRevision(doc, { description: 'FIRST ISSUE', date: '2026-10-19' });
      var s1 = r.sheet();
      assert(s1.revisions && s1.revisions.rows.length === 1 && s1.revisions.rows[0].rev === 'A', 'sheet 1 table');
      CQ.addSheet(doc, {});
      assert(doc.activeSheet === 1, 'sheet 2 active');
      var s2 = r.sheet();
      assert(!s2.revisions, 'sheet 2 shows no Revision Table');
      assert(CQ.latestRev(doc) === 'A' && CQ.titleBlock(doc, r.model).rev === 'A', 'sheet 2 title block REV: ' + CQ.titleBlock(doc, r.model).rev);
      // the first sheet, written while sheet 2 is active
      var s1b = CQ.compute(CQ.sheetDoc(doc, 0), r.mesh, r.model);
      assert(s1b.revisions && s1b.revisions.rows.length === 1, 'sheet 1 keeps its table (sheetDoc)');
      // a table inserted on sheet 2 too: its first revision follows the drawing's
      var row = CQ.addRevision(doc, { description: 'HOLES MOVED', date: '2026-10-20' });
      assert(row.rev === 'B', 'next letter ' + row.rev);
      var s2b = r.sheet();
      assert(s2b.revisions && s2b.revisions.rows.map(function (x) { return x.rev; }).join() === 'B', 'sheet 2 table');
      CQ.activateSheet(doc, 0);
      var s1c = r.sheet();
      assert(s1c.revisions.rows.map(function (x) { return x.rev; }).join() === 'A', 'sheet 1 table unchanged');
      var copy = JSON.parse(JSON.stringify(doc)), c2 = CQ.compute(CQ.sheetDoc(copy, 1), r.mesh, r.model);
      assert(c2.revisions && c2.revisions.rows[0].rev === 'B' && CQ.compute(copy, r.mesh, r.model).revisions.rows[0].rev === 'A', 'JSON round trip');
      // saved before rfCQ: one doc-level table, sheet 2 active when saved -> on sheet 2 only
      var old = cqDoc().doc;
      CQ.addSheet(old, {});
      old.revisions = { rows: [{ zone: '', rev: 'A', description: 'OLD', date: '2026-01-01', approved: '' }], anchor: 'top-right' };
      old = JSON.parse(JSON.stringify(old));
      assert(!CQ.compute(CQ.sheetDoc(old, 0), r.mesh, r.model).revisions && CQ.compute(old, r.mesh, r.model).revisions, 'an old file: the table on the sheet that was active');
      var one = cqDoc().doc;
      one.revisions = { rows: [{ zone: '', rev: 'C', description: 'OLD', date: '2026-01-01', approved: '' }], anchor: 'top-right' };
      assert(CQ.compute(JSON.parse(JSON.stringify(one)), r.mesh, r.model).revisions.rows[0].rev === 'C', 'a one-sheet file unchanged');
      return 'sheet 1: A · sheet 2: none, then B';
    });

    test('rfCQ: a detail view of a sketched polygon profile shows only what is inside it — the hole whole, the plate edges cut where they cross the profile — with the profile drawn on the parent, Full outline round the detail, DETAIL / SCALE 2 : 1, kept through save', function () {
      var r = cqDoc(), top = r.role('top'), sh0 = r.sheet(), wt = cqWin(sh0, top.id);
      var hole = wt.proj.circles.visible.filter(function (c) { return Math.abs(c.r - 4) < 1e-6; }).sort(function (a, b) { return a.c[0] - b.c[0] || a.c[1] - b.c[1]; })[0];
      assert(hole, 'a hole in the Top view');
      var P = [];
      for (var i = 0; i < 5; i++) { var t = Math.PI / 2 + i * 2 * Math.PI / 5; P.push([hole.c[0] + 14 * Math.cos(t), hole.c[1] + 14 * Math.sin(t)]); }
      var det = CQ.addDetailView(r.doc, r.mesh, top.id, { pts: P, outline: 'full' });
      assert(det.detail.shape === 'profile' && det.detail.pts.length === 5, 'profile kept: ' + JSON.stringify(det.detail));
      var sh = r.sheet(), w = cqWin(sh, det.id), pr = w.proj;
      function inP(q) {
        var n = false;
        for (var a = 0, b = P.length - 1; a < P.length; b = a++) if ((P[a][1] > q[1]) !== (P[b][1] > q[1]) && q[0] < (P[b][0] - P[a][0]) * (q[1] - P[a][1]) / (P[b][1] - P[a][1]) + P[a][0]) n = !n;
        return n;
      }
      function onEdge(q) {
        for (var a = 0; a < P.length; a++) {
          var A = P[a], B = P[(a + 1) % P.length], d = [B[0] - A[0], B[1] - A[1]], L2 = d[0] * d[0] + d[1] * d[1], s = Math.max(0, Math.min(1, ((q[0] - A[0]) * d[0] + (q[1] - A[1]) * d[1]) / L2));
          if (Math.hypot(A[0] + d[0] * s - q[0], A[1] + d[1] * s - q[1]) < 1e-6) return true;
        }
        return false;
      }
      var cut = 0;
      pr.lines.visible.forEach(function (l) {
        assert(inP([(l[0] + l[2]) / 2, (l[1] + l[3]) / 2]), 'line inside the profile ' + l.slice(0, 4).map(fmt));
        [[l[0], l[1]], [l[2], l[3]]].forEach(function (q) { assert(inP(q) || onEdge(q), 'line end inside ' + q.map(fmt)); if (onEdge(q)) cut++; });
      });
      assert(cut >= 2, 'plate edges cut at the profile: ' + cut);
      assert(pr.circles.visible.length === 1 && Math.abs(pr.circles.visible[0].r - 4) < 1e-9, 'the hole whole: ' + pr.circles.visible.length);
      // the profile on the parent (thick) and round the detail (Full outline), at their own scales
      var pw = cqWin(sh, top.id), marks = sh.prims.filter(function (p) { return p.detailMark === det.id && p.k === 'line'; }), outl = sh.prims.filter(function (p) { return p.detailOutline === det.id; });
      assert(marks.length === 5 && marks.every(function (m, j) { var q = pw.toSheet(det.detail.pts[j]); return Math.hypot(m.a[0] - q[0], m.a[1] - q[1]) < 1e-9; }), 'profile on the parent: ' + marks.length);
      assert(outl.length === 5 && outl.every(function (m, j) { var q = w.toSheet(det.detail.pts[j]); return m.k === 'line' && Math.hypot(m.a[0] - q[0], m.a[1] - q[1]) < 1e-9; }), 'Full outline round the detail: ' + outl.length);
      var td = cqTexts(sh, det.id);
      assert(td.indexOf('DETAIL ' + det.label) >= 0 && td.indexOf('SCALE 2 : 1') >= 0, 'label ' + td.join(' | '));
      var bw = det.detail.b[0] - det.detail.a[0];
      near(w.box.x1 - w.box.x0, 2 * bw, 1e-6, 'box = the profile\'s extent at 2 : 1');
      // jagged follows the profile; a saved copy draws the same
      CQ.setDetailOptions(r.doc, det.id, { outline: 'jagged' });
      var sj = r.sheet(), jag = sj.prims.filter(function (p) { return p.detailOutline === det.id; });
      assert(jag.length >= 12, 'jagged outline: ' + jag.length);
      var copy = JSON.parse(JSON.stringify(r.doc)), sc = CQ.compute(copy, r.mesh, r.model);
      assert(cqWin(sc, det.id).proj.lines.visible.length === cqWin(sj, det.id).proj.lines.visible.length && CQ.toDXF(sc).length > 0, 'JSON round trip');
      return pr.lines.visible.length + ' lines (' + cut + ' ends on the profile), 1 hole';
    });

    test('rfCQ: sketchLoop finds the closed profile of drawing sketch entities in a view — three lines end to end from one of them, a circle on its own, a closed spline — and refuses an open chain; a detail of a circle sketch is a true circle detail', function () {
      var r = cqDoc(), top = r.role('top'), doc = r.doc;
      var A = [top.x - 10, top.y - 8], B = [top.x + 12, top.y - 8], C = [top.x, top.y + 9];
      var l1 = CQ.addSketchEntity(doc, { t: 'line', a: A, b: B }, top.id), l2 = CQ.addSketchEntity(doc, { t: 'line', a: C, b: B }, top.id), l3 = CQ.addSketchEntity(doc, { t: 'line', a: C, b: A }, top.id);
      var L = CQ.sketchLoop(doc, [l1.id]);
      assert(L.view === top.id && L.pts.length === 3 && L.ids.length === 3 && !L.circle, 'triangle ' + JSON.stringify(L));
      var area = 0;
      for (var i = 0, j = L.pts.length - 1; i < L.pts.length; j = i++) area += (L.pts[j][0] - L.pts[i][0]) * (L.pts[j][1] + L.pts[i][1]);
      assert(area > 0, 'counter-clockwise');
      var c = CQ.addSketchEntity(doc, { t: 'circle', c: [top.x + 30, top.y], r: 5 }, top.id), Lc = CQ.sketchLoop(doc, [c.id]);
      assert(Lc.circle && Math.abs(Lc.circle.r - 5) < 1e-12 && Math.abs(Lc.circle.c[0] - top.x - 30) < 1e-9, 'circle ' + JSON.stringify(Lc.circle));
      var sp = CQ.addSketchEntity(doc, { t: 'spline', pts: [[top.x - 30, top.y], [top.x - 20, top.y + 2], [top.x - 22, top.y + 12], [top.x - 30, top.y]] }, top.id), Ls = CQ.sketchLoop(doc, [sp.id]);
      assert(Ls.pts.length > 10, 'closed spline ' + Ls.pts.length);
      var o1 = CQ.addSketchEntity(doc, { t: 'line', a: [top.x + 40, top.y + 20], b: [top.x + 50, top.y + 20] }, top.id);
      CQ.addSketchEntity(doc, { t: 'line', a: [top.x + 50, top.y + 20], b: [top.x + 50, top.y + 30] }, top.id);
      var threw = false;
      try { CQ.sketchLoop(doc, [o1.id]); } catch (e) { threw = /closed/.test(e.message); }
      assert(threw, 'an open chain is refused');
      var det = CQ.addDetailView(doc, r.mesh, top.id, { c: [Lc.circle.c[0] - top.x, Lc.circle.c[1] - top.y], r: 5 });
      assert(det.detail.r === 5 && !det.detail.pts, 'a circle detail');
      return 'triangle 3 · circle r5 · spline ' + Ls.pts.length + ' points';
    });
  })();
