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
//   4b. (lane NB) Part in part first: with Nest in holes on, a copy goes into a hole of a part already placed when one
//      takes it (sheets in order, holes in placing order), before the open sheet is searched.
//   5. Several deterministic strategies run (bottom-left, lowest top edge, each orientation preferred in ties) and the
//      best result is kept: most parts placed, then fewest sheets, then the shortest used length of the last sheet.
//   6. (lane NB2) Compaction: each part slides toward the start corner by exact line / arc distances until a gap is
//      the spacing (opts.compact false skips it); the grids are rebuilt round the moved parts and the parts not placed,
//      then the last sheet's, are offered again (result.compaction { moved, refilled, droppedSheet }). Orientations
//      that are the same shape by symmetry are dropped before rasterising; a strategy that can no longer beat the best
//      stops early; the search tries first the part row that blocked last.
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
//     layer CUT; opts.version 'R12' (default) | 'R2000'; opts.outline: the sheet outline on layer SHEET; opts.layers
//     'flat': OUTLINE / HOLES instead of CUT; the parts' marks on BEND / ETCH / FORM unless opts.marks is false)
// Lane NB (2026-11-15):
//   part input `marks` [{ layer, t: 'line' | 'arc' | 'circle', … }]: open geometry that rides with the part (bend lines,
//     etch, forming marks), never cut, takes no room; a part with ETCH / FORM marks (or noMirror) is never mirrored
//   Nest.flatPart(flat, name, qty) -> part from a Kernel.flatPattern result with its bends (BEND), etch (ETCH), forms
//   Nest.placedMarks(result, placement) -> the part's marks on the sheet (exact)
//   result.unplaced[i].reason ('does not fit on the sheet inside the margin' | 'no room on n sheets (Max sheets)');
//   result.sheets[k].used (exact extents of its parts) and .remnant { x, y, w, h, area, side } (the largest
//   full-width or full-height strip clear of the parts by the spacing); result.remnant = the last sheet's;
//   result.timing { prep, pack: [ms per strategy], total, orientations, copies }
//   Nest.nestDXF(result, units, opts?) -> every sheet side by side in one DXF (opts.gap; outlines on SHEET)
//   Nest.report(result, units, opts?) -> the nest report as text (per sheet: part, count; utilisation, remnant; the
//     parts not placed with the reason); opts { title, material, thickness }
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
      qty: Math.max(0, Math.round(num(input.qty, 1))), priority: num(input.priority, 0), marks: normMarks(input.marks) };
  }
  // lane NB: marks — open geometry that travels with its part but is not cut and takes no room: bend lines (layer
  // BEND), etch (ETCH), forming-tool marks (FORM). [{ layer, t: 'line', a, b } | { layer, t: 'arc', a, b, c, r, ccw,
  // sweep } | { layer, t: 'circle', c, r }]
  function normMarks(list) {
    var out = [];
    (list || []).forEach(function (q) {
      if (!q) return;
      var layer = String(q.layer || 'ETCH');
      if (q.t === 'circle' && q.r > 0) { out.push({ layer: layer, t: 'circle', c: P(q.c), r: +q.r }); return; }
      if (q.t === 'arc' || q.t === 'line') { var s = normSeg(q); if (s) { s.layer = layer; out.push(s); } }
    });
    return out;
  }
  // lane NB: a part from a Kernel.flatPattern result: the blank's loops (outer, holes) plus its bend lines on BEND
  // (a Cross-Break's too), etch on ETCH and forming-tool marks on FORM, so they ride with the blank on the sheet
  function flatPart(flat, name, qty) {
    if (!flat || !flat.loops) return null;
    var marks = [];
    function etchItem(it, layer) {
      if (it.t === 'line') marks.push({ layer: layer, t: 'line', a: it.a, b: it.b });
      else if (it.t === 'circle') marks.push({ layer: layer, t: 'circle', c: it.c, r: it.r });
      else if (it.t === 'arc') {
        var a0 = it.a0 * D2R, a1 = it.a1 * D2R, sw = a1 - a0;
        while (sw <= 0) sw += TAU;
        marks.push({ layer: layer, t: 'arc', c: it.c, r: it.r, a: [it.c[0] + it.r * Math.cos(a0), it.c[1] + it.r * Math.sin(a0)],
          b: [it.c[0] + it.r * Math.cos(a0 + sw), it.c[1] + it.r * Math.sin(a0 + sw)], ccw: true, sweep: sw });
      } else if (it.t === 'poly' && it.pts && it.pts.length > 1) {
        for (var i = 0; i + 1 < it.pts.length; i++) marks.push({ layer: layer, t: 'line', a: it.pts[i], b: it.pts[i + 1] });
        if (it.closed && it.pts.length > 2) marks.push({ layer: layer, t: 'line', a: it.pts[it.pts.length - 1], b: it.pts[0] });
      }
    }
    (flat.bends || []).forEach(function (b) { if (b && b.a && b.b) marks.push({ layer: 'BEND', t: 'line', a: b.a, b: b.b }); });
    (flat.etch || []).forEach(function (it) {
      if (!it) return;
      if (it.crossBreak) { if (it.a && it.b) marks.push({ layer: 'BEND', t: 'line', a: it.a, b: it.b }); return; }
      // a forming tool's cut lines (exportDXFFlat writes them on HOLES) are cuts: HOLES marks go on the cut layer
      if (it.form != null) { if (it.kind === 'mark') etchItem(it, 'FORM'); else if (it.kind === 'cut' && it.t === 'line') etchItem(it, 'HOLES'); return; }
      etchItem(it, 'ETCH');
    });
    return part({ name: name || 'Flat', loops: flat.loops, qty: qty == null ? 1 : qty, marks: marks });
  }
  // a part whose marks are etched or formed on one face must not be mirrored: flipped over, its etch would face down
  // and its forms point the wrong way (the bends just reverse with the blank, so bend lines alone allow it)
  function noMirror(pt) { return !!(pt && (pt.noMirror || (pt.marks || []).some(function (q) { return q.layer === 'ETCH' || q.layer === 'FORM'; }))); }
  function moveMark(q, f, mir) {
    if (q.t === 'circle') return { layer: q.layer, t: 'circle', c: f(q.c), r: q.r };
    if (q.t === 'line') return { layer: q.layer, t: 'line', a: f(q.a), b: f(q.b) };
    return { layer: q.layer, t: 'arc', a: f(q.a), b: f(q.b), c: f(q.c), r: q.r, ccw: mir ? !q.ccw : q.ccw, sweep: mir ? -q.sweep : q.sweep };
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
  var stats = { rasters: 0, rowTests: 0 };
  function raster(polys, box, h, pad, reach, fillHoles) {
    var ox = box[0] - pad, oy = box[1] - pad;
    var pw = Math.max(1, Math.ceil((box[2] - box[0] + 2 * pad) / h)), ph = Math.max(1, Math.ceil((box[3] - box[1] + 2 * pad) / h));
    var m = new Uint8Array(pw * ph), E = [], i, j, k;
    polys.forEach(function (pl, li) {
      if (fillHoles && li > 0) return;
      for (var q = 0; q < pl.length; q++) { var a = pl[q], b = pl[(q + 1) % pl.length]; E.push([a[0] - ox, a[1] - oy, b[0] - ox, b[1] - oy]); }
    });
    // inside: even-odd crossings of the row through the cell centres
    // (lane flatperf: each edge is filed under the rows its y range can cross, so a row only tests those: every edge
    // against every row was rows × edges, a perforated part's 60 000 edges on 1000 rows; same crossings, same order)
    var xs = [], byRow = new Array(ph);
    for (k = 0; k < E.length; k++) {
      var ey0 = Math.min(E[k][1], E[k][3]), ey1 = Math.max(E[k][1], E[k][3]);
      var r0 = Math.max(0, Math.floor(ey0 / h - 0.5) - 1), r1 = Math.min(ph - 1, Math.ceil(ey1 / h - 0.5) + 1);
      for (j = r0; j <= r1; j++) (byRow[j] || (byRow[j] = [])).push(k);
    }
    for (j = 0; j < ph; j++) {
      var yc = (j + 0.5) * h, rk = byRow[j] || [];
      xs.length = 0;
      stats.rowTests += rk.length;
      for (var kk = 0; kk < rk.length; kk++) { var e = E[rk[kk]]; if ((e[1] > yc) !== (e[3] > yc)) xs.push(e[0] + (yc - e[1]) * (e[2] - e[0]) / (e[3] - e[1])); }
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
    return { occ: occ, run: run, NU: NU, NV: NV, list: [], ol: [], full: {}, hint: {}, top: 0, holes: [] };
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
    // lane NB2: the row that blocked the last candidate is tried first (the same row of the part keeps meeting the
    // same neighbour as it slides along); any blocked row gives a valid jump, so the order does not change the answer
    var k0 = O.lastK || 0;
    for (; V <= vMax; V++, U = O.uMin) {
      while (U <= O.uMax) {
        var jump = 0;
        for (var kk = 0; kk < chh && !jump; kk++) {
          var k = kk + k0 < chh ? kk + k0 : kk + k0 - chh;
          var base = (V + k) * NU + U;
          for (var p = rowIdx[k], pe = rowIdx[k + 1]; p < pe; p += 2) {
            var val = run[base + spans[p]];
            if (val < spans[p + 1] - spans[p] + 1) { jump = val > 0 ? val : -val; k0 = O.lastK = k; break; }
          }
        }
        if (!jump) { S.hint[O.id] = { U: U, V: V }; return { U: U, V: V }; }
        U += jump;
      }
    }
    S.hint[O.id] = { U: O.uMin, V: Math.max(V, vMax + 1) };
    return null;
  }
  // lane NB: the bottom-left-most (U, V) where O fits with U in [u0, u1] and V in [v0, v1] (a hole's window; no hint)
  function findIn(S, O, u0, u1, v0, v1) {
    var NU = S.NU, run = S.run, rowIdx = O.c.rowIdx, spans = O.c.spans, chh = O.c.chh;
    for (var V = v0; V <= v1; V++) {
      for (var U = u0; U <= u1;) {
        var jump = 0;
        for (var k = 0; k < chh && !jump; k++) {
          var base = (V + k) * NU + U;
          for (var p = rowIdx[k], pe = rowIdx[k + 1]; p < pe; p += 2) {
            var val = run[base + spans[p]];
            if (val < spans[p + 1] - spans[p] + 1) { jump = val > 0 ? val : -val; break; }
          }
        }
        if (!jump) return { U: U, V: V };
        U += jump;
      }
    }
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
      strategies: Math.max(1, Math.round(num(o.strategies, 5))), compact: o.compact !== false
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
  // lane NB2: the exact shape of loops as text, independent of where they start and which way they run: every piece
  // (line ends, arc centre / radius / ends / sweep, circle) relative to the box corner, rounded, sorted per loop
  function arcMid(s) { var t = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]) + s.sweep / 2; return [s.c[0] + s.r * Math.cos(t), s.c[1] + s.r * Math.sin(t)]; }
  function geoSig(loops, box) {
    function q(v) { var s = (Math.round(v * 1e5) / 1e5).toFixed(5); return s === '-0.00000' ? '0.00000' : s; }
    function pt(p) { return q(p[0] - box[0]) + ',' + q(p[1] - box[1]); }
    function ends(a, b) { var A = pt(a), B = pt(b); return A < B ? A + ';' + B : B + ';' + A; }
    return loops.map(function (L) {
      if (L.circle) return 'c' + pt(L.circle.c) + 'r' + q(L.circle.r);
      return L.segs.map(function (s) { return s.t === 'line' ? 'l' + ends(s.a, s.b) : 'a' + pt(s.c) + 'r' + q(s.r) + 'm' + pt(arcMid(s)) + ':' + ends(s.a, s.b); }).sort().join('|');
    }).sort().join('#');
  }
  function now() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }
  function run(parts, opts) {
    var tStart = now(), timing = { prep: 0, pack: [] };
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
    // lane flatperf: a part whose area is more than the sheet inside its margin fits at no angle, and an orientation
    // whose exact extents cannot keep the margin is dropped before it is rasterised (the same test as below, from the
    // box alone): a detailed part larger than the sheet was rasterised at every angle first (86 s to say "does not fit")
    var usable = Math.max(0, W - 2 * m) * Math.max(0, H - 2 * m);
    var prep = P0.map(function (pt, pi) {
      if (!pt) return null;
      var list = [], seen = {}, seenG = {}, polys = null;
      if (pt.area > usable * (1 + 1e-9)) return { part: pt, index: pi, orients: list };
      (o.mirror && !noMirror(pt) ? [false, true] : [false]).forEach(function (mir) {
        angles.forEach(function (ang) {
          var f = motion(ang, mir, 0, 0);
          var loops = pt.loops.map(function (L) { return moveLoop(L, f, mir); }), box = loopsBox(loops);
          var pw0 = Math.max(1, Math.ceil((box[2] - box[0] + 2 * r) / h)), ph0 = Math.max(1, Math.ceil((box[3] - box[1] + 2 * r) / h));
          var ox0 = Math.max(0, Math.ceil((m - X0 - r) / h - 1e-9)), ox1 = Math.min(NX - pw0, Math.floor((W - m - (box[2] - box[0]) - X0 - r) / h + 1e-9));
          var oy0 = Math.max(0, Math.ceil((m - Y0 - r) / h - 1e-9)), oy1 = Math.min(NY - ph0, Math.floor((H - m - (box[3] - box[1]) - Y0 - r) / h + 1e-9));
          if (ox1 < ox0 || oy1 < oy0) return;
          // lane NB2: an orientation whose exact shape (moved to its box corner) is one already kept is a duplicate by
          // symmetry (a disc at any angle, a rectangle at 180°): not rasterised, not searched
          var gs = geoSig(loops, box);
          if (seenG[gs]) return;
          seenG[gs] = 1;
          stats.rasters++;
          if (!polys) polys = pt.loops.map(function (L) { return loopPoly(L, o.tol); });
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
    // the smallest part's short side: a hole narrower than it plus the spacing on both sides takes no part
    var minDim = prep.reduce(function (s, q) { return q && q.orients.length ? Math.min(s, q.part.size[0], q.part.size[1]) : s; }, Infinity);
    var strategies = [{ crit: 'bl', pref: 0 }, { crit: 'top', pref: 0 }];
    for (var k = 1; k < Math.min(maxO, 4); k++) strategies.push({ crit: 'bl', pref: k });
    // a big job runs fewer strategies (the count depends on the job only, so the result stays deterministic)
    var work = items.length * maxO;
    var nStrat = Math.min(o.strategies, strategies.length, work > 4000 ? 1 : work > 1500 ? 2 : strategies.length);
    var best = null;
    timing.prep = now() - tStart;
    for (var si = 0; si < nStrat; si++) {
      var tp = now(), res = pack(strategies[si], best);
      timing.pack.push(Math.round(now() - tp));
      if (!res) { timing.stopped = (timing.stopped || 0) + 1; continue; }
      res.st = strategies[si];
      res.strategy = strategies[si].crit + (strategies[si].pref ? '+' + strategies[si].pref : '');
      if (!best || better(res, best)) best = res;
    }
    function better(a, b) {
      if (a.placements.length !== b.placements.length) return a.placements.length > b.placements.length;
      if (a.sheets.length !== b.sheets.length) return a.sheets.length < b.sheets.length;
      return a.lastTop < b.lastTop;
    }
    // lane NB2: bound = the best result so far; when it placed every copy, a strategy that already needs more sheets,
    // or as many with its last sheet filled as high, cannot beat it (better() below) and stops (null)
    function lost(sheets, bound) {
      return !!(bound && !bound.unplaced.length && sheets.length &&
        (sheets.length > bound.sheets.length || (sheets.length === bound.sheets.length && sheets[sheets.length - 1].top >= bound.lastTop)));
    }
    function holeRegions(S, pl, pt) {
      if (!o.holes || pt.loops.length < 2) return;
      var f = motion(pl.angle, pl.mirror, pl.x, pl.y);
      for (var li = 1; li < pt.loops.length; li++) {
        var b = loopsBox([moveLoop(pt.loops[li], f, pl.mirror)]);
        if (Math.min(b[2] - b[0], b[3] - b[1]) < minDim + o.spacing * 2 - 1e-9) continue;
        S.holes.push([Math.floor((b[0] - X0) / h) - 1, Math.floor((b[1] - Y0) / h) - 1, Math.ceil((b[2] - X0) / h) + 1, Math.ceil((b[3] - Y0) / h) + 1]);
      }
    }
    // pack(st, bound, list?, state?): list (default every copy) placed in order; state { sheets, placements, unplaced,
    // noFit, noNew } continues an earlier pack (lane NB2: the refill after compaction, noNew: no new sheet)
    function pack(st, bound, list, state) {
      var stopped = false;
      state = state || {};
      var sheets = state.sheets || [], placements = state.placements || [], unplaced = state.unplaced || [], noFit = state.noFit || {};
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
      // lane NB: part-in-part first. With Nest in holes on, a copy goes into a hole of a part already placed when one
      // takes it (sheets in order, holes in placing order, then the lowest row, then column, over the orientations),
      // before the bottom-left search of the open sheet: a bottom-left fill reached a big part's windows only once the
      // rows below them were full, so washers lay beside a tray blank while its windows were cut out as scrap
      function inHole(S, q) {
        var n = q.orients.length;
        for (var hi = 0; hi < S.holes.length; hi++) {
          var g = S.holes[hi], pick = null;
          for (var i = 0; i < n; i++) {
            var O = q.orients[(i + st.pref) % n], pw = O.R.pw, ph = O.R.ph;
            if (g[2] - g[0] + 1 < pw || g[3] - g[1] + 1 < ph) continue;
            var x0 = g[0], x1 = g[2] - pw + 1, y0 = g[1], y1 = g[3] - ph + 1;
            if (T.fx) { var tx = x0; x0 = NX - pw - x1; x1 = NX - pw - tx; }
            if (T.fy) { var ty = y0; y0 = NY - ph - y1; y1 = NY - ph - ty; }
            var u0 = Math.max(O.uMin, T.sw ? y0 : x0), u1 = Math.min(O.uMax, T.sw ? y1 : x1);
            var v0 = Math.max(O.vMin, T.sw ? x0 : y0), v1 = Math.min(O.vMax, T.sw ? x1 : y1);
            if (pick) v1 = Math.min(v1, pick.V);
            var pos = findIn(S, O, u0, u1, v0, v1);
            if (pos && (!pick || pos.V < pick.V || (pos.V === pick.V && pos.U < pick.U))) pick = { O: O, U: pos.U, V: pos.V };
          }
          if (pick) return pick;
        }
        return null;
      }
      (list || items).forEach(function (it) {
        if (stopped || (stopped = lost(sheets, bound))) return;
        var q = prep[it.p], pick = null, s;
        if (o.holes) for (s = 0; s < sheets.length && !pick; s++) if (!sheets[s].full[it.p] && sheets[s].holes.length) pick = inHole(sheets[s], q);
        if (!pick) for (s = 0; s < sheets.length && !pick; s++) {
          if (sheets[s].full[it.p]) continue;
          pick = bestOn(sheets[s], q);
          if (!pick) sheets[s].full[it.p] = 1;
        }
        if (pick) s--;
        else if (!noFit[it.p] && sheets.length < o.maxSheets && !state.noNew) {
          var S = newSheet(NU, NV);
          pick = bestOn(S, q);
          if (pick) { sheets.push(S); s = sheets.length - 1; } else noFit[it.p] = 1;
        }
        if (!pick) {
          // lane NB: why it was left out
          var why = !q.orients.length || noFit[it.p] ? 'does not fit on the sheet inside the margin' + (o.rotation > 0 ? '' : ' (rotation is off)') :
            'no room on ' + o.maxSheets + ' sheet' + (o.maxSheets === 1 ? '' : 's') + ' (Max sheets)';
          unplaced.push({ part: it.p, name: q.part.name, copy: it.copy, reason: why });
          return;
        }
        occupy(sheets[s], pick.O, pick.U, pick.V);
        var O = pick.O, Xc = T.sw ? pick.V : pick.U, Yc = T.sw ? pick.U : pick.V;
        var OX = T.fx ? NX - O.R.pw - Xc : Xc, OY = T.fy ? NY - O.R.ph - Yc : Yc;
        var pl = { part: it.p, name: q.part.name, copy: it.copy, sheet: s, x: X0 + OX * h - O.R.ox, y: Y0 + OY * h - O.R.oy, angle: O.ang, mirror: O.mir };
        placements.push(pl); sheets[s].list.push(pl); sheets[s].ol.push({ pl: pl, O: O });
        holeRegions(sheets[s], pl, q.part);
        if (state.placed) state.placed.push(pl);
      });
      if (stopped || lost(sheets, bound)) return null;
      return { placements: placements, unplaced: unplaced, sheets: sheets, noFit: noFit, lastTop: sheets.length ? sheets[sheets.length - 1].top : 0 };
    }

    // ---------------------------------------------------------------- lane NB2: compaction and refill
    // The grid search leaves each gap up to a few cells over the spacing. Each part, in placing order, slides toward
    // the start corner along the row axis, then the column axis, then the row axis again, until its true distance
    // (lines and arcs, primDist) to a neighbour, or its exact extents to the margin, stop it: conservative advancement
    // (a translation by t changes every distance by at most t, so a move up to the clearance surplus is always
    // allowed), and where a neighbour alongside holds the surplus at 0, trial steps of at most a cell, halved to 1e-6,
    // each checked exactly. The sheets' grids are then rebuilt from the moved parts (each grid at the 2 × 2 cell
    // offsets round its true position, so it stays conservative) and the parts not placed, then the last sheet's
    // parts, are offered to the sheets again; the last sheet is dropped when all of its parts find room elsewhere.
    var vDir = T.sw ? [T.fx ? 1 : -1, 0] : [0, T.fy ? 1 : -1], uDir = T.sw ? [0, T.fy ? 1 : -1] : [T.fx ? 1 : -1, 0];
    function slideItem(it, others, dir) {
      // a spacing of 0 still keeps parts apart by 1e-6: a true distance of 0 cannot tell touching from overlapping
      var sp = Math.max(o.spacing, 1e-6), reachD = sp + 4 * h, trial = h, moved = 0;
      function surplus(dx, dy) {
        var g = Infinity;
        for (var i = 0; i < others.length; i++) {
          var B = others[i], bb = B.box, ab = [it.box[0] + dx, it.box[1] + dy, it.box[2] + dx, it.box[3] + dy];
          if (ab[0] > bb[2] + reachD || bb[0] > ab[2] + reachD || ab[1] > bb[3] + reachD || bb[1] > ab[3] + reachD) continue;
          if (dx || dy) shiftPrims(it.pr, dx, dy);
          var d = primsDist(it.pr, B.pr, reachD);
          if (dx || dy) shiftPrims(it.pr, -dx, -dy);
          g = Math.min(g, d - sp);
          if (g < -1e-12) return g;
        }
        return g;
      }
      var g = null;
      for (var n = 0; n < 400; n++) {
        var lim = dir[0] < 0 ? it.box[0] - m : dir[0] > 0 ? W - m - it.box[2] : dir[1] < 0 ? it.box[1] - m : H - m - it.box[3];
        if (lim < 1e-9) break;
        // a trial step (checked) when it is longer than the surplus, which is always safe; a failed trial halves, down
        // to 1e-5. A part already in contact is tested with the smallest step first, so a blocked part costs one test
        if (g === null) g = Math.min(surplus(0, 0), 4 * h);
        if (n === 0 && g <= 1e-7) { var e0 = Math.min(1e-5, lim); if (surplus(dir[0] * e0, dir[1] * e0) < -1e-12) break; }
        var t = Math.min(trial, lim);
        if (t > g) {
          if (surplus(dir[0] * t, dir[1] * t) < -1e-12) {
            trial /= 2;
            if (g > 1e-7) t = Math.min(g, lim);
            else if (trial < 1e-5) break;
            else continue;
          }
        }
        g = null;
        if (t < 1e-9) break;
        shiftPrims(it.pr, dir[0] * t, dir[1] * t);
        it.box[0] += dir[0] * t; it.box[2] += dir[0] * t; it.box[1] += dir[1] * t; it.box[3] += dir[1] * t;
        it.pl.x += dir[0] * t; it.pl.y += dir[1] * t;
        moved += t;
      }
      return moved;
    }
    function compactItems(S, which) {
      var all = S.ol.map(function (e) {
        var pt = P0[e.pl.part], f = motion(e.pl.angle, e.pl.mirror, e.pl.x, e.pl.y), loops = pt.loops.map(function (L) { return moveLoop(L, f, e.pl.mirror); });
        return { pl: e.pl, pr: prims(loops), box: loopsBox(loops) };
      });
      // passes until nothing moves (at most 80): every part along the row axis, nearest the start corner first, then
      // every part along the column axis the same way (a part ahead has moved before the one behind it is slid, so a
      // gap it leaves is closed in the same pass); ties keep the placing order
      var moved = 0;
      all.forEach(function (it, i) { it.i = i; it.others = all.filter(function (x) { return x !== it; }); });
      var mine = all.filter(function (it) { return !which || which.indexOf(it.pl) >= 0; });
      function lead(it, d) { return d[0] < 0 ? it.box[0] : d[0] > 0 ? -it.box[2] : d[1] < 0 ? it.box[1] : -it.box[3]; }
      // a part is slid again along a direction only when it, or a part near it, has moved since it last stopped there
      var near = 2 * o.spacing + 8 * h + 1;
      all.forEach(function (it) { it.dirty = { v: true, u: true }; });
      function touched(it) {
        all.forEach(function (x) {
          if (x.box[0] > it.box[2] + near || it.box[0] > x.box[2] + near || x.box[1] > it.box[3] + near || it.box[1] > x.box[3] + near) return;
          x.dirty.v = x.dirty.u = true;
        });
      }
      function sweep(d) {
        var mv = 0, key = d === vDir ? 'v' : 'u';
        mine.slice().sort(function (a, b) { return (lead(a, d) - lead(b, d)) || (a.i - b.i); }).forEach(function (it) {
          if (!it.dirty[key]) return;
          it.dirty[key] = false;
          var b0 = it.box.slice(), t = slideItem(it, it.others, d);
          if (t > 0) { var b1 = it.box; it.box = [Math.min(b0[0], b1[0]), Math.min(b0[1], b1[1]), Math.max(b0[2], b1[2]), Math.max(b0[3], b1[3])]; touched(it); it.box = b1; }
          mv += t;
        });
        return mv;
      }
      for (var pass = 0; pass < 80; pass++) {
        var mv = sweep(vDir) + sweep(uDir);
        moved += mv;
        if (mv < 1e-6) break;
      }
      stats.compactPasses = Math.max(stats.compactPasses || 0, pass + 1);
      return moved;
    }
    function rebuildSheet(old) {
      var S = newSheet(NU, NV);
      old.ol.forEach(function (e) {
        var O = e.O, OXf = (e.pl.x + O.R.ox - X0) / h, OYf = (e.pl.y + O.R.oy - Y0) / h;
        var Xc = T.fx ? NX - O.R.pw - OXf : OXf, Yc = T.fy ? NY - O.R.ph - OYf : OYf, Uf = T.sw ? Yc : Xc, Vf = T.sw ? Xc : Yc;
        var us = [Math.floor(Uf + 1e-9)], vs = [Math.floor(Vf + 1e-9)];
        if (Uf - us[0] > 1e-9) us.push(us[0] + 1);
        if (Vf - vs[0] > 1e-9) vs.push(vs[0] + 1);
        us.forEach(function (u) { vs.forEach(function (v) { occupy(S, O, Math.max(0, Math.min(NU - O.c.cw, u)), Math.max(0, Math.min(NV - O.c.chh, v))); }); });
        S.list.push(e.pl); S.ol.push(e);
        holeRegions(S, e.pl, P0[e.pl.part]);
      });
      return S;
    }
    // lane NB2: compaction, then the refill (opts.compact false: the grid nest as it is)
    var tc = now(), compactInfo = null;
    if (o.compact && best.sheets.length) compactInfo = compactAndRefill(best);
    timing.compact = now() - tc;
    function compactAndRefill(res) {
      var info = { moved: 0, refilled: 0, droppedSheet: false };
      res.sheets.forEach(function (S) { info.moved += compactItems(S); });
      var sheets = res.sheets.map(rebuildSheet), placedNew = [];
      var unplacedKeys = {};
      res.unplaced.forEach(function (u) { unplacedKeys[u.part + ':' + u.copy] = u; });
      // 1. the copies not placed (Max sheets reached) onto the sheets there are
      if (res.unplaced.length) {
        var list = res.unplaced.filter(function (u) { return prep[u.part] && prep[u.part].orients.length; }).map(function (u) { return { p: u.part, copy: u.copy }; });
        var st1 = { sheets: sheets, placements: res.placements, unplaced: [], noFit: {}, noNew: true, placed: placedNew };
        pack(res.st, null, list, st1);
        var left = {};
        st1.unplaced.forEach(function (u) { left[u.part + ':' + u.copy] = 1; });
        res.unplaced = res.unplaced.filter(function (u) { return left[u.part + ':' + u.copy] || !(prep[u.part] && prep[u.part].orients.length); });
        info.refilled += placedNew.length;
      }
      // 2. the last sheet's parts onto the sheets before it: the sheet goes when every one of them finds room
      while (sheets.length > 1) {
        var lastS = sheets[sheets.length - 1], front = sheets.slice(0, -1).map(function (S) { return rebuildSheet(S); });
        var moveList = lastS.ol.map(function (e) { return { p: e.pl.part, copy: e.pl.copy }; });
        var tryPl = [], st2 = { sheets: front, placements: [], unplaced: [], noFit: {}, noNew: true, placed: tryPl };
        pack(res.st, null, moveList, st2);
        if (!st2.unplaced.length) {
          var gone = {};
          lastS.list.forEach(function (pl) { gone[pl.part + ':' + pl.copy] = 1; });
          res.placements = res.placements.filter(function (pl) { return !gone[pl.part + ':' + pl.copy]; }).concat(tryPl);
          sheets = front;
          placedNew = placedNew.concat(tryPl);
          info.droppedSheet = true;
          info.refilled += tryPl.length;
        } else break;
      }
      // the parts placed now slide too
      if (placedNew.length) sheets.forEach(function (S) { info.moved += compactItems(S, placedNew); });
      sheets.forEach(function (S, k) { S.list.forEach(function (pl) { pl.sheet = k; }); });
      // placements in sheet order, each sheet's in placing order
      res.placements = [];
      sheets.forEach(function (S) { res.placements = res.placements.concat(S.list); });
      res.sheets = sheets;
      return info;
    }
    var sheetArea = W * H, total = items.length;
    var sheets = best.sheets.map(function (S, i) {
      var a = S.list.reduce(function (s, pl) { return s + P0[pl.part].area; }, 0);
      var sh = { index: i, width: W, height: H, placements: S.list, partArea: a, utilization: sheetArea > 0 ? 100 * a / sheetArea : 0 };
      sh.used = usedBox(sh);
      sh.remnant = remnantOf(sh.used);
      return sh;
    });
    // lane NB: the parts' exact extents on a sheet, and the remnant: the largest full-width or full-height strip of the
    // sheet clear of them (the spacing kept from the parts; the sheet's own edges stay as they are)
    function usedBox(sh) {
      var b = [Infinity, Infinity, -Infinity, -Infinity];
      sh.placements.forEach(function (pl) {
        var f = motion(pl.angle, pl.mirror, pl.x, pl.y), q = loopsBox([moveLoop(P0[pl.part].loops[0], f, pl.mirror)]);
        b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])];
      });
      return b;
    }
    function remnantOf(b) {
      if (!isFinite(b[0])) return { x: 0, y: 0, w: W, h: H, area: W * H, side: 'whole' };
      var sp = o.spacing, c = [
        { side: 'top', x: 0, y: Math.min(H, b[3] + sp), w: W, h: Math.max(0, H - b[3] - sp) },
        { side: 'right', x: Math.min(W, b[2] + sp), y: 0, w: Math.max(0, W - b[2] - sp), h: H },
        { side: 'bottom', x: 0, y: 0, w: W, h: Math.max(0, b[1] - sp) },
        { side: 'left', x: 0, y: 0, w: Math.max(0, b[0] - sp), h: H }];
      c.forEach(function (r) { r.area = r.w * r.h; });
      c.sort(function (p, q) { return q.area - p.area; });
      return c[0];
    }
    var used = sheets.reduce(function (s, q) { return s + q.partArea; }, 0);
    return {
      remnant: sheets.length ? sheets[sheets.length - 1].remnant : null,
      placements: best.placements, sheets: sheets, unplaced: best.unplaced, placed: best.placements.length, total: total,
      utilization: sheets.length ? 100 * used / (sheetArea * sheets.length) : 0, parts: P0, opts: o, cell: h, strategy: best.strategy,
      timing: { prep: Math.round(timing.prep), pack: timing.pack, stopped: timing.stopped || 0, compact: Math.round(timing.compact), total: Math.round(now() - tStart), orientations: nO, copies: items.length },
      compaction: compactInfo
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
  // ------------------------------------------------------------------ exact distances (lane NB2)
  // the pieces of loops as exact primitives with boxes: lines { t: 'line', a, b } and arcs { t: 'arc', c, r, a0, sw }
  // (counterclockwise from angle a0 through sw; a circle is sw = 2π)
  function prims(loops) {
    var out = [];
    loops.forEach(function (L) {
      if (L.circle) { out.push({ t: 'arc', c: L.circle.c.slice(), r: L.circle.r, a0: 0, sw: TAU }); return; }
      L.segs.forEach(function (s) {
        if (s.t === 'line') { out.push({ t: 'line', a: s.a.slice(), b: s.b.slice() }); return; }
        var a0 = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]);
        out.push({ t: 'arc', c: s.c.slice(), r: s.r, a0: s.sweep > 0 ? a0 : a0 + s.sweep, sw: Math.abs(s.sweep) });
      });
    });
    out.forEach(primBox);
    return out;
  }
  function primBox(p) {
    p.box = p.t === 'line' ? [Math.min(p.a[0], p.b[0]), Math.min(p.a[1], p.b[1]), Math.max(p.a[0], p.b[0]), Math.max(p.a[1], p.b[1])] : [p.c[0] - p.r, p.c[1] - p.r, p.c[0] + p.r, p.c[1] + p.r];
  }
  function shiftPrims(list, dx, dy) {
    list.forEach(function (p) {
      if (p.t === 'line') { p.a[0] += dx; p.a[1] += dy; p.b[0] += dx; p.b[1] += dy; } else { p.c[0] += dx; p.c[1] += dy; }
      p.box[0] += dx; p.box[2] += dx; p.box[1] += dy; p.box[3] += dy;
    });
  }
  function onArc(A, ang) { var d = ang - A.a0; d = ((d % TAU) + TAU) % TAU; return A.sw >= TAU - 1e-12 || d <= A.sw + 1e-12; }
  function arcEnds(A) { return [[A.c[0] + A.r * Math.cos(A.a0), A.c[1] + A.r * Math.sin(A.a0)], [A.c[0] + A.r * Math.cos(A.a0 + A.sw), A.c[1] + A.r * Math.sin(A.a0 + A.sw)]]; }
  function ptArc(p, A) {
    if (onArc(A, Math.atan2(p[1] - A.c[1], p[0] - A.c[0]))) return Math.abs(Math.hypot(p[0] - A.c[0], p[1] - A.c[1]) - A.r);
    var e = arcEnds(A);
    return Math.min(Math.hypot(p[0] - e[0][0], p[1] - e[0][1]), Math.hypot(p[0] - e[1][0], p[1] - e[1][1]));
  }
  // the true distance between two primitives (0 when they cross)
  function primDist(P, Q) {
    if (P.t === 'line' && Q.t === 'line') return segDist(P.a, P.b, Q.a, Q.b);
    if (P.t !== 'line' && Q.t === 'line') { var tq = P; P = Q; Q = tq; }
    var best, e, i;
    if (P.t === 'line') {
      best = Math.min(ptArc(P.a, Q), ptArc(P.b, Q));
      e = arcEnds(Q);
      for (i = 0; i < 2; i++) best = Math.min(best, ptSeg(e[i], P.a, P.b));
      var dx = P.b[0] - P.a[0], dy = P.b[1] - P.a[1], fx = P.a[0] - Q.c[0], fy = P.a[1] - Q.c[1], a = dx * dx + dy * dy;
      var bq = 2 * (fx * dx + fy * dy), cq = fx * fx + fy * fy - Q.r * Q.r, disc = bq * bq - 4 * a * cq;
      if (disc >= 0 && a > 0) {
        var sq = Math.sqrt(disc), r1 = (-bq - sq) / (2 * a), r2 = (-bq + sq) / (2 * a);
        if ((r1 >= 0 && r1 <= 1 && onArc(Q, Math.atan2(fy + r1 * dy, fx + r1 * dx))) || (r2 >= 0 && r2 <= 1 && onArc(Q, Math.atan2(fy + r2 * dy, fx + r2 * dx)))) return 0;
      }
      if (a > 0) { var u = Math.max(0, Math.min(1, -(fx * dx + fy * dy) / a)); best = Math.min(best, ptArc([P.a[0] + u * dx, P.a[1] + u * dy], Q)); }
      return best;
    }
    best = Infinity;
    e = arcEnds(P); for (i = 0; i < 2; i++) best = Math.min(best, ptArc(e[i], Q));
    e = arcEnds(Q); for (i = 0; i < 2; i++) best = Math.min(best, ptArc(e[i], P));
    var ddx = Q.c[0] - P.c[0], ddy = Q.c[1] - P.c[1], d = Math.hypot(ddx, ddy);
    if (d > 1e-12) {
      var ux = ddx / d, uy = ddy / d;
      for (var s = 1; s >= -1; s -= 2) {
        if (onArc(P, Math.atan2(s * uy, s * ux))) best = Math.min(best, ptArc([P.c[0] + P.r * s * ux, P.c[1] + P.r * s * uy], Q));
        if (onArc(Q, Math.atan2(-s * uy, -s * ux))) best = Math.min(best, ptArc([Q.c[0] - Q.r * s * ux, Q.c[1] - Q.r * s * uy], P));
      }
      if (d <= P.r + Q.r && d >= Math.abs(P.r - Q.r)) {
        var x = (d * d + P.r * P.r - Q.r * Q.r) / (2 * d), hh = Math.sqrt(Math.max(0, P.r * P.r - x * x));
        for (var k = -1; k <= 1; k += 2) {
          var p = [P.c[0] + ux * x - uy * hh * k, P.c[1] + uy * x + ux * hh * k];
          if (onArc(P, Math.atan2(p[1] - P.c[1], p[0] - P.c[0])) && onArc(Q, Math.atan2(p[1] - Q.c[1], p[0] - Q.c[0]))) return 0;
        }
      }
    } else if (Math.abs(P.r - Q.r) < 1e-15) {
      // concentric equal circles: overlapping arcs or the distance between their ends
      return 0;
    }
    return best;
  }
  // the true distance between two primitive lists, pieces farther than `cap` apart skipped (cap when none is nearer)
  function primsDist(A, B, cap) {
    var g = cap;
    for (var i = 0; i < A.length; i++) {
      var P = A[i];
      for (var j = 0; j < B.length; j++) {
        var Q = B[j];
        if (P.box[0] > Q.box[2] + g || Q.box[0] > P.box[2] + g || P.box[1] > Q.box[3] + g || Q.box[1] > P.box[3] + g) continue;
        var d = primDist(P, Q);
        if (d < g) { g = d; if (g <= 0) return 0; }
      }
    }
    return g;
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
  // lane NB: a placed part's marks (bend / etch / form lines that travel with it), exact, on the sheet
  function placedMarks(result, pl) {
    var pt = result.parts[pl.part], f = motion(pl.angle, pl.mirror, pl.x, pl.y);
    return (pt.marks || []).map(function (q) { return moveMark(q, f, pl.mirror); });
  }
  // the layers of a nest's DXF / sketch: [name, ACI] (the flat-pattern DXF's colours: OUTLINE 7, HOLES 1, BEND 3)
  var LAYER_ACI = { CUT: 7, OUTLINE: 7, HOLES: 1, BEND: 3, ETCH: 3, FORM: 6, SHEET: 8 };
  // sketch entities of one sheet. opts: offset [dx, dy]; outline (default true: the sheet's rectangle as construction);
  // layer (every cut on this one layer, default 'CUT'; null: none) or layers: 'flat' (lane NB: outer loops on OUTLINE
  // and holes on HOLES, as the flat-pattern DXF); marks (default true: each part's bend lines on BEND, etch on ETCH,
  // forming marks on FORM, rotated and moved with their part)
  function sheetEntities(result, k, opts) {
    opts = opts || {};
    var S = result.sheets[k], off = opts.offset || [0, 0], flatL = opts.layers === 'flat', out = [];
    var layer = opts.layer === undefined ? 'CUT' : opts.layer;
    if (!S) return out;
    function sh(p) { return [p[0] + off[0], p[1] + off[1]]; }
    function tag(e, ly) { if (ly) e.layer = ly; out.push(e); }
    function seg(s, ly) {
      var a = sh(s.a), b = sh(s.b);
      if (s.t === 'line') { tag({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, ly); return; }
      var cc2 = sh(s.c), from = s.sweep > 0 ? s.a : s.b;
      var a0 = normDeg(Math.atan2(from[1] - s.c[1], from[0] - s.c[0]) * R2D);
      tag({ t: 'arc', cx: cc2[0], cy: cc2[1], r: s.r, a0: a0, a1: a0 + Math.abs(s.sweep) * R2D }, ly);
    }
    if (opts.outline !== false) {
      var c = [[0, 0], [S.width, 0], [S.width, S.height], [0, S.height]].map(sh);
      for (var i = 0; i < 4; i++) out.push({ t: 'line', x1: c[i][0], y1: c[i][1], x2: c[(i + 1) % 4][0], y2: c[(i + 1) % 4][1], construction: true });
    }
    S.placements.forEach(function (pl) {
      placedLoops(result, pl).forEach(function (L, li) {
        var ly = flatL ? (li ? 'HOLES' : 'OUTLINE') : layer;
        if (L.circle) { var cc = sh(L.circle.c); tag({ t: 'circle', cx: cc[0], cy: cc[1], r: L.circle.r }, ly); return; }
        L.segs.forEach(function (s) { seg(s, ly); });
      });
      if (opts.marks === false) return;
      placedMarks(result, pl).forEach(function (q) {
        var ly = q.layer === 'HOLES' && !flatL ? layer : q.layer;
        if (q.t === 'circle') { var cc = sh(q.c); tag({ t: 'circle', cx: cc[0], cy: cc[1], r: q.r }, ly); return; }
        seg(q, ly);
      });
    });
    return out;
  }
  // the layer table for a list of entities (the layers they use, in a fixed order)
  function layersOf(ents) {
    var have = {}, order = ['CUT', 'OUTLINE', 'HOLES', 'BEND', 'ETCH', 'FORM', 'SHEET'];
    ents.forEach(function (e) { if (e.layer) have[e.layer] = 1; });
    Object.keys(have).forEach(function (n) { if (order.indexOf(n) < 0) order.push(n); });
    return order.filter(function (n) { return have[n]; }).map(function (n) { return { name: n, color: null, aci: LAYER_ACI[n] || 7 }; });
  }
  function dxfEnts(ents) {
    return ents.map(function (e) {
      if (e.construction) { delete e.construction; e.layer = 'SHEET'; }
      if (e.t === 'arc') { var sw = e.a1 - e.a0; e.a0 = normDeg(e.a0); e.a1 = normDeg(e.a0 + sw); if (e.a1 === 0 && sw > 0) e.a1 = 360; }
      return e;
    });
  }
  // DXF of one sheet through the kernel's sketch writer: LINE / ARC / CIRCLE on CUT (sheet coordinates, 0,0 at the
  // sheet's lower-left corner); opts.outline puts the sheet's rectangle on layer SHEET; opts.layers 'flat' writes
  // OUTLINE / HOLES instead of CUT; the parts' marks go on BEND / ETCH / FORM (opts.marks false leaves them out)
  function sheetDXF(result, k, units, opts) {
    opts = opts || {};
    var K = Kern();
    if (!K || !K.exportDXFSketch) throw new Error('The DXF writer (kernel-script.js) is not loaded.');
    var ents = dxfEnts(sheetEntities(result, k, { outline: !!opts.outline, layers: opts.layers, marks: opts.marks }));
    var layers = layersOf(ents);
    if (!layers.length) layers = [{ name: 'CUT', color: null, aci: 7 }];
    return K.exportDXFSketch({ entities: ents, layers: layers }, units === 'mm' ? 'mm' : 'in', { version: opts.version || 'R12' });
  }
  // lane NB: every sheet of a nest in one DXF, side by side along X (sheet k's lower-left corner at k · (width +
  // gap), 0; gap default a tenth of the sheet's longer side), each sheet's outline on SHEET; options as sheetDXF
  function nestDXF(result, units, opts) {
    opts = opts || {};
    var K = Kern();
    if (!K || !K.exportDXFSketch) throw new Error('The DXF writer (kernel-script.js) is not loaded.');
    var o = result.opts, gap = opts.gap != null ? +opts.gap : Math.max(o.width, o.height) * 0.1, ents = [];
    result.sheets.forEach(function (S, k) {
      ents = ents.concat(sheetEntities(result, k, { offset: [k * (S.width + gap), 0], outline: true, layers: opts.layers, marks: opts.marks }));
    });
    ents = dxfEnts(ents);
    return K.exportDXFSketch({ entities: ents, layers: layersOf(ents) }, units === 'mm' ? 'mm' : 'in', { version: opts.version || 'R12' });
  }
  // lane NB: the nest report (what Mastercam's nesting report and SolidWorks' cut list say): per sheet the parts and
  // their counts, the utilisation and the remnant; the parts not placed with the reason. Plain text, one table.
  function report(result, units, opts) {
    opts = opts || {};
    var u = units === 'mm' ? 'mm' : 'in', d = u === 'mm' ? 1 : 3, o = result.opts, L = [];
    function f(x) { return (+x).toFixed(d); }
    L.push('Nest report' + (opts.title ? ': ' + opts.title : ''));
    L.push('Sheet ' + f(o.width) + ' x ' + f(o.height) + ' ' + u + (opts.material ? ', ' + opts.material : '') + (opts.thickness > 0 ? ', ' + f(opts.thickness) + ' ' + u + ' thick' : '') +
      '; part spacing ' + f(o.spacing) + ', sheet margin ' + f(o.margin) + '; rotation ' + (o.rotation > 0 ? (o.rotation >= 180 ? '180 (grain)' : o.rotation + ' deg steps') : 'none') +
      (o.mirror ? ', mirror' : '') + (o.holes ? ', parts in holes' : ''));
    L.push(result.placed + ' of ' + result.total + ' parts on ' + result.sheets.length + ' sheet' + (result.sheets.length === 1 ? '' : 's') + ', ' + result.utilization.toFixed(1) + ' % used');
    L.push('');
    L.push('Sheet\tPart\tQty');
    result.sheets.forEach(function (S) {
      var cnt = {}, names = [];
      S.placements.forEach(function (pl) { if (!cnt[pl.name]) { cnt[pl.name] = 0; names.push(pl.name); } cnt[pl.name]++; });
      names.forEach(function (n) { L.push((S.index + 1) + '\t' + n + '\t' + cnt[n]); });
      var r = S.remnant;
      L.push((S.index + 1) + '\t(sheet total: ' + S.placements.length + ' parts, ' + S.utilization.toFixed(1) + ' % used' +
        (r && r.area > 0 ? '; remnant ' + f(r.w) + ' x ' + f(r.h) + ' at ' + r.side + ')' : '; no remnant)'));
    });
    if (result.unplaced.length) {
      L.push('');
      L.push('Not placed\tPart\tQty\tReason');
      var un = {}, keys = [];
      result.unplaced.forEach(function (x) { var k = x.name + '\t' + (x.reason || ''); if (!un[k]) { un[k] = 0; keys.push(k); } un[k]++; });
      keys.forEach(function (k) { var p = k.split('\t'); L.push('\t' + p[0] + '\t' + un[k] + '\t' + p[1]); });
    }
    return L.join('\r\n') + '\r\n';
  }

  return {
    part: part, partsFromLoops: partsFromLoops, normLoop: normLoop, loopArea: loopArea, loopsBox: loopsBox, loopPoly: loopPoly,
    flatPart: flatPart, placedMarks: placedMarks, nestDXF: nestDXF, report: report,
    run: run, options: options, placedLoops: placedLoops, check: check, sheetEntities: sheetEntities, sheetDXF: sheetDXF,
    _: { raster: raster, canonical: canonical, segDist: segDist, prims: prims, primDist: primDist, primsDist: primsDist },
    stats: stats   // lane flatperf: { rasters, rowTests } counts, for the tests that catch an all-pairs step coming back
  };
})();
if (typeof self !== 'undefined') self.Nest = Nest;
