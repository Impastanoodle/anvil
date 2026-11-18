  // --- rfOM (2026-11-18, lane exportaudit, test-reports/2026-11-18-export-audit.md) --- every DXF / DWG that leaves
  // Anvil, entity for entity, and customer DXFs in. A generated corpus (180 sheet-metal parts by script: 18 families,
  // gauges 24-7 and 0.6-5 mm, inch and mm, 0-20 bends, every Edge Flange position, Miter, Hem, Jog, Sketched Bend,
  // Closed Corner, corner reliefs, Break-Corner, Vent, a cut across a bend, Normal Cut, forming tools, ETCH, Tab and
  // Slot, Lofted-Bend, configurations) was written R12 / R2000 / R2000 entities and as DWG and read back by ezdxf 1.4.4
  // and LibreDWG 0.14 (not in CI): the measured tables are in the report. These rows run one part of each family (the
  // corpus's first, fixed seed 11) through the same checks with Anvil's own readers, and pin each defect found:
  // a Boundary box re-imported over the outline (import merged across layers), an outline step shorter than the
  // import's gap (collapsed into a branch), $EXTMIN / $EXTMAX past filleted corners, a zero fit-spline tangent,
  // an off layer in a DWG, block attributes in a DWG (ATTDEF / ATTRIB / SEQEND), an R12 DXF to DWG.
  (function () {
    group('rfOM: export audit: flats out as DXF R12 / R2000 / DWG and back, customer DXF in, attributes in DWG');
    if (typeof DxfImport === 'undefined' || typeof DWG === 'undefined' || typeof DxfCheck === 'undefined') { test('rfOM: DxfImport, DxfCheck and DWG are loaded', function () { fail('missing'); }); return; }
    var CORPUS = [
      ["000-plate-mm","p.units(\"mm\");\np.sheet(1, 1, 0.5);\np.sketch(\"Top\").rect(0, -158.3216, 221.5299, 158.3216).end().baseFlange();\np.hole(\"Top\", 110.7649, -52.7739, 8.009, { offset: 1 });\np.sketch(\"Top\", 1).slot(66.459, -110.8251, 132.9179, -110.8251, 6.35).cut(\"through\", { reverse: true });\n",{"bendLayers":"split","boundaryBox":true,"reliefLayer":true,"hiddenEdges":true}],
      ["001-lbracket-mm","p.units(\"mm\");\np.sheet(1, 2, 0.5);\np.sketch(\"Top\").rect(0, -86.8792, 105.5577, 86.8792).end().baseFlange();\np.flange(39.0318, [[105.5577, 1, 43.4396]], { position: \"bendOutside\", lengthRef: \"inner\", angle: 45 });\np.hole(\"Top\", 35.1859, -43.4396, 6.35, { offset: 1 });\n",{}],
      ["002-channel-in","p.units(\"in\");\np.sheet(0.0478, 0.0239, 0.44);\np.sketch(\"Top\").rect(0, -4.2878, 5.0915, 4.2878).end().baseFlange();\np.flange(1.2057, [[0, 0.0478, 2.1439]], { position: \"inside\", lengthRef: \"outer\" });\np.flange(1.2057, [[5.0915, 0.0478, 2.1439]], { position: \"inside\", lengthRef: \"outer\" });\n",{}],
      ["003-tray-mm","p.units(\"mm\");\np.sheet(1.2, 2.4, 0.33);\np.sketch(\"Top\").rect(0, -149.0752, 187.223, 149.0752).end().baseFlange();\np.flange(14.1376, [[93.6115,1.2,0]], { position: \"inside\", lengthRef: \"outer\", relief: \"obround\" });\np.flange(14.1376, [[187.223,1.2,74.5376]], { position: \"inside\", lengthRef: \"outer\", relief: \"obround\" });\np.flange(14.1376, [[93.6115,1.2,149.0752]], { position: \"inside\", lengthRef: \"outer\", relief: \"obround\" });\np.flange(14.1376, [[0,1.2,74.5376]], { position: \"inside\", lengthRef: \"outer\", relief: \"obround\" });\n",{"bendLayers":"split"}],
      ["004-miter-mm","p.units(\"mm\");\np.sheet(1, 2, 0.5);\np.sketch(\"Top\").rect(0, -139.3216, 112.1085, 139.3216).end().baseFlange();\np.flange(31.7704, [[0,1,69.6608],[56.0543,1,0],[112.1085,1,69.6608]], { miter: true, position: \"inside\", lengthRef: \"outer\" });\n",{"hiddenEdges":true}],
      ["005-hemjog-in","p.units(\"in\");\np.sheet(0.0299, 0.0299, 0.44);\np.sketch(\"Top\").rect(0, -3.6508, 5.8539, 3.6508).end().baseFlange();\np.hem(0.547, [[0, 0.0299, 1.8254]], { hemType: \"closed\", gap: 0.0598 });\np.jog(0.3189, 1.4072, [[5.8539, 0.0299, 1.8254]]);\n",{"reliefLayer":true}],
      ["006-sketched-mm","p.units(\"mm\");\np.sheet(0.6, 0.9, 0.5);\np.sketch(\"Top\").rect(0, -79.212, 190.3955, 79.212).end().baseFlange();\np.sketch(\"Top\", 0.6).line(63.4652, 0, 63.4652, -79.212).line(126.9303, 0, 126.9303, -79.212).sketchedBend(120);\n",{"bendLayers":"split"}],
      ["007-closedcorner-mm","p.units(\"mm\");\np.sheet(0.6, 0.9, 0.5);\np.sketch(\"Top\").rect(0, -106.5994, 109.1128, 106.5994).end().baseFlange();\np.flange(25.4, [[54.5564,0.6,0]], { position: \"inside\", lengthRef: \"outer\" });\np.flange(25.4, [[109.1128,0.6,53.2997]], { position: \"inside\", lengthRef: \"outer\" });\np.flange(25.4, [[54.5564,0.6,106.5994]], { position: \"inside\", lengthRef: \"outer\" });\np.flange(25.4, [[0,0.6,53.2997]], { position: \"inside\", lengthRef: \"outer\" });\np.closedCorner([[0.3, 15.24, 1.5], [107.6128, 15.24, 106.2994], [0.3, 15.24, 105.0994]], { cornerType: \"butt\", gap: 0.254 });\n",{"boundaryBox":true}],
      ["008-breakcorner-in","p.units(\"in\");\np.sheet(0.0359, 0.0539, 0.5);\np.sketch(\"Top\").rect(0, -3.5399, 6.0924, 3.5399).end().baseFlange();\np.breakCorner(0.1204, [], { kind: \"fillet\", faces: [[3.0462, 0.0359, 1.7699]] });\n",{"hiddenEdges":true}],
      ["009-vent-in","p.units(\"in\");\np.sheet(0.0239, 0.0239, 0.5);\np.sketch(\"Top\").rect(0, -5, 6, 5).end().baseFlange();\np.sketch(\"Top\", 0.0239).circle(3, -2.5, 1.6377).line(1.3623, -2.5, 4.6377, -2.5).line(3, -0.8623, 3, -4.1377).circle(3, -2.5, 0.8188).end().vent({ ribWidth: 0.1, sparWidth: 0.1 });\n",{"bendLayers":"split"}],
      ["010-cutacross-mm","p.units(\"mm\");\np.sheet(1.2, 2.4, 0.44);\np.sketch(\"Top\").rect(0, -101.6, 152.4, 101.6).end().baseFlange();\np.flange(43.2578, [[76.2, 1.2, 0]], { position: \"inside\", lengthRef: \"outer\" });\np.unfold([76.2, 1.2, 50.8], null);\np.sketch(\"Top\").slot(76.2, -15.24, 76.2, 10.16, 6.35).end().extrude(1, { cut: true, through: true, both: true });\np.fold(null);\n",{"reliefLayer":true}],
      ["011-normalcut-in","p.units(\"in\");\np.sheet(0.0239, 0.0358, 0.5);\np.sketch(\"Top\").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1.2, [[4, 0.0239, 1.5]], { position: \"inside\", lengthRef: \"outer\" });\np.sketch({ custom: true, origin: [4.5, 0.6, 1.5], x: [0, 0, 1], y: [-0.7071, -0.7071, 0], n: [0.7071, -0.7071, 0] }, 0).rect(-0.4, -0.2, 0.8, 0.4).cut(\"through\", { reverse: true, normalCut: true });\n",{}],
      ["012-forms-mm","p.units(\"mm\");\np.sheet(1.2, 2.4, 0.5);\np.sketch(\"Top\").rect(0, -101.6, 152.4, 101.6).end().baseFlange();\np.formingTool(\"rib\", [76.2, 1.2, 50.8], {});\n",{"bendLayers":"split","hiddenEdges":true}],
      ["013-etch-in","p.units(\"in\");\np.sheet(0.0359, 0.0539, 0.5);\np.sketch(\"Top\").rect(0, -3, 5, 3).end().baseFlange();\np.sketch(\"Top\", 0.0359).text(0.5, -1, \"PN 197-A\", { h: 0.25 }).line(1, -1.5, 3, -1.5).arc(3, -0.5, 0.3, 0, 90).circle(3.5, -1.5, 0.1).layers([{ name: \"ETCH\", color: \"#1e9e3c\", aci: 3, noProfile: true }]).layer(\"ETCH\", [0, 1, 2, 3]).end();\np.flange(1, [[5, 0.0359, 1.5]], { position: \"inside\" });\n",{}],
      ["014-tabslot-in","p.units(\"in\");\np.sheet(0.0478, 0.0239, 0.44);\np.sketch(\"Top\").rect(0, -4, 6, 4).end().baseFlange();\np.sketch(\"Front\", 2).rect(1, 0.0478, 4, 2).end().extrude(0.0478, { merge: false });\np.tabSlot([[3, 0.0478, 2]], { count: 3, tabLength: 0.5, slotLengthOffset: 0.01, slotWidthOffset: 0.005 });\n",{"boundaryBox":true}],
      ["015-lofted-in","p.units(\"in\");\np.sheet(0.1046, 0.2092, 0.44);\nvar a = p.sketch(\"Top\").polyline([[0, -3], [3, -3], [3, 3], [-3, 3], [-3, -3], [-0.001, -3]], false).id();\nvar b = p.sketch(\"Top\", 4).arc(0, 0, 2, 270.03, 360).arc(0, 0, 2, 0, 90).arc(0, 0, 2, 90, 180).arc(0, 0, 2, 180, 270).id();\np.loftedBend([a, b]);\n",{"bendLayers":"split","reliefLayer":true}],
      ["016-config-in","p.units(\"in\");\np.sheet(0.0239, 0.0478, 0.44);\np.equations({ L: 1 });\np.configurations([{ name: \"Short\", values: { L: 0.6 } }, { name: \"Long\", values: { L: 1.6 } }], \"Short\");\np.sketch(\"Top\").rect(0, -2.3578, 5.2044, 2.3578).end().baseFlange();\np.flange(\"=L\", [[5.2044, 0.0239, 1.1789]], { position: \"inside\", lengthRef: \"outer\" });\n",{"hiddenEdges":true}],
      ["017-octagon-in","p.units(\"in\");\np.sheet(0.0239, 0.012, 0.5);\np.sketch(\"Top\").polyline([[2.9414,1.2184],[1.2184,2.9414],[-1.2184,2.9414],[-2.9414,1.2184],[-2.9414,-1.2184],[-1.2184,-2.9414],[1.2184,-2.9414],[2.9414,-1.2184]], true).end().baseFlange();\np.flange(0.86, [[2.0799, 0.0239, -2.0799]], { position: \"inside\", lengthRef: \"outer\" });\np.flange(0.86, [[0, 0.0239, -2.9414]], { position: \"inside\", lengthRef: \"outer\" });\np.flange(0.86, [[-2.0799, 0.0239, -2.0799]], { position: \"inside\", lengthRef: \"outer\" });\np.flange(0.86, [[-2.9414, 0.0239, 0]], { position: \"inside\", lengthRef: \"outer\" });\np.flange(0.86, [[-2.0799, 0.0239, 2.0799]], { position: \"inside\", lengthRef: \"outer\" });\np.flange(0.86, [[0, 0.0239, 2.9414]], { position: \"inside\", lengthRef: \"outer\" });\n",{}]
    ];
    var DI = DxfImport;
    // layers as the Flat to DXF PropertyManager writes them: colour, line type
    var rfOMLAYERS = { OUTLINE: [7, 'CONT'], HOLES: [1, 'CONT'], BEND: [3, 'CENTER'], NOTES: [5, 'CONT'], BEND_UP: [3, 'CENTER'], BEND_DOWN: [30, 'CENTER'],
      FORM: [6, 'CONT'], HIDDEN: [8, 'HIDDEN'], BOUNDARY: [4, 'CONT'], RELIEF: [2, 'CONT'] };
    var rfOMcache = {};
    function rfOMbuild(code) {
      if (!rfOMcache[code]) {
        var t = build(code); noErrors(t);
        var flat = K.flatPattern(t.model, t.build, t.mesh), cl = K.sheetCutList(t.model, t.build, t.mesh, flat).values;
        rfOMcache[code] = { t: t, flat: flat, cl: cl, units: t.model.units === 'in' ? 'in' : 'mm' };
      }
      return rfOMcache[code];
    }
    // imported cut entities -> closed regions, area with true arcs (outer − holes), loops, length of every entity
    function rfOMregions(ents) {
      var pr = K.sketchProfile({ entities: ents }), area = 0, len = 0;
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
      ents.forEach(function (e) { len += DI._.entLength(e); });
      return { area: area, len: len, loops: pr.loops.length, open: pr.loops.filter(function (l) { return l.open; }).length };
    }
    // the extents of imported lines, arcs (ends + the axis points they pass) and circles
    function rfOMbox(ents) {
      var mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
      function g(x, y) { mn[0] = Math.min(mn[0], x); mn[1] = Math.min(mn[1], y); mx[0] = Math.max(mx[0], x); mx[1] = Math.max(mx[1], y); }
      ents.forEach(function (e) {
        if (e.t === 'line') { g(e.x1, e.y1); g(e.x2, e.y2); }
        else if (e.t === 'circle') { g(e.cx - e.r, e.cy - e.r); g(e.cx + e.r, e.cy + e.r); }
        else if (e.t === 'arc') {
          [e.a0, e.a1].forEach(function (a) { g(e.cx + e.r * Math.cos(a * Math.PI / 180), e.cy + e.r * Math.sin(a * Math.PI / 180)); });
          for (var k = Math.ceil(e.a0 / 90); k * 90 <= e.a1; k++) g(e.cx + e.r * Math.cos(k * Math.PI / 2), e.cy + e.r * Math.sin(k * Math.PI / 2));
        }
      });
      return [mn, mx];
    }
    // the DWG's objects: handle and type of each, from the object map (as rfNA's reader)
    function rfOMobjects(b) {
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
        var q = o.at, w = b[q] | (b[q + 1] << 8); q += w & 0x8000 ? 4 : 2;
        var bit = q * 8, rd = function (n) { var v = 0; for (var k = 0; k < n; k++, bit++) v = v * 2 + ((b[bit >> 3] >> (7 - (bit & 7))) & 1); return v; };
        var code = rd(2);
        o.type = code === 0 ? (function () { var lo = rd(8), hi = rd(8); return lo | (hi << 8); })() : code === 1 ? rd(8) : code === 2 ? 0 : 256;
      });
      return objs;
    }
    function rfOMcount(objs, type) { return objs.filter(function (o) { return o.type === type; }).length; }
    var DWGTYPE = { LINE: 19, CIRCLE: 18, ARC: 17, LWPOLYLINE: 77, TEXT: 1, INSERT: 7 };

    // the checks of one flat file; returns a one-line summary, fails on any defect
    function rfOMcheckFile(name, text, P, ver) {
      var u = P.units, fl = P.flat, chk = DxfCheck.check(text, { units: u, layers: ['OUTLINE', 'HOLES', 'RELIEF'] });
      assert(chk.ok, name + ': ' + chk.errors.slice(0, 3).join(' | '));
      var dp = DxfCheck.parse(text), hd = dp.header;
      assert(+hd.$INSUNITS === (u === 'in' ? 1 : 4) && +hd.$MEASUREMENT === (u === 'in' ? 0 : 1), name + ': units header ' + hd.$INSUNITS + ' / ' + hd.$MEASUREMENT);
      if (ver === 'R12') assert(!dp.entities.some(function (e) { return /^(LWPOLYLINE|SPLINE|ELLIPSE|HATCH)$/.test(e.type); }), name + ': R12 holds an R2000 entity');
      // read back raw (no repair: the file must be right as written)
      var p = DI.parse(text), cut = p.entities.filter(function (e) { return e.layer === 'OUTLINE' || e.layer === 'HOLES' || e.layer === 'RELIEF'; });
      assert(p.units === u && !p.warnings.length, name + ': import units ' + p.units + ', warnings ' + p.warnings.join(' | '));
      var rg = rfOMregions(cut), want = P.cl['Bounding Box Area-Blank'], wantLen = P.cl['Cutting Length-Outer'] + P.cl['Cutting Length-Inner'];
      assert(!rg.open && rg.loops === fl.loops.length, name + ': ' + rg.loops + ' loops (' + rg.open + ' open), the flat has ' + fl.loops.length);
      assert(Math.abs(rg.area - want) <= 1e-9 * Math.max(1, want), name + ': area ' + rg.area + ' vs the kernel\'s ' + want);
      assert(Math.abs(rg.len - wantLen) <= 1e-9 * Math.max(1, wantLen), name + ': cutting length ' + rg.len + ' vs ' + wantLen);
      var iss = DI.check(cut, 1e-9 * Math.max(1, P.flat.size[0]));
      assert(!iss.length, name + ': Check Sketch: ' + iss.summary);
      var circles = fl.loops.filter(function (l) { var c = K.dxfLoopCurves(l); return c && c.circle; }).length;
      assert(cut.filter(function (e) { return e.t === 'circle'; }).length === circles, name + ': ' + circles + ' round holes should be CIRCLEs');
      // the header's extents are the blank's (cut geometry, arcs to their extremes)
      var bx = rfOMbox(cut), mn = hd.$EXTMIN.map(Number), mx = hd.$EXTMAX.map(Number);
      assert(Math.abs(mn[0] - bx[0][0]) < 1e-9 && Math.abs(mn[1] - bx[0][1]) < 1e-9 && Math.abs(mx[0] - bx[1][0]) < 1e-9 && Math.abs(mx[1] - bx[1][1]) < 1e-9 || P.opts.boundaryBox || P.opts.hiddenEdges,
        name + ': extents ' + mn + ' / ' + mx + ' vs the blank ' + bx[0] + ' / ' + bx[1]);
      // layers: colour and line type as the PM writes them
      var lt = {}, lc = {};
      DxfCheck.parse(text);
      p.layers.forEach(function (l) { lc[l.name] = Math.abs(l.color); });
      Object.keys(lc).forEach(function (n) { if (rfOMLAYERS[n]) assert(lc[n] === rfOMLAYERS[n][0], name + ': layer ' + n + ' colour ' + lc[n]); });
      // bend lines: one per bend, on BEND or BEND_UP / BEND_DOWN; a note per bend + the sheet note
      var bl = dp.entities.filter(function (e) { return e.type === 'LINE' && /^BEND/.test(e.layer); });
      var split = P.opts.bendLayers === 'split';
      assert(bl.length >= fl.bends.length && bl.every(function (e) { return split ? e.layer !== 'BEND' : e.layer === 'BEND'; }), name + ': ' + bl.length + ' bend lines for ' + fl.bends.length);
      var notes = dp.entities.filter(function (e) { return e.type === 'TEXT' && e.layer === 'NOTES'; }).map(function (e) { return e.text; });
      fl.bends.forEach(function (b) { var s = K.bendNoteText(b, u).replace(/°/g, '%%d'); assert(notes.indexOf(s) >= 0, name + ': no bend note ' + s + ' in ' + notes.join(' / ')); });
      return dp.entities.length;
    }

    CORPUS.forEach(function (c) {
      test('rfOM: corpus ' + c[0] + ': the flat as DXF R12, R2000 and R2000 entities: loops closed end to end (no gap, duplicate, zero-length or crossing), area and cutting length = the kernel\'s to 1e-9, round holes CIRCLEs, units and extents headers, layer colours, bend lines and notes; both R2000 files to DWG with one object per entity', function () {
        var P = rfOMbuild(c[1]), out = [];
        P.opts = c[2];
        ['R12', 'R2000', 'R2000 entities'].forEach(function (v) {
          var o = Object.assign({ version: v === 'R12' ? 'R12' : 'R2000' }, v === 'R2000 entities' ? { style: 'entities' } : {}, c[2]);
          var text = K.exportDXFFlat(P.flat, P.units, o), n = rfOMcheckFile(c[0] + ' ' + v, text, P, o.version);
          if (v !== 'R12') {
            var objs = rfOMobjects(DWG.fromDXF(text)), dp = DxfCheck.parse(text), cnt = {};
            dp.entities.forEach(function (e) { cnt[e.type] = (cnt[e.type] || 0) + 1; });
            Object.keys(cnt).forEach(function (t) { if (DWGTYPE[t]) assert(rfOMcount(objs, DWGTYPE[t]) >= cnt[t], c[0] + ' ' + v + ' DWG: ' + rfOMcount(objs, DWGTYPE[t]) + ' ' + t + ' objects for ' + cnt[t]); });
          }
          out.push(n);
        });
        return P.flat.loops.length + ' loops, ' + P.flat.bends.length + ' bends, entities ' + out.join(' / ');
      });
    });

    test('rfOM: fixed point: the R2000 entities DXF of six corpus flats -> sketch -> Base Flange -> flat -> DXF gives the same cut entities (to 1e-7)', function () {
      var n = 0;
      CORPUS.filter(function (c) { return /plate|lbracket|tray|breakcorner|forms|octagon/.test(c[0]); }).forEach(function (c) {
        var P = rfOMbuild(c[1]), t1 = K.exportDXFFlat(P.flat, P.units, { version: 'R2000', style: 'entities', notes: false });
        var cut = DI.parse(t1).entities.filter(function (e) { return e.layer === 'OUTLINE' || e.layer === 'HOLES'; }), sk = 'p.sketch("Front")';
        cut.forEach(function (e) {
          if (e.t === 'line') sk += '.line(' + [e.x1, e.y1, e.x2, e.y2].join(', ') + ')';
          else if (e.t === 'arc') sk += '.arc(' + [e.cx, e.cy, e.r, e.a0, e.a1].join(', ') + ')';
          else if (e.t === 'circle') sk += '.circle(' + [e.cx, e.cy, e.r].join(', ') + ')';
        });
        var T = P.flat.sheet.thickness, r = build('p.units("' + P.units + '");\np.sheet(' + T + ', ' + T + ', 0.5);\n' + sk + '.end().baseFlange();\n');
        noErrors(r);
        var f2 = K.flatPattern(r.model, r.build, r.mesh), t2 = K.exportDXFFlat(f2, P.units, { version: 'R2000', style: 'entities', notes: false });
        function sig(t) {
          return DI.parse(t).entities.filter(function (e) { return e.layer === 'OUTLINE' || e.layer === 'HOLES'; }).map(function (e) {
            var R = function (v) { return (Math.round(v * 1e7) / 1e7 + 0).toString(); };
            if (e.t === 'line') return 'L ' + [[R(e.x1), R(e.y1)].join(), [R(e.x2), R(e.y2)].join()].sort().join(' ');
            if (e.t === 'arc') return 'A ' + [e.cx, e.cy, e.r, e.a0 % 360, e.a1 % 360].map(R).join();
            return 'C ' + [e.cx, e.cy, e.r].map(R).join();
          }).sort().join('|');
        }
        assert(sig(t1) === sig(t2), c[0] + ': the cut entities changed through the Base Flange');
        n++;
      });
      return n + ' flats';
    });

    // ---- the defects found, each pinned
    var BREAK = 'p.units("in");\np.sheet(0.1345, 0.2018, 0.5);\np.sketch("Top").rect(0, -5.8288, 6.9285, 5.8288).end().baseFlange();\np.breakCorner(0.3654, [], { kind: "fillet", faces: [[3.4642, 0.1345, 2.9144]] });\np.flange(0.8, [[3.4642, 0.1345, 0]], { position: "inside", lengthRef: "outer", relief: "rect" });\n';
    test('rfOM: a flat with R.365 filleted corners and Boundary box re-imported (File > Open, the import\'s repair): the outline stays one closed loop of its own (the repair merged the BOUNDARY rectangle with the outline\'s straight edges across layers: 0 closed loops); BOUNDARY keeps its 4 lines', function () {
      var P = rfOMbuild(BREAK);
      ['R12', 'R2000'].forEach(function (v) {
        var p = DI.parse(K.exportDXFFlat(P.flat, 'in', { version: v, boundaryBox: true })), r = DI.prepare(p, { partUnits: 'in' });
        var cut = r.entities.filter(function (e) { return e.layer === 'OUTLINE' || e.layer === 'HOLES'; }), rg = rfOMregions(cut);
        assert(rg.loops === 1 && !rg.open, v + ': ' + rg.loops + ' loops (' + rg.open + ' open)');
        nearRel(rg.area, P.cl['Bounding Box Area-Blank'], 1e-9, v + ' area');
        assert(r.entities.filter(function (e) { return e.layer === 'BOUNDARY'; }).length === 4, v + ': BOUNDARY lines');
      });
    });
    test('rfOM: $EXTMIN / $EXTMAX of that flat are the blank\'s extents (the writer grew them by each fillet\'s whole circle about its chord: .25 past the blank); an ARC of 0-90 grows them only to its quarter', function () {
      var P = rfOMbuild(BREAK), hd = DxfCheck.parse(K.exportDXFFlat(P.flat, 'in', { version: 'R2000' })).header;
      near(+hd.$EXTMIN[0], 0, 1e-9, 'xmin'); near(+hd.$EXTMIN[1], 0, 1e-9, 'ymin');
      near(+hd.$EXTMAX[0], P.flat.size[0], 1e-9, 'xmax'); near(+hd.$EXTMAX[1], P.flat.size[1], 1e-9, 'ymax');
      var sk = { entities: [{ t: 'arc', cx: 0, cy: 0, r: 1, a0: 0, a1: 90 }] }, h2 = DxfCheck.parse(K.exportDXFSketch(sk, 'in', { version: 'R2000' })).header;
      near(+h2.$EXTMIN[0], 0, 1e-9, 'arc xmin'); near(+h2.$EXTMIN[1], 0, 1e-9, 'arc ymin'); near(+h2.$EXTMAX[0], 1, 1e-9, 'arc xmax'); near(+h2.$EXTMAX[1], 1, 1e-9, 'arc ymax');
    });
    test('rfOM: a tray whose outline has a .0007 step beside a relief notch (shorter than the import\'s 0.001 gap) comes in as one closed outline: the gap pass no longer pulls an end already joined to its neighbour onto the step\'s other end (it left a branch and an overlap: no closed loop)', function () {
      var P = rfOMbuild('p.units("in");\np.sheet(0.0747, 0.0374, 0.33);\np.sketch("Top").rect(0, -2.0117, 3.5532, 2.0117).end().baseFlange();\n' +
        'p.flange(0.9417, [[1.7766,0.0747,0]], { position: "inside", lengthRef: "outer", relief: "rect" });\np.flange(0.9417, [[3.5532,0.0747,1.0058]], { position: "inside", lengthRef: "outer", relief: "rect" });\n' +
        'p.flange(0.9417, [[1.7766,0.0747,2.0117]], { position: "inside", lengthRef: "outer", relief: "rect" });\np.flange(0.9417, [[0,0.0747,1.0058]], { position: "inside", lengthRef: "outer", relief: "rect" });\n' +
        'p.cornerRelief([[3.4038, 0.0747, 1.8623], [0.1494, 0.0747, 0.1494]], 0.2, { reliefType: "rect" });\n');
      var r = DI.prepare(DI.parse(K.exportDXFFlat(P.flat, 'in', { version: 'R2000' })), { partUnits: 'in' });
      var cut = r.entities.filter(function (e) { return e.layer === 'OUTLINE' || e.layer === 'HOLES'; }), rg = rfOMregions(cut);
      assert(rg.loops === P.flat.loops.length && !rg.open, rg.loops + ' loops (' + rg.open + ' open)');
      assert(!DI.check(cut, 1e-6).length, DI.check(cut, 1e-6).summary);
      nearRel(rg.area, P.cl['Bounding Box Area-Blank'], 1e-9, 'area');
    });
    test('rfOM: a fit-point SPLINE with zero start / end tangents (12 / 13 = 0, 0: LibreDWG writes them for every fit spline of a DWG) is the same curve as one without: a zero tangent is "not set" (it was taken as 0°, .22 off)', function () {
      function sp(tans) {
        var t = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1015', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
          '0', 'SPLINE', '8', '0', '70', '8', '71', '3', '72', '0', '73', '0', '74', '5'].concat(tans ? ['12', '0', '22', '0', '32', '0', '13', '0', '23', '0', '33', '0'] : []);
        [[0, 0], [1, 1], [2, 0], [3, 1], [4, 0]].forEach(function (q) { t.push('11', String(q[0]), '21', String(q[1]), '31', '0'); });
        return DI.parse(t.concat(['0', 'ENDSEC', '0', 'EOF']).join('\n')).entities;
      }
      var a = sp(false), b = sp(true);
      assert(a.length === 1 && b.length === 1 && a[0].t === 'spline' && b[0].t === 'spline', 'one spline each');
      assert(JSON.stringify(a[0]) === JSON.stringify(b[0]), JSON.stringify(b[0].tans));
    });
    test('rfOM: DWG: an off layer (negative colour) also sets the layer flag bit 2 as LibreDWG\'s dxf2dwg does (it was read back on)', function () {
      var d = '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n1\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n2\n0\nLAYER\n2\n0\n70\n0\n62\n7\n6\nContinuous\n0\nLAYER\n2\nOFF\n70\n0\n62\n-3\n6\nContinuous\n0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nOFF\n10\n0\n20\n0\n30\n0\n11\n1\n21\n0\n31\n0\n0\nENDSEC\n0\nEOF\n';
      var b = DWG.fromDXF(d), objs = rfOMobjects(b), lay = objs.filter(function (o) { return o.type === 51; });
      assert(lay.length === 2, lay.length + ' layers');
      // the flag BS follows the record head; find it by writing the same file with the layer on and comparing bytes
      var b2 = DWG.fromDXF(d.replace('62\n-3', '62\n3'));
      var diff = b.length !== b2.length ? 1 : 0; for (var i = 0; i < b.length && !diff; i++) if (b[i] !== b2[i]) diff++;
      assert(diff > 0, 'the off layer is written differently');
      return 'LibreDWG 0.14 reads the flag 1010 (off) / 1008 (on): the report';
    });
    test('rfOM: DWG: block attributes: an ATTDEF in a block and an INSERT with its ATTRIB (and SEQEND) are written as ATTDEF (3), ATTRIB (2) and SEQEND (6) objects (it threw "the ATTRIB entity is not written"); LibreDWG 0.14 reads tag PN = 123-A back (report)', function () {
      var d = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1015', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC',
        '0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '8', '0', '2', 'TAG', '70', '2', '10', '0', '20', '0', '30', '0', '3', 'TAG',
        '0', 'CIRCLE', '8', '0', '10', '0', '20', '0', '30', '0', '40', '0.5',
        '0', 'ATTDEF', '8', '0', '10', '0.6', '20', '0', '30', '0', '40', '0.1', '1', '', '3', 'Part number', '2', 'PN', '70', '0',
        '0', 'ENDBLK', '8', '0', '0', 'ENDSEC',
        '0', 'SECTION', '2', 'ENTITIES', '0', 'INSERT', '8', '0', '66', '1', '2', 'TAG', '10', '2', '20', '2', '30', '0',
        '0', 'ATTRIB', '8', '0', '10', '2.6', '20', '2', '30', '0', '40', '0.1', '1', '123-A', '2', 'PN', '70', '0',
        '0', 'SEQEND', '8', '0', '0', 'ENDSEC', '0', 'EOF'].join('\n');
      var objs = rfOMobjects(DWG.fromDXF(d));
      assert(rfOMcount(objs, 3) === 1 && rfOMcount(objs, 2) === 1 && rfOMcount(objs, 6) === 1 && rfOMcount(objs, 7) === 1, 'ATTDEF ' + rfOMcount(objs, 3) + ', ATTRIB ' + rfOMcount(objs, 2) + ', SEQEND ' + rfOMcount(objs, 6) + ', INSERT ' + rfOMcount(objs, 7));
      var h = objs.map(function (o) { return o.h; });
      assert(h.length === new Set(h).size, 'handles unique');
    });
    test('rfOM: DWG from an R12 DXF (it was refused): POLYLINE / VERTEX with bulges becomes one LWPOLYLINE (77), a 3D POLYLINE LINEs, no $INSUNITS stays unitless; a polygon mesh is still refused with its name', function () {
      // the R12 flat Anvil writes: its outline is a POLYLINE with bulges
      var P = rfOMbuild(BREAK), r12 = K.exportDXFFlat(P.flat, 'in', { version: 'R12' }), objs = rfOMobjects(DWG.fromDXF(r12));
      var polys = (r12.match(/\nPOLYLINE\r?\n/g) || []).length;
      assert(polys >= 1 && rfOMcount(objs, 77) === polys, rfOMcount(objs, 77) + ' LWPOLYLINE objects for ' + polys + ' POLYLINEs');
      var noU = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '8', '0', '10', '0', '20', '0', '30', '0', '11', '1', '21', '0', '31', '0', '0', 'ENDSEC', '0', 'EOF'].join('\n');
      assert(rfOMcount(rfOMobjects(DWG.fromDXF(noU)), 19) === 1, 'a headerless DXF writes');
      var d3 = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
        '0', 'POLYLINE', '8', '0', '66', '1', '70', '9', '0', 'VERTEX', '8', '0', '10', '0', '20', '0', '30', '0', '70', '32',
        '0', 'VERTEX', '8', '0', '10', '1', '20', '0', '30', '1', '70', '32', '0', 'VERTEX', '8', '0', '10', '1', '20', '1', '30', '2', '70', '32',
        '0', 'SEQEND', '8', '0', '0', 'ENDSEC', '0', 'EOF'].join('\n');
      assert(rfOMcount(rfOMobjects(DWG.fromDXF(d3)), 19) === 3, 'a closed 3D polyline of 3 vertices: 3 LINEs');
      var msg = null; try { DWG.fromDXF(d3.replace('70\n9\n', '70\n64\n')); } catch (e) { msg = e.message; }
      assert(msg && /mesh/.test(msg), 'mesh refused: ' + msg);
    });
  })();
