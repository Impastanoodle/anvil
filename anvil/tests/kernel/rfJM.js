  // --- rfJM (2026-11-06, lane drawgaps-3): flat pattern view dimensioning for shop prints (Autodimension on a flat:
  // overall blank, hole centres and bend lines, ordinate from the blank's lower-left by default; Entities Selected;
  // placed clear of the title block, tables and views) and the bend-region tangent lines (flat.regionLines, Merge
  // faces off) drawn in the flat view ---
  (function () {
    group('rfJM: Autodimension on a flat pattern view (blank, holes, bend lines), bend region lines with Merge faces off');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing, T = 0.0598;
    // a 6 × 4 blank (16 ga), three holes, two Sketched Bends across it at x 1.5 and 4.5
    var BLANK = 'p.name("JM blank").units("in");\np.sheet(' + T + ', 0.06, 0.44);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
      'p.sketch("Top", ' + T + ').circle(0.75, -2, 0.1405).circle(3, -1, 0.1405).circle(3, -3, 0.125).cut("through", { reverse: true });\n' +
      'p.sketch("Top", ' + T + ').line(1.5, 0, 1.5, -4).line(4.5, 0, 4.5, -4).sketchedBend(90);\n';
    var parts = {};
    function rfJMPart(extra) { var key = extra || ''; if (!parts[key]) { parts[key] = build(BLANK + key); noErrors(parts[key]); } return parts[key]; }
    function rfJMSheet(viewOpts, extra, std) {
      var r = rfJMPart(extra), doc = DW.newDrawing(r.model, { date: '2026-11-06' });
      if (std !== false) DW.standard3View(doc, r.mesh, 'in');
      var v = DW.addFlatView(doc, r.mesh, Object.assign({ model: r.model, build: r.build, fit: true }, viewOpts || {}));
      var q = { doc: doc, view: v, r: r };
      q.compute = function () {
        q.sheet = DW.compute(doc, r.mesh, r.model, { build: r.build });
        q.w = q.sheet.views.filter(function (x) { return x.view.id === v.id; })[0];
        return q.sheet;
      };
      q.compute();
      return q;
    }
    function rfJMTexts(q) { return q.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'DIMENSIONS' && p.view === q.view.id || p.k === 'text' && p.dimIx != null && q.sheet.dims[p.dimIx] && q.sheet.dims[p.dimIx].view === q.view.id; }); }
    function meet(a, b, m) { m = m || 0; return a.x0 - m < b.x1 && b.x0 - m < a.x1 && a.y0 - m < b.y1 && b.y0 - m < a.y1; }

    test('rfJM: the 6 × 4 blank gets ordinates from its lower-left: 0 .750 1.500 3.000 4.500 6.000 across, 0 1 2 3 4 up', function () {
      var q = rfJMSheet(), w = q.w;
      assert(w && w.view.kind === 'flat', 'flat view');
      var b = w.flat.bbox;
      near(b.umax - b.umin, 6, 1e-9); near(b.vmax - b.vmin, 4, 1e-9);
      var hst = DW.gtStations(w.proj, 'h', {}).map(function (s) { return Math.round((s.pos - b.umin) * 1e6) / 1e6; });
      assert(JSON.stringify(hst) === JSON.stringify([0, 0.75, 1.5, 3, 4.5, 6]), 'stations across: ' + JSON.stringify(hst));
      var r = DW.flatAutodimension(q.doc, q.view.id, w, q.sheet, {});
      assert(r.n === 9 && r.h && r.v, 'nine ordinates ' + JSON.stringify(r));
      q.compute();
      var dims = q.sheet.dims.filter(function (d) { return d.view === q.view.id; });
      assert(dims.length === 2 && dims.every(function (d) { return d.kind === 'ordinate'; }), 'two ordinate sets: ' + dims.map(function (d) { return d.kind; }));
      var H = dims.filter(function (d) { return d.dir !== 'v'; })[0], V = dims.filter(function (d) { return d.dir === 'v'; })[0];
      var rec = q.doc.views.filter(function (v) { return v.id === q.view.id; })[0].dims, hr = rec.filter(function (d) { return d.dir !== 'v'; })[0], vr = rec.filter(function (d) { return d.dir === 'v'; })[0];
      var hv = [0].concat(hr.values.map(function (x) { return Math.round(Math.abs(x) * 1e6) / 1e6; })), vv = [0].concat(vr.values.map(function (x) { return Math.round(Math.abs(x) * 1e6) / 1e6; }));
      assert(JSON.stringify(hv) === JSON.stringify([0, 0.75, 1.5, 3, 4.5, 6]), 'across ' + JSON.stringify(hv));
      assert(JSON.stringify(vv) === JSON.stringify([0, 1, 2, 3, 4]), 'up ' + JSON.stringify(vv));
      assert(H.text === '0, .750, 1.500, 3.000, 4.500, 6.000' && V.text === '0, 1.000, 2.000, 3.000, 4.000', 'texts ' + H.text + ' | ' + V.text);
      // the bend lines are bend references, the base is the blank's left edge
      assert(hr.refs.filter(function (x) { return x.bend != null; }).length === 2 && hr.base.bend == null, 'two bend refs');
      assert(!hr.dangling && !vr.dangling, 'attached');
      // none overlap each other; none on the title block, another view, a table or off the sheet
      var tx = q.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'DIMENSIONS'; }).map(function (p) { return DW.textRect(p); });
      var own = tx.filter(function (t) { return meet(t, { x0: w.box.x0 - 2, y0: w.box.y0 - 2, x1: w.box.x1 + 2, y1: w.box.y1 + 2 }); });
      assert(own.length >= 11, 'eleven ordinate texts near the flat: ' + own.length);
      for (var i = 0; i < own.length; i++) for (var j = i + 1; j < own.length; j++) assert(!meet(own[i], own[j]), 'texts overlap ' + i + ' ' + j);
      var tbs = DW.tbRects(q.sheet.size, 'in'), S = q.sheet.size;
      own.forEach(function (t) {
        assert(!tbs.some(function (r2) { return meet(t, r2); }), 'on the title block');
        assert(!q.sheet.views.some(function (o) { return o !== w && meet(t, o.box); }), 'on another view ' + JSON.stringify({ t: t, r: r, flat: w.box }));
        assert(t.x0 > 0 && t.y0 > 0 && t.x1 < S[0] && t.y1 < S[1], 'on the sheet');
        assert(!meet(t, w.box), 'not on the blank itself');
      });
    });

    test('rfJM: ordinates follow a moved bend; Selected entities; chain; Bend Table / Hole Table keep the dimensions clear', function () {
      var q = rfJMSheet({ bendNotes: 'table' }), w = q.w;
      DW.flatAutodimension(q.doc, q.view.id, w, q.sheet, {});
      q.compute();
      var tb = q.sheet.annotations.filter(function (a) { return a.type === 'bendTable'; })[0];
      assert(tb, 'bend table');
      var tx = q.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'DIMENSIONS' && p.dimIx != null && q.sheet.dims[p.dimIx] && q.sheet.dims[p.dimIx].view === q.view.id; }).map(function (p) { return DW.textRect(p); });
      assert(tx.length >= 11, 'the flat ordinate texts: ' + tx.length);
      assert(!tx.some(function (t) { return meet(t, tb.box); }), 'no dimension text on the Bend Table ' + JSON.stringify({ tb: tb.box, w: w.box, hit: tx.filter(function (t) { return meet(t, tb.box); }) }));
      // the part changes: the second bend moves to x 4.25; the ordinate follows it (a bend reference, not an edge)
      var moved = build(BLANK.replace('line(4.5, 0, 4.5, -4)', 'line(4.25, 0, 4.25, -4)'));
      noErrors(moved);
      var s2 = DW.compute(q.doc, moved.mesh, moved.model, { build: moved.build });
      var hr = q.doc.views.filter(function (v) { return v.id === q.view.id; })[0].dims.filter(function (d) { return d.dir !== 'v'; })[0];
      var hv = hr.values.map(function (x) { return Math.round(Math.abs(x) * 1e6) / 1e6; });
      assert(!hr.dangling && hv.indexOf(4.25) >= 0 && hv.indexOf(4.5) < 0, 'moved bend: ' + JSON.stringify(hv));
      assert(s2.dims.length >= 2, 'drawn');
      // Selected: only the Ø.281 at the left and the first bend
      var q2 = rfJMSheet(), w2 = q2.w, b = w2.flat.bbox;
      var hole = w2.proj.circles.visible.filter(function (c) { return Math.abs(c.c[0] - b.umin - 0.75) < 1e-6; })[0], bend = w2.flat.bends.filter(function (x) { return Math.abs(x.a[0] - b.umin - 1.5) < 1e-6; })[0];
      var r2 = DW.flatAutodimension(q2.doc, q2.view.id, w2, q2.sheet, { select: [{ c: hole.c, r: hole.r }, { a: bend.a, b: bend.b }], v: false });
      assert(r2.n === 2, 'two selected: ' + JSON.stringify(r2));
      q2.compute();
      var hr2 = q2.doc.views.filter(function (v) { return v.id === q2.view.id; })[0].dims[0];
      assert(JSON.stringify(hr2.values.map(function (x) { return Math.round(Math.abs(x) * 1e6) / 1e6; })) === '[0.75,1.5]', 'selected values ' + JSON.stringify(hr2.values));
      // chain across: .750 .750 1.500 1.500 1.500 (hole, bend, holes, bend, edge)
      var q3 = rfJMSheet(), r3 = DW.flatAutodimension(q3.doc, q3.view.id, q3.w, q3.sheet, { hScheme: 'chain', v: false });
      q3.compute();
      var ch = q3.sheet.dims.filter(function (d) { return d.view === q3.view.id; }).map(function (d) { return d.text; });
      assert(r3.n === 5 && JSON.stringify(ch) === JSON.stringify(['.750', '.750', '1.500', '1.500', '1.500']), 'chain ' + r3.n + ' ' + JSON.stringify(ch));
      // bends off: no bend stations
      var q4 = rfJMSheet(), r4 = DW.flatAutodimension(q4.doc, q4.view.id, q4.w, q4.sheet, { bends: false, v: false });
      assert(r4.n === 3, 'no bends: ' + r4.n);
      // a model view is refused
      var front = q4.sheet.views.filter(function (x) { return x.view.kind !== 'flat'; })[0], msg = null;
      if (front) { try { DW.flatAutodimension(q4.doc, front.view.id, front, q4.sheet, {}); } catch (e) { msg = e.message; } assert(msg && /not a flat pattern view/.test(msg), 'refused: ' + msg); }
    });

    test('rfJM: a side that would run onto the title block or a table swaps to the other side', function () {
      // flat placed right above the title block: Below is asked, Above is used
      var q = rfJMSheet({ scale: '1:2' }, null, false), w = q.w, tbs = DW.tbRects(q.sheet.size, 'in'), tbr = tbs[0];
      q.view.x = tbr.x0 + (tbr.x1 - tbr.x0) / 2; q.view.y = tbr.y1 + (w.box.y1 - w.box.y0) / 2 + 0.3;
      q.compute();
      var r = DW.flatAutodimension(q.doc, q.view.id, q.w, q.sheet, { hPlace: 'below', vPlace: 'right' });
      assert(r.h === 'above', 'below would hit the title block: ' + JSON.stringify(r));
      var r2 = DW.flatAutodimension(q.doc, q.view.id, q.w, q.sheet, { hPlace: 'below', keepPlace: true, v: false });
      assert(r2.h === 'below', 'keepPlace keeps it');
    });

    test('rfJM: Merge faces off draws the bend region lines as thin tangent edges (SVG / DXF / PDF); on: none', function () {
      var off = rfJMSheet({ scale: '1:2' }, 'p.flatPattern({ mergeFaces: false });\n');
      var rl = off.w.flat.regionLines;
      assert(rl && rl.length === 4, 'two lines per bend: ' + JSON.stringify(rl));
      var BA = rl.map(function (l) { return l.a[0]; }).sort(function (a, b) { return a - b; });
      near(BA[1] - BA[0], BA[3] - BA[2], 1e-9);
      near((BA[0] + BA[1]) / 2, off.w.flat.bbox.umin + 1.5, 1e-6);
      var lines = off.sheet.prims.filter(function (p) { return p.regionLine != null; });
      assert(lines.length === 4 && lines.every(function (p) { return p.style === 'tangent' && p.layer === off.w.layer && p.view === off.view.id; }), 'tangent lines on the view layer: ' + JSON.stringify(lines.map(function (p) { return [p.style, p.layer]; })));
      // in the view's paper place: each the bend's own sheet length
      lines.forEach(function (p) { near(Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]), 4 * off.w.scale, 1e-6); });
      var svgN = (DW.toSVG(off.sheet).match(/<line|<path/g) || []).length, dxf = DW.toDXF(off.sheet);
      var on = rfJMSheet({ scale: '1:2' });
      assert(!on.w.flat.regionLines || !on.w.flat.regionLines.length, 'merge faces on: no region lines');
      assert(!on.sheet.prims.some(function (p) { return p.regionLine != null; }), 'none drawn');
      var cnt = function (s) { return (s.match(/\nLINE\r?\n/g) || []).length; };
      assert(cnt(dxf.replace(/\r/g, '')) === cnt(DW.toDXF(on.sheet).replace(/\r/g, '')) + 4, 'four more DXF lines');
      assert(svgN > 0 && DW.toPDF(off.sheet), 'SVG / PDF');
      // the flat turned by its grain direction (Flat-Pattern1 ▸ Grain direction along Z): bend lines and region lines
      // turn together, the region lines still beside their bend lines
      var turned = rfJMSheet({ scale: '1:2' }, 'p.flatPattern({ mergeFaces: false, grain: { at: [3, ' + T + ', 2], dir: [0, 0, 1] } });\n');
      var l2 = turned.sheet.prims.filter(function (p) { return p.regionLine != null; }), bl = turned.sheet.prims.filter(function (p) { return p.bend != null && p.k === 'line'; });
      assert(l2.length === 4 && bl.length === 2, 'drawn ' + l2.length + ' ' + bl.length);
      var dirOf = function (p) { var d = [p.b[0] - p.a[0], p.b[1] - p.a[1]], L = Math.hypot(d[0], d[1]); return [d[0] / L, d[1] / L]; };
      var bd = dirOf(bl[0]), turnedOK = Math.abs(bd[0]) > 0.999;
      assert(turnedOK, 'the grain turned the bends horizontal: ' + JSON.stringify(bd));
      l2.forEach(function (p) { var d = dirOf(p); assert(Math.abs(d[0] * bd[1] - d[1] * bd[0]) < 1e-9, 'parallel to the bends'); });
    });
  })();
