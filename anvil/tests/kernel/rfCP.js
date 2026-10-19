  // --- rfCP (2026-10-19, lane CP: sheet metal Break Corner / Corner Trim) --- `breakCorner` features: fillet and
  // chamfer of outside sheet corners picked by corner edge or by face, exact volumes, true arcs in the flat and its DXF,
  // the flange end's corners in the flat with the bends unchanged, a later flange on a broken edge, the errors, the
  // script round trip. 16 ga steel, T = R = 0.0598, K = 0.5, a 4 × 3 base.
  (function () {
    group('rfCP: Break Corner / Corner Trim (fillet, chamfer, corner and face picks, flat arcs, errors)');
    var T = 0.0598, R = 0.0598, BA90 = Math.PI / 2 * (R + 0.5 * T), BD90 = 2 * (R + T) - BA90;
    var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n';
    var L = HEAD + 'p.flange(1.5, [[0, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\n';
    var C4 = [[0, T / 2, 0], [4, T / 2, 0], [4, T / 2, 3], [0, T / 2, 3]];
    function bc(size, corners, opts) { return 'p.breakCorner(' + size + ', ' + JSON.stringify(corners) + ', ' + JSON.stringify(opts || {}) + ');\n'; }
    function flatOf(code) { var r = build(code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function arcsOf(loop) { var c = K.dxfLoopCurves(loop); return c && c.segs ? c.segs.filter(function (s) { return s.t === 'arc'; }) : []; }
    function blankArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? K.signedArea(l) : -Math.abs(K.signedArea(l))); }, 0); }
    function errOf(r) { var ids = Object.keys(r.errors); return ids.length ? r.errors[ids[0]] : ''; }

    test('rfCP: fillet R .25 on all four corners of the 4 × 3 base: volume (12 − 4·(1 − π/4)·.0625)·T exactly; the flat is 4 × 3, one loop, four true R .25 arcs', function () {
      var r = flatOf(HEAD + bc(0.25, C4, { kind: 'fillet' }));
      nearRel(r.mp.volume, (12 - 4 * (1 - Math.PI / 4) * 0.0625) * T, 1e-9, 'volume');
      consistentVolume(r);
      near(r.flat.size[0], 4, 1e-9, 'flat width'); near(r.flat.size[1], 3, 1e-9, 'flat height');
      assert(r.flat.loops.length === 1, 'one loop: ' + r.flat.loops.length);
      var arcs = arcsOf(r.flat.loops[0]);
      assert(arcs.length === 4 && arcs.every(function (a) { return Math.abs(a.r - 0.25) < 1e-9 && Math.abs(Math.abs(a.sweep) - Math.PI / 2) < 1e-9; }), 'four R.25 quarter arcs: ' + JSON.stringify(arcs.map(function (a) { return [a.r, a.sweep]; })));
      nearRel(blankArea(r.flat), 12 - 4 * (1 - Math.PI / 4) * 0.0625, 2e-3, 'blank area (chords)');
      var f = r.model.features[r.model.features.length - 1];
      assert(f.type === 'breakCorner' && f.kind === 'fillet' && f.size === 0.25 && f.name === 'Break-Corner1' && f.corners.length === 4, 'feature: ' + JSON.stringify(f));
      return 'volume ' + fmt(r.mp.volume);
    });

    test('rfCP: chamfer .25 on all four corners: area 12 − 4·.03125 (volume / T and the blank), the flat outline is 8 lines', function () {
      var r = flatOf(HEAD + bc(0.25, C4, { kind: 'chamfer' }));
      nearRel(r.mp.volume / T, 12 - 4 * 0.03125, 1e-9, 'area');
      nearRel(blankArea(r.flat), 12 - 4 * 0.03125, 1e-9, 'blank area');
      var cv = K.dxfLoopCurves(r.flat.loops[0]);
      assert(cv.segs.length === 8 && cv.segs.every(function (s) { return s.t === 'line'; }), 'eight lines: ' + cv.segs.map(function (s) { return s.t; }).join(' '));
      return 'area ' + fmt(r.mp.volume / T);
    });

    test('rfCP: the flat DXF writes each fillet as one ARC (R12 and R2000, lines / arcs) and passes the laser read-back check', function () {
      var r = flatOf(HEAD + bc(0.25, C4, { kind: 'fillet' }));
      ['R12', 'R2000'].forEach(function (ver) {
        var dxf = K.exportDXFFlat(r.flat, 'in', { version: ver, style: 'entities' }), c = DxfCheck.check(dxf, { units: 'in' });
        assert(c.ok, ver + ': ' + c.errors.join('; '));
        var arcs = DxfCheck.parse(dxf).entities.filter(function (e) { return e.type === 'ARC' && e.layer === 'OUTLINE'; });
        assert(arcs.length === 4 && arcs.every(function (a) { return Math.abs(a.r - 0.25) < 1e-9; }), ver + ' four R.25 ARCs on OUTLINE: ' + JSON.stringify(c.counts));
        assert(c.counts['LINE@OUTLINE'] === 4, ver + ' four lines: ' + JSON.stringify(c.counts));
      });
    });

    test('rfCP: L bracket (1.5 Material Inside flange): fillet R .25 on the flange\'s two free corners — the volume drops by 2·(1 − π/4)·.0625·T, the flat keeps 4 + 1.5 − BD × 3 with the same bend line and BD, and the two arcs sit at the flange end', function () {
      var a = flatOf(L);
      var walls = K.breakCornerCandidates(a.build.body, a.model).filter(function (c) { return c.at[1] > 1; });
      assert(walls.length === 2, 'two free corners at the flange end: ' + JSON.stringify(walls.map(function (c) { return c.at; })));
      var b = flatOf(L + bc(0.25, walls.map(function (c) { return c.at; }), { kind: 'fillet' }));
      nearRel(a.mp.volume - b.mp.volume, 2 * (1 - Math.PI / 4) * 0.0625 * T, 1e-6, 'removed volume');
      near(b.flat.size[0], 4 + 1.5 - BD90, 1e-9, 'flat length A + B − BD'); near(b.flat.size[1], 3, 1e-9, 'flat width');
      assert(b.flat.bends.length === 1, 'one bend');
      near(b.flat.bends[0].bd, a.flat.bends[0].bd, 1e-12, 'BD');
      ['a', 'b'].forEach(function (k) { [0, 1].forEach(function (j) { near(b.flat.bends[0][k][j], a.flat.bends[0][k][j], 1e-9, 'bend line ' + k + '[' + j + ']'); }); });
      var arcs = arcsOf(b.flat.loops[0]), lo = b.flat.bbox.min[0], hi = b.flat.bbox.max[0], bu = b.flat.bends[0].a[0];
      assert(arcs.length === 2, 'two arcs: ' + arcs.length);
      // the flange end is the blank's edge on the wall's side of the bend line (the nearer one: 1.4 against the base's 3.9)
      var endU = Math.abs(bu - lo) < Math.abs(hi - bu) ? lo : hi;
      arcs.forEach(function (s) { near(Math.abs(s.c[0] - endU), 0.25, 1e-9, 'arc centre .25 from the flange end'); near(s.r, 0.25, 1e-9, 'arc radius'); });
      return 'flat ' + fmt(b.flat.size[0]) + ' × 3';
    });

    test('rfCP: a face pick on the L bracket\'s base breaks only that face\'s two free corners (chamfer .25), not the flange end\'s, nor the corners at the bend', function () {
      var a = build(L), r = flatOf(L + bc(0.25, [], { kind: 'chamfer', faces: [[2, T, 1.5]] }));
      nearRel((a.mp.volume - r.mp.volume) / T, 2 * 0.03125, 1e-9, 'two chamfers');
      // what is left: the flange end's two corners and the four 135° corners the chamfers made (they can be broken again)
      var left = K.breakCornerCandidates(r.build.body, r.model);
      assert(left.filter(function (c) { return c.at[1] > 1; }).length === 2, 'the flange end keeps its corners: ' + JSON.stringify(left.map(function (c) { return c.at; })));
      assert(left.filter(function (c) { return c.at[1] < 1; }).length === 4 && left.every(function (c) { return c.at[1] > 1 || Math.abs(c.alpha - 0.75 * Math.PI) < 1e-9; }), 'the base has only the chamfers\' 135° corners');
      var f = r.model.features[r.model.features.length - 1];
      assert(f.corners.length === 0 && f.faces.length === 1 && f.kind === 'chamfer', 'feature: ' + JSON.stringify(f));
    });

    test('rfCP: feature-tree order — a later Material Inside flange on the broken x = 4 edge still builds: flat 4 + 1 − BD × 3, two bends', function () {
      var r = flatOf(HEAD + bc(0.25, [[4, T / 2, 0], [4, T / 2, 3]], { kind: 'fillet' }) + 'p.flange(1, [[4, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\np.flange(1.5, [[0, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\n');
      near(r.flat.size[0], 4 + 1 + 1.5 - 2 * BD90, 1e-9, 'flat length'); assert(r.flat.bends.length === 2, 'two bends');
      assert(!Object.keys(r.warnings).length, 'no warnings: ' + JSON.stringify(r.warnings));
    });

    test('rfCP: errors — a corner that is not there (mid-edge, the bend-tangent corner of a wall, a corner already broken), a face with no corners, a break that does not fit, two that overlap; a bad kind', function () {
      var cases = [
        [HEAD + bc(0.25, [[2, T / 2, 0]], { kind: 'fillet' }), /no outside sheet corner at \(2, 0\.0299, 0\)/],
        [L + bc(0.25, [[T / 2, R + T, 0]], { kind: 'fillet' }), /no outside sheet corner/],
        [HEAD + bc(0.25, [C4[1]], { kind: 'fillet' }) + bc(0.1, [C4[1]], { kind: 'chamfer' }), /no outside sheet corner at \(4, 0\.0299, 0\)/],
        [HEAD + bc(0.25, [], { kind: 'fillet', faces: [[4, T / 2, 1.5]] }), /no flat sheet face/],
        [HEAD + bc(3.5, [C4[1]], { kind: 'fillet' }), /does not fit the corner/],
        [HEAD + bc(2, [C4[1], C4[2]], { kind: 'chamfer' }), /overlap on their 3 edge/],
        [HEAD + bc(0, [C4[1]], { kind: 'chamfer' }), /must be a positive number/]
      ];
      cases.forEach(function (c, i) {
        var r = build(c[0]), e = errOf(r);
        assert(c[1].test(e), 'case ' + (i + 1) + ': ' + (e || 'no error'));
      });
      var threw = false;
      try { build(HEAD + bc(0.25, C4, { kind: 'round' })); } catch (e) { threw = /chamfer" or "fillet/.test(e.message); }
      assert(threw, 'kind "round" is refused by the script');
    });

    test('rfCP: general angles — fillet R 5 and chamfer 4 on a trapezoid plate (60° and 120° corners, mm): exact volumes r²·(cot(α/2) − (π − α)/2) and d²·sin α / 2 per corner', function () {
      var t = 2, H = 'p.units("mm");\np.sheet(2, 2, 0.5);\np.sketch("Top").polyline([[0, 0], [100, 0], [100 - 40 / Math.sqrt(3), -40], [40 / Math.sqrt(3), -40]], true).end().baseFlange();\n';
      var plain = build(H), all = K.breakCornerCandidates(plain.build.body, plain.model);
      assert(all.length === 4, 'four corners: ' + all.length);
      var area0 = plain.mp.volume / t;
      var f = build(H + bc(5, [], { kind: 'fillet', faces: [[50, t, 20]] }));
      noErrors(f);
      function filletArea(al, r) { return r * r * (1 / Math.tan(al / 2) - (Math.PI - al) / 2); }
      nearRel(area0 - f.mp.volume / t, 2 * filletArea(Math.PI / 3, 5) + 2 * filletArea(2 * Math.PI / 3, 5), 1e-9, 'fillet area');
      var c = build(H + bc(4, [], { kind: 'chamfer', faces: [[50, 0, 20]] }));
      noErrors(c);
      nearRel(area0 - c.mp.volume / t, 2 * 8 * Math.sin(Math.PI / 3) + 2 * 8 * Math.sin(2 * Math.PI / 3), 1e-9, 'chamfer area (the bottom face pick)');
    });

    test('rfCP: script round trip — generateScript writes p.breakCorner(size, corners, { kind, faces, name }) and rebuilds the same part', function () {
      var r = build(L + bc(0.25, [[T / 2, 1.5, 0], [T / 2, 1.5, 3]], { kind: 'fillet' }) + bc(0.2, [], { kind: 'chamfer', faces: [[2, T, 1.5]] }));
      noErrors(r);
      var s = K.generateScript(r.model);
      assert(/p\.breakCorner\(0\.25, \[\[0\.0299,1\.5,0\],\[0\.0299,1\.5,3\]\], \{ kind: "fillet", name: "Break-Corner1" \}\)/.test(s), 'fillet line: ' + s.split('\n').filter(function (l) { return /breakCorner/.test(l); }).join(' | '));
      assert(/p\.breakCorner\(0\.2, \[\], \{ kind: "chamfer", faces: \[\[2,0\.0598,1\.5\]\], name: "Break-Corner2" \}\)/.test(s), 'chamfer line');
      var r2 = build(s);
      noErrors(r2);
      nearRel(r2.mp.volume, r.mp.volume, 1e-12, 'same volume');
    });
  })();
