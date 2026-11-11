// headless/dxf-check.js — reads a DXF back and checks it the way a laser / CAM import would: every cut loop closed end
// to end, no zero-length or duplicate entities, circles with real radii, the units header present, no LWPOLYLINE in an
// R12 (AC1009) file, no SPLINE / ELLIPSE in one either (R2000 has both: on a cut layer an open one's ends chain into
// the loops like a LINE's, a closed spline or a full ellipse is a loop of its own). R2000 DIMENSION entities (rfT: a
// drawing's dimensions) must name an anonymous block of the BLOCKS section that holds their drawn geometry, and a
// dimension style of the DIMSTYLE table. AZ: an INSERT must name a BLOCK of the BLOCKS section that holds something;
// its block's geometry (base point, scale, rotation, a mirror; nested INSERTs too) is checked where the INSERT puts it,
// as a CAM import explodes it (its LINE / ARC ends chain with the rest, its circles count as holes). Plain ES5, no DOM: tests/kernel-tests.html loads it with a <script> tag (DxfCheck), the Node runner
// (headless/anvil.js) with require.
//
//   DxfCheck.parse(text)            -> { version, header: { $VAR: value }, entities: [{ type, layer, …geometry }],
//                                        blocks: { name: [entities] }, bases: { name: [x, y] }, dimstyles: [names] }
//   DxfCheck.check(text, opts?)     -> { ok, errors: [..], version, insunits, measurement, counts: { 'TYPE@LAYER': n },
//                                        circles: [{ layer, c, r }], loops: [{ layer, kind, closed, n }], extents,
//                                        gap (largest end-point mismatch in a chained loop), dimensions: [{ layer,
//                                        block, kind, text, value, entities (in its block) }], inserts: [{ layer,
//                                        block, at, scale, rotation }] }
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

  // (rfAG) a HATCH's own group codes: 91 the number of boundary paths, then per path 92 (type flags), 93 (vertices),
  // 10 / 20 each vertex (polyline paths; edge paths, 72 edge types, are kept as their points too), 97; then 75, 76,
  // 98 seed points with 10 / 20 each. Returns true when the pair was taken.
  function hatchCode(cur, c, v) {
    var h = cur.h || (cur.h = { n: null, paths: [], seeds: [], state: 'head' });
    if (c === 91) { h.n = parseInt(v, 10); h.state = 'paths'; return true; }
    if (c === 92 && h.state === 'paths') { h.paths.push({ flag: parseInt(v, 10), count: null, pts: [], sources: 0 }); return true; }
    var P = h.paths[h.paths.length - 1];
    if (h.state === 'paths' && P) {
      if (c === 93) { P.count = parseInt(v, 10); return true; }
      if (c === 10) { P.pts.push([num(v), 0]); return true; }
      if (c === 20) { if (P.pts.length) P.pts[P.pts.length - 1][1] = num(v); return true; }
      if (c === 97) { P.sources = parseInt(v, 10); return true; }
      if (c === 72 || c === 73 || c === 42) { P['g' + c] = num(v); return true; }
    }
    if (c === 75) { h.state = 'style'; return false; }
    if (c === 98) { h.state = 'seeds'; h.nSeeds = parseInt(v, 10); return true; }
    if (h.state === 'seeds' && c === 10) { h.seeds.push([num(v), 0]); return true; }
    if (h.state === 'seeds' && c === 20) { if (h.seeds.length) h.seeds[h.seeds.length - 1][1] = num(v); return true; }
    return false;
  }
  function parse(text) {
    var P = pairs(text), header = {}, entities = [], section = null, i, cur = null, poly = null, blocks = {}, bases = {}, block = null, dimstyles = [], table = null;
    function finish() {
      if (!cur) return;
      var into = section === 'BLOCKS' ? (block ? blocks[block] : null) : entities;
      if (cur.type === 'BLOCK') { block = cur.s[2] || ''; blocks[block] = blocks[block] || []; bases[block] = [cur.g[10] || 0, cur.g[20] || 0]; cur = null; return; }
      if (cur.type === 'ENDBLK') { block = null; cur = null; return; }
      if (!into) { cur = null; return; }
      if (cur.type === 'VERTEX' && poly) { poly.pts.push([cur.g[10] || 0, cur.g[20] || 0]); poly.bulges.push(cur.g[42] || 0); }
      else if (cur.type === 'SEQEND') { if (poly) into.push(poly); poly = null; }
      else if (cur.type === 'POLYLINE') poly = { type: 'POLYLINE', layer: cur.layer, closed: !!((cur.g[70] || 0) & 1), pts: [], bulges: [] };
      else into.push(shape(cur));
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
      if (section === 'TABLES') {
        if (c === 0) table = v.trim() === 'DIMSTYLE' ? 'DIMSTYLE' : v.trim() === 'TABLE' || v.trim() === 'ENDTAB' ? null : table;
        else if (c === 2 && table === 'DIMSTYLE') dimstyles.push(v.trim());
        continue;
      }
      if (section !== 'ENTITIES' && section !== 'BLOCKS') continue;
      if (c === 0) { finish(); cur = { type: v.trim(), layer: '0', g: {}, s: {}, verts: [], bul: [], knots: [] }; continue; }
      if (!cur) continue;
      if (c === 8) cur.layer = v.trim();
      else if (cur.type === 'HATCH' && hatchCode(cur, c, v)) continue;   // (rfAG) boundary paths and seed points
      else if (c === 2 || c === 3) cur.s[c] = v.trim();
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
    return { version: typeof ver === 'string' ? ver : null, header: header, entities: entities, blocks: blocks, bases: bases, dimstyles: dimstyles };
  }
  function shape(e) {
    var g = e.g;
    switch (e.type) {
      case 'LINE': return { type: 'LINE', layer: e.layer, a: [g[10] || 0, g[20] || 0], b: [g[11] || 0, g[21] || 0] };
      case 'CIRCLE': return { type: 'CIRCLE', layer: e.layer, c: [g[10] || 0, g[20] || 0], r: g[40] || 0 };
      case 'ARC': return { type: 'ARC', layer: e.layer, c: [g[10] || 0, g[20] || 0], r: g[40] || 0, a0: g[50] || 0, a1: g[51] || 0 };
      case 'TEXT': return { type: 'TEXT', layer: e.layer, p: [g[10] || 0, g[20] || 0], h: g[40] || 0, text: g[1] || '' };
      case 'INSERT': return { type: 'INSERT', layer: e.layer, block: e.s[2] || '', p: [g[10] || 0, g[20] || 0], sx: g[41] != null ? g[41] : 1, sy: g[42] != null ? g[42] : 1, rot: g[50] || 0 };
      // (rfT) 70 & 7: 0 rotated (horizontal / vertical), 1 aligned, 2 angular, 3 diameter, 4 radius, 6 ordinate
      case 'DIMENSION': return { type: 'DIMENSION', layer: e.layer, block: e.s[2] || '', style: e.s[3] || '', kind: ['linear', 'aligned', 'angular', 'diameter', 'radius', 'angular3', 'ordinate'][(g[70] || 0) & 7] || 'linear',
        text: g[1] || '', value: g[42] != null ? g[42] : null, p10: [g[10] || 0, g[20] || 0], p11: [g[11] || 0, g[21] || 0] };
      case 'LWPOLYLINE': return { type: 'LWPOLYLINE', layer: e.layer, closed: !!((g[70] || 0) & 1), pts: e.verts, bulges: e.bul };
      case 'SPLINE': return { type: 'SPLINE', layer: e.layer, closed: !!((g[70] || 0) & 1), degree: g[71] != null ? g[71] : 3, knots: e.knots, cps: e.verts };
      // (the minor axis is n × major · ratio: an extrusion of -Z runs the parameter the other way round)
      case 'HATCH': return { type: 'HATCH', layer: e.layer, pattern: e.s[2] || '', solid: !!((g[70] || 0) & 1), declared: e.h ? e.h.n : null,
        paths: e.h ? e.h.paths : [], seeds: e.h ? e.h.seeds : [], nSeeds: e.h ? e.h.nSeeds : null };
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

  // AZ: entity e of a block placed by an INSERT (ins; the block's base point base): a copy where the INSERT puts it,
  // on the INSERT's layer when it is on layer 0
  function placeIn(e, ins, base) {
    var a = ins.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), sx = ins.sx, sy = ins.sy, mir = sx * sy < 0, k = Math.abs(sx);
    function P(q) { var x = (q[0] - base[0]) * sx, y = (q[1] - base[1]) * sy; return [ins.p[0] + c * x - s * y, ins.p[1] + s * x + c * y]; }
    function ang(d) { if (sx < 0) d = 180 - d; if (sy < 0) d = -d; return d + ins.rot; }
    var o = JSON.parse(JSON.stringify(e));
    if (o.layer === '0') o.layer = ins.layer;
    switch (o.type) {
      case 'LINE': o.a = P(e.a); o.b = P(e.b); break;
      case 'CIRCLE': o.c = P(e.c); o.r = e.r * k; break;
      case 'ARC': o.c = P(e.c); o.r = e.r * k; o.a0 = mir ? ang(e.a1) : ang(e.a0); o.a1 = mir ? ang(e.a0) : ang(e.a1); break;
      case 'TEXT': o.p = P(e.p); o.h = e.h * Math.abs(sy); break;
      case 'LWPOLYLINE': case 'POLYLINE': o.pts = e.pts.map(P); if (mir) o.bulges = e.bulges.map(function (b) { return -b; }); break;
      case 'SPLINE': o.cps = e.cps.map(P); break;
      case 'ELLIPSE': { var M = [e.major[0] * sx, e.major[1] * sy]; o.c = P(e.c); o.major = [c * M[0] - s * M[1], s * M[0] + c * M[1]]; if (mir) o.nz = -e.nz; break; }
      case 'INSERT': o.p = P(e.p); o.sx = e.sx * sx; o.sy = e.sy * sy; o.rot = ang(e.rot) - (mir ? 180 : 0); break;
    }
    return o;
  }
  // the model-space entities with every INSERT followed by its block's geometry placed (nested ones too); an INSERT of
  // a block the BLOCKS section does not have, or of an empty one, is an error
  function explodeInserts(d, errors, inserts) {
    var out = [];
    function add(e, depth) {
      out.push(e);
      if (e.type !== 'INSERT') return;
      var be = d.blocks[e.block];
      if (depth === 0) inserts.push({ layer: e.layer, block: e.block, at: e.p, scale: [e.sx, e.sy], rotation: e.rot });
      if (!e.block || !be) { errors.push('INSERT on ' + e.layer + ' names block "' + e.block + '", which the BLOCKS section does not have'); return; }
      if (!be.length) { errors.push('INSERT on ' + e.layer + ' of block ' + e.block + ', which is empty'); return; }
      if (!(e.sx) || !(e.sy)) { errors.push('INSERT of block ' + e.block + ' on ' + e.layer + ' with a zero scale'); return; }
      if (depth > 8) { errors.push('INSERT of block ' + e.block + ' nested more than 8 deep'); return; }
      be.forEach(function (b) { add(placeIn(b, e, d.bases[e.block] || [0, 0]), depth + 1); });
    }
    d.entities.forEach(function (e) { add(e, 0); });
    return out;
  }

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
    var cut = [], seen = {}, dims = [], hatches = [], hasBlocks = Object.keys(d.blocks).length > 0, inserts = [];
    var all = explodeInserts(d, errors, inserts);
    d.entities.forEach(function (e) {
      if (e.type !== 'DIMENSION') return;
      var be = d.blocks[e.block];
      if (d.version === 'AC1009' && !hasBlocks) { dims.push({ layer: e.layer, block: e.block, kind: e.kind, text: e.text, value: e.value, entities: 0 }); return; }
      if (!e.block || !be) errors.push('DIMENSION on ' + e.layer + ' names block "' + e.block + '", which the BLOCKS section does not have');
      else if (!be.length) errors.push('DIMENSION block ' + e.block + ' is empty');
      if (e.style && d.dimstyles.length && d.dimstyles.indexOf(e.style) < 0) errors.push('DIMENSION on ' + e.layer + ' uses dimension style "' + e.style + '", not in the DIMSTYLE table');
      dims.push({ layer: e.layer, block: e.block, kind: e.kind, text: e.text, value: e.value, entities: be ? be.length : 0 });
    });
    all.forEach(function (e) {
      var key = e.type + '@' + e.layer;
      counts[key] = (counts[key] || 0) + 1;
      if (e.type === 'INSERT') return;   // (AZ: its geometry follows it in the list)
      if ((e.type === 'LWPOLYLINE' || e.type === 'SPLINE' || e.type === 'ELLIPSE' || e.type === 'HATCH') && d.version === 'AC1009') errors.push(e.type + ' in an R12 (AC1009) file');
      // (rfAG) HATCH (R2000): a pattern name, as many boundary paths as declared, each a closed polyline path with the
      // vertex count it declares (three or more, no zero-length edge), the seed points it declares
      if (e.type === 'HATCH') {
        var hn = e.layer;
        if (!e.pattern) errors.push('HATCH on ' + hn + ' without a pattern name');
        if (e.solid && e.pattern !== 'SOLID') errors.push('HATCH on ' + hn + ' is a solid fill named ' + e.pattern);
        if (e.declared == null || e.declared !== e.paths.length || !e.paths.length) errors.push('HATCH on ' + hn + ' declares ' + e.declared + ' boundary paths, has ' + e.paths.length);
        e.paths.forEach(function (bp, bi) {
          if (!(bp.flag & 2)) return;   // edge paths are not written by Anvil
          if (bp.count !== bp.pts.length) errors.push('HATCH on ' + hn + ' path ' + bi + ' declares ' + bp.count + ' vertices, has ' + bp.pts.length);
          if (bp.pts.length < 3) errors.push('HATCH on ' + hn + ' path ' + bi + ' has ' + bp.pts.length + ' vertices');
          if (bp.g73 !== 1) errors.push('HATCH on ' + hn + ' path ' + bi + ' is not closed');
          for (var hi = 0; hi < bp.pts.length; hi++) { var ha = bp.pts[hi], hb = bp.pts[(hi + 1) % bp.pts.length]; if (Math.hypot(hb[0] - ha[0], hb[1] - ha[1]) < 1e-12) { errors.push('HATCH on ' + hn + ' path ' + bi + ': zero-length edge at vertex ' + hi); break; } }
        });
        if (e.nSeeds != null && e.nSeeds !== e.seeds.length) errors.push('HATCH on ' + hn + ' declares ' + e.nSeeds + ' seed points, has ' + e.seeds.length);
        hatches.push({ layer: hn, pattern: e.pattern, solid: e.solid, paths: e.paths.length, vertices: e.paths.reduce(function (a, bp) { return a + bp.pts.length; }, 0) });
        return;
      }
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
      var sig = JSON.stringify([e.type, e.a, e.b, e.c, e.r, e.a0, e.a1, e.pts, e.p, e.text]);
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
      loops: loops, extents: isFinite(min[0]) ? { min: min, max: max } : null, gap: gap, entities: d.entities.length, dimensions: dims, hatches: hatches, inserts: inserts };
  }

  // lane dxfaudit: audit(text, opts?) -> { ok, errors, warnings, version, sections, layers: { NAME: { aci, ltype } },
  //   ltypes, handles, extents (the geometry's, text left out), check } — the DXF reference checks a strict CAM / CAD
  //   importer makes on top of check(): sections present and in order, EOF last; $INSUNITS / $MEASUREMENT (check);
  //   $EXTMIN / $EXTMAX holding the geometry (opts.extents 'exact': equal to it to 1e-6 · size); every entity's layer in
  //   the LAYER table with a colour 1–255 (negative: off) and a line type of the LTYPE table; R2000: every handle (5,
  //   105) unique, $HANDSEED above them all; R12: no R2000-only entity (LWPOLYLINE, SPLINE, ELLIPSE, MTEXT, HATCH …),
  //   no subclass markers or owner handles; nothing off z = 0 (codes 30–38, an extrusion other than 0, 0, 1); no
  //   zero-length LINE, no zero-radius ARC / CIRCLE, no duplicate entity on any layer; TEXT at least opts.minText high
  //   (default 0.06 in / 1.5 mm); bend layers (opts.bendLayers, default BEND, BEND_UP, BEND_DOWN): LINE only (an end on
  //   a cut-layer contour end is a warning), opts.bendLtype the line type they must have;
  //   faceted arcs on the cut layers (three or more equal LINEs end to end turning by one angle under 30°: an arc
  //   written as chords) unless opts.facets. Plus every error of check(text, opts).
  var R2000_ONLY = { LWPOLYLINE: 1, SPLINE: 1, ELLIPSE: 1, MTEXT: 1, HATCH: 1, LEADER: 1, MLINE: 1, RAY: 1, XLINE: 1, REGION: 1, '3DSOLID': 1, BODY: 1, TOLERANCE: 1, IMAGE: 1, WIPEOUT: 1 };
  function audit(text, opts) {
    opts = opts || {};
    var c0 = check(text, opts), errors = c0.errors.slice(), warnings = [], P = pairs(text), i;
    var r12 = c0.version === 'AC1009', r13codes = false;
    // sections, in order, then EOF
    var secs = [];
    for (i = 0; i < P.length; i++) if (P[i][0] === 0 && P[i][1].trim() === 'SECTION' && P[i + 1] && P[i + 1][0] === 2) secs.push(P[i + 1][1].trim());
    var order = ['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS'], last = -1;
    secs.forEach(function (s) { var k = order.indexOf(s); if (k < 0) warnings.push('unknown section ' + s); else if (k <= last) errors.push('section ' + s + ' out of order (' + secs.join(', ') + ')'); else last = k; });
    ['HEADER', 'TABLES', 'ENTITIES'].concat(r12 ? [] : ['CLASSES', 'BLOCKS', 'OBJECTS']).forEach(function (s) { if (secs.indexOf(s) < 0) errors.push('no ' + s + ' section'); });
    var tail = P.length ? P[P.length - 1] : null;
    if (!tail || tail[0] !== 0 || tail[1].trim() !== 'EOF') errors.push('the file does not end with 0 / EOF');
    // TABLES: layers (name, colour, line type), line types; handles; per entity its layer, z values and extrusion
    var layers = {}, ltypes = {}, rec = null, section = null, handles = {}, dupH = [], maxH = 0, ents = [], ent = null;
    function endRec() {
      if (rec && rec.type === 'LAYER' && rec.name != null) layers[rec.name.toUpperCase()] = { name: rec.name, aci: rec.aci, ltype: rec.lt };
      if (rec && rec.type === 'LTYPE' && rec.name != null) ltypes[rec.name.toUpperCase()] = true;
      rec = null;
    }
    for (i = 0; i < P.length; i++) {
      var c = P[i][0], v = P[i][1].trim();
      if (c === 0 && v === 'SECTION') { endRec(); section = P[i + 1] ? P[i + 1][1].trim() : null; i++; continue; }
      if (c === 0 && v === 'ENDSEC') { endRec(); section = null; continue; }
      if (section !== 'HEADER' && (c === 5 || c === 105) && !r12) {
        if (!/^[0-9A-Fa-f]+$/.test(v)) errors.push('handle "' + v + '" is not hexadecimal');
        else { if (handles[v.toUpperCase()]) dupH.push(v); handles[v.toUpperCase()] = true; maxH = Math.max(maxH, parseInt(v, 16)); }
      }
      if (r12 && !r13codes && (c === 100 || c === 330 || c === 360 || c === 102)) { errors.push('group code ' + c + ' (R13 and later) in an R12 file'); r13codes = true; }
      if (section === 'TABLES') {
        if (c === 0) { endRec(); if (v === 'LAYER' || v === 'LTYPE') rec = { type: v, name: null, aci: null, lt: null }; }
        else if (rec && c === 2) rec.name = v;
        else if (rec && c === 62) rec.aci = parseInt(v, 10);
        else if (rec && c === 6) rec.lt = v;
        continue;
      }
      if (section === 'ENTITIES' || section === 'BLOCKS') {
        if (c === 0) { ent = { type: v, layer: '0', z: [], ext: null }; ents.push(ent); continue; }
        if (!ent) continue;
        if (c === 8) ent.layer = v;
        else if (c >= 30 && c <= 38 && parseFloat(v) !== 0) ent.z.push(c + '=' + v);
        else if (c === 210 || c === 220 || c === 230) { ent.ext = ent.ext || [0, 0, 1]; ent.ext[(c - 210) / 10] = parseFloat(v); }
      }
    }
    endRec();
    if (dupH.length) errors.push('duplicate handles: ' + dupH.slice(0, 5).join(', '));
    var d = parse(text);
    if (!r12 && c0.version) {
      var seed = d.header.$HANDSEED, sv = parseInt(seed, 16);
      if (!(sv > maxH)) errors.push('$HANDSEED ' + seed + ' is not above the largest handle ' + maxH.toString(16).toUpperCase());
    }
    if (!Object.keys(layers).length) errors.push('no LAYER table');
    Object.keys(layers).forEach(function (n) {
      var L = layers[n];
      if (L.aci == null || !(Math.abs(L.aci) >= 1 && Math.abs(L.aci) <= 255)) errors.push('layer ' + L.name + ' has colour ' + L.aci);
      if (!L.ltype) errors.push('layer ' + L.name + ' has no line type');
      else if (!ltypes[L.ltype.toUpperCase()]) errors.push('layer ' + L.name + ' uses line type ' + L.ltype + ', not in the LTYPE table');
    });
    var bendLayers = (opts.bendLayers || ['BEND', 'BEND_UP', 'BEND_DOWN']).map(function (n) { return n.toUpperCase(); });
    var skip = { VERTEX: 1, SEQEND: 1, BLOCK: 1, ENDBLK: 1 };
    ents.forEach(function (e) {
      if (!skip[e.type] && !layers[e.layer.toUpperCase()]) errors.push(e.type + ' on layer ' + e.layer + ', which the LAYER table does not have');
      if (r12 && R2000_ONLY[e.type]) errors.push(e.type + ' (R2000 only) in an R12 file');
      if (e.z.length) errors.push(e.type + ' on ' + e.layer + ' off z = 0 (' + e.z.slice(0, 3).join(', ') + ')');
      if (e.ext && (Math.abs(e.ext[0]) > 1e-12 || Math.abs(e.ext[1]) > 1e-12 || e.ext[2] !== 1)) errors.push(e.type + ' on ' + e.layer + ' with extrusion ' + e.ext.join(', '));
      if (bendLayers.indexOf(e.layer.toUpperCase()) >= 0 && !skip[e.type] && e.type !== 'LINE') errors.push(e.type + ' on bend layer ' + e.layer + ' (LINE only)');
    });
    if (opts.bendLtype) bendLayers.forEach(function (n) { if (layers[n] && String(layers[n].ltype).toUpperCase() !== opts.bendLtype.toUpperCase()) errors.push('layer ' + layers[n].name + ' line type ' + layers[n].ltype + ', expected ' + opts.bendLtype); });
    // geometry: every entity, INSERTs exploded, on every layer
    var all = explodeInserts(d, [], []), units = c0.insunits === 1 ? 'in' : 'mm';
    var minText = opts.minText != null ? opts.minText : units === 'in' ? 0.06 : 1.5, sigs = {};
    var gmin = [Infinity, Infinity], gmax = [-Infinity, -Infinity];
    function g(q, r) { r = r || 0; gmin[0] = Math.min(gmin[0], q[0] - r); gmin[1] = Math.min(gmin[1], q[1] - r); gmax[0] = Math.max(gmax[0], q[0] + r); gmax[1] = Math.max(gmax[1], q[1] + r); }
    function garc(cc, r, a0, sw) {
      var en = arcEnds({ c: cc, r: r, a0: a0, a1: a0 + sw });
      g(en[0]); g(en[1]);
      for (var k = 0; k < 4; k++) { var d0 = ((k * 90 - a0) % 360 + 360) % 360; if (d0 <= sw) g([cc[0] + r * Math.cos(k * Math.PI / 2), cc[1] + r * Math.sin(k * Math.PI / 2)]); }
    }
    var cutLayers = opts.layers || ['OUTLINE', 'HOLES'], cutEnds = [], bendEnds = [], cutLines = [];
    all.forEach(function (e) {
      if (e.type === 'INSERT') return;
      var sig = JSON.stringify([e.type, e.layer, e.a, e.b, e.c, e.r, e.a0, e.a1, e.pts, e.p, e.text, e.cps, e.major, e.t0]);
      if (sigs[sig]) errors.push('duplicate ' + e.type + ' on ' + e.layer);
      sigs[sig] = true;
      if (e.type === 'LINE') {
        if (Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) < 1e-9) errors.push('zero-length LINE on ' + e.layer);
        g(e.a); g(e.b);
        if (bendLayers.indexOf(e.layer.toUpperCase()) >= 0) bendEnds.push(e.a, e.b);
        if (cutLayers.indexOf(e.layer) >= 0) { cutEnds.push(e.a, e.b); cutLines.push(e); }
      } else if (e.type === 'ARC' || e.type === 'CIRCLE') {
        if (!(e.r > 1e-9)) errors.push('zero-radius ' + e.type + ' on ' + e.layer);
        if (e.type === 'CIRCLE') g(e.c, e.r); else garc(e.c, e.r, e.a0, sweepDeg(e));
        if (e.type === 'ARC' && cutLayers.indexOf(e.layer) >= 0) { var ae = arcEnds(e); cutEnds.push(ae[0], ae[1]); }
      } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
        e.pts.forEach(function (q, k) {
          g(q);
          var b = e.bulges[k] || 0, q2 = e.pts[(k + 1) % e.pts.length];
          if (!b || (!e.closed && k + 1 === e.pts.length)) return;
          var cl = Math.hypot(q2[0] - q[0], q2[1] - q[1]) / 2;
          if (!(cl > 0)) return;
          var sw = 4 * Math.atan(b), r = cl / Math.sin(Math.abs(sw) / 2), hgt = cl / Math.tan(sw / 2);
          var cc = [(q[0] + q2[0]) / 2 - (q2[1] - q[1]) / (2 * cl) * hgt, (q[1] + q2[1]) / 2 + (q2[0] - q[0]) / (2 * cl) * hgt], from = sw > 0 ? q : q2;
          garc(cc, r, Math.atan2(from[1] - cc[1], from[0] - cc[0]) * 180 / Math.PI, Math.abs(sw) * 180 / Math.PI);
        });
        if (e.pts.length >= 2 && !e.closed && cutLayers.indexOf(e.layer) >= 0) cutEnds.push(e.pts[0], e.pts[e.pts.length - 1]);
      } else if (e.type === 'ELLIPSE') {
        var sw2 = ellipseSweep(e);
        for (var q2 = 0; q2 <= 256; q2++) g(ellipsePt(e, e.t0 + sw2 * q2 / 256));
      } else if (e.type === 'SPLINE') {
        var rg = splineRange(e);
        if (splinePt(e, rg[0])) for (var q3 = 0; q3 <= 256; q3++) g(splinePt(e, q3 === 256 ? rg[1] : rg[0] + (rg[1] - rg[0]) * q3 / 256));
      } else if (e.type === 'TEXT') {
        if (!(e.h >= minText - 1e-12)) errors.push('TEXT "' + e.text + '" on ' + e.layer + ' is ' + e.h + ' high (below ' + minText + ')');
      }
    });
    var size = isFinite(gmin[0]) ? Math.max(gmax[0] - gmin[0], gmax[1] - gmin[1], 1e-9) : 1, tol = 1e-6 * (1 + size);
    // (a Lofted-Bend's bend lines run corner to corner of its facets, as SolidWorks draws them: a layer-blind chainer
    // would see three ends meet there, so it is a warning, not an error)
    var onEnd = bendEnds.filter(function (q) { return cutEnds.some(function (p) { return Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol; }); }).length;
    if (onEnd) warnings.push(onEnd + ' bend-line end' + (onEnd === 1 ? '' : 's') + ' on a cut-layer contour vertex');
    if (!opts.facets) {
      var byStart = {}, faceted = 0;
      var key = function (q) { return Math.round(q[0] / tol) + ',' + Math.round(q[1] / tol); };
      var turn = function (p, q) { var t = Math.atan2(q.b[1] - q.a[1], q.b[0] - q.a[0]) - Math.atan2(p.b[1] - p.a[1], p.b[0] - p.a[0]); while (t > Math.PI) t -= 2 * Math.PI; while (t < -Math.PI) t += 2 * Math.PI; return t; };
      var len = function (p) { return Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]); };
      cutLines.forEach(function (e) { byStart[key(e.a)] = e; });
      cutLines.forEach(function (e) {
        var n1 = byStart[key(e.b)], n2 = n1 && byStart[key(n1.b)];
        if (!n1 || !n2) return;
        var L0 = len(e), t1 = turn(e, n1), t2 = turn(n1, n2);
        if (Math.abs(L0 - len(n1)) < 1e-6 * L0 && Math.abs(L0 - len(n2)) < 1e-6 * L0 && Math.abs(t1) > 1e-6 && Math.abs(t1) < Math.PI / 6 && Math.abs(t1 - t2) < 1e-6) faceted++;
      });
      if (faceted) errors.push(faceted + ' run' + (faceted === 1 ? '' : 's') + ' of equal LINEs on a cut layer turning by one angle: an arc written as chords');
    }
    // the header's extents hold the geometry (text left out: a flat's notes sit outside the blank)
    var em = d.header.$EXTMIN, ex = d.header.$EXTMAX;
    if (!em || !ex) errors.push('no $EXTMIN / $EXTMAX in the header');
    else if (isFinite(gmin[0])) {
      var mn = [+em[0], +em[1]], mx = [+ex[0], +ex[1]];
      if (+em[2] || +ex[2]) errors.push('$EXTMIN / $EXTMAX off z = 0');
      if (mn[0] > gmin[0] + tol || mn[1] > gmin[1] + tol || mx[0] < gmax[0] - tol || mx[1] < gmax[1] - tol) errors.push('$EXTMIN / $EXTMAX (' + mn + ' – ' + mx + ') do not hold the geometry (' + gmin + ' – ' + gmax + ')');
      else if (opts.extents === 'exact' && (Math.abs(mn[0] - gmin[0]) > tol || Math.abs(mn[1] - gmin[1]) > tol || Math.abs(mx[0] - gmax[0]) > tol || Math.abs(mx[1] - gmax[1]) > tol)) errors.push('$EXTMIN / $EXTMAX (' + mn + ' – ' + mx + ') are not the geometry\'s extents (' + gmin + ' – ' + gmax + ')');
    }
    var uniq = [], lout = {};
    errors.forEach(function (e) { if (uniq.indexOf(e) < 0) uniq.push(e); });
    Object.keys(layers).forEach(function (n) { lout[layers[n].name] = { aci: layers[n].aci, ltype: layers[n].ltype }; });
    return { ok: !uniq.length, errors: uniq, warnings: warnings, version: c0.version, sections: secs, layers: lout, ltypes: Object.keys(ltypes),
      handles: Object.keys(handles).length, extents: isFinite(gmin[0]) ? { min: gmin, max: gmax } : null, check: c0 };
  }

  var api = { parse: parse, check: check, audit: audit };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DxfCheck = api;
})(typeof self !== 'undefined' ? self : this);
