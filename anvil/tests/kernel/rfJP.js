  // --- rfJP (2026-11-05, lane smcorner: test-reports/2026-11-05-sheetmetal-pm-audit.md row 13) --- Corners ▸ Welded
  // Corner (type 'weldedCorner': kernel-sheetmetal.js weldedCornerLayout): the weld fills the corner gap over the
  // straight walls (the bend region stays open), an optional fillet in the inside corner (16 chords), Add texture is
  // stored only, and the flat pattern is the part's without the weld. 16 ga, R = T, K .5, inches, the rfCS tray: a
  // 4 × 3 base with four separate 1 in Material Inside flanges, each later wall stopping R short of its neighbour.
  (function () {
    group('rfJP: Welded Corner (gap fill, after a Butt Closed Corner, fillet, flat without the weld, errors, round trip)');
    var T = 0.0598, R = 0.0598, H = 1 - (R + T), GAP = 0.01, G2 = GAP / Math.SQRT2;
    var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
      [[2, T, 0], [4, T, 1.5], [2, T, 3], [0, T, 1.5]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer" });\n'; }).join('');
    // the end faces that stop short (rfCS F4): front-left, front-right, back-right, back-left; a point mid-height on each
    var F4 = [[T / 2, 0.6, R + T], [4 - T / 2, 0.6, R + T], [4 - R - T, 0.6, 3 - T / 2], [T / 2, 0.6, 3 - R - T]];
    function wc(faces, opts) { return 'p.weldedCorner(' + JSON.stringify(faces) + (opts ? ', ' + JSON.stringify(opts) : '') + ');\n'; }
    function blankArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? Math.abs(K.signedArea(l)) : -Math.abs(K.signedArea(l))); }, 0); }
    function make(code) { var r = build(code); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function closed(r, label) {
      noErrors(r);
      var c = Evaluate.checkBody(r.body, { maxPairs: 1 });
      assert(!c.openEdges.length && !c.nonManifoldEdges.length, label + ': closed solid (' + c.openEdges.length + ' open, ' + c.nonManifoldEdges.length + ' non-manifold)');
    }
    function sameFlat(a, b, label) {
      assert(a.flat.loops.length === b.flat.loops.length, label + ': loops ' + a.flat.loops.length + ' vs ' + b.flat.loops.length);
      near(a.flat.size[0], b.flat.size[0], 1e-12, label + ': flat width'); near(a.flat.size[1], b.flat.size[1], 1e-12, label + ': flat height');
      near(blankArea(a.flat), blankArea(b.flat), 1e-12, label + ': blank area');
      assert(JSON.stringify(a.flat.loops) === JSON.stringify(b.flat.loops), label + ': the same outline');
      assert(a.flat.bends.length === b.flat.bends.length, label + ': bend lines');
    }
    function errOf(r) { var ids = Object.keys(r.errors || {}); return ids.length ? r.errors[ids[ids.length - 1]] : ''; }
    var tray0 = null;
    function tray() { if (!tray0) tray0 = make(HEAD); return tray0; }
    var FA = function (r) { return r * r - WCN / 2 * r * r * Math.sin(Math.PI / 2 / WCN); }, WCN = 16;   // the chorded fillet's area

    test('rfJP: Welded Corner at the front-left corner: + R·T·H exactly (the gap in front of the left wall\'s end, over the straight walls), closed; the gap filled, the bend region open; folded = blank × T + the weld', function () {
      var a = tray(), b = make(HEAD + wc([F4[0]]));
      closed(b, 'welded');
      near(b.mp.volume - a.mp.volume, R * T * H, 1e-12, 'added: R · T · H');
      near(polyVol(b.mp) - polyVol(a.mp), R * T * H, 1e-12, 'added (polygonal)');
      var inside = b.build.body.pointTester();
      assert(inside([T / 2, 0.6, T + R / 2]) && inside([T / 2, 1 - 1e-3, T + R / 2]) && inside([T / 2, R + T + 1e-3, T + R / 2]), 'the gap is metal now, top to the bend');
      assert(!inside([T / 2, R / 2 + T, T + R / 2]), 'the bend region stays open');
      assert(!inside([T + 1e-3, 0.6, T + R / 2]) && !inside([-1e-3, 0.6, T + R / 2]), 'no wider than the wall');
      sameFlat(b, a, 'flat');
      nearRel(b.mp.volume, blankArea(b.flat) * T + R * T * H, 1e-9, 'folded = blank × T + the weld');
      var lay = K.weldedCornerLayout({ faces: [F4[0]] }, b.model, { body: a.body });
      near(lay.corners[0].gap, R, 1e-12, 'layout: the gap'); near(lay.corners[0].area, R * T, 1e-12, 'layout: the section'); near(lay.corners[0].height, H, 1e-12, 'layout: the height');
      return 'added ' + fmt(b.mp.volume - a.mp.volume);
    });

    test('rfJP: all four corners: + 4·R·T·H; the flat is the tray\'s, the DXF one clean OUTLINE loop', function () {
      var a = tray(), b = make(HEAD + wc(F4));
      closed(b, 'four welds');
      near(b.mp.volume - a.mp.volume, 4 * R * T * H, 1e-12, 'added');
      sameFlat(b, a, 'flat');
      var dxf = K.exportDXFFlat(b.flat, 'in', { version: 'R2000', style: 'entities' }), c = DxfCheck.check(dxf, { units: 'in' });
      assert(c.ok, 'dxf-check: ' + c.errors.join('; '));
      assert(c.loops.filter(function (l) { return l.layer === 'OUTLINE'; }).length === 1, 'one OUTLINE loop');
    });

    test('rfJP: after a Butt Closed Corner (gap .010): the weld fills the L of the corner square and both gaps, H·(T² + 2·T·gap/√2); the flat is the closed corner\'s', function () {
      var cc = 'p.closedCorner(' + JSON.stringify([F4[0]]) + ', { cornerType: "butt", gap: ' + GAP + ', coplanar: false });\n';
      var a = make(HEAD + cc), b = make(HEAD + cc + wc([[T / 2, 0.6, T + G2]]));
      closed(b, 'butt + weld');
      near(polyVol(b.mp) - polyVol(a.mp), H * (T * T + 2 * T * G2), 1e-12, 'added');
      var inside = b.build.body.pointTester();
      assert(inside([T / 2, 0.6, T / 2]) && inside([T + G2 / 2, 0.6, T / 2]) && inside([T / 2, 0.6, T + G2 / 2]), 'the corner square and both gaps are metal');
      assert(!inside([T + G2 / 2, 0.6, T + G2 / 2]), 'not the inside corner');
      sameFlat(b, a, 'flat');
      // picking the other wall's end (the front wall's, at x = T + gap/√2) welds the same corner
      var c = make(HEAD + cc + wc([[T + G2, 0.6, T / 2]]));
      closed(c, 'from the front wall');
      near(polyVol(c.mp), polyVol(b.mp), 1e-12, 'same weld from either side');
    });

    test('rfJP: Fillet .1 in the inside corner: + H·(R·T + r² − the chorded quarter disc); a fillet larger than the wall it runs onto is refused', function () {
      var a = tray(), b = make(HEAD + wc([F4[0]], { fillet: 0.1 }));
      closed(b, 'fillet');
      near(polyVol(b.mp) - polyVol(a.mp), H * (R * T + FA(0.1)), 1e-12, 'added');
      var inside = b.build.body.pointTester();
      assert(inside([T + 0.005, 0.6, T + 0.005]) && !inside([T + 0.05, 0.6, T + 0.05]), 'filled at the inside corner, open past the round');
      sameFlat(b, a, 'flat');
      assert(/larger than the wall/.test(errOf(make(HEAD + wc([F4[0]], { fillet: 5 })))), 'too large: ' + errOf(make(HEAD + wc([F4[0]], { fillet: 5 }))));
    });

    test('rfJP: a hole cut after the weld is in the flat; the flat equals the tray\'s with that hole; Add texture changes no geometry', function () {
      var hole = 'p.sketch("Top", ' + T + ').circle(2, -1.5, 0.25).cut("through", { reverse: true });\n';
      var a = make(HEAD + hole), b = make(HEAD + wc([F4[0]]) + hole);
      noErrors(a); closed(b, 'weld then hole');
      sameFlat(b, a, 'flat with the hole');
      assert(b.flat.loops.length === 2, 'the hole is in the flat');
      var t = make(HEAD + wc([F4[0]], { addTexture: true }));
      near(t.mp.volume, make(HEAD + wc([F4[0]])).mp.volume, 1e-14, 'texture: cosmetic');
    });

    test('rfJP: errors (no faces, no face there, not a wall\'s end, nothing across the gap) and the round trip (feature JSON, generateScript, not a cut)', function () {
      assert(/pick a side face/.test(errOf(make(HEAD + wc([])))), 'no faces');
      assert(/no flat face/.test(errOf(make(HEAD + wc([[2, 5, -1.5]])))), 'nothing there: ' + errOf(make(HEAD + wc([[2, 5, -1.5]]))));
      assert(/not the end of a wall/.test(errOf(make(HEAD + wc([[2, T, 1.5]])))), 'the base\'s top face: ' + errOf(make(HEAD + wc([[2, T, 1.5]]))));
      var one = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[2, ' + T + ', 0]], { position: "inside", lengthRef: "outer" });\n';
      assert(/no wall across a gap/.test(errOf(make(one + wc([[0, 0.6, T / 2]])))), 'one flange: ' + errOf(make(one + wc([[0, 0.6, T / 2]]))));
      var r = make(HEAD + wc([F4[0], F4[2]], { fillet: 0.05, addTexture: true }));
      closed(r, 'two corners');
      var f = r.model.features[r.model.features.length - 1];
      assert(f.type === 'weldedCorner' && f.name === 'Welded Corner1' && f.fillet === 0.05 && f.addTexture === true && f.faces.length === 2, 'feature JSON: ' + JSON.stringify(f));
      assert(!K.isCut(f, r.model), 'a boss, not a cut');
      var s = K.generateScript(r.model);
      assert(/p\.weldedCorner\(\[\[0\.0299,0\.6,0\.1196\],\[3\.8804,0\.6,2\.9701\]\], \{ fillet: 0\.05, addTexture: true, name: "Welded Corner1" \}\)/.test(s), 'script: ' + s);
      near(make(s).mp.volume, r.mp.volume, 1e-12, 'same volume');
      var p = make(HEAD + wc([F4[1]]));
      assert(!/fillet|addTexture/.test(K.generateScript(p.model).split('weldedCorner')[1].split('\n')[0]), 'defaults are not written');
      assert(K.weldedCornerName(r.model) === 'Welded Corner2', 'next name');
    });

    test('rfJP: mm tray (2 mm, R 2): the weld is exact there too and leaves the flat alone', function () {
      var mm = 'p.units("mm");\np.sheet(2, 2, 0.5);\np.sketch("Top").rect(0, -80, 100, 80).end().baseFlange();\np.flange(25, [[50, 2, 0]], { position: "inside", lengthRef: "outer" });\np.flange(25, [[0, 2, 40]], { position: "inside", lengthRef: "outer" });\n';
      var a = make(mm), b = make(mm + wc([[1, 15, 4]]));
      closed(b, 'mm');
      near(polyVol(b.mp) - polyVol(a.mp), 2 * 2 * (25 - 4), 1e-9, 'added R · T · H');
      sameFlat(b, a, 'mm flat');
    });
  })();
