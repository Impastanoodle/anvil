// ui-transform-3d.js — Mastercam's Transform tab, lane BK: Translate to Plane, Project and Roll (Position group), Stretch and
// Scale (Size group). Mastercam's wireframe is Anvil's sketch geometry, so every command acts on the open sketch (Unroll
// also runs outside one) and writes sketch entities; geometry that changes plane goes through a plane-to-plane affine
// map that keeps curves exact where the result is a curve Anvil holds (a circle seen on a tilted plane is an ellipse).
// Commands: UI.cmdTTranslateToPlane, UI.cmdTProject, UI.cmdTRoll, UI.cmdTStretch, UI.cmdTScale (the ribbon buttons run
// UI['cmdT' + Name]()); helpers for scripts and tests on UI.transform3D. See README *Transform tab*.
(function () {
  'use strict';
  if (typeof UI === 'undefined') return;
  var App = UI.App, K = UI.K, S = window.SketchSolver;
  if (!S || !UI.openPM || !K) return;
  var V = K.vec, D2R = Math.PI / 180, MSG = 'Open a sketch: Transform acts on sketch geometry';
  var HOT = 'stroke:#e8891c;stroke-width:2.5;fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:0.9';

  // ------------------------------------------------------------------ shared helpers
  function needSketch() { var f = App.mode === 'sketch' ? UI.activeSketchFeature() : null; if (!f) UI.toast(MSG); return f; }
  function selIdx(f) {
    var out = [];
    if (UI.selection) UI.selection().forEach(function (s) { if (s.kind === 'entity' && out.indexOf(s.index) < 0) out.push(s.index); });
    if (App.sel && App.sel.kind === 'entity' && out.indexOf(App.sel.index) < 0) out.push(App.sel.index);
    return out.filter(function (i) { return f.entities[i]; }).sort(function (a, b) { return a - b; });
  }
  function setSel(idx) { if (UI.setSelection) UI.setSelection(idx.map(function (i) { return { kind: 'entity', index: i }; })); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function ents(n) { return plural(n, 'entity', 'entities'); }
  function fmt(x) { return UI.fmtDim ? UI.fmtDim(x) : String(Math.round(x * 1e6) / 1e6); }
  function fmtPt(p) { return '(' + fmt(p[0]) + ', ' + fmt(p[1]) + ')'; }
  // a value within 1e-11 of a 1e-10 step snaps to it (4.999999999999999 -> 5): float noise from the frame products
  function td(x) { var r = Math.round(x * 1e10) / 1e10; return Math.abs(r - x) < 1e-11 ? (r === 0 ? 0 : r) : x; }
  function tidyEnt(o) {
    ['x1', 'y1', 'x2', 'y2', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'w', 'h', 'a0', 'a1', 'rot'].forEach(function (k) { if (typeof o[k] === 'number') o[k] = td(o[k]); });
    if (o.pts) o.pts = o.pts.map(function (p) { return [td(p[0]), td(p[1])].concat(p.slice(2)); });
    return o;
  }
  function carry(e, o) { if (e.construction) o.construction = true; if (e.layer != null) o.layer = e.layer; return o; }
  function frameOf(g) {
    var ref = (App.build && App.build.facePlanes && App.build.facePlanes[g.id]) || g.plane;
    try { return K.resolvePlane(ref, App.model, (App.build && App.build.planes) || {}); } catch (e) { return null; }
  }
  function sketches() { return (App.model.features || []).filter(function (g) { return g.type === 'sketch'; }); }
  function feature(id) { return K.findFeature(App.model, id); }
  function sameFrame(A, B) {
    if (!A || !B) return false;
    for (var k = 0; k < 3; k++) if (Math.abs(A.origin[k] - B.origin[k]) > 1e-9 || Math.abs(A.x[k] - B.x[k]) > 1e-12 || Math.abs(A.y[k] - B.y[k]) > 1e-12) return false;
    return true;
  }
  function coplanar(A, B) { return !!A && !!B && Math.abs(Math.abs(V.dot(A.n, B.n)) - 1) < 1e-9 && Math.abs(V.dot(V.sub(A.origin, B.origin), B.n)) < 1e-7; }
  function distSeg(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }
  function polylinesOf(e) {
    if (e.t === 'point') return [{ pts: [[e.x, e.y]], closed: false }];
    try { return K.entityPolylines(e); } catch (er) { return []; }
  }
  function entPts(e) { return polylinesOf(e).map(function (l) { return l.closed && l.pts.length ? l.pts.concat([l.pts[0]]) : l.pts; }); }
  function preview(list) { App.tempEntities = list || []; UI.updateTemp(); }
  function clearPreview() { App.tempEntities = []; UI.updateTemp(); if (UI.sketchFeedbackClear) UI.sketchFeedbackClear(); }
  function refreshSketch() { App.gridStale = true; App.dimsStale = true; UI.updateSketches(); UI.refreshTree(); }
  // the sketch point (an end, a centre, the origin) under the cursor, as the drawing tools infer it
  function snapPoint(f, uv, mx, my) {
    if (UI.sketchInferPoint) { var inf = UI.sketchInferPoint(uv, mx, my); if (inf && inf.p) return inf.p.slice(); }
    return uv.slice();
  }
  // one undo step for a change that may touch several sketches: fn() returns { ok, error }; a failure puts the model back
  function oneStep(fn) {
    var snap = JSON.stringify({ features: App.model.features, nextId: App.model.nextId });
    UI.pushUndo(); App.sketchDirty = true;
    var r;
    try { r = fn(); } catch (e) { r = { ok: false, error: e.message }; }
    if (!r || !r.ok) { App.undo.pop(); restoreModel(snap); }
    return r || { ok: false };
  }
  // the features put back as they were, in place (the open sketch and the PropertyManager keep their objects)
  function restoreModel(snap) {
    var m = JSON.parse(snap), byId = {};
    m.features.forEach(function (g) { byId[g.id] = g; });
    App.model.features = App.model.features.filter(function (g) { return byId[g.id]; });
    App.model.features.forEach(function (g) {
      var o = byId[g.id];
      Object.keys(g).forEach(function (k) { if (!(k in o)) delete g[k]; });
      Object.keys(o).forEach(function (k) { g[k] = o[k]; });
    });
    App.model.nextId = m.nextId;
  }
  // entities idx deleted from sketch g (relations and dimensions follow); returns how many relations tied them to
  // geometry that stays
  function deleteEntities(g, idx) {
    var set = {}, dropped = 0;
    idx.forEach(function (i) { set[i] = true; });
    (g.rels || []).forEach(function (rel) {
      var ins = rel.refs.map(function (r) { var m = /^(\d+)/.exec(String(r)); return m ? !!set[+m[1]] : false; });
      if (ins.some(Boolean) && ins.some(function (x) { return !x; })) dropped++;
    });
    idx.slice().sort(function (a, b) { return b - a; }).forEach(function (i) {
      g.entities.splice(i, 1);
      S.removeEntity(g, i);
      if (g.dims) g.dims = g.dims.filter(function (d) { return d.e !== i; }).map(function (d) { if (d.e > i) d.e--; return d; });
    });
    if (g.dims && !g.dims.length) delete g.dims;
    return dropped;
  }
  // relations between entities idx and the rest of sketch g
  function outsideRelations(g, idx) {
    var set = {}, n = 0;
    idx.forEach(function (i) { set[i] = true; });
    (g.rels || []).forEach(function (rel) {
      var ins = rel.refs.map(function (r) { var m = /^(\d+)/.exec(String(r)); return m ? !!set[+m[1]] : false; });
      if (ins.some(Boolean) && ins.some(function (x) { return !x; })) n++;
    });
    return n;
  }
  function newSketch(planeRef) {
    var g = { id: App.model.nextId++, type: 'sketch', plane: JSON.parse(JSON.stringify(planeRef)), entities: [] };
    g.name = K.featureName(App.model, 'sketch');
    App.model.features.push(g);
    return g;
  }
  // after ✓ in another sketch: leave this one and open that one with the result selected
  function openSketchAfter(id, idx, msg) {
    if (App.activeSketch === id) { finish(idx, msg); return; }
    App.pendingAfterSketch = function () { UI.enterSketch(id); refreshSketch(); setSel(idx); if (msg) UI.setStatus(msg); };
    UI.exitSketch(true);
  }
  // the result selected and the message shown, again once ✓ has closed the PropertyManager (closing it clears both)
  function finish(idx, msg) {
    var sk = App.activeSketch;
    function show() { if (idx) setSel(idx); if (msg) UI.setStatus(msg); }
    show();
    Promise.resolve().then(function () { if (App.mode === 'sketch' && App.activeSketch === sk) show(); });
  }
  // Mastercam's ✓+ (apply, keep the function open for the next one), next to ✓ and ✗
  function okPlus(apply, after) { return [{ title: 'OK and keep open (✓+): apply, then the next one', icon: 'okPlus', onclick: function () { if (apply(true) !== false) { if (after) after(); UI.renderPM(); } } }]; }
  // lane BO: the last-used values of each command (Mastercam keeps them) — ui-transform.js loads after this file
  function recall(name, v, keys) { if (UI.transformMemory) { var m = UI.transformMemory.get(name); if (m) keys.forEach(function (k) { if (m[k] !== undefined) v[k] = m[k]; }); } return v; }
  function keep(name, v, keys) { if (UI.transformMemory) { var o = {}; keys.forEach(function (k) { o[k] = v[k]; }); UI.transformMemory.keep(name, o); } }
  function modeField(opts) { return { type: 'radio', key: 'mode', options: opts, rerender: true }; }
  // ✗: the preview goes and the status bar says so, again after the close has cleared the selection (its own status line)
  function cancelled(title) { clearPreview(); var msg = title + ' cancelled.'; UI.setStatus(msg); Promise.resolve().then(function () { UI.setStatus(msg); }); }

  // ------------------------------------------------------------------ 2D affine maps of sketch entities
  // A = { a, b, c, d, tx, ty }: (x, y) -> (a x + b y + tx, c x + d y + ty)
  function aff(a, b, c, d, tx, ty) { return { a: a, b: b, c: c, d: d, tx: tx || 0, ty: ty || 0 }; }
  function comp(B, A) { return aff(B.a * A.a + B.b * A.c, B.a * A.b + B.b * A.d, B.c * A.a + B.d * A.c, B.c * A.b + B.d * A.d, B.a * A.tx + B.b * A.ty + B.tx, B.c * A.tx + B.d * A.ty + B.ty); }
  function ap(A, p) { return [A.a * p[0] + A.b * p[1] + A.tx, A.c * p[0] + A.d * p[1] + A.ty]; }
  function av(A, v) { return [A.a * v[0] + A.b * v[1], A.c * v[0] + A.d * v[1]]; }
  function translate(dx, dy) { return aff(1, 0, 0, 1, dx, dy); }
  // sketch frame Fs's coordinates seen in frame Ft: the world point, projected square onto Ft's plane
  function frameMap(Fs, Ft) {
    if (sameFrame(Fs, Ft)) return translate(0, 0);
    var t = K.to2D(Ft, Fs.origin);
    return aff(V.dot(Ft.x, Fs.x), V.dot(Ft.x, Fs.y), V.dot(Ft.y, Fs.x), V.dot(Ft.y, Fs.y), t[0], t[1]);
  }
  function isTranslation(A) { return Math.abs(A.a - 1) < 1e-14 && Math.abs(A.b) < 1e-14 && Math.abs(A.c) < 1e-14 && Math.abs(A.d - 1) < 1e-14; }
  function similarity(A) {
    var s1 = Math.hypot(A.a, A.c), s2 = Math.hypot(A.b, A.d);
    if (!(s1 > 0) || Math.abs(s1 - s2) > 1e-12 * s1 || Math.abs(A.a * A.b + A.c * A.d) > 1e-12 * s1 * s2 || A.a * A.d - A.b * A.c <= 0) return null;
    return { s: s1, rot: Math.atan2(A.c, A.a) / D2R };
  }
  function norm360(a) { a = a % 360; if (a < 0) a += 360; return Math.abs(a - 360) < 1e-10 ? 0 : a; }
  // the image of the ellipse (centre, rx, ry, rot°; arc: [a0, a1] parameter degrees, or null for the whole) under A:
  // P and Q, the images of the two semi-axes, are conjugate semi-diameters; the principal axes are at parameter u0
  // with tan 2u0 = 2 P·Q / (|P|² − |Q|²). A circle stays a circle (arc) when A keeps it round; an ellipse seen edge-on
  // is a line.
  function ellipseImage(A, cx, cy, rx, ry, rotDeg, arc, src) {
    var r = (rotDeg || 0) * D2R, ux = [Math.cos(r), Math.sin(r)], uy = [-Math.sin(r), Math.cos(r)];
    var P = av(A, [ux[0] * rx, ux[1] * rx]), Q = av(A, [uy[0] * ry, uy[1] * ry]), C = ap(A, [cx, cy]);
    var pq = P[0] * Q[0] + P[1] * Q[1], pp = P[0] * P[0] + P[1] * P[1], qq = Q[0] * Q[0] + Q[1] * Q[1];
    var u0 = 0.5 * Math.atan2(2 * pq, pp - qq), c0 = Math.cos(u0), s0 = Math.sin(u0);
    var ax1 = [P[0] * c0 + Q[0] * s0, P[1] * c0 + Q[1] * s0], ax2 = [-P[0] * s0 + Q[0] * c0, -P[1] * s0 + Q[1] * c0];
    var R1 = Math.hypot(ax1[0], ax1[1]), R2 = Math.hypot(ax2[0], ax2[1]);
    if (!(R1 > 1e-12)) return [carry(src, { t: 'point', x: C[0], y: C[1] })];
    var flip = ax2[0] * -ax1[1] + ax2[1] * ax1[0] < 0;   // ax2 against the left normal of ax1: the map mirrors
    function at(u) { return [C[0] + P[0] * Math.cos(u) + Q[0] * Math.sin(u), C[1] + P[1] * Math.cos(u) + Q[1] * Math.sin(u)]; }
    if (R2 < 1e-9 * R1) {   // edge-on: the segment it covers
      var e1 = [ax1[0] / R1, ax1[1] / R1], lo = Infinity, hi = -Infinity, us = [];
      if (arc) { us.push(arc[0] * D2R, arc[1] * D2R); for (var k = -4; k <= 8; k++) { var uu = u0 + k * Math.PI; if (uu > arc[0] * D2R && uu < arc[1] * D2R) us.push(uu); } }
      else us.push(u0, u0 + Math.PI);
      us.forEach(function (u) { var p = at(u), s = (p[0] - C[0]) * e1[0] + (p[1] - C[1]) * e1[1]; lo = Math.min(lo, s); hi = Math.max(hi, s); });
      return [carry(src, { t: 'line', x1: C[0] + e1[0] * lo, y1: C[1] + e1[1] * lo, x2: C[0] + e1[0] * hi, y2: C[1] + e1[1] * hi })];
    }
    if (Math.abs(R1 - R2) < 1e-12 * R1) {
      if (!arc) return [carry(src, { t: 'circle', cx: C[0], cy: C[1], r: R1 })];
      var pa = at(arc[0] * D2R), pb = at(arc[1] * D2R), start = flip ? pb : pa;
      var b0 = norm360(Math.atan2(start[1] - C[1], start[0] - C[0]) / D2R);
      return [carry(src, { t: 'arc', cx: C[0], cy: C[1], r: R1, a0: b0, a1: b0 + (arc[1] - arc[0]) })];
    }
    var rot = Math.atan2(ax1[1], ax1[0]) / D2R, u0d = u0 / D2R;
    if (!arc) return [carry(src, { t: 'ellipse', cx: C[0], cy: C[1], rx: R1, ry: R2, rot: rot })];
    var a0 = flip ? u0d - arc[1] : arc[0] - u0d, sw = arc[1] - arc[0];
    a0 = norm360(a0);
    return [carry(src, { t: 'pellipse', cx: C[0], cy: C[1], rx: R1, ry: R2, rot: rot, a0: a0, a1: a0 + sw })];
  }
  // entity e under A: a list of entities (a rectangle or polygon becomes a closed polyline, a slot its lines and caps
  // once the map is not a similarity); [] for what cannot be carried (text that is sheared)
  function mapEntity(e, A) {
    var o;
    if (isTranslation(A)) { o = S.xfEntity(e, { dx: A.tx, dy: A.ty }); if (o) return [tidyEnt(o)]; }
    var sm = similarity(A);
    if (sm) {
      o = e;
      if (Math.abs(sm.rot) > 1e-12) o = S.xfEntity(o, { rot: sm.rot, cx: 0, cy: 0 });
      if (o && Math.abs(sm.s - 1) > 1e-15) o = S.xfEntity(o, { s: sm.s, cx: 0, cy: 0 });
      if (o) o = S.xfEntity(o, { dx: A.tx, dy: A.ty });
      if (o) return [tidyEnt(o)];
    }
    var out;
    switch (e.t) {
      case 'point': { var q = ap(A, [e.x, e.y]); out = [carry(e, { t: 'point', x: q[0], y: q[1] })]; break; }
      case 'line': { var p1 = ap(A, [e.x1, e.y1]), p2 = ap(A, [e.x2, e.y2]); out = [carry(e, { t: 'line', x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] })]; break; }
      case 'circle': out = ellipseImage(A, e.cx, e.cy, e.r, e.r, 0, null, e); break;
      case 'arc': out = ellipseImage(A, e.cx, e.cy, e.r, e.r, 0, [e.a0, e.a1], e); break;
      case 'ellipse': out = ellipseImage(A, e.cx, e.cy, e.rx, e.ry, e.rot, null, e); break;
      case 'pellipse': out = ellipseImage(A, e.cx, e.cy, e.rx, e.ry, e.rot, [e.a0, e.a1], e); break;
      case 'polyline': out = [carry(e, { t: 'polyline', pts: e.pts.map(function (p) { return ap(A, p); }), closed: !!e.closed })]; break;
      case 'spline': {
        // control points of a Style Spline or a conic are affine-exact; a fit spline goes through the mapped points
        o = { t: 'spline', pts: e.pts.map(function (p) { return ap(A, p); }) };
        if (e.closed) o.closed = true;
        if (e.style) o.style = e.style;
        if (e.conic != null) o.conic = e.conic;
        if (e.parabola) o.parabola = e.parabola;
        out = [carry(e, o)];
        break;
      }
      case 'rect': case 'crect': case 'poly': {
        var l = polylinesOf(e)[0];
        out = l ? [carry(e, { t: 'polyline', pts: l.pts.map(function (p) { return ap(A, p); }), closed: true })] : [];
        break;
      }
      case 'slot': {
        var dx = e.x2 - e.x1, dy = e.y2 - e.y1, L = Math.hypot(dx, dy) || 1, h = e.w / 2, n = [-dy / L * h, dx / L * h], ang = Math.atan2(dy, dx) / D2R;
        var parts = [{ t: 'line', x1: e.x1 + n[0], y1: e.y1 + n[1], x2: e.x2 + n[0], y2: e.y2 + n[1] }, { t: 'line', x1: e.x2 - n[0], y1: e.y2 - n[1], x2: e.x1 - n[0], y2: e.y1 - n[1] },
          { t: 'arc', cx: e.x2, cy: e.y2, r: h, a0: ang - 90, a1: ang + 90 }, { t: 'arc', cx: e.x1, cy: e.y1, r: h, a0: ang + 90, a1: ang + 270 }];
        out = [];
        parts.forEach(function (pt) { out = out.concat(mapEntity(carry(e, pt), A)); });
        break;
      }
      case 'aslot': {
        var hh = e.w / 2, P0 = [e.cx + e.r * Math.cos(e.a0 * D2R), e.cy + e.r * Math.sin(e.a0 * D2R)], P1 = [e.cx + e.r * Math.cos(e.a1 * D2R), e.cy + e.r * Math.sin(e.a1 * D2R)];
        var pr = [{ t: 'arc', cx: e.cx, cy: e.cy, r: e.r + hh, a0: e.a0, a1: e.a1 }, { t: 'arc', cx: e.cx, cy: e.cy, r: e.r - hh, a0: e.a0, a1: e.a1 },
          { t: 'arc', cx: P1[0], cy: P1[1], r: hh, a0: e.a1, a1: e.a1 + 180 }, { t: 'arc', cx: P0[0], cy: P0[1], r: hh, a0: e.a0 + 180, a1: e.a0 + 360 }];
        out = [];
        pr.forEach(function (pt) { out = out.concat(mapEntity(carry(e, pt), A)); });
        break;
      }
      default: out = [];
    }
    return out.map(tidyEnt);
  }

  // ------------------------------------------------------------------ picking in the graphics area
  // the entity of a sketch other than `exclude` drawn within 8 px of (mx, my): { sketch, index }
  function pickOtherSketch(mx, my, exclude) {
    var best = null, bd = 8;
    sketches().forEach(function (g) {
      if (g.id === exclude || g.hidden) return;
      var F = frameOf(g);
      if (!F) return;
      (g.entities || []).forEach(function (e, i) {
        entPts(e).forEach(function (pts) {
          var s = pts.map(function (q) { return UI.worldToScreen(K.to3D(F, q[0], q[1])); });
          if (s.length === 1) s.push(s[0]);
          for (var k = 0; k + 1 < s.length; k++) { var d = distSeg([mx, my], s[k], s[k + 1]); if (d < bd) { bd = d; best = { sketch: g, index: i }; } }
        });
      });
    });
    return best;
  }
  function faceCurved(fi) {
    var f = App.mesh && App.mesh.faces[fi];
    if (!f) return true;
    if (f.polys && f.polys[0] && f.polys[0].surf) return true;
    var wc = App.mesh.workerCurves;
    return !!(wc && wc.faceSurfs && wc.faceSurfs[fi]);
  }
  function planeLabel(ref) {
    if (!ref) return 'Front Plane';
    if (ref.custom) return 'Face plane';
    if (ref.featureId != null) { var p = feature(ref.featureId); return p ? p.name : 'Plane' + ref.featureId; }
    return (ref.ref || 'Front') + ' Plane' + (ref.offset ? ' + ' + fmt(ref.offset) : '');
  }
  // a target plane from the graphics area: another sketch's entity, a planar face or a plane
  function pickTarget(mx, my, exclude) {
    var sk = pickOtherSketch(mx, my, exclude);
    if (sk) return { label: sk.sketch.name, sketchId: sk.sketch.id, ref: sk.sketch.plane, frame: frameOf(sk.sketch) };
    var fc = UI.pickFace ? UI.pickFace(mx, my) : null;
    if (fc && fc.index != null) {
      if (faceCurved(fc.index)) return { error: 'Pick a planar face, a plane or a sketch.' };
      var face = App.mesh.faces[fc.index], ref = UI.facePlane(face, fc.point || face.centroid);
      return { label: 'Face<' + (fc.index + 1) + '>', ref: ref, frame: K.resolvePlane(ref, App.model, (App.build && App.build.planes) || {}) };
    }
    var pk = UI.pickPlane ? UI.pickPlane(mx, my) : null;
    if (pk) return targetFromKey(typeof pk.ref === 'number' ? 'pl:' + pk.ref : 'std:' + pk.ref);
    return null;
  }
  function targetOptions(exclude) {
    var o = [['', 'Pick in the graphics area…'], ['std:Front', 'Front Plane'], ['std:Top', 'Top Plane'], ['std:Right', 'Right Plane']];
    (App.model.features || []).forEach(function (g) { if (g.type === 'plane') o.push(['pl:' + g.id, g.name]); });
    sketches().forEach(function (g) { if (g.id !== exclude) o.push(['sk:' + g.id, g.name + ' (' + planeLabel(g.plane) + ')']); });
    return o;
  }
  function targetFromKey(key) {
    var m = /^(std|pl|sk):(.+)$/.exec(key || '');
    if (!m) return null;
    if (m[1] === 'std') return { key: key, label: m[2] + ' Plane', ref: { ref: m[2], offset: 0 }, frame: K.makePlane(m[2], 0) };
    if (m[1] === 'pl') { var id = +m[2], fr = App.build && App.build.planes && App.build.planes[id]; return fr ? { key: key, label: (feature(id) || {}).name || 'Plane', ref: { featureId: id }, frame: fr } : null; }
    var g = feature(+m[2]);
    return g ? { key: key, label: g.name, sketchId: g.id, ref: g.plane, frame: frameOf(g) } : null;
  }
  // where the result of a plane change goes: the target sketch, an existing sketch lying in the target plane (auto), or
  // a new sketch on it
  function destination(T, srcId, wantNew) {
    if (T.sketchId != null) { var g = feature(T.sketchId); return { sketch: g, frame: frameOf(g) }; }
    if (!wantNew) {
      var hit = sketches().filter(function (s) { return s.id !== srcId && coplanar(frameOf(s), T.frame); })[0];
      if (hit) return { sketch: hit, frame: frameOf(hit) };
    }
    return { sketch: null, frame: T.frame, ref: T.ref };
  }
  function entityBox(f, v, onChange, label) {
    return { type: 'pick', icon: 'moveEnt', placeholder: label || 'Select sketch entities…',
      value: function (x) { return x.entities.length ? ents(x.entities.length) : ''; },
      active: function (x) { return x.box === 'entities'; }, onActivate: function () { v.setBox('entities'); },
      items: function (x) { return x.entities.map(function (i) { var e = f.entities[i]; return { label: (e ? e.t.charAt(0).toUpperCase() + e.t.slice(1) : 'Entity') + (i + 1) }; }); },
      onRemove: function (x, i) { x.entities.splice(i, 1); setSel(x.entities); UI.renderPM(); onChange(); },
      onClear: function (x) { x.entities.length = 0; setSel([]); UI.renderPM(); onChange(); } };
  }
  function syncSelection(f, v, onChange) {
    return function () {
      if (v.box !== 'entities') return;
      var s = selIdx(f);
      if (s.join() === v.entities.join()) return;
      v.entities = s;
      UI.renderPM(); onChange();
      // a box selection records its window (UI.lastSketchBox) after it sets the selection: look again once it has
      setTimeout(function () { if (UI.pmSpec && UI.pmSpec() && UI.pmSpec().values === v) { UI.renderPM(); onChange(); } }, 0);
    };
  }

  // ------------------------------------------------------------------ Translate to Plane
  // Mastercam: Transform ▸ Translate to Plane moves or copies geometry from one plane to another, keeping its
  // coordinates relative to the plane (source origin → target origin, or a From point → a To point). Here the source is
  // the selection of the open sketch; the target is a plane, a planar face or another sketch (picked in the graphics
  // area or chosen in the list). The result goes into the target sketch, an existing sketch lying in the target plane,
  // or a new sketch on it; Move deletes the originals (and their relations to what stays). One undo step.
  function cmdTTranslateToPlane() {
    var f = needSketch();
    if (!f) return;
    var Fs = frameOf(f);
    var TK = ['mode', 'map', 'dest', 'edit'];
    var v = recall('translateToPlane', { entities: selIdx(f), mode: 'copy', tkey: '', target: null, map: 'origin', fx: 0, fy: 0, tx: 0, ty: 0, dest: 'auto', edit: true, box: 'entities' }, TK);
    var cmd = { pickPlane: true };
    v.setBox = function (b) {
      v.box = b;
      cmd.onSketchPoint = b === 'entities' ? null : click;
      UI.renderPM(); UI.updatePlanes();
      UI.setStatus(b === 'target' ? 'Click the target plane, planar face or sketch.' : b === 'from' ? 'Click the From point in this sketch.' : b === 'to' ? 'Click the To point on the target plane.' : 'Select the entities to translate.');
    };
    function click(uv, mx, my) {
      if (v.box === 'target') {
        var T = pickTarget(mx, my, f.id);
        if (!T) { UI.setStatus('Click a plane, a planar face or another sketch.'); return; }
        if (T.error) { UI.toast(T.error); return; }
        v.target = T; v.tkey = T.key || '';
        v.setBox(v.map === 'points' ? 'from' : 'entities'); run();
        return;
      }
      if (v.box === 'from') { var p = snapPoint(f, uv, mx, my); v.fx = p[0]; v.fy = p[1]; v.setBox(v.target ? 'to' : 'target'); run(); return; }
      if (v.box === 'to' && v.target) {
        var q = UI.screenToPlane(mx, my, v.target.frame);
        if (!q) return;
        v.tx = td(q[0]); v.ty = td(q[1]); v.setBox('entities'); run();
      }
    }
    function shift() { return v.map === 'points' ? translate(+v.tx - +v.fx, +v.ty - +v.fy) : translate(0, 0); }
    // the entities as they land in the destination sketch's frame
    function result() {
      if (!v.target || !v.entities.length) return null;
      var D = destination(v.target, f.id, v.dest === 'new'), A = comp(frameMap(v.target.frame, D.frame), shift()), out = [];
      v.entities.forEach(function (i) { out = out.concat(mapEntity(f.entities[i], A)); });
      return { dest: D, entities: out };
    }
    function run() {
      // the preview: where the result lands, seen in this sketch's plane
      var R = result(), pv = [];
      if (R) { var B = frameMap(R.dest.frame, Fs); R.entities.forEach(function (e) { pv = pv.concat(mapEntity(e, B)); }); }
      preview(pv);
    }
    function apply(keep) {
      var R = result();
      if (!R) { UI.toast(v.entities.length ? 'Pick the target plane.' : 'Select the entities first.'); return false; }
      var added = [], dropped = 0, dest = null;
      var r = oneStep(function () {
        dest = R.dest.sketch || newSketch(R.dest.ref);
        var n0 = dest.entities.length;
        R.entities.forEach(function (e) { dest.entities.push(e); });
        for (var k = n0; k < dest.entities.length; k++) added.push(k);
        if (v.mode === 'move') dropped = deleteEntities(f, v.entities);
        return { ok: true };
      });
      if (!r.ok) { UI.toast(r.error || 'That could not be done.'); return false; }
      clearPreview();
      var msg = (v.mode === 'move' ? 'Moved ' : 'Copied ') + ents(added.length) + ' to ' + dest.name + ' (' + v.target.label + ')' + (dropped ? '; ' + plural(dropped, 'relation', 'relations') + ' to geometry left behind dropped' : '') + '.';
      v.entities = v.mode === 'move' ? [] : v.entities;
      refreshSketch();
      if (!keep && v.edit) openSketchAfter(dest.id, added, msg);
      else finish(v.entities, msg);
      return true;
    }
    UI.openPM({
      title: 'Translate to Plane', icon: 'plane', values: v, command: cmd, transform: 'translateToPlane',
      message: 'Moves or copies the selected sketch geometry onto another plane, keeping its coordinates relative to the plane (source origin to target origin, or From point to To point).',
      onSelection: syncSelection(f, v, run),
      onEntityPick: function () { return v.box !== 'entities'; },
      extraActions: okPlus(apply, function () { keep('translateToPlane', v, TK); }),
      groups: [
        { title: 'Entities to Translate', fields: [entityBox(f, v, run)] },
        { title: 'Method', fields: [modeField([['move', 'Move'], ['copy', 'Copy']])] },
        { title: 'Target Plane', fields: [
          { type: 'select', label: 'Plane', key: 'tkey', options: function () { return targetOptions(f.id); } },
          { type: 'pick', icon: 'plane', placeholder: 'Click a plane, face or sketch', value: function (x) { return x.target ? x.target.label : ''; }, active: function (x) { return x.box === 'target'; }, onActivate: function () { v.setBox('target'); } },
          { type: 'radio', key: 'dest', options: [['auto', 'Into the sketch on that plane (new if none)'], ['new', 'Into a new sketch']] },
          { type: 'check', label: 'Edit the result sketch after ✓', key: 'edit' }
        ] },
        { title: 'Origin', fields: [
          { type: 'radio', key: 'map', options: [['origin', 'Source origin to target origin'], ['points', 'From point to To point']], rerender: true },
          { type: 'pick', icon: 'point', placeholder: 'From point', value: function (x) { return 'From ' + fmtPt([x.fx, x.fy]); }, show: function (x) { return x.map === 'points'; }, active: function (x) { return x.box === 'from'; }, onActivate: function () { v.setBox('from'); } },
          { type: 'number', label: 'From X', key: 'fx', unit: 'u', show: function (x) { return x.map === 'points'; } },
          { type: 'number', label: 'From Y', key: 'fy', unit: 'u', show: function (x) { return x.map === 'points'; } },
          { type: 'pick', icon: 'point', placeholder: 'To point', value: function (x) { return 'To ' + fmtPt([x.tx, x.ty]); }, show: function (x) { return x.map === 'points'; }, active: function (x) { return x.box === 'to'; }, onActivate: function () { if (!v.target) { UI.toast('Pick the target plane first.'); return; } v.setBox('to'); } },
          { type: 'number', label: 'To X', key: 'tx', unit: 'u', show: function (x) { return x.map === 'points'; } },
          { type: 'number', label: 'To Y', key: 'ty', unit: 'u', show: function (x) { return x.map === 'points'; } }
        ] }
      ],
      onChange: function (x, key) {
        if (key === 'tkey') { v.target = targetFromKey(v.tkey); if (v.box === 'target') v.setBox('entities'); else UI.renderPM(); }
        if (key === 'map' && v.map === 'points') v.setBox('from');
        run();
      },
      okBlocked: function () { return !v.entities.length ? 'Select the entities to translate.' : !v.target ? 'Pick the target plane.' : ''; },
      onOK: function () { var ok = apply(false); if (ok !== false) keep('translateToPlane', v, TK); return ok; },
      onCancel: function () { cancelled('Translate to Plane'); },
      onClose: function () { App.tempEntities = []; UI.updateTemp(); }
    });
    v.setBox(v.entities.length ? 'target' : 'entities');
    run();
  }

  // ------------------------------------------------------------------ Project
  // Mastercam: Transform ▸ Project puts geometry onto the construction plane (To plane) or onto a plane parallel to it
  // at a depth (To depth). Here: entities of other sketches (on other planes, picked in the graphics area) and model
  // edges or faces (their edges) are projected square onto the open sketch's plane. Lines stay lines; circles and arcs
  // come in as circles / arcs when their plane is parallel to the sketch and as exact ellipses / partial ellipses when
  // it is tilted (a line when seen edge-on); ellipses stay ellipses. To depth puts the result in the sketch lying on
  // the parallel plane at that depth (a new one when there is none). Move takes sketch entities out of their sketch.
  function edgeSource(e, seen) {
    var c = e.curve != null && App.curves ? App.curves[e.curve] : null;
    if (c && c.curve) {
      if (seen[e.curve]) return null;
      seen[e.curve] = true;
      var C = c.curve, yd = V.cross(C.normal, C.xdir), full = C.a1 - C.a0 >= 2 * Math.PI - 1e-9;
      var Fc = { origin: C.center, x: C.xdir, y: yd, n: C.normal };
      return { frame: Fc, ent: full ? { t: 'circle', cx: 0, cy: 0, r: C.radius } : { t: 'arc', cx: 0, cy: 0, r: C.radius, a0: C.a0 / D2R, a1: C.a1 / D2R } };
    }
    return { world: [e.a, e.b] };
  }
  function faceEdges(fi) {
    var grp = UI.faceGroup ? UI.faceGroup(fi) : [fi];
    return (App.edges || []).filter(function (e) { var inG = e.faces.filter(function (x) { return grp.indexOf(x) >= 0; }).length; return inG === 1 || (inG >= 1 && !e.smooth && e.faces.length === 1); });
  }
  function joinCollinear(out) {
    for (var again = true; again;) {
      again = false;
      for (var i = 0; i < out.length && !again; i++) for (var j = i + 1; j < out.length && !again; j++) {
        var L = out[i], M = out[j];
        if (L.t !== 'line' || M.t !== 'line') continue;
        var ends = [[L.x1, L.y1], [L.x2, L.y2]], mends = [[M.x1, M.y1], [M.x2, M.y2]];
        for (var p = 0; p < 2 && !again; p++) for (var q = 0; q < 2 && !again; q++) {
          if (Math.hypot(ends[p][0] - mends[q][0], ends[p][1] - mends[q][1]) > 1e-7) continue;
          var u = [ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]], w = [mends[1][0] - mends[0][0], mends[1][1] - mends[0][1]];
          if (Math.abs(u[0] * w[1] - u[1] * w[0]) > 1e-9 * Math.hypot(u[0], u[1]) * Math.hypot(w[0], w[1]) || u[0] * w[0] + u[1] * w[1] < 0 === (p !== q)) continue;
          var A = ends[1 - p], B = mends[1 - q];
          out[i] = carry(L, { t: 'line', x1: A[0], y1: A[1], x2: B[0], y2: B[1] });
          out.splice(j, 1);
          again = true;
        }
      }
    }
    return out;
  }
  function projectItems(items, Ft) {
    var out = [], seen = {}, model = [];
    items.forEach(function (it) {
      if (it.kind === 'sk') {
        var g = feature(it.sketch), e = g && g.entities[it.index], F = g && frameOf(g);
        if (e && F) out = out.concat(mapEntity(e, frameMap(F, Ft)));
        return;
      }
      (it.kind === 'face' ? faceEdges(it.index) : [it.edge]).forEach(function (e) {
        var src = edgeSource(e, seen);
        if (!src) return;
        if (src.ent) { model = model.concat(mapEntity(src.ent, frameMap(src.frame, Ft))); return; }
        var a = K.to2D(Ft, src.world[0]), b = K.to2D(Ft, src.world[1]);
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) return;   // square to the plane: a point, nothing to draw
        model.push(tidyEnt({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }));
      });
    });
    return out.concat(joinCollinear(model));
  }
  function depthPlane(f, Fa, depth) {
    var ref = f.plane || { ref: 'Front', offset: 0 }, o = V.add(Fa.origin, V.scale(Fa.n, depth));
    if (!ref.custom && ref.featureId == null) return { ref: { ref: ref.ref || 'Front', offset: td((+ref.offset || 0) + depth) }, frame: K.makePlane(ref.ref || 'Front', td((+ref.offset || 0) + depth)) };
    var p = { custom: true, origin: o.map(td), x: Fa.x.slice(), y: Fa.y.slice(), n: Fa.n.slice(), offset: td(V.dot(o, Fa.n)) };
    return { ref: p, frame: p };
  }
  function cmdTProject() {
    var f = needSketch();
    if (!f) return;
    var Fa = frameOf(f);
    var PK = ['mode', 'to', 'depth', 'edit'];
    var v = recall('project', { items: [], mode: 'copy', to: 'plane', depth: UI.lenDefault ? UI.lenDefault(10) : 10, edit: false }, PK);
    function label(it) { if (it.kind === 'sk') { var g = feature(it.sketch); return (g ? g.name : 'Sketch') + ' ▸ ' + ((g && g.entities[it.index] || {}).t || 'entity') + (it.index + 1); } return it.kind === 'face' ? 'Face<' + (it.index + 1) + '>' : 'Edge<' + (App.edges.indexOf(it.edge) + 1) + '>'; }
    function same(a, b) { return a.kind === b.kind && (a.kind === 'sk' ? a.sketch === b.sketch && a.index === b.index : a.kind === 'face' ? a.index === b.index : a.edge === b.edge); }
    function pick(mx, my) {
      var sk = pickOtherSketch(mx, my, f.id);
      if (sk) return { kind: 'sk', sketch: sk.sketch.id, index: sk.index };
      var ed = App.edges && UI.pickEdge ? UI.pickEdge(mx, my) : null;
      if (ed && ed.edge) return { kind: 'edge', edge: ed.edge };
      var fc = App.edges && UI.pickFace ? UI.pickFace(mx, my) : null;
      return fc && fc.index != null ? { kind: 'face', index: fc.index } : null;
    }
    function run() { var g = []; try { g = projectItems(v.items, Fa); } catch (e) { g = []; } preview(g); }
    var cmd = {
      ownHover: true,
      onSketchMove: function (uv, mx, my) {
        if (UI.sketchFeedbackClear) UI.sketchFeedbackClear();
        var it = pick(mx, my);
        if (!it) return;
        try { UI.sketchPreview(projectItems([it], Fa).map(function (e) { return entPts(e)[0]; }).filter(Boolean), HOT, 'sk-trim-span'); } catch (e) { }
      },
      onSketchPoint: function (uv, mx, my) {
        var it = pick(mx, my);
        if (!it) { UI.setStatus('Click an entity of another sketch, a model edge or a face.'); return; }
        var k = -1;
        v.items.forEach(function (x, i) { if (same(x, it)) k = i; });
        if (k >= 0) v.items.splice(k, 1); else v.items.push(it);
        UI.renderPM(); run();
      }
    };
    function apply(keep) {
      if (!v.items.length) { UI.toast('Select the geometry to project.'); return false; }
      var geo = projectItems(v.items, Fa);
      if (!geo.length) { UI.toast('That geometry is square to the sketch plane: it projects to points.'); return false; }
      var dest = f, added = [], moved = 0, P = v.to === 'depth' ? depthPlane(f, Fa, +v.depth || 0) : null;
      var r = oneStep(function () {
        var A = translate(0, 0);
        if (P && Math.abs(+v.depth || 0) > 1e-12) {
          var D = destination({ frame: P.frame, ref: P.ref }, f.id, false);
          dest = D.sketch || newSketch(D.ref);
          A = frameMap(P.frame, D.frame);
        }
        var n0 = dest.entities.length;
        geo.forEach(function (e) { mapEntity(e, A).forEach(function (o) { dest.entities.push(o); }); });
        for (var k = n0; k < dest.entities.length; k++) added.push(k);
        if (v.mode === 'move') {
          var by = {};
          v.items.forEach(function (it) { if (it.kind === 'sk') (by[it.sketch] = by[it.sketch] || []).push(it.index); });
          Object.keys(by).forEach(function (id) { var g = feature(+id); if (g) { deleteEntities(g, by[id]); moved += by[id].length; } });
        }
        return { ok: true };
      });
      if (!r.ok) { UI.toast(r.error || 'That could not be done.'); return false; }
      clearPreview();
      v.items = [];
      refreshSketch();
      var ell = 0;
      added.forEach(function (i) { if (/ellipse/.test(dest.entities[i].t)) ell++; });
      var msg = 'Projected ' + ents(added.length) + ' onto ' + (dest === f ? 'the sketch plane' : dest.name + ' (depth ' + fmt(+v.depth) + ')') + (ell ? ', ' + plural(ell, 'ellipse', 'ellipses') + ' (circles on a tilted plane)' : '') + (moved ? '; ' + ents(moved) + ' moved out of their sketches' : '') + '.';
      if (dest === f) finish(added, msg);
      else if (!keep && v.edit) openSketchAfter(dest.id, added, msg);
      else finish(null, msg);
      return true;
    }
    UI.openPM({
      title: 'Project', icon: 'convert', values: v, command: cmd, transform: 'project',
      message: 'Projects entities of other sketches and model edges or faces square onto this sketch\'s plane (To plane) or onto the parallel plane at a depth (To depth). Circles on a tilted plane become exact ellipses.',
      extraActions: okPlus(apply, function () { keep('project', v, PK); }),
      groups: [
        { title: 'Entities to Project', fields: [{ type: 'pick', icon: 'convert', placeholder: 'Click sketch entities, edges or faces…', value: function (x) { return x.items.length ? plural(x.items.length, 'item', 'items') : ''; },
          items: function (x) { return x.items.map(function (it) { return { label: label(it) }; }); },
          onRemove: function (x, i) { x.items.splice(i, 1); UI.renderPM(); run(); }, onClear: function (x) { x.items.length = 0; UI.renderPM(); run(); } }] },
        { title: 'Method', fields: [modeField([['move', 'Move'], ['copy', 'Copy']]), { type: 'static', label: '', value: function (x) { return x.mode === 'move' ? 'Move takes sketch entities out of their sketch; model edges stay.' : ''; } }] },
        { title: 'Projection', fields: [
          { type: 'radio', key: 'to', options: [['plane', 'To plane (this sketch)'], ['depth', 'To depth']], rerender: true },
          { type: 'number', label: 'Depth', key: 'depth', unit: 'u', show: function (x) { return x.to === 'depth'; } },
          { type: 'check', label: 'Edit the depth sketch after ✓', key: 'edit', show: function (x) { return x.to === 'depth'; } }
        ] }
      ],
      onChange: run,
      okBlocked: function () { return v.items.length ? '' : 'Select the geometry to project.'; },
      onOK: function () { var ok = apply(false); if (ok !== false) keep('project', v, PK); return ok; },
      onCancel: function () { cancelled('Project'); },
      onClose: function () { App.tempEntities = []; UI.updateTemp(); }
    });
    UI.setStatus('Click entities of other sketches, model edges or faces to project them onto ' + f.name + '.');
  }

  // ------------------------------------------------------------------ Roll: Unroll and Roll
  // Mastercam: Transform ▸ Roll wraps flat geometry round a cylinder (Roll) or flattens geometry lying on one (Unroll).
  // Unroll: pick a cylindrical face (or a circular edge of one); every edge on that face (the ends, the holes, slots and
  // cut lines of a tube) is laid flat: arc length s = R·θ from the seam (Seam angle, Direction), along the axis z.
  // Circular edges square to the axis come out as exact lines (s from R·θ0 to R·θ1), lines along the axis as lines,
  // other edges (a hole's saddle-shaped outline) as splines through their unrolled points. A full tube gets its two
  // seam lines so the blank closes. Into the open sketch, or outside a sketch into a new sketch on the chosen plane.
  // Roll: Anvil's sketches are flat (it holds no 3D curves and its Wrap feature is not built), so the rolled geometry
  // is the wrap seen square to the sketch: each point at distance x from the roll axis goes to R·sin(x / R) (lines along
  // the axis stay lines, the rest become splines through the mapped points).
  function cylOfFace(fi) {
    var f = App.mesh && App.mesh.faces[fi];
    if (!f) return null;
    var s = f.polys && f.polys[0] && f.polys[0].surf && f.polys[0].surf.s;
    var grp = UI.faceGroup ? UI.faceGroup(fi) : [fi];
    if (!s) grp.some(function (i) { var g = App.mesh.faces[i], q = g && g.polys && g.polys[0] && g.polys[0].surf && g.polys[0].surf.s; if (q) s = q; return !!q; });
    if (s && s.t === 'cyl') return { o: s.o.slice(), d: V.norm(s.d), r: s.r, faces: grp };
    if (s) return null;
    // a worker build: the axis and radius of a circular edge on the face
    var c = null;
    (App.edges || []).some(function (e) {
      if (e.curve == null || !App.curves || !App.curves[e.curve] || !e.faces.some(function (x) { return grp.indexOf(x) >= 0; })) return false;
      c = App.curves[e.curve].curve; return true;
    });
    var wc = App.mesh.workerCurves, key = wc && wc.key0 && wc.key0[fi];
    if (!key || !/^cyl:/.test(key)) return null;
    if (c) return { o: c.center.slice(), d: V.norm(c.normal), r: c.radius, faces: grp };
    var m = key.split(':'), o = m[1].split(',').map(function (x) { return +x / 1e6; }), d = m[2].split(',').map(function (x) { return +x / 1e6; });
    return { o: o, d: V.norm(d), r: +m[3] / 1e6, faces: grp };
  }
  function cylOfEdge(e) {
    for (var k = 0; k < e.faces.length; k++) { var c = cylOfFace(e.faces[k]); if (c) return c; }
    return null;
  }
  // the unroll of cylinder `cyl`'s edges: { entities, full, R, length }
  function unrollGeometry(cyl, o) {
    var d = cyl.d, R = (+o.dia > 0 ? +o.dia : 2 * cyl.r) / 2, sg = o.dir === 'cw' ? -1 : 1;
    var ref = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    var e0 = V.norm(V.sub(ref, V.scale(d, V.dot(ref, d)))), e1 = V.cross(d, e0), TAU = 2 * Math.PI;
    function key(P) { return Math.round(P[0] * 1e6) + ',' + Math.round(P[1] * 1e6) + ',' + Math.round(P[2] * 1e6); }
    function zOf(P) { return V.dot(V.sub(P, cyl.o), d); }
    var edges = (App.edges || []).filter(function (e) { var n = e.faces.filter(function (x) { return cyl.faces.indexOf(x) >= 0; }).length; return n === 1 || (n >= 1 && e.faces.length === 1); });
    // A point where a planar cut meets the cylinder (a window's side, a saw cut) is put back on the true cylinder: on
    // the circle at its height, the angle where the cut plane n·P = w crosses it (A cos φ + B sin φ = C), so the
    // facets do not shift it
    var planesAt = {};
    edges.forEach(function (e) {
      e.faces.forEach(function (fi) {
        if (cyl.faces.indexOf(fi) >= 0 || faceCurved(fi)) return;
        var F = App.mesh.faces[fi];
        if (!F || !F.normal || Math.abs(V.dot(F.normal, d)) > 1 - 1e-9) return;
        var w = isFinite(F.w) ? F.w : F.centroid ? V.dot(F.normal, F.centroid) : NaN;
        if (!isFinite(w)) return;
        [e.a, e.b].forEach(function (P) { var k = key(P); (planesAt[k] = planesAt[k] || []).push({ n: F.normal, w: w }); });
      });
    });
    function phiOf(P) {
      var v = V.sub(P, cyl.o), z = V.dot(v, d), rho = V.sub(v, V.scale(d, z)), phi = Math.atan2(V.dot(rho, e1), V.dot(rho, e0)), pl = planesAt[key(P)];
      if (pl) {
        var n = pl[0].n, A = cyl.r * V.dot(n, e0), B = cyl.r * V.dot(n, e1), H = Math.hypot(A, B), C = pl[0].w - V.dot(n, cyl.o) - V.dot(n, d) * z;
        if (H > 1e-12 && Math.abs(C) <= H * (1 + 1e-12)) {
          var c0 = Math.atan2(B, A), dd = Math.acos(Math.max(-1, Math.min(1, C / H))), best = phi, bd = 0.05;
          [c0 + dd, c0 - dd].forEach(function (q) { var diff = Math.abs(Math.atan2(Math.sin(q - phi), Math.cos(q - phi))); if (diff < bd) { bd = diff; best = q; } });
          phi = best;
        }
      }
      return phi;
    }
    function rawTheta(P) { return sg * phiOf(P); }
    // seam: a full tube starts at the Seam angle; a partial face (a bend) starts where it starts
    var ths = [], zs = [];
    edges.forEach(function (e) { [e.a, e.b].forEach(function (P) { ths.push(rawTheta(P)); zs.push(zOf(P)); }); });
    var full = false, base = 0;
    var curves = {};
    edges.forEach(function (e) { var c = e.curve != null && App.curves && App.curves[e.curve]; if (c && c.curve && c.curve.a1 - c.curve.a0 >= TAU - 1e-9) full = true; if (c) curves[e.curve] = c; });
    if (!full && ths.length) {
      var srt = ths.map(function (t) { t = t % TAU; return t < 0 ? t + TAU : t; }).sort(function (a, b) { return a - b; }), gap = srt[0] + TAU - srt[srt.length - 1], at = srt[0];
      for (var i = 1; i < srt.length; i++) if (srt[i] - srt[i - 1] > gap) { gap = srt[i] - srt[i - 1]; at = srt[i]; }
      if (gap < 1e-6) full = true; else base = at;
    }
    if (full) base = sg * (+o.seam || 0) * D2R;
    function theta(P) { var t = (rawTheta(P) - base) % TAU; if (t < 0) t += TAU; return t > TAU - 1e-12 ? 0 : t; }
    var z0 = zs.length ? Math.min.apply(null, zs) : 0, z1 = zs.length ? Math.max.apply(null, zs) : 0;
    function flat(s, z) { var y = z - z0; return o.axis === 'x' ? [td(+o.ox + y), td(+o.oy + s)] : [td(+o.ox + s), td(+o.oy + y)]; }
    function line(a, b) { return { t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }; }
    // circles square to the axis (the ends, a window's top and bottom): one line each, from R·θ to R·θ of its ends
    var out = [], byCurve = {}, circles = [], rest = [];
    edges.forEach(function (e) {
      var c = e.curve != null && curves[e.curve];
      if (c && c.curve && Math.abs(Math.abs(V.dot(c.curve.normal, d)) - 1) < 1e-9) (byCurve[e.curve] = byCurve[e.curve] || []).push(e);
      else rest.push(e);
    });
    Object.keys(byCurve).forEach(function (ci) {
      var C = curves[ci].curve, z = zOf(C.center);
      circles.push({ z: z, r: C.radius });
      if (C.a1 - C.a0 >= TAU - 1e-9) { out.push(line(flat(0, z), flat(TAU * R, z))); return; }
      var t = [];
      byCurve[ci].forEach(function (e) { t.push(theta(e.a), theta(e.b)); });
      t.sort(function (a, b) { return a - b; });
      var gi = 0, gap = t[0] + TAU - t[t.length - 1];   // the largest gap between the ends is where the arc is not
      for (var k = 1; k < t.length; k++) if (t[k] - t[k - 1] > gap) { gap = t[k] - t[k - 1]; gi = k; }
      if (gi === 0) out.push(line(flat(R * t[0], z), flat(R * t[t.length - 1], z)));
      else { out.push(line(flat(R * t[gi], z), flat(TAU * R, z))); out.push(line(flat(0, z), flat(R * t[gi - 1], z))); }
    });
    // chords of those circles that their records leave out are drawn already
    rest = rest.filter(function (e) {
      return !circles.some(function (c) { return [e.a, e.b].every(function (P) { var v = V.sub(P, cyl.o), z = V.dot(v, d); return Math.abs(z - c.z) < 1e-7 && Math.abs(V.len(V.sub(v, V.scale(d, z))) - c.r) < 1e-6 * Math.max(1, c.r); }); });
    });
    // the other edges, chained end to end, unrolled point by point (θ kept continuous along a chain)
    var used = [];
    rest.forEach(function (e0) {
      if (used.indexOf(e0) >= 0) return;
      used.push(e0);
      var chain = [e0.a, e0.b];
      for (var grow = true; grow;) {
        grow = false;
        for (var k = 0; k < rest.length; k++) {
          var e = rest[k];
          if (used.indexOf(e) >= 0) continue;
          var hk = key(chain[chain.length - 1]), tk = key(chain[0]);
          if (key(e.a) === hk) { chain.push(e.b); } else if (key(e.b) === hk) { chain.push(e.a); }
          else if (key(e.b) === tk) { chain.unshift(e.a); } else if (key(e.a) === tk) { chain.unshift(e.b); }
          else continue;
          used.push(e); grow = true;
        }
      }
      var closed = chain.length > 3 && key(chain[0]) === key(chain[chain.length - 1]);
      if (closed) chain.pop();
      var prev = null, pts = chain.map(function (P) {
        var t = theta(P);
        if (prev != null) { while (t - prev > Math.PI) t -= TAU; while (t - prev < -Math.PI) t += TAU; }
        prev = t;
        return { s: R * t, z: zOf(P) };
      });
      var minS = Math.min.apply(null, pts.map(function (p) { return p.s; }));
      if (minS < -1e-9) pts.forEach(function (p) { p.s += TAU * R; });
      var fl = pts.map(function (p) { return flat(p.s, p.z); });
      // straight (a line along the axis, a chain of collinear chords): a line from end to end
      var A = fl[0], B = fl[fl.length - 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      var straight = !closed && L > 1e-9 && fl.every(function (p) { return Math.abs((B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0])) / L < 1e-7; });
      if (straight) out.push(line(A, B));
      else if (fl.length >= 2) out.push(closed ? { t: 'spline', pts: fl, closed: true } : fl.length === 2 ? line(A, B) : { t: 'spline', pts: fl });
    });
    if (full && o.seamLines && zs.length) { out.push(line(flat(0, z0), flat(0, z1))); out.push(line(flat(TAU * R, z0), flat(TAU * R, z1))); }
    return { entities: out.map(tidyEnt), full: full, R: R, length: z1 - z0 };
  }
  // the roll of flat entity e round a cylinder of radius R whose axis runs along the sketch's x or y through `at`,
  // seen square to the sketch
  function rollEntity(e, o) {
    var R = (+o.dia || 0) / 2, sg = o.dir === 'cw' ? -1 : 1, ax = o.rollAxis === 'x', c0 = ax ? +o.ay : +o.ax;
    function m(p) {
      var u = ax ? p[1] : p[0], w = c0 + sg * R * Math.sin(sg * (u - c0) / R);
      return ax ? [td(p[0]), td(w)] : [td(w), td(p[1])];
    }
    if (e.t === 'point') { var q = m([e.x, e.y]); return [carry(e, { t: 'point', x: q[0], y: q[1] })]; }
    var out = [];
    polylinesOf(e).forEach(function (l) {
      var src = l.pts;
      // a fine sampling: each chord at most R / 16 long, so the splines follow the sine
      var dense = [], n = src.length, segs = l.closed ? n : n - 1;
      for (var k = 0; k < segs; k++) {
        var a = src[k], b = src[(k + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.max(1, Math.min(64, Math.ceil(L / (R / 16))));
        for (var j = 0; j < steps; j++) dense.push([a[0] + (b[0] - a[0]) * j / steps, a[1] + (b[1] - a[1]) * j / steps]);
      }
      if (!l.closed) dense.push(src[n - 1]);
      var pts = dense.map(m);
      var A = pts[0], B = pts[pts.length - 1], LL = Math.hypot(B[0] - A[0], B[1] - A[1]);
      if (!l.closed && LL > 1e-9 && pts.every(function (p) { return Math.abs((B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0])) / LL < 1e-9; })) {
        // collinear (a line along the axis, or across it inside a quarter turn): the line from end to end, folded
        // back where the roll passes a quarter turn
        var t = function (p) { return ((p[0] - A[0]) * (B[0] - A[0]) + (p[1] - A[1]) * (B[1] - A[1])) / LL; }, lo = 0, hi = LL, lp = A, hp = B;
        pts.forEach(function (p) { var s = t(p); if (s < lo) { lo = s; lp = p; } if (s > hi) { hi = s; hp = p; } });
        out.push(carry(e, { t: 'line', x1: lp[0], y1: lp[1], x2: hp[0], y2: hp[1] }));
        return;
      }
      if (l.closed && pts.length > 2) out.push(carry(e, { t: 'spline', pts: pts, closed: true }));
      else if (pts.length >= 2) out.push(carry(e, { t: 'spline', pts: pts }));
    });
    return out;
  }
  function cmdTRoll() {
    var f = App.mode === 'sketch' ? UI.activeSketchFeature() : null;
    var v = recall('roll', { op: 'unroll', mode: 'copy', cyl: null, cylLabel: '', dia: 0, seam: 0, dir: 'ccw', axis: 'y', ox: 0, oy: 0, seamLines: true, plane: 'Front', edit: true,
      entities: f ? selIdx(f) : [], rollAxis: 'y', ax: 0, ay: 0, box: 'cyl' }, ['op', 'mode', 'dir', 'axis', 'seamLines', 'rollAxis', 'edit']);
    if (f && v.entities.length) v.op = 'roll';
    var cmd = {};
    function pickCyl(mx, my) {
      var ed = UI.pickEdge ? UI.pickEdge(mx, my) : null, c = null, lab = '';
      if (ed && ed.edge && ed.edge.curve != null) { c = cylOfEdge(ed.edge); lab = 'Edge<' + (ed.index + 1) + '>'; }
      if (!c) { var fc = UI.pickFace ? UI.pickFace(mx, my) : null; if (fc && fc.index != null) { c = cylOfFace(fc.index); lab = 'Face<' + (fc.index + 1) + '>'; } }
      if (!c) { UI.setStatus('Pick a cylindrical face (or a circular edge of one).'); return false; }
      v.cyl = c; v.cylLabel = lab + ' Ø' + fmt(2 * c.r); v.dia = td(2 * c.r);
      UI.renderPM(); run();
      UI.setStatus('Unroll: ' + v.cylLabel + '. ✓ lays its edges flat.');
      return true;
    }
    v.setBox = function (b) {
      v.box = b;
      if (f) cmd.onSketchPoint = b === 'cyl' && v.op === 'unroll' ? function (uv, mx, my) { pickCyl(mx, my); } : b === 'axis' ? function (uv, mx, my) { var p = snapPoint(f, uv, mx, my); v.ax = td(p[0]); v.ay = td(p[1]); v.setBox('entities'); run(); } : null;
      else { cmd.onPick = function (pk) { var c = null; if (pk.kind === 'edge' && pk.edge) c = cylOfEdge(pk.edge); else if (pk.kind === 'face') c = cylOfFace(pk.index); if (!c) { UI.setStatus('Pick a cylindrical face (or a circular edge of one).'); return true; } v.cyl = c; v.cylLabel = (pk.kind === 'edge' ? 'Edge' : 'Face<' + (pk.index + 1) + '>') + ' Ø' + fmt(2 * c.r); v.dia = td(2 * c.r); UI.renderPM(); run(); return true; }; cmd.pickEdges = true; }
      UI.renderPM();
    };
    function opts() { return { dia: v.dia, seam: v.seam, dir: v.dir, axis: v.axis, ox: v.ox, oy: v.oy, seamLines: v.seamLines, rollAxis: v.rollAxis, ax: v.ax, ay: v.ay }; }
    function result() {
      if (v.op === 'unroll') return v.cyl ? unrollGeometry(v.cyl, opts()).entities : null;
      if (!f || !v.entities.length || !(+v.dia > 0)) return null;
      var out = [];
      v.entities.forEach(function (i) { out = out.concat(rollEntity(f.entities[i], opts())); });
      return out;
    }
    function run() { if (!f) return; var r = null; try { r = result(); } catch (e) { r = null; } preview(r || []); }
    function apply(keep) {
      if (v.op === 'roll' && !f) { UI.toast(MSG); return false; }
      var geo = result();
      if (!geo || !geo.length) { UI.toast(v.op === 'unroll' ? 'Pick the cylindrical face to unroll.' : 'Select the sketch entities to roll and set the diameter.'); return false; }
      var dest = f, added = [], dropped = 0;
      var r = oneStep(function () {
        if (!dest) dest = newSketch({ ref: v.plane, offset: 0 });
        var n0 = dest.entities.length;
        geo.forEach(function (e) { dest.entities.push(e); });
        for (var k = n0; k < dest.entities.length; k++) added.push(k);
        if (v.op === 'roll' && v.mode === 'move') {
          dropped = deleteEntities(f, v.entities);
          added = added.map(function (k) { return k - v.entities.length; });
        }
        return { ok: true };
      });
      if (!r.ok) { UI.toast(r.error || 'That could not be done.'); return false; }
      clearPreview();
      if (v.op === 'roll') v.entities = v.mode === 'move' ? added.slice() : v.entities;
      refreshSketch();
      var msg;
      if (v.op === 'unroll') {
        var g = unrollGeometry(v.cyl, opts());
        msg = 'Unrolled ' + ents(added.length) + ' from Ø' + fmt(2 * g.R) + ': flat length ' + fmt(2 * Math.PI * g.R) + (g.full ? '' : ' (partial face)') + ' × ' + fmt(g.length) + (dest !== f ? ' into ' + dest.name : '') + '.';
      } else msg = 'Rolled ' + ents(added.length) + ' round Ø' + fmt(+v.dia) + ', projected onto the sketch plane (Anvil sketches are flat)' + (dropped ? '; ' + plural(dropped, 'relation', 'relations') + ' dropped' : '') + '.';
      if (dest === f) finish(added, msg);
      else if (!keep && v.edit && dest) { var id = dest.id; UI.setStatus(msg); UI.afterRebuild(UI.rebuild(), function () { UI.enterSketch(id); refreshSketch(); setSel(added); UI.setStatus(msg); }); }
      else { UI.rebuild(); UI.setStatus(msg); }
      return true;
    }
    var groups = [
      { title: 'Roll / Unroll', fields: [{ type: 'radio', key: 'op', options: [['roll', 'Roll (wrap flat geometry round a cylinder)'], ['unroll', 'Unroll (lay a cylinder\'s edges flat)']], rerender: true }] },
      { title: 'Cylinder', show: function (x) { return x.op === 'unroll'; }, fields: [
        { type: 'pick', icon: 'faceSel', placeholder: 'Pick a cylindrical face or a circular edge', value: function (x) { return x.cylLabel; }, active: function (x) { return x.box === 'cyl'; }, onActivate: function () { v.setBox('cyl'); } },
        { type: 'number', label: 'Diameter', key: 'dia', unit: 'u', min: 0 },
        { type: 'number', label: 'Seam angle', key: 'seam', unit: '°' },
        { type: 'radio', key: 'dir', options: [['ccw', 'Counterclockwise about the axis'], ['cw', 'Clockwise']] },
        { type: 'check', label: 'Seam lines (close the blank of a full tube)', key: 'seamLines' }
      ] },
      { title: 'Flat Position', show: function (x) { return x.op === 'unroll'; }, fields: [
        { type: 'radio', key: 'axis', options: [['y', 'Axis along Y (arc length along X)'], ['x', 'Axis along X (arc length along Y)']] },
        { type: 'number', label: 'X', key: 'ox', unit: 'u' }, { type: 'number', label: 'Y', key: 'oy', unit: 'u' },
        { type: 'select', label: 'Plane', key: 'plane', options: [['Front', 'Front Plane'], ['Top', 'Top Plane'], ['Right', 'Right Plane']], show: function () { return !f; } },
        { type: 'check', label: 'Edit the new sketch after ✓', key: 'edit', show: function () { return !f; } }
      ] },
      { title: 'Entities to Roll', show: function (x) { return x.op === 'roll'; }, fields: [f ? entityBox(f, v, run) : { type: 'static', label: '', value: MSG }, modeField([['move', 'Move'], ['copy', 'Copy']])] },
      { title: 'Roll Parameters', show: function (x) { return x.op === 'roll'; }, fields: [
        { type: 'number', label: 'Diameter', key: 'dia', unit: 'u', min: 0 },
        { type: 'radio', key: 'rollAxis', options: [['y', 'Axis along Y'], ['x', 'Axis along X']] },
        { type: 'pick', icon: 'point', placeholder: 'Axis position', value: function (x) { return 'Axis through ' + fmtPt([x.ax, x.ay]); }, active: function (x) { return x.box === 'axis'; }, onActivate: function () { v.setBox('axis'); } },
        { type: 'number', label: 'Axis X', key: 'ax', unit: 'u' }, { type: 'number', label: 'Axis Y', key: 'ay', unit: 'u' },
        { type: 'static', label: '', value: 'Anvil holds flat sketches only: the rolled geometry is the wrap seen square to the sketch plane.' }
      ] }
    ];
    UI.openPM({
      title: 'Roll', icon: 'wrap', values: v, command: cmd, transform: 'roll',
      message: 'Unroll lays the edges of a cylindrical face flat (arc length R·θ along the circumference); Roll wraps flat sketch geometry round a cylinder.',
      onSelection: f ? syncSelection(f, v, run) : undefined,
      onEntityPick: f ? function () { return v.box !== 'entities'; } : undefined,
      extraActions: okPlus(apply, function () { keep('roll', v, ['op', 'mode', 'dir', 'axis', 'seamLines', 'rollAxis', 'edit']); }),
      groups: groups,
      onChange: function (x, key) {
        if (key === 'op') { if (v.op === 'roll' && !f) { UI.toast(MSG); v.op = 'unroll'; UI.renderPM(); return; } if (v.op === 'roll' && !(+v.dia > 0)) v.dia = UI.lenDefault ? UI.lenDefault(50) : 50; v.setBox(v.op === 'unroll' ? 'cyl' : 'entities'); }
        run();
      },
      okBlocked: function () { return v.op === 'unroll' ? (v.cyl ? '' : 'Pick the cylindrical face to unroll.') : !v.entities.length ? 'Select the entities to roll.' : !(+v.dia > 0) ? 'Set the diameter.' : ''; },
      onOK: function () { var ok = apply(false); if (ok !== false) keep('roll', v, ['op', 'mode', 'dir', 'axis', 'seamLines', 'rollAxis', 'edit']); return ok; },
      onCancel: function () { cancelled('Roll'); },
      onClose: function () { App.tempEntities = []; UI.updateTemp(); }
    });
    if (v.op === 'roll' && !(+v.dia > 0)) v.dia = UI.lenDefault ? UI.lenDefault(50) : 50;
    v.setBox(v.op === 'unroll' ? 'cyl' : 'entities');
    UI.setStatus(v.op === 'unroll' ? 'Pick the cylindrical face (or a circular edge) to unroll.' : 'Set the diameter and the axis, then ✓ to roll the selection.');
    run();
  }

  // ------------------------------------------------------------------ Stretch
  // Mastercam: Transform ▸ Stretch: window the region (what lies inside moves, what crosses the window stretches),
  // then translate it by Delta X / Y or From / To points. The window is a box dragged in the graphics area (right to
  // left: crossing) before or while the function is open; entities picked one by one move whole and what is joined to
  // them stretches. SketchSolver.stretchEntities does the work (relations kept).
  function cmdTStretch() {
    var f = needSketch();
    if (!f) return;
    var v = recall('stretch', { entities: selIdx(f), mode: 'delta', dx: 0, dy: 0, from: null, to: null, box: 'entities' }, ['mode']);
    var cmd = {};
    function win() { var b = UI.lastSketchBox; return b && b.sketch === f.id && b.sel.join() === v.entities.join() ? b : null; }
    function xf(to) {
      if (v.mode === 'delta') return { dx: +v.dx || 0, dy: +v.dy || 0 };
      var t = to || v.to;
      return v.from && t ? { dx: t[0] - v.from[0], dy: t[1] - v.from[1] } : null;
    }
    function previewWith(x) {
      if (!x || !v.entities.length) { preview([]); return; }
      var g = JSON.parse(JSON.stringify({ entities: f.entities, rels: f.rels, dims: f.dims, blocks: f.blocks })), b = win();
      var r = b ? S.stretchEntities(g, v.entities, b.poly, x) : S.stretchEntities(g, v.entities, null, x);
      if (!r.ok) { preview([]); return; }
      var same = g.entities.length === f.entities.length;
      preview(g.entities.filter(function (e, i) { return same ? JSON.stringify(e) !== JSON.stringify(f.entities[i]) : r.entities.indexOf(i) >= 0; }));
    }
    function run() { previewWith(xf()); }
    v.setBox = function (b) {
      v.box = b;
      cmd.onSketchPoint = b === 'from' || b === 'to' ? function (uv, mx, my) {
        var p = snapPoint(f, uv, mx, my);
        if (v.box === 'from') { v.from = p; v.setBox('to'); return; }
        v.to = p; v.setBox('entities'); run();
      } : null;
      cmd.onSketchMove = b === 'to' ? function (uv, mx, my) { previewWith(xf(snapPoint(f, uv, mx, my))); } : null;
      UI.renderPM();
      UI.setStatus(b === 'from' ? 'Click the From point.' : b === 'to' ? 'Click the To point.' : 'Drag a window over the points to stretch (right to left: crossing), then set the translation.');
    };
    function apply(keep) {
      var x = xf();
      if (!v.entities.length) { UI.toast('Window the geometry to stretch first.'); return false; }
      if (!x) { UI.toast('Click the From and To points, or set Delta X / Y.'); return false; }
      var b = win(), sel = v.entities.slice();
      UI.pushUndo(); App.sketchDirty = true;
      var r;
      try { r = S.stretchEntities(f, sel, b ? b.poly : null, x); } catch (e) { r = { ok: false, error: e.message }; }
      if (!r || !r.ok) { App.undo.pop(); UI.toast((r && r.error) || 'That could not be done.'); return false; }
      clearPreview(); refreshSketch();
      v.entities = r.entities.slice().sort(function (p, q) { return p - q; });
      // the window goes with the geometry, so ✓+ stretches the same region again
      UI.lastSketchBox = b ? { sketch: f.id, mode: b.mode, poly: b.poly.map(function (p) { return [p[0] + x.dx, p[1] + x.dy]; }), sel: v.entities.slice() } : null;
      if (keep && v.mode === 'points') { v.from = null; v.to = null; }
      finish(v.entities, 'Stretched: ' + (b ? plural(r.moved || 0, 'point', 'points') + ' in the window moved' : ents(r.entities.length) + ' moved') + ' by (' + fmt(x.dx) + ', ' + fmt(x.dy) + ').');
      return true;
    }
    UI.openPM({
      title: 'Stretch', icon: 'stretchEnt', values: v, command: cmd, transform: 'stretch',
      message: 'Window the region to stretch (drag a box; right to left is a crossing window): what lies inside moves, what crosses the window stretches. Then translate by Delta X / Y or From / To.',
      onSelection: syncSelection(f, v, run),
      onEntityPick: function () { return v.box !== 'entities'; },
      extraActions: okPlus(apply, function () { keep('stretch', v, ['mode']); }),
      groups: [
        { title: 'Window', fields: [entityBox(f, v, run, 'Drag a window over the geometry…'), { type: 'static', label: '', value: function () { var b = win(); return b ? (b.mode === 'crossing' ? 'Crossing' : 'Window') + ' region set: the points inside move.' : 'No window: the selection moves whole, joined geometry stretches.'; } }] },
        { title: 'Translate', fields: [
          { type: 'radio', key: 'mode', options: [['delta', 'Delta X / Y'], ['points', 'From / To points']], rerender: true },
          { type: 'number', label: 'Delta X', key: 'dx', unit: 'u', show: function (x) { return x.mode === 'delta'; } },
          { type: 'number', label: 'Delta Y', key: 'dy', unit: 'u', show: function (x) { return x.mode === 'delta'; } },
          { type: 'pick', icon: 'point', placeholder: 'From point', value: function (x) { return x.from ? 'From ' + fmtPt(x.from) : ''; }, show: function (x) { return x.mode === 'points'; }, active: function (x) { return x.box === 'from'; }, onActivate: function () { v.from = null; v.to = null; v.setBox('from'); } },
          { type: 'static', label: 'To', value: function (x) { return x.to ? fmtPt(x.to) : '—'; }, show: function (x) { return x.mode === 'points'; } }
        ] }
      ],
      onChange: function (x, key) { if (key === 'mode') { v.from = null; v.to = null; if (v.mode === 'points') v.setBox('from'); else v.setBox('entities'); } run(); },
      okBlocked: function () { return !v.entities.length ? 'Window the geometry to stretch.' : !xf() ? 'Click the From and To points, or use Delta X / Y.' : ''; },
      onOK: function () { var ok = apply(false); if (ok !== false) keep('stretch', v, ['mode']); return ok; },
      onCancel: function () { cancelled('Stretch'); },
      onClose: function () { App.tempEntities = []; UI.updateTemp(); }
    });
    v.setBox('entities');
    run();
  }

  // ------------------------------------------------------------------ Scale
  // Mastercam: Transform ▸ Scale: Uniform or XYZ (X / Y factors here: sketches are flat), about the origin, a picked
  // point or the selection's centre, as a factor or a percentage; Move, Copy (each copy scaled again from the one
  // before) or Join (the copies plus lines joining the matching ends of each generation). Uniform scaling keeps
  // entity types (SketchSolver.transformEntities); XYZ turns circles into ellipses and rectangles into polylines.
  function endPoints(e) {
    switch (e.t) {
      case 'line': return [[e.x1, e.y1], [e.x2, e.y2]];
      case 'point': return [[e.x, e.y]];
      case 'arc': return [[e.cx + e.r * Math.cos(e.a0 * D2R), e.cy + e.r * Math.sin(e.a0 * D2R)], [e.cx + e.r * Math.cos(e.a1 * D2R), e.cy + e.r * Math.sin(e.a1 * D2R)]];
      case 'polyline': return e.pts.map(function (p) { return [p[0], p[1]]; });
      case 'spline': return e.closed ? [] : [e.pts[0], e.pts[e.pts.length - 1]].map(function (p) { return [p[0], p[1]]; });
      case 'rect': case 'crect': case 'poly': { var l = polylinesOf(e)[0]; return l ? l.pts.map(function (p) { return [p[0], p[1]]; }) : []; }
      default: return [];
    }
  }
  var KEEP_AFFINE = { coincident: 1, horizontal: 1, vertical: 1, collinear: 1, parallel: 1, midpoint: 1 };
  function cmdTScale() {
    var f = needSketch();
    if (!f) return;
    var SK = ['mode', 'count', 'kind', 'units', 's', 'sx', 'sy', 'about'];
    var v = recall('scale', { entities: selIdx(f), mode: 'move', count: 1, kind: 'uniform', units: 'factor', s: 1, sx: 1, sy: 1, about: 'origin', px: 0, py: 0, box: 'entities' }, SK);
    var cmd = {};
    function factor(x) { return v.units === 'percent' ? (+x || 0) / 100 : +x || 0; }
    function centre() {
      if (v.about === 'point') return [+v.px || 0, +v.py || 0];
      if (v.about === 'centre') {
        var mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
        v.entities.forEach(function (i) { entPts(f.entities[i]).forEach(function (l) { l.forEach(function (p) { mn[0] = Math.min(mn[0], p[0]); mn[1] = Math.min(mn[1], p[1]); mx[0] = Math.max(mx[0], p[0]); mx[1] = Math.max(mx[1], p[1]); }); }); });
        return isFinite(mn[0]) ? [td((mn[0] + mx[0]) / 2), td((mn[1] + mx[1]) / 2)] : [0, 0];
      }
      return [0, 0];
    }
    function factors() { var a = v.kind === 'xyz' ? factor(v.sx) : factor(v.s), b = v.kind === 'xyz' ? factor(v.sy) : a; return [a, b]; }
    function nCopies() { return v.mode === 'move' ? 1 : Math.max(1, v.count | 0); }
    function mapN(n) { var F = factors(), c = centre(), a = Math.pow(F[0], n), b = Math.pow(F[1], n); return aff(a, 0, 0, b, c[0] - a * c[0], c[1] - b * c[1]); }
    function gens() {   // [[entities of copy 1], …]
      var out = [];
      for (var k = 1; k <= nCopies(); k++) { var A = mapN(k), g = []; v.entities.forEach(function (i) { g = g.concat(mapEntity(f.entities[i], A)); }); out.push(g); }
      return out;
    }
    function joinLines() {
      if (v.mode !== 'join') return [];
      var out = [], seen = {};
      v.entities.forEach(function (i) {
        endPoints(f.entities[i]).forEach(function (p) {
          var k = Math.round(p[0] * 1e7) + ',' + Math.round(p[1] * 1e7);
          if (seen[k]) return;
          seen[k] = true;
          for (var c = 1; c <= nCopies(); c++) {
            var a = ap(mapN(c - 1), p), b = ap(mapN(c), p);
            if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-9) out.push(tidyEnt({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }));
          }
        });
      });
      return out;
    }
    function valid() { var F = factors(); return v.entities.length && F[0] > 0 && F[1] > 0; }
    function run() { if (!valid()) { preview([]); return; } var g = []; gens().forEach(function (x) { g = g.concat(x); }); preview(g.concat(joinLines())); }
    v.setBox = function (b) {
      v.box = b;
      cmd.onSketchPoint = b === 'point' ? function (uv, mx, my) { var p = snapPoint(f, uv, mx, my); v.px = td(p[0]); v.py = td(p[1]); v.about = 'point'; v.setBox('entities'); run(); } : null;
      UI.renderPM();
      if (b === 'point') UI.setStatus('Click the point to scale about.');
    };
    function apply(keep) {
      if (!valid()) { UI.toast(v.entities.length ? 'The scale factors must be positive.' : 'Select the entities to scale.'); return false; }
      var F = factors(), c = centre(), uniform = Math.abs(F[0] - F[1]) < 1e-15, sel = v.entities.slice(), result = [], dropped = 0, joins = joinLines();
      var snap = JSON.stringify({ features: App.model.features, nextId: App.model.nextId });
      UI.pushUndo(); App.sketchDirty = true;
      var r = { ok: true };
      try {
        if (uniform && v.mode === 'move') {
          dropped = outsideRelations(f, sel);
          r = S.transformEntities(f, sel, { s: F[0], cx: c[0], cy: c[1] }, { keepRelations: false });
          if (r.ok) result = r.entities.slice();
        } else if (uniform) {
          r = S.transformEntities(f, sel, { s: F[0], cx: c[0], cy: c[1] }, { copy: true, count: nCopies(), keepRelations: true });
          if (r.ok) result = r.added.slice();
        } else if (v.mode === 'move') {
          // XYZ, Move: each entity replaced by its image (a circle by an ellipse …); relations to the rest dropped, those
          // among the selection that an axis scaling keeps (coincident, horizontal, vertical, parallel …) kept
          dropped = outsideRelations(f, sel);
          var A = mapN(1), extra = [], set = {}, typeKept = {};
          sel.forEach(function (i) {
            set[i] = true;
            var m = mapEntity(f.entities[i], A);
            if (!m.length) throw new Error('Entity ' + (i + 1) + ' cannot be scaled.');
            typeKept[i] = m.length === 1 && m[0].t === f.entities[i].t;
            f.entities[i] = m[0];
            m.slice(1).forEach(function (o) { extra.push(o); });
          });
          if (f.rels) {
            f.rels = f.rels.filter(function (rel) {
              var es = rel.refs.map(function (x) { var mm = /^(\d+)/.exec(String(x)); return mm ? +mm[1] : -1; });
              if (!es.some(function (e) { return set[e]; })) return true;
              return KEEP_AFFINE[rel.type] && es.every(function (e) { return set[e] && typeKept[e]; });
            });
            if (!f.rels.length) delete f.rels;
          }
          if (f.dims) { f.dims = f.dims.filter(function (d) { return !set[d.e]; }); if (!f.dims.length) delete f.dims; }
          result = sel.slice();
          extra.forEach(function (o) { f.entities.push(o); result.push(f.entities.length - 1); });
        } else {
          gens().forEach(function (g) { g.forEach(function (o) { f.entities.push(o); result.push(f.entities.length - 1); }); });
        }
        if (r.ok) joins.forEach(function (o) { f.entities.push(o); result.push(f.entities.length - 1); });
      } catch (e) { r = { ok: false, error: e.message }; }
      if (!r.ok) { App.undo.pop(); restoreModel(snap); UI.toast(r.error || 'That could not be done.'); refreshSketch(); return false; }
      clearPreview(); refreshSketch();
      v.entities = result.slice().sort(function (a, b) { return a - b; });
      var what = v.mode === 'move' ? 'Scaled ' + ents(sel.length) : (v.mode === 'join' ? 'Joined: ' : 'Copied: ') + plural(nCopies(), 'copy', 'copies') + ' (' + ents(result.length - joins.length) + (joins.length ? ' + ' + plural(joins.length, 'joining line', 'joining lines') : '') + ')';
      finish(v.entities, what + ' about ' + fmtPt(c) + (uniform ? ' × ' + fmt(F[0]) : ' X × ' + fmt(F[0]) + ', Y × ' + fmt(F[1])) + (dropped ? '; ' + plural(dropped, 'relation', 'relations') + ' to unselected geometry dropped' : '') + '.');
      return true;
    }
    UI.openPM({
      title: 'Scale', icon: 'scaleEnt', values: v, command: cmd, transform: 'scale',
      message: 'Scales the selection uniformly or by X / Y about the origin, a point or the selection centre. Copy scales each copy again from the one before; Join adds lines between the matching ends.',
      onSelection: syncSelection(f, v, run),
      onEntityPick: function () { return v.box !== 'entities'; },
      extraActions: okPlus(apply, function () { keep('scale', v, SK); }),
      groups: [
        { title: 'Entities to Scale', fields: [entityBox(f, v, run)] },
        { title: 'Method', fields: [modeField([['move', 'Move'], ['copy', 'Copy'], ['join', 'Join']]), { type: 'number', label: 'Number of copies', key: 'count', step: 1, min: 1, show: function (x) { return x.mode !== 'move'; } }] },
        { title: 'Scale', fields: [
          { type: 'radio', key: 'kind', options: [['uniform', 'Uniform'], ['xyz', 'XYZ']], rerender: true },
          { type: 'radio', key: 'units', options: [['factor', 'Scale factor'], ['percent', 'Percentage']], rerender: true },
          { type: 'number', label: 'Scale', key: 's', unit: '', min: 0, show: function (x) { return x.kind === 'uniform'; } },
          { type: 'number', label: 'X', key: 'sx', unit: '', min: 0, show: function (x) { return x.kind === 'xyz'; } },
          { type: 'number', label: 'Y', key: 'sy', unit: '', min: 0, show: function (x) { return x.kind === 'xyz'; } }
        ] },
        { title: 'Scale About', fields: [
          { type: 'radio', key: 'about', options: [['origin', 'Origin'], ['point', 'Point'], ['centre', 'Selection centre']], rerender: true },
          { type: 'pick', icon: 'point', placeholder: 'Click the point', value: function (x) { return 'Point ' + fmtPt([x.px, x.py]); }, show: function (x) { return x.about === 'point'; }, active: function (x) { return x.box === 'point'; }, onActivate: function () { v.setBox('point'); } },
          { type: 'number', label: 'X', key: 'px', unit: 'u', show: function (x) { return x.about === 'point'; } },
          { type: 'number', label: 'Y', key: 'py', unit: 'u', show: function (x) { return x.about === 'point'; } }
        ] }
      ],
      onChange: function (x, key) {
        if (key === 'units') { var k = v.units === 'percent' ? 100 : 0.01; v.s = td(v.s * k); v.sx = td(v.sx * k); v.sy = td(v.sy * k); UI.renderPM(); }
        if (key === 'about' && v.about === 'point') v.setBox('point');
        run();
      },
      okBlocked: function () { return !v.entities.length ? 'Select the entities to scale.' : !valid() ? 'The scale factors must be positive.' : ''; },
      onOK: function () { var ok = apply(false); if (ok !== false) keep('scale', v, SK); return ok; },
      onCancel: function () { cancelled('Scale'); },
      onClose: function () { App.tempEntities = []; UI.updateTemp(); }
    });
    v.setBox('entities');
    if (!v.entities.length) UI.setStatus('Select the sketch entities to scale.');
    run();
  }

  UI.cmdTTranslateToPlane = cmdTTranslateToPlane; UI.cmdTProject = cmdTProject; UI.cmdTRoll = cmdTRoll; UI.cmdTStretch = cmdTStretch; UI.cmdTScale = cmdTScale;
  // script / test hooks: the affine entity map, the frame map, the unroll and the roll
  UI.transform3D = { mapEntity: mapEntity, frameMap: frameMap, affine: aff, compose: comp, unroll: unrollGeometry, cylOfFace: cylOfFace, rollEntity: rollEntity, projectItems: projectItems };
})();
