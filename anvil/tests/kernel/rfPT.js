  // --- rfPT (2026-11-18, lane tabslot) --- (1) an Edge Flange on part of its edge, as SolidWorks' Edit Flange Profile
  // makes it: the profile's sides set back from the edge's ends (startOffset / endOffset, kernel miterOffsetEnds; the
  // sheet past each side keeps its edge and takes the flange's relief), on a 6 x 4 sheet (T = R = 0.1, K 0.5, so the
  // folded volume is T x the blank exactly). Closed forms: BA = pi/2 (R + K T); the flat wall = L - (R + T) (Outer
  // Virtual Sharp); Bend Outside starts the bend on the edge, Material Inside R + T back. (2) Tab and Slot below.
  (function () {
    var T = 0.1, R = 0.1, BA = Math.PI / 2 * (R + 0.5 * T), WALL = 1 - (R + T);
    var BASE = 'p.units("in");\np.sheet(0.1, 0.1, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n';
    function rfPTflat(code) {
      var r = build(code);
      r.flat = Object.keys(r.errors).length ? null : K.flatPattern(r.model, r.build, r.mesh);
      return r;
    }
    function rfPTarea(loop) { var a = 0; for (var i = 0; i < loop.length; i++) { var p = loop[i], q = loop[(i + 1) % loop.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
    function rfPTblank(fl) { return fl.loops.reduce(function (s, l) { return s + rfPTarea(l.pts || l); }, 0); }
    function rfPTdxfCount(flat, layer, kind) {
      var L = K.exportDXFFlat(flat, 'in').replace(/\r\n/g, '\n').split('\n'), n = 0, ent = null;
      for (var i = 0; i + 1 < L.length; i += 2) {
        var code = L[i].trim(), val = L[i + 1].trim();
        if (code === '0') ent = val;
        else if (code === '8' && (!kind || ent === kind) && val === layer) n++;
      }
      return n;
    }

    test('rfPT: Edge-Flange 2 in long centred on a 6 in edge (Bend Outside, 1 in to the outer sharp, Rectangle relief): blank 6 x (4 + BA + 0.8), one 2 in bend line, a T x T/2 relief at each end, folded = T x blank', function () {
      var r = rfPTflat(BASE + 'p.flange(1, [[3, 0.1, 0]], { lengthRef: "outer", relief: "rect", startOffset: 2, endOffset: 2 });');
      noErrors(r);
      var area = 24 - 2 * T * (T / 2) + 2 * (BA + WALL);
      nearRel(r.mp.volume, T * area, 1e-9, 'folded volume = T x blank');
      near(rfPTblank(r.flat), Math.abs(area) * Math.sign(rfPTblank(r.flat)), 1e-9, 'blank area');
      near(r.flat.size[0], 6, 1e-9, 'blank x'); near(r.flat.size[1], 4 + BA + WALL, 1e-9, 'blank y');
      assert(r.flat.loops.length === 1 && (r.flat.loops[0].pts || r.flat.loops[0]).length === 12, 'one outline of 12 corners (two relief notches): ' + r.flat.loops.map(function (l) { return (l.pts || l).length; }));
      assert(r.flat.bends.length === 1, r.flat.bends.length + ' bends');
      var b = r.flat.bends[0], xs = [b.a[0], b.b[0]].sort(function (p, q) { return p - q; });
      near(xs[0], 2, 1e-9, 'bend line starts 2 in from the edge\'s start'); near(xs[1], 4, 1e-9, 'and ends 2 in from its end');
      near(b.a[1], BA / 2, 1e-9, 'bend line BA/2 past the edge'); near(+b.angle, 90, 1e-9, 'angle');
      var rec = r.build.flanges[3][0];
      near(rec.len, 2, 1e-12, 'the record is 2 long');
      assert(rec.reliefs && rec.reliefs[0] && rec.reliefs[1], 'a relief at each end');
      near(rec.reliefs[0].w, T, 1e-12, 'relief width T'); near(rec.reliefs[0].d0, T / 2, 1e-12, 'relief depth T/2 into the sheet (Bend Outside)');
      var nb = rfPTdxfCount(r.flat, 'BEND', 'LINE');
      assert(nb === 1, nb + ' LINEs on BEND in the flat DXF');
      return 'volume ' + r.mp.volume.toFixed(6) + ', blank ' + r.flat.size.map(function (x) { return x.toFixed(4); }).join(' x ') + ', bend ' + xs.join('..');
    });

    test('rfPT: Edge-Flange set back 0.5 from each end of the 6 in edge (Material Inside): the sheet trimmed R + T over 5 in only, blank 6 x (4 + BA + 0.8 - (R + T)), folded = T x blank; equals the flange on the whole edge less 2 x 0.5 of flange plus the reliefs', function () {
      var r = rfPTflat(BASE + 'p.flange(1, [[3, 0.1, 0]], { position: "inside", lengthRef: "outer", relief: "rect", startOffset: 0.5, endOffset: 0.5 });');
      noErrors(r);
      var rec = r.build.flanges[3][0], d0 = rec.reliefs[0].d0;
      near(rec.len, 5, 1e-12, 'the record is 5 long');
      // d0: the relief's reach inside the bend start (the record; the notch runs from the edge, R + T + d0 deep)
      assert(d0 >= T / 2 - 1e-12 && rec.reliefs[1] && Math.abs(rec.reliefs[1].d0 - d0) < 1e-12, 'each relief reaches T/2 or more past the bend start (d0 ' + d0 + ')');
      var area = 24 - 5 * (R + T) - 2 * T * (R + T + d0) + 5 * (BA + WALL);
      nearRel(r.mp.volume, T * area, 1e-9, 'folded volume = T x blank');
      near(Math.abs(rfPTblank(r.flat)), area, 1e-9, 'blank area');
      near(r.flat.size[0], 6, 1e-9, 'blank x'); near(r.flat.size[1], 4 + BA + WALL - (R + T), 1e-9, 'blank y');
      var b = r.flat.bends[0], xs = [b.a[0], b.b[0]].sort(function (p, q) { return p - q; });
      near(xs[0], 0.5, 1e-9, 'bend from 0.5'); near(xs[1], 5.5, 1e-9, 'to 5.5');
      near(b.a[1], -(R + T) + BA / 2, 1e-9, 'bend line R + T in, plus BA/2');
      // the whole-edge flange, for comparison: the partial one has 2 x 0.5 less flange and keeps 2 x 0.5 x (R + T) of sheet
      var w = rfPTflat(BASE + 'p.flange(1, [[3, 0.1, 0]], { position: "inside", lengthRef: "outer", relief: "rect" });');
      noErrors(w);
      nearRel(r.mp.volume - w.mp.volume, T * (-1 * (BA + WALL) + 1 * (R + T) - 2 * T * (R + T + d0)), 1e-9, 'partial - whole');
      return 'volume ' + r.mp.volume.toFixed(6) + ' (whole edge ' + w.mp.volume.toFixed(6) + '), relief d0 ' + d0.toFixed(4);
    });

    test('rfPT: a partial Edge-Flange writes startOffset / endOffset in the script and builds the same part back; offsets longer than the edge or negative are refused with the reason', function () {
      var a = rfPTflat(BASE + 'p.flange(1, [[3, 0.1, 0]], { lengthRef: "outer", relief: "rect", startOffset: 1.25, endOffset: 3, startPoint: [0, 0.1, 0] });');
      noErrors(a);
      var sc = K.generateScript(a.model), line = sc.split('\n').filter(function (l) { return /p\.flange\(/.test(l); })[0] || '';
      assert(/startOffset: 1\.25/.test(line) && /endOffset: 3\b/.test(line) && /startPoint: \[0, ?0\.1, ?0\]/.test(line), 'written: ' + line);
      var b = rfPTflat(sc);
      noErrors(b);
      nearRel(b.mp.volume, a.mp.volume, 1e-12, 'round trip volume');
      near(b.flat.size[1], a.flat.size[1], 1e-12, 'round trip blank');
      var bx = b.flat.bends[0], xs = [bx.a[0], bx.b[0]].sort(function (p, q) { return p - q; });
      near(xs[0], 1.25, 1e-9, 'from the start (x = 0, startPoint)'); near(xs[1], 3, 1e-9, 'to 6 - 3');
      // startPoint at the other end: the same offsets count from x = 6
      var e = rfPTflat(BASE + 'p.flange(1, [[3, 0.1, 0]], { lengthRef: "outer", relief: "rect", startOffset: 1.25, endOffset: 3, startPoint: [6, 0.1, 0] });');
      var ex = [e.flat.bends[0].a[0], e.flat.bends[0].b[0]].sort(function (p, q) { return p - q; });
      near(ex[0], 3, 1e-9, 'startPoint x = 6: from 3'); near(ex[1], 4.75, 1e-9, 'to 6 - 1.25');
      var c = build(BASE + 'p.flange(1, [[3, 0.1, 0]], { lengthRef: "outer", startOffset: 3, endOffset: 3 });');
      assert(/longer than the edge/.test(c.errors[3] || ''), 'too long: ' + c.errors[3]);
      var d = build(BASE + 'p.flange(1, [[3, 0.1, 0]], { lengthRef: "outer", startOffset: -1 });');
      assert(/zero or more/.test(d.errors[3] || ''), 'negative: ' + d.errors[3]);
      var plain = K.generateScript(build(BASE + 'p.flange(1, [[3, 0.1, 0]], { lengthRef: "outer" });').model);
      assert(!/Offset/.test(plain.split('\n').filter(function (l) { return /p\.flange\(/.test(l); })[0]), 'no offsets written for a whole-edge flange');
      return line.trim().slice(0, 140);
    });
  })();

  // (2) Tab and Slot (SolidWorks 2017+): tabs on a straight edge of one body through slots cut in the face of the other
  // body it rests on (kernel-sheetmetal.js tabSlotLayout; built between two bodies, the second made with Merge result
  // off). Bodies' volumes against closed forms, the flat pattern (slots as holes, tabs on the outline) and its DXF.
  (function () {
    var T = 0.1, R = 0.1, BA = Math.PI / 2 * (R + 0.5 * T);
    var SHEET = 'p.units("in");\np.sheet(0.1, 0.1, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n';
    var PLATE = 'p.sketch("Front", 2).rect(1, 0.1, 4, 2).end().extrude(0.1, { merge: false });\n';
    function rfPTts(code) {
      var r = build(code);
      r.flat = Object.keys(r.errors).length ? null : K.flatPattern(r.model, r.build, r.mesh);
      r.vols = r.build.bodies.map(function (b) { return K.massProps(K.meshFromBody(b), 1).volume; });
      return r;
    }
    function rfPTdxf(flat) {
      var L = K.exportDXFFlat(flat, 'in').replace(/\r\n/g, '\n').split('\n'), cnt = {}, ent = null;
      for (var i = 0; i + 1 < L.length; i += 2) { var c = L[i].trim(), v = L[i + 1].trim(); if (c === '0') ent = v; else if (c === '8') cnt[ent + '@' + v] = (cnt[ent + '@' + v] || 0) + 1; }
      return cnt;
    }
    function rfPTbox(l) { var xs = l.map(function (p) { return p[0]; }), ys = l.map(function (p) { return p[1]; }); return [Math.min.apply(null, xs), Math.max.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, ys)]; }

    test('rfPT: Tab and Slot, a 4 x 2 plate standing on the 6 x 4 sheet: 3 tabs 0.5 long (equal spacing) through 0.52 x 0.11 slots (clearance .01 / .005); sheet and plate volumes exact; the flat has the 3 slots as holes and its DXF 3 HOLES polylines; the script builds it back', function () {
      var r = rfPTts(SHEET + PLATE + 'p.tabSlot([[3, 0.1, 2]], { count: 3, tabLength: 0.5, slotLengthOffset: 0.01, slotWidthOffset: 0.005 });');
      noErrors(r);
      assert(r.vols.length === 2, r.vols.length + ' bodies');
      near(r.vols[0], 2.4 - 3 * 0.52 * 0.11 * T, 1e-9, 'sheet less 3 slots through T');
      near(r.vols[1], 0.8 + 3 * 0.5 * T * 0.1, 1e-9, 'plate plus 3 tabs, flush through the sheet (T x T x 0.5)');
      var holes = r.flat.loops.slice(1).map(function (l) { return rfPTbox(l.pts || l); }).sort(function (p, q) { return p[0] - q[0]; });
      assert(r.flat.loops.length === 4, r.flat.loops.length + ' loops');
      near(r.flat.size[0], 6, 1e-9, 'blank 6'); near(r.flat.size[1], 4, 1e-9, 'x 4');
      var cx = holes.map(function (h) { return (h[0] + h[1]) / 2; });
      near(cx[0], 1 + 4 / 6, 1e-9, 'slot 1 centred in its third of the plate\'s edge'); near(cx[1], 3, 1e-9, 'slot 2'); near(cx[2], 5 - 4 / 6, 1e-9, 'slot 3');
      holes.forEach(function (h) { near(h[1] - h[0], 0.52, 1e-9, 'slot length'); near(h[3] - h[2], 0.11, 1e-9, 'slot width'); });
      var d = rfPTdxf(r.flat);
      assert(d['POLYLINE@HOLES'] === 3 && d['POLYLINE@OUTLINE'] === 1, 'DXF: ' + JSON.stringify(d));
      var sc = K.generateScript(r.model), line = sc.split('\n').filter(function (l) { return /p\.tabSlot\(/.test(l); })[0] || '';
      assert(/count: 3/.test(line) && /tabLength: 0\.5/.test(line) && /slotLengthOffset: 0\.01/.test(line) && /slotWidthOffset: 0\.005/.test(line), 'written: ' + line);
      var b = rfPTts(sc);
      noErrors(b);
      near(b.vols[0], r.vols[0], 1e-12, 'round trip sheet'); near(b.vols[1], r.vols[1], 1e-12, 'round trip plate');
      return 'sheet ' + r.vols[0].toFixed(6) + ', plate ' + r.vols[1].toFixed(6) + ', slots at ' + cx.map(function (x) { return x.toFixed(4); }).join(', ');
    });

    test('rfPT: Tab and Slot from the sheet-metal flange into a 0.25 lid laid on it: 2 tabs 1 long on the 6 in wall\'s top edge through filleted slots (R .05); the flat\'s outline carries the 2 tabs 0.25 past the wall, one bend line; volumes exact (the lid\'s slot corners on 8 chords)', function () {
      var r = rfPTts(SHEET + 'p.flange(2, [[3, 0.1, 0]], { position: "inside", lengthRef: "outer" });\np.sketch("Top", 2).rect(-0.5, -4.5, 7, 5).end().extrude(0.25, { merge: false });\n' +
        'p.tabSlot([[3, 2, 0]], { count: 2, tabLength: 1, slotLengthOffset: 0.01, slotWidthOffset: 0.01, slotCorner: "fillet", slotCornerSize: 0.05 });');
      noErrors(r);
      var flat = 2 - (R + T), blank = 6 * (4 - (R + T) + BA + flat);
      near(r.vols[0], T * (blank + 2 * 1 * 0.25), 1e-9, 'sheet: T x blank plus 2 tabs 1 x 0.25 x T');
      var rr = 0.05, n = 8, slot = 1.02 * 0.12 - 4 * (rr * rr - n / 2 * rr * rr * Math.sin(Math.PI / (2 * n)));
      near(r.vols[1], 0.25 * (7 * 5 - 2 * slot), 1e-9, 'lid less 2 rounded slots');
      assert(r.flat.loops.length === 1 && (r.flat.loops[0].pts || r.flat.loops[0]).length === 12, 'one outline of 12 corners (2 tabs): ' + r.flat.loops.map(function (l) { return (l.pts || l).length; }));
      near(r.flat.size[1], 4 - (R + T) + BA + flat + 0.25, 1e-9, 'blank length with the tabs');
      assert(r.flat.bends.length === 1, r.flat.bends.length + ' bends');
      var d = rfPTdxf(r.flat);
      assert(d['VERTEX@OUTLINE'] === 12 && d['LINE@BEND'] === 1, 'DXF: ' + JSON.stringify(d));
      return 'sheet ' + r.vols[0].toFixed(6) + ', lid ' + r.vols[1].toFixed(6) + ', blank ' + r.flat.size.map(function (x) { return x.toFixed(4); }).join(' x ');
    });

    test('rfPT: Tab and Slot by spacing (pitch 1.5: 3 tabs 0.5 long on the 4 in edge, the group centred), chamfered tabs 0.2 tall (through and 0.1 past the sheet), start offset from the edge\'s x = 1 end; refusals: one body, tabs that do not fit, an edge on no other body', function () {
      var r = rfPTts(SHEET + PLATE + 'p.tabSlot([[3, 0.1, 2]], { spacing: "distance", pitch: 1.5, tabLength: 0.5, tabHeight: 0.2, tabEdge: "chamfer", tabEdgeSize: 0.02 });');
      noErrors(r);
      var pre = build(SHEET + PLATE), f = r.model.features[r.model.features.length - 1];
      var lay = K.tabSlotLayout(f, r.model, pre.build.bodies), c = lay.info[0].centres;
      near(lay.info[0].len, 4, 1e-12, 'edge 4'); near(lay.info[0].thickness, 0.1, 1e-12, 'plate T'); near(lay.info[0].slotDepth, T, 1e-12, 'sheet T');
      assert(c.length === 3, c.length + ' tabs');
      near(c[0], 0.5, 1e-12, 'first centre (4 - 3)/2'); near(c[1], 2, 1e-12, 'pitch'); near(c[2], 3.5, 1e-12, 'pitch');
      near(r.vols[1], 0.8 + 3 * (0.5 * 0.2 - 0.02 * 0.02) * 0.1, 1e-9, 'plate plus 3 chamfered tabs 0.2 tall');
      near(r.vols[0], 2.4 - 3 * 0.5 * 0.1 * T, 1e-9, 'sheet less 3 slots with no clearance');
      var s = rfPTts(SHEET + PLATE + 'p.tabSlot([[3, 0.1, 2]], { count: 1, tabLength: 0.5, startOffset: 1, startPoint: [1, 0.1, 2] });');
      noErrors(s);
      var sl = K.tabSlotLayout(s.model.features[s.model.features.length - 1], s.model, pre.build.bodies).info[0];
      near(sl.a[0], 1, 1e-12, 'the run starts at x = 1 (startPoint)'); near(sl.centres[0], 1 + 3 / 2, 1e-12, 'one tab centred in the 3 in run');
      var one = build(SHEET + 'p.tabSlot([[3, 0.1, 0]], { count: 1, tabLength: 0.5 });');
      assert(/needs two bodies/.test(one.errors[3] || ''), 'one body: ' + one.errors[3]);
      var many = build(SHEET + PLATE + 'p.tabSlot([[3, 0.1, 2]], { count: 9, tabLength: 0.5 });');
      assert(/do not fit/.test(many.errors[5] || ''), 'too many: ' + many.errors[5]);
      var up = build(SHEET + PLATE + 'p.tabSlot([[3, 2.1, 2]], { count: 2, tabLength: 0.5 });');
      assert(/does not rest on a face of another body/.test(up.errors[5] || ''), 'top edge: ' + up.errors[5]);
      return 'centres ' + c.join(', ') + '; plate ' + r.vols[1].toFixed(6);
    });
  })();
