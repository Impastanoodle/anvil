// ui-transform.js — lane BJ: Mastercam's Transform tab. The engine every Transform command shares (a 2D affine
// transform of sketch entities: move, or copies with Join lines) and the Position commands Dynamic, Translate, Rotate,
// Mirror and Move to Origin, with their PropertyManagers; the group captions under the tab's buttons (Position, Offset,
// Layout, Size) and the Search Commands entry that tells Transform ▸ Mirror from the Features Mirror.
// Transforms act on sketch geometry (Anvil's equivalent of Mastercam wireframe) in the open sketch.
//
//   UI.transformEntities(f, idx, xf, opts)  move or copy sketch entities idx of sketch feature f by xf, a 2D affine
//       [a, b, c, d, e, f] in SVG / canvas order (x' = a x + c y + e, y' = b x + d y + f), or a list of them (one per
//       copy). opts: copy (copies instead of moving), count (with one xf: copies by xf, xf², …), join (copies plus lines
//       joining corresponding end points of consecutive instances), mirrorText (a reflected text is mirrored too; off:
//       it stays readable, moved to its mirrored place), undo (default true: one undo step), select (default true: the
//       result is selected). Every entity type: lines, arcs, circles, ellipses, partial ellipses, splines (style splines
//       and conics included), slots, arc slots, polygons, rectangles, polylines, text, points and block instances (a
//       whole instance moves as one; a reflected or unevenly scaled one becomes ordinary geometry). Moving drops the
//       relations to unselected geometry (counted in .dropped), keeps the ones inside the selection that still hold
//       (Horizontal / Vertical swap on a quarter turn, lengths scale); copies carry no relations. Returns { ok, error,
//       entities (moved) | added (copies), joins, dropped, message }.
//   UI.transformPreview(f, idx, xf, opts)   the entities the same call would make (App.tempEntities), nothing changed
//   UI.transformAffine                       the matrix helpers: translate, rotate, scale, mirror, mirrorDir, mul,
//                                            apply, power, classify
//   UI.transformSketch()                     the open sketch, or null with the toast "Open a sketch: Transform acts on
//                                            sketch geometry"
//   UI.transformPM(def)                      the shared PropertyManager (entities box, Move / Copy / Join, copies,
//                                            spacing, point boxes, live preview, ✓ and ✓+), see below
//   UI.cmdTDynamic / cmdTTranslate / cmdTRotate / cmdTMirror / cmdTMoveToOrigin
(function () {
  'use strict';
  if (typeof UI === 'undefined' || !UI.openPM || !UI.K) return;
  var App = UI.App, K = UI.K, $ = UI.$, S = window.SketchSolver;
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  var NO_SKETCH = 'Open a sketch: Transform acts on sketch geometry';

  // ------------------------------------------------------------------ 2D affine matrices
  function normDeg(a) { a = a % 360; if (a < 0) a += 360; return Math.abs(a - 360) < 1e-12 ? 0 : a; }
  // exact at the quarter turns, so a 90° rotation of (10, 0) is (0, 10) and not (6e-16, 10)
  function cosd(a) { var m = normDeg(+a); return m === 0 ? 1 : m === 90 || m === 270 ? 0 : m === 180 ? -1 : Math.cos(m * D2R); }
  function sind(a) { var m = normDeg(+a); return m === 0 || m === 180 ? 0 : m === 90 ? 1 : m === 270 ? -1 : Math.sin(m * D2R); }
  function tidy(v) { var r = +(+v).toPrecision(12); return Math.abs(r) < 1e-10 ? 0 : r; }
  var A = {
    id: function () { return [1, 0, 0, 1, 0, 0]; },
    translate: function (dx, dy) { return [1, 0, 0, 1, +dx || 0, +dy || 0]; },
    rotate: function (deg, cx, cy) { cx = +cx || 0; cy = +cy || 0; var c = cosd(deg), s = sind(deg); return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy]; },
    scale: function (sx, sy, cx, cy) { if (sy == null) sy = sx; cx = +cx || 0; cy = +cy || 0; return [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy]; },
    // the reflection about the line through (px, py) at deg degrees
    mirror: function (px, py, deg) { var c = cosd(2 * deg), s = sind(2 * deg); return A.mirrorCS(px, py, c, s); },
    // the reflection about the line through (px, py) along (dx, dy)
    mirrorDir: function (px, py, dx, dy) { var L = dx * dx + dy * dy; if (!(L > 0)) return null; return A.mirrorCS(px, py, (dx * dx - dy * dy) / L, 2 * dx * dy / L); },
    mirrorCS: function (px, py, c, s) { px = +px || 0; py = +py || 0; return [c, s, s, -c, px - c * px - s * py, py - s * px + c * py]; },
    // P after Q (Q applied first)
    mul: function (P, Q) { return [P[0] * Q[0] + P[2] * Q[1], P[1] * Q[0] + P[3] * Q[1], P[0] * Q[2] + P[2] * Q[3], P[1] * Q[2] + P[3] * Q[3], P[0] * Q[4] + P[2] * Q[5] + P[4], P[1] * Q[4] + P[3] * Q[5] + P[5]]; },
    apply: function (M, p) { return [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]]; },
    power: function (M, n) { var out = A.id(); for (var k = 0; k < n; k++) out = A.mul(M, out); return out; },
    // { det, refl, sim (a similarity: uniform scale, turn, maybe a reflection), s, th (the turn, degrees: linear part
    // s·R(th), or s·R(th)·diag(1, −1) when refl), axis: 'keep' | 'swap' | 'other' (what it does to the sketch axes),
    // pure (a translation), flat (no area left: refused) }
    classify: function (M) {
      var a = M[0], b = M[1], c = M[2], d = M[3], det = a * d - b * c, n = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d)), tol = 1e-9 * Math.max(n, 1e-300);
      var refl = det < 0, sim = refl ? Math.abs(a + d) <= tol && Math.abs(b - c) <= tol : Math.abs(a - d) <= tol && Math.abs(b + c) <= tol;
      var s = Math.hypot(a, b), th = Math.atan2(b, a) * R2D;
      th = Math.abs(th - Math.round(th)) < 1e-9 ? Math.round(th) : th;
      if (Math.abs(s - 1) < 1e-12) s = 1;
      return { det: det, refl: refl, sim: sim, s: s, th: normDeg(th), axis: Math.abs(b) <= tol && Math.abs(c) <= tol ? 'keep' : Math.abs(a) <= tol && Math.abs(d) <= tol ? 'swap' : 'other',
        pure: Math.abs(a - 1) <= 1e-12 && Math.abs(d - 1) <= 1e-12 && Math.abs(b) <= 1e-12 && Math.abs(c) <= 1e-12, flat: !(Math.abs(det) > 1e-12 * Math.max(n * n, 1e-300)) };
    }
  };
  function isMatrix(m) { return Array.isArray(m) && m.length === 6 && typeof m[0] === 'number'; }

  // ------------------------------------------------------------------ one entity under one matrix
  var GEO = ['t', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'a0', 'a1', 'w', 'h', 'rx', 'ry', 'rot', 'pts', 'closed', 'n', 'ins', 'tans', 'style', 'sharp'];
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function geomless(e) { var o = clone(e); GEO.forEach(function (k) { delete o[k]; }); return o; }
  function withGeom(e, g) { var o = geomless(e); Object.keys(g).forEach(function (k) { o[k] = g[k]; }); return o; }
  function normArc(o) { var sw = o.a1 - o.a0; o.a0 = tidy(normDeg(o.a0)); o.a1 = tidy(o.a0 + sw); return o; }
  // entity e mapped by M (cl = A.classify(M)): a list of entities (a turned rectangle is four lines), or null when it
  // cannot be (text stretched unevenly)
  function mapEntity(e, M, cl, opts) {
    function P(x, y) { var q = A.apply(M, [+x || 0, +y || 0]); return [tidy(q[0]), tidy(q[1])]; }
    function ang(a) { return tidy(normDeg(cl.refl ? cl.th - (+a || 0) : (+a || 0) + cl.th)); }   // a direction's angle
    function dirAng(a) { var vx = cosd(a), vy = sind(a); return tidy(normDeg(Math.atan2(M[1] * vx + M[3] * vy, M[0] * vx + M[2] * vy) * R2D)); }
    var o, q, k = cl.s;
    function outline() { var pl = K.entityPolylines(e)[0]; return pl ? [withGeom(e, { t: 'polyline', pts: pl.pts.map(function (p) { return P(p[0], p[1]); }), closed: !!pl.closed })] : null; }
    function fourLines() {
      var pts = K.entityPolylines(e)[0].pts.map(function (p) { return P(p[0], p[1]); }), out = [];
      for (var i = 0; i < 4; i++) { var a = pts[i], b = pts[(i + 1) % 4]; out.push(withGeom(e, { t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] })); }
      return out;
    }
    // an ellipse (centre, radii, axis angle; range: a partial one's parameter range) under a matrix that is no similarity
    function ellipse(cx, cy, rx, ry, rot, range) {
      var cr = cosd(rot), sr = sind(rot);
      var a00 = (M[0] * cr + M[2] * sr) * rx, a01 = (-M[0] * sr + M[2] * cr) * ry, a10 = (M[1] * cr + M[3] * sr) * rx, a11 = (-M[1] * sr + M[3] * cr) * ry;
      var rev = a00 * a11 - a01 * a10 < 0;
      if (rev) { a01 = -a01; a11 = -a11; }   // the parameter runs backwards: u -> −u
      var E = (a00 + a11) / 2, F = (a00 - a11) / 2, G = (a10 + a01) / 2, H = (a10 - a01) / 2, Q = Math.hypot(E, H), R = Math.hypot(F, G);
      var b1 = Math.atan2(G, F), b2 = Math.atan2(H, E), th = (b2 - b1) / 2 * R2D, ph = (b2 + b1) / 2 * R2D, c = P(cx, cy);
      var out = { t: range ? 'pellipse' : 'ellipse', cx: c[0], cy: c[1], rx: tidy(Q + R), ry: tidy(Q - R), rot: tidy(normDeg(ph)) };
      if (range) { var u0 = rev ? -range[1] + th : range[0] + th, u1 = rev ? -range[0] + th : range[1] + th; out.a0 = u0; out.a1 = u1; normArc(out); }
      return [withGeom(e, out)];
    }
    switch (e.t) {
      case 'point': q = P(e.x, e.y); o = clone(e); o.x = q[0]; o.y = q[1]; return [o];
      case 'line': o = clone(e); q = P(e.x1, e.y1); o.x1 = q[0]; o.y1 = q[1]; q = P(e.x2, e.y2); o.x2 = q[0]; o.y2 = q[1]; return [o];
      case 'polyline': o = clone(e); o.pts = e.pts.map(function (p) { return P(p[0], p[1]); }); return [o];
      case 'spline':
        o = clone(e); o.pts = e.pts.map(function (p) { return P(p[0], p[1]); });
        // a driving tangent turns (reflects) with it; its weights are per chord length (scale-free); a curvature control
        // scales as 1 / size and bends the other way in a mirror; unevenly stretched, the curvature control goes
        if (e.tans) o.tans = e.tans.map(function (tg) { return !tg ? tg : cl.sim ? [ang(tg[0])].concat(tg.slice(1, 3), tg[3] != null ? [tidy((cl.refl ? -1 : 1) * tg[3] / k)] : []) : [dirAng(tg[0])].concat(tg.slice(1, 3)); });
        return [o];
      case 'circle':
        if (!cl.sim) return ellipse(e.cx, e.cy, e.r, e.r, 0, null);
        o = clone(e); q = P(e.cx, e.cy); o.cx = q[0]; o.cy = q[1]; o.r = tidy(e.r * k); return [o];
      case 'arc': case 'aslot':
        if (!cl.sim) return e.t === 'arc' ? ellipse(e.cx, e.cy, e.r, e.r, 0, [e.a0, e.a1]) : outline();
        o = clone(e); q = P(e.cx, e.cy); o.cx = q[0]; o.cy = q[1]; o.r = tidy(e.r * k);
        if (e.t === 'aslot') o.w = tidy(e.w * k);
        if (cl.refl) { o.a0 = cl.th - e.a1; o.a1 = cl.th - e.a0; } else { o.a0 = e.a0 + cl.th; o.a1 = e.a1 + cl.th; }
        return [normArc(o)];
      case 'ellipse': case 'pellipse':
        if (!cl.sim) return ellipse(e.cx, e.cy, e.rx, e.ry, +e.rot || 0, e.t === 'pellipse' ? [e.a0, e.a1] : null);
        o = clone(e); q = P(e.cx, e.cy); o.cx = q[0]; o.cy = q[1]; o.rx = tidy(e.rx * k); o.ry = tidy(e.ry * k); o.rot = ang(e.rot);
        if (e.t === 'pellipse' && cl.refl) { o.a0 = -e.a1; o.a1 = -e.a0; normArc(o); }
        return [o];
      case 'poly':
        if (!cl.sim) return outline();
        o = clone(e); q = P(e.cx, e.cy); o.cx = q[0]; o.cy = q[1]; o.r = tidy(e.r * k); o.rot = ang(e.rot); return [o];
      case 'slot':
        if (!cl.sim) return outline();
        o = clone(e); q = P(e.x1, e.y1); o.x1 = q[0]; o.y1 = q[1]; q = P(e.x2, e.y2); o.x2 = q[0]; o.y2 = q[1]; o.w = tidy(e.w * k); return [o];
      case 'rect': case 'crect': {
        if (cl.axis === 'other') return fourLines();
        var c4 = K.entityPolylines(e)[0].pts.map(function (p) { return P(p[0], p[1]); });
        var xs = c4.map(function (p) { return p[0]; }), ys = c4.map(function (p) { return p[1]; });
        var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
        o = clone(e);
        if (e.t === 'rect') { o.x = x0; o.y = y0; } else { q = P(e.cx, e.cy); o.cx = q[0]; o.cy = q[1]; }
        o.w = tidy(x1 - x0); o.h = tidy(y1 - y0);
        return [o];
      }
      case 'text': {
        if (!cl.sim || !K.transformText) return null;
        if (cl.refl && !(opts && opts.mirrorText)) {
          // readable: the text keeps its direction and goes where its mirror image would be (its middle mirrored)
          var bb = textMid(e), to = A.apply(M, bb);
          o = k !== 1 ? K.transformText(e, { s: k, cx: bb[0], cy: bb[1] }) : clone(e);
          o = K.transformText(o, { dx: to[0] - bb[0], dy: to[1] - bb[1] });
        } else {
          o = cl.refl && K.mirrorEntity ? K.mirrorEntity(e, { p: [0, 0], d: [1, 0] }) : clone(e);
          if (cl.th) o = K.transformText(o, { rot: cl.th, cx: 0, cy: 0 });
          if (k !== 1) o = K.transformText(o, { s: k, cx: 0, cy: 0 });
          o = K.transformText(o, { dx: M[4], dy: M[5] });
        }
        o.x = tidy(o.x); o.y = tidy(o.y);
        return [o];
      }
    }
    return null;
  }
  function textMid(e) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    try { K.entityPolylines(e).forEach(function (l) { l.pts.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }); }); } catch (er) { }
    return x0 <= x1 ? [(x0 + x1) / 2, (y0 + y1) / 2] : [+e.x || 0, +e.y || 0];
  }
  // the free end points of entity e (the ends of an open curve, a point), for Join
  function endPoints(e) {
    if (e.t === 'point') return e.blkDef != null ? [] : [[e.x, e.y]];
    if (e.t === 'text') return [];
    var out = [];
    try { K.entityPolylines(e).forEach(function (l) { if (!l.closed && l.pts.length > 1) { out.push(l.pts[0]); out.push(l.pts[l.pts.length - 1]); } }); } catch (er) { }
    return out;
  }
  function selectionBox(f, idx) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    idx.forEach(function (i) { var e = f.entities[i]; if (!e) return; try { K.entityPolylines(e).forEach(function (l) { l.pts.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }); }); } catch (er) { } });
    return x0 <= x1 ? { x0: x0, y0: y0, x1: x1, y1: y1, c: [(x0 + x1) / 2, (y0 + y1) / 2] } : null;
  }

  // ------------------------------------------------------------------ the engine
  // (rfIQ: also a side midpoint '3.e0.mid', SketchSolver.parseRef's s 'em')
  function refIndex(r) { var m = /^(\d+)(?:\.([a-z]+)(\d*))?(?:\.mid)?$/.exec(String(r)); return m ? +m[1] : -1; }
  function blockInstances(f) { return K.blockInstances ? K.blockInstances(f) : []; }
  function uniqSel(f, idx) {
    var seen = {}, out = [];
    (idx || []).forEach(function (i) { i = +i; if (f.entities[i] && !seen[i]) { seen[i] = true; out.push(i); } });
    // a block instance goes whole
    blockInstances(f).forEach(function (r) {
      var all = r.ents.concat([r.ins]);
      if (all.some(function (i) { return seen[i]; })) all.forEach(function (i) { if (!seen[i]) { seen[i] = true; out.push(i); } });
    });
    return out.sort(function (a, b) { return a - b; });
  }
  function nameOf(f, i) { try { return S && S.refName ? S.refName(f, String(i)) : 'Entity' + (i + 1); } catch (er) { return 'Entity' + (i + 1); } }
  function xfList(xf, opts) {
    if (isMatrix(xf)) {
      var n = opts.copy || opts.join ? Math.max(1, opts.count | 0) : 1, out = [];
      for (var k = 1; k <= n; k++) out.push(A.power(xf, k));
      return out;
    }
    return (xf || []).filter(isMatrix);
  }
  // copies (and Join lines) of sel by each matrix of xfs into f; returns { added, joins }
  function makeCopies(f, sel, xfs, cls, opts) {
    var E = f.entities, added = [], joins = [], insts = {};
    blockInstances(f).forEach(function (r) { insts[r.id] = r; });
    xfs.forEach(function (M, k) {
      var cl = cls[k], done = {};
      sel.forEach(function (i) {
        var e = E[i];
        if (e.blk != null && insts[String(e.blk)]) {
          var r = insts[String(e.blk)];
          if (cl.sim && !cl.refl && K.insertBlock && f.blocks && f.blocks[r.def]) {
            if (done[r.id]) return;
            done[r.id] = true;
            var q = A.apply(M, [r.x, r.y]), n0 = E.length;
            var ir = K.insertBlock(f, r.def, tidy(q[0]), tidy(q[1]), tidy(r.ang + cl.th), r.s * cl.s);
            if (!ir || !ir.ok) throw new Error((ir && ir.error) || 'The block could not be copied.');
            for (var j = n0; j < E.length; j++) added.push(j);
            return;
          }
          if (e.blkDef != null) return;   // a reflected / stretched instance is copied as ordinary geometry, without its insertion point
        }
        var out = mapEntity(e, M, cl, opts);
        if (!out) throw new Error(nameOf(f, i) + ' cannot be ' + (cl.sim ? 'transformed' : 'stretched unevenly') + '.');
        out.forEach(function (o) { delete o.sharp; delete o.blk; delete o.blkDef; delete o.blkAng; delete o.blkS; E.push(o); added.push(E.length - 1); });
      });
    });
    if (opts.join) {
      var ends = [], seen = {};
      sel.forEach(function (i) { endPoints(E[i]).forEach(function (p) { var key = Math.round(p[0] * 1e7) + ',' + Math.round(p[1] * 1e7); if (!seen[key]) { seen[key] = true; ends.push(p); } }); });
      xfs.forEach(function (M, k) {
        var P0 = k ? xfs[k - 1] : A.id();
        ends.forEach(function (p) {
          var a = A.apply(P0, p), b = A.apply(M, p);
          a = [tidy(a[0]), tidy(a[1])]; b = [tidy(b[0]), tidy(b[1])];
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) return;
          E.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }); joins.push(E.length - 1);
        });
      });
    }
    return { added: added, joins: joins };
  }
  // a relation inside a moved selection: kept (adjusted to the move) or dropped
  var NONSIM_KEEP = { coincident: 1, midpoint: 1, parallel: 1, collinear: 1, intersection: 1 };
  var LENGTH_RELS = { distance: 1, arclength: 1, pathlength: 1, chamfer: 1 };
  function keepInside(rel, cl) {
    if (rel.type === 'fix' || rel.type === 'onEdge') return false;
    if (cl.pure) return true;
    if (!cl.sim) return !!NONSIM_KEEP[rel.type];
    if (rel.type === 'pattern' || (rel.type === 'runangle' && cl.refl)) return false;
    var hv = rel.type === 'horizontal' || rel.type === 'vertical', dhv = rel.type === 'distance' && (rel.dir === 'h' || rel.dir === 'v');
    if (hv || dhv) {
      if (cl.axis === 'other') return false;
      if (cl.axis === 'swap') { if (hv) rel.type = rel.type === 'horizontal' ? 'vertical' : 'horizontal'; else rel.dir = rel.dir === 'h' ? 'v' : 'h'; }
    }
    if (cl.s !== 1 && LENGTH_RELS[rel.type] && typeof rel.v === 'number') rel.v *= cl.s;
    return true;
  }
  var LENGTH_DIMS = { len: 1, olen: 1, r: 1, rx: 1, ry: 1, w: 1, h: 1, dia: 1, dx: 1, dy: 1 };
  function moveInPlace(f, sel, M, cl, opts) {
    var dropped = 0, insts = blockInstances(f);
    // a block instance that cannot stay one (reflected, stretched unevenly) becomes ordinary geometry first
    if (!(cl.sim && !cl.refl) && K.explodeBlock) {
      insts.filter(function (r) { return sel.indexOf(r.ins) >= 0; }).sort(function (a, b) { return b.ins - a.ins; }).forEach(function (r) {
        var x = K.explodeBlock(f, r.id);
        if (!x || !x.ok) throw new Error((x && x.error) || 'The block could not be exploded.');
        sel = sel.filter(function (i) { return i !== r.ins; }).map(function (i) { return i > r.ins ? i - 1 : i; });
      });
      insts = blockInstances(f);
    }
    // a rectangle that turns becomes four lines (with the relations that keep it a rectangle), as Rotate Entities does
    if (cl.axis === 'other' && S && S.explodeRect) {
      for (var q = sel.length - 1; q >= 0; q--) {
        var ri = sel[q], re = f.entities[ri];
        if (!re || (re.t !== 'rect' && re.t !== 'crect')) continue;
        var n0 = f.entities.length;
        S.explodeRect(f, ri);
        var shift = f.entities.length - n0;
        sel = sel.map(function (x) { return x > ri ? x + shift : x; });
        for (var z = 1; z <= shift; z++) sel.push(ri + z);
      }
      sel.sort(function (a, b) { return a - b; });
    }
    var E = f.entities, inSet = {};
    sel.forEach(function (i) { inSet[i] = true; });
    var bad = sel.filter(function (i) { var r = mapEntity(E[i], M, cl, opts); return !r || r.length !== 1; })[0];
    if (bad != null) throw new Error(nameOf(f, bad) + ' cannot be ' + (cl.sim ? 'moved that way' : 'stretched unevenly') + '.');
    var swapEnds = {};   // a reflected arc runs the other way: its start point is the old end's image
    if (cl.refl && cl.sim) sel.forEach(function (i) { if (E[i].t === 'arc' || E[i].t === 'aslot' || E[i].t === 'pellipse') swapEnds[i] = true; });
    if (f.rels) {
      f.rels = f.rels.filter(function (rel) {
        var ins = rel.refs.map(function (r) { var i = refIndex(r); return i >= 0 && !!inSet[i]; });
        if (!ins.some(Boolean)) return true;
        if (!ins.every(Boolean) || !keepInside(rel, cl)) { dropped++; return false; }
        rel.refs = rel.refs.map(function (r) { var i = refIndex(r); return swapEnds[i] ? String(r).replace(/\.p1$/, '.@').replace(/\.p2$/, '.p1').replace(/\.@$/, '.p2') : r; });
        return true;
      });
      if (!f.rels.length) delete f.rels;
    }
    if (f.dims) {
      f.dims = f.dims.filter(function (dm) {
        if (!inSet[dm.e] || cl.pure) return true;
        if (!cl.sim) { dropped++; return false; }
        if ((dm.k === 'dx' || dm.k === 'dy') && cl.axis !== 'keep') {
          if (cl.axis === 'swap') dm.k = dm.k === 'dx' ? 'dy' : 'dx';
          else if (E[dm.e] && E[dm.e].t === 'line') dm.k = 'len';
          else { dropped++; return false; }
        }
        if (cl.s !== 1 && LENGTH_DIMS[dm.k] && typeof dm.v === 'number') dm.v *= cl.s;
        return true;
      });
      if (!f.dims.length) delete f.dims;
    }
    sel.forEach(function (i) {
      var e = E[i], o = mapEntity(e, M, cl, opts)[0];
      if (e.t === 'point' && e.blkDef != null) { o.blkAng = tidy(normDeg((+e.blkAng || 0) + cl.th)); o.blkS = (e.blkS != null ? +e.blkS : 1) * cl.s; }
      E[i] = o;
    });
    return { entities: sel, dropped: dropped };
  }
  function snapshot(f) { return JSON.stringify({ e: f.entities, r: f.rels || null, d: f.dims || null, b: f.blocks || null }); }
  function restore(f, snap) {
    var s = JSON.parse(snap);
    f.entities = s.e;
    if (s.r) f.rels = s.r; else delete f.rels;
    if (s.d) f.dims = s.d; else delete f.dims;
    if (s.b) f.blocks = s.b; else delete f.blocks;
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many || one + 's'); }
  function transformCore(f, idx, xf, opts) {
    opts = opts || {};
    var xfs = xfList(xf, opts);
    if (!xfs.length) return { ok: false, error: 'No transform given.' };
    var copy = !!(opts.copy || opts.join || xfs.length > 1);
    if (!copy) xfs = xfs.slice(0, 1);
    var sel = uniqSel(f, idx);
    if (!sel.length) return { ok: false, error: 'Select the sketch entities first.' };
    var cls = xfs.map(A.classify);
    if (cls.some(function (c) { return c.flat; })) return { ok: false, error: 'That transform flattens the geometry to nothing.' };
    if (copy) {
      var c = makeCopies(f, sel, xfs, cls, opts);
      return { ok: true, added: c.added, joins: c.joins, copies: xfs.length, dropped: 0,
        message: 'Copied ' + plural(sel.length, 'entity', 'entities') + (xfs.length > 1 ? ' × ' + xfs.length : '') + (c.joins.length ? ', ' + plural(c.joins.length, 'join line') : '') + '.' };
    }
    var before = S && f.rels ? S.analyze(f) : null;
    var m = moveInPlace(f, sel, xfs[0], cls[0], opts);
    if (S && f.rels && f.rels.length) {
      var res = S.solve(f), an = S.analyze(f);
      if (!res || !res.ok || (before && an.conflicts > before.conflicts)) return { ok: false, error: 'The relations inside the selection do not hold after this transform.' };
    }
    return { ok: true, entities: m.entities, dropped: m.dropped, added: [], joins: [],
      message: 'Moved ' + plural(m.entities.length, 'entity', 'entities') + (m.dropped ? '; ' + plural(m.dropped, 'relation') + ' to other geometry dropped' : '') + '.' };
  }
  function changed() { App.sel = null; App.sel2 = null; App.gridStale = true; App.dimsStale = true; UI.updateSketches(); if (UI.refreshTree) UI.refreshTree(); }
  function transformEntities(f, idx, xf, opts) {
    opts = opts || {};
    f = f || UI.activeSketchFeature();
    if (!f) return { ok: false, error: NO_SKETCH };
    var snap = snapshot(f), undo = opts.undo !== false, dirty = App.sketchDirty, r;
    if (undo) { UI.pushUndo(); App.sketchDirty = true; }
    try { r = transformCore(f, idx, xf, opts); } catch (er) { r = { ok: false, error: er.message }; }
    if (!r || !r.ok) {
      restore(f, snap);
      if (undo) { App.undo.pop(); App.sketchDirty = dirty; }
      return r || { ok: false };
    }
    changed();
    if (opts.select !== false && UI.setSelection) {
      var res = (r.entities && r.entities.length ? r.entities : []).concat(r.added || [], r.joins || []);
      UI.setSelection(res.map(function (i) { return { kind: 'entity', index: i }; }));
    }
    return r;
  }
  function transformPreview(f, idx, xf, opts) {
    opts = opts || {};
    f = f || UI.activeSketchFeature();
    if (!f) return [];
    var g = clone({ entities: f.entities, blocks: f.blocks || null });
    if (!g.blocks) delete g.blocks;
    var o = {}; Object.keys(opts).forEach(function (k) { o[k] = opts[k]; });
    o.copy = true;
    var r;
    try { r = transformCore(g, idx, xf, o); } catch (er) { r = null; }
    if (!r || !r.ok) return [];
    return r.added.concat(r.joins).map(function (i) { return g.entities[i]; }).filter(function (e) { return e && !(e.t === 'point' && e.blkDef != null); });
  }
  UI.transformEntities = transformEntities;
  UI.transformPreview = transformPreview;
  UI.transformAffine = A;

  // ------------------------------------------------------------------ the shared PropertyManager
  function needSketch() {
    var f = App.mode === 'sketch' && UI.activeSketchFeature ? UI.activeSketchFeature() : null;
    if (!f) { UI.toast(NO_SKETCH); return null; }
    return f;
  }
  UI.transformSketch = needSketch;
  function toUV(mx, my) { return UI.screenToPlane(mx, my, UI.activePlane()); }
  function scr(q) { return UI.worldToScreen(K.to3D(UI.activePlane(), q[0], q[1])); }
  function pxWorld(mx, my) { var a = toUV(mx, my), b = toUV(mx + 1, my); return a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 1; }
  // lane BY: a click right on a line's end, a corner or a centre selects that sketch point (the Select tool's SolidWorks
  // point pick), which the command ignored (0 entities); a Transform command acts on entities, so a selected point
  // counts as its entity, and the selection becomes that entity
  function selIdx(f) {
    var out = [], pts = false;
    function add(i) { if (f.entities[i] && out.indexOf(i) < 0) out.push(i); }
    (UI.selection ? UI.selection() : []).forEach(function (s) {
      if (s.kind === 'entity') add(s.index);
      else if (s.kind === 'sketchPoint' && s.ref != null) { add(parseInt(s.ref, 10)); pts = true; }
    });
    if (App.sel && App.sel.kind === 'entity') add(App.sel.index);
    out.sort(function (a, b) { return a - b; });
    if (pts && UI.setSelection) UI.setSelection(out.map(function (i) { return { kind: 'entity', index: i }; }), { quiet: true });
    return out;
  }
  // the sketch point the drawing tools would infer under the cursor (an end, a centre, the origin), else the point
  function snapPoint(f, uv, mx, my) {
    if (UI.sketchInferPoint) { var inf = UI.sketchInferPoint(uv, mx, my); if (inf && inf.p) return [tidy(inf.p[0]), tidy(inf.p[1])]; }
    var best = null, bd = 9;
    f.entities.forEach(function (e, i) { if (!S) return; S.pointRefs(f, i).forEach(function (pr) { var s = scr(pr.pt), d = Math.hypot(s[0] - mx, s[1] - my); if (d < bd) { bd = d; best = pr.pt; } }); });
    var o = scr([0, 0]);
    if (Math.hypot(o[0] - mx, o[1] - my) < bd) best = [0, 0];
    return best ? best.slice() : uv.slice();
  }
  function fmtPt(p) { return '(' + UI.fmtDim(p[0]) + ', ' + UI.fmtDim(p[1]) + ')'; }
  var NAMES = { line: 'Line', circle: 'Circle', arc: 'Arc', rect: 'Rectangle', crect: 'Rectangle', poly: 'Polygon', slot: 'Slot', aslot: 'Arc Slot', point: 'Point', polyline: 'Polyline', spline: 'Spline', ellipse: 'Ellipse', pellipse: 'Partial Ellipse', text: 'Text' };
  // def: { title, icon, message, values (defaults), ops ([['move','Move'], …]), spacing ([between, total] labels or
  //   null), count (show Number of copies), params(v) -> fields, points: { box: { key, label, prompt } }, step(v, t, ctx)
  //   -> the matrix of instance t (t = 1 for a move; 1…n, or k / n with Total, for copies), xfs(v, ctx) (instead of step),
  //   needs(v) -> why ✓ is refused, onEntityPick(hit, ctx), excluded(v) -> entity indices left out, allWhenEmpty (nothing
  //   selected: the whole sketch), afterPoint(box, ctx) -> true when the click finished the command, onOpen(ctx),
  //   onClose(ctx), apply hook names }
  // lane BO: Mastercam keeps each function's last-used values (Move / Copy, copies, distances, angles, the mirror
  // axis, the offset side …) for the next time it is run, in the session and in its config; Anvil keeps them per
  // command for the session and in localStorage ('anvil.transform'). Points picked on screen, picked entities and
  // the box in use are never kept (def.forget names more, e.g. Dynamic's accumulated moves).
  var memory = null;
  function memoryLoad() {
    if (memory) return memory;
    memory = {};
    try { var s = localStorage.getItem('anvil.transform'); if (s) memory = JSON.parse(s) || {}; } catch (e) { memory = {}; }
    return memory;
  }
  function memoryKeys(v, forget) {
    return Object.keys(v).filter(function (k) {
      if (k === 'entities' || k === 'box' || (forget && forget.indexOf(k) >= 0)) return false;
      var x = v[k];
      return x == null || typeof x === 'number' || typeof x === 'string' || typeof x === 'boolean';
    });
  }
  function memRecall(name, v, forget) {
    var m = memoryLoad()[name];
    if (m) memoryKeys(v, forget).forEach(function (k) { if (m[k] !== undefined && (v[k] == null || typeof m[k] === typeof v[k])) v[k] = m[k]; });
    return v;
  }
  function memKeep(name, v, forget) {
    var m = memoryLoad()[name] = {};
    memoryKeys(v, forget).forEach(function (k) { if (v[k] != null) m[k] = v[k]; });
    try { localStorage.setItem('anvil.transform', JSON.stringify(memory)); } catch (e) { }
    return m;
  }
  UI.transformMemory = { recall: memRecall, keep: memKeep, get: function (name) { return memoryLoad()[name] || null; },
    reset: function () { memory = {}; try { localStorage.removeItem('anvil.transform'); } catch (e) { } } };

  // lane BO: Mastercam draws a transform's result in its own colour (the "result" colour, distinct from the geometry and
  // from the selected "group") so the preview can be told from what is there. The sketch tools' temp material is the
  // sketch blue, so while a Transform PropertyManager is open the temp group's lines get this material instead.
  var previewMats = {};
  function previewMaterial() {
    var dark = UI.theme && UI.theme() === 'dark', key = dark ? 'dark' : 'light';
    if (!previewMats[key] && typeof THREE !== 'undefined') previewMats[key] = new THREE.LineBasicMaterial({ color: dark ? 0xe879dc : 0xb0279e, depthTest: false });
    return previewMats[key] || null;
  }
  UI.transformPreviewColor = function () { var m = previewMaterial(); return m ? '#' + m.color.getHexString() : null; };
  function tintPreview() {
    var spec = UI.pmSpec && UI.pmSpec();
    if (!spec || !spec.transform || !UI.groups || !UI.groups.temp) return;
    var mat = previewMaterial();
    if (!mat) return;
    UI.groups.temp.children.forEach(function (ch) { if (ch.material && ch.material !== mat) ch.material = mat; });
  }
  if (UI.updateTemp && !UI.updateTemp.transformTint) {
    var baseUpdateTemp = UI.updateTemp;
    UI.updateTemp = function () { var r = baseUpdateTemp.apply(this, arguments); tintPreview(); return r; };
    UI.updateTemp.transformTint = true;
  }

  function transformPM(def) {
    var f = needSketch();
    if (!f) return null;
    var v = def.values || {};
    if (v.op == null) v.op = (def.ops || [['move']])[0][0];
    if (v.count == null) v.count = 1;
    if (v.spacing == null) v.spacing = 'between';
    memRecall(def.name, v, def.forget);
    v.entities = selIdx(f).filter(function (i) { return !excluded(i); });
    v.box = 'entities';
    var cmd = { ownHover: false }, ctx = { f: f, v: v, cmd: cmd };
    current = ctx;
    function fresh() { var g = UI.activeSketchFeature(); if (g) ctx.f = f = g; return f; }
    function excluded(i) { return def.excluded ? def.excluded(v).indexOf(i) >= 0 : false; }
    function targets() {
      var list = v.entities.filter(function (i) { return f.entities[i] && !excluded(i); });
      if (!list.length && def.allWhenEmpty) list = f.entities.map(function (e, i) { return i; }).filter(function (i) { return !excluded(i); });
      return list;
    }
    function copies() { return v.op === 'move' ? 1 : Math.max(1, v.count | 0); }
    function xfs() {
      if (def.needs && def.needs(v, ctx)) return null;
      if (def.xfs) return def.xfs(v, ctx);
      var n = copies(), total = v.op !== 'move' && v.spacing === 'total' && def.spacing, out = [];
      for (var k = 1; k <= n; k++) { var M = def.step(v, total ? k / n : k, ctx); if (!M) return null; out.push(M); }
      return out;
    }
    ctx.xfs = xfs; ctx.targets = targets;
    function opts() { return { copy: v.op !== 'move', join: v.op === 'join', mirrorText: !!v.mirrorText }; }
    function preview() {
      var list = null;
      try { list = targets().length ? xfs() : null; } catch (er) { list = null; }
      App.tempEntities = list && list.length ? transformPreview(f, targets(), list, opts()) : [];
      UI.updateTemp();
    }
    ctx.preview = preview;
    function setBox(b) {
      v.box = b;
      var pt = def.points && def.points[b];
      cmd.onSketchPoint = pt ? pointClick : null;
      cmd.onSketchMove = pt && pt.live ? function (uv, mx, my) { var keep = v[pt.key]; v[pt.key] = snapPoint(f, uv, mx, my); preview(); v[pt.key] = keep; } : null;
      UI.renderPM();
      UI.setStatus(pt ? pt.prompt : b === 'axis' ? 'Click a sketch line to mirror about.' : v.entities.length && def.ready ? def.ready : 'Click sketch entities, or drag a box round them, to add them (click again to remove).');
    }
    ctx.setBox = setBox;
    function pointClick(uv, mx, my) {
      fresh();
      var b = v.box, pt = def.points[b];
      v[pt.key] = snapPoint(f, uv, mx, my);
      if (def.afterPoint && def.afterPoint(b, ctx)) return;
      setBox(pt.next || 'entities');
      preview();
    }
    function sync() {
      if (v.box !== 'entities') return;
      var s = selIdx(f).filter(function (i) { return !excluded(i); });
      if (s.join() === v.entities.join()) return;
      v.entities = s;
      UI.renderPM(); preview();
    }
    function blocked() {
      if (!targets().length) return 'Select the sketch entities to ' + def.title.toLowerCase() + '.';
      return def.needs ? def.needs(v, ctx) || '' : '';
    }
    function apply(keep) {
      fresh();
      var why = blocked();
      if (why) { UI.toast(why); UI.setStatus(why); return false; }
      var list = xfs();
      if (!list || !list.length) { UI.toast('Set the transform first.'); return false; }
      var r = transformEntities(f, targets(), list, opts());
      if (!r.ok) { UI.toast(r.error); UI.setStatus(r.error); return false; }
      App.tempEntities = []; UI.updateTemp();
      ctx.last = r;
      memKeep(def.name, v, def.forget);
      UI.setStatus(r.message);
      if (def.onApplied) def.onApplied(r, ctx);
      if (keep) {
        // ✓+: the result is selected and in the box for the next transform; the parameters stay
        fresh();
        v.entities = (r.entities && r.entities.length ? r.entities : []).concat(r.added || [], r.joins || []).filter(function (i) { return f.entities[i]; });
        if (v.box !== 'entities') setBox('entities'); else UI.renderPM();
        preview();
      }
      return true;
    }
    ctx.apply = apply;
    var opFields = [];
    if (def.ops && def.ops.length > 1) opFields.push({ type: 'radio', key: 'op', options: def.ops, rerender: true });
    if (def.count !== false && def.ops && def.ops.some(function (o) { return o[0] !== 'move'; })) {
      opFields.push({ type: 'number', label: 'Number of copies', key: 'count', step: 1, min: 1, show: function (x) { return x.op !== 'move'; } });
      if (def.spacing) opFields.push({ type: 'radio', key: 'spacing', options: [['between', def.spacing[0]], ['total', def.spacing[1]]], show: function (x) { return x.op !== 'move'; } });
    }
    var groups = [{ title: def.boxTitle || 'Entities', fields: [{ type: 'pick', icon: def.icon, placeholder: def.allWhenEmpty ? 'Nothing selected: the whole sketch' : 'Select sketch entities…',
      value: function (x) { return x.entities.length ? x.entities.length + ' entit' + (x.entities.length > 1 ? 'ies' : 'y') : ''; },
      active: function (x) { return x.box === 'entities'; }, onActivate: function () { setBox('entities'); },
      items: function (x) { return x.entities.map(function (i) { var e = f.entities[i]; return { label: (NAMES[e && e.t] || 'Entity') + (i + 1) }; }); },
      onRemove: function (x, i) { x.entities.splice(i, 1); if (UI.setSelection) UI.setSelection(x.entities.map(function (k) { return { kind: 'entity', index: k }; })); UI.renderPM(); preview(); },
      onClear: function (x) { x.entities.length = 0; if (UI.setSelection) UI.setSelection([]); UI.renderPM(); preview(); } }] }];
    if (opFields.length) groups.push({ title: 'Operation', fields: opFields });
    groups = groups.concat(def.groups(v, ctx));
    var spec = {
      title: def.title, icon: def.icon, values: v, command: cmd, keepSelection: true, transform: def.name,
      message: def.message,
      onSelection: sync,
      onEntityPick: function (hit) { return def.onEntityPick ? !!def.onEntityPick(hit, ctx) : false; },
      groups: groups,
      onChange: function (x, key) { if (def.onChange) def.onChange(key, ctx); preview(); },
      okBlocked: blocked,
      onOK: function () { return apply(false) ? undefined : false; },
      extraActions: [{ title: 'OK and keep open (✓+): apply, then transform the result again', icon: 'okPlus', onclick: function () { apply(true); } }],
      onCancel: function () { App.tempEntities = []; UI.updateTemp(); UI.setStatus(def.title + ' cancelled.'); },
      onClose: function () { App.tempEntities = []; UI.updateTemp(); if (def.onClose) def.onClose(ctx); }
    };
    UI.openPM(spec);
    ctx.spec = spec;
    if (def.onOpen) def.onOpen(ctx);
    if (def.firstBox && (v.entities.length || def.allWhenEmpty)) setBox(def.firstBox(v, ctx));
    else UI.setStatus(v.entities.length ? def.ready || def.title + ': set the transform, then Enter (✓).' : 'Select the sketch entities (click them, or drag a box round them).');
    preview();
    return ctx;
  }
  UI.transformPM = transformPM;
  function pointField(key, box, label, icon) {
    return { type: 'pick', icon: icon || 'point', placeholder: label, value: function (x) { return x[key] ? label + ' ' + fmtPt(x[key]) : ''; },
      active: function (x) { return x.box === box; }, onActivate: function (x) { activateBox(x.box === box ? 'entities' : box); } };
  }
  // a pick box makes itself the one graphics-area clicks go to (a second click hands them back to the entities box)
  var current = null;
  function activateBox(b) { if (current && UI.pmSpec && UI.pmSpec() === current.spec) current.setBox(b); }
  var OPS3 = [['move', 'Move'], ['copy', 'Copy'], ['join', 'Join']], OPS2 = [['move', 'Move'], ['copy', 'Copy']];

  // ------------------------------------------------------------------ Translate
  // Mastercam: Transform ▸ Translate. Delta X / Y, Polar (length and angle), or From / To points picked on screen;
  // Move / Copy / Join with Number of copies spaced by Distance between or Total distance.
  function cmdTTranslate() {
    transformPM({
      name: 'translate', title: 'Translate', icon: 'tTranslate', ops: OPS3, spacing: ['Distance between', 'Total distance'],
      message: 'Select the sketch entities, then set the distance: Delta X / Y, Polar, or a From and a To point picked on screen.',
      ready: 'Translate: type Delta X / Y (fractions like 1/2 work), or Polar, or pick From / To points; Enter (✓) moves, ✓+ keeps going.',
      values: { mode: 'xy', dx: 0, dy: 0, len: 0, ang: 0, from: null, to: null },
      points: { from: { key: 'from', prompt: 'Click the From point.', next: 'to' }, to: { key: 'to', prompt: 'Click the To point.', live: true } },
      firstBox: function (v) { return v.mode === 'fromto' ? 'from' : 'entities'; },
      groups: function () {
        return [{ title: 'Direction and distance', fields: [
          { type: 'radio', key: 'mode', options: [['xy', 'Delta X / Y'], ['polar', 'Polar'], ['fromto', 'From / To points']], rerender: true },
          { type: 'number', label: 'Delta X', key: 'dx', unit: 'u', show: function (x) { return x.mode === 'xy'; } },
          { type: 'number', label: 'Delta Y', key: 'dy', unit: 'u', show: function (x) { return x.mode === 'xy'; } },
          { type: 'number', label: 'Length', key: 'len', unit: 'u', show: function (x) { return x.mode === 'polar'; } },
          { type: 'number', label: 'Angle', key: 'ang', unit: '°', show: function (x) { return x.mode === 'polar'; } },
          pointField('from', 'from', 'From'), pointField('to', 'to', 'To')
        ].map(function (fd) { if (fd.type === 'pick') fd.show = function (x) { return x.mode === 'fromto'; }; return fd; }) }];
      },
      onChange: function (key, c) { if (key === 'mode') { c.v.from = null; c.v.to = null; c.setBox(c.v.mode === 'fromto' ? 'from' : 'entities'); } },
      needs: function (v) { return v.mode === 'fromto' && !(v.from && v.to) ? 'Click the From and To points.' : ''; },
      step: function (v, t) {
        var d = v.mode === 'polar' ? [(+v.len || 0) * cosd(+v.ang || 0), (+v.len || 0) * sind(+v.ang || 0)] : v.mode === 'fromto' ? (v.from && v.to ? [v.to[0] - v.from[0], v.to[1] - v.from[1]] : null) : [+v.dx || 0, +v.dy || 0];
        return d ? A.translate(tidy(d[0] * t), tidy(d[1] * t)) : null;
      }
    });
  }

  // ------------------------------------------------------------------ Rotate
  // Mastercam: Transform ▸ Rotate. Centre of rotation (the origin, or a point picked), Angle, Number of copies spaced by
  // Angle between or Total sweep; Rotate (the entities turn) or Translate (they travel round the centre keeping their
  // direction); Move / Copy / Join.
  function cmdTRotate() {
    var ctx = transformPM({
      name: 'rotate', title: 'Rotate', icon: 'tRotate', ops: OPS3, spacing: ['Angle between', 'Total sweep'],
      message: 'Select the sketch entities, then the centre of rotation (the origin unless you pick one) and the angle.',
      ready: 'Rotate: type the angle; the centre is the origin unless you click the Center box and a point. Enter (✓) applies.',
      values: { center: [0, 0], angle: 90, method: 'rotate' },
      points: { center: { key: 'center', prompt: 'Click the centre of rotation.' } },
      groups: function () {
        return [{ title: 'Rotation', fields: [
          { type: 'radio', key: 'method', options: [['rotate', 'Rotate'], ['translate', 'Translate (keep direction)']] },
          pointField('center', 'center', 'Center'),
          { type: 'buttons', buttons: [{ label: 'Origin', onclick: function (x) { x.center = [0, 0]; UI.renderPM(); ctx.preview(); } }] },
          { type: 'number', label: 'Angle', key: 'angle', unit: '°' }
        ] }];
      },
      step: function (v, t, c) {
        var R = A.rotate(tidy((+v.angle || 0) * t), v.center[0], v.center[1]);
        if (v.method !== 'translate') return R;
        var b = selectionBox(c.f, c.targets());
        if (!b) return null;
        var to = A.apply(R, b.c);
        return A.translate(tidy(to[0] - b.c[0]), tidy(to[1] - b.c[1]));
      }
    });
  }

  // ------------------------------------------------------------------ Mirror
  // Mastercam: Transform ▸ Mirror. About the X axis (at a Y value), the Y axis (at an X value), a line at an angle
  // through a point, a sketch line picked, or two points; Move / Copy; Mirror text (off: text stays readable).
  function cmdTMirror() {
    transformPM({
      name: 'mirror', title: 'Mirror', icon: 'tMirror', ops: OPS2, count: false,
      message: 'Select the sketch entities, then the mirror line: the X or Y axis, a line at an angle through a point, a sketch line or two points.',
      // lane BY: with the entities preselected the status said to click entities; it says what is left to do
      ready: 'Mirror: pick the mirror line (X / Y axis, an angle through a point, a sketch line or two points); Enter (✓) mirrors, Copy by default.',
      values: { axis: 'y', yv: 0, xv: 0, mang: 45, mpt: [0, 0], line: -1, p1: null, p2: null, mirrorText: false, op: 'copy' }, forget: ['line'],
      points: { mpt: { key: 'mpt', prompt: 'Click the point the mirror line goes through.' }, p1: { key: 'p1', prompt: 'Click the first point of the mirror line.', next: 'p2' }, p2: { key: 'p2', prompt: 'Click the second point of the mirror line.' } },
      excluded: function (v) { return v.axis === 'line' && v.line >= 0 ? [v.line] : []; },
      firstBox: function (v) { return v.axis === 'line' && v.line < 0 ? 'axis' : v.axis === 'pts' && !v.p2 ? 'p1' : 'entities'; },
      groups: function () {
        function only(a) { return function (x) { return x.axis === a; }; }
        return [{ title: 'Axis', fields: [
          { type: 'radio', key: 'axis', options: [['x', 'X axis'], ['y', 'Y axis'], ['angle', 'Angle through a point'], ['line', 'Line'], ['pts', 'Two points']], rerender: true },
          { type: 'number', label: 'Y', key: 'yv', unit: 'u', show: only('x') },
          { type: 'number', label: 'X', key: 'xv', unit: 'u', show: only('y') },
          { type: 'number', label: 'Angle', key: 'mang', unit: '°', show: only('angle') },
          (function (fd) { fd.show = only('angle'); return fd; })(pointField('mpt', 'mpt', 'Through')),
          { type: 'pick', icon: 'centerline', placeholder: 'Click a sketch line', show: only('line'), value: function (x) { return x.line >= 0 ? 'Line' + (x.line + 1) : ''; },
            active: function (x) { return x.box === 'axis'; }, onActivate: function (x) { activateBox(x.box === 'axis' ? 'entities' : 'axis'); } },
          (function (fd) { fd.show = only('pts'); return fd; })(pointField('p1', 'p1', 'Point 1')),
          (function (fd) { fd.show = only('pts'); return fd; })(pointField('p2', 'p2', 'Point 2'))
        ] }, { title: 'Options', fields: [{ type: 'check', label: 'Mirror text', key: 'mirrorText' }] }];
      },
      onChange: function (key, c) { if (key === 'axis') c.setBox(c.v.axis === 'line' ? 'axis' : c.v.axis === 'pts' && !c.v.p2 ? 'p1' : 'entities'); },
      onEntityPick: function (hit, c) {
        if (c.v.box !== 'axis') return false;
        var e = c.f.entities[hit.index];
        if (!e || e.t !== 'line') { UI.setStatus('Mirror about a line: click a sketch line.'); return true; }
        c.v.line = hit.index;
        c.v.entities = c.v.entities.filter(function (i) { return i !== hit.index; });
        c.setBox('entities'); c.preview();
        return true;
      },
      needs: function (v, c) {
        if (v.axis === 'line' && !(v.line >= 0 && c.f.entities[v.line] && c.f.entities[v.line].t === 'line')) return 'Click the sketch line to mirror about.';
        if (v.axis === 'pts' && !(v.p1 && v.p2 && Math.hypot(v.p2[0] - v.p1[0], v.p2[1] - v.p1[1]) > 1e-9)) return 'Click two points of the mirror line.';
        return '';
      },
      step: function (v, t, c) {
        if (v.axis === 'x') return A.mirror(0, +v.yv || 0, 0);
        if (v.axis === 'y') return A.mirror(+v.xv || 0, 0, 90);
        if (v.axis === 'angle') return A.mirror(v.mpt[0], v.mpt[1], +v.mang || 0);
        if (v.axis === 'line') { var l = c.f.entities[v.line]; return l ? A.mirrorDir(l.x1, l.y1, l.x2 - l.x1, l.y2 - l.y1) : null; }
        return v.p1 && v.p2 ? A.mirrorDir(v.p1[0], v.p1[1], v.p2[0] - v.p1[0], v.p2[1] - v.p1[1]) : null;
      }
    });
  }

  // ------------------------------------------------------------------ Move to Origin
  // Mastercam: Transform ▸ Move to Origin. Click a point: the selection (or, with nothing selected, the whole sketch)
  // moves so that point lands on the origin, at once, one undo step.
  function cmdTMoveToOrigin() {
    transformPM({
      name: 'moveToOrigin', title: 'Move to Origin', icon: 'tMoveOrigin', ops: [['move', 'Move']], allWhenEmpty: true, boxTitle: 'Entities (nothing selected: the whole sketch)',
      message: 'Click the point that goes to the origin. With nothing selected the whole sketch moves.',
      values: { pt: null },
      points: { pt: { key: 'pt', prompt: 'Click the point to move to the origin.' } },
      firstBox: function () { return 'pt'; },
      groups: function () { return [{ title: 'Point', fields: [pointField('pt', 'pt', 'Point')] }]; },
      needs: function (v) { return v.pt ? '' : 'Click the point to move to the origin.'; },
      afterPoint: function (b, c) { if (b === 'pt' && c.v.pt) { UI.pmOK(); return true; } return false; },
      step: function (v) { return v.pt ? A.translate(-v.pt[0], -v.pt[1]) : null; }
    });
  }

  // ------------------------------------------------------------------ Dynamic
  // Mastercam: Transform ▸ Dynamic, with Mastercam's dynamic gnomon (lane BN). A 3D gnomon at the transform origin:
  // X (red), Y (green) and Z (blue) arrows with cone heads and the axis letter at each tip, a grey ball at the centre,
  // and three quarter-arc rotation handles between the axis pairs, each in the colour of the axis it turns about, with
  // white ticks along it. Drag an arrow to move along it (a guide line runs along the axis), an arc to turn about its
  // axis (a dotted yellow ring with direction arrows and the swept wedge); the value box next to the cursor shows the
  // distance or the angle, and a number typed while dragging, or into the box after it, sets the move exactly (Enter;
  // Tab moves on to the PropertyManager). Angles snap to 1° (15° with Shift, or the PM's Angle increment), distances to
  // the document's precision and to a sketch point the gnomon lands on. The ball drags the gnomon itself without moving
  // the geometry (it snaps to sketch points and the origin); a click on the X or Y letter, then on a line, aligns that
  // axis with the line (Mastercam "align to geometry"). In a sketch only in-plane moves apply: the Z arrow and the two
  // out-of-plane arcs are drawn faded and are inert ("Only in-plane moves apply in a sketch"). Drawn as an SVG overlay
  // that projects 3D points every frame, so it keeps its size on screen at any zoom and follows the view's rotation.
  // The moves add up until ✓; the gnomon travels with the geometry.
  var GN = { len: 110, arc: 0.62, ring: 1.3, hit: 8, ball: 6.5, head: 15, headW: 5.5 };
  var GCOL = { x: '#e5322d', y: '#2fae3d', z: '#2f66d6', ring: '#f2d21b', wedge: '#e0503c' };
  var INERT_TIP = 'Only in-plane moves apply in a sketch';
  function cmdTDynamic() {
    var overlay = null, layer = null, box = null, tip = null, raf = 0, last = null, live = null, hover = null, aligning = null, shift = false;
    var ctx = transformPM({
      name: 'dynamic', title: 'Dynamic', icon: 'tDynamic', ops: OPS2, spacing: null,
      message: 'Select the sketch entities and place the gnomon (its Origin box, or drag the ball). Drag an arrow to move, an arc to rotate; type a value while dragging (Enter) for an exact one; click the X or Y letter, then a line, to align the axis.',
      ready: 'Dynamic: drag an arrow to move or an arc to turn (type a value while dragging for an exact one), or type Delta X / Y and Angle; ✓ applies.',
      values: { origin: [0, 0], dx: 0, dy: 0, ang: 0, inc: 1, tilt: 0 }, forget: ['dx', 'dy', 'ang', 'tilt'],
      points: { origin: { key: 'origin', prompt: 'Click where the gnomon goes.' } },
      groups: function () {
        return [{ title: 'Gnomon', fields: [
          pointField('origin', 'origin', 'Origin'),
          { type: 'number', label: 'Delta X', key: 'dx', unit: 'u' },
          { type: 'number', label: 'Delta Y', key: 'dy', unit: 'u' },
          { type: 'number', label: 'Angle', key: 'ang', unit: '°' },
          { type: 'number', label: 'Angle increment', key: 'inc', unit: '°', step: 1, min: 0 },
          { type: 'number', label: 'X axis angle', key: 'tilt', unit: '°' },
          { type: 'buttons', buttons: [{ label: 'Reset', onclick: function (x) { x.dx = 0; x.dy = 0; x.ang = 0; last = null; hideBox(); UI.renderPM(); ctx.preview(); } }] }
        ] }];
      },
      onChange: function (key) { if (key === 'origin') { last = null; hideBox(); } },
      needs: function (v) { return (+v.dx || 0) || (+v.dy || 0) || (+v.ang || 0) ? '' : 'Drag an arrow or an arc of the gnomon (or type the values).'; },
      step: function (v, t) { return A.power(pose(v), t); },
      onEntityPick: function (hit) { return alignPick(hit); },
      onApplied: function () { var v = ctx.v; v.origin = A.apply(pose(v), v.origin).map(tidy); v.tilt = tidy(normDeg((+v.tilt || 0) + (+v.ang || 0))); v.dx = 0; v.dy = 0; v.ang = 0; last = null; hideBox(); },
      onOpen: function (c) { c.cmd.onSketchDrag = dragHook; startOverlay(); },
      onClose: function () { stopOverlay(); }
    });
    if (!ctx) return;
    var cmd = ctx.cmd;
    // the pose: turned by ang about the origin, then moved by (dx, dy)
    function pose(v, extra) {
      var dx = +v.dx || 0, dy = +v.dy || 0, an = +v.ang || 0;
      if (extra) { dx += extra.dx || 0; dy += extra.dy || 0; an += extra.ang || 0; }
      return A.mul(A.translate(dx, dy), A.rotate(an, v.origin[0], v.origin[1]));
    }
    // the gnomon in the sketch: its centre and its in-plane axes (turned by the X axis angle plus the rotation so far)
    function frame() { var v = ctx.v, o = [v.origin[0] + (+v.dx || 0), v.origin[1] + (+v.dy || 0)], a = (+v.ang || 0) + (+v.tilt || 0); return { o: o, x: [cosd(a), sind(a)], y: [-sind(a), cosd(a)], a: a }; }
    // ---- the 3D frame and its projection
    function frame3() {
      var pl = UI.activePlane(), fr = frame(), o3 = K.to3D(pl, fr.o[0], fr.o[1]), so = UI.worldToScreen(o3), px = pxWorld(so[0], so[1]) || 1;
      function dir(u) { return [pl.x[0] * u[0] + pl.y[0] * u[1], pl.x[1] * u[0] + pl.y[1] * u[1], pl.x[2] * u[0] + pl.y[2] * u[1]]; }
      return { pl: pl, fr: fr, o3: o3, so: so, px: px, L: GN.len * px, ax: { x: dir(fr.x), y: dir(fr.y), z: [pl.n[0], pl.n[1], pl.n[2]] } };
    }
    function at3(F, a, b, c) { var o = F.o3, X = F.ax.x, Y = F.ax.y, Z = F.ax.z; return [o[0] + X[0] * a + Y[0] * b + Z[0] * c, o[1] + X[1] * a + Y[1] * b + Z[1] * c, o[2] + X[2] * a + Y[2] * b + Z[2] * c]; }
    function depth(p) { var d = UI.cam && UI.cam.dir; return d ? p[0] * d.x + p[1] * d.y + p[2] * d.z : 0; }
    var ARCS = { rz: ['x', 'y'], rx: ['y', 'z'], ry: ['z', 'x'] };   // each arc: the axes it runs between (about the third)
    var INERT = { z: 1, rx: 1, ry: 1, lz: 1 };                        // in a sketch: out of the plane
    function inert(k) { return !!INERT[k]; }
    function unit(k) { return k === 'x' ? [1, 0, 0] : k === 'y' ? [0, 1, 0] : [0, 0, 1]; }
    // a point of the arc / ring between axes a and b at angle deg (gnomon coordinates), radius r (world)
    function onArc(F, a, b, deg, r) { var ua = unit(a), ub = unit(b), c = Math.cos(deg * D2R), s = Math.sin(deg * D2R); return at3(F, (ua[0] * c + ub[0] * s) * r, (ua[1] * c + ub[1] * s) * r, (ua[2] * c + ub[2] * s) * r); }
    // the gnomon on screen: centre, arrow tips, letters, the arcs' points (pixels) and the frame
    function geo() {
      var F = frame3(), L = F.L, R = L * GN.arc, g = { o: F.so, F: F, R: GN.len * GN.arc, L: GN.len, uv: F.fr.o.slice(), tip: {}, letter: {}, arc: {}, arc3: {} };
      ['x', 'y', 'z'].forEach(function (k) {
        var u = unit(k), t3 = at3(F, u[0] * L, u[1] * L, u[2] * L), t = UI.worldToScreen(t3), d = [t[0] - F.so[0], t[1] - F.so[1]], n = Math.hypot(d[0], d[1]);
        g.tip[k] = t; g.tip[k].d = depth(t3);
        g.letter[k] = n > 1 ? [t[0] + d[0] / n * 14, t[1] + d[1] / n * 14] : [t[0] + 14, t[1] - 14];
      });
      Object.keys(ARCS).forEach(function (k) {
        var pts = [], p3 = [];
        for (var i = 0; i <= 18; i++) { var q = onArc(F, ARCS[k][0], ARCS[k][1], i * 5, R); p3.push(q); pts.push(UI.worldToScreen(q)); }
        g.arc[k] = pts; g.arc3[k] = p3;
      });
      g.arcPoint = function (k, deg, scale) { return UI.worldToScreen(onArc(F, ARCS[k][0], ARCS[k][1], deg, R * (scale || 1))); };
      return g;
    }
    ctx.gnomon = geo;
    function segDist(p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
    function polyDist(p, pts) { var d = 1e9; for (var i = 1; i < pts.length; i++) d = Math.min(d, segDist(p, pts[i - 1], pts[i])); return d; }
    // what is under a screen point: 'ball', 'lx' / 'ly' / 'lz' (letters), 'x' / 'y' / 'z' (arrows), 'rz' / 'rx' / 'ry'
    // (arcs), or null; a live handle wins over an inert one that happens to project onto it
    function hitPart(p) {
      var g = geo();
      if (Math.hypot(p[0] - g.o[0], p[1] - g.o[1]) <= GN.ball + 3) return 'ball';
      var k, best = null, bd = GN.hit, bestI = null, bdI = GN.hit;
      for (k in g.letter) if (Math.hypot(p[0] - g.letter[k][0], p[1] - g.letter[k][1]) <= 9) return 'l' + k;
      function cand(key, d) { if (inert(key)) { if (d < bdI) { bdI = d; bestI = key; } } else if (d < bd) { bd = d; best = key; } }
      for (k in g.tip) cand(k, segDist(p, g.o, g.tip[k]));
      for (k in g.arc) cand(k, polyDist(p, g.arc[k]));
      return best || bestI;
    }
    ctx.hitPart = hitPart;
    // ---- the overlay
    function startOverlay() {
      var host = $('dim-layer') ? $('dim-layer').parentNode : $('viewport');
      overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      overlay.setAttribute('class', 'tf-gnomon');
      var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      defs.innerHTML = '<radialGradient id="tf-gn-ball" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#f4f4f4"/><stop offset="0.6" stop-color="#9a9a9a"/><stop offset="1" stop-color="#4a4a4a"/></radialGradient>' +
        '<radialGradient id="tf-gn-ball-hot" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#d0d0d0"/><stop offset="1" stop-color="#7a7a7a"/></radialGradient>';
      overlay.appendChild(defs);
      layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      overlay.appendChild(layer);
      host.appendChild(overlay);
      box = document.createElement('input');
      box.className = 'tf-dyn-val'; box.type = 'text'; box.hidden = true; box.setAttribute('aria-label', 'Dynamic value');
      ['mousedown', 'mouseup', 'click', 'wheel'].forEach(function (t) { box.addEventListener(t, function (ev) { ev.stopPropagation(); }); });
      box.addEventListener('keydown', function (ev) {
        ev.stopPropagation();
        // lane BP: Enter applies a new entry and keeps the box; Enter with nothing new typed is ✓ (ui-commands.js pmEnter)
        if (ev.key === 'Enter') { ev.preventDefault(); if (box.value === box._armed) UI.pmEnter(null); else typed(box.value); }
        else if (ev.key === 'Tab') { ev.preventDefault(); if (typed(box.value) && UI.pmFocusField) UI.pmFocusField(last && last.kind === 'rz' ? 'ang' : 'dx'); }
        else if (ev.key === 'Escape') { ev.preventDefault(); hideBox(); UI.escapeCommand(); }   // lane CG: Esc ends Dynamic (ui-commands.js escapeCommand)
      });
      host.appendChild(box);
      tip = document.createElement('div');
      tip.className = 'tf-dyn-tip'; tip.hidden = true; tip.textContent = INERT_TIP;
      host.appendChild(tip);
      window.addEventListener('mousemove', onMove, true);
      window.addEventListener('mouseup', onUp, true);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('keyup', onKeyUp, true);
      var tick = function () { if (!overlay) return; draw(); raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    }
    function stopOverlay() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKeyUp, true);
      [overlay, box, tip].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
      overlay = layer = box = tip = null;
      setCursor('');
    }
    function hideBox() { if (box) { box.hidden = true; if (document.activeElement === box) box.blur(); } }
    function setCursor(c) { var vp = $('viewport'); if (vp && vp.style.cursor !== c) vp.style.cursor = c; }
    function vpPos(ev) { var vp = $('viewport'); if (!vp) return null; var r = vp.getBoundingClientRect(), p = [ev.clientX - r.left, ev.clientY - r.top]; return p[0] < 0 || p[1] < 0 || p[0] > r.width || p[1] > r.height ? null : p; }
    // hover: the handle under the cursor brightens, the cursor says what a drag would do, an inert handle shows why not
    function onMove(ev) {
      shift = !!ev.shiftKey;
      if (live || !overlay || App.mode !== 'sketch') return;
      var p = vpPos(ev), h = p && !(ev.buttons & 1) ? hitPart(p) : null;
      if (ev.target === box) h = null;
      hover = h;
      setCursor(!h ? '' : h === 'ball' ? 'move' : inert(h) ? 'not-allowed' : h.charAt(0) === 'l' ? 'pointer' : 'grab');
      if (tip) {
        if (h && inert(h) && p) { tip.hidden = false; tip.style.left = Math.round(p[0] + 14) + 'px'; tip.style.top = Math.round(p[1] + 18) + 'px'; }
        else tip.hidden = true;
      }
    }
    function onUp() { setTimeout(function () { if (cmd.onSketchPoint && cmd.onSketchPoint.tfSwallow) cmd.onSketchPoint = cmd.onSketchPoint.tfPrev || null; }, 0); }
    // a digit typed while dragging freezes the drag and edits the value exactly (Mastercam); Shift snaps angles to 15°
    function onKey(ev) {
      if (ev.key === 'Shift') shift = true;
      if (aligning && ev.key === 'Escape') aligning = null;   // lane CG: the Esc goes on and ends Dynamic (ui-app.js)
      if (!live || live.typing || live.kind === 'ball' || inert(live.kind)) return;
      if (!/^[-+0-9.]$/.test(ev.key)) return;
      ev.preventDefault(); ev.stopPropagation();
      live.typing = true;
      last = { kind: live.kind, base: live.base, val: live.val };
      if (box) { box.hidden = false; box.value = ev.key; try { box.focus({ preventScroll: true }); } catch (er) { } }
    }
    function onKeyUp(ev) { if (ev.key === 'Shift') shift = false; }
    // ---- drawing
    function el(tag, attrs) { var n = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); return n; }
    function pathOf(pts, close) { return pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('') + (close ? 'Z' : ''); }
    var shown = '';
    function draw() {
      if (!overlay || App.mode !== 'sketch') return;
      var g = geo(), F = g.F, hot = live ? live.kind : hover;
      var key = [g.o, g.tip.x, g.tip.y, g.tip.z].map(function (p) { return Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10); }).join(' ') + '|' + hot + '|' + (live ? live.val + ',' + live.a0 + ',' + live.typing : '') + '|' + aligning;
      if (key === shown) return;
      shown = key;
      while (layer.firstChild) layer.removeChild(layer.firstChild);
      var items = [];
      function put(d, node) { items.push({ d: d, n: node }); }
      // live feedback, behind the gnomon: the guide line along a dragged arrow, the ring and wedge of a dragged arc
      if (live && (live.kind === 'x' || live.kind === 'y' || live.kind === 'z')) {
        var t = g.tip[live.kind], d = [t[0] - g.o[0], t[1] - g.o[1]], n = Math.hypot(d[0], d[1]) || 1, u = [d[0] / n, d[1] / n];
        put(-1e9, el('line', { 'class': 'tf-gn-guide', x1: g.o[0] - u[0] * 4000, y1: g.o[1] - u[1] * 4000, x2: g.o[0] + u[0] * 4000, y2: g.o[1] + u[1] * 4000, stroke: GCOL[live.kind], 'stroke-width': 1, 'stroke-dasharray': '6 4', opacity: 0.8 }));
      }
      if (live && ARCS[live.kind]) {
        var ab = ARCS[live.kind], Rr = F.L * GN.ring, ring = [], i, sg = live.val < 0 ? -1 : 1;
        for (i = 0; i <= 72; i++) ring.push(UI.worldToScreen(onArc(F, ab[0], ab[1], i * 5, Rr)));
        put(-1e9, el('path', { 'class': 'tf-gn-ring', d: pathOf(ring, true), fill: 'none', stroke: GCOL.ring, 'stroke-width': 2.5, 'stroke-dasharray': '2 5', 'stroke-linecap': 'round' }));
        [100, 280].forEach(function (off) {   // direction arrowheads on the ring
          var a = live.a0 + sg * off, p = UI.worldToScreen(onArc(F, ab[0], ab[1], a, Rr)), q = UI.worldToScreen(onArc(F, ab[0], ab[1], a + sg * 4, Rr));
          var dx = q[0] - p[0], dy = q[1] - p[1], m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
          put(-1e9, el('polygon', { 'class': 'tf-gn-ring-arrow', points: [q[0] + dx * 6, q[1] + dy * 6, p[0] - dy * 4.5, p[1] + dx * 4.5, p[0] + dy * 4.5, p[1] - dx * 4.5].join(','), fill: GCOL.ring }));
        });
        var start = UI.worldToScreen(onArc(F, ab[0], ab[1], live.a0, Rr));
        put(-1e9, el('line', { 'class': 'tf-gn-start', x1: g.o[0], y1: g.o[1], x2: start[0], y2: start[1], stroke: GCOL.ring, 'stroke-width': 1, opacity: 0.8 }));
        if (live.val) {
          var wedge = [g.o], steps = Math.max(2, Math.ceil(Math.abs(live.val) / 3)), Rw = F.L * GN.arc;
          for (i = 0; i <= steps; i++) wedge.push(UI.worldToScreen(onArc(F, ab[0], ab[1], live.a0 + live.val * i / steps, Rw)));
          put(-1e8, el('path', { 'class': 'tf-gn-wedge', d: pathOf(wedge, true), fill: GCOL.wedge, opacity: 0.4, stroke: 'none' }));
        }
      }
      // the rotation handles: quarter arcs with white ticks, coloured for the axis they turn about
      Object.keys(ARCS).forEach(function (k) {
        var pts = g.arc[k], col = GCOL[k.charAt(1)], off = inert(k), hotK = hot === k, mid = g.arc3[k][9];
        var cls = 'tf-gn-arc tf-gn-arc-' + k + (off ? ' tf-gn-inert' : '') + (hotK ? ' hot' : '');
        var grp = el('g', { 'class': cls, opacity: off ? 0.3 : 1 });
        grp.appendChild(el('path', { d: pathOf(pts), fill: 'none', stroke: col, 'stroke-width': hotK ? 4.5 : 3, 'stroke-linecap': 'round' }));
        if (hotK) grp.appendChild(el('path', { d: pathOf(pts), fill: 'none', stroke: '#ffffff', 'stroke-width': 1.2, opacity: 0.8 }));
        for (var a = 15; a < 90; a += 15) {
          var Ri = F.L * GN.arc, q1 = UI.worldToScreen(onArc(F, ARCS[k][0], ARCS[k][1], a, Ri - 2.6 * F.px)), q2 = UI.worldToScreen(onArc(F, ARCS[k][0], ARCS[k][1], a, Ri + 2.6 * F.px));
          grp.appendChild(el('line', { x1: q1[0], y1: q1[1], x2: q2[0], y2: q2[1], stroke: '#ffffff', 'stroke-width': 1.5 }));
        }
        put(depth(mid), grp);
      });
      // the arrows: shaft, cone head, letter
      ['x', 'y', 'z'].forEach(function (k) {
        var t = g.tip[k], col = GCOL[k], off = inert(k), hotK = hot === k || hot === 'l' + k;
        var dx = t[0] - g.o[0], dy = t[1] - g.o[1], n = Math.hypot(dx, dy), u = n > 1 ? [dx / n, dy / n] : [0, 0];
        var grp = el('g', { 'class': 'tf-gn-arrow tf-gn-arrow-' + k + (off ? ' tf-gn-inert' : '') + (hotK ? ' hot' : ''), opacity: off ? 0.3 : 1 });
        var hl = Math.min(GN.head, n), hw = GN.headW * (hotK ? 1.25 : 1), b = [t[0] - u[0] * hl, t[1] - u[1] * hl];
        grp.appendChild(el('line', { x1: g.o[0], y1: g.o[1], x2: b[0], y2: b[1], stroke: col, 'stroke-width': hotK ? 4 : 2.8, 'stroke-linecap': 'round' }));
        if (n > 1) {
          grp.appendChild(el('ellipse', { cx: b[0], cy: b[1], rx: hw, ry: hw * 0.45, transform: 'rotate(' + (Math.atan2(u[1], u[0]) * R2D + 90).toFixed(1) + ' ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1) + ')', fill: col, stroke: 'rgba(0,0,0,0.35)', 'stroke-width': 0.8 }));
          grp.appendChild(el('polygon', { points: [t[0], t[1], b[0] - u[1] * hw, b[1] + u[0] * hw, b[0] + u[1] * hw, b[1] - u[0] * hw].join(','), fill: col, stroke: 'rgba(0,0,0,0.35)', 'stroke-width': 0.8, 'stroke-linejoin': 'round' }));
        } else grp.appendChild(el('circle', { cx: t[0], cy: t[1], r: hw, fill: col, stroke: 'rgba(0,0,0,0.35)', 'stroke-width': 0.8 }));
        var txt = el('text', { 'class': 'tf-gn-letter tf-gn-letter-' + k, x: g.letter[k][0], y: g.letter[k][1], fill: col, 'font-size': hotK ? 15 : 13, 'font-weight': 'bold', 'text-anchor': 'middle', 'dominant-baseline': 'central', 'paint-order': 'stroke', stroke: 'rgba(255,255,255,0.75)', 'stroke-width': 3 });
        txt.textContent = k.toUpperCase() + (aligning === k ? ' ?' : '');
        grp.appendChild(txt);
        put(t.d, grp);
      });
      // the ball, drawn over the shafts that start under it
      put(depth(F.o3) + 1e-9, el('circle', { 'class': 'tf-gn-ball' + (hot === 'ball' ? ' hot' : ''), cx: g.o[0], cy: g.o[1], r: hot === 'ball' ? GN.ball + 1.5 : GN.ball, fill: 'url(#tf-gn-ball' + (hot === 'ball' ? '-hot' : '') + ')', stroke: '#3a3a3a', 'stroke-width': 0.8 }));
      items.sort(function (a, b) { return a.d - b.d; });
      items.forEach(function (it) { layer.appendChild(it.n); });
    }
    // ---- values
    function decimals() { return UI.unitLabel() === 'in' ? 3 : 2; }
    function fmtVal(kind, val) { return ARCS[kind] ? (+val).toFixed(2) + '°' : UI.fmtDim(val); }
    function roundDist(val, px) { var r = UI.sketchNiceRound ? UI.sketchNiceRound(val, Math.max(px, 1e-9) * 1.5) : val; return tidy(+(+r).toFixed(decimals())); }
    function roundAng(d) { var inc = shift ? 15 : Math.max(+ctx.v.inc || 0, 0) || 1; return tidy(Math.round(d / inc) * inc); }
    function showBox(val, kind, p) {
      if (!box) return;
      box.hidden = false;
      if (p) { box.style.left = Math.round(p[0] + 16) + 'px'; box.style.top = Math.round(p[1] - 12) + 'px'; }
      box.value = fmtVal(kind, val); box._armed = box.value;
      box.title = ARCS[kind] ? 'Angle (°): type a value and press Enter' : 'Distance along ' + kind.toUpperCase() + ': type a value and press Enter';
    }
    function setPose(base, kind, val) {
      var v = ctx.v, fr0 = base.fr;
      if (ARCS[kind]) { v.dx = base.dx; v.dy = base.dy; v.ang = tidy(normDeg(base.ang + val)); if (v.ang > 180) v.ang = tidy(v.ang - 360); }
      else { var ax = kind === 'x' ? fr0.x : fr0.y; v.dx = tidy(base.dx + ax[0] * val); v.dy = tidy(base.dy + ax[1] * val); v.ang = base.ang; }
    }
    function typed(text) {
      if (!last) return false;
      var ang = !!ARCS[last.kind], r = UI.parseLength ? UI.parseLength(String(text).replace(/°/g, ''), { kind: ang ? 'angle' : 'length' }) : { value: parseFloat(text) };
      if (!r || r.error != null || !isFinite(r.value)) { UI.setStatus('Not a value: ' + text); return false; }
      setPose(last.base, last.kind, +r.value);
      last.val = +r.value;
      if (live) live.val = +r.value;
      if (box) { box.value = fmtVal(last.kind, r.value); box._armed = box.value; }
      shown = '';
      UI.renderPM(); ctx.preview();
      UI.setStatus((ang ? 'Rotated ' + UI.fmtNum(r.value, 4) + '°' : 'Moved ' + UI.fmtDim(r.value) + ' along ' + last.kind.toUpperCase()) + ' — press Enter again (or ✓) to apply and finish.');
      return true;
    }
    ctx.typed = typed;
    // the sketch point the gnomon's centre lands on when moved val along the axis (9 px), else null
    function pointOnAxis(o, ax, val, px) {
      var f = ctx.f, best = null, bd = 9 * px;
      if (!S) return null;
      function test(pt) { var w = [pt[0] - o[0], pt[1] - o[1]], along = w[0] * ax[0] + w[1] * ax[1], across = Math.abs(-w[0] * ax[1] + w[1] * ax[0]); var d = Math.hypot(along - val, across); if (across <= bd && d < bd) { bd = d; best = along; } }
      f.entities.forEach(function (e, i) { S.pointRefs(f, i).forEach(function (pr) { test(pr.pt); }); });
      test([0, 0]);
      return best == null ? null : tidy(best);
    }
    // the X or Y letter clicked, then a line: the gnomon's axis turns onto the line
    function alignPick(hit) {
      if (!aligning) return false;
      var e = hit && hit.kind === 'entity' ? ctx.f.entities[hit.index] : null;
      if (!e || e.t !== 'line') { UI.setStatus('Click a sketch line to align the ' + aligning.toUpperCase() + ' axis with.'); return true; }
      var v = ctx.v, la = Math.atan2(e.y2 - e.y1, e.x2 - e.x1) * R2D, t = la - (+v.ang || 0) - (aligning === 'y' ? 90 : 0);
      t = tidy(normDeg(t)); if (t > 180) t = tidy(t - 360);
      v.tilt = t;
      UI.setStatus(aligning.toUpperCase() + ' axis aligned with Line' + (hit.index + 1) + ' (' + UI.fmtNum(la, 2) + '°).');
      aligning = null; shown = '';
      UI.renderPM(); ctx.preview();
      return true;
    }
    function dragHook(p0, ev) {
      if (App.mode !== 'sketch') return null;
      var kind = hitPart(p0);
      if (!kind) return null;
      if (ev && ev.shiftKey) shift = true;
      // a press that is released where it was is a click on the handle, not a selection click: the letters start
      // "align to geometry", everything else just keeps the selection
      var prev = cmd.onSketchPoint;
      var swallow = function () {
        cmd.onSketchPoint = prev;
        if (kind === 'lx' || kind === 'ly') { aligning = kind.charAt(1); shown = ''; UI.setStatus('Click a sketch line to align the ' + aligning.toUpperCase() + ' axis with (Esc cancels).'); }
        else if (inert(kind)) UI.setStatus(INERT_TIP + '.');
      };
      swallow.tfSwallow = true; swallow.tfPrev = prev;
      cmd.onSketchPoint = swallow;
      var v = ctx.v, fr = frame(), base = { dx: +v.dx || 0, dy: +v.dy || 0, ang: +v.ang || 0, fr: fr, origin: v.origin.slice() }, uv0 = toUV(p0[0], p0[1]), val = 0;
      var a0 = uv0 ? Math.atan2((uv0[1] - fr.o[1]) * fr.y[1] + (uv0[0] - fr.o[0]) * fr.y[0], (uv0[0] - fr.o[0]) * fr.x[0] + (uv0[1] - fr.o[1]) * fr.x[1]) * R2D : 0;
      return {
        start: function () { if (cmd.onSketchPoint === swallow) cmd.onSketchPoint = prev; hideBox(); live = { kind: kind, base: base, val: 0, a0: a0, typing: false }; hover = null; shown = ''; if (tip) tip.hidden = true; },
        move: function (p) {
          if (live.typing || inert(kind) || kind.charAt(0) === 'l') return;
          var uv = toUV(p[0], p[1]);
          if (!uv || !uv0) return;
          if (kind === 'ball') {
            // the gnomon moves, the geometry stays: the same transform expressed about the new origin
            var gp = snapPoint(ctx.f, uv, p[0], p[1]), a = base.ang, c = cosd(a), s = sind(a), o = base.origin, w = [gp[0] - base.dx - o[0], gp[1] - base.dy - o[1]];
            var no = [tidy(o[0] + c * w[0] + s * w[1]), tidy(o[1] - s * w[0] + c * w[1])];
            v.origin = no; v.dx = tidy(gp[0] - no[0]); v.dy = tidy(gp[1] - no[1]);
            UI.renderPM(); shown = '';
            UI.setStatus('Gnomon at ' + fmtPt(gp) + '.');
            return;
          }
          if (ARCS[kind]) {
            var w0 = [uv0[0] - fr.o[0], uv0[1] - fr.o[1]], w1 = [uv[0] - fr.o[0], uv[1] - fr.o[1]];
            var d = (Math.atan2(w1[1], w1[0]) - Math.atan2(w0[1], w0[0])) * R2D; while (d > 180) d -= 360; while (d < -180) d += 360;
            val = roundAng(d);
          } else {
            var ax = kind === 'x' ? fr.x : fr.y, px = pxWorld(p[0], p[1]), raw = (uv[0] - uv0[0]) * ax[0] + (uv[1] - uv0[1]) * ax[1], snap = pointOnAxis(fr.o, ax, raw, px);
            val = snap != null ? snap : roundDist(raw, px);
          }
          live.val = val;
          setPose(base, kind, val);
          showBox(val, kind, p);
          UI.renderPM(); ctx.preview();
        },
        end: function (p) {
          var typing = live && live.typing;
          live = null; shown = '';
          if (kind === 'ball' || inert(kind) || kind.charAt(0) === 'l') { hideBox(); return; }
          // lane BY: a value typed during the drag and already entered (Enter) keeps its "press Enter again" status; the
          // release said to finish a value that was finished
          if (typing) { if (!(box && !box.hidden && box.value === box._armed)) UI.setStatus('Finish the value and press Enter (Tab moves on).'); return; }
          last = { kind: kind, base: base, val: val };
          showBox(val, kind, p);
          try { box.focus({ preventScroll: true }); box.select(); } catch (er) { }
          UI.setStatus('Type an exact value in the box and press Enter, drag again, or ✓.');
        }
      };
    }
    // for tests and scripts: the gnomon's screen geometry, what is under a point, the live state and the pose
    ctx.spec.dynamic = { geo: geo, hitPart: hitPart, typed: typed, pose: function () { return pose(ctx.v); }, state: function () { return { hover: hover, live: live, aligning: aligning, shift: shift, last: last }; } };
  }

  // ------------------------------------------------------------------ the Transform tab: group captions, search
  // Mastercam shows each group's name under its buttons (Position, Offset, Layout, Size). The ribbon items of the
  // Transform tab carry `group`; the captions are a layer under #ribbon-buttons, laid out from the buttons' places.
  // lane CC: any tab whose items carry `group` (the View tab too, also in an assembly): read from the items shown now
  function captions() {
    var rib = $('ribbon'), bar = $('ribbon-buttons');
    if (!rib || !bar) return;
    var items = UI.ribbonShownItems ? UI.ribbonShownItems() : UI.RIBBON && UI.RIBBON[App.ribbonTab], on = !!(items && items.some(function (it) { return it.group; })) && !(UI.drawingActive && UI.drawingActive());
    var layer = rib.querySelector(':scope > .rb-captions');
    // (lane CC: the cleared layer forgets what it showed, so the same captions come back on the next visit to the tab)
    if (!on) { if (rib.classList.contains('rb-has-captions')) rib.classList.remove('rb-has-captions'); if (layer && layer.firstChild) { layer.innerHTML = ''; layer._html = ''; } return; }
    if (!rib.classList.contains('rb-has-captions')) rib.classList.add('rb-has-captions');
    if (!layer) { layer = document.createElement('div'); layer.className = 'rb-captions'; layer.setAttribute('aria-hidden', 'true'); rib.insertBefore(layer, bar.nextSibling); }
    var kids = Array.prototype.filter.call(bar.children, function (c) { return !c.classList.contains('rb-more'); });
    if (kids.length !== items.length) return;
    var rr = rib.getBoundingClientRect(), br = bar.getBoundingClientRect(), groups = [], cur = null;
    items.forEach(function (it, i) {
      if (it.sep || !it.group) { cur = null; return; }
      var n = kids[i], r = n.getBoundingClientRect();
      if (n.classList.contains('rb-over') || !r.width) return;
      if (!cur || cur.name !== it.group) { cur = { name: it.group, l: r.left, r: r.right }; groups.push(cur); }
      cur.l = Math.min(cur.l, r.left); cur.r = Math.max(cur.r, r.right);
    });
    // lane DA: a group narrower than its name (the View tab's Managers: one column of small buttons) gets a caption as
    // wide as the name, centred under the group and kept clear of its neighbours (it was cut to "Mana")
    var prevR = -Infinity;
    groups.forEach(function (g, k) {
      var need = capTextWidth(g.name) + 8, w = g.r - g.l;
      if (w >= need) { prevR = g.r; return; }
      var nextL = k + 1 < groups.length ? groups[k + 1].l : rr.right, l = (g.l + g.r) / 2 - need / 2;
      l = Math.max(prevR + 2, Math.min(nextL - 2 - need, l));
      g.l = l; g.r = l + need; prevR = g.r;
    });
    var html = groups.map(function (g) { return '<span class="rb-caption" style="left:' + Math.round(g.l - rr.left) + 'px;width:' + Math.round(g.r - g.l) + 'px">' + g.name + '</span>'; }).join('');
    layer.style.top = Math.round(br.bottom - rr.top - 15) + 'px';
    if (layer._html !== html) { layer.innerHTML = html; layer._html = html; }
  }
  var capCtx = null;
  function capTextWidth(s) {
    if (!capCtx) { try { capCtx = document.createElement('canvas').getContext('2d'); } catch (e) { capCtx = null; } }
    if (!capCtx) return String(s).length * 6;
    var cs = window.getComputedStyle($('ribbon'));
    capCtx.font = '11px ' + (cs.fontFamily || 'Segoe UI, sans-serif');
    return Math.ceil(capCtx.measureText(String(s)).width);
  }
  var capFrame = 0;
  function captionsSoon() { if (!capFrame) capFrame = requestAnimationFrame(function () { capFrame = 0; captions(); }); }
  UI.transformCaptions = captions;
  function watchRibbon() {
    var bar = $('ribbon-buttons');
    if (!bar || typeof MutationObserver === 'undefined') return;
    new MutationObserver(captionsSoon).observe(bar, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', captionsSoon);
    captionsSoon();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchRibbon); else watchRibbon();

  UI.cmdTTranslate = cmdTTranslate;
  UI.cmdTRotate = cmdTRotate;
  UI.cmdTMirror = cmdTMirror;
  UI.cmdTMoveToOrigin = cmdTMoveToOrigin;
  UI.cmdTDynamic = cmdTDynamic;
})();
