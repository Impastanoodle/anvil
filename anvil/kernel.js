// kernel.js — Anvil's modeling kernel: sketches, features, rebuild, meshing, mass properties, exports, script builder.
// Depends on csg.js. Units are whatever the model says (mm by default); the kernel is unit-agnostic.
var Kernel = (function () {
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
      var S = findFeature(model, E.sketch);
      if (!S || S.type !== 'sketch') return null;
      var P = resolvePlane(S.plane, model, planesById), r = extrudeRange(E, THROUGH), sg = E.reverse ? -1 : 1;
      var far = which !== 'near', t = (far === (sg > 0)) ? r[1] : r[0];
      if (Math.abs(t) >= THROUGH / 2) return null;
      // a boss's cap faces out of the tool; a cut's floor faces back against the tool's cap
      var out = (far ? sg : -sg) * (isCut(E, model) ? -1 : 1);
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
  function ownTransforms(f) {
    var out = [];
    if (f.type === 'lpattern') {
      var d1 = scale(AXES[f.d1 || 'x'], f.rev1 ? -1 : 1), n1 = Math.max(1, f.n1 | 0), n2 = f.d2 ? Math.max(1, f.n2 | 0) : 1;
      var d2 = f.d2 ? scale(AXES[f.d2], f.rev2 ? -1 : 1) : [0, 0, 0];
      for (var i = 0; i < n1; i++) for (var j = 0; j < n2; j++) if (i || j) out.push({ m: XF_ID.m.slice(), t: add(scale(d1, i * (+f.s1 || 0)), scale(d2, j * (+f.s2 || 0))) });
    } else if (f.type === 'cpattern') {
      var count = Math.max(2, f.n | 0), total = +f.angle || 360;
      var step = (f.equal === false) ? total : (Math.abs(total) >= 360 ? total / count : total / (count - 1));
      var rot = function (ang) { return xfFromMap(function (p) { return rotatePoint(p, f.center || [0, 0, 0], AXES[f.axis || 'z'], ang); }); };
      for (var k = 1; k < count; k++) out.push(rot(step * k * Math.PI / 180));
    } else if (f.type === 'mirror' && !f.body) {
      var mp = makePlane(f.plane || 'Right', f.offset || 0);
      out.push(xfFromMap(function (q) { return sub(q, scale(mp.n, 2 * dot(sub(q, mp.origin), mp.n))); }));
    }
    return out;
  }
  // patternFamily(id): the seed (identity) and every copy down a pattern chain to its extrude, { root, list } or null;
  // patternCopies(P): the pattern's own part of it (its copies of its source's whole family), as its tool is made
  function patternFamily(id, model, depth) {
    var f = findFeature(model, id);
    depth = depth || 0;
    if (!f || depth > 8) return null;
    if (f.type === 'extrude') return { root: f, list: [XF_ID] };
    if (!isCopyFeature(f)) return null;
    var base = patternFamily(f.feature, model, depth + 1), own = patternCopies(f, model, depth + 1);
    return base && own ? { root: own.root, list: base.list.concat(own.list) } : null;
  }
  function patternCopies(P, model, depth) {
    var base = patternFamily(P.feature, model, (depth || 0) + 1);
    if (!base) return null;
    var list = [];
    ownTransforms(P).forEach(function (T) { base.list.forEach(function (B) { list.push(xfThen(T, B)); }); });
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
    if (featureId == null || featureId < 0 || !model || !model.features || !findFeature(model, featureId)) return null;
    var m = resolvedModel(model).model, pb = planesById || {}, E = findFeature(m, featureId), out = null;
    function on(c) { return c && dot(c.n, plane.n) > 1 - 1e-6 && Math.abs(c.w - plane.offset) < 1e-6; }
    ['far', 'near'].forEach(function (which) { if (!out && on(capUnder(E, which, XF_ID, m, pb))) out = { feature: featureId, role: 'cap', cap: which }; });
    if (out) return out;
    // a copy of it: a pattern (or mirror) whose chain leads to this feature
    m.features.forEach(function (P) {
      if (out || !isCopyFeature(P)) return;
      var g = P;
      for (var d = 0; g && g.id !== featureId && isCopyFeature(g) && d < 9; d++) g = findFeature(m, g.feature);
      if (!g || g.id !== featureId) return;
      var cp = patternCopies(P, m);
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
      var cp = isCopyFeature(src) ? patternCopies(src, model) : null;
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
    var src = findFeature(model, fr.feature), before = false;
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

  // ------------------------------------------------------------------ sketch entities -> polylines
  // Tessellation of circles and arcs (true curves, cloud-2026-09-25p). Curves stay exact in the analytic records the
  // profiles and solids carry; the polygon mesh that booleans and display use follows a chord tolerance: the
  // sagitta r·(1 − cos(π/n)) of each chord of a full circle stays under chordTol (mm), with n a multiple of 8
  // between minSegs and maxSegs: a circle has vertices on its quadrant points (exact extents), and circles of
  // different sizes share every 45° vertex, which keeps lofts and shells between them free of long needle facets
  // (with multiples of 4 some tolerances left cracks in the Funnel's shell). The old rule, clamp(round(8√r), 16, 72),
  // was a sagitta of about 0.077 mm.
  // `legacy: true` restores the pre-true-curves meshes exactly (clamp(round(8√r), 16, 72) segments, 48 revolve rings
  // per turn, mitred draft offsets on arcs): old polygonal results can be reproduced bit for bit.
  var TESS = { chordTol: 0.05, minSegs: 16, maxSegs: 128, legacy: false };
  function segsForRadius(r) {
    if (TESS.legacy) return Math.max(16, Math.min(72, Math.round(8 * Math.sqrt(Math.max(r, 0.01)))));
    r = Math.max(+r || 0, 0.01);
    var c = 1 - TESS.chordTol / r, n = c <= -1 ? TESS.minSegs : Math.ceil(Math.PI / Math.acos(Math.max(-1, Math.min(1, c))) - 1e-9);
    n = Math.ceil(n / 8) * 8;
    return Math.max(TESS.minSegs, Math.min(TESS.maxSegs, n));
  }
  // setTessellation({ chordTol?, minSegs?, maxSegs?, legacy? }) -> the settings now in force (rebuild cache keys
  // include them); setTessellation('default') restores the defaults
  function setTessellation(o) {
    if (o === 'default') o = { chordTol: 0.05, minSegs: 16, maxSegs: 128, legacy: false };
    o = o || {};
    if (o.legacy != null) TESS.legacy = !!o.legacy;
    if (o.chordTol != null) { if (!(+o.chordTol > 0)) throw new Error('Chord tolerance must be positive.'); TESS.chordTol = +o.chordTol; }
    if (o.minSegs != null) TESS.minSegs = Math.max(8, Math.ceil((+o.minSegs || 8) / 8) * 8);
    if (o.maxSegs != null && !(+o.maxSegs >= 4)) throw new Error('maxSegs must be at least 4.');
    if (o.maxSegs != null) TESS.maxSegs = Math.max(TESS.minSegs, +o.maxSegs | 0);
    return { chordTol: TESS.chordTol, minSegs: TESS.minSegs, maxSegs: TESS.maxSegs, legacy: TESS.legacy };
  }
  function tessKey() { return TESS.legacy ? 'legacy' : TESS.chordTol + '/' + TESS.minSegs + '/' + TESS.maxSegs; }

  function arcPoints(cx, cy, r, a0, a1, segs) {
    var pts = [];
    for (var i = 0; i <= segs; i++) {
      var a = a0 + (a1 - a0) * i / segs;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  }

  // Returns [{pts:[[u,v],...], closed:bool}] for drawing and profiling. Construction points return [].
  function entityPolylines(e) {
    switch (e.t) {
      case 'line': return [{ pts: [[e.x1, e.y1], [e.x2, e.y2]], closed: false }];
      case 'rect': return [{ pts: [[e.x, e.y], [e.x + e.w, e.y], [e.x + e.w, e.y + e.h], [e.x, e.y + e.h]], closed: true }];
      case 'crect': {
        var hw = e.w / 2, hh = e.h / 2;
        return [{ pts: [[e.cx - hw, e.cy - hh], [e.cx + hw, e.cy - hh], [e.cx + hw, e.cy + hh], [e.cx - hw, e.cy + hh]], closed: true }];
      }
      case 'circle': {
        var n = segsForRadius(e.r);
        var pts = arcPoints(e.cx, e.cy, e.r, 0, Math.PI * 2, n);
        pts.pop();
        return [{ pts: pts, closed: true }];
      }
      case 'poly': {
        var rot = (e.rot || 0) * Math.PI / 180, ps = [];
        for (var i = 0; i < e.n; i++) {
          var a = rot + Math.PI * 2 * i / e.n;
          ps.push([e.cx + e.r * Math.cos(a), e.cy + e.r * Math.sin(a)]);
        }
        return [{ pts: ps, closed: true }];
      }
      case 'slot': {
        var dx = e.x2 - e.x1, dy = e.y2 - e.y1, L = Math.sqrt(dx * dx + dy * dy);
        var r = e.w / 2;
        if (L < 1e-9) return entityPolylines({ t: 'circle', cx: e.x1, cy: e.y1, r: r });
        var ang = Math.atan2(dy, dx), segs = Math.max(8, Math.round(segsForRadius(r) / 2));
        var a2 = arcPoints(e.x2, e.y2, r, ang - Math.PI / 2, ang + Math.PI / 2, segs);
        var a1 = arcPoints(e.x1, e.y1, r, ang + Math.PI / 2, ang + 3 * Math.PI / 2, segs);
        // arc end points are the tangent vertices where the straight sides begin; keep them all
        return [{ pts: a2.concat(a1), closed: true }];
      }
      case 'arc': {
        var s0 = e.a0 * Math.PI / 180, s1 = e.a1 * Math.PI / 180;
        var sweep = Math.abs(s1 - s0);
        var sg = Math.max(4, Math.round(segsForRadius(e.r) * sweep / (Math.PI * 2)));
        return [{ pts: arcPoints(e.cx, e.cy, e.r, s0, s1, sg), closed: false }];
      }
      case 'polyline': return [{ pts: e.pts.map(function (p) { return [p[0], p[1]]; }), closed: !!e.closed }];
      case 'point': return [];
    }
    return [];
  }

  // The exact circles and arcs behind an entity's polyline: [{ c: [u, v], r, a0, a1, full, step }] (angles in radians,
  // a0 < a1; step is the angle each chord of the tessellation spans). Profiles use them to tell which loop segments
  // are chords of a true curve (see curveSegments).
  function entityCurves(e) {
    switch (e.t) {
      case 'circle': return e.r > 0 ? [{ c: [e.cx, e.cy], r: e.r, a0: 0, a1: Math.PI * 2, full: true, step: Math.PI * 2 / segsForRadius(e.r) }] : [];
      case 'arc': {
        var s0 = e.a0 * Math.PI / 180, s1 = e.a1 * Math.PI / 180, sweep = Math.abs(s1 - s0);
        if (!(e.r > 0) || sweep < 1e-12) return [];
        var sg = Math.max(4, Math.round(segsForRadius(e.r) * sweep / (Math.PI * 2)));
        return [{ c: [e.cx, e.cy], r: e.r, a0: Math.min(s0, s1), a1: Math.max(s0, s1), full: sweep >= Math.PI * 2 - 1e-12, step: sweep / sg }];
      }
      case 'slot': {
        var dx = e.x2 - e.x1, dy = e.y2 - e.y1, L = Math.sqrt(dx * dx + dy * dy), r = e.w / 2;
        if (!(r > 0)) return [];
        if (L < 1e-9) return entityCurves({ t: 'circle', cx: e.x1, cy: e.y1, r: r });
        var ang = Math.atan2(dy, dx), segs = Math.max(8, Math.round(segsForRadius(r) / 2));
        return [{ c: [e.x2, e.y2], r: r, a0: ang - Math.PI / 2, a1: ang + Math.PI / 2, full: false, step: Math.PI / segs },
          { c: [e.x1, e.y1], r: r, a0: ang + Math.PI / 2, a1: ang + 3 * Math.PI / 2, full: false, step: Math.PI / segs }];
      }
    }
    return [];
  }
  // The segment i -> i+1 of a closed loop is a chord of curve C when both ends lie on C's circle, the chord spans C's
  // tessellation step and its mid-angle is inside C's range. -> array (one entry per segment) of indices into
  // `curves`, -1 for straight segments; null when no segment is on a curve.
  function curveSegments(pts, curves) {
    if (!curves.length) return null;
    var n = pts.length, out = null;
    for (var i = 0; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n];
      for (var k = 0; k < curves.length; k++) {
        var C = curves[k], tol = 1e-7 * Math.max(1, C.r);
        var rp = Math.hypot(p[0] - C.c[0], p[1] - C.c[1]), rq = Math.hypot(q[0] - C.c[0], q[1] - C.c[1]);
        if (Math.abs(rp - C.r) > tol || Math.abs(rq - C.r) > tol) continue;
        if (Math.abs(Math.hypot(q[0] - p[0], q[1] - p[1]) - 2 * C.r * Math.sin(C.step / 2)) > 1e-6 * Math.max(1, C.r)) continue;
        if (!C.full) {
          var am = Math.atan2((p[1] + q[1]) / 2 - C.c[1], (p[0] + q[0]) / 2 - C.c[0]);
          while (am < C.a0 - 1e-9) am += Math.PI * 2;
          while (am > C.a1 + 1e-9) am -= Math.PI * 2;
          if (am < C.a0 - 1e-9 || am > C.a1 + 1e-9) continue;
        }
        if (!out) { out = []; for (var j = 0; j < n; j++) out.push(-1); }
        out[i] = k;
        break;
      }
    }
    return out;
  }

  // Characteristic points for snapping (endpoints, centers, midpoints).
  function entitySnapPoints(e) {
    switch (e.t) {
      case 'line': return [[e.x1, e.y1], [e.x2, e.y2], [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2]];
      case 'rect': return [[e.x, e.y], [e.x + e.w, e.y], [e.x + e.w, e.y + e.h], [e.x, e.y + e.h], [e.x + e.w / 2, e.y + e.h / 2]];
      case 'crect': return [[e.cx, e.cy], [e.cx - e.w / 2, e.cy - e.h / 2], [e.cx + e.w / 2, e.cy + e.h / 2], [e.cx + e.w / 2, e.cy - e.h / 2], [e.cx - e.w / 2, e.cy + e.h / 2]];
      case 'circle': return [[e.cx, e.cy], [e.cx + e.r, e.cy], [e.cx - e.r, e.cy], [e.cx, e.cy + e.r], [e.cx, e.cy - e.r]];
      case 'poly': return [[e.cx, e.cy]].concat(entityPolylines(e)[0].pts);
      case 'slot': return [[e.x1, e.y1], [e.x2, e.y2], [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2]];
      case 'arc': { var pl = entityPolylines(e)[0].pts; return [[e.cx, e.cy], pl[0], pl[pl.length - 1]]; }
      case 'polyline': return e.pts.slice();
      case 'point': return [[e.x, e.y]];
    }
    return [];
  }

  // ------------------------------------------------------------------ profiles: closed loops with nesting
  function signedArea(pts) {
    var a = 0;
    for (var i = 0, n = pts.length; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }

  function pointInPoly(pt, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  function key2(p) { return Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4); }

  function dedupeLoop(pts) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length];
      if (Math.abs(p[0] - q[0]) > 1e-7 || Math.abs(p[1] - q[1]) > 1e-7) out.push(p);
    }
    return out;
  }

  // Chain open segments (lines, arcs, open polylines) into closed loops by matching endpoints.
  function chainSegments(chains) {
    var loops = [], warnings = [];
    var used = chains.map(function () { return false; });
    var byKey = {};
    chains.forEach(function (c, i) {
      var k0 = key2(c[0]), k1 = key2(c[c.length - 1]);
      (byKey[k0] = byKey[k0] || []).push(i);
      (byKey[k1] = byKey[k1] || []).push(i);
    });
    for (var s = 0; s < chains.length; s++) {
      if (used[s]) continue;
      used[s] = true;
      var pts = chains[s].slice();
      var startKey = key2(pts[0]);
      var guard = 0, closed = false;
      while (guard++ < chains.length + 1) {
        var endKey = key2(pts[pts.length - 1]);
        if (endKey === startKey && pts.length > 2) { closed = true; break; }
        var cands = (byKey[endKey] || []).filter(function (i) { return !used[i]; });
        if (!cands.length) break;
        var ni = cands[0];
        used[ni] = true;
        var next = chains[ni];
        if (key2(next[0]) !== endKey) next = next.slice().reverse();
        pts = pts.concat(next.slice(1));
      }
      if (closed) {
        pts.pop();
        loops.push(dedupeLoop(pts));
      } else {
        warnings.push('Open contour ignored (' + pts.length + ' points).');
      }
    }
    return { loops: loops, warnings: warnings };
  }

  // Proper crossing of segments a-b and c-d (interiors only; touching at an end is not a crossing) -> point | null.
  function segCross(a, b, c, d) {
    var rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
    var den = rx * sy - ry * sx;
    if (Math.abs(den) <= 1e-12 * Math.max(1, Math.hypot(rx, ry) * Math.hypot(sx, sy))) return null; // parallel
    var qx = c[0] - a[0], qy = c[1] - a[1];
    var t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den, eps = 1e-9;
    if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
    return [a[0] + rx * t, a[1] + ry * t];
  }

  // First point where two non-adjacent edges of a closed loop cross, or null for a simple polygon. O(n²).
  function loopSelfCrossing(pts) {
    var n = pts.length;
    for (var i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      for (var j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // adjacent through the wrap-around
        var x = segCross(a, b, pts[j], pts[(j + 1) % n]);
        if (x) return x;
      }
    }
    return null;
  }

  // Throws when any loop of a profile crosses itself; builders call it before making solids from the loops.
  function checkProfile(profile) {
    (profile.loops || []).forEach(function (l) {
      if (l.cross) throw new Error('Sketch profile crosses itself near (' + fmt(l.cross[0]) + ', ' + fmt(l.cross[1]) + '). Trim or move the entities so the contour does not self-intersect.');
    });
  }

  // -> { loops: [{pts, hole, depth, cross?}], warnings }. A loop with `cross` (a self-intersection point) is kept for
  // display but every feature built from the profile errors through checkProfile.
  // Loops made of chords of circles and arcs keep the exact curves: profile.curves lists them ({ c, r, a0, a1, full,
  // step }, sketch coordinates) and loop.seg[i] is the curve index of segment i -> i+1 (-1 straight), absent when the
  // loop has no curved segment.
  function sketchProfile(sketch) {
    var loops = [], chains = [], warnings = [], curves = [];
    (sketch.entities || []).forEach(function (e) {
      if (e.construction) return;
      curves = curves.concat(entityCurves(e));
      entityPolylines(e).forEach(function (pl) {
        if (pl.closed) loops.push(dedupeLoop(pl.pts));
        else chains.push(pl.pts);
      });
    });
    if (chains.length) {
      var ch = chainSegments(chains);
      loops = loops.concat(ch.loops);
      warnings = warnings.concat(ch.warnings);
    }
    var zero = 0, out = [];
    loops.forEach(function (l) {
      var cross = l.length >= 3 ? loopSelfCrossing(l) : null;
      if (!cross && (l.length < 3 || Math.abs(signedArea(l)) <= 1e-9)) { zero++; return; }
      var pts = signedArea(l) < 0 ? l.slice().reverse() : l;
      var loop = { pts: pts, hole: false, depth: 0 };
      if (cross) loop.cross = cross;
      var seg = curveSegments(pts, curves);
      if (seg) loop.seg = seg;
      out.push(loop);
    });
    if (zero) warnings.push(zero === 1 ? '1 zero-area contour was ignored.' : zero + ' zero-area contours were ignored.');
    for (var i = 0; i < out.length; i++) {
      var depth = 0, probe = out[i].pts[0];
      // use the centroid of the first edge so a shared vertex does not confuse containment
      probe = [(out[i].pts[0][0] + out[i].pts[1][0]) / 2, (out[i].pts[0][1] + out[i].pts[1][1]) / 2];
      for (var j = 0; j < out.length; j++) {
        if (i === j) continue;
        if (pointInPoly(probe, out[j].pts)) depth++;
      }
      out[i].depth = depth;
      out[i].hole = depth % 2 === 1;
    }
    var prof = { loops: out, warnings: warnings };
    if (out.some(function (l) { return l.seg; })) prof.curves = curves;
    return prof;
  }

  // ------------------------------------------------------------------ 2D sketch geometry utilities
  // Offset a closed polygon by d (positive = outward for a CCW loop) using mitred corners.
  function offsetLoop(pts, d) {
    var ccw = signedArea(pts) >= 0, n = pts.length, out = [];
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
      var e1 = [p1[0] - p0[0], p1[1] - p0[1]], e2 = [p2[0] - p1[0], p2[1] - p1[1]];
      var l1 = Math.hypot(e1[0], e1[1]) || 1, l2 = Math.hypot(e2[0], e2[1]) || 1;
      e1 = [e1[0] / l1, e1[1] / l1]; e2 = [e2[0] / l2, e2[1] / l2];
      // outward normal of a CCW edge is the right-hand normal
      var s = ccw ? 1 : -1;
      var n1 = [e1[1] * s, -e1[0] * s], n2 = [e2[1] * s, -e2[0] * s];
      var bis = [n1[0] + n2[0], n1[1] + n2[1]], bl = Math.hypot(bis[0], bis[1]);
      if (bl < 1e-9) { out.push([p1[0] + n1[0] * d, p1[1] + n1[1] * d]); continue; }
      bis = [bis[0] / bl, bis[1] / bl];
      var cosHalf = bis[0] * n1[0] + bis[1] * n1[1];
      var m = d / Math.max(cosHalf, 0.2); // mitre length, clamped for very sharp corners
      out.push([p1[0] + bis[0] * m, p1[1] + bis[1] * m]);
    }
    return out;
  }

  // Replace vertex idx of a closed polyline with a tangent arc of radius r (returns a new point list).
  function filletPolyline(pts, idx, r, segs) {
    var n = pts.length, p0 = pts[(idx + n - 1) % n], p1 = pts[idx], p2 = pts[(idx + 1) % n];
    var a = [p0[0] - p1[0], p0[1] - p1[1]], b = [p2[0] - p1[0], p2[1] - p1[1]];
    var la = Math.hypot(a[0], a[1]), lb = Math.hypot(b[0], b[1]);
    if (la < 1e-9 || lb < 1e-9) return pts;
    a = [a[0] / la, a[1] / la]; b = [b[0] / lb, b[1] / lb];
    var cosT = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])), theta = Math.acos(cosT);
    if (theta < 0.02 || theta > Math.PI - 0.02) return pts;
    var t = r / Math.tan(theta / 2);
    if (t > la - 1e-6 || t > lb - 1e-6) throw new Error('Fillet radius too large for this corner.');
    var pa = [p1[0] + a[0] * t, p1[1] + a[1] * t], pb = [p1[0] + b[0] * t, p1[1] + b[1] * t];
    var bis = [a[0] + b[0], a[1] + b[1]], bl = Math.hypot(bis[0], bis[1]);
    var c = [p1[0] + bis[0] / bl * (r / Math.sin(theta / 2)), p1[1] + bis[1] / bl * (r / Math.sin(theta / 2))];
    var a0 = Math.atan2(pa[1] - c[1], pa[0] - c[0]), a1 = Math.atan2(pb[1] - c[1], pb[0] - c[0]);
    var sweep = a1 - a0;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    segs = segs || Math.max(3, Math.round(Math.abs(sweep) / (Math.PI / 16)));
    var arc = [];
    for (var s = 0; s <= segs; s++) { var ang = a0 + sweep * s / segs; arc.push([c[0] + r * Math.cos(ang), c[1] + r * Math.sin(ang)]); }
    var out = pts.slice(0, idx).concat(arc, pts.slice(idx + 1));
    return out;
  }

  // ------------------------------------------------------------------ 2D entity editing: mirror, pattern, trim
  function reflect2(p, P, D) {
    var t = (p[0] - P[0]) * D[0] + (p[1] - P[1]) * D[1];
    return [2 * (P[0] + D[0] * t) - p[0], 2 * (P[1] + D[1] * t) - p[1]];
  }
  // Mirror axis spec: 'x' | 'y' (sketch axes), a line entity index, or { x1, y1, x2, y2 } -> { p, d } with d unit.
  function mirrorAxis(spec, entities) {
    var p = [0, 0], d;
    if (spec === 'x' || spec == null) d = [1, 0];
    else if (spec === 'y') d = [0, 1];
    else {
      var l = typeof spec === 'number' ? (entities || [])[spec] : spec;
      if (!l || (l.t && l.t !== 'line') || l.x1 == null) throw new Error('Mirror axis must be a sketch line.');
      p = [l.x1, l.y1]; d = [l.x2 - l.x1, l.y2 - l.y1];
    }
    var L = Math.hypot(d[0], d[1]);
    if (L < 1e-9) throw new Error('Mirror axis has zero length.');
    return { p: p, d: [d[0] / L, d[1] / L] };
  }
  function mirrorEntity(e, axis) {
    var P = axis.p, D = axis.d, out;
    function m(x, y) { return reflect2([x, y], P, D); }
    var axisAligned = Math.abs(D[0]) < 1e-9 || Math.abs(D[1]) < 1e-9;
    var phi = Math.atan2(D[1], D[0]) * 180 / Math.PI;
    switch (e.t) {
      case 'line': { var a = m(e.x1, e.y1), b = m(e.x2, e.y2); out = { t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }; break; }
      case 'circle': { var c = m(e.cx, e.cy); out = { t: 'circle', cx: c[0], cy: c[1], r: e.r }; break; }
      case 'point': { var q = m(e.x, e.y); out = { t: 'point', x: q[0], y: q[1] }; break; }
      case 'slot': { var s1 = m(e.x1, e.y1), s2 = m(e.x2, e.y2); out = { t: 'slot', x1: s1[0], y1: s1[1], x2: s2[0], y2: s2[1], w: e.w }; break; }
      case 'arc': {
        // angles reflect as 2φ − a; the reflected sweep runs the other way, so swap to keep a0 < a1
        var ca = m(e.cx, e.cy), r0 = 2 * phi - e.a1, r1 = 2 * phi - e.a0;
        while (r0 < 0) { r0 += 360; r1 += 360; }
        while (r0 >= 360) { r0 -= 360; r1 -= 360; }
        out = { t: 'arc', cx: ca[0], cy: ca[1], r: e.r, a0: r0, a1: r1 };
        break;
      }
      case 'poly': { var cp = m(e.cx, e.cy); out = { t: 'poly', cx: cp[0], cy: cp[1], r: e.r, n: e.n, rot: 2 * phi - (e.rot || 0) }; break; }
      case 'rect':
      case 'crect':
      case 'polyline': {
        var pl = entityPolylines(e)[0];
        var pts = pl.pts.map(function (q) { return m(q[0], q[1]); });
        if (e.t === 'rect' && axisAligned) {
          var xs = pts.map(function (q) { return q[0]; }), ys = pts.map(function (q) { return q[1]; });
          out = { t: 'rect', x: Math.min.apply(null, xs), y: Math.min.apply(null, ys), w: e.w, h: e.h };
        } else if (e.t === 'crect' && axisAligned) {
          var cc = m(e.cx, e.cy);
          out = { t: 'crect', cx: cc[0], cy: cc[1], w: e.w, h: e.h };
        } else out = { t: 'polyline', pts: pts, closed: pl.closed };
        break;
      }
      default: return null;
    }
    if (e.construction) out.construction = true;
    return out;
  }
  function translateEntity(e, dx, dy) {
    var out = JSON.parse(JSON.stringify(e));
    switch (e.t) {
      case 'line': case 'slot': out.x1 += dx; out.y1 += dy; out.x2 += dx; out.y2 += dy; break;
      case 'rect': case 'point': out.x += dx; out.y += dy; break;
      case 'crect': case 'circle': case 'poly': case 'arc': out.cx += dx; out.cy += dy; break;
      case 'polyline': out.pts = e.pts.map(function (p) { return [p[0] + dx, p[1] + dy]; }); break;
    }
    return out;
  }

  // ------------------------------------------------------------------ sketch dimensions (Smart Dimension)
  // A dimension is { e: entityIndex, k: kind, i?: subIndex, off?: placement, ang?: placement } stored in sketch.dims.
  // Kinds: line 'len' | 'dx' | 'dy'; rect / crect 'w' | 'h' (i = edge 0 bottom, 1 right, 2 top, 3 left); circle 'dia';
  // arc / poly 'r'; slot 'len' | 'w'; polyline 'seg' (i = segment). Values are driven by the entity geometry and
  // setDimValue edits the entity so the dimension reads the new value (no constraint solver: one entity moves).
  function dimGeometry(e, d) {
    if (!e || !d) return null;
    var k = d.k;
    function linear(P, Q, dir) {
      var L = Math.hypot(dir[0], dir[1]);
      if (L < 1e-12) return null;
      dir = [dir[0] / L, dir[1] / L];
      var v = (Q[0] - P[0]) * dir[0] + (Q[1] - P[1]) * dir[1];
      if (v < 0) { v = -v; dir = [-dir[0], -dir[1]]; }
      return { type: 'linear', P: P, Q: Q, dir: dir, value: v, prefix: '' };
    }
    function radial(C, r, prefix) { return { type: 'radial', C: C, r: r, value: prefix === '⌀' ? 2 * r : r, prefix: prefix }; }
    function rectCorners(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
    function rectDim(c) {
      var i = d.i | 0;
      if (k === 'w') return i === 2 ? linear(c[3], c[2], [1, 0]) : linear(c[0], c[1], [1, 0]);
      if (k === 'h') return i === 1 ? linear(c[1], c[2], [0, 1]) : linear(c[0], c[3], [0, 1]);
      return null;
    }
    switch (e.t) {
      case 'line':
        if (k === 'len') return linear([e.x1, e.y1], [e.x2, e.y2], [e.x2 - e.x1, e.y2 - e.y1]);
        if (k === 'dx') return linear([e.x1, e.y1], [e.x2, e.y2], [1, 0]);
        if (k === 'dy') return linear([e.x1, e.y1], [e.x2, e.y2], [0, 1]);
        return null;
      case 'rect': return rectDim(rectCorners(e.x, e.y, e.w, e.h));
      case 'crect': return rectDim(rectCorners(e.cx - e.w / 2, e.cy - e.h / 2, e.w, e.h));
      case 'circle': return k === 'dia' ? radial([e.cx, e.cy], e.r, '⌀') : null;
      case 'arc': case 'poly': return k === 'r' ? radial([e.cx, e.cy], e.r, 'R') : null;
      case 'slot': {
        var dx = e.x2 - e.x1, dy = e.y2 - e.y1, L = Math.hypot(dx, dy);
        if (k === 'len') return linear([e.x1, e.y1], [e.x2, e.y2], [dx, dy]);
        if (k === 'w') {
          var n = L < 1e-12 ? [0, 1] : [-dy / L, dx / L];
          return linear([e.x1 + n[0] * e.w / 2, e.y1 + n[1] * e.w / 2], [e.x1 - n[0] * e.w / 2, e.y1 - n[1] * e.w / 2], n);
        }
        return null;
      }
      case 'polyline': {
        if (k !== 'seg') return null;
        var n2 = e.pts.length, i2 = d.i | 0;
        if (i2 < 0 || i2 >= (e.closed ? n2 : n2 - 1)) return null;
        var A = e.pts[i2], B = e.pts[(i2 + 1) % n2];
        return linear([A[0], A[1]], [B[0], B[1]], [B[0] - A[0], B[1] - A[1]]);
      }
    }
    return null;
  }
  function dimValue(e, d) { var g = dimGeometry(e, d); return g ? g.value : null; }
  // Change the entity so the dimension reads `v`. Throws on invalid values; returns the entity.
  function setDimValue(e, d, v) {
    v = +v;
    if (!(v > 0) || !isFinite(v)) throw new Error('Dimension must be a positive number.');
    var g = dimGeometry(e, d);
    if (!g) throw new Error('That dimension no longer applies to the entity.');
    var k = d.k;
    switch (e.t) {
      case 'line': {
        if (k === 'len') { e.x2 = e.x1 + g.dir[0] * v; e.y2 = e.y1 + g.dir[1] * v; }
        else if (k === 'dx') e.x2 = e.x1 + (e.x2 >= e.x1 ? v : -v);
        else e.y2 = e.y1 + (e.y2 >= e.y1 ? v : -v);
        break;
      }
      case 'rect': if (k === 'w') { if ((d.i | 0) === 3) e.x += e.w - v; e.w = v; } else { if ((d.i | 0) === 2) e.y += e.h - v; e.h = v; } break;
      case 'crect': if (k === 'w') e.w = v; else e.h = v; break;
      case 'circle': e.r = v / 2; break;
      case 'arc': case 'poly': e.r = v; break;
      case 'slot': if (k === 'len') { e.x2 = e.x1 + g.dir[0] * v; e.y2 = e.y1 + g.dir[1] * v; } else e.w = v; break;
      case 'polyline': {
        var i = d.i | 0, n = e.pts.length, dl = v - g.value, mv = [g.dir[0] * dl, g.dir[1] * dl];
        // open chains carry the rest of the chain along; closed loops move just the far vertex
        var last = e.closed ? i + 1 : n - 1;
        for (var j = i + 1; j <= last; j++) { var p = e.pts[j % n]; p[0] += mv[0]; p[1] += mv[1]; }
        break;
      }
    }
    return e;
  }
  function segDist2(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    var t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }
  // Which dimension a Smart Dimension click at sketch point uv on entity e means: { k, i } or null.
  function dimForEntity(e, uv) {
    if (!e) return null;
    switch (e.t) {
      case 'line': {
        var minx = Math.min(e.x1, e.x2), maxx = Math.max(e.x1, e.x2), miny = Math.min(e.y1, e.y2), maxy = Math.max(e.y1, e.y2);
        var slanted = maxx - minx > 1e-9 && maxy - miny > 1e-9;
        if (slanted && uv) {
          var inX = uv[0] >= minx && uv[0] <= maxx, inY = uv[1] >= miny && uv[1] <= maxy;
          if (inX && !inY) return { k: 'dx' };
          if (inY && !inX) return { k: 'dy' };
        }
        return { k: 'len' };
      }
      case 'rect': case 'crect': {
        var c = e.t === 'rect' ? [[e.x, e.y], [e.x + e.w, e.y], [e.x + e.w, e.y + e.h], [e.x, e.y + e.h]]
          : [[e.cx - e.w / 2, e.cy - e.h / 2], [e.cx + e.w / 2, e.cy - e.h / 2], [e.cx + e.w / 2, e.cy + e.h / 2], [e.cx - e.w / 2, e.cy + e.h / 2]];
        var best = 0, bd = Infinity;
        for (var i = 0; i < 4; i++) { var dd = segDist2(uv || c[0], c[i], c[(i + 1) % 4]); if (dd < bd) { bd = dd; best = i; } }
        return { k: best % 2 === 0 ? 'w' : 'h', i: best };
      }
      case 'circle': return { k: 'dia' };
      case 'arc': case 'poly': return { k: 'r' };
      case 'slot': {
        if (!uv) return { k: 'len' };
        var dx = e.x2 - e.x1, dy = e.y2 - e.y1, L2 = dx * dx + dy * dy;
        var t = L2 > 0 ? ((uv[0] - e.x1) * dx + (uv[1] - e.y1) * dy) / L2 : 0.5;
        return { k: t >= 0 && t <= 1 ? 'len' : 'w' };
      }
      case 'polyline': {
        var n = e.pts.length, cnt = e.closed ? n : n - 1, bi = 0, bdd = Infinity;
        for (var s = 0; s < cnt; s++) { var q = segDist2(uv || e.pts[0], e.pts[s], e.pts[(s + 1) % n]); if (q < bdd) { bdd = q; bi = s; } }
        return { k: 'seg', i: bi };
      }
    }
    return null;
  }

  // Exact primitives of an entity for trimming: { kind: 'seg', a, b } or { kind: 'arc', c, r, a0, a1 } (radians, a0 < a1).
  function entityPrimitives(e) {
    var d2r = Math.PI / 180;
    switch (e.t) {
      case 'line': return [{ kind: 'seg', a: [e.x1, e.y1], b: [e.x2, e.y2] }];
      case 'circle': return [{ kind: 'arc', c: [e.cx, e.cy], r: e.r, a0: 0, a1: 2 * Math.PI, full: true }];
      case 'arc': {
        var lo = Math.min(e.a0, e.a1) * d2r, hi = Math.max(e.a0, e.a1) * d2r;
        return [{ kind: 'arc', c: [e.cx, e.cy], r: e.r, a0: lo, a1: hi }];
      }
      case 'slot': {
        var dx = e.x2 - e.x1, dy = e.y2 - e.y1, L = Math.hypot(dx, dy), r = e.w / 2;
        if (L < 1e-9) return entityPrimitives({ t: 'circle', cx: e.x1, cy: e.y1, r: r });
        var ang = Math.atan2(dy, dx), nx = -dy / L * r, ny = dx / L * r;
        return [
          { kind: 'seg', a: [e.x1 + nx, e.y1 + ny], b: [e.x2 + nx, e.y2 + ny] },
          { kind: 'arc', c: [e.x2, e.y2], r: r, a0: ang - Math.PI / 2, a1: ang + Math.PI / 2 },
          { kind: 'seg', a: [e.x2 - nx, e.y2 - ny], b: [e.x1 - nx, e.y1 - ny] },
          { kind: 'arc', c: [e.x1, e.y1], r: r, a0: ang + Math.PI / 2, a1: ang + 3 * Math.PI / 2 }
        ];
      }
      case 'rect': case 'crect': case 'poly': case 'polyline': {
        var pl = entityPolylines(e)[0], pts = pl.pts, out = [], n = pts.length, cnt = pl.closed ? n : n - 1;
        for (var i = 0; i < cnt; i++) out.push({ kind: 'seg', a: pts[i], b: pts[(i + 1) % n] });
        return out;
      }
    }
    return [];
  }
  function angleIn(a, a0, a1) {
    var t = a;
    while (t < a0 - 1e-9) t += 2 * Math.PI;
    while (t >= a0 + 2 * Math.PI - 1e-9) t -= 2 * Math.PI;
    return t <= a1 + 1e-9 ? t : null;
  }
  // Intersection parameters on primitive p with primitive q: seg → t in [0,1], arc → angle in [a0, a1].
  function primIntersections(p, q) {
    var out = [], eps = 1e-9;
    if (p.kind === 'seg' && q.kind === 'seg') {
      var d1 = [p.b[0] - p.a[0], p.b[1] - p.a[1]], d2 = [q.b[0] - q.a[0], q.b[1] - q.a[1]];
      var den = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(den) < eps) return out;
      var w = [q.a[0] - p.a[0], q.a[1] - p.a[1]];
      var t = (w[0] * d2[1] - w[1] * d2[0]) / den, u = (w[0] * d1[1] - w[1] * d1[0]) / den;
      if (t > -eps && t < 1 + eps && u > -eps && u < 1 + eps) out.push(t);
      return out;
    }
    if (p.kind === 'seg' && q.kind === 'arc') {
      var d = [p.b[0] - p.a[0], p.b[1] - p.a[1]], f = [p.a[0] - q.c[0], p.a[1] - q.c[1]];
      var A = d[0] * d[0] + d[1] * d[1], B = 2 * (f[0] * d[0] + f[1] * d[1]), C = f[0] * f[0] + f[1] * f[1] - q.r * q.r;
      var disc = B * B - 4 * A * C;
      if (disc < 0 || A < eps) return out;
      var sq = Math.sqrt(disc);
      [(-B - sq) / (2 * A), (-B + sq) / (2 * A)].forEach(function (t) {
        if (t < -eps || t > 1 + eps) return;
        var x = p.a[0] + d[0] * t, y = p.a[1] + d[1] * t;
        if (angleIn(Math.atan2(y - q.c[1], x - q.c[0]), q.a0, q.a1) != null) out.push(t);
      });
      return out;
    }
    if (p.kind === 'arc' && q.kind === 'seg') {
      var ts = primIntersections(q, p);
      ts.forEach(function (t) {
        var x = q.a[0] + (q.b[0] - q.a[0]) * t, y = q.a[1] + (q.b[1] - q.a[1]) * t;
        var a = angleIn(Math.atan2(y - p.c[1], x - p.c[0]), p.a0, p.a1);
        if (a != null) out.push(a);
      });
      return out;
    }
    // arc-arc: circle intersection
    var dx = q.c[0] - p.c[0], dy = q.c[1] - p.c[1], D = Math.hypot(dx, dy);
    if (D < eps || D > p.r + q.r + eps || D < Math.abs(p.r - q.r) - eps) return out;
    var a2 = (p.r * p.r - q.r * q.r + D * D) / (2 * D), h2 = Math.max(0, p.r * p.r - a2 * a2), h = Math.sqrt(h2);
    var mx = p.c[0] + dx / D * a2, my = p.c[1] + dy / D * a2;
    [[mx + h * -dy / D, my + h * dx / D], [mx - h * -dy / D, my - h * dx / D]].forEach(function (pt, i) {
      if (i === 1 && h < eps) return;
      if (angleIn(Math.atan2(pt[1] - q.c[1], pt[0] - q.c[0]), q.a0, q.a1) == null) return;
      var a = angleIn(Math.atan2(pt[1] - p.c[1], pt[0] - p.c[0]), p.a0, p.a1);
      if (a != null) out.push(a);
    });
    return out;
  }
  function primParamAt(p, uv) {
    if (p.kind === 'seg') {
      var d = [p.b[0] - p.a[0], p.b[1] - p.a[1]], L2 = d[0] * d[0] + d[1] * d[1];
      var t = L2 > 1e-12 ? Math.max(0, Math.min(1, ((uv[0] - p.a[0]) * d[0] + (uv[1] - p.a[1]) * d[1]) / L2)) : 0;
      return { t: t, dist: Math.hypot(uv[0] - p.a[0] - d[0] * t, uv[1] - p.a[1] - d[1] * t) };
    }
    var ang = Math.atan2(uv[1] - p.c[1], uv[0] - p.c[0]), a = angleIn(ang, p.a0, p.a1);
    if (a == null) {
      // outside the arc's span: nearest endpoint
      var e0 = [p.c[0] + p.r * Math.cos(p.a0), p.c[1] + p.r * Math.sin(p.a0)], e1 = [p.c[0] + p.r * Math.cos(p.a1), p.c[1] + p.r * Math.sin(p.a1)];
      var d0 = Math.hypot(uv[0] - e0[0], uv[1] - e0[1]), d1 = Math.hypot(uv[0] - e1[0], uv[1] - e1[1]);
      return d0 < d1 ? { t: p.a0, dist: d0 } : { t: p.a1, dist: d1 };
    }
    return { t: a, dist: Math.abs(Math.hypot(uv[0] - p.c[0], uv[1] - p.c[1]) - p.r) };
  }
  function primPoint(p, t) {
    if (p.kind === 'seg') return [p.a[0] + (p.b[0] - p.a[0]) * t, p.a[1] + (p.b[1] - p.a[1]) * t];
    return [p.c[0] + p.r * Math.cos(t), p.c[1] + p.r * Math.sin(t)];
  }
  function r2d(a) { return a * 180 / Math.PI; }

  // Trim: remove the portion of entity `idx` between the intersections on either side of the point uv.
  // Returns the new entity list (the trimmed entity is replaced by 0..n pieces). Slots are exploded into lines
  // and arcs first; rectangles and polygons become polylines.
  function trimEntity(entities, idx, uv) {
    var e = entities[idx];
    if (!e || e.t === 'point') throw new Error('Nothing to trim there.');
    if (e.t === 'slot') {
      var parts = entityPrimitives(e).map(function (p) {
        var o = p.kind === 'seg' ? { t: 'line', x1: p.a[0], y1: p.a[1], x2: p.b[0], y2: p.b[1] } : { t: 'arc', cx: p.c[0], cy: p.c[1], r: p.r, a0: r2d(p.a0), a1: r2d(p.a1) };
        if (e.construction) o.construction = true;
        return o;
      });
      var list = entities.slice(0, idx).concat(parts, entities.slice(idx + 1));
      var best = -1, bestD = Infinity;
      parts.forEach(function (p, i) { var q = primParamAt(entityPrimitives(p)[0], uv); if (q.dist < bestD) { bestD = q.dist; best = idx + i; } });
      return trimEntity(list, best, uv);
    }
    var prims = entityPrimitives(e), k = -1, kd = Infinity, kt = 0;
    prims.forEach(function (p, i) { var q = primParamAt(p, uv); if (q.dist < kd) { kd = q.dist; k = i; kt = q.t; } });
    if (k < 0) throw new Error('Nothing to trim there.');
    var prim = prims[k], params = [];
    entities.forEach(function (o, oi) {
      if (o.t === 'point') return;
      entityPrimitives(o).forEach(function (q, qi) {
        if (oi === idx && qi === k) return;
        primIntersections(prim, q).forEach(function (t) { params.push(t); });
      });
    });
    var isArc = prim.kind === 'arc', start = isArc ? prim.a0 : 0, end = isArc ? prim.a1 : 1, span = end - start;
    var lo = null, hi = null;
    params.forEach(function (t) {
      if (t < kt - 1e-7 && (lo == null || t > lo)) lo = t;
      if (t > kt + 1e-7 && (hi == null || t < hi)) hi = t;
    });
    if (prim.full) {
      if (params.length < 2) return entities.slice(0, idx).concat(entities.slice(idx + 1));
      if (lo == null) lo = Math.max.apply(null, params) - 2 * Math.PI;
      if (hi == null) hi = Math.min.apply(null, params) + 2 * Math.PI;
      var arc = { t: 'arc', cx: e.cx, cy: e.cy, r: e.r, a0: r2d(hi), a1: r2d(lo + 2 * Math.PI) };
      while (arc.a0 >= 360) { arc.a0 -= 360; arc.a1 -= 360; }
      if (e.construction) arc.construction = true;
      return entities.slice(0, idx).concat([arc], entities.slice(idx + 1));
    }
    if (lo == null) lo = start;
    if (hi == null) hi = end;
    var pieces = [], tiny = span * 1e-6;
    function keep(o) { if (e.construction) o.construction = true; pieces.push(o); }
    if (e.t === 'line') {
      if (lo - start > tiny) { var pa = primPoint(prim, lo); keep({ t: 'line', x1: e.x1, y1: e.y1, x2: pa[0], y2: pa[1] }); }
      if (end - hi > tiny) { var pb = primPoint(prim, hi); keep({ t: 'line', x1: pb[0], y1: pb[1], x2: e.x2, y2: e.y2 }); }
    } else if (e.t === 'arc') {
      if (lo - start > tiny) keep({ t: 'arc', cx: e.cx, cy: e.cy, r: e.r, a0: r2d(start), a1: r2d(lo) });
      if (end - hi > tiny) keep({ t: 'arc', cx: e.cx, cy: e.cy, r: e.r, a0: r2d(hi), a1: r2d(end) });
    } else {
      // polyline-like: edge k of pts runs pts[k] -> pts[k+1]
      var pl = entityPolylines(e)[0], pts = pl.pts, n = pts.length;
      var pLo = primPoint(prim, lo), pHi = primPoint(prim, hi);
      if (pl.closed) {
        var seq = [];
        if (end - hi > tiny) seq.push(pHi);
        for (var i = 1; i <= n; i++) seq.push(pts[(k + i) % n]);
        if (lo - start > tiny) seq.push(pLo);
        if (seq.length >= 2) keep({ t: 'polyline', pts: seq, closed: false });
      } else {
        var first = pts.slice(0, k + 1); if (lo - start > tiny) first.push(pLo);
        var second = (end - hi > tiny ? [pHi] : []).concat(pts.slice(k + 1));
        if (first.length >= 2) keep({ t: 'polyline', pts: first, closed: false });
        if (second.length >= 2) keep({ t: 'polyline', pts: second, closed: false });
      }
    }
    return entities.slice(0, idx).concat(pieces, entities.slice(idx + 1));
  }

  // ------------------------------------------------------------------ triangulation (ear clipping, CCW input)
  function triangulate(pts) {
    var n = pts.length, idx = [], tris = [], i;
    for (i = 0; i < n; i++) idx.push(i);
    function area2(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
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

  // ------------------------------------------------------------------ analytic surface records (true curves)
  // A facet that approximates a curved face carries polygon.surf = { s: surface, P?, Q?, e0?, dphi? }; facets of one
  // curved face share the surface object:
  //   { t: 'cyl',  o, d, r }        cylinder: axis through o along the unit d, radius r
  //   { t: 'cone', o, d, r, k }     cone: radius r + k·z at axial coordinate z = (x − o)·d
  //   { t: 'sph',  o, d, r }        sphere: centre o (d: the axis of the revolve that made it)
  //   { t: 'tor',  o, d, R, r }     torus: centre o on the axis d, major radius R (signed), tube radius r
  // Spheres and tori come from revolving a profile arc; their facets also carry the chord of the profile arc they
  // were made from, P and Q = [ρ, z] (radius from the axis, axial coordinate from o), plus e0 (the radial direction
  // at angle 0) and dphi (the angle one ring of facets spans). The records survive CSG splits, clones, transforms
  // and pack / unpack (csg.js), so every fragment of a curved face knows its exact surface; massProps integrates the
  // difference between the facets and the true surfaces (curveCorrection), exports and drawings read the circles.
  function loopCurves(profile, loop) {
    if (!loop.seg || !profile.curves) return null;
    return loop.seg.map(function (k) { return k >= 0 ? profile.curves[k] : null; });
  }
  function cylSurf(plane, C) { return { t: 'cyl', o: to3D(plane, C.c[0], C.c[1]), d: plane.n.slice(), r: C.r }; }
  // attach one record per curve to the side facets of segments that are chords of it
  function tagSides(sides, cv, make) {
    if (!cv) return;
    var memo = [];
    for (var i = 0; i < sides.length; i++) {
      var C = cv[i];
      if (!C || !sides[i]) continue;
      var k = memo.indexOf(C);
      if (k < 0) { memo.push(C); memo.push({ s: make(C, i) }); k = memo.length - 2; }
      sides[i].surf = memo[k + 1];
    }
  }

  function prism(loop, plane, a, b, shared, cv) {
    var polys = [], n = loop.length, sides = [];
    var na = scale(plane.n, a), nb = scale(plane.n, b);
    var bottom = loop.map(function (p) { return add(to3D(plane, p[0], p[1]), na); });
    var top = loop.map(function (p) { return add(to3D(plane, p[0], p[1]), nb); });
    var tris = triangulate(loop);
    tris.forEach(function (t) {
      pushPoly(polys, [top[t[0]], top[t[1]], top[t[2]]], shared);
      pushPoly(polys, [bottom[t[2]], bottom[t[1]], bottom[t[0]]], shared);
    });
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      sides.push(poly([bottom[i], bottom[j], top[j], top[i]], shared));
    }
    tagSides(sides, cv, function (C) { return cylSurf(plane, C); });
    sides.forEach(function (p) { if (p) polys.push(p); });
    return ensureOutward(polys);
  }

  function rotatePoint(p, A, D, ang) {
    var v = sub(p, A), c = Math.cos(ang), s = Math.sin(ang);
    var r = add(add(scale(v, c), scale(cross(D, v), s)), scale(D, dot(D, v) * (1 - c)));
    return add(A, r);
  }

  function revolveSegs(rmax, angleDeg) {
    return Math.max(8, Math.round((TESS.legacy ? 48 : segsForRadius(rmax)) * Math.abs(angleDeg) / 360));
  }
  // segs: rings of facets (default: from the loop's largest radius and the chord tolerance); cv: loopCurves
  function revolveLoop(loop, plane, axisP, axisD, angleDeg, shared, cv, segs) {
    var A = to3D(plane, axisP[0], axisP[1]);
    var D = norm(sub(to3D(plane, axisP[0] + axisD[0], axisP[1] + axisD[1]), A));
    var full = Math.abs(angleDeg) >= 360 - 1e-6;
    // profile points as (ρ, z) about the axis; e = the radial direction of the profile's side (angle 0)
    var rz = loop.map(function (p) { var P = to3D(plane, p[0], p[1]), z = dot(sub(P, A), D); return [len(sub(sub(P, A), scale(D, z))), z, P]; });
    var rmax = 0, e = null;
    rz.forEach(function (q) { if (q[0] > rmax) { rmax = q[0]; e = norm(sub(sub(q[2], A), scale(D, q[1]))); } });
    if (!segs) segs = revolveSegs(rmax, angleDeg);
    var rings = [], s, i;
    for (s = 0; s <= segs; s++) {
      var ang = angleDeg * Math.PI / 180 * s / segs;
      rings.push(loop.map(function (p) { return rotatePoint(to3D(plane, p[0], p[1]), A, D, ang); }));
    }
    if (full) rings[segs] = rings[0];
    var polys = [], n = loop.length;
    // one surface record per profile segment (see "analytic surface records"); planar annuli and segments on the
    // axis get none
    var eps = 1e-9 * Math.max(1, rmax), surfs = [], dphi = angleDeg * Math.PI / 180 / segs;
    for (i = 0; i < n && e; i++) {
      var qi = rz[i], qj = rz[(i + 1) % n], C = cv && cv[i], S = null;
      if (C) {
        var C3 = to3D(plane, C.c[0], C.c[1]), zc = dot(sub(C3, A), D), rc = dot(sub(sub(C3, A), scale(D, zc)), e);
        var o = add(A, scale(D, zc));
        S = Math.abs(rc) < 1e-9 * Math.max(1, C.r) ? { t: 'sph', o: o, d: D.slice(), r: C.r } : { t: 'tor', o: o, d: D.slice(), R: rc, r: C.r };
        surfs.push({ s: S, P: [qi[0], qi[1] - zc], Q: [qj[0], qj[1] - zc], e0: e.slice(), dphi: dphi });
        continue;
      }
      var dz = qj[1] - qi[1], dr = qj[0] - qi[0];
      if (Math.abs(dz) <= eps || (qi[0] <= eps && qj[0] <= eps)) { surfs.push(null); continue; }
      if (Math.abs(dr) <= eps) S = { t: 'cyl', o: A.slice(), d: D.slice(), r: qi[0] };
      else S = { t: 'cone', o: A.slice(), d: D.slice(), r: qi[0] - dr / dz * qi[1], k: dr / dz };
      surfs.push({ s: S });
    }
    for (s = 0; s < segs; s++) {
      var r0 = rings[s], r1 = rings[s + 1];
      for (i = 0; i < n; i++) {
        var j = (i + 1) % n;
        var quad = [r0[i], r1[i], r1[j], r0[j]];
        // drop duplicate points (vertices on the axis)
        var clean = [];
        for (var q = 0; q < 4; q++) {
          var a = quad[q], b = quad[(q + 1) % 4];
          if (len(sub(a, b)) > 1e-7) clean.push(a);
        }
        if (clean.length < 3) continue;
        var pg = poly(clean, shared);
        if (!pg) continue;
        if (surfs[i]) pg.surf = surfs[i];
        polys.push(pg);
      }
    }
    if (!full) {
      var tris = triangulate(loop);
      var first = rings[0], last = rings[segs];
      tris.forEach(function (t) {
        pushPoly(polys, [first[t[0]], first[t[1]], first[t[2]]], shared);
        pushPoly(polys, [last[t[2]], last[t[1]], last[t[0]]], shared);
      });
    }
    return ensureOutward(polys);
  }

  function unionAll(list) {
    if (!list.length) return null;
    var acc = list[0];
    for (var i = 1; i < list.length; i++) acc = acc.union(list[i]);
    return acc;
  }
  // Balanced pairwise union: far fewer polygon splits than a running union when the list is long.
  function unionTree(list) {
    if (!list.length) return null;
    if (list.length === 1) return list[0];
    var mid = list.length >> 1;
    return unionTree(list.slice(0, mid)).union(unionTree(list.slice(mid)));
  }

  // Solid from a profile: disjoint outer prisms concatenated, holes subtracted (slightly overshooting the caps).
  function solidFromProfile(profile, makeSolid) {
    checkProfile(profile);
    var outers = [], holes = [];
    profile.loops.forEach(function (l) {
      var solid = makeSolid(l.pts, l.hole, loopCurves(profile, l));
      if (!solid) return;
      (l.hole ? holes : outers).push(solid);
    });
    if (!outers.length) throw new Error('Sketch has no closed profile.');
    var body = CSG.fromPolygons([].concat.apply([], outers.map(function (o) { return o.polygons; })));
    if (holes.length) body = body.subtract(unionAll(holes));
    return body;
  }

  var THROUGH = 5000;

  function extrudeRange(f, through) {
    through = through || THROUGH;
    if (f.depth != null && !isFinite(+f.depth)) throw new Error('Extrude depth must be a number.');
    if (f.dir2 && f.depth2 != null && !isFinite(+f.depth2)) throw new Error('Extrude depth must be a number.');
    var d = Math.abs(+f.depth || 0);
    var a, b;
    switch (f.end) {
      case 'through': a = 0; b = through; break;
      case 'mid': a = -d / 2; b = d / 2; break;
      default: a = 0; b = d;
    }
    if (f.reverse) { var t = -a; a = -b; b = t; }
    if (f.dir2) {
      var d2 = f.end2 === 'through' ? through : Math.abs(+f.depth2 || 0);
      if (f.reverse) b = Math.max(b, d2); else a = Math.min(a, -d2);
    }
    if (b - a < 1e-9) throw new Error('Extrude depth must be greater than zero.');
    return [a, b];
  }

  // Prism whose section is offset by offA at plane offset a and by offB at b (mitred offsets keep corresponding
  // edges parallel, so the side quads stay planar). Used for drafted extrudes.
  // On chords of true curves (cv, loopCurves) the offset is radial, so the section stays inscribed in the offset
  // circle and the side facets lie on a true cone (a mitred offset would inscribe them in a circle of radius
  // r + d / cos(half chord angle)); a vertex where a curve meets a tangent line or a tangent curve is offset radially
  // too, which keeps the line's facet planar.
  function curveOffset(loop, d, cv) {
    var out = offsetLoop(loop, d);
    if (!cv || !d || TESS.legacy) return out;
    var n = loop.length;
    function radial(i, C) {
      var p = loop[i], u = [(p[0] - C.c[0]) / C.r, (p[1] - C.c[1]) / C.r];
      // convex arc (centre on the left of a CCW loop): outward is away from the centre
      var k = cv.indexOf(C), a = loop[k], b = loop[(k + 1) % n];
      var sg = ((b[0] - a[0]) * (C.c[1] - a[1]) - (b[1] - a[1]) * (C.c[0] - a[0])) > 0 ? 1 : -1;
      if (signedArea(loop) < 0) sg = -sg;
      return [C.c[0] + u[0] * (C.r + sg * d), C.c[1] + u[1] * (C.r + sg * d)];
    }
    function dir(i, j) { var a = loop[i], b = loop[j], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; }
    for (var i = 0; i < n; i++) {
      var ip = (i + n - 1) % n, Cp = cv[ip], Cn = cv[i];
      if (!Cp && !Cn) continue;
      if (Cp && Cn && Cp === Cn) { out[i] = radial(i, Cn); continue; }
      var C = Cn || Cp, other = Cn ? Cp : Cn, u = [(loop[i][0] - C.c[0]) / C.r, (loop[i][1] - C.c[1]) / C.r];
      var tangent;
      if (!other) { var t = Cn ? dir(ip, i) : dir(i, (i + 1) % n); tangent = Math.abs(t[0] * u[0] + t[1] * u[1]) < 1e-6; }
      else { var u2 = [(loop[i][0] - other.c[0]) / other.r, (loop[i][1] - other.c[1]) / other.r]; tangent = Math.abs(u[0] * u2[1] - u[1] * u2[0]) < 1e-6; }
      if (tangent) out[i] = radial(i, C);
    }
    return out;
  }
  function taperedPrism(loop, plane, a, b, offA, offB, shared, cv) {
    var la = offA ? curveOffset(loop, offA, cv) : loop, lb = offB ? curveOffset(loop, offB, cv) : loop;
    // an offset loop has collapsed when any edge reverses direction (a square offset past its centre keeps its area sign)
    function collapsed(off) {
      for (var i = 0; i < loop.length; i++) {
        var j = (i + 1) % loop.length;
        if ((loop[j][0] - loop[i][0]) * (off[j][0] - off[i][0]) + (loop[j][1] - loop[i][1]) * (off[j][1] - off[i][1]) <= 1e-12) return true;
      }
      return signedArea(off) <= 1e-9;
    }
    if (collapsed(la) || collapsed(lb)) throw new Error('Draft angle is too large for this depth: the profile collapses.');
    var polys = [], n = loop.length;
    var na = scale(plane.n, a), nb = scale(plane.n, b);
    var bottom = la.map(function (p) { return add(to3D(plane, p[0], p[1]), na); });
    var top = lb.map(function (p) { return add(to3D(plane, p[0], p[1]), nb); });
    triangulate(lb).forEach(function (t) { pushPoly(polys, [top[t[0]], top[t[1]], top[t[2]]], shared); });
    triangulate(la).forEach(function (t) { pushPoly(polys, [bottom[t[2]], bottom[t[1]], bottom[t[0]]], shared); });
    var sides = [];
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      sides.push(poly([bottom[i], bottom[j], top[j], top[i]], shared));
    }
    // the cone through the chord ends: radius at the sketch plane and slope from the section's own vertices
    tagSides(sides, cv, function (C, i) {
      var v = cv[(i + n - 1) % n] === C ? i : (i + 1) % n; // prefer a vertex inside the arc over a junction
      var ra = Math.hypot(la[v][0] - C.c[0], la[v][1] - C.c[1]), rb = Math.hypot(lb[v][0] - C.c[0], lb[v][1] - C.c[1]);
      var k = (rb - ra) / (b - a);
      if (Math.abs(k) < 1e-12) return cylSurf(plane, { c: C.c, r: ra });
      return { t: 'cone', o: to3D(plane, C.c[0], C.c[1]), d: plane.n.slice(), r: ra - k * a, k: k };
    });
    sides.forEach(function (p) { if (p) polys.push(p); });
    return ensureOutward(polys);
  }

  function buildExtrude(f, sketch, plane, through) {
    var profile = sketch.profile || sketchProfile(sketch);
    var range = extrudeRange(f, through);
    if (f.draft != null && !isFinite(+f.draft)) throw new Error('Draft angle must be a number.');
    var draft = +f.draft || 0;
    if (Math.abs(draft) >= 89) throw new Error('Draft angle must be less than 89°.');
    // draft: the section shrinks (or grows, with draftOut) by |t|·tan(angle) at distance t from the sketch plane
    var k = draft ? Math.tan(draft * Math.PI / 180) * (f.draftOut ? 1 : -1) : 0;
    return solidFromProfile(profile, function (pts, hole, cv) {
      var a = range[0], b = range[1];
      if (hole) { a -= 0.01; b += 0.01; }
      if (!k) return prism(pts, plane, a, b, f.id, cv);
      var s = hole ? -1 : 1; // holes are the complement: they grow when the material shrinks
      function part(a0, b0) { return taperedPrism(pts, plane, a0, b0, s * k * Math.abs(a0), s * k * Math.abs(b0), f.id, cv); }
      // the taper starts at the sketch plane on both sides (mid-plane, direction 2), so split there
      if (a < -1e-9 && b > 1e-9) return part(a, 0).union(part(0, b));
      return part(a, b);
    });
  }

  function revolveAxis(f, sketch) {
    var ax = f.axis;
    if (ax === 'y' || ax == null) return { p: [0, 0], d: [0, 1] };
    if (ax === 'x') return { p: [0, 0], d: [1, 0] };
    if (typeof ax === 'object' && ax.x1 != null) return { p: [ax.x1, ax.y1], d: [ax.x2 - ax.x1, ax.y2 - ax.y1] };
    var e = sketch.entities[ax];
    if (!e || e.t !== 'line') throw new Error('Revolve axis must be a sketch line.');
    return { p: [e.x1, e.y1], d: [e.x2 - e.x1, e.y2 - e.y1] };
  }

  function buildRevolve(f, sketch, plane) {
    var profile = sketch.profile || sketchProfile(sketch);
    var axis = revolveAxis(f, sketch);
    var axisLine = f.axis, isLine = typeof axisLine === 'number';
    if (f.angle != null && !isFinite(+f.angle)) throw new Error('Revolve angle must be a number.');
    var angle = +f.angle || 360;
    if (f.reverse) angle = -angle;
    var dl = len([axis.d[0], axis.d[1], 0]);
    if (dl < 1e-9) throw new Error('Revolve axis has zero length.');
    var d = [axis.d[0] / dl, axis.d[1] / dl];
    // one ring count for the whole feature, from the largest radius of any loop
    var rmax = 0;
    profile.loops.forEach(function (l) { l.pts.forEach(function (p) { rmax = Math.max(rmax, Math.abs((p[0] - axis.p[0]) * d[1] - (p[1] - axis.p[1]) * d[0])); }); });
    var segs = revolveSegs(rmax, angle);
    return solidFromProfile(profile, function (pts, hole, cv) {
      // reject loops crossing the axis
      var side = 0;
      for (var i = 0; i < pts.length; i++) {
        var s = (pts[i][0] - axis.p[0]) * d[1] - (pts[i][1] - axis.p[1]) * d[0];
        if (Math.abs(s) < 1e-7) continue;
        if (side === 0) side = s > 0 ? 1 : -1;
        else if ((s > 0 ? 1 : -1) !== side) throw new Error('Revolve profile crosses the axis.');
      }
      return revolveLoop(pts, plane, axis.p, d, angle, f.id, cv, segs);
    });
  }

  function translateBody(body, t) {
    return body.transform(function (p) { return new CSG.Vector(p.x + t[0], p.y + t[1], p.z + t[2]); }, false);
  }
  function rotateBody(body, center, axis, angleDeg) {
    var ang = angleDeg * Math.PI / 180;
    return body.transform(function (p) { return vec(rotatePoint(arr(p), center, axis, ang)); }, false);
  }
  function mirrorBody(body, plane) {
    var n = plane.n, o = plane.origin;
    return body.transform(function (p) {
      var q = arr(p);
      var dd = dot(sub(q, o), n);
      return vec(sub(q, scale(n, 2 * dd)));
    }, true);
  }

  // ------------------------------------------------------------------ equations (global variables)
  // model.equations = [{ name: 'T', expr: '10' }, ...] in order; each expression may use the ones before it. Any
  // numeric field of a feature (depth, angle, spacing, count, r, d, thickness, offset, ... at any depth) may hold a
  // string beginning with "=" instead of a number ('=T*2'); rebuild resolves it against the variables first.
  // References and sketch geometry are never expressions: the keys in EXPR_SKIP are copied untouched.
  var EXPR_SKIP = { id: 1, type: 1, name: 1, entities: 1, profile: 1, sketch: 1, path: 1, edges: 1, faces: 1, bodies: 1, feature: 1 };
  var EXPR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
  var EXPR_CONST = { pi: Math.PI, e: Math.E };
  function fixedArity(fn, n, name) {
    return function (args) {
      if (args.length !== n) throw new Error('"' + name + '" expects ' + n + ' argument' + (n === 1 ? '' : 's'));
      return fn.apply(null, args);
    };
  }
  function variadic(fn, name) {
    return function (args) {
      if (!args.length) throw new Error('"' + name + '" expects at least 1 argument');
      return fn.apply(null, args);
    };
  }
  var D2R = Math.PI / 180;
  var EXPR_FN = {};
  ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sqrt', 'cbrt', 'abs', 'floor', 'ceil', 'round', 'trunc', 'sign', 'exp', 'log', 'log10', 'log2'].forEach(function (n) {
    var fn = Math[n] || (n === 'cbrt' ? function (x) { return x < 0 ? -Math.pow(-x, 1 / 3) : Math.pow(x, 1 / 3); } :
      n === 'sinh' ? function (x) { return (Math.exp(x) - Math.exp(-x)) / 2; } :
      n === 'cosh' ? function (x) { return (Math.exp(x) + Math.exp(-x)) / 2; } :
      n === 'tanh' ? function (x) { var a = Math.exp(x), b = Math.exp(-x); return (a - b) / (a + b); } :
      n === 'trunc' ? function (x) { return x < 0 ? Math.ceil(x) : Math.floor(x); } :
      n === 'sign' ? function (x) { return x > 0 ? 1 : x < 0 ? -1 : 0; } :
      n === 'log10' ? function (x) { return Math.log(x) / Math.LN10; } :
      n === 'log2' ? function (x) { return Math.log(x) / Math.LN2; } : null);
    EXPR_FN[n] = fixedArity(fn, 1, n);
  });
  EXPR_FN.atan2 = fixedArity(Math.atan2, 2, 'atan2');
  EXPR_FN.pow = fixedArity(Math.pow, 2, 'pow');
  EXPR_FN.min = variadic(Math.min, 'min');
  EXPR_FN.max = variadic(Math.max, 'max');
  EXPR_FN.hypot = variadic(function () { var s = 0; for (var i = 0; i < arguments.length; i++) s += arguments[i] * arguments[i]; return Math.sqrt(s); }, 'hypot');
  EXPR_FN.sind = fixedArity(function (x) { return Math.sin(x * D2R); }, 1, 'sind');
  EXPR_FN.cosd = fixedArity(function (x) { return Math.cos(x * D2R); }, 1, 'cosd');
  EXPR_FN.tand = fixedArity(function (x) { return Math.tan(x * D2R); }, 1, 'tand');
  EXPR_FN.asind = fixedArity(function (x) { return Math.asin(x) / D2R; }, 1, 'asind');
  EXPR_FN.acosd = fixedArity(function (x) { return Math.acos(x) / D2R; }, 1, 'acosd');
  EXPR_FN.atand = fixedArity(function (x) { return Math.atan(x) / D2R; }, 1, 'atand');
  EXPR_FN.deg = fixedArity(function (x) { return x / D2R; }, 1, 'deg');
  EXPR_FN.rad = fixedArity(function (x) { return x * D2R; }, 1, 'rad');

  // isExpression(v) -> true for a string that starts with "=" (after trimming)
  function isExpression(v) { return typeof v === 'string' && /^\s*=/.test(v); }

  function tokenizeExpr(src) {
    var toks = [], i = 0, n = src.length;
    while (i < n) {
      var c = src.charAt(i);
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      var m;
      if ((m = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i)))) {
        toks.push({ t: 'num', v: parseFloat(m[0]), s: m[0] }); i += m[0].length; continue;
      }
      if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i)))) {
        toks.push({ t: 'id', v: m[0], s: m[0] }); i += m[0].length; continue;
      }
      if (c === '*' && src.charAt(i + 1) === '*') { toks.push({ t: 'op', v: '^', s: '**' }); i += 2; continue; }
      if ('+-*/^(),'.indexOf(c) >= 0) { toks.push({ t: 'op', v: c, s: c }); i++; continue; }
      throw new Error('Unexpected "' + c + '"');
    }
    return toks;
  }

  // evalExpression(expr, vars) -> number. Grammar: numbers, + - * / and ^ (right-associative; ** is accepted), unary
  // - and +, parentheses, variables from `vars`, the constants pi and e (unless a variable shadows them) and the
  // functions in EXPR_FN (angles in radians; sind/cosd/... and deg()/rad() for degrees). A leading "=" is stripped.
  // A hand-rolled recursive-descent parser: no eval, no Function.
  function evalExpression(expr, vars) {
    var src = String(expr == null ? '' : expr).replace(/^\s*=/, '');
    vars = vars || {};
    var toks = tokenizeExpr(src), pos = 0;
    function peek() { return toks[pos]; }
    function isOp(v) { var t = toks[pos]; return t && t.t === 'op' && t.v === v; }
    function next() { return toks[pos++]; }
    function expect(v) {
      var t = next();
      if (!t) throw new Error('Unexpected end of expression');
      if (t.t !== 'op' || t.v !== v) throw new Error('Unexpected "' + t.s + '"');
    }
    function parseSum() {
      var v = parseTerm();
      while (isOp('+') || isOp('-')) { var op = next().v, r = parseTerm(); v = op === '+' ? v + r : v - r; }
      return v;
    }
    function parseTerm() {
      var v = parseUnary();
      while (isOp('*') || isOp('/')) {
        var op = next().v, r = parseUnary();
        if (op === '*') v = v * r;
        else { if (r === 0) throw new Error('Division by zero'); v = v / r; }
      }
      return v;
    }
    function parseUnary() {
      if (isOp('-')) { next(); return -parseUnary(); }
      if (isOp('+')) { next(); return parseUnary(); }
      return parsePower();
    }
    function parsePower() {
      var base = parseAtom();
      if (isOp('^')) { next(); var ex = parseUnary(); return Math.pow(base, ex); }
      return base;
    }
    function parseAtom() {
      var t = next();
      if (!t) throw new Error('Unexpected end of expression');
      if (t.t === 'num') return t.v;
      if (t.t === 'id') {
        if (isOp('(')) {
          next();
          var fn = EXPR_FN.hasOwnProperty(t.v) ? EXPR_FN[t.v] : null;
          if (!fn) throw new Error('Unknown function "' + t.v + '"');
          var args = [];
          if (!isOp(')')) {
            args.push(parseSum());
            while (isOp(',')) { next(); args.push(parseSum()); }
          }
          expect(')');
          return fn(args);
        }
        if (Object.prototype.hasOwnProperty.call(vars, t.v) && typeof vars[t.v] === 'number') return vars[t.v];
        if (EXPR_CONST.hasOwnProperty(t.v)) return EXPR_CONST[t.v];
        throw new Error('Unknown variable "' + t.v + '"');
      }
      if (t.v === '(') { var v = parseSum(); expect(')'); return v; }
      throw new Error('Unexpected "' + t.s + '"');
    }
    if (!toks.length) throw new Error('Unexpected end of expression');
    var value = parseSum();
    if (peek()) throw new Error('Unexpected "' + peek().s + '"');
    if (typeof value !== 'number' || !isFinite(value)) throw new Error('Result is not a number');
    return value;
  }

  // resolveEquations(model) -> { vars: { name: number }, errors: { name: message } }: model.equations evaluated in
  // order, each seeing the ones before it. A failing or invalid variable is absent from vars and named in errors.
  function resolveEquations(model) {
    var vars = {}, errors = {};
    var list = effectiveEquations(model);
    list.forEach(function (eq) {
      var name = eq && eq.name != null ? String(eq.name) : '';
      if (!EXPR_NAME.test(name)) { errors[name] = 'Invalid name "' + name + '"'; return; }
      if (Object.prototype.hasOwnProperty.call(vars, name)) { errors[name] = 'Duplicate name "' + name + '"'; return; }
      try {
        vars[name] = evalExpression(eq.expr == null ? '' : eq.expr, vars);
      } catch (e) {
        errors[name] = e.message || String(e);
      }
    });
    var ac = activeConfiguration(model);
    return { vars: vars, errors: errors, configuration: ac ? ac.name : null };
  }

  // ------------------------------------------------------------------ configurations (named sets of variable values)
  // model.configurations = [{ name: 'Small', values: { T: '6', N: '2' } }, ...]; model.activeConfiguration = 'Small'.
  // A configuration overrides the expression of each global variable it names (values are expression strings without
  // the leading "=", evaluated in the equations' order, so they may use the variables above them). Variables it does
  // not name keep model.equations' expr; a value for a name that is not an equation is ignored. No configurations, or
  // an active name that matches none, means the base equations. Everything downstream (resolvedModel, rebuild, cache
  // keys, Builder._value) goes through resolveEquations, so switching configuration rebuilds exactly the features
  // whose resolved values change.
  function configurationList(model) {
    return model && Array.isArray(model.configurations) ? model.configurations.filter(function (c) { return c && c.name != null; }) : [];
  }
  function findConfiguration(model, name) {
    var list = configurationList(model);
    for (var i = 0; i < list.length; i++) if (String(list[i].name) === String(name)) return list[i];
    return null;
  }
  // activeConfiguration(model) -> the active configuration object, or null
  function activeConfiguration(model) {
    if (!model || model.activeConfiguration == null) return null;
    return findConfiguration(model, model.activeConfiguration);
  }
  function configExpr(v) { return String(v == null ? '' : v).replace(/^\s*=\s*/, '').trim(); }
  // effectiveEquations(model) -> [{ name, expr }]: model.equations with the active configuration's values applied
  function effectiveEquations(model) {
    var list = model && Array.isArray(model.equations) ? model.equations : [];
    var ac = activeConfiguration(model), vals = ac && ac.values && typeof ac.values === 'object' ? ac.values : null;
    if (!vals) return list;
    return list.map(function (eq) {
      if (!eq || eq.name == null || !Object.prototype.hasOwnProperty.call(vals, String(eq.name))) return eq;
      return { name: eq.name, expr: configExpr(vals[String(eq.name)]) };
    });
  }
  // captureConfiguration(model) -> { name: expr } for every equation, as the active set resolves it (a new
  // configuration starts as a copy of what the model shows now)
  function captureConfiguration(model) {
    var out = {};
    effectiveEquations(model).forEach(function (eq) { if (eq && eq.name != null) out[String(eq.name)] = String(eq.expr == null ? '' : eq.expr); });
    return out;
  }
  // applyEquations(model, list) -> model: write an edited equation list ([{ name, expr }], e.g. from the Equations
  // dialog) back. With no active configuration it replaces model.equations (an empty list deletes it). With one, the
  // list's names and order become model.equations; a variable the active configuration names gets its new expr in
  // that configuration only (the base expr and the other configurations keep theirs), any other variable gets it in
  // model.equations. A name dropped from the list is dropped from every configuration's values too.
  function applyEquations(model, list) {
    list = (list || []).filter(function (q) { return q && q.name != null && String(q.name) !== ''; })
      .map(function (q) { return { name: String(q.name), expr: String(q.expr == null ? '' : q.expr) }; });
    var ac = activeConfiguration(model), vals = ac ? (ac.values && typeof ac.values === 'object' ? ac.values : (ac.values = {})) : null;
    var base = {};
    (Array.isArray(model.equations) ? model.equations : []).forEach(function (q) { if (q && q.name != null) base[String(q.name)] = q; });
    var names = {};
    var out = list.map(function (q) {
      names[q.name] = true;
      if (vals && Object.prototype.hasOwnProperty.call(vals, q.name)) {
        vals[q.name] = q.expr;
        var old = base[q.name];
        return old ? old : { name: q.name, expr: q.expr };
      }
      var o = {}, b = base[q.name];
      if (b) Object.keys(b).forEach(function (k) { o[k] = b[k]; }); // extra fields ride along
      o.name = q.name; o.expr = q.expr;
      return o;
    });
    configurationList(model).forEach(function (c) {
      if (c.values && typeof c.values === 'object') Object.keys(c.values).forEach(function (k) { if (!names[k]) delete c.values[k]; });
    });
    if (out.length) model.equations = out; else delete model.equations;
    return model;
  }

  function cloneValue(v) {
    if (Array.isArray(v)) return v.map(cloneValue);
    if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = cloneValue(v[k]); }); return o; }
    return v;
  }
  function resolveValue(v, vars, path) {
    if (isExpression(v)) {
      try { return evalExpression(v, vars); } catch (e) { throw new Error(path + ': ' + (e.message || String(e))); }
    }
    if (Array.isArray(v)) return v.map(function (x, i) { return resolveValue(x, vars, path + '.' + i); });
    if (v && typeof v === 'object') {
      var o = {};
      Object.keys(v).forEach(function (k) {
        // a computed sketch profile is shared, not copied: rebuild replaces it wholesale and never edits it in place
        o[k] = k === 'profile' ? v[k] : EXPR_SKIP[k] ? cloneValue(v[k]) : resolveValue(v[k], vars, path ? path + '.' + k : k);
      });
      return o;
    }
    return v;
  }
  // resolveFeature(f, vars) -> a deep copy of f with every "=" string replaced by its value; throws
  // "<field>: <message>" (nested fields as dir2.depth) for the first field that fails.
  function resolveFeature(f, vars) { return resolveValue(f, vars || {}, ''); }
  // hasExpressions(f) -> true when the feature holds any "=" string outside the skipped keys
  function hasExpressions(f) {
    if (isExpression(f)) return true;
    if (Array.isArray(f)) { for (var i = 0; i < f.length; i++) if (hasExpressions(f[i])) return true; return false; }
    if (f && typeof f === 'object') {
      var ks = Object.keys(f);
      for (var j = 0; j < ks.length; j++) if (!EXPR_SKIP[ks[j]] && hasExpressions(f[ks[j]])) return true;
    }
    return false;
  }
  // resolvedModel(model) -> { model: rm, vars, errors, featureErrors: { id: message }, sheetError }: a shallow copy of
  // the model whose features and sheet parameters have their expressions evaluated. A feature without expressions
  // is the original object (so rebuild's sketch profiles land on the model as before); one that fails to resolve
  // stays the original and is named in featureErrors. Nothing on the original model is changed.
  function resolvedModel(model) {
    var eq = resolveEquations(model), vars = eq.vars, featureErrors = {}, sheetError = null;
    var rm = {};
    Object.keys(model).forEach(function (k) { rm[k] = model[k]; });
    rm.features = model.features.map(function (f) {
      if (!hasExpressions(f)) return f;
      try { return resolveFeature(f, vars); } catch (e) { featureErrors[f.id] = e.message || String(e); return f; }
    });
    if (model.sheet && hasExpressions(model.sheet)) {
      try { rm.sheet = resolveFeature(model.sheet, vars); } catch (e) { sheetError = 'sheet.' + (e.message || String(e)); }
    }
    return { model: rm, vars: vars, errors: eq.errors, featureErrors: featureErrors, sheetError: sheetError, configuration: eq.configuration };
  }

  // ------------------------------------------------------------------ rebuild
  function newModel(name) {
    return { name: name || 'Part1', units: 'mm', density: 7850, color: '#a8adb6', features: [], nextId: 1 };
  }

  var NAME_BASE = {
    sketch: 'Sketch', plane: 'Plane', extrude: 'Boss-Extrude', cut: 'Cut-Extrude', revolve: 'Revolve',
    revolveCut: 'Cut-Revolve', lpattern: 'LPattern', cpattern: 'CirPattern', mirror: 'Mirror', chamfer: 'Chamfer', fillet: 'Fillet', flange: 'Edge-Flange', sweep: 'Sweep', loft: 'Loft', shell: 'Shell', hem: 'Hem', jog: 'Jog'
  };

  function featureName(model, type, cut) {
    var base = NAME_BASE[type] || 'Feature';
    if (type === 'extrude' && cut) base = NAME_BASE.cut;
    if (type === 'revolve' && cut) base = NAME_BASE.revolveCut;
    if (type === 'sweep' && cut) base = 'Cut-Sweep';
    if (type === 'loft' && cut) base = 'Cut-Loft';
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
        return f.type === 'extrude' ? buildExtrude(f, sketch, plane, ctx.throughLimit) : buildRevolve(f, sketch, plane);
      case 'sweep': return buildSweep(f, model, ctx);
      case 'loft': return buildLoft(f, model, ctx);
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
        for (var k = 1; k < count; k++) ccopies.push(rotateBody(csrc, f.center || [0, 0, 0], AXES[f.axis || 'z'], step * k));
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
    if (featureTypes[f.type]) return !!featureTypes[f.type].cut;
    if (f.type === 'extrude' || f.type === 'revolve' || f.type === 'sweep' || f.type === 'loft') return !!f.cut;
    if (f.type === 'mirror' && f.body) return false;
    if (f.type === 'lpattern' || f.type === 'cpattern' || f.type === 'mirror') {
      var src = findFeature(model, f.feature);
      return src ? isCut(src, model) : false;
    }
    return false;
  }

  // Cache key of a feature: its JSON (minus the computed profile) plus the sheet parameters flanges depend on.
  // `f` and `model` are the RESOLVED feature and model (resolvedModel), so the key follows the values equations
  // produce: a variable change rebuilds just the features that use it, an equation edit that changes no value
  // reuses the whole cache.
  function featureKey(f, model) {
    return JSON.stringify(f, function (k, v) { return k === 'profile' || k === 'name' ? undefined : v; }) + '|' + JSON.stringify(model.sheet || null) + '|' + tessKey();
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
    if (!model || !model.tessellation) return fn();
    var saved = { chordTol: TESS.chordTol, minSegs: TESS.minSegs, maxSegs: TESS.maxSegs, legacy: TESS.legacy };
    try { setTessellation(model.tessellation); return fn(); } finally { TESS.chordTol = saved.chordTol; TESS.minSegs = saved.minSegs; TESS.maxSegs = saved.maxSegs; TESS.legacy = saved.legacy; }
  }
  function rebuild(model, cache) { return withModelTess(model, function () { return rebuildModel(model, cache); }); }
  function rebuildModel(model, cache) {
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var errors = {}, warnings = {}, facePlanes = {};
    var origFeatures = model.features, resolved = resolvedModel(model);
    model = resolved.model;
    var resolveErrors = resolved.featureErrors, sheetError = resolved.sheetError;
    function needsSheet(f) { return f.type === 'flange' || f.type === 'jog' || f.sheetBase || (f.cut && f.normalCut); }
    var ctx = { tools: {}, planes: {}, sketches: {}, flanges: {}, body: null, bodies: [], bodyFeatures: [], warnings: warnings };
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
      if (!changed) warnings[f.id] = (warnings[f.id] ? warnings[f.id] + ' ' : '') + 'Cut removed no material. Try "Reverse direction".';
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
    // sketches used as sweep paths are open by design: no "open contour" warning for them
    var pathIds = {};
    model.features.forEach(function (f) { if (f.type === 'sweep' && typeof f.path === 'number') pathIds[f.path] = true; });
    var keys = model.features.map(function (f) { return featureKey(f, model); });
    var prev = cache && cache.steps ? cache.steps : [], steps = [], p = 0;
    while (p < model.features.length && p < prev.length && prev[p].key === keys[p]) p++;
    // a cache made from a finished build (cacheFromBuild) only knows the final body: a partial step cannot hand over
    // ctx.body, so the prefix ends at the last step that carries one (all of them, or none, for such a cache)
    while (p > 0 && prev[p - 1].partial) p--;
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
      steps.push(st);
    }
    model.features.slice(p).forEach(function (f, j) {
      try {
        if (resolveErrors[f.id]) throw new Error(resolveErrors[f.id]);
        if (sheetError && needsSheet(f)) throw new Error(sheetError);
        switch (f.type) {
          case 'flange': {
            var fk = pickBody(f);
            var ft = buildFlange(f, model, ctx);
            ctx.tools[f.id] = ft;
            var fb = ctx.flangeCut ? ctx.body.subtract(ctx.flangeCut) : ctx.body;
            putBody(fk, fb.union(ft));
            break;
          }
          case 'jog': {
            var jk = pickBody(f);
            var jg = buildJog(f, model, ctx);
            var jb = ctx.flangeCut ? ctx.body.subtract(ctx.flangeCut) : ctx.body;
            putBody(jk, jb.union(jg.first).union(jg.second));
            ctx.tools[f.id] = jg.first.union(jg.second);
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
          case 'shell': {
            var sk = pickBody(f);
            var sh = buildShell(f, ctx);
            putBody(sk, sh.body);
            ctx.tools[f.id] = null;   // the cavity is not built during a rebuild (buildShell: sh.inner is lazy)
            break;
          }
          case 'plane':
            ctx.planes[f.id] = makePlane(f.ref || 'Front', +f.offset || 0);
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
            var tool = buildTool(f, model, ctx);
            if (!tool) break;
            var cut = isCut(f, model);
            if (cut && f.type === 'extrude' && f.normalCut && model.sheet && ctx.body) {
              // Normal Cut: swap the tool for a prism normal to the sheet (see normalCutTool); the swapped tool is
              // what the cache and the packed build carry
              var ncs = ctx.sketches[f.sketch] || findFeature(model, f.sketch);
              var ncp = resolvePlane(ncs.plane, model, ctx.planes);
              var ncDir = (f.dir2 || f.end === 'mid') ? null : (f.reverse ? scale(ncp.n, -1) : ncp.n.slice());
              var nct = normalCutTool(tool, ctx.body, model, ncDir);
              if (nct === tool) warnings[f.id] = (warnings[f.id] ? warnings[f.id] + ' ' : '') + 'Normal cut: the cut does not cross a sheet face; a plain cut was made.';
              tool = nct;
            }
            ctx.tools[f.id] = tool;
            if (cut) applyCut(tool, f); else addBoss(tool, f);
          }
        }
      } catch (e) {
        errors[f.id] = e.message || String(e);
        syncBody(); // a failed pick-based feature may have left ctx.body pointing at one body
      }
      steps.push({ key: keys[p + j], body: ctx.body, bodies: ctx.bodies.slice(), bodyFeatures: ctx.bodyFeatures.slice(), tool: ctx.tools[f.id] || null, plane: ctx.planes[f.id] || null, flange: ctx.flanges[f.id] || null, profile: f.profile || null, error: errors[f.id] || null, warning: warnings[f.id] || null });
    });
    var t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    // profiles: the computed profile of every sketch, by feature id, so a build made on a copy of the model (a worker)
    // can hand them back to the original with applyProfiles
    var profiles = {};
    Object.keys(ctx.sketches).forEach(function (id) { profiles[id] = ctx.sketches[id].profile || null; });
    return { body: ctx.body, bodies: ctx.bodies, bodyFeatures: ctx.bodyFeatures, tools: ctx.tools, planes: ctx.planes, flanges: ctx.flanges, errors: errors, warnings: warnings, time: t1 - t0, cache: { steps: steps }, reused: p, profiles: profiles, facePlanes: facePlanes,
      equations: resolved.vars, equationErrors: resolved.errors, configuration: resolved.configuration };
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
      equations: build.equations || {}, equationErrors: build.equationErrors || {}, configuration: build.configuration || null
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
      equations: obj.equations || {}, equationErrors: obj.equationErrors || {}, configuration: obj.configuration || null
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
    model = resolvedModel(model).model; // keys come from the resolved features, as rebuild makes them
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

  // ------------------------------------------------------------------ meshing
  function planeKey(pl) {
    return [Math.round(pl.normal.x * 1000), Math.round(pl.normal.y * 1000), Math.round(pl.normal.z * 1000), Math.round(pl.w * 100)].join('|');
  }

  // -> { positions, normals, faces:[{normal,w,start,count,centroid,area,body}], triCount, polygons }
  // Coplanar polygons make one face, but only within one body: the body tag (polygon.body, from combineBodies; 0 when
  // untagged) is part of the grouping key, and each face records it as `face.body`. r10/asmfaces10: so is the
  // assembly part tag (polygon.part, assembly.js), so coplanar faces of two parts in a sub-assembly stay apart (`face.part`).
  function meshFromBody(body) {
    if (!body) return { positions: new Float32Array(0), normals: new Float32Array(0), faces: [], triCount: 0 };
    var groups = {}, order = [];
    body.polygons.forEach(function (p) {
      var bi = p.body || 0, k = planeKey(p.plane) + '|' + bi + (p.face != null ? '|f' + p.face : '') + (p.part != null ? '|p' + p.part : '');   // OpenCascade faces / assembly parts stay apart
      if (!groups[k]) { groups[k] = { polys: [], plane: p.plane, body: bi, part: p.part }; order.push(k); }
      groups[k].polys.push(p);
    });
    var tris = [];
    var faces = [];
    order.forEach(function (k) {
      var g = groups[k];
      var start = tris.length / 9, cx = 0, cy = 0, cz = 0, cnt = 0, area = 0;
      g.polys.forEach(function (p) {
        var vs = p.vertices;
        for (var j = 1; j + 1 < vs.length; j++) {
          var a = vs[0].pos, b = vs[j].pos, c = vs[j + 1].pos;
          tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
          area += b.minus(a).cross(c.minus(a)).length() / 2;
        }
        vs.forEach(function (v) { cx += v.pos.x; cy += v.pos.y; cz += v.pos.z; cnt++; });
      });
      var count = tris.length / 9 - start;
      var face = {
        normal: [g.plane.normal.x, g.plane.normal.y, g.plane.normal.z], w: g.plane.w,
        start: start, count: count, centroid: [cx / cnt, cy / cnt, cz / cnt], area: area, polys: g.polys, body: g.body
      };
      if (g.part != null) face.part = g.part;
      faces.push(face);
    });
    var positions = new Float32Array(tris);
    var normals = new Float32Array(tris.length);
    faces.forEach(function (f) {
      for (var i = f.start * 9; i < (f.start + f.count) * 9; i += 3) {
        normals[i] = f.normal[0]; normals[i + 1] = f.normal[1]; normals[i + 2] = f.normal[2];
      }
    });
    // positions64 keeps full precision for mass properties; positions (Float32) is what the renderer uploads
    var mesh = { positions: positions, positions64: new Float64Array(tris), normals: normals, faces: faces, triCount: tris.length / 9 };
    if (body.exact) mesh.exact = body.exact;   // a solid from OpenCascade knows its exact mass properties (occt-kernel.js toBuild)
    return mesh;
  }

  // ------------------------------------------------------------------ exact volumes from the analytic records
  // curveCorrection(polygons) -> { volume, moment: [x, y, z], area, facets } — what the true curved faces add to (or,
  // for concave faces such as holes, take from) the polygonal solid: volume, first moment ∫x dV, and surface area.
  // Each facet fragment F owns the region between itself and its true surface, swept along columns that keep the
  // pieces of neighbouring facets apart (so fragments made by CSG splits still add up exactly):
  //   cylinders / cones: in the plane perpendicular to the axis through x, the ray from the axis through x, out to
  //     the surface radius R(z). Per unit area of F that is (n·eρ)(R² − ρ²)/(2ρ) (ρ = distance of x from the axis,
  //     eρ the radial direction): the polar area ∫ρ dρ dφ with dφ dz = |n·eρ|/ρ dA. A facet's slice is a chord of
  //     the circle R(z), so the sum over a whole ring of facets is exactly the circle minus the polygon.
  //   spheres / tori (revolved arcs), in two levels: first out to the cone through the circles of the chord's ends
  //     P and Q (as above), then, in the meridian half-plane, along the ray from the arc centre C through that point
  //     on the chord PQ out to the arc: ∫(Cρ + r' cos θ) r' dr' dθ dφ, with dθ = h / r_y² ds along the chord.
  // The columns are exact where the neighbouring faces are perpendicular to the axis (caps, steps, hole bottoms) or
  // contain it (the ends of a partial revolve); elsewhere (a hole drilled through a slanted face, crossing cylinders)
  // the error is of the order of the sliver's own curvature. Integrals: Gauss-Legendre on each fan triangle
  // (collapsed square, 6 × 6 points), the columns in closed form.
  var GL6 = { x: [0.033765242898423986, 0.16939530676686776, 0.38069040695840156, 0.6193095930415985, 0.8306046932331322, 0.966234757101576],
    w: [0.08566224618958517, 0.18038078652406933, 0.23395696728634552, 0.23395696728634552, 0.18038078652406933, 0.08566224618958517] };

  // planar faces by plane, for the side walls of the slivers (surface area only)
  function planarIndex(polys) {
    var idx = {};
    polys.forEach(function (p) {
      if (p.surf) return;
      var n = p.plane.normal, s = (n.x < -1e-9 || (Math.abs(n.x) <= 1e-9 && (n.y < -1e-9 || (Math.abs(n.y) <= 1e-9 && n.z < 0)))) ? -1 : 1;
      var k = Math.round(n.x * s * 1000) + ',' + Math.round(n.y * s * 1000) + ',' + Math.round(n.z * s * 1000) + ',' + Math.round(p.plane.w * s * 1e4);
      (idx[k] = idx[k] || []).push(p);
    });
    return function (N, q) {
      var s = (N[0] < -1e-9 || (Math.abs(N[0]) <= 1e-9 && (N[1] < -1e-9 || (Math.abs(N[1]) <= 1e-9 && N[2] < 0)))) ? -1 : 1;
      var w = dot(N, q) * s, base = Math.round(N[0] * s * 1000) + ',' + Math.round(N[1] * s * 1000) + ',' + Math.round(N[2] * s * 1000) + ',', wk = Math.round(w * 1e4);
      for (var dk = -1; dk <= 1; dk++) {
        var list = idx[base + (wk + dk)];
        if (!list) continue;
        for (var i = 0; i < list.length; i++) {
          var p = list[i], pn = p.plane.normal, vs = p.vertices, inside = true;
          if (Math.abs(pn.x * q[0] + pn.y * q[1] + pn.z * q[2] - p.plane.w) > 1e-6 * Math.max(1, Math.abs(p.plane.w))) continue;
          for (var j = 0; j < vs.length && inside; j++) {
            var a = vs[j].pos, b = vs[(j + 1) % vs.length].pos;
            var ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z, qx = q[0] - a.x, qy = q[1] - a.y, qz = q[2] - a.z;
            var cx = ey * qz - ez * qy, cy = ez * qx - ex * qz, cz = ex * qy - ey * qx;
            if (cx * pn.x + cy * pn.y + cz * pn.z < -1e-12 * Math.max(1, ex * ex + ey * ey + ez * ez)) inside = false;
          }
          if (inside) return true;
        }
      }
      return false;
    };
  }

  // densities at a point x of a facet with unit outward normal n: [volume, mx, my, mz, true area] per unit facet area
  function curveDensity(F, x, n, phiC) {
    var S = F.s, rel = sub(x, S.o), z = dot(rel, S.d), v = sub(rel, scale(S.d, z)), rx = len(v);
    if (rx < 1e-12) return null;
    var er = scale(v, 1 / rx), nr = dot(n, er), base = add(S.o, scale(S.d, z)), out = [0, 0, 0, 0, 0];
    function level1(R) {
      var f = nr / rx, i1 = (R * R - rx * rx) / 2, i2 = (R * R * R - rx * rx * rx) / 3;
      out[0] += f * i1;
      for (var k = 0; k < 3; k++) out[1 + k] += f * (base[k] * i1 + er[k] * i2);
    }
    if (S.t === 'cyl' || S.t === 'cone') {
      var kk = S.k || 0, R = S.r + kk * z;
      level1(R);
      out[4] = R * Math.sqrt(1 + kk * kk) * Math.abs(nr) / rx;
      return out;
    }
    if (!F.P || !F.Q) return null;   // a sphere / torus facet not made by a revolve (OpenCascade's triangles): no profile chord, no correction
    var P = F.P, Q = F.Q, Cr = S.t === 'tor' ? S.R : 0, r = S.r;
    var dz = Q[1] - P[1], dr = Q[0] - P[0], L = Math.hypot(dr, dz), y, js;
    if (Math.abs(dz) > 1e-12 * Math.max(1, L)) {
      var R1 = P[0] + dr * (z - P[1]) / dz;
      level1(R1);
      y = [R1, z];
      js = L / Math.abs(dz) * Math.abs(nr) / rx;
    } else {
      // a chord perpendicular to the axis: its facets are planar trapezoids; map them onto the annulus radially
      // within their ring of facets (the ring comes from the fragment's centroid angle phiC)
      var dphi = F.dphi, beta = Math.abs(dphi) / 2, e0 = F.e0, e1 = cross(S.d, e0);
      var phi = Math.atan2(dot(er, e1), dot(er, e0));
      var jr = Math.floor(phiC / dphi), phim = (jr + 0.5) * dphi;
      var u = rx * Math.cos(phi - phim);
      y = [u / Math.cos(beta), P[1]];
      js = L / Math.abs(dr) * Math.abs(u) / (rx * rx * Math.cos(beta));
    }
    var a = y[0] - Cr, b = y[1], ry = Math.hypot(a, b);
    if (ry < 1e-12) return out;
    var c = a / ry, sn = b / ry;
    var h = Math.abs(dr * (0 - P[1]) - dz * (Cr - P[0])) / L;
    var nz = dot(n, S.d), sg = ((Cr - P[0]) * nr + (0 - P[1]) * nz) < 0 ? 1 : -1;
    var J = h / (ry * ry) * js;
    var I1 = (r * r - ry * ry) / 2, I2 = (r * r * r - ry * ry * ry) / 3, I3 = (r * r * r * r - ry * ry * ry * ry) / 4;
    var g = Cr * I1 + c * I2, zm = sn * Cr * I2 + sn * c * I3, rm = Cr * Cr * I1 + 2 * Cr * c * I2 + c * c * I3;
    out[0] += sg * J * g;
    for (var k2 = 0; k2 < 3; k2++) out[1 + k2] += sg * J * (S.o[k2] * g + S.d[k2] * zm + er[k2] * rm);
    out[4] = r * Math.abs(Cr + r * c) * J;
    return out;
  }

  function angleOf(F, x) {
    var S = F.s, rel = sub(x, S.o), v = sub(rel, scale(S.d, dot(rel, S.d)));
    var phi = Math.atan2(dot(v, cross(S.d, F.e0)), dot(v, F.e0));
    if (F.dphi > 0 && phi < 0) phi += 2 * Math.PI;
    if (F.dphi < 0 && phi > 0) phi -= 2 * Math.PI;
    return phi;
  }

  // the side walls of a fragment's sliver that lie in a planar face (area only): +wall where the face is on the
  // axis side (or the arc-centre side) of the chord, −wall where it is on the far side
  function curveWalls(F, p, planar) {
    var S = F.s, vs = p.vertices, total = 0, n = arr(p.plane.normal);
    for (var i = 0; i < vs.length; i++) {
      var A = arr(vs[i].pos), B = arr(vs[(i + 1) % vs.length].pos), el = len(sub(B, A));
      if (el < 1e-9) continue;
      var za = dot(sub(A, S.o), S.d), zb = dot(sub(B, S.o), S.d), scl = Math.max(1, Math.abs(za), el);
      var M = scale(add(A, B), 0.5), zm = dot(sub(M, S.o), S.d), cM = add(S.o, scale(S.d, zm)), vm = sub(M, cM), rm = len(vm);
      if (rm < 1e-12) continue;
      var erm = scale(vm, 1 / rm), eps = 1e-4 * el, wall = null, inner, outer, N;
      if (Math.abs(za - zb) < 1e-9 * scl) {
        var R = null;
        if (S.t === 'cyl' || S.t === 'cone') R = S.r + (S.k || 0) * zm;
        else if (F.P && F.Q && Math.abs(F.Q[1] - F.P[1]) > 1e-12 * scl) R = F.P[0] + (F.Q[0] - F.P[0]) * (zm - F.P[1]) / (F.Q[1] - F.P[1]);
        if (R != null) {
          var va = sub(sub(A, S.o), scale(S.d, za)), vb = sub(sub(B, S.o), scale(S.d, zb));
          var cosA = dot(va, vb) / (len(va) * len(vb) || 1), dphi = Math.acos(Math.max(-1, Math.min(1, cosA)));
          wall = R * R * dphi / 2 - len(cross(va, vb)) / 2;
          inner = sub(M, scale(erm, eps)); outer = add(M, scale(erm, eps)); N = S.d;
        }
      } else if (F.P && Math.abs(dot(norm(cross(S.d, sub(A, S.o))), sub(B, S.o))) < 1e-9 * scl) {
        // an edge in a meridian half-plane (the end of a partial revolve): the arc's own segment
        var Cr = S.t === 'tor' ? S.R : 0, pa = [len(sub(sub(A, S.o), scale(S.d, za))) - Cr, za], pb = [len(sub(sub(B, S.o), scale(S.d, zb))) - Cr, zb];
        var ang = Math.acos(Math.max(-1, Math.min(1, (pa[0] * pb[0] + pa[1] * pb[1]) / (Math.hypot(pa[0], pa[1]) * Math.hypot(pb[0], pb[1]) || 1))));
        wall = S.r * S.r * ang / 2 - Math.abs(pa[0] * pb[1] - pa[1] * pb[0]) / 2;
        var o2 = [rm - Cr, zm], ol = Math.hypot(o2[0], o2[1]) || 1, dout = add(scale(erm, o2[0] / ol), scale(S.d, o2[1] / ol));
        inner = sub(M, scale(dout, eps)); outer = add(M, scale(dout, eps)); N = norm(cross(S.d, erm));
      }
      if (wall == null || !(Math.abs(wall) > 0)) continue;
      if (planar(N, inner)) total += wall;
      if (planar(N, outer)) total -= wall;
    }
    return total;
  }

  function curveCorrection(polys) {
    var res = { volume: 0, moment: [0, 0, 0], area: 0, facets: 0 };
    var planar = null;
    for (var pi = 0; pi < polys.length; pi++) {
      var p = polys[pi], F = p.surf;
      if (!F) continue;
      res.facets++;
      var vs = p.vertices, n = arr(p.plane.normal), phiC = 0, polyArea = 0;
      if (F.P && F.e0) {
        var cen = [0, 0, 0];
        vs.forEach(function (v) { cen = add(cen, arr(v.pos)); });
        phiC = angleOf(F, scale(cen, 1 / vs.length));
      }
      // fan from the vertex nearest the axis: the densities vary fastest there (a sphere's pole), and the collapsed
      // square's corner at u = 0 clusters its points on the fan apex
      var i0 = 0, best = Infinity;
      for (var q = 0; q < vs.length; q++) {
        var rq = sub(arr(vs[q].pos), F.s.o), dq = len(sub(rq, scale(F.s.d, dot(rq, F.s.d))));
        if (dq < best - 1e-12) { best = dq; i0 = q; }
      }
      var A = arr(vs[i0].pos);
      for (var j = 1; j + 1 < vs.length; j++) {
        var B = arr(vs[(i0 + j) % vs.length].pos), C = arr(vs[(i0 + j + 1) % vs.length].pos), ab = sub(B, A), bc = sub(C, B);
        var ar2 = len(cross(ab, sub(C, A)));
        if (ar2 < 1e-18) continue;
        polyArea += ar2 / 2;
        for (var iu = 0; iu < 6; iu++) {
          var u = GL6.x[iu];
          for (var iv = 0; iv < 6; iv++) {
            var v = GL6.x[iv], wgt = GL6.w[iu] * GL6.w[iv] * ar2 * u;
            var x = add(A, add(scale(ab, u), scale(bc, u * v)));
            var d = curveDensity(F, x, n, phiC);
            if (!d) continue;
            res.volume += wgt * d[0];
            res.moment[0] += wgt * d[1]; res.moment[1] += wgt * d[2]; res.moment[2] += wgt * d[3];
            res.area += wgt * d[4];
          }
        }
      }
      res.area -= polyArea;
      if (!planar) planar = planarIndex(polys);
      res.area += curveWalls(F, p, planar);
    }
    return res;
  }

  // ------------------------------------------------------------------ analytic edges (true circles and arcs)
  function polysOf(x) {
    if (!x) return [];
    if (x.polygons) return x.polygons;
    if (x.faces) { var out = []; x.faces.forEach(function (f) { if (f.polys) out = out.concat(f.polys); }); return out; }
    return x;
  }
  function surfKey(S) {
    function q(v) { return Math.round(v * 1e6); }
    var d = S.d, sg = (d[0] < -1e-9 || (Math.abs(d[0]) <= 1e-9 && (d[1] < -1e-9 || (Math.abs(d[1]) <= 1e-9 && d[2] < 0)))) ? -1 : 1;
    var dd = scale(d, sg), o = S.o;
    // cylinders and cones: the axis line (its point nearest the world origin); spheres and tori: the centre
    if (S.t === 'cyl' || S.t === 'cone') { o = sub(S.o, scale(dd, dot(S.o, dd))); }
    var k = S.t + ':' + o.map(q).join(',') + ':' + dd.map(q).join(',') + ':' + q(S.r);
    if (S.t === 'cone') k += ':' + q(S.k * sg) + ':' + q(S.r + S.k * dot(S.o, dd) * 0); // same line + same radius at o
    if (S.t === 'tor') k += ':' + q(S.R);
    return k;
  }
  // curveSurfaces(bodyOrMeshOrPolygons) -> [{ key, surf, polys }]: the curved faces as their analytic surfaces (one
  // entry per distinct surface, every facet fragment on it)
  function curveSurfaces(x) {
    var by = {}, out = [];
    polysOf(x).forEach(function (p) {
      if (!p.surf) return;
      var S = p.surf.s, k = S._key || surfKey(S);
      if (!by[k]) { by[k] = { key: k, surf: S, polys: [] }; out.push(by[k]); }
      by[k].polys.push(p);
    });
    return out;
  }
  // curveEdges(bodyOrMeshOrPolygons) -> [{ kind: 'circle' | 'arc', center, normal, radius, xdir, a0, a1, surface,
  //   chords: [[p, q], ...] }]: the boundaries of the curved faces that are true circles and arcs — where a cylinder,
  // cone, sphere or torus meets a face perpendicular to its axis (a cap, a step, a hole's rim or bottom), and the
  // profile arcs at the ends of a partial revolve. Angles are about `normal` from `xdir` (a0 < a1, radians); a full
  // circle has a0 = 0, a1 = 2π. `chords` are the mesh edges that approximate it (the facet boundaries on the curve),
  // so a consumer can swap them for the exact curve. Edges shared by two fragments of the same surface (splits) are
  // interior and left out.
  function curveEdges(x) {
    var polys = polysOf(x), groups = {}, order = [];
    function k3(p) { return Math.round(p[0] * 1e6) + ',' + Math.round(p[1] * 1e6) + ',' + Math.round(p[2] * 1e6); }
    polys.forEach(function (p) {
      if (!p.surf) return;
      var F = p.surf, S = F.s, sk = S._key || surfKey(S), vs = p.vertices;
      for (var i = 0; i < vs.length; i++) {
        var A = arr(vs[i].pos), B = arr(vs[(i + 1) % vs.length].pos);
        var el = len(sub(B, A));
        if (el < 1e-9) continue;
        var za = dot(sub(A, S.o), S.d), zb = dot(sub(B, S.o), S.d), scl = Math.max(1, el, Math.abs(za));
        var g = null;
        if (Math.abs(za - zb) < 1e-9 * scl) {
          // a chord (or a piece of one, when CSG split the facet) in a plane perpendicular to the axis: both ends
          // between the chord's distance and the circle of that level (at most a 16-gon's sagitta inside it)
          var c = add(S.o, scale(S.d, za)), ra = len(sub(A, c)), rb = len(sub(B, c));
          var Rz = null;
          if (S.t === 'cyl' || S.t === 'cone') Rz = S.r + (S.k || 0) * za;
          else if (F.P && Math.abs(za - F.P[1]) < 1e-7 * scl) Rz = F.P[0];
          else if (F.Q && Math.abs(za - F.Q[1]) < 1e-7 * scl) Rz = F.Q[0];
          if (Rz == null || !(Rz > 1e-9)) continue;
          var tolR = 1e-6 * Math.max(1, Rz), lo = Rz * Math.cos(Math.PI / 8) - tolR;
          if (ra > Rz + tolR || rb > Rz + tolR || ra < lo || rb < lo) continue;
          // the chord must be a boundary of the facet on the curve: its midpoint no nearer the axis than the chord of
          // the facet it lies on (a straight edge across the face would be)
          if (len(sub(scale(add(A, B), 0.5), c)) < lo) continue;
          // keyed by the record's origin as well as za: two faces of one cylinder can carry records with different
          // origins, and a rim at za of one is not the other's (OpenCascade's Pulley: y = 6 and y = 20) (r9/drawings9)
          var dsg = (S.d[0] < -1e-9 || (Math.abs(S.d[0]) <= 1e-9 && (S.d[1] < -1e-9 || (Math.abs(S.d[1]) <= 1e-9 && S.d[2] < 0)))) ? -1 : 1;
          g = { key: sk + '|o' + Math.round(dsg * dot(S.o, S.d) * 1e6) + '|z' + Math.round(za * 1e6), center: c, normal: S.d.slice(), radius: Rz, surface: S };
        } else if (F.P && Math.abs(dot(norm(cross(S.d, sub(A, S.o))), sub(B, S.o))) < 1e-9 * scl) {
          // a profile arc of a partial revolve: in a meridian half-plane, both ends on the tube circle
          // the radial direction of the half-plane, from the end farther from the axis (the other may be a pole)
          var va = sub(sub(A, S.o), scale(S.d, za)), vb = sub(sub(B, S.o), scale(S.d, zb));
          var er = norm(len(va) >= len(vb) ? va : vb), Cr = S.t === 'tor' ? S.R : 0, C = add(S.o, scale(er, Cr));
          var da = len(sub(A, C)), db = len(sub(B, C));
          if (Math.abs(da - S.r) > 1e-6 * Math.max(1, S.r) || Math.abs(db - S.r) > 1e-6 * Math.max(1, S.r)) continue;
          var nrm = norm(cross(er, S.d)), ang = Math.atan2(dot(er, cross(S.d, F.e0)), dot(er, F.e0));
          g = { key: sk + '|m' + Math.round(ang * 1e6), center: C, normal: nrm, radius: S.r, surface: S };
        }
        if (!g) continue;
        if (!groups[g.key]) { groups[g.key] = { g: g, edges: {} }; order.push(g.key); }
        var ek = k3(A) < k3(B) ? k3(A) + '|' + k3(B) : k3(B) + '|' + k3(A), E = groups[g.key].edges;
        if (E[ek]) E[ek].n++; else E[ek] = { n: 1, a: A, b: B };
      }
    });
    var out = [];
    order.forEach(function (key) {
      var G = groups[key], g = G.g, chords = [];
      Object.keys(G.edges).forEach(function (ek) { var e = G.edges[ek]; if (e.n === 1) chords.push([e.a, e.b]); });
      if (!chords.length) return;
      var n = g.normal, xd = null;
      // reference direction: world-stable (the in-plane direction nearest +x, else +y) so equal circles agree
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(function (w) { if (xd) return; var t = sub(w, scale(n, dot(w, n))); if (len(t) > 1e-6) xd = norm(t); });
      var yd = cross(n, xd);
      function angle(p) { var v = sub(p, g.center), a = Math.atan2(dot(v, yd), dot(v, xd)); return a < 0 ? a + 2 * Math.PI : a; }
      // angular intervals of the chords, merged into runs
      var iv = chords.map(function (c) {
        var a = angle(c[0]), b = angle(c[1]);
        if (b < a) { var t = a; a = b; b = t; }
        if (b - a > Math.PI) { var t2 = a; a = b; b = t2 + 2 * Math.PI; } // the chord across angle 0
        return [a, b, c];
      }).sort(function (u, v) { return u[0] - v[0]; });
      var runs = [];
      iv.forEach(function (u) {
        var r = runs[runs.length - 1];
        if (r && u[0] <= r.a1 + 1e-9) { r.a1 = Math.max(r.a1, u[1]); r.chords.push(u[2]); }
        else runs.push({ a0: u[0], a1: u[1], chords: [u[2]] });
      });
      // a run that wraps past 2π joins the first
      if (runs.length > 1) {
        var last = runs[runs.length - 1], first = runs[0];
        if (last.a1 >= 2 * Math.PI + first.a0 - 1e-9) { first.a0 = last.a0 - 2 * Math.PI; first.chords = last.chords.concat(first.chords); runs.pop(); }
      }
      runs.forEach(function (r) {
        var full = r.a1 - r.a0 >= 2 * Math.PI - 1e-9;
        out.push({ kind: full ? 'circle' : 'arc', center: g.center, normal: n, radius: g.radius, xdir: xd,
          a0: full ? 0 : r.a0, a1: full ? 2 * Math.PI : r.a1, surface: g.surface, chords: r.chords });
      });
    });
    return out;
  }
  // meshCurveInfo(mesh) -> { faces, faceSurfs, key0, curves }: what the viewport needs about a mesh's curved faces, as
  // plain data a worker can send with its build (r3/engine3): faceSurfs[i] the surface keys of mesh face i's polygons
  // (null: none curved), key0[i] that of its first polygon, curves = curveEdges(mesh); faces = the face count it fits.
  function meshCurveInfo(mesh) {
    var keyOf = new Map();
    curveSurfaces(mesh).forEach(function (s) { s.polys.forEach(function (p) { keyOf.set(p, s.key); }); });
    var faceSurfs = [], key0 = [];
    mesh.faces.forEach(function (f) {
      var ks = null, ps = f.polys || [];
      for (var i = 0; i < ps.length; i++) { var k = keyOf.get(ps[i]); if (k && (!ks || ks.indexOf(k) < 0)) (ks = ks || []).push(k); }
      faceSurfs.push(ks);
      key0.push(ps[0] && keyOf.get(ps[0]) || null);
    });
    var curves = keyOf.size ? curveEdges(mesh).map(function (c) {
      return { kind: c.kind, center: c.center, normal: c.normal, radius: c.radius, xdir: c.xdir, a0: c.a0, a1: c.a1, chords: c.chords };
    }) : [];
    return { faces: mesh.faces.length, faceSurfs: faceSurfs, key0: key0, curves: curves };
  }
  // analyticNormals(mesh) -> Float32Array laid out like mesh.normals: every corner of a triangle on a curved face gets
  // its surface's own normal there, oriented like its facet's (planar faces keep the flat normals). The same numbers as
  // ui-core.js analyticNormals (the viewport's smooth shading), so a worker can find them and send them with its build
  // (r3/engine3: tens of ms on the main thread for an OpenCascade solid, where every facet is curved).
  function surfNormalAt(S, x) {
    var v = [x[0] - S.o[0], x[1] - S.o[1], x[2] - S.o[2]], d = S.d, z = dot(v, d), n;
    if (S.t === 'sph') n = v;
    else {
      var rho = [v[0] - d[0] * z, v[1] - d[1] * z, v[2] - d[2] * z], rl = len(rho);
      if (rl < 1e-9) return null;
      var er = [rho[0] / rl, rho[1] / rl, rho[2] / rl];
      if (S.t === 'cyl') n = er;
      else if (S.t === 'cone') n = [er[0] - (S.k || 0) * d[0], er[1] - (S.k || 0) * d[1], er[2] - (S.k || 0) * d[2]];
      else if (S.t === 'tor') n = [rho[0] - er[0] * S.R, rho[1] - er[1] * S.R, rho[2] - er[2] * S.R];
      else return null;
    }
    var l = len(n);
    return l > 1e-12 ? [n[0] / l, n[1] / l, n[2] / l] : null;
  }
  function analyticNormals(m) {
    var out = new Float32Array(m.normals);
    (m.faces || []).forEach(function (f) {
      if (!f.polys) return;
      var t = f.start, fn = f.normal, writes = [];
      f.polys.forEach(function (p) {
        var vs = p.vertices, nt = Math.max(0, vs.length - 2);
        if (p.surf && p.surf.s) {
          var vn = vs.map(function (vx) {
            var n = surfNormalAt(p.surf.s, [vx.pos.x, vx.pos.y, vx.pos.z]);
            if (!n) return fn;
            return dot(n, fn) < 0 ? [-n[0], -n[1], -n[2]] : n;
          });
          for (var j = 1; j + 1 < vs.length; j++) writes.push(t + j - 1, vn[0], vn[j], vn[j + 1]);
        }
        t += nt;
      });
      if (t !== f.start + f.count) return;
      for (var w = 0; w < writes.length; w += 4) {
        var o = writes[w] * 9;
        for (var c = 0; c < 3; c++) { var n = writes[w + 1 + c]; out[o + c * 3] = n[0]; out[o + c * 3 + 1] = n[1]; out[o + c * 3 + 2] = n[2]; }
      }
    });
    return out;
  }

  // massProps(mesh, density) -> { volume, area, centroid, bbox, density, mass, polygonal?, curved? }. Volume, area and
  // centroid are the exact values of the true curved faces when the mesh's faces carry their CSG polygons (meshes
  // from meshFromBody): the polygonal figures plus curveCorrection. `polygonal` keeps the facets' own volume and
  // area; `curved` counts the facets on analytic surfaces.
  function massProps(mesh, density) {
    var p = mesh.positions64 || mesh.positions, vol = 0, area = 0, cx = 0, cy = 0, cz = 0;
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < p.length; i += 9) {
      var a = [p[i], p[i + 1], p[i + 2]], b = [p[i + 3], p[i + 4], p[i + 5]], c = [p[i + 6], p[i + 7], p[i + 8]];
      var v = dot(a, cross(b, c)) / 6;
      vol += v;
      cx += v * (a[0] + b[0] + c[0]) / 4; cy += v * (a[1] + b[1] + c[1]) / 4; cz += v * (a[2] + b[2] + c[2]) / 4;
      area += len(cross(sub(b, a), sub(c, a))) / 2;
      [a, b, c].forEach(function (q) { for (var k = 0; k < 3; k++) { if (q[k] < min[k]) min[k] = q[k]; if (q[k] > max[k]) max[k] = q[k]; } });
    }
    if (!(p.length > 0)) { min = [0, 0, 0]; max = [0, 0, 0]; }
    var polygonal = null, curved = 0;
    if (mesh.exact) {
      // OpenCascade's exact B-rep integrals (the facets only give the bounding box here)
      var ex = mesh.exact;
      return { volume: ex.volume, area: ex.area, centroid: ex.centroid.slice(), bbox: { min: min, max: max }, density: density, mass: ex.volume * density, polygonal: { volume: vol, area: area }, exact: true };
    }
    if (mesh.faces && mesh.faces.length && mesh.faces[0].polys) {
      var polys = [];
      mesh.faces.forEach(function (f) { if (f.polys) polys = polys.concat(f.polys); });
      var corr = curveCorrection(polys);
      if (corr.facets) {
        polygonal = { volume: vol, area: area };
        curved = corr.facets;
        vol += corr.volume; area += corr.area;
        cx += corr.moment[0]; cy += corr.moment[1]; cz += corr.moment[2];
      }
    }
    var centroid = vol > 1e-12 ? [cx / vol, cy / vol, cz / vol] : [0, 0, 0];
    var out = { volume: vol, area: area, centroid: centroid, bbox: { min: min, max: max }, density: density, mass: vol * density };
    if (polygonal) { out.polygonal = polygonal; out.curved = curved; }
    return out;
  }

  // ------------------------------------------------------------------ mesh quality
  // meshQuality(mesh, opts?) -> { triangles, vertices, minAngle, needles, slivers, openEdges, nonManifoldEdges,
  //   tJunctions, closed, diag, tol }
  // Works on the rendered triangles (positions64). Vertices closer than tol = opts.tol (default 1e-9 × the bounding
  // diagonal) are welded. Every directed triangle edge must be cancelled by an opposite edge: first exactly (the same
  // two welded vertices), then, for what is left, by antiparallel collinear edges within tol (T-junctions: a long edge
  // on one side, several short ones on the other), subtracting the overlapping parameter ranges. What remains longer
  // than tol is an open edge (a crack as narrow as ~10 tol is found; the drawing's edge matcher pairs lines on a
  // 1e-3 grid and would not see it). An edge used more than once in the same direction, or by more than two
  // triangles, is non-manifold. slivers: triangles whose height over their longest edge is under tol (collinear);
  // needles: triangles with a corner under opts.needleDeg (default 1°); minAngle in degrees over non-sliver triangles.
  function meshQuality(mesh, opts) {
    opts = opts || {};
    var P = mesh.positions64 || mesh.positions, nT = P.length / 9;
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], i, k;
    for (i = 0; i < P.length; i += 3) for (k = 0; k < 3; k++) { if (P[i + k] < min[k]) min[k] = P[i + k]; if (P[i + k] > max[k]) max[k] = P[i + k]; }
    var diag = P.length ? len(sub(max, min)) : 0, tol = opts.tol || Math.max(diag * 1e-9, 1e-12);
    var needleDeg = opts.needleDeg == null ? 1 : opts.needleDeg;
    // weld: grid cells of size tol, a vertex joins any existing vertex within tol in the 27 neighbouring cells
    var cells = {}, verts = [], ids = new Int32Array(nT * 3);
    function cellKey(x, y, z) { return x + ',' + y + ',' + z; }
    for (i = 0; i < nT * 3; i++) {
      var x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      var cx = Math.floor(x / tol), cy = Math.floor(y / tol), cz = Math.floor(z / tol), found = -1;
      for (var dx = -1; dx <= 1 && found < 0; dx++) for (var dy = -1; dy <= 1 && found < 0; dy++) for (var dz = -1; dz <= 1 && found < 0; dz++) {
        var list = cells[cellKey(cx + dx, cy + dy, cz + dz)];
        if (!list) continue;
        for (var m = 0; m < list.length; m++) {
          var v = verts[list[m]];
          if (Math.abs(v[0] - x) <= tol && Math.abs(v[1] - y) <= tol && Math.abs(v[2] - z) <= tol) { found = list[m]; break; }
        }
      }
      if (found < 0) {
        found = verts.length; verts.push([x, y, z]);
        var ck = cellKey(cx, cy, cz);
        (cells[ck] || (cells[ck] = [])).push(found);
      }
      ids[i] = found;
    }
    // triangle shape
    var minAngle = 180, needles = 0, slivers = 0;
    for (var t = 0; t < nT; t++) {
      var A = verts[ids[t * 3]], B = verts[ids[t * 3 + 1]], C = verts[ids[t * 3 + 2]];
      var ab = sub(B, A), bc = sub(C, B), ca = sub(A, C), lab = len(ab), lbc = len(bc), lca = len(ca);
      var area2 = len(cross(ab, sub(C, A))), longest = Math.max(lab, lbc, lca);
      if (!(longest > 0) || area2 / longest < tol) { slivers++; continue; }
      var angA = Math.acos(Math.max(-1, Math.min(1, -dot(ab, ca) / (lab * lca)))), angB = Math.acos(Math.max(-1, Math.min(1, -dot(bc, ab) / (lbc * lab))));
      var a = Math.min(angA, angB, Math.PI - angA - angB) * 180 / Math.PI;
      if (a < minAngle) minAngle = a;
      if (a < needleDeg) needles++;
    }
    // exact pairing of directed edges between welded vertices
    var directed = {}, undirected = {}, nonManifold = 0, open = [];
    for (t = 0; t < nT; t++) for (k = 0; k < 3; k++) {
      var ia = ids[t * 3 + k], ib = ids[t * 3 + (k + 1) % 3];
      if (ia === ib) continue;
      var dk = ia + '>' + ib, uk = ia < ib ? ia + '|' + ib : ib + '|' + ia;
      directed[dk] = (directed[dk] || 0) + 1;
      undirected[uk] = (undirected[uk] || 0) + 1;
    }
    Object.keys(undirected).forEach(function (uk) {
      var p = uk.split('|'), f = directed[p[0] + '>' + p[1]] || 0, r = directed[p[1] + '>' + p[0]] || 0;
      if (f > 1 || r > 1 || f + r > 2) nonManifold++;
      for (var n = 0; n < f - r; n++) open.push([+p[0], +p[1]]);
      for (n = 0; n < r - f; n++) open.push([+p[1], +p[0]]);
    });
    // T-junctions: cancel what is left against antiparallel collinear edges, by parameter range along each edge
    var rest = open.map(function (e) {
      var a = verts[e[0]], b = verts[e[1]], d = sub(b, a), L = len(d);
      return { a: a, u: scale(d, 1 / L), L: L, pieces: [[0, L]], lo: [Math.min(a[0], b[0]) - tol, Math.min(a[1], b[1]) - tol, Math.min(a[2], b[2]) - tol], hi: [Math.max(a[0], b[0]) + tol, Math.max(a[1], b[1]) + tol, Math.max(a[2], b[2]) + tol] };
    });
    function cutOut(e, t0, t1) {
      var out = [];
      e.pieces.forEach(function (pc) {
        if (t1 <= pc[0] || t0 >= pc[1]) { out.push(pc); return; }
        if (t0 > pc[0]) out.push([pc[0], t0]);
        if (t1 < pc[1]) out.push([t1, pc[1]]);
      });
      e.pieces = out;
    }
    function offLine(e, p) { var w = sub(p, e.a), s = dot(w, e.u); return len(sub(w, scale(e.u, s))); }
    var tj = 0;
    for (i = 0; i < rest.length; i++) {
      var e = rest[i];
      for (var j = i + 1; j < rest.length; j++) {
        var g = rest[j];
        if (dot(e.u, g.u) > -1 + 1e-9) continue;
        if (g.lo[0] > e.hi[0] || g.hi[0] < e.lo[0] || g.lo[1] > e.hi[1] || g.hi[1] < e.lo[1] || g.lo[2] > e.hi[2] || g.hi[2] < e.lo[2]) continue;
        var gb = add(g.a, scale(g.u, g.L));
        if (offLine(e, g.a) > tol || offLine(e, gb) > tol) continue;
        var s0 = dot(sub(gb, e.a), e.u), s1 = dot(sub(g.a, e.a), e.u); // g runs backwards along e
        var t0 = Math.max(0, s0), t1 = Math.min(e.L, s1);
        if (t1 - t0 <= tol) continue;
        cutOut(e, t0, t1);
        // the same range in g's own parameter
        cutOut(g, dot(sub(add(e.a, scale(e.u, t1)), g.a), g.u), dot(sub(add(e.a, scale(e.u, t0)), g.a), g.u));
        tj++;
      }
    }
    var openEdges = 0, openList = [];
    rest.forEach(function (e) { e.pieces.forEach(function (pc) { if (pc[1] - pc[0] > tol * 10) { openEdges++; if (opts.list) openList.push([add(e.a, scale(e.u, pc[0])), add(e.a, scale(e.u, pc[1]))]); } }); });
    return { openList: opts.list ? openList : undefined, triangles: nT, vertices: verts.length, minAngle: nT - slivers > 0 ? minAngle : 0, needles: needles, slivers: slivers,
      openEdges: openEdges, nonManifoldEdges: nonManifold, tJunctions: tj, closed: openEdges === 0 && nonManifold === 0, diag: diag, tol: tol };
  }

  // ------------------------------------------------------------------ face outlines (for DXF of flat faces)
  var outlineOptions = { gridMin: 32 };   // faces with more vertices use outlineGrid (Infinity: never; the tests compare)
  function key3(p) { return Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4) + ',' + Math.round(p[2] * 1e4); }

  // outlineGrid(vlist, plane) -> near(a, b, mark, fn): calls fn(v) for every vertex of vlist that can lie within 1e-5
  // of segment a-b (and maybe a few more), each once per mark. The vertices are put, in the face's 2D frame, into every
  // cell of a uniform grid their ±2e-5 box touches; a segment visits the cells it crosses (Amanatides-Woo). The 2D
  // projection never lengthens a distance, so this is a superset of faceOutline's own test and its result is unchanged.
  function outlineGrid(vlist, plane) {
    var nv = vlist.length, P = new Float64Array(nv * 2), lo = [Infinity, Infinity], hi = [-Infinity, -Infinity], TOL = 2e-5;
    for (var i = 0; i < nv; i++) {
      var q = to2D(plane, vlist[i]);
      P[i * 2] = q[0]; P[i * 2 + 1] = q[1];
      for (var k = 0; k < 2; k++) { if (q[k] < lo[k]) lo[k] = q[k]; if (q[k] > hi[k]) hi[k] = q[k]; }
    }
    lo[0] -= TOL; lo[1] -= TOL; hi[0] += TOL; hi[1] += TOL;
    var w = hi[0] - lo[0], h = hi[1] - lo[1];
    var c = Math.max(Math.sqrt(w * h / nv), Math.max(w, h) / nv, 8 * TOL);
    var nx = Math.max(1, Math.ceil(w / c)), ny = Math.max(1, Math.ceil(h / c)), cells = new Array(nx * ny);
    function cx(x) { return Math.min(nx - 1, Math.max(0, Math.floor((x - lo[0]) / c))); }
    function cy(y) { return Math.min(ny - 1, Math.max(0, Math.floor((y - lo[1]) / c))); }
    for (i = 0; i < nv; i++) {
      var x0 = cx(P[i * 2] - TOL), x1 = cx(P[i * 2] + TOL), y0 = cy(P[i * 2 + 1] - TOL), y1 = cy(P[i * 2 + 1] + TOL);
      for (var gx = x0; gx <= x1; gx++) for (var gy = y0; gy <= y1; gy++) (cells[gx * ny + gy] = cells[gx * ny + gy] || []).push(i);
    }
    var stamp = new Int32Array(nv).fill(-1);
    return function (a, b, mark, fn) {
      var pa = to2D(plane, a), pb = to2D(plane, b);
      var X0 = (pa[0] - lo[0]) / c, Y0 = (pa[1] - lo[1]) / c, X1 = (pb[0] - lo[0]) / c, Y1 = (pb[1] - lo[1]) / c;
      var ix = cx(pa[0]), iy = cy(pa[1]), ex = cx(pb[0]), ey = cy(pb[1]);
      var dx = X1 - X0, dy = Y1 - Y0, sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
      var tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
      var tmx = dx !== 0 ? (sx > 0 ? ix + 1 - X0 : X0 - ix) * tdx : Infinity, tmy = dy !== 0 ? (sy > 0 ? iy + 1 - Y0 : Y0 - iy) * tdy : Infinity;
      function visit(gx, gy) {
        var l = cells[gx * ny + gy];
        if (l) for (var j = 0; j < l.length; j++) { var vi = l[j]; if (stamp[vi] !== mark) { stamp[vi] = mark; fn(vlist[vi]); } }
      }
      visit(ix, iy);
      for (var guard = Math.abs(ex - ix) + Math.abs(ey - iy) + 4; (ix !== ex || iy !== ey) && guard > 0; guard--) {
        if (tmx < tmy) { ix += sx; tmx += tdx; } else { iy += sy; tmy += tdy; }
        if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) break;
        visit(ix, iy);
      }
      visit(ex, ey);
    };
  }

  // Boundary loops of a planar face as 2D polylines in the face frame. Handles T-junctions by splitting edges at
  // any face vertex lying on them.
  function faceOutline(mesh, faceIndex) {
    var face = mesh.faces[faceIndex];
    if (!face) return null;
    var plane = planeFromFace(face.normal, scale(face.normal, face.w));
    var verts = {}, edges = [];
    face.polys.forEach(function (p) {
      var vs = p.vertices.map(function (v) { var q = arr(v.pos); verts[key3(q)] = q; return q; });
      for (var i = 0; i < vs.length; i++) edges.push([vs[i], vs[(i + 1) % vs.length]]);
    });
    var vlist = Object.keys(verts).map(function (k) { return verts[k]; });
    // split edges at collinear interior vertices; on faces with many vertices only the vertices in the grid cells the
    // edge crosses are tested (r3/engine3: was every vertex against every edge, ~100 ms on the Flange)
    var near = vlist.length > outlineOptions.gridMin ? outlineGrid(vlist, plane) : null;
    var split = [];
    edges.forEach(function (e, ei) {
      var a = e[0], b = e[1], d = sub(b, a), L = len(d);
      if (L < 1e-9) return;
      var u = scale(d, 1 / L), ts = [0, L];
      function test(v) {
        var w = sub(v, a), t = dot(w, u);
        if (t <= 1e-6 || t >= L - 1e-6) return;
        var perp = len(sub(w, scale(u, t)));
        if (perp < 1e-5) ts.push(t);
      }
      if (near) near(a, b, ei, test); else vlist.forEach(test);
      ts.sort(function (x, y) { return x - y; });
      for (var i = 0; i + 1 < ts.length; i++) {
        if (ts[i + 1] - ts[i] < 1e-7) continue;
        split.push([add(a, scale(u, ts[i])), add(a, scale(u, ts[i + 1]))]);
      }
    });
    // an edge is on the boundary when no opposite-direction twin exists
    var count = {};
    split.forEach(function (e) {
      var k = key3(e[0]) + '>' + key3(e[1]);
      count[k] = (count[k] || 0) + 1;
    });
    var boundary = split.filter(function (e) {
      var twin = key3(e[1]) + '>' + key3(e[0]);
      return !count[twin];
    });
    // chain
    var next = {};
    boundary.forEach(function (e) { next[key3(e[0])] = e; });
    var used = {}, loops = [];
    boundary.forEach(function (e) {
      var k0 = key3(e[0]);
      if (used[k0]) return;
      var loop = [], cur = e, guard = 0;
      while (cur && !used[key3(cur[0])] && guard++ < 100000) {
        used[key3(cur[0])] = true;
        loop.push(to2D(plane, cur[0]));
        cur = next[key3(cur[1])];
      }
      if (loop.length >= 3) loops.push(loop);
    });
    // simplify collinear runs
    loops = loops.map(function (l) {
      var out = [];
      for (var i = 0; i < l.length; i++) {
        var p = l[(i + l.length - 1) % l.length], q = l[i], r = l[(i + 1) % l.length];
        var cr = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
        if (Math.abs(cr) > 1e-7) out.push(q);
      }
      return out.length >= 3 ? out : l;
    });
    return { loops: loops, plane: plane, face: face };
  }

  // ------------------------------------------------------------------ body edges (for display, picking, chamfer/fillet)
  var COS_SMOOTH = Math.cos(22 * Math.PI / 180);
  function ekey(p) { return Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000) + ',' + Math.round(p[2] * 1000); }

  // -> [{a, b, mid, dir, len, faces:[i,j], normals:[nA,nB], smooth, convex, ka, kb}]
  function bodyEdges(mesh) {
    var map = {}, order = [];
    for (var i = 0; i < mesh.faces.length; i++) {
      var o;
      try { o = faceOutline(mesh, i); } catch (e) { o = null; }
      if (!o) continue;
      var n = mesh.faces[i].normal;
      o.loops.forEach(function (loop) {
        for (var k = 0; k < loop.length; k++) {
          var a = to3D(o.plane, loop[k][0], loop[k][1]), b = to3D(o.plane, loop[(k + 1) % loop.length][0], loop[(k + 1) % loop.length][1]);
          var ka = ekey(a), kb = ekey(b), key = ka < kb ? ka + '|' + kb : kb + '|' + ka;
          var e = map[key];
          if (!e) { e = map[key] = { a: a, b: b, ka: ka, kb: kb, faces: [], normals: [], ins: [] }; order.push(key); }
          e.faces.push(i);
          e.normals.push(n);
          // outline loops run counter-clockwise about the face normal, so the face interior is to the left of a->b
          e.ins.push(norm(cross(n, norm(sub(b, a)))));
        }
      });
    }
    var list = [];
    order.forEach(function (key) {
      var e = map[key];
      e.mid = scale(add(e.a, e.b), 0.5);
      var d = sub(e.b, e.a);
      e.len = len(d);
      if (e.len < 1e-6) return;
      e.dir = scale(d, 1 / e.len);
      e.smooth = false;
      if (e.normals.length >= 2) {
        e.smooth = true;
        for (var p = 0; p < e.normals.length && e.smooth; p++) for (var q = p + 1; q < e.normals.length; q++) {
          if (dot(e.normals[p], e.normals[q]) < COS_SMOOTH) { e.smooth = false; break; }
        }
      }
      e.convex = null;
      if (e.faces.length >= 2) {
        // convex when face B's interior heads behind face A's plane (into the material)
        e.convex = dot(e.normals[0], e.ins[1]) < 0;
      }
      list.push(e);
    });
    return list;
  }

  function pointSegmentDistance(p, a, b) {
    var ab = sub(b, a), t = dot(sub(p, a), ab) / Math.max(dot(ab, ab), 1e-12);
    t = Math.max(0, Math.min(1, t));
    return len(sub(p, add(a, scale(ab, t))));
  }

  // Resolve edge specs ({at:[x,y,z], chain:bool}) against the current edges, with tangent-chain propagation.
  function resolveEdges(specs, edges, tol) {
    var picked = [], seen = {};
    var COS_CHAIN = Math.cos(28 * Math.PI / 180);
    function addEdge(e) { var k = e.ka + '|' + e.kb; if (seen[k]) return false; seen[k] = true; picked.push(e); return true; }
    (specs || []).forEach(function (spec) {
      var best = null, bestD = tol;
      edges.forEach(function (e) {
        var d = pointSegmentDistance(spec.at, e.a, e.b);
        if (d < bestD) { bestD = d; best = e; }
      });
      if (!best) return;
      addEdge(best);
      if (spec.chain === false) return;
      // breadth-first along nearly collinear neighbours sharing an endpoint and the same convexity
      var queue = [best];
      while (queue.length) {
        var cur = queue.shift();
        edges.forEach(function (e) {
          if (e === cur || e.convex !== cur.convex) return;
          var touches = e.ka === cur.ka || e.ka === cur.kb || e.kb === cur.ka || e.kb === cur.kb;
          if (!touches) return;
          if (Math.abs(dot(e.dir, cur.dir)) < COS_CHAIN) return;
          if (addEdge(e)) queue.push(e);
        });
      }
    });
    return picked;
  }

  // Cross-section solid for one edge: chamfer (flat) or fillet (arc). Returns CSG; caller unions per op.
  function edgeTool(e, mesh, kind, size, extA, extB, tag) {
    var fa = mesh.faces[e.faces[0]], fb = mesh.faces[e.faces[1]];
    var nA = fa.normal, nB = fb.normal, m = e.mid, dir = e.dir;
    var dA = e.ins[0], dB = e.ins[1];
    var cosT = Math.max(-1, Math.min(1, dot(dA, dB)));
    var theta = Math.acos(cosT);
    if (theta < 0.05 || theta > Math.PI - 0.05) throw new Error('Edge faces are nearly parallel; cannot ' + kind + ' it.');
    var plane = { origin: m, x: dA, y: cross(dir, dA), n: dir };
    function uv(p) { var d = sub(p, m); return [dot(d, plane.x), dot(d, plane.y)]; }
    var pts = [], arcPt = [], S = null;
    var ext = size * 1.5;
    if (kind === 'chamfer') {
      pts.push(add(m, scale(dA, size)), add(m, scale(dB, size)));
    } else {
      var t = size / Math.tan(theta / 2);
      var pA = add(m, scale(dA, t)), pB = add(m, scale(dB, t));
      var c = add(m, scale(norm(add(dA, dB)), size / Math.sin(theta / 2)));
      var vA = sub(pA, c), vB = sub(pB, c);
      var sweep = Math.acos(Math.max(-1, Math.min(1, dot(vA, vB) / (size * size))));
      var axis = norm(cross(vA, vB));
      var segs = TESS.legacy ? Math.max(4, Math.round(sweep / (Math.PI / 12))) : Math.max(4, Math.ceil(segsForRadius(size) * sweep / (2 * Math.PI) - 1e-9));
      for (var s = 0; s <= segs; s++) { pts.push(add(c, rotatePoint(vA, [0, 0, 0], axis, sweep * s / segs))); arcPt.push(true); }
      // the round is a true cylinder about the edge line through c when both faces are planar (a fillet along a
      // chain of facets of a curved face is a polygonal approximation of a torus: no record)
      var planarFaces = [fa, fb].every(function (f) { return !(f.polys || []).some(function (p) { return p.surf; }); });
      if (planarFaces) S = { t: 'cyl', o: c, d: dir.slice(), r: size };
    }
    var last = pts[pts.length - 1], first = pts[0];
    if (e.convex) {
      pts.push(add(last, scale(nB, ext)), add(first, scale(nA, ext)));
    } else {
      pts.push(sub(m, scale(add(dA, dB), ext)));
    }
    while (arcPt.length < pts.length) arcPt.push(false);
    var loop = pts.map(uv);
    if (signedArea(loop) < 0) { loop.reverse(); pts.reverse(); arcPt.reverse(); }
    // Section is swept from end A to end B. Ends are either perpendicular caps (with a small overshoot) or
    // mitre planes shared with a selected neighbour, so chained facets join without notches.
    var tA = dot(sub(e.a, m), dir) - (extA.ext || 0), tB = dot(sub(e.b, m), dir) + (extB.ext || 0);
    var lim = size * 6;
    function shift(P, cap, def) {
      if (!cap || !cap.n) return def;
      var den = dot(dir, cap.n);
      if (Math.abs(den) < 0.25) return def;
      var t = dot(sub(cap.v, P), cap.n) / den;
      return Math.max(def - lim, Math.min(def + lim, t));
    }
    var bottom = pts.map(function (P) { return add(P, scale(dir, shift(P, extA, tA))); });
    var top = pts.map(function (P) { return add(P, scale(dir, shift(P, extB, tB))); });
    var polys = [], n = pts.length;
    triangulate(loop).forEach(function (t) {
      pushPoly(polys, [top[t[0]], top[t[1]], top[t[2]]], tag);
      pushPoly(polys, [bottom[t[2]], bottom[t[1]], bottom[t[0]]], tag);
    });
    var F = S ? { s: S } : null;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      var side = poly([bottom[i], bottom[j], top[j], top[i]], tag);
      if (!side) continue;
      if (F && arcPt[i] && arcPt[j]) side.surf = F;
      polys.push(side);
    }
    return ensureOutward(polys);
  }

  // Mitre plane at vertex v between edge e (leaving v along u1) and neighbour nb; null when not exactly one neighbour.
  function mitreCap(e, atA, neighbours) {
    var v = atA ? e.a : e.b;
    if (neighbours.length !== 1) return { v: v, n: null, ext: neighbours.length ? 0.02 : 0.01 };
    var nb = neighbours[0];
    var u1 = atA ? e.dir : scale(e.dir, -1);
    var sharedKey = atA ? e.ka : e.kb;
    var u2 = nb.ka === sharedKey ? nb.dir : scale(nb.dir, -1);
    var nm = sub(u1, u2);
    if (len(nm) < 1e-6) return { v: v, n: null, ext: 0.01 };
    return { v: v, n: norm(nm), ext: 0 };
  }

  // -> { cut: CSG|null, add: CSG|null, count }
  function buildEdgeFeature(f, ctx) {
    if (!ctx.body) throw new Error('Nothing to ' + f.type + ' yet.');
    var size = f.type === 'chamfer' ? +f.d : +f.r;
    if (!(size > 0)) throw new Error((f.type === 'chamfer' ? 'Distance' : 'Radius') + ' must be greater than zero.');
    var mesh = meshFromBody(ctx.body);
    var edges = bodyEdges(mesh).filter(function (e) { return !e.smooth && e.faces.length === 2 && e.convex !== null; });
    var selected = resolveEdges(f.edges, edges, Math.max(0.5, size));
    if (!selected.length) throw new Error('No edges found for this ' + f.type + '. Select edges again.');
    var byKey = {};
    selected.forEach(function (e) { (byKey[e.ka] = byKey[e.ka] || []).push(e); (byKey[e.kb] = byKey[e.kb] || []).push(e); });
    var cuts = [], adds = [];
    selected.forEach(function (e) {
      var nbA = byKey[e.ka].filter(function (x) { return x !== e; }), nbB = byKey[e.kb].filter(function (x) { return x !== e; });
      var tool = edgeTool(e, mesh, f.type, size, mitreCap(e, true, nbA), mitreCap(e, false, nbB), f.id);
      (e.convex ? cuts : adds).push(tool);
    });
    return { cut: cuts.length ? unionAll(cuts) : null, add: adds.length ? unionAll(adds) : null, count: selected.length };
  }

  // ------------------------------------------------------------------ sweep & loft
  // Chain a sketch's open entities (lines, arcs, open polylines) into one 3D polyline path.
  // `info.dropped` receives the number of entities that did not connect to the chain.
  function sketchPath(sketch, plane, info) {
    var chains = [];
    (sketch.entities || []).forEach(function (e) {
      if (e.construction) return;
      entityPolylines(e).forEach(function (pl) { chains.push(pl.closed ? pl.pts.concat([pl.pts[0]]) : pl.pts.slice()); });
    });
    if (!chains.length) throw new Error('Path sketch has no lines or arcs.');
    var pts = chains.shift();
    var guard = 0;
    while (chains.length && guard++ < 1000) {
      var head = pts[0], tail = pts[pts.length - 1], found = false;
      for (var i = 0; i < chains.length; i++) {
        var c = chains[i], c0 = c[0], c1 = c[c.length - 1];
        if (key2(c0) === key2(tail)) { pts = pts.concat(c.slice(1)); found = true; }
        else if (key2(c1) === key2(tail)) { pts = pts.concat(c.slice().reverse().slice(1)); found = true; }
        else if (key2(c1) === key2(head)) { pts = c.slice(0, -1).concat(pts); found = true; }
        else if (key2(c0) === key2(head)) { pts = c.slice().reverse().slice(0, -1).concat(pts); found = true; }
        if (found) { chains.splice(i, 1); break; }
      }
      if (!found) break; // disconnected leftovers are ignored (reported through info.dropped)
    }
    if (info) info.dropped = chains.length;
    return pts.map(function (p) { return to3D(plane, p[0], p[1]); });
  }

  // Minimal rotation taking direction `from` to `to`, as a function on vectors.
  function rotationTo(from, to) {
    var f = norm(from), t = norm(to), c = Math.max(-1, Math.min(1, dot(f, t)));
    if (c > 1 - 1e-9) return function (v) { return v; };
    if (c < -1 + 1e-9) {
      var any = Math.abs(f[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      var ax = norm(cross(f, any));
      return function (v) { return rotatePoint(v, [0, 0, 0], ax, Math.PI); };
    }
    var axis = norm(cross(f, t)), ang = Math.acos(c);
    return function (v) { return rotatePoint(v, [0, 0, 0], axis, ang); };
  }

  function triangulateAny(loop2) {
    if (signedArea(loop2) >= 0) return triangulate(loop2);
    var n = loop2.length, rev = loop2.slice().reverse();
    return triangulate(rev).map(function (t) { return [n - 1 - t[0], n - 1 - t[1], n - 1 - t[2]]; });
  }

  // Sweep one planar section (3D points located at path point J) along `dir` for length L with optional mitre caps.
  function sweepSection(pts3, dir, J, L, capA, capB, tag) {
    var x = norm(cross(dir, Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), y = cross(dir, x);
    var loop = pts3.map(function (p) { var d = sub(p, J); return [dot(d, x), dot(d, y)]; });
    var pts = pts3.slice();
    if (signedArea(loop) < 0) { loop.reverse(); pts.reverse(); }
    var extent = 0;
    loop.forEach(function (p) { extent = Math.max(extent, Math.hypot(p[0], p[1])); });
    var lim = L + extent * 6;
    function shift(P, cap, def) {
      if (!cap || !cap.n) return def;
      var den = dot(dir, cap.n);
      if (Math.abs(den) < 0.2) return def;
      var t = dot(sub(cap.v, P), cap.n) / den;
      return Math.max(def - lim, Math.min(def + lim, t));
    }
    var bottom = pts.map(function (P) { return add(P, scale(dir, shift(P, capA, 0))); });
    var top = pts.map(function (P) { return add(P, scale(dir, shift(P, capB, L))); });
    var polys = [], n = pts.length;
    triangulate(loop).forEach(function (t) {
      pushPoly(polys, [top[t[0]], top[t[1]], top[t[2]]], tag);
      pushPoly(polys, [bottom[t[2]], bottom[t[1]], bottom[t[0]]], tag);
    });
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      pushPoly(polys, [bottom[i], bottom[j], top[j], top[i]], tag);
    }
    return ensureOutward(polys);
  }

  function loopCentroid3(pts) {
    var c = [0, 0, 0];
    pts.forEach(function (p) { c = add(c, p); });
    return scale(c, 1 / pts.length);
  }

  function buildSweep(f, model, ctx) {
    var prof = ctx.sketches[f.profile] || findFeature(model, f.profile);
    if (!prof || prof.type !== 'sketch') throw new Error('Select a profile sketch for the sweep.');
    var profPlane = resolvePlane(prof.plane, model, ctx.planes);
    var profile = prof.profile || sketchProfile(prof);
    if (!profile.loops.length) throw new Error('Sweep profile sketch has no closed profile.');
    checkProfile(profile);
    var path;
    if (Array.isArray(f.path)) {
      path = f.path.map(function (p) { return [+p[0], +p[1], +p[2]]; });
      path.forEach(function (p) { if (!isFinite(p[0]) || !isFinite(p[1]) || !isFinite(p[2])) throw new Error('Every sweep path coordinate must be a number.'); });
    } else {
      var ps = ctx.sketches[f.path] || findFeature(model, f.path);
      if (!ps || ps.type !== 'sketch') throw new Error('Select a path sketch for the sweep.');
      var info = {};
      path = sketchPath(ps, resolvePlane(ps.plane, model, ctx.planes), info);
      if (info.dropped && ctx.warnings) ctx.warnings[f.id] = info.dropped + ' path ' + (info.dropped === 1 ? 'entity does' : 'entities do') + ' not connect to the path and ' + (info.dropped === 1 ? 'was' : 'were') + ' ignored.';
    }
    var pts = [path[0]];
    for (var i = 1; i < path.length; i++) if (len(sub(path[i], pts[pts.length - 1])) > 1e-6) pts.push(path[i]);
    if (pts.length < 2) throw new Error('Sweep path needs at least two distinct points.');
    // the path starts at the end nearest the profile
    var c0 = loopCentroid3(profile.loops[0].pts.map(function (p) { return to3D(profPlane, p[0], p[1]); }));
    if (len(sub(pts[pts.length - 1], c0)) < len(sub(pts[0], c0))) pts.reverse();
    var dirs = [];
    for (i = 0; i + 1 < pts.length; i++) dirs.push(norm(sub(pts[i + 1], pts[i])));
    // a closed path (a closed polyline, or a chain back to its start) mitres its start / end joint like every other
    // corner; with flat ends there the tube had a notch on the outside of that corner (−2 % on a rectangular ring)
    var closed = dirs.length > 2 && len(sub(pts[pts.length - 1], pts[0])) < 1e-6;
    var joint = closed && len(add(dirs[dirs.length - 1], dirs[0])) > 1e-9 ? { v: pts[0], n: norm(add(dirs[dirs.length - 1], dirs[0])) } : null;
    // place the profile perpendicular to the first segment, pivoting about the path start
    var J0 = pts[0];
    var nSign = dot(profPlane.n, dirs[0]) < 0 ? -1 : 1;
    var rot0 = rotationTo(scale(profPlane.n, nSign), dirs[0]);
    var sections = profile.loops.map(function (l) {
      return { hole: l.hole, pts: l.pts.map(function (p) { return add(J0, rot0(sub(to3D(profPlane, p[0], p[1]), J0))); }) };
    });
    var perLoop = sections.map(function () { return []; });
    for (i = 0; i < dirs.length; i++) {
      if (i > 0) {
        var R = rotationTo(dirs[i - 1], dirs[i]);
        sections = sections.map(function (s) { return { hole: s.hole, pts: s.pts.map(function (p) { return add(pts[i], R(sub(p, pts[i - 1]))); }) }; });
      }
      var L = len(sub(pts[i + 1], pts[i]));
      var capA = i > 0 ? { v: pts[i], n: norm(add(dirs[i - 1], dirs[i])) } : joint;
      var capB = i + 1 < dirs.length ? { v: pts[i + 1], n: norm(add(dirs[i], dirs[i + 1])) } : joint;
      sections.forEach(function (s, k) { perLoop[k].push(sweepSection(s.pts, dirs[i], pts[i], L, capA, capB, f.id)); });
    }
    var outers = [], holes = [];
    perLoop.forEach(function (parts, k) { (sections[k].hole ? holes : outers).push(unionTree(parts)); });
    if (!outers.length) throw new Error('Sweep profile has no outer loop.');
    var body = CSG.fromPolygons([].concat.apply([], outers.map(function (o) { return o.polygons; })));
    if (holes.length) body = body.subtract(unionAll(holes));
    return body;
  }

  function resampleLoop(pts, N) {
    var n = pts.length, segLen = [], total = 0;
    for (var i = 0; i < n; i++) { var l = len(sub(pts[(i + 1) % n], pts[i])); segLen.push(l); total += l; }
    var out = [], seg = 0, acc = 0;
    for (var k = 0; k < N; k++) {
      var target = total * k / N;
      while (seg < n - 1 && acc + segLen[seg] < target - 1e-12) { acc += segLen[seg]; seg++; }
      var t = segLen[seg] > 1e-12 ? (target - acc) / segLen[seg] : 0;
      out.push(add(pts[seg], scale(sub(pts[(seg + 1) % n], pts[seg]), Math.min(1, Math.max(0, t)))));
    }
    return out;
  }

  function loopNormal3(pts) {
    var nx = 0, ny = 0, nz = 0, n = pts.length;
    for (var i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return norm([nx, ny, nz]);
  }

  // Loft side between convex sections on parallel planes: the convex hull of each consecutive pair (a rotating-calipers
  // merge of the two loops' edge directions), so every side face is planar and every edge convex. Each section keeps
  // its own polygon, so it still matches features made from the same sketch (the Funnel's spout). A Ø80 → Ø14 loft
  // used to resample the 21-gon onto 51 points: non-planar quads split into needle triangles with slightly concave
  // (saddle) diagonals, which the shell could not offset cleanly (grooves in the wall, extra lines in drawings).
  // secs: [{ plane, pts3 }] -> { loops: [pts3 CCW about the loft direction, started at the smallest edge angle],
  // tris: [[p, q, r] or [p, q, r, s]] } or null when a section is not convex or the planes are not parallel.
  function hullLoftLoops(secs) {
    var n0 = secs[0].plane.n, plane = secs[0].plane, sgn = 0, loops = [];
    for (var i = 0; i < secs.length; i++) {
      if (Math.abs(dot(secs[i].plane.n, n0)) < 1 - 1e-9) return null;
      if (i + 1 < secs.length) {
        var dn = dot(sub(loopCentroid3(secs[i + 1].pts), loopCentroid3(secs[i].pts)), n0), s = dn > 0 ? 1 : -1;
        if (Math.abs(dn) < 1e-9 || (sgn && s !== sgn)) return null;
        sgn = s;
      }
      var pts = secs[i].pts.slice(), p2 = pts.map(function (p) { return to2D(plane, p); });
      if (signedArea(p2) < 0) { pts.reverse(); p2.reverse(); }
      var n = pts.length, angs = [], best = 0;
      for (var k = 0; k < n; k++) {
        var a = p2[k], b = p2[(k + 1) % n], c = p2[(k + 2) % n];
        var cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (cr < -1e-9 * (Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) + Math.abs(c[0] - b[0]) + Math.abs(c[1] - b[1]) + 1e-12)) return null;
        var ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        if (ang < 0) ang += Math.PI * 2;
        if (ang > Math.PI * 2 - 1e-9) ang = 0; // so a direction just below 2π merges with the other loop's 0
        angs.push(ang);
        if (ang < angs[best]) best = k;
      }
      loops.push({ pts: pts.slice(best).concat(pts.slice(0, best)), angs: angs.slice(best).concat(angs.slice(0, best)) });
    }
    var tris = [];
    for (i = 0; i + 1 < loops.length; i++) {
      var P = loops[i].pts, Q = loops[i + 1].pts, aP = loops[i].angs, aQ = loops[i + 1].angs, nP = P.length, nQ = Q.length, pi = 0, qj = 0;
      while (pi < nP || qj < nQ) {
        var x = pi < nP ? aP[pi] : Infinity, y = qj < nQ ? aQ[qj] : Infinity;
        var p0 = P[pi % nP], p1 = P[(pi + 1) % nP], q0 = Q[qj % nQ], q1 = Q[(qj + 1) % nQ];
        if (Math.abs(x - y) < 1e-9) { tris.push([p0, p1, q1, q0]); pi++; qj++; }
        else if (x < y) { tris.push([p0, p1, q0]); pi++; }
        else { tris.push([p0, q1, q0]); qj++; }
      }
    }
    // the loops run CCW about the first plane's normal; the side faces above are wound for a loft along +n
    if (sgn < 0) tris.forEach(function (t) { t.reverse(); });
    return { loops: loops.map(function (l) { return sgn < 0 ? l.pts.slice().reverse() : l.pts; }), tris: tris };
  }

  function buildLoft(f, model, ctx) {
    var ids = f.sketches || [];
    if (ids.length < 2) throw new Error('Loft needs at least two profile sketches.');
    var secs = ids.map(function (id) {
      var s = ctx.sketches[id] || findFeature(model, id);
      if (!s || s.type !== 'sketch') throw new Error('Loft sketch not found.');
      var pl = resolvePlane(s.plane, model, ctx.planes);
      var prof = s.profile || sketchProfile(s);
      checkProfile(prof);
      var outers = prof.loops.filter(function (l) { return !l.hole; });
      if (outers.length !== 1) throw new Error('Each loft sketch must contain exactly one closed profile.');
      return { plane: pl, pts: outers[0].pts.map(function (p) { return to3D(pl, p[0], p[1]); }) };
    });
    var polys = [], loops, i;
    var hull = hullLoftLoops(secs);
    if (hull) {
      loops = hull.loops;
      hull.tris.forEach(function (t) { pushPoly(polys, t, f.id); });
    } else {
      var N = 24;
      secs.forEach(function (s) { N = Math.max(N, s.pts.length); });
      N = Math.min(N, 96);
      loops = secs.map(function (s) { return resampleLoop(s.pts, N); });
      // consistent winding along the loft direction, then align start indices
      for (i = 0; i + 1 < loops.length; i++) {
        var dir = norm(sub(loopCentroid3(loops[i + 1]), loopCentroid3(loops[i])));
        if (i === 0 && dot(loopNormal3(loops[0]), dir) < 0) loops[0].reverse();
        if (dot(loopNormal3(loops[i + 1]), dir) < 0) loops[i + 1].reverse();
        var A = loops[i], B = loops[i + 1], bestO = 0, bestCost = Infinity;
        for (var o = 0; o < N; o++) {
          var cost = 0;
          for (var k = 0; k < N; k++) { var d = sub(A[k], B[(k + o) % N]); cost += dot(d, d); }
          if (cost < bestCost) { bestCost = cost; bestO = o; }
        }
        if (bestO) loops[i + 1] = B.slice(bestO).concat(B.slice(0, bestO));
      }
      for (i = 0; i + 1 < loops.length; i++) {
        var P = loops[i], Q = loops[i + 1];
        for (var k2 = 0; k2 < N; k2++) {
          var j = (k2 + 1) % N;
          pushPoly(polys, [P[k2], P[j], Q[j]], f.id);
          pushPoly(polys, [P[k2], Q[j], Q[k2]], f.id);
        }
      }
    }
    function cap(loop3, plane, flip) {
      var loop2 = loop3.map(function (p) { return to2D(plane, p); });
      triangulateAny(loop2).forEach(function (t) {
        var tri = [loop3[t[0]], loop3[t[1]], loop3[t[2]]];
        if (flip) tri.reverse();
        pushPoly(polys, tri, f.id);
      });
    }
    // caps: orientation is settled globally by ensureOutward, but each cap must be self-consistent
    // triangulateAny yields triangles whose normal is the section plane's n; flip so caps face away from the body
    var first = loops[0], last = loops[loops.length - 1];
    var firstDir = norm(sub(loopCentroid3(loops[1]), loopCentroid3(first)));
    cap(first, secs[0].plane, dot(secs[0].plane.n, firstDir) > 0);
    var lastDir = norm(sub(loopCentroid3(last), loopCentroid3(loops[loops.length - 2])));
    cap(last, secs[secs.length - 1].plane, dot(secs[secs.length - 1].plane.n, lastDir) < 0);
    return ensureOutward(polys);
  }

  // ------------------------------------------------------------------ shell
  // Resolve face specs ({at:[x,y,z]}) against the current mesh: the face whose plane contains the point and whose
  // outline contains its projection. Returns mesh face indices (deduplicated, in spec order).
  function resolveFaces(specs, mesh, tol) {
    tol = tol || 0.5;
    var out = [], outlines = {};
    function outline(i) { if (!(i in outlines)) { try { outlines[i] = faceOutline(mesh, i); } catch (e) { outlines[i] = null; } } return outlines[i]; }
    (specs || []).forEach(function (spec) {
      var best = -1, bestD = tol, fallback = -1, fallbackD = tol * 4;
      for (var i = 0; i < mesh.faces.length; i++) {
        var face = mesh.faces[i];
        var d = Math.abs(dot(face.normal, spec.at) - face.w);
        if (d >= fallbackD) continue;
        var o = outline(i);
        if (!o) continue;
        var uv = to2D(o.plane, spec.at), inside = 0;
        o.loops.forEach(function (l) { if (pointInPoly(uv, l)) inside++; });
        if (inside % 2 === 1) { if (d < bestD) { bestD = d; best = i; } }
        else if (d < fallbackD) {
          // near the outline (a pick right on an edge): accept when within tol of a boundary segment
          var dEdge = Infinity;
          o.loops.forEach(function (l) { for (var k = 0; k < l.length; k++) { var a = l[k], b = l[(k + 1) % l.length]; dEdge = Math.min(dEdge, pointSegmentDistance([uv[0], uv[1], 0], [a[0], a[1], 0], [b[0], b[1], 0])); } });
          if (dEdge < tol && d + dEdge < fallbackD) { fallbackD = d + dEdge; fallback = i; }
        }
      }
      var pick = best >= 0 ? best : fallback;
      if (pick >= 0 && out.indexOf(pick) < 0) out.push(pick);
    });
    return out;
  }

  // Outline loops of a mesh face split into outer loops (CCW, kept as is) and holes (CW, returned reversed to CCW).
  function faceLoopsClassified(o) {
    var outers = [], holes = [];
    o.loops.forEach(function (l) {
      var a = signedArea(l);
      if (Math.abs(a) < 1e-9) return;
      if (a > 0) outers.push(l); else holes.push(l.slice().reverse());
    });
    return { outers: outers, holes: holes };
  }

  // Offset a closed loop with a different distance per edge (dists[i] belongs to the edge pts[i] -> pts[i+1];
  // positive = outward of the polygon). Corners are the intersections of the two shifted edge lines, clamped.
  function offsetLoopVar(pts, dists) {
    var ccw = signedArea(pts) >= 0, n = pts.length, s = ccw ? 1 : -1, out = [];
    function edge(i) {
      var p = pts[i], q = pts[(i + 1) % n], e = [q[0] - p[0], q[1] - p[1]], l = Math.hypot(e[0], e[1]) || 1;
      return { d: [e[0] / l, e[1] / l], nrm: [e[1] / l * s, -e[0] / l * s] };
    }
    for (var i = 0; i < n; i++) {
      var i0 = (i + n - 1) % n, e1 = edge(i0), e2 = edge(i), d1 = dists[i0] || 0, d2 = dists[i] || 0, p1 = pts[i];
      var a = [p1[0] + e1.nrm[0] * d1, p1[1] + e1.nrm[1] * d1], b = [p1[0] + e2.nrm[0] * d2, p1[1] + e2.nrm[1] * d2];
      var cr = e1.d[0] * e2.d[1] - e1.d[1] * e2.d[0];
      if (Math.abs(cr) < 1e-9) { out.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); continue; }
      var t = ((b[0] - a[0]) * e2.d[1] - (b[1] - a[1]) * e2.d[0]) / cr;
      var x = [a[0] + e1.d[0] * t, a[1] + e1.d[1] * t];
      var lim = Math.max(Math.abs(d1), Math.abs(d2)) * 5, dx = x[0] - p1[0], dy = x[1] - p1[1], L = Math.hypot(dx, dy);
      if (L > lim && lim > 0) x = [p1[0] + dx / L * lim, p1[1] + dy / L * lim];
      out.push(x);
    }
    return out;
  }

  // Prism over a face's loops: outer loops grown and holes shrunk by growFor(loop) (per-edge distances; holes that
  // collapse are dropped), from plane offset a to b along the face normal.
  function slabSolid(o, growFor, a, b, tag) {
    var cl = faceLoopsClassified(o), prisms = [], holes = [];
    cl.outers.forEach(function (l) {
      var g = offsetLoopVar(l, growFor(l));
      if (signedArea(g) > 1e-9) prisms.push(prism(g, o.plane, a, b, tag));
    });
    cl.holes.forEach(function (l) {
      var g = offsetLoopVar(l, growFor(l).map(function (d) { return -d; }));
      if (signedArea(g) > 1e-9 && signedArea(g) < signedArea(l)) holes.push(prism(g, o.plane, a - 0.01, b + 0.01, tag));
    });
    if (!prisms.length) return null;
    var solid = prisms.length === 1 ? prisms[0] : unionAll(prisms);
    if (holes.length) solid = solid.subtract(unionAll(holes));
    return solid;
  }

  // Shell: hollow the body leaving walls of thickness T; faces listed in f.faces are removed (open).
  // The inner solid is the body minus a slab of depth T behind every kept face. Each slab outline is grown across
  // every edge by T·tan(φ/2), φ being the dihedral angle to the neighbouring face, which is exactly where the two
  // faces' offset planes meet, so slabs join at sharp offset corners (concave edges) and do not over-cut at
  // tangent facets. Removed faces get an extension out through the face instead. Shell = body − inner.
  // -> { body, inner, removed }
  function buildShell(f, ctx) {
    if (!ctx.body) throw new Error('Nothing to shell yet.');
    var T = +f.thickness;
    if (!(T > 0)) throw new Error('Shell thickness must be greater than zero.');
    var mesh = meshFromBody(ctx.body);
    var removed = resolveFaces(f.faces || [], mesh, Math.max(0.5, T / 2));
    if ((f.faces || []).length && removed.length < f.faces.length) throw new Error('A face to remove was not found on the body. Select the faces again.');
    // dihedral turn angle per body edge, keyed like bodyEdges
    var turn = {};
    bodyEdges(mesh).forEach(function (e) {
      var key = e.ka < e.kb ? e.ka + '|' + e.kb : e.kb + '|' + e.ka;
      var phi = 0;
      for (var p = 0; p < e.normals.length; p++) for (var q = p + 1; q < e.normals.length; q++) phi = Math.max(phi, Math.acos(Math.max(-1, Math.min(1, dot(e.normals[p], e.normals[q])))));
      turn[key] = phi;
    });
    function growFor(plane) {
      return function (loop) {
        return loop.map(function (p, k) {
          var a = to3D(plane, p[0], p[1]), q = loop[(k + 1) % loop.length], b = to3D(plane, q[0], q[1]);
          var ka = ekey(a), kb = ekey(b), key = ka < kb ? ka + '|' + kb : kb + '|' + ka;
          var phi = key in turn ? turn[key] : Math.PI / 2;
          return Math.min(4 * T, T * Math.tan(Math.min(phi, Math.PI - 0.05) / 2));
        });
      };
    }
    function uniform(loop) { return loop.map(function () { return T; }); }
    var inner = ctx.body, extensions = [], slabs = [];
    for (var i = 0; i < mesh.faces.length; i++) {
      var o;
      try { o = faceOutline(mesh, i); } catch (e) { o = null; }
      if (!o || !o.loops.length) continue;
      if (removed.indexOf(i) >= 0) {
        // outward through the face, starting a little inside so no cap is coplanar with the face
        var ext = slabSolid({ loops: o.loops.filter(function (l) { return signedArea(l) > 0; }), plane: o.plane }, uniform, -T / 2, T + 1, f.id);
        if (ext) extensions.push(ext);
      } else {
        var slab = slabSolid(o, growFor(o.plane), -T, T, f.id);
        if (slab) slabs.push(slab);
      }
    }
    if (!slabs.length) throw new Error('Every face of the body is selected for removal: leave at least one face to keep as a wall.');
    // body − ((body ∪ ext) − S) = body ∩ S exactly (S: the slab union), so the walls are one intersection instead of
    // a union and two subtractions (the Funnel's shell: two large booleans fewer, the same solid). The cavity
    // `inner` (the Shell PropertyManager's red preview) is only built when it is read.
    var S = unionTree(slabs);
    var body = ctx.body.intersect(S);
    if (ctx.body.volume() - body.volume() < 1e-9) throw new Error('Shell thickness ' + T + ' is too large for this part: nothing would remain hollow. Enter a thickness below half of the thinnest wall.');
    var out = { body: body, removed: removed }, innerSolid = null;
    Object.defineProperty(out, 'inner', { enumerable: true, get: function () {
      if (!innerSolid) innerSolid = (extensions.length ? inner.union(unionTree(extensions)) : inner).subtract(S);
      return innerSolid;
    } });
    return out;
  }

  // ------------------------------------------------------------------ sheet metal: edge flange and flat pattern
  function sheetParams(model) {
    return model.sheet || { thickness: 2, bendRadius: 2, kFactor: 0.71 };
  }

  // Flange section in the (o, u) frame: o across the edge (outward), u along the fold. The strip o ∈ [-ov, 0] overlaps
  // the sheet so the union is watertight; the material actually added is the o >= 0 part (bend + wall).
  function flangeProfile(A, R, T, L, ov) {
    var segs = Math.max(4, Math.round(8 * A / (Math.PI / 2)));
    var inner = [], outer = [];
    for (var s = 0; s <= segs; s++) {
      var th = A * s / segs;
      inner.push([R * Math.sin(th), R - R * Math.cos(th)]);
      outer.push([(R + T) * Math.sin(th), R - (R + T) * Math.cos(th)]);
    }
    var tx = Math.cos(A), ty = Math.sin(A);
    var iEnd = [inner[segs][0] + tx * L, inner[segs][1] + ty * L], oEnd = [outer[segs][0] + tx * L, outer[segs][1] + ty * L];
    var loop = [[-ov, 0]].concat(inner, [iEnd, oEnd], outer.slice().reverse(), [[-ov, -T]]);
    if (signedArea(loop) < 0) loop.reverse();
    return loop;
  }

  // Edge flange: bend (inner radius R, thickness T, sweep angle) plus a flat wall of length L, swept along each
  // selected straight edge of a flat sheet face. "Bend outside" placement: the flange sits beyond the edge.
  // `miter`: flanges on two selected edges that share a corner are extended past it and clipped by the corner's
  // bisector plane (each keeps its own side, moved apart by miterGap/2), so they meet at a mitre.
  // `relief` ('rect' | 'obround'): where a flange end runs into more sheet (the plate continues beyond the end,
  // inline or on the outward side) a slot reliefWidth wide (default T) is cut from the base before the flange is
  // added, from reliefDepth (default T/2) inside the edge out past the bend zone. Ends shared with another selected
  // edge (mitred or collinear) get no relief.
  // flangeLayout(f, model, ctx) -> the flange as plain data, from the edges of ctx.body (a CSG): { parts: [{ loop,
  // plane, t0, t1, clips: [{ n, w }] }] (each a prism of the section `loop` in `plane` from t0 to t1, kept where
  // n·p >= w for each clip), cuts: [{ loop, plane, a, b }] (prisms taken from the sheet first: trim-back and reliefs),
  // info (ctx.flanges' records), section: { A, R, T, L, ov } (flangeProfile's parameters) }. buildFlange builds it with
  // the CSG kernel; occt-kernel.js builds the same layout with exact bend arcs.
  function flangeLayout(f, model, ctx) {
    if (!ctx.body) throw new Error('Create a Base Flange before adding edge flanges.');
    var sheet = sheetParams(model);
    var T = +sheet.thickness, R = f.radius != null ? +f.radius : +sheet.bendRadius;
    if (f.hem && f.gap != null) R = Math.max(+f.gap / 2, 0.02 * T); // a hem whose gap was an equation: radius from the resolved gap
    var L = +f.length, A = (f.angle == null ? 90 : +f.angle) * Math.PI / 180;
    if (!isFinite(L)) throw new Error('Flange length must be a number.');
    if (!isFinite(A)) throw new Error('Flange angle must be a number.');
    if (!(L > 0)) throw new Error('Flange length must be greater than zero.');
    if (!(A > 0.01)) throw new Error('Flange angle must be greater than zero.');
    var miter = !!f.miter, gap = Math.max(0, +f.miterGap || 0);
    var relief = f.relief === 'rect' || f.relief === 'obround' ? f.relief : 'none';
    var rw = f.reliefWidth != null ? +f.reliefWidth : T, rd = f.reliefDepth != null ? +f.reliefDepth : T / 2;
    if (relief !== 'none' && !(rw > 0)) throw new Error('Relief width must be greater than zero.');
    if (relief !== 'none' && !(rd >= 0)) throw new Error('Relief depth must be zero or more.');
    var mesh = meshFromBody(ctx.body);
    var edges = bodyEdges(mesh).filter(function (e) { return !e.smooth && e.faces.length === 2 && e.convex; });
    var selected = resolveEdges((f.edges || []).map(function (e) { return { at: e.at, chain: false }; }), edges, Math.max(0.5, T));
    if (!selected.length) throw new Error('No edge selected for the flange.');
    // placement: 'bendOutside' (default: bend and wall beyond the edge), 'outside' (Material Outside: the wall's inner
    // face at the edge), 'inside' (Material Inside: the wall's outer face at the edge). The base sheet is trimmed back
    // by the shift so the bend takes its place.
    var shift = f.position === 'inside' ? R + T : (f.position === 'outside' ? R : 0);
    var ov = Math.min(T, 0.5); // overlap into the sheet so the union is watertight
    var tools = [], cuts = [], info = [], eds = [];
    selected.forEach(function (e) {
      var fa = mesh.faces[e.faces[0]], fb = mesh.faces[e.faces[1]];
      if (Math.abs(dot(fa.normal, fb.normal)) > 0.05) throw new Error('Flange edges must be square edges of a flat face.');
      var flat = fa.area >= fb.area ? 0 : 1;
      var nF = e.normals[flat], nT = e.normals[1 - flat];
      var u = f.reverse ? scale(nF, -1) : nF;   // flange goes toward u
      if (f.toward && dot(u, f.toward) < 0) u = scale(u, -1); // an explicit world direction wins over `reverse`
      var o = nT;                               // outward, away from the sheet
      // the bend's inside face is the sheet face on the side the flange folds toward
      var origin = dot(u, nF) > 0 ? e.mid : sub(e.mid, scale(nF, T));
      if (shift) {
        var cutPlane = { origin: origin, x: o, y: u, n: norm(cross(o, u)) };
        var tca = dot(sub(e.a, e.mid), cutPlane.n), tcb = dot(sub(e.b, e.mid), cutPlane.n);
        cuts.push({ loop: [[-shift, 0.01], [-shift, -T - 0.01], [0.5, -T - 0.01], [0.5, 0.01]].reverse(), plane: cutPlane, a: Math.min(tca, tcb) - 0.01, b: Math.max(tca, tcb) + 0.01 });
        origin = sub(origin, scale(o, shift));
      }
      var plane = { origin: origin, x: o, y: u, n: norm(cross(o, u)) };
      var loop = flangeProfile(A, R, T, L, ov);
      var wmax = 0;
      loop.forEach(function (p) { wmax = Math.max(wmax, p[0]); });
      var ta = dot(sub(e.a, e.mid), plane.n), tb = dot(sub(e.b, e.mid), plane.n);
      // ends: P = vertex, t = sweep coordinate, dIn = unit direction from the vertex into the edge
      eds.push({ e: e, nF: nF, o: o, u: u, plane: plane, loop: loop, wmax: wmax,
        ends: [{ P: e.a, t: ta, dIn: norm(sub(e.b, e.a)) }, { P: e.b, t: tb, dIn: norm(sub(e.a, e.b)) }] });
    });
    // corners shared by two selected edges: mark them (no relief there) and, with `miter`, set up the mitre planes
    for (var i = 0; i < eds.length; i++) for (var j = i + 1; j < eds.length; j++) {
      var ei = eds[i], ej = eds[j];
      var tol = Math.max(1e-4, 1e-3 * Math.min(ei.e.len, ej.e.len));
      for (var ki = 0; ki < 2; ki++) for (var kj = 0; kj < 2; kj++) {
        var ea = ei.ends[ki], eb = ej.ends[kj];
        if (len(sub(ea.P, eb.P)) > tol) continue;
        ea.shared = eb.shared = true;
        if (!miter || ea.miter || eb.miter) continue;
        var di = ea.dIn, dj = eb.dIn;
        if (len(cross(di, dj)) < 1e-6 || dot(ei.u, ej.u) < 0.99) continue; // collinear, or folding opposite ways
        var c = dot(ei.o, ej.o);
        if (1 + c < 0.05) continue;
        // corner of the (possibly trimmed-back) edge lines, and the bisector plane through it containing the sheet normal
        var V = scale(add(ea.P, eb.P), 0.5);
        if (shift) V = sub(V, scale(add(ei.o, ej.o), shift / (1 + c)));
        var nb = norm(sub(di, dj));
        [[ei, ea, nb], [ej, eb, scale(nb, -1)]].forEach(function (q) {
          var ed = q[0], en = q[1], n = q[2];
          // extend the sweep past the corner far enough for the outermost point of the section to reach the bisector
          var ext = ed.wmax * dot(ed.o, n) / dot(en.dIn, n);
          ext = Math.max(0, Math.min(ext, 4 * ed.wmax)) + 1;
          en.miter = { n: n, w: dot(V, n) + gap / 2, tExt: dot(sub(V, ed.plane.origin), ed.plane.n) - dot(en.dIn, ed.plane.n) * ext };
        });
      }
    }
    var inside = null;
    eds.forEach(function (ed) {
      var t0 = ed.ends[0].miter ? ed.ends[0].miter.tExt : ed.ends[0].t;
      var t1 = ed.ends[1].miter ? ed.ends[1].miter.tExt : ed.ends[1].t;
      tools.push({ loop: ed.loop, plane: ed.plane, t0: Math.min(t0, t1), t1: Math.max(t0, t1),
        clips: ed.ends.filter(function (en) { return en.miter; }).map(function (en) { return { n: en.miter.n, w: en.miter.w }; }) });
      if (relief !== 'none') ed.ends.forEach(function (en) {
        if (en.shared) return;
        // does the sheet continue beyond this end? probe half a thickness past it at mid-thickness, inside the
        // base (just behind the edge) and on the outward side (a plate lying beside the bend zone)
        if (!inside) inside = ctx.body.pointTester();
        var past = add(sub(en.P, scale(ed.nF, T / 2)), scale(en.dIn, -0.5 * T));
        if (!inside(add(past, scale(ed.o, -0.25 * T))) && !inside(add(past, scale(ed.o, (R + T) / 2)))) return;
        var beyond = -dot(en.dIn, ed.plane.n); // sign of t past the end
        var tA = beyond > 0 ? en.t : en.t - rw, tB = beyond > 0 ? en.t + rw : en.t;
        var o0 = -(shift + rd), o1 = R + T + rd;
        var slot = [[o1, tA], [o1, tB]];
        if (relief === 'obround') {
          var r = rw / 2, oc = o0 + r, tc = (tA + tB) / 2;
          for (var k = 0; k <= 12; k++) { var ph = Math.PI / 2 + Math.PI * k / 12; slot.push([oc + r * Math.cos(ph), tc + r * Math.sin(ph)]); }
        } else slot.push([o0, tB], [o0, tA]);
        // sweep the slot outline (in the sheet plane: o across, t along the edge) through the thickness (u ∈ [-T, 0])
        var sp = { origin: ed.plane.origin, x: ed.o, y: ed.plane.n, n: scale(ed.u, -1) };
        cuts.push({ loop: slot, plane: sp, a: -0.01, b: T + 0.01 });
      });
      var sh = scale(ed.o, -shift), e = ed.e;
      // miterPlanes: per end, the clip plane { n, w } (tool kept where n·p >= w) or null; the flat pattern uses it to
      // run the bend strip out to the mitre line. Plain arrays and numbers only: the record must survive a structured clone.
      info.push({ a: add(e.a, sh), b: add(e.b, sh), mid: add(e.mid, sh), origin: ed.plane.origin, o: ed.o, u: ed.u, len: e.len, angle: A, R: R, L: L, T: T,
        mitred: [!!ed.ends[0].miter, !!ed.ends[1].miter],
        miterPlanes: ed.ends.map(function (en) { return en.miter ? { n: en.miter.n.slice(), w: en.miter.w } : null; }) });
    });
    return { parts: tools, cuts: cuts, info: info, section: { A: A, R: R, T: T, L: L, ov: ov } };
  }
  function buildFlange(f, model, ctx) {
    var lay = flangeLayout(f, model, ctx);
    var tools = lay.parts.map(function (p) {
      var tool = prism(p.loop, p.plane, p.t0, p.t1, f.id);
      p.clips.forEach(function (c) { tool = tool.clipByPlane(c.n, c.w); });
      return tool;
    });
    ctx.flanges[f.id] = lay.info;
    ctx.flangeCut = lay.cuts.length ? unionAll(lay.cuts.map(function (c) { return prism(c.loop, c.plane, c.a, c.b, f.id); })) : null;
    return unionAll(tools);
  }

  // Jog: two opposite bends in one feature. The first flange lifts the sheet by `height` (wall length so the offset
  // measured between the flats is `height`), the second folds back parallel to the base for `length`.
  // -> tool and cut for the first bend; the second is built on the intermediate body. Info records for both.
  function buildJog(f, model, ctx) {
    if (!ctx.body) throw new Error('Create a Base Flange before adding a jog.');
    var sheet = sheetParams(model), T = +sheet.thickness, R = f.radius != null ? +f.radius : +sheet.bendRadius;
    var A = (f.angle == null ? 90 : +f.angle) * Math.PI / 180, H = +f.height, L2 = +f.length;
    if (!isFinite(H) || !isFinite(L2) || !isFinite(A)) throw new Error('Jog height, length and angle must be a number each.');
    if (!(H > 0)) throw new Error('Jog height must be greater than zero.');
    if (!(L2 > 0)) throw new Error('Jog length must be greater than zero.');
    if (!(A > 0.05 && A < Math.PI - 0.05)) throw new Error('Jog angle must be between 3° and 177°.');
    // wall length so the jogged flat's near face sits `height` from the base's fold-side face:
    // rise = R(1−cosA) [first bend] + wall·sinA + R(1−cosA) − T·cosA [second bend, inner radius on the far face]
    var wall = (H - 2 * R * (1 - Math.cos(A)) + T * Math.cos(A)) / Math.sin(A);
    if (!(wall > 0.01)) throw new Error('Jog height is too small for this bend radius and angle.');
    var f1 = { id: f.id, edges: f.edges, angle: A * 180 / Math.PI, length: wall, reverse: !!f.reverse, radius: R, position: f.position };
    var tool1 = buildFlange(f1, model, ctx), cut1 = ctx.flangeCut, info1 = ctx.flanges[f.id];
    var body1 = cut1 ? ctx.body.subtract(cut1) : ctx.body;
    body1 = body1.union(tool1);
    // second bend: pick the end edge of each wall (mid-thickness point), fold back toward the outward direction
    var picks = info1.map(function (fi) {
      var sA = Math.sin(A), cA = Math.cos(A);
      var innerEnd = add(add(fi.origin, scale(fi.o, R * sA + cA * wall)), scale(fi.u, R - R * cA + sA * wall));
      var outerDir = add(scale(fi.o, sA), scale(fi.u, -cA)); // away from the bend centre at the wall
      var tw = add(scale(fi.o, cA), scale(fi.u, sA));
      var toward = norm(sub(fi.o, scale(tw, dot(fi.o, tw))));
      return { at: add(innerEnd, scale(outerDir, T / 2)), toward: toward };
    });
    var ctx2 = { body: body1, flanges: {}, tools: {} };
    var tools2 = [], infos2 = [];
    picks.forEach(function (pk) {
      var f2 = { id: f.id, edges: [{ at: pk.at }], angle: A * 180 / Math.PI, length: L2, toward: pk.toward, radius: R, position: 'bendOutside' };
      tools2.push(buildFlange(f2, model, ctx2));
      infos2 = infos2.concat(ctx2.flanges[f.id]);
    });
    ctx.flanges[f.id] = info1.concat(infos2);
    ctx.flangeCut = cut1;
    return { first: tool1, second: unionAll(tools2) };
  }

  // Normal Cut (the Cut-Extrude option of the same name): a cut sketched on a plane that is not parallel to the
  // sheet would leave slanted walls no laser or punch can make. The tool is replaced by a prism normal to the sheet:
  // the part of the tool inside the body is meshed, and each of its faces that lies on a sheet surface (flat or a
  // bend facet: air just in front of it, metal half a thickness behind, air again a full thickness behind) is
  // outlined and pushed straight through the thickness. With `dir` (the extrusion direction) only the faces the
  // tool enters through are used, so a blind cut is not doubled from the far side; without it (mid-plane or
  // two-direction cuts), or when the tool enters through a thickness edge, every sheet-surface face counts. A cut of
  // any depth becomes a through-thickness cut. Returns `tool` itself when it crosses no sheet surface.
  function normalCutTool(tool, body, model, dir) {
    var R = body.intersect(tool);
    if (!(R.volume() > 1e-9)) return tool;
    var T = +sheetParams(model).thickness, eps = 1e-3 * T;
    var inside = body.pointTester();
    var meshR = meshFromBody(R), p = meshR.positions64;
    var caps = [], entry = [];
    meshR.faces.forEach(function (face, i) {
      // one probe per triangle (its centroid), votes weighted by area: a sliver triangle at the rim of a bend facet
      // can probe into the neighbouring facet's metal and must not outvote the bulk of the face
      var n = face.normal, yes = 0, no = 0;
      for (var t = face.start; t < face.start + face.count; t++) {
        var k = t * 9;
        var a = [p[k], p[k + 1], p[k + 2]], b = [p[k + 3], p[k + 4], p[k + 5]], d = [p[k + 6], p[k + 7], p[k + 8]];
        var c = scale(add(add(a, b), d), 1 / 3), w = len(cross(sub(b, a), sub(d, a)));
        var onSheet = !inside(add(c, scale(n, eps))) && inside(sub(c, scale(n, T / 2))) && !inside(sub(c, scale(n, T + eps)));
        if (onSheet) yes += w; else no += w;
      }
      if (!(yes > no)) return;
      caps.push(i);
      if (dir && dot(n, dir) < -1e-6) entry.push(i);
    });
    var chosen = entry.length ? entry : caps;
    if (!chosen.length) return tool;
    var tag = tool.polygons.length ? tool.polygons[0].shared : undefined;
    var prisms = [];
    chosen.forEach(function (i) {
      var o = faceOutline(meshR, i);
      if (!o) return;
      var cl = faceLoopsClassified(o);
      // through the thickness along −n: from just in front of the face to just past the far surface
      var outers = cl.outers.map(function (l) { return prism(l, o.plane, -(T + eps), eps, tag); });
      if (!outers.length) return;
      var solid = unionAll(outers);
      if (cl.holes.length) solid = solid.subtract(unionAll(cl.holes.map(function (l) { return prism(l, o.plane, -(T + 2 * eps), 2 * eps, tag); })));
      prisms.push(solid);
    });
    if (!prisms.length) return tool;
    return unionTree(prisms);
  }

  // Bend allowance with the shop k-factor: arc length of the neutral axis.
  function bendAllowance(angleRad, R, T, K) { return angleRad * (R + K * T); }

  // -> { loops: [[[u,v],...]] (outer first, CCW; holes after), bends: [{a:[u,v], b:[u,v], label, up, angle, R}], plane, sheet, bbox }
  // Recursive unfold on one side of the sheet: the base face (largest face on the +n side of the base sketch plane)
  // is mapped into the sketch frame; every flange attached to an unfolded face contributes a bend strip of length
  // BA = angle·(R + K·T) beyond its edge and then unfolds its wall face (real outline, holes included) with a rigid
  // map, recursively, so flanges on flanges and holes on walls all reach the flat. The regions are merged with the
  // CSG kernel (thin prisms) and the merged top face's outline is the blank.
  function flatPattern(model, build, mesh) {
    var rmodel = resolvedModel(model);
    if (rmodel.sheetError) throw new Error(rmodel.sheetError);
    model = rmodel.model;
    var sheet = model.sheet;
    if (!sheet) throw new Error('No sheet metal parameters: create a Base Flange first (Sheet Metal tab).');
    var base = model.features.filter(function (f) { return f.sheetBase; })[0];
    if (!base) throw new Error('No Base Flange feature found.');
    var sketch = findFeature(model, base.sketch);
    var plane = resolvePlane(sketch.plane, model, build.planes);
    var K = +sheet.kFactor, T = +sheet.thickness;
    var best = null;
    mesh.faces.forEach(function (face, i) {
      var d = dot(face.normal, plane.n);
      if (Math.abs(d) < 0.999) return;
      var score = face.area * (d > 0 ? 1 + 1e-9 : 1);
      if (!best || score > best.score) best = { face: face, i: i, score: score };
    });
    if (!best) throw new Error('Could not find the flat sheet face.');
    var flanges = [];
    model.features.forEach(function (f) {
      if ((f.type !== 'flange' && f.type !== 'jog') || build.errors[f.id]) return;
      (build.flanges[f.id] || []).forEach(function (fi) { flanges.push(fi); });
    });
    var regions = [], bends = [], usedFaces = {}, usedFlanges = {};
    // length of the overlap of segment A–B with segment a–b when the two are collinear (both A and B within 1e-3 of
    // the line a–b), else 0
    function overlapOnSegment(A, B, a, b) {
      var d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(d[0], d[1]);
      if (L < 1e-9) return 0;
      var u = [d[0] / L, d[1] / L];
      var tA = (A[0] - a[0]) * u[0] + (A[1] - a[1]) * u[1], tB = (B[0] - a[0]) * u[0] + (B[1] - a[1]) * u[1];
      if (Math.hypot(A[0] - a[0] - u[0] * tA, A[1] - a[1] - u[1] * tA) > 1e-3) return 0;
      if (Math.hypot(B[0] - a[0] - u[0] * tB, B[1] - a[1] - u[1] * tB) > 1e-3) return 0;
      var lo = Math.max(0, Math.min(tA, tB)), hi = Math.min(L, Math.max(tA, tB));
      return hi > lo ? hi - lo : 0;
    }
    function unfold(faceIdx, map, nTracked, depth) {
      if (usedFaces[faceIdx] || depth > 16) return;
      usedFaces[faceIdx] = true;
      var face = mesh.faces[faceIdx], o = faceOutline(mesh, faceIdx);
      if (!o) return;
      var loops2 = o.loops.map(function (l) { return l.map(function (p) { return map(to3D(o.plane, p[0], p[1])); }); });
      regions.push(loops2);
      flanges.forEach(function (fi, k) {
        if (usedFlanges[k] || Math.abs(dot(fi.u, face.normal)) < 0.999) return;
        var dm = dot(fi.mid, face.normal) - face.w;
        if (Math.abs(dm) > 1e-3 && Math.abs(Math.abs(dm) - T) > 1e-3) return;
        var A2 = map(fi.a), B2 = map(fi.b);
        // attached when the flange's edge line A2–B2 runs along an outline segment and overlaps it by more than half
        // a thickness: with Material Outside/Inside a neighbouring flange trims the base back at a shared corner, so
        // the ends of the edge need not lie on the outline themselves
        var attached = loops2.some(function (l) {
          return l.some(function (p, i) { return overlapOnSegment(A2, B2, p, l[(i + 1) % l.length]) > Math.max(1e-3, 0.5 * T); });
        });
        if (!attached) return;
        usedFlanges[k] = true;
        var M2 = map(fi.mid), O2 = map(add(fi.mid, fi.o));
        var o2 = [O2[0] - M2[0], O2[1] - M2[1]], ol = Math.hypot(o2[0], o2[1]);
        if (ol < 1e-9) return;
        o2 = [o2[0] / ol, o2[1] / ol];
        var BA = bendAllowance(fi.angle, fi.R, T, K), eps = 1e-3;
        function off(p, d) { return [p[0] + o2[0] * d, p[1] + o2[1] * d]; }
        var trackedInner = dot(fi.u, nTracked) > 0;
        // the wall face on the tracked side of the sheet: inner radius when the fold comes toward this side
        var Rt = trackedInner ? fi.R : fi.R + T, sA = Math.sin(fi.angle), cA = Math.cos(fi.angle);
        // Ends of the bend strip. An unmitred end is square at the edge end (t0 = ext = 0). A mitred end was swept past
        // the end point P and clipped by the plane { n, w } (kept where n·p >= w): a wall point at o-distance d from the
        // edge line reaches t(d) = (n·P − w + d·(o·n)) / (dIn·n) past P, so the wall's start line (d = Rt·sin A) ends at
        // `ext`, the base corner (d = 0) sits at `t0` (0 without a gap or a placement shift) and the wall's end line
        // slants by `slope` per unit of wall length when the fold is not 90°. The strip is drawn as a trapezoid whose
        // end edge runs straight from the base corner to that wall corner, so the blank has no step at the mitre.
        var ends = [fi.a, fi.b].map(function (P, kk) {
          var Q = kk === 0 ? A2 : B2, other = kk === 0 ? B2 : A2;
          var dl = Math.hypot(Q[0] - other[0], Q[1] - other[1]);
          var r = { P: Q, dOut: dl > 1e-9 ? [(Q[0] - other[0]) / dl, (Q[1] - other[1]) / dl] : [0, 0], t0: 0, ext: 0, slope: 0, mitred: false };
          var mp = fi.miterPlanes && fi.miterPlanes[kk];
          if (!mp || dl <= 1e-9) return r;
          var dIn = norm(sub(kk === 0 ? fi.b : fi.a, P)), dn = dot(dIn, mp.n);
          if (!(dn > 1e-9)) return r;
          var kappa = dot(fi.o, mp.n) / dn;
          r.t0 = (dot(mp.n, P) - mp.w) / dn;
          r.ext = r.t0 + kappa * Rt * sA;
          r.slope = kappa * cA;
          r.mitred = true;
          return r;
        });
        // point at o-distance d from the edge and t past end r along the edge line
        function corner(r, d, t) { return [r.P[0] + o2[0] * d + r.dOut[0] * t, r.P[1] + o2[1] * d + r.dOut[1] * t]; }
        var eA = ends[0], eB = ends[1];
        // strip: base side at −eps (inside the sheet), far side at BA + eps (inside the wall). A mitred end passes through
        // the wall corner (BA, ext) itself and then follows the wall's end line for the eps overlap, so the strip never
        // pokes out past the wall's unfolded outline.
        var strip = [corner(eA, -eps, eA.t0 - (eA.ext - eA.t0) * eps / BA), corner(eB, -eps, eB.t0 - (eB.ext - eB.t0) * eps / BA)];
        if (eB.mitred) strip.push(corner(eB, BA, eB.ext), corner(eB, BA + eps, eB.ext + eB.slope * eps));
        else strip.push(off(B2, BA + eps));
        if (eA.mitred) strip.push(corner(eA, BA + eps, eA.ext + eA.slope * eps), corner(eA, BA, eA.ext));
        else strip.push(off(A2, BA + eps));
        regions.push([strip]);
        // bend line: mid-strip, reaching the mitre line at a mitred end
        bends.push({ a: corner(eA, BA / 2, (eA.t0 + eA.ext) / 2), b: corner(eB, BA / 2, (eB.t0 + eB.ext) / 2), up: trackedInner, angle: fi.angle * 180 / Math.PI, R: fi.R, label: (trackedInner ? 'UP' : 'DOWN') + ' ' + Math.round(fi.angle * 180 / Math.PI) + '° R' + fi.R });
        var Pmid = add(add(fi.origin, scale(fi.o, Rt * sA)), scale(fi.u, fi.R - Rt * cA));
        var wn = trackedInner ? add(scale(fi.o, -sA), scale(fi.u, cA)) : add(scale(fi.o, sA), scale(fi.u, -cA));
        var tw = add(scale(fi.o, cA), scale(fi.u, sA));
        var dir3 = norm(cross(tw, wn)), dir2 = [o2[1], -o2[0]];
        var wallMap = function (Q) {
          var d = sub(Q, Pmid), s = dot(d, dir3), w = dot(d, tw);
          return [M2[0] + dir2[0] * s + o2[0] * (BA + w), M2[1] + dir2[1] * s + o2[1] * (BA + w)];
        };
        var wIdx = -1;
        mesh.faces.forEach(function (fc, i) { if (wIdx < 0 && dot(fc.normal, wn) > 0.999 && Math.abs(dot(fc.normal, Pmid) - fc.w) < 1e-3) wIdx = i; });
        if (wIdx >= 0 && !usedFaces[wIdx]) unfold(wIdx, wallMap, wn, depth + 1);
        else regions.push([[corner(eA, BA - eps, eA.ext - eA.slope * eps), corner(eB, BA - eps, eB.ext - eB.slope * eps),
          corner(eB, BA + fi.L, eB.ext + eB.slope * fi.L), corner(eA, BA + fi.L, eA.ext + eA.slope * fi.L)]]);
      });
    }
    unfold(best.i, function (Q) { return to2D(plane, Q); }, best.face.normal, 0);
    // merge: thin prisms in the Front frame, union, outline of the top face
    var fp = makePlane('Front', 0), solids = [];
    regions.forEach(function (loops) {
      var cl = [];
      loops.forEach(function (l) {
        var a = signedArea(l);
        if (Math.abs(a) < 1e-9) return;
        cl.push({ pts: a > 0 ? l : l.slice().reverse(), depth: 0 });
      });
      cl.forEach(function (x) {
        var probe = [(x.pts[0][0] + x.pts[1][0]) / 2, (x.pts[0][1] + x.pts[1][1]) / 2];
        cl.forEach(function (y) { if (x !== y && pointInPoly(probe, y.pts)) x.depth++; });
      });
      var outers = cl.filter(function (x) { return x.depth % 2 === 0; }).map(function (x) { return prism(x.pts, fp, 0, 1); });
      var holes = cl.filter(function (x) { return x.depth % 2 === 1; }).map(function (x) { return prism(x.pts, fp, -0.01, 1.01); });
      if (!outers.length) return;
      var s = unionAll(outers);
      if (holes.length) s = s.subtract(unionAll(holes));
      solids.push(s);
    });
    if (!solids.length) throw new Error('Could not build the flat pattern.');
    // The regions come from rigid maps of real faces, so their shared corners carry near-coincident vertices (a few
    // 1e-5 apart). Merged with every BSP fragment kept, both sides of such a seam get the same split vertices and the
    // outline tracer welds them; with CSG's whole-polygon restore a seam becomes a T-junction beyond its tolerance and
    // the blank falls apart into two loops. So this one merge keeps all fragments.
    var keepWhole = CSG.options ? CSG.options.restoreWhole : null, merged;
    if (CSG.options) CSG.options.restoreWhole = false;
    try { merged = unionTree(solids); } finally { if (CSG.options) CSG.options.restoreWhole = keepWhole; }
    var fm = meshFromBody(merged), topIdx = -1;
    fm.faces.forEach(function (fc, i) { if (fc.normal[2] > 0.999 && Math.abs(fc.w - 1) < 1e-6) topIdx = i; });
    if (topIdx < 0) throw new Error('Could not build the flat pattern.');
    var fo = faceOutline(fm, topIdx);
    var loops = fo.loops.map(function (l) { return l.map(function (p) { var q = to3D(fo.plane, p[0], p[1]); return [q[0], q[1]]; }); });
    loops.sort(function (a, b) { return signedArea(b) - signedArea(a); });
    if (!loops.length || signedArea(loops[0]) <= 0) throw new Error('Could not build the flat pattern.');
    var min = [Infinity, Infinity], max = [-Infinity, -Infinity];
    loops.forEach(function (l) { l.forEach(function (p) { min[0] = Math.min(min[0], p[0]); min[1] = Math.min(min[1], p[1]); max[0] = Math.max(max[0], p[0]); max[1] = Math.max(max[1], p[1]); }); });
    return { loops: loops, bends: bends, plane: plane, sheet: sheet, bbox: { min: min, max: max } };
  }
  function near2(p, q) { return Math.abs(p[0] - q[0]) < 1e-3 && Math.abs(p[1] - q[1]) < 1e-3; }

  function exportDXFFlat(flat, units) {
    var d = new DXF(units);
    flat.loops.forEach(function (l, i) {
      var layer = i === 0 ? 'OUTLINE' : 'HOLES';
      var c = loopAsCircle(l);
      if (c) d.circle(layer, c.c, c.r); else d.polyline(layer, l, true);
    });
    flat.bends.forEach(function (b) {
      d.line('BEND', b.a, b.b);
      d.text('NOTES', [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2], Math.max(1.5, flat.sheet.thickness), b.label);
    });
    var s = flat.sheet;
    d.text('NOTES', [flat.bbox.min[0], flat.bbox.min[1] - Math.max(3, s.thickness * 2)], Math.max(1.5, s.thickness), 'T=' + s.thickness + ' R=' + s.bendRadius + ' K=' + s.kFactor);
    return d.toString();
  }

  // ------------------------------------------------------------------ exports
  function fmt(n) { return (Math.round(n * 1e6) / 1e6).toString(); }

  function exportSTL(mesh, name) {
    var p = mesh.positions, n = mesh.normals, out = ['solid ' + (name || 'anvil')];
    for (var i = 0; i < p.length; i += 9) {
      out.push('  facet normal ' + fmt(n[i]) + ' ' + fmt(n[i + 1]) + ' ' + fmt(n[i + 2]));
      out.push('    outer loop');
      for (var k = 0; k < 3; k++) out.push('      vertex ' + fmt(p[i + k * 3]) + ' ' + fmt(p[i + k * 3 + 1]) + ' ' + fmt(p[i + k * 3 + 2]));
      out.push('    endloop');
      out.push('  endfacet');
    }
    out.push('endsolid ' + (name || 'anvil'));
    return out.join('\n');
  }

  function DXF(units) {
    this.lines = [];
    this.insunits = units === 'in' ? 1 : 4;
  }
  DXF.prototype.pair = function (code, value) { this.lines.push(String(code), String(value)); };
  DXF.prototype.line = function (layer, a, b) {
    this.pair(0, 'LINE'); this.pair(8, layer);
    this.pair(10, fmt(a[0])); this.pair(20, fmt(a[1])); this.pair(30, 0);
    this.pair(11, fmt(b[0])); this.pair(21, fmt(b[1])); this.pair(31, 0);
  };
  DXF.prototype.circle = function (layer, c, r) {
    this.pair(0, 'CIRCLE'); this.pair(8, layer);
    this.pair(10, fmt(c[0])); this.pair(20, fmt(c[1])); this.pair(30, 0); this.pair(40, fmt(r));
  };
  DXF.prototype.arc = function (layer, c, r, a0, a1) {
    this.pair(0, 'ARC'); this.pair(8, layer);
    this.pair(10, fmt(c[0])); this.pair(20, fmt(c[1])); this.pair(30, 0); this.pair(40, fmt(r));
    this.pair(50, fmt(a0)); this.pair(51, fmt(a1));
  };
  DXF.prototype.text = function (layer, p, height, text) {
    this.pair(0, 'TEXT'); this.pair(8, layer);
    this.pair(10, fmt(p[0])); this.pair(20, fmt(p[1])); this.pair(30, 0); this.pair(40, fmt(height)); this.pair(1, text);
  };
  DXF.prototype.polyline = function (layer, pts, closed) {
    this.pair(0, 'POLYLINE'); this.pair(8, layer); this.pair(66, 1); this.pair(70, closed ? 1 : 0);
    for (var i = 0; i < pts.length; i++) {
      this.pair(0, 'VERTEX'); this.pair(8, layer);
      this.pair(10, fmt(pts[i][0])); this.pair(20, fmt(pts[i][1])); this.pair(30, 0);
    }
    this.pair(0, 'SEQEND');
  };
  DXF.prototype.toString = function () {
    var head = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', String(this.insunits), '0', 'ENDSEC',
      '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '4',
      '0', 'LAYER', '2', 'OUTLINE', '70', '0', '62', '7', '6', 'CONTINUOUS',
      '0', 'LAYER', '2', 'HOLES', '70', '0', '62', '1', '6', 'CONTINUOUS',
      '0', 'LAYER', '2', 'BEND', '70', '0', '62', '3', '6', 'CONTINUOUS',
      '0', 'LAYER', '2', 'NOTES', '70', '0', '62', '5', '6', 'CONTINUOUS',
      '0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
    return head.concat(this.lines, ['0', 'ENDSEC', '0', 'EOF']).join('\n');
  };

  // A loop that is a regular sampling of a circle becomes a true CIRCLE entity.
  function loopAsCircle(pts) {
    if (pts.length < 12) return null;
    var cx = 0, cy = 0;
    pts.forEach(function (p) { cx += p[0]; cy += p[1]; });
    cx /= pts.length; cy /= pts.length;
    var r = 0;
    pts.forEach(function (p) { r += Math.hypot(p[0] - cx, p[1] - cy); });
    r /= pts.length;
    for (var i = 0; i < pts.length; i++) if (Math.abs(Math.hypot(pts[i][0] - cx, pts[i][1] - cy) - r) > r * 0.01 + 1e-6) return null;
    return { c: [cx, cy], r: r };
  }

  function exportDXFSketch(sketch, units) {
    var d = new DXF(units);
    (sketch.entities || []).forEach(function (e) {
      if (e.t === 'circle') { d.circle('OUTLINE', [e.cx, e.cy], e.r); return; }
      if (e.t === 'arc') { d.arc('OUTLINE', [e.cx, e.cy], e.r, e.a0, e.a1); return; }
      if (e.t === 'line') { d.line('OUTLINE', [e.x1, e.y1], [e.x2, e.y2]); return; }
      if (e.t === 'point') return;
      entityPolylines(e).forEach(function (pl) { d.polyline('OUTLINE', pl.pts, pl.closed); });
    });
    return d.toString();
  }

  function exportDXFFace(mesh, faceIndex, units) {
    var o = faceOutline(mesh, faceIndex);
    if (!o) return null;
    var d = new DXF(units);
    var areas = o.loops.map(function (l) { return Math.abs(signedArea(l)); });
    var outerIdx = areas.indexOf(Math.max.apply(null, areas));
    o.loops.forEach(function (l, i) {
      var layer = i === outerIdx ? 'OUTLINE' : 'HOLES';
      var c = loopAsCircle(l);
      if (c) d.circle(layer, c.c, c.r); else d.polyline(layer, l, true);
    });
    return d.toString();
  }

  // ------------------------------------------------------------------ script builder (the API scripts talk to)
  function Builder(model) {
    this.model = model;
    this.lastId = null;
    this.lastSketchId = null;
    this.lastSolidId = null;
  }
  Builder.prototype._add = function (f) {
    f.id = this.model.nextId++;
    if (!f.name) f.name = featureName(this.model, f.type, f.cut);
    this.model.features.push(f);
    this.lastId = f.id;
    if (f.type === 'sketch') this.lastSketchId = f.id;
    else if (f.type !== 'plane') this.lastSolidId = f.id;
    return f;
  };
  // num(x): a numeric argument, or an equation ('=T*2') passed through untouched for rebuild to resolve
  function num(x) { return isExpression(x) ? x : +x; }
  Builder.prototype.name = function (n) { this.model.name = String(n); return this; };
  Builder.prototype.units = function (u) { this.model.units = u === 'in' ? 'in' : 'mm'; return this; };
  Builder.prototype.density = function (d) { this.model.density = +d; return this; };
  Builder.prototype.color = function (c) { this.model.color = String(c); return this; };
  // equations({ T: 10, W: '=T*2' }) or equations([{ name, expr }]): the model's global variables, in order (replaces
  // any earlier list). Numbers are stored as their string. The object form drops a leading "="; the array form (what
  // generateScript writes) keeps each expr string exactly, so a script round trip reproduces model.equations.
  Builder.prototype.equations = function (spec) {
    var list = [];
    function expr(v) { return String(v == null ? '' : v).replace(/^\s*=/, '').trim(); }
    if (Array.isArray(spec)) spec.forEach(function (e) {
      if (!e) return;
      var q = {};
      Object.keys(e).forEach(function (k) { q[k] = e[k]; }); // extra fields (a comment, say) ride along
      q.name = String(e.name);
      q.expr = typeof e.expr === 'string' ? e.expr : String(e.expr == null ? '' : e.expr);
      list.push(q);
    });
    else if (spec && typeof spec === 'object') Object.keys(spec).forEach(function (k) { list.push({ name: k, expr: expr(spec[k]) }); });
    this.model.equations = list;
    return this;
  };
  // configurations([{ name, values: { T: 6, N: '=2' } }], active?): the model's named variable sets (replaces any
  // earlier list). Values are stored as expression strings without a leading "=". `active` (optional) activates one.
  Builder.prototype.configurations = function (list, active) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (c) {
      if (!c || c.name == null) return;
      var q = {}, vals = {};
      Object.keys(c).forEach(function (k) { q[k] = c[k]; });
      Object.keys(c.values || {}).forEach(function (k) { vals[k] = configExpr(c.values[k]); });
      q.name = String(c.name); q.values = vals;
      out.push(q);
    });
    if (out.length) this.model.configurations = out; else { delete this.model.configurations; delete this.model.activeConfiguration; }
    if (active != null) this.activeConfiguration(active);
    return this;
  };
  // activeConfiguration(name): the configuration whose values drive the equations (null: the base equations)
  Builder.prototype.activeConfiguration = function (name) {
    if (name == null) { delete this.model.activeConfiguration; return this; }
    if (!findConfiguration(this.model, name)) throw new Error('activeConfiguration: no configuration named "' + name + '"');
    this.model.activeConfiguration = String(name);
    return this;
  };
  // _value(x): a number for a sketch dimension that must be numeric now (box, cylinder, hole sizes): an equation is
  // evaluated against the current variables at script time, since sketch entities hold no expressions.
  Builder.prototype._value = function (x, what) {
    if (!isExpression(x)) return +x;
    try { return evalExpression(x, resolveEquations(this.model).vars); } catch (e) { throw new Error(what + ': ' + e.message); }
  };
  Builder.prototype.plane = function (ref, offset, name) {
    var f = this._add({ type: 'plane', ref: ref || 'Front', offset: num(offset) || 0, name: name });
    return f.id;
  };
  Builder.prototype._planeRef = function (spec, offset) {
    if (spec == null) return { ref: 'Front', offset: 0 };
    if (typeof spec === 'number') return { featureId: spec };
    if (typeof spec === 'string') return { ref: spec, offset: num(offset) || 0 };
    // r10/facesketch10: a sketch on a face of a feature, which follows that face at rebuild:
    //   p.sketch({ face: boss, normal: [0, 0, 1] })   the face of feature `boss` whose outward normal is `normal`
    //     (an extrude's end cap is found from the extrude itself; for other faces give `at`, a point on the face, or
    //     `offset`, the face plane's distance along the normal, and the nearest such face is taken);
    //   a full frame { custom: true, origin, x, y, n, offset, face: { feature, role, cap?, inst?, lx?, ln? } } as
    //   generateScript writes it; `cap: 'far' | 'near'` (r11/faceref11) keeps the sketch on its cap when the extrude is reversed.
    var fr = spec.face;
    if (fr != null && typeof fr !== 'object') fr = { feature: fr, role: spec.role || 'cap' };
    if (fr && spec.cap && !fr.cap) fr = faceCopy(fr, { cap: spec.cap });
    if (spec.custom) {
      if (!fr) return spec;
      var cp = JSON.parse(JSON.stringify(spec)); cp.face = faceCopy(fr);
      return cp;
    }
    if (fr) {
      var n = spec.normal || spec.n || [0, 0, 1], nn = norm(n);
      var pl = tidyPlane(planeFromFace(nn, spec.at ? spec.at : scale(nn, num(spec.offset || offset || 0))));
      pl.face = faceCopy(fr);
      return pl;
    }
    if (spec.featureId != null) return { featureId: spec.featureId };
    return { ref: spec.ref || 'Front', offset: num(spec.offset || offset || 0) };
  };
  Builder.prototype.sketch = function (spec, offset, name) {
    var f = this._add({ type: 'sketch', plane: this._planeRef(spec, offset), entities: [], name: name });
    return new SketchBuilder(this, f);
  };
  Builder.prototype._sketchId = function (opts) {
    var id = opts && opts.sketch != null ? opts.sketch : this.lastSketchId;
    if (id == null) throw new Error('No sketch to use. Call sketch(...) first.');
    return id;
  };
  Builder.prototype.extrude = function (depth, opts) {
    opts = opts || {};
    var f = this._add({
      type: 'extrude', sketch: this._sketchId(opts), depth: depth == null ? 0 : num(depth), end: opts.throughAll ? 'through' : (opts.midplane ? 'mid' : 'blind'),
      reverse: !!opts.reverse || opts.dir === -1, cut: !!opts.cut, dir2: !!opts.depth2 || !!opts.both,
      depth2: opts.depth2 != null ? num(opts.depth2) : (opts.both ? num(depth) : 0), end2: opts.throughAll2 ? 'through' : 'blind', name: opts.name
    });
    if (opts.sheetBase) f.sheetBase = true;
    if (opts.draft) { f.draft = num(opts.draft); if (opts.draftOutward) f.draftOut = true; }
    if (opts.cut && opts.normalCut) f.normalCut = true; // sheet metal Normal Cut: the tool is made normal to the sheet
    bodyOpts(f, opts);
    return this;
  };
  // Multi-body options shared by every boss and cut: `merge: false` keeps a boss as a separate body, `bodies: [i, …]`
  // limits a cut to those bodies. A pattern or mirror takes both and the rebuild applies whichever fits its source.
  function bodyOpts(f, opts) {
    if (!opts) return f;
    var patternLike = f.type === 'lpattern' || f.type === 'cpattern' || f.type === 'mirror';
    if (opts.merge === false && (!f.cut || patternLike)) f.merge = false;
    if ((f.cut || patternLike) && Array.isArray(opts.bodies) && opts.bodies.length) f.bodies = opts.bodies.map(function (i) { return i | 0; });
    return f;
  }
  // Sheet metal parameters used by baseFlange/flange/flatten. K = 0.71 (steel) or 0.64 (aluminum) per shop practice.
  Builder.prototype.sheet = function (thickness, bendRadius, kFactor) {
    this.model.sheet = { thickness: num(thickness), bendRadius: bendRadius == null ? num(thickness) : num(bendRadius), kFactor: kFactor == null ? 0.71 : num(kFactor) };
    return this;
  };
  Builder.prototype.baseFlange = function (thickness, opts) {
    opts = opts || {};
    if (!this.model.sheet || thickness != null) this.sheet(thickness != null ? thickness : 2, opts.bendRadius, opts.kFactor);
    var T = this.model.sheet.thickness;
    var f = this.extrude(T, Object.assign({}, opts, { sheetBase: true, name: opts.name || 'Base-Flange1' }));
    return f;
  };
  // edges: [[x,y,z], ...] points on straight edges of the flat sheet face
  // opts: angle, reverse, radius, position, toward, name, miter (bool), miterGap, relief ('none' | 'rect' | 'obround'),
  // reliefWidth (default T), reliefDepth (default T/2)
  Builder.prototype.flange = function (length, edges, opts) {
    opts = opts || {};
    var f = { type: 'flange', length: num(length), angle: opts.angle == null ? 90 : num(opts.angle), reverse: !!opts.reverse, radius: opts.radius != null ? num(opts.radius) : null, position: opts.position || 'bendOutside', toward: opts.toward ? [num(opts.toward[0]), num(opts.toward[1]), num(opts.toward[2])] : undefined,
      edges: (edges || []).map(function (e) { return Array.isArray(e) ? { at: e } : e; }), name: opts.name,
      miter: !!opts.miter, relief: opts.relief === 'rect' || opts.relief === 'obround' ? opts.relief : 'none' };
    if (opts.miterGap != null) f.miterGap = num(opts.miterGap);
    if (opts.reliefWidth != null) f.reliefWidth = num(opts.reliefWidth);
    if (opts.reliefDepth != null) f.reliefDepth = num(opts.reliefDepth);
    this._add(f);
    return this;
  };
  // hem: a 180° flange folded back over the sheet; `gap` is the opening between the flats (default T/2, open hem).
  // A numeric gap is stored as the bend radius; a gap (or sheet thickness) given as an equation is kept as `gap`
  // and the radius is derived from it at rebuild.
  Builder.prototype.hem = function (length, edges, opts) {
    opts = opts || {};
    var T = this.model.sheet ? this.model.sheet.thickness : 2;
    var gap = opts.gap != null ? num(opts.gap) : (isExpression(T) ? '=(' + T.replace(/^\s*=/, '') + ')/2' : T / 2);
    var f = { type: 'flange', hem: true, length: num(length), angle: 180, reverse: !!opts.reverse, position: 'bendOutside',
      edges: (edges || []).map(function (e) { return Array.isArray(e) ? { at: e } : e; }), name: opts.name };
    if (isExpression(gap) || isExpression(T)) { f.gap = gap; f.radius = null; }
    else f.radius = Math.max(gap / 2, 0.02 * T);
    f.name = f.name || featureName(this.model, 'hem');
    this._add(f);
    return this;
  };
  // jog: two bends offsetting the sheet by `height`, then `length` of flat parallel to the base
  Builder.prototype.jog = function (height, length, edges, opts) {
    opts = opts || {};
    this._add({ type: 'jog', height: num(height), length: num(length), angle: opts.angle == null ? 90 : num(opts.angle), reverse: !!opts.reverse, radius: opts.radius != null ? num(opts.radius) : null, position: opts.position || 'bendOutside',
      edges: (edges || []).map(function (e) { return Array.isArray(e) ? { at: e } : e; }), name: opts.name });
    return this;
  };
  Builder.prototype.cut = function (depth, opts) {
    opts = Object.assign({}, opts || {}, { cut: true });
    if (depth === 'through' || depth == null) { opts.throughAll = true; depth = 0; }
    return this.extrude(depth, opts);
  };
  Builder.prototype.revolve = function (angle, opts) {
    opts = opts || {};
    bodyOpts(this._add({ type: 'revolve', sketch: this._sketchId(opts), angle: angle == null ? 360 : num(angle), axis: opts.axis == null ? 'y' : opts.axis, reverse: !!opts.reverse, cut: !!opts.cut, name: opts.name }), opts);
    return this;
  };
  Builder.prototype.revolveCut = function (angle, opts) { return this.revolve(angle, Object.assign({}, opts || {}, { cut: true })); };
  // sweep: profile sketch swept along a path (a sketch id of lines/arcs, or [[x,y,z],...])
  Builder.prototype.sweep = function (opts) {
    opts = opts || {};
    var profile = opts.profile != null ? opts.profile : this.lastSketchId;
    if (profile == null || opts.path == null) throw new Error('sweep needs {profile, path}.');
    bodyOpts(this._add({ type: 'sweep', profile: profile, path: opts.path, cut: !!opts.cut, name: opts.name }), opts);
    return this;
  };
  // loft: blend between two or more sketches, each holding exactly one closed profile
  Builder.prototype.loft = function (sketches, opts) {
    opts = opts || {};
    if (!Array.isArray(sketches) || sketches.length < 2) throw new Error('loft needs an array of at least two sketch ids.');
    bodyOpts(this._add({ type: 'loft', sketches: sketches.slice(), cut: !!opts.cut, name: opts.name }), opts);
    return this;
  };
  // shell: hollow the body with wall thickness t; faces: [[x,y,z], ...] points on the faces to remove (open)
  Builder.prototype.shell = function (t, faces, opts) {
    opts = opts || {};
    this._add({ type: 'shell', thickness: num(t), faces: (faces || []).map(function (e) { return Array.isArray(e) ? { at: e } : e; }), name: opts.name });
    return this;
  };
  Builder.prototype._srcId = function (opts) {
    var id = opts && opts.feature != null ? opts.feature : this.lastSolidId;
    if (id == null) throw new Error('No feature to pattern. Create a boss or cut first.');
    return id;
  };
  Builder.prototype.linearPattern = function (opts) {
    opts = opts || {};
    bodyOpts(this._add({
      type: 'lpattern', feature: this._srcId(opts), d1: opts.dir || 'x', rev1: !!opts.reverse, s1: num(opts.spacing) || 10, n1: num(opts.count) || 2,
      d2: opts.dir2 || null, rev2: !!opts.reverse2, s2: num(opts.spacing2) || 0, n2: num(opts.count2) || 1, name: opts.name
    }), opts);
    return this;
  };
  Builder.prototype.circularPattern = function (opts) {
    opts = opts || {};
    bodyOpts(this._add({ type: 'cpattern', feature: this._srcId(opts), axis: opts.axis || 'z', center: opts.center ? opts.center.map(num) : [0, 0, 0], n: num(opts.count) || 4, angle: opts.angle == null ? 360 : num(opts.angle), equal: opts.equal !== false, name: opts.name }), opts);
    return this;
  };
  Builder.prototype.mirror = function (plane, opts) {
    opts = opts || {};
    var f = { type: 'mirror', plane: plane || 'Right', offset: num(opts.offset) || 0, name: opts.name };
    if (opts.body) f.body = true; else f.feature = this._srcId(opts);
    bodyOpts(this._add(f), opts);
    return this;
  };
  // edges: [[x,y,z], ...] points on (or near) the edges to modify; chain=false disables tangent propagation
  Builder.prototype.chamfer = function (d, edges, opts) {
    opts = opts || {};
    var specs = (edges || []).map(function (e) { return Array.isArray(e) ? { at: e, chain: opts.chain !== false } : e; });
    this._add({ type: 'chamfer', d: num(d), edges: specs, name: opts.name });
    return this;
  };
  Builder.prototype.fillet = function (r, edges, opts) {
    opts = opts || {};
    var specs = (edges || []).map(function (e) { return Array.isArray(e) ? { at: e, chain: opts.chain !== false } : e; });
    this._add({ type: 'fillet', r: num(r), edges: specs, name: opts.name });
    return this;
  };
  Builder.prototype.hole = function (planeSpec, x, y, dia, opts) {
    opts = opts || {};
    var s = this.sketch(planeSpec, opts.offset);
    s.circle(x, y, this._value(dia, 'hole diameter') / 2);
    var f = s.end();
    if (opts.depth) f.cut(opts.depth, { reverse: !opts.forward, sketch: this.lastSketchId, name: opts.name, bodies: opts.bodies });
    else f.cut('through', { reverse: !opts.forward, sketch: this.lastSketchId, name: opts.name, bodies: opts.bodies });
    return this;
  };
  Builder.prototype.box = function (w, d, h, opts) {
    opts = opts || {};
    var at = opts.at || [0, 0, 0];
    w = this._value(w, 'box width'); d = this._value(d, 'box depth'); // sketch sizes are numbers; h may stay an equation
    // sketch on Top: u = x, v = -z
    var s = this.sketch('Top', at[1]);
    if (opts.centered) s.centerRect(at[0], -at[2], w, d); else s.rect(at[0], -at[2] - d, w, d);
    s.end().extrude(h, { cut: !!opts.cut, name: opts.name, merge: opts.merge, bodies: opts.bodies });
    return this;
  };
  Builder.prototype.cylinder = function (r, h, opts) {
    opts = opts || {};
    var at = opts.at || [0, 0, 0], axis = opts.axis || 'y';
    r = this._value(r, 'cylinder radius'); // the sketch circle is a number; h may stay an equation
    var s;
    if (axis === 'y') s = this.sketch('Top', at[1]).circle(at[0], -at[2], r);
    else if (axis === 'z') s = this.sketch('Front', at[2]).circle(at[0], at[1], r);
    else s = this.sketch('Right', at[0]).circle(-at[2], at[1], r);
    s.end().extrude(h, { cut: !!opts.cut, name: opts.name, merge: opts.merge, bodies: opts.bodies });
    return this;
  };
  Builder.prototype.last = function () { return this.lastId; };

  function SketchBuilder(part, feature) { this.part = part; this.f = feature; }
  SketchBuilder.prototype._e = function (e) { this.f.entities.push(e); return this; };
  // sketch entities hold plain numbers: a value given as an equation ('=T/2') is evaluated against the current
  // variables when the script runs (the entity keeps the number, not the expression)
  SketchBuilder.prototype._v = function (x) { return isExpression(x) ? this.part._value(x, 'sketch value') : +x; };
  SketchBuilder.prototype.line = function (x1, y1, x2, y2) { var s = this; return this._e({ t: 'line', x1: s._v(x1), y1: s._v(y1), x2: s._v(x2), y2: s._v(y2) }); };
  SketchBuilder.prototype.rect = function (x, y, w, h) { var s = this; return this._e({ t: 'rect', x: s._v(x), y: s._v(y), w: s._v(w), h: s._v(h) }); };
  SketchBuilder.prototype.centerRect = function (cx, cy, w, h) { var s = this; return this._e({ t: 'crect', cx: s._v(cx), cy: s._v(cy), w: s._v(w), h: s._v(h) }); };
  SketchBuilder.prototype.circle = function (cx, cy, r) { var s = this; return this._e({ t: 'circle', cx: s._v(cx), cy: s._v(cy), r: s._v(r) }); };
  SketchBuilder.prototype.polygon = function (cx, cy, r, n, rot) { var s = this; return this._e({ t: 'poly', cx: s._v(cx), cy: s._v(cy), r: s._v(r), n: s._v(n) | 0 || 6, rot: s._v(rot) || 0 }); };
  SketchBuilder.prototype.slot = function (x1, y1, x2, y2, w) { var s = this; return this._e({ t: 'slot', x1: s._v(x1), y1: s._v(y1), x2: s._v(x2), y2: s._v(y2), w: s._v(w) }); };
  SketchBuilder.prototype.arc = function (cx, cy, r, a0, a1) { var s = this; return this._e({ t: 'arc', cx: s._v(cx), cy: s._v(cy), r: s._v(r), a0: s._v(a0), a1: s._v(a1) }); };
  SketchBuilder.prototype.polyline = function (pts, closed) { var s = this; return this._e({ t: 'polyline', pts: pts.map(function (p) { return [s._v(p[0]), s._v(p[1])]; }), closed: closed !== false }); };
  SketchBuilder.prototype.point = function (x, y) { var s = this; return this._e({ t: 'point', x: s._v(x), y: s._v(y) }); };
  // mirror entities across 'x' | 'y' | a line entity index | {x1,y1,x2,y2}; opts.entities = indices (default all), opts.copy=false replaces
  SketchBuilder.prototype.mirrorEntities = function (axis, opts) {
    opts = opts || {};
    var ents = this.f.entities, ax = mirrorAxis(axis, ents);
    var idx = opts.entities || ents.map(function (e, i) { return i; });
    var copies = idx.map(function (i) { return mirrorEntity(ents[i], ax); }).filter(Boolean);
    if (opts.copy === false) this.f.entities = ents.filter(function (e, i) { return idx.indexOf(i) < 0; });
    copies.forEach(function (c) { this.f.entities.push(c); }, this);
    return this;
  };
  // linear pattern of entities: { dx, dy, count, dx2, dy2, count2, entities } (steps are vectors in sketch units)
  SketchBuilder.prototype.patternEntities = function (opts) {
    opts = opts || {};
    var ents = this.f.entities, idx = opts.entities || ents.map(function (e, i) { return i; });
    var n1 = Math.max(1, opts.count | 0), n2 = Math.max(1, opts.count2 | 0), src = idx.map(function (i) { return ents[i]; });
    for (var i = 0; i < n1; i++) for (var j = 0; j < n2; j++) {
      if (!i && !j) continue;
      src.forEach(function (e) { this.f.entities.push(translateEntity(e, i * (+opts.dx || 0) + j * (+opts.dx2 || 0), i * (+opts.dy || 0) + j * (+opts.dy2 || 0))); }, this);
    }
    return this;
  };
  // trim entity `index` at the sketch point (u, v): removes the portion between neighbouring intersections
  SketchBuilder.prototype.trim = function (index, u, v) { if (Array.isArray(u)) { v = u[1]; u = u[0]; } this.f.entities = trimEntity(this.f.entities, index, [+u, +v]); return this; };
  // Smart Dimension on entity `index`: kind per dimForEntity ('len', 'dx', 'dy', 'w', 'h', 'dia', 'r', 'seg');
  // opts: { i (edge / segment), off, ang (placement), value (drive the entity to this value first) }
  SketchBuilder.prototype.dim = function (index, kind, opts) {
    opts = opts || {};
    var e = this.f.entities[index];
    if (!e) throw new Error('No sketch entity ' + index + ' to dimension.');
    var d = { e: index | 0, k: kind };
    if (opts.i != null) d.i = opts.i | 0;
    if (opts.off != null) d.off = +opts.off;
    if (opts.ang != null) d.ang = +opts.ang;
    if (!dimGeometry(e, d)) throw new Error('Dimension ' + JSON.stringify(kind) + ' does not apply to a ' + e.t + '.');
    if (opts.value != null) setDimValue(e, d, opts.value);
    (this.f.dims = this.f.dims || []).push(d);
    return this;
  };
  SketchBuilder.prototype.id = function () { return this.f.id; };
  SketchBuilder.prototype.end = function () { return this.part; };
  ['extrude', 'cut', 'revolve', 'revolveCut', 'baseFlange'].forEach(function (m) {
    SketchBuilder.prototype[m] = function (a, opts) {
      opts = Object.assign({}, opts || {}, { sketch: this.f.id });
      return this.part[m](a, opts);
    };
  });

  function runScript(model, code) {
    var b = new Builder(model);
    var fn = new Function('p', 'part', 'Math', '"use strict";\n' + code);
    fn(b, b, Math);
    return b;
  }

  // Regenerate a script from a model so the two representations stay interchangeable.
  function generateScript(model) {
    var out = ['// ' + model.name + ' — generated by Anvil', 'p.name(' + JSON.stringify(model.name) + ').units(' + JSON.stringify(model.units) + ');'];
    scriptSections.forEach(function (sec) { if (sec.head) out = out.concat(sec.head(model) || []); });
    // equations first, so every "=" field below resolves against them; the array form keeps each expr string exactly
    if (Array.isArray(model.equations) && model.equations.length) out.push('p.equations(' + JSON.stringify(model.equations) + ');');
    // configurations right after, so a box/hole size given as "=..." is evaluated with the active set as the model had it
    if (Array.isArray(model.configurations) && model.configurations.length) {
      out.push('p.configurations(' + JSON.stringify(model.configurations) + ');');
      if (model.activeConfiguration != null && findConfiguration(model, model.activeConfiguration)) out.push('p.activeConfiguration(' + JSON.stringify(String(model.activeConfiguration)) + ');');
    }
    if (model.sheet) out.push('p.sheet(' + nv(model.sheet.thickness) + ', ' + nv(model.sheet.bendRadius) + ', ' + nv(model.sheet.kFactor) + ');');
    var idVar = {};
    model.features.forEach(function (f) {
      var v = 'f' + f.id;
      idVar[f.id] = v;
      switch (f.type) {
        case 'plane':
          out.push('var ' + v + ' = p.plane(' + JSON.stringify(f.ref) + ', ' + nv(f.offset) + ', ' + JSON.stringify(f.name) + ');');
          break;
        case 'sketch': {
          var pl = f.plane || {};
          // r10/facesketch10: a face reference names its feature by the script variable (ids are renumbered)
          var plj = pl.custom && pl.face ? JSON.stringify(pl, function (k, x) { return k === 'face' ? undefined : x; }) : null;
          if (plj && idVar[pl.face.feature]) plj = plj.slice(0, -1) + ',"face":' + JSON.stringify(faceCopy(pl.face, { feature: 0 })).replace('"feature":0', '"feature":' + idVar[pl.face.feature]) + '}';
          var spec = plj ? plj : pl.custom ? JSON.stringify(pl) : (pl.featureId != null ? idVar[pl.featureId] : JSON.stringify(pl.ref || 'Front') + ', ' + nv(pl.offset || 0));
          var s = 'var ' + v + ' = p.sketch(' + spec + (pl.custom || pl.featureId != null ? ', 0' : '') + ', ' + JSON.stringify(f.name) + ')';
          f.entities.forEach(function (e) {
            switch (e.t) {
              case 'line': s += '\n  .line(' + [e.x1, e.y1, e.x2, e.y2].join(', ') + ')'; break;
              case 'rect': s += '\n  .rect(' + [e.x, e.y, e.w, e.h].join(', ') + ')'; break;
              case 'crect': s += '\n  .centerRect(' + [e.cx, e.cy, e.w, e.h].join(', ') + ')'; break;
              case 'circle': s += '\n  .circle(' + [e.cx, e.cy, e.r].join(', ') + ')'; break;
              case 'poly': s += '\n  .polygon(' + [e.cx, e.cy, e.r, e.n, e.rot || 0].join(', ') + ')'; break;
              case 'slot': s += '\n  .slot(' + [e.x1, e.y1, e.x2, e.y2, e.w].join(', ') + ')'; break;
              case 'arc': s += '\n  .arc(' + [e.cx, e.cy, e.r, e.a0, e.a1].join(', ') + ')'; break;
              case 'polyline': s += '\n  .polyline(' + JSON.stringify(e.pts) + ', ' + !!e.closed + ')'; break;
              case 'point': s += '\n  .point(' + e.x + ', ' + e.y + ')'; break;
            }
          });
          (f.dims || []).forEach(function (d) {
            var o = {};
            if (d.i != null) o.i = d.i;
            if (d.off != null) o.off = Math.round(d.off * 1e4) / 1e4;
            if (d.ang != null) o.ang = Math.round(d.ang * 1e4) / 1e4;
            s += '\n  .dim(' + d.e + ', ' + JSON.stringify(d.k) + (Object.keys(o).length ? ', ' + optsStr(o) : '') + ')';
          });
          sketchScripts.forEach(function (fn) { s += fn(f) || ''; });
          out.push(s + '\n  .id();');
          break;
        }
        case 'extrude': {
          var o = { sketch: '@' + idVar[f.sketch], name: f.name };
          if (f.end === 'through') o.throughAll = true;
          if (f.end === 'mid') o.midplane = true;
          if (f.reverse) o.reverse = true;
          if (f.dir2) { o.depth2 = f.depth2; if (f.end2 === 'through') o.throughAll2 = true; }
          if (f.sheetBase) o.sheetBase = true;
          if (f.draft) { o.draft = f.draft; if (f.draftOut) o.draftOutward = true; }
          if (f.cut && f.normalCut) o.normalCut = true;
          out.push('var ' + v + ' = p.' + (f.cut ? 'cut' : 'extrude') + '(' + nv(f.depth) + ', ' + optsStr(bodyOptsOut(o, f)) + ').last();');
          break;
        }
        default:
          if (featureTypes[f.type] && featureTypes[f.type].script) out.push(featureTypes[f.type].script(f, v, idVar, optsStr));
          break;
        case 'flange': {
          var fspecs = JSON.stringify((f.edges || []).map(function (e) { return e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }); }));
          var fo = { angle: f.angle, name: f.name };
          if (f.reverse) fo.reverse = true;
          if (f.radius != null) fo.radius = f.radius;
          if (f.position && f.position !== 'bendOutside') fo.position = f.position;
          if (f.toward) fo.toward = f.toward.map(function (x) { return isExpression(x) ? x : Math.round(x * 1e4) / 1e4; });
          if (f.miter) fo.miter = true;
          if (f.miterGap != null && (isExpression(f.miterGap) || +f.miterGap !== 0)) fo.miterGap = numOut(f.miterGap);
          if (f.relief && f.relief !== 'none') fo.relief = f.relief;
          if (f.reliefWidth != null) fo.reliefWidth = numOut(f.reliefWidth);
          if (f.reliefDepth != null) fo.reliefDepth = numOut(f.reliefDepth);
          if (f.hem) {
            var ho = { gap: f.gap != null ? numOut(f.gap) : Math.round(f.radius * 2 * 1e4) / 1e4, name: f.name };
            if (f.reverse) ho.reverse = true;
            out.push('var ' + v + ' = p.hem(' + nv(f.length) + ', ' + fspecs + ', ' + optsStr(ho) + ').last();');
          } else out.push('var ' + v + ' = p.flange(' + nv(f.length) + ', ' + fspecs + ', ' + optsStr(fo) + ').last();');
          break;
        }
        case 'jog': {
          var jspecs = JSON.stringify((f.edges || []).map(function (e) { return e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }); }));
          var jo = { angle: f.angle, name: f.name };
          if (f.reverse) jo.reverse = true;
          if (f.radius != null) jo.radius = f.radius;
          if (f.position && f.position !== 'bendOutside') jo.position = f.position;
          out.push('var ' + v + ' = p.jog(' + nv(f.height) + ', ' + nv(f.length) + ', ' + jspecs + ', ' + optsStr(jo) + ').last();');
          break;
        }
        case 'revolve': {
          var ro = { sketch: '@' + idVar[f.sketch], name: f.name, axis: f.axis };
          if (f.reverse) ro.reverse = true;
          out.push('var ' + v + ' = p.' + (f.cut ? 'revolveCut' : 'revolve') + '(' + nv(f.angle) + ', ' + optsStr(bodyOptsOut(ro, f)) + ').last();');
          break;
        }
        case 'lpattern': {
          var lo = { feature: '@' + idVar[f.feature], dir: f.d1, spacing: f.s1, count: f.n1, name: f.name };
          if (f.rev1) lo.reverse = true;
          if (f.d2) { lo.dir2 = f.d2; lo.spacing2 = f.s2; lo.count2 = f.n2; if (f.rev2) lo.reverse2 = true; }
          out.push('var ' + v + ' = p.linearPattern(' + optsStr(bodyOptsOut(lo, f)) + ').last();');
          break;
        }
        case 'cpattern':
          out.push('var ' + v + ' = p.circularPattern(' + optsStr(bodyOptsOut({ feature: '@' + idVar[f.feature], axis: f.axis, center: f.center, count: f.n, angle: f.angle, equal: f.equal !== false, name: f.name }, f)) + ').last();');
          break;
        case 'mirror': {
          var mo = { name: f.name, offset: f.offset || 0 };
          if (f.body) mo.body = true; else mo.feature = '@' + idVar[f.feature];
          out.push('var ' + v + ' = p.mirror(' + JSON.stringify(f.plane) + ', ' + optsStr(bodyOptsOut(mo, f)) + ').last();');
          break;
        }
        case 'sweep': {
          var so = { profile: '@' + idVar[f.profile], path: Array.isArray(f.path) ? f.path : '@' + idVar[f.path], name: f.name };
          if (f.cut) so.cut = true;
          out.push('var ' + v + ' = p.sweep(' + optsStr(bodyOptsOut(so, f)) + ').last();');
          break;
        }
        case 'loft': {
          var lo2 = { name: f.name };
          if (f.cut) lo2.cut = true;
          out.push('var ' + v + ' = p.loft([' + f.sketches.map(function (id) { return idVar[id]; }).join(', ') + '], ' + optsStr(bodyOptsOut(lo2, f)) + ').last();');
          break;
        }
        case 'chamfer':
        case 'fillet': {
          var specs = JSON.stringify((f.edges || []).map(function (e) { return { at: e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }), chain: e.chain !== false }; }));
          out.push('var ' + v + ' = p.' + f.type + '(' + nv(f.type === 'chamfer' ? f.d : f.r) + ', ' + specs + ', ' + optsStr({ name: f.name }) + ').last();');
          break;
        }
        case 'shell': {
          var fspecs2 = JSON.stringify((f.faces || []).map(function (e) { return e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }); }));
          out.push('var ' + v + ' = p.shell(' + nv(f.thickness) + ', ' + fspecs2 + ', ' + optsStr({ name: f.name }) + ').last();');
          break;
        }
      }
    });
    var tail = [];
    scriptSections.forEach(function (sec) { if (sec.tail) tail = tail.concat(sec.tail(model, idVar) || []); });
    return out.join('\n') + (tail.length ? '\n' + tail.join('\n') + '\n' : '');
  }
  // The multi-body fields of a feature, added to its emitted opts: `merge: false` on a boss kept separate, `bodies`
  // on a scoped cut. Nothing is emitted for the defaults, so an ordinary part's script reads as before.
  // nv(x): a numeric argument as script text, an equation ('=T*2') as its quoted string
  function nv(x) { return isExpression(x) ? JSON.stringify(x) : String(x); }
  // numOut(x): an option value, a number or the equation string untouched (optsStr quotes strings)
  function numOut(x) { return isExpression(x) ? x : +x; }
  function bodyOptsOut(o, f) {
    if (f.merge === false) o.merge = false;
    if (Array.isArray(f.bodies) && f.bodies.length) o.bodies = f.bodies.slice();
    return o;
  }
  function optsStr(o) {
    var parts = [];
    Object.keys(o).forEach(function (k) {
      var v = o[k];
      if (v === undefined || v === null || (v === false && k !== 'merge')) return;
      if (typeof v === 'string' && v.charAt(0) === '@') parts.push(k + ': ' + v.slice(1));
      else parts.push(k + ': ' + JSON.stringify(v));
    });
    return '{ ' + parts.join(', ') + ' }';
  }

  return {
    STD_PLANES: STD_PLANES, AXES: AXES,
    makePlane: makePlane, planeFromFace: planeFromFace, resolvePlane: resolvePlane, faceRef: faceRef, resolveFacePlane: resolveFacePlane, capPlane: capPlane, patternCopies: patternCopies, tidyPlane: tidyPlane, to3D: to3D, to2D: to2D,
    entityPolylines: entityPolylines, entitySnapPoints: entitySnapPoints, sketchProfile: sketchProfile, signedArea: signedArea, loopSelfCrossing: loopSelfCrossing, checkProfile: checkProfile,
    offsetLoop: offsetLoop, filletPolyline: filletPolyline,
    mirrorAxis: mirrorAxis, mirrorEntity: mirrorEntity, translateEntity: translateEntity, entityPrimitives: entityPrimitives, trimEntity: trimEntity,
    dimGeometry: dimGeometry, dimValue: dimValue, setDimValue: setDimValue, dimForEntity: dimForEntity,
    newModel: newModel, featureName: featureName, findFeature: findFeature, cutDirectionHint: cutDirectionHint,
    buildTool: buildTool, isCut: isCut, extrudeRange: extrudeRange, revolveAxis: revolveAxis, cutScope: cutScope, THROUGH: THROUGH, registerFeature: registerFeature, registerSketchScript: registerSketchScript, registerScriptSection: registerScriptSection, rebuild: rebuild, combineBodies: combineBodies, bodyInfo: bodyInfo, bodyNearPoint: bodyNearPoint, buildEdgeFeature: buildEdgeFeature,
    packBuild: packBuild, packTransferables: packTransferables, unpackBuild: unpackBuild, applyProfiles: applyProfiles, cacheFromBuild: cacheFromBuild,
    meshFromBody: meshFromBody, massProps: massProps, curveCorrection: curveCorrection, curveEdges: curveEdges, curveSurfaces: curveSurfaces, setTessellation: setTessellation, segsForRadius: segsForRadius, entityCurves: entityCurves, meshQuality: meshQuality, faceOutline: faceOutline, outlineOptions: outlineOptions, bodyEdges: bodyEdges, meshCurveInfo: meshCurveInfo, analyticNormals: analyticNormals, resolveEdges: resolveEdges, pointSegmentDistance: pointSegmentDistance,
    exportSTL: exportSTL, exportDXFSketch: exportDXFSketch, exportDXFFace: exportDXFFace,
    buildFlange: buildFlange, flangeLayout: flangeLayout, buildJog: buildJog, normalCutTool: normalCutTool, flangeProfile: flangeProfile, flatPattern: flatPattern, exportDXFFlat: exportDXFFlat, bendAllowance: bendAllowance, sheetParams: sheetParams,
    sketchPath: sketchPath, buildSweep: buildSweep, buildLoft: buildLoft,
    resolveFaces: resolveFaces, buildShell: buildShell,
    Builder: Builder, runScript: runScript, generateScript: generateScript,
    isExpression: isExpression, evalExpression: evalExpression, resolveEquations: resolveEquations, resolvedModel: resolvedModel,
    resolveFeature: resolveFeature, hasExpressions: hasExpressions,
    configurationList: configurationList, findConfiguration: findConfiguration, activeConfiguration: activeConfiguration,
    effectiveEquations: effectiveEquations, captureConfiguration: captureConfiguration, applyEquations: applyEquations, EXPR_FUNCTIONS: Object.keys(EXPR_FN),
    vec: { add: add, sub: sub, scale: scale, dot: dot, cross: cross, len: len, norm: norm }
  };
})();
