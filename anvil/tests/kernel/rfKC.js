  // --- rfKC (2026-11-09, lane mitreplane) --- STEP bends whole on boxes and trays (test-reports/2026-11-06-step-audit.md
  // items 1 and 2). The audit's "one mitre plane" cannot hold: SolidWorks' Butt / Closed Corner / edge-flange mitre walls
  // end square, and a bend end joining a square wall end to the base's square corner is not planar (SolidWorks writes it
  // as a free-form face). What kept the bends faceted was Anvil's own facets: the twisted end faces were fanned to
  // midpoints ON THE CHORDS (inside the cylinders by the sagitta), a Miter Flange's tapered end had corners inside
  // facets, and a cut crossing a bend met it on a chord. Now the ends are halved through the depth (wrapRegion,
  // wrapMesh), tapers run on the bend's own zone lines, and the STEP writer moves a vertex where planes cross a chord
  // onto the true cylinder (snapToCylinders): each bend is two CYLINDRICAL_SURFACEs bounded by one ELLIPSE per facet of
  // the end. 14 ga (T .0747), R .06, K .5, inches.
  (function () {
    group('rfKC: STEP bends whole on mitred trays, Closed Corner boxes, Miter Flange corners and bends met by a neighbour');
    var T = 0.0747, R = 0.06, RT = R + T;
    var HEAD = 'p.name("Tray").units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n';
    var E4 = '[[2, ' + T + ', 0], [4, ' + T + ', 1.5], [2, ' + T + ', 3], [0, ' + T + ', 1.5]]';
    var TRAY = HEAD + 'p.flange(1, ' + E4 + ', { position: "inside" });\n';
    var BOX = HEAD + E4 + '.forEach(function (e) { p.flange(1, [e], { position: "inside", lengthRef: "outer" }); });\n' +
      'p.closedCorner([[' + T / 2 + ', 0.6, ' + RT + '], [' + (4 - RT) + ', 0.6, ' + (3 - T / 2) + '], [' + T / 2 + ', 0.6, ' + (3 - RT) + ']], { cornerType: "butt", gap: 0.01 });\n';
    var MF = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.sketch("Right").line(-2, ' + T + ', -2, ' + (T + 1) + ')';
    function rfKCcount(text, re) { return (text.match(re) || []).length; }
    function rfKCarea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? Math.abs(K.signedArea(l)) : -Math.abs(K.signedArea(l))); }, 0); }
    // build, export with Anvil's writer, read back: { src, step, back, flat }
    function rfKCtrip(code) {
      var src = build(code); noErrors(src);
      var step = Exchange.exportSTEP(src.model, src.build, { faceted: true });
      var m = Exchange.newPartFromImport(Exchange.importFile('part.step', step, { units: 'in' }));
      var b = K.rebuild(m), mesh = K.meshFromBody(b.body);
      return { src: src, step: step, back: { mesh: mesh, mp: K.massProps(mesh) }, flat: K.flatPattern(src.model, src.build, src.mesh) };
    }
    // every bend written whole: n cylinders, half of them R and half R + T; the round trip exact; both solids closed
    function rfKCwhole(r, bends, label) {
      var rs = [];
      r.step.replace(/CYLINDRICAL_SURFACE\('',#\d+,([^)]+)\)/g, function (m0, x) { rs.push(+x); return m0; });
      var inner = rs.filter(function (x) { return Math.abs(x - R) < 1e-9; }).length, outer = rs.filter(function (x) { return Math.abs(x - RT) < 1e-9; }).length;
      assert(inner === bends && outer === bends, label + ': ' + bends + ' bends written whole, got ' + inner + ' inner and ' + outer + ' outer cylinders');
      nearRel(r.back.mp.volume, r.src.mp.volume, 1e-9, label + ': round trip volume');
      for (var k = 0; k < 3; k++) { near(r.back.mp.bbox.min[k], r.src.mp.bbox.min[k], 1e-9, label + ': box min ' + k); near(r.back.mp.bbox.max[k], r.src.mp.bbox.max[k], 1e-9, label + ': box max ' + k); }
      [r.src.mesh, r.back.mesh].forEach(function (mh, i) {
        var q = K.meshQuality(mh);
        assert(q.closed && !q.openEdges && !q.nonManifoldEdges, label + (i ? ': read back' : ': built') + ' closed ' + JSON.stringify(q));
      });
    }

    test('rfKC: 4-edge mitred tray (Butt corners): all 4 bends whole, an ELLIPSE per facet of each tapered end, round trip to 1e-9; flat and folded volume as before', function () {
      var r = rfKCtrip(TRAY);
      rfKCwhole(r, 4, 'tray');
      assert(rfKCcount(r.step, /=ELLIPSE\(/g) >= 64, 'tapered ends bounded by ellipses: ' + rfKCcount(r.step, /=ELLIPSE\(/g));
      nearRel(r.src.mp.volume, 1.907915515202461, 1e-12, 'folded volume (unchanged: the halves keep the twisted patch\'s volume)');
      nearRel(rfKCarea(r.flat), 25.562206738168644, 1e-12, 'blank area (unchanged)');
      near(r.flat.size[0], 6.036434044826967, 1e-12, 'flat length'); near(r.flat.size[1], 5.036434044826967, 1e-12, 'flat width');
    });

    test('rfKC: Closed Corner box (Butt, gap .01): all 4 bends whole, round trip to 1e-9, the folded solid now closed (the fan midpoints left open edges), flat as before', function () {
      var r = rfKCtrip(BOX);
      rfKCwhole(r, 4, 'box');
      nearRel(r.src.mp.volume, 1.7724193539866366, 1e-9, 'folded volume (5e-10: the bounding planes of the slivers moved with the split)');
      nearRel(r.src.mp.polygonal.volume, 1.771464945920724, 1e-12, 'faceted volume unchanged');
      nearRel(rfKCarea(r.flat), 23.727166720034646, 1e-12, 'blank area (unchanged)');
    });

    test('rfKC: two inside flanges on adjacent edges (no relief): the second bend ends on the first one\'s start, its vertex moved onto the cylinder in the file: both bends whole, exact', function () {
      var r = rfKCtrip(HEAD + 'p.flange(1, [[2, ' + T + ', 0]], { position: "inside" });\np.flange(1, [[4, ' + T + ', 1.5]], { position: "inside" });\n');
      rfKCwhole(r, 2, 'adjacent');
      nearRel(r.back.mp.volume, r.src.mp.volume, 1e-12, 'round trip to 1e-12');
    });

    test('rfKC: the same with a Rectangle / Obround auto relief: the relief notches the first bend (an L in (angle, t)); since lane stepin2 the reader takes it and the bend is written whole; read back closed', function () {
      ['rect', 'obround'].forEach(function (rl) {
        var r = rfKCtrip(HEAD.replace('0.5);', '0.5, { relief: "' + rl + '" });') + 'p.flange(1, [[2, ' + T + ', 0]], { position: "inside" });\np.flange(1, [[4, ' + T + ', 1.5]], { position: "inside" });\n');
        var rs = [];
        r.step.replace(/CYLINDRICAL_SURFACE\('',#\d+,([^)]+)\)/g, function (m0, x) { rs.push(+x); return m0; });
        var inner = rs.filter(function (x) { return Math.abs(x - R) < 1e-9; }).length, outer = rs.filter(function (x) { return Math.abs(x - RT) < 1e-9; }).length;
        assert(inner === outer && inner >= 1, rl + ': bends whole or faceted, never half: ' + inner + ' inner, ' + outer + ' outer');
        nearRel(r.back.mp.volume, r.src.mp.volume, 3e-4, rl + ': round trip (the notched bend\'s facets)');
        var q = K.meshQuality(r.back.mesh);
        assert(q.closed && !q.openEdges && !q.nonManifoldEdges, rl + ': read back closed');
      });
    });

    test('rfKC: Miter Flange corner (straight profile, gap .01): both bends whole (the taper on the bend\'s zone lines), round trip to 1e-9; folded within 3e-6 of the 3-chord taper (SolidWorks\' number), flat unchanged', function () {
      var r = rfKCtrip(MF + '.end();\np.miterFlange([[2, ' + T + ', 2], [4, ' + T + ', 1]], { position: "inside", miterGap: 0.01 });\n');
      rfKCwhole(r, 2, 'miter flange');
      nearRel(r.src.mp.volume, 1.0146194432901925, 3e-6, 'folded volume against the 3-chord taper');
      nearRel(rfKCarea(r.flat), 13.585906768713292, 1e-12, 'blank area (unchanged)');
    });

    test('rfKC: Miter Flange L profile: all 4 bends whole (the later stage\'s end on the zone lines too), round trip to 1e-9, flat unchanged', function () {
      var r = rfKCtrip(MF + '.line(-2, ' + (T + 1) + ', -2.5, ' + (T + 1) + ').end();\np.miterFlange([[2, ' + T + ', 2], [4, ' + T + ', 1]], { position: "inside", miterGap: 0.01 });\n');
      rfKCwhole(r, 4, 'L miter flange');
      nearRel(r.src.mp.volume, 1.2714000020751197, 3e-6, 'folded volume against the 12-chord end');
      nearRel(rfKCarea(r.flat), 17.028988438157548, 1e-12, 'blank area (unchanged)');
    });

    test('rfKC: Trim side bends (Edge Flange Material Inside and Outside, Miter Flange): bends whole, round trip exact', function () {
      var side = 'p.flange(1, [[4, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\n';
      ['inside', 'outside'].forEach(function (pos) {
        rfKCwhole(rfKCtrip(HEAD + side + 'p.flange(1, [[2, ' + T + ', 3]], { position: "' + pos + '", lengthRef: "outer", trimSideBends: true });\n'), 2, 'trim ' + pos);
      });
      rfKCwhole(rfKCtrip('p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.flange(1, [[4, ' + T + ', 1]], { position: "inside", lengthRef: "outer" });\n' +
        'p.sketch("Right").line(0, ' + T + ', 0, ' + (T + 1) + ').end();\np.miterFlange([[2, ' + T + ', 0]], { trimSideBends: true });\n'), 2, 'miter flange trim');
    });
  })();
  // --- end rfKC ---
