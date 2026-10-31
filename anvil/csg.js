// csg.js — constructive solid geometry on BSP trees (after Evan Wallace's csg.js, MIT).
// Solids are lists of convex polygons with outward-facing planes. Booleans clip one tree against the other.
var CSG = (function () {
  'use strict';
  var EPSILON = 1e-5;
  // splitPolygon counts vertices it classifies as on a plane while they lie more than FUZZ off it (healCracks, rfFL)
  var FUZZ = 1e-9, FUZZY = 0, XS_T = [], EXACT = false, HEAL_LEFT = 0;

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

  // Centre (vertex mean), and the margin a plane distance must exceed for the whole polygon to lie on one side:
  // radius + EPSILON + a guard. Cached on the polygon as `_bs` (vertices never move once a polygon exists; flips
  // reverse their order, clones share the record).
  function boundingSphere(vs) {
    var n = vs.length, cx = 0, cy = 0, cz = 0, i, q;
    for (i = 0; i < n; i++) { q = vs[i].pos; cx += q.x; cy += q.y; cz += q.z; }
    cx /= n; cy /= n; cz /= n;
    var r2 = 0;
    for (i = 0; i < n; i++) { q = vs[i].pos; var dx = q.x - cx, dy = q.y - cy, dz = q.z - cz, d2 = dx * dx + dy * dy + dz * dz; if (d2 > r2) r2 = d2; }
    var r = Math.sqrt(r2);
    return { x: cx, y: cy, z: cz, m: r * (1 + 1e-12) + EPSILON + 1e-9 };
  }

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
  // the point where the plane cuts segment a-b, interpolated from a and from b (the same arithmetic as a.interpolate(b, t)
  // with t from a, and b.interpolate(a, t') with t' from b); the lexicographically smaller of the two, so both polygons
  // sharing the edge get the bitwise-same point whichever way they walk it (rfFQ / lane FU)
  function splitPoint(pl, a, b) {
    var n = pl.normal, A = a.pos, B = b.pos, nx = n.x, ny = n.y, nz = n.z;
    var abx = B.x - A.x, aby = B.y - A.y, abz = B.z - A.z, bax = A.x - B.x, bay = A.y - B.y, baz = A.z - B.z;
    var t1 = (pl.w - (nx * A.x + ny * A.y + nz * A.z)) / (nx * abx + ny * aby + nz * abz);
    var t2 = (pl.w - (nx * B.x + ny * B.y + nz * B.z)) / (nx * bax + ny * bay + nz * baz);
    var x1 = A.x + abx * t1, y1 = A.y + aby * t1, z1 = A.z + abz * t1, x2 = B.x + bax * t2, y2 = B.y + bay * t2, z2 = B.z + baz * t2;
    if (x2 < x1 || (x2 === x1 && (y2 < y1 || (y2 === y1 && z2 < z1)))) return new Vertex(new Vector(x2, y2, z2));
    return new Vertex(new Vector(x1, y1, z1));
  }
  Plane.prototype = {
    clone: function () { return new Plane(this.normal.clone(), this.w); },
    flip: function () { this.normal = this.normal.negated(); this.w = -this.w; },
    splitPolygon: function (polygon, coplanarFront, coplanarBack, front, back) {
      // Bounding-sphere shortcut: a polygon whose sphere lies more than EPSILON (plus a guard far above rounding
      // error) clear of the plane has every vertex classified the same way, so one dot product decides it. Exactly
      // the classification the vertex loop below would make; it is ~80 % of the calls in a big boolean.
      if (OPTIONS.sphereTest) {
        var bs = polygon._bs || (polygon._bs = boundingSphere(polygon.vertices));
        var nn = this.normal, dc = nn.x * bs.x + nn.y * bs.y + nn.z * bs.z - this.w;
        if (dc > bs.m) { front.push(polygon); return; }
        if (dc < -bs.m) { back.push(polygon); return; }
      }
      var COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3;
      var polygonType = 0, types = [], i, n = polygon.vertices.length, band = 0, ts = XS_T;
      for (i = 0; i < n; i++) {
        var t = this.normal.dot(polygon.vertices[i].pos) - this.w;
        var type = (t < -EPSILON) ? BACK : (t > EPSILON) ? FRONT : COPLANAR;
        // a vertex taken as on the plane although it is not (rfFL): the boolean may leave a crack there
        if (type === COPLANAR && (t > FUZZ || t < -FUZZ)) { FUZZY++; band++; }
        polygonType |= type;
        types.push(type);
        ts[i] = t;
      }
      // rfFQ: on a retry (retryExact), the vertices in the band take their true side, so the polygon is split exactly
      // where it crosses the plane (only a vertex within FUZZ stays on it)
      if (band && EXACT) {
        polygonType = 0;
        for (i = 0; i < n; i++) {
          if (types[i] === COPLANAR) { var tb = ts[i]; if (tb > FUZZ) types[i] = FRONT; else if (tb < -FUZZ) types[i] = BACK; }
          polygonType |= types[i];
        }
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
              // rfFQ / lane FU: the two polygons sharing this edge walk it in opposite directions, and a split point
              // interpolated from either end can differ in the last bit (twins 5e-17 apart round to different cells of
              // the meshes' 1e-6 weld grid: open and non-manifold edges, the 14 ga L bracket): splitPoint is symmetric
              var v = splitPoint(this, vi, vj);
              f.push(v);
              b.push(v.clone());
            }
          }
          // fragments remember the polygon they came from (`_src`, see restoreWhole)
          // fragments also inherit the analytic surface record (`surf`) of the face they were cut from
          if (f.length >= 3) { var pf = Polygon.tryCreate(f, polygon.shared); if (pf) { pf._src = polygon._src; pf.surf = polygon.surf; if (polygon.face != null) pf.face = polygon.face; if (polygon.part != null) pf.part = polygon.part; front.push(pf); } }
          if (b.length >= 3) { var pb = Polygon.tryCreate(b, polygon.shared); if (pb) { pb._src = polygon._src; pb.surf = polygon.surf; if (polygon.face != null) pb.face = polygon.face; if (polygon.part != null) pb.part = polygon.part; back.push(pb); } }
          break;
      }
    }
  };

  // `surf` (optional): the analytic surface record of a facet that approximates a curved face (see kernel.js,
  // "true curves"); null for planar faces. Splits, clones, transforms and pack / unpack carry it.
  // `face` (optional): the B-rep face a polygon belongs to when the solid came from OpenCascade (ui-occt.js); splits,
  // clones and transforms carry it, and meshing never merges polygons of different faces.
  // `part` (optional, r10/asmfaces10): the part a polygon belongs to inside an assembly body (assembly.js tags each
  // placed component); splits, clones, transforms and pack / unpack carry it, and meshing never merges across parts.
  function Polygon(vertices, shared, plane) {
    this.vertices = vertices;
    this.shared = shared;
    this.plane = plane || Plane.fromVertices(vertices);
    this.surf = null;
    this._bs = null;   // bounding sphere, filled by the first split test (boundingSphere)
  }
  Polygon.tryCreate = function (vertices, shared) {
    var plane = Plane.fromVertices(vertices);
    if (!plane) return null;
    return new Polygon(vertices, shared, plane);
  };
  Polygon.prototype = {
    clone: function () {
      var p = new Polygon(this.vertices.map(function (v) { return v.clone(); }), this.shared, this.plane.clone());
      p.surf = this.surf;
      if (this._bs) p._bs = this._bs;
      if (this.face != null) p.face = this.face;
      if (this.part != null) p.part = this.part;
      return p;
    },
    flip: function () {
      this.vertices.reverse();
      this.plane.flip();
    }
  };

  // fn(node) for every node of the tree, pre-order, front subtree before back (the order the recursive walks had);
  // fn runs before the node's children are read, so it may swap them (invert)
  function eachNode(root, fn) {
    var stack = [root];
    while (stack.length) {
      var node = stack.pop();
      fn(node);
      if (node.back) stack.push(node.back);
      if (node.front) stack.push(node.front);
    }
  }
  function Node(polygons) {
    this.plane = null;
    this.front = null;
    this.back = null;
    this.polygons = [];
    if (polygons) this.build(polygons);
  }
  Node.prototype = {
    // Every walk over the tree is iterative (eachNode: pre-order, front before back, as the recursion went): the tree
    // of a finely faceted solid can be thousands of nodes deep (rfFL: the DISH at maxAngle 3 overflowed the stack).
    clone: function () {
      var root = new Node(), stack = [this, root];
      while (stack.length) {
        var node = stack.pop(), src = stack.pop();
        node.plane = src.plane && src.plane.clone();
        node.polygons = src.polygons.map(function (p) { return p.clone(); });
        if (src.back) { node.back = new Node(); stack.push(src.back, node.back); }
        if (src.front) { node.front = new Node(); stack.push(src.front, node.front); }
      }
      return root;
    },
    invert: function () {
      eachNode(this, function (node) {
        for (var i = 0; i < node.polygons.length; i++) node.polygons[i].flip();
        if (node.plane) node.plane.flip();
        var temp = node.front;
        node.front = node.back;
        node.back = temp;
      });
    },
    clipPolygons: function (polygons) {
      var out = [];
      this.clipInto(polygons, out);
      return out;
    },
    // clipPolygons appending to `out` (front results first, then back results: the order of the old front.concat(back)
    // recursion), so a deep tree (a convex solid's BSP is a chain as deep as its face count) no longer copies the
    // whole surviving list at every level.
    // Iterative (an explicit stack, front before back as the recursion went): a tree of a finely faceted solid can be
    // thousands of nodes deep (rfFL: the DISH at maxAngle 3 overflowed the call stack).
    clipInto: function (polygons, out) {
      var i, stack = [this, polygons];
      while (stack.length) {
        var list = stack.pop(), node = stack.pop();
        if (!node.plane) { for (i = 0; i < list.length; i++) out.push(list[i]); continue; }
        if (!list.length) continue;
        var front = [], back = [];
        for (i = 0; i < list.length; i++) node.plane.splitPolygon(list[i], front, back, front, back);
        if (node.back) stack.push(node.back, back);
        else {
          // these fragments are inside the solid and are dropped: their source polygon no longer survives whole
          for (var k = 0; k < back.length; k++) if (back[k]._src) back[k]._src.lost = true;
        }
        if (node.front) stack.push(node.front, front);
        else for (i = 0; i < front.length; i++) out.push(front[i]);
      }
    },
    clipTo: function (bsp) {
      eachNode(this, function (node) { node.polygons = bsp.clipPolygons(node.polygons); });
    },
    allPolygons: function (out) {
      out = out || [];
      eachNode(this, function (node) { for (var i = 0; i < node.polygons.length; i++) out.push(node.polygons[i]); });
      return out;
    },
    // Move every polygon whose own bounding box lies outside `bounds` (grown by eps) out of this tree into `out`.
    // The node planes stay, so the tree still classifies space exactly; only the far polygons skip the clipping.
    extractFar: function (bounds, eps, out) {
      eachNode(this, function (node) {
        if (!node.polygons.length) return;
        var keep = [];
        for (var i = 0; i < node.polygons.length; i++) {
          var p = node.polygons[i];
          // a far piece leaves the clipped set, so its source (possibly split by the tree build) is not restored whole
          if (polygonFar(p, bounds, eps)) { if (p._src) p._src.lost = true; out.push(p); } else keep.push(p);
        }
        node.polygons = keep;
      });
    },
    // Iterative for deep trees (see clipInto); nodes are filled in the order the recursion filled them.
    build: function (polygons) {
      var stack = [this, polygons, 0];
      while (stack.length) {
        var depth = stack.pop(), list = stack.pop(), node = stack.pop();
        if (!list.length) continue;
        if (depth > STATS.maxDepth) STATS.maxDepth = depth;
        // the polygon the plane is taken from stays at this node even when it is not quite flat (a sheet-metal Normal
        // Cut tool's warped quads, a healed polygon): split by its own plane, its pieces could be passed down forever
        var self = -1;
        if (!node.plane) { self = (list.length / 2) | 0; node.plane = list[self].plane.clone(); }
        var front = [], back = [];
        for (var i = 0; i < list.length; i++) {
          if (i === self) node.polygons.push(list[i]);
          else node.plane.splitPolygon(list[i], node.polygons, node.polygons, front, back);
        }
        if (back.length) { if (!node.back) node.back = new Node(); stack.push(node.back, back, depth + 1); }
        if (front.length) { if (!node.front) node.front = new Node(); stack.push(node.front, front, depth + 1); }
      }
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
  // CSG.options.sphereTest = false turns off splitPolygon's bounding-sphere shortcut (same results, slower).
  // CSG.options.heal = false turns off healCracks (rfFL) on boolean results; healWide, healFill, healDrop: see healCracks.
  // CSG.options.retryExact = false turns off the exact retry of a cracked boolean (rfFQ); retryMin / retryMax: see retryExact.
  var OPTIONS = { restoreWhole: true, nearTrees: true, nearRatio: 0.5, sphereTest: true, heal: true, healWide: 2 * EPSILON, healDrop: false, healFill: false, retryExact: true, retryMin: 3, retryMax: 300 };
  // FRAG: the bounding box of the fragments the last restoreWhole kept (null: everything may be cut), the region where
  // healCracks looks for cracks
  var FRAG = null;
  function restoreWhole(polygons) {
    FRAG = null;
    if (!OPTIONS.restoreWhole) return untag(polygons);
    var out = [], frag = [];
    for (var i = 0; i < polygons.length; i++) {
      var p = polygons[i], r = p._src;
      p._src = null; // no record outlives the boolean (it would keep the operands alive)
      if (!r || r.lost) { out.push(p); frag.push(p); continue; }
      if (r.done) continue;
      r.done = true;
      var q = r.orig.clone();
      if (q.plane.normal.dot(p.plane.normal) < 0) q.flip(); // a subtract hands the tool's faces back inverted
      out.push(q);
    }
    FRAG = boundsOf(frag) || { min: [0, 0, 0], max: [0, 0, 0] };
    return out;
  }
  function untag(polygons) { for (var i = 0; i < polygons.length; i++) polygons[i]._src = null; return polygons; }

  // ---------------------------------------------------------------- crack healing (rfFL)
  // The BSP classifies a vertex within EPSILON of a plane as on it but leaves it where it is, and a split point on a
  // nearly tangent edge (a fillet chord running into a straight edge, a hole tangent to a wall) lands a few 1e-6 off the
  // line its neighbour sees. Two faces that should share an edge then miss each other: an open edge for every mesh weld
  // (1e-6 grid, 1e-9 of the diagonal), a crack in the shaded part. healCracks runs on a boolean result when
  // splitPolygon took some vertex as on a plane while it was more than FUZZ off it (FUZZY; otherwise nothing can have
  // cracked), on the polygons near the fragments the boolean made (FRAG). It pairs directed edges between vertices
  // welded on a 1e-9 grid, drops exact T-junctions (dropTJunctions, cancelCollinear) and, for the open edges left:
  // (1) welds endpoints within WELD of each other, (2) inserts an endpoint lying within HEAL of another open edge's
  // interior into that edge (the nearest edge; never where the outline would fold back on itself, `spiked`); at most 4
  // passes. Never worse: unless fewer open edges are left than at the start, the result goes back as the BSP made it.
  // Watertight results come back unchanged (the same array); no vertex moves (except welds under 1e-7), every tag
  // (shared, surf, face, part) stays on its polygon. Off by default, as they cost sheet-metal Normal Cut flats an extra
  // loop (rfCW) and a bend's hole area (rfBZ): CSG.options.healWide (insert up to that distance when the point lies in
  // the edge's face plane, 20 EPSILON closed the Normal Cut Bracket with every edge filleted), healFill (fillSlivers:
  // a small flat loop of open edges becomes a face), healDrop (drop a rebuilt polygon narrower than HEAL).
  var HEAL = 2 * EPSILON, HEAL_WIDE = 20 * EPSILON, HEAL_Q = 1e9, WELD = 1e-7;
  var healStats = { calls: 0, healed: 0, moved: 0, dropped: 0, left: 0, passes: 0, ms: 0 };
  var NOW = typeof performance !== 'undefined' && performance.now ? function () { return performance.now(); } : Date.now;
  function healCracks(polys) {
    HEAL_LEFT = 0;
    if (!OPTIONS.heal || !FUZZY || polys.length < 4) return polys;
    healStats.calls++;
    var t0 = NOW(), orig = polys, before = -1, after = 0;
    SPIKES = 0;
    for (var pass = 0; pass <= 4; pass++) {
      healStats.passes++;
      LAST_OPEN = 0;
      var r = healPass(polys, pass === 4);
      if (before < 0) before = LAST_OPEN;
      after = LAST_OPEN;
      if (!r) break;
      polys = r;
    }
    // never worse: when the cracks left are not fewer than at the start, the result goes back as the BSP made it
    HEAL_LEFT = after;
    if (polys !== orig && after >= before) { polys = orig; HEAL_LEFT = before; healStats.reverted = (healStats.reverted || 0) + 1; }
    else if (polys !== orig) healStats.healed++;
    healStats.ms += NOW() - t0;
    return polys;
  }
  var LAST_OPEN = 0;
  // one pass: the healed polygon list, or null when nothing is open (or nothing could be changed)
  function healPass(all, countOnly) {
    // only the polygons near the fragments this boolean made (FRAG): every polygon sharing an edge with one of them is
    // in the set too, so an edge near FRAG without a twin in the set is really open
    var box = FRAG, sel = null, polys = all, i, j;
    if (box) {
      sel = []; polys = [];
      for (i = 0; i < all.length; i++) if (!polygonFar(all[i], box, 4 * HEAL)) { sel.push(i); polys.push(all[i]); }
    }
    var n = polys.length, nv0 = 0;
    for (i = 0; i < n; i++) nv0 += polys[i].vertices.length;
    // weld on a 1e-9 grid: open-addressing hash of the rounded coordinates
    var cap = 1; while (cap < 2 * nv0) cap <<= 1;
    var slot = new Int32Array(cap).fill(-1), qx = new Float64Array(nv0), qy = new Float64Array(nv0), qz = new Float64Array(nv0);
    var pos = [], pid = new Array(n), mask = cap - 1;
    for (i = 0; i < n; i++) {
      var vs = polys[i].vertices, ids = [];
      for (j = 0; j < vs.length; j++) {
        var q = vs[j].pos, X = Math.round(q.x * HEAL_Q), Y = Math.round(q.y * HEAL_Q), Z = Math.round(q.z * HEAL_Q);
        var h = ((X % 1000003) * 73856093 ^ (Y % 1000033) * 19349663 ^ (Z % 1000037) * 83492791) & mask, id;
        for (;;) {
          id = slot[h];
          if (id < 0) { id = pos.length; slot[h] = id; qx[id] = X; qy[id] = Y; qz[id] = Z; pos.push(q); break; }
          if (qx[id] === X && qy[id] === Y && qz[id] === Z) break;
          h = (h + 1) & mask;
        }
        if (!ids.length || ids[ids.length - 1] !== id) ids.push(id);
      }
      while (ids.length > 1 && ids[0] === ids[ids.length - 1]) ids.pop();
      pid[i] = ids;
    }
    // directed edges in per-vertex lists; each one is paired with an unused reverse twin
    var N = pos.length, head = new Int32Array(N).fill(-1), ne = 0;
    for (i = 0; i < n; i++) ne += pid[i].length;
    var nxt = new Int32Array(ne), tgt = new Int32Array(ne), used = new Uint8Array(ne), src = new Int32Array(ne), eP = new Int32Array(ne), eJ = new Int32Array(ne), k = 0;
    for (i = 0; i < n; i++) {
      var a = pid[i], m = a.length;
      for (j = 0; j < m; j++) { var e0 = a[j]; src[k] = e0; tgt[k] = a[j + 1 < m ? j + 1 : 0]; eP[k] = i; eJ[k] = j; nxt[k] = head[e0]; head[e0] = k; k++; }
    }
    var open = [];
    for (k = 0; k < ne; k++) {
      if (used[k]) continue;
      var aa = src[k], bb = tgt[k], f = head[bb];
      while (f >= 0 && (used[f] || tgt[f] !== aa)) f = nxt[f];
      if (f >= 0) { used[k] = 1; used[f] = 1; continue; }
      if (box) {
        var PA = pos[aa], PB = pos[bb], gg = 2 * HEAL;
        if (Math.max(PA.x, PB.x) < box.min[0] - gg || Math.min(PA.x, PB.x) > box.max[0] + gg || Math.max(PA.y, PB.y) < box.min[1] - gg ||
          Math.min(PA.y, PB.y) > box.max[1] + gg || Math.max(PA.z, PB.z) < box.min[2] - gg || Math.min(PA.z, PB.z) > box.max[2] + gg) continue;
      }
      open.push(eP[k], eJ[k], aa, bb);
    }
    if (!open.length) return null;
    open = cancelCollinear(dropTJunctions(open, pos, N), pos);
    LAST_OPEN = open.length / 4;
    if (!open.length || countOnly) return null;
    // candidate vertices: endpoints of open edges, sorted by x
    var seen = new Uint8Array(N), cand = [];
    for (i = 0; i < open.length; i += 4) {
      if (!seen[open[i + 2]]) { seen[open[i + 2]] = 1; cand.push(open[i + 2]); }
      if (!seen[open[i + 3]]) { seen[open[i + 3]] = 1; cand.push(open[i + 3]); }
    }
    cand.sort(function (u, v) { return pos[u].x - pos[v].x; });
    var to = new Int32Array(N), change = false;
    for (i = 0; i < N; i++) to[i] = i;
    // (1) open-edge endpoints within HEAL of each other -> one point (the first in x order)
    for (i = 0; i < cand.length; i++) {
      var u = cand[i]; if (to[u] !== u) continue;
      var pu = pos[u];
      for (j = i + 1; j < cand.length; j++) {
        var v = cand[j], pv = pos[v];
        if (pv.x - pu.x > WELD) break;
        if (to[v] !== v) continue;
        var dx = pv.x - pu.x, dy = pv.y - pu.y, dz = pv.z - pu.z;
        var dd = dx * dx + dy * dy + dz * dz;
        if (dd <= WELD * WELD) { to[v] = u; if (dd > exact2(pu)) change = true; }
      }
    }
    // (2) an endpoint within HEAL of another open edge's interior is inserted into that edge (the nearest one: at a
    // tangent joint a point can lie within HEAL of two edges' lines); one already on the line (an exact T-junction,
    // which every mesher downstream splits) is left alone
    // candidates sorted along each axis; an edge scans the axis whose slab (its extent + HEAL) holds the fewest
    var AX = ['x', 'y', 'z'], ord = [cand], keys = [];
    ord[1] = cand.slice().sort(function (u, v) { return pos[u].y - pos[v].y; });
    ord[2] = cand.slice().sort(function (u, v) { return pos[u].z - pos[v].z; });
    for (i = 0; i < 3; i++) keys[i] = ord[i].map(function (c) { return pos[c][AX[i]]; });
    var best = new Float64Array(N).fill(Infinity), bestE = new Int32Array(N).fill(-1), bestT = new Float64Array(N);
    for (i = 0; i < open.length; i += 4) {
      var ia = to[open[i + 2]], ib = to[open[i + 3]];
      if (ia === ib) continue;
      var A = pos[ia], B = pos[ib], ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z, L = Math.sqrt(ux * ux + uy * uy + uz * uz);
      ux /= L; uy /= L; uz /= L;
      var s0 = 0, s1 = 0, oa = null, pl = polys[open[i]].plane, nn = pl.normal, wide = Math.max(HEAL, OPTIONS.healWide);
      for (var ax = 0; ax < 3; ax++) {
        var ca = A[AX[ax]], cb = B[AX[ax]], kk = keys[ax];
        var r0 = lowerBound(kk, Math.min(ca, cb) - wide), r1 = lowerBound(kk, Math.max(ca, cb) + wide * 1.000001);
        if (!oa || r1 - r0 < s1 - s0) { s0 = r0; s1 = r1; oa = ord[ax]; }
      }
      for (var c = s0; c < s1; c++) {
        var w = oa[c];
        if (to[w] !== w || w === ia || w === ib) continue;
        var P = pos[w], wx = P.x - A.x, wy = P.y - A.y, wz = P.z - A.z, t = wx * ux + wy * uy + wz * uz;
        if (t <= 1e-9 || t >= L - 1e-9) continue;
        var ox = wx - t * ux, oy = wy - t * uy, oz = wz - t * uz, d2 = ox * ox + oy * oy + oz * oz;
        if (d2 >= best[w] || d2 > wide * wide) continue;
        // further than HEAL from the line: only a point in the edge's own face plane (a coplanar face of the other
        // operand whose outline the BSP cut a chord short of)
        if (d2 > HEAL * HEAL) { var pd = nn.x * P.x + nn.y * P.y + nn.z * P.z - pl.w; if (pd > EPSILON || pd < -EPSILON) continue; }
        best[w] = d2; bestE[w] = d2 > exact2(A, L) ? i : -1; bestT[w] = t;
      }
    }
    var ins = new Map();   // "polygon:edge" -> [{ t, v }]
    for (i = 0; i < cand.length; i++) {
      var bw = cand[i];
      if (bestE[bw] < 0) continue;
      var key = open[bestE[bw]] * 65536 + open[bestE[bw] + 1], list = ins.get(key);
      if (!list) ins.set(key, list = []);
      list.push({ t: bestT[bw], v: bw });
      change = true;
    }
    if (!change) {
      // (2b) nothing to snap or insert: a small closed loop of open edges is a sliver the BSP dropped; put it back
      var holes = OPTIONS.healFill ? fillSlivers(open, polys, pos) : [];
      if (holes.length) { healStats.filled = (healStats.filled || 0) + holes.length; return all.concat(holes); }
      healStats.left += open.length / 4;
      return null;
    }
    // (3) rebuild the touched polygons; one that lost a vertex or became a sliver goes (the next pass closes round it)
    var out = sel ? all.slice() : [], dropped = false;
    for (i = 0; i < n; i++) {
      var ids0 = pid[i], touched = false;
      for (j = 0; j < ids0.length && !touched; j++) if (to[ids0[j]] !== ids0[j] || ins.has(i * 65536 + j)) touched = true;
      if (!touched) { if (!sel) out.push(polys[i]); continue; }
      var ids1 = [];
      for (j = 0; j < ids0.length; j++) {
        var f = to[ids0[j]];
        if (!ids1.length || ids1[ids1.length - 1] !== f) ids1.push(f);
        var il = ins.get(i * 65536 + j);
        if (il) {
          il.sort(function (x, y) { return x.t - y.t; });
          for (var q = 0; q < il.length; q++) if (ids1[ids1.length - 1] !== il[q].v) ids1.push(il[q].v);
        }
      }
      while (ids1.length > 1 && ids1[0] === ids1[ids1.length - 1]) ids1.pop();
      if (ids1.length < 3 || (OPTIONS.healDrop && sliver(ids1, pos))) { healStats.dropped++; if (sel) { out[sel[i]] = null; dropped = true; } continue; }
      // an insertion that folds the outline back on itself (a fin): this polygon keeps its old outline
      if (spiked(ids1, pos)) { SPIKES++; if (sel) out[sel[i]] = polys[i]; else out.push(polys[i]); continue; }
      var p = polys[i], pp = new Polygon(ids1.map(function (q) { return new Vertex(pos[q].clone()); }), p.shared, p.plane.clone());
      pp.surf = p.surf;
      if (p.face != null) pp.face = p.face;
      if (p.part != null) pp.part = p.part;
      healStats.moved++;
      if (sel) out[sel[i]] = pp; else out.push(pp);
    }
    return dropped ? out.filter(function (x) { return x; }) : out;
  }
  // Most open edges of a boolean result are exact T-junctions: a long edge a→b on one side, a chain b→…→a of shorter
  // collinear edges on the other (the splitter downstream joins them). Walk that chain for each open edge (out-lists of
  // the open edges, each step moving back along a→b within rounding of its line) and drop both the edge and the chain;
  // what is left are the real cracks (a few edges), the only ones worth the candidate search.
  function dropTJunctions(open, pos, N) {
    var m = open.length / 4, head = new Int32Array(N).fill(-1), nxt = new Int32Array(m), done = new Uint8Array(m), i;
    for (i = 0; i < m; i++) { var s = open[4 * i + 2]; nxt[i] = head[s]; head[s] = i; }
    var chain = [];
    for (i = 0; i < m; i++) {
      if (done[i]) continue;
      var a = open[4 * i + 2], b = open[4 * i + 3], A = pos[a], B = pos[b];
      var ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z, L = Math.sqrt(ux * ux + uy * uy + uz * uz);
      if (!(L > 0)) continue;
      ux /= L; uy /= L; uz /= L;
      var ex = exact2(A, L), cur = b, tc = L, ok = false;
      chain.length = 0;
      for (var step = 0; step < 256 && !ok; step++) {
        var f = head[cur], took = -1;
        for (; f >= 0; f = nxt[f]) {
          if (done[f] || f === i) continue;
          var nx = open[4 * f + 3], P = pos[nx], wx = P.x - A.x, wy = P.y - A.y, wz = P.z - A.z, t = wx * ux + wy * uy + wz * uz;
          if (!(t < tc)) continue;
          var ox = wx - t * ux, oy = wy - t * uy, oz = wz - t * uz;
          if (ox * ox + oy * oy + oz * oz > ex) continue;
          took = f; tc = t; break;
        }
        if (took < 0) break;
        chain.push(took);
        cur = open[4 * took + 3];
        if (cur === a) ok = true;
      }
      if (!ok) continue;
      done[i] = 1;
      for (var c = 0; c < chain.length; c++) done[chain[c]] = 1;
    }
    var out = [];
    for (i = 0; i < m; i++) if (!done[i]) out.push(open[4 * i], open[4 * i + 1], open[4 * i + 2], open[4 * i + 3]);
    return out;
  }
  // What dropTJunctions leaves can still be T-junctions with vertices on both sides (a→c→b against b→d→a): cancel each
  // edge's parameter range against the antiparallel edges on its line (within rounding), as meshQuality does, and keep
  // only edges with something left uncovered. Pairwise over the (few) edges left; more than 4000 are kept as they are.
  function cancelCollinear(open, pos) {
    var m = open.length / 4;
    if (m < 2 || m > 4000) return open;
    var U = new Float64Array(3 * m), Lh = new Float64Array(m), i, j;
    for (i = 0; i < m; i++) {
      var A = pos[open[4 * i + 2]], B = pos[open[4 * i + 3]], dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z, L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      Lh[i] = L; U[3 * i] = dx / L; U[3 * i + 1] = dy / L; U[3 * i + 2] = dz / L;
    }
    var out = [];
    for (i = 0; i < m; i++) {
      var Ai = pos[open[4 * i + 2]], Li = Lh[i], ux = U[3 * i], uy = U[3 * i + 1], uz = U[3 * i + 2], tol2 = exact2(Ai, Li), tol = Math.sqrt(tol2);
      if (!(Li > 0)) continue;
      var pieces = [[0, Li]];
      for (j = 0; j < m && pieces.length; j++) {
        if (j === i || ux * U[3 * j] + uy * U[3 * j + 1] + uz * U[3 * j + 2] > -0.999999) continue;
        var t = [0, 0], ok = true;
        for (var e = 0; e < 2 && ok; e++) {
          var P = pos[open[4 * j + 2 + e]], wx = P.x - Ai.x, wy = P.y - Ai.y, wz = P.z - Ai.z, tt = wx * ux + wy * uy + wz * uz;
          var ox = wx - tt * ux, oy = wy - tt * uy, oz = wz - tt * uz;
          if (ox * ox + oy * oy + oz * oz > tol2) ok = false;
          t[e] = tt;
        }
        if (!ok) continue;
        var t0 = Math.min(t[0], t[1]), t1 = Math.max(t[0], t[1]), np = [];
        for (var q = 0; q < pieces.length; q++) {
          var pc = pieces[q];
          if (t1 <= pc[0] || t0 >= pc[1]) { np.push(pc); continue; }
          if (t0 > pc[0] + tol) np.push([pc[0], t0]);
          if (t1 < pc[1] - tol) np.push([t1, pc[1]]);
        }
        pieces = np;
      }
      var left = 0;
      for (q = 0; q < pieces.length; q++) left += pieces[q][1] - pieces[q][0];
      if (left > tol) out.push(open[4 * i], open[4 * i + 1], open[4 * i + 2], open[4 * i + 3]);
    }
    return out;
  }
  // Loops of at most 12 open edges (each edge's end starts the next) that are flat (every point within EPSILON of the
  // loop's plane) and narrow (twice the area over the longest edge under HEAL_WIDE): the hole a dropped sliver left.
  // Each becomes a polygon run the other way round, with the tags of the face it lies in (the first edge's polygon).
  function fillSlivers(open, polys, pos) {
    var m = open.length / 4, byStart = new Map(), used = new Uint8Array(m), out = [], i;
    for (i = 0; i < m; i++) { var s = open[4 * i + 2]; if (!byStart.has(s)) byStart.set(s, []); byStart.get(s).push(i); }
    for (i = 0; i < m; i++) {
      if (used[i]) continue;
      var loop = [i], cur = open[4 * i + 3], start = open[4 * i + 2], ok = false;
      while (loop.length <= 12) {
        if (cur === start) { ok = true; break; }
        var nx = byStart.get(cur), f = -1;
        if (nx) for (var q = 0; q < nx.length; q++) if (!used[nx[q]] && loop.indexOf(nx[q]) < 0) { f = nx[q]; break; }
        if (f < 0) break;
        loop.push(f); cur = open[4 * f + 3];
      }
      if (!ok || loop.length < 3) continue;
      var vs = [];
      for (var k = loop.length - 1; k >= 0; k--) vs.push(new Vertex(pos[open[4 * loop[k] + 3]].clone()));
      var pl = Plane.fromVertices(vs);
      if (!pl) continue;
      var e2 = 0, flat = true, sx = 0, sy = 0, sz = 0, a0 = vs[0].pos;
      for (k = 0; k < vs.length; k++) {
        var b = vs[k].pos, c = vs[(k + 1) % vs.length].pos, d = pl.normal.dot(b) - pl.w;
        if (d > EPSILON || d < -EPSILON) flat = false;
        var ex = c.x - b.x, ey = c.y - b.y, ez = c.z - b.z;
        e2 = Math.max(e2, ex * ex + ey * ey + ez * ez);
        var bx = b.x - a0.x, by = b.y - a0.y, bz = b.z - a0.z, cx = c.x - a0.x, cy = c.y - a0.y, cz = c.z - a0.z;
        sx += by * cz - bz * cy; sy += bz * cx - bx * cz; sz += bx * cy - by * cx;
      }
      var s2 = Math.sqrt(sx * sx + sy * sy + sz * sz), el = Math.sqrt(e2);
      // not a hole worth a face: a near-point gap whose fill would be a zero-area face for Evaluate's check
      var sc = Math.abs(a0.x) + Math.abs(a0.y) + Math.abs(a0.z) + el;
      if (!flat || s2 > HEAL_WIDE * el || s2 <= Math.sqrt(exact2(a0, el)) * el || s2 <= 2e-13 * sc * sc) continue;
      // convex only (the BSP needs it): every turn the same way round the plane normal
      var convex = true, nn = pl.normal;
      for (k = 0; k < vs.length && convex; k++) {
        var p0 = vs[k].pos, p1 = vs[(k + 1) % vs.length].pos, p2 = vs[(k + 2) % vs.length].pos;
        var ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z, wx = p2.x - p1.x, wy = p2.y - p1.y, wz = p2.z - p1.z;
        if ((uy * wz - uz * wy) * nn.x + (uz * wx - ux * wz) * nn.y + (ux * wy - uy * wx) * nn.z < -1e-18) convex = false;
      }
      if (!convex) continue;
      var src = polys[open[4 * i]], np = new Polygon(vs, src.shared, pl);
      np.surf = src.surf;
      if (src.face != null) np.face = src.face;
      if (src.part != null) np.part = src.part;
      for (k = 0; k < loop.length; k++) used[loop[k]] = 1;
      out.push(np);
    }
    return out;
  }
  // the square of the distance under which two points / a point and a line count as one already: rounding of
  // coordinates this large (1e-9 of their size, as the meshes' own welds); such a T-junction is split downstream
  function exact2(P, L) { var m = 1e-9 * (Math.abs(P.x) + Math.abs(P.y) + Math.abs(P.z) + (L || 0) + 1e-3); return m * m; }
  // an outline that doubles back on itself (two consecutive edges antiparallel within 5e-5 rad): an insertion
  // that would leave a fin (two coincident faces of zero area), which healPass refuses
  var SPIKES = 0;
  function spiked(ids, P) {
    var m = ids.length;
    for (var k = 0; k < m; k++) {
      var a = P[ids[(k + m - 1) % m]], b = P[ids[k]], c = P[ids[(k + 1) % m]];
      var ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, wx = c.x - b.x, wy = c.y - b.y, wz = c.z - b.z;
      var d = ux * wx + uy * wy + uz * wz, l = Math.sqrt((ux * ux + uy * uy + uz * uz) * (wx * wx + wy * wy + wz * wz));
      if (l > 0 && d < -(1 - 1e-9) * l) return true;
    }
    return false;
  }
  // a polygon narrower than HEAL everywhere: twice its area over its longest edge
  function sliver(ids, P) {
    var a = P[ids[0]], sx = 0, sy = 0, sz = 0, e2 = 0, m = ids.length;
    for (var j = 0; j < m; j++) {
      var b = P[ids[j]], c = P[ids[(j + 1) % m]];
      var ex = c.x - b.x, ey = c.y - b.y, ez = c.z - b.z, l2 = ex * ex + ey * ey + ez * ez;
      if (l2 > e2) e2 = l2;
      if (j > 0 && j + 1 < m) {
        var bx = b.x - a.x, by = b.y - a.y, bz = b.z - a.z, cx = c.x - a.x, cy = c.y - a.y, cz = c.z - a.z;
        sx += by * cz - bz * cy; sy += bz * cx - bx * cz; sz += bx * cy - by * cx;
      }
    }
    return Math.sqrt(sx * sx + sy * sy + sz * sz) <= HEAL * Math.sqrt(e2);
  }
  function lowerBound(arr, x) { var lo = 0, hi = arr.length; while (lo < hi) { var mm = (lo + hi) >> 1; if (arr[mm] < x) lo = mm + 1; else hi = mm; } return lo; }

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
  var STATS = { near: 0, classic: 0, fallback: 0, maxDepth: 0 };
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
  // (iterative, front before back: stack entries are [node, list] to split or [null, group] to emit)
  function leafGroups(root, polygons, groups) {
    var stack = [root, polygons];
    while (stack.length) {
      var list = stack.pop(), node = stack.pop();
      if (!node) { groups.push(list); continue; }
      var cop = [], front = [], back = [];
      for (var i = 0; i < list.length; i++) node.plane.splitPolygon(list[i], cop, cop, front, back);
      if (cop.length) return false;
      if (back.length) stack.push(node.back || null, back);
      if (front.length) stack.push(node.front || null, front);
    }
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

  // Analytic surface records under an affine point transform (rigid motions, mirrors, uniform scales): a facet record
  // { s: surface, P?, Q?, e0?, dphi? } whose surface { t, o, d, r?, R?, k? } has an axis point `o` and unit axis `d`.
  // Points move with fn, directions with fn(o + d) − fn(o); lengths (r, R, P, Q) scale with it and a mirror reverses
  // the angular sense (dphi). One record maps to one copy per transform, so facets of one surface still share it.
  function mapSurf(F, fn, flip, memo) {
    if (F._m) return F._m;
    var S = F.s, S2 = S._m;
    function V(a) { return new Vector(a[0], a[1], a[2]); }
    function A(v) { return [v.x, v.y, v.z]; }
    var o = fn(V(S.o)), dd = fn(V([S.o[0] + S.d[0], S.o[1] + S.d[1], S.o[2] + S.d[2]])).minus(o), lam = dd.length();
    if (!S2) {
      S2 = {};
      for (var k in S) if (S.hasOwnProperty(k) && k !== '_m') S2[k] = S[k];
      S2.o = A(o); S2.d = A(dd.dividedBy(lam));
      if (S.r != null) S2.r = S.r * lam;
      if (S.R != null) S2.R = S.R * lam;
      S._m = S2; memo.push(S);
    }
    var F2 = {};
    for (var j in F) if (F.hasOwnProperty(j) && j !== '_m') F2[j] = F[j];
    F2.s = S2;
    if (F.P) F2.P = [F.P[0] * lam, F.P[1] * lam];
    if (F.Q) F2.Q = [F.Q[0] * lam, F.Q[1] * lam];
    if (F.e0) { var e = fn(V([S.o[0] + F.e0[0], S.o[1] + F.e0[1], S.o[2] + F.e0[2]])).minus(o); F2.e0 = A(e.dividedBy(e.length())); }
    if (F.dphi != null && flip) F2.dphi = -F.dphi;
    F._m = F2; memo.push(F);
    return F2;
  }

  function CSG() { this.polygons = []; this.bounds = null; }
  CSG.fromPolygons = function (polygons) {
    var csg = new CSG();
    csg.polygons = polygons;
    return csg;
  };
  // ---------------------------------------------------------------- exact retry of a cracked boolean (rfFQ)
  // splitPolygon takes a vertex within EPSILON of a plane as on it. That band is what lets coincident faces (a cut
  // flush with a face, shell slabs meeting on a facet) come out coplanar, but where two nearly parallel planes meet
  // (a fillet chord running tangent into a circle chord, a shallow round's first chord on a plane) the solid being
  // split takes its new edge through the band vertex, while the other solid's faces are cut where the planes really
  // cross, up to EPSILON / sin(angle) away: a crack (1e-4 at a few degrees) wider than healCracks may bridge. So a
  // boolean whose result is still open after healing (HEAL_LEFT open edges near its fragments) and that had band
  // vertices at all (FUZZY) is run once more with those vertices on their true side (EXACT; a gentler retry that kept
  // polygons nearly parallel to the plane on the band closed fewer cases and cost a second run). The retry wins when it
  // leaves fewer open edges and, unless it is closed, no more slivers under 1e-6 near the fragments (thinCount: the
  // Funnel's shell slabs, near-coincident faces, came out with fewer heal-open edges but more slivers, which the
  // meshes' 1e-6 weld turns into cracks, and the shell guard then refused it). A watertight boolean is never
  // redone, so every closed result, every exact volume and every flat stays as it was. Cost: in the kernel tests ~880
  // retries, ~260 won; retryMin (3) and retryMax (300) skip the counts that never won there (1-2 open edges: one win in
  // 64; over 300: a boolean of cracked operands, one win in ~80, the costliest retries). CSG.options.retryExact =
  // false turns it off; CSG.retryStats counts the retries and the wins.
  var RETRY = { runs: 0, won: 0 };
  function retryExact(A, B, raw) {
    HEAL_LEFT = 0; EXACT = false;
    var r = raw.call(A, B);
    var left = HEAL_LEFT;
    if (!left || !FUZZY || !OPTIONS.retryExact || left < OPTIONS.retryMin || left > OPTIONS.retryMax) return r;
    var frag0 = FRAG, r2;
    RETRY.runs++;
    EXACT = true; HEAL_LEFT = 0;
    try { r2 = raw.call(A, B); } finally { EXACT = false; }
    if (HEAL_LEFT < left && (!HEAL_LEFT || thinCount(r2.polygons, FRAG) <= thinCount(r.polygons, frag0))) { r = r2; left = HEAL_LEFT; RETRY.won++; }
    HEAL_LEFT = left;
    return r;
  }
  // polygons near the last boolean's fragments (FRAG) narrower than 1e-6 (twice the area over the longest edge): the
  // slivers a 1e-6 mesh weld collapses into open edges
  function thinCount(polys, box) {
    var n = 0;
    for (var i = 0; i < polys.length; i++) {
      var p = polys[i], vs = p.vertices;
      if (box && polygonFar(p, box, 4 * HEAL)) continue;
      var a = vs[0].pos, sx = 0, sy = 0, sz = 0, e2 = 0;
      for (var j = 0; j < vs.length; j++) {
        var b = vs[j].pos, c = vs[(j + 1) % vs.length].pos, ex = c.x - b.x, ey = c.y - b.y, ez = c.z - b.z, l2 = ex * ex + ey * ey + ez * ez;
        if (l2 > e2) e2 = l2;
        var bx = b.x - a.x, by = b.y - a.y, bz = b.z - a.z, cx = c.x - a.x, cy = c.y - a.y, cz = c.z - a.z;
        sx += by * cz - bz * cy; sy += bz * cx - bx * cz; sz += bx * cy - by * cx;
      }
      if (Math.sqrt(sx * sx + sy * sy + sz * sz) <= 1e-6 * Math.sqrt(e2)) n++;
    }
    return n;
  }
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
    union: function (csg) { return retryExact(this, csg, rawUnion); },
    subtract: function (csg) { return retryExact(this, csg, rawSubtract); },
    intersect: function (csg) { return retryExact(this, csg, rawIntersect); },
    _union: function (csg) {
      var ba = this.getBounds(), bb = csg.getBounds(), eps = ba && bb ? farEps(ba, bb) : 0;
      if (!ba || !bb) return CSG.fromPolygons(clonePolys(this.polygons).concat(clonePolys(csg.polygons))); // an operand is empty
      if (!boundsOverlap(ba, bb, eps)) return CSG.fromPolygons(clonePolys(this.polygons).concat(clonePolys(csg.polygons)));
      FUZZY = 0;
      var n = nearOperands(this, csg, ba, bb, eps);
      if (n) {
        // A outside B, plus B outside A with B's faces coplanar with A's dropped (the classic sequence as lists)
        var bk = flipAll(n.t.a.clipPolygons(flipAll(n.t.a.clipPolygons(n.b))));
        return CSG.fromPolygons(healCracks(restoreWhole(n.t.b.clipPolygons(n.a).concat(bk)).concat(clonePolys(n.farA), clonePolys(n.farB))));
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
      return CSG.fromPolygons(healCracks(restoreWhole(a.allPolygons()).concat(untag(far))));
    },
    _subtract: function (csg) {
      var ba = this.getBounds(), bb = csg.getBounds(), eps = ba && bb ? farEps(ba, bb) : 0;
      // nothing minus anything is nothing (the trees would hand back the tool's faces inverted)
      if (!ba || !bb || !boundsOverlap(ba, bb, eps)) return CSG.fromPolygons(ba ? clonePolys(this.polygons) : []);
      FUZZY = 0;
      var n = nearOperands(this, csg, ba, bb, eps);
      if (n) {
        // A outside B, plus B inside A flipped: the classic sequence with ~A = the inverted tree of A
        n.t.a.invert();
        var ak = flipAll(n.t.b.clipPolygons(flipAll(n.a)));
        var bk = n.t.a.clipPolygons(flipAll(n.t.a.clipPolygons(n.b)));
        return CSG.fromPolygons(healCracks(restoreWhole(ak.concat(bk)).concat(clonePolys(n.farA))));
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
      return CSG.fromPolygons(healCracks(restoreWhole(a.allPolygons()).concat(untag(far))));
    },
    _intersect: function (csg) {
      var ba = this.getBounds(), bb = csg.getBounds(), eps = ba && bb ? farEps(ba, bb) : 0;
      if (!ba || !bb || !boundsOverlap(ba, bb, eps)) return CSG.fromPolygons([]);
      FUZZY = 0;
      var n = nearOperands(this, csg, ba, bb, eps);
      if (n) {
        n.t.a.invert();
        var b1 = flipAll(n.t.a.clipPolygons(n.b));
        n.t.b.invert();
        var ak = flipAll(n.t.b.clipPolygons(flipAll(n.a)));
        return CSG.fromPolygons(healCracks(restoreWhole(ak.concat(flipAll(n.t.a.clipPolygons(b1))))));
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
      return CSG.fromPolygons(healCracks(restoreWhole(a.allPolygons())));
    },
    inverse: function () {
      var csg = this.clone();
      csg.polygons.forEach(function (p) { p.flip(); });
      return csg;
    },
    // Apply a point transform. `flip` must be true for reflections (negative determinant).
    transform: function (fn, flip) {
      var out = [], memo = [];
      for (var i = 0; i < this.polygons.length; i++) {
        var p = this.polygons[i];
        var vs = p.vertices.map(function (v) { return new Vertex(fn(v.pos)); });
        if (flip) vs.reverse();
        var np = Polygon.tryCreate(vs, p.shared);
        if (np) { if (p.surf) np.surf = mapSurf(p.surf, fn, flip, memo); if (p.face != null) np.face = p.face; if (p.part != null) np.part = p.part; out.push(np); }
      }
      for (var m = 0; m < memo.length; m++) delete memo[m]._m;
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
      // iterative (deep trees, see eachNode): any leaf region reached behind a plane is inside
      function inside(root, p) {
        var st = [root];
        while (st.length) {
          var node = st.pop(), t = node.plane.normal.dot(p) - node.plane.w;
          if (t > EPSILON) { if (node.front) st.push(node.front); continue; }
          if (!node.back) return true;
          st.push(node.back);
          if (t >= -EPSILON && node.front) st.push(node.front);
        }
        return false;
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
  //     shared: Array(P) | null   the polygons' `shared` tags (feature ids or undefined), null when none is set,
  //     surfs: Array | null, surfIdx: Int32Array(P) | null   the distinct analytic surface records and each polygon's
  //                               index into them (-1 for a planar face); null when no polygon has one }
  // unpack(obj) rebuilds the same polygons with the same vertex order and planes, so volume() of the round trip is
  // bit-identical and booleans on the result behave exactly as on the original.
  var rawUnion = CSG.prototype._union, rawSubtract = CSG.prototype._subtract, rawIntersect = CSG.prototype._intersect;
  delete CSG.prototype._union; delete CSG.prototype._subtract; delete CSG.prototype._intersect;
  CSG.prototype.pack = function () {
    var polys = this.polygons, P = polys.length, V = 0, i, j;
    for (i = 0; i < P; i++) V += polys[i].vertices.length;
    var verts = new Float64Array(3 * V), counts = new Int32Array(P), planes = new Float64Array(4 * P);
    var shared = null, k = 0, surfs = null, surfIdx = null, faces = null, parts = null;
    for (i = 0; i < P; i++) {
      var p = polys[i], vs = p.vertices;
      if (p.surf) {
        if (!surfs) { surfs = []; surfIdx = new Int32Array(P); for (j = 0; j < P; j++) surfIdx[j] = -1; }
        if (p.surf._pk == null) { p.surf._pk = surfs.length; surfs.push(p.surf); }
        surfIdx[i] = p.surf._pk;
      }
      if (p.face != null) { if (!faces) { faces = new Int32Array(P); for (j = 0; j < P; j++) faces[j] = -1; } faces[i] = p.face; }
      if (p.part != null) { if (!parts) { parts = new Int32Array(P); for (j = 0; j < P; j++) parts[j] = -1; } parts[i] = p.part; }
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
    var out = { verts: verts, counts: counts, planes: planes, shared: shared };
    if (surfs) { for (i = 0; i < surfs.length; i++) delete surfs[i]._pk; out.surfs = surfs; out.surfIdx = surfIdx; }
    if (faces) out.faces = faces;   // B-rep face tags of an OpenCascade solid (r3/engine3: occt-worker.js packs its bodies)
    if (parts) out.parts = parts;   // assembly part tags (r10/asmfaces10)
    return out;
  };
  CSG.unpack = function (obj) {
    var counts = obj.counts, verts = obj.verts, planes = obj.planes, shared = obj.shared || null;
    var polys = [], k = 0;
    for (var i = 0; i < counts.length; i++) {
      var vs = [];
      for (var j = 0; j < counts[i]; j++) { vs.push(new Vertex(new Vector(verts[k], verts[k + 1], verts[k + 2]))); k += 3; }
      var plane = new Plane(new Vector(planes[4 * i], planes[4 * i + 1], planes[4 * i + 2]), planes[4 * i + 3]);
      var np = new Polygon(vs, shared ? shared[i] : undefined, plane);
      if (obj.surfIdx && obj.surfIdx[i] >= 0) np.surf = obj.surfs[obj.surfIdx[i]];
      if (obj.faces && obj.faces[i] >= 0) np.face = obj.faces[i];
      if (obj.parts && obj.parts[i] >= 0) np.part = obj.parts[i];
      polys.push(np);
    }
    return CSG.fromPolygons(polys);
  };
  // The ArrayBuffers inside a packed solid, for postMessage's transfer list (the sender's copy is detached after
  // the transfer, so only pass a packed object you are done with).
  CSG.packTransferables = function (packed) {
    var out = [packed.verts.buffer, packed.counts.buffer, packed.planes.buffer];
    if (packed.surfIdx) out.push(packed.surfIdx.buffer);
    if (packed.faces) out.push(packed.faces.buffer);
    if (packed.parts) out.push(packed.parts.buffer);
    return out;
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
  // healCracks counters (rfFL): calls, results healed, polygons rebuilt / dropped, open edges it could not close
  CSG.healStats = healStats;
  CSG.retryStats = RETRY;
  CSG.healCracks = function (csg) { FUZZY = 1; FRAG = null; return CSG.fromPolygons(healCracks(csg.polygons.slice())); };
  return CSG;
})();
