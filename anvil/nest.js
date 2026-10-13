// nest.js — Geometry Nesting (Mastercam's Transform ▸ Geometry Nesting): true-shape nesting of flat parts on sheets.
// No DOM; loaded after the kernel files (index.html) and by the Node runner through tests/kernel-tests.html.
//
// A part is an outer loop plus hole loops of exact lines and arcs, in the dxfLoopCurves form the DXF writer uses:
//   loop = { circle: { c, r } } | { segs: [{ t: 'line', a, b } | { t: 'arc', a, b, c, r, ccw, sweep }] }
// (a plain point list [[x, y], …] is accepted too and fitted back to lines and arcs with Kernel.dxfLoopCurves).
// The geometry stays exact: placements are rigid motions of it. It is polygonised only to test collisions, with a
// stated chord tolerance (opts.tol, the largest distance between a chord and its arc), and that tolerance is added to
// the clearance, so the true shapes keep the spacing.
//
// Algorithm: conservative raster bottom-left fill.
//   1. The sheet is a grid of square cells of side h (opts.cell; default the sheet's longer side / 2000).
//   2. Each orientation of each part (rotation steps × mirror) is rasterised once: a cell is marked when its centre is
//      inside the part (even-odd over the outer loop and the holes, or the outer loop alone when parts may not nest in
//      holes) or when the cell's square comes within spacing / 2 + tol of its chord polygon's boundary (exact
//      square-to-segment distance). Every point within spacing / 2 of the true part then lies in a marked cell, so
//      two parts whose marked cells are disjoint are at least `spacing` apart (exactly, for the true curves). Holes
//      stay free inside the band, so small parts drop into big parts' holes.
//   3. The sheet margin is kept exactly: a part's placements are limited to those whose exact bounding box lies inside
//      the sheet less the margin (the raster may reach into the margin; nothing else lives there).
//   4. Copies go in order of priority, then area (largest first). Each is placed on the first open sheet where it fits
//      (else a new sheet, up to maxSheets), at the bottom-left-most free position over its orientations: rows from the
//      start corner, then columns, in the fill direction (rows along X or along Y). The free-run table (for every cell,
//      the length of the free or occupied run to its right) lets the search jump over occupied stretches.
//   5. Several deterministic strategies run (bottom-left, lowest top edge, each orientation preferred in ties) and the
//      best result is kept: most parts placed, then fewest sheets, then the shortest used length of the last sheet.
//   Results never overlap; Nest.check verifies a result with exact polygon tests (segment distances and containment).
//
// API
//   Nest.part(input) -> { name, loops (outer first, then holes), area, box } | null; input { name, loops, qty, priority }
//   Nest.partsFromLoops(pointLoops, name) -> [part]: closed point loops (a sketch's profile or a DXF's) grouped into
//     parts: every loop that is not inside another (or inside a hole) is an outer loop, the loops right inside it holes
//   Nest.run(parts, opts) -> result; parts [{ name, loops, qty (default 1), priority (default 0: lower goes first) }],
//     opts { width, height, spacing, margin, rotation (step in degrees, 0 = none), mirror, holes (nest in holes),
//     maxSheets, corner ('bl' | 'br' | 'tl' | 'tr'), direction ('x': fill rows along X | 'y': columns along Y), cell, tol }
//     result { placements: [{ part, name, copy, sheet, x, y, angle, mirror }], sheets: [{ index, width, height,
//     placements, partArea, utilization (%) }], unplaced: [{ part, name, copy }], placed, total, utilization, parts,
//     opts, cell, strategy }. A placement maps a part point p to rot(angle°)·(mirror ? (−p.x, p.y) : p) + (x, y).
//   Nest.placedLoops(result, placement) -> the part's loops on the sheet (exact)
//   Nest.check(result, opts?) -> { ok, minGap, problems: [text] } (exact polygon tests; opts.tol polygonisation)
//   Nest.sheetEntities(result, k, opts?) -> sketch entities of sheet k: the parts' lines / arcs / circles (layer
//     opts.layer, default 'CUT') and the sheet outline as construction lines; opts.offset [dx, dy]
//   Nest.sheetDXF(result, k, units, opts?) -> DXF text of sheet k (Kernel.exportDXFSketch: LINE / ARC / CIRCLE on
//     layer CUT; opts.version 'R12' (default) | 'R2000'; opts.outline: the sheet outline on layer SHEET)
var Nest = (function () {
  'use strict';
  var TAU = 2 * Math.PI, D2R = Math.PI / 180, R2D = 180 / Math.PI;
  function Kern() { return typeof Kernel !== 'undefined' ? Kernel : null; }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function dist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
  function P(q) { return [+q[0], +q[1]]; }

  // ------------------------------------------------------------------ loops
  function arcSweep(a, b, c, ccw) {
    var sw = Math.atan2(b[1] - c[1], b[0] - c[0]) - Math.atan2(a[1] - c[1], a[0] - c[0]);
    if (ccw) { while (sw <= 1e-12) sw += TAU; } else { while (sw >= -1e-12) sw -= TAU; }
    return sw;
  }
  function normSeg(s) {
    if (!s) return null;
    if (s.t === 'arc') {
      var a = P(s.a), b = P(s.b), c = P(s.c), ccw = !!s.ccw;
      var sw = isFinite(s.sweep) && Math.abs(s.sweep) > 0 ? +s.sweep : arcSweep(a, b, c, ccw);
      return { t: 'arc', a: a, b: b, c: c, r: s.r > 0 ? +s.r : dist(c, a), ccw: sw > 0, sweep: sw };
    }
    return { t: 'line', a: P(s.a), b: P(s.b) };
  }
  // normLoop(loop) -> { circle } | { segs } | null (see the header for the accepted forms)
  function normLoop(L) {
    if (!L) return null;
    if (L.circle) return L.circle.r > 0 ? { circle: { c: P(L.circle.c), r: +L.circle.r } } : null;
    if (L.t === 'circle') return L.r > 0 ? { circle: { c: P(L.c), r: +L.r } } : null;
    if (L.segs) { var s = L.segs.map(normSeg).filter(Boolean); return s.length >= 2 ? { segs: s } : null; }
    if (Array.isArray(L) && L.length) {
      if (Array.isArray(L[0])) return pointsLoop(L);
      if (L[0] && L[0].t) return normLoop({ segs: L });
    }
    return null;
  }
  // a closed point loop: fitted back to lines and arcs (Kernel.dxfLoopCurves, as the DXF writer does), else lines
  function pointsLoop(pts) {
    var K = Kern(), cv = null;
    if (K && K.dxfLoopCurves) { try { cv = K.dxfLoopCurves(pts); } catch (e) { cv = null; } }
    if (cv) return normLoop(cv);
    var p = pts.filter(function (q) { return q && isFinite(q[0]) && isFinite(q[1]); }).map(P), segs = [];
    if (p.length > 1 && dist(p[0], p[p.length - 1]) < 1e-12) p.pop();
    for (var i = 0; i < p.length; i++) if (dist(p[i], p[(i + 1) % p.length]) > 1e-12) segs.push({ t: 'line', a: p[i], b: p[(i + 1) % p.length] });
    return segs.length >= 3 ? { segs: segs } : null;
  }
  // signed area (counterclockwise positive; a circle counts positive) of a loop: chords plus the arcs' caps
  function loopArea(L) {
    if (L.circle) return Math.PI * L.circle.r * L.circle.r;
    var a = 0;
    L.segs.forEach(function (s) {
      a += (s.a[0] * s.b[1] - s.b[0] * s.a[1]) / 2;
      if (s.t === 'arc') { var th = Math.abs(s.sweep); a += (s.sweep > 0 ? 1 : -1) * s.r * s.r * (th - Math.sin(th)) / 2; }
    });
    return a;
  }
  // exact extents of loops: [minX, minY, maxX, maxY]
  function loopsBox(loops) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    function g(x, y) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
    loops.forEach(function (L) {
      if (L.circle) { g(L.circle.c[0] - L.circle.r, L.circle.c[1] - L.circle.r); g(L.circle.c[0] + L.circle.r, L.circle.c[1] + L.circle.r); return; }
      L.segs.forEach(function (s) {
        g(s.a[0], s.a[1]); g(s.b[0], s.b[1]);
        if (s.t !== 'arc') return;
        var a0 = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]);
        for (var q = 0; q < 4; q++) {
          var th = q * Math.PI / 2, d = s.sweep > 0 ? th - a0 : a0 - th;
          d = ((d % TAU) + TAU) % TAU;
          if (d < Math.abs(s.sweep)) g(s.c[0] + s.r * Math.cos(th), s.c[1] + s.r * Math.sin(th));
        }
      });
    });
    return b;
  }
  // chords per arc of radius r and sweep sw so that no chord is farther than tol from its arc
  function chordCount(r, sw, tol, min) {
    var step = tol >= r ? Math.PI / 2 : 2 * Math.acos(1 - tol / r);
    return Math.max(min || 1, Math.ceil(Math.abs(sw) / Math.max(step, 1e-3) - 1e-9));
  }
  // polygon of a loop (chords within tol of the true curve)
  function loopPoly(L, tol) {
    var out = [], i, n;
    if (L.circle) {
      n = chordCount(L.circle.r, TAU, tol, 12);
      for (i = 0; i < n; i++) out.push([L.circle.c[0] + L.circle.r * Math.cos(TAU * i / n), L.circle.c[1] + L.circle.r * Math.sin(TAU * i / n)]);
      return out;
    }
    L.segs.forEach(function (s) {
      out.push(s.a);
      if (s.t !== 'arc') return;
      var a0 = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]);
      n = chordCount(s.r, s.sweep, tol, 2);
      for (i = 1; i < n; i++) { var t = a0 + s.sweep * i / n; out.push([s.c[0] + s.r * Math.cos(t), s.c[1] + s.r * Math.sin(t)]); }
    });
    return out;
  }
  // a rigid motion (and mirror) of a loop: p -> rot(ang)·(mir ? (-x, y) : (x, y)) + (dx, dy)
  function motion(ang, mir, dx, dy) {
    var c = Math.cos(ang * D2R), s = Math.sin(ang * D2R);
    if (Math.abs(c) < 1e-15) c = 0; if (Math.abs(s) < 1e-15) s = 0;
    return function (p) { var x = mir ? -p[0] : p[0], y = p[1]; return [c * x - s * y + dx, s * x + c * y + dy]; };
  }
  function moveLoop(L, f, mir) {
    if (L.circle) return { circle: { c: f(L.circle.c), r: L.circle.r } };
    return { segs: L.segs.map(function (s) {
      if (s.t === 'line') return { t: 'line', a: f(s.a), b: f(s.b) };
      return { t: 'arc', a: f(s.a), b: f(s.b), c: f(s.c), r: s.r, ccw: mir ? !s.ccw : s.ccw, sweep: mir ? -s.sweep : s.sweep };
    }) };
  }

  // ------------------------------------------------------------------ parts
  function part(input) {
    if (!input) return null;
    var loops = (input.loops || []).map(normLoop).filter(Boolean);
    if (!loops.length) return null;
    var areas = loops.map(function (L) { return Math.abs(loopArea(L)); }), oi = 0;
    areas.forEach(function (a, i) { if (a > areas[oi]) oi = i; });
    var outer = loops[oi], holes = loops.filter(function (L, i) { return i !== oi; });
    var area = areas[oi] - areas.reduce(function (s, a, i) { return i === oi ? s : s + a; }, 0);
    var box = loopsBox(loops);
    return { name: input.name || 'Part', loops: [outer].concat(holes), area: area, box: box, size: [box[2] - box[0], box[3] - box[1]],
      qty: Math.max(0, Math.round(num(input.qty, 1))), priority: num(input.priority, 0) };
  }
  function pointIn(pt, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  // partsFromLoops(pointLoops, name) -> parts: each loop's depth is the number of loops it lies inside; even depths
  // are outer loops, an odd-depth loop is a hole of the even-depth loop right around it
  function partsFromLoops(loops, name) {
    var L = (loops || []).map(function (l) { return Array.isArray(l) ? l : l && l.pts; }).filter(function (l) { return l && l.length >= 3; });
    var area = L.map(function (p) { var a = 0; for (var i = 0; i < p.length; i++) { var q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a / 2); });
    var probe = L.map(function (p) { return [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2]; });
    var parent = L.map(function (p, i) {
      var best = -1;
      L.forEach(function (q, j) { if (j !== i && area[j] > area[i] && pointIn(probe[i], q) && (best < 0 || area[j] < area[best])) best = j; });
      return best;
    });
    var depth = L.map(function (p, i) { var d = 0, k = parent[i]; while (k >= 0 && d < 64) { d++; k = parent[k]; } return d; });
    var out = [], n = 0;
    L.forEach(function (p, i) {
      if (depth[i] % 2) return;
      var loops2 = [p];
      L.forEach(function (q, j) { if (parent[j] === i) loops2.push(q); });
      var pt = part({ name: (name || 'Profile') + (++n > 1 || L.filter(function (x, k) { return depth[k] % 2 === 0; }).length > 1 ? '-' + n : ''), loops: loops2 });
      if (pt) out.push(pt);
    });
    return out;
  }

  // ------------------------------------------------------------------ raster
  // distance from the square of half side e centred at (cx, cy) to the segment s = [x1, y1, x2, y2] (0 when it touches)
  function squareSeg(cx, cy, e, s) {
    var x0 = cx - e, x1 = cx + e, y0 = cy - e, y1 = cy + e, dx = s[2] - s[0], dy = s[3] - s[1], t0 = 0, t1 = 1;
    // Liang–Barsky: does the segment cross the square?
    var p = [-dx, dx, -dy, dy], q = [s[0] - x0, x1 - s[0], s[1] - y0, y1 - s[1]], hit = true;
    for (var k = 0; k < 4 && hit; k++) {
      if (p[k] === 0) { if (q[k] < 0) hit = false; continue; }
      var t = q[k] / p[k];
      if (p[k] < 0) { if (t > t1) hit = false; else if (t > t0) t0 = t; } else { if (t < t0) hit = false; else if (t < t1) t1 = t; }
    }
    if (hit) return 0;
    function ptSq(x, y) { var ax = Math.max(Math.abs(x - cx) - e, 0), ay = Math.max(Math.abs(y - cy) - e, 0); return Math.sqrt(ax * ax + ay * ay); }
    var L2 = dx * dx + dy * dy, best = Math.min(ptSq(s[0], s[1]), ptSq(s[2], s[3]));
    [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(function (c) {
      var u = L2 > 0 ? ((c[0] - s[0]) * dx + (c[1] - s[1]) * dy) / L2 : 0;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      best = Math.min(best, Math.hypot(s[0] + dx * u - c[0], s[1] + dy * u - c[1]));
    });
    return best;
  }
  // raster(polys, box, h, pad, reach, fill) -> { pw, ph, m (Uint8Array), ox, oy }: cell (i, j) covers [ox + i·h,
  // ox + (i+1)·h] × [oy + j·h, …] in the oriented part's coordinates (ox = box min − pad); marked when its centre is
  // inside the polygon or the cell (the whole square) comes within `reach` of its boundary
  function raster(polys, box, h, pad, reach, fillHoles) {
    var ox = box[0] - pad, oy = box[1] - pad;
    var pw = Math.max(1, Math.ceil((box[2] - box[0] + 2 * pad) / h)), ph = Math.max(1, Math.ceil((box[3] - box[1] + 2 * pad) / h));
    var m = new Uint8Array(pw * ph), E = [], i, j, k;
    polys.forEach(function (pl, li) {
      if (fillHoles && li > 0) return;
      for (var q = 0; q < pl.length; q++) { var a = pl[q], b = pl[(q + 1) % pl.length]; E.push([a[0] - ox, a[1] - oy, b[0] - ox, b[1] - oy]); }
    });
    // inside: even-odd crossings of the row through the cell centres
    var xs = [];
    for (j = 0; j < ph; j++) {
      var yc = (j + 0.5) * h;
      xs.length = 0;
      for (k = 0; k < E.length; k++) { var e = E[k]; if ((e[1] > yc) !== (e[3] > yc)) xs.push(e[0] + (yc - e[1]) * (e[2] - e[0]) / (e[3] - e[1])); }
      xs.sort(function (a, b) { return a - b; });
      for (k = 0; k + 1 < xs.length; k += 2) {
        var i0 = Math.max(0, Math.ceil(xs[k] / h - 0.5)), i1 = Math.min(pw - 1, Math.floor(xs[k + 1] / h - 0.5));
        for (i = i0; i <= i1; i++) m[j * pw + i] = 1;
      }
    }
    // the band: cells whose square comes within `reach` of a boundary edge
    var half = h / 2, rr = reach;
    for (k = 0; k < E.length; k++) {
      var s = E[k];
      var ia = Math.max(0, Math.floor((Math.min(s[0], s[2]) - rr) / h) - 1), ib = Math.min(pw - 1, Math.floor((Math.max(s[0], s[2]) + rr) / h) + 1);
      var ja = Math.max(0, Math.floor((Math.min(s[1], s[3]) - rr) / h) - 1), jb = Math.min(ph - 1, Math.floor((Math.max(s[1], s[3]) + rr) / h) + 1);
      for (j = ja; j <= jb; j++) {
        var cy = (j + 0.5) * h, row = j * pw;
        for (i = ia; i <= ib; i++) {
          if (m[row + i]) continue;
          if (squareSeg((i + 0.5) * h, cy, half, s) <= rr) m[row + i] = 1;
        }
      }
    }
    return { pw: pw, ph: ph, m: m, ox: ox, oy: oy };
  }
  // the raster in the search frame (flipped / transposed so the start corner is (0, 0) and rows run along the fill
  // direction), as spans per row: rowIdx[k]..rowIdx[k+1] index pairs [u0, u1] into spans
  function canonical(R, T) {
    var cw = T.sw ? R.ph : R.pw, chh = T.sw ? R.pw : R.ph, cm = new Uint8Array(cw * chh), i, j;
    for (j = 0; j < R.ph; j++) for (i = 0; i < R.pw; i++) {
      if (!R.m[j * R.pw + i]) continue;
      var i2 = T.fx ? R.pw - 1 - i : i, j2 = T.fy ? R.ph - 1 - j : j;
      if (T.sw) cm[i2 * cw + j2] = 1; else cm[j2 * cw + i2] = 1;
    }
    var rowIdx = new Int32Array(chh + 1), spans = [], cells = 0;
    for (j = 0; j < chh; j++) {
      rowIdx[j] = spans.length;
      for (i = 0; i < cw;) {
        if (!cm[j * cw + i]) { i++; continue; }
        var i0 = i;
        while (i < cw && cm[j * cw + i]) i++;
        spans.push(i0, i - 1); cells += i - i0;
      }
    }
    rowIdx[chh] = spans.length;
    return { cw: cw, chh: chh, rowIdx: rowIdx, spans: new Int32Array(spans), cells: cells, sig: cw + 'x' + chh + ':' + spans.join(',') };
  }

  // ------------------------------------------------------------------ sheets (search frame)
  function newSheet(NU, NV) {
    var occ = new Uint8Array(NU * NV), run = new Int16Array(NU * NV);
    for (var v = 0; v < NV; v++) for (var u = 0; u < NU; u++) run[v * NU + u] = NU - u;
    return { occ: occ, run: run, NU: NU, NV: NV, list: [], full: {}, hint: {}, top: 0 };
  }
  function fixRow(S, v) {
    var NU = S.NU, base = v * NU, occ = S.occ, run = S.run, nx = 0;
    for (var u = NU - 1; u >= 0; u--) {
      if (occ[base + u]) run[base + u] = nx = nx < 0 ? nx - 1 : -1;
      else run[base + u] = nx = nx > 0 ? nx + 1 : 1;
    }
  }
  // the bottom-left-most (U, V) where orientation O fits, searching rows up to vEnd; null when none. The sheet only
  // fills up, so every position before the last one found (or the end of the last search) stays blocked: S.hint
  // keeps where each orientation's search may start (rows from the start corner, then columns)
  function findPos(S, O, vEnd) {
    var NU = S.NU, run = S.run, rowIdx = O.c.rowIdx, spans = O.c.spans, chh = O.c.chh;
    var vMax = Math.min(O.vMax, vEnd), h = S.hint[O.id], V = h ? h.V : O.vMin, U = h ? h.U : O.uMin;
    for (; V <= vMax; V++, U = O.uMin) {
      while (U <= O.uMax) {
        var jump = 0;
        for (var k = 0; k < chh && !jump; k++) {
          var base = (V + k) * NU + U;
          for (var p = rowIdx[k], pe = rowIdx[k + 1]; p < pe; p += 2) {
            var val = run[base + spans[p]];
            if (val < spans[p + 1] - spans[p] + 1) { jump = val > 0 ? val : -val; break; }
          }
        }
        if (!jump) { S.hint[O.id] = { U: U, V: V }; return { U: U, V: V }; }
        U += jump;
      }
    }
    S.hint[O.id] = { U: O.uMin, V: Math.max(V, vMax + 1) };
    return null;
  }
  function occupy(S, O, U, V) {
    var NU = S.NU, rowIdx = O.c.rowIdx, spans = O.c.spans;
    for (var k = 0; k < O.c.chh; k++) {
      var base = (V + k) * NU + U;
      for (var p = rowIdx[k]; p < rowIdx[k + 1]; p += 2) for (var u = spans[p]; u <= spans[p + 1]; u++) S.occ[base + u] = 1;
      fixRow(S, V + k);
    }
    S.top = Math.max(S.top, V + O.c.chh);
  }

  // ------------------------------------------------------------------ run
  function options(o) {
    o = o || {};
    var W = num(o.width, 96), H = num(o.height, 48);
    var out = {
      width: W, height: H, spacing: Math.max(0, num(o.spacing, 0)), margin: Math.max(0, num(o.margin, 0)),
      rotation: Math.max(0, num(o.rotation, 90)), mirror: !!o.mirror, holes: o.holes !== false,
      maxSheets: Math.max(1, Math.round(num(o.maxSheets, 10))),
      corner: /^(bl|br|tl|tr)$/.test(o.corner) ? o.corner : 'bl', direction: o.direction === 'y' ? 'y' : 'x',
      strategies: Math.max(1, Math.round(num(o.strategies, 5)))
    };
    var big = Math.max(W, H);
    out.tol = num(o.tol, 0) > 0 ? +o.tol : big * 1e-5;
    var h = num(o.cell, 0) > 0 ? +o.cell : big / 2000;
    // the free-run table is 16 bit: at most 30000 cells along a side
    out.cell = Math.max(h, (big + 2 * out.spacing + 8 * h) / 30000);
    return out;
  }
  function angleList(step) {
    if (!(step > 1e-9)) return [0];
    var out = [];
    for (var k = 0; k * step < 360 - 1e-9 && out.length < 360; k++) out.push(Math.round(k * step * 1e9) / 1e9);
    return out;
  }
  function run(parts, opts) {
    var o = options(opts), h = o.cell, W = o.width, H = o.height, m = o.margin;
    // reach: a cell within spacing / 2 + tol of a part's chord polygon may hold its true shape's clearance zone;
    // r: the raster's margin around a part's extents (the farthest a marked cell reaches, plus a cell)
    var reach = o.spacing / 2 + o.tol + 1e-9, r = reach + 2 * h;
    var pad = r + 2 * h, X0 = -pad, Y0 = -pad;
    var NX = Math.ceil((W + 2 * pad) / h) + 1, NY = Math.ceil((H + 2 * pad) / h) + 1;
    var T = { fx: o.corner === 'br' || o.corner === 'tr', fy: o.corner === 'tl' || o.corner === 'tr', sw: o.direction === 'y' };
    var NU = T.sw ? NY : NX, NV = T.sw ? NX : NY;
    var P0 = (parts || []).map(function (p) { return p && p.loops && p.loops[0] && p.area != null && p.box ? p : part(p); });
    var angles = angleList(o.rotation), nO = 0;
    // the orientations of each part, rasterised once
    var prep = P0.map(function (pt, pi) {
      if (!pt) return null;
      var polys = pt.loops.map(function (L) { return loopPoly(L, o.tol); }), list = [], seen = {};
      (o.mirror ? [false, true] : [false]).forEach(function (mir) {
        angles.forEach(function (ang) {
          var f = motion(ang, mir, 0, 0);
          var loops = pt.loops.map(function (L) { return moveLoop(L, f, mir); }), box = loopsBox(loops);
          var R = raster(polys.map(function (pl) { return pl.map(f); }), box, h, r, reach, !o.holes);
          var c = canonical(R, T);
          if (seen[c.sig]) return;
          // placements whose exact extents keep the margin: OX in [oxMin, oxMax] (the raster's cell offset)
          var oxMin = Math.ceil((m - X0 - r) / h - 1e-9), oxMax = Math.floor((W - m - (box[2] - box[0]) - X0 - r) / h + 1e-9);
          var oyMin = Math.ceil((m - Y0 - r) / h - 1e-9), oyMax = Math.floor((H - m - (box[3] - box[1]) - Y0 - r) / h + 1e-9);
          oxMin = Math.max(0, oxMin); oyMin = Math.max(0, oyMin); oxMax = Math.min(NX - R.pw, oxMax); oyMax = Math.min(NY - R.ph, oyMax);
          if (oxMax < oxMin || oyMax < oyMin) return;
          seen[c.sig] = 1;
          var xr = T.fx ? [NX - R.pw - oxMax, NX - R.pw - oxMin] : [oxMin, oxMax];
          var yr = T.fy ? [NY - R.ph - oyMax, NY - R.ph - oyMin] : [oyMin, oyMax];
          list.push({ id: nO++, ang: ang, mir: mir, R: R, c: c, uMin: T.sw ? yr[0] : xr[0], uMax: T.sw ? yr[1] : xr[1], vMin: T.sw ? xr[0] : yr[0], vMax: T.sw ? xr[1] : yr[1] });
        });
      });
      return { part: pt, index: pi, orients: list };
    });
    // the copies in placing order: priority, then area (largest first), then the order given
    var items = [];
    prep.forEach(function (q) { if (q) for (var c = 0; c < q.part.qty; c++) items.push({ p: q.index, copy: c }); });
    items.sort(function (a, b) {
      var A = P0[a.p], B = P0[b.p];
      return (A.priority - B.priority) || (B.area - A.area) || (a.p - b.p) || (a.copy - b.copy);
    });
    var maxO = prep.reduce(function (s, q) { return Math.max(s, q ? q.orients.length : 0); }, 1);
    var strategies = [{ crit: 'bl', pref: 0 }, { crit: 'top', pref: 0 }];
    for (var k = 1; k < Math.min(maxO, 4); k++) strategies.push({ crit: 'bl', pref: k });
    // a big job runs fewer strategies (the count depends on the job only, so the result stays deterministic)
    var work = items.length * maxO;
    var nStrat = Math.min(o.strategies, strategies.length, work > 4000 ? 1 : work > 1500 ? 2 : strategies.length);
    var best = null;
    for (var si = 0; si < nStrat; si++) {
      var res = pack(strategies[si]);
      res.strategy = strategies[si].crit + (strategies[si].pref ? '+' + strategies[si].pref : '');
      if (!best || better(res, best)) best = res;
    }
    function better(a, b) {
      if (a.placements.length !== b.placements.length) return a.placements.length > b.placements.length;
      if (a.sheets.length !== b.sheets.length) return a.sheets.length < b.sheets.length;
      return a.lastTop < b.lastTop;
    }
    function pack(st) {
      var sheets = [], placements = [], unplaced = [], noFit = {};
      function bestOn(S, q) {
        var n = q.orients.length, pick = null;
        for (var i = 0; i < n; i++) {
          var O = q.orients[(i + st.pref) % n], vEnd;
          if (!pick) vEnd = Infinity;
          else vEnd = st.crit === 'top' ? pick.key - O.c.chh : pick.V;
          var pos = findPos(S, O, vEnd);
          if (!pos) continue;
          var key = st.crit === 'top' ? pos.V + O.c.chh : pos.V;
          if (!pick || key < pick.key || (key === pick.key && pos.U < pick.U)) pick = { O: O, U: pos.U, V: pos.V, key: key };
        }
        return pick;
      }
      items.forEach(function (it) {
        var q = prep[it.p], pick = null, s;
        for (s = 0; s < sheets.length && !pick; s++) {
          if (sheets[s].full[it.p]) continue;
          pick = bestOn(sheets[s], q);
          if (!pick) sheets[s].full[it.p] = 1;
        }
        if (pick) s--;
        else if (!noFit[it.p] && sheets.length < o.maxSheets) {
          var S = newSheet(NU, NV);
          pick = bestOn(S, q);
          if (pick) { sheets.push(S); s = sheets.length - 1; } else noFit[it.p] = 1;
        }
        if (!pick) { unplaced.push({ part: it.p, name: q.part.name, copy: it.copy }); return; }
        occupy(sheets[s], pick.O, pick.U, pick.V);
        var O = pick.O, Xc = T.sw ? pick.V : pick.U, Yc = T.sw ? pick.U : pick.V;
        var OX = T.fx ? NX - O.R.pw - Xc : Xc, OY = T.fy ? NY - O.R.ph - Yc : Yc;
        var pl = { part: it.p, name: q.part.name, copy: it.copy, sheet: s, x: X0 + OX * h - O.R.ox, y: Y0 + OY * h - O.R.oy, angle: O.ang, mirror: O.mir };
        placements.push(pl); sheets[s].list.push(pl);
      });
      return { placements: placements, unplaced: unplaced, sheets: sheets, lastTop: sheets.length ? sheets[sheets.length - 1].top : 0 };
    }
    var sheetArea = W * H, total = items.length;
    var sheets = best.sheets.map(function (S, i) {
      var a = S.list.reduce(function (s, pl) { return s + P0[pl.part].area; }, 0);
      return { index: i, width: W, height: H, placements: S.list, partArea: a, utilization: sheetArea > 0 ? 100 * a / sheetArea : 0 };
    });
    var used = sheets.reduce(function (s, q) { return s + q.partArea; }, 0);
    return {
      placements: best.placements, sheets: sheets, unplaced: best.unplaced, placed: best.placements.length, total: total,
      utilization: sheets.length ? 100 * used / (sheetArea * sheets.length) : 0, parts: P0, opts: o, cell: h, strategy: best.strategy
    };
  }

  // ------------------------------------------------------------------ results
  function placedLoops(result, pl) {
    var pt = result.parts[pl.part], f = motion(pl.angle, pl.mirror, pl.x, pl.y);
    return pt.loops.map(function (L) { return moveLoop(L, f, pl.mirror); });
  }
  // segment–segment distance (0 when they cross)
  function segDist(a, b, c, d) {
    function orient(p, q, r) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); }
    var d1 = orient(c, d, a), d2 = orient(c, d, b), d3 = orient(a, b, c), d4 = orient(a, b, d);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
    return Math.min(ptSeg(a, c, d), ptSeg(b, c, d), ptSeg(c, a, b), ptSeg(d, a, b));
  }
  function ptSeg(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]);
  }
  function inMaterial(p, polys) {
    if (!pointIn(p, polys[0])) return false;
    for (var i = 1; i < polys.length; i++) if (pointIn(p, polys[i])) return false;
    return true;
  }
  // check(result, opts?) -> { ok, minGap, problems }: every pair of parts on a sheet at least the spacing apart (no
  // boundary closer, neither inside the other's material) and every part inside the sheet less the margin
  function check(result, opts) {
    opts = opts || {};
    var o = result.opts, tol = opts.tol || Math.min(o.tol, 1e-4 * Math.max(o.width, o.height)), eps = opts.eps != null ? opts.eps : 1e-7 * Math.max(o.width, o.height);
    var problems = [], minGap = Infinity;
    result.sheets.forEach(function (S) {
      var items = S.placements.map(function (pl) {
        var loops = placedLoops(result, pl), polys = loops.map(function (L) { return loopPoly(L, tol); });
        return { pl: pl, box: loopsBox(loops), polys: polys };
      });
      items.forEach(function (it) {
        var b = it.box;
        if (b[0] < o.margin - eps || b[1] < o.margin - eps || b[2] > o.width - o.margin + eps || b[3] > o.height - o.margin + eps)
          problems.push(it.pl.name + ' #' + (it.pl.copy + 1) + ' on sheet ' + (S.index + 1) + ' is outside the sheet less the margin');
      });
      for (var i = 0; i < items.length; i++) for (var j = i + 1; j < items.length; j++) {
        // pairs whose boxes are farther apart than the spacing plus a few cells cannot be the closest pair
        var A = items[i], B = items[j], sp = o.spacing, near = sp + 4 * result.cell;
        if (A.box[0] > B.box[2] + near || B.box[0] > A.box[2] + near || A.box[1] > B.box[3] + near || B.box[1] > A.box[3] + near) continue;
        var g = Infinity;
        if (inMaterial(A.polys[0][0], B.polys) || inMaterial(B.polys[0][0], A.polys)) g = 0;
        for (var a = 0; a < A.polys.length && g > 0; a++) for (var b2 = 0; b2 < B.polys.length && g > 0; b2++) {
          var pa = A.polys[a], pb = B.polys[b2];
          for (var x = 0; x < pa.length && g > 0; x++) {
            var a1 = pa[x], a2 = pa[(x + 1) % pa.length];
            var bx0 = Math.min(a1[0], a2[0]) - sp - g, bx1 = Math.max(a1[0], a2[0]) + sp + g;
            for (var y = 0; y < pb.length; y++) {
              var b1 = pb[y], bb = pb[(y + 1) % pb.length];
              if (isFinite(g) && ((b1[0] < bx0 && bb[0] < bx0) || (b1[0] > bx1 && bb[0] > bx1))) continue;
              var dd = segDist(a1, a2, b1, bb);
              if (dd < g) { g = dd; if (g === 0) break; }
            }
          }
        }
        minGap = Math.min(minGap, g);
        if (g < sp - Math.max(eps, 2 * tol)) problems.push(A.pl.name + ' #' + (A.pl.copy + 1) + ' and ' + B.pl.name + ' #' + (B.pl.copy + 1) + ' on sheet ' + (S.index + 1) + (g === 0 ? ' overlap' : ' are ' + g.toFixed(5) + ' apart'));
      }
    });
    return { ok: !problems.length, minGap: minGap, problems: problems };
  }
  function normDeg(a) { a = a % 360; if (a < 0) a += 360; return a >= 360 - 1e-12 ? 0 : a; }
  // sketch entities of one sheet
  function sheetEntities(result, k, opts) {
    opts = opts || {};
    var S = result.sheets[k], off = opts.offset || [0, 0], layer = opts.layer === undefined ? 'CUT' : opts.layer, out = [];
    if (!S) return out;
    function sh(p) { return [p[0] + off[0], p[1] + off[1]]; }
    function tag(e) { if (layer) e.layer = layer; out.push(e); }
    if (opts.outline !== false) {
      var c = [[0, 0], [S.width, 0], [S.width, S.height], [0, S.height]].map(sh);
      for (var i = 0; i < 4; i++) out.push({ t: 'line', x1: c[i][0], y1: c[i][1], x2: c[(i + 1) % 4][0], y2: c[(i + 1) % 4][1], construction: true });
    }
    S.placements.forEach(function (pl) {
      placedLoops(result, pl).forEach(function (L) {
        if (L.circle) { var cc = sh(L.circle.c); tag({ t: 'circle', cx: cc[0], cy: cc[1], r: L.circle.r }); return; }
        L.segs.forEach(function (s) {
          var a = sh(s.a), b = sh(s.b);
          if (s.t === 'line') { tag({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }); return; }
          var cc2 = sh(s.c), from = s.sweep > 0 ? s.a : s.b;
          var a0 = normDeg(Math.atan2(from[1] - s.c[1], from[0] - s.c[0]) * R2D);
          tag({ t: 'arc', cx: cc2[0], cy: cc2[1], r: s.r, a0: a0, a1: a0 + Math.abs(s.sweep) * R2D });
        });
      });
    });
    return out;
  }
  // DXF of one sheet through the kernel's sketch writer: LINE / ARC / CIRCLE on CUT (sheet coordinates, 0,0 at the
  // sheet's lower-left corner); opts.outline puts the sheet's rectangle on layer SHEET
  function sheetDXF(result, k, units, opts) {
    opts = opts || {};
    var K = Kern();
    if (!K || !K.exportDXFSketch) throw new Error('The DXF writer (kernel-script.js) is not loaded.');
    var ents = sheetEntities(result, k, { outline: !!opts.outline }).map(function (e) {
      if (e.construction) { delete e.construction; e.layer = 'SHEET'; }
      if (e.t === 'arc') { var sw = e.a1 - e.a0; e.a0 = normDeg(e.a0); e.a1 = normDeg(e.a0 + sw); if (e.a1 === 0 && sw > 0) e.a1 = 360; }
      return e;
    });
    var layers = [{ name: 'CUT', color: null, aci: 7 }];
    if (opts.outline) layers.push({ name: 'SHEET', color: null, aci: 8 });
    return K.exportDXFSketch({ entities: ents, layers: layers }, units === 'mm' ? 'mm' : 'in', { version: opts.version || 'R12' });
  }

  return {
    part: part, partsFromLoops: partsFromLoops, normLoop: normLoop, loopArea: loopArea, loopsBox: loopsBox, loopPoly: loopPoly,
    run: run, options: options, placedLoops: placedLoops, check: check, sheetEntities: sheetEntities, sheetDXF: sheetDXF,
    _: { raster: raster, canonical: canonical, segDist: segDist }
  };
})();
if (typeof self !== 'undefined') self.Nest = Nest;
