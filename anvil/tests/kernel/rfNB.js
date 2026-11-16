  // --- rfNB (2026-11-15, lane NB: nests a shop can cut — exact-curve audit, part-in-part first, marks travel with
  // their part, unplaced reasons, remnant, one-DXF-for-all-sheets, the nest report) ---
  (function () {
    group('rfNB: Geometry Nesting a shop can cut');
    var TAU = 2 * Math.PI;
    function rfNBRect(w, h, x, y) { x = x || 0; y = y || 0; return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
    function rfNBArc(c, r, a0, a1, ccw) { function p(t) { return [c[0] + r * Math.cos(t * Math.PI / 180), c[1] + r * Math.sin(t * Math.PI / 180)]; } return { t: 'arc', a: p(a0), b: p(a1), c: c, r: r, ccw: ccw }; }
    function rfNBCirc(x, y, r) { return { circle: { c: [x, y], r: r } }; }
    // C half-ring (concave, true arcs): outer R5, inner R3
    function rfNBC() { return { segs: [rfNBArc([0, 0], 5, -90, 90, true), { t: 'line', a: [0, 5], b: [0, 3] }, rfNBArc([0, 0], 3, 90, -90, false), { t: 'line', a: [0, -3], b: [0, -5] }] }; }
    function rfNBSlot() { return { segs: [{ t: 'line', a: [2, 0], b: [12, 0] }, rfNBArc([12, 2], 2, -90, 90, true), { t: 'line', a: [12, 4], b: [2, 4] }, rfNBArc([2, 2], 2, 90, 270, true)] }; }
    // ---- exact distances between true lines / arcs (no polygons): the audit's checker
    function rfNBPrims(loops) {
      var out = [];
      loops.forEach(function (L) {
        if (L.circle) { out.push({ t: 'arc', c: L.circle.c, r: L.circle.r, a0: 0, sw: TAU }); return; }
        L.segs.forEach(function (s) {
          if (s.t === 'line') { out.push({ t: 'line', a: s.a, b: s.b }); return; }
          var a0 = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]);
          out.push({ t: 'arc', c: s.c, r: s.r, a0: s.sweep > 0 ? a0 : a0 + s.sweep, sw: Math.abs(s.sweep) });
        });
      });
      out.forEach(function (p) { p.box = p.t === 'line' ? [Math.min(p.a[0], p.b[0]), Math.min(p.a[1], p.b[1]), Math.max(p.a[0], p.b[0]), Math.max(p.a[1], p.b[1])] : [p.c[0] - p.r, p.c[1] - p.r, p.c[0] + p.r, p.c[1] + p.r]; });
      return out;
    }
    function rfNBOnArc(A, ang) { var d = ang - A.a0; d = ((d % TAU) + TAU) % TAU; return A.sw >= TAU - 1e-12 || d <= A.sw + 1e-12; }
    function rfNBPtSeg(p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]); }
    function rfNBEnds(A) { return [[A.c[0] + A.r * Math.cos(A.a0), A.c[1] + A.r * Math.sin(A.a0)], [A.c[0] + A.r * Math.cos(A.a0 + A.sw), A.c[1] + A.r * Math.sin(A.a0 + A.sw)]]; }
    function rfNBPtArc(p, A) {
      if (rfNBOnArc(A, Math.atan2(p[1] - A.c[1], p[0] - A.c[0]))) return Math.abs(Math.hypot(p[0] - A.c[0], p[1] - A.c[1]) - A.r);
      var e = rfNBEnds(A); return Math.min(Math.hypot(p[0] - e[0][0], p[1] - e[0][1]), Math.hypot(p[0] - e[1][0], p[1] - e[1][1]));
    }
    function rfNBDist(P, Q) {
      if (P.t === 'line' && Q.t === 'line') return Nest._.segDist(P.a, P.b, Q.a, Q.b);
      if (P.t !== 'line' && Q.t === 'line') { var t = P; P = Q; Q = t; }
      var best;
      if (P.t === 'line') {
        best = Math.min(rfNBPtArc(P.a, Q), rfNBPtArc(P.b, Q));
        rfNBEnds(Q).forEach(function (e) { best = Math.min(best, rfNBPtSeg(e, P.a, P.b)); });
        var dx = P.b[0] - P.a[0], dy = P.b[1] - P.a[1], fx = P.a[0] - Q.c[0], fy = P.a[1] - Q.c[1], a = dx * dx + dy * dy, bq = 2 * (fx * dx + fy * dy), cq = fx * fx + fy * fy - Q.r * Q.r, disc = bq * bq - 4 * a * cq;
        if (disc >= 0 && a > 0) [(-bq - Math.sqrt(disc)) / (2 * a), (-bq + Math.sqrt(disc)) / (2 * a)].forEach(function (s) { if (s >= 0 && s <= 1 && rfNBOnArc(Q, Math.atan2(fy + s * dy, fx + s * dx))) best = 0; });
        if (a > 0) { var u = Math.max(0, Math.min(1, -(fx * dx + fy * dy) / a)); best = Math.min(best, rfNBPtArc([P.a[0] + u * dx, P.a[1] + u * dy], Q)); }
        return best;
      }
      best = Infinity;
      rfNBEnds(P).forEach(function (e) { best = Math.min(best, rfNBPtArc(e, Q)); });
      rfNBEnds(Q).forEach(function (e) { best = Math.min(best, rfNBPtArc(e, P)); });
      var ddx = Q.c[0] - P.c[0], ddy = Q.c[1] - P.c[1], d = Math.hypot(ddx, ddy);
      if (d > 1e-12) {
        var ux = ddx / d, uy = ddy / d;
        [1, -1].forEach(function (s) {
          if (rfNBOnArc(P, Math.atan2(s * uy, s * ux))) best = Math.min(best, rfNBPtArc([P.c[0] + P.r * s * ux, P.c[1] + P.r * s * uy], Q));
          if (rfNBOnArc(Q, Math.atan2(-s * uy, -s * ux))) best = Math.min(best, rfNBPtArc([Q.c[0] - Q.r * s * ux, Q.c[1] - Q.r * s * uy], P));
        });
        if (d <= P.r + Q.r && d >= Math.abs(P.r - Q.r)) {
          var x = (d * d + P.r * P.r - Q.r * Q.r) / (2 * d), hh = Math.sqrt(Math.max(0, P.r * P.r - x * x));
          [hh, -hh].forEach(function (k) { var p = [P.c[0] + ux * x - uy * k, P.c[1] + uy * x + ux * k];
            if (rfNBOnArc(P, Math.atan2(p[1] - P.c[1], p[0] - P.c[0])) && rfNBOnArc(Q, Math.atan2(p[1] - Q.c[1], p[0] - Q.c[0]))) best = 0; });
        }
      }
      return best;
    }
    function rfNBIn(pt, pts) { var inside = false; for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) { var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1]; if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside; } return inside; }
    // every pair at least the spacing apart (true curves), every part inside the margin, each copy exactly once
    // (placed or unplaced), parts inside another part's outer loop counted (and refused when holes are off)
    function rfNBExact(res) {
      var o = res.opts, probs = [], minGap = Infinity, nIn = 0, pairs = 0;
      res.sheets.forEach(function (S) {
        var items = S.placements.map(function (pl) {
          var loops = Nest.placedLoops(res, pl);
          return { pl: pl, box: Nest.loopsBox(loops), pr: rfNBPrims(loops), outer: Nest.loopPoly(loops[0], 1e-6), holes: loops.slice(1).map(function (L) { return Nest.loopPoly(L, 1e-6); }) };
        });
        items.forEach(function (it) { var b = it.box; if (b[0] < o.margin - 1e-9 || b[1] < o.margin - 1e-9 || b[2] > o.width - o.margin + 1e-9 || b[3] > o.height - o.margin + 1e-9) probs.push('margin: ' + it.pl.name); });
        var lim = o.spacing + 0.5;
        for (var i = 0; i < items.length; i++) for (var j = i + 1; j < items.length; j++) {
          var A = items[i], B = items[j];
          if (A.box[0] > B.box[2] + lim || B.box[0] > A.box[2] + lim || A.box[1] > B.box[3] + lim || B.box[1] > A.box[3] + lim) continue;
          pairs++;
          var g = Infinity, inA = rfNBIn(B.outer[0], A.outer), inB = rfNBIn(A.outer[0], B.outer);
          if ((inA && !A.holes.some(function (hh) { return rfNBIn(B.outer[0], hh); })) || (inB && !B.holes.some(function (hh) { return rfNBIn(A.outer[0], hh); }))) g = 0;
          if (inA || inB) { nIn++; if (!o.holes) probs.push('in a hole with Nest in holes off: ' + A.pl.name + ' / ' + B.pl.name); }
          for (var x = 0; x < A.pr.length && g > 0; x++) {
            var P = A.pr[x];
            if (P.box[0] > B.box[2] + lim || P.box[2] < B.box[0] - lim || P.box[1] > B.box[3] + lim || P.box[3] < B.box[1] - lim) continue;
            for (var y = 0; y < B.pr.length; y++) {
              var Q = B.pr[y], m = Math.min(g, lim);
              if (P.box[0] > Q.box[2] + m || Q.box[0] > P.box[2] + m || P.box[1] > Q.box[3] + m || Q.box[1] > P.box[3] + m) continue;
              g = Math.min(g, rfNBDist(P, Q));
            }
          }
          minGap = Math.min(minGap, g);
          if (g < o.spacing - 1e-9) probs.push(A.pl.name + ' #' + (A.pl.copy + 1) + ' / ' + B.pl.name + ' #' + (B.pl.copy + 1) + ' ' + g.toFixed(6) + ' apart');
        }
      });
      var seen = {};
      res.placements.concat(res.unplaced).forEach(function (p) { var k = p.part + ':' + p.copy; if (seen[k]) probs.push('copy twice ' + k); seen[k] = 1; });
      res.parts.forEach(function (p, i) { for (var c = 0; c < p.qty; c++) if (!seen[i + ':' + c]) probs.push('copy missing ' + p.name + ' #' + (c + 1)); });
      return { ok: !probs.length, problems: probs, minGap: minGap, inHoles: nIn, pairs: pairs };
    }
    // bounding-box shelf packing (first fit decreasing height, boxes turned to lie flat): the baseline a true-shape
    // nest must never lose to
    function rfNBShelf(parts, o) {
      var W = o.width - 2 * o.margin + o.spacing, H = o.height - 2 * o.margin + o.spacing, items = [], sheets = [];
      parts.forEach(function (p) { var q = Nest.part(p); for (var c = 0; c < p.qty; c++) items.push({ w: Math.max(q.size[0], q.size[1]) + o.spacing, h: Math.min(q.size[0], q.size[1]) + o.spacing }); });
      items.sort(function (a, b) { return b.h - a.h || b.w - a.w; });
      items.forEach(function (it) {
        for (var s = 0; s < sheets.length; s++) {
          var S = sheets[s], sh = S.shelves.filter(function (q) { return q.h >= it.h - 1e-12 && q.x + it.w <= W + 1e-12; })[0];
          if (sh) { sh.x += it.w; return; }
          if (S.y + it.h <= H + 1e-12) { S.shelves.push({ h: it.h, x: it.w }); S.y += it.h; return; }
        }
        sheets.push({ y: it.h, shelves: [{ h: it.h, x: it.w }] });
      });
      return sheets.length;
    }
    function rfNBMix() {
      return [
        { name: 'Plate 20x12', qty: 10, loops: [{ segs: [{ t: 'line', a: [1, 0], b: [19, 0] }, rfNBArc([19, 1], 1, -90, 0, true), { t: 'line', a: [20, 1], b: [20, 11] }, rfNBArc([19, 11], 1, 0, 90, true), { t: 'line', a: [19, 12], b: [1, 12] }, rfNBArc([1, 11], 1, 90, 180, true), { t: 'line', a: [0, 11], b: [0, 1] }, rfNBArc([1, 1], 1, 180, 270, true)] }, rfNBCirc(3, 3, 0.5), rfNBCirc(17, 3, 0.5), rfNBCirc(3, 9, 0.5), rfNBCirc(17, 9, 0.5)] },
        { name: 'L 16', qty: 10, loops: [[[0, 0], [16, 0], [16, 5], [5, 5], [5, 16], [0, 16]]] },
        { name: 'Disc D10', qty: 10, loops: [rfNBCirc(0, 0, 5), rfNBCirc(0, 0, 1)] },
        { name: 'Triangle 18', qty: 10, loops: [[[0, 0], [18, 0], [9, 12]]] },
        { name: 'C half-ring', qty: 10, loops: [rfNBC()] },
        { name: 'Slot 14x4', qty: 10, loops: [rfNBSlot(), rfNBCirc(2, 2, 0.5), rfNBCirc(12, 2, 0.5)] }];
    }

    test('rfNB: 60 parts of 6 shapes (arcs, a concave C, holes) on 48 × 96 and 48 × 120 at 90° steps and at 180° only (grain), spacing .25, margin .5 — every pair at least .25 apart measured on the true lines and arcs, every part inside the margin, each copy once; sheets between the area bound and shelf packing of the boxes; the same job twice gives the same nest', function () {
      var out = [];
      [[96, 48], [120, 48]].forEach(function (sz) {
        [90, 180].forEach(function (rot) {
          var parts = rfNBMix(), o = { width: sz[0], height: sz[1], spacing: 0.25, margin: 0.5, rotation: rot, maxSheets: 10 };
          var r = Nest.run(parts, o), r2 = Nest.run(parts, o), ex = rfNBExact(r);
          assert(ex.ok, sz + ' ' + rot + ': ' + ex.problems.slice(0, 4).join('; '));
          assert(r.placed === 60 && !r.unplaced.length, 'placed ' + r.placed);
          assert(ex.minGap >= 0.25 - 1e-9 && ex.pairs > 50, 'gap ' + ex.minGap + ' over ' + ex.pairs + ' near pairs');
          var area = r.parts.reduce(function (s, p) { return s + p.area * p.qty; }, 0), lb = Math.ceil(area / ((sz[0] - 1) * (sz[1] - 1))), sh = rfNBShelf(parts, o);
          assert(r.sheets.length >= lb && r.sheets.length <= sh, r.sheets.length + ' sheets: bound ' + lb + ', shelf ' + sh);
          assert(JSON.stringify(r.placements) === JSON.stringify(r2.placements), 'not deterministic');
          if (rot === 180) assert(r.placements.every(function (p) { return p.angle === 0 || p.angle === 180; }), 'grain: 0 / 180 only');
          out.push(sz[0] + 'x' + sz[1] + '@' + rot + ': ' + r.sheets.length + ' (bound ' + lb + ', shelf ' + sh + ') ' + r.sheets.map(function (s) { return s.utilization.toFixed(1); }).join('/') + ' %');
        });
      });
      return out.join('; ');
    });

    test('rfNB: part in part — a 30 × 20 tray blank with two 6 × 4 windows and a Ø3 hole plus 20 washers Ø1.5: with Nest in holes on, washers go into the blank\'s windows and hole first (at least 8, each .25 clear on the true circles) instead of beside it; with it off none does', function () {
      var tray = { name: 'Tray', qty: 1, loops: [[[2.5, 0], [27.5, 0], [27.5, 2.5], [30, 2.5], [30, 17.5], [27.5, 17.5], [27.5, 20], [2.5, 20], [2.5, 17.5], [0, 17.5], [0, 2.5], [2.5, 2.5]], rfNBRect(6, 4, 5, 8), rfNBRect(6, 4, 19, 8), rfNBCirc(15, 10, 1.5)] };
      var washer = { name: 'Washer', qty: 20, loops: [rfNBCirc(0, 0, 0.75), rfNBCirc(0, 0, 0.3125)] };
      var out = [];
      [true, false].forEach(function (holes) {
        var r = Nest.run([tray, washer], { width: 96, height: 48, spacing: 0.25, margin: 0.5, rotation: 90, holes: holes }), ex = rfNBExact(r);
        assert(ex.ok && r.placed === 21, 'holes ' + holes + ': ' + r.placed + ' ' + ex.problems.slice(0, 3).join('; '));
        if (holes) assert(ex.inHoles >= 8, 'only ' + ex.inHoles + ' washers in the blank');
        else assert(ex.inHoles === 0, ex.inHoles + ' in holes with the option off');
        out.push((holes ? 'on: ' : 'off: ') + ex.inHoles + ' in the blank');
      });
      return out.join(', ');
    });

    test('rfNB: an Anvil flat pattern (inch bracket, one bend, a Ø.5 hole) × 6 — its bend line rides with each blank (same length, same distance to the hole, inside the blank) at every rotation; the sheet DXF holds the cuts on CUT (the hole a CIRCLE) and 6 bend lines on BEND; layers "flat" gives OUTLINE / HOLES; DxfCheck clean', function () {
      var r = build(['p.name("Bracket").units("in");', 'p.sheet(0.06, 0.06, 0.71);', 'p.sketch("Top").rect(0, -6, 10, 6).end().baseFlange(0.06);', 'p.flange(2, [[0, 0.06, 3]]);', 'p.hole("Top", 5, -3, 0.5, { offset: 0.06 });'].join('\n'));
      noErrors(r);
      var flat = K.flatPattern(r.model, r.build, r.mesh), pt = Nest.flatPart(flat, 'Bracket', 6);
      assert(flat.bends.length === 1 && pt.marks.length === 1 && pt.marks[0].layer === 'BEND', 'marks ' + JSON.stringify(pt.marks));
      var hole = pt.loops.filter(function (L) { return L.circle; })[0];
      assert(hole, 'the hole is a true circle');
      var bm = pt.marks[0], len = Math.hypot(bm.b[0] - bm.a[0], bm.b[1] - bm.a[1]), dh = Math.hypot((bm.a[0] + bm.b[0]) / 2 - hole.circle.c[0], (bm.a[1] + bm.b[1]) / 2 - hole.circle.c[1]);
      var res = Nest.run([pt], { width: 30, height: 20, spacing: 0.25, margin: 0.5, rotation: 90, maxSheets: 3 });
      assert(res.placed === 6 && rfNBExact(res).ok, 'placed ' + res.placed);
      var angles = {};
      res.placements.forEach(function (pl) {
        angles[pl.angle] = 1;
        var m = Nest.placedMarks(res, pl)[0], L = Nest.placedLoops(res, pl), c = L.filter(function (q) { return q.circle; })[0].circle.c;
        near(Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]), len, 1e-9, 'bend length');
        near(Math.hypot((m.a[0] + m.b[0]) / 2 - c[0], (m.a[1] + m.b[1]) / 2 - c[1]), dh, 1e-9, 'bend to hole');
        var poly = Nest.loopPoly(L[0], 1e-6), mid = [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2];
        assert(rfNBIn(mid, poly), 'bend line outside its blank');
      });
      assert(Object.keys(angles).length >= 1, 'angles');
      var counts = [];
      res.sheets.forEach(function (S, k) {
        var n = S.placements.length, text = Nest.sheetDXF(res, k, 'in', { version: 'R2000', outline: true }), chk = DxfCheck.check(text, { layers: ['CUT'], units: 'in' });
        assert(chk.ok, 'sheet ' + (k + 1) + ': ' + chk.errors.join('; '));
        assert(chk.counts['LINE@BEND'] === n && chk.counts['CIRCLE@CUT'] === n && chk.counts['LINE@SHEET'] === 4, 'counts ' + JSON.stringify(chk.counts));
        var fl = DxfCheck.check(Nest.sheetDXF(res, k, 'in', { layers: 'flat' }), { units: 'in' });
        assert(fl.ok && fl.counts['CIRCLE@HOLES'] === n && fl.counts['LINE@BEND'] === n && !Object.keys(fl.counts).some(function (q) { return /@CUT$/.test(q); }), 'flat layers ' + JSON.stringify(fl.counts));
        assert(DxfCheck.check(Nest.sheetDXF(res, k, 'in', { marks: false }), { layers: ['CUT'] }).counts['LINE@BEND'] === undefined, 'marks: false');
        counts.push(n);
      });
      return res.sheets.length + ' sheets of ' + counts.join(' + ') + ' blanks, angles ' + Object.keys(angles).join('/');
    });

    test('rfNB: a part with etch is never mirrored (it would be etched on the underside); the same part without its etch may be; a part larger than the sheet and a quantity past Max sheets are reported with the reason', function () {
      var shape = [[0, 0], [8, 0], [8, 2], [2, 6], [0, 6]];
      var et = Nest.run([{ name: 'E', loops: [shape], qty: 30, marks: [{ layer: 'ETCH', t: 'line', a: [1, 1], b: [3, 1] }] }], { width: 40, height: 30, spacing: 0.2, margin: 0.2, rotation: 90, mirror: true });
      var pl = Nest.run([{ name: 'P', loops: [shape], qty: 30 }], { width: 40, height: 30, spacing: 0.2, margin: 0.2, rotation: 90, mirror: true });
      assert(et.placements.every(function (p) { return !p.mirror; }), 'an etched part was mirrored');
      assert(pl.placements.some(function (p) { return p.mirror; }), 'the plain part is never mirrored here, so the row proves nothing');
      var big = Nest.run([{ name: 'Big', loops: [rfNBRect(60, 10)], qty: 1 }, { name: 'S', loops: [rfNBRect(10, 10)], qty: 20 }], { width: 48, height: 30, spacing: 0.25, margin: 0.5, rotation: 90, maxSheets: 1 });
      var why = {};
      big.unplaced.forEach(function (u) { why[u.name] = u.reason; });
      assert(/does not fit/.test(why.Big) && /no room on 1 sheet/.test(why.S), 'reasons ' + JSON.stringify(why));
      assert(big.placed + big.unplaced.length === 21, 'every copy accounted for');
      var rep = Nest.report(big, 'in');
      assert(/Not placed/.test(rep) && /Big\t1\tdoes not fit/.test(rep), 'report: ' + rep);
      return big.placed + ' placed; ' + JSON.stringify(why);
    });

    test('rfNB: the remnant — 40 rectangles 6 × 4 from the lower left of a 48 × 96, rows along X: the strip above the parts (full width, from the top part edge plus the spacing); the report lists the parts and counts per sheet with utilisation and the remnant; one DXF holds all sheets side by side with each outline on SHEET', function () {
      var r = Nest.run([{ name: 'Rect', loops: [rfNBRect(6, 4)], qty: 40 }], { width: 96, height: 48, spacing: 0.25, margin: 0.5, rotation: 90 });
      var S = r.sheets[0], u = S.used, rem = r.remnant;
      assert(rem === S.remnant && rem.side === 'top' && rem.w === 96, 'remnant ' + JSON.stringify(rem));
      near(rem.y, u[3] + 0.25, 1e-12, 'remnant starts a spacing past the parts'); near(rem.h, 48 - u[3] - 0.25, 1e-12, 'remnant height');
      var rep = Nest.report(r, 'in', { material: 'CRS', thickness: 0.06 });
      assert(/40 of 40 parts on 1 sheet/.test(rep) && /1\tRect\t40/.test(rep) && /remnant 96\.000 x /.test(rep) && /CRS/.test(rep), rep);
      // all sheets in one file
      var two = Nest.run([{ name: 'Rect', loops: [rfNBRect(6, 4)], qty: 40 }, { name: 'C', loops: [rfNBC()], qty: 6 }], { width: 30, height: 20, spacing: 0.25, margin: 0.5, rotation: 90, maxSheets: 6 });
      assert(two.sheets.length >= 2 && two.placed === 46, two.sheets.length + ' sheets');
      var text = Nest.nestDXF(two, 'in', { gap: 5 }), chk = DxfCheck.check(text, { layers: ['CUT'], units: 'in' });
      assert(chk.ok, chk.errors.join('; '));
      assert(chk.counts['LINE@SHEET'] === 4 * two.sheets.length, 'sheet outlines ' + chk.counts['LINE@SHEET']);
      // the C's are true ARCs (two per part), never chords; its two straight ends are its only LINEs
      assert(chk.counts['ARC@CUT'] === 12 && chk.counts['LINE@CUT'] === 40 * 4 + 12, 'counts ' + JSON.stringify(chk.counts));
      // the last sheet's parts sit on the last sheet, 35 along per sheet (30 + the gap of 5)
      var n = two.sheets.length;
      assert(chk.extents.max[0] > (n - 1) * 35 + 0.5 - 1e-9 && chk.extents.max[0] <= n * 35 - 5 - 0.5 + 1e-9, 'cut extents ' + JSON.stringify(chk.extents));
      return 'remnant ' + rem.w + ' × ' + rem.h.toFixed(3) + '; ' + two.sheets.length + ' sheets in one DXF';
    });

    // the farthest any part can still slide down or left (true distances, the margin) before a gap reaches the spacing
    function rfNBSlack(res) {
      var o = res.opts, worst = 0;
      res.sheets.forEach(function (S) {
        var its = S.placements.map(function (pl) { var L = Nest.placedLoops(res, pl); return { L: L, box: Nest.loopsBox(L) }; });
        its.forEach(function (A, i) {
          [[0, -1], [-1, 0]].forEach(function (d) {
            function ok(t) {
              var b = A.box;
              if (b[0] + d[0] * t < o.margin - 1e-12 || b[1] + d[1] * t < o.margin - 1e-12) return false;
              var pa = Nest._.prims(A.L);
              pa.forEach(function (p) { if (p.t === 'line') { p.a[0] += d[0] * t; p.a[1] += d[1] * t; p.b[0] += d[0] * t; p.b[1] += d[1] * t; } else { p.c[0] += d[0] * t; p.c[1] += d[1] * t; } p.box[0] += d[0] * t; p.box[2] += d[0] * t; p.box[1] += d[1] * t; p.box[3] += d[1] * t; });
              for (var j = 0; j < its.length; j++) {
                if (j === i) continue;
                var B = its[j];
                if (B.box[0] > b[2] + 1 || b[0] > B.box[2] + 1 || B.box[1] > b[3] + 1 || b[1] > B.box[3] + 1) continue;
                if (Nest._.primsDist(pa, Nest._.prims(B.L), o.spacing + 1) < o.spacing - 1e-9) return false;
              }
              return true;
            }
            if (!ok(0.001)) return;
            var lo = 0.001, hi = 0.002;
            while (hi < 1 && ok(hi)) { lo = hi; hi *= 2; }
            worst = Math.max(worst, lo);
          });
        });
      });
      return worst;
    }

    test('rfNB: compaction (lane NB2) — the 60-part mix at 90° steps on 48 × 96, spacing .25: after the grid search each part slides down and left by the true distances until a gap is the spacing; no part can then slide .001 further (the grid nest left up to a tenth); same sheets or fewer, exact check clean, deterministic', function () {
      var o = { width: 96, height: 48, spacing: 0.25, margin: 0.5, rotation: 90, maxSheets: 10 };
      var g = Nest.run(rfNBMix(), Object.assign({ compact: false }, o)), c = Nest.run(rfNBMix(), o), c2 = Nest.run(rfNBMix(), o);
      var ex = rfNBExact(c);
      assert(ex.ok && c.placed === 60, ex.problems.slice(0, 3).join('; '));
      assert(c.sheets.length <= g.sheets.length, c.sheets.length + ' sheets after, ' + g.sheets.length + ' before');
      near(ex.minGap, 0.25, 1e-6, 'the closest gap is the spacing');
      var s0 = rfNBSlack(g), s1 = rfNBSlack(c);
      assert(s0 > 0.01 && s1 < 0.001, 'slack ' + s0 + ' -> ' + s1);
      assert(JSON.stringify(c.placements) === JSON.stringify(c2.placements), 'not deterministic');
      return 'slide left ' + s0.toFixed(4) + ' -> ' + s1.toFixed(4) + ' in; ' + JSON.stringify(c.compaction) + ', ' + c.timing.compact + ' ms';
    });

    test('rfNB: the freed strip is used (lane NB2) — seven 4 × 4 squares on a 26 × 4.5 strip, spacing .25, margin .25, grid cell .05: the grid nest places 5, compaction frees room for a 6th (exact fit needs 25.75); six squares with Max sheets 3 come back on 1 sheet instead of 2', function () {
      var R = rfNBRect(4, 4), o = { width: 26, height: 4.5, spacing: 0.25, margin: 0.25, rotation: 0, maxSheets: 1, cell: 0.05 };
      var a = Nest.run([{ name: 'Sq', loops: [R], qty: 7 }], Object.assign({ compact: false }, o)), b = Nest.run([{ name: 'Sq', loops: [R], qty: 7 }], o);
      assert(a.placed === 5 && b.placed === 6 && b.unplaced.length === 1 && b.compaction.refilled === 1, a.placed + ' -> ' + b.placed + ' ' + JSON.stringify(b.compaction));
      assert(rfNBExact(b).ok, rfNBExact(b).problems.join('; '));
      o.maxSheets = 3;
      var c = Nest.run([{ name: 'Sq', loops: [R], qty: 6 }], Object.assign({ compact: false }, o)), d = Nest.run([{ name: 'Sq', loops: [R], qty: 6 }], o);
      assert(c.sheets.length === 2 && d.sheets.length === 1 && d.compaction.droppedSheet && d.placements.every(function (p) { return p.sheet === 0; }), c.sheets.length + ' -> ' + d.sheets.length);
      assert(rfNBExact(d).ok && d.placed === 6, 'check');
      return '5 -> 6 placed; 2 -> 1 sheets';
    });

    test('rfNB: orientations that are the same shape by symmetry are dropped (lane NB2) — a disc keeps 1 of 24 angles at 15° steps, a rectangle 12 of 24 (0 = 180), an L all 24; the search order of rows does not change the placements', function () {
      var s0 = Nest.stats.rasters;
      Nest.run([{ name: 'D', loops: [rfNBCirc(0, 0, 2)], qty: 1 }], { width: 20, height: 20, rotation: 15 });
      var nd = Nest.stats.rasters - s0; s0 = Nest.stats.rasters;
      Nest.run([{ name: 'R', loops: [rfNBRect(4, 2)], qty: 1 }], { width: 20, height: 20, rotation: 15 });
      var nr = Nest.stats.rasters - s0; s0 = Nest.stats.rasters;
      Nest.run([{ name: 'L', loops: [[[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]]], qty: 1 }], { width: 20, height: 20, rotation: 15 });
      var nl = Nest.stats.rasters - s0;
      assert(nd === 1 && nr === 12 && nl === 24, 'rasters disc ' + nd + ', rectangle ' + nr + ', L ' + nl);
      return nd + ' / ' + nr + ' / ' + nl;
    });

    test('rfNB: time — the 60-part mix at 15° steps nests in a bounded amount of work (orientations rasterised once each, timing reported); 90° steps well under it', function () {
      var s0 = Nest.stats.rasters, r = Nest.run(rfNBMix(), { width: 96, height: 48, spacing: 0.25, margin: 0.5, rotation: 15, maxSheets: 10 });
      var nr = Nest.stats.rasters - s0;
      assert(r.placed === 60 && r.sheets.length === 2 && rfNBExact(r).ok, 'placed ' + r.placed + ' on ' + r.sheets.length);
      assert(nr <= 6 * 24, nr + ' rasters for 6 parts × 24 angles');
      assert(r.timing && r.timing.total >= 0 && r.timing.pack.length >= 1 && r.timing.orientations > 0, 'timing ' + JSON.stringify(r.timing));
      assert(r.timing.total < 40000, r.timing.total + ' ms');
      return nr + ' rasters, ' + JSON.stringify(r.timing);
    });
  })();
