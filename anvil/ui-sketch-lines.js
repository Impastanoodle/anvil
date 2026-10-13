// ui-sketch-lines.js — Line / Centerline / Midpoint Line / Parallel Line, Rectangle types, Point: their SolidWorks PropertyManagers (on the tool and for a selected entity).
// Registers tool PMs in UI.sketchToolPMs[tool] (opened by setTool in ui-sketch.js); see README *Sketch tab*.
//
// p9-sketchtab. As in SolidWorks 2024:
// - Line, Centerline and Midpoint Line (the Line flyout) open the Insert Line PropertyManager: Message, Orientation (As
//   sketched / Horizontal / Vertical / Angle), Options (For construction, Infinite length, Midpoint line) and, for a set
//   orientation, Parameters (Length, Angle) that drive the next line. Centerline = For construction; Midpoint Line =
//   Midpoint line (the first click is the line's midpoint). A set orientation, a midpoint line or an infinite line is
//   one line per two clicks; As sketched chains as before (ui-sketch.js).
// - A selected line opens Line Properties: Existing Relations, Add Relations, Options, Parameters (Length, Angle) and
//   Additional Parameters (Start / End X, Y, Delta X, Y). A typed value drives the line through the solver with every
//   relation and dimension kept (SketchSolver.driveEntity); one that would over-define the sketch is refused.
// - Every rectangle tool opens the Rectangle PropertyManager: Rectangle Type (Corner, Center, 3 Point Corner, 3 Point
//   Center, Parallelogram; the buttons switch the tool), Add construction lines (From Corners / From Midpoints) and
//   Parameters (the four corners, and the center for the center types): live while drawing, and editable afterwards to
//   drive the rectangle just drawn. 3 Point Corner / 3 Point Center Rectangle and Parallelogram are four lines with
//   Coincident corners, two Parallel and (rectangles) one Perpendicular relation, so Smart Dimension, Sketch Fillet,
//   Trim and DXF treat them as lines.
// - Point: the Point PropertyManager (Parameters X, Y) on the tool and for a selected point, with Existing / Add
//   Relations for a selected point.
// - Parallel Line (Line flyout, UI.cmdParallelLine): Mastercam's Line Parallel as a SolidWorks command PropertyManager
//   (Reference, Placement, Length, Options); see its section below.
(function () {
  'use strict';
  if (typeof UI === 'undefined') return;
  var App = UI.App, $ = UI.$;
  UI.sketchToolPMs = UI.sketchToolPMs || {};
  UI.sketchEntityPMs = UI.sketchEntityPMs || {};
  UI.sketchToolHooks = UI.sketchToolHooks || {};
  function SS() { return window.SketchSolver; }
  function sketch() { return UI.activeSketchFeature ? UI.activeSketchFeature() : null; }
  function clean(v) { return +(+v).toPrecision(12); }
  function markDirty() { if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; } }
  function refresh() { App.dimsStale = true; App.gridStale = true; UI.updateSketches(); if (UI.refreshTree) UI.refreshTree(); if (UI.refreshStatus) UI.refreshStatus(); }
  function hint(html) { var h = $('sketch-hint'); if (h && App.mode === 'sketch') h.innerHTML = html; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var D2R = Math.PI / 180;
  function angDeg(dx, dy) { var a = Math.atan2(dy, dx) / D2R; a = a < 0 ? a + 360 : a; return Math.abs(a - 360) < 1e-9 ? 0 : clean(a); }

  // ------------------------------------------------------------------ PropertyManager helpers
  // Field values written in place (no re-render): the box being typed in keeps its text and the caret.
  function syncFields(vals, skip) {
    var spec = UI.pmSpec && UI.pmSpec(), pm = $('pm');
    if (!spec || !spec.values || !pm) return;
    Object.keys(vals).forEach(function (k) {
      if (k === skip) return;
      spec.values[k] = vals[k];
      var inp = pm.querySelector('input.pm-num[data-key="' + k + '"]');
      if (inp && document.activeElement !== inp) { if (inp.type !== 'number') inp.type = 'number'; inp.value = vals[k] == null ? '' : +(+vals[k]).toPrecision(10); }
      var cb = pm.querySelector('input[type=checkbox][data-key="' + k + '"]');
      if (cb) cb.checked = !!vals[k];
    });
  }
  // a message line under the ✓ / ✗ (an edit that would over-define the sketch); null clears it
  function pmNote(text, ok) {
    var pm = $('pm');
    if (!pm) return;
    var box = pm.querySelector('.pm-msg.sk-lines-msg');
    if (!text) { if (box) box.parentNode.removeChild(box); return; }
    if (!box) {
      box = document.createElement('div');
      box.className = 'pm-msg sk-lines-msg';
      var acts = pm.querySelector('.pm-actions');
      if (acts && acts.nextSibling) pm.insertBefore(box, acts.nextSibling); else pm.appendChild(box);
    }
    box.classList.toggle('ok', !!ok);
    box.textContent = text;
  }
  function refused(msg) { pmNote(msg); UI.setStatus(msg); }

  // Existing Relations / Add Relations for a selection (refs): the dimensions / relations file's groups when it is
  // loaded (UI.sketchRelationGroups), else a list of the relations on these entities with the entity's state, and a
  // button per relation that applies (SketchSolver.applicable).
  var REL_ICON = { horizontal: 'relHorizontal', vertical: 'relVertical', coincident: 'relCoincident', parallel: 'relParallel', perpendicular: 'relPerpendicular', tangent: 'relTangent', concentric: 'relConcentric', equal: 'relEqual', midpoint: 'relMidpoint', symmetric: 'relSymmetric', collinear: 'relCollinear', fix: 'relFix', distance: 'dim', angle: 'dim' };
  function refEntity(r) { var m = /^(\d+)/.exec(String(r)); return m ? +m[1] : -1; }
  function relationGroups(f, refs, reopen) {
    if (UI.sketchRelationGroups) { try { var g = UI.sketchRelationGroups(f, refs); if (g) return g; } catch (e) { /* fall back */ } }
    var S = SS();
    if (!S) return [];
    var ents = refs.map(refEntity), an = null;
    try { an = S.analyze(f); } catch (e) { an = null; }
    var rows = [];
    (f.rels || []).forEach(function (rel, i) {
      if (!rel.refs.some(function (r) { return ents.indexOf(refEntity(r)) >= 0; })) return;
      var st = an && an.rels[i], word = st === 'conflict' ? 'Not Solved' : st === 'redundant' ? 'Over Defining' : st === 'driven' ? 'Driven' : 'Satisfied';
      rows.push('<div class="rel-row" data-rel="' + i + '">' + Icons(REL_ICON[rel.type] || 'relations', 14) + '<span>' + esc(S.describe(f, rel)) + '</span><em>' + word + '</em></div>');
    });
    var est = ents.length === 1 && an && an.entities ? an.entities[ents[0]] : null;
    var stText = est === 'full' ? 'Fully Defined' : est === 'over' || est === 'conflict' ? 'Over Defined' : 'Under Defined';
    var types = [];
    try { types = S.applicable(f, refs); } catch (e) { types = []; }
    return [
      { title: 'Existing Relations', fields: [{ type: 'html', html: '<div class="rel-list sk-existing">' + (rows.join('') || '<div class="rel-empty">None</div>') + '</div><div class="pm-row"><span class="static sk-defined">' + stText + '</span></div>' }] },
      { title: 'Add Relations', fields: types.length ? [{ type: 'buttons', buttons: types.map(function (t) { return { label: S.TYPES[t].name, onclick: function () { addRelation(f, t, refs, reopen); } }; }) }]
        : [{ type: 'static', label: '', value: 'No relation applies to this selection.' }] }
    ];
  }
  function addRelation(f, type, refs, reopen) {
    var S = SS();
    markDirty();
    var r = S.addRelation(f, type, refs);
    if (!r.ok) { UI.toast(r.error); return; }
    refresh();
    var name = S.TYPES[type].name;
    if (r.status === 'conflict') UI.setStatus(name + ' added, but the sketch cannot satisfy it: Over Defined. Delete it in Display/Delete Relations.');
    else if (r.status === 'redundant') UI.setStatus(name + ' added; it repeats what other relations already say: Over Defined.');
    else UI.setStatus(name + ' added. ' + S.STATUS_TEXT[r.analysis.status] + '.');
    if (reopen) reopen();
  }

  // The sketch point (or the origin) at P other than entity `self`'s own: its ref, or null.
  function pointRefAt(f, P, self) {
    var S = SS(), tol = 1e-9 * Math.max(1, Math.abs(P[0]), Math.abs(P[1]));
    if (Math.abs(P[0]) < tol && Math.abs(P[1]) < tol) return 'O';
    for (var j = 0; j < f.entities.length; j++) {
      if (j === self || !f.entities[j]) continue;
      var e = f.entities[j], prs = S.pointRefs(f, j);
      for (var k = 0; k < prs.length; k++) {
        if (/\.mid$/.test(prs[k].ref) || (/\.c$/.test(prs[k].ref) && (e.t === 'rect' || e.t === 'slot'))) continue;
        if (Math.abs(prs[k].pt[0] - P[0]) < tol && Math.abs(prs[k].pt[1] - P[1]) < tol) return prs[k].ref;
      }
    }
    return null;
  }
  // a driving dimension from typed input (as ui-sketch.js typedDims), left out when it would over-define the sketch
  function typedDim(f, d) {
    f.dims = f.dims || [];
    f.dims.push(d);
    if (SS() && SS().overDefines(f, 'dim', f.dims.length - 1)) f.dims.pop();
    if (!f.dims.length) delete f.dims;
    App.dimsStale = true;
  }
  function dimOff() { var s = (UI.cam && UI.cam.scale) || 0.1; return Math.round(14 * s * 1e4) / 1e4; }

  // ------------------------------------------------------------------ Insert Line (Line, Centerline, Midpoint Line)
  // LM: the Insert Line settings. orient 'free' (As sketched) | 'h' | 'v' | 'angle'; length / angle: the Parameters.
  var LM = { orient: 'free', construction: false, infinite: false, midpoint: false, length: null, angle: 0 };
  var pendingLine = null;   // which Line flyout command started the tool: 'centerline' | 'midline'
  UI.lineMode = function () { return App.mode === 'sketch' && App.tool === 'line' ? (LM.midpoint ? 'midline' : LM.construction ? 'centerline' : 'line') : null; };
  UI.lineOptions = function () { return JSON.parse(JSON.stringify(LM)); };
  UI.cmdCenterline = function () {
    if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; }
    if (UI.lineMode() === 'centerline') { UI.setTool('select'); return; }
    pendingLine = 'centerline'; UI.setTool('line');
  };
  UI.cmdMidpointLine = function () {
    if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; }
    if (UI.lineMode() === 'midline') { UI.setTool('select'); return; }
    pendingLine = 'midline'; UI.setTool('line');
  };
  var LINE_HINT = {
    line: null,   // ui-sketch.js TOOL_HINTS.line
    centerline: 'Centerline: click the start and end points. Centerlines are construction geometry: axes for Symmetric relations, not part of the profile.',
    midline: 'Midpoint Line: click the midpoint, then an end; the line is symmetric about the first point (it gets Midpoint where that point lies on a sketch point).'
  };
  function lineHint() {
    var m = UI.lineMode() || 'line';
    if (LINE_HINT[m]) hint(LINE_HINT[m]);
    if (LM.orient !== 'free') hint((m === 'centerline' ? 'Centerline' : m === 'midline' ? 'Midpoint Line' : 'Line') + ' (' + { h: 'Horizontal', v: 'Vertical', angle: 'Angle ' + UI.fmtNum(LM.angle || 0, 2) + '°' }[LM.orient] + (LM.length > 0 ? ', length ' + (UI.fmtLen ? UI.fmtLen(LM.length) : UI.fmtNum(LM.length, 3)) : '') + '): click the ' + (LM.midpoint ? 'midpoint' : 'start') + ', then the side it runs to.');
  }
  // one line per two clicks (no chain): a set orientation, a midpoint line, an infinite line
  function lineSingle() { return !!(LM.midpoint || LM.orient !== 'free' || LM.infinite); }
  // the end of the line from a toward the cursor b under the PropertyManager's orientation and length
  function lineEnd(a, b) {
    if (LM.orient === 'free') return b;
    var u = LM.orient === 'h' ? [1, 0] : LM.orient === 'v' ? [0, 1] : [Math.cos((+LM.angle || 0) * D2R), Math.sin((+LM.angle || 0) * D2R)];
    if (LM.orient === 'angle') { u = [clean(u[0]), clean(u[1])]; }
    var s = (b[0] - a[0]) * u[0] + (b[1] - a[1]) * u[1];
    var t = LM.length > 0 ? (s < 0 ? -1 : 1) * LM.length * (LM.midpoint ? 0.5 : 1) : s;
    return [clean(a[0] + u[0] * t), clean(a[1] + u[1] * t)];
  }
  function specialLine(a, b) {
    var e = lineEnd(a, b), s = LM.midpoint ? [clean(2 * a[0] - e[0]), clean(2 * a[1] - e[1])] : a;
    return { t: 'line', x1: s[0], y1: s[1], x2: e[0], y2: e[1] };
  }
  // sketch-refine: Infinite length makes a true infinite line: the entity keeps the two points clicked (infinite: true)
  // and stands for the whole line through them. The solver treats it as that line (SketchSolver: no end points, only
  // its 2 degrees of freedom), Trim cuts it back to a finite line, profiles and DXF leave it out like construction
  // geometry, and it is drawn right across the graphics area at any zoom: UI.infiniteLinePts(e) gives the points to
  // draw, the line through e's points from fifty view diagonals before the middle of the view to fifty after it (the
  // sketch is redrawn whenever the zoom changes by a third, so it always runs past the edges).
  UI.infiniteLinePts = function (e) {
    var a = [e.x1, e.y1], dx = e.x2 - e.x1, dy = e.y2 - e.y1, L = Math.hypot(dx, dy);
    if (!(L > 1e-15)) return [a, [e.x2, e.y2]];
    var u = [dx / L, dy / L], pl = UI.activePlane ? UI.activePlane() : null, W = (UI.size && UI.size.w) || 800, H = (UI.size && UI.size.h) || 600;
    var c = pl ? UI.screenToPlane(W / 2, H / 2, pl) : null, s = (UI.cam && UI.cam.scale) || 0.1;
    if (!c) c = a;
    var R = 50 * Math.hypot(W, H) * s, t = (c[0] - a[0]) * u[0] + (c[1] - a[1]) * u[1], t0 = t - R, t1 = t + R;
    // a ray (Trim made it: infinite 'p1' / 'p2') starts at its one end point and runs on past the other
    if (e.infinite === 'p2') { t0 = 0; t1 = Math.max(t1, L); }
    else if (e.infinite === 'p1') { t1 = L; t0 = Math.min(t0, 0); }
    return [[a[0] + u[0] * t0, a[1] + u[1] * t0], [a[0] + u[0] * t1, a[1] + u[1] * t1]];
  };
  // rfAT: the Line tool's tangent arc (autotransition: back over the end point and out, or A) uses SolidWorks' intent
  // zones, as the Tangent Arc tool does: the way the cursor leaves the end point (more than 10 px away) picks the arc —
  // along the line / arc: tangent; back over it: reverse tangent; square to it: normal; back within 10 px chooses
  // again. The zone's direction is st.arcDir (ui-sketch.js draws and places the arc leaving that way); the end's own
  // tangent is kept in st.azBase for the point the chain is at.
  function lineArcZone(st, P, Q) {
    var key = P[0] + ',' + P[1];
    if (st.azFor !== key) { st.azFor = key; st.azBase = st.arcDir.slice(); st.azZone = null; }
    var pl = UI.activePlane(), sP = UI.worldToScreen(UI.K.to3D(pl, P[0], P[1])), sQ = UI.worldToScreen(UI.K.to3D(pl, Q[0], Q[1]));
    if (Math.hypot(sQ[0] - sP[0], sQ[1] - sP[1]) < 10) { st.azZone = null; st.arcDir = st.azBase.slice(); return; }
    if (!st.azZone) {
      var t = st.azBase, v = [Q[0] - P[0], Q[1] - P[1]], L = Math.hypot(v[0], v[1]);
      if (!(L > 0)) return;
      var c = (v[0] * t[0] + v[1] * t[1]) / L, left = t[0] * v[1] - t[1] * v[0] >= 0;
      st.azZone = c > 0.5 ? { kind: 'tangent', u: t.slice() } : c < -0.5 ? { kind: 'reverse', u: [-t[0], -t[1]] } : { kind: 'normal', u: left ? [-t[1], t[0]] : [t[1], -t[0]] };
    }
    st.arcDir = st.azZone.u.slice();
  }
  UI.lineArcZone = function () { var st = App.toolState; return st && st.arcMode && st.azZone ? st.azZone.kind : null; };
  UI.sketchToolHooks.line = {
    entities: function (pts, cur, all) {
      var st0 = App.toolState;
      if (st0 && st0.arcMode && st0.arcDir && cur && all.length >= 2 && !lineSingle()) lineArcZone(st0, all[0], all[all.length - 1]);
      if (!lineSingle() || all.length < 2) return null;
      var e = specialLine(all[0], all[1]);
      if (LM.infinite) e.infinite = true;
      return [e];
    },
    single: lineSingle,
    commit: function (ents) {
      var e = ents[0];
      if (!lineSingle() || !e || e.t !== 'line') return false;
      if (Math.hypot(e.x2 - e.x1, e.y2 - e.y1) < 1e-9) { UI.setStatus('That line would have no length: click away from the first point, along the line.'); return true; }
      return false;
    },
    after: function (f, n0, st) {
      var i = n0, e = f.entities[i], S = SS();
      if (!lineSingle() || f.entities.length !== n0 + 1 || !e || e.t !== 'line' || !S) return;
      if (LM.infinite) {
        e.infinite = true;
        // the clicked points that sit on sketch points keep them on the line (point on line)
        (st.pts || []).slice(0, 2).forEach(function (P) {
          var r = pointRefAt(f, P, i);
          if (r) S.addRelation(f, 'coincident', [r, String(i)], { rejectOver: true });
        });
      }
      if (LM.midpoint) {
        var M = [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2], ref = pointRefAt(f, M, i);
        if (ref) S.addRelation(f, 'midpoint', [ref, String(i)], { rejectOver: true });
        else {
          var on = S.onCurveRef(f, i, M, 1e-7 * Math.max(1, Math.abs(M[0]), Math.abs(M[1])));
          if (on) S.addRelation(f, 'coincident', [i + '.mid', on], { rejectOver: true });
        }
      }
      if (LM.midpoint || LM.infinite) refresh();
    },
    // typed L / A in the on-screen box: a midpoint line's L is its whole length
    typedPoint: function (cur, v) {
      var st = App.toolState, a = st.pts[0];
      if (!lineSingle() || !a || st.pts.length !== 1) return null;
      var dx = cur[0] - a[0], dy = cur[1] - a[1], len = v.len != null ? v.len * (LM.midpoint ? 0.5 : 1) : Math.hypot(dx, dy);
      var ang = v.ang != null ? v.ang * D2R : (Math.hypot(dx, dy) > 1e-12 ? Math.atan2(dy, dx) : 0);
      return [clean(a[0] + len * Math.cos(ang)), clean(a[1] + len * Math.sin(ang))];
    },
    liveValues: function (p) {
      var st = App.toolState, a = st.pts[0];
      if (!lineSingle() || !a) return null;
      var e = specialLine(a, p);
      return { len: Math.hypot(e.x2 - e.x1, e.y2 - e.y1), ang: angDeg(e.x2 - e.x1, e.y2 - e.y1) };
    },
    readout: function (pts, p) {
      if (!lineSingle() || !pts[0]) return null;
      var e = specialLine(pts[0], p), inch = UI.unitLabel() === 'in';
      return 'L ' + UI.fmtNum(Math.hypot(e.x2 - e.x1, e.y2 - e.y1), inch ? 3 : 2) + '   A ' + UI.fmtNum(angDeg(e.x2 - e.x1, e.y2 - e.y1), 1) + '°';
    }
  };
  UI.sketchToolPMs.line = function () {
    var m = pendingLine || 'line';
    pendingLine = null;
    LM.construction = m === 'centerline'; LM.midpoint = m === 'midline'; LM.orient = 'free'; LM.infinite = false;
    App.drawConstruction = LM.construction;
    openInsertLine();
    lineHint();
  };
  // the Tangent start box follows the T key (ui-sketch.js setLineTangentStart)
  UI.lineTangentStartChanged = function (on) {
    var pm = $('pm'), box = pm && pm.querySelector('input[data-key="tangentStart"]');
    if (box) box.checked = !!on;
  };
  function openInsertLine() {
    var v = { orient: LM.orient, construction: LM.construction, infinite: LM.infinite, midpoint: LM.midpoint, length: LM.length, angle: LM.angle,
      tangentStart: UI.lineTangentStart ? !!UI.lineTangentStart() : false };
    var m = UI.lineMode() || 'line';
    UI.openPM({
      title: 'Insert Line', icon: m === 'midline' ? 'midline' : m === 'centerline' ? 'centerline' : 'line', sketchTool: 'line', noFocus: true, keepSelection: true, values: v,
      groups: [
        { title: 'Message', fields: [{ type: 'html', html: '<div class="pm-note sk-msg" style="margin:0 0 4px 2px">Edit the settings of the following entities or sketch a new line.</div>' }] },
        { title: 'Orientation', fields: [{ type: 'radio', key: 'orient', rerender: true, options: [['free', 'As sketched'], ['h', 'Horizontal'], ['v', 'Vertical'], ['angle', 'Angle']] }] },
        { title: 'Options', fields: [
          { type: 'check', key: 'construction', label: 'For construction' },
          { type: 'check', key: 'infinite', label: 'Infinite length' },
          { type: 'check', key: 'midpoint', label: 'Midpoint line' },
          { type: 'check', key: 'tangentStart', label: 'Tangent start (T)' }] },
        { title: 'Parameters', show: function (x) { return x.orient !== 'free'; }, fields: [
          { type: 'number', key: 'length', label: 'Length', unit: 'u', min: 0 },
          { type: 'number', key: 'angle', label: 'Angle', unit: '°', show: function (x) { return x.orient === 'angle'; } }] }
      ],
      onChange: function (x, key) {
        if (!key) return;
        if (key === 'tangentStart') { if (UI.setLineTangentStart) UI.setLineTangentStart(!!x.tangentStart); return; }   // ui-sketch.js; T toggles it too
        if (key === 'length') LM.length = x.length > 0 ? +x.length : null;
        else if (key === 'angle') LM.angle = +x.angle || 0;
        else LM[key] = x[key];
        App.drawConstruction = !!LM.construction;
        // a changed option starts the line again (a half-drawn chain would mix the two kinds)
        if (key !== 'length' && key !== 'angle' && App.toolState && App.toolState.pts && App.toolState.pts.length) UI.cancelTool(true);
        if (key === 'construction' || key === 'midpoint') {
          var head = $('pm') && $('pm').querySelector('.pm-head');
          if (head) head.innerHTML = Icons(LM.midpoint ? 'midline' : LM.construction ? 'centerline' : 'line', 20) + '<span>Insert Line</span>';
          UI.refreshRibbon();
        }
        lineHint();
      },
      onOK: function () { if (App.tool === 'line') UI.setTool('select'); },
      onCancel: function () { if (App.tool === 'line') UI.setTool('select'); }
    });
  }

  // ------------------------------------------------------------------ Line Properties (a selected line)
  function lineVals(e) {
    return { construction: !!e.construction, infinite: !!e.infinite, len: clean(Math.hypot(e.x2 - e.x1, e.y2 - e.y1)), ang: angDeg(e.x2 - e.x1, e.y2 - e.y1),
      x1: clean(e.x1), y1: clean(e.y1), x2: clean(e.x2), y2: clean(e.y2), dx: clean(e.x2 - e.x1), dy: clean(e.y2 - e.y1) };
  }
  // Drive line i so that `key` reads val (Length, Angle, Start / End X / Y, Delta X / Y), keeping relations and
  // dimensions. Returns { ok, error }. A driving length dimension on the line is changed instead (SetDim).
  function driveLine(f, i, key, val) {
    var S = SS(), e = f.entities[i];
    if (!e || e.t !== 'line' || !S || !isFinite(val)) return { ok: false, error: 'Not a value.' };
    if (key === 'len') {
      if (!(val > 0)) return { ok: false, error: 'The length must be greater than 0.' };
      var di = (f.dims || []).map(function (d, k) { return d.e === i && d.k === 'len' && !d.driven ? k : -1; }).filter(function (k) { return k >= 0; })[0];
      if (di != null) return S.setDim(f, di, val);
    }
    var eq, guess, n = 1;
    switch (key) {
      case 'x1': case 'y1': case 'x2': case 'y2':
        eq = function (E) { return [E[i][key] - val]; };
        guess = function (E) { E[i][key] = val; };
        break;
      case 'dx': case 'dy': {
        var a = key === 'dx' ? 'x' : 'y';
        eq = function (E) { return [E[i][a + '2'] - E[i][a + '1'] - val]; };
        guess = function (E) { E[i][a + '2'] = E[i][a + '1'] + val; };
        break;
      }
      case 'len':
        eq = function (E) { return [Math.hypot(E[i].x2 - E[i].x1, E[i].y2 - E[i].y1) - val]; };
        guess = function (E) { var L = Math.hypot(E[i].x2 - E[i].x1, E[i].y2 - E[i].y1) || 1; E[i].x2 = E[i].x1 + (E[i].x2 - E[i].x1) * val / L; E[i].y2 = E[i].y1 + (E[i].y2 - E[i].y1) * val / L; };
        break;
      case 'ang': {
        // the line turns about its start keeping its length (else a Horizontal line would take any angle by shrinking to nothing)
        var c = Math.cos(val * D2R), s = Math.sin(val * D2R), L0 = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
        n = 2;
        eq = function (E) { return [-s * (E[i].x2 - E[i].x1) + c * (E[i].y2 - E[i].y1), Math.hypot(E[i].x2 - E[i].x1, E[i].y2 - E[i].y1) - L0]; };
        guess = function (E) { var L = Math.hypot(E[i].x2 - E[i].x1, E[i].y2 - E[i].y1); E[i].x2 = E[i].x1 + L * c; E[i].y2 = E[i].y1 + L * s; };
        break;
      }
      default: return { ok: false, error: 'Unknown value ' + key };
    }
    var saved = JSON.parse(JSON.stringify(f.entities));
    var r = S.driveEntity(f, i, n, eq, { guess: guess });
    if (r.ok && key === 'ang') {
      var e2 = f.entities[i];
      if ((e2.x2 - e2.x1) * Math.cos(val * D2R) + (e2.y2 - e2.y1) * Math.sin(val * D2R) <= 0) {
        saved.forEach(function (o, k) { if (f.entities[k]) Object.keys(o).forEach(function (q) { f.entities[k][q] = o[q]; }); });
        return { ok: false, error: 'That angle would turn the line round: its relations hold it the other way.' };
      }
    }
    return r;
  }
  function openLineProperties(index) {
    var f = sketch(), e = f && f.entities[index];
    if (!e) return;
    var reopen = function () { if (App.mode === 'sketch' && sketch() === f && f.entities[index] && f.entities[index].t === 'line') openLineProperties(index); };
    var num = function (key, label, unit) { return { type: 'number', key: key, label: label, unit: unit || 'u' }; };
    UI.openPM({
      title: 'Line Properties', icon: e.construction ? 'centerline' : 'line', values: lineVals(e), noFocus: true, entityIndex: index,
      groups: relationGroups(f, [String(index)], reopen).concat([
        { title: 'Options', fields: [{ type: 'check', key: 'construction', label: 'For construction' }, { type: 'check', key: 'infinite', label: 'Infinite length' }] },
        { title: 'Parameters', fields: [num('len', 'Length'), num('ang', 'Angle', '°')] },
        { title: 'Additional Parameters', fields: [num('x1', 'Start X'), num('y1', 'Start Y'), num('x2', 'End X'), num('y2', 'End Y'), num('dx', 'Delta X'), num('dy', 'Delta Y')] }
      ]).concat(UI.polygonOf && UI.polygonOf(index, f) && UI.editPolygon ? [   // rfL: a polygon's side: Edit Polygon (its Polygon PM)
        { title: 'Polygon', fields: [{ type: 'buttons', buttons: [{ label: 'Edit Polygon', onclick: function () { UI.editPolygon(index); } }] }] }
      ] : []),
      onChange: function (v, key) {
        if (!key) return;
        var f2 = sketch(), cur = f2 && f2.entities[index];
        if (!cur || cur.t !== 'line') return;
        markDirty();
        if (key === 'construction') { if (v.construction) cur.construction = true; else delete cur.construction; refresh(); pmNote(null); return; }
        if (key === 'infinite') {
          // sketch-refine: the flag only (the line keeps its two points); relations on its ends go with the ends
          if (v.infinite) {
            cur.infinite = true;
            // an end that sat on a point keeps the line through that point (point on line); what else held an end goes
            if (f2.rels) f2.rels = f2.rels.map(function (r) {
              var k = r.refs.indexOf(index + '.p1') >= 0 ? r.refs.indexOf(index + '.p1') : r.refs.indexOf(index + '.p2');
              if (k < 0 && !r.refs.some(function (x) { return x === index + '.mid'; })) return r;
              var other = r.type === 'coincident' && r.refs.length === 2 && k >= 0 ? r.refs[1 - k] : null;
              return other && (other === 'O' || SS().refKind(f2, other) === 'point') ? { type: 'coincident', refs: [other, String(index)] } : null;
            }).filter(function (r) { return r; });
            if (f2.dims) f2.dims = f2.dims.filter(function (d) { return d.e !== index; });
            SS().clean(f2); SS().solve(f2);
          }
          else delete cur.infinite;
          refresh(); syncFields(lineVals(f2.entities[index]), key); pmNote(null);
          return;
        }
        var r = driveLine(f2, index, key, +v[key]);
        if (!r.ok) { refused(r.error); return; }
        pmNote(null);
        refresh();
        syncFields(lineVals(f2.entities[index]), key);
      },
      onOK: function () { App.sel = null; UI.updateSketches(); }
    });
  }
  UI.sketchEntityPMs.line = function (index) { openLineProperties(index); };
  UI.driveSketchLine = function (index, key, val) { var f = sketch(); if (!f) return { ok: false }; markDirty(); var r = driveLine(f, index, key, val); refresh(); return r; };

  // ------------------------------------------------------------------ Rectangle (all five types)
  var RECT_TYPES = [['rect', 'Corner Rectangle', 'rect'], ['crect', 'Center Rectangle', 'crect'], ['rect3', '3 Point Corner Rectangle', 'rect3'], ['crect3', '3 Point Center Rectangle', 'crect3'], ['parallelogram', 'Parallelogram', 'parallelogram']];
  var RECT_HINT = {
    rect: 'Corner Rectangle: click the first corner, then the opposite corner.',
    crect: 'Center Rectangle: click the center, then a corner.',
    rect3: '3 Point Corner Rectangle: click the first corner, the second corner (the first side, at any angle), then a point that sets the height.',
    crect3: '3 Point Center Rectangle: click the center, the midpoint of a side (the angle and half the width), then a point that sets the height.',
    parallelogram: 'Parallelogram: click the first corner, the second corner, then the third; the fourth follows.'
  };
  function isCenter(t) { return t === 'crect' || t === 'crect3'; }
  // RS: the Rectangle settings (remembered per type, as SolidWorks remembers them for the session)
  var RS = { cons: { rect: false, crect: true, rect3: false, crect3: true, parallelogram: false }, fromMid: false };
  var lastRect = null;   // the rectangle just drawn: { tool, i } (a Corner / Center Rectangle entity) or { tool, lines: [4], cons: [], center }
  UI.lastSketchRectangle = function () { return lastRect ? JSON.parse(JSON.stringify(lastRect)) : null; };

  // corners (counter-clockwise from the first click) of a 3 Point / Parallelogram rectangle through points p (3), or
  // null when it would have no width or height
  function rectGeom(tool, p) {
    var A = p[0], B = p[1], C = p[2];
    if (!A || !B || !C) return null;
    var u = [B[0] - A[0], B[1] - A[1]], L = Math.hypot(u[0], u[1]);
    if (L < 1e-9) return null;
    var n = [-u[1] / L, u[0] / L], K;
    if (tool === 'rect3') {
      var h = (C[0] - A[0]) * n[0] + (C[1] - A[1]) * n[1];
      if (Math.abs(h) < 1e-9) return null;
      K = [A, B, [B[0] + n[0] * h, B[1] + n[1] * h], [A[0] + n[0] * h, A[1] + n[1] * h]];
    } else if (tool === 'crect3') {
      var b = (C[0] - A[0]) * n[0] + (C[1] - A[1]) * n[1];
      if (Math.abs(b) < 1e-9) return null;
      K = [[A[0] - u[0] - n[0] * b, A[1] - u[1] - n[1] * b], [B[0] - n[0] * b, B[1] - n[1] * b], [B[0] + n[0] * b, B[1] + n[1] * b], [A[0] - u[0] + n[0] * b, A[1] - u[1] + n[1] * b]];
    } else {
      if (Math.abs((C[0] - B[0]) * n[0] + (C[1] - B[1]) * n[1]) < 1e-9) return null;   // the three corners in a line
      K = [A, B, C, [A[0] + C[0] - B[0], A[1] + C[1] - B[1]]];
    }
    // counter-clockwise, so edge k runs from corner k to corner k + 1 the same way round for every type
    var area = 0;
    for (var k = 0; k < 4; k++) area += K[k][0] * K[(k + 1) % 4][1] - K[(k + 1) % 4][0] * K[k][1];
    if (area < 0) K = [K[1], K[0], K[3], K[2]];
    return K.map(function (q) { return [clean(q[0]), clean(q[1])]; });
  }
  function centerOf(K) { return [clean((K[0][0] + K[2][0]) / 2), clean((K[0][1] + K[2][1]) / 2)]; }
  function mid(a, b) { return [clean((a[0] + b[0]) / 2), clean((a[1] + b[1]) / 2)]; }
  function lineOf(a, b, con) { var e = { t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }; if (con) e.construction = true; return e; }
  // the construction lines of a rectangle with corners K: the diagonals (From Corners) or the lines joining the
  // midpoints of opposite sides (From Midpoints)
  function consLines(K) {
    return RS.fromMid ? [lineOf(mid(K[0], K[1]), mid(K[2], K[3]), true), lineOf(mid(K[1], K[2]), mid(K[3], K[0]), true)]
      : [lineOf(K[0], K[2], true), lineOf(K[1], K[3], true)];
  }
  function previewRect(tool, all) {
    if (all.length < 3) return [{ t: 'line', x1: all[0][0], y1: all[0][1], x2: all[1][0], y2: all[1][1], construction: tool === 'crect3' }];
    var K = rectGeom(tool, all);
    if (!K) return [{ t: 'line', x1: all[0][0], y1: all[0][1], x2: all[1][0], y2: all[1][1] }];
    var out = [0, 1, 2, 3].map(function (k) { return lineOf(K[k], K[(k + 1) % 4]); });
    if (RS.cons[tool]) out = out.concat(consLines(K));
    return out;
  }
  // 3 Point Corner / 3 Point Center Rectangle and Parallelogram: four lines, Coincident corners, Parallel opposite
  // sides and (rectangles) a Perpendicular corner, plus the construction lines and, for the center type, a center
  // point; then what SolidWorks infers where the corners land (Coincident, Horizontal / Vertical, …)
  function commitRectLines(tool, pts, typed) {
    var f = sketch(), S = SS();
    if (!f || !S) return true;
    var K = rectGeom(tool, pts);
    if (!K) { UI.setStatus('That ' + (tool === 'parallelogram' ? 'parallelogram' : 'rectangle') + ' would have no width or height: start it again, with the last point off the first side.'); return true; }
    markDirty();
    var n0 = f.entities.length, L = [0, 1, 2, 3].map(function (k) { return n0 + k; }), rels = (f.rels = f.rels || []);
    for (var k = 0; k < 4; k++) f.entities.push(lineOf(K[k], K[(k + 1) % 4]));
    for (k = 0; k < 4; k++) rels.push({ type: 'coincident', refs: [L[k] + '.p2', L[(k + 1) % 4] + '.p1'] });
    rels.push({ type: 'parallel', refs: [String(L[0]), String(L[2])] }, { type: 'parallel', refs: [String(L[1]), String(L[3])] });
    if (tool !== 'parallelogram') rels.push({ type: 'perpendicular', refs: [String(L[0]), String(L[1])] });
    var cons = [], center = null;
    if (RS.cons[tool]) {
      consLines(K).forEach(function (e, j) {
        var ci = f.entities.length;
        f.entities.push(e); cons.push(ci);
        if (RS.fromMid) { rels.push({ type: 'midpoint', refs: [ci + '.p1', String(L[j])] }, { type: 'midpoint', refs: [ci + '.p2', String(L[j + 2])] }); }
        else { rels.push({ type: 'coincident', refs: [ci + '.p1', L[j] + '.p1'] }, { type: 'coincident', refs: [ci + '.p2', L[j + 2] + '.p1'] }); }
      });
      if (isCenter(tool)) {
        // the center point: Midpoint of the first construction line (the second crosses it there anyway)
        var C = centerOf(K);
        center = f.entities.length;
        f.entities.push({ t: 'point', x: C[0], y: C[1] });
        rels.push({ type: 'midpoint', refs: [String(center), String(cons[0])] });
      }
    }
    // lane C, fidelity #8: only the corners (center) the clicks placed infer Coincident / Midpoint …: a 3 Point
    // rectangle's computed corners do not, even where they land on a line (the third click of a 3 Point Corner
    // Rectangle sets the height and is no corner; a Parallelogram's is)
    var io = { placed: pts.map(function (p) { return [p[0], p[1]]; }) };
    L.forEach(function (i) { S.infer(f, i, io); });
    if (center != null) S.infer(f, center, io);
    // typed values (the on-screen box) become driving dimensions: the first side, then the second
    if (typed) {
      var off = dimOff(), first = tool === 'crect3' ? typed.w : typed.len;
      if (first != null) typedDim(f, { e: L[0], k: 'len', off: -off });
      if (typed.h != null) typedDim(f, { e: L[1], k: 'len', off: -off });
    }
    lastRect = { tool: tool, lines: L, cons: cons, center: center };
    refresh();
    rectFieldsNow();
    UI.setStatus(RECT_TYPES.filter(function (t) { return t[0] === tool; })[0][1] + ' added: 4 lines' + (cons.length ? ', ' + cons.length + ' construction lines' : '') + (center != null ? ' and a center point' : '') + '.');
    return true;
  }
  // A Corner / Center Rectangle just drawn (ui-sketch.js placePoint commits it as one rect / crect entity, with the
  // relations it inferred and the typed W / H dimensions): it becomes four lines held by 2 Horizontal + 2 Vertical and
  // corner Coincidents, as SolidWorks draws it (lane C, fidelity #13: an edge selects as a line, Display/Delete lists
  // the H / V, and deleting one lets the rectangle skew), plus its construction lines (diagonals tied to the corners,
  // or midpoint lines to the sides' midpoints) and, for the Center Rectangle, a center point. The typed W / H become
  // the length dimensions of the bottom / left lines (SketchSolver.explodeRect). Then the relations are inferred again
  // for the points the clicks placed only (lane C, fidelity #8: a rectangle started on a line gets one Coincident,
  // not one for each corner that lies on the line). A script's .rect() stays one entity (Kernel / generateScript).
  function afterRectEntity(f, n0, st) {
    var e = f.entities[n0], S = SS();
    if (!e || (e.t !== 'rect' && e.t !== 'crect') || !S) return;
    var tool = e.t, cons = [], center = null;
    // the rectangle is new, so every relation on it was inferred by addEntity (for its placed corners, rfH): they go,
    // and are inferred again below on the four lines, for the placed points only
    if (f.rels) {
      f.rels = f.rels.filter(function (rel) { return !rel.refs.some(function (r) { return refEntity(r) === n0; }); });
      if (!f.rels.length) delete f.rels;
    }
    if (S.explodeRect(f, n0) < 0) return;
    var L = [n0, n0 + 1, n0 + 2, n0 + 3], K = L.map(function (i) { return [f.entities[i].x1, f.entities[i].y1]; });
    var rels = (f.rels = f.rels || []);
    if (RS.cons[tool]) {
      consLines(K).forEach(function (l, j) {
        var ci = f.entities.length;
        if (e.layer != null) l.layer = e.layer;   // sketch-layers: on the rectangle's layer
        f.entities.push(l); cons.push(ci);
        if (RS.fromMid) rels.push({ type: 'midpoint', refs: [ci + '.p1', String(L[j])] }, { type: 'midpoint', refs: [ci + '.p2', String(L[j + 2])] });
        else rels.push({ type: 'coincident', refs: [ci + '.p1', L[j] + '.p1'] }, { type: 'coincident', refs: [ci + '.p2', L[j + 2] + '.p1'] });
      });
      if (tool === 'crect') {
        // the center point: Midpoint of the first construction line (the second crosses it there anyway)
        var C = centerOf(K);
        center = f.entities.length;
        var cp = { t: 'point', x: C[0], y: C[1] };
        if (e.layer != null) cp.layer = e.layer;
        f.entities.push(cp);
        rels.push({ type: 'midpoint', refs: [String(center), String(cons[0])] });
      }
    }
    var placed = st && st.pts && st.pts.length ? st.pts.map(function (p) { return [p[0], p[1]]; }) : null, io = placed ? { placed: placed } : undefined;
    L.forEach(function (i) { S.infer(f, i, io); });
    if (center != null) S.infer(f, center, io);
    if (f.rels && !f.rels.length) delete f.rels;
    lastRect = { tool: tool, lines: L, cons: cons, center: center };
    refresh();
    rectFieldsNow();
    UI.setStatus(RECT_TYPES.filter(function (t) { return t[0] === tool; })[0][1] + ' added: 4 lines' + (cons.length ? ', ' + cons.length + ' construction lines' : '') + (center != null ? ' and a center point' : '') + '.');
  }
  // the corner / center refs of the rectangle just drawn
  function rectRefs(r) {
    if (!r) return null;
    if (r.i != null) return { corners: [0, 1, 2, 3].map(function (k) { return r.i + '.v' + k; }), center: r.tool === 'crect' ? r.i + '.c' : null };
    return { corners: r.lines.map(function (i) { return i + '.p1'; }), center: r.center != null ? String(r.center) : null };
  }
  function rectAlive(f, r) {
    if (!f || !r) return false;
    if (r.i != null) return !!(f.entities[r.i] && f.entities[r.i].t === r.tool);
    return r.lines.every(function (i) { return f.entities[i] && f.entities[i].t === 'line'; }) && (r.center == null || (f.entities[r.center] && f.entities[r.center].t === 'point'));
  }
  function cornerVals(K, C) {
    var v = {};
    K.forEach(function (q, k) { v['x' + (k + 1)] = clean(q[0]); v['y' + (k + 1)] = clean(q[1]); });
    if (C) { v.cx = clean(C[0]); v.cy = clean(C[1]); }
    return v;
  }
  function rectVals(f, r) {
    var S = SS(), refs = rectRefs(r);
    if (!refs || !rectAlive(f, r)) return null;
    var K = refs.corners.map(function (ref) { return S.refPoint(f, ref); });
    return cornerVals(K, isCenter(r.tool) ? (refs.center ? S.refPoint(f, refs.center) : centerOf(K)) : null);
  }
  function rectFieldsNow() { var f = sketch(), v = rectVals(f, lastRect); if (v && rectPMOpen()) syncFields(v); }
  function rectPMOpen() { var s = UI.pmSpec && UI.pmSpec(); return !!(s && s.rectPM); }
  // Drive a corner (k 0..3) or the center (k = 'c') of rectangle r to coordinate axis ax = val.
  function driveRect(f, r, k, ax, val) {
    var S = SS(), refs = rectRefs(r);
    if (!refs || !rectAlive(f, r) || !isFinite(val)) return { ok: false, error: 'The rectangle is gone.' };
    if (r.i != null) {
      // a Corner / Center Rectangle entity: the opposite corner stays where it is (the center moves the whole rectangle)
      var e = f.entities[r.i], K = refs.corners.map(function (ref) { return S.refPoint(f, ref); }), t = {};
      if (k === 'c') {
        var C = S.refPoint(f, refs.center), d = [ax === 0 ? val - C[0] : 0, ax === 1 ? val - C[1] : 0];
        if (e.t === 'crect') { t.cx = e.cx + d[0]; t.cy = e.cy + d[1]; t.w = e.w; t.h = e.h; }
        else { t.x = e.x + d[0]; t.y = e.y + d[1]; t.w = e.w; t.h = e.h; }
      } else {
        var P = K[k].slice(), O = K[(k + 2) % 4];
        P[ax] = val;
        var w = Math.abs(P[0] - O[0]), h = Math.abs(P[1] - O[1]);
        if (w < 1e-9 || h < 1e-9) return { ok: false, error: 'The rectangle would have no width or height.' };
        if (e.t === 'crect') { t.cx = (P[0] + O[0]) / 2; t.cy = (P[1] + O[1]) / 2; } else { t.x = Math.min(P[0], O[0]); t.y = Math.min(P[1], O[1]); }
        t.w = w; t.h = h;
      }
      var keys = Object.keys(t);
      return S.driveEntity(f, r.i, keys.length, function (E) { return keys.map(function (q) { return E[r.i][q] - t[q]; }); }, { guess: function (E) { keys.forEach(function (q) { E[r.i][q] = clean(t[q]); }); } });
    }
    // four lines: that corner's point (the lines meeting there follow through the Coincident); the center (no
    // center point) is the mean of the corners
    if (k === 'c' && !refs.center) {
      return S.driveEntity(f, r.lines[0], 1, function (E) {
        var s = 0;
        refs.corners.forEach(function (ref) { s += S.refPoint({ entities: E }, ref)[ax]; });
        return [s / 4 - val];
      }, { ents: r.lines.slice() });
    }
    var ref = k === 'c' ? refs.center : refs.corners[k], ei = refEntity(ref);
    return S.driveEntity(f, ei, 1, function (E) { return [S.refPoint({ entities: E }, ref)[ax] - val]; });
  }
  UI.driveSketchRectangle = function (k, ax, val) { var f = sketch(); if (!f) return { ok: false }; markDirty(); var r = driveRect(f, lastRect, k, ax, val); refresh(); return r; };

  function rectParamFields(center) {
    var out = [];
    for (var k = 1; k <= 4; k++) out.push({ type: 'number', key: 'x' + k, label: 'Corner ' + k + ' X', unit: 'u' }, { type: 'number', key: 'y' + k, label: 'Corner ' + k + ' Y', unit: 'u' });
    if (center) out.push({ type: 'number', key: 'cx', label: 'Center X', unit: 'u' }, { type: 'number', key: 'cy', label: 'Center Y', unit: 'u' });
    return out;
  }
  // a typed corner / center value: k index from the field key
  function rectFieldEdit(f, r, key, val) {
    var m = /^([xy])([1-4])$/.exec(key), c = /^c([xy])$/.exec(key);
    if (!m && !c) return null;
    return driveRect(f, r, m ? +m[2] - 1 : 'c', (m ? m[1] : c[1]) === 'x' ? 0 : 1, val);
  }
  function openRectanglePM(tool) {
    var f = sketch();
    var v = { type: tool, cons: !!RS.cons[tool], fromMid: !!RS.fromMid };
    var cur = f && lastRect && lastRect.tool === tool ? rectVals(f, lastRect) : null;
    if (cur) Object.keys(cur).forEach(function (k) { v[k] = cur[k]; });
    UI.openPM({
      title: 'Rectangle', icon: tool, sketchTool: tool, rectPM: true, noFocus: true, keepSelection: true, values: v,
      groups: [
        { title: 'Rectangle Type', fields: [
          { type: 'iconRadio', key: 'type', label: '', options: RECT_TYPES },
          { type: 'check', key: 'cons', label: 'Add construction lines', rerender: true },
          { type: 'radio', key: 'fromMid', options: [[false, 'From Corners'], [true, 'From Midpoints']], show: function (x) { return !!x.cons; } }] },
        { title: 'Parameters', fields: rectParamFields(isCenter(tool)) }
      ],
      onChange: function (x, key) {
        if (!key) return;
        if (key === 'type') {
          if (x.type !== App.tool) { var to = x.type; UI.withToolPM(function () { UI.setTool(to); }); }
          return;
        }
        if (key === 'cons') { RS.cons[App.tool] = !!x.cons; return; }
        if (key === 'fromMid') { RS.fromMid = x.fromMid === true || x.fromMid === 'true'; return; }
        var f2 = sketch();
        if (!f2 || !rectAlive(f2, lastRect)) { refused('Draw a rectangle first: the Parameters drive the rectangle just drawn.'); return; }
        markDirty();
        var r = rectFieldEdit(f2, lastRect, key, +x[key]);
        if (!r) return;
        if (!r.ok) { refused(r.error); return; }
        pmNote(null);
        refresh();
        var nv = rectVals(f2, lastRect);
        if (nv) syncFields(nv, key);
      },
      onOK: function () { if (App.tool === tool) UI.setTool('select'); },
      onCancel: function () { if (App.tool === tool) UI.setTool('select'); }
    });
    hint(RECT_HINT[tool]);
  }
  RECT_TYPES.forEach(function (t) { UI.sketchToolPMs[t[0]] = openRectanglePM; });
  // live Parameters while drawing: the corners (and center) of the rectangle under the cursor
  function rectLive(pts, p, temp) {
    if (!rectPMOpen()) return;
    var t = App.tool, K = null, C = null, e = temp && temp[0];
    if ((t === 'rect' || t === 'crect') && e && (e.t === 'rect' || e.t === 'crect')) {
      K = e.t === 'rect' ? [[e.x, e.y], [e.x + e.w, e.y], [e.x + e.w, e.y + e.h], [e.x, e.y + e.h]]
        : [[e.cx - e.w / 2, e.cy - e.h / 2], [e.cx + e.w / 2, e.cy - e.h / 2], [e.cx + e.w / 2, e.cy + e.h / 2], [e.cx - e.w / 2, e.cy + e.h / 2]];
    } else if (pts.length >= 2) K = rectGeom(t, pts.concat([p]));
    if (!K) return;
    if (isCenter(t)) C = centerOf(K);
    syncFields(cornerVals(K, C));
  }
  ['rect', 'crect'].forEach(function (t) { UI.sketchToolHooks[t] = { live: rectLive, after: function (f, n0, st) { afterRectEntity(f, n0, st); } }; });
  // 3 Point Corner / 3 Point Center Rectangle, Parallelogram: three clicks; typed values in the on-screen box
  function sideFrame() {
    var pts = App.toolState.pts, A = pts[0], B = pts[1];
    if (!A || !B) return null;
    var u = [B[0] - A[0], B[1] - A[1]], L = Math.hypot(u[0], u[1]) || 1;
    return { A: A, B: B, u: [u[0] / L, u[1] / L], n: [-u[1] / L, u[0] / L], L: L };
  }
  function threePointHooks(tool) {
    return {
      steps: function () { return 3; },
      entities: function (pts, cur, all) { return previewRect(tool, all); },
      commit: function (ents, st, typed) { return commitRectLines(tool, st.pts.slice(), typed); },
      live: rectLive,
      numFields: function (n) {
        if (n === 1) return tool === 'crect3' ? [['W', 'w'], ['A', 'ang']] : [['L', 'len'], ['A', 'ang']];
        return tool === 'parallelogram' ? [['L', 'h'], ['A', 'ang']] : [['H', 'h']];
      },
      liveValues: function (p) {
        var pts = App.toolState.pts, A = pts[0];
        if (!A) return null;
        if (pts.length === 1) {
          var d = Math.hypot(p[0] - A[0], p[1] - A[1]), a = angDeg(p[0] - A[0], p[1] - A[1]);
          return tool === 'crect3' ? { w: 2 * d, ang: a } : { len: d, ang: a };
        }
        var fr = sideFrame();
        if (tool === 'parallelogram') return { h: Math.hypot(p[0] - fr.B[0], p[1] - fr.B[1]), ang: angDeg(p[0] - fr.B[0], p[1] - fr.B[1]) };
        var hh = Math.abs((p[0] - fr.A[0]) * fr.n[0] + (p[1] - fr.A[1]) * fr.n[1]);
        return { h: tool === 'crect3' ? 2 * hh : hh };
      },
      typedPoint: function (cur, v) {
        var pts = App.toolState.pts, A = pts[0];
        if (!A) return null;
        if (pts.length === 1) {
          var len = tool === 'crect3' ? (v.w != null ? v.w / 2 : null) : v.len;
          var dx = cur[0] - A[0], dy = cur[1] - A[1];
          if (len == null) len = Math.hypot(dx, dy);
          var ang = v.ang != null ? v.ang * D2R : (Math.hypot(dx, dy) > 1e-12 ? Math.atan2(dy, dx) : 0);
          return [clean(A[0] + len * Math.cos(ang)), clean(A[1] + len * Math.sin(ang))];
        }
        var fr = sideFrame();
        if (tool === 'parallelogram') {
          var ex = cur[0] - fr.B[0], ey = cur[1] - fr.B[1], l2 = v.h != null ? v.h : Math.hypot(ex, ey);
          var a2 = v.ang != null ? v.ang * D2R : (Math.hypot(ex, ey) > 1e-12 ? Math.atan2(ey, ex) : 0);
          return [clean(fr.B[0] + l2 * Math.cos(a2)), clean(fr.B[1] + l2 * Math.sin(a2))];
        }
        if (v.h == null) return cur;
        var side = (cur[0] - fr.A[0]) * fr.n[0] + (cur[1] - fr.A[1]) * fr.n[1] < 0 ? -1 : 1, hh = (tool === 'crect3' ? v.h / 2 : v.h) * side;
        return [clean(fr.B[0] + fr.n[0] * hh), clean(fr.B[1] + fr.n[1] * hh)];
      },
      readout: function (pts, p) {
        var lv = this.liveValues(p), inch = UI.unitLabel() === 'in', n = function (x) { return UI.fmtNum(x, inch ? 3 : 2); };
        if (!lv) return null;
        if (pts.length === 1) return (lv.w != null ? 'W ' + n(lv.w) : 'L ' + n(lv.len)) + '   A ' + UI.fmtNum(lv.ang, 1) + '°';
        if (tool === 'parallelogram') return 'L ' + n(lv.h) + '   A ' + UI.fmtNum(lv.ang, 1) + '°';
        var fr = sideFrame();
        return n(tool === 'crect3' ? 2 * fr.L : fr.L) + ' × ' + n(lv.h);
      }
    };
  }
  ['rect3', 'crect3', 'parallelogram'].forEach(function (t) { UI.sketchToolHooks[t] = threePointHooks(t); });

  // A selected Corner / Center Rectangle entity: its relations, For construction and the corner (center) Parameters.
  function openRectEntityPM(index) {
    var f = sketch(), e = f && f.entities[index];
    if (!e) return;
    var r = { tool: e.t, i: index }, v = rectVals(f, r) || {};
    v.construction = !!e.construction;
    var reopen = function () { if (App.mode === 'sketch' && f.entities[index] && f.entities[index].t === e.t) openRectEntityPM(index); };
    UI.openPM({
      title: e.t === 'crect' ? 'Center Rectangle' : 'Corner Rectangle', icon: e.t, values: v, noFocus: true, entityIndex: index,
      groups: relationGroups(f, [String(index)], reopen).concat([
        { title: 'Options', fields: [{ type: 'check', key: 'construction', label: 'For construction' }] },
        { title: 'Parameters', fields: rectParamFields(e.t === 'crect') }
      ]),
      onChange: function (x, key) {
        if (!key) return;
        var f2 = sketch(), cur = f2 && f2.entities[index];
        if (!cur || cur.t !== e.t) return;
        markDirty();
        if (key === 'construction') { if (x.construction) cur.construction = true; else delete cur.construction; refresh(); return; }
        var res = rectFieldEdit(f2, r, key, +x[key]);
        if (!res) return;
        if (!res.ok) { refused(res.error); return; }
        pmNote(null);
        refresh();
        var nv = rectVals(f2, r);
        if (nv) syncFields(nv, key);
      },
      onOK: function () { App.sel = null; UI.updateSketches(); }
    });
  }
  UI.sketchEntityPMs.rect = openRectEntityPM;
  UI.sketchEntityPMs.crect = openRectEntityPM;

  // ------------------------------------------------------------------ Point
  var lastPoint = null;   // the point just placed with the Point tool (its index)
  function drivePoint(f, i, key, val) {
    var S = SS();
    if (!f.entities[i] || f.entities[i].t !== 'point' || !isFinite(val)) return { ok: false, error: 'Not a value.' };
    return S.driveEntity(f, i, 1, function (E) { return [E[i][key] - val]; }, { guess: function (E) { E[i][key] = val; } });
  }
  function pointChange(getIndex) {
    return function (x, key) {
      if (key !== 'x' && key !== 'y') return;
      var f = sketch(), i = getIndex();
      if (!f || i == null || !f.entities[i] || f.entities[i].t !== 'point') { refused('Place a point first: X and Y move the point just placed.'); return; }
      markDirty();
      var r = drivePoint(f, i, key, +x[key]);
      if (!r.ok) { refused(r.error); return; }
      pmNote(null);
      refresh();
      syncFields({ x: clean(f.entities[i].x), y: clean(f.entities[i].y) }, key);
    };
  }
  UI.sketchToolPMs.point = function () {
    lastPoint = null;   // X / Y fill in with the first point placed
    UI.openPM({
      title: 'Point', icon: 'point', sketchTool: 'point', noFocus: true, keepSelection: true, values: { x: null, y: null },
      groups: [{ title: 'Parameters', fields: [{ type: 'number', key: 'x', label: 'X', unit: 'u' }, { type: 'number', key: 'y', label: 'Y', unit: 'u' }] }],
      onChange: pointChange(function () { return lastPoint; }),
      onOK: function () { if (App.tool === 'point') UI.setTool('select'); },
      onCancel: function () { if (App.tool === 'point') UI.setTool('select'); }
    });
  };
  UI.sketchToolHooks.point = {
    after: function (f, n0) {
      var e = f.entities[n0];
      if (!e || e.t !== 'point') return;
      lastPoint = n0;
      var s = UI.pmSpec && UI.pmSpec();
      if (s && s.sketchTool === 'point') syncFields({ x: clean(e.x), y: clean(e.y) });
    }
  };
  function openPointProperties(index) {
    var f = sketch(), e = f && f.entities[index];
    if (!e) return;
    var reopen = function () { if (App.mode === 'sketch' && f.entities[index] && f.entities[index].t === 'point') openPointProperties(index); };
    UI.openPM({
      title: 'Point', icon: 'point', values: { x: clean(e.x), y: clean(e.y) }, noFocus: true, entityIndex: index,
      groups: relationGroups(f, [String(index)], reopen).concat([{ title: 'Parameters', fields: [{ type: 'number', key: 'x', label: 'X', unit: 'u' }, { type: 'number', key: 'y', label: 'Y', unit: 'u' }] }]),
      onChange: pointChange(function () { return index; }),
      onOK: function () { App.sel = null; UI.updateSketches(); }
    });
  }
  UI.sketchEntityPMs.point = openPointProperties;

  // ------------------------------------------------------------------ Parallel Line
  // Mastercam's Line Parallel with a SolidWorks PropertyManager (Sketch tab ▸ Line flyout ▸ Parallel Line). Reference:
  // a sketch line (or one edge of a rectangle, polygon or polyline) or a straight model edge, projected onto the sketch
  // plane as Convert Entities does. Placement: Through point (the line follows the cursor through the normal sketch
  // inference, so it can pass through an existing point: Coincident there), Distance (on the cursor's side; Flip side,
  // Both sides; a click or ✓ places) or Tangent to arc (click a circle / arc: tangent to it on the side nearest the
  // click, with a Tangent relation). Length: Same as reference (its ends carried straight across) or a set Length
  // centred on the reference's midpoint. To a sketch line the new line is held Parallel, with a distance dimension
  // (Add dimensions); a model edge gets neither (sketches hold no external references). The reference stays picked
  // after each line so the next click places another; ✓ / Esc ends. Each placement is one undo step.
  var PL_PICK = 'stroke:#2d7dd2;stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:0.75';
  var PL_HOT = 'stroke:#e8891c;stroke-width:2.5;fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:0.9';
  // the settings, remembered for the session as SolidWorks remembers a PropertyManager's
  var PLS = { place: 'point', d: null, flip: false, both: false, lenMode: 'same', len: null, construction: false, dims: true };
  var PL_HINT = {
    ref: 'Select a line or edge to be parallel to.',
    point: 'Click where the line passes through.',
    distance: 'Click on the side the line goes, or press ✓ to place it on the side shown.',
    tangent: 'Select a circle or arc to be tangent to.'
  };
  UI.parallelLineActive = function () { var s = UI.pmSpec && UI.pmSpec(); return !!(s && s.parallelLine); };
  UI.cmdParallelLine = function () {
    if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; }
    if (UI.parallelLineActive()) { UI.pmCancel(); return; }
    openParallelLine();
  };
  function plScr(q) { return UI.worldToScreen(UI.K.to3D(UI.activePlane(), q[0], q[1])); }
  function segPx(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }
  // the sketch line under the cursor as a ref: a line, or the nearest edge of a rectangle / polygon / polyline (a
  // slot's own ref is its centre line, not a side, so slots are left out)
  function lineRefAt(f, mx, my) {
    var S = SS(), hit = UI.pickEntity(mx, my), e = hit && f.entities[hit.index], best = null, bd = Infinity;
    if (!S || !e) return null;
    S.curveRefs(f, hit.index).forEach(function (r) {
      if (r === String(hit.index) && e.t !== 'line') return;
      var c = S.refCurve(f, r);
      if (!c || c.kind !== 'line') return;
      var d = segPx([mx, my], plScr(c.a), plScr(c.b));
      if (d < bd) { bd = d; best = { r: r, seg: { a: c.a.slice(), b: c.b.slice() } }; }
    });
    return best;
  }
  // a straight model edge under the cursor projected onto the sketch plane, the collinear pieces it was split into
  // joined (a face outline splits an edge): { seg } | { bad: why } | null
  function modelEdgeAt(mx, my) {
    if (App.mode !== 'sketch' || !App.edges || !App.edges.length || !UI.pickEdge) return null;
    var pk = UI.pickEdge(mx, my), e = pk && pk.edge, V = UI.K.vec;
    if (!e || !e.a || !e.b) return null;
    if (e.curve != null && App.curves && App.curves[e.curve]) return { bad: 'Select a straight edge: a Parallel Line follows a line or a straight edge.' };
    var d = V.sub(e.b, e.a), L = V.len(d);
    if (L < 1e-12) return null;
    var u = V.scale(d, 1 / L), tol = 1e-6 * Math.max(1, L), lo = 0, hi = L, spans = [];
    App.edges.forEach(function (o) {
      if (o === e || o.smooth || !o.a || !o.b || (o.curve != null && App.curves && App.curves[o.curve])) return;
      var off = function (p) { var w = V.sub(p, e.a); return V.len(V.sub(w, V.scale(u, V.dot(w, u)))); };
      if (off(o.a) > tol || off(o.b) > tol) return;
      var ta = V.dot(V.sub(o.a, e.a), u), tb = V.dot(V.sub(o.b, e.a), u);
      spans.push([Math.min(ta, tb), Math.max(ta, tb)]);
    });
    for (var grew = true; grew;) {
      grew = false;
      spans.forEach(function (s) {
        if (s[1] > hi + 1e-9 && s[0] <= hi + tol) { hi = s[1]; grew = true; }
        if (s[0] < lo - 1e-9 && s[1] >= lo - tol) { lo = s[0]; grew = true; }
      });
    }
    var pl = UI.activePlane(), r6 = function (x) { return Math.round(x * 1e6) / 1e6; };
    var a = UI.K.to2D(pl, V.add(e.a, V.scale(u, lo))), b = UI.K.to2D(pl, V.add(e.a, V.scale(u, hi)));
    a = [r6(a[0]), r6(a[1])]; b = [r6(b[0]), r6(b[1])];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) return { bad: 'That edge is square to the sketch plane: select an edge that lies along it.' };
    return { seg: { a: a, b: b } };
  }
  // the reference a click at (mx, my) would pick: sketch geometry first, then a model edge
  function plCandidate(f, mx, my) {
    var lr = lineRefAt(f, mx, my), S = SS();
    if (lr) { var nm = 'Line'; try { nm = S.refName(f, lr.r); } catch (e) { } return { kind: 'sketch', r: lr.r, seg: lr.seg, label: nm }; }
    var hit = UI.pickEntity(mx, my);
    if (hit && f.entities[hit.index]) return { bad: 'Select a line or a straight edge: a Parallel Line follows a line.' };
    var me = modelEdgeAt(mx, my);
    if (me && me.seg) return { kind: 'edge', seg: me.seg, label: 'Edge<1>' };
    return me;
  }
  // the reference's segment now (a sketch line is read again: a solve or an undo may have moved it), as a frame:
  // { a, b, u (along), n (left normal), L } or null
  function plFrame(f, ref) {
    var seg = null;
    if (ref && ref.kind === 'sketch') { var c = SS().refCurve(f, ref.r); if (c && c.kind === 'line') seg = { a: c.a, b: c.b }; }
    else if (ref) seg = ref.seg;
    if (!seg) return null;
    var dx = seg.b[0] - seg.a[0], dy = seg.b[1] - seg.a[1], L = Math.hypot(dx, dy);
    return L < 1e-12 ? null : { a: seg.a, b: seg.b, u: [dx / L, dy / L], n: [-dy / L, dx / L], L: L };
  }
  function plSide(fr, P) { return (P[0] - fr.a[0]) * fr.n[0] + (P[1] - fr.a[1]) * fr.n[1]; }
  function openParallelLine() {
    var f0 = sketch();
    if (!f0) return;
    if (PLS.d == null) PLS.d = UI.lenDefault(10);
    var v = { place: PLS.place, d: PLS.d, flip: PLS.flip, both: PLS.both, lenMode: PLS.lenMode, len: PLS.len, construction: PLS.construction, dims: PLS.dims, box: 'ref' };
    var ref = null, last = null, fresh = true, count = 0;
    // a sketch line selected when the command starts is the reference (as SolidWorks takes a preselection)
    var pre = (UI.selection ? UI.selection() : []).filter(function (s) { return s.kind === 'entity'; }).map(function (s) { return s.index; });
    if (App.sel && App.sel.kind === 'entity' && pre.indexOf(App.sel.index) < 0) pre.push(App.sel.index);
    if (pre.length === 1 && f0.entities[pre[0]] && f0.entities[pre[0]].t === 'line') {
      var pc = SS().refCurve(f0, String(pre[0]));
      ref = { kind: 'sketch', r: String(pre[0]), seg: { a: pc.a, b: pc.b }, label: SS().refName(f0, String(pre[0])) };
      v.box = null;
    }
    function picking() { return !ref || v.box === 'ref'; }
    function hintNow() { var t = PL_HINT[picking() ? 'ref' : v.place]; hint('<b>Parallel Line:</b> ' + t); UI.setStatus(t); }
    function clearRef() { ref = null; v.box = 'ref'; fresh = true; UI.renderPM(); hintNow(); draw(); }
    // the line through offset s (signed, along the reference's left normal)
    function lineAt(fr, s) {
      var a, b;
      if (v.lenMode === 'length' && +v.len > 0) {
        var m = [(fr.a[0] + fr.b[0]) / 2 + fr.n[0] * s, (fr.a[1] + fr.b[1]) / 2 + fr.n[1] * s], h = +v.len / 2;
        a = [m[0] - fr.u[0] * h, m[1] - fr.u[1] * h]; b = [m[0] + fr.u[0] * h, m[1] + fr.u[1] * h];
      } else { a = [fr.a[0] + fr.n[0] * s, fr.a[1] + fr.n[1] * s]; b = [fr.b[0] + fr.n[0] * s, fr.b[1] + fr.n[1] * s]; }
      var e = { t: 'line', x1: clean(a[0]), y1: clean(a[1]), x2: clean(b[0]), y2: clean(b[1]) };
      if (v.construction) e.construction = true;
      return e;
    }
    // what a click at uv (screen mx, my) would place: { s: [offsets], P: through point, info, tan: circle index } or
    // { error }
    function offsets(f, fr, uv, mx, my) {
      var o;
      if (v.place === 'distance') {
        var d = +v.d;
        if (!(d > 0)) return { error: 'Set a distance greater than 0.' };
        var side = uv && plSide(fr, uv) < 0 ? -1 : 1;
        if (v.flip) side = -side;
        o = { s: v.both ? [side * d, -side * d] : [side * d] };
      } else if (v.place === 'tangent') {
        var hit = mx != null ? UI.pickEntity(mx, my) : null, c = hit && f.entities[hit.index];
        if (!c || (c.t !== 'circle' && c.t !== 'arc')) return { error: PL_HINT.tangent };
        var sc = plSide(fr, [c.cx, c.cy]), sq = uv ? plSide(fr, uv) : sc - c.r;
        o = { s: [Math.abs(sq - (sc - c.r)) <= Math.abs(sq - (sc + c.r)) ? sc - c.r : sc + c.r], tan: hit.index };
      } else {
        if (!uv) return { error: PL_HINT.point };
        var info = UI.sketchInferPoint ? UI.sketchInferPoint(uv, mx, my) : { p: uv };
        o = { s: [plSide(fr, info.p)], P: info.p, info: info };
      }
      o.s = o.s.map(function (s) { return clean(s); });
      if (o.s.some(function (s) { return Math.abs(s) < 1e-9; })) { o.error = 'The line would lie on the reference: place it off the reference.'; o.s = o.s.filter(function (s) { return Math.abs(s) >= 1e-9; }); }
      return o;
    }
    function draw() {
      var f = UI.activeSketchFeature();
      if (!f || !UI.sketchFeedbackClear) return;
      UI.sketchFeedbackClear();
      App.tempEntities = [];
      var fr = ref ? plFrame(f, ref) : null;
      if (ref && !fr) { ref = null; v.box = 'ref'; UI.renderPM(); hintNow(); }
      if (picking()) {
        var c = last ? plCandidate(f, last.mx, last.my) : null;
        if (fr) UI.sketchPreview([[fr.a, fr.b]], PL_PICK, 'sk-trim-pick');
        if (c && c.seg) UI.sketchPreview([[c.seg.a, c.seg.b]], PL_HOT, 'sk-trim-span');
        UI.updateTemp();
        return;
      }
      var o = v.place === 'distance' || last ? offsets(f, fr, last && last.uv, last && last.mx, last && last.my) : null;
      if (o && o.info && o.info.snap && last) UI.sketchSnapMark(o.info.p, [last.mx, last.my], o.info.snap.kind === 'on');
      UI.sketchPreview([[fr.a, fr.b]], PL_PICK, 'sk-trim-pick');
      if (o && o.tan != null && f.entities[o.tan]) UI.sketchPreview(UI.K.entityPolylines(f.entities[o.tan]).map(function (l) { return l.closed && l.pts.length ? l.pts.concat([l.pts[0]]) : l.pts; }), PL_HOT, 'sk-trim-span');
      if (o && o.s) App.tempEntities = o.s.map(function (s) { return lineAt(fr, s); });
      UI.updateTemp();
    }
    // the line(s) of o into the sketch, with their relations and dimensions: one undo step; false when refused
    function place(o) {
      var f = UI.activeSketchFeature(), S = SS(), fr = f && plFrame(f, ref);
      if (!f || !fr || !S) return false;
      if (o.error) { UI.setStatus(o.error); if (!o.s || !o.s.length) return false; }
      if (!o.s || !o.s.length) return false;
      var saved = JSON.stringify({ entities: f.entities, rels: f.rels || null }), n0 = f.entities.length, skipped = 0;
      UI.pushUndo(); App.sketchDirty = true;
      var fail = null;
      try {
        o.s.forEach(function (s) { f.entities.push(lineAt(fr, s)); });
        o.s.forEach(function (s, k) {
          if (fail || ref.kind !== 'sketch') return;
          var pr = S.addRelation(f, 'parallel', [ref.r, String(n0 + k)], { rejectOver: true });
          if (!pr.ok && pr.status) fail = 'Parallel would over-define the sketch: the line was not added.';
        });
        if (!fail && o.tan != null) S.addRelation(f, 'tangent', [String(n0), String(o.tan)], { rejectOver: true });
        if (!fail && o.P) { var pref = pointRefAt(f, o.P, n0); if (pref) S.addRelation(f, 'coincident', [pref, String(n0)], { rejectOver: true }); }
        if (!fail && v.dims && ref.kind === 'sketch') o.s.forEach(function (s, k) {
          var dr = S.addRelation(f, 'distance', [ref.r, String(n0 + k)], { value: Math.abs(s), rejectOver: true });
          if (!dr.ok) skipped++;
        });
      } catch (er) { fail = er.message || String(er); }
      if (fail) {
        var s0 = JSON.parse(saved);
        f.entities = s0.entities;
        if (s0.rels) f.rels = s0.rels; else delete f.rels;
        App.undo.pop(); App.sketchDirty = false;
        UI.toast(fail); refresh();
        return false;
      }
      count += o.s.length; fresh = false;
      App.tempEntities = []; UI.updateTemp();
      if (UI.afterSketchCommit) UI.afterSketchCommit(f, n0);   // sketch-hooks: Dynamic Mirror mirrors the line(s) in this step
      refresh();
      UI.setStatus('Parallel Line placed' + (o.s.length > 1 ? ' on both sides' : '') + (skipped ? ' (distance dimension left out: it would over-define the sketch)' : '') + ' (' + count + ' so far). Place another, or press ✓ / Esc to finish.');
      return true;
    }
    function pmChange(x, key) {
      if (!key) return;
      if (key === 'lenMode' && x.lenMode === 'length' && !(+x.len > 0)) {
        var fr = ref && plFrame(UI.activeSketchFeature(), ref);
        x.len = fr ? clean(fr.L) : UI.lenDefault(20);
        UI.renderPM();
      }
      Object.keys(PLS).forEach(function (k) { PLS[k] = x[k]; });
      fresh = true;
      if (key === 'place') hintNow();
      draw();
    }
    UI.openPM({
      title: 'Parallel Line', icon: 'parallelLine', parallelLine: true, noFocus: true, values: v,
      message: 'Select a line or edge to be parallel to, then place the line: through a point, at a distance or tangent to an arc.',
      command: {
        ownHover: true, dynMirror: true,   // sketch-hooks: Dynamic Mirror shows and makes the mirror image of what it places
        onSketchMove: function (uv, mx, my) { last = { uv: uv, mx: mx, my: my }; draw(); },
        onSketchPoint: function (uv, mx, my) {
          var f = UI.activeSketchFeature();
          if (!f) return;
          if (!uv) uv = UI.screenToPlane(mx, my, UI.activePlane());
          last = { uv: uv, mx: mx, my: my };
          if (picking()) {
            var c = plCandidate(f, mx, my);
            if (!c) { UI.setStatus(PL_HINT.ref); return; }
            if (c.bad) { UI.setStatus(c.bad); return; }
            ref = c; v.box = null; fresh = true;
            UI.renderPM(); hintNow(); draw();
            return;
          }
          var fr = plFrame(f, ref);
          if (!fr) { clearRef(); return; }
          var o = offsets(f, fr, uv, mx, my);
          if (o.error && (!o.s || !o.s.length)) { UI.setStatus(o.error); return; }
          place(o);
          draw();
        }
      },
      groups: [
        { title: 'Reference', fields: [{ type: 'pick', icon: 'line', placeholder: 'Line or edge',
          value: function () { return ref ? ref.label : ''; }, active: function () { return picking(); },
          onActivate: function () { v.box = 'ref'; UI.renderPM(); hintNow(); draw(); } }] },
        { title: 'Placement', fields: [
          { type: 'radio', key: 'place', rerender: true, options: [['point', 'Through point'], ['distance', 'Distance'], ['tangent', 'Tangent to arc']] },
          { type: 'number', key: 'd', label: 'Distance', unit: 'u', min: 0, show: function (x) { return x.place === 'distance'; } },
          { type: 'check', key: 'flip', label: 'Flip side', show: function (x) { return x.place === 'distance'; } },
          { type: 'check', key: 'both', label: 'Both sides', show: function (x) { return x.place === 'distance'; } }] },
        { title: 'Length', fields: [
          { type: 'radio', key: 'lenMode', rerender: true, options: [['same', 'Same as reference'], ['length', 'Length']] },
          { type: 'number', key: 'len', label: 'Length', unit: 'u', min: 0, show: function (x) { return x.lenMode === 'length'; } }] },
        { title: 'Options', fields: [{ type: 'check', key: 'construction', label: 'For construction' }, { type: 'check', key: 'dims', label: 'Add dimensions' }] }
      ],
      onChange: pmChange,
      // ✓ places the line shown in Distance (once per setting: a line already placed with these settings is not doubled)
      onOK: function () {
        if (v.place !== 'distance' || !ref || v.box === 'ref' || !fresh) return;
        var f = UI.activeSketchFeature(), fr = f && plFrame(f, ref);
        if (!fr) return;
        var o = offsets(f, fr, last && last.uv, null, null);
        if (o.error && (!o.s || !o.s.length)) { UI.toast(o.error); return false; }
        if (!place(o)) return false;
      },
      onClose: function () { App.tempEntities = []; UI.updateTemp(); if (UI.sketchFeedbackClear) UI.sketchFeedbackClear(); }
    });
    UI.refreshRibbon();
    hintNow();
    draw();
  }

  // A press in the graphics area while a sketch tool's PropertyManager is open takes the keyboard from the
  // PropertyManager (a check box or value box clicked before), so a number typed next opens the on-screen value box
  // and A / T / N reach the tool, as in SolidWorks.
  if (UI.viewport) UI.viewport.addEventListener('mousedown', function () {
    var s = UI.pmSpec && UI.pmSpec(), a = document.activeElement, pm = $('pm');
    if (App.mode === 'sketch' && s && s.sketchTool && a && pm && pm.contains(a) && a.blur) a.blur();
  }, true);
})();
