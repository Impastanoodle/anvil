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
    line: 'Click the start point, then each next point, or press and drag for one line. <b>Esc</b> or right-click ends the chain.',
    rect: 'Click the first corner, then the opposite corner.',
    crect: 'Click the center, then a corner.',
    circle: 'Click the center, then a point on the circle.',
    arc: 'Click the center, the start point, then the end point (counter-clockwise).',
    polygon: 'Click the center, then a vertex. Set the number of sides in the PropertyManager.',
    slot: 'Click the two slot centers, then a point to set the width.',
    point: 'Click to place a point.',
    dimension: 'Click a line, circle, arc, rectangle, slot or polygon, then click where the dimension should sit. Click any value to change it; <b>Delete</b> removes a selected dimension.'
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
    App.toolState = { pts: [] };
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
    // 2. on a line / circle / arc (the solver infers a point-on-curve Coincident there)
    var onCurve = curveSnap(f, pl, [mx, my], INFER_PX.curve);
    if (onCurve) { out.p = onCurve; out.snap = { kind: 'on', pt: onCurve }; return out; }
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

  function toolEntities(pts, cur) {
    var t = App.tool, all = pts.concat(cur ? [cur] : []);
    if (all.length < 2 && t !== 'point') return [];
    var a = all[0], b = all[1], c = all[2];
    switch (t) {
      case 'line': return [{ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }];
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
        while (a1 <= a0) a1 += 360;
        return [{ t: 'arc', cx: a[0], cy: a[1], r: r, a0: a0, a1: a1 }];
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
    switch (App.tool) { case 'arc': case 'slot': return 3; case 'point': return 1; default: return 2; }
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
    var p = snap(raw, mx, my);
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
    st.pts.push(p);
    if (st.pts.length >= stepsNeeded()) {
      var ents = toolEntities(st.pts);
      ents.forEach(addEntity);
      if (App.tool === 'line') {
        var last = st.pts[st.pts.length - 1];
        st.chainStart = st.chainStart || st.pts[0];
        st.pts = [last];
        // remember the chain start so closing the loop ends the tool
        st.pts.chainStart = st.chainStart;
      } else {
        st.pts = [];
      }
      App.tempEntities = [];
      UI.updateTemp();
    }
  }

  function sketchMove(mx, my) {
    var pl = UI.activePlane(), raw = UI.screenToPlane(mx, my, pl);
    if (!raw) return;
    var drawing = App.tool !== 'select' && App.tool !== 'dimension' && !(App.command && App.command.onSketchPoint);
    var info = drawing ? inferPoint(raw, mx, my) : null, p = info ? info.p : raw;
    var readout = drawing && App.toolState.pts.length ? toolReadout(App.toolState.pts, p) : '';
    $('status-coords').textContent = 'X: ' + UI.fmtNum(p[0], 2).padStart(9) + '   Y: ' + UI.fmtNum(p[1], 2).padStart(9) + '  ' + UI.unitLabel() + (readout ? '   ' + readout : '');
    if (!drawing) {
      // pre-highlight what a click would pick (select, Smart Dimension, Add Relations, Trim …), as SolidWorks does
      var ref = UI.pickSketchRef && !App.zoomAreaMode ? UI.pickSketchRef(mx, my) : null;
      drawHover(pl, ref === 'O' ? null : ref);
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
  UI.sketchSnapMark = function (uv, q, onCurve) {
    var layer = feedbackLayer();
    clearFeedback();
    if (!uv) return;
    var s = UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1]));
    svg('circle', { cx: s[0], cy: s[1], r: onCurve ? 3 : 5, style: 'fill:' + (onCurve ? '#e8891c' : 'none') + ';stroke:#e8891c;stroke-width:1.5' }, layer);
    glyph(layer, q[0] + 14, q[1] + 12, 'coincident');
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
      case 'line': { var q = pts[pts.length - 1]; dx = p[0] - q[0]; dy = p[1] - q[1]; return 'L ' + n(Math.hypot(dx, dy), 2) + '   A ' + ang(dx, dy); }
      case 'rect': return n(Math.abs(dx), 2) + ' × ' + n(Math.abs(dy), 2);
      case 'crect': return n(Math.abs(dx) * 2, 2) + ' × ' + n(Math.abs(dy) * 2, 2);
      case 'circle': return 'R ' + n(L, 2);
      case 'polygon': return 'R ' + n(L, 2) + '   A ' + ang(dx, dy);
      case 'arc': {
        if (pts.length < 2) return 'R ' + n(L, 2);
        var b = pts[1], a0 = Math.atan2(b[1] - a[1], b[0] - a[0]), a1 = Math.atan2(dy, dx), sw = (a1 - a0) * 180 / Math.PI;
        while (sw <= 0) sw += 360;
        return 'R ' + n(Math.hypot(b[0] - a[0], b[1] - a[1]), 2) + '   A ' + n(sw, 1) + '°';
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
    if (info.snap) svg('circle', { cx: sp[0], cy: sp[1], r: info.snap.kind === 'on' ? 3 : 5, style: 'fill:' + (info.snap.kind === 'on' ? '#e8891c' : 'none') + ';stroke:#e8891c;stroke-width:1.5' }, layer);
    // relation glyphs by the cursor: what the click will infer
    var types = [];
    if (info.snap && SNAP_GLYPH[info.snap.kind]) types.push(SNAP_GLYPH[info.snap.kind]);
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

  // Placement of a dimension from the cursor position (sketch coordinates): { off } for linear, { ang, off } for radial.
  function dimPlacement(e, d, uv) {
    var g = K.dimGeometry(e, d);
    if (!g) return {};
    if (g.type === 'linear') {
      var n = [-g.dir[1], g.dir[0]];
      return { off: Math.round(((uv[0] - g.P[0]) * n[0] + (uv[1] - g.P[1]) * n[1]) * 1e4) / 1e4 };
    }
    var dx = uv[0] - g.C[0], dy = uv[1] - g.C[1];
    return { ang: Math.round(Math.atan2(dy, dx) * 1800 / Math.PI) / 10, off: Math.round(Math.hypot(dx, dy) * 1e4) / 1e4 };
  }

  // Screen-space drawing data for one dimension: lines, arrow heads, and the label with its anchor point.
  function dimScreen(pl, e, d) {
    var g = K.dimGeometry(e, d);
    if (!g) return null;
    var s = UI.cam.scale; // sketch units per pixel (orthographic camera)
    function S(uv) { return UI.worldToScreen(K.to3D(pl, uv[0], uv[1])); }
    function unit(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; }
    var out = { lines: [], arrows: [], value: g.value, label: g.prefix + fmtDim(g.value) };
    if (g.type === 'linear') {
      var n = [-g.dir[1], g.dir[0]];
      var off = d.off != null ? d.off : 16 * s;
      if (Math.abs(off) < 6 * s) off = (off < 0 ? -6 : 6) * s;
      var sg = off < 0 ? -1 : 1, ext = (Math.abs(off) + 3 * s) * sg, gap = 2 * s * sg;
      var A = [g.P[0] + n[0] * off, g.P[1] + n[1] * off], B = [A[0] + g.dir[0] * g.value, A[1] + g.dir[1] * g.value];
      var sA = S(A), sB = S(B);
      var e1 = [S([g.P[0] + n[0] * gap, g.P[1] + n[1] * gap]), S([g.P[0] + n[0] * ext, g.P[1] + n[1] * ext])];
      var e2 = [S([g.Q[0] + n[0] * gap, g.Q[1] + n[1] * gap]), S([g.Q[0] + n[0] * ext, g.Q[1] + n[1] * ext])];
      out.lines.push([e1[0], e1[1]], [e2[0], e2[1]], [sA, sB]);
      var u = unit(sB, sA), inside = Math.hypot(sB[0] - sA[0], sB[1] - sA[1]) > 34;
      out.arrows.push({ tip: sA, dir: inside ? u : [-u[0], -u[1]] }, { tip: sB, dir: inside ? [-u[0], -u[1]] : u });
      var nS = unit(S(A), S([A[0] + n[0] * sg * s, A[1] + n[1] * sg * s]));
      out.text = { x: (sA[0] + sB[0]) / 2 + nS[0] * 9, y: (sA[1] + sB[1]) / 2 + nS[1] * 9 + 4, anchor: 'middle' };
    } else {
      var ang = (d.ang != null ? d.ang : 45) * Math.PI / 180, ux = Math.cos(ang), uy = Math.sin(ang);
      var Pc = [g.C[0] + ux * g.r, g.C[1] + uy * g.r];
      var dist = Math.max(d.off != null ? d.off : 0, g.r + 18 * s);
      var T = [g.C[0] + ux * dist, g.C[1] + uy * dist];
      var sPc = S(Pc), sT = S(T), ut = unit(sPc, sT);
      out.lines.push([sPc, sT]);
      out.arrows.push({ tip: sPc, dir: [-ut[0], -ut[1]] });
      out.text = { x: sT[0] + ut[0] * 4, y: sT[1] + ut[1] * 4 + 4, anchor: ut[0] >= -0.2 ? 'start' : 'end' };
    }
    return out;
  }

  function drawOne(sc, it) {
    var isSel = it.rel != null ? App.sel && App.sel.kind === 'rel' && App.sel.index === it.rel : App.sel && App.sel.kind === 'dim' && App.sel.index === it.index;
    var cls = 'dim' + (it.temp ? ' temp' : '') + (it.auto ? ' auto' : '') + (!it.temp && !it.auto && isSel ? ' sel' : '') + (it.state && it.state !== 'ok' ? ' ' + it.state : '');
    var gEl = svg('g', { 'class': cls }, dimLayer);
    sc.lines.forEach(function (l) { svg('line', { x1: l[0][0], y1: l[0][1], x2: l[1][0], y2: l[1][1] }, gEl); });
    sc.arrows.forEach(function (a) {
      var ax = a.dir[0] * 9, ay = a.dir[1] * 9, px = -a.dir[1] * 3, py = a.dir[0] * 3;
      svg('polygon', { points: a.tip[0] + ',' + a.tip[1] + ' ' + (a.tip[0] - ax + px) + ',' + (a.tip[1] - ay + py) + ' ' + (a.tip[0] - ax - px) + ',' + (a.tip[1] - ay - py) }, gEl);
    });
    var t = svg('text', { x: sc.text.x, y: sc.text.y, 'text-anchor': sc.text.anchor }, gEl);
    t.textContent = sc.label;
    if (!it.temp) {
      t.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (it.rel != null) { App.sel = { kind: 'rel', index: it.rel }; UI.closePM(); UI.updateSketches(); }
        else if (!it.auto) { App.sel = { kind: 'dim', index: it.index }; UI.closePM(); UI.updateSketches(); }
        if (it.d.driven && UI.drivenDimClick) { UI.drivenDimClick(it); return; }
        openDimEdit(it);
      });
      t.setAttribute('tabindex', '0');
      t.setAttribute('role', 'button');
      t.setAttribute('aria-label', 'Dimension ' + sc.label + ', click to change');
    }
    it.text = sc.text;
  }

  // Redraw every dimension of the active sketch. Called from the render loop whenever App.dimsStale is set.
  function drawDims() {
    for (var c = dimLayer.firstChild; c; ) { var nx = c.nextSibling; if (c !== fbLayer) dimLayer.removeChild(c); c = nx; }
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

  // ---- inline value editing
  function openDimEdit(it) {
    var f = UI.activeSketchFeature();
    if (!f) return;
    var value = it.rel != null ? f.rels[it.rel].v : K.dimValue(f.entities[it.d.e], it.d);
    dimEditing = { d: it.d, auto: !!it.auto, index: it.index, rel: it.rel, sketchId: f.id, value: value };
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
    dimEdit.style.left = sc.text.x + 'px';
    dimEdit.style.top = (sc.text.y - 4) + 'px';
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
    dimEditing = null;
    dimEdit.hidden = true;
    if (r && r.error != null) UI.setStatus('Dimension not changed: ' + r.error);
    dimEditError('');
    if (!commit || !r || r.error != null) return;
    var f = UI.activeSketchFeature(), e = f && f.id === ed.sketchId && (ed.rel != null ? f.rels && f.rels[ed.rel] : f.entities[ed.d.e]);
    if (!e) return;
    var v = r.value;
    if (Math.abs(v - ed.value) < 1e-9) return;
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
    } catch (err) { lastDimError = err.message; UI.toast(err.message); UI.setStatus('Dimension not changed: ' + err.message); App.dimsStale = true; }
  }
  dimInput.addEventListener('keydown', function (ev) {
    ev.stopPropagation();
    if (ev.key === 'Enter') { ev.preventDefault(); closeDimEdit(true, true); }
    else if (ev.key === 'Escape') { ev.preventDefault(); closeDimEdit(false); }
  });
  dimInput.addEventListener('input', function () { if (dimEdit.getAttribute('data-error')) dimEditError(''); });
  dimInput.addEventListener('blur', function () { closeDimEdit(true); });
  dimEdit.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });

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
    if (ev.target.closest && ev.target.closest('#hud, #exit-sketch, #sketch-hint, #dim-layer, #dim-edit')) return;
    UI.closeMenus();
    var p = pos(ev);
    downPos = p;
    if (ev.button === 1 || (ev.button === 0 && (ev.altKey)) || (ev.button === 0 && App.zoomAreaMode)) {
      if (App.zoomAreaMode && ev.button === 0) { zoomBox = { start: p }; $('zoom-box').hidden = false; return; }
      // SolidWorks: middle drag rotates, Ctrl + middle pans, Shift + middle zooms (about the press point)
      drag = { kind: ev.ctrlKey ? 'pan' : ev.shiftKey ? 'zoom' : 'rotate', last: p };
      ev.preventDefault();
      return;
    }
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
    if (ev.target.closest && ev.target.closest('#hud, #exit-sketch, #sketch-hint, #dim-layer, #dim-edit')) return;
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
