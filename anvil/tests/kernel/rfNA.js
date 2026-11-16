  // --- rfNA (2026-11-15, lane NA dxfdwg, test-reports/2026-11-15-dxf-dwg-roundtrip.md) --- DXF and DWG both ways. Eleven
  // flat patterns (the three sheet-metal examples, a tray with corner reliefs, an UP / DOWN bracket with a slot across a
  // bend, a 600-hole panel, a hem + jog, a Lofted-Bend square-to-round, etch marks, an mm bracket, an L bracket) written
  // R12, R2000 (polylines) and R2000 (entities), each read back by DxfImport: the same entities from all three (circles
  // circles, arcs arcs), units read (no 25.4), layers kept, every cut loop closed, the cut area equal to the flat's exact
  // area (true arcs) to 1e-9, and through DWG.fromDXF. LibreDWG 0.14 (dwgread / dwg2dxf, not in CI) read the same DWGs
  // entity for entity: the measured tables are in the report; these rows pin what it found (a layer missing from the
  // LAYER table). Then what customers send: duplicates, zero-length lines, a corner open by 1e-4, an ELLIPSE, wide
  // polylines, a block inserted twice (rotated, mirrored), weighted SPLINEs (true arcs with rationalArcs), MTEXT with
  // formatting codes, BYBLOCK on layer 0, an R12 file with no units, a header UCS, a tilted OCS.
  (function () {
    group('rfNA: DXF / DWG round trip: eleven flats out and back in, customer files in');
    if (typeof DxfImport === 'undefined' || typeof DWG === 'undefined') { test('rfNA: DxfImport and DWG are loaded', function () { fail('missing'); }); return; }
    var DI = DxfImport, T = 0.0598, I = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.44);\n';
    var BASE = I + 'p.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n';
    function ex(n) { var e = (typeof AnvilExamples !== 'undefined' ? AnvilExamples : []).filter(function (x) { return x.name === n; })[0]; return e ? e.code : null; }
    var perf = 'p.sketch("Top", ' + T + ')';
    for (var pi = 0; pi < 30; pi++) for (var pj = 0; pj < 20; pj++) perf += '.circle(' + (0.6 + pi * 0.5).toFixed(2) + ', ' + (-0.6 - pj * 0.5).toFixed(2) + ', 0.09)';
    perf += '.cut("through", { reverse: true });\n';
    var LAY = '.layers([{ name: "ETCH", color: "#1e9e3c", aci: 3, noProfile: true }])';
    var PARTS = {
      'U-bracket example (mm)': ex('Sheet-metal U-bracket'),
      'Tray example (mm, obround reliefs)': ex('Tray'),
      'Normal Cut Bracket example (mm)': ex('Normal Cut Bracket'),
      'tray with rect and circular corner reliefs': BASE + [[2, T, 0], [4, T, 1.5], [2, T, 3], [0, T, 1.5]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer", relief: "rect" });\n'; }).join('') +
        'p.cornerRelief([[4, ' + T + ', 3], [0, ' + T + ', 0]], 0.25, { reliefType: "circular" });\n',
      'UP and DOWN bends, slot across a bend': 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
        'p.flange(1.5, [[3, 0.06, 0]], { position: "inside" });\np.flange(1, [[3, 0.06, 4]], { position: "inside", reverse: true });\n' +
        'p.unfold([3, 0.06, 2], null);\np.sketch("Top").slot(3, -0.6, 3, 0.4, 0.25).end().extrude(1, { cut: true, through: true, both: true });\np.fold(null);\n',
      '600-hole panel': I + 'p.sketch("Top").rect(0, -11, 16, 11).end().baseFlange();\n' + perf,
      'hem and jog': BASE + 'p.hem(0.5, [[0, ' + T + ', 1.5]], { gap: 0.04 });\np.jog(0.5, 1, [[4, ' + T + ', 1.5]]);\n',
      'Lofted-Bend square to round': 'p.units("in");\np.sheet(0.0747, 0.0747, 0.5);\n' +
        'var a = p.sketch("Top").polyline([[0, -3], [3, -3], [3, 3], [-3, 3], [-3, -3], [-0.001, -3]], false).id();\n' +
        'var b = p.sketch("Top", 4).arc(0, 0, 2, 270.03, 360).arc(0, 0, 2, 0, 90).arc(0, 0, 2, 90, 180).arc(0, 0, 2, 180, 270).id();\np.loftedBend([a, b]);\n',
      'etch marks and text': 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n' +
        'p.sketch("Top", 0.06).text(0.5, -1, "PN 123-A", { h: 0.25 }).line(1, -1.5, 3, -1.5).arc(3, -0.5, 0.3, 0, 90).circle(3.5, -1.5, 0.1)' + LAY + '.layer("ETCH", [0, 1, 2, 3]).end();\n' +
        'p.flange(1, [[4, 0.06, 1]], { position: "inside" });\n',
      'mm bracket, two flanges and a hole': 'p.units("mm");\np.sheet(1.5, 1.5, 0.44);\np.sketch("Top").rect(0, -50, 100, 50).end().baseFlange();\n' +
        'p.flange(30, [[0, 1.5, 25], [100, 1.5, 25]], { position: "inside", lengthRef: "outer" });\np.hole("Top", 50, -25, 8.5, { offset: 1.5 });\n',
      'L bracket with a hole': I + 'p.sketch("Top").rect(0, -2, 3, 2).end().baseFlange();\np.flange(1.5, [[3, ' + T + ', 1]], { lengthRef: "outer" });\np.hole("Top", 1, -1, 0.25, { offset: ' + T + ' });\n'
    };
    var rfNAflats = {};
    function rfNAflat(name) {
      if (!rfNAflats[name]) {
        assert(PARTS[name], name + ': no script (example missing?)');
        var t = build(PARTS[name]); noErrors(t);
        rfNAflats[name] = { t: t, flat: K.flatPattern(t.model, t.build, t.mesh), units: t.model.units === 'in' ? 'in' : 'mm' };
      }
      return rfNAflats[name];
    }
    // the flat's exact area: each loop's true curves (K.dxfLoopCurves, what the DXF writes), chord polygon + the circular
    // segment of every arc; loop 0 the outline, the others holes
    function rfNAflatArea(flat) {
      var A = 0;
      flat.loops.forEach(function (loop, i) {
        var lc = K.dxfLoopCurves(loop), a = 0;
        if (!lc) return;
        if (lc.circle) a = Math.PI * lc.circle.r * lc.circle.r;
        else {
          var s = 0;
          lc.segs.forEach(function (g) {
            s += (g.a[0] * g.b[1] - g.b[0] * g.a[1]) / 2;
            if (g.t === 'arc') s += g.r * g.r / 2 * (g.sweep - Math.sin(g.sweep));
          });
          a = Math.abs(s);
        }
        A += i ? -a : a;
      });
      return A;
    }
    // imported entities: closed regions (outer − holes, arcs exact), as rfKS
    function rfNAregions(ents) {
      var pr = K.sketchProfile({ entities: ents.filter(function (e) { return e.t !== 'text' && e.t !== 'point' && !e.construction; }) }), area = 0;
      pr.loops.forEach(function (l) {
        var A = K.signedArea(l.pts), s = A < 0 ? -1 : 1, a = Math.abs(A), n = l.pts.length;
        (l.seg || []).forEach(function (ci, i) {
          var cv = (pr.curves || [])[ci];
          if (ci < 0 || !cv) return;
          var p = l.pts[i], q = l.pts[(i + 1) % n], h = Math.hypot(q[0] - p[0], q[1] - p[1]) / 2;
          if (!(h > 0) || !(cv.r > 0)) return;
          var th = 2 * Math.asin(Math.min(1, h / cv.r)), seg = cv.r * cv.r / 2 * (th - Math.sin(th));
          var cr = (q[0] - p[0]) * (cv.c[1] - p[1]) - (q[1] - p[1]) * (cv.c[0] - p[0]);
          a += cr * s > 0 ? seg : -seg;
        });
        area += (l.hole ? -1 : 1) * a;
      });
      return { area: area, loops: pr.loops.length, open: pr.loops.filter(function (l) { return l.open; }).length };
    }
    function rfNAimport(text, pu, popts) {
      var p = DI.parse(text, popts), r = DI.prepare(p, { partUnits: pu });
      var cut = r.entities.filter(function (e) { return e.layer === 'OUTLINE' || e.layer === 'HOLES'; });
      var counts = {};
      r.entities.forEach(function (e) { var k = e.t + '@' + (e.layer || '0'); counts[k] = (counts[k] || 0) + 1; });
      return { parsed: p, prep: r, ents: r.entities, cut: cut, counts: counts, reg: rfNAregions(cut) };
    }
    function rfNAkeys(o) { return Object.keys(o).sort().map(function (k) { return k + ' ' + o[k]; }).join(', '); }

    Object.keys(PARTS).forEach(function (name) {
      test('rfNA: ' + name + ': the flat as DXF R12, R2000 and R2000 entities imports as the same sketch (entity types per layer, circles stay circles), in the part\'s units with no 25.4, layers kept, every cut loop closed, cut area = the flat\'s exact area to 1e-9; the R2000 file goes through the DWG writer', function () {
        var f = rfNAflat(name), fl = f.flat, u = f.units, want = rfNAflatArea(fl), out = [];
        var texts = {
          R12: K.exportDXFFlat(fl, u, { version: 'R12', bendLayers: 'split' }),
          R2000: K.exportDXFFlat(fl, u, { version: 'R2000', bendLayers: 'split' }),
          'R2000 entities': K.exportDXFFlat(fl, u, { version: 'R2000', style: 'entities', bendLayers: 'split' })
        };
        var first = null;
        Object.keys(texts).forEach(function (v) {
          var r = rfNAimport(texts[v], u);
          assert(r.parsed.units === u && r.parsed.unitsFrom === 'INSUNITS' && r.prep.scale === 1, v + ': units ' + r.parsed.units + ' scale ' + r.prep.scale);
          assert(!r.parsed.warnings.length, v + ': warnings ' + r.parsed.warnings.join(' | '));
          assert(r.reg.loops === fl.loops.length && !r.reg.open, v + ': ' + r.reg.loops + ' cut loops (' + r.reg.open + ' open) for ' + fl.loops.length);
          assert(Math.abs(r.reg.area - want) <= 1e-9 * Math.max(1, want), v + ': cut area ' + r.reg.area + ' vs the flat\'s ' + want);
          var holes = DxfCheck.parse(texts[v]).entities.filter(function (e) { return e.type === 'CIRCLE' && e.layer === 'HOLES'; }).length;
          assert((r.counts['circle@HOLES'] || 0) === holes, v + ': ' + (r.counts['circle@HOLES'] || 0) + ' circles for ' + holes + ' CIRCLEs');
          var layers = r.parsed.layers.map(function (l) { return l.name; }).sort().join();
          var dl = {}; DxfCheck.parse(texts[v]).entities.forEach(function (e) { dl[e.layer] = 1; });
          assert(layers === Object.keys(dl).sort().join(), v + ': layers ' + layers + ' vs the file\'s ' + Object.keys(dl).sort().join());
          var c = rfNAkeys(r.counts);
          if (first == null) first = c; else assert(c === first, v + ': ' + c + ' vs R12 ' + first);
        });
        var bytes = DWG.fromDXF(texts.R2000), p = DWG.parseDXF(texts.R2000);
        assert(bytes.length > 1000 && p.entities.length === DxfCheck.parse(texts.R2000).entities.length, 'DWG');
        out.push(fl.loops.length + ' loops, area ' + fmt(want) + ' ' + u + '², ' + first);
        return out.join('');
      });
    });

    test('rfNA: the imported cut sketch of four flats makes a Base Flange whose volume is the flat\'s exact area × T, and that Base Flange\'s own flat DXF imports to the same area (to 1e-9)', function () {
      var n = 0;
      [['L bracket with a hole', T], ['tray with rect and circular corner reliefs', T], ['UP and DOWN bends, slot across a bend', 0.06], ['mm bracket, two flanges and a hole', 1.5]].forEach(function (nt) {
        var name = nt[0], Tk = nt[1], f = rfNAflat(name), want = rfNAflatArea(f.flat);
        var r = rfNAimport(K.exportDXFFlat(f.flat, f.units, { version: 'R2000' }), f.units);
        var sk = 'p.sketch("Front")';
        r.cut.forEach(function (e) {
          if (e.t === 'line') sk += '.line(' + [e.x1, e.y1, e.x2, e.y2].join(', ') + ')';
          else if (e.t === 'arc') sk += '.arc(' + [e.cx, e.cy, e.r, e.a0, e.a1].join(', ') + ')';
          else if (e.t === 'circle') sk += '.circle(' + [e.cx, e.cy, e.r].join(', ') + ')';
          else fail(name + ': a ' + e.t + ' on a cut layer');
        });
        var t = build('p.units("' + f.units + '");\np.sheet(' + Tk + ', ' + Tk + ', 0.44);\n' + sk + '.end().baseFlange();\n');
        noErrors(t);
        assert(Math.abs(t.mp.volume - want * Tk) <= 1e-9 * want * Tk, name + ': Base Flange volume ' + t.mp.volume + ' vs area × T ' + want * Tk);
        var fl2 = K.flatPattern(t.model, t.build, t.mesh), r2 = rfNAimport(K.exportDXFFlat(fl2, f.units, {}), f.units);
        assert(Math.abs(r2.reg.area - want) <= 1e-9 * want && r2.reg.loops === f.flat.loops.length, name + ': its flat ' + r2.reg.area + ' / ' + r2.reg.loops + ' loops');
        n++;
      });
      return n + ' parts';
    });

    // ---- the DWG writer: what LibreDWG found
    // a small reader: the object map (section 2) and each object's type
    function rfNAobjects(b) {
      function u32(i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0; }
      var nsec = u32(21), map = null;
      for (var i = 0; i < nsec; i++) if (b[25 + 9 * i] === 2) map = { at: u32(26 + 9 * i), size: u32(30 + 9 * i) };
      var st = map.at, objs = [];
      function mc() { var v = 0, sh = 1, x; for (;;) { x = b[st++]; if (x & 0x80) { v += (x & 0x7F) * sh; sh *= 128; } else { v += (x & 0x3F) * sh; return x & 0x40 ? -v : v; } } }
      for (;;) {
        var p0 = st, size = (b[st] << 8) | b[st + 1], h = 0, at = 0; st += 2;
        while (st < p0 + size) { h += mc(); at += mc(); objs.push({ h: h, at: at }); }
        st += 2;
        if (size <= 2) break;
      }
      objs.forEach(function (o) {
        var q = o.at, w = b[q] | (b[q + 1] << 8); q += w & 0x8000 ? 4 : 2;   // MS size
        var bit = q * 8, rd = function (n) { var v = 0; for (var k = 0; k < n; k++, bit++) v = v * 2 + ((b[bit >> 3] >> (7 - (bit & 7))) & 1); return v; };
        var code = rd(2);
        o.type = code === 0 ? (function () { var lo = rd(8), hi = rd(8); return lo | (hi << 8); })() : code === 1 ? rd(8) : code === 2 ? 0 : 256;
      });
      return objs;
    }
    test('rfNA: DWG: an entity on a layer the DXF\'s LAYER table lacks (AutoCAD makes it on read) gets its LAYER record in the DWG; before, every such entity pointed at a handle past $HANDSEED that was never written (LibreDWG: "Object handle not found" on all 10,000 lines); 10,000 LINEs write in under 2 s', function () {
      var d = '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n1\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n', h = 0x100;
      for (var i = 0; i < 10000; i++) d += '0\nLINE\n5\n' + (h++).toString(16).toUpperCase() + '\n100\nAcDbEntity\n8\n' + (i % 2 ? 'OUTLINE' : 'HOLES') + '\n100\nAcDbLine\n10\n' + (i % 100) + '\n20\n' + Math.floor(i / 100) + '\n30\n0\n11\n' + (i % 100 + 0.5) + '\n21\n' + Math.floor(i / 100) + '\n31\n0\n';
      d += '0\nENDSEC\n0\nEOF\n';
      var t0 = Date.now(), b = DWG.fromDXF(d), ms = Date.now() - t0;
      var objs = rfNAobjects(b), layers = objs.filter(function (o) { return o.type === 51; }), lines = objs.filter(function (o) { return o.type === 19; });
      assert(lines.length === 10000, lines.length + ' LINE objects');
      assert(layers.length === 3, layers.length + ' LAYER records (0, HOLES, OUTLINE)');
      var maxH = Math.max.apply(null, objs.map(function (o) { return o.h; }));
      assert(layers.every(function (o) { return o.h <= maxH; }) && objs.length === new Set(objs.map(function (o) { return o.h; })).size, 'handles');
      assert(ms < 2000, ms + ' ms');
      return objs.length + ' objects, ' + b.length + ' bytes, ' + ms + ' ms';
    });

    // ---- customer files
    function rfNAfile(o) {
      var L = [];
      function sec(n, body) { if (!body) return; L.push('0', 'SECTION', '2', n); Array.prototype.push.apply(L, body); L.push('0', 'ENDSEC'); }
      sec('HEADER', o.header); sec('TABLES', o.tables); sec('BLOCKS', o.blocks); sec('ENTITIES', o.entities);
      L.push('0', 'EOF');
      return L.join('\n') + '\n';
    }
    function HD(ins, ver) { return ['9', '$ACADVER', '1', ver || 'AC1015'].concat(ins == null ? [] : ['9', '$INSUNITS', '70', String(ins)]); }
    function LN(ly, a, b) { return ['0', 'LINE', '8', ly, '10', String(a[0]), '20', String(a[1]), '30', '0', '11', String(b[0]), '21', String(b[1]), '31', '0']; }
    function RECT(ly, x0, y0, x1, y1) { return [].concat(LN(ly, [x0, y0], [x1, y0]), LN(ly, [x1, y0], [x1, y1]), LN(ly, [x1, y1], [x0, y1]), LN(ly, [x0, y1], [x0, y0])); }
    function CIRC(ly, c, r, x) { return ['0', 'CIRCLE', '8', ly].concat(x || [], ['10', String(c[0]), '20', String(c[1]), '30', '0', '40', String(r)]); }
    function imp(o, popts) { return rfNAimport(rfNAfile(o), 'in', popts); }
    function allCut(r) { return rfNAregions(r.ents); }

    test('rfNA: customer DXF: duplicate entities are merged and zero-length LINEs dropped (both counted in the report), the 3 × 2 plate with a Ø.5 hole comes in once', function () {
      var r = imp({ header: HD(1), entities: [].concat(RECT('0', 0, 0, 3, 2), RECT('0', 0, 0, 3, 2), CIRC('0', [1, 1], 0.25), CIRC('0', [1, 1], 0.25), LN('0', [3, 2], [3, 2]), LN('0', [1, 1], [1, 1])) });
      assert(r.ents.length === 5 && r.prep.report.merged === 5 && r.prep.report.removed === 2, 'entities ' + r.ents.length + ' report ' + JSON.stringify(r.prep.report));
      var g = allCut(r);
      assert(g.loops === 2 && Math.abs(g.area - (6 - Math.PI / 16)) < 1e-12, 'area ' + g.area);
    });

    test('rfNA: customer DXF: a corner open by 1e-4 (under Merge points closer than) closes where its two lines cross, so both edges stay square: area exactly 6 (before: both ends met halfway and the bottom edge tilted, 5.999925)', function () {
      var r = imp({ header: HD(1), entities: [].concat(LN('0', [0, 0], [3, 0]), LN('0', [3, 0], [3, 2]), LN('0', [3, 2], [0, 2]), LN('0', [0, 2], [0, 0.0001])) });
      var g = allCut(r);
      assert(g.loops === 1 && !g.open && Math.abs(g.area - 6) < 1e-12, 'area ' + g.area);
      assert(r.ents.every(function (e) { return Math.abs(e.y1 - e.y2) < 1e-15 || Math.abs(e.x1 - e.x2) < 1e-15; }), 'edges square ' + JSON.stringify(r.ents));
      assert(r.prep.report.gaps === 1, 'the gap is reported');
      // over the merge distance but under Close gaps up to: the same corner rule (rfKS) still holds
      var r2 = imp({ header: HD(1), entities: [].concat(LN('0', [0, 0], [3, 0]), LN('0', [3, 0], [3, 2]), LN('0', [3, 2], [0, 2]), LN('0', [0, 2], [0, 0.0008])) });
      assert(Math.abs(allCut(r2).area - 6) < 1e-12, '8e-4 gap: ' + allCut(r2).area);
    });

    test('rfNA: customer DXF: ELLIPSE (full, 2 × 1) stays an ellipse; LWPOLYLINE with constant width (43) and per-vertex widths (40 / 41) and an R12 POLYLINE with width import as their centre line and say so', function () {
      var r = imp({ header: HD(1), entities: ['0', 'ELLIPSE', '8', '0', '10', '0', '20', '0', '30', '0', '11', '2', '21', '0', '31', '0', '40', '0.5', '41', '0', '42', String(2 * Math.PI)] });
      assert(r.ents.length === 1 && r.ents[0].t === 'ellipse' && Math.abs(allCut(r).area - 2 * Math.PI) < 1e-9, 'ellipse ' + JSON.stringify(r.ents) + ' ' + allCut(r).area);
      var w1 = imp({ header: HD(1), entities: ['0', 'LWPOLYLINE', '8', '0', '90', '4', '70', '1', '43', '0.05', '10', '0', '20', '0', '10', '3', '20', '0', '10', '3', '20', '2', '10', '0', '20', '2'] });
      var w2 = imp({ header: HD(1), entities: ['0', 'LWPOLYLINE', '8', '0', '90', '4', '70', '1', '10', '0', '20', '0', '40', '0.1', '41', '0.2', '10', '3', '20', '0', '10', '3', '20', '2', '10', '0', '20', '2'] });
      var w3 = imp({ header: HD(1, 'AC1009'), entities: ['0', 'POLYLINE', '8', '0', '66', '1', '70', '1', '40', '0.1', '41', '0.1', '10', '0', '20', '0', '30', '0',
        '0', 'VERTEX', '8', '0', '10', '0', '20', '0', '30', '0', '0', 'VERTEX', '8', '0', '10', '3', '20', '0', '30', '0', '0', 'VERTEX', '8', '0', '10', '3', '20', '2', '30', '0', '0', 'VERTEX', '8', '0', '10', '0', '20', '2', '30', '0', '0', 'SEQEND', '8', '0'] });
      [w1, w2, w3].forEach(function (w, i) {
        assert(Math.abs(allCut(w).area - 6) < 1e-12, i + ': area ' + allCut(w).area);
        assert(w.parsed.warnings.some(function (s) { return /1 polyline has a width: its centre line is imported/.test(s); }), i + ': warnings ' + w.parsed.warnings.join(' | '));
      });
      var plain = imp({ header: HD(1), entities: ['0', 'LWPOLYLINE', '8', '0', '90', '2', '70', '0', '43', '0', '10', '0', '20', '0', '10', '3', '20', '0'] });
      assert(!plain.parsed.warnings.length, 'width 0 says nothing');
    });

    test('rfNA: customer DXF: one BLOCK inserted twice, rotated 30° and mirrored (X scale −1) at 45°, arc and lines on layer 0 taking the INSERT\'s layer; a BYBLOCK-coloured circle on layer 0 inside a block takes the INSERT\'s layer', function () {
      var tab = [].concat(['0', 'BLOCK', '8', '0', '2', 'TAB', '70', '0', '10', '0', '20', '0', '30', '0'], LN('0', [0, 0], [2, 0]), LN('0', [2, 0], [2, 1]),
        ['0', 'ARC', '8', '0', '10', '1', '20', '1', '30', '0', '40', '1', '50', '0', '51', '180'], LN('0', [0, 1], [0, 0]), ['0', 'ENDBLK']);
      var r = imp({ header: HD(1), blocks: tab, entities: ['0', 'INSERT', '8', 'CUT', '2', 'TAB', '10', '5', '20', '5', '30', '0', '50', '30', '0', 'INSERT', '8', 'CUT', '2', 'TAB', '10', '10', '20', '5', '30', '0', '41', '-1', '42', '1', '50', '45'] });
      var g = allCut(r);
      assert(g.loops === 2 && Math.abs(g.area - 2 * (2 + Math.PI / 2)) < 1e-9 && r.ents.every(function (e) { return e.layer === 'CUT'; }), 'area ' + g.area + ' ' + JSON.stringify(r.counts));
      // the mirrored one: its arc's centre is the block's (1, 1) mirrored in X then turned 45° about (10, 5)
      var c = 45 * Math.PI / 180, want = [10 + (-1) * Math.cos(c) - 1 * Math.sin(c), 5 + (-1) * Math.sin(c) + 1 * Math.cos(c)];
      assert(r.ents.some(function (e) { return e.t === 'arc' && Math.hypot(e.cx - want[0], e.cy - want[1]) < 1e-12 && Math.abs(e.r - 1) < 1e-12; }), 'mirrored arc centre ' + want);
      var bb = imp({ header: HD(1), tables: ['0', 'TABLE', '2', 'LAYER', '70', '1', '0', 'LAYER', '2', 'CUT', '70', '0', '62', '1', '6', 'CONTINUOUS', '0', 'ENDTAB'],
        blocks: [].concat(['0', 'BLOCK', '8', '0', '2', 'B', '70', '0', '10', '0', '20', '0', '30', '0'], CIRC('0', [0, 0], 0.5, ['62', '0']), ['0', 'ENDBLK']),
        entities: [].concat(RECT('0', 0, 0, 3, 2), ['0', 'INSERT', '8', 'CUT', '62', '5', '2', 'B', '10', '1', '20', '1', '30', '0']) });
      var circ = bb.ents.filter(function (e) { return e.t === 'circle'; });
      assert(circ.length === 1 && circ[0].layer === 'CUT' && circ[0].cx === 1 && circ[0].r === 0.5 && Math.abs(allCut(bb).area - (6 - Math.PI / 4)) < 1e-12, 'BYBLOCK ' + JSON.stringify(circ));
    });

    test('rfNA: customer DXF: weighted (rational) SPLINEs: with rationalArcs a quarter circle (weights 1, √½, 1) comes in as one true arc and a full circle (9 points, 4 spans) as one circle; a rational curve that is no circle stays lines within 1e-4, warned; rationalArcs off keeps lines', function () {
      var w = String(Math.SQRT1_2);
      var q = ['0', 'SPLINE', '8', '0', '70', '8', '71', '2', '72', '6', '73', '3', '74', '0', '40', '0', '40', '0', '40', '0', '40', '1', '40', '1', '40', '1',
        '10', '10', '20', '1', '30', '0', '41', '1', '10', '11', '20', '1', '30', '0', '41', w, '10', '11', '20', '0', '30', '0', '41', '1'];
      var o = { header: HD(1), entities: [].concat(LN('0', [11, 0], [10, 0]), LN('0', [10, 0], [10, 1]), q) };
      var r = imp(o, { rationalArcs: true }), arcs = r.ents.filter(function (e) { return e.t === 'arc'; });
      assert(arcs.length === 1 && r.ents.length === 3 && Math.abs(arcs[0].r - 1) < 1e-12 && Math.abs(arcs[0].a1 - arcs[0].a0 - 90) < 1e-9, 'arc ' + JSON.stringify(r.ents));
      assert(Math.abs(allCut(r).area - Math.PI / 4) < 1e-12 && !r.parsed.warnings.length, 'area ' + allCut(r).area + ' ' + r.parsed.warnings);
      // full circle R 2 at (5, 5): the standard 9-point rational quadratic
      var P = [[7, 5], [7, 7], [5, 7], [3, 7], [3, 5], [3, 3], [5, 3], [7, 3], [7, 5]], Wt = [1, w, 1, w, 1, w, 1, w, 1], cs = ['0', 'SPLINE', '8', 'HOLES', '70', '11', '71', '2', '72', '12', '73', '9', '74', '0'];
      [0, 0, 0, 0.25, 0.25, 0.5, 0.5, 0.75, 0.75, 1, 1, 1].forEach(function (k) { cs.push('40', String(k)); });
      P.forEach(function (p, i) { cs.push('10', String(p[0]), '20', String(p[1]), '30', '0', '41', String(Wt[i])); });
      var rc = imp({ header: HD(1), entities: [].concat(RECT('OUTLINE', 0, 0, 10, 10), cs) }, { rationalArcs: true });
      var cc = rc.ents.filter(function (e) { return e.t === 'circle'; });
      assert(cc.length === 1 && Math.abs(cc[0].r - 2) < 1e-12 && Math.abs(cc[0].cx - 5) < 1e-12 && Math.abs(allCut(rc).area - (100 - 4 * Math.PI)) < 1e-9, 'circle ' + JSON.stringify(cc));
      // a rational quadratic with a weight of 2 is a hyperbola: lines, warned
      var hyp = q.slice(); hyp[hyp.indexOf(w)] = '2';
      var rh = imp({ header: HD(1), entities: [].concat(LN('0', [11, 0], [10, 0]), LN('0', [10, 0], [10, 1]), hyp) }, { rationalArcs: true });
      assert(rh.ents.filter(function (e) { return e.t === 'line'; }).length > 8 && rh.parsed.warnings.some(function (s) { return /converted to lines/.test(s); }), 'hyperbola ' + rh.ents.length);
      var off = imp(o, { rationalArcs: false });
      assert(DI.defaults.rationalArcs === true && off.ents.every(function (e) { return e.t === 'line'; }), 'rationalArcs off: lines (on by default since local-2026-11-15b)');
      return 'quarter arc, circle, hyperbola as ' + rh.ents.length + ' lines';
    });

    test('rfNA: customer DXF: MTEXT with formatting codes (font, height, colour, stacked fraction, non-breaking space, overline, %%c) comes in as its plain text with its height, on its layer; geometry untouched', function () {
      var r = imp({ header: HD(1), entities: [].concat(RECT('0', 0, 0, 3, 2), ['0', 'MTEXT', '8', 'NOTES', '10', '0.5', '20', '1', '30', '0', '40', '0.125', '71', '1', '1', '{\\fArial|b1|i0|c0|p34;\\H0.2x;PART \\C1;12-A}\\P\\OQTY\\o: 4\\~EA \\S1/2; THK %%c.25']) });
      var t = r.ents.filter(function (e) { return e.t === 'text'; });
      assert(t.length === 1 && t[0].str === 'PART 12-A\nQTY: 4 EA 1/2 THK Ø.25' && t[0].h === 0.125 && t[0].layer === 'NOTES', JSON.stringify(t));
      assert(Math.abs(allCut(r).area - 6) < 1e-12, 'plate');
    });

    test('rfNA: customer DXF: units. An R12 file with no header at all opens in the part\'s units with nothing assumed (the PM\'s File units says "Not set"); $INSUNITS 1 in an mm part is × 25.4 once, 4 in an inch part ÷ 25.4; a header UCS (origin 5, 5, X along world Y) does not move WCS geometry; an entity whose OCS is not Z is projected and warned', function () {
      var r = imp({ entities: RECT('0', 0, 0, 3, 2) });
      assert(r.parsed.units == null && r.parsed.unitsFrom == null && r.prep.scale === 1 && Math.abs(allCut(r).area - 6) < 1e-12, 'R12 no header: ' + r.parsed.units + ' ' + r.prep.scale);
      var mm = DI.prepare(DI.parse(rfNAfile({ header: HD(1), entities: RECT('0', 0, 0, 3, 2) })), { partUnits: 'mm' });
      assert(mm.scale === 25.4 && Math.abs(rfNAregions(mm.entities).area - 6 * 25.4 * 25.4) < 1e-9, 'inch file, mm part ' + mm.scale);
      var inch = DI.prepare(DI.parse(rfNAfile({ header: HD(4), entities: RECT('0', 0, 0, 76.2, 50.8) })), { partUnits: 'in' });
      assert(Math.abs(inch.scale - 1 / 25.4) < 1e-15 && Math.abs(rfNAregions(inch.entities).area - 6) < 1e-12, 'mm file, inch part ' + inch.scale);
      var u = imp({ header: HD(1).concat(['9', '$UCSORG', '10', '5', '20', '5', '30', '0', '9', '$UCSXDIR', '10', '0', '20', '1', '30', '0', '9', '$UCSYDIR', '10', '-1', '20', '0', '30', '0']), entities: RECT('0', 0, 0, 3, 2) });
      assert(JSON.stringify(u.ents) === JSON.stringify(imp({ header: HD(1), entities: RECT('0', 0, 0, 3, 2) }).ents) && !u.parsed.warnings.length, 'UCS ignored');
      var o = imp({ header: HD(1), entities: [].concat(RECT('0', 0, 0, 3, 2), CIRC('0', [1, 1], 0.25, ['210', '0', '220', '1', '230', '0'])) });
      assert(o.parsed.tilted === 1 && o.parsed.warnings.some(function (s) { return /not parallel to the XY plane/.test(s); }), 'tilted OCS warned');
    });
  })();
