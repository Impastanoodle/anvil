  // --- rfJD (2026-11-05, lane smtrim: test-reports/2026-11-05-sheetmetal-pm-audit.md rows 7, 13, 16) --- Edge Flange /
  // Miter Flange ▸ Trim side bends (trimSideBends: an earlier bend running on past an end of a Material Inside /
  // Outside flange's edge is cut back by the same trim, its flat strip shortened by it: kernel-sheetmetal.js
  // sideBendTrim) and Corners ▸ Corner Relief (type 'cornerRelief', 2 Bend corners: cornerReliefLayout). 16 ga, R = T,
  // K .5 (a bend's exact volume is BA·T per length), inches, a 4 × 3 base with flanges on the right and front edges.
  (function () {
    group('rfJD: Trim side bends (Edge / Miter Flange) and Corner Relief (rect, tear, circular, obround, constant width)');
    var T = 0.0598, R = 0.0598, BA = Math.PI / 2 * (R + T / 2);
    var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n';
    function side(pos) { return 'p.flange(1, [[4, ' + T + ', 1.5]], { position: "' + (pos || 'inside') + '", lengthRef: "outer" });\n'; }
    function front(pos, trim) { return 'p.flange(1, [[2, ' + T + ', 3]], { position: "' + (pos || 'inside') + '", lengthRef: "outer"' + (trim ? ', trimSideBends: true' : '') + ' });\n'; }
    function blankArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? Math.abs(K.signedArea(l)) : -Math.abs(K.signedArea(l))); }, 0); }
    function make(code) {
      var r = build(code);
      r.flat = K.flatPattern(r.model, r.build, r.mesh);
      return r;
    }
    function exact(r, label, tol, th) {
      noErrors(r);
      var c = Evaluate.checkBody(r.body, { maxPairs: 1 });
      assert(!c.openEdges.length && !c.nonManifoldEdges.length, label + ': closed solid (' + c.openEdges.length + ' open, ' + c.nonManifoldEdges.length + ' non-manifold)');
      assert(r.flat.loops.length === 1, label + ': one blank loop, got ' + r.flat.loops.length);
      nearRel(r.mp.volume, blankArea(r.flat) * (th || T), tol || 1e-9, label + ': folded volume = blank area × T');
    }
    function errOf(r) { var ids = Object.keys(r.errors || {}); return ids.length ? r.errors[ids[ids.length - 1]] : ''; }
    var CORNER = '[[3.88, 0.06, 2.88]]';

    test('rfJD: Trim side bends, Material Inside: the right bend loses its last R + T (π/4·((R+T)² − R²)·(R+T)), its strip ends R + T short: a BA × (R + T) notch', function () {
      var a = make(HEAD + side() + front()), b = make(HEAD + side() + front('inside', true));
      exact(a, 'without'); exact(b, 'with');
      near(a.mp.volume - b.mp.volume, Math.PI / 4 * ((R + T) * (R + T) - R * R) * (R + T), 1e-12, 'removed: the side bend\'s last R + T');
      near(blankArea(a.flat) - blankArea(b.flat), BA * (R + T), 1e-9, 'blank: the notch BA × (R + T)');
      near(b.flat.size[0], a.flat.size[0], 1e-12, 'flat width unchanged'); near(b.flat.size[1], a.flat.size[1], 1e-12, 'flat height unchanged');
      var bl = b.flat.bends.filter(function (x) { return Math.abs(x.a[0] - x.b[0]) < 1e-9; })[0];
      assert(bl && Math.abs(Math.abs(bl.a[1] - bl.b[1]) - (3 - R - T)) < 1e-9, 'the right bend line is 3 − (R + T) long: ' + JSON.stringify(bl));
    });
    test('rfJD: Trim side bends, Material Outside trims R; Bend Outside trims nothing (the option changes nothing)', function () {
      var a = make(HEAD + side() + front('outside')), b = make(HEAD + side() + front('outside', true));
      exact(b, 'outside');
      near(a.mp.volume - b.mp.volume, Math.PI / 4 * ((R + T) * (R + T) - R * R) * R, 1e-12, 'removed: the side bend\'s last R');
      var c = make(HEAD + side() + front('bendOutside')), d = make(HEAD + side() + front('bendOutside', true));
      exact(d, 'bend outside');
      near(c.mp.volume, d.mp.volume, 1e-14, 'Bend Outside: same solid');
    });
    test('rfJD: Trim side bends at both ends (U: flanges right and left first), at the side of an Outside / Bend Outside right flange, the other order, and picked on the bottom face', function () {
      var u = make(HEAD + 'p.flange(1, [[4, ' + T + ', 1.5], [0, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\n' + front('inside', true));
      exact(u, 'U');
      var u0 = make(HEAD + 'p.flange(1, [[4, ' + T + ', 1.5], [0, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\n' + front('inside'));
      near(u0.mp.volume - u.mp.volume, 2 * Math.PI / 4 * ((R + T) * (R + T) - R * R) * (R + T), 1e-12, 'both side bends trimmed');
      exact(make(HEAD + side('outside') + front('inside', true)), 'right Material Outside');
      exact(make(HEAD + side('bendOutside') + front('inside', true)), 'right Bend Outside');
      var rev = make(HEAD + front() + 'p.flange(1, [[4, ' + T + ', 1]], { position: "inside", lengthRef: "outer", trimSideBends: true });\n');
      exact(rev, 'front first, the right flange trims the front bend');
      var bot = make(HEAD + side() + 'p.flange(1, [[2, 0, 3]], { position: "inside", lengthRef: "outer", trimSideBends: true });\n');
      exact(bot, 'edge picked on the bottom face');
      exact(make(HEAD + side('inside') + front('inside', true).replace('trimSideBends: true', 'trimSideBends: true, relief: "rect"')), 'with a Rectangle relief (none at the trimmed end)');
      exact(make('p.units("mm");\np.sheet(2, 2, 0.5);\np.sketch("Top").rect(0, -80, 100, 80).end().baseFlange();\np.flange(25, [[100, 2, 40]], { position: "inside", lengthRef: "outer" });\np.flange(25, [[50, 2, 80]], { position: "outside", lengthRef: "outer", trimSideBends: true });'), 'mm', 1e-9, 2);
    });
    test('rfJD: Miter Flange ▸ Trim side bends (the first stage is Material Inside): exact, the right bend trimmed by R + T', function () {
      var t6 = 0.06, H6 = 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.flange(1, [[4, 0.06, 1]], { position: "inside", lengthRef: "outer" });\np.sketch("Right").line(0, 0.06, 0, 1.06).end();\n';
      var a = make(H6 + 'p.miterFlange([[2, 0.06, 0]], {});'), b = make(H6 + 'p.miterFlange([[2, 0.06, 0]], { trimSideBends: true });');
      noErrors(a); noErrors(b);
      nearRel(b.mp.volume, blankArea(b.flat) * t6, 1e-9, 'folded = blank × T');
      near(a.mp.volume - b.mp.volume, Math.PI / 4 * 3 * t6 * t6 * 2 * t6, 1e-12, 'removed: the right bend\'s last R + T');
    });
    test('rfJD: Trim side bends round trip: Builder → feature JSON → generateScript → the same part (Edge and Miter Flange)', function () {
      var r = make(HEAD + side() + front('inside', true));
      var fl = r.model.features.filter(function (q) { return q.type === 'flange'; });
      assert(fl[1].trimSideBends === true && !fl[0].trimSideBends, 'feature JSON: ' + JSON.stringify(fl[1]));
      var s = K.generateScript(r.model);
      assert(/trimSideBends: true/.test(s), 'script writes it: ' + s);
      var r2 = make(s);
      near(r2.mp.volume, r.mp.volume, 1e-12, 'same volume');
      var m = make('p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.flange(1, [[4, 0.06, 1]], { position: "inside", lengthRef: "outer" });\np.sketch("Right").line(0, 0.06, 0, 1.06).end();\np.miterFlange([[2, 0.06, 0]], { trimSideBends: true });');
      var ms = K.generateScript(m.model);
      assert(/miterFlange\([^\n]*trimSideBends: true/.test(ms), 'miter script: ' + ms);
      near(make(ms).mp.volume, m.mp.volume, 1e-12, 'miter: same volume');
      var h = make(HEAD + 'p.hem(0.5, [[2, ' + T + ', 3]], { trimSideBends: true });');
      assert(!h.model.features[h.model.features.length - 1].trimSideBends, 'hems have no Trim side bends');
    });

    test('rfJD: Corner Relief candidates: one 2 Bend corner on the right / front flanges, at the corner of the start lines on the inside face; none on a single flange', function () {
      var r = make(HEAD + side() + front());
      var c = K.cornerReliefCandidates(r.model, r.build);
      assert(c.length === 1, 'one corner: ' + JSON.stringify(c));
      near(c[0].at[0], 4 - R - T, 1e-9, 'x'); near(c[0].at[1], T, 1e-9, 'y (inside face)'); near(c[0].at[2], 3 - R - T, 1e-9, 'z');
      var u = make(HEAD + 'p.flange(1, [[4, ' + T + ', 1.5], [0, ' + T + ', 1.5], [2, ' + T + ', 0], [2, ' + T + ', 3]], { position: "inside", lengthRef: "outer" });');
      assert(K.cornerReliefCandidates(u.model, u.build).length === 4, 'four corners on a four-flange tray');
      var one = make(HEAD + side());
      assert(K.cornerReliefCandidates(one.model, one.build).length === 0, 'no corner with one flange');
    });
    test('rfJD: Corner Relief Rectangular .25 centred on the bend lines: removes T × its area of the blank exactly (face, both strips by radial planes, both walls)', function () {
      var a = make(HEAD + side() + front()), b = make(HEAD + side() + front() + 'p.cornerRelief(' + CORNER + ', 0.25);');
      exact(b, 'rect');
      var aa = 0.125 - BA / 2, want = T * (2 * aa * aa + BA * (2 * aa + R + T) + aa * (aa + R + T));
      near(a.mp.volume - b.mp.volume, want, 1e-12, 'removed');
      near(blankArea(a.flat) - blankArea(b.flat), want / T, 1e-9, 'blank');
      // the notch's corners: the square C ± .125 (C = P + (BA/2, BA/2) in the flat)
      var o = b.flat.loops[0], P = [4 - R - T, -(3 - R - T)], C = [P[0] + BA / 2, P[1] - BA / 2];
      [[C[0] - 0.125, C[1] + 0.125], [C[0] + 0.125, C[1] + 0.125], [C[0] - 0.125, C[1] - 0.125]].forEach(function (q) {
        assert(o.some(function (p) { return Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6; }), 'outline has the relief corner ' + q.map(function (x) { return x.toFixed(4); }));
      });
      var nc = make(HEAD + side() + front() + 'p.cornerRelief(' + CORNER + ', 0.25, { centeredOnBend: false });');
      exact(nc, 'rect on the start lines\' corner');
      assert(Math.abs(nc.mp.volume - b.mp.volume) > 1e-5, 'not centred: a different cut');
    });
    test('rfJD: Corner Relief Tear: just the bend zones\' corner square; on Bend Outside flanges (already open there) it changes nothing', function () {
      var a = make(HEAD + side() + front()), b = make(HEAD + side() + front() + 'p.cornerRelief(' + CORNER + ', null, { reliefType: "tear" });');
      exact(b, 'tear');
      near(a.mp.volume - b.mp.volume, BA * T * (R + T), 1e-12, 'removed: the right bend\'s end in the corner square');
      var c = make(HEAD + side('bendOutside') + front('bendOutside') + 'p.cornerRelief([[4, ' + T + ', 3]], null, { reliefType: "tear" });');
      exact(c, 'bend outside tear');
    });
    test('rfJD: Corner Relief Circular Ø.25, Obround .25, Constant Width .1: wrapped across the bends, folded = blank × T to 1e-6, closed, the DXF blank one loop', function () {
      [['circular', 0.25], ['obround', 0.25], ['constantWidth', 0.1]].forEach(function (q) {
        ['inside', 'outside', 'bendOutside'].forEach(function (pos) {
          var at = pos === 'inside' ? CORNER : pos === 'outside' ? '[[3.94, 0.06, 2.94]]' : '[[4, 0.06, 3]]';
          var r = make(HEAD + side(pos) + front(pos) + 'p.cornerRelief(' + at + ', ' + q[1] + ', { reliefType: "' + q[0] + '" });');
          exact(r, q[0] + ' ' + pos, 1e-6);
        });
      });
      var c = make(HEAD + side() + front() + 'p.cornerRelief(' + CORNER + ', 0.25, { reliefType: "circular" });');
      var dxf = K.exportDXFFlat(c.flat, 'in', {});
      assert(/OUTLINE/.test(dxf) && !/HOLES/.test(dxf.split('ENTITIES')[1] || ''), 'one outline, no holes');
    });
    test('rfJD: Corner Relief errors (no corners, no corner there, unknown type, size 0) and round trip', function () {
      var base = HEAD + side() + front();
      assert(/select the corners/.test(errOf(make(base + 'p.cornerRelief([], 0.25);'))), 'no corners');
      assert(/no corner of two bends near/.test(errOf(make(base + 'p.cornerRelief([[0, 0.06, 0]], 0.25);'))), 'far pick: ' + errOf(make(base + 'p.cornerRelief([[0, 0.06, 0]], 0.25);')));
      assert(/has no corner where two bends meet/.test(errOf(make(HEAD + side() + 'p.cornerRelief(' + CORNER + ', 0.25);'))), 'one flange');
      assert(/greater than zero/.test(errOf(make(base + 'p.cornerRelief(' + CORNER + ', 0);'))), 'size 0');
      var bad = false; try { make(base + 'p.cornerRelief(' + CORNER + ', 0.25, { reliefType: "star" });'); } catch (e) { bad = /reliefType/.test(e.message); }
      assert(bad, 'unknown type refused by the Builder');
      var r = make(base + 'p.cornerRelief(' + CORNER + ', 0.2, { reliefType: "obround", centeredOnBend: false });');
      var f = r.model.features[r.model.features.length - 1];
      assert(f.type === 'cornerRelief' && f.name === 'Corner-Relief1' && f.reliefType === 'obround' && f.size === 0.2 && f.centeredOnBend === false, 'feature JSON: ' + JSON.stringify(f));
      assert(K.isCut(f, r.model), 'a cut');
      var s = K.generateScript(r.model);
      assert(/p\.cornerRelief\(\[\[3\.88,0\.06,2\.88\]\], 0\.2, \{ reliefType: "obround", centeredOnBend: false, name: "Corner-Relief1" \}\)/.test(s), 'script: ' + s);
      near(make(s).mp.volume, r.mp.volume, 1e-12, 'same volume');
    });
  })();
