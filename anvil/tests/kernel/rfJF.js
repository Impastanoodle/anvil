  // --- rfJF (2026-11-05, lane dxfout: the flat DXF / DWG export entities SolidWorks' DXF/DWG Output offers and Anvil
  // lacked, test-reports/2026-11-05-sheetmetal-pm-audit.md *DXF/DWG Output*): exportDXFFlat's boundaryBox (BOUNDARY),
  // bendLayers 'split' (BEND_UP / BEND_DOWN), reliefLayer (bend-relief notch edges on RELIEF, bend.reliefs) and
  // hiddenEdges (Forming Tools' far-side outlines on HIDDEN, line type HIDDEN). Every option is off by default and the
  // default file is unchanged. 16 ga, T = R = .0598, K .5, inches.
  (function () {
    group('rfJF: flat DXF boundary box, BEND_UP / BEND_DOWN, corner reliefs on RELIEF, forming tools\' hidden edges');
    var T = 0.0598, R = 0.0598;
    var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n';
    // the p9-sheet channel: both long edges 1.5 Material Inside, a 1.0 end flange with a relief at both ends
    function rfJFChannel(relief, endReverse) {
      return HEAD + 'p.flange(1.5, [[3, ' + T + ', 0], [3, ' + T + ', 4]], { position: "inside" });\np.flange(1, [[0, ' + T + ', 2]], { position: "inside"' +
        (relief ? ', relief: "' + relief + '"' : '') + (endReverse ? ', reverse: true' : '') + ' });';
    }
    function rfJFFlat(code) { var r = build(code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function rfJFEnts(dxf) { return DxfCheck.parse(dxf).entities; }
    function rfJFOn(ents, layer, type) { return ents.filter(function (e) { return e.layer === layer && (!type || e.type === type); }); }
    function rfJFLayers(dxf) { var out = {}; rfJFEnts(dxf).forEach(function (e) { out[e.layer] = (out[e.layer] || 0) + 1; }); return out; }
    function rfJFCheck(dxf, layers, tag) {
      var c = DxfCheck.check(dxf, { units: 'in', layers: layers || ['OUTLINE', 'HOLES'] });
      assert(c.ok, tag + ': ' + c.errors.join('; '));
      return c;
    }

    test('rfJF: Boundary box: a closed rectangle on BOUNDARY with the blank\'s box as corners (R12 / R2000, polyline / entities); off by default', function () {
      if (typeof DxfCheck === 'undefined') fail('DxfCheck is undefined');
      var r = rfJFFlat(rfJFChannel('rect')), W = r.flat.size[0], H = r.flat.size[1];
      var plain = K.exportDXFFlat(r.flat, 'in');
      assert(!rfJFLayers(plain).BOUNDARY && plain.indexOf('\nBOUNDARY\n') < 0, 'no BOUNDARY layer by default');
      ['R12', 'R2000'].forEach(function (ver) {
        var dxf = K.exportDXFFlat(r.flat, 'in', { version: ver, boundaryBox: true }), ents = rfJFEnts(dxf), b = rfJFOn(ents, 'BOUNDARY');
        assert(b.length === 1 && b[0].closed && b[0].pts.length === 4, ver + ': one closed 4-point polyline, got ' + JSON.stringify(b.map(function (e) { return e.type; })));
        [[0, 0], [W, 0], [W, H], [0, H]].forEach(function (q, i) { near(b[0].pts[i][0], q[0], 1e-9, ver + ' corner ' + i + ' x'); near(b[0].pts[i][1], q[1], 1e-9, ver + ' corner ' + i + ' y'); });
        rfJFCheck(dxf, null, ver);
        var en = rfJFEnts(K.exportDXFFlat(r.flat, 'in', { version: ver, style: 'entities', boundaryBox: true })), bl = rfJFOn(en, 'BOUNDARY', 'LINE');
        assert(bl.length === 4, ver + ' entities: 4 LINEs, got ' + bl.length);
        var xs = [], ys = [];
        bl.forEach(function (e) { xs.push(e.a[0], e.b[0]); ys.push(e.a[1], e.b[1]); });
        near(Math.min.apply(null, xs), 0, 1e-12, 'min x'); near(Math.max.apply(null, xs), W, 1e-9, 'max x');
        near(Math.min.apply(null, ys), 0, 1e-12, 'min y'); near(Math.max.apply(null, ys), H, 1e-9, 'max y');
      });
      // a blank with rounded corners: the box is the arcs' extents (the Inch Bracket's R.25 corners)
      var ib = rfJFFlat('p.units("in");\np.sheet(0.06, 0.06, 0.71);\np.sketch("Top").line(0, 0, 5.75, 0).arc(5.75, -0.25, 0.25, 0, 90).line(6, -0.25, 6, -2.75)' +
        '.arc(5.75, -2.75, 0.25, 270, 360).line(5.75, -3, 0, -3).line(0, -3, 0, 0).end().baseFlange(0.06);\n');
      var bb = rfJFOn(rfJFEnts(K.exportDXFFlat(ib.flat, 'in', { boundaryBox: true })), 'BOUNDARY')[0];
      near(bb.pts[2][0], 6, 1e-9, 'rounded blank: box width 6'); near(bb.pts[2][1], 3, 1e-9, 'rounded blank: box height 3');
      return 'box ' + fmt(W) + ' × ' + fmt(H);
    });

    test('rfJF: Bend lines on separate BEND_UP / BEND_DOWN layers by each bend\'s direction; the default keeps one BEND layer', function () {
      var r = rfJFFlat(rfJFChannel(null, true)), up = r.flat.bends.filter(function (b) { return b.up; }).length, dn = r.flat.bends.length - up;
      assert(r.flat.bends.length === 3 && up > 0 && dn > 0, 'channel with a reversed end flange: up and down bends, got ' + up + ' up / ' + dn + ' down');
      var one = rfJFLayers(K.exportDXFFlat(r.flat, 'in'));
      assert(one.BEND === 3 && !one.BEND_UP && !one.BEND_DOWN, 'default: 3 lines on BEND ' + JSON.stringify(one));
      ['R12', 'R2000'].forEach(function (ver) {
        var dxf = K.exportDXFFlat(r.flat, 'in', { version: ver, bendLayers: 'split' }), L = rfJFLayers(dxf);
        assert(!L.BEND && L.BEND_UP === up && L.BEND_DOWN === dn, ver + ': ' + JSON.stringify(L));
        rfJFCheck(dxf, null, ver);
        // the lines are the flat's bend lines, the up ones on BEND_UP
        var ents = rfJFEnts(dxf), sx = -r.flat.bbox.min[0], sy = -r.flat.bbox.min[1];
        r.flat.bends.forEach(function (b) {
          var on = rfJFOn(ents, b.up ? 'BEND_UP' : 'BEND_DOWN', 'LINE').some(function (e) { return Math.hypot(e.a[0] - b.a[0] - sx, e.a[1] - b.a[1] - sy) < 1e-9 && Math.hypot(e.b[0] - b.b[0] - sx, e.b[1] - b.b[1] - sy) < 1e-9; });
          assert(on, ver + ': bend ' + b.label + ' on its layer');
        });
      });
      assert(!rfJFLayers(K.exportDXFFlat(r.flat, 'in', { bendLayers: 'split', bendLines: false })).BEND_UP, 'Bend lines off: none on either layer');
      return up + ' up, ' + dn + ' down';
    });

    test('rfJF: Corner reliefs: the end flange\'s two rectangular notches (3 edges each) on RELIEF, the rest of the blank on OUTLINE, still one closed contour; obround ends are RELIEF ARCs', function () {
      var r = rfJFFlat(rfJFChannel('rect'));
      assert(r.flat.bends.filter(function (b) { return b.reliefs && b.reliefs.length; }).length === 1, 'one bend carries its reliefs');
      var rb = r.flat.bends.filter(function (b) { return b.reliefs; })[0];
      assert(rb.reliefs.length === 2, 'two notches');
      // a notch in its bend line's frame: T along the line, its length across it
      var ys = rb.reliefs[0].map(function (q) { return q[1]; }), xs = rb.reliefs[0].map(function (q) { return q[0]; });
      var nLen = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      near(Math.max.apply(null, xs) - Math.min.apply(null, xs), T, 1e-12, 'notch width T along the bend line');
      assert(nLen > 4.5 * T, 'the notch runs past the bend zone: ' + nLen);
      var plain = K.exportDXFFlat(r.flat, 'in', { style: 'entities' });
      assert((plain.match(/\n0\nLINE\n8\nOUTLINE\n/g) || []).length === 12 && plain.indexOf('RELIEF') < 0, 'default unchanged: 12 OUTLINE lines');
      ['R12', 'R2000'].forEach(function (ver) {
        ['polyline', 'entities'].forEach(function (style) {
          var dxf = K.exportDXFFlat(r.flat, 'in', { version: ver, style: style, reliefLayer: true }), ents = rfJFEnts(dxf), tag = ver + '/' + style;
          var rl = rfJFOn(ents, 'RELIEF', 'LINE'), ol = rfJFOn(ents, 'OUTLINE', 'LINE');
          // each notch: its inner end (T wide), its side toward the corner (4.5T, to the side flange's edge) and its
          // side along the end flange's end, the notch's whole length (it runs on past the bend zone)
          var len = rl.reduce(function (s, e) { return s + Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]); }, 0);
          assert(rl.length === 6, tag + ': 6 RELIEF lines, got ' + rl.length);
          near(len, 2 * (T + 4.5 * T + nLen), 1e-9, tag + ': relief length 2 (T + 4.5T + notch length)');
          assert(ol.length >= 6, tag + ': the rest on OUTLINE (' + ol.length + ')');
          var c = rfJFCheck(dxf, ['OUTLINE', 'HOLES', 'RELIEF'], tag);
          assert(c.loops.length === 1 && c.loops[0].closed, tag + ': one closed contour across OUTLINE + RELIEF ' + JSON.stringify(c.loops));
        });
      });
      var ob = rfJFFlat(rfJFChannel('obround')), en = rfJFEnts(K.exportDXFFlat(ob.flat, 'in', { reliefLayer: true }));
      var arcs = rfJFOn(en, 'RELIEF', 'ARC');
      assert(arcs.length === 2, 'obround: 2 RELIEF arcs, got ' + arcs.length);
      arcs.forEach(function (a) { near(a.r, T / 2, 1e-6, 'obround end radius T/2'); });
      assert(!rfJFOn(en, 'OUTLINE', 'ARC').length, 'no arc left on OUTLINE');
      // with no relief on the part the option writes the usual closed polyline
      var none = rfJFFlat(rfJFChannel(null)), L = rfJFLayers(K.exportDXFFlat(none.flat, 'in', { reliefLayer: true }));
      assert(!L.RELIEF && L.OUTLINE === 1, 'no reliefs: one OUTLINE polyline ' + JSON.stringify(L));
      return 'notch ' + fmt(nLen) + ' long';
    });

    test('rfJF: Corner reliefs follow Flat-Pattern1\'s grain direction (the flat turned a quarter turn)', function () {
      var r = build(rfJFChannel('rect'));
      noErrors(r);
      r.model.flatGrain = { at: [3, T, 2], dir: [0, 0, 1] };
      var flat = K.flatPattern(r.model, r.build, r.mesh);
      var rl = rfJFOn(rfJFEnts(K.exportDXFFlat(flat, 'in', { style: 'entities', reliefLayer: true })), 'RELIEF', 'LINE');
      assert(rl.length === 6, 'turned flat: 6 RELIEF lines, got ' + rl.length);
      assert(flat.orient && Math.abs(Math.abs(flat.orient.rotation) - 90) < 1e-9, 'the flat turned a quarter turn: ' + JSON.stringify(flat.orient));
      var len = rl.reduce(function (s, e) { return s + Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]); }, 0);
      var r0 = rfJFFlat(rfJFChannel('rect')), rl0 = rfJFOn(rfJFEnts(K.exportDXFFlat(r0.flat, 'in', { style: 'entities', reliefLayer: true })), 'RELIEF', 'LINE');
      near(len, rl0.reduce(function (s, e) { return s + Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]); }, 0), 1e-9, 'same relief length as unturned');
      return 'rotation ' + flat.orient.rotation + '°';
    });

    test('rfJF: Hidden edges: each Forming Tool\'s far-side outline on HIDDEN (line type HIDDEN): dimple Rb − T, sloped side Rb − T(1 − sin A)/cos A, extruded hole at its collar, lance ends T·tan(α/2) in, louver opening; off by default', function () {
      var B = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -6, 8, 6).end().baseFlange();\n';
      var r = rfJFFlat(B + 'p.formingTool("dimple", [1.5, ' + T + ', 1.5], { diameter: 0.5, height: 0.1, sideAngle: 0 });\n' +
        'p.formingTool("dimple", [1.5, ' + T + ', 4.5], { diameter: 0.75, height: 0.1, sideAngle: 20 });\n' +
        'p.formingTool("extrudedHole", [4, ' + T + ', 1.5]);\np.formingTool("lance", [4, ' + T + ', 4.5], { legAngle: 60 });\np.formingTool("louver", [6.5, ' + T + ', 3]);\n');
      var plain = K.exportDXFFlat(r.flat, 'in');
      assert(plain.indexOf('HIDDEN') < 0, 'no HIDDEN layer or line type by default');
      ['R12', 'R2000'].forEach(function (ver) {
        var dxf = K.exportDXFFlat(r.flat, 'in', { version: ver, hiddenEdges: true }), ents = rfJFEnts(dxf), hid = rfJFOn(ents, 'HIDDEN');
        rfJFCheck(dxf, null, ver);
        assert(/\n2\nHIDDEN\n70\n0\n3\nHidden/.test(dxf), ver + ': HIDDEN line type in LTYPE');
        assert(/\n2\nHIDDEN\n70\n0\n62\n8\n6\nHIDDEN\n/.test(dxf), ver + ': layer HIDDEN uses it');
        var circles = hid.filter(function (e) { return e.type === 'CIRCLE'; }).map(function (e) { return e.r; }).sort(function (a, b) { return a - b; });
        var A = 20 * Math.PI / 180, ehd = K.formingToolDefaults('extrudedHole', 'in');
        var want = [0.25 - T, 0.375 - T * (1 - Math.sin(A)) / Math.cos(A), ehd.holeDiameter / 2 + T + ehd.radius].sort(function (a, b) { return a - b; });
        assert(circles.length === 3, ver + ': 3 HIDDEN circles, got ' + circles.length);
        want.forEach(function (w, i) { near(circles[i], w, 1e-9, ver + ' circle ' + i); });
        var polys = hid.filter(function (e) { return e.type !== 'CIRCLE'; });
        assert(polys.length === 2 && polys.every(function (e) { return e.closed && e.pts.length === 4; }), ver + ': two closed rectangles (lance, louver)');
        var dims = polys.map(function (e) {
          var xs = e.pts.map(function (q) { return q[0]; }), ys = e.pts.map(function (q) { return q[1]; });
          var a = Math.max.apply(null, xs) - Math.min.apply(null, xs), b = Math.max.apply(null, ys) - Math.min.apply(null, ys);
          return [Math.max(a, b), Math.min(a, b)];
        }).sort(function (p, q) { return p[0] - q[0]; });
        var ld = K.formingToolDefaults('lance', 'in'), vd = K.formingToolDefaults('louver', 'in');
        var lance = [ld.length - 2 * T * Math.tan(30 * Math.PI / 180), ld.width], louver = [vd.length, vd.width];
        var exp = [lance, louver].sort(function (p, q) { return p[0] - q[0]; });
        exp.forEach(function (x, i) { near(dims[i][0], Math.max(x[0], x[1]), 1e-9, ver + ' rect ' + i + ' long'); near(dims[i][1], Math.min(x[0], x[1]), 1e-9, ver + ' rect ' + i + ' short'); });
      });
      // the FORM marks stay as they were
      var L0 = rfJFLayers(plain), L1 = rfJFLayers(K.exportDXFFlat(r.flat, 'in', { hiddenEdges: true }));
      assert(L0.FORM === L1.FORM && L1.HIDDEN === 5, 'FORM unchanged, 5 HIDDEN entities ' + JSON.stringify(L1));
      return JSON.stringify(L1);
    });

    test('rfJF: all four together on a part with reliefs, a reversed bend and a dimple: R2000 reads back, layer table lists them once each', function () {
      var r = rfJFFlat(rfJFChannel('rect', true) + '\np.formingTool("dimple", [3, ' + T + ', 2]);');
      var dxf = K.exportDXFFlat(r.flat, 'in', { version: 'R2000', boundaryBox: true, bendLayers: 'split', reliefLayer: true, hiddenEdges: true });
      rfJFCheck(dxf, ['OUTLINE', 'HOLES', 'RELIEF'], 'R2000');
      ['BOUNDARY', 'BEND_UP', 'BEND_DOWN', 'RELIEF', 'HIDDEN', 'FORM', 'NOTES'].forEach(function (n) {
        assert((dxf.match(new RegExp('\\n0\\nLAYER\\n5\\n[0-9A-F]+\\n330\\n2\\n100\\nAcDbSymbolTableRecord\\n100\\nAcDbLayerTableRecord\\n2\\n' + n + '\\n', 'g')) || []).length === 1, 'layer ' + n + ' once');
      });
      return JSON.stringify(rfJFLayers(dxf));
    });
  })();
