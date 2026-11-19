  // --- rfQY (2026-11-19, lane QY stepin) --- Anvil's own STEP reader on a run of real customer files (the files are not
  // in this repository: every fault is rebuilt here with a part made in the test or a patch written by the test).
  // (1) A cone placed at its apex (radius 0 in the file: a countersink or a point to its tip) was refused; it is re-based
  //     along its axis to its boundary's middle height.
  // (2) The parameter mesher (paramPatch): a ruled face one step across and hundreds along (a thread's flank) put every
  //     in-circle test under a tolerance scaled by the patch's whole size: no flip, fans from end to end, the refinement
  //     gave up (refused). The tolerance is the four points' own size; a step longer than the patch is a straight way.
  // (3) Refusals are decided before tessellating when a face lies on a surface no path reads, else at the first face
  //     refused (a 4.7 MB assembly took 22 s to be refused).
  // (4) A free-form face's points moved off the surface by the volume fix stay inside the box of the points on the
  //     surfaces where a side of that box is a plane face (a corner round made a 38 x 70 mm part read 38.045 x 70.024),
  //     the volume they took given back by the other moved points (rfMR's variable blend stays at 2e-7).
  // (5) A triangle the kernel's polygons drop (doubled area under 1e-12, absolute: a part 3.5 mm long in inches) gives
  //     its longest edge to its neighbour (flipSlivers), so the imported body stays closed.
  (function () {
    group('rfQY: STEP reader on real files: cones at their apex, long thin ruled faces, early refusals, true size of free-form parts, slivers on tiny parts');
    var X = typeof Exchange !== 'undefined' ? Exchange : null;
    function rfQYneedX() { if (!X) fail('exchange.js is not loaded'); }
    function rfQYpart(code) { var m = K.newModel('rfQY'); K.runScript(m, 'p.units("in");\n' + code); var b = K.rebuild(m); noErrors({ errors: b.errors }); return { model: m, build: b, step: X.exportSTEP(m, b) }; }
    function rfQYbox(P) { var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (var i = 0; i < P.length; i += 3) for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); } return { lo: lo, hi: hi }; }
    var CONE = 'p.sketch("Front").line(0, 0, 1, 0).line(1, 0, 1, 2).line(1, 2, 0, 3).line(0, 3, 0, 0).end().revolve(360);\n';

    test('rfQY: a cone placed at its apex (radius 0) reads: a pointed cylinder 1 x 2 + cone 1 high, its CONICAL_SURFACE re-placed at the tip, volume 7π/3 to 1e-9, closed', function () {
      rfQYneedX();
      var s = rfQYpart(CONE).step;
      var c = /CONICAL_SURFACE\('[^']*',#(\d+),([-0-9.E+]+),([-0-9.E+]+)\)/.exec(s);
      assert(c, 'the part has a CONICAL_SURFACE');
      var ax = new RegExp('#' + c[1] + '=AXIS2_PLACEMENT_3D\\(\'[^\']*\',#(\\d+),#(\\d+)').exec(s);
      var pt = new RegExp('#' + ax[1] + '=CARTESIAN_POINT\\(\'[^\']*\',\\(([^)]*)\\)\\)').exec(s), dr = new RegExp('#' + ax[2] + '=DIRECTION\\(\'[^\']*\',\\(([^)]*)\\)\\)').exec(s);
      var o = pt[1].split(',').map(Number), d = dr[1].split(',').map(Number), r = +c[2], k = Math.tan(+c[3]);
      var apex = o.map(function (x, i) { return x - d[i] * r / k; });
      near(apex[1], 3, 1e-9, 'apex height');
      var s2 = s.replace(pt[0], '#' + ax[1] + "=CARTESIAN_POINT('',(" + apex.join(',') + '))').replace(c[0], c[0].replace(',' + c[2] + ',', ',0.,'));
      assert(s2 !== s && /CONICAL_SURFACE\('[^']*',#\d+,0\.,/.test(s2), 'the cone is re-placed at its apex');
      var res = X.importFile('rfQY.step', s2, { units: 'in' }), b = K.rebuild(X.newPartFromImport(res)), mesh = K.meshFromBody(b.body), q = K.meshQuality(mesh);
      nearRel(K.massProps(mesh, 1).volume, 7 * Math.PI / 3, 1e-9, 'volume');
      assert(q.closed && !q.openEdges, 'closed: ' + q.openEdges + ' open edges');
      return 'faces ' + res.stats.faces + ', ' + res.stats.triangles + ' triangles';
    });

    test('rfQY: a face on a surface no path reads (OFFSET_SURFACE) is refused before any face is tessellated, the message naming it; a refusal at a face stops there', function () {
      rfQYneedX();
      var s = rfQYpart(CONE).step.replace(/CONICAL_SURFACE\('',(#\d+),[^)]*\)/, "OFFSET_SURFACE('',$1,0.1,.F.)"), msg = '', tr = [];
      try { X.importSTEP(s, { units: 'in', trace: tr }); } catch (e) { msg = String(e.message); }
      assert(/curved faces \(1 OFFSET_SURFACE\)/.test(msg), 'message: ' + msg);
      assert(tr.length === 0, tr.length + ' faces were tessellated before the refusal');
      return msg.slice(0, 60);
    });

    test('rfQY: paramPatch meshes a ruled strip 1 wide (straight that way) and 240 long with a dense run-out at one end (a thread flank): it finishes, and with few triangles', function () {
      rfQYneedX();
      if (!X.paramPatch) fail('Exchange.paramPatch is not exported');
      var L = [], v;
      for (v = 250; v >= 10; v -= 0.125) L.push([0.02 * Math.sin(v / 9), v, 0]);
      for (var k = 1; k < 400; k++) L.push([k / 400, 10 - 5 * Math.sin(Math.PI * k / 400), 0]);
      for (v = 10.05; v <= 250; v += 0.125) L.push([1 + 0.02 * Math.sin(v / 7), v, 0]);
      var A = { uv: function (p) { return [p[0], p[1], false]; }, at: function (u, w) { return [u, w, 0]; }, pu: 0, pv: 0, hs: 8e4, ht: 0.5, su: 0.9, sv: 0.0036 };
      var t0 = Date.now(), res = X.paramPatch([L], 0, A), ms = Date.now() - t0;
      assert(res, 'the strip was not meshed (the refinement gave up)');
      assert(res.T.length < 3 * L.length, res.T.length + ' triangles for ' + L.length + ' boundary points');
      return L.length + ' points -> ' + res.T.length + ' triangles, ' + ms + ' ms';
    });

    test('rfQY: the true-size clamp holds moved points only at a plane side of the box: a loft bulging through three circles (r 1, 1.5, 1, no plane at its sides) keeps its volume fix, volume to 1e-4 of the part, and its box reaches r 1.5', function () {
      rfQYneedX();
      var p = rfQYpart('var a = p.sketch("Top").circle(0, 0, 1).id();\nvar b = p.sketch("Top", 1).circle(0, 0, 1.5).id();\nvar c = p.sketch("Top", 2).circle(0, 0, 1).id();\np.loft([a, b, c]);\n');
      var res = X.importFile('rfQY.step', p.step, { units: 'in' }), bx = rfQYbox(res.solids[0].positions);
      var vRead = K.massProps(K.meshFromBody(K.rebuild(X.newPartFromImport(res)).body), 1).volume, vPart = K.massProps(K.meshFromBody(p.build.body), 1).volume;
      nearRel(vRead, vPart, 1e-4, 'volume read');
      assert(bx.hi[0] >= 1.5 - 1e-9 && bx.lo[0] <= -1.5 + 1e-9, 'box x ' + bx.lo[0] + ' .. ' + bx.hi[0]);
      assert(bx.hi[1] <= 2 + 1e-9 && bx.lo[1] >= -1e-9, 'box y ' + bx.lo[1] + ' .. ' + bx.hi[1]);
      return 'volume ' + (vRead / vPart - 1).toExponential(1) + ', box x ' + bx.hi[0];
    });

    test('rfQY: flipSlivers gives a sliver\'s longest edge (doubled area 1e-13) to its neighbour: two triangles of area, the same four points, same turn', function () {
      rfQYneedX();
      if (!X.flipSlivers) fail('Exchange.flipSlivers is not exported');
      var m = { positions: [0, 0, 0, 1, 0, 0, 0.5, 1e-13, 0, 0.5, -1, 0], triangles: [0, 1, 2, 1, 0, 3] };
      var done = X.flipSlivers(m), T = m.triangles, P = m.positions;
      assert(done === 1, done + ' flips');
      for (var t = 0; t < 2; t++) {
        var a = T[3 * t] * 3, b = T[3 * t + 1] * 3, c = T[3 * t + 2] * 3;
        var nz = (P[b] - P[a]) * (P[c + 1] - P[a + 1]) - (P[b + 1] - P[a + 1]) * (P[c] - P[a]);
        assert(nz > 1e-3, 'triangle ' + t + ' area ' + nz);
      }
      assert(T.slice().sort().join() === '0,1,2,2,3,3', 'the same points: ' + T.join());
      return JSON.stringify(T);
    });
  })();
