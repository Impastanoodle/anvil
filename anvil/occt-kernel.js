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
// revolve axes and cut scopes. Supported: sketch, reference plane, extrude / cut (blind, through all, mid-plane,
// two directions, reverse, draft; bodies scope and merge: false), revolve / revolve cut, linear and circular patterns,
// mirror of features and of the body (stage 1); fillet and chamfer (edges nearest the picked points, tangent
// propagation), shell (faces nearest the picked points removed; none: closed hollow), loft, sweep (sketch path with
// exact arcs, or a 3D polyline; mitred corners) and Hole Wizard holes (stage 2). Sheet metal and anything else stops
// the build at that feature ('unsupported'), so the caller keeps Anvil's own result. `tolerance` is the relative
// volume agreement to expect with Anvil (1e-4; 2e-2 with sweeps / lofts, which Anvil facets). OpenCascade objects
// are freed after every build.
var OcctKernel = (function () {
  'use strict';
  var SUPPORTED = { sketch: 1, plane: 1, extrude: 1, revolve: 1, lpattern: 1, cpattern: 1, mirror: 1,
    fillet: 1, chamfer: 1, shell: 1, loft: 1, sweep: 1, hole: 1, import: 1 };
  var SURF = ['plane', 'cylinder', 'cone', 'sphere', 'torus', 'bezier', 'bspline', 'revolution', 'extrusion', 'offset', 'other'];

  function build(oc, K, model, opts) {
    opts = opts || {};
    var t0 = now(), arena = [], V = K.vec;
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
    function edgesOf(sh) { // unique edges (an explorer visits a shared edge once per face)
      var out = [], seen = N(new oc.TopTools_IndexedMapOfShape_1());
      explore(sh, ENUM.TopAbs_EDGE).forEach(function (s) { if (!seen.Contains(s)) { seen.Add(s); out.push(N(oc.TopoDS.Edge_1(s))); } });
      return out;
    }
    function facesOf(sh) { return explore(sh, ENUM.TopAbs_FACE).map(function (s) { return N(oc.TopoDS.Face_1(s)); }); }
    // distance from a point to any shape (vertex, edge, face, solid)
    function dist(p, sh) {
      var v = N(N(new oc.BRepBuilderAPI_MakeVertex(P(p))).Vertex());
      var d = N(new oc.BRepExtrema_DistShapeShape_2(v, sh, oc.Extrema_ExtFlag.Extrema_ExtFlag_MIN, oc.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad, R()));
      return d.IsDone() ? d.Value() : Infinity;
    }
    // faces split along old boolean seams merged back (edge and face picks see whole edges and faces)
    function unify(sh) {
      try { var u = N(new oc.ShapeUpgrade_UnifySameDomain_2(sh, true, true, false)); u.Build(); return N(u.Shape()); } catch (e) { return sh; }
    }
    // the body a face- or edge-picked feature works on: the one nearest its first pick (Kernel's pickBody)
    function pickBody(at) {
      if (!bodies.length) return -1;
      if (!at) return 0;
      var best = 0, bestD = Infinity;
      bodies.forEach(function (b, i) { var d = dist(at, b); if (d < bestD) { bestD = d; best = i; } });
      return best;
    }
    // the shape nearest each picked point within tol (Kernel's resolveEdges / resolveFaces), deduplicated
    function nearest(specs, shapes, tol) {
      var out = [];
      (specs || []).forEach(function (spec) {
        var best = -1, bestD = tol;
        shapes.forEach(function (s, i) { var d = dist(spec.at, s); if (d < bestD) { bestD = d; best = i; } });
        if (best >= 0 && out.indexOf(best) < 0) out.push(best);
      });
      return out.map(function (i) { return shapes[i]; });
    }
    // the first wire of a shape (an offset returns a wire or a compound of wires)
    function firstWire(sh) {
      if (sh.ShapeType() === ENUM.TopAbs_WIRE) return N(oc.TopoDS.Wire_1(sh));
      var w = explore(sh, ENUM.TopAbs_WIRE);
      if (!w.length) throw new Error('OpenCascade could not offset the sketch contour.');
      return N(oc.TopoDS.Wire_1(w[0]));
    }
    // a planar face's outer wire offset in its plane by d (positive grows the face), sharp corners, as Anvil's
    // mitred offset (radial on arcs)
    function offsetWire(face, d) {
      if (Math.abs(d) < 1e-12) return firstWire(face);
      var mo = N(new oc.BRepOffsetAPI_MakeOffset_2(face, oc.GeomAbs_JoinType.GeomAbs_Intersection, false));
      mo.Perform(d, 0);
      if (!mo.IsDone()) throw new Error('Draft angle is too large for this depth: the profile collapses.');
      return firstWire(N(mo.Shape()));
    }

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
        var s = makeSolid(lf.face, lf.depth % 2 === 1);
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
    function moveTo(sh, t, plane) { var tr = N(new oc.gp_Trsf_1()); tr.SetTranslation_1(Vec([plane.n[0] * t, plane.n[1] * t, plane.n[2] * t])); return transformed(sh, tr); }
    function extrudeTool(f) {
      if (f.normalCut || f.sheetBase || m.sheet) throw unsupportedErr('sheet metal');
      var sk = sketchOf(f), plane = K.resolvePlane(sk.plane, m, planes), range = K.extrudeRange(f, K.THROUGH);
      if (f.draft != null && !isFinite(+f.draft)) throw new Error('Draft angle must be a number.');
      var draft = +f.draft || 0;
      if (Math.abs(draft) >= 89) throw new Error('Draft angle must be less than 89°.');
      // draft (as Kernel.buildExtrude): the section shrinks (grows with draftOut) by |t|·tan(angle) at distance t from
      // the sketch plane; a hole loop does the opposite. Ruled loft between the two offset sections.
      var k = draft ? Math.tan(draft * Math.PI / 180) * (f.draftOut ? 1 : -1) : 0;
      return fromLoops(loopFaces(sk, plane), function (face, hole) {
        var a = range[0], b = range[1];
        if (!k) return N(N(new oc.BRepPrimAPI_MakePrism_1(moveTo(face, a, plane), Vec([plane.n[0] * (b - a), plane.n[1] * (b - a), plane.n[2] * (b - a)]), false, true)).Shape());
        var s = hole ? -1 : 1;
        function part(a0, b0) {
          var ts = N(new oc.BRepOffsetAPI_ThruSections(true, true, 1e-6));
          ts.AddWire(N(oc.TopoDS.Wire_1(moveTo(offsetWire(face, s * k * Math.abs(a0)), a0, plane))));
          ts.AddWire(N(oc.TopoDS.Wire_1(moveTo(offsetWire(face, s * k * Math.abs(b0)), b0, plane))));
          ts.Build(R());
          if (!ts.IsDone()) throw new Error('OpenCascade could not make the drafted extrude.');
          return N(ts.Shape());
        }
        return a < -1e-9 && b > 1e-9 ? fuse(part(a, 0), part(0, b)) : part(a, b);
      });
    }
    function revolveTool(f) {
      var sk = sketchOf(f);
      return revolveSketch(sk, K.resolvePlane(sk.plane, m, planes), K.revolveAxis(f, sk), (+f.angle || 360) * (f.reverse ? -1 : 1));
    }
    function revolveSketch(sk, plane, axis, ang) {
      var dl = Math.hypot(axis.d[0], axis.d[1]);
      if (dl < 1e-9) throw new Error('Revolve axis has zero length.');
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
    function sketchById(id, what) {
      var s = sketches[id] || K.findFeature(m, id);
      if (!s || s.type !== 'sketch') throw new Error(what);
      return s;
    }
    function outerLoop(s, what) {
      var prof = s.profile || K.sketchProfile(s);
      K.checkProfile(prof);
      var outers = prof.loops.filter(function (l) { return !l.hole; });
      if (outers.length !== 1) throw new Error(what);
      return { loop: outers[0], profile: prof };
    }
    // Loft through the sections' outer loops, smooth as SolidWorks (Anvil's own loft is ruled between sections)
    function loftTool(f) {
      var ids = f.sketches || [];
      if (ids.length < 2) throw new Error('Loft needs at least two profile sketches.');
      var ts = N(new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6));
      ids.forEach(function (id) {
        var s = sketchById(id, 'Loft sketch not found.'), pl = K.resolvePlane(s.plane, m, planes);
        var o = outerLoop(s, 'Each loft sketch must contain exactly one closed profile.');
        ts.AddWire(loopWire(o.loop, o.profile, pl));
      });
      ts.Build(R());
      if (!ts.IsDone()) throw new Error('OpenCascade could not loft these sections.');
      return N(ts.Shape());
    }
    // Sweep (as Kernel.buildSweep): the path is a sketch of lines and arcs (kept exact) or a 3D polyline, started at the
    // end nearest the profile; the profile turns about the path start to face along the first segment; corners mitre.
    function sweepTool(f) {
      var prof = sketchById(f.profile, 'Select a profile sketch for the sweep.'), profPlane = K.resolvePlane(prof.plane, m, planes);
      var profile = prof.profile || K.sketchProfile(prof);
      K.checkProfile(profile);
      if (!profile.loops.length) throw new Error('Sweep profile sketch has no closed profile.');
      var c0 = [0, 0, 0], lp = profile.loops[0].pts;
      lp.forEach(function (p) { var q = K.to3D(profPlane, p[0], p[1]); c0 = [c0[0] + q[0] / lp.length, c0[1] + q[1] / lp.length, c0[2] + q[2] / lp.length]; });
      var path = Array.isArray(f.path) ? polylinePath(f.path, c0) : sketchPathEdges(f.path, c0);
      var mw = N(new oc.BRepBuilderAPI_MakeWire_1());
      path.edges.forEach(function (e) { mw.Add_1(e); });
      if (!mw.IsDone()) throw new Error('The sweep path does not connect.');
      var spine = N(mw.Wire());
      // turn the profile about the path start so it faces the first segment
      var n = profPlane.n, dir = path.dir0, sg = V.dot(n, dir) < 0 ? -1 : 1, from = [n[0] * sg, n[1] * sg, n[2] * sg];
      var c = Math.max(-1, Math.min(1, V.dot(from, dir))), rot = null;
      if (c < 1 - 1e-9) {
        var ax = c < -1 + 1e-9 ? V.norm(V.cross(from, Math.abs(from[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])) : V.norm(V.cross(from, dir));
        rot = N(new oc.gp_Trsf_1()); rot.SetRotation_1(N(new oc.gp_Ax1_2(P(path.start), Dir(ax))), Math.acos(c));
      }
      return fromLoops(loopFaces(prof, profPlane), function (face) {
        var w = firstWire(rot ? transformed(face, rot) : face);
        var ps = N(new oc.BRepOffsetAPI_MakePipeShell(spine));
        ps.SetMode_1(false);
        ps.Add_1(w, false, false);
        ps.SetTransitionMode(oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RightCorner);
        ps.Build(R());
        if (!ps.IsDone() || !ps.MakeSolid()) throw new Error('OpenCascade could not sweep the profile along this path.');
        return N(ps.Shape());
      });
    }
    function polylinePath(raw, c0) {
      var pts = [];
      raw.forEach(function (p) { var q = [+p[0], +p[1], +p[2]]; if (!isFinite(q[0]) || !isFinite(q[1]) || !isFinite(q[2])) throw new Error('Every sweep path coordinate must be a number.'); if (!pts.length || V.len(V.sub(q, pts[pts.length - 1])) > 1e-6) pts.push(q); });
      if (pts.length < 2) throw new Error('Sweep path needs at least two distinct points.');
      if (V.len(V.sub(pts[pts.length - 1], c0)) < V.len(V.sub(pts[0], c0))) pts.reverse();
      var edges = [];
      for (var i = 0; i + 1 < pts.length; i++) edges.push(N(N(new oc.BRepBuilderAPI_MakeEdge_3(P(pts[i]), P(pts[i + 1]))).Edge()));
      return { edges: edges, start: pts[0], dir0: V.norm(V.sub(pts[1], pts[0])) };
    }
    // the path sketch's lines, arcs and open polylines chained end to end, with exact arcs
    function sketchPathEdges(id, c0) {
      var sk = sketchById(id, 'Select a path sketch for the sweep.'), pl = K.resolvePlane(sk.plane, m, planes), segs = [];
      (sk.entities || []).forEach(function (e) {
        if (e.construction) return;
        if (e.t === 'line') segs.push({ a: [e.x1, e.y1], b: [e.x2, e.y2] });
        else if (e.t === 'arc') {
          var a0 = e.a0 * Math.PI / 180, a1 = e.a1 * Math.PI / 180, am = (a0 + a1) / 2;
          var at = function (a) { return [e.cx + e.r * Math.cos(a), e.cy + e.r * Math.sin(a)]; };
          segs.push({ a: at(a0), b: at(a1), mid: at(am), c: [e.cx, e.cy], sense: a1 > a0 ? 1 : -1 });
        } else if (e.t === 'polyline' || e.t === 'rect' || e.t === 'crect' || e.t === 'poly') {
          K.entityPolylines(e).forEach(function (pl2) { var q = pl2.pts; for (var i = 0; i + 1 < q.length; i++) segs.push({ a: q[i], b: q[i + 1] }); if (pl2.closed) segs.push({ a: q[q.length - 1], b: q[0] }); });
        } else if (e.t !== 'point') throw unsupportedErr('a ' + e.t + ' in a sweep path');
      });
      if (!segs.length) throw new Error('Path sketch has no lines or arcs.');
      var key = function (p) { return Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4); }, deg = {};
      segs.forEach(function (s) { [s.a, s.b].forEach(function (p) { deg[key(p)] = (deg[key(p)] || 0) + 1; }); });
      // start at a free end nearest the profile (any point of a closed path)
      var ends = [];
      segs.forEach(function (s) { [s.a, s.b].forEach(function (p) { if (deg[key(p)] === 1) ends.push(p); }); });
      var start = (ends.length ? ends : [segs[0].a]).slice().sort(function (p, q) { return V.len(V.sub(K.to3D(pl, p[0], p[1]), c0)) - V.len(V.sub(K.to3D(pl, q[0], q[1]), c0)); })[0];
      var used = segs.map(function () { return false; }), cur = start, order = [];
      for (var guard = 0; guard < segs.length; guard++) {
        var hit = -1, rev = false;
        for (var i = 0; i < segs.length && hit < 0; i++) {
          if (used[i]) continue;
          if (key(segs[i].a) === key(cur)) { hit = i; rev = false; } else if (key(segs[i].b) === key(cur)) { hit = i; rev = true; }
        }
        if (hit < 0) break;
        used[hit] = true; order.push({ s: segs[hit], rev: rev }); cur = rev ? segs[hit].a : segs[hit].b;
      }
      var to3 = function (p) { return K.to3D(pl, p[0], p[1]); };
      var edges = order.map(function (o) {
        var s = o.s;
        if (!s.mid) return N(N(new oc.BRepBuilderAPI_MakeEdge_3(P(to3(s.a)), P(to3(s.b)))).Edge());
        var arc = N(new oc.GC_MakeArcOfCircle_4(P(to3(s.a)), P(to3(s.mid)), P(to3(s.b))));
        return N(N(new oc.BRepBuilderAPI_MakeEdge_24(N(new oc.Handle_Geom_Curve_2(N(arc.Value()).get())))).Edge());
      });
      // direction along the path at its start
      var f0 = order[0], d2;
      if (!f0.s.mid) d2 = f0.rev ? V.sub([f0.s.a[0], f0.s.a[1], 0], [f0.s.b[0], f0.s.b[1], 0]) : V.sub([f0.s.b[0], f0.s.b[1], 0], [f0.s.a[0], f0.s.a[1], 0]);
      else {
        var p0 = f0.rev ? f0.s.b : f0.s.a, rr = [p0[0] - f0.s.c[0], p0[1] - f0.s.c[1]], sense = f0.s.sense * (f0.rev ? -1 : 1);
        d2 = [-rr[1] * sense, rr[0] * sense, 0];
      }
      var d3 = V.norm([pl.x[0] * d2[0] + pl.y[0] * d2[1], pl.x[1] * d2[0] + pl.y[1] * d2[1], pl.x[2] * d2[0] + pl.y[2] * d2[1]]);
      return { edges: edges, start: to3(start), dir0: d3 };
    }
    // Hole Wizard (holewizard.js): its half section revolved about each hole axis, as HoleWizard.build does
    function holeTool(f) {
      var HW = typeof HoleWizard !== 'undefined' ? HoleWizard : (typeof self !== 'undefined' ? self.HoleWizard : null);
      if (!HW) throw unsupportedErr('Hole Wizard');
      var s = HW.spec(f), sk = sketchById(f.sketch, 'Hole Wizard: select the positions sketch.'), plane = K.resolvePlane(sk.plane, m, planes);
      var pts = (sk.entities || []).filter(function (e) { return e.t === 'point' && !e.construction; });
      if (!pts.length) throw new Error('Hole Wizard: place at least one point on the face.');
      var L;
      if (f.end === 'through') {
        var bb = bodies.length ? bboxOf(compound(bodies)) : null;
        var diag = bb ? Math.hypot(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]) : 0;
        L = Math.max(diag * 2 + 10, 100);
      } else { L = +f.depth; if (!(L > 0)) throw new Error('Hole depth must be greater than 0.'); }
      var section = HW.section(s, L), x = plane.x, y = plane.n, nn = V.cross(x, y);
      var tools = pts.map(function (e) {
        var q = K.to3D(plane, e.x, e.y), rp = { custom: true, origin: q, x: x.slice(), y: y.slice(), n: nn, offset: V.dot(nn, q) };
        var hsk = { id: -1, type: 'sketch', plane: rp, entities: [{ t: 'polyline', pts: section, closed: true }] };
        hsk.profile = K.sketchProfile(hsk);
        return revolveSketch(hsk, rp, { p: [0, 0], d: [0, 1] }, 360);
      });
      return tools.length === 1 ? tools[0] : compound(tools);
    }
    // Fillet / chamfer on the edges nearest the picked points, on the body nearest the first pick. OpenCascade
    // carries it along tangent-continuous edges, as SolidWorks' "Tangent propagation".
    function edgeOp(f) {
      var size = f.type === 'chamfer' ? +f.d : +f.r;
      if (!(size > 0)) throw new Error((f.type === 'chamfer' ? 'Distance' : 'Radius') + ' must be greater than zero.');
      var k = pickBody(f.edges && f.edges[0] && f.edges[0].at);
      if (k < 0) throw new Error('Nothing to ' + f.type + ' yet.');
      var body = unify(bodies[k]), es = nearest(f.edges, edgesOf(body), Math.max(0.5, size));
      if (!es.length) throw new Error('No edges found for this ' + f.type + '. Select edges again.');
      var mk = f.type === 'chamfer' ? N(new oc.BRepFilletAPI_MakeChamfer(body)) : N(new oc.BRepFilletAPI_MakeFillet(body, oc.ChFi3d_FilletShape.ChFi3d_Rational));
      es.forEach(function (e) { mk.Add_2(size, e); });
      var res;
      try { res = N(mk.Shape()); } catch (e) { throw new Error('OpenCascade could not ' + f.type + ' these edges (radius too large?).'); }
      bodies[k] = res;
    }
    // Shell: walls of thickness T inside the body; faces nearest the picked points are removed (open), none -> hollow
    function shellOp(f) {
      var T = +f.thickness;
      if (!(T > 0)) throw new Error('Shell thickness must be greater than zero.');
      var k = pickBody(f.faces && f.faces[0] && f.faces[0].at);
      if (k < 0) throw new Error('Nothing to shell yet.');
      var body = unify(bodies[k]), rm = nearest(f.faces, facesOf(body), Math.max(0.5, T / 2)), res;
      var join = oc.GeomAbs_JoinType.GeomAbs_Intersection, mode = oc.BRepOffset_Mode.BRepOffset_Skin;
      if (rm.length) {
        var list = N(new oc.TopTools_ListOfShape_1());
        rm.forEach(function (fc) { list.Append_1(fc); });
        var th = N(new oc.BRepOffsetAPI_MakeThickSolid());
        th.MakeThickSolidByJoin(body, list, -T, 1e-3, mode, false, false, join, false, R());
        if (!th.IsDone()) throw new Error('OpenCascade could not shell the body with this thickness.');
        res = N(th.Shape());
      } else {
        var mo = N(new oc.BRepOffsetAPI_MakeOffsetShape());
        mo.PerformByJoin(body, -T, 1e-3, mode, false, false, join, false, R());
        if (!mo.IsDone()) throw new Error('OpenCascade could not shell the body with this thickness.');
        res = cut(body, N(mo.Shape()));
      }
      bodies[k] = res;
    }
    // Imported feature (exchange.js) that kept its source file (f.brep: { format: 'step' | 'iges', text }): the exact
    // B-rep read again, each solid a body (or unioned into the bodies it touches with merge), in the model's units.
    // One without it (an STL / OBJ / 3MF mesh) stays Anvil's.
    function importOp(f) {
      if (!f.brep || !f.brep.text) throw unsupportedErr('a mesh import (STL / OBJ / 3MF)');
      var shape = readShape(oc, f.brep.format, f.brep.text, N);
      if (m.units === 'in') { var sc = N(new oc.gp_Trsf_1()); sc.SetScale(P([0, 0, 0]), 1 / 25.4); shape = transformed(shape, sc); }
      var list = solidsOf(oc, shape, N);
      if (!list.length) throw new Error('The imported file has no solid geometry.');
      list.forEach(function (s) {
        if (f.merge) { var tb = bboxOf(s), hit = -1; bodies.forEach(function (b, i) { if (hit < 0 && boxesMeet(bboxOf(b), tb)) hit = i; }); if (hit >= 0) { bodies[hit] = fuse(bodies[hit], s); return; } }
        bodies.push(s); bodyFeatures.push(f.id);
      });
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
            case 'loft': tool = loftTool(f); break;
            case 'sweep': tool = sweepTool(f); break;
            case 'hole': tool = holeTool(f); break;
            case 'fillet': case 'chamfer': edgeOp(f); break;
            case 'import': importOp(f); break;
            case 'shell': shellOp(f); break;
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
        bodies: bodies.length, bodyFeatures: bodyFeatures.slice(), valid: true, volume: 0, bbox: null, faces: [], mesh: null, ms: { build: tBuild, mesh: 0 },
        // how closely Anvil's own volume can be expected to agree: its sweeps and lofts are faceted (mitred sections,
        // ruled sections), and an edge picked with chain: false stops at that edge in Anvil while OpenCascade carries
        // the fillet / chamfer on round tangent edges (SolidWorks' tangent propagation); everything else is exact
        tolerance: m.features.some(function (f) {
          return f.type === 'sweep' || f.type === 'loft' || f.type === 'import' || ((f.type === 'fillet' || f.type === 'chamfer') && (f.edges || []).some(function (e) { return e.chain === false; }));
        }) ? 2e-2 : 1e-4 };
      if (unsupported || !bodies.length) return out;
      // booleans leave faces split along old seams (a pocket floor in pieces): merge faces on the same surface
      bodies = bodies.map(function (b) {
        try { var u = N(new oc.ShapeUpgrade_UnifySameDomain_2(b, true, true, false)); u.Build(); return N(u.Shape()); } catch (e) { return b; }
      });
      // exact mass properties per body (volume, surface area, centre of volume): Kernel.massProps prefers them
      out.bodyProps = bodies.map(function (b) {
        if (!valid(b)) out.valid = false;
        var g = N(new oc.GProp_GProps_1()), s = N(new oc.GProp_GProps_1());
        oc.BRepGProp.VolumeProperties_1(b, g, false, false, false); oc.BRepGProp.SurfaceProperties_1(b, s, false, false);
        var c = N(g.CentreOfMass()), v = g.Mass();
        out.volume += v;
        return { volume: v, area: s.Mass(), centroid: [c.X(), c.Y(), c.Z()] };
      });
      var all = bodies.length === 1 ? bodies[0] : compound(bodies);
      out.bbox = bboxOf(all, true);
      if (opts.exports && out.valid) {
        // STEP AP214 and IGES 5.3 straight from the B-rep: every face exact (planes, cylinders, cones, spheres, tori,
        // B-splines), in the model's units, the product named after the part
        var inch = m.units === 'in', name = String(m.name || 'Part').replace(/'/g, '');
        try {
          if (oc.Interface_Static) oc.Interface_Static.SetCVal('write.step.unit', inch ? 'INCH' : 'MM');
          var sw = N(new oc.STEPControl_Writer_1());
          sw.Transfer(all, oc.STEPControl_StepModelType.STEPControl_AsIs, true, R());
          sw.Write('/anvil-export.step');
          out.step = String(oc.FS.readFile('/anvil-export.step', { encoding: 'utf8' })).replace(/PRODUCT\s*\(\s*'[^']*'\s*,\s*'[^']*'/g, "PRODUCT('" + name + "','" + name + "'");
          oc.FS.unlink('/anvil-export.step');
        } catch (e) { out.exportError = 'STEP: ' + (e.message || e); }
        try {
          var iw = N(new oc.IGESControl_Writer_2(inch ? 'IN' : 'MM', 1));
          iw.AddShape(all, R()); iw.ComputeModel(); iw.Write_2('/anvil-export.igs', false);
          out.iges = String(oc.FS.readFile('/anvil-export.igs', { encoding: 'utf8' }));
          oc.FS.unlink('/anvil-export.igs');
        } catch (e) { out.exportError = (out.exportError ? out.exportError + '; ' : '') + 'IGES: ' + (e.message || e); }
      }
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
          var ad = N(new oc.BRepAdaptor_Surface_2(f, true)), t = ad.GetType(), type = SURF[t && t.value != null ? t.value : t] || 'other';
          var info = { body: bi, type: type }, sr = surfRecord(ad, type);
          if (sr) info.surf = sr;
          facesOut.push(info);
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
      return { positions: new Float64Array(pos), faceOf: new Int32Array(faceOf) };
    }
    // Anvil's analytic surface record (kernel.js "analytic surface records") of a cylinder, cone, sphere or torus face
    function surfRecord(ad, type) {
      function xyz(p) { return [p.X(), p.Y(), p.Z()]; }
      function frame(g) { var a = N(g.Position()); return { o: xyz(N(a.Location())), d: xyz(N(a.Direction())) }; }
      try {
        if (type === 'cylinder') { var cy = N(ad.Cylinder()), f1 = frame(cy); return { t: 'cyl', o: f1.o, d: f1.d, r: cy.Radius() }; }
        if (type === 'cone') {
          // gp_Cone: radius RefRadius in the plane of its location, growing by tan(SemiAngle) along its direction
          var co = N(ad.Cone()), f2 = frame(co); return { t: 'cone', o: f2.o, d: f2.d, r: co.RefRadius(), k: Math.tan(co.SemiAngle()) };
        }
        if (type === 'sphere') { var sp = N(ad.Sphere()), f3 = frame(sp); return { t: 'sph', o: f3.o, d: f3.d, r: sp.Radius() }; }
        if (type === 'torus') { var to = N(ad.Torus()), f4 = frame(to); return { t: 'tor', o: f4.o, d: f4.d, R: to.MajorRadius(), r: to.MinorRadius() }; }
      } catch (e) { }
      return null;
    }
  }

  function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

  // ---- STEP / IGES reading (import and the Imported feature's exact rebuild). N: the caller's arena function.
  // readShape -> the file's shapes in millimetres (OpenCascade converts the file's own units)
  function readShape(oc, format, text, N) {
    var iges = format === 'iges', path = '/anvil-import.' + (iges ? 'igs' : 'step');
    oc.FS.writeFile(path, text);
    try {
      var rd = N(iges ? new oc.IGESControl_Reader_1() : new oc.STEPControl_Reader_1());
      if (rd.ReadFile(path) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) throw new Error('OpenCascade could not read this ' + (iges ? 'IGES' : 'STEP') + ' file.');
      rd.TransferRoots(N(new oc.Message_ProgressRange_1()));
      return N(rd.OneShape());
    } finally { try { oc.FS.unlink(path); } catch (e) { } }
  }
  // the solids of a shape; closed shells with no solid around them become solids
  function solidsOf(oc, shape, N) {
    var E = oc.TopAbs_ShapeEnum, out = [];
    for (var x = N(new oc.TopExp_Explorer_2(shape, E.TopAbs_SOLID, E.TopAbs_SHAPE)); x.More(); x.Next()) out.push(N(oc.TopoDS.Solid_1(N(x.Current()))));
    if (!out.length) {
      for (var y = N(new oc.TopExp_Explorer_2(shape, E.TopAbs_SHELL, E.TopAbs_SOLID)); y.More(); y.Next()) {
        try { var ms = N(new oc.BRepBuilderAPI_MakeSolid_3(N(oc.TopoDS.Shell_1(N(y.Current()))))); if (ms.IsDone()) out.push(N(ms.Solid())); } catch (e) { }
      }
    }
    return out;
  }
  // importFile(oc, format, text) -> { solids: [{ name, positions, triangles }] (millimetres; exchange.js finishImport
  // welds and names them), faces, ms }: every solid tessellated finely enough for Anvil's booleans against it
  function importFile(oc, format, text) {
    var arena = [], t0 = now();
    function N(o) { arena.push(o); return o; }
    try {
      var shape = readShape(oc, format, text, N), list = solidsOf(oc, shape, N), E = oc.TopAbs_ShapeEnum, faces = 0;
      if (!list.length) throw new Error('The file has no solid bodies (surfaces only?).');
      var solids = list.map(function (sol, si) {
        var b = N(new oc.Bnd_Box_1()); oc.BRepBndLib.Add(sol, b, false);
        var lo = N(b.CornerMin()), hi = N(b.CornerMax()), diag = Math.hypot(hi.X() - lo.X(), hi.Y() - lo.Y(), hi.Z() - lo.Z());
        N(new oc.BRepMesh_IncrementalMesh_2(sol, Math.max(0.05, diag * 5e-4), false, 0.35, false));
        var pos = [], tris = [];
        for (var x = N(new oc.TopExp_Explorer_2(sol, E.TopAbs_FACE, E.TopAbs_SHAPE)); x.More(); x.Next()) {
          var f = N(oc.TopoDS.Face_1(N(x.Current()))), loc = N(new oc.TopLoc_Location_1());
          var h = N(oc.BRep_Tool.Triangulation(f, loc, oc.Poly_MeshPurpose ? oc.Poly_MeshPurpose.Poly_MeshPurpose_NONE : 0));
          faces++;
          if (h.IsNull()) continue;
          var tri = h.get(), tr = N(loc.Transformation()), rev = f.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED, base = pos.length / 3;
          for (var i = 1; i <= tri.NbNodes(); i++) { var p = N(N(tri.Node(i)).Transformed(tr)); pos.push(p.X(), p.Y(), p.Z()); }
          for (var j = 1; j <= tri.NbTriangles(); j++) {
            var T = N(tri.Triangle(j)), a = T.Value(1) - 1, c = T.Value(3) - 1, bb = T.Value(2) - 1;
            if (rev) tris.push(base + a, base + c, base + bb); else tris.push(base + a, base + bb, base + c);
          }
        }
        return { name: 'Solid' + (si + 1), positions: pos, triangles: tris };
      });
      return { solids: solids, faces: faces, ms: now() - t0 };
    } finally {
      for (var a = arena.length - 1; a >= 0; a--) { try { if (arena[a] && arena[a].delete && !(arena[a].isDeleted && arena[a].isDeleted())) arena[a].delete(); } catch (e) { } }
    }
  }

  // Which B-rep face each mesh face of Anvil's own mesh lies on: for every mesh face, the OpenCascade triangle nearest
  // the centre of its largest triangle (inside the facet, so never on a face boundary). -> Int32Array (B-rep face index or -1 when
  // nothing is within tol). A uniform grid over the triangles keeps it near-linear.
  function mapFaces(mesh, occ, tol) {
    var F = occ.mesh.faceOf, pts = mesh.faces.map(function (f) { return pointOnFace(mesh.positions, f.start, f.count, f.centroid); });
    var tri = nearestTriangles(occ.mesh.positions, pts, tol || 0.25), out = new Int32Array(mesh.faces.length).fill(-1);
    for (var i = 0; i < tri.length; i++) out[i] = tri[i] >= 0 ? F[tri[i]] : -1;
    return out;
  }
  // a point surely inside a run of triangles: the centre of the largest one (an annulus' centroid lies in its hole)
  function pointOnFace(MP, start, count, fallback) {
    var c = fallback, bestA = -1;
    if (MP) for (var tt = start; tt < start + count; tt++) {
      var o = tt * 9, ux = MP[o + 3] - MP[o], uy = MP[o + 4] - MP[o + 1], uz = MP[o + 5] - MP[o + 2], vx = MP[o + 6] - MP[o], vy = MP[o + 7] - MP[o + 1], vz = MP[o + 8] - MP[o + 2];
      var cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx, ar = cx * cx + cy * cy + cz * cz;
      if (ar > bestA) { bestA = ar; c = [(MP[o] + MP[o + 3] + MP[o + 6]) / 3, (MP[o + 1] + MP[o + 4] + MP[o + 7]) / 3, (MP[o + 2] + MP[o + 5] + MP[o + 8]) / 3]; }
    }
    return c;
  }
  // for each point, the index of the nearest triangle of P (9 numbers per triangle) within tol, or -1; a uniform grid
  // over the triangles keeps it near-linear
  function nearestTriangles(P, pts, tol) {
    var nt = P.length / 9, out = new Int32Array(pts.length).fill(-1);
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
    pts.forEach(function (c, pi) {
      if (!c) return;
      var g = [0, 1, 2].map(function (k2) { return Math.floor((c[k2] - lo[k2]) / cell); });
      var list = grid.get(key(g[0], g[1], g[2])) || [], best = tol * tol, hit = -1;
      for (var q = 0; q < list.length; q++) {
        var d2 = pointTriDist2(c, P, list[q] * 9);
        if (d2 < best) { best = d2; hit = list[q]; }
      }
      out[pi] = hit;
    });
    return out;
  }

  // An Anvil build of the same model with OpenCascade's solids in place of Anvil's (ui-occt.js): every triangle
  // becomes a CSG polygon tagged with its B-rep face (`face`, a global face index), the analytic surface record of
  // that face (`surf`, one shared object per face, so shading, curve edges, drawings, exports and the volume
  // correction read them as usual) and the feature that made it (`shared`: the Anvil feature of the nearest Anvil
  // facet, from anvilMesh / anvilTriShared). Everything else (planes, profiles, tools, errors) is Anvil's.
  function toBuild(occ, anvilBuild, anvilMesh, anvilTriShared, CSG, K) {
    var P = occ.mesh.positions, F = occ.mesh.faceOf, nt = F.length, nf = occ.faces.length;
    // one representative point per B-rep face -> the feature of the nearest Anvil facet
    var firstTri = new Int32Array(nf).fill(-1), countTri = new Int32Array(nf);
    for (var t = 0; t < nt; t++) { if (firstTri[F[t]] < 0) firstTri[F[t]] = t; countTri[F[t]]++; }
    var shared = new Array(nf).fill(null);
    if (anvilMesh && anvilMesh.positions && anvilTriShared) {
      // faces' triangles are contiguous in the OpenCascade mesh
      var reps = [];
      for (var fi = 0; fi < nf; fi++) reps.push(firstTri[fi] >= 0 ? pointOnFace(P, firstTri[fi], countTri[fi], null) : null);
      var near = nearestTriangles(anvilMesh.positions, reps, 2);
      for (fi = 0; fi < nf; fi++) if (near[fi] >= 0 && anvilTriShared[near[fi]] >= 0) shared[fi] = anvilTriShared[near[fi]];
    }
    var surfs = occ.faces.map(function (f) { return f.surf ? { s: f.surf } : null; });
    var perBody = [];
    for (t = 0; t < nt; t++) {
      var o = t * 9, face = F[t], bi = occ.faces[face].body;
      var vs = [new CSG.Vertex(new CSG.Vector(P[o], P[o + 1], P[o + 2])), new CSG.Vertex(new CSG.Vector(P[o + 3], P[o + 4], P[o + 5])), new CSG.Vertex(new CSG.Vector(P[o + 6], P[o + 7], P[o + 8]))];
      var pg = CSG.Polygon.tryCreate(vs, shared[face]);
      if (!pg) continue;
      pg.face = face;
      if (surfs[face]) pg.surf = surfs[face];
      (perBody[bi] = perBody[bi] || []).push(pg);
    }
    var bodies = [];
    for (var b = 0; b < occ.bodies; b++) {
      var csg = CSG.fromPolygons(perBody[b] || []);
      if (occ.bodyProps && occ.bodyProps[b]) csg.exact = occ.bodyProps[b];   // Kernel.meshFromBody / massProps use it
      bodies.push(csg);
    }
    var out = {};
    Object.keys(anvilBuild).forEach(function (k) { out[k] = anvilBuild[k]; });
    out.bodies = bodies;
    out.bodyFeatures = bodies.map(function (x, i) { return occ.bodyFeatures && occ.bodyFeatures[i] != null ? occ.bodyFeatures[i] : null; });
    out.body = K.combineBodies(bodies);
    if (occ.bodyProps && occ.bodyProps.length === bodies.length && out.body && !out.body.exact) {
      var V = 0, A = 0, M = [0, 0, 0];
      occ.bodyProps.forEach(function (bp) { V += bp.volume; A += bp.area; for (var k = 0; k < 3; k++) M[k] += bp.volume * bp.centroid[k]; });
      out.body.exact = { volume: V, area: A, centroid: V > 1e-12 ? [M[0] / V, M[1] / V, M[2] / V] : [0, 0, 0] };
    }
    out.cache = anvilBuild.cache;
    out.occt = { volume: occ.volume, faces: nf, bodies: occ.bodies, step: occ.step || null, iges: occ.iges || null };
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

  return { build: build, importFile: importFile, mapFaces: mapFaces, toBuild: toBuild, nearestTriangles: nearestTriangles, SUPPORTED: SUPPORTED };
})();
if (typeof self !== 'undefined') self.OcctKernel = OcctKernel;
