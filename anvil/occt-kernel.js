// occt-kernel.js — builds an Anvil model with OpenCascade (opencascade.js, vendor/occt) instead of the BSP mesh
// kernel. Plain script, no DOM: loaded by occt-worker.js after csg.js and kernel.js, and usable on a page that has
// both `Kernel` and an initialised OpenCascade module.
//
// OcctKernel.build(oc, K, model, opts) -> {
//   ok,                 true when every feature was built by OpenCascade (none unsupported, none failed)
//   status: { featureId: 'ok' | 'unsupported' | 'skipped' | 'error: …' },
//   unsupported,        the first feature type OpenCascade cannot build yet (the rest are 'skipped'), or null
//   bodies,             number of solid bodies
//   valid,              every body passes BRepCheck_Analyzer
//   volume, bbox: [[x,y,z],[x,y,z]] | null,
//   faces: [{ body, type }],   one per B-rep face (type: plane / cylinder / cone / sphere / torus / bspline / …)
//   mesh: { positions: Float32Array (9 per triangle), faceOf: Int32Array (B-rep face per triangle) },
//   ms: { build, mesh }
// }
// The feature tree is read exactly as Kernel.rebuild reads it: the same resolved model (equations, configurations),
// sketch profiles (Kernel.sketchProfile, with the exact circles / arcs behind the chords), planes, extrude ranges,
// revolve axes and cut scopes. Supported now: sketch, reference plane, extrude / cut (blind, through all, mid-plane,
// two directions, reverse; bodies scope and merge: false), revolve / revolve cut, linear and circular patterns,
// mirror of features and of the body. Everything else stops the build at that feature ('unsupported'), so the caller
// keeps Anvil's own result. OpenCascade objects are freed after every build.
var OcctKernel = (function () {
  'use strict';
  var SUPPORTED = { sketch: 1, plane: 1, extrude: 1, revolve: 1, lpattern: 1, cpattern: 1, mirror: 1 };
  var SURF = ['plane', 'cylinder', 'cone', 'sphere', 'torus', 'bezier', 'bspline', 'revolution', 'extrusion', 'offset', 'other'];

  function build(oc, K, model, opts) {
    opts = opts || {};
    var t0 = now(), arena = [];
    // every OpenCascade object made here goes into the arena and is deleted at the end
    function N(o) { arena.push(o); return o; }
    var R = function () { return N(new oc.Message_ProgressRange_1()); };
    var P = function (p) { return N(new oc.gp_Pnt_3(p[0], p[1], p[2])); };
    var Dir = function (d) { return N(new oc.gp_Dir_4(d[0], d[1], d[2])); };
    var Vec = function (v) { return N(new oc.gp_Vec_4(v[0], v[1], v[2])); };
    var ENUM = oc.TopAbs_ShapeEnum;

    function explore(sh, kind) { var out = [], x = N(new oc.TopExp_Explorer_2(sh, kind, ENUM.TopAbs_SHAPE)); for (; x.More(); x.Next()) out.push(N(x.Current())); return out; }
    function volumeOf(sh) { var g = N(new oc.GProp_GProps_1()); oc.BRepGProp.VolumeProperties_1(sh, g, false, false, false); return g.Mass(); }
    // tight: the exact extents (reported); otherwise a quick box padded by tolerances (merge tests)
    function bboxOf(sh, tight) {
      var b = N(new oc.Bnd_Box_1());
      if (tight) oc.BRepBndLib.AddOptimal(sh, b, false, false); else oc.BRepBndLib.Add(sh, b, false);
      if (b.IsVoid()) return null;
      var lo = N(b.CornerMin()), hi = N(b.CornerMax());
      return [[lo.X(), lo.Y(), lo.Z()], [hi.X(), hi.Y(), hi.Z()]];
    }
    function boxesMeet(a, b) { if (!a || !b) return false; for (var k = 0; k < 3; k++) if (a[0][k] > b[1][k] + 1e-6 || b[0][k] > a[1][k] + 1e-6) return false; return true; }
    function compound(shapes) {
      var c = N(new oc.TopoDS_Compound()), bld = N(new oc.BRep_Builder());
      bld.MakeCompound(c); shapes.forEach(function (s) { bld.Add(c, s); });
      return c;
    }
    function fuse(a, b) { var op = N(new oc.BRepAlgoAPI_Fuse_3(a, b, R())); if (!op.IsDone()) throw new Error('OpenCascade could not join the bodies.'); return N(op.Shape()); }
    function cut(a, b) { var op = N(new oc.BRepAlgoAPI_Cut_3(a, b, R())); if (!op.IsDone()) throw new Error('OpenCascade could not cut the body.'); return N(op.Shape()); }
    function transformed(sh, trsf) { return N(N(new oc.BRepBuilderAPI_Transform_2(sh, trsf, true)).Shape()); }
    function valid(sh) { try { return N(new oc.BRepCheck_Analyzer(sh, true, false)).IsValid_2(); } catch (e) { return false; } }

    // ---- sketch loops -> wires with exact circles and arcs
    function loopWire(loop, profile, plane) {
      var pts = loop.pts, n = pts.length, seg = loop.seg, curves = profile.curves || [];
      var to3 = function (p) { return K.to3D(plane, p[0], p[1]); };
      var mw = N(new oc.BRepBuilderAPI_MakeWire_1());
      if (seg && seg.every(function (k) { return k === seg[0] && k >= 0; }) && curves[seg[0]].full) {
        var C = curves[seg[0]], ax = N(new oc.gp_Ax2_2(P(to3(C.c)), Dir(plane.n), Dir(plane.x)));
        mw.Add_1(N(N(new oc.BRepBuilderAPI_MakeEdge_8(N(new oc.gp_Circ_2(ax, C.r)))).Edge()));
        return N(mw.Wire());
      }
      // start at a vertex where the curve index changes, so no run of chords wraps around the loop's start
      var start = 0;
      if (seg) for (var s = 0; s < n; s++) if (seg[s] !== seg[(s + n - 1) % n]) { start = s; break; }
      var i = 0;
      while (i < n) {
        var a = (start + i) % n, k = seg ? seg[a] : -1, len = 1;
        if (k >= 0) while (i + len < n && seg[(start + i + len) % n] === k) len++;
        var b = (start + i + len) % n;
        if (k < 0) mw.Add_1(N(N(new oc.BRepBuilderAPI_MakeEdge_3(P(to3(pts[a])), P(to3(pts[b])))).Edge()));
        else {
          var Cc = curves[k], mid;
          if (len >= 2) mid = pts[(a + (len >> 1)) % n];
          else { // one chord: the arc's point at the chord's mid-angle
            var mx = (pts[a][0] + pts[b][0]) / 2 - Cc.c[0], my = (pts[a][1] + pts[b][1]) / 2 - Cc.c[1], ml = Math.hypot(mx, my) || 1;
            mid = [Cc.c[0] + mx / ml * Cc.r, Cc.c[1] + my / ml * Cc.r];
          }
          var arc = N(new oc.GC_MakeArcOfCircle_4(P(to3(pts[a])), P(to3(mid)), P(to3(pts[b]))));
          if (!arc.IsDone()) throw new Error('Could not make an arc of the sketch.');
          mw.Add_1(N(N(new oc.BRepBuilderAPI_MakeEdge_24(N(new oc.Handle_Geom_Curve_2(N(arc.Value()).get())))).Edge()));
        }
        i += len;
      }
      if (!mw.IsDone()) throw new Error('A sketch contour does not close.');
      return N(mw.Wire());
    }
    // profile -> [{ face, depth }] (one planar face per loop; the caller adds even depths and removes odd ones)
    function loopFaces(sketch, plane) {
      var profile = sketch.profile || K.sketchProfile(sketch);
      K.checkProfile(profile);
      if (!profile.loops.length) throw new Error('Sketch has no closed profile.');
      return profile.loops.map(function (l) {
        var mf = N(new oc.BRepBuilderAPI_MakeFace_15(loopWire(l, profile, plane), true));
        if (!mf.IsDone()) throw new Error('Could not make a face from the sketch.');
        return { face: N(mf.Face()), depth: l.depth };
      });
    }
    // solids made from each loop face, combined by nesting depth (outer adds, hole removes, island adds again)
    function fromLoops(faces, makeSolid) {
      var sorted = faces.slice().sort(function (p, q) { return p.depth - q.depth; }), acc = null;
      sorted.forEach(function (lf) {
        var s = makeSolid(lf.face);
        if (lf.depth % 2 === 0) acc = acc ? fuse(acc, s) : s;
        else if (acc) acc = cut(acc, s);
      });
      if (!acc) throw new Error('Sketch has no closed profile.');
      return acc;
    }

    var rm = K.resolvedModel(model), m = rm.model;
    var planes = {}, sketches = {}, tools = {}, bodies = [], bodyFeatures = [], status = {}, unsupported = null;
    function sketchOf(f) {
      var s = sketches[f.sketch] || K.findFeature(m, f.sketch);
      if (!s || s.type !== 'sketch') throw new Error('Select a sketch for this feature.');
      return s;
    }
    function extrudeTool(f) {
      if (f.draft) throw unsupportedErr('drafted extrude');
      if (f.normalCut || f.sheetBase || m.sheet) throw unsupportedErr('sheet metal');
      var sk = sketchOf(f), plane = K.resolvePlane(sk.plane, m, planes), range = K.extrudeRange(f, K.THROUGH);
      var off = function (t) { return [plane.n[0] * t, plane.n[1] * t, plane.n[2] * t]; };
      return fromLoops(loopFaces(sk, plane), function (face) {
        var tr = N(new oc.gp_Trsf_1()); tr.SetTranslation_1(Vec(off(range[0])));
        var moved = transformed(face, tr);
        var pr = N(new oc.BRepPrimAPI_MakePrism_1(moved, Vec(off(range[1] - range[0])), false, true));
        return N(pr.Shape());
      });
    }
    function revolveTool(f) {
      var sk = sketchOf(f), plane = K.resolvePlane(sk.plane, m, planes), axis = K.revolveAxis(f, sk);
      var dl = Math.hypot(axis.d[0], axis.d[1]);
      if (dl < 1e-9) throw new Error('Revolve axis has zero length.');
      var ang = +f.angle || 360; if (f.reverse) ang = -ang;
      var o = K.to3D(plane, axis.p[0], axis.p[1]);
      var d = [(plane.x[0] * axis.d[0] + plane.y[0] * axis.d[1]) / dl, (plane.x[1] * axis.d[0] + plane.y[1] * axis.d[1]) / dl, (plane.x[2] * axis.d[0] + plane.y[2] * axis.d[1]) / dl];
      var ax1 = N(new oc.gp_Ax1_2(P(o), Dir(d)));
      return fromLoops(loopFaces(sk, plane), function (face) {
        return N(N(new oc.BRepPrimAPI_MakeRevol_1(face, ax1, ang * Math.PI / 180, false)).Shape());
      });
    }
    // what a pattern or mirror copies: the source's tool plus, for a pattern of a pattern, its seed (as familyTool)
    function familyTool(id) {
      var tool = tools[id], src = K.findFeature(m, id);
      if (!src || !tool) return tool || null;
      if (src.type === 'lpattern' || src.type === 'cpattern' || (src.type === 'mirror' && !src.body)) {
        var seed = familyTool(src.feature);
        return seed ? compound([seed, tool]) : tool;
      }
      return tool;
    }
    function patternTool(f) {
      var src = familyTool(f.feature), copies = [];
      if (f.type !== 'mirror' || !f.body) { if (!src) throw new Error((f.type === 'mirror' ? 'Mirror' : 'Pattern') + ' source feature has no geometry.'); }
      if (f.type === 'lpattern') {
        var d1 = K.AXES[f.d1 || 'x'].map(function (x) { return x * (f.rev1 ? -1 : 1); }), n1 = Math.max(1, f.n1 | 0), n2 = f.d2 ? Math.max(1, f.n2 | 0) : 1;
        var d2 = f.d2 ? K.AXES[f.d2].map(function (x) { return x * (f.rev2 ? -1 : 1); }) : [0, 0, 0];
        for (var i = 0; i < n1; i++) for (var j = 0; j < n2; j++) {
          if (i === 0 && j === 0) continue;
          var t = [0, 1, 2].map(function (k) { return d1[k] * i * (+f.s1 || 0) + d2[k] * j * (+f.s2 || 0); });
          var tr = N(new oc.gp_Trsf_1()); tr.SetTranslation_1(Vec(t)); copies.push(transformed(src, tr));
        }
        if (!copies.length) throw new Error('Pattern needs at least 2 instances.');
      } else if (f.type === 'cpattern') {
        var count = Math.max(2, f.n | 0), total = +f.angle || 360;
        var step = f.equal === false ? total : (Math.abs(total) >= 360 ? total / count : total / (count - 1));
        var axis = N(new oc.gp_Ax1_2(P(f.center || [0, 0, 0]), Dir(K.AXES[f.axis || 'z'])));
        for (var c = 1; c < count; c++) { var rt = N(new oc.gp_Trsf_1()); rt.SetRotation_1(axis, step * c * Math.PI / 180); copies.push(transformed(src, rt)); }
      } else {
        var mp = K.makePlane(f.plane || 'Right', f.offset || 0), mt = N(new oc.gp_Trsf_1());
        mt.SetMirror_3(N(new oc.gp_Ax2_3(P(mp.origin), Dir(mp.n))));
        if (f.body) { if (!bodies.length) throw new Error('No body to mirror yet.'); return transformed(compound(bodies), mt); }
        return transformed(src, mt);
      }
      return compound(copies);
    }
    function unsupportedErr(what) { var e = new Error(what + ' is not supported by the OpenCascade kernel yet'); e.unsupported = what; return e; }
    function addBoss(tool, f) {
      var tb = bboxOf(tool), hit = [];
      if (f.merge !== false) bodies.forEach(function (b, i) { if (boxesMeet(bboxOf(b), tb)) hit.push(i); });
      if (!hit.length) { bodies.push(tool); bodyFeatures.push(f.id); return; }
      var merged = tool;
      hit.forEach(function (i) { merged = fuse(bodies[i], merged); });
      for (var h = hit.length - 1; h >= 1; h--) { bodies.splice(hit[h], 1); bodyFeatures.splice(hit[h], 1); }
      bodies[hit[0]] = merged;
    }
    function applyCut(tool, f) {
      if (!bodies.length) throw new Error('Nothing to cut yet.');
      var scope = K.cutScope(f, bodies.length);
      for (var s = scope.length - 1; s >= 0; s--) {
        var i = scope[s], nb = cut(bodies[i], tool);
        if (volumeOf(nb) < 1e-9) { bodies.splice(i, 1); bodyFeatures.splice(i, 1); } else bodies[i] = nb;
      }
    }

    try {
      m.features.forEach(function (f) {
        if (unsupported) { status[f.id] = 'skipped'; return; }
        if (!SUPPORTED[f.type]) { unsupported = f.type; status[f.id] = 'unsupported'; return; }
        try {
          if (rm.featureErrors[f.id]) throw new Error(rm.featureErrors[f.id]);
          var tool = null;
          switch (f.type) {
            case 'plane': planes[f.id] = K.makePlane(f.ref || 'Front', +f.offset || 0); break;
            case 'sketch': if (!f.profile) f.profile = K.sketchProfile(f); sketches[f.id] = f; break;
            case 'extrude': tool = extrudeTool(f); break;
            case 'revolve': tool = revolveTool(f); break;
            default: tool = patternTool(f);
          }
          if (tool) {
            tools[f.id] = tool;
            if (K.isCut(f, m)) applyCut(tool, f); else addBoss(tool, f);
          }
          status[f.id] = 'ok';
        } catch (e) {
          if (e.unsupported) { unsupported = e.unsupported; status[f.id] = 'unsupported'; return; }
          status[f.id] = 'error: ' + (e.message || String(e));
        }
      });
      var tBuild = now() - t0;
      var out = { ok: !unsupported && Object.keys(status).every(function (k) { return status[k] === 'ok'; }), status: status, unsupported: unsupported,
        bodies: bodies.length, bodyFeatures: bodyFeatures.slice(), valid: true, volume: 0, bbox: null, faces: [], mesh: null, ms: { build: tBuild, mesh: 0 } };
      if (unsupported || !bodies.length) return out;
      // booleans leave faces split along old seams (a pocket floor in pieces): merge faces on the same surface
      bodies = bodies.map(function (b) {
        try { var u = N(new oc.ShapeUpgrade_UnifySameDomain_2(b, true, true, false)); u.Build(); return N(u.Shape()); } catch (e) { return b; }
      });
      bodies.forEach(function (b) { if (!valid(b)) out.valid = false; out.volume += volumeOf(b); });
      var all = bodies.length === 1 ? bodies[0] : compound(bodies);
      out.bbox = bboxOf(all, true);
      if (opts.mesh !== false) {
        var t1 = now();
        out.mesh = tessellate(all, bodies, opts.chord || 0.05, out.faces);
        out.ms.mesh = now() - t1;
      }
      return out;
    } finally {
      for (var a = arena.length - 1; a >= 0; a--) { try { if (arena[a] && arena[a].delete && !(arena[a].isDeleted && arena[a].isDeleted())) arena[a].delete(); } catch (e) { } }
    }

    // triangles of every B-rep face, tagged with the face's index in out.faces
    function tessellate(all, bodyList, chord, facesOut) {
      N(new oc.BRepMesh_IncrementalMesh_2(all, chord, false, 0.35, false));
      var pos = [], faceOf = [];
      bodyList.forEach(function (body, bi) {
        explore(body, ENUM.TopAbs_FACE).forEach(function (s) {
          var f = N(oc.TopoDS.Face_1(s)), fi = facesOut.length;
          var ad = N(new oc.BRepAdaptor_Surface_2(f, true)), t = ad.GetType();
          facesOut.push({ body: bi, type: SURF[t && t.value != null ? t.value : t] || 'other' });
          var loc = N(new oc.TopLoc_Location_1()), h = N(oc.BRep_Tool.Triangulation(f, loc, oc.Poly_MeshPurpose ? oc.Poly_MeshPurpose.Poly_MeshPurpose_NONE : 0));
          if (h.IsNull()) return;
          var tri = h.get(), tr = N(loc.Transformation()), rev = f.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED, nodes = [];
          for (var i = 1; i <= tri.NbNodes(); i++) { var p = N(N(tri.Node(i)).Transformed(tr)); nodes[i] = [p.X(), p.Y(), p.Z()]; }
          for (var j = 1; j <= tri.NbTriangles(); j++) {
            var T = N(tri.Triangle(j)), a = T.Value(1), b = T.Value(2), c = T.Value(3);
            if (rev) { var x = b; b = c; c = x; }
            pos.push(nodes[a][0], nodes[a][1], nodes[a][2], nodes[b][0], nodes[b][1], nodes[b][2], nodes[c][0], nodes[c][1], nodes[c][2]);
            faceOf.push(fi);
          }
        });
      });
      return { positions: new Float32Array(pos), faceOf: new Int32Array(faceOf) };
    }
  }

  function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

  // Which B-rep face each mesh face of Anvil's own mesh lies on: for every mesh face, the OpenCascade triangle nearest
  // the centre of its largest triangle (inside the facet, so never on a face boundary). -> Int32Array (B-rep face index or -1 when
  // nothing is within tol). A uniform grid over the triangles keeps it near-linear.
  function mapFaces(mesh, occ, tol) {
    tol = tol || 0.25;
    var P = occ.mesh.positions, F = occ.mesh.faceOf, nt = F.length, out = new Int32Array(mesh.faces.length).fill(-1);
    if (!nt) return out;
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < P.length; i += 3) for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
    var cell = Math.max(tol * 4, Math.cbrt((hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) / Math.max(1, nt)) * 2);
    var grid = new Map();
    function key(x, y, z) { return x + ',' + y + ',' + z; }
    for (var t = 0; t < nt; t++) {
      var o = t * 9, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (var v = 0; v < 3; v++) for (k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[o + v * 3 + k]); mx[k] = Math.max(mx[k], P[o + v * 3 + k]); }
      var a0 = mn.map(function (x, k2) { return Math.floor((x - tol - lo[k2]) / cell); }), a1 = mx.map(function (x, k2) { return Math.floor((x + tol - lo[k2]) / cell); });
      for (var gx = a0[0]; gx <= a1[0]; gx++) for (var gy = a0[1]; gy <= a1[1]; gy++) for (var gz = a0[2]; gz <= a1[2]; gz++) {
        var kk = key(gx, gy, gz), l = grid.get(kk); if (!l) grid.set(kk, l = []); l.push(t);
      }
    }
    var MP = mesh.positions;
    mesh.faces.forEach(function (f, fi) {
      // a point surely on the face: the centre of its largest triangle (an annulus' centroid lies in its hole)
      var c = f.centroid, bestA = -1;
      if (MP) for (var tt = f.start; tt < f.start + f.count; tt++) {
        var o = tt * 9, ux = MP[o + 3] - MP[o], uy = MP[o + 4] - MP[o + 1], uz = MP[o + 5] - MP[o + 2], vx = MP[o + 6] - MP[o], vy = MP[o + 7] - MP[o + 1], vz = MP[o + 8] - MP[o + 2];
        var cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx, ar = cx * cx + cy * cy + cz * cz;
        if (ar > bestA) { bestA = ar; c = [(MP[o] + MP[o + 3] + MP[o + 6]) / 3, (MP[o + 1] + MP[o + 4] + MP[o + 7]) / 3, (MP[o + 2] + MP[o + 5] + MP[o + 8]) / 3]; }
      }
      var g = [0, 1, 2].map(function (k2) { return Math.floor((c[k2] - lo[k2]) / cell); });
      var list = grid.get(key(g[0], g[1], g[2])) || [], best = tol * tol, hit = -1;
      for (var q = 0; q < list.length; q++) {
        var d2 = pointTriDist2(c, P, list[q] * 9);
        if (d2 < best) { best = d2; hit = F[list[q]]; }
      }
      out[fi] = hit;
    });
    return out;
  }
  // squared distance from point p to the triangle at P[o..o+8] (Ericson, Real-Time Collision Detection 5.1.5)
  function pointTriDist2(p, P, o) {
    var a = [P[o], P[o + 1], P[o + 2]], b = [P[o + 3], P[o + 4], P[o + 5]], c = [P[o + 6], P[o + 7], P[o + 8]];
    function sub(x, y) { return [x[0] - y[0], x[1] - y[1], x[2] - y[2]]; }
    function dot(x, y) { return x[0] * y[0] + x[1] * y[1] + x[2] * y[2]; }
    function at(base, u, s, w, t) { return [base[0] + u[0] * s + w[0] * t, base[1] + u[1] * s + w[1] * t, base[2] + u[2] * s + w[2] * t]; }
    var ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap), q;
    if (d1 <= 0 && d2 <= 0) q = a;
    else {
      var bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
      if (d3 >= 0 && d4 <= d3) q = b;
      else {
        var vc = d1 * d4 - d3 * d2;
        if (vc <= 0 && d1 >= 0 && d3 <= 0) q = at(a, ab, d1 / (d1 - d3), ac, 0);
        else {
          var cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
          if (d6 >= 0 && d5 <= d6) q = c;
          else {
            var vb = d5 * d2 - d1 * d6;
            if (vb <= 0 && d2 >= 0 && d6 <= 0) q = at(a, ab, 0, ac, d2 / (d2 - d6));
            else {
              var va = d3 * d6 - d5 * d4;
              if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { var w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); q = [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]; }
              else { var den = 1 / (va + vb + vc); q = at(a, ab, vb * den, ac, vc * den); }
            }
          }
        }
      }
    }
    var d = sub(p, q);
    return dot(d, d);
  }

  return { build: build, mapFaces: mapFaces, SUPPORTED: SUPPORTED };
})();
if (typeof self !== 'undefined') self.OcctKernel = OcctKernel;
