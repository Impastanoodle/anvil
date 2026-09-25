// csg.js — constructive solid geometry on BSP trees (after Evan Wallace's csg.js, MIT).
// Solids are lists of convex polygons with outward-facing planes. Booleans clip one tree against the other.
var CSG = (function () {
  'use strict';
  var EPSILON = 1e-5;

  function Vector(x, y, z) { this.x = x; this.y = y; this.z = z; }
  Vector.prototype = {
    clone: function () { return new Vector(this.x, this.y, this.z); },
    negated: function () { return new Vector(-this.x, -this.y, -this.z); },
    plus: function (a) { return new Vector(this.x + a.x, this.y + a.y, this.z + a.z); },
    minus: function (a) { return new Vector(this.x - a.x, this.y - a.y, this.z - a.z); },
    times: function (a) { return new Vector(this.x * a, this.y * a, this.z * a); },
    dividedBy: function (a) { return new Vector(this.x / a, this.y / a, this.z / a); },
    dot: function (a) { return this.x * a.x + this.y * a.y + this.z * a.z; },
    lerp: function (a, t) { return this.plus(a.minus(this).times(t)); },
    length: function () { return Math.sqrt(this.dot(this)); },
    unit: function () { return this.dividedBy(this.length()); },
    cross: function (a) {
      return new Vector(this.y * a.z - this.z * a.y, this.z * a.x - this.x * a.z, this.x * a.y - this.y * a.x);
    }
  };

  function Vertex(pos) { this.pos = pos; }
  Vertex.prototype = {
    clone: function () { return new Vertex(this.pos.clone()); },
    flip: function () { },
    interpolate: function (other, t) { return new Vertex(this.pos.lerp(other.pos, t)); }
  };

  function Plane(normal, w) { this.normal = normal; this.w = w; }
  // Newell's method: robust to collinear leading vertices.
  Plane.fromVertices = function (vs) {
    var nx = 0, ny = 0, nz = 0, n = vs.length;
    for (var i = 0; i < n; i++) {
      var a = vs[i].pos, b = vs[(i + 1) % n].pos;
      nx += (a.y - b.y) * (a.z + b.z);
      ny += (a.z - b.z) * (a.x + b.x);
      nz += (a.x - b.x) * (a.y + b.y);
    }
    var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-12) return null;
    var normal = new Vector(nx / len, ny / len, nz / len);
    return new Plane(normal, normal.dot(vs[0].pos));
  };
  Plane.prototype = {
    clone: function () { return new Plane(this.normal.clone(), this.w); },
    flip: function () { this.normal = this.normal.negated(); this.w = -this.w; },
    splitPolygon: function (polygon, coplanarFront, coplanarBack, front, back) {
      var COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3;
      var polygonType = 0, types = [], i, n = polygon.vertices.length;
      for (i = 0; i < n; i++) {
        var t = this.normal.dot(polygon.vertices[i].pos) - this.w;
        var type = (t < -EPSILON) ? BACK : (t > EPSILON) ? FRONT : COPLANAR;
        polygonType |= type;
        types.push(type);
      }
      switch (polygonType) {
        case COPLANAR:
          (this.normal.dot(polygon.plane.normal) > 0 ? coplanarFront : coplanarBack).push(polygon);
          break;
        case FRONT: front.push(polygon); break;
        case BACK: back.push(polygon); break;
        case SPANNING:
          var f = [], b = [];
          for (i = 0; i < n; i++) {
            var j = (i + 1) % n;
            var ti = types[i], tj = types[j];
            var vi = polygon.vertices[i], vj = polygon.vertices[j];
            if (ti !== BACK) f.push(vi);
            if (ti !== FRONT) b.push(ti !== BACK ? vi.clone() : vi);
            if ((ti | tj) === SPANNING) {
              var tt = (this.w - this.normal.dot(vi.pos)) / this.normal.dot(vj.pos.minus(vi.pos));
              var v = vi.interpolate(vj, tt);
              f.push(v);
              b.push(v.clone());
            }
          }
          // fragments remember the polygon they came from (`_src`, see restoreWhole)
          if (f.length >= 3) { var pf = Polygon.tryCreate(f, polygon.shared); if (pf) { pf._src = polygon._src; front.push(pf); } }
          if (b.length >= 3) { var pb = Polygon.tryCreate(b, polygon.shared); if (pb) { pb._src = polygon._src; back.push(pb); } }
          break;
      }
    }
  };

  function Polygon(vertices, shared, plane) {
    this.vertices = vertices;
    this.shared = shared;
    this.plane = plane || Plane.fromVertices(vertices);
  }
  Polygon.tryCreate = function (vertices, shared) {
    var plane = Plane.fromVertices(vertices);
    if (!plane) return null;
    return new Polygon(vertices, shared, plane);
  };
  Polygon.prototype = {
    clone: function () {
      return new Polygon(this.vertices.map(function (v) { return v.clone(); }), this.shared, this.plane.clone());
    },
    flip: function () {
      this.vertices.reverse();
      this.plane.flip();
    }
  };

  function Node(polygons) {
    this.plane = null;
    this.front = null;
    this.back = null;
    this.polygons = [];
    if (polygons) this.build(polygons);
  }
  Node.prototype = {
    clone: function () {
      var node = new Node();
      node.plane = this.plane && this.plane.clone();
      node.front = this.front && this.front.clone();
      node.back = this.back && this.back.clone();
      node.polygons = this.polygons.map(function (p) { return p.clone(); });
      return node;
    },
    invert: function () {
      for (var i = 0; i < this.polygons.length; i++) this.polygons[i].flip();
      if (this.plane) this.plane.flip();
      if (this.front) this.front.invert();
      if (this.back) this.back.invert();
      var temp = this.front;
      this.front = this.back;
      this.back = temp;
    },
    clipPolygons: function (polygons) {
      if (!this.plane) return polygons.slice();
      var front = [], back = [];
      for (var i = 0; i < polygons.length; i++) this.plane.splitPolygon(polygons[i], front, back, front, back);
      if (this.front) front = this.front.clipPolygons(front);
      if (this.back) back = this.back.clipPolygons(back);
      else {
        // these fragments are inside the solid and are dropped: their source polygon no longer survives whole
        for (var k = 0; k < back.length; k++) if (back[k]._src) back[k]._src.lost = true;
        back = [];
      }
      return front.concat(back);
    },
    clipTo: function (bsp) {
      this.polygons = bsp.clipPolygons(this.polygons);
      if (this.front) this.front.clipTo(bsp);
      if (this.back) this.back.clipTo(bsp);
    },
    allPolygons: function () {
      var polygons = this.polygons.slice();
      if (this.front) polygons = polygons.concat(this.front.allPolygons());
      if (this.back) polygons = polygons.concat(this.back.allPolygons());
      return polygons;
    },
    // Move every polygon whose own bounding box lies outside `bounds` (grown by eps) out of this tree into `out`.
    // The node planes stay, so the tree still classifies space exactly; only the far polygons skip the clipping.
    extractFar: function (bounds, eps, out) {
      if (this.polygons.length) {
        var keep = [];
        for (var i = 0; i < this.polygons.length; i++) {
          var p = this.polygons[i];
          // a far piece leaves the clipped set, so its source (possibly split by the tree build) is not restored whole
          if (polygonFar(p, bounds, eps)) { if (p._src) p._src.lost = true; out.push(p); } else keep.push(p);
        }
        this.polygons = keep;
      }
      if (this.front) this.front.extractFar(bounds, eps, out);
      if (this.back) this.back.extractFar(bounds, eps, out);
    },
    build: function (polygons) {
      if (!polygons.length) return;
      if (!this.plane) this.plane = polygons[(polygons.length / 2) | 0].plane.clone();
      var front = [], back = [];
      for (var i = 0; i < polygons.length; i++) this.plane.splitPolygon(polygons[i], this.polygons, this.polygons, front, back);
      if (front.length) { if (!this.front) this.front = new Node(); this.front.build(front); }
      if (back.length) { if (!this.back) this.back = new Node(); this.back.build(back); }
    }
  };

  // ---------------------------------------------------------------- axis-aligned bounds (the boolean early-out)
  // boundsOf(polygons) -> { min: [x, y, z], max: [x, y, z] }, or null for an empty list.
  function boundsOf(polygons) {
    if (!polygons.length) return null;
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < polygons.length; i++) {
      var vs = polygons[i].vertices;
      for (var j = 0; j < vs.length; j++) {
        var q = vs[j].pos;
        if (q.x < min[0]) min[0] = q.x; if (q.x > max[0]) max[0] = q.x;
        if (q.y < min[1]) min[1] = q.y; if (q.y > max[1]) max[1] = q.y;
        if (q.z < min[2]) min[2] = q.z; if (q.z > max[2]) max[2] = q.z;
      }
    }
    return { min: min, max: max };
  }
  function boundsOverlap(a, b, eps) {
    return a.min[0] <= b.max[0] + eps && a.max[0] >= b.min[0] - eps &&
      a.min[1] <= b.max[1] + eps && a.max[1] >= b.min[1] - eps &&
      a.min[2] <= b.max[2] + eps && a.max[2] >= b.min[2] - eps;
  }
  // True when the polygon's own bounding box is clear of `b` grown by eps on some axis (touching counts as near).
  function polygonFar(p, b, eps) {
    var vs = p.vertices, minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
    for (var j = 0; j < vs.length; j++) {
      var q = vs[j].pos;
      if (q.x < minx) minx = q.x; if (q.x > maxx) maxx = q.x;
      if (q.y < miny) miny = q.y; if (q.y > maxy) maxy = q.y;
      if (q.z < minz) minz = q.z; if (q.z > maxz) maxz = q.z;
    }
    return minx > b.max[0] + eps || maxx < b.min[0] - eps ||
      miny > b.max[1] + eps || maxy < b.min[1] - eps ||
      minz > b.max[2] + eps || maxz < b.min[2] - eps;
  }
  // The near/far tolerance for a boolean of two solids: at least the plane-classification EPSILON (a polygon that
  // could be judged coplanar with the other solid's face must be clipped), plus a hair of the model's extent.
  function farEps(ba, bb) {
    var ext = 0;
    for (var k = 0; k < 3; k++) ext = Math.max(ext, Math.max(ba.max[k], bb.max[k]) - Math.min(ba.min[k], bb.min[k]));
    return EPSILON + 1e-9 * ext;
  }
  function clonePolys(polygons) { return polygons.map(function (p) { return p.clone(); }); }

  // ---------------------------------------------------------------- splitting only where a solid is really cut
  // The BSP clip splits a polygon by every plane of the other tree it passes through, most of which belong to faces
  // nowhere near it, so a polygon that ends up wholly kept can come out as dozens of fragments (and the next boolean
  // pays for all of them). Each operand polygon is therefore cloned with a source record (`_src`), which every
  // fragment inherits (splitPolygon) and which clipPolygons marks `lost` when it drops a fragment. restoreWhole then
  // replaces the fragments of every source that lost nothing by one copy of the source polygon: the fragments tile
  // it exactly (a split partitions a convex polygon; only zero-area slivers are ever discarded by tryCreate), so the
  // point set, the volume and the classification of later booleans are unchanged, while a polygon stays split only
  // where material was actually removed from it: inside the overlap with the other solid.
  function taggedClones(polygons) {
    var out = new Array(polygons.length);
    for (var i = 0; i < polygons.length; i++) {
      var c = polygons[i].clone();
      c._src = { orig: polygons[i], lost: false, done: false };
      out[i] = c;
    }
    return out;
  }
  // CSG.options.restoreWhole = false turns this off (every fragment is kept, as before) for benchmarks and debugging.
  // CSG.options.nearTrees = false turns off the near-region trees below; nearRatio is the largest share of an
  // operand's polygons that may lie near the other one for its tree to be built from the near part only.
  var OPTIONS = { restoreWhole: true, nearTrees: true, nearRatio: 0.5 };
  function restoreWhole(polygons) {
    if (!OPTIONS.restoreWhole) return untag(polygons);
    var out = [];
    for (var i = 0; i < polygons.length; i++) {
      var p = polygons[i], r = p._src;
      p._src = null; // no record outlives the boolean (it would keep the operands alive)
      if (!r || r.lost) { out.push(p); continue; }
      if (r.done) continue;
      r.done = true;
      var q = r.orig.clone();
      if (q.plane.normal.dot(p.plane.normal) < 0) q.flip(); // a subtract hands the tool's faces back inverted
      out.push(q);
    }
    return out;
  }
  function untag(polygons) { for (var i = 0; i < polygons.length; i++) polygons[i]._src = null; return polygons; }

  // ---------------------------------------------------------------- trees built from the near region only
  // The classic boolean builds a BSP tree from every polygon of both solids, although only the polygons near the
  // other solid are ever clipped. A tree built from a subset of a solid's polygons does not classify space (its
  // leaves assume a closed surface), so the near part is closed first: X' = X ∩ K, where K is the bounding box of the
  // polygons that will be clipped against X, grown by a margin. X' is bounded by X's polygons clipped to K plus the
  // parts of K's six faces that lie inside X ("caps"). Within K, X' and X are the same solid with the same faces, so
  // a tree of X' clips everything in K exactly as a tree of X would, coplanar faces included; the polygons clipped
  // against it stay at least `margin` inside K, clear of the caps.
  // The caps are found by splitting K's faces with the tree of X's clipped polygons: every leaf cell of that tree
  // meets K in a convex region that X's surface does not cross, so one point per leaf decides inside or outside for
  // all cap pieces in it. That point is classified exactly by a ray cast against all of X (signed crossing count,
  // two directions that must agree). Anything doubtful (a cap coplanar with a face, a ray grazing an edge,
  // directions disagreeing) returns null and the boolean falls back to the classic full trees.
  var STATS = { near: 0, classic: 0, fallback: 0 };
  var RAY_DIRS = [[0.5377, 0.6214, 0.5698], [-0.6023, 0.4719, 0.6441], [0.4402, -0.7131, 0.5456], [0.7071, 0.1234, -0.6963]].map(function (d) {
    return new Vector(d[0], d[1], d[2]).unit();
  });

  function growBounds(b, m) {
    return { min: [b.min[0] - m, b.min[1] - m, b.min[2] - m], max: [b.max[0] + m, b.max[1] + m, b.max[2] + m] };
  }
  // The six faces of box b as outward-facing quads.
  function boxPolygons(b) {
    var x = [b.min[0], b.max[0]], y = [b.min[1], b.max[1]], z = [b.min[2], b.max[2]];
    function V(i) { return new Vertex(new Vector(x[i & 1], y[(i >> 1) & 1], z[(i >> 2) & 1])); }
    return [[0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3], [0, 2, 3, 1], [4, 5, 7, 6]].map(function (f) {
      return new Polygon(f.map(V));
    });
  }
  // The six outward face planes of box b.
  function boxPlanes(b) {
    return [new Plane(new Vector(-1, 0, 0), -b.min[0]), new Plane(new Vector(1, 0, 0), b.max[0]),
      new Plane(new Vector(0, -1, 0), -b.min[1]), new Plane(new Vector(0, 1, 0), b.max[1]),
      new Plane(new Vector(0, 0, -1), -b.min[2]), new Plane(new Vector(0, 0, 1), b.max[2])];
  }
  // Clones of X's polygons that meet box K, clipped to K. null when a polygon lies in one of K's face planes.
  function clipToBox(polygons, K, planes) {
    var out = [];
    for (var i = 0; i < polygons.length; i++) {
      var p = polygons[i];
      if (polygonFar(p, K, 0)) continue;
      var cur = [p.clone()];
      for (var k = 0; k < 6 && cur.length; k++) {
        var cop = [], back = [];
        planes[k].splitPolygon(cur[0], cop, cop, [], back);
        if (cop.length) return null;
        cur = back;
      }
      if (cur.length) out.push(cur[0]);
    }
    return out;
  }
  // Split `polygons` down the tree and collect the pieces that reach each empty child (one group per leaf cell).
  // false when a piece is coplanar with a node plane.
  function leafGroups(node, polygons, groups) {
    var cop = [], front = [], back = [];
    for (var i = 0; i < polygons.length; i++) node.plane.splitPolygon(polygons[i], cop, cop, front, back);
    if (cop.length) return false;
    if (front.length) { if (node.front) { if (!leafGroups(node.front, front, groups)) return false; } else groups.push(front); }
    if (back.length) { if (node.back) { if (!leafGroups(node.back, back, groups)) return false; } else groups.push(back); }
    return true;
  }
  function polygonArea(p) {
    var vs = p.vertices, s = new Vector(0, 0, 0);
    for (var i = 0; i < vs.length; i++) s = s.plus(vs[i].pos.cross(vs[(i + 1) % vs.length].pos));
    return Math.abs(s.dot(p.plane.normal)) / 2;
  }
  function centroid(p) {
    var c = new Vector(0, 0, 0), vs = p.vertices;
    for (var i = 0; i < vs.length; i++) c = c.plus(vs[i].pos);
    return c.dividedBy(vs.length);
  }
  // Flat per-polygon data for ray casts, built once per solid: plane (nx, ny, nz, w) and bounding box.
  function rayData(X) {
    if (X._ray && X._ray.polys === X.polygons) return X._ray;
    var P = X.polygons, n = P.length, pl = new Float64Array(4 * n), bx = new Float64Array(6 * n);
    for (var i = 0; i < n; i++) {
      var p = P[i], nn = p.plane.normal, vs = p.vertices;
      pl[4 * i] = nn.x; pl[4 * i + 1] = nn.y; pl[4 * i + 2] = nn.z; pl[4 * i + 3] = p.plane.w;
      var x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (var j = 0; j < vs.length; j++) {
        var q = vs[j].pos;
        if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x;
        if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
        if (q.z < z0) z0 = q.z; if (q.z > z1) z1 = q.z;
      }
      bx[6 * i] = x0; bx[6 * i + 1] = y0; bx[6 * i + 2] = z0; bx[6 * i + 3] = x1; bx[6 * i + 4] = y1; bx[6 * i + 5] = z1;
    }
    X._ray = { polys: P, pl: pl, bx: bx };
    return X._ray;
  }
  // Signed crossing count of the ray p + t·d (t > 0) with the solid's polygons: +1 per exit, -1 per entry, so 1 for
  // a point inside a closed outward-facing solid and 0 outside. null when the ray passes within tol of an edge or
  // p lies within tol of a face (the count could be off by one).
  function rayCount(R, p, d, tol) {
    var count = 0, pl = R.pl, bx = R.bx, px = p.x, py = p.y, pz = p.z, dx = d.x, dy = d.y, dz = d.z;
    for (var i = 0, n = R.polys.length; i < n; i++) {
      var nx = pl[4 * i], ny = pl[4 * i + 1], nz = pl[4 * i + 2], den = nx * dx + ny * dy + nz * dz;
      if (den < 1e-9 && den > -1e-9) continue;
      var t = (pl[4 * i + 3] - (nx * px + ny * py + nz * pz)) / den;
      if (t < -tol) continue;
      var hx = px + t * dx, hy = py + t * dy, hz = pz + t * dz, o = 6 * i;
      if (hx < bx[o] - tol || hx > bx[o + 3] + tol || hy < bx[o + 1] - tol || hy > bx[o + 4] + tol || hz < bx[o + 2] - tol || hz > bx[o + 5] + tol) continue;
      var vs = R.polys[i].vertices, inside = true, edge = false, m = vs.length;
      for (var j = 0; j < m; j++) {
        var a = vs[j].pos, b = vs[j + 1 < m ? j + 1 : 0].pos;
        var ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z, el = Math.sqrt(ex * ex + ey * ey + ez * ez);
        if (el < 1e-15) continue;
        var wx = hx - a.x, wy = hy - a.y, wz = hz - a.z;
        // distance of h from the edge line, positive on the polygon's side
        var s = ((ey * wz - ez * wy) * nx + (ez * wx - ex * wz) * ny + (ex * wy - ey * wx) * nz) / el;
        if (s < -tol) { inside = false; break; }
        if (s <= tol) edge = true;
      }
      if (!inside) continue;
      if (edge || t <= tol) return null;
      count += den > 0 ? 1 : -1;
    }
    return count;
  }
  // Exact point-in-solid for a point known to be off the surface: two ray directions must agree on 0 or 1.
  function insideByRays(R, p, tol) {
    var found = null;
    for (var k = 0; k < RAY_DIRS.length; k++) {
      var c = rayCount(R, p, RAY_DIRS[k], tol);
      if (c !== 0 && c !== 1) continue;
      if (found === null) found = c;
      else return found === c ? c === 1 : undefined;
    }
    return undefined;
  }
  // BSP tree of X ∩ K (see above), or null when it cannot be built with certainty.
  function nearTree(X, K, tol) {
    var polys = clipToBox(X.polygons, K, boxPlanes(K));
    if (!polys) return null;
    var tree = new Node(polys), groups = [];
    var caps = boxPolygons(K);
    if (tree.plane) { if (!leafGroups(tree, caps, groups)) return null; } else groups.push(caps);
    if (groups.length > 256) return null; // too many probes for this to pay off
    var keep = [], R = rayData(X);
    for (var g = 0; g < groups.length; g++) {
      var best = null, bestA = -1;
      for (var i = 0; i < groups[g].length; i++) { var a = polygonArea(groups[g][i]); if (a > bestA) { bestA = a; best = groups[g][i]; } }
      var ins = insideByRays(R, centroid(best), tol);
      if (ins === undefined) return null;
      if (ins) keep = keep.concat(groups[g]);
    }
    if (keep.length) tree.build(keep);
    return tree.plane ? tree : null;
  }
  // Clip trees for the two operands: a near tree for an operand when few of its polygons are near the other one,
  // else the full tree. null when neither operand has a near tree worth building (or one failed): use the classic.
  function nearTrees(A, B, ba, bb, nearA, nearB) {
    var ext = 0;
    for (var k = 0; k < 3; k++) ext = Math.max(ext, Math.max(ba.max[k], bb.max[k]) - Math.min(ba.min[k], bb.min[k]));
    // clipped polygons stay >= margin inside the box; the margin is odd so that faces rarely sit on a box plane
    var margin = 97 * EPSILON + 1.37e-6 * ext, tol = 1e-9 * ext + 1e-10;
    var bNearA = boundsOf(nearA), bNearB = boundsOf(nearB);
    var useA = nearB.length && A.polygons.length * OPTIONS.nearRatio >= countNear(A.polygons, bNearB, margin);
    var useB = nearA.length && B.polygons.length * OPTIONS.nearRatio >= countNear(B.polygons, bNearA, margin);
    if (!useA && !useB) return null;
    var tA = useA ? nearTree(A, growBounds(bNearB, margin), tol) : new Node(clonePolys(A.polygons));
    var tB = tA && (useB ? nearTree(B, growBounds(bNearA, margin), tol) : new Node(clonePolys(B.polygons)));
    if (!tA || !tB) { STATS.fallback++; return null; }
    STATS.near++;
    return { a: tA, b: tB };
  }
  function countNear(polygons, K, m) {
    if (!K) return 0;
    var n = 0;
    for (var i = 0; i < polygons.length; i++) if (!polygonFar(polygons[i], K, m)) n++;
    return n;
  }
  // Split an operand's polygons into those near the other operand's box (clipped later) and the far ones.
  function splitNear(polygons, other, eps) {
    var near = [], far = [];
    for (var i = 0; i < polygons.length; i++) (polygonFar(polygons[i], other, eps) ? far : near).push(polygons[i]);
    return { near: near, far: far };
  }
  // Everything a near-tree boolean needs, or null for the classic path: tagged clones of the near polygons of both
  // operands (n.a, n.b), the far ones (n.farA, n.farB, uncloned) and the clip trees (n.t.a, n.t.b). Only with
  // restoreWhole on: with it off (the flat-pattern region merge) every boolean is the classic one, fragments and all.
  function nearOperands(A, B, ba, bb, eps) {
    if (!OPTIONS.nearTrees || !OPTIONS.restoreWhole) return null;
    var sa = splitNear(A.polygons, bb, eps), sb = splitNear(B.polygons, ba, eps);
    var t = nearTrees(A, B, ba, bb, sa.near, sb.near);
    if (!t) return null;
    return { a: taggedClones(sa.near), b: taggedClones(sb.near), farA: sa.far, farB: sb.far, t: t };
  }
  function flipAll(polygons) { for (var i = 0; i < polygons.length; i++) polygons[i].flip(); return polygons; }

  function CSG() { this.polygons = []; this.bounds = null; }
  CSG.fromPolygons = function (polygons) {
    var csg = new CSG();
    csg.polygons = polygons;
    return csg;
  };
  // The booleans below are the classic BSP algorithm with a bounding-box early-out: a polygon whose own bounding box
  // lies clear of the other solid's bounding box is never clipped and is put back (or dropped) unchanged, since no
  // part of it can be inside the other solid. Two solids whose boxes do not meet skip the trees altogether. When few
  // of an operand's polygons are near the other one, its tree is built from the near region only (nearOperands);
  // the clipping then runs as lists, in the same order as the classic tree sequence. Otherwise both trees are built
  // from every polygon (so each one classifies space exactly) and the far polygons are lifted out before clipping.
  CSG.prototype = {
    clone: function () {
      var c = CSG.fromPolygons(clonePolys(this.polygons));
      c.bounds = this.bounds;
      return c;
    },
    toPolygons: function () { return this.polygons; },
    // Axis-aligned bounding box { min: [x, y, z], max: [x, y, z] } (null for an empty solid), cached on the instance.
    // Every operation that changes geometry returns a new CSG, so the cache never goes stale.
    getBounds: function () {
      if (!this.bounds) this.bounds = boundsOf(this.polygons);
      return this.bounds;
    },
    union: function (csg) {
      var ba = this.getBounds(), bb = csg.getBounds(), eps = ba && bb ? farEps(ba, bb) : 0;
      if (!ba || !bb) return CSG.fromPolygons(clonePolys(this.polygons).concat(clonePolys(csg.polygons))); // an operand is empty
      if (!boundsOverlap(ba, bb, eps)) return CSG.fromPolygons(clonePolys(this.polygons).concat(clonePolys(csg.polygons)));
      var n = nearOperands(this, csg, ba, bb, eps);
      if (n) {
        // A outside B, plus B outside A with B's faces coplanar with A's dropped (the classic sequence as lists)
        var bk = flipAll(n.t.a.clipPolygons(flipAll(n.t.a.clipPolygons(n.b))));
        return CSG.fromPolygons(restoreWhole(n.t.b.clipPolygons(n.a).concat(bk)).concat(clonePolys(n.farA), clonePolys(n.farB)));
      }
      STATS.classic++;
      var a = new Node(taggedClones(this.polygons));
      var b = new Node(taggedClones(csg.polygons));
      var far = [];
      a.extractFar(bb, eps, far); b.extractFar(ba, eps, far);
      a.clipTo(b);
      b.clipTo(a);
      b.invert();
      b.clipTo(a);
      b.invert();
      a.build(b.allPolygons());
      return CSG.fromPolygons(restoreWhole(a.allPolygons()).concat(untag(far)));
    },
    subtract: function (csg) {
      var ba = this.getBounds(), bb = csg.getBounds(), eps = ba && bb ? farEps(ba, bb) : 0;
      // nothing minus anything is nothing (the trees would hand back the tool's faces inverted)
      if (!ba || !bb || !boundsOverlap(ba, bb, eps)) return CSG.fromPolygons(ba ? clonePolys(this.polygons) : []);
      var n = nearOperands(this, csg, ba, bb, eps);
      if (n) {
        // A outside B, plus B inside A flipped: the classic sequence with ~A = the inverted tree of A
        n.t.a.invert();
        var ak = flipAll(n.t.b.clipPolygons(flipAll(n.a)));
        var bk = n.t.a.clipPolygons(flipAll(n.t.a.clipPolygons(n.b)));
        return CSG.fromPolygons(restoreWhole(ak.concat(bk)).concat(clonePolys(n.farA)));
      }
      STATS.classic++;
      var a = new Node(taggedClones(this.polygons));
      var b = new Node(taggedClones(csg.polygons));
      var far = [];
      // A's far polygons survive untouched; B's far polygons lie outside A and take nothing away
      a.extractFar(bb, eps, far); b.extractFar(ba, eps, []);
      a.invert();
      a.clipTo(b);
      b.clipTo(a);
      b.invert();
      b.clipTo(a);
      b.invert();
      a.build(b.allPolygons());
      a.invert();
      return CSG.fromPolygons(restoreWhole(a.allPolygons()).concat(untag(far)));
    },
    intersect: function (csg) {
      var ba = this.getBounds(), bb = csg.getBounds(), eps = ba && bb ? farEps(ba, bb) : 0;
      if (!ba || !bb || !boundsOverlap(ba, bb, eps)) return CSG.fromPolygons([]);
      var n = nearOperands(this, csg, ba, bb, eps);
      if (n) {
        n.t.a.invert();
        var b1 = flipAll(n.t.a.clipPolygons(n.b));
        n.t.b.invert();
        var ak = flipAll(n.t.b.clipPolygons(flipAll(n.a)));
        return CSG.fromPolygons(restoreWhole(ak.concat(flipAll(n.t.a.clipPolygons(b1)))));
      }
      STATS.classic++;
      var a = new Node(taggedClones(this.polygons));
      var b = new Node(taggedClones(csg.polygons));
      // far polygons of either solid lie outside the other and cannot be part of the intersection
      a.extractFar(bb, eps, []); b.extractFar(ba, eps, []);
      a.invert();
      b.clipTo(a);
      b.invert();
      a.clipTo(b);
      b.clipTo(a);
      a.build(b.allPolygons());
      a.invert();
      return CSG.fromPolygons(restoreWhole(a.allPolygons()));
    },
    inverse: function () {
      var csg = this.clone();
      csg.polygons.forEach(function (p) { p.flip(); });
      return csg;
    },
    // Apply a point transform. `flip` must be true for reflections (negative determinant).
    transform: function (fn, flip) {
      var out = [];
      for (var i = 0; i < this.polygons.length; i++) {
        var p = this.polygons[i];
        var vs = p.vertices.map(function (v) { return new Vertex(fn(v.pos)); });
        if (flip) vs.reverse();
        var np = Polygon.tryCreate(vs, p.shared);
        if (np) out.push(np);
      }
      return CSG.fromPolygons(out);
    },
    // Keep the part of the solid on the front side of a plane (normal · p >= w), closed by a planar cap. Built as the
    // intersection with a box whose one face is the plane and which encloses the solid otherwise, so the result is
    // watertight and coplanar faces are handled by the ordinary boolean.
    clipByPlane: function (normal, w) {
      var n = normal instanceof Vector ? normal : new Vector(normal[0], normal[1], normal[2]);
      var l = n.length();
      if (!(l > 0) || !this.polygons.length) return this;
      n = n.dividedBy(l); w = w / l;
      var min = null, max = null;
      this.polygons.forEach(function (p) {
        p.vertices.forEach(function (v) {
          var q = v.pos;
          if (!min) { min = q.clone(); max = q.clone(); return; }
          min.x = Math.min(min.x, q.x); min.y = Math.min(min.y, q.y); min.z = Math.min(min.z, q.z);
          max.x = Math.max(max.x, q.x); max.y = Math.max(max.y, q.y); max.z = Math.max(max.z, q.z);
        });
      });
      var c = min.plus(max).times(0.5), r = max.minus(min).length() / 2;
      var D = 2 * r + Math.abs(c.dot(n) - w) + 2;
      var a = Math.abs(n.x) < 0.9 ? new Vector(1, 0, 0) : new Vector(0, 1, 0);
      a = a.minus(n.times(a.dot(n))).unit();
      var b = n.cross(a);
      var cb = c.plus(n.times(w - c.dot(n) + D / 2)); // the box spans [w, w + D] along n
      function corner(i) {
        return new Vertex(cb.plus(a.times((i & 1) ? D : -D)).plus(b.times((i & 2) ? D : -D)).plus(n.times((i & 4) ? D / 2 : -D / 2)));
      }
      var polys = [[0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3], [0, 2, 3, 1], [4, 5, 7, 6]].map(function (f) {
        return new Polygon(f.map(corner));
      });
      var box = CSG.fromPolygons(polys);
      if (box.volume() < 0) polys.forEach(function (p) { p.flip(); });
      return this.intersect(box);
    },
    // Point-in-solid classifier from the BSP tree: descend to the leaf region holding the point; a region behind a
    // plane with nothing further back is inside the solid (the same convention clipPolygons uses). Points within
    // EPSILON of a face count as inside. Build the tester once and reuse it for many probes.
    pointTester: function () {
      var tree = new Node(this.polygons.slice());
      function inside(node, p) {
        var t = node.plane.normal.dot(p) - node.plane.w;
        if (t > EPSILON) return node.front ? inside(node.front, p) : false;
        if (t < -EPSILON) return node.back ? inside(node.back, p) : true;
        return (node.front ? inside(node.front, p) : false) || (node.back ? inside(node.back, p) : true);
      }
      return function (p) {
        if (!tree.plane) return false;
        var v = p instanceof Vector ? p : new Vector(p[0], p[1], p[2]);
        return inside(tree, v);
      };
    },
    containsPoint: function (p) { return this.pointTester()(p); },
    // Signed volume via the divergence theorem (positive for outward-facing solids).
    volume: function () {
      var vol = 0;
      for (var i = 0; i < this.polygons.length; i++) {
        var vs = this.polygons[i].vertices;
        for (var j = 1; j + 1 < vs.length; j++) {
          var a = vs[0].pos, b = vs[j].pos, c = vs[j + 1].pos;
          vol += a.dot(b.cross(c)) / 6;
        }
      }
      return vol;
    }
  };

  // ---------------------------------------------------------------- structured-clone serialization (Web Workers)
  // pack() -> a plain object of typed arrays that postMessage can clone or transfer:
  //   { verts: Float64Array(3·V)  every vertex of every polygon in order (x, y, z),
  //     counts: Int32Array(P)     vertex count of each polygon,
  //     planes: Float64Array(4·P) each polygon's plane as nx, ny, nz, w (copied, never recomputed),
  //     shared: Array(P) | null   the polygons' `shared` tags (feature ids or undefined), null when none is set }
  // unpack(obj) rebuilds the same polygons with the same vertex order and planes, so volume() of the round trip is
  // bit-identical and booleans on the result behave exactly as on the original.
  CSG.prototype.pack = function () {
    var polys = this.polygons, P = polys.length, V = 0, i, j;
    for (i = 0; i < P; i++) V += polys[i].vertices.length;
    var verts = new Float64Array(3 * V), counts = new Int32Array(P), planes = new Float64Array(4 * P);
    var shared = null, k = 0;
    for (i = 0; i < P; i++) {
      var p = polys[i], vs = p.vertices;
      counts[i] = vs.length;
      for (j = 0; j < vs.length; j++) {
        var q = vs[j].pos;
        verts[k++] = q.x; verts[k++] = q.y; verts[k++] = q.z;
      }
      planes[4 * i] = p.plane.normal.x; planes[4 * i + 1] = p.plane.normal.y; planes[4 * i + 2] = p.plane.normal.z; planes[4 * i + 3] = p.plane.w;
      if (p.shared !== undefined) {
        if (!shared) { shared = new Array(P); for (j = 0; j < P; j++) shared[j] = undefined; }
        shared[i] = p.shared;
      }
    }
    return { verts: verts, counts: counts, planes: planes, shared: shared };
  };
  CSG.unpack = function (obj) {
    var counts = obj.counts, verts = obj.verts, planes = obj.planes, shared = obj.shared || null;
    var polys = [], k = 0;
    for (var i = 0; i < counts.length; i++) {
      var vs = [];
      for (var j = 0; j < counts[i]; j++) { vs.push(new Vertex(new Vector(verts[k], verts[k + 1], verts[k + 2]))); k += 3; }
      var plane = new Plane(new Vector(planes[4 * i], planes[4 * i + 1], planes[4 * i + 2]), planes[4 * i + 3]);
      polys.push(new Polygon(vs, shared ? shared[i] : undefined, plane));
    }
    return CSG.fromPolygons(polys);
  };
  // The ArrayBuffers inside a packed solid, for postMessage's transfer list (the sender's copy is detached after
  // the transfer, so only pass a packed object you are done with).
  CSG.packTransferables = function (packed) {
    return [packed.verts.buffer, packed.counts.buffer, packed.planes.buffer];
  };

  CSG.Vector = Vector;
  CSG.Vertex = Vertex;
  CSG.Plane = Plane;
  CSG.Polygon = Polygon;
  CSG.Node = Node;
  CSG.options = OPTIONS;
  // Counters of the boolean paths taken since load (near-region trees, classic full trees, near attempts that fell
  // back to the classic because a probe was doubtful); tests and benchmarks reset them by assigning 0.
  CSG.stats = STATS;
  return CSG;
})();
