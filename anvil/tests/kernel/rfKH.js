  // --- rfKH (2026-11-09, lane smflat-2) --- the Lofted-Bend flat lays the through hole: a hole bored or countersunk from
  // one face (deeper than half the sheet) shows its smaller through hole, as the laser cuts it (lbHoles slices just
  // inside both faces and keeps the smaller loop that lies inside the mid-surface's).
  (function () {
    group('rfKH: Lofted-Bend flat: a counterbored / countersunk hole lays its through hole');
    var V = K.vec, T = 0.0747;
    var LBH = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\n' +
      'var a = p.sketch("Top").polyline([[0, -3], [3, -3], [3, 3], [-3, 3], [-3, -3], [-0.001, -3]], false).id();\n' +
      'var b = p.sketch("Top", 4).arc(0, 0, 2, 270.03, 360).arc(0, 0, 2, 0, 90).arc(0, 0, 2, 90, 180).arc(0, 0, 2, 180, 270).id();\np.loftedBend([a, b]);\n';
    function rfKHB(code) { var r = build(code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function rfKHHole(r) { return r.flat.loops.length === 2 ? -K.signedArea(r.flat.loops[1]) : NaN; }
    function rfKHPoly(rad) {   // the circle's chords as Anvil cuts it (a plate)
      var pr = build('p.units("in");\np.sketch("Top").rect(-1, -1, 2, 2).extrude(0.1);\np.sketch("Top").circle(0, 0, ' + rad + ').cut("through");\n'), A = 0;
      pr.mesh.faces.forEach(function (fc, k) { if (Math.abs(fc.normal[1]) > 0.99) K.faceOutline(pr.mesh, k).loops.forEach(function (l) { var s = Math.abs(K.signedArea(l)); if (s < 1) A = s; }); });
      return A;
    }

    test('rfKH: Lofted-Bend + a Ø.25 hole with a Ø.5 counterbore .75T deep from the +n face, square to the big facet: the flat hole is the Ø.25 through hole; a plain hole and the bore alone (blind) keep what they were', function () {
      var plain = rfKHB(LBH), lbf = plain.model.features.filter(function (q) { return q.type === 'loftedBend'; })[0];
      var lay = K.loftedBendLayout(lbf, plain.model, { planes: plain.build.planes, sketches: {} }), big = null;
      lay.tris.forEach(function (t) { var ar = V.len(V.cross(V.sub(t.p[1], t.p[0]), V.sub(t.p[2], t.p[0]))); if (!big || ar > big.ar) big = { t: t, ar: ar }; });
      var t = big.t, n = V.norm(V.cross(V.sub(t.p[1], t.p[0]), V.sub(t.p[2], t.p[0]))), cg = V.scale(V.add(V.add(t.p[0], t.p[1]), t.p[2]), 1 / 3), xd = V.norm(V.sub(t.p[1], t.p[0]));
      function pl(o) { return JSON.stringify({ custom: true, origin: o, x: xd, y: V.cross(n, xd), n: n }); }
      var face = V.add(cg, V.scale(n, T / 2));
      var thru = 'p.sketch(' + pl(cg) + ').circle(0, 0, 0.125).cut(1, { both: true });\n';
      var bore = 'p.sketch(' + pl(face) + ').circle(0, 0, 0.25).cut(' + 0.75 * T + ', { reverse: true });\n';
      var a = rfKHB(LBH + thru), c = rfKHB(LBH + thru + bore);
      nearRel(rfKHHole(a), rfKHPoly(0.125), 1e-9, 'plain hole: its own area');
      assert(c.mp.volume < a.mp.volume - 0.5 * Math.PI * (0.0625 - 0.015625) * T, 'the bore is cut: ' + (a.mp.volume - c.mp.volume));
      assert(c.flat.loops.length === 2, 'blank + one hole: ' + c.flat.loops.length);
      nearRel(rfKHHole(c), rfKHPoly(0.125), 1e-9, 'counterbored: the Ø.25 through hole');
      near(K.signedArea(c.flat.loops[0]), K.signedArea(plain.flat.loops[0]), 1e-12, 'blank unchanged');
    });

    test('rfKH: Lofted-Bend + a countersink (a 90° cone, Ø.34 at the +n face, Ø.25 at .045 deep) over a Ø.25 hole: the flat hole is the Ø.25 through hole', function () {
      var plain = rfKHB(LBH), lbf = plain.model.features.filter(function (q) { return q.type === 'loftedBend'; })[0];
      var lay = K.loftedBendLayout(lbf, plain.model, { planes: plain.build.planes, sketches: {} }), big = null;
      lay.tris.forEach(function (t) { var ar = V.len(V.cross(V.sub(t.p[1], t.p[0]), V.sub(t.p[2], t.p[0]))); if (!big || ar > big.ar) big = { t: t, ar: ar }; });
      var t = big.t, n = V.norm(V.cross(V.sub(t.p[1], t.p[0]), V.sub(t.p[2], t.p[0]))), cg = V.scale(V.add(V.add(t.p[0], t.p[1]), t.p[2]), 1 / 3), xd = V.norm(V.sub(t.p[1], t.p[0]));
      // the cone: a revolve cut of the triangle (r .17 at the face, r 0 at .17 below) about the hole's axis, sketched on
      // the plane through the axis (x along the facet, y along n)
      var face = V.add(cg, V.scale(n, T / 2)), side = { custom: true, origin: face, x: xd, y: n, n: V.cross(xd, n) };
      var code = LBH + 'p.sketch(' + JSON.stringify({ custom: true, origin: cg, x: xd, y: V.cross(n, xd), n: n }) + ').circle(0, 0, 0.125).cut(1, { both: true });\n' +
        'p.sketch(' + JSON.stringify(side) + ').polyline([[0, 0.01], [0.18, 0.01], [0, -0.17]], true).revolveCut(360, { axis: "y" });\n';
      var c = rfKHB(code);
      assert(c.flat.loops.length === 2, 'blank + one hole: ' + c.flat.loops.length);
      nearRel(rfKHHole(c), rfKHPoly(0.125), 1e-9, 'countersunk: the Ø.25 through hole');
    });
  })();
