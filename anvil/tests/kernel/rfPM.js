  // --- rfPM (2026-11-18, lane drawgaps2: the rest of the drawing gaps a sheet-metal shop needs,
  // test-reports/2026-11-17-drawing-gaps.md): Crop View of a flat (and of any view) by a rectangle, a circle or a
  // closed sketched profile, with what lies outside going (bend notes / tags, centre marks, ordinates, hole tags) ---
  (function () {
    group('rfPM: Crop View of a flat pattern and of a section by a sketched profile; what goes with the cropped paper');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing, T = 0.0598;
    // the rfPH blank: 48 x 6 (16 ga), Ø.281 holes at x 6, 18, 30, 42 (y 3), a Ø.25 at 24, 4.5; Sketched Bends at x 2, 46
    var BLANK = 'p.name("PM blank").units("in");\np.sheet(' + T + ', 0.06, 0.44);\np.sketch("Top").rect(0, -6, 48, 6).end().baseFlange();\n' +
      'p.sketch("Top", ' + T + ').circle(6, -3, 0.1405).circle(18, -3, 0.1405).circle(30, -3, 0.1405).circle(42, -3, 0.1405).circle(24, -1.5, 0.125).cut("through", { reverse: true });\n' +
      'p.sketch("Top", ' + T + ').line(2, 0, 2, -6).line(46, 0, 46, -6).sketchedBend(90);\n';
    var part = null;
    function rfPMPart() { if (!part) { part = build(BLANK); noErrors(part); } return part; }
    // the flat at 1:4 centred at (8, 6) on ANSI B, Autodimension (ordinates), a Hole Table from the lower-left corner,
    // Auto centre marks, FLAT SIZE; mode 'table': the Bend Table and its tags
    function rfPMSheet(mode) {
      var r = rfPMPart(), doc = DW.newDrawing(r.model, { date: '2026-11-18' });
      doc.sheet.scale = [1, 4];
      doc.options = Object.assign(doc.options || {}, { flatSizeNote: true });
      var v = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, x: 8, y: 6, scale: [1, 4] });
      var q = { doc: doc, view: v, r: r };
      q.compute = function () { q.sheet = DW.compute(doc, r.mesh, r.model, { build: r.build }); q.w = q.sheet.views.filter(function (x) { return x.view.id === v.id; })[0]; return q.sheet; };
      q.compute();
      DW.flatAutodimension(doc, v.id, q.w, q.sheet, {});
      q.compute();
      var bb = q.w.flat.bbox;
      DW.addHoleTable(doc, v.id, { all: true, origin: { p: [bb.umin, bb.vmin] } }, q.w);
      DW.autoCenterMarks(doc, r.mesh, v.id);
      if (mode === 'table') v.bendNotes = 'table';
      q.compute();
      return q;
    }
    function rfPMTexts(q, layer) { return q.sheet.prims.filter(function (p) { return p.k === 'text' && (!layer || p.layer === layer); }); }
    // every point of the view's own linework (its layer, the bend / etch layers) must lie in the region inside(p)
    function rfPMOutside(q, inside, tol) {
      var bad = [];
      q.sheet.prims.forEach(function (p) {
        var mine = (p.layer === q.w.layer && p.view == null && p.k !== 'text') || (p.view === q.view.id && (p.bend != null || p.etch || p.regionLine != null));
        if (!mine) return;
        var pts = [];
        if (p.k === 'line') pts = [p.a, p.b, [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2]];
        else if (p.k === 'circle') for (var i = 0; i < 16; i++) pts.push([p.c[0] + p.r * Math.cos(i * Math.PI / 8), p.c[1] + p.r * Math.sin(i * Math.PI / 8)]);
        else if (p.k === 'arc') for (var j = 0; j <= 8; j++) { var t = (p.a0 + (p.a1 - p.a0) * j / 8) * Math.PI / 180; pts.push([p.c[0] + p.r * Math.cos(t), p.c[1] + p.r * Math.sin(t)]); }
        pts.forEach(function (x) { if (!inside(x, tol || 1e-7)) bad.push(p.k + ' ' + x.map(function (n) { return n.toFixed(4); }).join(',')); });
      });
      return bad;
    }

    test('rfPM: a flat-pattern view crops (it was refused): u -1 .. 20 of the 48 in blank at 1:4 keeps the holes at 6 and 18, the bend line at 2 with its note; the box is the crop; FLAT SIZE still the whole blank', function () {
      var q = rfPMSheet('notes'), bb = q.w.flat.bbox, cx = q.w.toSheet;
      DW.setCrop(q.doc, q.view.id, { a: [-1, bb.vmin - 1], b: [20, bb.vmax + 1] });
      assert(q.view.crop && q.view.crop.type === 'rect', JSON.stringify(q.view.crop));
      q.compute();
      var b = q.w.box;
      near(b.x0, cx([0, 0])[0], 1e-9, 'box left = the blank edge'); near(b.x1 - b.x0, 20 / 4, 1e-9, 'box 5 in wide (20 in at 1:4)');
      var circ = q.sheet.prims.filter(function (p) { return p.k === 'circle' && p.layer === q.w.layer; }).map(function (p) { return +p.c[0].toFixed(4); }).sort(function (x, y) { return x - y; });
      assert(JSON.stringify(circ) === JSON.stringify([3.5, 6.5]), 'holes 6 and 18 (paper x 3.5, 6.5): ' + JSON.stringify(circ));
      var bends = q.sheet.prims.filter(function (p) { return p.layer === 'BEND_UP'; });
      assert(bends.length === 1 && Math.abs(bends[0].a[0] - 2.5) < 1e-9, 'one bend line, at x 2: ' + bends.map(function (p) { return p.a[0]; }));
      var notes = rfPMTexts(q, 'BEND_NOTES');
      assert(notes.length === 1 && Math.abs(notes[0].p[0] - 2.5) < 0.1, 'one bend note on it: ' + notes.map(function (p) { return p.text + '@' + p.p; }).join(' '));
      assert(q.sheet.annotations.filter(function (a) { return a.type === 'bendNote' && a.inCrop; }).length === 1, 'the other note marked inCrop');
      var R = [cx([-1, 0])[0], cx([20, 0])[0]];
      var bad = rfPMOutside(q, function (p, t) { return p[0] >= R[0] - t && p[0] <= R[1] + t; });
      assert(!bad.length, 'nothing of the view past u 20: ' + bad.slice(0, 5).join(' | '));
      var fs = rfPMTexts(q).filter(function (p) { return /^FLAT SIZE 48\.000 × 6\.000$/.test(p.text); });
      assert(fs.length === 1 && Math.abs(fs[0].p[0] - (b.x0 + b.x1) / 2) < 1e-9 && fs[0].p[1] < b.y0, 'FLAT SIZE the true size, under the cropped view: ' + JSON.stringify(fs.map(function (p) { return p.p; })));
      return 'box ' + (b.x1 - b.x0).toFixed(3) + ' wide, holes ' + circ.join(' / ');
    });

    test('rfPM: on the cropped flat the ordinates, hole tags and centre marks of the holes outside go (24, 30, 42, 4.500; B2, B3, A1); edges the crop cuts keep theirs (0, 6.000, 48 overall gone: its end is cropped); the Hole Table keeps its five rows', function () {
      var q = rfPMSheet('notes'), bb = q.w.flat.bbox, ht0 = q.sheet.holeTables[0];
      var cm0 = q.sheet.annotations.filter(function (a) { return a.type === 'centerMark'; }).length;
      DW.setCrop(q.doc, q.view.id, { a: [-1, bb.vmin - 1], b: [20, bb.vmax + 1] });
      q.compute();
      var dims = rfPMTexts(q, 'DIMENSIONS').map(function (p) { return p.text; });
      ['24.000', '30.000', '42.000', '46.000', '48.000', '4.500'].forEach(function (s) { assert(dims.indexOf(s) < 0, s + ' went with the cropped paper: ' + dims.join(' ')); });
      ['0', '2.000', '6.000', '18.000'].forEach(function (s) { assert(dims.indexOf(s) >= 0, s + ' kept: ' + dims.join(' ')); });
      // a member on an edge the crop cuts (the bottom edge, v 0) starts from the edge's kept end, inside the crop
      var x20 = q.w.toSheet([20, 0])[0];
      var ords = q.sheet.prims.filter(function (p) { return p.k === 'line' && p.layer === 'DIMENSIONS' && p.ordM; });
      assert(ords.length && ords.every(function (p) { return p.ordM[0] <= x20 + 1e-9; }), 'every kept member\'s feature point inside the crop');
      var tags = q.sheet.prims.filter(function (p) { return p.holeTag != null; }).map(function (p) { return p.text; }).sort();
      assert(tags.length === 2, 'two hole tags left (holes 6 and 18): ' + tags.join(' '));
      var cms = q.sheet.annotations.filter(function (a) { return a.type === 'centerMark'; }), shown = cms.filter(function (a) { return !a.inCrop; });
      assert(cm0 === 5 && cms.length === 5 && shown.length === 2, 'centre marks shown ' + shown.length + ' of ' + cms.length);
      var cmLines = q.sheet.prims.filter(function (p) { return p.k === 'line' && p.annId != null && cms.some(function (a) { return a.inCrop && a.id === p.annId; }); });
      assert(!cmLines.length, 'no lines of the cropped-away centre marks: ' + cmLines.length);
      var ht = q.sheet.holeTables[0];
      assert(ht.rows.length === 5 && ht.rows.map(function (r) { return r.xText; }).join(' ') === ht0.rows.map(function (r) { return r.xText; }).join(' '), 'rows: ' + ht.rows.length);
      return dims.join(' ') + '; tags ' + tags.join(' ');
    });

    test('rfPM: Bend Table mode: the cropped bend\'s tag goes, the table keeps both rows, the Fixed Face note (at the blank\'s centre, u 24) goes with the cropped paper; Remove Crop brings everything back', function () {
      var q = rfPMSheet('table'), bb = q.w.flat.bbox;
      var tags0 = rfPMTexts(q, 'BEND_NOTES').filter(function (p) { return (p.text === 'A' || p.text === 'B') && p.rot; }).length;
      DW.setCrop(q.doc, q.view.id, { a: [-1, bb.vmin - 1], b: [20, bb.vmax + 1] });
      q.compute();
      var tags = rfPMTexts(q, 'BEND_NOTES').filter(function (p) { return (p.text === 'A' || p.text === 'B') && p.rot; });
      assert(tags0 === 2 && tags.length === 1, 'tags ' + tags0 + ' -> ' + tags.length);
      var tb = q.sheet.annotations.filter(function (a) { return a.type === 'bendTable'; })[0];
      assert(tb && tb.info.rows.length === 2 && isFinite(tb.box.x0), 'the Bend Table, both rows');
      var ff = q.sheet.annotations.filter(function (a) { return a.type === 'fixedFace'; })[0];
      assert(ff && ff.inCrop && !rfPMTexts(q).some(function (p) { return p.text === 'Fixed Face'; }), 'Fixed Face gone');
      DW.setCrop(q.doc, q.view.id, null);
      assert(!q.view.crop, 'crop removed');
      q.compute();
      assert(rfPMTexts(q).some(function (p) { return p.text === 'Fixed Face'; }) && q.sheet.prims.filter(function (p) { return p.layer === 'BEND_UP'; }).length === 2, 'back: Fixed Face and both bend lines');
      return 'tags 2 -> 1, table 2 rows';
    });

    test('rfPM: a crop that cuts across the bend lines keeps each note on the kept piece of its line (v 0 .. 2 of the 6 in blank: the notes sat at v 3)', function () {
      var q = rfPMSheet('notes'), bb = q.w.flat.bbox;
      DW.setCrop(q.doc, q.view.id, { a: [bb.umin - 1, bb.vmin - 1], b: [bb.umax + 1, bb.vmin + 2] });
      q.compute();
      var lines = q.sheet.prims.filter(function (p) { return p.layer === 'BEND_UP'; }), notes = rfPMTexts(q, 'BEND_NOTES');
      assert(lines.length === 2 && notes.length === 2, 'two bend lines, two notes: ' + lines.length + ' / ' + notes.length);
      var y1 = q.w.toSheet([0, bb.vmin + 2])[1];
      lines.forEach(function (l) { assert(Math.max(l.a[1], l.b[1]) <= y1 + 1e-9, 'bend line cropped at v 2: ' + JSON.stringify([l.a, l.b])); });
      notes.forEach(function (n) {
        var r = DW.textRect(n);
        assert(r.y1 <= y1 + 1e-9 || r.y0 >= y1 - 1e-9 || lines.some(function (l) { return Math.abs(l.a[0] - n.p[0]) < 0.2; }), 'note on its line\'s kept piece: ' + JSON.stringify(r));
        assert(lines.some(function (l) { return Math.abs(l.a[0] - n.p[0]) < 0.2 && Math.min(l.a[1], l.b[1]) < r.y1 && Math.max(l.a[1], l.b[1]) > r.y0; }), 'beside a kept piece');
      });
      return 'notes at y ' + notes.map(function (n) { return n.p[1].toFixed(3); }).join(' / ');
    });

    test('rfPM: a closed sketched profile crops the flat (a triangle; a circle crop too): its outline, holes and bend lines only inside it; the profile turns with Rotate View at any angle', function () {
      var q = rfPMSheet('notes'), bb = q.w.flat.bbox;
      var tri = [[-1, bb.vmin - 1], [21, bb.vmin - 1], [-1, bb.vmax + 6]];
      DW.setCrop(q.doc, q.view.id, { pts: tri });
      assert(q.view.crop.type === 'poly' && q.view.crop.pts.length === 3, JSON.stringify(q.view.crop));
      q.compute();
      var S = tri.map(q.w.toSheet);
      function inTri(p, t) {
        for (var i = 0; i < 3; i++) { var a = S[i], b = S[(i + 1) % 3], c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); if (c < -t * Math.hypot(b[0] - a[0], b[1] - a[1])) return false; }
        return true;
      }
      var bad = rfPMOutside(q, inTri);
      assert(!bad.length, 'nothing outside the triangle: ' + bad.slice(0, 5).join(' | '));
      var bl = q.sheet.prims.filter(function (p) { return p.layer === 'BEND_UP'; });
      assert(bl.length === 1, 'the bend at u 2 crosses the triangle: ' + bl.length);
      var circles = q.sheet.prims.filter(function (p) { return (p.k === 'circle' || p.k === 'arc') && p.layer === q.w.layer; });
      assert(circles.length >= 1, 'the hole at 6 inside: ' + circles.length);
      // circle crop round the hole at 18 (r 2): the bend lines are gone, one hole left
      var q2 = rfPMSheet('notes'), hc = [18, bb.vmin + 3];
      DW.setCrop(q2.doc, q2.view.id, { c: hc, r: 2 });
      q2.compute();
      var C = q2.w.toSheet(hc);
      var bad2 = rfPMOutside(q2, function (p, t) { return Math.hypot(p[0] - C[0], p[1] - C[1]) <= 0.5 + t; });
      assert(!bad2.length && !q2.sheet.prims.some(function (p) { return p.layer === 'BEND_UP'; }), 'circle crop: ' + bad2.slice(0, 3).join(' | '));
      assert(q2.sheet.prims.filter(function (p) { return p.k === 'circle' && p.layer === q2.w.layer; }).length === 1, 'one hole in the circle');
      // Rotate View 30°: the profile's points turn with the view
      var m = DW.newDrawing(rfPMPart().model, {});
      var r = build('p.units("in"); p.sketch("Front").rect(0, 0, 4, 2).circle(3, 1, 0.25).extrude(0.25);');
      var d2 = DW.newDrawing(r.model, { scale: [1, 1] }), fv = DW.addView(d2, 'Front', { x: 6, y: 5 });
      DW.setCrop(d2, fv.id, { pts: [[0, 0], [2, 0], [2, 2]] });
      DW.setViewRotation(d2, fv.id, 30);
      var p1 = fv.crop.pts[1];
      near(p1[0], 2 * Math.cos(Math.PI / 6), 1e-12, 'turned x'); near(p1[1], 2 * Math.sin(Math.PI / 6), 1e-12, 'turned y');
      assert(m, 'doc');
      return 'triangle ok, circle ok';
    });

    test('rfPM: Crop View by a sketched profile on a section view: the hatching is clipped to the profile, not to its box; a Smart Dimension on an edge inside keeps its value; one whose end is cropped away goes; the view\'s dimension on an edge the crop cuts reads its true length', function () {
      var r = build('p.units("in"); p.sketch("Front").rect(0, 0, 4, 2).circle(3, 1, 0.25).extrude(1);');
      noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-18', scale: [1, 1] });
      doc.autoDims = false;
      var fv = DW.addView(doc, 'Front', { x: 4, y: 5 });
      var top = DW.addView(doc, 'Top', { x: 4, y: 8.5, parent: fv.id, align: 'x' });
      var sec = DW.addSectionView(doc, r.mesh, fv.id, { axis: 'h', at: 1, x: 12, y: 5 });
      var sh = DW.compute(doc, r.mesh, r.model);
      var sw = sh.views.filter(function (w) { return w.view.id === sec.id; })[0];
      var h0 = sh.prims.filter(function (p) { return p.layer === sw.layer && p.style === 'hatch'; }).length;
      assert(h0 > 10, 'hatched: ' + h0);
      // a triangle over the section (its frame: u along X, v along Z)
      var b = sw.proj.bounds, tri = [[b.umin - 0.1, b.vmin - 0.1], [b.umax + 0.1, b.vmin - 0.1], [b.umin - 0.1, b.vmax + 0.1]];
      // dims on the Front view: the bottom edge 4.000 (cropped across), the hole Ø.500
      var e4 = DW.addSmartDim(doc, fv.id, { edge: [[0, 0], [4, 0]] }, null, [2, -0.6]);
      var dh = DW.addSmartDim(doc, fv.id, { circle: { c: [3, 1], r: 0.25 } }, null, [4.5, 2.5]);
      var e2 = DW.addSmartDim(doc, fv.id, { edge: [[0, 0], [0, 2]] }, null, [-0.6, 1]);
      assert(e4 && dh && e2, 'three dims');
      DW.setCrop(doc, sec.id, { pts: tri });
      DW.setCrop(doc, fv.id, { a: [-0.5, -0.5], b: [3.5, 2.5] });
      sh = DW.compute(doc, r.mesh, r.model);
      sw = sh.views.filter(function (w) { return w.view.id === sec.id; })[0];
      var S = tri.map(sw.toSheet), hatch = sh.prims.filter(function (p) { return p.layer === sw.layer && p.style === 'hatch'; });
      assert(hatch.length && hatch.length < h0, 'hatch clipped: ' + h0 + ' -> ' + hatch.length);
      var cr = function (a, bb, p) { return (bb[0] - a[0]) * (p[1] - a[1]) - (bb[1] - a[1]) * (p[0] - a[0]); };
      var outH = hatch.filter(function (p) { return [p.a, p.b].some(function (x) { return cr(S[0], S[1], x) < -1e-7 || cr(S[1], S[2], x) < -1e-7 || cr(S[2], S[0], x) < -1e-7; }); });
      assert(!outH.length, 'every hatch line inside the triangle: ' + outH.length);
      var fd = sh.dims.filter(function (d) { return d.view === fv.id; }), byKind = {};
      fd.forEach(function (d) { byKind[d.kind] = d; });
      var d4 = fd.filter(function (d) { return Math.abs(d.value - 4) < 1e-9; })[0], dd = fd.filter(function (d) { return d.kind === 'dia'; })[0], d2v = fd.filter(function (d) { return Math.abs(d.value - 2) < 1e-9; })[0];
      assert(d4 && d4.inCrop && !isFinite(d4.box.x0), 'the 4.000 (its end at x 4 cropped) goes: ' + JSON.stringify(d4 && d4.box));
      assert(dd && !dd.inCrop && isFinite(dd.box.x0) && Math.abs(dd.value - 0.5) < 1e-9, 'Ø.500 kept');
      assert(d2v && !d2v.inCrop, 'the 2.000 on the left edge kept');
      assert(!sh.prims.some(function (p) { return p.k === 'text' && p.text === '4.000'; }), 'no 4.000 drawn');
      return h0 + ' -> ' + hatch.length + ' hatch lines';
    });

    test('rfPM: the cropped flat to SVG, PDF, DXF R12 and R2000: nothing of the view past the crop, a clean DXF audit; a detail view is refused, a profile of two points refused', function () {
      var q = rfPMSheet('notes'), bb = q.w.flat.bbox;
      DW.setCrop(q.doc, q.view.id, { a: [-1, bb.vmin - 1], b: [20, bb.vmax + 1] });
      q.compute();
      var x20 = q.w.toSheet([20, 0])[0], out = [];
      ['R12', 'R2000'].forEach(function (ver) {
        var dxf = DW.toDXF(q.sheet, { version: ver });
        if (typeof DxfCheck !== 'undefined' && DxfCheck.audit) {
          var au = DxfCheck.audit(dxf, { units: 'in' });
          assert(!au.errors.length, ver + ' audit: ' + au.errors.slice(0, 3).join(' | '));
        }
        // LINE entities on the view's layer, BEND_UP / BEND_DOWN: x within the crop
        var L = dxf.split('\n'), bad = 0;
        for (var i = 0; i + 1 < L.length; i += 2) {
          if (L[i].trim() !== '0' || L[i + 1].trim() !== 'LINE') continue;
          var lay = null, xs = [];
          for (var j = i + 2; j + 1 < L.length && L[j].trim() !== '0'; j += 2) { var c = L[j].trim(), val = L[j + 1].trim(); if (c === '8') lay = val; if (c === '10' || c === '11') xs.push(+val); }
          if ((lay === q.w.layer || /^BEND_/.test(lay)) && xs.some(function (x) { return x > x20 + 1e-6; })) bad++;
        }
        assert(!bad, ver + ': ' + bad + ' lines past the crop');
        out.push(ver + ' ok');
      });
      var svg = DW.toSVG(q.sheet), pdf = DW.toPDF(q.sheet);
      assert(svg.indexOf('UP 90°') >= 0 || svg.indexOf('UP 90&#176;') >= 0 || /UP 90/.test(svg), 'SVG has the kept bend note');
      assert(/\(FLAT SIZE 48\.000 X 6\.000\) Tj|FLAT SIZE 48\.000/.test(pdf), 'PDF has FLAT SIZE');
      var r = build('p.units("in"); p.sketch("Front").rect(0, 0, 4, 2).circle(3, 1, 0.25).extrude(0.25);');
      var doc = DW.newDrawing(r.model, { scale: [1, 1] }), fv = DW.addView(doc, 'Front', { x: 5, y: 5 });
      var dv = DW.addDetailView(doc, r.mesh, fv.id, { c: [3, 1], r: 0.5, x: 10, y: 5 }), t1 = '', t2 = '';
      try { DW.setCrop(doc, dv.id, { a: [0, 0], b: [1, 1] }); } catch (e) { t1 = e.message; }
      try { DW.setCrop(doc, fv.id, { pts: [[0, 0], [1, 1]] }); } catch (e) { t2 = e.message; }
      assert(/detail view cannot be cropped/.test(t1), 'detail refused: ' + t1);
      assert(/closed outline/.test(t2), 'two points refused: ' + t2);
      return out.join(', ');
    });
  })();

  // --- rfPM 3: Alternate Position View (an assembly's second position in phantom lines) ---
  (function () {
    group('rfPM: Alternate Position View: a block on a base by a Distance mate (15 -> 40 mm), drawn again in phantom where the second position puts it');
    if (typeof Drawing === 'undefined' || typeof Assembly === 'undefined') return;
    var DW = Drawing, AS = Assembly;
    // Base 100 x 60 x 10 fixed; Block 20 x 20 x 20 held 15 mm over the base top by a Distance mate (its faces flush left / front)
    function rfPMAsm() {
      var m = AS.newAssembly();
      var base = AS.insert(m, { script: 'p.name("Base"); p.box(100, 60, 10);' }).id, blk = AS.insert(m, { script: 'p.name("Block"); p.box(20, 20, 20);' }, { position: [5, 40, 5] }).id;
      var dm = AS.addMate(m, 'distance', { component: blk, face: [10, 0, 10] }, { component: base, face: [50, 10, 30] }, { distance: 15 });
      AS.addMate(m, 'coincident', { component: blk, face: [0, 10, 10] }, { component: base, face: [0, 5, 30] }, { alignment: 'aligned' });
      AS.addMate(m, 'coincident', { component: blk, face: [10, 10, 0] }, { component: base, face: [50, 5, 0] }, { alignment: 'aligned' });
      var b = AS.rebuild(m), mesh = K.meshFromBody(b.body);
      return { model: m, build: b, mesh: mesh, mate: dm, blk: blk };
    }
    test('rfPM: the Front view shows the block again 25 mm higher in thin phantom (its visible outline only), the base not twice; one mate value stored; refusals (no change, a negative value, a part drawing); deleted', function () {
      var a = rfPMAsm(), doc = DW.newDrawing(a.model, { date: '2026-11-18', scale: [1, 2] });
      doc.autoDims = false;
      var fv = DW.addView(doc, 'Front', { x: 150, y: 150 });
      var sh0 = DW.compute(doc, a.mesh, a.model, { build: a.build }), w0 = sh0.views[0];
      var alt = DW.addAltPosition(doc, fv.id, { mates: { Distance1: 40 } }, a.model);
      assert(alt.id === 1 && alt.name === 'AltPosition_' + fv.name + '_1' && JSON.stringify(alt.mates) === JSON.stringify(JSONkey(a.mate.id, 40)), 'entry: ' + JSON.stringify(alt));
      var sh = DW.compute(doc, a.mesh, a.model, { build: a.build }), w = sh.views[0];
      var ph = sh.prims.filter(function (p) { return p.altPos === 1; });
      assert(ph.length >= 4 && ph.every(function (p) { return p.style === 'tanfont' && p.layer === w.layer && p.view === fv.id; }), 'phantom lines: ' + ph.length);
      // the block's top edge in the main position (y 45 in the Front frame) and in the second (y 70): on paper 12.5 mm apart at 1:2
      var tops0 = sh.prims.filter(function (p) { return p.k === 'line' && p.layer === w.layer && p.style === 'visible' && Math.abs(p.a[1] - p.b[1]) < 1e-9; }).map(function (p) { return p.a[1]; });
      var topAlt = Math.max.apply(null, ph.filter(function (p) { return p.k === 'line'; }).map(function (p) { return Math.max(p.a[1], p.b[1]); }));
      var top0 = Math.max.apply(null, tops0);
      near(topAlt - top0, 25 / 2, 1e-6, 'the second position 25 mm higher (paper, 1:2)');
      var xs = ph.filter(function (p) { return p.k === 'line'; }).map(function (p) { return [p.a[0], p.b[0]]; }).reduce(function (x, y) { return x.concat(y); }, []);
      near(Math.max.apply(null, xs) - Math.min.apply(null, xs), 20 / 2, 1e-6, 'only the block (20 mm wide), not the base');
      assert(!ph.some(function (p) { return p.style === 'hidden'; }), 'no hidden lines');
      // DXF: PHANTOM line type
      var dxf = DW.toDXF(sh, { version: 'R2000' });
      assert(/\n6\r?\nPHANTOM\r?\n/.test(dxf), 'PHANTOM in the DXF');
      if (typeof DxfCheck !== 'undefined') { var au = DxfCheck.audit(dxf, {}); assert(!au.errors.length, 'audit: ' + au.errors.slice(0, 3).join(' | ')); }
      var t = '';
      try { DW.addAltPosition(doc, fv.id, { mates: { Distance1: 15 } }, a.model); } catch (e) { t = e.message; }
      assert(/change a mate value/.test(t), 'no change refused: ' + t);
      try { DW.addAltPosition(doc, fv.id, { mates: { Coincident1: -1 } }, a.model); } catch (e) { t = e.message; }
      assert(/≥ 0/.test(t), 'negative refused: ' + t);
      var r = build('p.box(10, 10, 10);'), pd = DW.newDrawing(r.model, {}), pv = DW.addView(pd, 'Front', { x: 50, y: 50 });
      try { DW.addAltPosition(pd, pv.id, { mates: { Distance1: 40 } }, r.model); } catch (e) { t = e.message; }
      assert(/assembly drawing/.test(t), 'a part refused: ' + t);
      assert(w0.box.x1 - w0.box.x0 > 0, 'box');
      assert(DW.deleteAltPosition(doc, fv.id, 1) && !doc.views[0].altPositions, 'deleted');
      var sh2 = DW.compute(doc, a.mesh, a.model, { build: a.build });
      assert(!sh2.prims.some(function (p) { return p.altPos != null; }), 'gone from the sheet');
      return ph.length + ' phantom lines';
    });
    function JSONkey(k, v) { var o = {}; o[String(k)] = v; return o; }
  })();

  // --- rfPM 4: the assembly drawing's BOM DESCRIPTION from the part's Description property (custom or configuration-specific) ---
  (function () {
    group('rfPM: BOM on an assembly drawing: DESCRIPTION is the part\'s Description property, per configuration; a suppressed component is not listed');
    if (typeof Drawing === 'undefined' || typeof Assembly === 'undefined' || typeof Materials === 'undefined') return;
    var DW = Drawing, AS = Assembly;
    test('rfPM: Bracket (Description BRACKET, 14 GA), Bar shown in two configurations (Short: BAR 2 FT, Long: BAR 4 FT) two rows, a plain block falls back to its size, a suppressed one left out; the sheet\'s BOM table and its DXF / PDF say so', function () {
      var m = AS.newAssembly();
      var br = AS.insert(m, { script: 'p.name("Bracket"); p.box(40, 20, 3); p.property("Description", "BRACKET, 14 GA");' }).id;
      var BAR = 'p.name("Bar"); p.box(60, 10, 10); p.configurations([{ name: "Short", values: {} }, { name: "Long", values: {} }], "Short"); p.property("Description", "BAR 2 FT", { config: "Short" }); p.property("Description", "BAR 4 FT", { config: "Long" });';
      var b1 = AS.insert(m, { script: BAR }, { position: [0, 30, 0], config: 'Short' }).id, b2 = AS.insert(m, { script: BAR }, { position: [0, 50, 0], config: 'Long' }).id;
      var b3 = AS.insert(m, { script: BAR }, { position: [0, 70, 0], config: 'Long' }).id;
      var blk = AS.insert(m, { script: 'p.name("Spacer"); p.box(10, 10, 10);' }, { position: [80, 0, 0] }).id;
      var gone = AS.insert(m, { script: 'p.name("Cover"); p.box(30, 30, 2); p.property("Description", "COVER");' }, { position: [0, -40, 0] }).id;
      AS.setComponentState(m, gone, { suppressed: true });
      var b = AS.rebuild(m), mesh = K.meshFromBody(b.body);
      var rows = DW.bomRows(m, mesh, { show: true }, { build: b });
      var txt = rows.map(function (r) { return r.partNumber + ' | ' + r.description + ' | ' + r.qty; });
      assert(rows.length === 4, 'four rows (Bracket, Bar Short, Bar Long, Spacer): ' + txt.join(' / '));
      assert(txt[0] === 'Bracket | BRACKET, 14 GA | 1', txt[0]);
      assert(txt[1] === 'Bar | BAR 2 FT | 1' && txt[2] === 'Bar | BAR 4 FT | 2', 'one row per configuration: ' + txt.slice(1, 3).join(' / '));
      assert(/^Spacer \| 10(\.0+)? x 10(\.0+)? x 10(\.0+)? \| 1$/.test(txt[3]), 'no property: its size: ' + txt[3]);
      assert(!txt.some(function (t) { return /COVER/.test(t); }), 'the suppressed Cover is not listed');
      var doc = DW.newDrawing(m, { date: '2026-11-18' });
      DW.standard3View(doc, mesh, 'mm');
      var sh = DW.compute(doc, mesh, m, { build: b });
      assert(sh.bom && sh.bom.cells.some(function (r) { return r.indexOf('BAR 4 FT') >= 0; }) && sh.bom.cells.some(function (r) { return r.indexOf('BRACKET, 14 GA') >= 0; }), 'the sheet\'s BOM: ' + JSON.stringify(sh.bom && sh.bom.cells));
      var dxf = DW.toDXF(sh), pdf = DW.toPDF(sh);
      assert(/\nBAR 4 FT\r?\n/.test(dxf) && /\(BAR 4 FT\) Tj/.test(pdf), 'DXF / PDF text');
      assert(br && b1 && b2 && b3 && blk, 'ids');
      return txt.join(' / ');
    });
  })();

  // --- rfPM 2: drawing Blocks (Make Block / Insert Block / Explode Block on the drawing's sketch; DXF BLOCK / INSERT) ---
  (function () {
    group('rfPM: drawing Blocks: a finish stamp made a block, inserted twice (scaled, turned), exploded; DXF R12 / R2000 BLOCK + INSERT, DWG');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing;
    // an inch plate drawing with a "FINISH" stamp on the sheet: a 2 x .75 box, a line across, two texts
    function rfPMStamp() {
      var r = build('p.units("in"); p.sketch("Front").rect(0, 0, 4, 2).extrude(0.25);');
      var doc = DW.newDrawing(r.model, { date: '2026-11-18', scale: [1, 1] });
      DW.addView(doc, 'Front', { x: 4, y: 5 });
      var ids = DW.addSketchRect(doc, [12, 1], [14, 1.75]);
      ids.push(DW.addSketchEntity(doc, { t: 'line', a: [12, 1.375], b: [14, 1.375] }).id);
      ids.push(DW.addSketchEntity(doc, { t: 'text', p: [12.1, 1.5], text: 'FINISH: POWDER COAT', h: 0.1 }).id);
      ids.push(DW.addSketchEntity(doc, { t: 'text', p: [12.1, 1.12], text: 'BLACK RAL 9005', h: 0.1 }).id);
      return { r: r, doc: doc, ids: ids, sheet: function () { return DW.compute(doc, r.mesh, r.model); } };
    }
    function rfPMEnts(dxf, section) {
      var L = dxf.split('\n').map(function (s) { return s.trim(); }), out = [], sec = null, cur = null;
      for (var i = 0; i + 1 < L.length; i += 2) {
        var c = L[i], v = L[i + 1];
        if (c === '0' && v === 'SECTION') { sec = L[i + 3]; continue; }
        if (c === '0') { cur = { type: v, sec: sec, g: {} }; out.push(cur); continue; }
        if (cur && cur.g[c] == null) cur.g[c] = v;
      }
      return out.filter(function (e) { return !section || e.sec === section; });
    }

    test('rfPM: Make Block from six sketch entities: one instance at their lower-left corner, the definition relative to it; the sheet draws the same lines and texts as before', function () {
      var s = rfPMStamp(), sh0 = s.sheet(), before = sh0.prims.filter(function (p) { return p.layer === 'SKETCH'; });
      var ins = DW.makeBlock(s.doc, s.ids, { name: 'Finish stamp' });
      assert(ins.t === 'block' && ins.name === 'Finish stamp' && Math.abs(ins.p[0] - 12) < 1e-12 && Math.abs(ins.p[1] - 1) < 1e-12, 'instance: ' + JSON.stringify(ins));
      var def = DW.blockDef(s.doc, 'Finish stamp');
      assert(def && def.ents.length === 7, 'definition: ' + (def && def.ents.length));   // 4 + 1 lines, 2 texts
      assert(def.ents.some(function (e) { return e.t === 'line' && Math.abs(e.a[0]) < 1e-12 && Math.abs(e.a[1]) < 1e-12; }), 'relative to the insertion point');
      var list = DW.sketchEntities(s.doc, null);
      assert(list.length === 1 && list[0].t === 'block', 'the sketch holds the instance only: ' + list.map(function (e) { return e.t; }).join(','));
      var after = s.sheet().prims.filter(function (p) { return p.layer === 'SKETCH'; });
      assert(after.length === before.length, 'same count drawn: ' + before.length + ' / ' + after.length);
      var key = function (p) { return p.k + (p.a ? p.a.concat(p.b).map(function (x) { return x.toFixed(6); }).join(',') : '') + (p.p ? p.p.map(function (x) { return x.toFixed(6); }).join(',') + p.text : ''); };
      var A = before.map(key).sort().join('|'), B = after.map(key).sort().join('|');
      assert(A === B, 'same primitives');
      assert(after.every(function (p) { return p.blockIns === ins.id && p.block === 'Finish stamp'; }), 'tagged with their instance');
      var t = '';
      try { DW.makeBlock(s.doc, [ins.id], { name: 'x' }); } catch (e) { t = e.message; }
      assert(/explode it first/.test(t), 'a block of a block refused: ' + t);
      try { DW.makeBlock(s.doc, [], {}); } catch (e) { t = e.message; }
      assert(/select the sketch entities/.test(t), 'nothing selected: ' + t);
      return after.length + ' primitives';
    });

    test('rfPM: Insert Block twice (scale 1.5 turned 90°, and in a view so it moves with it), drag one, Explode Block gives plain entities where it was drawn; a used definition cannot be deleted', function () {
      var s = rfPMStamp(), ins = DW.makeBlock(s.doc, s.ids, { name: 'FIN' }), v = s.doc.views[0];
      var b2 = DW.insertBlock(s.doc, 'FIN', [16, 2], null, { scale: 1.5, rot: 90 });
      assert(b2.scale === 1.5 && b2.rot === 90, 'scaled, turned: ' + JSON.stringify(b2));
      var sh = s.sheet(), mine = sh.prims.filter(function (p) { return p.blockIns === b2.id; });
      // the definition's base line (0,0)-(2,0) turned 90° and 1.5 x: (16, 2)-(16, 5)
      assert(mine.some(function (p) { return p.k === 'line' && Math.abs(p.a[0] - 16) < 1e-9 && Math.abs(p.a[1] - 2) < 1e-9 && Math.abs(p.b[0] - 16) < 1e-9 && Math.abs(p.b[1] - 5) < 1e-9; }), 'turned base line');
      var tx = mine.filter(function (p) { return p.k === 'text'; });
      assert(tx.length === 2 && tx.every(function (p) { return p.rot === 90; }), 'texts turned with it');
      near(tx[0].h / sh.prims.filter(function (p) { return p.blockIns === ins.id && p.k === 'text'; })[0].h, 1.5, 1e-12, 'text height scaled');
      // in the view: it follows a view move
      var b3 = DW.insertBlock(s.doc, 'FIN', [v.x + 1, v.y - 2], v.id);
      var p0 = s.sheet().prims.filter(function (p) { return p.blockIns === b3.id && p.k === 'line'; })[0].a.slice();
      v.x += 1; v.y += 0.5;
      var p1 = s.sheet().prims.filter(function (p) { return p.blockIns === b3.id && p.k === 'line'; })[0].a;
      near(p1[0] - p0[0], 1, 1e-12, 'moved with the view x'); near(p1[1] - p0[1], 0.5, 1e-12, 'y');
      DW.moveSketchEntity(s.doc, ins.id, 0.5, -0.25);
      var moved = s.sheet().prims.filter(function (p) { return p.blockIns === ins.id && p.k === 'line'; });
      assert(moved.some(function (p) { return Math.abs(p.a[0] - 12.5) < 1e-12 && Math.abs(p.a[1] - 0.75) < 1e-12; }), 'dragged');
      var drawnBefore = s.sheet().prims.filter(function (p) { return p.blockIns === b2.id; }).map(function (p) { return p.k + (p.a ? p.a.concat(p.b) : p.p).map(function (x) { return x.toFixed(6); }).join(','); }).sort().join('|');
      var t = '';
      try { DW.deleteBlock(s.doc, 'FIN'); } catch (e) { t = e.message; }
      assert(/inserted on the sheet/.test(t), 'used definition kept: ' + t);
      var ids = DW.explodeBlock(s.doc, b2.id);
      assert(ids.length === 7, 'seven entities: ' + ids.length);
      var sh2 = s.sheet(), ex = sh2.prims.filter(function (p) { return ids.indexOf(p.sk) >= 0; });
      var drawnAfter = ex.map(function (p) { return p.k + (p.a ? p.a.concat(p.b) : p.p).map(function (x) { return x.toFixed(6); }).join(','); }).sort().join('|');
      assert(drawnAfter === drawnBefore, 'exploded where it was drawn');
      assert(!ex.some(function (p) { return p.blockIns != null; }), 'plain entities');
      assert(DW.blocks(s.doc).filter(function (b) { return b.name === 'FIN'; })[0].used === 2, 'two instances left');
      return DW.blocks(s.doc).map(function (b) { return b.name + ' x' + b.used; }).join(', ');
    });

    test('rfPM: the sheet with blocks to DXF: R2000 one BLOCK "FINISH_STAMP" (7 entities, at the origin) with a BLOCK_RECORD and two INSERTs (scale 1.5 / rotation 90), no loose copies; R12 a BLOCKS section; both audit clean (INSERTs placed where the sheet draws them); DWG written', function () {
      var s = rfPMStamp(), ins = DW.makeBlock(s.doc, s.ids, { name: 'Finish stamp' });
      DW.insertBlock(s.doc, 'Finish stamp', [16, 2], null, { scale: 1.5, rot: 90 });
      var sh = s.sheet(), out = [];
      ['R2000', 'R12'].forEach(function (ver) {
        var dxf = DW.toDXF(sh, { version: ver }), ents = rfPMEnts(dxf);
        var blk = ents.filter(function (e) { return e.sec === 'BLOCKS' && e.type === 'BLOCK' && e.g['2'] === 'FINISH_STAMP'; });
        assert(blk.length === 1 && blk[0].g['10'] === '0', ver + ' BLOCK: ' + blk.length);
        // the block's entities: between its BLOCK and ENDBLK
        var i0 = ents.indexOf(blk[0]), n = 0;
        for (var i = i0 + 1; i < ents.length && ents[i].type !== 'ENDBLK'; i++) if (ents[i].type === 'LINE' || ents[i].type === 'TEXT') n++;
        assert(n === 7, ver + ' block entities: ' + n);
        var insE = ents.filter(function (e) { return e.sec === 'ENTITIES' && e.type === 'INSERT'; });
        assert(insE.length === 2 && insE.every(function (e) { return e.g['2'] === 'FINISH_STAMP' && e.g['8'] === 'SKETCH'; }), ver + ' INSERTs: ' + insE.length);
        var turned = insE.filter(function (e) { return e.g['50'] === '90'; })[0];
        assert(turned && turned.g['41'] === '1.5' && turned.g['10'] === '16', ver + ' scale / rotation: ' + JSON.stringify(turned && turned.g));
        var loose = ents.filter(function (e) { return e.sec === 'ENTITIES' && e.type === 'TEXT' && /POWDER/.test(e.g['1'] || ''); });
        assert(!loose.length, ver + ' no loose copies of the stamp texts');
        if (ver === 'R2000') assert(ents.some(function (e) { return e.type === 'BLOCK_RECORD' && e.g['2'] === 'FINISH_STAMP'; }), 'BLOCK_RECORD');
        if (typeof DxfCheck !== 'undefined') { var au = DxfCheck.audit(dxf, { units: 'in' }); assert(!au.errors.length, ver + ' audit: ' + au.errors.slice(0, 3).join(' | ')); }
        out.push(ver + ' ok');
      });
      if (typeof DWG !== 'undefined') { var bytes = DWG.fromDXF(DW.toDXF(sh, { version: 'R2000' })); assert(bytes && bytes.length > 1000, 'DWG'); out.push('DWG ' + bytes.length + ' bytes'); }
      var svg = DW.toSVG(sh);
      assert((svg.match(/POWDER COAT/g) || []).length === 2, 'SVG draws both');
      assert(ins.id > 0, 'id');
      return out.join(', ');
    });

    test('rfPM: a block brought into another drawing (defineBlock: the library), names checked; the drawing file keeps the blocks (saved and read back)', function () {
      var s = rfPMStamp(); DW.makeBlock(s.doc, s.ids, { name: 'REV STAMP' });
      var def = DW.blockDef(s.doc, 'REV STAMP');
      var r = build('p.units("in"); p.sketch("Front").rect(0, 0, 3, 1).extrude(0.25);'), d2 = DW.newDrawing(r.model, { scale: [1, 1] });
      DW.defineBlock(d2, 'REV STAMP', def);
      var b = DW.insertBlock(d2, 'REV STAMP', [1, 1]);
      var sh = DW.compute(d2, r.mesh, r.model);
      assert(sh.prims.filter(function (p) { return p.blockIns === b.id; }).length === 7, 'drawn in the other drawing');
      var t = '';
      try { DW.defineBlock(d2, 'REV STAMP', def); } catch (e) { t = e.message; }
      assert(/already/.test(t), 'same name refused: ' + t);
      try { DW.defineBlock(d2, 'bad/name', def); } catch (e) { t = e.message; }
      assert(/block name/.test(t), 'bad name refused: ' + t);
      try { DW.insertBlock(d2, 'NOPE', [0, 0]); } catch (e) { t = e.message; }
      assert(/No block named/.test(t), 'unknown block refused: ' + t);
      var back = JSON.parse(JSON.stringify(d2));
      assert(back.blocks && back.blocks['REV STAMP'] && back.blocks['REV STAMP'].ents.length === 7, 'saved with the drawing');
      var sh2 = DW.compute(back, r.mesh, r.model);
      assert(sh2.prims.filter(function (p) { return p.block === 'REV STAMP'; }).length === 7, 'drawn after reading back');
      DW.explodeBlock(back, b.id); DW.deleteBlock(back, 'REV STAMP');
      assert(!DW.blocks(back).length, 'unused definition deleted');
      return 'ok';
    });
  })();
