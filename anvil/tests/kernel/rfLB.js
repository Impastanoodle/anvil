  // --- rfLB (2026-11-11, lane occtparity-2) --- 2 Bend Corner Relief solids that were not closed: a non-rectangular
  // relief piece in a bend (circular, obround, constant width) was cut with a wrapped tool, which cracks the BSP on
  // some corners (the obround .25 on the 4 × 3 tray of test-reports/2026-11-11-occt-sheetmetal-parity.md case 63: 27
  // open, 10 non-manifold edges; circular .5 at the corner: 26 open, 13 non-manifold, and the volume up to 4.7e-3
  // off). The 2 Bend layout now goes through crBendCut, as the 3 Bend corner does, and cornerReliefApply takes 2 Bend
  // corners too: the bend's band is cut out by exact radial planes and its metal less the piece put back. Volumes
  // below are OpenCascade's (exact arcs; 14 ga R .06 K .5 inch tray 4 × 3, 1 in flanges to the outer virtual sharp).
  (function () {
    group('rfLB: 2 Bend Corner Relief solids closed (circular / obround across the bends), volumes = OpenCascade\'s');
    var T = 0.0747, R = 0.06;
    function head(pos, mm) {
      if (mm) return 'p.units("mm");\np.sheet(2, 2, 0.44);\np.sketch("Top").rect(0, -75, 100, 75).end().baseFlange();\np.flange(25, [[100, 2, 37.5]], { position: "' + pos + '", lengthRef: "outer" });\np.flange(25, [[50, 2, 75]], { position: "' + pos + '", lengthRef: "outer" });\n';
      return 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[4, ' + T + ', 1.5]], { position: "' + pos + '", lengthRef: "outer" });\np.flange(1, [[2, ' + T + ', 3]], { position: "' + pos + '", lengthRef: "outer" });\n';
    }
    var corner = {};
    function rfLBcase(pos, type, size, centred, mm) {
      var key = pos + (mm ? 'mm' : '');
      if (!corner[key]) { var m0 = K.newModel('T'); K.runScript(m0, head(pos, mm)); corner[key] = K.cornerReliefCandidates(m0, K.rebuild(m0))[0].at; }
      var r = build(head(pos, mm) + 'p.cornerRelief([' + JSON.stringify(corner[key]) + '], ' + size + ', { reliefType: "' + type + '"' + (centred ? '' : ', centeredOnBend: false') + ' });\n');
      noErrors(r);
      var c = Evaluate.checkBody(r.body);
      assert(!c.openEdges.length && !c.nonManifoldEdges.length, [pos, type, size, centred ? 'centred' : 'on P'].join(' ') + ': open ' + c.openEdges.length + ', non-manifold ' + c.nonManifoldEdges.length);
      r.flat = K.flatPattern(r.model, r.build, r.mesh);
      r.area = r.flat.loops.reduce(function (s, l, i) { return s + (i ? -1 : 1) * Math.abs(K.signedArea(l)); }, 0);
      return r;
    }
    // [position, type, size, centred, OpenCascade volume, flat blank area, mm]
    var CASES = [
      ['inside', 'obround', 0.25, true, 1.3437826105852515, 17.98905766281468],   // case 63
      ['inside', 'circular', 0.5, false, 1.3361919568586655, 17.887442530972077],
      ['outside', 'circular', 0.12, false, 1.3923175320884704, 18.638788933001443],
      ['outside', 'circular', 0.5, false, 1.3811207244736095, 18.488898590074427],
      ['outside', 'obround', 0.25, true, 1.3889262633909996, 18.593390409456614],
      ['outside', 'obround', 0.5, true, 1.37418359796304, 18.39603210285962],
      ['bendOutside', 'circular', 0.5, false, 1.4178957455241108, 18.981201415382284],   // the open solid's flat was 18.968851 (blank x T now = the volume)
      ['bendOutside', 'obround', 0.25, true, 1.4255217652337806, 19.083289987426816],
      ['inside', 'obround', 5, true, 22355.582308382523, 11146.697365689553, true]
    ];
    test('rfLB: the 9 reliefs that left open / non-manifold edges are closed; volume = OpenCascade\'s to 1e-6, the flat\'s blank as before (1e-7)', function () {
      CASES.forEach(function (c) {
        var r = rfLBcase(c[0], c[1], c[2], c[3], c[6]), tag = c.slice(0, 4).join(' ');
        nearRel(r.mp.volume, c[4], 1e-6, tag + ': volume');
        nearRel(r.area, c[5], 1e-7, tag + ': flat blank');
      });
    });
    test('rfLB: every 2 Bend type at .12 / .25 / .5, centred and on P, on Material Inside: closed (the other positions: the occtparity-2 sweep)', function () {
      ['rect', 'circular', 'obround', 'constantWidth'].forEach(function (t) {
        [0.12, 0.25, 0.5].forEach(function (s) { [true, false].forEach(function (cen) { rfLBcase('inside', t, s, cen); }); });
      });
      rfLBcase('inside', 'tear', null, true);
    });
  })();
