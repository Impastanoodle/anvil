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
    build: function (polygons) {
      if (!polygons.length) return;
      if (!this.plane) this.plane = polygons[(polygons.length / 2) | 0].plane.clone();
      var front = [], back = [];
      for (var i = 0; i < polygons.length; i++) this.plane.splitPolygon(polygons[i], this.polygons, this.polygons, front, back);
      if (front.length) { if (!this.front) this.front = new Node(); this.front.build(front); }
      if (back.length) { if (!this.back) this.back = new Node(); this.back.build(back); }
    }
  };

  function CSG() { this.polygons = []; }
  CSG.fromPolygons = function (polygons) {
    var csg = new CSG();
    csg.polygons = polygons;
    return csg;
  };
  CSG.prototype = {
    clone: function () { return CSG.fromPolygons(this.polygons.map(function (p) { return p.clone(); })); },
    toPolygons: function () { return this.polygons; },
    union: function (csg) {
      var a = new Node(this.clone().polygons);
      var b = new Node(csg.clone().polygons);
      a.clipTo(b);
      b.clipTo(a);
      b.invert();
      b.clipTo(a);
      b.invert();
      a.build(b.allPolygons());
      return CSG.fromPolygons(a.allPolygons());
    },
    subtract: function (csg) {
      var a = new Node(this.clone().polygons);
      var b = new Node(csg.clone().polygons);
      a.invert();
      a.clipTo(b);
      b.clipTo(a);
      b.invert();
      b.clipTo(a);
      b.invert();
      a.build(b.allPolygons());
      a.invert();
      return CSG.fromPolygons(a.allPolygons());
    },
    intersect: function (csg) {
      var a = new Node(this.clone().polygons);
      var b = new Node(csg.clone().polygons);
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

  CSG.Vector = Vector;
  CSG.Vertex = Vertex;
  CSG.Plane = Plane;
  CSG.Polygon = Polygon;
  CSG.Node = Node;
  return CSG;
})();
