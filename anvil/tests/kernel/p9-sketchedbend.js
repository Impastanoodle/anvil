  // --- p9-sketchedbend: Sketched Bend (SolidWorks): the sheet bent along sketch lines drawn on a flat face; the flat
  // stays the plate (each bend rolls up BA of it), so a 6 × 4 plate always unfolds back to 6 × 4 ---
  (function () {
    group('p9-sketchedbend: Sketched Bend along sketch lines, bend positions, nested lines, flat pattern back to the plate');
    var T = 0.0598, R = 0.0598, A90 = Math.PI / 2;   // 16 ga, K = 0.5
    var PLATE = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n';
    var BA = K.bendAllowance(A90, R, T, 0.5);
    // the bend's faceted section (flangeProfile: 8 segments per 90°), as the CSG kernel builds it
    function bendArea(A) { var n = Math.max(4, Math.round(8 * A / A90)); return n / 2 * Math.sin(A / n) * ((R + T) * (R + T) - R * R); }
    function flatOf(code) { var r = build(code); noErrors(r); return { r: r, flat: K.flatPattern(r.model, r.build, r.mesh) }; }
    function bendAt(x, opts) { return PLATE + 'p.sketch("Top", ' + T + ').line(' + x + ', 0, ' + x + ', -4).sketchedBend(' + (opts || '90, { fixed: [1, 0, 2] }') + ');'; }
    test('p9-sketchedbend: 6 × 4 × 16 ga plate, line across the middle, 90° up — volume, envelope and flat for each bend position', function () {
      var shifts = { centerline: BA / 2, bendOutside: 0, outside: R, inside: R + T };
      Object.keys(shifts).forEach(function (pos) {
        var c = 3 - shifts[pos];   // where the bend starts (the fixed side's flat ends)
        var a = flatOf(bendAt(3, '90, { fixed: [1, 0, 2]' + (pos === 'centerline' ? '' : ', position: "' + pos + '"') + ' }'));
        near(polyVol(a.r.mp), T * (24 - 4 * BA) + 4 * bendArea(A90), 1e-9, pos + ': faceted volume = plate − BA strip + bend');
        near(a.r.mp.volume, T * 24, 1e-9, pos + ': exact volume (cylinder records, lane FX) = the plate (K 0.5)');
        nearVec(a.r.mp.bbox.min, [0, 0, 0], 1e-9, pos + ': min');
        nearVec(a.r.mp.bbox.max, [c + R + T, T + R + (6 - c - BA), 4], 1e-9, pos + ': max (wall outside at c + R + T, top at T + R + the moving flat)');
        near(a.flat.size[0], 6, 1e-9, pos + ': flat length'); near(a.flat.size[1], 4, 1e-9, pos + ': flat width');
        assert(a.flat.loops.length === 1 && a.flat.loops[0].length === 4, pos + ': a plain rectangle blank');
        assert(a.flat.bends.length === 1, pos + ': one bend');
        var b = a.flat.bends[0];
        near(b.a[0], c + BA / 2, 1e-9, pos + ': bend line at the centre of the bend allowance'); near(b.b[0], c + BA / 2, 1e-9, pos + ': bend line square');
        near(Math.abs(b.a[1] - b.b[1]), 4, 1e-9, pos + ': bend line across the plate');
        near(b.ba, BA, 1e-12, 'BA'); near(b.bd, K.bendDeduction(A90, R, T, BA), 1e-12, 'BD');
        assert(b.up && b.label === K.bendNoteText(b, 'in') && b.method === 'kfactor', JSON.stringify(b));
      });
      near(BA, 0.1409004305, 1e-9, 'BA = π/2 · (R + T/2)');
      return 'BA ' + BA.toFixed(5) + ', centerline envelope ' + fmt(3 - BA / 2 + R + T) + ' × ' + fmt(T + R + 3 - BA / 2);
    });
    test('p9-sketchedbend: a 45° bend and a line that stops short of the edges (the bend runs across the whole face)', function () {
      var A = Math.PI / 4, BA45 = K.bendAllowance(A, R, T, 0.5), c = 3 - BA45 / 2, Lm = 6 - c - BA45;
      var a = flatOf(PLATE + 'p.sketch("Top", ' + T + ').line(3, -1, 3, -3).sketchedBend(45, { fixed: [1, 0, 2] });');
      near(polyVol(a.r.mp), T * (24 - 4 * BA45) + 4 * bendArea(A), 1e-9, 'faceted volume');
      near(a.r.mp.volume, T * 24, 1e-9, 'exact volume = the plate (lane FX)');
      near(a.r.mp.bbox.max[0], c + (R + T) * Math.sin(A) + Lm * Math.cos(A), 1e-9, 'far end of the outside face');
      near(a.r.mp.bbox.max[1], T + R - R * Math.cos(A) + Lm * Math.sin(A), 1e-9, 'far end of the inside face');
      near(a.r.mp.bbox.max[2], 4, 1e-9, 'bend across the full width');
      near(a.flat.size[0], 6, 1e-9, 'flat length'); near(a.flat.size[1], 4, 1e-9, 'flat width');
      var b = a.flat.bends[0];
      near(b.a[0], 3, 1e-9, 'bend line on the sketch line'); near(Math.abs(b.a[1] - b.b[1]), 4, 1e-9, 'bend line extended to the edges');
      assert(b.label === K.bendNoteText(b, 'in') && /^UP 45° R/.test(b.label), b.label); near(b.ba, BA45, 1e-12, 'BA 45°'); near(b.bd, K.bendDeduction(A, R, T, BA45), 1e-12, 'BD 45° (OSSB = (R + T)·tan 22.5°)');
      var full = build(bendAt(3, '45, { fixed: [1, 0, 2] }'));
      near(full.mp.volume, a.r.mp.volume, 1e-12, 'same part as a full-width line');
      return 'BA ' + BA45.toFixed(5) + ', BD ' + b.bd.toFixed(5);
    });
    test('p9-sketchedbend: two lines in one feature make a channel (default fixed side: the largest piece); reverse folds down; holes keep their flat position', function () {
      var u = flatOf(PLATE + 'p.sketch("Top", ' + T + ').line(1.5, 0, 1.5, -4).line(4.5, -1, 4.5, -3).sketchedBend(90);');
      nearVec(u.r.mp.bbox.min, [1.5 + BA / 2 - R - T, 0, 0], 1e-9, 'channel min (left wall outside)'); nearVec(u.r.mp.bbox.max, [4.5 - BA / 2 + R + T, T + R + 1.5 - BA / 2, 4], 1e-9, 'channel max');
      near(u.flat.size[0], 6, 1e-9, 'channel flat length'); near(u.flat.size[1], 4, 1e-9, 'channel flat width');
      var xs = u.flat.bends.map(function (b) { return b.a[0]; }).sort(function (a, b) { return a - b; });
      assert(xs.length === 2 && u.flat.bends.every(function (b) { return b.up; }), 'two UP bends');
      near(xs[0], 1.5, 1e-9, 'first bend line'); near(xs[1], 4.5, 1e-9, 'second bend line');
      var holes = PLATE + 'p.sketch("Top").circle(4.5, -1, 0.25).circle(1, -3, 0.2).end().cut("through");\n';
      [['90, { fixed: [1, 0, 2] }', 'UP 90°'], ['60, { fixed: [1, 0, 2], reverse: true }', 'DOWN 60°'], ['90, { fixed: [5, 0, 0.5], reverse: true }', 'DOWN 90°']].forEach(function (c) {
        var h = flatOf(holes + 'p.sketch("Top", ' + T + ').line(3, 0, 3, -4).sketchedBend(' + c[0] + ');');
        near(h.flat.size[0], 6, 1e-9, c[1] + ' flat length'); near(h.flat.size[1], 4, 1e-9, c[1] + ' flat width');
        assert(h.flat.bends.length === 1 && h.flat.bends[0].label.indexOf(c[1]) === 0, c[1] + ': ' + h.flat.bends[0].label);
        assert(h.flat.loops.length === 3, c[1] + ': outline + 2 holes');
        var cs = h.flat.loops.slice(1).map(function (l) { return l.reduce(function (s, p) { return [s[0] + p[0] / l.length, s[1] + p[1] / l.length]; }, [0, 0]); }).sort(function (a, b) { return a[0] - b[0]; });
        near(cs[0][0], 1, 1e-6, c[1] + ': fixed-side hole x'); near(cs[0][1], -3, 1e-6, c[1] + ': fixed-side hole y');
        near(cs[1][0], 4.5, 1e-6, c[1] + ': bent-side hole x'); near(cs[1][1], -1, 1e-6, c[1] + ': bent-side hole y');
      });
      var dn = build(PLATE + 'p.sketch("Top", ' + T + ').line(3, 0, 3, -4).sketchedBend(90, { fixed: [5, 0, 2], reverse: true });');
      noErrors(dn);
      nearVec(dn.mp.bbox.min, [3 + BA / 2 - R - T, -(R + 3 - BA / 2), 0], 1e-9, 'reversed, right side fixed: the left side hangs down');
    });
    test('p9-sketchedbend: earlier flanges ride along with the bent side; a second sketched bend on the bent wall; a Z with a small fixed side', function () {
      var f = flatOf(PLATE + 'p.flange(1, [[6, ' + T + ', 2]]);\np.sketch("Top", ' + T + ').line(3, 0, 3, -4).sketchedBend(90, { fixed: [1, 0, 2] });');
      near(f.flat.size[0], 6 + BA + 1, 1e-9, 'plate + edge flange (bend outside, 1 long)'); near(f.flat.size[1], 4, 1e-9, 'width');
      assert(f.flat.bends.length === 2 && f.flat.bends.every(function (b) { return b.up; }), f.flat.bends.map(function (b) { return b.label; }).join(', '));
      // the wall's inside face after a centerline bend at x = 2 lies at X = 2 − BA/2 + R; a line on it at Y = 2
      var X = 2 - BA / 2 + R;
      [[false, 'DOWN'], [true, 'UP']].forEach(function (c) {
        var w = flatOf(PLATE + 'p.sketch("Top", ' + T + ').line(2, 0, 2, -4).sketchedBend(90, { fixed: [1, 0, 2] });\np.sketch("Right", ' + X + ').line(0, 2, -4, 2).sketchedBend(90, { fixed: [1, 0, 2]' + (c[0] ? ', reverse: true' : '') + ' });');
        near(w.flat.size[0], 6, 1e-9, 'two features: flat length'); near(w.flat.size[1], 4, 1e-9, 'two features: flat width');
        var bs = w.flat.bends.slice().sort(function (a, b) { return a.a[0] - b.a[0]; });
        near(bs[0].a[0], 2, 1e-9, 'first bend line'); near(bs[1].a[0], 2 + BA / 2 + (2 - T - R), 1e-9, 'second bend line: BA/2 + the wall up to Y = 2');
        assert(bs[0].up && bs[1].label.indexOf(c[1]) === 0, 'second bend ' + c[1] + ': ' + bs[1].label);
      });
      var z = flatOf(PLATE + 'p.sketch("Top", ' + T + ').line(1, 0, 1, -4).line(2, 0, 2, -4).sketchedBend(90, { fixed: [0.5, 0, 2] });');
      near(z.flat.size[0], 6, 1e-9, 'small fixed side: flat length (the unfold starts from the fixed side, not the larger far flat)');
      assert(z.flat.bends.length === 2, 'two bends');
    });
    test('p9-sketchedbend: errors — crossing lines, overlapping bends, a sketch off the sheet, a sketch with a circle', function () {
      function err(code) { var r = build(code), ids = Object.keys(r.errors); return ids.length ? r.errors[ids[ids.length - 1]] : ''; }
      assert(/cross on the sheet/.test(err(PLATE + 'p.sketch("Top", ' + T + ').line(3, 0, 3, -4).line(0, -2, 6, -2).sketchedBend(90);')), 'crossing');
      assert(/too close/.test(err(PLATE + 'p.sketch("Top", ' + T + ').line(3, 0, 3, -4).line(3.1, 0, 3.1, -4).sketchedBend(90, { fixed: [1, 0, 1] });')), 'too close');
      assert(/does not lie on a flat face/.test(err(PLATE + 'p.sketch("Top", 1).line(3, 0, 3, -4).sketchedBend(90);')), 'off the sheet');
      assert(/only straight lines/.test(err(PLATE + 'p.sketch("Top", ' + T + ').line(3, 0, 3, -4).circle(1, -1, 0.2).sketchedBend(90);')), 'circle');
      var r = build(PLATE + 'p.sketch("Top", ' + T + ').line(3, 0, 3, -4).sketchedBend(90, { fixed: [1, 0, 2] });');
      assert(!r.warnings[r.model.features[r.model.features.length - 2].id], 'no open-contour warning on the bend sketch: ' + JSON.stringify(r.warnings));
    });
    test('p9-sketchedbend: script round trip (position, reverse, radius, fixed, custom bend allowance) and a K-factor change rebuilds the bend', function () {
      var code = PLATE + 'p.sketch("Top", ' + T + ').line(3, 0, 3, -4).sketchedBend(60, { fixed: [1, 0, 2], position: "inside", reverse: true, radius: 0.1, bendAllowance: { type: "deduction", value: 0.1 } });';
      var r = build(code);
      noErrors(r);
      var f = r.model.features[r.model.features.length - 1];
      assert(f.type === 'sketchedBend' && f.name === 'SketchBend1' && f.angle === 60 && f.position === 'inside' && f.reverse && f.radius === 0.1 && f.bendAllowance.type === 'deduction', JSON.stringify(f));
      var script = K.generateScript(r.model);
      assert(/p\.sketchedBend\(60, \{ sketch: f\d+, name: "SketchBend1", fixed: \[1,0,2\], position: "inside", reverse: true, radius: 0\.1, bendAllowance: \{"type":"deduction","value":0\.1\} \}\)/.test(script), 'emitted: ' + script.split('\n').pop());
      var r2 = build(script);
      noErrors(r2);
      near(r2.mp.volume, r.mp.volume, 1e-12, 'round trip volume');
      assert(K.generateScript(r2.model) === script, 'generator is a fixed point');
      var fl = K.flatPattern(r.model, r.build, r.mesh);
      near(fl.size[0], 6, 1e-9, 'custom BD: the flat is still the plate'); near(fl.bends[0].bd, 0.1, 1e-12, 'custom BD on the bend');
      // the bend allowance sets how much flat the bend rolls up: a new K must rebuild the bend, not reuse the cache
      var m = K.newModel('K'); K.runScript(m, bendAt(3));
      var b1 = K.rebuild(m), top1 = K.massProps(K.meshFromBody(b1.body), 1).bbox.max[1];
      m.sheet.kFactor = 0.3;
      var b2 = K.rebuild(m, b1.cache), top2 = K.massProps(K.meshFromBody(b2.body), 1).bbox.max[1], BA3 = K.bendAllowance(A90, R, T, 0.3);
      near(top1, T + R + 3 - BA / 2, 1e-9, 'K 0.5 wall height'); near(top2, T + R + 3 - BA3 / 2, 1e-9, 'K 0.3 wall height (cache not reused)');
      near(K.flatPattern(m, b2, K.meshFromBody(b2.body)).size[0], 6, 1e-9, 'K 0.3 flat is still the plate');
      return script.split('\n').pop();
    });
  })();
  // --- end p9-sketchedbend ---

