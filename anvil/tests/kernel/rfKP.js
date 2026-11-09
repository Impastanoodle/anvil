  // --- rfKP (2026-11-09, lane smfix, test-reports/2026-11-09-shop-flow-2.md findings 3 and 4) --- two flat-pattern
  // bugs from the shop audit: (a) a hole through a Lofted-Bend's seam was cut in the part but missing from the flat, with
  // no warning (lbHoles dropped every slice loop that touched the blank's edge): it now lands as a notch on each of the
  // blank's two seam edges, as SolidWorks shows it, a cut that cannot be laid warns; (b) Closed Corner (bend region
  // closed) + a Circular Corner Relief left two sliver loops (.008 x .013 in) in the flat where one wall's end was
  // picked: the relief's cutout was measured from the bend's own end and drawn the Closed Corner's extension off its
  // place (ccExtendRecords / foldCutouts now move τ with the end). Self-contained.
  (function () {
    group('rfKP: Lofted-Bend seam hole in the flat; Closed Corner + Circular Corner Relief without slivers');
    var T14 = 0.0747, KF = 0.44, RB = 0.075;
    function rfKParea(fl) { return fl.loops.reduce(function (s, l, i) { return s + (i === 0 ? Math.abs(K.signedArea(l)) : -Math.abs(K.signedArea(l))); }, 0); }
    // the distance from p to the segment a-b
    function rfKPseg(p, a, b) {
      var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
      return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
    }
    // the outline's vertices that are not on the uncut outline: the notches
    function rfKPnew(o1, o0) {
      return o1.filter(function (p) { return !o0.some(function (q, i) { return rfKPseg(p, q, o0[(i + 1) % o0.length]) < 1e-9; }); });
    }
    var LOFT = 'p.name("Transition").units("in");\np.sheet(' + T14 + ', ' + T14 + ', 0.5);\n' +
      'var a = p.sketch("Top").polyline([[0, -3], [3, -3], [3, 3], [-3, 3], [-3, -3], [-0.001, -3]], false).id();\n' +
      'var b = p.sketch("Top", 4).arc(0, 0, 2, 270.03, 360).arc(0, 0, 2, 0, 90).arc(0, 0, 2, 90, 180).arc(0, 0, 2, 180, 270).id();\np.loftedBend([a, b]);\n';
    var SEAM = 'p.sketch("Front").circle(0, 1, 0.25).end().extrude(4, { cut: true });\n';
    var rfKPloft0 = null;
    function rfKPbase() {
      if (!rfKPloft0) { var t0 = build(LOFT); noErrors(t0); rfKPloft0 = { t: t0, fl: K.flatPattern(t0.model, t0.build, t0.mesh) }; }
      return rfKPloft0;
    }

    test('rfKP: a Ø.5 hole through the Lofted-Bend\'s seam (Front sketch at x 0, cut toward +Z) reaches the flat: a notch on each of the blank\'s two seam edges (no hole loop, no warning), notch area × T = the metal cut (1 %), blank size unchanged; laser DXF one OUTLINE, no HOLES', function () {
      var b0 = rfKPbase(), t = build(LOFT + SEAM); noErrors(t);
      var ft = K.flatPattern(t.model, t.build, t.mesh), o0 = b0.fl.loops[0], o1 = ft.loops[0];
      assert(ft.loops.length === 1 && !ft.warnings.length, 'outline only: ' + ft.loops.length + ' loops, ' + ft.warnings.join('; '));
      var cut = b0.t.mp.volume - t.mp.volume, lost = (rfKParea(b0.fl) - rfKParea(ft)) * T14;
      nearRel(lost, cut, 0.01, 'notch area × T vs the metal the cut removed');
      // the two seam edges: A0 → (outline end) B0 and the last A → first B (the strip's two end walls)
      var seamA = [o0[o0.length - 1], o0[0]], seamB = [o0[5], o0[6]];   // (6 points of A, then B reversed)
      var add = rfKPnew(o1, o0), onA = 0, onB = 0;
      add.forEach(function (p) { if (rfKPseg(p, seamA[0], seamA[1]) < 0.3) onA++; else if (rfKPseg(p, seamB[0], seamB[1]) < 0.3) onB++; });
      assert(add.length > 10 && onA > 5 && onB > 5 && onA + onB === add.length, 'notch points on the seam edges: ' + onA + ' + ' + onB + ' of ' + add.length);
      near(ft.size[0], b0.fl.size[0], 1e-9, 'blank x'); near(ft.size[1], b0.fl.size[1], 1e-9, 'blank y');
      var c = DxfCheck.check(K.exportDXFFlat(ft, 'in', { version: 'R2000' }), { units: 'in' });
      assert(c.ok && c.loops.filter(function (l) { return l.layer === 'OUTLINE' && l.closed; }).length === 1 && !c.counts['LWPOLYLINE@HOLES'] && !c.counts['CIRCLE@HOLES'], 'DXF ' + JSON.stringify(c.counts) + ' ' + c.errors.join('; '));
      return 'cut ' + cut.toFixed(5) + ' in³, flat ' + lost.toFixed(5) + ' in³, notch points ' + onA + ' + ' + onB;
    });

    test('rfKP: the seam hole and a Ø.5 hole in a side facet together: the side hole stays one HOLES loop, the seam hole two notches; area × T = the metal cut (1 %)', function () {
      var b0 = rfKPbase(), t = build(LOFT + SEAM + 'p.sketch("Right").circle(0, 1, 0.25).end().extrude(4, { cut: true });\n'); noErrors(t);
      var ft = K.flatPattern(t.model, t.build, t.mesh);
      assert(ft.loops.length === 2 && !ft.warnings.length, 'outline + one hole: ' + ft.loops.length + ' ' + ft.warnings.join('; '));
      var cut = b0.t.mp.volume - t.mp.volume, lost = (rfKParea(b0.fl) - rfKParea(ft)) * T14;
      nearRel(lost, cut, 0.01, 'area × T vs the metal cut');
      assert(rfKPnew(ft.loops[0], b0.fl.loops[0]).length > 10, 'the notches');
      return 'cut ' + cut.toFixed(5) + ' in³, flat ' + lost.toFixed(5) + ' in³';
    });

    test('rfKP: notches from the Lofted-Bend\'s bottom and top edges (Ø.6 cuts centred on the edge) are laid into the outline (were dropped silently), no warning', function () {
      var b0 = rfKPbase(), out = [];
      ['p.sketch("Front").circle(1.5, 0, 0.3).end().extrude(4, { cut: true });\n', 'p.sketch("Front").circle(0.8, 4, 0.3).end().extrude(4, { cut: true });\n'].forEach(function (cutCode, i) {
        var t = build(LOFT + cutCode); noErrors(t);
        var ft = K.flatPattern(t.model, t.build, t.mesh), cut = b0.t.mp.volume - t.mp.volume, lost = (rfKParea(b0.fl) - rfKParea(ft)) * T14;
        assert(ft.loops.length === 1 && !ft.warnings.length, 'notch ' + i + ': ' + ft.loops.length + ' loops ' + ft.warnings.join('; '));
        // the mid-surface slice: the solid's edge wall leans off square at a fan vertex, so the part loses a little more at the edge
        assert(lost > 0.85 * cut && lost < 1.01 * cut, 'notch ' + i + ': flat ' + lost.toFixed(5) + ' vs cut ' + cut.toFixed(5));
        out.push((lost / cut).toFixed(3));
      });
      return 'flat / part ' + out.join(', ');
    });

    test('rfKP: a cut that cannot be laid in the Lofted-Bend\'s flat (a band right round the transition: the blank in two) gives a warning, never a silent loss', function () {
      var t = build(LOFT + 'p.sketch("Front").rect(-4, 1.9, 8, 0.2).end().extrude(4, { cut: true, both: true });\n'); noErrors(t);
      var ft = K.flatPattern(t.model, t.build, t.mesh);
      assert(ft.warnings.some(function (w) { return /could not be laid/.test(w); }), 'warning: ' + ft.warnings.join('; '));
      return ft.warnings[0];
    });

    // the 14 ga box of rfKM job b: four Edge Flanges, Butt Closed Corners (bend region closed: two walls extended at
    // their end a, two at their end b), Circular Corner Reliefs at all four corners
    var BOX = 'p.name("Box-14GA").units("in");\np.material("Plain Carbon Steel");\np.sheet(' + T14 + ', ' + RB + ', ' + KF + ');\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\n' +
      [[5, T14, 0], [10, T14, 3], [5, T14, 6], [0, T14, 3]].map(function (e) { return 'p.flange(2, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer" });\n'; }).join('') +
      'p.closedCorner(' + JSON.stringify([[T14 / 2, 1.8, RB + T14], [10 - RB - T14, 1.8, 6 - T14 / 2], [T14 / 2, 1.8, 6 - RB - T14]]) + ', { cornerType: "butt", gap: 0.01, closeBend: true });\n';
    // the blank's four corners (the base's corners in the flat, 2 − BD in from the bounding box) are alike: the outline's
    // points within .3 of each, as distances from it, match corner to corner (a Closed Corner extends one wall at each,
    // so the corners are turned or mirrored copies of each other, never shifted); null, or what differs
    function rfKPcorners(fl) {
      var o0 = fl.loops[0], o = o0.filter(function (p, k) {   // (points on a straight run between their neighbours: not shape)
        var a = o0[(k + o0.length - 1) % o0.length], b = o0[(k + 1) % o0.length], ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
        return !(ab > 0) || Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1e-7 * ab;
      });
      var BD = 2 * (RB + T14) - Math.PI / 2 * (RB + KF * T14), m = 2 - BD, mn = fl.bbox.min, mx = fl.bbox.max;
      var cs = [[mn[0] + m, mn[1] + m], [mx[0] - m, mn[1] + m], [mx[0] - m, mx[1] - m], [mn[0] + m, mx[1] - m]];
      var sig = cs.map(function (C) { return o.map(function (p) { return Math.hypot(p[0] - C[0], p[1] - C[1]); }).filter(function (d) { return d < 0.3; }).sort(function (x, y) { return x - y; }); });
      for (var i = 1; i < 4; i++) {
        if (sig[i].length !== sig[0].length || sig[i].some(function (d, k) { return Math.abs(d - sig[0][k]) > 1e-6; }))
          return 'corner ' + i + ' differs from corner 0: ' + sig.map(function (s) { return s.length + ' pts ' + s.slice(0, 4).map(function (d) { return d.toFixed(4); }).join(','); }).join(' | ');
      }
      return null;
    }
    function rfKPrelief(type) { return 'p.cornerRelief([[0.1497, 0.0747, 0.1497], [9.8503, 0.0747, 0.1497], [9.8503, 0.0747, 5.8503], [0.1497, 0.0747, 5.8503]], null, { reliefType: "' + type + '" });\n'; }

    test('rfKP: 14 ga box, Butt Closed Corners (bend region closed) + Circular Corner Relief: one loop (no slivers), the four corners alike, folded = blank × T as the box without reliefs (0.25 %); laser DXF one OUTLINE, nothing on HOLES', function () {
      var a = build(BOX), r = build(BOX + rfKPrelief('circular')); noErrors(a); noErrors(r);
      var fa = K.flatPattern(a.model, a.build, a.mesh), fl = K.flatPattern(r.model, r.build, r.mesh);
      assert(fl.loops.length === 1, 'loops ' + fl.loops.length + ': ' + fl.loops.slice(1).map(function (l) { return Math.abs(K.signedArea(l)).toExponential(2); }).join(', '));
      near(fl.size[0], fa.size[0], 1e-9, 'width'); near(fl.size[1], fa.size[1], 1e-9, 'depth');
      var bad = rfKPcorners(fl);
      assert(!bad, bad);
      var ra = rfKParea(fl) * T14 / r.mp.volume - 1, r0 = rfKParea(fa) * T14 / a.mp.volume - 1;
      assert(Math.abs(ra - r0) < 0.0025, 'blank × T / folded − 1: ' + ra.toFixed(5) + ' (no reliefs ' + r0.toFixed(5) + ')');
      var c = DxfCheck.check(K.exportDXFFlat(fl, 'in', { version: 'R2000' }), { units: 'in' });
      assert(c.ok && c.loops.filter(function (l) { return l.layer === 'OUTLINE' && l.closed; }).length === 1 && !Object.keys(c.counts).some(function (k) { return /@HOLES$/.test(k); }) && c.counts['LINE@BEND'] === 4, 'DXF ' + JSON.stringify(c.counts) + ' ' + c.errors.join('; '));
      return 'relief takes ' + ((rfKParea(fa) - rfKParea(fl)) / 4).toFixed(5) + ' in² a corner; blank × T / folded − 1 ' + ra.toFixed(5) + ' (' + r0.toFixed(5) + ')';
    });

    test('rfKP: the same box with Rectangular / Tear / Obround Corner Reliefs: one loop each (Obround left a sliver), Rectangular and Tear corners alike (their relief was drawn twice, offset, where a wall was extended at its end a)', function () {
      var out = [];
      ['rect', 'tear', 'obround'].forEach(function (type) {
        var r = build(BOX + rfKPrelief(type));
        if (Object.keys(r.errors).length) { out.push(type + ': ' + JSON.stringify(r.errors)); return; }
        var fl = K.flatPattern(r.model, r.build, r.mesh), bad = type === 'obround' ? null : rfKPcorners(fl);   // (an obround lies along one bend: corners differ by more than a turn)
        assert(fl.loops.length === 1, type + ': loops ' + fl.loops.length + ' (the obround left a sliver too)');
        assert(!bad, type + ': ' + bad);
        out.push(type + ' ' + fl.loops[0].length + ' pts');
      });
      return out.join(', ');
    });
  })();
  // --- end rfKP ---
