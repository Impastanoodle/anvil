// drawing-views.js — section and detail views for the drawing engine (Drawing, see drawing.js): sectionOf cuts the
// solid exactly by CSG and keeps the cut faces, capLoops gives them as loops in a view frame, the hatch patterns per
// material (ANSI31 … ANSI38) with one style per solid (hatchAssign) and hatch ends snapped onto the drawn round edges;
// clipProjection limits a projection to a detail circle; reattachDim finds a dimension's edge or circle again in the
// current projection after the part changed. Loads after drawing.js and drawing-curves.js; textWidth is late bound
// from drawing-render.js.
(function (D, _) {
  'use strict';
  var K = Kernel, V = K.vec;
  var TWO_PI = _.TWO_PI, frameKey = _.frameKey, meshDiag = _.meshDiag;

  // ------------------------------------------------------------------ section views: an exact cut of the solid
  // sectionOf(mesh, e, w) -> { mesh, caps: [face index], area, e, w }: the part with everything in front of the plane
  // p·e = w removed (p·e > w), cut exactly by CSG: each body is intersected with a box that ends on the plane, so the
  // cut faces ("caps") are true faces of the result lying on the plane and facing +e. Cached on the mesh.
  function sectionKey(e, w) { return e.map(function (x) { return Math.round(x * 1e9); }).join(',') + '|' + Math.round(w * 1e9); }
  function sectionOf(mesh, e, w) {
    var c = mesh._drawingSections || (mesh._drawingSections = {});
    var key = sectionKey(e, w);
    if (c[key]) return c[key];
    var P = mesh.positions64 || mesh.positions, diag = meshDiag(mesh), m = diag * 0.25 + 1;
    var u = V.norm(V.cross(Math.abs(e[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], e)), v = V.cross(e, u);
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < P.length; i += 3) {
      var p = [P[i], P[i + 1], P[i + 2]], q = [V.dot(p, e), V.dot(p, u), V.dot(p, v)];
      for (var k = 0; k < 3; k++) { if (q[k] < lo[k]) lo[k] = q[k]; if (q[k] > hi[k]) hi[k] = q[k]; }
    }
    var out;
    if (!P.length || w >= hi[0] - diag * 1e-9) out = { mesh: mesh, caps: [], area: 0 };             // the plane misses the part
    else if (w <= lo[0] + diag * 1e-9) out = { mesh: K.meshFromBody(null), caps: [], area: 0 };      // nothing behind it
    else {
      var box = boxSolid([e, u, v], [lo[0] - m, lo[1] - m, lo[2] - m], [w, hi[1] + m, hi[2] + m]);
      // cut per body and, in an assembly, per part (polygon.part: each part of a sub-assembly is its own solid, so its
      // cut face is its own face and gets its own hatch, as in SolidWorks; r11/hatch11)
      var byBody = {}, order = [];
      mesh.faces.forEach(function (f) {
        (f.polys || []).forEach(function (pg) {
          var b = pg.body || 0, pt = pg.part != null ? pg.part : f.part, k = b + '|' + (pt != null ? pt : '');
          if (!byBody[k]) { byBody[k] = []; order.push({ k: k, b: b, part: pt }); }
          var c = pg.clone(); if (pt != null) c.part = pt; byBody[k].push(c);
        });
      });
      var polys = [];
      order.forEach(function (g) {
        CSG.fromPolygons(byBody[g.k]).intersect(box).polygons.forEach(function (pg) { pg.body = g.b; if (g.part != null) pg.part = g.part; polys.push(pg); });
      });
      var sm = K.meshFromBody(polys.length ? CSG.fromPolygons(polys) : null), caps = [], area = 0, tol = diag * 1e-7 + 1e-9;
      sm.faces.forEach(function (f, fi) {
        if (V.dot(f.normal, e) > 1 - 1e-9 && Math.abs(f.w - w) <= tol) { caps.push(fi); area += f.area; }
      });
      out = { mesh: sm, caps: caps, area: area };
    }
    out.e = e.slice(); out.w = w;
    c[key] = out;
    return out;
  }
  // a box as CSG: ax = three orthonormal axes, lo / hi = coordinate ranges along them
  function boxSolid(ax, lo, hi) {
    function pt(c) { return new CSG.Vector(ax[0][0] * c[0] + ax[1][0] * c[1] + ax[2][0] * c[2], ax[0][1] * c[0] + ax[1][1] * c[1] + ax[2][1] * c[2], ax[0][2] * c[0] + ax[1][2] * c[1] + ax[2][2] * c[2]); }
    var polys = [];
    for (var a = 0; a < 3; a++) for (var s = 0; s < 2; s++) {
      var b = (a + 1) % 3, d = (a + 2) % 3, vs = [];
      [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(function (q) {
        var c = [0, 0, 0]; c[a] = s ? hi[a] : lo[a]; c[b] = q[0] ? hi[b] : lo[b]; c[d] = q[1] ? hi[d] : lo[d];
        vs.push(new CSG.Vertex(pt(c)));
      });
      var pg = new CSG.Polygon(vs), out = V.scale(ax[a], s ? 1 : -1);
      if (pg.plane.normal.x * out[0] + pg.plane.normal.y * out[1] + pg.plane.normal.z * out[2] < 0) pg = new CSG.Polygon(vs.slice().reverse());
      polys.push(pg);
    }
    return CSG.fromPolygons(polys);
  }
  // the cut faces of a section as closed loops in a view frame: [{ loops: [[[u, v]…]…], body, part }] (part: the
  // assembly part tag, a part inside a sub-assembly, or undefined)
  function capLoops(S, F) {
    var ck = frameKey(F), cc = S._capLoops || (S._capLoops = {});   // (cached per frame: a faceOutline per cap, r13/drawings13)
    if (cc[ck]) return cc[ck];
    return (cc[ck] = capLoops0(S, F));
  }
  function capLoops0(S, F) {
    var out = S.caps.map(function (fi) {
      var o = K.faceOutline(S.mesh, fi), f = S.mesh.faces[fi];
      var c = { body: f.body || 0, loops: o ? o.loops.map(function (loop) {
        return loop.map(function (p2) { var p = K.to3D(o.plane, p2[0], p2[1]); return [V.dot(p, F.u), V.dot(p, F.v)]; });
      }) : [] };
      if (f.part != null) c.part = f.part;
      return c;
    });
    var st = hatchAssign(out);
    out.forEach(function (c, i) { c.style = st[i]; });
    return out;
  }
  // ANSI31 hatching: parallel lines at `ang` degrees, `sp` apart (paper units, anchored at the sheet origin so every
  // view's pattern lines up), clipped to the region inside an odd number of loops. Returns [[x1, y1, x2, y2]].
  function hatchLines(loops, sp, ang, off) {
    var a = ang * Math.PI / 180, d = [Math.cos(a), Math.sin(a)], n = [-Math.sin(a), Math.cos(a)];
    var tmin = Infinity, tmax = -Infinity, out = [];
    loops.forEach(function (l) { l.forEach(function (p) { var t = n[0] * p[0] + n[1] * p[1]; if (t < tmin) tmin = t; if (t > tmax) tmax = t; }); });
    off = off || 0;
    for (var k = Math.ceil((tmin - off) / sp); k * sp + off <= tmax; k++) {
      var t = k * sp + off, xs = [];
      loops.forEach(function (l) {
        for (var i = 0; i < l.length; i++) {
          var p = l[i], q = l[(i + 1) % l.length], tp = n[0] * p[0] + n[1] * p[1] - t, tq = n[0] * q[0] + n[1] * q[1] - t;
          if ((tp > 0) !== (tq > 0)) { var f = tp / (tp - tq); xs.push(d[0] * (p[0] + (q[0] - p[0]) * f) + d[1] * (p[1] + (q[1] - p[1]) * f)); }
        }
      });
      xs.sort(function (x, y) { return x - y; });
      for (var j = 0; j + 1 < xs.length; j += 2) {
        if (xs[j + 1] - xs[j] < 1e-9) continue;
        out.push([n[0] * t + d[0] * xs[j], n[1] * t + d[1] * xs[j], n[0] * t + d[0] * xs[j + 1], n[1] * t + d[1] * xs[j + 1]]);
      }
    }
    return out;
  }

  // hatchStyle(body) -> { angle, spacing (× HATCH) }: every body of a multi-body part and every component of an assembly
  // gets its own hatch, as in SolidWorks — 45°, 135°, 30°, 120°, 60°, 150°, then the same angles 1.6× wider apart, …
  var HATCH_ANGLES = [45, 135, 30, 120, 60, 150];
  function hatchStyle(body) {
    var b = Math.max(0, body | 0);
    return { angle: HATCH_ANGLES[b % HATCH_ANGLES.length], spacing: 1 + 0.6 * Math.floor(b / HATCH_ANGLES.length) };
  }
  // hatchAssign(caps) -> [{ angle, spacing, index }] per cap (r11/hatch11): one style per solid (the assembly part tag
  // when there is one, so every part inside a sub-assembly has its own hatch; else the body), chosen in solid order so
  // that cut faces that touch (or nearly: within 2% of the section's size, a pin in its bore, a hinge arm 1 mm off its
  // leaf) look different: the style furthest in angle from every touching neighbour's (up to 90°; a different spacing adds
  // 20°), then one no other solid uses yet, then the first in hatchStyle's order. With nothing touching that gives
  // hatchStyle(0), hatchStyle(1), … as before; a second pin in a plate gets 135° wider apart, not 30° beside 45°.
  function hatchAssign(caps) {
    var keys = [], byKey = {}, lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    caps.forEach(function (c) {
      var k = c.part != null ? c.part : c.body;
      if (!byKey[k]) { byKey[k] = { k: k, loops: [], b: [Infinity, Infinity, -Infinity, -Infinity] }; keys.push(byKey[k]); }
      var g = byKey[k];
      c.loops.forEach(function (l) {
        g.loops.push(l);
        l.forEach(function (p) {
          if (p[0] < g.b[0]) g.b[0] = p[0]; if (p[1] < g.b[1]) g.b[1] = p[1]; if (p[0] > g.b[2]) g.b[2] = p[0]; if (p[1] > g.b[3]) g.b[3] = p[1];
          if (p[0] < lo[0]) lo[0] = p[0]; if (p[1] < lo[1]) lo[1] = p[1]; if (p[0] > hi[0]) hi[0] = p[0]; if (p[1] > hi[1]) hi[1] = p[1];
        });
      });
    });
    keys.sort(function (x, y) { return x.k - y.k; });
    var tol = 0.02 * Math.hypot(hi[0] - lo[0], hi[1] - lo[1]);
    function segD(p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
    function near(A, B) {
      if (A.b[0] > B.b[2] + tol || B.b[0] > A.b[2] + tol || A.b[1] > B.b[3] + tol || B.b[1] > A.b[3] + tol) return false;
      return [[A, B], [B, A]].some(function (pr) {
        return pr[0].loops.some(function (la) {
          return la.some(function (p) {
            if (p[0] < pr[1].b[0] - tol || p[0] > pr[1].b[2] + tol || p[1] < pr[1].b[1] - tol || p[1] > pr[1].b[3] + tol) return false;
            return pr[1].loops.some(function (lb) { for (var i = 0; i < lb.length; i++) if (segD(p, lb[i], lb[(i + 1) % lb.length]) <= tol) return true; return false; });
          });
        });
      });
    }
    var used = {}, nCand = Math.max(18, keys.length + HATCH_ANGLES.length);
    keys.forEach(function (g, gi) {
      var nb = [];
      for (var j = 0; j < gi; j++) if (near(g, keys[j])) nb.push(keys[j].style);
      var best = -1, bs = -Infinity, bu = true;
      for (var i = 0; i < nCand; i++) {
        var s = hatchStyle(i), sc = 1000;
        nb.forEach(function (t) { var d = Math.abs(s.angle - t.angle) % 180; d = Math.min(d, 180 - d); sc = Math.min(sc, 90, d + (Math.abs(s.spacing - t.spacing) > 1e-9 ? 20 : 0)); });
        if (sc > bs + 1e-9 || (Math.abs(sc - bs) <= 1e-9 && bu && !used[i])) { best = i; bs = sc; bu = !!used[i]; }
      }
      used[best] = 1;
      var st = hatchStyle(best); st.index = best;
      g.style = st;
    });
    return caps.map(function (c) { return byKey[c.part != null ? c.part : c.body].style; });
  }
  // Area hatch patterns by material, as SolidWorks takes them from the material (the ANSI Y14.2 families of acad.pat),
  // in units of the base spacing: line families { da (degrees added to the hatch angle), offs (perpendicular offsets
  // in one period), period, dash: [on, off] or none } (r5/drawings5)
  var HATCH_PATTERNS = {
    ANSI31: [{ da: 0, offs: [0], period: 1 }],                                   // iron, general use
    ANSI32: [{ da: 0, offs: [0, 1], period: 3 }],                                // steel
    ANSI33: [{ da: 0, offs: [0], period: 2 }, { da: 0, offs: [1], period: 2, dash: [1, 0.5] }],   // bronze, brass, copper
    ANSI34: [{ da: 0, offs: [0, 1, 2, 3], period: 6 }],                          // plastic, rubber
    ANSI37: [{ da: 0, offs: [0], period: 1 }, { da: 90, offs: [0], period: 1 }], // lead, zinc, insulation
    ANSI38: [{ da: 0, offs: [0], period: 1 }, { da: 90, offs: [0], period: 1, dash: [2.5, 1.5] }]   // aluminium
  };
  var HATCH_BY_CLASS = { 'Steel': 'ANSI32', 'Stainless Steel': 'ANSI32', 'Aluminium Alloys': 'ANSI38', 'Copper Alloys': 'ANSI33', 'Plastics': 'ANSI34' };
  // the hatch pattern for a material name (null / unknown: ANSI31)
  function hatchPattern(materialName) {
    var m = materialName && typeof Materials !== 'undefined' && Materials.find ? Materials.find(materialName) : null;
    return m && HATCH_BY_CLASS[m.category] || 'ANSI31';
  }
  // hatch segments of a pattern over loops: [[x1, y1, x2, y2], …]; dashes keep their phase along the line direction,
  // so neighbouring lines' dashes stagger the same way everywhere
  function patternLines(loops, sp, ang, pattern) {
    var out = [];
    (HATCH_PATTERNS[pattern] || HATCH_PATTERNS.ANSI31).forEach(function (fam) {
      var a = ang + fam.da, d = [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)];
      fam.offs.forEach(function (o) {
        hatchLines(loops, sp * fam.period, a, sp * o).forEach(function (l) {
          if (!fam.dash) { out.push(l); return; }
          var on = fam.dash[0] * sp, P = (fam.dash[0] + fam.dash[1]) * sp, t0 = d[0] * l[0] + d[1] * l[1], t1 = d[0] * l[2] + d[1] * l[3];
          var lo = Math.min(t0, t1), hi = Math.max(t0, t1), bx = l[0] - d[0] * t0, by = l[1] - d[1] * t0;
          for (var s = Math.floor(lo / P) * P; s < hi; s += P) {
            var u0 = Math.max(lo, s), u1 = Math.min(hi, s + on);
            if (u1 - u0 > 1e-9) out.push([bx + d[0] * u0, by + d[1] * u0, bx + d[0] * u1, by + d[1] * u1]);
          }
        });
      });
    });
    return out;
  }

  // does a sheet primitive (line, circle, arc, filled arrow) cross the rectangle R = [x0, y0, x1, y1]? (r11/hatch11)
  function primHitsRect(p, R) {
    function inR(q) { return q[0] >= R[0] && q[0] <= R[2] && q[1] >= R[1] && q[1] <= R[3]; }
    function segHits(a, b) {
      if (inR(a) || inR(b)) return true;
      if (Math.max(a[0], b[0]) < R[0] || Math.min(a[0], b[0]) > R[2] || Math.max(a[1], b[1]) < R[1] || Math.min(a[1], b[1]) > R[3]) return false;
      var cs = [[R[0], R[1]], [R[2], R[1]], [R[2], R[3]], [R[0], R[3]]], s0 = null;
      for (var i = 0; i < 4; i++) {   // the line crosses the box when the corners are not all on one side of it
        var c = cs[i], sd = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (s0 === null) s0 = sd; else if ((sd > 0) !== (s0 > 0)) return true;
      }
      return false;
    }
    if (p.k === 'line') return segHits(p.a, p.b);
    if (p.k === 'text') {
      if (p.rot) return false;
      var w = _.textWidth(p.text, p.h), x0 = p.anchor === 'middle' ? p.p[0] - w / 2 : p.anchor === 'end' ? p.p[0] - w : p.p[0];
      return !(x0 > R[2] || x0 + w < R[0] || p.p[1] > R[3] || p.p[1] + p.h < R[1]);
    }
    if (p.k === 'fill') { for (var i = 0; i < p.pts.length; i++) if (segHits(p.pts[i], p.pts[(i + 1) % p.pts.length])) return true; return false; }
    if (p.k === 'circle' || p.k === 'arc') {
      var nx = Math.max(R[0], Math.min(p.c[0], R[2])), ny = Math.max(R[1], Math.min(p.c[1], R[3])), dmin = Math.hypot(nx - p.c[0], ny - p.c[1]);
      var dmax = Math.max(Math.hypot(R[0] - p.c[0], R[1] - p.c[1]), Math.hypot(R[2] - p.c[0], R[1] - p.c[1]), Math.hypot(R[0] - p.c[0], R[3] - p.c[1]), Math.hypot(R[2] - p.c[0], R[3] - p.c[1]));
      if (p.r < dmin || p.r > dmax) return false;
      if (p.k === 'circle') return true;
      // an arc: some of its points inside the box (sampled)
      for (var j = 0; j <= 48; j++) { var t = (p.a0 + (p.a1 - p.a0) * j / 48) * Math.PI / 180; if (inR([p.c[0] + p.r * Math.cos(t), p.c[1] + p.r * Math.sin(t)])) return true; }
      return false;
    }
    return false;
  }
  // the pieces of segment a-b outside rectangle R ([[a, b]…], 0-2 pieces), or null when it does not enter R
  function segOutsideRect(a, b, R) {
    var t0 = 0, t1 = 1, d = [b[0] - a[0], b[1] - a[1]];
    var ps = [-d[0], d[0], -d[1], d[1]], qs = [a[0] - R[0], R[2] - a[0], a[1] - R[1], R[3] - a[1]];
    for (var i = 0; i < 4; i++) {
      if (ps[i] === 0) { if (qs[i] < 0) return null; continue; }
      var t = qs[i] / ps[i];
      if (ps[i] < 0) { if (t > t0) t0 = t; } else if (t < t1) t1 = t;
    }
    if (t1 - t0 <= 1e-9) return null;
    function at(t) { return [a[0] + d[0] * t, a[1] + d[1] * t]; }
    var out = [];
    if (t0 > 1e-9) out.push([a, at(t0)]);
    if (t1 < 1 - 1e-9) out.push([at(t1), b]);
    return out;
  }
  // snapHatch(segs, loops, circles) (r11/hatch11): a cut face's outline is the facets' polygon, but its round edges are
  // drawn as exact circles / arcs, so hatch lines stopped on a chord fell short of a drawn rim (or ran past a drawn
  // hole) by up to the chord's sagitta: a scalloped gap along every round boundary, plain at a detail's 4:1. A hatch
  // end lying on a loop segment whose two ends are on one of `circles` ({ c, r }, same units) is moved along its line
  // onto that circle. Segments are changed in place.
  function snapHatch(segs, loops, circles) {
    if (!segs.length || !circles.length) return segs;
    var chords = [];
    loops.forEach(function (l) {
      for (var i = 0; i < l.length; i++) {
        var a = l[i], b = l[(i + 1) % l.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (!(L > 0)) continue;
        for (var j = 0; j < circles.length; j++) {
          var C = circles[j], t = 1e-3 * C.r + 1e-9;
          if (Math.abs(Math.hypot(a[0] - C.c[0], a[1] - C.c[1]) - C.r) <= t && Math.abs(Math.hypot(b[0] - C.c[0], b[1] - C.c[1]) - C.r) <= t && L < 1.5 * C.r) {
            chords.push({ a: a, b: b, L: L, C: C, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) });
            break;
          }
        }
      }
    });
    if (!chords.length) return segs;
    function onSeg(p, ch) {
      var e = 1e-7 * (1 + Math.abs(p[0]) + Math.abs(p[1]));
      if (p[0] < ch.x0 - e || p[0] > ch.x1 + e || p[1] < ch.y0 - e || p[1] > ch.y1 + e) return false;
      return Math.abs((ch.b[0] - ch.a[0]) * (p[1] - ch.a[1]) - (ch.b[1] - ch.a[1]) * (p[0] - ch.a[0])) / ch.L <= e;
    }
    segs.forEach(function (s) {
      if (!(Math.hypot(s[2] - s[0], s[3] - s[1]) > 0)) return;
      [0, 2].forEach(function (o) {
        var p = [s[o], s[o + 1]], q = [s[2 - o], s[3 - o]], L = Math.hypot(q[0] - p[0], q[1] - p[1]), d = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
        for (var i = 0; i < chords.length; i++) {
          var ch = chords[i];
          if (!onSeg(p, ch)) continue;
          var w = [p[0] - ch.C.c[0], p[1] - ch.C.c[1]], B = d[0] * w[0] + d[1] * w[1], D = B * B - (w[0] * w[0] + w[1] * w[1] - ch.C.r * ch.C.r);
          if (D < 0) return;
          var t1 = -B - Math.sqrt(D), t2 = -B + Math.sqrt(D), t = Math.abs(t1) < Math.abs(t2) ? t1 : t2;
          if (Math.abs(t) > ch.L || t >= L) return;   // (never past the line's other end)
          s[o] = p[0] + d[0] * t; s[o + 1] = p[1] + d[1] * t;
          return;
        }
      });
    });
    return segs;
  }

  // ------------------------------------------------------------------ detail views: the parent clipped to a circle
  // the part of segment l inside the circle (C, R), or null
  function clipSeg(l, C, R) {
    var dx = l[2] - l[0], dy = l[3] - l[1], fx = l[0] - C[0], fy = l[1] - C[1];
    var A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), Cc = fx * fx + fy * fy - R * R;
    if (A < 1e-24) return null;
    var disc = B * B - 4 * A * Cc;
    if (disc <= 0) return null;
    var sq = Math.sqrt(disc), t0 = Math.max(0, (-B - sq) / (2 * A)), t1 = Math.min(1, (-B + sq) / (2 * A));
    if (t1 - t0 < 1e-12) return null;
    return [l[0] + dx * t0, l[1] + dy * t0, l[0] + dx * t1, l[1] + dy * t1, l[4] || 0];
  }
  // a circle (c, r) against the clip circle (C, R): 'full', null, or the arc inside { a0, a1 } (degrees, CCW)
  function clipCircle(c, r, C, R) {
    var dd = Math.hypot(C[0] - c[0], C[1] - c[1]);
    if (dd + r <= R) return 'full';
    if (dd >= r + R || dd + R <= r) return null;
    var phi = Math.atan2(C[1] - c[1], C[0] - c[0]), al = Math.acos(Math.max(-1, Math.min(1, (r * r + dd * dd - R * R) / (2 * r * dd))));
    return { a0: (phi - al) * 180 / Math.PI, a1: (phi + al) * 180 / Math.PI };
  }
  // clipProjection(proj, C, R): a projection result limited to the disc (C, R); circles cut by the edge become arcs
  function clipProjection(pr, C, R) {
    var out = { orient: pr.orient, u: pr.u, v: pr.v, e: pr.e, lines: { visible: [], hidden: [] }, circles: { visible: [], hidden: [] }, arcs: { visible: [], hidden: [] }, ellipses: { visible: [], hidden: [] }, all: [], circlesAll: [], arcsAll: [],
      bounds: { umin: C[0] - R, umax: C[0] + R, vmin: C[1] - R, vmax: C[1] + R } };
    if (pr.pending) out.pending = true;   // a detail of a view still being worked out (r12/drawui12)
    ['visible', 'hidden'].forEach(function (k) {
      pr.lines[k].forEach(function (l) { var q = clipSeg(l, C, R); if (q) out.lines[k].push(q); });
      pr.circles[k].forEach(function (c) {
        var q = clipCircle(c.c, c.r, C, R);
        if (q === 'full') out.circles[k].push(c); else if (q) out.arcs[k].push({ c: c.c, r: c.r, a0: q.a0, a1: q.a1, body: c.body || 0 });
      });
      // true arcs (exact projections): the part of the arc inside the clip circle
      (pr.arcs ? pr.arcs[k] : []).forEach(function (a) { clipArc(a, C, R).forEach(function (x) { out.arcs[k].push(x); }); });
      // ellipses (oblique true circles): as fine chords, clipped like lines
      (pr.ellipses ? pr.ellipses[k] : []).forEach(function (el) {
        var n = Math.max(8, Math.ceil((el.t1 - el.t0) / TWO_PI * 144)), prev = null;
        for (var i = 0; i <= n; i++) {
          var t = el.t0 + (el.t1 - el.t0) * i / n, p = [el.c[0] + el.ax[0] * Math.cos(t) + el.ay[0] * Math.sin(t), el.c[1] + el.ax[1] * Math.cos(t) + el.ay[1] * Math.sin(t)];
          if (prev) { var q2 = clipSeg([prev[0], prev[1], p[0], p[1], el.body || 0], C, R); if (q2) out.lines[k].push(q2); }
          prev = p;
        }
      });
    });
    out.lines.tangent = []; out.circles.tangent = []; out.arcs.tangent = [];
    (pr.lines.tangent || []).forEach(function (l) { var q = clipSeg(l, C, R); if (q) out.lines.tangent.push(q); });
    (pr.circles.tangent || []).forEach(function (c) {
      var q = clipCircle(c.c, c.r, C, R);
      if (q === 'full') out.circles.tangent.push(c); else if (q) out.arcs.tangent.push({ c: c.c, r: c.r, a0: q.a0, a1: q.a1, body: c.body || 0 });
    });
    (pr.arcs && pr.arcs.tangent || []).forEach(function (a) { clipArc(a, C, R).forEach(function (x) { out.arcs.tangent.push(x); }); });
    (pr.arcsAll || []).forEach(function (a) { if (Math.hypot(a.c[0] - C[0], a.c[1] - C[1]) + a.r <= R) out.arcsAll.push(a); });
    (pr.all || []).forEach(function (l) { var q = clipSeg(l, C, R); if (q) out.all.push(q); });
    (pr.circlesAll || []).forEach(function (c) { if (clipCircle(c.c, c.r, C, R) === 'full') out.circlesAll.push(c); });
    out.stats = { visibleLines: out.lines.visible.length, hiddenLines: out.lines.hidden.length, visibleCircles: out.circles.visible.length, hiddenCircles: out.circles.hidden.length,
      visibleArcs: out.arcs.visible.length, hiddenArcs: out.arcs.hidden.length };
    return out;
  }
  // an arc { c, r, a0, a1 (degrees, CCW) } inside the clip circle (C, R) -> [arc…]
  function clipArc(a, C, R) {
    var q = clipCircle(a.c, a.r, C, R);
    if (q === 'full') return [a];
    if (!q) return [];
    var out = [], w0 = q.a0, w1 = q.a1;
    for (var j = -2; j <= 2; j++) {
      var lo = Math.max(a.a0, w0 + 360 * j), hi = Math.min(a.a1, w1 + 360 * j);
      if (hi - lo > 1e-9) out.push(Object.assign({}, a, { a0: lo, a1: hi }));
    }
    return out;
  }

  // ------------------------------------------------------------------ dimensions that follow the part
  // A Smart Dimension placed by the user stores view geometry (model units in the view frame). Every render reattaches
  // it to the edge or circle of the current projection that is geometrically the same one: unchanged; else the best
  // of the collinear edges that overlap it (an edge that grew or shrank) and the parallel ones within a quarter of the
  // view that overlap it by at least half of their union (a face that moved), scored by overlap / union and offset,
  // so a moved full-length edge beats a short collinear leftover; circles by centre (a hole whose size changed), then
  // by radius near the old centre (a hole that moved). The dimension then takes the new geometry and value. With no match it is
  // flagged `dangling` and keeps its last geometry (drawn in the dangling colour), so undoing the change reattaches it.
  function reattachDim(d, pr) {
    var b = pr.bounds, size = Math.max(1e-9, Math.hypot(b.umax - b.umin, b.vmax - b.vmin)), tol = size * 1e-6, reach = size * 0.25;
    var best = null, bs = Infinity;
    if (d.kind === 'dia') {
      (pr.circlesAll || []).forEach(function (c) {
        var dc = Math.hypot(c.c[0] - d.c[0], c.c[1] - d.c[1]), dr = Math.abs(c.r - d.r);
        var s = dc <= tol ? (dr <= tol ? 0 : 1 + Math.min(dr / size, 0.9)) : (dr <= tol && dc <= reach ? 2 + dc / reach : Infinity);
        if (s < bs) { bs = s; best = c; }
      });
      if (!best) { d.dangling = true; return false; }
      d.c = best.c.slice(); d.r = best.r; d.value = 2 * best.r; delete d.dangling;
      return true;
    }
    if (d.kind === 'rad') {
      (pr.arcsAll || []).forEach(function (c) {
        var dc = Math.hypot(c.c[0] - d.c[0], c.c[1] - d.c[1]), dr = Math.abs(c.r - d.r);
        var s = dc <= tol ? (dr <= tol ? 0 : 1 + Math.min(dr / size, 0.9)) : (dr <= tol && dc <= reach ? 2 + dc / reach : Infinity);
        if (s < bs) { bs = s; best = c; }
      });
      if (!best) { d.dangling = true; return false; }
      d.c = best.c.slice(); d.r = best.r; d.a0 = best.a0; d.a1 = best.a1; d.value = best.r; delete d.dangling;
      return true;
    }
    var a = d.a, bb = d.b, L = Math.hypot(bb[0] - a[0], bb[1] - a[1]);
    if (L < 1e-12) { d.dangling = true; return false; }
    var t = [(bb[0] - a[0]) / L, (bb[1] - a[1]) / L], hit = null;
    // an edge on the view's outline (its left / right / bottom / top extreme) keeps that role: a part that grows moves
    // it past nearer parallel edges (a hole silhouette must not take the place of the moved side)
    function bound(m) {
      if (Math.abs(m[0] - m[2]) <= tol) return Math.abs(m[0] - b.umin) <= tol ? 'umin' : Math.abs(m[0] - b.umax) <= tol ? 'umax' : null;
      if (Math.abs(m[1] - m[3]) <= tol) return Math.abs(m[1] - b.vmin) <= tol ? 'vmin' : Math.abs(m[1] - b.vmax) <= tol ? 'vmax' : null;
      return null;
    }
    (pr.all || []).forEach(function (m) {
      var mx = m[2] - m[0], my = m[3] - m[1], ml = Math.hypot(mx, my);
      if (ml < 1e-12 || Math.abs(t[0] * my - t[1] * mx) > ml * 1e-6) return;          // not parallel
      var p0 = (m[0] - a[0]) * t[0] + (m[1] - a[1]) * t[1], p1 = (m[2] - a[0]) * t[0] + (m[3] - a[1]) * t[1];
      var lo = Math.min(p0, p1), hi = Math.max(p0, p1), off = Math.abs(t[0] * (m[1] - a[1]) - t[1] * (m[0] - a[0]));
      // score: 1 - overlap / union along the line, plus the offset in quarter-view sizes, less a little for a kept end
      var ov = Math.min(hi, L) - Math.max(lo, 0), jac = ov / (Math.max(hi, L) - Math.min(lo, 0)), s = Infinity;
      var sc = (1 - jac) + off / reach - (Math.abs(lo) <= tol || Math.abs(hi - L) <= tol ? 0.1 : 0) - (d.bound && bound(m) === d.bound ? 0.5 : 0);
      if (off <= tol && Math.abs(lo) <= tol && Math.abs(hi - L) <= tol) s = -1;
      else if (off <= tol && ov > tol) s = sc;                      // collinear: any overlap
      else if (off <= reach && jac >= 0.5) s = sc;                  // parallel: most of it
      if (s < bs) { bs = s; hit = { m: m, lo: lo, hi: hi, forward: p1 >= p0 }; }
    });
    if (!hit) { d.dangling = true; return false; }
    var m0 = [hit.m[0], hit.m[1]], m1 = [hit.m[2], hit.m[3]], bd = bound(hit.m);
    d.a = hit.forward ? m0 : m1; d.b = hit.forward ? m1 : m0;
    if (bd) d.bound = bd; else delete d.bound;
    d.value = d.kind === 'h' ? Math.abs(d.b[0] - d.a[0]) : d.kind === 'v' ? Math.abs(d.b[1] - d.a[1]) : hit.hi - hit.lo;
    delete d.dangling;
    return true;
  }

  // ------------------------------------------------------------------ flat-pattern views (sheet metal)
  // A flat-pattern view (view.kind 'flat', SolidWorks: Model View ▸ Flat pattern) draws the blank Kernel.flatPattern
  // unfolds, seen from the +n side of the Base Flange's sketch plane (UP bends come toward the viewer), in that plane's
  // frame (u = plane.x, v = plane.y): the outline and the holes as true circles and arcs where the polygons the kernel
  // returns lie on a circle (flatCurves), and the bend centre lines with their direction, angle and inside radius.

  // flatCurves(loops, diag) -> { lines: [[x0, y0, x1, y1, 0]], circles: [{ c, r }], arcs: [{ c, r, a0, a1 (degrees CCW),
  // src: 'arc', fit: true }] }: each closed polygon of the flat as drawing linework. A loop whose vertices lie on one
  // circle (all but a stray vertex or two, which the CSG merge of the blank can leave on a small hole) is a circle; else
  // runs of 3 or more chords whose vertices lie on one circle, turning the same way by under 30° each, are arcs (slot
  // ends, rounded corners) and the rest are lines. Vertices are on the true curve to rounding (tessellation vertices),
  // so the tolerance is tight: r · 2e-4 + diag · 1e-7.
  function flatCurves(loops, diag) {
    var out = { lines: [], circles: [], arcs: [] }, eps = diag * 1e-7 + 1e-12;
    function circ3(A, B, C) {
      var d = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1]));
      if (Math.abs(d) < 1e-18) return null;
      var a2 = A[0] * A[0] + A[1] * A[1], b2 = B[0] * B[0] + B[1] * B[1], c2 = C[0] * C[0] + C[1] * C[1];
      var c = [(a2 * (B[1] - C[1]) + b2 * (C[1] - A[1]) + c2 * (A[1] - B[1])) / d, (a2 * (C[0] - B[0]) + b2 * (A[0] - C[0]) + c2 * (B[0] - A[0])) / d];
      return { c: c, r: Math.hypot(A[0] - c[0], A[1] - c[1]) };
    }
    // algebraic (Kåsa) least-squares circle through points
    function kasa(pts) {
      var n = pts.length, mx = 0, my = 0;
      pts.forEach(function (p) { mx += p[0] / n; my += p[1] / n; });
      var suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
      pts.forEach(function (p) {
        var u = p[0] - mx, v = p[1] - my;
        suu += u * u; svv += v * v; suv += u * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
      });
      var det = suu * svv - suv * suv;
      if (Math.abs(det) < 1e-30) return null;
      var bu = (suuu + suvv) / 2, bv = (svvv + svuu) / 2, uc = (bu * svv - bv * suv) / det, vc = (suu * bv - suv * bu) / det;
      var c = [mx + uc, my + vc], r = 0;
      pts.forEach(function (p) { r += Math.hypot(p[0] - c[0], p[1] - c[1]) / n; });
      return { c: c, r: r };
    }
    function turn(a, b, c) { var ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1]; return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); }
    loops.forEach(function (loop) {
      // drop repeated vertices and vertices lying on the straight line between their neighbours (CSG splits)
      var p = [];
      loop.forEach(function (q) { if (!p.length || Math.hypot(q[0] - p[p.length - 1][0], q[1] - p[p.length - 1][1]) > eps) p.push([q[0], q[1]]); });
      if (p.length > 1 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) <= eps) p.pop();
      for (var changed = true; changed && p.length > 3;) {
        changed = false;
        for (var i = 0; i < p.length && p.length > 3; i++) {
          var A = p[(i + p.length - 1) % p.length], B = p[i], C = p[(i + 1) % p.length], L = Math.hypot(C[0] - A[0], C[1] - A[1]);
          if (L < eps) continue;
          var off = Math.abs((C[0] - A[0]) * (B[1] - A[1]) - (C[1] - A[1]) * (B[0] - A[0])) / L, t = ((B[0] - A[0]) * (C[0] - A[0]) + (B[1] - A[1]) * (C[1] - A[1])) / (L * L);
          if (off <= eps && t > 0 && t < 1) { p.splice(i, 1); changed = true; i--; }
        }
      }
      var n = p.length;
      if (n < 3) return;
      // a whole circle: a least-squares fit that nearly every vertex sits on, the vertices all round it
      if (n >= 8) {
        var f = kasa(p);
        for (var pass = 0; f && pass < 3; pass++) {
          var tolC = f.r * 2e-4 + eps, inl = p.filter(function (q) { return Math.abs(Math.hypot(q[0] - f.c[0], q[1] - f.c[1]) - f.r) <= tolC; });
          if (pass < 2 && inl.length < n) {
            // a stray vertex pulls the first fit off every point: fit again to the three quarters nearest the circle
            var fc = f, ranked = p.slice().sort(function (x, y) { return Math.abs(Math.hypot(x[0] - fc.c[0], x[1] - fc.c[1]) - fc.r) - Math.abs(Math.hypot(y[0] - fc.c[0], y[1] - fc.c[1]) - fc.r); });
            if (inl.length < Math.ceil(0.85 * n)) { f = kasa(ranked.slice(0, Math.max(8, Math.ceil(0.75 * n)))); continue; }
          }
          if (inl.length === n || (pass > 0 && inl.length >= Math.max(8, Math.ceil(0.85 * n)))) {
            var ang = inl.map(function (q) { return Math.atan2(q[1] - f.c[1], q[0] - f.c[0]); }).sort(function (x, y) { return x - y; }), gap = ang[0] + 2 * Math.PI - ang[ang.length - 1];
            for (var g = 1; g < ang.length; g++) gap = Math.max(gap, ang[g] - ang[g - 1]);
            var wild = p.some(function (q) { return Math.abs(Math.hypot(q[0] - f.c[0], q[1] - f.c[1]) - f.r) > f.r * 0.35; });
            if (gap < Math.PI / 3 && !wild) { out.circles.push({ c: f.c, r: f.r, body: 0 }); return; }
            break;
          }
          f = inl.length >= 8 ? kasa(inl) : null;
        }
      }
      // start at the sharpest corner, so no arc is split by the loop's seam
      var s0 = 0, best = -1;
      for (var k = 0; k < n; k++) { var tk = Math.abs(turn(p[(k + n - 1) % n], p[k], p[(k + 1) % n])); if (tk > best) { best = tk; s0 = k; } }
      var q = [];
      for (var j = 0; j <= n; j++) q.push(p[(s0 + j) % n]);
      // q[i..j] is one arc: on the circle through its ends and middle, turning one way by 0.1–30° per chord
      function arcOf(i, j) {
        var C = circ3(q[i], q[Math.floor((i + j) / 2)], q[j]);
        if (!C || C.r > diag * 4) return null;
        var tolA = C.r * 2e-4 + eps, sg = 0;
        for (var m = i; m <= j; m++) if (Math.abs(Math.hypot(q[m][0] - C.c[0], q[m][1] - C.c[1]) - C.r) > tolA) return null;
        for (var m2 = i + 1; m2 < j; m2++) {
          var tt = turn(q[m2 - 1], q[m2], q[m2 + 1]);
          if (Math.abs(tt) < 0.1 * Math.PI / 180 || Math.abs(tt) > Math.PI / 6) return null;
          if (!sg) sg = tt > 0 ? 1 : -1; else if (tt * sg < 0) return null;
        }
        return C;
      }
      var i0 = 0, seq = [];
      while (i0 < n) {
        var j0 = -1, Cb = null;
        for (var jj = i0 + 3; jj <= n; jj++) { var Cj = arcOf(i0, jj); if (Cj) { j0 = jj; Cb = Cj; } else if (j0 >= 0) break; }
        if (j0 < 0) { seq.push({ line: [q[i0][0], q[i0][1], q[i0 + 1][0], q[i0 + 1][1], 0] }); i0++; continue; }
        var sw = 0;
        for (var m3 = i0; m3 < j0; m3++) {
          var u0 = [q[m3][0] - Cb.c[0], q[m3][1] - Cb.c[1]], w0 = [q[m3 + 1][0] - Cb.c[0], q[m3 + 1][1] - Cb.c[1]];
          sw += Math.atan2(u0[0] * w0[1] - u0[1] * w0[0], u0[0] * w0[0] + u0[1] * w0[1]);
        }
        seq.push({ c: Cb.c, r: Cb.r, t0: Math.atan2(q[i0][1] - Cb.c[1], q[i0][0] - Cb.c[0]) * 180 / Math.PI, sw: sw * 180 / Math.PI });
        i0 = j0;
      }
      // an arc the loop's seam split in two (a loop with no sharp corner, such as a slot) is one arc
      var fA = seq[0], lA = seq[seq.length - 1];
      if (seq.length > 1 && !fA.line && !lA.line && Math.hypot(fA.c[0] - lA.c[0], fA.c[1] - lA.c[1]) <= fA.r * 1e-4 + eps && Math.abs(fA.r - lA.r) <= fA.r * 1e-4 + eps && fA.sw * lA.sw > 0) {
        lA.sw += fA.sw; seq.shift();
      }
      seq.forEach(function (s) {
        if (s.line) out.lines.push(s.line);
        else out.arcs.push({ c: s.c, r: s.r, a0: s.sw > 0 ? s.t0 : s.t0 + s.sw, a1: s.sw > 0 ? s.t0 + s.sw : s.t0, body: 0, src: 'arc', fit: true });
      });
    });
    return out;
  }
  // flatData(mesh, model?, build?) -> { units, frame: { e, u, v }, lines, circles, arcs, bends: [{ a, b, up, angle, R,
  // i, ba, bd, method, source }] (ba / bd: the bend allowance and deduction Kernel.flatPattern used), etch (the flat's
  // marks, Kernel.flatPattern's flat.etch: Etch text strokes and ETCH-layer geometry, in the view's coordinates: { t:
  // 'line', a, b } | { t: 'arc', c, r, a0, a1 (degrees, counterclockwise) } | { t: 'circle', c, r } | { t: 'poly', pts,
  // closed }), bbox: { umin, umax, vmin, vmax }, sheet, proj } | { error } | null: the flat pattern of the part shown by mesh,
  // cached on the mesh (meshes are immutable once built, so a rebuild makes a new one). The model and build default to
  // the ones the sheet being worked out belongs to (_.CTX, set by compute); with no build the part is rebuilt here.
  // The kernel's flat needs Anvil's own mesh (its faces carry the sheet's walls), so with an OpenCascade mesh on screen
  // the build's mesh is used instead.
  // ------------------------------------------------------------------ stable bend ids (dragged bend notes)
  // bendSources(flat, model, build, diag) -> per flat bend the feature and edge it comes from ('<feature id>:<n>', n
  // the record's place in build.flanges[feature]) or null. The kernel's own id wins (bend.id, or bend.feature +
  // bend.edge); else a flange whose edge lies on the face the unfold starts from is found the way the flat lays it
  // down: that face maps to the flat by projection onto its plane, and the bend line runs parallel to the projected
  // edge, BA / 2 out along the flange's o direction (which lies in that plane), over the same stretch. A flange on a
  // wall (its o leaves the plane) has no id: its notes fall back to the bend's place (bendKey).
  function bendSources(flat, model, build, diag) {
    var out = flat.bends.map(function (b) {
      if (b.id != null) return String(b.id);
      if (b.feature != null) return b.feature + ':' + (b.edge != null ? b.edge : 0);
      return null;
    });
    if (out.every(function (x) { return x != null; }) || !build || !build.flanges || !flat.plane || !flat.plane.origin) return out;
    var P = flat.plane, tol = 1e-6 * (1 + diag), cands = [];
    function p2(q) { return K.to2D(P, q); }
    (model.features || []).forEach(function (f) {
      (build.flanges[f.id] || []).forEach(function (fi, j) {
        if (!fi || !fi.a || !fi.b || !fi.o || !fi.mid || fi.a.length !== 3) return;
        var od = V.dot(fi.o, P.n);
        if (Math.abs(od) > 1e-6) return;
        var A = p2(fi.a), B = p2(fi.b), M = p2(fi.mid), O = p2(V.add(fi.mid, fi.o)), o2 = [O[0] - M[0], O[1] - M[1]], ol = Math.hypot(o2[0], o2[1]);
        if (!(ol > 0.999)) return;
        cands.push({ src: f.id + ':' + j, A: A, B: B, o: [o2[0] / ol, o2[1] / ol] });
      });
    });
    var pairs = [];
    flat.bends.forEach(function (b, i) {
      if (out[i] != null || b.ba == null) return;
      var d = [b.b[0] - b.a[0], b.b[1] - b.a[1]], L = Math.hypot(d[0], d[1]), m = [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2];
      if (!(L > tol)) return;
      cands.forEach(function (c, ci) {
        var e = [c.B[0] - c.A[0], c.B[1] - c.A[1]], El = Math.hypot(e[0], e[1]);
        if (!(El > tol) || Math.abs(d[0] * e[1] - d[1] * e[0]) > 1e-6 * L * El) return;
        var w = [m[0] - c.A[0], m[1] - c.A[1]], off = w[0] * c.o[0] + w[1] * c.o[1], along = (w[0] * e[0] + w[1] * e[1]) / El;
        var err = Math.abs(off - b.ba / 2), lat = Math.abs(w[0] * e[1] - w[1] * e[0]) / El;
        // (the bend's middle over the edge's stretch; its distance from the edge line is all along o)
        if (err > 1e-4 * (1 + diag) || along < -tol || along > El + tol || Math.abs(lat - Math.abs(off)) > 1e-4 * (1 + diag)) return;
        pairs.push({ i: i, c: ci, err: err + 1e-9 * Math.abs(along - El / 2) });
      });
    });
    pairs.sort(function (p, q) { return p.err - q.err; });
    var usedC = {};
    pairs.forEach(function (p) { if (out[p.i] == null && !usedC[p.c]) { out[p.i] = cands[p.c].src; usedC[p.c] = true; } });
    return out;
  }
  // bendKey(bend) -> the key its note's own settings (view.flatAnn) go under: 'bend:<feature id>:<n>' when the bend's
  // source is known, else 'bend@<u>,<v>,<U|D><angle>,R<radius>' (the middle of the bend line in the flat, which
  // bendKeyMatch finds again after a change moved it)
  function bendKey(b) {
    if (b.id != null) return 'bend:' + b.id;
    var m = [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2];
    return 'bend@' + m[0].toFixed(4) + ',' + m[1].toFixed(4) + ',' + (b.up ? 'U' : 'D') + (+b.angle).toFixed(2) + ',R' + (+b.R).toFixed(4);
  }
  // bendKeyMatch(bends, own, diag) -> per bend the key of view.flatAnn its note uses: its own key when it has settings;
  // else a place key ('bend@…') no bend has any more, nearest first (a change that moved the bends; the same
  // direction, angle and radius preferred), within a quarter of the flat's diagonal; else its own key. A source key
  // ('bend:…') is only ever its own bend's.
  function bendKeyMatch(bends, own, diag) {
    own = own || {};
    var keys = bends.map(function (b) { return b.key || bendKey(b); }), out = keys.map(function (k) { return own[k] ? k : null; }), taken = {};
    out.forEach(function (k) { if (k) taken[k] = true; });
    var stale = Object.keys(own).filter(function (k) { return !taken[k] && /^bend@/.test(k); }).map(function (k) {
      var m = /^bend@(-?[\d.]+),(-?[\d.]+),([UD])(-?[\d.]+),R(-?[\d.]+)$/.exec(k);
      return m ? { k: k, m: [+m[1], +m[2]], up: m[3] === 'U', angle: +m[4], R: +m[5] } : null;
    }).filter(Boolean);
    var pairs = [], lim = 0.25 * (diag || 1);
    stale.forEach(function (s) {
      bends.forEach(function (b, i) {
        if (out[i]) return;
        var m = [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2], d = Math.hypot(m[0] - s.m[0], m[1] - s.m[1]);
        if (d > lim) return;
        var same = s.up === !!b.up && Math.abs(s.angle - b.angle) < 0.01 && Math.abs(s.R - b.R) < 1e-4 * (1 + s.R);
        pairs.push({ s: s.k, i: i, d: d + (same ? 0 : lim) });
      });
    });
    pairs.sort(function (p, q) { return p.d - q.d; });
    pairs.forEach(function (p) { if (!out[p.i] && !taken[p.s]) { out[p.i] = p.s; taken[p.s] = true; } });
    return out.map(function (k, i) { return k || keys[i]; });
  }
  function flatData(mesh, model, build) {
    var ctx = _.CTX || {};
    model = model || ctx.model; build = build || ctx.build;
    var units = model ? (model.units === 'in' ? 'in' : 'mm') : null, c = mesh && mesh._drawingFlat;
    if (c && (!units || c.units === units)) return c;
    if (!model || model.type === 'assembly') return c || null;
    var res;
    try {
      if (!model.sheet) throw new Error('Not a sheet-metal part: a flat-pattern view needs a Base Flange.');
      var flat = null, err = null, fb = build;
      if (build && build.flanges && build.planes) {
        try { flat = K.flatPattern(model, build, mesh); } catch (e) { err = e; }
        if (!flat && build.body) try { flat = K.flatPattern(model, build, K.meshFromBody(build.body)); } catch (e2) { err = e2; }
      }
      if (!flat) {
        var m2 = {}; Object.keys(model).forEach(function (k) { if (k !== 'drawings') m2[k] = model[k]; });
        m2 = JSON.parse(JSON.stringify(m2));
        var b2 = K.rebuild(m2);
        try { flat = K.flatPattern(m2, b2, K.meshFromBody(b2.body)); fb = b2; } catch (e3) { throw err || e3; }
      }
      var P = flat.plane, bb = flat.bbox, diag = Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]) || 1;
      var cv = flatCurves(flat.loops, diag), src = bendSources(flat, model, fb, diag);
      res = { units: units, frame: { e: P.n.slice(), u: P.x.slice(), v: P.y.slice() }, lines: cv.lines, circles: cv.circles, arcs: cv.arcs,
        bends: flat.bends.map(function (b, i) {
          var x = { a: b.a.slice(), b: b.b.slice(), up: !!b.up, angle: +b.angle, R: +b.R, i: i, ba: b.ba != null ? +b.ba : null, bd: b.bd != null ? +b.bd : null, method: b.method || null, source: b.source || null };
          x.id = src[i]; x.key = bendKey(x);
          return x;
        }),
        etch: (flat.etch || []).map(function (it) { return JSON.parse(JSON.stringify(it)); }),
        bbox: { umin: bb.min[0], umax: bb.max[0], vmin: bb.min[1], vmax: bb.max[1] }, sheet: flat.sheet, loops: flat.loops.length };
    } catch (e) { res = { units: units, error: String(e && e.message || e) }; }
    if (mesh && typeof mesh === 'object') try { Object.defineProperty(mesh, '_drawingFlat', { value: res, configurable: true, writable: true, enumerable: false }); } catch (e4) { }
    return res;
  }
  // flatProjection(fd) -> a projection (projectView's shape) of the flat: its linework is all visible, bends extra
  function flatProjection(fd) {
    if (fd.proj) return fd.proj;
    var F = fd.frame, bb = fd.error ? { umin: 0, umax: 0, vmin: 0, vmax: 0 } : fd.bbox;
    var pr = { orient: 'Flat pattern', u: F ? F.u : [1, 0, 0], v: F ? F.v : [0, 1, 0], e: F ? F.e : [0, 0, 1], flat: true,
      lines: { visible: fd.lines || [], hidden: [] }, circles: { visible: fd.circles || [], hidden: [] }, arcs: { visible: fd.arcs || [], hidden: [] }, ellipses: { visible: [], hidden: [] },
      all: fd.lines || [], circlesAll: fd.circles || [], arcsAll: fd.arcs || [], bends: fd.bends || [], error: fd.error || null,
      bounds: { umin: bb.umin, umax: bb.umax, vmin: bb.vmin, vmax: bb.vmax },
      stats: { visibleLines: (fd.lines || []).length, hiddenLines: 0, visibleCircles: (fd.circles || []).length, hiddenCircles: 0, bends: (fd.bends || []).length } };
    try { Object.defineProperty(fd, 'proj', { value: pr, configurable: true, writable: true, enumerable: false }); } catch (e) { }
    return pr;
  }
  // bendNoteText(bend, units, opts?) -> 'UP 90° R .030' (inches, ANSI: no leading zero) / 'DOWN 90° R 0.76' (mm): the
  // direction, the bend angle and the inside radius, as SolidWorks' bend notes read; opts.prec overrides the places.
  // Kernel.bendNoteText, when the kernel has it, writes the flat preview's and the flat DXF's notes: the drawing then
  // uses the same text so the three read alike (a set precision still goes through the drawing's own format)
  function bendNoteText(b, units, opts) {
    if (!(opts && opts.prec != null) && typeof K.bendNoteText === 'function') {
      try { var kt = K.bendNoteText(b, units); if (kt) return String(kt); } catch (e) { }
    }
    var ang = Math.round(+b.angle * 10) / 10;
    return (b.up ? 'UP' : 'DOWN') + ' ' + ang + '° R ' + D.numText(+b.R, units, opts && opts.prec != null ? opts.prec : null);
  }
  // bendTag(i) -> 'A', 'B', … 'Z', 'AA', … (Bend Table tags)
  function bendTag(i) { var s = ''; i = Math.max(0, i | 0); do { s = String.fromCharCode(65 + i % 26) + s; i = Math.floor(i / 26) - 1; } while (i >= 0); return s; }

  // ------------------------------------------------------------------ Auxiliary, Crop and Broken views
  // (SolidWorks: Insert ▸ Drawing View ▸ Auxiliary / Crop / Break.) They hook into viewContent, compute, moveView and
  // layout (drawing-sheet.js / drawing-render.js) through _.hook, so those files stay as they are:
  //   * an Auxiliary view (kind 'aux') looks square onto a straight edge of its parent: its frame is the parent's turned
  //     about that edge, it lies along the edge's normal on the sheet (aligned like a projected view, dragged along that
  //     axis only), the parent shows an arrow and the letter, the view is labelled VIEW A-A;
  //   * a Crop (view.crop = { type: 'rect', a: [u, v], b: [u, v] } | { type: 'circle', c: [u, v], r }, model units of
  //     the view's frame) keeps what lies inside: lines, circles, arcs and hatching are clipped exactly;
  //   * a Break (view.breaks = [{ dir: 'vertical' | 'horizontal', a, b, gap, style: 'zigzag' | 'straight' }]: break
  //     lines at u = a and u = b for vertical lines, v for horizontal, gap in paper units) removes the geometry between
  //     the lines and closes the two sides up to the gap; dimensions keep the true values.
  function findV(doc, id) { for (var i = 0; i < doc.views.length; i++) if (doc.views[i].id === id) return doc.views[i]; return null; }
  // auxFrame(P, a, b, sign, projection): the frame seen square onto the edge a-b (parent frame, model units) from the
  // side n = sign × (the edge turned 90° CCW). F.dir = n on the sheet (where the view goes); the edge runs along F.dir
  // turned 90° CW in the view and the parent's depth along F.dir, as Front + up = Top.
  function auxFrame(P, a, b, sign, projection) {
    var tx = b[0] - a[0], ty = b[1] - a[1], L = Math.hypot(tx, ty);
    if (!(L > 1e-12)) throw new Error('An auxiliary view needs a straight edge of some length');
    tx /= L; ty /= L;
    var s = sign < 0 ? -1 : 1, d2 = [-ty * s, tx * s], p2 = [d2[1], -d2[0]], sg = projection === 'first' ? -1 : 1;
    var q3 = V.add(V.scale(P.u, p2[0]), V.scale(P.v, p2[1])), w3 = V.scale(P.e, -sg);
    var Fu = V.add(V.scale(q3, p2[0]), V.scale(w3, d2[0])), Fv = V.add(V.scale(q3, p2[1]), V.scale(w3, d2[1]));
    var F = D.frameOf({ e: V.cross(Fu, Fv), u: Fu, v: Fv, name: 'Auxiliary' });
    F.dir = d2;
    return F;
  }
  // addAuxiliaryView(doc, mesh, parentId, { a, b, sign, x, y, label }): the auxiliary view of edge a-b of the parent
  // (model units in its frame), placed on the side sign picks (1: left of a→b, -1: right), one gap out, aligned. A
  // given x / y is slid onto the alignment axis; without them the view goes outward along it to the first clear spot.
  function addAuxiliaryView(doc, mesh, parentId, opts) {
    opts = opts || {};
    var par = findV(doc, parentId);
    if (!par) throw new Error('No drawing view ' + parentId);
    if (par.kind === 'detail' || par.kind === 'flat') throw new Error('An auxiliary view cannot be made from a ' + (par.kind === 'flat' ? 'flat-pattern' : 'detail') + ' view');
    if (!opts.a || !opts.b) throw new Error('An auxiliary view needs the edge it looks square onto: { a: [u, v], b: [u, v] }');
    var sign = opts.sign < 0 ? -1 : 1, label = opts.label || D.nextLabel(doc), P = D.viewFrame(doc, par), F = auxFrame(P, opts.a, opts.b, sign, doc.sheet.projection);
    var d2 = F.dir, p2 = [d2[1], -d2[0]], s = _.viewScale(doc, par), k = _.paperK(doc.units || 'mm'), g = _.GAP * k;
    var pe = mesh ? D.viewExtents(doc, mesh, par) : { w: 0, h: 0, cu: 0, cv: 0 }, ae = mesh ? D.extentsOf(mesh, F) : { w: 0, h: 0, cu: 0, cv: 0 };
    var dist = (Math.abs(d2[0]) * pe.w + Math.abs(d2[1]) * pe.h) * s / 2 + (Math.abs(d2[0]) * ae.w + Math.abs(d2[1]) * ae.h) * s / 2 + g;
    var off = s * ((ae.cu - pe.cu) * p2[0] + (ae.cv - pe.cv) * p2[1]);
    var base = [par.x + d2[0] * dist + p2[0] * off, par.y + d2[1] * dist + p2[1] * off];
    var v = D.addView(doc, 'Auxiliary', { kind: 'aux', name: 'Auxiliary View ' + label + '-' + label, label: label, parent: par.id, align: null,
      frame: { e: F.e, u: F.u, v: F.v }, aux: { a: [+opts.a[0], +opts.a[1]], b: [+opts.b[0], +opts.b[1]], sign: sign, dir: d2.slice() },
      scale: par.scale ? par.scale.slice() : null, display: 'hlv', x: base[0], y: base[1] });
    if (opts.x != null || opts.y != null) {
      var t = ((opts.x != null ? +opts.x : base[0]) - base[0]) * d2[0] + ((opts.y != null ? +opts.y : base[1]) - base[1]) * d2[1];
      v.x = base[0] + d2[0] * t; v.y = base[1] + d2[1] * t;
    } else if (mesh) auxClear(doc, mesh, v);
    doc.layout = 'manual';
    return v;
  }
  // slides a new auxiliary view outward along its axis until its paper box is clear of the other views
  function auxClear(doc, mesh, v) {
    var k = _.paperK(doc.units || 'mm'), sep = _.GAP * k * 0.6, d2 = v.aux.dir, s = _.viewScale(doc, v), ae = D.extentsOf(mesh, D.viewFrame(doc, v));
    var obs = doc.views.filter(function (o) { return o !== v; }).map(function (o) {
      var e = o.kind === 'detail' && o.detail ? { w: 2 * o.detail.r, h: 2 * o.detail.r } : D.viewExtents(doc, mesh, o), so = _.viewScale(doc, o);
      return { x0: o.x - e.w * so / 2, x1: o.x + e.w * so / 2, y0: o.y - e.h * so / 2 - 14 * k, y1: o.y + e.h * so / 2 };
    });
    var x0 = v.x, y0 = v.y;
    for (var t = 0; t < 2000 * k; t += 2 * k) {
      var x = x0 + d2[0] * t, y = y0 + d2[1] * t, b = { x0: x - ae.w * s / 2, x1: x + ae.w * s / 2, y0: y - ae.h * s / 2 - 14 * k, y1: y + ae.h * s / 2 };
      if (obs.every(function (o) { return b.x1 + sep <= o.x0 || o.x1 + sep <= b.x0 || b.y1 + sep <= o.y0 || o.y1 + sep <= b.y0; })) { v.x = x; v.y = y; return; }
    }
  }
  // setCrop(doc, viewId, region | null): crops a view to a rectangle { type: 'rect', a, b } or a circle { type:
  // 'circle', c, r } (model units in the view's frame); null takes the crop off (SolidWorks: Crop View ▸ Remove Crop)
  function setCrop(doc, viewId, region) {
    var v = findV(doc, viewId);
    if (!v) throw new Error('No drawing view ' + viewId);
    if (region == null) { delete v.crop; return v; }
    if (v.kind === 'detail' || v.kind === 'flat') throw new Error('A ' + (v.kind === 'flat' ? 'flat-pattern' : 'detail') + ' view cannot be cropped');
    if (region.type === 'circle' || (region.c && region.r != null)) {
      if (!(region.r > 0)) throw new Error('A crop circle needs a radius');
      v.crop = { type: 'circle', c: [+region.c[0], +region.c[1]], r: +region.r };
    } else {
      var a = region.a, b = region.b;
      if (!a || !b || Math.abs(a[0] - b[0]) < 1e-9 || Math.abs(a[1] - b[1]) < 1e-9) throw new Error('A crop rectangle needs two opposite corners: { a: [u, v], b: [u, v] }');
      v.crop = { type: 'rect', a: [Math.min(a[0], b[0]), Math.min(a[1], b[1])], b: [Math.max(a[0], b[0]), Math.max(a[1], b[1])] };
    }
    return v;
  }
  // addBreak(doc, viewId, { dir: 'vertical' | 'horizontal', a, b, gap, style }) -> the view: break lines at a and b
  // (model units along u for vertical lines, along v for horizontal ones); gap (paper units) defaults to 10 mm / 0.4 in;
  // style 'zigzag' (default) or 'straight'. A break overlapping one of the same direction replaces it.
  // clearBreaks(doc, viewId): Un-Break View.
  function addBreak(doc, viewId, opts) {
    var v = findV(doc, viewId);
    if (!v) throw new Error('No drawing view ' + viewId);
    if (v.kind === 'detail' || v.kind === 'flat') throw new Error('A ' + (v.kind === 'flat' ? 'flat-pattern' : 'detail') + ' view cannot be broken');
    opts = opts || {};
    var dir = /^h/i.test(opts.dir || '') ? 'horizontal' : 'vertical', a = Math.min(+opts.a, +opts.b), b = Math.max(+opts.a, +opts.b);
    if (!isFinite(a) || !isFinite(b) || b - a < 1e-9) throw new Error('A break needs two different break line positions a and b');
    var gap = opts.gap != null ? +opts.gap : (doc.units === 'in' ? 0.4 : 10);
    var brk = { dir: dir, a: a, b: b, gap: Math.max(0, gap), style: opts.style === 'straight' ? 'straight' : 'zigzag' };
    var list = (v.breaks || []).filter(function (o) { return o.dir !== dir || o.b < a || o.a > b; });
    list.push(brk);
    list.sort(function (x, y) { return x.a - y.a; });
    v.breaks = list;
    return v;
  }
  function clearBreaks(doc, viewId) { var v = findV(doc, viewId); if (v) delete v.breaks; return v; }

  // ---- crop: a projection clipped to a rectangle R = [u0, v0, u1, v1]
  function segInRect(l, R) {
    var x0 = l[0], y0 = l[1], dx = l[2] - l[0], dy = l[3] - l[1], t0 = 0, t1 = 1;
    var pq = [[-dx, x0 - R[0]], [dx, R[2] - x0], [-dy, y0 - R[1]], [dy, R[3] - y0]];
    for (var i = 0; i < 4; i++) {
      var p = pq[i][0], q = pq[i][1];
      if (Math.abs(p) < 1e-15) { if (q < 0) return null; continue; }
      var r = q / p;
      if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    if (t1 - t0 < 1e-12) return null;
    var out = l.slice(); out[0] = x0 + dx * t0; out[1] = y0 + dy * t0; out[2] = x0 + dx * t1; out[3] = y0 + dy * t1;
    return out;
  }
  // the angle ranges (degrees, CCW, a0 < a1, a0 in [0, 360)) of circle (c, r) on which inside(point) holds, split at the
  // crossing angles cuts (radians); 'full' when all of it does
  function circleRanges(c, r, cuts, inside) {
    var ang = cuts.map(function (t) { var d = t * 180 / Math.PI % 360; return d < 0 ? d + 360 : d; }).sort(function (x, y) { return x - y; });
    if (!ang.length) return inside([c[0] + r, c[1]]) ? 'full' : [];
    var out = [];
    for (var i = 0; i < ang.length; i++) {
      var lo = ang[i], hi = i + 1 < ang.length ? ang[i + 1] : ang[0] + 360;
      if (hi - lo < 1e-9) continue;
      var mid = (lo + hi) / 2 * Math.PI / 180;
      if (inside([c[0] + r * Math.cos(mid), c[1] + r * Math.sin(mid)])) {
        if (out.length && Math.abs(out[out.length - 1].a1 - lo) < 1e-9) out[out.length - 1].a1 = hi; else out.push({ a0: lo, a1: hi });
      }
    }
    if (out.length > 1 && Math.abs(out[out.length - 1].a1 - 360 - out[0].a0) < 1e-9) { var last = out.pop(); out[0] = { a0: last.a0, a1: out[0].a1 + 360 }; }
    if (out.length === 1 && out[0].a1 - out[0].a0 >= 360 - 1e-9) return 'full';
    return out;
  }
  // crossings of circle (c, r) with the lines x = X (xs) and y = Y (ys): angles in radians
  function circleCuts(c, r, xs, ys) {
    var cuts = [];
    xs.forEach(function (X) { var q = (X - c[0]) / r; if (Math.abs(q) < 1) { var t = Math.acos(q); cuts.push(t, -t); } });
    ys.forEach(function (Y) { var q = (Y - c[1]) / r; if (Math.abs(q) < 1) { var t = Math.asin(q); cuts.push(t, Math.PI - t); } });
    return cuts;
  }
  function arcPieces(a, ranges) {
    if (ranges === 'full') return [a];
    var out = [];
    ranges.forEach(function (w) {
      for (var j = -2; j <= 2; j++) {
        var lo = Math.max(a.a0, w.a0 + 360 * j), hi = Math.min(a.a1, w.a1 + 360 * j);
        if (hi - lo > 1e-9) out.push(Object.assign({}, a, { a0: lo, a1: hi }));
      }
    });
    return out;
  }
  function clipProjectionRect(pr, R) {
    var eps = 1e-9;
    function inside(p) { return p[0] >= R[0] - eps && p[0] <= R[2] + eps && p[1] >= R[1] - eps && p[1] <= R[3] + eps; }
    function ranges(c, r) { return circleRanges(c, r, circleCuts(c, r, [R[0], R[2]], [R[1], R[3]]), inside); }
    var out = { orient: pr.orient, u: pr.u, v: pr.v, e: pr.e, lines: { visible: [], hidden: [], tangent: [] }, circles: { visible: [], hidden: [], tangent: [] }, arcs: { visible: [], hidden: [], tangent: [] },
      ellipses: { visible: [], hidden: [] }, all: [], circlesAll: [], arcsAll: [] };
    if (pr.pending) out.pending = true;
    ['visible', 'hidden', 'tangent'].forEach(function (k) {
      (pr.lines[k] || []).forEach(function (l) { var q = segInRect(l, R); if (q) out.lines[k].push(q); });
      (pr.circles[k] || []).forEach(function (c) {
        var q = ranges(c.c, c.r);
        if (q === 'full') out.circles[k].push(c); else q.forEach(function (w) { out.arcs[k].push({ c: c.c, r: c.r, a0: w.a0, a1: w.a1, body: c.body || 0 }); });
      });
      (pr.arcs && pr.arcs[k] || []).forEach(function (a) { arcPieces(a, ranges(a.c, a.r)).forEach(function (x) { out.arcs[k].push(x); }); });
      if (k === 'tangent') return;
      (pr.ellipses ? pr.ellipses[k] : []).forEach(function (el) {
        var inAll = true, n = Math.max(8, Math.ceil((el.t1 - el.t0) / TWO_PI * 144)), pts = [];
        for (var i = 0; i <= n; i++) { var t = el.t0 + (el.t1 - el.t0) * i / n, p = [el.c[0] + el.ax[0] * Math.cos(t) + el.ay[0] * Math.sin(t), el.c[1] + el.ax[1] * Math.cos(t) + el.ay[1] * Math.sin(t)]; pts.push(p); if (!inside(p)) inAll = false; }
        if (inAll) { out.ellipses[k].push(el); return; }
        for (var j = 1; j < pts.length; j++) { var q2 = segInRect([pts[j - 1][0], pts[j - 1][1], pts[j][0], pts[j][1], el.body || 0], R); if (q2) out.lines[k].push(q2); }
      });
    });
    (pr.all || []).forEach(function (l) { var q = segInRect(l, R); if (q) out.all.push(q); });
    (pr.circlesAll || []).forEach(function (c) { if (ranges(c.c, c.r) === 'full') out.circlesAll.push(c); });
    (pr.arcsAll || []).forEach(function (a) { if (inside([a.c[0] - a.r, a.c[1] - a.r]) && inside([a.c[0] + a.r, a.c[1] + a.r])) out.arcsAll.push(a); });
    var b = pr.bounds || { umin: R[0], umax: R[2], vmin: R[1], vmax: R[3] };
    out.bounds = { umin: Math.max(b.umin, R[0]), umax: Math.min(b.umax, R[2]), vmin: Math.max(b.vmin, R[1]), vmax: Math.min(b.vmax, R[3]) };
    if (out.bounds.umin > out.bounds.umax) out.bounds.umin = out.bounds.umax = (R[0] + R[2]) / 2;
    if (out.bounds.vmin > out.bounds.vmax) out.bounds.vmin = out.bounds.vmax = (R[1] + R[3]) / 2;
    out.stats = { visibleLines: out.lines.visible.length, hiddenLines: out.lines.hidden.length, visibleCircles: out.circles.visible.length, hiddenCircles: out.circles.hidden.length,
      visibleArcs: out.arcs.visible.length, hiddenArcs: out.arcs.hidden.length };
    return out;
  }
  // a polygon loop clipped to the rectangle (Sutherland–Hodgman)
  function loopInRect(loop, R) {
    var pts = loop;
    [[0, 1, R[0]], [0, -1, R[2]], [1, 1, R[1]], [1, -1, R[3]]].forEach(function (cl) {
      var ax = cl[0], sg = cl[1], lim = cl[2], out = [];
      function inn(p) { return sg * (p[ax] - lim) >= 0; }
      for (var i = 0; i < pts.length; i++) {
        var P = pts[i], Q = pts[(i + 1) % pts.length], pi = inn(P), qi = inn(Q);
        if (pi) out.push(P);
        if (pi !== qi) { var t = (lim - P[ax]) / (Q[ax] - P[ax]); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
      }
      pts = out;
    });
    return pts.length >= 3 ? pts : null;
  }
  // cropContent(ct, crop): the view content limited to the crop region (a fresh object; cached projections untouched)
  function cropContent(ct, crop) {
    var o = {}; Object.keys(ct).forEach(function (q) { o[q] = ct[q]; });
    if (crop.type === 'circle') {
      o.proj = clipProjection(ct.proj, crop.c, crop.r);
      var b0 = ct.proj.bounds, b1 = o.proj.bounds;
      if (b0) o.proj.bounds = { umin: Math.max(b0.umin, b1.umin), umax: Math.min(b0.umax, b1.umax), vmin: Math.max(b0.vmin, b1.vmin), vmax: Math.min(b0.vmax, b1.vmax) };
      if (!o.clip) o.clip = { c: crop.c.slice(), r: crop.r };
    } else {
      var R = [crop.a[0], crop.a[1], crop.b[0], crop.b[1]];
      o.proj = clipProjectionRect(ct.proj, R);
      o.caps = (ct.caps || []).map(function (cap) {
        var c2 = {}; Object.keys(cap).forEach(function (q) { c2[q] = cap[q]; });
        c2.loops = cap.loops.map(function (l) { return loopInRect(l, R); }).filter(Boolean);
        return c2;
      }).filter(function (c) { return c.loops.length; });
    }
    o.crop = crop;
    return o;
  }
  _.hook(_, 'viewContent', function (base) {
    return function (doc, v, mesh, parentContent) {
      var ct = base(doc, v, mesh, parentContent);
      if (!ct || !ct.proj) return ct;
      // an auxiliary view keeps its projection lines square to the parent's edge wherever it sits along them
      if (v.kind === 'aux' && v.aux && v.parent != null && parentContent) {
        var par = findV(doc, v.parent);
        if (par && Math.abs(_.viewScale(doc, par) - ct.scale) < 1e-12) {
          var pc = parentContent(par), d2 = v.aux.dir, p2 = [d2[1], -d2[0]], s = ct.scale;
          var want = pc.center[0] * p2[0] + pc.center[1] * p2[1] + ((v.x - par.x) * p2[0] + (v.y - par.y) * p2[1]) / s;
          var have = ct.center[0] * p2[0] + ct.center[1] * p2[1];
          ct.center = [ct.center[0] + (want - have) * p2[0], ct.center[1] + (want - have) * p2[1]];
        }
      }
      if (v.crop && v.kind !== 'detail' && v.kind !== 'flat') ct = cropContent(ct, v.crop);
      return ct;
    };
  });

  // ---- breaks: a piecewise-linear map of the sheet along one axis
  // bandMap(bands): bands [{ lo, hi, gap }] in sheet units, sorted -> { fwd(x), inv(x), bands: [{ lo, hi, olo, ohi }] }:
  // the paper between lo and hi is squeezed into the gap and the two sides move in by half the removed length each, so
  // the view keeps its centre
  function bandMap(bands) {
    var T = 0; bands.forEach(function (b) { T += Math.max(0, b.hi - b.lo - b.gap); });
    var kin = [], kout = [], acc = T / 2, out = [];
    bands.forEach(function (b) {
      var R = Math.max(0, b.hi - b.lo - b.gap);
      kin.push(b.lo, b.hi); kout.push(b.lo + acc, b.lo + acc + (b.hi - b.lo - R));
      out.push({ lo: b.lo, hi: b.hi, olo: b.lo + acc, ohi: b.lo + acc + (b.hi - b.lo - R) });
      acc -= R;
    });
    function pw(x, A, B) {
      if (!A.length) return x;
      if (x <= A[0]) return x + B[0] - A[0];
      for (var i = 1; i < A.length; i++) if (x <= A[i]) return A[i] - A[i - 1] > 1e-15 ? B[i - 1] + (x - A[i - 1]) * (B[i] - B[i - 1]) / (A[i] - A[i - 1]) : B[i];
      return x + B[A.length - 1] - A[A.length - 1];
    }
    return { fwd: function (x) { return pw(x, kin, kout); }, inv: function (x) { return pw(x, kout, kin); }, bands: out };
  }
  function inBand(x, bands) { for (var i = 0; i < bands.length; i++) if (x > bands[i].lo + 1e-9 && x < bands[i].hi - 1e-9) return true; return false; }
  function copyOf(p) { var q = {}; Object.keys(p).forEach(function (kk) { q[kk] = p[kk]; }); return q; }
  // applyBreaks(sheet, w, k): the view's linework clipped out of the bands and closed up, its dimensions and
  // annotations moved with it (their values stay the true ones), break lines drawn at the edges of every gap
  function applyBreaks(sheet, w, k) {
    var v = w.view, ts = w.toSheet, fs = w.fromSheet;
    var vb = [], hb = [];
    v.breaks.forEach(function (b) {
      if (b.dir === 'horizontal') { var y0 = ts([0, b.a])[1], y1 = ts([0, b.b])[1]; hb.push({ lo: Math.min(y0, y1), hi: Math.max(y0, y1), gap: b.gap, style: b.style }); }
      else { var x0 = ts([b.a, 0])[0], x1 = ts([b.b, 0])[0]; vb.push({ lo: Math.min(x0, x1), hi: Math.max(x0, x1), gap: b.gap, style: b.style }); }
    });
    vb.sort(function (p, q) { return p.lo - q.lo; }); hb.sort(function (p, q) { return p.lo - q.lo; });
    var MX = bandMap(vb), MY = bandMap(hb);
    function M(p) { return [MX.fwd(p[0]), MY.fwd(p[1])]; }
    function cut(p) { return inBand(p[0], vb) || inBand(p[1], hb); }
    var xs = [], ys = [];
    vb.forEach(function (b) { xs.push(b.lo, b.hi); }); hb.forEach(function (b) { ys.push(b.lo, b.hi); });
    var out = [], L = w.layer;
    sheet.prims.forEach(function (p) {
      var mine = p.layer === L && p.view == null, ann = p.view === v.id;
      if (!mine && !ann) { out.push(p); return; }
      var q = copyOf(p);
      if (ann || p.k === 'text' || p.k === 'fill' || p.k === 'pending') {
        if (q.a) q.a = M(q.a); if (q.b) q.b = M(q.b); if (q.p) q.p = M(q.p); if (q.c) q.c = M(q.c);
        if (q.pts) q.pts = q.pts.map(M);
        if (q.box) { var b0 = M([q.box.x0, q.box.y0]), b1 = M([q.box.x1, q.box.y1]); q.box = { x0: b0[0], y0: b0[1], x1: b1[0], y1: b1[1] }; }
        out.push(q); return;
      }
      delete q.chain;
      if (p.k === 'line') {
        var dx = p.b[0] - p.a[0], dy = p.b[1] - p.a[1], tt = [0, 1];
        xs.forEach(function (X) { if (Math.abs(dx) > 1e-15) { var t = (X - p.a[0]) / dx; if (t > 0 && t < 1) tt.push(t); } });
        ys.forEach(function (Y) { if (Math.abs(dy) > 1e-15) { var t = (Y - p.a[1]) / dy; if (t > 0 && t < 1) tt.push(t); } });
        tt.sort(function (x, y) { return x - y; });
        for (var i = 1; i < tt.length; i++) {
          if (tt[i] - tt[i - 1] < 1e-12) continue;
          var tm = (tt[i] + tt[i - 1]) / 2;
          if (cut([p.a[0] + dx * tm, p.a[1] + dy * tm])) continue;
          var r = copyOf(q);
          r.a = M([p.a[0] + dx * tt[i - 1], p.a[1] + dy * tt[i - 1]]); r.b = M([p.a[0] + dx * tt[i], p.a[1] + dy * tt[i]]);
          out.push(r);
        }
        return;
      }
      if (p.k === 'circle' || p.k === 'arc') {
        var rg = circleRanges(p.c, p.r, circleCuts(p.c, p.r, xs, ys), function (pt) { return !cut(pt); });
        var pieces = p.k === 'circle' ? (rg === 'full' ? ['full'] : rg) : arcPieces({ a0: p.a0, a1: p.a1 }, rg);
        pieces.forEach(function (pc) {
          var mid = pc === 'full' ? 0 : (pc.a0 + pc.a1) / 2 * Math.PI / 180, mp = [p.c[0] + p.r * Math.cos(mid), p.c[1] + p.r * Math.sin(mid)], m2 = M(mp);
          var r = copyOf(q);
          r.c = [p.c[0] + m2[0] - mp[0], p.c[1] + m2[1] - mp[1]];
          if (pc !== 'full') { r.k = 'arc'; r.a0 = pc.a0; r.a1 = pc.a1; }
          out.push(r);
        });
        return;
      }
      if (p.k === 'ellipse') {
        var ext = Math.hypot(p.major[0], p.major[1]);
        if (xs.some(function (X) { return Math.abs(X - p.c[0]) < ext; }) || ys.some(function (Y) { return Math.abs(Y - p.c[1]) < ext; })) { if (cut(p.c)) return; }
        q.c = M(p.c); out.push(q); return;
      }
      out.push(q);
    });
    // break lines (thin), straight or zig-zag, at both edges of every gap and a little past the view
    var bx0 = MX.fwd(w.box.x0), bx1 = MX.fwd(w.box.x1), by0 = MY.fwd(w.box.y0), by1 = MY.fwd(w.box.y1), ov = 3 * k;
    function brk(a, b, style) {
      if (style !== 'zigzag') { out.push({ k: 'line', a: a, b: b, layer: L, style: 'thin', breakLine: true }); return; }
      var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), n = Math.max(2, Math.round(len / (6 * k))), amp = 1.5 * k, nx = -dy / len, ny = dx / len, prev = a;
      for (var i = 1; i <= 2 * n; i++) {
        var t = i / (2 * n), o = i === 2 * n ? 0 : (i % 2 ? amp : -amp), pt = [a[0] + dx * t + nx * o, a[1] + dy * t + ny * o];
        out.push({ k: 'line', a: prev, b: pt, layer: L, style: 'thin', breakLine: true }); prev = pt;
      }
    }
    MX.bands.forEach(function (b, i) { [b.olo, b.ohi].forEach(function (x) { brk([x, by0 - ov], [x, by1 + ov], vb[i].style); }); });
    MY.bands.forEach(function (b, i) { [b.olo, b.ohi].forEach(function (y) { brk([bx0 - ov, y], [bx1 + ov, y], hb[i].style); }); });
    sheet.prims = out;
    w.box = { x0: bx0, x1: bx1, y0: by0, y1: by1 };
    w.toSheet = function (p) { return M(ts(p)); };
    w.fromSheet = function (p) { return fs([MX.inv(p[0]), MY.inv(p[1])]); };
    w.breaks = { vertical: MX.bands, horizontal: MY.bands };
    function mapBox(b) { var a0 = M([b.x0, b.y0]), a1 = M([b.x1, b.y1]); return { x0: a0[0], y0: a0[1], x1: a1[0], y1: a1[1] }; }
    (sheet.dims || []).forEach(function (d) {
      if (d.view !== v.id) return;
      if (d.box && isFinite(d.box.x0)) d.box = mapBox(d.box);
      if (d.tbox) d.tbox = mapBox(d.tbox);
      if (d.arrows) d.arrows = d.arrows.map(M);
    });
    (sheet.annotations || []).forEach(function (an) { if (an.view === v.id && an.box && isFinite(an.box.x0)) an.box = mapBox(an.box); });
  }
  // the auxiliary view's label (VIEW A-A) and, on the parent, the arrow square to the edge with the letter
  function auxMarks(sheet, w, pw, k, projection) {
    var v = w.view, L = w.layer, CAP = _.CAP_EM || 1;
    sheet.prims = sheet.prims.filter(function (p) { return !(p.k === 'text' && p.layer === L && p.view == null && /^AUXILIARY/.test(p.text)); });
    sheet.prims.push({ k: 'text', p: [(w.box.x0 + w.box.x1) / 2, w.box.y0 - 7 * k], h: 3.5 * k * CAP, text: 'VIEW ' + v.label + '-' + v.label, anchor: 'middle', layer: L, rot: 0, auxLabel: v.id });
    if (v.scale && D.scaleValue(v.scale) !== D.scaleValue(sheet.scale || [1, 1])) sheet.prims.push({ k: 'text', p: [(w.box.x0 + w.box.x1) / 2, w.box.y0 - 12 * k], h: 3 * k * CAP, text: D.scaleLabel(v.scale), anchor: 'middle', layer: L, rot: 0 });
    if (!pw) return;
    var PL = pw.layer, A = pw.toSheet(v.aux.a), B = pw.toSheet(v.aux.b), M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], d2 = v.aux.dir, sg = projection === 'first' ? -1 : 1;
    var side = [d2[0] * sg, d2[1] * sg], gap = 3 * k, shaft = 10 * k, ar = 3 * k, aw = 0.9 * k, lh = 5 * k;
    var tip = [M[0] + side[0] * gap, M[1] + side[1] * gap], tail = [M[0] + side[0] * (gap + shaft), M[1] + side[1] * (gap + shaft)], dir = [-side[0], -side[1]], n = [-dir[1], dir[0]];
    sheet.prims.push({ k: 'line', a: tail, b: tip, layer: PL, style: 'thick', auxArrow: v.id });
    sheet.prims.push({ k: 'fill', pts: [tip, [tip[0] - dir[0] * ar + n[0] * aw, tip[1] - dir[1] * ar + n[1] * aw], [tip[0] - dir[0] * ar - n[0] * aw, tip[1] - dir[1] * ar - n[1] * aw]], layer: PL, auxArrow: v.id });
    sheet.prims.push({ k: 'text', p: [tail[0] + side[0] * lh * 0.8, tail[1] + side[1] * lh * 0.8 - lh * 0.5], h: lh * CAP, text: v.label, anchor: 'middle', layer: PL, rot: 0, auxArrow: v.id });
  }
  _.hook(D, 'compute', function (base) {
    return function (doc, mesh, model, ctx) {
      var sheet = base(doc, mesh, model, ctx);
      if (!sheet || !sheet.views) return sheet;
      var k = _.paperK(sheet.units), byId = {};
      sheet.views.forEach(function (w) { byId[w.view.id] = w; });
      sheet.views.forEach(function (w) { if (w.view.breaks && w.view.breaks.length && !w.pending) applyBreaks(sheet, w, k); });
      sheet.views.forEach(function (w) {
        if (w.view.kind !== 'aux' || !w.view.aux) return;
        w.ortho = true;   // seen square: edges parallel to the sheet are true length, so Smart Dimension works on it
        auxMarks(sheet, w, w.view.parent != null ? byId[w.view.parent] : null, k, doc.sheet.projection);
      });
      return sheet;
    };
  });
  // auxiliary views follow their parent and slide only along their axis
  function carryAux(doc, before) {
    var moved = {};
    doc.views.forEach(function (v) { var b = before[v.id]; if (b && (Math.abs(b[0] - v.x) > 1e-12 || Math.abs(b[1] - v.y) > 1e-12)) moved[v.id] = [v.x - b[0], v.y - b[1]]; });
    for (var pass = 0, changed = true; changed && pass < 20; pass++) {
      changed = false;
      doc.views.forEach(function (c) {
        if (c.kind !== 'aux' || moved[c.id] || c.parent == null || !moved[c.parent]) return;
        var dlt = moved[c.parent]; c.x += dlt[0]; c.y += dlt[1]; moved[c.id] = dlt; changed = true;
        doc.views.forEach(function (g) { if (g.parent === c.id && g.align && !moved[g.id]) { g.x += dlt[0]; g.y += dlt[1]; moved[g.id] = dlt; } });
      });
    }
  }
  function positions(doc) { var b = {}; (doc.views || []).forEach(function (v) { b[v.id] = [v.x, v.y]; }); return b; }
  _.hook(D, 'moveView', function (base) {
    return function (doc, id, x, y) {
      var v = findV(doc, id);
      if (v && v.kind === 'aux' && v.aux && v.parent != null && findV(doc, v.parent)) {
        var d2 = v.aux.dir, t = (x - v.x) * d2[0] + (y - v.y) * d2[1];
        x = v.x + d2[0] * t; y = v.y + d2[1] * t;
      }
      var before = positions(doc), r = base(doc, id, x, y);
      carryAux(doc, before);
      return r;
    };
  });
  _.hook(D, 'layout', function (base) {
    return function (doc) {
      var before = positions(doc), r = base.apply(this, arguments);
      carryAux(doc, before);
      return r;
    };
  });
  D.auxFrame = auxFrame; D.addAuxiliaryView = addAuxiliaryView; D.setCrop = setCrop; D.addBreak = addBreak; D.clearBreaks = clearBreaks;
  D.clipProjectionRect = clipProjectionRect; D.bandMap = bandMap;

  D.flatCurves = flatCurves; D.bendKey = bendKey; D.bendKeyMatch = bendKeyMatch; D.flatData = flatData; D.flatProjection = flatProjection; D.bendNoteText = bendNoteText; D.bendTag = bendTag;
  D.sectionOf = sectionOf; D.hatchLines = hatchLines; D.hatchStyle = hatchStyle; D.hatchAssign = hatchAssign; D.HATCH_PATTERNS = Object.keys(HATCH_PATTERNS);
  D.hatchPattern = hatchPattern; D.patternLines = patternLines; D.snapHatch = snapHatch; D.clipProjection = clipProjection; D.reattachDim = reattachDim;
  _.sectionKey = sectionKey; _.capLoops = capLoops; _.HATCH_PATTERNS = HATCH_PATTERNS; _.clipSeg = clipSeg; _.primHitsRect = primHitsRect; _.segOutsideRect = segOutsideRect;
})(Drawing, Drawing._);
