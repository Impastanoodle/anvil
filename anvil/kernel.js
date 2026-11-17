// kernel.js — Anvil's modeling kernel, root file: the `Kernel` object, the small vector helpers, planes, face references
// (r10/facesketch10), triangulation and the primitive tool bodies. The rest of the kernel is split over kernel-sketch.js,
// kernel-curves.js, kernel-equations.js, kernel-mesh.js, kernel-rebuild.js, kernel-features.js, kernel-sheetmetal.js and
// kernel-script.js, loaded in that order right after this file (index.html, worker.js, drawing-worker.js, occt-worker.js
// and the test pages all list them). Depends on csg.js. Units are whatever the model says (mm by default); the kernel is
// unit-agnostic.
//
// `Kernel` is created once here and extended by each later file; it is never reassigned, because other files capture
// `var K = Kernel` at load time. `Kernel._` is the kernel's internal namespace: the private helpers and module state
// (TESS, THROUGH, featureTypes, massOptions, massCache, outlineOptions, EXPR_FN, ...) that more than one kernel-*.js
// file uses. It is a non-enumerable property, so `Object.keys(Kernel)` is still the public API only. Each file is an
// IIFE `(function (K, _) { ... })(Kernel, Kernel._)` that aliases what it needs from earlier files at its top
// (`var add = _.add;`) and calls through `_.name` for anything defined in a later file, so late binding works. State
// objects are shared by reference, never copied; nothing on `_` is reassigned after load.
var Kernel = {};
Object.defineProperty(Kernel, '_', { value: {}, enumerable: false });   // the internal namespace (see above)
(function (K, _) {
  'use strict';

  // ------------------------------------------------------------------ small vector helpers (arrays)
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function norm(a) { var l = len(a); return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0]; }
  function vec(a) { return new CSG.Vector(a[0], a[1], a[2]); }
  function arr(v) { return [v.x, v.y, v.z]; }

  var AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

  // ------------------------------------------------------------------ planes
  // Right-handed frames matching SolidWorks' standard planes (x cross y = n).
  var STD_PLANES = {
    Front: { x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1] },
    Top: { x: [1, 0, 0], y: [0, 0, -1], n: [0, 1, 0] },
    Right: { x: [0, 0, -1], y: [0, 1, 0], n: [1, 0, 0] }
  };

  function makePlane(ref, offset) {
    var s = STD_PLANES[ref] || STD_PLANES.Front;
    offset = offset || 0;
    return { ref: ref, offset: offset, origin: scale(s.n, offset), x: s.x.slice(), y: s.y.slice(), n: s.n.slice() };
  }

  // A sketch frame on an arbitrary planar face. Origin = projection of the world origin onto the plane.
  function planeFromFace(normal, point) {
    var n = norm(normal);
    var up = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [0, 0, -1];
    var x = norm(cross(up, n));
    var y = cross(n, x);
    var d = dot(n, point);
    return { custom: true, origin: scale(n, d), x: x, y: y, n: n, offset: d };
  }
  // r10/facesketch10: a frame that is stored in the model (a sketch on a face) is cleaned of float noise first,
  // tidyPlane(planeFromFace(...)): 9.999999999999998 -> 10, 2e-16 -> 0. tidyNum: a value within 1e-9 of a 6-decimal
  // number becomes that number; anything else (an irrational direction component) is left exactly as it is.
  function tidyNum(v) { var r = Math.round(v * 1e6) / 1e6; return Math.abs(v - r) < 1e-9 ? r + 0 : v; }
  function tidyVec(a) { return [tidyNum(a[0]), tidyNum(a[1]), tidyNum(a[2])]; }
  function tidyPlane(pl) {
    pl.origin = tidyVec(pl.origin); pl.x = tidyVec(pl.x); pl.y = tidyVec(pl.y); pl.n = tidyVec(pl.n);
    if (pl.offset != null) pl.offset = tidyNum(pl.offset);
    return pl;
  }

  // ------------------------------------------------------------------ face references (r10/facesketch10)
  // A sketch (or a Hole Wizard positions sketch) made on a model face keeps its frame as a custom plane plus
  //   plane.face = { feature: <id of the feature that made the face>, role: 'cap' | 'geom' }
  // and follows the face at every rebuild, as in SolidWorks: thicken the base and the sketch and its holes move up.
  //   'cap'  the face is an end cap of an extrude (boss top / bottom or a cut's floor): its plane is computed from
  //          that extrude's sketch plane and range, so it follows depth, direction and upstream edits exactly, and
  //          both kernels get the same answer from the same formula;
  //   'geom' any other planar face: the planar face of the body before the sketch with the same outward normal
  //          nearest the stored plane (faces tagged with the referenced feature first, on Anvil's kernel).
  // The resolved frame keeps x, y and n (the in-plane orientation and the sketch coordinates stay put) and moves only
  // along n. When the feature is gone or comes after the sketch, or the face cannot be found, the sketch keeps its
  // stored plane and gets a "dangling" warning. Old models with frozen custom planes (no `face`) are unchanged.
  // r11/faceref11: an extrude has two caps, plane.face.cap = 'far' (where Direction 1 ends: a boss's top, a cut's
  // floor) or 'near' (the sketch-plane end, or where Direction 2 ends). The cap is part of the reference, so
  // reversing the extrude takes the sketch to the cap it was drawn on (its normal flips and the sketch's x with it,
  // so the frame stays right-handed), as in SolidWorks; a record without `cap` (round 10) gets it from its normal at
  // the first rebuild. A face of a pattern / mirror copy of an extrude is a 'cap' of that pattern feature with
  //   inst: the copy's index among the pattern's own copies (patternCopies); lx / ln: the sketch's x and n carried
  //   back to the seed extrude's frame,
  // so the sketch follows its copy when the seed's depth or direction, the spacing, the angle or the mirror plane change.
  // capPlane(E, which, model, planesById) -> { n, w }: the outward body normal and offset (n·p = w) of extrude E's
  // 'far' / 'near' cap now, or null (not an extrude, a Through All end, any error)
  function capPlane(E, which, model, planesById) {
    try {
      if (!E || E.type !== 'extrude') return null;
      var S = _.findFeature(model, E.sketch);
      if (!S || S.type !== 'sketch') return null;
      var P = resolvePlane(S.plane, model, planesById), r = _.extrudeRange(E, _.THROUGH), sg = E.reverse ? -1 : 1;
      var far = which !== 'near', t = (far === (sg > 0)) ? r[1] : r[0];
      if (Math.abs(t) >= _.THROUGH / 2) return null;
      // a boss's cap faces out of the tool; a cut's floor faces back against the tool's cap
      var out = (far ? sg : -sg) * (_.isCut(E, model) ? -1 : 1);
      return { n: scale(P.n, out), w: tidyNum(out * (dot(P.n, P.origin) + t)) };
    } catch (e) { return null; }
  }
  // faceCopy(fr, extra?) -> a copy of a face record (role defaults to 'cap'), with `extra` fields set
  function faceCopy(fr, extra) {
    var o = {};
    Object.keys(fr).forEach(function (k) { o[k] = Array.isArray(fr[k]) ? fr[k].slice() : fr[k]; });
    if (!o.role) o.role = 'cap';
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  // capWhich(E, N, ...) -> the cap ('far' / 'near') of extrude E whose outward normal is N now
  function capWhich(E, N, model, planesById) {
    var c = capPlane(E, 'near', model, planesById);
    return c && dot(c.n, N) > 1 - 1e-6 ? 'near' : 'far';
  }
  // rigid transforms X = { m: 3×3 row-major, t } (p -> m·p + t) of pattern / mirror copies
  var XF_ID = { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };
  function xfDir(X, d) { var m = X.m; return [m[0] * d[0] + m[1] * d[1] + m[2] * d[2], m[3] * d[0] + m[4] * d[1] + m[5] * d[2], m[6] * d[0] + m[7] * d[1] + m[8] * d[2]]; }
  function xfDirBack(X, d) { var m = X.m; return [m[0] * d[0] + m[3] * d[1] + m[6] * d[2], m[1] * d[0] + m[4] * d[1] + m[7] * d[2], m[2] * d[0] + m[5] * d[1] + m[8] * d[2]]; }   // mᵀ = m⁻¹
  function xfPoint(X, p) { return add(xfDir(X, p), X.t); }
  function xfThen(A, B) {   // B first, then A
    var cols = [0, 1, 2].map(function (k) { return xfDir(A, [B.m[k], B.m[3 + k], B.m[6 + k]]); });
    return { m: [cols[0][0], cols[1][0], cols[2][0], cols[0][1], cols[1][1], cols[2][1], cols[0][2], cols[1][2], cols[2][2]], t: xfPoint(A, B.t) };
  }
  function xfFromMap(fn) {   // a rigid map given as a point function
    var o = fn([0, 0, 0]), c = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(function (e) { return sub(fn(e), o); });
    return { m: [c[0][0], c[1][0], c[2][0], c[0][1], c[1][1], c[2][1], c[0][2], c[1][2], c[2][2]], t: o };
  }
  function isCopyFeature(f) { return !!f && (f.type === 'lpattern' || f.type === 'cpattern' || (f.type === 'mirror' && !f.body)); }
  // a pattern's own copy transforms, in the order buildTool makes them
  // lane CZ: the reference Axis feature a circular pattern / revolve turns about (`axisRef: id`, or `axis: 'ref:<id>'`
  // as a PropertyManager list writes it), or null
  function refAxisId(f) {
    if (!f) return null;
    if (f.axisRef != null && f.axisRef !== '') return +f.axisRef;
    var m = typeof f.axis === 'string' ? /^ref:(\d+)$/.exec(f.axis) : null;
    return m ? +m[1] : null;
  }
  function ownTransforms(f, planesById) {
    var out = [];
    if (f.type === 'lpattern') {
      var d1 = scale(AXES[f.d1 || 'x'], f.rev1 ? -1 : 1), n1 = Math.max(1, f.n1 | 0), n2 = f.d2 ? Math.max(1, f.n2 | 0) : 1;
      var d2 = f.d2 ? scale(AXES[f.d2], f.rev2 ? -1 : 1) : [0, 0, 0];
      for (var i = 0; i < n1; i++) for (var j = 0; j < n2; j++) if (i || j) out.push({ m: XF_ID.m.slice(), t: add(scale(d1, i * (+f.s1 || 0)), scale(d2, j * (+f.s2 || 0))) });
    } else if (f.type === 'cpattern') {
      var count = Math.max(2, f.n | 0), total = +f.angle || 360;
      var step = (f.equal === false) ? total : (Math.abs(total) >= 360 ? total / count : total / (count - 1));
      var ra = refAxisId(f), rg = ra != null && planesById ? planesById[ra] : null;   // lane CZ: about a reference axis
      if (ra != null && !(rg && rg.refgeo === 'axis')) return out;
      var rc = rg ? rg.o : f.center || [0, 0, 0], rd = rg ? rg.d : AXES[f.axis || 'z'];
      var rot = function (ang) { return xfFromMap(function (p) { return _.rotatePoint(p, rc, rd, ang); }); };
      for (var k = 1; k < count; k++) out.push(rot(step * k * Math.PI / 180));
    } else if (f.type === 'mirror' && !f.body) {
      var mp = makePlane(f.plane || 'Right', f.offset || 0);
      out.push(xfFromMap(function (q) { return sub(q, scale(mp.n, 2 * dot(sub(q, mp.origin), mp.n))); }));
    }
    return out;
  }
  // patternFamily(id): the seed (identity) and every copy down a pattern chain to its extrude, { root, list } or null;
  // patternCopies(P): the pattern's own part of it (its copies of its source's whole family), as its tool is made
  function patternFamily(id, model, depth, planesById) {
    var f = _.findFeature(model, id);
    depth = depth || 0;
    if (!f || depth > 8) return null;
    if (f.type === 'extrude') return { root: f, list: [XF_ID] };
    if (!isCopyFeature(f)) return null;
    var base = patternFamily(f.feature, model, depth + 1, planesById), own = patternCopies(f, model, depth + 1, planesById);
    return base && own ? { root: own.root, list: base.list.concat(own.list) } : null;
  }
  function patternCopies(P, model, depth, planesById) {
    var base = patternFamily(P.feature, model, (depth || 0) + 1, planesById);
    if (!base) return null;
    var list = [];
    ownTransforms(P, planesById).forEach(function (T) { base.list.forEach(function (B) { list.push(xfThen(T, B)); }); });
    return { root: base.root, list: list };
  }
  // the cap of extrude `root` under transform X: { n, w, local } (local: its normal before X)
  function capUnder(root, which, X, model, planesById) {
    var c = capPlane(root, which, model, planesById);
    if (!c) return null;
    var n = xfDir(X, c.n);
    return { n: n, w: tidyNum(dot(n, xfPoint(X, scale(c.n, c.w)))), local: c.n };
  }
  // faceRef(model, featureId, plane, planesById) -> the `face` record for a sketch frame `plane` made on a face of
  // feature `featureId` (the face's tag; a pattern copy carries its seed's), or null: 'cap' (with `cap`) when one
  // of the extrude's caps, or of a pattern copy of it, is the face's plane now, else 'geom'
  function faceRef(model, featureId, plane, planesById) {
    if (featureId == null || featureId < 0 || !model || !model.features || !_.findFeature(model, featureId)) return null;
    var m = _.resolvedModel(model).model, pb = planesById || {}, E = _.findFeature(m, featureId), out = null;
    function on(c) { return c && dot(c.n, plane.n) > 1 - 1e-6 && Math.abs(c.w - plane.offset) < 1e-6; }
    ['far', 'near'].forEach(function (which) { if (!out && on(capUnder(E, which, XF_ID, m, pb))) out = { feature: featureId, role: 'cap', cap: which }; });
    if (out) return out;
    // a copy of it: a pattern (or mirror) whose chain leads to this feature
    m.features.forEach(function (P) {
      if (out || !isCopyFeature(P)) return;
      var g = P;
      for (var d = 0; g && g.id !== featureId && isCopyFeature(g) && d < 9; d++) g = _.findFeature(m, g.feature);
      if (!g || g.id !== featureId) return;
      var cp = patternCopies(P, m, 0, pb);
      if (!cp) return;
      cp.list.forEach(function (X, k) {
        ['far', 'near'].forEach(function (which) {
          if (!out && on(capUnder(cp.root, which, X, m, pb))) out = { feature: P.id, role: 'cap', cap: which, inst: k, lo: tidyVec(xfDirBack(X, sub(plane.origin, X.t))), lx: tidyVec(xfDirBack(X, plane.x)), ln: tidyVec(xfDirBack(X, plane.n)) };
        });
      });
    });
    return out || { feature: featureId, role: 'geom' };
  }
  // the frame a 'cap' reference gives now: { n, w, x, origin?, cap } or null. A copy's frame moves rigidly with the
  // copy (origin included: lo, the frame origin in the seed's frame); an extrude's own cap keeps the origin at the
  // projection of the world origin, as planeFromFace makes it.
  function capFrame(fr, src, pl, model, planesById) {
    var root = src, X = XF_ID, lx = pl.x, ln = pl.n, lo = null;
    if (fr.inst != null) {
      var cp = isCopyFeature(src) ? patternCopies(src, model, 0, planesById) : null;
      if (!cp || !cp.list[fr.inst] || !fr.lx || !fr.ln || !fr.lo) return null;
      root = cp.root; X = cp.list[fr.inst]; lx = fr.lx; ln = fr.ln; lo = fr.lo;
    }
    var which = fr.cap === 'near' || fr.cap === 'far' ? fr.cap : capWhich(root, pl.n, model, planesById);
    var c = capUnder(root, which, X, model, planesById);
    if (!c || (fr.cap == null && dot(c.n, pl.n) < 1 - 1e-6)) return null;   // round 10: neither cap faces the stored way
    // the sketch's x in the cap: projected into it, and negated when the cap faces the other way now
    var x = sub(lx, scale(c.local, dot(lx, c.local)));
    if (len(x) < 1e-9) return null;
    x = norm(x);
    if (dot(c.local, ln) < 0) x = scale(x, -1);
    var o = null;
    if (lo) {
      var cl = capPlane(root, which, model, planesById);
      o = xfPoint(X, add(lo, scale(cl.n, cl.w - dot(cl.n, lo))));
    }
    return { n: c.n, w: c.w, x: xfDir(X, x), origin: o, cap: which };
  }
  // resolveFacePlane(sketch, model, planesById, candidates?) -> null for a sketch without a face reference, else
  // { plane, warning? }. `candidates()` lists the planar faces of the body before the sketch as [{ n, w, feature? }]
  // (each kernel supplies its own); without it a 'geom' reference keeps its stored plane.
  function resolveFacePlane(sk, model, planesById, candidates) {
    var pl = sk && sk.plane, fr = pl && pl.custom ? pl.face : null;
    if (!fr) return null;
    var src = _.findFeature(model, fr.feature), before = false;
    for (var i = 0; src && i < model.features.length && model.features[i].id !== sk.id; i++) if (model.features[i].id === fr.feature) before = true;
    var w = null, cf = null;
    if (src && before) {
      if (fr.role !== 'geom') { cf = capFrame(fr, src, pl, model, planesById); if (cf) w = cf.w; }
      // (a pattern copy that is gone stays dangling: another copy's face is not the one it was drawn on)
      if (w == null && fr.inst == null && candidates) {
        var list = (candidates() || []).filter(function (c) { return dot(c.n, pl.n) > 1 - 1e-6; });
        var own = list.filter(function (c) { return c.feature === fr.feature; });
        if (own.length) list = own;
        list.forEach(function (c) { if (w == null || Math.abs(c.w - pl.offset) < Math.abs(w - pl.offset)) w = c.w; });
        if (w != null) w = tidyNum(w);
      } else if (w == null && fr.role === 'geom') w = pl.offset;
    }
    if (w == null) {
      var what = src ? (src.name || 'feature ' + fr.feature) : 'a deleted feature';
      return { plane: pl, warning: 'Dangling sketch: the face it was drawn on (' + what + ') ' + (src ? 'cannot be found' : 'is gone') + '; the sketch stays at its last position.' };
    }
    // same orientation: only the offset moves (x, y and n kept exactly); a flipped or turned cap: the new frame
    var same = !cf || (dot(cf.n, pl.n) > 1 - 1e-12 && dot(cf.x, pl.x) > 1 - 1e-12);
    var np = tidyPlane(same ? { custom: true, origin: cf && cf.origin ? cf.origin : scale(pl.n, w), x: pl.x.slice(), y: pl.y.slice(), n: pl.n.slice(), offset: w }
      : { custom: true, origin: cf.origin || scale(cf.n, w), x: cf.x, y: cross(cf.n, cf.x), n: cf.n.slice(), offset: w });
    if (np.offset === pl.offset && JSON.stringify([np.origin, np.x, np.y, np.n]) === JSON.stringify([pl.origin, pl.x, pl.y, pl.n]) && (!cf || fr.cap === cf.cap)) return { plane: pl };
    np.face = faceCopy(fr, cf ? { cap: cf.cap } : null);
    return { plane: np };
  }

  function to3D(pl, u, v) {
    return [pl.origin[0] + pl.x[0] * u + pl.y[0] * v, pl.origin[1] + pl.x[1] * u + pl.y[1] * v, pl.origin[2] + pl.x[2] * u + pl.y[2] * v];
  }
  function to2D(pl, p) {
    var d = sub(p, pl.origin);
    return [dot(d, pl.x), dot(d, pl.y)];
  }

  // Resolve a sketch's plane reference against the model (standard plane, reference-plane feature, or custom frame).
  function resolvePlane(ref, model, planesById) {
    if (!ref) return makePlane('Front', 0);
    if (ref.custom) return ref;
    if (ref.featureId != null) {
      var pl = planesById && planesById[ref.featureId];
      if (pl) return pl;
      throw new Error('Reference plane not found (feature ' + ref.featureId + ').');
    }
    return makePlane(ref.ref || 'Front', ref.offset || 0);
  }

  // ------------------------------------------------------------------ triangulation (ear clipping, CCW input)
  function triangulate(pts) {
    var n = pts.length, idx = [], tris = [], i;
    function area2(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
    // lane NI: a CLOCKWISE loop (a face's inner loop: the footprint of a boss, a hole's rim) found no ear and fell to the
    // fan below. A fan of a convex loop is right (its triangles wind as the loop does; callers orient the solid), and is
    // kept as it was. A fan of a loop that is not convex has triangles facing both ways: a prism over it is closed but
    // no solid, and a boolean with it gave a larger volume after a subtract and open edges (the boss prism taken off a
    // round's tool, stack fuzz 226: the outline of two grooves and a block). Such a loop is ear-clipped the other way
    // round and its triangles handed back winding as the loop does.
    if (n > 3 && triangulate.cw !== false) {
      var sa = 0, reflex = false;
      for (i = 0; i < n; i++) { var pa = pts[i], pb = pts[(i + 1) % n]; sa += pa[0] * pb[1] - pb[0] * pa[1]; }
      if (sa < 0) {
        for (i = 0; i < n && !reflex; i++) if (area2(pts[i], pts[(i + 1) % n], pts[(i + 2) % n]) > 1e-9) reflex = true;
        if (reflex) {
          var rev = pts.slice().reverse();
          return triangulate(rev).map(function (t) { return [n - 1 - t[2], n - 1 - t[1], n - 1 - t[0]]; });
        }
      }
    }
    for (i = 0; i < n; i++) idx.push(i);
    function inTri(p, a, b, c) {
      return area2(a, b, p) >= -1e-9 && area2(b, c, p) >= -1e-9 && area2(c, a, p) >= -1e-9;
    }
    var guard = 0;
    while (idx.length > 3 && guard++ < 5000) {
      var found = false;
      for (i = 0; i < idx.length; i++) {
        var ip = idx[(i + idx.length - 1) % idx.length], ic = idx[i], inx = idx[(i + 1) % idx.length];
        var a = pts[ip], b = pts[ic], c = pts[inx];
        if (area2(a, b, c) <= 1e-9) continue;
        var ear = true;
        for (var k = 0; k < idx.length; k++) {
          var q = idx[k];
          if (q === ip || q === ic || q === inx) continue;
          if (inTri(pts[q], a, b, c)) { ear = false; break; }
        }
        if (!ear) continue;
        tris.push([ip, ic, inx]);
        idx.splice(i, 1);
        found = true;
        break;
      }
      if (!found) break;
    }
    if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
    else if (idx.length > 3) for (i = 1; i + 1 < idx.length; i++) tris.push([idx[0], idx[i], idx[i + 1]]);
    return tris;
  }

  // ------------------------------------------------------------------ primitive tool bodies
  function poly(points, shared) {
    var vs = points.map(function (p) { return new CSG.Vertex(vec(p)); });
    return CSG.Polygon.tryCreate(vs, shared);
  }

  function pushPoly(list, points, shared) {
    var p = poly(points, shared);
    if (p) list.push(p);
  }

  function ensureOutward(polys) {
    var csg = CSG.fromPolygons(polys);
    if (csg.volume() < 0) polys.forEach(function (p) { p.flip(); });
    return csg;
  }


  // rfOD (F2): a cut that removes nothing because its sketch is beside the part, not over it. cutMissMessage(f, model,
  // ctx, fallback) -> "<feature>'s sketch (<sketch>) lies outside the part: Edit Sketch to move it." when no region of
  // the cut's sketch (a Cut-Extrude's profile loops; a Hole Wizard's points as discs of the hole's largest diameter)
  // overlaps the projection of the bodies in its scope on the sketch plane; else `fallback` (Kernel.CUT_MISS: the cut
  // is over the part but points away). Only Cut-Extrude and Hole Wizard holes are judged (a revolve or sweep cut has no
  // such projection); anything it cannot judge gets the fallback. Touching along an edge is not an overlap.
  function cutRegions(f, model, ctx) {
    var sk = (ctx && ctx.sketches && ctx.sketches[f.sketch]) || findFeatureLocal(model, f.sketch);
    if (!sk || sk.type !== 'sketch' && !sk.entities) return null;
    var plane = resolvePlane(sk.plane, model, ctx && ctx.planes), loops = [];
    if (f.type === 'extrude' && f.cut) {
      var prof = sk.profile || (K.sketchProfile ? K.sketchProfile(sk) : null);
      (prof && prof.loops || []).forEach(function (l) { if (!l.hole && l.pts && l.pts.length > 2) loops.push(l.pts); });
    } else if (f.type === 'hole' && typeof HoleWizard !== 'undefined' && f.holeType) {
      var s = HoleWizard.spec(f, model && model.units === 'in' ? 'in' : 'mm');
      var r = Math.max(s.dia || 0, s.cbore ? s.cbore.dia : 0, s.csk ? s.csk.dia : 0) / 2;
      if (!(r > 0)) return null;
      (sk.entities || []).forEach(function (e) {
        if (e.t !== 'point' || e.construction) return;
        var c = [];
        for (var i = 0; i < 24; i++) c.push([e.x + r * Math.cos(i * Math.PI / 12), e.y + r * Math.sin(i * Math.PI / 12)]);
        loops.push(c);
      });
    } else return null;
    return loops.length ? { sketch: sk, plane: plane, loops: loops } : null;
  }
  function findFeatureLocal(model, id) {
    var fs = model && model.features || [];
    for (var i = 0; i < fs.length; i++) if (fs[i].id === id) return fs[i];
    return null;
  }
  function inPoly2(p, poly, eps) {   // strictly inside (more than eps from every edge)
    var inside = false, n = poly.length;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var a = poly[i], b = poly[j];
      var ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey;
      var t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / L2)) : 0;
      var dx = p[0] - a[0] - t * ex, dy = p[1] - a[1] - t * ey;
      if (dx * dx + dy * dy <= eps * eps) return false;
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  function segsCross(a, b, c, d, eps) {   // proper crossing, not touching
    function o(p, q, r) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); }
    var d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
    var s1 = eps * Math.hypot(d[0] - c[0], d[1] - c[1]), s2 = eps * Math.hypot(b[0] - a[0], b[1] - a[1]);
    return ((d1 > s1 && d2 < -s1) || (d1 < -s1 && d2 > s1)) && ((d3 > s2 && d4 < -s2) || (d3 < -s2 && d4 > s2));
  }
  function bbox2(pts) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    pts.forEach(function (p) { if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1]; });
    return b;
  }
  function centroid2(pts) { var x = 0, y = 0; pts.forEach(function (p) { x += p[0]; y += p[1]; }); return [x / pts.length, y / pts.length]; }
  function polysOverlap(P, L, eps) {
    var i, j;
    if (inPoly2(centroid2(P), L, eps) || inPoly2(centroid2(L), P, eps)) return true;
    for (i = 0; i < P.length; i++) if (inPoly2(P[i], L, eps)) return true;
    for (i = 0; i < L.length; i++) if (inPoly2(L[i], P, eps)) return true;
    for (i = 0; i < P.length; i++) for (j = 0; j < L.length; j++) if (segsCross(P[i], P[(i + 1) % P.length], L[j], L[(j + 1) % L.length], eps)) return true;
    return false;
  }
  // cutOutside(f, model, ctx) -> true when the cut's regions miss the bodies' projection, false when they overlap it,
  // null when this cut cannot be judged
  function cutOutside(f, model, ctx) {
    var reg = cutRegions(f, model, ctx), bodies = ctx && ctx.bodies || [];
    if (!reg || !bodies.length) return null;
    // every body, not only the cut's scope: a sketch over a body the scope leaves out is not "outside the part"
    var scope = bodies;
    var pl = reg.plane, lbs = reg.loops.map(bbox2), span = 0;
    lbs.forEach(function (b) { span = Math.max(span, b[2] - b[0], b[3] - b[1]); });
    var eps = 1e-7 * Math.max(1, span);
    for (var bi = 0; bi < scope.length; bi++) {
      var polys = scope[bi].polygons || [];
      for (var k = 0; k < polys.length; k++) {
        var vs = polys[k].vertices, P = [];
        for (var m = 0; m < vs.length; m++) P.push(to2D(pl, [vs[m].pos.x, vs[m].pos.y, vs[m].pos.z]));
        var a2 = 0;
        for (m = 0; m < P.length; m++) { var p = P[m], q = P[(m + 1) % P.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
        if (Math.abs(a2) < 1e-12 * Math.max(1, span * span)) continue;   // a face edge-on to the sketch plane
        if (a2 < 0) P.reverse();
        var pb = bbox2(P);
        for (var li = 0; li < reg.loops.length; li++) {
          var lb = lbs[li];
          if (pb[2] <= lb[0] + eps || pb[0] >= lb[2] - eps || pb[3] <= lb[1] + eps || pb[1] >= lb[3] - eps) continue;
          if (polysOverlap(P, reg.loops[li], eps)) return false;
        }
      }
    }
    return true;
  }
  function cutMissMessage(f, model, ctx, fallback) {
    fallback = fallback || K.CUT_MISS || 'The cut does not intersect the model: it would remove no material. Reverse its direction or change its end condition.';
    try {
      if (cutOutside(f, model, ctx) !== true) return fallback;
      var sk = (ctx && ctx.sketches && ctx.sketches[f.sketch]) || findFeatureLocal(model, f.sketch);
      return (f.name || 'The cut') + '\'s sketch (' + ((sk && sk.name) || 'its sketch') + ') lies outside the part: Edit Sketch to move it.';
    } catch (e) { return fallback; }
  }
  K.cutMissMessage = cutMissMessage; K.cutOutside = cutOutside;

  // ------------------------------------------------------------------ public API (Kernel.*)
  K.STD_PLANES = STD_PLANES; K.AXES = AXES; K.makePlane = makePlane; K.planeFromFace = planeFromFace; K.resolvePlane = resolvePlane;
  K.faceRef = faceRef; K.resolveFacePlane = resolveFacePlane; K.capPlane = capPlane; K.patternCopies = patternCopies; K.tidyPlane = tidyPlane;
  K.to3D = to3D; K.to2D = to2D; K.vec = { add: add, sub: sub, scale: scale, dot: dot, cross: cross, len: len, norm: norm };
  // ------------------------------------------------------------------ shared with the other kernel files (Kernel._)
  K.refAxisId = refAxisId; _.refAxisId = refAxisId;   // lane CZ
  _.AXES = AXES; _.add = add; _.arr = arr; _.cross = cross; _.dot = dot; _.ensureOutward = ensureOutward; _.faceCopy = faceCopy; _.len = len;
  _.makePlane = makePlane; _.norm = norm; _.planeFromFace = planeFromFace; _.poly = poly; _.pushPoly = pushPoly;
  _.resolveFacePlane = resolveFacePlane; _.resolvePlane = resolvePlane; _.scale = scale; _.sub = sub; _.tidyPlane = tidyPlane; _.to2D = to2D;
  _.to3D = to3D; _.triangulate = triangulate; _.vec = vec;
})(Kernel, Kernel._);
