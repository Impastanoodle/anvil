  // --- rfPK (2026-11-18, lane smmirror) --- a feature-mode Mirror / Linear Pattern / Circular Pattern of a sheet-metal
  // feature is that feature again on the mirrored / moved edges or faces (kernel-rebuild.js bendFamily), as SolidWorks
  // 2024 mirrors an Edge Flange, Miter Flange, Hem and Closed Corner and patterns an Edge Flange. Before, the copy was
  // the flange's solid moved: the base kept its square corner under it (4.0060 in³ against 3.9507 on the report's
  // bracket) and Flat Pattern left it out (one bend, 5.2920 wide instead of 6.5839: test-reports/2026-11-17-shop-flow-5.md
  // B1). Each case is checked against the same part with the feature picked on every edge in one feature: volume, the
  // flat's size, outline and bend lines, to 1e-9. A Sketched Bend / sketch Jog is refused with the reason (SolidWorks'
  // list of mirrored sheet-metal features does not hold them).
  (function () {
    group('rfPK: Mirror / Pattern of Edge Flange, Hem, Miter Flange, Jog and Closed Corner = the feature on every edge (blank, bends, volume)');
    var T = 0.1196, T2 = 0.0598;
    var BASE = 'p.units("in");\np.sheet(0.1196, 0.12, 0.44);\np.sketch("Top").rect(-2, -5, 4, 5).end().baseFlange();\n';
    var IN = '{ position: "inside", lengthRef: "outer" }', INR = '{ position: "inside", lengthRef: "outer", relief: "rect" }';
    function rfPKflat(code) {
      var r = build(code);
      r.flat = Object.keys(r.errors).length ? null : K.flatPattern(r.model, r.build, r.mesh);
      return r;
    }
    function rfPKkey(l) { return l.map(function (q) { return q.map(function (x) { return (Math.abs(x) < 5e-10 ? 0 : x).toFixed(8); }).join(','); }).sort().join(';'); }
    function rfPKbends(fl) { return fl.bends.map(function (b) { return rfPKkey([b.a, b.b]) + ' ' + (+b.angle).toFixed(9); }).sort(); }
    // a against b: no errors, volume, the flat's size, outline loops and bend lines (ends, angle) to 1e-9 (8 decimals)
    function rfPKsame(a, b, bends) {
      noErrors(a); noErrors(b);
      nearRel(a.mp.volume, b.mp.volume, 1e-9, 'volume (the feature on every edge: ' + b.mp.volume + ')');
      near(a.flat.size[0], b.flat.size[0], 1e-9, 'blank x'); near(a.flat.size[1], b.flat.size[1], 1e-9, 'blank y');
      var la = a.flat.loops.map(function (l) { return rfPKkey(l.pts || l); }).sort(), lb = b.flat.loops.map(function (l) { return rfPKkey(l.pts || l); }).sort();
      assert(JSON.stringify(la) === JSON.stringify(lb), 'flat outline differs: ' + la.length + ' / ' + lb.length + ' loops');
      var ba = rfPKbends(a.flat), bb = rfPKbends(b.flat);
      assert(ba.length === bends, ba.length + ' bends in the flat, want ' + bends);
      assert(JSON.stringify(ba) === JSON.stringify(bb), 'bend lines differ: ' + ba.join(' | ') + ' // ' + bb.join(' | '));
      return 'volume ' + a.mp.volume.toFixed(6) + ', blank ' + a.flat.size.map(function (x) { return x.toFixed(4); }).join(' x ') + ', ' + ba.length + ' bends';
    }
    // the BEND layer's LINEs of the flat DXF
    function rfPKdxfBends(flat) {
      var L = K.exportDXFFlat(flat, 'in').replace(/\r\n/g, '\n').split('\n'), n = 0, ent = null;
      for (var i = 0; i + 1 < L.length; i += 2) {   // group code / value pairs
        var code = L[i].trim(), val = L[i + 1].trim();
        if (code === '0') ent = val;
        else if (code === '8' && ent === 'LINE' && val === 'BEND') n++;
      }
      return n;
    }

    test('rfPK: the report\'s 11 ga bracket: Edge-Flange (Material Inside, 1.5 to the outer sharp) mirrored about the Right Plane = the flange on both edges (6.5839 x 5, 2 bends, 3.9507 in³); the DXF has both bends', function () {
      var a = rfPKflat(BASE + 'p.flange(1.5, [[2, ' + T + ', 1]], ' + IN + ');\np.mirror("Right", { feature: 3 });');
      var b = rfPKflat(BASE + 'p.flange(1.5, [[2, ' + T + ', 1], [-2, ' + T + ', 1]], ' + IN + ');');
      var s = rfPKsame(a, b, 2);
      near(a.flat.size[0], 6.583914290233, 1e-9, 'blank width (report: 6.5839)');
      near(a.mp.volume, 3.950662098751, 1e-9, 'volume (report: 3.9507 with the flange on both edges)');
      assert(a.build.flanges[4] && a.build.flanges[4].length === 1 && a.build.flanges[4][0].kind === 'edge', 'Mirror1 carries one bend record: ' + JSON.stringify(a.build.flanges[4] && a.build.flanges[4].map(function (r) { return r.kind; })));
      var nb = rfPKdxfBends(a.flat);
      assert(nb === 2, nb + ' LINEs on BEND in the flat DXF');
      assert(a.flat.bends.some(function (bd) { return /^4:0$/.test(bd.id); }), 'the mirrored bend\'s id is Mirror1\'s (4:0): ' + a.flat.bends.map(function (bd) { return bd.id; }).join(', '));
      return s + ', DXF ' + nb + ' bend lines';
    });

    var GUS = BASE + 'p.sketch("Top", ' + T + ').line(-2.6, -3, 2.6, -3).end();\np.sketchedBend(90, { sketch: 3, fixed: [0, ' + T + ', 1.2] });\n';
    var FL1 = 'p.flange(1.5, [[2, ' + T + ', 1.2]], ' + IN + ');\n', FL2 = 'p.flange(1.5, [[2, ' + T + ', 1.2], [-2, ' + T + ', 1.2]], ' + IN + ');\n';
    var HM1 = 'p.hem(0.375, [[2, 1.5, 1.2]], { hemType: "closed" });\n', HM2 = 'p.hem(0.375, [[2, 1.5, 1.2], [-2, 1.5, 1.2]], { hemType: "closed" });\n';
    test('rfPK: the shop-flow gusset (Sketched Bend, Edge-Flange, closed Hem): Mirror of the flange and Mirror of the hem = both picked on both edges (7.4338 x 5, 5 bends); Edit Feature on the source flange (1.5 -> 1.25) moves both; the script round-trips', function () {
      var a = rfPKflat(GUS + FL1 + 'p.mirror("Right", { feature: 5 });\n' + HM1 + 'p.mirror("Right", { feature: 7 });');
      var s = rfPKsame(a, rfPKflat(GUS + FL2 + HM2), 5);
      near(a.flat.size[0], 7.433792100978, 1e-9, 'blank width');
      // Edit Feature on Edge-Flange1's length: the mirrored flange and both hems follow
      var m = JSON.parse(JSON.stringify(a.model));
      K.findFeature(m, 5).length = 1.25;
      var b2 = K.rebuild(m), mesh2 = K.meshFromBody(b2.body), e = { model: m, build: b2, mesh: mesh2, mp: K.massProps(mesh2, m.density), errors: b2.errors };
      e.flat = K.flatPattern(m, b2, mesh2);
      rfPKsame(e, rfPKflat(GUS + FL2.replace('1.5,', '1.25,') + HM2.replace(/1\.5, 1\.2/g, '1.25, 1.2')), 5);
      near(e.flat.size[0], a.flat.size[0] - 0.5, 1e-9, 'the blank 2 x .25 narrower');
      var sc = K.generateScript(a.model), r = rfPKflat(sc);
      assert(/p\.mirror\("Right"/.test(sc), 'written: ' + sc.split('\n').filter(function (l) { return /mirror/.test(l); }).join(' / '));
      rfPKsame(r, a, 5);
      return s + '; at 1.25: ' + e.flat.size[0].toFixed(4);
    });

    test('rfPK: a Mirror of a Hem alone after the flange on both edges; a Miter Flange (riser 1, lip .5) mirrored about Front at 2.5 = picked on both edges; an edge Jog mirrored = on both edges', function () {
      var out = [];
      out.push('hem: ' + rfPKsame(rfPKflat(GUS + FL2 + HM1 + 'p.mirror("Right", { feature: 6 });'), rfPKflat(GUS + FL2 + HM2), 5));
      var PROF = 'p.sketch("Right").line(-5, ' + T + ', -5, ' + (T + 1) + ').line(-5, ' + (T + 1) + ', -4.5, ' + (T + 1) + ').end();\n';
      out.push('miter: ' + rfPKsame(rfPKflat(BASE + PROF + 'p.miterFlange([[0, ' + T + ', 5]], { position: "inside", miterGap: 0.01 });\np.mirror("Front", { feature: 4, offset: 2.5 });'),
        rfPKflat(BASE + PROF + 'p.miterFlange([[0, ' + T + ', 5], [0, ' + T + ', 0]], { position: "inside", miterGap: 0.01 });'), 4));
      out.push('jog: ' + rfPKsame(rfPKflat(BASE + 'p.jog(0.5, 1, [[2, ' + T + ', 2.5]]);\np.mirror("Right", { feature: 3 });'), rfPKflat(BASE + 'p.jog(0.5, 1, [[2, ' + T + ', 2.5], [-2, ' + T + ', 2.5]]);'), 4));
      return out.join('; ');
    });

    test('rfPK: Closed Corner (butt, overlap, underlap, underlap with the bend region closed) and its flange mirrored = the flange on both edges and the corner on both corners', function () {
      var PL = 'p.units("in");\np.sheet(' + T2 + ', ' + T2 + ', 0.5);\np.sketch("Top").rect(-4, -2, 8, 2).end().baseFlange();\np.flange(1, [[0, ' + T2 + ', 2]], ' + IN + ');\n';
      var P = [4 - T2 / 2, 0.6, 2 - 2 * T2], Q = [-P[0], P[1], P[2]], out = [];
      ['butt', 'overlap', 'underlap', 'underlap closed'].forEach(function (k) {
        var kk = k.split(' '), o = '{ cornerType: "' + kk[0] + '", gap: 0.01, ratio: 1, coplanar: false' + (kk[1] ? ', closeBend: true' : '') + ' }';
        var a = rfPKflat(PL + 'var rf = p.flange(1, [[4, ' + T2 + ', 1]], ' + IN + ').last();\np.mirror("Right", { feature: rf });\nvar c = p.closedCorner([' + JSON.stringify(P) + '], ' + o + ').last();\np.mirror("Right", { feature: c });');
        var b = rfPKflat(PL + 'p.flange(1, [[4, ' + T2 + ', 1], [-4, ' + T2 + ', 1]], ' + IN + ');\np.closedCorner([' + JSON.stringify(P) + ', ' + JSON.stringify(Q) + '], ' + o + ');');
        out.push(k + ' ' + rfPKsame(a, b, 3));
      });
      return out.join('; ');
    });

    test('rfPK: a Closed Corner with the default Coplanar faces mirrored: the first corner already closed the mirrored end face (coplanar with the picked one), so the copy adds nothing and says so (it failed "no flat face"); = one corner closing both; a mirror plane off the part names the corner', function () {
      var PL = 'p.units("in");\np.sheet(' + T2 + ', ' + T2 + ', 0.5);\np.sketch("Top").rect(-4, -2, 8, 2).end().baseFlange();\np.flange(1, [[0, ' + T2 + ', 2]], ' + IN + ');\n';
      var P = [4 - T2 / 2, 0.6, 2 - 2 * T2], out = [];
      ['butt', 'overlap'].forEach(function (k) {
        var o = '{ cornerType: "' + k + '", gap: 0.01 }';
        var a = rfPKflat(PL + 'var rf = p.flange(1, [[4, ' + T2 + ', 1]], ' + IN + ').last();\np.mirror("Right", { feature: rf });\nvar c = p.closedCorner([' + JSON.stringify(P) + '], ' + o + ').last();\np.mirror("Right", { feature: c });');
        var b = rfPKflat(PL + 'p.flange(1, [[4, ' + T2 + ', 1], [-4, ' + T2 + ', 1]], ' + IN + ');\np.closedCorner([' + JSON.stringify(P) + '], ' + o + ');');
        out.push(k + ' ' + rfPKsame(a, b, 3));
        var w = a.warnings[7] || '';
        assert(/^The mirrored end face is closed already \(Closed Corner1's Coplanar faces extended it too\)/.test(w), 'the note: ' + JSON.stringify(a.warnings));
        // = both end faces picked without Coplanar faces
        var two = rfPKflat(PL + 'p.flange(1, [[4, ' + T2 + ', 1], [-4, ' + T2 + ', 1]], ' + IN + ');\np.closedCorner([' + JSON.stringify(P) + ', ' + JSON.stringify([-P[0], P[1], P[2]]) + '], { cornerType: "' + k + '", gap: 0.01, coplanar: false });');
        rfPKsame(a, two, 3);   // both corners closed, as picking both end faces
      });
      var miss = build(PL + 'var rf = p.flange(1, [[4, ' + T2 + ', 1]], ' + IN + ').last();\np.mirror("Right", { feature: rf });\nvar c = p.closedCorner([' + JSON.stringify(P) + '], { gap: 0.01, coplanar: false }).last();\np.mirror("Front", { feature: c, offset: 5 });');
      assert(/^Mirror: the mirrored end faces of Closed Corner1 are not on the part/.test(miss.errors[7] || ''), 'off the part: ' + JSON.stringify(miss.errors));
      return out.join('; ') + '; note: ' + 'closed already; off the part: ' + miss.errors[7];
    });

    test('rfPK: Linear Pattern (3 at 3) of a flange on a tab edge, Circular Pattern (4 about Y) of a flange on a square, Mirror (Front) of a Mirror (Right) of a flange = the flange on every edge; a mirrored edge off the part says so', function () {
      var out = [];
      var COMB = 'p.units("in");\np.sheet(0.1196, 0.12, 0.44);\np.sketch("Top").rect(0, -3, 10, 3).end().baseFlange();\np.sketch("Top", ' + T + ').rect(1, -1, 1, 1).rect(4, -1, 1, 1).rect(7, -1, 1, 1).end().cut(1, { reverse: true });\n';
      out.push('lpattern: ' + rfPKsame(rfPKflat(COMB + 'p.flange(1, [[0.5, ' + T + ', 0]], ' + IN + ');\np.linearPattern({ feature: 5, dir: "x", spacing: 3, count: 3 });'),
        rfPKflat(COMB + 'p.flange(1, [[0.5, ' + T + ', 0], [3.5, ' + T + ', 0], [6.5, ' + T + ', 0]], ' + IN + ');'), 3));
      var SQ = 'p.units("in");\np.sheet(0.1196, 0.12, 0.44);\np.sketch("Top").rect(-2, -2, 4, 4).end().baseFlange();\n';
      out.push('cpattern: ' + rfPKsame(rfPKflat(SQ + 'p.flange(1, [[2, ' + T + ', 0]], ' + INR + ');\np.circularPattern({ feature: 3, axis: "y", center: [0, 0, 0], count: 4 });'),
        rfPKflat(SQ + ['[2, ' + T + ', 0]', '[0, ' + T + ', -2]', '[-2, ' + T + ', 0]', '[0, ' + T + ', 2]'].map(function (e) { return 'p.flange(1, [' + e + '], ' + INR + ');\n'; }).join('')), 4));
      var NB = 'p.units("in");\np.sheet(0.1196, 0.12, 0.44);\np.sketch("Top").rect(-3, -3, 6, 6).end().baseFlange();\np.sketch("Top", ' + T + ').rect(2, -1, 1, 2).rect(-3, -1, 1, 2).end().cut(1, { reverse: true });\n';
      out.push('mirror of mirror: ' + rfPKsame(rfPKflat(NB + 'var f1 = p.flange(1, [[3, ' + T + ', 2]], ' + INR + ').last();\nvar m1 = p.mirror("Right", { feature: f1 }).last();\np.mirror("Front", { feature: m1 });'),
        rfPKflat(NB + 'p.flange(1, [[3, ' + T + ', 2], [-3, ' + T + ', 2], [3, ' + T + ', -2], [-3, ' + T + ', -2]], ' + INR + ');'), 4));
      var miss = build(BASE + 'p.flange(1, [[2, ' + T + ', 1]], ' + IN + ');\np.mirror("Right", { feature: 3, offset: 1 });');
      assert(/^Mirror: the mirrored edges of Edge-Flange1 are not on the part/.test(miss.errors[4] || ''), 'a mirror plane off the part: ' + JSON.stringify(miss.errors));
      return out.join('; ') + '; off the part: ' + miss.errors[4];
    });

    test('rfPK: a Mirror / Linear Pattern of a Sketched Bend or a sketch Jog is refused with the reason (SolidWorks does not list them); the part before it stays', function () {
      var a = build(GUS + 'p.mirror("Right", { feature: 4, offset: 1 });');
      assert(/^Cannot mirror SketchBend1: SolidWorks mirrors Edge Flanges, Miter Flanges, Hems and Closed Corners, not a Sketched Bend/.test(a.errors[5] || ''), 'refused: ' + JSON.stringify(a.errors));
      nearRel(a.mp.volume, build(GUS).mp.volume, 1e-12, 'the part before it');
      assert(K.bendFamilyWhy(a.model, { type: 'mirror', feature: 4 }) === a.errors[5], 'the Mirror PM reads the same reason');
      var j = build(BASE + 'p.sketch("Top", ' + T + ').line(-2.6, -3, 2.6, -3).end();\np.jog(0.5, { sketch: 3, fixed: [0, ' + T + ', 1.2] });\np.linearPattern({ feature: 4, dir: "z", spacing: 1, count: 2 });');
      assert(!j.errors[4] && /^Cannot pattern Jog1: SolidWorks patterns .*not a Jog/.test(j.errors[5] || ''), 'sketch jog: ' + JSON.stringify(j.errors));
      assert(K.bendFamilyWhy(a.model, { type: 'mirror', feature: 3 }) === '' && K.bendFamilyWhy(a.model, { type: 'mirror', feature: 2 }) === '', 'a sketch or the base flange: no refusal');
      return a.errors[5];
    });
  })();
