  // ------------------------------------------------------------------ rfAG: magnetic lines for balloons, solid area fill (DXF HATCH)
  (function () {
    if (typeof Drawing === 'undefined') return;
    group('rfAG: magnetic lines for balloons (snap, even spacing, drag, Auto Balloon on one), Solid area fill as a real fill (SVG / PDF / DXF HATCH)');
    var DW = Drawing;
    function rfAGAsm() {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Pinned plate assembly'; })[0];
      var r = buildAsm(ex.code);
      r.doc = DW.newDrawing(r.model, { date: '2026-10-12' });
      DW.standard3View(r.doc, r.mesh, r.model.units);
      r.recompute = function () { r.sheet = DW.compute(r.doc, r.mesh, r.model); return r.sheet; };
      r.iso = r.doc.views.filter(function (v) { return v.role === 'iso'; })[0];
      r.recompute();
      return r;
    }
    function rfAGNear(a, b, tol) { return Math.abs(a - b) <= (tol || 1e-6); }
    if (AnvilExamples.some(function (e) { return e.name === 'Pinned plate assembly'; })) test('rfAG: a magnetic line — balloons put on it sit evenly along it (at 1/2n, 3/2n …), in the order their leaders reach it; dragging the line takes them along; it is not printed; deleting it leaves them where they were', function () {
      var r = rfAGAsm(), iso = r.iso;
      DW.autoBalloon(r.doc, r.model, iso.id);
      var sh = r.recompute(), w = sh.views.filter(function (x) { return x.view.id === iso.id; })[0], n = sh.balloons.length;
      assert(n === 3, 'three balloons ' + n);
      var y = w.box.y1 + 20, a = [w.box.x0, y], b = [w.box.x1, y];
      var ml = DW.addMagLine(r.doc, iso.id, { a: a, b: b });
      assert(ml.id === 'ML1' && rfAGNear(ml.a[0], a[0] - iso.x) && rfAGNear(ml.b[1], y - iso.y), 'stored from the view centre ' + JSON.stringify(ml));
      sh = r.recompute();
      assert(sh.magLines.length === 1 && sh.magLines[0].id === 'ML1' && !sh.magLines[0].balloons.length, 'listed, empty ' + JSON.stringify(sh.magLines));
      var prims0 = sh.prims.length;
      for (var i = 0; i < n; i++) DW.balloonMag(r.doc, iso.id, i, 'ML1');
      sh = r.recompute();
      var B = sh.balloons.slice().sort(function (p, q) { return p.c[0] - q.c[0]; }), L = b[0] - a[0];
      B.forEach(function (bb, j) { assert(rfAGNear(bb.c[1], y) && rfAGNear(bb.c[0], a[0] + L * (j + 0.5) / n) && bb.mag === 'ML1', 'balloon ' + j + ' at ' + bb.c); });
      // leaders do not cross: left to right along the line in the order of their points
      for (var j = 1; j < n; j++) assert(B[j].attach[0] >= B[j - 1].attach[0] - 1e-9, 'leaders in order');
      assert(sh.magLines[0].balloons.length === n && sh.prims.length === prims0, 'the line is not a sheet primitive');
      assert(DW.toSVG(sh).indexOf('ML1') < 0 && !/MAG/i.test(DW.toDXF(sh, { version: 'R2000' }).replace(/\$[A-Z]+/g, '')), 'not printed');
      // a balloon dropped at the left end goes first
      var last = B[n - 1];
      DW.balloonMag(r.doc, iso.id, last.index, 'ML1', 0);
      sh = r.recompute();
      var first = sh.balloons.slice().sort(function (p, q) { return p.c[0] - q.c[0]; })[0];
      assert(first.index === last.index && first.magT === 0, 'dropped first ' + first.index);
      // drag the line 10 mm up and 5 right: the balloons go with it
      var before = sh.balloons.map(function (q) { return q.c.slice(); });
      DW.setMagLine(r.doc, 'ML1', { shift: [5, 10] });
      sh = r.recompute();
      sh.balloons.forEach(function (q, i2) { assert(rfAGNear(q.c[0], before[i2][0] + 5) && rfAGNear(q.c[1], before[i2][1] + 10), 'moved with the line'); });
      // the view moves: the line and its balloons go with it
      DW.moveView(r.doc, iso.id, iso.x + 7, iso.y);
      var sh2 = r.recompute();
      assert(rfAGNear(sh2.magLines[0].a[0], sh.magLines[0].a[0] + 7) && rfAGNear(sh2.balloons[0].c[0], sh.balloons[0].c[0] + 7), 'moves with its view');
      // nearest line under a point
      var hit = DW.magLineAt(sh2, [(sh2.magLines[0].a[0] + sh2.magLines[0].b[0]) / 2, sh2.magLines[0].a[1] + 1], 2);
      assert(hit && hit.id === 'ML1' && rfAGNear(hit.t, 0.5) && rfAGNear(hit.d, 1), 'magLineAt ' + JSON.stringify(hit));
      assert(!DW.magLineAt(sh2, [sh2.magLines[0].a[0], sh2.magLines[0].a[1] + 5], 2), 'nothing 5 mm off');
      // delete it: the balloons stay where they were (pos)
      var at = sh2.balloons.map(function (q) { return q.c.slice(); });
      DW.setMagLine(r.doc, 'ML1', null, sh2);
      var sh3 = r.recompute();
      assert(!iso.magLines && !sh3.magLines.length, 'deleted');
      sh3.balloons.forEach(function (q, i3) { assert(rfAGNear(q.c[0], at[i3][0]) && rfAGNear(q.c[1], at[i3][1]) && q.mag == null, 'stays put ' + i3); });
      var bad = null; try { DW.addMagLine(r.doc, iso.id, { a: [1, 1], b: [1, 1] }); } catch (x) { bad = x.message; }
      assert(bad && /two different/.test(bad), 'a line of no length is refused');
      return n + ' balloons on ML1';
    });
    if (AnvilExamples.some(function (e) { return e.name === 'Pinned plate assembly'; })) test('rfAG: Auto Balloon with Layout Top and Insert magnetic line — the balloons sit evenly on a line 14 mm above the view; a second Auto Balloon replaces that line; Layout Left without the line keeps them on the left; dragging the side line gives it its own ends', function () {
      var r = rfAGAsm(), iso = r.iso;
      DW.autoBalloon(r.doc, r.model, iso.id, { layout: 'top', magnetic: true });
      assert(iso.magLines && iso.magLines.length === 1 && iso.magLines[0].side === 'top' && iso.balloons.every(function (b) { return b.mag === iso.magLines[0].id; }), 'a line on top ' + JSON.stringify(iso.magLines));
      var sh = r.recompute(), w = sh.views.filter(function (x) { return x.view.id === iso.id; })[0], m = sh.magLines[0], k = 1;
      assert(rfAGNear(m.a[1], w.box.y1 + 14) && rfAGNear(m.a[0], w.box.x0) && rfAGNear(m.b[0], w.box.x1), 'the line ' + JSON.stringify(m));
      var xs = sh.balloons.map(function (b) { return b.c[0]; }).sort(function (p, q) { return p - q; }), n = xs.length, L = w.box.x1 - w.box.x0;
      xs.forEach(function (x, i) { assert(rfAGNear(x, w.box.x0 + L * (i + 0.5) / n), 'even ' + i); });
      assert(sh.balloons.every(function (b) { return rfAGNear(b.c[1], w.box.y1 + 14 * k); }), 'on the line');
      DW.setMagLine(r.doc, m.id, { shift: [0, 6] }, sh);
      assert(iso.magLines[0].a && !iso.magLines[0].side, 'dragged: its own ends');
      sh = r.recompute();
      assert(sh.balloons.every(function (b) { return rfAGNear(b.c[1], w.box.y1 + 20); }), 'balloons followed');
      DW.autoBalloon(r.doc, r.model, iso.id, { layout: 'bottom', magnetic: true });
      assert(iso.magLines.length === 2, 'the dragged line is the user\'s now (kept), plus the new one');
      DW.autoBalloon(r.doc, r.model, iso.id, { layout: 'left', magnetic: false });
      sh = r.recompute();
      assert(iso.magLines.length === 1 && sh.balloons.every(function (b) { return rfAGNear(b.c[0], w.box.x0 - 14) && b.side === 'left'; }), 'left, no line ' + sh.balloons.map(function (b) { return b.c; }).join(' | '));
      var ys = sh.balloons.map(function (b) { return b.c[1]; }).sort(function (p, q) { return p - q; });
      for (var i = 1; i < ys.length; i++) assert(ys[i] - ys[i - 1] > 2 * 5 - 1e-9, 'apart');
      return n + ' balloons; ' + JSON.stringify(m.a);
    });
    var PLATE = 'p.sketch("Front").rect(0, 0, 100, 50).circle(20, 25, 5).circle(80, 25, 5).extrude(10);';
    function rfAGPlate() {
      var r = build(PLATE);
      noErrors(r);
      r.doc = DW.newDrawing(r.model, { date: '2026-10-12' });
      DW.standard3View(r.doc, r.mesh, r.model.units);
      r.recompute = function () { r.sheet = DW.compute(r.doc, r.mesh, r.model, { build: r.build }); return r.sheet; };
      r.byId = function (id) { return r.sheet.views.filter(function (w) { return w.view.id === id; })[0]; };
      r.recompute();
      var F = r.doc.views.filter(function (v) { return v.orient === 'Front' && !v.kind; })[0];
      r.S = DW.addSectionView(r.doc, r.mesh, F.id, { axis: 'h', at: 25, sign: 1 });
      r.recompute();
      r.mid = DW.hatchRegions(r.byId(r.S.id)).filter(function (g) { return Math.abs(g.p[0] - 50) < 1e-6; })[0];
      return r;
    }
    test('rfAG: Solid area fill is one filled region — the middle piece of the section (u 25..75, 10 thick: 500 mm² at 1:1) as an even-odd path in SVG, f* in the PDF, a SOLID HATCH in R2000 DXF (dxf-check passes), close hatch lines in R12; the other regions keep their material hatch, drawn by drawing-render.js itself', function () {
      var r = rfAGPlate(), S = r.S, w = r.byId(S.id);
      assert(r.mid, 'middle region');
      var plain0 = r.sheet.prims.filter(function (p) { return p.layer === w.layer && p.style === 'hatch' && !p.areaHatch; }).length;
      DW.setAreaHatch(r.doc, S.id, r.mid.p, { pattern: 'SOLID' });
      var sh = r.recompute(); w = r.byId(S.id);
      var reg = sh.prims.filter(function (p) { return p.k === 'region'; });
      assert(reg.length === 1 && reg[0].layer === w.layer && reg[0].areaHatch === 'SOLID' && reg[0].region != null, 'one region ' + reg.length);
      var area = 0; reg[0].loops.forEach(function (l) { for (var i = 0; i < l.length; i++) { var a = l[i], b = l[(i + 1) % l.length]; area += a[0] * b[1] - b[0] * a[1]; } });
      area = Math.abs(area / 2);
      var sc = w.scale, want = 50 * 10 * sc * sc;
      assert(Math.abs(area - want) < 1e-3 * want + 1e-6, 'area ' + area + ' vs ' + want);
      var he = w.hatches.filter(function (h) { return h.areaHatch; });
      assert(he.length === 1 && he[0].pattern === 'SOLID' && he[0].fill === true && he[0].lines === 1, 'hatches entry ' + JSON.stringify(he));
      var plain1 = sh.prims.filter(function (p) { return p.layer === w.layer && p.style === 'hatch' && !p.areaHatch; }).length;
      assert(plain1 > 0 && plain1 < plain0, 'side pieces keep the material hatch');
      var svg = DW.toSVG(sh);
      assert(/<path class="hatch-fill" d="M[^"]+Z" fill="#000" fill-rule="evenodd" stroke="none"\/>/.test(svg), 'SVG fill');
      var pdf = DW.toPDF ? DW.toPDF(sh) : '';
      assert(!pdf || / f\*/.test(typeof pdf === 'string' ? pdf : ''), 'PDF even-odd fill');
      var dxf = DW.toDXF(sh, { version: 'R2000' });
      assert(/\n0\nHATCH\n5\n[0-9A-F]+\n330\n[0-9A-F]+\n100\nAcDbEntity\n8\n[^\n]+\n(62\n8\n)?100\nAcDbHatch\n10\n0\n20\n0\n30\n0\n210\n0\n220\n0\n230\n1\n2\nSOLID\n70\n1\n71\n0\n91\n1\n92\n3\n72\n0\n73\n1\n93\n\d+\n/.test(dxf), 'R2000 HATCH entity');
      if (typeof DxfCheck !== 'undefined') {
        var ck = DxfCheck.check(dxf, { units: r.model.units === 'in' ? 'in' : 'mm', layers: [] });
        assert(ck.ok && ck.hatches.length === 1 && ck.hatches[0].solid && ck.hatches[0].pattern === 'SOLID' && ck.hatches[0].paths === 1, 'dxf-check ' + JSON.stringify(ck.errors.slice(0, 3)) + JSON.stringify(ck.hatches));
      }
      var r12 = DW.toDXF(sh, { version: 'R12' });
      assert(r12.indexOf('\nHATCH\n') < 0 && (r12.match(/\n0\nLINE\n/g) || []).length > (DW.toDXF(sh, { version: 'R2000' }).match(/\n0\nLINE\n/g) || []).length + 50, 'R12: close lines');
      return 'area ' + area.toFixed(3);
    });
    test('rfAG: a detail letter on a solid-filled region clears its own island; a detail of the region is clipped to its circle; a break through the view cuts the fill', function () {
      var r = rfAGPlate(), S = r.S;
      DW.setAreaHatch(r.doc, S.id, r.mid.p, { pattern: 'SOLID' });
      var D2 = DW.addDetailView(r.doc, r.mesh, S.id, { c: r.mid.p, r: 3, x: 330, y: 130 });
      var sh = r.recompute(), w = r.byId(S.id), wd = r.byId(D2.id);
      // the letter sits on the fill (the detail circle lies inside the 50 x 10 piece): the fill has a hole round it
      var txt = sh.prims.filter(function (p) { return p.k === 'text' && p.text === D2.label && p.layer === w.layer; })[0];
      var regs = sh.prims.filter(function (p) { return p.k === 'region' && p.layer === w.layer; });
      assert(txt && regs.length >= 1, 'letter and fill ' + regs.length);
      var inside = regs.some(function (g) { return Drawing._.inLoops([txt.p[0], txt.p[1] + txt.h / 2], g.loops); });
      assert(!inside, 'the letter is clear of the fill');
      var dr = sh.prims.filter(function (p) { return p.k === 'region' && p.layer === wd.layer; });
      assert(dr.length === 1, 'detail fill');
      var c = wd.clip.c, rr = wd.clip.r;
      assert(dr[0].loops.every(function (l) { return l.every(function (q) { return Math.hypot(q[0] - c[0], q[1] - c[1]) <= rr + 1e-6; }); }), 'clipped to the detail circle');
      // a vertical break from u 40 to 60 through the filled piece: two pieces, 15 x 10 each, the right one moved left
      var r2 = rfAGPlate();
      DW.setAreaHatch(r2.doc, r2.S.id, r2.mid.p, { pattern: 'SOLID' });
      DW.addBreak(r2.doc, r2.S.id, { dir: 'vertical', a: 40, b: 60, gap: 10, style: 'straight' });
      var sh2 = r2.recompute(), w2 = r2.byId(r2.S.id), pieces = sh2.prims.filter(function (p) { return p.k === 'region' && p.layer === w2.layer; });
      var A = pieces.map(function (g) { var a2 = 0; g.loops.forEach(function (l) { for (var i = 0; i < l.length; i++) { var p = l[i], q = l[(i + 1) % l.length]; a2 += p[0] * q[1] - q[0] * p[1]; } }); return Math.abs(a2 / 2); });
      var sc = w2.scale;
      assert(pieces.length === 2 && A.every(function (x) { return Math.abs(x - 150 * sc * sc) < 1e-3 * 150 * sc * sc; }), 'two pieces of the fill ' + A.join(', '));
      return regs.length + ' pieces round the letter; break: ' + A.map(function (x) { return x.toFixed(2); }).join(' + ');
    });
  })();
  // --- end rfAG ---

