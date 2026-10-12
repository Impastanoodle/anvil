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
    ellipse: 'Click the center, then the end of the major axis, then a point for the minor axis.',
    pellipse: 'Click the center, then the end of the major axis, then the start point (it sets the minor axis); move round the ellipse and click the end point.'
  };
  var NAMES = { spline: 'Spline', ellipse: 'Ellipse', pellipse: 'Partial Ellipse' };
  // the options the tool PropertyManagers keep for the next entity (per session)
  var toolOpts = { spline: { construction: false, curv: false, cont: true }, ellipse: { construction: false }, pellipse: { construction: false } };
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
    return e && (e.t === tool || (tool !== 'spline' && /ellipse$/.test(e.t))) ? { f: f, e: e, index: toolLast.index } : null;
  }
  function openToolPM(tool) {
    var o = toolOpts[tool], made = lastMade(tool), groups = [];
    App.drawConstruction = !!o.construction;
    var values = { construction: !!o.construction, curv: !!o.curv, cont: o.cont !== false };
    var optFields = [{ type: 'check', label: 'For construction', key: 'construction' }];
    if (tool === 'spline') optFields.push({ type: 'check', label: 'Show curvature', key: 'curv' }, { type: 'check', label: 'Maintain internal continuity', key: 'cont' });
    groups.push({ title: 'Options', fields: optFields });
    if (made && tool === 'spline') groups.push({ title: 'Parameters', fields: [{ type: 'static', label: 'Number of points', value: made.e.pts.length + (made.e.closed ? ' (closed)' : '') }] });
    else if (made) { var ef = ellipseFields(made.e); groups.push({ title: 'Parameters', fields: ef }); ellipseValues(made.e, values); }
    else groups.push({ title: 'Parameters', fields: [{ type: 'static', label: '', value: tool === 'spline' ? 'Place the first point.' : 'Click the center.' }] });
    UI.openPM({
      // sketchTool (rfA): the PM closes when the tool is put down (Esc), as Insert Line's does; it stayed open over the
      // Select tool
      title: tool === 'spline' ? 'Spline' : 'Ellipse', icon: tool, values: values, _skTool: tool, sketchTool: tool, keepSelection: true, noFocus: true,
      message: HINTS[tool],
      groups: groups,
      onChange: function (v, key) {
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
        if (m3 && key) applyEllipse(m3.f, m3.index, m3.e, v);
      },
      onOK: function () { if (App.tool === tool) UI.cancelTool(); },
      onCancel: function () { if (App.tool === tool) UI.cancelTool(); }
    });
    setHint(tool);
  }
  ['spline', 'ellipse', 'pellipse'].forEach(function (tool) {
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
          } else {
            // turning Tangent Driving on keeps the curve as it is: the tangent it has now becomes the driving one
            if (key === 'tan') { var cur = tangentAt(e, i); if (cur) { vals.ta = cur.ang; vals.tw = cur.w; } }
            if (!(+vals.tw > 0) || !isFinite(+vals.ta)) { UI.setStatus('Tangent Weighting must be greater than zero.'); return; }
            if (!e.tans) e.tans = e.pts.map(function () { return null; });
            while (e.tans.length < e.pts.length) e.tans.push(null);
            e.tans[i] = [+vals.ta, +vals.tw];
            if (key === 'tan') setTimeout(function () { if (UI.renderPM) UI.renderPM(); }, 0);
          }
        }
        refresh();
      },
      onOK: function () { App.sel = null; UI.updateSketches(); }
    });
  }
  UI.sketchEntityPMs.spline = openSplinePM;
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
        if (e.t === 'spline' && spec._skEntity) splineValues(e, v);
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
  var combGroup = null, combSig = null, combMat = null, markMat = null;
  function combLines(e) {
    var g = K.splineGeom(e), segs = [], env = [];
    if (!g) return segs;
    var samples = [], diag = 0, kmax = 0, xs = e.pts.map(function (p) { return p[0]; }), ys = e.pts.map(function (p) { return p[1]; });
    diag = Math.hypot(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys)) || 1;
    g.bez.forEach(function (B) {
      for (var k = 0; k <= 24; k++) {
        var s = k / 24, u = 1 - s, p = K.bezPoint(B, s);
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
    var scale = 0.2 * diag / kmax;
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
    var list = f ? f.entities.map(function (e, i) { return e && e.t === 'spline' && (e.showCurvature || i === mark) ? i : -1; }).filter(function (i) { return i >= 0; }) : [];
    var sig = list.length ? JSON.stringify([f.id, App.activeSketch, list.map(function (i) { return f.entities[i]; }), mark, mark != null ? splineSel.pt : null, UI.cam ? UI.cam.scale : 0]) : '';
    if (sig === combSig) return;
    combSig = sig;
    if (!combGroup) { combGroup = new THREE.Group(); combGroup.renderOrder = 12; UI.scene.add(combGroup); }
    while (combGroup.children.length) { var c = combGroup.children.pop(); if (c.geometry) c.geometry.dispose(); }
    if (list.length) {
      var pl = UI.activePlane(), pos = [], mpos = [];
      var push = function (arr, a, b) { var A = K.to3D(pl, a[0], a[1]), B = K.to3D(pl, b[0], b[1]); arr.push(A[0], A[1], A[2], B[0], B[1], B[2]); };
      list.forEach(function (i) {
        var e = f.entities[i];
        if (e.showCurvature) combLines(e).forEach(function (s) { push(pos, s[0], s[1]); });
        if (i === mark && e.pts[splineSel.pt]) {   // the picked spline point: a small square, 4 px a side
          var q = e.pts[splineSel.pt], h = 4 * (UI.cam ? UI.cam.scale : 0.1);
          var sq = [[q[0] - h, q[1] - h], [q[0] + h, q[1] - h], [q[0] + h, q[1] + h], [q[0] - h, q[1] + h]];
          for (var k = 0; k < 4; k++) push(mpos, sq[k], sq[(k + 1) % 4]);
        }
      });
      if (!combMat) { combMat = new THREE.LineBasicMaterial({ color: 0xb03ab8, depthTest: false, transparent: true, opacity: 0.85 }); markMat = new THREE.LineBasicMaterial({ color: 0xe8891c, depthTest: false }); }
      [[pos, combMat], [mpos, markMat]].forEach(function (pm) {
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
  UI.splineComb = function (e) { return combLines(e); };   // test hook: the comb's segments [[p, q], …] of spline e

  // ------------------------------------------------------------------ command search (Search Commands box)
  document.addEventListener('keydown', function (ev) {
    var t = ev.target;
    if (ev.key !== 'Enter' || !t || t.id !== 'cmd-search') return;
    var q = String(t.value || '').toLowerCase(), tool = /partial\s*ellipse|elliptical\s*arc/.test(q) ? 'pellipse' : /ellipse/.test(q) ? 'ellipse' : /spline/.test(q) ? 'spline' : null;
    if (!tool) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    t.value = ''; t.blur();
    if (App.mode !== 'sketch') { UI.toast('Open a sketch first: ' + NAMES[tool] + ' is a sketch tool.'); return; }
    UI.setTool(tool);
  }, true);
})();
