// ui-sketch.js — viewport mouse handling, sketch mode and the 2D sketch tools.
(function (UI) {
  'use strict';
  var App = UI.App, K = UI.K, $ = UI.$, el = UI.el;
  var viewport = UI.viewport;

  // ------------------------------------------------------------------ sketch mode
  function enterSketch(id) {
    if (UI.isAssembly && UI.isAssembly()) { if (UI.setStatus) UI.setStatus('Sketches are not available in an assembly document'); return; }
    var f = K.findFeature(App.model, id);
    if (!f || f.type !== 'sketch') return;
    if (App.mode === 'sketch' && App.activeSketch !== id) exitSketch(true);
    App.mode = 'sketch';
    App.activeSketch = id;
    App.sel = null; App.sel2 = null;
    App.sketchDirty = false;
    woken = [];
    setTool('select');
    UI.viewNormalTo(UI.activePlane());
    UI.zoomToFit();
    App.gridStale = true;
    UI.updateSketches(); UI.updatePlanes(); UI.updateHighlights();
    UI.setRibbonTab('Sketch');
    $('exit-sketch').hidden = false;
    $('exit-sketch').innerHTML = '';
    $('exit-sketch').appendChild(el('button', { title: 'Exit Sketch (keep changes)', html: Icons('exitSketch', 26), onclick: function () { exitSketch(); } }));
    $('exit-sketch').appendChild(el('button', { title: 'Cancel sketch changes', html: Icons('cancel', 20), onclick: function () { cancelSketch(); } }));
    UI.refreshTree(); UI.refreshStatus();
    UI.setStatus('Editing ' + f.name + '. Pick a tool from the Sketch tab, or click an entity to edit its values.');
  }

  function exitSketch(silent) {
    if (App.mode !== 'sketch') return UI.whenIdle();
    var f = UI.activeSketchFeature();
    cancelTool();
    App.mode = 'part';
    App.activeSketch = null;
    App.sel = null;
    // a brand-new sketch left empty is discarded, as SolidWorks does
    if (f && App.newSketchId === f.id && !f.entities.length) {
      App.model.features = App.model.features.filter(function (g) { return g !== f; });
      App.pendingAfterSketch = null;
      f = null;
      UI.setStatus('Empty sketch discarded.');
    } else if (f) {
      UI.setStatus('Exited ' + f.name + ' (' + f.entities.length + ' entit' + (f.entities.length === 1 ? 'y' : 'ies') + ').');
    }
    App.newSketchId = null;
    $('exit-sketch').hidden = true;
    $('sketch-hint').hidden = true;
    clearFeedback();
    $('status-coords').textContent = '';
    viewport.classList.remove('tool-cross');
    App.gridStale = true;
    var p = UI.rebuild();
    UI.setRibbonTab('Features');
    if (App.pendingAfterSketch) {
      // the command that closed the sketch (withSketch) opens its PropertyManager once the build is applied
      var cb = App.pendingAfterSketch; App.pendingAfterSketch = null;
      return UI.afterRebuild(p, function () { cb(f); });
    }
    UI.closePM();
    return UI.afterRebuild(p, function () {
      if (!silent && f) { App.sel = { kind: 'feature', id: f.id }; UI.updateHighlights(); UI.updateSketches(); UI.refreshTree(); }
    });
  }

  function cancelSketch() {
    if (App.sketchSnapshot) {
      var f = UI.activeSketchFeature();
      var snap = JSON.parse(App.sketchSnapshot);
      if (f) {
        f.entities = snap.entities;
        if (snap.dims) f.dims = snap.dims;
        if (snap.rels) f.rels = snap.rels; else delete f.rels;
      }
    }
    App.pendingAfterSketch = null;
    exitSketch(true);
  }

  // ------------------------------------------------------------------ tools
  var TOOL_HINTS = {
    select: 'Click an entity to select it. <b>Delete</b> removes it. Double-click empty space to finish.',
    line: 'Click the start point, then each next point, or press and drag for one line. Type a number for the length; <b>A</b> draws a tangent arc. <b>Esc</b> or right-click ends the chain.',
    rect: 'Click the first corner, then the opposite corner.',
    crect: 'Click the center, then a corner.',
    circle: 'Click the center, then a point on the circle.',
    arc: 'Click the center, the start point, then the end point; the arc runs the way you move. From a line or arc end, move the center out square to it (Tangent glyph) for a tangent arc.',
    arc3: 'Click the start point, then the end point, then a point the arc passes through. From a line or arc end the arc locks tangent to it as it comes near (Tangent glyph).',
    polygon: 'Click the center, then a vertex. Set the number of sides in the PropertyManager.',
    slot: 'Click the two slot centers, then a point to set the width.',
    point: 'Click to place a point.',
    dimension: 'Click a line, circle, arc, rectangle, slot or polygon (or two points), then click where the dimension should sit: above / below or beside two points for a horizontal or vertical distance. Double-click a value to change it, drag it to move it; <b>Delete</b> removes a selected dimension.'
  };
  function setTool(name) {
    cancelTool(true);
    App.tool = name || 'select';
    App.toolState = { pts: [] };
    App.drawConstruction = false;
    viewport.classList.toggle('tool-cross', App.tool !== 'select');
    var hint = $('sketch-hint');
    hint.hidden = App.mode !== 'sketch';
    hint.innerHTML = TOOL_HINTS[App.tool] || '';
    if (App.tool === 'polygon') UI.openToolPM('polygon');
    else if (App.tool !== 'select') UI.closePM();
    UI.refreshRibbon();
  }
  function cancelTool(keep) {
    if (App.toolState && App.toolState.arcMode && App.mode === 'sketch') $('sketch-hint').innerHTML = TOOL_HINTS[App.tool] || '';
    App.toolState = { pts: [] };
    closeNumBox();
    if (App.inferPreview && App.inferPreview.length) { App.inferPreview = []; App.dimsStale = true; }
    App.tempEntities = [];
    clearFeedback();
    if (App.tempDim) { App.tempDim = null; App.dimsStale = true; }
    if (App.tempRelDim) { App.tempRelDim = null; App.dimsStale = true; }
    UI.updateTemp();
    if (!keep) { App.tool = 'select'; viewport.classList.remove('tool-cross'); UI.refreshRibbon(); if (App.mode === 'sketch') { $('sketch-hint').innerHTML = TOOL_HINTS.select; } }
  }

  // ------------------------------------------------------------------ inference while sketching (no grid)
  // As in SolidWorks there is no snap grid: a point lands where it is clicked and the sketcher infers instead. In order:
  // an existing sketch point within 9 px (end, midpoint, centre, corner, quadrant, intersection, the origin) is taken
  // exactly; then a point on a line, circle or arc within 7 px; otherwise the point stays under the cursor, aligned
  // (within 6 px) horizontally / vertically with the previous point or with any other sketch point (dotted blue
  // inference lines), and each free coordinate is rounded to the roundest value inside the pixel under the cursor (25.4
  // rather than 25.3971), so nothing moves visibly. The grid is an option (View > Sketch Grid, off by default): while it
  // is shown, the free coordinates snap to it instead, as SolidWorks' Grid/Snap does.
  var INFER_PX = { point: 9, curve: 7, align: 6 };
  var woken = [];   // sketch points the cursor passed over (inference lines align with them); reset per sketch
  // the roundest number (multiples of 10^k, then 5·10^(k-1), …) within h of x
  function niceRound(x, h) {
    if (!(h > 0) || !isFinite(x)) return x;
    for (var k = Math.ceil(Math.log10(2 * h)); k > -12; k--) {
      var s1 = Math.pow(10, k), q;
      q = Math.round(x / s1) * s1; if (Math.abs(q - x) <= h) return +q.toFixed(Math.max(0, -k));
      var s2 = s1 / 2;
      q = Math.round(x / s2) * s2; if (Math.abs(q - x) <= h) return +q.toFixed(Math.max(0, 1 - k));
    }
    return x;
  }
  // sketch units per screen pixel at (mx, my)
  function pxSize(pl, mx, my) {
    var a = UI.screenToPlane(mx, my, pl), b = UI.screenToPlane(mx + 1, my, pl), c = UI.screenToPlane(mx, my + 1, pl);
    if (!a || !b || !c) return UI.cam.scale;
    return Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - a[0], c[1] - a[1]));
  }
  // The inference points of sketch f, with their kind: end / midpoint / center / quadrant / intersection. Cached until
  // the sketch changes.
  var candCache = { key: null, pts: null };
  function sketchPoints(f) {
    var key = f.id + ':' + JSON.stringify(f.entities);
    if (candCache.key === key) return candCache.pts;
    var S = window.SketchSolver, pts = [], curves = [];
    f.entities.forEach(function (e, i) {
      if (S) {
        S.pointRefs(f, i).forEach(function (pr) {
          var s = pr.ref.split('.')[1] || '';
          pts.push({ pt: pr.pt, kind: s === 'mid' ? 'midpoint' : s === 'c' ? 'center' : 'end' });
        });
        S.curveRefs(f, i).forEach(function (r) {
          var c = S.refCurve(f, r);
          if (!c) return;
          var cv = { e: i, kind: c.kind, a: c.a, b: c.b, c: c.c, r: c.r, arc: e.t === 'arc' ? e : null };
          curves.push(cv);
          if (c.kind === 'line' && /\.e\d+$/.test(r)) pts.push({ pt: [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2], kind: 'midpoint' });
          if (c.kind === 'circle') [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(function (d) {
            var q = [c.c[0] + d[0] * c.r, c.c[1] + d[1] * c.r];
            if (onArc(cv, q)) pts.push({ pt: q, kind: 'quadrant' });
          });
        });
      } else K.entitySnapPoints(e).forEach(function (p) { pts.push({ pt: p, kind: 'end' }); });
    });
    // intersections of lines, circles and arcs of different entities (skipped for very large sketches)
    if (curves.length <= 150) {
      for (var i = 0; i < curves.length; i++) for (var j = i + 1; j < curves.length; j++) {
        if (curves[i].e === curves[j].e) continue;
        intersect(curves[i], curves[j]).forEach(function (q) { pts.push({ pt: q, kind: 'intersection' }); });
      }
    }
    candCache = { key: key, pts: pts };
    return pts;
  }
  function onArc(cv, q) {
    if (!cv.arc) return true;
    var a = Math.atan2(q[1] - cv.c[1], q[0] - cv.c[0]) * 180 / Math.PI, sw = cv.arc.a1 - cv.arc.a0;
    if (sw >= 360) return true;
    var rel = ((a - cv.arc.a0) % 360 + 360) % 360;
    return rel <= sw + 1e-9;
  }
  function onSeg(cv, q) {
    var dx = cv.b[0] - cv.a[0], dy = cv.b[1] - cv.a[1], L2 = dx * dx + dy * dy;
    if (L2 < 1e-24) return false;
    var t = ((q[0] - cv.a[0]) * dx + (q[1] - cv.a[1]) * dy) / L2;
    return t >= -1e-9 && t <= 1 + 1e-9;
  }
  function intersect(A, B) {
    if (A.kind === 'circle' && B.kind === 'line') { var t = A; A = B; B = t; }
    var out = [];
    if (A.kind === 'line' && B.kind === 'line') {
      var d1 = [A.b[0] - A.a[0], A.b[1] - A.a[1]], d2 = [B.b[0] - B.a[0], B.b[1] - B.a[1]], den = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(den) < 1e-12 * (Math.hypot(d1[0], d1[1]) * Math.hypot(d2[0], d2[1]) || 1)) return out;
      var s = ((B.a[0] - A.a[0]) * d2[1] - (B.a[1] - A.a[1]) * d2[0]) / den, u = ((B.a[0] - A.a[0]) * d1[1] - (B.a[1] - A.a[1]) * d1[0]) / den;
      if (s >= -1e-9 && s <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) out.push([A.a[0] + d1[0] * s, A.a[1] + d1[1] * s]);
      return out;
    }
    if (A.kind === 'line') {
      var dx = A.b[0] - A.a[0], dy = A.b[1] - A.a[1], fx = A.a[0] - B.c[0], fy = A.a[1] - B.c[1];
      var a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - B.r * B.r, disc = b * b - 4 * a * c;
      if (a < 1e-24 || disc < 0) return out;
      var sq = Math.sqrt(disc);
      [(-b - sq) / (2 * a), (-b + sq) / (2 * a)].forEach(function (tt, k) {
        if (k === 1 && sq < 1e-12) return;
        var q = [A.a[0] + dx * tt, A.a[1] + dy * tt];
        if (tt >= -1e-9 && tt <= 1 + 1e-9 && onArc(B, q)) out.push(q);
      });
      return out;
    }
    var ex = B.c[0] - A.c[0], ey = B.c[1] - A.c[1], D = Math.hypot(ex, ey);
    if (D < 1e-12 || D > A.r + B.r + 1e-12 || D < Math.abs(A.r - B.r) - 1e-12) return out;
    var al = (A.r * A.r - B.r * B.r + D * D) / (2 * D), hh = Math.sqrt(Math.max(0, A.r * A.r - al * al));
    var mx = A.c[0] + ex * al / D, my = A.c[1] + ey * al / D;
    [[mx - ey * hh / D, my + ex * hh / D], [mx + ey * hh / D, my - ex * hh / D]].forEach(function (q, k) {
      if (k === 1 && hh < 1e-12) return;
      if (onArc(A, q) && onArc(B, q)) out.push(q);
    });
    return out;
  }
  // Where a drawing tool's next point goes for the cursor at sketch point raw (screen mx, my):
  // { p, snap: { kind, pt } | null, align: [{ from, axis: 'x' | 'y', prev }], px }.
  function inferPoint(raw, mx, my) {
    var f = UI.activeSketchFeature(), pl = UI.activePlane(), out = { p: raw.slice(), snap: null, align: [], px: 0 };
    if (!f) return out;
    if (mx == null) { var s0 = UI.worldToScreen(K.to3D(pl, raw[0], raw[1])); mx = s0[0]; my = s0[1]; }
    var px = out.px = pxSize(pl, mx, my), st = App.toolState || { pts: [] }, prev = st.pts[st.pts.length - 1];
    function scr(p) { return UI.worldToScreen(K.to3D(pl, p[0], p[1])); }
    // 1. an existing point
    var cands = sketchPoints(f).slice();
    cands.push({ pt: [0, 0], kind: 'origin' });
    st.pts.forEach(function (p) { cands.push({ pt: p, kind: 'end' }); });
    var best = null, bestD = INFER_PX.point;
    cands.forEach(function (c) {
      var s = scr(c.pt), d = Math.hypot(s[0] - mx, s[1] - my);
      if (d < bestD - 1e-9) { bestD = d; best = c; }
    });
    if (best) {
      out.p = [best.pt[0], best.pt[1]]; out.snap = best;
      // a point the cursor has passed over is "woken": inference lines can then align with it (as in SolidWorks)
      if (!woken.some(function (w) { return w[0] === best.pt[0] && w[1] === best.pt[1]; })) { woken.push([best.pt[0], best.pt[1]]); if (woken.length > 8) woken.shift(); }
      return out;
    }
    // 1b. tangent guidance for the arc tools (the click then infers Tangent, SketchSolver.inferCandidates):
    //     3 Point Arc — the third point locks onto the arc tangent to the line / arc ending at its start or end point
    //     when within 6 px of it; Centerpoint Arc — the centre locks onto the line square to a line / arc end the
    //     cursor has passed over (the arc started there leaves it tangent)
    st.tanArc = null;
    if (App.tool === 'arc3' && st.pts.length === 2) {
      var tl = tangentLock(f, st.pts[0], st.pts[1], raw, px);
      if (tl) { out.p = tl.p; out.tan = tl; st.tanArc = tl; return out; }
    }
    if (App.tool === 'arc' && !st.pts.length) {
      var bestN = null;
      woken.forEach(function (P) {
        var fwd = smoothDirs(f, P).fwd;
        if (!fwd) return;
        var nrm = [-fwd[1], fwd[0]], w0 = [raw[0] - P[0], raw[1] - P[1]], sN = w0[0] * nrm[0] + w0[1] * nrm[1], dd = Math.abs(w0[0] * fwd[0] + w0[1] * fwd[1]) / px;
        if (Math.abs(sN) / px > INFER_PX.point && dd < INFER_PX.align && (!bestN || dd < bestN.d)) bestN = { d: dd, P: P, u: sN > 0 ? nrm : [-nrm[0], -nrm[1]], s: Math.abs(sN) };
      });
      if (bestN) {
        var sl0 = App.view.showGrid ? bestN.s : niceRound(bestN.s, 0.5 * px * 1.05);
        out.p = [bestN.P[0] + bestN.u[0] * sl0, bestN.P[1] + bestN.u[1] * sl0];
        out.dir = { type: 'tangent', from: bestN.P, u: bestN.u, glyph: 'tangent' };
        return out;
      }
    }
    // 2. on a line / circle / arc (the solver infers a point-on-curve Coincident there)
    var onCurve = curveSnap(f, pl, [mx, my], INFER_PX.curve);
    if (onCurve) { out.p = onCurve; out.snap = { kind: 'on', pt: onCurve }; return out; }
    // 2b. a line leaving an existing end point: along the tangent of the arc that ends there, or square to the line
    //     that ends there (within 6 px of that direction; the length is rounded like a free coordinate). The click then
    //     infers Tangent / Perpendicular (SketchSolver.inferCandidates). Axis-aligned directions are left to H / V.
    if (App.tool === 'line' && prev && !st.arcMode) {
      var bestDir = null, w = [raw[0] - prev[0], raw[1] - prev[1]];
      smoothDirs(f, prev).dirs.forEach(function (c) {
        var s = w[0] * c.u[0] + w[1] * c.u[1], dd = Math.abs(w[0] * c.u[1] - w[1] * c.u[0]) / px;
        if (s > 0 && dd < INFER_PX.align && (!bestDir || dd < bestDir.d)) bestDir = { d: dd, c: c, s: s };
      });
      if (bestDir) {
        var sl = App.view.showGrid ? bestDir.s : niceRound(bestDir.s, 0.5 * px * 1.05), u = bestDir.c.u;
        out.p = [prev[0] + u[0] * sl, prev[1] + u[1] * sl];
        out.dir = { type: bestDir.c.type, from: prev, u: u };
        return out;
      }
    }
    // 3. aligned with the previous point (horizontal / vertical) or with another sketch point (inference lines);
    //    a rectangle's second corner is not aligned with its first (it would have no width or height)
    var tol = INFER_PX.align * px, boxTool = App.tool === 'rect' || App.tool === 'crect';
    var ax = null, ay = null;
    var alignC = [];
    if (prev && !boxTool) alignC.push({ pt: prev, prev: true });
    st.pts.forEach(function (p) { if (p !== prev && !(boxTool && p === st.pts[0])) alignC.push({ pt: p }); });
    woken.forEach(function (p) { if (!(boxTool && st.pts[0] && p[0] === st.pts[0][0] && p[1] === st.pts[0][1])) alignC.push({ pt: p }); });
    alignC.forEach(function (c) {
      var dx = Math.abs(raw[0] - c.pt[0]), dy = Math.abs(raw[1] - c.pt[1]);
      if (dx < tol && (!ax || dx < ax.d - 1e-9)) ax = { d: dx, c: c };
      if (dy < tol && (!ay || dy < ay.d - 1e-9)) ay = { d: dy, c: c };
    });
    var h = 0.5 * px * 1.05, grid = App.view.showGrid ? UI.snapStep() : 0;
    function free(v) { return grid ? +(Math.round(v / grid) * grid).toPrecision(12) : niceRound(v, h); }
    out.p = [ax ? ax.c.pt[0] : free(raw[0]), ay ? ay.c.pt[1] : free(raw[1])];
    if (ax) out.align.push({ from: ax.c.pt, axis: 'x', prev: !!ax.c.prev });
    if (ay) out.align.push({ from: ay.c.pt, axis: 'y', prev: !!ay.c.prev });
    // a circle / polygon / arc radius is rounded as a length (R 12.5, not a rounded end point)
    var a = st.pts[0];
    if (a && !grid && !out.align.length && (App.tool === 'circle' || App.tool === 'polygon' || (App.tool === 'arc' && st.pts.length === 1))) {
      var vx = raw[0] - a[0], vy = raw[1] - a[1], r = Math.hypot(vx, vy);
      if (r > 1e-12) { var rr = niceRound(r, h); out.p = [a[0] + vx / r * rr, a[1] + vy / r * rr]; }
    }
    return out;
  }
  function snap(uv, mx, my) { return inferPoint(uv, mx, my).p; }

  // The nearest point on a line, circle or arc of sketch f within tolPx screen pixels of scr, or null.
  function curveSnap(f, pl, scr, tolPx) {
    var best = null, bestD = tolPx;
    function S(uv) { return UI.worldToScreen(K.to3D(pl, uv[0], uv[1])); }
    f.entities.forEach(function (e) {
      if (e.t === 'line') {
        var a = S([e.x1, e.y1]), b = S([e.x2, e.y2]), dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
        if (L2 < 1) return;
        var t = ((scr[0] - a[0]) * dx + (scr[1] - a[1]) * dy) / L2;
        if (t <= 0 || t >= 1) return;
        var d = Math.hypot(scr[0] - (a[0] + t * dx), scr[1] - (a[1] + t * dy));
        if (d < bestD) { bestD = d; best = [e.x1 + t * (e.x2 - e.x1), e.y1 + t * (e.y2 - e.y1)]; }
      } else if (e.t === 'circle' || e.t === 'arc') {
        var c = UI.screenToPlane(scr[0], scr[1], pl);
        if (!c) return;
        var vx = c[0] - e.cx, vy = c[1] - e.cy, r = Math.hypot(vx, vy);
        if (r < 1e-12) return;
        var ang = Math.atan2(vy, vx) * 180 / Math.PI;
        if (e.t === 'arc') { var rel = ((ang - e.a0) % 360 + 360) % 360; if (rel > ((e.a1 - e.a0) % 360 + 360) % 360 && e.a1 - e.a0 < 360) return; }
        var q = [e.cx + vx / r * e.r, e.cy + vy / r * e.r], s = S(q), dd = Math.hypot(s[0] - scr[0], s[1] - scr[1]);
        if (dd < bestD) { bestD = dd; best = q; }
      }
    });
    return best;
  }

  // The lines and arcs of sketch f that end at P: the directions a new line may leave P with an inferred relation
  // ({ type: 'tangent' | 'perpendicular', u }), and `fwd`, the direction travel continues in past P along the most
  // recent of them (where a tangent arc from P starts), or null.
  function smoothDirs(f, P) {
    var S = window.SketchSolver, out = { dirs: [], fwd: null };
    if (!S || !S.endDir) return out;
    var tol = 1e-9 * Math.max(1, Math.abs(P[0]), Math.abs(P[1]));
    function axis(u) { return Math.abs(u[0]) < 1e-9 || Math.abs(u[1]) < 1e-9; }
    for (var i = f.entities.length - 1; i >= 0; i--) {
      var e = f.entities[i];
      if (!e || (e.t !== 'line' && e.t !== 'arc')) continue;
      for (var k = 1; k <= 2; k++) {
        var q = S.refPoint(f, i + '.p' + k);
        if (!q || Math.abs(q[0] - P[0]) > tol || Math.abs(q[1] - P[1]) > tol) continue;
        var t = S.endDir(e, q);
        if (!t || !(Math.abs(t[0]) + Math.abs(t[1]) > 0.5)) continue;
        var fwd = k === 2 ? t : [-t[0], -t[1]];
        if (!out.fwd) out.fwd = fwd;
        if (e.t === 'arc') { if (!axis(fwd)) out.dirs.push({ type: 'tangent', u: fwd }); }
        else if (!axis(t)) out.dirs.push({ type: 'perpendicular', u: [-t[1], t[0]] }, { type: 'perpendicular', u: [t[1], -t[0]] });
      }
    }
    return out;
  }
  // The arc that leaves P along unit direction t and ends at Q (SolidWorks' tangent arc), as a counter-clockwise
  // sketch arc; null when Q lies (nearly) on the tangent line.
  function tangentArc(P, t, Q) {
    var w = [Q[0] - P[0], Q[1] - P[1]], ww = w[0] * w[0] + w[1] * w[1], cr = t[0] * w[1] - t[1] * w[0];
    if (!(ww > 0) || Math.abs(cr) < 1e-6 * ww) return null;
    var r = ww / (2 * Math.abs(cr)), n = cr > 0 ? [-t[1], t[0]] : [t[1], -t[0]], C = [P[0] + n[0] * r, P[1] + n[1] * r];
    var aP = Math.atan2(P[1] - C[1], P[0] - C[0]) * 180 / Math.PI, aQ = Math.atan2(Q[1] - C[1], Q[0] - C[0]) * 180 / Math.PI;
    var a0 = cr > 0 ? aP : aQ, a1 = cr > 0 ? aQ : aP;
    while (a1 <= a0) a1 += 360;
    return { t: 'arc', cx: C[0], cy: C[1], r: r, a0: a0, a1: a1 };
  }
  // The arc from A to B through M (counter-clockwise sketch arc), or null when the three are (nearly) collinear.
  function threePointArc(A, B, M) {
    var ax = A[0], ay = A[1], bx = B[0], by = B[1], mx = M[0], my = M[1];
    var d = 2 * (ax * (by - my) + bx * (my - ay) + mx * (ay - by));
    var sc = Math.max(Math.hypot(bx - ax, by - ay), Math.hypot(mx - ax, my - ay), 1e-12);
    if (Math.abs(d) < 1e-9 * sc * sc) return null;
    var a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, m2 = mx * mx + my * my;
    var cx = (a2 * (by - my) + b2 * (my - ay) + m2 * (ay - by)) / d, cy = (a2 * (mx - bx) + b2 * (ax - mx) + m2 * (bx - ax)) / d;
    var D = 180 / Math.PI, aA = Math.atan2(ay - cy, ax - cx) * D, aB = Math.atan2(by - cy, bx - cx) * D, aM = Math.atan2(my - cy, mx - cx) * D;
    function ccw(from, to) { return ((to - from) % 360 + 360) % 360; }
    // M lies on the counter-clockwise sweep from A to B: A -> B; otherwise the arc runs B -> A
    var a0 = ccw(aA, aM) <= ccw(aA, aB) ? aA : aB, a1 = a0 === aA ? aB : aA;
    while (a1 <= a0) a1 += 360;
    return { t: 'arc', cx: cx, cy: cy, r: cleanLen(Math.hypot(ax - cx, ay - cy)), a0: a0, a1: a1 };
  }
  // 3 Point Arc tangent lock: the arc from A to B that leaves A (or arrives at B) tangent to the line / arc ending there,
  // when the cursor point raw is within 6 px of it: { p (raw moved onto it), arc, at: 'start' | 'end' } or null.
  function tangentLock(f, A, B, raw, px) {
    var best = null;
    [[A, B, 'start'], [B, A, 'end']].forEach(function (c) {
      var fwd = smoothDirs(f, c[0]).fwd, ta = fwd && tangentArc(c[0], fwd, c[1]);
      if (!ta) return;
      var vx = raw[0] - ta.cx, vy = raw[1] - ta.cy, L = Math.hypot(vx, vy), dd = Math.abs(L - ta.r) / px;
      if (L < 1e-12 || dd >= INFER_PX.align || (best && dd >= best.d)) return;
      var ang = Math.atan2(vy, vx) * 180 / Math.PI, rel = ((ang - ta.a0) % 360 + 360) % 360;
      if (rel > ta.a1 - ta.a0) return;   // on the other part of the circle
      best = { d: dd, p: [ta.cx + vx / L * ta.r, ta.cy + vy / L * ta.r], arc: ta, at: c[2] };
    });
    return best;
  }
  // Centerpoint Arc: does the arc run clockwise from its start point b (centre a)? The way the cursor has swept round
  // the centre decides (st.arcSweep, degrees, + counter-clockwise); before it has moved, an arc starting at a line /
  // arc end continues forward from it (tangent), otherwise counter-clockwise.
  function arcClockwise(a, b) {
    var st = App.toolState || {};
    if (st.arcSweep && Math.abs(st.arcSweep) > 1e-6) return st.arcSweep < 0;
    var f = UI.activeSketchFeature(), fwd = f && smoothDirs(f, b).fwd;
    if (!fwd) return false;
    return fwd[0] * -(b[1] - a[1]) + fwd[1] * (b[0] - a[0]) < 0;
  }
  // Line tool, tangent arc mode (SolidWorks' autotransition: press A, or move back over the end point and out again)
  function setArcMode(on) {
    var st = App.toolState, prev = st.pts[st.pts.length - 1], f = UI.activeSketchFeature();
    if (App.tool !== 'line' || !prev || !f) return false;
    if (on) {
      var fwd = smoothDirs(f, prev).fwd;
      if (!fwd) { UI.setStatus('A tangent arc starts at the end of a line or an arc.'); return false; }
      st.arcDir = fwd;
    }
    st.arcMode = !!on;
    $('sketch-hint').innerHTML = on ? 'Tangent arc: click its end point. <b>A</b> (or back over the end point and out) returns to lines.' : TOOL_HINTS.line;
    return true;
  }

  function toolEntities(pts, cur) {
    var t = App.tool, all = pts.concat(cur ? [cur] : []);
    if (all.length < 2 && t !== 'point') return [];
    var a = all[0], b = all[1], c = all[2];
    switch (t) {
      case 'line': {
        var st0 = App.toolState || {}, ta = st0.arcMode && st0.arcDir ? tangentArc(a, st0.arcDir, b) : null;
        return [ta || { t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }];
      }
      case 'rect': return [{ t: 'rect', x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) }];
      case 'crect': return [{ t: 'crect', cx: a[0], cy: a[1], w: Math.abs(b[0] - a[0]) * 2, h: Math.abs(b[1] - a[1]) * 2 }];
      case 'circle': return [{ t: 'circle', cx: a[0], cy: a[1], r: cleanLen(Math.hypot(b[0] - a[0], b[1] - a[1])) }];
      case 'polygon': {
        var n = (App.toolParams && App.toolParams.sides) || 6;
        return [{ t: 'poly', cx: a[0], cy: a[1], r: cleanLen(Math.hypot(b[0] - a[0], b[1] - a[1])), n: n, rot: Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI }];
      }
      case 'arc': {
        var r = cleanLen(Math.hypot(b[0] - a[0], b[1] - a[1]));
        var a0 = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
        if (!c) return [{ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }];
        var a1 = Math.atan2(c[1] - a[1], c[0] - a[0]) * 180 / Math.PI;
        if (arcClockwise(a, b)) { var sw0 = a0; a0 = a1; a1 = sw0; }   // stored counter-clockwise: from the end round to the start
        while (a1 <= a0) a1 += 360;
        return [{ t: 'arc', cx: a[0], cy: a[1], r: r, a0: a0, a1: a1 }];
      }
      case 'arc3': {
        if (!c) return [{ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }];
        var lk = (App.toolState || {}).tanArc;
        if (lk && lk.p[0] === c[0] && lk.p[1] === c[1]) { var la = Object.assign({}, lk.arc); la.r = cleanLen(la.r); return [la]; }
        var tp = threePointArc(a, b, c);
        return [tp || { t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }];
      }
      case 'slot': {
        if (!c) return [{ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }];
        var w = 2 * distPointLine(c, a, b);
        return [{ t: 'slot', x1: a[0], y1: a[1], x2: b[0], y2: b[1], w: Math.max(w, 0.01) }];
      }
      case 'point': return [{ t: 'point', x: a[0], y: a[1] }];
    }
    return [];
  }
  function cleanLen(x) { return +x.toPrecision(12); }   // a radius rounded as a length stays 12.5, not 12.499999999999998
  function distPointLine(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L;
  }
  function stepsNeeded() {
    switch (App.tool) { case 'arc': case 'arc3': case 'slot': return 3; case 'point': return 1; default: return 2; }
  }

  function addEntity(e) {
    var f = UI.activeSketchFeature();
    if (!f) return;
    if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; }
    if (App.drawConstruction) e.construction = true;   // the Centerline tool (ui-relations.js)
    f.entities.push(e);
    // automatic relations, as SolidWorks infers them while sketching (coincident / horizontal / vertical …)
    if (window.SketchSolver) SketchSolver.infer(f, f.entities.length - 1);
    App.gridStale = true;
    UI.updateSketches();
    UI.refreshTree();
  }

  function sketchClick(mx, my, ev) {
    var pl = UI.activePlane(), raw = UI.screenToPlane(mx, my, pl);
    if (!raw) return;
    if (App.command && App.command.onSketchPoint) { App.command.onSketchPoint(raw, mx, my); return; }
    if (App.tool === 'select') {
      if (UI.sketchSelectClick && UI.sketchSelectClick(mx, my, ev)) return;   // Ctrl / Shift toggle, Selection Filter (ui-select.js)
      var hit = UI.pickEntity(mx, my);
      App.sel = hit;
      UI.updateSketches();
      if (hit) UI.openEntityPM(hit.index); else UI.closePM();
      return;
    }
    if (App.tool === 'dimension') { dimToolClick(raw, mx, my); return; }
    var p = snap(raw, mx, my), typed = null;
    // values typed into the on-screen box hold (the length, the radius …); the click supplies the rest
    if (numBox) { typed = numValues(); p = typedPoint(p, typed); closeNumBox(); }
    placePoint(p, typed);
  }
  // The next point of the drawing tool: closes a Line chain on its first point, completes an entity once the tool has
  // all its points (adding a dimension for each value typed for it), otherwise waits for the next.
  function placePoint(p, typed) {
    var st = App.toolState;
    // a second click on the point just placed (the first half of a double-click) adds nothing: no zero-length lines
    var lastPt = st.pts[st.pts.length - 1];
    if (lastPt && Math.abs(p[0] - lastPt[0]) < 1e-9 && Math.abs(p[1] - lastPt[1]) < 1e-9) return;
    // clicking the chain's first point closes the loop and ends the chain (the Line tool stays active)
    if (App.tool === 'line' && st.pts.length && st.chainStart && Math.abs(p[0] - st.chainStart[0]) < 1e-9 && Math.abs(p[1] - st.chainStart[1]) < 1e-9) {
      addEntity(toolEntities([st.pts[st.pts.length - 1]], p)[0]);
      cancelTool(true);
      return;
    }
    if (typed) st.typed = Object.assign(st.typed || {}, typed);
    st.pts.push(p);
    st.away = st.back = false;
    if (App.tool === 'arc' && st.pts.length === 2) { st.arcSweep = 0; st.lastAng = null; }   // the sweep starts at the start point
    if (st.pts.length >= stepsNeeded()) {
      var f = UI.activeSketchFeature(), n0 = f ? f.entities.length : 0;
      var ents = toolEntities(st.pts);
      // a 3 Point Arc through three points in a line is no arc: the third click is not taken
      if (App.tool === 'arc3' && (!ents[0] || ents[0].t !== 'arc')) { st.pts.pop(); UI.setStatus('The three points are in a line: click a point off the line from start to end.'); return; }
      ents.forEach(addEntity);
      if (f && st.typed && f.entities.length === n0 + 1) typedDims(f, n0, st.typed);
      st.typed = null;
      if (App.tool === 'line') {
        var last = st.pts[st.pts.length - 1];
        st.chainStart = st.chainStart || st.pts[0];
        st.pts = [last];
        // remember the chain start so closing the loop ends the tool
        st.pts.chainStart = st.chainStart;
        if (st.arcMode) setArcMode(false);   // after a tangent arc the chain goes on with lines, as in SolidWorks
      } else {
        st.pts = [];
      }
      App.tempEntities = [];
      UI.updateTemp();
    }
  }
  // A driving dimension for each value typed while drawing entity idx (SolidWorks adds them with on-screen numeric
  // input): a line's length, a rectangle's width / height, a circle's diameter, an arc / polygon radius, a slot's
  // length / width. Typed angles only set the direction (0 / 90° lines infer Horizontal / Vertical). One that would
  // over-define the sketch is left out.
  function typedDims(f, idx, typed) {
    var e = f.entities[idx], s = UI.cam.scale || 0.1, off = Math.round(14 * s * 1e4) / 1e4, list = [];
    if (!e) return;
    function lin(k, o) { list.push({ e: idx, k: k, off: o }); }
    function rad(k) { list.push({ e: idx, k: k, ang: 45, off: Math.round((e.r + 14 * s) * 1e4) / 1e4 }); }
    switch (e.t) {
      case 'line': if (typed.len != null) lin('len', off); break;
      case 'rect': case 'crect': if (typed.w != null) lin('w', -off); if (typed.h != null) lin('h', off); break;
      case 'circle': if (typed.r != null) rad('dia'); break;
      case 'arc': if (typed.r != null && App.tool === 'arc') rad('r'); break;
      case 'poly': if (typed.r != null) rad('r'); break;
      case 'slot': if (typed.len != null) lin('len', off); if (typed.w != null) lin('w', off); break;
    }
    list.forEach(function (d) {
      f.dims = f.dims || [];
      f.dims.push(d);
      if (window.SketchSolver && SketchSolver.overDefines(f, 'dim', f.dims.length - 1)) f.dims.pop();
    });
    if (f.dims && !f.dims.length) delete f.dims;
    App.dimsStale = true;
    if (list.length) UI.updateSketches();
  }

  // ---- on-screen numeric input while drawing (SolidWorks): with a point placed, typing a number opens a small box at
  // the cursor for the live value(s) — L and A for a line, W and H for a rectangle, R for a circle … Tab moves to the
  // next value, Enter places the point, Esc closes the box. A typed value holds while the mouse supplies the rest
  // (type a length, then swing the line round); blank values follow the mouse.
  var numBox = null;   // { el, inputs: [{ key, input }] }
  var lastMove = null; // the last cursor position in the viewport [mx, my]
  function numFields() {
    var st = App.toolState || { pts: [] }, n = st.pts.length;
    if (!n || App.mode !== 'sketch' || (App.command && App.command.onSketchPoint)) return null;
    switch (App.tool) {
      case 'line': return st.arcMode ? null : [['L', 'len'], ['A', 'ang']];
      case 'rect': case 'crect': return [['W', 'w'], ['H', 'h']];
      case 'circle': return [['R', 'r']];
      case 'polygon': return [['R', 'r'], ['A', 'ang']];
      case 'arc': return n === 1 ? [['R', 'r']] : [['A', 'sweep']];
      case 'slot': return n === 1 ? [['L', 'len'], ['A', 'ang']] : [['W', 'w']];
    }
    return null;
  }
  function openNumBox(firstChar) {
    var fields = numFields();
    if (!fields) return false;
    closeNumBox();
    var el = document.createElement('div');
    el.id = 'sk-num';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Value of the entity being drawn');
    el.style.cssText = 'position:absolute;z-index:5;display:flex;gap:4px;align-items:center;background:var(--input-bg);border:1px solid var(--blue);border-radius:3px;padding:2px 4px;box-shadow:0 2px 8px var(--shadow);font:12px "Segoe UI",sans-serif;color:var(--text)';
    var box = { el: el, inputs: [] };
    fields.forEach(function (fd) {
      var lab = document.createElement('label');
      lab.textContent = fd[0];
      lab.style.cssText = 'color:var(--blue);font-weight:600';
      var inp = document.createElement('input');
      inp.type = 'text'; inp.setAttribute('inputmode', 'decimal'); inp.spellcheck = false; inp.autocomplete = 'off';
      inp.setAttribute('aria-label', fd[0] === 'A' ? 'Angle' : fd[0] === 'L' ? 'Length' : fd[0] === 'R' ? 'Radius' : fd[0] === 'W' ? 'Width' : 'Height');
      inp.style.cssText = 'width:58px;border:0;outline:0;background:transparent;font:inherit;color:inherit;padding:1px 2px;border-bottom:1px solid var(--line)';
      inp.addEventListener('keydown', numKey);
      inp.addEventListener('input', function () { inp.style.outline = ''; numPreview(); });
      lab.appendChild(inp);
      el.appendChild(lab);
      box.inputs.push({ key: fd[1], input: inp });
    });
    el.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
    dimEdit.parentNode.appendChild(el);
    numBox = box;
    positionNumBox();
    var first = box.inputs[0].input;
    first.value = firstChar || '';
    first.focus();
    first.setSelectionRange(first.value.length, first.value.length);
    numPreview();
    return true;
  }
  function positionNumBox() {
    if (!numBox) return;
    var m = lastMove || [UI.size.w / 2, UI.size.h / 2];
    numBox.el.style.left = Math.round(Math.min(m[0] + 14, UI.size.w - 160)) + 'px';
    numBox.el.style.top = Math.round(Math.max(4, m[1] - 52)) + 'px';
  }
  function closeNumBox() {
    if (!numBox) return;
    var b = numBox; numBox = null;
    if (b.el.parentNode) b.el.parentNode.removeChild(b.el);
  }
  // the typed values: { len, ang, w, h, r, sweep } (only those entered); a bad entry is marked and left out
  function numValues() {
    var out = {};
    if (!numBox) return out;
    numBox.inputs.forEach(function (x) {
      var s = x.input.value.trim();
      if (!s) return;
      var r = parseDimInput(s);
      if (r.error != null || !isFinite(r.value)) { x.input.style.outline = '1px solid #d33'; return; }
      if ((x.key !== 'ang' && x.key !== 'sweep') && !(r.value > 0)) { x.input.style.outline = '1px solid #d33'; return; }
      out[x.key] = r.value;
    });
    return out;
  }
  function clean(v) { return +v.toPrecision(12); }
  // The tool's next point for cursor point cur with the typed values v holding.
  function typedPoint(cur, v) {
    var st = App.toolState, pts = st.pts, a = pts[0], last = pts[pts.length - 1], D = Math.PI / 180;
    if (!a || !v) return cur;
    function polar(o, L, ang) { return [clean(o[0] + L * Math.cos(ang)), clean(o[1] + L * Math.sin(ang))]; }
    function sg(x) { return x < 0 ? -1 : 1; }
    var dx = cur[0] - a[0], dy = cur[1] - a[1];
    switch (App.tool) {
      case 'line': case 'slot': case 'polygon': {
        if (App.tool === 'slot' && pts.length === 2) {
          if (v.w == null) return cur;
          var b = pts[1], ux = b[0] - a[0], uy = b[1] - a[1], L = Math.hypot(ux, uy) || 1, n = [-uy / L, ux / L];
          var side = sg((cur[0] - a[0]) * n[0] + (cur[1] - a[1]) * n[1]);
          return [clean(a[0] + n[0] * side * v.w / 2), clean(a[1] + n[1] * side * v.w / 2)];
        }
        var o = App.tool === 'line' ? last : a, ex = cur[0] - o[0], ey = cur[1] - o[1];
        var len = App.tool === 'polygon' ? v.r : v.len;
        if (len == null) len = Math.hypot(ex, ey);
        var ang = v.ang != null ? v.ang * D : (Math.hypot(ex, ey) > 1e-12 ? Math.atan2(ey, ex) : 0);
        return polar(o, len, ang);
      }
      case 'rect': return [clean(a[0] + sg(dx) * (v.w != null ? v.w : Math.abs(dx))), clean(a[1] + sg(dy) * (v.h != null ? v.h : Math.abs(dy)))];
      case 'crect': return [clean(a[0] + sg(dx) * (v.w != null ? v.w / 2 : Math.abs(dx))), clean(a[1] + sg(dy) * (v.h != null ? v.h / 2 : Math.abs(dy)))];
      case 'circle': return v.r == null ? cur : polar(a, v.r, Math.hypot(dx, dy) > 1e-12 ? Math.atan2(dy, dx) : 0);
      case 'arc': {
        if (pts.length === 1) return v.r == null ? cur : polar(a, v.r, Math.hypot(dx, dy) > 1e-12 ? Math.atan2(dy, dx) : 0);
        if (v.sweep == null) return cur;
        var b2 = pts[1], a0 = Math.atan2(b2[1] - a[1], b2[0] - a[0]);
        return polar(a, Math.hypot(b2[0] - a[0], b2[1] - a[1]), a0 + (arcClockwise(a, b2) ? -1 : 1) * v.sweep * D);
      }
    }
    return cur;
  }
  function numPreview() {
    if (!numBox || !lastMove) return;
    sketchMove(lastMove[0], lastMove[1]);
  }
  function numKey(ev) {
    ev.stopPropagation();
    if (!numBox) return;
    var list = numBox.inputs.map(function (x) { return x.input; }), k = list.indexOf(ev.target);
    if (ev.key === 'Tab') {
      ev.preventDefault();
      var nx = list[(k + (ev.shiftKey ? list.length - 1 : 1)) % list.length];
      nx.focus(); nx.select();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      var v = numValues();
      if (numBox.inputs.some(function (x) { return x.input.style.outline; })) { UI.setStatus('Not a valid value: type a positive length, or an angle in degrees.'); return; }
      var pl = UI.activePlane(), m = lastMove, raw = m ? UI.screenToPlane(m[0], m[1], pl) : null;
      var cur = raw ? inferPoint(raw, m[0], m[1]).p : (App.toolState.pts[App.toolState.pts.length - 1] || [0, 0]);
      var p = typedPoint(cur, v);
      closeNumBox();
      placePoint(p, v);
      if (m) sketchMove(m[0], m[1]);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      closeNumBox();
      if (lastMove) sketchMove(lastMove[0], lastMove[1]);
    }
  }
  // typing a number (or "=" for an equation) with a drawing tool and a point placed opens the box; A in the Line tool
  // switches to a tangent arc and back
  document.addEventListener('keydown', function (ev) {
    if (App.mode !== 'sketch' || ev.ctrlKey || ev.metaKey || ev.altKey || numBox) return;
    var tag = (ev.target && ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (ev.target && ev.target.isContentEditable)) return;
    if (App.tool === 'line' && (ev.key === 'a' || ev.key === 'A') && App.toolState.pts.length) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      setArcMode(!App.toolState.arcMode);
      if (lastMove) sketchMove(lastMove[0], lastMove[1]);
      return;
    }
    if (/^[0-9.=]$/.test(ev.key) || (ev.key === '-' && App.tool !== 'select')) {
      if (!numFields()) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      openNumBox(ev.key);
    }
  }, true);
  UI.sketchNumBox = function () { return numBox ? numBox.inputs.map(function (x) { return x.input; }) : null; };

  function sketchMove(mx, my) {
    var pl = UI.activePlane(), raw = UI.screenToPlane(mx, my, pl);
    if (!raw) return;
    var drawing = App.tool !== 'select' && App.tool !== 'dimension' && !(App.command && App.command.onSketchPoint);
    lastMove = [mx, my];
    // Line tool: back over the chain's end point and out again switches between line and tangent arc (SolidWorks)
    if (drawing && App.tool === 'line' && App.toolState.pts.length && !numBox) {
      var st = App.toolState, e0 = st.pts[st.pts.length - 1], s0 = UI.worldToScreen(K.to3D(pl, e0[0], e0[1])), d0 = Math.hypot(s0[0] - mx, s0[1] - my);
      if (d0 > 15) { if (st.back) { st.back = false; setArcMode(!st.arcMode); } st.away = true; }
      else if (d0 < 5 && st.away) st.back = true;
    }
    var info = drawing ? inferPoint(raw, mx, my) : null, p = info ? info.p : raw;
    // Centerpoint Arc: follow the way the cursor sweeps round the centre (the arc runs that way, as in SolidWorks)
    if (drawing && App.tool === 'arc' && App.toolState.pts.length === 2) {
      var sa = App.toolState, c0 = sa.pts[0], b0 = sa.pts[1], D0 = 180 / Math.PI;
      if (Math.hypot(p[0] - c0[0], p[1] - c0[1]) > 1e-12) {
        var angNow = Math.atan2(p[1] - c0[1], p[0] - c0[0]) * D0;
        if (sa.lastAng == null) sa.lastAng = Math.atan2(b0[1] - c0[1], b0[0] - c0[0]) * D0;
        var dA = ((angNow - sa.lastAng) % 360 + 540) % 360 - 180;
        sa.arcSweep = (sa.arcSweep || 0) + dA;
        sa.lastAng = angNow;
      }
    }
    if (info && numBox) {
      var tv = numValues();
      if (Object.keys(tv).length) { p = typedPoint(p, tv); info = { p: p, snap: null, align: [], px: info.px }; }
    }
    var readout = drawing && App.toolState.pts.length ? toolReadout(App.toolState.pts, p) : '';
    $('status-coords').textContent = 'X: ' + UI.fmtNum(p[0], 2).padStart(9) + '   Y: ' + UI.fmtNum(p[1], 2).padStart(9) + '  ' + UI.unitLabel() + (readout ? '   ' + readout : '');
    if (!drawing) {
      // pre-highlight what a click would pick (select, Smart Dimension, Add Relations, Trim …), as SolidWorks does
      var ref = UI.pickSketchRef && !App.zoomAreaMode ? UI.pickSketchRef(mx, my) : null;
      drawHover(pl, ref === 'O' ? null : ref);
      // a sketch command's own hover preview (Extend Entities shows where the end would go)
      if (App.command && App.command.onSketchMove) App.command.onSketchMove(raw, mx, my);
    }
    if (App.tool === 'dimension') { dimToolMove(raw); return; }
    if (drawing && App.toolState.pts.length) {
      App.tempEntities = toolEntities(App.toolState.pts, p);
      UI.updateTemp();
      // yellow inference icons: the relations the entity being drawn would get
      var f = UI.activeSketchFeature();
      App.inferPreview = f && window.SketchSolver && App.tempEntities.length === 1 ? SketchSolver.inferPreview(f, App.tempEntities[0]) : [];
    } else if (App.inferPreview && App.inferPreview.length) App.inferPreview = [];
    if (drawing) drawFeedback(pl, info, mx, my, readout);
  }
  // while dragging an end point: the point / curve it would merge with (ui-relations.js), or null
  UI.sketchSnapMark = function (uv, q, onCurve, type) {
    var layer = feedbackLayer();
    clearFeedback();
    if (!uv) return;
    var s = UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1]));
    svg('circle', { cx: s[0], cy: s[1], r: onCurve ? 3 : 5, style: 'fill:' + (onCurve ? '#e8891c' : 'none') + ';stroke:#e8891c;stroke-width:1.5' }, layer);
    glyph(layer, q[0] + 14, q[1] + 12, type || 'coincident');
  };
  // orange dashed polylines (sketch coordinates) added to the cursor feedback: a command's preview
  UI.sketchPreview = function (polylines) {
    var layer = feedbackLayer(), pl = UI.activePlane();
    (polylines || []).forEach(function (pts) {
      var s = pts.map(function (q) { var p = UI.worldToScreen(K.to3D(pl, q[0], q[1])); return Math.round(p[0] * 10) / 10 + ',' + Math.round(p[1] * 10) / 10; });
      svg('polyline', { 'class': 'sk-preview', points: s.join(' '), style: 'stroke:#e8891c;stroke-width:2;fill:none;stroke-dasharray:5 3;stroke-linecap:round' }, layer);
    });
  };
  var HOVER_STYLE ='stroke:#e8891c;stroke-width:2.5;fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:0.9';
  function drawHover(pl, ref) {
    var layer = feedbackLayer(), f = UI.activeSketchFeature(), S = window.SketchSolver;
    clearFeedback();
    if (!ref || !f || !S) return;
    function scr(p) { return UI.worldToScreen(K.to3D(pl, p[0], p[1])); }
    var pr = S.parseRef(ref), p = S.refPoint(f, ref);
    if (p) { var s = scr(p); svg('circle', { cx: s[0], cy: s[1], r: 4.5, style: 'stroke:#e8891c;stroke-width:1.5;fill:#e8891c;fill-opacity:0.35' }, layer); return; }
    var e = pr && !pr.o && f.entities[pr.e], c = S.refCurve(f, ref), pls;
    if (!e) return;
    if (c && c.kind === 'line' && pr.s === 'e') pls = [{ pts: [c.a, c.b], closed: false }];
    else pls = e.t === 'point' ? [] : K.entityPolylines(e);
    pls.forEach(function (l) {
      var pts = l.pts.map(function (q) { return scr(q).map(function (v) { return Math.round(v * 10) / 10; }).join(','); });
      if (l.closed && pts.length) pts.push(pts[0]);
      svg('polyline', { points: pts.join(' '), style: HOVER_STYLE }, layer);
    });
  }

  // Live value next to the cursor while drawing (SolidWorks shows the length / radius / angle as you drag).
  function toolReadout(pts, p) {
    var a = pts[0], n = UI.fmtNum, t = App.tool;
    if (!a) return '';
    var dx = p[0] - a[0], dy = p[1] - a[1], L = Math.hypot(dx, dy);
    function ang(x, y) { var d = Math.atan2(y, x) * 180 / Math.PI; return n(d < 0 ? d + 360 : d, 1) + '°'; }
    switch (t) {
      case 'line': {
        var q = pts[pts.length - 1], st1 = App.toolState || {}, ta = st1.arcMode && st1.arcDir ? tangentArc(q, st1.arcDir, p) : null;
        if (ta) return 'R ' + n(ta.r, 2) + '   A ' + n(ta.a1 - ta.a0, 1) + '°';
        dx = p[0] - q[0]; dy = p[1] - q[1]; return 'L ' + n(Math.hypot(dx, dy), 2) + '   A ' + ang(dx, dy);
      }
      case 'rect': return n(Math.abs(dx), 2) + ' × ' + n(Math.abs(dy), 2);
      case 'crect': return n(Math.abs(dx) * 2, 2) + ' × ' + n(Math.abs(dy) * 2, 2);
      case 'circle': return 'R ' + n(L, 2);
      case 'polygon': return 'R ' + n(L, 2) + '   A ' + ang(dx, dy);
      case 'arc': {
        if (pts.length < 2) return 'R ' + n(L, 2);
        var b = pts[1], a0 = Math.atan2(b[1] - a[1], b[0] - a[0]), a1 = Math.atan2(dy, dx), sw = (a1 - a0) * 180 / Math.PI;
        if (arcClockwise(a, b)) sw = -sw;
        while (sw <= 0) sw += 360;
        return 'R ' + n(Math.hypot(b[0] - a[0], b[1] - a[1]), 2) + '   A ' + n(sw, 1) + '°';
      }
      case 'arc3': {
        if (pts.length < 2) return 'L ' + n(L, 2);
        var ta3 = toolEntities(pts, p)[0];
        return ta3 && ta3.t === 'arc' ? 'R ' + n(ta3.r, 2) + '   A ' + n(ta3.a1 - ta3.a0, 1) + '°' : 'L ' + n(Math.hypot(pts[1][0] - a[0], pts[1][1] - a[1]), 2);
      }
      case 'slot': return pts.length < 2 ? 'L ' + n(L, 2) : 'L ' + n(Math.hypot(pts[1][0] - a[0], pts[1][1] - a[1]), 2) + '   W ' + n(2 * distPointLine(p, a, pts[1]), 2);
    }
    return '';
  }

  // ---- cursor feedback: inference lines, the snapped point, relation glyphs and the live value, in a group of the
  // #dim-layer SVG that drawDims keeps (redrawn on every mouse move without redrawing the dimensions)
  var fbLayer = null;
  var SNAP_GLYPH = { end: 'coincident', origin: 'coincident', on: 'coincident', quadrant: 'coincident', intersection: 'coincident', midpoint: 'midpoint', center: 'concentric' };
  function feedbackLayer() {
    if (!fbLayer) fbLayer = svg('g', { 'class': 'sk-feedback', 'pointer-events': 'none' });
    if (fbLayer.parentNode !== dimLayer) dimLayer.appendChild(fbLayer);
    return fbLayer;
  }
  function clearFeedback() { if (fbLayer) while (fbLayer.firstChild) fbLayer.removeChild(fbLayer.firstChild); }
  function glyph(layer, x, y, type) {
    var g = svg('g', { 'class': 'rel-badge infer', transform: 'translate(' + Math.round(x) + ',' + Math.round(y) + ')' }, layer);
    svg('rect', { x: 0, y: 0, width: 16, height: 16, rx: 2 }, g);
    var inner = svg('g', { transform: 'translate(1,1) scale(0.875)' }, g);
    inner.innerHTML = Icons('rel' + type.charAt(0).toUpperCase() + type.slice(1), 16).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    return g;
  }
  function drawFeedback(pl, info, mx, my, readout) {
    var layer = feedbackLayer();
    clearFeedback();
    if (!info) return;
    function scr(p) { return UI.worldToScreen(K.to3D(pl, p[0], p[1])); }
    var sp = scr(info.p);
    // dotted blue inference lines from the points the cursor lines up with
    info.align.forEach(function (al) {
      if (al.prev && App.tool === 'line') return;   // the rubber band itself shows that one
      var a = scr(al.from);
      svg('line', { x1: a[0], y1: a[1], x2: sp[0], y2: sp[1], style: 'stroke:var(--blue);stroke-width:1;stroke-dasharray:2 3' }, layer);
    });
    // the point taken: an orange ring on an existing point, a small dot on a curve
    // a tangent / perpendicular direction taken: a dotted inference line along it from the end point, past the cursor
    if (info.dir) {
      var a0 = scr(info.dir.from), vx = sp[0] - a0[0], vy = sp[1] - a0[1], vl = Math.hypot(vx, vy) || 1;
      svg('line', { x1: a0[0], y1: a0[1], x2: sp[0] + vx / vl * 40, y2: sp[1] + vy / vl * 40, style: 'stroke:var(--blue);stroke-width:1;stroke-dasharray:2 3' }, layer);
    }
    if (info.snap) svg('circle', { cx: sp[0], cy: sp[1], r: info.snap.kind === 'on' ? 3 : 5, style: 'fill:' + (info.snap.kind === 'on' ? '#e8891c' : 'none') + ';stroke:#e8891c;stroke-width:1.5' }, layer);
    // relation glyphs by the cursor: what the click will infer
    var types = [];
    if (info.snap && SNAP_GLYPH[info.snap.kind]) types.push(SNAP_GLYPH[info.snap.kind]);
    if ((info.dir && info.dir.glyph) || info.tan) types.push('tangent');   // the arc tools' tangent guidance
    (App.inferPreview || []).forEach(function (c) { if (types.indexOf(c.type) < 0) types.push(c.type); });
    types.forEach(function (t, k) { glyph(layer, mx + 14 + k * 18, my + 12, t); });
    if (readout) {
      var t = svg('text', { x: mx + 14, y: my - 10, style: 'fill:var(--blue);font-size:11px;pointer-events:none' }, layer);
      t.textContent = readout;
    }
  }

  // ------------------------------------------------------------------ Smart Dimension
  // Placed dimensions live on the sketch feature as f.dims ({ e, k, i, off, ang }, see Kernel.dimGeometry) and
  // survive in the JSON and the generated script. With View ▸ Sketch Dimensions on, every entity without a placed
  // dimension of the same kind also shows its driven values. Both are drawn into the #dim-layer SVG each time the
  // camera or the sketch changes (App.dimsStale, consumed by the render loop) and edited through #dim-edit; the
  // kernel's setDimValue moves the entity so the value reads as typed (there is no constraint solver).
  var dimLayer = $('dim-layer'), dimEdit = $('dim-edit'), dimInput = dimEdit.querySelector('input');
  var SVGNS = 'http://www.w3.org/2000/svg';
  var dimEditing = null; // { d, auto, index, rel, sketchId }
  var lastDimError = null; // why the last committed value was not applied (the solver refused it)
  function svg(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }
  function fmtDim(n) { return UI.fmtNum(n, 2); }

  // driven dimensions shown automatically for an entity that has no placed dimension of the same kind
  function autoDims(e, i, placed) {
    var kinds;
    switch (e.t) {
      case 'line': kinds = [{ k: 'len' }]; break;
      case 'rect': case 'crect': kinds = [{ k: 'w', i: 2 }, { k: 'h', i: 1 }]; break;
      case 'circle': kinds = [{ k: 'dia' }]; break;
      case 'arc': case 'poly': kinds = [{ k: 'r' }]; break;
      case 'slot': kinds = [{ k: 'len' }, { k: 'w' }]; break;
      default: return [];
    }
    return kinds.filter(function (t) {
      return !placed.some(function (d) { return d.e === i && (d.k === t.k || e.t === 'line'); });
    }).map(function (t) { t.e = i; return t; });
  }

  // Placement of a dimension from the cursor position (sketch coordinates): { off, tx? } for linear, { ang, off } for radial.
  function dimPlacement(e, d, uv) {
    var g = K.dimGeometry(e, d);
    if (!g) return {};
    if (g.type === 'linear') {
      var n = [-g.dir[1], g.dir[0]], out = { off: Math.round(((uv[0] - g.P[0]) * n[0] + (uv[1] - g.P[1]) * n[1]) * 1e4) / 1e4 };
      var tx = textAlong(uv, g.P, g.dir, g.value);
      if (tx != null) out.tx = tx;
      return out;
    }
    var dx = uv[0] - g.C[0], dy = uv[1] - g.C[1];
    return { ang: Math.round(Math.atan2(dy, dx) * 1800 / Math.PI) / 10, off: Math.round(Math.hypot(dx, dy) * 1e4) / 1e4 };
  }
  // Where the label of a linear dimension from P along dir (length value) sits for the cursor at uv: its offset from
  // the middle along the dimension line (sketch units), or null within 10 px of the middle (the label centres itself,
  // as it snaps there in SolidWorks).
  function textAlong(uv, P, dir, value) {
    var t = (uv[0] - P[0]) * dir[0] + (uv[1] - P[1]) * dir[1] - value / 2, s = UI.cam.scale || 0.1;
    return Math.abs(t) < 10 * s ? null : Math.round(t * 1e4) / 1e4;
  }
  UI.dimTextAlong = textAlong;

  // A linear dimension between sketch points P and Q measured along unit direction dir (pointing from P towards Q),
  // its dimension line `off` along dir's left normal from P: extension lines from both points reach the dimension
  // line (a horizontal distance between points at different heights gets one longer extension line), arrows inside
  // or, when short, outside, and the label at the middle. `along` lets drawDims slide the label along the dimension
  // line to keep labels apart.
  function linearDimScreen(pl, P, Q, dir, off0, tx) {
    var s = UI.cam.scale;
    function S(uv) { return UI.worldToScreen(K.to3D(pl, uv[0], uv[1])); }
    function unit(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; }
    var n = [-dir[1], dir[0]], value = (Q[0] - P[0]) * dir[0] + (Q[1] - P[1]) * dir[1];
    var off = off0 != null ? off0 : 16 * s;
    if (Math.abs(off) < 6 * s) off = (off < 0 ? -6 : 6) * s;
    var A = [P[0] + n[0] * off, P[1] + n[1] * off], B = [A[0] + dir[0] * value, A[1] + dir[1] * value];
    var sA = S(A), sB = S(B), out = { lines: [], arrows: [], value: value };
    [[P, off], [Q, off + (P[0] - Q[0]) * n[0] + (P[1] - Q[1]) * n[1]]].forEach(function (x) {
      var X = x[0], o = x[1], sg = o < 0 ? -1 : 1, gap = 2 * s * sg, ext = o + 3 * s * sg;
      out.lines.push([S([X[0] + n[0] * gap, X[1] + n[1] * gap]), S([X[0] + n[0] * ext, X[1] + n[1] * ext])]);
    });
    out.lines.push([sA, sB]);
    var u = unit(sB, sA), inside = Math.hypot(sB[0] - sA[0], sB[1] - sA[1]) > 34;
    out.arrows.push({ tip: sA, dir: inside ? u : [-u[0], -u[1]] }, { tip: sB, dir: inside ? [-u[0], -u[1]] : u });
    var sg0 = off < 0 ? -1 : 1, nS = unit(sA, S([A[0] + n[0] * sg0 * s, A[1] + n[1] * sg0 * s]));
    out.text = { x: (sA[0] + sB[0]) / 2 + nS[0] * 9, y: (sA[1] + sB[1]) / 2 + nS[1] * 9 + 4, anchor: 'middle' };
    out.along = { u: [-u[0], -u[1]], half: Math.hypot(sB[0] - sA[0], sB[1] - sA[1]) / 2, shift: tx ? tx / s : 0 };
    return out;
  }
  UI.linearDimScreen = linearDimScreen;

  // Screen-space drawing data for one dimension: lines, arrow heads, and the label with its anchor point.
  function dimScreen(pl, e, d) {
    var g = K.dimGeometry(e, d);
    if (!g) return null;
    var s = UI.cam.scale; // sketch units per pixel (orthographic camera)
    function S(uv) { return UI.worldToScreen(K.to3D(pl, uv[0], uv[1])); }
    function unit(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; }
    var out = { lines: [], arrows: [], value: g.value, label: g.prefix + fmtDim(g.value) };
    if (g.type === 'linear') {
      var ld = linearDimScreen(pl, g.P, g.Q, g.dir, d.off, d.tx);
      ld.value = g.value; ld.label = out.label;
      return ld;
    } else {
      var ang = (d.ang != null ? d.ang : 45) * Math.PI / 180, ux = Math.cos(ang), uy = Math.sin(ang);
      var Pc = [g.C[0] + ux * g.r, g.C[1] + uy * g.r];
      var dist = Math.max(d.off != null ? d.off : 0, g.r + 18 * s);
      var T = [g.C[0] + ux * dist, g.C[1] + uy * dist];
      var sPc = S(Pc), sT = S(T), ut = unit(sPc, sT);
      out.lines.push([sPc, sT]);
      out.arrows.push({ tip: sPc, dir: [-ut[0], -ut[1]] });
      out.text = { x: sT[0] + ut[0] * 4, y: sT[1] + ut[1] * 4 + 4, anchor: ut[0] >= -0.2 ? 'start' : 'end' };
      out.along = { u: ut, half: 0, radial: true };
    }
    return out;
  }

  // ---- labels kept apart: each label drawn takes a box; a label that would overlap one drawn before it slides along
  // its dimension line (a radius / diameter label: out along its leader) to the nearest free place, and the
  // dimension line is extended to reach it. Display only: the stored placement does not change. The label being
  // placed with the Smart Dimension tool stays under the cursor and moves nothing.
  var labelBoxes = [];
  function labelBox(sc, dx, dy) {
    var w = sc.label.length * 6.6 + 4, x = sc.text.x + dx, y = sc.text.y + dy;
    var x0 = sc.text.anchor === 'middle' ? x - w / 2 : sc.text.anchor === 'end' ? x - w : x;
    return [x0, y - 11, x0 + w, y + 3];
  }
  function boxFree(b) {
    for (var i = 0; i < labelBoxes.length; i++) { var o = labelBoxes[i]; if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return false; }
    return true;
  }
  function placeLabel(sc, it) {
    if (!sc.text) return;
    var al = sc.along, s0 = al && al.shift || 0, b = labelBox(sc, al ? al.u[0] * s0 : 0, al ? al.u[1] * s0 : 0), best = s0;
    if (al && !it.temp && !boxFree(b)) {
      var w = b[2] - b[0], step = al.radial ? 14 : w + 4, tries = al.radial ? [1, 2, 3, 4, 5] : [1, -1, 2, -2, 3, -3, 4, -4];
      for (var k = 0; k < tries.length; k++) {
        var t = s0 + tries[k] * step, bb = labelBox(sc, al.u[0] * t, al.u[1] * t);
        if (boxFree(bb)) { best = t; b = bb; break; }
      }
    }
    if (al && best) {
      var wl = b[2] - b[0];
      sc.text = { x: sc.text.x + al.u[0] * best, y: sc.text.y + al.u[1] * best, anchor: sc.text.anchor };
      // the dimension line runs on to a label moved past its end
      var reach = Math.abs(best) + wl / 2;
      if (!al.radial && reach > al.half) {
        var line = sc.lines[sc.lines.length - 1], c = [(line[0][0] + line[1][0]) / 2, (line[0][1] + line[1][1]) / 2], sg = best < 0 ? -1 : 1;
        sc.lines.push([[c[0] + al.u[0] * sg * al.half, c[1] + al.u[1] * sg * al.half], [c[0] + al.u[0] * sg * reach, c[1] + al.u[1] * sg * reach]]);
      } else if (al.radial) {
        var ld = sc.lines[0];
        sc.lines.push([ld[1], [ld[1][0] + al.u[0] * best, ld[1][1] + al.u[1] * best]]);
      }
    }
    if (!it.temp) labelBoxes.push(b);
  }

  // ---- selecting, moving and editing a dimension, as in SolidWorks: a click selects it, a double-click opens the
  // Modify box, dragging the value moves the dimension (its offset / angle; a distance keeps its direction)
  var lastDimDown = null;   // { key, t } of the last press on a dimension value (double-click detection)
  function dimKey(it) { return it.rel != null ? 'r' + it.rel : it.auto ? 'a' + it.d.e + it.d.k + (it.d.i | 0) : 'd' + it.index; }
  function selectDim(it) {
    if (it.rel != null) App.sel = { kind: 'rel', index: it.rel };
    else if (!it.auto) App.sel = { kind: 'dim', index: it.index };
    else return;
    UI.closePM(); UI.updateSketches();
  }
  function editDimItem(it) {
    if (it.d.driven && UI.drivenDimClick) { UI.drivenDimClick(it); return; }
    openDimEdit(it);
  }
  function dimPress(ev, it) {
    if (ev.button !== 0) return;
    ev.stopPropagation(); ev.preventDefault();
    var key = dimKey(it), now = performance.now();
    if (lastDimDown && lastDimDown.key === key && now - lastDimDown.t < 450) { lastDimDown = null; editDimItem(it); return; }
    lastDimDown = { key: key, t: now };
    if (dimEditing) closeDimEdit(true);
    selectDim(it);
    var f = UI.activeSketchFeature(), d = it.rel != null ? f && f.rels && f.rels[it.rel] : it.auto ? null : f && f.dims && f.dims[it.index];
    var x0 = ev.clientX, y0 = ev.clientY, moved = false, frame = 0, last = null;
    function apply() {
      frame = 0;
      var f2 = UI.activeSketchFeature();
      if (!last || f2 !== f || !d) return;
      var r = viewport.getBoundingClientRect(), uv = UI.screenToPlane(last[0] - r.left, last[1] - r.top, UI.activePlane());
      if (!uv) return;
      var pl = it.rel != null ? (UI.relDimPlacement ? UI.relDimPlacement(f, d, uv) : {}) : dimPlacement(f.entities[d.e], d, uv);
      ['off', 'ang'].forEach(function (k) { if (pl[k] != null) d[k] = pl[k]; });
      if (pl.off != null && pl.ang == null) { if (pl.tx != null) d.tx = pl.tx; else delete d.tx; }   // a linear label sits where it is dropped
      App.dimsStale = true;
    }
    function move(e2) {
      if (!moved && Math.hypot(e2.clientX - x0, e2.clientY - y0) < 4) return;
      if (!d) return;
      if (!moved) { moved = true; lastDimDown = null; if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; } viewport.classList.add('tool-grab'); }
      last = [e2.clientX, e2.clientY];
      if (!frame) frame = requestAnimationFrame(apply);
    }
    function up() {
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', up, true);
      if (frame) { cancelAnimationFrame(frame); apply(); }
      viewport.classList.remove('tool-grab');
      if (moved) UI.setStatus('Dimension moved.');
      else UI.setStatus((it.auto ? 'Driven value' : 'Dimension') + ' ' + (it.label || '') + ' selected. Double-click to change it; drag it to move it' + (it.auto ? '' : '; Delete removes it') + '.');
    }
    window.addEventListener('mousemove', move, true);
    window.addEventListener('mouseup', up, true);
  }

  function drawOne(sc, it) {
    var isSel = it.rel != null ? App.sel && App.sel.kind === 'rel' && App.sel.index === it.rel : App.sel && App.sel.kind === 'dim' && App.sel.index === it.index;
    var cls = 'dim' + (it.temp ? ' temp' : '') + (it.auto ? ' auto' : '') + (!it.temp && !it.auto && isSel ? ' sel' : '') + (it.state && it.state !== 'ok' ? ' ' + it.state : '');
    placeLabel(sc, it);
    var gEl = svg('g', { 'class': cls }, dimLayer);
    sc.lines.forEach(function (l) { svg('line', { x1: l[0][0], y1: l[0][1], x2: l[1][0], y2: l[1][1] }, gEl); });
    sc.arrows.forEach(function (a) {
      var ax = a.dir[0] * 9, ay = a.dir[1] * 9, px = -a.dir[1] * 3, py = a.dir[0] * 3;
      svg('polygon', { points: a.tip[0] + ',' + a.tip[1] + ' ' + (a.tip[0] - ax + px) + ',' + (a.tip[1] - ay + py) + ' ' + (a.tip[0] - ax - px) + ',' + (a.tip[1] - ay - py) }, gEl);
    });
    var t = svg('text', { x: sc.text.x, y: sc.text.y, 'text-anchor': sc.text.anchor }, gEl);
    t.textContent = sc.label;
    it.label = sc.label;
    if (!it.temp) {
      t.addEventListener('mousedown', function (ev) { dimPress(ev, it); });
      t.addEventListener('click', function (ev) { ev.stopPropagation(); });
      t.addEventListener('dblclick', function (ev) { ev.stopPropagation(); });
      t.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); selectDim(it); editDimItem(it); } });
      t.setAttribute('tabindex', '0');
      t.setAttribute('role', 'button');
      t.setAttribute('aria-label', 'Dimension ' + sc.label + ', double-click to change, drag to move');
    }
    it.text = sc.text;
  }

  // Redraw every dimension of the active sketch. Called from the render loop whenever App.dimsStale is set.
  function drawDims() {
    for (var c = dimLayer.firstChild; c; ) { var nx = c.nextSibling; if (c !== fbLayer) dimLayer.removeChild(c); c = nx; }
    labelBoxes = [];
    var f = UI.activeSketchFeature();
    if (!f || App.mode !== 'sketch') { clearFeedback(); if (dimEditing) closeDimEdit(false); return []; }
    var pl = UI.activePlane(), placed = f.dims || [], list = [], stale = [];
    var an = App.sketchState;
    placed.forEach(function (d, i) { list.push({ d: d, index: i, state: d.driven ? 'driven' : an && an.dims ? an.dims[i] : null }); });
    if (App.view.showDims) f.entities.forEach(function (e, i) { autoDims(e, i, placed).forEach(function (d) { list.push({ d: d, auto: true }); }); });
    if (App.tempDim) list.push({ d: App.tempDim, temp: true });
    list.forEach(function (it) {
      var e = f.entities[it.d.e], sc = e && dimScreen(pl, e, it.d);
      if (!sc) { if (it.index != null) stale.push(it.index); return; }
      if (it.d.driven) sc.label = '(' + sc.label + ')';   // driven (reference) dimension
      drawOne(sc, it);
    });
    // relation icons, inference icons and the two-entity (distance / angle) dimensions: ui-relations.js
    if (UI.drawRelations) UI.drawRelations(f, pl, dimLayer, { svg: svg, drawOne: drawOne, list: list });
    // placed dimensions whose entity vanished or changed type (delete, trim, mirror in place) are dropped
    if (stale.length) {
      f.dims = placed.filter(function (d, i) { return stale.indexOf(i) < 0; });
      if (App.sel && App.sel.kind === 'dim') App.sel = null;
    }
    if (fbLayer && fbLayer.parentNode === dimLayer) dimLayer.appendChild(fbLayer);   // cursor feedback stays on top
    if (dimEditing) positionDimEdit(list);
    return list;
  }

  // ---- the Modify box (SolidWorks): opens next to the dimension with its value selected. Enter / ✓ applies, Esc / ✗
  // cancels. The mouse wheel over the box (or the spin arrows, or ↑ / ↓) steps the value and the sketch follows live
  // (Ctrl: ×10, Alt: ÷10 per step); ↻ previews a typed value. Only the final value makes an undo step.
  var dimSpin = document.createElement('span'), dimBtns = document.createElement('span');
  dimSpin.className = 'dm-spin';
  dimBtns.className = 'dm-btns';
  function dmButton(parent, cls, title, html, fn) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.title = title; b.innerHTML = html; b.tabIndex = -1;
    b.addEventListener('mousedown', function (ev) { ev.preventDefault(); ev.stopPropagation(); });   // the value keeps the focus
    b.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); fn(ev); });
    parent.appendChild(b);
    return b;
  }
  dmButton(dimSpin, 'dm-up', 'Increase (wheel up)', '&#9650;', function (ev) { spinDim(1, ev); });
  dmButton(dimSpin, 'dm-down', 'Decrease (wheel down)', '&#9660;', function (ev) { spinDim(-1, ev); });
  dmButton(dimBtns, 'dm-ok', 'OK (Enter)', '&#10003;', function () { closeDimEdit(true, true); });
  dmButton(dimBtns, 'dm-cancel', 'Cancel (Esc)', '&#10007;', function () { closeDimEdit(false); });
  dmButton(dimBtns, 'dm-rebuild', 'Rebuild: preview the typed value', '&#8635;', function () { var r = parseDimInput(dimInput.value); if (r.error != null) dimEditError(r.error); else previewDim(r.value); });
  dimEdit.appendChild(dimSpin);
  dimEdit.appendChild(dimBtns);
  function openDimEdit(it) {
    var f = UI.activeSketchFeature();
    if (!f) return;
    if (dimEditing) closeDimEdit(true);
    var value = it.rel != null ? f.rels[it.rel].v : K.dimValue(f.entities[it.d.e], it.d);
    dimEditing = { d: it.d, auto: !!it.auto, index: it.index, rel: it.rel, sketchId: f.id, value: value, angle: it.rel != null && f.rels[it.rel].type === 'angle' };
    dimEdit.hidden = false;
    dimInput.value = String(Math.round(dimEditing.value * 1e4) / 1e4);
    positionDimEdit();
    dimInput.focus(); dimInput.select();
  }
  function positionDimEdit(list) {
    if (!dimEditing) return;
    var it = null;
    (list || []).forEach(function (x) { if (x.d === dimEditing.d) it = x; });
    var f = UI.activeSketchFeature(), e = f && dimEditing.rel == null && f.entities[dimEditing.d.e];
    var sc = it && it.text ? { text: it.text } : dimEditing.rel != null ? (UI.relDimScreen ? UI.relDimScreen(f, dimEditing.rel) : null) : (e && dimScreen(UI.activePlane(), e, dimEditing.d));
    if (!sc) { closeDimEdit(false); return; }
    // just below the value, kept inside the viewport (the dimension itself stays visible)
    var w = dimEdit.offsetWidth || 170, h = dimEdit.offsetHeight || 28;
    var x = Math.max(4, Math.min(UI.size.w - w - 4, sc.text.x - 24)), y = sc.text.y + 8;
    if (y + h > UI.size.h - 4) y = sc.text.y - 18 - h;
    dimEdit.style.left = Math.round(x) + 'px';
    dimEdit.style.top = Math.round(Math.max(4, y)) + 'px';
  }
  // The spin step: 1 mm (0.1 in, 1°), ×10 with Ctrl, ÷10 with Alt.
  function spinStep(ev) {
    var base = dimEditing && dimEditing.angle ? 1 : /in/.test(UI.unitLabel ? UI.unitLabel() : '') ? 0.1 : 1;
    return base * (ev && ev.ctrlKey ? 10 : ev && ev.altKey ? 0.1 : 1);
  }
  function spinDim(sgn, ev) {
    if (!dimEditing) return;
    var r = parseDimInput(dimInput.value), cur = r.error != null ? (dimEditing.preview != null ? dimEditing.preview : dimEditing.value) : r.value;
    var step = spinStep(ev), v = +(cur + sgn * step).toPrecision(12);
    if (!(v > 0)) v = +(cur / 2).toPrecision(6);
    if (dimEditing.angle && v > 180) v = 180;
    dimInput.value = String(v);
    dimEditError('');
    previewDim(v);
    dimInput.focus();
  }
  // Live preview of value v: the sketch is solved from the state it had when the box opened (kept in ed.snap) and
  // redrawn, at most once per frame. restoreDimPreview puts that state back.
  var previewFrame = 0;
  function previewDim(v) {
    var ed = dimEditing;
    if (!ed) return;
    ed.preview = v;
    if (!previewFrame) previewFrame = requestAnimationFrame(runPreview);
  }
  function runPreview() {
    previewFrame = 0;
    var ed = dimEditing, f = UI.activeSketchFeature();
    if (!ed || ed.preview == null || !f || f.id !== ed.sketchId || !window.SketchSolver) return;
    var t0 = performance.now();
    if (!ed.snap) ed.snap = { entities: JSON.parse(JSON.stringify(f.entities)), relV: ed.rel != null ? f.rels[ed.rel].v : null };
    else restoreDimPreview(true);
    var res = ed.rel != null ? SketchSolver.setRelValue(f, ed.rel, ed.preview) : SketchSolver.setDim(f, ed.auto ? ed.d : ed.index, ed.preview);
    if (!res.ok) dimEditError(res.error);
    App.gridStale = true;
    UI.updateSketches();
    UI.lastDimPreviewMs = performance.now() - t0;
  }
  function restoreDimPreview(keep) {
    var ed = dimEditing, f = UI.activeSketchFeature();
    if (previewFrame && !keep) { cancelAnimationFrame(previewFrame); previewFrame = 0; }
    if (!ed || !ed.snap || !f || f.id !== ed.sketchId) return false;
    f.entities = JSON.parse(JSON.stringify(ed.snap.entities));
    if (ed.rel != null && f.rels && f.rels[ed.rel]) f.rels[ed.rel].v = ed.snap.relV;
    if (window.SketchSolver && SketchSolver.updateDriven) SketchSolver.updateDriven(f);
    if (!keep) { ed.snap = null; ed.preview = null; App.gridStale = true; UI.updateSketches(); }
    return true;
  }
  // Show (msg) or clear (no msg) an error on the Modify box: red outline, tooltip, and the status bar.
  function dimEditError(msg) {
    dimEdit.setAttribute('data-error', msg || '');
    dimInput.style.outline = msg ? '2px solid #d33' : '';
    dimInput.title = msg || '';
    dimInput.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg) UI.setStatus('Dimension not changed: ' + msg);
  }
  // Value typed in the Modify box: a number, plain arithmetic ("25.4*2") or an equation ("=T*3"). The sketch stores
  // the resulting number, never the expression.
  function parseDimInput(text) {
    if (UI.evalInput) return UI.evalInput(text);
    var v = parseFloat(text);
    return isNaN(v) ? { error: 'Not a number: ' + text } : { value: v };
  }
  // commit: apply the typed value. keepOnError: an invalid entry leaves the box open with the message (Enter);
  // otherwise (blur) the box closes without applying and the message stays in the status bar.
  function closeDimEdit(commit, keepOnError) {
    var ed = dimEditing;
    if (!ed) return;
    var r = null;
    if (commit) {
      r = parseDimInput(dimInput.value);
      if (r.error != null && keepOnError) { dimEditError(r.error); dimInput.focus(); dimInput.select(); return; }
    }
    // a live preview is undone first: the undo step and the solve start from the sketch as it was
    if (previewFrame) { cancelAnimationFrame(previewFrame); previewFrame = 0; }
    var previewed = restoreDimPreview(true);
    dimEditing = null;
    dimEdit.hidden = true;
    if (r && r.error != null) UI.setStatus('Dimension not changed: ' + r.error);
    dimEditError('');
    var f = UI.activeSketchFeature(), e = f && f.id === ed.sketchId && (ed.rel != null ? f.rels && f.rels[ed.rel] : f.entities[ed.d.e]);
    var v = r && r.value;
    if (!commit || !r || r.error != null || !e || Math.abs(v - ed.value) < 1e-9) {
      if (previewed) { App.gridStale = true; UI.updateSketches(); }
      return;
    }
    if (previewed) App.gridStale = true;
    try {
      if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; }
      if (window.SketchSolver) {
        // a driving dimension: the whole sketch is re-solved with the new value (relations and other dimensions hold)
        var res = ed.rel != null ? SketchSolver.setRelValue(f, ed.rel, v) : SketchSolver.setDim(f, ed.auto ? ed.d : ed.index, v);
        if (!res.ok) throw new Error(res.error);
      } else K.setDimValue(e, ed.d, v);
      App.gridStale = true;
      UI.updateSketches(); UI.refreshTree();
      UI.setStatus('Dimension set to ' + fmtDim(v) + ' ' + UI.unitLabel() + '.');
    } catch (err) { lastDimError = err.message; UI.toast(err.message); UI.setStatus('Dimension not changed: ' + err.message); App.dimsStale = true; if (previewed) UI.updateSketches(); }
  }
  dimInput.addEventListener('keydown', function (ev) {
    ev.stopPropagation();
    if (ev.key === 'Enter') { ev.preventDefault(); closeDimEdit(true, true); }
    else if (ev.key === 'Escape') { ev.preventDefault(); closeDimEdit(false); }
    else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') { ev.preventDefault(); spinDim(ev.key === 'ArrowUp' ? 1 : -1, ev); }
  });
  dimInput.addEventListener('input', function () { if (dimEdit.getAttribute('data-error')) dimEditError(''); });
  dimInput.addEventListener('blur', function () { closeDimEdit(true); });
  dimEdit.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
  // the wheel over the box spins the value (never zooms the view)
  dimEdit.addEventListener('wheel', function (ev) {
    ev.preventDefault(); ev.stopPropagation();
    if (!dimEditing || !ev.deltaY) return;
    spinDim(ev.deltaY < 0 ? 1 : -1, ev);
  }, { passive: false });
  // script / test hooks: the value shown, a wheel step (sign +1 / -1, modifiers { ctrlKey, altKey }), and the sketch's
  // state during a preview
  UI.dimEditValue = function () { return dimEditing ? dimInput.value : null; };
  UI.spinDimEdit = function (sgn, mods) { spinDim(sgn, mods || {}); if (previewFrame) { cancelAnimationFrame(previewFrame); runPreview(); } return dimEditing ? +dimInput.value : null; };

  function deleteDim(index) {
    var f = UI.activeSketchFeature();
    if (!f || !f.dims || !f.dims[index]) return;
    if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; }
    f.dims.splice(index, 1);
    App.sel = null;
    App.dimsStale = true;
    UI.setStatus('Dimension deleted.');
  }

  // ---- the Smart Dimension tool: click an entity, then click where the dimension should sit
  function dimToolClick(raw, mx, my) {
    var f = UI.activeSketchFeature(), st = App.toolState;
    if (!f) return;
    if (st.relDim) {
      // third click of a two-entity dimension: place it, then type its value
      var rd = st.relDim;
      st.relDim = null; st.dim = null; App.tempRelDim = null;
      $('sketch-hint').innerHTML = TOOL_HINTS.dimension;
      if (UI.placeRelDim) UI.placeRelDim(f, rd, raw);
      return;
    }
    if (st.dim) {
      // a second entity or point clicked: distance / angle between the two, as SolidWorks' Smart Dimension does
      var ref2 = UI.pickSketchRef ? UI.pickSketchRef(mx, my) : null;
      var two = ref2 && st.ref1 && UI.relDimFor ? UI.relDimFor(f, st.ref1, ref2) : null;
      if (two) {
        st.relDim = two; st.dim = null; App.tempDim = null;
        App.tempRelDim = Object.assign({}, two, UI.relDimPlacement(f, two, raw));
        App.dimsStale = true;
        $('sketch-hint').innerHTML = 'Click where the ' + (two.type === 'angle' ? 'angle' : 'distance') + ' dimension should sit.';
        return;
      }
      $('sketch-hint').innerHTML = TOOL_HINTS.dimension;
      var d = st.dim, e = f.entities[d.e];
      st.dim = null; App.tempDim = null;
      if (!e) return;
      var placed = dimPlacement(e, d, raw);
      Object.keys(placed).forEach(function (k) { d[k] = placed[k]; });
      if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; }
      (f.dims = f.dims || []).push(d);
      App.sel = { kind: 'dim', index: f.dims.length - 1 };
      // over-defining: ask whether to make it driven (ui-relations.js) instead of opening the Modify box
      if (UI.askDrivenIfOver && UI.askDrivenIfOver(f, 'dim', f.dims.length - 1)) { UI.updateSketches(); return; }
      App.dimsStale = false;
      var list = drawDims();
      var it = null;
      list.forEach(function (x) { if (x.d === d) it = x; });
      if (it) openDimEdit(it);
      UI.setStatus('Dimension placed. Type a value and press Enter to drive the entity; Delete removes it.');
      return;
    }
    var hit = UI.pickEntity(mx, my);
    if (!hit) return;
    var t = K.dimForEntity(f.entities[hit.index], raw);
    if (!t) { UI.toast('That entity has no dimension to place.'); return; }
    t.e = hit.index;
    st.dim = t;
    st.ref1 = UI.pickSketchRef ? UI.pickSketchRef(mx, my) : null;
    var pv = dimPlacement(f.entities[hit.index], t, raw);
    App.tempDim = Object.assign({}, t, pv);
    App.dimsStale = true;
    $('sketch-hint').innerHTML = 'Click where the dimension should sit, or click a second entity for the distance / angle between them.' + (f.entities[hit.index].t === 'line' ? ' Move above/below or beside a slanted line for its horizontal or vertical distance.' : '');
  }
  function dimToolMove(raw) {
    var f = UI.activeSketchFeature(), st = App.toolState;
    if (f && st.relDim) { App.tempRelDim = Object.assign({}, st.relDim, UI.relDimPlacement(f, st.relDim, raw)); App.dimsStale = true; return; }
    if (!f || !st.dim) return;
    var e = f.entities[st.dim.e];
    if (!e) return;
    if (e.t === 'line') { var t = K.dimForEntity(e, raw); if (t) st.dim.k = t.k; }
    App.tempDim = Object.assign({}, st.dim, dimPlacement(e, st.dim, raw));
    App.dimsStale = true;
  }

  UI.drawDims = drawDims;
  UI.autoDims = autoDims;
  UI.deleteDim = deleteDim;
  UI.dimToolClick = dimToolClick;
  // Script/test hooks for the Modify box. openDimEdit(i) opens it on placed dimension i of the active sketch;
  // editDim(i, text) opens it, types text and presses Enter: {ok:true, value} when applied, {ok:false, error} when the
  // entry was rejected (the box then stays open, as for a user; cancelDimEdit() closes it).
  UI.openDimEdit = function (index) {
    var f = UI.activeSketchFeature();
    if (!f || !f.dims || !f.dims[index]) return false;
    openDimEdit({ d: f.dims[index], index: index });
    return true;
  };
  UI.editDim = function (index, text) {
    if (!UI.openDimEdit(index)) return { ok: false, error: 'No dimension ' + index + ' in the active sketch' };
    dimInput.value = String(text);
    var d = dimEditing.d;
    lastDimError = null;
    closeDimEdit(true, true);
    if (dimEditing) return { ok: false, error: dimEdit.getAttribute('data-error') || 'rejected' };
    if (lastDimError) return { ok: false, error: lastDimError };
    var f = UI.activeSketchFeature(), e = f && f.entities[d.e];
    return { ok: true, value: e ? K.dimValue(e, d) : null };
  };
  // the same for a distance / angle dimension (sketch relation `index` with a value)
  UI.editRelDim = function (index, text) {
    var f = UI.activeSketchFeature(), rel = f && f.rels && f.rels[index];
    if (!rel || rel.v == null) return { ok: false, error: 'No dimension relation ' + index + ' in the active sketch' };
    openDimEdit({ d: rel, rel: index });
    if (!dimEditing) return { ok: false, error: 'could not open the Modify box' };
    dimInput.value = String(text);
    lastDimError = null;
    closeDimEdit(true, true);
    if (dimEditing) return { ok: false, error: dimEdit.getAttribute('data-error') || 'rejected' };
    if (lastDimError) return { ok: false, error: lastDimError };
    return { ok: true, value: f.rels[index].v };
  };
  UI.openRelDimEdit = function (index) { var f = UI.activeSketchFeature(), rel = f && f.rels && f.rels[index]; if (!rel || rel.v == null) return false; openDimEdit({ d: rel, rel: index }); return true; };
  UI.cancelDimEdit = function () { closeDimEdit(false); dimEditError(''); };
  UI.isDimEditOpen = function () { return !!dimEditing; };

  // ------------------------------------------------------------------ mouse handling
  var drag = null, downPos = null, zoomBox = null;
  function pos(ev) { var r = viewport.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }

  viewport.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });

  // Click-drag sketching, as in SolidWorks: with a drawing tool, pressing and dragging draws (the press is the first
  // point, the release the next one) instead of rotating the view; a dragged single line does not start a chain.
  function sketchDrawHook(p) {
    if (App.mode !== 'sketch' || App.tool === 'select' || App.tool === 'dimension' || (App.command && (App.command.onSketchPoint || App.command.onPick))) return null;
    var fresh = !App.toolState.pts.length;
    return {
      start: function () { if (fresh && App.tool !== 'point') sketchClick(p[0], p[1]); },
      move: function (q) { sketchMove(q[0], q[1]); },
      end: function (q) {
        if (q[0] < 0 || q[1] < 0 || q[0] > UI.size.w || q[1] > UI.size.h) return;
        sketchClick(q[0], q[1]);
        if (fresh && App.tool === 'line' && App.toolState.pts.length === 1) cancelTool(true);
      }
    };
  }

  viewport.addEventListener('mousedown', function (ev) {
    if (ev.target.closest && ev.target.closest('#hud, #exit-sketch, #sketch-hint, #dim-layer, #dim-edit, #sk-num')) return;
    UI.closeMenus();
    var p = pos(ev);
    downPos = p;
    // r4/asm4: Alt + drag on a floating component is SmartMates (ui-assembly.js); elsewhere Alt + drag rotates the view
    var smart = ev.button === 0 && ev.altKey && !App.zoomAreaMode && UI.smartMateHook ? UI.smartMateHook(p, ev) : null;
    if (smart) { drag = { kind: 'maybe-hook', hook: smart, last: p, moved: false }; ev.preventDefault(); return; }
    if (ev.button === 1 || (ev.button === 0 && (ev.altKey)) || (ev.button === 0 && App.zoomAreaMode)) {
      if (App.zoomAreaMode && ev.button === 0) { zoomBox = { start: p }; $('zoom-box').hidden = false; return; }
      // SolidWorks: middle drag rotates, Ctrl + middle pans, Shift + middle zooms (about the press point)
      drag = { kind: ev.ctrlKey ? 'pan' : ev.shiftKey ? 'zoom' : 'rotate', last: p };
      ev.preventDefault();
      return;
    }
    // r5/asm5: in an assembly a right-mouse drag on a floating component rotates it (SolidWorks); elsewhere it pans
    var rot = ev.button === 2 && App.mode !== 'sketch' && !App.zoomAreaMode && UI.componentDragHook ? UI.componentDragHook(p, ev, 'rotate') : null;
    if (rot) { drag = { kind: 'maybe-hook', hook: rot, last: p, moved: false }; ev.preventDefault(); return; }
    if (ev.button === 2) { drag = { kind: 'pan', last: p, moved: false }; return; }
    // assemblies: pressing on a floating component drags it (Move / Rotate Component) instead of rotating the view
    var hook = ev.button !== 0 ? null : (App.mode === 'sketch' && UI.sketchDragHook ? UI.sketchDragHook(p, ev) : null) || sketchDrawHook(p) || (UI.componentDragHook ? UI.componentDragHook(p, ev) : null);
    // a press on empty space starts a box selection (ui-select.js); on the model it still rotates the view
    if (!hook && ev.button === 0 && UI.boxSelectHook) hook = UI.boxSelectHook(p, ev);
    if (hook) { drag = { kind: 'maybe-hook', hook: hook, last: p, moved: false }; ev.preventDefault(); return; }
    if (ev.button === 0) drag = { kind: 'maybe-rotate', last: p, moved: false };
  });

  window.addEventListener('mousemove', function (ev) {
    var p = pos(ev);
    if (zoomBox) {
      var zb = $('zoom-box'), x = Math.min(zoomBox.start[0], p[0]), y = Math.min(zoomBox.start[1], p[1]);
      zb.style.left = x + 'px'; zb.style.top = y + 'px'; zb.style.width = Math.abs(p[0] - zoomBox.start[0]) + 'px'; zb.style.height = Math.abs(p[1] - zoomBox.start[1]) + 'px';
      zoomBox.end = p;
      return;
    }
    if (drag) {
      if (fbLayer && fbLayer.firstChild && drag.kind !== 'maybe-rotate' && drag.kind !== 'maybe-hook') clearFeedback();
      var dx = p[0] - drag.last[0], dy = p[1] - drag.last[1];
      if (drag.kind === 'maybe-rotate') {
        if (Math.hypot(p[0] - downPos[0], p[1] - downPos[1]) > 4) { drag.kind = 'rotate'; drag.moved = true; viewport.classList.add('tool-grab'); }
        else return;
      }
      if (drag.kind === 'maybe-hook') {
        if (Math.hypot(p[0] - downPos[0], p[1] - downPos[1]) > 4) { drag.kind = 'hook'; drag.moved = true; viewport.classList.add('tool-grab'); drag.hook.start(); }
        else return;
      }
      if (drag.kind === 'hook') { drag.hook.move(p); drag.last = p; return; }
      if (drag.kind === 'rotate') UI.rotateView(dx, dy);
      else if (drag.kind === 'zoom') UI.zoomView(Math.exp(dy * 0.006), downPos[0], downPos[1]);   // drag up zooms in
      else if (drag.kind === 'pan') { UI.panView(dx, dy); drag.moved = drag.moved || Math.abs(dx) + Math.abs(dy) > 0; }
      drag.last = p;
      return;
    }
    if (p[0] < 0 || p[1] < 0 || p[0] > UI.size.w || p[1] > UI.size.h) return;
    if (App.mode === 'sketch') { sketchMove(p[0], p[1]); return; }
    // hover
    var hover = null;
    if (UI.pickHover) hover = UI.pickHover(p[0], p[1]);   // Selection Filter aware (ui-select.js)
    else if (App.command && App.command.pickPlane) hover = UI.pickFace(p[0], p[1]) || UI.pickPlane(p[0], p[1]);
    else if (App.command && App.command.pickEdges) hover = UI.pickEdge(p[0], p[1]);
    else hover = UI.pickEdge(p[0], p[1]) || UI.pickFace(p[0], p[1]) || ((App.view.showPlanes) ? UI.pickPlane(p[0], p[1]) : null);
    var changed = JSON.stringify(hover && { k: hover.kind, i: hover.index, r: hover.ref }) !== JSON.stringify(App.hover && { k: App.hover.kind, i: App.hover.index, r: App.hover.ref });
    App.hover = hover;
    if (changed) UI.updateHighlights();
    if (hover && hover.kind === 'face' && App.mesh.faces[hover.index]) {
      var f = App.mesh.faces[hover.index];
      var txt = 'Face ' + hover.index + '  area ' + UI.fmtNum(f.area, 1) + ' ' + UI.unitLabel() + '²';
      // multi-body parts: say which body the face belongs to (Body: Boss-Extrude2)
      // assemblies: say which component (Component: Pin<1>)
      if (UI.isAssembly && UI.isAssembly()) txt += '  Component: ' + UI.bodyName(f.body || 0);
      else if (UI.bodyCount && UI.bodyCount() > 1) txt += '  Body: ' + UI.bodyName(f.body || 0);
      $('status-coords').textContent = txt;
    } else if (hover && hover.kind === 'edge') $('status-coords').textContent = 'Edge  length ' + UI.fmtNum(hover.edge.len, 2) + ' ' + UI.unitLabel() + (hover.edge.convex ? '' : '  (concave)');
    else if (hover && hover.kind === 'plane') $('status-coords').textContent = hover.name;
    else if (hover && hover.kind === 'vertex') $('status-coords').textContent = 'Vertex  ' + hover.point.map(function (x) { return UI.fmtNum(x, 2); }).join(', ') + ' ' + UI.unitLabel();
    else if (hover && hover.kind === 'body') $('status-coords').textContent = (UI.isAssembly && UI.isAssembly() ? 'Component: ' : 'Body: ') + UI.bodyName(hover.index);
    else $('status-coords').textContent = '';
  });

  window.addEventListener('mouseup', function (ev) {
    var p = pos(ev);
    if (zoomBox) {
      $('zoom-box').hidden = true;
      if (zoomBox.end && Math.abs(zoomBox.end[0] - zoomBox.start[0]) > 8) {
        var cx = (zoomBox.start[0] + zoomBox.end[0]) / 2, cy = (zoomBox.start[1] + zoomBox.end[1]) / 2;
        var fw = Math.abs(zoomBox.end[0] - zoomBox.start[0]) / UI.size.w, fh = Math.abs(zoomBox.end[1] - zoomBox.start[1]) / UI.size.h;
        if (UI.zoomToArea) UI.zoomToArea(cx, cy, Math.max(fw, fh));
        else { UI.pushViewHistory(); UI.panView(UI.size.w / 2 - cx, UI.size.h / 2 - cy); UI.zoomView(Math.max(fw, fh)); }
      }
      zoomBox = null; App.zoomAreaMode = false; UI.refreshHud();
      return;
    }
    if (!drag) return;
    var d = drag; drag = null;
    viewport.classList.remove('tool-grab');
    if (d.kind === 'hook') { d.hook.end(p); return; }
    if (d.kind === 'rotate' || d.kind === 'zoom' || (d.kind === 'pan' && d.moved)) return;
    if (ev.button === 2) { if (App.mode === 'sketch') { finishChain(); } return; }
    if (ev.button !== 0) return;
    if (p[0] < 0 || p[1] < 0 || p[0] > UI.size.w || p[1] > UI.size.h) return;
    if (ev.target.closest && ev.target.closest('#hud, #exit-sketch, #sketch-hint, #dim-layer, #dim-edit, #sk-num')) return;
    if (App.mode === 'sketch') { sketchClick(p[0], p[1], ev); return; }
    partClick(p[0], p[1], ev);
  });

  viewport.addEventListener('dblclick', function (ev) {
    if (App.mode === 'sketch') { finishChain(); return; }
    var p = pos(ev), hit = UI.pickFace(p[0], p[1]);
    if (hit) {
      // double-clicking a face opens its owning feature for editing
      var id = App.triShared[App.mesh.faces[hit.index].start];
      var f = K.findFeature(App.model, id);
      if (f) UI.editFeature(f);
    }
  });

  // Double-click or right-click: as in SolidWorks, a chain (or a half-drawn entity) ends and the tool stays active
  // for the next one; with nothing in progress the tool is put down.
  function finishChain() {
    if (App.tool === 'select') return;
    var st = App.toolState || {};
    if ((st.pts && st.pts.length) || st.dim || st.relDim) {
      cancelTool(true);
      UI.setStatus('Chain ended. Click to start a new ' + (App.tool === 'line' ? 'line' : 'entity') + ', or press Esc to put the tool down.');
    } else cancelTool();
  }

  viewport.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    var p = pos(ev);
    if (UI.wheelZoom) UI.wheelZoom(ev, p[0], p[1]);   // eased, in proportion to the wheel / trackpad delta (ui-core.js)
    else UI.zoomView(ev.deltaY > 0 ? 1.12 : 1 / 1.12, p[0], p[1]);
    if (App.mode === 'sketch') clearFeedback();   // screen-space cursor feedback is redrawn on the next move
  }, { passive: false });

  function partClick(mx, my, ev) {
    if (UI.selectClick) { UI.selectClick(mx, my, ev); return; }   // Selection Filter, Ctrl / Shift toggle (ui-select.js)
    if (App.command && App.command.onPick) {
      var pk = (App.command.pickEdges ? UI.pickEdge(mx, my) : null) || UI.pickFace(mx, my) || (App.command.pickPlane ? UI.pickPlane(mx, my) : null);
      if (pk && App.command.onPick(pk) !== false) return;
    }
    var hit = UI.pickEdge(mx, my) || UI.pickFace(mx, my) || (App.view.showPlanes ? UI.pickPlane(mx, my) : null);
    if (ev.ctrlKey && hit && App.sel && hit.kind === 'face') App.sel2 = hit;
    else { App.sel = hit; App.sel2 = null; }
    UI.updateHighlights();
    UI.refreshTree();
    if (UI.onSelectionChanged) UI.onSelectionChanged();
  }

  // ------------------------------------------------------------------ touch: one finger rotates, two pan/zoom
  var touches = null;
  viewport.addEventListener('touchstart', function (ev) {
    if (ev.touches.length === 1) touches = { kind: 'rotate', last: [ev.touches[0].clientX, ev.touches[0].clientY] };
    else if (ev.touches.length === 2) touches = { kind: 'pinch', last: tpair(ev) };
  }, { passive: true });
  viewport.addEventListener('touchmove', function (ev) {
    if (!touches) return;
    ev.preventDefault();
    if (touches.kind === 'rotate' && ev.touches.length === 1) {
      var x = ev.touches[0].clientX, y = ev.touches[0].clientY;
      UI.rotateView(x - touches.last[0], y - touches.last[1]);
      touches.last = [x, y];
    } else if (ev.touches.length === 2) {
      var cur = tpair(ev);
      UI.panView(cur.cx - touches.last.cx, cur.cy - touches.last.cy);
      if (touches.last.d > 0) UI.zoomView(touches.last.d / cur.d);
      touches.last = cur;
    }
  }, { passive: false });
  viewport.addEventListener('touchend', function () { touches = null; }, { passive: true });
  function tpair(ev) {
    var a = ev.touches[0], b = ev.touches[1];
    return { cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2, d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
  }

  // ------------------------------------------------------------------ undo inside a sketch
  // Every sketch edit calls `if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; }`. The flag means "this
  // user action already has its undo point": it is cleared at the start of every mouse press and every key press that
  // is not typing into a field, so each line segment, dimension, relation, drag, trim or delete is its own Ctrl+Z step
  // (as in SolidWorks), while one action that edits several things (a box-selection Delete, a drag) stays one step.
  document.addEventListener('mousedown', function () { if (App.mode === 'sketch') App.sketchDirty = false; }, true);
  document.addEventListener('keydown', function (ev) {
    if (App.mode !== 'sketch') return;
    var tag = (ev.target && ev.target.tagName || '').toLowerCase();
    if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') App.sketchDirty = false;
  }, true);
  // Undo / redo in a sketch drop the half-drawn entity (its points may belong to geometry that is going away) but keep
  // the tool, and leave the sketch open.
  ['undo', 'redo'].forEach(function (name) {
    var base = UI[name];
    if (!base) return;
    UI[name] = function () {
      if (App.mode === 'sketch') { cancelTool(true); App.sketchDirty = false; if (dimEditing) closeDimEdit(false); }
      return base.apply(this, arguments);
    };
  });

  UI.enterSketch = enterSketch;
  UI.exitSketch = exitSketch;
  UI.cancelSketch = cancelSketch;
  UI.setTool = setTool;
  UI.cancelTool = cancelTool;
  UI.addEntity = addEntity;
})(UI);
