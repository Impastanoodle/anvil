// ui-sketch-3d.js — rfLQ (2026-11-11, lane sketchgrey): 3D Sketch, 3D Sketch On Plane and Offset On Surface (Sketch tab,
// Insert menu). A 3D sketch is a reference-curve feature (kernel-features.js `sketch3d`: points in space, lines,
// centerlines, points, splines, sketch fillets, arcs from Offset On Surface) edited in its own PropertyManager while the
// graphics area draws in space:
//   - the drawing plane is XY, YZ or ZX through the last point (Tab switches it, as SolidWorks' space handle), or with
//     3D Sketch On Plane a plane / planar face picked into the sketch (entities drawn there stay on it: onPlane);
//   - a click near a point reuses it (Coincident), near the origin it is Fixed there; a segment within 8 px of an axis
//     through the previous point snaps to it and takes Along X / Y / Z; a click on the previous point ends the chain
//     (a double-click does that);
//   - the Select tool picks points and lines (Ctrl adds): one line shows its Length and the Along X / Y / Z buttons, two
//     points their Distance, one point its X / Y / Z, Fix and Sketch Fillet (corner radius), Delete removes them;
//   - relations and dimensions are solved here (sk3dSolve: weighted minimum-change Gauss-Newton on the point
//     coordinates), so the feature stores solved positions and the rebuild only reads them;
//   - Ctrl+Z inside steps back one edit, ✓ makes / updates the feature (one undo step), ✗ / Esc leaves the model as it was.
// Offset On Surface: a face's edges moved across it by a distance (Kernel.offsetOnSurface), added to the open 3D sketch
// (its group in the 3D Sketch PM) or, with none open, as a new 3D sketch from its own PropertyManager.
(function () {
  'use strict';
  if (typeof UI === 'undefined' || !UI.App) return;
  var App = UI.App, K = Kernel;
  var PLANES = {
    XY: { n: [0, 0, 1], x: [1, 0, 0], y: [0, 1, 0] },
    YZ: { n: [1, 0, 0], x: [0, 1, 0], y: [0, 0, 1] },
    ZX: { n: [0, 1, 0], x: [0, 0, 1], y: [1, 0, 0] }
  };
  var AXES = { alongX: [1, 0, 0], alongY: [0, 1, 0], alongZ: [0, 0, 1] };
  var REL_NAMES = { alongX: 'Along X', alongY: 'Along Y', alongZ: 'Along Z', fix: 'Fixed', onPlane: 'On Plane' };
  var SNAP_PX = 9, AXIS_PX = 8, LINE_PX = 6;
  var S = null;   // the open 3D sketch: { f, existing, hist, v (PM values), chain, spline, sel, group, cursor, picking }

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function scl(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function nrm(a) { var l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function r9(x) { return Math.round(x * 1e9) / 1e9; }
  function scr(p) { return UI.worldToScreen(p); }
  function sd(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function fmt(x) { return UI.fmtNum(x, 4); }

  // ------------------------------------------------------------------ the solver
  // the equations of the sketch (each: points it reads, f(P) -> residual) plus `extra` ones (an edit being made)
  function planeOf(f, k) {
    var ref = (f.planes || [])[k];
    if (!ref) return null;
    try { return K.resolvePlane(ref, App.model, (App.build && App.build.planes) || {}); } catch (e) { return null; }
  }
  function equations(f, extra) {
    var eqs = [];
    (f.rels || []).forEach(function (r) {
      var L = r.e != null ? f.ents[r.e] : null;
      if (AXES[r.type] && L && L.t === 'line') {
        [0, 1, 2].forEach(function (k) { if (!AXES[r.type][k]) eqs.push({ p: [L.a, L.b], f: function (P) { return P[1][k] - P[0][k]; } }); });
      } else if (r.type === 'fix' && r.at) {
        [0, 1, 2].forEach(function (k) { eqs.push({ p: [r.p], f: function (P) { return P[0][k] - r.at[k]; } }); });
      } else if (r.type === 'onPlane') {
        var pl = planeOf(f, r.pl);
        if (pl) eqs.push({ p: [r.p], f: function (P) { return dot(sub(P[0], pl.origin), pl.n); } });
      }
    });
    (f.dims || []).forEach(function (d) {
      if (d.k === 'len') { var L = f.ents[d.e]; if (L && L.t === 'line') eqs.push({ p: [L.a, L.b], f: function (P) { return len(sub(P[1], P[0])) - d.v; } }); }
      else if (d.k === 'dist') eqs.push({ p: [d.a, d.b], f: function (P) { return len(sub(P[1], P[0])) - d.v; } });
    });
    return eqs.concat(extra || []);
  }
  // solve(f, extra) -> true (points moved, every equation within 1e-9) | false (nothing changed)
  function solve(f, extra) {
    var eqs = equations(f, extra), n = f.pts.length, X = f.pts.map(function (p) { return p.slice(); });
    if (!eqs.length) return true;
    var held = {};
    (f.rels || []).forEach(function (r) { if (r.type === 'fix') held[r.p] = true; });
    var w = X.map(function (p, i) { return held[i] ? 1e-4 : i === 0 ? 0.05 : 1; });
    function resid() { return eqs.map(function (q) { return q.f(q.p.map(function (i) { return X[i]; })); }); }
    for (var it = 0; it < 60; it++) {
      var R = resid(), m = R.length, err = 0;
      R.forEach(function (x) { err = Math.max(err, Math.abs(x)); });
      if (err < 1e-11) break;
      // J (m × 3n, sparse by equation), numeric
      var J = eqs.map(function (q, qi) {
        var row = {};
        q.p.forEach(function (pi) {
          for (var k = 0; k < 3; k++) {
            var key = pi * 3 + k;
            if (row[key] != null) continue;
            var h = 1e-7 * (1 + Math.abs(X[pi][k])), s0 = X[pi][k];
            X[pi][k] = s0 + h; var fp = q.f(q.p.map(function (i) { return X[i]; }));
            X[pi][k] = s0 - h; var fm = q.f(q.p.map(function (i) { return X[i]; }));
            X[pi][k] = s0;
            row[key] = (fp - fm) / (2 * h);
          }
        });
        return row;
      });
      // A = J W Jᵀ + λI, solve A y = -R, Δ = W Jᵀ y
      var A = [], i, j;
      for (i = 0; i < m; i++) {
        A.push(new Array(m + 1).fill(0));
        for (j = 0; j <= i; j++) {
          var s = 0;
          for (var key in J[i]) if (J[j][key] != null) s += J[i][key] * J[j][key] * w[Math.floor(key / 3)];
          A[i][j] = s;
        }
      }
      for (i = 0; i < m; i++) { for (j = i + 1; j < m; j++) A[i][j] = A[j][i]; A[i][i] += 1e-12; A[i][m] = -R[i]; }
      var y = gauss(A, m);
      if (!y) return false;
      for (i = 0; i < m; i++) for (var key2 in J[i]) { var pi2 = Math.floor(key2 / 3); X[pi2][key2 % 3] += w[pi2] * J[i][key2] * y[i]; }
    }
    var e2 = 0;
    resid().forEach(function (x) { e2 = Math.max(e2, Math.abs(x)); });
    if (!(e2 < 1e-8)) return false;
    for (var p = 0; p < n; p++) f.pts[p] = X[p].map(r9);
    return true;
  }
  function gauss(A, m) {
    for (var c = 0; c < m; c++) {
      var piv = c;
      for (var r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-14) { A[piv][c] = 1e-14; }
      var t = A[c]; A[c] = A[piv]; A[piv] = t;
      for (r = 0; r < m; r++) {
        if (r === c) continue;
        var k = A[r][c] / A[c][c];
        if (!k) continue;
        for (var q = c; q <= m; q++) A[r][q] -= k * A[c][q];
      }
    }
    var y = [];
    for (var i = 0; i < m; i++) { y.push(A[i][m] / A[i][i]); if (!isFinite(y[i])) return null; }
    return y;
  }
  UI.sketch3dSolve = solve;   // test hook

  // ------------------------------------------------------------------ session helpers
  function snap() { S.hist.push(clone({ pts: S.f.pts, ents: S.f.ents, rels: S.f.rels, dims: S.f.dims, planes: S.f.planes })); if (S.hist.length > 200) S.hist.shift(); }
  function undoOne() {
    var h = S.hist.pop();
    if (!h) return false;
    Object.keys(h).forEach(function (k) { S.f[k] = h[k]; });
    S.chain = null; S.spline = null; S.sel = [];
    syncValues(); UI.renderPM(); draw();
    UI.setStatus('3D Sketch: undone.');
    return true;
  }
  function addPoint(p) { S.f.pts.push(p.map(r9)); return S.f.pts.length - 1; }
  function frameAt(anchor) {
    if (S.v.onPlane >= 0) {
      var pl = planeOf(S.f, S.v.onPlane);
      if (pl) return { n: pl.n, x: pl.x, y: pl.y, origin: pl.origin, on: S.v.onPlane };
    }
    var P = PLANES[S.v.dp] || PLANES.XY;
    return { n: P.n, x: P.x, y: P.y, origin: anchor || [0, 0, 0] };
  }
  function anchor() { return S.chain != null ? S.f.pts[S.chain] : S.spline ? S.f.pts[S.spline.p[S.spline.p.length - 1]] : [0, 0, 0]; }
  // the point under the cursor: { p (world), idx (an existing point) | null, origin, along (rel type) }
  function locate(mx, my) {
    var best = null, bd = SNAP_PX;
    S.f.pts.forEach(function (p, i) {
      if (!usedPoint(i)) return;
      var d = sd(scr(p), [mx, my]);
      if (d < bd) { bd = d; best = i; }
    });
    if (best != null) return { p: S.f.pts[best].slice(), idx: best };
    if (sd(scr([0, 0, 0]), [mx, my]) < SNAP_PX) return { p: [0, 0, 0], idx: null, origin: true };
    var A = anchor(), fr = frameAt(A), uv = UI.screenToPlane(mx, my, fr);
    if (!uv) return null;
    var P = K.to3D(fr, uv[0], uv[1]), out = { p: P, idx: null };
    if (S.chain != null) {
      // an axis through the previous point lying in the drawing plane
      Object.keys(AXES).forEach(function (t) {
        var ax = AXES[t];
        if (Math.abs(dot(ax, fr.n)) > 1e-9) return;
        var Q = add(A, scl(ax, dot(sub(P, A), ax))), d = sd(scr(Q), [mx, my]);
        if (d < AXIS_PX && len(sub(Q, A)) > 1e-9 && (!out.along || d < out.ad)) { out.p = Q; out.along = t; out.ad = d; }
      });
    }
    return out;
  }
  function usedPoint(i) {
    return S.f.ents.some(function (e) { return e.a === i || e.b === i || e.p === i || (Array.isArray(e.p) && e.p.indexOf(i) >= 0); });
  }
  function pointFor(loc) {
    if (loc.idx != null) return loc.idx;
    var i = addPoint(loc.p);
    if (loc.origin) S.f.rels.push({ type: 'fix', p: i, at: [0, 0, 0] });
    var fr = frameAt(anchor());
    if (fr.on != null) S.f.rels.push({ type: 'onPlane', p: i, pl: fr.on });
    return i;
  }
  function entLabel(i) {
    var e = S.f.ents[i];
    if (!e) return '';
    var n = 0;
    for (var k = 0; k <= i; k++) if (S.f.ents[k].t === e.t && !!S.f.ents[k].construction === !!e.construction) n++;
    return (e.t === 'line' ? (e.construction ? 'Centerline' : 'Line') : e.t === 'spline' ? 'Spline' : e.t === 'point' ? 'Point' : e.t === 'fillet' ? 'Fillet' : 'Arc') + n;
  }

  // ------------------------------------------------------------------ clicks
  function click(mx, my, ctrl) {
    var tool = S.v.tool, loc;
    if (tool === 'select') { selectAt(mx, my, ctrl); return; }
    loc = locate(mx, my);
    if (!loc) { UI.setStatus('3D Sketch: that click is edge-on to the drawing plane; press Tab for another plane.'); return; }
    if (tool === 'point') {
      snap();
      var pi = pointFor(loc);
      S.f.ents.push({ t: 'point', p: pi });
      changed('Point placed at ' + fmtP(S.f.pts[pi]) + '.');
      return;
    }
    if (tool === 'spline') {
      if (S.spline && loc.idx === S.spline.p[S.spline.p.length - 1]) { endChain('Spline finished.'); return; }
      snap();
      var si = pointFor(loc);
      if (!S.spline) { S.spline = { t: 'spline', p: [si] }; }
      else {
        S.spline.p.push(si);
        if (S.spline.p.length === 2) S.f.ents.push(S.spline);
      }
      changed('Spline point ' + S.spline.p.length + ' at ' + fmtP(S.f.pts[si]) + '. Click the last point again (or double-click) to finish.');
      return;
    }
    // line / centerline
    if (S.chain != null && loc.idx === S.chain) { endChain('Line chain ended.'); return; }
    snap();
    var b = pointFor(loc);
    if (S.chain == null) { S.chain = b; changed('Line start at ' + fmtP(S.f.pts[b]) + '. Click the end point.'); return; }
    var L = { t: 'line', a: S.chain, b: b };
    if (tool === 'centerline') L.construction = true;
    S.f.ents.push(L);
    var li = S.f.ents.length - 1;
    if (loc.along) S.f.rels.push({ type: loc.along, e: li });
    var closes = loc.idx != null;
    S.chain = closes ? null : b;
    changed(entLabel(li) + ' ' + fmt(len(sub(S.f.pts[L.b], S.f.pts[L.a]))) + ' ' + UI.unitLabel() + (loc.along ? ' (' + REL_NAMES[loc.along] + ')' : '') + '.' + (closes ? ' The chain closed on a point.' : ''));
  }
  function endChain(msg) { S.chain = null; S.spline = null; draw(); UI.setStatus('3D Sketch: ' + msg); }
  function fmtP(p) { return '(' + p.map(fmt).join(', ') + ')'; }
  function changed(msg) { syncValues(); UI.renderPM(); draw(); UI.setStatus('3D Sketch: ' + msg); }
  function selectAt(mx, my, ctrl) {
    var hit = null, bd = SNAP_PX;
    S.f.pts.forEach(function (p, i) { if (!usedPoint(i)) return; var d = sd(scr(p), [mx, my]); if (d < bd) { bd = d; hit = { kind: 'pt', i: i }; } });
    if (!hit) {
      bd = LINE_PX;
      S.f.ents.forEach(function (e, i) {
        if (e.t !== 'line') return;
        var a = scr(S.f.pts[e.a]), b = scr(S.f.pts[e.b]), ab = [b[0] - a[0], b[1] - a[1]], l2 = ab[0] * ab[0] + ab[1] * ab[1];
        var t = l2 ? Math.max(0, Math.min(1, ((mx - a[0]) * ab[0] + (my - a[1]) * ab[1]) / l2)) : 0, d = Math.hypot(a[0] + ab[0] * t - mx, a[1] + ab[1] * t - my);
        if (d < bd) { bd = d; hit = { kind: 'ent', i: i }; }
      });
    }
    if (!hit) { if (!ctrl) S.sel = []; }
    else {
      var at = -1;
      S.sel.forEach(function (s, k) { if (s.kind === hit.kind && s.i === hit.i) at = k; });
      if (ctrl) { if (at >= 0) S.sel.splice(at, 1); else S.sel.push(hit); }
      else S.sel = [hit];
    }
    syncValues(); UI.renderPM(); draw();
    UI.setStatus('3D Sketch: ' + (S.sel.length ? S.sel.map(function (s) { return s.kind === 'pt' ? 'Point' + (s.i + 1) : entLabel(s.i); }).join(', ') + ' selected.' : 'nothing selected.'));
  }

  // ------------------------------------------------------------------ edits from the PropertyManager
  function selLine() { return S.sel.length === 1 && S.sel[0].kind === 'ent' && S.f.ents[S.sel[0].i].t === 'line' ? S.sel[0].i : null; }
  function selPts() {
    var out = [];
    S.sel.forEach(function (s) { if (s.kind === 'pt') out.push(s.i); });
    return out.length === S.sel.length ? out : [];
  }
  function syncValues() {
    var v = S.v, li = selLine(), ps = selPts();
    if (li != null) { var L = S.f.ents[li]; v.len = r9(len(sub(S.f.pts[L.b], S.f.pts[L.a]))); }
    if (ps.length === 2) v.dist = r9(len(sub(S.f.pts[ps[1]], S.f.pts[ps[0]])));
    if (ps.length === 1) { var P = S.f.pts[ps[0]]; v.px = P[0]; v.py = P[1]; v.pz = P[2]; }
  }
  // put a dimension (value v) on, solving; a refusal restores the sketch
  function setDim(match, make, v, what) {
    if (!(v > 0)) { UI.toast(what + ' must be more than 0.'); syncValues(); UI.renderPM(); return false; }
    snap();
    var keep = clone(S.f), d = (S.f.dims || []).filter(match)[0];
    if (!S.f.dims) S.f.dims = [];
    if (d) d.v = v; else { d = make(); d.v = v; S.f.dims.push(d); }
    if (!solve(S.f)) { Object.keys(keep).forEach(function (k) { S.f[k] = keep[k]; }); S.hist.pop(); UI.toast(what + ' ' + fmt(v) + ' conflicts with the relations and dimensions of the sketch.'); syncValues(); UI.renderPM(); draw(); return false; }
    changed(what + ' ' + fmt(v) + ' ' + UI.unitLabel() + '.');
    return true;
  }
  function addRel(type) {
    var li = selLine();
    if (li == null) { UI.toast('Select one line for ' + REL_NAMES[type] + '.'); return; }
    if (S.f.rels.some(function (r) { return r.e === li && AXES[r.type]; })) { UI.toast(entLabel(li) + ' already runs along an axis: delete that relation first.'); return; }
    snap();
    var keep = clone(S.f);
    S.f.rels.push({ type: type, e: li });
    if (!solve(S.f)) { Object.keys(keep).forEach(function (k) { S.f[k] = keep[k]; }); S.hist.pop(); UI.toast(REL_NAMES[type] + ' conflicts with the sketch.'); return; }
    changed(entLabel(li) + ': ' + REL_NAMES[type] + '.');
  }
  function movePoint(i, P) {
    snap();
    var keep = clone(S.f), extra = [0, 1, 2].map(function (k) { return { p: [i], f: function (Q) { return Q[0][k] - P[k]; } }; });
    var fixed = S.f.rels.filter(function (r) { return r.type === 'fix' && r.p === i; })[0];
    if (fixed) fixed.at = P.slice();
    if (!solve(S.f, extra)) { Object.keys(keep).forEach(function (k) { S.f[k] = keep[k]; }); S.hist.pop(); UI.toast('Point' + (i + 1) + ' cannot go to ' + fmtP(P) + ': the relations and dimensions hold it.'); syncValues(); UI.renderPM(); return; }
    changed('Point' + (i + 1) + ' at ' + fmtP(S.f.pts[i]) + '.');
  }
  function fixPoint() {
    var ps = selPts();
    if (ps.length !== 1) { UI.toast('Select one point to fix.'); return; }
    snap();
    var i = ps[0], at = S.f.rels.map(function (r, k) { return r.type === 'fix' && r.p === i ? k : -1; }).filter(function (k) { return k >= 0; });
    if (at.length) { S.f.rels.splice(at[0], 1); changed('Point' + (i + 1) + ' is free.'); }
    else { S.f.rels.push({ type: 'fix', p: i, at: S.f.pts[i].slice() }); changed('Point' + (i + 1) + ' fixed.'); }
  }
  function filletCorner() {
    var ps = selPts(), r = +S.v.fr;
    if (ps.length !== 1) { UI.toast('Select the corner point to fillet.'); return; }
    var i = ps[0], f2 = clone(S.f);
    f2.ents = f2.ents.filter(function (e) { return !(e.t === 'fillet' && e.at === i); });
    f2.ents.push({ t: 'fillet', at: i, r: r });
    try { K.sketch3dPieces(f2); } catch (e) { UI.toast(e.message.replace(/^3D sketch: /, 'Sketch Fillet: ')); return; }
    snap();
    S.f.ents = f2.ents;
    changed('Sketch Fillet R' + fmt(r) + ' at Point' + (i + 1) + '.');
  }
  function deleteSel() {
    if (!S.sel.length) { UI.toast('Select what to delete.'); return; }
    snap();
    var dropE = {}, dropP = {};
    S.sel.forEach(function (s) { if (s.kind === 'ent') dropE[s.i] = true; else dropP[s.i] = true; });
    S.f.ents.forEach(function (e, i) {
      if (dropP[e.a] || dropP[e.b] || dropP[e.p] || dropP[e.at] || (Array.isArray(e.p) && e.p.some(function (k) { return dropP[k]; }))) dropE[i] = true;
    });
    // a fillet goes with its lines
    S.f.ents.forEach(function (e, i) {
      if (e.t !== 'fillet') return;
      S.f.ents.forEach(function (g, k) { if (dropE[k] && g.t === 'line' && (g.a === e.at || g.b === e.at)) dropE[i] = true; });
    });
    var map = {}, ents = [];
    S.f.ents.forEach(function (e, i) { if (!dropE[i]) { map[i] = ents.length; ents.push(e); } });
    S.f.ents = ents;
    S.f.rels = S.f.rels.filter(function (r) { return !(r.e != null && map[r.e] == null) && !(r.p != null && dropP[r.p]); }).map(function (r) { if (r.e != null) r.e = map[r.e]; return r; });
    S.f.dims = (S.f.dims || []).filter(function (d) { return !(d.e != null && map[d.e] == null) && !dropP[d.a] && !dropP[d.b]; }).map(function (d) { if (d.e != null) d.e = map[d.e]; return d; });
    var n = Object.keys(dropE).length;
    S.sel = [];
    changed('Deleted ' + n + ' entit' + (n === 1 ? 'y' : 'ies') + '.');
  }

  // ------------------------------------------------------------------ drawing
  var MAT = {};
  function mat(kind) {
    if (MAT[kind]) return MAT[kind];
    var c = { line: 0x1f5fd6, cons: 0x7d8790, sel: 0xffb000, pre: 0xff8c1a, pt: 0x1aa34a, ax: 0x9aa4ae };
    var m = kind === 'pt' || kind === 'ptSel' ? new THREE.PointsMaterial({ color: kind === 'ptSel' ? c.sel : c.pt, size: 8, sizeAttenuation: false, depthTest: false, transparent: true })
      : kind === 'cons' ? new THREE.LineDashedMaterial({ color: c.cons, dashSize: 1, gapSize: 0.6, depthTest: false, transparent: true, scale: 1 })
        : new THREE.LineBasicMaterial({ color: c[kind], depthTest: false, transparent: true });
    MAT[kind] = m;
    return m;
  }
  function segs(group, arr, kind) {
    if (!arr.length) return;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    var o = new THREE.LineSegments(g, mat(kind));
    if (kind === 'cons') o.computeLineDistances();
    o.renderOrder = 30;
    group.add(o);
  }
  function polyArr(pts) { var a = []; for (var i = 0; i + 1 < pts.length; i++) a.push(pts[i][0], pts[i][1], pts[i][2], pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]); return a; }
  function draw() {
    if (!S) return;
    if (!S.group) { S.group = new THREE.Group(); S.group.name = 'sketch3d'; UI.scene.add(S.group); }
    UI.disposeGroup(S.group);
    var f = S.f, selE = {}, selP = {};
    S.sel.forEach(function (s) { (s.kind === 'ent' ? selE : selP)[s.i] = true; });
    var main = [], cons = [], sel = [];
    var pc = null;
    try { pc = K.sketch3dPieces(f); } catch (e) { pc = null; }
    // trimmed pieces of the real geometry (fillets included); selected lines drawn over them whole
    if (pc) pc.pieces.forEach(function (p) { main = main.concat(polyArr(p.pts)); });
    f.ents.forEach(function (e, i) {
      if (e.t === 'line') {
        var A = f.pts[e.a], B = f.pts[e.b];
        if (e.construction) cons.push(A[0], A[1], A[2], B[0], B[1], B[2]);
        if (selE[i]) sel.push(A[0], A[1], A[2], B[0], B[1], B[2]);
      }
    });
    segs(S.group, main, 'line'); segs(S.group, cons, 'cons'); segs(S.group, sel, 'sel');
    var pts = [], spts = [];
    f.pts.forEach(function (p, i) { if (usedPoint(i)) (selP[i] ? spts : pts).push(p[0], p[1], p[2]); });
    [[pts, 'pt'], [spts, 'ptSel']].forEach(function (q) {
      if (!q[0].length) return;
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(q[0], 3));
      var o = new THREE.Points(g, mat(q[1])); o.renderOrder = 31; S.group.add(o);
    });
    // the drawing plane's two axes through the anchor, and the rubber band to the cursor
    var A0 = anchor(), fr = frameAt(A0), ax = [];
    [fr.x, fr.y].forEach(function (d) {
      var P = A0, px = sd(scr(P), scr(add(P, d))), sz = px > 1e-6 ? 36 / px : 1;   // 36 px each way
      ax.push(P[0] - d[0] * sz, P[1] - d[1] * sz, P[2] - d[2] * sz, P[0] + d[0] * sz, P[1] + d[1] * sz, P[2] + d[2] * sz);
    });
    segs(S.group, ax, 'ax');
    if (S.cursor && (S.chain != null || S.spline)) { var Q = S.cursor.p; segs(S.group, [A0[0], A0[1], A0[2], Q[0], Q[1], Q[2]], 'pre'); }
    if (UI.requestRender) UI.requestRender();
  }

  // ------------------------------------------------------------------ viewport events (capture: the 3D sketch owns left clicks)
  // an event over the graphics area: an element in it, or (mousemove / mouseup go to the window) a point inside its box
  function inViewport(e) {
    var vp = UI.viewport, t = e.target;
    if (!vp) return false;
    if (t && t.nodeType === 1) {
      if (!vp.contains(t)) return false;
      return !(t.closest && t.closest('input, textarea, select, button, .pm, #pm, .menu, .ctx-menu'));
    }
    var r = vp.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }
  function mxy(e) { var r = UI.viewport.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  var downAt = null;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.addEventListener('mousedown', function (e) {
      if (!S || S.picking || e.button !== 0 || e.altKey || !inViewport(e)) return;
      downAt = mxy(e);
      e.stopPropagation(); e.preventDefault();
    }, true);
    window.addEventListener('mouseup', function (e) {
      if (!S || !downAt || e.button !== 0) { downAt = null; return; }
      var p = mxy(e), d0 = downAt;
      downAt = null;
      e.stopPropagation();
      if (sd(p, d0) > 6) return;
      try { click(p[0], p[1], e.ctrlKey || e.metaKey); } catch (er) { UI.toast('3D Sketch: ' + er.message); }
    }, true);
    window.addEventListener('mousemove', function (e) {
      if (!S || S.picking || !inViewport(e) || (S.chain == null && !S.spline)) return;
      var p = mxy(e);
      S.cursor = locate(p[0], p[1]);
      draw();
    }, true);
    window.addEventListener('dblclick', function (e) {
      if (!S || S.picking || !inViewport(e)) return;
      e.stopPropagation(); e.preventDefault();
      if (S.chain != null || S.spline) endChain('chain ended.');
    }, true);
    window.addEventListener('keydown', function (e) {
      if (!S || S.picking) return;
      var t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === 'Tab' && !typing) {
        e.preventDefault(); e.stopPropagation();
        S.v.dp = S.v.dp === 'XY' ? 'YZ' : S.v.dp === 'YZ' ? 'ZX' : 'XY';
        if (S.v.onPlane >= 0) S.v.onPlane = -1;
        UI.renderPM(); draw();
        UI.setStatus('3D Sketch: drawing on the ' + S.v.dp + ' plane.');
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !typing) {
        if (S.hist.length) { e.preventDefault(); e.stopPropagation(); undoOne(); }
      } else if (e.key === 'Delete' && !typing && S.sel.length) {
        e.preventDefault(); e.stopPropagation(); deleteSel();
      }
    }, true);
  }

  // ------------------------------------------------------------------ the PropertyManager
  function groups() {
    var hasPl = (S.f.planes || []).length > 0;
    return [
      { title: 'Tool', fields: [{ type: 'radio', key: 'tool', rerender: true, options: [['line', 'Line'], ['centerline', 'Centerline'], ['spline', 'Spline'], ['point', 'Point'], ['select', 'Select']] }] },
      { title: 'Drawing Plane', fields: [
        { type: 'radio', key: 'dp', rerender: true, options: [['XY', 'XY'], ['YZ', 'YZ'], ['ZX', 'ZX']] },
        { type: 'select', label: 'Sketch on', key: 'onPlane', rerender: true, show: function () { return hasPl; }, options: function () { return [[-1, 'Space (XY / YZ / ZX)']].concat((S.f.planes || []).map(function (p, i) { return [i, planeName(p, i)]; })); } },
        { type: 'buttons', buttons: [{ label: 'Add plane…', onclick: function () { pickPlane(); } }] },
        { type: 'static', label: '', value: 'Tab switches XY / YZ / ZX. A segment near an axis takes Along X / Y / Z.' }] },
      { title: 'Selected Line', show: function () { return selLine() != null; }, fields: [
        { type: 'number', label: 'Length', key: 'len', unit: 'u', min: 0 },
        { type: 'buttons', buttons: ['alongX', 'alongY', 'alongZ'].map(function (t) { return { label: REL_NAMES[t], onclick: function () { addRel(t); } }; }) },
        { type: 'static', label: 'Relations', value: function () { var li = selLine(); return S.f.rels.filter(function (r) { return r.e === li; }).map(function (r) { return REL_NAMES[r.type]; }).join(', ') || 'none'; } }] },
      { title: 'Selected Points', show: function () { return selPts().length === 2; }, fields: [{ type: 'number', label: 'Distance', key: 'dist', unit: 'u', min: 0 }] },
      { title: 'Selected Point', show: function () { return selPts().length === 1; }, fields: [
        { type: 'number', label: 'X', key: 'px', unit: 'u' }, { type: 'number', label: 'Y', key: 'py', unit: 'u' }, { type: 'number', label: 'Z', key: 'pz', unit: 'u' },
        { type: 'buttons', buttons: [{ label: 'Fix / Free', onclick: function () { fixPoint(); } }] },
        { type: 'number', label: 'Fillet radius', key: 'fr', unit: 'u', min: 0 },
        { type: 'buttons', buttons: [{ label: 'Sketch Fillet', onclick: function () { filletCorner(); } }] }] },
      { title: 'Selection', show: function () { return S.sel.length > 0; }, fields: [{ type: 'buttons', buttons: [{ label: 'Delete', onclick: function () { deleteSel(); } }] }] },
      { title: 'Offset On Surface', collapsed: !S.v.offsetOpen, fields: [
        { type: 'number', label: 'Distance', key: 'od', unit: 'u', min: 0 }, { type: 'check', label: 'Reverse', key: 'orev' },
        { type: 'buttons', buttons: [{ label: 'Pick a face…', onclick: function () { pickOffsetFace(); } }] }] },
      { title: 'Feature', collapsed: !S.existing, fields: [{ type: 'text', label: 'Name', key: 'name' }] }
    ];
  }
  function planeName(p, i) {
    if (p.featureId != null) { var g = K.findFeature(App.model, p.featureId); return g ? g.name : 'Plane' + (i + 1); }
    if (p.ref) return p.ref + ' Plane' + (p.offset ? ' + ' + fmt(p.offset) : '');
    return 'Face plane ' + (i + 1);
  }
  function onChange(v, key) {
    if (key === 'len') { var li = selLine(); if (li != null) setDim(function (d) { return d.k === 'len' && d.e === li; }, function () { return { k: 'len', e: li }; }, +v.len, entLabel(li) + ' length'); }
    else if (key === 'dist') { var ps = selPts(); if (ps.length === 2) setDim(function (d) { return d.k === 'dist' && ((d.a === ps[0] && d.b === ps[1]) || (d.a === ps[1] && d.b === ps[0])); }, function () { return { k: 'dist', a: ps[0], b: ps[1] }; }, +v.dist, 'Distance'); }
    else if (key === 'px' || key === 'py' || key === 'pz') { var q = selPts(); if (q.length === 1) movePoint(q[0], [+v.px, +v.py, +v.pz]); }
    else if (key === 'tool') { S.chain = null; S.spline = null; draw(); }
    else if (key === 'dp' || key === 'onPlane') { S.v.onPlane = +S.v.onPlane; if (key === 'dp') S.v.onPlane = -1; draw(); }
  }
  function cleanFeature() {
    var f = S.f, o = { type: 'sketch3d', pts: f.pts, ents: f.ents };
    if (f.rels && f.rels.length) o.rels = f.rels;
    if (f.dims && f.dims.length) o.dims = f.dims;
    if (f.planes && f.planes.length) o.planes = f.planes;
    if (S.v.name) o.name = S.v.name;
    // drop points no entity uses, renumbering the references
    var map = {}, pts = [];
    o.pts.forEach(function (p, i) { if (usedPoint(i)) { map[i] = pts.length; pts.push(p); } });
    var m = function (i) { return map[i]; };
    o.pts = pts;
    o.ents = o.ents.map(function (e) {
      var c = clone(e);
      if (c.a != null) c.a = m(c.a); if (c.b != null) c.b = m(c.b); if (c.at != null) c.at = m(c.at);
      if (Array.isArray(c.p)) c.p = c.p.map(m); else if (c.p != null) c.p = m(c.p);
      return c;
    });
    if (o.rels) o.rels = o.rels.filter(function (r) { return r.p == null || map[r.p] != null; }).map(function (r) { var c = clone(r); if (c.p != null) c.p = m(c.p); return c; });
    if (o.dims) o.dims = o.dims.filter(function (d) { return d.a == null || (map[d.a] != null && map[d.b] != null); }).map(function (d) { var c = clone(d); if (c.a != null) { c.a = m(c.a); c.b = m(c.b); } return c; });
    return o;
  }
  function close() {
    if (!S) return;
    if (S.group) { UI.disposeGroup(S.group); UI.scene.remove(S.group); }
    S = null;
    if (UI.requestRender) UI.requestRender();
  }
  function open(existing, opts) {
    opts = opts || {};
    if (UI.isAssembly && UI.isAssembly()) { UI.toast('3D Sketch works in a part.'); return; }
    if (App.mode === 'sketch') UI.exitSketch(true);
    if (S) close();
    var f = existing ? clone(existing) : { type: 'sketch3d', pts: [], ents: [] };
    ['pts', 'ents', 'rels', 'dims', 'planes'].forEach(function (k) { if (!Array.isArray(f[k])) f[k] = []; });
    S = { f: f, existing: existing || null, hist: [], chain: null, spline: null, sel: [], cursor: null, picking: false,
      v: { tool: 'line', dp: 'XY', onPlane: -1, len: 0, dist: 0, px: 0, py: 0, pz: 0, fr: UI.lenDefault ? UI.lenDefault(2) : 2, od: UI.lenDefault ? UI.lenDefault(2) : 2, orev: false, name: existing ? existing.name : '' } };
    UI.openPM({
      title: existing ? existing.name : '3D Sketch', icon: 'sketch3d', values: S.v, noFocus: true,
      groups: groups(),
      command: { sketch3d: true },
      message: 'Click points in space to draw on the drawing plane (Tab switches XY / YZ / ZX). Click the last point again or double-click to end a chain. Select picks points and lines for dimensions, relations and Sketch Fillet. ✓ makes the 3D sketch.',
      onChange: onChange,
      onOK: function () {
        if (!S) return false;
        var o = cleanFeature(), ex = S.existing;
        try { K.sketch3dPieces(o); } catch (e) { UI.toast(e.message); return false; }
        close();
        return UI.commitFeature(o, ex);
      },
      onCancel: function () { UI.setStatus('3D Sketch cancelled.'); },
      onClose: function () { close(); }
    });
    draw();
    if (opts.onPlane) opts.onPlane();
    UI.setStatus(existing ? 'Editing ' + existing.name + '.' : '3D Sketch: click the start point (the XY plane through the origin; Tab for YZ / ZX).');
  }
  // a plane / planar face into the sketch: a selected one, else the next pick
  function planeRefOf(pk) {
    if (!pk) return null;
    if (pk.kind === 'plane') return typeof pk.ref === 'string' ? { ref: pk.ref, offset: 0 } : { featureId: pk.ref };
    if (pk.kind === 'feature') { var g = K.findFeature(App.model, pk.id); if (g && g.type === 'plane') return { featureId: g.id }; }
    if (pk.kind === 'face' && App.mesh && App.mesh.faces[pk.index]) {
      var fc = App.mesh.faces[pk.index];
      if (fc.polys && fc.polys[0] && fc.polys[0].surf) return null;
      var n = nrm(fc.normal), x = nrm(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0])), y = cross(n, x), o = pk.point ? pk.point.slice() : fc.centroid.slice();
      o = sub(o, scl(n, dot(n, o) - fc.w));
      return { custom: true, origin: o.map(r9), x: x.map(r9), y: y.map(r9), n: n.map(r9) };
    }
    return null;
  }
  function usePlane(ref) {
    snap();
    S.f.planes.push(ref);
    S.v.onPlane = S.f.planes.length - 1;
    UI.renderPM(); draw();
    UI.setStatus('3D Sketch: drawing on ' + planeName(ref, S.v.onPlane) + '. Entities drawn now stay on it.');
  }
  function pickPlane() {
    if (!S) return;
    S.picking = true;
    UI.setStatus('3D Sketch: click a plane or a planar face to sketch on.');
    App.command = { sketch3d: true, pickPlane: true, onPick: function (pk) {
      var ref = planeRefOf(pk);
      if (!ref) { UI.toast('Pick a plane or a planar face.'); return true; }
      S.picking = false; App.command = { sketch3d: true };
      usePlane(ref);
      return true;
    } };
  }
  function pickOffsetFace() {
    if (!S) return;
    S.picking = true; S.v.offsetOpen = true;
    UI.setStatus('Offset On Surface: click a planar or cylindrical face of the part.');
    App.command = { sketch3d: true, faceList: [], onPick: function (pk) {
      if (pk.kind !== 'face' || !pk.point) return false;
      S.picking = false; App.command = { sketch3d: true };
      addOffset(pk.point, +S.v.od, !!S.v.orev);
      return true;
    } };
  }
  function bodyBefore() {
    var b = App.build;
    if (S && S.existing) {
      var idx = App.model.features.indexOf(S.existing);
      if (idx >= 0) { var m = clone(App.model); m.features = m.features.slice(0, idx); try { b = K.rebuild(m); } catch (e) { b = App.build; } }
    }
    return b && b.body;
  }
  // the offset entities into a sketch f: lines (points shared at their ends), arcs
  function offsetInto(f, r) {
    var idxOf = function (P) {
      for (var i = 0; i < f.pts.length; i++) if (len(sub(f.pts[i], P)) < 1e-9 * (1 + len(P))) return i;
      f.pts.push(P.map(r9)); return f.pts.length - 1;
    };
    r.lines.forEach(function (L) { f.ents.push({ t: 'line', a: idxOf(L[0]), b: idxOf(L[1]) }); });
    r.arcs.forEach(function (a) { f.ents.push({ t: 'arc', c: a.c.map(r9), n: a.n.map(r9), r: r9(a.r), x: a.x.map(r9), ang: r9(a.ang) }); });
    return r.lines.length + r.arcs.length;
  }
  function addOffset(at, d, reverse) {
    var body = bodyBefore();
    if (!body) { UI.toast('Offset On Surface needs a part face.'); return false; }
    var r;
    try { r = K.offsetOnSurface(body, at, d, { reverse: reverse, units: App.model.units }); } catch (e) { UI.toast(e.message); return false; }
    snap();
    var n = offsetInto(S.f, r);
    changed('Offset On Surface: ' + n + ' entit' + (n === 1 ? 'y' : 'ies') + ' ' + fmt(d) + ' ' + UI.unitLabel() + (reverse ? ' outside' : ' inside') + ' the ' + (r.kind === 'plane' ? 'planar' : 'cylindrical') + ' face.');
    return true;
  }

  // ------------------------------------------------------------------ commands
  function cmdSketch3D(existing) { open(existing && existing.type === 'sketch3d' ? existing : null); }
  function cmdSketch3DOnPlane() {
    var pre = (UI.selection ? UI.selection() : [App.sel]).filter(Boolean).map(planeRefOf).filter(Boolean)[0];
    if (S) { if (pre) usePlane(pre); else pickPlane(); return; }
    open(null, { onPlane: function () { if (pre) usePlane(pre); else pickPlane(); } });
  }
  // Offset On Surface with no 3D sketch open: its own PropertyManager, the result a new 3D sketch
  function cmdOffsetOnSurface() {
    if (S) { S.v.offsetOpen = true; UI.renderPM(); pickOffsetFace(); return; }
    if (UI.isAssembly && UI.isAssembly()) { UI.toast('Offset On Surface works in a part.'); return; }
    if (App.mode === 'sketch') UI.exitSketch(true);
    if (!App.build || !App.build.body || !App.build.body.polygons.length) { UI.toast('Offset On Surface needs a part with faces.'); return; }
    var v = { d: UI.lenDefault ? UI.lenDefault(2) : 2, reverse: false, faces: [] };
    var pre = (UI.selection ? UI.selection() : [App.sel]).filter(function (s) { return s && s.kind === 'face' && s.point; });
    pre.forEach(function (s) { v.faces.push({ at: s.point.slice() }); });
    function result() {
      var f = { pts: [], ents: [] }, n = 0;
      v.faces.forEach(function (s) { n += offsetInto(f, K.offsetOnSurface(App.build.body, s.at, +v.d, { reverse: !!v.reverse, units: App.model.units })); });
      return { f: f, n: n };
    }
    function preview() {
      UI.disposeGroup(UI.groups.preview);
      if (!v.faces.length) { UI.setStatus('Offset On Surface: click a planar or cylindrical face.'); return; }
      try {
        var r = result(), rec = K.resolveCurve({ type: 'sketch3d', pts: r.f.pts, ents: r.f.ents }, App.model, { planes: {} });
        UI.drawRefGeo(rec, UI.groups.preview, 'sel');
        UI.setStatus('Offset On Surface preview: ' + r.n + ' entit' + (r.n === 1 ? 'y' : 'ies') + '. Press Enter or ✓ to make the 3D sketch.');
      } catch (e) { UI.setStatus('Preview: ' + e.message); }
      if (UI.requestRender) UI.requestRender();
    }
    UI.openPM({
      title: 'Offset On Surface', icon: 'offset', values: v,
      groups: [{ title: 'Parameters', fields: [
        { type: 'pick', icon: 'offset', placeholder: 'Faces…', value: function (vv) { return vv.faces.length ? vv.faces.length + ' face' + (vv.faces.length > 1 ? 's' : '') : ''; },
          items: function (vv) { return vv.faces.map(function (s, i) { return { label: 'Face<' + (i + 1) + '>', at: s.at }; }); },
          onRemove: function (vv, i) { vv.faces.splice(i, 1); UI.renderPM(); preview(); }, onClear: function (vv) { vv.faces.length = 0; UI.renderPM(); preview(); } },
        { type: 'number', label: 'Distance', key: 'd', unit: 'u', min: 0 },
        { type: 'check', label: 'Reverse', key: 'reverse' }] }],
      command: { faceList: [], onPick: function (pk) {
        if (pk.kind !== 'face' || !pk.point) return false;
        v.faces.push({ at: pk.point.map(function (x) { return Math.round(x * 1e6) / 1e6; }) });
        UI.renderPM(); preview();
        return true;
      } },
      message: 'Click planar or cylindrical faces: their edges are offset across the face by the distance (Reverse: outward) into a new 3D sketch.',
      onChange: function () { preview(); },
      okBlocked: function (vv) { return vv.faces.length ? null : 'Select a face.'; },
      onOK: function () {
        var r;
        try { r = result(); } catch (e) { UI.toast(e.message); return false; }
        return UI.commitFeature({ type: 'sketch3d', pts: r.f.pts, ents: r.f.ents }, null);
      },
      onClose: function () { UI.disposeGroup(UI.groups.preview); if (UI.requestRender) UI.requestRender(); }
    });
    preview();
  }
  UI.cmdSketch3D = cmdSketch3D; UI.cmdSketch3DOnPlane = cmdSketch3DOnPlane; UI.cmdOffsetOnSurface = cmdOffsetOnSurface;
  // test / script hooks
  UI.sketch3dState = function () { return S ? { f: clone(S.f), tool: S.v.tool, dp: S.v.dp, onPlane: S.v.onPlane, chain: S.chain, sel: clone(S.sel), hist: S.hist.length } : null; };
  UI.sketch3dSet = function (key, val) { if (!S) return false; S.v[key] = val; onChange(S.v, key); UI.renderPM(); return true; };
  UI.sketch3dSelect = function (list) { if (!S) return false; S.sel = clone(list); syncValues(); UI.renderPM(); draw(); return true; };
  UI.sketch3dRel = function (type) { if (S) addRel(type); };
  UI.sketch3dFillet = function (r) { if (!S) return; S.v.fr = r; filletCorner(); };
  UI.sketch3dOffset = function (at, d, reverse) { return S ? addOffset(at, d, reverse) : false; };
  UI.sketch3dPlane = function (pk) { var ref = planeRefOf(pk); if (S && ref) usePlane(ref); return !!ref; };
})();
