// ui-relations.js — sketch relations in the UI: distance / angle Smart Dimensions between two entities, the entities of
// a hovered / selected relation lit up, the Add Relations and Display/Delete Relations PropertyManagers, and dragging an
// under-defined sketch (every relation holds). rfBR: no relation icons are drawn in the graphics area (Mastercam's);
// the relations are listed, by name, in Display/Delete Relations. The maths is in sketch-solver.js.
(function (UI) {
  'use strict';
  var App = UI.App, K = UI.K, $ = UI.$, el = UI.el, S = window.SketchSolver;
  if (!S) return;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function scr(pl, uv) { return UI.worldToScreen(K.to3D(pl, uv[0], uv[1])); }
  function iconName(type) { return type === 'distance' || type === 'angle' || type === 'offset' ? type : 'rel' + type.charAt(0).toUpperCase() + type.slice(1); }
  var CENTERLESS = /^(rect|slot)$/;   // their centre is not offered as a pick (not a sketch point in SolidWorks); a Polygon's / Center Rectangle's is (r15/snapaudit15, as SketchSolver.inferCandidates)
  function markDirty() { if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; } }
  function refresh() { App.gridStale = true; UI.updateSketches(); UI.refreshTree(); }

  // ------------------------------------------------------------------ picking a ref under the mouse
  // A point (end, centre, corner) within 7 px wins, then the origin, then the entity / rectangle edge under the mouse.
  function pickSketchRef(mx, my) {
    var f = UI.activeSketchFeature();
    if (!f) return null;
    var pl = UI.activePlane(), best = null, bd = 7;
    f.entities.forEach(function (e, i) {
      S.pointRefs(f, i).forEach(function (pr) {
        if (/\.(c|mid)$/.test(pr.ref) && (CENTERLESS.test(e.t) || /\.mid$/.test(pr.ref))) return;
        var s = scr(pl, pr.pt), d = Math.hypot(s[0] - mx, s[1] - my);
        if (d < bd) { bd = d; best = pr.ref; }
      });
    });
    var o = scr(pl, [0, 0]);
    if (Math.hypot(o[0] - mx, o[1] - my) < Math.min(bd, 7)) best = 'O';
    if (best) return best;
    // lane DE: Smart Dimension on a spline handle (shown: Show Spline Handles, or the spline's PropertyManager is open):
    // a tip within 7 px picks the handle ('3.h2'), for an angle to a line (SolidWorks)
    if (App.tool === 'dimension' && UI.splineHandlesShownFor && S.handleLine) {
      var hb = null, hd = 7;
      f.entities.forEach(function (e, i) {
        if (!e || e.t !== 'spline' || e.style || e.conic != null || !UI.splineHandlesShownFor(i)) return;
        e.pts.forEach(function (q, k) {
          var hl = S.handleLine(e, k);
          if (!hl) return;
          [hl.b, [2 * hl.a[0] - hl.b[0], 2 * hl.a[1] - hl.b[1]]].forEach(function (tip) { var s = scr(pl, tip), d = Math.hypot(s[0] - mx, s[1] - my); if (d < hd) { hd = d; hb = i + '.h' + k; } });
        });
      });
      if (hb) return hb;
    }
    var hit = UI.pickEntity(mx, my);
    if (!hit) return null;
    var curves = S.curveRefs(f, hit.index);
    // sketch-refine: Smart Dimension on an open spline (it has no dimension of its own) measures from its ends: the click
    // picks the end nearer the cursor, and a second click on the same spline its other end (end to end)
    var he = f.entities[hit.index];
    if (App.tool === 'dimension' && he && he.t === 'spline' && !he.closed && he.pts.length > 1) {
      var st = App.toolState || {}, e1 = hit.index + '.p1', e2 = hit.index + '.p2', q1 = S.refPoint(f, e1), q2 = S.refPoint(f, e2);
      if (st.pt1 === e1) return e2;
      if (st.pt1 === e2) return e1;
      var s1 = scr(pl, q1), s2 = scr(pl, q2);
      return Math.hypot(s1[0] - mx, s1[1] - my) <= Math.hypot(s2[0] - mx, s2[1] - my) ? e1 : e2;
    }
    if (!curves.length) return String(hit.index);
    if (curves.length === 1) return curves[0];
    var bestC = curves[0], bdc = Infinity;
    curves.forEach(function (c) {
      var L = S.refCurve(f, c);
      if (!L || L.kind !== 'line') return;
      var a = scr(pl, L.a), b = scr(pl, L.b), d = segDist([mx, my], a, b);
      if (d < bdc) { bdc = d; bestC = c; }
    });
    return bestC;
  }
  // p9-sketchfix: a model edge or vertex picked for a Smart Dimension or a relation in a sketch on a face. SolidWorks
  // dimensions to the model directly; here the edge (or vertex) comes into the sketch as reference geometry: projected
  // onto the sketch plane, construction, Fixed, so the dimension or relation has something to hold to and the model
  // edge does not move. One already brought in at the same place is reused. Returns { ref, entity } or null (sketch
  // geometry under the cursor always wins: callers try pickSketchRef first).
  function pickModelRef(mx, my) {
    var f = UI.activeSketchFeature();
    if (!f || App.mode !== 'sketch' || !App.edges || !App.edges.length) return null;
    var pl = UI.activePlane(), v = UI.pickVertex ? UI.pickVertex(mx, my) : null, ent = null;
    function r4(x) { return Math.round(x * 1e6) / 1e6; }
    // rfAK: a facet of a true circle / arc (a hole's rim) lying square to the sketch comes in as that circle / arc, as
    // SolidWorks dimensions to the edge itself (Ø, R, centre distances), not as the one chord under the cursor; the
    // facet corners along it are no vertices (only an arc's ends are)
    var V = K.vec, ed0 = UI.pickEdge ? UI.pickEdge(mx, my) : null, cv0 = ed0 && ed0.edge && ed0.edge.curve != null && App.curves ? App.curves[ed0.edge.curve] : null, C0 = cv0 && cv0.curve;
    var onTrue = !!(C0 && C0.normal && Math.abs(Math.abs(V.dot(C0.normal, pl.n)) - 1) < 1e-6);
    // lane DE2: a circle / arc in a plane tilted to the sketch projects to a true ellipse / partial ellipse (it came in
    // as the one facet line under the cursor); edge-on (square to the sketch) it stays a line
    var onTilt = !!(C0 && C0.normal && C0.radius > 0 && !onTrue && Math.abs(V.dot(C0.normal, pl.n)) > 1e-3);
    if (v && v.point && (onTrue || onTilt)) {
      var arcEnd = C0.a1 - C0.a0 < 2 * Math.PI - 1e-6 && [C0.a0, C0.a1].some(function (u) { var yd0 = V.cross(C0.normal, C0.xdir), P = V.add(C0.center, V.add(V.scale(C0.xdir, Math.cos(u) * C0.radius), V.scale(yd0, Math.sin(u) * C0.radius))); return V.len(V.sub(P, v.point)) < 1e-6 * Math.max(1, C0.radius); });
      if (!arcEnd) v = null;
    }
    if (v && v.point) { var q = K.to2D(pl, v.point); ent = { t: 'point', x: r4(q[0]), y: r4(q[1]) }; }
    else {
      var ed = ed0;
      if (!ed || !ed.edge || !ed.edge.a || !ed.edge.b) return null;
      var C = C0;
      if (onTrue) {
        var cen = K.to2D(pl, C.center), sweep = C.a1 - C.a0;
        if (!(sweep < 2 * Math.PI - 1e-6)) ent = { t: 'circle', cx: r4(cen[0]), cy: r4(cen[1]), r: r4(C.radius) };
        else {
          var yd = V.cross(C.normal, C.xdir), at = function (u) { var q = K.to2D(pl, V.add(C.center, V.add(V.scale(C.xdir, Math.cos(u) * C.radius), V.scale(yd, Math.sin(u) * C.radius)))); return Math.atan2(q[1] - cen[1], q[0] - cen[0]) * 180 / Math.PI; };
          var a0 = V.dot(C.normal, pl.n) > 0 ? at(C.a0) : at(C.a1);
          while (a0 < 0) a0 += 360;
          while (a0 >= 360) a0 -= 360;
          ent = { t: 'arc', cx: r4(cen[0]), cy: r4(cen[1]), r: r4(C.radius), a0: r4(a0), a1: r4(a0 + sweep * 180 / Math.PI) };
        }
      } else if (onTilt) ent = tiltedEllipse(pl, C0, r4);
      else {
        var a = K.to2D(pl, ed.edge.a), b = K.to2D(pl, ed.edge.b);
        // an edge square to the sketch plane projects to a point
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6 * Math.max(1, Math.abs(a[0]), Math.abs(a[1]))) ent = { t: 'point', x: r4(a[0]), y: r4(a[1]) };
        else ent = { t: 'line', x1: r4(a[0]), y1: r4(a[1]), x2: r4(b[0]), y2: r4(b[1]) };
      }
    }
    ent.construction = true;
    var keys = S.paramNames(ent), tol = 1e-6;
    for (var i = 0; i < f.entities.length; i++) {
      var o = f.entities[i];
      if (!o || o.t !== ent.t || !o.construction) continue;
      if (keys.every(function (k) { return Math.abs((+o[k] || 0) - ent[k]) < tol * Math.max(1, Math.abs(ent[k])); }) && (f.rels || []).some(function (r) { return r.type === 'fix' && r.refs.length === 1 && r.refs[0] === String(i); })) return { ref: String(i), entity: o };
    }
    markDirty();
    f.entities.push(ent);
    var idx = f.entities.length - 1;
    S.addRelation(f, 'fix', [String(idx)]);
    refresh();
    UI.setStatus('Model ' + (ent.t === 'point' ? 'vertex' : 'edge') + ' brought into the sketch as fixed construction geometry (' + S.refName(f, String(idx)) + ').');
    return { ref: String(idx), entity: ent };
  }
  // lane DE2: the projection onto sketch plane pl of model circle / arc C ({ center, normal, xdir, radius, a0, a1 }):
  // P(t) = c + a cos t + b sin t (a, b the projected radius vectors along xdir and normal × xdir) turned to principal
  // axes (u0, the major axis first): an ellipse, or a partial ellipse over the arc's sweep (its parameter angles in
  // degrees, counter-clockwise)
  function tiltedEllipse(pl, C, r4) {
    var V = K.vec, yd = V.cross(C.normal, C.xdir), c = K.to2D(pl, C.center);
    function pr(d) { var q = K.to2D(pl, V.add(C.center, V.scale(d, C.radius))); return [q[0] - c[0], q[1] - c[1]]; }
    var a = pr(C.xdir), b = pr(yd), ab = a[0] * b[0] + a[1] * b[1], aa = a[0] * a[0] + a[1] * a[1], bb = b[0] * b[0] + b[1] * b[1];
    var u0 = 0.5 * Math.atan2(2 * ab, aa - bb);
    function ax(u) { return [[a[0] * Math.cos(u) + b[0] * Math.sin(u), a[1] * Math.cos(u) + b[1] * Math.sin(u)], [-a[0] * Math.sin(u) + b[0] * Math.cos(u), -a[1] * Math.sin(u) + b[1] * Math.cos(u)]]; }
    var A = ax(u0);
    if (Math.hypot(A[1][0], A[1][1]) > Math.hypot(A[0][0], A[0][1])) { u0 += Math.PI / 2; A = ax(u0); }
    var v1 = A[0], v2 = A[1], s = v1[0] * v2[1] - v1[1] * v2[0] < 0 ? -1 : 1, D = 180 / Math.PI;
    var e = { t: 'ellipse', cx: r4(c[0]), cy: r4(c[1]), rx: r4(Math.hypot(v1[0], v1[1])), ry: r4(Math.hypot(v2[0], v2[1])), rot: r4(Math.atan2(v1[1], v1[0]) * D) };
    var sweep = C.a1 - C.a0;
    if (sweep < 2 * Math.PI - 1e-6) {
      var p0 = s * (C.a0 - u0), p1 = s * (C.a1 - u0), lo = Math.min(p0, p1) * D, hi = Math.max(p0, p1) * D;
      while (lo < 0) { lo += 360; hi += 360; }
      while (lo >= 360) { lo -= 360; hi -= 360; }
      e.t = 'pellipse'; e.a0 = r4(lo); e.a1 = r4(hi);
    }
    return e;
  }
  // Model reference geometry brought in for a dimension or relation that was never made (the tool was put down, the
  // PropertyManager cancelled): taken out again. entities: the entity objects pickModelRef returned.
  function dropUnusedModelRefs(entities) {
    var f = UI.activeSketchFeature();
    if (!f || !entities || !entities.length) return 0;
    var n = 0;
    entities.map(function (e) { return f.entities.indexOf(e); }).filter(function (i) { return i >= 0; }).sort(function (a, b) { return b - a; }).forEach(function (i) {
      var used = (f.dims || []).some(function (d) { return d.e === i; }) || (f.rels || []).some(function (r) { return r.type !== 'fix' && r.refs.some(function (x) { var p = S.parseRef(x); return p && !p.o && p.e === i; }); });
      if (used) return;
      f.entities.splice(i, 1);
      S.removeEntity(f, i);
      if (f.dims) f.dims.forEach(function (d) { if (d.e > i) d.e--; });
      n++;
    });
    if (n) refresh();
    return n;
  }
  function segDist(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    var t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }
  function refEntity(ref) { var p = S.parseRef(ref); return p && !p.o ? p.e : -1; }
  // r9/sketch9: the slot a whole-entity ref names, or null
  function slotOf(f, ref) { var p = S.parseRef(ref), e = p && !p.o && p.s === null && f.entities[p.e]; return e && e.t === 'slot' ? e : null; }

  // ------------------------------------------------------------------ distance / angle dimensions (two entities)
  // Which two-entity dimension a pair of picks means: two non-parallel lines -> angle, anything else that has a
  // distance -> distance. null when the pair has none (or is one entity picked twice).
  function relDimFor(f, r1, r2) {
    if (!r1 || !r2 || r1 === r2) return null;
    var p1 = S.parseRef(r1), p2 = S.parseRef(r2);
    if (p1 && p2 && !p1.o && !p2.o && p1.e === p2.e && (p1.s === null || p2.s === null)) return null;
    var k1 = S.refKind(f, r1), k2 = S.refKind(f, r2);
    if (k1 === 'line' && k2 === 'line') {
      var a = S.refCurve(f, r1), b = S.refCurve(f, r2);
      var d1 = [a.b[0] - a.a[0], a.b[1] - a.a[1]], d2 = [b.b[0] - b.a[0], b.b[1] - b.a[1]];
      var sn = Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) / ((Math.hypot(d1[0], d1[1]) * Math.hypot(d2[0], d2[1])) || 1);
      if (sn > 1e-6) return { type: 'angle', refs: [r1, r2] };
    }
    if ((p1 && p1.s === 'h') || (p2 && p2.s === 'h')) return null;   // lane DE: a spline handle takes an angle only
    if (k1 === 'circle' && k2 === 'circle') {
      // r6/sketch6: two concentric circles -> the radial distance between them (their centre distance is 0)
      var c1 = S.refCurve(f, r1), c2 = S.refCurve(f, r2);
      if (Math.hypot(c1.c[0] - c2.c[0], c1.c[1] - c2.c[1]) < 1e-9 * Math.max(1, c1.r, c2.r) && Math.abs(c1.r - c2.r) > 1e-9) return { type: 'distance', refs: [r1, r2], dir: 'r' };
    }
    // r9/sketch9: two slots on the same centres (a slot and its offset copy) -> the offset between their sides
    var sA = slotOf(f, r1), sB = slotOf(f, r2);
    if (sA && sB && Math.abs(sA.w - sB.w) > 1e-9 && Math.hypot(sA.x1 - sB.x1, sA.y1 - sB.y1) + Math.hypot(sA.x2 - sB.x2, sA.y2 - sB.y2) < 1e-6 * Math.max(1, sA.w)) return { type: 'distance', refs: [r1, r2], dir: 'r' };
    if (S.measure(f, 'distance', [r1, r2]) != null) return { type: 'distance', refs: [r1, r2] };
    return null;
  }
  // rfKU: a centerline (a construction line, whole) and a point / circle: { li (the centerline's index in refs), P (the
  // point or centre) }, else null
  function doubledSide(f, refs) {
    if (!refs || refs.length !== 2) return null;
    for (var li = 0; li < 2; li++) {
      var pl = S.parseRef(refs[li]), e = pl && !pl.o && pl.s === null && f.entities[pl.e], ko = S.refKind(f, refs[1 - li]);
      if (!e || e.t !== 'line' || !e.construction || (ko !== 'point' && ko !== 'circle')) continue;
      return { li: li, P: ko === 'point' ? S.refPoint(f, refs[1 - li]) : S.refCurve(f, refs[1 - li]).c };
    }
    return null;
  }
  // The two sketch points a distance dimension runs between, and the angle construction of an angle dimension.
  function relDimGeometry(f, rel) {
    var ents = f.entities, R = rel.refs, k0 = S.refKind(f, R[0]), k1 = S.refKind(f, R[1]);
    function ctr(r, k) { if (k === 'point') return S.refPoint(f, r); if (k === 'circle') return S.refCurve(f, r).c; var l = S.refCurve(f, r); return [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2]; }
    if (!k0 || !k1 || !ents) return null;
    if (rel.type === 'angle') {
      var A = S.refCurve(f, R[0]), B = S.refCurve(f, R[1]);
      if (!A || !B || A.kind !== 'line' || B.kind !== 'line') return null;
      var d1 = [A.b[0] - A.a[0], A.b[1] - A.a[1]], d2 = [B.b[0] - B.a[0], B.b[1] - B.a[1]], den = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(den) < 1e-12) return null;
      var t = ((B.a[0] - A.a[0]) * d2[1] - (B.a[1] - A.a[1]) * d2[0]) / den;
      var X = [A.a[0] + d1[0] * t, A.a[1] + d1[1] * t];
      return { type: 'angle', X: X, d1: d1, d2: d2, A: A, B: B };
    }
    var P, Q;
    if (rel.dir === 'r' && k0 === 'circle' && k1 === 'circle') {
      // r6/sketch6: radial distance between concentric circles, drawn along a 45° ray from the first one's centre
      var cA = S.refCurve(f, R[0]), cB = S.refCurve(f, R[1]), u = [Math.SQRT1_2, Math.SQRT1_2];
      P = [cA.c[0] + u[0] * cA.r, cA.c[1] + u[1] * cA.r]; Q = [cA.c[0] + u[0] * cB.r, cA.c[1] + u[1] * cB.r];
      return { type: 'distance', P: P, Q: Q, dir: cB.r >= cA.r ? u : [-u[0], -u[1]] };
    }
    var sl0 = rel.dir === 'r' && slotOf(f, R[0]), sl1 = sl0 && slotOf(f, R[1]);
    if (sl1) {
      // r9/sketch9: offset between a slot and its copy, drawn square to the axis at its middle, side to side
      var ax = [sl0.x2 - sl0.x1, sl0.y2 - sl0.y1], La = Math.hypot(ax[0], ax[1]) || 1, nn = [-ax[1] / La, ax[0] / La], M = [(sl0.x1 + sl0.x2) / 2, (sl0.y1 + sl0.y2) / 2];
      P = [M[0] + nn[0] * sl0.w / 2, M[1] + nn[1] * sl0.w / 2]; Q = [M[0] + nn[0] * sl1.w / 2, M[1] + nn[1] * sl1.w / 2];
      return { type: 'distance', P: P, Q: Q, dir: sl1.w >= sl0.w ? nn : [-nn[0], -nn[1]] };
    }
    if (k0 !== 'line' && k1 !== 'line') { P = ctr(R[0], k0); Q = ctr(R[1], k1); }
    else {
      var li = k1 === 'line' ? 1 : 0, L = S.refCurve(f, R[li]);
      P = ctr(R[1 - li], li ? k0 : k1);
      var dx = L.b[0] - L.a[0], dy = L.b[1] - L.a[1], L2 = dx * dx + dy * dy || 1, u = ((P[0] - L.a[0]) * dx + (P[1] - L.a[1]) * dy) / L2;
      Q = [L.a[0] + dx * u, L.a[1] + dy * u];
      // rfKU: a doubled distance runs from the point to its mirror image across the centerline
      if (Array.isArray(rel.ac) && rel.ac[li] === 'dbl') Q = [2 * Q[0] - P[0], 2 * Q[1] - P[1]];
    }
    // the direction the distance is measured along: horizontal / vertical (rel.dir 'h' / 'v', two points or centres)
    // or aligned with P -> Q; flipped so the value reads positive (the placement offset is along its left normal)
    var L0 = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
    var dir = rel.dir === 'h' && k0 !== 'line' && k1 !== 'line' ? [1, 0] : rel.dir === 'v' && k0 !== 'line' && k1 !== 'line' ? [0, 1] : L0 < 1e-12 ? [1, 0] : [(Q[0] - P[0]) / L0, (Q[1] - P[1]) / L0];
    if ((Q[0] - P[0]) * dir[0] + (Q[1] - P[1]) * dir[1] < 0) dir = [-dir[0], -dir[1]];
    var gd = { type: 'distance', P: P, Q: Q, dir: dir };
    return UI.relDimArcCond ? UI.relDimArcCond(f, rel, gd) : gd;   // sketchdims: Min / Max arc conditions move the ends
  }
  // Placement from the cursor: distance -> signed offset from P-Q; angle -> arc radius and which quadrant. A distance
  // being placed between two points (no value yet) also takes its direction from where the cursor is, as SolidWorks'
  // Smart Dimension does: above / below the two points -> horizontal, beside them -> vertical, otherwise aligned.
  function relDimPlacement(f, rel, uv) {
    if (UI.relDimPlacementExt) { var ext = UI.relDimPlacementExt(f, rel, uv); if (ext) return ext; }   // sketchdims: arc length
    var out = {};
    // rfKU: a distance from a centerline to a point / circle being placed on the far side of the centerline is the
    // doubled (linear diameter) distance, as SolidWorks' Smart Dimension (revolve profiles, parts mirrored about a
    // centerline): kept as the arc-condition entry 'dbl' on the centerline's ref, so every measure / solve reads it
    var cl = rel.type === 'distance' && rel.v == null && !rel.driven && rel.dir !== 'r' ? doubledSide(f, rel.refs) : null;
    if (cl) {
      var Lc = S.refCurve(f, rel.refs[cl.li]), side = function (q) { return (Lc.b[0] - Lc.a[0]) * (q[1] - Lc.a[1]) - (Lc.b[1] - Lc.a[1]) * (q[0] - Lc.a[0]); };
      var sp = side(cl.P), su = side(uv), far = sp * su < 0;
      var ac = Array.isArray(rel.ac) ? rel.ac.slice() : [null, null];
      ac[cl.li] = far ? 'dbl' : (ac[cl.li] === 'dbl' ? 'c' : ac[cl.li]);
      out.ac = ac.some(function (c) { return c === 'dbl' || c === 'min' || c === 'max'; }) ? ac.map(function (c) { return c || 'c'; }) : undefined;
      rel = Object.assign({}, rel, { ac: out.ac });
    }
    if (rel.type === 'distance' && rel.v == null && !rel.driven && rel.dir !== 'r') {
      var k0 = S.refKind(f, rel.refs[0]), k1 = S.refKind(f, rel.refs[1]);
      if (k0 && k1 && k0 !== 'line' && k1 !== 'line') {
        var g0 = relDimGeometry(f, { type: 'distance', refs: rel.refs });
        var tol = 1e-9 * Math.max(1, Math.abs(g0.P[0]), Math.abs(g0.P[1]));
        var inX = uv[0] > Math.min(g0.P[0], g0.Q[0]) && uv[0] < Math.max(g0.P[0], g0.Q[0]);
        var inY = uv[1] > Math.min(g0.P[1], g0.Q[1]) && uv[1] < Math.max(g0.P[1], g0.Q[1]);
        var slanted = Math.abs(g0.P[0] - g0.Q[0]) > tol && Math.abs(g0.P[1] - g0.Q[1]) > tol;
        out.dir = slanted && inX && !inY ? 'h' : slanted && inY && !inX ? 'v' : undefined;
        rel = Object.assign({}, rel, { dir: out.dir });
      }
    }
    var g = relDimGeometry(f, rel);
    if (!g) return out;
    if (g.type === 'angle') {
      // r5/sketch5: an angle being placed takes its quadrant from the cursor, as SolidWorks' does (between the two
      // lines' directions: the angle; beside one of them: its supplement); its label follows the cursor round the arc
      // (ta, degrees from the arc's middle), snapping to the middle within 10 px
      var w = [uv[0] - g.X[0], uv[1] - g.X[1]], R = Math.hypot(w[0], w[1]);
      out.off = Math.round(R * 1e4) / 1e4;
      var q = rel.q === -1 ? -1 : 1, sup = !!rel.sup;
      if (rel.v == null && !rel.driven) {
        var den = g.d1[0] * g.d2[1] - g.d1[1] * g.d2[0], al = (w[0] * g.d2[1] - w[1] * g.d2[0]) / den, be = (g.d1[0] * w[1] - g.d1[1] * w[0]) / den;
        q = al < 0 ? -1 : 1; sup = (al < 0) !== (be < 0);
        out.q = q === -1 ? -1 : undefined; out.sup = sup || undefined;
      }
      var ar = angleArc(g, q, sup), da = wrapPi(Math.atan2(w[1], w[0]) - ar.mid), s = UI.cam.scale || 0.1;
      out.ta = Math.abs(da) * R < 10 * s ? undefined : Math.round(da * 1800 / Math.PI) / 10;
      return out;
    }
    var n = [-g.dir[1], g.dir[0]];
    out.off = Math.round(((uv[0] - g.P[0]) * n[0] + (uv[1] - g.P[1]) * n[1]) * 1e4) / 1e4;
    var tx = UI.dimTextAlong ? UI.dimTextAlong(uv, g.P, g.dir, (g.Q[0] - g.P[0]) * g.dir[0] + (g.Q[1] - g.P[1]) * g.dir[1]) : null;
    if (tx != null) out.tx = tx;
    return out;
  }
  // Screen drawing data in the shape ui-sketch.js's drawOne takes: { lines, arrows, label, text }.
  function relDimScreenData(f, pl, rel) {
    if (UI.relDimScreenExt) { var ext = UI.relDimScreenExt(f, pl, rel); if (ext) return ext; }   // sketchdims: arc length
    var g = relDimGeometry(f, rel);
    if (!g) return null;
    var s = UI.cam.scale;
    function unit(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; }
    var value = rel.v != null && !rel.driven ? rel.v : S.measure(f, rel.type, rel.refs, rel.dir, rel.sup, rel.ac);
    var label = rel.type === 'angle' ? UI.fmtNum(value, 2) + '°' : UI.fmtDim ? UI.fmtDim(value) : UI.fmtNum(value, 2);   // p9-sketch: inch distances read like the other dimensions (.500)
    if (UI.dimLabelText) label = UI.dimLabelText(rel, value, rel.type === 'angle' ? 'angle' : 'len');   // sketchdims: tolerance, precision, text
    if (rel.type === 'distance' && Array.isArray(rel.ac) && rel.ac.indexOf('dbl') >= 0 && !rel.prefix) label = 'Ø' + label;   // rfKU: SolidWorks' linear diameter dimension
    if (rel.driven) label = '(' + label + ')';
    if (g.type === 'distance') {
      var ld = UI.linearDimScreen(pl, g.P, g.Q, g.dir, rel.off, rel.tx);
      ld.label = label;
      return ld;
    }
    var out = { lines: [], arrows: [], label: label };
    // angle: an arc of radius `off` around the intersection, between the two rays of the quadrant it was placed in
    // (rel.q / rel.sup, angleArc); the label sits at rel.ta degrees from the arc's middle (r5/sketch5: it follows the
    // cursor), with the arc running on to it; extension lines run from the lines to the arc where they stop short
    var R = rel.off != null ? rel.off : 30 * s, ar = angleArc(g, rel.q === -1 ? -1 : 1, !!rel.sup);
    function at(a, r) { return scr(pl, [g.X[0] + r * Math.cos(a), g.X[1] + r * Math.sin(a)]); }
    function arcLines(from, sw) {
      var n = Math.max(2, Math.ceil(Math.abs(sw) / (Math.PI / 24))), p = [];
      for (var i = 0; i <= n; i++) p.push(at(from + sw * i / n, R));
      for (var j = 0; j < n; j++) out.lines.push([p[j], p[j + 1]]);
      return p;
    }
    var pts = arcLines(ar.a1, ar.sweep), N = pts.length - 1;
    out.arrows.push({ tip: pts[0], dir: unit(pts[1], pts[0]) }, { tip: pts[N], dir: unit(pts[N - 1], pts[N]) });
    var da = (rel.ta || 0) * Math.PI / 180, half = Math.abs(ar.sweep) / 2, aL = ar.mid + da;
    if (Math.abs(da) > half) {
      var sg = da < 0 ? -1 : 1, past = Math.min(0.5, 6 * s / Math.max(R, 1e-9));
      arcLines(ar.mid + sg * half, sg * (Math.abs(da) - half + past));
    }
    [[ar.u1, g.A], [ar.u2, g.B]].forEach(function (x) {
      var u = x[0], L = Math.hypot(u[0], u[1]) || 1, ux = u[0] / L, uy = u[1] / L;
      var t1 = (x[1].a[0] - g.X[0]) * ux + (x[1].a[1] - g.X[1]) * uy, t2 = (x[1].b[0] - g.X[0]) * ux + (x[1].b[1] - g.X[1]) * uy;
      var tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), gap = 2 * s, ext = 3 * s, a = Math.atan2(uy, ux);
      if (R > tmax + gap) out.lines.push([at(a, tmax + gap), at(a, R + ext)]);
      else if (R < tmin - gap) out.lines.push([at(a, R - ext), at(a, tmin - gap)]);
    });
    // r14/sketchui14: the text horizontal and centred on the arc, in a break of it (ANSI, as the linear dimensions)
    var mid = at(aL, R);
    out.text = { x: mid[0], y: mid[1] + (UI.DIM_CAP || 9.4) / 2, anchor: 'middle' };
    out.laid = true;
    return out;
  }
  // The arc of an angle dimension: rays u1 = q·d1 and u2 = ±q·d2 (reversed for the supplementary angle), from u1's
  // direction a1 sweeping (signed, at most half a turn) to u2's; mid = the middle angle.
  function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; }
  function angleArc(g, q, sup) {
    var u1 = [q * g.d1[0], q * g.d1[1]], s2 = sup ? -q : q, u2 = [s2 * g.d2[0], s2 * g.d2[1]];
    var a1 = Math.atan2(u1[1], u1[0]), sweep = wrapPi(Math.atan2(u2[1], u2[0]) - a1);
    return { u1: u1, u2: u2, a1: a1, sweep: sweep, mid: a1 + sweep / 2 };
  }
  // Place a two-entity dimension: adds the relation (value = what it measures now) and opens the Modify box.
  function placeRelDim(f, rd, uv) {
    var pl = relDimPlacement(f, rd, uv);
    markDirty();
    var r = S.addRelation(f, rd.type, rd.refs, { off: pl.off, dir: pl.dir || rd.dir, tx: pl.tx, sup: pl.sup, q: pl.q, ta: pl.ta, ac: pl.ac || rd.ac });
    if (!r.ok) { UI.toast(r.error); return; }
    var idx = r.rels[0];
    App.sel = { kind: 'rel', index: idx };
    refresh();
    App.dimsStale = false;
    if (UI.drawDims) UI.drawDims();
    if (r.status !== 'ok') { askDriven(f, 'rel', idx); return; }
    UI.setStatus((rd.type === 'angle' ? 'Angle' : 'Distance') + ' dimension placed. Type a value and press Enter to drive the sketch.');
    UI.openRelDimEdit(idx);
  }

  // ------------------------------------------------------------------ driven (reference) dimensions
  // A new dimension that would over-define the sketch: ask, as SolidWorks does, whether to make it driven. The answer
  // is a page modal (#drv-driven / #drv-driving), never a browser dialog.
  function askDriven(f, kind, index) {
    var sketchId = f.id, answered = false;
    function item() { var g = UI.activeSketchFeature(); return g && g.id === sketchId ? g : null; }
    function done() { answered = true; App.drivenPrompt = null; }
    // lane BV (shop-user audit): Esc or the ✕ closed the question and left the new dimension driving, red, with the
    // sketch Over Defined. SolidWorks' Cancel does not add the dimension: Cancel, Esc and ✕ take it away again.
    function cancel() {
      if (answered) return;
      done();
      var g = item();
      if (!g) return;
      var list = kind === 'rel' ? g.rels : g.dims;
      if (list && list[index]) list.splice(index, 1);
      if (kind === 'dim' && g.dims && !g.dims.length) delete g.dims;
      if (App.sel && App.sel.kind === kind && App.sel.index === index) App.sel = null;
      App.dimsStale = true;
      refresh();
      UI.setStatus('Dimension not added (it would have over-defined the sketch).');
    }
    UI.showModal({
      title: 'Make Dimension Driven?',
      body: '<p>Adding this dimension will make the sketch over defined or unable to solve.</p><p>Do you want to add this dimension as a driven (reference) dimension instead? A driven dimension shows the value the geometry has, in grey and in parentheses, and does not drive anything.</p>',
      buttons: [
        // p9-sketchfix: the answer belongs to the placement (one undo step takes the whole dimension away, not first
        // back to the over-defining driving one): no undo point of its own
        { id: 'drv-driven', label: 'Make this dimension driven', primary: true, action: function () { UI.closeModal(); done(); var g = item(); if (g) { App.sketchDirty = true; setDriven(g, kind, index, true); } } },
        { id: 'drv-driving', label: 'Leave this dimension driving', action: function () { UI.closeModal(); done(); UI.setStatus('The dimension is driving and over-defines the sketch (shown red). Delete it, make it driven, or click Over Defined in the status bar for SketchXpert.'); App.dimsStale = true; } },
        // rfAR: or keep it driving and let SketchXpert find what to delete
        { id: 'drv-xpert', label: 'SketchXpert…', action: function () { UI.closeModal(); done(); App.dimsStale = true; cmdSketchXpert(); } },
        { id: 'drv-cancel', label: 'Cancel', action: function () { UI.closeModal(); cancel(); } }
      ]
    });
    App.drivenPrompt = { kind: kind, index: index, cancel: cancel };
    var x = document.querySelector('#modal-title button');
    if (x) x.addEventListener('click', cancel);
  }
  // Esc on the question is its Cancel (ui-app.js closes the modal on the same key)
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape' || !App.drivenPrompt || !App.drivenPrompt.cancel) return;
    var modal = document.getElementById('modal');
    if (!modal || modal.hidden) return;
    App.drivenPrompt.cancel();
  }, true);
  // Placed dimension check (ui-sketch.js calls this after a single-entity Smart Dimension is placed): true when the
  // question was asked (the caller then does not open the Modify box).
  function askDrivenIfOver(f, kind, index) {
    if (!S.overDefines(f, kind, index)) return false;
    askDriven(f, kind, index);
    return true;
  }
  function setDriven(f, kind, index, on) {
    markDirty();
    var r = S.setDriven(f, kind, index, on);
    App.drivenPrompt = null;
    if (!r.ok) { UI.toast(r.error); return r; }
    refresh();
    App.dimsStale = true;
    UI.setStatus(on ? 'Driven dimension: its value follows the geometry. ' + S.STATUS_TEXT[r.analysis.status] + '.' : 'The dimension drives the sketch again' + (r.state !== 'ok' ? ', and over-defines it (shown red).' : '.'));
    return r;
  }
  // Clicking a driven dimension: it has no value to type, so offer to make it driving.
  function drivenDimClick(it) {
    var f = UI.activeSketchFeature();
    if (!f) return;
    var kind = it.rel != null ? 'rel' : 'dim', index = it.rel != null ? it.rel : it.index;
    UI.showModal({
      title: 'Driven Dimension',
      body: '<p>This is a driven (reference) dimension: it shows what the geometry measures and cannot be changed.</p>',
      buttons: [
        { id: 'drv-make-driving', label: 'Make driving', primary: true, action: function () { UI.closeModal(); setDriven(f, kind, index, false); } },
        { label: 'Close', action: UI.closeModal }
      ]
    });
  }

  // ------------------------------------------------------------------ construction geometry
  // Construction Geometry (Sketch tab): toggles `construction` on the selected sketch entities (all become
  // construction unless all already are). Construction entities are drawn dashed and are not part of any profile.
  function selectedEntities() {
    var out = [];
    if (UI.selection) UI.selection().forEach(function (s) { if (s.kind === 'entity' && out.indexOf(s.index) < 0) out.push(s.index); });
    if (App.sel && App.sel.kind === 'entity' && out.indexOf(App.sel.index) < 0) out.push(App.sel.index);
    return out;
  }
  function toggleConstruction(list) {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return null; }
    list = (list || selectedEntities()).filter(function (i) { return f.entities[i]; });
    if (!list.length) { UI.setStatus('Select sketch entities first, then click Construction Geometry.'); return null; }
    var on = list.some(function (i) { return !f.entities[i].construction; });
    markDirty();
    list.forEach(function (i) { if (on) f.entities[i].construction = true; else delete f.entities[i].construction; });
    refresh();
    UI.setStatus((list.length === 1 ? 'Entity' : list.length + ' entities') + (on ? ' changed to construction geometry.' : ' changed back to sketch geometry.'));
    return on;
  }
  function cmdCenterline() {
    if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; }
    UI.setTool('line');
    App.drawConstruction = true;
    $('sketch-hint').innerHTML = 'Centerline: click the start and end points. Centerlines are construction geometry: axes for Symmetric relations, not part of the profile.';
    UI.refreshRibbon();
  }

  // ------------------------------------------------------------------ relations in the #dim-layer
  function drawRelations(f, pl, layer, h) {
    var an = App.sketchState;
    // the distance / angle dimensions
    if (f.rels) f.rels.forEach(function (rel, i) {
      var t = S.TYPES[rel.type];
      if (!t || !t.dim) return;
      var state = an && an.rels ? an.rels[i] : 'ok';
      var sc = relDimScreenData(f, pl, rel);
      if (sc) { var it = { d: rel, rel: i, state: rel.driven ? 'driven' : state }; h.drawOne(sc, it); h.list.push(it); }
    });
    // a virtual sharp (SketchSolver.filletCorner) on the lines it joins: thin extension lines to their ends
    if (f.rels) f.rels.forEach(function (rel) {
      var sh = rel.type === 'coincident' && rel.refs.length === 2 ? rel.refs.map(function (r) { var e = f.entities[refEntity(r)]; return e && e.sharp && String(r) === String(refEntity(r)); }) : null;
      if (!sh || !(sh[0] || sh[1])) return;
      var P = S.refPoint(f, rel.refs[sh[0] ? 0 : 1]), L = S.refCurve(f, rel.refs[sh[0] ? 1 : 0]);
      if (P && L && L.kind === 'line') {
        var end = Math.hypot(L.a[0] - P[0], L.a[1] - P[1]) < Math.hypot(L.b[0] - P[0], L.b[1] - P[1]) ? L.a : L.b, s1 = scr(pl, P), s2 = scr(pl, end);
        h.svg('line', { 'class': 'sk-sharp', x1: s1[0], y1: s1[1], x2: s2[0], y2: s2[1], style: 'stroke:var(--muted);stroke-width:1;stroke-dasharray:3 2;pointer-events:none' }, layer);
      }
    });
    // rfBR: a relation selected in Display/Delete Relations (or SketchXpert) lights up its entities in the selection yellow
    var selRel = App.sel && App.sel.kind === 'rel' ? App.sel.index : null;
    if (selRel != null && selRel !== App.relHover && f.rels && f.rels[selRel]) relHighlight(f, pl, layer, h, f.rels[selRel], true);
    // the entities of the relation hovered (a row of Display/Delete Relations): orange, as pre-highlight
    if (App.relHover != null && f.rels && f.rels[App.relHover]) relHighlight(f, pl, layer, h, f.rels[App.relHover]);
    if (App.tempRelDim) { var tsc = relDimScreenData(f, pl, App.tempRelDim); if (tsc) h.drawOne(tsc, { d: App.tempRelDim, temp: true }); }
    // (the yellow inference icons of what is being drawn sit by the cursor: ui-sketch.js drawFeedback)
    // Add Relations selection
    (App.relPick || []).forEach(function (ref) {
      var p = S.refPoint(f, ref), c = !p && S.refCurve(f, ref);
      if (p) { var s = scr(pl, p); h.svg('circle', { 'class': 'rel-pick', cx: s[0], cy: s[1], r: 5 }, layer); }
      else if (c && c.kind === 'line') { var a = scr(pl, c.a), b = scr(pl, c.b); h.svg('line', { 'class': 'rel-pick', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, layer); }
      else if (c) {
        var pts = [];
        for (var i = 0; i <= 48; i++) { var t = i / 48 * Math.PI * 2; pts.push(scr(pl, [c.c[0] + c.r * Math.cos(t), c.c[1] + c.r * Math.sin(t)]).join(',')); }
        h.svg('polyline', { 'class': 'rel-pick', points: pts.join(' ') }, layer);
      }
    });
    // rfF: sketch points selected with the Select tool (an end point, a centre: ui-select.js): a dot in the selection colour (rfBR: yellow)
    if (UI.selection) UI.selection().forEach(function (s) {
      if (s.kind === 'sketchRef') {   // rfAK: a style spline's control polygon leg, selected: a yellow dashed line over it (rfBR)
        var cl = S.refCurve(f, s.ref);
        if (cl && cl.kind === 'line') { var la = scr(pl, cl.a), lb = scr(pl, cl.b); h.svg('line', { 'class': 'sk-selleg', x1: la[0], y1: la[1], x2: lb[0], y2: lb[1], style: 'stroke:#ffd400;stroke-width:3;stroke-dasharray:6 4;pointer-events:none' }, layer); }
        return;
      }
      var p = s.kind === 'sketchPoint' ? S.refPoint(f, s.ref) : null;
      if (!p) return;
      var q = scr(pl, p);
      h.svg('circle', { 'class': 'sk-selpt', cx: q[0], cy: q[1], r: 4.5, style: 'fill:#ffd400;stroke:#1e1e1e;stroke-width:1.2;pointer-events:none' }, layer);
    });
  }
  // r5/sketch5: the relation under the mouse (a row of Display/Delete Relations) lights up the entities / points it
  // holds, without redrawing the sketch itself (rfBR: a selected one yellow and dashed, as every selection)
  var HOT_PRE = 'stroke:#e8891c;stroke-width:2.5;fill:none;stroke-linecap:round;stroke-linejoin:round;pointer-events:none';
  var HOT_SEL = 'stroke:#ffd400;stroke-width:2.5;stroke-dasharray:6 4;fill:none;stroke-linecap:round;stroke-linejoin:round;pointer-events:none';
  function relHighlight(f, pl, layer, h, rel, sel) {
    var HOT = sel ? HOT_SEL : HOT_PRE, dot = sel ? '#ffd400' : '#e8891c';
    rel.refs.forEach(function (ref) {
      if (ref === 'O') { var o = scr(pl, [0, 0]); h.svg('circle', { 'class': 'rel-hot', cx: o[0], cy: o[1], r: 5, style: HOT }, layer); return; }
      var p = S.refPoint(f, ref);
      if (p) { var s = scr(pl, p); h.svg('circle', { 'class': 'rel-hot', cx: s[0], cy: s[1], r: 4.5, style: HOT + ';fill:' + dot + ';fill-opacity:0.35' }, layer); return; }
      var c = S.refCurve(f, ref), e = f.entities[refEntity(ref)], pls;
      if (!c || !e) return;
      if (c.kind === 'line') pls = [{ pts: [c.a, c.b] }];
      else pls = K.entityPolylines(e);
      pls.forEach(function (l) {
        var pts = l.pts.map(function (q) { return scr(pl, q).map(function (v) { return Math.round(v * 10) / 10; }).join(','); });
        if (l.closed && pts.length) pts.push(pts[0]);
        h.svg('polyline', { 'class': 'rel-hot', points: pts.join(' '), style: HOT }, layer);
      });
    });
  }
  function hoverRelation(i, on) {
    var next = on ? i : (App.relHover === i ? null : App.relHover);
    if (next === App.relHover) return;
    App.relHover = next;
    if (UI.drawDims) { App.dimsStale = false; UI.drawDims(); } else App.dimsStale = true;
  }

  // ------------------------------------------------------------------ delete a relation
  function deleteRelation(index) {
    var f = UI.activeSketchFeature();
    if (!f || !f.rels || !f.rels[index]) return false;
    markDirty();
    var d = S.describe(f, f.rels[index]);
    S.deleteRelation(f, index);
    // rfAV: the sketch is solved again, as SolidWorks does: a relation left in conflict by the one deleted (Vertical
    // after its Horizontal) now holds (the line turns at its length); satisfied geometry does not move
    S.solve(f);
    App.relHover = null;
    App.sel = null;
    refresh();
    UI.setStatus('Deleted ' + d + '.');
    return true;
  }

  // ------------------------------------------------------------------ Add Relations PropertyManager
  function cmdAddRelations() {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return; }
    App.relPick = [];
    // p9-sketchfix: every pre-selected entity goes into Selected Entities (two circles selected with Ctrl: both listed,
    // not just the first)
    selectedEntities().forEach(function (i) {
      if (!f.entities[i]) return;
      var c = S.curveRefs(f, i), r = c.length === 1 ? c[0] : String(i);
      if (S.refKind(f, r) && App.relPick.indexOf(r) < 0) App.relPick.push(r);
    });
    UI.setTool('select');
    var spec = {
      title: 'Add Relations', icon: 'addRelation',
      message: 'Select sketch entities or points in the graphics area (click again to deselect), then click a relation to add.',
      command: { onSketchPoint: function (uv, mx, my) {
        var r = pickSketchRef(mx, my);
        // p9-sketchfix: a model edge or vertex (sketch on a face) comes in as fixed reference geometry
        if (!r) { var m = pickModelRef(mx, my); if (m) { r = m.ref; modelRefs.push(m.entity); } }
        if (!r) { UI.setStatus('Nothing there to select.'); return; }
        var i = App.relPick.indexOf(r);
        if (i >= 0) App.relPick.splice(i, 1); else App.relPick.push(r);
        render();
      } },
      groups: [],
      onOK: function () { App.relPick = null; App.dimsStale = true; dropUnusedModelRefs(modelRefs); },
      onCancel: function () { App.relPick = null; App.dimsStale = true; dropUnusedModelRefs(modelRefs); }
    };
    var modelRefs = [];
    function render() {
      var picks = App.relPick || [], types = S.applicable(f, picks);
      var existing = (f.rels || []).map(function (rel, i) { return { rel: rel, i: i }; }).filter(function (x) {
        return picks.length && x.rel.refs.some(function (r) { return picks.some(function (p) { return refEntity(p) === refEntity(r) && refEntity(r) >= 0; }); });
      });
      spec.groups = [
        { title: 'Selected Entities', fields: [
          { type: 'html', html: '<div class="rel-list" id="rel-picks">' + (picks.length ? picks.map(function (r) { return '<div class="rel-row">' + S.refName(f, r) + '</div>'; }).join('') : '<div class="rel-empty">Nothing selected</div>') + '</div>' },
          { type: 'buttons', buttons: [{ label: 'Clear Selections', onclick: function () { App.relPick = []; render(); } }] }
        ] },
        { title: 'Existing Relations', fields: [{ type: 'html', html: '<div class="rel-list">' + (existing.length ? existing.map(function (x) { return '<div class="rel-row">' + Icons(iconName(x.rel.type), 16) + ' ' + S.describe(f, x.rel) + '</div>'; }).join('') : '<div class="rel-empty">None</div>') + '</div>' }] },
        { title: 'Add Relations', fields: types.length ? [{ type: 'buttons', buttons: types.map(function (t) { return { label: S.TYPES[t].name, onclick: function () { add(t); } }; }) }] : [{ type: 'static', label: '', value: picks.length ? 'No relation applies to this selection.' : 'Select entities first.' }] }
      ];
      UI.openPM(spec);
      App.dimsStale = true;
    }
    function add(type) {
      var picks = (App.relPick || []).slice();
      markDirty();
      var r = S.addRelation(f, type, picks);
      if (!r.ok) { UI.toast(r.error); return; }
      App.relPick = [];
      refresh();
      if (r.status === 'conflict') UI.setStatus(S.TYPES[type].name + ' added, but the sketch cannot satisfy it' + (r.conflicts && r.conflicts.length ? ' (it conflicts with ' + r.conflicts.join('; ') + ')' : '') + ': Over Defined (red). Delete it in Display/Delete Relations.');
      else if (r.status === 'redundant') UI.setStatus(S.TYPES[type].name + ' added; it repeats what other relations already say: Over Defined (yellow).');
      else UI.setStatus(S.TYPES[type].name + ' added. ' + S.STATUS_TEXT[r.analysis.status] + (r.analysis.dof ? ' (' + r.analysis.dof + ' degrees of freedom left).' : '.'));
      render();
    }
    render();
    return spec;
  }

  // ------------------------------------------------------------------ Display/Delete Relations PropertyManager
  function cmdDisplayRelations(filter) {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first: relations belong to a sketch.'); return; }
    var v = { filter: filter === 'selected' || filter === 'over' ? filter : 'all' };
    // r5/sketch5: clicking an entity in the graphics area shows its relations (filter Selected Entities); hovering a row
    // lights up what it relates; Delete / arrow keys work on the list; over-defining / unsolved relations and
    // dimensions are listed first and tinted, and every change updates the rows in place (no re-built panel)
    function done() { hoverRelation(App.relHover, false); App.relHover = null; App.dimsStale = true; }
    var spec = {
      title: 'Display/Delete Relations', icon: 'relations', values: v,
      groups: [],
      command: { onSketchPoint: function (uv, mx, my) {
        var hit = UI.pickEntity(mx, my);
        App.sel = hit ? { kind: 'entity', index: hit.index } : null;
        v.filter = hit ? 'selected' : 'all';
        UI.updateSketches();
        render();
      } },
      onChange: function () { if (!rendering) render(); },
      onOK: done, onCancel: done
    };
    function rows() {
      var an = App.sketchState || S.analyze(f), selEnt = App.sel && App.sel.kind === 'entity' ? App.sel.index : null;
      var out = (f.rels || []).map(function (rel, i) { return { rel: rel, i: i, state: an.rels[i] || 'ok' }; });
      // over-defining / unsolved Smart Dimensions are listed too (they can be deleted here)
      (f.dims || []).forEach(function (d, i) { var st = an.dims && an.dims[i]; if (st && st !== 'ok' && !d.driven) out.push({ dim: d, i: i, state: st }); });
      out = out.filter(function (x) {
        if (v.filter === 'over') return x.state !== 'ok';
        if (v.filter === 'selected') return selEnt != null && (x.dim ? x.dim.e === selEnt : x.rel.refs.some(function (r) { return refEntity(r) === selEnt; }));
        return true;
      });
      return out.filter(function (x) { return x.state !== 'ok'; }).concat(out.filter(function (x) { return x.state === 'ok'; }));
    }
    function rowKey(x) { return (x.dim ? 'd' : 'r') + x.i; }
    function selKey() { return App.sel && App.sel.kind === 'rel' ? 'r' + App.sel.index : App.sel && App.sel.kind === 'dim' ? 'd' + App.sel.index : ''; }
    function dimText(x) { var e = f.entities[x.dim.e], val = e ? K.dimValue(e, x.dim) : null; return 'Dimension ' + (val != null ? (UI.fmtDim ? UI.fmtDim(val) : UI.fmtNum(val, 2)) : '') + ' on ' + S.refName(f, String(x.dim.e)); }   // sketch-units
    function selectRow(row) {
      var key = row.getAttribute('data-key');
      App.sel = { kind: key.charAt(0) === 'd' ? 'dim' : 'rel', index: +key.slice(1) };
      Array.prototype.forEach.call(row.parentNode.children, function (r) { r.classList.toggle('sel', r === row); });
      App.dimsStale = false; if (UI.drawDims) UI.drawDims();
      UI.setStatus(row.querySelector('span').textContent + ' — ' + row.querySelector('em').textContent + '. Delete removes it.');
    }
    function deleteSelected() {
      if (App.sel && App.sel.kind === 'rel') { App.relHover = null; deleteRelation(App.sel.index); }
      else if (App.sel && App.sel.kind === 'dim' && UI.deleteDim) { UI.deleteDim(App.sel.index); refresh(); }
      else { UI.toast('Select a relation in the list first.'); return; }
      render();
    }
    var rendering = false;
    function render() {
      rendering = true;
      try { renderNow(); } finally { rendering = false; }
    }
    function renderNow() {
      var list = rows(), an = App.sketchState || S.analyze(f), sk = selKey();
      spec.message = S.STATUS_TEXT[an.status] + ': ' + (f.rels ? f.rels.length : 0) + ' relation' + ((f.rels || []).length === 1 ? '' : 's') + ', ' + an.dof + ' degree' + (an.dof === 1 ? '' : 's') + ' of freedom' + (an.conflicts ? ', ' + an.conflicts + ' not solved' : '') + (an.redundant ? ', ' + an.redundant + ' over defining' : '') + '.';
      spec.messageOk = an.status === 'full';
      spec.groups = [
        { title: 'Relations', fields: [
          { type: 'select', label: 'Filter', key: 'filter', options: [['all', 'All in this sketch'], ['over', 'Overdefining/Not Solved'], ['selected', 'Selected Entities']] },
          { type: 'html', html: '<div class="rel-list" id="rel-display" role="listbox" aria-label="Relations">' + (list.length ? list.map(function (x) {
            var key = rowKey(x), icon = x.dim ? Icons('dim', 16) : Icons(iconName(x.rel.type), 16);
            return '<div class="rel-row ' + x.state + (key === sk ? ' sel' : '') + '" role="option" data-key="' + key + '"' + (x.dim ? '' : ' data-rel="' + x.i + '"') + ' tabindex="0">' + icon + '<span>' + (x.dim ? dimText(x) : S.describe(f, x.rel)) + '</span><em>' + stateText(x.state) + '</em></div>';
          }).join('') : '<div class="rel-empty">' + (v.filter === 'selected' && !(App.sel && App.sel.kind === 'entity') ? 'Click an entity in the graphics area' : 'No relations') + '</div>') + '</div>' },
          { type: 'buttons', buttons: [
            { label: 'Delete', onclick: deleteSelected },
            { label: 'Delete All', onclick: function () { if (!f.rels || !f.rels.length) return; markDirty(); var n = f.rels.length; delete f.rels; App.sel = null; App.relHover = null; refresh(); UI.setStatus('Deleted all ' + n + ' relations.'); render(); } }
          ] }
        ] }
      ];
      UI.openPM(spec);
      var box = $('rel-display');
      if (box) Array.prototype.forEach.call(box.querySelectorAll('.rel-row'), function (row) {
        var key = row.getAttribute('data-key'), ri = key.charAt(0) === 'r' ? +key.slice(1) : null;
        row.addEventListener('click', function () { selectRow(row); row.focus(); });
        row.addEventListener('mouseenter', function () { if (ri != null) hoverRelation(ri, true); });
        row.addEventListener('mouseleave', function () { if (ri != null) hoverRelation(ri, false); });
        row.addEventListener('keydown', function (ev) {
          if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); ev.stopPropagation(); selectRow(row); deleteSelected(); var first = $('rel-display') && $('rel-display').querySelector('.rel-row'); if (first) first.focus(); }
          else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); ev.stopPropagation(); var nx = ev.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling; if (nx) { selectRow(nx); nx.focus(); } }
          else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); selectRow(row); }
        });
        row.addEventListener('focus', function () { if (ri != null) hoverRelation(ri, true); });
        row.addEventListener('blur', function () { if (ri != null) hoverRelation(ri, false); });
      });
    }
    render();
    return spec;
  }

  // ------------------------------------------------------------------ dragging sketch geometry
  // Pressing on an entity or point with the Select tool drags it; the solver keeps every relation and dimension, so
  // fully defined geometry stays put and under-defined geometry follows the mouse.
  // sketch-refine: Ctrl held while dragging suppresses the snaps (no merge, no model snap), as SolidWorks' Ctrl does
  // for inferences; the drag hook gets no modifier keys, so the state is followed here
  var ctrlHeld = false;
  window.addEventListener('keydown', function (ev) { if (ev.key === 'Control') ctrlHeld = true; }, true);
  window.addEventListener('keyup', function (ev) { if (ev.key === 'Control') ctrlHeld = false; }, true);
  window.addEventListener('mousemove', function (ev) { ctrlHeld = !!ev.ctrlKey; }, true);
  window.addEventListener('blur', function () { ctrlHeld = false; });
  UI.sketchCtrlHeld = function () { return ctrlHeld; };   // for the drawing tools' inference too (ui-sketch.js inferPoint)
  // ---- rfAR: Sketch Settings that change a drag (ui-sketch.js UI.sketchSettings)
  function skOn(k) { return UI.sketchSettings ? UI.sketchSettings.get(k) : k !== 'noSolveMove' && k !== 'detachOnDrag' && k !== 'overrideDims'; }
  // Detach Segment on Drag: the relations that tie line / arc i's ends to other entities go (Coincident and Midpoint
  // on its end points, Tangent with an entity that shared an end with it). Returns how many went.
  function detachSegment(f, i) {
    var e = f.entities[i];
    if (!e || !(e.t === 'line' || e.t === 'arc') || !f.rels) return 0;
    var ends = S.pointRefs(f, i).filter(function (pr) { return /\.p\d$/.test(pr.ref); }), endRe = new RegExp('^' + i + '\\.p\\d$');
    function sharesEnd(j) {
      return S.pointRefs(f, j).some(function (pr) { return /\.p\d$/.test(pr.ref) && ends.some(function (a) { return Math.abs(a.pt[0] - pr.pt[0]) < 1e-9 && Math.abs(a.pt[1] - pr.pt[1]) < 1e-9; }); });
    }
    var n = 0;
    for (var k = f.rels.length - 1; k >= 0; k--) {
      var rel = f.rels[k], refs = rel.refs || [];
      var onEnd = (rel.type === 'coincident' || rel.type === 'midpoint') && refs.some(function (r) { return endRe.test(r); }) && refs.some(function (r) { return refEntity(r) !== i; });
      var tan = rel.type === 'tangent' && refs.indexOf(String(i)) >= 0 && refs.some(function (r) { var j = refEntity(r); return j >= 0 && j !== i && sharesEnd(j); });
      if (onEnd || tan) { f.rels.splice(k, 1); n++; }
    }
    if (!f.rels.length) delete f.rels;
    return n;
  }
  // Override Dims on Drag/Move: the driving dimensions on entity i (its own Smart Dimensions and the distance / angle
  // dimensions to it) are made driven for the drag. Returns them, for restoreDims.
  function releaseDims(f, i) {
    var list = [];
    (f.dims || []).forEach(function (d, k) { if (d.e === i && !d.driven) { d.driven = true; list.push({ kind: 'dim', index: k }); } });
    (f.rels || []).forEach(function (rel, k) {
      if (rel.driven || !(S.TYPES[rel.type] && S.TYPES[rel.type].dim)) return;
      if (rel.refs.some(function (r) { return refEntity(r) === i; })) { rel.driven = true; list.push({ kind: 'rel', index: k }); }
    });
    return list.length ? list : null;
  }
  function restoreDims(f, list) {
    list.forEach(function (it) { S.setDriven(f, it.kind, it.index, false); });   // driving again, holding the value it reads now
    App.dimsStale = true;
  }
  function sketchDragHook(p, ev, own) {   // own: the ref to drag (a Sketch Text pressed on its letters), else the one under p
    if (App.mode !== 'sketch' || App.tool !== 'select' || App.command) return null;
    var f = UI.activeSketchFeature(), ref = own || pickSketchRef(p[0], p[1]);
    if (!f || !ref || ref === 'O') return null;
    var pl = UI.activePlane(), start = null, uv0 = null, point = !!S.refPoint(f, ref), moved = false, pushedAt = -1, before = null;
    if (!point) ref = String(refEntity(ref));
    // grabbing a circle or an arc on its curve changes its radius (the centre point moves it), as in SolidWorks
    var ent = f.entities[refEntity(ref)], radius = !point && ent && (ent.t === 'circle' || ent.t === 'arc');
    // rfY (fidelity 3 #2): a slot's end cap moves that end (the slot stretches, its width holds), as in SolidWorks
    var cap = radius && ent.t === 'arc' && !!(S.slotCap && S.slotCap(f, refEntity(ref)));
    if (cap) radius = false;
    // and a side (line or arc) moves alone: the slot's centre line holds, so the width changes symmetrically about it
    var hold = !point && !cap && S.slotAxisOf ? S.slotAxisOf(f, refEntity(ref)) : -1;
    if (hold < 0) hold = null;
    // sketch-text-ref: a Sketch Text is its insertion point (SketchSolver point ref '5'): grabbed anywhere on its letters
    // it keeps the grab offset, its insertion point snaps onto points and curves and the solver holds its relations
    var textGrab = null;
    // At most one solve per animation frame: the first move of a frame is solved at once (no added latency), later ones
    // in the same frame only replace the pending target, solved when the frame comes (or at once on release). While
    // dragging, the sketch is redrawn without re-analysing it (its degrees of freedom cannot change mid-drag).
    var pending = null, frame = 0, drop = null;
    var noSolve = false, detached = 0, overridden = null;   // rfAR: Sketch Settings for this drag
    // A dragged end point dropped on another sketch point (within 9 px) or on a line / circle / arc (within 7 px) snaps
    // there and gets a Coincident on release, as in SolidWorks. Points that sat with it when the drag began (already
    // coincident) move with it and are no targets.
    // r15/snapaudit15: a line's or a rectangle / polygon edge's midpoint is a point target too (Midpoint on release, as
    // the Line tool infers it there). Curves are measured analytically on every entity but the dragged one: the old
    // UI.pickEntity lookup found the dragged entity itself under the cursor (its moving end sits there), so the snap to
    // a line blinked on and off from one pixel to the next and a slow drop 2 px from the line merged with nothing; it
    // also missed a circle between its facets when zoomed far in. A curve the point lay on when the drag began is no
    // target (the point slides along it), and an arc is a target only inside its sweep. Equal distances keep the
    // first entity in sketch order, so a drop on two coincident points always picks the same one.
    function hiddenEnt(e) { return !!(e && UI.entityLayerHidden && UI.entityLayerHidden(f, e)); }
    function dropTarget(q) {
      var e0 = refEntity(ref), P0 = S.refPoint({ entities: start }, ref), best = null, bd = 9, st0 = { entities: start };
      function same(a, b) { return !!(a && b && Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9); }
      function excluded(i, pt0) { return i === e0 || same(pt0, P0); }
      function take(c) { var s = scr(pl, c.pt), d = Math.hypot(s[0] - q[0], s[1] - q[1]); if (d < bd) { bd = d; best = c; } }
      function lineMid(c) { return [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2]; }
      f.entities.forEach(function (e, i) {
        if (i !== e0 && hiddenEnt(e)) return;   // rfCY: a hidden layer's points and curves are no drop targets
        S.pointRefs(f, i).forEach(function (pr) {
          if (/\.c$/.test(pr.ref) && CENTERLESS.test(e.t)) return;
          if (excluded(i, S.refPoint(st0, pr.ref))) return;
          if (/\.mid$/.test(pr.ref)) { if (e.t === 'line') take({ ref: String(i), pt: pr.pt, mid: true }); return; }
          take({ ref: pr.ref, pt: pr.pt });
        });
        if (i === e0) return;
        S.curveRefs(f, i).forEach(function (cr) {
          if (!/\.e\d+$/.test(cr)) return;
          var c = S.refCurve(f, cr), c0 = S.refCurve(st0, cr);
          if (c && c.kind === 'line' && !(c0 && same(lineMid(c0), P0))) take({ ref: cr, pt: lineMid(c), mid: true });
        });
      });
      var o = scr(pl, [0, 0]);
      if (!(P0 && Math.abs(P0[0]) < 1e-9 && Math.abs(P0[1]) < 1e-9) && Math.hypot(o[0] - q[0], o[1] - q[1]) < bd) best = { ref: 'O', pt: [0, 0] };
      // sketch-refine: Snap to Model while dragging too (as the drawing tools snap, ui-sketch.js inferPoint): a model
      // vertex, edge midpoint, centre, face / part centre within 9 px, unless a sketch point is as near (a pixel's grace);
      // it lands there exactly and adds no relation (sketches hold no external references)
      var mc = UI.sketchModelSnaps ? UI.sketchModelSnaps() : null;
      if (mc && mc.pts && mc.pts.length) {
        var mb = null, mbd = 9;
        mc.pts.forEach(function (c) { var s = scr(pl, c.pt), d = Math.hypot(s[0] - q[0], s[1] - q[1]); if (d < mbd) { mbd = d; mb = c; } });
        if (mb && (!best || mbd < bd - 1)) best = { ref: null, pt: mb.pt.slice(), model: true, label: mb.label };
      }
      if (best) return best;
      var uv = UI.screenToPlane(q[0], q[1], pl);
      if (!uv) return null;
      var bc = null, bdc = 7;
      function onAt(c, e, P) {   // does P lie on curve c (of entity e) within its extent?
        if (!P) return false;
        var tol = 1e-9 * Math.max(1, Math.abs(P[0]), Math.abs(P[1]));
        if (c.kind === 'line') {
          var dx = c.b[0] - c.a[0], dy = c.b[1] - c.a[1], L = Math.hypot(dx, dy);
          return L > 0 && Math.abs((P[0] - c.a[0]) * dy - (P[1] - c.a[1]) * dx) / L < tol;
        }
        return Math.abs(Math.hypot(P[0] - c.c[0], P[1] - c.c[1]) - c.r) < tol;
      }
      f.entities.forEach(function (e, i) {
        if (i === e0 || !e || e.t === 'slot' || hiddenEnt(e)) return;   // a slot's curve ref is its (undrawn) centre line: no target, as in SketchSolver.onCurveRef
        S.curveRefs(f, i).forEach(function (cr) {
          var c = S.refCurve(f, cr), c0 = S.refCurve(st0, cr), pt;
          if (!c || (c0 && onAt(c0, start[i], P0))) return;
          if (c.kind === 'line') {
            var dx = c.b[0] - c.a[0], dy = c.b[1] - c.a[1], L2 = dx * dx + dy * dy;
            if (!(L2 > 0)) return;
            var t = ((uv[0] - c.a[0]) * dx + (uv[1] - c.a[1]) * dy) / L2;
            if ((t <= 0 || t >= 1) && !(e.t === 'line' && e.infinite)) return;   // sketch-refine: an infinite line runs on
            pt = [c.a[0] + dx * t, c.a[1] + dy * t];
          } else {
            var vx = uv[0] - c.c[0], vy = uv[1] - c.c[1], r = Math.hypot(vx, vy);
            if (r < 1e-12) return;
            if (e.t === 'arc' && e.a1 - e.a0 < 360) {
              var rel = ((Math.atan2(vy, vx) * 180 / Math.PI - e.a0) % 360 + 360) % 360;
              if (rel > e.a1 - e.a0) return;
            }
            pt = [c.c[0] + vx / r * c.r, c.c[1] + vy / r * c.r];
          }
          var s = scr(pl, pt), d = Math.hypot(s[0] - q[0], s[1] - q[1]);
          if (d < bdc) { bdc = d; bc = { ref: cr, pt: pt, curve: true }; }
        });
        // sketch-refine: onto a spline / ellipse (point on curve), unless the point already lay on it
        if (S.isFree && S.isFree(e) && !(start[i] && P0 && freeOn(start[i], P0))) {
          var fc = S.freeCurve(e), cl = fc && S.freeClosest(fc, uv);
          if (cl && !cl.end) { var sf = scr(pl, cl.p), df = Math.hypot(sf[0] - q[0], sf[1] - q[1]); if (df < bdc) { bdc = df; bc = { ref: String(i), pt: cl.p, curve: true }; } }
        }
      });
      if (bc) return bc;
      // sketch-refine: last, onto a model edge (no relation)
      if (mc && (mc.segs.length || mc.arcs.length)) {
        var me = null, med = 7;
        var mtake = function (pt) { var s = scr(pl, pt), d = Math.hypot(s[0] - q[0], s[1] - q[1]); if (d < med) { med = d; me = pt; } };
        mc.segs.forEach(function (sg) {
          var dx = sg.b[0] - sg.a[0], dy = sg.b[1] - sg.a[1], L2 = dx * dx + dy * dy;
          if (!(L2 > 0)) return;
          var t = Math.max(0, Math.min(1, ((uv[0] - sg.a[0]) * dx + (uv[1] - sg.a[1]) * dy) / L2));
          mtake([sg.a[0] + t * dx, sg.a[1] + t * dy]);
        });
        mc.arcs.forEach(function (ar) {
          var vx = uv[0] - ar.c[0], vy = uv[1] - ar.c[1], r = Math.hypot(vx, vy);
          if (r < 1e-12) return;
          var ang = Math.atan2(vy, vx), rel = (((ang - ar.a0) * ar.sg) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
          if (!ar.full && rel > ar.sw + 1e-9) return;
          mtake([ar.c[0] + vx / r * ar.r, ar.c[1] + vy / r * ar.r]);
        });
        if (me) return { ref: null, pt: me, model: true, curve: true, label: 'On edge' };
      }
      return null;
    }
    // does point P lie on spline / ellipse e (as it was)?
    function freeOn(e, P) { var fc = S.freeCurve(e), c = fc && S.freeClosest(fc, P); return !!(c && c.d < 1e-7 * Math.max(1, Math.abs(P[0]), Math.abs(P[1]))); }
    function dropKind(d) {
      if (!d || d.model) return null;
      if (d.mid) return 'midpoint';
      var de = d.ref !== 'O' && f.entities[refEntity(d.ref)];
      return /\.c$/.test(ref) && /\.c$/.test(d.ref) && de && /^(circle|arc)$/.test(de.t) ? 'concentric' : 'coincident';
    }
    function solveTo(q) {
      var uv = UI.screenToPlane(q[0], q[1], pl);
      if (!uv || !uv0) return;
      if (textGrab) { uv = [uv[0] + textGrab[0], uv[1] + textGrab[1]]; q = scr(pl, uv); }   // where the insertion point goes
      drop = !ctrlHeld && skOn('snapping') && point && (/\.(p\d|v\d+)$|^\d+$/.test(ref) || (/\.c$/.test(ref) && ent && /^(circle|arc)$/.test(ent.t))) ? dropTarget(q) : null;
      if (drop) uv = drop.pt.slice();
      var to = point || radius ? uv : [uv[0] - uv0[0], uv[1] - uv0[1]];
      // rfAR: Sketch Settings ▸ No Solve Move (or Automatic Solve off): the geometry moves alone, nothing is solved
      var target = noSolve ? { entities: f.entities } : f;
      if (S.drag(target, ref, to, start, { radius: radius, cap: cap, hold: noSolve ? null : hold }).ok) { moved = true; UI.updateSketches(); }
      if (drop && drop.model) {
        // sketch-refine: a model snap shows the drawing tools' magenta ring (no relation glyph: none is added)
        if (UI.sketchSnapMark) UI.sketchSnapMark(null);
        if (UI.sketchPreview) { var s0 = scr(pl, drop.pt), ring = []; for (var k = 0; k <= 20; k++) { var w = UI.screenToPlane(s0[0] + 6 * Math.cos(k * Math.PI / 10), s0[1] + 6 * Math.sin(k * Math.PI / 10), pl); if (w) ring.push(w); } UI.sketchPreview([ring], 'stroke:#c2409f;stroke-width:1.5;fill:none', 'sk-model-snap'); }
      } else if (UI.sketchSnapMark) UI.sketchSnapMark(drop ? drop.pt : null, q, drop && drop.curve, dropKind(drop));   // r15/snapaudit15: the glyph names the relation the release adds
    }
    // the next frame, or 50 ms when animation frames are throttled (a background tab), whichever comes first
    var timer = 0;
    function schedule() { frame = requestAnimationFrame(tick); timer = setTimeout(tick, 50); }
    function unschedule() { if (frame) cancelAnimationFrame(frame); if (timer) clearTimeout(timer); frame = timer = 0; }
    function tick() { unschedule(); if (pending) { var q = pending; pending = null; solveTo(q); schedule(); } }
    return {
      start: function () {
        // sketchflow2: a drag that moves nothing (a fully defined entity) leaves no undo step behind
        pushedAt = App.sketchDirty ? -1 : App.undo.length; before = JSON.stringify([f.entities, f.rels || null, f.dims || null]);
        markDirty();
        noSolve = skOn('noSolveMove') || !skOn('autoSolve');
        // rfAR: Detach Segment on Drag: a line / arc dragged whole leaves the entities it shared its ends with
        if (!point && skOn('detachOnDrag')) detached = detachSegment(f, refEntity(ref));
        // rfAR: Override Dims on Drag/Move: the dimensions on the dragged entity let go while it moves (driven), and
        // hold the new values when it is dropped
        if (skOn('overrideDims') && !noSolve) overridden = releaseDims(f, refEntity(ref));
        start = clone(f.entities); uv0 = UI.screenToPlane(p[0], p[1], pl); App.sketchDragging = true;
        var P0 = ent && ent.t === 'text' && uv0 ? S.refPoint(f, ref) : null;
        if (P0) textGrab = [P0[0] - uv0[0], P0[1] - uv0[1]];
      },
      move: function (q) {
        if (frame) { pending = q; return; }
        solveTo(q);
        schedule();
      },
      end: function () {
        unschedule();
        if (pending) { var q = pending; pending = null; solveTo(q); }
        App.sketchDragging = false;
        if (UI.sketchSnapMark) UI.sketchSnapMark(null);
        if (overridden) { restoreDims(f, overridden); overridden = null; }   // rfAR: the dimensions drive again, at their new values
        var merged = null;
        if (drop && drop.model && moved) merged = 'Snapped to the model (' + (drop.label || 'model') + '): no relation added. ';
        else if (drop && moved) {
          // a circle / arc centre dropped on another circle / arc centre: Concentric (as SolidWorks merges them); on a
          // midpoint: Midpoint (r15/snapaudit15)
          var kind = dropKind(drop), kname = S.TYPES[kind].name;
          var r = kind === 'concentric' ? S.addRelation(f, 'concentric', [ref.replace(/\.c$/, ''), drop.ref.replace(/\.c$/, '')], { rejectOver: true })
            : S.addRelation(f, kind, [ref, drop.ref], { rejectOver: true });
          // r15/snapaudit15: a merge that would over-define the sketch is refused and says so; the point stays where it
          // was dropped (it already sits there, so every other relation still holds)
          merged = r.ok ? kname + ' with ' + S.refName(f, drop.ref) + ' added. ' : kname + ' with ' + S.refName(f, drop.ref) + ' not added: it would over-define the sketch. ';
        }
        drop = null;
        if (JSON.stringify([f.entities, f.rels || null, f.dims || null]) === before) {
          moved = false;
          if (pushedAt >= 0 && App.undo.length === pushedAt + 1) { App.undo.pop(); App.sketchDirty = false; }
        }
        UI.updateSketches();
        UI.refreshTree();
        var an = App.sketchState;
        if (merged) { UI.setStatus('Dragged ' + S.refName(f, ref) + '. ' + merged + (an ? S.STATUS_TEXT[an.status] + '.' : '')); return; }
        UI.setStatus(moved ?'Dragged ' + S.refName(f, ref) + '. ' + (an ? S.STATUS_TEXT[an.status] + (an.dof ? ' (' + an.dof + ' degrees of freedom)' : '') : '') : S.refName(f, ref) + (an && an.status === 'full' ? ' is fully defined: it cannot be dragged.' : ' did not move: its relations and dimensions hold it.'));
      }
    };
  }

  // ------------------------------------------------------------------ script / test hooks
  function activeOrThrow() { var f = UI.activeSketchFeature(); if (!f) throw new Error('No active sketch.'); return f; }
  // ------------------------------------------------------------------ Constrain All (rfAP)
  // SolidWorks: right-click in a sketch ▸ Constrain All, and the DXF import option of that name. The relations the
  // geometry already obeys (Coincident ends, Concentric centres, the origin, Horizontal / Vertical lines, Tangent arcs;
  // SketchSolver.constrainAll), then Fully Define Sketch's dimensions, in one undo step: an imported blank turns black.
  function constrainAll(opts) {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return null; }
    if (!f.entities.length) { UI.toast('The sketch is empty: there is nothing to constrain.'); return null; }
    var pushed = true;
    UI.pushUndo(); App.sketchDirty = true;   // its own Ctrl+Z step, even right after an import or a script
    var o = {};
    Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
    if (o.minGap == null && UI.cam) o.minGap = 34 * (UI.cam.scale || 0);
    var r = S.constrainAll(f, o);
    if (!r.ok) { if (pushed) { App.undo.pop(); App.sketchDirty = false; } UI.toast(r.error); return r; }
    App.sel = null; App.dimsStale = true; refresh();
    var a = r.added, parts = [];
    ['coincident', 'concentric', 'horizontal', 'vertical', 'tangent'].forEach(function (k) { if (a[k]) parts.push(a[k] + ' ' + S.TYPES[k].name); });
    var msg = 'Constrain All: ' + (parts.length ? parts.join(', ') : 'no new relations') + (r.dims ? '; ' + r.dims + ' dimension' + (r.dims === 1 ? '' : 's') : '') + '. ' + S.STATUS_TEXT[r.status] + (r.dof ? ' (' + r.dof + ' degrees of freedom left).' : '.');
    UI.setStatus(msg);
    if (UI.toast) UI.toast(msg);
    return r;
  }
  // rfBC: from the menu (no options) Constrain All opens a PropertyManager like SolidWorks' DXF-import Constrain All
  // step: Relations only (the default, so a later Autodimension / Fully Define picks the scheme) or Relations and
  // dimensions (Fully Define's scheme and placement fields); the message previews what will be added (worked out on a
  // copy of the sketch); ✓ applies it as one undo step, ✗ leaves the sketch untouched. From script, with an options
  // object, it runs at once as before ({ fullyDefine: false } for relations only).
  var CA_SCH = [['baseline', 'Baseline'], ['chain', 'Chain'], ['ordinate', 'Ordinate']];
  var CA_KINDS = ['coincident', 'concentric', 'horizontal', 'vertical', 'tangent'];
  function constrainAllOpts(v) {
    return { fullyDefine: v.mode === 'dims', hScheme: v.hScheme, vScheme: v.vScheme, hPlace: v.hPlace, vPlace: v.vPlace };
  }
  function constrainAllPreview(f, v) {
    var o = constrainAllOpts(v);
    if (UI.cam) o.minGap = 34 * (UI.cam.scale || 0);
    var r = S.constrainAll(clone(f), o);
    if (!r.ok) return { ok: false, error: r.error, text: r.error };
    var parts = [];
    CA_KINDS.forEach(function (k) { if (r.added[k]) parts.push(r.added[k] + ' ' + S.TYPES[k].name); });
    Object.keys(r.added).forEach(function (k) { if (r.added[k] && CA_KINDS.indexOf(k) < 0) parts.push(r.added[k] + ' ' + ((S.TYPES[k] || {}).name || k)); });
    r.text = 'Will add ' + (parts.length ? parts.join(', ') : 'no new relations') + (o.fullyDefine ? '; ' + r.dims + ' dimension' + (r.dims === 1 ? '' : 's') : '') +
      '. The sketch will be ' + S.STATUS_TEXT[r.status] + (r.dof ? ' (' + r.dof + ' degree' + (r.dof === 1 ? '' : 's') + ' of freedom left).' : '.');
    return r;
  }
  function cmdConstrainAllPM() {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return null; }
    if (!f.entities.length) { UI.toast('The sketch is empty: there is nothing to constrain.'); return null; }
    if (UI.setTool) UI.setTool('select');
    var v = { mode: 'rels', hScheme: 'baseline', vScheme: 'baseline', hPlace: 'below', vPlace: 'left' };
    var spec = { title: 'Constrain All', icon: 'fullyDefine', values: v, groups: [],
      onChange: function (x, key) { if (key) render(); },
      onOK: function () { var r = constrainAll(constrainAllOpts(v)); spec.result = r; if (r && r.ok === false) return false; },
      onCancel: function () { UI.setStatus('Constrain All cancelled: the sketch is as it was.'); } };
    function render() {
      var prev = constrainAllPreview(f, v);
      spec.preview = prev;
      spec.message = prev.text;
      spec.messageOk = prev.ok !== false && prev.status === 'full';
      var groups = [{ title: 'Options', fields: [
        { type: 'radio', key: 'mode', options: [['rels', 'Relations only'], ['dims', 'Relations and dimensions']] }
      ] }];
      if (v.mode === 'dims') groups.push({ title: 'Dimensions', fields: [
        { type: 'select', key: 'hScheme', label: 'Horizontal dimensions scheme', options: CA_SCH },
        { type: 'select', key: 'vScheme', label: 'Vertical dimensions scheme', options: CA_SCH },
        { type: 'select', key: 'hPlace', label: 'Horizontal dimensions', options: [['below', 'Below sketch'], ['above', 'Above sketch']] },
        { type: 'select', key: 'vPlace', label: 'Vertical dimensions', options: [['left', 'Left of sketch'], ['right', 'Right of sketch']] }
      ] });
      spec.groups = groups;
      UI.openPM(spec);
    }
    render();
    return spec;
  }
  UI.cmdConstrainAll = function (opts) { return opts === undefined ? cmdConstrainAllPM() : constrainAll(opts); };
  UI.constrainAllPreview = function () {
    var s = UI.pmSpec && UI.pmSpec(), p = s && s.title === 'Constrain All' ? s.preview : null;
    return p ? { ok: p.ok, added: p.added, relations: p.relations, dims: p.dims, status: p.status, text: p.text } : null;
  };

  // ------------------------------------------------------------------ SketchXpert (rfAR)
  // Tools ▸ Sketch Tools ▸ SketchXpert, and the Make Dimension Driven? question's third answer. Diagnose
  // (SketchSolver.diagnose) lists the solutions, each a set of relations / dimensions whose deletion leaves the sketch
  // solvable; < > step through them, what would be deleted lights up, Accept deletes it. Manual Repair lists every
  // relation / dimension involved, each with its own Delete.
  var xp = null;   // { mode: 'diagnose' | 'manual', d: diagnosis, k: solution shown }
  function itemLabel(f, it) { return it.src === 'dim' ? 'Dimension ' + (S.refName(f, String(f.dims[it.index].e)) || '') : S.describe(f, f.rels[it.index]); }
  function xpertShow(f, list) {
    var rel = null, dim = null;
    (list || []).forEach(function (it) { if (it.src === 'rel' && rel == null) rel = it.index; if (it.src === 'dim' && dim == null) dim = it.index; });
    App.relHover = rel;
    App.sel = dim != null ? { kind: 'dim', index: dim } : rel != null ? { kind: 'rel', index: rel } : null;
    App.dimsStale = true;
    UI.updateSketches();
  }
  function cmdSketchXpert() {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first: SketchXpert repairs the active sketch.'); return null; }
    xp = { mode: null, d: null, k: 0 };
    function done() { xp = null; App.relHover = null; App.sel = null; App.dimsStale = true; UI.updateSketches(); }
    var spec = { title: 'SketchXpert', icon: 'relations', values: {}, groups: [], keepSelection: true, onOK: done, onCancel: done };
    function diagnose() { xp.d = S.diagnose(f); xp.k = 0; xp.mode = 'diagnose'; render(); }
    function manual() { xp.d = S.diagnose(f, { pairs: false, max: 1 }); xp.mode = 'manual'; render(); }
    function accept() {
      var sol = xp.d && xp.d.solutions[xp.k];
      if (!sol) return;
      markDirty();
      var r = S.diagnoseApply(f, sol.remove);
      App.relHover = null; App.sel = null;
      refresh();
      UI.setStatus('SketchXpert: deleted ' + sol.names.join('; ') + '. ' + S.STATUS_TEXT[r.analysis.status] + '.');
      xp.d = null; xp.mode = null;
      render();
    }
    function delOne(it) {
      markDirty();
      S.diagnoseApply(f, [it]);
      App.relHover = null; App.sel = null;
      refresh();
      manual();
    }
    function render() {
      var an = S.analyze(f), over = an.status === 'over';
      spec.message = over ? 'The sketch is over defined or cannot be solved. Diagnose finds the relations and dimensions to delete; Manual Repair lists what conflicts.' : 'The sketch is ' + S.STATUS_TEXT[an.status] + ': nothing to repair.';
      spec.messageOk = !over;
      var groups = [{ title: 'Options', fields: [{ type: 'buttons', buttons: [{ label: 'Diagnose', onclick: diagnose, disabled: !over }, { label: 'Manual Repair', onclick: manual, disabled: !over }] }] }];
      var d = xp.d;
      if (xp.mode === 'diagnose' && d) {
        var sol = d.solutions[xp.k];
        groups.push({ title: 'Results', fields: sol ? [
          { type: 'html', html: '<div class="xp-sol" id="xp-sol"><div class="xp-count">Solution ' + (xp.k + 1) + ' of ' + d.solutions.length + ': delete</div>' + sol.names.map(function (n) { return '<div class="rel-row conflict"><span>' + n + '</span></div>'; }).join('') + '</div>' },
          { type: 'buttons', buttons: [
            { label: '◀', onclick: function () { xp.k = (xp.k + d.solutions.length - 1) % d.solutions.length; render(); } },
            { label: '▶', onclick: function () { xp.k = (xp.k + 1) % d.solutions.length; render(); } },
            { label: 'Accept', onclick: accept }
          ] }
        ] : [{ type: 'static', label: '', value: 'No set of up to two relations or dimensions repairs this sketch: use Manual Repair.' }] });
        xpertShow(f, sol ? sol.remove : null);
      } else if (xp.mode === 'manual' && d) {
        groups.push({ title: 'Conflicting relations and dimensions', fields: [
          { type: 'html', html: '<div class="rel-list" id="xp-manual">' + (d.candidates.length ? d.candidates.map(function (c, k) { return '<div class="rel-row ' + (c.state || 'ok') + '" data-k="' + k + '" tabindex="0"><span>' + c.name + '</span><button type="button" class="xp-del" data-k="' + k + '">Delete</button></div>'; }).join('') : '<div class="rel-empty">Nothing conflicts</div>') + '</div>' }
        ] });
        xpertShow(f, null);
      }
      spec.groups = groups;
      UI.openPM(spec);
      var box = document.getElementById('xp-manual');
      if (box && d) Array.prototype.forEach.call(box.querySelectorAll('.rel-row'), function (row) {
        var c = d.candidates[+row.getAttribute('data-k')];
        row.addEventListener('mouseenter', function () { xpertShow(f, [c]); });
        row.querySelector('.xp-del').addEventListener('click', function () { delOne({ src: c.src, index: c.index }); });
      });
    }
    render();
    if (S.analyze(f).status === 'over') diagnose();
    return spec;
  }
  UI.cmdSketchXpert = cmdSketchXpert;
  // sketchflow2: a click on "Over Defined" in the status bar opens SketchXpert (as SolidWorks' status bar does)
  document.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('.sk-state') : null;
    if (!t || App.mode !== 'sketch' || !/\bover\b/.test(t.className)) return;
    cmdSketchXpert();
  });
  UI.sketchXpertState = function () { return xp ? { mode: xp.mode, solution: xp.k, solutions: xp.d ? xp.d.solutions.length : 0, candidates: xp.d ? xp.d.candidates.length : 0, names: xp.d && xp.d.solutions[xp.k] ? xp.d.solutions[xp.k].names.slice() : [] } : null; };

  // ------------------------------------------------------------------ Scan Equal (rfAR)
  // Tools ▸ Relations ▸ Scan Equal: lines of equal length and arcs / circles of equal radius within a tolerance
  // (SketchSolver.scanEqual), each set with a check box; Set Equal (or ✓) adds Equal to the checked ones.
  function cmdScanEqual() {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return null; }
    var inch = App.model && App.model.units === 'in';
    var v = { tol: inch ? 0.001 : 0.01 }, found = [], checked = {};
    function scan() { found = S.scanEqual(f, { tol: +v.tol >= 0 ? +v.tol : 0 }).groups; checked = {}; found.forEach(function (g, k) { checked[k] = true; }); }
    function fmt(x) { return UI.fmtDim ? UI.fmtDim(x) : String(Math.round(x * 1e4) / 1e4); }
    function apply() {
      var keys = Object.keys(checked).filter(function (k) { return checked[k] && found[k]; });
      if (!keys.length) { UI.setStatus('Scan Equal: nothing checked.'); return 0; }
      markDirty();
      var n = 0, skipped = 0;
      keys.forEach(function (k) { var r = S.applyEqual(f, found[k].members); n += r.added.length; skipped += r.skipped; });
      refresh();
      UI.setStatus('Scan Equal: ' + n + ' Equal relation' + (n === 1 ? '' : 's') + ' added' + (skipped ? ', ' + skipped + ' already equal' : '') + '. ' + S.STATUS_TEXT[S.analyze(f).status] + '.');
      return n;
    }
    var spec = { title: 'Scan Equal', icon: 'relations', values: v, groups: [], keepSelection: true,
      onOK: function () { apply(); App.dimsStale = true; }, onCancel: function () { App.dimsStale = true; } };
    function render() {
      spec.message = found.length ? 'Check the sets to make Equal, then click Set Equal or ✓.' : 'No lines of equal length or arcs of equal radius within the tolerance.';
      spec.groups = [
        { title: 'Search', fields: [{ type: 'number', label: 'Tolerance', key: 'tol', min: 0, step: inch ? 0.001 : 0.01 }, { type: 'buttons', buttons: [{ label: 'Find', onclick: function () { scan(); render(); } }] }] },
        { title: 'Results', fields: [
          { type: 'html', html: '<div class="rel-list" id="scan-equal">' + (found.length ? found.map(function (g, k) {
            return '<label class="rel-row"><input type="checkbox" data-k="' + k + '"' + (checked[k] ? ' checked' : '') + '><span>' + g.members.length + ' ' + (g.kind === 'line' ? 'lines, length ' : 'arcs / circles, radius ') + fmt(g.value) + '</span><em>' + g.members.map(function (i) { return S.refName(f, String(i)); }).join(', ') + '</em></label>';
          }).join('') : '<div class="rel-empty">None found</div>') + '</div>' },
          { type: 'buttons', buttons: [{ label: 'Set Equal', onclick: function () { apply(); scan(); render(); } }] }
        ] }
      ];
      UI.openPM(spec);
      var box = document.getElementById('scan-equal');
      if (box) Array.prototype.forEach.call(box.querySelectorAll('input[type=checkbox]'), function (cb) { cb.addEventListener('change', function () { checked[cb.getAttribute('data-k')] = cb.checked; }); });
    }
    scan();
    render();
    return spec;
  }
  UI.cmdScanEqual = cmdScanEqual;
  UI.scanEqualFound = function () { var b = document.getElementById('scan-equal'); return b ? b.querySelectorAll('input[type=checkbox]').length : 0; };
  if (window.anvil) window.anvil.constrainAll = function (opts) { var r = constrainAll(opts); return r && { ok: r.ok, added: r.added, relations: r.relations, dims: r.dims, status: r.status, dof: r.dof, error: r.error }; };

  UI.pickSketchRef = pickSketchRef;
  UI.sketchPointDragHook = sketchDragHook;   // the solver drag itself (ui-sketch.js takes it for a free Sketch Text)
  UI.pickModelRef = pickModelRef;
  UI.modelCircleProjection = function (pl, C) { return tiltedEllipse(pl, C, function (x) { return Math.round(x * 1e6) / 1e6; }); };   // lane DE2 (tests)
  UI.dropUnusedModelRefs = dropUnusedModelRefs;
  UI.relDimFor = relDimFor;
  UI.relDimPlacement = relDimPlacement;
  UI.relDimDoubledSide = doubledSide;   // rfKU test hook
  UI.placeRelDim = placeRelDim;
  UI.relDimScreen = function (f, index) { var rel = f && f.rels && f.rels[index]; var sc = rel && relDimScreenData(f, UI.activePlane(), rel); return sc ? { text: sc.text } : null; };
  UI.drawRelations = drawRelations;
  UI.deleteRelation = deleteRelation;
  UI.cmdAddRelations = cmdAddRelations;
  UI.cmdDisplayRelations = cmdDisplayRelations;
  UI.sketchDragHook = sketchDragHook;
  UI.askDrivenIfOver = askDrivenIfOver;
  UI.setDimDriven = function (kind, index, on) { var f = UI.activeSketchFeature(); return f ? setDriven(f, kind, index, on !== false) : null; };
  UI.drivenDimClick = drivenDimClick;
  UI.toggleConstruction = toggleConstruction;
  UI.cmdCenterline = cmdCenterline;
  // r5/sketch5: the FeatureManager marks a sketch as SolidWorks does: "(-) Sketch1" under defined, "(+) Sketch1" over
  // defined, nothing when fully defined (or when it has no geometry). The analysis is cached per sketch on its content,
  // so refreshing the tree costs a string compare per sketch; the active sketch uses the live App.sketchState.
  var defCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  UI.sketchTreePrefix = function (f) {
    if (!f || f.type !== 'sketch' || !f.entities || !f.entities.length) return '';
    var st = null;
    if (App.mode === 'sketch' && App.activeSketch === f.id && App.sketchState) st = App.sketchState.status;
    else {
      var key = JSON.stringify([f.entities, f.rels || null, f.dims || null]), c = defCache && defCache.get(f);
      if (c && c.key === key) st = c.st;
      else { try { st = S.analyze(f).status; } catch (e) { st = null; } if (defCache) defCache.set(f, { key: key, st: st }); }
    }
    return st === 'under' ? '(-) ' : st === 'over' ? '(+) ' : '';
  };
  // the tree row of the active sketch follows its state as soon as it changes (a dimension that fully defines it …)
  var lastTreeState = null, baseRefreshStatus = UI.refreshStatus;
  if (baseRefreshStatus) UI.refreshStatus = function () {
    var r = baseRefreshStatus.apply(this, arguments);
    var st = App.mode === 'sketch' && App.sketchState ? App.activeSketch + ':' + App.sketchState.status : null;
    if (st !== lastTreeState) { var had = lastTreeState != null; lastTreeState = st; if (had && st && UI.refreshTree) UI.refreshTree(); }
    return r;
  };
  UI.sketchStatus = function () {
    var f = UI.activeSketchFeature();
    if (!f) return null;
    var an = S.analyze(f);
    return { status: an.status, text: S.STATUS_TEXT[an.status], dof: an.dof, entities: an.entities, rels: an.rels, dims: an.dims };
  };
  if (window.anvil) {
    // anvil.relations(): the active sketch's relations with their state; anvil.addRelation(type, refs, value?)
    window.anvil.relations = function () {
      var f = activeOrThrow(), an = S.analyze(f);
      return (f.rels || []).map(function (rel, i) { return { index: i, type: rel.type, refs: rel.refs.slice(), v: rel.v, state: an.rels[i], text: S.describe(f, rel) }; });
    };
    window.anvil.addRelation = function (type, refs, value) {
      var f = activeOrThrow();
      markDirty();
      var r = S.addRelation(f, type, refs, value != null ? { value: value } : {});
      refresh();
      if (!r.ok) throw new Error(r.error);
      return { rels: r.rels, status: r.status, sketch: S.STATUS_TEXT[r.analysis.status], dof: r.analysis.dof };
    };
    window.anvil.deleteRelation = function (i) { return deleteRelation(i); };
    window.anvil.sketchStatus = UI.sketchStatus;
    // anvil.construction(i | [i…]): toggle construction geometry; anvil.driven('dim' | 'rel', i, on?)
    window.anvil.construction = function (list) { activeOrThrow(); return toggleConstruction(Array.isArray(list) ? list : [list]); };
    window.anvil.driven = function (kind, index, on) { var f = activeOrThrow(), r = setDriven(f, kind, index, on !== false); if (!r.ok) throw new Error(r.error); return r.state; };
  }
})(UI);
