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
  // (rfDN) ex: the bodies (assembly component indices) not to section — SolidWorks' Excluded components: they stay
  // whole, uncut and unhatched, in front of the cut (pins, fasteners); the key carries them
  function sectionKey(e, w, ex) { return e.map(function (x) { return Math.round(x * 1e9); }).join(',') + '|' + Math.round(w * 1e9) + (ex && ex.length ? '|x' + ex.join(',') : ''); }
  function sectionOf(mesh, e, w, ex) {
    var c = mesh._drawingSections || (mesh._drawingSections = {});
    ex = ex && ex.length ? ex : null;
    var key = sectionKey(e, w, ex);
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
        if (ex && ex.indexOf(g.b) >= 0) { byBody[g.k].forEach(function (pg) { pg.body = g.b; polys.push(pg); }); return; }   // (rfDN) not sectioned
        CSG.fromPolygons(byBody[g.k]).intersect(box).polygons.forEach(function (pg) { pg.body = g.b; if (g.part != null) pg.part = g.part; polys.push(pg); });
      });
      var sm = K.meshFromBody(polys.length ? CSG.fromPolygons(polys) : null), caps = [], area = 0, tol = diag * 1e-7 + 1e-9;
      sm.faces.forEach(function (f, fi) {
        if (ex && ex.indexOf(f.body || 0) >= 0) return;
        if (V.dot(f.normal, e) > 1 - 1e-9 && Math.abs(f.w - w) <= tol) { caps.push(fi); area += f.area; }
      });
      out = { mesh: sm, caps: caps, area: area };
    }
    out.e = e.slice(); out.w = w;
    if (ex) out.ex = ex.slice();
    c[key] = out;
    return out;
  }
  // (rfDN) excludedBodies(v) -> the body indices of view v's section.excluded (component ids: an assembly's top-level
  // components, whose index is the body index of the assembly mesh), or null; the model is the one being drawn
  // (_.CTX during compute, else the last one compute saw: autoInsert runs outside compute)
  function excludedBodies(v) {
    var ids = v && v.section && v.section.excluded;
    if (!ids || !ids.length) return null;
    var model = (_.CTX && _.CTX.model) || _.lastModel, comps = model && model.components, out = [];
    if (!comps) return null;
    comps.forEach(function (c, i) { if (c && ids.indexOf(String(c.id)) >= 0) out.push(i); });
    return out.length ? out : null;
  }
  // (rfDN) setSectionExcluded(doc, viewId, ids | null): a section view's Excluded components (SolidWorks' Section View
  // dialog of an assembly drawing): those components are drawn whole, unhatched; [] / null clears the list
  function setSectionExcluded(doc, viewId, ids) {
    var v = D.findView(doc, viewId);
    if (!v || v.kind !== 'section' || !v.section) throw new Error('Excluded components: not a section view');
    var list = (ids || []).map(String).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    if (list.length) v.section.excluded = list; else delete v.section.excluded;
    return v;
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
    // (lane DW) acad.pat's dash-dot families: dash [on, off, on, off …] with 0 a dot; shift moves the dashes along each
    // next line (base units), as acad.pat's delta-x
    ANSI35: [{ da: 0, offs: [0], period: 2 }, { da: 0, offs: [1], period: 2, dash: [2.5, 0.5, 0, 0.5] }],   // fire brick, refractory
    ANSI36: [{ da: 0, offs: [0], period: 1, dash: [2.5, 0.5, 0, 0.5], shift: 1.75 }],                  // marble, slate, glass
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
    if (!(sp > 0) || !isFinite(sp)) return out;
    (HATCH_PATTERNS[pattern] || HATCH_PATTERNS.ANSI31).forEach(function (fam) {
      var a = ang + fam.da, d = [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)];
      fam.offs.forEach(function (o) {
        hatchLines(loops, sp * fam.period, a, sp * o).forEach(function (l) {
          if (!fam.dash) { out.push(l); return; }
          // the dashes of one period: [start, length] (a dot is a dash 0.05 long)
          var ds = [], at = 0;
          for (var di = 0; di < fam.dash.length; di++) { var dl = fam.dash[di] * sp; if (di % 2 === 0) ds.push([at, dl > 0 ? dl : 0.05 * sp]); at += dl; }
          var P = at, t0 = d[0] * l[0] + d[1] * l[1], t1 = d[0] * l[2] + d[1] * l[3], ph = 0;
          var lo = Math.min(t0, t1), hi = Math.max(t0, t1), bx = l[0] - d[0] * t0, by = l[1] - d[1] * t0;
          if (fam.shift) { var nn = -d[1] * l[0] + d[0] * l[1]; ph = Math.round((nn - sp * o) / (sp * fam.period)) * fam.shift * sp; ph -= Math.floor(ph / P) * P; }
          for (var s = Math.floor((lo - ph) / P) * P + ph; s < hi; s += P) {
            ds.forEach(function (q) {
              var u0 = Math.max(lo, s + q[0]), u1 = Math.min(hi, s + q[0] + q[1]);
              if (u1 - u0 > 1e-9) out.push([bx + d[0] * u0, by + d[1] * u0, bx + d[0] * u1, by + d[1] * u1]);
            });
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
    if (p.k === 'region') {   // (rfAG) a solid fill: an edge crosses the box, or the box lies inside it
      for (var li = 0; li < p.loops.length; li++) { var lp = p.loops[li]; for (var lj = 0; lj < lp.length; lj++) if (segHits(lp[lj], lp[(lj + 1) % lp.length])) return true; }
      return inLoops([(R[0] + R[2]) / 2, (R[1] + R[3]) / 2], p.loops);
    }
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
  // (rfAG) solid fills (k 'region': loops filled even-odd). clipLoopsConvex(loops, C): each loop clipped to the convex
  // polygon C (Sutherland-Hodgman), so the even-odd interior of the result is the region's inside C; loops left with
  // under three points are dropped
  function clipLoopsConvex(loops, C) {
    var n = C.length, area = 0;
    for (var i = 0; i < n; i++) area += C[i][0] * C[(i + 1) % n][1] - C[(i + 1) % n][0] * C[i][1];
    var sg = area < 0 ? -1 : 1, out = [];
    loops.forEach(function (l) {
      var P = l;
      for (var e = 0; e < n && P.length; e++) {
        var a = C[e], b = C[(e + 1) % n], Q = [];
        var side = function (q) { return sg * ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])); };
        for (var j = 0; j < P.length; j++) {
          var p0 = P[j], p1 = P[(j + 1) % P.length], s0 = side(p0), s1 = side(p1);
          if (s0 >= 0) Q.push(p0);
          if ((s0 >= 0) !== (s1 >= 0)) { var t = s0 / (s0 - s1); Q.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]); }
        }
        P = Q;
      }
      if (P.length >= 3) out.push(P);
    });
    return out;
  }
  function circlePoly(c, r, n) { var P = []; n = n || 128; for (var i = 0; i < n; i++) { var t = i / n * 2 * Math.PI; P.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]); } return P; }
  // the convex hull of points P (counter-clockwise)
  function convexHull(P) {
    var pts = P.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    if (pts.length < 3) return pts;
    function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], up = [];
    pts.forEach(function (p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
    for (var i = pts.length - 1; i >= 0; i--) { var p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }
  // a region primitive with the loops replaced (null when nothing is left)
  function withLoops(p, loops) {
    if (!loops.length) return null;
    var q = {}; Object.keys(p).forEach(function (kk) { q[kk] = p[kk]; }); q.loops = loops;
    return q;
  }
  // a region primitive less the rectangle R = [x0, y0, x1, y1] (a clear island round a letter): up to four pieces, the
  // parts left of, right of, below and above R
  function regionOutsideRect(p, R) {
    var B = 1e7, cells = [[-B, -B, R[0], B], [R[2], -B, B, B], [R[0], -B, R[2], R[1]], [R[0], R[3], R[2], B]], out = [];
    cells.forEach(function (c) { var q = withLoops(p, clipLoopsConvex(p.loops, [[c[0], c[1]], [c[2], c[1]], [c[2], c[3]], [c[0], c[3]]])); if (q) out.push(q); });
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
  // (rfLG) dimAxis(kind, rot) -> the unit direction a horizontal / vertical dimension measures along in its view's
  // frame: [1, 0] / [0, 1] turned by rot degrees (d.rot: the view was turned by Rotate View at an angle that is not a
  // multiple of 90°, and the dimension went with the geometry); null for any other kind. dimSpan(d, A, B): its value.
  function dimAxis(kind, rot) {
    if (kind !== 'h' && kind !== 'v') return null;
    var r = (+rot || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return kind === 'h' ? [c, s] : [-s, c];
  }
  function dimSpan(d, A, B) {
    var t = dimAxis(d.kind, d.rot);
    if (!t) return Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (!d.rot) return Math.abs(B[d.kind === 'h' ? 0 : 1] - A[d.kind === 'h' ? 0 : 1]);
    return Math.abs((B[0] - A[0]) * t[0] + (B[1] - A[1]) * t[1]);
  }
  _.dimAxis = dimAxis; _.dimSpan = dimSpan;
  function reattachDim(d, pr) {
    var b = pr.bounds, size = Math.max(1e-9, Math.hypot(b.umax - b.umin, b.vmax - b.vmin)), tol = size * 1e-6, reach = size * 0.25;
    var best = null, bs = Infinity;
    // (rfAL) a diameter / radius of an ellipse (a circle seen obliquely): the ellipse with the same centre and true
    // radius (else the nearest with the same radius, as for circles); full for a diameter, a part arc for a radius
    if (d.ell && (d.kind === 'dia' || d.kind === 'rad')) {
      var els = pr.ellipses ? (pr.ellipses.visible || []).concat(pr.ellipses.hidden || []) : [];
      els.forEach(function (c) {
        if (d.kind === 'dia' && !(c.full || c.whole)) return;
        var R = D.ellipseRadius(c.ax, c.ay), dc = Math.hypot(c.c[0] - d.c[0], c.c[1] - d.c[1]), dr = Math.abs(R - d.r);
        var da = Math.min(Math.hypot(c.ax[0] - d.ell.ax[0], c.ax[1] - d.ell.ax[1]) + Math.hypot(c.ay[0] - d.ell.ay[0], c.ay[1] - d.ell.ay[1]),
          Math.hypot(c.ax[0] + d.ell.ax[0], c.ax[1] + d.ell.ax[1]) + Math.hypot(c.ay[0] + d.ell.ay[0], c.ay[1] + d.ell.ay[1])) / size;
        var s = dc <= tol ? (dr <= tol ? da : 1 + Math.min(dr / size, 0.9)) : (dr <= tol && dc <= reach ? 2 + dc / reach : Infinity);
        if (s < bs) { bs = s; best = c; }
      });
      if (!best) { d.dangling = true; return false; }
      d.c = best.c.slice(); d.r = D.ellipseRadius(best.ax, best.ay); d.value = (d.kind === 'dia' ? 2 : 1) * d.r;
      d.ell = { ax: best.ax.slice(), ay: best.ay.slice() };
      if (d.kind === 'rad' && !best.full) { d.ell.t0 = best.t0; d.ell.t1 = best.t1; }
      delete d.dangling;
      return true;
    }
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
    var t = [(bb[0] - a[0]) / L, (bb[1] - a[1]) / L], hit = null, hitC = null, bsC = Infinity;
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
      if (off <= tol && ov > tol && (Math.abs(lo) <= tol || Math.abs(hi - L) <= tol) && sc < bsC) { bsC = sc; hitC = { m: m, lo: lo, hi: hi, forward: p1 >= p0 }; }
    });
    // (rfLA) while a piece of the edge itself is still drawn (on its line, from one of its own ends: a flange added on
    // that edge leaves the corners' ends of it), the dimension stays on that line: a parallel edge nearby is other
    // geometry (a bend's inner face), and taking it would show a wrong value as if nothing had happened. A whole edge
    // that moved (a thicker gauge, a longer part) leaves no such piece and is followed as before (a short leftover
    // in the middle of the old line, a blind hole's bottom, is not the edge).
    if (hitC && hit && hit !== hitC && bs > -1) hit = hitC;
    if (!hit) { d.dangling = true; return false; }
    var m0 = [hit.m[0], hit.m[1]], m1 = [hit.m[2], hit.m[3]], bd = bound(hit.m);
    d.a = hit.forward ? m0 : m1; d.b = hit.forward ? m1 : m0;
    if (bd) d.bound = bd; else delete d.bound;
    d.value = d.kind === 'h' || d.kind === 'v' ? dimSpan(d, d.a, d.b) : hit.hi - hit.lo;
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
      var s0 = 0, best = -1, tns = [];
      for (var k = 0; k < n; k++) { var tk = turn(p[(k + n - 1) % n], p[k], p[(k + 1) % n]); tns.push(tk); if (Math.abs(tk) > best) { best = Math.abs(tk); s0 = k; } }
      // q[i..j] is one arc: on the circle through its ends and middle, turning one way by 0.1–30° per chord
      function arcOf(q, i, j) {
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
      function fitFrom(st) {
        var q = [];
        for (var j = 0; j <= n; j++) q.push(p[(st + j) % n]);
        var i0 = 0, seq = [];
        while (i0 < n) {
          var j0 = -1, Cb = null;
          for (var jj = i0 + 3; jj <= n; jj++) { var Cj = arcOf(q, i0, jj); if (Cj) { j0 = jj; Cb = Cj; } else if (j0 >= 0) break; }
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
        return seq;
      }
      function score(sq) { var L = 0; sq.forEach(function (s) { if (s.line) L++; }); return L * 1000 + sq.length; }
      var seq = fitFrom(s0);
      // (rfAD) with no corner over 30° (an arc slot: four arcs meeting tangentially) the sharpest vertex can lie inside
      // an end arc, leaving a one-chord line and a short arc; then also try starting where two arcs meet (the largest
      // change of turn between a vertex's neighbours) and keep that fit when it is all arcs
      if (best <= Math.PI / 6 && n > 4) {
        var s1 = s0, bj = -1;
        for (var k4 = 0; k4 < n; k4++) { var dj = Math.abs(tns[(k4 + 1) % n] - tns[(k4 + n - 1) % n]); if (dj > bj) { bj = dj; s1 = k4; } }
        if (s1 !== s0 && score(seq) >= 1000) { var seq1 = fitFrom(s1); if (score(seq1) < 1000) seq = seq1; }
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
      // (rfAB) origin: the base sketch plane's origin, so a point of the base maps to the flat as to2D(plane, p)
      res = { units: units, frame: { e: P.n.slice(), u: P.x.slice(), v: P.y.slice() }, origin: (P.origin || [0, 0, 0]).slice(), lines: cv.lines, circles: cv.circles, arcs: cv.arcs,
        bends: flat.bends.map(function (b, i) {
          var x = { a: b.a.slice(), b: b.b.slice(), up: !!b.up, angle: +b.angle, R: +b.R, i: i, ba: b.ba != null ? +b.ba : null, bd: b.bd != null ? +b.bd : null, method: b.method || null, source: b.source || null };
          x.id = src[i]; x.key = bendKey(x);
          return x;
        }),
        etch: (flat.etch || []).map(function (it) { return JSON.parse(JSON.stringify(it)); }),
        regionLines: flat.regionLines ? flat.regionLines.map(function (rl) { return { a: rl.a.slice(0, 2), b: rl.b.slice(0, 2), bend: rl.bend }; }) : null,   // (rfJM) Merge faces off
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

  // ------------------------------------------------------------------ Half, Offset and Aligned sections (rfP)
  // (SolidWorks: Section View ▸ Half Section, an offset cutting line, Aligned section.) A section view's v.section may
  // carry a type besides the full section's { axis, at, sign } (t is the coordinate along the cutting line: u for a
  // horizontal line, v for a vertical one; n the one across it; model units in the parent's frame):
  //   * { type: 'half', c, side }: only the half of the line on the side `side` (+1: t > c) cuts; the other half is
  //     seen from outside. The quarter on the viewer's side of the cut half is taken away; the parent shows the L-shaped
  //     cutting line (the cut leg along the line to the centre c, then square to it out of the part) with one arrow;
  //   * { type: 'offset', jogs: [{ t, at }] }: a stepped cutting line, at depth `at` up to jogs[0].t, then jogs[0].at
  //     up to jogs[1].t, …; every leg is hatched and the steps are not drawn in the view (ASME Y14.3);
  //   * { type: 'aligned', c, side, angle }: two legs from the centre (c along the line, on it): leg 1 along the line
  //     towards `side`, leg 2 at `angle` degrees (parent frame); what lies behind leg 2 is turned about the centre into
  //     leg 1's plane, so both cut faces show at true size.
  // The cut is worked out on the main thread (a few CSG booleans) and cached on the mesh like a full section.
  function secAxes(P, sc) {
    var N3 = sc.axis === 'h' ? P.v : P.u, T3 = sc.axis === 'h' ? P.u : P.v, s = sc.sign < 0 ? -1 : 1;
    return { e: V.scale(N3, s), t: T3, z: V.cross(P.u, P.v), s: s, n2: sc.axis === 'h' ? [0, s] : [s, 0], t2: sc.axis === 'h' ? [1, 0] : [0, 1] };
  }
  // the kept steps of a half / offset section: [{ lo, hi, at }] along t (at null: nothing cut there)
  function sectionSteps(sc) {
    var I = Infinity;
    if (sc.type === 'half') return sc.side < 0 ? [{ lo: -I, hi: sc.c, at: sc.at }, { lo: sc.c, hi: I, at: null }] : [{ lo: -I, hi: sc.c, at: null }, { lo: sc.c, hi: I, at: sc.at }];
    var js = (sc.jogs || []).slice().sort(function (p, q) { return p.t - q.t; }), out = [], lo = -I, at = sc.at;
    js.forEach(function (j) { out.push({ lo: lo, hi: j.t, at: at }); lo = j.t; at = j.at; });
    out.push({ lo: lo, hi: I, at: at });
    return out;
  }
  function rangeOn(P, a) {
    var mn = Infinity, mx = -Infinity;
    for (var i = 0; i < P.length; i += 3) { var x = P[i] * a[0] + P[i + 1] * a[1] + P[i + 2] * a[2]; if (x < mn) mn = x; if (x > mx) mx = x; }
    return P.length ? [mn, mx] : [0, 0];
  }
  function rot2(d, th) { var c = Math.cos(th), s = Math.sin(th); return [d[0] * c - d[1] * s, d[0] * s + d[1] * c]; }
  function to3(P, d) { return V.add(V.scale(P.u, d[0]), V.scale(P.v, d[1])); }
  // the legs of an aligned section in the parent frame: { C, d1, d2, n1, n2, th } (th turns d2 onto -d1)
  function alignedLegs(sc) {
    var ax = secAxes({ u: [1, 0, 0], v: [0, 1, 0], e: [0, 0, 1] }, sc), side = sc.side < 0 ? -1 : 1;
    var d1 = [ax.t2[0] * side, ax.t2[1] * side], a = (+sc.angle || 0) * Math.PI / 180, d2 = [Math.cos(a), Math.sin(a)];
    var C = sc.axis === 'h' ? [sc.c, sc.at] : [sc.at, sc.c];
    var th = Math.atan2(-d1[1], -d1[0]) - Math.atan2(d2[1], d2[0]);
    return { C: C, d1: d1, d2: d2, n1: ax.n2, n2: rot2(ax.n2, -th), th: th };
  }
  function secKey(P, sc) {
    var r = function (x) { return Math.round(x * 1e9); };
    return 'P|' + [P.u, P.v].map(function (a) { return a.map(r).join(','); }).join('|') + '|' + JSON.stringify({ t: sc.type, a: sc.axis, s: sc.sign, at: sc.at, c: sc.c, side: sc.side, ang: sc.angle, j: sc.jogs });
  }
  // pathSectionOf(mesh, P, sc) -> { mesh, caps, area, e, w }: the part cut along a half / offset / aligned line
  function pathSectionOf(mesh, P, sc) {
    var cache = mesh._drawingSections || (mesh._drawingSections = {}), key = secKey(P, sc);
    if (cache[key]) return cache[key];
    var X = secAxes(P, sc), Pp = mesh.positions64 || mesh.positions, diag = meshDiag(mesh), m = diag * 0.25 + 1;
    function box(ax, lo, hi) {   // a null / infinite end: the part's range on that axis, widened
      var L = [], H = [];
      for (var i = 0; i < 3; i++) { var r = rangeOn(Pp, ax[i]); L.push(lo[i] == null || lo[i] === -Infinity ? r[0] - m : lo[i]); H.push(hi[i] == null || hi[i] === Infinity ? r[1] + m : hi[i]); }
      return boxSolid(ax, L, H);
    }
    var pieces = [], ws = [];   // [{ region: CSG, turn: point map | null }]
    if (sc.type === 'aligned') {
      var G = alignedLegs(sc), C3 = to3(P, G.C), n1 = to3(P, G.n1), d1 = to3(P, G.d1), n2 = to3(P, G.n2), d2 = to3(P, G.d2), ct = Math.cos(G.th), st = Math.sin(G.th);
      pieces.push({ region: box([n1, d1, X.z], [null, V.dot(d1, C3), null], [V.dot(n1, C3), null, null]), turn: null });
      pieces.push({ region: box([n2, d2, X.z], [null, V.dot(d2, C3), null], [V.dot(n2, C3), null, null]), turn: function (q) {
        var p = [q.x - C3[0], q.y - C3[1], q.z - C3[2]], a = V.dot(p, P.u), b = V.dot(p, P.v), r = V.sub(p, V.add(V.scale(P.u, a), V.scale(P.v, b)));
        var o = V.add(C3, V.add(r, V.add(V.scale(P.u, a * ct - b * st), V.scale(P.v, a * st + b * ct))));
        return new CSG.Vector(o[0], o[1], o[2]);
      } });
      ws.push(V.dot(n1, C3));
    } else {
      var keep = null;
      sectionSteps(sc).forEach(function (s0) {
        if (!(s0.hi > s0.lo)) return;
        var b = box([X.e, X.t, X.z], [null, s0.lo, null], [s0.at == null ? null : X.s * s0.at, s0.hi, null]);
        keep = keep ? keep.union(b) : b;
        if (s0.at != null) ws.push(X.s * s0.at);
      });
      pieces.push({ region: keep, turn: null });
    }
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
      var solid = CSG.fromPolygons(byBody[g.k]), acc = null;
      pieces.forEach(function (pc) {
        var r = solid.intersect(pc.region);
        if (pc.turn) r = r.transform(pc.turn, false);
        acc = acc ? acc.union(r) : r;
      });
      (acc ? acc.polygons : []).forEach(function (pg) { pg.body = g.b; if (g.part != null) pg.part = g.part; polys.push(pg); });
    });
    var sm = K.meshFromBody(polys.length ? CSG.fromPolygons(polys) : null), caps = [], area = 0, tol = diag * 1e-7 + 1e-9;
    sm.faces.forEach(function (f, fi) {
      if (V.dot(f.normal, X.e) > 1 - 1e-9 && ws.some(function (w) { return Math.abs(f.w - w) <= tol; })) { caps.push(fi); area += f.area; }
    });
    var out = { mesh: sm, caps: caps, area: area, e: X.e.slice(), w: ws[0], path: sc.type };
    cache[key] = out;
    return out;
  }
  // drops the lines of a stepped section's projection that run between two hatched faces (the steps of an offset line,
  // the seam of an aligned one): a section view does not show them
  function dropSeams(pr, caps) {
    var all = []; caps.forEach(function (c) { c.loops.forEach(function (l) { all.push(l); }); });
    if (!all.length) return pr;
    function inside(p) {
      var n = 0;
      all.forEach(function (l) {
        for (var i = 0, j = l.length - 1; i < l.length; j = i++) {
          if ((l[i][1] > p[1]) !== (l[j][1] > p[1]) && p[0] < (l[j][0] - l[i][0]) * (p[1] - l[i][1]) / (l[j][1] - l[i][1]) + l[i][0]) n++;
        }
      });
      return n % 2 === 1;
    }
    var b = pr.bounds || { umin: 0, umax: 1, vmin: 0, vmax: 1 }, dl = Math.max(b.umax - b.umin, b.vmax - b.vmin, 1e-9) * 1e-4;
    function seam(l) {
      var dx = l[2] - l[0], dy = l[3] - l[1], L = Math.hypot(dx, dy);
      if (!(L > 0)) return false;
      var mx = (l[0] + l[2]) / 2, my = (l[1] + l[3]) / 2, nx = -dy / L * dl, ny = dx / L * dl;
      return inside([mx + nx, my + ny]) && inside([mx - nx, my - ny]);
    }
    var out = copyOf(pr);
    out.lines = {}; Object.keys(pr.lines).forEach(function (q) { out.lines[q] = (pr.lines[q] || []).filter(function (l) { return !seam(l); }); });
    if (pr.stats) { out.stats = copyOf(pr.stats); out.stats.visibleLines = out.lines.visible.length; out.stats.hiddenLines = (out.lines.hidden || []).length; }
    return out;
  }
  // the content of a half / offset / aligned section view (in place of drawing-sheet.js's full-section branch);
  // centred on the whole part like a full section, so it stays aligned with its parent
  function pathContent(doc, v, mesh, parentContent) {
    var par = findV(doc, v.parent), P = parentContent(par).frame, sc = v.section, F = D.sectionFrame(P, sc.axis, sc.sign), full = D.extentsOf(mesh, F);
    // (rfCX2) lazy compute: a path cut not worked out yet is a job for drawing-worker.js (Drawing.sectionJob with
    // section.path), as a full section's is, and a pending placeholder the size of the whole part meanwhile
    if (_.LAZY && _.LAZY.mesh === mesh) {
      var key = secKey(P, sc), S0 = mesh._drawingSections && mesh._drawingSections[key], pk = D.projectionKey(F, v.display, v.tangent);
      if (!S0 || (S0.mesh.faces.length && !(S0.mesh._drawingProj && S0.mesh._drawingProj[pk])) || !(S0._capLoops && S0._capLoops[frameKey(F)])) {
        var jk = 'T|' + key + '|' + pk;
        if (!_.LAZY.keys[jk]) {
          _.LAZY.keys[jk] = 1;
          _.LAZY.missing.push({ key: jk, section: { path: { P: { u: P.u.slice(), v: P.v.slice(), e: P.e.slice() }, sc: JSON.parse(JSON.stringify(sc)) } }, frame: { name: F.name, e: F.e, u: F.u, v: F.v }, display: v.display, tangent: v.tangent || null });
        }
        var ph = { orient: F.name, u: F.u, v: F.v, e: F.e, lines: { visible: [], hidden: [] }, circles: { visible: [], hidden: [] }, arcs: { visible: [], hidden: [] }, ellipses: { visible: [], hidden: [] }, all: [], circlesAll: [], arcsAll: [],
          bounds: { umin: full.umin, umax: full.umax, vmin: full.vmin, vmax: full.vmax }, stats: { visibleLines: 0, hiddenLines: 0, visibleCircles: 0, hiddenCircles: 0 }, pending: true };
        return { frame: F, proj: ph, center: [full.cu, full.cv], caps: [], section: null, scale: _.viewScale(doc, v) };
      }
    }
    var S = pathSectionOf(mesh, P, sc), pr;
    if (!S.mesh.faces.length) pr = { orient: F.name, u: F.u, v: F.v, e: F.e, lines: { visible: [], hidden: [] }, circles: { visible: [], hidden: [] }, arcs: { visible: [], hidden: [] }, ellipses: { visible: [], hidden: [] }, all: [], circlesAll: [], arcsAll: [],
      bounds: { umin: full.cu, umax: full.cu, vmin: full.cv, vmax: full.cv }, stats: { visibleLines: 0, hiddenLines: 0, visibleCircles: 0, hiddenCircles: 0 } };
    else pr = _.cachedProjection(S.mesh, F, v.display, v.tangent);
    var caps = capLoops(S, F);
    if (sc.type !== 'half') pr = dropSeams(pr, caps);
    return { frame: F, proj: pr, center: [full.cu, full.cv], caps: caps, section: S, scale: _.viewScale(doc, v) };
  }
  // setSectionType(doc, viewId, spec) -> the view: makes a section view a half ({ type: 'half', c, side }), offset
  // ({ type: 'offset', jogs: [{ t, at }] }) or aligned ({ type: 'aligned', c, side, angle }) one; { type: 'full' } undoes it
  function setSectionType(doc, viewId, spec) {
    var v = findV(doc, viewId);
    if (!v || v.kind !== 'section') throw new Error('No section view ' + viewId);
    if (isRemoved(v) && spec && spec.type && spec.type !== 'full') throw new Error('A removed section is cut straight across between its two edges');   // (rfCX)
    var sc = v.section, t = spec && spec.type, keep = JSON.parse(JSON.stringify(sc));
    ['type', 'c', 'side', 'jogs', 'angle'].forEach(function (q) { delete sc[q]; });
    if (!t || t === 'full') return v;
    function fail(msg) { v.section = keep; throw new Error(msg); }
    if (t === 'half') {
      if (!isFinite(+spec.c) || spec.c === null) fail('A half section needs the centre c along the cutting line');
      sc.type = 'half'; sc.c = +spec.c; sc.side = spec.side < 0 ? -1 : 1;
    } else if (t === 'offset') {
      var js = (spec.jogs || []).map(function (j) { return { t: +j.t, at: +j.at }; }).filter(function (j) { return isFinite(j.t) && isFinite(j.at); });
      if (!js.length || js.length > 4) fail('An offset section needs one to four steps: jogs [{ t, at }]');
      js.sort(function (p, q) { return p.t - q.t; });
      sc.type = 'offset'; sc.jogs = js;
    } else if (t === 'aligned') {
      if (!isFinite(+spec.c) || spec.c === null || !isFinite(+spec.angle) || spec.angle === null) fail('An aligned section needs the centre c and the angle of its second leg');
      sc.type = 'aligned'; sc.c = +spec.c; sc.side = spec.side < 0 ? -1 : 1; sc.angle = +spec.angle;
      var G = alignedLegs(sc);
      if (Math.abs(G.d1[0] * G.d2[1] - G.d1[1] * G.d2[0]) < 1e-6) fail('The second leg of an aligned section must be at an angle to the first');
    } else fail('Section type must be full, half, offset or aligned');
    return v;
  }
  // the cutting line of a typed section on its parent pw: thin chain legs with thick corners, an arrow at each end that
  // cuts (pointing along the line of sight) and the letter (drawing-render.js draws no straight line for a section
  // with a type, rfV)
  function sectionPathLine(sheet, w, pw, k) {
    var v = w.view, sc = v.section, L = pw.layer, ts = pw.toSheet, X = secAxes({ u: [1, 0, 0], v: [0, 1, 0], e: [0, 0, 1] }, sc);
    var ext = 5 * k, shaft = 8 * k, lh = 5 * k, ar = 3 * k, aw = 0.9 * k, box = pw.box, CAP = _.CAP_EM || 1;
    function sdir(m0, d) { var a = ts(m0), b = ts([m0[0] + d[0], m0[1] + d[1]]), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; }
    function out(p, d) {   // from sheet point p along unit d to just past the parent's box
      var t = Infinity;
      if (Math.abs(d[0]) > 1e-12) t = Math.min(t, ((d[0] > 0 ? box.x1 : box.x0) - p[0]) / d[0]);
      if (Math.abs(d[1]) > 1e-12) t = Math.min(t, ((d[1] > 0 ? box.y1 : box.y0) - p[1]) / d[1]);
      t = Math.max(0, t) + ext;
      return [p[0] + d[0] * t, p[1] + d[1] * t];
    }
    function m2(t, n) { return sc.axis === 'h' ? [t, n] : [n, t]; }
    var sT = sdir(m2(0, sc.at), X.t2), sN = sdir(m2(0, sc.at), X.n2), pts, arrows = [];
    if (sc.type === 'half') {
      var Cs = ts(m2(sc.c, sc.at)), endA = out(Cs, [sT[0] * sc.side, sT[1] * sc.side]), endB = out(Cs, sN);
      pts = [endA, Cs, endB]; arrows.push({ at: endA, dv: [-sN[0], -sN[1]] });
    } else if (sc.type === 'offset') {
      pts = [];
      sectionSteps(sc).forEach(function (s0) {
        var lo = isFinite(s0.lo) ? ts(m2(s0.lo, s0.at)) : null, hi = isFinite(s0.hi) ? ts(m2(s0.hi, s0.at)) : null;
        if (!lo) lo = out(hi, [-sT[0], -sT[1]]);
        if (!hi) hi = out(lo, sT);
        pts.push(lo, hi);
      });
      arrows.push({ at: pts[0], dv: [-sN[0], -sN[1]] }, { at: pts[pts.length - 1], dv: [-sN[0], -sN[1]] });
    } else {
      var G = alignedLegs(sc), Cs2 = ts(G.C), q1 = sdir(G.C, G.n1), q2 = sdir(G.C, G.n2), e1 = out(Cs2, sdir(G.C, G.d1)), e2 = out(Cs2, sdir(G.C, G.d2));
      pts = [e1, Cs2, e2]; arrows.push({ at: e1, dv: [-q1[0], -q1[1]] }, { at: e2, dv: [-q2[0], -q2[1]] });
    }
    for (var i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) > 1e-9) sheet.prims.push({ k: 'line', a: pts[i - 1], b: pts[i], layer: L, style: 'chain', cutLine: v.id });
    // (thick at the changes of direction, as ASME Y14.2 draws a cutting plane line's corners)
    for (var j = 1; j < pts.length - 1; j++) [pts[j - 1], pts[j + 1]].forEach(function (o) {
      var dx = o[0] - pts[j][0], dy = o[1] - pts[j][1], l = Math.hypot(dx, dy);
      if (l > 1e-9) sheet.prims.push({ k: 'line', a: pts[j], b: [pts[j][0] + dx / l * Math.min(l, 3 * k), pts[j][1] + dy / l * Math.min(l, 3 * k)], layer: L, style: 'thick', cutLine: v.id });
    });
    arrows.forEach(function (aw0) {
      var e0 = aw0.at, dv = aw0.dv, tip = [e0[0] + dv[0] * shaft, e0[1] + dv[1] * shaft], n = [-dv[1], dv[0]];
      sheet.prims.push({ k: 'line', a: e0, b: tip, layer: L, style: 'thick', cutLine: v.id });
      sheet.prims.push({ k: 'fill', pts: [tip, [tip[0] - dv[0] * ar + n[0] * aw, tip[1] - dv[1] * ar + n[1] * aw], [tip[0] - dv[0] * ar - n[0] * aw, tip[1] - dv[1] * ar - n[1] * aw]], layer: L, cutLine: v.id });
      var tp = [tip[0] + dv[0] * 2 * k + (Math.abs(dv[0]) > 0.5 ? dv[0] * k : 0), tip[1] + dv[1] * 2 * k - (dv[1] > 0.5 ? 0 : dv[1] < -0.5 ? lh : lh / 2)];
      sheet.prims.push({ k: 'text', p: tp, h: lh * CAP, text: v.label, anchor: 'middle', layer: L, rot: 0, cutLine: v.id });
    });
    w.cutPath = pts;
  }

  // ------------------------------------------------------------------ Auxiliary, Crop and Broken views
  // (SolidWorks: Insert ▸ Drawing View ▸ Auxiliary / Crop / Break.) drawing-sheet.js's viewContent, moveView, layout and
  // addSectionView and drawing-render.js's compute call the helpers below directly (rfV: _.typedSection, _.pathContent,
  // _.auxCenter, _.cropContent, _.auxSlide, _.carryAux, _.viewPositions, _.viewKindMarks):
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
    if (par.kind === 'empty') throw new Error('An auxiliary view cannot be made from an empty view');
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
    if (opts.showLabel != null) setViewLabel(doc, v.id, opts.showLabel);   // (rfCQ)
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
  // (rfCQ) a projection clipped to the closed polygon P (a detail's sketched profile, model units of the frame): lines
  // split where they cross it, circles and arcs cut into their arcs inside it, an ellipse kept whole when inside, else
  // its pieces inside as short lines
  function segInPoly(l, P) {
    var a = [l[0], l[1]], b = [l[2], l[3]], r = [b[0] - a[0], b[1] - a[1]], ts = [0, 1], out = [];
    for (var i = 0; i < P.length; i++) {
      var c = P[i], d = P[(i + 1) % P.length], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
      if (Math.abs(den) < 1e-18) continue;
      var t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }
    ts.sort(function (x, y) { return x - y; });
    var endT = null;   // where the last piece kept ends (a piece that goes on from there extends it)
    for (var j = 0; j + 1 < ts.length; j++) {
      if (ts[j + 1] - ts[j] < 1e-12) continue;
      var tm = (ts[j] + ts[j + 1]) / 2;
      if (!inPoly([a[0] + r[0] * tm, a[1] + r[1] * tm], P)) continue;
      if (endT != null && Math.abs(endT - ts[j]) < 1e-12) { var last = out[out.length - 1]; last[2] = a[0] + r[0] * ts[j + 1]; last[3] = a[1] + r[1] * ts[j + 1]; endT = ts[j + 1]; continue; }
      var q = l.slice(); q[0] = a[0] + r[0] * ts[j]; q[1] = a[1] + r[1] * ts[j]; q[2] = a[0] + r[0] * ts[j + 1]; q[3] = a[1] + r[1] * ts[j + 1];
      out.push(q); endT = ts[j + 1];
    }
    return out;
  }
  // the angles (radians) where circle (c, r) crosses polygon P's edges
  function polyCircleCuts(c, r, P) {
    var cuts = [];
    for (var e = 0; e < P.length; e++) {
      var C = P[e], D2 = P[(e + 1) % P.length], dx = D2[0] - C[0], dy = D2[1] - C[1], fx = C[0] - c[0], fy = C[1] - c[1];
      var qa = dx * dx + dy * dy, qb = 2 * (fx * dx + fy * dy), qc = fx * fx + fy * fy - r * r, disc = qb * qb - 4 * qa * qc;
      if (qa < 1e-24 || disc < 0) continue;
      [(-qb - Math.sqrt(disc)) / (2 * qa), (-qb + Math.sqrt(disc)) / (2 * qa)].forEach(function (t) { if (t >= 0 && t <= 1) cuts.push(Math.atan2(C[1] + dy * t - c[1], C[0] + dx * t - c[0])); });
    }
    return cuts;
  }
  function clipProjectionPoly(pr, P) {
    function inside(p) { return inPoly(p, P); }
    function ranges(c, r) { return circleRanges(c, r, polyCircleCuts(c, r, P), inside); }
    function whole(a) { var q = arcPieces(a, ranges(a.c, a.r)); return q.length === 1 && Math.abs(q[0].a0 - a.a0) < 1e-9 && Math.abs(q[0].a1 - a.a1) < 1e-9; }
    var out = { orient: pr.orient, u: pr.u, v: pr.v, e: pr.e, lines: { visible: [], hidden: [], tangent: [] }, circles: { visible: [], hidden: [], tangent: [] }, arcs: { visible: [], hidden: [], tangent: [] },
      ellipses: { visible: [], hidden: [] }, all: [], circlesAll: [], arcsAll: [] };
    if (pr.pending) out.pending = true;
    ['visible', 'hidden', 'tangent'].forEach(function (k) {
      (pr.lines[k] || []).forEach(function (l) { segInPoly(l, P).forEach(function (q) { out.lines[k].push(q); }); });
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
        for (var j = 1; j < pts.length; j++) segInPoly([pts[j - 1][0], pts[j - 1][1], pts[j][0], pts[j][1], el.body || 0], P).forEach(function (q) { out.lines[k].push(q); });
      });
    });
    (pr.all || []).forEach(function (l) { segInPoly(l, P).forEach(function (q) { out.all.push(q); }); });
    (pr.circlesAll || []).forEach(function (c) { if (ranges(c.c, c.r) === 'full') out.circlesAll.push(c); });
    (pr.arcsAll || []).forEach(function (a) { if (whole(a)) out.arcsAll.push(a); });
    var lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    P.forEach(function (p) { lo = [Math.min(lo[0], p[0]), Math.min(lo[1], p[1])]; hi = [Math.max(hi[0], p[0]), Math.max(hi[1], p[1])]; });
    var b = pr.bounds || { umin: lo[0], umax: hi[0], vmin: lo[1], vmax: hi[1] };
    out.bounds = { umin: Math.max(b.umin, lo[0]), umax: Math.min(b.umax, hi[0]), vmin: Math.max(b.vmin, lo[1]), vmax: Math.min(b.vmax, hi[1]) };
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
  // typedSection(doc, v, parentContent): a half / offset / aligned section, cut along its path (pathContent) rather
  // than the full section's plane (drawing-sheet.js viewContent)
  function typedSection(doc, v, parentContent) {
    return !!(v.kind === 'section' && v.section && v.section.type && v.parent != null && parentContent && findV(doc, v.parent));
  }
  // auxCenter(doc, v, ct, parentContent): an auxiliary view keeps its projection lines square to the parent's edge
  // wherever it sits along them (ct.center slid along the edge; drawing-sheet.js viewContent)
  function auxCenter(doc, v, ct, parentContent) {
    if (!(v.kind === 'aux' && v.aux && v.parent != null && parentContent)) return;
    var par = findV(doc, v.parent);
    if (!(par && Math.abs(_.viewScale(doc, par) - ct.scale) < 1e-12)) return;
    var pc = parentContent(par), d2 = v.aux.dir, p2 = [d2[1], -d2[0]], s = ct.scale;
    var want = pc.center[0] * p2[0] + pc.center[1] * p2[1] + ((v.x - par.x) * p2[0] + (v.y - par.y) * p2[1]) / s;
    var have = ct.center[0] * p2[0] + ct.center[1] * p2[1];
    ct.center = [ct.center[0] + (want - have) * p2[0], ct.center[1] + (want - have) * p2[1]];
  }

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
      if (p.k === 'region') {   // (rfAG) a solid fill: the piece in every kept cell, moved with it
        var bounds = function (bands) { var iv = [], lo = -1e7; bands.forEach(function (b) { iv.push([lo, b.lo]); lo = b.hi; }); iv.push([lo, 1e7]); return iv; };
        bounds(vb).forEach(function (ix) { bounds(hb).forEach(function (iy) {
          var cl = clipLoopsConvex(p.loops, [[ix[0], iy[0]], [ix[1], iy[0]], [ix[1], iy[1]], [ix[0], iy[1]]]), r = withLoops(q, cl.map(function (l) { return l.map(M); }));
          if (r) out.push(r);
        }); });
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
    // (sheet x / y with and without the breaks, so a dimension dragged in the view maps through them, rfP)
    w.breakMap = { fwd: function (p) { return [MX.fwd(p[0]), MY.fwd(p[1])]; }, inv: function (p) { return [MX.inv(p[0]), MY.inv(p[1])]; } };
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
    // (rfCQ) the label unless the view's Display label is off
    if (viewLabelShown(v)) {
      sheet.prims.push({ k: 'text', p: [(w.box.x0 + w.box.x1) / 2, w.box.y0 - 7 * k], h: 3.5 * k * CAP, text: 'VIEW ' + v.label + '-' + v.label, anchor: 'middle', layer: L, rot: 0, auxLabel: v.id });
      if (v.scale && D.scaleValue(v.scale) !== D.scaleValue(sheet.scale || [1, 1])) sheet.prims.push({ k: 'text', p: [(w.box.x0 + w.box.x1) / 2, w.box.y0 - 12 * k], h: 3 * k * CAP, text: D.scaleLabel(v.scale), anchor: 'middle', layer: L, rot: 0 });
    }
    if (!pw) return;
    var PL = pw.layer, A = pw.toSheet(v.aux.a), B = pw.toSheet(v.aux.b), M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], d2 = v.aux.dir, sg = projection === 'first' ? -1 : 1;
    var side = [d2[0] * sg, d2[1] * sg], gap = 3 * k, shaft = 10 * k, ar = 3 * k, aw = 0.9 * k, lh = 5 * k;
    var tip = [M[0] + side[0] * gap, M[1] + side[1] * gap], tail = [M[0] + side[0] * (gap + shaft), M[1] + side[1] * (gap + shaft)], dir = [-side[0], -side[1]], n = [-dir[1], dir[0]];
    sheet.prims.push({ k: 'line', a: tail, b: tip, layer: PL, style: 'thick', auxArrow: v.id });
    sheet.prims.push({ k: 'fill', pts: [tip, [tip[0] - dir[0] * ar + n[0] * aw, tip[1] - dir[1] * ar + n[1] * aw], [tip[0] - dir[0] * ar - n[0] * aw, tip[1] - dir[1] * ar - n[1] * aw]], layer: PL, auxArrow: v.id });
    sheet.prims.push({ k: 'text', p: [tail[0] + side[0] * lh * 0.8, tail[1] + side[1] * lh * 0.8 - lh * 0.5], h: lh * CAP, text: v.label, anchor: 'middle', layer: PL, rot: 0, auxArrow: v.id });
  }
  // viewKindMarks(doc, sheet): what the view kinds add once the sheet is laid out (drawing-render.js compute, before
  // the angle dimensions): typed sections' cutting lines on their parents, breaks, auxiliary arrows and labels
  function viewKindMarks(doc, sheet) {
    if (!sheet || !sheet.views) return sheet;
    if (_.applyEdgeFormats) _.applyEdgeFormats(doc, sheet);   // (rfAO) Line Format / Hide Edge on the model edges, first
    var k = _.paperK(sheet.units), byId = {};
    sheet.views.forEach(function (w) { byId[w.view.id] = w; });
    sheet.views.forEach(function (w) {
      var sv = w.view;
      if (sv.kind === 'section' && sv.section && sv.section.type && sv.parent != null && byId[sv.parent]) sectionPathLine(sheet, w, byId[sv.parent], k);
    });
    // (rfAD) broken-out profiles and the regions with their own hatch, before the breaks so they move with the view
    sheet.views.forEach(function (w) { brokenOutMarks(doc, sheet, w, byId, k); });
    sheet.views.forEach(function (w) { if (w.view.breaks && w.view.breaks.length && !w.pending) applyBreaks(sheet, w, k); });
    sheet.views.forEach(function (w) {
      if (w.view.kind !== 'aux' || !w.view.aux) return;
      w.ortho = true;   // seen square: edges parallel to the sheet are true length, so Smart Dimension works on it
      auxMarks(sheet, w, w.view.parent != null ? byId[w.view.parent] : null, k, doc.sheet.projection);
    });
    if (_.sketchPrims) _.sketchPrims(doc, sheet);   // (rfAO) the drawing sketch's entities, last
    return sheet;
  }
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
  // auxSlide(doc, id, x, y) -> [x, y]: where a dragged auxiliary view may go (along its axis only; drawing-sheet.js
  // moveView); any other view goes to the point itself
  function auxSlide(doc, id, x, y) {
    var v = findV(doc, id);
    if (v && v.kind === 'aux' && v.aux && v.parent != null && findV(doc, v.parent)) {
      var d2 = v.aux.dir, t = (x - v.x) * d2[0] + (y - v.y) * d2[1];
      x = v.x + d2[0] * t; y = v.y + d2[1] * t;
    }
    return [x, y];
  }

  // ------------------------------------------------------------------ rfZ: detail profiles and outlines, partial
  // sections, section lines that scale with the model, True dimensions (SolidWorks' Detail View / Section View PMs and
  // Model View ▸ Dimension Type)
  //   * view.detail = { c, r, shape: 'circle' (default) | 'profile', a, b (a profile's rectangle corners, model units of
  //     the parent's frame; c its centre, r its half diagonal), style: 'standard' | 'broken' | 'leader' | 'noleader' |
  //     'connected', outline: 'full' | 'jagged' }: a profile detail shows the parent inside the rectangle; Full outline
  //     draws the circle / rectangle round the detail view, Jagged outline a zig-zag one (no outline: the lines just end);
  //   * view.section.partial = [lo, hi]: a partial section (full sections only): the cutting line runs from lo to hi
  //     along itself (the parent's u for a horizontal line, v for a vertical one) and the view keeps only that band;
  //   * view.section.scaleWithModel (+ rel, the line's place as fractions of the parent's extents): when the part
  //     changes size the cutting line (and a partial line's ends) keep their place relative to it (resolveSectionScale);
  //   * view.dimType = 'true' (a pictorial model view): its linear dimensions read the true 3D length (trueLength).
  var DETAIL_STYLES = ['standard', 'broken', 'leader', 'noleader', 'connected'];
  function detailHalf(dt) {
    if (dt && dt.shape === 'profile' && dt.a && dt.b) return [Math.abs(dt.b[0] - dt.a[0]) / 2, Math.abs(dt.b[1] - dt.a[1]) / 2];
    return [dt ? dt.r : 0, dt ? dt.r : 0];
  }
  // a profile detail's content: the parent's clipped to the rectangle, its box the whole rectangle; (rfCQ) a sketched
  // profile (dt.pts) is clipped to its bounding rectangle, then the linework to the polygon itself (the hatching is
  // clipped to it on the sheet, drawing-render.js)
  function detailProfileContent(pc, dt, s) {
    var R = [Math.min(dt.a[0], dt.b[0]), Math.min(dt.a[1], dt.b[1]), Math.max(dt.a[0], dt.b[0]), Math.max(dt.a[1], dt.b[1])];
    var o = cropContent({ frame: pc.frame, proj: pc.proj, caps: pc.caps, center: pc.center, scale: s }, { type: 'rect', a: [R[0], R[1]], b: [R[2], R[3]] });
    if (dt.pts && dt.pts.length >= 3) { o.proj = clipProjectionPoly(o.proj, dt.pts); o.poly = dt.pts; }
    o.proj.bounds = { umin: R[0], umax: R[2], vmin: R[1], vmax: R[3] };
    o.center = [(R[0] + R[2]) / 2, (R[1] + R[3]) / 2];
    o.profile = R;
    delete o.crop;
    return o;
  }
  // (rfCQ) profilePts(dt) -> a profile detail's boundary (model units of the parent's frame, counter-clockwise): the
  // sketched polygon, or the rectangle's four corners; null for a circle
  function profilePts(dt) {
    if (!dt || dt.shape !== 'profile') return null;
    if (dt.pts && dt.pts.length >= 3) return dt.pts;
    if (!dt.a || !dt.b) return null;
    return [[dt.a[0], dt.a[1]], [dt.b[0], dt.a[1]], [dt.b[0], dt.b[1]], [dt.a[0], dt.b[1]]];
  }
  // (rfCQ) rayOut(o, dir, P) -> how far from o along the unit direction dir the polygon P's boundary is, at its
  // furthest crossing (0 when the ray misses it)
  function rayOut(o, dir, P) {
    var best = 0;
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], s = [b[0] - a[0], b[1] - a[1]], den = dir[0] * s[1] - dir[1] * s[0];
      if (Math.abs(den) < 1e-15) continue;
      var t = ((a[0] - o[0]) * s[1] - (a[1] - o[1]) * s[0]) / den, u = ((a[0] - o[0]) * dir[1] - (a[1] - o[1]) * dir[0]) / den;
      if (t > 0 && u >= -1e-12 && u <= 1 + 1e-12 && t > best) best = t;
    }
    return best;
  }
  // detailOpts(dt, opts): the style / outline of a detail from opts (undefined keeps, null clears)
  function detailOpts(dt, opts) {
    if (opts.style !== undefined) { if (DETAIL_STYLES.indexOf(opts.style) > 0) dt.style = opts.style; else delete dt.style; }
    if (opts.outline !== undefined) { if (opts.outline === 'full' || opts.outline === 'jagged') dt.outline = opts.outline; else delete dt.outline; }
  }
  // a detail's profile rectangle from opts.a / opts.b (null when opts asks for a circle); (rfCQ) or a closed sketched
  // profile, opts.pts: [[u, v], …] in the parent's frame (a polygon; a spline comes as its points along the curve)
  function detailProfile(opts) {
    if (opts.pts) {
      var P = [];
      opts.pts.forEach(function (q) {
        var p = [+q[0], +q[1]], l = P[P.length - 1];
        if (!isFinite(p[0]) || !isFinite(p[1])) throw new Error('A detail profile point must be two numbers');
        if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > 1e-9) P.push(p);
      });
      if (P.length > 1 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) <= 1e-9) P.pop();
      if (P.length < 3 || Math.abs(polyArea(P)) < 1e-12) throw new Error('A detail profile needs a closed outline of three points or more: { pts: [[u, v], …] }');
      if (polyArea(P) < 0) P.reverse();
      var lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
      P.forEach(function (p) { lo = [Math.min(lo[0], p[0]), Math.min(lo[1], p[1])]; hi = [Math.max(hi[0], p[0]), Math.max(hi[1], p[1])]; });
      return { c: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], r: Math.hypot(hi[0] - lo[0], hi[1] - lo[1]) / 2, shape: 'profile', a: lo, b: hi, pts: P };
    }
    if (!(opts.shape === 'profile' || (opts.a && opts.b && !(opts.r > 0)))) return null;
    var a = opts.a, b = opts.b;
    if (!a || !b || Math.abs(a[0] - b[0]) < 1e-9 || Math.abs(a[1] - b[1]) < 1e-9) throw new Error('A detail profile needs two opposite corners: { a: [u, v], b: [u, v] }');
    var lo = [Math.min(+a[0], +b[0]), Math.min(+a[1], +b[1])], hi = [Math.max(+a[0], +b[0]), Math.max(+a[1], +b[1])];
    return { c: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], r: Math.hypot(hi[0] - lo[0], hi[1] - lo[1]) / 2, shape: 'profile', a: lo, b: hi };
  }
  // the outline round a detail view (sheet units): circle / rectangle (full) or a zig-zag of either (jagged)
  function detailOutline(prims, w, k) {
    var v = w.view, dt = v.detail;
    if (!dt || !dt.outline) return;
    var L = w.layer, c = w.toSheet(dt.c), hf = detailHalf(dt), s = w.scale, E = { layer: L, style: 'thin', detailOutline: v.id };
    function put(p) { Object.keys(E).forEach(function (q) { p[q] = E[q]; }); prims.push(p); }
    function seg(a, b) { put({ k: 'line', a: a, b: b }); }
    var prof = dt.shape === 'profile', hw = hf[0] * s, hh = hf[1] * s;
    var Q = [[c[0] - hw, c[1] - hh], [c[0] + hw, c[1] - hh], [c[0] + hw, c[1] + hh], [c[0] - hw, c[1] + hh]];
    if (dt.outline === 'full') {
      if (dt.pts && dt.pts.length >= 3) { var S = dt.pts.map(w.toSheet); for (var j = 0; j < S.length; j++) seg(S[j], S[(j + 1) % S.length]); }   // (rfCQ) the sketched profile
      else if (!prof) put({ k: 'circle', c: c, r: hw });
      else for (var i = 0; i < 4; i++) seg(Q[i], Q[(i + 1) % 4]);
      return;
    }
    // jagged: points round the boundary, every other one a little outside it (about 2 mm apart); (rfAD) the view's
    // linework (worked out to just past the zig-zag, contentExtras) is clipped to it, so lines end on the zig-zag
    var pts = jaggedPts(w, k);
    clipLayerToPoly(prims, L, pts);
    for (var z = 0; z < pts.length; z++) seg(pts[z], pts[(z + 1) % pts.length]);
  }
  // the parent extents a section line is measured against when it scales with the model: [lo, hi] across the line
  // (where it cuts) and along it
  function sectionSpan(doc, mesh, v) {
    var par = findV(doc, v.parent);
    if (!par || !mesh) return null;
    var ex = D.extentsOf(mesh, D.viewFrame(doc, par));
    if (!isFinite(ex.umin) || !isFinite(ex.vmin)) return null;
    return v.section.axis === 'h' ? { cross: [ex.vmin, ex.vmax], along: [ex.umin, ex.umax] } : { cross: [ex.umin, ex.umax], along: [ex.vmin, ex.vmax] };
  }
  function frac(x, r) { return r[1] - r[0] > 1e-12 ? (x - r[0]) / (r[1] - r[0]) : 0.5; }
  function unfrac(f, r) { return r[0] + f * (r[1] - r[0]); }
  // remembers where the line is as fractions of the parent's extents (at, c, partial ends, offset jogs)
  function sectionRel(doc, mesh, v) {
    var sp = sectionSpan(doc, mesh, v), sc = v.section;
    if (!sp) return;
    var rel = { at: frac(sc.at, sp.cross) };
    if (sc.c != null) rel.c = frac(sc.c, sp.along);
    if (sc.partial) rel.partial = [frac(sc.partial[0], sp.along), frac(sc.partial[1], sp.along)];
    if (sc.jogs) rel.jogs = sc.jogs.map(function (j) { return { t: frac(j.t, sp.along), at: frac(j.at, sp.cross) }; });
    sc.rel = rel;
  }
  // resolveSectionScale(doc, mesh): every section line set to scale with the model goes to its place on the part as
  // it is now (drawing-render.js compute, before the views are worked out)
  function resolveSectionScale(doc, mesh) {
    if (doc && doc.views) followParentScale(doc);   // (rfCX) Use parent scale follows the parent
    if (!doc || !doc.views || !mesh) return;
    doc.views.forEach(function (v) {
      var sc = v.kind === 'section' && v.section;
      if (!sc || !sc.scaleWithModel || !sc.rel) return;
      var sp = sectionSpan(doc, mesh, v), r = sc.rel;
      if (!sp) return;
      sc.at = unfrac(r.at, sp.cross);
      if (r.c != null && sc.c != null) sc.c = unfrac(r.c, sp.along);
      if (r.partial && sc.partial) sc.partial = [unfrac(r.partial[0], sp.along), unfrac(r.partial[1], sp.along)];
      if (r.jogs && sc.jogs && r.jogs.length === sc.jogs.length) sc.jogs = r.jogs.map(function (j) { return { t: unfrac(j.t, sp.along), at: unfrac(j.at, sp.cross) }; });
    });
  }
  // setSectionOptions(doc, mesh, id, { partial: [lo, hi] | null, scaleWithModel: bool }) -> the view
  function setSectionOptions(doc, mesh, id, opts) {
    var v = findV(doc, id);
    if (!v || v.kind !== 'section' || !v.section) throw new Error('No section view ' + id);
    opts = opts || {};
    if (opts.partial !== undefined && (opts.partial == null || opts.partial === false) && isRemoved(v)) throw new Error('A removed section\'s cutting line always runs between its two ends');   // (rfCX)
    if (opts.partial !== undefined) {
      if (opts.partial == null || opts.partial === false) delete v.section.partial;
      else {
        if (v.section.type) throw new Error('A partial section is a full section whose cutting line stops short: a ' + v.section.type + ' section crosses the part');
        var lo = Math.min(+opts.partial[0], +opts.partial[1]), hi = Math.max(+opts.partial[0], +opts.partial[1]);
        if (!(hi - lo > 1e-9)) throw new Error('A partial section needs the two ends of its cutting line: partial: [from, to]');
        v.section.partial = [lo, hi];
      }
    }
    if (opts.scaleWithModel !== undefined) { if (opts.scaleWithModel) v.section.scaleWithModel = true; else delete v.section.scaleWithModel; }
    if (v.section.scaleWithModel) sectionRel(doc, mesh, v); else delete v.section.rel;
    return v;
  }
  // a partial section's content: the band of the full section its cutting line covers (the section view's u is the
  // parent's u for a horizontal line, its v the parent's v for a vertical one)
  function partialContent(v, ct) {
    if (isRemoved(v) && v.section.partial && ct && ct.proj) return removedContent(v, ct);   // (rfCX) a removed section
    var p =v.kind === 'section' && v.section && !v.section.type && v.section.partial;
    if (!p || !ct || !ct.proj) return ct;
    var B = 1e9, o = v.section.axis === 'h' ? { type: 'rect', a: [p[0], -B], b: [p[1], B] } : { type: 'rect', a: [-B, p[0]], b: [B, p[1]] };
    var r = cropContent(ct, o);
    delete r.crop;
    return r;
  }
  // ---- True dimensions: a pictorial view's 2D points lifted back onto the part
  // trueLength(mesh, F, a, b) -> the 3D length of what the view's segment a-b (model units of frame F) stands for, or
  // null: a part edge whose projection holds both points scales the projected length by its foreshortening (the edge
  // nearest the viewer when several line up); else both points are lifted to the part vertices they show.
  function trueLength(mesh, F, a, b) {
    F = D.frameOf(F);
    var E = D.meshEdges(mesh), tol = meshDiag(mesh) * 1e-6, L2 = Math.hypot(b[0] - a[0], b[1] - a[1]);
    function pj(p) { return [V.dot(p, F.u), V.dot(p, F.v)]; }
    function onSeg(p, A, B) {
      var dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy);
      if (l < tol) return false;
      var t = ((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / (l * l), off = Math.abs((p[0] - A[0]) * dy - (p[1] - A[1]) * dx) / l;
      return off <= tol * 10 && t >= -1e-6 && t <= 1 + 1e-6;
    }
    var best = null, bz = -Infinity;
    if (L2 > tol) E.forEach(function (ed) {
      var A = pj(ed.a), B = pj(ed.b);
      if (!onSeg(a, A, B) || !onSeg(b, A, B)) return;
      var z = (V.dot(ed.a, F.e) + V.dot(ed.b, F.e)) / 2;
      if (z > bz) { bz = z; best = ed; }
    });
    if (best) {
      // the points as parameters along the edge (an end within a millionth of the edge snaps onto it: exact lengths)
      var pa = pj(best.a), pb = pj(best.b), dx = pb[0] - pa[0], dy = pb[1] - pa[1], lp2 = dx * dx + dy * dy;
      if (!(lp2 > tol * tol)) return null;
      var par = function (p) { var t = ((p[0] - pa[0]) * dx + (p[1] - pa[1]) * dy) / lp2; return Math.abs(t) < 1e-6 ? 0 : Math.abs(t - 1) < 1e-6 ? 1 : t; };
      return Math.abs(par(b) - par(a)) * V.len(V.sub(best.b, best.a));
    }
    function lift(p) {
      var q = null, qz = -Infinity;
      E.forEach(function (ed) { [ed.a, ed.b].forEach(function (x) { var s = pj(x); if (Math.hypot(s[0] - p[0], s[1] - p[1]) <= tol * 10) { var z = V.dot(x, F.e); if (z > qz) { qz = z; q = x; } } }); });
      // (rfDD) else the centre of a true circle / arc of the model (a hole seen as an ellipse: its centre is no vertex)
      if (!q) { var mc = D.meshCurves ? D.meshCurves(mesh) : null; (mc && mc.groups || []).forEach(function (g) { var s = pj(g.c); if (Math.hypot(s[0] - p[0], s[1] - p[1]) <= tol * 10) { var z = V.dot(g.c, F.e); if (z > qz) { qz = z; q = g.c; } } }); }
      return q;
    }
    var A3 = lift(a), B3 = lift(b);
    return A3 && B3 ? V.len(V.sub(B3, A3)) : null;
  }
  // a view whose linear dimensions read true lengths: a pictorial model view set to True
  // (rfDD2) or an auxiliary view set to True (it looks square to an inclined face, not to the model's axes)
  function isTrueView(v, F) { return !!(v && v.dimType === 'true' && (!v.kind || v.kind === 'aux') && F && !D.isOrthoFrame(D.frameOf(F))); }
  // setDetailOptions(doc, id, { style, outline }) -> the detail view (undefined keeps, null back to the default)
  function setDetailOptions(doc, id, opts) {
    var v = findV(doc, id);
    if (!v || v.kind !== 'detail' || !v.detail) throw new Error('No detail view ' + id);
    detailOpts(v.detail, opts || {});
    return v;
  }
  D.setDetailOptions = setDetailOptions;
  // (rfCQ) the view label, as SolidWorks shows it: section, detail and auxiliary views are labelled by default (SECTION
  // A-A, DETAIL B / SCALE 2 : 1, VIEW C-C); model, projected, relative and flat-pattern views are not, unless the view's
  // Display label is on (view.showLabel: stored only when it differs from the default). viewLabelShown(v) -> boolean
  function labelDefault(v) { return !!(v && (v.kind === 'section' || v.kind === 'detail' || v.kind === 'aux')); }
  function viewLabelShown(v) { return v && v.showLabel != null ? !!v.showLabel : labelDefault(v); }
  // (rfIW) a flat-pattern view drawn at a scale other than the sheet's, whose label is not shown, still says so:
  // 'SCALE 1 : 2' under its FLAT SIZE note (the blank is what the shop cuts; the audit's flat at 1 : 4 on a 1 : 1 sheet
  // said nothing, and the title block gives the sheet's scale). Model and projected views keep SolidWorks' default, no
  // label even at their own scale (rfCQ pins it). Display label off (showLabel false) hides it too.
  function viewScaleNote(v, sheetScale) {
    if (!v || v.kind !== 'flat' || v.showLabel === false || viewLabelShown(v) || !v.scale) return false;
    return Math.abs(D.scaleValue(v.scale) - D.scaleValue(sheetScale || [1, 1])) > 1e-12;
  }
  // setViewLabel(doc, id, on | null) -> the view (null: back to the default for its kind)
  function setViewLabel(doc, id, on) {
    var v = findV(doc, id);
    if (!v) throw new Error('No drawing view ' + id);
    // (rfIW) Display label off on a flat view with its own scale is kept (it hides the SCALE n : m note too)
    if (on === false && v.kind === 'flat' && v.scale) v.showLabel = false;
    else if (on == null || !!on === labelDefault(v)) delete v.showLabel; else v.showLabel = !!on;
    return v;
  }
  D.viewLabelShown = viewLabelShown; D.setViewLabel = setViewLabel; D.viewScaleNote = viewScaleNote;
  // setDimType(doc, id, 'true' | 'projected') -> the view (True is a model view's option; Projected is the default)
  function setDimType(doc, id, t) {
    var v = findV(doc, id);
    if (!v) throw new Error('No drawing view ' + id);
    // (rfDD2) an auxiliary view too; True is a new pictorial model view's default (addView), Projected is no key
    if (t === 'true') { if (v.kind && v.kind !== 'aux') throw new Error('True dimensions are a model or auxiliary view\'s option'); v.dimType = 'true'; } else delete v.dimType;
    return v;
  }
  // ------------------------------------------------------------------ rfAD: Broken-out Section, Area Hatch / Fill per
  // region, the Jagged detail outline as the clip (SolidWorks: Insert ▸ Drawing View ▸ Broken-out Section; select a
  // hatched region ▸ Area Hatch/Fill PropertyManager; Detail View ▸ Jagged outline)
  //   * view.brokenOut = [{ id, shape: 'spline' | 'poly' | 'rect' | 'circle', pts (spline / poly) | a, b (rect) | c, r
  //     (circle) — model units of the view's frame —, depth (model units, from the front of the part in this view) |
  //     depthRef: { view, p: [u, v] } (a point in another view square to this one: the cut goes down to it) }]: the
  //     material inside the closed profile, from the front of the part down to the depth, is taken away in this view
  //     only; the cut floor is hatched (the part's material pattern) and the profile is drawn as a thin line;
  //   * view.hatchRegions = [{ p: [u, v] (a point inside the region, model units of the view), pattern ('ANSI31' …
  //     'ANSI38', 'SOLID', 'NONE'), scale (× the standard spacing), angle (degrees added to the pattern's own) }]: one
  //     hatched region of a section or broken-out drawn with its own pattern (the Material crosshatch unticked); a
  //     detail view follows its parent's regions and may have its own;
  //   * a detail with a Jagged outline shows its linework out to the zig-zag, clipped to it (not to the circle).
  var BO_SHAPES = ['spline', 'poly', 'rect', 'circle'], AREA_PATTERNS = ['ANSI31', 'ANSI32', 'ANSI33', 'ANSI34', 'ANSI35', 'ANSI36', 'ANSI37', 'ANSI38', 'SOLID', 'NONE'];
  function polyArea(P) { var a = 0; for (var i = 0, j = P.length - 1; i < P.length; j = i++) a += (P[j][0] + P[i][0]) * (P[j][1] - P[i][1]); return -a / 2; }
  function inPoly(p, P) {
    var n = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > p[1]) !== (P[j][1] > p[1]) && p[0] < (P[j][0] - P[i][0]) * (p[1] - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) n = !n;
    return n;
  }
  function inLoops(p, loops) { var n = 0; loops.forEach(function (l) { if (inPoly(p, l)) n++; }); return n % 2 === 1; }
  // boPolygon(entry) -> the closed profile as a counter-clockwise polygon (model units of the view): a spline runs
  // through its points (closed Catmull-Rom, 10 steps a span), a circle is a 96-gon
  function boPolygon(b) {
    var P = [];
    if (b.shape === 'rect') P = [[b.a[0], b.a[1]], [b.b[0], b.a[1]], [b.b[0], b.b[1]], [b.a[0], b.b[1]]];
    else if (b.shape === 'circle') for (var i = 0; i < 96; i++) { var t = i / 96 * TWO_PI; P.push([b.c[0] + b.r * Math.cos(t), b.c[1] + b.r * Math.sin(t)]); }
    else if (b.shape === 'spline' && b.pts.length >= 3) {
      var Q = b.pts, n = Q.length;
      for (var s = 0; s < n; s++) {
        var p0 = Q[(s + n - 1) % n], p1 = Q[s], p2 = Q[(s + 1) % n], p3 = Q[(s + 2) % n];
        for (var q = 0; q < 10; q++) {
          var u = q / 10, u2 = u * u, u3 = u2 * u;
          P.push([0, 1].map(function (k) { return 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3); }));
        }
      }
    } else P = (b.pts || []).map(function (p) { return [p[0], p[1]]; });
    if (polyArea(P) < 0) P.reverse();
    return P;
  }
  function boEntry(spec) {
    var shape = spec.shape || (spec.c && spec.r != null ? 'circle' : spec.a && spec.b ? 'rect' : 'spline'), e = { shape: shape };
    if (BO_SHAPES.indexOf(shape) < 0) throw new Error('A broken-out profile is a spline, poly, rect or circle');
    if (shape === 'rect') {
      if (!spec.a || !spec.b || Math.abs(spec.a[0] - spec.b[0]) < 1e-9 || Math.abs(spec.a[1] - spec.b[1]) < 1e-9) throw new Error('A broken-out rectangle needs two opposite corners: { a: [u, v], b: [u, v] }');
      e.a = [Math.min(+spec.a[0], +spec.b[0]), Math.min(+spec.a[1], +spec.b[1])]; e.b = [Math.max(+spec.a[0], +spec.b[0]), Math.max(+spec.a[1], +spec.b[1])];
    } else if (shape === 'circle') {
      if (!spec.c || !(+spec.r > 0)) throw new Error('A broken-out circle needs a centre and a radius');
      e.c = [+spec.c[0], +spec.c[1]]; e.r = +spec.r;
    } else {
      var pts = (spec.pts || []).map(function (p) { return [+p[0], +p[1]]; }).filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); });
      if (pts.length > 3 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-9) pts.pop();
      if (pts.length < 3) throw new Error('A broken-out profile needs at least three points');
      e.pts = pts;
    }
    if (Math.abs(polyArea(boPolygon(e))) < 1e-9) throw new Error('The broken-out profile encloses no area');
    if (spec.depthRef) {
      var dr = spec.depthRef;
      if (dr.view == null || !dr.p || !isFinite(+dr.p[0]) || !isFinite(+dr.p[1])) throw new Error('A depth reference is { view, p: [u, v] }');
      e.depthRef = { view: dr.view, p: [+dr.p[0], +dr.p[1]] };
    } else {
      if (!(+spec.depth > 0)) throw new Error('A broken-out section needs a depth greater than zero (or a depth reference)');
      e.depth = +spec.depth;
    }
    return e;
  }
  function boView(doc, viewId) {
    var v = findV(doc, viewId);
    if (!v) throw new Error('No drawing view ' + viewId);
    if (v.kind === 'section' || v.kind === 'detail' || v.kind === 'flat') throw new Error('A broken-out section goes on a model, projected or auxiliary view');
    return v;
  }
  // addBrokenOut(doc, viewId, spec) -> the entry (with its id); setBrokenOut(doc, viewId, id, spec | null) changes the
  // depth / profile of one or (null) removes it; clearBrokenOut(doc, viewId) removes them all
  function addBrokenOut(doc, viewId, spec) {
    var v = boView(doc, viewId), e = boEntry(spec || {});
    if (e.depthRef) boRefFrame(doc, v, e.depthRef);
    var list = v.brokenOut || [];
    e.id = list.reduce(function (m, b) { return Math.max(m, b.id | 0); }, 0) + 1;
    v.brokenOut = list.concat([e]);
    return e;
  }
  function setBrokenOut(doc, viewId, id, spec) {
    var v = boView(doc, viewId), list = v.brokenOut || [], i = -1;
    list.forEach(function (b, j) { if (b.id === id) i = j; });
    if (i < 0) throw new Error('No broken-out section ' + id + ' in ' + (v.name || 'view ' + viewId));
    if (spec == null) { list.splice(i, 1); if (!list.length) delete v.brokenOut; return null; }
    var old = list[i], m = {};
    Object.keys(old).forEach(function (q) { m[q] = old[q]; });
    if (spec.depth != null || spec.depthRef) { delete m.depth; delete m.depthRef; }
    if (spec.shape && spec.shape !== old.shape) ['pts', 'a', 'b', 'c', 'r'].forEach(function (q) { delete m[q]; });
    Object.keys(spec).forEach(function (q) { if (spec[q] !== undefined) m[q] = spec[q]; });
    var e = boEntry(m);
    if (e.depthRef) boRefFrame(doc, v, e.depthRef);
    e.id = old.id; list[i] = e;
    return e;
  }
  function clearBrokenOut(doc, viewId) { var v = findV(doc, viewId); if (v) delete v.brokenOut; return v; }
  // the other view of a depth reference, checked square to v
  function boRefFrame(doc, v, dr) {
    var o = findV(doc, dr.view);
    if (!o || o === v) throw new Error('The depth reference must be in another view');
    var F = D.viewFrame(doc, v), G = D.viewFrame(doc, o);
    if (Math.abs(V.dot(F.e, G.e)) > 1e-6) throw new Error('The depth reference must be in a view at right angles to ' + (v.name || 'this view'));
    return G;
  }
  // the depth of an entry in frame F of view v, for a part whose front (the highest p·e) is `front`
  function boDepth(doc, v, F, b, front) {
    if (!b.depthRef) return b.depth;
    var G = boRefFrame(doc, v, b.depthRef), q = b.depthRef.p[0] * V.dot(G.u, F.e) + b.depthRef.p[1] * V.dot(G.v, F.e);
    return front - q;
  }
  // a prism along F.e over the polygon P (frame coordinates), from w0 to w1 along e, as CSG
  function prismSolid(F, P, w0, w1) {
    function pt(q, w) { return new CSG.Vector(F.u[0] * q[0] + F.v[0] * q[1] + F.e[0] * w, F.u[1] * q[0] + F.v[1] * q[1] + F.e[1] * w, F.u[2] * q[0] + F.v[2] * q[1] + F.e[2] * w); }
    function face(vs, out) {
      var pg = new CSG.Polygon(vs.map(function (x) { return new CSG.Vertex(x); }));
      if (pg.plane.normal.x * out[0] + pg.plane.normal.y * out[1] + pg.plane.normal.z * out[2] < 0) pg = new CSG.Polygon(vs.slice().reverse().map(function (x) { return new CSG.Vertex(x); }));
      return pg;
    }
    var polys = [], tris = K._.triangulate(P);
    tris.forEach(function (t) {
      var a = P[t[0]], b = P[t[1]], c = P[t[2]];
      if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-14) return;
      polys.push(face([pt(a, w1), pt(b, w1), pt(c, w1)], F.e));
      polys.push(face([pt(a, w0), pt(b, w0), pt(c, w0)], V.scale(F.e, -1)));
    });
    for (var i = 0; i < P.length; i++) {
      var A = P[i], B = P[(i + 1) % P.length], d = [B[0] - A[0], B[1] - A[1]];
      if (Math.hypot(d[0], d[1]) < 1e-12) continue;
      polys.push(face([pt(A, w0), pt(B, w0), pt(B, w1), pt(A, w1)], V.add(V.scale(F.u, d[1]), V.scale(F.v, -d[0]))));
    }
    return CSG.fromPolygons(polys);
  }
  // brokenOutOf(mesh, F, cuts: [{ poly, w }]) -> { mesh, caps, area, e, ws }: the part with each profile's prism, from
  // the plane p·e = w out past the front, taken away (per body / part, as a section); the caps are the cut floors
  function brokenOutOf(mesh, F, cuts) {
    var cache = mesh._drawingSections || (mesh._drawingSections = {}), r9 = function (x) { return Math.round(x * 1e9); };
    var key = 'BO|' + frameKey(F) + '|' + cuts.map(function (c) { return r9(c.w) + ':' + c.poly.map(function (p) { return r9(p[0]) + ',' + r9(p[1]); }).join(';'); }).join('|');
    if (cache[key]) return cache[key];
    var Pp = mesh.positions64 || mesh.positions, diag = meshDiag(mesh), hi = -Infinity, m = diag * 0.25 + 1;
    for (var i = 0; i < Pp.length; i += 3) { var x = Pp[i] * F.e[0] + Pp[i + 1] * F.e[1] + Pp[i + 2] * F.e[2]; if (x > hi) hi = x; }
    var tool = null;
    cuts.forEach(function (c) { var s = prismSolid(F, c.poly, c.w, hi + m); tool = tool ? tool.union(s) : s; });
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
      CSG.fromPolygons(byBody[g.k]).subtract(tool).polygons.forEach(function (pg) { pg.body = g.b; if (g.part != null) pg.part = g.part; polys.push(pg); });
    });
    var sm = K.meshFromBody(polys.length ? CSG.fromPolygons(polys) : null), caps = [], area = 0, tol = diag * 1e-7 + 1e-9;
    sm.faces.forEach(function (f, fi) {
      if (!(V.dot(f.normal, F.e) > 1 - 1e-9 && cuts.some(function (c) { return Math.abs(f.w - c.w) <= tol; }))) return;
      // (a floor lies inside its profile: a face of the part that happens to lie on the same plane is left alone)
      var o = K.faceOutline(sm, fi), inside = true;
      if (o && o.loops.length) {
        var q = o.loops.map(function (l) { return l.map(function (p2) { var p = K.to3D(o.plane, p2[0], p2[1]); return [V.dot(p, F.u), V.dot(p, F.v)]; }); });
        var ip = interiorPoint(q);
        if (ip) inside = cuts.some(function (c) { return Math.abs(f.w - c.w) <= tol && inPoly(ip, c.poly); });
      }
      if (inside) { caps.push(fi); area += f.area; }
    });
    var out = { mesh: sm, caps: caps, area: area, e: F.e.slice(), ws: cuts.map(function (c) { return c.w; }), front: hi, brokenOut: true };
    cache[key] = out;
    return out;
  }
  // a point inside a region bounded by loops (even-odd), on the scan line of the widest interval found
  function interiorPoint(loops) {
    var lo = Infinity, hi = -Infinity, best = null, bw = 0;
    loops.forEach(function (l) { l.forEach(function (p) { if (p[1] < lo) lo = p[1]; if (p[1] > hi) hi = p[1]; }); });
    if (!(hi > lo)) return null;
    [0.5, 0.37, 0.63, 0.21, 0.79, 0.09, 0.91].forEach(function (f) {
      var y = lo + (hi - lo) * f, xs = [];
      loops.forEach(function (l) {
        for (var i = 0, j = l.length - 1; i < l.length; j = i++) {
          var a = l[j], b = l[i];
          if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]));
        }
      });
      xs.sort(function (x, z) { return x - z; });
      for (var k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1] - xs[k] > bw * 1.5) { bw = xs[k + 1] - xs[k]; best = [(xs[k] + xs[k + 1]) / 2, y]; }
    });
    return best;
  }
  // the projection without the edges the profile's walls leave along it (the thin profile line goes there instead)
  function dropOnProfile(pr, polys, tol) {
    function dSeg(p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
    function on(p) { return polys.some(function (P) { for (var i = 0; i < P.length; i++) if (dSeg(p, P[i], P[(i + 1) % P.length]) <= tol) return true; return false; }); }
    function lineOn(l) { return on([l[0], l[1]]) && on([l[2], l[3]]) && on([(l[0] + l[2]) / 2, (l[1] + l[3]) / 2]); }
    function arcOn(a) { return [a.a0, (a.a0 + a.a1) / 2, a.a1].every(function (d) { var t = d * Math.PI / 180; return on([a.c[0] + a.r * Math.cos(t), a.c[1] + a.r * Math.sin(t)]); }); }
    function circOn(c) { return [0, 90, 180, 270].every(function (d) { var t = d * Math.PI / 180; return on([c.c[0] + c.r * Math.cos(t), c.c[1] + c.r * Math.sin(t)]); }); }
    var out = copyOf(pr);
    out.lines = {}; Object.keys(pr.lines).forEach(function (q) { out.lines[q] = (pr.lines[q] || []).filter(function (l) { return !lineOn(l); }); });
    out.arcs = {}; Object.keys(pr.arcs || {}).forEach(function (q) { out.arcs[q] = (pr.arcs[q] || []).filter(function (a) { return !arcOn(a); }); });
    out.circles = {}; Object.keys(pr.circles).forEach(function (q) { out.circles[q] = (pr.circles[q] || []).filter(function (c) { return !circOn(c); }); });
    if (pr.stats) { out.stats = copyOf(pr.stats); out.stats.visibleLines = out.lines.visible.length; out.stats.hiddenLines = (out.lines.hidden || []).length; out.stats.visibleCircles = out.circles.visible.length; out.stats.hiddenCircles = (out.circles.hidden || []).length; }
    return out;
  }
  function hasBrokenOut(v) { return !!(v && v.brokenOut && v.brokenOut.length && v.kind !== 'section' && v.kind !== 'detail' && v.kind !== 'flat'); }
  // the content of a view with broken-out sections: the part cut by every profile, projected in the view's frame,
  // centred where the uncut view is (so the view does not move); ct.brokenOut lists each profile's polygon and depth.
  // (Worked out on the main thread, a few CSG booleans, like a half / offset / aligned section.)
  function brokenOutContent(doc, v, mesh) {
    var F = D.viewFrame(doc, v), full = D.extentsOf(mesh, F), Pp = mesh.positions64 || mesh.positions, front = -Infinity;
    for (var i = 0; i < Pp.length; i += 3) { var x = Pp[i] * F.e[0] + Pp[i + 1] * F.e[1] + Pp[i + 2] * F.e[2]; if (x > front) front = x; }
    var info = [];
    v.brokenOut.forEach(function (b) {
      var d = null;
      try { d = boDepth(doc, v, F, b, front); } catch (e) { d = null; }   // (a reference view since deleted: that cut is skipped)
      var poly = boPolygon(b);
      if (d > 0 && isFinite(d) && poly.length >= 3) info.push({ id: b.id, poly: poly, depth: d, w: front - d });
    });
    var s = _.viewScale(doc, v);
    if (!info.length || !Pp.length) return { frame: F, proj: _.cachedProjection(mesh, F, v.display, v.tangent), center: [full.cu, full.cv], caps: [], scale: s, brokenOut: info };
    var S = brokenOutOf(mesh, F, info), pr;
    if (!S.mesh.faces.length) pr = { orient: F.name, u: F.u, v: F.v, e: F.e, lines: { visible: [], hidden: [] }, circles: { visible: [], hidden: [] }, arcs: { visible: [], hidden: [] }, ellipses: { visible: [], hidden: [] }, all: [], circlesAll: [], arcsAll: [],
      bounds: { umin: full.umin, umax: full.umax, vmin: full.vmin, vmax: full.vmax }, stats: { visibleLines: 0, hiddenLines: 0, visibleCircles: 0, hiddenCircles: 0 } };
    else pr = _.cachedProjection(S.mesh, F, v.display, v.tangent);
    pr = dropOnProfile(pr, info.map(function (c) { return c.poly; }), meshDiag(mesh) * 1e-6 + 1e-9);
    // (the view keeps the whole part's box, so its place and label stay put)
    pr.bounds = { umin: Math.min(pr.bounds.umin, full.umin), umax: Math.max(pr.bounds.umax, full.umax), vmin: Math.min(pr.bounds.vmin, full.vmin), vmax: Math.max(pr.bounds.vmax, full.vmax) };
    return { frame: F, proj: pr, center: [full.cu, full.cv], caps: capLoops(S, F), scale: s, brokenOut: info, brokenOutArea: S.area };
  }

  // ---- Area Hatch / Fill per region
  // (lane DW) An override is keyed so it survives a rebuild that keeps its region: key 'b<body>[.<part>]:r<n>' — the
  // solid (body; an assembly's component is the body, the part tag the solid inside it) and the region's place among
  // that solid's regions (left to right, then bottom to top). Apply changes to (SolidWorks' Area Hatch/Fill PM):
  // scope 'region' (one region; matched by the stored point when it still lies in a region of that solid, else by the
  // place n), 'body' (every region of the solid, key 'b<body>[.<part>]'), 'component' (every solid of an assembly
  // component, key 'b<body>' + comp: the component id, so it follows the component when the list is reordered). A
  // region scope beats a body scope beats a component scope; an override whose region or solid is gone is not drawn.
  // Old entries without a key match by the point alone.
  var AREA_SCOPES = ['region', 'body', 'component'];
  function solidKey(g) { return 'b' + (g.body | 0) + (g.part != null ? '.' + g.part : ''); }
  function keySolid(k) { return String(k).replace(/:r\d+$/, ''); }
  function keyBody(k) { var m = /^b(\d+)/.exec(String(k)); return m ? +m[1] : -1; }
  // regionPieces(caps) -> [{ cap, loops, body, part, solid, loop, key }]: every hatched region of a view's cut faces
  function regionPieces(caps) {
    var out = [], groups = {};
    (caps || []).forEach(function (cap, ci) {
      splitRegions(cap.loops).forEach(function (sub) {
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        (sub[0] || []).forEach(function (p) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; });
        var g = { cap: ci, loops: sub, body: cap.body | 0, part: cap.part, c: [(x0 + x1) / 2, (y0 + y1) / 2], ext: Math.max(x1 - x0, y1 - y0) };
        g.solid = solidKey(g);
        (groups[g.solid] = groups[g.solid] || []).push(g);
        out.push(g);
      });
    });
    Object.keys(groups).forEach(function (k) {
      var L = groups[k], tol = 1e-6 * Math.max(1, L.reduce(function (m, g) { return Math.max(m, g.ext, Math.abs(g.c[0]), Math.abs(g.c[1])); }, 0));
      L.slice().sort(function (a, b) { var du = a.c[0] - b.c[0]; return Math.abs(du) > tol ? du : a.c[1] - b.c[1]; }).forEach(function (g, i) { g.loop = i; g.key = g.solid + ':r' + i; });
    });
    return out;
  }
  // the body index a component scope names: by its component id when the model has components (gone: -1)
  function scopeBody(h) {
    if (h.comp != null) {
      var model = (_.CTX && _.CTX.model) || _.lastModel, comps = model && model.components;
      if (comps) { for (var i = 0; i < comps.length; i++) if (comps[i] && String(comps[i].id) === String(h.comp)) return i; return -1; }
    }
    return keyBody(h.key);
  }
  function entryHits(h, g, pieces, own) {
    var sc = h.scope || 'region';
    if (sc === 'component') return scopeBody(h) === g.body;
    if (sc === 'body') return h.key === g.solid;
    if (!h.key) return !!h.p && inLoops(h.p, g.loops);
    if (keySolid(h.key) !== g.solid) return false;
    if (h.p) {
      var at = pieces.filter(function (x) { return x.solid === g.solid && inLoops(h.p, x.loops); })[0];
      if (at) return at === g;
    }
    return own && h.key === g.key;
  }
  // the override for a region: the most specific scope, the last entry of it
  function pickOverride(list, g, pieces, own) {
    var best = null, rank = -1;
    (list || []).forEach(function (h) {
      var r = 2 - AREA_SCOPES.indexOf(h.scope || 'region');
      if (r >= rank && entryHits(h, g, pieces, own)) { best = h; rank = r; }
    });
    return best;
  }
  // normFill(props) -> { pattern, scale, angle }: props.fill 'hatch' | 'solid' | 'none' (SolidWorks' Hatch / Solid /
  // None) or a pattern name ('SOLID' and 'NONE' too)
  function normFill(props) {
    var fill = props.fill ? String(props.fill).toLowerCase() : null;
    if (fill && fill !== 'hatch' && fill !== 'solid' && fill !== 'none') throw new Error('Area Hatch fill must be hatch, solid or none');
    var pat = fill === 'solid' ? 'SOLID' : fill === 'none' ? 'NONE' : String(props.pattern || 'ANSI31').toUpperCase();
    if (fill === 'hatch' && (pat === 'SOLID' || pat === 'NONE')) pat = 'ANSI31';
    if (AREA_PATTERNS.indexOf(pat) < 0) throw new Error('Hatch pattern must be one of ' + AREA_PATTERNS.join(', '));
    var sc = props.scale == null ? 1 : +props.scale, an = props.angle == null ? 0 : +props.angle;
    if (!(sc > 0) || !isFinite(sc)) throw new Error('Hatch scale must be greater than zero');
    if (!isFinite(an)) throw new Error('Hatch angle must be a number');
    return { pattern: pat, scale: sc, angle: an };
  }
  // setAreaHatch(doc, viewId, p | key, props | null, opts?) -> the view: the hatched region of the view at p (model
  // units of the view) and / or with key (opts.key, or a key string in place of p) drawn with props { pattern, scale,
  // angle, fill: 'hatch' | 'solid' | 'none' } (null: back to the material crosshatch); opts.scope 'region' (default) |
  // 'body' | 'component' (opts.comp: the component id). Setting a body or component replaces the overrides inside it.
  function setAreaHatch(doc, viewId, p, props, opts) {
    var v = findV(doc, viewId);
    if (!v) throw new Error('No drawing view ' + viewId);
    opts = opts || {};
    if (typeof p === 'string') { opts = { key: p, scope: opts.scope, comp: opts.comp }; p = null; }
    var scope = opts.scope || 'region', key = opts.key != null ? String(opts.key) : null;
    if (AREA_SCOPES.indexOf(scope) < 0) throw new Error('Apply changes to must be region, body or component');
    if (key != null && !/^b\d+(\.\d+)?(:r\d+)?$/.test(key)) throw new Error('A hatch region key looks like b0:r1 (body 0, region 1)');
    if (p != null && (!isFinite(+p[0]) || !isFinite(+p[1]))) throw new Error('Area Hatch needs a point in the region: [u, v]');
    if (scope === 'region' && !key && !p) throw new Error('Area Hatch needs a point in the region: [u, v]');
    if (scope !== 'region' && !key) throw new Error('Apply changes to ' + scope + ' needs the region key');
    if (scope === 'body') key = keySolid(key);
    if (scope === 'component') key = 'b' + keyBody(key);
    if (scope === 'region' && key && !/:r\d+$/.test(key)) throw new Error('A region key ends in :r<n>');
    p = p != null ? [+p[0], +p[1]] : null;
    var list = (v.hatchRegions || []).filter(function (h) {
      var hs = h.scope || 'region';
      if (scope === 'region') return !(hs === 'region' && ((key && h.key === key) || (p && h.p && Math.hypot(h.p[0] - p[0], h.p[1] - p[1]) <= 1e-9)));
      if (scope === 'body') return !(h.key && hs !== 'component' && keySolid(h.key) === key);
      return !(h.key && keyBody(h.key) === keyBody(key));
    });
    if (props) {
      var e = {}, f = normFill(props);
      if (p) e.p = p;
      if (key) e.key = key;
      if (scope !== 'region') e.scope = scope;
      if (scope === 'component' && opts.comp != null) e.comp = String(opts.comp);
      e.pattern = f.pattern; e.scale = f.scale; e.angle = f.angle;
      list.push(e);
    }
    if (list.length) v.hatchRegions = list; else delete v.hatchRegions;
    return v;
  }
  // marks the overridden caps (a fresh copy each, cap.areaHatch): drawing-render.js draws them with the region's own
  // pattern, scale and angle (rfAG; SOLID as a filled region, NONE bare); a detail view follows its parent's entries
  // (by the stored point or the solid) and may have its own
  function applyRegions(doc, v, ct) {
    if (!ct.caps || !ct.caps.length) return;
    var par = v.kind === 'detail' && v.parent != null ? findV(doc, v.parent) : null;
    var own = v.hatchRegions || [], pe = par && par.hatchRegions || [];
    if (!own.length && !pe.length) return;
    var pieces = regionPieces(ct.caps), hit = {};
    pieces.forEach(function (g) { g.o = pickOverride(own, g, pieces, true) || pickOverride(pe, g, pieces, false); if (g.o) hit[g.cap] = 1; });
    var out = [];
    ct.caps.forEach(function (cap, ci) {
      if (!hit[ci]) { out.push(cap); return; }
      // (a cut face in several pieces — the plate either side of a hole — is one region per piece, as SolidWorks
      // selects them: only the piece picked takes the pattern)
      pieces.filter(function (g) { return g.cap === ci; }).forEach(function (g) {
        var c2 = {}; Object.keys(cap).forEach(function (q) { c2[q] = cap[q]; });
        c2.loops = g.loops;
        var o = g.o;
        if (o) { c2.areaHatch = { pattern: o.pattern, scale: o.scale, angle: o.angle, scope: o.scope || 'region' }; if (o.p) c2.areaHatch.p = o.p.slice(); if (o.key) c2.areaHatch.key = o.key; }
        out.push(c2);
      });
    });
    ct.caps = out;
  }
  // ---- (lane DW) Area Hatch/Fill on a closed region that is not a cut face (SolidWorks: Insert ▸ Annotations ▸ Area
  // Hatch/Fill on a closed sketch profile, or on a model face in a view):
  //   * view.areaFills = [{ id, face: { p: [u, v] (model units of the view), n: [x, y, z] (the face's normal) },
  //     pattern, scale, angle }]: the model face under p, found again at every compute (the nearest face facing the
  //     viewer there, kept only while its normal is n), outlined in the view and hatched; the view's own sketch:
  //     [{ id, ids: [sketch entity ids], … }];
  //   * doc.sheet.areaFills = [{ id, ids, pattern, scale, angle }]: a closed profile of the sheet's own sketch.
  // A fill whose face or profile is gone is not drawn. pattern 'SOLID' fills, 'NONE' draws nothing (kept, editable).
  function unitE(F) { var e = F.e, l = Math.hypot(e[0], e[1], e[2]) || 1; return [e[0] / l, e[1] / l, e[2] / l]; }
  // faceAt(mesh, F, p) -> the index of the nearest face turned to the viewer under view point p, or -1
  function faceAt(mesh, F, p) {
    if (!mesh || !mesh.faces) return -1;
    var P = mesh.positions64 || mesh.positions, e = unitE(F), best = -1, bd = -Infinity;
    mesh.faces.forEach(function (f, fi) {
      if (V.dot(f.normal, e) <= 1e-6) return;
      for (var t = f.start; t < f.start + f.count; t++) {
        var q = [], o = t * 9;
        for (var j = 0; j < 3; j++) { var x = [P[o + 3 * j], P[o + 3 * j + 1], P[o + 3 * j + 2]]; q.push([V.dot(x, F.u), V.dot(x, F.v), V.dot(x, e)]); }
        var d = (q[1][1] - q[2][1]) * (q[0][0] - q[2][0]) + (q[2][0] - q[1][0]) * (q[0][1] - q[2][1]);
        if (Math.abs(d) < 1e-18) continue;
        var l0 = ((q[1][1] - q[2][1]) * (p[0] - q[2][0]) + (q[2][0] - q[1][0]) * (p[1] - q[2][1])) / d;
        var l1 = ((q[2][1] - q[0][1]) * (p[0] - q[2][0]) + (q[0][0] - q[2][0]) * (p[1] - q[2][1])) / d, l2 = 1 - l0 - l1;
        if (l0 < -1e-9 || l1 < -1e-9 || l2 < -1e-9) continue;
        var z = l0 * q[0][2] + l1 * q[1][2] + l2 * q[2][2];
        if (z > bd + 1e-9) { bd = z; best = fi; }
      }
    });
    return best;
  }
  // faceLoopsIn(mesh, fi, F) -> the face's outline loops in the view's frame (as the cut faces' capLoops)
  function faceLoopsIn(mesh, fi, F) {
    var o = K.faceOutline(mesh, fi);
    if (!o || !o.loops || !o.loops.length) return null;
    return o.loops.map(function (loop) { return loop.map(function (p2) { var p = K.to3D(o.plane, p2[0], p2[1]); return [V.dot(p, F.u), V.dot(p, F.v)]; }); });
  }
  function fillId(doc) { doc.nextFill = (doc.nextFill | 0) + 1; return 'AF' + doc.nextFill; }
  function fillLists(doc) {
    var out = [];
    if (doc.sheet && doc.sheet.areaFills) out.push({ list: doc.sheet.areaFills, view: null, owner: doc.sheet });
    (doc.views || []).forEach(function (v) { if (v.areaFills) out.push({ list: v.areaFills, view: v, owner: v }); });
    return out;
  }
  function findFill(doc, id) {
    var ls = fillLists(doc);
    for (var i = 0; i < ls.length; i++) for (var j = 0; j < ls[i].list.length; j++) if (ls[i].list[j].id === id) return { entry: ls[i].list[j], at: j, l: ls[i] };
    return null;
  }
  function fillCopy(f, view) { var c = JSON.parse(JSON.stringify(f.entry || f)); c.view = view ? view.id : null; c.kind = c.face ? 'face' : 'sketch'; return c; }
  // addAreaFill(doc, spec, mesh?, frame?) -> the fill (a copy, with view and kind): spec { ids: [sketch ids] (a
  // closed profile of the sheet's or a view's sketch) | view, p: [u, v] (a model face in that view; needs the mesh and
  // the view's frame), pattern, scale, angle, fill: 'hatch' | 'solid' | 'none' }
  function addAreaFill(doc, spec, mesh, frame) {
    spec = spec || {};
    var f = normFill(spec), e = { id: null };
    if (spec.ids != null) {
      var lp = D.sketchLoop(doc, spec.ids), v0 = lp.view != null ? findV(doc, lp.view) : null;
      e.ids = lp.ids.slice();
      e.pattern = f.pattern; e.scale = f.scale; e.angle = f.angle; e.id = fillId(doc);
      var own = v0 || doc.sheet;
      (own.areaFills = own.areaFills || []).push(e);
      return fillCopy(e, v0);
    }
    var v = findV(doc, spec.view);
    if (!v) throw new Error('Area Hatch/Fill: give a closed sketch profile (ids) or a view and a point on a face');
    if (v.kind === 'section' || v.kind === 'flat' || (v.brokenOut && v.brokenOut.length)) throw new Error('Area Hatch/Fill: in a section, click its hatched region; a flat pattern has no model faces');
    var p = spec.p;
    if (!p || !isFinite(+p[0]) || !isFinite(+p[1])) throw new Error('Area Hatch/Fill on a face needs a point in the view: [u, v]');
    if (!frame) throw new Error('Area Hatch/Fill on a face needs the view laid out');
    p = [+p[0], +p[1]];
    var fi = faceAt(mesh, frame, p);
    if (fi < 0 || !faceLoopsIn(mesh, fi, frame)) throw new Error('Area Hatch/Fill: no model face under that point');
    e.face = { p: p, n: mesh.faces[fi].normal.slice() };
    e.pattern = f.pattern; e.scale = f.scale; e.angle = f.angle; e.id = fillId(doc);
    (v.areaFills = v.areaFills || []).push(e);
    return fillCopy(e, v);
  }
  // editAreaFill(doc, id, props | null) -> the fill (null: deleted, returns null)
  function editAreaFill(doc, id, props) {
    var hit = findFill(doc, id);
    if (!hit) throw new Error('No area hatch ' + id);
    if (!props) { hit.l.list.splice(hit.at, 1); if (!hit.l.list.length) delete hit.l.owner.areaFills; return null; }
    var f = normFill(Object.assign({ pattern: hit.entry.pattern, scale: hit.entry.scale, angle: hit.entry.angle }, props));
    hit.entry.pattern = f.pattern; hit.entry.scale = f.scale; hit.entry.angle = f.angle;
    return fillCopy(hit.entry, hit.l.view);
  }
  function areaFills(doc) { var out = []; fillLists(doc).forEach(function (l) { l.list.forEach(function (e) { out.push(fillCopy(e, l.view)); }); }); return out; }
  // (lane DW2) the sheet loops of a sketch fill: its profile, then every closed profile of the same sketch (the sheet's,
  // or the view's) lying inside it, as islands — the hatch is even-odd, so nested islands alternate (SolidWorks)
  function sketchFillLoops(doc, e) {
    var lp;
    try { lp = D.sketchLoop(doc, e.ids.length > 1 ? e.ids : e.ids[0]); } catch (err) { return null; }
    if (!lp || lp.pts.length < 3) return null;
    var loops = [lp.pts], seen = {};
    lp.ids.forEach(function (id) { seen[id] = 1; });
    (D.sketchEntities ? D.sketchEntities(doc, lp.view) : []).forEach(function (en) {
      if (!/^(line|arc|spline|circle)$/.test(en.t) || seen[en.id]) return;
      var q;
      try { q = D.sketchLoop(doc, en.id); } catch (err) { return; }
      q.ids.forEach(function (id) { seen[id] = 1; });
      if (q.pts.length >= 3 && q.pts.every(function (p) { return inPoly(p, lp.pts); })) loops.push(q.pts);
    });
    return loops;
  }
  // (lane DW2) the visible part of model face fi in frame F: null when nothing in front of it overlaps it (then its
  // outline is used as it is); else convex pieces (view coordinates): the face's triangles less every triangle of a
  // face turned to the viewer that lies nearer than this face's plane where they overlap — the hidden-line result of
  // the view for this face, as areas
  function tri2(P, t, F, e) {
    var o = t * 9, q = [];
    for (var j = 0; j < 3; j++) { var x = [P[o + 3 * j], P[o + 3 * j + 1], P[o + 3 * j + 2]]; q.push([V.dot(x, F.u), V.dot(x, F.v), V.dot(x, e)]); }
    if ((q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[0][0]) < 0) q.reverse();
    return q;
  }
  function areaOf(P) { var a = 0; for (var i = 0, j = P.length - 1; i < P.length; j = i++) a += (P[j][0] - P[i][0]) * (P[j][1] + P[i][1]); return a / 2; }
  // the part of convex polygon P on the left of a -> b (keep) or on its right
  function clipHalf(P, a, b, left) {
    var out = [], dx = b[0] - a[0], dy = b[1] - a[1];
    function s(p) { var c = dx * (p[1] - a[1]) - dy * (p[0] - a[0]); return left ? c : -c; }
    for (var i = 0; i < P.length; i++) {
      var p = P[i], q = P[(i + 1) % P.length], sp = s(p), sq = s(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { var f = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]); }
    }
    return out;
  }
  // convex P less convex counter-clockwise triangle T -> convex pieces
  function convexLess(P, T, eps) {
    var inside = P;
    for (var i = 0; i < 3 && inside.length; i++) inside = clipHalf(inside, T[i], T[(i + 1) % 3], true);
    if (inside.length < 3 || areaOf(inside) <= eps) return [P];
    var out = [], rest = P;
    for (var k = 0; k < 3 && rest.length >= 3; k++) {
      var a = T[k], b = T[(k + 1) % 3], o = clipHalf(rest, a, b, false);
      if (o.length >= 3 && areaOf(o) > eps) out.push(o);
      rest = clipHalf(rest, a, b, true);
    }
    return out;
  }
  function visibleFacePieces(mesh, fi, F) {
    var P = mesh.positions64 || mesh.positions, e = unitE(F), f = mesh.faces[fi], n = f.normal, nz = V.dot(n, e);
    if (!(nz > 1e-9)) return null;
    var nu = V.dot(n, F.u), nv = V.dot(n, F.v), diag = meshDiag(mesh), tol = diag * 1e-7, eps = diag * diag * 1e-12;
    function depth(u, v) { return (f.w - u * nu - v * nv) / nz; }
    var base = [], bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (var t = f.start; t < f.start + f.count; t++) {
      var q = tri2(P, t, F, e);
      base.push(q.map(function (p) { bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]); bb[2] = Math.max(bb[2], p[0]); bb[3] = Math.max(bb[3], p[1]); return [p[0], p[1]]; }));
    }
    var occ = [];
    mesh.faces.forEach(function (g, gi) {
      if (gi === fi || V.dot(g.normal, e) <= 1e-6) return;
      for (var s = g.start; s < g.start + g.count; s++) {
        var T = tri2(P, s, F, e);
        if (Math.max(T[0][0], T[1][0], T[2][0]) <= bb[0] + tol || Math.min(T[0][0], T[1][0], T[2][0]) >= bb[2] - tol) continue;
        if (Math.max(T[0][1], T[1][1], T[2][1]) <= bb[1] + tol || Math.min(T[0][1], T[1][1], T[2][1]) >= bb[3] - tol) continue;
        var cu = (T[0][0] + T[1][0] + T[2][0]) / 3, cv = (T[0][1] + T[1][1] + T[2][1]) / 3, cz = (T[0][2] + T[1][2] + T[2][2]) / 3;
        if (cz > depth(cu, cv) + tol) occ.push(T.map(function (p) { return [p[0], p[1]]; }));
      }
    });
    if (!occ.length) return null;
    var pieces = base, hit = false;
    occ.forEach(function (T) {
      var next = [];
      pieces.forEach(function (Pc) { var r = convexLess(Pc, T, eps); if (r.length !== 1 || r[0] !== Pc) hit = true; r.forEach(function (x) { next.push(x); }); });
      pieces = next;
    });
    return hit ? pieces : null;
  }
  // (lane DW2) hatch segments cut at the pieces' shared edges joined again: [[x1, y1, x2, y2]] on one line that touch
  // end to end become one
  function mergeSegs(segs) {
    var groups = {}, order = [], out = [];
    segs.forEach(function (s) {
      var dx = s[2] - s[0], dy = s[3] - s[1];
      if (Math.hypot(dx, dy) < 1e-12) { out.push(s); return; }
      var a = Math.atan2(dy, dx); if (a < 0) a += Math.PI; if (a >= Math.PI - 1e-9) a -= Math.PI;
      var d = [Math.cos(a), Math.sin(a)], off = -d[1] * s[0] + d[0] * s[1], t0 = d[0] * s[0] + d[1] * s[1], t1 = d[0] * s[2] + d[1] * s[3];
      var k = a.toFixed(7) + '|' + off.toFixed(6);
      if (!groups[k]) { groups[k] = { d: d, off: off, list: [] }; order.push(k); }
      groups[k].list.push([Math.min(t0, t1), Math.max(t0, t1)]);
    });
    order.forEach(function (k) {
      var g = groups[k], cur = null;
      function emit(iv) { var bx = -g.d[1] * g.off, by = g.d[0] * g.off; out.push([bx + g.d[0] * iv[0], by + g.d[1] * iv[0], bx + g.d[0] * iv[1], by + g.d[1] * iv[1]]); }
      g.list.sort(function (x, y) { return x[0] - y[0]; }).forEach(function (iv) {
        if (cur && iv[0] <= cur[1] + 1e-7) cur[1] = Math.max(cur[1], iv[1]);
        else { if (cur) emit(cur); cur = iv.slice(); }
      });
      if (cur) emit(cur);
    });
    return out;
  }
  // resolveFills(doc, v | null, frame, mesh, toSheet) -> [{ entry, kind, loops (sheet) }] of a view's fills, or the
  // sheet's own (v null)
  function resolveFills(doc, v, frame, mesh, toSheet) {
    var list = v ? v.areaFills : doc.sheet && doc.sheet.areaFills, out = [];
    (list || []).forEach(function (e) {
      var loops = null, split = false;
      if (e.face) {
        if (!frame || !mesh) return;
        var fi = faceAt(mesh, frame, e.face.p), n = fi >= 0 ? mesh.faces[fi].normal : null;
        if (!n || V.dot(n, e.face.n) < 1 - 1e-6) return;
        // (lane DW2) only where the face shows: its outline when nothing in front overlaps it, else the visible pieces
        var L = visibleFacePieces(mesh, fi, frame), split = !!L;
        if (!L) L = faceLoopsIn(mesh, fi, frame);
        loops = L && L.map(function (l) { return l.map(toSheet); });
      } else if (e.ids) loops = sketchFillLoops(doc, e);
      if (loops && loops.length) out.push({ entry: e, kind: e.face ? 'face' : 'sketch', loops: loops, split: !!split });
    });
    return out;
  }
  // sketchRegionAt(doc, p (sheet)) -> { ids, view, pts } the smallest closed sketch profile round p, or null
  function sketchRegionAt(doc, p) {
    var best = null, ba = Infinity, seen = {};
    (D.sketchEntities ? D.sketchEntities(doc) : []).forEach(function (en) {
      if (!/^(line|arc|spline|circle)$/.test(en.t) || seen[en.id]) return;
      var lp;
      try { lp = D.sketchLoop(doc, en.id); } catch (err) { return; }
      lp.ids.forEach(function (id) { seen[id] = 1; });
      if (!inPoly(p, lp.pts)) return;
      var a = Math.abs(polyArea(lp.pts));
      if (a < ba) { ba = a; best = lp; }
    });
    return best ? { ids: best.ids, view: best.view, pts: best.pts } : null;
  }
  // splitRegions(loops) -> [[loop…]…]: each outer loop with the holes directly inside it
  function splitRegions(loops) {
    if (loops.length < 2) return [loops];
    var depth = loops.map(function (l, i) { return loops.filter(function (o, j) { return j !== i && inPoly(l[0], o); }).length; });
    var outer = [], subs = [];
    loops.forEach(function (l, i) { if (depth[i] % 2 === 0) { outer.push(i); subs.push([l]); } });
    loops.forEach(function (l, i) {
      if (depth[i] % 2 === 0) return;
      var best = -1;
      outer.forEach(function (oi, k) { if (depth[oi] === depth[i] - 1 && inPoly(l[0], loops[oi])) best = k; });
      if (best >= 0) subs[best].push(l);
    });
    return subs.length ? subs : [loops];
  }
  // the jagged outline of a detail view (sheet units): closed points round its boundary, every other one 1.2 mm out
  function jaggedPts(w, k) {
    var dt = w.view.detail, c = w.toSheet(dt.c), hf = detailHalf(dt), s = w.scale, prof = dt.shape === 'profile', hw = hf[0] * s, hh = hf[1] * s;
    var amp = 1.2 * k, step = 2 * k, pts = [];
    if (dt.pts && dt.pts.length >= 3) {
      // (rfCQ) a sketched profile: points every `step` along its perimeter, every other one out along the boundary's
      // outward normal (the profile is counter-clockwise, and toSheet keeps that)
      var Sp = dt.pts.map(w.toSheet), segs = [], L = 0;
      for (var i = 0; i < Sp.length; i++) { var a = Sp[i], b = Sp[(i + 1) % Sp.length], ln = Math.hypot(b[0] - a[0], b[1] - a[1]); if (ln > 1e-12) { segs.push({ a: a, b: b, len: ln, at: L }); L += ln; } }
      var m2 = Math.max(12, 2 * Math.round(L / step / 2)), si = 0;
      for (var jj = 0; jj < m2; jj++) {
        var at = jj / m2 * L;
        while (si < segs.length - 1 && segs[si].at + segs[si].len < at) si++;
        var sg = segs[si], f2 = (at - sg.at) / sg.len, dx = (sg.b[0] - sg.a[0]) / sg.len, dy = (sg.b[1] - sg.a[1]) / sg.len, o2 = jj % 2 ? amp : 0;
        pts.push([sg.a[0] + (sg.b[0] - sg.a[0]) * f2 + dy * o2, sg.a[1] + (sg.b[1] - sg.a[1]) * f2 - dx * o2]);
      }
      return pts;
    }
    if (!prof) {
      var n = Math.max(12, 2 * Math.round(Math.PI * hw / step));
      for (var j = 0; j < n; j++) { var t = j / n * 2 * Math.PI, rr = hw + (j % 2 ? amp : 0); pts.push([c[0] + rr * Math.cos(t), c[1] + rr * Math.sin(t)]); }
    } else {
      var Q = [[c[0] - hw, c[1] - hh], [c[0] + hw, c[1] - hh], [c[0] + hw, c[1] + hh], [c[0] - hw, c[1] + hh]], nrm = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      for (var e = 0; e < 4; e++) {
        var A = Q[e], B = Q[(e + 1) % 4], len = Math.hypot(B[0] - A[0], B[1] - A[1]), m = Math.max(2, 2 * Math.round(len / step / 2));
        for (var q2 = 0; q2 < m; q2++) { var f = q2 / m, o = q2 % 2 ? amp : 0; pts.push([A[0] + (B[0] - A[0]) * f + nrm[e][0] * o, A[1] + (B[1] - A[1]) * f + nrm[e][1] * o]); }
      }
    }
    return pts;
  }
  function withAB(p, a, b) { var q = {}; Object.keys(p).forEach(function (kk) { q[kk] = p[kk]; }); q.a = a; q.b = b; return q; }
  // the pieces of a sheet primitive inside polygon P: lines split where they cross it, arcs / circles into arcs; []
  // when outside; other kinds kept when their centre is inside
  function primInPoly(p, P) {
    if (p.k === 'line') {
      var a = p.a, b = p.b, ts = [0, 1];
      for (var i = 0; i < P.length; i++) {
        var c = P[i], d = P[(i + 1) % P.length], r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
        if (Math.abs(den) < 1e-18) continue;
        var t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
      }
      ts.sort(function (x, y) { return x - y; });
      var out = [];
      for (var j = 0; j + 1 < ts.length; j++) {
        if (ts[j + 1] - ts[j] < 1e-12) continue;
        var tm = (ts[j] + ts[j + 1]) / 2;
        if (!inPoly([a[0] + (b[0] - a[0]) * tm, a[1] + (b[1] - a[1]) * tm], P)) continue;
        var last = out[out.length - 1], A = [a[0] + (b[0] - a[0]) * ts[j], a[1] + (b[1] - a[1]) * ts[j]], B = [a[0] + (b[0] - a[0]) * ts[j + 1], a[1] + (b[1] - a[1]) * ts[j + 1]];
        if (last && Math.hypot(last.b[0] - A[0], last.b[1] - A[1]) < 1e-12) last.b = B; else out.push(withAB(p, A, B));
      }
      return out;
    }
    if (p.k === 'arc' || p.k === 'circle') {
      var a0 = p.k === 'arc' ? p.a0 : 0, a1 = p.k === 'arc' ? p.a1 : 360, angs = [a0, a1];
      for (var e = 0; e < P.length; e++) {
        var C = P[e], D2 = P[(e + 1) % P.length], dx = D2[0] - C[0], dy = D2[1] - C[1], fx = C[0] - p.c[0], fy = C[1] - p.c[1];
        var qa = dx * dx + dy * dy, qb = 2 * (fx * dx + fy * dy), qc = fx * fx + fy * fy - p.r * p.r, disc = qb * qb - 4 * qa * qc;
        if (qa < 1e-24 || disc < 0) continue;
        [(-qb - Math.sqrt(disc)) / (2 * qa), (-qb + Math.sqrt(disc)) / (2 * qa)].forEach(function (t) {
          if (t < 0 || t > 1) return;
          var deg = Math.atan2(C[1] + dy * t - p.c[1], C[0] + dx * t - p.c[0]) * 180 / Math.PI;
          while (deg < a0) deg += 360;
          while (deg > a0 + 360) deg -= 360;
          if (deg > a0 && deg < a1) angs.push(deg);
        });
      }
      angs.sort(function (x, y) { return x - y; });
      if (angs.length === 2) {
        var tm0 = (a0 + a1) / 2 * Math.PI / 180;
        return inPoly([p.c[0] + p.r * Math.cos(tm0), p.c[1] + p.r * Math.sin(tm0)], P) ? [p] : [];
      }
      var res = [];
      for (var k2 = 0; k2 + 1 < angs.length; k2++) {
        if (angs[k2 + 1] - angs[k2] < 1e-9) continue;
        var mid = (angs[k2] + angs[k2 + 1]) / 2 * Math.PI / 180;
        if (!inPoly([p.c[0] + p.r * Math.cos(mid), p.c[1] + p.r * Math.sin(mid)], P)) continue;
        var prev = res[res.length - 1];
        if (prev && Math.abs(prev.a1 - angs[k2]) < 1e-9) prev.a1 = angs[k2 + 1];
        else { var q = {}; Object.keys(p).forEach(function (kk) { q[kk] = p[kk]; }); q.k = 'arc'; q.a0 = angs[k2]; q.a1 = angs[k2 + 1]; res.push(q); }
      }
      // (a circle cut open at its seam joins back up)
      if (p.k === 'circle' && res.length > 1 && Math.abs(res[0].a0 - a0) < 1e-9 && Math.abs(res[res.length - 1].a1 - a1) < 1e-9) { var lastA = res.pop(); res[0].a0 = lastA.a0 - 360; }
      return res;
    }
    var cc = p.c || (p.a && p.b ? [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2] : null);
    return !cc || inPoly(cc, P) ? [p] : [];
  }
  // a detail view's linework (its layer's lines, arcs, circles, ellipses; not its label or outline) clipped to P
  function clipLayerToPoly(prims, L, P) {
    for (var i = prims.length - 1; i >= 0; i--) {
      var p = prims[i];
      if (p.layer !== L || p.detailOutline != null || !/^(line|arc|circle|ellipse|region)$/.test(p.k)) continue;
      if (p.k === 'region') { var rq = withLoops(p, clipLoopsPoly(p.loops, P)); Array.prototype.splice.apply(prims, rq ? [i, 1, rq] : [i, 1]); continue; }   // (rfAG; rfCX: the true profile, not its convex hull)
      Array.prototype.splice.apply(prims, [i, 1].concat(primInPoly(p, P)));
    }
  }
  // (rfAD) the content of a view once drawing-sheet.js has worked it out (called through _.auxCenter): a detail with a
  // Jagged outline takes its parent's linework out past the zig-zag (clipped to it in detailOutline), and the hatched
  // regions with their own pattern are marked
  function contentExtras(doc, v, ct, parentContent) {
    if (!ct || !ct.proj) return;
    if (v.kind === 'detail' && v.detail && v.detail.outline === 'jagged' && parentContent && v.parent != null) {
      var par = findV(doc, v.parent), pc = par ? parentContent(par) : null, dt = v.detail;
      if (pc && pc.proj) {
        var amp = 1.25 * _.paperK(doc.units === 'in' ? 'in' : 'mm') / (ct.scale || _.viewScale(doc, v)), b0 = ct.proj.bounds;
        if (dt.shape === 'profile' && dt.a && dt.b) {
          var R = [Math.min(dt.a[0], dt.b[0]) - amp, Math.min(dt.a[1], dt.b[1]) - amp, Math.max(dt.a[0], dt.b[0]) + amp, Math.max(dt.a[1], dt.b[1]) + amp];
          var o = cropContent({ frame: pc.frame, proj: pc.proj, caps: pc.caps, center: ct.center }, { type: 'rect', a: [R[0], R[1]], b: [R[2], R[3]] });
          ct.proj = o.proj; ct.caps = o.caps;
        } else {
          ct.proj = clipProjection(pc.proj, dt.c, dt.r + amp);
          if (pc.proj.pending) ct.proj.pending = true;
          ct.clip = { c: dt.c.slice(), r: dt.r + amp };
        }
        ct.proj.bounds = b0;   // (the view's box stays the detail's circle / rectangle)
        ct.jagged = true;
      }
    }
    applyRegions(doc, v, ct);
  }
  // a clipper for sheet primitives added to view w after it was drawn: a jagged outline, a detail rectangle, a
  // rectangular crop, a detail / crop circle
  function viewClipper(w, k) {
    var v = w.view, ct = w.content || {};
    if (v.kind === 'detail' && v.detail && v.detail.outline === 'jagged') { var J = jaggedPts(w, k); return function (p) { return primInPoly(p, J); }; }
    if (ct.poly) { var Qp = ct.poly.map(w.toSheet); return function (p) { return primInPoly(p, Qp); }; }   // (rfCQ) a sketched profile
    var R = ct.profile || (ct.crop && ct.crop.type === 'rect' ? [ct.crop.a[0], ct.crop.a[1], ct.crop.b[0], ct.crop.b[1]] : null);
    if (R) { var a = w.toSheet([R[0], R[1]]), b = w.toSheet([R[2], R[3]]), Q = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]]; return function (p) { return primInPoly(p, Q); }; }
    if (w.clip) return function (p) { var q = clipSeg([p.a[0], p.a[1], p.b[0], p.b[1]], w.clip.c, w.clip.r); return q ? [withAB(p, [q[0], q[1]], [q[2], q[3]])] : []; };
    return function (p) { return [p]; };
  }
  // sheet-time marks (from viewKindMarks, before breaks): each broken-out profile as a thin line, in its view and in a
  // detail of it
  function brokenOutMarks(doc, sheet, w, byId, k) {
    var v = w.view, src = null;
    if (w.pending) return;
    if (w.content && w.content.brokenOut && w.content.brokenOut.length) src = w.content.brokenOut;
    else if (v.kind === 'detail' && v.parent != null && byId[v.parent] && byId[v.parent].content && byId[v.parent].content.brokenOut) src = byId[v.parent].content.brokenOut;
    if (!src || !src.length) return;
    var clip = viewClipper(w, k);
    src.forEach(function (c) {
      var P = c.poly.map(w.toSheet);
      for (var i = 0; i < P.length; i++) clip({ k: 'line', a: P[i], b: P[(i + 1) % P.length], layer: w.layer, style: 'thin', brokenOut: c.id, view: v.id }).forEach(function (q) { sheet.prims.push(q); });
    });
  }
  // hatchRegions(sheetView) -> [{ index, p (a point inside, model units of the view), pattern, scale, angle (added to
  // the pattern's 45°), areaHatch (its own pattern), body, part, loops, cap (index into the view's cut faces) }]: the
  // hatched regions of a laid-out view, a cut face in several pieces giving one region per piece
  function hatchRegions(w) {
    var ct = w && w.content, out = [];
    if (!ct || !ct.caps) return out;
    var model = (_.CTX && _.CTX.model) || _.lastModel, comps = model && model.type === 'assembly' && model.components;
    regionPieces(ct.caps).forEach(function (g) {
      var i = g.cap, cap = ct.caps[i], he = (w.hatches || [])[i] || {}, ah = cap.areaHatch, st = cap.style || hatchStyle(cap.body);
      var p = interiorPoint(g.loops);
      if (!p) return;
      var r = { index: out.length, cap: i, p: p, body: cap.body, part: cap.part, loops: g.loops, key: g.key, solid: g.solid,
        pattern: ah ? ah.pattern : he.pattern || 'ANSI31', scale: ah ? ah.scale : 1, angle: ah ? ah.angle : (isFinite(st.angle) ? st.angle : 45) - 45, areaHatch: !!ah };
      if (ah) r.scope = ah.scope || 'region';
      if (comps && comps[cap.body | 0]) r.comp = String(comps[cap.body | 0].id);
      out.push(r);
    });
    return out;
  }
  // regionAt(sheetView, p) -> the hatched region (an entry of hatchRegions) of view w under the sheet point p, or null
  function regionAt(w, p) {
    if (!w || !w.content || !w.content.caps || !w.fromSheet) return null;
    if (w.clip && Math.hypot(p[0] - w.clip.c[0], p[1] - w.clip.c[1]) > w.clip.r) return null;
    var q = w.fromSheet(p);
    return hatchRegions(w).filter(function (g) { return inLoops(q, g.loops); })[0] || null;
  }
  // ---- (rfCX) Removed Section (SolidWorks: Drawing View ▸ Removed Section). The cutting line runs between two points
  // of the parent (two opposite edges picked in the UI), horizontal or vertical, whichever is nearer; the view is
  // the cross-section alone (the cut faces hatched and their outlines, nothing behind the cut), not aligned with the
  // parent, placed anywhere and labelled SECTION A-A. It is a section view (kind 'section') with
  // section.removed: true and section.partial: [from, to] (the line's ends), so the cutting line, the label letter,
  // deleting with the parent, Scale with model changes and the worker's section jobs are the full section's.
  // addRemovedSection(doc, mesh, parentId, { a: [u, v], b: [u, v] (parent frame, model units), at?, sign, flip, x, y,
  // label, scale, showLabel, scaleWithModel, fit }) -> the view
  function addRemovedSection(doc, mesh, parentId, opts) {
    opts = opts || {};
    function num2(p) { return p && p.length >= 2 && isFinite(+p[0]) && isFinite(+p[1]) ? [+p[0], +p[1]] : null; }
    var a = num2(opts.a), b = num2(opts.b);
    if (!a || !b) throw new Error('A removed section needs the two ends of its cutting line: { a: [u, v], b: [u, v] } (points on two opposite edges of the parent view)');
    var du = b[0] - a[0], dv = b[1] - a[1];
    if (!(Math.hypot(du, dv) > 1e-9)) throw new Error('The two ends of a removed section\'s cutting line must be apart');
    var par = findV(doc, parentId);
    if (!par) throw new Error('No drawing view ' + parentId);
    if (isRemoved(par)) throw new Error('A removed section cannot be cut from a removed section');
    var axis = Math.abs(du) >= Math.abs(dv) ? 'h' : 'v', ti = axis === 'h' ? 0 : 1;
    var at = opts.at != null && isFinite(+opts.at) ? +opts.at : a[1 - ti];
    var lo = Math.min(a[ti], b[ti]), hi = Math.max(a[ti], b[ti]), sign = (opts.sign < 0 ? -1 : 1) * (opts.flip ? -1 : 1);
    var nv = doc.views.length, nn = doc.nextView, v;
    try {
      v = D.addSectionView(doc, mesh, parentId, { axis: axis, at: at, sign: sign, label: opts.label, showLabel: opts.showLabel, x: par.x, y: par.y, partial: [lo, hi], scaleWithModel: !!opts.scaleWithModel });
      v.section.removed = true;
      v.align = null;
      v.name = 'Removed Section ' + v.label + '-' + v.label;
      if (opts.scale) {
        var sc = Array.isArray(opts.scale) ? [+opts.scale[0], +opts.scale[1]] : D.parseScale(opts.scale);
        if (!sc || !(sc[0] > 0 && sc[1] > 0)) throw new Error('Scale: ' + opts.scale);
        v.scale = sc; delete v.section.parentScale;
      }
      if (opts.x != null && opts.y != null) { v.x = +opts.x; v.y = +opts.y; }
      else if (mesh) {
        // (beside the parent first: right of a vertical line, below a horizontal one; then the nearest clear spot)
        var pe = D.viewExtents(doc, mesh, par), ps = _.viewScale(doc, par), g = 22 * _.paperK(doc.units === 'in' ? 'in' : 'mm');
        if (axis === 'v') { v.x = par.x + pe.w * ps / 2 + g * 2; v.y = par.y; } else { v.x = par.x; v.y = par.y - pe.h * ps / 2 - g * 2; }
        (opts.fit ? _.fitOnSheet : _.clearSpot)(doc, mesh, v, null);
        if (v.section.parentScale && JSON.stringify(v.scale || null) !== JSON.stringify(par.scale || null)) delete v.section.parentScale;   // (fitted smaller)
      }
    } catch (err) { doc.views.splice(nv); doc.nextView = nn; throw err; }
    return v;
  }
  function isRemoved(v) { return !!(v && v.kind === 'section' && v.section && v.section.removed); }
  // removedContent(v, ct): the full section's content cut down to the removed section: the cut faces between the
  // line's ends (each loop clipped to the band, a hair wider so an end on an edge keeps the face whole) and, of the cut
  // part's projection, only the visible lines, circles and arcs that lie on those faces' outlines
  function removedContent(v, ct) {
    var sc = v.section, p = sc.partial, ti = sc.axis === 'h' ? 0 : 1, span = p[1] - p[0], tol = Math.max(span * 1e-4, 1e-9), B = 1e9;
    var R = ti === 0 ? [p[0] - tol, -B, p[1] + tol, B] : [-B, p[0] - tol, B, p[1] + tol];
    var o = {}; Object.keys(ct).forEach(function (q) { o[q] = ct[q]; });
    o.caps = (ct.caps || []).map(function (cap) {
      var c2 = {}; Object.keys(cap).forEach(function (q) { c2[q] = cap[q]; });
      c2.loops = cap.loops.map(function (l) { return loopInRect(l, R); }).filter(Boolean);
      return c2;
    }).filter(function (c) { return c.loops.length; });
    o.removed = true;
    var pr = ct.proj, E = [], lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    o.caps.forEach(function (c) { c.loops.forEach(function (l) { for (var i = 0; i < l.length; i++) { var q = l[i]; E.push([q, l[(i + 1) % l.length]]); lo = [Math.min(lo[0], q[0]), Math.min(lo[1], q[1])]; hi = [Math.max(hi[0], q[0]), Math.max(hi[1], q[1])]; } }); });
    var out = { orient: pr.orient, u: pr.u, v: pr.v, e: pr.e, lines: { visible: [], hidden: [], tangent: [] }, circles: { visible: [], hidden: [], tangent: [] }, arcs: { visible: [], hidden: [], tangent: [] },
      ellipses: { visible: [], hidden: [] }, all: [], circlesAll: [], arcsAll: [] };
    if (pr.pending) out.pending = true;
    if (!E.length) {
      // (nothing cut between the ends, or the cut not worked out yet: the placeholder's box over the band, or a point)
      var bb = pr.pending && pr.bounds ? pr.bounds : null, m = ti === 0 ? [(p[0] + p[1]) / 2, ct.center[1]] : [ct.center[0], (p[0] + p[1]) / 2];
      out.bounds = bb ? { umin: bb.umin, umax: bb.umax, vmin: bb.vmin, vmax: bb.vmax } : { umin: m[0], umax: m[0], vmin: m[1], vmax: m[1] };
      if (bb) { if (ti === 0) { out.bounds.umin = Math.max(bb.umin, p[0]); out.bounds.umax = Math.min(bb.umax, p[1]); } else { out.bounds.vmin = Math.max(bb.vmin, p[0]); out.bounds.vmax = Math.min(bb.vmax, p[1]); } }
      out.stats = { visibleLines: 0, hiddenLines: 0, visibleCircles: 0, hiddenCircles: 0 };
      o.proj = out; o.center = [(out.bounds.umin + out.bounds.umax) / 2, (out.bounds.vmin + out.bounds.vmax) / 2];
      return o;
    }
    var eps = Math.hypot(hi[0] - lo[0], hi[1] - lo[1]) * 1e-4 + 1e-9;
    function segDist(q, s) {
      var a = s[0], b = s[1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 > 0 ? ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(q[0] - a[0] - dx * t, q[1] - a[1] - dy * t);
    }
    function onOutline(q, e) { for (var i = 0; i < E.length; i++) if (segDist(q, E[i]) <= e) return true; return false; }
    // the pieces of line l that run along an outline edge (collinear within eps), as parameter ranges merged
    function alongOutline(l) {
      var A = [l[0], l[1]], dx = l[2] - l[0], dy = l[3] - l[1], L = Math.hypot(dx, dy), iv = [];
      if (!(L > 0)) return [];
      E.forEach(function (s) {
        var d0 = Math.abs((s[0][0] - A[0]) * dy - (s[0][1] - A[1]) * dx) / L, d1 = Math.abs((s[1][0] - A[0]) * dy - (s[1][1] - A[1]) * dx) / L;
        if (d0 > eps || d1 > eps) return;
        var t0 = ((s[0][0] - A[0]) * dx + (s[0][1] - A[1]) * dy) / (L * L), t1 = ((s[1][0] - A[0]) * dx + (s[1][1] - A[1]) * dy) / (L * L);
        var x0 = Math.max(0, Math.min(t0, t1)), x1 = Math.min(1, Math.max(t0, t1));
        if (x1 - x0 > 1e-9) iv.push([x0, x1]);
      });
      iv.sort(function (x, y) { return x[0] - y[0]; });
      var mg = [], g = eps / L;
      iv.forEach(function (r) { var last = mg[mg.length - 1]; if (last && r[0] <= last[1] + g) last[1] = Math.max(last[1], r[1]); else mg.push(r.slice()); });
      return mg.filter(function (r) { return (r[1] - r[0]) * L > eps * 2; }).map(function (r) {
        var q = [l[0] + dx * r[0], l[1] + dy * r[0], l[0] + dx * r[1], l[1] + dy * r[1]];
        for (var k = 4; k < l.length; k++) q.push(l[k]);
        return q;
      });
    }
    // a circle / arc lies on the outline when points along it do (the outline's chords sag a little from the curve)
    function curveOn(c, a0, a1) {
      var e = eps + c.r * 0.03, n = 12;
      for (var i = 0; i <= n; i++) { var t = (a0 + (a1 - a0) * (i + 0.5) / (n + 1)) * Math.PI / 180; if (!onOutline([c.c[0] + c.r * Math.cos(t), c.c[1] + c.r * Math.sin(t)], e)) return false; }
      return true;
    }
    var cp = clipProjectionRect(pr, R);
    (cp.lines.visible || []).forEach(function (l) { alongOutline(l).forEach(function (q) { out.lines.visible.push(q); out.all.push(q); }); });
    (cp.circles.visible || []).forEach(function (c) { if (curveOn(c, 0, 360)) { out.circles.visible.push(c); out.circlesAll.push(c); } });
    (cp.arcs && cp.arcs.visible || []).forEach(function (a) { if (curveOn(a, a.a0, a.a1)) { out.arcs.visible.push(a); out.arcsAll.push(a); } });
    (cp.ellipses && cp.ellipses.visible || []).forEach(function (el) {
      var ok = true, e = eps + Math.hypot(el.ax[0], el.ax[1]) * 0.03;
      for (var i = 0; i <= 12 && ok; i++) { var t = el.t0 + (el.t1 - el.t0) * (i + 0.5) / 13; ok = onOutline([el.c[0] + el.ax[0] * Math.cos(t) + el.ay[0] * Math.sin(t), el.c[1] + el.ax[1] * Math.cos(t) + el.ay[1] * Math.sin(t)], e); }
      if (ok) out.ellipses.visible.push(el);
    });
    out.bounds = { umin: lo[0], umax: hi[0], vmin: lo[1], vmax: hi[1] };
    out.stats = { visibleLines: out.lines.visible.length, hiddenLines: 0, visibleCircles: out.circles.visible.length, hiddenCircles: 0, visibleArcs: out.arcs.visible.length, hiddenArcs: 0 };
    o.proj = out;
    o.center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
    return o;
  }
  // (rfCX) a section drawn at its parent's scale (Use parent scale: section.parentScale, set when it is made) follows
  // the parent's scale when that changes (drawing-render.js compute, through resolveSectionScale)
  function followParentScale(doc) {
    (doc.views || []).forEach(function (v) {
      if (!(v.kind === 'section' && v.section && v.section.parentScale && v.parent != null)) return;
      var par = findV(doc, v.parent);
      if (!par) return;
      var want = par.scale ? par.scale.slice() : null;
      if (JSON.stringify(v.scale || null) !== JSON.stringify(want)) v.scale = want;
    });
  }
  // (rfCX) non-convex clip of solid fills: polygon P (any simple polygon) cut into convex pieces (ear clipping, then
  // neighbouring pieces merged while their union stays convex, Hertel-Mehlhorn); the region is clipped to each piece
  // and all the pieces' loops go in one region (they cover disjoint areas, so the even-odd fill is their union)
  function convexPieces(P) {
    if (!P || P.length < 3) return [];
    var Q = polyArea(P) < 0 ? P.slice().reverse() : P.slice();
    function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    function isConvex(R) { for (var i = 0; i < R.length; i++) if (cr(R[i], R[(i + 1) % R.length], R[(i + 2) % R.length]) < -1e-12) return false; return true; }
    if (isConvex(Q)) return [Q];
    var idx = Q.map(function (q, i) { return i; }), tris = [], guard = 0;
    while (idx.length > 3 && guard++ < 100000) {
      var cut = false;
      for (var i = 0; i < idx.length && !cut; i++) {
        var i0 = idx[(i + idx.length - 1) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length], a = Q[i0], b = Q[i1], c = Q[i2];
        if (cr(a, b, c) <= 1e-15) continue;
        var ear = true;
        for (var j = 0; j < idx.length && ear; j++) {
          var k = idx[j];
          if (k === i0 || k === i1 || k === i2) continue;
          var p = Q[k];
          if (cr(a, b, p) >= -1e-15 && cr(b, c, p) >= -1e-15 && cr(c, a, p) >= -1e-15) ear = false;
        }
        if (!ear) continue;
        tris.push([i0, i1, i2]); idx.splice(i, 1); cut = true;
      }
      if (!cut) break;   // (a degenerate outline: what is left goes as one piece)
    }
    if (idx.length >= 3) tris.push(idx.slice());
    var polys = tris, merged = true;
    while (merged) {
      merged = false;
      for (var x = 0; x < polys.length && !merged; x++) for (var y = x + 1; y < polys.length && !merged; y++) {
        var A = polys[x], Bp = polys[y];
        for (var ia = 0; ia < A.length && !merged; ia++) {
          var u0 = A[ia], u1 = A[(ia + 1) % A.length], jb = -1;
          for (var q = 0; q < Bp.length; q++) if (Bp[q] === u1 && Bp[(q + 1) % Bp.length] === u0) jb = q;
          if (jb < 0) continue;
          // A runs … u0 u1 …, B runs … u1 u0 …: A from u1 round to u0, then B's vertices strictly between u0 and u1
          var U = [], s = (ia + 1) % A.length;
          for (var r = 0; r < A.length; r++) U.push(A[(s + r) % A.length]);
          for (var r2 = 2; r2 < Bp.length; r2++) U.push(Bp[(jb + r2) % Bp.length]);
          if (isConvex(U.map(function (k2) { return Q[k2]; }))) { polys[x] = U; polys.splice(y, 1); merged = true; }
        }
      }
    }
    return polys.map(function (t) { return t.map(function (k2) { return Q[k2]; }); });
  }
  function clipLoopsPoly(loops, P) {
    var out = [];
    convexPieces(P).forEach(function (C) { clipLoopsConvex(loops, C).forEach(function (l) { out.push(l); }); });
    return out;
  }
  // (rfCX)
  D.addRemovedSection = addRemovedSection; D.isRemovedSection = isRemoved; _.removedContent = removedContent; _.followParentScale = followParentScale; D.convexPieces = convexPieces; _.clipLoopsPoly = clipLoopsPoly;
  _.detailHalf = detailHalf; _.detailProfileContent = detailProfileContent; _.detailOpts = detailOpts; _.detailProfile = detailProfile; _.detailOutline = detailOutline;
  _.resolveSectionScale = resolveSectionScale; _.sectionRel = sectionRel; _.partialContent = partialContent; _.isTrueView = isTrueView;
  D.DETAIL_STYLES = DETAIL_STYLES; D.setSectionOptions = setSectionOptions; D.trueLength = trueLength; D.setDimType = setDimType; D.resolveSectionScale = resolveSectionScale;
  _.typedSection = typedSection; _.pathContent = pathContent; _.auxCenter = auxCenter; _.cropContent = cropContent; _.viewKindMarks = viewKindMarks;
  _.auxSlide = auxSlide; _.carryAux = carryAux; _.viewPositions = positions;
  D.setSectionType = setSectionType; D.sectionSteps = sectionSteps; D.alignedLegs = alignedLegs; D.pathSectionOf = pathSectionOf;
  D.auxFrame = auxFrame; D.addAuxiliaryView = addAuxiliaryView; D.setCrop = setCrop; D.addBreak = addBreak; D.clearBreaks = clearBreaks;
  D.clipProjectionRect = clipProjectionRect; D.bandMap = bandMap; D.clipProjectionPoly = clipProjectionPoly;
  _.profilePts = profilePts; _.rayOut = rayOut; _.clipLayerToPoly = clipLayerToPoly;   // (rfCQ)

  D.flatCurves = flatCurves; D.bendKey = bendKey; D.bendKeyMatch = bendKeyMatch; D.flatData = flatData; D.flatProjection = flatProjection; D.bendNoteText = bendNoteText; D.bendTag = bendTag;
  D.setSectionExcluded = setSectionExcluded; D.sectionOf = sectionOf; D.hatchLines = hatchLines; D.hatchStyle = hatchStyle; D.hatchAssign = hatchAssign; D.HATCH_PATTERNS = Object.keys(HATCH_PATTERNS);
  D.hatchPattern = hatchPattern; D.patternLines = patternLines; D.snapHatch = snapHatch; D.clipProjection = clipProjection; D.reattachDim = reattachDim;
  _.excludedBodies = excludedBodies; _.sectionKey = sectionKey; _.capLoops = capLoops; _.HATCH_PATTERNS = HATCH_PATTERNS; _.clipSeg = clipSeg; _.primHitsRect = primHitsRect; _.segOutsideRect = segOutsideRect;
  // (rfAD; rfCX2: called directly, no wrappers) drawing-sheet.js viewContent works out a view with broken-out sections
  // with _.brokenOutContent, a typed section with _.pathContent, and runs _.auxCenter then _.contentExtras (jagged
  // detail, Area Hatch regions) on every view's content
  _.hasBrokenOut = hasBrokenOut; _.brokenOutContent = brokenOutContent; _.contentExtras = contentExtras; _.secKey = secKey;   // (rfCX2: putSection files a path cut under it)
  D.addBrokenOut = addBrokenOut; D.setBrokenOut = setBrokenOut; D.clearBrokenOut = clearBrokenOut; D.brokenOutPolygon = boPolygon; D.brokenOutOf = brokenOutOf;
  D.addAreaFill = addAreaFill; D.editAreaFill = editAreaFill; D.areaFills = areaFills; D.sketchRegionAt = sketchRegionAt; D.faceAt = faceAt;   // (lane DW)
  D.regionPieces = regionPieces; D.AREA_SCOPES = AREA_SCOPES; _.resolveFills = resolveFills; D.visibleFacePieces = visibleFacePieces; _.mergeSegs = mergeSegs;   // (lane DW2)
  D.setAreaHatch = setAreaHatch; D.hatchRegions = hatchRegions; D.hatchRegionAt = regionAt; D.AREA_PATTERNS = AREA_PATTERNS; D.interiorPoint = interiorPoint;
  _.jaggedPts = jaggedPts; _.primInPoly = primInPoly; _.inLoops = inLoops; _.clipLoopsConvex = clipLoopsConvex; _.circlePoly = circlePoly; _.convexHull = convexHull; _.regionOutsideRect = regionOutsideRect;
})(Drawing, Drawing._);

