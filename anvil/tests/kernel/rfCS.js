  // --- rfCS (2026-10-20, lane CS: sheet metal Closed Corner) --- `closedCorner` features on a 4 × 3 tray (16 ga steel,
  // T = R = 0.0598, K = 0.5) whose four 1.0 in edge flanges (Material Inside, length to the outer virtual sharp) are
  // separate features, so each later wall stops R short of the earlier one's inside face: Butt / Overlap / Underlap,
  // exact added volumes, the flat's tabs and one clean DXF loop, coplanar faces, the errors, the script round trip.
  (function () {
    group('rfCS: Closed Corner (butt, overlap, underlap, coplanar faces, flat tabs, errors, round trip)');
    var T = 0.0598, R = 0.0598, H = 1 - (R + T), GAP = 0.01;   // H: the straight wall above the bend
    // lane DV (SolidWorks 2022, rfDU): Butt stops both walls gap/√2 short of the other's inside face; the matching (front)
    // wall's bend end then runs straight in the flat from the base corner (T + R from the end, at the bend's start) to the
    // wall's new end `to` (at the bend's end): a cut wrapped round the faceted bend that takes the bend section (8 chords)
    // × the mean of the two ends; exact to ~1e-8 (the cut's twisted faces are fans of 4 triangles)
    var G2 = GAP / Math.SQRT2, SEC = 8 * 0.5 * Math.sin(Math.PI / 16) * ((R + T) * (R + T) - R * R), BAF = Math.PI / 2 * (R + T / 2);
    function taper(to) { return SEC * ((T + R) + to) / 2; }
    function butt1(g) { return H * T * (R - g) - H * T * (T + g) - taper(T + g); }   // one Butt corner, g = gap/√2
    var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
      [[2, T, 0], [4, T, 1.5], [2, T, 3], [0, T, 1.5]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer" });\n'; }).join('');
    // the end faces that stop short: front-left and front-right (the side walls' ends at z = R + T), back-right (the
    // back wall's end at x = 4 − R − T) and back-left (the left wall's end at z = 3 − R − T); a point mid-height on each
    var F4 = [[T / 2, 0.6, R + T], [4 - T / 2, 0.6, R + T], [4 - R - T, 0.6, 3 - T / 2], [T / 2, 0.6, 3 - R - T]];
    function cc(faces, opts) { return 'p.closedCorner(' + JSON.stringify(faces) + ', ' + JSON.stringify(opts || {}) + ');\n'; }
    function flatOf(code) { var r = build(code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function blankArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? K.signedArea(l) : -Math.abs(K.signedArea(l))); }, 0); }
    function errOf(r) { var ids = Object.keys(r.errors); return ids.length ? r.errors[ids[0]] : ''; }
    var base = null;
    function tray() { if (!base) base = flatOf(HEAD); return base; }

    test('rfCS: the tray without Closed Corner: four open corners (each later wall R short of its neighbour), one flat loop', function () {
      var b = tray(), inside = b.build.body.pointTester();
      assert(!inside([T / 2, 0.6, T + R / 2]) && inside([T / 2, 0.6, T / 2]) && inside([T / 2, 0.6, R + T + 0.01]), 'front-left: the gap between the left wall and the front wall');
      assert(b.flat.loops.length === 1, 'one loop: ' + b.flat.loops.length);
      near(b.flat.size[0], 4 + 2 * (1 - (2 * (R + T) - Math.PI / 2 * (R + T / 2))), 1e-9, 'flat width');
      return 'volume ' + fmt(b.mp.volume);
    });

    test('rfCS: Butt, gap .010, all four corners (SolidWorks: both walls gap/√2 short): volume + 4·(H·T·(R − g) − H·T·(T + g) − the bend taper); the flat keeps its size, stays one loop; one clean DXF OUTLINE loop', function () {
      var b = tray(), r = flatOf(HEAD + cc(F4, { cornerType: 'butt', gap: GAP, coplanar: false }));
      near(polyVol(r.mp) - polyVol(b.mp), 4 * butt1(G2), 1e-7, 'added volume');
      consistentVolume(r);
      near(r.flat.size[0], b.flat.size[0], 1e-9, 'flat width'); near(r.flat.size[1], b.flat.size[1], 1e-9, 'flat height');
      assert(r.flat.loops.length === 1, 'one loop: ' + r.flat.loops.length);
      near(blankArea(r.flat) - blankArea(b.flat), 4 * (H * (R - G2) - H * (T + G2) - BAF * ((T + R) + (T + G2)) / 2), 1e-6, 'blank area added');
      var inside = r.build.body.pointTester();
      assert(inside([T / 2, 0.6, T + GAP + 0.002]) && !inside([T / 2, 0.6, T + GAP / 2]), 'front-left: the left wall now stops the gap short of the front wall');
      assert(!inside([T + GAP / 2, 0.6, T / 2]) && !inside([T / 2, 0.6, T / 2]) && inside([T + GAP, 0.6, T / 2]), 'butt: the front wall stops gap/√2 short of the left wall\'s inside face too');
      assert(!inside([T / 2, R / 2 + T, T + GAP + 0.01]), 'the bend region stays open');
      var dxf = K.exportDXFFlat(r.flat, 'in', { version: 'R2000', style: 'entities' }), c = DxfCheck.check(dxf, { units: 'in' });
      assert(c.ok, 'dxf-check: ' + c.errors.join('; '));
      var outl = c.loops.filter(function (l) { return l.layer === 'OUTLINE'; });
      assert(outl.length === 1 && outl[0].closed, 'one closed OUTLINE loop: ' + JSON.stringify(outl));
      var f = r.model.features[r.model.features.length - 1];
      assert(f.type === 'closedCorner' && f.cornerType === 'butt' && f.gap === GAP && f.ratio === 1 && f.coplanar === false && f.name === 'Closed Corner1' && f.faces.length === 4, 'feature: ' + JSON.stringify(f));
      return 'added ' + fmt(r.mp.volume - b.mp.volume);
    });

    test('rfCS: Overlap, ratio 1: the extended wall runs over the matching wall\'s end to its outside, the matching wall is trimmed T + gap back; Underlap keeps the matching wall over the end', function () {
      var b = tray(), o = flatOf(HEAD + cc(F4, { cornerType: 'overlap', gap: GAP, coplanar: false }));
      near(polyVol(o.mp) - polyVol(b.mp), 4 * (H * T * ((R + T) - (T + GAP)) - taper(T + GAP)), 1e-7, 'overlap: added volume');
      consistentVolume(o);
      var io = o.build.body.pointTester();
      assert(io([T / 2, 0.6, T / 2]) && io([T / 2, 0.6, 0.002]), 'overlap: the left wall reaches the front wall\'s outside');
      assert(!io([T + GAP / 2, 0.6, T / 2]) && io([T + GAP + 0.002, 0.6, T / 2]), 'overlap: the front wall stops the gap short of the left wall\'s inside face');
      assert(o.flat.loops.length === 1, 'overlap: one loop');
      near(blankArea(o.flat) - blankArea(b.flat), 4 * (H * ((R + T) - (T + GAP)) - BAF * ((T + R) + (T + GAP)) / 2), 1e-6, 'overlap: blank area');
      var u = flatOf(HEAD + cc(F4, { cornerType: 'underlap', gap: GAP, coplanar: false })), iu = u.build.body.pointTester();
      near(polyVol(u.mp) - polyVol(b.mp), 4 * (H * (R - GAP) * T - taper(0)), 1e-7, 'underlap 1: added volume');
      assert(iu([T + GAP / 2, 0.6, T / 2]) && !iu([T / 2, 0.6, T + GAP / 2]), 'underlap: the front wall covers the left wall\'s end');
      return 'overlap ' + fmt(o.mp.volume - b.mp.volume);
    });

    test('rfCS: ratios: Overlap .75 runs .75·T into the matching wall; Underlap .5 trims the matching wall to cover half the thickness', function () {
      var b = tray();
      var o = flatOf(HEAD + cc(F4, { cornerType: 'overlap', gap: GAP, ratio: 0.75, coplanar: false }));
      near(polyVol(o.mp) - polyVol(b.mp), 4 * (H * T * (R + 0.75 * T - (T + GAP)) - taper(T + GAP)), 1e-7, 'overlap .75');
      var u = flatOf(HEAD + cc(F4, { cornerType: 'underlap', gap: GAP, ratio: 0.5, coplanar: false }));
      near(polyVol(u.mp) - polyVol(b.mp), 4 * (H * (R - GAP) * T - H * 0.5 * T * T - taper(0.5 * T)), 1e-7, 'underlap .5');
      var iu = u.build.body.pointTester();
      assert(!iu([T / 4, 0.6, T / 2]) && iu([0.75 * T, 0.6, T / 2]), 'underlap .5: the front wall ends half way across the left wall');
      assert(u.flat.loops.length === 1 && o.flat.loops.length === 1, 'one loop each');
      return 'ok';
    });

    test('rfCS: Coplanar faces: one pick closes both front corners (the two side walls\' ends share a plane); coplanar off closes one', function () {
      var b = tray();
      var on = build(HEAD + cc([F4[0]], { gap: GAP }));
      noErrors(on);
      near(polyVol(on.mp) - polyVol(b.mp), 2 * butt1(G2), 1e-7, 'coplanar: two corners');
      var off = build(HEAD + cc([F4[0]], { gap: GAP, coplanar: false }));
      near(polyVol(off.mp) - polyVol(b.mp), butt1(G2), 1e-7, 'one corner');
      var twice = build(HEAD + cc([F4[0], F4[1]], { gap: GAP }));
      near(polyVol(twice.mp) - polyVol(b.mp), 2 * butt1(G2), 1e-7, 'a face picked twice is extended once');
      return 'ok';
    });

    test('rfCS: errors: gap 0 / below .001 (the walls would join), gap past the opening, ratio > 1, a face with nothing across, a point on no face, unknown type; gap .001 builds', function () {
      function bad(code, re, what) { var r = build(code); var e = errOf(r); assert(re.test(e), what + ': ' + e); }
      bad(HEAD + cc(F4, { gap: 0 }), /at least 0\.001/, 'gap 0');
      bad(HEAD + cc(F4, { gap: 0.0005 }), /at least 0\.001/, 'gap .0005');
      bad(HEAD + cc([F4[0]], { gap: 0.09, coplanar: false }), /already within the gap/, 'gap past the opening (butt: gap/√2 > R)');
      bad(HEAD + cc(F4, { cornerType: 'overlap', ratio: 1.5 }), /ratio must be between 0 and 1/, 'ratio 1.5');
      bad(HEAD + cc([[2, T, 1.5]], {}), /no flange face across the corner/, 'the base top face');
      bad(HEAD + cc([[2, 0.6, 1.5]], {}), /no flat face at/, 'a point in the air');
      var r0 = build(HEAD); r0.model.features.push({ id: r0.model.nextId++, type: 'closedCorner', faces: [F4[0]], cornerType: 'mitre' });
      var e0 = K.rebuild(r0.model).errors; assert(/butt, overlap or underlap/.test(e0[r0.model.features[r0.model.features.length - 1].id] || ''), 'unknown type: ' + JSON.stringify(e0));
      var ok = build(HEAD + cc(F4, { gap: 0.001 }));
      noErrors(ok);
      near(polyVol(ok.mp) - polyVol(tray().mp), 4 * butt1(0.001 / Math.SQRT2), 1e-7, 'gap .001');
      return 'ok';
    });

    test('rfCS: Bend Outside / Material Outside flanges (both walls stop at the corner): the end face runs to the next wall and that wall is extended across the end (butt) or to the gap (overlap); exact volumes, one flat loop; a wide face is refused', function () {
      function tray(pos) {
        return 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
          [[2, T, 0], [4, T, 1.5], [2, T, 3], [0, T, 1.5]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "' + pos + '" });\n'; }).join('');
      }
      // Bend Outside: each wall T thick, R outside the base edge, 1 tall above its bend, as long as its edge
      var bo = build(tray('bendOutside')); noErrors(bo);
      var s = R + T / 2, P = [[-s, 0.6, 0], [4 + s, 0.6, 0], [4 + s, 0.6, 3], [-s, 0.6, 3]];
      var b = flatOf(tray('bendOutside') + cc(P, { cornerType: 'butt', gap: GAP, coplanar: false }));
      nearRel(b.mp.volume - bo.mp.volume, 4 * 1 * T * 2 * (R - G2), 1e-9, 'bend outside, butt');
      var ib = b.build.body.pointTester();
      assert(!ib([-s, 0.6, -R + GAP / 2]) && ib([-s, 0.6, -R + GAP + 0.002]) && !ib([-s, 0.6, -R - T / 2]) && !ib([-R + GAP / 2, 0.6, -R - T / 2]) && ib([-R + GAP, 0.6, -R - T / 2]), 'butt: both walls stop gap/√2 short of the other\'s inside face');
      assert(b.flat.loops.length === 1, 'butt: one flat loop');
      var o = flatOf(tray('bendOutside') + cc(P, { cornerType: 'overlap', gap: GAP, coplanar: false })), io = o.build.body.pointTester();
      nearRel(o.mp.volume - bo.mp.volume, 4 * 1 * T * ((R + T) + (R - GAP)), 1e-9, 'bend outside, overlap');
      assert(io([-s, 0.6, -R + GAP / 2]) && io([-s, 0.6, -R - T / 2]) && !io([-R + GAP / 2, 0.6, -R - T / 2]) && io([-R + GAP + 0.002, 0.6, -R - T / 2]), 'overlap: the side wall runs over the front wall\'s end, which stops the gap short of it');
      assert(o.flat.loops.length === 1, 'overlap: one flat loop');
      // Material Outside: the walls outside the edge, the base trimmed R; each later wall starts R in from the corner
      var mo = build(tray('outside')); noErrors(mo);
      var Q = [[-T / 2, 0.6, R], [4 + T / 2, 0.6, R], [4 - R, 0.6, 3 + T / 2], [-T / 2, 0.6, 3 - R]];
      var m = flatOf(tray('outside') + cc(Q, { cornerType: 'butt', gap: GAP, coplanar: false }));
      near(polyVol(m.mp) - polyVol(mo.mp), 4 * (T * ((R - G2) - G2) - SEC * (R + G2) / 2), 1e-7, 'material outside, butt (the front wall trimmed gap/√2, its bend tapered from R)');
      assert(m.flat.loops.length === 1, 'material outside: one flat loop');
      var dxf = K.exportDXFFlat(m.flat, 'in', { version: 'R2000', style: 'entities' }), c = DxfCheck.check(dxf, { units: 'in' });
      assert(c.ok && c.loops.filter(function (l) { return l.layer === 'OUTLINE'; }).length === 1, 'dxf-check: ' + c.errors.join('; '));
      // a wall's inside face across a narrow channel is not the end of a flange
      var chan = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 0.5, 3).end().baseFlange();\np.flange(1, [[0, ' + T + ', 1.5], [0.5, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\n';
      var w = build(chan + cc([[T, 0.6, 1.5]], {}));
      assert(/is not the end of a flange/.test(errOf(w)), 'wide face: ' + errOf(w));
      return 'ok';
    });

    test('rfCS: generateScript round trip (overlap .75, coplanar off) keeps the feature and the volume; a mm part defaults to a .25 mm gap', function () {
      var r = build(HEAD + cc(F4, { cornerType: 'overlap', ratio: 0.75, coplanar: false, gap: 0.02 }));
      noErrors(r);
      var s = K.generateScript(r.model);
      assert(/p\.closedCorner\(\[\[/.test(s) && /cornerType: "overlap"/.test(s) && /ratio: 0\.75/.test(s) && /coplanar: false/.test(s) && /gap: 0\.02/.test(s), 'script: ' + s.split('\n').filter(function (l) { return /closedCorner/.test(l); }).join(' '));
      var r2 = build(s);
      noErrors(r2);
      nearRel(r2.mp.volume, r.mp.volume, 1e-12, 'volume after the round trip');
      var a = r.model.features[r.model.features.length - 1], b = r2.model.features[r2.model.features.length - 1];
      assert(JSON.stringify([a.type, a.faces, a.cornerType, a.gap, a.ratio, a.coplanar, a.name]) === JSON.stringify([b.type, b.faces, b.cornerType, b.gap, b.ratio, b.coplanar, b.name]), 'feature: ' + JSON.stringify(b));
      var m = K.newModel('mm'); K.runScript(m, 'p.units("mm"); p.sheet(1.5, 1.5, 0.5); p.sketch("Top").rect(0, -60, 100, 60).end().baseFlange(); p.flange(25, [[50, 1.5, 0]], { position: "inside", lengthRef: "outer" }); p.flange(25, [[0, 1.5, 30]], { position: "inside", lengthRef: "outer" }); p.closedCorner([[0.75, 15, 3]]);');
      var g = m.features[m.features.length - 1];
      assert(g.gap === 0.25 && g.cornerType === 'butt' && g.ratio === 1, 'mm defaults: ' + JSON.stringify(g));
      var bm = K.rebuild(m);
      assert(!Object.keys(bm.errors).length, 'mm build: ' + JSON.stringify(bm.errors));
      return 'ok';
    });
  })();

  // --- rfCS (lane CS) Auto Relief: the sheet's default relief (SolidWorks' Base Flange / Sheet-Metal group, Rectangular,
  // ratio 0.5) for an Edge Flange without a relief of its own; sheets without it (every older part and script) keep none.
  (function () {
    group('rfCS: Auto Relief (sheet default relief, ratio, explicit flange relief wins, old sheets unchanged, round trip)');
    var T = 0.0598, R = 0.0598;
    // a 4 × 3 base with a 2 wide tab on the back edge (z 3..4, x 1..3); the flange on the back edge's left part stops at
    // the tab, so the sheet continues past its x = 1 end (a relief there) and not past its x = 0 end
    function part(sheetOpts, flangeOpts, hem) {
      return 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5' + (sheetOpts ? ', ' + JSON.stringify(sheetOpts) : '') + ');\n' +
        'p.sketch("Top").polyline([[0, 0], [4, 0], [4, -3], [3, -3], [3, -4], [1, -4], [1, -3], [0, -3]], true).end().baseFlange();\n' +
        (hem ? 'p.hem(0.25, [[0.5, ' + T + ', 3]], { hemType: "closed" });\n' :
          'p.flange(1, [[0.5, ' + T + ', 3]], ' + JSON.stringify(Object.assign({ position: 'inside', lengthRef: 'outer' }, flangeOpts || {})) + ');\n');
    }
    test('rfCS: Auto Relief rect 0.5 = a flange\'s own Rectangle relief .5T × .5T; none on a sheet without it; the flange\'s own relief (or None) wins', function () {
      var auto = build(part({ relief: 'rect' })), own = build(part(null, { relief: 'rect', reliefWidth: 0.5 * T, reliefDepth: 0.5 * T })), bare = build(part(null));
      [auto, own, bare].forEach(noErrors);
      assert(auto.model.sheet.relief === 'rect' && auto.model.sheet.reliefRatio === 0.5, 'sheet: ' + JSON.stringify(auto.model.sheet));
      nearRel(auto.mp.volume, own.mp.volume, 1e-12, 'auto relief = own .5T relief');
      assert(bare.mp.volume - auto.mp.volume > 0.25 * T * T * T, 'the relief removes material: ' + fmt(bare.mp.volume - auto.mp.volume));
      var none = build(part({ relief: 'rect' }, { relief: 'none' }));
      noErrors(none);
      nearRel(none.mp.volume, bare.mp.volume, 1e-12, 'relief "none" on the flange wins over the sheet');
      var ob = build(part({ relief: 'obround', reliefRatio: 1 })), obOwn = build(part(null, { relief: 'obround', reliefWidth: T, reliefDepth: T }));
      noErrors(ob);
      nearRel(ob.mp.volume, obOwn.mp.volume, 1e-12, 'obround ratio 1 = own obround T × T');
      var fa = K.flatPattern(auto.model, auto.build, auto.mesh), fb = K.flatPattern(own.model, own.build, own.mesh), fc = K.flatPattern(bare.model, bare.build, bare.mesh);
      assert(JSON.stringify(fa.loops) === JSON.stringify(fb.loops), 'same flat as the own relief');
      function area(fl) { return fl.loops.reduce(function (s, l, i) { return s + (i === 0 ? K.signedArea(l) : -Math.abs(K.signedArea(l))); }, 0); }
      assert(area(fc) - area(fa) > 0.25 * T * T, 'the relief notch is in the flat: ' + fmt(area(fc) - area(fa)));
      return 'relief volume ' + fmt(bare.mp.volume - auto.mp.volume);
    });
    test('rfCS: Auto Relief round trip through generateScript; ratio 0 and an unknown type are refused; a hem ignores it', function () {
      var r = build(part({ relief: 'rect', reliefRatio: 0.75 }));
      noErrors(r);
      var s = K.generateScript(r.model);
      assert(/p\.sheet\([^)]*relief: "rect", reliefRatio: 0\.75/.test(s), 'script: ' + s.split('\n').filter(function (l) { return /p\.sheet/.test(l); })[0]);
      var r2 = build(s); noErrors(r2);
      nearRel(r2.mp.volume, r.mp.volume, 1e-12, 'volume after the round trip');
      var bad = false;
      try { K.makeSheet({ thickness: T, relief: 'rect', reliefRatio: 0 }); } catch (e) { bad = /ratio must be greater than zero/.test(e.message); }
      assert(bad, 'ratio 0 refused');
      bad = false;
      try { K.makeSheet({ thickness: T, relief: 'tear' }); } catch (e) { bad = /Unknown auto relief type/.test(e.message); }
      assert(bad, 'tear refused (not built)');
      var hemAuto = build(part({ relief: 'rect' }, null, true)), hemBare = build(part(null, null, true));
      noErrors(hemAuto); noErrors(hemBare);
      nearRel(hemAuto.mp.volume, hemBare.mp.volume, 1e-12, 'a hem takes no auto relief');
      return 'ok';
    });
  })();
