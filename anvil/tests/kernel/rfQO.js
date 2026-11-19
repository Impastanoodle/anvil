  // --- rfQO (2026-11-19, lane exportaudit2, test-reports/2026-11-19-export-audit-2.md) --- this round's sheet-metal
  // features out as the shop sends them: the flat as DXF R12 / R2000 (polyline and entities) and DWG, the part as STEP.
  // The corpus (86 parts, test-reports/repros/export-audit-2.js: lengths per edge, flange profiles, reliefs beside a
  // neighbour bend, Corner-Trim, patterned / mirrored forming tools, Tab and Slot, Mirror / Pattern of flanges, hems and
  // jogs, Cross-Break, Hole Wizard Up To Next, trays past 90 degrees) was read back by Anvil, by LibreDWG's dwg2dxf and
  // by OpenCascade; these rows run 12 of its parts with Anvil's own readers and pin the three STEP defects it found:
  // a planar face whose holes touch its outer loop (a wall of a tray past 90 degrees) read back folded, written as one
  // face with holes touching it at two points, and a vertex snapped onto its neighbour written as an edge of no length.
  (function () {
    group('rfQO: export audit 2: flats of this round\'s sheet-metal features as DXF / DWG, parts as STEP');
    if (typeof DxfImport === 'undefined' || typeof DWG === 'undefined' || typeof DxfCheck === 'undefined' || typeof Exchange === 'undefined') { test('rfQO: DxfImport, DxfCheck, DWG and Exchange are loaded', function () { fail('missing'); }); return; }
    var DI = DxfImport;
    // rfQO-SAMPLE-BEGIN (node test-reports/repros/export-audit-2.js --dump <names> --out <file>): [name, code, DXF options, form copies, cross-breaks]
    var SAMPLE = [
      ["lengths-inside-in-16ga","p.units(\"in\");\np.sheet(0.0598, 0.06, 0.44);\np.sketch(\"Top\").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1, [[3, 0.0598, 0], [6, 0.0598, 2], [3, 0.0598, 4]], { position: \"inside\", lengthRef: \"outer\", relief: \"rect\", lengths: { 1: 1.5, 2: 0.75 } });\n",{"reliefLayer":true},0,0],
      ["profile-hole-mm-11ga","p.units(\"mm\");\np.sheet(3, 3, 0.33);\np.sketch(\"Top\").rect(0, -101.6, 152.4, 101.6).end().baseFlange();\np.flange(25.4, [[76.2, 3, 0]], { position: \"inside\", relief: \"rect\", startPoint: [0, 3, 0], profile: {\"entities\":[{\"t\":\"line\",\"x1\":0,\"y1\":0,\"x2\":152.4,\"y2\":0},{\"t\":\"line\",\"x1\":152.4,\"y1\":0,\"x2\":152.4,\"y2\":38.1},{\"t\":\"line\",\"x1\":152.4,\"y1\":38.1,\"x2\":0,\"y2\":38.1},{\"t\":\"line\",\"x1\":0,\"y1\":38.1,\"x2\":0,\"y2\":0},{\"t\":\"circle\",\"cx\":76.2,\"cy\":19.05,\"r\":6.35}]} });\n",{},0,0],
      ["relief-obround-in-20ga","p.units(\"in\");\np.sheet(0.0359, 0.03, 0.5);\np.sketch(\"Top\").rect(0, -6, 8, 6).end().baseFlange();\np.flange(1, [[4, 0.0359, 0]], { position: \"inside\", lengthRef: \"outer\", relief: \"obround\" });\np.flange(1, [[4, 0.0359, 6]], { position: \"inside\", lengthRef: \"outer\", relief: \"obround\" });\np.flange(1, [[0, 0.0359, 3]], { position: \"inside\", lengthRef: \"outer\", relief: \"obround\" });\np.flange(1, [[8, 0.0359, 3]], { position: \"inside\", lengthRef: \"outer\", relief: \"obround\" });\n",{"reliefLayer":true,"bendLayers":"split"},0,0],
      ["relief-tear-mm-11ga","p.units(\"mm\");\np.sheet(3, 3, 0.33);\np.sketch(\"Top\").rect(0, -152.4, 203.2, 152.4).end().baseFlange();\np.flange(25.4, [[101.6, 3, 0]], { position: \"inside\", lengthRef: \"outer\", relief: \"tear\" });\np.flange(25.4, [[101.6, 3, 152.4]], { position: \"inside\", lengthRef: \"outer\", relief: \"tear\" });\np.flange(25.4, [[0, 3, 76.2]], { position: \"inside\", lengthRef: \"outer\", relief: \"tear\" });\np.flange(25.4, [[203.2, 3, 76.2]], { position: \"inside\", lengthRef: \"outer\", relief: \"tear\" });\n",{"reliefLayer":true,"bendLayers":"split"},0,0],
      ["cornertrim-bendWaist-in-16ga","p.units(\"in\");\np.sheet(0.0598, 0.06, 0.44);\np.sketch(\"Top\").rect(0, -6, 8, 6).end().baseFlange();\np.flange(1, [[4, 0.0598, 0]], { position: \"inside\", lengthRef: \"outer\" });\np.flange(1, [[4, 0.0598, 6]], { position: \"inside\", lengthRef: \"outer\" });\np.flange(1, [[0, 0.0598, 3]], { position: \"inside\", lengthRef: \"outer\" });\np.flange(1, [[8, 0.0598, 3]], { position: \"inside\", lengthRef: \"outer\" });\np.cornerTrim({ relief: \"bendWaist\" });\n",{"boundaryBox":false},0,0],
      ["cornertrim-fillet-mm-16ga","p.units(\"mm\");\np.sheet(1.5, 1.5, 0.44);\np.sketch(\"Top\").rect(0, -152.4, 203.2, 152.4).end().baseFlange();\np.flange(25.4, [[101.6, 1.5, 0]], { position: \"inside\", lengthRef: \"outer\" });\np.flange(25.4, [[101.6, 1.5, 152.4]], { position: \"inside\", lengthRef: \"outer\" });\np.flange(25.4, [[0, 1.5, 76.2]], { position: \"inside\", lengthRef: \"outer\" });\np.flange(25.4, [[203.2, 1.5, 76.2]], { position: \"inside\", lengthRef: \"outer\" });\np.cornerTrim({ breakCorner: \"fillet\", breakSize: 2.54 });\n",{"boundaryBox":true},0,0],
      ["louver-lpattern-in-16ga","p.units(\"in\");\np.sheet(0.0598, 0.06, 0.44);\np.sketch(\"Top\").rect(0, -10, 10, 10).end().baseFlange();\np.formingTool(\"louver\", [2, 0.0598, 2], { angle: 0 });\np.linearPattern({ dir: \"z\", spacing: 1.5, count: 4 });\n",{"hiddenEdges":true},4,0],
      ["dimple-cpattern-mm-20ga","p.units(\"mm\");\np.sheet(0.9, 0.8, 0.5);\np.sketch(\"Top\").rect(0, -254, 254, 254).end().baseFlange();\np.formingTool(\"dimple\", [203.2, 0.9, 127], { angle: 0 });\np.circularPattern({ axis: \"y\", center: [127, 0, 127], count: 4 });\n",{},4,0],
      ["tabslot-one-in-20ga","p.units(\"in\");\np.sheet(0.0359, 0.03, 0.5);\np.sketch(\"Top\").rect(0, -4, 6, 4).end().baseFlange();\np.flange(2, [[3, 0.0359, 0]], { position: \"inside\", lengthRef: \"outer\" });\np.flange(2.5, [[3, 0.0359, 4]], { position: \"inside\", lengthRef: \"outer\" });\np.flange(1, [[3, 2, 0.0359]], { position: \"inside\", relief: \"rect\", startPoint: [0, 2, 0.0359], profile: {\"entities\":[{\"t\":\"line\",\"x1\":1,\"y1\":0,\"x2\":5,\"y2\":0},{\"t\":\"line\",\"x1\":5,\"y1\":0,\"x2\":5,\"y2\":3.8882000000000003},{\"t\":\"line\",\"x1\":5,\"y1\":3.8882000000000003,\"x2\":1,\"y2\":3.8882000000000003},{\"t\":\"line\",\"x1\":1,\"y1\":3.8882000000000003,\"x2\":1,\"y2\":0}]} });\np.tabSlot([[3, 2, 3.9541000000000004]], { count: 2, tabLength: 1, slotLengthOffset: 0.01, slotWidthOffset: 0.01 });\n",{},0,0],
      ["mirror-jog-mm-16ga","p.units(\"mm\");\np.sheet(1.5, 1.5, 0.44);\np.sketch(\"Top\").rect(-76.2, -101.6, 152.4, 101.6).end().baseFlange();\np.jog(12.7, 25.4, [[76.2, 1.5, 50.8]]);\np.mirror(\"Right\", { feature: 3 });\n",{},0,0],
      ["hole-uptonext-mm-11ga","p.units(\"mm\");\np.sheet(3, 3, 0.33);\np.sketch(\"Front\").polyline([[0, 50.8], [0, 0], [152.4, 0], [177.8, 43.994091]], false).end().baseFlange(null, { depth: 254 });\np.holeWizard({ face: \"Right\", offset: 0, points: [[-50.8, 25.4], [-101.6, 25.4], [-152.4, 25.4], [-203.2, 25.4]], standard: \"ISO\", type: \"csk\", size: \"M5\", end: \"next\" });\n",{},0,0],
      ["combo-lengths-hem-crossbreak-in-20ga","p.units(\"in\");\np.sheet(0.0359, 0.03, 0.5);\np.sketch(\"Top\").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1, [[3, 0.0359, 0], [6, 0.0359, 2]], { position: \"inside\", lengthRef: \"outer\", relief: \"tear\", lengths: { 1: 1.5 } });\np.hem(0.3, [[3, 1, 0]], { hemType: \"closed\" });\np.crossBreak([3, 0.0359, 2], { angle: 2 });\n",{},0,1]
    ];
    // rfQO-SAMPLE-END
    var LAYERS = { OUTLINE: [7, 'CONTINUOUS'], HOLES: [1, 'CONTINUOUS'], BEND: [3, 'CENTER'], NOTES: [5, 'CONTINUOUS'], BEND_UP: [3, 'CENTER'], BEND_DOWN: [30, 'CENTER'],
      FORM: [6, 'CONTINUOUS'], HIDDEN: [8, 'HIDDEN'], BOUNDARY: [4, 'CONTINUOUS'], RELIEF: [2, 'CONTINUOUS'] };
    function rfQOtext(t) { return String(t).replace(/°/g, '%%d').replace(/[Ø⌀]/g, '%%c').replace(/±/g, '%%p'); }
    function rfQOrel(a, b) { return Math.abs(a - b) / Math.max(Math.abs(b), 1e-12); }
    // the kernel's loops (dxfLoopCurves: lines and true arcs): area, arcs, circle
    function rfQOkloops(flat) {
      return flat.loops.map(function (l) {
        var cv = K.dxfLoopCurves(l);
        if (!cv) return null;
        if (cv.circle) return { area: Math.PI * cv.circle.r * cv.circle.r, arcs: 0, circle: 1 };
        var a = 0, arcs = 0;
        cv.segs.forEach(function (s) {
          if (s.t === 'line') a += (s.a[0] * s.b[1] - s.a[1] * s.b[0]) / 2;
          else { arcs++; a += (s.c[0] * (s.b[1] - s.a[1]) - s.c[1] * (s.b[0] - s.a[0]) + s.r * s.r * s.sweep) / 2; }
        });
        return { area: Math.abs(a), arcs: arcs, circle: 0 };
      }).filter(Boolean);
    }
    // imported cut entities -> closed loops with true-arc areas (rfOM's way)
    function rfQOregions(ents) {
      var pr = K.sketchProfile({ entities: ents });
      return pr.loops.map(function (l) {
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
        return { area: a, hole: !!l.hole, open: !!l.open };
      });
    }
    function rfQObox(ents) {
      var mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
      function g(x, y) { mn[0] = Math.min(mn[0], x); mn[1] = Math.min(mn[1], y); mx[0] = Math.max(mx[0], x); mx[1] = Math.max(mx[1], y); }
      ents.forEach(function (e) {
        if (e.t === 'line') { g(e.x1, e.y1); g(e.x2, e.y2); }
        else if (e.t === 'circle') { g(e.cx - e.r, e.cy - e.r); g(e.cx + e.r, e.cy + e.r); }
        else if (e.t === 'arc') {
          var a1 = e.a1; while (a1 < e.a0) a1 += 360;
          [e.a0, a1].forEach(function (a) { g(e.cx + e.r * Math.cos(a * Math.PI / 180), e.cy + e.r * Math.sin(a * Math.PI / 180)); });
          for (var k = Math.ceil(e.a0 / 90); k * 90 <= a1; k++) g(e.cx + e.r * Math.cos(k * Math.PI / 2), e.cy + e.r * Math.sin(k * Math.PI / 2));
        }
      });
      return [mn, mx];
    }
    function rfQOinPoly(P, poly) {
      var c = false;
      for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        var a = poly[i], b = poly[j];
        if ((a[1] > P[1]) !== (b[1] > P[1]) && P[0] < (b[0] - a[0]) * (P[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
      }
      return c;
    }
    // the LAYER table: name -> { color, ltype }
    function rfQOlayers(text) {
      var L = text.replace(/\r\n/g, '\n').split('\n'), out = {}, inL = false, cur = null;
      for (var i = 0; i + 1 < L.length; i += 2) {
        var c = L[i].trim(), v = L[i + 1].trim();
        if (c === '0') { cur = null; if (v === 'LAYER' && inL) cur = {}; if (v === 'ENDTAB') inL = false; continue; }
        if (c === '2' && !cur && v === 'LAYER') inL = true;
        if (!cur) continue;
        if (c === '2') { cur.name = v; out[v] = cur; } else if (c === '62') cur.color = +v; else if (c === '6') cur.ltype = v.toUpperCase();
      }
      return out;
    }
    // one flat file against the part: every defect a line
    function rfQOcheck(text, P, ver) {
      var iss = [], u = P.units, fl = P.flat, chk = DxfCheck.check(text, { units: u, layers: ['OUTLINE', 'HOLES', 'RELIEF'] });
      if (!chk.ok) iss.push('DxfCheck: ' + chk.errors.slice(0, 2).join(' | '));
      var dp = DxfCheck.parse(text), hd = dp.header;
      if (+hd.$INSUNITS !== (u === 'in' ? 1 : 4)) iss.push('$INSUNITS ' + hd.$INSUNITS);
      if (ver === 'R12' && dp.entities.some(function (e) { return /^(LWPOLYLINE|SPLINE|ELLIPSE|HATCH)$/.test(e.type); })) iss.push('R12 holds an R2000 entity');
      var p = DI.parse(text), cut = p.entities.filter(function (e) { return e.layer === 'OUTLINE' || e.layer === 'HOLES' || e.layer === 'RELIEF'; });
      if (p.units !== u || p.warnings.length) iss.push('import: ' + p.units + ' ' + p.warnings.join(' | '));
      var rg = rfQOregions(cut), open = rg.filter(function (l) { return l.open; }).length;
      if (rg.length !== P.kl.length || open) iss.push(rg.length + ' loops (' + open + ' open) for ' + P.kl.length);
      var ra = rg.map(function (l) { return l.area; }).sort(function (a, b) { return a - b; }), ka = P.kl.map(function (l) { return l.area; }).sort(function (a, b) { return a - b; });
      ra.forEach(function (a, i) { if (ka[i] != null && rfQOrel(a, ka[i]) > 1e-9) iss.push('loop area ' + a + ' vs ' + ka[i]); });
      var tot = rg.reduce(function (s, l) { return s + (l.hole ? -1 : 1) * l.area; }, 0), want = P.cl['Bounding Box Area-Blank'];
      if (rfQOrel(tot, want) > 1e-9) iss.push('area ' + tot + ' vs the cut list ' + want);
      var nc = cut.filter(function (e) { return e.t === 'circle'; }).length, na = cut.filter(function (e) { return e.t === 'arc'; }).length;
      var kc = P.kl.reduce(function (s, l) { return s + l.circle; }, 0), kar = P.kl.reduce(function (s, l) { return s + l.arcs; }, 0);
      if (nc !== kc) iss.push(nc + ' CIRCLEs for ' + kc + ' round holes');
      if (na !== kar && !P.opts.reliefLayer) iss.push(na + ' arcs for ' + kar);
      var bx = rfQObox(cut), mn = hd.$EXTMIN.map(Number), mx = hd.$EXTMAX.map(Number);
      if (!P.opts.hiddenEdges && Math.max(Math.abs(mn[0] - bx[0][0]), Math.abs(mn[1] - bx[0][1]), Math.abs(mx[0] - bx[1][0]), Math.abs(mx[1] - bx[1][1])) > 1e-9 * Math.max(1, fl.size[0])) iss.push('extents ' + mn + ' / ' + mx);
      var lt = rfQOlayers(text);
      Object.keys(lt).forEach(function (nm) { var w = LAYERS[nm]; if (w && (Math.abs(lt[nm].color) !== w[0] || lt[nm].ltype !== w[1])) iss.push('layer ' + nm + ' ' + lt[nm].color + ' ' + lt[nm].ltype); });
      var bl = dp.entities.filter(function (e) { return e.type === 'LINE' && /^BEND/.test(e.layer); });
      if (bl.length !== fl.bends.length + P.cross) iss.push(bl.length + ' bend lines for ' + (fl.bends.length + P.cross));
      var notes = dp.entities.filter(function (e) { return e.type === 'TEXT' && e.layer === 'NOTES'; }).map(function (e) { return e.text; });
      fl.bends.forEach(function (b) { var s = rfQOtext(K.bendNoteText(b, u)); if (notes.indexOf(s) < 0) iss.push('no bend note ' + s); });
      if (P.forms !== notes.filter(function (t) { return P.formNotes.indexOf(t) >= 0; }).length) iss.push('form notes for ' + P.forms + ' copies');
      if (P.cross && !notes.some(function (t) { return /^CROSS BREAK/.test(t); })) iss.push('no CROSS BREAK note');
      return iss;
    }
    var DWGTYPE = { LINE: 19, CIRCLE: 18, ARC: 17, LWPOLYLINE: 77, TEXT: 1 };
    // the DWG's object types (rfOM's reader of the object map)
    function rfQOobjects(b) {
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
    // a STEP read back by Anvil: closed, its volume against the part's
    function rfQOstep(r, units) {
      var st = Exchange.exportSTEP(r.model, r.build), back = K.rebuild(Exchange.newPartFromImport(Exchange.importFile('rfQO.step', st, { units: units })));
      var ck = Evaluate.checkBody(back.body);
      return { st: st, open: ck.openEdges.length, nm: ck.nonManifoldEdges.length, rel: (K.massProps(K.meshFromBody(back.body), 1).volume - r.mp.volume) / r.mp.volume };
    }
    // the faces of a STEP whose inner bounds share a vertex with another bound of the same face
    function rfQOtouching(st) {
      var E = {};
      st.replace(/#(\d+)=([A-Z_]+)\(([^;]*)\);/g, function (m, id, t, a) { E[id] = { t: t, a: a }; return m; });
      function refs(id) { return (E[id].a.match(/#\d+/g) || []).map(function (x) { return x.slice(1); }); }
      var n = 0;
      Object.keys(E).forEach(function (id) {
        if (E[id].t !== 'ADVANCED_FACE') return;
        var bs = refs(id).filter(function (b) { return E[b] && /BOUND/.test(E[b].t); });
        if (bs.length < 2) return;
        var sets = bs.map(function (b) {
          var vs = {};
          refs(refs(b)[0]).forEach(function (oe) { var ec = refs(oe)[0]; if (E[ec] && E[ec].t === 'EDGE_CURVE') { var r2 = refs(ec); vs[r2[0]] = 1; vs[r2[1]] = 1; } });
          return vs;
        });
        for (var i = 0; i < sets.length; i++) for (var j = i + 1; j < sets.length; j++) if (Object.keys(sets[i]).some(function (v) { return sets[j][v]; })) { n++; return; }
      });
      return n;
    }
    // edges of no length: a LINE whose VECTOR has magnitude 0
    function rfQOzeroEdges(st) { return (st.match(/=VECTOR\('',#\d+,0\.\)/g) || []).length; }

    SAMPLE.forEach(function (c) {
      test('rfQO: corpus ' + c[0] + ': the flat as DXF R12, R2000 and R2000 entities: every loop closed and its area the kernel\'s to 1e-9 (arcs as arcs, round holes CIRCLEs), extents on the blank, layers as the README, a bend line and note per bend on metal, a note per forming-tool copy; R2000 to DWG with an object per entity; the STEP read back closed at the part\'s volume to 1e-8', function () {
        var r = build(c[1]); noErrors(r);
        var flat = K.flatPattern(r.model, r.build, r.mesh), units = r.model.units === 'in' ? 'in' : 'mm';
        var P = { units: units, flat: flat, cl: K.sheetCutList(r.model, r.build, r.mesh, flat).values, kl: rfQOkloops(flat), opts: c[2], forms: c[3],
          cross: (flat.etch || []).filter(function (it) { return it.crossBreak; }).length,
          formNotes: (flat.etch || []).filter(function (it) { return it.form != null && it.kind === 'note'; }).map(function (it) { return rfQOtext(it.text); }) };
        assert(P.formNotes.length === c[3], P.formNotes.length + ' form copies in the flat for ' + c[3]);
        assert(P.cross === 2 * c[4], P.cross + ' cross-break lines for ' + c[4] + ' Cross-Breaks');
        flat.bends.forEach(function (bd, k) {
          [1e-4, 0.5, 1 - 1e-4].forEach(function (t) {
            var Q = [bd.a[0] + (bd.b[0] - bd.a[0]) * t, bd.a[1] + (bd.b[1] - bd.a[1]) * t];
            assert(rfQOinPoly(Q, flat.loops[0]) && !flat.loops.slice(1).some(function (h) { return rfQOinPoly(Q, h); }), 'bend ' + k + ' off the metal at ' + t);
          });
        });
        var out = [];
        [['R12', { version: 'R12' }], ['R2000', { version: 'R2000' }], ['R2000 entities', { version: 'R2000', style: 'entities' }]].forEach(function (f) {
          var text = K.exportDXFFlat(flat, units, Object.assign({}, c[2], f[1])), iss = rfQOcheck(text, P, f[1].version);
          assert(!iss.length, f[0] + ': ' + iss.slice(0, 4).join(' | '));
          if (f[0] === 'R2000') {
            var objs = rfQOobjects(DWG.fromDXF(text)), cnt = {};
            DxfCheck.parse(text).entities.forEach(function (e) { cnt[e.type] = (cnt[e.type] || 0) + 1; });
            Object.keys(cnt).forEach(function (t) { if (DWGTYPE[t]) assert(objs.filter(function (o) { return o.type === DWGTYPE[t]; }).length >= cnt[t], 'DWG: ' + t + ' objects for ' + cnt[t]); });
          }
          out.push(f[0]);
        });
        var s = rfQOstep(r, units);
        assert(!s.open && !s.nm, 'STEP read back: ' + s.open + ' open, ' + s.nm + ' non-manifold');
        assert(Math.abs(s.rel) < 1e-8, 'STEP read back volume ' + s.rel.toExponential(2));
        return flat.loops.length + ' loops, ' + flat.bends.length + ' bends; STEP ' + s.rel.toExponential(1);
      });
    });

    // ---- the STEP defects, each pinned (OpenCascade's verdicts are in the report)
    function rfQOtray(u, T, R, ang, pos, relief) {
      var S = u === 'in' ? 1 : 25.4, n = function (x) { return +(x * S).toFixed(6); };
      return 'p.units("' + u + '");\np.sheet(' + T + ', ' + R + ', 0.44);\np.sketch("Top").rect(0, ' + n(-6) + ', ' + n(8) + ', ' + n(6) + ').end().baseFlange();\n' +
        [[4, 0], [4, 6], [0, 3], [8, 3]].map(function (e) { return 'p.flange(' + n(1) + ', [[' + n(e[0]) + ', ' + T + ', ' + n(e[1]) + ']], { angle: ' + ang + ', position: "' + pos + '"' + (relief ? ', relief: "' + relief + '"' : '') + ' });\n'; }).join('');
    }
    test('rfQO: STEP of a 16 ga tray with four Bend Outside flanges at 120 degrees (obround reliefs): each wall face meets its corner pieces at two points; written as one face with two holes touching its outer loop, Anvil read it back with 6 edges shared by four faces: now each piece is its own face (no hole touches its outer loop), and the file as it was written before still reads back closed (the reader joins a touching hole at its vertex), both at the volume to 1e-8', function () {
      var r = build(rfQOtray('in', 0.0598, 0.06, 120, 'bendOutside', 'obround')); noErrors(r);
      var s = rfQOstep(r, 'in');
      assert(!s.open && !s.nm, 'read back: ' + s.open + ' open, ' + s.nm + ' non-manifold');
      assert(Math.abs(s.rel) < 1e-8, 'volume ' + s.rel.toExponential(2));
      assert(rfQOtouching(s.st) === 0, rfQOtouching(s.st) + ' faces with a hole touching another bound');
      var old;
      Exchange.pinchSplit.retrace = false;
      try { old = rfQOstep(r, 'in'); } finally { Exchange.pinchSplit.retrace = true; }
      assert(rfQOtouching(old.st) > 0, 'the old writing has holes touching their outer loop');
      assert(!old.open && !old.nm && Math.abs(old.rel) < 1e-8, 'the old file read back: ' + old.open + ' open, ' + old.nm + ' non-manifold, ' + old.rel.toExponential(2));
      return 'faces ' + (s.st.match(/=ADVANCED_FACE\(/g) || []).length + ' (were ' + (old.st.match(/=ADVANCED_FACE\(/g) || []).length + ')';
    });
    test('rfQO: STEP of trays past 90 degrees (Material Inside 135 and 100, Material Outside 120, 20 / 16 / 11 ga): a wall\'s end face has a notch written as a hole touching its outer loop at one vertex; Anvil read it back with 1 open and 3 edges shared by three or four faces (a bridge from the hole\'s far point folded the face): now closed at the volume to 1e-8', function () {
      var out = [];
      [['in', 0.0359, 0.03, 120, 'outside'], ['in', 0.1196, 0.12, 135, 'inside'], ['mm', 0.9, 0.8, 135, 'inside'], ['in', 0.0598, 0.06, 100, 'inside']].forEach(function (q) {
        var r = build(rfQOtray(q[0], q[1], q[2], q[3], q[4])); noErrors(r);
        var s = rfQOstep(r, q[0]);
        assert(!s.open && !s.nm, q.join(' ') + ': ' + s.open + ' open, ' + s.nm + ' non-manifold');
        assert(Math.abs(s.rel) < 1e-8, q.join(' ') + ': volume ' + s.rel.toExponential(2));
        out.push(q[3] + ' ' + q[4] + ' ' + s.rel.toExponential(1));
      });
      return out.join(', ');
    });
    test('rfQO: STEP of a 16 ga (1.5 mm) tray with Material Outside flanges at 120 degrees in mm: the bend end\'s corner .016 mm from the bend\'s start was snapped onto it and written as a second vertex with an edge of no length between them (OpenCascade read 7 shells and no solid); now one vertex and no such edge, read back closed at the volume to 1e-8', function () {
      var r = build(rfQOtray('mm', 1.5, 1.5, 120, 'outside')); noErrors(r);
      var s = rfQOstep(r, 'mm');
      assert(rfQOzeroEdges(s.st) === 0, rfQOzeroEdges(s.st) + ' edges of no length');
      var pts = {}, dup = 0;
      (s.st.match(/=VERTEX_POINT\('',#\d+\)/g) || []).forEach(function (vp) {
        var id = vp.match(/#(\d+)/)[1], m = new RegExp('#' + id + '=CARTESIAN_POINT\\(\'\',\\(([^)]*)\\)').exec(s.st), k = m && m[1];
        if (pts[k]) dup++; pts[k] = 1;
      });
      assert(dup === 0, dup + ' vertices at the place of another');
      assert(!s.open && !s.nm, s.open + ' open, ' + s.nm + ' non-manifold');
      assert(Math.abs(s.rel) < 1e-8, 'volume ' + s.rel.toExponential(2));
    });
  })();