// ------------------------------------------------------------------ (rfAO) drawing sketch, Line Format, Relative View
// Sketch entities on the sheet or in a view (SolidWorks: the drawing's Sketch tab): Line, Centerline, Rectangle (four
// lines held by Coincident / Horizontal / Vertical), Circle, centre-point Arc, Spline, Point and Text, in paper units.
// Sheet entities live on doc.sheet.sketch (so they go with their sheet), a view's on view.sketch relative to the
// view's anchor (view.x, view.y), so they move with the view. The same lists hold the relations ({ t: 'rel', kind:
// 'coincident' | 'H' | 'V', refs | of }) and the driving Smart Dimensions ({ t: 'dim', of, kind: 'length' | 'dia' |
// 'rad', val, off }); solveList keeps them true after every edit (a few dozen relaxation passes: this is 2D on paper).
// Entities carry their Line Format ({ style: solid | hidden | center | phantom, weight: thin | normal | thick | mm,
// color: '#rrggbb' }); every output draws them on the SKETCH layer (SVG / PDF / DXF), styled through the sheet's own
// line styles (thin / visible / thick, hidden, center, phantom), with p.lw (mm) and p.rgb kept for writers that honour
// them. View edges take Line Format too: view.edgeFormats[key] = { hide } | { style, weight, color } (Hide / Show Edges).
(function (D, _) {
  'use strict';
  var V = Kernel.vec;
  var STYLES = ['solid', 'hidden', 'center', 'phantom'], WEIGHT_MM = { thin: 0.25, normal: 0.5, thick: 0.7 };
  var KINDS = { line: 1, circle: 1, arc: 1, spline: 1, point: 1, text: 1 };
  function paperK(doc) { return doc && doc.units === 'in' ? 1 / 25.4 : 1; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function shiftPts(e, dx, dy) {
    var o = clone(e);
    ['a', 'b', 'c', 'p'].forEach(function (k) { if (o[k]) o[k] = [o[k][0] + dx, o[k][1] + dy]; });
    if (o.pts) o.pts = o.pts.map(function (q) { return [q[0] + dx, q[1] + dy]; });
    return o;
  }
  function findV(doc, id) { for (var i = 0; i < (doc.views || []).length; i++) if (doc.views[i].id === id) return doc.views[i]; return null; }
  // owner(doc, viewId?) -> { list, view, off }: the list a new entity goes in (made on demand)
  function owner(doc, viewId) {
    if (viewId == null) { if (!doc.sheet.sketch) doc.sheet.sketch = []; return { list: doc.sheet.sketch, view: null, off: [0, 0] }; }
    var v = findV(doc, viewId);
    if (!v) throw new Error('No view ' + viewId);
    if (!v.sketch) v.sketch = [];
    return { list: v.sketch, view: v, off: [v.x, v.y] };
  }
  function owners(doc) {
    var out = [];
    if (doc.sheet && doc.sheet.sketch && doc.sheet.sketch.length) out.push({ list: doc.sheet.sketch, view: null, off: [0, 0] });
    (doc.views || []).forEach(function (v) { if (v.sketch && v.sketch.length) out.push({ list: v.sketch, view: v, off: [v.x, v.y] }); });
    return out;
  }
  function locate(doc, id) {
    var os = owners(doc);
    for (var i = 0; i < os.length; i++) for (var j = 0; j < os[i].list.length; j++) if (os[i].list[j].id === id) return { ent: os[i].list[j], owner: os[i] };
    return null;
  }
  function nextId(doc) { if (!(doc.nextSketch > 0)) doc.nextSketch = 1; return doc.nextSketch++; }
  function fmtOf(e) { return { style: e.style || (e.cons ? 'center' : 'solid'), weight: e.weight || (e.cons ? 'thin' : 'normal'), color: e.color || null }; }
  // lineStyle({ style, weight }) -> { style (the sheet line style a primitive is drawn with), lw (its weight, mm) }
  function lineStyle(f) {
    var st = f.style || 'solid', w = f.weight || 'normal', lw = typeof w === 'number' ? w : WEIGHT_MM[w] || +w || 0.5;
    var s = st === 'hidden' ? 'hidden' : st === 'center' ? 'center' : st === 'phantom' ? (lw >= 0.6 ? 'chain' : 'tanfont') : lw <= 0.3 ? 'thin' : lw >= 0.6 ? 'thick' : 'visible';
    return { style: s, lw: lw };
  }
  function checkFmt(f) {
    if (f.style != null && STYLES.indexOf(f.style) < 0) throw new Error('Line style must be one of ' + STYLES.join(', '));
    if (f.weight != null && !WEIGHT_MM[f.weight] && !(+f.weight > 0)) throw new Error('Line thickness must be thin, normal, thick or a width in mm');
    if (f.color != null && f.color !== '' && !/^#[0-9a-f]{6}$/i.test(f.color)) throw new Error('Line colour must be #rrggbb');
  }

  // ---- points of an entity (its own list's coordinates); ends: line a / b, circle / arc c, arc start / end, point / text p
  function arcPt(e, ang) { var t = ang * Math.PI / 180; return [e.c[0] + e.r * Math.cos(t), e.c[1] + e.r * Math.sin(t)]; }
  function getPt(e, end) {
    if (e.t === 'line') return end === 'b' ? e.b : e.a;
    if (e.t === 'arc') return end === 'start' ? arcPt(e, e.a0) : end === 'end' ? arcPt(e, e.a1) : e.c;
    if (e.t === 'circle') return e.c;
    if (e.t === 'spline') return end === 'end' ? e.pts[e.pts.length - 1] : e.pts[0];
    return e.p;
  }
  function setPt(e, end, q) {
    q = [q[0], q[1]];
    if (e.t === 'line') { if (end === 'b') e.b = q; else e.a = q; }
    else if (e.t === 'arc' && (end === 'start' || end === 'end')) {
      var ang = Math.atan2(q[1] - e.c[1], q[0] - e.c[0]) * 180 / Math.PI;
      if (end === 'start') e.a0 = ang; else e.a1 = ang;
      while (e.a1 <= e.a0) e.a1 += 360;
      while (e.a1 - e.a0 > 360) e.a1 -= 360;
    } else if (e.t === 'arc' || e.t === 'circle') e.c = q;
    else if (e.t === 'spline') { if (end === 'end') e.pts[e.pts.length - 1] = q; else e.pts[0] = q; }
    else e.p = q;
  }
  function endsOf(e) {
    return e.t === 'line' ? ['a', 'b'] : e.t === 'arc' ? ['c', 'start', 'end'] : e.t === 'circle' ? ['c'] : e.t === 'spline' ? ['start', 'end'] : e.t === 'point' || e.t === 'text' ? ['p'] : [];
  }
  // solveList(list, scale, fixed): the relations and driving dimensions of one list made true; fixed { 'id:end': 1 }
  // ('id:*' the whole entity, 'id:r' its radius) stay put (what the mouse holds). Coincident points move together,
  // H / V level a line, a length moves the free end, a diameter / radius sets the circle.
  function solveList(list, scale, fixed) {
    fixed = fixed || {};
    var by = {};
    list.forEach(function (e) { by[e.id] = e; });
    function fx(id, end) { return !!(fixed[id + ':' + end] || fixed[id + ':*']); }
    for (var it = 0; it < 80; it++) {
      var err = 0;
      list.forEach(function (r) {
        if (r.t === 'rel' && r.kind === 'coincident') {
          var A = r.refs[0], B = r.refs[1], ea = by[A.id], eb = by[B.id];
          if (!ea || !eb) return;
          var pa = getPt(ea, A.end), pb = getPt(eb, B.end), d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
          if (d < 1e-12) return;
          var fa = fx(A.id, A.end) || ea.t === 'arc' && A.end !== 'c', fb = fx(B.id, B.end) || eb.t === 'arc' && B.end !== 'c';
          if (fa && fb) {
            // an arc's end is where its angle puts it: it turns to meet a point that is held
            if (ea.t === 'arc' && A.end !== 'c' && !fx(A.id, A.end)) setPt(ea, A.end, pb);
            else if (eb.t === 'arc' && B.end !== 'c' && !fx(B.id, B.end)) setPt(eb, B.end, pa);
            return;
          }
          var m = fa ? pa : fb ? pb : [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
          if (!fa) setPt(ea, A.end, m);
          if (!fb) setPt(eb, B.end, m);
          err = Math.max(err, d);
        } else if (r.t === 'rel' && (r.kind === 'H' || r.kind === 'V')) {
          var e = by[r.of];
          if (!e || e.t !== 'line') return;
          var ax = r.kind === 'H' ? 1 : 0, dd = Math.abs(e.a[ax] - e.b[ax]);
          if (dd < 1e-12) return;
          var fA = fx(e.id, 'a'), fB = fx(e.id, 'b');
          if (fA && fB) return;
          var val = fA ? e.a[ax] : fB ? e.b[ax] : (e.a[ax] + e.b[ax]) / 2;
          e.a = e.a.slice(); e.b = e.b.slice(); e.a[ax] = val; e.b[ax] = val;
          err = Math.max(err, dd);
        } else if (r.t === 'dim' && r.val > 0) {
          var g = by[r.of], L = r.val * scale;
          if (!g) return;
          if (r.kind === 'length' && g.t === 'line') {
            var dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1], cur = Math.hypot(dx, dy);
            if (cur < 1e-12 || Math.abs(cur - L) < 1e-12) return;
            var ux = dx / cur, uy = dy / cur;
            if (!fx(g.id, 'b')) g.b = [g.a[0] + ux * L, g.a[1] + uy * L];
            else if (!fx(g.id, 'a')) g.a = [g.b[0] - ux * L, g.b[1] - uy * L];
            else return;
            err = Math.max(err, Math.abs(cur - L));
          } else if ((g.t === 'circle' || g.t === 'arc') && !fx(g.id, 'r')) {
            var R = r.kind === 'dia' ? L / 2 : L;
            if (Math.abs(g.r - R) > 1e-12) { err = Math.max(err, Math.abs(g.r - R)); g.r = R; }
          }
        }
      });
      if (err < 1e-10) break;
    }
  }
  function ownerScale(doc, o) { return o.view ? _.viewScale(doc, o.view) : 1; }
  function solveSketch(doc, fixed) { owners(doc).forEach(function (o) { solveList(o.list, ownerScale(doc, o), fixed); }); }

  // ---- API (sheet coordinates in and out)
  // addSketchEntity(doc, { t, a, b | c, r, a0, a1 | pts | p, text, h, cons, style, weight, color, rel }, viewId?) -> entity
  function addSketchEntity(doc, spec, viewId) {
    if (!spec || !KINDS[spec.t]) throw new Error('Sketch entity type must be one of ' + Object.keys(KINDS).join(', '));
    checkFmt(spec);
    var o = owner(doc, viewId), e = shiftPts(spec, -o.off[0], -o.off[1]);
    delete e.view; delete e.rel;
    if (e.t === 'line' && (!e.a || !e.b)) throw new Error('A line needs a and b');
    if ((e.t === 'circle' || e.t === 'arc') && !(+e.r > 0)) throw new Error('A circle or arc needs a radius above 0');
    if (e.t === 'spline' && !(e.pts && e.pts.length >= 2)) throw new Error('A spline needs at least two points');
    if ((e.t === 'point' || e.t === 'text') && !e.p) throw new Error('A point or text needs p');
    if (e.t === 'text') { e.text = String(e.text == null ? '' : e.text); if (!(+e.h > 0)) e.h = 3.5 * paperK(doc); }
    if (e.t === 'arc') { e.a0 = +e.a0 || 0; e.a1 = +e.a1 || 0; while (e.a1 <= e.a0) e.a1 += 360; }
    e.id = nextId(doc);
    o.list.push(e);
    if (e.t === 'line' && (spec.rel === 'H' || spec.rel === 'V')) addSketchRelation(doc, spec.rel, e.id);
    return sketchEntity(doc, e.id);
  }
  // addSketchRect(doc, a, b, viewId?, fmt?) -> [line ids]: four lines, corners Coincident, two Horizontal, two Vertical
  function addSketchRect(doc, a, b, viewId, fmt) {
    var c = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]], ids = [];
    for (var i = 0; i < 4; i++) ids.push(addSketchEntity(doc, Object.assign({ t: 'line', a: c[i], b: c[(i + 1) % 4] }, fmt || {}), viewId).id);
    for (var j = 0; j < 4; j++) addSketchRelation(doc, 'coincident', [{ id: ids[j], end: 'b' }, { id: ids[(j + 1) % 4], end: 'a' }]);
    addSketchRelation(doc, 'H', ids[0]); addSketchRelation(doc, 'V', ids[1]); addSketchRelation(doc, 'H', ids[2]); addSketchRelation(doc, 'V', ids[3]);
    return ids;
  }
  // sketchEntity(doc, id) -> a copy in sheet coordinates with .view (the owning view id or null)
  function sketchEntity(doc, id) {
    var f = locate(doc, id);
    if (!f) return null;
    var e = shiftPts(f.ent, f.owner.off[0], f.owner.off[1]);
    e.view = f.owner.view ? f.owner.view.id : null;
    return e;
  }
  // sketchEntities(doc, viewId?) -> every entity / relation / dimension of the active sheet (sheet coordinates);
  // viewId null: the sheet's own, a number: that view's
  function sketchEntities(doc, viewId) {
    var out = [];
    owners(doc).forEach(function (o) {
      if (viewId !== undefined && (o.view ? o.view.id : null) !== viewId) return;
      o.list.forEach(function (e) { var c = shiftPts(e, o.off[0], o.off[1]); c.view = o.view ? o.view.id : null; out.push(c); });
    });
    return out;
  }
  // editSketchEntity(doc, id, patch (sheet coordinates), fixed?) -> entity: points / radius / text / format changed,
  // then the relations; the patched points stay where they are put
  function editSketchEntity(doc, id, patch, fixed) {
    var f = locate(doc, id);
    if (!f) throw new Error('No sketch entity ' + id);
    checkFmt(patch);
    var e = f.ent, p = shiftPts(patch, -f.owner.off[0], -f.owner.off[1]), fix = Object.assign({}, fixed || {});
    Object.keys(p).forEach(function (k) {
      if (k === 'id' || k === 't' || k === 'view') return;
      if (p[k] === null) delete e[k]; else e[k] = p[k];
      if (k === 'a' || k === 'b' || k === 'p' || k === 'c' || k === 'r') fix[id + ':' + k] = 1;
      if (k === 'pts') fix[id + ':*'] = 1;
    });
    if (e.t === 'arc') while (e.a1 <= e.a0) e.a1 += 360;
    // a dimension that drives a changed size takes the new value
    f.owner.list.forEach(function (d) {
      if (d.t !== 'dim' || d.of !== id) return;
      if (patch.r != null && d.kind !== 'length') d.val = (d.kind === 'dia' ? 2 : 1) * e.r / ownerScale(doc, f.owner);
      if ((patch.a || patch.b) && d.kind === 'length') d.val = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) / ownerScale(doc, f.owner);
    });
    solveList(f.owner.list, ownerScale(doc, f.owner), fix);
    return sketchEntity(doc, id);
  }
  // moveSketchEntity(doc, id, dx, dy, end?) -> entity: the whole entity (or one end of it, or a dimension's text) moved;
  // what is Coincident with it follows, H / V hold
  function moveSketchEntity(doc, id, dx, dy, end) {
    var f = locate(doc, id);
    if (!f) throw new Error('No sketch entity ' + id);
    var e = f.ent, fix = {};
    if (e.t === 'dim') { e.off = [(e.off || [0, 0])[0] + dx, (e.off || [0, 0])[1] + dy]; return sketchEntity(doc, id); }
    if (e.t === 'rel') return sketchEntity(doc, id);
    if (end) { var q = getPt(e, end); setPt(e, end, [q[0] + dx, q[1] + dy]); fix[id + ':' + end] = 1; }
    else {
      var m = shiftPts(e, dx, dy);
      ['a', 'b', 'c', 'p', 'pts'].forEach(function (k) { if (m[k]) e[k] = m[k]; });
      fix[id + ':*'] = 1;
    }
    solveList(f.owner.list, ownerScale(doc, f.owner), fix);
    return sketchEntity(doc, id);
  }
  // deleteSketchEntity(doc, id): the entity (or relation / dimension), and the relations and dimensions that name it
  function deleteSketchEntity(doc, id) {
    var f = locate(doc, id);
    if (!f) throw new Error('No sketch entity ' + id);
    var l = f.owner.list, gone = {}; gone[id] = 1;
    for (var i = l.length - 1; i >= 0; i--) {
      var e = l[i];
      if (gone[e.id] || e.t === 'dim' && gone[e.of] || e.t === 'rel' && (gone[e.of] || (e.refs || []).some(function (r) { return gone[r.id]; }))) l.splice(i, 1);
    }
  }
  // (rfCQ) sketchLoop(doc, ids) -> { view, ids, circle: { c, r } | null, pts: [[x, y] …] } (sheet coordinates, closed,
  // counter-clockwise): the closed profile the selected sketch entities make, as SolidWorks' Detail View takes a
  // sketched circle, polygon or spline for its boundary. A circle is one on its own; otherwise lines, arcs and splines
  // are followed end to end from the first one (through the selected ones, or through any of its view's entities
  // when one alone is selected) until the chain closes. Throws when they make no closed profile in one view.
  function sketchLoop(doc, ids) {
    ids = [].concat(ids == null ? [] : ids);
    if (!ids.length) throw new Error('Select a closed sketch profile (a circle, or lines, arcs and splines end to end) first');
    var first = locate(doc, ids[0]);
    if (!first) throw new Error('No sketch entity ' + ids[0]);
    var o = first.owner, curve = { line: 1, arc: 1, spline: 1, circle: 1 };
    ids.forEach(function (id) { var f = locate(doc, id); if (!f || f.owner.list !== o.list) throw new Error('A detail profile is sketched in one view'); });
    var vid = o.view ? o.view.id : null, sh = function (q) { return [q[0] + o.off[0], q[1] + o.off[1]]; };
    if (first.ent.t === 'circle') {
      var C = first.ent, P0 = [];
      for (var i = 0; i < 96; i++) { var t = i / 96 * 2 * Math.PI; P0.push(sh([C.c[0] + C.r * Math.cos(t), C.c[1] + C.r * Math.sin(t)])); }
      return { view: vid, ids: [C.id], circle: { c: sh(C.c), r: C.r }, pts: P0 };
    }
    function along(e) {
      if (e.t === 'line') return [e.a, e.b];
      if (e.t === 'arc') { var n = Math.max(8, Math.ceil((e.a1 - e.a0) / 5)), q = []; for (var j = 0; j <= n; j++) q.push(arcPt(e, e.a0 + (e.a1 - e.a0) * j / n)); return q; }
      if (e.t === 'spline') return splinePts(e.pts);
      return null;
    }
    var tol = 0.01 * paperK(doc), pool = (ids.length > 1 ? ids.map(function (id) { return locate(doc, id).ent; }) : o.list).filter(function (e) { return curve[e.t] && e.t !== 'circle'; });
    if (!curve[first.ent.t]) throw new Error('A detail profile is made of lines, arcs, splines or one circle');
    function near(p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol; }
    var chain = along(first.ent).slice(), used = {}, loopIds = [first.ent.id];
    used[first.ent.id] = 1;
    while (!(chain.length > 2 && near(chain[0], chain[chain.length - 1]))) {
      var end = chain[chain.length - 1], next = null;
      for (var k = 0; k < pool.length && !next; k++) {
        var e = pool[k], q = used[e.id] ? null : along(e);
        if (!q) continue;
        if (near(q[0], end)) next = q; else if (near(q[q.length - 1], end)) next = q.slice().reverse();
        if (next) { used[e.id] = 1; loopIds.push(e.id); }
      }
      if (!next) throw new Error('The selected sketch is not a closed profile: its ends do not meet');
      chain = chain.concat(next.slice(1));
    }
    chain.pop();
    var P = chain.map(sh), a = 0;
    for (var m = 0, l = P.length - 1; m < P.length; l = m++) a += (P[l][0] - P[m][0]) * (P[l][1] + P[m][1]);
    if (a < 0) P.reverse();
    return { view: vid, ids: loopIds, circle: null, pts: P };
  }
  // addSketchRelation(doc, 'H' | 'V', lineId) | (doc, 'coincident', [{ id, end }, { id, end }]) -> relation
  function addSketchRelation(doc, kind, refs) {
    var r;
    if (kind === 'H' || kind === 'V') {
      var f = locate(doc, refs);
      if (!f || f.ent.t !== 'line') throw new Error((kind === 'H' ? 'Horizontal' : 'Vertical') + ' needs a sketch line');
      for (var i = f.owner.list.length - 1; i >= 0; i--) { var x = f.owner.list[i]; if (x.t === 'rel' && (x.kind === 'H' || x.kind === 'V') && x.of === refs) f.owner.list.splice(i, 1); }
      r = { id: nextId(doc), t: 'rel', kind: kind, of: refs };
      f.owner.list.push(r);
      solveList(f.owner.list, ownerScale(doc, f.owner), {});
      return clone(r);
    }
    if (kind === 'coincident') {
      if (!refs || refs.length !== 2) throw new Error('Coincident needs two points');
      var A = locate(doc, refs[0].id), B = locate(doc, refs[1].id);
      if (!A || !B) throw new Error('Coincident: no such sketch entity');
      if (A.owner.list !== B.owner.list) throw new Error('Coincident: both points must be in the same sketch (the sheet or one view)');
      if (endsOf(A.ent).indexOf(refs[0].end) < 0 || endsOf(B.ent).indexOf(refs[1].end) < 0) throw new Error('Coincident: no such point on the entity');
      r = { id: nextId(doc), t: 'rel', kind: 'coincident', refs: [{ id: refs[0].id, end: refs[0].end }, { id: refs[1].id, end: refs[1].end }] };
      A.owner.list.push(r);
      var fx = {}; fx[refs[0].id + ':' + refs[0].end] = 1;
      solveList(A.owner.list, ownerScale(doc, A.owner), fx);
      return clone(r);
    }
    throw new Error('Relation must be H, V or coincident');
  }
  // sketchRelations(doc, id) -> the relations naming entity id
  function relationsOf(doc, id) {
    var f = locate(doc, id);
    if (!f) return [];
    return f.owner.list.filter(function (r) { return r.t === 'rel' && (r.of === id || (r.refs || []).some(function (q) { return q.id === id; })); }).map(clone);
  }
  // addSketchDim(doc, entityId, { off?, val? }) -> dimension: the length of a line, a circle's diameter, an arc's
  // radius; driving (setSketchDim changes the entity). In a view the value reads in model units (paper ÷ view scale).
  function addSketchDim(doc, id, opts) {
    opts = opts || {};
    var f = locate(doc, id);
    if (!f) throw new Error('No sketch entity ' + id);
    var e = f.ent, kind = e.t === 'line' ? 'length' : e.t === 'circle' ? 'dia' : e.t === 'arc' ? 'rad' : null;
    if (!kind) throw new Error('Smart Dimension on a sketch takes a line, a circle or an arc');
    var s = ownerScale(doc, f.owner), k = paperK(doc), cur = kind === 'length' ? Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) : kind === 'dia' ? 2 * e.r : e.r;
    var off = opts.off;
    if (!off) {
      if (kind === 'length') {
        var L = cur || 1, nx = -(e.b[1] - e.a[1]) / L, ny = (e.b[0] - e.a[0]) / L;
        if (ny < -1e-9 || (Math.abs(ny) < 1e-9 && nx > 0)) { nx = -nx; ny = -ny; }
        off = [nx * 10 * k, ny * 10 * k];
      } else off = [e.r * 0.8 + 8 * k, e.r * 0.8 + 8 * k];
    }
    var d = { id: nextId(doc), t: 'dim', of: id, kind: kind, val: opts.val > 0 ? +opts.val : cur / s, off: [off[0], off[1]] };
    f.owner.list.push(d);
    var fx = {}; fx[id + (kind === 'length' ? ':a' : ':c')] = 1;
    solveList(f.owner.list, s, fx);
    return clone(d);
  }
  function setSketchDim(doc, dimId, val) {
    var f = locate(doc, dimId);
    if (!f || f.ent.t !== 'dim') throw new Error('No sketch dimension ' + dimId);
    if (!(+val > 0)) throw new Error('A dimension must be above 0');
    f.ent.val = +val;
    var fx = {};
    fx[f.ent.of + (f.ent.kind === 'length' ? ':a' : ':c')] = 1;
    solveList(f.owner.list, ownerScale(doc, f.owner), fx);
    return clone(f.ent);
  }
  // setLineFormat(doc, ids, { style, weight, color }) -> how many took it: Line Format for sketch entities (null clears)
  function setLineFormat(doc, ids, fmt) {
    checkFmt(fmt);
    var n = 0;
    (Array.isArray(ids) ? ids : [ids]).forEach(function (id) {
      var f = locate(doc, id);
      if (!f || f.ent.t === 'rel' || f.ent.t === 'dim') return;
      ['style', 'weight', 'color'].forEach(function (q) { if (fmt[q] === null || fmt[q] === '') delete f.ent[q]; else if (fmt[q] !== undefined) f.ent[q] = fmt[q]; });
      n++;
    });
    return n;
  }

  // ---- what the sheet draws, in sheet coordinates
  function splinePts(pts) {
    if (pts.length < 3) return pts.slice();
    var out = [pts[0]], n = 12;
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (var j = 1; j <= n; j++) {
        var t = j / n, t2 = t * t, t3 = t2 * t, q = [];
        for (var c = 0; c < 2; c++) q.push(0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3));
        out.push(q);
      }
    }
    return out;
  }
  // dimGeom(doc, d, e (sheet coordinates), scale) -> { text, tp (text point), lines, arrows: [[tip, dir]], box }
  function dimGeom(doc, d, e) {
    var k = paperK(doc), G = D.dimGeometry ? D.dimGeometry(doc) : { text: 3.5, arrow: 3, arrowW: 1, gap: 1.5, ext: 3 };
    var th = G.text * k, gap = G.gap * k, ext = G.ext * k, prev = _.DIMSTYLE, txt, CAP = _.CAP_EM || 0.72;
    _.DIMSTYLE = D.dimStyle ? D.dimStyle(doc) : prev;
    try { txt = D.fmtDim ? D.fmtDim(d.val, doc.units === 'in' ? 'in' : 'mm') : String(Math.round(d.val * 1000) / 1000); } finally { _.DIMSTYLE = prev; }
    var lines = [], arrows = [], tp;
    if (d.kind === 'length' && e.t === 'line') {
      var dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
      var mid = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2], o = d.off[0] * nx + d.off[1] * ny, sg = o < 0 ? -1 : 1;
      var A = [e.a[0] + nx * o, e.a[1] + ny * o], B = [e.b[0] + nx * o, e.b[1] + ny * o];
      lines.push([[e.a[0] + nx * gap * sg, e.a[1] + ny * gap * sg], [A[0] + nx * ext * sg, A[1] + ny * ext * sg]]);
      lines.push([[e.b[0] + nx * gap * sg, e.b[1] + ny * gap * sg], [B[0] + nx * ext * sg, B[1] + ny * ext * sg]]);
      lines.push([A, B]);
      arrows.push([A, [-ux, -uy]], [B, [ux, uy]]);
      var along = d.off[0] * ux + d.off[1] * uy;
      tp = [mid[0] + nx * o + ux * along, mid[1] + ny * o + uy * along];
    } else {
      var c = e.c, r = e.r, dl = Math.hypot(d.off[0], d.off[1]) || 1, wx = d.off[0] / dl, wy = d.off[1] / dl;
      var tip = [c[0] + wx * r, c[1] + wy * r];
      tp = [c[0] + d.off[0], c[1] + d.off[1]];
      lines.push([tip, tp]);
      arrows.push([tip, [-wx, -wy]]);
      if (d.kind === 'dia') { var far = [c[0] - wx * r, c[1] - wy * r]; lines.push([far, tip]); arrows.push([far, [wx, wy]]); }
      txt = (d.kind === 'dia' ? 'Ø' : 'R') + txt;
    }
    var hcap = th * CAP, tw = String(txt).length * hcap * 0.78;
    var box = { x0: tp[0] - tw / 2 - gap, x1: tp[0] + tw / 2 + gap, y0: tp[1], y1: tp[1] + hcap + 1.5 * gap };
    return { text: txt, tp: tp, th: th, lines: lines, arrows: arrows, box: box, arrowLen: G.arrow * k, arrowW: G.arrowW * k, gap: gap };
  }
  // sketchItems(doc) -> [{ id, t, view, e (sheet coordinates), of?, dim? }]: what the sheet draws and the app picks
  function sketchItems(doc) {
    var out = [];
    owners(doc).forEach(function (o) {
      var byId = {};
      o.list.forEach(function (e) { byId[e.id] = e; });
      o.list.forEach(function (e) {
        if (e.t === 'rel') return;
        var c = shiftPts(e, o.off[0], o.off[1]), it = { id: e.id, t: e.t, view: o.view ? o.view.id : null, e: c };
        if (e.t === 'dim') { var g = byId[e.of]; if (!g) return; it.of = shiftPts(g, o.off[0], o.off[1]); it.dim = dimGeom(doc, e, it.of); }
        out.push(it);
      });
    });
    return out;
  }
  // sketchPrims(doc, sheet): the sketch on the sheet's SKETCH layer (after the views and annotations); sheet.sketch
  // lists [{ id, t, view, from, to }] (the primitives each entity drew)
  function sketchPrims(doc, sheet) {
    if (!sheet || !sheet.prims || !doc.sheet) return sheet;
    var k = paperK(doc), CAP = _.CAP_EM || 0.72, items = sketchItems(doc);
    sheet.sketch = [];
    items.forEach(function (it) {
      var e = it.e, ls = lineStyle(fmtOf(e)), n0 = sheet.prims.length;
      function P(q) { q.layer = 'SKETCH'; if (!q.style) { q.style = ls.style; q.lw = ls.lw; if (e.color) q.rgb = e.color; } q.sk = it.id; if (it.view != null) q.view = it.view; sheet.prims.push(q); }
      if (e.t === 'line') P({ k: 'line', a: e.a, b: e.b });
      else if (e.t === 'circle') P({ k: 'circle', c: e.c, r: e.r });
      else if (e.t === 'arc') P({ k: 'arc', c: e.c, r: e.r, a0: e.a0, a1: e.a1 });
      else if (e.t === 'spline') { var sp = splinePts(e.pts), cid = 'sk' + it.id; for (var i = 1; i < sp.length; i++) P({ k: 'line', a: sp[i - 1], b: sp[i], chain: cid }); }
      else if (e.t === 'point') { var pr = 0.6 * k, pts = []; for (var j = 0; j < 12; j++) pts.push([e.p[0] + pr * Math.cos(j * Math.PI / 6), e.p[1] + pr * Math.sin(j * Math.PI / 6)]); P({ k: 'fill', pts: pts, style: 'thin' }); }
      else if (e.t === 'text') String(e.text).split(/\r?\n/).forEach(function (s, li) { if (s) P({ k: 'text', p: [e.p[0], e.p[1] - li * e.h * 1.5], h: e.h * CAP, text: s, anchor: 'start', rot: e.rot || 0, style: 'thin' }); });
      else if (e.t === 'dim') {
        var g = it.dim;
        g.lines.forEach(function (l) { P({ k: 'line', a: l[0], b: l[1], style: 'thin' }); });
        g.arrows.forEach(function (a) {
          var t = a[0], dx = a[1][0], dy = a[1][1], bx = t[0] - dx * g.arrowLen, by = t[1] - dy * g.arrowLen, w = g.arrowW / 2;
          P({ k: 'fill', pts: [t, [bx - dy * w, by + dx * w], [bx + dy * w, by - dx * w]], style: 'thin' });
        });
        P({ k: 'text', p: [g.tp[0], g.tp[1] + g.gap], h: g.th * CAP, text: g.text, anchor: 'middle', rot: 0, style: 'thin' });
      }
      if (sheet.prims.length > n0) sheet.sketch.push({ id: it.id, t: it.t, view: it.view, from: n0, to: sheet.prims.length });
    });
    if (!sheet.sketch.length) delete sheet.sketch;
    return sheet;
  }

  // ---- Line Format and Hide / Show Edges on view edges. An edge's key is its geometry in the view's own (model)
  // frame, so it holds across rebuilds that leave that edge where it is.
  function r4(x) { return Math.round(x * 1e4) / 1e4; }
  // edgeKey(entity) -> 'L…' | 'C…' | 'A…' for an edge the drawing picks (a line { la, lb }, a circle { mc }, an arc { ma })
  function edgeKey(ent) {
    if (ent.la && ent.lb) {
      var p = [r4(ent.la[0]), r4(ent.la[1])], q = [r4(ent.lb[0]), r4(ent.lb[1])];
      if (p[0] > q[0] || p[0] === q[0] && p[1] > q[1]) { var t = p; p = q; q = t; }
      return 'L' + p.join(',') + ',' + q.join(',');
    }
    if (ent.mc) return 'C' + [r4(ent.mc.c[0]), r4(ent.mc.c[1]), r4(ent.mc.r)].join(',');
    if (ent.ma) return 'A' + [r4(ent.ma.c[0]), r4(ent.ma.c[1]), r4(ent.ma.r)].join(',');
    throw new Error('Edge keys take a line, a circle or an arc of a view');
  }
  function parseKey(key) {
    var kd = String(key).charAt(0), n = String(key).slice(1).split(',').map(Number);
    if (!/^[LCA]$/.test(kd) || n.some(function (x) { return !isFinite(x); }) || n.length !== (kd === 'L' ? 4 : 3)) throw new Error('Bad edge key ' + key);
    return { kind: kd, n: n };
  }
  // setEdgeFormat(doc, viewId, key, { hide, style, weight, color } | null) -> the view's edge formats (null clears the edge)
  function setEdgeFormat(doc, viewId, key, fmt) {
    var v = findV(doc, viewId);
    if (!v) throw new Error('No view ' + viewId);
    parseKey(key);
    if (fmt) checkFmt(fmt);
    if (!v.edgeFormats) v.edgeFormats = {};
    if (!fmt) delete v.edgeFormats[key];
    else {
      var cur = Object.assign({}, v.edgeFormats[key] || {});
      Object.keys(fmt).forEach(function (q) { if (fmt[q] == null || fmt[q] === '' || fmt[q] === false) delete cur[q]; else cur[q] = fmt[q]; });
      if (Object.keys(cur).length) v.edgeFormats[key] = cur; else delete v.edgeFormats[key];
    }
    if (!Object.keys(v.edgeFormats).length) delete v.edgeFormats;
    return v.edgeFormats ? clone(v.edgeFormats) : {};
  }
  function hideEdge(doc, viewId, key, hide) { return setEdgeFormat(doc, viewId, key, { hide: hide !== false }); }
  // showEdges(doc, viewId): every hidden edge of the view shows again (other Line Format overrides stay)
  function showEdges(doc, viewId) {
    var v = findV(doc, viewId);
    if (!v) throw new Error('No view ' + viewId);
    Object.keys(v.edgeFormats || {}).forEach(function (q) { setEdgeFormat(doc, viewId, q, { hide: null }); });
  }
  function hiddenEdges(doc, viewId) { var v = findV(doc, viewId), out = []; Object.keys(v && v.edgeFormats || {}).forEach(function (q) { if (v.edgeFormats[q].hide) out.push(q); }); return out; }
  function onSeg(p, a, b, tol) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
    if (t < -1e-6 || t > 1 + 1e-6) return false;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) <= tol;
  }
  // (a hidden edge leaves the sheet; a styled one is drawn in its Line Format; sheet.hiddenEdges lists what was hidden
  // so Hide / Show Edges can show it greyed)
  function applyEdgeFormats(doc, sheet) {
    if (!sheet || !sheet.prims || !sheet.views) return;
    sheet.views.forEach(function (w) {
      var F = w.view.edgeFormats;
      if (!F || !w.toSheet || w.pending) return;
      var drop = {}, tol = 2e-4 * Math.max(1, w.scale || 1) + 1e-6;
      Object.keys(F).forEach(function (key) {
        var f = F[key], K, match;
        try { K = parseKey(key); } catch (err) { return; }
        if (K.kind === 'L') { var a = w.toSheet([K.n[0], K.n[1]]), b = w.toSheet([K.n[2], K.n[3]]); match = function (p) { return p.k === 'line' && onSeg(p.a, a, b, tol) && onSeg(p.b, a, b, tol); }; }
        else { var c = w.toSheet([K.n[0], K.n[1]]), r = K.n[2] * w.scale, tk = K.kind === 'C' ? 'circle' : 'arc'; match = function (p) { return p.k === tk && Math.hypot(p.c[0] - c[0], p.c[1] - c[1]) <= tol + 1e-4 * r && Math.abs(p.r - r) <= tol + 1e-4 * r; }; }
        sheet.prims.forEach(function (p, i) {
          if (p.layer !== w.layer || p.style === 'hatch' || !match(p)) return;
          if (f.hide) { drop[i] = 1; (sheet.hiddenEdges || (sheet.hiddenEdges = [])).push({ view: w.view.id, key: key, prim: p }); return; }
          if (f.style || f.weight) { var ls = lineStyle({ style: f.style || (p.style === 'hidden' ? 'hidden' : 'solid'), weight: f.weight || 'normal' }); p.style = ls.style; p.lw = ls.lw; delete p.chain; }
          if (f.color) p.rgb = f.color;
          p.edgeKey = key;
        });
      });
      if (Object.keys(drop).length) sheet.prims = sheet.prims.filter(function (p, i) { return !drop[i]; });
    });
  }
  _.applyEdgeFormats = applyEdgeFormats;   // (rfCX2: viewKindMarks calls it first and _.sketchPrims last, directly)

  // ---- Relative View: the first face looks at the viewer (Front), the second face points to the sheet's Right (or
  // Left / Top / Bottom), as SolidWorks' Relative View PropertyManager
  var SECOND = { Right: 1, Left: 1, Top: 1, Bottom: 1 };
  function relativeFrame(n1, n2, second) {
    second = second || 'Right';
    if (!SECOND[second]) throw new Error('Relative View: the second face is Right, Left, Top or Bottom');
    var e = V.norm(n1), t = V.sub(n2, V.scale(e, V.dot(n2, e)));
    if (V.len(t) < 1e-6) throw new Error('Relative View: the two faces are parallel; pick a second face at an angle to the first');
    t = V.norm(t);
    var u, v;
    if (second === 'Right' || second === 'Left') { u = second === 'Left' ? V.scale(t, -1) : t; v = V.cross(e, u); }
    else { v = second === 'Bottom' ? V.scale(t, -1) : t; u = V.cross(v, e); }
    var F = { e: e, u: u, v: v };
    F.name = D.frameOf(F).name;
    if (F.name === 'Projected') F.name = 'Relative';
    return F;
  }
  // faceAt(mesh, F, [u, v]) -> the index (mesh.faces) of the face nearest the viewer under (u, v) of frame F, or -1
  function faceAt(mesh, F, uv) {
    var P = mesh.positions64 || mesh.positions, best = -1, bd = -Infinity;
    (mesh.faces || []).forEach(function (f, fi) {
      if (V.dot(f.normal, F.e) <= 1e-9) return;
      for (var t = f.start; t < f.start + f.count; t++) {
        var q = [], i = t * 9;
        for (var j = 0; j < 3; j++) { var p = [P[i + 3 * j], P[i + 3 * j + 1], P[i + 3 * j + 2]]; q.push([V.dot(p, F.u), V.dot(p, F.v), V.dot(p, F.e)]); }
        var d0 = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[2][0] - q[0][0]) * (q[1][1] - q[0][1]);
        if (Math.abs(d0) < 1e-18) continue;
        var l1 = ((q[1][0] - uv[0]) * (q[2][1] - uv[1]) - (q[2][0] - uv[0]) * (q[1][1] - uv[1])) / d0;
        var l2 = ((q[2][0] - uv[0]) * (q[0][1] - uv[1]) - (q[0][0] - uv[0]) * (q[2][1] - uv[1])) / d0, l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        var depth = l1 * q[0][2] + l2 * q[1][2] + l3 * q[2][2];
        if (depth > bd) { bd = depth; best = fi; }
      }
    });
    return best;
  }
  // addRelativeView(doc, mesh, { face1, face2 (mesh face indices) | n1, n2 (normals), second, x, y, scale, display }) -> view
  function addRelativeView(doc, mesh, o) {
    o = o || {};
    var f1 = o.face1 != null ? mesh.faces[o.face1] : null, f2 = o.face2 != null ? mesh.faces[o.face2] : null;
    var n1 = o.n1 || f1 && f1.normal, n2 = o.n2 || f2 && f2.normal;
    if (!n1 || !n2) throw new Error('Relative View needs two faces (first: Front, second: ' + (o.second || 'Right') + ')');
    var F = relativeFrame(n1, n2, o.second), ortho = D.isOrthoFrame(F);
    var v = D.addView(doc, F.name, { frame: { e: F.e, u: F.u, v: F.v }, display: o.display || (ortho ? 'hlv' : 'hlr'), scale: o.scale || null, x: +o.x || 0, y: +o.y || 0,
      relative: { second: o.second || 'Right', faces: [o.face1 != null ? o.face1 : null, o.face2 != null ? o.face2 : null], n1: V.norm(n1), n2: V.norm(n2) } });
    if (!ortho) v.dimType = 'true';
    doc.layout = 'manual';
    return v;
  }

  D.SKETCH_STYLES = STYLES; D.SKETCH_WEIGHTS = Object.keys(WEIGHT_MM);
  D.addSketchEntity = addSketchEntity; D.addSketchRect = addSketchRect; D.sketchEntity = sketchEntity; D.sketchEntities = sketchEntities;
  D.editSketchEntity = editSketchEntity; D.moveSketchEntity = moveSketchEntity; D.deleteSketchEntity = deleteSketchEntity; D.solveSketch = solveSketch;
  D.addSketchRelation = addSketchRelation; D.sketchRelations = relationsOf;
  D.addSketchDim = addSketchDim; D.setSketchDim = setSketchDim; D.setLineFormat = setLineFormat; D.lineStyle = lineStyle; D.sketchItems = sketchItems;
  D.sketchEnds = endsOf; D.sketchPoint = function (e, end) { return getPt(e, end).slice(); };
  D.edgeKey = edgeKey; D.setEdgeFormat = setEdgeFormat; D.hideEdge = hideEdge; D.showEdges = showEdges; D.hiddenEdges = hiddenEdges;
  D.relativeFrame = relativeFrame; D.faceAt = faceAt; D.addRelativeView = addRelativeView;
  D.sketchSpline = splinePts; _.sketchPrims = sketchPrims; D.sketchLoop = sketchLoop;
})(Drawing, Drawing._);
