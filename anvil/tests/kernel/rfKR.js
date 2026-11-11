  // --- rfKR (2026-11-11, lane smsolid) --- sheet-metal solids that were not closed or not exact. (1) A Lofted-Bend's
  // seam: its four end points are fan vertices whose least-squares offset leaned along the profile (~.02 on a 14 ga
  // round transition) past the .001 gap, so the two seam walls crossed (22 self-intersections in the plain part) and
  // every cut through the seam left open edges (22 for a Ø.5 hole); a slot or a rectangle across it was also missing
  // from the flat (warned). The seam's end points are now offset square to the gap (lbSolid). (2) A hole across a bend's
  // tangent line: Anvil's mass properties are exact for what the solid is (a true round in the flat, the developed
  // polygon in the bend; Anvil's STEP writes the polygon on both sides). (3) An R 1 tray with 1.5 in flanges through
  // Anvil's STEP: Insert Bends missed its bends (the inside air probe 1 in from a mitred corner sat in the neighbour's
  // metal) and refused the outside rounds as "not one thickness"; then both strips were notched at every corner.
  (function () {
    group('rfKR: Lofted-Bend seam cuts closed; mass properties of a hole across a tangent line; an R 1 tray through STEP');
    var T14 = 0.0747;
    function rfKRarea(fl) { return fl.loops.reduce(function (s, l, i) { var a = Math.abs(K.signedArea(l)); return s + (i ? -a : a); }, 0); }
    var LOFT = 'p.name("Transition").units("in");\np.sheet(' + T14 + ', ' + T14 + ', 0.5);\n' +
      'var a = p.sketch("Top").polyline([[0, -3], [3, -3], [3, 3], [-3, 3], [-3, -3], [-0.001, -3]], false).id();\n' +
      'var b = p.sketch("Top", 4).arc(0, 0, 2, 270.03, 360).arc(0, 0, 2, 0, 90).arc(0, 0, 2, 90, 180).arc(0, 0, 2, 180, 270).id();\np.loftedBend([a, b]);\n';
    var rfKRbase0 = null;
    function rfKRbase() {
      if (!rfKRbase0) { var t = build(LOFT); noErrors(t); rfKRbase0 = { t: t, fl: K.flatPattern(t.model, t.build, t.mesh) }; }
      return rfKRbase0;
    }
    function rfKRclosed(body, tag) {
      var c = Evaluate.checkBody(body);
      assert(!c.openEdges.length && !c.nonManifoldEdges.length && !c.zeroAreaFaces.length && !c.selfIntersections.length,
        tag + ': open ' + c.openEdges.length + ', non-manifold ' + c.nonManifoldEdges.length + ', zero-area ' + c.zeroAreaFaces.length + ', self-intersections ' + c.selfIntersections.length);
    }

    test('rfKR: the 14 ga round-to-square Lofted-Bend (seam gap .001) is one clean solid (was 22 self-intersections at the seam), volume = blank × T within 0.05 %', function () {
      var b = rfKRbase();
      rfKRclosed(b.t.body, 'plain transition');
      nearRel(b.t.mp.volume, rfKRarea(b.fl) * T14, 5e-4, 'volume vs blank × T');
      return 'volume ' + b.t.mp.volume.toFixed(6) + ' in³, blank × T ' + (rfKRarea(b.fl) * T14).toFixed(6);
    });

    // the thickness through point P along unit n: the spread of the part's faces the line crosses within T of P
    function rfKRthick(body, P, n) {
      var V = K.vec, hs = [];
      body.polygons.forEach(function (p) {
        var pn = [p.plane.normal.x, p.plane.normal.y, p.plane.normal.z], den = V.dot(pn, n);
        if (Math.abs(den) < 0.9) return;   // the two faces (a wall holds the line)
        var s = (p.plane.w - V.dot(pn, P)) / den, X = V.add(P, V.scale(n, s)), vs = p.vertices.map(function (v) { return [v.pos.x, v.pos.y, v.pos.z]; });
        if (Math.abs(s) > T14) return;
        for (var i = 0; i < vs.length; i++) if (V.dot(V.cross(V.sub(vs[(i + 1) % vs.length], vs[i]), V.sub(X, vs[i])), pn) < -1e-12) return;
        hs.push(s);
      });
      return hs.length >= 2 ? Math.max.apply(null, hs) - Math.min.apply(null, hs) : NaN;
    }
    test('rfKR: the round transition\'s thickness: the facets on the seam\'s corner points are within 6.5 % of T (the price of flat seam walls), every facet away from them is exactly T (1e-6) at each corner its offset solves exactly (three facets or fewer meet there; the square\'s corners, where more meet, are a least-squares fit as before)', function () {
      var b = rfKRbase(), V = K.vec, lb = b.t.model.features.filter(function (f) { return f.type === 'loftedBend'; })[0];
      var lay = K.loftedBendLayout(lb, b.t.model, { planes: b.t.build.planes, sketches: {} }), seam = {}, nrm = {}, worst = 0, seamWorst = 0, corners = 0;
      seam.A0 = seam.B0 = seam['A' + (lay.A.length - 1)] = seam['B' + (lay.B.length - 1)] = true;
      function key(g) { return g[0] + g[1]; }
      function nOf(tr) { return V.norm(V.cross(V.sub(tr.p[1], tr.p[0]), V.sub(tr.p[2], tr.p[0]))); }
      lay.tris.forEach(function (tr) {
        var n = nOf(tr);
        tr.tag.forEach(function (g) { var l = nrm[key(g)] = nrm[key(g)] || []; if (!l.some(function (q) { return V.dot(q, n) > 1 - 1e-12; })) l.push(n); });
      });
      var pts = [];
      b.t.body.polygons.forEach(function (p) { p.vertices.forEach(function (v) { pts.push([v.pos.x, v.pos.y, v.pos.z]); }); });
      lay.tris.forEach(function (tr) {
        var n = nOf(tr), c =V.scale(V.add(V.add(tr.p[0], tr.p[1]), tr.p[2]), 1 / 3), ks = tr.tag.map(key);
        if (ks.some(function (k) { return seam[k]; })) {
          seamWorst = Math.max(seamWorst, Math.abs(rfKRthick(b.t.body, c, n) - T14) / T14);
          return;
        }
        // at a corner: the part's vertices nearest the corner moved ±T/2 along this facet's normal (its offset points)
        ks.forEach(function (k, q) {
          if (nrm[k].length > 3) return;
          function nearest(X) { var best = null, bd = Infinity; pts.forEach(function (Q) { var d = V.len(V.sub(Q, X)); if (d < bd) { bd = d; best = Q; } }); return best; }
          var th = V.dot(n, V.sub(nearest(V.add(tr.p[q], V.scale(n, T14 / 2))), nearest(V.sub(tr.p[q], V.scale(n, T14 / 2)))));
          worst = Math.max(worst, Math.abs(th - T14) / T14); corners++;
        });
      });
      assert(corners > 20, 'corners measured: ' + corners);
      assert(worst < 1e-6, 'away from the seam: thickness off T by ' + worst.toExponential(2));
      assert(seamWorst < 0.065, 'facets on the seam corners (at their centres): off T by ' + (100 * seamWorst).toFixed(2) + ' %');
      return corners + ' corners off T ≤ ' + worst.toExponential(1) + '; seam facets ≤ ' + (100 * seamWorst).toFixed(2) + ' % at their centres';
    });

    test('rfKR: a Ø.5 hole, a .3 x 1.3 slot and a 1 x 1 rectangle cut through the seam leave the solid closed (Evaluate: no open / non-manifold / zero-area / crossing faces; was 22 / 48 / 20 open edges), and each is laid in the flat as two seam notches with no warning (the slot and the rectangle were "could not be laid")', function () {
      var b = rfKRbase(), out = [];
      [['p.sketch("Front").circle(0, 1, 0.25).end().extrude(4, { cut: true });\n', 'hole', 0.05],
        ['p.sketch("Front").slot(-0.5, 1.5, 0.5, 1.5, 0.15).end().extrude(4, { cut: true });\n', 'slot', 0.01],
        ['p.sketch("Front").rect(-0.5, 0.5, 1, 1).end().extrude(4, { cut: true });\n', 'rectangle', 0.01]].forEach(function (c) {
        var t = build(LOFT + c[0]); noErrors(t);
        rfKRclosed(t.body, c[1]);
        var ft = K.flatPattern(t.model, t.build, t.mesh), cut = b.t.mp.volume - t.mp.volume, lost = (rfKRarea(b.fl) - rfKRarea(ft)) * T14;
        assert(ft.loops.length === 1 && !ft.warnings.length, c[1] + ': ' + ft.loops.length + ' loops; ' + ft.warnings.join('; '));
        // the seam's end points can sit T/2 off only some of their fan's facets (round transition: up to 6 % thick at the
        // corner), so a cut right at the seam's corner takes a little more or less than the flat's notch × T
        nearRel(lost, cut, c[2], c[1] + ': notch area × T vs the metal cut');
        near(ft.size[0], b.fl.size[0], 1e-9, c[1] + ': blank x'); near(ft.size[1], b.fl.size[1], 1e-9, c[1] + ': blank y');
        out.push(c[1] + ' ' + (lost / cut).toFixed(4));
      });
      return 'flat / part ' + out.join(', ');
    });

    test('rfKR: a square hopper\'s seam (its facets square to the gap) is unchanged: the same volume to 1e-12 as before the seam fix, closed', function () {
      var t = build('p.units("in");p.sheet(0.0598, 0.06, 0.5);\nvar a = p.sketch("Top").polyline([[0, -2], [2, -2], [2, 2], [-2, 2], [-2, -2], [-0.001, -2]], false).id();\n' +
        'var b = p.sketch("Top", 3).polyline([[0, -1], [1, -1], [1, 1], [-1, 1], [-1, -1], [-0.0005, -1]], false).id();\np.loftedBend([a, b]);\n');
      noErrors(t);
      rfKRclosed(t.body, 'hopper');
      nearRel(t.mp.volume, 2.269108498873318, 1e-12, 'hopper volume');
    });

    // a U channel (T .06, R .25, K .44) unfolded, a hole cut, folded (as rfKQ)
    var T = 0.06, KF = 0.44, R = 0.25, BA = Math.PI / 2 * (R + KF * T), MID = R + T - BA / 2;
    function rfKRu(cut) {
      return 'p.units("in");\np.sheet(' + T + ', ' + R + ', ' + KF + ');\np.sketch("Top").rect(0, -4, 2, 4).end().baseFlange();\n' +
        'p.flange(2, [[0, ' + T + ', 2], [2, ' + T + ', 2]], { position: "inside" });\np.unfold([1, ' + T + ', 2], null);\n' +
        (cut ? 'p.sketch("Top")' + cut + '.end().extrude(1, { cut: true, through: true, both: true });\n' : '') + 'p.fold(null);\n';
    }
    function rfKRclip(poly, x, less) {
      var out = [];
      for (var i = 0; i < poly.length; i++) {
        var a = poly[i], b = poly[(i + 1) % poly.length], ia = less ? a[0] <= x : a[0] >= x, ib = less ? b[0] <= x : b[0] >= x;
        if (ia) out.push(a);
        if (ia !== ib) out.push([x, a[1] + (x - a[0]) / (b[0] - a[0]) * (b[1] - a[1])]);
      }
      return out;
    }
    test('rfKR: a hole across a bend\'s tangent line: Anvil\'s mass properties = the solid it holds within 1e-6 (the round hole\'s wall where the sheet is flat, the developed 32-gon wrapped in the bend); Anvil\'s STEP and rfKQ\'s "exact" take the 32-gon on both sides, 3.5e-6 … 3.7e-5 less metal removed', function () {
      var plain = build(rfKRu('')), out = [];
      noErrors(plain);
      [[-0.1, 0.1, 'base side'], [0.3, 0.1, 'wall side'], [MID, 0.3, 'past both']].forEach(function (c) {
        var t = build(rfKRu('.circle(' + c[0] + ', -2, ' + c[1] + ')')); noErrors(t);
        var h = K.flatPattern(t.model, t.build, t.mesh).loops[1], r = c[1];
        var Ab = Math.abs(K.signedArea(rfKRclip(rfKRclip(h, MID - BA / 2, false), MID + BA / 2, true)));
        // the true circle's part outside the bend zone (a fine polygon of it, clipped)
        var C = [];
        for (var i = 0; i < 20000; i++) { var an = 2 * Math.PI * i / 20000; C.push([c[0] + r * Math.cos(an), -2 + r * Math.sin(an)]); }
        var Acb = Math.abs(K.signedArea(rfKRclip(rfKRclip(C, MID - BA / 2, false), MID + BA / 2, true))), Aout = Math.PI * r * r - Acb;
        var want = plain.mp.volume - (Ab / (R + KF * T) * ((R + T) * (R + T) - R * R) / 2 + Aout * T);
        nearRel(t.mp.volume, want, 1e-6, c[2]);
        out.push(c[2] + ' ' + ((t.mp.volume - want) / want).toExponential(1));
      });
      return out.join('; ');
    });

    test('rfKR: a mitred tray 4 × 3 with R 1 bends and 1.5 in flanges (and R 1 Material Outside, R .75) through Anvil\'s STEP: Insert Bends finds the four bends (was refused: "not one thickness … rounded R1.06"), flat = the tray\'s own flat point for point within 1e-6, no warning', function () {
      var out = [];
      [[1, 1.5, 'inside'], [1, 1.5, 'outside'], [0.75, 1.25, 'inside']].forEach(function (c) {
        var src = build('p.units("in");\np.sheet(' + T + ', ' + c[0] + ', ' + KF + ');\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
          'p.flange(' + c[1] + ', [[2, ' + T + ', 0], [4, ' + T + ', 1.5], [2, ' + T + ', 3], [0, ' + T + ', 1.5]], { position: "' + c[2] + '" });\n');
        noErrors(src);
        var own = K.flatPattern(src.model, src.build, src.mesh), step = Exchange.exportSTEP(src.model, src.build, { faceted: true });
        var m = Exchange.newPartFromImport(Exchange.importFile('tray.step', step, { units: 'in' }));
        new K.Builder(m).insertBends([2, 0, 1.5], { kFactor: KF });
        var b = K.rebuild(m), tag = 'R ' + c[0] + ' x ' + c[1] + ' ' + c[2];
        assert(!Object.keys(b.errors).length, tag + ': ' + JSON.stringify(b.errors));
        var fl = K.flatPattern(m, b, K.meshFromBody(b.body));
        assert(fl.bends.length === 4 && fl.bends.every(function (q) { return Math.abs(q.R - c[0]) < 1e-9; }) && !fl.warnings.length, tag + ': bends ' + fl.bends.length + '; ' + fl.warnings.join('; '));
        assert(fl.loops.length === 1 && fl.loops[0].length === own.loops[0].length, tag + ': outline points ' + fl.loops[0].length + ' / ' + own.loops[0].length);
        function rel(l) { var mx = Infinity, my = Infinity; l.forEach(function (p) { mx = Math.min(mx, p[0]); my = Math.min(my, p[1]); }); return l.map(function (p) { return [p[0] - mx, p[1] - my]; }); }
        var A = rel(own.loops[0]), B = rel(fl.loops[0]), worst = 0;
        A.forEach(function (p) { worst = Math.max(worst, Math.min.apply(null, B.map(function (q) { return Math.hypot(p[0] - q[0], p[1] - q[1]); }))); });
        assert(worst < 1e-6, tag + ': outline off the tray\'s own by ' + worst);
        near(rfKRarea(fl), rfKRarea(own), 1e-6, tag + ': blank area');
        out.push(tag + ' ' + rfKRarea(fl).toFixed(6) + ' in²');
      });
      return out.join('; ');
    });
  })();
