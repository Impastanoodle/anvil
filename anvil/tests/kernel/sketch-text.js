  // --- sketch-text: Sketch Text in the built-in single-stroke font (sketch-font.js, kernel-sketch.js, kernel-script.js) ---
  group('sketch-text: font, layout, Etch / Cut text in profiles, text along a curve, DXF, script, mirror / move');
  (function () {
    var SF = typeof SketchFont !== 'undefined' ? SketchFont : null;
    // a stroke as a sortable key (a line's ends in either order, an arc's centre, radius and ends), for set equality
    function txtKey(s) {
      function q(x) { return (Math.round(x * 1e5) / 1e5).toFixed(5); }
      function pk(p) { return q(p[0]) + ',' + q(p[1]); }
      if (s.t === 'line') return 'L' + [pk([s.x1, s.y1]), pk([s.x2, s.y2])].sort().join('|');
      if (s.t === 'poly') return 'P' + s.pts.map(pk).sort().join('|');
      var D = Math.PI / 180, full = s.a1 - s.a0 >= 360 - 1e-9;
      return 'A' + pk([s.cx, s.cy]) + 'r' + q(s.r) + (full ? 'full' : [pk([s.cx + s.r * Math.cos(s.a0 * D), s.cy + s.r * Math.sin(s.a0 * D)]), pk([s.cx + s.r * Math.cos(s.a1 * D), s.cy + s.r * Math.sin(s.a1 * D)])].sort().join('|'));
    }
    function txtSet(strokes) { return strokes.map(txtKey).sort().join('\n'); }
    function txtReflect(s, ax) {   // a stroke reflected about axis { p, d }
      function m(x, y) { var t = (x - ax.p[0]) * ax.d[0] + (y - ax.p[1]) * ax.d[1]; return [2 * (ax.p[0] + ax.d[0] * t) - x, 2 * (ax.p[1] + ax.d[1] * t) - y]; }
      if (s.t === 'line') { var a = m(s.x1, s.y1), b = m(s.x2, s.y2); return { t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }; }
      if (s.t === 'poly') return { t: 'poly', pts: s.pts.map(function (p) { return m(p[0], p[1]); }) };
      var c = m(s.cx, s.cy), phi = Math.atan2(ax.d[1], ax.d[0]) * 180 / Math.PI;
      return { t: 'arc', cx: c[0], cy: c[1], r: s.r, a0: 2 * phi - s.a1, a1: 2 * phi - s.a0 };
    }
    test('sketch-text: the font has A–Z, a–z, 0–9 and - . , / \\ ( ) # + = : _ \' " ° Ø ± & @ ? ! space; every glyph lays out with finite strokes inside its advance box (cap height 1, descenders to −1/3)', function () {
      assert(SF, 'SketchFont not loaded');
      var need = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-.,/\\()#+=:_\'"°Ø±&@?! ', missing = [];
      Array.prototype.forEach.call(need, function (ch) { if (!SF.has(ch)) missing.push(ch); });
      assert(!missing.length, 'missing ' + missing.join(''));
      var n = 0;
      Array.prototype.forEach.call(SF.chars, function (ch) {
        var lay = SF.layout(ch, { height: 7 }), g = SF.glyph(ch);
        assert(ch === ' ' ? !lay.strokes.length : lay.strokes.length > 0, ch + ' strokes ' + lay.strokes.length);
        lay.strokes.forEach(function (s) {
          var b = SF.strokeBox(s);
          assert(b.every(isFinite), ch + ' finite ' + JSON.stringify(s));
          assert(b[0] >= -1e-6 && b[2] <= g.adv * 7 + 1e-6 && b[1] >= -SF.DESCENT * 7 - 1e-6 && b[3] <= 7 + 1e-6, ch + ' box ' + JSON.stringify(b) + ' adv ' + g.adv * 7);
          if (s.t === 'arc') assert(s.r > 0 && s.a1 > s.a0, ch + ' arc ' + JSON.stringify(s));
          n++;
        });
      });
      assert(SF.glyph('§').ch === '?', 'unknown characters lay out as ?');
      return SF.chars.length + ' characters, ' + n + ' strokes';
    });
    test('sketch-text: layout width of "ABC" = the sum of advances × h less one gap; Spacing adds to each gap, Width factor scales it; arcs stay true arcs at 100 %, become polylines when stretched; lines, alignment and valign', function () {
      var h = 5, gap = SF.GAP / SF.CAP, adv = ['A', 'B', 'C'].reduce(function (s, c) { return s + SF.glyph(c).adv; }, 0);
      near(SF.layout('ABC', { height: h }).width, adv * h - gap * h, 1e-12, 'width');
      near(SF.layout('ABC', { height: h, charSpacing: 2 }).width, adv * h - gap * h + 2 * gap * h, 1e-12, 'width at 200 % spacing');
      near(SF.layout('ABC', { height: h, widthFactor: 1.5 }).width, (adv * h - gap * h) * 1.5, 1e-12, 'width at 150 %');
      assert(SF.layout('C', { height: h }).strokes.some(function (s) { return s.t === 'arc'; }), 'C has true arcs');
      var st = SF.layout('C', { height: h, widthFactor: 0.8 }).strokes;
      assert(!st.some(function (s) { return s.t === 'arc'; }) && st.some(function (s) { return s.t === 'poly'; }), 'stretched C: polylines');
      var two = SF.layout('AB\nC', { height: h, lineSpacing: 2, align: 'right', valign: 'top' });
      assert(two.lines.length === 2 && two.height === h + 2 * h, 'two lines, height ' + two.height);
      near(two.lines[0].y, -h, 1e-12, 'top: cap of line 1 at y = 0'); near(two.lines[1].y, -3 * h, 1e-12, 'line 2 pitch');
      near(two.lines[0].x0, -two.lines[0].width, 1e-12, 'right aligned');
      var mid = SF.layout('X', { height: h, align: 'center', valign: 'middle' }), xs = SF.strokeBox(mid.strokes[0]);
      near(xs[0], -SF.glyph('X').w * h / 2, 1e-12, 'centred'); near(xs[1], -h / 2, 1e-12, 'middle');
      return 'ABC ' + fmt(SF.layout('ABC', { height: h }).width);
    });
    test('sketch-text: Etch (stroke) text "PN 1234" on ETCH — and on the default layer — makes no region: a plate with it extrudes to the plain 40 × 20 × 2 = 1600; the text is open geometry (no loops, no open-contour warning)', function () {
      var lay = '.layers([{ name: "ETCH", color: "#1e9e3c", aci: 3, noProfile: true }]).layer("ETCH", [1])';
      var a = build('p.sketch("Front").rect(0, 0, 40, 20).text(4, 8, "PN 1234", { h: 4 })' + lay + '.extrude(2);');
      assert(!Object.keys(a.errors).length, 'errors ' + JSON.stringify(a.errors));
      nearRel(a.mp.volume, 1600, 1e-9, 'volume (ETCH)');
      var b = build('p.sketch("Front").rect(0, 0, 40, 20).text(4, 8, "PN 1234", { h: 4 }).extrude(2);');
      nearRel(b.mp.volume, 1600, 1e-9, 'volume (default layer)');
      var sk = b.model.features[0], prof = K.sketchProfile(sk);
      assert(prof.loops.length === 1 && !prof.warnings.length, 'loops ' + prof.loops.length + ' ' + prof.warnings.join(' '));
      var pls = K.entityPolylines(sk.entities[1]);
      assert(pls.length > 10 && pls.every(function (p) { return p.pts.length >= 2 && p.pts.every(function (q) { return isFinite(q[0]) && isFinite(q[1]); }); }), 'stroke polylines ' + pls.length);
      return pls.length + ' strokes';
    });
    test('sketch-text: Cut (outline) text through a 40 × 20 × 2 plate: "I" removes exactly w·(h + w) less its round-cap corners = (w·h + πw²/4)·2; "L" (two strokes united at the corner) w·(h + W) − w²/4 + 5πw²/16; "O" keeps its island', function () {
      var w = 0.5, h = 10, W = 7 / 12 * h, base = 'p.sketch("Front").rect(0, 0, 40, 20).extrude(2);\np.sketch("Front", 2)';
      var i = build(base + '.text(10, 5, "I", { h: 10, mode: "outline", strokeWidth: 0.5 }).cut("through", { reverse: true });');
      assert(!Object.keys(i.errors).length, 'errors ' + JSON.stringify(i.errors));
      nearRel(1600 - i.mp.volume, (w * h + Math.PI * w * w / 4) * 2, 1e-9, 'I removed');
      var l = build(base + '.text(10, 5, "L", { h: 10, mode: "outline", strokeWidth: 0.5 }).cut("through", { reverse: true });');
      nearRel(1600 - l.mp.volume, (w * (h + W) - w * w / 4 + 5 * Math.PI * w * w / 16) * 2, 1e-9, 'L removed');
      var sk = l.model.features[2], prof = K.sketchProfile(sk);
      assert(prof.loops.length === 1 && !prof.loops[0].cross, 'L is one loop: ' + prof.loops.length);
      var o = K.sketchProfile({ entities: [{ t: 'rect', x: 0, y: 0, w: 40, h: 20 }, { t: 'text', x: 10, y: 5, str: 'O', h: 10, mode: 'outline', strokeWidth: 0.5 }] });
      assert(o.loops.length === 3 && o.loops.filter(function (q) { return q.hole; }).length === 1 && o.loops.some(function (q) { return q.depth === 2; }), 'O: plate, letter hole, island ' + JSON.stringify(o.loops.map(function (q) { return q.depth; })));
      var all = K.sketchProfile({ entities: [{ t: 'text', x: 0, y: 0, str: 'PN 1234-REV A\nØ12 ±0.1 & @?!', h: 3, mode: 'outline', strokeWidth: 0.4, rot: 17 }] });
      assert(all.loops.length > 20 && !all.loops.some(function (q) { return q.cross; }) && !all.warnings.length, 'a full line of Cut text: ' + all.loops.length + ' loops ' + all.warnings.join(' '));
      return 'I ' + fmt(1600 - i.mp.volume) + ', L ' + fmt(1600 - l.mp.volume);
    });
    test('sketch-text: text along an arc lays each letter as a chord (first and last baseline points on the radius), centred on the arc\'s middle; flip reads it from inside; along a line the baselines lie on it; the text follows its curve (syncTextPaths) and keeps its place when the curve is deleted', function () {
      var arc = { t: 'arc', cx: 1, cy: 2, r: 20, a0: 30, a1: 150 }, t = { t: 'text', x: 0, y: 0, str: 'ARC 1', h: 3, align: 'center', path: { e: 0 } };
      var sk = { entities: [arc, t] };
      assert(K.syncTextPaths(sk) === 1 && t.path.g && t.path.g.r === 20, 'path geometry ' + JSON.stringify(t.path));
      var L = K.textLayout(t), gl = L.glyphs.filter(function (g) { return !g.blank; });
      [gl[0].p0, gl[0].p1, gl[gl.length - 1].p0, gl[gl.length - 1].p1].forEach(function (p, k) { near(Math.hypot(p[0] - 1, p[1] - 2), 20, 1e-9, 'baseline point ' + k); });
      var a0 = Math.atan2(gl[0].p0[1] - 2, gl[0].p0[0] - 1), a1 = Math.atan2(gl[gl.length - 1].p1[1] - 2, gl[gl.length - 1].p1[0] - 1);
      assert(a0 > a1, 'read clockwise (left to right over the top)');
      near((a0 + a1) / 2, Math.PI / 2, 0.02, 'centred on the arc');
      near(Math.hypot(L.anchor[0] - 1, L.anchor[1] - 22), 0, 1e-9, 'anchor at the arc middle');
      L.strokes.forEach(function (s) { var b = SF.strokeBox(s); assert(Math.hypot((b[0] + b[2]) / 2 - 1, (b[1] + b[3]) / 2 - 2) > 19.9, 'letters outside the baseline circle'); });
      t.path.flip = true;
      K.textLayout(t).strokes.forEach(function (s) { var b = SF.strokeBox(s); assert(Math.hypot((b[0] + b[2]) / 2 - 1, (b[1] + b[3]) / 2 - 2) < 20.1, 'flipped: inside'); });
      delete t.path.flip;
      arc.r = 30; K.syncTextPaths(sk);
      near(Math.hypot(K.textLayout(t).glyphs[0].p0[0] - 1, K.textLayout(t).glyphs[0].p0[1] - 2), 30, 1e-9, 'follows the edited arc');
      var keep = JSON.stringify(K.textLayout(t).strokes);
      sk.entities.splice(0, 1); K.textEntityRemoved(sk, 0); K.syncTextPaths(sk);
      assert(t.path && t.path.e == null && t.path.g.r === 30 && JSON.stringify(K.textLayout(t).strokes) === keep, 'the curve deleted: the text stays ' + JSON.stringify(t.path));
      var ln = { t: 'line', x1: 0, y1: 0, x2: 30, y2: 10 }, tl = { t: 'text', x: 0, y: 0, str: 'AB', h: 2, path: { e: 1 } }, s2 = { entities: [{ t: 'point', x: 0, y: 0 }, ln, tl] };
      K.syncTextPaths(s2);
      K.textLayout(tl).glyphs.forEach(function (g) { [g.p0, g.p1].forEach(function (p) { near(p[0] * 10 - p[1] * 30, 0, 1e-9, 'on the line'); }); });
      var before = s2.entities.slice(); s2.entities.splice(0, 1); K.remapTextPaths(s2, before);
      assert(tl.path.e === 0, 'index follows its line: ' + tl.path.e);
      return 'arc ' + gl.length + ' letters';
    });
    test('sketch-text: DXF writes text as geometry, never TEXT: Etch strokes on ETCH (also from the default layer) as LINE / ARC / CIRCLE; Cut text as closed polylines with bulged round ends, on HOLES inside the plate; script round trip keeps the text', function () {
      var sk = { entities: [{ t: 'rect', x: 0, y: 0, w: 60, h: 20 }, { t: 'text', x: 3, y: 3, str: 'PN 1234 Ø', h: 4, layer: 'ETCH' }, { t: 'text', x: 3, y: 12, str: 'O8', h: 4 },
        { t: 'text', x: 40, y: 3, str: 'CUT', h: 4, mode: 'outline', strokeWidth: 0.5 }], layers: [{ name: 'ETCH', color: '#1e9e3c', aci: 3, noProfile: true }] };
      ['R12', 'R2000'].forEach(function (v) {
        var dxf = K.exportDXFSketch(sk, 'mm', { version: v }), ents = sketchDxfEnts(dxf);
        assert(!ents.some(function (e) { return e.t === 'TEXT' || e.t === 'MTEXT'; }), v + ' no TEXT entities');
        var etch = ents.filter(function (e) { return e['8'] === 'ETCH'; });
        var nLines = K.textLayout(sk.entities[1]).strokes.length + K.textLayout(sk.entities[2]).strokes.length;
        assert(etch.length === nLines && etch.some(function (e) { return e.t === 'ARC'; }) && etch.some(function (e) { return e.t === 'CIRCLE'; }) && etch.some(function (e) { return e.t === 'LINE'; }), v + ' ETCH: ' + etch.length + ' of ' + nLines);
        assert(/\n2\nETCH\n70\n0\n62\n3\n/.test(dxf), v + ' ETCH layer colour 3');
        var cut = ents.filter(function (e) { return e['8'] === 'HOLES' && /^(LW)?POLYLINE$/.test(e.t); });
        assert(cut.length === K.textOutline(sk.entities[3]).loops.length && cut.every(function (e) { return (e.t === 'LWPOLYLINE' || e.t === 'POLYLINE') && (e['70'] & 1); }), v + ' Cut loops on HOLES ' + JSON.stringify(cut.map(function (e) { return e.t; })));
        assert(/\n42\n/.test(dxf), v + ' bulges for the round ends');
      });
      var code = 'p.sketch("Front").rect(0, 0, 60, 20).arc(30, -40, 50, 60, 120).text(3, 3, "PN 1234\\nREV A", { h: 4, align: "left", spacing: 1.2 })' +
        '.text(0, 0, "ALONG", { h: 3, align: "center", path: 1 }).text(40, 5, "X", { h: 6, mode: "outline", strokeWidth: 0.6, rot: 10, mirror: true }).extrude(2);';
      var r = build(code), gen = K.generateScript(r.model);
      assert(gen.indexOf('.text(3, 3, "PN 1234\\nREV A", {"h":4,"align":"left","spacing":1.2})') > 0 && /\.text\(0, 0, "ALONG", \{[^)]*"path":\{"e":1,"g":\{"t":"arc"/.test(gen), 'script ' + gen);
      var m2 = K.newModel('T2'); K.runScript(m2, gen);
      assert(JSON.stringify(m2.features[0].entities) === JSON.stringify(r.model.features[0].entities), 'round trip ' + JSON.stringify(m2.features[0].entities));
      nearRel(K.massProps(K.meshFromBody(K.rebuild(m2).body), 1).volume, r.mp.volume, 1e-9, 'round-trip volume');
      var bad = null; try { K.runScript(K.newModel('T3'), 'p.sketch("Front").rect(0, 0, 1, 1).text(0, 0, "A", { path: 0 });'); } catch (err) { bad = err.message; }
      assert(bad && /line or arc/.test(bad), 'a path on a rectangle is refused: ' + bad);
      return 'Etch + Cut DXF, script ' + gen.split('\n').filter(function (x) { return /\.text\(/.test(x); }).length + ' texts';
    });
    test('sketch-text: mirrorEntity reflects text (2φ − rot, Flip vertical toggled; along an arc the copy flips round its mirrored curve) — the copy\'s strokes are the reflection of the original\'s; translateEntity / transformText move, turn and scale it; trim refuses it', function () {
      var free = { t: 'text', x: 3, y: 4, str: 'Ab9&', h: 5, rot: 25, align: 'center', layer: 'ETCH' };
      var onArc = { t: 'text', x: 0, y: 0, str: 'ARC', h: 3, align: 'right', path: { e: 0, g: { t: 'arc', cx: 1, cy: 2, r: 20, a0: 30, a1: 150 } } };
      var onLine = { t: 'text', x: 0, y: 0, str: 'LN', h: 3, path: { g: { t: 'line', x1: 0, y1: 0, x2: 20, y2: 5 } }, mirror: true };
      [K.mirrorAxis('y', []), K.mirrorAxis({ x1: 1, y1: -3, x2: 6, y2: 9 })].forEach(function (ax, k) {
        [free, onArc, onLine].forEach(function (t, j) {
          var m = K.mirrorEntity(t, ax);
          assert(txtSet(K.textLayout(m).strokes) === txtSet(K.textLayout(t).strokes.map(function (s) { return txtReflect(s, ax); })), 'axis ' + k + ' text ' + j + ': strokes reflected');
        });
      });
      assert(K.mirrorEntity(free, K.mirrorAxis('y', [])).layer === 'ETCH' && K.mirrorEntity(onArc, K.mirrorAxis('y', [])).path.e == null, 'layer kept, the copy is off the curve');
      var mv = K.translateEntity(free, 10, -2);
      near(mv.x, 13, 1e-12, 'moved x');
      var shifted = K.textLayout(free).strokes.map(function (s) { return s.t === 'line' ? { t: 'line', x1: s.x1 + 10, y1: s.y1 - 2, x2: s.x2 + 10, y2: s.y2 - 2 } : { t: 'arc', cx: s.cx + 10, cy: s.cy - 2, r: s.r, a0: s.a0, a1: s.a1 }; });
      assert(txtSet(K.textLayout(mv).strokes) === txtSet(shifted), 'translate');
      var sc = K.transformText(free, { s: 2, cx: 3, cy: 4 }), rt = K.transformText(free, { rot: 90, cx: 0, cy: 0 });
      assert(sc.h === 10 && sc.x === 3 && rt.rot === 115 && Math.abs(rt.x + 4) < 1e-12 && Math.abs(rt.y - 3) < 1e-12, 'scale / rotate ' + JSON.stringify([sc.h, rt.rot, rt.x, rt.y]));
      var thrown = null; try { K.trimEntity([free], 0, [3, 4]); } catch (err) { thrown = err.message; }
      assert(thrown && /text/i.test(thrown), 'trim refuses text');
      return 'ok';
    });
  })();
  // --- end sketch-text ---

