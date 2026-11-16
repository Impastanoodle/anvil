  // --- rfMV (2026-11-15, lane MV: shop drawings, audit round 2, test-reports/2026-11-15-shop-drawing-audit-2.md) ---
  // A hole seen end-on is one true circle (a hole through a bend, a cross-drilled tube: their intersection curves lie on
  // the hole's cylinder, drawn as its exact arcs; DXF CIRCLE / ARC; Hole Callout and centre mark read it as a hole), and
  // five shop drawings made as Make Drawing from Part makes them (tray, bracket with UP / DOWN bends, a slot across a
  // bend and a hem, perforated panel, hat channel with a jog, square-to-round Lofted-Bend) checked line by line, then the
  // model changed and the drawing read again.
  (function () {
    group('rfMV: end-on holes as true circles; five shop drawings audited (tray, bracket, perforated panel, hat channel, square-to-round)');
    var DW = Drawing, T16 = 0.0598, T14 = 0.0747, T18 = 0.0478;
    var rfMVChannel = 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[4, 0.06, 1.5]]);\np.flange(1, [[0, 0.06, 1.5]]);\n' +
      'p.sketch("Top").circle(4.02, -1.5, 0.1).cut("through", { both: true });';
    // (both walls: a midplane cut; "through" with both: true drills one wall, reported to the kernel lane)
    var rfMVTube = 'p.units("in");\np.sketch("Front").circle(0, 0, 1).circle(0, 0, 0.8).extrude(4);\np.sketch("Top").circle(0, -2, 0.25).cut(3, { midplane: true });';
    function rfMVDrawing(code) {
      var r = build(code); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-15', projection: 'third' });
      DW.standard3View(doc, r.mesh, 'in');
      r.doc = doc; r.sheet = DW.compute(doc, r.mesh, r.model, { build: r.build });
      return r;
    }
    function rfMVW(r, orient) { return r.sheet.views.filter(function (w) { return w.view.orient === orient; })[0]; }
    // DXF entities per type on one layer (group-code pairs)
    function rfMVCount(dxf, layer) {
      var L = dxf.replace(/\r/g, '').split('\n'), out = {}, cur = null, inE = false;
      function done() { if (cur && cur.layer === layer) out[cur.type] = (out[cur.type] || 0) + 1; }
      for (var i = 0; i + 1 < L.length; i += 2) {
        var c = L[i].trim(), v = L[i + 1].trim();
        if (c === '2' && v === 'ENTITIES') inE = true;
        if (!inE) continue;
        if (c === '0') { done(); cur = v === 'ENDSEC' ? null : { type: v, layer: null }; if (v === 'ENDSEC') break; }
        else if (cur && c === '8' && cur.layer == null) cur.layer = v;
      }
      return out;
    }
    // the view's prims within d of circle (c, r) (paper), by kind
    function rfMVOnCircle(r, w, c, rad) {
      var C = w.toSheet(c), R = rad * w.scale, out = {}, tol = 1e-6 + R * 1e-4;
      function on(p) { return Math.abs(Math.hypot(p[0] - C[0], p[1] - C[1]) - R) <= tol; }
      r.sheet.prims.forEach(function (p) {
        if (p.layer !== w.layer) return;
        var hit = p.k === 'line' ? on(p.a) && on(p.b) : (p.k === 'circle' || p.k === 'arc') ? Math.hypot(p.c[0] - C[0], p.c[1] - C[1]) < tol && Math.abs(p.r - R) < tol : false;
        if (hit) { var key = p.k + (p.bz ? '-bz' : '') + ':' + p.style; out[key] = (out[key] || 0) + 1; }
      });
      return out;
    }
    function rfMVCallout(r, w, c, rad) {
      var doc = r.doc, n0 = (w.view.annotations || []).length;
      DW.addHoleCallout(doc, w.view.id, { c: c, r: rad, lead: [0.6, 0.6] });
      DW.addCenterMark(doc, w.view.id, { holes: [{ c: c, r: rad }] });
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), anns = (sh.annotations || []).filter(function (a) { return a.view === w.view.id; });
      return { texts: sh.prims.filter(function (p) { return p.k === 'text' && p.layer === 'ANNOTATIONS'; }).map(function (p) { return p.text; }), anns: anns.slice(n0), sheet: sh };
    }
    test('rfMV: U channel, Ø.2 hole through a bend seen along its axis (Top): one true CIRCLE in the view and the DXF (R2000 and R12), no SPLINE / Bézier there, Hole Callout Ø.200 THRU ALL, centre mark', function () {
      var r = rfMVDrawing(rfMVChannel), w = rfMVW(r, 'Top');
      var on = rfMVOnCircle(r, w, [4.02, -1.5], 0.1);
      assert(on['circle:visible'] === 1 && Object.keys(on).length === 1, 'the hole in Top is one visible circle: ' + JSON.stringify(on));
      assert(!r.sheet.prims.some(function (p) { return p.layer === w.layer && p.bz; }), 'no smooth (Bézier) pieces in Top');
      var c2 = rfMVCount(DW.toDXF(r.sheet, { version: 'R2000' }), 'TOP'), c12 = rfMVCount(DW.toDXF(r.sheet), 'TOP');
      assert(c2.CIRCLE === 1 && !c2.SPLINE && !c2.ARC, 'R2000 TOP layer: ' + JSON.stringify(c2));
      assert(c12.CIRCLE === 1 && !c12.POLYLINE, 'R12 TOP layer: ' + JSON.stringify(c12));
      // the other views keep their smooth curves (the hole wall across the bend seen from the side)
      var right = rfMVW(r, 'Right');
      assert(r.sheet.prims.some(function (p) { return p.layer === right.layer && p.bz; }), 'Right still smooth');
      var co = rfMVCallout(r, w, [4.02, -1.5], 0.1);
      assert(co.texts.indexOf('Ø.200 THRU ALL') >= 0, 'Hole Callout ' + JSON.stringify(co.texts));
      assert(co.sheet.prims.filter(function (p) { return p.layer === 'ANNOTATIONS' && p.k === 'line'; }).length >= 6, 'centre mark lines');
      return 'TOP R2000 ' + JSON.stringify(c2) + ', R12 ' + JSON.stringify(c12) + '; ' + co.texts.join(' | ');
    });
    test('rfMV: cross-drilled tube (Ø.5 through both walls), three standard views: Top one circle (the far wall\'s curves under it dropped), Front / Right their lines and smooth saddles; DXF counts per view (R2000, R12); Hole Callout Ø.500 THRU and an auto centre mark on the end-on hole', function () {
      var r = rfMVDrawing(rfMVTube), top = rfMVW(r, 'Top');
      var on = rfMVOnCircle(r, top, [0, -2], 0.25);
      assert(on['circle:visible'] === 1 && Object.keys(on).length === 1, 'Top: one visible circle, nothing hidden drawn on it: ' + JSON.stringify(on));
      var d2 = DW.toDXF(r.sheet, { version: 'R2000' }), d12 = DW.toDXF(r.sheet), per = {};
      ['FRONT', 'TOP', 'RIGHT'].forEach(function (L) { per[L] = [rfMVCount(d2, L), rfMVCount(d12, L)]; });
      var t2 = per.TOP[0], t12 = per.TOP[1];
      assert(t2.CIRCLE === 1 && !t2.SPLINE && !t2.ARC && !t2.ELLIPSE, 'R2000 TOP: the hole one CIRCLE, the rest LINEs ' + JSON.stringify(t2));
      assert(t12.CIRCLE === 1 && !t12.POLYLINE && t12.LINE === t2.LINE, 'R12 TOP ' + JSON.stringify(t12));
      assert(per.RIGHT[0].SPLINE >= 2 && per.RIGHT[1].POLYLINE >= 2, 'Right: the saddles as SPLINE / POLYLINE ' + JSON.stringify(per.RIGHT));
      assert(per.FRONT[0].CIRCLE === 2 && !per.FRONT[0].SPLINE, 'Front: the tube\'s two circles, the hole hidden as lines ' + JSON.stringify(per.FRONT));
      var a2 = DxfCheck.audit(d2, { units: 'in' }).errors.filter(function (e) { return !/duplicate DIMENSION/.test(e); });
      assert(!a2.length, 'R2000 audit ' + a2.join(' | '));
      var co = rfMVCallout(r, top, [0, -2], 0.25);
      assert(co.texts.indexOf('Ø.500 THRU') >= 0, 'Hole Callout ' + JSON.stringify(co.texts));
      // Auto insert centre marks finds the end-on hole too
      var doc2 = DW.newDrawing(r.model, {}); DW.standard3View(doc2, r.mesh, 'in');
      var tv = doc2.views.filter(function (v) { return v.orient === 'Top'; })[0];
      var n = DW.autoCenterMarks(doc2, r.mesh, tv.id);
      assert(n === 1 && Math.hypot(tv.annotations[0].holes[0].c[0], tv.annotations[0].holes[0].c[1] + 2) < 1e-9, 'one auto centre mark at the hole: ' + n);
      return 'R2000 ' + JSON.stringify(per) + '; ' + co.texts.join(' | ');
    });
    test('rfMV: a hole through a plain plate (no curve crossing) is drawn as before: circle, no extra arcs', function () {
      var r = rfMVDrawing('p.units("in");\np.box(4, 2, 0.25);\np.hole("Top", 1, -1, 0.25, { offset: 2 });'), w = rfMVW(r, 'Top');
      assert(!w.proj.arcs.visible.some(function (a) { return a.endOn; }) && w.proj.circles.visible.length === 1, 'plain');
    });

    // ------------------------------------------------------------------ the five shop drawings
    var rfMVParts = {
      tray: 'p.name("Tray").units("in");\np.material("Plain Carbon Steel");\np.sheet(' + T16 + ', 0.06, 0.44, { relief: "rect" });\n' +
        'p.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\n' +
        'p.flange(1.5, [[5, ' + T16 + ', 0], [5, ' + T16 + ', 6], [0, ' + T16 + ', 3], [10, ' + T16 + ', 3]], { position: "inside", lengthRef: "outer" });\n' +
        'p.cornerRelief([[0.1198, ' + T16 + ', 0.1198], [9.8802, ' + T16 + ', 5.8802], [0.1198, ' + T16 + ', 5.8802], [9.8802, ' + T16 + ', 0.1198]], null, { reliefType: "circular" });\n' +
        'p.sketch("Top", ' + T16 + ').circle(3, -2, 0.1285).end().cut("through", { reverse: true });\n' +
        'p.linearPattern({ dir: "x", spacing: 2, count: 3, dir2: "z", spacing2: 2, count2: 2 });\n',
      bracket: 'p.name("Bracket").units("in");\np.material("Plain Carbon Steel");\np.sheet(' + T14 + ', 0.075, 0.44);\n' +
        'p.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
        'p.flange(2, [[4, ' + T14 + ', 1.5]], { position: "inside", lengthRef: "outer" });\n' +
        'p.flange(1.5, [[0, ' + T14 + ', 1.5]], { position: "inside", lengthRef: "outer", reverse: true });\n' +
        'p.sketch("Top", ' + T14 + ').slot(3.6, -1.5, 4.3, -1.5, 0.375).end().cut("through", { reverse: true });\n' +
        'p.hem(0.5, [[4, 2, 1.5]], { gap: ' + T14 + ' });\n',
      panel: 'p.name("Perf Panel").units("in");\np.material("Plain Carbon Steel");\np.sheet(' + T18 + ', ' + T18 + ', 0.5);\n' +
        'p.sketch("Top").rect(0, 0, 24, 30).end().baseFlange();\n' +
        'p.flange(0.75, [[0, ' + T18 + ', -15], [24, ' + T18 + ', -15]], { position: "inside", lengthRef: "outer" });\n' +
        'p.sketch("Top", ' + T18 + ').circle(1.5, 1.5, 0.094).end().cut("through", { reverse: true });\n' +
        'p.linearPattern({ dir: "x", spacing: 0.75, count: 30, dir2: "z", spacing2: 1.4, count2: 20, reverse2: true });\n',
      hat: 'p.name("Hat Channel").units("in");\np.material("Plain Carbon Steel");\np.sheet(' + T16 + ', 0.06, 0.44);\n' +
        'p.sketch("Top").rect(0, -12, 2, 12).end().baseFlange();\n' +
        'p.flange(1.5, [[0, ' + T16 + ', 6], [2, ' + T16 + ', 6]], { position: "inside", lengthRef: "outer" });\n' +
        'p.flange(0.75, [[-' + T16 + ' / 2, 1.5, 6], [2 + ' + T16 + ' / 2, 1.5, 6]], { position: "inside", lengthRef: "outer" });\n' +
        'p.jog(0.25, 0.5, [[-0.6902, 1.5 - ' + T16 + ' / 2, 6]]);\n',
      loft: 'p.name("Transition").units("in");\np.material("Plain Carbon Steel");\np.sheet(' + T16 + ', ' + T16 + ', 0.5);\n' +
        'var a = p.sketch("Top").polyline([[0, -2], [2, -2], [2, 2], [-2, 2], [-2, -2], [-0.001, -2]], false).id();\n' +
        'var b = p.sketch("Top", 3).arc(0, 0, 1, 270.03, 360).arc(0, 0, 1, 0, 90).arc(0, 0, 1, 90, 180).arc(0, 0, 1, 180, 270).id();\n' +
        'p.loftedBend([a, b]);\n'
    };
    function rfMVBox(p) {
      if (p.k === 'text') return DW.textRect(p);
      return null;
    }
    function rfMVMeet(a, b) { return a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.y0 < b.y1 - 1e-9 && b.y0 < a.y1 - 1e-9; }
    // what sits where it should not: annotations / tables / dimension texts / notes in the title or tolerance block,
    // across another view, off the sheet, or on each other (a dimension's own texts and lines are one item)
    function rfMVClashes(sh) {
      var S = sh.size, tbs = DW.tbRects(S, 'in'), b1 = 10 / 25.4, items = [], bad = [];
      (sh.annotations || []).forEach(function (a) { if (a.box && !a.hidden && isFinite(a.box.x0)) items.push({ n: a.type, b: a.box, view: a.view }); });
      (sh.holeTables || []).forEach(function (t) { if (t.box) items.push({ n: t.punch ? 'Punch Table' : 'Hole Table', b: t.box }); });
      sh.dims.forEach(function (d, i) { sh.prims.forEach(function (p) { if (p.dimIx === i && p.k === 'text') items.push({ n: 'dim ' + p.text, b: rfMVBox(p), view: d.view, dim: i }); }); });
      (sh.notes || []).forEach(function (n, i) { if (n && n.box && n.box.x1 > n.box.x0) items.push({ n: 'note ' + i, b: n.box }); });
      items.forEach(function (it, i) {
        tbs.forEach(function (t) { if (rfMVMeet(it.b, t)) bad.push(it.n + ' in a block'); });
        sh.views.forEach(function (w) { if (w.view.id !== it.view && rfMVMeet(it.b, w.box)) bad.push(it.n + ' across ' + w.view.name); });
        if (it.b.x0 < b1 || it.b.y0 < b1 || it.b.x1 > S[0] - b1 || it.b.y1 > S[1] - b1) bad.push(it.n + ' off the sheet');
        items.slice(i + 1).forEach(function (o) { if (rfMVMeet(it.b, o.b) && !(it.dim != null && it.dim === o.dim)) bad.push(it.n + ' over ' + o.n); });
      });
      sh.views.forEach(function (w, i) {
        tbs.forEach(function (t) { if (rfMVMeet(w.box, t)) bad.push(w.view.name + ' in a block'); });
        sh.views.slice(i + 1).forEach(function (o) { if (rfMVMeet(w.box, o.box)) bad.push(w.view.name + ' over ' + o.view.name); });
      });
      return bad.filter(function (x, i, a) { return a.indexOf(x) === i; });
    }
    // every edge once: a model line / circle / arc drawn twice on one layer (visible or hidden, either way round)
    function rfMVDupes(sh) {
      var seen = {}, out = [], R = function (x) { return Math.round(x * 1e4); };
      sh.prims.forEach(function (p) {
        if (!/^(visible|hidden|bendup|benddown)$/.test(p.style)) return;
        var k;
        if (p.k === 'line') { var a = [R(p.a[0]), R(p.a[1])], b = [R(p.b[0]), R(p.b[1])]; if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) { var t = a; a = b; b = t; } k = 'L' + a + ',' + b; }
        else if (p.k === 'circle') k = 'C' + R(p.c[0]) + ',' + R(p.c[1]) + ',' + R(p.r);
        else if (p.k === 'arc') k = 'A' + R(p.c[0]) + ',' + R(p.c[1]) + ',' + R(p.r) + ',' + Math.round(p.a0) + ',' + Math.round(p.a1);
        else return;
        k = p.layer + '|' + k;
        if (seen[k]) out.push(k); else seen[k] = 1;
      });
      return out;
    }
    // Make Drawing from Part, then on the flat's sheet: bend notes read, Autodimension, Hole Table (a vertex origin),
    // centre marks, Bend Table, a general note, FLAT SIZE; the exports; then edit(model) and the drawing read again
    function rfMVShop(name, opts) {
      opts = opts || {};
      var r = build(rfMVParts[name]); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-15', projection: 'third' }), out = { r: r, doc: doc, log: [] };
      doc.options = Object.assign(doc.options || {}, { flatSizeNote: true });
      DW.partViews(doc, r.mesh, 'in', { model: r.model, build: r.build });
      out.layout1 = doc.layout;
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      out.clash1 = rfMVClashes(sh); out.dupes1 = rfMVDupes(sh); out.dims1 = sh.dims.map(function (d) { return d.text; });
      var fs = 0;
      (doc.sheets || []).forEach(function (s, i) { if (s && (s.views || []).some(function (v) { return v.kind === 'flat'; })) fs = i; });
      out.flatSheet = fs;
      out.orients = doc.views.map(function (v) { return v.kind === 'flat' ? 'Flat' : v.orient; }).concat(fs ? ['Flat'] : []);
      DW.activateSheet(doc, fs);
      var fv = doc.views.filter(function (v) { return v.kind === 'flat'; })[0];
      sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      var w = sh.views.filter(function (x) { return x.view.id === fv.id; })[0];
      out.notes = sh.prims.filter(function (p) { return p.k === 'text' && p.layer === 'BEND_NOTES'; }).map(function (p) { return p.text; });
      out.bends = w.flat.bends.length;
      out.autodim = DW.flatAutodimension(doc, fv.id, w, sh, {});
      sh = DW.compute(doc, r.mesh, r.model, { build: r.build }); w = sh.views.filter(function (x) { return x.view.id === fv.id; })[0];
      if (w.proj.circles.visible.length) {
        var vx = null, bb = w.flat.bbox;
        w.proj.lines.visible.forEach(function (l) { [[l[0], l[1]], [l[2], l[3]]].forEach(function (q) { var s = q[0] - bb.umin + q[1] - bb.vmin; if (!vx || s < vx.s) vx = { s: s, p: q }; }); });
        DW.addHoleTable(doc, fv.id, { all: true, origin: { p: vx.p } }, w);
      }
      out.marks = DW.autoCenterMarks(doc, r.mesh, fv.id);
      fv.bendNotes = 'table';
      DW.addNote(doc, { p: [1.0, 2.6], text: 'NOTES:\n1. BREAK ALL SHARP EDGES.\n2. DIMENSIONS APPLY AFTER FORMING.' });
      sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      out.sheet = sh;
      out.clash2 = rfMVClashes(sh); out.dupes2 = rfMVDupes(sh);
      out.table = (sh.annotations.filter(function (a) { return a.type === 'bendTable'; })[0] || {}).info;
      out.holeRows = sh.holeTables[0] ? sh.holeTables[0].rows : [];
      out.flatSize = sh.prims.filter(function (p) { return p.k === 'text' && /^FLAT SIZE/.test(p.text); }).map(function (p) { return p.text; })[0];
      out.tb = DW.titleBlock(doc, r.model, { build: r.build });
      var pdf = DW.toPDF(sh);
      out.pdf = { pages: (pdf.match(/\/Type\s*\/Page\b/g) || []).length, box: (pdf.match(/\/MediaBox\s*\[([^\]]*)\]/) || [])[1] };
      out.dxf2 = DW.toDXF(sh, { version: 'R2000', hatch: true }); out.dxf12 = DW.toDXF(sh);
      out.audit = DxfCheck.audit(out.dxf2, { units: 'in' }).errors.concat(DxfCheck.audit(out.dxf12, { units: 'in' }).errors);
      var dwg = DWG.fromDXF(out.dxf2);
      out.dwg = String.fromCharCode.apply(null, Array.prototype.slice.call(new Uint8Array(dwg.buffer || dwg, dwg.byteOffset || 0, 6)));
      var flat = K.flatPattern(r.model, r.build, r.mesh);
      out.laser = ['R12', 'R2000'].map(function (v) {
        var t = K.exportDXFFlat(flat, 'in', { version: v }), c = DxfCheck.check(t, { units: 'in' });
        return { ok: c.ok, errors: c.errors.concat(DxfCheck.audit(t, { units: 'in' }).errors), counts: c.counts };
      });
      out.flat = flat;
      // the model edit (a flange longer, a hole / slot bigger), rebuild, the same drawing computed again
      if (opts.edit) {
        opts.edit(r.model);
        var b2 = K.rebuild(r.model); r.build = b2; r.mesh = K.meshFromBody(b2.body); r.errors = b2.errors; noErrors(r);
        var sh2 = DW.compute(doc, r.mesh, r.model, { build: r.build });
        out.edited = { sheet: sh2, dims: sh2.dims.map(function (d) { return d.text; }), dangling: sh2.dims.filter(function (d) { return d.dangling; }).length + (sh2.annotations || []).filter(function (a) { return a.dangling; }).length,
          clash: rfMVClashes(sh2), flatSize: sh2.prims.filter(function (p) { return p.k === 'text' && /^FLAT SIZE/.test(p.text); }).map(function (p) { return p.text; })[0],
          holeRows: sh2.holeTables[0] ? sh2.holeTables[0].rows : [], table: (sh2.annotations.filter(function (a) { return a.type === 'bendTable'; })[0] || {}).info,
          flat: K.flatPattern(r.model, r.build, r.mesh) };
        DW.activateSheet(doc, 0);
        out.edited.layout1 = doc.layout;
        if (doc.layout === 'auto') DW.layout(doc, r.mesh, 'in');   // (the app's render does this on an auto-layout sheet)
        var sh3 = DW.compute(doc, r.mesh, r.model, { build: r.build });
        out.edited.clash1 = rfMVClashes(sh3); out.edited.dims1 = sh3.dims.map(function (d) { return d.text; });
      }
      return out;
    }
    function rfMVCommon(o, label, skipClash) {
      var skip = skipClash || function () { return false; };
      var c1 = o.clash1.filter(function (x) { return !skip(x); }), c2 = o.clash2.filter(function (x) { return !skip(x); });
      assert(!c1.length, label + ' Sheet1: ' + c1.slice(0, 6).join('; '));
      assert(!c2.length, label + ' flat sheet: ' + c2.slice(0, 6).join('; '));
      assert(!o.dupes1.length && !o.dupes2.length, label + ': drawn twice ' + o.dupes1.concat(o.dupes2).slice(0, 4).join(' | '));
      assert(o.orients.join(',') === 'Front,Top,Right,Isometric,Flat', label + ': the three standard views, Isometric and the flat: ' + o.orients.join(','));
      assert(o.notes.length === o.bends && o.notes.every(function (t) { return /^(UP|DOWN) \d+(\.\d)?° R(\.\d{3}|0)$/.test(t); }), label + ': bend notes in shop format ' + JSON.stringify(o.notes));
      assert(o.table && o.table.rows.length === o.bends, label + ': Bend Table ' + (o.table && o.table.rows.length) + ' rows');
      var fw = o.flat.size;
      assert(o.flatSize === 'FLAT SIZE ' + DW.numText(fw[0], 'in', null) + ' × ' + DW.numText(fw[1], 'in', null), label + ': ' + o.flatSize + ' vs ' + fw.join(' x '));
      assert(o.tb.material === 'Plain Carbon Steel' && /^\.0\d{3}$/.test(o.tb.thickness) && / lb$/.test(o.tb.mass) && o.tb.size === 'B', label + ': title block ' + JSON.stringify(o.tb));
      assert(o.pdf.pages === 1 && o.pdf.box.replace(/\s+/g, ' ').trim() === '0 0 1224 792', label + ': PDF one ANSI B page ' + JSON.stringify(o.pdf));
      assert(!o.audit.length, label + ': drawing DXF audit ' + o.audit.slice(0, 3).join(' | '));
      assert(o.dwg === 'AC1015', label + ': DWG ' + o.dwg);
      o.laser.forEach(function (l) { assert(l.ok && !l.errors.length, label + ': laser DXF ' + l.errors.slice(0, 3).join(' | ')); });
      if (o.edited) {
        assert(!o.edited.dangling, label + ': nothing dangling after the edit');
        var ec = o.edited.clash.concat(o.edited.clash1).filter(function (x) { return !skip(x); });
        assert(!ec.length, label + ': after the edit ' + ec.slice(0, 5).join('; '));
        var ef = o.edited.flat.size;
        assert(o.edited.flatSize === 'FLAT SIZE ' + DW.numText(ef[0], 'in', null) + ' × ' + DW.numText(ef[1], 'in', null) && o.edited.flatSize !== o.flatSize, label + ': FLAT SIZE follows ' + o.flatSize + ' -> ' + o.edited.flatSize);
        assert(o.edited.layout1 === 'auto', label + ': Sheet1 keeps its auto layout (the flat went to Sheet2): ' + o.edited.layout1);
      }
    }
    test('rfMV: shop drawing a, 16 ga tray 10 x 6 x 1.5, four circular corner reliefs, 6 x Ø.257: Make Drawing from Part (views, flat on Sheet2), bend notes, Autodimension, Hole Table, centre marks, Bend Table, note, FLAT SIZE, title block, PDF / DXF / DWG / laser DXF; flange 2 in, holes Ø.287: everything follows', function () {
      var o = rfMVShop('tray', { edit: function (m) {
        m.features.filter(function (f) { return f.type === 'flange'; })[0].length = 2;
        m.features.forEach(function (f) { if (f.type === 'sketch') f.entities.forEach(function (e) { if (e.t === 'circle') e.r = 0.1435; }); });
      } });
      rfMVCommon(o, 'tray');
      assert(o.holeRows.length === 6 && o.holeRows.every(function (x) { return /^Ø\.257/.test(x.size); }), 'Hole Table 6 x Ø.257 ' + JSON.stringify(o.holeRows.map(function (x) { return x.size; })));
      assert(o.edited.holeRows.length === 6 && o.edited.holeRows.every(function (x) { return /^Ø\.287/.test(x.size); }), 'after: Ø.287 ' + JSON.stringify(o.edited.holeRows.map(function (x) { return x.size; })));
      assert(o.edited.dims1.indexOf('6X Ø.287') >= 0, 'the model item follows ' + o.edited.dims1.join(' | '));
      assert(o.laser[1].counts['CIRCLE@HOLES'] === 6 && o.laser[1].counts['LWPOLYLINE@OUTLINE'] === 1 && o.laser[1].counts['LINE@BEND'] === 4, 'laser ' + JSON.stringify(o.laser[1].counts));
      return o.flatSize + ' -> ' + o.edited.flatSize + '; marks ' + o.marks + '; autodim ' + o.autodim.n;
    });
    test('rfMV: shop drawing b, 14 ga bracket, flange UP 2 and DOWN 1.5, a slot across the UP bend, a hem: UP / DOWN / DOWN 180° notes, the Bend Table tag slides off the slot\'s centre mark; DOWN flange 2, slot .405: follows', function () {
      var o = rfMVShop('bracket', { edit: function (m) {
        m.features.filter(function (f) { return f.type === 'flange'; })[1].length = 2;
        m.features.forEach(function (f) { if (f.type === 'sketch') f.entities.forEach(function (e) { if (e.t === 'slot') e.w = 0.405; }); });
      } });
      rfMVCommon(o, 'bracket');
      var dirs = o.notes.map(function (t) { return t.split(' ')[0]; }).sort().join(',');
      assert(dirs === 'DOWN,DOWN,UP' && o.notes.some(function (t) { return /^DOWN 180°/.test(t); }), 'UP, DOWN and the hem: ' + o.notes.join(' | '));
      assert(o.laser[1].counts['LWPOLYLINE@HOLES'] === 1, 'the slot cut in the blank ' + JSON.stringify(o.laser[1].counts));
      var tags = o.sheet.annotations.filter(function (a) { return a.type === 'bendTag'; }), cm = o.sheet.annotations.filter(function (a) { return a.type === 'centerMark'; });
      assert(cm.length >= 1 && tags.length === 3, cm.length + ' centre marks, ' + tags.length + ' tags');
      return o.notes.join(' | ') + '; ' + o.flatSize + ' -> ' + o.edited.flatSize;
    });
    test('rfMV: shop drawing c, 18 ga perforated panel 24 x 30, two flanges, 600 x Ø.188: the flat goes to Sheet2 clear of the model dimensions, 600X callout, a 600-row Hole Table says it does not fit, DXF extents hold it; flange 1, holes Ø.218: follows', function () {
      var o = rfMVShop('panel', { edit: function (m) {
        m.features.filter(function (f) { return f.type === 'flange'; })[0].length = 1;
        m.features.forEach(function (f) { if (f.type === 'sketch') f.entities.forEach(function (e) { if (e.t === 'circle') e.r = 0.109; }); });
      } });
      // (at the flat's scale 600 centre marks overlap each other, the tags and the Fixed Face note; the 600-row table
      // runs off the sheet: both are what the drawing asked for, the table with a warning)
      var known = function (x) { return /centerMark|Hole Table/.test(x); };
      rfMVCommon(o, 'panel', known);
      assert(o.flatSheet === 1, 'the flat on Sheet2 (it covered the Top view\'s 30.000 on Sheet1)');
      assert(o.dims1.indexOf('600X Ø.188') >= 0, 'the hole pattern as one callout ' + o.dims1.join(' | '));
      assert(o.holeRows.length === 600 && (o.sheet.warnings || []).some(function (t) { return /Hole Table .*600 rows do not fit/.test(t); }), 'warning ' + JSON.stringify(o.sheet.warnings));
      var ext = o.dxf2.match(/\$EXTMIN\r?\n\s*10\r?\n([^\r\n]+)\r?\n\s*20\r?\n([^\r\n]+)/);
      assert(ext && +ext[2] < -10, 'EXTMIN below the sheet where the table runs: ' + (ext && ext.slice(1).join(',')));
      assert(o.laser[1].counts['CIRCLE@HOLES'] === 600, 'laser 600 holes');
      assert(o.edited.dims1.indexOf('600X Ø.218') >= 0, 'callout follows ' + o.edited.dims1.join(' | '));
      return o.flatSize + ' -> ' + o.edited.flatSize;
    });
    test('rfMV: shop drawing d, 16 ga hat channel with a jog in one lip: six bends UP / DOWN, the Fixed Face note clear of the tags on the narrow floor; jog .75: follows', function () {
      var o = rfMVShop('hat', { edit: function (m) { m.features.filter(function (f) { return f.type === 'jog'; })[0].length = 0.75; } });
      rfMVCommon(o, 'hat');
      assert(o.bends === 6 && o.notes.filter(function (t) { return /^UP/.test(t); }).length === 3, 'six bends, three UP ' + o.notes.join(' | '));
      return o.flatSize + ' -> ' + o.edited.flatSize;
    });
    test('rfMV: shop drawing e, square-to-round Lofted-Bend 4 x 4 to Ø2: 20 facet bends, every hidden line once (inner and outer rims behind each other), the 20 tags clear of each other', function () {
      var o = rfMVShop('loft');
      rfMVCommon(o, 'loft');
      assert(o.bends === 20, 'bends ' + o.bends);
      return o.flatSize + '; autodim ' + o.autodim.n + ' (no edge across either axis: left, see the report)';
    });
  })();
