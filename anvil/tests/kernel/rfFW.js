  // --- rfFW (2026-10-30, lane FW: sheet-metal solids that still came out open) --- Sketched Bend across a hole and a
  // Closed Corner's open bend region both cut a wrapped tool (twisted walls) out of the faceted bend, which left cracks
  // and non-manifold edges in the BSP (81 swept Sketched Bends: 64 open; 60 swept Closed Corners: 15 open). Both now
  // build the bend's metal straight from the flat (Kernel.wrapRegion, lane FU's cure for Fold); wrapRegion clips the void
  // outlines to the band instead of clamping them, and bendZoneMap's last zone line is BA itself (BA·11/11 was 1 ulp
  // short on a 120° bend). Volumes are analytic on Anvil's faceted bend (segs = round(8A / 90°) chords, δ = A / segs): at
  // K = 0.5 a through void of flat area a inside the bend band takes a·T·sin δ / δ out, so a plate with a hole bent by a
  // Sketched Bend has volume T·(plate − hole) − T·(1 − sin δ / δ)·(band − a_band).
  (function () {
    group('rfFW: sheet metal that never cracks (Sketched Bend across a hole, Closed Corner open bend region)');
    var U = 'p.units("in");\n';
    function rfFWclosed(b, label) {
      var c = Evaluate.checkBody(b, { maxPairs: 1 });
      assert(c.openEdges.length === 0, label + ': open edges ' + c.openEdges.length);
      assert(c.nonManifoldEdges.length === 0, label + ': non-manifold edges ' + c.nonManifoldEdges.length);
    }
    // a polygon clipped to x0 ≤ x ≤ x1 (Sutherland–Hodgman), and its area
    function rfFWclipX(l, x0, x1) {
      function cl(poly, keep, v) {
        var out = [];
        for (var i = 0; i < poly.length; i++) {
          var p = poly[i], q = poly[(i + 1) % poly.length], ip = keep(p[0]), iq = keep(q[0]);
          if (ip) out.push(p);
          if (ip !== iq) { var f = (v - p[0]) / (q[0] - p[0]); out.push([v, p[1] + f * (q[1] - p[1])]); }
        }
        return out;
      }
      var a = cl(cl(l, function (x) { return x >= x0; }, x0), function (x) { return x <= x1; }, x1);
      return a.length < 3 ? 0 : Math.abs(K.signedArea(a));
    }
    // 6 × 4 plate, a hole, a Sketched Bend along x = 3 (left side fixed): closed, exact volume, flat 6 × 4 with the hole
    function rfFWsb(T, R, h, deg, pos) {
      var code = U + 'p.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
        'p.sketch("Top", ' + T + ').circle(' + h[0] + ', ' + h[1] + ', ' + h[2] + ').end().cut("through", { reverse: true });\n' +
        'p.sketch("Top", ' + T + ').line(3, 0, 3, -4).sketchedBend(' + deg + ', { fixed: [1, 0, 2], position: "' + pos + '" });\n';
      var r = build(code), label = T + ' / R ' + R + ' Ø' + 2 * h[2] + ' ' + deg + '° ' + pos;
      noErrors(r);
      rfFWclosed(r.body, label);
      var A = deg * Math.PI / 180, BA = A * (R + T / 2), segs = Math.max(4, Math.round(8 * A / (Math.PI / 2))), dl = A / segs, fk = Math.sin(dl) / dl;
      var shift = pos === 'centerline' ? BA / 2 : pos === 'inside' ? R + T : pos === 'outside' ? R : 0, x0 = 3 - shift;
      var flat = K.flatPattern(r.model, r.build, r.mesh);
      near(flat.size[0], 6, 1e-9, label + ': flat length'); near(flat.size[1], 4, 1e-9, label + ': flat width');
      assert(flat.loops.length === 2, label + ': flat = outline + the hole (' + flat.loops.length + ' loops)');
      var hole = flat.loops[1], ha = Math.abs(K.signedArea(hole)), aBand = rfFWclipX(hole, x0, x0 + BA);
      assert(aBand > 1e-4, label + ': the hole reaches into the bend (band area ' + fmt(aBand) + ')');
      // (lane FX: the faceted volume; wrapRegion's points inside a zone sit at their true angle on the chord, so a void
      // edge inside a zone is off this linear-map formula by up to ~1e-7: 5e-7; r.mp.volume integrates to the arcs)
      nearRel(r.body.volume(), T * (24 - ha) - T * (1 - fk) * (4 * BA - aBand), 5e-7, label + ': volume');
      var fb = K.flatBody(r.model, r.build, flat).body;
      rfFWclosed(fb, label + ' flat');
      nearRel(fb.volume(), T * (24 - ha), 1e-9, label + ': flat solid = blank area × T');
      return fmt(r.body.volume());
    }

    test('rfFW: Sketched Bend across a Ø0.5 hole on a 16 ga plate, 90° centerline (was 9 non-manifold edges): closed, volume exact to 1e-9, flat 6 × 4 with the hole, closed', function () {
      return rfFWsb(0.0598, 0.0598, [3, -2, 0.25], 90, 'centerline');
    });

    test('rfFW: Sketched Bend across holes at 45° / 120°, Material Inside / Bend Outside, 14 ga and 0.125 R 0.25 (were 3 to 66 open edges each): closed and exact', function () {
      rfFWsb(0.0598, 0.0598, [3.05, -1, 0.15], 120, 'centerline');   // the 120° zone-line ulp (25 non-manifold)
      rfFWsb(0.0747, 0.0747, [2.9, -3, 0.5], 45, 'inside');
      rfFWsb(0.125, 0.25, [3, -2, 0.25], 90, 'centerline');          // a hole vertex past the bend start (clip, not clamp)
      rfFWsb(0.0747, 0.0747, [3.05, -1, 0.15], 120, 'bendOutside');
    });

    test('rfFW: Kernel.wrapRegion at 120° (11 chords) with a void through both bend ends, and one poking a vertex 0.0046 past s = 0: closed, volume = sin δ / δ · T · (band − void clipped to the band)', function () {
      var R = 0.0598, T = 0.0598, A = 2 * Math.PI / 3, BA = A * (R + T / 2), dl = A / 11, L = 4;
      var plane = { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1] };
      function circ(cs, ct, rr) { var l = []; for (var i = 0; i < 32; i++) { var a = 2 * Math.PI * i / 32; l.push([cs + rr * Math.cos(a), ct + rr * Math.sin(a)]); } return l; }
      [circ(BA / 2, 0, 0.15), circ(0.2454, 0.5, 0.25)].forEach(function (v, k) {
        var w = K.wrapRegion([v], { A: A, R: R, T: T }, BA, plane, -L / 2, L / 2);
        rfFWclosed(w, 'void ' + (k + 1));
        // lane FX: wrapRegion places points inside a zone at their TRUE angle on the chord and tags its caps with the
        // bend's cylinders, so the faceted volume is sin δ / δ of the band only where the void's edges run along s or
        // through zone lines (to 2e-7 here); Mass Properties integrates it to T · (band − void) (to 1e-6: a void edge
        // slanting across a zone is straight on the chord, not on the true wrapped curve)
        nearRel(w.volume(), Math.sin(dl) / dl * T * (BA * L - rfFWclipX(v, 0, BA)), 5e-7, 'void ' + (k + 1) + ' volume');
        nearRel(K.massProps(K.meshFromBody(w)).volume, T * (BA * L - rfFWclipX(v, 0, BA)), 1e-6, 'void ' + (k + 1) + ' exact volume');
      });
    });

    // Closed Corner on the rfCS tray (4 × 3, four 1.0 Material Inside flanges as separate features), open bend region:
    // the matching wall's bend end is rebuilt from the flat (bendSector out, wrapRegion back) instead of wrapCut
    function rfFWtray(T, R) {
      return U + 'p.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
        [[2, T, 0], [4, T, 1.5], [2, T, 3], [0, T, 1.5]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer" });\n'; }).join('');
    }
    function rfFWfaces(T, R) { return [[T / 2, 0.6, R + T], [4 - T / 2, 0.6, R + T], [4 - R - T, 0.6, 3 - T / 2], [T / 2, 0.6, 3 - R - T]]; }
    function rfFWcc(faces, type) { return 'p.closedCorner(' + JSON.stringify(faces) + ', ' + JSON.stringify({ cornerType: type, gap: 0.01, coplanar: false }) + ');\n'; }

    test('rfFW: Butt Closed Corner, 20 ga R 0.0718 (was 9 open edges): closed; added volume = H·T·(R − g) − H·T·(T + g) − the bend taper (rfCS formula), to 1e-9', function () {
      var T = 0.0359, R = 0.0718, H = 1 - (R + T), g = 0.01 / Math.SQRT2;
      var SEC = 8 * 0.5 * Math.sin(Math.PI / 16) * ((R + T) * (R + T) - R * R);
      var want = H * T * (R - g) - H * T * (T + g) - SEC * ((T + R) + (T + g)) / 2;
      var b = build(rfFWtray(T, R)), r = build(rfFWtray(T, R) + rfFWcc([rfFWfaces(T, R)[0]], 'butt'));
      noErrors(r);
      rfFWclosed(r.body, 'butt');
      near(r.body.volume() - b.body.volume(), want, 1e-9, 'added volume');
      var flat = K.flatPattern(r.model, r.build, r.mesh), fb = K.flatBody(r.model, r.build, flat).body;
      rfFWclosed(fb, 'butt flat');
      return fmt(r.body.volume());
    });

    test('rfFW: Overlap / Underlap Closed Corner, one corner, 16 ga, 14 ga, 20 ga (were 6 to 24 open edges): closed, and the flat closed', function () {
      [[0.0598, 0.0598, 'overlap'], [0.0747, 0.0747, 'overlap'], [0.0359, 0.0718, 'underlap']].forEach(function (c) {
        var r = build(rfFWtray(c[0], c[1]) + rfFWcc([rfFWfaces(c[0], c[1])[0]], c[2])), label = c[0] + ' ' + c[2];
        noErrors(r);
        rfFWclosed(r.body, label);
        rfFWclosed(K.flatBody(r.model, r.build, K.flatPattern(r.model, r.build, r.mesh)).body, label + ' flat');
      });
    });

    // four corners in one feature: the unioned tools touch on the bends' end planes and the plain (body − cut) ∪ add
    // cracks; buildClosedCorner's apply(body) makes the same solid one tool at a time
    test('rfFW: Overlap on all four corners of a 0.125 tray (plain booleans: 36 open edges): buildClosedCorner(…).apply is closed, each corner adds the same volume as one alone (to 1e-9)', function () {
      var T = 0.125, R = 0.125, b = build(rfFWtray(T, R)), F4 = rfFWfaces(T, R);
      function cc(faces) {
        var f = { id: 'cc', type: 'closedCorner', faces: faces, cornerType: 'overlap', gap: 0.01, ratio: 1, coplanar: false };
        return K._.buildClosedCorner(f, b.model, { body: b.body, flanges: {} }).apply(b.body);
      }
      var one = cc([F4[0]]), four = cc(F4);
      rfFWclosed(one, 'one corner'); rfFWclosed(four, 'four corners');
      near(four.volume() - b.body.volume(), 4 * (one.volume() - b.body.volume()), 1e-9, 'four corners = 4 × one');
      return fmt(four.volume());
    });

    test('rfFW: four Closed Corners in one feature closed through the rebuild (kernel-rebuild.js case closedCorner calls ccr.apply(ctx.body); head, local-2026-10-30b)', function () {
      var T = 0.125, R = 0.125, r = build(rfFWtray(T, R) + rfFWcc(rfFWfaces(T, R), 'overlap'));
      var c = Evaluate.checkBody(r.body, { maxPairs: 1 }), n = c.openEdges.length + c.nonManifoldEdges.length;
      assert(!n, c.openEdges.length + ' open, ' + c.nonManifoldEdges.length + ' non-manifold edges');
      return 'closed, volume ' + fmt(r.body.volume());
    });

    // --- lane FW2 (follow-up) ---
    test('rfFW: Overlap Closed Corner with ratio 0.5 on the 16 ga tray (rfGA G46, was 8 open): closed, the flat closed, flat area × T = OpenCascade 1.447207', function () {
      var T = 0.0598, R = 0.0598, r = build(rfFWtray(T, R) + 'p.closedCorner([[' + T / 2 + ', 0.6, ' + (R + T) + ']], { cornerType: "overlap", ratio: 0.5 });\n');
      noErrors(r);
      rfFWclosed(r.body, 'overlap 0.5');
      var flat = K.flatPattern(r.model, r.build, r.mesh), fb = K.flatBody(r.model, r.build, flat).body;
      rfFWclosed(fb, 'overlap 0.5 flat');
      nearRel(fb.volume(), 1.447206998, 1e-9, 'flat area × T');
    });

    // a hole cut across a bend in the Unfold, then Fold: folded = bracket − (unfolded − unfolded with the cut) −
    // T·a_band·(c − 1), c = segs·(R + T/2)·sin δ / BA (one zone of flat strip BA / segs long onto its faceted trapezoid;
    // K 0.5 makes c = sin δ / δ), a_band the void's area in the band (the Fold's foldCutouts records)
    function rfFWfold(base, unf, cut, K0, tol) {
      var T = K.sheetParams(build(base).model).thickness, R = T, A = Math.PI / 2, dl = A / 8;
      var BA = K.bendAllowance(A, R, T, K0), c = 8 * (R + T / 2) * Math.sin(dl) / BA;
      var r = build(base + unf + cut + 'p.fold(null);\n');
      noErrors(r);
      rfFWclosed(r.body, 'folded');
      var aBand = 0;
      r.model.features.forEach(function (f) {
        if (f.type === 'fold') (r.build.flanges[f.id] || []).forEach(function (rec) { if (rec && rec.kind === 'foldCutouts') rec.cutouts.forEach(function (l) { aBand += Math.abs(K.signedArea(l)); }); });
      });
      assert(aBand > 1e-4, 'the Fold wrapped the hole (band area ' + fmt(aBand) + ')');
      var want = build(base).body.volume() - (build(base + unf).body.volume() - build(base + unf + cut).body.volume()) - T * aBand * (c - 1);
      nearRel(r.body.volume(), want, tol || 1e-9, 'folded volume');
      rfFWclosed(K.flatBody(r.model, r.build, K.flatPattern(r.model, r.build, r.mesh)).body, 'flat');
      return fmt(r.body.volume());
    }
    test('rfFW: 14 ga back flange, Ø0.281 hole across its bend cut in the Unfold, Fold (rfFT pin 12, fuzz sheet 899 / 323: a hole vertex 5e-5 inside the bend start read as a blind cut): closed, exact at K 0.4 and K 0.5', function () {
      [0.4, 0.5].forEach(function (K0) {
        var base = U + 'p.sheet(0.0747, 0.0747, ' + K0 + ');\np.sketch("Top").rect(0, -2.75, 4, 2.75).end().baseFlange();\np.flange(1, [[2, 0.0747, 2.75]], { position: "inside", lengthRef: "outer" });\n';
        // head: 1e-7, not 1e-9: lane FX's Fold places the hole's points inside the bend zone at the true angle, so the 8-chord
        // formula above is 6e-9 off for a hole this close to the bend start (the solid itself is exact in mp.volume)
        rfFWfold(base, 'p.unfold([2, 0.0747, 1.375], null);\n', 'p.sketch("Top", 0.0747).circle(2.8814, -2.7, 0.1405).end().cut("through", { reverse: true });\n', K0, 1e-7);
      });
    });

    test('rfFW: one-sided Rip (side 1 / side 2) then Insert Bends on a shelled 2 × 2 × 1 box (rfGA G42, was refused as a closed ring): builds, closed, the flat closed, side 1 = side 2, flat area × T within the faceting (1e-3)', function () {
      var vols = ['side1', 'side2'].map(function (d) {
        var r = build(U + 'p.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\np.shell(0.06, [[1, 1, -1]]);\np.rip([[2, 0.5, 0], [2, 0.5, -2], [0, 0.5, -2], [0, 0.5, 0]], 0.03, { direction: "' + d + '" });\np.insertBends([1, 0, -1], { radius: 0.06 });\n');
        noErrors(r);
        rfFWclosed(r.body, d);
        var flat = K.flatPattern(r.model, r.build, r.mesh), fb = K.flatBody(r.model, r.build, flat).body;
        rfFWclosed(fb, d + ' flat');
        nearRel(r.body.volume(), fb.volume(), 1e-3, d + ': folded vs flat area × T');
        return r.body.volume();
      });
      near(vols[0], vols[1], 1e-9, 'side 1 = side 2');
      return fmt(vols[0]);
    });

    test('rfFW TODO: two Unfold / Cut / Fold rounds with the second hole crossing the bend end (rfFT pin 13, fuzz sheet 929)', function () {
      var src = 'p.sheet(0.0747, 0.0747, 0.5);\np.sketch("Top").rect(0, -3.5, 5.5, 3.5).end().baseFlange();\np.flange(1.625, [[0, 0.0747, 1.75]], { position: "inside", lengthRef: "outer" });\n' +
        'p.unfold([2.75, 0.0747, 1.75], null);\np.sketch("Top", 0.0747).circle(-0.05, -2.1517, 0.25).end().cut("through", { reverse: true });\np.fold(null);\n' +
        'p.unfold([2.75, 0.0747, 1.75], null);\np.sketch("Top", 0.0747).circle(-0.05, -2.5522, 0.1405).end().cut("through", { reverse: true });\np.fold(null);\n';
      var r = build(U + src), c = Evaluate.checkBody(r.body, { maxPairs: 1 }), n = c.openEdges.length + c.nonManifoldEdges.length;
      return n ? 'TODO ' + c.openEdges.length + ' open, ' + c.nonManifoldEdges.length + ' non-manifold edges (the second Unfold\'s blank has stray vertices 2e-5 off the hole near the bend end)' : 'closed now: promote to a hard test';
    });
  })();
