// ui-sketch-spline.js — Spline, Ellipse and Partial Ellipse (Sketch tab): the drawing tools (through the
// UI.sketchFreeHooks of ui-sketch.js), their SolidWorks PropertyManagers on the tool (UI.sketchToolPMs) and for a
// selected entity (UI.sketchEntityPMs), the curvature comb (Show curvature) and the command-search entries. The geometry
// lives in the kernel (kernel-sketch.js: Kernel.splineGeom, Kernel.ellipsePoint, profiles; kernel-script.js: DXF); see
// README *Sketch tab ▸ Spline, Ellipse, Text*.
//
//   Spline          click point after point; a double-click, a right-click or Esc ends it (the tool stays on for the
//                   next one; Esc then puts it down); a click on its first point closes it. Entity
//                   { t: 'spline', pts, closed?, tans?, local?, showCurvature? }.
//   Ellipse         centre, the end of the major axis, a point that sets the minor radius (its distance from the
//                   major axis). Entity { t: 'ellipse', cx, cy, rx, ry, rot } (rx the major radius, rot in degrees).
//   Partial Ellipse centre, major axis end, the start point (it also sets the minor radius), then round to the end
//                   point: the arc runs the way the mouse went. { t: 'pellipse', …, a0, a1 } (parameter angles, °).
(function () {
  'use strict';
  if (typeof UI === 'undefined') return;
  var App = UI.App, K = typeof Kernel !== 'undefined' ? Kernel : UI.K, D2R = Math.PI / 180;
  UI.sketchToolPMs = UI.sketchToolPMs || {};
  UI.sketchEntityPMs = UI.sketchEntityPMs || {};
  UI.sketchFreeHooks = UI.sketchFreeHooks || {};
  function $(id) { return document.getElementById(id); }
  function SS() { return window.SketchSolver; }
  function clean(x) { return +(+x).toPrecision(12); }
  function copyPt(q) { return [q[0], q[1]]; }
  function scr(p) { return UI.worldToScreen(K.to3D(UI.activePlane(), p[0], p[1])); }
  function pxDist(a, b) { var A = scr(a), B = scr(b); return Math.hypot(A[0] - B[0], A[1] - B[1]); }
  function markDirty() { if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; } }
  function refresh() { App.gridStale = true; UI.updateSketches(); if (UI.refreshTree) UI.refreshTree(); }
  function fmt(x, d) { return UI.fmtNum ? UI.fmtNum(x, d == null ? (UI.unitLabel && UI.unitLabel() === 'in' ? 3 : 2) : d) : String(Math.round(x * 1000) / 1000); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function setHint(tool) { var h = $('sketch-hint'); if (h && App.mode === 'sketch' && App.tool === tool) h.innerHTML = HINTS[tool]; }
  function wrap(a) { while (a <= -Math.PI) a += 2 * Math.PI; while (a > Math.PI) a -= 2 * Math.PI; return a; }
  function deg360(a) { a = a % 360; return a < 0 ? a + 360 : a; }

  var HINTS = {
    spline: 'Click to place each spline point. Double-click, right-click or <b>Esc</b> ends the spline; click its first point to close it.',
    styleSpline: 'Click to place each control vertex: the curve runs through the first and the last, tangent to the control polygon there. It ends at degree + 1 vertices; a double-click, right-click or <b>Esc</b> ends it sooner.',
    ellipse: 'Click the center, then the end of the major axis, then a point for the minor axis.',
    pellipse: 'Click the center, then the end of the major axis, then the start point (it sets the minor axis); move round the ellipse and click the end point.',
    parabola: 'Click the focus, then the apex (the parabola opens towards the focus), then the start point and the end point on it.',   // rfAS
    conic: 'Click the start point, the end point, then the top vertex (where the end tangents meet); move to set rho and click.'   // rfAS
  };
  var NAMES = { spline: 'Spline', styleSpline: 'Style Spline', ellipse: 'Ellipse', pellipse: 'Partial Ellipse', parabola: 'Parabola', conic: 'Conic' };
  // the options the tool PropertyManagers keep for the next entity (per session)
  var toolOpts = { spline: { construction: false, curv: false, cont: true }, styleSpline: { construction: false, curv: false, degree: '3' }, ellipse: { construction: false }, pellipse: { construction: false }, parabola: { construction: false }, conic: { construction: false } };
  var toolLast = { tool: null, index: null };   // the entity the open tool made last (its PM shows it)

  // ------------------------------------------------------------------ Spline tool
  function nearFirst(st, p) { return st.pts.length >= 3 && pxDist(st.pts[0], p) <= 9; }
  function splineOpts(e) { var o = toolOpts.spline; if (!o.cont) e.local = true; if (o.curv) e.showCurvature = true; return e; }
  function makeSpline(pts, closed) {
    var f = UI.activeSketchFeature();
    if (!f || pts.length < 2) return;
    var e = splineOpts({ t: 'spline', pts: pts.map(function (q) { return [clean(q[0]), clean(q[1])]; }) });
    if (closed) e.closed = true;
    UI.addEntity(e);   // the undo step, the Centerline / For construction flag and the inferred Coincidents
    App.tempEntities = []; UI.updateTemp();
    madeEntity('spline', f.entities.length - 1);
    if (UI.afterSketchCommit) UI.afterSketchCommit(f, f.entities.length - 1, App.toolState);   // sketch-hooks: Dynamic Mirror
    UI.setStatus('Spline' + (f.entities.length) + ' added: ' + pts.length + ' points' + (closed ? ', closed' : '') + '. Click to start another spline, or press Esc.');
  }
  UI.sketchFreeHooks.spline = {
    steps: function () { return Infinity; },
    entities: function (all, st) {
      var pts = all.map(copyPt), closed = false;
      if (pts.length >= 4 && nearFirst(st, pts[pts.length - 1])) { pts.pop(); closed = true; }   // the cursor on the first point closes it
      if (pts.length < 2) return [];
      var e = splineOpts({ t: 'spline', pts: pts });
      if (closed) e.closed = true;
      return [e];
    },
    click: function (p, st) {
      if (!nearFirst(st, p)) return false;   // placePoint adds the point
      var pts = st.pts.slice();
      st.pts = [];
      makeSpline(pts, true);
      UI.cancelTool(true);
      return true;
    },
    finish: function (st) {
      var pts = st.pts.slice();
      st.pts = [];
      // the second click of the double-click that ends it lands a pixel or two from the first: not a point of its own
      while (pts.length >= 2 && pxDist(pts[pts.length - 1], pts[pts.length - 2]) < 6) pts.pop();
      if (pts.length >= 2) makeSpline(pts, false);
      else UI.setStatus('A spline needs at least two points.');
    },
    readout: function (pts, p, n) {
      var q = pts[pts.length - 1];
      return 'Point ' + (pts.length + 1) + '   L ' + n(Math.hypot(p[0] - q[0], p[1] - q[1]), 2);
    }
  };

  // ------------------------------------------------------------------ rfAH: Style Spline tool
  // SolidWorks' Style Spline: one Bézier span of degree 3, 5 or 7 shaped by its control polygon. Click control vertex
  // after vertex; it ends by itself at degree + 1 vertices, or sooner with a double-click / right-click / Esc (then it
  // is elevated to the degree chosen: the same curve). Entity { t: 'spline', style: true, pts: control vertices }.
  function styleDegree() { var d = +toolOpts.styleSpline.degree; return d === 5 || d === 7 ? d : 3; }
  function styleEntity(pts, deg) {
    var P = pts.map(copyPt);
    if (deg != null && P.length - 1 !== deg) P = K.bzDegree(P, deg) || P;
    var e = { t: 'spline', style: true, pts: P.map(function (q) { return [clean(q[0]), clean(q[1])]; }) };
    if (toolOpts.styleSpline.curv) e.showCurvature = true;
    return e;
  }
  function makeStyleSpline(pts) {
    var f = UI.activeSketchFeature();
    if (!f || pts.length < 2) return;
    UI.addEntity(styleEntity(pts, styleDegree()));
    App.tempEntities = []; UI.updateTemp();
    madeEntity('styleSpline', f.entities.length - 1);
    if (UI.afterSketchCommit) UI.afterSketchCommit(f, f.entities.length - 1, App.toolState);
    UI.setStatus('Style Spline' + f.entities.length + ' added: degree ' + styleDegree() + '. Click to start another style spline, or press Esc.');
  }
  UI.sketchFreeHooks.styleSpline = {
    steps: function () { return Infinity; },
    // the curve of the vertices so far (and the cursor) with its control polygon
    entities: function (all) {
      var pts = all.map(copyPt);
      if (pts.length < 2) return [];
      var out = [{ t: 'polyline', pts: pts.map(copyPt), closed: false, construction: true }];
      out.unshift(styleEntity(pts.slice(0, styleDegree() + 1), null));
      return out;
    },
    click: function (p, st) {
      if (st.pts.length + 1 < styleDegree() + 1) return false;   // placePoint adds the vertex
      var pts = st.pts.concat([p]);
      st.pts = [];
      makeStyleSpline(pts);
      UI.cancelTool(true);
      return true;
    },
    finish: function (st) {
      var pts = st.pts.slice();
      st.pts = [];
      while (pts.length >= 2 && pxDist(pts[pts.length - 1], pts[pts.length - 2]) < 6) pts.pop();
      if (pts.length >= 2) makeStyleSpline(pts);
      else UI.setStatus('A style spline needs at least two control vertices.');
    },
    readout: function (pts, p, n) {
      var q = pts[pts.length - 1];
      return 'Vertex ' + (pts.length + 1) + ' of ' + (styleDegree() + 1) + '   L ' + n(Math.hypot(p[0] - q[0], p[1] - q[1]), 2);
    }
  };

  // ------------------------------------------------------------------ Ellipse / Partial Ellipse tools
  // centre c, major axis end a, and a point q: the minor radius is q's distance from the major axis
  function ellipseFrom(c, a, q) {
    var dx = a[0] - c[0], dy = a[1] - c[1], rx = Math.hypot(dx, dy);
    if (rx < 1e-12) return null;
    var e = { t: 'ellipse', cx: c[0], cy: c[1], rx: clean(rx), ry: clean(rx), rot: clean(Math.atan2(dy, dx) / D2R) };
    if (q) {
      var ux = dx / rx, uy = dy / rx, lx = (q[0] - c[0]) * ux + (q[1] - c[1]) * uy, ly = -(q[0] - c[0]) * uy + (q[1] - c[1]) * ux;
      e.ry = clean(Math.max(Math.abs(ly), rx * 1e-6));
      e.u = Math.atan2(ly / e.ry, lx / e.rx);   // q's parameter angle (radians; not stored)
    }
    return e;
  }
  // the parameter angle of point q on ellipse e (along the scaled ray from the centre)
  function paramAt(e, q) {
    var r = (+e.rot || 0) * D2R, x = q[0] - e.cx, y = q[1] - e.cy, lx = Math.cos(r) * x + Math.sin(r) * y, ly = -Math.sin(r) * x + Math.cos(r) * y;
    return Math.atan2(ly / e.ry, lx / e.rx);
  }
  // the major radius first, as SolidWorks keeps it (a minor point beyond the major radius swaps them: the axis turns
  // 90° and the parameter angles shift by −90°)
  function normalizeEllipse(e) {
    if (!(e.ry > e.rx)) return e;
    var t = e.rx; e.rx = e.ry; e.ry = t; e.rot = clean(e.rot + 90);
    if (e.t === 'pellipse') { e.a0 = clean(e.a0 - 90); e.a1 = clean(e.a1 - 90); }
    return e;
  }
  function tidyEllipse(e) {
    e.rot = clean(((e.rot % 360) + 540) % 360 - 180);   // (−180, 180]
    if (e.t === 'pellipse') { var a0 = deg360(e.a0); e.a1 = clean(a0 + (e.a1 - e.a0)); e.a0 = clean(a0); }
    delete e.u;
    return e;
  }
  function watchMade(tool) {
    var f = UI.activeSketchFeature(), n0 = f ? f.entities.length : 0;
    // (the one this click made is at n0: Dynamic Mirror may have added its mirror image after it)
    setTimeout(function () {
      var e = f && f.entities[n0];
      if (f && f.entities.length > n0 && e && e.t === tool) madeEntity(tool, n0);
    }, 0);
  }
  UI.sketchFreeHooks.ellipse = {
    steps: function () { return 3; },
    entities: function (all) {
      var e = ellipseFrom(all[0], all[1], all[2]);
      return e ? [tidyEllipse(normalizeEllipse(e))] : [];
    },
    click: function (p, st) { if (st.pts.length === 2) watchMade('ellipse'); return false; },
    // rfA: the minor axis point is a distance from the major axis: a click near the centre (a narrow ellipse) is taken
    // where it is, not pulled onto the centre (and refused as a point already placed)
    noOwnSnap: function (st) { return st.pts.length >= 2; },
    readout: function (pts, p, n) {
      var e = ellipseFrom(pts[0], pts[1] || p, pts[1] ? p : null);
      if (!e) return '';
      return pts.length < 2 ? 'R ' + n(e.rx, 2) + '   A ' + n(deg360(e.rot), 1) + '°' : 'R1 ' + n(Math.max(e.rx, e.ry), 2) + '   R2 ' + n(Math.min(e.rx, e.ry), 2);
    }
  };
  UI.sketchFreeHooks.pellipse = {
    steps: function () { return 4; },
    entities: function (all, st) {
      var e = ellipseFrom(all[0], all[1], all[2]);
      if (!e) return [];
      if (all.length < 4) { st.pelSweep = 0; st.pelLast = null; return [tidyEllipse(normalizeEllipse(e))]; }
      // the arc runs from the start point round the way the mouse moves (accumulated, so it may pass 180°)
      var u0 = e.u, u = paramAt(e, all[3]);
      if (st.pelLast == null) { st.pelLast = u0; st.pelSweep = 0; }
      st.pelSweep += wrap(u - st.pelLast);
      st.pelLast = u;
      var sw = Math.max(-2 * Math.PI + 1e-6, Math.min(2 * Math.PI - 1e-6, st.pelSweep));
      if (Math.abs(sw) < 1e-6) return [tidyEllipse(normalizeEllipse(e))];
      var a0 = sw > 0 ? u0 : u0 + sw, a1 = sw > 0 ? u0 + sw : u0;
      var pe = { t: 'pellipse', cx: e.cx, cy: e.cy, rx: e.rx, ry: e.ry, rot: e.rot, a0: clean(a0 / D2R), a1: clean(a1 / D2R) };
      return [tidyEllipse(normalizeEllipse(pe))];
    },
    noOwnSnap: function (st) { return st.pts.length >= 2; },   // rfA: the minor axis and end points (as the Ellipse's)
    click: function (p, st) {
      // the end point on the start point (no sweep yet) would make no arc
      if (st.pts.length === 3 && !(Math.abs(st.pelSweep || 0) > 1e-6)) { UI.setStatus('Move round the ellipse from the start point, then click the end point.'); return true; }
      if (st.pts.length === 3) watchMade('pellipse');
      return false;
    },
    readout: function (pts, p, n) {
      if (pts.length < 3) return UI.sketchFreeHooks.ellipse.readout(pts, p, n);
      return 'A ' + n(Math.abs((App.toolState && App.toolState.pelSweep) || 0) / D2R, 1) + '°';
    }
  };

  // rfY (fidelity 3 #5): on-screen numeric input for Ellipse / Partial Ellipse, as the other tools have it: after the
  // centre R (major radius) and A (its angle), after the major axis end R (the minor radius), and for a partial
  // ellipse after its start point A (the sweep, the way the mouse went). ui-sketch.js reads UI.sketchToolHooks[tool].
  UI.sketchToolHooks = UI.sketchToolHooks || {};
  function angDeg(v) { var a = Math.atan2(v[1], v[0]) / D2R; return a < 0 ? a + 360 : a; }
  function minorOf(c, a, p) {
    var dx = a[0] - c[0], dy = a[1] - c[1], L = Math.hypot(dx, dy);
    return L > 1e-12 ? Math.abs(-(p[0] - c[0]) * dy / L + (p[1] - c[1]) * dx / L) : 0;
  }
  function ellipseNum(tool) {
    return {
      numFields: function (n) { return n === 1 ? [['R', 'r'], ['A', 'ang']] : n === 2 ? [['R', 'ry']] : n === 3 && tool === 'pellipse' ? [['A', 'sweep']] : null; },
      liveValues: function (p) {
        var st = App.toolState, pts = st.pts, c = pts[0];
        if (pts.length === 1) return { r: Math.hypot(p[0] - c[0], p[1] - c[1]), ang: angDeg([p[0] - c[0], p[1] - c[1]]) };
        if (pts.length === 2) return { ry: minorOf(c, pts[1], p) };
        return { sweep: Math.abs(st.pelSweep || 0) / D2R };
      },
      typedPoint: function (cur, v) {
        var st = App.toolState, pts = st.pts, c = pts[0];
        if (!c) return null;
        if (pts.length === 1) {
          var d = Math.hypot(cur[0] - c[0], cur[1] - c[1]), a = v.ang != null ? v.ang * D2R : d > 1e-12 ? Math.atan2(cur[1] - c[1], cur[0] - c[0]) : 0, L = v.r != null ? v.r : d;
          return [clean(c[0] + L * Math.cos(a)), clean(c[1] + L * Math.sin(a))];
        }
        var b = pts[1], dx = b[0] - c[0], dy = b[1] - c[1], rx = Math.hypot(dx, dy);
        if (!(rx > 1e-12)) return null;
        var ux = dx / rx, uy = dy / rx;
        if (pts.length === 2) {
          if (v.ry == null) return cur;
          var lx = (cur[0] - c[0]) * ux + (cur[1] - c[1]) * uy, ly = -(cur[0] - c[0]) * uy + (cur[1] - c[1]) * ux, sg = ly < 0 ? -1 : 1;
          // on the cursor's side of the major axis, at the typed distance from it (where the cursor is along it)
          return [clean(c[0] + ux * lx - uy * sg * v.ry), clean(c[1] + uy * lx + ux * sg * v.ry)];
        }
        if (tool !== 'pellipse' || pts.length !== 3 || v.sweep == null) return cur;
        var e = ellipseFrom(c, b, pts[2]);
        if (!e) return cur;
        // the end at the typed sweep from the start, the way the mouse went (counter-clockwise when it has not moved)
        var sw = (st.pelSweep || 0) < 0 ? -v.sweep * D2R : v.sweep * D2R, u = e.u + sw, ry = e.ry;
        var q = [clean(c[0] + ux * rx * Math.cos(u) - uy * ry * Math.sin(u)), clean(c[1] + uy * rx * Math.cos(u) + ux * ry * Math.sin(u))];
        st.pelLast = paramAt({ cx: c[0], cy: c[1], rx: e.rx, ry: e.ry, rot: e.rot }, q); st.pelSweep = sw;   // the preview takes this sweep exactly
        return q;
      }
    };
  }
  UI.sketchToolHooks.ellipse = ellipseNum('ellipse');
  UI.sketchToolHooks.pellipse = ellipseNum('pellipse');

  // ------------------------------------------------------------------ tool PropertyManagers
  // SolidWorks opens the entity's PropertyManager with the tool: Options (For construction …) and, once one is drawn,
  // the Parameters of the entity just made (typed values change it while the tool stays on). ✓ or ✗ puts the tool down.
  function madeEntity(tool, index) {
    toolLast = { tool: tool, index: index };
    renderToolPMSoon();
  }
  function renderToolPMSoon() {
    if (App.mode !== 'sketch' || !UI.sketchToolPMs[App.tool] || App.tool !== toolLast.tool) return;
    var spec = UI.pmSpec && UI.pmSpec();
    if (!spec || !spec._skTool) return;
    UI.withToolPM(function () { openToolPM(App.tool); });
  }
  function lastMade(tool) {
    var f = UI.activeSketchFeature();
    if (!f || toolLast.tool !== tool || toolLast.index == null) return null;
    var e = f.entities[toolLast.index];
    if (tool === 'parabola' || tool === 'conic') return e && e.t === 'spline' && e.conic != null ? { f: f, e: e, index: toolLast.index } : null;   // rfAS
    var ok = tool === 'styleSpline' ? e && e.t === 'spline' && e.style : e && (e.t === tool || (tool !== 'spline' && /ellipse$/.test(e.t)));   // rfAH
    return ok ? { f: f, e: e, index: toolLast.index } : null;
  }
  function openToolPM(tool) {
    var o = toolOpts[tool], made = lastMade(tool), groups = [];
    App.drawConstruction = !!o.construction;
    var values = { construction: !!o.construction, curv: !!o.curv, cont: o.cont !== false, degree: String(o.degree || '3') };
    var optFields = [{ type: 'check', label: 'For construction', key: 'construction' }];
    if (tool === 'styleSpline') {   // rfAH: Spline Degree, then Options (as SolidWorks' Style Spline PropertyManager)
      groups.push({ title: 'Spline Degree', fields: [{ type: 'radio', key: 'degree', options: [['3', 'Degree 3'], ['5', 'Degree 5'], ['7', 'Degree 7']] }] });
      optFields.push({ type: 'check', label: 'Show curvature', key: 'curv' });
    }
    if (tool === 'spline') optFields.push({ type: 'check', label: 'Show curvature', key: 'curv' }, { type: 'check', label: 'Maintain internal continuity', key: 'cont' });
    groups.push({ title: 'Options', fields: optFields });
    if (made && tool === 'styleSpline') groups.push({ title: 'Parameters', fields: [{ type: 'static', label: 'Control vertices', value: made.e.pts.length + ' (degree ' + (made.e.pts.length - 1) + ')' }] });
    else if (!made && tool === 'styleSpline') groups.push({ title: 'Parameters', fields: [{ type: 'static', label: '', value: 'Place the first control vertex.' }] });
    else if (made && (tool === 'parabola' || tool === 'conic')) { groups.push({ title: 'Parameters', fields: conicFields(made.e) }); conicValues(made.e, values); }   // rfAS
    else if (!made && (tool === 'parabola' || tool === 'conic')) groups.push({ title: 'Parameters', fields: [{ type: 'static', label: '', value: tool === 'parabola' ? 'Click the focus.' : 'Click the start point.' }] });
    else if (made && tool === 'spline') groups.push({ title: 'Parameters', fields: [{ type: 'static', label: 'Number of points', value: made.e.pts.length + (made.e.closed ? ' (closed)' : '') }] });
    else if (made) { var ef = ellipseFields(made.e); groups.push({ title: 'Parameters', fields: ef }); ellipseValues(made.e, values); }
    else groups.push({ title: 'Parameters', fields: [{ type: 'static', label: '', value: tool === 'spline' ? 'Place the first point.' : 'Click the center.' }] });
    UI.openPM({
      // sketchTool (rfA): the PM closes when the tool is put down (Esc), as Insert Line's does; it stayed open over the
      // Select tool
      title: NAMES[tool] === 'Partial Ellipse' ? 'Ellipse' : NAMES[tool], icon: tool, values: values, _skTool: tool, sketchTool: tool, keepSelection: true, noFocus: true,
      message: HINTS[tool],
      groups: groups,
      onChange: function (v, key) {
        if (key === 'degree') {   // rfAH: the next style spline's degree; the one just drawn changes with it
          o.degree = String(v.degree);
          var md = lastMade(tool);
          if (md) { markDirty(); setStyleDegree(md.f, md.index, md.e, styleDegree()); refresh(); }
          return;
        }
        if (key === 'construction' || key === 'curv' || key === 'cont') {
          o[key] = !!v[key];
          if (key === 'construction') App.drawConstruction = !!v.construction;
          // the entity just drawn follows, as in SolidWorks (its PropertyManager is the one showing)
          var m2 = lastMade(tool);
          if (m2) {
            markDirty();
            if (key === 'construction') { if (v.construction) m2.e.construction = true; else delete m2.e.construction; }
            if (key === 'curv') { if (v.curv) m2.e.showCurvature = true; else delete m2.e.showCurvature; }
            if (key === 'cont') { if (v.cont) delete m2.e.local; else m2.e.local = true; }
            refresh();
          }
          return;
        }
        var m3 = lastMade(tool);
        if (m3 && key && m3.e.conic != null) { applyConic(m3.f, m3.index, m3.e, v); return; }   // rfAS
        if (m3 && key) applyEllipse(m3.f, m3.index, m3.e, v);
      },
      onOK: function () { if (App.tool === tool) UI.cancelTool(); },
      onCancel: function () { if (App.tool === tool) UI.cancelTool(); }
    });
    setHint(tool);
  }
  ['spline', 'styleSpline', 'ellipse', 'pellipse', 'parabola', 'conic'].forEach(function (tool) {
    UI.sketchToolPMs[tool] = function () {
      toolLast = { tool: tool, index: null };
      openToolPM(tool);
    };
  });

  // ------------------------------------------------------------------ Existing / Add Relations
  // the relation groups of ui-sketch-dims.js when it is loaded (UI.sketchRelationGroups), else a plain list
  function relationGroups(f, index, refs) {
    if (UI.sketchRelationGroups) { try { var g = UI.sketchRelationGroups(f, refs); if (g && g.length) return g; } catch (err) { /* fall back */ } }
    var S = SS(), rows = [];
    (f.rels || []).forEach(function (rel) {
      if (!rel.refs.some(function (r) { return +String(r).split('.')[0] === index && r !== 'O'; })) return;
      rows.push('<div class="rel-row">' + esc(S ? S.describe(f, rel) : rel.type) + '</div>');
    });
    var types = [];
    try { types = S ? S.applicable(f, refs) : []; } catch (err) { types = []; }
    return [
      { title: 'Existing Relations', fields: [{ type: 'html', html: '<div class="rel-list">' + (rows.join('') || '<div class="rel-empty">None</div>') + '</div>' }] },
      { title: 'Add Relations', fields: types.length ? [{ type: 'buttons', buttons: types.map(function (t) { return { label: S.TYPES[t].name, onclick: function () { markDirty(); var r = S.addRelation(f, t, refs); if (!r.ok) UI.toast(r.error); refresh(); if (UI.renderPM) UI.renderPM(); } }; }) }]
        : [{ type: 'static', label: '', value: 'No relation applies to this selection.' }] }
    ];
  }
  // a typed value moves the entity; the rest of the sketch follows its relations (the edited entity moves least)
  function solveAfterEdit(f, index) {
    var S = SS();
    if (S && (f.rels || f.dims)) { var mob = {}; mob[index] = 1e-4; S.solve(f, { mob: mob }); }
  }

  // ------------------------------------------------------------------ Ellipse PropertyManager
  function ellipseFields(e) {
    var u = 'u', fl = [
      { type: 'number', label: 'Center X', key: 'cx', unit: u }, { type: 'number', label: 'Center Y', key: 'cy', unit: u },
      { type: 'number', label: 'Major radius', key: 'rx', unit: u, min: 0 }, { type: 'number', label: 'Minor radius', key: 'ry', unit: u, min: 0 },
      { type: 'number', label: 'Angle', key: 'rot', unit: '°' }
    ];
    if (e.t === 'pellipse') fl.push({ type: 'number', label: 'Start angle', key: 'a0', unit: '°' }, { type: 'number', label: 'End angle', key: 'a1', unit: '°' });
    return fl;
  }
  function ellipseValues(e, v) {
    v.cx = clean(e.cx); v.cy = clean(e.cy); v.rx = clean(e.rx); v.ry = clean(e.ry); v.rot = clean(e.rot || 0);
    if (e.t === 'pellipse') { v.a0 = clean(e.a0); v.a1 = clean(e.a1); }
    v.construction = !!e.construction;
    return v;
  }
  // apply the PM's values to ellipse `index`; refused (status bar) when a radius is not positive or the arc is empty
  function applyEllipse(f, index, e, v) {
    var n = { cx: +v.cx, cy: +v.cy, rx: +v.rx, ry: +v.ry, rot: +v.rot, a0: +v.a0, a1: +v.a1 };
    if (!(n.rx > 0) || !(n.ry > 0)) { UI.setStatus('The radii of an ellipse must be greater than zero.'); return false; }
    if (['cx', 'cy', 'rot'].some(function (k) { return !isFinite(n[k]); })) return false;
    if (e.t === 'pellipse' && !(n.a1 > n.a0 && n.a1 - n.a0 < 360)) { UI.setStatus('The end angle must be after the start angle, less than 360° on.'); return false; }
    markDirty();
    e.cx = n.cx; e.cy = n.cy; e.rx = n.rx; e.ry = n.ry; e.rot = n.rot;
    if (e.t === 'pellipse') { e.a0 = n.a0; e.a1 = n.a1; }
    var swapped = e.ry > e.rx;
    normalizeEllipse(e);
    if (swapped) { ellipseValues(e, v); setTimeout(function () { if (UI.renderPM) UI.renderPM(); }, 0); UI.setStatus('The minor radius was larger than the major: the axes were swapped (the angle turned 90°).'); }
    solveAfterEdit(f, index);
    refresh();
    return true;
  }
  function openEllipsePM(index, e, f) {
    var v = ellipseValues(e, {});
    UI.openPM({
      title: 'Ellipse', icon: e.t, values: v, noFocus: true, _skEntity: { index: index, t: e.t },
      groups: relationGroups(f, index, [index + '.c']).concat([
        { title: 'Options', fields: [{ type: 'check', label: 'For construction', key: 'construction' }] },
        { title: 'Parameters', fields: ellipseFields(e) }
      ]),
      onChange: function (vals, key) {
        if (!key) return;
        if (key === 'construction') { markDirty(); if (vals.construction) e.construction = true; else delete e.construction; refresh(); return; }
        applyEllipse(f, index, e, vals);
      },
      onOK: function () { App.sel = null; UI.updateSketches(); }
    });
  }
  UI.sketchEntityPMs.ellipse = openEllipsePM;
  UI.sketchEntityPMs.pellipse = openEllipsePM;

  // ------------------------------------------------------------------ Spline PropertyManager
  // Options: For construction, Show curvature (the comb), Maintain internal continuity (on: one curvature-continuous
  // C2 curve through every point, a point moved reshapes it all; off: each point's tangent comes from its neighbours
  // only — a local, C1 curve: moving a point changes the spans next to it), Closed spline. Parameters: the point picked
  // (Spline point number, its X / Y), Tangent Driving with Tangent Weighting and Tangent Radial Direction; Insert /
  // Delete Point.
  var splineSel = { index: null, pt: 0 }, lastPress = null;
  function tangentAt(e, i) {
    var g = K.splineGeom(e);
    if (!g) return null;
    var m = g.bez.length, B, h, d;
    if (i < m) { B = g.bez[i]; h = g.knots[i + 1] - g.knots[i]; d = [3 * (B[1][0] - B[0][0]) / h, 3 * (B[1][1] - B[0][1]) / h]; }
    else { B = g.bez[m - 1]; h = g.knots[m] - g.knots[m - 1]; d = [3 * (B[3][0] - B[2][0]) / h, 3 * (B[3][1] - B[2][1]) / h]; }
    return { ang: clean(Math.atan2(d[1], d[0]) / D2R), w: clean(Math.hypot(d[0], d[1])) };
  }
  function splineValues(e, v) {
    var i = Math.max(0, Math.min(e.pts.length - 1, splineSel.pt)), tg = e.tans && e.tans[i], cur = tangentAt(e, i) || { ang: 0, w: 1 };
    v.construction = !!e.construction; v.curv = !!e.showCurvature; v.cont = !e.local; v.closed = !!e.closed;
    v.pt = i + 1; v.x = clean(e.pts[i][0]); v.y = clean(e.pts[i][1]);
    v.tan = !!tg; v.tw = clean(tg ? tg[1] : cur.w); v.ta = clean(tg ? tg[0] : cur.ang);
    // rfAY: Curvature Control: tans[i][3] is the signed curvature (1 / radius, + bends left of the point order)
    var kc = tg && tg[3] != null && isFinite(+tg[3]) ? +tg[3] : null, km = K.splineCurvatureAt ? K.splineCurvatureAt(e, i) : null;
    var kv = kc != null ? kc : km && km.k != null ? km.k : 0;
    v.cc = kc != null; v.ck = clean(kv); v.cr = Math.abs(kv) > 1e-12 ? clean(1 / Math.abs(kv)) : 0;
    return v;
  }
  // relations follow a spline point inserted at (or removed from) position k: 'i.vJ' refs shift, a removed point's go
  function remapSplineRefs(f, index, k, inserted) {
    if (!f.rels) return;
    var re = new RegExp('^' + index + '\\.v(\\d+)$');
    f.rels = f.rels.filter(function (rel) {
      return inserted || !rel.refs.some(function (r) { var m = re.exec(r); return m && +m[1] === k; });
    });
    f.rels.forEach(function (rel) {
      rel.refs = rel.refs.map(function (r) {
        var m = re.exec(r);
        if (!m) return r;
        var j = +m[1];
        return index + '.v' + (inserted ? (j >= k ? j + 1 : j) : (j > k ? j - 1 : j));
      });
    });
  }
  function insertPoint(f, index, e) {
    var g = K.splineGeom(e), i = splineSel.pt;
    if (!g) return;
    var span = Math.min(i, g.bez.length - 1), p = K.bezPoint(g.bez[span], 0.5);
    markDirty();
    e.pts.splice(span + 1, 0, [clean(p[0]), clean(p[1])]);
    if (e.tans) e.tans.splice(span + 1, 0, null);
    remapSplineRefs(f, index, span + 1, true);
    splineSel.pt = span + 1;
    refresh();
    openSplinePM(index, e, f);
  }
  function deletePoint(f, index, e) {
    var i = splineSel.pt, min = e.closed ? 3 : 2;
    if (e.pts.length <= min) { UI.setStatus('A' + (e.closed ? ' closed' : '') + ' spline needs at least ' + min + ' points.'); return; }
    markDirty();
    // a relation on an end that goes away goes with it
    if (!e.closed && f.rels && (i === 0 || i === e.pts.length - 1)) { var endRef = index + (i === 0 ? '.p1' : '.p2'); f.rels = f.rels.filter(function (rel) { return rel.refs.indexOf(endRef) < 0; }); }
    e.pts.splice(i, 1);
    if (e.tans) { e.tans.splice(i, 1); if (!e.tans.some(Boolean)) delete e.tans; }
    remapSplineRefs(f, index, i, false);
    splineSel.pt = Math.min(i, e.pts.length - 1);
    if (SS()) SS().clean(f);
    refresh();
    openSplinePM(index, e, f);
  }
  // rfAY: a spline point's curvature control: how 'on' (the curvature it has now; the tangent made driving first),
  // 'off', { r: radius } (keeps the side it bends to) or { k: signed curvature }; -> { ok } or { ok: false, error }
  function setCurvatureControl(e, i, how) {
    if (!e || e.t !== 'spline' || e.style || e.conic != null || !(i >= 0 && i < e.pts.length)) return { ok: false, error: 'Curvature Control is for a spline point.' };
    var tg = e.tans && e.tans[i];
    if (how === 'off') {
      if (tg && tg.length > 3) { tg.length = 3; if (tg[2] == null) tg.length = 2; }
      return { ok: true };
    }
    if (!tg) {   // the tangent the curve has there becomes driving
      var cur = tangentAt(e, i);
      if (!cur) return { ok: false, error: 'This spline has no tangent there.' };
      if (!e.tans) e.tans = e.pts.map(function () { return null; });
      while (e.tans.length < e.pts.length) e.tans.push(null);
      tg = e.tans[i] = [cur.ang, cur.w];
    }
    var old = tg[3] != null && isFinite(+tg[3]) ? +tg[3] : null, k;
    if (how === 'on') { var km = K.splineCurvatureAt(e, i); k = old != null ? old : km && km.k != null ? km.k : 0; }
    else if (how.r != null) {
      if (!(how.r > 0) || !isFinite(how.r)) return { ok: false, error: 'Radius of curvature must be greater than zero (set Curvature to 0 for a flat point).' };
      var sg = old != null ? (old < 0 ? -1 : 1) : ((K.splineCurvatureAt(e, i) || {}).k < 0 ? -1 : 1);
      k = sg / how.r;
    } else {
      if (!isFinite(how.k)) return { ok: false, error: 'Curvature must be a number.' };
      k = how.k;
    }
    while (tg.length < 3) tg.push(null);
    tg[3] = clean(k);
    return { ok: true, k: tg[3] };
  }
  UI.splineCurvatureControl = function (index, pt, how) {
    var f = UI.activeSketchFeature(), e = f && f.entities[index];
    if (!e) return { ok: false, error: 'No entity ' + index };
    var r = undoStep(function (g) { return setCurvatureControl(g.entities[index], pt, how); });
    return r;
  };
  function openSplinePM(index, e, f) {
    if (splineSel.index !== index) splineSel = { index: index, pt: 0 };
    // the point nearest the click that selected the spline (within 12 px) is the one shown
    if (lastPress && performance.now() - lastPress.at < 1500) {
      var best = -1, bd = 12;
      e.pts.forEach(function (q, i) { var s = scr(q), d = Math.hypot(s[0] - lastPress.x, s[1] - lastPress.y); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) splineSel.pt = best;
      lastPress = null;
    }
    splineSel.pt = Math.max(0, Math.min(e.pts.length - 1, splineSel.pt));
    var v = splineValues(e, {}), u = 'u';
    UI.openPM({
      title: 'Spline', icon: 'spline', values: v, noFocus: true, _skEntity: { index: index, t: 'spline' },
      groups: relationGroups(f, index, [index + '.v' + splineSel.pt]).concat([
        { title: 'Options', fields: [
          { type: 'check', label: 'For construction', key: 'construction' },
          { type: 'check', label: 'Show curvature', key: 'curv' },
          { type: 'check', label: 'Maintain internal continuity', key: 'cont' },
          { type: 'check', label: 'Closed spline', key: 'closed', disabled: function () { return e.pts.length < 3; } }
        ] },
        { title: 'Parameters', fields: [
          { type: 'static', label: 'Number of points', value: function () { return String(e.pts.length); } },
          { type: 'number', label: 'Spline point number', key: 'pt', step: 1, min: 1 },
          { type: 'number', label: 'X Coordinate', key: 'x', unit: u },
          { type: 'number', label: 'Y Coordinate', key: 'y', unit: u },
          { type: 'check', label: 'Tangent Driving', key: 'tan' },
          { type: 'number', label: 'Tangent Weighting', key: 'tw', min: 0, show: function (x) { return !!x.tan; } },
          { type: 'number', label: 'Tangent Radial Direction', key: 'ta', unit: '°', show: function (x) { return !!x.tan; } },
          // rfAY: Curvature Control at this point (SolidWorks' curvature handle): the radius of curvature, or the signed
          // curvature (+ bends left of the way the points run; 0 is flat), held on both sides of the point
          { type: 'check', label: 'Curvature Control', key: 'cc' },
          { type: 'number', label: 'Radius of curvature', key: 'cr', unit: u, min: 0, show: function (x) { return !!x.cc; } },
          { type: 'number', label: 'Curvature', key: 'ck', step: 0.01, show: function (x) { return !!x.cc; } },
          { type: 'buttons', buttons: [{ label: 'Insert Point', onclick: function () { insertPoint(f, index, e); } }, { label: 'Delete Point', onclick: function () { deletePoint(f, index, e); } }] }
        ] }
      ]),
      onChange: function (vals, key) {
        if (!key) return;
        var i = splineSel.pt;
        if (key === 'pt') {
          var k = Math.round(+vals.pt) - 1;
          if (!(k >= 0 && k < e.pts.length)) { vals.pt = i + 1; UI.renderPM(); return; }
          splineSel.pt = k;
          openSplinePM(index, e, f);   // its relations, X / Y and tangent
          return;
        }
        markDirty();
        if (key === 'construction') { if (vals.construction) e.construction = true; else delete e.construction; }
        else if (key === 'curv') { if (vals.curv) e.showCurvature = true; else delete e.showCurvature; }
        else if (key === 'cont') { if (vals.cont) delete e.local; else e.local = true; }
        else if (key === 'closed') { if (vals.closed && e.pts.length >= 3) e.closed = true; else { delete e.closed; vals.closed = false; } }
        else if (key === 'x' || key === 'y') {
          if (!isFinite(+vals[key])) return;
          e.pts[i][key === 'x' ? 0 : 1] = +vals[key];
          solveAfterEdit(f, index);
        } else if (key === 'tan' || key === 'tw' || key === 'ta') {
          if (key === 'tan' && !vals.tan) {
            if (e.tans) { e.tans[i] = null; if (!e.tans.some(Boolean)) delete e.tans; }
            if (vals.cc) { vals.cc = false; setTimeout(function () { if (UI.renderPM) UI.renderPM(); }, 0); }   // rfAY: no curvature control without the tangent
          } else {
            // turning Tangent Driving on keeps the curve as it is: the tangent it has now becomes the driving one
            if (key === 'tan') { var cur = tangentAt(e, i); if (cur) { vals.ta = cur.ang; vals.tw = cur.w; } }
            if (!(+vals.tw > 0) || !isFinite(+vals.ta)) { UI.setStatus('Tangent Weighting must be greater than zero.'); return; }
            if (!e.tans) e.tans = e.pts.map(function () { return null; });
            while (e.tans.length < e.pts.length) e.tans.push(null);
            e.tans[i] = [+vals.ta, +vals.tw].concat(e.tans[i] && e.tans[i].length > 2 ? e.tans[i].slice(2) : []);   // rfAY: keeps weightIn / curvature
            if (key === 'tan') setTimeout(function () { if (UI.renderPM) UI.renderPM(); }, 0);
          }
        } else if (key === 'cc' || key === 'cr' || key === 'ck') {   // rfAY: Curvature Control
          var r = setCurvatureControl(e, i, key === 'cc' ? (vals.cc ? 'on' : 'off') : key === 'cr' ? { r: +vals.cr } : { k: +vals.ck });
          if (!r.ok) { UI.setStatus(r.error); UI.renderPM(); return; }
          var nv = splineValues(e, {});
          vals.tan = nv.tan; vals.ta = nv.ta; vals.tw = nv.tw; vals.cc = nv.cc; vals.cr = nv.cr; vals.ck = nv.ck;
          setTimeout(function () { if (UI.renderPM) UI.renderPM(); }, 0);
        }
        refresh();
      },
      onOK: function () { App.sel = null; UI.updateSketches(); }
    });
  }
  // ------------------------------------------------------------------ rfAH: Style Spline PropertyManager
  // Existing / Add Relations of the control vertex picked, Options (For construction, Show curvature), Spline Degree
  // (3 / 5 / 7: raising it elevates the curve exactly, lowering it fits the nearest curve of that degree with the same
  // ends and end tangent directions), Parameters (Control vertex number, its X / Y). The control polygon is drawn for
  // every style spline of the active sketch; its vertices are sketch points (relations, dragging).
  // the degree of style spline `index` becomes deg: its relations on inner vertices go when their count changes (the
  // last vertex's follow it)
  function setStyleDegree(f, index, e, deg) {
    var n0 = e.pts.length - 1;
    if (deg === n0) return;
    var P = K.bzDegree(e.pts, deg);
    if (!P) return;
    e.pts = P.map(function (q) { return [clean(q[0]), clean(q[1])]; });
    if (f.rels) {
      var re = new RegExp('^' + index + '\\.v(\\d+)$');
      f.rels = f.rels.filter(function (rel) { return !rel.refs.some(function (r) { var m = re.exec(r); return m && +m[1] > 0 && +m[1] < n0; }); });
      f.rels.forEach(function (rel) { rel.refs = rel.refs.map(function (r) { var m = re.exec(r); return m && +m[1] === n0 ? index + '.v' + deg : r; }); });
      if (!f.rels.length) delete f.rels;
    }
    splineSel.pt = Math.min(splineSel.pt, e.pts.length - 1);
    solveAfterEdit(f, index);
  }
  UI.setStyleSplineDegree = function (index, deg) {   // script / test hook
    var f = UI.activeSketchFeature(), e = f && f.entities[index];
    if (!e || !e.style || [3, 5, 7].indexOf(+deg) < 0) return false;
    markDirty(); setStyleDegree(f, index, e, +deg); refresh();
    return true;
  };
  // Horizontal / Vertical on the control polygon leg after the picked vertex (a relation between its two vertices)
  function styleLegRelation(f, index, e, type) {
    var S = SS(), k = Math.max(0, Math.min(splineSel.pt, e.pts.length - 2));
    if (!S) return false;
    markDirty();
    var r = S.addRelation(f, type, [index + '.v' + k, index + '.v' + (k + 1)]);
    if (!r.ok) UI.toast(r.error || 'That relation cannot be added.');
    refresh();
    return r.ok;
  }
  UI.styleSplineLeg = function (index, k, type) {   // test hook: Horizontal / Vertical on leg k (vertices k, k + 1)
    var f = UI.activeSketchFeature(), e = f && f.entities[index];
    if (!e || !e.style) return false;
    splineSel = { index: index, pt: k };
    return styleLegRelation(f, index, e, type);
  };
  function styleValues(e, v) {
    var i = Math.max(0, Math.min(e.pts.length - 1, splineSel.pt)), d = e.pts.length - 1;
    v.construction = !!e.construction; v.curv = !!e.showCurvature;
    v.degree = String(d === 5 || d === 7 ? d : 3); v.pt = i + 1; v.x = clean(e.pts[i][0]); v.y = clean(e.pts[i][1]);
    return v;
  }
  function openStyleSplinePM(index, e, f) {
    if (splineSel.index !== index) splineSel = { index: index, pt: 0 };
    if (lastPress && performance.now() - lastPress.at < 1500) {
      var best = -1, bd = 12;
      e.pts.forEach(function (q, i) { var s = scr(q), d = Math.hypot(s[0] - lastPress.x, s[1] - lastPress.y); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) splineSel.pt = best;
      lastPress = null;
    }
    splineSel.pt = Math.max(0, Math.min(e.pts.length - 1, splineSel.pt));
    var v = styleValues(e, {}), u = 'u';
    UI.openPM({
      title: 'Style Spline', icon: 'styleSpline', values: v, noFocus: true, _skEntity: { index: index, t: 'spline', style: true },
      groups: relationGroups(f, index, [index + '.v' + splineSel.pt]).concat([
        { title: 'Options', fields: [
          { type: 'check', label: 'For construction', key: 'construction' },
          { type: 'check', label: 'Show curvature', key: 'curv' }
        ] },
        { title: 'Spline Degree', fields: [{ type: 'radio', key: 'degree', options: [['3', 'Degree 3'], ['5', 'Degree 5'], ['7', 'Degree 7']] }] },
        { title: 'Parameters', fields: [
          { type: 'static', label: 'Control vertices', value: function () { return String(e.pts.length); } },
          { type: 'number', label: 'Control vertex number', key: 'pt', step: 1, min: 1 },
          { type: 'number', label: 'X Coordinate', key: 'x', unit: u },
          { type: 'number', label: 'Y Coordinate', key: 'y', unit: u }
        ] },
        // the control polygon leg from the picked vertex to the next (the last vertex: from the one before): Horizontal
        // / Vertical on it, as SolidWorks offers on a selected control polygon line
        { title: 'Control Polygon', fields: [
          { type: 'static', label: 'Leg', value: function () { var k = Math.min(splineSel.pt, e.pts.length - 2); return (k + 1) + ' – ' + (k + 2); } },
          { type: 'buttons', buttons: ['horizontal', 'vertical'].map(function (t) {
            return { label: t === 'horizontal' ? 'Horizontal' : 'Vertical', onclick: function () { styleLegRelation(f, index, e, t); openStyleSplinePM(index, e, f); } };
          }) }
        ] }
      ]),
      onChange: function (vals, key) {
        if (!key) return;
        var i = splineSel.pt;
        if (key === 'pt') {
          var k = Math.round(+vals.pt) - 1;
          if (!(k >= 0 && k < e.pts.length)) { vals.pt = i + 1; UI.renderPM(); return; }
          splineSel.pt = k;
          openStyleSplinePM(index, e, f);
          return;
        }
        markDirty();
        if (key === 'construction') { if (vals.construction) e.construction = true; else delete e.construction; }
        else if (key === 'curv') { if (vals.curv) e.showCurvature = true; else delete e.showCurvature; }
        else if (key === 'degree') { setStyleDegree(f, index, e, +vals.degree); refresh(); openStyleSplinePM(index, e, f); return; }
        else if (key === 'x' || key === 'y') {
          if (!isFinite(+vals[key])) return;
          e.pts[i][key === 'x' ? 0 : 1] = +vals[key];
          solveAfterEdit(f, index);
        }
        refresh();
      },
      onOK: function () { App.sel = null; UI.updateSketches(); }
    });
  }
  UI.sketchEntityPMs.spline = function (index, e, f) { if (e && e.conic != null && K.conicData(e)) return openConicPM(index, e, f); return e && e.style ? openStyleSplinePM(index, e, f) : openSplinePM(index, e, f); };
  // the press that selects a spline (or one of its points): openSplinePM shows the point nearest it
  if (UI.viewport) UI.viewport.addEventListener('mousedown', function (ev) {
    if (App.mode !== 'sketch' || ev.button !== 0) return;
    var r = UI.viewport.getBoundingClientRect();
    lastPress = { x: ev.clientX - r.left, y: ev.clientY - r.top, at: performance.now() };
  }, true);

  // ------------------------------------------------------------------ live PropertyManager values
  // a dragged point or an edited relation moves the entity under an open Spline / Ellipse PropertyManager: its values
  // follow (not while a value box in it is being typed in)
  var pmSig = null;
  function syncOpenPM() {
    var spec = UI.pmSpec && UI.pmSpec(), f = UI.activeSketchFeature();
    // the tool's PropertyManager goes when the tool is put down (Esc, another command), as in SolidWorks
    if (spec && spec._skTool && App.tool !== spec._skTool) { UI.closePM(); pmSig = null; return; }
    if (!spec || !f || App.mode !== 'sketch') { pmSig = null; return; }
    var tgt = spec._skEntity ? spec._skEntity.index : spec._skTool && toolLast.tool === spec._skTool ? toolLast.index : null;
    var e = tgt != null ? f.entities[tgt] : null;
    if (!e) { pmSig = null; return; }
    var sig = JSON.stringify(e);
    if (pmSig && pmSig.spec === spec && pmSig.sig !== sig) {
      var a = document.activeElement, root = $('pm');
      if (!(a && root && root.contains(a) && /^(input|select|textarea)$/i.test(a.tagName))) {
        var v = spec.values || {};
        if (e.t === 'spline' && spec._skEntity && e.conic != null) conicValues(e, v);   // rfAS
        else if (e.t === 'spline' && spec._skEntity) { if (e.style) styleValues(e, v); else splineValues(e, v); }
        else if (/ellipse$/.test(e.t)) ellipseValues(e, v);
        if (UI.renderPM) UI.renderPM();
      }
    }
    pmSig = { spec: spec, sig: sig };
  }

  // ------------------------------------------------------------------ Show curvature: the curvature comb
  // A spline with Show curvature carries a comb in the active sketch, as SolidWorks draws it: teeth perpendicular to the
  // curve, their length proportional to the curvature, on the outside of the bend, joined by an envelope. The spline
  // point being edited in the Spline PropertyManager is marked with a square.
  var combGroup = null, combSig = null, combMat = null, markMat = null, polyMat = null;
  function combLines(e) {
    var g = K.splineGeom(e), segs = [], env = [];
    if (!g) return segs;
    var samples = [], diag = 0, kmax = 0, xs = e.pts.map(function (p) { return p[0]; }), ys = e.pts.map(function (p) { return p[1]; });
    diag = Math.hypot(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys)) || 1;
    g.bez.forEach(function (B) {
      var dn = Math.max(4, Math.round(splineView.combDensity || 24));   // rfAS: Density
      for (var k = 0; k <= dn; k++) {
        var s = k / dn, u = 1 - s, p = K.bezPoint(B, s);
        var d1 = [3 * u * u * (B[1][0] - B[0][0]) + 6 * u * s * (B[2][0] - B[1][0]) + 3 * s * s * (B[3][0] - B[2][0]), 3 * u * u * (B[1][1] - B[0][1]) + 6 * u * s * (B[2][1] - B[1][1]) + 3 * s * s * (B[3][1] - B[2][1])];
        var d2 = [6 * u * (B[2][0] - 2 * B[1][0] + B[0][0]) + 6 * s * (B[3][0] - 2 * B[2][0] + B[1][0]), 6 * u * (B[2][1] - 2 * B[1][1] + B[0][1]) + 6 * s * (B[3][1] - 2 * B[2][1] + B[1][1])];
        var sp = Math.hypot(d1[0], d1[1]);
        if (sp < 1e-12) continue;
        var kap = (d1[0] * d2[1] - d1[1] * d2[0]) / (sp * sp * sp);
        samples.push({ p: p, n: [-d1[1] / sp, d1[0] / sp], k: kap });
        kmax = Math.max(kmax, Math.abs(kap));
      }
    });
    if (!(kmax > 1e-12)) return segs;
    var scale = 0.2 * diag / kmax * (splineView.combScale || 1);   // rfAS: Scale
    samples.forEach(function (q) {
      var t = [q.p[0] - q.n[0] * q.k * scale, q.p[1] - q.n[1] * q.k * scale];
      segs.push([q.p, t]);
      env.push(t);
    });
    for (var i = 0; i + 1 < env.length; i++) segs.push([env[i], env[i + 1]]);
    return segs;
  }
  function updateComb() {
    if (typeof THREE === 'undefined' || !UI.scene) return;
    var f = App.mode === 'sketch' ? UI.activeSketchFeature() : null, spec = UI.pmSpec && UI.pmSpec();
    var mark = spec && spec._skEntity && spec._skEntity.t === 'spline' ? spec._skEntity.index : null;
    var list = f ? f.entities.map(function (e, i) { return e && e.t === 'spline' && (e.showCurvature || e.showInflection || e.style || i === mark || (splineView.handles && !e.style)) ? i : -1; }).filter(function (i) { return i >= 0; }) : [];   // rfAH: style splines show their control polygon
    var sig = list.length ? JSON.stringify([splineView, f.id, App.activeSketch, list.map(function (i) { return f.entities[i]; }), mark, mark != null ? splineSel.pt : null, UI.cam ? UI.cam.scale : 0]) : '';
    if (sig === combSig) return;
    combSig = sig;
    if (!combGroup) { combGroup = new THREE.Group(); combGroup.renderOrder = 12; UI.scene.add(combGroup); }
    while (combGroup.children.length) { var c = combGroup.children.pop(); if (c.geometry) c.geometry.dispose(); }
    if (list.length) {
      var pl = UI.activePlane(), pos = [], mpos = [], cpos = [];
      var push = function (arr, a, b) { var A = K.to3D(pl, a[0], a[1]), B = K.to3D(pl, b[0], b[1]); arr.push(A[0], A[1], A[2], B[0], B[1], B[2]); };
      list.forEach(function (i) {
        var e = f.entities[i];
        if (e.showCurvature) combLines(e).forEach(function (s) { push(pos, s[0], s[1]); });
        if (e.showInflection && UI.splineInflections) UI.splineInflections(e).forEach(function (q) {   // rfAW: a small diamond at each inflection point, 5 px
          var h5 = 5 * (UI.cam ? UI.cam.scale : 0.1), dm = [[q[0] - h5, q[1]], [q[0], q[1] - h5], [q[0] + h5, q[1]], [q[0], q[1] + h5]];
          for (var k5 = 0; k5 < 4; k5++) push(mpos, dm[k5], dm[(k5 + 1) % 4]);
        });
        if (splineView.handles && !e.style) handleLines(e).forEach(function (s) { push(cpos, s[0], s[1]); });   // rfAS: Show Spline Handles
        if (e.style) for (var cq = 0; cq + 1 < e.pts.length; cq++) push(cpos, e.pts[cq], e.pts[cq + 1]);   // rfAH: the control polygon
        if (i === mark && e.pts[splineSel.pt]) {   // the picked spline point: a small square, 4 px a side
          var q = e.pts[splineSel.pt], h = 4 * (UI.cam ? UI.cam.scale : 0.1);
          var sq = [[q[0] - h, q[1] - h], [q[0] + h, q[1] - h], [q[0] + h, q[1] + h], [q[0] - h, q[1] + h]];
          for (var k = 0; k < 4; k++) push(mpos, sq[k], sq[(k + 1) % 4]);
        }
      });
      if (!combMat) { combMat = new THREE.LineBasicMaterial({ color: 0xb03ab8, depthTest: false, transparent: true, opacity: 0.85 }); markMat = new THREE.LineBasicMaterial({ color: 0xe8891c, depthTest: false }); }
      if (!polyMat) polyMat = new THREE.LineBasicMaterial({ color: 0x7a8794, depthTest: false, transparent: true, opacity: 0.8 });
      [[pos, combMat], [mpos, markMat], [cpos, polyMat]].forEach(function (pm) {
        if (!pm[0].length) return;
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pm[0], 3));
        var ls = new THREE.LineSegments(geo, pm[1]);
        ls.renderOrder = 12;
        combGroup.add(ls);
      });
    }
    if (UI.requestRender) UI.requestRender();
  }
  // a light poll keeps the comb and an open PM in step with drags, undo and relation edits whoever made them
  setInterval(function () { try { updateComb(); syncOpenPM(); } catch (err) { /* never break the app for an overlay */ } }, 200);
  UI.splineComb = function (e) { return combLines(e); };
  // rfAS: a spline's tangent handles: from each point along its tangent, a third of the span on each side
  function handleLines(e) {
    var g = K.splineGeom(e), out = [];
    if (!g || e.conic != null) return out;
    g.bez.forEach(function (B) { out.push([B[0], B[1]], [B[3], B[2]]); });
    return out;
  }
  UI.splineHandles = handleLines;
  UI.styleSplineOverlay = function () { try { updateComb(); } catch (err) { /* */ } return combGroup ? combGroup.children.length : 0; };   // rfAH test hook: overlay objects shown   // test hook: the comb's segments [[p, q], …] of spline e

  // ================================================================== rfAS: spline tools and conic curves
  function dist2(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function tolOf(p) { return 1e-6 * Math.max(1, Math.abs(p[0]), Math.abs(p[1])); }
  function isPlainSpline(e) { return !!e && e.t === 'spline' && !e.style && e.conic == null && !!e.pts && e.pts.length >= 2; }
  function refreshAll() { App.dimsStale = true; refresh(); if (UI.refreshStatus) UI.refreshStatus(); }
  // one undo step around fn(f) -> { ok, error }: a failure leaves the sketch exactly as it was
  function undoStep(fn) {
    var f = UI.activeSketchFeature();
    if (!f || !SS()) return { ok: false, error: 'Open a sketch first.' };
    var snap = JSON.stringify({ entities: f.entities, rels: f.rels || null, dims: f.dims || null }), dirty0 = App.sketchDirty;
    UI.pushUndo(); App.sketchDirty = true;
    var depth = App.undo.length, r;
    try { r = fn(f) || { ok: false }; } catch (er) { r = { ok: false, error: er.message || String(er) }; }
    if (!r.ok) {
      var o = JSON.parse(snap); f.entities = o.entities; if (o.rels) f.rels = o.rels; else delete f.rels; if (o.dims) f.dims = o.dims; else delete f.dims;
      if (App.undo.length === depth) App.undo.pop();
      App.sketchDirty = dirty0;
    }
    refreshAll();
    return r;
  }

  // ------------------------------------------------------------------ Split Entities on ellipses and partial ellipses
  // A full ellipse splits at two points into two partial ellipses, a partial ellipse at one or more points; the pieces
  // are exactly the curve (the same centre, radii and angle), meet end to end with Coincident, and the relations and
  // dimensions on the old ellipse follow them as Trim keeps them (SketchSolver.freeSplit's rules for splines): points of
  // it (centre, axis ends, ends) go to the same point of a piece, a point lying on it to the piece under it, the major /
  // minor radius dimensions to the first piece. Returns { ok, pieces: [indices], error }.
  function ellFc(e) { return SS() && e && (e.t === 'ellipse' || e.t === 'pellipse') ? SS().freeCurve(e) : null; }
  function ellPiece(e, ta, tb) {   // the part of ellipse e from parameter ta to tb (radians)
    var o = { t: 'pellipse', cx: e.cx, cy: e.cy, rx: e.rx, ry: e.ry, rot: +e.rot || 0, a0: ta / D2R, a1: tb / D2R };
    while (o.a0 >= 360) { o.a0 -= 360; o.a1 -= 360; }
    while (o.a0 < 0) { o.a0 += 360; o.a1 += 360; }
    o.a0 = clean(o.a0); o.a1 = clean(o.a1);
    if (e.construction) o.construction = true;
    if (e.layer != null) o.layer = e.layer;
    return o;
  }
  // the relations and dimensions of entity idx of `before` follow its n pieces, now at idx … idx + n − 1
  function carryRelations(f, before, idx, n, an0) {
    var S = SS(), E = f.entities, pieces = [], q, shift = n - 1, B = { entities: before };
    for (q = 0; q < n; q++) pieces.push(idx + q);
    function mapIdx(j) { return j < idx ? j : j > idx ? j + shift : -1; }
    function onPiece(r, p) {
      var P = S.refPoint(B, r);
      if (!P) return null;
      for (var a = 0; a < n; a++) {
        var prs = S.pointRefs(f, pieces[a]);
        for (var b = 0; b < prs.length; b++) if (!/\.mid$/.test(prs[b].ref) && dist2(prs[b].pt, P) < tolOf(P) && (p.s !== 'c' || /\.c$/.test(prs[b].ref))) return prs[b].ref;
      }
      return null;
    }
    function pieceUnder(P) {
      for (var a = 0; a < n; a++) { var fp = S.freeCurve(E[pieces[a]]), c = fp && S.freeClosest(fp, P); if (c && !c.end && c.d < 1e-5 * Math.max(1, Math.abs(P[0]), Math.abs(P[1]))) return String(pieces[a]); }
      return null;
    }
    var rels = [], moved = [];
    (f.rels || []).forEach(function (rel) {
      var ok = true, touches = false;
      var refs = rel.refs.map(function (r) {
        var p = S.parseRef(r);
        if (!p || p.o) return r;
        if (p.e !== idx) { var m = mapIdx(p.e); return String(m) + String(r).slice(String(p.e).length); }
        touches = true;
        if (p.s) { var on = onPiece(r, p); if (!on) ok = false; return on; }
        if (rel.type !== 'coincident' || rel.refs.length !== 2) { ok = false; return null; }
        var other = rel.refs[0] === r ? rel.refs[1] : rel.refs[0], P = S.refPoint(B, other), pu = P ? pieceUnder(P) : null;
        if (!pu) ok = false;
        return pu;
      });
      if (!ok) return;
      var nr = JSON.parse(JSON.stringify(rel)); nr.refs = refs;
      rels.push(nr);
      if (touches) moved.push(nr);
    });
    f.rels = rels;
    if (f.dims) {
      f.dims = f.dims.filter(function (d) {
        if (d.e !== idx) { var m = mapIdx(d.e); if (m < 0) return false; d.e = m; return true; }
        if ((d.k === 'rx' || d.k === 'ry') && E[pieces[0]] && E[pieces[0]].t === 'pellipse') { d.e = pieces[0]; return true; }
        return false;
      });
      if (!f.dims.length) delete f.dims;
    }
    S.clean(f);
    var an1 = S.analyze(f);
    for (var m = moved.length - 1; m >= 0 && (an1.conflicts > an0.conflicts || an1.redundant > an0.redundant); m--) {
      var at = f.rels ? f.rels.indexOf(moved[m]) : -1;
      if (at < 0) continue;
      f.rels.splice(at, 1);
      an1 = S.analyze(f);
    }
    if (f.rels && !f.rels.length) delete f.rels;
  }
  // rfAS: the parameter t in [0, 1] of the point of conic c nearest p, and the piece of c from t = a to b as a conic
  // entity of its own (the rational quadratic's blossom: its end weights brought back to 1, so its rho is its own)
  function conicParam(c, p) {
    var bt = 0, bd = Infinity, k;
    for (k = 0; k <= 400; k++) { var d = dist2(K.conicPoint(c, k / 400), p); if (d < bd) { bd = d; bt = k / 400; } }
    var lo = Math.max(0, bt - 1 / 400), hi = Math.min(1, bt + 1 / 400);
    for (k = 0; k < 80; k++) { var m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (dist2(K.conicPoint(c, m1), p) < dist2(K.conicPoint(c, m2), p)) hi = m2; else lo = m1; }
    return (lo + hi) / 2;
  }
  function conicPiece(c, a, b, e) {
    var Q = [[c.P0[0], c.P0[1], 1], [c.w * c.T[0], c.w * c.T[1], c.w], [c.P2[0], c.P2[1], 1]];
    function bl(u, v) { var r = []; for (var i = 0; i < 3; i++) r.push((1 - u) * (1 - v) * Q[0][i] + ((1 - u) * v + u * (1 - v)) * Q[1][i] + u * v * Q[2][i]); return r; }
    var R0 = bl(a, a), R1 = bl(a, b), R2 = bl(b, b), w = R1[2] / Math.sqrt(R0[2] * R2[2]);
    var o = conicEntity([R0[0] / R0[2], R0[1] / R0[2]], [R2[0] / R2[2], R2[1] / R2[2]], [R1[0] / R1[2], R1[1] / R1[2]], w / (1 + w));
    if (!o) throw new Error('That split would leave a piece too small to keep.');
    if (e.parabola) { o.parabola = true; o.conic = 0.5; }
    if (e.construction) o.construction = true;
    if (e.layer != null) o.layer = e.layer;
    return o;
  }
  // Trim's piece of a conic (SketchSolver.freePiece) from the point nearest pa to the point nearest pb
  K.conicPieceAt = function (e, pa, pb) { var c = K.conicData(e), a = conicParam(c, pa), b = conicParam(c, pb); return conicPiece(c, Math.min(a, b), Math.max(a, b), e); };
  function splitEllipse(f, idx, pts) {
    var S = SS(), e = f.entities[idx], cc = e && e.t === 'spline' ? K.conicData(e) : null, fc = cc ? null : ellFc(e), conicPieces = null;
    if (cc) {   // a conic / parabola: its pieces are conics (their own rho) through the same curve
      var cts = [];
      (pts || []).forEach(function (p) { var t = conicParam(cc, p); if (t > 1e-6 && t < 1 - 1e-6 && !cts.some(function (o) { return Math.abs(o - t) < 1e-6; })) cts.push(t); });
      if (!cts.length) return { ok: false, error: 'Click inside the ' + (e.parabola ? 'parabola' : 'conic') + ', away from its ends.' };
      cts.sort(function (a, b) { return a - b; });
      var cb = [0].concat(cts, [1]);
      conicPieces = [];
      for (var ck = 0; ck + 1 < cb.length; ck++) conicPieces.push(conicPiece(cc, cb[ck], cb[ck + 1], e));
    } else if (!fc) return { ok: false, error: 'Split Entities splits lines, arcs, circles, ellipses and splines.' };
    var full = !cc && e.t === 'ellipse', per = 2 * Math.PI, tol = cc ? 0 : 1e-6 * (fc.t1 - fc.t0), ts = cc ? [0] : [];
    if (!cc) (pts || []).forEach(function (p) {
      var t = S.freeClosest(fc, p).t;
      if (full) t = ((t % per) + per) % per;
      else if (t <= fc.t0 + tol || t >= fc.t1 - tol) return;
      if (!ts.some(function (o) { var d = Math.abs(o - t); return d < tol || (full && per - d < tol); })) ts.push(t);
    });
    ts.sort(function (a, b) { return a - b; });
    if (full ? ts.length < 2 : !ts.length) return { ok: false, error: full ? 'An ellipse is split at two points: click a second point on it.' : 'Click inside the partial ellipse, away from its ends.' };
    var saved = JSON.stringify({ entities: f.entities, rels: f.rels || null, dims: f.dims || null }), an0 = S.analyze(f), k, pieces = [];
    try {
      if (conicPieces) pieces = conicPieces;
      else {
        var bounds = full ? ts.concat([ts[0] + per]) : [fc.t0].concat(ts, [fc.t1]);
        for (k = 0; k + 1 < bounds.length; k++) pieces.push(ellPiece(e, bounds[k], bounds[k + 1]));
      }
      var before = f.entities.slice();
      f.entities = before.slice(0, idx).concat(pieces, before.slice(idx + 1));
      carryRelations(f, before, idx, pieces.length, an0);
      var made = [];
      f.rels = f.rels || [];
      for (k = 0; k < pieces.length; k++) {
        if (k + 1 === pieces.length && !full) break;
        var co = { type: 'coincident', refs: [(idx + k) + '.p2', (idx + (k + 1) % pieces.length) + '.p1'] };
        f.rels.push(co); made.push(co);
      }
      S.solve(f);
      var an = S.analyze(f);
      for (k = made.length - 1; k >= 0 && (an.redundant > an0.redundant || an.conflicts > an0.conflicts); k--) {
        var at = f.rels.indexOf(made[k]);
        if (at < 0) continue;
        f.rels.splice(at, 1);
        var a2 = S.analyze(f);
        if (a2.redundant < an.redundant || a2.conflicts < an.conflicts) an = a2; else f.rels.splice(at, 0, made[k]);
      }
      if (!f.rels.length) delete f.rels;
      if (an.conflicts > an0.conflicts) throw new Error('Splitting there would leave the sketch unsolvable: nothing was split.');
    } catch (er) {
      var o = JSON.parse(saved);
      f.entities = o.entities; if (o.rels) f.rels = o.rels; else delete f.rels; if (o.dims) f.dims = o.dims; else delete f.dims;
      return { ok: false, error: er.message || String(er) };
    }
    return { ok: true, pieces: pieces.map(function (p, j) { return idx + j; }) };
  }
  UI.splitEllipse = splitEllipse;   // test hook
  // The Split Entities command (ui-sketch-construct.js) hands its clicks on ellipses, partial ellipses and conics here.

  // ------------------------------------------------------------------ Fit Spline (Tools ▸ Spline Tools)
  // SolidWorks' Fit Spline: the selected lines, arcs and polylines (one chain end to end, e.g. an imported DXF
  // polyline) become one spline within Tolerance of them. The spline runs through the chain's vertices and arc
  // midpoints, and more chain points are added where it strays further than the tolerance (both ways: the chain from
  // the spline and the spline from the chain). Options: Closed spline (a chain that closes on itself), and what
  // becomes of the geometry: Delete geometry, Constrained (it stays as construction geometry, the spline's ends
  // Coincident with its ends), Unconstrained (it stays as it was).
  // the selected entities as one ordered chain: { dense: [{ p, v }], closed, ends: [startRef, endRef] } or { error }
  function chainOf(f, idx) {
    var segs = [], diag = 0, xs = [], ys = [];
    idx.forEach(function (i) {
      var e = f.entities[i];
      if (!e) return;
      if (e.t === 'line') segs.push({ i: i, pts: [[e.x1, e.y1], [e.x2, e.y2]], refs: [i + '.p1', i + '.p2'] });
      else if (e.t === 'arc') {
        var sw = e.a1 - e.a0, n = Math.max(2, Math.ceil(sw / 3)), P = [];
        for (var k = 0; k <= n; k++) { var a = (e.a0 + sw * k / n) * D2R; P.push([e.cx + e.r * Math.cos(a), e.cy + e.r * Math.sin(a)]); }
        segs.push({ i: i, pts: P, arc: true, refs: [i + '.p1', i + '.p2'] });
      } else if (e.t === 'polyline' && e.pts && e.pts.length >= 2) {
        var Q = e.pts.map(copyPt);
        if (e.closed) Q.push(copyPt(e.pts[0]));
        segs.push({ i: i, pts: Q, refs: [null, null] });
      }
    });
    if (!segs.length) return { error: 'Select lines, arcs or a polyline: a chain of them, end to end.' };
    segs.forEach(function (s) { s.pts.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); });
    diag = Math.hypot(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys)) || 1;
    var tol = 1e-6 * Math.max(1, diag), chain = segs.shift();
    chain = { pts: chain.pts.slice(), refs: chain.refs.slice() };
    while (segs.length) {
      var hit = -1, how = null;
      for (var j = 0; j < segs.length && hit < 0; j++) {
        var s = segs[j], a0 = s.pts[0], a1 = s.pts[s.pts.length - 1], c0 = chain.pts[0], c1 = chain.pts[chain.pts.length - 1];
        if (dist2(a0, c1) < tol) { hit = j; how = 'end'; }
        else if (dist2(a1, c1) < tol) { hit = j; how = 'endRev'; }
        else if (dist2(a1, c0) < tol) { hit = j; how = 'start'; }
        else if (dist2(a0, c0) < tol) { hit = j; how = 'startRev'; }
      }
      if (hit < 0) return { error: 'The selected entities do not form one chain: they must join end to end.' };
      var sg = segs.splice(hit, 1)[0], P = sg.pts.slice(), R = sg.refs.slice();
      if (how === 'endRev' || how === 'startRev') { P.reverse(); R.reverse(); }
      if (how === 'end' || how === 'endRev') { sg.at = chain.pts.length - 1; chain.pts = chain.pts.concat(P.slice(1)); chain.refs[1] = R[1]; }
      else { chain.pts = P.slice(0, -1).concat(chain.pts); chain.refs[0] = R[0]; }
    }
    // dense samples (lines cut so no step is over 1/400 of the size); v: a vertex of the chain (line ends, arc ends
    // and midpoints): the spline's first through points
    var dense = [], step = diag / 400, P0 = chain.pts;
    for (var q = 0; q + 1 < P0.length; q++) {
      var A = P0[q], Bq = P0[q + 1], L = dist2(A, Bq), m = Math.max(1, Math.ceil(L / step));
      for (var k2 = 0; k2 < m; k2++) dense.push({ p: [A[0] + (Bq[0] - A[0]) * k2 / m, A[1] + (Bq[1] - A[1]) * k2 / m], v: k2 === 0 });
    }
    dense.push({ p: P0[P0.length - 1].slice(), v: true });
    // arc interior samples are not vertices except an arc's midpoint (every few degrees an arc is sampled: the turn
    // between neighbours there is small)
    var turns = dense.map(function (d, i) {
      if (i === 0 || i === dense.length - 1 || !d.v) return 0;
      var a = dense[i - 1].p, b = d.p, c = dense[i + 1].p, u = [b[0] - a[0], b[1] - a[1]], w = [c[0] - b[0], c[1] - b[1]];
      return Math.abs(Math.atan2(u[0] * w[1] - u[1] * w[0], u[0] * w[0] + u[1] * w[1]));
    });
    dense.forEach(function (d, i) { if (d.v && i > 0 && i < dense.length - 1 && turns[i] < 4.5 * D2R) d.v = false; });
    var closed = dist2(dense[0].p, dense[dense.length - 1].p) < tol;
    // keep at least the middle of every long run without vertices (an arc: its midpoint)
    var lastV = 0;
    for (var z = 1; z < dense.length; z++) if (dense[z].v || z === dense.length - 1) { if (z - lastV > 8) dense[Math.round((z + lastV) / 2)].v = true; lastV = z; }
    return { dense: dense, closed: closed, ends: chain.refs, diag: diag };
  }
  // the spline (through points of the chain) within tol of the dense chain samples: { pts, dev } or null
  function fitThrough(dense, tol, closed) {
    var S = SS(), n = dense.length, use = [], i;
    if (closed) n--;   // the last sample repeats the first
    for (i = 0; i < n; i++) if (dense[i].v || i === 0 || (!closed && i === n - 1)) use.push(i);
    function segDist(p) {   // distance from p to the dense chain (a polyline)
      var best = Infinity;
      for (var k = 0; k + 1 < dense.length; k++) {
        var a = dense[k].p, b = dense[k + 1].p, d = [b[0] - a[0], b[1] - a[1]], l2 = d[0] * d[0] + d[1] * d[1], t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2)) : 0;
        best = Math.min(best, Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1]));
      }
      return best;
    }
    var e = null, dev = 0;
    for (var it = 0; it < 30; it++) {
      if (closed && use.length < 3) { use = [0, Math.floor(n / 3), Math.floor(2 * n / 3)]; }
      e = { t: 'spline', pts: use.map(function (k) { return [clean(dense[k].p[0]), clean(dense[k].p[1])]; }) };
      if (closed) e.closed = true;
      var fc = S.freeCurve(e), g = K.splineGeom(e);
      if (!fc || !g) return null;
      var gaps = use.length - (closed ? 0 : 1), add = [];
      dev = 0;
      for (var gi = 0; gi < gaps; gi++) {
        var lo = use[gi], hi = gi + 1 < use.length ? use[gi + 1] : use[0] + n, worst = 0, at = -1;
        for (var k = lo + 1; k < hi; k++) { var dd = fc && S.freeClosest(fc, dense[k % n].p).d; if (dd > worst) { worst = dd; at = k; } }
        var B = g.bez[gi];
        if (B) for (var s = 1; s < 8; s++) { var q = K.bezPoint(B, s / 8), d2 = segDist(q); if (d2 > worst) { worst = d2; at = Math.round(lo + (hi - lo) * s / 8); } }
        dev = Math.max(dev, worst);
        if (worst > tol && hi - lo > 1) add.push(at > lo && at < hi ? at : Math.round((lo + hi) / 2));
      }
      if (!add.length) break;
      add.forEach(function (k) { k = k % n; if (use.indexOf(k) < 0) use.push(k); });
      use.sort(function (a, b) { return a - b; });
    }
    return { pts: e.pts, closed: !!e.closed, dev: dev };
  }
  // Fit Spline on sketch f: idx the entities, opts { tol, closed, mode: 'delete' | 'constrained' | 'unconstrained' }
  function fitSpline(f, idx, opts) {
    opts = opts || {};
    var ch = chainOf(f, idx);
    if (ch.error) return { ok: false, error: ch.error };
    var tol = +opts.tol > 0 ? +opts.tol : ch.diag * 1e-3, closed = ch.closed && opts.closed !== false;
    var fit = fitThrough(ch.dense, tol, closed);
    if (!fit || fit.pts.length < 2) return { ok: false, error: 'No spline fits that chain.' };
    var S = SS(), sp = { t: 'spline', pts: fit.pts };
    if (fit.closed) sp.closed = true;
    var mode = opts.mode || 'delete', first = f.entities[idx[0]];
    if (first && first.construction && mode !== 'constrained') sp.construction = true;
    if (mode === 'delete') {
      idx.slice().sort(function (a, b) { return b - a; }).forEach(function (i) {
        S.removeEntity(f, i);
        f.entities.splice(i, 1);
        if (f.dims) { f.dims = f.dims.filter(function (d) { return d.e !== i; }); f.dims.forEach(function (d) { if (d.e > i) d.e--; }); if (!f.dims.length) delete f.dims; }
      });
    } else if (mode === 'constrained') idx.forEach(function (i) { if (f.entities[i]) f.entities[i].construction = true; });
    f.entities.push(sp);
    var ni = f.entities.length - 1;
    if (mode === 'constrained' && !fit.closed) {
      f.rels = f.rels || [];
      if (ch.ends[0]) f.rels.push({ type: 'coincident', refs: [ni + '.p1', ch.ends[0]] });
      if (ch.ends[1]) f.rels.push({ type: 'coincident', refs: [ni + '.p2', ch.ends[1]] });
    }
    S.clean(f);
    S.solve(f);
    return { ok: true, index: ni, points: fit.pts.length, dev: fit.dev };
  }
  UI.fitSpline = fitSpline;   // test hook: (f, idx, { tol, closed, mode })
  function selectedEntities(f) {
    var sel = [];
    if (UI.selection) UI.selection().forEach(function (s) { if (s.kind === 'entity' && sel.indexOf(s.index) < 0) sel.push(s.index); });
    if (App.sel && App.sel.kind === 'entity' && sel.indexOf(App.sel.index) < 0) sel.push(App.sel.index);
    return sel.filter(function (i) { return f && f.entities[i]; });
  }
  UI.cmdFitSpline = function () {
    var f = UI.activeSketchFeature();
    if (App.mode !== 'sketch' || !f) { UI.toast('Open a sketch first.'); return; }
    if (App.tool !== 'select') UI.setTool('select');
    var picked = selectedEntities(f).filter(function (i) { var e = f.entities[i]; return e.t === 'line' || e.t === 'arc' || e.t === 'polyline'; });
    var unit = UI.unitLabel ? UI.unitLabel() : 'mm', v = { tol: unit === 'in' ? 0.001 : 0.025, closed: true, mode: 'delete' };
    UI.openPM({
      title: 'Fit Spline', icon: 'spline', values: v, noFocus: true, keepSelection: true,
      message: 'Select the lines, arcs or polyline to fit (one chain, end to end): click them in the graphics area. The spline stays within the tolerance of them.',
      command: { ownHover: false, onSketchPoint: function (uv, mx, my) {
        var hit = UI.pickEntity(mx, my), g = UI.activeSketchFeature(), e = hit && g && g.entities[hit.index];
        if (!e || !(e.t === 'line' || e.t === 'arc' || e.t === 'polyline')) { UI.setStatus('Fit Spline takes lines, arcs and polylines.'); return; }
        var k = picked.indexOf(hit.index);
        if (k >= 0) picked.splice(k, 1); else picked.push(hit.index);
        if (UI.setSelection) UI.setSelection(picked.map(function (i) { return { kind: 'entity', index: i }; }));
        UI.renderPM();
      } },
      groups: [
        { title: 'Entities', fields: [{ type: 'static', label: '', value: function () { return picked.length ? picked.length + ' entit' + (picked.length === 1 ? 'y' : 'ies') + ' selected' : 'Click the lines, arcs or polyline to fit'; } }] },
        { title: 'Parameters', fields: [
          { type: 'check', label: 'Closed spline', key: 'closed' },
          { type: 'radio', key: 'mode', options: [['delete', 'Delete geometry'], ['constrained', 'Constrained'], ['unconstrained', 'Unconstrained']] },
          { type: 'number', label: 'Tolerance', key: 'tol', unit: 'u', min: 0 }] }
      ],
      onOK: function (vals) {
        if (!picked.length) { UI.toast('Select the lines, arcs or polyline to fit.'); return false; }
        var r = undoStep(function (g) { return fitSpline(g, picked, { tol: +vals.tol, closed: !!vals.closed, mode: vals.mode }); });
        if (!r.ok) { UI.toast(r.error); return false; }
        if (UI.setSelection) UI.setSelection([]);
        App.sel = null;
        UI.setStatus('Fit Spline: a spline through ' + r.points + ' points, within ' + fmt(r.dev, 4) + ' of the geometry.');
      }
    });
  };

  // ------------------------------------------------------------------ Insert Spline Point, Simplify, Relax
  // Insert Spline Point: the point clicked on a spline becomes one of its points and the curve keeps its shape exactly
  // (the point and its neighbours become tangent-driving with the curve's own tangents and speeds, as Split Entities
  // keeps a cut spline: SketchSolver.freeSplit's pieces put back together).
  function insertSplinePointAt(f, i, uv) {
    var S = SS(), e = f.entities[i];
    if (!isPlainSpline(e)) return { ok: false, error: 'Insert Spline Point works on splines.' };
    var fc = S.freeCurve(e), c = fc && S.freeClosest(fc, uv);
    if (!c) return { ok: false, error: 'Click on the spline.' };
    var tmp = { entities: [JSON.parse(JSON.stringify(e))] }, r;
    if (e.closed) return insertClosedPoint(f, i, e, fc, c);
    if (c.t <= fc.t0 + 1e-6 * (fc.t1 - fc.t0) || c.t >= fc.t1 - 1e-6 * (fc.t1 - fc.t0)) return { ok: false, error: 'Click inside the spline, away from its ends.' };
    // the point lands on an existing spline point: nothing to insert
    for (var k = 0; k < e.pts.length; k++) if (dist2(e.pts[k], c.p) < tolOf(c.p) * 10) return { ok: false, error: 'There is a spline point there already.' };
    r = S.freeSplit(tmp, 0, [c.p]);
    if (!r.ok) return r;
    var A = tmp.entities[0], B = tmp.entities[1];
    if (!A || !B || A.t !== 'spline' || B.t !== 'spline') return { ok: false, error: 'That spline could not take a point there.' };
    var nA = A.pts.length, pts = A.pts.concat(B.pts.slice(1)), tA = A.tans || [], tB = B.tans || [], tans = [];
    for (k = 0; k < nA - 1; k++) tans.push(tA[k] || null);
    var cutA = tA[nA - 1], cutB = tB[0], cut = cutB || cutA || null;
    if (cutA && cutB && Math.abs(+cutA[1] - +cutB[1]) > 1e-12) cut = [cutB[0], cutB[1], cutA[2] != null ? cutA[2] : cutA[1]];
    tans.push(cut);
    for (k = 1; k < B.pts.length; k++) tans.push(tB[k] || null);
    var ne = JSON.parse(JSON.stringify(e));
    ne.pts = pts;
    if (tans.some(Boolean)) ne.tans = tans; else delete ne.tans;
    f.entities[i] = ne;
    remapSplineRefs(f, i, nA - 1, true);
    S.solve(f);
    return { ok: true, at: nA - 1 };
  }
  // rfAW: a closed spline takes a point as an open one does. It is split at the click and at the spline point half way
  // round (two exact pieces, SketchSolver.freeSplit), the pieces are put back together as one closed spline starting at
  // its old first point, and every point but the new one and its two neighbours gets its own tangent back (the far cut
  // was at a spline point, so the curve there is the original's: only the span clicked changes its parameterisation).
  function insertClosedPoint(f, i, e, fc, c) {
    var S = SS(), n = e.pts.length, k, tol = tolOf(c.p);
    for (k = 0; k < n; k++) if (dist2(e.pts[k], c.p) < tol * 10) return { ok: false, error: 'There is a spline point there already.' };
    var span = Math.floor(((c.t % n) + n) % n + 1e-12) % n, far = (span + 1 + Math.floor(n / 2)) % n;
    var tmp = { entities: [JSON.parse(JSON.stringify(e))] }, r = S.freeSplit(tmp, 0, [c.p, e.pts[far]]);
    if (!r.ok) return r;
    var A = tmp.entities[0], B = tmp.entities[1];
    if (!A || !B || A.t !== 'spline' || B.t !== 'spline') return { ok: false, error: 'That spline could not take a point there.' };
    var tA = A.tans || [], tB = B.tans || [];
    function join(endT, startT) { if (!endT && !startT) return null; var t = startT || endT; return startT && endT && Math.abs(+endT[1] - +startT[1]) > 1e-12 ? [startT[0], startT[1], endT[2] != null ? endT[2] : endT[1]] : [t[0], t[1]].concat(t.length > 2 ? [t[2]] : []); }
    // the loop A then B: A's first point (where B ends) and B's first point (where A ends) are each one point
    var pts = A.pts.concat(B.pts.slice(1, -1)), tans = [];
    tans.push(join(tB[B.pts.length - 1], tA[0]));
    for (k = 1; k < A.pts.length - 1; k++) tans.push(tA[k] || null);
    tans.push(join(tA[A.pts.length - 1], tB[0]));
    for (k = 1; k < B.pts.length - 1; k++) tans.push(tB[k] || null);
    if (pts.length !== n + 1) return { ok: false, error: 'That spline could not take a point there.' };
    // start the loop at the old first point; the new point goes in after point `span`
    var s0 = -1;
    for (k = 0; k <= n; k++) if (dist2(pts[k], e.pts[0]) < tolOf(e.pts[0]) * 10) { s0 = k; break; }
    if (s0 < 0) return { ok: false, error: 'That spline could not take a point there.' };
    pts = pts.slice(s0).concat(pts.slice(0, s0)); tans = tans.slice(s0).concat(tans.slice(0, s0));
    var at = span + 1;
    if (dist2(pts[at], c.p) > tol * 10) return { ok: false, error: 'That spline could not take a point there.' };
    for (k = 0; k < n; k++) {
      if (k === span || k === (span + 1) % n) continue;
      var j = k <= span ? k : k + 1;
      if (dist2(pts[j], e.pts[k]) > tolOf(e.pts[k]) * 10) return { ok: false, error: 'That spline could not take a point there.' };
      tans[j] = e.tans && e.tans[k] ? JSON.parse(JSON.stringify(e.tans[k])) : null;
    }
    var ne = JSON.parse(JSON.stringify(e));
    ne.pts = pts.map(function (q) { return [q[0], q[1]]; });
    if (tans.some(Boolean)) ne.tans = tans; else delete ne.tans;
    f.entities[i] = ne;
    remapSplineRefs(f, i, at, true);
    S.solve(f);
    return { ok: true, at: at };
  }
  UI.insertSplinePointAt = insertSplinePointAt;   // test hook (f, i, uv)
  UI.cmdInsertSplinePoint = function () {
    var f = UI.activeSketchFeature();
    if (App.mode !== 'sketch' || !f) { UI.toast('Open a sketch first.'); return; }
    if (App.tool !== 'select') UI.setTool('select');
    var count = 0;
    UI.openPM({
      title: 'Insert Spline Point', icon: 'spline', values: {}, noFocus: true,
      message: 'Click on a spline where the new spline point goes (open or closed). The curve keeps its shape.',
      command: { onSketchPoint: function (uv, mx, my) {
        var hit = UI.pickEntity(mx, my), g = UI.activeSketchFeature(), e = hit && g && g.entities[hit.index];
        if (!isPlainSpline(e)) { UI.setStatus('Click on a spline.'); return; }
        if (!uv) uv = UI.screenToPlane(mx, my, UI.activePlane());
        var r = undoStep(function (h) { return insertSplinePointAt(h, hit.index, uv); });
        if (!r.ok) { UI.toast(r.error); return; }
        count++;
        UI.setStatus('Spline point ' + (r.at + 1) + ' inserted. Click another place, or press ✓ / Esc.');
        UI.renderPM();
      } },
      groups: [{ title: 'Points', fields: [{ type: 'static', label: '', value: function () { return count ? count + ' point' + (count === 1 ? '' : 's') + ' inserted' : 'Click on a spline'; } }] }],
      onOK: function () {}
    });
  };
  // rfAW: Add Tangency Control / Add Curvature Control (a spline's right-click menu, Tools ▸ Spline Tools), as
  // SolidWorks: click on the spline; a spline point is inserted there with the curve's own shape and its tangent made
  // driving (its handle shows), and the Spline PropertyManager opens on it so the handle can be turned and weighted.
  // Add Curvature Control does the same, turns the curvature comb on for that spline and gives the point a driving
  // curvature (rfAY: tans[i][3], Kernel.splineGeom's curvature fit), the one the curve had there: the PropertyManager's
  // Radius of curvature / Curvature then change it, and the curve keeps that curvature on both sides of the point.
  function cmdSplineControl(kind) {
    var f = UI.activeSketchFeature();
    if (App.mode !== 'sketch' || !f) { UI.toast('Open a sketch first.'); return; }
    if (App.tool !== 'select') UI.setTool('select');
    var title = kind === 'curv' ? 'Add Curvature Control' : 'Add Tangency Control';
    UI.openPM({
      title: title, icon: 'spline', values: {}, noFocus: true,
      message: 'Click on a spline where the ' + (kind === 'curv' ? 'curvature' : 'tangency') + ' control goes.',
      command: { onSketchPoint: function (uv, mx, my) {
        var hit = UI.pickEntity(mx, my), g = UI.activeSketchFeature(), e = hit && g && g.entities[hit.index];
        if (!isPlainSpline(e)) { UI.setStatus('Click on a spline.'); return; }
        if (!uv) uv = UI.screenToPlane(mx, my, UI.activePlane());
        var idx = hit.index;
        var r = undoStep(function (h) {
          var q = insertSplinePointAt(h, idx, uv);
          if (!q.ok) return q;
          var ne = h.entities[idx];
          if (!ne.tans || !ne.tans[q.at]) {   // make sure the new point drives its tangent (the curve's own)
            var fc = SS().freeCurve(ne), d = fc.knotD1(q.at);
            ne.tans = ne.tans || ne.pts.map(function () { return null; });
            ne.tans[q.at] = [clean(Math.atan2(d[1], d[0]) / D2R), 1];
          }
          if (kind === 'curv') { ne.showCurvature = true; setCurvatureControl(ne, q.at, 'on'); }   // rfAY: and its curvature value
          return q;
        });
        if (!r.ok) { UI.toast(r.error); return; }
        var g2 = UI.activeSketchFeature();
        UI.closePM();
        splineSel = { index: idx, pt: r.at };
        openSplinePM(idx, g2.entities[idx], g2);
        UI.setStatus(title.replace('Add ', '') + ' added at spline point ' + (r.at + 1) + (kind === 'curv' ? ': set its Radius of curvature, turn or weight its handle in the PropertyManager.' : ': turn or weight its handle in the PropertyManager.'));
      } },
      groups: [{ title: 'Message', fields: [{ type: 'static', label: '', value: 'Click on a spline' }] }],
      onOK: function () {}
    });
  }
  UI.cmdAddTangencyControl = function () { cmdSplineControl('tan'); };
  UI.cmdAddCurvatureControl = function () { cmdSplineControl('curv'); };
  // Show Inflection Points: where the curve's bend changes side. Per cubic span B(s) the cross product of B' and B'' is
  // a quadratic in s; its simple roots inside the span, and sign changes across a join, are the inflection points.
  function inflections(e) {
    var g = K.splineGeom(e), out = [];
    if (!g) return out;
    function cr(a, b) { return a[0] * b[1] - a[1] * b[0]; }
    var prevSign = 0, prevEnd = null, firstSign = 0;
    g.bez.forEach(function (P, j) {
      var Bv = [3 * (P[1][0] - P[0][0]), 3 * (P[1][1] - P[0][1])], Cv = [3 * (P[2][0] - 2 * P[1][0] + P[0][0]), 3 * (P[2][1] - 2 * P[1][1] + P[0][1])];
      var Dv = [P[3][0] - 3 * P[2][0] + 3 * P[1][0] - P[0][0], P[3][1] - 3 * P[2][1] + 3 * P[1][1] - P[0][1]];
      var a = 6 * cr(Cv, Dv), b = 6 * cr(Bv, Dv), c = 2 * cr(Bv, Cv), sc = Math.max(Math.abs(a), Math.abs(b), Math.abs(c));
      if (!(sc > 1e-14)) { prevEnd = null; return; }
      var gs = function (s) { return (a * s + b) * s + c; }, roots = [];
      if (Math.abs(a) < 1e-12 * sc) { if (Math.abs(b) > 1e-12 * sc) roots.push(-c / b); }
      else { var D = b * b - 4 * a * c; if (D > 1e-18 * sc * sc) { var q = Math.sqrt(D); roots.push((-b - q) / (2 * a), (-b + q) / (2 * a)); } }
      var s0 = gs(1e-9);
      if (prevSign && s0 && Math.sign(s0) !== prevSign && prevEnd) out.push(prevEnd);   // the bend changes side at the join
      roots.sort(function (x, y) { return x - y; }).forEach(function (s) { if (s > 1e-7 && s < 1 - 1e-7) out.push(K.bezPoint(P, s)); });
      var s1 = gs(1 - 1e-9);
      prevSign = s1 ? Math.sign(s1) : 0; prevEnd = P[3];
      if (j === 0) firstSign = s0 ? Math.sign(s0) : 0;
    });
    if (e.closed && prevSign && firstSign && prevSign !== firstSign && g.bez.length) out.push(g.bez[0][0]);   // across the seam
    return out;
  }
  UI.splineInflections = inflections;   // test hook: the inflection points of spline e
  UI.cmdShowInflectionPoints = function (index) {
    var f = UI.activeSketchFeature();
    if (App.mode !== 'sketch' || !f) { UI.toast('Open a sketch first.'); return; }
    var sel = index != null ? [index] : selectedEntities(f).filter(function (i) { return f.entities[i].t === 'spline'; });
    if (!sel.length) { UI.toast('Select a spline first, then Show Inflection Points.'); return; }
    var on = !sel.every(function (i) { return f.entities[i].showInflection; }), n = 0;
    undoStep(function (g) { sel.forEach(function (i) { if (on) g.entities[i].showInflection = true; else delete g.entities[i].showInflection; if (on) n += inflections(g.entities[i]).length; }); return { ok: true }; });
    combSig = null;
    UI.setStatus(on ? n + ' inflection point' + (n === 1 ? '' : 's') + ' shown.' : 'Inflection points hidden.');
  };
  // the most a spline e strays from the reference curve samples ref (points along the original)
  function devFrom(e, ref) {
    var S = SS(), fc = S.freeCurve(e), m = 0;
    if (!fc) return Infinity;
    ref.forEach(function (p) { m = Math.max(m, S.freeClosest(fc, p).d); });
    return m;
  }
  function curveSamples(e, per) {
    var g = K.splineGeom(e), out = [];
    if (!g) return out;
    g.bez.forEach(function (B) { for (var k = 0; k < per; k++) out.push(K.bezPoint(B, k / per)); });
    if (!g.closed) out.push(K.bezPoint(g.bez[g.bez.length - 1], 1));
    return out;
  }
  // Simplify Spline: fewer points, the curve within tol of the original (interior points dropped one at a time, the one
  // that changes the curve least first). smoothing: tangent-driving goes from the points kept, as SolidWorks' Smoothing.
  function simplifySpline(e, tol, smoothing) {
    var ref = curveSamples(e, 16), cur = JSON.parse(JSON.stringify(e)), min = e.closed ? 3 : 2;
    if (smoothing) { delete cur.tans; delete cur.local; }
    for (var guard = 0; guard < 400 && cur.pts.length > min; guard++) {
      var best = null, bd = Infinity;
      for (var k = e.closed ? 0 : 1; k < cur.pts.length - (e.closed ? 0 : 1); k++) {
        var c = JSON.parse(JSON.stringify(cur));
        c.pts.splice(k, 1);
        if (c.tans) { c.tans.splice(k, 1); if (!c.tans.some(Boolean)) delete c.tans; }
        var d = devFrom(c, ref);
        if (d < bd) { bd = d; best = c; }
      }
      if (!best || bd > tol) break;
      cur = best;
    }
    return { e: cur, dev: devFrom(cur, ref) };
  }
  UI.simplifySpline = simplifySpline;   // test hook (e, tol, smoothing) -> { e, dev }
  // Relax Spline: the spline smooths out to the natural C2 curve through its points (tangent-driving off and internal
  // continuity on at its inner points; tangents on its ends stay)
  function relaxSpline(e) {
    delete e.local;
    if (e.tans) { for (var k = 0; k < e.tans.length; k++) if (e.closed || (k > 0 && k < e.pts.length - 1)) e.tans[k] = null; if (!e.tans.some(Boolean)) delete e.tans; }
    return e;
  }
  UI.relaxSpline = relaxSpline;
  function splineTarget(f) {
    var sel = selectedEntities(f).filter(function (i) { return isPlainSpline(f.entities[i]); });
    if (sel.length) return sel[0];
    var spec = UI.pmSpec && UI.pmSpec();
    if (spec && spec._skEntity && spec._skEntity.t === 'spline' && isPlainSpline(f.entities[spec._skEntity.index])) return spec._skEntity.index;
    return -1;
  }
  UI.cmdSimplifySpline = function (index) {
    var f = UI.activeSketchFeature();
    if (App.mode !== 'sketch' || !f) { UI.toast('Open a sketch first.'); return; }
    var i = index != null ? index : splineTarget(f);
    if (i < 0 || !isPlainSpline(f.entities[i])) { UI.toast('Select a spline first, then Simplify Spline.'); return; }
    var orig = JSON.parse(JSON.stringify(f.entities[i])), diag = 0;
    orig.pts.forEach(function (p) { diag = Math.max(diag, dist2(p, orig.pts[0])); });
    var v = { tol: clean(+(diag * 0.002).toPrecision(2)) || 0.01, smoothing: false }, pushed = false;
    function apply() {
      var g = UI.activeSketchFeature();
      if (!g) return;
      if (!pushed) { UI.pushUndo(); App.sketchDirty = true; pushed = true; }
      var r = simplifySpline(orig, +v.tol > 0 ? +v.tol : 0, !!v.smoothing);
      g.entities[i] = r.e;
      v.pts = r.e.pts.length; v.dev = r.dev;
      if (SS()) { SS().clean(g); SS().solve(g); }
      refreshAll();
    }
    v.pts = orig.pts.length; v.dev = 0;
    UI.openPM({
      title: 'Simplify Spline', icon: 'spline', values: v, noFocus: true,
      message: 'Fewer spline points, the curve within the tolerance of the original.',
      groups: [{ title: 'Parameters', fields: [
        { type: 'static', label: 'Number of points', value: function () { return orig.pts.length + ' → ' + v.pts; } },
        { type: 'number', label: 'Tolerance', key: 'tol', unit: 'u', min: 0 },
        { type: 'check', label: 'Smoothing', key: 'smoothing' },
        { type: 'static', label: 'Deviation', value: function () { return fmt(v.dev || 0, 4); } }] }],
      onChange: function (vals, key) { if (key === 'tol' || key === 'smoothing') { v.tol = vals.tol; v.smoothing = vals.smoothing; apply(); UI.renderPM(); } },
      onOK: function () {},
      onCancel: function () { var g = UI.activeSketchFeature(); if (g && pushed) { g.entities[i] = orig; refreshAll(); } }
    });
    apply();
    UI.renderPM();
  };
  UI.cmdRelaxSpline = function (index) {
    var f = UI.activeSketchFeature();
    if (App.mode !== 'sketch' || !f) { UI.toast('Open a sketch first.'); return; }
    var i = index != null ? index : splineTarget(f);
    if (i < 0) { UI.toast('Select a spline first, then Relax Spline.'); return; }
    undoStep(function (g) { relaxSpline(g.entities[i]); SS().solve(g); return { ok: true }; });
    UI.setStatus('Spline relaxed: its inner points are no longer tangent-driving.');
  };
  // Show Spline Handles (every spline of the active sketch shows its tangent handles) and Show Curvature (the comb on
  // the selected splines, Scale / Density in its PropertyManager)
  var splineView = { handles: false, combScale: 1, combDensity: 24 };
  UI.splineView = splineView;
  UI.cmdShowSplineHandles = function () { splineView.handles = !splineView.handles; combSig = null; try { updateComb(); } catch (err) { /* */ } UI.setStatus('Spline handles ' + (splineView.handles ? 'shown.' : 'hidden.')); };
  UI.cmdShowCurvature = function (index) {
    var f = UI.activeSketchFeature();
    if (App.mode !== 'sketch' || !f) { UI.toast('Open a sketch first.'); return; }
    var sel = index != null ? [index] : selectedEntities(f).filter(function (i) { var e = f.entities[i]; return e.t === 'spline'; });
    if (!sel.length) { UI.toast('Select a spline first, then Show Curvature.'); return; }
    var on = !sel.every(function (i) { return f.entities[i].showCurvature; });
    undoStep(function (g) { sel.forEach(function (i) { if (on) g.entities[i].showCurvature = true; else delete g.entities[i].showCurvature; }); return { ok: true }; });
    var v = { scale: splineView.combScale, density: splineView.combDensity };
    if (!on) return;
    UI.openPM({
      title: 'Curvature Comb', icon: 'spline', values: v, noFocus: true, keepSelection: true,
      message: 'The curvature comb of the selected splines: Scale sets the length of its teeth, Density how many there are.',
      groups: [{ title: 'Curvature Comb', fields: [{ type: 'number', label: 'Scale', key: 'scale', min: 0.05 }, { type: 'number', label: 'Density', key: 'density', step: 1, min: 4 }] }],
      onChange: function (vals) { if (+vals.scale > 0) splineView.combScale = +vals.scale; if (+vals.density >= 4) splineView.combDensity = Math.min(200, Math.round(+vals.density)); combSig = null; },
      onOK: function () {}
    });
  };
  // the spline's right-click rows (ui-panels.js sketchMenuItems)
  UI.splineMenuItems = function (f, i) {
    var e = f && f.entities[i];
    if (!e || e.t !== 'spline') return [];
    var out = [{ sep: true }];
    if (isPlainSpline(e)) {
      out.push({ label: 'Insert Spline Point', icon: 'spline', action: function () { UI.cmdInsertSplinePoint(); } });
      out.push({ label: 'Simplify Spline…', icon: 'spline', action: function () { UI.cmdSimplifySpline(i); } });
      out.push({ label: 'Relax Spline', icon: 'spline', action: function () { UI.cmdRelaxSpline(i); } });
    }
    if (isPlainSpline(e)) {   // rfAW
      out.push({ label: 'Add Tangency Control', icon: 'spline', action: function () { UI.cmdAddTangencyControl(); } });
      out.push({ label: 'Add Curvature Control', icon: 'spline', action: function () { UI.cmdAddCurvatureControl(); } });
    }
    out.push({ label: 'Show Inflection Points', icon: 'spline', checked: !!e.showInflection, action: function () { UI.cmdShowInflectionPoints(i); } });
    out.push({ label: 'Show Spline Handles', icon: 'spline', checked: splineView.handles, action: function () { UI.cmdShowSplineHandles(); } });
    out.push({ label: 'Show Curvature', icon: 'spline', checked: !!e.showCurvature, action: function () { UI.cmdShowCurvature(i); } });
    return out;
  };

  // ------------------------------------------------------------------ Parabola and Conic (Ellipse flyout)
  // Parabola: click the focus, then the apex (the vertex: the parabola opens towards the focus), then the start point
  // and the end point (each lands on the parabola, square across its axis from where it is clicked). Conic: the start
  // point, the end point, the top vertex (where the end tangents meet), then a point that sets rho (its place along
  // the line from the chord's middle to the top vertex). Both are { t: 'spline', pts: [start, shoulder, end],
  // conic: rho, parabola? } (Kernel.splineGeom: the rational quadratic curve), so they snap, take relations,
  // dimension, trim and export as splines do.
  function parabolaFrame(F, V) {
    var f = dist2(F, V);
    if (f < 1e-12) return null;
    var ay = [(F[0] - V[0]) / f, (F[1] - V[1]) / f], ax = [ay[1], -ay[0]];
    return { V: V, f: f, ax: ax, ay: ay, at: function (x) { var y = x * x / (4 * f); return [V[0] + ax[0] * x + ay[0] * y, V[1] + ax[1] * x + ay[1] * y]; },
      xOf: function (p) { return (p[0] - V[0]) * ax[0] + (p[1] - V[1]) * ax[1]; } };
  }
  function parabolaEntity(F, V, x1, x2) {
    var fr = parabolaFrame(F, V);
    if (!fr || Math.abs(x2 - x1) < 1e-9 * Math.max(1, fr.f)) return null;
    var P0 = fr.at(x1), P2 = fr.at(x2), S = fr.at((x1 + x2) / 2);
    return { t: 'spline', pts: [P0, S, P2].map(function (p) { return [clean(p[0]), clean(p[1])]; }), conic: 0.5, parabola: true };
  }
  function conicEntity(P0, P2, T, rho) {
    if (!(rho > 0 && rho < 1)) return null;
    var M = [(P0[0] + P2[0]) / 2, (P0[1] + P2[1]) / 2], S = [M[0] + rho * (T[0] - M[0]), M[1] + rho * (T[1] - M[1])];
    if (dist2(P0, P2) < 1e-12 || dist2(M, T) < 1e-12) return null;
    return { t: 'spline', pts: [P0, S, P2].map(function (p) { return [clean(p[0]), clean(p[1])]; }), conic: clean(rho) };
  }
  function rhoFrom(P0, P2, T, q) {
    var M = [(P0[0] + P2[0]) / 2, (P0[1] + P2[1]) / 2], d = [T[0] - M[0], T[1] - M[1]], l2 = d[0] * d[0] + d[1] * d[1];
    if (!(l2 > 0)) return 0.5;
    var r = ((q[0] - M[0]) * d[0] + (q[1] - M[1]) * d[1]) / l2;
    return Math.max(0.01, Math.min(0.99, Math.round(r * 1000) / 1000));
  }
  UI.parabolaEntity = parabolaEntity; UI.conicEntity = conicEntity;   // test hooks
  function watchConic(tool) {
    var f = UI.activeSketchFeature(), n0 = f ? f.entities.length : 0;
    setTimeout(function () { var e = f && f.entities[n0]; if (e && e.t === 'spline' && e.conic != null) madeEntity(tool, n0); }, 0);
  }
  UI.sketchFreeHooks.parabola = {
    steps: function () { return 4; },
    entities: function (all) {
      var fr = all.length >= 2 ? parabolaFrame(all[0], all[1]) : null;
      if (!fr) return [];
      var out;
      if (all.length === 2) out = parabolaEntity(all[0], all[1], -2 * fr.f, 2 * fr.f);
      else if (all.length === 3) { var x = Math.abs(fr.xOf(all[2])) || fr.f; out = parabolaEntity(all[0], all[1], -x, x); }
      else out = parabolaEntity(all[0], all[1], fr.xOf(all[2]), fr.xOf(all[3]));
      var res = out ? [out] : [];
      if (all.length < 4 && out) out.construction = true;
      if (all.length < 4) res.push({ t: 'line', x1: all[0][0], y1: all[0][1], x2: all[1][0], y2: all[1][1], construction: true });
      return all.length === 4 ? (out ? [out] : []) : res;
    },
    click: function (p, st) {
      if (st.pts.length === 3) {
        var fr = parabolaFrame(st.pts[0], st.pts[1]);
        if (!fr || Math.abs(fr.xOf(p) - fr.xOf(st.pts[2])) < 1e-9) { UI.setStatus('Click the end point away from the start point.'); return true; }
        watchConic('parabola');
      }
      return false;
    },
    noOwnSnap: function (st) { return st.pts.length >= 2; },
    readout: function (pts, p, n) { return pts.length === 1 ? 'f ' + n(dist2(pts[0], p), 2) : ''; }
  };
  UI.sketchFreeHooks.conic = {
    steps: function () { return 4; },
    entities: function (all) {
      if (all.length < 2) return [];
      if (all.length === 2) return [{ t: 'line', x1: all[0][0], y1: all[0][1], x2: all[1][0], y2: all[1][1], construction: true }];
      var rho = all.length === 4 ? rhoFrom(all[0], all[1], all[2], all[3]) : 0.5, e = conicEntity(all[0], all[1], all[2], rho);
      var out = e ? [e] : [];
      if (all.length === 3 || all.length === 4) out.push({ t: 'polyline', pts: [all[0].slice(), all[2].slice(), all[1].slice()], closed: false, construction: true });
      return all.length === 4 && e ? [e] : out;
    },
    click: function (p, st) { if (st.pts.length === 3) watchConic('conic'); return false; },
    noOwnSnap: function (st) { return st.pts.length >= 3; },
    readout: function (pts, p, n) { return pts.length === 3 ? 'ρ ' + n(rhoFrom(pts[0], pts[1], pts[2], p), 3) : ''; }
  };
  // the Conic / Parabola fields of its PropertyManager and their values
  function conicFields(e) {
    var u = 'u', f = [
      { type: 'number', label: 'Start X', key: 'x1', unit: u }, { type: 'number', label: 'Start Y', key: 'y1', unit: u },
      { type: 'number', label: 'End X', key: 'x2', unit: u }, { type: 'number', label: 'End Y', key: 'y2', unit: u },
      { type: 'number', label: 'Top vertex X', key: 'tx', unit: u }, { type: 'number', label: 'Top vertex Y', key: 'ty', unit: u }];
    if (e.parabola) f.push({ type: 'static', label: 'Rho', value: '0.5 (parabola)' });
    else f.push({ type: 'number', label: 'Rho', key: 'rho', min: 0.01, max: 0.99, step: 0.05 });
    return f;
  }
  function conicValues(e, v) {
    var c = K.conicData(e);
    if (!c) return v;
    v.x1 = clean(c.P0[0]); v.y1 = clean(c.P0[1]); v.x2 = clean(c.P2[0]); v.y2 = clean(c.P2[1]); v.tx = clean(c.T[0]); v.ty = clean(c.T[1]); v.rho = c.rho;
    v.construction = !!e.construction;
    return v;
  }
  function applyConic(f, index, e, v) {
    var rho = e.parabola ? 0.5 : +v.rho;
    if (!(rho > 0 && rho < 1)) { UI.setStatus('Rho is between 0 and 1 (0.5 is a parabola, below an ellipse, above a hyperbola).'); return; }
    var n = conicEntity([+v.x1, +v.y1], [+v.x2, +v.y2], [+v.tx, +v.ty], rho);
    if (!n) { UI.setStatus('Those values make no conic.'); return; }
    markDirty();
    e.pts = n.pts; e.conic = n.conic;
    solveAfterEdit(f, index);
    refresh();
  }
  function openConicPM(index, e, f) {
    var v = conicValues(e, {});
    UI.openPM({
      title: e.parabola ? 'Parabola' : 'Conic', icon: e.parabola ? 'parabola' : 'conic', values: v, noFocus: true, _skEntity: { index: index, t: 'spline' },
      groups: relationGroups(f, index, [String(index)]).concat([
        { title: 'Options', fields: [{ type: 'check', label: 'For construction', key: 'construction' }] },
        { title: 'Parameters', fields: conicFields(e) }]),
      onChange: function (vals, key) {
        if (!key) return;
        if (key === 'construction') { markDirty(); if (vals.construction) e.construction = true; else delete e.construction; refresh(); return; }
        applyConic(f, index, e, vals);
      },
      onOK: function () { App.sel = null; UI.updateSketches(); }
    });
  }
  UI.setConicRho = function (index, rho) {   // script / test hook
    var f = UI.activeSketchFeature(), e = f && f.entities[index], c = e && K.conicData(e);
    if (!c) return false;
    var v = conicValues(e, {}); v.rho = rho;
    applyConic(f, index, e, v);
    return true;
  };

  // ------------------------------------------------------------------ command search (Search Commands box)
  document.addEventListener('keydown', function (ev) {
    var t = ev.target;
    if (ev.key !== 'Enter' || !t || t.id !== 'cmd-search') return;
    var q = String(t.value || '').toLowerCase(), tool = /parabola/.test(q) ? 'parabola' : /conic/.test(q) ? 'conic' : /fit\s*spline/.test(q) ? 'fit' : /partial\s*ellipse|elliptical\s*arc/.test(q) ? 'pellipse' : /ellipse/.test(q) ? 'ellipse' : /style\s*spline|b[eé]zier/.test(q) ? 'styleSpline' : /spline/.test(q) ? 'spline' : null;
    if (!tool) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    t.value = ''; t.blur();
    if (App.mode !== 'sketch') { UI.toast('Open a sketch first: ' + NAMES[tool] + ' is a sketch tool.'); return; }
    if (tool === 'fit') { UI.cmdFitSpline(); return; }
    UI.setTool(tool);
  }, true);
})();
