  // --- rfCT (2026-10-20, lane CT: drawing dimension tools) --- Horizontal / Vertical Dimension (Smart Dimension held
  // to one direction: Drawing.smartDim's lock), Angular Running Dimension (one group record, values from the base
  // line) and Path Length Dimension (lines + arcs, the sketch's length rules), on inch plates; saved, reloaded, moved
  // with the model and written to SVG / DXF / PDF.
  (function () {
    group('rfCT: Horizontal / Vertical, Angular Running and Path Length drawing dimensions');
    var CT = typeof Drawing !== 'undefined' ? Drawing : null;
    var CT_PLATE = function (w) { return 'p.units("in"); p.sketch("Front").rect(0, 0, ' + (w || 4) + ', 2).circle(3, 1, 0.25).extrude(0.25);'; };
    var CT_FAN = 'p.units("in"); p.sketch("Front").polyline([[0, 0], [4, 0], [4, 2], [1, 1.7320508075688772]]).circle(2.1650635094610964, 1.25, 0.2).extrude(0.25);';
    var CT_SLOT = 'p.units("in"); p.sketch("Front").rect(0, 0, 4, 2).slot(1, 1, 3, 1, 0.5).extrude(0.25);';
    function ctDoc(code) {
      var r = build(code);
      noErrors(r);
      var doc = CT.newDrawing(r.model, { date: '2026-10-20', scale: [1, 1] });
      CT.standard3View(doc, r.mesh, 'in');
      r.doc = doc;
      r.sheet = function () { return CT.compute(doc, r.mesh, r.model); };
      r.front = doc.views.filter(function (v) { return v.role === 'front'; })[0];
      return r;
    }
    function ctUser(sh, id) { return sh.dims.filter(function (d) { return d.view === id && !d.auto; }); }

    test('rfCT: Horizontal Dimension between a vertex and the hole centre reads the X distance (3.000) even placed above-left; Vertical reads Y (1.000); Smart Dimension at the same spot is aligned (3.162)', function () {
      var r = ctDoc(CT_PLATE()), id = r.front.id, pt = { point: [0, 0] }, hole = { center: { c: [3, 1], r: 0.25 } };
      var h = CT.addSmartDim(r.doc, id, pt, hole, [-1, 3], { lock: 'h' }), v = CT.addSmartDim(r.doc, id, pt, hole, [-1, 3], { lock: 'v' });
      var s = CT.smartDim(pt, hole, [-1, 3], {});
      assert(h.kind === 'h' && h.lock === 'h', 'horizontal: ' + h.kind + ' / ' + h.lock);
      nearRel(h.value, 3, 1e-9, 'horizontal value');
      assert(v.kind === 'v' && v.lock === 'v', 'vertical: ' + v.kind);
      nearRel(v.value, 1, 1e-9, 'vertical value');
      assert(s.kind === 'aligned', 'Smart Dimension above-left: ' + s.kind);
      var texts = ctUser(r.sheet(), id).map(function (d) { return d.text; });
      assert(texts.join('|') === '3.000|1.000', 'sheet texts: ' + texts.join(' | '));
    });

    test('rfCT: locked picks — a circle alone reads its width across (.500), an edge its run (the 4 in bottom edge, vertical: refused), a vertical edge to a vertex horizontally', function () {
      var r = ctDoc(CT_PLATE()), id = r.front.id;
      var c = CT.addSmartDim(r.doc, id, { circle: { c: [3, 1], r: 0.25 } }, null, [3, 3], { lock: 'h' });
      assert(c && c.kind === 'h', 'circle: ' + (c && c.kind));
      nearRel(c.value, 0.5, 1e-9, 'circle width');
      var e = CT.smartDim({ edge: [[0, 0], [4, 0]] }, null, [-1, -1], { lock: 'h' });
      nearRel(e.value, 4, 1e-9, 'edge run');
      assert(CT.smartDim({ edge: [[0, 0], [4, 0]] }, null, [-1, -1], { lock: 'v' }) === null, 'a horizontal edge has no vertical size');
      var pe = CT.smartDim({ point: [0, 2] }, { edge: [[4, 0], [4, 2]] }, [2, 3], { lock: 'h' });
      assert(pe.kind === 'h', 'vertex to edge: ' + pe.kind);
      nearRel(pe.value, 4, 1e-9, 'vertex to edge');
    });

    test('rfCT: a Horizontal Dimension saves, reloads and follows the model (vertex to the right edge: 4.000, the plate made 5 in wide: 5.000) and is a linear DIMENSION in R2000 DXF, text in SVG and PDF', function () {
      var r = ctDoc(CT_PLATE()), id = r.front.id;
      CT.addSmartDim(r.doc, id, { point: [0, 0] }, { edge: [[4, 0], [4, 2]] }, [-0.5, 3], { lock: 'h' });
      var sh = r.sheet(), d0 = ctUser(sh, id)[0];
      assert(d0.text === '4.000', 'text ' + d0.text);
      var svg = CT.toSVG(sh), dxf = CT.toDXF(sh, { version: 'R2000' }), pdf = CT.toPDF(sh);
      assert(svg.indexOf('4.000') > 0, 'SVG text');
      assert(/\nDIMENSION\r?\n/.test(dxf) && dxf.indexOf('4.000') > 0, 'R2000 DIMENSION entity with its text');
      assert(pdf.indexOf('(4.000)') > 0, 'PDF text');
      // saved with the part, reloaded, then the part made wider
      var saved = JSON.parse(JSON.stringify(r.doc)), r2 = build(CT_PLATE(5));
      noErrors(r2);
      var sh2 = CT.compute(saved, r2.mesh, r2.model), d1 = ctUser(sh2, id)[0];
      assert(d1.kind === 'h' && d1.lock === 'h' && !d1.dangling, 'reloaded: ' + d1.kind + ' dangling ' + d1.dangling);
      nearRel(d1.value, 5, 1e-9, 'follows the model');
    });

    test('rfCT: Angular Running Dimension — base the bottom edge, then the hole at 30° and the edge at 60°: one record reading 0°, 30°, 60° round the corner vertex; R2000 / SVG / PDF carry the values', function () {
      var r = ctDoc(CT_FAN), id = r.front.id;
      var d = CT.addAngularRunning(r.doc, id, { base: { a: [0, 0], b: [4, 0] }, refs: [{ c: [2.1650635094610964, 1.25], r: 0.2 }, { a: [0, 0], b: [1, 1.7320508075688772] }] });
      assert(d.kind === 'angrun' && !d.cw, 'record ' + d.kind + ' cw ' + d.cw);
      near(d.c[0], 0, 1e-9, 'vertex x'); near(d.c[1], 0, 1e-9, 'vertex y');
      nearRel(d.values[0], 30, 1e-6, 'hole'); nearRel(d.values[1], 60, 1e-6, 'edge');
      var sh = r.sheet(), s = ctUser(sh, id)[0];
      assert(s.text === '0°, 30°, 60°', 'text ' + s.text);
      var tx = sh.prims.filter(function (p) { return p.k === 'text' && p.layer === 'DIMENSIONS' && /°$/.test(p.text); }).map(function (p) { return p.text; });
      assert(tx.join('|') === '0°|30°|60°', 'sheet texts ' + tx.join('|'));
      assert(sh.prims.some(function (p) { return p.k === 'arc' && p.layer === 'DIMENSIONS'; }), 'the dimension arc');
      var svg = CT.toSVG(sh), dxf = CT.toDXF(sh, { version: 'R2000' }), pdf = CT.toPDF(sh);
      assert(svg.indexOf('60°') > 0 && (dxf.indexOf('60%%d') > 0 || dxf.indexOf('60°') > 0) && pdf.indexOf('60') > 0, 'exports');
      // clockwise: the first pick past 180° counter-clockwise runs the other way
      var cw = CT.addAngularRunning(r.doc, id, { base: { a: [0, 0], b: [1, 1.7320508075688772] }, refs: [{ c: [2.1650635094610964, 1.25], r: 0.2 }, { a: [0, 0], b: [4, 0] }] });
      assert(cw.cw === true, 'clockwise set');
      nearRel(cw.values[0], 30, 1e-6, 'cw hole'); nearRel(cw.values[1], 60, 1e-6, 'cw base edge');
      var gone = false;
      try { CT.addAngularRunning(r.doc, id, { base: { a: [0, 0], b: [4, 0] }, refs: [{ a: [4, 2], b: [9, 2] }] }); } catch (e) { gone = /parallel/.test(e.message); }
      assert(gone, 'a line parallel to the base is refused');
      var same = false;
      try { CT.addAngularRunning(r.doc, id, { base: { a: [0, 0], b: [4, 0] }, refs: [{ a: [4, 0], b: [0, 0] }] }); } catch (e) { same = /base line/.test(e.message); }
      assert(same, 'the base picked again is refused');
    });

    test('rfCT: Path Length Dimension — the slot (two 2 in lines and two R.25 ends: 4 + π/2 = 5.571) and two plate edges (6.000); a chain that does not join is refused; reattached on reload', function () {
      var r = ctDoc(CT_SLOT), id = r.front.id;
      var d = CT.addPathLength(r.doc, id, { refs: [{ a: [1, 1.25], b: [3, 1.25] }, { c: [3, 1], r: 0.25, a0: -90, a1: 90 }, { a: [1, 0.75], b: [3, 0.75] }, { c: [1, 1], r: 0.25, a0: 90, a1: 270 }] });
      nearRel(d.value, 4 + Math.PI / 2, 1e-9, 'slot path');
      CT.addPathLength(r.doc, id, { refs: [{ a: [0, 2], b: [4, 2] }, { a: [4, 0], b: [4, 2] }] });
      var bad = false;
      try { CT.addPathLength(r.doc, id, { refs: [{ a: [0, 2], b: [4, 2] }, { a: [1, 0.75], b: [3, 0.75] }] }); } catch (e) { bad = /end to end/.test(e.message); }
      assert(bad, 'a broken chain is refused');
      var sh = CT.compute(JSON.parse(JSON.stringify(r.doc)), r.mesh, r.model), t = ctUser(sh, id).map(function (x) { return x.text + (x.dangling ? '!' : ''); });
      assert(t.join('|') === '5.571|6.000', 'texts ' + t.join(' | '));
      var svg = CT.toSVG(sh);
      assert(svg.indexOf('5.571') > 0 && svg.indexOf('6.000') > 0, 'SVG');
    });
    test('rfCT: on a bent inch bracket (.0598 sheet, R.06 inside) — Path Length of the outside profile (6 + the R.1198 bend + 1.5 = 7.688) and a Horizontal Dimension on the bend arc alone (its run, .120; a slot end\'s semicircle has no run: refused, vertical .500); both survive save and reload', function () {
      var r = ctDoc('p.units("in"); p.sheet(0.0598, 0.06, 0.71); p.sketch("Top").rect(0, -3, 6, 3).end().baseFlange(); p.flange(1.5, [[0, 0.0598, 1.5]]);'), id = r.front.id;
      var w = r.sheet().views.filter(function (x) { return x.view.id === id; })[0], arcs = w.proj.arcs.visible.slice().sort(function (a, b) { return b.r - a.r; }), A = arcs[0];
      assert(arcs.length === 2 && Math.abs(A.r - 0.1198) < 1e-6, 'two bend arcs, outer R.1198: ' + arcs.map(function (a) { return a.r; }).join(', '));
      var d = CT.addPathLength(r.doc, id, { refs: [{ a: [0, 0], b: [6, 0] }, { c: A.c, r: A.r, a0: A.a0, a1: A.a1 }, { a: [-0.1198, 0.1198], b: [-0.1198, 1.6198] }] });
      nearRel(d.value, 7.5 + Math.PI / 2 * 0.1198, 1e-6, 'developed outside length');
      var h = CT.addSmartDim(r.doc, id, { arc: { c: A.c, r: A.r, a0: A.a0, a1: A.a1 } }, null, [-0.5, -0.5], { lock: 'h' });
      assert(h && h.kind === 'h', 'arc run: ' + (h && h.kind));
      nearRel(h.value, 0.1198, 1e-6, 'arc run');
      var sh = CT.compute(JSON.parse(JSON.stringify(r.doc)), r.mesh, r.model), t = ctUser(sh, id).map(function (x) { return x.text + (x.dangling ? '!' : ''); });
      assert(t.join('|') === '7.688|.120', 'reloaded: ' + t.join(' | '));
      var semi = { arc: { c: [3, 1], r: 0.25, a0: -90, a1: 90 } };
      assert(CT.smartDim(semi, null, [5, 1], { lock: 'h' }) === null, 'a semicircle has no horizontal run');
      nearRel(CT.smartDim(semi, null, [5, 1], { lock: 'v' }).value, 0.5, 1e-9, 'its vertical run');
    });
    test('rfCT2: the part\'s angle changes 30° -> 45° — the Angular Running set (bottom edge, a hole at 15°, the 30° edge) reads 0°, 15°, 45° and the Smart angle 45°, neither dangling; back to 30° reads 30° again', function () {
      function fan(deg) {
        var a = deg * Math.PI / 180;
        return 'p.units("in"); p.sketch("Front").polyline([[0, 0], [4, 0], [4, 2], [' + 2 * Math.cos(a) + ', ' + 2 * Math.sin(a) + ']]).circle(' + 2.5 * Math.cos(Math.PI / 12) + ', ' + 2.5 * Math.sin(Math.PI / 12) + ', 0.15).extrude(0.25);';
      }
      var r = ctDoc(fan(30)), id = r.front.id, a30 = [2 * Math.cos(Math.PI / 6), 2 * Math.sin(Math.PI / 6)];
      CT.addAngularRunning(r.doc, id, { base: { a: [0, 0], b: [4, 0] }, refs: [{ c: [2.5 * Math.cos(Math.PI / 12), 2.5 * Math.sin(Math.PI / 12)], r: 0.15 }, { a: [0, 0], b: a30 }] });
      var ang = CT.addSmartDim(r.doc, id, { edge: [[0, 0], [4, 0]] }, { edge: [[0, 0], a30] }, [1.5, 0.3], {});
      assert(ang && ang.kind === 'angle', 'a Smart angle');
      nearRel(ang.value, 30, 1e-6, 'angle at 30');
      var saved = JSON.stringify(r.doc), r45 = build(fan(45));
      noErrors(r45);
      var doc45 = JSON.parse(saved), sh = CT.compute(doc45, r45.mesh, r45.model), t = ctUser(sh, id).map(function (x) { return x.text + (x.dangling ? '!' : ''); });
      assert(t.join('|') === '0°, 15°, 45°|45°', 'after the change: ' + t.join(' | '));
      var r30 = build(fan(30)), t2 = ctUser(CT.compute(doc45, r30.mesh, r30.model), id).map(function (x) { return x.text + (x.dangling ? '!' : ''); });
      assert(t2.join('|') === '0°, 15°, 30°|30°', 'and back: ' + t2.join(' | '));
    });
  })();
