// csg.js — constructive solid geometry on BSP trees (after Evan Wallace's csg.js, MIT).
// Solids are lists of convex polygons with outward-facing planes. Booleans clip one tree against the other.
var CSG = (function () {
  'use strict';
  var EPSILON = 1e-5;
  // splitPolygon counts vertices it classifies as on a plane while they lie more than FUZZ off it (healCracks, rfFL)
  var FUZZ = 1e-9, FUZZY = 0, XS_T = [], EXACT = false, HEAL_LEFT = 0;
  // lane MP (bandSnap): while one operand's polygons are clipped by the other's tree (BSIDE = 1 or 2, the operand being
  // clipped), splitPolygon notes every vertex it takes as on a plane while it is off it (BW: the position, BP: the plane)
  // and every split point it makes (BS)
  // lane NC: BWS / BPS: the same for a vertex of a polygon within 20 degrees of the plane (bandCos), kept apart: those
  // only ever go to an original vertex that is the exact meet of the planes (bandSnap's wide rule)
  var BSIDE = 0, BW = [null, [], []], BP = [null, [], []], BS = [null, [], []], BWS = [null, [], []], BPS = [null, [], []];

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
      if (band && BSIDE && polygonType !== COPLANAR) {
        var steep = Math.abs(this.normal.dot(polygon.plane.normal)) < OPTIONS.bandCos, bw = steep ? BW[BSIDE] : BWS[BSIDE], bp = steep ? BP[BSIDE] : BPS[BSIDE];
        for (i = 0; i < n; i++) if (types[i] === COPLANAR && (ts[i] > FUZZ || ts[i] < -FUZZ)) { bw.push(polygon.vertices[i].pos); bp.push(this); }
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
              if (BSIDE) BS[BSIDE].push(v.pos, this, polygon.plane);
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
    // `kept` (rfFV): the far pieces stay in the result and go through restoreWhole with the clipped ones, so a source
    // the tree build split (by the solid's own planes) comes back whole; otherwise they are discarded and their
    // source counts as lost.
    extractFar: function (bounds, eps, out, kept) {
      eachNode(this, function (node) {
        if (!node.polygons.length) return;
        var keep = [];
        for (var i = 0; i < node.polygons.length; i++) {
          var p = node.polygons[i];
          if (polygonFar(p, bounds, eps)) { if (kept) p._far = true; else if (p._src) p._src.lost = true; out.push(p); } else keep.push(p);
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
  // CSG.options.restoreFar (rfFV, on): the classic path's far polygons (extractFar) go through restoreWhole too. The
  // full trees split each solid's polygons by its own planes, and where two of them are nearly parallel the EPSILON
  // band puts a vertex into both pieces, so the pieces overlap by up to ~1e-5; kept as pieces they made non-manifold
  // and open edges (the U-bracket with every edge R0.1: 51 open) and 5x the polygons. Off: far pieces stay pieces.
  // CSG.options.nearTrees = false turns off the near-region trees below; nearRatio is the largest share of an
  // operand's polygons that may lie near the other one for its tree to be built from the near part only.
  // CSG.options.sphereTest = false turns off splitPolygon's bounding-sphere shortcut (same results, slower).
  // CSG.options.heal = false turns off healCracks (rfFL) on boolean results; healWide, healFill, healDrop: see healCracks.
  // CSG.options.healFold = false turns off lane QJ's two heal steps (a fin tip dropped, a sliver corner past a chord dropped).
  // CSG.options.retryExact = false turns off the exact retry of a cracked boolean (rfFQ); retryMin / retryMax: see retryExact.
  var OPTIONS = { restoreWhole: true, nearTrees: true, nearRatio: 0.5, sphereTest: true, heal: true, healFold: true, healWide: 2 * EPSILON, healDrop: false, healFill: false, retryExact: true, retryMin: 3, retryMax: 300, fatten: true, restoreFar: true, snapTwins: true, recap: true, band: true, bandReach: 10 * EPSILON, bandCos: 0.94, bandWide: 100 * EPSILON };
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
      if (!r || r.lost) { out.push(p); if (p._far) p._far = false; else frag.push(p); continue; }
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
    // (2c) lane QJ: a corner b of a polygon whose outline runs a→b→c, next to an open edge, while another polygon's
    // open edge c→a is the chord and b lies within HEAL of that chord (segment): b goes. A needle the BSP left on a
    // flat cut through a loft's fold ran past the chord's end and back (f6040: 1.8e-5 past, 2.7e-6 aside), overlapping
    // its coplanar neighbour; the edge it shared with the loft was used three times and the chord stayed open.
    // the polygon's other edge at b must be used three times or more (the overlap), so dropping b only takes away a
    // surplus use (a 359 deg rolled hem lost a manifold edge to it otherwise, rfGF)
    var drop = new Map(), openKey = new Set(), uses = null;
    for (i = 0; i < open.length; i += 4) openKey.add(open[i + 2] * N + open[i + 3]);
    if (OPTIONS.healFold && open.length) { uses = new Map(); for (k = 0; k < ne; k++) { var uk = Math.min(src[k], tgt[k]) * N + Math.max(src[k], tgt[k]); uses.set(uk, (uses.get(uk) || 0) + 1); } }
    for (i = 0; i < (OPTIONS.healFold ? open.length : 0); i += 4) {
      var di = open[i], dj = open[i + 1], dids = pid[di], dm = dids.length;
      if (dm < 4) continue;
      for (var side = 0; side < 2; side++) {
        var jb = side ? dj : (dj + 1) % dm, ja = (jb + dm - 1) % dm, jc = (jb + 1) % dm, va = to[dids[ja]], vb = to[dids[jb]], vc = to[dids[jc]];
        if (va === vc || bestE[vb] >= 0 || !openKey.has(dids[jc] * N + dids[ja])) continue;   // (a point (2) inserts stays)
        var o1 = side ? dids[ja] : dids[jc], o2 = dids[jb];   // the edge at b that is not the open one
        if (!((uses.get(Math.min(o1, o2) * N + Math.max(o1, o2)) || 0) >= 3)) continue;
        if (uses.get(Math.min(dids[ja], dids[jc]) * N + Math.max(dids[ja], dids[jc])) !== 1) continue;   // the chord: its one open use only
        var PA2 = pos[va], PB2 = pos[vb], PC2 = pos[vc], cx2 = PC2.x - PA2.x, cy2 = PC2.y - PA2.y, cz2 = PC2.z - PA2.z, cl2 = cx2 * cx2 + cy2 * cy2 + cz2 * cz2;
        if (!(cl2 > 0)) continue;
        // b is a needle's tip: the outline turns back there (more than 170 deg; a square corner near a chord stays: rfGF)
        var bx1 = PB2.x - PA2.x, by1 = PB2.y - PA2.y, bz1 = PB2.z - PA2.z, bx2 = PC2.x - PB2.x, by2 = PC2.y - PB2.y, bz2 = PC2.z - PB2.z;
        if (!(bx1 * bx2 + by1 * by2 + bz1 * bz2 < -0.985 * Math.sqrt((bx1 * bx1 + by1 * by1 + bz1 * bz1) * (bx2 * bx2 + by2 * by2 + bz2 * bz2)))) continue;
        var ts2 = Math.max(0, Math.min(1, ((PB2.x - PA2.x) * cx2 + (PB2.y - PA2.y) * cy2 + (PB2.z - PA2.z) * cz2) / cl2));
        var ex2 = PA2.x + ts2 * cx2 - PB2.x, ey2 = PA2.y + ts2 * cy2 - PB2.y, ez2 = PA2.z + ts2 * cz2 - PB2.z;
        if (ex2 * ex2 + ey2 * ey2 + ez2 * ez2 < HEAL * HEAL) { drop.set(di * 65536 + jb, true); change = true; }
      }
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
      for (j = 0; j < ids0.length && !touched; j++) if (to[ids0[j]] !== ids0[j] || ins.has(i * 65536 + j) || drop.has(i * 65536 + j)) touched = true;
      if (!touched) { if (!sel) out.push(polys[i]); continue; }
      var ids1 = [];
      for (j = 0; j < ids0.length; j++) {
        var f = to[ids0[j]];
        if (!drop.has(i * 65536 + j) && (!ids1.length || ids1[ids1.length - 1] !== f)) ids1.push(f);
        var il = ins.get(i * 65536 + j);
        if (il) {
          il.sort(function (x, y) { return x.t - y.t; });
          for (var q = 0; q < il.length; q++) if (ids1[ids1.length - 1] !== il[q].v) ids1.push(il[q].v);
        }
      }
      while (ids1.length > 1 && ids1[0] === ids1[ids1.length - 1]) ids1.pop();
      if (ids1.length < 3 || (OPTIONS.healDrop && sliver(ids1, pos))) { healStats.dropped++; if (sel) { out[sel[i]] = null; dropped = true; } continue; }
      // an insertion that folds the outline back on itself (a fin): this polygon keeps its old outline
      // lane QJ: an inserted point that lies on this polygon's NEXT edge too (a needle polygon whose two long edges
      // run within 5e-5 rad of each other: a drilled loft's fold, f6001) makes a fin at the needle's tip; the tip
      // vertex goes instead (its neighbours across both edges pair with the inserted point on the next pass)
      if (OPTIONS.healFold && spiked(ids1, pos)) { var cut = unspike(ids1, pos, ids0); if (cut) ids1 = cut; }
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
  // lane QJ: the outline without the fin tips that an insertion made: a vertex of the old outline (ids0) where the
  // outline turns back (as spiked) next to an inserted point is dropped; null when nothing such is found or fewer than
  // three vertices would be left
  function unspike(ids, P, ids0) {
    var out = ids.slice(), changed = false;
    for (var guard = 0; guard < ids.length; guard++) {
      var m = out.length, hit = -1;
      if (m < 4) break;
      for (var k = 0; k < m && hit < 0; k++) {
        var ia = out[(k + m - 1) % m], ib = out[k], ic = out[(k + 1) % m];
        if (ids0.indexOf(ib) < 0 || (ids0.indexOf(ia) >= 0 && ids0.indexOf(ic) >= 0)) continue;
        var a = P[ia], b = P[ib], c = P[ic];
        var ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, wx = c.x - b.x, wy = c.y - b.y, wz = c.z - b.z;
        var d = ux * wx + uy * wy + uz * wz, l = Math.sqrt((ux * ux + uy * uy + uz * uz) * (wx * wx + wy * wy + wz * wz));
        if (l > 0 && d < -(1 - 1e-9) * l) hit = k;
      }
      if (hit < 0) break;
      out.splice(hit, 1); changed = true;
    }
    return changed && out.length >= 3 ? out : null;
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
    HEAL_LEFT = 0; EXACT = false; FUZZY = 0; FRAG = null; BALT = null;
    var r = raw.call(A, B);
    var left = HEAL_LEFT, fuzzy = FUZZY, frag = FRAG, alt = BALT, won = false;
    BALT = null;
    // lane lofts: the cracks of a boolean grow with the outline it cuts, so a fine body (a spline loft's 16000 facets) may
    // pass retryMax without being cracked itself; and a retry that takes the open edges down at least tenfold wins over
    // a few more slivers (a planar cut of G18: 66 open edges to 1, 165 to 4, with fattenSlivers still to run)
    if (left && fuzzy && OPTIONS.retryExact && left >= OPTIONS.retryMin && left <= Math.max(OPTIONS.retryMax, (A.polygons.length + B.polygons.length) / 16)) {
      var r2;
      RETRY.runs++;
      EXACT = true; HEAL_LEFT = 0;
      try { r2 = raw.call(A, B); } finally { EXACT = false; }
      if (OPTIONS.retryLog) OPTIONS.retryLog({ left: left, left2: HEAL_LEFT, thin: thinCount(r.polygons, frag), thin2: thinCount(r2.polygons, FRAG), r: r, r2: r2 });
      if (HEAL_LEFT < left && (!HEAL_LEFT || HEAL_LEFT * 10 <= left || thinCount(r2.polygons, FRAG) <= thinCount(r.polygons, frag))) { r = r2; left = HEAL_LEFT; frag = FRAG; RETRY.won++; won = true; }
    }
    // lane MP: the first run with its band vertices and their split points made one point (bandSnap; never worse by the
    // mesh round the moved points) takes the first run's place; an exact retry that won stays, unless the snapped
    // list has no open edge left at all
    if (alt && (!won || !alt.left)) { r = CSG.fromPolygons(alt.polys); left = alt.left; frag = alt.frag; BAND.kept++; }
    else if (alt) BAND.lost++;
    HEAL_LEFT = left;
    // rfFV: slivers under the meshes' 1e-6 weld merged into a coplanar neighbour (fattenSlivers)
    if (fuzzy && OPTIONS.fatten) {
      var fp = fattenSlivers(r.polygons, frag);
      if (fp !== r.polygons) { var rb = r.bounds; r = CSG.fromPolygons(fp); r.bounds = rb; }
    }
    // rfFV: twin points ~1e-9 apart made one (snapTwins); only where the boolean made fragments (frag), never on the
    // early-out paths or with restoreWhole off (the flat pattern's region merge)
    if (frag && OPTIONS.snapTwins) {
      var sp = snapTwins(r.polygons, frag);
      if (sp !== r.polygons) { var sb = r.bounds; r = CSG.fromPolygons(sp); r.bounds = sb; }
    }
    // lane lofts: a planar face the boolean shredded into slivers, laid again from its outline (rebuildCaps)
    if (frag && OPTIONS.recap) {
      var cp = rebuildCaps(r.polygons, frag);
      if (cp !== r.polygons) { var cb = r.bounds; r = CSG.fromPolygons(cp); r.bounds = cb; }
    }
    return r;
  }
  // Lane lofts. A flat cut across a finely faceted curved side: the tool's face is clipped by the plane of every facet,
  // and where facets are nearly coplanar (the two triangles of a quad on a gently curved loft) their traces on the face
  // are nearly collinear, so the cap comes out as dozens of overlapping-looking wedges under the 1e-6 weld. Patching the
  // wedges one at a time (fattenSlivers, the mesh's T-junction splits) leaves edges used four times here or there: a
  // false zero-thickness refusal or the part in pieces. But the cap's outline is known exactly: it is the edges the other
  // polygons have on that plane, split symmetrically by the boolean. So a planar face with slivers (width <= FAT_MIN,
  // RECAP.minParts polygons or more, one tag) is laid again as a fan of each closed outline from its area centroid: no
  // vertex of the outline moves and nothing is left narrower than its own edge. Left as it was when the outline does
  // not close into simple loops, a loop runs the wrong way (a hole), a loop is not star-shaped from its centroid, or the
  // new area differs from the old by more than RECAP.area: then the slivers stay, as before. CSG.options.recap = false
  // turns it off; CSG.recapStats counts the faces seen and the faces laid again.
  var RECAP = { seen: 0, done: 0, minParts: 4, area: 1e-6 };
  function rebuildCaps(polys, box) {
    var near = [], seeds = [], i, k;
    for (i = 0; i < polys.length; i++) {
      if (box && polygonFar(polys[i], box, 4 * HEAL)) continue;
      near.push(i);
      if (!polys[i].surf && loopWidth(posOf(polys[i])) <= FAT_MIN) seeds.push(i);
    }
    if (!seeds.length) return polys;
    var seen = {}, dead = {}, fresh = [];
    seeds.forEach(function (s) {
      var S = polys[s], n = S.plane.normal, w = S.plane.w;
      var pk = Math.round(n.x * 1e7) + ',' + Math.round(n.y * 1e7) + ',' + Math.round(n.z * 1e7) + ',' + Math.round(w * 1e7);
      if (seen[pk]) return;
      seen[pk] = true;
      var cl = [], others = [], ok = true;
      near.forEach(function (j) {
        var P = polys[j], m = P.plane.normal;
        if (m.x * n.x + m.y * n.y + m.z * n.z > 1 - 1e-9 && P.vertices.every(function (v) { var d = n.dot(v.pos) - w; return d <= 1e-9 && d >= -1e-9; })) {
          cl.push(j);
          if (P.shared !== S.shared || P.surf || tagOf(P.face) !== tagOf(S.face) || tagOf(P.part) !== tagOf(S.part)) ok = false;
        } else others.push(P);
      });
      if (!ok || cl.length < RECAP.minParts) return;
      RECAP.seen++;
      // the outline: the other polygons' edges on the plane, reversed
      var next = new Map(), at = new Map();
      others.forEach(function (P) {
        var vs = P.vertices, m = vs.length;
        for (var q = 0; q < m; q++) {
          var a = vs[q].pos, b = vs[(q + 1) % m].pos, da = n.dot(a) - w, db = n.dot(b) - w;
          if (da > 1e-9 || da < -1e-9 || db > 1e-9 || db < -1e-9) continue;
          var ka = pkey(a), kb = pkey(b);
          if (ka === kb) continue;
          if (next.has(kb)) ok = false;
          next.set(kb, ka); at.set(ka, a); at.set(kb, b);
        }
      });
      if (!ok || !next.size) return;
      var loops = [], used = {};
      next.forEach(function (x, start) {
        if (used[start]) return;
        var loop = [], key = start;
        while (key != null && !used[key]) { used[key] = true; loop.push(at.get(key)); key = next.get(key); }
        if (key !== start) ok = false;
        else loops.push(loop);
      });
      if (!ok) return;
      // area vector of a loop along n, and of the polygons it replaces
      function areaOf(L, o) {
        var A = 0, cx = 0, cy = 0, cz = 0, m = L.length;
        for (var q = 0; q < m; q++) {
          var a = L[q], b = L[(q + 1) % m], ax = a.x - o.x, ay = a.y - o.y, az = a.z - o.z, bx = b.x - o.x, by = b.y - o.y, bz = b.z - o.z;
          var t = (ay * bz - az * by) * n.x + (az * bx - ax * bz) * n.y + (ax * by - ay * bx) * n.z;
          A += t; cx += t * (ax + bx); cy += t * (ay + by); cz += t * (az + bz);
        }
        return { a: A / 2, c: A ? [o.x + cx / (3 * A), o.y + cy / (3 * A), o.z + cz / (3 * A)] : null };
      }
      var before = 0, after = 0, o0 = S.vertices[0].pos, parts = [];
      cl.forEach(function (j) { before += areaOf(posOf(polys[j]), o0).a; });
      loops.forEach(function (L) {
        var r = areaOf(L, o0), c;
        if (!(r.a > 0)) { ok = false; return; }
        after += r.a;
        c = L[0].clone(); c.x = r.c[0]; c.y = r.c[1]; c.z = r.c[2];
        for (var q = 0; q < L.length; q++) {
          var a = L[q], b = L[(q + 1) % L.length], ax = a.x - c.x, ay = a.y - c.y, az = a.z - c.z, bx = b.x - c.x, by = b.y - c.y, bz = b.z - c.z;
          if ((ay * bz - az * by) * n.x + (az * bx - ax * bz) * n.y + (ax * by - ay * bx) * n.z < 0) { ok = false; return; }
          parts.push([c, a, b]);
        }
      });
      if (!ok || Math.abs(after - before) > RECAP.area * Math.abs(before)) return;
      cl.forEach(function (j) { dead[j] = true; });
      parts.forEach(function (t) {
        var pp = new Polygon(t.map(function (x) { return new Vertex(x.clone()); }), S.shared, S.plane.clone());
        if (S.face != null) pp.face = S.face;
        if (S.part != null) pp.part = S.part;
        fresh.push(pp);
      });
      RECAP.done++;
    });
    if (!fresh.length) return polys;
    return polys.filter(function (p, j) { return !dead[j]; }).concat(fresh);
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

  // ---------------------------------------------------------------- sliver merge (rfFV)
  // A face of the result can have a reflex corner a hair off straight: where a fillet's last chord runs into a circle's
  // chord at the tangent point they turn by ~1e-4 rad (maxAngle 3°: the vent R.05). A convex split of that face must
  // cut from the reflex vertex, and the BSP cuts along the extension of one of the two chords, which leaves a wedge
  // under 1e-6 wide between the extension and the other chord. The solid is exact, but every mesh downstream welds and
  // splits T-junctions at 1e-6 (Exchange.bodyMesh, meshFromBody): the wedge's long edges fall onto each other and four
  // triangles share an edge (non-manifold). fattenSlivers merges each such sliver (width = 2 area / longest edge <=
  // SLIM, near the boolean's fragments) into a coplanar neighbour with the same tags that holds one of its edges
  // (whole, or as part of a longer edge), drops vertices left exactly collinear and, when the merged outline has one
  // reflex vertex, fans it from there (a polygon with one reflex vertex is star-shaped from it). Every piece must be
  // wider than FAT_MIN and wound like the face, else the sliver stays. No vertex moves and the merged pieces tile the
  // same area, so volumes, outlines and flats are unchanged (to rounding). Runs on every boolean that had band vertices
  // (FUZZY: no sliver of this kind can appear otherwise); CSG.options.fatten = false turns it off, CSG.fatStats counts.
  // (lane PC) twinVerts / twinLooks: the vertices snapTwins sorted and the candidate twins it looked at (a test counts work)
  var FAT = { calls: 0, slivers: 0, merged: 0, snapped: 0, ms: 0, twinVerts: 0, twinLooks: 0 }, SLIM = 1e-6, FAT_MIN = 1e-5;
  // 2 area / longest edge of a vertex loop (positions)
  function loopWidth(ps) {
    var a = ps[0], sx = 0, sy = 0, sz = 0, e2 = 0, n = ps.length;
    for (var j = 0; j < n; j++) {
      var b = ps[j], c = ps[(j + 1) % n], ex = c.x - b.x, ey = c.y - b.y, ez = c.z - b.z, l2 = ex * ex + ey * ey + ez * ez;
      if (l2 > e2) e2 = l2;
      var bx = b.x - a.x, by = b.y - a.y, bz = b.z - a.z, cx = c.x - a.x, cy = c.y - a.y, cz = c.z - a.z;
      sx += by * cz - bz * cy; sy += bz * cx - bx * cz; sz += bx * cy - by * cx;
    }
    return e2 > 0 ? Math.sqrt(sx * sx + sy * sy + sz * sz) / Math.sqrt(e2) : 0;
  }
  function posOf(p) { return p.vertices.map(function (v) { return v.pos; }); }
  function tagOf(x) { return x == null ? null : x; }
  function sameFace(S, N) {
    if (S.shared !== N.shared || S.surf !== N.surf || tagOf(S.face) !== tagOf(N.face) || tagOf(S.part) !== tagOf(N.part)) return false;
    var a = S.plane.normal, b = N.plane.normal;
    if (a.x * b.x + a.y * b.y + a.z * b.z < 1 - 1e-9) return false;
    for (var i = 0; i < S.vertices.length; i++) { var d = b.dot(S.vertices[i].pos) - N.plane.w; if (d > 1e-9 || d < -1e-9) return false; }
    return true;
  }
  // drop repeated and exactly collinear (sin < 1e-10, running on) vertices of a closed loop of positions
  function cleanLoop(loop) {
    for (var changed = true; changed && loop.length >= 3;) {
      changed = false;
      for (var k = 0; k < loop.length && loop.length >= 3; k++) {
        var m = loop.length, P = loop[(k + m - 1) % m], V = loop[k], Q = loop[(k + 1) % m];
        var ax = V.x - P.x, ay = V.y - P.y, az = V.z - P.z, bx = Q.x - V.x, by = Q.y - V.y, bz = Q.z - V.z;
        var la = ax * ax + ay * ay + az * az, lb = bx * bx + by * by + bz * bz;
        var cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
        if (la < 1e-24 || (cx * cx + cy * cy + cz * cz <= 1e-20 * la * lb && ax * bx + ay * by + az * bz > 0)) { loop.splice(k, 1); k--; changed = true; }
      }
    }
    return loop;
  }
  // convex pieces of a planar loop (normal n): itself when convex, a fan from its one reflex vertex, else null; every
  // piece wound along n and wider than FAT_MIN
  function convexPieces(loop, n) {
    var m = loop.length, r = -1, k;
    if (m < 3) return null;
    for (k = 0; k < m; k++) {
      var P = loop[(k + m - 1) % m], V = loop[k], Q = loop[(k + 1) % m];
      var ax = V.x - P.x, ay = V.y - P.y, az = V.z - P.z, bx = Q.x - V.x, by = Q.y - V.y, bz = Q.z - V.z;
      var s = (ay * bz - az * by) * n.x + (az * bx - ax * bz) * n.y + (ax * by - ay * bx) * n.z;
      if (s <= 1e-10 * Math.sqrt((ax * ax + ay * ay + az * az) * (bx * bx + by * by + bz * bz))) { if (r >= 0) return null; r = k; }
    }
    var pieces = [];
    if (r < 0) pieces.push(loop);
    else for (k = 1; k + 1 < m; k++) pieces.push([loop[r], loop[(r + k) % m], loop[(r + k + 1) % m]]);
    for (k = 0; k < pieces.length; k++) {
      var pl = Plane.fromVertices(pieces[k].map(function (q) { return { pos: q }; }));
      if (!pl || pl.normal.dot(n) < 0.999 || loopWidth(pieces[k]) <= FAT_MIN) return null;
    }
    return pieces;
  }
  // S (a sliver) merged into N across an edge of S that lies on an edge of N (reversed): N's new convex pieces, or null
  function mergeSliver(S, N) {
    var sv = posOf(S), nv = posOf(N), ns = sv.length, nn = nv.length, i, j, k;
    for (i = 0; i < ns; i++) {
      var a = sv[i], b = sv[(i + 1) % ns];
      for (j = 0; j < nn; j++) {
        var p = nv[j], q = nv[(j + 1) % nn], ux = q.x - p.x, uy = q.y - p.y, uz = q.z - p.z, L2 = ux * ux + uy * uy + uz * uz;
        if (L2 < 1e-24) continue;
        var tb = ((b.x - p.x) * ux + (b.y - p.y) * uy + (b.z - p.z) * uz) / L2, ta = ((a.x - p.x) * ux + (a.y - p.y) * uy + (a.z - p.z) * uz) / L2;
        if (!(tb > -1e-9 && ta < 1 + 1e-9 && ta - tb > 1e-9)) continue;
        var ok = true;
        [[a, ta], [b, tb]].forEach(function (c) {
          var dx = c[0].x - p.x - c[1] * ux, dy = c[0].y - p.y - c[1] * uy, dz = c[0].z - p.z - c[1] * uz;
          if (dx * dx + dy * dy + dz * dz > 1e-18) ok = false;
        });
        if (!ok) continue;
        // N up to p, then b, round S to a, then q and the rest of N
        var loop = nv.slice(0, j + 1);
        loop.push(b);
        for (k = 2; k < ns; k++) loop.push(sv[(i + k) % ns]);
        loop.push(a);
        for (k = j + 1; k < nn; k++) loop.push(nv[k]);
        var pieces = convexPieces(cleanLoop(loop), N.plane.normal);
        if (!pieces) continue;
        return pieces.map(function (ps) {
          var pp = new Polygon(ps.map(function (x) { return new Vertex(x.clone()); }), N.shared, N.plane.clone());
          pp.surf = N.surf;
          if (N.face != null) pp.face = N.face;
          if (N.part != null) pp.part = N.part;
          return pp;
        });
      }
    }
    return null;
  }
  // Twin points (rfFV): the same corner of the result computed twice, as A's edge cut by B's plane and as B's edge cut
  // by A's plane, lands 1e-9..7e-7 apart (3e-8 where a nearly flat tool facet's trace on a face sets it: the R2 round on an
  // extruded spline's end face, rfFY; 7.2e-7 for a plain boss on a plate, rfGA pin 1). Every mesh welds on a 1e-6 grid (Exchange.bodyMesh, meshFromBody), so a pair
  // that straddles a grid line comes apart there: open edges in a closed solid, by lottery (the Funnel's R15.51 spout
  // ring drew one, the spline round 4). snapTwins makes every pair of distinct vertices within SNAP of each other (near
  // the boolean's fragments) the bitwise-same point, the lexicographically smaller; a polygon keeps its plane, loses
  // repeats and goes when fewer than 3 vertices are left. SNAP is the weld cell: two distinct points closer than it are
  // one point to the meshes anyway, unless a grid line falls between them. Moves are under SNAP (volumes ~1e-10). Tried
  // and dropped: a second tier sliding an interior face vertex onto a neighbour up to 4e-6 away (the spline round's
  // 3 non-manifold edges): every candidate move opened a T-junction of a tool chord line by ~1e-6.
  var SNAP = 1e-6;
  function pkey(q) { return q.x + ',' + q.y + ',' + q.z; }
  function snapTwins(polys, box) {
    var vs = [], i, j, k, far = box ? new Uint8Array(polys.length) : null;
    for (i = 0; i < polys.length; i++) {
      if (box && polygonFar(polys[i], box, 4 * HEAL)) { far[i] = 1; continue; }
      var pv = polys[i].vertices;
      for (j = 0; j < pv.length; j++) vs.push(pv[j].pos);
    }
    if (vs.length < 2) return polys;
    vs.sort(function (a, b) { return a.x - b.x || a.y - b.y || a.z - b.z; });
    // lane PC: the pairs are taken in the same order as the old scan over every later vertex within SNAP in x, which
    // looked at whole columns: a cut across a perforated sheet puts thousands of vertices on one x and two y's (a
    // Jog at 1800 holes: snapTwins 2.1 of 5.4 s). The sorted list is cut into runs of equal x (runX) and, inside them,
    // of equal (x, y) (runY); in a run the y's ascend, in a run of (x, y) the z's do. For a, a's own (x, y) run is
    // read from i + 1 (z ascends from a.z), every later run within SNAP in x and y from a binary search to its first
    // y >= a.y - SNAP, every (x, y) run from a binary search to its first z >= a.z - SNAP, each up to the first value
    // past a's + SNAP. Same pairs, same order. A copy of the vertex before it (one corner of many polygons) takes
    // nothing the first copy did not (every copy of a point has one fate: one a takes them all, in one stretch).
    var n = vs.length, runX = new Int32Array(n), runY = new Int32Array(n);
    for (i = n - 1; i >= 0; i--) {
      var sx = i + 1 < n && vs[i + 1].x === vs[i].x;
      runX[i] = sx ? runX[i + 1] : i + 1;
      runY[i] = sx && vs[i + 1].y === vs[i].y ? runY[i + 1] : i + 1;
    }
    var to = new Map(), looks = 0;
    // the (x, y) run from q (its z's ascending; within SNAP of a in x and y), from the first z >= a.z - SNAP
    function takeZ(a, q, own) {
      var e = runY[q];
      if (!own) {
        var hi = e;
        while (q < hi) { var mid = (q + hi) >> 1; if (vs[mid].z - a.z < -SNAP) q = mid + 1; else hi = mid; }
      }
      for (; q < e; q++) {
        looks++;
        var b = vs[q], dz = b.z - a.z;
        if (dz > SNAP) break;
        if (dz < -SNAP || to.has(b) || (b.x === a.x && b.y === a.y && b.z === a.z)) continue;
        to.set(b, a);
      }
    }
    // the x run from q (its y's ascending), from the first y >= a.y - SNAP, each (x, y) run up to a.y + SNAP
    function takeY(a, q, e, own) {
      if (!own) {
        var hi = e;
        while (q < hi) { var mid = (q + hi) >> 1; if (vs[mid].y - a.y < -SNAP) q = mid + 1; else hi = mid; }
      }
      for (; q < e; q = runY[q]) {
        looks++;
        if (vs[q].y - a.y > SNAP) break;
        takeZ(a, q, own && vs[q].y === a.y);
      }
    }
    for (i = 0; i < n; i++) {
      var a = vs[i], p0 = i ? vs[i - 1] : null;
      if (to.has(a) || (p0 && p0.x === a.x && p0.y === a.y && p0.z === a.z)) continue;
      if (i + 1 < runX[i]) takeY(a, i + 1, runX[i], true);
      for (k = runX[i]; k < n && vs[k].x - a.x <= SNAP; k = runX[k]) takeY(a, k, runX[k], false);
    }
    FAT.twinVerts += n; FAT.twinLooks += looks;
    if (!to.size) return polys;
    // every vertex of a polygon near the box is in vs, and every copy of a moved point is moved (to the same a): the
    // map by object is the map by value
    var out = [], changed = 0;
    for (i = 0; i < polys.length; i++) {
      var p = polys[i], v = p.vertices, hit = false;
      if (far && far[i]) { out.push(p); continue; }
      for (j = 0; j < v.length && !hit; j++) if (to.has(v[j].pos)) hit = true;
      if (!hit) { out.push(p); continue; }
      var nv = [];
      for (j = 0; j < v.length; j++) {
        var q = v[j].pos, t = to.get(q) || q, last = nv.length ? nv[nv.length - 1].pos : null;
        if (!last || last.x !== t.x || last.y !== t.y || last.z !== t.z) nv.push(new Vertex(t.clone()));
      }
      while (nv.length > 1) { var f0 = nv[0].pos, fl = nv[nv.length - 1].pos; if (f0.x === fl.x && f0.y === fl.y && f0.z === fl.z) nv.pop(); else break; }
      changed++;
      if (nv.length < 3) continue;
      var pp = new Polygon(nv, p.shared, p.plane.clone());
      pp.surf = p.surf;
      if (p.face != null) pp.face = p.face;
      if (p.part != null) pp.part = p.part;
      out.push(pp);
    }
    FAT.snapped += changed;
    return out;
  }
  function fattenSlivers(polys, box) {
    var t0 = NOW(), near = [], thin = [], i, k;
    for (i = 0; i < polys.length; i++) {
      if (box && polygonFar(polys[i], box, 4 * HEAL)) continue;
      near.push(i);
      if (loopWidth(posOf(polys[i])) <= SLIM) thin.push(i);
    }
    if (!thin.length) return polys;
    FAT.calls++; FAT.slivers += thin.length;
    var out = polys.slice(), merged = 0;
    for (var s = 0; s < thin.length; s++) {
      var S = out[thin[s]];
      if (!S || loopWidth(posOf(S)) > SLIM) continue;
      var sb = boundsOf([S]);
      for (k = 0; k < near.length; k++) {
        var j = near[k], N = out[j];
        if (j === thin[s] || !N || polygonFar(N, sb, 1e-9) || !sameFace(S, N)) continue;
        var pieces = mergeSliver(S, N);
        if (!pieces) continue;
        out[thin[s]] = null; out[j] = pieces[0];
        for (var q = 1; q < pieces.length; q++) { near.push(out.length); out.push(pieces[q]); }
        merged++;
        break;
      }
    }
    FAT.merged += merged;
    FAT.ms += NOW() - t0;
    return merged ? out.filter(function (x) { return x; }) : polys;
  }
  // ---------------------------------------------------------------- a band vertex and its split points: one point (lane MP)
  // splitPolygon takes a vertex within EPSILON of a plane as on it and leaves it where it is: the solid it belongs to is
  // cut through that vertex. The other solid's face on that plane is cut where the planes really cross, EPSILON / sin
  // away (7e-6 where a BSP cut line across a plate's top passed 5e-6 from a facet of a groove's wall, stack fuzz 773;
  // 2.7e-5 at the corner of two hole facets 11 degrees apart, stack fuzz 829). The two sides of one edge then hold
  // different points: a needle hole (which the meshes' fillSliverLoops hides while it is a clean loop) or, once
  // healCracks has put one of the points into the other side's edge, a needle flap on an edge used three times.
  // No weld can tell such a pair from two real vertices afterwards (shell slabs hold true features of 4e-5), but the
  // split knows which points it took for one. While one operand is clipped by the other's tree (clipAs; never in a
  // tree build or an exact retry), splitPolygon notes
  //   BW / BP  every vertex it takes as on a plane while it is off it, with that plane (only in a polygon that crosses
  //            the plane at more than 20 degrees, bandCos: near-parallel faces are the exact retry's business);
  //   BS       every split point it makes, with the plane that made it and the plane of the polygon it was made in.
  // bandSnap then groups the points that stand for one point (points within SNAP count as one, as for every mesh):
  //   - a split point of one solid with a band vertex of the other, when the split point lies within EPSILON of the
  //     plane the vertex was taken as on, the vertex within EPSILON of the plane that made the split point and of the
  //     plane of the polygon it was made in, and the two are within bandReach (10 EPSILON) but more than SNAP apart
  //     (closer pairs are snapTwins', as before);
  //   - a band vertex that is itself a split point with an original vertex of the other solid on the same terms (a
  //     cut line that crosses one facet a hair from the facet's corner).
  // Each group goes to its fixed point: an original vertex, or a vertex the solid's own tree build made (other
  // polygons hold those, they cannot move); with several fixed points each free one goes to the nearest; with none,
  // to a split point that is not a band vertex (it lies ON the plane the band vertex was only taken as on). A point
  // inside an edge of a polygon that does not hold it (a T-junction on a face left whole) stays unless it moves along
  // that edge. The moves are applied to the BSP's list by position, in every polygon of both solids; a polygon left
  // with fewer than three points goes (the needle itself).
  // Never worse: the snapped list is healed and offered beside the result as it was (banded / BALT); it is dropped
  // when the welded mesh round the moved points has more open / non-manifold edges than before (CSG.options.cracks,
  // set by kernel-mesh.js), and retryExact decides between the first run and the exact retry exactly as it did, then
  // takes the snapped list in place of the first run. A boolean with no such group returns bitwise what it returned
  // (every example's polygons and mass properties are bit-identical with the snap on and off).
  // Not used inside a shell's slab assembly (kernel-features.js buildShell turns CSG.options.band off: slabs touch by
  // design, nearly every boolean there has such vertices, and the assembly cracked more often with the snap than
  // without). CSG.options.band = false turns it off; CSG.bandStats counts (events, pairs, moved, blocked at a
  // T-junction, polygons changed / dropped, kept, undone by the mesh count, lost to a retry that won).
  var BAND = { calls: 0, events: 0, pairs: 0, wide: 0, moved: 0, blocked: 0, polys: 0, dropped: 0, kept: 0, undone: 0, lost: 0, ms: 0 };
  function bandReset() { BW[1].length = 0; BW[2].length = 0; BP[1].length = 0; BP[2].length = 0; BS[1].length = 0; BS[2].length = 0; BWS[1].length = 0; BWS[2].length = 0; BPS[1].length = 0; BPS[2].length = 0; }
  function cellKey(ix, iy, iz) { return ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) | 0; }
  function clipAs(side, tree, x) {
    BSIDE = OPTIONS.band && !EXACT ? side : 0;
    try { if (x instanceof Node) { x.clipTo(tree); return x; } return tree.clipPolygons(x); } finally { BSIDE = 0; }
  }
  // The result of a boolean from the list the BSP made: healed as before (what retryExact judges, so its decision is
  // the one it made before). When bandSnap moved points, the snapped list is healed too and offered as BALT, unless
  // it leaves more open / non-manifold edges round the moved points than the list as it was (CSG.options.cracks(
  // polygons), the count on the welded mesh, set by kernel-mesh.js; without it, healCracks' own count of open edges):
  // never worse. retryExact takes BALT in place of the first run when the exact retry did not win.
  var BPTS = [], BALT = null;
  function nearMoved(polys) {
    var out = [], i, k;
    for (i = 0; i < polys.length; i++) {
      var bs = polys[i]._bs || (polys[i]._bs = boundingSphere(polys[i].vertices)), m2 = bs.m * bs.m;
      for (k = 0; k < BPTS.length; k++) {
        var q = BPTS[k], dx = q.x - bs.x, dy = q.y - bs.y, dz = q.z - bs.z;
        if (dx * dx + dy * dy + dz * dz <= m2) { out.push(polys[i]); break; }
      }
    }
    return out;
  }
  function banded(polys, A, B) {
    var a = healCracks(polys);
    if (!OPTIONS.band || EXACT || (!BW[1].length && !BW[2].length && !(OPTIONS.bandWide && (BWS[1].length || BWS[2].length)))) { bandReset(); return a; }
    var left = HEAL_LEFT, snapped;
    BPTS.length = 0;
    try { snapped = bandSnap(polys, A, B); } finally { bandReset(); }
    if (snapped === polys) return a;
    // (lane NC, cost: tried healing the snapped list first and skipping this one and the retry when nothing was left
    // open; in 600 fuzz parts the snapped list's own count was never 0, so there was nothing to skip. A boolean that
    // moves points pays the second heal, bandSnap and two small meshes, +20 to 30 %; 28 booleans in 150 stack parts.)
    var b = healCracks(snapped), keep;
    if (OPTIONS.cracks) keep = OPTIONS.cracks(nearMoved(b)) <= OPTIONS.cracks(nearMoved(a));
    else keep = HEAL_LEFT <= left;
    // (CSG.options.bandLog / retryLog: hooks for a probe: the moved points as from / to pairs; the two runs' counts)
    if (OPTIONS.bandLog) OPTIONS.bandLog({ pts: BPTS.slice(), keep: keep, A: A, B: B, a: a, b: b });
    BPTS.length = 0;
    if (keep) BALT = { polys: b, left: HEAL_LEFT, frag: FRAG }; else BAND.undone++;
    HEAL_LEFT = left;
    return a;
  }
  function bandSnap(polys, A, B) {
    var n1 = BW[1].length, n2 = BW[2].length, RW = OPTIONS.bandWide || 0, wide = RW > 0, nw = wide ? BWS[1].length + BWS[2].length : 0;
    if (!n1 && !n2 && !nw) return polys;
    var t0 = NOW(), R = OPTIONS.bandReach, R2 = R * R, H = 2 * R, S2 = SNAP * SNAP, s, i, j, k, q, cell, nd;
    var fl = Math.floor, exact = new Map(), near = new Map(), bands = [], pairs = 0;
    var x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    BAND.calls++; BAND.events += n1 + n2 + nw;
    // one record per position: band (which operand's vertex was taken as on a plane: bit 1 / 2) with those planes,
    // split (made by this boolean), orig (a vertex of an operand as it came in), to (where it goes), d (how far)
    // (points within SNAP of each other are one point here, as they are to snapTwins and to every mesh)
    function node(p, make) {
      var ix = fl(p.x / H), iy = fl(p.y / H), iz = fl(p.z / H), c, m, q, d;
      var ax = fl((p.x - SNAP) / H), bx = fl((p.x + SNAP) / H), ay = fl((p.y - SNAP) / H), by = fl((p.y + SNAP) / H), az = fl((p.z - SNAP) / H), bz = fl((p.z + SNAP) / H);
      for (var cx = ax; cx <= bx; cx++) for (var cy = ay; cy <= by; cy++) for (var cz = az; cz <= bz; cz++) {
        c = exact.get(cellKey(cx, cy, cz));
        if (c) for (m = 0; m < c.length; m++) {
          q = c[m].p;
          d = q.x - p.x; if (d > SNAP || d < -SNAP) continue;
          d = q.y - p.y; if (d > SNAP || d < -SNAP) continue;
          d = q.z - p.z; if (d > SNAP || d < -SNAP) continue;
          return c[m];
        }
      }
      if (!make) return null;
      var r = { p: p, band: 0, planes: null, split: false, orig: false, to: null, d: Infinity, wb: 0, wp: null };
      c = exact.get(cellKey(ix, iy, iz));
      if (c) c.push(r); else exact.set(cellKey(ix, iy, iz), [r]);
      return r;
    }
    for (s = 1; s <= 2; s++) for (i = 0; i < BW[s].length; i++) {
      q = BW[s][i]; nd = node(q, true);
      if (!nd.band) {
        nd.planes = []; bands.push(nd);
        if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; if (q.z < z0) z0 = q.z; if (q.z > z1) z1 = q.z;
      }
      nd.band |= s;
      // planes of the operand this vertex does NOT belong to: [the other operand's number, plane]
      if (nd.planes.length < 16 && nd.planes.indexOf(BP[s][i]) < 0) nd.planes.push(s, BP[s][i]);
    }
    // lane NC: the vertices taken as on a plane their polygon is within 20 degrees of (BWS): no part in the rule above
    // (band stays 0), only in the wide rule below (wb / wp)
    if (nw) for (s = 1; s <= 2; s++) for (i = 0; i < BWS[s].length; i++) {
      q = BWS[s][i]; nd = node(q, true);
      if (!nd.planes) {
        nd.planes = []; bands.push(nd);
        if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; if (q.z < z0) z0 = q.z; if (q.z > z1) z1 = q.z;
      }
      nd.wb |= s;
      if (!nd.wp) nd.wp = [];
      if (nd.wp.length < 16 && nd.wp.indexOf(BPS[s][i]) < 0) nd.wp.push(s, BPS[s][i]);
    }
    var RB = wide && RW > R ? RW : R;
    x0 -= RB; y0 -= RB; z0 -= RB; x1 += RB; y1 += RB; z1 += RB;
    // every band vertex in the (up to 8) cells its reach touches, so a candidate looks in its own cell only
    for (i = 0; i < bands.length; i++) {
      q = bands[i].p;
      var ax = fl((q.x - R) / H), bx = fl((q.x + R) / H), ay = fl((q.y - R) / H), by = fl((q.y + R) / H), az = fl((q.z - R) / H), bz = fl((q.z + R) / H);
      for (var cx = ax; cx <= bx; cx++) for (var cy = ay; cy <= by; cy++) for (var cz = az; cz <= bz; cz++) {
        var nk = cellKey(cx, cy, cz); cell = near.get(nk);
        if (cell) cell.push(bands[i]); else near.set(nk, [bands[i]]);
      }
    }
    function off(pl, q) { var t = pl.normal.x * q.x + pl.normal.y * q.y + pl.normal.z * q.z - pl.w; return t > EPSILON || t < -EPSILON; }
    // c: a vertex of operand s, either a split point (made by the plane `by` of the other operand in a polygon on the
    // plane `host`) or an original vertex (no `by`); pair it with the band vertices of the other operand it stands for
    function visit(c, s, by, host) {
      if (c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1 || c.z < z0 || c.z > z1) return;
      var orig = !by, me = null, list, m, w, dx, dy, dz, d2, e, on;
      if (orig) { me = node(c, false); if (me) me.orig = true; }
      list = near.get(cellKey(fl(c.x / H), fl(c.y / H), fl(c.z / H)));
      if (!list) return;
      for (m = 0; m < list.length; m++) {
        w = list[m]; dx = w.p.x - c.x; dy = w.p.y - c.y; dz = w.p.z - c.z; d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > R2) continue;
        if (d2 <= S2) { if (orig) w.orig = true; else { w.split = true; (w.by || (w.by = [])).push(by, host); } continue; }
        if (!(w.band & (3 - s))) continue;
        // on a plane (of operand s) that this vertex of the other operand was taken as on
        on = false;
        for (e = 0; e < w.planes.length && !on; e += 2) if (w.planes[e] === 3 - s && !off(w.planes[e + 1], c)) on = true;
        if (!on) continue;
        if (!me) { me = node(c, true); if (orig) me.orig = true; }
        if (!orig) me.split = true;
        pairs++;
        // a split point stands for the band vertex only when that vertex lies on the plane that made the split point
        // (a plane of the vertex's own solid) and in the plane of the polygon that was split
        (me.ws || (me.ws = [])).push(w, Math.sqrt(d2), orig || (!off(by, w.p) && !off(host, w.p)));
      }
    }
    for (s = 1; s <= 2; s++) for (i = 0; i < BS[s].length; i += 3) visit(BS[s][i], s, BS[s][i + 1], BS[s][i + 2]);
    // lane NC, the wide rule. A band vertex that is itself a split point of this boolean lies within EPSILON of three
    // planes: the one it was taken as on, the one that made it and the plane of the polygon it was made in. Where those
    // meet at shallow angles it can be far from their meet (EPSILON / the product of the sines: 2.2e-4 where the rim
    // of a mirrored disc, a round 11.5 degrees off the bottom and chords 5 degrees apart, crosses the other disc's
    // coplanar bottom, stack fuzz 908), past bandReach, and the polygon is within bandCos of the plane. An original
    // vertex of the other solid lying EXACTLY (FUZZ) on all three planes is that meet, whatever the distance up to
    // bandWide (1e-3): the split point goes to it. Nothing else is paired past bandReach or across a shallow plane.
    var farG = null, HW = 2 * RW, RW2 = RW * RW;
    if (wide) {
      for (i = 0; i < bands.length; i++) {
        nd = bands[i];
        if (!nd.split || !nd.by) continue;
        q = nd.p;
        if (!farG) farG = new Map();
        var fax = fl((q.x - RW) / HW), fbx = fl((q.x + RW) / HW), fay = fl((q.y - RW) / HW), fby = fl((q.y + RW) / HW), faz = fl((q.z - RW) / HW), fbz = fl((q.z + RW) / HW);
        for (var fx = fax; fx <= fbx; fx++) for (var fy = fay; fy <= fby; fy++) for (var fz = faz; fz <= fbz; fz++) {
          var fk = cellKey(fx, fy, fz); cell = farG.get(fk);
          if (cell) cell.push(nd); else farG.set(fk, [nd]);
        }
      }
    }
    function exactOn(pl, q) { var t = pl.normal.x * q.x + pl.normal.y * q.y + pl.normal.z * q.z - pl.w; return t <= FUZZ && t >= -FUZZ; }
    function wideVisit(c, s) {
      if (c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1 || c.z < z0 || c.z > z1) return;
      var list = farG.get(cellKey(fl(c.x / HW), fl(c.y / HW), fl(c.z / HW))), m, w, dx, dy, dz, d2, e, on, me;
      if (!list) return;
      for (m = 0; m < list.length; m++) {
        w = list[m]; dx = w.p.x - c.x; dy = w.p.y - c.y; dz = w.p.z - c.z; d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > RW2 || d2 <= S2 || w.orig || !((w.band | w.wb) & (3 - s))) continue;
        on = false;
        for (e = 0; e < w.planes.length && !on; e += 2) if (w.planes[e] === 3 - s && exactOn(w.planes[e + 1], c)) on = true;
        if (w.wp) for (e = 0; e < w.wp.length && !on; e += 2) if (w.wp[e] === 3 - s && exactOn(w.wp[e + 1], c)) on = true;
        if (!on) continue;
        for (e = 0; e < w.by.length && on; e++) if (!exactOn(w.by[e], c)) on = false;
        if (!on) continue;
        me = node(c, true); me.orig = true;
        pairs++; BAND.wide++;
        (wideJoin || (wideJoin = [])).push(w, me);
      }
    }
    var ops = [A, B], wideJoin = null;
    for (s = 1; s <= 2; s++) {
      var op = ops[s - 1].polygons;
      for (i = 0; i < op.length; i++) { var ov = op[i].vertices; for (j = 0; j < ov.length; j++) { visit(ov[j].pos, s, null, null); if (farG) wideVisit(ov[j].pos, s); } }
    }
    BAND.pairs += pairs;
    if (!pairs) { BAND.ms += NOW() - t0; return polys; }
    // The points that stand for one point form a group: a split point with each band vertex it stands for; a band vertex
    // that is itself a split point with an original vertex of the other solid lying on the plane that made it and in
    // the planes of the polygons it was made in. A group goes to its fixed point (an original vertex, or a vertex the
    // solid's own tree build made: neither can move, other polygons hold them); with several, each free point to the
    // nearest; with none, to a split point that is not a band vertex (it lies on the plane the band vertex was only
    // taken as on), the lexicographically smallest.
    var all = [];
    function find(r) { while (r.u !== r) { r.u = r.u.u; r = r.u; } return r; }
    function join(a, b) {
      if (!a.u) { a.u = a; all.push(a); }
      if (!b.u) { b.u = b; all.push(b); }
      a = find(a); b = find(b);
      if (a !== b) b.u = a;
    }
    exact.forEach(function (c) {
      for (var m = 0; m < c.length; m++) {
        var me = c[m], e, f, w, no = null;
        if (!me.ws) continue;
        var free = me.split && !me.orig;
        if (free) for (e = 0; e < me.ws.length; e += 3) if (!me.ws[e + 2]) (no || (no = [])).push(me.ws[e]);
        for (e = 0; e < me.ws.length; e += 3) {
          w = me.ws[e];
          if (free) { if (!no || no.indexOf(w) < 0) join(me, w); continue; }
          if (!w.split || w.orig || !w.by) continue;
          var fits = true;
          for (f = 0; f < w.by.length && fits; f++) if (off(w.by[f], me.p)) fits = false;
          if (fits) join(w, me);
        }
      }
    });
    if (wideJoin) for (i = 0; i < wideJoin.length; i += 2) if (!wideJoin[i].orig) join(wideJoin[i + 1], wideJoin[i]);
    var movers = [], groups = new Map(), far2 = 4 * (wide && RW2 > R2 ? RW2 : R2);
    for (i = 0; i < all.length; i++) { var root = find(all[i]), gl = groups.get(root); if (gl) gl.push(all[i]); else groups.set(root, [all[i]]); }
    function before(a, b) { return a.p.x < b.p.x || (a.p.x === b.p.x && (a.p.y < b.p.y || (a.p.y === b.p.y && a.p.z < b.p.z))); }
    groups.forEach(function (g) {
      var fixed = [], m, n, rep = null;
      for (m = 0; m < g.length; m++) if (!g[m].split || g[m].orig) fixed.push(g[m]);
      if (!fixed.length) {
        for (m = 0; m < g.length; m++) if (!g[m].band && (!rep || before(g[m], rep))) rep = g[m];
        if (!rep) for (m = 0; m < g.length; m++) if (!rep || before(g[m], rep)) rep = g[m];
        fixed.push(rep);
      }
      for (m = 0; m < g.length; m++) {
        var a = g[m], best = null, bd = far2;
        if (fixed.indexOf(a) >= 0) continue;
        for (n = 0; n < fixed.length; n++) {
          var b = fixed[n].p, ex = b.x - a.p.x, ey = b.y - a.p.y, ez = b.z - a.p.z, dd = ex * ex + ey * ey + ez * ez;
          if (dd < bd) { bd = dd; best = fixed[n]; }
        }
        if (best) { a.to = best; a.d = Math.sqrt(bd); movers.push(a); }
      }
    });
    if (!movers.length) { BAND.ms += NOW() - t0; return polys; }
    function goal(r) { return r.to || r; }
    // A point that lies inside an edge of a polygon which does not hold it (a T-junction: the far side of an edge of a
    // face the boolean left whole) stays, unless it moves along that edge: off the line it would open the junction.
    for (i = 0; i < polys.length && movers.length; i++) {
      var tp = polys[i], tv = tp.vertices, bs = tp._bs || (tp._bs = boundingSphere(tv));
      for (k = 0; k < movers.length; k++) {
        var mv = movers[k], mp = mv.p, ux = mp.x - bs.x, uy = mp.y - bs.y, uz = mp.z - bs.z;
        if (!mv.to || ux * ux + uy * uy + uz * uz > bs.m * bs.m) continue;
        var holds = false, tj = false, g = mv.to.p;
        for (j = 0; j < tv.length && !holds; j++) {
          q = tv[j].pos;
          if (Math.abs(q.x - mp.x) <= SNAP && Math.abs(q.y - mp.y) <= SNAP && Math.abs(q.z - mp.z) <= SNAP) holds = true;
        }
        if (holds) continue;
        for (j = 0; j < tv.length && !tj; j++) {
          var ea = tv[j].pos, eb = tv[(j + 1) % tv.length].pos, lx = eb.x - ea.x, ly = eb.y - ea.y, lz = eb.z - ea.z, l2 = lx * lx + ly * ly + lz * lz;
          if (l2 < S2) continue;
          var ts = ((mp.x - ea.x) * lx + (mp.y - ea.y) * ly + (mp.z - ea.z) * lz) / l2;
          if (ts <= 0 || ts >= 1) continue;
          var px = ea.x + lx * ts - mp.x, py = ea.y + ly * ts - mp.y, pz = ea.z + lz * ts - mp.z;
          if (px * px + py * py + pz * pz > S2) continue;
          // the point is inside this edge: where it goes must be on the edge too
          var tg = ((g.x - ea.x) * lx + (g.y - ea.y) * ly + (g.z - ea.z) * lz) / l2;
          px = ea.x + lx * tg - g.x; py = ea.y + ly * tg - g.y; pz = ea.z + lz * tg - g.z;
          if (tg < 0 || tg > 1 || px * px + py * py + pz * pz > S2) tj = true;
        }
        if (tj) { mv.to = null; BAND.blocked++; }
      }
    }
    x0 = y0 = z0 = Infinity; x1 = y1 = z1 = -Infinity;
    var live = 0;
    for (i = 0; i < movers.length; i++) {
      if (!movers[i].to) continue;
      q = movers[i].p; live++;
      if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; if (q.z < z0) z0 = q.z; if (q.z > z1) z1 = q.z;
    }
    if (!live) { BAND.ms += NOW() - t0; return polys; }
    x0 -= SNAP; y0 -= SNAP; z0 -= SNAP; x1 += SNAP; y1 += SNAP; z1 += SNAP;
    BAND.moved += live;
    for (i = 0; i < movers.length; i++) if (movers[i].to) BPTS.push(movers[i].p, movers[i].to.p);
    var out = [], changed = 0;
    for (i = 0; i < polys.length; i++) {
      var p = polys[i], v = p.vertices, nv = null;
      for (j = 0; j < v.length; j++) {
        q = v[j].pos;
        if (q.x < x0 || q.x > x1 || q.y < y0 || q.y > y1 || q.z < z0 || q.z > z1) continue;
        nd = node(q, false);
        if (!nd || !nd.to) continue;
        if (!nv) nv = v.slice();
        nv[j] = new Vertex(goal(nd).p.clone());
      }
      if (!nv) { out.push(p); continue; }
      changed++;
      var cv = [], flat = true;
      for (j = 0; j < nv.length; j++) {
        q = nv[j].pos; var last = cv.length ? cv[cv.length - 1].pos : null;
        if (last && last.x === q.x && last.y === q.y && last.z === q.z) continue;
        cv.push(nv[j]);
        if (nv[j] !== v[j]) { var tp = p.plane.normal.x * q.x + p.plane.normal.y * q.y + p.plane.normal.z * q.z - p.plane.w; if (tp > EPSILON || tp < -EPSILON) flat = false; }
      }
      while (cv.length > 1) { var f0 = cv[0].pos, fz = cv[cv.length - 1].pos; if (f0.x === fz.x && f0.y === fz.y && f0.z === fz.z) cv.pop(); else break; }
      if (cv.length < 3) { BAND.dropped++; continue; }
      var pl2 = Plane.fromVertices(cv);
      if (!pl2) { BAND.dropped++; continue; }
      // the polygon keeps its plane while the moved points lie on it (within EPSILON); a point off it tilts the face
      if (flat || pl2.normal.dot(p.plane.normal) <= 0) pl2 = p.plane.clone();
      var pp = new Polygon(cv, p.shared, pl2);
      pp.surf = p.surf;
      if (p.face != null) pp.face = p.face;
      if (p.part != null) pp.part = p.part;
      out.push(pp);
    }
    BAND.polys += changed;
    BAND.ms += NOW() - t0;
    return out;
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
      FUZZY = 0; bandReset();
      var n = nearOperands(this, csg, ba, bb, eps);
      if (n) {
        // A outside B, plus B outside A with B's faces coplanar with A's dropped (the classic sequence as lists)
        var bk = flipAll(clipAs(2, n.t.a, flipAll(clipAs(2, n.t.a, n.b))));
        return CSG.fromPolygons(banded(restoreWhole(clipAs(1, n.t.b, n.a).concat(bk)).concat(clonePolys(n.farA), clonePolys(n.farB)), this, csg));
      }
      STATS.classic++;
      var a = new Node(taggedClones(this.polygons));
      var b = new Node(taggedClones(csg.polygons));
      var far = [];
      a.extractFar(bb, eps, far, OPTIONS.restoreFar); b.extractFar(ba, eps, far, OPTIONS.restoreFar);
      clipAs(1, b, a);
      clipAs(2, a, b);
      b.invert();
      clipAs(2, a, b);
      b.invert();
      a.build(b.allPolygons());
      return CSG.fromPolygons(banded(OPTIONS.restoreFar ? restoreWhole(a.allPolygons().concat(far)) : restoreWhole(a.allPolygons()).concat(untag(far)), this, csg));
    },
    _subtract: function (csg) {
      var ba = this.getBounds(), bb = csg.getBounds(), eps = ba && bb ? farEps(ba, bb) : 0;
      // nothing minus anything is nothing (the trees would hand back the tool's faces inverted)
      if (!ba || !bb || !boundsOverlap(ba, bb, eps)) return CSG.fromPolygons(ba ? clonePolys(this.polygons) : []);
      FUZZY = 0; bandReset();
      var n = nearOperands(this, csg, ba, bb, eps);
      if (n) {
        // A outside B, plus B inside A flipped: the classic sequence with ~A = the inverted tree of A
        n.t.a.invert();
        var ak = flipAll(clipAs(1, n.t.b, flipAll(n.a)));
        var bk = clipAs(2, n.t.a, flipAll(clipAs(2, n.t.a, n.b)));
        return CSG.fromPolygons(banded(restoreWhole(ak.concat(bk)).concat(clonePolys(n.farA)), this, csg));
      }
      STATS.classic++;
      var a = new Node(taggedClones(this.polygons));
      var b = new Node(taggedClones(csg.polygons));
      var far = [];
      // A's far polygons survive untouched; B's far polygons lie outside A and take nothing away
      a.extractFar(bb, eps, far, OPTIONS.restoreFar); b.extractFar(ba, eps, []);
      a.invert();
      clipAs(1, b, a);
      clipAs(2, a, b);
      b.invert();
      clipAs(2, a, b);
      b.invert();
      a.build(b.allPolygons());
      a.invert();
      return CSG.fromPolygons(banded(OPTIONS.restoreFar ? restoreWhole(a.allPolygons().concat(far)) : restoreWhole(a.allPolygons()).concat(untag(far)), this, csg));
    },
    _intersect: function (csg) {
      var ba = this.getBounds(), bb = csg.getBounds(), eps = ba && bb ? farEps(ba, bb) : 0;
      if (!ba || !bb || !boundsOverlap(ba, bb, eps)) return CSG.fromPolygons([]);
      FUZZY = 0; bandReset();
      var n = nearOperands(this, csg, ba, bb, eps);
      if (n) {
        n.t.a.invert();
        var b1 = flipAll(clipAs(2, n.t.a, n.b));
        n.t.b.invert();
        var ak = flipAll(clipAs(1, n.t.b, flipAll(n.a)));
        return CSG.fromPolygons(banded(restoreWhole(ak.concat(flipAll(clipAs(2, n.t.a, b1)))), this, csg));
      }
      STATS.classic++;
      var a = new Node(taggedClones(this.polygons));
      var b = new Node(taggedClones(csg.polygons));
      // far polygons of either solid lie outside the other and cannot be part of the intersection
      a.extractFar(bb, eps, []); b.extractFar(ba, eps, []);
      a.invert();
      clipAs(2, a, b);
      b.invert();
      clipAs(1, b, a);
      clipAs(2, a, b);
      a.build(b.allPolygons());
      a.invert();
      return CSG.fromPolygons(banded(restoreWhole(a.allPolygons()), this, csg));
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
    // lane NC: this solid with every polygon flat. healCracks may put a near-miss endpoint into an edge it is up to
    // HEAL off, so a polygon can hold a vertex a few 1e-6 off its own plane: inside the splitter's EPSILON band and
    // harmless, until the solid is scaled up (kernel-sheetmetal.js smBool works at 16× on 14 ga: 4.2e-6 became 6.8e-5,
    // the wall of a hole's cut-out read as bent and the Fold's subtract left 9 open edges, sheet fuzz 929). A polygon
    // with a vertex more than `tol` (EPSILON / 2) off its plane is fanned into triangles from its worst vertex: the
    // same points, every piece exactly flat. A polygon whose fan would fold over (a triangle facing the other way) is
    // left as it is. Returns this when nothing was fanned.
    planar: function (tol) {
      var t = tol == null ? EPSILON / 2 : tol, P = this.polygons, out = null, i, j;
      for (i = 0; i < P.length; i++) {
        var p = P[i], v = p.vertices, n = p.plane.normal, w = p.plane.w, worst = t, at = -1;
        if (v.length > 3) for (j = 0; j < v.length; j++) {
          var q = v[j].pos, d = n.x * q.x + n.y * q.y + n.z * q.z - w;
          if (d < 0) d = -d;
          if (d > worst) { worst = d; at = j; }
        }
        if (at < 0) { if (out) out.push(p); continue; }
        var tris = [], ok = true;
        for (j = 1; j + 1 < v.length && ok; j++) {
          var tri = Polygon.tryCreate([v[at].clone(), v[(at + j) % v.length].clone(), v[(at + j + 1) % v.length].clone()], p.shared);
          if (!tri) continue;   // three points in line: no area
          if (tri.plane.normal.dot(n) <= 0) { ok = false; break; }
          tri.surf = p.surf;
          if (p.face != null) tri.face = p.face;
          if (p.part != null) tri.part = p.part;
          tris.push(tri);
        }
        if (!ok || !tris.length) { if (out) out.push(p); continue; }
        if (!out) out = P.slice(0, i);
        for (j = 0; j < tris.length; j++) out.push(tris[j]);
      }
      if (!out) return this;
      var r = CSG.fromPolygons(out);
      r.bounds = this.bounds;
      return r;
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
  // rfLD: CSG.unionApart(list) -> the union of solids whose bounding boxes are pairwise apart (by the union's own
  // early-out test, boundsOverlap with farEps), which is just their polygons together (cloned, list order); null when
  // any two boxes meet, so the caller does the booleans. A sweep over x-sorted boxes: n log n for a pattern's copies,
  // which a running union (its box growing over the others) made quadratic (600 copies of a hole: tens of seconds).
  CSG.unionApart = function (list) {
    if (!list || list.length < 2) return null;
    // a solid made by unionApart counts as its parts (a pattern of a pattern: rows patterned again)
    var parts = [], bs = [], i, j, U = null;
    for (i = 0; i < list.length; i++) {
      if (!list[i]) return null;
      var sub = list[i]._parts || [list[i]];
      for (j = 0; j < sub.length; j++) parts.push(sub[j]);
    }
    for (i = 0; i < parts.length; i++) {
      var b = parts[i].getBounds();
      if (!b) return null;
      bs.push(b);
      U = U ? { min: [Math.min(U.min[0], b.min[0]), Math.min(U.min[1], b.min[1]), Math.min(U.min[2], b.min[2])], max: [Math.max(U.max[0], b.max[0]), Math.max(U.max[1], b.max[1]), Math.max(U.max[2], b.max[2])] } : b;
    }
    var eMax = farEps(U, U);
    bs.sort(function (u, v) { return u.min[0] - v.min[0]; });
    for (i = 0; i < bs.length; i++) {
      for (j = i + 1; j < bs.length; j++) {
        var bi = bs[i], bj = bs[j];
        if (bj.min[0] > bi.max[0] + eMax) break;
        if (boundsOverlap(bi, bj, farEps(bi, bj))) return null;
      }
    }
    var polys = [];
    for (i = 0; i < parts.length; i++) { var ps = parts[i].polygons; for (j = 0; j < ps.length; j++) polys.push(ps[j].clone()); }
    var out = CSG.fromPolygons(polys);
    // the parts, for a cut that can take them out one by one (kernel-curves.js plateCutParts); not packed or cloned
    Object.defineProperty(out, '_parts', { value: parts, enumerable: false, writable: true, configurable: true });
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
  CSG.fatStats = FAT;
  CSG.bandStats = BAND;
  CSG.recapStats = RECAP;
  CSG.healCracks = function (csg) { FUZZY = 1; FRAG = null; return CSG.fromPolygons(healCracks(csg.polygons.slice())); };
  return CSG;
})();
