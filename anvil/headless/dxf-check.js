// headless/dxf-check.js — reads a DXF back and checks it the way a laser / CAM import would: every cut loop closed end
// to end, no zero-length or duplicate entities, circles with real radii, the units header present, no LWPOLYLINE in an
// R12 (AC1009) file, no SPLINE / ELLIPSE in one either (R2000 has both: on a cut layer an open one's ends chain into
// the loops like a LINE's, a closed spline or a full ellipse is a loop of its own). Plain ES5, no DOM: tests/kernel-tests.html loads it with a <script> tag (DxfCheck), the Node runner
// (headless/anvil.js) with require.
//
//   DxfCheck.parse(text)            -> { version, header: { $VAR: value }, entities: [{ type, layer, …geometry }] }
//   DxfCheck.check(text, opts?)     -> { ok, errors: [..], version, insunits, measurement, counts: { 'TYPE@LAYER': n },
//                                        circles: [{ layer, c, r }], loops: [{ layer, kind, closed, n }], extents,
//                                        gap (largest end-point mismatch in a chained loop) }
//   opts: { layers (the cut layers, default ['OUTLINE', 'HOLES']), tol (end-point match, default 1e-5 · (1 + size)),
//           units ('in' | 'mm': $INSUNITS must say so) }
(function (root) {
  'use strict';

  function num(v) { var x = parseFloat(v); return isFinite(x) ? x : 0; }

  // the group code / value pairs of a DXF, values trimmed of the line end only (text keeps its spaces)
  function pairs(text) {
    var L = String(text).split(/\r?\n/), out = [];
    for (var i = 0; i + 1 < L.length; i += 2) out.push([parseInt(L[i], 10), L[i + 1].replace(/\s+$/, '')]);
    return out;
  }

  function parse(text) {
    var P = pairs(text), header = {}, entities = [], section = null, i, cur = null, poly = null;
    function finish() {
      if (!cur) return;
      if (cur.type === 'VERTEX' && poly) { poly.pts.push([cur.g[10] || 0, cur.g[20] || 0]); poly.bulges.push(cur.g[42] || 0); }
      else if (cur.type === 'SEQEND') { if (poly) entities.push(poly); poly = null; }
      else if (cur.type === 'POLYLINE') poly = { type: 'POLYLINE', layer: cur.layer, closed: !!((cur.g[70] || 0) & 1), pts: [], bulges: [] };
      else entities.push(shape(cur));
      cur = null;
    }
    for (i = 0; i < P.length; i++) {
      var c = P[i][0], v = P[i][1];
      if (c === 0 && v.trim() === 'SECTION') { finish(); section = (P[i + 1] && P[i + 1][0] === 2) ? P[i + 1][1].trim() : null; i++; continue; }
      if (c === 0 && v.trim() === 'ENDSEC') { finish(); section = null; continue; }
      if (section === 'HEADER') {
        if (c === 9) { var name = v.trim(), vals = []; while (P[i + 1] && P[i + 1][0] !== 9 && P[i + 1][0] !== 0) { vals.push(P[i + 1]); i++; } header[name] = vals.length === 1 ? vals[0][1].trim() : vals.map(function (q) { return q[1].trim(); }); }
        continue;
      }
      if (section !== 'ENTITIES') continue;
      if (c === 0) { finish(); cur = { type: v.trim(), layer: '0', g: {}, verts: [], bul: [], knots: [] }; continue; }
      if (!cur) continue;
      if (c === 8) cur.layer = v.trim();
      else if (cur.type === 'SPLINE' && c === 10) cur.verts.push([num(v), 0]);
      else if (cur.type === 'SPLINE' && c === 20) { if (cur.verts.length) cur.verts[cur.verts.length - 1][1] = num(v); }
      else if (cur.type === 'SPLINE' && c === 40) cur.knots.push(num(v));
      else if (cur.type === 'SPLINE' && (c === 11 || c === 21 || c === 30 || c === 31 || c === 41)) continue;   // fit points, z, weights
      else if (cur.type === 'LWPOLYLINE' && c === 10) { cur.verts.push([num(v), 0]); cur.bul.push(0); }
      else if (cur.type === 'LWPOLYLINE' && c === 20) cur.verts[cur.verts.length - 1][1] = num(v);
      else if (cur.type === 'LWPOLYLINE' && c === 42) cur.bul[cur.bul.length - 1] = num(v);
      else if (c === 1) cur.g[1] = v;
      else if ((c >= 10 && c <= 59) || (c >= 70 && c <= 79) || c === 90 || c === 230) cur.g[c] = num(v);
    }
    finish();
    var ver = header.$ACADVER;
    return { version: typeof ver === 'string' ? ver : null, header: header, entities: entities };
  }
  function shape(e) {
    var g = e.g;
    switch (e.type) {
      case 'LINE': return { type: 'LINE', layer: e.layer, a: [g[10] || 0, g[20] || 0], b: [g[11] || 0, g[21] || 0] };
      case 'CIRCLE': return { type: 'CIRCLE', layer: e.layer, c: [g[10] || 0, g[20] || 0], r: g[40] || 0 };
      case 'ARC': return { type: 'ARC', layer: e.layer, c: [g[10] || 0, g[20] || 0], r: g[40] || 0, a0: g[50] || 0, a1: g[51] || 0 };
      case 'TEXT': return { type: 'TEXT', layer: e.layer, p: [g[10] || 0, g[20] || 0], h: g[40] || 0, text: g[1] || '' };
      case 'LWPOLYLINE': return { type: 'LWPOLYLINE', layer: e.layer, closed: !!((g[70] || 0) & 1), pts: e.verts, bulges: e.bul };
      case 'SPLINE': return { type: 'SPLINE', layer: e.layer, closed: !!((g[70] || 0) & 1), degree: g[71] != null ? g[71] : 3, knots: e.knots, cps: e.verts };
      // (the minor axis is n × major · ratio: an extrusion of -Z runs the parameter the other way round)
      case 'ELLIPSE': return { type: 'ELLIPSE', layer: e.layer, c: [g[10] || 0, g[20] || 0], major: [g[11] || 0, g[21] || 0], ratio: g[40] || 0,
        t0: g[41] || 0, t1: g[42] != null ? g[42] : 2 * Math.PI, nz: g[230] != null && g[230] < 0 ? -1 : 1 };
    }
    return { type: e.type, layer: e.layer };
  }

  // the end points of an ARC (counterclockwise from a0 to a1, degrees)
  function arcEnds(e) {
    var a0 = e.a0 * Math.PI / 180, a1 = e.a1 * Math.PI / 180;
    return [[e.c[0] + e.r * Math.cos(a0), e.c[1] + e.r * Math.sin(a0)], [e.c[0] + e.r * Math.cos(a1), e.c[1] + e.r * Math.sin(a1)]];
  }
  function sweepDeg(e) { var s = ((e.a1 - e.a0) % 360 + 360) % 360; return s; }
  // a point of an ELLIPSE at parameter t; its sweep (end after start, at most a full turn)
  function ellipsePt(e, t) {
    var M = e.major, N = [-M[1] * e.ratio * e.nz, M[0] * e.ratio * e.nz];
    return [e.c[0] + M[0] * Math.cos(t) + N[0] * Math.sin(t), e.c[1] + M[1] * Math.cos(t) + N[1] * Math.sin(t)];
  }
  function ellipseSweep(e) { var s = e.t1 - e.t0; while (s <= 1e-12) s += 2 * Math.PI; return Math.min(s, 2 * Math.PI); }
  // a point of a SPLINE at parameter u (de Boor, weights ignored), or null when its knots and control points disagree;
  // splineRange: the parameter range [knot p, knot n + 1]
  function splinePt(e, u) {
    var p = e.degree, U = e.knots, P = e.cps, n = P.length - 1;
    if (!(p >= 1) || U.length !== n + p + 2 || n < p) return null;
    var k = p;
    while (k < n && u >= U[k + 1]) k++;
    var d = [];
    for (var j = 0; j <= p; j++) d.push(P[k - p + j].slice());
    for (var r = 1; r <= p; r++) {
      for (var jj = p; jj >= r; jj--) {
        var i = k - p + jj, den = U[i + p - r + 1] - U[i], a = den > 0 ? (u - U[i]) / den : 0;
        d[jj] = [(1 - a) * d[jj - 1][0] + a * d[jj][0], (1 - a) * d[jj - 1][1] + a * d[jj][1]];
      }
    }
    return d[p];
  }
  function splineRange(e) { return [e.knots[e.degree], e.knots[e.cps.length]]; }

  function check(text, opts) {
    opts = opts || {};
    var layers = opts.layers || ['OUTLINE', 'HOLES'], d = parse(text), errors = [], counts = {}, circles = [], loops = [];
    var min = [Infinity, Infinity], max = [-Infinity, -Infinity];
    function grow(q, r) { r = r || 0; min[0] = Math.min(min[0], q[0] - r); min[1] = Math.min(min[1], q[1] - r); max[0] = Math.max(max[0], q[0] + r); max[1] = Math.max(max[1], q[1] + r); }
    function growArc(c, r, a0deg, swDeg) {
      for (var k = 0; k < 4; k++) { var d0 = ((k * 90 - a0deg) % 360 + 360) % 360; if (d0 <= swDeg) grow([c[0] + r * Math.cos(k * Math.PI / 2), c[1] + r * Math.sin(k * Math.PI / 2)]); }
    }
    if (!d.version) errors.push('no $ACADVER in the header');
    var insunits = d.header.$INSUNITS != null ? +d.header.$INSUNITS : null, measurement = d.header.$MEASUREMENT != null ? +d.header.$MEASUREMENT : null;
    if (insunits == null) errors.push('no $INSUNITS in the header');
    if (opts.units && insunits !== (opts.units === 'in' ? 1 : 4)) errors.push('$INSUNITS is ' + insunits + ', expected ' + (opts.units === 'in' ? '1 (inch)' : '4 (mm)'));
    if (opts.units && measurement != null && measurement !== (opts.units === 'in' ? 0 : 1)) errors.push('$MEASUREMENT is ' + measurement + ' for ' + opts.units);
    var cut = [], seen = {};
    d.entities.forEach(function (e) {
      var key = e.type + '@' + e.layer;
      counts[key] = (counts[key] || 0) + 1;
      if ((e.type === 'LWPOLYLINE' || e.type === 'SPLINE' || e.type === 'ELLIPSE') && d.version === 'AC1009') errors.push(e.type + ' in an R12 (AC1009) file');
      // SPLINE / ELLIPSE (R2000): a sound shape on any layer; on a cut layer a full ellipse or a closed spline is a loop,
      // an open one's ends chain with the LINE / ARC entities
      if (e.type === 'SPLINE' || e.type === 'ELLIPSE') {
        var pts2 = [], closed2 = false;
        if (e.type === 'ELLIPSE') {
          var ML = Math.hypot(e.major[0], e.major[1]);
          if (!(ML > 1e-9) || !(e.ratio > 0) || e.ratio > 1 + 1e-9) { errors.push('degenerate ELLIPSE on ' + e.layer + ' (major axis ' + ML + ', ratio ' + e.ratio + ')'); return; }
          var esw = ellipseSweep(e);
          closed2 = esw >= 2 * Math.PI - 1e-9;
          for (var q2 = 0; q2 <= 64; q2++) pts2.push(ellipsePt(e, e.t0 + esw * q2 / 64));
        } else {
          var rg = splineRange(e);
          if (!splinePt(e, rg[0]) || !(rg[1] > rg[0])) { errors.push('SPLINE on ' + e.layer + ' with ' + e.cps.length + ' control points and ' + e.knots.length + ' knots (degree ' + e.degree + ')'); return; }
          for (var q3 = 0; q3 <= 64; q3++) pts2.push(splinePt(e, q3 === 64 ? rg[1] : rg[0] + (rg[1] - rg[0]) * q3 / 64));
          var e0 = pts2[0], e1 = pts2[64];
          closed2 = e.closed || Math.hypot(e1[0] - e0[0], e1[1] - e0[1]) <= 1e-9 * (1 + Math.abs(e0[0]) + Math.abs(e0[1]));
        }
        if (layers.indexOf(e.layer) < 0) return;
        pts2.forEach(function (q) { grow(q); });
        if (closed2) loops.push({ layer: e.layer, kind: e.type.toLowerCase(), closed: true, n: 1 });
        else cut.push({ a: pts2[0], b: pts2[64], layer: e.layer });
        return;
      }
      if (layers.indexOf(e.layer) < 0) return;
      var sig = JSON.stringify([e.type, e.a, e.b, e.c, e.r, e.a0, e.a1, e.pts]);
      if (seen[sig]) errors.push('duplicate ' + e.type + ' on ' + e.layer); seen[sig] = true;
      if (e.type === 'LINE') {
        if (Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) < 1e-9) errors.push('zero-length LINE on ' + e.layer + ' at ' + e.a);
        grow(e.a); grow(e.b); cut.push({ a: e.a, b: e.b, layer: e.layer });
      } else if (e.type === 'ARC') {
        if (!(e.r > 1e-9) || sweepDeg(e) < 1e-9) errors.push('degenerate ARC on ' + e.layer);
        var ends = arcEnds(e);
        grow(ends[0]); grow(ends[1]); growArc(e.c, e.r, e.a0, sweepDeg(e));
        cut.push({ a: ends[0], b: ends[1], layer: e.layer });
      } else if (e.type === 'CIRCLE') {
        if (!(e.r > 1e-9)) errors.push('CIRCLE with radius ' + e.r + ' on ' + e.layer);
        circles.push({ layer: e.layer, c: e.c, r: e.r }); grow(e.c, e.r);
        loops.push({ layer: e.layer, kind: 'circle', closed: true, n: 1 });
      } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
        var pts = e.pts, n = pts.length;
        if (!e.closed) errors.push('open ' + e.type + ' on ' + e.layer);
        if (n < 2) errors.push(e.type + ' with ' + n + ' vertices on ' + e.layer);
        for (var i = 0; i < n; i++) {
          var q = pts[(i + 1) % n];
          if (i + 1 === n && !e.closed) break;
          if (Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]) < 1e-9) errors.push('zero-length segment in a ' + e.type + ' on ' + e.layer + ' at vertex ' + i);
          grow(pts[i]);
          var b = e.bulges[i] || 0;
          if (b) {   // a bulged segment: the arc's centre and sweep from the chord and the bulge
            var mx = (pts[i][0] + q[0]) / 2, my = (pts[i][1] + q[1]) / 2, cl = Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]) / 2;
            var sw = 4 * Math.atan(b), r = cl / Math.sin(Math.abs(sw) / 2), hgt = cl / Math.tan(sw / 2);
            var nx = -(q[1] - pts[i][1]) / (2 * cl), ny = (q[0] - pts[i][0]) / (2 * cl), c = [mx + nx * hgt, my + ny * hgt];
            var aS = Math.atan2(pts[i][1] - c[1], pts[i][0] - c[0]) * 180 / Math.PI;
            if (sw > 0) growArc(c, r, aS, sw * 180 / Math.PI); else growArc(c, r, Math.atan2(q[1] - c[1], q[0] - c[0]) * 180 / Math.PI, -sw * 180 / Math.PI);
          }
        }
        loops.push({ layer: e.layer, kind: e.type.toLowerCase(), closed: e.closed, n: n });
      }
    });
    // LINE / ARC entities: chain them by their end points into loops; each end must meet exactly one other end
    var size = isFinite(min[0]) ? Math.max(max[0] - min[0], max[1] - min[1]) : 1;
    var tol = opts.tol || 1e-5 * (1 + size), gap = 0;
    var ends = [];
    cut.forEach(function (s, i) { ends.push({ p: s.a, s: i }, { p: s.b, s: i }); });
    var used = ends.map(function () { return false; }), mate = [];
    ends.forEach(function (e, i) {
      var hits = [];
      ends.forEach(function (f, j) { if (j !== i && Math.hypot(f.p[0] - e.p[0], f.p[1] - e.p[1]) <= tol) hits.push(j); });
      if (hits.length !== 1) errors.push((hits.length ? hits.length + ' ends meet' : 'a loose end') + ' at (' + e.p[0].toFixed(6) + ', ' + e.p[1].toFixed(6) + ') on ' + cut[e.s].layer);
      mate[i] = hits.length === 1 ? hits[0] : -1;
      if (hits.length === 1) gap = Math.max(gap, Math.hypot(ends[hits[0]].p[0] - e.p[0], ends[hits[0]].p[1] - e.p[1]));
    });
    // walk the chains: segment -> its other end -> the end it meets -> that end's segment
    var segSeen = cut.map(function () { return false; });
    cut.forEach(function (s, i) {
      if (segSeen[i]) return;
      var n = 0, closed = false, at = 2 * i + 1, layer = s.layer;
      segSeen[i] = true; n = 1;
      for (var guard = 0; guard < cut.length + 1; guard++) {
        var m = mate[at];
        if (m < 0) break;
        var si = ends[m].s;
        if (si === i) { closed = true; break; }
        if (segSeen[si]) break;
        segSeen[si] = true; n++;
        at = m % 2 === 0 ? m + 1 : m - 1;
      }
      if (!closed) errors.push('a chain of ' + n + ' LINE / ARC entities on ' + layer + ' does not close');
      loops.push({ layer: layer, kind: 'chain', closed: closed, n: n });
    });
    var uniq = [];
    errors.forEach(function (e) { if (uniq.indexOf(e) < 0) uniq.push(e); });
    return { ok: !uniq.length, errors: uniq, version: d.version, insunits: insunits, measurement: measurement, counts: counts, circles: circles,
      loops: loops, extents: isFinite(min[0]) ? { min: min, max: max } : null, gap: gap, entities: d.entities.length };
  }

  var api = { parse: parse, check: check };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DxfCheck = api;
})(typeof self !== 'undefined' ? self : this);
