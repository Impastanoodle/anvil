  // --- sketch-text2 (feature completion): Stencil Cut text, text along splines / ellipses, etch marks carried through a
  // later Sketched Bend and drawn on flat-pattern views, sketch location dimensions as model items, DXF TEXT / MTEXT ---
  (function () {
    group('sketch-text2: stencil text, text along splines / ellipses, etch through a Sketched Bend and on flat drawings, location dimensions as model items, DXF text');
    var SF = typeof SketchFont !== 'undefined' ? SketchFont : null, S = typeof SketchSolver !== 'undefined' ? SketchSolver : null, DW = typeof Drawing !== 'undefined' ? Drawing : null;
    var BASE = 'p.sketch("Front").rect(0, 0, 40, 20).extrude(2);\np.sketch("Front", 2)';
    // the area the strip |x − c| ≤ b through the centre takes out of the annulus R0 < r < R1 on one side of the centre
    function strip(R0, R1, b) { function F(R) { return b * Math.sqrt(R * R - b * b) + R * R * Math.asin(b / R); } return F(R1) - F(R0); }
    function islands(e) { return K.textOutline(e).loops.filter(function (l) { return K.signedArea(l.pts) < 0; }).length; }
    function bad(e) { return K.sketchProfile({ entities: [e] }).loops.filter(function (l) { return l.cross || l.hole; }).length; }
    // a stroke as a sortable key (as the sketch-text tests do), for comparing two sets of strokes
    function sKey(s) {
      function q(x) { return (Math.round(x * 1e5) / 1e5).toFixed(5); }
      function pk(p) { return q(p[0]) + ',' + q(p[1]); }
      if (s.t === 'line') return 'L' + [pk([s.x1, s.y1]), pk([s.x2, s.y2])].sort().join('|');
      if (s.t === 'poly') return 'P' + s.pts.map(pk).sort().join('|');
      var D = Math.PI / 180, full = s.a1 - s.a0 >= 360 - 1e-9;
      return 'A' + pk([s.cx, s.cy]) + 'r' + q(s.r) + (full ? 'full' : [pk([s.cx + s.r * Math.cos(s.a0 * D), s.cy + s.r * Math.sin(s.a0 * D)]), pk([s.cx + s.r * Math.cos(s.a1 * D), s.cy + s.r * Math.sin(s.a1 * D)])].sort().join('|'));
    }
    function sSet(list) { return list.map(sKey).sort().join('\n'); }
    function reflect(s, ax) {
      function m(x, y) { var t = (x - ax.p[0]) * ax.d[0] + (y - ax.p[1]) * ax.d[1]; return [2 * (ax.p[0] + ax.d[0] * t) - x, 2 * (ax.p[1] + ax.d[1] * t) - y]; }
      if (s.t === 'line') { var a = m(s.x1, s.y1), b = m(s.x2, s.y2); return { t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }; }
      if (s.t === 'poly') return { t: 'poly', pts: s.pts.map(function (p) { return m(p[0], p[1]); }) };
      var c = m(s.cx, s.cy), phi = Math.atan2(ax.d[1], ax.d[0]) * 180 / Math.PI;
      return { t: 'arc', cx: c[0], cy: c[1], r: s.r, a0: 2 * phi - s.a1, a1: 2 * phi - s.a0 };
    }
    // the value of the ellipse's implicit equation at p (0 on it)
    function onEllipse(e, p) {
      var r = (+e.rot || 0) * Math.PI / 180, x = p[0] - e.cx, y = p[1] - e.cy, u = Math.cos(r) * x + Math.sin(r) * y, v = -Math.sin(r) * x + Math.cos(r) * y;
      return u * u / (e.rx * e.rx) + v * v / (e.ry * e.ry) - 1;
    }

    test('sketch-text2: Stencil — "O" (h 10, stroke 0.5, bridge 0.8) cut through a 40 × 20 × 2 plate removes exactly its stadium ring π(R1² − R0²) + 8s(R1 − R0) less the bridge across each round end (×2 thick); "o" its ring less two; the plain "O" exactly its ring (the union\'s round ends lie on the true circles)', function () {
      var h = 10, w = 0.5, s = h / 12, R1 = 4 * s + w / 2, R0 = 4 * s - w / 2;
      var ring = Math.PI * (R1 * R1 - R0 * R0) + 8 * s * (R1 - R0), cut = strip(R0, R1, 0.4);
      var plain = build(BASE + '.text(10, 5, "O", { h: 10, mode: "outline", strokeWidth: 0.5 }).cut("through", { reverse: true });');
      noErrors(plain);
      nearRel(1600 - plain.mp.volume, 2 * ring, 1e-9, 'plain O');
      var st = build(BASE + '.text(10, 5, "O", { h: 10, mode: "outline", strokeWidth: 0.5, stencil: true, bridge: 0.8 }).cut("through", { reverse: true });');
      noErrors(st);
      nearRel(1600 - st.mp.volume, 2 * (ring - 2 * cut), 1e-9, 'stencil O');
      var o = build(BASE + '.text(10, 5, "o", { h: 10, mode: "outline", strokeWidth: 0.5, stencil: true, bridge: 0.8 }).cut("through", { reverse: true });');
      noErrors(o);
      nearRel(1600 - o.mp.volume, 2 * (Math.PI * (R1 * R1 - R0 * R0) - 2 * cut), 1e-9, 'stencil o');
      var e = st.model.features[2].entities[0], prof = K.sketchProfile(st.model.features[2]), br = K.textOutline(e).bridges;
      assert(prof.loops.length === 2 && !prof.loops.some(function (l) { return l.hole || l.cross; }), 'the O in two halves, no island: ' + prof.loops.length);
      assert(br.length === 1 && Math.abs(Math.hypot(br[0][1][0] - br[0][0][0], br[0][1][1] - br[0][0][1]) - 0.8) < 1e-12, 'one bridge 0.8 wide through the island: ' + JSON.stringify(br));
      return 'O ' + fmt(1600 - st.mp.volume) + ' (plain ' + fmt(1600 - plain.mp.volume) + ')';
    });
    test('sketch-text2: Stencil leaves no island in O A B D P Q R 0 4 6 8 9 & @ a b d e g o p q (and # % ° Ø) at 10 mm / 0.5, 3 mm / 0.36, 1/4 in / .03 and 1/8 in / .015 strokes (bridges 0.8 mm / .03 in): no hole, no self-crossing, one bridge per island of the plain outline; nor in a turned, mirrored two-line text or text on an arc', function () {
      var n = 0;
      [[10, 0.5, 0.8], [3, 0.36, 0.8], [0.25, 0.03, 0.03], [0.125, 0.015, 0.03]].forEach(function (c) {
        Array.prototype.forEach.call('OABDPQR0468&@abdegopq9#%°Ø', function (ch) {
          var plain = { t: 'text', x: 1, y: 2, str: ch, h: c[0], mode: 'outline', strokeWidth: c[1] }, e = JSON.parse(JSON.stringify(plain));
          e.stencil = true; e.bridge = c[2];
          var isl = islands(plain);
          assert(islands(e) === 0 && !bad(e), ch + ' at ' + c[0] + ': ' + islands(e) + ' islands, ' + bad(e) + ' bad loops');
          assert(K.textOutline(e).bridges.length === isl, ch + ' at ' + c[0] + ': ' + K.textOutline(e).bridges.length + ' bridges for ' + isl + ' islands');
          n += isl;
        });
      });
      var long = { t: 'text', x: 3, y: 4, str: 'PN 0864-B Rev A\n@&Q9 bdegopq', h: 5, mode: 'outline', strokeWidth: 0.6, stencil: true, bridge: 0.8, rot: 23 };
      assert(!islands(long) && !bad(long), 'turned text');
      long.mirror = true; long.flipV = true;
      assert(!islands(long) && !bad(long), 'mirrored text');
      var arc = { t: 'text', x: 0, y: 0, str: 'BOB 08', h: 4, mode: 'outline', strokeWidth: 0.5, stencil: true, bridge: 0.6, path: { g: { t: 'arc', cx: 0, cy: 0, r: 30, a0: 30, a1: 150 } } };
      assert(!islands(arc) && !bad(arc), 'on an arc');
      var every = { t: 'text', x: 0, y: 0, str: SF.chars, h: 7, mode: 'outline', strokeWidth: 0.9 };
      assert(!K.sketchProfile({ entities: [every] }).loops.some(function (l) { return l.cross; }), 'every character as plain Cut text: no self-crossing');
      return n + ' islands bridged';
    });
    test('sketch-text2: .text(…, { stencil: true }) bridges 0.8 mm / 0.03 in by default; generateScript writes stencil and bridge back; Scale takes the bridge along; Etch text ignores Stencil (no outline)', function () {
      var mm = build('p.sketch("Front").rect(-1, -1, 30, 10).text(0, 0, "B8", { h: 5, mode: "outline", stencil: true }).extrude(1);');
      var inch = build('p.units("in");\np.sketch("Front").rect(-0.1, -0.1, 2, 1).text(0, 0, "B8", { h: 0.25, mode: "outline", stencil: true }).extrude(0.05);');
      noErrors(mm); noErrors(inch);
      var em = mm.model.features[0].entities[1], ei = inch.model.features[0].entities[1];
      assert(em.stencil === true && em.bridge === 0.8 && ei.bridge === 0.03, 'defaults ' + em.bridge + ' / ' + ei.bridge);
      var gen = K.generateScript(mm.model);
      assert(gen.indexOf('"stencil":true,"bridge":0.8') > 0, 'script ' + gen);
      var m2 = K.newModel('T2'); K.runScript(m2, gen);
      assert(JSON.stringify(m2.features[0].entities[1]) === JSON.stringify(em), 'round trip ' + JSON.stringify(m2.features[0].entities[1]));
      nearRel(K.massProps(K.meshFromBody(K.rebuild(m2).body), 1).volume, mm.mp.volume, 1e-9, 'round-trip volume');
      assert(K.transformText(em, { s: 2, cx: 0, cy: 0 }).bridge === 1.6, 'scaled bridge');
      var etch = { t: 'text', x: 0, y: 0, str: 'B8', h: 5, stencil: true, bridge: 0.8 };
      assert(!K.sketchProfile({ entities: [etch] }).loops.length && K.textLayout(etch).strokes.length > 5, 'Etch text: strokes, no outline');
      var bad1 = null; try { K.runScript(K.newModel('T3'), 'p.sketch("Front").text(0, 0, "O", { mode: "outline", stencil: true, bridge: 0 });'); } catch (err) { bad1 = err.message; }
      assert(bad1 && /bridge/i.test(bad1), 'a zero bridge is refused: ' + bad1);
      return 'mm ' + em.bridge + ', in ' + ei.bridge;
    });
    test('sketch-text2: text along an ellipse, a partial ellipse and a spline: every letter\'s baseline ends lie on the curve (1e-9); a whole ellipse\'s centred text sits outside across its top (anchor at the minor axis end), flipped inside across the bottom; a partial ellipse reads clockwise outside like an arc, flipped counter-clockwise inside; a spline from its first point, on its left', function () {
      var el = { t: 'ellipse', cx: 2, cy: -1, rx: 30, ry: 12, rot: 20 }, t = { t: 'text', x: 0, y: 0, str: 'ELLIPSE 123', h: 3, align: 'center', path: { e: 0 } }, sk = { entities: [el, t] };
      assert(K.syncTextPaths(sk) === 1 && t.path.g.t === 'ellipse' && t.path.g.rx === 30, 'path ' + JSON.stringify(t.path));
      var L = K.textLayout(t), worst = 0;
      L.glyphs.forEach(function (g) { worst = Math.max(worst, Math.abs(onEllipse(el, g.p0)), Math.abs(onEllipse(el, g.p1))); });
      assert(worst < 1e-9, 'ellipse: baseline ends off the curve by ' + worst);
      var top = [2 - 12 * Math.sin(20 * Math.PI / 180), -1 + 12 * Math.cos(20 * Math.PI / 180)];
      near(Math.hypot(L.anchor[0] - top[0], L.anchor[1] - top[1]), 0, 1e-9, 'centred on the minor axis end');
      assert(L.strokes.every(function (s) { var b = SF.strokeBox(s); return onEllipse(el, [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]) > -0.01; }), 'letters outside (a stroke on the baseline is a chord: a hair inside)');
      t.path.flip = true;
      var Lf = K.textLayout(t), bot = [2 + 12 * Math.sin(20 * Math.PI / 180), -1 - 12 * Math.cos(20 * Math.PI / 180)];
      near(Math.hypot(Lf.anchor[0] - bot[0], Lf.anchor[1] - bot[1]), 0, 1e-9, 'flipped: centred across the bottom');
      assert(Lf.strokes.every(function (s) { var b = SF.strokeBox(s); return onEllipse(el, [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]) < 0; }), 'flipped: letters inside');
      // a partial ellipse over the top: left to right above it
      var pe = { t: 'pellipse', cx: 0, cy: 0, rx: 20, ry: 10, rot: 0, a0: 20, a1: 160 }, tp = { t: 'text', x: 0, y: 0, str: 'TOP', h: 2, path: { e: 0 } };
      K.syncTextPaths({ entities: [pe, tp] });
      var gp = K.textLayout(tp).glyphs;
      assert(gp[0].p0[0] < gp[2].p1[0] && gp.every(function (g) { return Math.abs(onEllipse(pe, g.p0)) < 1e-9 && Math.abs(onEllipse(pe, g.p1)) < 1e-9; }), 'partial ellipse: left to right, on the curve');
      near(Math.atan2(gp[0].p0[1], gp[0].p0[0] * 0.5) * 180 / Math.PI, 160, 1e-6, 'starts at the a1 end');
      assert(K.textLayout(tp).strokes.every(function (s) { var b = SF.strokeBox(s); return onEllipse(pe, [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]) > -0.01; }), 'outside');
      // a spline: the baseline ends on the true curve, the letters on its left
      var sp = { t: 'spline', pts: [[0, 0], [10, 5], [20, 0], [30, 8]] }, ts = { t: 'text', x: 0, y: 0, str: 'SPLINE', h: 2, path: { e: 0 } }, s2 = { entities: [sp, ts] };
      K.syncTextPaths(s2);
      var fc = S.freeCurve(sp), w2 = 0, L2 = K.textLayout(ts);
      L2.glyphs.forEach(function (g) { [g.p0, g.p1].forEach(function (p) { w2 = Math.max(w2, S.freeClosest(fc, p).d); }); });
      assert(w2 < 1e-9, 'spline: baseline ends off the curve by ' + w2);
      near(Math.hypot(L2.glyphs[0].p0[0], L2.glyphs[0].p0[1]), 0, 1e-12, 'starts at the first point');
      // the spline moves: the text follows it
      sp.pts[3] = [30, 12]; K.syncTextPaths(s2);
      var w3 = 0; fc = S.freeCurve(sp);
      K.textLayout(ts).glyphs.forEach(function (g) { [g.p0, g.p1].forEach(function (p) { w3 = Math.max(w3, S.freeClosest(fc, p).d); }); });
      assert(w3 < 1e-9 && ts.path.g.pts[3][1] === 12, 'follows the edited spline: ' + w3);
      return 'ellipse ' + L.glyphs.length + ', spline ' + L2.glyphs.length + ' letters';
    });
    test('sketch-text2: mirrorEntity reflects text along a spline, an ellipse and a partial ellipse (the copy\'s strokes are the original\'s reflected); transformText turns the curve with it; the script follows a spline / ellipse by index and refuses a rectangle; Cut text along an ellipse makes clean loops', function () {
      var paths = [{ t: 'spline', pts: [[0, 0], [10, 5], [20, 0]], tans: [[30, 1], null, null] }, { t: 'ellipse', cx: 1, cy: 2, rx: 20, ry: 9, rot: 15 }, { t: 'pellipse', cx: 0, cy: 0, rx: 20, ry: 10, rot: 5, a0: 200, a1: 340 }];
      [K.mirrorAxis('y', []), K.mirrorAxis({ x1: 1, y1: -3, x2: 6, y2: 9 })].forEach(function (ax, k) {
        paths.forEach(function (g, j) {
          [false, true].forEach(function (fl) {
            var t = { t: 'text', x: 0, y: 0, str: 'Ab9', h: 2, align: 'center', path: { g: JSON.parse(JSON.stringify(g)) } };
            if (fl) t.path.flip = true;
            var m = K.mirrorEntity(t, ax);
            assert(sSet(K.textLayout(m).strokes) === sSet(K.textLayout(t).strokes.map(function (s) { return reflect(s, ax); })), 'axis ' + k + ' ' + g.t + (fl ? ' flipped' : '') + ': strokes reflected');
          });
        });
      });
      var t2 = { t: 'text', x: 0, y: 0, str: 'ROT', h: 2, path: { g: paths[1] } }, r2 = K.transformText(t2, { rot: 90, cx: 0, cy: 0 });
      assert(sSet(K.textLayout(r2).strokes) === sSet(K.textLayout(t2).strokes.map(function (s) {
        function R(x, y) { return [-y, x]; }
        if (s.t === 'line') { var a = R(s.x1, s.y1), b = R(s.x2, s.y2); return { t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }; }
        var c = R(s.cx, s.cy); return { t: 'arc', cx: c[0], cy: c[1], r: s.r, a0: s.a0 + 90, a1: s.a1 + 90 };
      })), 'turned with its ellipse');
      var m = K.newModel('S');
      K.runScript(m, 'p.sketch("Front").spline([[0, 0], [10, 5], [20, 0], [30, 8]]).text(0, 0, "ON A SPLINE", { h: 2, path: 0 }).ellipse(0, 30, 25, 10, 0).text(0, 0, "ROUND", { h: 3, path: 2, align: "center" }).end();');
      var E = m.features[0].entities;
      assert(E[1].path.g.t === 'spline' && E[3].path.g.t === 'ellipse', 'paths ' + JSON.stringify([E[1].path, E[3].path]));
      var m2 = K.newModel('S2'); K.runScript(m2, K.generateScript(m));
      assert(JSON.stringify(m2.features[0].entities) === JSON.stringify(E), 'round trip');
      var bad2 = null; try { K.runScript(K.newModel('T3'), 'p.sketch("Front").rect(0, 0, 1, 1).text(0, 0, "A", { path: 0 });'); } catch (err) { bad2 = err.message; }
      assert(bad2 && /line or arc, a spline or an ellipse/.test(bad2), 'a rectangle is refused: ' + bad2);
      var cut = { t: 'text', x: 0, y: 0, str: 'CUT ROUND 08', h: 3, mode: 'outline', strokeWidth: 0.4, stencil: true, bridge: 0.5, align: 'center', path: { g: paths[1] } };
      assert(!islands(cut) && !bad(cut), 'Cut stencil text along an ellipse');
      return 'ok';
    });
    // a sheet with a 20 flange on its right edge (x = 100), marks on the base's top face on both sides of a later
    // Sketched Bend at x = 40 (fixed side: x < 40), and a mark on the flange's outer wall face
    var LAY = '.layers([{ name: "ETCH", color: "#1e9e3c", aci: 3, noProfile: true }])';
    function sbFlat(withBend) {
      var code = SHEET + '\np.flange(20, [[100, 2, 30]]);\n' +
        'p.sketch("Top", 2).line(60, -10, 90, -10).line(10, -10, 30, -10).text(55, -40, "SB", { h: 5 })' + LAY + '.layer("ETCH", [0, 1]).end();\n' +
        'p.sketch("Right", 102).line(-50, 8, -10, 8)' + LAY + '.layer("ETCH", [0]).end();\n' +
        (withBend ? 'p.sketch("Top", 2).line(40, 0, 40, -60).sketchedBend(90, { fixed: [10, 2, -30] });\n' : '');
      var r = build(code);
      noErrors(r);
      r.flat = K.flatPattern(r.model, r.build, r.mesh);
      return r;
    }
    function hasLine(f, a, b) { return f.etch.some(function (it) { return it.t === 'line' && ((Math.hypot(it.a[0] - a[0], it.a[1] - a[1]) < 1e-9 && Math.hypot(it.b[0] - b[0], it.b[1] - b[1]) < 1e-9) || (Math.hypot(it.a[0] - b[0], it.a[1] - b[1]) < 1e-9 && Math.hypot(it.b[0] - a[0], it.b[1] - a[1]) < 1e-9)); }); }
    test('sketch-text2: marks drawn before a Sketched Bend ride the piece it folds: a mark on the flange wall the bend carries away unfolds where it does without the bend (it was dropped: "not on a flat face"), the base-face marks on both sides stay where they were drawn (the flat is the plate), the text\'s strokes too', function () {
      var plain = sbFlat(false), bent = sbFlat(true), BA = K.bendAllowance(Math.PI / 2, 2, 2, 0.71);
      assert(bent.flat.bends.length === plain.flat.bends.length + 1, 'one bend more');
      nearRel(K.signedArea(bent.flat.loops[0]), K.signedArea(plain.flat.loops[0]), 1e-9, 'the same blank');
      assert(!bent.flat.warnings.some(function (w) { return /etch marks/.test(w); }), 'no mark dropped: ' + bent.flat.warnings.join(' | '));
      assert(bent.flat.etch.length === plain.flat.etch.length, 'marks ' + bent.flat.etch.length + ' vs ' + plain.flat.etch.length);
      var wx = 100 + BA + 8 - 4;   // 8 up the wall's outer face (x = 102): 2 past the base's top plus R on the bend
      assert(hasLine(plain.flat, [wx, -50], [wx, -10]) && hasLine(bent.flat, [wx, -50], [wx, -10]), 'the wall mark at u = ' + fmt(wx) + ': ' + JSON.stringify(bent.flat.etch.filter(function (it) { return it.t === 'line' && Math.abs(it.a[0] - it.b[0]) < 1e-9; })));
      assert(hasLine(bent.flat, [60, -10], [90, -10]) && hasLine(bent.flat, [10, -10], [30, -10]), 'base marks as drawn, both sides of the bend');
      assert(sSet(bent.flat.etch.filter(function (it) { return it.t !== 'line'; }).map(function (it) { return { t: 'arc', cx: it.c[0], cy: it.c[1], r: it.r, a0: it.a0 || 0, a1: it.t === 'circle' ? 360 : it.a1 }; })) ===
        sSet(plain.flat.etch.filter(function (it) { return it.t !== 'line'; }).map(function (it) { return { t: 'arc', cx: it.c[0], cy: it.c[1], r: it.r, a0: it.a0 || 0, a1: it.t === 'circle' ? 360 : it.a1 }; })), 'the text\'s arcs where they were');
      return bent.flat.etch.length + ' marks, wall at u = ' + fmt(wx);
    });
    test('sketch-text2: a flat-pattern drawing view draws the flat\'s etch marks as thin green lines on layer ETCH (lines, arcs, circles: one primitive per mark segment), its DXF has an ETCH layer in colour 3 with them, its SVG an ETCH group in #1e9e3c and its PDF the green; Show etch marks off (view.showEtch false) leaves them out', function () {
      if (!DW) return 'no drawing engine';
      var r = sbFlat(false);
      var doc = DW.newDrawing(r.model, { date: '2026-10-08' }), v = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build });
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), et = sh.prims.filter(function (p) { return p.layer === 'ETCH'; });
      var nSeg = r.flat.etch.reduce(function (n, it) { return n + (it.t === 'poly' ? (it.closed ? it.pts.length : it.pts.length - 1) : 1); }, 0);
      assert(et.length === nSeg && et.every(function (p) { return p.style === 'etch' && p.color === 'etch' && p.view === v.id && p.etch; }), 'ETCH prims ' + et.length + ' of ' + nSeg);
      assert(et.some(function (p) { return p.k === 'line'; }) && et.some(function (p) { return p.k === 'arc' || p.k === 'circle'; }), 'lines and arcs');
      var w = sh.views.filter(function (x) { return x.view.id === v.id; })[0], it0 = r.flat.etch.filter(function (it) { return it.t === 'line'; })[0], p0 = et.filter(function (p) { return p.k === 'line'; })[0];
      var A = w.toSheet(it0.a);
      near(Math.hypot(p0.a[0] - A[0], p0.a[1] - A[1]), 0, 1e-9, 'placed through the view');
      var dxf = DW.toDXF(sh);
      assert(/\n0\nLAYER\n2\nETCH\n70\n0\n62\n3\n/.test(dxf), 'DXF ETCH layer colour 3');
      assert((dxf.match(/\n0\n(LINE|ARC|CIRCLE)\n8\nETCH\n/g) || []).length === nSeg, 'DXF entities on ETCH ' + (dxf.match(/\n0\n(LINE|ARC|CIRCLE)\n8\nETCH\n/g) || []).length);
      var svg = DW.toSVG(sh);
      assert(/<g data-layer="ETCH"/.test(svg) && /stroke="#1e9e3c"/.test(svg), 'SVG ETCH group in green');
      assert(DW.toPDF(sh).indexOf('0.118 0.62 0.235 RG') >= 0, 'PDF green');
      v.showEtch = false;
      var off = DW.compute(doc, r.mesh, r.model, { build: r.build });
      assert(!off.prims.some(function (p) { return p.layer === 'ETCH'; }) && DW.toDXF(off).indexOf('\nETCH\n') < 0, 'Show etch marks off');
      return nSeg + ' ETCH primitives';
    });
    // inch plate: a Ø.250 hole located 1.000 ±.005 from the left edge (3 places) and .500 TYP up from the bottom; the
    // overall width is also a distance relation (1 place); a driven distance and one unmarked stay off the drawing
    var LOC = 'p.units("in");\np.sketch("Front").rect(0, 0, 4, 2).circle(1, 0.5, 0.125).circle(3, 1.5, 0.125)' +
      '.rel("distance", ["0.e3", "1"], { value: 1, dir: "h", tol: { type: "symmetric", plus: 0.005, minus: 0.005 }, prec: 3, name: "HOLE_X" })' +
      '.rel("distance", ["0.e0", "1"], { value: 0.5, dir: "v", prec: 3, suffix: "TYP" })' +
      '.rel("distance", ["0.e3", "0.e1"], { value: 4, prec: 1 })' +
      '.rel("distance", ["1", "2"], { driven: true })' +
      '.rel("distance", ["0.e0", "2"], { value: 1.5, dir: "v" }).extrude(0.25);';
    function locSheet(code) {
      var r = build(code || LOC);
      noErrors(r);
      r.model.features[0].rels[4].mark = false;   // (Mark for drawing off: an API flag, scripts do not carry it yet)
      r.doc = DW.newDrawing(r.model, { date: '2026-10-08' }); DW.standard3View(r.doc, r.mesh, 'in');
      r.sheet = DW.compute(r.doc, r.mesh, r.model, { build: r.build });
      return r;
    }
    test('sketch-text2: Model Items brings the sketch\'s location dimensions (distance relations, marked for drawing) onto the Front view with their properties: "1.000 ±.005" (horizontal, named HOLE_X@Sketch1), ".500 TYP" (vertical); the overall width that is also a relation reads "4.0" (no second one); a driven and an unmarked relation stay off; DXF and SVG carry the texts', function () {
      if (!DW) return 'no drawing engine';
      var r = locSheet(), dims = r.sheet.dims, front = r.sheet.views.filter(function (w) { return w.view.orient === 'Front'; })[0];
      var loc = dims.filter(function (d) { return d.sketchRel; });
      assert(loc.length === 2 && loc.every(function (d) { return d.view === front.view.id && d.auto; }), 'two location dimensions on Front: ' + dims.map(function (d) { return d.kind + ' ' + d.text; }).join(' | '));
      var hx = loc.filter(function (d) { return d.kind === 'h'; })[0], vy = loc.filter(function (d) { return d.kind === 'v'; })[0];
      assert(hx && hx.text === '1.000 ±.005' && hx.sketchName === 'HOLE_X@Sketch1' && Math.abs(hx.value - 1) < 1e-9, 'horizontal ' + JSON.stringify(hx && [hx.text, hx.sketchName, hx.value]));
      assert(vy && vy.text === '.500 TYP' && vy.sketchName === 'D2@Sketch1' && Math.abs(vy.value - 0.5) < 1e-9, 'vertical ' + JSON.stringify(vy && [vy.text, vy.sketchName]));
      var widths = dims.filter(function (d) { return d.view === front.view.id && d.kind === 'h' && Math.abs(d.value - 4) < 1e-9; });
      assert(widths.length === 1 && widths[0].text === '4.0' && !widths[0].sketchRel, 'overall width once, with the relation\'s precision: ' + JSON.stringify(widths.map(function (d) { return d.text; })));
      assert(!dims.some(function (d) { return d.sketchRel && /:3$|:4$/.test(d.sketchRel); }), 'driven / unmarked left out');
      assert(r.sheet.prims.some(function (p) { return p.k === 'text' && p.layer === 'DIMENSIONS' && /^1\.000/.test(p.text); }), 'drawn');
      var dxf = DW.toDXF(r.sheet), svg = DW.toSVG(r.sheet);
      assert(/\n1\n\.500 TYP\n/.test(dxf) && svg.indexOf('.500 TYP') >= 0, 'DXF / SVG text');
      assert(hx.key === front.view.id + ':rel:' + r.model.features[0].id + ':0', 'its key ' + hx.key);
      return dims.map(function (d) { return d.text; }).join(' | ');
    });
    test('sketch-text2: a location dimension model item drives its relation (dimSource kind rel; driveDim solves the sketch): 1.000 → 1.25 moves the hole, the drawing reads 1.250 ±.005; suppressing it (doc.suppressed) keeps the others', function () {
      if (!DW) return 'no drawing engine';
      var r = locSheet(), hx = r.sheet.dims.filter(function (d) { return d.sketchRel && d.kind === 'h'; })[0], w = r.sheet.views.filter(function (x) { return x.view.id === hx.view; })[0];
      var src = DW.dimSource(r.model, r.build, w, hx);
      assert(src && src.kind === 'rel' && src.index === 0 && src.value === 1, 'source ' + JSON.stringify(src));
      DW.driveDim(r.model, src, 1.25);
      var c = r.model.features[0].entities[1], rc = r.model.features[0].entities[0];
      near(c.cx - rc.x, 1.25, 1e-9, 'the hole is 1.25 from the left edge');
      var b2 = K.rebuild(r.model), m2 = K.meshFromBody(b2.body), sh2 = DW.compute(r.doc, m2, r.model, { build: b2 });
      var h2 = sh2.dims.filter(function (d) { return d.sketchRel && d.kind === 'h'; })[0];
      assert(h2 && h2.text === '1.250 ±.005', 'reads ' + (h2 && h2.text));
      r.doc.suppressed = [h2.key];
      var sh3 = DW.compute(r.doc, m2, r.model, { build: b2 });
      assert(!sh3.dims.some(function (d) { return d.sketchRel && d.kind === 'h'; }) && sh3.dims.some(function (d) { return d.sketchRel && d.kind === 'v'; }), 'suppressed one stays off');
      return h2.text;
    });
    // a DXF with TEXT (rotated, %%c), a centred / middle TEXT, a Fit TEXT, a bottom-right MTEXT of two lines (formatting
    // codes, turned 90° by its direction), an INSERT with a visible and an invisible ATTRIB, two DIMENSIONs and a HATCH
    function dxtFile() {
      return ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC',
        '0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '2', 'TAG', '10', '0', '20', '0', '0', 'LINE', '8', '0', '10', '0', '20', '0', '11', '1', '21', '0', '0', 'ENDBLK', '0', 'ENDSEC',
        '0', 'SECTION', '2', 'ENTITIES',
        '0', 'LINE', '8', 'CUT', '10', '0', '20', '0', '11', '4', '21', '0',
        '0', 'TEXT', '8', 'ETCH', '10', '1', '20', '0.5', '40', '0.125', '1', 'PN 1234 %%c.25', '50', '30',
        '0', 'TEXT', '8', 'NOTES', '10', '0', '20', '0', '40', '0.1', '1', 'CENTER', '72', '1', '73', '2', '11', '2', '21', '1',
        '0', 'TEXT', '8', 'NOTES', '10', '0', '20', '2', '40', '0.1', '1', 'FIT', '72', '5', '11', '3', '21', '2',
        '0', 'MTEXT', '8', 'ETCH', '10', '5', '20', '5', '40', '0.2', '71', '9', '3', 'LINE ONE\\P', '1', '{\\fArial|b0;LINE} TWO', '11', '0', '21', '1',
        '0', 'INSERT', '8', 'CUT', '66', '1', '2', 'TAG', '10', '10', '20', '0',
        '0', 'ATTRIB', '8', '0', '10', '10', '20', '1', '40', '0.1', '1', 'REV B', '2', 'REV', '70', '0',
        '0', 'ATTRIB', '8', '0', '10', '10', '20', '2', '40', '0.1', '1', 'HIDDEN', '2', 'H', '70', '1',
        '0', 'SEQEND',
        '0', 'DIMENSION', '8', 'DIM', '2', '*D1',
        '0', 'DIMENSION', '8', 'DIM', '2', '*D2',
        '0', 'HATCH', '8', 'H',
        '0', 'ENDSEC', '0', 'EOF'].join('\n') + '\n';
    }
    test('dxf-import: TEXT / MTEXT / ATTRIB come in as Etch Sketch Text on their layers — height, rotation, %%c as Ø, 72 / 73 justification (centre / middle at the second point), Fit by its width factor, MTEXT bottom-right with its last line on the point and its direction, an INSERT\'s visible attribute; DIMENSION and HATCH are counted quietly ("2 dimensions and 1 hatch skipped"), not warned', function () {
      var r = DxfImport.parse(dxtFile()), T = r.entities.filter(function (e) { return e.t === 'text'; });
      assert(!r.warnings.length, 'no warnings: ' + r.warnings.join(' | '));
      assert(r.skipped.DIMENSION === 2 && r.skipped.HATCH === 1 && r.skippedNote === '2 dimensions and 1 hatch skipped', 'skipped ' + JSON.stringify([r.skipped, r.skippedNote]));
      assert(T.length === 5 && r.texts === 5, 'texts ' + JSON.stringify(T));
      var pn = T[0];
      assert(pn.str === 'PN 1234 Ø.25' && pn.h === 0.125 && pn.rot === 30 && pn.x === 1 && pn.y === 0.5 && pn.layer === 'ETCH' && !pn.mode, 'TEXT ' + JSON.stringify(pn));
      var ce = T[1];
      assert(ce.x === 2 && ce.y === 1 && ce.align === 'center' && ce.valign === 'middle' && ce.layer === 'NOTES', 'centred ' + JSON.stringify(ce));
      nearRel(K.textLayout(T[2]).width, 3, 1e-9, 'Fit spans the two points');
      var mt = T[3], g = K.textLayout(mt).glyphs, last = g[g.length - 1];
      assert(mt.str === 'LINE ONE\nLINE TWO' && mt.rot === 90 && mt.align === 'right' && mt.layer === 'ETCH', 'MTEXT ' + JSON.stringify(mt));
      near(Math.hypot(last.p1[0] - 5, last.p1[1] - 5), 0, 1e-9, 'the last line ends on the point');
      assert(T[4].str === 'REV B' && T[4].x === 10 && T[4].y === 1 && T[4].layer === 'CUT', 'attribute ' + JSON.stringify(T[4]));
      // into a sketch: Check / Repair leave the text alone; the transform scales and turns it; Etch text makes no profile
      var tr = DxfImport.transform(r.entities, { s: 25.4, rot: 90, dx: 1, dy: 2 }).filter(function (e) { return e.t === 'text'; })[0];
      assert(Math.abs(tr.h - 3.175) < 1e-12 && tr.rot === 120 && Math.abs(tr.x - (1 - 0.5 * 25.4)) < 1e-9 && Math.abs(tr.y - (2 + 25.4)) < 1e-9, 'transformed ' + JSON.stringify(tr));
      var rep = DxfImport.repair(r.entities, { tol: 0.001 });
      assert(rep.entities.filter(function (e) { return e.t === 'text'; }).length === 5, 'repair keeps the texts');
      var sk = { entities: rep.entities, layers: [{ name: 'ETCH', color: '#1e9e3c', aci: 3, noProfile: true }] }, dxf = K.exportDXFSketch(sk, 'in');
      assert(!/\n0\nM?TEXT\n/.test(dxf.slice(dxf.indexOf('ENTITIES'))) && /\n0\nLINE\n8\nETCH\n/.test(dxf), 'written back as strokes on ETCH');
      return T.length + ' texts; ' + r.skippedNote;
    });
  })();
  // --- end sketch-text2 ---

