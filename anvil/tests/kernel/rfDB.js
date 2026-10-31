  // --- rfDB (2026-10-26, lane DB: sheet metal Unfold / Fold) --- unfold bends about a fixed face (all, or some), cut
  // across the flat, fold back: the cut wraps round the bend and the flat pattern shows it exactly as cut. 16 ga steel
  // L-bracket and U-channel (T = R = 0.0598, K = 0.5, Material Inside, 1.5 walls to the outer sharp).
  (function () {
    group('rfDB: Unfold / Fold (slot across a bend, Collect All Bends, partial unfold / fold, fixed face, errors, round trip)');
    var T = 0.0598, R = 0.0598, BA = Math.PI / 2 * (R + 0.5 * T), ZB = (R + T) - BA / 2;   // ZB: the bend line's z in the flat
    var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n';
    var L = HEAD + 'p.flange(1.5, [[3, ' + T + ', 0]], { position: "inside", lengthRef: "outer" });\n';
    var U = HEAD + 'p.flange(1.5, [[3, ' + T + ', 0], [3, ' + T + ', 4]], { position: "inside", lengthRef: "outer" });\n';
    var UNF = 'p.unfold([1, ' + T + ', 2], null);\n';
    // a 0.25 (across) × 1.0 (along) slot centred on the bend line at x = 3, cut through the flat from above
    var SLOT = 'p.sketch("Top", 1).rect(2.5, ' + (-(ZB + 0.125)) + ', 1, 0.25).cut("through", { reverse: true });\n';
    // the faceted bend section (8 chords per 90°, as the solid's) between the inside and outside radii
    var FACET = 8 * 0.5 * Math.sin(Math.PI / 16) * ((R + T) * (R + T) - R * R);
    function blankArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? K.signedArea(l) : -Math.abs(K.signedArea(l))); }, 0); }
    function flatOf(r) { return K.flatPattern(r.model, r.build, r.mesh); }
    function box(l) { var b = [Infinity, Infinity, -Infinity, -Infinity]; l.forEach(function (p) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }); return b; }
    function errOf(r) { var ids = Object.keys(r.errors); return ids.length ? r.errors[ids[0]] : ''; }
    var memo = {};
    function bld(code) { if (!memo[code]) memo[code] = build(code); return memo[code]; }

    test('rfDB: Unfold of the L-bracket (Collect All Bends, fixed face the base top) lays it flat in place: volume = blank × T, the base stays where it was, the wall runs out along −z by 1.5 − BD', function () {
      var b = bld(L), u = bld(L + UNF);
      noErrors(u);
      var flat = flatOf(b), bb = u.build.body.getBounds();
      nearRel(u.mp.volume, blankArea(flat) * T, 1e-9, 'volume = blank × T');
      near(bb.min[1], 0, 1e-9, 'y min'); near(bb.max[1], T, 1e-9, 'y max: flat in the base plane');
      near(bb.max[2], 4, 1e-9, 'the base\'s back edge stays at z = 4');
      near(bb.min[2], 4 - flat.size[1], 1e-9, 'the flat runs out to z = 4 − flat length');
      return 'flat 6 × ' + fmt(flat.size[1]) + ', volume ' + fmt(u.mp.volume);
    });

    test('rfDB: the shop case: Unfold, a 0.25 × 1.0 slot cut flat centred on the bend line, Fold: volume = bracket − slot developed round the bend (whole faceted bend section + (0.25 − BA)·T straight, × 1.0), exact', function () {
      var b = bld(L), f = bld(L + UNF + SLOT + 'p.fold();\n');
      noErrors(f);
      var want = polyVol(b.mp) - 1.0 * (FACET + (0.25 - BA) * T);
      near(polyVol(f.mp), want, 1e-12, "folded volume (faceted)"); near(f.mp.volume, b.mp.volume - 0.25 * T, 1e-9, "folded volume, exact (cylinder records, lane FX): bracket − 0.25·T");
      var tst = f.build.body.pointTester();
      // the slot is open through the bend at mid-angle and in the base / wall just past the bend, metal beside it
      var C = [3, R + T, R + T], mid = [C[0], C[1] - (R + T / 2) * Math.cos(Math.PI / 4), C[2] - (R + T / 2) * Math.sin(Math.PI / 4)];
      assert(!tst(mid), 'air at the middle of the bend inside the slot');
      assert(tst([3.6, mid[1], mid[2]]), 'metal in the bend beside the slot');
      assert(!tst([3, T / 2, R + T + 0.03]) && !tst([3, R + T + 0.03, T / 2]), 'air in the base and the wall just past the bend');
      return 'removed ' + fmt(b.mp.volume - f.mp.volume);
    });

    test('rfDB: the folded part\'s flat pattern shows exactly the slot as cut: one 4-corner hole 1.0 × 0.25 centred on the bend line, same blank, one HOLES loop in the DXF', function () {
      var b = bld(L), f = bld(L + UNF + SLOT + 'p.fold();\n'), flat = flatOf(f), flat0 = flatOf(b);
      assert(flat.loops.length === 2, 'outline + one hole, got ' + flat.loops.length);
      near(flat.size[0], flat0.size[0], 1e-12, 'blank width unchanged'); near(flat.size[1], flat0.size[1], 1e-12, 'blank length unchanged');
      var h = flat.loops[1], bx = box(h);
      assert(h.length === 4, '4 corners, got ' + h.length);
      near(bx[2] - bx[0], 1, 1e-9, 'slot 1.0 along the bend'); near(bx[3] - bx[1], 0.25, 1e-9, 'slot 0.25 across');
      near((bx[1] + bx[3]) / 2, -ZB, 1e-9, 'centred on the bend line');
      near(Math.abs(K.signedArea(h)), 0.25, 1e-9, 'hole area');
      near((flat.bends[0].a[1] + flat.bends[0].b[1]) / 2, -ZB, 1e-9, 'the bend line is where the slot is centred');
      var dxf = K.exportDXFFlat(flat, 'in', { style: 'entities' }), c = DxfCheck.check(dxf, { units: 'in' });
      assert(c.ok && c.loops.filter(function (l) { return l.layer === 'HOLES'; }).length === 1, 'DXF: one closed HOLES loop: ' + c.errors.join('; '));
      return 'hole ' + fmt(bx[2] - bx[0]) + ' × ' + fmt(bx[3] - bx[1]);
    });

    test('rfDB: a U-channel with Collect All Bends unfolds flat: volume = blank × T (1e-6 rel), flat in the base plane, both walls laid out', function () {
      var b = bld(U), u = bld(U + 'p.unfold([1, ' + T + ', 2], []);\n');
      noErrors(u);
      var flat = flatOf(b), bb = u.build.body.getBounds();
      nearRel(u.mp.volume, blankArea(flat) * T, 1e-6, 'volume = blank × T');
      near(bb.max[1] - bb.min[1], T, 1e-9, 'flat: T thick');
      near(bb.max[2] - bb.min[2], flat.size[1], 1e-9, 'flat length');
      assert(u.build.flanges[u.model.features[u.model.features.length - 1].id][0].bends.length === 2, 'the Unfold record lists 2 bends');
      return 'flat 6 × ' + fmt(flat.size[1]);
    });

    test('rfDB: a partial Unfold (the front bend only) leaves the back wall standing at 90°; Fold brings the part back to the same volume; a Fold of one bend of two leaves the other flat, a second Fold finishes', function () {
      var b = bld(U), bends = K.sheetBends(b.model, b.build, b.mesh);
      assert(bends.length === 2, '2 bends: ' + bends.length);
      var front = bends.filter(function (x) { return x.at[2] < 1; })[0];
      var p = build(U + 'p.unfold([1, ' + T + ', 2], [' + JSON.stringify(front.at) + ']);\n');
      noErrors(p);
      var bb = p.build.body.getBounds();
      near(bb.max[1], 1.5, 1e-9, 'the back wall still stands 1.5 tall'); near(bb.max[2], 4, 1e-9, 'back at z = 4');
      near(bb.min[2], 4 - (4 + 1.5 - (2 * (R + T) - BA)), 1e-9, 'the front wall lies flat out to z = −(1.5 − BD)');
      var pf = build(U + 'p.unfold([1, ' + T + ', 2], [' + JSON.stringify(front.at) + ']);\np.fold();\n');
      noErrors(pf); near(pf.mp.volume, b.mp.volume, 1e-12, 'folded back: the same volume');
      var h = build(U + UNF + 'p.fold([' + JSON.stringify(front.at) + ']);\n');
      noErrors(h);
      var hb = h.build.body.getBounds();
      near(hb.min[2], 0, 1e-9, 'front wall folded up again'); assert(hb.max[2] > 5, 'the back wall still flat: z max ' + fmt(hb.max[2]));
      var h2 = build(U + UNF + 'p.fold([' + JSON.stringify(front.at) + ']);\np.fold();\n');
      noErrors(h2); near(h2.mp.volume, b.mp.volume, 1e-12, 'the second Fold finishes');
      return 'partial ok';
    });

    test('rfDB: Fixed face on the front wall\'s outside face: the flat lies in that wall\'s plane (z ∈ [0, T]) and the wall stays where it was', function () {
      var u = build(U + 'p.unfold([1, 0.8, 0], []);\n');
      noErrors(u);
      var bb = u.build.body.getBounds();
      near(bb.min[2], 0, 1e-9, 'z min'); near(bb.max[2], T, 1e-9, 'z max');
      near(bb.max[1], 1.5, 1e-9, 'the wall\'s top edge stays at y = 1.5');
      return 'y ' + fmt(bb.min[1]) + '..' + fmt(bb.max[1]);
    });

    test('rfDB: a round Ø.300 hole drilled flat across the bend line comes back from Fold as one CIRCLE in the flat DXF (centre and radius as drilled); a hole in the flat wall only lands on the folded wall rigidly', function () {
      var c = build(L + UNF + 'p.sketch("Top", 1).circle(2, ' + (-ZB) + ', 0.15).cut("through", { reverse: true });\np.fold();\n');
      noErrors(c);
      var flat = flatOf(c), dxf = K.exportDXFFlat(flat, 'in', { style: 'entities' }), ck = DxfCheck.check(dxf, { units: 'in' });
      assert(ck.ok, 'DXF check: ' + ck.errors.join('; '));
      var m = /\n0\nCIRCLE\n8\nHOLES\n10\n([-\d.e]+)\n20\n([-\d.e]+)\n(?:30\n[-\d.e]+\n)?40\n([-\d.e]+)/.exec(dxf);
      assert(m, 'one CIRCLE on HOLES');
      var x0 = -flat.bbox.min[0], y0 = -flat.bbox.min[1];
      near(+m[1], 2 + x0, 1e-4, 'circle x'); near(+m[2], -ZB + y0, 1e-4, 'circle y'); near(+m[3], 0.15, 1e-4, 'radius');
      var w = build(L + UNF + 'p.sketch("Top", 1).circle(3, ' + (-((R + T) - BA - 0.6)) + ', 0.1).cut("through", { reverse: true });\np.fold();\n');
      noErrors(w);
      var b = bld(L), tst = w.build.body.pointTester();
      assert(!tst([3, R + T + 0.6, T / 2]) && tst([3, R + T + 0.75, T / 2]), 'the hole is in the wall 0.6 above the bend, metal 0.15 above it');
      near(b.mp.volume - w.mp.volume, Math.PI * 0.01 * T, 1e-4, 'removed: the Ø.200 hole through T (36-gon)');
      return 'circle at ' + fmt(+m[1]) + ', ' + fmt(+m[2]);
    });

    test('rfDB: 14 ga (T = R = 0.0747): the slot cut flat across the bend still comes back as exactly 0.25 × 1.0 in the flat', function () {
      var T2 = 0.0747, BA2 = Math.PI / 2 * (T2 + 0.5 * T2), zb2 = 2 * T2 - BA2 / 2;
      var g = build('p.units("in");\np.sheet(' + T2 + ', ' + T2 + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1.5, [[3, ' + T2 + ', 0]], { position: "inside", lengthRef: "outer" });\np.unfold([1, ' + T2 + ', 2]);\np.sketch("Top", 1).rect(2.5, ' + (-(zb2 + 0.125)) + ', 1, 0.25).cut("through", { reverse: true });\np.fold();\n');
      noErrors(g);
      var flat = flatOf(g);
      assert(flat.loops.length === 2 && flat.loops[1].length === 4, 'one 4-corner hole');
      near(Math.abs(K.signedArea(flat.loops[1])), 0.25, 1e-9, 'hole area');
      return 'ok';
    });

    test('rfDB: a sketch on the Unfold\'s flat face (a face reference to it) drives the cut; generateScript writes p.unfold / p.fold and the script and the JSON rebuild to the same volume', function () {
      var code = L + 'var uf = p.unfold([1, ' + T + ', 2]).last();\np.sketch({ face: uf, role: "geom", normal: [0, 1, 0], at: [1, ' + T + ', 1] }).rect(2.5, ' + (-(ZB + 0.125)) + ', 1, 0.25).cut(0.5, { reverse: true });\np.fold();\n';
      var r = build(code), b = bld(L);
      noErrors(r);
      near(polyVol(r.mp), polyVol(b.mp) - 1.0 * (FACET + (0.25 - BA) * T), 1e-12, 'volume');
      var s = K.generateScript(r.model);
      assert(/p\.unfold\(\[1,0\.0598,2\], null, \{ name: "Unfold1" \}\)/.test(s) && /p\.fold\(null, \{ name: "Fold1" \}\)/.test(s), 'script lines: ' + s.split('\n').filter(function (l) { return /fold/.test(l); }).join(' | '));
      var r2 = build(s);
      noErrors(r2); near(r2.mp.volume, r.mp.volume, 1e-12, 'script round trip');
      var m4 = JSON.parse(JSON.stringify(r.model)), b4 = K.rebuild(m4);
      near(K.massProps(K.meshFromBody(b4.body)).volume, r.mp.volume, 1e-12, 'JSON round trip');
      var bends = K.sheetBends(b.model, b.build, b.mesh), s2 = K.generateScript(build(L + 'p.unfold(null, [' + JSON.stringify(bends[0].at) + ']);\np.fold([' + JSON.stringify(bends[0].at) + ']);\n').model);
      assert(/p\.unfold\(null, \[\[3,0\.0562,0\.0562\]\]/.test(s2) && /p\.fold\(\[\[3,0\.0562,0\.0562\]\]/.test(s2), 'picked bends written: ' + s2.split('\n').filter(function (l) { return /fold/.test(l); }).join(' | '));
      return 'ok';
    });

    test('rfDB: errors: Fold with no Unfold (lane DJ: a second Unfold is no error now), a bend point off every bend, a fixed face off the sheet, Unfold on a flat plate', function () {
      assert(/no Unfold before it/.test(errOf(build(L + 'p.fold();\n'))), 'Fold alone');
      assert(!errOf(build(L + UNF + 'p.unfold();\n')), 'Unfold twice: no error since lane DJ (the second folds the first back and unfolds both)');
      assert(/not on a bend/.test(errOf(build(L + 'p.unfold(null, [[1, 1, 1]]);\n'))), 'bend point');
      assert(/not a flat face/.test(errOf(build(L + 'p.unfold([9, 9, 9]);\n'))), 'fixed face');
      assert(/no bends/.test(errOf(build(HEAD + 'p.unfold();\n'))), 'flat plate');
      return 'ok';
    });

    test('rfDB: sheetBendAt finds a bend from a point on its inside or outside surface; unfoldedBendAt finds an unfolded strip from a point on either face of it', function () {
      var b = bld(L), bends = K.sheetBends(b.model, b.build, b.mesh), C = [3, R + T, R + T], a = Math.PI / 6;
      assert(K.sheetBendAt(bends, [3, C[1] - R * Math.cos(a), C[2] - R * Math.sin(a)], T) === 0, 'inside surface');
      assert(K.sheetBendAt(bends, [1, C[1] - (R + T) * Math.cos(a), C[2] - (R + T) * Math.sin(a)], T) === 0, 'outside surface');
      assert(K.sheetBendAt(bends, [3, T, 2], T) === -1, 'the base top is no bend');
      var u = bld(L + UNF), rec = u.build.flanges[u.model.features[u.model.features.length - 1].id][0];
      assert(K.unfoldedBendAt(rec, [2, T, ZB], T) === 0 && K.unfoldedBendAt(rec, [2, 0, ZB], T) === 0, 'top and bottom of the strip');
      assert(K.unfoldedBendAt(rec, [2, T, 1], T) === -1, 'the base is no strip');
      return 'ok';
    });
    // lane DB2: the flat of a part left unfolded keeps the unfolded bends' lines and notes (SolidWorks); mitred bend
    // ends get exact cutouts after Fold
    test('rfDB2: while unfolded, the flat pattern keeps the bend lines and notes of the unfolded bends (the same lines, labels, UP / DOWN and blank as folded): L-bracket, U-channel with the fixed face on a wall, a partial unfold; the DXF has them on BEND / NOTES', function () {
      function same(fa, fb, what) {
        near(fa.size[0], fb.size[0], 1e-9, what + ' width'); near(fa.size[1], fb.size[1], 1e-9, what + ' length');
        assert(fa.bends.length === fb.bends.length, what + ': ' + fa.bends.length + ' bends, folded ' + fb.bends.length);
        function key(b) { return [b.a, b.b].map(function (q) { return q.map(function (x) { return Math.round(x * 1e6); }).join(','); }).sort().join('|') + ' ' + b.label + ' ' + b.up; }
        var ka = fa.bends.map(key).sort(), kb = fb.bends.map(key).sort();
        assert(JSON.stringify(ka) === JSON.stringify(kb), what + ': ' + JSON.stringify(ka) + ' vs ' + JSON.stringify(kb));
      }
      var bL = bld(L), uL = bld(L + UNF);
      same(flatOf(uL), flatOf(bL), 'L unfolded');
      var dxf = K.exportDXFFlat(flatOf(uL), 'in', { style: 'entities' });
      assert(/\n8\nBEND\n/.test(dxf) && /UP 90/.test(dxf), 'DXF: a BEND line and its UP 90° note');
      var bU = bld(U), uw = build(U + 'p.unfold([1, 0.8, 0], []);\n');
      noErrors(uw); same(flatOf(uw), flatOf(bU), 'U unfolded about a wall');
      var bends = K.sheetBends(bU.model, bU.build, bU.mesh), front = bends.filter(function (x) { return x.at[2] < 1; })[0];
      var pu = build(U + 'p.unfold([1, ' + T + ', 2], [' + JSON.stringify(front.at) + ']);\n');
      noErrors(pu); same(flatOf(pu), flatOf(bU), 'U with one bend unfolded');
      var fd = build(L + UNF + 'p.fold();\n');
      noErrors(fd); same(flatOf(fd), flatOf(bL), 'folded again');
      return flatOf(uL).bends.map(function (b) { return b.label; }).join(', ');
    });

    test('rfDB2: mitred bend ends: a 0.25 × 1.0 slot cut flat across a bend whose ends are mitred (two Miter flanges at a corner) comes back from Fold as exactly that hole in the flat (was: no cutouts on a mitred strip, so the flat bridged the slot); one near the mitred end is exact too', function () {
      var MIT = HEAD + 'p.flange(1.5, [[3, ' + T + ', 0], [6, ' + T + ', 2]], { position: "inside", lengthRef: "outer", miter: true });\n';
      var b = bld(MIT), f0 = flatOf(b);
      noErrors(b);
      var f = build(MIT + UNF + 'p.sketch("Top", 1).rect(2.5, ' + (-(ZB + 0.125)) + ', 1, 0.25).cut("through", { reverse: true });\np.fold();\n');
      noErrors(f);
      var fl = flatOf(f);
      assert(fl.loops.length === 2 && fl.loops[1].length === 4, 'one 4-corner hole: ' + fl.loops.map(function (l) { return l.length; }));
      near(Math.abs(K.signedArea(fl.loops[1])), 0.25, 1e-9, 'hole area');
      near(fl.size[0], f0.size[0], 1e-9, 'blank width'); near(fl.size[1], f0.size[1], 1e-9, 'blank length');
      var g = build(MIT + UNF + 'p.sketch("Top", 1).rect(5, ' + (-(ZB + 0.125)) + ', 0.7, 0.25).cut("through", { reverse: true });\np.fold();\n');
      noErrors(g);
      var gl = flatOf(g);
      assert(gl.loops.length === 2 && gl.loops[1].length === 4, 'near the mitre: one 4-corner hole');
      near(Math.abs(K.signedArea(gl.loops[1])), 0.175, 1e-9, 'near the mitre: hole area 0.7 × 0.25');
      return 'ok';
    });
  })();
