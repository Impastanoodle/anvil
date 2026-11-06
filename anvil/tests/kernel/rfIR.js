  // --- rfIR (2026-11-05, lane drawaudit): the shop drawing audit's fixes (test-reports/2026-11-05-shop-drawing-audit.md).
  // A sheet-metal shop's sheet: Standard 3 View + flat pattern + Hole Table on ANSI B, inch. Tables and model
  // dimensions keep off the title block and the other views; a flat view shrinks rather than falling off the sheet;
  // hatching in an R2000 DXF / DWG saved from the app is one HATCH entity per region (the pattern's families as drawn) ---
  (function () {
    group('rfIR: shop drawings — Hole Table and model dimensions clear of the title block and views, flat view on the sheet, HATCH entities in R2000');
    var DW = Drawing, Ti = 0.0598;
    var CHANNEL = 'p.name("U-Channel").units("in");\np.sheet(' + Ti + ', 0.06, 0.44);\np.sketch("Top").rect(0, -3, 8, 3).end().baseFlange();\n' +
      'p.flange(1.5, [[4, ' + Ti + ', 0], [4, ' + Ti + ', 3]], { position: "inside" });\n' +
      'p.sketch("Top", ' + Ti + ').circle(1, -1.5, 0.1405).circle(7, -1.5, 0.1405).circle(4, -1.5, 0.25).circle(2.5, -1.5, 0.1405).circle(5.5, -1.5, 0.1405).cut("through", { reverse: true });\n';
    var BOX = 'p.name("Box").units("in");\np.sheet(' + Ti + ', 0.06, 0.44);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
      'p.flange(1.5, [[3, ' + Ti + ', 0], [3, ' + Ti + ', 4], [0, ' + Ti + ', 2], [6, ' + Ti + ', 2]], { position: "inside", relief: "rect" });\n' +
      'p.hem(0.375, [[3, 1.6196, 0]], { gap: 0.0299 });\n';
    var LA = 'p.name("Bracket").units("in");\np.sketch("Front").line(0, 1.5, 0, 0.12).arc(0.12, 0.12, 0.12, 180, 270).line(0.12, 0, 2, 0).line(2, 0, 2, 0.06).line(2, 0.06, 0.12, 0.06).arc(0.12, 0.12, 0.06, 270, 180).line(0.06, 0.12, 0.06, 1.5).line(0.06, 1.5, 0, 1.5).end().extrude(2);\n' +
      'p.sketch("Top").circle(1.4, -0.5, 0.2).end().cut("through");\np.sketch("Top").circle(1.4, -1.5, 0.2).end().cut("through");\n';
    // the audit's sheet: Standard 3 View, the flat (fit), a Hole Table on the flat (origin: the hole nearest its corner)
    function shopSheet(r, opts) {
      opts = opts || {};
      var doc = DW.newDrawing(r.model, { projection: 'third', options: { flatDims: true, flatSizeNote: true } });
      DW.standard3View(doc, r.mesh, 'in');
      doc.autoDims = true;
      var flat = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, fit: true, bendNotes: opts.table ? 'table' : 'notes' });
      if (opts.holes) DW.addHoleTable(doc, flat.id, { origin: opts.holes, all: true });
      return { doc: doc, flat: flat, sheet: DW.compute(doc, r.mesh, r.model, { build: r.build }) };
    }
    function meet(a, b, m) { m = m || 0; return a.x0 - m < b.x1 && b.x0 - m < a.x1 && a.y0 - m < b.y1 && b.y0 - m < a.y1; }
    function bracket() {
      var src = build(LA); noErrors(src);
      var m = Exchange.newPartFromImport(Exchange.importFile('Bracket.step', Exchange.exportSTEP(src.model, src.build), { units: 'in' }));
      new K.Builder(m).insertBends([1, 0, 1], { kFactor: 0.44 });
      var b = K.rebuild(m);
      assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
      return { model: m, build: b, mesh: K.meshFromBody(b.body) };
    }
    test('rfIR: U channel — the Hole Table on its flat view lands on free paper: inside the border, clear of the title block and the blocks left of it, and of every view', function () {
      var r = build(CHANNEL); noErrors(r);
      var fd = DW.flatData(r.mesh, r.model, r.build);
      // the origin: the lower-left hole's centre (a vertex the table can find again)
      var s = shopSheet(r, { holes: [fd.bbox.umin, fd.bbox.vmin] }), sh = s.sheet, ht = sh.holeTables[0];
      assert(ht && ht.box && ht.rows.length === 5, 'table ' + JSON.stringify(ht && ht.rows.length));
      var S = sh.size, k = 1 / 25.4, b1 = 10 * k, B = ht.box;
      assert(B.x0 >= b1 - 1e-9 && B.y0 >= b1 - 1e-9 && B.x1 <= S[0] - b1 + 1e-9 && B.y1 <= S[1] - b1 + 1e-9, 'inside the border ' + JSON.stringify(B));
      DW.tbRects(S, 'in').forEach(function (tb) { assert(!meet(B, tb), 'clear of the title block ' + JSON.stringify(tb)); });
      sh.views.forEach(function (w) { assert(!meet(B, w.box), 'clear of ' + w.view.name); });
      return 'table at ' + [B.x0, B.y0].map(function (x) { return x.toFixed(2); }).join(', ') + ' in';
    });
    test('rfIR: U channel — no model dimension crosses the Hole Table (the Front view\'s 8.000 used to run through it); no text off the sheet', function () {
      var r = build(CHANNEL); noErrors(r);
      var fd = DW.flatData(r.mesh, r.model, r.build);
      var sh = shopSheet(r, { holes: [fd.bbox.umin, fd.bbox.vmin] }).sheet, B = sh.holeTables[0].box;
      var bad = sh.prims.filter(function (p) {
        if (p.dimIx == null) return false;
        if (p.k === 'text') return meet(DW.textRect(p), B);
        if (p.k === 'line') return meet({ x0: Math.min(p.a[0], p.b[0]), x1: Math.max(p.a[0], p.b[0]), y0: Math.min(p.a[1], p.b[1]), y1: Math.max(p.a[1], p.b[1]) }, B);
        return false;
      });
      assert(!bad.length, bad.length + ' dimension pieces on the table, e.g. ' + JSON.stringify(bad[0]));
    });
    test('rfIR: STEP bracket (Insert Bends) at 2 : 1 — the flat and its Hole Table on Sheet2 (rfIW), the table clear of the views; a model dimension never flips across its view (rfIW: the Front view 2.000 stays under it, extension lines from the bottom edge would run through the part; open finding)', function () {
      var r = bracket(), fd = DW.flatData(r.mesh, r.model, r.build);
      var s0 = shopSheet(r, { holes: [fd.bbox.umin, fd.bbox.vmin] }), sh2 = s0.sheet;
      var sh = s0.doc.activeSheet ? DW.compute(DW.sheetDoc(s0.doc, 0), r.mesh, r.model, { build: r.build }) : sh2;
      sh.dims.forEach(function (d) {
        var w = sh.views.filter(function (x) { return x.view.id === d.view; })[0];
        if (!w || !d.auto || !/^(h|v)$/.test(d.kind)) return;
        var B = w.box, inside = d.box && Math.min(d.box.x1, B.x1) - Math.max(d.box.x0, B.x0) > 0.5 * (B.x1 - B.x0) && Math.min(d.box.y1, B.y1) - Math.max(d.box.y0, B.y0) > 0.5 * (B.y1 - B.y0);
        assert(!inside, d.text + ' covers ' + w.view.name + ' ' + JSON.stringify(d.box));
      });
      var B = sh2.holeTables[0].box;
      sh2.views.forEach(function (w) { assert(!meet(B, w.box), 'table clear of ' + w.view.name); });
    });
    test('rfIR: box with four flanges and a hem — Standard 3 View at 1 : 1 fills ANSI B; the flat view (with its Bend Table) is placed on a sheet (rfIW: Sheet2), not beside it', function () {
      var r = build(BOX); noErrors(r);
      var s = shopSheet(r, { table: true }), v = s.flat, w = s.sheet.views.filter(function (x) { return x.view.id === v.id; })[0], S = s.sheet.size;
      assert(!v.offSheet, 'marked off the sheet');
      assert(w.box.x0 > 0 && w.box.y0 > 0 && w.box.x1 < S[0] && w.box.y1 < S[1], 'on the sheet ' + JSON.stringify(w.box));
      var sc = v.scale ? v.scale[0] / v.scale[1] : 1;
      assert(sc >= 1 / 8 - 1e-9, 'scale ' + JSON.stringify(v.scale));
      s.sheet.views.forEach(function (o) { if (o !== w) assert(!meet(w.box, o.box), 'flat clear of ' + o.view.name); });
      return 'flat at ' + (v.scale ? v.scale.join(':') : 'sheet scale');
    });
    // --- hatching as HATCH entities (R2000, opts.hatch)
    var BLOCK = 'p.units("mm");\np.material("6061");\np.box(100, 40, 60);\np.sketch("Top", 40).circle(30, -30, 8).circle(70, -30, 8).cut(20, { reverse: true });\n';
    var STEEL = 'p.units("in");\np.material("Plain Carbon Steel");\np.box(4, 1.6, 2.4);\np.sketch("Top", 1.6).circle(1.2, -1.2, 0.3).circle(2.8, -1.2, 0.3).cut(0.8, { reverse: true });\n';
    function sectionSheet(code, at) {
      var r = build(code); noErrors(r);
      var doc = DW.newDrawing(r.model, { projection: 'third' });
      DW.standard3View(doc, r.mesh, r.model.units);
      var top = doc.views.filter(function (v) { return v.orient === 'Top'; })[0];
      var sv = DW.addSectionView(doc, r.mesh, top.id, { axis: 'h', at: at, sign: 1 });
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      return { r: r, sheet: sh, sec: sh.views.filter(function (w) { return w.view.id === sv.id; })[0] };
    }
    // the HATCH entities of a DXF: { layer, pattern, angle (52), scale (41), defs: [{ a, base, off, dash }] }
    function hatchesOf(dxf) {
      var L = dxf.split(/\r?\n/), out = [], cur = null, def = null;
      for (var i = 0; i + 1 < L.length; i += 2) {
        var c = +L[i].trim(), v = L[i + 1].trim();
        if (c === 0) { cur = v === 'HATCH' ? { layer: null, defs: [], state: 0 } : null; if (cur) out.push(cur); def = null; continue; }
        if (!cur) continue;
        if (c === 8) cur.layer = v;
        else if (c === 2) cur.pattern = v;
        else if (c === 75) cur.state = 1;
        else if (cur.state === 1 && c === 52) cur.angle = +v;
        else if (cur.state === 1 && c === 41) cur.scale = +v;
        else if (cur.state === 1 && c === 53) { def = { a: +v, base: [0, 0], off: [0, 0], dash: [] }; cur.defs.push(def); }
        else if (def && c === 43) def.base[0] = +v; else if (def && c === 44) def.base[1] = +v;
        else if (def && c === 45) def.off[0] = +v; else if (def && c === 46) def.off[1] = +v;
        else if (def && c === 49) def.dash.push(+v);
        else if (c === 98) { cur.state = 2; def = null; }
      }
      return out;
    }
    // does hatch line [a, b] lie on a line of family df, inside a dash of it? (the pattern regenerated from the file)
    function onFamily(df, a, b, tol) {
      var ar = df.a * Math.PI / 180, d = [Math.cos(ar), Math.sin(ar)], n = [-d[1], d[0]], per = df.off[0] * n[0] + df.off[1] * n[1];
      var ok = [a, b].every(function (p) { var t = ((p[0] - df.base[0]) * n[0] + (p[1] - df.base[1]) * n[1]) / per; return Math.abs(t - Math.round(t)) * Math.abs(per) < tol; });
      if (!ok) return false;
      var cross = Math.abs((b[0] - a[0]) * n[0] + (b[1] - a[1]) * n[1]);
      if (cross > tol) return false;
      if (!df.dash.length) return true;
      // the dash pattern of line k starts at base + k off; the segment's middle must be in a dash (or a dot's 0.05 sp)
      var k = Math.round(((a[0] - df.base[0]) * n[0] + (a[1] - df.base[1]) * n[1]) / per), o = [df.base[0] + k * df.off[0], df.base[1] + k * df.off[1]];
      var P = df.dash.reduce(function (s, x) { return s + Math.abs(x); }, 0), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], t = (m[0] - o[0]) * d[0] + (m[1] - o[1]) * d[1];
      t = ((t % P) + P) % P;
      var at = 0;
      for (var i = 0; i < df.dash.length; i++) {
        var len = Math.abs(df.dash[i]);
        if (df.dash[i] >= 0 && t >= at - tol && t <= at + Math.max(len, P * 0.02) + tol) return true;
        at += len;
      }
      return false;
    }
    [['6061 block, mm, ANSI38 (dashed family)', BLOCK, -30], ['steel block, inch, ANSI32', STEEL, -1.2]].forEach(function (c) {
      test('rfIR: ' + c[0] + ' — R2000 with { hatch: true } writes one HATCH per hatched region whose pattern families regenerate every drawn hatch line; no hatch LINEs left; dxf-check and the DWG writer take it; R12 and the default R2000 keep the lines', function () {
        var x = sectionSheet(c[1], c[2]), sh = x.sheet, L = x.sec.layer, hl = sh.prims.filter(function (p) { return p.k === 'line' && p.style === 'hatch' && p.layer === L; });
        assert(hl.length > 20, 'hatch lines ' + hl.length);
        var dxf = DW.toDXF(sh, { version: 'R2000', hatch: true }), H = hatchesOf(dxf).filter(function (h) { return h.layer === L; });
        assert(H.length === x.sec.hatches.length && H.length >= 1, 'HATCH entities ' + H.length + ' for ' + x.sec.hatches.length + ' regions');
        var pat = x.sec.hatches[0].pattern;
        assert(H.every(function (h) { return h.pattern === pat && h.defs.length; }), 'pattern ' + pat + ': ' + JSON.stringify(H.map(function (h) { return h.pattern; })));
        // the file's own families reproduce the sheet's hatch lines (positions, angles, dashes)
        var tol = (sh.units === 'in' ? 1 / 25.4 : 1) * 2e-3, miss = hl.filter(function (p) { return !H.some(function (h) { return h.defs.some(function (df) { return onFamily(df, p.a, p.b, tol); }); }); });
        assert(!miss.length, miss.length + ' of ' + hl.length + ' hatch lines not on the HATCH pattern, e.g. ' + JSON.stringify(miss[0]));
        // acad.pat's angle / scale (its ANSI families at 45°, 1/8 in or 3.175 mm apart)
        H.forEach(function (h) { near(h.scale, x.sec.hatches[0].spacing / (sh.units === 'in' ? 0.125 : 3.175), 1e-6, 'scale'); near(h.angle, ((x.sec.hatches[0].angle - 45) % 360 + 360) % 360, 1e-6, 'angle'); });
        var lines = dxf.split(/\r?\n/), onL = 0;
        for (var i = 0; i + 3 < lines.length; i++) if (lines[i].trim() === '0' && lines[i + 1].trim() === 'LINE') { for (var j = i + 2; j < i + 12; j += 2) if (lines[j].trim() === '8') { if (lines[j + 1].trim() === L) onL++; break; } }
        var visLines = sh.prims.filter(function (p) { return p.k === 'line' && p.layer === L && p.style !== 'hatch' && p.dimIx == null; }).length;
        assert(onL <= visLines, 'LINEs on ' + L + ': ' + onL + ' (outline lines ' + visLines + ')');
        if (typeof DxfCheck !== 'undefined') { var ck = DxfCheck.check(dxf, { units: sh.units, layers: [] }); assert(ck.ok, 'dxf-check ' + JSON.stringify(ck.errors.slice(0, 3))); }
        if (typeof DWG !== 'undefined') { var bytes = DWG.fromDXF(dxf); assert(bytes && bytes.length > 1000, 'DWG'); }
        var plain = DW.toDXF(sh, { version: 'R2000' }), r12 = DW.toDXF(sh, { version: 'R12' });
        assert(plain.indexOf('\nHATCH\n') < 0 && r12.indexOf('\nHATCH\n') < 0, 'the default R2000 and R12 keep LINEs');
        assert(dxf.length < plain.length, 'smaller: ' + dxf.length + ' vs ' + plain.length);
        return hl.length + ' hatch lines -> ' + H.length + ' HATCH; R2000 ' + plain.length + ' -> ' + dxf.length + ' bytes';
      });
    });
    test('rfIR: a hatch region with a line taken away (a detail profile clip, a label island) falls back to LINEs, so the file never shows hatching the sheet does not', function () {
      var x = sectionSheet(BLOCK, -30), sh = x.sheet, L = x.sec.layer;
      var first = -1;
      sh.prims.forEach(function (p, j) { if (first < 0 && p.k === 'line' && p.style === 'hatch' && p.layer === L) first = j; });
      var cut = Object.assign({}, sh, { prims: sh.prims.filter(function (p, j) { return j !== first; }) });
      var dxf = DW.toDXF(cut, { version: 'R2000', hatch: true }), H = hatchesOf(dxf).filter(function (h) { return h.layer === L; });
      var n = x.sec.hatches.length;
      assert(H.length === n - 1, 'HATCH entities ' + H.length + ' (regions ' + n + ', one now drawn as lines)');
    });
    test('rfIR: SVG hatch paths drop the leading zero of their relative moves (smaller, the same points)', function () {
      var x = sectionSheet(BLOCK, -30), svg = DW.toSVG(x.sheet), d = (svg.match(/<path class="hatch" d="([^"]*)"/) || [])[1] || '';
      assert(d && !/[ml\s-]0\.\d/.test(d), 'leading zeros left: ' + d.slice(0, 120));
      assert(/[ml-]\.\d/.test(d) || / \.\d/.test(d), 'short numbers ' + d.slice(0, 80));
    });
  })();
