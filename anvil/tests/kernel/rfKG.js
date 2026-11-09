  // --- rfKG (2026-11-09, lane smflat) --- flats of Lofted-Bend and Swept Flange, Circular / Obround on a 3 Bend corner.
  // Lofted-Bend: holes are the body's slice by the mid-surface, developed facet by facet (lbHoles), so a hole across a
  // fold is one loop of its developed area, centred on the bend line. Swept Flange along an arc: Edge Flanges on its end
  // edges (and cuts across their bends and walls) are laid onto the development (sfFlangeMap). Corner Relief 3 Bend
  // corner: Circular and Obround (cornerReliefApply: each bend band out, its metal less the relief back): closed, folded
  // = blank × T, the blank loses the relief's shape exactly.
  (function () {
    group('rfKG: Lofted-Bend hole across a fold, Edge Flanges on an arc Swept Flange in the flat, Circular / Obround 3 Bend corner relief');
    var V = K.vec;
    function rfKGB(code) { var r = build(code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function rfKGArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i ? -Math.abs(K.signedArea(l)) : Math.abs(K.signedArea(l))); }, 0); }
    function rfKGCentroid(l) {
      var cx = 0, cy = 0, a6 = 0;
      for (var k = 0; k < l.length; k++) { var p = l[k], q = l[(k + 1) % l.length], c = p[0] * q[1] - q[0] * p[1]; a6 += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c; }
      return [cx / (3 * a6), cy / (3 * a6)];
    }
    // convex clip of a polygon to a·p ≤ c (Sutherland–Hodgman)
    function rfKGClip(poly, a, c) {
      var out = [];
      for (var i = 0; i < poly.length; i++) {
        var p = poly[i], q = poly[(i + 1) % poly.length], dp = a[0] * p[0] + a[1] * p[1] - c, dq = a[0] * q[0] + a[1] * q[1] - c;
        if (dp <= 0) out.push(p);
        if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) { var t = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
      }
      return out;
    }

    // ---- Lofted-Bend: square 6 × 6 to round Ø4, 4 tall, 14 ga
    var T14 = 0.0747, LBH = 'p.units("in");\np.sheet(' + T14 + ', ' + T14 + ', 0.5);\n' +
      'var a = p.sketch("Top").polyline([[0, -3], [3, -3], [3, 3], [-3, 3], [-3, -3], [-0.001, -3]], false).id();\n' +
      'var b = p.sketch("Top", 4).arc(0, 0, 2, 270.03, 360).arc(0, 0, 2, 0, 90).arc(0, 0, 2, 90, 180).arc(0, 0, 2, 180, 270).id();\np.loftedBend([a, b]);\n';

    test('rfKG: Lofted-Bend square 6 × 6 to round Ø4 × 4 tall, 14 ga, a Ø.5 hole across one fold (axis on the facets\' bisector): one hole loop in the flat, area = the developed area (A / cos(θ/2)) to 1e-9, centred on the bend line; blank unchanged; DXF closed', function () {
      var plain = rfKGB(LBH), lbf = plain.model.features.filter(function (q) { return q.type === 'loftedBend'; })[0];
      var lay = K.loftedBendLayout(lbf, plain.model, { planes: plain.build.planes, sketches: {} });
      var bid = lbf.id + ':7', bd = plain.flat.bends.filter(function (q) { return q.id === bid; })[0];
      assert(bd, 'bend ' + bid + ' in the flat: ' + plain.flat.bends.map(function (q) { return q.id; }).join());
      var ta = lay.tris[7], tb = lay.tris[8];
      function tN(t) { return V.norm(V.cross(V.sub(t.p[1], t.p[0]), V.sub(t.p[2], t.p[0]))); }
      var sh = ta.tag.map(function (g, q) { return { k: g[0] + g[1], p: ta.p[q] }; }).filter(function (x) { return tb.tag.some(function (g) { return g[0] + g[1] === x.k; }); });
      assert(sh.length === 2, 'the fold is the facets\' shared edge');
      var na = tN(ta), nb = tN(tb), nbis = V.norm(V.add(na, nb)), cosh = V.dot(nbis, na);
      assert(cosh < 0.999, 'a real fold: ' + bd.angle);
      // the hole: a circle on the plane through the fold (80 % along it, on the mid-surface) square to the bisector, x along the fold
      var C = V.add(sh[0].p, V.scale(V.sub(sh[1].p, sh[0].p), 0.8)), xd = V.norm(V.sub(sh[1].p, sh[0].p));
      var pl = { custom: true, origin: C, x: xd, y: V.cross(nbis, xd), n: nbis };
      var r = rfKGB(LBH + 'p.sketch(' + JSON.stringify(pl) + ').circle(0, 0, 0.25).cut(1, { both: true });\n');
      assert(r.flat.loops.length === 2, 'blank + one hole: ' + r.flat.loops.length);
      near(K.signedArea(r.flat.loops[0]), K.signedArea(plain.flat.loops[0]), 1e-12, 'the blank unchanged');
      // the circle's chords as Anvil cuts them: the same circle through a plate
      var pr = build('p.units("in");\np.sketch("Top").rect(-1, -1, 2, 2).extrude(0.1);\np.sketch("Top").circle(0, 0, 0.25).cut("through");\n'), Ap = 0;
      pr.mesh.faces.forEach(function (fc, k) { if (Math.abs(fc.normal[1]) > 0.99) K.faceOutline(pr.mesh, k).loops.forEach(function (l) { var s = Math.abs(K.signedArea(l)); if (s < 1) Ap = s; }); });
      nearRel(Ap, Math.PI * 0.0625, 1e-2, 'the plate\'s hole');
      var h = r.flat.loops[1], A = -K.signedArea(h);
      assert(K.signedArea(h) < 0, 'the hole runs clockwise');
      nearRel(A, Ap / cosh, 1e-9, 'developed area: each half A/2 / cos(θ/2) on its facet');
      var c = rfKGCentroid(h), bb = r.flat.bends.filter(function (q) { return q.id === bid; })[0], dx = bb.b[0] - bb.a[0], dy = bb.b[1] - bb.a[1], L = Math.hypot(dx, dy);
      near(((c[0] - bb.a[0]) * dy - (c[1] - bb.a[1]) * dx) / L, 0, 1e-9, 'centred on the bend line');
      near(((c[0] - bb.a[0]) * dx + (c[1] - bb.a[1]) * dy) / (L * L), 0.8, 1e-9, '80 % along it');
      var dc = DxfCheck.check(K.exportDXFFlat(r.flat, 'in', { style: 'entities' }), { units: 'in' });
      assert(dc.ok && dc.loops.length === 2, 'DXF: blank + hole, closed ' + dc.errors.join('; '));
    });

    test('rfKG: Lofted-Bend: a hole inside one facet still lays its true shape; two holes, one across a fold and one not: two hole loops', function () {
      var plain = rfKGB(LBH), lbf = plain.model.features.filter(function (q) { return q.type === 'loftedBend'; })[0];
      var lay = K.loftedBendLayout(lbf, plain.model, { planes: plain.build.planes, sketches: {} });
      // the front side's facet (the square's front edge to the round): a Ø.4 hole square to it through its middle
      var big = null;
      lay.tris.forEach(function (t) { var ar = V.len(V.cross(V.sub(t.p[1], t.p[0]), V.sub(t.p[2], t.p[0]))); if (!big || ar > big.ar) big = { t: t, ar: ar }; });
      var t = big.t, n = V.norm(V.cross(V.sub(t.p[1], t.p[0]), V.sub(t.p[2], t.p[0]))), cg = V.scale(V.add(V.add(t.p[0], t.p[1]), t.p[2]), 1 / 3), xd = V.norm(V.sub(t.p[1], t.p[0]));
      var pl = { custom: true, origin: cg, x: xd, y: V.cross(n, xd), n: n };
      var r = rfKGB(LBH + 'p.sketch(' + JSON.stringify(pl) + ').circle(0, 0, 0.2).cut(1, { both: true });\n');
      assert(r.flat.loops.length === 2, 'blank + hole: ' + r.flat.loops.length);
      var pr = build('p.units("in");\np.sketch("Top").rect(-1, -1, 2, 2).extrude(0.1);\np.sketch("Top").circle(0, 0, 0.2).cut("through");\n'), Ap = 0;
      pr.mesh.faces.forEach(function (fc, k) { if (Math.abs(fc.normal[1]) > 0.99) K.faceOutline(pr.mesh, k).loops.forEach(function (l) { var s = Math.abs(K.signedArea(l)); if (s < 1) Ap = s; }); });
      nearRel(-K.signedArea(r.flat.loops[1]), Ap, 1e-9, 'a hole square to its facet: its own shape');
      var c = rfKGCentroid(r.flat.loops[1]), f0 = r.flat.loops[0];
      assert(f0.every(function (p) { return Math.hypot(p[0] - c[0], p[1] - c[1]) > 0.2; }), 'inside the blank');
    });

    // ---- Swept Flange along a quarter arc R 5 (Top plane), T = R = .06, K .5
    var T = 0.06, R = 0.06, BA = Math.PI / 2 * (R + T / 2), SFH = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\n';
    var RING = 'var path = p.sketch("Top").arc(0, 0, 5, 0, 90).id();\nvar prof = p.sketch("Front").line(5, 0, 7, 0).id();\np.sweptFlange(prof, path);\n';
    var CYL = 'var path = p.sketch("Top").arc(0, 0, 5, 0, 90).id();\nvar prof = p.sketch("Front").line(5, 0, 5, 2).id();\np.sweptFlange(prof, path, { flatten: "path" });\n';
    function rfKGFaceA(r) { var a = 0; r.mesh.faces.forEach(function (fc) { if (fc.area > a) a = fc.area; }); return a; }

    test('rfKG: ring Swept Flange (R 5 → 7, 90°) + an Edge Flange 1 on either straight end: flat = the ring + 2 × (1 + BA) exactly, its bend line BA / 2 past the end, UP, no warning; Reverse: DOWN', function () {
      var ring = rfKGB(SFH + RING), A0 = rfKGFaceA(ring);
      [[6, 0, 0], [0, 0, -6]].forEach(function (at) {
        var r = rfKGB(SFH + RING + 'p.flange(1, [' + JSON.stringify(at) + ']);\n');
        assert(!r.flat.warnings.length, 'no warnings: ' + r.flat.warnings.join(' | '));
        assert(r.flat.loops.length === 1 && r.flat.bends.length === 1, 'one blank, one bend: ' + r.flat.loops.length + ' / ' + r.flat.bends.length);
        near(rfKGArea(r.flat), A0 + 2 * (1 + BA), 1e-9, at + ': the ring (its faceted face) + the flange strip and wall');
        var b = r.flat.bends[0];
        assert(b.up && Math.abs(b.angle - 90) < 1e-9 && Math.abs(b.ba - BA) < 1e-12 && /UP 90/.test(b.label), 'bend: ' + JSON.stringify(b));
        near(Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]), 2, 1e-9, 'bend line along the 2" end');
        // the strip and wall: the outline's corners 1 + BA past the end line, 2 apart
        var far = r.flat.loops[0].filter(function (p) { var d = Math.abs((p[0] - b.a[0]) * (b.b[1] - b.a[1]) - (p[1] - b.a[1]) * (b.b[0] - b.a[0])) / 2; return Math.abs(d - (1 + BA / 2)) < 1e-9; });
        assert(far.length === 2, 'the wall\'s far corners at 1 + BA / 2 from the bend line: ' + far.length);
      });
      var rv = rfKGB(SFH + RING + 'p.flange(1, [[6, 0, 0]], { reverse: true });\n');
      assert(rv.flat.bends.length === 1 && !rv.flat.bends[0].up, 'Reverse: DOWN');
      near(rfKGArea(rv.flat), A0 + 2 * (1 + BA), 1e-9, 'Reverse: same blank');
    });

    test('rfKG: cylinder Swept Flange (R 5, 90°, Flatten along path) + an Edge Flange 1 at 90° / 60° / 120° on its straight end: flat = the rolled blank + 2 × (1 + BA(angle)) exactly; on the outside face DOWN', function () {
      var plain = rfKGB(SFH + CYL), A0 = rfKGArea(plain.flat);
      [90, 60, 120].forEach(function (ang) {
        var r = rfKGB(SFH + CYL + 'p.flange(1, [[5, 1, 0]], { angle: ' + ang + ' });\n'), ba = ang / 180 * Math.PI * (R + T / 2);
        assert(!r.flat.warnings.length && r.flat.loops.length === 1 && r.flat.bends.length === 1, ang + ': ' + r.flat.warnings.join(' | '));
        near(rfKGArea(r.flat), A0 + 2 * (1 + ba), 1e-9, ang + '°: rolled + flange');
        near(r.flat.bends[0].angle, ang, 1e-9, 'angle');
        assert(r.flat.bends[0].up, 'on the inside face: UP');
      });
      var o = rfKGB(SFH + CYL + 'p.flange(1, [[5.06, 1, 0]]);\n');
      assert(o.flat.bends.length === 1 && !o.flat.bends[0].up, 'outside face: DOWN');
      near(rfKGArea(o.flat), A0 + 2 * (1 + BA), 1e-9, 'outside face: same blank');
    });

    test('rfKG: ring Swept Flange + end Edge Flange, then a .4 slot through the end, the bend and the wall: the blank loses .4 × (.3 + BA + 1) exactly; a Ø.4 hole in the wall: one CIRCLE R.2 in the DXF', function () {
      var base = SFH + RING + 'p.flange(1, [[6, 0, 0]]);\n', a = rfKGB(base);
      var s = rfKGB(base + 'p.sketch("Top").rect(5.8, -0.3, 0.4, 0.6).cut(5, { both: true });\n');
      assert(s.flat.loops.length === 1 && !s.flat.warnings.length, 'one blank: ' + s.flat.loops.length + ' ' + s.flat.warnings.join(' | '));
      near(rfKGArea(a.flat) - rfKGArea(s.flat), 0.4 * (0.3 + BA + 1), 1e-9, 'slot developed across the bend');
      var h = rfKGB(base + 'p.sketch("Front").circle(6, 0.5, 0.2).cut(5, { both: true });\n');
      assert(h.flat.loops.length === 2, 'blank + hole: ' + h.flat.loops.length);
      var dc = DxfCheck.check(K.exportDXFFlat(h.flat, 'in', { style: 'entities' }), { units: 'in' });
      assert(dc.ok && dc.circles.length === 1 && Math.abs(dc.circles[0].r - 0.2) < 1e-6, 'one CIRCLE R.2: ' + JSON.stringify(dc.circles) + ' ' + dc.errors.join('; '));
      // its centre: .5 up the wall (whose inside face starts R up, at the bend's end): BA / 2 + .5 − R past the bend line
      var b = h.flat.bends[0], hl = h.flat.loops[1], c = [0, 0];
      hl.forEach(function (p) { c[0] += p[0] / hl.length; c[1] += p[1] / hl.length; });
      near(Math.abs((c[0] - b.a[0]) * (b.b[1] - b.a[1]) - (c[1] - b.a[1]) * (b.b[0] - b.a[0])) / 2, BA / 2 + 0.5 - R, 1e-6, 'the hole\'s place up the wall');
    });

    // ---- Corner Relief 3 Bend corner, Circular / Obround (the rfJV U channel)
    var U = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Front").polyline([[0, 2], [0, 0], [3, 0], [3, 2]], false).end().baseFlange(null, { depth: 4 });\n';
    function rfKGfl(at, o) { return 'p.flange(1, [' + JSON.stringify(at) + '], ' + JSON.stringify(o) + ');\n'; }
    function rfKGPart(pos, baseUp) { return U + rfKGfl([1.5, 0, 0], { position: pos, lengthRef: 'outer', reverse: !baseUp }) + rfKGfl([0, 1, 0], { position: pos, lengthRef: 'outer', reverse: true }) + rfKGfl([3, 1, 0], { position: pos, lengthRef: 'outer', reverse: true }); }
    var STUB = { inside: R + T, outside: R, bendOutside: 0 };
    var rfKGCache = {};
    function rfKGPlain(pos, up) { var k = pos + up; return rfKGCache[k] || (rfKGCache[k] = rfKGB(rfKGPart(pos, up))); }
    function rfKGExact(r, label) {
      var c = Evaluate.checkBody(r.body, { maxPairs: 1 });
      assert(!c.openEdges.length && !c.nonManifoldEdges.length, label + ': closed solid (' + c.openEdges.length + ' open, ' + c.nonManifoldEdges.length + ' non-manifold)');
      nearRel(r.mp.volume, rfKGArea(r.flat) * T, 1e-6, label + ': folded volume = blank area × T');
    }
    // the relief's area in the blank per corner: the shape (32-gon / obround as cornerReliefShape) less its part over
    // the corner notch [0, BA] × [stub, ∞)
    function rfKGRelief(type, size, centred, stub) {
      var C = centred ? [BA / 2, BA / 2] : [0, 0], h = size / 2, pts = [], i;
      if (type === 'circular') for (i = 0; i < 32; i++) { var th = 2 * Math.PI * i / 32; pts.push([C[0] + h * Math.cos(th), C[1] + h * Math.sin(th)]); }
      else {
        var d = Math.SQRT1_2, ca = [C[0] - d * h, C[1] - d * h], cb = [C[0] + d * h, C[1] + d * h], a0 = Math.atan2(Math.SQRT1_2, -Math.SQRT1_2);
        for (i = 0; i <= 16; i++) { var ta = a0 - Math.PI * i / 16; pts.push([cb[0] + h * Math.cos(ta), cb[1] + h * Math.sin(ta)]); }
        for (i = 0; i <= 16; i++) { var tb = a0 + Math.PI - Math.PI * i / 16; pts.push([ca[0] + h * Math.cos(tb), ca[1] + h * Math.sin(tb)]); }
      }
      var all = Math.abs(K.signedArea(pts)), notch = rfKGClip(rfKGClip(rfKGClip(pts, [-1, 0], 0), [1, 0], BA), [0, -1], -stub);
      return all - (notch.length > 2 ? Math.abs(K.signedArea(notch)) : 0);
    }

    test('rfKG: 3 Bend corner Circular Ø.12 / Ø.25 and Obround .12, centred and on P, Material Inside / Outside / Bend Outside: closed, folded = blank × T (1e-6), the blank loses the relief\'s shape less the notch exactly', function () {
      [['circular', 0.12], ['circular', 0.25], ['obround', 0.12]].forEach(function (q) {
        ['inside', 'outside', 'bendOutside'].forEach(function (pos) {
          [true, false].forEach(function (cen) {
            var a = rfKGPlain(pos, false), at = K.cornerReliefCandidates(a.model, a.build, '3bend').map(function (c) { return c.at; });
            var r = rfKGB(rfKGPart(pos, false) + 'p.cornerRelief(' + JSON.stringify(at) + ', ' + q[1] + ', ' + JSON.stringify({ cornerType: '3bend', reliefType: q[0], centeredOnBend: cen }) + ');\n');
            var label = q[0] + ' ' + q[1] + ' ' + pos + (cen ? ' centred' : ' on P');
            rfKGExact(r, label);
            near(rfKGArea(a.flat) - rfKGArea(r.flat), 2 * rfKGRelief(q[0], q[1], cen, STUB[pos]), 1e-9, label + ': blank');
            near(a.mp.volume - r.mp.volume, T * (rfKGArea(a.flat) - rfKGArea(r.flat)), 1e-6, label + ': removed = T × the blank\'s loss');
          });
        });
      });
    });

    test('rfKG: 3 Bend corner Circular with the base flange up, the flat\'s DXF, Edit to Rectangular and round trip', function () {
      var a = rfKGPlain('inside', true), at = K.cornerReliefCandidates(a.model, a.build, '3bend').map(function (c) { return c.at; });
      var r = rfKGB(rfKGPart('inside', true) + 'p.cornerRelief(' + JSON.stringify(at) + ', null, { cornerType: "3bend", reliefType: "circular" });\n');
      rfKGExact(r, 'base up, default size 2T');
      near(rfKGArea(a.flat) - rfKGArea(r.flat), 2 * rfKGRelief('circular', 2 * T, true, STUB.inside), 1e-9, 'default Ø = 2T');
      assert(r.flat.loops.length === 1, 'one blank');
      var dc = DxfCheck.check(K.exportDXFFlat(r.flat, 'in', {}), { units: 'in' });
      assert(dc.ok, 'DXF reads back: ' + dc.errors.join('; '));
      var f = r.model.features[r.model.features.length - 1];
      assert(f.type === 'cornerRelief' && f.cornerType === '3bend' && f.reliefType === 'circular', 'feature JSON: ' + JSON.stringify(f));
      var s = K.generateScript(r.model);
      assert(/p\.cornerRelief\([^\n]*\{ cornerType: "3bend", reliefType: "circular", name: "Corner-Relief1" \}\)/.test(s), 'script: ' + s);
      near(build(s).mp.volume, r.mp.volume, 1e-12, 'round trip: same volume');
      // the tool (what the rebuild cut) is there for the feature's highlight
      assert(r.build.tools && r.build.tools[f.id] && r.build.tools[f.id].polygons.length, 'the feature has its tool');
    });
  })();
