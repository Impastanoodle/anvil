  // --- r11/hatch11 ---
  group('r11/hatch11: section hatch per part, collinear pieces joined, hatch to the drawn rims, detail letters');
  (function () {
    var DW = Drawing;
    function exCode(name) { return AnvilExamples.filter(function (e) { return e.name === name; })[0].code; }
    function angDiff(a, b) { var d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); }
    // an assembly example drawn: Standard 3 View, a section of the Top view at v = at (viewer on +v), optional detail
    function asmSection(name, at, detail) {
      var r = buildAsm(exCode(name));
      assert(!Object.keys(r.errors).length, name + ' errors ' + JSON.stringify(r.errors));
      var doc = DW.newDrawing(r.model, { date: '2026-10-04' });
      DW.standard3View(doc, r.mesh, r.model.units);
      var tv = doc.views.filter(function (v) { return v.role === 'top'; })[0];
      var sv = DW.addSectionView(doc, r.mesh, tv.id, { axis: 'h', at: at, sign: 1 }), dv = detail ? DW.addDetailView(doc, r.mesh, sv.id, detail) : null;
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      function w(v) { return v && sh.views.filter(function (x) { return x.view.id === v.id; })[0]; }
      return { r: r, doc: doc, sheet: sh, sec: w(sv), det: w(dv), top: w(tv) };
    }
    test('Hinged cover SECTION A-A: every part inside a sub-assembly is its own cut face with its own hatch (5 parts, 5 styles, not 3), and touching faces differ by 45° or more', function () {
      var x = asmSection('Hinged cover (sub-assemblies)', -10), S = x.sec.section, caps = x.sec.content.caps;
      var parts = {};
      S.caps.forEach(function (fi) { parts[S.mesh.faces[fi].part] = S.mesh.faces[fi].body; });
      assert(Object.keys(parts).length === 5, 'cut parts ' + JSON.stringify(parts));
      // Hinge<1> (body 1) and Hinge<2> (body 2) each cut into a leaf and an arm
      [1, 2].forEach(function (b) { assert(Object.keys(parts).filter(function (p) { return parts[p] === b; }).length === 2, 'Hinge body ' + b + ': two parts'); });
      var st = {}, styles = {};
      x.sec.hatches.forEach(function (h) { assert(h.part != null && h.lines > 0, 'hatched part ' + JSON.stringify(h)); st[h.part] = h; styles[h.angle + '/' + h.spacing] = 1; });
      assert(Object.keys(styles).length === 5, 'distinct styles ' + JSON.stringify(st));
      var A = DW.hatchAssign(caps), touching = 0, bb = [Infinity, Infinity, -Infinity, -Infinity];
      caps.forEach(function (c) { c.loops.forEach(function (l) { l.forEach(function (p) { bb = [Math.min(bb[0], p[0]), Math.min(bb[1], p[1]), Math.max(bb[2], p[0]), Math.max(bb[3], p[1])]; }); }); });
      var tolT = 0.02 * Math.hypot(bb[2] - bb[0], bb[3] - bb[1]);   // (nearly touching: the arms stand 1 mm clear of their leaves)
      caps.forEach(function (a, i) { caps.forEach(function (b, j) {
        if (j <= i || a.part === b.part) return;
        function touches(a, b) { return a.loops.some(function (la) { return la.some(function (p) { return b.loops.some(function (lb) { return lb.some(function (q, k) { var q2 = lb[(k + 1) % lb.length], dx = q2[0] - q[0], dy = q2[1] - q[1], L2 = dx * dx + dy * dy, s = L2 ? Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - q[0] - s * dx, p[1] - q[1] - s * dy) <= tolT; }); }); }); }); }
        var t = touches(a, b) || touches(b, a);
        if (!t) return;
        touching++;
        assert(angDiff(A[i].angle, A[j].angle) >= 45 || A[i].spacing !== A[j].spacing, 'parts ' + a.part + ' / ' + b.part + ' touch: ' + JSON.stringify([A[i], A[j]]));
      }); });
      assert(touching >= 2, 'touching pairs ' + touching);
      // the hatch lines of a part lie in its own cut face, at its own angle
      var hl = x.sheet.prims.filter(function (q) { return q.layer === x.sec.layer && q.style === 'hatch'; });
      assert(hl.length === x.sec.hatch, 'hatch count');
      hl.forEach(function (q) { var a = (Math.atan2(q.b[1] - q.a[1], q.b[0] - q.a[0]) * 180 / Math.PI + 360) % 180; assert(Math.abs(a - st[q.part].angle) < 1e-6, 'part ' + q.part + ' line at ' + a); });
      return x.sec.hatches.map(function (h) { return h.part + ':' + h.angle + '°/' + h.spacing; }).join(', ');
    });
    test('hatchAssign: caps that touch nothing keep hatchStyle order (45°, 135°, 30°); a second pin in a plate gets 135° at 1.6× spacing, not 30° beside 45°', function () {
      function sq(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
      var far = DW.hatchAssign([{ body: 0, loops: [sq(0, 0, 10, 10)] }, { body: 1, loops: [sq(100, 0, 110, 10)] }, { body: 2, loops: [sq(200, 0, 210, 10)] }]);
      assert(far.map(function (s) { return s.angle + '/' + s.spacing; }).join(' ') === '45/1 135/1 30/1', JSON.stringify(far));
      var pins = DW.hatchAssign([{ body: 0, loops: [sq(0, 0, 100, 10)] }, { body: 1, loops: [sq(10, 10, 18, 30)] }, { body: 2, loops: [sq(80, 10, 88, 30)] }]);
      assert(pins.map(function (s) { return s.angle + '/' + s.spacing; }).join(' ') === '45/1 135/1 135/1.6', JSON.stringify(pins));
      // a part tag wins over the body: two parts of one body (a sub-assembly) get two styles; two caps of one part one
      var sub = DW.hatchAssign([{ body: 1, part: 3, loops: [sq(0, 0, 10, 10)] }, { body: 1, part: 4, loops: [sq(10, 0, 20, 10)] }, { body: 1, part: 3, loops: [sq(40, 0, 50, 10)] }]);
      assert(sub[0] === sub[2] && angDiff(sub[0].angle, sub[1].angle) === 90, JSON.stringify(sub));
    });
    test('joinCollinear: pieces of one edge 0.002 mm apart or overlapping are one line; other bodies, real gaps and a curve\'s chords stay apart', function () {
      var L = [[-4.18629, -21, -3.41029, -21, 3], [-3.41029, -21, -1.9623, -21, 3], [-1.97064, -21, -1.18629, -21, 3], [-35.81496, -10, -35.80545, -10, 2], [-35.80326, -10, 7.81577, -10, 2]];
      var out = DW.joinCollinear(L.map(function (l) { return l.slice(); }), 0.03, 200);
      assert(out.length === 2, 'joined ' + JSON.stringify(out));
      var a = out.filter(function (l) { return l[4] === 3; })[0], b = out.filter(function (l) { return l[4] === 2; })[0];
      near(Math.min(a[0], a[2]), -4.18629, 1e-9, 'start'); near(Math.max(a[0], a[2]), -1.18629, 1e-9, 'end'); near(a[1], -21, 1e-12, 'v');
      near(Math.min(b[0], b[2]), -35.81496, 1e-9, 'start'); near(Math.max(b[0], b[2]), 7.81577, 1e-9, 'end');
      var keep = [[0, 0, 10, 0, 0], [10.001, 0, 20, 0, 1], [30, 0, 40, 0, 0], [40.1, 0, 50, 0, 0], [0, 5, 1, 5, 0], [1, 5, 2, 5.01, 0]];
      assert(DW.joinCollinear(keep.map(function (l) { return l.slice(); }), 0.03, 200).length === 6, 'other bodies, a 0.1 gap and a 0.57° chord turn stay apart');
    });
    test('snapHatch: hatch lines end on the drawn circle, not on the facets\' chords — a disc (lines lengthened) and a hole (shortened); straight edges untouched', function () {
      var n = 32, disc = [], hole = [], R = 20, r = 8;
      for (var i = 0; i < n; i++) { var t = 2 * Math.PI * i / n; disc.push([R * Math.cos(t), R * Math.sin(t)]); hole.unshift([r * Math.cos(t), r * Math.sin(t)]); }
      var loops = [disc, hole], segs = DW.patternLines(loops, 1.5, 45, 'ANSI31'), before = segs.map(function (s) { return s.slice(); });
      DW.snapHatch(segs, loops, [{ c: [0, 0], r: R }, { c: [0, 0], r: r }]);
      var worst = 0, moved = 0;
      segs.forEach(function (s, k) {
        [[s[0], s[1]], [s[2], s[3]]].forEach(function (p) { var d = Math.hypot(p[0], p[1]); worst = Math.max(worst, Math.min(Math.abs(d - R), Math.abs(d - r))); });
        if (s.some(function (x, j) { return Math.abs(x - before[k][j]) > 1e-9; })) moved++;
      });
      assert(worst < 1e-9, 'ends off the circles by ' + worst);
      assert(moved > segs.length * 0.9, 'moved ' + moved + ' / ' + segs.length);
      var sq = [[[0, 0], [10, 0], [10, 10], [0, 10]]], s2 = DW.patternLines(sq, 1, 45, 'ANSI31'), b2 = JSON.stringify(s2);
      DW.snapHatch(s2, sq, [{ c: [5, 5], r: 5 }]);
      assert(JSON.stringify(s2) === b2, 'a square inside a circle of its half width is not snapped');
    });
    test('Gear train SECTION A-A with DETAIL B on Gear B: the letter B is clear of every label, hatch lines stop round it, and the section label sits below the detail circle', function () {
      var x = asmSection('Gear train and patterns', -10, { c: [-3, -15], r: 8, scale: '4:1' });
      assert(x.sec && x.det, 'section and detail views');
      var L = x.sec.layer, texts = x.sheet.prims.filter(function (q) { return q.k === 'text'; });
      var B = texts.filter(function (q) { return q.layer === L && q.text === 'B'; })[0], lab = texts.filter(function (q) { return q.layer === L && /^SECTION /.test(q.text); })[0];
      assert(B && lab, 'letter and label');
      var circ = x.sheet.prims.filter(function (q) { return q.layer === L && q.k === 'circle' && q.style === 'thick'; })[0];
      assert(lab.p[1] + lab.h < circ.c[1] - circ.r, 'SECTION A-A below the detail circle (' + lab.p[1] + ' / ' + (circ.c[1] - circ.r) + ')');
      var w = B.text.length * B.h * 0.6, R = [B.p[0] - w / 2, B.p[1], B.p[0] + w / 2, B.p[1] + B.h];
      texts.forEach(function (q) { if (q === B) return; var qw = q.text.length * q.h * 0.6, x0 = q.anchor === 'middle' ? q.p[0] - qw / 2 : q.anchor === 'end' ? q.p[0] - qw : q.p[0]; assert(x0 > R[2] || x0 + qw < R[0] || q.p[1] > R[3] || q.p[1] + q.h < R[1], 'B over "' + q.text + '"'); });
      var through = x.sheet.prims.filter(function (q) {
        if (q.layer !== L || q.style !== 'hatch') return false;
        for (var i = 1; i < 20; i++) { var t = i / 20, px = q.a[0] + (q.b[0] - q.a[0]) * t, py = q.a[1] + (q.b[1] - q.a[1]) * t; if (px > R[0] && px < R[2] && py > R[1] && py < R[3]) return true; }
        return false;
      });
      assert(!through.length, through.length + ' hatch lines through the letter');
      assert(x.sheet.prims.filter(function (q) { return q.layer === L && q.style === 'hatch'; }).length === x.sec.hatch, 'hatch count kept in step');
      return 'B at ' + B.p.map(function (v) { return v.toFixed(1); }).join(', ');
    });
  })();
  // --- end r11/hatch11 ---

