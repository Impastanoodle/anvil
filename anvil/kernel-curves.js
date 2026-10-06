// kernel-curves.js — Anvil kernel, true curves: the analytic surface records that curved facets carry (cyl, cone, sph,
// tor), the extrude / revolve / transform tool builders that attach them, exact volumes and mass properties from the
// records (massOptions, massCache) and analytic edges (true circles and arcs). Loaded after kernel.js and
// kernel-sketch.js. No DOM.
(function (K, _) {
  'use strict';
  var add = _.add, arr = _.arr, cross = _.cross, dot = _.dot, ensureOutward = _.ensureOutward, len = _.len, norm = _.norm, poly = _.poly, pushPoly = _.pushPoly, scale = _.scale, sub = _.sub, to3D = _.to3D, triangulate = _.triangulate, vec = _.vec;   // kernel.js
  var TESS = _.TESS, checkProfile = _.checkProfile, offsetLoop = _.offsetLoop, segsForRadius = _.segsForRadius, signedArea = _.signedArea, sketchProfile = _.sketchProfile;   // kernel-sketch.js

  // ------------------------------------------------------------------ analytic surface records (true curves)
  // A facet that approximates a curved face carries polygon.surf = { s: surface, P?, Q?, e0?, dphi? }; facets of one
  // curved face share the surface object:
  //   { t: 'cyl',  o, d, r }        cylinder: axis through o along the unit d, radius r
  //   { t: 'cone', o, d, r, k }     cone: radius r + k·z at axial coordinate z = (x − o)·d
  //   { t: 'sph',  o, d, r }        sphere: centre o (d: the axis of the revolve that made it)
  //   { t: 'tor',  o, d, R, r }     torus: centre o on the axis d, major radius R (signed), tube radius r
  // Spheres and tori come from revolving a profile arc; their facets also carry the chord of the profile arc they
  // were made from, P and Q = [ρ, z] (radius from the axis, axial coordinate from o), plus e0 (the radial direction
  // at angle 0) and dphi (the angle one ring of facets spans). The records survive CSG splits, clones, transforms
  // and pack / unpack (csg.js), so every fragment of a curved face knows its exact surface; massProps integrates the
  // difference between the facets and the true surfaces (curveCorrection), exports and drawings read the circles.
  function loopCurves(profile, loop) {
    if (!loop.seg || !profile.curves) return null;
    return loop.seg.map(function (k) { return k >= 0 ? profile.curves[k] : null; });
  }
  function cylSurf(plane, C) { return { t: 'cyl', o: to3D(plane, C.c[0], C.c[1]), d: plane.n.slice(), r: C.r }; }
  // attach one record per curve to the side facets of segments that are chords of it
  function tagSides(sides, cv, make) {
    if (!cv) return;
    var memo = [];
    for (var i = 0; i < sides.length; i++) {
      var C = cv[i];
      if (!C || !sides[i]) continue;
      var k = memo.indexOf(C);
      if (k < 0) { memo.push(C); memo.push({ s: make(C, i) }); k = memo.length - 2; }
      sides[i].surf = memo[k + 1];
    }
  }

  function prism(loop, plane, a, b, shared, cv) {
    var polys = [], n = loop.length, sides = [];
    var na = scale(plane.n, a), nb = scale(plane.n, b);
    var bottom = loop.map(function (p) { return add(to3D(plane, p[0], p[1]), na); });
    var top = loop.map(function (p) { return add(to3D(plane, p[0], p[1]), nb); });
    var tris = triangulate(loop);
    tris.forEach(function (t) {
      pushPoly(polys, [top[t[0]], top[t[1]], top[t[2]]], shared);
      pushPoly(polys, [bottom[t[2]], bottom[t[1]], bottom[t[0]]], shared);
    });
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      sides.push(poly([bottom[i], bottom[j], top[j], top[i]], shared));
    }
    tagSides(sides, cv, function (C) { return cylSurf(plane, C); });
    sides.forEach(function (p) { if (p) polys.push(p); });
    return ensureOutward(polys);
  }

  function rotatePoint(p, A, D, ang) {
    var v = sub(p, A), c = Math.cos(ang), s = Math.sin(ang);
    var r = add(add(scale(v, c), scale(cross(D, v), s)), scale(D, dot(D, v) * (1 - c)));
    return add(A, r);
  }

  function revolveSegs(rmax, angleDeg) {
    return Math.max(8, Math.round((TESS.legacy ? 48 : segsForRadius(rmax)) * Math.abs(angleDeg) / 360));
  }
  // segs: rings of facets (default: from the loop's largest radius and the chord tolerance); cv: loopCurves
  function revolveLoop(loop, plane, axisP, axisD, angleDeg, shared, cv, segs) {
    var A = to3D(plane, axisP[0], axisP[1]);
    var D = norm(sub(to3D(plane, axisP[0] + axisD[0], axisP[1] + axisD[1]), A));
    var full = Math.abs(angleDeg) >= 360 - 1e-6;
    // profile points as (ρ, z) about the axis; e = the radial direction of the profile's side (angle 0)
    var rz = loop.map(function (p) { var P = to3D(plane, p[0], p[1]), z = dot(sub(P, A), D); return [len(sub(sub(P, A), scale(D, z))), z, P]; });
    var rmax = 0, e = null;
    rz.forEach(function (q) { if (q[0] > rmax) { rmax = q[0]; e = norm(sub(sub(q[2], A), scale(D, q[1]))); } });
    if (!segs) segs = revolveSegs(rmax, angleDeg);
    var rings = [], s, i;
    for (s = 0; s <= segs; s++) {
      var ang = angleDeg * Math.PI / 180 * s / segs;
      rings.push(loop.map(function (p) { return rotatePoint(to3D(plane, p[0], p[1]), A, D, ang); }));
    }
    if (full) rings[segs] = rings[0];
    var polys = [], n = loop.length;
    // one surface record per profile segment (see "analytic surface records"); planar annuli and segments on the
    // axis get none
    var eps = 1e-9 * Math.max(1, rmax), surfs = [], dphi = angleDeg * Math.PI / 180 / segs;
    for (i = 0; i < n && e; i++) {
      var qi = rz[i], qj = rz[(i + 1) % n], C = cv && cv[i], S = null;
      if (C) {
        var C3 = to3D(plane, C.c[0], C.c[1]), zc = dot(sub(C3, A), D), rc = dot(sub(sub(C3, A), scale(D, zc)), e);
        var o = add(A, scale(D, zc));
        S = Math.abs(rc) < 1e-9 * Math.max(1, C.r) ? { t: 'sph', o: o, d: D.slice(), r: C.r } : { t: 'tor', o: o, d: D.slice(), R: rc, r: C.r };
        surfs.push({ s: S, P: [qi[0], qi[1] - zc], Q: [qj[0], qj[1] - zc], e0: e.slice(), dphi: dphi });
        continue;
      }
      var dz = qj[1] - qi[1], dr = qj[0] - qi[0];
      if (Math.abs(dz) <= eps || (qi[0] <= eps && qj[0] <= eps)) { surfs.push(null); continue; }
      if (Math.abs(dr) <= eps) S = { t: 'cyl', o: A.slice(), d: D.slice(), r: qi[0] };
      else S = { t: 'cone', o: A.slice(), d: D.slice(), r: qi[0] - dr / dz * qi[1], k: dr / dz };
      surfs.push({ s: S });
    }
    for (s = 0; s < segs; s++) {
      var r0 = rings[s], r1 = rings[s + 1];
      for (i = 0; i < n; i++) {
        var j = (i + 1) % n;
        var quad = [r0[i], r1[i], r1[j], r0[j]];
        // drop duplicate points (vertices on the axis)
        var clean = [];
        for (var q = 0; q < 4; q++) {
          var a = quad[q], b = quad[(q + 1) % 4];
          if (len(sub(a, b)) > 1e-7) clean.push(a);
        }
        if (clean.length < 3) continue;
        var pg = poly(clean, shared);
        if (!pg) continue;
        if (surfs[i]) pg.surf = surfs[i];
        polys.push(pg);
      }
    }
    if (!full) {
      var tris = triangulate(loop);
      var first = rings[0], last = rings[segs];
      tris.forEach(function (t) {
        pushPoly(polys, [first[t[0]], first[t[1]], first[t[2]]], shared);
        pushPoly(polys, [last[t[2]], last[t[1]], last[t[0]]], shared);
      });
    }
    return ensureOutward(polys);
  }

  function unionAll(list) {
    if (!list.length) return null;
    var acc = list[0];
    for (var i = 1; i < list.length; i++) acc = acc.union(list[i]);
    return acc;
  }
  // Balanced pairwise union: far fewer polygon splits than a running union when the list is long.
  function unionTree(list) {
    if (!list.length) return null;
    if (list.length === 1) return list[0];
    var mid = list.length >> 1;
    return unionTree(list.slice(0, mid)).union(unionTree(list.slice(mid)));
  }

  // Solid from a profile: disjoint outer prisms concatenated, holes subtracted (slightly overshooting the caps).
  function solidFromProfile(profile, makeSolid) {
    checkProfile(profile);
    var outers = [], holes = [];
    profile.loops.forEach(function (l) {
      var solid = makeSolid(l.pts, l.hole, loopCurves(profile, l));
      if (!solid) return;
      (l.hole ? holes : outers).push(solid);
    });
    if (!outers.length) throw new Error('Sketch has no closed profile.');
    var body = CSG.fromPolygons([].concat.apply([], outers.map(function (o) { return o.polygons; })));
    if (holes.length) body = body.subtract(unionAll(holes));
    return body;
  }

  var THROUGH = 5000;

  function extrudeRange(f, through) {
    through = through || THROUGH;
    if (f.depth != null && !isFinite(+f.depth)) throw new Error('Extrude depth must be a number.');
    if (f.dir2 && f.depth2 != null && !isFinite(+f.depth2)) throw new Error('Extrude depth must be a number.');
    var d = Math.abs(+f.depth || 0);
    var a, b;
    switch (f.end) {
      case 'through': a = 0; b = through; break;
      case 'mid': a = -d / 2; b = d / 2; break;
      default: a = 0; b = d;
    }
    if (f.reverse) { var t = -a; a = -b; b = t; }
    if (f.dir2) {
      var d2 = f.end2 === 'through' ? through : Math.abs(+f.depth2 || 0);
      if (f.reverse) b = Math.max(b, d2); else a = Math.min(a, -d2);
    }
    if (b - a < 1e-9) throw new Error('Extrude depth must be greater than zero.');
    return [a, b];
  }

  // Prism whose section is offset by offA at plane offset a and by offB at b (mitred offsets keep corresponding
  // edges parallel, so the side quads stay planar). Used for drafted extrudes.
  // On chords of true curves (cv, loopCurves) the offset is radial, so the section stays inscribed in the offset
  // circle and the side facets lie on a true cone (a mitred offset would inscribe them in a circle of radius
  // r + d / cos(half chord angle)); a vertex where a curve meets a tangent line or a tangent curve is offset radially
  // too, which keeps the line's facet planar.
  function curveOffset(loop, d, cv) {
    var out = offsetLoop(loop, d);
    if (!cv || !d || TESS.legacy) return out;
    var n = loop.length;
    function radial(i, C) {
      var p = loop[i], u = [(p[0] - C.c[0]) / C.r, (p[1] - C.c[1]) / C.r];
      // convex arc (centre on the left of a CCW loop): outward is away from the centre
      var k = cv.indexOf(C), a = loop[k], b = loop[(k + 1) % n];
      var sg = ((b[0] - a[0]) * (C.c[1] - a[1]) - (b[1] - a[1]) * (C.c[0] - a[0])) > 0 ? 1 : -1;
      if (signedArea(loop) < 0) sg = -sg;
      return [C.c[0] + u[0] * (C.r + sg * d), C.c[1] + u[1] * (C.r + sg * d)];
    }
    function dir(i, j) { var a = loop[i], b = loop[j], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; }
    for (var i = 0; i < n; i++) {
      var ip = (i + n - 1) % n, Cp = cv[ip], Cn = cv[i];
      if (!Cp && !Cn) continue;
      if (Cp && Cn && Cp === Cn) { out[i] = radial(i, Cn); continue; }
      var C = Cn || Cp, other = Cn ? Cp : Cn, u = [(loop[i][0] - C.c[0]) / C.r, (loop[i][1] - C.c[1]) / C.r];
      var tangent;
      if (!other) { var t = Cn ? dir(ip, i) : dir(i, (i + 1) % n); tangent = Math.abs(t[0] * u[0] + t[1] * u[1]) < 1e-6; }
      else { var u2 = [(loop[i][0] - other.c[0]) / other.r, (loop[i][1] - other.c[1]) / other.r]; tangent = Math.abs(u[0] * u2[1] - u[1] * u2[0]) < 1e-6; }
      if (tangent) out[i] = radial(i, C);
    }
    return out;
  }
  function taperedPrism(loop, plane, a, b, offA, offB, shared, cv) {
    var la = offA ? curveOffset(loop, offA, cv) : loop, lb = offB ? curveOffset(loop, offB, cv) : loop;
    // an offset loop has collapsed when any edge reverses direction (a square offset past its centre keeps its area sign)
    function collapsed(off) {
      for (var i = 0; i < loop.length; i++) {
        var j = (i + 1) % loop.length;
        if ((loop[j][0] - loop[i][0]) * (off[j][0] - off[i][0]) + (loop[j][1] - loop[i][1]) * (off[j][1] - off[i][1]) <= 1e-12) return true;
      }
      return signedArea(off) <= 1e-9;
    }
    if (collapsed(la) || collapsed(lb)) throw new Error('Draft angle is too large for this depth: the profile collapses.');
    var polys = [], n = loop.length;
    var na = scale(plane.n, a), nb = scale(plane.n, b);
    var bottom = la.map(function (p) { return add(to3D(plane, p[0], p[1]), na); });
    var top = lb.map(function (p) { return add(to3D(plane, p[0], p[1]), nb); });
    triangulate(lb).forEach(function (t) { pushPoly(polys, [top[t[0]], top[t[1]], top[t[2]]], shared); });
    triangulate(la).forEach(function (t) { pushPoly(polys, [bottom[t[2]], bottom[t[1]], bottom[t[0]]], shared); });
    var sides = [];
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      sides.push(poly([bottom[i], bottom[j], top[j], top[i]], shared));
    }
    // the cone through the chord ends: radius at the sketch plane and slope from the section's own vertices
    tagSides(sides, cv, function (C, i) {
      var v = cv[(i + n - 1) % n] === C ? i : (i + 1) % n; // prefer a vertex inside the arc over a junction
      var ra = Math.hypot(la[v][0] - C.c[0], la[v][1] - C.c[1]), rb = Math.hypot(lb[v][0] - C.c[0], lb[v][1] - C.c[1]);
      var k = (rb - ra) / (b - a);
      if (Math.abs(k) < 1e-12) return cylSurf(plane, { c: C.c, r: ra });
      return { t: 'cone', o: to3D(plane, C.c[0], C.c[1]), d: plane.n.slice(), r: ra - k * a, k: k };
    });
    sides.forEach(function (p) { if (p) polys.push(p); });
    return ensureOutward(polys);
  }

  function buildExtrude(f, sketch, plane, through) {
    var profile = sketch.profile || sketchProfile(sketch);
    var range = extrudeRange(f, through);
    if (f.draft != null && !isFinite(+f.draft)) throw new Error('Draft angle must be a number.');
    var draft = +f.draft || 0;
    if (Math.abs(draft) >= 89) throw new Error('Draft angle must be less than 89°.');
    // draft: the section shrinks (or grows, with draftOut) by |t|·tan(angle) at distance t from the sketch plane
    var k = draft ? Math.tan(draft * Math.PI / 180) * (f.draftOut ? 1 : -1) : 0;
    return solidFromProfile(profile, function (pts, hole, cv) {
      var a = range[0], b = range[1];
      if (hole) { a -= 0.01; b += 0.01; }
      if (!k) return prism(pts, plane, a, b, f.id, cv);
      var s = hole ? -1 : 1; // holes are the complement: they grow when the material shrinks
      function part(a0, b0) { return taperedPrism(pts, plane, a0, b0, s * k * Math.abs(a0), s * k * Math.abs(b0), f.id, cv); }
      // the taper starts at the sketch plane on both sides (mid-plane, direction 2), so split there
      if (a < -1e-9 && b > 1e-9) return part(a, 0).union(part(0, b));
      return part(a, b);
    });
  }

  function revolveAxis(f, sketch) {
    var ax = f.axis;
    if (ax === 'y' || ax == null) return { p: [0, 0], d: [0, 1] };
    if (ax === 'x') return { p: [0, 0], d: [1, 0] };
    if (typeof ax === 'object' && ax.x1 != null) return { p: [ax.x1, ax.y1], d: [ax.x2 - ax.x1, ax.y2 - ax.y1] };
    var e = sketch.entities[ax];
    if (!e || e.t !== 'line') throw new Error('Revolve axis must be a sketch line.');
    return { p: [e.x1, e.y1], d: [e.x2 - e.x1, e.y2 - e.y1] };
  }

  function buildRevolve(f, sketch, plane) {
    var profile = sketch.profile || sketchProfile(sketch);
    var axis = revolveAxis(f, sketch);
    var axisLine = f.axis, isLine = typeof axisLine === 'number';
    if (f.angle != null && !isFinite(+f.angle)) throw new Error('Revolve angle must be a number.');
    var angle = +f.angle || 360;
    if (f.reverse) angle = -angle;
    var dl = len([axis.d[0], axis.d[1], 0]);
    if (dl < 1e-9) throw new Error('Revolve axis has zero length.');
    var d = [axis.d[0] / dl, axis.d[1] / dl];
    // one ring count for the whole feature, from the largest radius of any loop
    var rmax = 0;
    profile.loops.forEach(function (l) { l.pts.forEach(function (p) { rmax = Math.max(rmax, Math.abs((p[0] - axis.p[0]) * d[1] - (p[1] - axis.p[1]) * d[0])); }); });
    var segs = revolveSegs(rmax, angle);
    return solidFromProfile(profile, function (pts, hole, cv) {
      // reject loops crossing the axis
      var side = 0;
      for (var i = 0; i < pts.length; i++) {
        var s = (pts[i][0] - axis.p[0]) * d[1] - (pts[i][1] - axis.p[1]) * d[0];
        if (Math.abs(s) < 1e-7) continue;
        if (side === 0) side = s > 0 ? 1 : -1;
        else if ((s > 0 ? 1 : -1) !== side) throw new Error('Revolve profile crosses the axis.');
      }
      return revolveLoop(pts, plane, axis.p, d, angle, f.id, cv, segs);
    });
  }

  function translateBody(body, t) {
    return body.transform(function (p) { return new CSG.Vector(p.x + t[0], p.y + t[1], p.z + t[2]); }, false);
  }
  function rotateBody(body, center, axis, angleDeg) {
    var ang = angleDeg * Math.PI / 180;
    return body.transform(function (p) { return vec(rotatePoint(arr(p), center, axis, ang)); }, false);
  }
  function mirrorBody(body, plane) {
    var n = plane.n, o = plane.origin;
    return body.transform(function (p) {
      var q = arr(p);
      var dd = dot(sub(q, o), n);
      return vec(sub(q, scale(n, 2 * dd)));
    }, true);
  }

  // ------------------------------------------------------------------ exact volumes from the analytic records
  // curveCorrection(polygons) -> { volume, moment: [x, y, z], area, facets } — what the true curved faces add to (or,
  // for concave faces such as holes, take from) the polygonal solid: volume, first moment ∫x dV, and surface area.
  // Each facet fragment F owns the region between itself and its true surface, swept along columns that keep the
  // pieces of neighbouring facets apart (so fragments made by CSG splits still add up exactly):
  //   cylinders / cones: in the plane perpendicular to the axis through x, the ray from the axis through x, out to
  //     the surface radius R(z). Per unit area of F that is (n·eρ)(R² − ρ²)/(2ρ) (ρ = distance of x from the axis,
  //     eρ the radial direction): the polar area ∫ρ dρ dφ with dφ dz = |n·eρ|/ρ dA. A facet's slice is a chord of
  //     the circle R(z), so the sum over a whole ring of facets is exactly the circle minus the polygon.
  //   spheres / tori (revolved arcs), in two levels: first out to the cone through the circles of the chord's ends
  //     P and Q (as above), then, in the meridian half-plane, along the ray from the arc centre C through that point
  //     on the chord PQ out to the arc: ∫(Cρ + r' cos θ) r' dr' dθ dφ, with dθ = h / r_y² ds along the chord.
  // The columns are exact where the neighbouring faces are perpendicular to the axis (caps, steps, hole bottoms) or
  // contain it (the ends of a partial revolve); elsewhere (a hole drilled through a slanted face, crossing cylinders)
  // the error is of the order of the sliver's own curvature. Integrals: Gauss-Legendre on each fan triangle
  // (collapsed square, 6 × 6 points), the columns in closed form.
  var GL6 = { x: [0.033765242898423986, 0.16939530676686776, 0.38069040695840156, 0.6193095930415985, 0.8306046932331322, 0.966234757101576],
    w: [0.08566224618958517, 0.18038078652406933, 0.23395696728634552, 0.23395696728634552, 0.18038078652406933, 0.08566224618958517] };

  // r11/perf11: a box that holds every point the inside test below can accept for planar polygon p (x0 y0 z0 x1 y1 z1),
  // so most polygons of a big plane are skipped at once (the Flange's curve correction 28 → 10 ms, same result). The
  // test lets a point be up to d = 1e-12·max(1, L²)/L outside an edge of length L and 1e-6·max(1, |w|) off the plane;
  // on a convex polygon that stays within max(d) / sin(α/2) of it (α its sharpest corner), padded twice over here. A
  // polygon with a very short edge or a needle corner gets an infinite box (always tested, as before).
  // Kernel.massOptions: planarBoxes (the box filter) and cache (massProps kept per mesh); the tests switch them off to
  // compare
  var massOptions = { planarBoxes: true, cache: true };
  function planarBox(p) {
    var vs = p.vertices, n = vs.length, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], dmax = 0, smin = 1;
    for (var j = 0; j < n; j++) {
      var a = vs[j].pos, b = vs[(j + 1) % n].pos, c = vs[(j + 2) % n].pos;
      lo[0] = Math.min(lo[0], a.x); lo[1] = Math.min(lo[1], a.y); lo[2] = Math.min(lo[2], a.z);
      hi[0] = Math.max(hi[0], a.x); hi[1] = Math.max(hi[1], a.y); hi[2] = Math.max(hi[2], a.z);
      var ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - b.x, vy = c.y - b.y, vz = c.z - b.z;
      var L = Math.sqrt(ux * ux + uy * uy + uz * uz), M = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (!(L > 1e-6) || !(M > 1e-6)) return [-Infinity, -Infinity, -Infinity, Infinity, Infinity, Infinity];
      dmax = Math.max(dmax, 1e-12 * Math.max(1, L * L) / L);
      var cosA = -(ux * vx + uy * vy + uz * vz) / (L * M);   // interior angle at b
      smin = Math.min(smin, Math.sqrt(Math.max(0, (1 - cosA) / 2)));
    }
    if (!(smin > 1e-3) || !(n >= 3)) return [-Infinity, -Infinity, -Infinity, Infinity, Infinity, Infinity];
    var pad = 2 * (dmax / smin + 1e-6 * Math.max(1, Math.abs(p.plane.w))) + 1e-9;
    return [lo[0] - pad, lo[1] - pad, lo[2] - pad, hi[0] + pad, hi[1] + pad, hi[2] + pad];
  }
  // planar faces by plane, for the side walls of the slivers (surface area only)
  function planarIndex(polys) {
    var idx = {}, boxIdx = {};
    polys.forEach(function (p) {
      if (p.surf) return;
      var n = p.plane.normal, s = (n.x < -1e-9 || (Math.abs(n.x) <= 1e-9 && (n.y < -1e-9 || (Math.abs(n.y) <= 1e-9 && n.z < 0)))) ? -1 : 1;
      var k = Math.round(n.x * s * 1000) + ',' + Math.round(n.y * s * 1000) + ',' + Math.round(n.z * s * 1000) + ',' + Math.round(p.plane.w * s * 1e4);
      (idx[k] = idx[k] || []).push(p);
      (boxIdx[k] = boxIdx[k] || []).push(planarBox(p));
    });
    return function (N, q) {
      var s = (N[0] < -1e-9 || (Math.abs(N[0]) <= 1e-9 && (N[1] < -1e-9 || (Math.abs(N[1]) <= 1e-9 && N[2] < 0)))) ? -1 : 1;
      var w = dot(N, q) * s, base = Math.round(N[0] * s * 1000) + ',' + Math.round(N[1] * s * 1000) + ',' + Math.round(N[2] * s * 1000) + ',', wk = Math.round(w * 1e4);
      for (var dk = -1; dk <= 1; dk++) {
        var list = idx[base + (wk + dk)], boxes = boxIdx[base + (wk + dk)];
        if (!list) continue;
        for (var i = 0; i < list.length; i++) {
          var bx = boxes[i];
          if (massOptions.planarBoxes && (q[0] < bx[0] || q[0] > bx[3] || q[1] < bx[1] || q[1] > bx[4] || q[2] < bx[2] || q[2] > bx[5])) continue;
          var p = list[i], pn = p.plane.normal, vs = p.vertices, inside = true;
          if (Math.abs(pn.x * q[0] + pn.y * q[1] + pn.z * q[2] - p.plane.w) > 1e-6 * Math.max(1, Math.abs(p.plane.w))) continue;
          for (var j = 0; j < vs.length && inside; j++) {
            var a = vs[j].pos, b = vs[(j + 1) % vs.length].pos;
            var ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z, qx = q[0] - a.x, qy = q[1] - a.y, qz = q[2] - a.z;
            var cx = ey * qz - ez * qy, cy = ez * qx - ex * qz, cz = ex * qy - ey * qx;
            if (cx * pn.x + cy * pn.y + cz * pn.z < -1e-12 * Math.max(1, ex * ex + ey * ey + ez * ez)) inside = false;
          }
          if (inside) return true;
        }
      }
      return false;
    };
  }

  // densities at a point x of a facet with unit outward normal n: [volume, mx, my, mz, true area] per unit facet area
  function curveDensity(F, x, n, phiC) {
    var S = F.s, rel = sub(x, S.o), z = dot(rel, S.d), v = sub(rel, scale(S.d, z)), rx = len(v);
    if (rx < 1e-12) return null;
    var er = scale(v, 1 / rx), nr = dot(n, er), base = add(S.o, scale(S.d, z)), out = [0, 0, 0, 0, 0];
    function level1(R) {
      var f = nr / rx, i1 = (R * R - rx * rx) / 2, i2 = (R * R * R - rx * rx * rx) / 3;
      out[0] += f * i1;
      for (var k = 0; k < 3; k++) out[1 + k] += f * (base[k] * i1 + er[k] * i2);
    }
    if (S.t === 'cyl' || S.t === 'cone') {
      var kk = S.k || 0, R = S.r + kk * z;
      level1(R);
      out[4] = R * Math.sqrt(1 + kk * kk) * Math.abs(nr) / rx;
      return out;
    }
    if (!F.P || !F.Q) return null;   // a sphere / torus facet not made by a revolve (OpenCascade's triangles): no profile chord, no correction
    var P = F.P, Q = F.Q, Cr = S.t === 'tor' ? S.R : 0, r = S.r;
    var dz = Q[1] - P[1], dr = Q[0] - P[0], L = Math.hypot(dr, dz), y, js;
    if (Math.abs(dz) > 1e-12 * Math.max(1, L)) {
      var R1 = P[0] + dr * (z - P[1]) / dz;
      level1(R1);
      y = [R1, z];
      js = L / Math.abs(dz) * Math.abs(nr) / rx;
    } else {
      // a chord perpendicular to the axis: its facets are planar trapezoids; map them onto the annulus radially
      // within their ring of facets (the ring comes from the fragment's centroid angle phiC)
      var dphi = F.dphi, beta = Math.abs(dphi) / 2, e0 = F.e0, e1 = cross(S.d, e0);
      var phi = Math.atan2(dot(er, e1), dot(er, e0));
      var jr = Math.floor(phiC / dphi), phim = (jr + 0.5) * dphi;
      var u = rx * Math.cos(phi - phim);
      y = [u / Math.cos(beta), P[1]];
      js = L / Math.abs(dr) * Math.abs(u) / (rx * rx * Math.cos(beta));
    }
    var a = y[0] - Cr, b = y[1], ry = Math.hypot(a, b);
    if (ry < 1e-12) return out;
    var c = a / ry, sn = b / ry;
    var h = Math.abs(dr * (0 - P[1]) - dz * (Cr - P[0])) / L;
    var nz = dot(n, S.d), sg = ((Cr - P[0]) * nr + (0 - P[1]) * nz) < 0 ? 1 : -1;
    var J = h / (ry * ry) * js;
    var I1 = (r * r - ry * ry) / 2, I2 = (r * r * r - ry * ry * ry) / 3, I3 = (r * r * r * r - ry * ry * ry * ry) / 4;
    var g = Cr * I1 + c * I2, zm = sn * Cr * I2 + sn * c * I3, rm = Cr * Cr * I1 + 2 * Cr * c * I2 + c * c * I3;
    out[0] += sg * J * g;
    for (var k2 = 0; k2 < 3; k2++) out[1 + k2] += sg * J * (S.o[k2] * g + S.d[k2] * zm + er[k2] * rm);
    out[4] = r * Math.abs(Cr + r * c) * J;
    return out;
  }

  function angleOf(F, x) {
    var S = F.s, rel = sub(x, S.o), v = sub(rel, scale(S.d, dot(rel, S.d)));
    var phi = Math.atan2(dot(v, cross(S.d, F.e0)), dot(v, F.e0));
    if (F.dphi > 0 && phi < 0) phi += 2 * Math.PI;
    if (F.dphi < 0 && phi > 0) phi -= 2 * Math.PI;
    return phi;
  }

  // the side walls of a fragment's sliver that lie in a planar face (area only): +wall where the face is on the
  // axis side (or the arc-centre side) of the chord, −wall where it is on the far side
  function curveWalls(F, p, planar) {
    var S = F.s, vs = p.vertices, total = 0, n = arr(p.plane.normal);
    for (var i = 0; i < vs.length; i++) {
      var A = arr(vs[i].pos), B = arr(vs[(i + 1) % vs.length].pos), el = len(sub(B, A));
      if (el < 1e-9) continue;
      var za = dot(sub(A, S.o), S.d), zb = dot(sub(B, S.o), S.d), scl = Math.max(1, Math.abs(za), el);
      var M = scale(add(A, B), 0.5), zm = dot(sub(M, S.o), S.d), cM = add(S.o, scale(S.d, zm)), vm = sub(M, cM), rm = len(vm);
      if (rm < 1e-12) continue;
      var erm = scale(vm, 1 / rm), eps = 1e-4 * el, wall = null, inner, outer, N;
      if (Math.abs(za - zb) < 1e-9 * scl) {
        var R = null;
        if (S.t === 'cyl' || S.t === 'cone') R = S.r + (S.k || 0) * zm;
        else if (F.P && F.Q && Math.abs(F.Q[1] - F.P[1]) > 1e-12 * scl) R = F.P[0] + (F.Q[0] - F.P[0]) * (zm - F.P[1]) / (F.Q[1] - F.P[1]);
        if (R != null) {
          var va = sub(sub(A, S.o), scale(S.d, za)), vb = sub(sub(B, S.o), scale(S.d, zb));
          var cosA = dot(va, vb) / (len(va) * len(vb) || 1), dphi = Math.acos(Math.max(-1, Math.min(1, cosA)));
          wall = R * R * dphi / 2 - len(cross(va, vb)) / 2;
          inner = sub(M, scale(erm, eps)); outer = add(M, scale(erm, eps)); N = S.d;
        }
      } else if (F.P && Math.abs(dot(norm(cross(S.d, sub(A, S.o))), sub(B, S.o))) < 1e-9 * scl) {
        // an edge in a meridian half-plane (the end of a partial revolve): the arc's own segment
        var Cr = S.t === 'tor' ? S.R : 0, pa = [len(sub(sub(A, S.o), scale(S.d, za))) - Cr, za], pb = [len(sub(sub(B, S.o), scale(S.d, zb))) - Cr, zb];
        var ang = Math.acos(Math.max(-1, Math.min(1, (pa[0] * pb[0] + pa[1] * pb[1]) / (Math.hypot(pa[0], pa[1]) * Math.hypot(pb[0], pb[1]) || 1))));
        wall = S.r * S.r * ang / 2 - Math.abs(pa[0] * pb[1] - pa[1] * pb[0]) / 2;
        var o2 = [rm - Cr, zm], ol = Math.hypot(o2[0], o2[1]) || 1, dout = add(scale(erm, o2[0] / ol), scale(S.d, o2[1] / ol));
        inner = sub(M, scale(dout, eps)); outer = add(M, scale(dout, eps)); N = norm(cross(S.d, erm));
      }
      if (wall == null || !(Math.abs(wall) > 0)) continue;
      if (planar(N, inner)) total += wall;
      if (planar(N, outer)) total -= wall;
    }
    return total;
  }

  function curveCorrection(polys) {
    var res = { volume: 0, moment: [0, 0, 0], area: 0, facets: 0 };
    var planar = null;
    for (var pi = 0; pi < polys.length; pi++) {
      var p = polys[pi], F = p.surf;
      if (!F) continue;
      res.facets++;
      var vs = p.vertices, n = arr(p.plane.normal), phiC = 0, polyArea = 0;
      if (F.P && F.e0) {
        var cen = [0, 0, 0];
        vs.forEach(function (v) { cen = add(cen, arr(v.pos)); });
        phiC = angleOf(F, scale(cen, 1 / vs.length));
      }
      // fan from the vertex nearest the axis: the densities vary fastest there (a sphere's pole), and the collapsed
      // square's corner at u = 0 clusters its points on the fan apex
      var i0 = 0, best = Infinity;
      for (var q = 0; q < vs.length; q++) {
        var rq = sub(arr(vs[q].pos), F.s.o), dq = len(sub(rq, scale(F.s.d, dot(rq, F.s.d))));
        if (dq < best - 1e-12) { best = dq; i0 = q; }
      }
      var A = arr(vs[i0].pos);
      for (var j = 1; j + 1 < vs.length; j++) {
        var B = arr(vs[(i0 + j) % vs.length].pos), C = arr(vs[(i0 + j + 1) % vs.length].pos), ab = sub(B, A), bc = sub(C, B);
        var ar2 = len(cross(ab, sub(C, A)));
        if (ar2 < 1e-18) continue;
        polyArea += ar2 / 2;
        for (var iu = 0; iu < 6; iu++) {
          var u = GL6.x[iu];
          for (var iv = 0; iv < 6; iv++) {
            var v = GL6.x[iv], wgt = GL6.w[iu] * GL6.w[iv] * ar2 * u;
            var x = add(A, add(scale(ab, u), scale(bc, u * v)));
            var d = curveDensity(F, x, n, phiC);
            if (!d) continue;
            res.volume += wgt * d[0];
            res.moment[0] += wgt * d[1]; res.moment[1] += wgt * d[2]; res.moment[2] += wgt * d[3];
            res.area += wgt * d[4];
          }
        }
      }
      res.area -= polyArea;
      if (!planar) planar = planarIndex(polys);
      res.area += curveWalls(F, p, planar);
    }
    return res;
  }

  // ------------------------------------------------------------------ analytic edges (true circles and arcs)
  function polysOf(x) {
    if (!x) return [];
    if (x.polygons) return x.polygons;
    if (x.faces) { var out = []; x.faces.forEach(function (f) { if (f.polys) out = out.concat(f.polys); }); return out; }
    return x;
  }
  function surfKey(S) {
    function q(v) { return Math.round(v * 1e6); }
    var d = S.d, sg = (d[0] < -1e-9 || (Math.abs(d[0]) <= 1e-9 && (d[1] < -1e-9 || (Math.abs(d[1]) <= 1e-9 && d[2] < 0)))) ? -1 : 1;
    var dd = scale(d, sg), o = S.o;
    // cylinders and cones: the axis line (its point nearest the world origin); spheres and tori: the centre
    if (S.t === 'cyl' || S.t === 'cone') { o = sub(S.o, scale(dd, dot(S.o, dd))); }
    var k = S.t + ':' + o.map(q).join(',') + ':' + dd.map(q).join(',') + ':' + q(S.r);
    if (S.t === 'cone') k += ':' + q(S.k * sg) + ':' + q(S.r + S.k * dot(S.o, dd) * 0); // same line + same radius at o
    if (S.t === 'tor') k += ':' + q(S.R);
    return k;
  }
  // curveSurfaces(bodyOrMeshOrPolygons) -> [{ key, surf, polys }]: the curved faces as their analytic surfaces (one
  // entry per distinct surface, every facet fragment on it)
  function curveSurfaces(x) {
    var by = {}, out = [];
    polysOf(x).forEach(function (p) {
      if (!p.surf) return;
      var S = p.surf.s, k = S._key || surfKey(S);
      if (!by[k]) { by[k] = { key: k, surf: S, polys: [] }; out.push(by[k]); }
      by[k].polys.push(p);
    });
    return out;
  }
  // curveEdges(bodyOrMeshOrPolygons) -> [{ kind: 'circle' | 'arc', center, normal, radius, xdir, a0, a1, surface,
  //   chords: [[p, q], ...] }]: the boundaries of the curved faces that are true circles and arcs — where a cylinder,
  // cone, sphere or torus meets a face perpendicular to its axis (a cap, a step, a hole's rim or bottom), and the
  // profile arcs at the ends of a partial revolve. Angles are about `normal` from `xdir` (a0 < a1, radians); a full
  // circle has a0 = 0, a1 = 2π. `chords` are the mesh edges that approximate it (the facet boundaries on the curve),
  // so a consumer can swap them for the exact curve. Edges shared by two fragments of the same surface (splits) are
  // interior and left out.
  function curveEdges(x) {
    var polys = polysOf(x), groups = {}, order = [];
    function k3(p) { return Math.round(p[0] * 1e6) + ',' + Math.round(p[1] * 1e6) + ',' + Math.round(p[2] * 1e6); }
    polys.forEach(function (p) {
      if (!p.surf) return;
      var F = p.surf, S = F.s, sk = S._key || surfKey(S), vs = p.vertices;
      for (var i = 0; i < vs.length; i++) {
        var A = arr(vs[i].pos), B = arr(vs[(i + 1) % vs.length].pos);
        var el = len(sub(B, A));
        if (el < 1e-9) continue;
        var za = dot(sub(A, S.o), S.d), zb = dot(sub(B, S.o), S.d), scl = Math.max(1, el, Math.abs(za));
        var g = null;
        if (Math.abs(za - zb) < 1e-9 * scl) {
          // a chord (or a piece of one, when CSG split the facet) in a plane perpendicular to the axis: both ends
          // between the chord's distance and the circle of that level (at most a 16-gon's sagitta inside it)
          var c = add(S.o, scale(S.d, za)), ra = len(sub(A, c)), rb = len(sub(B, c));
          var Rz = null;
          if (S.t === 'cyl' || S.t === 'cone') Rz = S.r + (S.k || 0) * za;
          else if (F.P && Math.abs(za - F.P[1]) < 1e-7 * scl) Rz = F.P[0];
          else if (F.Q && Math.abs(za - F.Q[1]) < 1e-7 * scl) Rz = F.Q[0];
          if (Rz == null || !(Rz > 1e-9)) continue;
          var tolR = 1e-6 * Math.max(1, Rz), lo = Rz * Math.cos(Math.PI / 8) - tolR;
          if (ra > Rz + tolR || rb > Rz + tolR || ra < lo || rb < lo) continue;
          // the chord must be a boundary of the facet on the curve: its midpoint no nearer the axis than the chord of
          // the facet it lies on (a straight edge across the face would be)
          if (len(sub(scale(add(A, B), 0.5), c)) < lo) continue;
          // keyed by the record's origin as well as za: two faces of one cylinder can carry records with different
          // origins, and a rim at za of one is not the other's (OpenCascade's Pulley: y = 6 and y = 20) (r9/drawings9)
          var dsg = (S.d[0] < -1e-9 || (Math.abs(S.d[0]) <= 1e-9 && (S.d[1] < -1e-9 || (Math.abs(S.d[1]) <= 1e-9 && S.d[2] < 0)))) ? -1 : 1;
          g = { key: sk + '|o' + Math.round(dsg * dot(S.o, S.d) * 1e6) + '|z' + Math.round(za * 1e6), center: c, normal: S.d.slice(), radius: Rz, surface: S };
        } else if (F.P && Math.abs(dot(norm(cross(S.d, sub(A, S.o))), sub(B, S.o))) < 1e-9 * scl) {
          // a profile arc of a partial revolve: in a meridian half-plane, both ends on the tube circle
          // the radial direction of the half-plane, from the end farther from the axis (the other may be a pole)
          var va = sub(sub(A, S.o), scale(S.d, za)), vb = sub(sub(B, S.o), scale(S.d, zb));
          var er = norm(len(va) >= len(vb) ? va : vb), Cr = S.t === 'tor' ? S.R : 0, C = add(S.o, scale(er, Cr));
          var da = len(sub(A, C)), db = len(sub(B, C));
          if (Math.abs(da - S.r) > 1e-6 * Math.max(1, S.r) || Math.abs(db - S.r) > 1e-6 * Math.max(1, S.r)) continue;
          var nrm = norm(cross(er, S.d)), ang = Math.atan2(dot(er, cross(S.d, F.e0)), dot(er, F.e0));
          g = { key: sk + '|m' + Math.round(ang * 1e6), center: C, normal: nrm, radius: S.r, surface: S };
        }
        if (!g) continue;
        if (!groups[g.key]) { groups[g.key] = { g: g, edges: {} }; order.push(g.key); }
        var ek = k3(A) < k3(B) ? k3(A) + '|' + k3(B) : k3(B) + '|' + k3(A), E = groups[g.key].edges;
        if (E[ek]) E[ek].n++; else E[ek] = { n: 1, a: A, b: B };
      }
    });
    var out = [];
    order.forEach(function (key) {
      var G = groups[key], g = G.g, chords = [];
      Object.keys(G.edges).forEach(function (ek) { var e = G.edges[ek]; if (e.n === 1) chords.push([e.a, e.b]); });
      if (!chords.length) return;
      var n = g.normal, xd = null;
      // reference direction: world-stable (the in-plane direction nearest +x, else +y) so equal circles agree
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(function (w) { if (xd) return; var t = sub(w, scale(n, dot(w, n))); if (len(t) > 1e-6) xd = norm(t); });
      var yd = cross(n, xd);
      function angle(p) { var v = sub(p, g.center), a = Math.atan2(dot(v, yd), dot(v, xd)); return a < 0 ? a + 2 * Math.PI : a; }
      // angular intervals of the chords, merged into runs
      var iv = chords.map(function (c) {
        var a = angle(c[0]), b = angle(c[1]);
        if (b < a) { var t = a; a = b; b = t; }
        if (b - a > Math.PI) { var t2 = a; a = b; b = t2 + 2 * Math.PI; } // the chord across angle 0
        return [a, b, c];
      }).sort(function (u, v) { return u[0] - v[0]; });
      var runs = [];
      iv.forEach(function (u) {
        var r = runs[runs.length - 1];
        if (r && u[0] <= r.a1 + 1e-9) { r.a1 = Math.max(r.a1, u[1]); r.chords.push(u[2]); }
        else runs.push({ a0: u[0], a1: u[1], chords: [u[2]] });
      });
      // a run that wraps past 2π joins the first
      if (runs.length > 1) {
        var last = runs[runs.length - 1], first = runs[0];
        if (last.a1 >= 2 * Math.PI + first.a0 - 1e-9) { first.a0 = last.a0 - 2 * Math.PI; first.chords = last.chords.concat(first.chords); runs.pop(); }
      }
      runs.forEach(function (r) {
        var full = r.a1 - r.a0 >= 2 * Math.PI - 1e-9;
        out.push({ kind: full ? 'circle' : 'arc', center: g.center, normal: n, radius: g.radius, xdir: xd,
          a0: full ? 0 : r.a0, a1: full ? 2 * Math.PI : r.a1, surface: g.surface, chords: r.chords });
      });
    });
    return out;
  }
  // meshCurveInfo(mesh) -> { faces, faceSurfs, key0, curves }: what the viewport needs about a mesh's curved faces, as
  // plain data a worker can send with its build (r3/engine3): faceSurfs[i] the surface keys of mesh face i's polygons
  // (null: none curved), key0[i] that of its first polygon, curves = curveEdges(mesh); faces = the face count it fits.
  function meshCurveInfo(mesh) {
    var keyOf = new Map();
    curveSurfaces(mesh).forEach(function (s) { s.polys.forEach(function (p) { keyOf.set(p, s.key); }); });
    var faceSurfs = [], key0 = [];
    mesh.faces.forEach(function (f) {
      var ks = null, ps = f.polys || [];
      for (var i = 0; i < ps.length; i++) { var k = keyOf.get(ps[i]); if (k && (!ks || ks.indexOf(k) < 0)) (ks = ks || []).push(k); }
      faceSurfs.push(ks);
      key0.push(ps[0] && keyOf.get(ps[0]) || null);
    });
    var curves = keyOf.size ? curveEdges(mesh).map(function (c) {
      return { kind: c.kind, center: c.center, normal: c.normal, radius: c.radius, xdir: c.xdir, a0: c.a0, a1: c.a1, chords: c.chords };
    }) : [];
    return { faces: mesh.faces.length, faceSurfs: faceSurfs, key0: key0, curves: curves };
  }
  // analyticNormals(mesh) -> Float32Array laid out like mesh.normals: every corner of a triangle on a curved face gets
  // its surface's own normal there, oriented like its facet's (planar faces keep the flat normals). The same numbers as
  // ui-core.js analyticNormals (the viewport's smooth shading), so a worker can find them and send them with its build
  // (r3/engine3: tens of ms on the main thread for an OpenCascade solid, where every facet is curved).
  function surfNormalAt(S, x) {
    var v = [x[0] - S.o[0], x[1] - S.o[1], x[2] - S.o[2]], d = S.d, z = dot(v, d), n;
    if (S.t === 'sph') n = v;
    else {
      var rho = [v[0] - d[0] * z, v[1] - d[1] * z, v[2] - d[2] * z], rl = len(rho);
      if (rl < 1e-9) return null;
      var er = [rho[0] / rl, rho[1] / rl, rho[2] / rl];
      if (S.t === 'cyl') n = er;
      else if (S.t === 'cone') n = [er[0] - (S.k || 0) * d[0], er[1] - (S.k || 0) * d[1], er[2] - (S.k || 0) * d[2]];
      else if (S.t === 'tor') n = [rho[0] - er[0] * S.R, rho[1] - er[1] * S.R, rho[2] - er[2] * S.R];
      else return null;
    }
    var l = len(n);
    return l > 1e-12 ? [n[0] / l, n[1] / l, n[2] / l] : null;
  }
  function analyticNormals(m) {
    var out = new Float32Array(m.normals);
    (m.faces || []).forEach(function (f) {
      if (!f.polys) return;
      var t = f.start, fn = f.normal, writes = [];
      f.polys.forEach(function (p) {
        var vs = p.vertices, nt = Math.max(0, vs.length - 2);
        if (p.surf && p.surf.s) {
          var vn = vs.map(function (vx) {
            var n = surfNormalAt(p.surf.s, [vx.pos.x, vx.pos.y, vx.pos.z]);
            if (!n) return fn;
            return dot(n, fn) < 0 ? [-n[0], -n[1], -n[2]] : n;
          });
          for (var j = 1; j + 1 < vs.length; j++) writes.push(t + j - 1, vn[0], vn[j], vn[j + 1]);
        }
        t += nt;
      });
      if (t !== f.start + f.count) return;
      for (var w = 0; w < writes.length; w += 4) {
        var o = writes[w] * 9;
        for (var c = 0; c < 3; c++) { var n = writes[w + 1 + c]; out[o + c * 3] = n[0]; out[o + c * 3 + 1] = n[1]; out[o + c * 3 + 2] = n[2]; }
      }
    });
    return out;
  }

  // massProps(mesh, density) -> { volume, area, centroid, bbox, density, mass, polygonal?, curved? }. Volume, area and
  // centroid are the exact values of the true curved faces when the mesh's faces carry their CSG polygons (meshes
  // from meshFromBody): the polygonal figures plus curveCorrection. `polygonal` keeps the facets' own volume and
  // area; `curved` counts the facets on analytic surfaces.
  // r11/perf11: the result is kept per mesh object (a WeakMap; meshes are not changed after meshFromBody) and handed
  // out as a fresh copy: the curve correction takes 2–40 ms on a part with many curved facets, and the same mesh is
  // asked again and again (anvil.summary twice per call, materials and assembly mass, drawings, the OpenCascade
  // check). Another positions / faces array, another length or a changed sampled coordinate misses the cache.
  var massCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  function massKey(mesh) {
    var p = mesh.positions64 || mesh.positions, n = p ? p.length : 0, s = 0;
    for (var i = 0; i < n; i += Math.max(1, (n / 16) | 0)) s += p[i] * (i + 1);
    if (n) s += p[n - 1];
    return { p: p, n: n, s: s, faces: mesh.faces, nf: mesh.faces ? mesh.faces.length : 0, exact: mesh.exact };
  }
  function sameMassKey(a, b) { return a.p === b.p && a.n === b.n && (a.s === b.s || (a.s !== a.s && b.s !== b.s)) && a.faces === b.faces && a.nf === b.nf && a.exact === b.exact; }
  function massCopy(r, density) {
    var out = { volume: r.volume, area: r.area, centroid: r.centroid.slice(), bbox: { min: r.bbox.min.slice(), max: r.bbox.max.slice() }, density: density, mass: r.volume * density };
    if (r.polygonal) out.polygonal = { volume: r.polygonal.volume, area: r.polygonal.area };
    if (r.exact) out.exact = true;
    else if (r.polygonal) out.curved = r.curved;
    return out;
  }
  function massProps(mesh, density) {
    if (!massCache || !massOptions.cache || !mesh || typeof mesh !== 'object') return massPropsOf(mesh, density);
    var key = massKey(mesh), hit = massCache.get(mesh);
    if (hit && sameMassKey(hit.key, key)) return massCopy(hit.r, density);
    var r = massPropsOf(mesh, density);
    massCache.set(mesh, { key: key, r: massCopy(r, density) });
    return r;
  }
  function massPropsOf(mesh, density) {
    var p = mesh.positions64 || mesh.positions, vol = 0, area = 0, cx = 0, cy = 0, cz = 0;
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < p.length; i += 9) {
      var a = [p[i], p[i + 1], p[i + 2]], b = [p[i + 3], p[i + 4], p[i + 5]], c = [p[i + 6], p[i + 7], p[i + 8]];
      var v = dot(a, cross(b, c)) / 6;
      vol += v;
      cx += v * (a[0] + b[0] + c[0]) / 4; cy += v * (a[1] + b[1] + c[1]) / 4; cz += v * (a[2] + b[2] + c[2]) / 4;
      area += len(cross(sub(b, a), sub(c, a))) / 2;
      [a, b, c].forEach(function (q) { for (var k = 0; k < 3; k++) { if (q[k] < min[k]) min[k] = q[k]; if (q[k] > max[k]) max[k] = q[k]; } });
    }
    if (!(p.length > 0)) { min = [0, 0, 0]; max = [0, 0, 0]; }
    var polygonal = null, curved = 0;
    if (mesh.exact) {
      // OpenCascade's exact B-rep integrals (the facets only give the bounding box here)
      var ex = mesh.exact;
      return { volume: ex.volume, area: ex.area, centroid: ex.centroid.slice(), bbox: { min: min, max: max }, density: density, mass: ex.volume * density, polygonal: { volume: vol, area: area }, exact: true };
    }
    if (mesh.faces && mesh.faces.length && mesh.faces[0].polys) {
      var polys = [];
      mesh.faces.forEach(function (f) { if (f.polys) for (var j = 0; j < f.polys.length; j++) polys.push(f.polys[j]); });   // (r11/perf11: no concat per face)
      var corr = curveCorrection(polys);
      if (corr.facets) {
        polygonal = { volume: vol, area: area };
        curved = corr.facets;
        vol += corr.volume; area += corr.area;
        cx += corr.moment[0]; cy += corr.moment[1]; cz += corr.moment[2];
      }
    }
    var centroid = vol > 1e-12 ? [cx / vol, cy / vol, cz / vol] : [0, 0, 0];
    var out = { volume: vol, area: area, centroid: centroid, bbox: { min: min, max: max }, density: density, mass: vol * density };
    if (polygonal) { out.polygonal = polygonal; out.curved = curved; }
    return out;
  }


  // ------------------------------------------------------------------ public API (Kernel.*)
  K.extrudeRange = extrudeRange; K.revolveAxis = revolveAxis; K.THROUGH = THROUGH; K.massProps = massProps; K.curveCorrection = curveCorrection;
  K.curveEdges = curveEdges; K.curveSurfaces = curveSurfaces; K.massOptions = massOptions; K.meshCurveInfo = meshCurveInfo;
  K.analyticNormals = analyticNormals;
  // ------------------------------------------------------------------ shared with the other kernel files (Kernel._)
  _.THROUGH = THROUGH; _.buildExtrude = buildExtrude; _.buildRevolve = buildRevolve; _.extrudeRange = extrudeRange; _.mirrorBody = mirrorBody;
  _.prism = prism; _.rotateBody = rotateBody; _.rotatePoint = rotatePoint; _.translateBody = translateBody; _.unionAll = unionAll;
  _.unionTree = unionTree;
})(Kernel, Kernel._);
