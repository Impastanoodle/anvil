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
// exact arcs, or a 3D polyline; mitred corners) and Hole Wizard holes (stage 2); sheet metal: edge flange, hem, jog,
// Sketched Bend (Kernel.flangeLayout / sketchedBendLayout, exact bend arcs), Break Corner (Kernel.breakCornerLayout,
// exact fillet arcs) and Closed Corner (Kernel.closedCornerLayout, planar prisms); reference Axis / Point / Coordinate
// System (resolved as Kernel.rebuild does; patterns and revolves about an axis, lane DF). Anything else stops
// the build at that feature ('unsupported'), so the caller keeps Anvil's own result. `tolerance` is the relative
// volume agreement to expect with Anvil (1e-4; 2e-2 with sweeps / lofts, which Anvil facets). OpenCascade objects
// are freed after every build.
var OcctKernel = (function () {
  'use strict';
  var SUPPORTED = { sketch: 1, plane: 1, extrude: 1, revolve: 1, lpattern: 1, cpattern: 1, mirror: 1,
    fillet: 1, chamfer: 1, shell: 1, loft: 1, sweep: 1, hole: 1, import: 1, flange: 1, jog: 1, sketchedBend: 1, breakCorner: 1, closedCorner: 1 };
  SUPPORTED.unfold = SUPPORTED.fold = 1;   // lane DB2
  SUPPORTED.refaxis = SUPPORTED.refpoint = SUPPORTED.csys = 1;   // lane CZ: reference geometry makes no body (skipped below)
  SUPPORTED.rip = 1;   // lane DI
  SUPPORTED.crossBreak = 1;   // rfGK: cosmetic, makes no body (skipped below)
  SUPPORTED.vent = 1;   // lane DT
  SUPPORTED.draft = 1;   // rfDX
  SUPPORTED.wrap = 1;   // rfDZ
  SUPPORTED.insertBends = SUPPORTED.convertSM = 1;   // lane DQ
  SUPPORTED.rib = SUPPORTED.intersect = 1;   // rfDY
  SUPPORTED.boundary = 1;   // rfFB
  SUPPORTED.deleteBody = 1;   // rfHT: Delete/Keep Body
  SUPPORTED.helix = SUPPORTED.projCurve = SUPPORTED.compositeCurve = SUPPORTED.xyzCurve = SUPPORTED.refPtCurve = 1;   // rfFA: reference curves (no body)
  var SURF = ['plane', 'cylinder', 'cone', 'sphere', 'torus', 'bezier', 'bspline', 'revolution', 'extrusion', 'offset', 'other'];
  // rfHL: faces whose normals turn by less than this across a shared edge are tangent (BRepLib::EncodeRegularity)
  var TANGENT_ANG = Math.PI / 180;   // 1°

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
      if (!mo.IsDone()) {
        // lane FZ: this build's MakeOffset refuses to shrink a face bounded by ONE closed circular edge (a round boss
        // with any draft failed); the offset of a circle is the concentric circle of radius r + d
        var es = explore(face, ENUM.TopAbs_EDGE);
        if (es.length === 1) {
          var ad = N(new oc.BRepAdaptor_Curve_2(N(oc.TopoDS.Edge_1(es[0])))), ty = ad.GetType();
          if ((ty && ty.value != null ? ty.value : ty) === (oc.GeomAbs_CurveType.GeomAbs_Circle.value != null ? oc.GeomAbs_CurveType.GeomAbs_Circle.value : oc.GeomAbs_CurveType.GeomAbs_Circle)) {
            var ci = N(ad.Circle()), r = ci.Radius() + d;
            if (r > 1e-9 * Math.max(1, ci.Radius())) {
              var cw = N(new oc.BRepBuilderAPI_MakeWire_1());
              cw.Add_1(N(N(new oc.BRepBuilderAPI_MakeEdge_8(N(new oc.gp_Circ_2(N(ci.Position()), r)))).Edge()));
              return N(cw.Wire());
            }
          }
        }
        throw new Error('Draft angle is too large for this depth: the profile collapses.');
      }
      return firstWire(N(mo.Shape()));
    }

    // ---- sketch loops -> wires with exact circles and arcs, B-spline and elliptic edges
    // a spline / ellipse of profile.free (Kernel.sketchProfile) as one edge, over [u0, u1] of its parameter (the whole
    // curve when u0 is null): splines as the B-spline of their Bézier spans (knots = Anvil's chord-length knots, interior
    // multiplicity 3: the same curve exactly), ellipses as gp_Elips (the major axis is OpenCascade's X direction)
    function freeEdge(F, plane, u0, u1) {
      var to3 = function (p) { return K.to3D(plane, p[0], p[1]); };
      if (F.t === 'ellipse') {
        var ro = (F.rot || 0) * Math.PI / 180, swap = F.ry > F.rx, ang = ro + (swap ? Math.PI / 2 : 0);
        var xd = [0, 1, 2].map(function (q) { return plane.x[q] * Math.cos(ang) + plane.y[q] * Math.sin(ang); });
        var el = N(new oc.gp_Elips_2(N(new oc.gp_Ax2_2(P(to3([F.cx, F.cy])), Dir(plane.n), Dir(xd))), Math.max(F.rx, F.ry), Math.min(F.rx, F.ry)));
        if (u0 == null) return N(N(new oc.BRepBuilderAPI_MakeEdge_12(el)).Edge());
        var v0 = u0 - (swap ? Math.PI / 2 : 0), v1 = v0 + (u1 - u0);
        while (v0 < 0) { v0 += 2 * Math.PI; v1 += 2 * Math.PI; }
        return N(N(new oc.BRepBuilderAPI_MakeEdge_13(el, v0, v1)).Edge());
      }
      var m = F.bez.length, poles = N(new oc.TColgp_Array1OfPnt_2(1, 3 * m + 1)), kn = N(new oc.TColStd_Array1OfReal_2(1, m + 1)), mu = N(new oc.TColStd_Array1OfInteger_2(1, m + 1));
      poles.SetValue(1, P(to3(F.bez[0][0])));
      F.bez.forEach(function (B, j) { for (var q = 1; q <= 3; q++) poles.SetValue(3 * j + q + 1, P(to3(B[q]))); });
      for (var j = 0; j <= m; j++) { kn.SetValue(j + 1, F.knots[j]); mu.SetValue(j + 1, j === 0 || j === m ? 4 : 3); }
      var hc = N(new oc.Handle_Geom_Curve_2(new oc.Geom_BSplineCurve_1(poles, kn, mu, 3, false)));   // the handle owns the curve
      return N(u0 == null ? N(new oc.BRepBuilderAPI_MakeEdge_24(hc)).Edge() : N(new oc.BRepBuilderAPI_MakeEdge_25(hc, u0, u1)).Edge());
    }
    function loopWire(loop, profile, plane) {
      var pts = loop.pts, n = pts.length, seg = loop.seg, curves = profile.curves || [], fseg = loop.fseg, free = profile.free || [];
      var to3 = function (p) { return K.to3D(plane, p[0], p[1]); };
      var mw = N(new oc.BRepBuilderAPI_MakeWire_1());
      if (seg && seg.every(function (k) { return k === seg[0] && k >= 0; }) && curves[seg[0]].full) {
        var C = curves[seg[0]], ax = N(new oc.gp_Ax2_2(P(to3(C.c)), Dir(plane.n), Dir(plane.x)));
        mw.Add_1(N(N(new oc.BRepBuilderAPI_MakeEdge_8(N(new oc.gp_Circ_2(ax, C.r)))).Edge()));
        return N(mw.Wire());
      }
      // a closed spline or a full ellipse alone is one closed edge
      var F0 = fseg && fseg[0] !== -1 ? free[fseg[0][0]] : null;
      if (F0 && (F0.full || F0.closed) && fseg.every(function (q) { return q !== -1 && q[0] === fseg[0][0]; })) {
        mw.Add_1(freeEdge(F0, plane, null, null));
        return N(mw.Wire());
      }
      // the curve a segment lies on: a free curve 'f<k>', a circle / arc index, or -1 (straight)
      function keyAt(q) { return fseg && fseg[q] !== -1 ? 'f' + fseg[q][0] : seg ? seg[q] : -1; }
      // start at a vertex where the curve index changes, so no run of chords wraps around the loop's start
      var start = 0;
      if (seg || fseg) for (var s = 0; s < n; s++) if (keyAt(s) !== keyAt((s + n - 1) % n)) { start = s; break; }
      var i = 0;
      while (i < n) {
        var a = (start + i) % n, k = keyAt(a), len = 1;
        if (k !== -1) while (i + len < n && keyAt((start + i + len) % n) === k) len++;
        var b = (start + i + len) % n;
        if (typeof k === 'string') {
          var fa = fseg[a], fb = fseg[(a + len - 1) % n];
          mw.Add_1(freeEdge(free[fa[0]], plane, Math.min(fa[1], fb[2]), Math.max(fa[1], fb[2])));
        } else if (k < 0) mw.Add_1(N(N(new oc.BRepBuilderAPI_MakeEdge_3(P(to3(pts[a])), P(to3(pts[b])))).Edge()));
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
    // lane HU: one Boolean per nesting level (a General Fuse / Cut with every loop of that level as a tool), not one per
    // loop: a perforated panel's 600 circles were 599 Fuses one after the other (43.5 of a 58 s build)
    function fromLoops(faces, makeSolid) {
      var levels = [], acc = null;
      faces.forEach(function (lf) { (levels[lf.depth] = levels[lf.depth] || []).push(makeSolid(lf.face, lf.depth % 2 === 1)); });
      levels.forEach(function (list, depth) {
        if (!list || !list.length) return;
        if (depth % 2 === 0) {
          if (!acc) acc = list.length === 1 ? list[0] : boolMany('fuse', list[0], list.slice(1), 'OpenCascade could not join the sketch\'s regions.');
          else acc = boolMany('fuse', acc, list, 'OpenCascade could not join the sketch\'s regions.');
        } else if (acc) acc = boolMany('cut', acc, list, 'OpenCascade could not cut the sketch\'s holes.');
      });
      if (!acc) throw new Error('Sketch has no closed profile.');
      return acc;
    }

    var rm = K.resolvedModel(model), m = rm.model;
    var planes = {}, sketches = {}, tools = {}, bodies = [], bodyFeatures = [], status = {}, unsupported = null;
    // a feature Anvil's kernel only approximates was built (a shell of curved faces, three picked edges meeting at one
    // corner): the volume check against Anvil uses the loose tolerance (see out.tolerance)
    var approx = false;
    function sketchOf(f) {
      var s = sketches[f.sketch] || K.findFeature(m, f.sketch);
      if (!s || s.type !== 'sketch') throw new Error('Select a sketch for this feature.');
      return s;
    }
    // r10/facesketch10: the planar faces of the current bodies as [{ n (outward), w }] for a 'geom' face reference
    function brepPlanes() {
      var out = [];
      bodies.forEach(function (b) {
        facesOf(b).forEach(function (fc) {
          try {
            var ad = N(new oc.BRepAdaptor_Surface_2(fc, true)), t = ad.GetType();
            if ((t && t.value != null ? t.value : t) !== 0) return;
            var ax = N(N(ad.Plane()).Axis()), d = N(ax.Direction()), o = N(ax.Location()), n = [d.X(), d.Y(), d.Z()];
            if (fc.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED) n = V.scale(n, -1);
            out.push({ n: n, w: V.dot(n, [o.X(), o.Y(), o.Z()]) });
          } catch (e) { }
        });
      });
      return out;
    }
    function moveTo(sh, t, plane) { var tr = N(new oc.gp_Trsf_1()); tr.SetTranslation_1(Vec([plane.n[0] * t, plane.n[1] * t, plane.n[2] * t])); return transformed(sh, tr); }
    function extrudeTool(f) {
      if (f.sheetBase && rm.sheetError) throw new Error(rm.sheetError);
      var sk = K.contourSketch(f, sketchOf(f)), plane = K.resolvePlane(sk.plane, m, planes);   // lane CO: Selected Contours
      if (f.tab && !f.cut) {   // lane DI: a Tab goes T into the sheet face it is sketched on (Kernel.tabFeature)
        var tpolys = [];
        bodies.forEach(function (b) { Array.prototype.push.apply(tpolys, shapeToCSG(b).polygons); });
        f = K.tabFeature(f, m, plane, CSGlib ? CSGlib.fromPolygons(tpolys) : null);
      }
      var range = K.extrudeRange(f, K.THROUGH);
      if (f.draft != null && !isFinite(+f.draft)) throw new Error('Draft angle must be a number.');
      var draft = +f.draft || 0;
      if (Math.abs(draft) >= 89) throw new Error('Draft angle must be less than 89°.');
      // draft (as Kernel.buildExtrude): the section shrinks (grows with draftOut) by |t|·tan(angle) at distance t from
      // the sketch plane; a hole loop does the opposite. Ruled loft between the two offset sections.
      var k = draft ? Math.tan(draft * Math.PI / 180) * (f.draftOut ? 1 : -1) : 0;
      var solid = fromLoops(loopFaces(sk, plane), function (face, hole) {
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
      if (f.cut && f.normalCut && m.sheet && bodies.length) {
        var ncDir = (f.dir2 || f.end === 'mid') ? null : V.scale(plane.n, f.reverse ? -1 : 1);
        solid = normalCutTool(solid, ncDir);
      }
      return solid;
    }
    // Normal Cut (as Kernel.normalCutTool): the tool's faces that lie on a sheet surface where it meets the body (air
    // just in front, metal half a thickness behind, air a thickness behind; area-weighted over its triangles), only
    // those the cut enters through when it has one direction, each pushed straight through the thickness: planar faces
    // as prisms, bend faces as a thickness-deep offset solid. Returns the tool itself when it crosses no sheet surface.
    function normalCutTool(tool, dir) {
      var body = bodies.length === 1 ? bodies[0] : compound(bodies);
      var com = N(new oc.BRepAlgoAPI_Common_3(body, tool, R()));
      if (!com.IsDone()) return tool;
      var Rs = N(com.Shape());
      if (!(volumeOf(Rs) > 1e-9)) return tool;
      var T = +K.sheetParams(m).thickness, eps = 1e-3 * T;
      var cls = N(new oc.BRepClass3d_SolidClassifier_2(body));
      function inside(p) { cls.Perform(P(p), 1e-7); return cls.State() === oc.TopAbs_State.TopAbs_IN; }
      // tris(fc) -> { n: area-weighted unit normal, pts: triangulation nodes, list: [{ c: centroid, n, w: 2·area }] }
      // of a face of a shape meshed beforehand, or null
      function tris(fc) {
        var loc = N(new oc.TopLoc_Location_1()), h = N(oc.BRep_Tool.Triangulation(fc, loc, oc.Poly_MeshPurpose ? oc.Poly_MeshPurpose.Poly_MeshPurpose_NONE : 0));
        if (h.IsNull()) return null;
        var tri = h.get(), tr = N(loc.Transformation()), rev = fc.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED, nodes = [], list = [];
        for (var i = 1; i <= tri.NbNodes(); i++) { var p = N(N(tri.Node(i)).Transformed(tr)); nodes[i] = [p.X(), p.Y(), p.Z()]; }
        var nSum = [0, 0, 0], uv = tri.HasUVNodes(), gf = uv ? N(new oc.BRepGProp_Face_2(fc, false)) : null;
        for (var j = 1; j <= tri.NbTriangles(); j++) {
          var Tt = N(tri.Triangle(j)), ia = Tt.Value(1), ib = Tt.Value(2), ic = Tt.Value(3), a = nodes[ia], b = nodes[ib], c = nodes[ic];
          if (rev) { var x = b; b = c; c = x; }
          var cr = V.cross(V.sub(b, a), V.sub(c, a)), w = V.len(cr);
          if (w < 1e-12) continue;
          nSum = V.add(nSum, cr);
          var t = { c: V.scale(V.add(V.add(a, b), c), 1 / 3), n: V.scale(cr, 1 / w), w: w };
          // CW: the probe point and normal on the surface itself (the triangle's centroid on a bend's chord lies up to
          // its sagitta off the surface, more than the probes' 1e-3·T: the inside surface of a bend never read as a
          // sheet surface)
          if (gf) {
            var A2 = N(tri.UVNode(ia)), B2 = N(tri.UVNode(ib)), C2 = N(tri.UVNode(ic)), Ps = N(new oc.gp_Pnt_1()), Vn = N(new oc.gp_Vec_1());
            gf.Normal((A2.X() + B2.X() + C2.X()) / 3, (A2.Y() + B2.Y() + C2.Y()) / 3, Ps, Vn);
            var nl = Math.hypot(Vn.X(), Vn.Y(), Vn.Z());
            if (nl > 1e-12) { t.c = [Ps.X(), Ps.Y(), Ps.Z()]; t.n = [Vn.X() / nl, Vn.Y() / nl, Vn.Z() / nl]; }
          }
          list.push(t);
        }
        return list.length ? { n: V.norm(nSum), pts: nodes.slice(1), list: list } : null;
      }
      // sheetFaces(shape) -> { caps, entry }: its faces on a sheet surface (air just in front, metal half a thickness
      // behind, air a thickness behind; area-weighted over the triangles), and of those the ones the cut enters through
      function sheetFaces(sh) {
        N(new oc.BRepMesh_IncrementalMesh_2(sh, Math.max(0.05, T / 4), false, 0.35, false));
        var out = { caps: [], entry: [] };
        facesOf(sh).forEach(function (fc) {
          var ti = tris(fc);
          if (!ti) return;
          var yes = 0, no = 0;
          ti.list.forEach(function (t) {
            var onSheet = !inside(V.add(t.c, V.scale(t.n, eps))) && inside(V.sub(t.c, V.scale(t.n, T / 2))) && !inside(V.sub(t.c, V.scale(t.n, T + eps)));
            if (onSheet) yes += t.w; else no += t.w;
          });
          if (!(yes > no)) return;
          var rec = { face: fc, n: ti.n, pts: ti.pts };
          out.caps.push(rec);
          if (dir && V.dot(ti.n, dir) < -1e-6) out.entry.push(rec);
        });
        return out;
      }
      var sf = sheetFaces(Rs), caps = sf.caps, entry = sf.entry;
      var chosen = entry.length ? entry : caps;
      if (!chosen.length) return tool;
      // CW (as Kernel.normalCutTool, rfBZ): a cut sketched on a face next to a bend (a hole straddling the bend line,
      // cut from the top face) reaches only the part of the bend below its sketch plane, while the bend's inside surface
      // rises above it. As SolidWorks' Normal Cut, the footprint follows the sheet surface it enters through across the
      // bend: the tool's start cap (its backmost faces facing −dir) is swept back against dir past the body, and the
      // sheet-surface faces it meets there that face the cut and continue an entry face (sharing a point with one, face
      // after face) join the entry faces. On the exact bend the inside surface is tangent to the flat face and to the
      // wall, so the pieces meet with no joint wedge (Anvil's faceted bend needs one).
      if (dir && entry.length) {
        var tcaps = [], wMin = Infinity;
        N(new oc.BRepMesh_IncrementalMesh_2(tool, Math.max(0.05, T / 4), false, 0.35, false));
        facesOf(tool).forEach(function (fc) {
          var ad = N(new oc.BRepAdaptor_Surface_2(fc, true)), ty = ad.GetType();
          if ((ty && ty.value != null ? ty.value : ty) !== 0) return;
          var ti = tris(fc);
          if (!ti || V.dot(ti.n, dir) > -1 + 1e-9) return;
          var w = V.dot(ti.n, ti.pts[0]);
          tcaps.push({ face: fc, w: w });
          wMin = Math.min(wMin, w);
        });
        tcaps = tcaps.filter(function (c) { return Math.abs(c.w - wMin) < 1e-9 * (1 + Math.abs(wMin)); });
        var bb = bboxOf(body), H = bb ? V.len(V.sub(bb[1], bb[0])) + 1 : 0, back = null;
        tcaps.forEach(function (c) {
          var pr = N(N(new oc.BRepPrimAPI_MakePrism_1(c.face, Vec(V.scale(dir, -H)), false, true)).Shape());
          back = back ? fuse(back, pr) : pr;
        });
        var com2 = back ? N(new oc.BRepAlgoAPI_Common_3(body, back, R())) : null;
        var R2 = com2 && com2.IsDone() ? N(com2.Shape()) : null;
        if (R2 && volumeOf(R2) > 1e-12) {
          var tol = 1e-6 * Math.max(1, 100 * T), cand = sheetFaces(R2).entry, seen = chosen.map(function (c) { return c.pts; });
          var touches = function (c) { return seen.some(function (pts) { return pts.some(function (q) { return c.pts.some(function (s) { return Math.abs(s[0] - q[0]) < tol && Math.abs(s[1] - q[1]) < tol && Math.abs(s[2] - q[2]) < tol; }); }); }); };
          chosen = chosen.slice();
          for (var grew = true; grew && cand.length;) {
            grew = false;
            cand = cand.filter(function (c) {
              if (!touches(c)) return true;
              chosen.push(c); seen.push(c.pts); grew = true;
              return false;
            });
          }
        }
      }
      var pieces = chosen.map(function (c) {
        var ad = N(new oc.BRepAdaptor_Surface_2(c.face, true)), t = ad.GetType(), planar = (t && t.value != null ? t.value : t) === 0;
        if (planar) {
          var mv = N(new oc.gp_Trsf_1()); mv.SetTranslation_1(Vec(V.scale(c.n, eps)));
          return N(N(new oc.BRepPrimAPI_MakePrism_1(transformed(c.face, mv), Vec(V.scale(c.n, -(T + 2 * eps))), false, true)).Shape());
        }
        var th = N(new oc.BRepOffsetAPI_MakeThickSolid());
        th.MakeThickSolidBySimple(c.face, -(T + eps));
        if (!th.IsDone()) throw new Error('OpenCascade could not make the normal cut through a bend.');
        return N(th.Shape());
      });
      var out = pieces[0];
      for (var q = 1; q < pieces.length; q++) out = fuse(out, pieces[q]);
      return out;
    }
    function revolveTool(f) {
      var sk = K.contourSketch(f, sketchOf(f)), rpl = K.resolvePlane(sk.plane, m, planes);   // lane CO: Selected Contours
      if (K.refAxisId(f) != null) f = K._.revolveOnRefAxis(f, refAxisRec(f), rpl, { units: m.units });   // lane DF: about a reference axis
      return revolveSketch(sk, rpl, K.revolveAxis(f, sk), (+f.angle || 360) * (f.reverse ? -1 : 1));
    }
    // lane DF: reference geometry resolved here exactly as Kernel.rebuild does (Kernel.resolveRefGeo); a face / edge /
    // vertex reference reads a faceted copy of this build's bodies, its cylinder / cone faces tagged with their
    // analytic records (so a cylindrical face gives its exact axis). The record rides in `planes` like Anvil's ctx.planes.
    function refGeoCtx() {
      var c = { planes: planes, sketches: sketches, units: m.units }, body;
      Object.defineProperty(c, 'body', { enumerable: true, get: function () {
        if (body === undefined) body = bodies.length && CSGlib ? shapeToCSG(transformed(compound(bodies), N(new oc.gp_Trsf_1())), null, null, true) : null;
        return body;
      } });
      return c;
    }
    function refAxisRec(f) {
      var id = K.refAxisId(f), g = planes[id];
      if (!g || g.refgeo !== 'axis') throw new Error('The reference axis (feature ' + id + ') is missing or failed to rebuild.');
      return g;
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
    // lane FZ2: a Mirror / LPattern / CirPattern of a fillet or chamfer (rfGA G10): OpenCascade rounds edges in place
    // (edgeOp, no tool body), so the copy is the same edge feature on the edges at the moved pick points, one per
    // instance, as SolidWorks does. The point maps follow patternTool's own transforms below.
    function edgeFeatureCopies(f, sf) {
      var maps = [];
      if (f.type === 'mirror') {
        var mp = K.makePlane(f.plane || 'Right', f.offset || 0);
        maps.push(function (p) { var d = V.dot(V.sub(p, mp.origin), mp.n); return V.sub(p, V.scale(mp.n, 2 * d)); });
      } else if (f.type === 'lpattern') {
        var d1 = K.AXES[f.d1 || 'x'].map(function (x) { return x * (f.rev1 ? -1 : 1); }), n1 = Math.max(1, f.n1 | 0), n2 = f.d2 ? Math.max(1, f.n2 | 0) : 1;
        var d2 = f.d2 ? K.AXES[f.d2].map(function (x) { return x * (f.rev2 ? -1 : 1); }) : [0, 0, 0];
        for (var i = 0; i < n1; i++) for (var j = 0; j < n2; j++) {
          if (i === 0 && j === 0) continue;
          (function (t) { maps.push(function (p) { return V.add(p, t); }); })(V.add(V.scale(d1, i * (+f.s1 || 0)), V.scale(d2, j * (+f.s2 || 0))));
        }
      } else {
        var count = Math.max(2, f.n | 0), total = +f.angle || 360, step = f.equal === false ? total : (Math.abs(total) >= 360 ? total / count : total / (count - 1));
        var rax = K.refAxisId(f) != null ? refAxisRec(f) : null, o = rax ? rax.o : f.center || [0, 0, 0], ax = rax ? rax.d : K.AXES[f.axis || 'z'];
        ax = V.scale(ax, 1 / V.len(ax));
        for (var c = 1; c < count; c++) (function (a) {
          var cs = Math.cos(a), sn = Math.sin(a);
          maps.push(function (p) { var v = V.sub(p, o), k = V.dot(ax, v); return V.add(o, V.add(V.add(V.scale(v, cs), V.scale(V.cross(ax, v), sn)), V.scale(ax, k * (1 - cs)))); });
        })(step * c * Math.PI / 180);
      }
      maps.forEach(function (mapP) {
        var g = JSON.parse(JSON.stringify(sf));
        g.edges = (sf.edges || []).map(function (e) { var e2 = JSON.parse(JSON.stringify(e)); e2.at = mapP(e.at); return e2; });
        edgeOp(g);
      });
    }
    function patternTool(f) {
      var src = familyTool(f.feature), copies = [], sf = !src && f.feature != null ? K.findFeature(m, f.feature) : null;
      if (sf && (sf.type === 'fillet' || sf.type === 'chamfer') && !(f.type === 'mirror' && f.body)) { edgeFeatureCopies(f, sf); return null; }
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
        var rax = K.refAxisId(f) != null ? refAxisRec(f) : null;   // lane DF: about a reference axis
        var axis = N(new oc.gp_Ax1_2(P(rax ? rax.o : f.center || [0, 0, 0]), Dir(rax ? rax.d : K.AXES[f.axis || 'z'])));
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
    // lane lofts: Geom_BSplineSurface of one Kernel loft patch (kernel-features.js loftPatches: poles[u][v])
    function patchFace(pa) {
      var nu = pa.poles.length, nv = pa.poles[0].length, poles = N(new oc.TColgp_Array2OfPnt_2(1, nu, 1, nv));
      pa.poles.forEach(function (row, a) { row.forEach(function (q, b) { poles.SetValue(a + 1, b + 1, P(q)); }); });
      function reals(xs) { var o = N(new oc.TColStd_Array1OfReal_2(1, xs.length)); xs.forEach(function (x, i) { o.SetValue(i + 1, x); }); return o; }
      function ints(xs) { var o = N(new oc.TColStd_Array1OfInteger_2(1, xs.length)); xs.forEach(function (x, i) { o.SetValue(i + 1, x); }); return o; }
      var surf;
      if (pa.weights) {
        var wts = N(new oc.TColStd_Array2OfReal_2(1, nu, 1, nv));
        pa.weights.forEach(function (row, a) { row.forEach(function (w, b) { wts.SetValue(a + 1, b + 1, w); }); });
        surf = new oc.Geom_BSplineSurface_2(poles, wts, reals(pa.uKnots), reals(pa.vKnots), ints(pa.uMults), ints(pa.vMults), 3, pa.degV, false, false);
      } else surf = new oc.Geom_BSplineSurface_1(poles, reals(pa.uKnots), reals(pa.vKnots), ints(pa.uMults), ints(pa.vMults), 3, pa.degV, false, false);
      return N(N(new oc.BRepBuilderAPI_MakeFace_8(N(new oc.Handle_Geom_Surface_2(surf)), 1e-7)).Face());   // the handle owns the surface
    }
    // rfHL: a loft through full circles has one side face in SolidWorks; its pieces are joined into one closed surface
    // (kernel-features.js joinLoftPatches, shared with the STEP writer) and MakeFace gives it a seam edge. The seams
    // between quarter pieces were drawn as edges wherever the mesh turned by more than the smooth angle across them.
    function joinPatches(list) { return K._.joinLoftPatches ? K._.joinLoftPatches(list) : null; }
    // the first (b = 0) or last v row of a patch as an edge of a cap
    function patchRimEdge(pa, last) {
      var nu = pa.poles.length, poles = N(new oc.TColgp_Array1OfPnt_2(1, nu)), kn = N(new oc.TColStd_Array1OfReal_2(1, pa.uKnots.length)), mu = N(new oc.TColStd_Array1OfInteger_2(1, pa.uKnots.length)), wts = null;
      pa.poles.forEach(function (row, a) { poles.SetValue(a + 1, P(row[last ? row.length - 1 : 0])); });
      pa.uKnots.forEach(function (x, i) { kn.SetValue(i + 1, x); mu.SetValue(i + 1, pa.uMults[i]); });
      if (pa.weights) {
        wts = N(new oc.TColStd_Array1OfReal_2(1, nu));
        pa.weights.forEach(function (row, a) { wts.SetValue(a + 1, row[0]); });
      }
      var c = wts ? new oc.Geom_BSplineCurve_2(poles, wts, kn, mu, 3, false, true) : new oc.Geom_BSplineCurve_1(poles, kn, mu, 3, false);
      return N(N(new oc.BRepBuilderAPI_MakeEdge_24(N(new oc.Handle_Geom_Curve_2(c)))).Edge());
    }
    // Loft through the sections' outer loops, by SolidWorks' rule. Three or more sections: the natural cubic spline of
    // Anvil's own loft, as exact bicubic faces; OpenCascade's own smoothing in ThruSections is a different surface (+7e-3
    // on S29), and so is the way it pairs up the points of differing outlines. Two sections are ruled: polygon → circle
    // as Anvil's blend (ThruSections pairs the circle's points differently, +2e-3 on S28), others ruled ThruSections.
    function loftTool(f) {
      var ids = f.sketches || [];
      if (ids.length < 2) throw new Error('Loft needs at least two profile sketches.');
      var secs = ids.map(function (id) {
        var s = sketchById(id, 'Loft sketch not found.'), pl = K.resolvePlane(s.plane, m, planes);
        var o = outerLoop(s, 'Each loft sketch must contain exactly one closed profile.');
        return { plane: pl, loop: o.loop, prof: o.profile, pts: o.loop.pts.map(function (p) { return K.to3D(pl, p[0], p[1]); }) };
      });
      var patched = K._.loftPatches(secs);
      if (patched && patched.smooth) {
        var one = joinPatches(patched.faces);
        if (one) patched = { faces: [one] };
      }
      if (patched) {
        var sew = N(new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false));
        patched.faces.forEach(function (pa) { sew.Add(patchFace(pa)); });
        [false, true].forEach(function (last) {
          var mw = N(new oc.BRepBuilderAPI_MakeWire_1());
          patched.faces.forEach(function (pa) { mw.Add_1(patchRimEdge(pa, last)); });
          if (!mw.IsDone()) throw new Error('OpenCascade could not close a loft end profile.');
          sew.Add(N(N(new oc.BRepBuilderAPI_MakeFace_15(N(mw.Wire()), true)).Face()));
        });
        sew.Perform(R());
        var shells = explore(N(sew.SewedShape()), ENUM.TopAbs_SHELL);
        if (shells.length !== 1) throw new Error('OpenCascade could not close the loft into a solid.');
        var solid = N(N(new oc.BRepBuilderAPI_MakeSolid_3(N(oc.TopoDS.Shell_1(shells[0])))).Solid());
        return volumeOf(solid) < 0 ? N(solid.Reversed()) : solid;
      }
      var ts = N(new oc.BRepOffsetAPI_ThruSections(true, true, 1e-6));
      secs.forEach(function (s) { ts.AddWire(loopWire(s.loop, s.prof, s.plane)); });
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
      var path = Array.isArray(f.path) ? polylinePath(f.path, c0) : K.isCurveFeature && K.isCurveFeature(K.findFeature(m, f.path)) ? rfFAcurvePath(oc, N, P, Dir, planes[f.path], c0, V) : sketchPathEdges(f.path, c0);   // rfFA: a reference curve
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
        if (e.construction || e.t === 'text' || K.noProfileEntity(sk, e)) return;   // sketch-layers: ETCH / BEND entities (and text) are not the path
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
      var s = HW.spec(f, m.units), sk = sketchById(f.sketch, 'Hole Wizard: select the positions sketch.'), plane = K.resolvePlane(sk.plane, m, planes);
      var pts = (sk.entities || []).filter(function (e) { return e.t === 'point' && !e.construction && !K.noProfileEntity(sk, e); });
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
      // seam edges (where a cylinder or cone closes on itself) and degenerate ones are no edges to round: a pick on a
      // rim right where the seam meets it is as near the seam as the rim, and the fillet on the seam failed
      var body = unify(bodies[k]);
      var es = pickedEdges(f, body, size);
      if (!es.length) throw new Error('No edges found for this ' + f.type + '. Select edges again.');
      var mk = edgeMaker(f, body, es, size);
      // a fillet / chamfer along a curved edge is polygonal in Anvil (it follows the edge's facets)
      if (es.some(function (e) { var t = N(new oc.BRepAdaptor_Curve_2(e)).GetType(); return (t && t.value != null ? t.value : t) !== 0; })) approx = true;
      // three or more picked edges meeting at one vertex: OpenCascade blends the corner (a sphere for fillets, a
      // corner facet for chamfers) where Anvil mitres the edge solids, so the volumes differ by a few r³ per corner
      if (es.length >= 3) {
        var at = {};
        es.forEach(function (e) {
          var mine = {};
          explore(e, ENUM.TopAbs_VERTEX).forEach(function (v) {
            var p = N(oc.BRep_Tool.Pnt(N(oc.TopoDS.Vertex_1(v))));
            mine[[p.X(), p.Y(), p.Z()].map(function (x) { return Math.round(x * 1e5); }).join(',')] = 1;
          });
          Object.keys(mine).forEach(function (key) { at[key] = (at[key] || 0) + 1; });
        });
        if (Object.keys(at).some(function (key) { return at[key] >= 3; })) approx = true;
      }
      var res;
      try { res = N(mk.Shape()); } catch (e) { res = null; }
      if (!res) res = widenedEdgeOp(f, body, es, size);
      if (!res) throw new Error('OpenCascade could not ' + f.type + ' these edges (' + (f.type === 'chamfer' ? 'distance' : 'radius') + ' too large?).');
      bodies[k] = res;
    }
    // the edges of body nearest the picks; seam edges (where a cylinder or cone closes on itself) and degenerate ones
    // are no edges to round: a pick on a rim right where the seam meets it is as near the seam as the rim, and the
    // fillet on the seam failed
    function pickedEdges(f, body, size) {
      var seams = N(new oc.TopTools_IndexedMapOfShape_1());
      facesOf(body).forEach(function (fc) {
        explore(fc, ENUM.TopAbs_EDGE).forEach(function (s) { var e = N(oc.TopoDS.Edge_1(s)); if (oc.BRep_Tool.IsClosed_2(e, fc) || oc.BRep_Tool.Degenerated(e)) seams.Add(e); });
      });
      return nearest(f.edges, edgesOf(body).filter(function (e) { return !seams.Contains(e); }), K.pickTol(m.units, size));   // r16/picktol
    }
    function edgeMaker(f, body, es, size) {
      var mk = f.type === 'chamfer' ? N(new oc.BRepFilletAPI_MakeChamfer(body)) : N(new oc.BRepFilletAPI_MakeFillet(body, oc.ChFi3d_FilletShape.ChFi3d_Rational));
      es.forEach(function (e) { mk.Add_2(size, e); });
      return mk;
    }
    // lane HU: a fillet (or chamfer) whose size uses up a whole face next to its edge: Fillet2 R50 on the top edge of a
    // block 50 deep (the user's part, 2026-11-04). The round's spring line lands exactly on that face's far edge and the
    // face vanishes; SolidWorks builds it, OpenCascade's ChFi3d refuses it ("radius too large"), and a radius a hair
    // under leaves a sliver face. So, for each straight picked edge and each planar face F beside it whose far edge
    // (a line parallel to the picked one) lies exactly where the round or chamfer meets F, the faces W across that far
    // edge are pushed out along F by delta (a prism of W, minus the body: material outside the body only), the round is
    // made on that widened body, where F is wider than the round, and the added material is cut away again. Exact
    // radius, no sliver: the round meets W along the old far edge. null when no face qualifies or the result is bad.
    function widenedEdgeOp(f, body, es, size) {
      var faces = facesOf(body), tol = 1e-7 * Math.max(size, 1), delta = 0.1 * size, tools = [];
      function vtx(s) { var p = N(oc.BRep_Tool.Pnt(N(oc.TopoDS.Vertex_1(s)))); return [p.X(), p.Y(), p.Z()]; }
      function lineOf(e) {
        var t = N(new oc.BRepAdaptor_Curve_2(e)).GetType();
        if ((t && t.value != null ? t.value : t) !== 0) return null;
        var v = explore(e, ENUM.TopAbs_VERTEX).map(vtx), d = v.length >= 2 ? V.sub(v[1], v[0]) : null, L = d ? V.len(d) : 0;
        return L > 1e-9 ? { a: v[0], t: V.scale(d, 1 / L) } : null;
      }
      function has(fc, e) { return explore(fc, ENUM.TopAbs_EDGE).some(function (x) { return x.IsSame(e); }); }
      es.forEach(function (e) {
        var ln = lineOf(e), beside = faces.filter(function (fc) { return has(fc, e); });
        if (!ln || beside.length !== 2) return;
        var pl = beside.map(draftPlaneOf);
        if (!pl[0] || !pl[1]) return;
        // where the round meets each face, measured from the edge: r·tan(θ/2), θ the angle between the faces' normals
        // (r on a square edge, convex or concave); a chamfer's distance as it is
        var th = Math.acos(Math.max(-1, Math.min(1, V.dot(pl[0].n, pl[1].n))));
        var reach = f.type === 'chamfer' ? size : size * Math.tan(th / 2);
        beside.forEach(function (F, i) {
          // u: across F, away from the edge (the side F's vertices lie on)
          var u = V.norm(V.cross(pl[i].n, ln.t)), side = 0, mixed = false;
          explore(F, ENUM.TopAbs_VERTEX).map(vtx).forEach(function (p) {
            var s = V.dot(V.sub(p, ln.a), u);
            if (Math.abs(s) <= tol) return;
            if (!side) side = s > 0 ? 1 : -1; else if ((s > 0 ? 1 : -1) !== side) mixed = true;
          });
          if (!side || mixed) return;
          u = V.scale(u, side);
          edgesOf(F).forEach(function (w) {
            if (w.IsSame(e)) return;
            var lw = lineOf(w);
            if (!lw || Math.abs(Math.abs(V.dot(lw.t, ln.t)) - 1) > 1e-9) return;
            var d = V.dot(V.sub(lw.a, ln.a), u);
            if (Math.abs(d - reach) > tol) return;
            faces.forEach(function (W) {
              if (W.IsSame(F) || !has(W, w)) return;
              var pr = N(N(new oc.BRepPrimAPI_MakePrism_1(W, Vec(V.scale(u, delta)), false, true)).Shape());
              var out = cut(pr, body);
              if (volumeOf(out) > 1e-9 * Math.pow(Math.max(size, 1e-3), 3)) tools.push(out);
            });
          });
        });
      });
      if (!tools.length) return null;
      try {
        var wide = unify(boolMany('fuse', body, tools, 'OpenCascade could not widen the body.'));
        var es2 = pickedEdges(f, wide, size);
        if (es2.length !== es.length) return null;
        var rounded = N(edgeMaker(f, wide, es2, size).Shape());
        var res = unify(boolMany('cut', rounded, tools, 'OpenCascade could not trim the widened body.'));
        if (!valid(res) || explore(res, ENUM.TopAbs_SOLID).length !== 1 || !(volumeOf(res) > 0)) return null;
        return res;
      } catch (err) { return null; }
    }
    // Shell: walls of thickness T inside the body; faces nearest the picked points are removed (open), none -> hollow
    function shellOp(f) {
      var T = +f.thickness;
      if (!(T > 0)) throw new Error('Shell thickness must be greater than zero.');
      var k = pickBody(f.faces && f.faces[0] && f.faces[0].at);
      if (k < 0) throw new Error('Nothing to shell yet.');
      var body = unify(bodies[k]), rm = nearest(f.faces, facesOf(body), K.pickTol(m.units, T / 2)), res;   // r16/picktol
      // a pick that found no face is an error, as in Kernel.buildShell (it used to fall through to a closed shell)
      if ((f.faces || []).length && rm.length < f.faces.length) throw new Error('A face to remove was not found on the body. Select the faces again.');
      var join = oc.GeomAbs_JoinType.GeomAbs_Intersection, mode = oc.BRepOffset_Mode.BRepOffset_Skin;
      // Anvil offsets curved faces facet by facet (a polygonal cavity); OpenCascade's walls are the exact offset
      if (facesOf(body).some(function (fc) { var t = N(new oc.BRepAdaptor_Surface_2(fc, true)).GetType(); return (t && t.value != null ? t.value : t) !== 0; })) approx = true;
      // lane FZ: OpenCascade's offset with sharp (intersection) joins comes out invalid on some bodies with curved
      // faces (a cylinder notched by a slot: 14930 instead of ~8720 mm³, BRepCheck fails; the arc join is invalid too
      // or rounds the inside corners, which Anvil and SolidWorks keep sharp). A later Boolean on that invalid solid
      // (Mirror body, a pattern) ran for minutes. Such a result is refused here, so the feature fails on OpenCascade,
      // Anvil's shell drives, and the features after it build on valid solids.
      var badShell = 'OpenCascade could not shell this body: its offset walls cross each other.';
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
        var inner = N(mo.Shape());
        if (!valid(inner)) throw new Error(badShell);
        res = cut(body, inner);
      }
      // valid is not enough: on a cylinder with a slot through its side the offset also came out VALID but 2.9 times
      // too heavy (18946 for 6524 mm³: the cavity lost where the slot's offset walls cross the bore). A wall T thick
      // holds about T × the area of the faces kept (less on convex curves, more round a bore: T·A·(1 + T/2r)), plus
      // about T² per length of concave edge at sharp inside corners; 1.2·T·A + T²·(every edge's length) is a generous
      // ceiling (a slotted Ø20 cylinder: 8428 for Anvil's 4159 mm³ was let through by 1.5·T·A)
      var vr = volumeOf(res), gl = N(new oc.GProp_GProps_1()), aKept = 0;
      function areaOf(s) { var g = N(new oc.GProp_GProps_1()); oc.BRepGProp.SurfaceProperties_1(s, g, false, false); return g.Mass(); }
      aKept = areaOf(body) - rm.reduce(function (s, fc) { return s + areaOf(fc); }, 0);
      oc.BRepGProp.LinearProperties(body, gl, false, false);
      if (!valid(res) || !(vr > 0) || !(vr < volumeOf(body)) || vr > 1.2 * T * aKept + T * T * gl.Mass()) throw new Error(badShell);
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
    // ---- sheet metal. Edge flanges, hems and jogs use Kernel.flangeLayout (the same edges, mitres, reliefs and
    // trim-back as Anvil's), computed from the body's tessellation; the sections are built exactly (bend arcs).
    // The bend allowance / deduction never changes the solid (only T, R, angle and length do): flat lengths come
    // from Kernel.flatPattern (Kernel.bendCalc), the same for both kernels; a jog passes its custom bend allowance on.
    // an OpenCascade shape as a CSG solid (its triangles), for Kernel functions that read Anvil meshes; lin / ang: the
    // mesh's linear and angular deflection (default 0.05 mm in the model's units, 0.35).
    // r12/inchflange12: the default chord is 0.05 mm in the model's units (it was 0.05 units: 1.27 mm on an inch part),
    // and the triangles of one planar B-rep face all get the same plane (the face's own, area-weighted), not each its
    // own plane from three rounded nodes: Anvil's mesh groups faces by the plane rounded to 0.01 units, and
    // per-triangle noise on an offset like 0.075 in split the top face of a 14 ga sheet in two (see Kernel.flangeLayout)
    function shapeToCSG(sh, lin, ang, withSurf) {   // lane DF: withSurf tags curved faces' polygons with { s: record }
      N(new oc.BRepMesh_IncrementalMesh_2(sh, lin || (m.units === 'in' ? 0.05 / 25.4 : 0.05), false, ang || 0.35, false));
      var polys = [];
      facesOf(sh).forEach(function (f) {
        var loc = N(new oc.TopLoc_Location_1()), h = N(oc.BRep_Tool.Triangulation(f, loc, oc.Poly_MeshPurpose ? oc.Poly_MeshPurpose.Poly_MeshPurpose_NONE : 0));
        if (h.IsNull()) return;
        var tri = h.get(), tr = N(loc.Transformation()), rev = f.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED, nodes = [];
        for (var i = 1; i <= tri.NbNodes(); i++) { var p = N(N(tri.Node(i)).Transformed(tr)); nodes[i] = new CSGlib.Vector(p.X(), p.Y(), p.Z()); }
        var fps = [];
        for (var j = 1; j <= tri.NbTriangles(); j++) {
          var T = N(tri.Triangle(j)), a = T.Value(1), b = T.Value(2), c = T.Value(3);
          if (rev) { var x = b; b = c; c = x; }
          var pg = CSGlib.Polygon.tryCreate([new CSGlib.Vertex(nodes[a]), new CSGlib.Vertex(nodes[b]), new CSGlib.Vertex(nodes[c])], null);
          if (pg) fps.push(pg);
        }
        var ad = N(new oc.BRepAdaptor_Surface_2(f, true)), st = ad.GetType();
        if (withSurf) { var stv = st && st.value != null ? st.value : st, srec = stv ? surfRecord(ad, SURF[stv]) : null; if (srec) fps.forEach(function (q) { q.surf = { s: srec }; }); }
        if (fps.length > 1 && (st && st.value != null ? st.value : st) === 0) {
          var nx = 0, ny = 0, nz = 0, ws = 0, as = 0;
          fps.forEach(function (q) {
            var v = q.vertices, ar = v[1].pos.minus(v[0].pos).cross(v[2].pos.minus(v[0].pos)).length();
            nx += q.plane.normal.x * ar; ny += q.plane.normal.y * ar; nz += q.plane.normal.z * ar; ws += q.plane.w * ar; as += ar;
          });
          var nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
          if (nl > 0 && as > 0) fps.forEach(function (q) { q.plane = new CSGlib.Plane(new CSGlib.Vector(nx / nl, ny / nl, nz / nl), ws / as); });
        }
        Array.prototype.push.apply(polys, fps);
      });
      return CSGlib.fromPolygons(polys);
    }
    var CSGlib = typeof CSG !== 'undefined' ? CSG : (typeof self !== 'undefined' ? self.CSG : null);
    // a prism of a 2D polyline loop in plane from a to b along plane.n
    function prismOf(loop, plane, a, b) {
      var face = polyFace3(loop.map(function (p) { return K.to3D(plane, p[0], p[1]); }));
      return N(N(new oc.BRepPrimAPI_MakePrism_1(moveTo(face, a, plane), Vec(V.scale(plane.n, b - a)), false, true)).Shape());
    }
    function polyFace3(pts) {
      var mw = N(new oc.BRepBuilderAPI_MakeWire_1());
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], q = pts[(i + 1) % pts.length];
        if (V.len(V.sub(p, q)) > 1e-9) mw.Add_1(N(N(new oc.BRepBuilderAPI_MakeEdge_3(P(p), P(q))).Edge()));
      }
      return N(N(new oc.BRepBuilderAPI_MakeFace_15(N(mw.Wire()), true)).Face());
    }
    // the flange section (Kernel.flangeProfile) with exact arcs: in the (o, u) plane the inner bend is a circle of
    // radius R about (0, R), the outer one R + T, the wall runs on at angle A for L; the strip o in [-ov, 0] overlaps the sheet
    function flangeSection(s, plane) {
      var A = s.A, R = s.R, T = s.T, L = s.L, ov = s.ov, to3 = function (p) { return K.to3D(plane, p[0], p[1]); };
      function arcPt(r, th) { return [r * Math.sin(th), R - r * Math.cos(th)]; }
      var tx = Math.cos(A), ty = Math.sin(A), iE = arcPt(R, A), oE = arcPt(R + T, A);
      var iEnd = [iE[0] + tx * L, iE[1] + ty * L], oEnd = [oE[0] + tx * L, oE[1] + ty * L];
      var mw = N(new oc.BRepBuilderAPI_MakeWire_1());
      function line(p, q) { if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9) mw.Add_1(N(N(new oc.BRepBuilderAPI_MakeEdge_3(P(to3(p)), P(to3(q)))).Edge())); }
      function arc(r, th0, th1) {
        if (r < 1e-9) return;
        var mk = N(new oc.GC_MakeArcOfCircle_4(P(to3(arcPt(r, th0))), P(to3(arcPt(r, (th0 + th1) / 2))), P(to3(arcPt(r, th1)))));
        mw.Add_1(N(N(new oc.BRepBuilderAPI_MakeEdge_24(N(new oc.Handle_Geom_Curve_2(N(mk.Value()).get())))).Edge()));
      }
      line([-ov, 0], [0, 0]); arc(R, 0, A); line(iE, iEnd); line(iEnd, oEnd); line(oEnd, oE); arc(R + T, A, 0); line([0, -T], [-ov, -T]); line([-ov, -T], [-ov, 0]);
      if (!mw.IsDone()) throw new Error('OpenCascade could not make the flange section.');
      return N(N(new oc.BRepBuilderAPI_MakeFace_15(N(mw.Wire()), true)).Face());
    }
    // keep the part of sh where n·p >= w
    function clipKeep(sh, n, w) {
      var o = V.scale(n, w), x = V.norm(V.cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), y = V.cross(n, x), S = 1e4;
      var face = polyFace3([V.add(o, V.add(V.scale(x, -S), V.scale(y, -S))), V.add(o, V.add(V.scale(x, S), V.scale(y, -S))), V.add(o, V.add(V.scale(x, S), V.scale(y, S))), V.add(o, V.add(V.scale(x, -S), V.scale(y, S)))]);
      var hs = N(N(new oc.BRepPrimAPI_MakeHalfSpace_1(face, P(V.add(o, n)))).Solid());
      var op = N(new oc.BRepAlgoAPI_Common_3(sh, hs, R()));
      if (!op.IsDone()) throw new Error('OpenCascade could not mitre the flange.');
      return N(op.Shape());
    }
    function shapeList(a) { var l = N(new oc.TopTools_ListOfShape_1()); a.forEach(function (s) { l.Append_1(s); }); return l; }
    // r11/occtswap11: one Boolean of sh with several tools at once (a General Fuse: the tools may touch or overlap
    // each other), instead of one per tool (the Tray's Miter Flange: its 2 relief cuts and 5 walls, 515 → 375 ms)
    function boolMany(kind, sh, list, msg) {
      if (list.length === 1) return kind === 'cut' ? cut(sh, list[0]) : fuse(sh, list[0]);
      var op = N(kind === 'cut' ? new oc.BRepAlgoAPI_Cut_1() : new oc.BRepAlgoAPI_Fuse_1());
      op.SetArguments(shapeList([sh])); op.SetTools(shapeList(list)); op.Build(R());
      if (!op.IsDone()) throw new Error(msg);
      return N(op.Shape());
    }
    // a flange layout onto body k: its cuts (trim-back, reliefs) first, then each part's exact sweep, mitred
    function applyLayout(k, lay, withCuts) {
      var body = bodies[k], src = body, srcCSG = null;
      if (withCuts && lay.cuts.length) body = boolMany('cut', body, lay.cuts.map(function (c) { return prismOf(c.loop, c.plane, c.a, c.b); }), 'OpenCascade could not cut the body.');
      var walls = lay.parts.map(function (p) {
        // a part whose band holds a hole / slot of the sheet (p.voids): no overlap strip, and the cut wrapped round the bend
        var cutters = p.voids ? bendCutters(src, srcCSG || (srcCSG = shapeToCSG(src)), p.plane, p.band, lay.section, p.BA, false) : [];
        // a Miter Flange's square end: the bend's taper, and the overlap strip stops at the base's corner
        (p.tapers || []).forEach(function (l) { cutters.push(cylinderCutter(l, p.plane, lay.section, p.BA)); });
        if (!p.voids) (p.tails || []).forEach(function (r) { cutters.push(prismOf(K.miterTail(lay.section), p.plane, r.t0, r.t1)); });
        // a butt corner (Kernel.flangeLayout's p.taper): the sweep runs on past both ends, the bend's ends are tapered from
        // the base corner to the wall's end and only then are the walls cut square, so the taper does not have to find
        // its corner on the tangent line where bend meets wall at the very end of the sweep.
        var over = p.taper ? 0.02 * p.taper.BA : 0;
        var tool = N(N(new oc.BRepPrimAPI_MakePrism_1(moveTo(flangeSection(p.voids || p.taper ? noOverlap(lay.section, false) : lay.section, p.plane), p.t0 - over, p.plane), Vec(V.scale(p.plane.n, p.t1 - p.t0 + 2 * over)), false, true)).Shape());
        if (p.taper) {
          tool = boolMany('cut', tool, p.taper.loops.map(function (l) { return cylinderCutter(taperLoop(l, p.taper.BA), p.plane, lay.section, p.taper.BA); }), 'OpenCascade could not taper the bend.');
          var w0 = V.dot(p.plane.n, p.plane.origin);
          tool = clipKeep(clipKeep(tool, p.plane.n, w0 + p.t0), V.scale(p.plane.n, -1), -(w0 + p.t1));
        }
        if (cutters.length) tool = boolMany('cut', tool, cutters, 'OpenCascade could not cut the hole across the bend.');
        p.clips.forEach(function (c) { tool = clipKeep(tool, c.n, c.w); });
        return tool;
      });
      if (walls.length) body = boolMany('fuse', body, walls, 'OpenCascade could not join the bodies.');
      bodies[k] = body;
    }
    // a taper triangle [(0, base corner), (BA, wall end), (0, wall end)], in either order, as a cutter's outline: the
    // slanted side is carried on past both ends of the bend and the rest runs well outside the sweep, so the cut ends on
    // no face of it. Past BA the slanted side has left the wall's t range: the wall is not touched.
    function taperLoop(l, BA) {
      var q = l.filter(function (p) { return p[0] > 0; })[0], b = l.filter(function (p) { return p[0] === 0 && p[1] !== q[1]; })[0];
      var e = 0.05 * BA, k = (q[1] - b[1]) / BA, at = function (s) { return b[1] + k * s; }, out = q[1] + (k > 0 ? 1 : -1) * e;
      return [[-e, at(-e)], [BA + e, at(BA + e)], [BA + e, out + k * e], [-e, out + k * e]];
    }
    // --- cutbend: a hole, slot or notch cut in the flat before an edge flange or a sketched bend that crosses the bend
    // zone stays cut (Kernel.bendVoids / Kernel.wrapCut, as Anvil's kernel). The layout found the voids on the coarse
    // mesh; they are read again from the exact solid (the band's slab less the body, meshed finely) and each becomes a
    // cutter taken out of the exact sweep. That sweep then has no overlap strip into the sheet (noOverlap): it meets the
    // sheet face to face, so the sheet's own exact hole is never refilled up to a facetted one.
    // -> [solid] (one per void that reaches the sweep: past the bend's start, and for a sketched bend, whose sweep ends
    // with the bend, before its end), [] when there is none.
    function bendCutters(src, srcCSG, plane, band, sec, BA, sketched) {
      var T = sec.T, slab = K.bandSlabSpec(plane, band, T);
      var M = cut(prismOf(slab.loop, slab.plane, slab.a, slab.b), src);
      if (!(volumeOf(M) > 0)) return [];
      var loops = K.bendVoids(srcCSG, plane, band, T, { ends: sketched, voids: shapeToCSG(M, 4e-3 * T, 0.1) }).filter(function (l) {
        return l.some(function (q) { return q[0] > 1e-9; }) && (!sketched || l.some(function (q) { return q[0] < BA - 1e-9; }));
      });
      // a void that stays within the bend (a flange's wall starts at BA; a sketched bend's sweep ends there): exact
      return loops.map(function (l) { return sketched || l.every(function (q) { return q[0] < BA - 1e-9; }) ? cylinderCutter(l, plane, sec, BA) : wrappedCutter(l, plane, sec, BA); });
    }
    // the void outline drawn on the cylinder of the bend's inner face (ε inside it: angle A·s/BA, axial t, straight in
    // those coordinates) and thickened radially through the thickness (ε past the outer face): its walls are the exact
    // radial walls of the wrapped cut. The cylinder carries on past the bend's ends, where the sweep has no metal.
    // (lane DJ: zr = [z0, z1], the depth range from the inner face instead: material added on the flat, a blind cut)
    function cylinderCutter(l, plane, sec, BA, zr) {
      var R0 = sec.R, T = sec.T, eps = Math.min(0.01 * T, 0.5 * R0), z0 = zr ? zr[0] : -eps, z1 = zr ? zr[1] : T + eps;
      if (!(R0 + z0 > 1e-9)) throw unsupportedErr('material wrapped round a bend down to its axis');
      // axis through the bend centre along the edge; angle 0 at the sheet (−y from the centre), growing toward +x
      var ax = N(new oc.gp_Ax3_3(P(V.add(plane.origin, V.scale(plane.y, R0))), Dir(plane.n), Dir(V.scale(plane.y, -1))));
      var surf = N(new oc.Handle_Geom_Surface_2(N(new oc.Geom_CylindricalSurface_1(ax, R0 + z0))));
      var ku = sec.A / BA, uv = l.map(function (q) { return [ku * q[0], q[1]]; });
      var wire = outlineWire(l, surf, ku);
      // the cutter's volume: the outline's area in (angle, t) times the annulus between the two radii per unit angle
      var area = 0;
      uv.forEach(function (a, j) { var b = uv[(j + 1) % uv.length]; area += a[0] * b[1] - b[0] * a[1]; });
      var want = Math.abs(area / 2) * (Math.pow(R0 + z1, 2) - Math.pow(R0 + z0, 2)) / 2;
      // on a closed surface a wire bounds two regions: when the face came out as the rest of the cylinder, reverse it
      for (var k = 0; k < 2; k++) {
        var w = k ? N(oc.TopoDS.Wire_1(N(wire.Reversed()))) : wire;
        var face = N(N(new oc.BRepBuilderAPI_MakeFace_21(surf, w, true)).Face());
        var th = N(new oc.BRepOffsetAPI_MakeThickSolid());
        th.MakeThickSolidBySimple(face, z1 - z0);
        if (!th.IsDone()) continue;
        var sh = N(th.Shape()), v = volumeOf(sh);   // (the thickened face comes out inside out: negative)
        if (Math.abs(v) < 1.5 * want) return v < 0 ? N(sh.Reversed()) : sh;
      }
      throw new Error('OpenCascade could not make the cut across the bend.');
    }
    // lane FZ: a band loop (Kernel.bendVoids: points on the void's true edge) as exact edges on surf, whose (u, v) are
    // (ku·q[0], q[1]): a run on one circle is that circle (an ellipse when ku ≠ 1), another smooth run the C1 cubic
    // through its points, two points a straight edge. Shared by cylinderCutter (the bend) and exactPrism (the flat).
    function outlineWire(l, surf, ku) {
      var mw = N(new oc.BRepBuilderAPI_MakeWire_1());
      function pnt2(q) { return N(new oc.gp_Pnt2d_3(ku * q[0], q[1])); }
      // the outline's points lie on the cut's true edge (a circle's, a slot's): between corners (a turn of more than
      // 30°) each smooth run is drawn as the C1 cubic through them (chord-length Catmull-Rom), so the cut meets the
      // sheet's own exact hole at the bend's start without a step; a run of two points is a straight edge
      var n = l.length, corners = [];
      l.forEach(function (p, i) {
        var a = l[(i + n - 1) % n], b = l[(i + 1) % n], d1 = [p[0] - a[0], p[1] - a[1]], d2 = [b[0] - p[0], b[1] - p[1]];
        if (Math.abs(Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1])) > 0.5) corners.push(i);
      });
      var runs = [];
      if (!corners.length) runs.push({ pts: l.concat([l[0]]), closed: true });
      else corners.forEach(function (c, j) {
        var e = corners[(j + 1) % corners.length], pts = [];
        for (var i = c; ; i = (i + 1) % n) { pts.push(l[i]); if (i === e && pts.length > 1) break; }
        runs.push({ pts: pts, closed: false });
      });
      runs.forEach(function (run) {
        var P0 = run.pts, m = P0.length - 1, crv, cf = m >= 2 ? fitCircle(P0) : null;
        if (m < 2) crv = N(N(new oc.GCE2d_MakeSegment_1(pnt2(P0[0]), pnt2(P0[1]))).Value()).get();
        else if (cf) {
          // a run on one circle (a round hole, a slot's end): the circle wrapped round the bend is an ellipse in
          // (angle, t), exactly; major axis along the angle when ku > 1
          var cu = ku * cf.c[0], cv = cf.c[1], au = ku * cf.r, av = cf.r, alongU = au >= av;
          var el = N(new oc.gp_Elips2d_2(N(new oc.gp_Ax2d_2(N(new oc.gp_Pnt2d_3(cu, cv)), N(new oc.gp_Dir2d_4(alongU ? 1 : 0, alongU ? 0 : 1)))), Math.max(au, av), Math.min(au, av), true));
          var phi = function (q) { var x = ku * q[0] - cu, y = q[1] - cv; return alongU ? Math.atan2(y / av, x / au) : Math.atan2(-x / au, y / av); };
          if (run.closed) crv = new oc.Geom2d_Ellipse_1(el);   // the handle below owns it
          else crv = N(N(new oc.GCE2d_MakeArcOfEllipse_1(el, phi(P0[0]), phi(P0[m]), cf.ccw)).Value()).get();
        } else {
          var d = [], tg = [];
          for (var i = 0; i < m; i++) d.push(Math.max(1e-12, Math.hypot(P0[i + 1][0] - P0[i][0], P0[i + 1][1] - P0[i][1])));
          for (i = 0; i <= m; i++) {
            var pi = i > 0 ? i - 1 : run.closed ? m - 1 : 0, ni = i < m ? i + 1 : run.closed ? 1 : m;
            var dl = i > 0 ? d[i - 1] : run.closed ? d[m - 1] : 0, dr = i < m ? d[i] : run.closed ? d[0] : 0;
            tg.push([(P0[ni][0] - P0[pi][0]) / (dl + dr), (P0[ni][1] - P0[pi][1]) / (dl + dr)]);   // d(point)/d(arc length)
          }
          var poles = N(new oc.TColgp_Array1OfPnt2d_2(1, 3 * m + 1)), kn = N(new oc.TColStd_Array1OfReal_2(1, m + 1)), mu = N(new oc.TColStd_Array1OfInteger_2(1, m + 1));
          poles.SetValue(1, pnt2(P0[0]));
          for (i = 0; i < m; i++) {
            poles.SetValue(3 * i + 2, pnt2([P0[i][0] + tg[i][0] * d[i] / 3, P0[i][1] + tg[i][1] * d[i] / 3]));
            poles.SetValue(3 * i + 3, pnt2([P0[i + 1][0] - tg[i + 1][0] * d[i] / 3, P0[i + 1][1] - tg[i + 1][1] * d[i] / 3]));
            poles.SetValue(3 * i + 4, pnt2(P0[i + 1]));
          }
          for (i = 0; i <= m; i++) { kn.SetValue(i + 1, i); mu.SetValue(i + 1, i === 0 || i === m ? 4 : 3); }
          crv = new oc.Geom2d_BSplineCurve_1(poles, kn, mu, 3, false);   // the handle below owns the curve
        }
        mw.Add_1(N(N(new oc.BRepBuilderAPI_MakeEdge_30(N(new oc.Handle_Geom2d_Curve_2(crv)), surf)).Edge()));
      });
      if (!mw.IsDone()) throw new Error('OpenCascade could not outline the cut across the bend.');
      var wire = N(mw.Wire());
      // (lane flanges: 1e-9, not BuildCurves3d_2's 1e-5: a cut's helical edge was 1e-6 off, enough to tilt a planar face that
      // ends on it past the drawing's depth tolerance, so the face hid its own edge)
      oc.BRepLib.BuildCurves3d_1(wire, 1e-9, oc.GeomAbs_Shape.GeomAbs_C1, 14, 0);
      return wire;
    }
    // lane FZ: prismOf with the loop's true edges (outlineWire on the plane: a round hole's chords become its circle),
    // so a through void taken out of a cut in the flat leaves no crescent between chord and arc; prismOf when the loop
    // has no curved run (or the exact face fails)
    function exactPrism(loop, plane, a, b) {
      var n = loop.length, curved = false;
      for (var i = 0; i < n && !curved; i++) {
        var p = loop[(i + n - 1) % n], q = loop[i], r = loop[(i + 1) % n], d1 = [q[0] - p[0], q[1] - p[1]], d2 = [r[0] - q[0], r[1] - q[1]];
        var t = Math.abs(Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]));
        if (t > 1e-6 && t < 0.5) curved = true;
      }
      if (!curved) return prismOf(loop, plane, a, b);
      try {
        var surf = N(new oc.Handle_Geom_Surface_2(N(new oc.Geom_Plane_1(N(new oc.gp_Ax3_3(P(plane.origin), Dir(plane.n), Dir(plane.x)))))));
        var face = N(N(new oc.BRepBuilderAPI_MakeFace_21(surf, outlineWire(loop, surf, 1), true)).Face());
        var sh = N(N(new oc.BRepPrimAPI_MakePrism_1(moveTo(face, a, plane), Vec(V.scale(plane.n, b - a)), false, true)).Shape());
        var area = 0;
        loop.forEach(function (u, j) { var w = loop[(j + 1) % n]; area += u[0] * w[1] - w[0] * u[1]; });
        var want = Math.abs(area / 2 * (b - a)), v = volumeOf(sh);
        if (Math.abs(Math.abs(v) - want) < 0.05 * want) return v < 0 ? N(sh.Reversed()) : sh;
      } catch (e) { /* the polygon prism below */ }
      return prismOf(loop, plane, a, b);
    }
    // fitCircle(pts) -> { c, r, ccw } when every point lies on the circle through the first, middle and last (to 1e-7
    // plus 1e-6 of the radius: points of an exact circle's mesh), else null; ccw: the run turns counterclockwise
    function fitCircle(pts) {
      var a = pts[0], b = pts[pts.length >> 1], c = pts[pts.length - 1];
      if (V.len(V.sub([c[0], c[1], 0], [a[0], a[1], 0])) < 1e-9) c = pts[(pts.length * 3) >> 2];   // a closed run
      var d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
      if (Math.abs(d) < 1e-15) return null;
      var a2 = a[0] * a[0] + a[1] * a[1], b2 = b[0] * b[0] + b[1] * b[1], c2 = c[0] * c[0] + c[1] * c[1];
      var cx = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d, cy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
      var r = Math.hypot(a[0] - cx, a[1] - cy), tol = 1e-7 + 1e-6 * r;
      if (!pts.every(function (p) { return Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - r) < tol; })) return null;
      var turn = 0;
      for (var i = 0; i + 1 < pts.length; i++) turn += (pts[i][0] - cx) * (pts[i + 1][1] - cy) - (pts[i][1] - cy) * (pts[i + 1][0] - cx);
      return { c: [cx, cy], r: r, ccw: turn > 0 };
    }
    // a void that runs on into the wall: Kernel.wrapCut's polyhedron (bend zones of at most 5°, fine enough that a cap's
    // chord stays outside the outer face), sewn
    function wrappedCutter(l, plane, sec, BA) {
      var T = sec.T, eps = Math.min(0.01 * T, 0.5 * sec.R), dth = Math.min(Math.PI / 36, 2 * Math.acos(1 - 0.5 * eps / (sec.R + T + eps)));
      var faces = K.wrapCut([l], sec, BA, plane, { segs: Math.max(4, Math.ceil(sec.A / dth)), faces: true });
      var sew = N(new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false));
      faces.forEach(function (t) {
        // drop points that repeat (a zone line through a corner) and faces with no area left
        var q = t.filter(function (p, i) { return V.len(V.sub(p, t[(i + 1) % t.length])) > 1e-7; });
        if (q.length < 3) return;
        var nrm = [0, 0, 0];
        for (var i = 1; i + 1 < q.length; i++) nrm = V.add(nrm, V.cross(V.sub(q[i], q[0]), V.sub(q[i + 1], q[0])));
        if (V.len(nrm) > 1e-14) sew.Add(polyFace3(q));
      });
      sew.Perform(R());
      var shells = explore(N(sew.SewedShape()), ENUM.TopAbs_SHELL);
      if (shells.length !== 1) throw new Error('OpenCascade could not close the cut across the bend.');
      var so = N(N(new oc.BRepBuilderAPI_MakeSolid_3(N(oc.TopoDS.Shell_1(shells[0])))).Solid());
      return volumeOf(so) < 0 ? N(so.Reversed()) : so;
    }
    // the bend section without the strip it lays into the sheet before the bend (and, for a sketched bend, the one past
    // it into the moving piece: wall L = 0)
    function noOverlap(sec, sketched) { return { A: sec.A, R: sec.R, T: sec.T, L: sketched ? 0 : sec.L, ov: 0 }; }
    // --- end cutbend ---
    function sheetBody(f) {
      if (!CSGlib) throw unsupportedErr('sheet metal (csg.js not loaded)');
      if (rm.sheetError) throw new Error(rm.sheetError);
      var k = pickBody(f.edges && f.edges[0] && f.edges[0].at);
      if (k < 0) throw new Error('Create a Base Flange before adding ' + (f.type === 'jog' ? 'a jog.' : 'edge flanges.'));
      bodies[k] = unify(bodies[k]);
      return k;
    }
    function flangeOp(f) {
      if (f.miterFlange && f.sketch != null) { miterFlangeOp(f); return; }   // lane DL
      var k = sheetBody(f);
      applyLayout(k, K.flangeLayout(f, m, { body: shapeToCSG(bodies[k]) }), true);
    }
    // lane DL: Miter Flange from a profile sketch (as Kernel's buildMiterFlange): Kernel.miterFlangeStages plans the
    // stages; each is an edge-flange layout built with exact bend arcs on the part as the stages before it left it
    function miterFlangeOp(f) {
      var k = sheetBody(f), csg = shapeToCSG(bodies[k]);
      K.miterFlangeStages(f, m, { body: csg, sketches: sketches, planes: planes }, function (fk) {
        var lay = K.flangeLayout(fk, m, { body: csg });
        applyLayout(k, lay, true);
        csg = shapeToCSG(bodies[k] = unify(bodies[k]));
        return { info: lay.info, body: csg };
      });
    }
    // Jog (as Kernel.buildJog): a flange whose wall length makes the offset `height`, then on its wall's end a flange
    // folding back parallel to the base for `length`
    function jogOp(f) {
      if (f.sketch != null) { sketchJogOp(f); return; }   // lane DC2: Jog from a sketch line
      var k = sheetBody(f), sheet = K.sheetParams(m), T = +sheet.thickness, Rr = f.radius != null ? +f.radius : +sheet.bendRadius;
      var A = (f.angle == null ? 90 : +f.angle) * Math.PI / 180, H = +f.height, L2 = +f.length;
      if (!isFinite(H) || !isFinite(L2) || !isFinite(A)) throw new Error('Jog height, length and angle must be a number each.');
      if (!(H > 0)) throw new Error('Jog height must be greater than zero.');
      if (!(L2 > 0)) throw new Error('Jog length must be greater than zero.');
      if (!(A > 0.05 && A < Math.PI - 0.05)) throw new Error('Jog angle must be between 3° and 177°.');
      var wall = (H - 2 * Rr * (1 - Math.cos(A)) + T * Math.cos(A)) / Math.sin(A);
      if (!(wall > 0.01)) throw new Error('Jog height is too small for this bend radius and angle.');
      var f1 = { id: f.id, edges: f.edges, angle: A * 180 / Math.PI, length: wall, reverse: !!f.reverse, radius: Rr, position: f.position, bendAllowance: f.bendAllowance };
      var lay1 = K.flangeLayout(f1, m, { body: shapeToCSG(bodies[k]) });
      applyLayout(k, lay1, true);
      var sA = Math.sin(A), cA = Math.cos(A), csg1 = shapeToCSG(bodies[k] = unify(bodies[k]));
      lay1.info.forEach(function (fi) {
        var innerEnd = V.add(V.add(fi.origin, V.scale(fi.o, Rr * sA + cA * wall)), V.scale(fi.u, Rr - Rr * cA + sA * wall));
        var outerDir = V.add(V.scale(fi.o, sA), V.scale(fi.u, -cA)), tw = V.add(V.scale(fi.o, cA), V.scale(fi.u, sA));
        var toward = V.norm(V.sub(fi.o, V.scale(tw, V.dot(fi.o, tw))));
        var f2 = { id: f.id, edges: [{ at: V.add(innerEnd, V.scale(outerDir, T / 2)) }], angle: A * 180 / Math.PI, length: L2, toward: toward, radius: Rr, position: 'bendOutside', bendAllowance: f.bendAllowance };
        applyLayout(k, K.flangeLayout(f2, m, { body: csg1 }), false);   // Anvil's jog keeps only the first bend's cuts
      });
    }
    // Sketched Bend (as Kernel.buildSketchedBend, from Kernel.sketchedBendLayout): the body nearest the first bend line
    // is clipped into the fixed piece and each line's moving piece; each piece is moved by its rigid motion and each
    // bend is the exact section (bend arcs, overlap strips into both sides) swept along its line, moved with the piece
    // it rides on; all are joined into the bent part
    function trsfOf(M) {
      var tr = N(new oc.gp_Trsf_1()), Rm = M.R;
      tr.SetValues(Rm[0][0], Rm[0][1], Rm[0][2], M.t[0], Rm[1][0], Rm[1][1], Rm[1][2], M.t[1], Rm[2][0], Rm[2][1], Rm[2][2], M.t[2]);
      return tr;
    }
    function isIdentity(M) { for (var i = 0; i < 3; i++) { if (Math.abs(M.t[i]) > 1e-12) return false; for (var j = 0; j < 3; j++) if (Math.abs(M.R[i][j] - (i === j ? 1 : 0)) > 1e-12) return false; } return true; }
    function sketchedBendOp(f, extraSketches) {
      if (!CSGlib) throw unsupportedErr('sheet metal (csg.js not loaded)');
      if (rm.sheetError) throw new Error(rm.sheetError);
      var skAll = extraSketches ? Object.assign({}, sketches, extraSketches) : sketches;   // lane DC2: a sketch jog's second line
      var ctxS = { sketches: skAll, planes: planes };
      var at = K._ && K._.sketchedBendPoint ? K._.sketchedBendPoint(f, m, ctxS) : null;
      var k = pickBody(at);
      if (k < 0) throw new Error('Create a Base Flange before adding a sketched bend.');
      var src = bodies[k] = unify(bodies[k]);
      var srcCSG = shapeToCSG(src), lay = K.sketchedBendLayout(f, m, { body: srcCSG, sketches: skAll, planes: planes });
      function clipAll(sh, hs) { hs.forEach(function (h) { sh = clipKeep(sh, h.n, h.w); }); return sh; }
      var parts = [], fixed = clipAll(src, lay.fixed);
      if (volumeOf(fixed) > 1e-12) parts.push(fixed);
      lay.pieces.forEach(function (pc) {
        var b = clipAll(src, pc.keep);
        if (volumeOf(b) > 1e-12) parts.push(transformed(b, trsfOf(pc.motion)));
      });
      lay.bends.forEach(function (bd) {
        // holes / slots / notches across the strip (bd.voids): the bend meets both pieces face to face, the cut wrapped round it
        var cutters = bd.voids ? bendCutters(src, srcCSG, bd.plane, bd.band, lay.section, lay.BA, true) : [];
        var tool = N(N(new oc.BRepPrimAPI_MakePrism_1(moveTo(flangeSection(bd.voids ? noOverlap(bd.section, true) : bd.section, bd.plane), bd.t0, bd.plane), Vec(V.scale(bd.plane.n, bd.t1 - bd.t0)), false, true)).Shape());
        if (cutters.length) tool = boolMany('cut', tool, cutters, 'OpenCascade could not cut the hole across the bend.');
        parts.push(isIdentity(bd.motion) ? tool : transformed(tool, trsfOf(bd.motion)));
      });
      if (!parts.length) throw new Error('Sketched Bend: nothing of the sheet is left.');
      var body = parts[0];
      if (parts.length > 1) body = boolMany('fuse', body, parts.slice(1), 'OpenCascade could not join the bent pieces.');
      bodies[k] = unify(body);
      return lay;
    }
    // lane DC2: Jog from a sketch line (as Kernel.buildSketchJog): both bends are one Sketched Bend layout on the flat
    // sheet (Kernel.jogBendFeature works out the offset reference and the riser g), built with exact bend arcs.
    function sketchJogOp(f) {
      // lane DK: Fix projected length stretches the sheet at the line first (Kernel.buildSketchJog): Anvil's solid stays
      if (f.fixLength) throw unsupportedErr('Jog with Fix projected length');
      sketchedBendOp(K.jogBendFeature(f, m, { sketches: sketches, planes: planes }));
    }
    // Break Corner (lane CP; as Kernel.buildBreakCorner, from Kernel.breakCornerLayout found on the bodies'
    // tessellation): one prism per corner, its section's fillet an exact arc; the rebuild cuts the tool (a registered cut)
    function breakCornerTool(f) {
      if (!CSGlib) throw unsupportedErr('sheet metal (csg.js not loaded)');
      if (rm.sheetError) throw new Error(rm.sheetError);
      if (!bodies.length) throw new Error('Nothing to break yet.');
      var polys = [];
      bodies.forEach(function (b) { Array.prototype.push.apply(polys, shapeToCSG(b).polygons); });
      var lay = K.breakCornerLayout(f, m, { body: CSGlib.fromPolygons(polys) }), acc = null;
      lay.tools.forEach(function (t) {
        var mf = N(new oc.BRepBuilderAPI_MakeFace_15(loopWire({ pts: t.pts, seg: t.seg }, { curves: t.curves }, t.plane), true));
        if (!mf.IsDone()) throw new Error('Break Corner: OpenCascade could not make the corner section.');
        var s = N(N(new oc.BRepPrimAPI_MakePrism_1(moveTo(N(mf.Face()), t.a, t.plane), Vec(V.scale(t.plane.n, t.b - t.a)), false, true)).Shape());
        acc = acc ? fuse(acc, s) : s;
      });
      return acc;
    }
    // Rip (lane DI; as Kernel.buildRip, from Kernel.ripLayout found on the bodies' tessellation): planar prisms along
    // the ripped corner edges; the rebuild cuts the tool (a registered cut)
    function ripTool(f) {
      if (!CSGlib) throw unsupportedErr('sheet metal (csg.js not loaded)');
      if (rm.sheetError) throw new Error(rm.sheetError);
      if (!bodies.length) throw new Error('Rip: there is nothing to rip yet.');
      var polys = [];
      bodies.forEach(function (b) { Array.prototype.push.apply(polys, shapeToCSG(b).polygons); });
      var lay = K.ripLayout(f, m, { body: CSGlib.fromPolygons(polys) }), acc = null;
      lay.tools.forEach(function (t) { var s = prismOf(t.pts, t.plane, t.a, t.b); acc = acc ? fuse(acc, s) : s; });
      return acc;
    }
    // Vent (lane DT; as Kernel.buildVent, from Kernel.ventLayout found on the bodies' tessellation): the boundary prism
    // less the ribs / spars / fill-in prisms (taller), every circle an exact circle; the rebuild cuts the tool
    function ventTool(f) {
      if (!CSGlib) throw unsupportedErr('sheet metal (csg.js not loaded)');
      if (rm.sheetError) throw new Error(rm.sheetError);
      if (!bodies.length) throw new Error('Vent: there is no sheet to cut yet.');
      var polys = [];
      bodies.forEach(function (b) { Array.prototype.push.apply(polys, shapeToCSG(b).polygons); });
      var lay = K.ventLayout(f, m, { body: CSGlib.fromPolygons(polys), sketches: sketches, planes: planes }), e2 = 0.5 * (lay.b - lay.a);
      function solid(l, a, b) {
        var mf = N(new oc.BRepBuilderAPI_MakeFace_15(loopWire({ pts: l.pts, seg: l.seg }, { curves: l.curves }, lay.plane), true));
        if (!mf.IsDone()) throw new Error('Vent: OpenCascade could not make a vent contour.');
        return N(N(new oc.BRepPrimAPI_MakePrism_1(moveTo(N(mf.Face()), a, lay.plane), Vec(V.scale(lay.plane.n, b - a)), false, true)).Shape());
      }
      var tool = null;
      lay.boundary.forEach(function (l) { var s = solid(l, lay.a, lay.b); tool = tool ? fuse(tool, s) : s; });
      lay.keep.forEach(function (k) {
        var s = solid(k.outer, lay.a - e2, lay.b + e2);
        k.holes.forEach(function (h) { s = cut(s, solid(h, lay.a - 2 * e2, lay.b + 2 * e2)); });
        tool = cut(tool, s);
      });
      return tool;
    }
    // Insert Bends / Convert to Sheet Metal (lane DQ; as Kernel's buildInsertBends, from Kernel.insertBendsLayout found
    // on the body's tessellation): the corner kites and corner-relief cubes are cut, then each bend is the exact annulus
    // R … R + T (its T/2 strips into both plates) swept along the corner. Convert first shells (the faces
    // Kernel.convertSMPlan removes) and rips (Kernel.ripLayout) the solid.
    function ibWedge(t) {
      var to3 = function (p) { return V.add(K.to3D(t.plane, p[0], p[1]), V.scale(t.plane.n, t.a)); };
      var A = t.A, R = t.R, RT = t.RT, ov = t.ov, cA = Math.cos(A), sA = Math.sin(A);
      var mw = N(new oc.BRepBuilderAPI_MakeWire_1());
      function line(p, q) { if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9) mw.Add_1(N(N(new oc.BRepBuilderAPI_MakeEdge_3(P(to3(p)), P(to3(q)))).Edge())); }
      function arc(r, th0, th1) {
        if (r < 1e-9) return;
        var at = function (th) { return [r * Math.cos(th), r * Math.sin(th)]; };
        var mk = N(new oc.GC_MakeArcOfCircle_4(P(to3(at(th0))), P(to3(at((th0 + th1) / 2))), P(to3(at(th1)))));
        mw.Add_1(N(N(new oc.BRepBuilderAPI_MakeEdge_24(N(new oc.Handle_Geom_Curve_2(N(mk.Value()).get())))).Edge()));
      }
      var i0 = [R, 0], o0 = [RT, 0], o1 = [RT * cA, RT * sA], i1 = [R * cA, R * sA], st = [-ov * sA, ov * cA];
      line([R, -ov], [RT, -ov]); line([RT, -ov], o0); arc(RT, 0, A); line(o1, [o1[0] + st[0], o1[1] + st[1]]);
      line([o1[0] + st[0], o1[1] + st[1]], [i1[0] + st[0], i1[1] + st[1]]); line([i1[0] + st[0], i1[1] + st[1]], i1); arc(R, A, 0); line(i0, [R, -ov]);
      if (!mw.IsDone()) throw new Error('Insert Bends: OpenCascade could not make the bend section.');
      var face = N(N(new oc.BRepBuilderAPI_MakeFace_15(N(mw.Wire()), true)).Face());
      return N(N(new oc.BRepPrimAPI_MakePrism_1(face, Vec(V.scale(t.plane.n, t.b - t.a)), false, true)).Shape());
    }
    function insertBendsOp(f) {
      if (!CSGlib) throw unsupportedErr('sheet metal (csg.js not loaded)');
      if (rm.sheetError) throw new Error(rm.sheetError);
      if (f.openBase) {   // lane open-base: Base Flange from an open profile: the flat plates fused with the exact bends
        var obl = K.openBaseLayout(f, m, { planes: planes, sketches: sketches });
        var obs = obl.plates.map(function (t) { return prismOf(t.pts, obl.plane, obl.a, obl.b); }).concat(obl.wedges.map(ibWedge));
        var obb = obs.length > 1 ? boolMany('fuse', obs[0], obs.slice(1), 'Base Flange: OpenCascade could not join the bends.') : obs[0];
        if (bodies.length) bodies[0] = boolMany('fuse', bodies[0], [obb], 'Base Flange: OpenCascade could not join the flange.'); else { bodies.push(obb); bodyFeatures.push(f.id); }
        return;
      }
      var k = pickBody(f.fixedFace);
      if (k < 0) throw new Error((f.type === 'convertSM' ? 'Convert to Sheet Metal' : 'Insert Bends') + ': there is no solid to bend yet.');
      var g = f, body = unify(bodies[k]);
      if (f.type === 'convertSM') {
        var plan = K.convertSMPlan(f, m, { body: shapeToCSG(body) }), gap = K.convertSMRipGap(f, m);
        if (!(gap > 0) || !isFinite(gap)) throw new Error('Convert to Sheet Metal: the rip gap must be a positive number.');
        shellOp({ thickness: plan.T, faces: plan.removed.map(function (p) { return { at: p }; }) });
        body = unify(bodies[k]);
        if (plan.rips.length) {
          var rl = K.ripLayout({ id: f.id, edges: plan.rips, gap: gap, direction: 'both' }, m, { body: shapeToCSG(body) });
          body = boolMany('cut', body, rl.tools.map(function (t) { return prismOf(t.pts, t.plane, t.a, t.b); }), 'Convert to Sheet Metal: OpenCascade could not rip the corners.');
          body = unify(body);
        }
        g = K.convertSMInsert(f, plan);
      }
      if (m.noBends) { bodies[k] = body; return; }   // No Bends
      var lay = K.insertBendsLayout(g, m, { body: shapeToCSG(body) });
      body = boolMany('cut', body, lay.fills.concat(lay.corners).map(function (t) { return prismOf(t.loop, t.plane, t.a, t.b); }), 'Insert Bends: OpenCascade could not cut the sharp corners.');
      bodies[k] = boolMany('fuse', body, lay.wedges.map(ibWedge), 'Insert Bends: OpenCascade could not add the bends.');
    }
    // Closed Corner (lane CS; as Kernel.buildClosedCorner, from Kernel.closedCornerLayout found on the body's
    // tessellation): the trim of the matching walls is cut, then the extensions (planar prisms) are fused on
    function closedCornerOp(f) {
      if (!CSGlib) throw unsupportedErr('sheet metal (csg.js not loaded)');
      if (rm.sheetError) throw new Error(rm.sheetError);
      var k = pickBody(f.faces && f.faces[0]);
      if (k < 0) throw new Error('Closed Corner: there are no flanges yet.');
      bodies[k] = unify(bodies[k]);
      var lay = K.closedCornerLayout(f, m, { body: shapeToCSG(bodies[k]) }), body = bodies[k];
      if (lay.cuts.length) body = boolMany('cut', body, lay.cuts.map(function (t) { return prismOf(t.loop, t.plane, t.a, t.b); }), 'Closed Corner: OpenCascade could not trim the matching wall.');
      // lane DV: open bend region, the matching wall's bend end tapered (SolidWorks): the exact wrapped cut, straight in
      // (angle, t) from the base corner at the bend's start to the wall's new end at its end
      if ((lay.wraps || []).length) body = boolMany('cut', body, lay.wraps.map(function (w) { return cylinderCutter(w.loop, w.plane, w.sec, w.BA); }), 'Closed Corner: OpenCascade could not cut the bend\'s end.');
      var rest = body;
      body = boolMany('fuse', body, lay.adds.map(function (t) { return prismOf(t.loop, t.plane, t.a, t.b); }), 'Closed Corner: OpenCascade could not extend the faces.');
      // lane DK: Close bend region: each bend-end fill (its loop is the end face's chords) less the part after the trim
      // and less that part moved back by the gap along the extension (Kernel.closedCornerFill), fused on
      (lay.fills || []).forEach(function (t) {
        // rfGJ: a plain bend end closes with a helicoid (t.taper, as the matching bend's `wraps`): the exact bend swept a
        // little past the band, the triangle past the slant cut off, the sweep's ends cut back to the band
        if (t.taper) {
          var tp = t.taper, over = 0.02 * tp.BA, w0 = V.dot(tp.plane.n, tp.plane.origin);
          var sw = N(N(new oc.BRepPrimAPI_MakePrism_1(moveTo(flangeSection(noOverlap(tp.sec, true), tp.plane), tp.t0 - over, tp.plane), Vec(V.scale(tp.plane.n, tp.t1 - tp.t0 + 2 * over)), false, true)).Shape());
          sw = boolMany('cut', sw, [cylinderCutter(taperLoop(tp.loop, tp.BA), tp.plane, tp.sec, tp.BA)], 'Closed Corner: OpenCascade could not taper the bend\'s end.');
          body = fuse(body, clipKeep(clipKeep(sw, tp.plane.n, w0 + tp.t0), V.scale(tp.plane.n, -1), -(w0 + tp.t1)));
          return;
        }
        var tr = N(new oc.gp_Trsf_1());
        tr.SetTranslation_1(Vec([-t.clip * t.n[0], -t.clip * t.n[1], -t.clip * t.n[2]]));
        var P = cut(cut(prismOf(t.loop, t.plane, t.a, t.b), rest), transformed(rest, tr));
        body = fuse(body, P);
      });
      bodies[k] = unify(body);
    }
    // Unfold / Fold (lane DB2; as Kernel.buildUnfold / buildFold, from the state Kernel.rebuild leaves after the Unfold:
    // its face pieces' rigid motions F, Q, P and the bend strips). Unfold: every face piece of the exact folded part
    // (the part ∩ the piece's cell, the piece's outline through the thickness) moved by P·Q·F, each unfolded strip the
    // flat strip × T moved by P·Q (a strip that still has a cut across it from before is Anvil's: unsupported), each
    // bend left folded the part ∩ its wedge moved with its parent; all fused. Fold: what was cut since (the unfolded
    // part less now), face pieces moved back rigidly, each strip's through-voids (Kernel.bendVoids) as exact
    // cylinderCutter tools round the bend; all cut from the folded part as it was before the Unfold. Lane DJ: a Fold of
    // some bends unfolds the rest again from Anvil's state after it, an Unfold of a strip with a cut across it takes
    // the strip from the flat (holes and all), a second Unfold folds the open one back first, and blind cuts and
    // added material fold back in layers (ufFoldBody).
    var ufLocal = {};   // feature index of an Unfold built in this run -> { B0, F0 }
    function ufMath() { return K._ || {}; }
    function ufCell(st, loop, M, d0, d1) { var sp = st.fr.span(d0, d1), sh = prismOf(loop, sp.plane, sp.a, sp.b); return transformed(sh, trsfOf(M)); }
    function common(a, b) { var op = N(new oc.BRepAlgoAPI_Common_3(a, b, R())); if (!op.IsDone()) throw new Error('OpenCascade could not intersect the bodies.'); return N(op.Shape()); }
    function ufState(fi) {
      var r = K.unfoldStateAt(model, fi);
      if (!r.state) throw new Error('Unfold: no unfold state.');
      return r.state;
    }
    // lane DJ: the Unfold state left open before feature index fi (an Unfold, or a Fold of some bends), or null
    function ufOpenAt(fi) {
      var j = -1;
      m.features.forEach(function (g, i) { if (i < fi && (g.type === 'unfold' || g.type === 'fold')) j = i; });
      if (j < 0) return null;
      var st = K.unfoldStateAt(model, j).state;
      return st ? { u: j, st: st } : null;
    }
    // unfold the exact folded part B0 by state st: every face piece (B0 ∩ its cell) moved by P·Q·F, each unfolded strip
    // the flat strip × T (lane DJ: less the flat's holes when a cut crosses it) moved by P·Q, each bend left folded
    // B0 ∩ its wedge moved with its parent; all fused
    function ufUnfoldBody(st, B0) {
      var mc = ufMath().mCompose, T = st.T, eps = 0.01 * T, parts = [], flatSh = null;
      function flatShape() {
        if (flatSh) return flatSh;
        var sp = st.fr.span(0, T), sp2 = st.fr.span(-eps, T + eps);
        flatSh = prismOf(st.flat.loops[0], sp.plane, sp.a, sp.b);
        var hs = st.flat.loops.slice(1).map(function (h) { return prismOf(h, sp2.plane, sp2.a, sp2.b); });
        if (hs.length) flatSh = boolMany('cut', flatSh, hs, 'Unfold: OpenCascade could not cut the flat\'s holes.');
        return flatSh;
      }
      st.faces.forEach(function (fc, i) {
        var pc = common(B0, ufCell(st, fc.outer, ufMath().mInv(st.F[i]), -eps, T + eps));
        if (volumeOf(pc) > 1e-12) parts.push(transformed(pc, trsfOf(mc(st.P, mc(st.Q[i], st.F[i])))));
      });
      st.strips.forEach(function (s, k2) {
        if (st.sel[k2]) {
          var M = mc(st.P, st.Q[s.parent]);
          if (s.fi.cutouts && s.fi.cutouts.length && st.flat) {
            var sp = st.fr.span(-eps, T + eps), pc2 = common(flatShape(), prismOf(s.strip, sp.plane, sp.a, sp.b));
            if (volumeOf(pc2) > 1e-12) parts.push(transformed(pc2, trsfOf(M)));
          } else parts.push(ufCell(st, s.strip, M, 0, T));
          return;
        }
        var w = K.unfoldWedgeSpec(s, T), pw = common(B0, prismOf(w.loop, w.plane, w.a, w.b));
        if (volumeOf(pw) > 1e-12) parts.push(transformed(pw, trsfOf(mc(st.P, mc(st.Q[s.parent], st.F[s.parent])))));
      });
      // lane DT: material added across a bend line past the strip's ends (Kernel's state.extras): an unfolded strip's
      // from the flat (its outline there), a folded bend's from the part (the wedge run on past both ends)
      (st.extras || []).forEach(function (x) {
        var s = st.strips[x.k];
        if (!s) return;
        if (st.sel[x.k]) {
          var sp3 = st.fr.span(-eps, T + eps), M3 = mc(st.P, st.Q[s.parent]);
          (x.loops || []).forEach(function (l) {
            var pc3 = common(flatShape(), prismOf(l, sp3.plane, sp3.a, sp3.b));
            if (volumeOf(pc3) > 1e-12) parts.push(transformed(pc3, trsfOf(M3)));
          });
          return;
        }
        var w3 = K.unfoldWedgeSpec(s, T);
        [[-x.D, w3.a], [w3.b, w3.b + x.D]].forEach(function (r) {
          var pw3 = common(B0, prismOf(w3.loop, w3.plane, r[0], r[1]));
          if (volumeOf(pw3) > 1e-12) parts.push(transformed(pw3, trsfOf(mc(st.P, mc(st.Q[s.parent], st.F[s.parent])))));
        });
      });
      if (!parts.length) throw new Error('Unfold: nothing of the sheet is left.');
      return unify(parts.length > 1 ? boolMany('fuse', parts[0], parts.slice(1), 'Unfold: OpenCascade could not join the flat pieces.') : parts[0]);
    }
    // the folded part B0 (before the Unfold of state st, F0 just after it) with what was cut from or added to the
    // unfolded part since (now): face pieces moved back rigidly, each strip's through-voids (Kernel.bendVoids) as exact
    // cylinderCutter tools round the bend; lane DJ: what else was cut in a strip (a blind cut) and what was added
    // (Kernel.unfoldCells, Kernel.unfoldLayers) in layers of constant depth, each a cylinderCutter shell at its depth
    function ufFoldBody(st, B0, F0, now, fid) {
      var mc = ufMath().mCompose, mi = ufMath().mInv, T = st.T, eps = 0.01 * T, removed = cut(F0, now), cuts = [];
      function bendFrame(sf) {
        // cylinderCutter takes a right-handed section frame (x × y = n); the bend's n runs a → b, which may be the other way
        var bp = sf.bend, flip = V.dot(V.cross(bp.x, bp.y), bp.n) < 0;
        if (flip) bp = { origin: bp.origin, x: bp.x, y: bp.y, n: V.scale(bp.n, -1) };
        return { bp: bp, loop: function (l) { return flip ? l.map(function (q) { return [q[0], -q[1]]; }).reverse() : l; } };
      }
      function wrapLayers(ly, sf, s, isCut) {
        var bf = bendFrame(sf), out = [], tol = 1e-6 * Math.max(1, T);
        ly.forEach(function (l) {
          var zr = l.z.slice();
          if (isCut) { if (Math.abs(zr[0]) < tol) zr[0] = -eps; if (Math.abs(zr[1] - T) < tol) zr[1] = T + eps; }
          var sol = l.outer.map(function (q) { return cylinderCutter(bf.loop(q), bf.bp, sf.sec, s.BA, zr); });
          var one = sol.length > 1 ? boolMany('fuse', sol[0], sol.slice(1), 'Fold: OpenCascade could not join a layer.') : sol[0];
          if (l.holes.length) one = boolMany('cut', one, l.holes.map(function (q) { return cylinderCutter(bf.loop(q), bf.bp, sf.sec, s.BA, [zr[0] - eps, zr[1] + eps]); }), 'Fold: OpenCascade could not cut a layer\'s hole.');
          out.push(one);
        });
        return out;
      }
      if (volumeOf(removed) > 1e-12) {
        st.faces.forEach(function (fc, i) {
          var M = mc(st.P, st.Q[i]), pc = common(removed, ufCell(st, fc.outer, M, -eps, T + eps));
          if (volumeOf(pc) > 1e-12) cuts.push(transformed(pc, trsfOf(mi(mc(M, st.F[i])))));
        });
        st.strips.forEach(function (s, k2) {
          if (!st.sel[k2]) {
            var w = K.unfoldWedgeSpec(s, T), Mw = mc(st.P, mc(st.Q[s.parent], st.F[s.parent]));
            var pw = common(removed, transformed(prismOf(w.loop, w.plane, w.a, w.b), trsfOf(Mw)));
            if (volumeOf(pw) > 1e-12) cuts.push(transformed(pw, trsfOf(mi(Mw))));
            return;
          }
          var M = mc(st.P, st.Q[s.parent]), Mi = trsfOf(mi(M)), pc = common(removed, ufCell(st, s.strip, M, -eps, T + eps));
          if (!(volumeOf(pc) > 1e-12)) return;
          var sf = K.unfoldStripFrame(st, s), slab = K.bandSlabSpec(sf.plane, sf.band, T), pcf = transformed(pc, Mi);
          var vs = common(prismOf(slab.loop, slab.plane, slab.a, slab.b), pcf), loops = [];
          if (volumeOf(vs) > 0) loops = K.bendVoids(shapeToCSG(transformed(now, Mi)), sf.plane, sf.band, T, { ends: true, voids: shapeToCSG(vs, 4e-3 * T, 0.1) });
          var bf = bendFrame(sf);
          loops.forEach(function (l) { cuts.push(cylinderCutter(bf.loop(l), bf.bp, sf.sec, s.BA)); });
          // lane DJ: a blind cut (what the through voids leave)
          var rest = pcf;
          if (loops.length) {
            var thru = { origin: sf.plane.origin, x: sf.plane.x, y: sf.plane.n, n: V.cross(sf.plane.x, sf.plane.n) }, up = V.dot(thru.n, sf.plane.y) > 0;
            var tp = loops.map(function (l) { return exactPrism(l, thru, up ? -T - eps : -eps, up ? eps : T + eps); });
            rest = cut(rest, tp.length > 1 ? boolMany('fuse', tp[0], tp.slice(1), 'Fold: OpenCascade could not join the through voids.') : tp[0]);
          }
          if (volumeOf(rest) > 1e-9 * Math.max(1e-6, s.BA * (sf.band.t1 - sf.band.t0) * T)) cuts = cuts.concat(wrapLayers(K.unfoldLayers(shapeToCSG(rest), sf, T, s.trackedInner), sf, s, true));
        });
      }
      var body = cuts.length ? boolMany('cut', B0, cuts, 'Fold: OpenCascade could not cut the folded part.') : B0;
      // lane DJ: material added since the Unfold, cell by cell (as Kernel.buildFold)
      var added = cut(now, F0);
      if (volumeOf(added) > 1e-12 * Math.max(1, Math.abs(volumeOf(F0)))) {
        var bb = bboxOf(now), D = 2 * V.len(V.sub(bb[1], bb[0])) + 10 * T + 1, rest2 = added, adds = [];
        K.unfoldCells(st, D).forEach(function (c) {
          var cs = c.wedge ? transformed(prismOf(c.wedge.loop, c.wedge.plane, c.wedge.a, c.wedge.b), trsfOf(c.M)) : ufCell(st, c.loop, c.M, -D, T + D);
          var pc = common(rest2, cs);
          if (!(volumeOf(pc) > 1e-12)) return;
          rest2 = cut(rest2, cs);
          if (!c.strip) { adds.push(transformed(pc, trsfOf(c.back))); return; }
          var s = c.strip, sf = K.unfoldStripFrame(st, s);
          adds = adds.concat(wrapLayers(K.unfoldLayers(shapeToCSG(transformed(pc, trsfOf(mi(c.M)))), sf, T, s.trackedInner), sf, s, false));
        });
        if (adds.length) body = boolMany('fuse', body, adds, 'Fold: OpenCascade could not add the material folded back.');
      }
      return unify(body);
    }
    // the exact solids of an Unfold's B0 / F0 (built in this run, or from the cache)
    function ufBodies(u, k) {
      if (ufLocal[u]) return ufLocal[u];
      if (cache && cache.states && u > 0 && cache.states[u - 1] && cache.states[u]) return { B0: cache.states[u - 1].bodies[k], F0: cache.states[u].bodies[k], k: k };
      return null;
    }
    function unfoldOp(f, fi) {
      if (!CSGlib) throw unsupportedErr('sheet metal (csg.js not loaded)');
      if (rm.sheetError) throw new Error(rm.sheetError);
      var st = ufState(fi), open = ufOpenAt(fi);
      var k = pickBody(f.fixedFace || (open && open.st.fixedFace) || null);
      if (k < 0) throw new Error('Unfold: there is no sheet metal part yet.');
      var B0 = unify(bodies[k]);
      // lane DJ: another Unfold while one is open: fold that one back first (as Kernel.buildUnfold)
      if (open) {
        var ob = ufBodies(open.u, k);
        if (!ob) throw unsupportedErr('an Unfold after one whose solid is not in this build');
        k = ob.k;
        B0 = ufFoldBody(open.st, ob.B0, ob.F0, unify(bodies[k]), f.id);
      }
      bodies[k] = ufUnfoldBody(st, B0);
      ufLocal[fi] = { B0: B0, F0: bodies[k], k: k };
    }
    function foldOp(f, fi) {
      if (!CSGlib) throw unsupportedErr('sheet metal (csg.js not loaded)');
      if (rm.sheetError) throw new Error(rm.sheetError);
      var open = ufOpenAt(fi);
      if (!open) throw new Error('Fold: there is no Unfold before it to fold back.');
      var k = pickBody(open.st.fixedFace || null), ob = ufBodies(open.u, k);
      if (!ob || k < 0) throw unsupportedErr('a Fold whose Unfold is not in this build');
      k = ob.k;
      var folded = ufFoldBody(open.st, ob.B0, ob.F0, bodies[k], f.id);
      // lane DJ: a Fold of some bends: the rest unfolded again (Anvil's state after this Fold)
      var again = K.unfoldStateAt(model, fi).state;
      if (!again) { bodies[k] = folded; return; }
      bodies[k] = ufUnfoldBody(again, folded);
      ufLocal[fi] = { B0: folded, F0: bodies[k], k: k };
    }
    // rfDX: Draft (Neutral Plane) through BRepOffsetAPI_DraftAngle: planar faces turn about their line on the neutral
    // plane, cylinders become cones (exact). The pull direction is Kernel.buildDraft's: the neutral face's inward
    // normal (a plane's normal) turned toward the side the drafted faces lie on (Kernel.draftSide), reverse flips it.
    function draftPlaneOf(fc) {
      try {
        var ad = N(new oc.BRepAdaptor_Surface_2(fc, true)), t = ad.GetType();
        if ((t && t.value != null ? t.value : t) !== 0) return null;
        var ax = N(N(ad.Plane()).Axis()), d = N(ax.Direction()), o = N(ax.Location()), n = [d.X(), d.Y(), d.Z()];
        if (fc.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED) n = V.scale(n, -1);
        return { n: n, w: V.dot(n, [o.X(), o.Y(), o.Z()]) };
      } catch (e) { return null; }
    }
    function draftOp(f) {
      var A = +f.angle;
      if (!(A > 0) || !(A < 89)) throw new Error('Draft angle must be greater than 0 and less than 89 degrees.');
      if (!(f.faces || []).length) throw new Error('Select the faces to draft.');
      var k = pickBody(f.faces[0].at);
      if (k < 0) throw new Error('Nothing to draft yet.');
      var body = unify(bodies[k]), all = facesOf(body), tol = K.pickTol(m.units || 'mm');
      var picked = nearest(f.faces, all, tol);
      if (picked.length < f.faces.length) throw new Error('A face to draft was not found on the body. Select the faces again.');
      var nr = f.neutral, at = nr && (nr.face || nr.at), pull, d0, nface = null;
      if (!nr) throw new Error('Select a neutral plane: a planar face or a plane.');
      if (at) {
        nface = nearest([{ at: at }], all, tol)[0];
        if (!nface) throw new Error('The neutral face was not found on the body. Select it again.');
        var np = draftPlaneOf(nface);
        if (!np) throw new Error('The neutral plane must be a planar face or a plane.');
        pull = V.scale(np.n, -1); d0 = -np.w;
      } else {
        var neu = K.draftNeutral(nr, null, { planes: planes }, tol);
        pull = neu.pull; d0 = neu.d0;
      }
      var info = picked.map(function (fc) {
        var g = N(new oc.GProp_GProps_1()); oc.BRepGProp.SurfaceProperties_1(fc, g, false, false);
        var c = N(g.CentreOfMass());
        return { area: g.Mass(), centroid: [c.X(), c.Y(), c.Z()] };
      });
      if (K.draftSide(pull, d0, info) < 0) { pull = V.scale(pull, -1); d0 = -d0; }
      if (f.reverse) { pull = V.scale(pull, -1); d0 = -d0; }
      picked.forEach(function (fc, i) {
        if (nface && fc.IsSame(nface)) throw new Error('Face<' + (i + 1) + '> is the neutral face: it cannot be drafted.');
        var pp = draftPlaneOf(fc);
        if (pp && V.len(V.cross(pp.n, pull)) < 1e-6) throw new Error('Face<' + (i + 1) + '> is parallel to the neutral plane: only faces that run along the direction of pull can be drafted.');
      });
      var pln = N(new oc.gp_Pln_3(P(V.scale(pull, d0)), Dir(pull)));
      var da = N(new oc.BRepOffsetAPI_DraftAngle_2(body)), ang = A * Math.PI / 180;
      picked.forEach(function (fc, i) {
        // Flag (tangent propagation) is needed by a curved face (its seam joins it to itself), so it always carries its
        // tangent neighbours; a planar face does only with Along Tangent
        da.Add(fc, Dir(pull), ang, pln, f.propagate === 'tangent' || !draftPlaneOf(fc));
        if (!da.AddDone()) throw new Error('OpenCascade could not draft Face<' + (i + 1) + '> (only planes, cylinders and cones can be drafted).');
      });
      da.Build(R());
      if (!da.IsDone()) throw new Error('OpenCascade could not draft these faces at this angle.');
      bodies[k] = N(da.Shape());
    }
    function unsupportedErr(what) { var e = new Error(what + ' is not supported by the OpenCascade kernel yet'); e.unsupported = what; return e; }
    // lane FZ: a tool that is a compound of solids (a pattern's or mirror's copies, a pattern of a pattern with its
    // seed) as its solids, one Boolean tool each: OpenCascade's Booleans take one argument's sub-shapes not to overlap
    // each other, so instances that overlap (a Ø1 boss at 0.8 pitch) came out with their overlaps counted twice or
    // lost (a self-intersecting compound body); a General Fuse / Cut with a list of tools takes overlapping tools
    function toolSolids(tool) {
      if (tool.ShapeType() !== ENUM.TopAbs_COMPOUND) return [tool];
      var s = explore(tool, ENUM.TopAbs_SOLID);
      return s.length ? s : [tool];
    }
    function addBoss(tool, f) {
      var tb = bboxOf(tool), hit = [], parts = toolSolids(tool);
      if (f.merge !== false) bodies.forEach(function (b, i) { if (boxesMeet(bboxOf(b), tb)) hit.push(i); });
      if (!hit.length) {
        var lone = parts.length > 1 ? boolMany('fuse', parts[0], parts.slice(1), 'OpenCascade could not join the pattern instances.') : tool;
        bodies.push(parts.length > 1 ? unify(lone) : lone); bodyFeatures.push(f.id); return;
      }
      var merged = parts.length > 1 ? boolMany('fuse', bodies[hit[0]], parts, 'OpenCascade could not join the bodies.') : fuse(bodies[hit[0]], tool);
      for (var j = 1; j < hit.length; j++) merged = fuse(bodies[hit[j]], merged);
      // lane FZ2: a union is never lighter than any of its pieces (rfGA G30 lost its base plate: 1.5 for 2.875); 1e-3
      // slack: these are fixed-order Gauss volumes (up to ~1e-4 off on B-spline faces)
      var vm = volumeOf(merged), vmax = Math.max.apply(null, hit.map(function (i) { return volumeOf(bodies[i]); }).concat(parts.map(volumeOf)));
      if (!(vm >= vmax * (1 - 1e-3))) throw new Error('OpenCascade joined this feature into a solid lighter than one of its pieces.');
      for (var h = hit.length - 1; h >= 1; h--) { bodies.splice(hit[h], 1); bodyFeatures.splice(hit[h], 1); }
      bodies[hit[0]] = merged;
    }
    function applyCut(tool, f) {
      if (!bodies.length) throw new Error('Nothing to cut yet.');
      var scope = K.cutScope(f, bodies.length), parts = toolSolids(tool), next = bodies.slice(), nextF = bodyFeatures.slice();
      for (var s = scope.length - 1; s >= 0; s--) {
        var i = scope[s], nb = parts.length > 1 ? boolMany('cut', bodies[i], parts, 'OpenCascade could not cut the body.') : cut(bodies[i], tool);
        var vn = volumeOf(nb), vb = volumeOf(bodies[i]);
        // lane FZ2: a cut never adds material
        if (vn > vb * (1 + 1e-3)) throw new Error('OpenCascade cut this body into a heavier solid.');
        if (vn < 1e-9) { next.splice(i, 1); nextF.splice(i, 1); } else next[i] = nb;
      }
      // lane FZ2: a cut that leaves nothing (rfGA G31 came out empty and was reported ok) is an error, as in Anvil
      // and SolidWorks; the bodies are left as they were
      if (!next.length) throw new Error('OpenCascade\'s cut removed every body.');
      bodies = next; bodyFeatures = nextF;
    }

    // ---- rebuild cache (opts.cache, kept by the worker between builds): after each feature, a snapshot of the bodies,
    // tools, planes, sketches and statuses; the longest prefix of unchanged features (same resolved JSON, same sheet
    // parameters and units) is restored and only the rest is built. Snapshot shapes are extra handles (Moved by the
    // identity) on the same OpenCascade geometry, outside the arena, freed here when their snapshot is dropped.
    var cache = opts.cache || null, ident = N(new oc.TopLoc_Location_1());
    // r11/occtswap11: opts.readOnly (Edit Feature's rolled-back part, occt-worker.js `upto`): the cache's prefix is
    // used but the cache is left as it is (no snapshot dropped, freed or added), so the whole part's later snapshots
    // stay for the rebuild that follows the edit
    var readOnly = !!opts.readOnly;
    function keep(s) { return s.Moved(ident, false); }
    function featureKey(f) { return JSON.stringify(f, function (k, v) { return k === 'profile' || k === 'name' ? undefined : v; }) + '|' + JSON.stringify(m.sheet || null) + '|' + (m.units || 'mm') + (m.noBends && (f.type === 'insertBends' || f.type === 'convertSM') ? '|noBends' : ''); }   // lane DQ: No Bends
    function freeState(S) { S.bodies.forEach(function (b) { try { b.delete(); } catch (e) { } }); }
    var keys = m.features.map(featureKey), start = 0;
    if (cache) {
      if (!cache.states) { cache.keys = []; cache.states = []; cache.tools = {}; }
      while (start < keys.length && start < cache.keys.length && cache.keys[start] === keys[start] && !cache.states[start].unsupported) start++;
      // drop the snapshots from the first change on
      if (!readOnly) {
        for (var d = start; d < cache.states.length; d++) freeState(cache.states[d]);
        Object.keys(cache.tools).forEach(function (id) {
          var i = -1;
          m.features.forEach(function (f, j) { if (String(f.id) === id) i = j; });
          if (i < 0 || i >= start) { try { cache.tools[id].delete(); } catch (e) { } delete cache.tools[id]; }
        });
        cache.keys.length = start; cache.states.length = start;
      }
      if (start > 0) {
        var S0 = cache.states[start - 1];
        bodies = S0.bodies.slice(); bodyFeatures = S0.bodyFeatures.slice();
        Object.keys(S0.planes).forEach(function (id) { planes[id] = S0.planes[id]; });
        Object.keys(S0.sketches).forEach(function (id) { sketches[id] = S0.sketches[id]; });
        var before = {};
        m.features.forEach(function (f, j) { if (j < start) before[String(f.id)] = true; });
        Object.keys(cache.tools).forEach(function (id) { if (before[id]) tools[id] = cache.tools[id]; });
        Object.keys(S0.status).forEach(function (id) { status[id] = S0.status[id]; });
        approx = !!S0.approx;
      }
    }
    function snapshot(i) {
      if (!cache || readOnly) return;
      var S = { bodies: bodies.map(keep), bodyFeatures: bodyFeatures.slice(), planes: {}, sketches: {}, status: {}, unsupported: unsupported, approx: approx };
      Object.keys(planes).forEach(function (id) { S.planes[id] = planes[id]; });
      Object.keys(sketches).forEach(function (id) { S.sketches[id] = sketches[id]; });
      Object.keys(status).forEach(function (id) { S.status[id] = status[id]; });
      var fid = String(m.features[i].id);
      if (tools[fid] && !cache.tools[fid]) cache.tools[fid] = tools[fid] = keep(tools[fid]);
      cache.keys[i] = keys[i]; cache.states[i] = S;
    }
    var reused = start, featMs = {};

    try {
      m.features.forEach(function (f, fi) {
        if (fi < start) return;   // restored from the cache
        if (f.suppressed && !unsupported) { status[f.id] = 'ok'; featMs[f.id] = 0; snapshot(fi); return; }   // rfFC: suppressed (resolvedModel)
        if (unsupported) { status[f.id] = 'skipped'; return; }
        if (!SUPPORTED[f.type]) { unsupported = f.type; status[f.id] = 'unsupported'; return; }
        var tf = now();   // r11/occtswap11: per-feature build time (out.ms.features)
        try {
          if (rm.featureErrors[f.id]) throw new Error(rm.featureErrors[f.id]);
          var tool = null;
          switch (f.type) {
            case 'plane': planes[f.id] = K.makePlane(f.ref || 'Front', +f.offset || 0); break;
            case 'helix': case 'projCurve': case 'compositeCurve': case 'xyzCurve': case 'refPtCurve': planes[f.id] = K.resolveCurve(f, m, refGeoCtx()); break;   // rfFA
            case 'crossBreak': break;   // rfGK
            case 'refaxis': case 'refpoint': case 'csys': var rgc = refGeoCtx(); planes[f.id] = K.resolveRefGeo(f, m, rgc); if (K.exactFaceCenter) K.exactFaceCenter(f, rgc); break;   // lane DF: no body, a record
            case 'sketch': {
              // r10/facesketch10: a sketch on a face follows the face, resolved exactly as Kernel.rebuild does (an
              // extrude cap from the extrude itself; other planar faces from this build's B-rep faces)
              var fp = K.resolveFacePlane ? K.resolveFacePlane(f, m, planes, brepPlanes) : null;
              if (fp && fp.plane !== f.plane) { f.plane = fp.plane; keys[fi] = featureKey(f); }
              if (!f.profile) f.profile = K.sketchProfile(f); sketches[f.id] = f; break;
            }
            case 'extrude': tool = extrudeTool(f); break;
            case 'revolve': tool = revolveTool(f); break;
            case 'loft': tool = loftTool(f); break;
            case 'boundary': tool = rfFBBoundary(oc, K, f, m, { N: N, R: R, explore: explore, volumeOf: volumeOf, sketches: sketches, planes: planes, unsupportedErr: unsupportedErr, loft: function (ids) { return loftTool({ sketches: ids }); }, loftWires: function (ids) { return ids.map(function (id) { var s = sketchById(id, 'A Direction 1 profile sketch was not found.'), o = outerLoop(s, 'Each Direction 1 sketch must contain exactly one closed profile.'); return loopWire(o.loop, o.profile, K.resolvePlane(s.plane, m, planes)); }); } }); break;   // rfFB
            case 'sweep': tool = sweepTool(f); break;
            case 'hole': tool = holeTool(f); break;
            case 'fillet': case 'chamfer': edgeOp(f); break;
            case 'import': importOp(f); break;
            case 'flange': flangeOp(f); break;
            case 'jog': jogOp(f); break;
            case 'sketchedBend': sketchedBendOp(f); break;
            case 'breakCorner': tool = breakCornerTool(f); break;
            case 'rip': tool = ripTool(f); break;   // lane DI
            case 'vent': tool = ventTool(f); break;   // lane DT
            case 'wrap': tool = wrapOp(f); break;   // rfDZ
            case 'closedCorner': closedCornerOp(f); break;
            case 'insertBends': case 'convertSM': insertBendsOp(f); break;   // lane DQ
            case 'unfold': unfoldOp(f, fi); break;   // lane DB2
            case 'fold': foldOp(f, fi); break;
            case 'rib': tool = ribTool(f); break;   // rfDY
            case 'intersect': intersectOp(f); break;   // rfDY
            case 'deleteBody': rfHTdeleteBody(f); break;   // rfHT: Delete/Keep Body
            case 'shell': shellOp(f); break;
            case 'draft': draftOp(f); break;   // rfDX
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
        featMs[f.id] = now() - tf;
        snapshot(fi);
      });
      var tBuild = now() - t0;
      var out = { ok: !unsupported && Object.keys(status).every(function (k) { return status[k] === 'ok'; }), status: status, unsupported: unsupported,
        bodies: bodies.length, bodyFeatures: bodyFeatures.slice(), valid: true, volume: 0, bbox: null, faces: [], mesh: null, ms: { build: tBuild, mesh: 0, features: featMs }, reused: reused,
        // how closely Anvil's own volume can be expected to agree: its sweeps, lofts, flange / jog bends and imports
        // are faceted (mitred sections, ruled sections, 8 segments per 90° bend, a mesh), and an edge picked with
        // chain: false stops at that edge in Anvil while OpenCascade carries the fillet / chamfer on round tangent
        // edges (SolidWorks' tangent propagation); shells of curved faces and corners where three picked edges meet are
        // polygonal / mitred in Anvil (`approx`); everything else is exact
        tolerance: approx || m.features.some(function (f) {
          return f.type === 'sweep' || f.type === 'loft' || f.type === 'boundary' || f.type === 'import' || f.type === 'flange' || f.type === 'jog' || f.type === 'sketchedBend' || f.type === 'insertBends' || f.type === 'convertSM' || ((f.type === 'fillet' || f.type === 'chamfer') && (f.edges || []).some(function (e) { return e.chain === false; }));
        }) ? 2e-2 : 1e-4 };
      if (unsupported || !bodies.length) return out;
      // booleans leave faces split along old seams (a pocket floor in pieces): merge faces on the same surface
      bodies = bodies.map(function (b) {
        try { var u = N(new oc.ShapeUpgrade_UnifySameDomain_2(b, true, true, false)); u.Build(); return N(u.Shape()); } catch (e) { return b; }
      });
      bodies = wrapScribeAll(bodies);   // rfDZ: Wrap scribes split the final faces (UnifySameDomain would merge a split made earlier)
      // exact mass properties per body (volume, surface area, centre of volume): Kernel.massProps prefers them
      out.bodyProps = bodies.map(function (b) {
        if (!valid(b)) out.valid = false;
        var g = N(new oc.GProp_GProps_1()), s = N(new oc.GProp_GProps_1());
        // lane FZ2: Gauss-Kronrod over the knot spans to a relative error of 1e-9. The fixed-order Gauss rule was 1.2e-4
        // heavy on a handwheel whose spokes meet the rim and hub in B-spline intersection curves (rfGA G01) and 5e-5
        // light on an extruded spline; the plain adaptive VolumeProperties_2 was worse on the spline (1.4e-4, while
        // reporting an error of 1e-16). GK is right to 4e-10 on both, the area (SurfaceProperties_2) to 1e-10. GK
        // computes the volume only: with its centre of volume too it took 46 s on the Moulded cap (7 ms without), so
        // the centre still comes from the fixed rule
        var gv = N(new oc.GProp_GProps_1());
        oc.BRepGProp.VolumeProperties_1(b, g, false, false, false);
        oc.BRepGProp.VolumePropertiesGK_1(b, gv, 1e-9, false, true, false, false, false);
        oc.BRepGProp.SurfaceProperties_2(b, s, 1e-9, false);
        var c = N(g.CentreOfMass()), v = gv.Mass();
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
          // write.step.unit only names the unit in the file: OpenCascade takes the shape to be in xstep.cascade.unit
          // (default MM) and scales it into the file's unit, so an inch part also sets the shape's unit to INCH (it was
          // written 25.4 times too small); both go back to MM afterwards so imports keep reading millimetres. A first
          // writer registers these parameters (in a fresh engine a SetCVal before any STEP object is lost and the file
          // came out in MM); the writer that is used reads them when it is made, so it comes after the SetCVal
          if (oc.Interface_Static) {
            N(new oc.STEPControl_Writer_1());
            oc.Interface_Static.SetCVal('xstep.cascade.unit', inch ? 'INCH' : 'MM'); oc.Interface_Static.SetCVal('write.step.unit', inch ? 'INCH' : 'MM');
          }
          var sw = N(new oc.STEPControl_Writer_1());
          try {
            sw.Transfer(all, oc.STEPControl_StepModelType.STEPControl_AsIs, true, R());
            sw.Write('/anvil-export.step');
          } finally { if (oc.Interface_Static) { oc.Interface_Static.SetCVal('xstep.cascade.unit', 'MM'); oc.Interface_Static.SetCVal('write.step.unit', 'MM'); } }
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
        out.mesh = tessellate(all, bodies, opts.chord, out.faces);
        out.ms.mesh = now() - t1;
      }
      if (out.mesh) { try { tangentFaces(bodies, out.faces); } catch (eT) { /* no tangency info: edges fall back to the facet angle */ } }
      return out;
    } finally {
      for (var a = arena.length - 1; a >= 0; a--) { try { if (arena[a] && arena[a].delete && !(arena[a].isDeleted && arena[a].isDeleted())) arena[a].delete(); } catch (e) { } }
    }

    // rfHL: which faces meet TANGENT (G1 or smoother) along every edge they share, from the exact B-rep
    // (BRepLib::EncodeRegularity within TANGENT_ANG), as facesOut[fi].tangent = [other face indices] (same order of
    // faces as tessellate). The viewport never draws a tangent edge (SolidWorks' default; ui-core.js edgesFor), but on
    // a mesh it only knew the facets' angle across the edge: a coarse B-spline face turns by more than the smooth angle
    // (22°) from one facet to the next, so a tangent seam between two freeform faces (loft pieces, a sweep's or a
    // boundary's patches, fillet faces on a spline) was drawn as short dark segments wherever the facets were coarse.
    function tangentFaces(bodyList, facesOut) {
      // lane HU: TANGENT_ANG is module-wide; as a `var` here (below build's `return`) it was still undefined when this
      // ran, so EncodeRegularity got NaN and only edges a fillet had already marked came out tangent
      if (!(TANGENT_ANG > 0 && TANGENT_ANG < 0.1)) throw new Error('TANGENT_ANG is not set');
      var fi = 0;
      bodyList.forEach(function (body) {
        oc.BRepLib.EncodeRegularity_1(body, TANGENT_ANG);
        var emap = N(new oc.TopTools_IndexedMapOfShape_1()), edgeFaces = [], faceObj = [], base = fi;
        explore(body, ENUM.TopAbs_FACE).forEach(function (s, k) {
          var f = N(oc.TopoDS.Face_1(s));
          faceObj[k] = f;
          explore(f, ENUM.TopAbs_EDGE).forEach(function (se) {
            var idx = emap.FindIndex(se);
            if (!idx) idx = emap.Add(se);
            var l = edgeFaces[idx] || (edgeFaces[idx] = []);
            if (l.indexOf(k) < 0) l.push(k);
          });
        });
        fi += faceObj.length;
        var pair = {};   // 'a|b' -> true while every shared edge is tangent
        edgeFaces.forEach(function (l, idx) {
          if (!l || l.length !== 2) return;
          var a = Math.min(l[0], l[1]), b = Math.max(l[0], l[1]), key = a + '|' + b;
          if (pair[key] === false) return;
          var e = N(oc.TopoDS.Edge_1(emap.FindKey(idx))), c = oc.BRep_Tool.Continuity_1(e, faceObj[a], faceObj[b]);
          var cv = c && c.value != null ? c.value : c, c0 = oc.GeomAbs_Shape.GeomAbs_C0, c0v = c0 && c0.value != null ? c0.value : c0;
          pair[key] = cv !== c0v;
        });
        Object.keys(pair).forEach(function (key) {
          if (!pair[key]) return;
          var ab = key.split('|').map(function (x) { return base + +x; });
          if (!facesOut[ab[0]] || !facesOut[ab[1]]) return;
          (facesOut[ab[0]].tangent = facesOut[ab[0]].tangent || []).push(ab[1]);
          (facesOut[ab[1]].tangent = facesOut[ab[1]].tangent || []).push(ab[0]);
        });
      });
    }
    // triangles of every B-rep face, tagged with the face's index in out.faces
    // rfHM: the display mesh follows Anvil's Image Quality (Kernel TESS via withModelTess): chord = the model's
    // chordTol, else 0.05 mm in the model's units (it was 0.05 UNITS: 1.27 mm on an inch part), angle = its maxAngle
    // (default 12°; 0 = off -> 20°). It was 0.35 rad (20°): a Ø.0625 spring wire came out an 18-gon and the Trumpet
    // Funnel's flare 372 triangles, both faceted and lumpy. Cap like Anvil's maxSegs 128: the chord never goes below
    // 1.5e-4 of the bounding diagonal (a circle as large as the part stays <= 128 segments).
    function tessellate(all, bodyList, chord, facesOut) {
      var tq = (m && m.tessellation) || {}, inch = m && m.units === 'in';
      chord = chord || tq.chordTol || (inch ? 0.05 / 25.4 : 0.05);
      var bb = bboxOf(all, false), diag = bb ? Math.hypot(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]) : 0;
      chord = Math.max(chord, diag * 1.5e-4);
      var deg = tq.maxAngle != null ? +tq.maxAngle : 12;
      N(new oc.BRepMesh_IncrementalMesh_2(all, chord, false, (deg > 0 ? Math.min(deg, 20) : 20) * Math.PI / 180, false));
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

    // rfDY: Rib and Intersect, the same layouts / regions as Kernel (kernel-features.js rfDY), built on the B-rep
    function rfDYcommon(a, b) { var op = N(new oc.BRepAlgoAPI_Common_3(a, b, R())); if (!op.IsDone()) throw new Error('OpenCascade could not intersect the bodies.'); return N(op.Shape()); }
    // a rib: each layout piece's prism, minus the prisms swept from the faces of (bodies ∩ piece) that face the sketch
    function ribTool(f) {
      var sk = sketchOf(f), plane = K.resolvePlane(sk.plane, m, planes);
      if (!sk.profile) sk.profile = K.sketchProfile(sk);
      if (!bodies.length) throw new Error('A rib needs a solid to meet: create the part first.');
      var lay = K.ribLayout(f, sk, plane, refGeoCtx().body), all = bodies.length === 1 ? bodies[0] : compound(bodies), parts = [];
      lay.pieces.forEach(function (pc) {
        var P = prismOf(pc.loop, plane, pc.a, pc.b), vD = V.scale(pc.m, pc.D), sh = [];
        facesOf(rfDYcommon(all, P)).forEach(function (fc) {
          var ad = N(new oc.BRepAdaptor_Surface_2(fc, true)), t = ad.GetType(), tv = t && t.value != null ? t.value : t;
          if (tv === 0) {
            var d = N(N(N(ad.Plane()).Axis()).Direction()), n = [d.X(), d.Y(), d.Z()];
            if (fc.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED) n = V.scale(n, -1);
            if (V.dot(n, pc.m) > -1e-9) return;
          } else {
            approx = true;   // Anvil's rib meets the facets of a curved face
            if (tv === 1) { var ca = N(N(N(ad.Cylinder()).Position()).Direction()); if (Math.abs(V.dot([ca.X(), ca.Y(), ca.Z()], pc.m)) > 1 - 1e-9) return; }
          }
          sh.push(N(N(new oc.BRepPrimAPI_MakePrism_1(fc, Vec(vD), false, true)).Shape()));
        });
        var rib = sh.length ? boolMany('cut', P, sh, 'OpenCascade could not trim the rib to the body.') : P;
        var bb = bboxOf(rib, true), w0 = V.dot(K.to3D(plane, pc.loop[0][0], pc.loop[0][1]), pc.m);
        if (!bb || volumeOf(rib) < 1e-12) return;
        for (var i = 0; i < 8; i++) {
          var c = [(i & 1 ? bb[1] : bb[0])[0], (i & 2 ? bb[1] : bb[0])[1], (i & 4 ? bb[1] : bb[0])[2]];
          if (V.dot(c, pc.m) - w0 > 0.5 * pc.D) throw new Error('The rib does not meet the body all along its sketch: flip the material side, change the extrusion direction or extend the sketch.');
        }
        parts.push(rib);
      });
      if (!parts.length) throw new Error('The rib has no material: its sketch lies inside the body.');
      return parts.reduce(function (a, b) { return fuse(a, b); });
    }
    // Intersect: the regions in Kernel.intersectRegions' order (in / out pattern, plane side, lump centroid)
    function intersectOp(f) {
      var sel = K.cutScope(f, bodies.length);
      var pls = (f.planes || []).map(function (r) {
        var ref = typeof r === 'string' ? { ref: r, offset: 0 } : typeof r === 'number' ? { featureId: r } : r, pl = K.resolvePlane(ref, m, planes);
        return { n: pl.n.slice(), w: V.dot(pl.n, pl.origin) };
      });
      if (!sel.length) throw new Error('Select the bodies to intersect.');
      if (sel.length > 6) throw new Error('Intersect takes at most 6 bodies at a time.');
      if (sel.length < 2 && !pls.length) throw new Error('Select at least two bodies, or a body and a plane, to intersect.');
      var B = sel.map(function (i) { return bodies[i]; }), U = B.reduce(function (a, b) { return fuse(a, b); }), bb = bboxOf(U, true);
      var size = V.len(V.sub(bb[1], bb[0])), eps = 1e-9 * Math.max(1, size * size * size), tol = 1e-6 * Math.max(1, size);
      var cells = [];
      for (var mask = 1; mask < (1 << B.length); mask++) {
        var acc = null, k;
        for (k = 0; k < B.length; k++) if (mask & (1 << k)) acc = acc ? rfDYcommon(acc, B[k]) : B[k];
        for (k = 0; k < B.length; k++) if (!(mask & (1 << k))) acc = cut(acc, B[k]);
        if (volumeOf(acc) > eps) cells.push({ sh: acc, cell: mask });
      }
      function split(list) {
        pls.forEach(function (pl) {
          var out = [];
          list.forEach(function (c) { [1, -1].forEach(function (sg) { var h = clipKeep(c.sh, V.scale(pl.n, sg), sg * pl.w); if (volumeOf(h) > eps) out.push({ sh: h, cell: c.cell, void: c.void }); }); });
          list = out;
        });
        return list;
      }
      function lumpsOf(list) {
        var out = [];
        list.forEach(function (c) {
          var ls = explore(c.sh, ENUM.TopAbs_SOLID).map(function (s) {
            var g = N(new oc.GProp_GProps_1()); oc.BRepGProp.VolumeProperties_1(s, g, false, false, false);
            var cm = N(g.CentreOfMass());
            return { body: s, volume: g.Mass(), centroid: [cm.X(), cm.Y(), cm.Z()], cell: c.cell, void: !!c.void };
          }).filter(function (r) { return r.volume > eps; });
          ls = joinTouching(ls);
          ls.sort(function (a, b) { for (var q = 0; q < 3; q++) { var d = a.centroid[q] - b.centroid[q]; if (Math.abs(d) > tol) return d; } return 0; });
          out = out.concat(ls);
        });
        return out;
      }
      // lane FZ2: Anvil's lumps (Kernel.solidLumps) are pieces joined wherever they share a vertex, so lumps touching
      // at a point or along an edge are ONE region; OpenCascade gives them as separate solids (two crossed Ø2
      // cylinders: each cylinder less the other is 4 solids pinched at points, 1 region in Anvil), which shifted every
      // region index after them (G20 kept three caps with the common part). Solids of a cell sharing a vertex position
      // are joined (a compound; volume and centre of volume combined) in their order of appearance, as Anvil does.
      function joinTouching(ls) {
        if (ls.length < 2) return ls;
        var parent = ls.map(function (r, i) { return i; }), owner = {}, q = 1e-6 * Math.max(1, size);
        function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
        ls.forEach(function (r, i) {
          explore(r.body, ENUM.TopAbs_VERTEX).forEach(function (v) {
            var p = N(oc.BRep_Tool.Pnt(N(oc.TopoDS.Vertex_1(v)))), key = Math.round(p.X() / q) + ',' + Math.round(p.Y() / q) + ',' + Math.round(p.Z() / q);
            if (owner[key] == null) owner[key] = i; else { var a = find(i), b = find(owner[key]); if (a !== b) parent[a] = b; }
          });
        });
        var groups = {}, order = [];
        ls.forEach(function (r, i) { var g = find(i); if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(r); });
        if (order.length === ls.length) return ls;
        return order.map(function (g) {
          var rs = groups[g];
          if (rs.length === 1) return rs[0];
          var vol = rs.reduce(function (s, r) { return s + r.volume; }, 0), cen = [0, 1, 2].map(function (k) { return rs.reduce(function (s, r) { return s + r.volume * r.centroid[k]; }, 0) / vol; });
          return { body: compound(rs.map(function (r) { return r.body; })), volume: vol, centroid: cen, cell: rs[0].cell, void: rs[0].void };
        });
      }
      var regions = lumpsOf(split(cells));
      if (f.mode === 'internal') {
        var box = prismOf([[bb[0][0], bb[0][1]], [bb[1][0], bb[0][1]], [bb[1][0], bb[1][1]], [bb[0][0], bb[1][1]]], K.makePlane('Front', 0), bb[0][2], bb[1][2]);
        var voids = lumpsOf([{ sh: cut(box, U), cell: 0, void: true }]).filter(function (r) {
          var b = bboxOf(r.body, true);
          for (var q = 0; q < 3; q++) if (b[0][q] < bb[0][q] + tol || b[1][q] > bb[1][q] - tol) return false;
          return true;
        });
        regions = regions.concat(lumpsOf(split(voids.map(function (r) { return { sh: r.body, cell: 0, void: true }; }))));
      }
      if (!regions.length) throw new Error('The selections make no regions.');
      // lane FZ2: f.regions picks regions by index, so both kernels must number them alike: a different count from
      // Anvil's (read on faceted copies of these bodies) is an error, never a different part kept
      if (Array.isArray(f.regions) && CSGlib) {
        var aReg = null;
        try { aReg = K.intersectRegions(bodies.map(function (b) { return shapeToCSG(b); }), f, m, planes); } catch (e) { aReg = null; }
        if (aReg && aReg.length !== regions.length) throw new Error('OpenCascade divides these bodies into ' + regions.length + ' regions where Anvil finds ' + aReg.length + ', so the regions to keep are ambiguous.');
      }
      var out = K.intersectKeep(regions, f, function (b) { var q = bboxOf(b); return { min: q[0], max: q[1] }; }, fuse, function (a, b) { return boxesMeet([a.min, a.max], [b.min, b.max]); });
      var at = Math.min.apply(null, sel), nb = [], nf = [];
      bodies.forEach(function (b, i) {
        if (i === at) out.forEach(function (o) { nb.push(o); nf.push(f.id); });
        if (sel.indexOf(i) < 0) { nb.push(b); nf.push(bodyFeatures[i]); }
      });
      bodies = nb; bodyFeatures = nf;
    }
    // ---- rfHT: Delete/Keep Body (Kernel.resolveBodyRefs on the exact solids): each reference is the body that holds
    // its point, else the one whose surface is within the pick tolerance (nearest); a bare number is a body index.
    // A reference that finds nothing removes nothing (Anvil reports it as a warning).
    function rfHTdeleteBody(f) {
      var refs = Array.isArray(f.bodies) ? f.bodies : [];
      if (!refs.length) throw new Error(f.keep ? 'Select the bodies to keep.' : 'Select the bodies to delete.');
      var tol = K.pickTol(m.units), hit = [];
      refs.forEach(function (r) {
        var k = -1;
        if (typeof r === 'number') k = r >= 0 && r < bodies.length && r === Math.floor(r) ? r : -1;
        else {
          var p = r && (Array.isArray(r) ? r : r.at), ins = [], near = [], ds = [];
          if (Array.isArray(p) && p.length >= 3) bodies.forEach(function (b, i) {
            var cls = N(new oc.BRepClass3d_SolidClassifier_2(b));
            cls.Perform(P(p), 1e-7);
            var st = cls.State(), d = dist(p, b);
            ds[i] = d;
            if (st === oc.TopAbs_State.TopAbs_IN) ins.push(i); else if (st === oc.TopAbs_State.TopAbs_ON || d <= tol) near.push(i);
          });
          if (ins.length > 1) ins.sort(function (a, b) { return ds[b] - ds[a] || a - b; });   // (overlapping bodies) the one it is deeper in
          near.sort(function (a, b) { return ds[a] - ds[b] || a - b; });
          k = ins.length ? ins[0] : near.length ? near[0] : -1;
        }
        if (k >= 0 && hit.indexOf(k) < 0) hit.push(k);
      });
      var gone = [];
      if (f.keep) { if (hit.length) bodies.forEach(function (b, i) { if (hit.indexOf(i) < 0) gone.push(i); }); }
      else gone = hit.slice();
      gone.sort(function (a, b) { return b - a; }).forEach(function (i) { bodies.splice(i, 1); bodyFeatures.splice(i, 1); });
    }
    // ---- rfDZ: Wrap (Kernel.wrapLayout, read on a faceted copy of this build's bodies as reference geometry is): each
    // contour is a face on the true surface at a height h (cylinder / cone: its (θ, z) loop as straight p-curves on a
    // Geom_CylindricalSurface / Geom_ConicalSurface of the offset radius, framed so that u = θ; plane: the sketch's own
    // loop moved onto the face), thickened along the face normal (deboss −d … ε, emboss −ε … d); holes are cut,
    // islands added back. A scribe keeps its faces at h = 0 in tools[f.id]; wrapScribeAll imprints them on the final
    // bodies (after UnifySameDomain, which would merge the split faces again).
    function wrapOp(f) {
      if (!bodies.length) throw new Error('Wrap: there is no body to wrap onto yet.');
      var L = K.wrapLayout(f, m, refGeoCtx()), h = K.wrapHeights(L);
      if (L.mode === 'scribe') { tools[f.id] = compound(L.loops.map(function (l) { return wrapLoopFace(L, l, 0); })); return null; }
      var dl = 0.5 * Math.max(L.eps, 1e-9), acc = null;
      L.loops.slice().sort(function (p, q) { return p.depth - q.depth; }).forEach(function (l) {
        if (l.depth % 2 === 1) { if (acc) acc = cut(acc, wrapLoopSolid(L, l, h[0] - dl, h[1] + dl)); }
        else { var s = wrapLoopSolid(L, l, h[0], h[1]); acc = acc ? fuse(acc, s) : s; }
      });
      if (!acc) throw new Error('Wrap: the sketch has no closed contour.');
      return acc;
    }
    function wrapLoopFace(L, l, hh) {
      if (L.prism) {
        var mf = N(new oc.BRepBuilderAPI_MakeFace_15(loopWire({ pts: l.pts, seg: l.seg }, L.profile, L.prism), true));
        if (!mf.IsDone()) throw new Error('Wrap: OpenCascade could not make a contour face.');
        return moveTo(N(mf.Face()), L.prismSign * hh, L.prism);
      }
      if (L.kind === 'plane') return polyFace3(l.st.map(function (p) { return L.G(p[0], p[1], hh); }));
      var rec = L.rec(hh), ax = N(new oc.gp_Ax3_3(P(L.o), Dir(L.dd), Dir(L.e1)));
      var gs = L.kind === 'cyl' ? new oc.Geom_CylindricalSurface_1(ax, rec.r) : new oc.Geom_ConicalSurface_1(ax, Math.atan(L.k), rec.r);
      var hs = N(new oc.Handle_Geom_Surface_2(gs)), cv = L.kind === 'cone' ? Math.cos(Math.atan(L.k)) : 1, uv = l.st.map(function (p) { return [p[0], p[1] / cv]; });
      var mw = N(new oc.BRepBuilderAPI_MakeWire_1());
      uv.forEach(function (a, i) {
        var b = uv[(i + 1) % uv.length];
        if (Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) < 1e-12) return;
        var sg = N(new oc.GCE2d_MakeSegment_1(N(new oc.gp_Pnt2d_3(a[0], a[1])), N(new oc.gp_Pnt2d_3(b[0], b[1]))));
        var e = N(N(new oc.BRepBuilderAPI_MakeEdge_30(N(new oc.Handle_Geom2d_Curve_2(N(sg.Value()).get())), hs)).Edge());
        oc.BRepLib.BuildCurves3d_2(e);
        mw.Add_1(e);
      });
      if (!mw.IsDone()) throw new Error('Wrap: a wrapped contour does not close.');
      var fm = N(new oc.BRepBuilderAPI_MakeFace_21(hs, N(mw.Wire()), true));
      if (!fm.IsDone()) throw new Error('Wrap: OpenCascade could not make a wrapped face.');
      return N(fm.Face());
    }
    function wrapLoopSolid(L, l, a, b) {
      var face = wrapLoopFace(L, l, a);
      if (L.prism) return N(N(new oc.BRepPrimAPI_MakePrism_1(face, Vec(V.scale(L.prism.n, L.prismSign * (b - a))), false, true)).Shape());
      if (L.kind === 'plane') return N(N(new oc.BRepPrimAPI_MakePrism_1(face, Vec(V.scale(L.n, L.sigma * (b - a))), false, true)).Shape());
      // the face's normal is the surface's (the radial direction for u = θ); sigma turns it to the material's outward one
      var th = N(new oc.BRepOffsetAPI_MakeThickSolid());
      th.MakeThickSolidBySimple(face, L.sigma * (b - a));
      if (!th.IsDone()) throw new Error('Wrap: OpenCascade could not thicken a wrapped contour.');
      var sh = N(th.Shape());
      return volumeOf(sh) < 0 ? N(sh.Reversed()) : sh;   // a thickening outward along the face normal comes out inside-out
    }
    function wrapScribeAll(list) {
      var sc = m.features.filter(function (f) { return f.type === 'wrap' && f.mode === 'scribe' && status[f.id] === 'ok' && tools[f.id]; });
      if (!sc.length) return list;
      return list.map(function (b) {
        try {
          var sp = N(new oc.BRepAlgoAPI_Splitter_1());
          sp.SetArguments(shapeList([b])); sp.SetTools(shapeList(sc.map(function (f) { return tools[f.id]; })));
          sp.Build(R());
          if (!sp.IsDone()) return b;
          var sols = explore(N(sp.Shape()), ENUM.TopAbs_SOLID);
          return sols.length === 1 ? sols[0] : b;   // a scribe face inside the material (covered later) would cut the body in two
        } catch (e) { return b; }
      });
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
    return finishBuild(occ, anvilBuild, toBodies(occ, anvilMesh, anvilTriShared, CSG), K);
  }
  // fromPacked(occ, packed, anvilBuild, CSG, K): toBuild's result from the bodies occt-worker.js made with toBodies and
  // packed (r.packed, face tags included), so the main thread only unpacks them (r3/engine3)
  function fromPacked(occ, packed, anvilBuild, CSG, K) {
    return finishBuild(occ, anvilBuild, packed.map(function (p) { return CSG.unpack(p); }), K);
  }
  // toBodies(occ, anvilMesh, anvilTriShared, CSG) -> the solids as CSG bodies, one polygon per triangle, tagged with
  // its B-rep face, surface record and feature (anvilMesh needs only .positions)
  function toBodies(occ, anvilMesh, anvilTriShared, CSG) {
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
    for (var b = 0; b < occ.bodies; b++) bodies.push(CSG.fromPolygons(perBody[b] || []));
    return bodies;
  }
  function finishBuild(occ, anvilBuild, bodies, K) {
    var nf = occ.faces.length, out = {};
    bodies.forEach(function (csg, b) { if (occ.bodyProps && occ.bodyProps[b]) csg.exact = occ.bodyProps[b]; });   // Kernel.meshFromBody / massProps use it
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
    // errors of features OpenCascade built are Anvil's kernel's own limits: the shown part has none
    out.errors = {};
    Object.keys(anvilBuild.errors || {}).forEach(function (id) { if (!occ.status || occ.status[id] !== 'ok' || (K.isRefusal && K.isRefusal(anvilBuild.errors[id]))) out.errors[id] = anvilBuild.errors[id]; });
    out.occt = { volume: occ.volume, faces: nf, bodies: occ.bodies, step: occ.step || null, iges: occ.iges || null, tangent: tangentPairs(occ) };
    return out;
  }
  // rfHL: { 'a|b': true } for every pair of B-rep faces (global indices, a < b, the polygons' `face` tags) that meet
  // tangent along all their shared edges (build's tangentFaces); ui-core.js edgesFor treats mesh edges between them as
  // smooth whatever the facets' angle
  function tangentPairs(occ) {
    var out = {};
    (occ.faces || []).forEach(function (f, i) { (f.tangent || []).forEach(function (j) { out[Math.min(i, j) + '|' + Math.max(i, j)] = true; }); });
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

  // rfFB: Boundary Boss/Base / Boundary Cut. h: the build's { N, R, explore, volumeOf, loftWires, sketches, planes,
  // unsupportedErr }. No Direction 2 curves: ThruSections through the profiles' exact wires (as Loft; Close is
  // unsupported: Anvil's ruled ring drives). With curves: Kernel.boundaryFrame's patches, each a bilinearly blended (Coons) BSpline surface (GeomFill_BSplineCurves, StretchStyle) on
  // its four sides — a side whose points run straight is one line, a smooth run is a cubic through its points, a run
  // with corners stays a polyline — capped by planar faces on the end profiles' sides and sewn. Thin Feature: the
  // solid shelled outward (reverse: inward) with the end caps removed.
  function rfFBBoundary(oc, K, f, m, h) {
    var N = h.N, R = h.R, V = K.vec, fr = K.boundaryFrame(f, m, { sketches: h.sketches, planes: h.planes });
    var thin = f.thin && +f.thin.t > 0 ? f.thin : null, solid, caps = [];
    if (thin && thin.mid) throw h.unsupportedErr('Boundary Thin Feature (Mid-Plane)');
    if (fr.virtual) {
      // a closed ThruSections (first wire again at the end) comes out flat or inside out here: Anvil's ring drives
      if (fr.close) throw h.unsupportedErr('Boundary with Close');
      // rfHL: no curves and no Thin is the Loft on Anvil's kernel (buildBoundary → buildLoft), so it is loftTool here
      // too: the same surface (ThruSections' own smoothing of three circles was 5 % off and was never shown) and one
      // side face through full circles
      if (!thin && h.loft) return h.loft(fr.secs.map(function (s) { return s.id; }));
      var ts = N(new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6)), wires = h.loftWires(fr.secs.map(function (s) { return s.id; }));
      wires.forEach(function (w) { ts.AddWire(w); });
      ts.Build(R());
      if (!ts.IsDone()) throw new Error('OpenCascade could not build this boundary through the profiles.');
      solid = N(ts.Shape());
      caps = [N(ts.FirstShape()), N(ts.LastShape())];
    } else {
      if (fr.G < 2) throw h.unsupportedErr('Boundary with one Direction 2 curve');
      var P = function (p) { return N(new oc.gp_Pnt_3(p[0], p[1], p[2])); };
      var bspline = function (pts) {
        var a = pts[0], b = pts[pts.length - 1], ab = V.sub(b, a), L = V.len(ab), straight = L > 0, smooth = pts.length >= 3, i;
        for (i = 1; i + 1 < pts.length && straight; i++) { var w = V.sub(pts[i], a), t = V.dot(w, ab) / (L * L); if (V.len(V.sub(w, V.scale(ab, t))) > 1e-9 * Math.max(1, L)) straight = false; }
        for (i = 1; i + 1 < pts.length && smooth; i++) { var u = V.sub(pts[i], pts[i - 1]), v = V.sub(pts[i + 1], pts[i]); if (V.dot(u, v) < Math.cos(Math.PI / 12) * V.len(u) * V.len(v)) smooth = false; }
        var q = straight ? [a, b] : pts;
        if (!straight && smooth) {
          var arr = N(new oc.TColgp_Array1OfPnt_2(1, q.length));
          q.forEach(function (p, k) { arr.SetValue(k + 1, P(p)); });
          var fit = N(new oc.GeomAPI_PointsToBSpline_2(arr, 3, 8, oc.GeomAbs_Shape.GeomAbs_C2, 1e-7 * Math.max(1, L)));
          if (fit.IsDone()) return N(fit.Curve());
        }
        // degree 1 through the points (a line, or a polyline with corners)
        var poles = N(new oc.TColgp_Array1OfPnt_2(1, q.length)), kn = N(new oc.TColStd_Array1OfReal_2(1, q.length)), mu = N(new oc.TColStd_Array1OfInteger_2(1, q.length)), acc = 0;
        q.forEach(function (p, k) { poles.SetValue(k + 1, P(p)); if (k) acc += V.len(V.sub(p, q[k - 1])); kn.SetValue(k + 1, acc); mu.SetValue(k + 1, k === 0 || k === q.length - 1 ? 2 : 1); });
        return N(new oc.Handle_Geom_BSplineCurve_2(new oc.Geom_BSplineCurve_1(poles, kn, mu, 1, false)));
      };
      var edge = function (hb) { return N(N(new oc.BRepBuilderAPI_MakeEdge_24(N(new oc.Handle_Geom_Curve_2(hb.get())))).Edge()); };
      // each side twice, once each way: the four sides of a patch run head to tail (C1 → C2 → C3 → C4)
      var rev = function (pts) { return bspline(pts.slice().reverse()); };
      var secC = fr.pieces.map(function (ps) { return ps.map(bspline); }), secR = fr.pieces.map(function (ps) { return ps.map(rev); });
      var guideC = fr.guides.map(function (gs) { return gs.map(bspline); }), guideR = fr.guides.map(function (gs) { return gs.map(rev); });
      var sew = N(new oc.BRepBuilderAPI_Sewing(Math.max(1e-7, fr.tol * 1e-2), true, true, true, false)), G = fr.G;
      for (var b = 0; b < fr.guides.length; b++) for (var k = 0; k < G; k++) {
        var fill = N(new oc.GeomFill_BSplineCurves_2(secC[b][k], guideC[b][(k + 1) % G], secR[b + 1][k], guideR[b][k], oc.GeomFill_FillingStyle.GeomFill_StretchStyle));   // linear blending: Anvil's Coons patch (CoonsStyle refuses degree-1 sides)
        sew.Add(N(N(new oc.BRepBuilderAPI_MakeFace_8(N(new oc.Handle_Geom_Surface_2(N(fill.Surface()).get())), 1e-7)).Face()));
      }
      [0, fr.secs.length - 1].forEach(function (si) {
        var mw = N(new oc.BRepBuilderAPI_MakeWire_1());
        secC[si].forEach(function (c) { mw.Add_1(edge(c)); });
        if (!mw.IsDone()) throw new Error('OpenCascade could not close a boundary end profile.');
        var face = N(N(new oc.BRepBuilderAPI_MakeFace_15(N(mw.Wire()), true)).Face());
        caps.push(face);
        sew.Add(face);
      });
      sew.Perform(R());
      var shells = h.explore(N(sew.SewedShape()), oc.TopAbs_ShapeEnum.TopAbs_SHELL);
      if (shells.length !== 1) throw new Error('OpenCascade could not close the boundary surfaces into a solid.');
      solid = N(N(new oc.BRepBuilderAPI_MakeSolid_3(N(oc.TopoDS.Shell_1(shells[0])))).Solid());
      if (h.volumeOf(solid) < 0) solid = N(solid.Reversed());
      // the caps as sewn (the sewing replaces faces): the planar faces on the end profiles' planes
      var ends = [fr.secs[0], fr.secs[fr.secs.length - 1]];
      caps = h.explore(solid, oc.TopAbs_ShapeEnum.TopAbs_FACE).filter(function (fc) {
        var s = N(new oc.BRepAdaptor_Surface_2(oc.TopoDS.Face_1(fc), true)), t = s.GetType(), tv = t && t.value != null ? t.value : t;
        if (tv !== 0) return false;
        var pl = N(s.Plane()), o = N(pl.Location()), d = N(N(pl.Axis()).Direction()), n = [d.X(), d.Y(), d.Z()], p0 = [o.X(), o.Y(), o.Z()];
        return ends.some(function (e) { return Math.abs(Math.abs(V.dot(n, e.plane.n)) - 1) < 1e-9 && Math.abs(V.dot(V.sub(p0, e.plane.origin), e.plane.n)) < fr.tol; });
      });
    }
    if (!thin) return solid;
    if (caps.length !== 2) throw h.unsupportedErr('Boundary Thin Feature here');
    var list = N(new oc.TopTools_ListOfShape_1());
    caps.forEach(function (c) { list.Append_1(c); });
    var th = N(new oc.BRepOffsetAPI_MakeThickSolid());
    th.MakeThickSolidByJoin(solid, list, thin.reverse ? -(+thin.t) : +thin.t, 1e-3, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, oc.GeomAbs_JoinType.GeomAbs_Intersection, false, R());
    if (!th.IsDone()) throw new Error('OpenCascade could not make the thin boundary with this thickness.');
    return N(th.Shape());   // the wall between the surface and its offset (open at the end profiles)
  }
  // ------------------------------------------------------------------ rfFA: a reference curve record (Kernel.resolveCurve) as
  // a sweep path: its exact edges (a helix as a line in the (u, v) of its cylinder / cone, arcs, circles, the C1 cubic
  // chains of splines / projections), started at the end nearest the profile (c0) -> { edges, start, dir0 }
  function rfFAcurvePath(oc, N, P, Dir, rec, c0, V) {
    if (!rec || rec.refgeo !== 'curve') throw new Error('The path curve is missing or failed to rebuild.');
    if (rec.runs && rec.runs.length > 1) throw new Error('The path curve is in ' + rec.runs.length + ' separate pieces; a sweep path must be one connected curve.');
    var pts = rec.pts, flip = V.len(V.sub(pts[pts.length - 1], c0)) < V.len(V.sub(pts[0], c0)), list = rec.edges.slice();
    if (flip) list = list.reverse().map(function (e) {
      switch (e.t) {
        case 'line': return { t: 'line', a: e.b, b: e.a };
        case 'arc': return { t: 'arc', a: e.b, m: e.m, b: e.a };
        case 'circle': return { t: 'circle', c: e.c, n: V.scale(e.n, -1), r: e.r, x: e.x };
        case 'bez': return { t: 'bez', bez: e.bez.slice().reverse().map(function (B) { return B.slice().reverse(); }) };
        case 'helix': { var h = JSON.parse(JSON.stringify(e)); h.rev = !e.rev; return h; }
      }
      return e;
    });
    var edges = list.map(function (e) {
      if (e.t === 'line') return N(N(new oc.BRepBuilderAPI_MakeEdge_3(P(e.a), P(e.b))).Edge());
      if (e.t === 'arc') { var arc = N(new oc.GC_MakeArcOfCircle_4(P(e.a), P(e.m), P(e.b))); return N(N(new oc.BRepBuilderAPI_MakeEdge_24(N(new oc.Handle_Geom_Curve_2(N(arc.Value()).get())))).Edge()); }
      if (e.t === 'circle') return N(N(new oc.BRepBuilderAPI_MakeEdge_8(N(new oc.gp_Circ_2(N(new oc.gp_Ax2_2(P(e.c), Dir(e.n), Dir(e.x))), e.r)))).Edge());
      if (e.t === 'bez') {
        var m = e.bez.length, poles = N(new oc.TColgp_Array1OfPnt_2(1, 3 * m + 1)), kn = N(new oc.TColStd_Array1OfReal_2(1, m + 1)), mu = N(new oc.TColStd_Array1OfInteger_2(1, m + 1));
        poles.SetValue(1, P(e.bez[0][0]));
        e.bez.forEach(function (B, j) { for (var q = 1; q <= 3; q++) poles.SetValue(3 * j + q + 1, P(B[q])); });
        for (var j = 0; j <= m; j++) { kn.SetValue(j + 1, j); mu.SetValue(j + 1, j === 0 || j === m ? 4 : 3); }
        var hc = N(new oc.Handle_Geom_Curve_2(new oc.Geom_BSplineCurve_1(poles, kn, mu, 3, false)));   // the handle owns the curve
        return N(N(new oc.BRepBuilderAPI_MakeEdge_24(hc)).Edge());
      }
      if (e.t === 'helix') {
        var ax = N(new oc.gp_Ax3_3(P(e.o), Dir(e.n), Dir(e.x)));
        var surf = N(new oc.Handle_Geom_Surface_2(e.cone ? new oc.Geom_ConicalSurface_1(ax, e.cone, e.r0) : new oc.Geom_CylindricalSurface_1(ax, e.r0)));   // the handle owns the surface
        var u0 = [e.a0, 0], u1 = [e.a0 + e.du, e.v1];
        if (e.rev) { var sw = u0; u0 = u1; u1 = sw; }
        var crv = N(N(new oc.GCE2d_MakeSegment_1(N(new oc.gp_Pnt2d_3(u0[0], u0[1])), N(new oc.gp_Pnt2d_3(u1[0], u1[1])))).Value()).get();
        var ed = N(N(new oc.BRepBuilderAPI_MakeEdge_30(N(new oc.Handle_Geom2d_Curve_2(crv)), surf)).Edge());
        oc.BRepLib.BuildCurves3d_2(ed);
        return ed;
      }
      throw new Error('Unknown curve piece ' + e.t + '.');
    });
    return { edges: edges, start: flip ? pts[pts.length - 1] : pts[0], dir0: flip ? V.scale(rec.t1, -1) : rec.t0 };
  }

  return { build: build, importFile: importFile, mapFaces: mapFaces, toBuild: toBuild, toBodies: toBodies, fromPacked: fromPacked, nearestTriangles: nearestTriangles, SUPPORTED: SUPPORTED, TANGENT_ANG: TANGENT_ANG };
})();
if (typeof self !== 'undefined') self.OcctKernel = OcctKernel;
