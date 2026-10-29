// kernel-rebuild.js — Anvil kernel, the feature tree: `newModel`, feature names, `buildTool` (dispatches to the tool
// builders; sweep, loft, shell, flange and jog live in later files and are reached through Kernel._), `rebuild` with its
// cache, multi-body parts (`combineBodies`, `bodyInfo`) and build serialization for Web Worker rebuilds (`packBuild`,
// `unpackBuild`, `cacheFromBuild`). Loaded after kernel.js, kernel-sketch.js, kernel-curves.js, kernel-equations.js and
// kernel-mesh.js. No DOM.
(function (K, _) {
  'use strict';
  var AXES = _.AXES, add = _.add, arr = _.arr, dot = _.dot, len = _.len, makePlane = _.makePlane, norm = _.norm, resolveFacePlane = _.resolveFacePlane, resolvePlane = _.resolvePlane, scale = _.scale, sub = _.sub, to3D = _.to3D;   // kernel.js
  var TESS = _.TESS, pointInPoly = _.pointInPoly, setTessellation = _.setTessellation, signedArea = _.signedArea, sketchProfile = _.sketchProfile, tessKey = _.tessKey;   // kernel-sketch.js
  var buildExtrude = _.buildExtrude, buildRevolve = _.buildRevolve, mirrorBody = _.mirrorBody, rotateBody = _.rotateBody, translateBody = _.translateBody, unionAll = _.unionAll;   // kernel-curves.js
  var resolvedModel = _.resolvedModel;   // kernel-equations.js
  var buildEdgeFeature = _.buildEdgeFeature;   // kernel-mesh.js
  // buildFlange, buildJog, buildLoft, buildShell, buildSweep, normalCutTool (kernel-features.js, kernel-sheetmetal.js) are called through _.name: that file loads later

  // ------------------------------------------------------------------ rebuild
  function newModel(name) {
    return { name: name || 'Part1', units: 'mm', density: 7850, color: '#8c8c8c', features: [], nextId: 1 };   // rfBU: neutral grey (was '#a8adb6'; Materials.DEFAULT_COLOR)
  }

  var NAME_BASE = {
    sketch: 'Sketch', plane: 'Plane', extrude: 'Boss-Extrude', cut: 'Cut-Extrude', revolve: 'Revolve',
    revolveCut: 'Cut-Revolve', lpattern: 'LPattern', cpattern: 'CirPattern', mirror: 'Mirror', chamfer: 'Chamfer', fillet: 'Fillet', flange: 'Edge-Flange', sweep: 'Sweep', loft: 'Loft', shell: 'Shell', hem: 'Hem', jog: 'Jog'
  };
  NAME_BASE.sketchedBend = 'SketchBend';
  NAME_BASE.closedCorner = 'Closed Corner';
  NAME_BASE.unfold = 'Unfold'; NAME_BASE.fold = 'Fold';   // lane DB
  NAME_BASE.refaxis = 'Axis'; NAME_BASE.refpoint = 'Point'; NAME_BASE.csys = 'Coordinate System';   // lane CZ: reference geometry
  NAME_BASE.rip = 'Rip'; NAME_BASE.tab = 'Tab';   // lane DI
  NAME_BASE.vent = 'Vent';   // lane DT
  NAME_BASE.draft = 'Draft';   // rfDX
  NAME_BASE.wrap = 'Wrap';   // rfDZ
  NAME_BASE.insertBends = 'Process-Bends'; NAME_BASE.convertSM = 'Convert-Solid';   // lane DQ (SolidWorks' names)
  NAME_BASE.rib = 'Rib'; NAME_BASE.intersect = 'Intersect';   // rfDY
  NAME_BASE.boundary = 'Boundary-Boss'; NAME_BASE.boundaryCut = 'Boundary-Cut';   // rfFB (SolidWorks' names)
  NAME_BASE.helix = 'Helix/Spiral'; NAME_BASE.projCurve = 'Curve'; NAME_BASE.compositeCurve = 'CompCurve'; NAME_BASE.xyzCurve = 'Curve'; NAME_BASE.refPtCurve = 'Curve';   // rfFA (SolidWorks' tree names)

  function featureName(model, type, cut) {
    var base = NAME_BASE[type] || 'Feature';
    if (type === 'extrude' && cut) base = NAME_BASE.cut;
    if (type === 'revolve' && cut) base = NAME_BASE.revolveCut;
    if (type === 'sweep' && cut) base = 'Cut-Sweep';
    if (type === 'loft' && cut) base = 'Cut-Loft';
    if (type === 'boundary' && cut) base = NAME_BASE.boundaryCut;   // rfFB
    var max = 0;
    model.features.forEach(function (f) {
      if (f.name && f.name.indexOf(base) === 0) {
        var n = parseInt(f.name.slice(base.length), 10);
        if (n > max) max = n;
      }
    });
    return base + (max + 1);
  }

  function findFeature(model, id) {
    for (var i = 0; i < model.features.length; i++) if (model.features[i].id === id) return model.features[i];
    return null;
  }

  // A point strictly inside a closed loop and outside the given hole loops: the vertex centroid when it qualifies,
  // else an edge midpoint nudged inward. Returns [u, v] or null.
  function insidePoint2D(pts, holes) {
    var n = pts.length;
    if (n < 3) return null;
    var ok = function (q) {
      if (!pointInPoly(q, pts)) return false;
      for (var h = 0; h < holes.length; h++) if (pointInPoly(q, holes[h])) return false;
      return true;
    };
    var cx = 0, cy = 0, minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity, i;
    for (i = 0; i < n; i++) {
      cx += pts[i][0]; cy += pts[i][1];
      minx = Math.min(minx, pts[i][0]); maxx = Math.max(maxx, pts[i][0]);
      miny = Math.min(miny, pts[i][1]); maxy = Math.max(maxy, pts[i][1]);
    }
    var c = [cx / n, cy / n];
    if (ok(c)) return c;
    var s = signedArea(pts) >= 0 ? 1 : -1, d = 1e-3 * Math.hypot(maxx - minx, maxy - miny);
    if (!(d > 0)) return null;
    for (i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      var ex = b[0] - a[0], ey = b[1] - a[1], el = Math.hypot(ex, ey);
      if (el < 1e-12) continue;
      // inward normal of a CCW loop is the left-hand normal
      var q = [(a[0] + b[0]) / 2 - s * ey / el * d, (a[1] + b[1]) / 2 + s * ex / el * d];
      if (ok(q)) return q;
    }
    return null;
  }

  // cutDirectionHint(model, sketchId, body) -> true when a new cut on this sketch should be built with `reverse: true`
  // to go into the body (the material lies on the −n side of the sketch plane), false when the plain +n direction
  // already enters the body, null when there is no answer: no body, the sketch plane sits inside the material, the
  // profile lies off the body along its normal, or anything fails. A PropertyManager default only; never throws.
  function cutDirectionHint(model, sketchId, body) {
    try {
      if (!model || !body || !body.polygons || !body.polygons.length) return null;
      model = resolvedModel(model).model; // plane offsets and the sketch plane may be equations
      var sketch = findFeature(model, sketchId);
      if (!sketch || sketch.type !== 'sketch') return null;
      var planesById = {};
      model.features.forEach(function (f) { if (f.type === 'plane') planesById[f.id] = makePlane(f.ref || 'Front', +f.offset || 0); });
      var plane = resolvePlane(sketch.plane, model, planesById);
      var profile = sketch.profile || sketchProfile(sketch);
      var outer = null, holes = [];
      (profile.loops || []).forEach(function (l) {
        if (l.cross) return;
        if (!outer && !l.hole) outer = l;
        else if (outer && l.hole && l.depth === outer.depth + 1) holes.push(l.pts);
      });
      if (!outer) return null;
      var uv = insidePoint2D(outer.pts, holes);
      if (!uv) return null;
      var p = to3D(plane, uv[0], uv[1]), n = norm(plane.n);
      var bb = body.getBounds();
      var diag = bb ? len(sub(bb.max, bb.min)) : 0;
      if (!(diag > 0)) return null;
      var eps = Math.max(1e-3, 1e-3 * diag);
      var inside = body.pointTester();
      var fwd = inside(add(p, scale(n, eps))), back = inside(sub(p, scale(n, eps)));
      if (fwd && back) return null;
      if (fwd || back) return back && !fwd;
      // nothing right at the plane: shoot the line p + t·n through every face and see which side is hit first
      var hit = rayHits(body, p, n, eps);
      if (hit.forward === Infinity && hit.backward === Infinity) return null;
      return hit.backward < hit.forward;
    } catch (e) {
      return null;
    }
  }

  // Nearest face crossings of the line p + t·n with a solid, ignoring |t| < eps: { forward: t > 0 or Infinity,
  // backward: −t for the nearest t < 0, or Infinity }. Each polygon is tested in its own plane by projecting onto
  // the two axes its normal leans away from, so the test is exact for planar polygons of any shape.
  function rayHits(body, p, n, eps) {
    var forward = Infinity, backward = Infinity, polys = body.polygons;
    for (var i = 0; i < polys.length; i++) {
      var pl = polys[i].plane, pn = [pl.normal.x, pl.normal.y, pl.normal.z];
      var denom = dot(pn, n);
      if (Math.abs(denom) < 1e-12) continue;
      var t = (pl.w - dot(pn, p)) / denom;
      if (Math.abs(t) < eps) continue;
      if (t > 0 ? t >= forward : -t >= backward) continue;
      var q = add(p, scale(n, t));
      var ax = Math.abs(pn[0]), ay = Math.abs(pn[1]), az = Math.abs(pn[2]);
      var u = ax >= ay && ax >= az ? 1 : 0, v = az > ax && az > ay ? 1 : 2;
      var pts = polys[i].vertices.map(function (vx) { var a = arr(vx.pos); return [a[u], a[v]]; });
      if (!pointInPoly([q[u], q[v]], pts)) continue;
      if (t > 0) forward = t; else backward = -t;
    }
    return { forward: forward, backward: backward };
  }

  // The geometry a pattern or mirror should copy: a pattern's own tool holds only its copies, so when the source
  // is itself a pattern/mirror the seed instance has to be included (recursively) or nested patterns miss it.
  function familyTool(id, model, ctx) {
    var tool = ctx.tools[id];
    var src = findFeature(model, id);
    if (!src || !tool) return tool || null;
    if (src.type === 'lpattern' || src.type === 'cpattern' || (src.type === 'mirror' && !src.body)) {
      var seed = familyTool(src.feature, model, ctx);
      return seed ? seed.union(tool) : tool;
    }
    return tool;
  }

  // rfFN: nonManifoldCount(csg) -> the number of edges of the body's welded, T-junction-split triangle mesh
  // (Exchange.bodyMesh) that more than two triangles share: where a solid touches itself along a line or at a point.
  // 0 when exchange.js is not loaded. Cached on the CSG object (bodies are never changed in place). NM.on switches the
  // rebuild's zero-thickness check (tests).
  var NM = { on: true };
  function nonManifoldCount(body) {
    if (!body || !body.polygons || !body.polygons.length || typeof Exchange === 'undefined' || !Exchange.bodyMesh) return 0;
    if (body._fnNM != null) return body._fnNM;
    var m = Exchange.bodyMesh(body), t = m.triangles, P = m.positions, use = {}, n = 0;
    for (var i = 0; i < t.length; i += 3) {
      for (var k = 0; k < 3; k++) {
        var a = t[i + k], b = t[i + (k + 1) % 3], key = a < b ? a + '_' + b : b + '_' + a;
        use[key] = (use[key] || 0) + 1;
      }
    }
    // a real touch is two sheets through one edge (4, 6 … triangles) along a length that matters; three uses (a crack
    // next to a duplicated sliver) and edges a few 1e-5 long are boolean noise (the vent fillets, stencil bridges, a
    // Normal Cut across a bend) that FL's watertightness work owns, not geometry the user made
    var bb = body.getBounds ? body.getBounds() : null, diag = bb ? Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]) : 1, minL = 1e-3 * diag;
    Object.keys(use).forEach(function (key) {
      if (use[key] < 4) return;
      var ab = key.split('_'), p = +ab[0] * 3, q = +ab[1] * 3;
      if (Math.hypot(P[p] - P[q], P[p + 1] - P[q + 1], P[p + 2] - P[q + 2]) >= minL) n++;
    });
    try { Object.defineProperty(body, '_fnNM', { value: n, enumerable: false, writable: true, configurable: true }); } catch (e) { /* frozen */ }
    return n;
  }
  K.nonManifoldCount = nonManifoldCount;
  K.zeroThicknessCheck = NM;
  // isRefusal(message) -> true for the errors Anvil raises on purpose because the result would be bad geometry
  // (SolidWorks refuses the same features): zero thickness, a cut leaving nothing, a sweep folding back or crossing
  // itself, a 0° revolve, a loft between coplanar profiles or across a neighbour's plane (rfFN2). OpenCascade would build some of them anyway, so
  // ui-occt.js suppresses these features in its copy of the model and keeps their errors (not "Anvil's own limits").
  var REFUSAL = /zero-thickness geometry|would remove all of the material|turns back on itself|sweep would intersect itself|loft would intersect itself|Revolve angle must be greater than zero/;
  K.isRefusal = function (msg) { return REFUSAL.test(String(msg || '')); };

  // rfFN: solidFromProfile (kernel-curves.js) stacks every outline's solid and subtracts every hole from all of them,
  // which loses an island inside a hole (depth 2: SolidWorks extrudes it as a separate solid) and leaves a double
  // internal wall where two outlines share an edge. profileComponents(profile) -> null for the usual profile, else
  // one sub-profile per outline (depth 0, 2, …) with the holes directly inside it, to be built apart and unioned.
  function loopBox(pts) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    pts.forEach(function (p) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); });
    return b;
  }
  function profileComponents(profile) {
    var loops = profile && profile.loops;
    if (!loops || loops.length < 2) return null;
    var solids = loops.filter(function (l) { return !l.hole; });
    if (solids.length < 2) return null;
    var nested = solids.some(function (l) { return (l.depth | 0) >= 2; }), touch = false;
    if (!nested) {
      var boxes = solids.map(function (l) { return loopBox(l.pts); });
      var span = Math.max.apply(null, boxes.map(function (b) { return Math.max(b[2] - b[0], b[3] - b[1]); })), eps = 1e-7 * Math.max(1, span);
      for (var i = 0; i < boxes.length && !touch; i++) for (var j = i + 1; j < boxes.length && !touch; j++) {
        var a = boxes[i], c = boxes[j];
        if (a[0] <= c[2] + eps && c[0] <= a[2] + eps && a[1] <= c[3] + eps && c[1] <= a[3] + eps) touch = true;
      }
    }
    if (!nested && !touch) return null;
    return solids.map(function (s) {
      var d = s.depth | 0;
      var holes = loops.filter(function (h) { return h.hole && (h.depth | 0) === d + 1 && pointInPoly(h.pts[0], s.pts); });
      return { loops: [s].concat(holes), curves: profile.curves, free: profile.free, warnings: [] };
    });
  }
  _.profileComponents = profileComponents;

  // Build the tool body of one feature given a context of previously built tools/planes/sketches.
  function buildTool(f, model, ctx) {
    var sketch, plane;
    switch (f.type) {
      case 'extrude':
      case 'revolve':
        sketch = ctx.sketches[f.sketch] || findFeature(model, f.sketch);
        if (!sketch || sketch.type !== 'sketch') throw new Error('Select a sketch for this feature.');
        plane = resolvePlane(sketch.plane, model, ctx.planes);
        if (!sketch.profile) sketch.profile = sketchProfile(sketch);
        // lane CO: Selected Contours (f.contours = [[u, v], …]) — the profile is the union of the picked regions; the
        // sketch feature keeps its own full profile (contourSketch returns a copy)
        var csk = _.contourSketch(f, sketch);
        if (f.type === 'revolve' && f.angle != null && isFinite(+f.angle) && Math.abs(+f.angle) < 1e-9) throw new Error('Revolve angle must be greater than zero.');   // rfFN (buildRevolve reads 0 as 360)
        if (f.type === 'revolve' && _.refAxisId(f) != null) f = _.revolveOnRefAxis(f, refAxisFor(f, ctx), plane, ctx);   // lane CZ
        var comps = profileComponents(csk.profile);   // rfFN: islands inside holes, outlines that touch
        if (comps) return unionAll(comps.map(function (pr) {
          var sk = {}; Object.keys(csk).forEach(function (k) { sk[k] = csk[k]; }); sk.profile = pr;
          return f.type === 'extrude' ? buildExtrude(f, sk, plane, ctx.throughLimit) : buildRevolve(f, sk, plane);
        }));
        return f.type === 'extrude' ? buildExtrude(f, csk, plane, ctx.throughLimit) : buildRevolve(f, csk, plane);
      case 'sweep': return _.buildSweep(f, model, ctx);
      case 'loft': return _.buildLoft(f, model, ctx);
      case 'draft': return _.buildDraft(f, { body: ctx.body, planes: ctx.planes, units: ctx.units || (model && model.units) }).body;   // rfDX: the drafted body (PropertyManager preview)
      case 'boundary': return _.buildBoundary(f, model, ctx);   // rfFB
      case 'lpattern': {
        var src = familyTool(f.feature, model, ctx);
        if (!src) throw new Error('Pattern source feature has no geometry.');
        var d1 = scale(AXES[f.d1 || 'x'], f.rev1 ? -1 : 1), copies = [];
        var n1 = Math.max(1, f.n1 | 0), n2 = f.d2 ? Math.max(1, f.n2 | 0) : 1;
        var d2 = f.d2 ? scale(AXES[f.d2], f.rev2 ? -1 : 1) : [0, 0, 0];
        for (var i = 0; i < n1; i++) for (var j = 0; j < n2; j++) {
          if (i === 0 && j === 0) continue;
          copies.push(translateBody(src, add(scale(d1, i * (+f.s1 || 0)), scale(d2, j * (+f.s2 || 0)))));
        }
        if (!copies.length) throw new Error('Pattern needs at least 2 instances.');
        return unionAll(copies);
      }
      case 'cpattern': {
        var csrc = familyTool(f.feature, model, ctx);
        if (!csrc) throw new Error('Pattern source feature has no geometry.');
        var count = Math.max(2, f.n | 0), total = +f.angle || 360;
        var step = (f.equal === false) ? total : (Math.abs(total) >= 360 ? total / count : total / (count - 1));
        var ccopies = [];
        var cax = _.refAxisId(f) != null ? refAxisFor(f, ctx) : null;   // lane CZ: about a reference axis
        for (var k = 1; k < count; k++) ccopies.push(rotateBody(csrc, cax ? cax.o : f.center || [0, 0, 0], cax ? cax.d : AXES[f.axis || 'z'], step * k));
        return unionAll(ccopies);
      }
      case 'mirror': {
        var mplane = makePlane(f.plane || 'Right', f.offset || 0);
        if (f.body) {
          if (!ctx.body) throw new Error('No body to mirror yet.');
          return mirrorBody(ctx.body, mplane);
        }
        var msrc = familyTool(f.feature, model, ctx);
        if (!msrc) throw new Error('Mirror source feature has no geometry.');
        return mirrorBody(msrc, mplane);
      }
      default:
        if (featureTypes[f.type] && featureTypes[f.type].build) return featureTypes[f.type].build(f, model, ctx);
    }
    return null;
  }

  // lane DF: a reference Point "Center of Face" on a planar face is the face's exact area centroid (true circles and
  // arcs on its outline, Kernel.faceCentroidExact) rather than its facets' (≈0.004 off beside an 8 mm hole)
  function exactFaceCenter(f, ctx) {
    var g = ctx.planes[f.id], r = f.refs && f.refs[0];
    if (f.type !== 'refpoint' || f.kind !== 'face' || !g || !r || !r.face || !K.faceCentroidExact) return;
    var p = K.faceCentroidExact(ctx.body, r.face, _.pickTol(ctx.units || 'mm'));
    if (p) g.p = p.map(function (x) { var q = Math.round(x * 1e9) / 1e9; return Math.abs(x - q) < 1e-12 ? q + 0 : x; });
  }
  // lane CZ: the resolved reference Axis a feature turns about ({ refgeo: 'axis', o, d, a, b } from ctx.planes)
  function refAxisFor(f, ctx) {
    var id = _.refAxisId(f), g = id != null && ctx.planes ? ctx.planes[id] : null;
    if (!g || g.refgeo !== 'axis') throw new Error('The reference axis (feature ' + id + ') is missing or failed to rebuild.');
    return g;
  }

  // registerFeature(type, spec): a feature type defined in another file. spec is either
  //   { build(f, model, ctx) -> CSG tool, cut: bool, script }  a tool feature, built like any other (holewizard.js: 'hole'), or
  //   { apply(f, state, model) -> { bodies, bodyFeatures, tool }, script }  a feature that sets the body list itself
  //     (exchange.js: 'import'); state is { bodies, bodyFeatures } (copies) and a throw leaves them unchanged.
  // script(f, varName, idVar, optsStr) -> the feature's line in generateScript.
  var featureTypes = {};
  function registerFeature(type, spec) { featureTypes[type] = spec; }
  // registerSketchScript(fn(sketchFeature) -> string): extra builder calls written before a sketch's `.id();` in
  // generateScript (sketch-solver.js: construction, driven dimensions and relations)
  var sketchScripts = [];
  function registerSketchScript(fn) { sketchScripts.push(fn); }
  // registerScriptSection({ head(model) -> [lines], tail(model, idVar) -> [lines] }): document lines generateScript
  // writes right after `p.name(…).units(…);` and after the last feature (materials.js: material, properties, body
  // materials); idVar maps feature ids to their script variables
  var scriptSections = [];
  function registerScriptSection(spec) { scriptSections.push(spec); }

  function isCut(f, model) {
    if (f.type === 'wrap') return f.mode === 'deboss';   // rfDZ: Wrap (emboss adds, scribe splits)
    if (featureTypes[f.type]) return !!featureTypes[f.type].cut;
    if (f.type === 'extrude' || f.type === 'revolve' || f.type === 'sweep' || f.type === 'loft') return !!f.cut;
    if (f.type === 'boundary') return !!f.cut;   // rfFB
    if (f.type === 'mirror' && f.body) return false;
    if (f.type === 'lpattern' || f.type === 'cpattern' || f.type === 'mirror') {
      var src = findFeature(model, f.feature);
      return src ? isCut(src, model) : false;
    }
    return false;
  }

  // Cache key of a feature: its JSON (minus the computed profile) plus the sheet parameters flanges depend on (the
  // thickness and bend radius: the bend allowance method only changes the flat pattern, never the solid).
  // `f` and `model` are the RESOLVED feature and model (resolvedModel), so the key follows the values equations
  // produce: a variable change rebuilds just the features that use it, an equation edit that changes no value
  // reuses the whole cache.
  function featureKey(f, model) {
    var sh = model.sheet ? [model.sheet.thickness, model.sheet.bendRadius] : null;
    // its bend allowance sets how much flat each bend rolls up (sketched bends; and p9-cutbend: a cut crossing a
    // flange's or jog's bend is wrapped round it by BA, so the solid changes with K / BA too)
    if (sh && /^(sketchedBend|flange|jog|hem|unfold|fold)$/.test(f.type)) sh = model.sheet;   // (Unfold / Fold: BA sets the strip)
    if (model.noBends && (f.type === 'insertBends' || f.type === 'convertSM')) sh = [sh, 'noBends'];   // lane DQ: No Bends skips the bends
    return JSON.stringify(f, function (k, v) { return k === 'profile' || k === 'name' ? undefined : v; }) + '|' + JSON.stringify(sh) + '|' + tessKey();
  }

  // ------------------------------------------------------------------ bodies (multi-body parts)
  // A part is a list of separate solid bodies in creation order. `build.body` is still one solid for everything that
  // reads a single CSG (meshing, mass properties, exports, cut direction hints, normal cuts): combineBodies makes it.
  // combineBodies(bodies) -> the combined solid: the body itself for one body, a fresh CSG of every polygon for
  // several, null for none. Every polygon of the result carries `polygon.body` (its body index). A lone body is
  // tagged in place (its index is always 0, so the tag never goes stale); with several bodies the polygons are cloned
  // first, so a body that changes index later (a cut swallowed the one before it) keeps no wrong tag behind.
  function combineBodies(bodies) {
    if (!bodies || !bodies.length) return null;
    var i, j;
    if (bodies.length === 1) {
      var ps = bodies[0].polygons;
      for (i = 0; i < ps.length; i++) ps[i].body = 0;
      return bodies[0];
    }
    var polys = [];
    for (i = 0; i < bodies.length; i++) {
      var src = bodies[i].polygons;
      for (j = 0; j < src.length; j++) { var p = src[j].clone(); p.body = i; polys.push(p); }
    }
    return CSG.fromPolygons(polys);
  }
  // bodyNearPoint(bodies, p) -> index of the body with a polygon edge nearest to p (-1 for no bodies): how a feature
  // that was picked on a face or an edge (shell, fillet, chamfer, flange, jog) finds the body it belongs to. Edge
  // segments, not vertices: a pick in the middle of a long edge must not resolve to another body whose hole vertex
  // happens to be closer than this edge's ends.
  function bodyNearPoint(bodies, p) {
    var best = -1, bestD = Infinity;
    if (!bodies || !p) return best;
    var px = p[0], py = p[1], pz = p[2];
    for (var i = 0; i < bodies.length; i++) {
      var polys = bodies[i].polygons;
      for (var j = 0; j < polys.length; j++) {
        var vs = polys[j].vertices, n = vs.length;
        for (var k = 0; k < n; k++) {
          var a = vs[k].pos, b = vs[(k + 1) % n].pos;
          var ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z, l2 = ex * ex + ey * ey + ez * ez;
          var t = l2 > 1e-24 ? ((px - a.x) * ex + (py - a.y) * ey + (pz - a.z) * ez) / l2 : 0;
          if (t < 0) t = 0; else if (t > 1) t = 1;
          var dx = a.x + ex * t - px, dy = a.y + ey * t - py, dz = a.z + ez * t - pz, d = dx * dx + dy * dy + dz * dz;
          if (d < bestD) { bestD = d; best = i; }
        }
      }
    }
    return best;
  }
  // bodyInfo(build, model) -> [{ index, featureId, name, volume }] for the FeatureManager's Solid Bodies folder:
  // `name` is the creating feature's name (Body<n> when the feature is gone), `volume` the body's own volume.
  function bodyInfo(build, model) {
    var bodies = build && build.bodies ? build.bodies : (build && build.body ? [build.body] : []);
    return bodies.map(function (b, i) {
      var fid = build.bodyFeatures && build.bodyFeatures[i] != null ? build.bodyFeatures[i] : null;
      var f = fid != null && model ? findFeature(model, fid) : null;
      return { index: i, featureId: fid, name: f && f.name ? f.name : 'Body' + (i + 1), volume: b.volume() };
    });
  }
  // True when two bounding boxes overlap or touch (within the CSG classification tolerance plus a hair of the extent),
  // the merge test for a boss: a tool whose box meets a body's box is unioned with it, as one body always was.
  function boundsMeet(a, b) {
    if (!a || !b) return false;
    var ext = 0;
    for (var k = 0; k < 3; k++) ext = Math.max(ext, Math.max(a.max[k], b.max[k]) - Math.min(a.min[k], b.min[k]));
    var eps = 1e-5 + 1e-9 * ext;
    return a.min[0] <= b.max[0] + eps && a.max[0] >= b.min[0] - eps &&
      a.min[1] <= b.max[1] + eps && a.max[1] >= b.min[1] - eps &&
      a.min[2] <= b.max[2] + eps && a.max[2] >= b.min[2] - eps;
  }
  // The body indices a cut feature acts on: its `bodies` list (out-of-range entries dropped), or every body.
  function cutScope(f, count) {
    var out = [];
    if (Array.isArray(f.bodies) && f.bodies.length) {
      f.bodies.forEach(function (i) { i = i | 0; if (i >= 0 && i < count && out.indexOf(i) < 0) out.push(i); });
      return out;
    }
    for (var i = 0; i < count; i++) out.push(i);
    return out;
  }

  // rebuild(model, cache): `cache` is the `cache` of a previous build; the longest prefix of features whose keys are
  // unchanged is restored from it (bodies are immutable, so the snapshots are just references) and only the rest is
  // rebuilt. The result carries a fresh `cache` and `reused` (number of features taken from the cache).
  // The context keeps the body list (`ctx.bodies`, `ctx.bodyFeatures`: the id of the feature that started each body)
  // and, after every feature, `ctx.body` = combineBodies(ctx.bodies) for the code that reads one solid. A boss
  // unions with every body whose bounding box its own meets (those collapse into the lowest-indexed one) or starts a
  // new body when none does, or always starts one with `merge: false`; a cut subtracts from every body in its scope
  // (`bodies`, or all) and drops a body it empties; shell, fillet, chamfer, flange and jog act on the body nearest
  // their first pick point.
  // Equations: the variables are resolved once (build.equations, build.equationErrors) and every feature is built
  // from its resolved copy (resolvedModel); a feature whose expression fails gets that message as its error and
  // leaves the body alone. The original model is never changed apart from the sketch profiles it always received.
  // A model may carry its own tessellation (model.tessellation = { chordTol?, minSegs?, maxSegs?, legacy? }, the
  // document's image quality): it is in force for the rebuild and the global setting comes back afterwards.
  function withModelTess(model, fn) {
    // r15/inches15: an inch document with no Image Quality of its own builds at the mm default scaled to inches
    // (0.002 in ≈ 0.05 mm), not at 0.05 in, which would leave a Ø1 in circle 16-sided
    var tess = model && (model.tessellation || (model.units === 'in' ? { chordTol: 0.002 } : null));
    if (!tess) return fn();
    var saved = { chordTol: TESS.chordTol, minSegs: TESS.minSegs, maxSegs: TESS.maxSegs, maxAngle: TESS.maxAngle, legacy: TESS.legacy };
    try { setTessellation(tess); return fn(); } finally { TESS.chordTol = saved.chordTol; TESS.minSegs = saved.minSegs; TESS.maxSegs = saved.maxSegs; TESS.maxAngle = saved.maxAngle; TESS.legacy = saved.legacy; }
  }
  function rebuild(model, cache) { return withModelTess(model, function () { return rebuildModel(model, cache); }); }
  // lane DC (finding #10): Cut-Extrude's "Link to thickness" in a sheet part: a feature with linkT: true is a blind cut
  // whose depth is the sheet's thickness, whatever depth it stores (the PM stores T too, for the other kernel). On the
  // RESOLVED model; the features it changes are copies.
  function linkThickness(model) {
    var T = model.sheet ? +model.sheet.thickness : NaN;
    if (!(T > 0) || !model.features.some(function (f) { return f.linkT; })) return model;
    model.features = model.features.map(function (f) {
      if (!f.linkT || f.type !== 'extrude') return f;
      var c = {};
      Object.keys(f).forEach(function (k) { c[k] = f[k]; });
      c.depth = T; c.end = 'blind';
      return c;
    });
    return model;
  }
  _.linkThickness = linkThickness;
  function rebuildModel(model, cache) {
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var errors = {}, warnings = {}, facePlanes = {};
    var origFeatures = model.features, resolved = resolvedModel(model);
    model = linkThickness(resolved.model);
    var resolveErrors = resolved.featureErrors, sheetError = resolved.sheetError;
    function needsSheet(f) { return f.type === 'flange' || f.type === 'jog' || f.type === 'closedCorner' || f.type === 'unfold' || f.type === 'fold' || f.sheetBase || (f.cut && f.normalCut); }
    var ctx = { tools: {}, planes: {}, sketches: {}, flanges: {}, body: null, bodies: [], bodyFeatures: [], warnings: warnings, units: model.units || 'mm' };   // units: pick tolerances (Kernel.pickTol)
    ctx.errors = errors; ctx.unfold = null;   // lane DB: Unfold's state (in memory only: the steps carry it) until its Fold
    function syncBody() { ctx.body = combineBodies(ctx.bodies); }
    // a boss tool joins the part: merged into the bodies it meets, or appended as a new body
    function addBoss(tool, f) {
      if (f.merge !== false) {
        var tb = tool.getBounds(), hit = [];
        ctx.bodies.forEach(function (b, i) { if (boundsMeet(b.getBounds(), tb)) hit.push(i); });
        if (hit.length) {
          var merged = ctx.bodies[hit[0]].union(tool);
          for (var h = 1; h < hit.length; h++) merged = merged.union(ctx.bodies[hit[h]]);
          ctx.bodies[hit[0]] = merged;
          for (h = hit.length - 1; h >= 1; h--) { ctx.bodies.splice(hit[h], 1); ctx.bodyFeatures.splice(hit[h], 1); }
          syncBody();
          return;
        }
      }
      ctx.bodies.push(tool);
      ctx.bodyFeatures.push(f.id);
      syncBody();
    }
    // a cut tool is taken out of every body in the feature's scope; a body it empties leaves the list
    function applyCut(tool, f) {
      if (!ctx.bodies.length) throw new Error('Nothing to cut yet.');
      var scope = cutScope(f, ctx.bodies.length), changed = false;
      for (var s = scope.length - 1; s >= 0; s--) {
        var i = scope[s], b = ctx.bodies[i], volBefore = b.volume();
        var nb = b.subtract(tool), vol = nb.polygons.length ? nb.volume() : 0;
        if (Math.abs(vol - volBefore) >= 1e-6) changed = true;
        if (!nb.polygons.length || vol < 1e-9) { ctx.bodies.splice(i, 1); ctx.bodyFeatures.splice(i, 1); }
        else ctx.bodies[i] = nb;
      }
      // rfFN (decided 2026-10-29): an empty cut stays a warning, not SolidWorks' error. The script API's default cut
      // direction is +normal (SolidWorks cuts into the face it is sketched on), so many saved parts carry forward cuts
      // that miss (features.js, the Mirrored clevis example's cross hole, rfFG's WHEEL …); failing them would turn
      // working parts red. Revisit together with the default direction.
      if (!changed) warnings[f.id] = (warnings[f.id] ? warnings[f.id] + ' ' : '') + 'Cut removed no material. Try "Reverse direction".';
      // rfFN: a cut that takes away every body would blank the part; it fails instead and the part before it stays
      if (!ctx.bodies.length) throw new Error('This cut would remove all of the material: nothing would be left of the part.');
      syncBody();
    }
    // the body a face- or edge-picked feature works on: the one nearest its first pick (body 0 without a pick);
    // ctx.body is pointed at it for the builder, and the result goes back into the same slot with putBody
    function pickBody(f) {
      if (!ctx.bodies.length) { ctx.body = null; return -1; }
      var at = (f.edges && f.edges[0] && f.edges[0].at) || (f.faces && f.faces[0] && f.faces[0].at) || null;
      var k = at ? bodyNearPoint(ctx.bodies, at) : 0;
      if (k < 0) k = 0;
      ctx.body = ctx.bodies[k];
      return k;
    }
    function putBody(k, body) {
      if (k < 0) return;
      ctx.bodies[k] = body;
      syncBody();
    }
    // rfFN: a feature built from a feature that failed (a pattern of a failed cut, a loft through a sketch whose
    // feature failed) fails with a message that names the parent, as SolidWorks flags the children of a failed feature
    function parentFailed(f) {
      var ids = K.featureParents ? K.featureParents(f) : [];
      for (var i = 0; i < ids.length; i++) {
        if (!errors[ids[i]]) continue;
        var pf = findFeature(model, ids[i]);
        throw new Error('The parent feature ' + ((pf && pf.name) || ('#' + ids[i])) + ' failed to rebuild. Fix it first.');
      }
    }
    // rfFN: a boss, cut or pattern whose result touches itself along an edge or at a single point (tangent holes in a
    // pattern, two blocks sharing only an edge) is zero-thickness geometry; SolidWorks refuses the feature. Counted on
    // the bodies the feature changed (an edge shared by more than two triangles of the welded mesh), against the bodies
    // they came from so a part that was already like that does not fail every later feature.
    function zeroThickness(before) {
      if (!NM.on || model.sheet) return;   // never on sheet metal (bends, reliefs and Normal Cuts are FL's / sheet metal's)
      var changed = ctx.bodies.filter(function (b) { return before.indexOf(b) < 0; });
      if (!changed.length) return;
      var gone = before.filter(function (b) { return ctx.bodies.indexOf(b) < 0; });
      var nAfter = 0, nBefore = 0;
      changed.forEach(function (b) { nAfter += nonManifoldCount(b); });
      if (!nAfter) return;
      gone.forEach(function (b) { nBefore += nonManifoldCount(b); });
      if (nAfter > nBefore) throw new Error('This feature would create zero-thickness geometry: the solid would touch itself along an edge or at a point. Change its size or position so the pieces overlap or stay apart.');
    }
    // sketches used as sweep paths are open by design: no "open contour" warning for them
    var pathIds = {};
    model.features.forEach(function (f) { if (f.type === 'sweep' && typeof f.path === 'number') pathIds[f.path] = true; });
    model.features.forEach(function (f) { if (f.type === 'sketchedBend' && typeof f.sketch === 'number') pathIds[f.sketch] = true; });   // bend lines are open too
    model.features.forEach(function (f) { if (f.type === 'jog' && typeof f.sketch === 'number') pathIds[f.sketch] = true; });   // lane DC: a jog's line
    model.features.forEach(function (f) { if (f.type === 'projCurve' || f.type === 'compositeCurve') { pathIds[f.sketch] = pathIds[f.sketch2] = true; (f.edges || []).forEach(function (r) { if (r && r.sketch != null) pathIds[r.sketch] = true; }); } });   // rfFA: curves from open sketches
    model.features.forEach(function (f) { if (f.type === 'flange' && f.miterFlange && typeof f.sketch === 'number') pathIds[f.sketch] = true; });   // lane DL: a miter flange's profile
    model.features.forEach(function (f) { if (f.type === 'rib' && typeof f.sketch === 'number') pathIds[f.sketch] = true; });   // rfDY: a rib's open lines
    model.features.forEach(function (f) { if (f.type === 'boundary') (f.dir2 || []).forEach(function (c) { var id = c && typeof c === 'object' ? c.sketch : c; if (typeof id === 'number') pathIds[id] = true; }); });   // rfFB: Direction 2 curves are open
    var keys = model.features.map(function (f) { return featureKey(f, model); });
    var prev = cache && cache.steps ? cache.steps : [], steps = [], p = 0;
    while (p < model.features.length && p < prev.length && prev[p].key === keys[p]) p++;
    // a cache made from a finished build (cacheFromBuild) only knows the final body: a partial step cannot hand over
    // ctx.body, so the prefix ends at the last step that carries one (all of them, or none, for such a cache)
    while (p > 0 && prev[p - 1].partial) p--;
    // lane DB: a Fold needs its Unfold's state, which only an in-memory step carries (not a cache made from a build)
    if (p > 0 && p < model.features.length && !('unfold' in prev[p - 1]) && model.features.slice(0, p).some(function (f) { return f.type === 'unfold'; })) p = 0;
    for (var i = 0; i < p; i++) {
      var st = prev[i], pf = model.features[i];
      if (st.error) errors[pf.id] = st.error;
      if (st.warning) warnings[pf.id] = st.warning;
      if (st.tool) ctx.tools[pf.id] = st.tool;
      if (st.plane) ctx.planes[pf.id] = st.plane;
      if (st.flange) ctx.flanges[pf.id] = st.flange;
      if (pf.type === 'sketch') { pf.profile = st.profile; origFeatures[i].profile = st.profile; ctx.sketches[pf.id] = pf; if (pf.plane && pf.plane.face) facePlanes[pf.id] = pf.plane; }
      // a step made before bodies were kept apart carries just the combined solid: it is the one body
      ctx.bodies = (st.bodies || (st.body ? [st.body] : [])).slice();
      ctx.bodyFeatures = (st.bodyFeatures || ctx.bodies.map(function () { return null; })).slice();
      ctx.body = st.body || null;
      ctx.unfold = st.unfold || null;
      steps.push(st);
    }
    model.features.slice(p).forEach(function (f, j) {
      // rfFN: the bodies before the feature; a feature that throws leaves them exactly as they were (a cut that fails
      // half way through its scope, a pattern that would make zero-thickness geometry), so the rest of the tree builds
      var saveBodies = ctx.bodies.slice(), saveBodyFeatures = ctx.bodyFeatures.slice();
      try {
        if (resolveErrors[f.id] && !f.suppressed) throw new Error(resolveErrors[f.id]);
        if (sheetError && needsSheet(f) && !f.suppressed) throw new Error(sheetError);
        if (!f.suppressed && f.type !== 'sketch') parentFailed(f);
        if (!f.suppressed) switch (f.type) {   // rfFC: a suppressed feature (and its children) builds nothing
          case 'flange': {
            var fk = pickBody(f);
            var ft = _.buildFlange(f, model, ctx);
            ctx.tools[f.id] = ft;
            var fb = ctx.flangeCut ? ctx.body.subtract(ctx.flangeCut) : ctx.body;
            putBody(fk, fb.union(ft));
            break;
          }
          case 'jog': {
            if (f.sketch != null) {
              // lane DC: Jog from a sketch line (kernel-sheetmetal.js buildSketchJog): two Sketched Bends, the part replaced
              var sjk = ctx.bodies.length ? Math.max(0, bodyNearPoint(ctx.bodies, _.sketchedBendPoint(f, model, ctx))) : -1;
              ctx.body = sjk >= 0 ? ctx.bodies[sjk] : null;
              var sj = _.buildSketchJog(f, model, ctx);
              putBody(sjk, sj.body);
              ctx.tools[f.id] = sj.tool;
              break;
            }
            var jk = pickBody(f);
            var jg = _.buildJog(f, model, ctx);
            var jb = ctx.flangeCut ? ctx.body.subtract(ctx.flangeCut) : ctx.body;
            putBody(jk, jb.union(jg.first).union(jg.second));
            ctx.tools[f.id] = jg.first.union(jg.second);
            break;
          }
          case 'sketchedBend': {
            // Sketched Bend: acts on the body nearest its first bend line and replaces it with the bent part
            if (sheetError) throw new Error(sheetError);
            var sbk = ctx.bodies.length ? Math.max(0, bodyNearPoint(ctx.bodies, _.sketchedBendPoint(f, model, ctx))) : -1;
            ctx.body = sbk >= 0 ? ctx.bodies[sbk] : null;
            var sb = _.buildSketchedBend(f, model, ctx);
            putBody(sbk, sb.body);
            ctx.tools[f.id] = sb.tool;
            break;
          }
          case 'closedCorner': {
            // Closed Corner (kernel-sheetmetal.js): extends flange end faces across a corner gap; overlap / underlap
            // also trim the matching wall. Acts on the body nearest its first face pick.
            var cck = ctx.bodies.length ? Math.max(0, bodyNearPoint(ctx.bodies, (f.faces && f.faces[0]) || [0, 0, 0])) : -1;
            ctx.body = cck >= 0 ? ctx.bodies[cck] : null;
            var ccr = _.buildClosedCorner(f, model, ctx);
            putBody(cck, (ccr.cut ? ctx.body.subtract(ccr.cut) : ctx.body).union(ccr.add));
            ctx.tools[f.id] = ccr.add;
            break;
          }
          case 'insertBends':
          case 'convertSM': {
            // lane DQ: Insert Bends / Convert to Sheet Metal (kernel-sheetmetal.js buildInsertBends): the part nearest the
            // fixed face is replaced by its bent version; edge-flange records for the flat
            var ibk = ctx.bodies.length ? Math.max(0, f.fixedFace ? bodyNearPoint(ctx.bodies, f.fixedFace) : 0) : -1;
            ctx.body = ibk >= 0 ? ctx.bodies[ibk] : null;
            var ibr = _.buildInsertBends(f, model, ctx);
            putBody(ibk, ibr.body);
            ctx.flanges[f.id] = ibr.info;
            ctx.tools[f.id] = null;
            break;
          }
          case 'unfold':
          case 'fold': {
            // lane DB: Unfold / Fold (kernel-sheetmetal.js) act on the body nearest the fixed face (Fold: the one Unfold made)
            var uat = f.type === 'unfold' ? f.fixedFace || (ctx.unfold && ctx.unfold.fixedFace) : (ctx.unfold && ctx.unfold.fixedFace);   // (lane DJ: a second Unfold)
            var ufk = ctx.bodies.length ? Math.max(0, uat ? bodyNearPoint(ctx.bodies, uat) : 0) : -1;
            ctx.body = ufk >= 0 ? ctx.bodies[ufk] : null;
            var ufr = f.type === 'unfold' ? _.buildUnfold(f, model, ctx) : _.buildFold(f, model, ctx);
            putBody(ufk, ufr.body);
            ctx.unfold = ufr.state;
            ctx.flanges[f.id] = ufr.recs;
            ctx.tools[f.id] = ufr.cut || null;
            break;
          }
          case 'sketch': {
            // r10/facesketch10: a sketch on a face follows the face; the resolved frame is written onto the model's
            // own feature (as the profile is) and reported in build.facePlanes for a build made on a copy
            var fp = resolveFacePlane(f, model, ctx.planes, function () { return bodyPlanes(ctx.body); });
            if (fp) {
              if (fp.plane !== f.plane) { f.plane = fp.plane; origFeatures[p + j].plane = fp.plane; keys[p + j] = featureKey(f, model); }
              facePlanes[f.id] = f.plane;
            }
            f.profile = sketchProfile(f);
            origFeatures[p + j].profile = f.profile; // the UI reads profiles off the model's own feature objects
            ctx.sketches[f.id] = f;
            if (f.profile.warnings.length && !pathIds[f.id]) warnings[f.id] = f.profile.warnings.join(' ');
            if (fp && fp.warning) warnings[f.id] = fp.warning + (warnings[f.id] ? ' ' + warnings[f.id] : '');
            break;
          }
          case 'wrap': { var wk = ctx.bodies.length ? Math.max(0, bodyNearPoint(ctx.bodies, f.face || [0, 0, 0])) : -1; ctx.body = wk >= 0 ? ctx.bodies[wk] : null; var wr = _.buildWrap(f, model, ctx); putBody(wk, wr.body); ctx.tools[f.id] = wr.tool; break; }   // rfDZ: Wrap on the body its face is on
          case 'shell': {
            var sk = pickBody(f);
            var sh = _.buildShell(f, ctx);
            putBody(sk, sh.body);
            ctx.tools[f.id] = null;   // the cavity is not built during a rebuild (buildShell: sh.inner is lazy)
            break;
          }
          case 'draft': { var dxk = pickBody(f), dxr = _.buildDraft(f, ctx); putBody(dxk, dxr.body); ctx.tools[f.id] = null; break; }   // rfDX
          case 'plane':
            ctx.planes[f.id] = makePlane(f.ref || 'Front', +f.offset || 0);
            break;
          case 'intersect': _.applyIntersect(f, model, ctx); syncBody(); break;   // rfDY (kernel-features.js)
          case 'helix': case 'projCurve': case 'compositeCurve': case 'xyzCurve': case 'refPtCurve': ctx.planes[f.id] = _.resolveCurve(f, model, ctx); break;   // rfFA: reference curves, no body change
          case 'refaxis': case 'refpoint': case 'csys':   // lane CZ: reference geometry, no body change; the record rides in planes
            ctx.planes[f.id] = _.resolveRefGeo(f, model, ctx);
            exactFaceCenter(f, ctx);   // lane DF
            break;
          case 'chamfer':
          case 'fillet': {
            var ek = pickBody(f);
            var r = buildEdgeFeature(f, ctx);
            var eb = ctx.body;
            if (r.cut) eb = eb.subtract(r.cut);
            if (r.add) eb = eb.union(r.add);
            putBody(ek, eb);
            ctx.tools[f.id] = r.cut || r.add;
            break;
          }
          default: {
            if (featureTypes[f.type] && featureTypes[f.type].apply) {
              var ar = featureTypes[f.type].apply(f, { bodies: ctx.bodies.slice(), bodyFeatures: ctx.bodyFeatures.slice() }, model);
              ctx.bodies = ar.bodies; ctx.bodyFeatures = ar.bodyFeatures;
              ctx.tools[f.id] = ar.tool || null;
              syncBody();
              break;
            }
            // lane DI: a Tab (Base Flange/Tab on an existing sheet) is extruded T into the sheet face it is sketched on
            if (f.type === 'extrude' && f.tab && !f.cut) { var tbs = ctx.sketches[f.sketch] || findFeature(model, f.sketch); if (tbs) f = _.tabFeature(f, model, resolvePlane(tbs.plane, model, ctx.planes), ctx.body); }
            var tool = buildTool(f, model, ctx);
            if (!tool) break;
            var cut = isCut(f, model);
            if (cut && f.type === 'extrude' && f.normalCut && model.sheet && ctx.body) {
              // Normal Cut: swap the tool for a prism normal to the sheet (see normalCutTool); the swapped tool is
              // what the cache and the packed build carry
              var ncs = ctx.sketches[f.sketch] || findFeature(model, f.sketch);
              var ncp = resolvePlane(ncs.plane, model, ctx.planes);
              var ncDir = (f.dir2 || f.end === 'mid') ? null : (f.reverse ? scale(ncp.n, -1) : ncp.n.slice());
              var nct = _.normalCutTool(tool, ctx.body, model, ncDir);
              if (nct === tool) warnings[f.id] = (warnings[f.id] ? warnings[f.id] + ' ' : '') + 'Normal cut: the cut does not cross a sheet face; a plain cut was made.';
              tool = nct;
            }
            ctx.tools[f.id] = tool;
            if (cut) applyCut(tool, f); else addBoss(tool, f);
            zeroThickness(saveBodies);
          }
        }
      } catch (e) {
        errors[f.id] = e.message || String(e);
        ctx.bodies = saveBodies; ctx.bodyFeatures = saveBodyFeatures;
        syncBody(); // a failed pick-based feature may have left ctx.body pointing at one body
      }
      steps.push({ key: keys[p + j], body: ctx.body, bodies: ctx.bodies.slice(), bodyFeatures: ctx.bodyFeatures.slice(), tool: ctx.tools[f.id] || null, plane: ctx.planes[f.id] || null, flange: ctx.flanges[f.id] || null, profile: f.profile || null, error: errors[f.id] || null, warning: warnings[f.id] || null, unfold: ctx.unfold });
    });
    var t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    // profiles: the computed profile of every sketch, by feature id, so a build made on a copy of the model (a worker)
    // can hand them back to the original with applyProfiles
    var profiles = {};
    Object.keys(ctx.sketches).forEach(function (id) { profiles[id] = ctx.sketches[id].profile || null; });
    return { body: ctx.body, bodies: ctx.bodies, bodyFeatures: ctx.bodyFeatures, tools: ctx.tools, planes: ctx.planes, flanges: ctx.flanges, errors: errors, warnings: warnings, time: t1 - t0, cache: { steps: steps }, reused: p, profiles: profiles, facePlanes: facePlanes,
      equations: resolved.vars, equationErrors: resolved.errors, configuration: resolved.configuration, suppressed: resolved.suppressed || {} };
  }

  // ------------------------------------------------------------------ build serialization (Web Worker rebuilds)
  // packBuild(build, model?) -> a structured-clone-safe copy of a rebuild result without its cache:
  //   { bodies: [packedCSG], bodyFeatures: [featureId | null], body: packedCSG | null, tools: { featureId: packedCSG | null },
  //     planes, flanges, errors, warnings, time, reused, profiles: { sketchFeatureId: profile } }
  // planes (makePlane frames), flanges (flange info records), errors, warnings and profiles are plain JSON already; the
  // solids are packed with CSG.prototype.pack (typed arrays). The separate bodies are what travels; `body` (the
  // combined solid) is packed only for a build that has no body list, since unpackBuild recombines the bodies.
  // `model` is only consulted for profiles when the build predates the `profiles` field.
  function packBuild(build, model) {
    var tools = {};
    Object.keys(build.tools || {}).forEach(function (id) { tools[id] = build.tools[id] ? build.tools[id].pack() : null; });
    var profiles = build.profiles;
    if (!profiles) {
      profiles = {};
      if (model) model.features.forEach(function (f) { if (f.type === 'sketch') profiles[f.id] = f.profile || null; });
    }
    var bodies = build.bodies || [];
    return {
      bodies: bodies.map(function (b) { return b.pack(); }),
      bodyFeatures: bodies.map(function (b, i) { return build.bodyFeatures && build.bodyFeatures[i] != null ? build.bodyFeatures[i] : null; }),
      body: !bodies.length && build.body ? build.body.pack() : null, tools: tools,
      planes: build.planes || {}, flanges: build.flanges || {}, errors: build.errors || {}, warnings: build.warnings || {},
      time: build.time || 0, reused: build.reused || 0, profiles: profiles, facePlanes: build.facePlanes || {},
      equations: build.equations || {}, equationErrors: build.equationErrors || {}, configuration: build.configuration || null, suppressed: build.suppressed || {}
    };
  }
  // Every ArrayBuffer of a packed build (bodies, body and tools), for postMessage's transfer list. pack() allocates
  // fresh arrays per call, so no buffer appears twice even when a tool and a body are the same solid.
  function packTransferables(packed) {
    var out = [];
    (packed.bodies || []).forEach(function (b) { out = out.concat(CSG.packTransferables(b)); });
    if (packed.body) out = out.concat(CSG.packTransferables(packed.body));
    Object.keys(packed.tools || {}).forEach(function (id) { if (packed.tools[id]) out = out.concat(CSG.packTransferables(packed.tools[id])); });
    return out;
  }
  // unpackBuild(obj) -> an object shaped like a rebuild result (meshFromBody, massProps, faceOutline, flatPattern and
  // the exports all work on it) with `cache: null`, since the cache stays where the build was made. The bodies are
  // unpacked and `body` recombined from them (face tags included); a packed `body` alone (an older message) is the
  // one body.
  function unpackBuild(obj) {
    var tools = {};
    Object.keys(obj.tools || {}).forEach(function (id) { tools[id] = obj.tools[id] ? CSG.unpack(obj.tools[id]) : null; });
    var bodies = (obj.bodies || []).map(function (b) { return CSG.unpack(b); });
    if (!bodies.length && obj.body) bodies = [CSG.unpack(obj.body)];
    var bodyFeatures = bodies.map(function (b, i) { return obj.bodyFeatures && obj.bodyFeatures[i] != null ? obj.bodyFeatures[i] : null; });
    return {
      body: combineBodies(bodies), bodies: bodies, bodyFeatures: bodyFeatures, tools: tools,
      planes: obj.planes || {}, flanges: obj.flanges || {}, errors: obj.errors || {}, warnings: obj.warnings || {},
      time: obj.time || 0, reused: obj.reused || 0, profiles: obj.profiles || {}, facePlanes: obj.facePlanes || {}, cache: null,
      equations: obj.equations || {}, equationErrors: obj.equationErrors || {}, configuration: obj.configuration || null, suppressed: obj.suppressed || {}
    };
  }
  // Write the profiles a build computed (build.profiles, keyed by sketch feature id) onto the model's sketch features.
  // Other features are left alone; a sketch the build did not see (or recorded as null) keeps its profile.
  // facePlanes (build.facePlanes, r10/facesketch10): the frames the build resolved for sketches on faces, written
  // onto those sketches the same way
  function applyProfiles(model, profiles, facePlanes) {
    if (!profiles && !facePlanes) return model;
    model.features.forEach(function (f) {
      if (f.type === 'sketch' && profiles && profiles[f.id]) f.profile = profiles[f.id];
      if (f.type === 'sketch' && facePlanes && facePlanes[f.id] && f.plane && f.plane.face) f.plane = facePlanes[f.id];
    });
    return model;
  }
  // bodyPlanes(body) -> [{ n, w, feature }]: one entry per distinct (plane, feature) of a solid's polygons, the
  // candidate faces of a 'geom' face reference (resolveFacePlane)
  function bodyPlanes(body) {
    var out = [], seen = {};
    if (!body || !body.polygons) return out;
    body.polygons.forEach(function (p) {
      var pl = p.plane, k = [Math.round(pl.normal.x * 1e6), Math.round(pl.normal.y * 1e6), Math.round(pl.normal.z * 1e6), Math.round(pl.w * 1e6), p.shared].join('|');
      if (seen[k]) return;
      seen[k] = true;
      out.push({ n: [pl.normal.x, pl.normal.y, pl.normal.z], w: pl.w, feature: p.shared });
    });
    return out;
  }
  // cacheFromBuild(model, build) -> a rebuild cache ({ steps }) made from a finished build of `model` (typically an
  // unpacked worker build, whose own cache stayed in the worker). A build keeps only the final body, so every step
  // but the last is `partial` (tool, plane, flange, profile and messages, but no body); rebuild then reuses the
  // whole cache for an unchanged or appended model and starts over for a change anywhere in the middle.
  function cacheFromBuild(model, build) { return withModelTess(model, function () { return cacheFromBuildModel(model, build); }); }
  function cacheFromBuildModel(model, build) {
    model = linkThickness(resolvedModel(model).model); // keys come from the resolved features, as rebuild makes them
    var n = model.features.length;
    var steps = model.features.map(function (f, i) {
      var st = { key: featureKey(f, model), tool: (build.tools && build.tools[f.id]) || null, plane: (build.planes && build.planes[f.id]) || null,
        flange: (build.flanges && build.flanges[f.id]) || null, profile: (build.profiles && build.profiles[f.id]) || f.profile || null,
        error: (build.errors && build.errors[f.id]) || null, warning: (build.warnings && build.warnings[f.id]) || null };
      if (i === n - 1) {
        st.body = build.body || null;
        st.bodies = (build.bodies || (build.body ? [build.body] : [])).slice();
        st.bodyFeatures = st.bodies.map(function (b, k) { return build.bodyFeatures && build.bodyFeatures[k] != null ? build.bodyFeatures[k] : null; });
      } else st.partial = true;
      return st;
    });
    return { steps: steps };
  }


  // ------------------------------------------------------------------ rfFC2: Suppress with its children (UI and scripts)
  // SolidWorks' Suppress takes a feature's children with it, each stored suppressed: the features that reference it by
  // id (Kernel.featureChildren) and the features whose face / edge picks lie on faces it made (the part rebuilt once on
  // a copy where it is unsuppressed; each pick tested against the solid before that feature, polygon.shared).
  // the face / edge / face-list picks of a feature: [[x, y, z]]
  function suppressPickPoints(g) {
    var pts = [];
    function pt(a) { if (Array.isArray(a) && a.length === 3 && a.every(function (n) { return typeof n === 'number' && isFinite(n); })) pts.push(a); }
    ['edges', 'faces', 'ripEdges', 'bendEdges', 'bends'].forEach(function (k) { if (Array.isArray(g[k])) g[k].forEach(function (e) { if (Array.isArray(e)) pt(e); else if (e && e.at) pt(e.at); }); });
    pt(g.fixedFace);
    return pts;
  }
  // the feature ids (polygon.shared) of the body's faces through point p
  function sharedAt(body, p, tol) {
    var out = {};
    (body && body.polygons || []).forEach(function (poly) {
      var n = poly.plane.normal, d = n.x * p[0] + n.y * p[1] + n.z * p[2] - poly.plane.w;
      if (Math.abs(d) > tol || poly.shared == null) return;
      var vs = poly.vertices, inside = true;
      for (var i = 0; i < vs.length && inside; i++) {
        var a = vs[i].pos, b = vs[(i + 1) % vs.length].pos;
        var ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z, px = p[0] - a.x, py = p[1] - a.y, pz = p[2] - a.z;
        var cx = ey * pz - ez * py, cy = ez * px - ex * pz, cz = ex * py - ey * px;
        var l = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1;
        if ((cx * n.x + cy * n.y + cz * n.z) / l < -tol) inside = false;
      }
      if (inside) out[poly.shared] = true;
    });
    return out;
  }
  // suppressionChildren(model, ids, scope?) -> the ids (not in ids) that depend on them, by id or by a pick on their faces
  function suppressionChildren(model, ids, scope) {
    ids = (Array.isArray(ids) ? ids : [ids]).map(Number);
    var copy = JSON.parse(JSON.stringify(model, function (k, v) { return k === 'profile' ? undefined : v; }));
    K.setSuppressed(copy, ids, false, scope || 'all');
    var set = {}, out = [];
    ids.forEach(function (id) { set[id] = true; });
    function addKids(id) { K.featureChildren(copy, id).forEach(function (k) { if (!set[k]) { set[k] = true; out.push(k); } }); }
    ids.forEach(addKids);
    var idx = ids.map(function (id) { for (var i = 0; i < copy.features.length; i++) if (copy.features[i].id === id) return i; return -1; }).filter(function (i) { return i >= 0; });
    if (!idx.length) return out;
    var first = Math.min.apply(null, idx);
    if (!copy.features.slice(first + 1).some(function (g) { return !set[g.id] && suppressPickPoints(g).length; })) return out;
    var b;
    try { b = rebuild(copy); } catch (e) { return out; }
    var steps = (b.cache && b.cache.steps) || [], tol = K.pickTol ? K.pickTol(copy.units || 'mm') * 0.02 : 1e-3;
    copy.features.forEach(function (g, gi) {
      if (gi <= first || set[g.id]) return;
      var pts = suppressPickPoints(g), before = steps[gi - 1] ? steps[gi - 1].body : null;
      if (!pts.length || !before) return;
      if (pts.some(function (p) { return Object.keys(sharedAt(before, p, tol)).some(function (k) { return set[+k]; }); })) { set[g.id] = true; out.push(g.id); addKids(g.id); }
    });
    return out;
  }
  // suppressWithChildren(model, ids, on, scope?, opts?) -> [every id whose state was set]. on: the features and their
  // children (opts.children === false: the features only). Off: the features and the suppressed features they need
  // (their sketch …); opts.dependents also their children. Then Kernel.setSuppressed(…, scope).
  function suppressWithChildren(model, ids, on, scope, opts) {
    opts = opts || {};
    ids = (Array.isArray(ids) ? ids : [ids]).map(Number);
    var extra = [], sup = K.suppressedIds(model);
    if ((on && opts.children !== false) || (!on && opts.dependents)) extra = suppressionChildren(model, ids, scope);
    if (!on) ids.forEach(function (id) { K.featureAncestors(model, id).forEach(function (a) { if (sup[a]) extra.push(a); }); });
    var seen = {}, all = ids.concat(extra).filter(function (x) { if (seen[x]) return false; seen[x] = true; return true; });
    K.setSuppressed(model, all, !!on, scope);
    return all;
  }

  // ------------------------------------------------------------------ public API (Kernel.*)
  K.suppressionChildren = suppressionChildren; K.suppressWithChildren = suppressWithChildren;   // rfFC2
  K.newModel = newModel; K.featureName = featureName; K.findFeature = findFeature; K.cutDirectionHint = cutDirectionHint; K.buildTool = buildTool;
  K.refAxisFor = refAxisFor;   // lane CZ
  K.exactFaceCenter = exactFaceCenter;   // lane DF (occt-kernel.js resolves reference geometry the same way)
  K.isCut = isCut; K.cutScope = cutScope; K.registerFeature = registerFeature; K.registerSketchScript = registerSketchScript;
  K.registerScriptSection = registerScriptSection; K.rebuild = rebuild; K.combineBodies = combineBodies; K.bodyInfo = bodyInfo;
  K.bodyNearPoint = bodyNearPoint; K.packBuild = packBuild; K.packTransferables = packTransferables; K.unpackBuild = unpackBuild;
  K.applyProfiles = applyProfiles; K.cacheFromBuild = cacheFromBuild;
  // ------------------------------------------------------------------ shared with the other kernel files (Kernel._)
  _.featureName = featureName; _.featureTypes = featureTypes; _.findFeature = findFeature; _.isCut = isCut; _.scriptSections = scriptSections;
  _.sketchScripts = sketchScripts;
})(Kernel, Kernel._);
