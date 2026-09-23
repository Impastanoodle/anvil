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
          if (f.length >= 3) { var pf = Polygon.tryCreate(f, polygon.shared); if (pf) front.push(pf); }
          if (b.length >= 3) { var pb = Polygon.tryCreate(b, polygon.shared); if (pb) back.push(pb); }
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
      if (this.back) back = this.back.clipPolygons(back); else back = [];
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
          if (polygonFar(p, bounds, eps)) out.push(p); else keep.push(p);
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

  function CSG() { this.polygons = []; this.bounds = null; }
  CSG.fromPolygons = function (polygons) {
    var csg = new CSG();
    csg.polygons = polygons;
    return csg;
  };
  // The booleans below are the classic BSP algorithm with a bounding-box early-out: both trees are built from every
  // polygon (so each one classifies space exactly), but a polygon whose own bounding box lies clear of the other
  // solid's bounding box is lifted out of its tree before the clipping and put back (or dropped) unchanged, since
  // no part of it can be inside the other solid. Two solids whose boxes do not meet skip the trees altogether.
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
      if (ba && bb && !boundsOverlap(ba, bb, eps)) return CSG.fromPolygons(clonePolys(this.polygons).concat(clonePolys(csg.polygons)));
      var a = new Node(clonePolys(this.polygons));
      var b = new Node(clonePolys(csg.polygons));
      var far = [];
      if (ba && bb) { a.extractFar(bb, eps, far); b.extractFar(ba, eps, far); }
      a.clipTo(b);
      b.clipTo(a);
      b.invert();
      b.clipTo(a);
      b.invert();
      a.build(b.allPolygons());
      return CSG.fromPolygons(a.allPolygons().concat(far));
    },
    subtract: function (csg) {
      var ba = this.getBounds(), bb = csg.getBounds(), eps = ba && bb ? farEps(ba, bb) : 0;
      if (ba && bb && !boundsOverlap(ba, bb, eps)) return CSG.fromPolygons(clonePolys(this.polygons));
      var a = new Node(clonePolys(this.polygons));
      var b = new Node(clonePolys(csg.polygons));
      var far = [];
      // A's far polygons survive untouched; B's far polygons lie outside A and take nothing away
      if (ba && bb) { a.extractFar(bb, eps, far); b.extractFar(ba, eps, []); }
      a.invert();
      a.clipTo(b);
      b.clipTo(a);
      b.invert();
      b.clipTo(a);
      b.invert();
      a.build(b.allPolygons());
      a.invert();
      return CSG.fromPolygons(a.allPolygons().concat(far));
    },
    intersect: function (csg) {
      var ba = this.getBounds(), bb = csg.getBounds(), eps = ba && bb ? farEps(ba, bb) : 0;
      if (ba && bb && !boundsOverlap(ba, bb, eps)) return CSG.fromPolygons([]);
      var a = new Node(clonePolys(this.polygons));
      var b = new Node(clonePolys(csg.polygons));
      // far polygons of either solid lie outside the other and cannot be part of the intersection
      if (ba && bb) { a.extractFar(bb, eps, []); b.extractFar(ba, eps, []); }
      a.invert();
      b.clipTo(a);
      b.invert();
      a.clipTo(b);
      b.clipTo(a);
      a.build(b.allPolygons());
      a.invert();
      return CSG.fromPolygons(a.allPolygons());
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
  return CSG;
})();
