  // --- flat-hygiene: the flat pattern's loops go straight to the laser. Coplanar walls (the Tray's two back walls, one
  // mesh face) were unfolded by the first flange and then covered again by a stand-in rectangle for the second, which
  // hid that wall's holes and left a stray vertex 3.7e-4 off the mitre corner; the CSG region merge could split a
  // blank in two at a mitred corner. The merge is now 2D (mergeFlatRegions) and a last pass (Kernel.cleanFlatLoop)
  // drops duplicate, collinear and spike points. Etch marks sketched on the sheet go to flat.etch and the ETCH layer ---
  (function () {
    group('flat-hygiene: flat-pattern loops without stray vertices; ETCH marks on the flat and in its DXF');
    var TRAY = 'p.sheet(2, 2, 0.71);\np.sketch("Top").polyline([[0, 0], [120, 0], [120, -80], [90, -80], [90, -100], [30, -100], [30, -80], [0, -80]], true).end().baseFlange(2);\n' +
      'p.flange(15, [[0, 2, 40], [60, 2, 0], [120, 2, 40], [105, 2, 80], [15, 2, 80]], { miter: true, relief: "obround" });';
    var Ti = 0.0598, HEAD = 'p.units("in");\np.sheet(' + Ti + ', ' + Ti + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n';
    function flatOf(code) { var r = build(code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    // every problem a laser path must not have: consecutive duplicates (1e-9 of the blank's size), a point on the
    // straight line through its neighbours (collinear, or a spike going out and straight back), fewer than 3 points
    function loopIssues(loops) {
      var min = [Infinity, Infinity], max = [-Infinity, -Infinity], out = [];
      loops.forEach(function (l) { l.forEach(function (p) { min[0] = Math.min(min[0], p[0]); min[1] = Math.min(min[1], p[1]); max[0] = Math.max(max[0], p[0]); max[1] = Math.max(max[1], p[1]); }); });
      var tol = 1e-9 * Math.hypot(max[0] - min[0], max[1] - min[1]);
      loops.forEach(function (l, li) {
        var n = l.length;
        if (n < 3) out.push('loop ' + li + ': ' + n + ' points');
        for (var i = 0; i < n; i++) {
          var o = l[(i + n - 1) % n], p = l[i], q = l[(i + 1) % n], d1 = Math.hypot(p[0] - o[0], p[1] - o[1]), d2 = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (d2 <= tol) { out.push('loop ' + li + ' duplicate at ' + i); continue; }
          if (d1 <= tol) continue;
          var oq = Math.hypot(q[0] - o[0], q[1] - o[1]), off = oq > tol ? Math.abs((p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])) / oq : d1;
          var dt = ((p[0] - o[0]) * (q[0] - p[0]) + (p[1] - o[1]) * (q[1] - p[1])) / (d1 * d2);
          if (off <= 1e-7 * Math.hypot(max[0] - min[0], max[1] - min[1])) out.push('loop ' + li + (dt > 0 ? ' collinear' : ' spike') + ' at ' + i + ' ' + JSON.stringify(p));
          else if (dt < -0.9999) out.push('loop ' + li + ' spike at ' + i + ' ' + JSON.stringify(p));
        }
      });
      return out;
    }
    var CASES = {
      'base hole + two flanges': SHEET + '\np.hole("Top", 50, -30, 10, { offset: 2 });\np.flange(20, [[0, 2, 30]]);\np.flange(15, [[50, 2, 0]], { reverse: true });',
      'wall hole and slot': SHEET + '\np.flange(25, [[0, 2, 30]]);\np.sketch("Right", -30).circle(-30, 12, 3).slot(-50, 18, -40, 18, 3).cut(40);',
      'hole near the bend': SHEET + '\np.flange(20, [[0, 2, 30]]);\np.sketch("Top", 2).circle(5, -30, 3).cut("through", { reverse: true });',
      'Z bracket with wall holes': SHEET + '\np.flange(30, [[0, 2, 30]]);\np.flange(25, [[-3, 34, 30]]);\np.sketch("Right", -30).circle(-30, 15, 3).circle(-15, 15, 2).cut(40);',
      'inch channel: hem, relief, slot, wall holes': HEAD + 'p.flange(1.5, [[3, ' + Ti + ', 0], [3, ' + Ti + ', 4]], { position: "inside" });\np.hem(0.375, [[3, 1.6196, 4]], { gap: 0.0299 });\n' +
        'p.flange(1.0, [[0, ' + Ti + ', 2]], { position: "inside", relief: "rect" });\np.sketch("Top", ' + Ti + ').slot(2.25, -2, 3.75, -2, 0.375).circle(1, -1, 0.133).circle(5, -1, 0.133).cut("through", { reverse: true });\n' +
        'p.sketch("Front", 0).slot(1, 0.7, 2.5, 0.7, 0.25).circle(4.5, 0.75, 0.125).cut("through");',
      'sketched bend with holes': HEAD + 'p.sketch("Top", ' + Ti + ').circle(0.5, -2, 0.1).circle(5.5, -2, 0.1).cut("through", { reverse: true });\np.sketch("Top", ' + Ti + ').line(1.5, 0, 1.5, -4).line(4.5, -1, 4.5, -3).sketchedBend(90);',
      'mitred tray with wall holes': TRAY + '\np.sketch("Front", 0).circle(60, 10, 2).cut(10, { reverse: true });\np.sketch("Right", 0).circle(-40, 10, 2).slot(-20, 10, -30, 10, 2).cut(10, { reverse: true });\np.sketch("Front", 80).circle(15, 10, 2).circle(105, 10, 2).cut(10);'
    };
    (typeof AnvilExamples !== 'undefined' ? AnvilExamples : []).forEach(function (ex) { if (!isAsmExample(ex) && /baseFlange/.test(ex.code)) CASES['example ' + ex.name] = ex.code; });
    test('flat-hygiene: no duplicate, collinear or spike point in any loop of the flat of seven sheet parts and every sheet example; one blank loop each', function () {
      var det = [];
      Object.keys(CASES).forEach(function (name) {
        var r = flatOf(CASES[name]), iss = loopIssues(r.flat.loops);
        assert(!iss.length, name + ': ' + iss.slice(0, 4).join('; '));
        assert(r.flat.loops.filter(function (l) { return K.signedArea(l) > 0; }).length === 1 && K.signedArea(r.flat.loops[0]) > 0, name + ': one CCW blank, areas ' + r.flat.loops.map(function (l) { return fmt(K.signedArea(l)); }).join(', '));
        det.push(r.flat.loops.length);
      });
      return Object.keys(CASES).length + ' parts, loops ' + det.join(' ');
    });
    test('flat-hygiene: the Tray\'s back walls (one plane, two flanges): the blank has no stray vertex at the mitre (24 points, none 3.7e-4 off a corner) and a hole on each back wall reaches the flat', function () {
      var r = flatOf(TRAY), BA = K.bendAllowance(Math.PI / 2, 2, 2, 0.71), o = r.flat.loops[0];
      assert(o.length === 24, 'outline points ' + o.length + ' (25 with the stray vertex)');
      assert(!o.some(function (p) { return Math.abs(p[0] + 2) > 1e-9 && Math.abs(p[0] + 2) < 1e-3; }), 'no point a hair off x = −2: ' + JSON.stringify(o.filter(function (p) { return Math.abs(p[0] + 2) < 1e-3; })));
      var h = flatOf(TRAY + '\np.sketch("Front", 80).circle(15, 10, 2).circle(105, 10, 2).cut(10);');
      var holes = h.flat.loops.slice(1).filter(function (l) { return Math.abs(Math.abs(K.signedArea(l)) - polyCircleArea(2)) < 1e-6 * polyCircleArea(2); });
      var cs = holes.map(function (l) { return l.reduce(function (s, p) { return [s[0] + p[0] / l.length, s[1] + p[1] / l.length]; }, [0, 0]); }).sort(function (a, b) { return a[0] - b[0]; });
      assert(cs.length === 2, 'two back-wall holes, got ' + cs.length);
      near(cs[0][0], 15, 1e-6, 'left back hole x'); near(cs[1][0], 105, 1e-6, 'right back hole x');
      // 10 up the wall from the base's top (y = 2), the wall's inner face starting R above it: 80 + BA + (10 − 4) out
      near(cs[0][1], -(80 + BA + 6), 1e-6, 'left back hole v'); near(cs[1][1], cs[0][1], 1e-9, 'both on one line');
      nearRel(K.signedArea(h.flat.loops[0]), K.signedArea(o), 1e-9, 'same blank');
      return 'outline ' + o.length + ' points, back holes at v = ' + fmt(cs[0][1]);
    });
    test('flat-hygiene: a hole on the Tray\'s left wall used to split the CSG-merged blank in two at the mitred corner; the 2D merge gives one blank, the same as the CSG merge wherever that one held', function () {
      var r = flatOf(TRAY + '\np.sketch("Right", 0).circle(-40, 10, 2).cut(10, { reverse: true });'), plain = flatOf(TRAY);
      assert(r.flat.loops.filter(function (l) { return K.signedArea(l) > 0; }).length === 1, 'one blank: ' + r.flat.loops.map(function (l) { return fmt(K.signedArea(l)); }).join(', '));
      nearRel(K.signedArea(r.flat.loops[0]), K.signedArea(plain.flat.loops[0]), 1e-9, 'blank area as without the hole');
      ['base hole + two flanges', 'wall hole and slot', 'inch channel: hem, relief, slot, wall holes'].forEach(function (name) {
        var q = flatOf(CASES[name]), keep = K.flatOptions.merge, c;
        K.flatOptions.merge = 'csg';
        try { c = K.flatPattern(q.model, q.build, q.mesh); } finally { K.flatOptions.merge = keep; }
        assert(c.loops.length === q.flat.loops.length, name + ': loops ' + q.flat.loops.length + ' vs CSG ' + c.loops.length);
        q.flat.loops.forEach(function (l, i) { nearRel(K.signedArea(l), K.signedArea(c.loops[i]), 1e-9, name + ' loop ' + i + ' area'); assert(l.length === c.loops[i].length, name + ' loop ' + i + ' points ' + l.length + ' vs ' + c.loops[i].length); });
      });
      var junk = K.cleanFlatLoop([[0, 0], [5, 0], [10, 0], [10, 0], [10, 5], [10, 8], [10, 3], [10, 10], [0, 10]], 1e-9);
      assert(JSON.stringify(junk) === JSON.stringify([[0, 0], [10, 0], [10, 10], [0, 10]]), 'cleanFlatLoop: collinear, duplicate and spike points go: ' + JSON.stringify(junk));
      return 'blank ' + fmt(K.signedArea(r.flat.loops[0]));
    });
    // a part with marks on the base's top face, its bottom face (a frame looking up: the marks come out mirrored) and
    // the left flange's inner wall face; a BEND line and a construction ETCH line that must stay out
    var LAY = '.layers([{ name: "ETCH", color: "#1e9e3c", aci: 3, noProfile: true }, { name: "BEND", color: "#c77700", aci: 30, noProfile: true, lineType: "dashed" }])';
    var ETCH_PART = SHEET + '\np.flange(20, [[0, 2, 30]]);\n' +
      'p.sketch("Top", 2).text(50, -30, "PN 123", { h: 5 }).line(60, -10, 90, -10).line(60, -50, 90, -50).line(60, -20, 90, -20)' + LAY + '.layer("ETCH", [1, 3]).layer("BEND", [2]).end();\n' +
      'p.sketch({ custom: true, origin: [0, 0, 0], x: [1, 0, 0], y: [0, 0, 1], n: [0, -1, 0] }).text(20, 30, "PN 123", { h: 4 }).line(10, 10, 30, 10).arc(20, 20, 3, 0, 90)' + LAY + '.layer("ETCH", [1, 2]).end();\n' +
      'p.sketch("Right", -2).text(-30, 10, "PN 123", { h: 3 }).line(-50, 8, -10, 8)' + LAY + '.layer("ETCH", [1]).end();';
    function etchPart() {
      var m = K.newModel('Etch');
      K.runScript(m, ETCH_PART);
      var top = m.features.filter(function (f) { return f.type === 'sketch'; })[1];
      top.entities[3].construction = true;   // a construction line on ETCH: not a mark
      var b = K.rebuild(m);
      assert(!Object.keys(b.errors).length, 'errors ' + JSON.stringify(b.errors));
      return { model: m, build: b, flat: K.flatPattern(m, b, K.meshFromBody(b.body)), sketches: m.features.filter(function (f) { return f.type === 'sketch'; }) };
    }
    test('flat-hygiene: Etch text "PN 123" and ETCH lines / arcs on the base\'s top face, its bottom face and a flange wall go to flat.etch in flat coordinates (wall unfolded, bottom mirrored); BEND, construction and the blank\'s own loops do not', function () {
      var r = etchPart(), f = r.flat, BA = K.bendAllowance(Math.PI / 2, 2, 2, 0.71), sk = r.sketches;
      var nText = [sk[1], sk[2], sk[3]].reduce(function (s, x) { return s + K.textDxf(x.entities[0]).strokes.length; }, 0);
      assert(f.etch.length === nText + 1 + 2 + 1, 'etch items ' + f.etch.length + ', expected ' + (nText + 4));
      assert(f.etchLayer && f.etchLayer.name === 'ETCH' && f.etchLayer.aci === 3, 'layer ' + JSON.stringify(f.etchLayer));
      function hasLine(a, b) { return f.etch.some(function (it) { return it.t === 'line' && ((Math.hypot(it.a[0] - a[0], it.a[1] - a[1]) < 1e-9 && Math.hypot(it.b[0] - b[0], it.b[1] - b[1]) < 1e-9) || (Math.hypot(it.a[0] - b[0], it.a[1] - b[1]) < 1e-9 && Math.hypot(it.b[0] - a[0], it.b[1] - a[1]) < 1e-9)); }); }
      assert(hasLine([60, -10], [90, -10]), 'top-face line as drawn (the Top frame is the flat\'s)');
      assert(!hasLine([60, -50], [90, -50]) && !hasLine([60, -20], [90, -20]), 'no BEND or construction line');
      assert(hasLine([10, -10], [30, -10]), 'bottom-face line: (x, y) -> (x, −y)');
      var w = -(BA + 8 - 4);   // 8 up the wall's inner face (x = −2), which starts R = 2 above the base's top
      assert(hasLine([w, -50], [w, -10]), 'wall line unfolded to u = −(BA + 4) = ' + fmt(w));
      var arc = f.etch.filter(function (it) { return it.t === 'arc' && Math.abs(it.r - 3) < 1e-12; })[0];
      assert(arc && Math.hypot(arc.c[0] - 20, arc.c[1] + 20) < 1e-9, 'bottom arc centre ' + JSON.stringify(arc));
      near(((arc.a0 % 360) + 360) % 360, 270, 1e-9, 'mirrored arc runs ccw from −90°'); near(((arc.a1 % 360) + 360) % 360, 0, 1e-9, '… to 0°');
      // one stroke of each text, mapped analytically
      [[sk[1], function (q) { return q; }], [sk[2], function (q) { return [q[0], -q[1]]; }], [sk[3], function (q) { return [-(BA + q[1] - 4), q[0]]; }]].forEach(function (c, k) {
        var s = K.textLayout(c[0].entities[0]).strokes.filter(function (x) { return x.t === 'line'; })[0];
        assert(hasLine(c[1]([s.x1, s.y1]), c[1]([s.x2, s.y2])), 'text ' + k + ': stroke ' + JSON.stringify(s) + ' at ' + JSON.stringify([c[1]([s.x1, s.y1]), c[1]([s.x2, s.y2])]));
      });
      assert(f.loops.length === 1 && f.loops[0].length === 4, 'the marks are not cut: a plain blank');
      return f.etch.length + ' marks (' + nText + ' text strokes)';
    });
    test('flat-hygiene: exportDXFFlat writes the marks on layer ETCH (colour 3) in R12 and R2000 at the blank\'s 0,0 origin, nothing extra on OUTLINE / HOLES; etch: false leaves them out', function () {
      var r = etchPart(), f = r.flat, BA = K.bendAllowance(Math.PI / 2, 2, 2, 0.71), sh = [-f.bbox.min[0], -f.bbox.min[1]], w = -(BA + 8 - 4);
      ['R12', 'R2000'].forEach(function (v) {
        var dxf = K.exportDXFFlat(f, 'mm', { version: v }), ents = sketchDxfEnts(dxf).filter(function (e) { return e.t !== 'VERTEX' && e.t !== 'SEQEND'; });
        var on = function (layer) { return ents.filter(function (e) { return e['8'] === layer; }); };
        assert(on('ETCH').length === f.etch.length, v + ' ETCH entities ' + on('ETCH').length + ' of ' + f.etch.length);
        assert(on('ETCH').every(function (e) { return /^(LINE|ARC|CIRCLE)$/.test(e.t); }), v + ' marks are LINE / ARC / CIRCLE');
        assert(on('OUTLINE').length === 1 && on('HOLES').length === 0, v + ' OUTLINE ' + on('OUTLINE').length + ', HOLES ' + on('HOLES').length);
        assert(/\n2\nETCH\n70\n0\n62\n3\n/.test(dxf), v + ' ETCH layer colour 3');
        var hit = on('ETCH').filter(function (e) { return e.t === 'LINE' && Math.abs(e['10'] - (w + sh[0])) < 1e-6 && Math.abs(e['11'] - (w + sh[0])) < 1e-6 && Math.abs(Math.min(e['20'], e['21']) - (-50 + sh[1])) < 1e-6 && Math.abs(Math.max(e['20'], e['21']) - (-10 + sh[1])) < 1e-6; });
        assert(hit.length === 1, v + ' the wall line at u = ' + fmt(w + sh[0]) + ' in the DXF');
        var c = DxfCheck.check(dxf, { units: 'mm' });
        assert(c.ok, v + ' read back: ' + c.errors.slice(0, 3).join('; '));
      });
      assert(K.exportDXFFlat(f, 'mm', { etch: false }).indexOf('ETCH') < 0, 'etch: false');
      assert(K.exportDXFFlat(flatOf(SHEET).flat, 'mm').indexOf('ETCH') < 0, 'no ETCH layer without marks');
      return f.etch.length + ' ETCH entities';
    });
  })();
  // --- end flat-hygiene ---

