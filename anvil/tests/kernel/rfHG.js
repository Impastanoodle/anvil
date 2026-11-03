  // --- rfHG (2026-11-03, lane outlines): the default Image Quality, pinned. segsForRadius = the chord tolerance
  // (0.05 mm / 0.002 in) with the 12° angle limit, in multiples of 8, 16..128. Measured: at Zoom to Fit every hole,
  // bend and big cylinder already reads round (sagitta under 0.1 px); a size-relative cap of 24 chords on small holes
  // (1000-hole panel 32 -> 24) was tried and dropped: zoomed in to 300 px across, a 24-gon shows its corners at the
  // edge line's inside, a 32-gon does not. Zoomed-in roundness is the display's job (ui-core.js: the edge line covers
  // the sliver between arc and chord, curveChordFeet). Exact records are untouched by the tessellation: volumes and
  // flat-pattern DXF circles are the same at any Image Quality. ---
  (function () {
    group('rfHG: default Image Quality facet counts; exact volumes and flat patterns at any Image Quality');
    function rfHGBuild(code, tess) {
      var model = K.newModel('rfHG');
      K.runScript(model, code);
      if (tess) model.tessellation = tess;
      var b = K.rebuild(model), mesh = K.meshFromBody(b.body);
      return { model: model, build: b, mesh: mesh, mp: K.massProps(mesh, 1), errors: b.errors };
    }
    // chords of each true circle of radius r on the mesh (Kernel.curveEdges)
    function rfHGChords(mesh, r) {
      return K.curveEdges(mesh).filter(function (c) { return Math.abs(c.radius - r) < 1e-6 * Math.max(1, r); }).map(function (c) { return c.chords.length; });
    }
    function rfHGWith(o, fn) { var saved = K.setTessellation({}); try { K.setTessellation(o); return fn(); } finally { K.setTessellation(saved); } }

    test('rfHG: facet counts follow the rule — Ø20 circle 32, Ø3 hole 32, Ø500 cylinder 128 (mm); Ø.125, Ø1 holes 32, 40 and a Ø20 in cylinder 128 (in, 0.002)', function () {
      var mm = rfHGWith('default', function () { return [K.segsForRadius(10), K.segsForRadius(1.5), K.segsForRadius(250)]; });
      var inch = rfHGWith({ chordTol: 0.002 }, function () { return [K.segsForRadius(0.0625), K.segsForRadius(0.5), K.segsForRadius(10)]; });
      assert(mm.join() === '32,32,128', 'mm ' + mm);
      assert(inch.join() === '32,40,128', 'in ' + inch);
      var r = rfHGBuild('p.units("mm"); p.box(100, 60, 8); p.hole("Top", 30, -30, 3, { offset: 8 }); p.sketch("Top", 8).circle(70, -30, 10).extrude(5);');
      noErrors(r);
      var h = rfHGChords(r.mesh, 1.5), b = rfHGChords(r.mesh, 10);
      assert(h.length === 2 && h.every(function (n) { return n === 32; }) && b.length >= 1 && b.every(function (n) { return n === 32; }), 'Ø3 rims ' + h + ', Ø20 rims ' + b);
      return 'mm ' + mm + ', in ' + inch;
    });

    test('rfHG: a 200-hole Ø8 panel (600 × 300 × 1.5) stays at 32 chords per rim and within the measured triangle budget (28 350); exact volume', function () {
      var r = rfHGBuild('p.units("mm"); p.box(600, 300, 1.5); p.hole("Top", 30, -30, 8, { offset: 1.5 }); p.linearPattern({ dir: "x", spacing: 28, count: 20, dir2: "z", spacing2: 22, count2: 10 });');
      noErrors(r);
      var c = rfHGChords(r.mesh, 4);
      var hist = {}; c.forEach(function (n) { hist[n] = (hist[n] || 0) + 1; });
      assert(c.length === 400 && c.every(function (n) { return n >= 32 && n <= 40; }), 'rims ' + c.length + ' ' + JSON.stringify(hist));   // 32, a few chords split at T-junctions
      assert(r.mesh.triCount <= 28350, 'triangles ' + r.mesh.triCount);
      nearRel(r.mp.volume, 600 * 300 * 1.5 - 200 * Math.PI * 16 * 1.5, 1e-9, 'exact volume');
      return r.mesh.triCount + ' triangles';
    });

    test('rfHG: a bent sheet part with Ø.25 holes (in) — exact volume and flat pattern DXF (true circles, same bounds) at the default and at Coarse Image Quality', function () {
      var code = 'p.units("in"); p.sheet(0.0598, 0.03, 0.71); p.sketch("Top").rect(0, -24, 48, 24).end().baseFlange(0.0598); p.flange(2, [[0, 0.0598, 12]]); p.hole("Top", 6, -6, 0.25, { offset: 0.0598 }); p.hole("Top", 30, -18, 0.25, { offset: 0.0598 });';
      var a = rfHGBuild(code), b = rfHGBuild(code, { chordTol: 0.004 });
      noErrors(a); noErrors(b);
      nearRel(a.mp.volume, b.mp.volume, 1e-9, 'exact volume');
      var dA = K.exportDXFFlat(K.flatPattern(a.model, a.build, a.mesh), 'in'), dB = K.exportDXFFlat(K.flatPattern(b.model, b.build, b.mesh), 'in');
      function circles(d) { var L = d.split(/\r?\n/), out = []; for (var i = 0; i < L.length; i++) if (L[i].trim() === 'CIRCLE') { for (var j = i + 1; j < L.length - 1; j++) if (L[j].trim() === '40') { out.push(+L[j + 1]); break; } } return out; }
      function bounds(d) { var L = d.split(/\r?\n/), xs = [], ys = []; for (var i = 0; i + 1 < L.length; i++) { var k = L[i].trim(); if (k === '10') xs.push(+L[i + 1]); else if (k === '20') ys.push(+L[i + 1]); } return [Math.min.apply(null, xs), Math.max.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, ys)]; }
      var ci = circles(dA);
      assert(ci.length === 2 && ci.every(function (r) { return Math.abs(r - 0.125) < 1e-9; }), 'DXF circles ' + ci);
      assert(JSON.stringify(circles(dB)) === JSON.stringify(ci), 'same circles at Coarse: ' + circles(dB));
      var bA = bounds(dA), bB = bounds(dB);
      bA.forEach(function (v, i) { near(v, bB[i], 1e-9, 'flat bound ' + i); });
      return 'flat ' + (bA[1] - bA[0]).toFixed(4) + ' × ' + (bA[3] - bA[2]).toFixed(4) + ' in, circles ' + ci.join(', ');
    });

    test('rfHG: a document\'s saved Image Quality wins — chordTol 0.5 / maxAngle 0 makes a Ø20 circle 16-sided, chordTol 0.01 finer than the default; the global setting comes back', function () {
      var code = 'p.units("mm"); p.sketch("Top").circle(0, 0, 10).extrude(5);';
      var r = rfHGBuild(code, { chordTol: 0.5, maxAngle: 0 });
      noErrors(r);
      var c = rfHGChords(r.mesh, 10);
      assert(c.length === 2 && c[0] === 16 && c[1] === 16, 'Ø20 rims ' + c);
      var f = rfHGBuild(code, { chordTol: 0.01 }), cf = rfHGChords(f.mesh, 10);
      assert(cf[0] === rfHGWith({ chordTol: 0.01 }, function () { return K.segsForRadius(10); }) && cf[0] > 32, 'chordTol 0.01: ' + cf);
      assert(K.segsForRadius(10) === 32, 'the global setting came back: ' + K.segsForRadius(10));
    });
  })();
