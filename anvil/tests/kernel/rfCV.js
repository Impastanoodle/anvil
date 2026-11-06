  // --- rfCV (2026-10-20, lane CV: Sketch tab gaps) --- Dissolve Sketch Text (Kernel.dissolveText: a Cut text's outline
  // as lines and arcs with exactly the text's own profile, Etch strokes as lines / arcs on the text's layer), Link
  // Values (SketchSolver.linkValues / unlinkValue, d.link shared by Smart Dimensions and distance / angle relations,
  // written by the script and read back), and a line splitting a closed contour gives no "Open contour ignored".
  (function () {
    group('rfCV: Dissolve Sketch Text, Link Values, splitting-line warning');
    var S = typeof SketchSolver !== 'undefined' ? SketchSolver : null;
    function rfCVSketch(code) { var m = K.newModel('t'); K.runScript(m, code); return { model: m, sketch: m.features.filter(function (f) { return f.type === 'sketch'; })[0] }; }
    function rfCVText(str, extra) { return 'p.sketch("Front").text(0, 0, ' + JSON.stringify(str) + ', { h: 1, mode: "outline", strokeWidth: 0.12' + (extra || '') + ' }).end(); p.extrude(0.5);'; }
    function rfCVVol(code, mut) {
      var model = K.newModel('Test');
      K.runScript(model, code);
      if (mut) mut(model);
      var b = K.rebuild(model), ids = Object.keys(b.errors);
      if (ids.length) fail('rebuild errors: ' + JSON.stringify(b.errors));
      return K.massProps(K.meshFromBody(b.body), model.density).volume;
    }
    function rfCVDissolve(m) { var f = m.features[0]; f.entities = K.dissolveText(f.entities[0]); }

    test('rfCV: Dissolve Sketch Text — Cut text "AB" (h 1, stroke .12) becomes lines and arcs whose extrude has the text\'s volume (1e-6), and the same closed loops with the same areas; "O8@" and a Stencil "AB" too', function () {
      ['AB', 'O8@'].forEach(function (str) {
        var code = rfCVText(str), v0 = rfCVVol(code), v1 = rfCVVol(code, rfCVDissolve);
        nearRel(v1, v0, 1e-6, str + ' volume after dissolving');
        var t = rfCVSketch(code).sketch.entities[0], d = K.dissolveText(t);
        assert(d.length > 4 && d.every(function (e) { return e.t === 'line' || e.t === 'arc' || e.t === 'circle'; }), str + ': only lines, arcs and circles, got ' + JSON.stringify(d.map(function (e) { return e.t; })));
        var P0 = K.sketchProfile({ entities: [t] }), P1 = K.sketchProfile({ entities: d });
        assert(P0.loops.length === P1.loops.length, str + ': the same number of loops (' + P0.loops.length + ' / ' + P1.loops.length + ')');
        assert(!P1.warnings.length, str + ': no open contours, got ' + JSON.stringify(P1.warnings));
        var a0 = P0.loops.map(function (l) { return Math.abs(K.signedArea(l.pts)); }).sort(function (x, y) { return x - y; }), a1 = P1.loops.map(function (l) { return Math.abs(K.signedArea(l.pts)); }).sort(function (x, y) { return x - y; });
        a0.forEach(function (a, i) { nearRel(a1[i], a, 2e-2, str + ' loop ' + i + ' area (chords: the arcs are tessellated anew)'); });
      });
      var cs = rfCVText('AB', ', stencil: true');
      nearRel(rfCVVol(cs, rfCVDissolve), rfCVVol(cs), 1e-6, 'stencil AB volume after dissolving');
      return 'AB, O8@ and stencil AB keep their volumes';
    });

    test('rfCV: Dissolve Sketch Text — an Etch text gives its strokes (lines, arcs, circles) on the ETCH layer; a text on layer CUT keeps CUT; a construction text gives construction geometry; an empty text gives nothing', function () {
      var d = K.dissolveText({ t: 'text', x: 0, y: 0, str: 'AO', h: 1 });
      assert(d.length >= 4 && d.every(function (e) { return e.layer === 'ETCH' && /^(line|arc|circle|polyline)$/.test(e.t); }), 'Etch strokes on ETCH: ' + JSON.stringify(d.map(function (e) { return e.t + ':' + e.layer; })));
      assert(d.some(function (e) { return e.t === 'arc' || e.t === 'circle'; }), 'the O stays round (arcs / circle)');
      var c = K.dissolveText({ t: 'text', x: 0, y: 0, str: 'I', h: 1, layer: 'CUT', construction: true });
      assert(c.length && c.every(function (e) { return e.layer === 'CUT' && e.construction; }), 'layer and construction kept: ' + JSON.stringify(c));
      assert(K.dissolveText({ t: 'text', x: 0, y: 0, str: '', h: 1 }).length === 0, 'an empty text: nothing');
      return d.length + ' strokes for "AO"';
    });

    test('rfCV: Link Values — two lines (3 and 5 long) linked as "L": both become 3 (the first\'s value); setting one to 4 sets both; a third, unlinked line stays; unlinkValue frees one; angles cannot share a length', function () {
      var f = rfCVSketch('p.sketch("Front").line(0, 0, 3, 0).line(0, 2, 5, 2).line(0, 4, 7, 4).dim(0, "len").dim(1, "len").dim(2, "len").end();').sketch;
      var r = S.linkValues(f, [{ kind: 'dim', index: 0 }, { kind: 'dim', index: 1 }], 'L');
      assert(r.ok, 'linked: ' + r.error);
      near(K.dimValue(f.entities[1], f.dims[1]), 3, 1e-9, 'second line takes the shared value');
      assert(f.dims[0].link === 'L' && f.dims[1].link === 'L' && f.dims[2].link == null, 'link names stored');
      assert(S.setDim(f, 1, 4).ok, 'edit the second');
      near(K.dimValue(f.entities[0], f.dims[0]), 4, 1e-9, 'first follows'); near(K.dimValue(f.entities[1], f.dims[1]), 4, 1e-9, 'second is 4');
      near(K.dimValue(f.entities[2], f.dims[2]), 7, 1e-9, 'the unlinked line stays 7');
      assert(S.linkedItems(f, 'L').length === 2, 'two items linked');
      assert(S.unlinkValue(f, { kind: 'dim', index: 0 }).ok && f.dims[0].link == null, 'unlinked');
      assert(S.setDim(f, 1, 2.5).ok, 'edit after unlink');
      near(K.dimValue(f.entities[0], f.dims[0]), 4, 1e-9, 'the unlinked one keeps its value');
      var g = rfCVSketch('p.sketch("Front").line(0, 0, 3, 0).line(0, 0, 2, 2).dim(0, "len").rel("angle", ["0", "1"], { value: 45 }).end();').sketch;
      var bad = S.linkValues(g, [{ kind: 'dim', index: 0 }, { kind: 'rel', index: g.rels.length - 1 }], 'X');
      assert(!bad.ok && /angle/.test(bad.error), 'angle with length refused: ' + JSON.stringify(bad));
      assert(g.dims[0].link == null, 'nothing linked after a refusal');
      return 'linked, edited together, unlinked';
    });

    test('rfCV: Link Values — a distance relation and a Smart Dimension share a value; the links are written by generateScript and read back (the model round-trips with the same values and links)', function () {
      var r0 = rfCVSketch('p.sketch("Front").line(0, 0, 3, 0).circle(6, 0, 1).dim(0, "len").rel("distance", ["0.p2", "1.c"], { value: 3, dir: "h" }).end();');
      var f = r0.sketch, ri = f.rels.length - 1;
      assert(S.linkValues(f, [{ kind: 'dim', index: 0 }, { kind: 'rel', index: ri }], 'gap').ok, 'linked');
      assert(S.setRelValue(f, ri, 2).ok, 'set the relation');
      near(K.dimValue(f.entities[0], f.dims[0]), 2, 1e-9, 'the line follows the relation');
      near(f.rels[ri].v, 2, 1e-12, 'relation value');
      var code = K.generateScript(r0.model);
      assert(/"link":"gap"/.test(code.replace(/\s/g, '')), 'the script writes the link: ' + code);
      var back = rfCVSketch(code).sketch;
      assert(back.dims[0].link === 'gap' && back.rels.filter(function (x) { return x.link === 'gap'; }).length === 1, 'links read back');
      assert(S.setDim(back, 0, 1.5).ok, 'edit after the round trip');
      near(back.rels.filter(function (x) { return x.link === 'gap'; })[0].v, 1.5, 1e-12, 'still linked after the round trip');
      return 'script: ' + (code.match(/link/g) || []).length + ' links';
    });

    test('rfCV: Link Values — a rectangle\'s width and height linked make it square, and editing the height keeps it square; a driven dimension cannot be linked; Show Minimum Radius survives the script round trip', function () {
      var f = rfCVSketch('p.sketch("Front").rect(0, 0, 4, 2).dim(0, "w").dim(0, "h", { i: 1 }).end();').sketch;
      assert(S.linkValues(f, [{ kind: 'dim', index: 0 }, { kind: 'dim', index: 1 }], 'side').ok, 'linked');
      near(f.entities[0].w, 4, 1e-9, 'width'); near(f.entities[0].h, 4, 1e-9, 'height takes the width');
      assert(S.setDim(f, 1, 2.5).ok, 'edit the height');
      near(f.entities[0].w, 2.5, 1e-9, 'width follows'); near(f.entities[0].h, 2.5, 1e-9, 'height');
      var g = rfCVSketch('p.sketch("Front").line(0, 0, 3, 0).line(0, 1, 5, 1).dim(0, "len").dim(1, "len").driven([1]).end();').sketch;
      var r = S.linkValues(g, [{ kind: 'dim', index: 0 }, { kind: 'dim', index: 1 }], 'Q');
      assert(!r.ok && /driven/i.test(r.error) && g.dims[0].link == null, 'driven refused: ' + JSON.stringify(r));
      var m = rfCVSketch('p.sketch("Front").spline([[0, 0], [2, 3], [4, 0]]).showMinRadius([0]).end();').model;
      var code = K.generateScript(m);
      assert(/\.showMinRadius\(\[0\]\)/.test(code), 'the script writes showMinRadius: ' + code);
      assert(rfCVSketch(code).sketch.entities[0].showMinRadius === true, 'read back');
      return 'square kept, driven refused, showMinRadius round-trips';
    });

    test('rfCV: a line across a rectangle (both ends on it) gives no "Open contour ignored"; a dangling line (one end inside) still does; a lone open line does', function () {
      var w1 = K.sketchProfile(rfCVSketch('p.sketch("Front").rect(0, -2, 4, 2).line(1, -2, 1, 0).end()').sketch).warnings;
      assert(!w1.some(function (w) { return /Open contour/.test(w); }), 'splitting line: no warning, got ' + JSON.stringify(w1));
      var w1b = K.sketchProfile(rfCVSketch('p.sketch("Front").line(0, -2, 4, -2).line(4, -2, 4, 0).line(4, 0, 0, 0).line(0, 0, 0, -2).line(2, -2, 2, 0).end()').sketch).warnings;
      assert(!w1b.some(function (w) { return /Open contour/.test(w); }), 'splitting line in a 4-line outline: no warning, got ' + JSON.stringify(w1b));
      var w2 = K.sketchProfile(rfCVSketch('p.sketch("Front").rect(0, -2, 4, 2).line(1, -2, 1, -1).end()').sketch).warnings;
      assert(w2.some(function (w) { return /Open contour/.test(w); }), 'dangling line warns');
      var w3 = K.sketchProfile(rfCVSketch('p.sketch("Front").circle(0, 0, 1).line(3, 0, 5, 1).end()').sketch).warnings;
      assert(w3.some(function (w) { return /Open contour/.test(w); }), 'lone line warns');
      return 'splitter quiet, dangling / lone lines warn';
    });

    // lane CV2: Stencil Cut text kept 0.3 % of a 1-high "B" (the 0.8 mm default bridge was wider than its counters and
    // swallowed the letter); and plain Cut text came out short where strokes run on into each other (round caps at the
    // tangent joints left slivers no true arc carries: "O" 0.46 % under its area).
    test('rfCV: Cut text "O" (h 1, stroke .12) extrudes to its analytic area π(R² − r²) + 2·L·w; Stencil with a 0.2 bridge takes away exactly the two ring bands it crosses (analytic, 1e-6); "B" with a 0.1 bridge exactly its three bars × 0.12 × 0.1', function () {
      var R = 1 / 3 + 0.06, r = 1 / 3 - 0.06, ring = Math.PI * (R * R - r * r) + 2 * (1 / 3) * 0.12;
      function F(x, a) { return (x * Math.sqrt(a * a - x * x) + a * a * Math.asin(x / a)) / 2; }   // ∫ √(a² − x²) dx
      var band = 2 * ((F(0.1, R) - F(-0.1, R)) - (F(0.1, r) - F(-0.1, r)));   // the bridge x ∈ centre ± 0.1 across top and bottom
      var plainO = rfCVVol(rfCVText('O').replace('0.5)', '1)'));
      nearRel(plainO, ring, 1e-9, 'plain O');
      nearRel(rfCVVol(rfCVText('O', ', stencil: true, bridge: 0.2').replace('0.5)', '1)')), ring - band, 1e-6, 'stencil O, bridge 0.2');
      var plainB = rfCVVol(rfCVText('B').replace('0.5)', '1)'));
      nearRel(plainB - rfCVVol(rfCVText('B', ', stencil: true, bridge: 0.1').replace('0.5)', '1)')), 3 * 0.12 * 0.1, 1e-9, 'stencil B bridges, 0.1');
      return 'O ' + plainO.toFixed(6) + ', band ' + band.toFixed(6);
    });

    test('rfCV: Stencil "B" 1 high with the script\'s default bridge (1.5 mm since rfJW, was 0.8: wider than its counters): each bridge is cut down to half its counter\'s width, the letter keeps most of its area and stays two pieces joined only through the bridges\' gaps', function () {
      var m = rfCVSketch(rfCVText('B', ', stencil: true')).model, e = m.features[0].entities[0];
      assert(e.bridge === 1.5, 'the script default is 1.5: ' + e.bridge);
      var br = K.textOutline(e).bridges;
      assert(br.length === 2, 'two bridges (two counters): ' + br.length);
      br.forEach(function (b, i) {
        var xs = b.map(function (p) { return p[0]; }), w = Math.max.apply(null, xs) - Math.min.apply(null, xs);
        assert(w < 1.5 && w <= 0.5 * 0.61 + 1e-9, 'bridge ' + i + ' cut down to at most half the counter (about .55 wide): ' + w);
      });
      var plain = rfCVVol(rfCVText('B')), st = rfCVVol(rfCVText('B', ', stencil: true'));
      assert(st > 0.7 * plain && st < plain, 'most of the letter is kept: ' + st + ' of ' + plain);
      return 'stencil ' + (st / plain * 100).toFixed(1) + ' % of the plain B';
    });
  })();
