  // --- rfJS (2026-11-06, lane sweptflange) --- Swept Flange: an open profile (an open-profile Base Flange's section:
  // the sketch line one face, T on its right, sharp corners bent at the sheet radius) swept along a tangent path of
  // lines and arcs (a sketch, or edges of the part). Flat: a straight path = the profile developed × the path length;
  // a path with arcs and a profile of one line = rings, cylinders and cones developed exactly on the neutral surface.
  (function () {
    group('rfJS: Swept Flange (straight path, arc path rings / cylinders / cones, Flatten along path, model edges), flat, DXF, round trip');
    var T = 0.06, HEAD = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\n';
    function rfJSB(code, noFlat) {
      var r = build(HEAD + code);
      noErrors(r);
      if (!noFlat) r.flat = K.flatPattern(r.model, r.build, r.mesh);
      return r;
    }
    function rfJSErr(code) {
      try { var r = build(HEAD + code); var ids = Object.keys(r.errors || {}); return ids.length ? r.errors[ids[ids.length - 1]] : ''; } catch (e) { return e.message; }
    }
    function rfJSFlatErr(code) {
      var r = build(HEAD + code); noErrors(r);
      try { K.flatPattern(r.model, r.build, r.mesh); return ''; } catch (e) { return e.message; }
    }
    function rfJSW(flat) { return Math.min(flat.size[0], flat.size[1]); }   // the developed width (the path is longer)
    function rfJSClosed(r) { var q = K.meshQuality(r.mesh); assert(q.closed && !q.openEdges && !q.nonManifoldEdges, 'closed solid ' + JSON.stringify(q)); }

    test('rfJS: straight path, an L profile (2 × 1, inside corner bent at R = T): flat = (flats + BA) × path length exactly, volume = flat × T (K .5), one bend line UP / DOWN mid-bend, closed DXF with a BEND line', function () {
      var r = rfJSB('var path = p.sketch("Top").line(0, 0, 0, -10).id();\nvar prof = p.sketch("Front").polyline([[0, 0], [2, 0], [2, 1]], false).id();\np.sweptFlange(prof, path);\n');
      var BA = Math.PI / 2 * (T + 0.5 * T), W = (2 - T) + (1 - T) + BA;
      near(rfJSW(r.flat), W, 1e-12, 'developed width');
      near(Math.abs(K.signedArea(r.flat.loops[0])), W * 10, 1e-9, 'flat = W × 10');
      near(Math.max(r.flat.size[0], r.flat.size[1]), 10, 1e-12, 'flat length');
      nearRel(r.mp.volume, W * 10 * T, 1e-9, 'volume = flat area × T');
      assert(r.flat.bends.length === 1, 'one bend line, got ' + r.flat.bends.length);
      var b = r.flat.bends[0];
      near(b.angle, 90, 1e-9, 'bend angle'); near(b.R, T, 1e-12, 'inside radius'); near(b.ba, BA, 1e-12, 'BA');
      var ax = Math.abs(b.a[0] - b.b[0]) < 1e-9 ? 0 : 1, off = Math.abs(b.a[ax] - r.flat.bbox.min[ax]);
      assert(Math.abs(off - (2 - T + BA / 2)) < 1e-9 || Math.abs(off - (1 - T + BA / 2)) < 1e-9, 'bend line mid-bend: ' + off);
      near(Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]), 10, 1e-12, 'bend line the path length');
      rfJSClosed(r);
      var c = DxfCheck.check(K.exportDXFFlat(r.flat, 'in'), { units: 'in' });
      assert(c.ok && c.loops.length === 1 && c.loops[0].closed, 'DXF: ' + c.errors.join('; '));
      assert((c.counts['LINE@BEND'] || 0) === 1, 'DXF: 1 BEND line ' + JSON.stringify(c.counts));
      // Reverse direction: T on the other side: the corner's outside on the sketch, inside radius still R
      var rv = rfJSB('var path = p.sketch("Top").line(0, 0, 0, -10).id();\nvar prof = p.sketch("Front").polyline([[0, 0], [2, 0], [2, 1]], false).id();\np.sweptFlange(prof, path, { flip: true });\n');
      var Wf = (2 - 2 * T) + (1 - 2 * T) + BA;
      near(rfJSW(rv.flat), Wf, 1e-12, 'flipped: the sketch is the outside');
      nearRel(rv.mp.volume, Wf * 10 * T, 1e-9, 'flipped volume');
      assert(rv.flat.bends[0].up !== b.up, 'flipped: the bend reads the other way');
      return 'W ' + fmt(W) + ', bend ' + (b.up ? 'UP' : 'DOWN');
    });

    test('rfJS: a U channel along a two-line path, a profile arc as its bend radius, Custom Bend Allowance (BA .2): every bend as given, the flat = widths × 12', function () {
      var r = rfJSB('var path = p.sketch("Top").polyline([[0, 0], [0, -5], [0, -12]], false).id();\n' +
        'var prof = p.sketch("Front").line(0, 1, 0, 0.25).arc(0.25, 0.25, 0.25, 180, 270).line(0.25, 0, 1.75, 0).line(1.75, 0, 2, 0).line(2, 0, 2, 1).id();\n' +
        'p.sweptFlange(prof, path, { bendAllowance: { type: "allowance", value: 0.2 }, name: "Channel" });\n');
      assert(r.flat.bends.length === 2, 'two bends, got ' + r.flat.bends.length);
      var arcIn = 0.25;   // T on the right of the chain as drawn: outside the U, so the sketch is the inside face
      var Rs = r.flat.bends.map(function (q) { return q.R; }).sort(function (a, b) { return a - b; });
      near(Rs[1], arcIn, 1e-12, 'profile arc → its inside radius');
      near(Rs[0], T, 1e-12, 'sharp corner → sheet radius');
      var W = (1 - 0.25) + (2 - 0.25 - T) + (1 - T) + 0.4;
      near(rfJSW(r.flat), W, 1e-12, 'developed width with BA .2');
      near(Math.abs(K.signedArea(r.flat.loops[0])), W * 12, 1e-9, 'flat area');
      var sec = (1 - 0.25) * T + (2 - 0.25 - T) * T + (1 - T) * T + Math.PI / 2 * T * (arcIn + T / 2) + Math.PI / 2 * T * (T + T / 2);
      nearRel(r.mp.volume, sec * 12, 1e-9, 'volume = section × 12');
      rfJSClosed(r);
    });

    test('rfJS: quarter-arc path R5, a radial line 5 → 7: a ring sector; flat area = π/4 (7² − 5²) exactly, volume = area × T, DXF arcs (both options)', function () {
      var code = 'var path = p.sketch("Top").arc(0, 0, 5, 0, 90).id();\nvar prof = p.sketch("Front").line(5, 0, 7, 0).id();\n';
      [' ', ', { flatten: "path" }'].forEach(function (o) {
        var r = rfJSB(code + 'p.sweptFlange(prof, path' + o + ');\n'), A = Math.PI / 4 * (49 - 25);
        near(r.flat.sweptFlange.area, A, 1e-12, 'exact sector area' + o);
        nearRel(Math.abs(K.signedArea(r.flat.loops[0])), A, 2e-3, 'chord outline ≈ sector');
        nearRel(r.mp.volume, A * T, 1e-9, 'volume = area × T');
        assert(!r.flat.bends.length, 'no bend lines');
        rfJSClosed(r);
        var c = DxfCheck.check(K.exportDXFFlat(r.flat, 'in', { style: 'entities' }), { units: 'in' });
        assert(c.ok && c.loops.length === 1 && c.loops[0].closed, 'DXF: ' + c.errors.join('; '));
        assert((c.counts['ARC@OUTLINE'] || 0) === 2 && (c.counts['LINE@OUTLINE'] || 0) === 2, 'DXF: two true arcs, two lines ' + JSON.stringify(c.counts));
      });
    });

    test('rfJS: a cylinder (a line square to the path\'s plane) and a cone (inclined) along an arc: Flatten along path develops them on the neutral surface (K .5: area × T = volume exactly); unbending the profile is refused', function () {
      var path = 'var path = p.sketch("Top").arc(0, 0, 5, 0, 90).id();\n';
      var cyl = path + 'var prof = p.sketch("Front").line(5, 0, 5, 2).id();\n';
      assert(/Flatten along path/.test(rfJSFlatErr(cyl + 'p.sweptFlange(prof, path);\n')), 'cylinder: profile option refused');
      var r = rfJSB(cyl + 'p.sweptFlange(prof, path, { flatten: "path" });\n'), L = Math.PI / 2 * (5 + T / 2);
      near(r.flat.sweptFlange.area, 2 * L, 1e-12, 'rolled: 2 × π/2·(R + T/2)');
      near(r.flat.size[0], 2, 1e-12, 'width 2'); near(r.flat.size[1], L, 1e-9, 'length on the neutral radius');
      nearRel(r.mp.volume, 2 * L * T, 1e-9, 'volume');
      rfJSClosed(r);
      var cone = path + 'var prof = p.sketch("Front").line(5, 0, 6, 1).id();\n';
      var rc = rfJSB(cone + 'p.sweptFlange(prof, path, { flatten: "path" });\n');
      nearRel(rc.flat.sweptFlange.area * T, rc.mp.volume, 1e-9, 'cone: area × T = volume');
      nearRel(Math.abs(K.signedArea(rc.flat.loops[0])), rc.flat.sweptFlange.area, 2e-3, 'chord outline ≈ the developed area');
      rfJSClosed(rc);
      var c = DxfCheck.check(K.exportDXFFlat(rc.flat, 'in', { style: 'entities' }), { units: 'in' });
      assert(c.ok && c.loops.length === 1 && (c.counts['ARC@OUTLINE'] || 0) === 2, 'cone DXF: an annulus sector ' + JSON.stringify(c.counts));
    });

    test('rfJS: a line then a tangent arc (a radial line): the strip and the ring develop as one outline, area = rectangle + sector', function () {
      var r = rfJSB('var path = p.sketch("Top").line(5, -4, 5, 0).arc(0, 0, 5, 0, 90).id();\nvar prof = p.sketch("Front", 4).line(5, 0, 7, 0).id();\np.sweptFlange(prof, path, { flatten: "path" });\n');
      var A = 2 * 4 + Math.PI / 4 * 24;
      near(r.flat.sweptFlange.area, A, 1e-12, 'area');
      nearRel(r.mp.volume, A * T, 1e-9, 'volume');
      assert(r.flat.loops.length === 1, 'one outline');
      var c = DxfCheck.check(K.exportDXFFlat(r.flat, 'in'), { units: 'in' });
      assert(c.ok && c.loops.length === 1 && c.loops[0].closed, 'DXF: ' + c.errors.join('; '));
    });

    test('rfJS: path along a model edge (the front top edge of a 6 × 4 Base Flange): the flange adds T × 1 × 6; its flat is refused with a reason', function () {
      var code = 'p.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\nvar prof = p.sketch("Right").line(-4, ' + T + ', -4, ' + (T + 1) + ').id();\np.sweptFlange(prof, [[3, ' + T + ', 4]]);\n';
      var r = rfJSB(code, true);
      nearRel(r.mp.volume, 6 * 4 * T + T * 6, 1e-9, 'plate + flange');
      rfJSClosed(r);
      assert(/Base Flange/.test(rfJSFlatErr(code)), 'flat refused on a Base Flange part');
    });

    test('rfJS: refusals — bends along an arc path, a sharp path corner, a profile not normal to the path, no sheet; script round trip keeps flip / flatten / radius / custom BA / edges', function () {
      var arcp = 'var path = p.sketch("Top").arc(0, 0, 5, 0, 90).id();\n';
      assert(/not developable/.test(rfJSFlatErr(arcp + 'var prof = p.sketch("Front").polyline([[5, 0], [7, 0], [7, 1]], false).id();\np.sweptFlange(prof, path, { flatten: "path" });\n')), 'bends along an arc');
      assert(/tangent/.test(rfJSErr('var path = p.sketch("Top").polyline([[0, 0], [0, -5], [3, -5]], false).id();\nvar prof = p.sketch("Front").line(0, 0, 2, 0).id();\np.sweptFlange(prof, path);\n')), 'sharp corner');
      assert(/normal to the path/.test(rfJSErr('var path = p.sketch("Top").line(0, 0, 0, -5).id();\nvar prof = p.sketch("Right").line(0, 0, 0, 2).id();\np.sweptFlange(prof, path);\n')), 'profile plane');
      var t2 = false; try { build('p.units("in");\nvar a = p.sketch("Top").line(0, 0, 0, -5).id();\nvar b = p.sketch("Front").line(0, 0, 2, 0).id();\np.sweptFlange(b, a);'); } catch (e) { t2 = /sheet/.test(e.message); }
      assert(t2, 'no sheet refused');
      var r = rfJSB('var path = p.sketch("Top").line(0, 0, 0, -10).id();\nvar prof = p.sketch("Front").polyline([[0, 0], [2, 0], [2, 1]], false).id();\n' +
        'p.sweptFlange(prof, path, { flip: true, radius: 0.1, flatten: "path", bendAllowance: { type: "kfactor", value: 0.4 }, name: "Lip" });\n');
      var s = K.generateScript(r.model), r2 = build(s);
      noErrors(r2);
      near(r2.mp.volume, r.mp.volume, 1e-12, 'same volume');
      var f2 = r2.model.features.filter(function (q) { return q.type === 'sweptFlange'; })[0];
      assert(f2.flip && f2.flatten === 'path' && +f2.radius === 0.1 && f2.bendAllowance.type === 'kfactor' && +f2.bendAllowance.value === 0.4 && f2.name === 'Lip', 'fields: ' + JSON.stringify(f2));
      near(rfJSW(K.flatPattern(r2.model, r2.build, r2.mesh)), rfJSW(r.flat), 1e-12, 'same flat');
      var re = rfJSB('p.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\nvar prof = p.sketch("Right").line(-4, ' + T + ', -4, ' + (T + 1) + ').id();\np.sweptFlange(prof, [[3, ' + T + ', 4]]);\n', true);
      var re2 = build(K.generateScript(re.model));
      noErrors(re2);
      near(re2.mp.volume, re.mp.volume, 1e-12, 'edges path round trip');
    });
  })();
