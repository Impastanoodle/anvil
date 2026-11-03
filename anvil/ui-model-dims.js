// ---- Smart Dimension on the model (lane model-dims, rfHK, 2026-11-03) ----------------------------------------------
// In a part with no sketch open, Smart Dimension (ribbon / D) dimensions the solid itself, as SolidWorks lets you
// dimension model geometry. The dimensions MEASURE the solid (user, 2026-11-03: "we are measuring dimensions not doing
// real time editing of solids with dimensions"): nothing here changes a feature.
//   one straight edge -> its length; one circular edge or cylindrical face -> Ø (a whole circle / hole) or R (an arc,
//   a partial cylinder such as a fillet); two parallel planar faces, edge + edge, vertex + vertex / edge / face,
//   face + parallel edge -> the distance (vertex / centre pairs: aligned or along X / Y / Z by where it is placed, as
//   the sketch tool's horizontal / vertical / aligned); two non-parallel faces / edges, or an edge and a face -> the
//   angle (its quadrant by where it is placed). Circular edges pair as their centre, cylinders as their axis.
// Click the items (pre-highlighted on hover), then a spot to place (empty space, or any face once a length / Ø / R
// is on the cursor). The dimension is drawn in 3D (extension
// lines, arrows, text facing the screen, constant pixel size as sketch dimensions), in the document's units.
// Saved in the model as `model.modelDims: [{ id, kind, refs: [ref, ref?], off: [dx, dy, dz], mode?, value, at }]`.
// A ref re-finds its face / edge / vertex after every rebuild by the creating feature id and the face normals
// (stable ids, as Anvil's fillet / chamfer picks re-resolve), nearest the last place; one that is gone is drawn red
// (dangling). Click a label to select it (drag it to move it); Delete removes it; Ctrl+Z undoes; View ▸ Model
// Dimensions hides them all. Test / script API at the end (UI.modelDims, UI.modelDimTool, UI.modelDimsShown).
if (typeof UI !== 'undefined') (function (UI) {
  'use strict';
  var App = UI.App, K = UI.K, V = UI.V, el = UI.el, viewport = UI.viewport;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var md = { on: false, picks: [], cursor: null, selId: null, cache: null, hidden: false, drag: null };

  function svg(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }
  function isAsm() { return !!(UI.isAssembly && UI.isAssembly()); }
  function drawingOn() { return !!(UI.drawingActive && UI.drawingActive()); }
  function partReady() { return App.mode === 'part' && !isAsm() && !drawingOn() && !!App.mesh && !!App.model; }
  function dims() { return (App.model && Array.isArray(App.model.modelDims)) ? App.model.modelDims : []; }
  function size() {
    var bb = App.mesh && App.mesh._mdBox;
    if (!bb && App.mesh && App.mesh.positions) {
      var p = App.mesh.positions, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (var i = 0; i < p.length; i += 3) for (var k = 0; k < 3; k++) { if (p[i + k] < lo[k]) lo[k] = p[i + k]; if (p[i + k] > hi[k]) hi[k] = p[i + k]; }
      bb = App.mesh._mdBox = Math.max(1e-6, V.len(V.sub(hi, lo)));
    }
    return bb || 1;
  }
  function tol() { return 1e-6 * Math.max(1, size()); }
  function camDir() { return [UI.cam.dir.x, UI.cam.dir.y, UI.cam.dir.z]; }
  function perpOf(d) { var a = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; return V.norm(V.cross(d, a)); }
  function S(p) { return UI.worldToScreen(p); }

  // ------------------------------------------------------------------ geometry of mesh items
  function faceFid(i) { var fc = App.mesh.faces[i]; return fc && App.triShared ? App.triShared[fc.start] : null; }
  function faceSurf(i) { var fc = App.mesh.faces[i]; return fc && fc.polys && fc.polys[0] && fc.polys[0].surf ? fc.polys[0].surf.s || fc.polys[0].surf : null; }
  function group(i) { return UI.faceGroup ? UI.faceGroup(i) : [i]; }
  function faceVerts(i) {
    var out = [], seen = {};
    group(i).forEach(function (j) {
      var fc = App.mesh.faces[j];
      (fc && fc.polys || []).forEach(function (p) {
        p.vertices.forEach(function (v) {
          var q = [v.pos.x, v.pos.y, v.pos.z], k = q.map(function (x) { return Math.round(x * 1e5); }).join(',');
          if (!seen[k]) { seen[k] = 1; out.push(q); }
        });
      });
    });
    return out;
  }
  // distance from p to a mesh face group (its convex polygons)
  function faceDist(i, p) {
    var best = Infinity;
    group(i).forEach(function (j) {
      var fc = App.mesh.faces[j];
      (fc && fc.polys || []).forEach(function (pg) {
        var vs = pg.vertices.map(function (v) { return [v.pos.x, v.pos.y, v.pos.z]; });
        if (vs.length < 3) return;
        var n = V.norm(V.cross(V.sub(vs[1], vs[0]), V.sub(vs[2], vs[0])));
        if (!isFinite(n[0])) return;
        var h = V.dot(V.sub(p, vs[0]), n), q = V.sub(p, V.scale(n, h)), inside = true, sign = 0, dmin = Infinity;
        for (var k = 0; k < vs.length; k++) {
          var a = vs[k], b = vs[(k + 1) % vs.length], c = V.dot(V.cross(V.sub(b, a), V.sub(q, a)), n);
          if (Math.abs(c) > 1e-12) { if (!sign) sign = c > 0 ? 1 : -1; else if ((c > 0 ? 1 : -1) !== sign) inside = false; }
          dmin = Math.min(dmin, K.pointSegmentDistance(q, a, b));
        }
        var d = inside ? Math.abs(h) : Math.hypot(h, dmin);
        if (d < best) best = d;
      });
    });
    return best;
  }
  function faceSig(i, n) { var curved = !!faceSurf(i); return { fid: faceFid(i), n: curved ? null : (n || App.mesh.faces[i].normal).slice() }; }
  function sigMatch(a, b) {
    if (a.fid !== b.fid) return false;
    if (!a.n || !b.n) return !a.n && !b.n;
    return V.dot(a.n, b.n) > 0.999;
  }
  function edgeSig(e) { return [faceSig(e.faces[0], e.normals[0]), faceSig(e.faces[1], e.normals[1])]; }
  function sigPairMatch(s, t) { return (sigMatch(s[0], t[0]) && sigMatch(s[1], t[1])) || (sigMatch(s[0], t[1]) && sigMatch(s[1], t[0])); }
  function straightEdges() { return (App.edges || []).filter(function (e) { return !e.smooth && e.faces.length === 2 && e.curve == null; }); }
  // a straight edge may be split in pieces by the booleans: the whole edge is every collinear piece with the same two
  // faces joined end to end
  function wholeEdge(e) {
    var d = V.norm(V.sub(e.b, e.a)), sig = edgeSig(e), t = Math.max(tol() * 10, 1e-7), lo = 0, hi = V.dot(V.sub(e.b, e.a), d), ivs = [];
    straightEdges().forEach(function (f) {
      if (f === e || Math.abs(Math.abs(V.dot(V.norm(V.sub(f.b, f.a)), d)) - 1) > 1e-6) return;
      if (lineDist(f.a, e.a, d) > t || lineDist(f.b, e.a, d) > t || !sigPairMatch(edgeSig(f), sig)) return;
      var s0 = V.dot(V.sub(f.a, e.a), d), s1 = V.dot(V.sub(f.b, e.a), d);
      ivs.push([Math.min(s0, s1), Math.max(s0, s1)]);
    });
    ivs.sort(function (x, y) { return x[0] - y[0]; });
    var grew = true;
    while (grew) {
      grew = false;
      for (var k = 0; k < ivs.length; k++) {
        if (ivs[k][1] < lo - t || ivs[k][0] > hi + t) continue;
        if (ivs[k][0] < lo - t || ivs[k][1] > hi + t) { lo = Math.min(lo, ivs[k][0]); hi = Math.max(hi, ivs[k][1]); grew = true; }
        ivs.splice(k, 1); k--;
      }
    }
    return { a: V.add(e.a, V.scale(d, lo)), b: V.add(e.a, V.scale(d, hi)), d: d, normals: e.normals.slice() };
  }
  function lineDist(p, o, d) { var v = V.sub(p, o); return V.len(V.sub(v, V.scale(d, V.dot(v, d)))); }
  function footOnLine(p, o, d) { return V.add(o, V.scale(d, V.dot(V.sub(p, o), d))); }
  // vertices (ends of the sharp edges) with the faces round them, cached per mesh
  function vertexList() {
    if (md.vtx && md.vtx.mesh === App.mesh) return md.vtx.list;
    var seen = {}, list = [];
    // the ends of straight edges: a circle's facet chords end at points that are no vertices of the model
    straightEdges().forEach(function (e) {
      [e.a, e.b].forEach(function (p) {
        var k = p.map(function (x) { return Math.round(x * 1e5); }).join(','), v = seen[k];
        if (!v) { v = seen[k] = { point: p.slice(), sigs: [] }; list.push(v); }
        edgeSig(e).forEach(function (s) { if (!v.sigs.some(function (t) { return sigMatch(s, t); })) v.sigs.push(s); });
      });
    });
    md.vtx = { mesh: App.mesh, list: list };
    return list;
  }
  function vertexAt(p) {
    var best = null, bd = Infinity;
    vertexList().forEach(function (v) { var d = V.len(V.sub(v.point, p)); if (d < bd) { bd = d; best = v; } });
    return best;
  }
  // a cylinder face group: its axis, radius, and whether it goes all the way round
  function cylInfo(i, at) {
    var s = faceSurf(i);
    if (!s || (s.t !== 'cyl' && s.t !== 'cone') || !s.d) return null;
    var d = V.norm(s.d), o = s.o, r = s.r, x = perpOf(d), y = V.cross(d, x), angs = [];
    faceVerts(i).forEach(function (q) { var v = V.sub(q, o); angs.push(Math.atan2(V.dot(v, y), V.dot(v, x))); });
    angs.sort(function (a, b) { return a - b; });
    var gap = angs.length ? angs[0] + 2 * Math.PI - angs[angs.length - 1] : 2 * Math.PI;
    for (var k = 1; k < angs.length; k++) gap = Math.max(gap, angs[k] - angs[k - 1]);
    if (s.t === 'cone' && s.k) { var hh = V.dot(V.sub(at || o, o), d); r = r + s.k * hh; }
    return { o: o, d: d, r: r, full: gap < Math.PI / 3, cone: s.t === 'cone' };
  }
  function circleOfCurve(ci) {
    var c = App.curves && App.curves[ci] && App.curves[ci].curve;
    if (!c) return null;
    return { c: c.center.slice(), n: V.norm(c.normal), r: c.radius, full: c.a1 - c.a0 >= 2 * Math.PI - 1e-6, xdir: c.xdir ? c.xdir.slice() : null };
  }
  function curveSig(ci) {
    var cv = App.curves[ci], e = cv && cv.edges && cv.edges[0];
    return e ? edgeSig(e).map(function (s) { return s.fid; }) : [];
  }

  // ------------------------------------------------------------------ refs: made from a pick, re-found after a rebuild
  function refFromPick(pk) {
    if (!pk || !App.mesh) return null;
    if (pk.kind === 'vertex' && pk.point && pk.index !== -1) { var v = vertexAt(pk.point); return v ? { k: 'vertex', at: v.point.slice(), sigs: v.sigs } : null; }
    if (pk.kind === 'edge' && pk.edge) {
      var e = pk.edge;
      if (e.curve != null) { var c = circleOfCurve(e.curve); return c ? { k: 'circle', c: c.c, n: c.n, r: c.r, full: c.full, fids: curveSig(e.curve) } : null; }
      var w = wholeEdge(e);
      return { k: 'edge', at: V.scale(V.add(w.a, w.b), 0.5), d: w.d, sig: edgeSig(e) };
    }
    if (pk.kind === 'face' && App.mesh.faces[pk.index]) {
      var i = pk.index, at = pk.point || App.mesh.faces[i].centroid, s = faceSurf(i);
      if (s) { var cy = cylInfo(i, at); if (!cy) return null; return { k: 'face', fid: faceFid(i), body: App.mesh.faces[i].body || 0, surf: s.t, axis: cy.d, o: cy.o, at: at.slice() }; }
      return { k: 'face', fid: faceFid(i), body: App.mesh.faces[i].body || 0, n: App.mesh.faces[i].normal.slice(), at: at.slice() };
    }
    return null;
  }
  // -> a primitive { t: 'pt' | 'line' | 'plane' | 'circle' | 'cyl', ... } on the current mesh, or null (dangling)
  function resolve(ref) {
    if (!ref || !App.mesh) return null;
    if (ref.k === 'vertex') {
      var bestV = null, bdV = Infinity;
      vertexList().forEach(function (v) {
        if (!ref.sigs.every(function (s) { return v.sigs.some(function (t) { return sigMatch(s, t); }); })) return;
        var d = V.len(V.sub(v.point, ref.at));
        if (d < bdV) { bdV = d; bestV = v; }
      });
      return bestV ? { t: 'pt', p: bestV.point.slice(), at: bestV.point.slice() } : null;
    }
    if (ref.k === 'edge') {
      var bestE = null, bdE = Infinity;
      straightEdges().forEach(function (e) {
        if (Math.abs(Math.abs(V.dot(V.norm(V.sub(e.b, e.a)), ref.d)) - 1) > 1e-4 || !sigPairMatch(edgeSig(e), ref.sig)) return;
        var d = K.pointSegmentDistance(ref.at, e.a, e.b);
        if (d < bdE) { bdE = d; bestE = e; }
      });
      if (!bestE) return null;
      var w = wholeEdge(bestE);
      return { t: 'line', a: w.a, b: w.b, d: w.d, p: V.scale(V.add(w.a, w.b), 0.5), normals: w.normals, at: V.scale(V.add(w.a, w.b), 0.5) };
    }
    if (ref.k === 'circle') {
      var bestC = null, bdC = Infinity;
      (App.curves || []).forEach(function (cv, ci) {
        var c = circleOfCurve(ci);
        if (!c || Math.abs(V.dot(c.n, ref.n)) < 0.999 || c.full !== ref.full) return;
        var fs = curveSig(ci);
        if (ref.fids && ref.fids.length && fs.length && !ref.fids.some(function (f) { return fs.indexOf(f) >= 0; })) return;
        var d = V.len(V.sub(c.c, ref.c)) + 0.01 * Math.abs(c.r - ref.r);
        if (d < bdC) { bdC = d; bestC = c; }
      });
      return bestC ? { t: 'circle', c: bestC.c, n: bestC.n, r: bestC.r, full: bestC.full, xdir: bestC.xdir, p: bestC.c, at: bestC.c } : null;
    }
    if (ref.k === 'face') {
      var bestF = -1, bdF = Infinity, seen = {};
      App.mesh.faces.forEach(function (fc, i) {
        if (faceFid(i) !== ref.fid || (fc.body || 0) !== (ref.body || 0)) return;
        var g = group(i)[0];
        if (seen[g]) return;
        seen[g] = 1;
        var s = faceSurf(i);
        if (ref.surf) { if (!s || s.t !== ref.surf || !s.d || Math.abs(V.dot(V.norm(s.d), ref.axis)) < 0.999) return; }
        else if (s || V.dot(fc.normal, ref.n) < 0.9995) return;
        var d = faceDist(i, ref.at);
        if (d < bdF) { bdF = d; bestF = i; }
      });
      if (bestF < 0) return null;
      if (ref.surf) {
        var cy = cylInfo(bestF, ref.at);
        if (!cy) return null;
        var foot = footOnLine(ref.at, cy.o, cy.d);
        return { t: 'cyl', o: cy.o, d: cy.d, r: cy.r, full: cy.full, c: foot, n: cy.d, p: foot, fi: bestF, at: foot };
      }
      var fc = App.mesh.faces[bestF];
      return { t: 'plane', n: fc.normal.slice(), p: fc.centroid.slice(), verts: faceVerts(bestF), fi: bestF, at: fc.centroid.slice() };
    }
    return null;
  }

  // ------------------------------------------------------------------ what a set of items measures
  function role(pr) {
    if (pr.t === 'pt') return { t: 'pt', p: pr.p };
    if (pr.t === 'circle') return { t: 'pt', p: pr.c };
    if (pr.t === 'line') return { t: 'line', p: pr.p, d: pr.d };
    if (pr.t === 'cyl') return { t: 'line', p: pr.p, d: pr.d };
    return { t: 'plane', p: pr.p, n: pr.n };
  }
  // the dimension kind for the picks (prims) or null
  function kindFor(prs) {
    if (prs.length === 1) {
      var a = prs[0];
      if (a.t === 'line') return 'len';
      if (a.t === 'circle' || a.t === 'cyl') return a.full ? 'dia' : 'rad';
      return null;
    }
    if (prs.length !== 2) return null;
    var A = role(prs[0]), B = role(prs[1]);
    if (A.t === 'pt' || B.t === 'pt') return 'dist';
    if (A.t === 'line' && B.t === 'line') return Math.abs(Math.abs(V.dot(A.d, B.d)) - 1) < 1e-6 ? 'dist' : 'ang';
    if (A.t === 'plane' && B.t === 'plane') return Math.abs(Math.abs(V.dot(A.n, B.n)) - 1) < 1e-6 ? 'dist' : 'ang';
    var L = A.t === 'line' ? A : B, P = A.t === 'plane' ? A : B;
    return Math.abs(V.dot(L.d, P.n)) < 1e-6 ? 'dist' : 'ang';
  }
  function anchorOf(kind, prs) {
    if (kind === 'dia' || kind === 'rad') return prs[0].c;
    if (kind === 'len') return V.scale(V.add(prs[0].a, prs[0].b), 0.5);
    if (kind === 'ang') { var g = angleGeom(prs, null); return g ? g.X : prs[0].p; }
    return V.scale(V.add(role(prs[0]).p, role(prs[1]).p), 0.5);
  }
  // face points the extension line starts from: the face's vertex furthest along o, nearest the line P..Q sideways
  function facePoint(pr, o, t, ref) {
    var vs = pr.verts && pr.verts.length ? pr.verts : [pr.p], mx = -Infinity;
    vs.forEach(function (q) { mx = Math.max(mx, V.dot(q, o)); });
    var best = null, bd = Infinity, eps = 1e-6 * Math.max(1, size());
    vs.forEach(function (q) { if (V.dot(q, o) < mx - eps) return; var d = Math.abs(V.dot(V.sub(q, ref), t)); if (d < bd) { bd = d; best = q; } });
    return best || pr.p;
  }
  // a linear dimension's points, direction and value: { P, Q, d (unit, P -> Q), value }
  function linearGeom(kind, prs, off, mode) {
    if (kind === 'len') { var e = prs[0]; return { P: e.a, Q: e.b, d: e.d, value: V.len(V.sub(e.b, e.a)) }; }
    var A = role(prs[0]), B = role(prs[1]), P, Q, d;
    if (A.t === 'plane' && B.t !== 'plane') { var x = A; A = B; B = x; }
    if (A.t === 'line' && B.t === 'pt') { var y = A; A = B; B = y; }
    if (A.t === 'pt' && B.t === 'pt') {
      P = A.p; Q = B.p;
      var D = V.sub(Q, P);
      if (mode === 'x' || mode === 'y' || mode === 'z') {
        var k = { x: 0, y: 1, z: 2 }[mode], ax = [0, 0, 0];
        ax[k] = D[k] < 0 ? -1 : 1;
        return { P: P, Q: Q, d: ax, value: Math.abs(D[k]) };
      }
      d = V.len(D) > 1e-12 ? V.norm(D) : [1, 0, 0];
      return { P: P, Q: Q, d: d, value: V.len(D) };
    }
    if (A.t === 'pt' && B.t === 'line') { P = A.p; Q = footOnLine(P, B.p, B.d); }
    else if (A.t === 'pt' && B.t === 'plane') { P = A.p; Q = V.sub(P, V.scale(B.n, V.dot(V.sub(P, B.p), B.n))); }
    else if (A.t === 'line' && B.t === 'line') { P = prs[0].t === 'line' ? footOnLine(prs[0].p, A.p, A.d) : A.p; Q = footOnLine(P, B.p, B.d); }
    else if (A.t === 'line' && B.t === 'plane') { P = A.p; Q = V.sub(P, V.scale(B.n, V.dot(V.sub(P, B.p), B.n))); }
    else {
      // two parallel planar faces: the extension lines start at the faces' edges on the dimension's side
      var n = A.n, h = V.dot(V.sub(B.p, A.p), n);
      d = h < 0 ? V.scale(n, -1) : n;
      var o = off ? V.sub(off, V.scale(d, V.dot(off, d))) : null;
      o = o && V.len(o) > 1e-9 ? V.norm(o) : perpOf(d);
      var t = V.cross(d, o), pa = prs[0].t === 'plane' ? prs[0] : prs[1], pb = pa === prs[0] ? prs[1] : prs[0];
      P = facePoint(pa, o, t, pa.at || pa.p);
      Q = facePoint(pb, o, t, P);
      return { P: P, Q: Q, d: d, value: Math.abs(h) };
    }
    var DQ = V.sub(Q, P), L = V.len(DQ);
    d = L > 1e-12 ? V.scale(DQ, 1 / L) : (B.n || perpOf(A.d || [0, 0, 1]));
    return { P: P, Q: Q, d: d, value: L };
  }
  // an angle: vertex X, unit rays u1 / u2 (towards the items), the plane's normal; quadrant from off
  function angleGeom(prs, off) {
    var A = role(prs[0]), B = role(prs[1]), X, u1, u2;
    if (A.t === 'line' && B.t === 'line') {
      var w0 = V.sub(A.p, B.p), a = V.dot(A.d, A.d), b = V.dot(A.d, B.d), c = V.dot(B.d, B.d), dd = V.dot(A.d, w0), e = V.dot(B.d, w0), den = a * c - b * b;
      if (Math.abs(den) < 1e-12) return null;
      var sA = (b * e - c * dd) / den, sB = (a * e - b * dd) / den;
      X = V.scale(V.add(V.add(A.p, V.scale(A.d, sA)), V.add(B.p, V.scale(B.d, sB))), 0.5);
      u1 = A.d; u2 = B.d;
    } else if (A.t === 'plane' && B.t === 'plane') {
      var L = V.cross(A.n, B.n);
      if (V.len(L) < 1e-9) return null;
      L = V.norm(L);
      // a point on both planes nearest the middle of the two faces
      var m = V.scale(V.add(A.p, B.p), 0.5), n1 = A.n, n2 = B.n, d1 = V.dot(n1, A.p), d2 = V.dot(n2, B.p);
      var p0 = V.scale(V.add(V.scale(V.cross(n2, L), d1), V.scale(V.cross(L, n1), d2)), 1 / V.dot(V.cross(n1, n2), L));
      X = footOnLine(m, p0, L);
      u1 = V.norm(V.cross(L, n1)); u2 = V.norm(V.cross(L, n2));
    } else {
      var Ln = A.t === 'line' ? A : B, Pl = A.t === 'plane' ? A : B, dn = V.dot(Ln.d, Pl.n);
      if (Math.abs(dn) < 1e-9) return null;
      X = V.add(Ln.p, V.scale(Ln.d, V.dot(V.sub(Pl.p, Ln.p), Pl.n) / dn));
      var proj = V.sub(Ln.d, V.scale(Pl.n, dn));
      var uL = Ln.d, uP = V.len(proj) > 1e-9 ? V.norm(proj) : perpOf(Pl.n);
      if (A.t === 'line') { u1 = uL; u2 = uP; } else { u1 = uP; u2 = uL; }
    }
    // rays point from X towards each item (its middle), so the default angle is the one the items make
    function toward(u, pr) { var q = pr.t === 'line' ? V.scale(V.add(pr.a, pr.b), 0.5) : pr.t === 'plane' ? pr.p : pr.p; return V.dot(V.sub(q, X), u) < 0 ? V.scale(u, -1) : u; }
    u1 = toward(u1, prs[0]); u2 = toward(u2, prs[1]);
    var N = V.cross(u1, u2);
    if (V.len(N) < 1e-9) return null;
    N = V.norm(N);
    var s1 = 1, s2 = 1;
    if (off) {
      var w = V.sub(off, V.scale(N, V.dot(off, N)));
      if (V.len(w) > 1e-9) {
        w = V.norm(w);
        var bestS = null, bErr = Infinity;
        [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (sg) {
          var r1 = V.scale(u1, sg[0]), r2 = V.scale(u2, sg[1]);
          var t = angBetween(r1, r2), err = angBetween(r1, w) + angBetween(w, r2) - t;
          if (err < bErr - 1e-9) { bErr = err; bestS = sg; }
        });
        if (bestS) { s1 = bestS[0]; s2 = bestS[1]; }
      }
    }
    var e1 = V.scale(u1, s1), e2 = V.scale(u2, s2);
    return { X: X, e1: e1, e2: e2, value: angBetween(e1, e2) * 180 / Math.PI };
  }
  function angBetween(a, b) { return Math.acos(Math.max(-1, Math.min(1, V.dot(a, b)))); }

  // the measured dimension, ready to draw: { kind, value, text, anchor, ... } or null
  function measure(dim, prs) {
    var kind = dim.kind, off = dim.off || [0, 0, 0], u = UI.unitLabel();
    if (kind === 'dia' || kind === 'rad') {
      var c = prs[0], r = c.r, value = kind === 'dia' ? 2 * r : r;
      return { kind: kind, value: value, text: (kind === 'dia' ? 'Ø' : 'R') + UI.fmtDim(value), C: c.c, n: c.n, r: r, xdir: c.xdir, anchor: c.c, unit: u };
    }
    if (kind === 'ang') {
      var g = angleGeom(prs, off);
      if (!g) return null;
      return { kind: 'ang', value: g.value, text: UI.fmtNum(g.value, 2) + '°', X: g.X, e1: g.e1, e2: g.e2, anchor: g.X };
    }
    var anchor = anchorOf(kind, prs), lg = linearGeom(kind, prs, off, dim.mode);
    if (!lg) return null;
    return { kind: kind, value: lg.value, text: UI.fmtDim(lg.value), P: lg.P, Q: lg.Q, d: lg.d, anchor: anchor, unit: u };
  }

  // resolved prims per dimension, per mesh
  function primsOf(dim) {
    if (!md.cache || md.cache.mesh !== App.mesh || md.cache.model !== App.model) md.cache = { mesh: App.mesh, model: App.model, map: new Map() };
    var hit = md.cache.map.get(dim);
    if (hit !== undefined) return hit;
    var prs = (dim.refs || []).map(resolve);
    if (prs.some(function (p) { return !p; }) || !kindFor(prs)) prs = null;
    md.cache.map.set(dim, prs);
    return prs;
  }
  function measured(dim) {
    var prs = primsOf(dim), m = prs && measure(dim, prs);
    if (m) { md.last = md.last || {}; md.last[dim.id] = m; }
    return m;
  }

  // ------------------------------------------------------------------ placement: the click point in 3D
  function unproject(mx, my, anchor) {
    var n = camDir(), x = perpOf(n), pl = { origin: anchor, n: n, x: x, y: V.cross(n, x) };
    var uv = UI.screenToPlane(mx, my, pl);
    return uv ? K.to3D(pl, uv[0], uv[1]) : anchor;
  }
  // the offset of a linear dimension snaps to a model axis or one of the items' face normals within 30°, so a
  // dimension placed roughly beside the part lies in a model plane (SolidWorks places them in the faces' planes)
  function snapOffset(off, d, prs) {
    var oPerp = V.sub(off, V.scale(d, V.dot(off, d))), L = V.len(oPerp);
    if (L < 1e-12) return off;
    var cands = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    prs.forEach(function (p) { if (p.n) cands.push(p.n); (p.normals || []).forEach(function (n) { cands.push(n); }); });
    var best = null, bc = Math.cos(30 * Math.PI / 180);
    cands.forEach(function (c) {
      var cp = V.sub(c, V.scale(d, V.dot(c, d)));
      if (V.len(cp) < 0.9) return;
      cp = V.norm(cp);
      var cs = Math.abs(V.dot(cp, oPerp)) / L;
      if (cs > bc) { bc = cs; best = cp; }
    });
    var o = best ? V.scale(best, V.dot(oPerp, best)) : oPerp;
    return V.add(o, V.scale(d, V.dot(off, d)));
  }
  // points / centres: aligned, or along X, Y or Z when placed beyond both points across that axis on screen (the
  // sketch tool's horizontal / vertical / aligned rule, with the model axes)
  function pointMode(prs, mx, my) {
    var A = role(prs[0]), B = role(prs[1]);
    if (A.t !== 'pt' || B.t !== 'pt') return null;
    var D = V.sub(B.p, A.p), sP = S(A.p), sQ = S(B.p), best = null, bm = 0;
    ['x', 'y', 'z'].forEach(function (m, k) {
      if (Math.abs(D[k]) < tol() * 10) return;
      var ax = [0, 0, 0]; ax[k] = 1;
      var s0 = S(A.p), s1 = S(V.add(A.p, ax)), u = [s1[0] - s0[0], s1[1] - s0[1]], ul = Math.hypot(u[0], u[1]);
      if (ul < 1e-6) return;
      u = [u[0] / ul, u[1] / ul];
      var nrm = [-u[1], u[0]], tP = sP[0] * u[0] + sP[1] * u[1], tQ = sQ[0] * u[0] + sQ[1] * u[1], tW = mx * u[0] + my * u[1];
      if (tW < Math.min(tP, tQ) || tW > Math.max(tP, tQ)) return;
      var nP = sP[0] * nrm[0] + sP[1] * nrm[1], nQ = sQ[0] * nrm[0] + sQ[1] * nrm[1], nW = mx * nrm[0] + my * nrm[1];
      var margin = nW > Math.max(nP, nQ) ? nW - Math.max(nP, nQ) : Math.min(nP, nQ) - nW;
      if (margin > 4 && margin > bm) { bm = margin; best = m; }
    });
    if (!best) return 'aligned';
    // only one axis between the points: that is the aligned distance too
    var nz = [0, 1, 2].filter(function (k) { return Math.abs(D[k]) >= tol() * 10; }).length;
    return nz <= 1 ? 'aligned' : best;
  }
  function placeFor(kind, prs, mx, my) {
    var probe = { kind: kind, refs: [], off: [0, 0, 0] };
    var mode = kind === 'dist' ? pointMode(prs, mx, my) : null;
    probe.mode = mode || undefined;
    var anchor = anchorOf(kind, prs), W = unproject(mx, my, anchor), off = V.sub(W, anchor);
    if (kind === 'len' || kind === 'dist') {
      var lg = linearGeom(kind, prs, off, probe.mode);
      if (lg) off = snapOffset(off, lg.d, prs);
    }
    probe.off = off;
    return probe;
  }

  // ------------------------------------------------------------------ drawing
  (function css() {
    var st = document.createElement('style');
    st.id = 'model-dims-style';
    st.textContent = [
      '#mdim-layer { position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; overflow: visible; }',
      '#mdim-layer path.mdh { fill: none; stroke: rgba(30,30,30,0.9); stroke-width: 3; }',
      '#mdim-layer path.mdl { fill: none; stroke: #c8c8c8; stroke-width: 1; }',
      '#mdim-layer path.mda { fill: #c8c8c8; stroke: rgba(30,30,30,0.9); stroke-width: 1.5; stroke-linejoin: round; paint-order: stroke; }',
      '#mdim-layer text { font: 13px "Century Gothic", "URW Gothic", "URW Gothic L", "TeX Gyre Adventor", "Avant Garde", Futura, "Segoe UI", Arial, sans-serif; fill: #f2f2f2; paint-order: stroke; stroke: rgba(30,30,30,0.9); stroke-width: 2.5px; stroke-linejoin: round; pointer-events: auto; cursor: pointer; user-select: none; font-variant-numeric: tabular-nums; }',
      '#mdim-layer .mdim:hover text { fill: #ff9a2e; }',
      '#mdim-layer .mdim.sel path.mdl { stroke: #ffd400; } #mdim-layer .mdim.sel path.mda { fill: #ffd400; } #mdim-layer .mdim.sel text { fill: #ffd400; }',
      '#mdim-layer .mdim.dangling path.mdl { stroke: #ff5a52; } #mdim-layer .mdim.dangling path.mda { fill: #ff5a52; } #mdim-layer .mdim.dangling text { fill: #ff5a52; }',
      '#mdim-layer .mdim.temp path.mdl { stroke: #ff9a2e; stroke-dasharray: 4 3; } #mdim-layer .mdim.temp path.mda { fill: #ff9a2e; } #mdim-layer .mdim.temp text { fill: #ff9a2e; pointer-events: none; }'
    ].join('\n');
    document.head.appendChild(st);
  })();
  var layer = svg('svg', { id: 'mdim-layer', 'aria-hidden': 'true' });
  viewport.appendChild(layer);

  function r2(v) { return Math.round(v * 100) / 100; }
  function pathOf(lines) { return lines.map(function (l) { return 'M' + r2(l[0][0]) + ' ' + r2(l[0][1]) + 'L' + r2(l[1][0]) + ' ' + r2(l[1][1]); }).join('') || 'M0 0'; }
  var ARROW_L = 10, ARROW_HW = 1.7;
  function arrowPath(tip, u) {
    var ax = u[0] * ARROW_L, ay = u[1] * ARROW_L, px = -u[1] * ARROW_HW, py = u[0] * ARROW_HW;
    return 'M' + r2(tip[0]) + ' ' + r2(tip[1]) + 'L' + r2(tip[0] - ax + px) + ' ' + r2(tip[1] - ay + py) + 'L' + r2(tip[0] - ax - px) + ' ' + r2(tip[1] - ay - py) + 'Z';
  }
  // screen layout of one measured dimension -> { d (lines), arrows, text: { x, y, anchor }, label }
  function layout(m, off) {
    var s = UI.cam.scale;
    if (m.kind === 'dia' || m.kind === 'rad') {
      var n = m.n, oIn = V.sub(off, V.scale(n, V.dot(off, n)));
      var x = m.xdir && Math.abs(V.dot(m.xdir, n)) < 1e-6 ? V.norm(m.xdir) : perpOf(n), y = V.cross(n, x);
      var ang = V.len(oIn) > 1e-12 ? Math.atan2(V.dot(oIn, y), V.dot(oIn, x)) * 180 / Math.PI : 45;
      var pl = { origin: m.C, x: x, y: y, n: n }, sc = UI.radialDimScreen(pl, [0, 0], m.r, ang, V.len(oIn));
      sc.label = m.text;
      return UI.dimLayout(sc);
    }
    if (m.kind === 'ang') {
      // the arc lies in the plane square to the angle's axis through the place point (slid along the edge / face
      // line to where it was placed), its radius the place point's distance from the axis
      var Nn = V.norm(V.cross(m.e1, m.e2)), along = V.dot(off, Nn), X0 = V.add(m.X, V.scale(Nn, along));
      var rho = V.len(V.sub(off, V.scale(Nn, along)));
      if (rho < 30 * s) rho = 30 * s;
      m = { X: X0, e1: m.e1, e2: m.e2, value: m.value, text: m.text };
      var e1 = m.e1, e2p = V.sub(m.e2, V.scale(e1, V.dot(m.e2, e1)));
      if (V.len(e2p) < 1e-9) return null;
      e2p = V.norm(e2p);
      var th = m.value * Math.PI / 180, nseg = Math.max(8, Math.ceil(th / (Math.PI / 48))), pts = [];
      for (var k = 0; k <= nseg; k++) { var t = th * k / nseg; pts.push(S(V.add(m.X, V.add(V.scale(e1, rho * Math.cos(t)), V.scale(e2p, rho * Math.sin(t)))))); }
      var lines = [];
      for (var j = 0; j < nseg; j++) lines.push([pts[j], pts[j + 1]]);
      var ext = 4 * s, sX = S(m.X), r1 = S(V.add(m.X, V.scale(e1, rho + ext))), r2p = S(V.add(m.X, V.scale(m.e2, rho + ext)));
      lines.push([sX, r1], [sX, r2p]);
      function u2(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; }
      var arrows = arrowPath(pts[0], u2(pts[1], pts[0])) + arrowPath(pts[nseg], u2(pts[nseg - 1], pts[nseg]));
      var mid = pts[Math.round(nseg / 2)], dirOut = u2(sX, mid), w = UI.dimTextWidth ? UI.dimTextWidth(m.text) : m.text.length * 7;
      var tx = mid[0] + dirOut[0] * (w / 2 + 6), ty = mid[1] + dirOut[1] * 10 + 4;
      return { d: pathOf(lines), arrows: arrows, text: { x: tx, y: ty, anchor: 'middle' } };
    }
    // linear: a plane through P spanned by d and the offset's square part; linearDimScreen / dimLayout as sketches
    var d = m.d, Wl = V.add(m.anchor, off), o = V.sub(V.sub(Wl, m.P), V.scale(d, V.dot(V.sub(Wl, m.P), d)));
    var oy = V.len(o) > 1e-12 ? V.norm(o) : perpOf(d), h = V.dot(V.sub(Wl, m.P), oy);
    var plL = { origin: m.P, x: d, y: oy, n: V.cross(d, oy) }, Q2 = [V.dot(V.sub(m.Q, m.P), d), V.dot(V.sub(m.Q, m.P), oy)];
    var scL = UI.linearDimScreen(plL, [0, 0], Q2, [1, 0], h, null);
    scL.label = m.text;
    return UI.dimLayout(scL);
  }
  function drawOne(dim, m, cls) {
    var g = svg('g', { 'class': 'mdim ' + cls, 'data-id': dim.id != null ? String(dim.id) : '' }, layer);
    var lay = m ? layout(m, dim.off || [0, 0, 0]) : null;
    if (lay) {
      svg('path', { 'class': 'mdh', d: lay.d }, g);
      svg('path', { 'class': 'mdl', d: lay.d }, g);
      svg('path', { 'class': 'mda', d: lay.arrows }, g);
    }
    var at = lay ? lay.text : null;
    if (!at) { var sp = S(dim.at || [0, 0, 0]); at = { x: sp[0], y: sp[1], anchor: 'middle' }; }
    var tx = svg('text', { x: r2(at.x), y: r2(at.y), 'text-anchor': at.anchor || 'middle' }, g);
    tx.textContent = m ? m.text : (dim.text || '?');
    if (cls.indexOf('temp') < 0) {
      tx.addEventListener('mousedown', function (ev) { if (ev.button !== 0) return; ev.stopPropagation(); ev.preventDefault(); pressLabel(dim, ev); });
      tx.addEventListener('dblclick', function (ev) { ev.stopPropagation(); ev.preventDefault(); });
    }
    return g;
  }
  function draw() {
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    if (!App.model || App.mode !== 'part' || isAsm() || drawingOn() || !App.mesh) return;
    if (!md.hidden) dims().forEach(function (dim) {
      var m = measured(dim), last = md.last && md.last[dim.id];
      var cls = (m ? '' : 'dangling') + (md.selId != null && dim.id === md.selId ? ' sel' : '');
      drawOne(dim, m || last || null, cls);
    });
    // the dimension on the cursor while placing
    if (md.on && md.cursor && md.picks.length) {
      var prs = md.picks.map(function (p) { return resolve(p.ref); });
      var kind = prs.every(Boolean) ? kindFor(prs) : null;
      if (kind) {
        var probe = placeFor(kind, prs, md.cursor[0], md.cursor[1]), m2 = measure(probe, prs);
        if (m2) drawOne(probe, m2, 'temp');
      }
    }
  }
  var baseDrawDims = UI.drawDims;
  UI.drawDims = function () {
    var r = baseDrawDims ? baseDrawDims.apply(this, arguments) : [];
    try { draw(); } catch (e) { console.warn('model dimensions: ' + (e && e.message)); }
    return r;
  };
  function redraw() { App.dimsStale = true; if (UI.requestRender) UI.requestRender(); }

  // ------------------------------------------------------------------ the tool
  var HINT = 'Smart Dimension on the model: click an edge, a circular edge or a cylinder face, or two faces / edges / vertices (a face first for a face-to-edge distance), then where the dimension should sit. Esc ends.';
  function start() {
    if (!partReady()) { UI.toast(isAsm() ? 'Smart Dimension on the model works in parts.' : 'Open a part first.'); return false; }
    md.on = true; md.picks = []; md.cursor = null;
    viewport.classList.add('tool-cross');
    viewport.setAttribute('data-sktool', 'dimension');
    UI.setStatus(HINT);
    if (UI.refreshRibbon) UI.refreshRibbon();
    redraw();
    return true;
  }
  function stop(quiet) {
    if (!md.on) return false;
    md.on = false; md.picks = []; md.cursor = null;
    viewport.classList.remove('tool-cross');
    if (viewport.getAttribute('data-sktool') === 'dimension') viewport.setAttribute('data-sktool', 'select');
    if (!quiet && UI.setSelection) UI.setSelection([], { quiet: true });
    if (UI.refreshRibbon) UI.refreshRibbon();
    redraw();
    return true;
  }
  function active() {
    if (md.on && (App.mode !== 'part' || isAsm() || drawingOn() || (UI.hasPM && UI.hasPM()) || App.command)) stop(true);
    return md.on;
  }
  // what the tool picks under the pointer: a vertex, an edge, a face (circular edges and cylinder faces included)
  function toolPick(mx, my) {
    var v = UI.pickVertex ? UI.pickVertex(mx, my) : null, mv = v && v.index !== -1 ? vertexAt(v.point) : null;
    if (mv && V.len(V.sub(mv.point, v.point)) < 1e-7) return v;
    return UI.pickEdge(mx, my) || UI.pickFace(mx, my);
  }
  function samePick(a, b) {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'face') { var ga = group(a.index), gb = group(b.index); return ga[0] === gb[0]; }
    if (a.kind === 'edge') return a.edge === b.edge || (a.edge.curve != null && a.edge.curve === b.edge.curve);
    return V.len(V.sub(a.point, b.point)) < 1e-9;
  }
  function pickedPrims() { return md.picks.map(function (p) { return resolve(p.ref); }); }
  function place(mx, my) {
    var prs = pickedPrims(), kind = prs.every(Boolean) ? kindFor(prs) : null;
    if (!kind) return false;
    var probe = placeFor(kind, prs, mx, my), m = measure(probe, prs);
    if (!m) return false;
    UI.pushUndo();
    var list = App.model.modelDims = Array.isArray(App.model.modelDims) ? App.model.modelDims : [];
    var id = list.reduce(function (mx2, d) { return Math.max(mx2, d.id || 0); }, 0) + 1;
    var dim = { id: id, kind: kind, refs: md.picks.map(function (p) { return p.ref; }), off: probe.off.map(round9), value: round9(m.value), text: m.text, at: m.anchor.map(round9) };
    if (probe.mode && probe.mode !== 'aligned') dim.mode = probe.mode;
    list.push(dim);
    md.picks = [];
    UI.setSelection([], { quiet: true });
    if (UI.autosave) UI.autosave();
    UI.setStatus('Dimension ' + m.text + (m.kind === 'ang' ? '' : ' ' + UI.unitLabel()) + ' added. Click the next item, or Esc to end.');
    redraw();
    return dim;
  }
  function round9(x) { return Math.round(x * 1e9) / 1e9; }
  function toolClick(mx, my) {
    var hit = toolPick(mx, my), prs = pickedPrims(), kind = prs.length && prs.every(Boolean) ? kindFor(prs) : null;
    // a length / Ø / R on the cursor is placed by a click on empty space or on a face (a hole sits inside its face:
    // the place is over it); an edge or vertex is a second item. Face first, then the edge, for an edge-face distance.
    if (kind && (!hit || md.picks.length >= 2 || (md.picks.length === 1 && hit.kind === 'face'))) { place(mx, my); return; }
    if (!hit) { if (md.picks.length) UI.setStatus('Select a second item (a face, edge or vertex) for this dimension.'); return; }
    for (var i = 0; i < md.picks.length; i++) if (samePick(md.picks[i].pick, hit)) { md.picks.splice(i, 1); syncSel(); return; }
    var ref = refFromPick(hit);
    if (!ref || !resolve(ref)) { UI.toast('That item cannot be dimensioned.'); return; }
    md.picks.push({ pick: hit, ref: ref });
    var prs2 = pickedPrims(), k2a = md.picks.length === 2 ? kindFor(prs2) : null;
    if (md.picks.length === 2 && !k2a) { md.picks = [{ pick: hit, ref: ref }]; UI.toast('These two items cannot be dimensioned together.'); }
    else if (k2a === 'dist') {
      var lg0 = linearGeom('dist', prs2, null, null);
      if (!lg0 || lg0.value < tol() * 10) { md.picks = [{ pick: hit, ref: ref }]; UI.toast('These two items lie at zero distance: nothing to dimension.'); }
    }
    syncSel();
    var k2 = kindFor(pickedPrims());
    UI.setStatus(k2 ? 'Click where the dimension should sit' + (md.picks.length < 2 ? ', or a second item' : '') + '.' : 'Select a second item for this dimension.');
  }
  function syncSel() { UI.setSelection(md.picks.map(function (p) { return p.pick; }), { quiet: true }); md.cursor = md.cursor || null; redraw(); }

  // ------------------------------------------------------------------ label: select, drag to move, Delete
  function pressLabel(dim, ev) {
    if (App.mode !== 'part') return;
    md.selId = dim.id;
    if (App.sel) UI.setSelection([], { quiet: true });
    redraw();
    var r = viewport.getBoundingClientRect(), x0 = ev.clientX, y0 = ev.clientY, pushed = false;
    function move(e) {
      if (!pushed && Math.hypot(e.clientX - x0, e.clientY - y0) < 4) return;
      var prs = primsOf(dim);
      if (!prs) return;
      if (!pushed) { UI.pushUndo(); pushed = true; dim = findDim(dim.id) || dim; prs = primsOf(dim); if (!prs) return; }
      var probe = placeFor(dim.kind, prs, e.clientX - r.left, e.clientY - r.top);
      dim.off = probe.off.map(round9);
      if (dim.kind === 'dist') { if (probe.mode && probe.mode !== 'aligned') dim.mode = probe.mode; else delete dim.mode; }
      var m = measure(dim, prs);
      if (m) { dim.value = round9(m.value); dim.text = m.text; }
      redraw();
    }
    function up() { window.removeEventListener('mousemove', move, true); window.removeEventListener('mouseup', up, true); if (pushed && UI.autosave) UI.autosave(); }
    window.addEventListener('mousemove', move, true);
    window.addEventListener('mouseup', up, true);
  }
  function findDim(id) { var l = dims(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function deleteDim(id) {
    var l = dims(), i = l.map(function (d) { return d.id; }).indexOf(id);
    if (i < 0) return false;
    UI.pushUndo();
    App.model.modelDims.splice(i, 1);
    if (!App.model.modelDims.length) delete App.model.modelDims;
    md.selId = null;
    if (UI.autosave) UI.autosave();
    UI.setStatus('Dimension deleted.');
    redraw();
    return true;
  }

  // ------------------------------------------------------------------ hooks into the viewport, keys and commands
  var baseHover = UI.pickHover;
  UI.pickHover = function (mx, my) {
    if (active()) {
      md.cursor = [mx, my];
      if (md.picks.length) redraw();
      return toolPick(mx, my);
    }
    return baseHover ? baseHover.apply(this, arguments) : null;
  };
  var baseClick = UI.selectClick;
  UI.selectClick = function (mx, my, ev) {
    if (active()) { toolClick(mx, my); return; }
    if (md.selId != null) { md.selId = null; redraw(); }
    return baseClick.apply(this, arguments);
  };
  var baseSetTool = UI.setTool;
  UI.setTool = function (name) {
    if (name === 'dimension' && App.mode !== 'sketch') { if (md.on) stop(); else start(); return; }
    if (md.on) stop(App.mode === 'sketch');
    return baseSetTool.apply(this, arguments);
  };
  var baseDelete = UI.deleteSelection;
  UI.deleteSelection = function () {
    if (md.selId != null && App.mode === 'part' && findDim(md.selId)) return deleteDim(md.selId);
    return baseDelete.apply(this, arguments);
  };
  UI.escapeTools = UI.escapeTools || [];
  UI.escapeTools.push(function () {
    var did = stop();
    if (md.selId != null) { md.selId = null; redraw(); did = true; }
    return did;
  });
  UI.onBuild = UI.onBuild || [];
  UI.onBuild.push(function () {
    // picks belong to the mesh they were made on: re-found on the new one (an undo during the tool drops them)
    md.picks = md.picks.filter(function (p) { return !!resolve(p.ref); });
    redraw();
  });
  // D starts / ends it in a part (in a sketch D is the sketch tool, ui-app.js)
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || (e.key !== 'd' && e.key !== 'D')) return;
    var t = e.target, tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
    if (App.mode !== 'part' || isAsm() || drawingOn() || (UI.hasPM && UI.hasPM()) || document.querySelector('#modal:not([hidden]), .modal-back:not([hidden])')) return;
    if (md.on) stop(); else start();
  });

  // ------------------------------------------------------------------ show / hide, API
  function setShown(on) { md.hidden = !on; if (!on) md.selId = null; redraw(); return !md.hidden; }
  UI.modelDimsShown = function (on) { return arguments.length ? setShown(!!on) : !md.hidden; };
  UI.toggleModelDims = function () { var on = setShown(md.hidden); UI.setStatus(on ? 'Model dimensions shown.' : 'Model dimensions hidden.'); return on; };
  UI.modelDimOn = function () { return active(); };
  UI.modelDimTool = function (on) { if (arguments.length) { if (on) { if (!md.on) start(); } else stop(); } return md.on; };
  // -> [{ id, kind, value, text, dangling, refs }] as drawn now
  UI.modelDims = function () {
    return dims().map(function (d) {
      var m = measured(d);
      return { id: d.id, kind: d.kind, mode: d.mode || null, value: m ? m.value : null, text: m ? m.text : null, dangling: !m, selected: d.id === md.selId };
    });
  };
  UI.modelDimSelect = function (id) { md.selId = findDim(id) ? id : null; redraw(); return md.selId; };
  UI.modelDimDelete = deleteDim;
  // the screen point of a dimension's label (tests)
  UI.modelDimLabel = function (id) {
    draw();
    var g = layer.querySelector('g.mdim[data-id="' + id + '"] text');
    if (!g) return null;
    var b = g.getBoundingClientRect(), r = viewport.getBoundingClientRect();
    return { x: b.left - r.left + b.width / 2, y: b.top - r.top + b.height / 2, el: g, cls: g.parentNode.getAttribute('class') };
  };
  UI.modelDimPicks = function () { return md.picks.length; };
})(UI);
